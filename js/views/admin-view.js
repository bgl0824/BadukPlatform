export function createAdminView({
  elements,
  adminState,
  appState,
  isCurrentUserAdmin,
  renderCategoryManager,
  renderGradeAssignmentPanel,
  renderExamSetManager,
}) {
  function renderAdminModeToggle() {
    elements.adminModeToggle.classList.toggle("is-hidden", !isCurrentUserAdmin());
    elements.adminModeToggle.classList.toggle("is-active", adminState.isEnabled);
    elements.adminModeToggle.setAttribute("aria-pressed", String(adminState.isEnabled));
  }

  function updateAdminVisibility() {
    renderAdminModeToggle();

    const isAdminList = adminState.isEnabled && appState.mode === "list" && isCurrentUserAdmin();
    const isProblemsPanel = adminState.listPanel === "problems";
    const isCurriculumPanel = adminState.listPanel === "curriculum";
    const isGradesPanel = adminState.listPanel === "grades";
    const isExamSetsPanel = adminState.listPanel === "exam-sets";

    elements.adminWorkspace?.classList.toggle("is-hidden", !isAdminList);
    elements.adminProblemsPanel?.classList.toggle("is-hidden", !isAdminList || !isProblemsPanel);
    elements.adminCurriculumPanel?.classList.toggle("is-hidden", !isAdminList || !isCurriculumPanel);
    elements.adminGradesPanel?.classList.toggle("is-hidden", !isAdminList || !isGradesPanel);
    elements.adminExamSetsPanel?.classList.toggle("is-hidden", !isAdminList || !isExamSetsPanel);
    elements.adminProblemsToolbar?.classList.toggle("is-hidden", !isAdminList || !isProblemsPanel);

    elements.adminProblemsTab?.classList.toggle("is-active", isProblemsPanel);
    elements.adminCurriculumTab?.classList.toggle("is-active", isCurriculumPanel);
    elements.adminGradesTab?.classList.toggle("is-active", isGradesPanel);
    elements.adminExamSetsTab?.classList.toggle("is-active", isExamSetsPanel);
    elements.adminProblemsTab?.setAttribute("aria-selected", String(isProblemsPanel));
    elements.adminCurriculumTab?.setAttribute("aria-selected", String(isCurriculumPanel));
    elements.adminGradesTab?.setAttribute("aria-selected", String(isGradesPanel));
    elements.adminExamSetsTab?.setAttribute("aria-selected", String(isExamSetsPanel));

    if (isAdminList && isCurriculumPanel) {
      renderCategoryManager?.();
    }

    if (isAdminList && isGradesPanel) {
      renderGradeAssignmentPanel?.();
    }

    if (isAdminList && isExamSetsPanel) {
      renderExamSetManager?.();
    }

    if (!adminState.draft) {
      elements.adminEditor.classList.add("is-hidden");
    }
  }

  function renderProblemCount(count) {
    void count;
  }

  return {
    renderAdminModeToggle,
    updateAdminVisibility,
    renderProblemCount,
  };
}
