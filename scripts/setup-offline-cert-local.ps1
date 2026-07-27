param(
  [ValidateSet("rebuild", "status", "destroy")]
  [string]$Mode = "status"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $Repo "config/offline-cert-local.env"
$ComposePath = Join-Path $Repo "infra/docker-compose.yml"
$ContainerName = "infra-offline-cert-postgres-1"
$VolumeName = "infra_offlinecertpgdata"
$ExpectedDatabase = "apexos_offline_cert_local"

function Read-LocalSecret {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return $null }
  $line = Get-Content -LiteralPath $EnvPath |
    Where-Object { $_ -match '^OFFLINE_CERT_DB_PASSWORD=' } |
    Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Substring("OFFLINE_CERT_DB_PASSWORD=".Length)
}

function Ensure-LocalSecret {
  $secret = Read-LocalSecret
  if ($secret) { return $secret }
  $bytes = New-Object byte[] 24
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  $secret = [Convert]::ToBase64String($bytes).Replace("+", "A").Replace("/", "B")
  @(
    "# Generated local-only credential. Never commit."
    "OFFLINE_CERT_DB_PASSWORD=$secret"
  ) | Set-Content -LiteralPath $EnvPath -Encoding utf8
  return $secret
}

function Assert-ManagedContainer {
  $existing = docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"
  if (-not $existing) { return }
  $inspection = docker inspect $ContainerName | ConvertFrom-Json
  $purpose = $inspection[0].Config.Labels."com.apexos.purpose"
  if ($purpose -ne "offline-readonly-local-certification") {
    throw "Refusing to manage container without the expected APEXOS certification label."
  }
}

function Wait-Healthy {
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    $health = docker inspect --format "{{.State.Health.Status}}" $ContainerName 2>$null
    if ($health -eq "healthy") { return }
    Start-Sleep -Seconds 2
  }
  throw "Local certification PostgreSQL did not become healthy."
}

function Connection-Url([string]$Secret) {
  $escaped = [Uri]::EscapeDataString($Secret)
  return "postgresql://apex_offline_cert:$escaped@127.0.0.1:54320/$ExpectedDatabase"
}

Set-Location $Repo
Assert-ManagedContainer

if ($Mode -eq "destroy") {
  if (docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}") {
    docker rm -f $ContainerName | Out-Null
  }
  $volume = docker volume ls --filter "name=^$VolumeName$" --format "{{.Name}}"
  if ($volume -eq $VolumeName) {
    docker volume rm $VolumeName | Out-Null
  }
  Write-Output "offline-cert environment destroyed"
  exit 0
}

$secret = Ensure-LocalSecret
$env:OFFLINE_CERT_DB_PASSWORD = $secret

if ($Mode -eq "rebuild") {
  if (docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}") {
    docker rm -f $ContainerName | Out-Null
  }
  $volume = docker volume ls --filter "name=^$VolumeName$" --format "{{.Name}}"
  if ($volume -eq $VolumeName) {
    docker volume rm $VolumeName | Out-Null
  }
}

docker compose -f $ComposePath --profile offline-cert up -d offline-cert-postgres | Out-Null
Wait-Healthy

$env:DATABASE_URL = Connection-Url $secret
$env:DIRECT_URL = $env:DATABASE_URL
$env:APP_ENV = "development"
$env:TARGET_ENV = "local"
$env:DISABLE_REDIS = "true"
$env:REDIS_DISABLED = "true"

if ($Mode -eq "rebuild") {
  npx prisma db push --schema apps/api/prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Prisma schema materialization failed." }
  $migrationDirectories = Get-ChildItem -LiteralPath (Join-Path $Repo "apps/api/prisma/migrations") -Directory |
    Sort-Object Name
  foreach ($migration in $migrationDirectories) {
    $sqlPath = Join-Path $migration.FullName "migration.sql"
    if (-not (Test-Path -LiteralPath $sqlPath)) { continue }
    Get-Content -LiteralPath $sqlPath -Raw |
      docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U apex_offline_cert -d $ExpectedDatabase
    if ($LASTEXITCODE -ne 0) { throw "Migration SQL failed: $($migration.Name)" }
    npx prisma migrate resolve --applied $migration.Name --schema apps/api/prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Migration baseline registration failed: $($migration.Name)" }
  }
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Prisma migration status validation failed." }
}

node scripts/validate-offline-cert-schema.js
if ($LASTEXITCODE -ne 0) { throw "Structural validation failed." }
