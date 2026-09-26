$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $projectRoot '.local\mailpit'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$archive = Join-Path $destination 'mailpit.zip'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/axllent/mailpit/releases/download/v1.31.2/mailpit-windows-amd64.zip' -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '42c20e5c3254125ea7489847811f10d70e39de573fe41d03a61412c87913e995') { throw 'Mailpit download checksum did not match the official release.' }
Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
Remove-Item -LiteralPath $archive
Write-Output 'Mailpit installed locally from its official release; checksum verified.'
