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
  isMoveAdjacentToTargetGroup,
  isMoveOnTargetAtariLiberty,
  getTargetLibertyPoints,
  resolveTargetWhiteGroup,
  syncTargetWhiteGroupOnProblem,
} from "../solve/ai-response-solve/target-white-group.js";
import { TACTICAL_FALLBACK_SOURCE } from "../solve/ai-response-solve/wrong-response-fallback.js";

const QA_ANSWER_MOVE_COUNTS = [3, 5, 7];
const MIN_WRONG_CANDIDATES = 5;
const MAX_WRONG_CANDIDATES = 15;
const QA_LOG_PREFIX = "[AI_QA]";

const REVIEW_ISSUE_LABELS = {
  no_response: "AI 응수 없음",
  api_disabled: "API 비활성",
  timeout: "응답 시간 초과",
  far_from_target: "target group과 거리 멂",
  out_of_region: "문제 영역 밖",
  used_fallback: "fallback 사용",
  author_white_match: "정답 수순 백 수와 동일",
};

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
  const base = Number.isFinite(replaceMs) && replaceMs > 0 ? replaceMs : 700;
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

function logQaCase({
  problem,
  caseInfo,
  wrongLabel,
  response,
  responseTimeMs,
  classification,
}) {
  console.log(QA_LOG_PREFIX, {
    problemId: problem?.id ?? null,
    blackPly: caseInfo.scenario.blackPlyLabel,
    candidateMove: wrongLabel,
    candidateTag: caseInfo.candidateTag,
    selectedMove: response?.move ?? (response?.point ? formatCoordLabel(response.point) : null),
    selectedReason: response?.selectedReason ?? null,
    source: response?.source ?? null,
    responseTimeMs,
    usedFallback: Boolean(response?.usedLocalFallback),
    status: classification.status,
    issues: classification.issues,
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
      status: "fail",
      issues: ["illegal_wrong_black"],
      issueLabels: ["흑 오답 불법"],
      candidateMove: wrongLabel,
      candidateTag: caseInfo.candidateTag,
      blackPly: scenario.blackPlyLabel,
      selectedMove: null,
      selectedReason: null,
      responseTimeMs: Date.now() - startMs,
      usedFallback: false,
      source: null,
    };
  }

  const stonesAfterWrong = applied.stones;
  const playedMoves = [
    ...scenario.playedMoves,
    { x: wrongPoint.x, y: wrongPoint.y, color: stoneColors.black },
  ];

  let response = null;
  try {
    response = await resolveWhiteResponse({
      problem,
      boardSize,
      stones: stonesAfterWrong,
      playedMoves,
      initialStones: problem?.stones ?? [],
      lastBlackMove: { x: wrongPoint.x, y: wrongPoint.y, color: stoneColors.black },
      stoneColors,
      studentMoveResult: "wrong",
      currentPly: scenario.currentPly,
    });
  } catch (error) {
    return {
      status: "fail",
      issues: ["exception"],
      issueLabels: [String(error?.message ?? "exception")],
      candidateMove: wrongLabel,
      candidateTag: caseInfo.candidateTag,
      blackPly: scenario.blackPlyLabel,
      selectedMove: null,
      selectedReason: null,
      responseTimeMs: Date.now() - startMs,
      usedFallback: false,
      source: null,
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

  logQaCase({
    problem,
    caseInfo,
    wrongLabel,
    response,
    responseTimeMs,
    classification,
  });

  return {
    ...classification,
    candidateMove: wrongLabel,
    candidateTag: caseInfo.candidateTag,
    blackPly: scenario.blackPlyLabel,
    selectedMove:
      response?.move ?? (response?.point ? formatCoordLabel(response.point) : null),
    selectedReason: response?.selectedReason ?? null,
    responseTimeMs,
    usedFallback: Boolean(response?.usedLocalFallback),
    source: response?.source ?? null,
  };
}

function summarizeQaResults(results) {
  const summary = { normal: 0, review: 0, fail: 0, total: results.length };
  for (const row of results) {
    if (row.status === "normal") {
      summary.normal += 1;
    } else if (row.status === "review") {
      summary.review += 1;
    } else {
      summary.fail += 1;
    }
  }
  return summary;
}

/**
 * @param {object} params
 */
export async function runAiResponseQa({ problem, boardSize, stoneColors }) {
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
  for (const caseInfo of cases) {
    results.push(
      await runSingleQaCase({
        problem: qaProblem,
        caseInfo,
        boardSize,
        stoneColors,
      }),
    );
  }

  return {
    ok: true,
    results,
    summary: summarizeQaResults(results),
    caseCount: cases.length,
    answerMoveCount: validation.answerMoveCount,
  };
}

/**
 * @param {object} report
 * @param {(value: string) => string} escapeHtml
 */
export function renderAiResponseQaReportHtml(report, escapeHtml) {
  if (!report.ok) {
    return `<p class="admin-ai-response-qa-error">${escapeHtml(report.error ?? "점검 실패")}</p>`;
  }

  const rows = report.results
    .map((row) => {
      const statusClass = `qa-status-${row.status}`;
      const statusLabel =
        row.status === "normal"
          ? "정상"
          : row.status === "review"
            ? "확인 필요"
            : "실패";
      const detail =
        row.status === "normal"
          ? "정상"
          : row.issueLabels?.join(", ") || statusLabel;
      const selected = row.selectedMove ?? "—";
      return `<tr class="${statusClass}">
        <td>${escapeHtml(String(row.blackPly))}흑</td>
        <td>${escapeHtml(row.candidateMove)}</td>
        <td>${escapeHtml(selected)}</td>
        <td>${escapeHtml(detail)}</td>
        <td>${escapeHtml(String(row.responseTimeMs ?? "—"))}ms</td>
      </tr>`;
    })
    .join("");

  const { summary, caseCount, answerMoveCount } = report;

  return `
    <div class="admin-ai-response-qa-panel">
      <p class="panel-label">오답 후보 AI 응수 결과 (${answerMoveCount}수 · ${caseCount}건)</p>
      <table class="admin-ai-response-qa-table">
        <thead>
          <tr>
            <th>흑 착</th>
            <th>오답 후보</th>
            <th>AI 응수</th>
            <th>판정</th>
            <th>응답</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="admin-ai-response-qa-summary">
        요약: 정상 ${summary.normal} · 확인 필요 ${summary.review} · 실패 ${summary.fail}
      </p>
      <p class="admin-field-hint">DB/저장 변경 없음 · 콘솔 <code>${QA_LOG_PREFIX}</code> 로그 참고</p>
    </div>
  `;
}
