param([string]$TargetUrlPart = 'part=shell')
$ErrorActionPreference = 'Stop'
$targets = Invoke-RestMethod 'http://127.0.0.1:9222/json/list'
$target = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like "*$TargetUrlPart*" } | Select-Object -First 1

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $ct).Wait()
$next = 10
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
function CmdWait($obj) {
  $id = $script:next; $script:next++
  $obj.id = $id
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $null = $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, $ct).Result
  while ($true) {
    $msg = RecvAll | ConvertFrom-Json
    if ($msg.id -eq $id) { return $msg }
  }
}
$expr = 'document.getElementById("island")'
$r = CmdWait @{ method='Runtime.evaluate'; params=@{ expression=$expr; returnByValue=$false } }
$oid = $r.result.result.objectId
$l = CmdWait @{ method='DOMDebugger.getEventListeners'; params=@{ objectId=$oid } }
$out = @()
foreach ($x in $l.result.listeners) { $out += "$($x.type) -> $($x.handler.description)" }
Write-Output ($out -join "`n")
$ws.Dispose()
