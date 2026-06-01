/**
 * AI 응수 QA 실행 세션 — KataGo 대기·중단·수동 표시 디버그
 */

const QA_SESSION_KEY = "__AI_QA_RUN";

/** @typedef {"fast"|"precise"} QaRunMode */

export const QA_RUN_MODES = {
  fast: {
    id: "fast",
    label: "빠른 QA",
    waitForKatago: false,
    description: "replace_window 허용 · fallback 가능 · 속도 우선",
  },
  precise: {
    id: "precise",
    label: "정밀 QA",
    waitForKatago: true,
    description: "KataGo 응답 완료까지 대기 · 엔진 선택 품질 검증",
  },
};

/**
 * @param {string} [mode]
 * @returns {{ id: QaRunMode, label: string, waitForKatago: boolean, description: string }}
 */
export function resolveQaRunMode(mode) {
  const key = mode === "fast" ? "fast" : "precise";
  return QA_RUN_MODES[key];
}

export function isQaManualMarkEnabled() {
  return (
    window.BadukConfig?.adminQaDebugManualMark === true ||
    window.BadukConfig?.qaDebugManualMark === true
  );
}

/**
 * @param {{ waitForKatago?: boolean, qaMode?: QaRunMode, signal?: AbortSignal|null }} [options]
 */
export function beginQaSession(options = {}) {
  const runMode = resolveQaRunMode(
    options.qaMode ??
      (options.waitForKatago === false
        ? "fast"
        : options.waitForKatago === true
          ? "precise"
          : window.BadukConfig?.qaDefaultMode === "fast"
            ? "fast"
            : "precise"),
  );
  const waitForKatago =
    options.waitForKatago ?? runMode.waitForKatago ?? window.BadukConfig?.qaWaitForKatago ?? true;

  window[QA_SESSION_KEY] = {
    waitForKatago: Boolean(waitForKatago),
    qaMode: runMode.id,
    signal: options.signal ?? null,
    startedAt: Date.now(),
  };

  console.info("[AI_QA] session", {
    qaMode: runMode.id,
    qaWaitForKatago: Boolean(waitForKatago),
  });

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
