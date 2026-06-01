/**
 * AI 응수형 오답 대응 QA — 읽기 전용 진단 (엔진/DB 수정 없음)
 */

import { removeCapturedStonesAfterMove } from "../game/capture.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "../game/placement-validation.js";
import {
  getNeighborPoints,
  getStoneAtPoint,
  isOnBoard,
  pointKey,
} from "../game/rules.js";
import {
  formatCoordLabel,
  resolveAnswerSequenceConfig,
  simulateFullAnswerSequence,
} from "../solve/ai-response-solve/answer-sequence.js";
import {
  computeAllowedRegion,
  isPointInAllowedRegion,
} from "../solve/ai-response-solve/problem-region.js";
import { resolveWhiteResponse } from "../solve/ai-response-solve/resolve-white-response.js";
import {
  buildWrongRevealResolveContext,
  logQaWrongRevealParity,
  rememberQaParitySample,
} from "./ai-response-qa-parity.js";
import {
  getTargetLibertyPoints,
  isMoveAdjacentToTargetGroup,
  isMoveOnTargetAtariLiberty,
  measureTargetGroupAfterMove,
  resolveTargetWhiteGroup,
  syncTargetWhiteGroupOnProblem,
} from "../solve/ai-response-solve/target-white-group.js";
import { TACTICAL_FALLBACK_SOURCE } from "../solve/ai-response-solve/wrong-response-fallback.js";
import { buildQaBoardPreviewDataUrl } from "./ai-response-qa-board-preview.js";
import {
  formatAiResponseStyleLabel,
  formatResponseTypeLabel,
  formatSelectedReasonLabel,
} from "./ai-response-qa-labels.js";
import { resolveAiResponseStyle } from "../solve/ai-response-solve/tactical-response-styles.js";
import {
  evaluateResponseQuality,
} from "./ai-response-qa-quality.js";
import {
  bindQaManualMarkEvents,
  buildQaCaseKey,
  filterCasesForDisplay,
  isCaseManuallyMarked,
  renderQaInspectionCaseCard,
} from "./ai-response-qa-inspection.js";
import { NEGATIVE_FACTOR_LABELS } from "./ai-response-qa-quality.js";
import {
  isQaManualMarkEnabled,
  throwIfQaAborted,
} from "./ai-response-qa-session.js";

const QA_ANSWER_MOVE_COUNTS = [3, 5, 7];
const MIN_WRONG_CANDIDATES = 5;
const MAX_WRONG_CANDIDATES = 15;
const QA_LOG_PREFIX = "[AI_QA]";

const manualMarksByScope = new Map();

function getScopeManualMarks(scopeId) {
  const key = String(scopeId ?? "single");
  if (!manualMarksByScope.has(key)) {
    manualMarksByScope.set(key, new Set());
  }
  return manualMarksByScope.get(key);
}

function countManualMarksForCases(manualMarks, cases) {
  return cases.filter((row) => isCaseManuallyMarked(manualMarks, row.caseKey)).length;
}

/** QA 전용 — target-white-group.js 비 export helper */
function getGroupLibertyKeysForQa(stones, group, boardSize) {
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

function findSelectedMoveLibertySource(point, targetContext, stones, boardSize) {
  if (!point || !targetContext?.groups?.length) {
    return null;
  }

  const moveKey = pointKey(point);

  for (let index = 0; index < targetContext.groups.length; index += 1) {
    const group = targetContext.groups[index];
    const libertyKeys = getGroupLibertyKeysForQa(stones, group, boardSize);
    if (!libertyKeys.has(moveKey)) {
      continue;
    }

    return {
      groupIndex: index,
      groupLibertyCount: libertyKeys.size,
      isSoleLiberty: libertyKeys.size === 1,
      matchedAs: libertyKeys.size === 1 ? "sole_liberty_of_group" : "one_of_liberties",
    };
  }

  return {
    groupIndex: null,
    matchedAs: "not_on_any_target_group_liberty",
  };
}

const REVIEW_ISSUE_LABELS = {
  no_response: "AI 응수 없음",
  api_disabled: "API 비활성",
  timeout: "응답 시간 초과",
  far_from_target: "target group과 거리 멂",
  out_of_region: "문제 영역 밖",
  used_fallback: "fallback 사용",
  author_white_match: "정답 수순 백 수와 동일",
};

function attachCaseKeys(results, problemId) {
  return results.map((row) => ({
    ...row,
    caseKey: buildQaCaseKey(problemId, row),
  }));
}

/**
 * @param {object} problem
 * @param {number} boardSize
 */
export function validateAiResponseQaProblem(problem, boardSize) {
  const mode = String(problem?.problemMode ?? "").trim();
  if (mode !== "ai_response") {
    return { ok: false, error: "AI 응수형 문제만 점검할 수 있습니다." };
  }

  const answerMoveCount = Number(problem?.answerMoveCount ?? problem?.answer_move_count ?? 0);
  if (!QA_ANSWER_MOVE_COUNTS.includes(answerMoveCount)) {
    return {
      ok: false,
      error: "3수·5수·7수 AI 응수형 문제만 점검합니다. (1수는 제외)",
    };
  }

  const config = resolveAnswerSequenceConfig(problem, boardSize);
  if (config.fullSequence.length !== answerMoveCount) {
    return {
      ok: false,
      error: `정답 수순 ${answerMoveCount}착이 완성되어야 합니다. (현재 ${config.fullSequence.length}착)`,
    };
  }

  if (config.blackAnswers.length === 0) {
    return { ok: false, error: "흑 정답 수순이 없습니다." };
  }

  const simulation = simulateFullAnswerSequence(problem?.stones ?? [], config.fullSequence, {
    boardSize,
    stoneColors: { black: "black", white: "white" },
    enforceSimpleKo: false,
  });

  if (simulation.error) {
    return {
      ok: false,
      error: `정답 수순 시뮬레이션 실패 (${simulation.error.reason}, ${simulation.error.ply}착)`,
    };
  }

  return { ok: true, config, answerMoveCount };
}

function getQaTimeoutMs() {
  const replaceMs = Number(window.BadukConfig?.katagoWrongReplaceMs);
  const base = Number.isFinite(replaceMs) && replaceMs > 0 ? replaceMs : 1100;
  return Math.max(5000, base * 4);
}

function cloneProblemForQa(problem) {
  return JSON.parse(JSON.stringify(problem));
}

function isSameCoord(a, b) {
  return (
    a &&
    b &&
    Number(a.x) === Number(b.x) &&
    Number(a.y) === Number(b.y)
  );
}

function isLegalEmptyPoint(stones, point, color, boardSize, stoneColors) {
  if (!isOnBoard(point, boardSize) || getStoneAtPoint(stones, point)) {
    return false;
  }
  const move = { x: point.x, y: point.y, color };
  const evaluation = evaluatePlacement(stones, move, { boardSize, stoneColors });
  return evaluation.status === PLACEMENT_STATUS.legal;
}

function applyWhiteMove(stones, point, boardSize, stoneColors) {
  const move = { x: point.x, y: point.y, color: stoneColors.white };
  const evaluation = evaluatePlacement(stones, move, { boardSize, stoneColors });
  if (evaluation.status !== PLACEMENT_STATUS.legal) {
    return null;
  }
  const afterCapture = removeCapturedStonesAfterMove([...stones, move], move, {
    boardSize,
    stoneColors,
  });
  return {
    stones: afterCapture.stones,
    move,
    capturedCount: afterCapture.capturedCount ?? 0,
  };
}

function buildTargetLibertyDiagnostics({
  problem,
  stonesBeforeWhite,
  stonesAfterWhite,
  whitePoint,
  boardSize,
  stoneColors,
}) {
  const targetBefore = resolveTargetWhiteGroup(
    problem,
    stonesBeforeWhite,
    boardSize,
    stoneColors,
  );

  if (!targetBefore) {
    return {
      hasTarget: false,
      targetSummary: "△/DB 타깃 없음",
      libertiesBefore: null,
      libertiesAfter: null,
      libertyGain: null,
      libertiesBeforeLabel: "—",
      libertiesAfterLabel: "—",
      libertyChangeLabel: "—",
      selectedOnTargetLiberty: null,
    };
  }

  const libertiesBeforeList = getTargetLibertyPoints(
    targetBefore,
    stonesBeforeWhite,
    boardSize,
  ).map(formatCoordLabel);
  const metrics = whitePoint
    ? measureTargetGroupAfterMove(
        problem,
        stonesAfterWhite,
        boardSize,
        stoneColors,
        targetBefore,
      )
    : null;

  const targetAfter = resolveTargetWhiteGroup(
    problem,
    stonesAfterWhite,
    boardSize,
    stoneColors,
  );
  const libertiesAfterList = targetAfter
    ? getTargetLibertyPoints(targetAfter, stonesAfterWhite, boardSize).map(formatCoordLabel)
    : [];

  const libertiesBefore = targetBefore.minLiberties;
  const libertiesAfter = targetAfter?.minLiberties ?? null;
  const libertyGain = metrics?.libertyGain ?? (libertiesAfter != null ? libertiesAfter - libertiesBefore : null);

  const selectedOnTargetLiberty = whitePoint
    ? findSelectedMoveLibertySource(
        whitePoint,
        targetBefore,
        stonesBeforeWhite,
        boardSize,
      )
    : null;

  let libertyChangeLabel = "—";
  if (libertyGain != null) {
    const sign = libertyGain > 0 ? "+" : "";
    libertyChangeLabel = `${libertiesBefore} → ${libertiesAfter ?? "?"} (${sign}${libertyGain})`;
  } else if (libertiesBefore != null) {
    libertyChangeLabel = `${libertiesBefore} (백 응수 없음)`;
  }

  return {
    hasTarget: true,
    targetSummary: `최소 활로 ${libertiesBefore}${targetBefore.minLiberties <= 1 ? " (단수)" : ""}`,
    libertiesBefore,
    libertiesAfter,
    libertyGain,
    libertiesBeforeLabel: libertiesBeforeList.join(", ") || "—",
    libertiesAfterLabel: libertiesAfterList.join(", ") || "—",
    libertyChangeLabel,
    selectedOnTargetLiberty,
    selectedOnTargetLibertyLabel: selectedOnTargetLiberty?.matchedAs ?? null,
  };
}

function buildFailedQualityRow(issueKey, issueLabel, verdict = "review") {
  return {
    verdict,
    qualityScore: 0,
    qualityGoal: "target_survival",
    positiveFactors: [],
    positiveLabels: [],
    negativeFactors: [issueKey],
    problemReasons: [issueLabel],
    negativeLabels: [issueLabel],
    status: "fail",
    issues: [issueKey],
    issueLabels: [issueLabel],
  };
}

function applyBlackMove(stones, point, boardSize, stoneColors) {
  const move = { x: point.x, y: point.y, color: stoneColors.black };
  const evaluation = evaluatePlacement(stones, move, { boardSize, stoneColors });
  if (evaluation.status !== PLACEMENT_STATUS.legal) {
    return null;
  }
  const afterCapture = removeCapturedStonesAfterMove([...stones, move], move, {
    boardSize,
    stoneColors,
  });
  return {
    stones: afterCapture.stones,
    move,
    capturedCount: afterCapture.capturedCount ?? 0,
  };
}

/**
 * @param {object} params
 */
function buildBoardBeforeBlackPly(problem, blackPlyIndex, boardSize, stoneColors) {
  const config = resolveAnswerSequenceConfig(problem, boardSize);
  const prefixLength = blackPlyIndex * 2;
  const prefix = config.fullSequence.slice(0, prefixLength);
  const simulation = simulateFullAnswerSequence(problem?.stones ?? [], prefix, {
    boardSize,
    stoneColors,
    enforceSimpleKo: false,
  });

  if (simulation.error) {
    return { error: simulation.error };
  }

  const expectedBlack = config.blackAnswers[blackPlyIndex] ?? null;
  const authorWhiteEntry = config.fullSequence[prefixLength + 1] ?? null;
  const authorWhite =
    authorWhiteEntry?.color === "white" ? authorWhiteEntry : null;

  return {
    stones: simulation.stones,
    playedMoves: simulation.history.map((entry) => entry.move),
    currentPly: prefixLength + 1,
    currentPlyAfterBlack: prefixLength + 2,
    blackAnswerIndex: blackPlyIndex,
    expectedBlack,
    authorWhite,
    blackPlyIndex,
    blackPlyLabel: blackPlyIndex + 1,
  };
}

function addCandidate(map, point, tag) {
  const key = `${point.x},${point.y}`;
  if (map.has(key)) {
    return;
  }
  map.set(key, { x: point.x, y: point.y, tag });
}

/**
 * @param {object} params
 */
function generateWrongCandidatesForPly({
  problem,
  scenario,
  boardSize,
  stoneColors,
  maxCount,
}) {
  const { stones, expectedBlack } = scenario;
  if (!expectedBlack) {
    return [];
  }

  const map = new Map();
  const correctKey = `${expectedBlack.x},${expectedBlack.y}`;

  const tryAdd = (point, tag) => {
    if (`${point.x},${point.y}` === correctKey) {
      return;
    }
    if (!isLegalEmptyPoint(stones, point, stoneColors.black, boardSize, stoneColors)) {
      return;
    }
    addCandidate(map, point, tag);
  };

  for (const dist of [1, 2]) {
    for (let dx = -dist; dx <= dist; dx += 1) {
      for (let dy = -dist; dy <= dist; dy += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== dist) {
          continue;
        }
        tryAdd(
          { x: expectedBlack.x + dx, y: expectedBlack.y + dy },
          "near_correct",
        );
      }
    }
  }

  const targetContext = resolveTargetWhiteGroup(problem, stones, boardSize, stoneColors);
  if (targetContext) {
    getTargetLibertyPoints(targetContext, stones, boardSize).forEach((point) => {
      tryAdd(point, "target_liberty");
    });
    for (const group of targetContext.groups ?? []) {
      for (const stone of group) {
        getNeighborPoints(stone, boardSize).forEach((neighbor) => {
          tryAdd(neighbor, "near_target");
        });
      }
    }
  }

  const region = computeAllowedRegion({
    boardSize,
    stones,
    initialStones: problem?.stones ?? [],
    lastMove: null,
    margin: Number(window.BadukConfig?.katagoRespondRegionMargin) || 2,
  });

  for (let x = region.minX; x <= region.maxX; x += 1) {
    for (let y = region.minY; y <= region.maxY; y += 1) {
      tryAdd({ x, y }, "in_region");
      if (map.size >= maxCount * 2) {
        break;
      }
    }
    if (map.size >= maxCount * 2) {
      break;
    }
  }

  const priority = {
    near_correct: 0,
    target_liberty: 1,
    near_target: 2,
    in_region: 3,
  };

  return [...map.values()]
    .sort((a, b) => (priority[a.tag] ?? 9) - (priority[b.tag] ?? 9))
    .slice(0, maxCount);
}

function collectQaCases(problem, boardSize, stoneColors) {
  const config = resolveAnswerSequenceConfig(problem, boardSize);
  const blackCount = config.blackAnswers.length;
  const perPly = Math.max(2, Math.ceil(MAX_WRONG_CANDIDATES / blackCount));
  const cases = [];
  const seen = new Set();

  for (let blackPlyIndex = 0; blackPlyIndex < blackCount; blackPlyIndex += 1) {
    const scenario = buildBoardBeforeBlackPly(problem, blackPlyIndex, boardSize, stoneColors);
    if (scenario.error) {
      continue;
    }

    const candidates = generateWrongCandidatesForPly({
      problem,
      scenario,
      boardSize,
      stoneColors,
      maxCount: perPly,
    });

    for (const candidate of candidates) {
      const caseKey = `${blackPlyIndex}:${candidate.x},${candidate.y}`;
      if (seen.has(caseKey)) {
        continue;
      }
      seen.add(caseKey);
      cases.push({
        blackPlyIndex,
        wrongPoint: { x: candidate.x, y: candidate.y },
        candidateTag: candidate.tag,
        scenario,
      });
      if (cases.length >= MAX_WRONG_CANDIDATES) {
        return cases;
      }
    }
  }

  return cases;
}

function classifyQaResponse({
  response,
  responseTimeMs,
  scenario,
  wrongPoint,
  stonesAfterWrong,
  problem,
  boardSize,
  stoneColors,
}) {
  const issues = [];

  if (response?.disabled) {
    issues.push("api_disabled");
  }

  if (!response?.ok || !response?.point) {
    issues.push("no_response");
  }

  if (responseTimeMs > getQaTimeoutMs()) {
    issues.push("timeout");
  }

  if (response?.usedLocalFallback || response?.source === TACTICAL_FALLBACK_SOURCE) {
    issues.push("used_fallback");
  }

  const allowedRegion = computeAllowedRegion({
    boardSize,
    stones: stonesAfterWrong,
    initialStones: problem?.stones ?? [],
    lastMove: { ...wrongPoint, color: stoneColors.black },
    margin: Number(window.BadukConfig?.katagoRespondRegionMargin) || 2,
  });

  if (response?.point && !isPointInAllowedRegion(response.point, allowedRegion)) {
    issues.push("out_of_region");
  }

  if (scenario.authorWhite && response?.point && isSameCoord(response.point, scenario.authorWhite)) {
    issues.push("author_white_match");
  }

  const targetContext = resolveTargetWhiteGroup(
    problem,
    stonesAfterWrong,
    boardSize,
    stoneColors,
  );
  if (targetContext && response?.point) {
    const moveKey = pointKey(response.point);
    const onLiberty = isMoveOnTargetAtariLiberty(moveKey, targetContext);
    const adjacent = isMoveAdjacentToTargetGroup(
      response.point,
      targetContext,
      stonesAfterWrong,
      boardSize,
    );
    if (!onLiberty && !adjacent) {
      issues.push("far_from_target");
    }
  }

  let status = "normal";
  if (!response?.ok || !response?.point) {
    const onlyApiIssue = issues.every(
      (issue) => issue === "api_disabled" || issue === "no_response",
    );
    status = onlyApiIssue ? "review" : "fail";
  } else if (issues.length > 0) {
    status = "review";
  }

  return {
    status,
    issues,
    issueLabels: issues.map((key) => REVIEW_ISSUE_LABELS[key] ?? key),
  };
}

function isSuspiciousQaRow(row) {
  return row?.verdict === "review" || row?.verdict === "problem";
}

function logQaCase({
  problem,
  caseInfo,
  wrongLabel,
  response,
  responseTimeMs,
  classification,
  targetDiagnostics,
  quality,
  parityContext,
}) {
  console.log(QA_LOG_PREFIX, {
    problemId: problem?.id ?? null,
    blackPly: caseInfo.scenario.blackPlyLabel,
    blackAnswerIndex: parityContext?.blackAnswerIndex ?? caseInfo.scenario.blackAnswerIndex,
    currentPlyBeforeBlack: parityContext?.currentPlyBeforeBlack ?? caseInfo.scenario.currentPly,
    currentPly: parityContext?.currentPly ?? null,
    candidateMove: wrongLabel,
    candidateTag: caseInfo.candidateTag,
    selectedMove: response?.move ?? (response?.point ? formatCoordLabel(response.point) : null),
    selectedReason: response?.selectedReason ?? null,
    selectedReasonLabel: formatSelectedReasonLabel(response?.selectedReason),
    responseType: response ? formatResponseTypeLabel(response, problem) : null,
    aiResponseStyle: response?.aiResponseStyle ?? resolveAiResponseStyle(problem),
    stonesBeforeCount: parityContext?.stonesBeforeCount ?? null,
    stonesAfterCount: parityContext?.stonesAfterCount ?? null,
    allowedRegion: parityContext?.allowedRegion ?? null,
    targetLibertyChange: targetDiagnostics?.libertyChangeLabel ?? null,
    targetLibertiesBefore: targetDiagnostics?.libertiesBeforeLabel ?? null,
    targetLibertiesAfter: targetDiagnostics?.libertiesAfterLabel ?? null,
    libertyGain: targetDiagnostics?.libertyGain ?? null,
    qualityScore: quality?.score ?? null,
    verdict: quality?.verdict ?? null,
    problemReasons: quality?.problemReasons ?? [],
    positiveLabels: quality?.positiveLabels ?? [],
    source: response?.source ?? null,
    responseTimeMs,
    usedFallback: Boolean(response?.usedLocalFallback),
    status: classification.status,
    issues: classification.issues,
    parityNote: "실제 풀이와 비교: 콘솔 [AI_RESPONSE_PARITY] play vs [AI_QA_PARITY] qa",
  });
}

/**
 * @param {object} params
 */
async function runSingleQaCase({ problem, caseInfo, boardSize, stoneColors }) {
  const { wrongPoint, scenario } = caseInfo;
  const wrongLabel = formatCoordLabel(wrongPoint);
  const startMs = Date.now();

  const applied = applyBlackMove(scenario.stones, wrongPoint, boardSize, stoneColors);
  if (!applied) {
    return {
      ...buildFailedQualityRow("illegal_wrong_black", "흑 오답 불법"),
      candidateMove: wrongLabel,
      candidateTag: caseInfo.candidateTag,
      blackPly: scenario.blackPlyLabel,
      selectedMove: null,
      selectedReason: null,
      responseTimeMs: Date.now() - startMs,
      usedFallback: false,
      source: null,
      targetDiagnostics: { hasTarget: false, targetSummary: "—" },
      previewDataUrl: null,
    };
  }

  const stonesAfterWrong = applied.stones;
  const parityContext = buildWrongRevealResolveContext({
    problem,
    scenario,
    wrongPoint,
    applied,
    boardSize,
    stoneColors,
    initialStones: problem?.stones ?? [],
  });

  logQaWrongRevealParity("before-resolve", parityContext);

  let response = null;
  try {
    response = await resolveWhiteResponse(parityContext.resolveWhiteResponseParams);
    logQaWrongRevealParity("after-resolve", parityContext, response);
    rememberQaParitySample(parityContext, response);
  } catch (error) {
    return {
      ...buildFailedQualityRow("exception", String(error?.message ?? "exception")),
      candidateMove: wrongLabel,
      candidateTag: caseInfo.candidateTag,
      blackPly: scenario.blackPlyLabel,
      selectedMove: null,
      selectedReason: null,
      responseTimeMs: Date.now() - startMs,
      usedFallback: false,
      source: null,
      targetDiagnostics: { hasTarget: false, targetSummary: "—" },
      previewDataUrl: null,
    };
  }

  const responseTimeMs = Date.now() - startMs;
  const classification = classifyQaResponse({
    response,
    responseTimeMs,
    scenario,
    wrongPoint,
    stonesAfterWrong,
    problem,
    boardSize,
    stoneColors,
  });

  const selectedReason = response?.selectedReason ?? null;
  let stonesAfterWhite = stonesAfterWrong;
  let whitePoint = null;
  let whiteApplied = null;
  if (response?.point) {
    whitePoint = response.point;
    whiteApplied = applyWhiteMove(
      stonesAfterWrong,
      response.point,
      boardSize,
      stoneColors,
    );
    if (whiteApplied) {
      stonesAfterWhite = whiteApplied.stones;
    }
  }

  const targetDiagnostics = buildTargetLibertyDiagnostics({
    problem,
    stonesBeforeWhite: stonesAfterWrong,
    stonesAfterWhite,
    whitePoint,
    boardSize,
    stoneColors,
  });

  const quality = evaluateResponseQuality({
    problem,
    response,
    selectedReason,
    targetDiagnostics,
    classification,
    stonesBeforeWhite: stonesAfterWrong,
    stonesAfterWhite,
    whiteApplied,
    boardSize,
    stoneColors,
  });

  logQaCase({
    problem,
    caseInfo,
    wrongLabel,
    response,
    responseTimeMs,
    classification,
    targetDiagnostics,
    quality,
    parityContext,
  });

  const previewDataUrl = buildQaBoardPreviewDataUrl({
    stones: stonesAfterWhite,
    boardSize,
    wrongPoint,
    whitePoint,
  });

  return {
    verdict: quality.verdict,
    qualityScore: quality.score,
    qualityGoal: quality.goal,
    qaProfile: quality.qaProfile,
    positiveFactors: quality.positives,
    positiveLabels: quality.positiveLabels,
    negativeFactors: quality.negatives,
    problemReasons: quality.problemReasons,
    negativeLabels: quality.negativeLabels,
    status: classification.status,
    issues: classification.issues,
    issueLabels: classification.issueLabels,
    candidateMove: wrongLabel,
    candidateTag: caseInfo.candidateTag,
    blackPly: scenario.blackPlyLabel,
    selectedMove:
      response?.move ?? (response?.point ? formatCoordLabel(response.point) : null),
    selectedReason,
    selectedReasonLabel: formatSelectedReasonLabel(selectedReason),
    responseType: response ? formatResponseTypeLabel(response, problem) : "—",
    aiResponseStyleLabel: response
      ? formatAiResponseStyleLabel(response, problem)
      : formatAiResponseStyleLabel({}, problem),
    targetDiagnostics,
    responseTimeMs,
    usedFallback: Boolean(response?.usedLocalFallback),
    source: response?.source ?? null,
    previewDataUrl,
  };
}

function summarizeQaResults(results) {
  const summary = { good: 0, review: 0, problem: 0, total: results.length };
  for (const row of results) {
    if (row.verdict === "good") {
      summary.good += 1;
    } else if (row.verdict === "review") {
      summary.review += 1;
    } else {
      summary.problem += 1;
    }
  }
  return summary;
}

/**
 * @param {object[]} cases
 */
export function buildQaAggregateSummary(cases) {
  const rows = cases ?? [];
  const summary = {
    total: rows.length,
    good: 0,
    review: 0,
    problem: 0,
    fallbackCount: 0,
    selectedReasonCounts: {},
    negativeFactorCounts: {},
    qaProfileCounts: {},
  };

  for (const row of rows) {
    if (row.verdict === "good") {
      summary.good += 1;
    } else if (row.verdict === "review") {
      summary.review += 1;
    } else {
      summary.problem += 1;
    }
    if (row.usedFallback) {
      summary.fallbackCount += 1;
    }
    const reasonKey = row.selectedReason ?? "(none)";
    summary.selectedReasonCounts[reasonKey] =
      (summary.selectedReasonCounts[reasonKey] ?? 0) + 1;
    const profileKey = row.qaProfile ?? row.qualityGoal ?? "(unknown)";
    summary.qaProfileCounts[profileKey] =
      (summary.qaProfileCounts[profileKey] ?? 0) + 1;
    for (const factor of row.negativeFactors ?? []) {
      summary.negativeFactorCounts[factor] =
        (summary.negativeFactorCounts[factor] ?? 0) + 1;
    }
  }

  return summary;
}

/**
 * @param {object} aggregate
 * @param {(value: string) => string} escapeHtml
 */
export function renderQaAggregateSummaryHtml(aggregate, escapeHtml) {
  if (!aggregate) {
    return "";
  }

  const reasonRows = Object.entries(aggregate.selectedReasonCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(
      ([reason, count]) =>
        `<li><code>${escapeHtml(reason)}</code> <strong>${escapeHtml(String(count))}</strong></li>`,
    )
    .join("");

  const reasonBlock = reasonRows
    ? `<ul class="admin-ai-response-qa-reason-stats">${reasonRows}</ul>`
    : `<p class="admin-field-hint">selectedReason 통계 없음</p>`;

  const negativeRows = Object.entries(aggregate.negativeFactorCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(
      ([key, count]) =>
        `<li>${escapeHtml(NEGATIVE_FACTOR_LABELS[key] ?? key)} <strong>${escapeHtml(String(count))}</strong></li>`,
    )
    .join("");

  const negativeBlock = negativeRows
    ? `<ul class="admin-ai-response-qa-reason-stats">${negativeRows}</ul>`
    : "";

  return `
    <section class="admin-ai-response-qa-aggregate" aria-label="QA 요약">
      <p class="admin-ai-response-qa-aggregate-title">결과 요약</p>
      <p class="admin-field-hint admin-ai-response-qa-criteria-hint">
        자동 판정은 <strong>바둑 정답 일치</strong>가 아니라 활로 변화·타깃 근접·reason·fallback 등 휴리스틱입니다.
        정답 수순 백 수와 같으면 오히려 감점(author_sequence_leak)합니다.
      </p>
      <dl class="admin-ai-response-qa-aggregate-grid">
        <div><dt>총 케이스</dt><dd>${escapeHtml(String(aggregate.total))}</dd></div>
        <div><dt>정상</dt><dd class="qa-stat-good">${escapeHtml(String(aggregate.good))}</dd></div>
        <div><dt>검토</dt><dd class="qa-stat-review">${escapeHtml(String(aggregate.review))}</dd></div>
        <div><dt>문제</dt><dd class="qa-stat-problem">${escapeHtml(String(aggregate.problem))}</dd></div>
        <div><dt>fallback</dt><dd>${escapeHtml(String(aggregate.fallbackCount))}</dd></div>
      </dl>
      <details class="admin-ai-response-qa-reason-stats-wrap">
        <summary>selectedReason 통계</summary>
        ${reasonBlock}
      </details>
      ${
        negativeBlock
          ? `<details class="admin-ai-response-qa-reason-stats-wrap">
        <summary>감점 요인 TOP (자동)</summary>
        ${negativeBlock}
      </details>`
          : ""
      }
    </section>
  `;
}

export function countQaCasesForProblem(problem, boardSize, stoneColors) {
  const validation = validateAiResponseQaProblem(problem, boardSize);
  if (!validation.ok) {
    return 0;
  }
  const qaProblem = cloneProblemForQa(problem);
  syncTargetWhiteGroupOnProblem(qaProblem, boardSize);
  return collectQaCases(qaProblem, boardSize, stoneColors).length;
}

/**
 * @param {object} params
 */
export async function runAiResponseQa({
  problem,
  boardSize,
  stoneColors,
  signal = null,
  onCaseProgress = null,
}) {
  throwIfQaAborted(signal);
  const validation = validateAiResponseQaProblem(problem, boardSize);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const qaProblem = cloneProblemForQa(problem);
  syncTargetWhiteGroupOnProblem(qaProblem, boardSize);

  const cases = collectQaCases(qaProblem, boardSize, stoneColors);
  if (cases.length < MIN_WRONG_CANDIDATES) {
    return {
      ok: false,
      error: `오답 후보가 ${cases.length}개뿐입니다. (최소 ${MIN_WRONG_CANDIDATES}개 필요)`,
    };
  }

  const results = [];
  for (let index = 0; index < cases.length; index += 1) {
    throwIfQaAborted(signal);
    const caseInfo = cases[index];
    onCaseProgress?.({
      caseIndex: index + 1,
      caseTotal: cases.length,
      candidateMove: formatCoordLabel(caseInfo.wrongPoint),
      blackPly: caseInfo.scenario?.blackPlyLabel ?? null,
    });
    const row = await runSingleQaCase({
      problem: qaProblem,
      caseInfo,
      boardSize,
      stoneColors,
    });
    row.suspicious = isSuspiciousQaRow(row);
    results.push(row);
  }

  const summary = summarizeQaResults(results);
  const problemId = qaProblem?.id ?? qaProblem?.title ?? "draft";

  const aggregate = buildQaAggregateSummary(results);

  return {
    ok: true,
    problemId,
    results: attachCaseKeys(results, problemId),
    summary,
    aggregate,
    caseCount: cases.length,
    answerMoveCount: validation.answerMoveCount,
  };
}

/**
 * @param {object} report
 * @param {(value: string) => string} escapeHtml
 * @param {{ showMode?: 'all'|'marked', scopeId?: string, manualMarks?: Set<string> }} [options]
 */
export function renderAiResponseQaReportHtml(
  report,
  escapeHtml,
  { showMode = "issues", scopeId = null, manualMarks = null } = {},
) {
  if (!report.ok) {
    return `<p class="admin-ai-response-qa-error">${escapeHtml(report.error ?? "점검 실패")}</p>`;
  }

  const resolvedScopeId = scopeId ?? report.problemId ?? "single";
  const marks = manualMarks ?? getScopeManualMarks(resolvedScopeId);
  const allResults = report.results ?? [];
  const visibleResults = filterCasesForDisplay(allResults, { showMode, manualMarks: marks });
  const markedCount = isQaManualMarkEnabled()
    ? countManualMarksForCases(marks, allResults)
    : 0;
  const aggregateHtml = renderQaAggregateSummaryHtml(
    report.aggregate ?? buildQaAggregateSummary(allResults),
    escapeHtml,
  );

  const rows = visibleResults
    .map((row) =>
      renderQaInspectionCaseCard({
        row,
        caseKey: row.caseKey,
        manualMarked: isCaseManuallyMarked(marks, row.caseKey),
        escapeHtml,
      }),
    )
    .join("");

  const { caseCount, answerMoveCount } = report;
  const emptyMessage =
    visibleResults.length === 0
      ? `<p class="admin-field-hint">${showMode === "marked" ? "수동 표시된 케이스 없음" : "표시할 케이스 없음"} — 전체 ${allResults.length}건</p>`
      : "";

  return `
    <div class="admin-ai-response-qa-panel">
      <div class="admin-ai-response-qa-toolbar">
        <p class="panel-label">AI 응수 미리보기 (${answerMoveCount}수 · ${caseCount}건)</p>
        <label class="admin-ai-response-qa-filter">
          표시:
          <select data-qa-show-mode>
            <option value="issues"${showMode === "issues" ? " selected" : ""}>검토·문제만 (${allResults.filter((row) => row.verdict !== "good").length})</option>
            <option value="all"${showMode === "all" ? " selected" : ""}>전체 (${allResults.length})</option>
            ${
              isQaManualMarkEnabled()
                ? `<option value="marked"${showMode === "marked" ? " selected" : ""}>수동 표시 (${markedCount})</option>`
                : ""
            }
          </select>
        </label>
      </div>
      ${aggregateHtml}
      <p class="admin-ai-response-qa-summary">
        카드 ${visibleResults.length}건 표시 (전체 ${allResults.length}건)
      </p>
      ${emptyMessage}
      <div class="admin-ai-response-qa-inspection-cards">${rows}</div>
      <p class="admin-field-hint">빨간 링=흑 오답 · 파란 링=백 응수 · DB/저장 변경 없음 · 콘솔 <code>${QA_LOG_PREFIX}</code></p>
    </div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {object} report
 * @param {(value: string) => string} escapeHtml
 * @param {{ showMode?: 'all'|'marked', scopeId?: string }} [options]
 */
export function bindAiResponseQaReport(container, report, escapeHtml, options = {}) {
  if (!container || !report?.ok) {
    return;
  }

  const scopeId = options.scopeId ?? report.problemId ?? "single";
  const manualMarks = getScopeManualMarks(scopeId);
  let showMode = options.showMode ?? "issues";

  const rerender = () => {
    showMode = container.__qaShowMode ?? showMode;
    container.innerHTML = renderAiResponseQaReportHtml(report, escapeHtml, {
      showMode,
      scopeId,
      manualMarks,
    });
    bindAiResponseQaReport(container, report, escapeHtml, { showMode, scopeId });
  };

  container.__qaShowMode = showMode;

  bindQaManualMarkEvents(container, {
    manualMarks,
    rerender,
  });

  container.__qaShowMode = showMode;
  container.__qaSingleRerender = rerender;

  if (!container.__qaShowModeBound) {
    container.__qaShowModeBound = true;
    container.addEventListener("change", (event) => {
      const select = event.target.closest("[data-qa-show-mode]");
      if (!select || !container.contains(select)) {
        return;
      }
      const value = select.value;
      container.__qaShowMode =
        value === "all" ? "all" : value === "marked" ? "marked" : "issues";
      container.__qaSingleRerender?.();
    });
  }
}
