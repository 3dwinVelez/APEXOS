param(
  [switch]$DryRun,
  [switch]$RunTests,
  [int]$MaxCommits = 80,
  [string]$EvidenceDir = "reports/promotions"
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
  Write-Host "PROMOCION BLOQUEADA: $Message" -ForegroundColor Red
  exit 1
}

function Invoke-GitCommand {
  param([string[]]$GitArgs)
  $output = & git @GitArgs 2>&1
  if ($LASTEXITCODE -ne 0) { Fail ($output -join "`n") }
  return $output
}

$root = (Invoke-GitCommand -GitArgs @("rev-parse", "--show-toplevel")).Trim()
Set-Location $root
$branch = (Invoke-GitCommand -GitArgs @("branch", "--show-current")).Trim()
if ($branch -ne "desarrollo") { Fail "Ejecutar desde desarrollo. Rama actual: $branch" }
if ((Invoke-GitCommand -GitArgs @("status", "--porcelain"))) { Fail "El repositorio no esta limpio." }

if (-not $DryRun) {
  Invoke-GitCommand -GitArgs @("fetch", "origin", "--prune") | Out-Null
}
$sync = ((Invoke-GitCommand -GitArgs @("rev-list", "--left-right", "--count", "desarrollo...origin/desarrollo")).Trim() -split "\s+")
if ([int]$sync[1] -ne 0) { Fail "desarrollo local esta atrasado o divergente respecto al remoto." }

$candidateCommits = Invoke-GitCommand -GitArgs @("log", "--oneline", "--max-count=$MaxCommits", "origin/develop..desarrollo")
$candidateFiles = if ($DryRun) {
  Invoke-GitCommand -GitArgs @("diff", "--shortstat", "origin/develop...desarrollo")
} else {
  Invoke-GitCommand -GitArgs @("diff", "--stat", "--compact-summary", "origin/develop...desarrollo")
}
Write-Host "Commits candidatos desarrollo -> develop (max $MaxCommits):" -ForegroundColor Cyan
$candidateCommits | ForEach-Object { Write-Host $_ }
Write-Host "Archivos candidatos:" -ForegroundColor Cyan
$candidateFiles | ForEach-Object { Write-Host $_ }

if ($RunTests) {
  & npm --workspace apps/web run typecheck; if ($LASTEXITCODE -ne 0) { Fail "Typecheck fallo." }
  & npm --workspace apps/web run lint; if ($LASTEXITCODE -ne 0) { Fail "Lint fallo." }
  & npm --workspace apps/web run build; if ($LASTEXITCODE -ne 0) { Fail "Build fallo." }
  & npm run prisma:validate; if ($LASTEXITCODE -ne 0) { Fail "Prisma validate fallo." }
}

New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidence = Join-Path $EvidenceDir "desarrollo-to-develop-$stamp.txt"
@(
  "Promotion dry-run: desarrollo -> develop"
  "Date: $(Get-Date -Format o)"
  "Branch: $branch"
  ""
  "Commits:"
  $candidateCommits
  ""
  "Files:"
  $candidateFiles
) | Set-Content -LiteralPath $evidence

if ($DryRun) {
  Write-Host "Dry-run completado. Evidencia: $evidence" -ForegroundColor Green
  exit 0
}

$confirm = Read-Host "Escriba PROMOVER_DESARROLLO_A_DEVELOP para continuar"
if ($confirm -ne "PROMOVER_DESARROLLO_A_DEVELOP") { Fail "Confirmacion invalida." }
Fail "Este script esta preparado para controles previos. La ejecucion real requiere procedimiento autorizado adicional."
