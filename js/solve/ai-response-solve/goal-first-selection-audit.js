import { formatCoordLabel } from "./answer-sequence.js";
import {
  explainWrongRevealTargetImpactChecks,
} from "./tactical-response-engine.js";
import {
  formatTargetWhiteGroupForLog,
  getTargetLibertyPoints,
  pointKeyToCoordLabel,
} from "./target-white-group.js";
import { pointKey } from "../../game/rules.js";

function candidateKey(candidate) {
  if (!candidate) {
    return null;
  }
  return `${candidate.x},${candidate.y}`;
}

function formatScoredRow(scored, { katagoRank = null, rankBonus = null, source = null } = {}) {
  if (!scored) {
    return null;
  }
  return {
    move: scored.move ?? formatCoordLabel(scored),
    source,
    katagoRank,
    rankBonus,
    totalScore: scored.totalScore ?? null,
    tieScore: scored.tieScore ?? null,
    primaryReason: scored.primaryReason ?? null,
    selectedReason: scored.selectedReason ?? null,
    reasons: scored.reasons ?? [],
    targetLibertiesBefore: scored.targetGroupLibertiesBefore ?? null,
    targetLibertiesAfter: scored.candidateFutureLiberties ?? null,
    libertyGain:
      scored.candidateFutureLiberties != null &&
      scored.targetGroupLibertiesBefore != null
        ? scored.candidateFutureLiberties - scored.targetGroupLibertiesBefore
        : null,
  };
}

function buildTargetContextDetail(targetContext, stones, boardSize) {
  if (!targetContext) {
    return null;
  }

  const liberties = getTargetLibertyPoints(targetContext, stones, boardSize).map(
    formatCoordLabel,
  );
  const groupStones = [];
  for (const group of targetContext.groups ?? []) {
    groupStones.push(group.map((stone) => formatCoordLabel(stone)));
  }

  return {
    ...formatTargetWhiteGroupForLog(targetContext),
    groupCount: targetContext.groups?.length ?? 0,
    targetWhiteGroupStones: groupStones.map((stonesInGroup) => stonesInGroup.join(", ")),
    targetLiberties: liberties,
    targetLibertyCount: liberties.length,
    atariLibertyLabels: [...(targetContext.atariLibertyKeys ?? [])].map(
      pointKeyToCoordLabel,
    ),
    inCrisis: (targetContext.minLiberties ?? 99) <= 1,
  };
}

function resolveSelectedLibertyRelation(selected, targetContext, stones, boardSize) {
  if (!selected?.point && !Number.isInteger(selected?.x)) {
    return null;
  }
  const moveKey = pointKey(selected.point ?? selected);
  const liberties = getTargetLibertyPoints(targetContext, stones, boardSize);
  const onLiberty = liberties.some((liberty) => pointKey(liberty) === moveKey);
  const onAtariLiberty = targetContext?.atariLibertyKeys?.has(moveKey) ?? false;

  return {
    move: selected.move ?? formatCoordLabel(selected),
    onTargetLiberty: onLiberty,
    onAtariLiberty,
    soleLiberty: liberties.length === 1 && onLiberty,
    matchedLiberty: onLiberty ? selected.move ?? formatCoordLabel(selected) : null,
  };
}

function buildComparisonRows(scoredCandidates, selected, winnerScore) {
  const selectedKey = candidateKey(selected);
  const rows = (scoredCandidates ?? []).map((scored, index) => {
    const key = candidateKey(scored);
    const row = formatScoredRow(scored);
    return {
      rank: index + 1,
      ...row,
      isSelected: key === selectedKey,
      scoreGapFromWinner:
        winnerScore != null && scored.totalScore != null
          ? winnerScore - scored.totalScore
          : null,
      lostBecause:
        key === selectedKey
          ? null
          : scored.totalScore != null && winnerScore != null
            ? scored.totalScore < winnerScore
              ? "lower_total_score"
              : "tie_break_or_forced_override"
            : "not_selected",
    };
  });
  return rows;
}

/**
 * Goal-first 최종 선택 정책 진단 (F13 / forced_extend_atari 등)
 */
export function logGoalFirstSelectionAudit({
  problem,
  boardSize,
  stones,
  stoneColors,
  targetContext,
  goalCandidates = [],
  goalMeta = null,
  rankAdjusted = [],
  rawCandidates = [],
  education = null,
  selectedSource = null,
  selectedReason = null,
  katagoTopMove = null,
}) {
  const selected = education?.selected ?? null;
  const scoredCandidates = education?.scoredCandidates ?? [];
  const pickDiagnostics = education?.pickDiagnostics ?? null;
  const poolWinner = scoredCandidates[0] ?? null;
  const winnerScore = selected?.totalScore ?? poolWinner?.totalScore ?? null;

  const rankByKey = new Map();
  for (const candidate of rankAdjusted ?? []) {
    const key = candidateKey(candidate);
    if (key) {
      rankByKey.set(key, {
        katagoRank: candidate.katagoRank ?? null,
        rankBonus: candidate.rankBonus ?? null,
        source: candidate.source ?? null,
      });
    }
  }

  const scoredKeys = new Set(scoredCandidates.map((c) => candidateKey(c)).filter(Boolean));
  const targetDetail = buildTargetContextDetail(targetContext, stones, boardSize);

  console.warn("[KatagoRespond] goal-first multi-target", {
    multiTarget: goalMeta?.multiTarget ?? (targetDetail?.groupCount ?? 0) >= 2,
    groupCount: targetDetail?.groupCount ?? null,
  });

  const connectPool = (goalMeta?.connectDiagnostics ?? []).map((row) => ({
    move: row.move,
    source: row.source,
    groupsBefore: row.groupsBefore,
    groupsAfter: row.groupsAfter,
    totalLibertiesBefore: row.totalLibertiesBefore,
    totalLibertiesAfter: row.totalLibertiesAfter,
    groupCountReduction: row.groupCountReduction,
    totalLibertyGain: row.totalLibertyGain,
    connectsGroups: row.connectsGroups,
    beneficialForSurvival: row.beneficialForSurvival,
    bridgeTags: row.bridgeTags,
  }));
  console.warn("[KatagoRespond] goal-first connect candidates", {
    count: connectPool.length,
    connectCandidates: connectPool,
  });

  const capturePool = (goalMeta?.captureDiagnostics ?? []).map((row) => ({
    move: row.move,
    source: row.source,
    capturedBlackStones: row.capturedBlackStones,
    libertyGainAfterCapture: row.libertyGainAfterCapture,
    targetLibertiesAfterMove: row.targetLibertiesAfterMove,
    beneficialForSurvival: row.beneficialForSurvival,
  }));
  console.warn("[KatagoRespond] goal-first capture candidates", {
    count: capturePool.length,
    candidates: capturePool,
  });

  console.warn("[KatagoRespond] goal-first candidate pool", {
    count: goalCandidates.length,
    sources: goalMeta?.sources ?? [],
    captureCandidateCount: goalMeta?.captureCandidateCount ?? capturePool.length,
    mergedCount: goalMeta?.mergedCount ?? null,
    moves: goalCandidates.map((candidate) => {
      const key = candidateKey(candidate);
      const rankMeta = rankByKey.get(key) ?? {};
      const captureMeta = candidate.captureMeta ?? null;
      const connectMeta = candidate.connectMeta ?? null;
      return {
        move: candidate.move ?? formatCoordLabel(candidate),
        source: candidate.source ?? rankMeta.source ?? null,
        katagoRank: rankMeta.katagoRank ?? null,
        rankBonus: rankMeta.rankBonus ?? null,
        enteredTacticalScore: scoredKeys.has(key),
        capturedBlackStones: captureMeta?.capturedBlackStones ?? null,
        libertyGainAfterCapture: captureMeta?.libertyGainAfterCapture ?? null,
        targetLibertiesAfterMove: captureMeta?.targetLibertiesAfterMove ?? null,
        groupsBefore: connectMeta?.groupsBefore ?? null,
        groupsAfter: connectMeta?.groupsAfter ?? null,
        totalLibertiesBefore: connectMeta?.totalLibertiesBefore ?? null,
        totalLibertiesAfter: connectMeta?.totalLibertiesAfter ?? null,
      };
    }),
  });

  console.warn("[KatagoRespond] goal-first target context", targetDetail);

  const selectedLiberty = targetContext
    ? resolveSelectedLibertyRelation(selected, targetContext, stones, boardSize)
    : null;
  console.warn("[KatagoRespond] goal-first selected liberty", selectedLiberty);

  for (const row of buildComparisonRows(scoredCandidates, selected, winnerScore)) {
    const impact = targetContext
      ? explainWrongRevealTargetImpactChecks({
          scored: scoredCandidates[row.rank - 1],
          stones,
          boardSize,
          stoneColors,
          targetContext,
          problem,
        })
      : null;
    console.warn("[KatagoRespond] goal-first scored row", {
      ...row,
      hasTargetImpact: impact?.hasTargetImpact ?? null,
      targetImpactReasons: impact?.impactReasons ?? [],
    });
  }

  const connectAttempts = pickDiagnostics?.connectCandidates ?? [];
  console.warn("[KatagoRespond] goal-first connect selection", {
    multiTarget: pickDiagnostics?.multiTarget ?? false,
    connectRejectReason: pickDiagnostics?.connectRejectReason ?? null,
    selectedOverForcedLiberty: pickDiagnostics?.selectedOverForcedLiberty ?? false,
    pickedConnectMeta: pickDiagnostics?.pickedConnectMeta ?? null,
    attempts: connectAttempts,
  });

  const captureAttempts = pickDiagnostics?.captureToSurviveAttempts ?? [];
  console.warn("[KatagoRespond] goal-first capture selection", {
    captureRejectReason: pickDiagnostics?.captureRejectReason ?? null,
    selectedOverForcedLiberty: pickDiagnostics?.selectedOverForcedLiberty ?? false,
    deferredForcedLiberty: pickDiagnostics?.deferredForcedLiberty ?? null,
    pickedCaptureMeta: pickDiagnostics?.pickedCaptureMeta ?? null,
    attempts: captureAttempts,
  });

  const forced = {
    forcedExtendMove: pickDiagnostics?.forcedExtendMove ?? null,
    forcedRejectReason: pickDiagnostics?.forcedRejectReason ?? null,
    forcedPickMode: pickDiagnostics?.forcedPickMode ?? null,
    pickMode: pickDiagnostics?.pickMode ?? null,
    nearLastBlackRejectedBecause: pickDiagnostics?.nearLastBlackRejectedBecause ?? null,
    captureToSurviveAttempts: captureAttempts,
    libertyAttempts: (pickDiagnostics?.libertyAttempts ?? []).map((attempt) => ({
      move: attempt.move,
      legal: attempt.legal,
      rejectReason: attempt.rejectReason ?? null,
      primaryReason: attempt.primaryReason ?? null,
      selectedReason: attempt.selectedReason ?? null,
      totalScore: attempt.totalScore ?? null,
    })),
  };
  console.warn("[KatagoRespond] goal-first forced liberty diagnostic", forced);

  const connectOverride =
    pickDiagnostics?.forcedPickMode === "connect_target_groups_override";
  const captureOverride = pickDiagnostics?.forcedPickMode === "capture_to_survive_override";
  const forcedOverride = Boolean(
    pickDiagnostics?.forcedPickMode &&
      !pickDiagnostics?.forcedRejectReason &&
      selected &&
      !captureOverride &&
      !connectOverride,
  );
  const poolWouldPick = poolWinner?.move ?? null;
  const selectedMove = selected?.move ?? null;

  console.warn("[KatagoRespond] goal-first final selection", {
    katagoTopMove,
    selectedMove,
    selectedSource,
    selectedReason: selectedReason ?? education?.selectedReason ?? null,
    selectionPath: connectOverride
      ? "connect_target_groups_override"
      : captureOverride
        ? "capture_to_survive_override"
        : forcedOverride
          ? "forced_target_liberty_override"
          : pickDiagnostics?.pickMode ?? "goal_scored_best",
    connectOverride,
    captureOverride,
    forcedOverride,
    selectedOverForcedLiberty: pickDiagnostics?.selectedOverForcedLiberty ?? false,
    forcedPickMode: pickDiagnostics?.forcedPickMode ?? null,
    poolWinnerWithoutForced: poolWouldPick,
    poolWinnerScore: poolWinner?.totalScore ?? null,
    selectedTotalScore: selected?.totalScore ?? null,
    selectedDiffersFromPoolWinner: Boolean(
      poolWouldPick && selectedMove && poolWouldPick !== selectedMove,
    ),
    whyNotPoolWinner:
      forcedOverride && poolWouldPick && poolWouldPick !== selectedMove
        ? `forced_${pickDiagnostics?.forcedPickMode}_overrides_scored_pool`
        : null,
    selectedLiberty,
    targetLiberties: targetDetail?.targetLiberties ?? null,
  });

  return {
    targetDetail,
    selectedLiberty,
    forced,
    comparisonRows: buildComparisonRows(scoredCandidates, selected, winnerScore),
  };
}
