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
import { formatCoordLabel } from "./answer-sequence.js";
import {
  formatTargetWhiteGroupForLog,
  getTargetLibertyPoints,
  isMoveAdjacentToTargetGroup,
  isMoveOnTargetAtariLiberty,
  measureTargetGroupAfterMove,
  pointKeyToCoordLabel,
  resolveTargetWhiteGroup,
} from "./target-white-group.js";

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
  capture_black: "capture_black",
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

export function isForbiddenWrongRevealReason(selectedReason, style) {
  if (style === "sacrifice") {
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

  const selectedReason = mapWrongRevealReason(primaryReason);
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
    if (isWrongReveal && signal === "capture_black" && style !== "capture") {
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
    ? mapWrongRevealReason(primaryReason)
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
}) {
  const targetLiberties = targetContext
    ? getTargetLibertyPoints(targetContext, stones, boardSize).map(formatCoordLabel)
    : [];

  console.log("[KatagoRespond] tactical target selection", {
    targetWhiteGroup: formatTargetWhiteGroupForLog(targetContext),
    targetGroupLiberties: targetContext?.minLiberties ?? null,
    targetLiberties,
    targetLibertyKeys: targetContext
      ? [...(targetContext.atariLibertyKeys ?? [])].map(pointKeyToCoordLabel)
      : [],
    forcedExtendMove: pickDiagnostics?.forcedExtendMove ?? null,
    forcedRejectReason: pickDiagnostics?.forcedRejectReason ?? null,
    forcedPickMode: pickDiagnostics?.forcedPickMode ?? null,
    libertyAttempts: pickDiagnostics?.libertyAttempts ?? null,
    continuousEscapeCandidates: continuousEscapeCandidates.map(formatCoordLabel),
    candidateFutureLiberties: selected?.candidateFutureLiberties ?? null,
    selectedReason: selected?.selectedReason ?? null,
    selectedMove:
      selected?.move ?? (selected ? { x: selected.x, y: selected.y } : null),
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
  const targetContext =
    responseMode === "wrong_reveal"
      ? resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors)
      : null;

  const continuousEscapeCandidates = targetContext
    ? buildContinuousEscapePoints(
        targetContext,
        stones,
        boardSize,
        stoneColors,
        problem,
      )
    : [];

  const mergedCandidates =
    responseMode === "wrong_reveal" && targetContext
      ? mergeTargetSurvivalCandidates(
          regionCandidates,
          targetContext,
          stones,
          boardSize,
          stoneColors,
          problem,
        )
      : [...(regionCandidates ?? [])];

  const scoredCandidates = mergedCandidates
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
        targetContext,
      }),
    )
    .filter(Boolean)
    .sort((a, b) => b.totalScore - a.totalScore);

  let pickDiagnostics = {};
  let selected = scoredCandidates[0] ?? null;

  if (responseMode === "wrong_reveal" && targetContext) {
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
      selected = forced.picked;
      pickDiagnostics.pickMode = forced.diagnostics.forcedPickMode ?? "forced_liberty";
    } else {
      const picked = pickBestWrongRevealWithTarget(
        scoredCandidates,
        targetContext,
        style,
      );
      selected = picked.selected;
      pickDiagnostics = { ...pickDiagnostics, ...picked };
    }
  } else if (responseMode === "wrong_reveal") {
    selected = pickBestWrongRevealCandidate(scoredCandidates, style);
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
    });
  }

  return {
    style,
    aiResponseStyle: style,
    responseMode,
    targetContext,
    scoredCandidates,
    selected,
    selectedReason: selected?.selectedReason ?? null,
  };
}

/** wrong reveal: KataGo inRegion 후보만 사용, 전술은 Top N 내 가산점 */
export const WRONG_REVEAL_KATAGO_TOP_N = 5;

function isSameCandidatePoint(a, b) {
  if (!a || !b) {
    return false;
  }
  return a.x === b.x && a.y === b.y;
}

function candidatePointKey(candidate) {
  return `${candidate.x},${candidate.y}`;
}

function resolveWrongRevealMoveSelectionSource(rawRank) {
  if (rawRank === 1) {
    return "katago";
  }
  if (rawRank != null && rawRank > 1 && rawRank <= WRONG_REVEAL_KATAGO_TOP_N) {
    return "katago_tactical_boost";
  }
  return "tactical_override";
}

function katagoFirstRankingScore(rawCandidates, scoredCandidate, topN = WRONG_REVEAL_KATAGO_TOP_N) {
  const rawIndex = (rawCandidates ?? []).findIndex((entry) =>
    isSameCandidatePoint(entry, scoredCandidate),
  );
  if (rawIndex < 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const orderBonus = Math.max(0, topN - rawIndex) * 1000;
  const tacticalNudge = Math.min(scoredCandidate.tieScore ?? 0, 150);
  return orderBonus + tacticalNudge;
}

function buildBoardStateHash(stones) {
  return [...(stones ?? [])]
    .sort((a, b) => a.y - b.y || a.x - b.x || String(a.color).localeCompare(String(b.color)))
    .map((stone) => `${stone.x},${stone.y},${stone.color}`)
    .join("|");
}

/**
 * wrong reveal: KataGo 후보가 scoreCandidate에서 탈락한 이유 진단
 */
export function diagnoseWrongRevealCandidateScoreable({
  candidate,
  stones,
  boardSize,
  stoneColors,
  regionKeys = null,
}) {
  if (!candidate) {
    return null;
  }

  const point = {
    x: candidate.x,
    y: candidate.y,
  };
  const move = candidate.move ?? formatCoordLabel(point);
  const onBoard = isOnBoard(point, boardSize);
  const occupiedStone = onBoard ? getStoneAtPoint(stones, point) : null;
  const occupied = Boolean(occupiedStone);
  const violatesRegion = regionKeys ? !regionKeys.has(candidatePointKey(candidate)) : false;

  let placementStatus = null;
  let placementReason = null;
  let legal = false;
  let suicide = false;

  if (!onBoard) {
    placementStatus = "off_board";
    placementReason = "off_board";
  } else if (occupied) {
    placementStatus = PLACEMENT_STATUS.occupied;
    placementReason = "occupied";
  } else {
    const evaluation = evaluatePlacement(
      stones,
      { ...point, color: stoneColors.white },
      { boardSize, stoneColors },
    );
    placementStatus = evaluation.status;
    placementReason = evaluation.reason ?? evaluation.status;
    legal = evaluation.status === PLACEMENT_STATUS.legal;
    suicide = evaluation.reason === "suicide";
  }

  return {
    move,
    x: point.x,
    y: point.y,
    legal,
    occupied,
    occupiedBy: occupiedStone?.color ?? null,
    suicide,
    onBoard,
    violatesRegion,
    violatesTargetRule: false,
    placementStatus,
    placementReason,
    boardStateHash: buildBoardStateHash(stones),
    stoneCount: stones?.length ?? 0,
  };
}

function formatScoreableCheckForLog(scoreableCheck) {
  if (!scoreableCheck) {
    return null;
  }

  return {
    move: scoreableCheck.move ?? null,
    legal: scoreableCheck.legal ?? false,
    occupied: scoreableCheck.occupied ?? false,
    occupiedBy: scoreableCheck.occupiedBy ?? null,
    suicide: scoreableCheck.suicide ?? false,
    onBoard: scoreableCheck.onBoard ?? false,
    placementStatus: scoreableCheck.placementStatus ?? null,
    placementReason: scoreableCheck.placementReason ?? null,
    boardStateHash: scoreableCheck.boardStateHash ?? null,
    stoneCount: scoreableCheck.stoneCount ?? 0,
  };
}

function logKatagoTopScoreableCheck({
  katagoTopInRegion,
  katagoTopScored,
  scoreableCheck,
}) {
  const payload = {
    katagoTopInRegion,
    katagoTopScoreable: Boolean(katagoTopScored),
    scoreableCheck: formatScoreableCheckForLog(scoreableCheck),
  };
  console.warn("[KatagoRespond] katago top scoreable check", payload);
  return payload;
}

function findRawKatagoRank(rawCandidates, selected) {
  if (!selected) {
    return null;
  }
  const index = (rawCandidates ?? []).findIndex((candidate) =>
    isSameCandidatePoint(candidate, selected),
  );
  return index >= 0 ? index + 1 : null;
}

function buildScoredCandidateMap(scoredCandidates) {
  const scoredByKey = new Map();
  for (const scored of scoredCandidates ?? []) {
    scoredByKey.set(candidatePointKey(scored), scored);
  }
  return scoredByKey;
}

function buildRegionCandidateKeys(katagoRegionCandidates) {
  return new Set((katagoRegionCandidates ?? []).map((candidate) => candidatePointKey(candidate)));
}

function tryPickScoredKatagoCandidate(rawEntry, regionKeys, scoredByKey) {
  if (!rawEntry) {
    return null;
  }
  const key = candidatePointKey(rawEntry);
  if (!regionKeys.has(key)) {
    return null;
  }
  return scoredByKey.get(key) ?? null;
}

function buildTopNInRegionTrace(
  rawCandidates,
  regionKeys,
  scoredByKey,
  topN,
  scoreableDiagnostics = {},
) {
  return rawCandidates.slice(0, topN).map((candidate, index) => {
    const key = candidatePointKey(candidate);
    const scored = scoredByKey.get(key);
    const rank = index + 1;
    return {
      rank,
      move: candidate.move ?? null,
      inRegion: regionKeys.has(key),
      scoreable: Boolean(scored),
      scoreableCheck: scored ? null : scoreableDiagnostics[rank] ?? null,
      katagoFirstRankingScore: scored
        ? katagoFirstRankingScore(rawCandidates, scored, topN)
        : null,
      tieScore: scored?.tieScore ?? null,
      selectedReason: scored?.selectedReason ?? null,
    };
  });
}

function resolveStrictKatagoPick({
  rawCandidates,
  regionKeys,
  scoredByKey,
  topN = WRONG_REVEAL_KATAGO_TOP_N,
}) {
  const katagoTopEntry = rawCandidates[0] ?? null;
  const katagoTopInRegion = katagoTopEntry
    ? regionKeys.has(candidatePointKey(katagoTopEntry))
    : false;
  const katagoTopScored = tryPickScoredKatagoCandidate(
    katagoTopEntry,
    regionKeys,
    scoredByKey,
  );

  if (katagoTopScored) {
    return {
      selected: katagoTopScored,
      pickMode: "katago_global_top",
      rawRank: 1,
      katagoTopInRegion: true,
      katagoTopScoreable: true,
    };
  }

  for (let index = 1; index < Math.min(topN, rawCandidates.length); index += 1) {
    const scored = tryPickScoredKatagoCandidate(
      rawCandidates[index],
      regionKeys,
      scoredByKey,
    );
    if (scored) {
      return {
        selected: scored,
        pickMode: "katago_top_n_in_region",
        rawRank: index + 1,
        katagoTopInRegion,
        katagoTopScoreable: false,
      };
    }
  }

  return {
    selected: null,
    pickMode: katagoTopInRegion ? "katago_top_unscoreable" : "no_top_n_in_region",
    rawRank: null,
    katagoTopInRegion,
    katagoTopScoreable: false,
  };
}

function maybeApplyTopNTacticalBoost({
  selected,
  pickMode,
  rawCandidates,
  boostPool,
  katagoTopScored,
}) {
  if (katagoTopScored || !selected || boostPool.length === 0) {
    return { selected, pickMode, tacticalBoostApplied: false };
  }

  const bestBoost = [...boostPool].sort(
    (a, b) =>
      katagoFirstRankingScore(rawCandidates, b) -
      katagoFirstRankingScore(rawCandidates, a),
  )[0];

  if (
    bestBoost &&
    !isSameCandidatePoint(bestBoost, selected) &&
    katagoFirstRankingScore(rawCandidates, bestBoost) >
      katagoFirstRankingScore(rawCandidates, selected) + 80
  ) {
    return {
      selected: bestBoost,
      pickMode: "katago_top_n_tactical_boost",
      tacticalBoostApplied: true,
    };
  }

  return { selected, pickMode, tacticalBoostApplied: false };
}

/**
 * wrong reveal: KataGo inRegion 후보 우선, 전술엔진은 Top N 내 점수 보정만.
 * @param {{
 *   rawCandidates: object[],
 *   regionCandidates: object[],
 *   stones: object[],
 *   boardSize: number,
 *   stoneColors: { black: string, white: string },
 *   lastBlackMove: object,
 *   problem: object,
 * }} params
 */
export function selectWrongRevealKatagoFirstMove({
  rawCandidates = [],
  regionCandidates = [],
  stones,
  boardSize,
  stoneColors,
  lastBlackMove,
  problem,
}) {
  const style = resolveAiResponseStyle(problem);
  const targetContext = resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors);
  const katagoRegionCandidates = (regionCandidates ?? []).filter(
    (candidate) => !candidate.injectedTargetSurvival,
  );
  const regionKeys = buildRegionCandidateKeys(katagoRegionCandidates);
  const katagoTopMove = rawCandidates[0]?.move ?? null;
  const katagoTopInRegion = rawCandidates[0]
    ? regionKeys.has(candidatePointKey(rawCandidates[0]))
    : false;

  if (katagoRegionCandidates.length === 0) {
    const katagoTopScoreableCheck = rawCandidates[0]
      ? diagnoseWrongRevealCandidateScoreable({
          candidate: rawCandidates[0],
          stones,
          boardSize,
          stoneColors,
          regionKeys,
        })
      : null;
    const scoreableCheckLog = logKatagoTopScoreableCheck({
      katagoTopInRegion,
      katagoTopScored: false,
      scoreableCheck: katagoTopScoreableCheck,
    });

    return {
      style,
      aiResponseStyle: style,
      responseMode: "wrong_reveal_katago_first",
      targetContext,
      scoredCandidates: [],
      selected: null,
      selectedReason: null,
      selectionMeta: {
        katagoTopMove,
        selectedMove: null,
        selectedSource: "tactical_override",
        selectedKatagoRank: null,
        matchesKatagoTop: false,
        tacticalReason: null,
        overrideAllowed: false,
        pickMode: "no_region_candidates",
        katagoTopInRegion,
        katagoTopScoreable: false,
        scoreableCheck: scoreableCheckLog.scoreableCheck,
        decisionTrace: {
          prePickCandidates: [],
          strictPickMode: "no_region_candidates",
          scoreableCheck: scoreableCheckLog.scoreableCheck,
        },
      },
    };
  }

  const scoredCandidates = katagoRegionCandidates
    .map((candidate) =>
      scoreCandidate({
        candidate,
        stones,
        boardSize,
        stoneColors,
        lastBlackMove,
        style,
        responseMode: "wrong_reveal",
        problem,
        targetContext,
      }),
    )
    .filter(Boolean);
  const scoredByKey = buildScoredCandidateMap(scoredCandidates);

  const scoreableDiagnostics = {};
  for (
    let index = 0;
    index < Math.min(WRONG_REVEAL_KATAGO_TOP_N, rawCandidates.length);
    index += 1
  ) {
    const candidate = rawCandidates[index];
    const rank = index + 1;
    const key = candidatePointKey(candidate);
    if (!regionKeys.has(key) || scoredByKey.has(key)) {
      continue;
    }
    scoreableDiagnostics[rank] = diagnoseWrongRevealCandidateScoreable({
      candidate,
      stones,
      boardSize,
      stoneColors,
      regionKeys,
    });
  }

  const katagoTopScoreableCheck = rawCandidates[0]
    ? diagnoseWrongRevealCandidateScoreable({
        candidate: rawCandidates[0],
        stones,
        boardSize,
        stoneColors,
        regionKeys,
      })
    : null;

  const prePickCandidates = buildTopNInRegionTrace(
    rawCandidates,
    regionKeys,
    scoredByKey,
    WRONG_REVEAL_KATAGO_TOP_N,
    scoreableDiagnostics,
  );

  const katagoTopScored = tryPickScoredKatagoCandidate(
    rawCandidates[0],
    regionKeys,
    scoredByKey,
  );

  const scoreableCheckLog = logKatagoTopScoreableCheck({
    katagoTopInRegion,
    katagoTopScored,
    scoreableCheck: katagoTopScoreableCheck,
  });

  const strictPick = resolveStrictKatagoPick({
    rawCandidates,
    regionKeys,
    scoredByKey,
  });

  let selected = strictPick.selected;
  let pickMode = strictPick.pickMode;

  const boostPool = scoredCandidates.filter((candidate) =>
    findRawKatagoRank(rawCandidates, candidate) != null &&
    findRawKatagoRank(rawCandidates, candidate) <= WRONG_REVEAL_KATAGO_TOP_N,
  );

  if (!katagoTopScored) {
    const boosted = maybeApplyTopNTacticalBoost({
      selected,
      pickMode,
      rawCandidates,
      boostPool,
      katagoTopScored,
    });
    selected = boosted.selected;
    pickMode = boosted.pickMode;
  }

  if (
    selected &&
    isForbiddenWrongRevealReason(selected.selectedReason, style)
  ) {
    const alternate =
      boostPool.find(
        (candidate) =>
          candidate !== selected &&
          !isForbiddenWrongRevealReason(candidate.selectedReason, style),
      ) ?? katagoTopScored ?? strictPick.selected;
    selected = alternate ?? selected;
    pickMode = "forbidden_reason_repick";
  }

  const selectedKatagoRankBeforeClamp = findRawKatagoRank(rawCandidates, selected);
  if (
    selectedKatagoRankBeforeClamp == null ||
    selectedKatagoRankBeforeClamp > WRONG_REVEAL_KATAGO_TOP_N
  ) {
    selected = katagoTopScored ?? strictPick.selected ?? null;
    pickMode =
      selected === katagoTopScored
        ? "katago_global_top_hard_clamp"
        : strictPick.selected
          ? `${strictPick.pickMode}_hard_clamp`
          : "no_allowed_katago_candidate";
  }

  const selectedKatagoRank = findRawKatagoRank(rawCandidates, selected);
  const moveSelectionSource = resolveWrongRevealMoveSelectionSource(selectedKatagoRank);
  const overrideAllowed = moveSelectionSource === "tactical_override";

  const decisionTrace = {
    katagoTopInRegion,
    katagoTopScoreable: Boolean(katagoTopScored),
    scoreableCheck: scoreableCheckLog.scoreableCheck,
    prePickCandidates,
    strictPickMode: strictPick.pickMode,
    strictPickRank: strictPick.rawRank,
    selectedKatagoRankBeforeClamp,
    finalSelectedKatagoRank: selectedKatagoRank,
    topNLimit: WRONG_REVEAL_KATAGO_TOP_N,
  };

  const selectionMeta = {
    katagoTopMove,
    selectedMove: selected?.move ?? null,
    selectedSource: moveSelectionSource,
    selectedKatagoRank,
    matchesKatagoTop: selectedKatagoRank === 1,
    tacticalReason: selected?.selectedReason ?? null,
    overrideAllowed,
    pickMode,
    katagoTopN: WRONG_REVEAL_KATAGO_TOP_N,
    katagoTopInRegion,
    katagoTopScoreable: Boolean(katagoTopScored),
    scoreableCheck: scoreableCheckLog.scoreableCheck,
    strictPickMode: strictPick.pickMode,
    decisionTrace,
  };

  console.warn("[KatagoRespond] wrong reveal katago-first selection", selectionMeta);
  console.warn("[KatagoRespond] wrong reveal selection trace", decisionTrace);

  return {
    style,
    aiResponseStyle: style,
    responseMode: "wrong_reveal_katago_first",
    targetContext,
    scoredCandidates,
    selected,
    selectedReason: selected?.selectedReason ?? null,
    selectionMeta,
  };
}

/** @deprecated alias */
export const selectEducationalWhiteMove = selectTacticalWhiteMove;
