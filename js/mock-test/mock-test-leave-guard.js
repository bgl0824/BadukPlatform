/** @typedef {import("../state/app-state.js").AppState} AppState */

export const MOCK_TEST_LEAVE_CONFIRM_MESSAGE =
  "모의시험이 진행 중입니다.\n\n새로고침 또는 페이지를 이동하면\n현재 응시 내용이 사라집니다.\n\n계속하시겠습니까?";

let mockSessionActive = false;
let beforeUnloadBound = false;

function isMockExamInProgress(appState) {
  return (
    mockSessionActive &&
    appState?.examSession?.sessionMode === "mock"
  );
}

function handleBeforeUnload(event) {
  if (!mockSessionActive) {
    return;
  }
  event.preventDefault();
  event.returnValue = MOCK_TEST_LEAVE_CONFIRM_MESSAGE;
  return MOCK_TEST_LEAVE_CONFIRM_MESSAGE;
}

function ensureBeforeUnloadListener() {
  if (beforeUnloadBound) {
    return;
  }
  window.addEventListener("beforeunload", handleBeforeUnload);
  beforeUnloadBound = true;
}

export function activateMockTestLeaveGuard() {
  mockSessionActive = true;
  ensureBeforeUnloadListener();
}

export function deactivateMockTestLeaveGuard() {
  mockSessionActive = false;
}

export function isMockTestLeaveGuardActive() {
  return mockSessionActive;
}

/**
 * 앱 내 화면 전환(메뉴·문제은행 등) 전 확인.
 * @param {AppState} appState
 * @param {() => void} [onAbandon] 시험 세션 정리(clearExamSession 등)
 */
export function confirmMockTestLeaveInApp(appState, onAbandon) {
  if (!isMockExamInProgress(appState)) {
    return true;
  }

  const proceed = window.confirm(MOCK_TEST_LEAVE_CONFIRM_MESSAGE);
  if (!proceed) {
    return false;
  }

  deactivateMockTestLeaveGuard();
  onAbandon?.();
  return true;
}

export const mockTestLeaveGuard = {
  activate: activateMockTestLeaveGuard,
  deactivate: deactivateMockTestLeaveGuard,
  isActive: isMockTestLeaveGuardActive,
  confirmLeaveInApp: confirmMockTestLeaveInApp,
};
