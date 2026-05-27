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
import {
  getStyleWeights,
  resolveAiResponseStyle,
} from "./tactical-response-styles.js";

export { resolveAiResponseStyle } from "./tactical-response-styles.js";

/** selectedReason 우선순위 (동점 시) */
const REASON_PRIORITY = {
  extend_atari: 6,
  capture_black: 5,
  sacrifice_play: 5,
  increase_liberty: 4,
  liberty_fight: 4,
  connect_white: 3,
  respond_to_black: 3,
  escape_from_last_black: 2,
  katago_prior: 1,
  general: 0,
};

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

function minGroupLibertiesForColor(stones, color, boardSize) {
  const groups = getGroupsForColor(stones, color, boardSize);
  if (groups.length === 0) {
    return 99;
  }
  return Math.min(
    ...groups.map((group) => countGroupLiberties(stones, group, boardSize)),
  );
}

function countCaptures(beforeStones, afterStones, capturedColor) {
  const before = beforeStones.filter((s) => s.color === capturedColor).length;
  const after = afterStones.filter((s) => s.color === capturedColor).length;
  return Math.max(0, before - after);
}

function putsEnemyInAtari(stones, point, boardSize, stoneColors) {
  for (const neighbor of getNeighborPoints(point, boardSize)) {
    const neighborStone = getStoneAtPoint(stones, neighbor);
    if (!neighborStone || neighborStone.color !== stoneColors.black) {
      continue;
    }
    const group = collectConnectedGroup(stones, neighborStone, boardSize);
    const libs = getGroupLibertyPoints(stones, group, boardSize);
    if (libs.size === 1 && libs.has(pointKey(point))) {
      return true;
    }
  }
  return false;
}

function isWhiteInAtariAfter(stones, boardSize, stoneColors) {
  return getAtariLibertyKeys(stones, stoneColors.white, boardSize).size > 0;
}

/**
 * @param {import("./tactical-response-styles.js").AiResponseStyle} style
 */
function scoreCandidate({
  candidate,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
}) {
  const weights = getStyleWeights(style);
  const point = { x: candidate.x, y: candidate.y };
  if (!isOnBoard(point, boardSize)) {
    return null;
  }

  const afterStones = simulateWhiteMove(stones, point, boardSize, stoneColors);
  if (!afterStones) {
    return null;
  }

  const moveKey = pointKey(point);
  const signals = {};
  const reasons = [];

  const whiteAtariLibsBefore = getAtariLibertyKeys(
    stones,
    stoneColors.white,
    boardSize,
  );
  if (whiteAtariLibsBefore.has(moveKey)) {
    signals.extend_atari = 520;
    reasons.push("extend_atari");
  }

  const capturedCount = countCaptures(stones, afterStones, stoneColors.black);
  if (capturedCount > 0) {
    signals.capture_black = 450 + capturedCount * 80;
    reasons.push("capture_black");
  } else if (putsEnemyInAtari(afterStones, point, boardSize, stoneColors)) {
    signals.capture_black = 380;
    reasons.push("capture_black");
  }

  const minWhiteBefore = minGroupLibertiesForColor(stones, stoneColors.white, boardSize);
  const minWhiteAfter = minGroupLibertiesForColor(
    afterStones,
    stoneColors.white,
    boardSize,
  );
  const minBlackBefore = minGroupLibertiesForColor(stones, stoneColors.black, boardSize);
  const minBlackAfter = minGroupLibertiesForColor(
    afterStones,
    stoneColors.black,
    boardSize,
  );

  const placed = getStoneAtPoint(afterStones, point);
  const ownGroup = placed
    ? collectConnectedGroup(afterStones, placed, boardSize)
    : [];
  const ownLibs = countGroupLiberties(afterStones, ownGroup, boardSize);

  const libertyGain = minWhiteAfter - minWhiteBefore;
  if (libertyGain > 0 || ownLibs >= 3) {
    signals.increase_liberty = 35 + libertyGain * 40 + ownLibs * 6;
    reasons.push("increase_liberty");
  }

  const blackLibertyDrop = minBlackBefore - minBlackAfter;
  if (blackLibertyDrop > 0) {
    const fightScore = 30 + blackLibertyDrop * 35;
    signals.decrease_black_liberty = fightScore;
    if (style === "liberty_fight") {
      signals.liberty_fight = fightScore + 25;
      reasons.push("liberty_fight");
    }
  }

  const hadWhiteNeighbor = getNeighborPoints(point, boardSize).some((neighbor) => {
    const stone = getStoneAtPoint(stones, neighbor);
    return stone?.color === stoneColors.white;
  });
  if (hadWhiteNeighbor) {
    const groupSize = ownGroup.length;
    signals.connect_white = 28 + groupSize * 4;
    reasons.push("connect_white");
  }

  if (lastBlackMove) {
    const dist = manhattanDistance(point, lastBlackMove);
    if (dist === 1) {
      signals.respond_to_black = 45;
      reasons.push("respond_to_black");
    } else if (dist === 2) {
      signals.respond_to_black = 22;
    }

    if (style === "escape") {
      if (dist >= 2) {
        signals.escape_from_last_black = 35 + dist * 10;
        reasons.push("escape_from_last_black");
      } else if (dist === 1) {
        signals.escape_from_last_black = -30;
      }
    }
  }

  const riskySelfAtari =
    isWhiteInAtariAfter(afterStones, boardSize, stoneColors) &&
    capturedCount === 0;
  if (riskySelfAtari) {
    signals.self_atari_penalty = -120;
  }

  const sacrificeValue =
    (riskySelfAtari ? 80 : 0) +
    capturedCount * 70 +
    blackLibertyDrop * 25;
  if (sacrificeValue >= 90 && (riskySelfAtari || capturedCount > 0)) {
    signals.sacrifice_play = sacrificeValue;
    reasons.push("sacrifice_play");
  }

  const orderBonus = Math.max(0, 36 - (candidate.order ?? 36));
  const visitBonus = Math.min(candidate.visits ?? 0, 120) * 0.04;
  const policyBonus = (candidate.policyPrior ?? 0) * 40;
  signals.katago_prior = orderBonus + visitBonus + policyBonus;
  if (signals.katago_prior > 8) {
    reasons.push("katago_prior");
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  let tieScore = 0;
  for (const [signal, raw] of Object.entries(signals)) {
    const weight = weights[signal] ?? 1;
    tieScore += raw * weight;
  }

  const primaryReason = [...new Set(reasons)].sort(
    (a, b) => (REASON_PRIORITY[b] ?? 0) - (REASON_PRIORITY[a] ?? 0),
  )[0];

  const priority = REASON_PRIORITY[primaryReason] ?? 0;
  const totalScore = priority * 10000 + tieScore;

  return {
    ...candidate,
    point,
    reasons: [...new Set(reasons)],
    signals,
    primaryReason,
    selectedReason: primaryReason,
    tieScore,
    totalScore,
    aiResponseStyle: style,
  };
}

/**
 * 전술 응수 엔진 — KataGo region 후보 중 백 수 선택.
 * @param {{
 *   regionCandidates: object[],
 *   stones: object[],
 *   boardSize: number,
 *   stoneColors: { black: string, white: string },
 *   lastBlackMove: object,
 *   problem: object,
 * }} params
 */
export function selectTacticalWhiteMove({
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
    aiResponseStyle: style,
    scoredCandidates,
    selected,
    selectedReason: selected?.selectedReason ?? null,
  };
}

/** @deprecated alias */
export const selectEducationalWhiteMove = selectTacticalWhiteMove;
