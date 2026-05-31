/**
 * AI 응수 / 학습 복원 디버그 로그 (간헐 오류 추적용)
 */

import { formatCoordLabel } from "./answer-sequence.js";
import { computeAllowedRegion } from "./problem-region.js";

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function logKatagoRespondFailure(label, details = {}) {
  console.warn(`[KatagoRespond] ${label}`, {
    ...details,
    payload: details.payload ? safeJson(details.payload) : undefined,
    responseBody: details.responseBody ? safeJson(details.responseBody) : undefined,
  });
}

export function logKatagoRespondSuccess(label, details = {}) {
  console.log(`[KatagoRespond] ${label}`, details);
}

function getParityRegionMargin() {
  const configured = Number(window.BadukConfig?.katagoRespondRegionMargin);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return 2;
}

/**
 * 오답 응수 요청 컨텍스트 — QA·실제 풀이 동일 포맷 로그
 * @param {string} channel
 * @param {object} params
 */
export function logWrongRevealRequestContext(channel, params) {
  const {
    problem,
    boardSize,
    stones = [],
    playedMoves = [],
    initialStones = [],
    lastBlackMove,
    currentPly,
    stoneColors,
    blackAnswerIndex = null,
    stonesBeforeCount = null,
    stonesAfterCount = null,
    currentPlyBeforeBlack = null,
  } = params;

  const allowedRegion = computeAllowedRegion({
    boardSize,
    stones,
    initialStones,
    lastMove: lastBlackMove,
    margin: getParityRegionMargin(),
  });

  const blackMoves = playedMoves.filter((move) => move.color === stoneColors?.black);
  const inferredBlackAnswerIndex =
    blackAnswerIndex ?? Math.max(0, blackMoves.length - 1);

  console.info(`[AI_RESPONSE_PARITY] ${channel}`, {
    problemId: problem?.id ?? null,
    stonesCount: stones.length,
    stonesBeforeCount,
    stonesAfterCount,
    initialStonesCount: initialStones.length,
    playedMovesCount: playedMoves.length,
    lastBlackMove: lastBlackMove
      ? `${lastBlackMove.color}:${formatCoordLabel(lastBlackMove)}`
      : null,
    currentPlyBeforeBlack,
    currentPly,
    blackAnswerIndex: inferredBlackAnswerIndex,
    allowedRegion,
    studentMoveResult: "wrong",
    recentMoves: playedMoves.slice(-6).map((move) => `${move.color}:${formatCoordLabel(move)}`),
  });
}

export function logAiResponseSessionSnapshot(appState, label, extra = {}) {
  const session = appState?.aiResponseSolveSession;
  console.info(`[AI_RESPONSE] session snapshot — ${label}`, {
    phase: session?.phase ?? null,
    currentPly: session?.currentPly ?? null,
    blackAnswerIndex: session?.blackAnswerIndex ?? null,
    answerMoveCount: session?.answerMoveCount ?? null,
    playedMovesCount: session?.playedMoves?.length ?? 0,
    isAiThinking: appState?.isAiThinking ?? false,
    isSolved: appState?.isSolved ?? false,
    currentProblemIndex: appState?.currentProblemIndex ?? null,
    currentProblemId: appState?.currentProblemId ?? null,
    ...extra,
  });
}

export function logLearningFlow(label, details = {}) {
  console.info(`[LearningFlow] ${label}`, details);
}

/**
 * @param {{
 *   studyPath: object|null,
 *   problem: object|null,
 *   progressByProblemId: Map<string, object>|null,
 *   appState: object,
 *   nextProblem?: object|null,
 *   remainingProblemIds?: string[],
 *   isActuallyLastProblem?: boolean,
 * }} params
 */
export function logStudyPathDiagnostics({
  studyPath,
  problem,
  appState,
  nextProblem = null,
  remainingProblemIds = [],
  isActuallyLastProblem = false,
}) {
  const currentProblemId = problem?.id ?? appState?.currentProblemId ?? null;
  const studyPathProblemIds = studyPath?.problemIds ?? [];
  let currentIndexInStudyPath = studyPathProblemIds.indexOf(currentProblemId);
  if (currentIndexInStudyPath === -1 && appState?.currentProblemId) {
    currentIndexInStudyPath = studyPathProblemIds.indexOf(appState.currentProblemId);
  }

  logLearningFlow("studyPathProblemIds", { studyPathProblemIds });
  logLearningFlow("currentProblemId", { currentProblemId });
  logLearningFlow("currentIndexInStudyPath", { currentIndexInStudyPath });
  logLearningFlow("nextProblemId", {
    nextProblemId: nextProblem?.problem?.id ?? null,
  });
  logLearningFlow("remainingProblemIds", { remainingProblemIds });
  logLearningFlow("isActuallyLastProblem", { isActuallyLastProblem });
}
