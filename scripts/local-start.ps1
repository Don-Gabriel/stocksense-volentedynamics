$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local'
& (Join-Path $PSScriptRoot 'local-setup.ps1')
$mailpit = Join-Path $localRoot 'mailpit\mailpit.exe'
if (Test-Path -LiteralPath $mailpit) {
  $processFile = Join-Path $localRoot 'mailpit.pid'
  $existing = if (Test-Path -LiteralPath $processFile) { Get-Process -Id ([int](Get-Content -LiteralPath $processFile)) -ErrorAction SilentlyContinue } else { $null }
  if (-not $existing -or $existing.Path -ne $mailpit) {
    $process = Start-Process -FilePath $mailpit -ArgumentList '--listen','127.0.0.1:8025','--smtp','127.0.0.1:1025','--database',(Join-Path $localRoot 'mailpit.db') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'mailpit.log') -RedirectStandardError (Join-Path $localRoot 'mailpit-error.log')
    $process.Id | Set-Content -LiteralPath $processFile
  }
  Write-Output 'Local email inbox: http://localhost:8025'
} else { Write-Output 'Mailpit binary is not installed. Follow README instructions to enable the local OTP inbox.' }
