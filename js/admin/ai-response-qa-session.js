/**
 * AI 응수 QA 실행 세션 — KataGo 대기·중단·수동 표시 디버그
 */

const QA_SESSION_KEY = "__AI_QA_RUN";

export function isQaManualMarkEnabled() {
  return (
    window.BadukConfig?.adminQaDebugManualMark === true ||
    window.BadukConfig?.qaDebugManualMark === true
  );
}

/**
 * @param {{ waitForKatago?: boolean, signal?: AbortSignal|null }} [options]
 */
export function beginQaSession(options = {}) {
  const waitForKatago =
    options.waitForKatago ??
    window.BadukConfig?.qaWaitForKatago ??
    true;

  window[QA_SESSION_KEY] = {
    waitForKatago: Boolean(waitForKatago),
    signal: options.signal ?? null,
    startedAt: Date.now(),
  };

  if (waitForKatago) {
    console.info("[AI_QA] qaWaitForKatago enabled — replace_window race skipped");
  }

  return window[QA_SESSION_KEY];
}

export function endQaSession() {
  delete window[QA_SESSION_KEY];
}

export function getQaSession() {
  return window[QA_SESSION_KEY] ?? null;
}

export function isQaWaitForKatagoActive() {
  const session = getQaSession();
  if (session) {
    return Boolean(session.waitForKatago);
  }
  return window.BadukConfig?.qaWaitForKatago === true;
}

export function getQaAbortSignal() {
  return getQaSession()?.signal ?? null;
}

export function throwIfQaAborted(signal = getQaAbortSignal()) {
  if (signal?.aborted) {
    const error = new Error("QA 실행이 중단되었습니다.");
    error.name = "QaAbortedError";
    error.code = "QA_ABORTED";
    throw error;
  }
}

export function formatQaEta(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) {
    return `약 ${totalSeconds}초`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `약 ${minutes}분 ${seconds}초` : `약 ${minutes}분`;
}
