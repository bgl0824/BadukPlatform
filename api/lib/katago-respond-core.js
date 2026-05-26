/**
 * KataGo 응수 프록시 — Vercel serverless / backend/katago-api 공용
 */

function formatGtpPoint(point) {
  if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    return null;
  }
  const col = String.fromCharCode("a".charCodeAt(0) + point.x);
  return `${col.toUpperCase()}${point.y + 1}`;
}

function parseMoveString(value, boardSize = 19) {
  const move = String(value ?? "").trim().toLowerCase();
  if (!move) {
    return null;
  }

  if (/^\d+,\d+$/.test(move)) {
    const [x, y] = move.split(",").map(Number);
    if (x >= 0 && y >= 0 && x < boardSize && y < boardSize) {
      return { x, y };
    }
    return null;
  }

  const match = move.match(/^([a-z])(\d+)$/i);
  if (match) {
    const x = match[1].toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
    const y = Number(match[2]) - 1;
    if (x >= 0 && y >= 0 && x < boardSize && y < boardSize) {
      return { x, y };
    }
  }

  if (/^[a-z][a-z]$/.test(move)) {
    return {
      x: move.charCodeAt(0) - "a".charCodeAt(0),
      y: move.charCodeAt(1) - "a".charCodeAt(0),
    };
  }

  return null;
}

function normalizeMove(candidate, boardSize) {
  if (!candidate) {
    return null;
  }

  if (Number.isInteger(candidate.x) && Number.isInteger(candidate.y)) {
    return { x: candidate.x, y: candidate.y };
  }

  if (Number.isInteger(candidate.col) && Number.isInteger(candidate.row)) {
    return { x: candidate.col, y: candidate.row };
  }

  if (typeof candidate === "string") {
    return parseMoveString(candidate, boardSize);
  }

  return null;
}

function extractBestMove(katagoResponse, boardSize) {
  const firstInfo = katagoResponse?.moveInfos?.[0];
  const candidate =
    katagoResponse?.move ||
    katagoResponse?.bestMove ||
    katagoResponse?.counterMove ||
    firstInfo?.move ||
    firstInfo?.moveCoord ||
    katagoResponse?.analysis?.moveInfos?.[0]?.move ||
    katagoResponse?.analysis?.moveInfos?.[0]?.moveCoord ||
    katagoResponse?.moves?.[0];

  return normalizeMove(candidate, boardSize);
}

function parseLastMove(payload, boardSize) {
  const last = payload?.lastMove;
  if (!last) {
    return null;
  }

  if (typeof last.move === "string") {
    const point = parseMoveString(last.move, boardSize);
    if (!point) {
      return null;
    }
    return {
      ...point,
      color: last.color === "W" ? "white" : "black",
    };
  }

  if (Number.isInteger(last.x) && Number.isInteger(last.y)) {
    return {
      x: last.x,
      y: last.y,
      color: last.color === "W" ? "white" : "black",
    };
  }

  return null;
}

function toKatagoPayload(frontendPayload) {
  const boardSize = Number(frontendPayload.boardSize) || 19;
  const stones = (frontendPayload.stones ?? []).map((stone) => ({
    x: stone.x,
    y: stone.y,
    color: stone.color === "white" || stone.color === "W" ? "white" : "black",
    mark: stone.mark,
  }));

  const playedMoves = Array.isArray(frontendPayload.moves)
    ? frontendPayload.moves
        .map((entry) => {
          if (typeof entry === "string") {
            const point = parseMoveString(entry, boardSize);
            return point ? { ...point, color: "black" } : null;
          }
          if (typeof entry.move === "string") {
            const point = parseMoveString(entry.move, boardSize);
            return point
              ? {
                  ...point,
                  color: entry.color === "W" ? "white" : "black",
                }
              : null;
          }
          if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
            return {
              x: entry.x,
              y: entry.y,
              color:
                entry.color === "white" || entry.color === "W" ? "white" : "black",
            };
          }
          return null;
        })
        .filter(Boolean)
    : stones;

  return {
    boardSize,
    nextColor: "white",
    stones,
    playedMoves,
    lastMove: parseLastMove(frontendPayload, boardSize),
    maxVisits: frontendPayload.maxVisits || 16,
    rules: frontendPayload.rules || "japanese",
    studentMoveResult: frontendPayload.studentMoveResult,
    currentPly: frontendPayload.currentPly,
    initialStones: frontendPayload.initialStones ?? [],
  };
}

function resolveKatagoApiStyle(analyzePath) {
  const configured = (process.env.KATAGO_API_STYLE || "auto").toLowerCase();
  if (configured === "goban" || configured === "legacy") {
    return configured;
  }
  if (analyzePath.includes("analysis")) {
    return "goban";
  }
  return "legacy";
}

function buildGobanAnalysisPayload(frontendPayload) {
  const normalized = toKatagoPayload(frontendPayload);
  const boardSize = normalized.boardSize;

  const moves = normalized.playedMoves
    .map((move) => formatGtpPoint(move))
    .filter(Boolean);

  const initialStones = (normalized.initialStones ?? [])
    .map((stone) => {
      const label = formatGtpPoint({
        x: stone.x,
        y: stone.y,
      });
      if (!label) {
        return null;
      }
      const color =
        stone.color === "white" || stone.color === "W" ? "W" : "B";
      return [color, label];
    })
    .filter(Boolean);

  const payload = {
    moves,
    komi: Number(process.env.KATAGO_KOMI) || 6.5,
    rules: normalized.rules || "japanese",
    boardXSize: boardSize,
    boardYSize: boardSize,
    maxVisits: normalized.maxVisits || 16,
    includeOwnership: false,
    includePolicy: false,
  };

  if (initialStones.length > 0) {
    payload.initialStones = initialStones;
  }

  return payload;
}

async function requestKatagoAnalysis(frontendPayload) {
  const katagoServerUrl = process.env.KATAGO_SERVER_URL || "";
  const analyzePath =
    process.env.KATAGO_ANALYZE_PATH || "/api/v1/analysis";

  if (!katagoServerUrl) {
    const error = new Error("KATAGO_SERVER_URL is not configured on the API server.");
    error.code = "KATAGO_NOT_CONFIGURED";
    throw error;
  }

  const endpoint = new URL(analyzePath, katagoServerUrl);
  const apiStyle = resolveKatagoApiStyle(analyzePath);
  const katagoPayload =
    apiStyle === "goban"
      ? buildGobanAnalysisPayload(frontendPayload)
      : toKatagoPayload(frontendPayload);

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(katagoPayload),
  });

  if (!response.ok) {
    const error = new Error(`KataGo server failed with HTTP ${response.status}`);
    error.code = "KATAGO_UPSTREAM_ERROR";
    throw error;
  }

  return response.json();
}

/**
 * @param {object} frontendPayload
 * @returns {Promise<{ move: string, source: "katago" }>}
 */
async function produceKatagoRespond(frontendPayload) {
  const boardSize = Number(frontendPayload?.boardSize) || 19;
  const katagoResponse = await requestKatagoAnalysis(frontendPayload);
  const point = extractBestMove(katagoResponse, boardSize);

  if (!point) {
    const error = new Error("KataGo response did not contain a usable move.");
    error.code = "KATAGO_NO_MOVE";
    throw error;
  }

  const move = formatGtpPoint(point);
  if (!move) {
    const error = new Error("Failed to format KataGo move.");
    error.code = "KATAGO_INVALID_MOVE";
    throw error;
  }

  return { move, source: "katago" };
}

module.exports = {
  produceKatagoRespond,
  toKatagoPayload,
  buildGobanAnalysisPayload,
  extractBestMove,
  formatGtpPoint,
};
