# KataGo 응수 서버 구축 (로컬 · Render · Vercel)

AI 응수형(`problem_mode = ai_response`)에서 백 수는 **실제 KataGo**만 사용합니다.  
프론트 → `POST /api/katago/respond` → **KataGo 엔진** → `{ move: "E4", source: "katago" }`.

## 아키텍처

```text
브라우저
  │  katagoRespondApiEnabled=true
  ▼
POST /api/katago/respond          ← Vercel serverless 또는 Render Node 어댑터
  │  api/lib/katago-respond-core.js
  ▼
POST {KATAGO_SERVER_URL}/api/v1/analysis   ← goban-app katago-server (Docker)
  │
  ▼
KataGo 바이너리 (CPU/GPU)
```

| 계층 | 역할 | 기본 URL |
|------|------|----------|
| 프론트 | 흑만 두기, `source===katago`일 때만 백 착수 | `/api/katago/respond` |
| 어댑터 | 보드 상태 → KataGo 요청, GTP 좌표 반환 | Vercel `api/katago/respond.js` 또는 `backend/katago-api` |
| 엔진 | 실제 분석 | `http://127.0.0.1:2718` (로컬 Docker) |

권장 엔진: [goban-app/katago-server](https://github.com/goban-app/katago-server)  
엔드포인트: `POST /api/v1/analysis` (기본값, `KATAGO_ANALYZE_PATH`)

### Render Free 512MB — `latest` 이미지 주의

`ghcr.io/stubbi/katago-server:latest`는 **b28c512** (~200MB) + `nnCacheSizePowerOfTwo = 20` (~1M 캐시)이라 **512MB에서 OOM**이 납니다.

| 항목 | `latest` (기본) | 이 저장소 `backend/katago-engine` |
|------|-----------------|-------------------------------------|
| 모델 | b28c512 | **b10c128** (기본) 또는 b6c96 |
| nnCache | 2^20 | **2^12** |
| maxVisits | 10 (cfg) | **25** (응수용) |
| 목적 | 강한 분석 | **백 응수 1수** |

**설정 파일만 마운트**해도 모델은 b28이라 RAM이 줄지 않습니다. **커스텀 이미지**가 필요합니다 → [`backend/katago-engine/README.md`](../backend/katago-engine/README.md), 루트 [`render.yaml`](../render.yaml).

---

## A. 로컬 (가장 빠른 검증)

### 1) Docker로 KataGo + 어댑터 기동

```powershell
cd c:\Users\cwl08\baduk-education-platform
.\scripts\dev-katago-stack.ps1
```

또는:

```bash
docker compose -f docker-compose.katago.yml up -d
# 첫 기동 1~3분 (모델 로딩)
node scripts/test-katago-respond.mjs
```

성공 시:

```text
[adapter respond] 200 { move: '...', source: 'katago' }
```

### 2) 프론트 설정

**방법 1 — `npm start`만 (정적 서버, API는 8080)**

`js/runtime-config.js`:

```javascript
katagoRespondApiEnabled: true,
katagoRespondApiUrl: "http://127.0.0.1:8080/api/katago/respond",
```

**방법 2 — `vercel dev` (같은 출처 `/api/...`)**

`.env.local` (`.env.katago.example` 복사):

```env
KATAGO_SERVER_URL=http://127.0.0.1:2718
KATAGO_ANALYZE_PATH=/api/v1/analysis
KATAGO_API_STYLE=goban
KATAGO_RESPOND_API_ENABLED=true
```

```bash
npx vercel dev
```

빌드 반영:

```bash
npm run build   # runtime-config 재생성
```

브라우저 콘솔에서 `source: 'katago'` 확인.

### 3) 수동 curl

```bash
curl -s http://127.0.0.1:2718/api/v1/health

curl -s -X POST http://127.0.0.1:8080/api/katago/respond \
  -H "Content-Type: application/json" \
  -d '{"boardSize":19,"moves":[{"color":"B","move":"D4"}],"lastMove":{"color":"B","move":"D4"},"studentMoveResult":"correct","currentPly":2}'
```

---

## B. Render (운영 KataGo 엔진)

Vercel 프론트는 **공개 URL**의 KataGo가 필요합니다. 로컬 `127.0.0.1`은 Vercel에서 접근할 수 없습니다.

### 1) KataGo 엔진 — Free 512MB (권장)

**이미지 `ghcr.io/stubbi/katago-server:latest` 사용 금지** (b28 OOM).

1. Render → **New Web Service** → 이 GitHub 저장소 연결
2. **Language**: Docker
3. **Dockerfile Path**: `backend/katago-engine/Dockerfile`
4. **Docker Context**: `backend/katago-engine`
5. Plan: **Free**, Port `2718`, Health: `/api/v1/health`
6. (선택) Env `KATAGO_MODEL` = `kata1-b6c96-s175395328-d26788732.bin.gz` (더 작음)

또는 저장소 루트 [`render.yaml`](../render.yaml) Blueprint 사용.

배포 URL 예: `https://baduk-katago-engine.onrender.com`

첫 기동·콜드 스타트: 30초~2분 (b10 로딩).

### 1-alt) stubbi `latest` (유료/대용량 RAM만)

2GB+ RAM 인스턴스에서만:

- Image: `ghcr.io/stubbi/katago-server:latest`
- 설정 경량화: `analysis_config.cfg` 볼륨 마운트 가능, **모델은 여전히 b28**

### 2) Node 어댑터 (선택, Vercel 대신 API만 Render)

1. **New Web Service** → 이 저장소 연결
2. **Root Directory**: `backend/katago-api`
3. **Start Command**: `npm start`
4. Environment:

```env
KATAGO_SERVER_URL=https://baduk-katago-engine.onrender.com
KATAGO_ANALYZE_PATH=/api/v1/analysis
KATAGO_API_STYLE=goban
ALLOWED_ORIGIN=https://your-app.vercel.app
```

5. URL 예: `https://baduk-katago-api.onrender.com/api/katago/respond`

### 3) Vercel 환경 변수 (프론트 + serverless)

Vercel 프로젝트 → **Settings → Environment Variables** (템플릿: [`docs/vercel-katago-env.example`](vercel-katago-env.example)):

| 변수 | 값 (운영 예) |
|------|----------------|
| `KATAGO_SERVER_URL` | `https://baduk-katago-engine-light.onrender.com` |
| `KATAGO_ANALYZE_PATH` | `/api/v1/analysis` |
| `KATAGO_API_STYLE` | `goban` |
| `KATAGO_RESPOND_API_ENABLED` | `true` |
| `KATAGO_RESPOND_API_URL` | `/api/katago/respond` |
| `AI_RESPONSE_SOLVE_ENABLED` | `true` |
| `ALLOWED_ORIGIN` | `https://your-app.vercel.app` (선택) |

**프록시 경로**

```text
브라우저 → POST /api/katago/respond     (Vercel api/katago/respond.js)
         → POST {KATAGO_SERVER_URL}/api/v1/analysis   (Render katago-server)
         → { move: "E4", source: "katago" }
```

`api/katago/respond.js`, `api/lib/katago-respond-core.js` 가 GitHub에 포함되어 있어야 Vercel에서 동작합니다.

재배포 후 `npm run build` 가 `js/runtime-config.js` 에 `katagoRespondApiEnabled: true` 를 기록합니다.

**배포 후 검증 (Vercel 사이트 URL)**

```bash
curl -s -X POST https://YOUR-APP.vercel.app/api/katago/respond \
  -H "Content-Type: application/json" \
  -d '{"boardSize":19,"moves":[{"color":"B","move":"D4"}],"lastMove":{"color":"B","move":"D4"},"studentMoveResult":"correct","currentPly":2}'
```

응답: `{"move":"...","source":"katago"}`

**Vercel serverless만 쓰는 경우**: 어댑터 Render 서비스 없이 Vercel `api/katago/respond`가 Render KataGo 엔진을 직접 호출합니다.

**Render 어댑터를 쓰는 경우** (serverless 타임아웃 회피):

```env
KATAGO_RESPOND_API_URL=https://baduk-katago-api.onrender.com/api/katago/respond
```

---

## C. 문제 해결

| 증상 | 원인 | 조치 |
|------|------|------|
| `AI 응수 서버 연결 필요` | `katagoRespondApiEnabled=false` | 빌드 env 또는 localStorage `BADUK_KATAGO_RESPOND_API_ENABLED=1` |
| HTTP 503 | `KATAGO_SERVER_URL` 미설정 | Vercel/어댑터 env 확인 |
| HTTP 502 | 엔진 다운·경로 오류 | `curl .../api/v1/health`, `KATAGO_ANALYZE_PATH=/api/v1/analysis` |
| `source: mock` | mock 허용 | `katagoRespondAllowMock`는 false 유지 |
| Vercel에서 502, 로컬 OK | 엔진이 localhost | Render 등 공개 URL로 `KATAGO_SERVER_URL` 변경 |
| 첫 응수 60초+ | 콜드 스타트 | Render 유료 플랜·헬스 cron ping |

---

## D. 환경 변수 요약

| 변수 | 설명 |
|------|------|
| `KATAGO_SERVER_URL` | goban katago-server 베이스 URL |
| `KATAGO_ANALYZE_PATH` | 기본 `/api/v1/analysis` |
| `KATAGO_API_STYLE` | `goban` (권장) 또는 `legacy` |
| `KATAGO_KOMI` | 기본 `6.5` |
| `KATAGO_RESPOND_API_ENABLED` | 프론트 API 호출 (`true`) |
| `KATAGO_RESPOND_API_URL` | 프론트가 호출할 respond URL |
| `ALLOWED_ORIGIN` | CORS |

---

## E. 관련 파일

- `api/katago/respond.js` — Vercel handler
- `api/lib/katago-respond-core.js` — KataGo 프록시
- `backend/katago-api/server.js` — Render Node 어댑터
- `docker-compose.katago.yml` — 로컬 스택
- `scripts/test-katago-respond.mjs` — 스모크 테스트
- `scripts/dev-katago-stack.ps1` — Windows 원클릭 기동
