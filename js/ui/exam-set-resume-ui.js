export function createExamSetResumeUi({
  modal,
  titleEl,
  bodyEl,
  resumeButton,
  restartButton,
  cancelButton,
}) {
  function openModal() {
    modal?.classList.remove("is-hidden");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal?.classList.add("is-hidden");
    modal?.setAttribute("aria-hidden", "true");
  }

  function show({ examTitle, completedCount, totalCount, onResume, onRestart, onCancel }) {
    if (!modal) {
      onResume?.();
      return;
    }

    if (titleEl) {
      titleEl.textContent = "이전 학습 기록";
    }
    if (bodyEl) {
      const titleLine = examTitle
        ? `<p class="exam-set-resume-exam-name">${escapeInline(examTitle)}</p>`
        : "";
      bodyEl.innerHTML = `
        ${titleLine}
        <p>이전에 학습하던 기록이 있습니다.</p>
        <p class="exam-set-resume-progress-line"><strong>${completedCount} / ${totalCount}</strong> 진행 완료</p>
        <p>어떻게 하시겠습니까?</p>`;
    }

    const handleResume = () => {
      cleanup();
      onResume?.();
    };
    const handleRestart = () => {
      cleanup();
      onRestart?.();
    };
    const handleCancel = () => {
      cleanup();
      onCancel?.();
    };

    const cleanup = () => {
      resumeButton?.removeEventListener("click", handleResume);
      restartButton?.removeEventListener("click", handleRestart);
      cancelButton?.removeEventListener("click", handleCancel);
      modal?.removeEventListener("click", handleBackdrop);
      document.removeEventListener("keydown", handleKeydown);
      closeModal();
    };

    const handleBackdrop = (event) => {
      if (event.target === modal || event.target?.dataset?.examSetResumeBackdrop != null) {
        handleCancel();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        handleCancel();
      }
    };

    resumeButton?.addEventListener("click", handleResume);
    restartButton?.addEventListener("click", handleRestart);
    cancelButton?.addEventListener("click", handleCancel);
    modal?.addEventListener("click", handleBackdrop);
    document.addEventListener("keydown", handleKeydown);
    openModal();
    resumeButton?.focus();
  }

  return { show };
}

function escapeInline(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
