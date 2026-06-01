import { evaluatePlacement, PLACEMENT_STATUS } from "../../game/placement-validation.js";
import { getNeighborPoints, getStoneAtPoint, isOnBoard, pointKey } from "../../game/rules.js";
import { formatCoordLabel } from "./answer-sequence.js";
import { isPointInAllowedRegion } from "./problem-region.js";
import { getTargetLibertyPoints, isMoveAdjacentToTargetGroup } from "./target-white-group.js";
import { collectCaptureToSurviveCandidates } from "./capture-to-survive-candidates.js";
import { collectConnectTargetGroupsCandidates } from "./connect-target-groups-candidates.js";
import { buildNearLastBlackCandidates } from "./wrong-response-fallback.js";

function toCandidate(point, source) {
  return {
    x: point.x,
    y: point.y,
    move: formatCoordLabel(point),
    source,
  };
}

function collectAdjacentEmptyPoints(targetContext, stones, boardSize) {
  const result = [];
  const seen = new Set();

  for (const group of targetContext?.groups ?? []) {
    for (const stone of group) {
      for (const neighbor of getNeighborPoints(stone, boardSize)) {
        if (!isOnBoard(neighbor, boardSize) || getStoneAtPoint(stones, neighbor)) {
          continue;
        }
        const key = pointKey(neighbor);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        result.push(toCandidate(neighbor, "target_adjacent"));
      }
    }
  }

  return result;
}

function collectConnectPoints(targetContext, stones, boardSize) {
  const result = [];
  const seen = new Set();

  for (const group of targetContext?.groups ?? []) {
    const ownKeys = new Set(group.map((stone) => pointKey(stone)));
    for (const stone of group) {
      for (const n1 of getNeighborPoints(stone, boardSize)) {
        if (getStoneAtPoint(stones, n1)) {
          continue;
        }
        for (const n2 of getNeighborPoints(n1, boardSize)) {
          const n2Stone = getStoneAtPoint(stones, n2);
          if (!n2Stone || n2Stone.color !== stone.color || ownKeys.has(pointKey(n2Stone))) {
            continue;
          }
          const key = pointKey(n1);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          result.push(toCandidate(n1, "connect_point"));
        }
      }
    }
  }

  return result;
}

function mergeCandidates(lists) {
  const merged = [];
  const seen = new Set();
  for (const list of lists) {
    for (const candidate of list) {
      const key = `${candidate.x},${candidate.y}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(candidate);
    }
  }
  return merged;
}

function filterLegalInRegion(candidates, { stones, boardSize, stoneColors, allowedRegion }) {
  return candidates.filter((candidate) => {
    const point = { x: candidate.x, y: candidate.y, color: stoneColors.white };
    if (
      allowedRegion &&
      !isPointInAllowedRegion({ x: candidate.x, y: candidate.y }, allowedRegion)
    ) {
      return false;
    }
    const evaluation = evaluatePlacement(stones, point, { boardSize, stoneColors });
    return evaluation.status === PLACEMENT_STATUS.legal;
  });
}

function classifyPlacement(evaluation, stones, point) {
  const occupied = Boolean(getStoneAtPoint(stones, point));
  const occupiedBy = occupied ? getStoneAtPoint(stones, point)?.color ?? null : null;
  return {
    legal: evaluation.status === PLACEMENT_STATUS.legal,
    placementStatus: evaluation.status,
    placementReason: evaluation.reason ?? null,
    occupied,
    occupiedBy,
    suicide:
      evaluation.status === PLACEMENT_STATUS.suicide ||
      evaluation.reason === "suicide",
  };
}

function buildStageTraceForPoint({
  point,
  boardSize,
  stones,
  stoneColors,
  allowedRegion,
  sourcePools,
}) {
  if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    return null;
  }
  const stage = {
    move: formatCoordLabel(point),
    x: point.x,
    y: point.y,
    generatedInSources: sourcePools,
    generated: sourcePools.length > 0,
    inRegion: allowedRegion
      ? isPointInAllowedRegion(point, allowedRegion)
      : true,
  };

  const evaluation = evaluatePlacement(
    stones,
    { x: point.x, y: point.y, color: stoneColors.white },
    { boardSize, stoneColors },
  );
  return {
    ...stage,
    ...classifyPlacement(evaluation, stones, point),
  };
}

/**
 * Phase 1 goal candidate generator (target_survival only).
 *
 * @param {object} params
 * @returns {{ candidates: object[], meta: object }}
 */
export function generateGoalCandidates({
  problemGoal,
  targetContext,
  allowedRegion,
  stones,
  boardSize,
  lastBlackMove,
  stoneColors,
  problem = null,
  tracePoint = null,
}) {
  if (problemGoal !== "target_survival") {
    return {
      candidates: [],
      meta: {
        sources: [],
        targetLibertyLabels: [],
        mergedCount: 0,
        rejectReason: "unsupported_goal",
        trace: buildStageTraceForPoint({
          point: tracePoint,
          boardSize,
          stones,
          stoneColors,
          allowedRegion,
          sourcePools: [],
        }),
      },
    };
  }

  if (!targetContext) {
    return {
      candidates: [],
      meta: {
        sources: [],
        targetLibertyLabels: [],
        mergedCount: 0,
        rejectReason: "no_target_context",
        trace: buildStageTraceForPoint({
          point: tracePoint,
          boardSize,
          stones,
          stoneColors,
          allowedRegion,
          sourcePools: [],
        }),
      },
    };
  }

  const targetLiberties = getTargetLibertyPoints(targetContext, stones, boardSize).map((point) =>
    toCandidate(point, "target_liberty"),
  );
  const targetAdjacent = collectAdjacentEmptyPoints(targetContext, stones, boardSize)
    .filter((candidate) =>
      isMoveAdjacentToTargetGroup(candidate, targetContext, stones, boardSize),
    );
  const connectPoints = collectConnectPoints(targetContext, stones, boardSize);
  const nearLastBlack = (buildNearLastBlackCandidates(lastBlackMove, stones, boardSize) ?? []).map(
    (candidate) => ({
      x: candidate.x,
      y: candidate.y,
      move: candidate.move ?? formatCoordLabel(candidate),
      source: "near_last_black",
    }),
  );

  const { candidates: connectTargetGroups, connectDiagnostics, multiTarget } =
    collectConnectTargetGroupsCandidates({
      targetContext,
      stones,
      boardSize,
      stoneColors,
      problem,
    });

  const { candidates: captureCandidates, captureDiagnostics } =
    collectCaptureToSurviveCandidates({
      targetContext,
      stones,
      boardSize,
      stoneColors,
      problem,
    });

  const merged = mergeCandidates([
    connectTargetGroups,
    captureCandidates,
    targetLiberties,
    targetAdjacent,
    connectPoints,
    nearLastBlack,
  ]);
  const candidates = filterLegalInRegion(merged, {
    stones,
    boardSize,
    stoneColors,
    allowedRegion,
  });

  const sourceSet = new Set(candidates.map((candidate) => candidate.source));
  const sourcePoolsForTrace = [];
  if (tracePoint) {
    const traceKey = `${tracePoint.x},${tracePoint.y}`;
    if (targetLiberties.some((candidate) => `${candidate.x},${candidate.y}` === traceKey)) {
      sourcePoolsForTrace.push("target_liberty");
    }
    if (targetAdjacent.some((candidate) => `${candidate.x},${candidate.y}` === traceKey)) {
      sourcePoolsForTrace.push("target_adjacent");
    }
    if (connectPoints.some((candidate) => `${candidate.x},${candidate.y}` === traceKey)) {
      sourcePoolsForTrace.push("connect_point");
    }
    if (nearLastBlack.some((candidate) => `${candidate.x},${candidate.y}` === traceKey)) {
      sourcePoolsForTrace.push("near_last_black");
    }
    if (captureCandidates.some((candidate) => `${candidate.x},${candidate.y}` === traceKey)) {
      sourcePoolsForTrace.push(
        captureCandidates.find((candidate) => `${candidate.x},${candidate.y}` === traceKey)
          ?.source ?? "capture_to_survive",
      );
    }
    if (connectTargetGroups.some((candidate) => `${candidate.x},${candidate.y}` === traceKey)) {
      sourcePoolsForTrace.push(
        connectTargetGroups.find((candidate) => `${candidate.x},${candidate.y}` === traceKey)
          ?.source ?? "connect_target_groups",
      );
    }
  }

  return {
    candidates,
    meta: {
      sources: [...sourceSet],
      multiTarget,
      targetLibertyLabels: targetLiberties.map((candidate) => candidate.move),
      connectCandidateCount: connectTargetGroups.length,
      connectDiagnostics,
      captureCandidateCount: captureCandidates.length,
      captureDiagnostics,
      mergedCount: merged.length,
      rejectReason: candidates.length === 0 ? "no_legal_goal_candidates" : null,
      trace: buildStageTraceForPoint({
        point: tracePoint,
        boardSize,
        stones,
        stoneColors,
        allowedRegion,
        sourcePools: sourcePoolsForTrace,
      }),
    },
  };
}

