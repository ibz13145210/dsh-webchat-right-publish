# apply-persist.ps1
# Apply the persistent-partition patch to app.asar, right now.
#
# Run this from an ELEVATED PowerShell. It will:
#   1. ask DSH to close, and force-kill it if it is still running after 15s;
#   2. wait until app.asar can be opened for writing;
#   3. replace the 37-byte partition template with the persistent one;
#   4. verify the replacement, then relaunch DSH.
#
# Restore: copy app.asar.orig-bak over app.asar.
# A DSH upgrade replaces app.asar; run this again afterwards.
#
# Keep this file ASCII-only (Windows PowerShell 5.1 reads BOM-less files as ANSI).
#
param(
  [string]$Asar = "D:\Program Files\DeepSeek Harness\resources\app.asar",
  [string]$InstallDir = "D:\Program Files\DeepSeek Harness",
  [string]$Log = (Join-Path $env:TEMP "dsh-apply-persist.log")
)

$ErrorActionPreference = 'Stop'

function Say {
  param([string]$Text)
  $line = (Get-Date -Format "HH:mm:ss") + " " + $Text
  try { $line | Out-File -LiteralPath $Log -Append -Encoding UTF8 } catch { }
  Write-Host $line
}

$Before = '`dsh-sidebar-browser-${randomUUID()}`'
$After = '"persist:"+workspace.replace(/:/g,"")'

function Find-All {
  param([byte[]]$Haystack, [byte[]]$Needle)
  $hits = New-Object System.Collections.Generic.List[int]
  $n = $Needle.Length
  $limit = $Haystack.Length - $n
  for ($i = 0; $i -le $limit; $i++) {
    if ($Haystack[$i] -ne $Needle[0]) { continue }
    $ok = $true
    for ($j = 1; $j -lt $n; $j++) {
      if ($Haystack[$i + $j] -ne $Needle[$j]) { $ok = $false; break }
    }
    if ($ok) { $hits.Add($i); $i += $n - 1 }
  }
  return $hits
}

Say "start"
if (-not (Test-Path -LiteralPath $Asar)) { Say ("missing: " + $Asar); exit 2 }

try {
  $proc = Get-Process -Name "DeepSeek Harness" -ErrorAction SilentlyContinue
  if ($proc) {
    foreach ($p in $proc) { [void]$p.CloseMainWindow() }
    Say "close requested"
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 1
      if (-not (Get-Process -Name "DeepSeek Harness" -ErrorAction SilentlyContinue)) { break }
    }
    $left = Get-Process -Name "DeepSeek Harness" -ErrorAction SilentlyContinue
    if ($left) {
      Say "still running; forcing exit"
      $left | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 3
    } else {
      Say "closed"
    }
  } else {
    Say "not running"
  }

  $writable = $false
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $fs = [IO.File]::Open($Asar, 'Open', 'ReadWrite', 'None')
      $fs.Close()
      $writable = $true
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $writable) { Say "asar is locked; abort"; exit 3 }

  $bytes = [IO.File]::ReadAllBytes($Asar)
  $b = [Text.Encoding]::UTF8.GetBytes($Before)
  $a = [Text.Encoding]::UTF8.GetBytes($After)
  $hits = Find-All $bytes $b
  Say ("before=" + $b.Length + " after=" + $a.Length + " hits=" + $hits.Count)
  if ($b.Length -ne $a.Length -or $hits.Count -ne 1) {
    $new = Find-All $bytes $a
    Say ("refusing to write (already patched? new=" + $new.Count + ")")
    exit 2
  }

  $backup = $Asar + ".orig-bak"
  Copy-Item -LiteralPath $Asar -Destination $backup -Force
  Say ("backup written: " + $backup)

  foreach ($offset in $hits) {
    for ($k = 0; $k -lt $a.Length; $k++) { $bytes[$offset + $k] = $a[$k] }
    Say ("Replaced " + $a.Length + " bytes at offset " + $offset)
  }

  [IO.File]::WriteAllBytes($Asar, $bytes)

  $check = [IO.File]::ReadAllBytes($Asar)
  $old = Find-All $check $b
  $new = Find-All $check $a
  Say ("verify old=" + $old.Count + " new=" + $new.Count)
  if ($new.Count -ne 1 -or $old.Count -ne 0) { Say "verification failed"; exit 4 }
  Say "PATCH OK"
} catch {
  Say ("error: " + $_.Exception.Message)
} finally {
  $exe = Get-ChildItem -LiteralPath $InstallDir -Filter *.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($exe) {
    Say ("relaunch " + $exe.FullName)
    Start-Process -FilePath $exe.FullName | Out-Null
  } else {
    Say "no exe found; start DSH manually"
  }
}