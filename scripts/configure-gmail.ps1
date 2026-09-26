$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $projectRoot 'apps\api\.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Run npm run local:setup first.' }
Write-Host 'Configure Gmail SMTP for StockSense. No password is sent to chat or GitHub.'
Write-Host 'Use a Google app password created with 2-Step Verification enabled.'
$sender = (Read-Host 'Your Gmail address').Trim()
if ($sender -notmatch '^[^\s@]+@gmail\.com$') { throw 'Enter your complete @gmail.com address.' }
$securePassword = Read-Host '16-character Gmail app password (input hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $appPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Replace(' ','')
  if ($appPassword -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Enter the 16-character app password, not your ordinary Gmail password.' }
  $configuration = [System.IO.File]::ReadAllText($envPath)
  $values = @{ MAIL_MODE='smtp'; SMTP_HOST='smtp.gmail.com'; SMTP_PORT='465'; SMTP_SECURE='true'; SMTP_USER=$sender; SMTP_PASSWORD=$appPassword; SMTP_FROM="StockSense <$sender>"; MAIL_PREVIEW_URL='' }
  foreach ($key in $values.Keys) {
    $configuration = [regex]::Replace($configuration, "(?m)^$key=.*\r?\n?", '')
    $configuration = $configuration.TrimEnd() + "`r`n$key=$($values[$key])`r`n"
  }
  [System.IO.File]::WriteAllText($envPath,$configuration)
  Write-Host 'Gmail configuration saved to the local ignored environment file.'
  Write-Host 'Restart the API (or npm run dev) to activate it. Do not share or commit the .env file.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $appPassword = $null
  $configuration = $null
}
