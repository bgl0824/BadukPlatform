import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import { getExpectedBlackAnswerCount, normalizeAnswerMoveCount } from "./constants.js";

export function formatCoordLabel(point) {
  if (!point) {
    return "";
  }
  const col = String.fromCharCode("a".charCodeAt(0) + point.x);
  return `${col.toUpperCase()}${point.y + 1}`;
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

export function toBlackAnswerSequencePayload(blackAnswers) {
  return (blackAnswers ?? []).map((entry) => ({
    move: entry.label ?? formatCoordLabel(entry),
  }));
}

const COLOR_BLACK = "black";
const COLOR_WHITE = "white";

/**
 * @typedef {{ color: "black"|"white", x: number, y: number, label: string, ply: number }} SequenceMove
 */

/**
 * @param {unknown} raw
 * @param {number} boardSize
 * @returns {SequenceMove[]}
 */
export function normalizeFullAnswerSequence(raw, boardSize) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const moves = [];

  raw.forEach((entry, index) => {
    let color = null;
    let point = null;
    let label = "";

    const rawColor = String(
      entry?.color ?? entry?.c ?? "",
    )
      .trim()
      .toLowerCase();
    if (rawColor === "b" || rawColor === "black" || rawColor === "흑") {
      color = COLOR_BLACK;
    } else if (rawColor === "w" || rawColor === "white" || rawColor === "백") {
      color = COLOR_WHITE;
    }

    if (typeof entry === "string") {
      point = parseGtpCoordinate(entry, boardSize);
      label = entry;
      if (!color) {
        color = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
      }
    } else if (typeof entry?.move === "string") {
      point = parseGtpCoordinate(entry.move, boardSize);
      label = entry.move;
      if (!color) {
        color = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
      }
    } else if (entry?.move && typeof entry.move === "object") {
      point = { x: Number(entry.move.x), y: Number(entry.move.y) };
      label = formatCoordLabel(point);
      if (!color) {
        color = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
      }
    } else if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
      point = { x: entry.x, y: entry.y };
      label = formatCoordLabel(point);
      if (!color) {
        color = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
      }
    }

    if (!point || !color) {
      return;
    }

    moves.push({
      color,
      x: point.x,
      y: point.y,
      label,
      ply: index + 1,
    });
  });

  return moves;
}

function buildFullSequenceFromBlackOnly(blackAnswers, answerMoveCount) {
  const full = [];
  let blackIndex = 0;

  for (let ply = 1; ply <= answerMoveCount; ply += 1) {
    if (ply % 2 === 1) {
      const black = blackAnswers[blackIndex];
      if (!black) {
        break;
      }
      full.push({
        color: COLOR_BLACK,
        x: black.x,
        y: black.y,
        label: black.label,
        ply,
      });
      blackIndex += 1;
    }
  }

  return full;
}

function hasExplicitFullAnswerSequence(problem) {
  return (
    Array.isArray(problem?.fullAnswerSequence) ||
    Array.isArray(problem?.full_answer_sequence)
  );
}

/** @param {SequenceMove[]} sequence */
export function renumberSequenceMoves(sequence) {
  return (sequence ?? []).map((entry, index) => ({
    ...entry,
    ply: index + 1,
  }));
}

/**
 * draft/DB에 full_answer_sequence 반영 (black_answer_sequence 파생·동기화)
 * @param {object} problem
 * @param {SequenceMove[]} sequenceEntries
 * @param {number} boardSize
 * @returns {SequenceMove[]}
 */
export function applyFullAnswerSequenceToDraft(problem, sequenceEntries, boardSize = 19) {
  const renumbered = renumberSequenceMoves(sequenceEntries);
  const payload = toFullAnswerSequencePayload(renumbered);

  problem.fullAnswerSequence = payload;
  problem.full_answer_sequence = payload;

  if (renumbered.length === 0) {
    problem.blackAnswerSequence = [];
    problem.black_answer_sequence = [];
    delete problem.correctMove;
    return renumbered;
  }

  const blackAnswers = renumbered.filter((entry) => entry.color === COLOR_BLACK);
  problem.blackAnswerSequence = blackAnswers.map((entry) => ({
    move: entry.label ?? formatCoordLabel(entry),
  }));
  problem.black_answer_sequence = problem.blackAnswerSequence;

  if (blackAnswers[0]) {
    problem.correctMove = { x: blackAnswers[0].x, y: blackAnswers[0].y };
  }

  return renumbered;
}

/**
 * @param {object} problem
 * @param {number} boardSize
 */
export function resolveAnswerSequenceConfig(problem, boardSize = 19) {
  const answerMoveCount = normalizeAnswerMoveCount(
    problem?.answerMoveCount ?? problem?.answer_move_count ?? 1,
  );

  const rawFull = problem?.fullAnswerSequence ?? problem?.full_answer_sequence;
  const hasExplicit = Array.isArray(rawFull);

  let fullSequence = hasExplicit
    ? normalizeFullAnswerSequence(rawFull, boardSize)
    : [];

  if (!hasExplicit && fullSequence.length === 0) {
    const blackAnswers = normalizeBlackAnswerSequence(
      problem?.blackAnswerSequence ?? problem?.black_answer_sequence,
      boardSize,
    );
    if (blackAnswers.length > 0) {
      fullSequence = buildFullSequenceFromBlackOnly(blackAnswers, answerMoveCount);
    } else if (problem?.correctMove) {
      fullSequence = [
        {
          color: COLOR_BLACK,
          x: problem.correctMove.x,
          y: problem.correctMove.y,
          label: formatCoordLabel(problem.correctMove),
          ply: 1,
        },
      ];
    }
  }

  if (fullSequence.length > answerMoveCount) {
    fullSequence = fullSequence.slice(0, answerMoveCount);
  }

  const blackAnswers = fullSequence.filter((entry) => entry.color === COLOR_BLACK);
  const whiteAnswers = fullSequence.filter((entry) => entry.color === COLOR_WHITE);

  return {
    answerMoveCount,
    fullSequence,
    blackAnswers,
    whiteAnswers,
  };
}

export function isCorrectBlackMove(point, expectedAnswer) {
  if (!expectedAnswer) {
    return false;
  }
  return point.x === expectedAnswer.x && point.y === expectedAnswer.y;
}

/** @deprecated — resolveAnswerSequenceConfig 와 동일 */
export function resolveBlackAnswerConfig(problem, boardSize = 19) {
  const config = resolveAnswerSequenceConfig(problem, boardSize);
  return {
    answerMoveCount: config.answerMoveCount,
    blackAnswers: config.blackAnswers,
    fullSequence: config.fullSequence,
    whiteAnswers: config.whiteAnswers,
  };
}

/**
 * 흑 정답 직후 자동 착수할 제작자 백 수 (정답 루트)
 * @param {{ blackAnswerIndex: number, fullSequence: SequenceMove[] }} session
 */
export function getExpectedAuthorWhite(session) {
  const whiteIndex = session.blackAnswerIndex * 2 + 1;
  const entry = session.fullSequence?.[whiteIndex];
  if (entry?.color === COLOR_WHITE) {
    return entry;
  }
  return null;
}

export function getNextSequenceColor(currentLength) {
  return currentLength % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
}

export function getSequenceColorLabel(color) {
  return color === COLOR_WHITE ? "백" : "흑";
}

/** admin 저장용 */
export function toFullAnswerSequencePayload(fullSequence) {
  return (fullSequence ?? []).map((entry) => ({
    color: entry.color,
    move: entry.label ?? formatCoordLabel(entry),
  }));
}

/** @deprecated applyFullAnswerSequenceToDraft 사용 */
export function syncDerivedAnswerFields(problem, boardSize = 19) {
  const raw = problem?.fullAnswerSequence ?? problem?.full_answer_sequence ?? [];
  const normalized = normalizeFullAnswerSequence(raw, boardSize);
  applyFullAnswerSequenceToDraft(problem, normalized, boardSize);
}

export function validateFullAnswerSequence(problem, boardSize, occupiedKeys) {
  const { fullSequence, answerMoveCount, blackAnswers } = resolveAnswerSequenceConfig(
    problem,
    boardSize,
  );
  const expectedBlack = getExpectedBlackAnswerCount(answerMoveCount);

  if (fullSequence.length !== answerMoveCount) {
    return `${answerMoveCount}수 문제는 정답 수순 ${answerMoveCount}착(흑·백 포함)이 필요합니다. 현재 ${fullSequence.length}착입니다.`;
  }

  if (blackAnswers.length !== expectedBlack) {
    return `흑 수는 ${expectedBlack}개여야 합니다.`;
  }

  for (let index = 0; index < fullSequence.length; index += 1) {
    const entry = fullSequence[index];
    const expectedColor = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
    if (entry.color !== expectedColor) {
      return `${index + 1}착은 ${getSequenceColorLabel(expectedColor)}이어야 합니다.`;
    }
    const key = `${entry.x}:${entry.y}`;
    if (occupiedKeys.has(key)) {
      return `정답 수순 ${index + 1}착이 기존 돌과 겹칩니다.`;
    }
    occupiedKeys.add(key);
  }

  return "";
}
