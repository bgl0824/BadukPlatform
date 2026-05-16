(function () {
const { STONE } = window.BadukProblems;

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function getTemporaryAiResponse({ lastMove, stones, boardSize }) {
  const occupied = new Set(stones.map((stone) => pointKey(stone.x, stone.y)));
  const candidates = buildCandidateMoves(lastMove, boardSize);

  const move =
    candidates.find((candidate) => !occupied.has(pointKey(candidate.x, candidate.y))) ??
    findFirstEmptyPoint(occupied, boardSize);

  if (!move) {
    return null;
  }

  return {
    ...move,
    color: STONE.white,
    source: "temporary-ai",
  };
}

function buildCandidateMoves(lastMove, boardSize) {
  if (!lastMove) {
    return [];
  }

  const adjacentMoves = NEIGHBOR_OFFSETS.map(([dx, dy]) => ({
    x: lastMove.x + dx,
    y: lastMove.y + dy,
  })).filter((move) => isOnBoard(move, boardSize));

  const center = Math.floor(boardSize / 2);
  adjacentMoves.sort(
    (a, b) => distanceToCenter(a, center) - distanceToCenter(b, center),
  );

  return adjacentMoves;
}

function findFirstEmptyPoint(occupied, boardSize) {
  const center = Math.floor(boardSize / 2);

  for (let radius = 0; radius < boardSize; radius += 1) {
    for (let y = center - radius; y <= center + radius; y += 1) {
      for (let x = center - radius; x <= center + radius; x += 1) {
        const move = { x, y };
        if (isOnBoard(move, boardSize) && !occupied.has(pointKey(x, y))) {
          return move;
        }
      }
    }
  }

  return null;
}

function isOnBoard(move, boardSize) {
  return move.x >= 0 && move.y >= 0 && move.x < boardSize && move.y < boardSize;
}

function distanceToCenter(move, center) {
  return Math.abs(move.x - center) + Math.abs(move.y - center);
}

function pointKey(x, y) {
  return `${x}:${y}`;
}

window.BadukAi = {
  getTemporaryAiResponse,
};
})();
