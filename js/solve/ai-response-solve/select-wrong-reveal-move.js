import { getExpectedWrongRevealAuthorWhite } from "./answer-sequence.js";
import { generateGoalCandidates } from "./goal-candidates.js";
import { resolveProblemGoal } from "./problem-goal.js";
import {
  explainWrongRevealTargetImpactChecks,
  resolveAiResponseStyle,
  selectTacticalWhiteMove,
} from "./tactical-response-engine.js";
import { resolveTargetWhiteGroup } from "./target-white-group.js";

function findRawRank(rawCandidates, selected) {
  if (!selected || !Array.isArray(rawCandidates)) {
    return null;
  }
  const index = rawCandidates.findIndex(
    (candidate) => candidate.x === selected.x && candidate.y === selected.y,
  );
  return index >= 0 ? index + 1 : null;
}

function buildRankBonusMap(rawCandidates) {
  const rankByKey = new Map();
  for (let i = 0; i < (rawCandidates ?? []).length; i += 1) {
    const candidate = rawCandidates[i];
    rankByKey.set(`${candidate.x},${candidate.y}`, i + 1);
  }
  return rankByKey;
}

function selectAuthorWhiteCandidate({
  enabled,
  problem,
  blackAnswerIndex,
  boardSize,
  candidates,
}) {
  if (!enabled) {
    return { selected: null, attempt: { move: null, legal: false, used: false, rejectReason: "disabled_by_flag" } };
  }

  const expected = getExpectedWrongRevealAuthorWhite(problem, blackAnswerIndex, boardSize);
  if (!expected) {
    return { selected: null, attempt: { move: null, legal: false, used: false, rejectReason: "missing_sequence" } };
  }

  const matched = candidates.find((candidate) => candidate.x === expected.x && candidate.y === expected.y);
  if (!matched) {
    return {
      selected: null,
      attempt: { move: expected.label ?? null, legal: false, used: false, rejectReason: "illegal_placement" },
    };
  }

  return {
    selected: {
      ...matched,
      point: { x: matched.x, y: matched.y },
      selectedReason: "goal_author_white",
      reasons: ["goal_author_white"],
      totalScore: 10_000_000,
    },
    attempt: { move: expected.label ?? matched.move, legal: true, used: true, rejectReason: "none" },
  };
}

/**
 * Goal-first wrong reveal selector (Phase 1: target_survival).
 *
 * @param {object} params
 */
export function selectWrongRevealMove({
  problem,
  boardSize,
  stones,
  stoneColors,
  lastBlackMove,
  allowedRegion = null,
  targetContext = null,
  problemGoal = null,
  blackAnswerIndex = 0,
  rawCandidates = [],
}) {
  const style = resolveAiResponseStyle(problem);
  const resolvedGoal = problemGoal ?? resolveProblemGoal(problem);
  const resolvedTargetContext =
    targetContext ?? resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors);
  const katagoTopMove = rawCandidates?.[0]?.move ?? null;
  const expected = getExpectedWrongRevealAuthorWhite(problem, blackAnswerIndex, boardSize);
  const expectedPoint =
    expected && Number.isInteger(expected.x) && Number.isInteger(expected.y)
      ? { x: expected.x, y: expected.y }
      : null;
  const expectedMove = expected?.label ?? null;

  const { candidates: goalCandidates, meta } = generateGoalCandidates({
    problemGoal: resolvedGoal,
    targetContext: resolvedTargetContext,
    allowedRegion,
    stones,
    boardSize,
    lastBlackMove,
    stoneColors,
    problem,
    tracePoint: expectedPoint,
  });
  const expectedInGoalPool = Boolean(
    expectedPoint &&
      goalCandidates.some(
        (candidate) =>
          candidate.x === expectedPoint.x && candidate.y === expectedPoint.y,
      ),
  );
  const expectedRawRank = expectedPoint
    ? rawCandidates.findIndex(
        (candidate) =>
          candidate.x === expectedPoint.x && candidate.y === expectedPoint.y,
      ) + 1 || null
    : null;
  const expectedImpact = expectedPoint
    ? explainWrongRevealTargetImpactChecks({
        scored: {
          ...expectedPoint,
          point: expectedPoint,
          move: expectedMove,
        },
        stones,
        boardSize,
        stoneColors,
        targetContext: resolvedTargetContext,
        problem,
      })
    : null;

  if (!resolvedTargetContext || goalCandidates.length === 0) {
    console.warn("[KatagoRespond] goal-first expected move trace", {
      expectedMove,
      expectedPoint,
      expectedRawRank,
      stage: {
        generated: meta?.trace?.generated ?? false,
        generatedInSources: meta?.trace?.generatedInSources ?? [],
        inRegion: meta?.trace?.inRegion ?? null,
        legal: meta?.trace?.legal ?? null,
        placementStatus: meta?.trace?.placementStatus ?? null,
        placementReason: meta?.trace?.placementReason ?? null,
        occupied: meta?.trace?.occupied ?? null,
        occupiedBy: meta?.trace?.occupiedBy ?? null,
        inGoalPool: expectedInGoalPool,
      },
      targetImpact: expectedImpact
        ? {
            hasTargetImpact: expectedImpact.hasTargetImpact,
            targetImpactReasons: expectedImpact.impactReasons,
            checks: expectedImpact.checks,
          }
        : null,
      rejectedAt: resolvedTargetContext ? "goal_pool_empty" : "goal_no_target_context",
    });

    return {
      style,
      aiResponseStyle: style,
      responseMode: "wrong_reveal_goal_first",
      targetContext: resolvedTargetContext,
      scoredCandidates: [],
      selected: null,
      selectedReason: null,
      selectionMeta: {
        policy: "goal_first",
        problemGoal: resolvedGoal,
        katagoTopMove,
        selectedMove: null,
        selectedSource: "goal_first_tactical",
        selectedKatagoRank: null,
        matchesKatagoTop: false,
        tacticalReason: null,
        pickMode: resolvedTargetContext ? "goal_pool_empty" : "goal_no_target_context",
        goalCandidateCount: goalCandidates.length,
        goalPoolMoves: goalCandidates.slice(0, 20).map((candidate) => candidate.move),
        authorWhiteAttempt: null,
        katagoRankAssist: null,
        allowedRegion,
        goalCandidateMeta: meta,
      },
    };
  }

  const useAuthorWhite = window.BadukConfig?.useAuthorWhiteOnWrongReveal === true;
  const author = selectAuthorWhiteCandidate({
    enabled: useAuthorWhite,
    problem,
    blackAnswerIndex,
    boardSize,
    candidates: goalCandidates,
  });
  if (author.selected) {
    return {
      style,
      aiResponseStyle: style,
      responseMode: "wrong_reveal_goal_first",
      targetContext: resolvedTargetContext,
      scoredCandidates: [],
      selected: author.selected,
      selectedReason: author.selected.selectedReason,
      selectionMeta: {
        policy: "goal_first",
        problemGoal: resolvedGoal,
        katagoTopMove,
        selectedMove: author.selected.move,
        selectedSource: "goal_first_author_white",
        selectedKatagoRank: findRawRank(rawCandidates, author.selected),
        matchesKatagoTop: author.selected.move === katagoTopMove,
        tacticalReason: author.selected.selectedReason,
        pickMode: "goal_author_white",
        goalCandidateCount: goalCandidates.length,
        goalPoolMoves: goalCandidates.slice(0, 20).map((candidate) => candidate.move),
        authorWhiteAttempt: author.attempt,
        katagoRankAssist: null,
        allowedRegion,
        goalCandidateMeta: meta,
      },
    };
  }

  const rankBonusMap = buildRankBonusMap(rawCandidates);
  const rankAdjusted = goalCandidates.map((candidate) => {
    const key = `${candidate.x},${candidate.y}`;
    const rank = rankBonusMap.get(key) ?? null;
    const bonus = rank ? Math.max(0, 30 - rank) * 100 : 0;
    return {
      ...candidate,
      katagoRank: rank,
      rankBonus: bonus,
      totalScore: bonus,
      reasons: rank ? ["goal_katago_rank_assist"] : [],
    };
  });
  rankAdjusted.sort((a, b) => b.totalScore - a.totalScore);

  const education = selectTacticalWhiteMove({
    regionCandidates: rankAdjusted,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove,
    problem,
    studentMoveResult: "wrong",
  });
  const selected = education.selected ?? null;
  const selectedRank = selected ? findRawRank(rawCandidates, selected) : null;
  const selectedSource =
    selected && selectedRank != null ? "goal_first_katago_rank" : "goal_first_tactical";
  const selectedReason = selected ? `goal_${education.selectedReason ?? "pool_best"}` : null;

  if (selected) {
    selected.selectedReason = selectedReason;
  }

  const expectedRankInRankAdjusted = expectedPoint
    ? rankAdjusted.findIndex(
        (candidate) =>
          candidate.x === expectedPoint.x && candidate.y === expectedPoint.y,
      ) + 1 || null
    : null;
  const expectedRankInScored = expectedPoint
    ? (education.scoredCandidates ?? []).findIndex(
        (candidate) =>
          candidate.x === expectedPoint.x && candidate.y === expectedPoint.y,
      ) + 1 || null
    : null;
  const expectedScoreable = Boolean(expectedRankInScored);
  const expectedSelected = Boolean(
    selected && expectedPoint && selected.x === expectedPoint.x && selected.y === expectedPoint.y,
  );
  const traceRejectStage = !meta?.trace?.generated
    ? "candidate_generation"
    : meta?.trace?.legal === false
      ? "legal_filter"
      : meta?.trace?.inRegion === false
        ? "region_filter"
        : !expectedInGoalPool
          ? "goal_pool_filter"
          : !expectedScoreable
            ? "scoreable_filter"
            : expectedSelected
              ? null
              : "final_selection";

  console.warn("[KatagoRespond] goal-first expected move trace", {
    expectedMove,
    expectedPoint,
    expectedRawRank,
    stage: {
      generated: meta?.trace?.generated ?? false,
      generatedInSources: meta?.trace?.generatedInSources ?? [],
      inRegion: meta?.trace?.inRegion ?? null,
      legal: meta?.trace?.legal ?? null,
      placementStatus: meta?.trace?.placementStatus ?? null,
      placementReason: meta?.trace?.placementReason ?? null,
      occupied: meta?.trace?.occupied ?? null,
      occupiedBy: meta?.trace?.occupiedBy ?? null,
      inGoalPool: expectedInGoalPool,
      rankAdjusted: expectedRankInRankAdjusted,
      scoreable: expectedScoreable,
      scoredRank: expectedRankInScored,
      selected: expectedSelected,
    },
    targetImpact: expectedImpact
      ? {
          hasTargetImpact: expectedImpact.hasTargetImpact,
          targetImpactReasons: expectedImpact.impactReasons,
          checks: expectedImpact.checks,
        }
      : null,
    rejectedAt: traceRejectStage,
    finalSelection: {
      move: selected?.move ?? null,
      selectedSource,
      selectedReason,
    },
  });

  return {
    ...education,
    style,
    aiResponseStyle: style,
    responseMode: "wrong_reveal_goal_first",
    targetContext: resolvedTargetContext,
    selected,
    selectedReason,
    selectionMeta: {
      policy: "goal_first",
      problemGoal: resolvedGoal,
      katagoTopMove,
      selectedMove: selected?.move ?? null,
      selectedSource,
      selectedKatagoRank: selectedRank,
      matchesKatagoTop: Boolean(selected && selected.move === katagoTopMove),
      tacticalReason: selectedReason,
      pickMode: selected ? "goal_scored_best" : "goal_pool_empty",
      goalCandidateCount: goalCandidates.length,
      goalPoolMoves: goalCandidates.slice(0, 20).map((candidate) => candidate.move),
      authorWhiteAttempt: author.attempt,
      katagoRankAssist: {
        matchedInRawCount: rankAdjusted.filter((candidate) => Number.isInteger(candidate.katagoRank))
          .length,
      },
      allowedRegion,
      goalCandidateMeta: meta,
    },
  };
}

