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

/** 오답 대응: 교육용 근처 응수 우선 */
const WRONG_REVEAL_REASON_PRIORITY = {
  forced_extend_atari: 6,
  connect_white_group: 5,
  increase_liberty: 4,
  escape_from_last_black: 3,
  region_candidate: 2,
  capture_black: 1,
  general: 0,
};

const WRONG_REVEAL_REASON_LABEL = {
  extend_atari: "forced_extend_atari",
  connect_white: "connect_white_group",
  increase_liberty: "increase_liberty",
  escape_from_last_black: "escape_from_last_black",
  katago_prior: "region_candidate",
  respond_to_black: "region_candidate",
  capture_black: "capture_black",
  general: "region_candidate",
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

function mapWrongRevealReason(internalReason) {
  return WRONG_REVEAL_REASON_LABEL[internalReason] ?? internalReason;
}

function scoreCandidate({
  candidate,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
  responseMode = "default",
}) {
  const isWrongReveal = responseMode === "wrong_reveal";
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
    signals.extend_atari = isWrongReveal ? 800 : 520;
    reasons.push("extend_atari");
  }

  const capturedCount = countCaptures(stones, afterStones, stoneColors.black);

  if (!isWrongReveal && capturedCount > 0) {
    signals.capture_black = 450 + capturedCount * 80;
    reasons.push("capture_black");
  } else if (!isWrongReveal && putsEnemyInAtari(afterStones, point, boardSize, stoneColors)) {
    signals.capture_black = 380;
    reasons.push("capture_black");
  } else if (isWrongReveal && style === "capture" && capturedCount > 0) {
    signals.capture_black = 200 + capturedCount * 40;
    reasons.push("capture_black");
  }

  const minWhiteBefore = minGroupLibertiesForColor(stones, stoneColors.white, boardSize);
  const minWhiteAfter = minGroupLibertiesForColor(
    afterStones,
    stoneColors.white,
    boardSize,
  );

  const placed = getStoneAtPoint(afterStones, point);
  const ownGroup = placed
    ? collectConnectedGroup(afterStones, placed, boardSize)
    : [];
  const ownLibs = countGroupLiberties(afterStones, ownGroup, boardSize);

  const libertyGain = minWhiteAfter - minWhiteBefore;
  if (libertyGain > 0 || ownLibs >= 3) {
    signals.increase_liberty =
      (isWrongReveal ? 120 : 35) + libertyGain * (isWrongReveal ? 50 : 40) + ownLibs * 8;
    reasons.push("increase_liberty");
  }

  const hadWhiteNeighbor = getNeighborPoints(point, boardSize).some((neighbor) => {
    const stone = getStoneAtPoint(stones, neighbor);
    return stone?.color === stoneColors.white;
  });
  if (hadWhiteNeighbor) {
    const groupSize = ownGroup.length;
    signals.connect_white =
      (isWrongReveal ? 150 : 28) + groupSize * (isWrongReveal ? 8 : 4);
    reasons.push("connect_white");
  }

  if (lastBlackMove) {
    const dist = manhattanDistance(point, lastBlackMove);

    if (isWrongReveal) {
      if (dist >= 2) {
        signals.escape_from_last_black = 90 + dist * 18;
        reasons.push("escape_from_last_black");
      } else if (dist === 1 && style === "escape") {
        signals.escape_from_last_black = -40;
      }
    } else if (style === "escape") {
      if (dist >= 2) {
        signals.escape_from_last_black = 35 + dist * 10;
        reasons.push("escape_from_last_black");
      } else if (dist === 1) {
        signals.escape_from_last_black = -30;
      }
    }

    if (!isWrongReveal && dist === 1) {
      signals.respond_to_black = 45;
      reasons.push("respond_to_black");
    }
  }

  if (style === "sacrifice") {
    const riskySelfAtari =
      getAtariLibertyKeys(afterStones, stoneColors.white, boardSize).size > 0 &&
      capturedCount === 0;
    const sacrificeValue =
      (riskySelfAtari ? 80 : 0) +
      capturedCount * 70 +
      (minGroupLibertiesForColor(stones, stoneColors.black, boardSize) -
        minGroupLibertiesForColor(afterStones, stoneColors.black, boardSize)) *
        25;
    if (sacrificeValue >= 90 && (riskySelfAtari || capturedCount > 0)) {
      signals.sacrifice_play = sacrificeValue;
      reasons.push("sacrifice_play");
    }
  }

  const policyBonus = (candidate.policyPrior ?? 0) * (isWrongReveal ? 25 : 40);
  const orderBonus = Math.max(0, 28 - (candidate.order ?? 28));
  signals.katago_prior =
    policyBonus + orderBonus + (isWrongReveal ? candidate.fromRegion ? 5 : 0 : 0);
  if (signals.katago_prior > 5 || !isWrongReveal) {
    reasons.push("katago_prior");
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  let tieScore = 0;
  for (const [signal, raw] of Object.entries(signals)) {
    let weight = weights[signal] ?? 1;
    if (isWrongReveal && signal === "sacrifice_play" && style !== "sacrifice") {
      continue;
    }
    if (isWrongReveal && signal === "capture_black" && style !== "capture") {
      weight *= 0.2;
    }
    tieScore += raw * weight;
  }

  const priorityTable = isWrongReveal ? WRONG_REVEAL_REASON_PRIORITY : REASON_PRIORITY;
  const primaryReason = [...new Set(reasons)].sort(
    (a, b) => (priorityTable[b] ?? 0) - (priorityTable[a] ?? 0),
  )[0];

  const selectedReason = isWrongReveal
    ? mapWrongRevealReason(primaryReason)
    : primaryReason;

  const priority = priorityTable[selectedReason] ?? priorityTable[primaryReason] ?? 0;
  const totalScore = priority * 10000 + tieScore;

  return {
    ...candidate,
    point,
    reasons: [...new Set(reasons)],
    signals,
    primaryReason,
    selectedReason,
    tieScore,
    totalScore,
    aiResponseStyle: style,
    responseMode,
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
 *   studentMoveResult?: "correct"|"wrong",
 * }} params
 */
export function selectTacticalWhiteMove({
  regionCandidates,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  problem,
  studentMoveResult,
}) {
  const style = resolveAiResponseStyle(problem);
  const responseMode = studentMoveResult === "wrong" ? "wrong_reveal" : "default";

  const scoredCandidates = regionCandidates
    .map((candidate) =>
      scoreCandidate({
        candidate,
        stones,
        boardSize,
        stoneColors,
        lastBlackMove,
        style,
        responseMode,
      }),
    )
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore);

  const selected = scoredCandidates[0] ?? null;

  return {
    style,
    aiResponseStyle: style,
    responseMode,
    scoredCandidates,
    selected,
    selectedReason: selected?.selectedReason ?? null,
  };
}

/** @deprecated alias */
export const selectEducationalWhiteMove = selectTacticalWhiteMove;
