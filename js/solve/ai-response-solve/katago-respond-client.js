import { formatCoordLabel } from "./black-sequence.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import {
  computeAllowedRegion,
  DEFAULT_REGION_MARGIN,
  selectCandidateInRegion,
} from "./problem-region.js";

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

const KATAGO_SOURCE = "katago";

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
    },
  ];
}

/**
 * @param {{
 *   problem: object,
 *   boardSize: number,
 *   stones: object[],
 *   playedMoves?: object[],
 *   initialStones?: object[],
 *   lastMove: object,
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
    allowedRegion,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.error ??
        (response.status === 503
          ? "AI 응수 서버 연결 필요 (KataGo 미설정)"
          : `KataGo respond HTTP ${response.status}`);
      console.error("[KatagoRespond] HTTP error", response.status, data);
      return { ok: false, needsServer: true, message };
    }

    if (data?.source !== KATAGO_SOURCE) {
      console.error("[KatagoRespond] invalid source", data?.source);
      return {
        ok: false,
        needsServer: true,
        message: "AI 응수 서버 연결 필요 (잘못된 응답)",
      };
    }

    const rawCandidates = normalizeApiCandidates(data, boardSize);

    console.log("[KatagoRespond] raw KataGo candidates", rawCandidates);
    console.log("[KatagoRespond] allowedRegion", allowedRegion);

    const selected = selectCandidateInRegion(
      rawCandidates,
      allowedRegion,
      boardSize,
    );

    console.log("[KatagoRespond] selectedMove", selected ?? null);

    if (!selected?.point) {
      console.warn(
        "[KatagoRespond] no candidate inside problem region",
        { rawCandidates, allowedRegion },
      );
      return {
        ok: false,
        needsServer: true,
        outOfRegion: true,
        message: AI_RESPONSE_SOLVE_MESSAGES.noMoveInProblemRegion,
        allowedRegion,
        rawCandidates,
      };
    }

    return {
      ok: true,
      point: selected.point,
      source: KATAGO_SOURCE,
      move: selected.move,
      allowedRegion,
      rawCandidates,
      selectedCandidate: selected,
    };
  } catch (error) {
    console.error("[KatagoRespond] request failed", error);
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
