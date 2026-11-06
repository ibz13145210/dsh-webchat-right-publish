# persist-partition.ps1
# Make the DSH desktop browser-guest partition persistent.
#
# Why
#   DSH gives every sidebar browser guest a memory-only partition:
#       partition = `dsh-sidebar-browser-${randomUUID()}`;
#   Cookies die with the process. The webchat plugin cannot read Electron's
#   session API from the Host process, so the only way to keep a login is to
#   make that partition persistent. Both statements below are 37 bytes, so the
#   archive can be patched in place without touching offsets or the index.
#
# Usage
#   Probe (read-only, default):
#     powershell -ExecutionPolicy Bypass -File persist-partition.ps1
#
#   Patch (quit DSH first; run as Administrator):
#     powershell -ExecutionPolicy Bypass -File persist-partition.ps1 -Patch
#
#   Restore:
#     powershell -ExecutionPolicy Bypass -File persist-partition.ps1 -Restore
#
# Notes
#   - A DSH upgrade replaces app.asar; re-run -Patch afterwards.
#   - A byte-for-byte backup is written to app.asar.orig-bak before patching.
#   - Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files
#     as ANSI and would otherwise mis-parse the syntax.

param(
  [string]$Asar = "D:\Program Files\DeepSeek Harness\resources\app.asar",
  [switch]$Patch,
  [switch]$Restore,
  [switch]$Apply,
  [string]$Before = "",
  [string]$After = "",
  [string]$Report = (Join-Path $PSScriptRoot "report.txt")
)

$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]

function Say {
  param([string]$Text)
  $log.Add($Text)
  Write-Host $Text
}

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

# Built-in equal-length pair (37 bytes each).
$PersistBefore = '`dsh-sidebar-browser-${randomUUID()}`'
$PersistAfter = '"persist:"+workspace.replace(/:/g,"")'

try {
  if (-not (Test-Path -LiteralPath $Asar)) {
    Say ("Missing file: " + $Asar)
    exit 2
  }

  $backup = $Asar + '.orig-bak'

  if ($Restore) {
    if (-not (Test-Path -LiteralPath $backup)) {
      Say ("No backup to restore: " + $backup)
      exit 2
    }
    Copy-Item -LiteralPath $backup -Destination $Asar -Force
    Say ("Restored app.asar from " + $backup)
    exit 0
  }

  $bytes = [IO.File]::ReadAllBytes($Asar)
  Say ("File: " + $Asar)
  Say ("Size: " + $bytes.Length + " bytes")

  $writable = $false
  try {
    $probe = [IO.File]::Open($Asar, 'Open', 'ReadWrite', 'None')
    $probe.Close()
    $writable = $true
  } catch {
    $writable = $false
  }
  if ($writable) { Say "Writable: True" } else { Say "Writable: False (patching needs an elevated shell)" }

  $needles = @("dsh-sidebar-browser-", "persist:", "fromPartition")
  foreach ($needle in $needles) {
    $found = Find-All $bytes ([Text.Encoding]::UTF8.GetBytes($needle))
    Say ("")
    Say ("=== '" + $needle + "' hits: " + $found.Count + " ===")
    $shown = 0
    foreach ($offset in $found) {
      if ($shown -ge 10) { Say "  ... (more omitted)"; break }
      $shown++
      $start = [Math]::Max(0, $offset - 160)
      $len = [Math]::Min(340, $bytes.Length - $start)
      $ctx = [Text.Encoding]::UTF8.GetString($bytes, $start, $len)
      Say ("--- offset " + $offset + " ---")
      Say ($ctx -replace "`r", "")
    }
  }

  if ($Patch -or $Apply) {
    $beforeText = $PersistBefore
    $afterText = $PersistAfter
    if ($Apply) {
      $beforeText = $Before
      $afterText = $After
      if ($beforeText -eq "" -or $afterText -eq "") {
        Say "Apply needs -Before and -After"
        exit 2
      }
    }

    $b = [Text.Encoding]::UTF8.GetBytes($beforeText)
    $a = [Text.Encoding]::UTF8.GetBytes($afterText)
    Say ("")
    Say ("Replace lengths: before=" + $b.Length + " after=" + $a.Length)
    if ($b.Length -ne $a.Length) {
      Say "Length mismatch, refusing to write"
      exit 2
    }
    if (-not $writable) {
      Say "No write permission: quit DSH and rerun from an elevated shell"
      exit 3
    }

    $hits = Find-All $bytes $b
    Say ("Hits: " + $hits.Count)
    if ($hits.Count -ne 1) {
      Say "Expected exactly 1 hit, refusing to write"
      exit 2
    }

    if (-not (Test-Path -LiteralPath $backup)) {
      Copy-Item -LiteralPath $Asar -Destination $backup
      Say ("Backup written: " + $backup)
    } else {
      Say ("Backup already exists, keeping it: " + $backup)
    }

    foreach ($offset in $hits) {
      for ($k = 0; $k -lt $a.Length; $k++) {
        $bytes[$offset + $k] = $a[$k]
      }
      Say ("Replaced " + $a.Length + " bytes at offset " + $offset)
    }

    [IO.File]::WriteAllBytes($Asar, $bytes)

    $check = [IO.File]::ReadAllBytes($Asar)
    $remaining = Find-All $check ([Text.Encoding]::UTF8.GetBytes($beforeText))
    $applied = Find-All $check ([Text.Encoding]::UTF8.GetBytes($afterText))
    Say ("Verify: old template hits=" + $remaining.Count + " new template hits=" + $applied.Count)
    if ($applied.Count -eq 1 -and $remaining.Count -eq 0) {
      Say "PATCH OK. Start DSH, sign in to the DeepSeek web chat once, then restart to verify."
      Say ("Restore with: powershell -ExecutionPolicy Bypass -File `"" + $PSCommandPath + "`" -Restore")
    } else {
      Say "Verification failed. Restore with -Restore before retrying."
      exit 4
    }
  }
} finally {
  try {
    Set-Content -LiteralPath $Report -Value ($log -join "`r`n") -Encoding UTF8
    Write-Host ("Report written: " + $Report)
  } catch {
    Write-Host ("Report write failed: " + $_.Exception.Message)
  }
}