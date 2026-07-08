# NEON PROTOCOL launcher (robust). Serves this folder and opens the game only once it responds.
$ErrorActionPreference = 'SilentlyContinue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$python = (Get-Command python).Source
if (-not $python) { Write-Host "Python not found. Install Python and try again."; Read-Host "Press Enter"; exit 1 }

# find a free port from a candidate list
$ports = 8791, 8123, 9137, 8137, 8767
$port = $null
foreach ($p in $ports) {
  $used = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if (-not $used) { $port = $p; break }
}
if (-not $port) { $port = 8791 }

# start the server with cwd = game folder (no --directory, avoids path-quoting bugs)
Start-Process -WindowStyle Hidden -FilePath $python -ArgumentList @('-m','http.server',"$port") -WorkingDirectory $dir

# wait until it actually serves the game (up to ~12s)
$ok = $false
for ($i = 0; $i -lt 24; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$port/index.html" -UseBasicParsing -TimeoutSec 2
    if ($r.Content -match 'NEON PROTOCOL') { $ok = $true; break }
  } catch {}
}
if ($ok) {
  Start-Process "http://localhost:$port/"
  Write-Host "NEON PROTOCOL running at http://localhost:$port/  (keep this window open while playing)"
} else {
  Write-Host "Could not start the local server. Try running: python -m http.server 8791  in this folder."
  Read-Host "Press Enter to close"
}