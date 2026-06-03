import {
  MOCK_TEST_TIME_LIMIT_MINUTES,
  MOCK_TEST_TIME_LIMIT_MS,
} from "../constants/mock-test-constants.js";
import { formatDurationKorean, formatMockTimerDisplay } from "../utils/mock-test-time.js";

export function createMockTestUi({
  startModal,
  startTitle,
  startBody,
  startCancelButton,
  startConfirmButton,
  resultModal,
  resultTitle,
  resultSubtitle,
  resultScore,
  resultWrong,
  resultDuration,
  resultOvertime,
  resultViewButton,
  resultCloseButton,
  timerRoot,
  timerLabel,
  timerValue,
}) {
  let timerIntervalId = null;
  let timerStartedAt = null;
  let onTimerTick = null;

  function openModal(modal) {
    modal?.classList.remove("is-hidden");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    modal?.classList.add("is-hidden");
    modal?.setAttribute("aria-hidden", "true");
  }

  function showStartConfirm({ examTitle, questionCount, onConfirm, onCancel }) {
    if (!startModal) {
      onConfirm?.();
      return;
    }

    if (startTitle) {
      startTitle.textContent = "모의시험 안내";
    }
    if (startBody) {
      const count = Number(questionCount) || 0;
      const titleLine = examTitle
        ? `<p class="mock-test-start-exam-name">${escapeInline(examTitle)}</p>`
        : "";
      startBody.innerHTML = `
        ${titleLine}
        <p>시험시간은 <strong>${MOCK_TEST_TIME_LIMIT_MINUTES}분</strong>입니다.</p>
        <p>시험이 시작되면 <strong>${count}문항</strong>을 순서대로 풀게 됩니다.</p>
        <p>시작하시겠습니까?</p>`;
    }

    const handleCancel = () => {
      cleanup();
      onCancel?.();
    };
    const handleConfirm = () => {
      cleanup();
      onConfirm?.();
    };

    const cleanup = () => {
      startCancelButton?.removeEventListener("click", handleCancel);
      startConfirmButton?.removeEventListener("click", handleConfirm);
      startModal?.removeEventListener("click", handleBackdrop);
      document.removeEventListener("keydown", handleKeydown);
      closeModal(startModal);
    };

    const handleBackdrop = (event) => {
      if (event.target === startModal || event.target?.dataset?.mockTestStartBackdrop != null) {
        handleCancel();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        handleCancel();
      }
    };

    startCancelButton?.addEventListener("click", handleCancel);
    startConfirmButton?.addEventListener("click", handleConfirm);
    startModal?.addEventListener("click", handleBackdrop);
    document.addEventListener("keydown", handleKeydown);
    openModal(startModal);
    startConfirmButton?.focus();
  }

  function showResultModal({
    examTitle,
    correctCount,
    totalQuestionCount,
    accuracyRate,
    wrongProblemNumbers = [],
    durationSeconds = 0,
    overtimeSeconds = 0,
    onViewResults,
    onClose,
  }) {
    if (!resultModal) {
      onClose?.();
      return;
    }

    if (resultTitle) {
      resultTitle.textContent = "고생하셨습니다!";
    }
    if (resultSubtitle) {
      resultSubtitle.textContent = examTitle ? `${examTitle} 결과` : "모의시험 결과";
    }
    if (resultScore) {
      const accuracy =
        Number.isFinite(accuracyRate) && accuracyRate >= 0
          ? accuracyRate
          : totalQuestionCount > 0
            ? Math.round((correctCount / totalQuestionCount) * 100)
            : 0;
      resultScore.innerHTML = `
        <p class="mock-test-result-modal-score">${correctCount} / ${totalQuestionCount}</p>
        <p class="mock-test-result-modal-accuracy">정답률 ${accuracy}%</p>`;
    }
    if (resultWrong) {
      const wrong = Array.isArray(wrongProblemNumbers) ? wrongProblemNumbers : [];
      resultWrong.textContent =
        wrong.length > 0 ? `틀린 문제\n${wrong.join(", ")}번` : "틀린 문제 없음";
    }
    if (resultDuration) {
      resultDuration.textContent = `소요시간\n${formatDurationKorean(durationSeconds)}`;
    }
    if (resultOvertime) {
      if (overtimeSeconds > 0) {
        resultOvertime.textContent = `제한시간 초과\n${formatDurationKorean(overtimeSeconds)}`;
        resultOvertime.classList.remove("is-hidden");
      } else {
        resultOvertime.textContent = "";
        resultOvertime.classList.add("is-hidden");
      }
    }

    const handleView = () => {
      cleanup();
      onViewResults?.();
    };
    const handleClose = () => {
      cleanup();
      onClose?.();
    };

    const cleanup = () => {
      resultViewButton?.removeEventListener("click", handleView);
      resultCloseButton?.removeEventListener("click", handleClose);
      resultModal?.removeEventListener("click", handleBackdrop);
      document.removeEventListener("keydown", handleKeydown);
      closeModal(resultModal);
    };

    const handleBackdrop = (event) => {
      if (event.target === resultModal || event.target?.dataset?.mockTestResultBackdrop != null) {
        handleClose();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    resultViewButton?.addEventListener("click", handleView);
    resultCloseButton?.addEventListener("click", handleClose);
    resultModal?.addEventListener("click", handleBackdrop);
    document.addEventListener("keydown", handleKeydown);
    openModal(resultModal);
    resultViewButton?.focus();
  }

  function startTimer({ startedAt = Date.now(), tick } = {}) {
    stopTimer();
    timerStartedAt = startedAt;
    onTimerTick = tick;
    timerRoot?.classList.remove("is-hidden");
    updateTimerDisplay();
    timerIntervalId = window.setInterval(updateTimerDisplay, 250);
  }

  function stopTimer() {
    if (timerIntervalId) {
      window.clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    timerRoot?.classList.add("is-hidden");
    timerRoot?.classList.remove("is-overtime");
    timerStartedAt = null;
    onTimerTick = null;
    if (timerValue) {
      timerValue.textContent = "20:00";
    }
  }

  function getTimerStartedAt() {
    return timerStartedAt;
  }

  function updateTimerDisplay() {
    if (!timerStartedAt) {
      return;
    }
    const elapsedMs = Date.now() - timerStartedAt;
    const { text, overtime, label } = formatMockTimerDisplay(elapsedMs, MOCK_TEST_TIME_LIMIT_MS);
    if (timerLabel) {
      timerLabel.textContent = label;
    }
    if (timerValue) {
      timerValue.textContent = text;
    }
    timerRoot?.classList.toggle("is-overtime", overtime);
    onTimerTick?.({ elapsedMs, overtime, display: text });
  }

  return {
    showStartConfirm,
    showResultModal,
    startTimer,
    stopTimer,
    getTimerStartedAt,
  };
}

function escapeInline(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatMockAttemptTimingLines(attempt) {
  const durationSeconds = Number(attempt?.durationSeconds ?? 0);
  const overtimeSeconds = Number(attempt?.overtimeSeconds ?? 0);
  const durationLine = `소요시간 ${formatDurationKorean(durationSeconds)}`;
  const overtimeLine =
    overtimeSeconds > 0 ? `제한시간 초과 ${formatDurationKorean(overtimeSeconds)}` : "";
  return { durationLine, overtimeLine, durationSeconds, overtimeSeconds };
}
