import { removeCapturedStonesAfterMove } from "../../game/capture.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "../../game/placement-validation.js";
import {
  getNeighborPoints,
  getStoneAtPoint,
  isOnBoard,
  pointKey,
} from "../../game/rules.js";
import { formatCoordLabel } from "./answer-sequence.js";
import {
  evaluateMultiTargetConnectQuality,
  measureMultiTargetAfterMove,
  measureMultiTargetMetrics,
} from "./target-white-group.js";

function keyToPoint(key) {
  const [x, y] = String(key).split(":").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }
  return { x, y };
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

function groupIndexForStone(stone, targetContext) {
  for (let index = 0; index < targetContext.groups.length; index += 1) {
    if (targetContext.groups[index].some((entry) => pointKey(entry) === pointKey(stone))) {
      return index;
    }
  }
  return -1;
}

function adjacentTargetGroupIndices(point, targetContext, stones, boardSize) {
  const indices = new Set();
  for (const neighbor of getNeighborPoints(point, boardSize)) {
    const stone = getStoneAtPoint(stones, neighbor);
    if (!stone || !targetContext.stoneKeys.has(pointKey(stone))) {
      continue;
    }
    const index = groupIndexForStone(stone, targetContext);
    if (index >= 0) {
      indices.add(index);
    }
  }
  return indices;
}

function collectEmptyNearTarget(targetContext, stones, boardSize) {
  const keys = new Set();

  const addEmpty = (neighbor) => {
    if (!isOnBoard(neighbor, boardSize) || getStoneAtPoint(stones, neighbor)) {
      return;
    }
    keys.add(pointKey(neighbor));
  };

  for (const group of targetContext.groups) {
    for (const stone of group) {
      for (const n1 of getNeighborPoints(stone, boardSize)) {
        addEmpty(n1);
        if (getStoneAtPoint(stones, n1)) {
          continue;
        }
        for (const n2 of getNeighborPoints(n1, boardSize)) {
          addEmpty(n2);
        }
      }
    }
  }

  return [...keys].map(keyToPoint).filter(Boolean);
}

function collectBridgePointsBetweenGroups(groupA, groupB, stones, boardSize) {
  const nearB = new Set();
  for (const stone of groupB) {
    getNeighborPoints(stone, boardSize).forEach((neighbor) => {
      if (!getStoneAtPoint(stones, neighbor)) {
        nearB.add(pointKey(neighbor));
      }
    });
  }

  const bridges = [];
  const seen = new Set();

  for (const stone of groupA) {
    for (const n1 of getNeighborPoints(stone, boardSize)) {
      if (getStoneAtPoint(stones, n1)) {
        continue;
      }
      const key = pointKey(n1);
      if (nearB.has(key) && !seen.has(key)) {
        seen.add(key);
        bridges.push(n1);
      }
      for (const n2 of getNeighborPoints(n1, boardSize)) {
        if (getStoneAtPoint(stones, n2) || !nearB.has(pointKey(n2))) {
          continue;
        }
        if (!seen.has(key)) {
          seen.add(key);
          bridges.push(n1);
        }
      }
    }
  }

  return bridges;
}

function classifyConnectSource(multiAfter) {
  if (multiAfter.groupCountReduction > 0 || multiAfter.connectsGroups) {
    return "merge_target_groups";
  }
  return "connect_target_groups";
}

function buildConnectMeta(multiBefore, multiAfter, source) {
  const quality = evaluateMultiTargetConnectQuality(multiBefore, multiAfter);
  return {
    source,
    groupsBefore: multiAfter.groupsBefore,
    groupsAfter: multiAfter.groupsAfter,
    totalLibertiesBefore: multiAfter.totalLibertiesBefore,
    totalLibertiesAfter: multiAfter.totalLibertiesAfter,
    groupCountReduction: multiAfter.groupCountReduction,
    totalLibertyGain: multiAfter.totalLibertyGain,
    minLibertiesAfter: quality?.minLibertiesAfter ?? multiAfter.minLiberties ?? null,
    perGroupLibertiesAfter: quality?.perGroupLibertiesAfter ?? multiAfter.perGroupLiberties ?? [],
    connectsGroups: multiAfter.connectsGroups,
    bothGroupsSafeAfterMove: quality?.bothGroupsSafeAfterMove ?? false,
    escapeShapeScore: quality?.escapeShapeScore ?? 0,
    connectRankScore: quality?.connectRankScore ?? 0,
    harmfulMerge: quality?.harmfulMerge ?? false,
    beneficialForSurvival: quality?.beneficialForSurvival ?? false,
    multiTarget: multiBefore.multiTarget,
  };
}

/**
 * groupCount >= 2: 타깃 그룹 연결·병합 후보
 */
export function collectConnectTargetGroupsCandidates({
  targetContext,
  stones,
  boardSize,
  stoneColors,
  problem,
}) {
  const multiBefore = measureMultiTargetMetrics(targetContext, stones, boardSize);
  if (!multiBefore?.multiTarget) {
    return {
      candidates: [],
      multiTarget: false,
      connectDiagnostics: [],
    };
  }

  const candidatePoints = new Map();
  const addPoint = (point, tag) => {
    const key = pointKey(point);
    if (!candidatePoints.has(key)) {
      candidatePoints.set(key, { point, tags: new Set([tag]) });
      return;
    }
    candidatePoints.get(key).tags.add(tag);
  };

  for (const point of collectEmptyNearTarget(targetContext, stones, boardSize)) {
    const indices = adjacentTargetGroupIndices(point, targetContext, stones, boardSize);
    if (indices.size >= 2) {
      addPoint(point, "common_adjacent");
    } else {
      addPoint(point, "near_target");
    }
  }

  for (let i = 0; i < targetContext.groups.length; i += 1) {
    for (let j = i + 1; j < targetContext.groups.length; j += 1) {
      for (const point of collectBridgePointsBetweenGroups(
        targetContext.groups[i],
        targetContext.groups[j],
        stones,
        boardSize,
      )) {
        addPoint(point, "pair_bridge");
      }
    }
  }

  const candidates = [];
  const connectDiagnostics = [];

  for (const { point, tags } of candidatePoints.values()) {
    const afterStones = simulateWhiteMove(stones, point, boardSize, stoneColors);
    if (!afterStones) {
      continue;
    }

    const multiAfter = measureMultiTargetAfterMove({
      problem,
      beforeContext: targetContext,
      beforeStones: stones,
      afterStones,
      boardSize,
      stoneColors,
    });
    if (!multiAfter) {
      continue;
    }

    const improves =
      multiAfter.connectsGroups ||
      multiAfter.totalLibertyGain > 0 ||
      multiAfter.groupCountReduction > 0;

    const touchesMultiple = adjacentTargetGroupIndices(
      point,
      targetContext,
      stones,
      boardSize,
    ).size >= 2;

    if (!improves && !touchesMultiple) {
      continue;
    }

    const source = classifyConnectSource(multiAfter);
    const connectMeta = buildConnectMeta(multiBefore, multiAfter, source);
    const entry = {
      move: formatCoordLabel(point),
      ...connectMeta,
      bridgeTags: [...tags],
    };
    connectDiagnostics.push(entry);
    candidates.push({
      x: point.x,
      y: point.y,
      move: entry.move,
      source,
      connectMeta,
    });
  }

  return {
    candidates,
    multiTarget: true,
    connectDiagnostics,
  };
}
