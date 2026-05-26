import {
  collectConnectedGroup,
  countGroupLiberties,
  removeCapturedStonesAfterMove,
} from "../../game/capture.js";
import {
  evaluatePlacement,
  PLACEMENT_STATUS,
} from "../../game/placement-validation.js";
import {
  getNeighborPoints,
  getStoneAtPoint,
  isOnBoard,
  pointKey,
} from "../../game/rules.js";

const REASON_PRIORITY = {
  extend_atari: 5,
  escape_from_last_black: 4,
  increase_liberty: 3,
  connect_white_group: 2,
  general: 1,
};

const ESCAPE_CATEGORIES = new Set(["축", "촉촉수"]);

/**
 * @param {object} problem
 * @returns {"escape"|"default"}
 */
export function resolveAiResponseStyle(problem) {
  const explicit = problem?.ai_response_style ?? problem?.aiResponseStyle;
  if (explicit === "escape" || explicit === "default") {
    return explicit;
  }
  const category = String(problem?.category ?? "").trim();
  if (ESCAPE_CATEGORIES.has(category)) {
    return "escape";
  }
  return "default";
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function simulateWhiteMove(stones, point, boardSize, stoneColors) {
  const move = { ...point, color: stoneColors.white };
  const evaluation = evaluatePlacement(stones, move, { boardSize, stoneColors });
  if (evaluation.status !== PLACEMENT_STATUS.legal) {
    return null;
  }
  const { stones: afterStones } = removeCapturedStonesAfterMove(
    [...stones, move],
    move,
    { boardSize, stoneColors },
  );
  return afterStones;
}

function getGroupsForColor(stones, color, boardSize) {
  const groups = [];
  const visited = new Set();

  for (const stone of stones) {
    if (stone.color !== color) {
      continue;
    }
    const key = pointKey(stone);
    if (visited.has(key)) {
      continue;
    }
    const group = collectConnectedGroup(stones, stone, boardSize);
    group.forEach((s) => visited.add(pointKey(s)));
    groups.push(group);
  }

  return groups;
}

function getAtariLibertyKeys(stones, color, boardSize) {
  const keys = new Set();
  for (const group of getGroupsForColor(stones, color, boardSize)) {
    const liberties = getGroupLibertyPoints(stones, group, boardSize);
    if (liberties.size === 1) {
      keys.add([...liberties][0]);
    }
  }
  return keys;
}

function getGroupLibertyPoints(stones, group, boardSize) {
  const liberties = new Set();
  group.forEach((stone) => {
    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      if (!getStoneAtPoint(stones, neighbor)) {
        liberties.add(pointKey(neighbor));
      }
    });
  });
  return liberties;
}

function minWhiteGroupLiberties(stones, boardSize, stoneColors) {
  const groups = getGroupsForColor(stones, stoneColors.white, boardSize);
  if (groups.length === 0) {
    return 99;
  }
  return Math.min(
    ...groups.map((group) => countGroupLiberties(stones, group, boardSize)),
  );
}

function scoreCandidate({
  candidate,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
}) {
  const point = { x: candidate.x, y: candidate.y };
  if (!isOnBoard(point, boardSize)) {
    return null;
  }

  const afterStones = simulateWhiteMove(stones, point, boardSize, stoneColors);
  if (!afterStones) {
    return null;
  }

  const moveKey = pointKey(point);
  const reasons = [];
  let tieScore = 0;

  const whiteAtariLibsBefore = getAtariLibertyKeys(
    stones,
    stoneColors.white,
    boardSize,
  );
  if (whiteAtariLibsBefore.has(moveKey)) {
    reasons.push("extend_atari");
    tieScore += 500;
  }

  const capturedCount = stones.length + 1 - afterStones.length;
  if (capturedCount > 0) {
    reasons.push("extend_atari");
    tieScore += 400 + capturedCount * 50;
  } else {
    for (const neighbor of getNeighborPoints(point, boardSize)) {
      const neighborStone = getStoneAtPoint(stones, neighbor);
      if (!neighborStone || neighborStone.color !== stoneColors.black) {
        continue;
      }
      const group = collectConnectedGroup(stones, neighborStone, boardSize);
      const libs = getGroupLibertyPoints(stones, group, boardSize);
      if (libs.size === 1 && libs.has(moveKey)) {
        reasons.push("extend_atari");
        tieScore += 350;
        break;
      }
    }
  }

  if (style === "escape" && lastBlackMove) {
    const dist = manhattanDistance(point, lastBlackMove);
    if (dist >= 2) {
      reasons.push("escape_from_last_black");
      tieScore += 40 + dist * 12;
    } else if (dist === 1) {
      tieScore -= 25;
    }
  }

  const libsBefore = minWhiteGroupLiberties(stones, boardSize, stoneColors);
  const libsAfter = minWhiteGroupLiberties(afterStones, boardSize, stoneColors);
  const placed = getStoneAtPoint(afterStones, point);
  const ownGroup = placed
    ? collectConnectedGroup(afterStones, placed, boardSize)
    : [];
  const ownLibs = countGroupLiberties(afterStones, ownGroup, boardSize);

  if (libsAfter > libsBefore || ownLibs >= 3) {
    reasons.push("increase_liberty");
    tieScore += 30 + (libsAfter - libsBefore) * 15 + ownLibs * 5;
  }

  const hasWhiteNeighbor = getNeighborPoints(point, boardSize).some((neighbor) => {
    const stone = getStoneAtPoint(stones, neighbor);
    return stone?.color === stoneColors.white;
  });
  if (hasWhiteNeighbor) {
    reasons.push("connect_white_group");
    tieScore += 25;
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  const orderBonus = Math.max(0, 40 - (candidate.order ?? 40));
  const visitBonus = Math.min(candidate.visits ?? 0, 200) * 0.05;
  tieScore += orderBonus + visitBonus;

  const primaryReason = reasons.sort(
    (a, b) => REASON_PRIORITY[b] - REASON_PRIORITY[a],
  )[0];

  const priority = REASON_PRIORITY[primaryReason] ?? 1;
  const totalScore = priority * 1000 + tieScore;

  return {
    ...candidate,
    point,
    reasons,
    primaryReason,
    selectedReason: primaryReason,
    tieScore,
    totalScore,
  };
}

/**
 * @param {{
 *   regionCandidates: object[],
 *   stones: object[],
 *   boardSize: number,
 *   stoneColors: { black: string, white: string },
 *   lastBlackMove: object,
 *   problem: object,
 * }} params
 */
export function selectEducationalWhiteMove({
  regionCandidates,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  problem,
}) {
  const style = resolveAiResponseStyle(problem);
  const scoredCandidates = regionCandidates
    .map((candidate) =>
      scoreCandidate({
        candidate,
        stones,
        boardSize,
        stoneColors,
        lastBlackMove,
        style,
      }),
    )
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore);

  const selected = scoredCandidates[0] ?? null;

  return {
    style,
    scoredCandidates,
    selected,
    selectedReason: selected?.selectedReason ?? null,
  };
}
