param(
  [switch]$DryRun,
  [switch]$RunTests,
  [int]$MaxCommits = 80,
  [string]$QaVerdict,
  [string]$ReleaseId,
  [string]$RollbackPlan,
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

if ($QaVerdict -ne "APROBADO") { Fail "Se requiere QaVerdict APROBADO." }
if (-not $ReleaseId) { Fail "Se requiere ReleaseId." }
if (-not $RollbackPlan) { Fail "Se requiere RollbackPlan." }

$root = (Invoke-GitCommand -GitArgs @("rev-parse", "--show-toplevel")).Trim()
Set-Location $root
$branch = (Invoke-GitCommand -GitArgs @("branch", "--show-current")).Trim()
if ($branch -ne "develop") { Fail "Ejecutar desde develop. Rama actual: $branch" }
if ((Invoke-GitCommand -GitArgs @("status", "--porcelain"))) { Fail "El repositorio no esta limpio." }

if (-not $DryRun) {
  Invoke-GitCommand -GitArgs @("fetch", "origin", "--prune") | Out-Null
}
$sync = ((Invoke-GitCommand -GitArgs @("rev-list", "--left-right", "--count", "develop...origin/develop")).Trim() -split "\s+")
if ([int]$sync[1] -ne 0) { Fail "develop local esta atrasado o divergente respecto al remoto." }

$candidateCommits = Invoke-GitCommand -GitArgs @("log", "--oneline", "--max-count=$MaxCommits", "origin/main..develop")
$candidateFiles = if ($DryRun) {
  Invoke-GitCommand -GitArgs @("diff", "--shortstat", "origin/main...develop")
} else {
  Invoke-GitCommand -GitArgs @("diff", "--stat", "--compact-summary", "origin/main...develop")
}
Write-Host "Commits candidatos develop -> main (max $MaxCommits):" -ForegroundColor Cyan
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
$evidence = Join-Path $EvidenceDir "develop-to-main-$stamp.txt"
@(
  "Promotion dry-run: develop -> main"
  "Date: $(Get-Date -Format o)"
  "ReleaseId: $ReleaseId"
  "RollbackPlan: $RollbackPlan"
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

$confirm = Read-Host "Escriba PROMOVER_DEVELOP_A_MAIN para continuar"
if ($confirm -ne "PROMOVER_DEVELOP_A_MAIN") { Fail "Confirmacion invalida." }
Fail "Este script esta preparado para controles previos. La ejecucion real requiere procedimiento autorizado adicional."
