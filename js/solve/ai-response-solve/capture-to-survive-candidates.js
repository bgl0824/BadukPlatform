import {
  collectConnectedGroup,
  removeCapturedStonesAfterMove,
} from "../../game/capture.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "../../game/placement-validation.js";
import {
  getNeighborPoints,
  getStoneAtPoint,
  isOnBoard,
  pointKey,
} from "../../game/rules.js";
import { formatCoordLabel } from "./answer-sequence.js";
import { measureTargetGroupAfterMove } from "./target-white-group.js";

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

function countCaptures(beforeStones, afterStones, capturedColor) {
  const before = beforeStones.filter((stone) => stone.color === capturedColor).length;
  const after = afterStones.filter((stone) => stone.color === capturedColor).length;
  return Math.max(0, before - after);
}

function getCapturedBlackLabels(beforeStones, afterStones, stoneColors) {
  const afterKeys = new Set(afterStones.map((stone) => pointKey(stone)));
  return beforeStones
    .filter((stone) => stone.color === stoneColors.black && !afterKeys.has(pointKey(stone)))
    .map((stone) => formatCoordLabel(stone));
}

function blackStoneTouchesTarget(blackStone, targetContext, boardSize) {
  if (!targetContext?.stoneKeys?.size) {
    return false;
  }
  return getNeighborPoints(blackStone, boardSize).some((neighbor) =>
    targetContext.stoneKeys.has(pointKey(neighbor)),
  );
}

function collectEmptyPointsNearTarget(targetContext, stones, boardSize, stoneColors) {
  const emptyKeys = new Set();

  const considerNeighbor = (neighbor) => {
    if (!isOnBoard(neighbor, boardSize) || getStoneAtPoint(stones, neighbor)) {
      return;
    }
    emptyKeys.add(pointKey(neighbor));
  };

  for (const group of targetContext?.groups ?? []) {
    for (const stone of group) {
      for (const neighbor of getNeighborPoints(stone, boardSize)) {
        const adjacentStone = getStoneAtPoint(stones, neighbor);
        if (!adjacentStone) {
          considerNeighbor(neighbor);
          continue;
        }
        if (adjacentStone.color === stoneColors.black) {
          for (const n2 of getNeighborPoints(neighbor, boardSize)) {
            considerNeighbor(n2);
          }
        }
      }
    }
  }

  return [...emptyKeys].map(keyToPoint).filter(Boolean);
}

function findBlackGroupsAdjacentToTarget(targetContext, stones, boardSize, stoneColors) {
  const groups = [];
  const seen = new Set();

  for (const group of targetContext?.groups ?? []) {
    for (const stone of group) {
      for (const neighbor of getNeighborPoints(stone, boardSize)) {
        const adjacent = getStoneAtPoint(stones, neighbor);
        if (!adjacent || adjacent.color !== stoneColors.black) {
          continue;
        }
        const blackGroup = collectConnectedGroup(stones, adjacent, boardSize);
        const groupKey = blackGroup
          .map((s) => pointKey(s))
          .sort()
          .join("|");
        if (seen.has(groupKey)) {
          continue;
        }
        seen.add(groupKey);
        groups.push(blackGroup);
      }
    }
  }

  return groups;
}

function classifyCaptureSource({ libertyGain, capturedAdjacentToTarget, capturedCount }) {
  if (libertyGain > 0 && capturedCount > 0) {
    return "capture_to_survive";
  }
  if (libertyGain > 0) {
    return "create_liberty_by_capture";
  }
  if (capturedAdjacentToTarget) {
    return "capture_adjacent_black";
  }
  return "capture_adjacent_black";
}

function buildCaptureMeta({
  move,
  capturedBlackStones,
  libertyGainAfterCapture,
  targetLibertiesAfterMove,
  targetLibertiesBefore,
  capturedCount,
  source,
}) {
  return {
    move,
    capturedBlackStones,
    libertyGainAfterCapture,
    targetLibertiesAfterMove,
    targetLibertiesBefore,
    capturedCount,
    source,
    beneficialForSurvival:
      libertyGainAfterCapture > 0 || (targetLibertiesAfterMove ?? 0) >= 2,
  };
}

/**
 * target_survival: 타깃 백 주변 흑 포획으로 살리는 후보
 *
 * @returns {{ candidates: object[], captureDiagnostics: object[] }}
 */
export function collectCaptureToSurviveCandidates({
  targetContext,
  stones,
  boardSize,
  stoneColors,
  problem,
}) {
  if (!targetContext) {
    return { candidates: [], captureDiagnostics: [] };
  }

  const candidates = [];
  const captureDiagnostics = [];
  const seen = new Set();
  const emptyPoints = collectEmptyPointsNearTarget(
    targetContext,
    stones,
    boardSize,
    stoneColors,
  );

  const addCandidate = (point, source, captureMeta) => {
    const key = pointKey(point);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      x: point.x,
      y: point.y,
      move: formatCoordLabel(point),
      source,
      captureMeta,
    });
  };

  const processPoint = (point) => {
    const afterStones = simulateWhiteMove(stones, point, boardSize, stoneColors);
    if (!afterStones) {
      return;
    }
    const capturedCount = countCaptures(stones, afterStones, stoneColors.black);
    if (capturedCount === 0) {
      return;
    }
    const capturedLabels = getCapturedBlackLabels(stones, afterStones, stoneColors);
    const capturedAdjacentToTarget = stones
      .filter((stone) => stone.color === stoneColors.black)
      .filter((stone) => !afterStones.some((s) => s.x === stone.x && s.y === stone.y))
      .some((stone) => blackStoneTouchesTarget(stone, targetContext, boardSize));
    if (!capturedAdjacentToTarget) {
      return;
    }

    const targetAfter = measureTargetGroupAfterMove(
      problem,
      afterStones,
      boardSize,
      stoneColors,
      targetContext,
    );
    const libertyGain = targetAfter?.libertyGain ?? 0;
    const source = classifyCaptureSource({
      libertyGain,
      capturedAdjacentToTarget,
      capturedCount,
    });
    const captureMeta = buildCaptureMeta({
      move: formatCoordLabel(point),
      capturedBlackStones: capturedLabels,
      libertyGainAfterCapture: libertyGain,
      targetLibertiesAfterMove: targetAfter?.minLiberties ?? null,
      targetLibertiesBefore: targetContext.minLiberties,
      capturedCount,
      source,
    });
    captureDiagnostics.push(captureMeta);
    addCandidate(point, source, captureMeta);
  };

  for (const blackGroup of findBlackGroupsAdjacentToTarget(
    targetContext,
    stones,
    boardSize,
    stoneColors,
  )) {
    const liberties = new Set();
    blackGroup.forEach((stone) => {
      getNeighborPoints(stone, boardSize).forEach((neighbor) => {
        if (!getStoneAtPoint(stones, neighbor)) {
          liberties.add(pointKey(neighbor));
        }
      });
    });
    for (const libertyKey of liberties) {
      const point = keyToPoint(libertyKey);
      if (point) {
        processPoint(point);
      }
    }
  }

  for (const point of emptyPoints) {
    if (seen.has(pointKey(point))) {
      continue;
    }
    processPoint(point);
  }

  return { candidates, captureDiagnostics };
}
