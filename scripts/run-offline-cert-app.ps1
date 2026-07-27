param(
  [ValidateSet("start", "stop", "status")]
  [string]$Mode = "status"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$ApiPidPath = Join-Path $env:TEMP "apexos-offline-cert-api.pid"
$WebPidPath = Join-Path $env:TEMP "apexos-offline-cert-web.pid"

function Stop-ManagedProcess([string]$PidPath) {
  if (-not (Test-Path -LiteralPath $PidPath)) { return }
  $managedPid = [int](Get-Content -LiteralPath $PidPath)
  Get-CimInstance Win32_Process |
    Where-Object { $_.ParentProcessId -eq $managedPid } |
    ForEach-Object {
      $childPath = Join-Path $env:TEMP "apexos-offline-cert-child-$($_.ProcessId).pid"
      $_.ProcessId | Set-Content -LiteralPath $childPath
      Stop-ManagedProcess $childPath
    }
  $process = Get-Process -Id $managedPid -ErrorAction SilentlyContinue
  if ($process) { Stop-Process -Id $managedPid -Force }
  Remove-Item -LiteralPath $PidPath -Force
}

if ($Mode -eq "stop") {
  Stop-ManagedProcess $ApiPidPath
  Stop-ManagedProcess $WebPidPath
  Write-Output "offline certification app stopped"
  exit 0
}

if ($Mode -eq "status") {
  foreach ($entry in @(@("api", $ApiPidPath), @("web", $WebPidPath))) {
    $running = $false
    if (Test-Path -LiteralPath $entry[1]) {
      $running = [bool](Get-Process -Id ([int](Get-Content $entry[1])) -ErrorAction SilentlyContinue)
    }
    Write-Output "$($entry[0])=$running"
  }
  exit 0
}

Set-Location $Repo
Stop-ManagedProcess $ApiPidPath
Stop-ManagedProcess $WebPidPath

$dbSecret = (Get-Content config/offline-cert-local.env |
  Where-Object { $_ -match "^OFFLINE_CERT_DB_PASSWORD=" } |
  Select-Object -First 1).Substring("OFFLINE_CERT_DB_PASSWORD=".Length)
Get-Content config/offline-phase3-certification.env | ForEach-Object {
  if ($_ -match "^([^#=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}
$escaped = [Uri]::EscapeDataString($dbSecret)
$env:DATABASE_URL = "postgresql://apex_offline_cert:$escaped@127.0.0.1:54320/apexos_offline_cert_local"
$env:DIRECT_URL = $env:DATABASE_URL
$env:APP_ENV = "development"
$env:TARGET_ENV = "local"
$env:NODE_ENV = "development"
$env:PORT = "3100"
$env:JWT_SECRET = "offline-certification-local-only-secret-2026-minimum-32"
$env:DISABLE_REDIS = "true"
$env:REDIS_DISABLED = "true"
$env:AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED = "true"
$env:OFFLINE_TECHNICIAN_ENABLED = "true"
$env:OFFLINE_ALLOWED_ENVIRONMENTS = "development"
$env:OFFLINE_ALLOWED_TENANT_IDS = $env:TENANT_ID
$env:OFFLINE_ALLOWED_USER_IDS = $env:TECHNICIAN_USER_ID
$env:OFFLINE_ALLOWED_ROLES = ""
$env:OFFLINE_SYNC_ENABLED = "false"
$env:OFFLINE_EVIDENCE_UPLOAD_ENABLED = "false"
$env:OFFLINE_AUTO_SYNC_ENABLED = "false"
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:3100"
$env:NEXT_PUBLIC_OFFLINE_DISCOVERY_ENABLED = "true"

$api = Start-Process node -ArgumentList "apps/api/server.js" -WorkingDirectory $Repo `
  -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:TEMP "apexos-offline-api.log") `
  -RedirectStandardError (Join-Path $env:TEMP "apexos-offline-api.err.log") -PassThru
$web = Start-Process npm.cmd -ArgumentList "--workspace", "apps/web", "run", "start" `
  -WorkingDirectory $Repo -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $env:TEMP "apexos-offline-web.log") `
  -RedirectStandardError (Join-Path $env:TEMP "apexos-offline-web.err.log") -PassThru
$api.Id | Set-Content -LiteralPath $ApiPidPath
$web.Id | Set-Content -LiteralPath $WebPidPath

for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  try {
    $apiReady = (Invoke-RestMethod "http://127.0.0.1:3100/health").status -eq "OK"
    $webReady = (Invoke-WebRequest "http://127.0.0.1:3001/login" -UseBasicParsing).StatusCode -eq 200
    if ($apiReady -and $webReady) {
      Write-Output "offline certification app ready"
      exit 0
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}

Stop-ManagedProcess $ApiPidPath
Stop-ManagedProcess $WebPidPath
throw "Offline certification app did not become ready."
