# Register GitHub push webhook for QuackStream on im24b-huengerlee/OuShi
# Usage: .\scripts\setup-quackstream-webhook.ps1 -BackendUrl "https://your-backend.example.com"
param(
  [Parameter(Mandatory = $true)]
  [string]$BackendUrl
)

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) { $gh = "gh" }

& $gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in to GitHub. Run:" -ForegroundColor Yellow
  Write-Host "  & `"$gh`" auth login" -ForegroundColor Cyan
  exit 1
}

$url = $BackendUrl.TrimEnd('/')
if (-not $url.EndsWith('/webhook')) { $url += '/webhook' }
if (-not $url.StartsWith('https://')) {
  Write-Error "Webhook URL must use HTTPS: $url"
  exit 1
}

Write-Host "Creating webhook: $url"

$payload = @{
  name   = 'web'
  active = $true
  events = @('push')
  config = @{
    url          = $url
    content_type = 'json'
    insecure_ssl = '0'
  }
} | ConvertTo-Json -Depth 5

$tmp = [System.IO.Path]::GetTempFileName()
Set-Content -Path $tmp -Value $payload -Encoding UTF8
& $gh api repos/im24b-huengerlee/OuShi/hooks --method POST --input $tmp
Remove-Item $tmp -Force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Webhook created. Testing with empty commit..." -ForegroundColor Green
Set-Location (Join-Path $PSScriptRoot "..")
git commit --allow-empty -m "quacking code now"
git push origin main
Write-Host "Check GitHub -> Settings -> Webhooks -> Recent Deliveries for a green checkmark." -ForegroundColor Green
