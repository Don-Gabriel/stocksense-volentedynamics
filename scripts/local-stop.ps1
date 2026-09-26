$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local'
$dataRoot = Join-Path $localRoot 'postgres'
if (Test-Path -LiteralPath (Join-Path $dataRoot 'PG_VERSION')) { & pg_ctl.exe -D $dataRoot -m fast -w stop }
$processFile = Join-Path $localRoot 'mailpit.pid'
if (Test-Path -LiteralPath $processFile) {
  $process = Get-Process -Id ([int](Get-Content -LiteralPath $processFile)) -ErrorAction SilentlyContinue
  if ($process -and $process.Path -eq (Join-Path $localRoot 'mailpit\mailpit.exe')) { Stop-Process -Id $process.Id }
}
