/**
 * KataGo 응수 체인 스모크 테스트
 *
 * 사용:
 *   node scripts/test-katago-respond.mjs
 *   KATAGO_ADAPTER_URL=http://127.0.0.1:8080 node scripts/test-katago-respond.mjs
 */

const engineUrl = process.env.KATAGO_SERVER_URL || "http://127.0.0.1:2718";
const analyzePath = process.env.KATAGO_ANALYZE_PATH || "/api/v1/analysis";
const adapterUrl =
  process.env.KATAGO_ADAPTER_URL || "http://127.0.0.1:8080/api/katago/respond";

async function checkHealth() {
  const healthUrl = new URL("/api/v1/health", engineUrl);
  const response = await fetch(healthUrl);
  const text = await response.text();
  console.log(`[engine health] ${response.status} ${text.slice(0, 120)}`);
  return response.ok;
}

async function checkAdapter() {
  const payload = {
    boardSize: 19,
    moves: [{ color: "B", move: "D4" }],
    lastMove: { color: "B", move: "D4" },
    nextPlayer: "W",
    studentMoveResult: "correct",
    currentPly: 2,
  };

  const response = await fetch(adapterUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  console.log(`[adapter respond] ${response.status}`, data);

  if (!response.ok) {
    throw new Error(`Adapter failed: ${data.error ?? response.status}`);
  }
  if (data.source !== "katago" || !data.move) {
    throw new Error("Expected { move, source: 'katago' }");
  }
  return data;
}

async function main() {
  console.log("KataGo respond smoke test");
  console.log("  engine:", engineUrl);
  console.log("  analyze:", analyzePath);
  console.log("  adapter:", adapterUrl);

  const healthy = await checkHealth().catch((error) => {
    console.error("[engine health] failed:", error.message);
    return false;
  });

  if (!healthy) {
    console.error(
      "\nKataGo 엔진이 없습니다. 먼저 실행하세요:\n" +
        "  docker compose -f docker-compose.katago.yml up -d\n" +
        "  (첫 기동은 모델 로딩으로 1~3분 걸릴 수 있습니다)\n",
    );
    process.exit(1);
  }

  await checkAdapter();
  console.log("\nOK — source:katago 응답 확인. 프론트에서 katagoRespondApiEnabled=true 로 테스트하세요.");
}

main().catch((error) => {
  console.error("\nFAILED:", error.message);
  process.exit(1);
});
