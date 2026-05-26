import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { getExpectedBlackAnswerCount, normalizeAnswerMoveCount } from "./constants.js";

/**
 * @param {object} problem
 * @param {number} boardSize
 * @returns {{ answerMoveCount: number, blackAnswers: Array<{ x: number, y: number, label: string }> }}
 */
export function resolveBlackAnswerConfig(problem, boardSize = 13) {
  const answerMoveCount = normalizeAnswerMoveCount(
    problem?.answerMoveCount ?? problem?.answer_move_count ?? 1,
  );

  let blackAnswers = normalizeBlackAnswerSequence(
    problem?.blackAnswerSequence ?? problem?.black_answer_sequence,
    boardSize,
  );

  if (blackAnswers.length === 0 && problem?.correctMove) {
    blackAnswers = [
      {
        x: problem.correctMove.x,
        y: problem.correctMove.y,
        label: formatCoordLabel(problem.correctMove),
      },
    ];
  }

  const expectedBlack = getExpectedBlackAnswerCount(answerMoveCount);
  if (blackAnswers.length > expectedBlack) {
    blackAnswers = blackAnswers.slice(0, expectedBlack);
  }

  return { answerMoveCount, blackAnswers };
}

export function isCorrectBlackMove(point, expectedAnswer) {
  if (!expectedAnswer) {
    return false;
  }
  return point.x === expectedAnswer.x && point.y === expectedAnswer.y;
}

export function normalizeBlackAnswerSequence(raw, boardSize) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const answers = [];

  raw.forEach((entry) => {
    let point = null;
    let label = "";

    if (typeof entry === "string") {
      point = parseGtpCoordinate(entry, boardSize);
      label = entry;
    } else if (entry?.move && typeof entry.move === "string") {
      point = parseGtpCoordinate(entry.move, boardSize);
      label = entry.move;
    } else if (entry?.move && typeof entry.move === "object") {
      point = { x: Number(entry.move.x), y: Number(entry.move.y) };
      label = formatCoordLabel(point);
    } else if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
      point = { x: entry.x, y: entry.y };
      label = formatCoordLabel(point);
    }

    if (!point) {
      return;
    }

    answers.push({ x: point.x, y: point.y, label });
  });

  return answers;
}

export function formatCoordLabel(point) {
  if (!point) {
    return "";
  }
  const col = String.fromCharCode("a".charCodeAt(0) + point.x);
  return `${col.toUpperCase()}${point.y + 1}`;
}

/** admin 저장용: [{ move: "D4" }, ...] */
export function toBlackAnswerSequencePayload(blackAnswers) {
  return (blackAnswers ?? []).map((entry) => ({
    move: entry.label ?? formatCoordLabel(entry),
  }));
}

/** correct_move 동기화 */
export function syncLegacyCorrectMove(problem) {
  const first = problem.blackAnswerSequence?.[0];
  if (first && typeof first === "object" && Number.isInteger(first.x)) {
    problem.correctMove = { x: first.x, y: first.y };
    return;
  }

  const normalized = normalizeBlackAnswerSequence(problem.blackAnswerSequence, 13);
  if (normalized[0]) {
    problem.correctMove = { x: normalized[0].x, y: normalized[0].y };
  }
}
