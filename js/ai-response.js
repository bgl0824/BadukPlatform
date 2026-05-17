(function () {
const { STONE } = window.BadukProblems;

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DEFAULT_AI_TIMEOUT_MS = 8000;

async function getAiCounterMove({
  endpoint = getConfiguredAiEndpoint(),
  fallbackToTemporary = true,
  lastMove,
  stones,
  boardSize,
  problem,
  playedMoves,
  sgf,
}) {
  if (!endpoint) {
    return fallbackToTemporary
      ? getTemporaryAiResponse({ lastMove, stones, boardSize })
      : null;
  }

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        boardSize,
        nextColor: STONE.white,
        lastMove,
        stones,
        playedMoves,
        problem: problem
          ? {
              id: problem.id,
              title: problem.title,
              category: problem.category,
              correctMove: problem.correctMove,
            }
          : null,
        sgf,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API request failed: ${response.status}`);
    }

    const data = await response.json();
    const aiMove = normalizeAiMove(data);
    if (!aiMove || !isOnBoard(aiMove, boardSize)) {
      throw new Error("AI API response does not include a valid move.");
    }

    return {
      x: aiMove.x,
      y: aiMove.y,
      color: STONE.white,
      source: "external-ai",
    };
  } catch (error) {
    console.warn("External AI response failed. Falling back to temporary AI.", error);
    return fallbackToTemporary
      ? getTemporaryAiResponse({ lastMove, stones, boardSize })
      : null;
  }
}

function getTemporaryAiResponse({ lastMove, stones, boardSize }) {
  const candidates = buildCandidateMoves(lastMove, stones, boardSize);
  const move = chooseBestRuleBasedMove({
    candidates,
    lastMove,
    stones,
    boardSize,
    color: STONE.white,
  });

  if (!move) {
    return null;
  }

  return {
    ...move,
    color: STONE.white,
    source: "temporary-ai",
  };
}

function buildCandidateMoves(lastMove, stones, boardSize) {
  const occupied = new Set(stones.map((stone) => pointKey(stone.x, stone.y)));
  const candidateMap = new Map();

  stones.forEach((stone) => {
    getNeighborPoints(stone, boardSize).forEach((point) => {
      const key = pointKey(point.x, point.y);
      if (!occupied.has(key)) {
        candidateMap.set(key, point);
      }
    });
  });

  if (lastMove) {
    getNeighborPoints(lastMove, boardSize).forEach((point) => {
      const key = pointKey(point.x, point.y);
      if (!occupied.has(key)) {
        candidateMap.set(key, point);
      }
    });
  }

  if (candidateMap.size === 0) {
    const firstEmptyPoint = findFirstEmptyPoint(occupied, boardSize);
    if (firstEmptyPoint) {
      candidateMap.set(pointKey(firstEmptyPoint.x, firstEmptyPoint.y), firstEmptyPoint);
    }
  }

  const center = Math.floor(boardSize / 2);
  const candidates = [...candidateMap.values()];
  candidates.sort(
    (a, b) => distanceToCenter(a, center) - distanceToCenter(b, center),
  );

  return candidates;
}

function chooseBestRuleBasedMove({ candidates, lastMove, stones, boardSize, color }) {
  const scoredMoves = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreRuleBasedMove({
        move: { ...candidate, color },
        lastMove,
        stones,
        boardSize,
      }),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score);

  return scoredMoves[0] ?? null;
}

function scoreRuleBasedMove({ move, lastMove, stones, boardSize }) {
  if (!isOnBoard(move, boardSize) || getStoneAtPoint(stones, move)) {
    return Number.NEGATIVE_INFINITY;
  }

  const opponentColor = move.color === STONE.black ? STONE.white : STONE.black;
  const beforeOwnAtariLiberties = getGroups(stones, move.color)
    .map((group) => getGroupLiberties(stones, group, boardSize))
    .filter((liberties) => liberties.size === 1)
    .map((liberties) => [...liberties][0]);
  const afterStones = simulateMove(stones, move, boardSize);
  const placedStone = getStoneAtPoint(afterStones, move);
  if (!placedStone) {
    return Number.NEGATIVE_INFINITY;
  }

  const ownGroup = collectConnectedGroup(afterStones, placedStone, boardSize);
  const ownLiberties = getGroupLiberties(afterStones, ownGroup, boardSize).size;
  if (ownLiberties === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const capturedCount = stones.length + 1 - afterStones.length;
  let score = 0;
  score += capturedCount * 1000;

  if (beforeOwnAtariLiberties.includes(pointKey(move.x, move.y))) {
    score += 350;
  }

  getNeighborPoints(move, boardSize).forEach((neighbor) => {
    const neighborStone = getStoneAtPoint(afterStones, neighbor);
    if (!neighborStone || neighborStone.color !== opponentColor) {
      return;
    }

    const opponentGroup = collectConnectedGroup(afterStones, neighborStone, boardSize);
    const liberties = getGroupLiberties(afterStones, opponentGroup, boardSize).size;
    if (liberties === 1) {
      score += 250;
    } else if (liberties === 2) {
      score += 80;
    }
  });

  score += Math.min(ownLiberties, 4) * 20;
  if (ownLiberties === 1 && capturedCount === 0) {
    score -= 120;
  }

  if (lastMove) {
    score += Math.max(0, 20 - manhattanDistance(move, lastMove));
  }

  return score;
}

function simulateMove(stones, move, boardSize) {
  const nextStones = [...stones.map((stone) => ({ ...stone })), { ...move }];
  const opponentColor = move.color === STONE.black ? STONE.white : STONE.black;
  const capturedKeys = new Set();

  getNeighborPoints(move, boardSize).forEach((neighbor) => {
    const neighborStone = getStoneAtPoint(nextStones, neighbor);
    if (!neighborStone || neighborStone.color !== opponentColor) {
      return;
    }

    const group = collectConnectedGroup(nextStones, neighborStone, boardSize);
    if (getGroupLiberties(nextStones, group, boardSize).size === 0) {
      group.forEach((stone) => capturedKeys.add(pointKey(stone.x, stone.y)));
    }
  });

  return nextStones.filter((stone) => !capturedKeys.has(pointKey(stone.x, stone.y)));
}

function getGroups(stones, color) {
  const groups = [];
  const visited = new Set();

  stones
    .filter((stone) => stone.color === color)
    .forEach((stone) => {
      const key = pointKey(stone.x, stone.y);
      if (visited.has(key)) {
        return;
      }

      const group = collectConnectedGroup(stones, stone);
      group.forEach((groupStone) => visited.add(pointKey(groupStone.x, groupStone.y)));
      groups.push(group);
    });

  return groups;
}

function collectConnectedGroup(stones, startStone, boardSize = 13) {
  const group = [];
  const queue = [startStone];
  const visited = new Set();

  while (queue.length > 0) {
    const stone = queue.shift();
    const key = pointKey(stone.x, stone.y);
    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    group.push(stone);

    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      const neighborStone = getStoneAtPoint(stones, neighbor);
      if (
        neighborStone &&
        neighborStone.color === startStone.color &&
        !visited.has(pointKey(neighborStone.x, neighborStone.y))
      ) {
        queue.push(neighborStone);
      }
    });
  }

  return group;
}

function getGroupLiberties(stones, group, boardSize) {
  const liberties = new Set();

  group.forEach((stone) => {
    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      if (!getStoneAtPoint(stones, neighbor)) {
        liberties.add(pointKey(neighbor.x, neighbor.y));
      }
    });
  });

  return liberties;
}

function getNeighborPoints(point, boardSize) {
  return NEIGHBOR_OFFSETS.map(([dx, dy]) => ({
    x: point.x + dx,
    y: point.y + dy,
  })).filter((neighbor) => isOnBoard(neighbor, boardSize));
}

function getStoneAtPoint(stones, point) {
  return stones.find((stone) => stone.x === point.x && stone.y === point.y);
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

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getConfiguredAiEndpoint() {
  return (
    window.BadukConfig?.katagoApiUrl ||
    window.BADUK_AI_API_URL ||
    window.localStorage?.getItem("BADUK_AI_API_URL") ||
    ""
  );
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_AI_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeAiMove(data) {
  const move = data?.move ?? data?.bestMove ?? data?.counterMove ?? data;

  if (typeof move === "string") {
    return parseCoordinateString(move);
  }

  if (Number.isInteger(move?.x) && Number.isInteger(move?.y)) {
    return { x: move.x, y: move.y };
  }

  if (Number.isInteger(move?.row) && Number.isInteger(move?.col)) {
    return { x: move.col, y: move.row };
  }

  return null;
}

function parseCoordinateString(value) {
  const trimmedValue = value.trim().toLowerCase();
  if (/^\d+,\d+$/.test(trimmedValue)) {
    const [x, y] = trimmedValue.split(",").map(Number);
    return { x, y };
  }

  if (/^[a-z][a-z]$/.test(trimmedValue)) {
    return {
      x: trimmedValue.charCodeAt(0) - "a".charCodeAt(0),
      y: trimmedValue.charCodeAt(1) - "a".charCodeAt(0),
    };
  }

  return null;
}

function pointKey(x, y) {
  return `${x}:${y}`;
}

window.BadukAi = {
  getAiCounterMove,
  getTemporaryAiResponse,
};
})();
