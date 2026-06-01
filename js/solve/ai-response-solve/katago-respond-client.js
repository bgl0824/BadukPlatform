import { formatCoordLabel } from "./black-sequence.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import {
  isForbiddenWrongRevealReason,
  resolveAiResponseStyle,
  selectTacticalWhiteMove,
  selectWrongRevealKatagoFirstMove,
  WRONG_REVEAL_KATAGO_TOP_N,
} from "./tactical-response-engine.js";
import {
  computeAllowedRegion,
  DEFAULT_REGION_MARGIN,
  filterCandidatesInRegion,
  isPointInAllowedRegion,
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
/** 오답 응수(wrong reveal) — 정확도 우선 */
const WRONG_KATAGO_MAX_VISITS = 24;
const WRONG_KATAGO_MAX_TIME = 0.45;
const WRONG_KATAGO_REPLACE_MS = 3000;
const WRONG_KATAGO_REPLACE_MS_MIN = 1000;
const WRONG_KATAGO_REPLACE_MS_MAX = 3000;
/** requestStart 로그·캐시 확인용 — Network 탭에서 이 문자열로 배포본 구분 */
export const WRONG_REVEAL_LIMITS_TAG = "24.0.45.3000";
export const KATAGO_SELECTION_LOG_TAG = "katago-candidate-selection-v1";

/** wrong-reveal 최종 응수 출처 (로그·디버그용) */
export const SELECTED_SOURCE_KATAGO = "katago";
export const SELECTED_SOURCE_KATAGO_TACTICAL_BOOST = "katago_tactical_boost";
export const SELECTED_SOURCE_TACTICAL_OVERRIDE = "tactical_override";
export const SELECTED_SOURCE_LOCAL_TACTICAL = "local_tactical";

function formatKatagoCandidatePolicy(policyPrior) {
  if (policyPrior == null || !Number.isFinite(Number(policyPrior))) {
    return "-";
  }
  return Number(policyPrior).toFixed(3);
}

function formatKatagoCandidateLine(candidate) {
  const visits =
    candidate?.visits != null && Number.isFinite(Number(candidate.visits))
      ? String(candidate.visits)
      : "-";
  const policy = formatKatagoCandidatePolicy(candidate?.policyPrior);
  return `${candidate?.move ?? "?"} visits=${visits} policy=${policy}`;
}

function isSameMovePoint(candidate, selected) {
  if (!candidate || !selected?.point) {
    return false;
  }
  if (
    Number.isInteger(candidate.x) &&
    Number.isInteger(candidate.y) &&
    Number.isInteger(selected.point.x) &&
    Number.isInteger(selected.point.y)
  ) {
    return candidate.x === selected.point.x && candidate.y === selected.point.y;
  }
  const candidateMove = candidate.move ?? formatCoordLabel(candidate);
  const selectedMove = selected.move ?? formatCoordLabel(selected.point);
  return Boolean(candidateMove && selectedMove && candidateMove === selectedMove);
}

function findKatagoRankOfSelected(rawCandidates, selected) {
  if (!selected?.point || !Array.isArray(rawCandidates)) {
    return null;
  }
  const index = rawCandidates.findIndex((candidate) =>
    isSameMovePoint(candidate, selected),
  );
  return index >= 0 ? index + 1 : null;
}

function resolveKatagoMoveSelectionSource(rawCandidates, selected) {
  const katagoFirst = rawCandidates?.[0];
  if (!katagoFirst || !selected?.point) {
    return SELECTED_SOURCE_TACTICAL_OVERRIDE;
  }
  return isSameMovePoint(katagoFirst, selected)
    ? SELECTED_SOURCE_KATAGO
    : SELECTED_SOURCE_TACTICAL_OVERRIDE;
}

function buildKatagoCandidateSelectionBreakdown({
  rawCandidates,
  selected,
  selectedReason,
  selectionMeta = null,
}) {
  const top5 = (rawCandidates ?? []).slice(0, 5);
  const katagoTopMove = selectionMeta?.katagoTopMove ?? top5[0]?.move ?? null;
  const selectedMove =
    selectionMeta?.selectedMove ?? selected?.move ?? null;
  const selectedSource =
    selectionMeta?.selectedSource ??
    resolveKatagoMoveSelectionSource(rawCandidates, selected);
  const selectedKatagoRank =
    selectionMeta?.selectedKatagoRank ??
    findKatagoRankOfSelected(rawCandidates, selected);
  const matchesKatagoTop =
    selectionMeta?.matchesKatagoTop ??
    selectedSource === SELECTED_SOURCE_KATAGO;

  return {
    katagoCandidates: top5.map((candidate) => formatKatagoCandidateLine(candidate)),
    katagoTopMove,
    selectedMove,
    selectedReason,
    selectedSource,
    selectedKatagoRank,
    matchesKatagoTop,
    tacticalReason: selectionMeta?.tacticalReason ?? selectedReason ?? null,
    overrideAllowed: selectionMeta?.overrideAllowed ?? false,
    katagoTopN: selectionMeta?.katagoTopN ?? WRONG_REVEAL_KATAGO_TOP_N,
    pickMode: selectionMeta?.pickMode ?? null,
    katagoTopInRegion: selectionMeta?.katagoTopInRegion ?? null,
    katagoTopScoreable: selectionMeta?.katagoTopScoreable ?? null,
    strictPickMode:
      selectionMeta?.strictPickMode ?? selectionMeta?.decisionTrace?.strictPickMode ?? null,
    scoreableCheck: selectionMeta?.scoreableCheck ?? selectionMeta?.decisionTrace?.scoreableCheck ?? null,
    decisionTrace: selectionMeta?.decisionTrace ?? null,
  };
}

function logKatagoCandidateSelectionBreakdown({
  rawCandidates,
  selected,
  selectedReason,
  selectionMeta = null,
}) {
  const breakdown = buildKatagoCandidateSelectionBreakdown({
    rawCandidates,
    selected,
    selectedReason,
    selectionMeta,
  });
  console.warn("[KatagoRespond] katago candidate selection", breakdown);
  if (breakdown.scoreableCheck) {
    console.warn("[KatagoRespond] katago top scoreable check", {
      katagoTopInRegion: breakdown.katagoTopInRegion,
      katagoTopScoreable: selectionMeta?.katagoTopScoreable ?? null,
      scoreableCheck: breakdown.scoreableCheck,
    });
  }
}

function readConfiguredWrongLimit(configKey) {
  const raw = window.BadukConfig?.[configKey];
  const parsed = Number(raw);
  return {
    raw,
    parsed: Number.isFinite(parsed) ? parsed : null,
  };
}

function resolveWrongRevealLimitsWithTrace() {
  const configVisits = readConfiguredWrongLimit("katagoWrongMaxVisits");
  const configTime = readConfiguredWrongLimit("katagoWrongMaxTime");
  const configReplace = readConfiguredWrongLimit("katagoWrongReplaceMs");

  const visitsBase =
    configVisits.parsed != null && configVisits.parsed > 0
      ? configVisits.parsed
      : WRONG_KATAGO_MAX_VISITS;
  const visitsSource =
    configVisits.parsed != null && configVisits.parsed > 0
      ? "BadukConfig.katagoWrongMaxVisits"
      : "client constant fallback";

  const timeBase =
    configTime.parsed != null && configTime.parsed > 0
      ? configTime.parsed
      : WRONG_KATAGO_MAX_TIME;
  const timeSource =
    configTime.parsed != null && configTime.parsed > 0
      ? "BadukConfig.katagoWrongMaxTime"
      : "client constant fallback";

  const maxVisits = Math.min(visitsBase, WRONG_KATAGO_MAX_VISITS);
  const maxTime = Math.min(timeBase, WRONG_KATAGO_MAX_TIME);

  let replaceMs = WRONG_KATAGO_REPLACE_MS;
  let replaceSource = "client constant fallback";
  if (configReplace.parsed != null && configReplace.parsed > 0) {
    replaceMs = Math.min(
      Math.max(configReplace.parsed, WRONG_KATAGO_REPLACE_MS_MIN),
      WRONG_KATAGO_REPLACE_MS_MAX,
    );
    replaceSource = "BadukConfig.katagoWrongReplaceMs (clamped)";
  }

  return {
    maxVisits,
    maxTime,
    replaceMs,
    trace: {
      clientLimitsTag: WRONG_REVEAL_LIMITS_TAG,
      clientConstants: {
        maxVisits: WRONG_KATAGO_MAX_VISITS,
        maxTime: WRONG_KATAGO_MAX_TIME,
        replaceMs: WRONG_KATAGO_REPLACE_MS,
      },
      badukConfig: {
        katagoWrongMaxVisits: configVisits,
        katagoWrongMaxTime: configTime,
        katagoWrongReplaceMs: configReplace,
        wrongRevealLimitsTag: window.BadukConfig?.wrongRevealLimitsTag ?? null,
      },
      resolveSteps: {
        maxVisits: {
          source: visitsSource,
          base: visitsBase,
          ceiling: WRONG_KATAGO_MAX_VISITS,
          resolved: maxVisits,
        },
        maxTime: {
          source: timeSource,
          base: timeBase,
          ceiling: WRONG_KATAGO_MAX_TIME,
          resolved: maxTime,
        },
        replaceMs: {
          source: replaceSource,
          resolved: replaceMs,
        },
      },
    },
  };
}

console.info("[KatagoRespond] client module loaded", {
  limitsTag: WRONG_REVEAL_LIMITS_TAG,
  selectionLogTag: KATAGO_SELECTION_LOG_TAG,
  wrongRevealConstants: {
    maxVisits: WRONG_KATAGO_MAX_VISITS,
    maxTime: WRONG_KATAGO_MAX_TIME,
    replaceMs: WRONG_KATAGO_REPLACE_MS,
  },
});

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
  return resolveWrongRevealLimitsWithTrace().maxVisits;
}

function getWrongKatagoMaxTime() {
  return resolveWrongRevealLimitsWithTrace().maxTime;
}

function getWrongKatagoReplaceMs() {
  return resolveWrongRevealLimitsWithTrace().replaceMs;
}

function resolveKatagoLimits(studentMoveResult) {
  if (studentMoveResult === "wrong") {
    const { maxVisits, maxTime, replaceMs } = resolveWrongRevealLimitsWithTrace();
    return { maxVisits, maxTime, replaceMs };
  }
  return {
    maxVisits: getKatagoRespondMaxVisits(),
    maxTime: getKatagoRespondMaxTime(),
    replaceMs: 0,
  };
}

function logWrongRevealLimitsResolved(limits) {
  const traced = resolveWrongRevealLimitsWithTrace();
  console.info("[KatagoRespond] wrong reveal limits resolved", {
    limitsTag: WRONG_REVEAL_LIMITS_TAG,
    resolved: limits,
    trace: traced.trace,
  });
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

function parseKatagoMove(move, boardSize) {
  if (typeof move === "string") {
    return parseGtpCoordinate(move, boardSize);
  }
  if (Number.isInteger(move?.x) && Number.isInteger(move?.y)) {
    return { x: move.x, y: move.y };
  }
  return null;
}

function isSameBoardPoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function resolveKatagoCandidatePoint(entry, boardSize) {
  const pointFromMove = entry?.move ? parseKatagoMove(entry.move, boardSize) : null;
  const pointFromApi =
    Number.isInteger(entry?.x) && Number.isInteger(entry?.y)
      ? { x: entry.x, y: entry.y }
      : null;
  const coordMismatch = Boolean(
    pointFromMove &&
      pointFromApi &&
      !isSameBoardPoint(pointFromMove, pointFromApi),
  );
  const point = pointFromMove ?? pointFromApi;

  return {
    point,
    pointFromMove,
    pointFromApi,
    coordMismatch,
  };
}

function auditKatagoCandidateCoords({
  candidate,
  boardSize,
  katagoBoardXSize = null,
  katagoBoardYSize = null,
}) {
  if (!candidate) {
    return null;
  }

  const move = candidate.move ?? null;
  const parsedCoords = move ? parseKatagoMove(move, boardSize) : null;
  const parsedCoordsBoard19 = move ? parseKatagoMove(move, 19) : null;
  const apiCoords =
    Number.isInteger(candidate.x) && Number.isInteger(candidate.y)
      ? { x: candidate.x, y: candidate.y }
      : null;

  return {
    boardSize,
    katagoBoardXSize,
    katagoBoardYSize,
    move,
    parsedCoords,
    parsedX: parsedCoords?.x ?? null,
    parsedY: parsedCoords?.y ?? null,
    parsedCoordsBoard19,
    apiCoords,
    coordsToMove: parsedCoords ? formatCoordLabel(parsedCoords) : null,
    coordsToMoveFromApi: apiCoords ? formatCoordLabel(apiCoords) : null,
    coordMismatch: Boolean(
      parsedCoords &&
        apiCoords &&
        !isSameBoardPoint(parsedCoords, apiCoords),
    ),
  };
}

function normalizeApiCandidates(data, boardSize, katagoBoardXSize = null, katagoBoardYSize = null) {
  const fromApi = Array.isArray(data?.candidates) ? data.candidates : [];
  const coordAudits = [];
  const normalized = fromApi
    .map((entry, index) => {
      const resolved = resolveKatagoCandidatePoint(entry, boardSize);
      const point = resolved.point;

      if (!point) {
        return null;
      }

      if (index < 5) {
        coordAudits.push({
          rank: index + 1,
          ...auditKatagoCandidateCoords({
            candidate: { move: entry.move, x: entry.x, y: entry.y },
            boardSize,
            katagoBoardXSize,
            katagoBoardYSize,
          }),
          usedPoint: point,
          usedCoordsToMove: formatCoordLabel(point),
          coordMismatch: resolved.coordMismatch,
        });
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
        apiCoords: resolved.pointFromApi,
        coordMismatch: resolved.coordMismatch,
      };
    })
    .filter(Boolean);

  if (normalized.length > 0) {
    console.warn("[KatagoRespond] katago candidate coord audit", {
      clientBoardSize: boardSize,
      katagoBoardXSize,
      katagoBoardYSize,
      topCandidate: coordAudits[0] ?? null,
      top5: coordAudits,
    });
    return normalized.sort((a, b) => a.order - b.order);
  }

  const singleResolved = resolveKatagoCandidatePoint(
    { move: data?.move, x: data?.x, y: data?.y },
    boardSize,
  );
  const single = singleResolved.point ?? parseKatagoMove(data?.move, boardSize);
  if (!single) {
    return [];
  }

  console.warn("[KatagoRespond] katago candidate coord audit", {
    clientBoardSize: boardSize,
    katagoBoardXSize,
    katagoBoardYSize,
    topCandidate: auditKatagoCandidateCoords({
      candidate: { move: data?.move, x: data?.x, y: data?.y },
      boardSize,
      katagoBoardXSize,
      katagoBoardYSize,
    }),
    usedPoint: single,
    usedCoordsToMove: formatCoordLabel(single),
  });

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
  rawCandidates = [],
  katagoBoardXSize = null,
  katagoBoardYSize = null,
  allowedRegion = null,
}) {
  if (studentMoveResult === "wrong") {
    return selectWrongRevealKatagoFirstMove({
      rawCandidates,
      regionCandidates,
      stones,
      boardSize,
      stoneColors,
      lastBlackMove: lastMove,
      problem,
      katagoBoardXSize,
      katagoBoardYSize,
      allowedRegion,
    });
  }

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
    selectedSource: SELECTED_SOURCE_LOCAL_TACTICAL,
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
    selectedSource: SELECTED_SOURCE_LOCAL_TACTICAL,
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
  katagoBoardXSize = null,
  katagoBoardYSize = null,
}) {
  const education = buildTacticalSelection({
    regionCandidates,
    stones,
    boardSize,
    stoneColors,
    lastMove,
    problem,
    studentMoveResult,
    rawCandidates,
    katagoBoardXSize,
    katagoBoardYSize,
    allowedRegion,
  });

  logKatagoCandidateSelectionBreakdown({
    rawCandidates,
    selected: education.selected,
    selectedReason: education.selectedReason,
    selectionMeta: education.selectionMeta ?? null,
  });

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

  if (!isPointInAllowedRegion(selected.point, allowedRegion)) {
    console.warn("[KatagoRespond] selected move outside problem region — rejected", {
      move: selected.move,
      allowedRegion,
    });
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
        reason: "selected_out_of_region",
      });
    }
    return null;
  }

  const totalElapsedMs = Date.now() - requestStart;
  const moveSelectionSource =
    education.selectionMeta?.selectedSource ??
    resolveKatagoMoveSelectionSource(rawCandidates, selected);
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
    selectedSource: moveSelectionSource,
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
    selectionMeta: education.selectionMeta ?? null,
    requestStart: new Date(requestStart).toISOString(),
    katagoElapsedMs,
    totalElapsedMs,
    usedLocalFallback: false,
  };
  logKatagoRespondSuccess("tactical selection", {
    selectedSource: moveSelectionSource,
    selectedKatagoRank:
      education.selectionMeta?.selectedKatagoRank ??
      findKatagoRankOfSelected(rawCandidates, selected),
    katagoTopMove: education.selectionMeta?.katagoTopMove ?? rawCandidates?.[0]?.move ?? null,
    tacticalReason: education.selectionMeta?.tacticalReason ?? success.selectedReason,
    overrideAllowed: education.selectionMeta?.overrideAllowed ?? false,
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
  replaceMs,
  reason,
}) {
  const totalElapsedMs = Date.now() - requestStart;
  console.warn("[KatagoRespond] wrong-reveal using local tactical", {
    reason,
    selectedSource: SELECTED_SOURCE_LOCAL_TACTICAL,
    limitsTag: WRONG_REVEAL_LIMITS_TAG,
    maxVisits,
    maxTime,
    replaceMs,
    katagoElapsedMs,
    replaceWindowMissedByMs:
      replaceMs != null && katagoElapsedMs > replaceMs
        ? katagoElapsedMs - replaceMs
        : null,
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
    selectedSource: SELECTED_SOURCE_LOCAL_TACTICAL,
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
  const rawBody = await response.text();
  let data = {};
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = {
        parseError: true,
        rawBodyPreview: rawBody.slice(0, 2000),
      };
    }
  }
  return { response, data, rawBody };
}

function logKatagoUpstreamHttpErrorDetail({
  httpStatus,
  boardSize,
  payload,
  data,
  rawBody,
  katagoElapsedMs,
  studentMoveResult,
}) {
  const detail = {
    httpStatus,
    boardSize,
    requestBoardSize: payload?.boardSize ?? null,
    studentMoveResult,
    katagoElapsedMs,
    errorCode: data?.code ?? null,
    errorMessage: data?.error ?? null,
    upstreamStatus: data?.upstreamStatus ?? null,
    upstreamBody: data?.upstreamBody ?? null,
    upstreamJson: data?.upstreamJson ?? null,
    rawBodyPreview:
      data?.rawBodyPreview ??
      (rawBody && !data?.error ? rawBody.slice(0, 500) : null),
    responseBody: data,
  };
  console.warn("[KatagoRespond] upstream HTTP error detail", detail);
  return detail;
}

async function processKatagoRespondResponse({
  response,
  data,
  rawBody = "",
  payload = null,
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
    const errorDetail = logKatagoUpstreamHttpErrorDetail({
      httpStatus: response.status,
      boardSize,
      payload,
      data,
      rawBody,
      katagoElapsedMs,
      studentMoveResult,
    });
    logKatagoRespondFailure("upstream HTTP error", {
      httpStatus: response.status,
      studentMoveResult,
      boardSize,
      requestBoardSize: payload?.boardSize ?? null,
      responseBody: data,
      upstreamDetail: errorDetail,
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

  const rawCandidates = normalizeApiCandidates(
    data,
    boardSize,
    data?.katagoBoardXSize ?? data?.boardSize ?? null,
    data?.katagoBoardYSize ?? data?.boardSize ?? null,
  );
  const katagoBoardXSize = data?.katagoBoardXSize ?? data?.boardSize ?? null;
  const katagoBoardYSize = data?.katagoBoardYSize ?? data?.boardSize ?? null;
  const totalCandidates = data?.totalCandidates ?? rawCandidates.length;
  const regionCandidates = filterCandidatesInRegion(
    rawCandidates,
    allowedRegion,
    boardSize,
  );
  const regionCandidateCount = regionCandidates.length;

  console.log("[KatagoRespond] region filter", {
    rawCandidates: totalCandidates,
    inRegion: regionCandidateCount,
    excluded: Math.max(0, totalCandidates - regionCandidateCount),
    allowedRegion,
  });

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
    katagoBoardXSize,
    katagoBoardYSize,
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
      const { response, data, rawBody } = await fetchKatagoRespondPayload(
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
        rawBody,
        payload,
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
    const elapsedAtExpire = Date.now() - requestStart;
    console.warn("[KatagoRespond] replace window expired before KataGo finished", {
      reason: "replace_window_expired",
      selectedSource: SELECTED_SOURCE_LOCAL_TACTICAL,
      replaceMs,
      katagoElapsedMs: elapsedAtExpire,
      replaceWindowMissedByMs: Math.max(0, elapsedAtExpire - replaceMs),
    });
    controller.abort();
    if (immediateFallback.ok) {
      return formatWrongRevealFallbackResult({
        fallback: immediateFallback,
        allowedRegion,
        requestStart,
        katagoElapsedMs: elapsedAtExpire,
        maxVisits,
        maxTime,
        replaceMs,
        reason: "replace_window_expired",
      });
    }
  } else if (raced.result?.ok) {
    raced.result.usedLocalFallback = false;
    const selectionBreakdown = buildKatagoCandidateSelectionBreakdown({
      rawCandidates: raced.result.rawCandidates,
      selected:
        raced.result.selectedCandidate ??
        { point: raced.result.point, move: raced.result.move },
      selectedReason: raced.result.selectedReason,
      selectionMeta: raced.result.selectionMeta ?? null,
    });
    raced.result.selectedSource = selectionBreakdown.selectedSource;
    logKatagoCandidateSelectionBreakdown({
      rawCandidates: raced.result.rawCandidates,
      selected:
        raced.result.selectedCandidate ??
        { point: raced.result.point, move: raced.result.move },
      selectedReason: raced.result.selectedReason,
    });
    console.info("[KatagoRespond] wrong-reveal selected", {
      ...selectionBreakdown,
      replaceMs,
      katagoElapsedMs: raced.result.katagoElapsedMs,
    });
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
      replaceMs,
      reason: raced.kind === "katago" ? "katago_rejected" : "no_katago",
    });
  }

  const lateKatago = await katagoTask;
  if (lateKatago?.ok) {
    const selectionBreakdown = buildKatagoCandidateSelectionBreakdown({
      rawCandidates: lateKatago.rawCandidates,
      selected:
        lateKatago.selectedCandidate ??
        { point: lateKatago.point, move: lateKatago.move },
      selectedReason: lateKatago.selectedReason,
      selectionMeta: lateKatago.selectionMeta ?? null,
    });
    lateKatago.selectedSource = selectionBreakdown.selectedSource;
    logKatagoCandidateSelectionBreakdown({
      rawCandidates: lateKatago.rawCandidates,
      selected:
        lateKatago.selectedCandidate ??
        { point: lateKatago.point, move: lateKatago.move },
      selectedReason: lateKatago.selectedReason,
    });
    console.info("[KatagoRespond] wrong-reveal selected (late KataGo)", {
      ...selectionBreakdown,
      replaceMs,
      katagoElapsedMs: lateKatago.katagoElapsedMs,
    });
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

  const isWrongReveal = studentMoveResult === "wrong";
  const wrongRevealResolved = isWrongReveal ? resolveWrongRevealLimitsWithTrace() : null;
  const { maxVisits, maxTime, replaceMs } = wrongRevealResolved
    ? wrongRevealResolved
    : resolveKatagoLimits(studentMoveResult);

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
  console.warn("[KatagoRespond] requestStart", {
    at: new Date(requestStart).toISOString(),
    boardSize,
    studentMoveResult,
    maxVisits,
    maxTime,
    replaceMs: isWrongReveal ? replaceMs : null,
    limitsTag: isWrongReveal ? WRONG_REVEAL_LIMITS_TAG : null,
    configWrongMaxVisits: isWrongReveal ? window.BadukConfig?.katagoWrongMaxVisits : null,
    configWrongMaxTime: isWrongReveal ? window.BadukConfig?.katagoWrongMaxTime : null,
    configWrongReplaceMs: isWrongReveal ? window.BadukConfig?.katagoWrongReplaceMs : null,
    configWrongRevealLimitsTag: isWrongReveal
      ? window.BadukConfig?.wrongRevealLimitsTag
      : null,
    wrongRevealResolveTrace: wrongRevealResolved?.trace ?? null,
  });

  if (isWrongReveal) {
    logWrongRevealLimitsResolved({ maxVisits, maxTime, replaceMs });
  }

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
    const { response, data, rawBody } = await fetchKatagoRespondPayload(url, payload);

    const katagoElapsedMs = Date.now() - requestStart;

    if (!response.ok) {
      logKatagoUpstreamHttpErrorDetail({
        httpStatus: response.status,
        boardSize,
        payload,
        data,
        rawBody,
        katagoElapsedMs,
        studentMoveResult,
      });
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
        data?.rawBodyPreview ??
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

    const rawCandidates = normalizeApiCandidates(
      data,
      boardSize,
      data?.katagoBoardXSize ?? data?.boardSize ?? null,
      data?.katagoBoardYSize ?? data?.boardSize ?? null,
    );
    const katagoBoardXSize = data?.katagoBoardXSize ?? data?.boardSize ?? null;
    const katagoBoardYSize = data?.katagoBoardYSize ?? data?.boardSize ?? null;
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
      katagoBoardXSize,
      katagoBoardYSize,
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
