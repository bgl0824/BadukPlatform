export function createAdminView({

  elements,

  adminState,

  appState,

  isCurrentUserAdmin,

  renderCategoryManager,

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



    elements.adminWorkspace?.classList.toggle("is-hidden", !isAdminList);

    elements.adminProblemsPanel?.classList.toggle("is-hidden", !isAdminList || !isProblemsPanel);

    elements.adminCurriculumPanel?.classList.toggle("is-hidden", !isAdminList || !isCurriculumPanel);

    elements.adminProblemsToolbar?.classList.toggle("is-hidden", !isAdminList || !isProblemsPanel);

    elements.categoryFilters?.classList.toggle("is-hidden", isAdminList && isCurriculumPanel);

    elements.levelGroupFilters?.classList.toggle("is-hidden", isAdminList && isCurriculumPanel);

    elements.problemCards?.classList.toggle("is-hidden", isAdminList && isCurriculumPanel);



    elements.adminProblemsTab?.classList.toggle("is-active", isProblemsPanel);

    elements.adminCurriculumTab?.classList.toggle("is-active", isCurriculumPanel);

    elements.adminProblemsTab?.setAttribute("aria-selected", String(isProblemsPanel));

    elements.adminCurriculumTab?.setAttribute("aria-selected", String(isCurriculumPanel));



    if (isAdminList && isCurriculumPanel) {

      renderCategoryManager?.();

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


