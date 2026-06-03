import { MOCK_TEST_TIME_LIMIT_MS } from "../constants/mock-test-constants.js";

export function computeMockTestTiming(elapsedMs, limitMs = MOCK_TEST_TIME_LIMIT_MS) {
  const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
  const durationSeconds = Math.max(0, Math.round(safeElapsed / 1000));
  const overtimeSeconds = Math.max(0, Math.round((safeElapsed - limitMs) / 1000));
  return { durationSeconds, overtimeSeconds, elapsedMs: safeElapsed };
}

/** @returns {{ text: string, overtime: boolean, label: string }} */
export function formatMockTimerDisplay(elapsedMs, limitMs = MOCK_TEST_TIME_LIMIT_MS) {
  const remainingMs = limitMs - Math.max(0, Number(elapsedMs) || 0);

  if (remainingMs > 0) {
    return {
      text: formatClockMmSs(Math.floor(remainingMs / 1000)),
      overtime: false,
      label: "남은 시간",
    };
  }

  if (remainingMs === 0) {
    return { text: "00:00", overtime: false, label: "남은 시간" };
  }

  const overtimeSec = Math.max(1, Math.ceil(-remainingMs / 1000));
  return {
    text: `-${formatClockMmSs(overtimeSec)}`,
    overtime: true,
    label: "남은 시간",
  };
}

export function formatDurationKorean(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) {
    return `${remainder}초`;
  }
  if (remainder <= 0) {
    return `${minutes}분`;
  }
  return `${minutes}분 ${remainder}초`;
}

function formatClockMmSs(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
