import { isValidBoardPoint, sanitizeBoardPoint } from "./board-point-validation.js";
import { isBoardProblem } from "./problem-type.js";
import { getProblemCorrectSequence } from "./sequence.js";
import { pointKey } from "./rules.js";
import { parseGtpCoordinate } from "../solve/ai-response-ux/coordinates.js";
import { normalizeAnswerMoveCount } from "../solve/ai-response-solve/constants.js";

export const ANSWER_QUALITY = {
  best: "best",
  alternative: "alternative",
  wrong: "wrong",
};

function isSameMove(move, answer) {
  return move.x === answer.x && move.y === answer.y;
}

/**
 * @param {unknown} entry
 * @param {number} boardSize
 * @returns {{ x: number, y: number, label?: string } | null}
 */
export function parseAnswerMoveEntry(entry, boardSize) {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    const point = parseGtpCoordinate(entry, boardSize);
    return point ? { ...point, label: entry } : null;
  }

  if (typeof entry?.move === "string") {
    const point = parseGtpCoordinate(entry.move, boardSize);
    return point ? { ...point, label: entry.move } : null;
  }

  if (entry?.move && typeof entry.move === "object") {
    const point = sanitizeBoardPoint(
      { x: Number(entry.move.x), y: Number(entry.move.y) },
      boardSize,
      "answer_move",
    );
    return point ? { ...point } : null;
  }

  if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
    const point = sanitizeBoardPoint(entry, boardSize, "answer_move");
    return point ? { ...point } : null;
  }

  return null;
}

/**
 * @param {unknown} raw
 * @param {number} boardSize
 * @returns {{ x: number, y: number, label?: string }[]}
 */
export function normalizeAnswerMoveList(raw, boardSize) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const moves = [];

  raw.forEach((entry) => {
    const point = parseAnswerMoveEntry(entry, boardSize);
    if (!point) {
      return;
    }
    const key = pointKey(point);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    moves.push(point);
  });

  return moves;
}

function readRawBestMoves(problem) {
  return problem?.bestMoves ?? problem?.best_moves ?? null;
}

function readRawAlternativeMoves(problem) {
  return problem?.alternativeMoves ?? problem?.alternative_moves ?? null;
}

/**
 * correct_move → best_moves[0] 마이그레이션 및 correct_move 동기화
 * @param {object} problem
 * @param {number} [boardSize=13]
 */
export function normalizeProblemAnswerMoves(problem, boardSize = 13) {
  if (!problem || !isBoardProblem(problem)) {
    return problem;
  }

  let bestMoves = normalizeAnswerMoveList(readRawBestMoves(problem), boardSize);
  const alternativeMoves = normalizeAnswerMoveList(readRawAlternativeMoves(problem), boardSize);

  if (bestMoves.length === 0 && problem.correctMove) {
    const legacy = parseAnswerMoveEntry(problem.correctMove, boardSize);
    if (legacy) {
      bestMoves = [legacy];
    }
  }

  const alternativeKeys = new Set(alternativeMoves.map(pointKey));
  problem.bestMoves = bestMoves.filter((move) => !alternativeKeys.has(pointKey(move)));
  problem.alternativeMoves = alternativeMoves.filter(
    (move) => !problem.bestMoves.some((best) => isSameMove(move, best)),
  );

  if (problem.bestMoves.length > 0) {
    problem.correctMove = { x: problem.bestMoves[0].x, y: problem.bestMoves[0].y };
  } else if (!Array.isArray(problem.correctSequence) || problem.correctSequence.length === 0) {
    problem.correctMove = null;
  }

  return problem;
}

export function getProblemBestMoves(problem, boardSize = 13) {
  normalizeProblemAnswerMoves(problem, boardSize);
  return problem.bestMoves ?? [];
}

export function getProblemAlternativeMoves(problem, boardSize = 13) {
  normalizeProblemAnswerMoves(problem, boardSize);
  return problem.alternativeMoves ?? [];
}

export function formatAnswerMoveLabel(point, boardSize = 13) {
  const parsed = parseAnswerMoveEntry(point, boardSize);
  if (!parsed) {
    return "";
  }
  if (parsed.label) {
    return parsed.label;
  }
  const col = String.fromCharCode("a".charCodeAt(0) + parsed.x);
  return `${col.toUpperCase()}${parsed.y + 1}`;
}

export function formatAnswerMovesSummary(moves, boardSize = 13) {
  const labels = normalizeAnswerMoveList(moves, boardSize).map((move) =>
    formatAnswerMoveLabel(move, boardSize),
  );
  return labels.length > 0 ? labels.join(", ") : "";
}

/**
 * @returns {import("./answer-moves.js").typeof ANSWER_QUALITY[keyof typeof ANSWER_QUALITY] | null}
 */
export function classifyUserMove(move, problem, solvedAnswerKeys = new Set(), boardSize = 13) {
  if (!isBoardProblem(problem) || !isValidBoardPoint(move, boardSize)) {
    return null;
  }

  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 0) {
    const matched = sequence.some(
      (answer) => isSameMove(move, answer) && !solvedAnswerKeys.has(pointKey(answer)),
    );
    return matched ? ANSWER_QUALITY.best : ANSWER_QUALITY.wrong;
  }

  const bestMoves = getProblemBestMoves(problem, boardSize);
  if (bestMoves.some((answer) => isSameMove(move, answer))) {
    return ANSWER_QUALITY.best;
  }

  const alternativeMoves = getProblemAlternativeMoves(problem, boardSize);
  if (alternativeMoves.some((answer) => isSameMove(move, answer))) {
    return ANSWER_QUALITY.alternative;
  }

  return ANSWER_QUALITY.wrong;
}

export function isAcceptedUserMove(move, problem, solvedAnswerKeys = new Set(), boardSize = 13) {
  const quality = classifyUserMove(move, problem, solvedAnswerKeys, boardSize);
  return quality === ANSWER_QUALITY.best || quality === ANSWER_QUALITY.alternative;
}

/**
 * AI 응수형 1수: 허용정답 인정. 다수순은 ply별 확장 예정(현재는 최선 수순만).
 */
export function classifyBlackAnswerMove(point, problem, expectedAnswer, boardSize = 13) {
  if (!expectedAnswer) {
    return ANSWER_QUALITY.wrong;
  }

  if (isSameMove(point, expectedAnswer)) {
    return ANSWER_QUALITY.best;
  }

  const answerMoveCount = normalizeAnswerMoveCount(
    problem?.answerMoveCount ?? problem?.answer_move_count ?? 1,
  );
  if (answerMoveCount !== 1) {
    return ANSWER_QUALITY.wrong;
  }

  const alternativeMoves = getProblemAlternativeMoves(problem, boardSize);
  if (alternativeMoves.some((answer) => isSameMove(point, answer))) {
    return ANSWER_QUALITY.alternative;
  }

  return ANSWER_QUALITY.wrong;
}

export function toAnswerMovesPayload(moves, boardSize = 13) {
  return normalizeAnswerMoveList(moves, boardSize).map((move) => ({
    x: move.x,
    y: move.y,
  }));
}

export function syncProblemAnswerFields(problem, boardSize = 13) {
  normalizeProblemAnswerMoves(problem, boardSize);
  problem.best_moves = toAnswerMovesPayload(problem.bestMoves, boardSize);
  problem.alternative_moves = toAnswerMovesPayload(problem.alternativeMoves, boardSize);
  return problem;
}

export function validateProblemAnswerMoves(problem, occupiedKeys = new Set(), boardSize = 13) {
  if (!isBoardProblem(problem)) {
    return "";
  }

  normalizeProblemAnswerMoves(problem, boardSize);

  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 0) {
    return "";
  }

  if ((problem.bestMoves ?? []).length === 0) {
    return "최선정답을 1곳 이상 지정해 주세요.";
  }

  for (const move of [...(problem.bestMoves ?? []), ...(problem.alternativeMoves ?? [])]) {
    const key = pointKey(move);
    if (occupiedKeys.has(key)) {
      return `정답 좌표가 기존 돌과 겹칩니다: (${move.x}, ${move.y})`;
    }
  }

  return "";
}
