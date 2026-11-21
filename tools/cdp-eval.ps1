param(
  [Parameter(Mandatory)][string]$TargetUrlPart,   # e.g. "part=shell" or "part=desktop"
  [string]$Expression,                            # JS to evaluate
  [string]$Base64,                                # JS to evaluate, base64-encoded (use when quotes get mangled)
  [int]$TimeoutSeconds = 15
)
$ErrorActionPreference = 'Stop'
if ($Base64 -and -not $Expression) { $Expression = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Base64)) }
if (-not $Expression) { throw 'Provide -Expression or -Base64.' }
$targets = Invoke-RestMethod 'http://127.0.0.1:9222/json/list'
$target = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like "*$TargetUrlPart*" } | Select-Object -First 1
if (-not $target) { throw "No CDP target matching '$TargetUrlPart'." }

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $ct).Wait()

function Send($obj) {
  $json = $obj | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $seg = [ArraySegment[byte]]::new($bytes)
  $null = $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct)
  $null = $ws.ReceiveAsync($seg, $ct)  # response discarded by caller through Receive below
}
# Frame-based receive loop
function RecvAll {
  $ms = New-Object System.IO.MemoryStream
  $buf = New-Object byte[] (1MB)
  while ($true) {
    $seg = [ArraySegment[byte]]::new($buf)
    $r = $ws.ReceiveAsync($seg, $ct).Result
    $ms.Write($buf, 0, $r.Count)
    if ($r.EndOfMessage) { break }
  }
  [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
}

$sendJson = [System.Text.Encoding]::UTF8.GetBytes((@{ id = 1; method = 'Runtime.enable' } | ConvertTo-Json -Compress))
$null = $ws.SendAsync([ArraySegment[byte]]::new($sendJson), 'Text', $true, $ct).Result
$null = RecvAll

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$evalJson = (@{
  id = 2
  method = 'Runtime.evaluate'
  params = @{
    expression = "Promise.resolve().then(() => ($Expression))"
    awaitPromise = $true; returnByValue = $true
  }
} | ConvertTo-Json -Depth 8 -Compress)
$evalBytes = [System.Text.Encoding]::UTF8.GetBytes($evalJson)
$null = $ws.SendAsync([ArraySegment[byte]]::new($evalBytes), 'Text', $true, $ct).Result

while ([DateTime]::UtcNow -lt $deadline) {
  $msg = RecvAll
  $parsed = $msg | ConvertFrom-Json
  if ($parsed.id -eq 2) {
    if ($parsed.result.exceptionDetails) {
      $desc = $parsed.result.exceptionDetails.exception.description; if (-not $desc) { $desc = $parsed.result.exceptionDetails.text }
      Write-Output ("EXCEPTION: " + $desc)
    } else {
      Write-Output ($parsed.result.result.value | ConvertTo-Json -Depth 8 -Compress)
    }
    $ws.Dispose(); exit 0
  }
}
Write-Output 'TIMEOUT waiting for evaluate result'
$ws.Dispose(); exit 1
