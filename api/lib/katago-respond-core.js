/**
 * KataGo 응수 프록시 — Vercel serverless / backend/katago-api 공용
 */

/** 교육용: 정책 보강으로 후보 확보, 탐색은 가볍게 (40~60 권장) */
const DEFAULT_KATAGO_MAX_VISITS = 50;

function resolveMaxVisits(frontendPayload) {
  const fromPayload = Number(frontendPayload?.maxVisits);
  if (Number.isFinite(fromPayload) && fromPayload > 0) {
    return fromPayload;
  }
  const fromEnv = Number(process.env.KATAGO_MAX_VISITS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return DEFAULT_KATAGO_MAX_VISITS;
}

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

const MIN_KATAGO_CANDIDATES = 30;

function expandCandidatesFromPolicy(katagoResponse, boardSize, seenKeys, startOrder) {
  const policy =
    katagoResponse?.policy ?? katagoResponse?.analysis?.policy ?? null;
  if (!Array.isArray(policy) || policy.length < boardSize * boardSize) {
    return { added: [], nextOrder: startOrder };
  }

  const passIndex = boardSize * boardSize;
  const ranked = [];

  for (let idx = 0; idx < passIndex && idx < policy.length; idx += 1) {
    const prob = policy[idx];
    if (!Number.isFinite(prob) || prob < 0) {
      continue;
    }
    const x = idx % boardSize;
    const y = Math.floor(idx / boardSize);
    const key = `${x},${y}`;
    if (seenKeys.has(key)) {
      continue;
    }
    const point = { x, y };
    const move = formatGtpPoint(point);
    if (!move) {
      continue;
    }
    ranked.push({ move, x, y, prob });
  }

  ranked.sort((a, b) => b.prob - a.prob);

  const added = [];
  let order = startOrder;

  for (const entry of ranked) {
    if (seenKeys.size >= MIN_KATAGO_CANDIDATES) {
      break;
    }
    const key = `${entry.x},${entry.y}`;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    added.push({
      move: entry.move,
      x: entry.x,
      y: entry.y,
      visits: null,
      order,
      winrate: null,
      fromPolicy: true,
      policyPrior: entry.prob,
    });
    order += 1;
  }

  return { added, nextOrder: order };
}

/**
 * @returns {Array<{ move: string, x: number, y: number, visits: number|null, order: number, winrate: number|null }>}
 */
function extractMoveCandidates(katagoResponse, boardSize) {
  const infos =
    katagoResponse?.moveInfos ??
    katagoResponse?.analysis?.moveInfos ??
    [];

  const candidates = [];
  const seenKeys = new Set();

  for (let index = 0; index < infos.length; index += 1) {
    const info = infos[index];
    const raw = info?.moveCoord ?? info?.move;
    if (!raw || String(raw).trim().toLowerCase() === "pass") {
      continue;
    }

    const point = normalizeMove(raw, boardSize);
    if (!point) {
      continue;
    }

    const move = formatGtpPoint(point);
    if (!move) {
      continue;
    }

    seenKeys.add(`${point.x},${point.y}`);
    candidates.push({
      move,
      x: point.x,
      y: point.y,
      visits: Number.isFinite(info.visits) ? info.visits : null,
      order: Number.isFinite(info.order) ? info.order : index,
      winrate: Number.isFinite(info.winrate) ? info.winrate : null,
      fromPolicy: false,
    });
  }

  const policyExpansion = expandCandidatesFromPolicy(
    katagoResponse,
    boardSize,
    seenKeys,
    candidates.length,
  );
  if (policyExpansion.added.length > 0) {
    candidates.push(...policyExpansion.added);
  }

  candidates.sort((a, b) => a.order - b.order);

  if (candidates.length === 0) {
    const fallback = extractBestMove(katagoResponse, boardSize);
    if (fallback) {
      const move = formatGtpPoint(fallback);
      if (move) {
        candidates.push({
          move,
          x: fallback.x,
          y: fallback.y,
          visits: null,
          order: 0,
          winrate: null,
        });
      }
    }
  }

  return candidates;
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
    maxVisits: resolveMaxVisits(frontendPayload),
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

function buildAllowMovesFromRegion(frontendPayload, boardSize) {
  const region = frontendPayload?.allowedRegion;
  if (!region || !Number.isInteger(region.minX)) {
    return null;
  }

  const occupied = new Set();
  for (const stone of [
    ...(frontendPayload.initialStones ?? []),
    ...(frontendPayload.stones ?? []),
  ]) {
    if (Number.isInteger(stone?.x) && Number.isInteger(stone?.y)) {
      occupied.add(`${stone.x},${stone.y}`);
    }
  }

  const allowMoves = [];
  for (let x = region.minX; x <= region.maxX; x += 1) {
    for (let y = region.minY; y <= region.maxY; y += 1) {
      if (occupied.has(`${x},${y}`)) {
        continue;
      }
      const label = formatGtpPoint({ x, y });
      if (label) {
        allowMoves.push(label);
      }
    }
  }

  return allowMoves.length > 0 ? allowMoves : null;
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
    maxVisits: normalized.maxVisits,
    includeOwnership: false,
    includePolicy: true,
    rootPolicyTemperature:
      Number(process.env.KATAGO_ROOT_POLICY_TEMPERATURE) || 1.15,
  };

  if (initialStones.length > 0) {
    payload.initialStones = initialStones;
  }

  // allowMoves: goban katago-server 422 이슈 — 영역 제한은 프론트 candidates 필터로 처리
  // (KATAGO_USE_ALLOW_MOVES=true 일 때만 재활성화)
  if (process.env.KATAGO_USE_ALLOW_MOVES === "true") {
    const allowMoves = buildAllowMovesFromRegion(frontendPayload, boardSize);
    if (allowMoves) {
      payload.allowMoves = allowMoves;
    }
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

  console.log("[katago-respond-core] POST", endpoint.toString());
  console.log(
    "[katago-respond-core] upstream payload",
    JSON.stringify(katagoPayload, null, 2),
  );

  const katagoStarted = Date.now();
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(katagoPayload),
  });
  const katagoElapsedMs = Date.now() - katagoStarted;

  if (!response.ok) {
    const upstreamText = await response.text();
    let upstreamJson = null;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : null;
    } catch {
      upstreamJson = null;
    }

    console.error(
      "[katago-respond-core] upstream HTTP",
      response.status,
      upstreamText,
    );

    const error = new Error(
      `KataGo server failed with HTTP ${response.status}: ${upstreamText}`,
    );
    error.code = "KATAGO_UPSTREAM_ERROR";
    error.upstreamStatus = response.status;
    error.upstreamBody = upstreamText;
    error.upstreamJson = upstreamJson;
    error.katagoElapsedMs = katagoElapsedMs;
    throw error;
  }

  const body = await response.json();
  return { body, katagoElapsedMs };
}

/**
 * @param {object} frontendPayload
 * @returns {Promise<{ move: string, source: "katago" }>}
 */
async function produceKatagoRespond(frontendPayload) {
  const requestStart = Date.now();
  const boardSize = Number(frontendPayload?.boardSize) || 19;
  const { body: katagoResponse, katagoElapsedMs } = await requestKatagoAnalysis(
    frontendPayload,
  );
  const candidates = extractMoveCandidates(katagoResponse, boardSize);

  if (candidates.length === 0) {
    const error = new Error("KataGo response did not contain a usable move.");
    error.code = "KATAGO_NO_MOVE";
    throw error;
  }

  const top = candidates[0];

  const moveInfosCount = (
    katagoResponse?.moveInfos ??
    katagoResponse?.analysis?.moveInfos ??
    []
  ).length;
  const policyExpandedCount = candidates.filter((c) => c.fromPolicy).length;

  const totalElapsedMs = Date.now() - requestStart;

  console.log(
    "[katago-respond-core] totalCandidates",
    candidates.length,
    "moveInfos",
    moveInfosCount,
    "policyExpanded",
    policyExpandedCount,
  );
  console.log("[katago-respond-core] timing", {
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
    maxVisits: resolveMaxVisits(frontendPayload),
  });

  return {
    move: top.move,
    source: "katago",
    candidates,
    totalCandidates: candidates.length,
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
  };
}

module.exports = {
  DEFAULT_KATAGO_MAX_VISITS,
  produceKatagoRespond,
  toKatagoPayload,
  buildGobanAnalysisPayload,
  extractBestMove,
  extractMoveCandidates,
  formatGtpPoint,
  resolveMaxVisits,
};
