import { evaluatePlacement, PLACEMENT_STATUS } from "../../game/placement-validation.js";
import { getStoneAtPoint, isSamePoint } from "../../game/rules.js";
import { parseGtpCoordinate } from "../ai-response-ux/coordinates.js";
import {
  formatCoordLabel,
  logWrongRevealExpectedMoveContext,
  resolveWrongRevealExpectedWhite,
} from "./answer-sequence.js";
import { isPointInAllowedRegion } from "./problem-region.js";
import {
  buildNearLastBlackCandidates,
  buildRegionEmptyCandidates,
} from "./wrong-response-fallback.js";
import {
  diagnoseWrongRevealCandidateScoreable,
  explainWrongRevealTargetImpactChecks,
  selectTacticalWhiteMove,
} from "./tactical-response-engine.js";
import {
  formatTargetWhiteGroupForLog,
  resolveTargetWhiteGroup,
} from "./target-white-group.js";

function candidateKey(candidate) {
  if (!candidate) {
    return null;
  }
  const x = candidate.x ?? candidate.point?.x;
  const y = candidate.y ?? candidate.point?.y;
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }
  return `${x},${y}`;
}

function candidatePointKey(candidate) {
  return `${candidate.x},${candidate.y}`;
}

function summarizePoolRow({
  move,
  rank = null,
  scoreable = null,
  hasTargetImpact = null,
  targetImpactReasons = [],
  selectedReason = null,
  totalScore = null,
  poolRejectReason = null,
  isExpectedMove = false,
}) {
  return {
    move,
    rank,
    scoreable,
    hasTargetImpact,
    targetImpactReasons,
    selectedReason,
    totalScore,
    poolRejectReason,
    isExpectedMove,
  };
}

function resolveExpectedMove(problem, blackAnswerIndex, boardSize, lastBlackMove = null, currentPly = null) {
  const resolved = resolveWrongRevealExpectedWhite({
    problem,
    boardSize,
    blackAnswerIndex,
    currentPly,
    lastBlackMove,
  });

  if (resolved.invalid) {
    return {
      move: null,
      point: null,
      source: "author_white_sequence",
      blackAnswerIndex,
      currentPly,
      sequenceIndex: resolved.sequenceIndex,
      invalid: true,
      invalidReason: resolved.invalidReason,
      note:
        resolved.invalidReason === "matches_last_black_move"
          ? "기대 백 수가 방금 둔 오답 흑 수와 같습니다."
          : "fullAnswerSequence에서 이번 백 수를 찾을 수 없습니다.",
    };
  }

  if (!resolved.entry) {
    return {
      move: null,
      point: null,
      source: "author_white_sequence",
      blackAnswerIndex,
      currentPly,
      invalid: true,
      invalidReason: resolved.invalidReason ?? "missing_white_in_sequence",
      note: "fullAnswerSequence에 해당 백 수가 없습니다.",
    };
  }

  const point = { x: resolved.entry.x, y: resolved.entry.y };
  return {
    move: resolved.entry.label ?? formatCoordLabel(point),
    point,
    source: "author_white_sequence",
    blackAnswerIndex,
    currentPly,
    sequenceIndex: resolved.sequenceIndex,
    sequenceIndexFromPly: resolved.sequenceIndexFromPly,
    sequenceIndexFromBlackAnswerIndex: resolved.sequenceIndexFromBlackAnswerIndex,
    indexMismatch: resolved.indexMismatch,
    invalid: false,
    invalidReason: null,
  };
}

function findRawRank(rawCandidates, point) {
  if (!point || !Array.isArray(rawCandidates)) {
    return null;
  }
  const index = rawCandidates.findIndex((candidate) => isSamePoint(candidate, point));
  return index >= 0 ? index + 1 : null;
}

function rowMatchesExpected(row, expected, boardSize) {
  if (!row || !expected?.point) {
    return false;
  }
  if (row.isExpectedMove) {
    return true;
  }
  if (row.move && expected.move && row.move === expected.move) {
    return true;
  }
  const parsed = row.move ? parseGtpCoordinate(row.move, boardSize) : null;
  return Boolean(parsed && isSamePoint(parsed, expected.point));
}

function buildKatagoPool({
  rawCandidates,
  regionKeys,
  scoredByKey,
  stones,
  boardSize,
  stoneColors,
  targetContext,
  problem,
  expected,
  katagoBoardXSize,
  katagoBoardYSize,
}) {
  const rows = [];

  for (let index = 0; index < (rawCandidates ?? []).length; index += 1) {
    const candidate = rawCandidates[index];
    const key = candidatePointKey(candidate);
    if (!regionKeys?.has(key)) {
      continue;
    }

    const rank = index + 1;
    const scored = scoredByKey?.get(key);
    const impactSubject =
      scored ??
      ({
        x: candidate.x,
        y: candidate.y,
        move: candidate.move ?? null,
        point: { x: candidate.x, y: candidate.y },
      });
    const targetImpact = explainWrongRevealTargetImpactChecks({
      scored: impactSubject,
      stones,
      boardSize,
      stoneColors,
      targetContext,
      problem,
    });
    const scoreableCheck = scored
      ? null
      : diagnoseWrongRevealCandidateScoreable({
          candidate,
          stones,
          boardSize,
          stoneColors,
          regionKeys,
          katagoBoardXSize,
          katagoBoardYSize,
        });

    let poolRejectReason = null;
    if (!scored) {
      poolRejectReason = scoreableCheck?.placementReason ?? "not_scoreable";
    } else if (!targetImpact.hasTargetImpact) {
      poolRejectReason = "no_target_impact";
    }

    rows.push(
      summarizePoolRow({
        move: candidate.move ?? formatCoordLabel(candidate),
        rank,
        scoreable: Boolean(scored),
        hasTargetImpact: targetImpact.hasTargetImpact,
        targetImpactReasons: targetImpact.impactReasons ?? [],
        selectedReason: scored?.selectedReason ?? null,
        poolRejectReason,
        isExpectedMove: rowMatchesExpected({ move: candidate.move }, expected, boardSize),
      }),
    );
  }

  return rows;
}

function buildLocalTacticalPool({
  allowedRegion,
  stones,
  boardSize,
  stoneColors,
  lastMove,
  problem,
  regionCandidates,
  expected,
}) {
  const filterLegal = (candidates) =>
    candidates.filter((candidate) => {
      const point = { x: candidate.x, y: candidate.y, color: stoneColors.white };
      const evaluation = evaluatePlacement(stones, point, { boardSize, stoneColors });
      return evaluation.status === PLACEMENT_STATUS.legal && !getStoneAtPoint(stones, point);
    });

  const merged = [];
  const seen = new Set();
  for (const candidate of [
    ...filterLegal(buildNearLastBlackCandidates(lastMove, stones, boardSize)),
    ...filterLegal(regionCandidates ?? []),
    ...filterLegal(buildRegionEmptyCandidates(allowedRegion, stones, boardSize)),
  ]) {
    const key = candidateKey(candidate);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(candidate);
  }

  const targetContext = resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors);
  const education = selectTacticalWhiteMove({
    regionCandidates: merged,
    stones,
    boardSize,
    stoneColors,
    lastBlackMove: lastMove,
    problem,
    studentMoveResult: "wrong",
  });

  const allScored = education.scoredCandidates ?? [];
  const expectedMergedIndex = expected.point
    ? merged.findIndex((candidate) => isSamePoint(candidate, expected.point))
    : -1;
  const expectedScoredIndex = expected.point
    ? allScored.findIndex((scored) => rowMatchesExpected({ move: scored.move }, expected, boardSize))
    : -1;
  const expectedScored =
    expectedScoredIndex >= 0 ? allScored[expectedScoredIndex] : null;

  const rows = allScored.slice(0, 20).map((scored, index) => {
    const targetImpact = explainWrongRevealTargetImpactChecks({
      scored,
      stones,
      boardSize,
      stoneColors,
      targetContext,
      problem,
    });
    return summarizePoolRow({
      move: scored.move ?? formatCoordLabel(scored),
      rank: index + 1,
      scoreable: true,
      hasTargetImpact: targetImpact.hasTargetImpact,
      targetImpactReasons: targetImpact.impactReasons ?? [],
      selectedReason: scored.selectedReason ?? null,
      totalScore: scored.totalScore ?? null,
      poolRejectReason: null,
      isExpectedMove: rowMatchesExpected({ move: scored.move }, expected, boardSize),
    });
  });

  return {
    rows,
    selected: education.selected,
    selectedReason: education.selectedReason,
    pickDiagnostics: education.pickDiagnostics,
    mergedCount: merged.length,
    expectedMergedIndex,
    expectedScoredIndex,
    expectedScored,
  };
}

export function auditWrongRevealCandidatePools({
  problem,
  boardSize,
  stones,
  stoneColors,
  lastMove,
  allowedRegion,
  blackAnswerIndex = 0,
  currentPly = null,
  lastBlackMove = null,
  rawCandidates = [],
  regionCandidates = [],
  regionKeys = null,
  scoredByKey = null,
  katagoSelection = null,
  fallbackResult = null,
  katagoBoardXSize = null,
  katagoBoardYSize = null,
}) {
  const targetContext = resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors);
  logWrongRevealExpectedMoveContext({
    problem,
    boardSize,
    blackAnswerIndex,
    currentPly,
    lastBlackMove,
  });
  const expected = resolveExpectedMove(
    problem,
    blackAnswerIndex,
    boardSize,
    lastBlackMove,
    currentPly,
  );

  const katagoPool =
    katagoSelection?.selectionMeta?.rawInRegionCandidates?.map((row) =>
      summarizePoolRow({
        move: row.move,
        rank: row.rank,
        scoreable: row.scoreable,
        hasTargetImpact: row.hasTargetImpact,
        targetImpactReasons: row.targetImpactReasons ?? [],
        selectedReason: row.selectedReason ?? null,
        poolRejectReason: row.scoreable
          ? row.hasTargetImpact
            ? null
            : "no_target_impact"
          : row.scoreableCheck?.placementReason ?? "not_scoreable",
        isExpectedMove: rowMatchesExpected(row, expected, boardSize),
      }),
    ) ??
    (regionKeys && scoredByKey
      ? buildKatagoPool({
          rawCandidates,
          regionKeys,
          scoredByKey,
          stones,
          boardSize,
          stoneColors,
          targetContext,
          problem,
          expected,
          katagoBoardXSize,
          katagoBoardYSize,
        })
      : []);

  const targetImpactPool = katagoPool.filter((row) => row.hasTargetImpact);
  const localTactical = buildLocalTacticalPool({
    allowedRegion,
    stones,
    boardSize,
    stoneColors,
    lastMove,
    problem,
    regionCandidates,
    expected,
  });

  const pools = {
    katago: katagoPool,
    targetImpact: targetImpactPool,
    localTactical: localTactical.rows,
  };

  const findExpected = (pool) =>
    pool.find((row) => rowMatchesExpected(row, expected, boardSize)) ?? null;
  const expectedKatagoRow = findExpected(katagoPool);
  const expectedTargetImpactRow = findExpected(targetImpactPool);
  const expectedLocalRow = findExpected(localTactical.rows);

  const expectedTargetImpact = expected.point
    ? explainWrongRevealTargetImpactChecks({
        scored: {
          ...expected.point,
          move: expected.move,
          point: expected.point,
        },
        stones,
        boardSize,
        stoneColors,
        targetContext,
        problem,
      })
    : null;

  const finalMove = fallbackResult?.move ?? katagoSelection?.selectionMeta?.selectedMove ?? null;
  const audit = {
    expectedMove: expected,
    expectedMoveAudit: {
      expectedMove: expected.move,
      expectedPoint: expected.point,
      expectedSource: expected.source,
      invalid: expected.invalid ?? false,
      invalidReason: expected.invalidReason ?? null,
      currentPly: expected.currentPly ?? currentPly,
      sequenceIndex: expected.sequenceIndex ?? null,
      indexMismatch: expected.indexMismatch ?? null,
      inKatagoPool: Boolean(expectedKatagoRow),
      inTargetImpactPool: Boolean(expectedTargetImpactRow),
      inLocalTacticalPool: Boolean(expectedLocalRow),
      rawRank: expected.point ? findRawRank(rawCandidates, expected.point) : null,
      inAllowedRegion: expected.point
        ? isPointInAllowedRegion(expected.point, allowedRegion)
        : null,
      katagoRejectReason: expectedKatagoRow?.poolRejectReason ?? "not_in_katago_in_region_pool",
      targetImpactRejectReason:
        expectedTargetImpactRow?.poolRejectReason ??
        (expectedKatagoRow ? "no_target_impact" : "not_in_katago_in_region_pool"),
      localTacticalRejectReason:
        expectedLocalRow?.poolRejectReason ??
        (expectedLocalRow
          ? null
          : localTactical.expectedMergedIndex >= 0
            ? localTactical.expectedScoredIndex >= 20
              ? "below_local_tactical_top20"
              : localTactical.expectedScoredIndex < 0
                ? "not_scored_in_local_tactical"
                : "not_in_local_tactical_top20"
            : "not_in_local_tactical_merged"),
      localTacticalRank: expectedLocalRow?.rank ?? null,
      localTacticalMergedIndex:
        localTactical.expectedMergedIndex >= 0 ? localTactical.expectedMergedIndex + 1 : null,
      localTacticalScoredRank:
        localTactical.expectedScoredIndex >= 0 ? localTactical.expectedScoredIndex + 1 : null,
      localTacticalTotalScore: localTactical.expectedScored?.totalScore ?? null,
      inLocalTacticalMerged: localTactical.expectedMergedIndex >= 0,
      targetImpactChecks: expectedTargetImpact?.checks ?? null,
      targetImpactSummary: expectedTargetImpact
        ? {
            hasTargetImpact: expectedTargetImpact.hasTargetImpact,
            impactReasons: expectedTargetImpact.impactReasons,
          }
        : null,
    },
    targetContext: formatTargetWhiteGroupForLog(targetContext),
    targetImpactCriteria: [
      "on_target_liberty",
      "resolve_target_atari",
      "target_liberty_gain",
      "connect_target_group",
      "adjacent_target_1_2",
      "capture_black",
      "enemy_atari",
    ],
    pools,
    poolCounts: {
      katago: katagoPool.length,
      targetImpact: targetImpactPool.length,
      localTactical: localTactical.rows.length,
    },
    katagoSelection: {
      selectedMove: katagoSelection?.selectionMeta?.selectedMove ?? null,
      pickMode: katagoSelection?.selectionMeta?.pickMode ?? null,
      strictPickMode: katagoSelection?.selectionMeta?.strictPickMode ?? null,
    },
    localTacticalSelection: {
      selectedMove: localTactical.selected?.move ?? fallbackResult?.move ?? null,
      selectedReason: localTactical.selectedReason ?? fallbackResult?.selectedReason ?? null,
      pickDiagnostics: localTactical.pickDiagnostics ?? null,
      mergedCandidateCount: localTactical.mergedCount,
      fallbackReason: fallbackResult?.reason ?? null,
    },
    finalSelection: {
      move: finalMove,
      source: fallbackResult?.selectedSource ?? null,
      reason: fallbackResult?.selectedReason ?? null,
      matchesExpected: expected.move && finalMove ? expected.move === finalMove : false,
    },
  };

  console.warn("[KatagoRespond] wrong reveal candidate pools", {
    expectedMove: audit.expectedMove?.move,
    poolCounts: audit.poolCounts,
    finalSelection: audit.finalSelection,
    expectedInPools: {
      katago: audit.expectedMoveAudit.inKatagoPool,
      targetImpact: audit.expectedMoveAudit.inTargetImpactPool,
      localTactical: audit.expectedMoveAudit.inLocalTacticalPool,
    },
  });

  pools.katago.forEach((row) => {
    console.warn("[KatagoRespond] pool katago row", row);
  });
  pools.targetImpact.forEach((row) => {
    console.warn("[KatagoRespond] pool targetImpact row", row);
  });
  pools.localTactical.forEach((row) => {
    console.warn("[KatagoRespond] pool localTactical row", row);
  });

  console.warn("[KatagoRespond] expected move audit", audit.expectedMoveAudit);

  console.warn("[KatagoRespond] final selection explanation", {
    finalMove: audit.finalSelection.move,
    finalSource: fallbackResult?.selectedSource ?? katagoSelection?.selectionMeta?.selectedSource ?? null,
    finalReason: audit.finalSelection.reason,
    matchesExpected: audit.finalSelection.matchesExpected,
    expectedMove: audit.expectedMove?.move ?? null,
    expectedInPools: {
      katago: audit.expectedMoveAudit.inKatagoPool,
      targetImpact: audit.expectedMoveAudit.inTargetImpactPool,
      localTacticalTop20: audit.expectedMoveAudit.inLocalTacticalPool,
      localTacticalMerged: audit.expectedMoveAudit.inLocalTacticalMerged,
    },
    expectedRejectReasons: {
      katago: audit.expectedMoveAudit.katagoRejectReason,
      targetImpact: audit.expectedMoveAudit.targetImpactRejectReason,
      localTactical: audit.expectedMoveAudit.localTacticalRejectReason,
    },
    expectedTargetImpactChecks: audit.expectedMoveAudit.targetImpactChecks,
    localTacticalPickDiagnostics: audit.localTacticalSelection.pickDiagnostics,
    katagoSelection: audit.katagoSelection,
  });

  return audit;
}
