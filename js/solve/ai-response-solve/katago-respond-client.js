import { formatCoordLabel } from "./black-sequence.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";

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

    const point = parseKatagoMove(data?.move, boardSize);
    if (!point) {
      return {
        ok: false,
        needsServer: true,
        message: "AI 응수 서버 연결 필요 (좌표 오류)",
      };
    }

    return { ok: true, point, source: KATAGO_SOURCE };
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
