export function createPlatformAdminController({
  elements,
  appState,
  setMode,
  getCurrentUser,
  canViewPlatformAdminMenu,
  setFeedback,
  platformAdminView,
  updateAcademyMenuVisibility,
}) {
  function showPlatformAdminMenu() {
    if (!canViewPlatformAdminMenu(getCurrentUser())) {
      setFeedback("플랫폼 운영 메뉴는 관리자 계정만 사용할 수 있습니다.", "wrong");
      return;
    }

    setMode("platform");
    platformAdminView.renderPlatformAdminMenu();
    updateAcademyMenuVisibility?.();
  }

  function bindPlatformAdminEvents() {
    elements.platformModeButton?.addEventListener("click", showPlatformAdminMenu);
  }

  function updatePlatformAdminMenuVisibility() {
    const visible = canViewPlatformAdminMenu(getCurrentUser());
    const button = elements.platformModeButton;

    if (button) {
      button.classList.toggle("is-hidden", !visible);
      button.setAttribute("aria-hidden", String(!visible));
      button.tabIndex = visible ? 0 : -1;
    }

    if (!visible && appState.mode === "platform") {
      updateAcademyMenuVisibility?.();
    }
  }

  return {
    showPlatformAdminMenu,
    bindPlatformAdminEvents,
    updatePlatformAdminMenuVisibility,
  };
}
