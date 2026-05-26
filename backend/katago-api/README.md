# BadukPlatform KataGo API Adapter

This is a small Node.js adapter API for connecting BadukPlatform to a deployed KataGo server.

The frontend calls (AI 응수형):

```txt
POST /api/katago/respond
```

Legacy:

```txt
POST /counter-move
```

`/api/katago/respond` returns:

```json
{
  "move": "E4",
  "source": "katago"
}
```

`/counter-move` returns `{ "move": { "x": 4, "y": 9 } }` (legacy shape).

## Environment

Copy `.env.example` values into your Render/AWS environment settings.

```txt
PORT=8080
ALLOWED_ORIGIN=https://badukplatform.vercel.app
KATAGO_SERVER_URL=https://your-katago-engine.onrender.com
KATAGO_ANALYZE_PATH=/api/v1/analysis
KATAGO_API_STYLE=goban
```

권장 엔진: `ghcr.io/stubbi/katago-server:latest` — 전체 가이드는 [`docs/katago-respond-deploy.md`](../../docs/katago-respond-deploy.md).

## Local Run

```bash
npm start
```

Health check:

```txt
GET http://localhost:8080/health
```

Frontend API URL:

```txt
http://localhost:8080/counter-move
```

## Render Deployment

1. Create a new Web Service.
2. Root Directory: `backend/katago-api`
3. Runtime: Node
4. Build Command: leave empty or use `npm install`
5. Start Command: `npm start`
6. Add environment variables from `.env.example`.
7. Copy the deployed `/counter-move` URL into Vercel as `NEXT_PUBLIC_KATAGO_API_URL`.
