export function createAcademyController({
  elements,
  appState,
  canAccessAcademyMenu,
  setFeedback,
  setMode,
  clearPendingAiMove,
  academyView,
  closeAdminEditor,
}) {
  function showAcademyMenu(menuType) {
    if (!canAccessAcademyMenu(menuType)) {
      setFeedback("현재 계정으로 접근할 수 없는 메뉴입니다.", "wrong");
      return;
    }

    clearPendingAiMove();
    appState.isAiThinking = false;
    appState.isSolved = false;
    appState.playedMoves = [];
    setMode(menuType);
    academyView.renderAcademyMenu(menuType);
    closeAdminEditor();
  }

  function updateAcademyMenuVisibility() {
    academyView.updateAcademyMenuVisibility();
  }

  function bindAcademyEvents() {
    elements.learningModeButton?.addEventListener("click", () => showAcademyMenu("learning"));
    elements.academyModeButton?.addEventListener("click", () => showAcademyMenu("academy"));
    elements.attendanceModeButton?.addEventListener("click", () => showAcademyMenu("attendance"));
    elements.paymentsModeButton?.addEventListener("click", () => showAcademyMenu("payments"));

    elements.academyManagementSubmenu?.addEventListener("click", (event) => {
      const sectionButton = event.target.closest("[data-academy-section]");
      if (!sectionButton || appState.mode !== "academy") {
        return;
      }

      academyView.showAcademySection(sectionButton.dataset.academySection);
    });

    elements.academyMenuScreen?.addEventListener("click", (event) => {
      const sectionLink = event.target.closest("[data-academy-section-link]");
      if (!sectionLink || appState.mode !== "academy") {
        return;
      }

      academyView.showAcademySection(sectionLink.dataset.academySectionLink);
    });
  }

  return {
    showAcademyMenu,
    updateAcademyMenuVisibility,
    bindAcademyEvents,
    showAcademyStudents: () => academyView.showAcademyStudents(),
    showInviteCodes: () => academyView.showInviteCodesSection(),
    showTeacherManagement: () => academyView.showTeacherManagement(),
    showStudentAccounts: () => academyView.showStudentAccounts(),
  };
}
