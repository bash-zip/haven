param(
  [double[]]$PathX, [double[]]$PathY, [int]$HoldMs = 120, [int]$StepMs = 30
)
$ErrorActionPreference = 'Stop'
$targets = Invoke-RestMethod 'http://127.0.0.1:9222/json/list'
$target = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like '*part=shell*' } | Select-Object -First 1

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $ct).Wait()

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
function Cmd($obj) {
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $null = $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, $ct).Result
}

$next = 10
$scripts = New-Object System.Collections.Generic.List[string]
# send a command and collect only later responses until its id
function CmdWait($obj) {
  $id = $script:next; $script:next++
  $obj.id = $id
  Cmd $obj
  while ($true) {
    $msg = RecvAll | ConvertFrom-Json
    if ($msg.id -eq $id) { return $msg }
  }
}

$null = CmdWait @{ method = 'Runtime.enable' } | Out-Null
$inst = 'window.__dbg=[];["pointerdown","pointermove","pointerup"].forEach(function(t){document.addEventListener(t,function(e){window.__dbg.push(t+"@"+e.clientX+","+e.clientY+" tgt="+((e.target&&e.target.id||e.target&&e.target.className||"?").toString().slice(0,20)))},true)})'
$null = CmdWait @{ method='Runtime.evaluate'; params=@{ expression=$inst; returnByValue=$true } } | Out-Null
$expr = '(function(){var el=document.getElementById("island");var r=el.getBoundingClientRect();return {l:r.left,t:r.top,dpr:window.devicePixelRatio,cssW:innerWidth,cssH:innerHeight,hidden:el.hidden,at:document.elementFromPoint(700,40)?document.elementFromPoint(700,40).className||document.elementFromPoint(700,40).id||document.elementFromPoint(700,40).tagName:null}})()'
$r = (CmdWait @{ method='Runtime.evaluate'; params=@{ expression=$expr; returnByValue=$true } }).result.result.value
Write-Output ("TARGET " + ($r | ConvertTo-Json -Compress))

function Mouse($type, $x, $y, $buttons) {
  $cc = 0
  if ($type -eq 'mousePressed' -or $type -eq 'mouseReleased') { $cc = 1 }
  CmdWait @{ method='Input.dispatchMouseEvent'; params=@{ type=$type; x=$x; y=$y; button='left'; buttons=$buttons; clickCount=$cc; pointerType='mouse' } } | Out-Null
}

[System.Threading.Thread]::Sleep($HoldMs)
Mouse 'mousePressed' $PathX[0] $PathY[0] 1
for ($i = 1; $i -lt $PathX.Count; $i++) {
  [System.Threading.Thread]::Sleep($StepMs)
  Mouse 'mouseMoved' $PathX[$i] $PathY[$i] 1
}
[System.Threading.Thread]::Sleep(120)
Mouse 'mouseReleased' $PathX[-1] $PathY[-1] 0

Start-Sleep -Milliseconds 1200
$expr2 = 'window.__dbg'
$r2 = (CmdWait @{ method='Runtime.evaluate'; params=@{ expression='JSON.stringify(window.__dbg||[])'; returnByValue=$true } }).result.result.value
Write-Output ("DBG " + $r2)
$ws.Dispose()
