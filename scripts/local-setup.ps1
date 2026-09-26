$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local'
$dataRoot = Join-Path $localRoot 'postgres'
$envFile = Join-Path $projectRoot 'apps\api\.env'
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
$pgCommand = Get-Command initdb.exe -ErrorAction SilentlyContinue
if (-not $pgCommand) { throw 'Install the free PostgreSQL Windows binaries and add their bin folder to PATH, then run this script again.' }
$pgBin = Split-Path $pgCommand.Source
if (-not (Test-Path -LiteralPath $envFile)) {
  $dbPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $jwtSecret = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $configuration = @(
    "DATABASE_URL=postgresql://stocksense:${dbPassword}@127.0.0.1:55432/stocksense?schema=public",
    "TEST_DATABASE_URL=postgresql://stocksense:${dbPassword}@127.0.0.1:55432/stocksense_test?schema=public",
    "JWT_SECRET=$jwtSecret", 'PORT=3001', 'WEB_ORIGIN=http://localhost:5173,http://127.0.0.1:5173',
    'SMTP_HOST=127.0.0.1', 'SMTP_PORT=1025', 'SMTP_FROM=StockSense <no-reply@stocksense.local>',
    'MAIL_PREVIEW_URL=http://localhost:8025', 'DEMO_PASSWORD=StockSense!2026'
  )
  [System.IO.File]::WriteAllLines($envFile, $configuration)
}
$databaseLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
$connectionUri = [Uri]($databaseLine.Substring(13).Split('?')[0])
if ($connectionUri.Host -ne '127.0.0.1' -or $connectionUri.Port -ne 55432 -or $connectionUri.AbsolutePath -ne '/stocksense') { throw 'This setup script only manages the isolated local StockSense database on port 55432.' }
$dbPassword = $connectionUri.UserInfo.Split(':',2)[1]
if (-not (Test-Path -LiteralPath (Join-Path $dataRoot 'PG_VERSION'))) {
  $passwordFile = Join-Path $localRoot 'init-password.txt'
  [System.IO.File]::WriteAllText($passwordFile, $dbPassword)
  try {
    & (Join-Path $pgBin 'initdb.exe') -D $dataRoot -U stocksense --auth=scram-sha-256 --encoding=UTF8 --locale=C --pwfile=$passwordFile
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed' }
  } finally { Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue }
}
& (Join-Path $pgBin 'pg_ctl.exe') -D $dataRoot status 2>$null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $dataRoot -l (Join-Path $localRoot 'postgres.log') -o '-p 55432 -h 127.0.0.1' -w start
  if ($LASTEXITCODE -ne 0) { throw 'StockSense PostgreSQL did not start. Check .local/postgres.log.' }
}
$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $dbPassword
  foreach ($databaseName in @('stocksense','stocksense_test')) {
    $exists = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 55432 -U stocksense -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$databaseName'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not connect to StockSense PostgreSQL' }
    if ($exists -ne '1') { & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U stocksense $databaseName; if ($LASTEXITCODE -ne 0) { throw 'Database creation failed' } }
  }
} finally { $env:PGPASSWORD = $previousPassword }
Write-Output 'StockSense local databases are ready on 127.0.0.1:55432. Credentials are in the ignored apps/api/.env.'
