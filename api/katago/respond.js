const { produceKatagoRespond } = require("../lib/katago-respond-core");

/**
 * Vercel Serverless: POST /api/katago/respond
 * Env: KATAGO_SERVER_URL, KATAGO_ANALYZE_PATH
 */
module.exports = async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed", source: "error" });
    return;
  }

  let requestBody = null;
  try {
    requestBody =
      typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    console.log("[api/katago/respond] request", {
      boardSize: requestBody?.boardSize ?? null,
      studentMoveResult: requestBody?.studentMoveResult ?? null,
      maxVisits: requestBody?.maxVisits ?? null,
      maxTime: requestBody?.maxTime ?? null,
      stoneCount: Array.isArray(requestBody?.stones) ? requestBody.stones.length : 0,
      moveCount: Array.isArray(requestBody?.moves) ? requestBody.moves.length : 0,
      problemId: requestBody?.problemId ?? null,
    });
    const result = await produceKatagoRespond(requestBody ?? {});
    if (result?.katagoElapsedMs != null) {
      console.log("[api/katago/respond] timing", {
        requestStart: result.requestStart,
        katagoElapsedMs: result.katagoElapsedMs,
        totalElapsedMs: result.totalElapsedMs,
      });
    }
    if (result?.candidates?.length) {
      console.log(
        "[api/katago/respond] totalCandidates",
        result.totalCandidates ?? result.candidates.length,
      );
      console.log(
        "[api/katago/respond] candidates (move, visits, order)",
        result.candidates.map((c) => ({
          move: c.move,
          visits: c.visits,
          order: c.order,
        })),
      );
    }
    response.status(200).json(result);
  } catch (error) {
    console.error("[api/katago/respond] failed", {
      boardSize: requestBody?.boardSize ?? null,
      studentMoveResult: requestBody?.studentMoveResult ?? null,
      code: error.code ?? "KATAGO_ERROR",
      message: error.message ?? "KataGo respond failed",
      upstreamStatus: error.upstreamStatus ?? null,
      upstreamBodyPreview: error.upstreamBody
        ? String(error.upstreamBody).slice(0, 800)
        : null,
      katagoElapsedMs: error.katagoElapsedMs ?? null,
    });
    console.error(
      "[api/katago/respond]",
      error.message,
      error.upstreamBody ?? "",
    );
    const status = error.code === "KATAGO_NOT_CONFIGURED" ? 503 : 502;
    response.status(status).json({
      error: error.message ?? "KataGo respond failed",
      code: error.code ?? "KATAGO_ERROR",
      upstreamStatus: error.upstreamStatus ?? null,
      upstreamBody: error.upstreamBody ?? null,
      upstreamJson: error.upstreamJson ?? null,
      source: "error",
    });
  }
};

function setCorsHeaders(response) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
