# 로컬 KataGo 응수 스택 기동 (Windows PowerShell)
# 사용: .\scripts\dev-katago-stack.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "== BadukPlatform KataGo local stack ==" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker Desktop이 필요합니다: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
  exit 1
}

Set-Location $Root
docker compose -f docker-compose.katago.yml up -d --build

Write-Host ""
Write-Host "엔진 준비 대기 (최대 3분)..." -ForegroundColor Yellow
$deadline = (Get-Date).AddMinutes(3)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:2718/api/v1/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 5
  }
}

if (-not $ready) {
  Write-Host "KataGo 엔진 health 확인 실패. 로그: docker compose -f docker-compose.katago.yml logs -f katago-engine" -ForegroundColor Red
  exit 1
}

Write-Host "KataGo 엔진 OK (http://127.0.0.1:2718)" -ForegroundColor Green

node scripts/test-katago-respond.mjs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "다음 단계 (프론트):" -ForegroundColor Cyan
Write-Host "  1) js/runtime-config.js 에 katagoRespondApiEnabled: true"
Write-Host "     또는 localStorage BADUK_KATAGO_RESPOND_API_ENABLED=1"
Write-Host "  2) 정적 서버: npm start  (또는 Vercel: npx vercel dev + .env.local)"
Write-Host "  3) katagoRespondApiUrl:"
Write-Host "     - Vercel dev: /api/katago/respond + .env.local KATAGO_SERVER_URL"
Write-Host "     - npm start only: http://127.0.0.1:8080/api/katago/respond"
Write-Host ""
