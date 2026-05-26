import { formatCoordLabel } from "./black-sequence.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import { selectEducationalWhiteMove } from "./educational-move-selector.js";
import {
  computeAllowedRegion,
  DEFAULT_REGION_MARGIN,
  filterCandidatesInRegion,
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
    maxVisits: Number(window.BadukConfig?.katagoRespondMaxVisits) || 100,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
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
      return {
        ok: false,
        needsServer: true,
        message: "AI 응수 서버 연결 필요 (잘못된 응답)",
      };
    }

    const rawCandidates = normalizeApiCandidates(data, boardSize);
    const totalCandidates =
      data?.totalCandidates ?? rawCandidates.length;
    const regionCandidates = filterCandidatesInRegion(
      rawCandidates,
      allowedRegion,
      boardSize,
    );
    const regionCandidateCount =
      data?.regionCandidates ?? regionCandidates.length;

    console.log("[KatagoRespond] raw KataGo candidates", rawCandidates);
    console.log("[KatagoRespond] totalCandidates", totalCandidates);
    console.log("[KatagoRespond] allowedRegion", allowedRegion);
    console.log("[KatagoRespond] regionCandidates", regionCandidates);
    console.log("[KatagoRespond] regionCandidateCount", regionCandidateCount);

    if (regionCandidates.length === 0) {
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
        totalCandidates,
        regionCandidateCount: 0,
      };
    }

    const education = selectEducationalWhiteMove({
      regionCandidates,
      stones,
      boardSize,
      stoneColors,
      lastBlackMove: lastMove,
      problem,
    });

    console.log("[KatagoRespond] scoredCandidates", education.scoredCandidates);
    console.log("[KatagoRespond] selectedMove", education.selected ?? null);
    console.log("[KatagoRespond] selectedReason", education.selectedReason);
    console.log("[KatagoRespond] aiResponseStyle", education.style);

    const selected = education.selected;
    if (!selected?.point) {
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
    }

    return {
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
      aiResponseStyle: education.style,
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
