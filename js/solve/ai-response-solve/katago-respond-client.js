import { formatCoordLabel } from "./black-sequence.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import {
  isForbiddenWrongRevealReason,
  resolveAiResponseStyle,
  selectTacticalWhiteMove,
} from "./tactical-response-engine.js";
import {
  computeAllowedRegion,
  DEFAULT_REGION_MARGIN,
  filterCandidatesInRegion,
} from "./problem-region.js";
import {
  logKatagoRespondFailure,
  logKatagoRespondSuccess,
} from "./respond-diagnostics.js";
import {
  KATAGO_SOURCE,
  selectWrongRevealLocalFallback,
  TACTICAL_FALLBACK_SOURCE,
} from "./wrong-response-fallback.js";

function toMoveEntry(move) {
  if (!move) {
    return null;
  }
  const color = move.color === "white" || move.color === "W" ? "W" : "B";
  const label = formatCoordLabel(move);
  if (!label) {
    return null;
  }
  return { color, move: label };
}

const DEFAULT_KATAGO_MAX_VISITS = 8;
const DEFAULT_KATAGO_MAX_TIME = 0.15;
const WRONG_KATAGO_MAX_VISITS = 6;
const WRONG_KATAGO_MAX_TIME = 0.12;
const WRONG_KATAGO_REPLACE_MS = 700;

function getKatagoRespondMaxVisits() {
  const configured = Number(window.BadukConfig?.katagoRespondMaxVisits);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_KATAGO_MAX_VISITS;
}

function getKatagoRespondMaxTime() {
  const configured = Number(window.BadukConfig?.katagoRespondMaxTime);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_KATAGO_MAX_TIME;
}

function getWrongKatagoMaxVisits() {
  const configured = Number(window.BadukConfig?.katagoWrongMaxVisits);
  const base = Number.isFinite(configured) && configured > 0 ? configured : WRONG_KATAGO_MAX_VISITS;
  return Math.min(base, WRONG_KATAGO_MAX_VISITS);
}

function getWrongKatagoMaxTime() {
  const configured = Number(window.BadukConfig?.katagoWrongMaxTime);
  const base = Number.isFinite(configured) && configured > 0 ? configured : WRONG_KATAGO_MAX_TIME;
  return Math.min(base, 0.15);
}

function getWrongKatagoReplaceMs() {
  const configured = Number(window.BadukConfig?.katagoWrongReplaceMs);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(Math.max(configured, 500), 800);
  }
  return WRONG_KATAGO_REPLACE_MS;
}

function resolveKatagoLimits(studentMoveResult) {
  if (studentMoveResult === "wrong") {
    return {
      maxVisits: getWrongKatagoMaxVisits(),
      maxTime: getWrongKatagoMaxTime(),
      replaceMs: getWrongKatagoReplaceMs(),
    };
  }
  return {
    maxVisits: getKatagoRespondMaxVisits(),
    maxTime: getKatagoRespondMaxTime(),
    replaceMs: 0,
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function logKatagoRespondTiming({
  requestStart,
  katagoElapsedMs,
  totalElapsedMs,
  maxVisits,
  maxTime,
  studentMoveResult,
  usedLocalFallback,
}) {
  console.log("[KatagoRespond] timing", {
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
    maxVisits,
    maxTime,
    studentMoveResult,
    usedLocalFallback: Boolean(usedLocalFallback),
  });
}

/**
 * @returns {boolean}
 */
export function isKatagoRespondApiEnabled() {
  const fromConfig = window.BadukConfig?.katagoRespondApiEnabled;
  if (fromConfig === true) {
    return true;
  }
  if (fromConfig === false) {
    return false;
  }
  return window.localStorage?.getItem("BADUK_KATAGO_RESPOND_API_ENABLED") === "1";
}

function getRegionMargin() {
  const configured = Number(window.BadukConfig?.katagoRespondRegionMargin);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return DEFAULT_REGION_MARGIN;
}

function normalizeApiCandidates(data, boardSize) {
  const fromApi = Array.isArray(data?.candidates) ? data.candidates : [];
  const normalized = fromApi
    .map((entry, index) => {
      const point =
        Number.isInteger(entry?.x) && Number.isInteger(entry?.y)
          ? { x: entry.x, y: entry.y }
          : parseKatagoMove(entry?.move, boardSize);

      if (!point) {
        return null;
      }

      return {
        move: entry.move ?? formatCoordLabel(point),
        x: point.x,
        y: point.y,
        visits: entry.visits ?? null,
        order: entry.order ?? index,
        winrate: entry.winrate ?? null,
        policyPrior: entry.policyPrior ?? entry.policy ?? null,
        fromPolicy: entry.fromPolicy === true,
      };
    })
    .filter(Boolean);

  if (normalized.length > 0) {
    return normalized.sort((a, b) => a.order - b.order);
  }

  const single = parseKatagoMove(data?.move, boardSize);
  if (!single) {
    return [];
  }

  return [
    {
      move: data.move ?? formatCoordLabel(single),
      x: single.x,
      y: single.y,
      visits: null,
      order: 0,
      winrate: null,
      policyPrior: null,
    },
  ];
}

function buildTacticalSelection({
  regionCandidates,
  stones,
  boardSize,
  stoneColors,
  lastMove,
  problem,
  studentMoveResult,
}) {
  return selectTacticalWhiteMove({
    regionCandidates,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove: lastMove,
    problem,
    studentMoveResult,
  });
}

function tryWrongRevealLocalFallback({
  allowedRegion,
  stones,
  boardSize,
  stoneColors,
  lastMove,
  problem,
  regionCandidates = [],
  requestStart,
  katagoElapsedMs,
  maxVisits,
  maxTime,
  reason,
}) {
  const fallback = selectWrongRevealLocalFallback({
    region: allowedRegion,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove: lastMove,
    problem,
    regionCandidates,
  });

  if (!fallback.ok) {
    return null;
  }

  const totalElapsedMs = Date.now() - requestStart;
  console.warn("[KatagoRespond] wrong-reveal local fallback", {
    reason,
    katagoElapsedMs,
    selectedReason: fallback.selectedReason,
  });
  logKatagoRespondTiming({
    requestStart,
    katagoElapsedMs,
    totalElapsedMs,
    maxVisits,
    maxTime,
    studentMoveResult: "wrong",
    usedLocalFallback: true,
  });

  return {
    ok: true,
    point: fallback.point,
    source: TACTICAL_FALLBACK_SOURCE,
    move: fallback.move,
    allowedRegion,
    regionCandidates,
    scoredCandidates: fallback.scoredCandidates,
    selectedReason: fallback.selectedReason,
    aiResponseStyle: fallback.aiResponseStyle,
    usedLocalFallback: true,
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
  };
}

function finalizeKatagoSelection({
  regionCandidates,
  stones,
  boardSize,
  stoneColors,
  lastMove,
  problem,
  studentMoveResult,
  allowedRegion,
  rawCandidates,
  totalCandidates,
  regionCandidateCount,
  requestStart,
  katagoElapsedMs,
  maxVisits,
  maxTime,
}) {
  const education = buildTacticalSelection({
    regionCandidates,
    stones,
    boardSize,
    stoneColors,
    lastMove,
    problem,
    studentMoveResult,
  });

  console.log("[KatagoRespond] aiResponseStyle", education.aiResponseStyle ?? education.style);
  console.log("[KatagoRespond] scoredCandidates", education.scoredCandidates);
  console.log("[KatagoRespond] selectedMove", education.selected ?? null);
  console.log("[KatagoRespond] selectedReason", education.selectedReason);

  const selected = education.selected;
  const style = education.aiResponseStyle ?? education.style ?? resolveAiResponseStyle(problem);

  if (
    selected?.point &&
    studentMoveResult === "wrong" &&
    isForbiddenWrongRevealReason(education.selectedReason, style)
  ) {
    console.warn("[KatagoRespond] sacrifice_play on non-sacrifice style — tactical fallback", {
      style,
      rejected: selected.move,
    });
    return tryWrongRevealLocalFallback({
      allowedRegion,
      stones,
      boardSize,
      stoneColors,
      lastMove,
      problem,
      regionCandidates,
      requestStart,
      katagoElapsedMs,
      maxVisits,
      maxTime,
      reason: "forbidden_sacrifice_play",
    });
  }

  if (!selected?.point) {
    if (studentMoveResult === "wrong") {
      return tryWrongRevealLocalFallback({
        allowedRegion,
        stones,
        boardSize,
        stoneColors,
        lastMove,
        problem,
        regionCandidates,
        requestStart,
        katagoElapsedMs,
        maxVisits,
        maxTime,
        reason: "no_tactical_pick",
      });
    }
    return null;
  }

  const totalElapsedMs = Date.now() - requestStart;
  logKatagoRespondTiming({
    requestStart,
    katagoElapsedMs,
    totalElapsedMs,
    maxVisits,
    maxTime,
    studentMoveResult,
    usedLocalFallback: false,
  });

  const success = {
    ok: true,
    point: selected.point,
    source: KATAGO_SOURCE,
    move: selected.move,
    allowedRegion,
    rawCandidates,
    totalCandidates,
    regionCandidates,
    regionCandidateCount,
    scoredCandidates: education.scoredCandidates,
    selectedCandidate: selected,
    selectedReason: education.selectedReason,
    aiResponseStyle: style,
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
    usedLocalFallback: false,
  };
  logKatagoRespondSuccess("tactical selection", {
    selectedReason: success.selectedReason,
    move: success.move,
    studentMoveResult,
    usedLocalFallback: false,
    katagoElapsedMs,
    totalElapsedMs,
  });
  return success;
}

function formatWrongRevealFallbackResult({
  fallback,
  allowedRegion,
  requestStart,
  katagoElapsedMs,
  maxVisits,
  maxTime,
  reason,
}) {
  const totalElapsedMs = Date.now() - requestStart;
  console.warn("[KatagoRespond] wrong-reveal using local tactical", {
    reason,
    katagoElapsedMs,
    selectedReason: fallback.selectedReason,
    move: fallback.move,
    totalElapsedMs,
  });
  logKatagoRespondTiming({
    requestStart,
    katagoElapsedMs,
    totalElapsedMs,
    maxVisits,
    maxTime,
    studentMoveResult: "wrong",
    usedLocalFallback: true,
  });

  return {
    ok: true,
    point: fallback.point,
    source: TACTICAL_FALLBACK_SOURCE,
    move: fallback.move,
    allowedRegion,
    scoredCandidates: fallback.scoredCandidates,
    selectedReason: fallback.selectedReason,
    aiResponseStyle: fallback.aiResponseStyle,
    usedLocalFallback: true,
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
  };
}

async function fetchKatagoRespondPayload(url, payload, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function processKatagoRespondResponse({
  response,
  data,
  boardSize,
  allowedRegion,
  stones,
  stoneColors,
  lastMove,
  problem,
  studentMoveResult,
  requestStart,
  katagoElapsedMs,
  maxVisits,
  maxTime,
}) {
  if (!response.ok) {
    logKatagoRespondFailure("upstream HTTP error", {
      httpStatus: response.status,
      studentMoveResult,
      responseBody: data,
      katagoElapsedMs,
    });
    return { ok: false, httpStatus: response.status, data };
  }

  if (data?.source !== KATAGO_SOURCE) {
    logKatagoRespondFailure("invalid response source", {
      source: data?.source,
      studentMoveResult,
      responseBody: data,
      katagoElapsedMs,
    });
    return { ok: false, invalidSource: true };
  }

  const rawCandidates = normalizeApiCandidates(data, boardSize);
  const totalCandidates = data?.totalCandidates ?? rawCandidates.length;
  const regionCandidates = filterCandidatesInRegion(
    rawCandidates,
    allowedRegion,
    boardSize,
  );
  const regionCandidateCount = data?.regionCandidates ?? regionCandidates.length;

  if (regionCandidates.length === 0) {
    return { ok: false, emptyRegion: true, rawCandidates, totalCandidates };
  }

  const finalized = finalizeKatagoSelection({
    regionCandidates,
    stones,
    boardSize,
    stoneColors,
    lastMove,
    problem,
    studentMoveResult,
    allowedRegion,
    rawCandidates,
    totalCandidates,
    regionCandidateCount,
    requestStart,
    katagoElapsedMs,
    maxVisits,
    maxTime,
  });

  return finalized ? { ok: true, result: finalized } : { ok: false, emptyRegion: true };
}

/**
 * 오답: 로컬 전술을 즉시 계산하고, KataGo가 replaceMs 안에 오면 교체
 */
async function requestKatagoRespondWrong({
  url,
  payload,
  allowedRegion,
  boardSize,
  stones,
  stoneColors,
  lastMove,
  problem,
  requestStart,
  maxVisits,
  maxTime,
  replaceMs,
}) {
  const immediateFallback = selectWrongRevealLocalFallback({
    region: allowedRegion,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove: lastMove,
    problem,
    regionCandidates: [],
  });

  const controller = new AbortController();
  const katagoTask = (async () => {
    try {
      const { response, data } = await fetchKatagoRespondPayload(
        url,
        payload,
        controller.signal,
      );
      const katagoElapsedMs = Date.now() - requestStart;

      if (Number.isFinite(data?.katagoElapsedMs)) {
        console.log("[KatagoRespond] server katagoElapsedMs", data.katagoElapsedMs);
      }

      const processed = await processKatagoRespondResponse({
        response,
        data,
        boardSize,
        allowedRegion,
        stones,
        stoneColors,
        lastMove,
        problem,
        studentMoveResult: "wrong",
        requestStart,
        katagoElapsedMs,
        maxVisits,
        maxTime,
      });

      if (processed.ok && processed.result) {
        return processed.result;
      }
      return null;
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.warn("[KatagoRespond] wrong-reveal katago task failed", error);
      }
      return null;
    }
  })();

  const raced = await Promise.race([
    katagoTask.then((result) => ({ kind: "katago", result })),
    delay(replaceMs).then(() => ({ kind: "wait" })),
  ]);

  if (raced.kind === "wait") {
    controller.abort();
    if (immediateFallback.ok) {
      return formatWrongRevealFallbackResult({
        fallback: immediateFallback,
        allowedRegion,
        requestStart,
        katagoElapsedMs: Date.now() - requestStart,
        maxVisits,
        maxTime,
        reason: "replace_window_expired",
      });
    }
  } else if (raced.result?.ok) {
    raced.result.usedLocalFallback = false;
    return raced.result;
  }

  if (immediateFallback.ok) {
    return formatWrongRevealFallbackResult({
      fallback: immediateFallback,
      allowedRegion,
      requestStart,
      katagoElapsedMs: Date.now() - requestStart,
      maxVisits,
      maxTime,
      reason: raced.kind === "katago" ? "katago_rejected" : "no_katago",
    });
  }

  const lateKatago = await katagoTask;
  if (lateKatago?.ok) {
    return lateKatago;
  }

  logKatagoRespondFailure("wrong-reveal — no move resolved", {
    payload,
    replaceMs,
    immediateFallbackOk: immediateFallback.ok,
    racedKind: raced.kind,
    katagoElapsedMs: Date.now() - requestStart,
  });

  return {
    ok: false,
    needsServer: true,
    message: "AI 응수 서버 연결 필요",
  };
}

/**
 * @param {{
 *   problem: object,
 *   boardSize: number,
 *   stones: object[],
 *   playedMoves?: object[],
 *   initialStones?: object[],
 *   lastMove: object,
 *   stoneColors: { black: string, white: string },
 *   studentMoveResult: "correct" | "wrong",
 *   currentPly: number,
 * }} params
 */
export async function requestKatagoRespond({
  problem,
  boardSize,
  stones,
  playedMoves = [],
  initialStones = [],
  lastMove,
  stoneColors,
  studentMoveResult,
  currentPly,
}) {
  if (!isKatagoRespondApiEnabled()) {
    return { ok: false, disabled: true, needsServer: true };
  }

  const url =
    window.BadukConfig?.katagoRespondApiUrl ||
    window.BadukConfig?.katagoApiUrl ||
    "/api/katago/respond";

  const allowedRegion = computeAllowedRegion({
    boardSize,
    stones,
    initialStones,
    lastMove,
    margin: getRegionMargin(),
  });

  const chronologicalMoves = playedMoves
    .map((move) => toMoveEntry(move))
    .filter(Boolean);

  const { maxVisits, maxTime, replaceMs } = resolveKatagoLimits(studentMoveResult);
  const isWrongReveal = studentMoveResult === "wrong";

  const payload = {
    problemId: problem.id,
    boardSize,
    stones: stones.map((stone) => ({
      x: stone.x,
      y: stone.y,
      color: stone.color,
      mark: stone.mark,
    })),
    moves: chronologicalMoves,
    initialStones: initialStones.map((stone) => ({
      x: stone.x,
      y: stone.y,
      color: stone.color,
      mark: stone.mark,
    })),
    lastMove: {
      color: lastMove.color === "white" ? "W" : "B",
      move: formatCoordLabel(lastMove),
    },
    nextPlayer: "W",
    studentMoveResult,
    currentPly,
    maxVisits,
    maxTime,
  };

  const requestStart = Date.now();
  console.log("[KatagoRespond] requestStart", {
    at: new Date(requestStart).toISOString(),
    studentMoveResult,
    maxVisits,
    maxTime,
    replaceMs: isWrongReveal ? replaceMs : null,
  });

  if (isWrongReveal) {
    return requestKatagoRespondWrong({
      url,
      payload,
      allowedRegion,
      boardSize,
      stones,
      stoneColors,
      lastMove,
      problem,
      requestStart,
      maxVisits,
      maxTime,
      replaceMs,
    });
  }

  try {
    const { response, data } = await fetchKatagoRespondPayload(url, payload);

    const katagoElapsedMs = Date.now() - requestStart;

    if (!response.ok) {
      logKatagoRespondTiming({
        requestStart,
        katagoElapsedMs,
        totalElapsedMs: katagoElapsedMs,
        maxVisits,
        maxTime,
        studentMoveResult,
      });
      const upstreamDetail =
        data?.upstreamBody ??
        (data?.upstreamJson ? JSON.stringify(data.upstreamJson) : null) ??
        data?.error ??
        null;

      console.error("[KatagoRespond] HTTP error", response.status, data);
      if (upstreamDetail) {
        console.error("[KatagoRespond] upstream body", upstreamDetail);
      }

      let message;
      if (response.status === 503) {
        message = "AI 응수 서버 연결 필요 (KataGo 미설정)";
      } else if (upstreamDetail) {
        message = `KataGo 오류 (HTTP ${data?.upstreamStatus ?? response.status}): ${upstreamDetail}`;
      } else {
        message = `KataGo respond HTTP ${response.status}`;
      }

      logKatagoRespondFailure("request failed — HTTP", {
        payload,
        httpStatus: response.status,
        studentMoveResult,
        responseBody: data,
        upstreamBody: upstreamDetail,
        katagoElapsedMs,
      });

      return {
        ok: false,
        needsServer: true,
        message,
        upstreamStatus: data?.upstreamStatus ?? response.status,
        upstreamBody: upstreamDetail,
      };
    }

    if (data?.source !== KATAGO_SOURCE) {
      console.error("[KatagoRespond] invalid source", data?.source);
      logKatagoRespondFailure("request failed — invalid source", {
        payload,
        studentMoveResult,
        responseBody: data,
        katagoElapsedMs,
      });
      logKatagoRespondTiming({
        requestStart,
        katagoElapsedMs,
        totalElapsedMs: Date.now() - requestStart,
        maxVisits,
        maxTime,
        studentMoveResult,
      });

      return {
        ok: false,
        needsServer: true,
        message: "AI 응수 서버 연결 필요 (잘못된 응답)",
      };
    }

    if (Number.isFinite(data?.katagoElapsedMs)) {
      console.log("[KatagoRespond] server katagoElapsedMs", data.katagoElapsedMs);
    }

    const rawCandidates = normalizeApiCandidates(data, boardSize);
    const totalCandidates = data?.totalCandidates ?? rawCandidates.length;
    const regionCandidates = filterCandidatesInRegion(
      rawCandidates,
      allowedRegion,
      boardSize,
    );
    const regionCandidateCount = data?.regionCandidates ?? regionCandidates.length;

    console.log("[KatagoRespond] raw KataGo candidates", rawCandidates);
    console.log("[KatagoRespond] totalCandidates", totalCandidates);
    console.log("[KatagoRespond] allowedRegion", allowedRegion);
    console.log("[KatagoRespond] regionCandidates", regionCandidates);
    console.log("[KatagoRespond] regionCandidateCount", regionCandidateCount);

    if (regionCandidates.length === 0) {
      console.warn("[KatagoRespond] no candidate inside problem region", {
        rawCandidates,
        allowedRegion,
      });

      logKatagoRespondTiming({
        requestStart,
        katagoElapsedMs,
        totalElapsedMs: Date.now() - requestStart,
        maxVisits,
        maxTime,
        studentMoveResult,
      });
      return {
        ok: false,
        needsServer: true,
        outOfRegion: true,
        message: AI_RESPONSE_SOLVE_MESSAGES.noMoveInProblemRegion,
        allowedRegion,
        rawCandidates,
        totalCandidates,
        regionCandidateCount: 0,
      };
    }

    const finalized = finalizeKatagoSelection({
      regionCandidates,
      stones,
      boardSize,
      stoneColors,
      lastMove,
      problem,
      studentMoveResult,
      allowedRegion,
      rawCandidates,
      totalCandidates,
      regionCandidateCount,
      requestStart,
      katagoElapsedMs,
      maxVisits,
      maxTime,
    });

    if (finalized) {
      return finalized;
    }

    return {
      ok: false,
      needsServer: true,
      outOfRegion: true,
      message: AI_RESPONSE_SOLVE_MESSAGES.noMoveInProblemRegion,
      allowedRegion,
      rawCandidates,
      regionCandidates,
      totalCandidates,
      regionCandidateCount,
    };
  } catch (error) {
    console.error("[KatagoRespond] request failed", error);
    logKatagoRespondTiming({
      requestStart,
      katagoElapsedMs: Date.now() - requestStart,
      totalElapsedMs: Date.now() - requestStart,
      maxVisits,
      maxTime,
      studentMoveResult,
    });

    return {
      ok: false,
      needsServer: true,
      message: "AI 응수 서버 연결 필요",
    };
  }
}

function parseKatagoMove(move, boardSize) {
  if (typeof move === "string") {
    return parseGtpCoordinate(move, boardSize);
  }
  if (Number.isInteger(move?.x) && Number.isInteger(move?.y)) {
    return { x: move.x, y: move.y };
  }
  return null;
}
