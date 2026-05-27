/**
 * AI 응수 / 학습 복원 디버그 로그 (간헐 오류 추적용)
 */

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
