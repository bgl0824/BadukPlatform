import { isAiResponseUxEnabled } from "../solve/ai-response-ux/config.js";
import { isKatagoRespondApiEnabled } from "../solve/ai-response-solve/katago-respond-client.js";

export const PROBLEM_MODE = {
  normal: "normal",
  aiResponse: "ai_response",
  /** @deprecated 스팟 UX 프로토타입 */
  aiResponseTest: "ai_response_test",
};

function getProblemMode(problem) {
  return String(problem?.problemMode ?? problem?.problem_mode ?? "").trim();
}

/**
 * AI 응수형 문제 (흑만 / KataGo 백).
 */
export function isAiResponseProblem(problem) {
  if (!problem) {
    return false;
  }

  if (getProblemMode(problem) === PROBLEM_MODE.aiResponse) {
    return true;
  }

  const configuredIds = getConfiguredAiResponseProblemIds();
  return configuredIds.length > 0 && configuredIds.includes(String(problem.id ?? ""));
}

/** @deprecated 스팟 프로토타입 */
export function isAiResponseTestProblem(problem) {
  if (!problem) {
    return false;
  }

  if (getProblemMode(problem) === PROBLEM_MODE.aiResponseTest) {
    return true;
  }

  const configuredIds = getConfiguredAiResponseTestProblemIds();
  return configuredIds.length > 0 && configuredIds.includes(String(problem.id ?? ""));
}

function getConfiguredAiResponseProblemIds() {
  const fromRuntime =
    window.BadukRuntimeConfig?.aiResponseProblemIds ??
    window.BadukConfig?.aiResponseProblemIds;
  if (Array.isArray(fromRuntime)) {
    return fromRuntime.map((id) => String(id).trim()).filter(Boolean);
  }
  return [];
}

function getConfiguredAiResponseTestProblemIds() {
  const fromRuntime =
    window.BadukRuntimeConfig?.aiResponseTestProblemIds ??
    window.BadukConfig?.aiResponseTestProblemIds;
  if (Array.isArray(fromRuntime)) {
    return fromRuntime.map((id) => String(id).trim()).filter(Boolean);
  }

  const fromStorage = window.localStorage?.getItem("BADUK_AI_RESPONSE_TEST_PROBLEM_IDS");
  if (!fromStorage) {
    return [];
  }

  return fromStorage
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAiResponseSolveFeatureEnabled() {
  const flag = window.BadukConfig?.aiResponseSolveEnabled;
  if (flag === false) {
    return false;
  }
  return true;
}

/**
 * AI 응수형 전용 엔진 분기 (KataGo API ON/OFF와 무관 — OFF 시 mock 백 응수).
 */
export function shouldUseAiResponseSolve(problem) {
  const enabled = isAiResponseSolveFeatureEnabled();
  const isAi = isAiResponseProblem(problem);
  const use = enabled && isAi;

  if (isAi || getProblemMode(problem) === PROBLEM_MODE.aiResponse) {
    console.log("[AI_RESPONSE] shouldUseAiResponseSolve", {
      use,
      problemId: problem?.id,
      problemMode: getProblemMode(problem),
      aiResponseSolveEnabled: enabled,
      katagoRespondApiEnabled: isKatagoRespondApiEnabled(),
      isAiResponseProblem: isAi,
    });
  }

  return use;
}

export function logAiResponseSolveContext(problem, context) {
  console.log("[AI_RESPONSE]", context, {
    problemId: problem?.id,
    problemMode: problem?.problemMode ?? problem?.problem_mode,
    answerMoveCount: problem?.answerMoveCount ?? problem?.answer_move_count,
    blackAnswerSequence: problem?.blackAnswerSequence ?? problem?.black_answer_sequence,
    aiResponseSolveEnabled: isAiResponseSolveFeatureEnabled(),
    katagoRespondApiEnabled: isKatagoRespondApiEnabled(),
  });
}

/** UX 프로토타입 (스팟) — 기본 OFF */
export function shouldUseAiResponseUx(problem) {
  return isAiResponseUxEnabled() && isAiResponseTestProblem(problem);
}
