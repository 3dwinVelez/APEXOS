param(
  [switch]$CheckOnly,
  [switch]$NoInstall,
  [switch]$NoStart,
  [switch]$NoCode,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

function Stop-Blocked {
  param([string]$Message, [string[]]$Details = @())
  Write-Host ""
  Write-Host "APEXOS LOCAL - DESARROLLO" -ForegroundColor Cyan
  Write-Host "Estado: BLOQUEADO" -ForegroundColor Red
  Write-Host $Message -ForegroundColor Red
  foreach ($detail in $Details) {
    Write-Host "- $detail" -ForegroundColor Yellow
  }
  exit 1
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Stop-Blocked "Falta un requisito local." @("No se encontro '$Name' en PATH.")
  }
}

function Invoke-RepoGit {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  if ($GitArgs.Count -eq 1 -and $GitArgs[0] -match "\s") {
    $GitArgs = $GitArgs[0] -split "\s+"
  }
  $output = & git @GitArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    Stop-Blocked "Git no pudo completar una operacion segura." @($output)
  }
  return $output
}

function Get-WorktreePathForBranch {
  param([string]$BranchName)
  $currentWorktree = $null
  foreach ($line in Invoke-RepoGit @("worktree", "list", "--porcelain")) {
    if ($line -like "worktree *") {
      $currentWorktree = $line.Substring("worktree ".Length)
      continue
    }
    if ($line -eq "branch refs/heads/$BranchName" -and $currentWorktree) {
      return $currentWorktree
    }
  }
  return $null
}

function Invoke-DesarrolloWorktreeStarter {
  param([string]$WorktreePath)
  $starter = Join-Path $WorktreePath "scripts/windows/start-apexos-desarrollo.ps1"
  if (-not (Test-Path -LiteralPath $starter)) {
    Stop-Blocked "La rama desarrollo ya esta abierta en otro worktree, pero no se encontro su starter." @("Worktree: $WorktreePath", "Starter esperado: $starter")
  }

  $forwardArgs = @()
  if ($CheckOnly) { $forwardArgs += "-CheckOnly" }
  if ($NoInstall) { $forwardArgs += "-NoInstall" }
  if ($NoStart) { $forwardArgs += "-NoStart" }
  if ($NoCode) { $forwardArgs += "-NoCode" }
  if ($NoBrowser) { $forwardArgs += "-NoBrowser" }

  Write-Host "La rama desarrollo ya esta abierta en otro worktree." -ForegroundColor Cyan
  Write-Host "Delegando inicio a: $WorktreePath" -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $starter @forwardArgs
  exit $LASTEXITCODE
}

function Read-EnvMap {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -le 0) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim().Trim('"')
    $map[$key] = $value
  }
  return $map
}

function Assert-LocalEnvironment {
  param([string]$RepoRoot)
  $required = @(".env")
  $missing = @()
  foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $file))) {
      $missing += $file
    }
  }
  if ($missing.Count -gt 0) {
    Stop-Blocked "Faltan archivos locales de entorno." ($missing | ForEach-Object { "Crear $_ desde plantillas locales, sin copiar QA ni PROD." })
  }

  $envFiles = @(".env", "config/local.env") | ForEach-Object { Join-Path $RepoRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
  $forbiddenMarkers = @(
    "jbirkghkekuifgfsgquq",
    "jzbwzmkidfthknsohhnr",
    "railway.app",
    "supabase.co",
    "pooler.supabase.com"
  )
  foreach ($file in $envFiles) {
    $envMapForScan = Read-EnvMap $file
    $text = ($envMapForScan.Values -join "`n")
    foreach ($marker in $forbiddenMarkers) {
      if ($text -match [regex]::Escape($marker)) {
        Stop-Blocked "Configuracion remota detectada en ambiente local." @("Archivo: $(Split-Path $file -Leaf)", "Tipo detectado: $marker", "No se muestran secretos.")
      }
    }
  }

  $envMap = Read-EnvMap (Join-Path $RepoRoot ".env")
  if (-not $envMap.ContainsKey("DATABASE_URL")) {
    Stop-Blocked "DATABASE_URL no esta definido en .env." @("Debe apuntar a PostgreSQL local.")
  }
  if ($envMap["DATABASE_URL"] -notmatch "localhost|127\.0\.0\.1|postgres:5432|pgbouncer:6432") {
    Stop-Blocked "DATABASE_URL no parece local." @("Use PostgreSQL local o servicios Docker locales.")
  }
}

function Import-LocalEnvironment {
  param([string]$RepoRoot)
  $envMap = Read-EnvMap (Join-Path $RepoRoot ".env")
  foreach ($key in $envMap.Keys) {
    [Environment]::SetEnvironmentVariable($key, [string]$envMap[$key], "Process")
  }
  if (-not [Environment]::GetEnvironmentVariable("OFFLINE_CERT_DB_PASSWORD", "Process")) {
    [Environment]::SetEnvironmentVariable("OFFLINE_CERT_DB_PASSWORD", "apex_offline_cert_local_password", "Process")
  }
}

function Test-Port {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$listener
}

function Test-HttpOk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-HttpOk {
  param([string]$Url, [int]$TimeoutSeconds = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk $Url) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Ensure-Dependencies {
  param([string]$RepoRoot)
  if ($NoInstall) { return }
  $lock = Join-Path $RepoRoot "package-lock.json"
  $nodeModules = Join-Path $RepoRoot "node_modules"
  if (-not (Test-Path -LiteralPath $lock)) {
    Stop-Blocked "No existe package-lock.json." @("No se puede garantizar instalacion reproducible.")
  }
  $stateDir = Join-Path $RepoRoot ".apexos-local"
  $hashFile = Join-Path $stateDir "package-lock.sha256"
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $lock).Hash
  $previousHash = if (Test-Path -LiteralPath $hashFile) { (Get-Content -LiteralPath $hashFile -Raw).Trim() } else { "" }
  if ((-not (Test-Path -LiteralPath $nodeModules)) -or $hash -ne $previousHash) {
    Write-Host "Instalando dependencias con npm ci..." -ForegroundColor Cyan
    & npm ci
    if ($LASTEXITCODE -ne 0) { Stop-Blocked "npm ci fallo." }
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    Set-Content -LiteralPath $hashFile -Value $hash
  }
}

function Start-Terminal {
  param([string]$Title, [string]$Command, [string]$RepoRoot)
  $escaped = $Command.Replace('"', '\"')
  Start-Process powershell.exe -ArgumentList "-NoExit", "-NoProfile", "-Command", "Set-Location `"$RepoRoot`"; `$Host.UI.RawUI.WindowTitle = `"$Title`"; $escaped"
}

function Start-LocalInfrastructure {
  param([string]$RepoRoot)
  Write-Host "Iniciando infraestructura local..." -ForegroundColor Cyan
  $composeFile = Join-Path $RepoRoot "infra/docker-compose.yml"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & docker compose -f $composeFile up -d postgres redis minio brain 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -eq 0) { return }

  $text = ($output -join "`n")
  if ($text -match "pgbouncer|bitnami/pgbouncer") {
    Write-Host "PgBouncer/Brain no pudo iniciar con la imagen local configurada. Continuando con infraestructura minima local." -ForegroundColor Yellow
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $fallback = & docker compose -f $composeFile up -d postgres redis minio 2>&1
    $fallbackExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($fallbackExitCode -eq 0) { return }
    Stop-Blocked "No se pudo iniciar infraestructura minima local." @($fallback)
  }

  Stop-Blocked "No se pudo iniciar infraestructura local." @($output)
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoCandidate = Resolve-Path (Join-Path $scriptRoot "..\..")
Set-Location $repoCandidate

Require-Command "git"
Require-Command "node"
Require-Command "npm"

$repoRoot = (Invoke-RepoGit @("rev-parse", "--show-toplevel")).Trim()
Set-Location $repoRoot

Write-Host "APEXOS LOCAL - DESARROLLO" -ForegroundColor Cyan
Write-Host "Repositorio detectado: $repoRoot"

$status = (Invoke-RepoGit @("status", "--short")) -join "`n"
$branch = (Invoke-RepoGit @("branch", "--show-current")).Trim()
Write-Host "Rama actual: $branch"
if ($status) {
  Stop-Blocked "Existen cambios locales sin guardar. No se cambia de rama ni se ejecuta pull." ($status -split "`n")
}

if ($branch -ne "desarrollo") {
  $desarrolloWorktree = Get-WorktreePathForBranch "desarrollo"
  if ($desarrolloWorktree) {
    $currentRoot = (Resolve-Path -LiteralPath $repoRoot).Path
    $targetRoot = (Resolve-Path -LiteralPath $desarrolloWorktree).Path
    if ($targetRoot -ne $currentRoot) {
      Invoke-DesarrolloWorktreeStarter $targetRoot
    }
  }

  & git show-ref --verify --quiet refs/heads/desarrollo
  $branchExists = $LASTEXITCODE
  if ($branchExists -ne 0) {
    Stop-Blocked "La rama local desarrollo no existe." @("No se crea automaticamente.")
  }
  Write-Host "Cambiando de forma segura a desarrollo..." -ForegroundColor Cyan
  Invoke-RepoGit @("switch", "desarrollo") | Out-Null
  $branch = "desarrollo"
}

Invoke-RepoGit @("fetch", "origin", "--prune") | Out-Null
$counts = ((Invoke-RepoGit @("rev-list", "--left-right", "--count", "desarrollo...origin/desarrollo")).Trim() -split "\s+")
$ahead = [int]$counts[0]
$behind = [int]$counts[1]
if ($ahead -gt 0 -and $behind -gt 0) {
  Stop-Blocked "desarrollo divergio respecto a origin/desarrollo." @("Local exclusivo: $ahead commits", "Remoto exclusivo: $behind commits", "No se hace merge ni rebase automatico.")
}
if ($ahead -eq 0 -and $behind -gt 0) {
  Write-Host "Actualizando desarrollo con fast-forward..." -ForegroundColor Cyan
  Invoke-RepoGit @("pull", "--ff-only", "origin", "desarrollo") | Out-Null
}

Assert-LocalEnvironment $repoRoot
Import-LocalEnvironment $repoRoot
Ensure-Dependencies $repoRoot

$apiPortBusy = Test-Port 3000
$webPortBusy = Test-Port 3001
$apiAlreadyRunning = $apiPortBusy -and (Test-HttpOk "http://localhost:3000/health")
$webAlreadyRunning = $webPortBusy -and (Test-HttpOk "http://localhost:3001")
if (($apiPortBusy -or $webPortBusy) -and -not ($apiAlreadyRunning -and $webAlreadyRunning)) {
  $details = @()
  if ($apiPortBusy -and -not $apiAlreadyRunning) { $details += "Puerto 3000/API esta ocupado pero no responde salud local." }
  if ($webPortBusy -and -not $webAlreadyRunning) { $details += "Puerto 3001/Web esta ocupado pero no responde localmente." }
  Stop-Blocked "Puertos locales ocupados por procesos no verificados." $details
}

Write-Host "Validando Prisma..." -ForegroundColor Cyan
& npm run prisma:validate
if ($LASTEXITCODE -ne 0) { Stop-Blocked "Prisma validate fallo." }

Write-Host "Validando TypeScript web..." -ForegroundColor Cyan
& npm --workspace apps/web run typecheck
if ($LASTEXITCODE -ne 0) { Stop-Blocked "TypeScript fallo." }

if (-not $CheckOnly -and -not $NoStart -and -not ($apiAlreadyRunning -and $webAlreadyRunning)) {
  Require-Command "docker"
  Start-LocalInfrastructure $repoRoot
  Start-Terminal "APEXOS API - desarrollo" "npm run dev:api" $repoRoot
  Start-Terminal "APEXOS WEB - desarrollo" "npm run dev:web" $repoRoot
  Write-Host "Esperando que API y Web respondan..." -ForegroundColor Cyan
  $apiReady = Wait-HttpOk "http://localhost:3000/health"
  $webReady = Wait-HttpOk "http://localhost:3001/login"
  if (-not ($apiReady -and $webReady)) {
    $details = @()
    if (-not $apiReady) { $details += "API no respondio en http://localhost:3000/health." }
    if (-not $webReady) { $details += "Web no respondio en http://localhost:3001/login." }
    Stop-Blocked "Los procesos locales no alcanzaron un estado saludable." $details
  }
  if (-not $NoCode -and (Get-Command code -ErrorAction SilentlyContinue)) {
    Start-Process code -ArgumentList "`"$repoRoot`""
  }
  if (-not $NoBrowser) {
    Start-Process "http://localhost:3001"
  }
} elseif (-not $CheckOnly -and -not $NoBrowser -and $apiAlreadyRunning -and $webAlreadyRunning) {
  Write-Host "API y Web ya estan corriendo. Abriendo navegador..." -ForegroundColor Cyan
  Start-Process "http://localhost:3001"
}

Write-Host ""
Write-Host "APEXOS LOCAL - DESARROLLO" -ForegroundColor Green
Write-Host "Rama: desarrollo"
Write-Host "Repositorio: $repoRoot"
Write-Host "Frontend: http://localhost:3001"
Write-Host "API: http://localhost:3000"
Write-Host "Base de datos: Local"
Write-Host "Railway: No utilizado"
Write-Host "Supabase QA: No utilizado"
Write-Host "Supabase PROD: No utilizado"
Write-Host "Estado: LISTO"
