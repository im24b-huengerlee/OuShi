# Deploy Silbenbombe to deplo.io with PostgreSQL
# Prerequisite: nctl auth login (browser or API credentials)
param(
  [string]$AppName = "silbenbombe",
  [string]$DbName = "silbenbombe-db",
  [string]$Project = "",
  [string]$GitUrl = "https://github.com/im24b-huengerlee/OuShi.git"
)

$nctl = "$env:LOCALAPPDATA\Programs\nctl\nctl.exe"
if (-not (Test-Path $nctl)) { $nctl = "nctl" }

$projFlag = @()
if ($Project) { $projFlag = @("-p", $Project) }

& $nctl auth whoami @projFlag 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Run first: & `"$nctl`" auth login" -ForegroundColor Yellow
  exit 1
}

$exists = & $nctl get app $AppName @projFlag 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating app $AppName ..."
  & $nctl create app $AppName @projFlag `
    --git-url=$GitUrl `
    --git-revision=main `
    --buildpack-stack=heroku `
    --language=nodejs `
    --replicas=1 `
    --build-env=BP_INCLUDE_NODEJS_RUNTIME="true"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "App $AppName already exists, updating ..."
  & $nctl update app $AppName @projFlag `
    --git-revision=main `
    --replicas=1 `
    --build-env=BP_INCLUDE_NODEJS_RUNTIME="true"
}

$dbExists = & $nctl get postgresdatabase $DbName @projFlag 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating Postgres database $DbName ..."
  & $nctl create postgresdatabase $DbName @projFlag
}

Write-Host "Attaching database ..."
& $nctl update app $AppName @projFlag --service db=postgresdatabase/$DbName
& $nctl update app $AppName @projFlag --retry-release

Write-Host "`nDeployment triggered. Fetch URL:" -ForegroundColor Green
& $nctl get app $AppName @projFlag
Write-Host "`nLogs: & `"$nctl`" logs app $AppName @projFlag" -ForegroundColor Cyan
