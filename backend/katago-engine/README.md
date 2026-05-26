# Lightweight KataGo Engine (512MB)

`ghcr.io/stubbi/katago-server:latest`는 **b28c512** 모델과 `nnCacheSizePowerOfTwo = 20` 때문에 Render Free(512MB)에서 OOM이 납니다.

이 디렉터리는 **응수 1수**용 최소 구성입니다.

## 모델 크기 (kata1, 대략)

| 모델 | .bin.gz | 용도 |
|------|---------|------|
| **b6c96** | ~3–5 MB | 최소 RAM, 약함 |
| **b10c128** | ~11 MB | **권장** (응수기) |
| b15c192 | ~25 MB | 512MB에서 여유 적음 |
| b28c512 | ~200 MB | `latest` 이미지, Free 부적합 |

기본 Dockerfile: `kata1-b10c128-s1141046784-d204142634.bin.gz`

## stubbi 이미지와 env

| 이미지 | 모델 변경 | 설정 변경 |
|--------|-----------|-----------|
| `latest` | **빌드 시만** (`KATAGO_MODEL` build-arg) | `analysis_config.cfg` **볼륨 마운트 가능** |
| `latest-minimal` | `KATAGO_MODEL_PATH` + katago/모델 마운트 | `KATAGO_CONFIG_PATH` |

`latest`에 env만 넣어서 b28→b10 **런타임 교체는 불가**. 커스텀 Dockerfile(이 폴더) 또는 `docker build --build-arg KATAGO_MODEL=...` 필요.

## Dockerfile (Render Free)

- **donor `latest` 이미지 사용 안 함** (b28 271MB pull → 빌드 OOM/실패)
- 베이스: `ghcr.io/stubbi/katago-server:latest-minimal` 만
- KataGo: GitHub `v1.16.4-eigenavx2-linux-x64.zip` (AppImage) → **`--appimage-extract`** 로 raw ELF → `/app/katago` (FUSE 불필요)
- 런타임 libs: `/app/katago-lib` + `LD_LIBRARY_PATH`
- 모델: `media.katagotraining.org` 에서 b10 wget
- 빌드 검증: `/app/katago version` (step 2/5)
- 빌드 로그: `=== [1/5]` … `=== [5/5]` 단계별 echo

Render에서 `Cannot mount AppImage` / `fusermount` 오류가 나면 AppImage를 직접 실행한 것입니다. 최신 Dockerfile은 extract 후 ELF만 사용합니다.

## 로컬 빌드

```bash
docker build -t baduk-katago-engine ./backend/katago-engine
docker run --rm -p 2718:2718 baduk-katago-engine
curl http://127.0.0.1:2718/api/v1/health
```

b6:

```bash
docker build --build-arg KATAGO_MODEL=kata1-b6c96-s175395328-d26788732.bin.gz \
  -t baduk-katago-engine:b6 ./backend/katago-engine
```

## Render Free

1. **New → Web Service → Docker**
2. Root: 저장소 루트, Dockerfile: `backend/katago-engine/Dockerfile`
3. Plan: Free, Port `2718`, Health: `/api/v1/health`
4. (선택) Env `KATAGO_MODEL` = 다른 b10/b6 파일명

Vercel `KATAGO_SERVER_URL` = `https://<service>.onrender.com`

전체 연동: [`docs/katago-respond-deploy.md`](../../docs/katago-respond-deploy.md)

## analysis_config.cfg 요약

- `maxVisits = 25`
- `numAnalysisThreads = 1`, `numSearchThreadsPerAnalysisThread = 1`
- `nnMaxBatchSize = 4`, `numNNServerThreadsPerModel = 1`
- `nnCacheSizePowerOfTwo = 12` (기본 cpu 이미지 20 → OOM 원인)

프론트 어댑터 기본 `maxVisits`도 16으로 낮춤 (`api/lib/katago-respond-core.js`).
