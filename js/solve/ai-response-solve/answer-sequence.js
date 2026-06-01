import {
  isValidBoardPoint,
  sanitizeBoardPoint,
} from "../../game/board-point-validation.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "../../game/placement-validation.js";
import { removeCapturedStonesAfterMove } from "../../game/capture.js";
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
      point = sanitizeBoardPoint(
        { x: Number(entry.move.x), y: Number(entry.move.y) },
        boardSize,
        "black_answer_sequence",
      );
      label = point ? formatCoordLabel(point) : "";
    } else if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
      point = sanitizeBoardPoint(entry, boardSize, "black_answer_sequence");
      label = point ? formatCoordLabel(point) : "";
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
const DEFAULT_STONE_COLORS = {
  black: COLOR_BLACK,
  white: COLOR_WHITE,
};

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
      point = sanitizeBoardPoint(
        { x: Number(entry.move.x), y: Number(entry.move.y) },
        boardSize,
        "full_answer_sequence",
      );
      label = point ? formatCoordLabel(point) : "";
      if (!color) {
        color = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
      }
    } else if (Number.isInteger(entry?.x) && Number.isInteger(entry?.y)) {
      point = sanitizeBoardPoint(entry, boardSize, "full_answer_sequence");
      label = point ? formatCoordLabel(point) : "";
      if (!color) {
        color = index % 2 === 0 ? COLOR_BLACK : COLOR_WHITE;
      }
    }

    point = point ? sanitizeBoardPoint(point, boardSize, "full_answer_sequence") : null;

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

/** 오답 응수 QA: 정답 루트 제작자 백 수 (기대 응수 기준) */
export function getExpectedWrongRevealAuthorWhite(problem, blackAnswerIndex, boardSize = 19) {
  const { fullSequence } = resolveAnswerSequenceConfig(problem, boardSize);
  return getExpectedAuthorWhite({ blackAnswerIndex, fullSequence });
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
    if (!isValidBoardPoint(entry, boardSize)) {
      return `정답 수순 ${index + 1}착 좌표가 올바르지 않습니다.`;
    }

  }

  const simulation = simulateFullAnswerSequence(problem?.stones ?? [], fullSequence, {
    boardSize,
    stoneColors: DEFAULT_STONE_COLORS,
    enforceSimpleKo: false,
  });

  if (simulation.error) {
    const errorPly = simulation.error.ply ?? 0;
    const reason = simulation.error.reason;
    if (reason === "occupied") {
      return `정답 수순 ${errorPly}착에 이미 돌이 있습니다. (포획 반영 기준)`;
    }
    if (reason === "suicide") {
      return `정답 수순 ${errorPly}착은 자살수라 둘 수 없습니다.`;
    }
    if (reason === "ko") {
      return `정답 수순 ${errorPly}착은 단순 패 금지에 걸립니다.`;
    }
    return `정답 수순 ${errorPly}착이 바둑 룰상 성립하지 않습니다.`;
  }

  return "";
}

function normalizeSimStones(initialStones, boardSize) {
  return (initialStones ?? [])
    .map((stone) => sanitizeBoardPoint(stone, boardSize, "sequence_sim_initial"))
    .filter(Boolean)
    .map((point) => {
      const original = (initialStones ?? []).find((s) => s.x === point.x && s.y === point.y);
      const color = String(original?.color ?? "").toLowerCase() === COLOR_WHITE
        ? COLOR_WHITE
        : COLOR_BLACK;
      return { ...point, color };
    });
}

function boardHash(stones) {
  return [...stones]
    .map((stone) => `${stone.color[0]}:${stone.x}:${stone.y}`)
    .sort()
    .join("|");
}

/**
 * 정답 수순을 실제 착수/포획 규칙으로 시뮬레이션
 */
export function simulateFullAnswerSequence(
  initialStones,
  fullSequence,
  { boardSize = 19, stoneColors = DEFAULT_STONE_COLORS, enforceSimpleKo = false } = {},
) {
  let currentStones = normalizeSimStones(initialStones, boardSize);
  const history = [];
  const hashes = [boardHash(currentStones)];

  for (let index = 0; index < (fullSequence ?? []).length; index += 1) {
    const entry = fullSequence[index];
    const move = {
      x: Number(entry.x),
      y: Number(entry.y),
      color: entry.color === COLOR_WHITE ? stoneColors.white : stoneColors.black,
    };

    if (!isValidBoardPoint(move, boardSize)) {
      return {
        stones: currentStones,
        history,
        error: { ply: index + 1, reason: "invalid_point", move },
      };
    }

    const evaluation = evaluatePlacement(currentStones, move, { boardSize, stoneColors });
    if (evaluation.status !== PLACEMENT_STATUS.legal) {
      return {
        stones: currentStones,
        history,
        error: {
          ply: index + 1,
          reason: evaluation.reason ?? evaluation.status,
          move,
          evaluation,
        },
      };
    }

    const afterCapture = removeCapturedStonesAfterMove(
      [...currentStones, move],
      move,
      { boardSize, stoneColors },
    );

    const nextStones = afterCapture.stones;

    if (enforceSimpleKo && hashes.length >= 2) {
      const nextHash = boardHash(nextStones);
      const previousOpponentTurnHash = hashes[hashes.length - 2];
      if (nextHash === previousOpponentTurnHash) {
        return {
          stones: currentStones,
          history,
          error: { ply: index + 1, reason: "ko", move },
        };
      }
      hashes.push(nextHash);
    } else {
      hashes.push(boardHash(nextStones));
    }

    history.push({
      ply: index + 1,
      move,
      capturedCount: afterCapture.capturedCount ?? 0,
      stones: nextStones,
    });
    currentStones = nextStones;
  }

  return {
    stones: currentStones,
    history,
    error: null,
  };
}
