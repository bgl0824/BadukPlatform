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
  isCapturePriorityStyle,
  isWrongRevealCaptureGoal,
  resolveAiResponseStyle,
} from "./tactical-response-styles.js";
import {
  getWrongRevealStrategy,
  resolveProblemGoal,
} from "./problem-goal.js";
import { formatCoordLabel } from "./answer-sequence.js";
import {
  buildTargetWhiteGroupDiagnosticLog,
  findSelectedMoveLibertySource,
  getTargetLibertyPoints,
  isMoveAdjacentToTargetGroup,
  isMoveOnTargetAtariLiberty,
  measureTargetGroupAfterMove,
  pointKeyToCoordLabel,
  resolveTargetGroup,
  resolveTargetWhiteGroup,
  TARGET_WHITE_GROUP_POLICY,
} from "./target-white-group.js";
import {
  filterForbiddenAuthorWhiteCandidates,
  getForbiddenAuthorWhitePoints,
  isForbiddenAuthorWhitePoint,
} from "./wrong-reveal-guard.js";

export { resolveAiResponseStyle } from "./tactical-response-styles.js";
export { resolveProblemGoal } from "./problem-goal.js";

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

/** 오답 대응 — internal reason 키 기준 (정렬용) */
const WRONG_REVEAL_INTERNAL_PRIORITY = {
  extend_atari: 6,
  continuous_escape: 5,
  future_liberty_gain: 4,
  connect_target_group: 3,
  near_last_black: 2,
  katago_prior: 1,
  connect_white: 0,
  increase_liberty: 0,
  escape_from_last_black: 0,
  capture_black: 0,
  general: 0,
  sacrifice_play: -10,
};

/** capture/snapback 오답 — 흑 포획 우선 */
const WRONG_REVEAL_CAPTURE_PRIORITY = {
  capture_black: 10,
  near_wrong_black_capture: 8,
  katago_prior: 1,
  general: 0,
  extend_atari: -5,
  continuous_escape: -5,
  future_liberty_gain: -5,
  connect_target_group: -5,
  near_last_black: 0,
  connect_white: 0,
  increase_liberty: 0,
  escape_from_last_black: 0,
  sacrifice_play: -10,
};

const WRONG_REVEAL_REASON_LABEL = {
  extend_atari: "forced_extend_atari",
  continuous_escape: "continuous_escape",
  future_liberty_gain: "future_liberty_gain",
  connect_target_group: "connect_target_group",
  connect_white: "connect_white_group",
  increase_liberty: "future_liberty_gain",
  escape_from_last_black: "continuous_escape",
  near_last_black: "near_last_black",
  katago_prior: "region_candidate",
  respond_to_black: "region_candidate",
  capture_black: "capture_black_group",
  general: "region_candidate",
  sacrifice_play: "sacrifice_play",
};

const FORBIDDEN_WRONG_REVEAL_REASONS = new Set(["sacrifice_play"]);

const TARGET_SURVIVAL_PRIMARY_REASONS = new Set([
  "extend_atari",
  "continuous_escape",
  "future_liberty_gain",
  "connect_target_group",
]);

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

/** @deprecated alias — use getGroupLibertyPoints */
function getGroupLibertyKeys(stones, group, boardSize) {
  return getGroupLibertyPoints(stones, group, boardSize);
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

function describeCapturableBlackGroups(stones, boardSize, stoneColors) {
  return getGroupsForColor(stones, stoneColors.black, boardSize).map((group, index) => {
    const libertyKeys = getGroupLibertyKeys(stones, group, boardSize);
    const liberties = [...libertyKeys].map((key) => pointKeyToCoordLabel(key));
    return {
      groupIndex: index,
      stones: group.map((stone) => formatCoordLabel(stone)).join(", "),
      stoneCount: group.length,
      libertyCount: libertyKeys.size,
      liberties: liberties.join(", "),
      capturableInOneMove: libertyKeys.size === 1,
      capturePoint: libertyKeys.size === 1 ? liberties[0] ?? null : null,
    };
  });
}

function groupOverlapsTargetContext(group, targetContext) {
  if (!targetContext?.stoneKeys?.size) {
    return true;
  }
  return group.some((stone) => targetContext.stoneKeys.has(pointKey(stone)));
}

function mergeCaptureCandidates(
  regionCandidates,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  targetContext = null,
) {
  const merged = [...(regionCandidates ?? [])];
  const seen = new Set(merged.map((candidate) => `${candidate.x},${candidate.y}`));
  const capturedColor =
    targetContext?.targetColor === "white" ? stoneColors.white : stoneColors.black;

  const addPoint = (point, tag) => {
    if (getStoneAtPoint(stones, point)) {
      return;
    }
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) {
      return;
    }
    const afterStones = simulateWhiteMove(stones, point, boardSize, stoneColors);
    if (!afterStones) {
      return;
    }
    seen.add(key);
    merged.unshift({
      x: point.x,
      y: point.y,
      move: formatCoordLabel(point),
      order: -90,
      visits: null,
      policyPrior: null,
      injectedCapture: true,
      injectionTag: tag,
    });
  };

  for (const group of getGroupsForColor(stones, capturedColor, boardSize)) {
    if (!groupOverlapsTargetContext(group, targetContext)) {
      continue;
    }
    const libertyKeys = getGroupLibertyKeys(stones, group, boardSize);
    if (libertyKeys.size !== 1) {
      continue;
    }
    const [key] = [...libertyKeys];
    const [x, y] = key.split(":").map(Number);
    addPoint({ x, y }, "target_atari_liberty");
  }

  if (lastBlackMove && capturedColor === stoneColors.black) {
    const probePoints = [
      lastBlackMove,
      ...getNeighborPoints(lastBlackMove, boardSize),
    ];
    probePoints.forEach((point) => {
      if (!isOnBoard(point, boardSize)) {
        return;
      }
      const afterStones = simulateWhiteMove(stones, point, boardSize, stoneColors);
      if (!afterStones) {
        return;
      }
      const capturedCount = countCaptures(stones, afterStones, stoneColors.black);
      if (capturedCount > 0) {
        addPoint(point, "near_wrong_black_capture");
      }
    });
  }

  return merged;
}

function safeMergeCaptureCandidates(
  regionCandidates,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  targetContext = null,
) {
  try {
    return mergeCaptureCandidates(
      regionCandidates,
      stones,
      boardSize,
      stoneColors,
      lastBlackMove,
      targetContext,
    );
  } catch (error) {
    console.warn("[KatagoRespond] mergeCaptureCandidates failed — using region candidates only", {
      message: error?.message,
      stack: error?.stack,
    });
    return [...(regionCandidates ?? [])];
  }
}

function safeDescribeCapturableBlackGroups(stones, boardSize, stoneColors) {
  try {
    return describeCapturableBlackGroups(stones, boardSize, stoneColors);
  } catch (error) {
    console.warn("[KatagoRespond] describeCapturableBlackGroups failed", {
      message: error?.message,
    });
    return [];
  }
}

function scoreWrongRevealWithCapture({
  candidate,
  stones,
  afterStones,
  point,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
  weights,
  targetContext = null,
  problem = null,
}) {
  const signals = {};
  const reasons = [];
  const targetColor = targetContext?.targetColor ?? "black";
  const enemyColor =
    targetColor === "white" ? stoneColors.white : stoneColors.black;
  const capturedCount = countCaptures(stones, afterStones, enemyColor);

  if (capturedCount > 0) {
    signals.capture_black = 90000 + capturedCount * 8000;
    reasons.push("capture_black");
  } else if (putsEnemyInAtari(afterStones, point, boardSize, stoneColors)) {
    signals.capture_black = 42000;
    reasons.push("capture_black");
  }

  if (lastBlackMove && capturedCount > 0 && enemyColor === stoneColors.black) {
    const dist = manhattanDistance(point, lastBlackMove);
    if (dist <= 2) {
      signals.near_wrong_black_capture = 6000 + capturedCount * 600 - dist * 200;
      reasons.push("near_wrong_black_capture");
    }
  }

  const libertyDrop =
    minGroupLibertiesForColor(stones, enemyColor, boardSize) -
    minGroupLibertiesForColor(afterStones, enemyColor, boardSize);
  if (libertyDrop > 0 && capturedCount === 0) {
    signals.decrease_black_liberty = 800 + libertyDrop * 120;
    reasons.push("capture_black");
  }

  if (targetContext && targetColor === "white" && capturedCount === 0 && problem) {
    const beforeTarget = targetContext.minLiberties ?? 99;
    const afterTarget = measureTargetGroupAfterMove(
      problem,
      afterStones,
      boardSize,
      stoneColors,
      targetContext,
    );
    const targetDrop = beforeTarget - (afterTarget?.minLiberties ?? beforeTarget);
    if (targetDrop > 0) {
      signals.decrease_black_liberty = (signals.decrease_black_liberty ?? 0) + targetDrop * 200;
      reasons.push("capture_black");
    } else if ((afterTarget?.minLiberties ?? 0) <= 1 && beforeTarget <= 2) {
      signals.decrease_black_liberty = (signals.decrease_black_liberty ?? 0) + 500;
      reasons.push("capture_black");
    }
  }

  const policyBonus = (candidate.policyPrior ?? 0) * 8;
  const orderBonus = Math.max(0, 16 - (candidate.order ?? 16));
  signals.katago_prior = policyBonus + orderBonus;
  if (signals.katago_prior > 4) {
    reasons.push("katago_prior");
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  let tieScore = 0;
  for (const [signal, raw] of Object.entries(signals)) {
    let weight = weights[signal] ?? 1;
    if (signal === "katago_prior") {
      weight *= 0.25;
    }
    tieScore += raw * weight;
  }

  const priorityTable = WRONG_REVEAL_CAPTURE_PRIORITY;
  const primaryReason = [...new Set(reasons)].sort(
    (a, b) => (priorityTable[b] ?? 0) - (priorityTable[a] ?? 0),
  )[0];
  const selectedReason = mapWrongRevealReason(primaryReason, { style, capturedCount });
  const priority = priorityTable[primaryReason] ?? 0;

  return {
    ...candidate,
    point,
    reasons: [...new Set(reasons)],
    signals,
    primaryReason,
    selectedReason,
    tieScore,
    totalScore: priority * 10000 + tieScore,
    aiResponseStyle: style,
    responseMode: "wrong_reveal",
    capturedCountAfterMove: capturedCount,
  };
}

function pickBestCaptureWrongReveal(scoredCandidates, style) {
  const withCapture = scoredCandidates.filter((candidate) => (candidate.capturedCountAfterMove ?? 0) > 0);
  const pool =
    withCapture.length > 0
      ? withCapture
      : scoredCandidates.filter((candidate) => candidate.primaryReason === "capture_black");

  const sorted = pool.sort((left, right) => {
    const captureDiff =
      (right.capturedCountAfterMove ?? 0) - (left.capturedCountAfterMove ?? 0);
    if (captureDiff !== 0) {
      return captureDiff;
    }
    return right.totalScore - left.totalScore;
  });

  return sorted[0] ?? pickBestWrongRevealCandidate(scoredCandidates, style);
}

function buildCaptureSelectionDiagnostics(scoredCandidates, stones, boardSize, stoneColors) {
  const capturableBlackGroups = describeCapturableBlackGroups(stones, boardSize, stoneColors);
  const captureCandidates = scoredCandidates
    .filter((candidate) => (candidate.capturedCountAfterMove ?? 0) > 0)
    .map((candidate) => ({
      move: candidate.move ?? formatCoordLabel(candidate.point ?? candidate),
      capturedCountAfterMove: candidate.capturedCountAfterMove ?? 0,
      selectedReason: candidate.selectedReason,
      totalScore: candidate.totalScore,
    }))
    .sort((left, right) => right.capturedCountAfterMove - left.capturedCountAfterMove);

  return {
    capturableBlackGroups,
    captureCandidates,
  };
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

function mapWrongRevealReason(internalReason, { style = "default", capturedCount = 0 } = {}) {
  if (internalReason === "capture_black" && capturedCount > 0) {
    return style === "snapback" ? "snapback_capture" : "capture_black_group";
  }
  return WRONG_REVEAL_REASON_LABEL[internalReason] ?? internalReason;
}

export function isForbiddenWrongRevealReason(selectedReason, style) {
  if (style === "sacrifice" || style === "snapback") {
    return false;
  }
  return FORBIDDEN_WRONG_REVEAL_REASONS.has(selectedReason);
}

function candidateHasSacrificePlay(scored) {
  if (!scored) {
    return false;
  }
  return (
    scored.primaryReason === "sacrifice_play" ||
    scored.selectedReason === "sacrifice_play" ||
    scored.reasons?.includes("sacrifice_play")
  );
}

function scoreWrongRevealWithTarget({
  candidate,
  stones,
  afterStones,
  point,
  moveKey,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
  problem,
  targetContext,
  weights,
}) {
  const signals = {};
  const reasons = [];
  let candidateFutureLiberties = targetContext.minLiberties;

  const inTargetCrisis = targetContext.minLiberties <= 1;

  if (isMoveOnTargetAtariLiberty(moveKey, targetContext)) {
    signals.extend_atari = inTargetCrisis ? 80000 : 2500;
    reasons.push("extend_atari");
  }

  const targetAfter = measureTargetGroupAfterMove(
    problem,
    afterStones,
    boardSize,
    stoneColors,
    targetContext,
  );
  const targetGain = targetAfter?.libertyGain ?? 0;
  candidateFutureLiberties = targetAfter?.minLiberties ?? candidateFutureLiberties;

  const hadTargetNeighbor = isMoveAdjacentToTargetGroup(
    point,
    targetContext,
    stones,
    boardSize,
  );

  if (targetGain > 0) {
    signals.future_liberty_gain = 900 + targetGain * 150;
    reasons.push("future_liberty_gain");
  }

  if (hadTargetNeighbor) {
    const placed = getStoneAtPoint(afterStones, point);
    const ownGroup = placed
      ? collectConnectedGroup(afterStones, placed, boardSize)
      : [];
    const ownLibs = countGroupLiberties(afterStones, ownGroup, boardSize);
    signals.connect_target_group = 500 + ownLibs * 35;
    reasons.push("connect_target_group");
  }

  const distToBlack = lastBlackMove ? manhattanDistance(point, lastBlackMove) : 99;
  const isEscapeLine =
    hadTargetNeighbor &&
    (targetGain > 0 ||
      (targetAfter?.minLiberties ?? 0) >= 2 ||
      distToBlack >= 2);
  if (isEscapeLine) {
    signals.continuous_escape =
      (inTargetCrisis ? 60000 : 1100) +
      targetGain * (inTargetCrisis ? 500 : 120) +
      ((targetAfter?.minLiberties ?? 0) >= 2 ? (inTargetCrisis ? 5000 : 100) : 0);
    reasons.push("continuous_escape");
  }

  if (inTargetCrisis && targetGain > 0 && !reasons.includes("continuous_escape")) {
    signals.continuous_escape = 55000 + targetGain * 400;
    reasons.push("continuous_escape");
  }

  const policyBonus = (candidate.policyPrior ?? 0) * 10;
  const orderBonus = Math.max(0, 20 - (candidate.order ?? 20));
  signals.katago_prior = policyBonus + orderBonus + (candidate.fromRegion ? 4 : 0);
  if (signals.katago_prior > 4) {
    reasons.push("katago_prior");
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  let tieScore = 0;
  for (const [signal, raw] of Object.entries(signals)) {
    let weight = weights[signal] ?? 1;
    if (signal === "katago_prior") {
      weight *= 0.3;
    }
    tieScore += raw * weight;
  }

  const primaryReason = [...new Set(reasons)].sort(
    (a, b) =>
      (WRONG_REVEAL_INTERNAL_PRIORITY[b] ?? 0) -
      (WRONG_REVEAL_INTERNAL_PRIORITY[a] ?? 0),
  )[0];

  const selectedReason = mapWrongRevealReason(primaryReason, {
    style,
    capturedCount: 0,
  });
  const priority = WRONG_REVEAL_INTERNAL_PRIORITY[primaryReason] ?? 0;

  return {
    ...candidate,
    point,
    reasons: [...new Set(reasons)],
    signals,
    primaryReason,
    selectedReason,
    tieScore,
    totalScore: priority * 10000 + tieScore,
    aiResponseStyle: style,
    responseMode: "wrong_reveal",
    candidateFutureLiberties,
    targetGroupLibertiesBefore: targetContext.minLiberties,
    capturedCountAfterMove: 0,
  };
}

function scoreCandidate({
  candidate,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
  responseMode = "default",
  problem = null,
  targetContext = null,
}) {
  const isWrongReveal = responseMode === "wrong_reveal";
  const allowSacrifice = style === "sacrifice";
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

  if (isWrongReveal && isCapturePriorityStyle(style)) {
    return scoreWrongRevealWithCapture({
      candidate,
      stones,
      afterStones,
      point,
      boardSize,
      stoneColors,
      lastBlackMove,
      style,
      weights,
      targetContext,
      problem,
    });
  }

  if (isWrongReveal && targetContext) {
    return scoreWrongRevealWithTarget({
      candidate,
      stones,
      afterStones,
      point,
      moveKey,
      boardSize,
      stoneColors,
      lastBlackMove,
      style,
      problem,
      targetContext,
      weights,
    });
  }

  const signals = {};
  const reasons = [];

  const whiteAtariLibsBefore = getAtariLibertyKeys(
    stones,
    stoneColors.white,
    boardSize,
  );
  if (whiteAtariLibsBefore.has(moveKey)) {
    signals.extend_atari = isWrongReveal ? 1200 : 520;
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
      if (dist >= 1 && dist <= 2) {
        signals.near_last_black = 280 - dist * 40;
        reasons.push("near_last_black");
      } else if (dist === 3) {
        signals.near_last_black = 60;
        reasons.push("near_last_black");
      } else if (dist > 4) {
        signals.far_from_last_black = -220 - (dist - 4) * 45;
      }

      if (dist >= 3 && whiteAtariLibsBefore.size > 0) {
        signals.escape_from_last_black = 40 + dist * 8;
        reasons.push("escape_from_last_black");
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

  if (allowSacrifice && !isWrongReveal) {
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

  if (allowSacrifice && isWrongReveal) {
    const riskySelfAtari =
      getAtariLibertyKeys(afterStones, stoneColors.white, boardSize).size > 0 &&
      capturedCount === 0;
    const sacrificeValue =
      (riskySelfAtari ? 80 : 0) +
      capturedCount * 70 +
      (minGroupLibertiesForColor(stones, stoneColors.black, boardSize) -
        minGroupLibertiesForColor(afterStones, stoneColors.black, boardSize)) *
        25;
    if (sacrificeValue >= 120 && capturedCount > 0) {
      signals.sacrifice_play = sacrificeValue;
      reasons.push("sacrifice_play");
    }
  }

  const policyBonus = (candidate.policyPrior ?? 0) * (isWrongReveal ? 12 : 40);
  const orderBonus = Math.max(0, 28 - (candidate.order ?? 28));
  signals.katago_prior =
    policyBonus + orderBonus + (isWrongReveal && candidate.fromRegion ? 5 : 0);
  if (signals.katago_prior > 5 || !isWrongReveal) {
    reasons.push("katago_prior");
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  let tieScore = 0;
  for (const [signal, raw] of Object.entries(signals)) {
    if (isWrongReveal && !allowSacrifice && signal === "sacrifice_play") {
      continue;
    }
    let weight = weights[signal] ?? 1;
    if (isWrongReveal && signal === "capture_black" && !isCapturePriorityStyle(style)) {
      weight *= 0.15;
    }
    if (isWrongReveal && signal === "katago_prior") {
      weight *= 0.35;
    }
    tieScore += raw * weight;
  }

  const priorityTable = isWrongReveal ? WRONG_REVEAL_INTERNAL_PRIORITY : REASON_PRIORITY;
  const primaryReason = [...new Set(reasons)].sort(
    (a, b) => (priorityTable[b] ?? 0) - (priorityTable[a] ?? 0),
  )[0];

  const selectedReason = isWrongReveal
    ? mapWrongRevealReason(primaryReason, { style, capturedCount })
    : primaryReason;

  const priority = priorityTable[primaryReason] ?? 0;
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
    capturedCountAfterMove: capturedCount,
  };
}

function pickBestWrongRevealCandidate(scoredCandidates, style) {
  const allowSacrifice = style === "sacrifice";
  const eligible = scoredCandidates.filter((candidate) => {
    if (!candidate) {
      return false;
    }
    if (allowSacrifice) {
      return true;
    }
    return !candidateHasSacrificePlay(candidate);
  });

  const sorted = eligible.sort((a, b) => b.totalScore - a.totalScore);
  return sorted[0] ?? null;
}

function isTargetSurvivalCandidate(scored) {
  if (!scored) {
    return false;
  }
  return TARGET_SURVIVAL_PRIMARY_REASONS.has(scored.primaryReason);
}

function makeInjectedCandidate(point, tag) {
  return {
    x: point.x,
    y: point.y,
    move: formatCoordLabel(point),
    order: -100,
    visits: null,
    policyPrior: null,
    injectedTargetSurvival: true,
    injectionTag: tag,
  };
}

function mergeTargetSurvivalCandidates(regionCandidates, targetContext, stones, boardSize, stoneColors, problem) {
  if (!targetContext) {
    return [...(regionCandidates ?? [])];
  }

  const merged = [...(regionCandidates ?? [])];
  const seen = new Set(merged.map((c) => `${c.x},${c.y}`));

  const addPoint = (point, tag) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key) || getStoneAtPoint(stones, point)) {
      return;
    }
    seen.add(key);
    merged.unshift(makeInjectedCandidate(point, tag));
  };

  getTargetLibertyPoints(targetContext, stones, boardSize).forEach((point) => {
    addPoint(point, "target_liberty");
  });

  const escapePoints = buildContinuousEscapePoints(
    targetContext,
    stones,
    boardSize,
    stoneColors,
    problem,
  );
  escapePoints.forEach((point) => addPoint(point, "continuous_escape"));

  return merged;
}

function buildContinuousEscapePoints(targetContext, stones, boardSize, stoneColors, problem) {
  const points = [];
  const seen = new Set();

  for (const group of targetContext.groups) {
    for (const stone of group) {
      getNeighborPoints(stone, boardSize).forEach((neighbor) => {
        if (getStoneAtPoint(stones, neighbor)) {
          return;
        }
        const key = pointKey(neighbor);
        if (seen.has(key)) {
          return;
        }
        seen.add(key);

        const afterStones = simulateWhiteMove(stones, neighbor, boardSize, stoneColors);
        if (!afterStones) {
          return;
        }

        const afterMetrics = measureTargetGroupAfterMove(
          problem,
          afterStones,
          boardSize,
          stoneColors,
          targetContext,
        );
        const gain = afterMetrics?.libertyGain ?? 0;
        const minAfter = afterMetrics?.minLiberties ?? 0;
        if (gain > 0 || minAfter > targetContext.minLiberties) {
          points.push(neighbor);
        }
      });
    }
  }

  return points;
}

function getForcedLibertyPoints(targetContext, stones, boardSize) {
  if (targetContext.minLiberties > 1) {
    return [];
  }

  if (targetContext.atariLibertyKeys?.size > 0) {
    return [...targetContext.atariLibertyKeys].map((key) => {
      const [x, y] = key.split(":").map(Number);
      return { x, y };
    });
  }

  return getTargetLibertyPoints(targetContext, stones, boardSize);
}

function scoreForcedTargetLibertyMoves({
  targetContext,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
  problem,
}) {
  const liberties = getForcedLibertyPoints(targetContext, stones, boardSize);
  const attempts = [];

  for (const point of liberties) {
    const candidate = makeInjectedCandidate(point, "forced_liberty");
    const scored = scoreCandidate({
      candidate,
      stones,
      boardSize,
      stoneColors,
      lastBlackMove,
      style,
      responseMode: "wrong_reveal",
      problem,
      targetContext,
    });

    if (!scored) {
      attempts.push({
        move: formatCoordLabel(point),
        legal: false,
        rejectReason: "illegal_placement",
      });
      continue;
    }

    attempts.push({
      move: scored.move ?? formatCoordLabel(point),
      legal: true,
      primaryReason: scored.primaryReason,
      selectedReason: scored.selectedReason,
      totalScore: scored.totalScore,
      scored,
    });
  }

  return { liberties, attempts };
}

function tryPickForcedTargetLiberty({
  targetContext,
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  style,
  problem,
}) {
  if (!targetContext) {
    return { picked: null, diagnostics: { forcedRejectReason: "no_target_context" } };
  }

  if (targetContext.minLiberties > 1) {
    return {
      picked: null,
      diagnostics: {
        forcedRejectReason: "target_not_in_crisis",
        targetGroupLiberties: targetContext.minLiberties,
      },
    };
  }

  const { liberties, attempts } = scoreForcedTargetLibertyMoves({
    targetContext,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove,
    style,
    problem,
  });

  const legal = attempts.filter((entry) => entry.legal).map((entry) => entry.scored);
  const forcedExtendMove =
    liberties.length === 1 ? formatCoordLabel(liberties[0]) : liberties.map(formatCoordLabel);

  if (liberties.length === 0) {
    return {
      picked: null,
      diagnostics: {
        forcedExtendMove: null,
        forcedRejectReason: "no_target_liberties",
        libertyAttempts: attempts,
      },
    };
  }

  if (legal.length === 0) {
    return {
      picked: null,
      diagnostics: {
        forcedExtendMove,
        forcedRejectReason: "all_liberty_moves_illegal",
        libertyAttempts: attempts,
      },
    };
  }

  if (liberties.length === 1) {
    const forced = legal[0];
    forced.primaryReason = "extend_atari";
    forced.selectedReason = "forced_extend_atari";
    forced.totalScore = 99999999;
    return {
      picked: forced,
      diagnostics: {
        forcedExtendMove,
        forcedRejectReason: null,
        forcedPickMode: "unique_liberty",
        libertyAttempts: attempts,
      },
    };
  }

  const extendMoves = legal.filter((entry) => entry.reasons?.includes("extend_atari"));
  const pool = extendMoves.length > 0 ? extendMoves : legal;
  const best = pool.sort((a, b) => b.totalScore - a.totalScore)[0];
  if (best?.reasons?.includes("extend_atari")) {
    best.selectedReason = "forced_extend_atari";
    best.totalScore = 99999998;
  }
  return {
    picked: best,
    diagnostics: {
      forcedExtendMove,
      forcedRejectReason: extendMoves.length === 0 ? "no_extend_atari_on_liberty" : null,
      forcedPickMode: "crisis_best_liberty",
      libertyAttempts: attempts,
    },
  };
}

function pickBestWrongRevealWithTarget(scoredCandidates, targetContext, style) {
  const allowSacrifice = style === "sacrifice";
  const eligible = scoredCandidates.filter((candidate) => {
    if (!candidate) {
      return false;
    }
    if (allowSacrifice) {
      return true;
    }
    return !candidateHasSacrificePlay(candidate);
  });

  const survival = eligible.filter(isTargetSurvivalCandidate);
  const inCrisis = Boolean(targetContext && targetContext.minLiberties <= 1);

  if (targetContext && survival.length > 0) {
    return {
      selected: survival.sort((a, b) => b.totalScore - a.totalScore)[0],
      pickMode: inCrisis ? "target_survival_crisis" : "target_survival",
      nearLastBlackRejectedBecause: "target_survival_available",
    };
  }

  if (targetContext) {
    const withoutNearBlack = eligible.filter(
      (candidate) => candidate.primaryReason !== "near_last_black",
    );
    if (withoutNearBlack.length > 0) {
      return {
        selected: withoutNearBlack.sort((a, b) => b.totalScore - a.totalScore)[0],
        pickMode: "no_near_last_black",
        nearLastBlackRejectedBecause: "no_target_survival_scored",
      };
    }
  }

  return {
    selected: pickBestWrongRevealCandidate(scoredCandidates, style),
    pickMode: "default",
    nearLastBlackRejectedBecause: null,
  };
}

function logTargetSurvivalSelection({
  targetContext,
  stones,
  boardSize,
  stoneColors,
  problem,
  selected,
  pickDiagnostics,
  continuousEscapeCandidates,
  forbiddenAuthorWhites = [],
  authorSequenceRemoved = [],
  capturePriority = false,
  captureDiagnostics = null,
  aiResponseStyle = null,
}) {
  const targetLiberties = targetContext
    ? getTargetLibertyPoints(targetContext, stones, boardSize).map(formatCoordLabel)
    : [];

  const selectedPoint = selected?.point ?? (selected?.x != null ? selected : null);
  const selectedMoveLabel =
    selected?.move ??
    (selectedPoint ? formatCoordLabel(selectedPoint) : null);
  const selectedLibertySource = selectedPoint
    ? findSelectedMoveLibertySource(selectedPoint, targetContext, stones, boardSize)
    : null;

  const targetDiagnostic = buildTargetWhiteGroupDiagnosticLog(
    targetContext,
    stones,
    boardSize,
  );

  console.log("[KatagoRespond] tactical target selection", {
    policy: TARGET_WHITE_GROUP_POLICY,
    problemGoal: resolveProblemGoal(problem) ?? null,
    aiResponseStyle: aiResponseStyle ?? null,
    capturePriority,
    targetWhiteGroup: targetDiagnostic,
    targetWhiteGroupStones: targetDiagnostic.targetWhiteGroupStones ?? null,
    targetLiberties: targetDiagnostic.targetLiberties ?? targetLiberties.join(", "),
    targetLibertiesList: targetDiagnostic.targetLibertiesList ?? targetLiberties,
    targetGroupLiberties: targetContext?.minLiberties ?? null,
    targetLibertyKeys: targetContext
      ? [...(targetContext.atariLibertyKeys ?? [])].map(pointKeyToCoordLabel)
      : [],
    capturableBlackGroups: captureDiagnostics?.capturableBlackGroups ?? null,
    captureCandidates: captureDiagnostics?.captureCandidates ?? null,
    selectedMove: selectedMoveLabel,
    selectedReason: selected?.selectedReason ?? null,
    capturedCountAfterMove: selected?.capturedCountAfterMove ?? 0,
    selectedLibertySource,
    forbiddenAuthorWhites: forbiddenAuthorWhites.map(
      (entry) => entry.label ?? formatCoordLabel(entry),
    ),
    authorSequenceCandidatesRemoved: authorSequenceRemoved,
    forcedExtendMove: pickDiagnostics?.forcedExtendMove ?? null,
    forcedRejectReason: pickDiagnostics?.forcedRejectReason ?? null,
    forcedPickMode: pickDiagnostics?.forcedPickMode ?? null,
    libertyAttempts: pickDiagnostics?.libertyAttempts ?? null,
    continuousEscapeCandidates: continuousEscapeCandidates.map(formatCoordLabel),
    candidateFutureLiberties: selected?.candidateFutureLiberties ?? null,
    pickMode: pickDiagnostics?.pickMode ?? null,
    nearLastBlackRejectedBecause: pickDiagnostics?.nearLastBlackRejectedBecause ?? null,
  });
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
 *   session?: object,
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
  session = null,
}) {
  const problemGoal = resolveProblemGoal(problem);
  const style = resolveAiResponseStyle(problem);
  const capturePriority =
    studentMoveResult === "wrong" && isWrongRevealCaptureGoal(problem);
  const responseMode = studentMoveResult === "wrong" ? "wrong_reveal" : "default";
  const targetContext =
    responseMode === "wrong_reveal"
      ? resolveTargetGroup(problem, stones, boardSize, stoneColors)
      : null;
  const useTargetSurvival =
    responseMode === "wrong_reveal" && !capturePriority && Boolean(targetContext);

  const forbiddenAuthorWhites =
    responseMode === "wrong_reveal" ? getForbiddenAuthorWhitePoints(session) : [];

  const continuousEscapeCandidates = targetContext
    ? buildContinuousEscapePoints(
        targetContext,
        stones,
        boardSize,
        stoneColors,
        problem,
      )
    : [];

  let mergedCandidates = [...(regionCandidates ?? [])];
  if (useTargetSurvival) {
    mergedCandidates = mergeTargetSurvivalCandidates(
      regionCandidates,
      targetContext,
      stones,
      boardSize,
      stoneColors,
      problem,
    );
  } else if (capturePriority) {
    mergedCandidates = safeMergeCaptureCandidates(
      regionCandidates,
      stones,
      boardSize,
      stoneColors,
      lastBlackMove,
      targetContext,
    );
    console.log("[KatagoRespond] capture-priority wrong-reveal", {
      problemId: problem?.id,
      problemGoal: problemGoal ?? null,
      aiResponseStyle: style,
      category: problem?.category,
      targetColor: targetContext?.targetColor ?? "black",
      capturableBlackGroups: safeDescribeCapturableBlackGroups(stones, boardSize, stoneColors),
    });
  }

  let authorSequenceFiltered = { candidates: mergedCandidates, removed: [] };
  if (responseMode === "wrong_reveal" && session) {
    authorSequenceFiltered = filterForbiddenAuthorWhiteCandidates(mergedCandidates, session);
    if (authorSequenceFiltered.removed.length > 0) {
      console.log("[KatagoRespond] removed author_sequence white from wrong-reveal candidates", {
        forbiddenAuthorWhites: forbiddenAuthorWhites.map(
          (entry) => entry.label ?? formatCoordLabel(entry),
        ),
        removed: authorSequenceFiltered.removed,
        targetWhiteGroup: buildTargetWhiteGroupDiagnosticLog(targetContext, stones, boardSize),
      });
    }
  }

  if (responseMode === "wrong_reveal" && useTargetSurvival && targetContext) {
    console.log("[TargetGroup] resolved for wrong-reveal survival", {
      problemId: problem?.id,
      problemGoal: problemGoal ?? null,
      ...buildTargetWhiteGroupDiagnosticLog(targetContext, stones, boardSize),
    });
  }

  const scoringTargetContext =
    useTargetSurvival || capturePriority ? targetContext : null;
  const candidatesForScoring = authorSequenceFiltered.candidates;

  const scoredCandidates = candidatesForScoring
    .map((candidate) =>
      scoreCandidate({
        candidate,
        stones,
        boardSize,
        stoneColors,
        lastBlackMove,
        style,
        responseMode,
        problem,
        targetContext: scoringTargetContext,
      }),
    )
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore);

  const captureDiagnostics = capturePriority
    ? (() => {
        try {
          return buildCaptureSelectionDiagnostics(
            scoredCandidates,
            stones,
            boardSize,
            stoneColors,
          );
        } catch (error) {
          console.warn("[KatagoRespond] buildCaptureSelectionDiagnostics failed", {
            message: error?.message,
          });
          return null;
        }
      })()
    : null;

  let pickDiagnostics = {};
  let selected = scoredCandidates[0] ?? null;

  if (responseMode === "wrong_reveal" && capturePriority) {
    selected = pickBestCaptureWrongReveal(scoredCandidates, style);
    pickDiagnostics.pickMode = "capture_priority";
    if (selected) {
      selected.selectedReason = mapWrongRevealReason(selected.primaryReason, {
        style,
        capturedCount: selected.capturedCountAfterMove ?? 0,
      });
    }
  } else if (useTargetSurvival && targetContext) {
    const forced = tryPickForcedTargetLiberty({
      targetContext,
      stones,
      boardSize,
      stoneColors,
      lastBlackMove,
      style,
      problem,
    });

    pickDiagnostics = { ...forced.diagnostics };

    if (forced.picked) {
      if (session && isForbiddenAuthorWhitePoint(forced.picked, session)) {
        console.warn("[KatagoRespond] forced target liberty equals author_sequence white — skip forced pick", {
          move: forced.picked.move ?? formatCoordLabel(forced.picked),
          forbiddenAuthorWhites: forbiddenAuthorWhites.map(
            (entry) => entry.label ?? formatCoordLabel(entry),
          ),
        });
        pickDiagnostics.forcedRejectReason = "forced_liberty_is_author_sequence_white";
        const picked = pickBestWrongRevealWithTarget(scoredCandidates, targetContext, style);
        selected = picked.selected;
        pickDiagnostics = { ...pickDiagnostics, ...picked };
      } else {
        selected = forced.picked;
        pickDiagnostics.pickMode = forced.diagnostics.forcedPickMode ?? "forced_liberty";
      }
    } else {
      const picked = pickBestWrongRevealWithTarget(scoredCandidates, targetContext, style);
      selected = picked.selected;
      pickDiagnostics = { ...pickDiagnostics, ...picked };
    }
  } else if (responseMode === "wrong_reveal") {
    selected = pickBestWrongRevealCandidate(scoredCandidates, style);
  }

  if (
    selected &&
    responseMode === "wrong_reveal" &&
    session &&
    isForbiddenAuthorWhitePoint(selected, session)
  ) {
    console.warn("[KatagoRespond] selected move matches author_sequence white — pick next candidate", {
      rejected: selected.move ?? formatCoordLabel(selected),
      forbiddenAuthorWhites: forbiddenAuthorWhites.map(
        (entry) => entry.label ?? formatCoordLabel(entry),
      ),
    });
    selected =
      scoredCandidates.find(
        (candidate) =>
          candidate !== selected && !isForbiddenAuthorWhitePoint(candidate, session),
      ) ?? null;
  }

  if (
    selected &&
    responseMode === "wrong_reveal" &&
    isForbiddenWrongRevealReason(selected.selectedReason, style)
  ) {
    console.warn("[TacticalResponse] forbidden sacrifice_play — re-picking", {
      style,
      rejected: selected.move,
    });
    selected = pickBestWrongRevealCandidate(
      scoredCandidates.filter((c) => c !== selected),
      style,
    );
    pickDiagnostics.sacrificeRepick = true;
  }

  if (responseMode === "wrong_reveal") {
    logTargetSurvivalSelection({
      targetContext,
      stones,
      boardSize,
      stoneColors,
      problem,
      selected,
      pickDiagnostics,
      continuousEscapeCandidates,
      forbiddenAuthorWhites,
      authorSequenceRemoved: authorSequenceFiltered.removed,
      capturePriority,
      captureDiagnostics,
      aiResponseStyle: style,
    });
  }

  return {
    style,
    aiResponseStyle: style,
    responseMode,
    targetContext,
    capturePriority,
    captureDiagnostics,
    scoredCandidates,
    selected,
    selectedReason: selected?.selectedReason ?? null,
    forbiddenAuthorWhites,
    authorSequenceRemoved: authorSequenceFiltered.removed,
  };
}

/** @deprecated alias */
export const selectEducationalWhiteMove = selectTacticalWhiteMove;
