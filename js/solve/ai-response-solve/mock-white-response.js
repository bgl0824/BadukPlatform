import { pointKey } from "../ai-response-ux/coordinates.js";
import { formatCoordLabel } from "./black-sequence.js";

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * KataGo API 미연동 시 테스트용 백 응수 (인접 빈 점 우선).
 */
export function pickMockWhiteResponse({ boardSize, stones, lastBlackMove, blackAnswers = [] }) {
  const occupied = new Set(stones.map((stone) => pointKey(stone.x, stone.y)));
  const blackAnswerKeys = new Set(
    blackAnswers.map((answer) => pointKey(answer.x, answer.y)),
  );

  const candidates = [];

  NEIGHBOR_OFFSETS.forEach(([dx, dy]) => {
    const point = { x: lastBlackMove.x + dx, y: lastBlackMove.y + dy };
    if (!isOnBoard(point, boardSize) || occupied.has(pointKey(point.x, point.y))) {
      return;
    }
    const isNearAnswer = blackAnswerKeys.has(pointKey(point.x, point.y));
    candidates.push({ point, score: isNearAnswer ? 0 : 10 });
  });

  if (candidates.length === 0) {
    const fallback = findFirstEmpty(boardSize, occupied);
    if (!fallback) {
      return null;
    }
    return { point: fallback, source: "mock-fallback" };
  }

  candidates.sort((left, right) => right.score - left.score);
  return { point: candidates[0].point, source: "mock" };
}

function isOnBoard(point, boardSize) {
  return point.x >= 0 && point.y >= 0 && point.x < boardSize && point.y < boardSize;
}

function findFirstEmpty(boardSize, occupied) {
  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      if (!occupied.has(pointKey(x, y))) {
        return { x, y };
      }
    }
  }
  return null;
}

export function logMockWhiteMove(point) {
  console.info("[AI_RESPONSE] mock white move", { move: formatCoordLabel(point) });
}
