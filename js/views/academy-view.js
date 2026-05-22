const ACADEMY_SECTIONS = {
  students: "students",
  invites: "invites",
  teachers: "teachers",
  accounts: "accounts",
};

import { DEBUG_CHANNELS, debugLog } from "../bootstrap/debug-logs.js";

export function createAcademyView({
  elements,
  appState,
  getCurrentUser,
  canViewLearningMenu,
  canViewAcademyMenu,
  canViewAcademySubmenu,
  canViewAttendanceMenu,
  canViewPaymentsMenu,
  canViewPlatformAdminMenu,
  updatePlatformAdminMenuVisibility,
  showSolveMode,
  showListMode,
  renderInviteCodes,
  renderAcademyStudents,
  renderTeacherManagement,
  renderStudentAccounts,
}) {
  let activeAcademySection = ACADEMY_SECTIONS.students;

  function renderAcademyMenu(menuType) {
    const menuContent = getAcademyMenuContent(menuType);
    elements.meta.textContent = menuContent.eyebrow;
    elements.title.textContent = menuContent.title;
    elements.description.textContent = menuContent.description;
    elements.description.classList.remove("is-hidden");
    elements.learningObjective.textContent = menuContent.description;
    elements.academyMenuEyebrow.textContent = menuContent.eyebrow;
    elements.academyMenuTitle.textContent = menuContent.title;
    elements.academyMenuDescription.textContent = menuContent.description;

    const isAcademyManagement = menuType === "academy";
    const isLearningManagement = menuType === "learning";

    elements.academyManagementSubmenu?.classList.toggle("is-hidden", !isAcademyManagement);

    if (isAcademyManagement) {
      showAcademySection(activeAcademySection);
      return;
    }

    if (isLearningManagement) {
      hideAcademyManagementSections();
      elements.academyStudentsPanel?.classList.remove("is-hidden");
      renderAcademyStudents({ context: "learning" });
      return;
    }

    hideAcademyManagementSections();
  }

  function hideAcademyManagementSections() {
    elements.academySectionPanels?.forEach((panel) => {
      panel.classList.add("is-hidden");
    });
    elements.academyManagementSubmenu
      ?.querySelectorAll(".academy-submenu-button")
      .forEach((button) => {
        button.classList.remove("is-active");
      });
  }

  function showAcademySection(section) {
    if (!Object.values(ACADEMY_SECTIONS).includes(section)) {
      section = ACADEMY_SECTIONS.students;
    }

    if (!canViewAcademySubmenu(section)) {
      const fallbackSection = getDefaultAcademySection();
      if (!canViewAcademySubmenu(fallbackSection)) {
        return;
      }
      section = fallbackSection;
    }

    activeAcademySection = section;
    appState.academySection = section;

    elements.academySubmenuButtons?.forEach((button) => {
      const isActive = button.dataset.academySection === section;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    });

    elements.academySectionPanels?.forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.academySectionPanel !== section);
    });

    switch (section) {
      case ACADEMY_SECTIONS.invites:
        renderInviteCodes();
        break;
      case ACADEMY_SECTIONS.teachers:
        renderTeacherManagement();
        break;
      case ACADEMY_SECTIONS.accounts:
        renderStudentAccounts();
        break;
      case ACADEMY_SECTIONS.students:
      default:
        renderAcademyStudents({ context: "academy" });
        break;
    }
  }

  function showAcademyStudents() {
    showAcademySection(ACADEMY_SECTIONS.students);
  }

  function showInviteCodesSection() {
    showAcademySection(ACADEMY_SECTIONS.invites);
  }

  function showTeacherManagement() {
    showAcademySection(ACADEMY_SECTIONS.teachers);
  }

  function showStudentAccounts() {
    showAcademySection(ACADEMY_SECTIONS.accounts);
  }

  function getDefaultAcademySection() {
    const preferredOrder = [
      ACADEMY_SECTIONS.students,
      ACADEMY_SECTIONS.accounts,
      ACADEMY_SECTIONS.invites,
      ACADEMY_SECTIONS.teachers,
    ];
    return preferredOrder.find((section) => canViewAcademySubmenu(section)) ?? ACADEMY_SECTIONS.students;
  }

  function updateAcademySubmenuVisibility() {
    elements.academySubmenuButtons?.forEach((button) => {
      const section = button.dataset.academySection;
      const canView = canViewAcademySubmenu(section);
      button.classList.toggle("is-hidden", !canView);
      button.disabled = !canView;
      button.setAttribute("aria-hidden", String(!canView));
      button.tabIndex = canView ? 0 : -1;
    });

    if (!canViewAcademySubmenu(activeAcademySection)) {
      showAcademySection(getDefaultAcademySection());
    }
  }

  function updateAcademyMenuVisibility() {
    const user = getCurrentUser?.() ?? null;
    const academyMenuVisible = canViewAcademyMenu();

    debugLog(DEBUG_CHANNELS.ui, "academy menu visibility", {
      role: user?.role ?? null,
      userType: user?.userType ?? user?.role ?? null,
      academyId: user?.academyId ?? null,
      visible: academyMenuVisible,
    });

    setMenuButtonsVisibility(elements.learningMenuButtons, canViewLearningMenu());
    setMenuButtonsVisibility([elements.academyModeButton], academyMenuVisible);
    setMenuButtonsVisibility([elements.attendanceModeButton], canViewAttendanceMenu());
    setMenuButtonsVisibility([elements.paymentsModeButton], canViewPaymentsMenu());
    updatePlatformAdminMenuVisibility?.();
    updateAcademySubmenuVisibility();

    const canStayInMode =
      (appState.mode === "learning" && canViewLearningMenu()) ||
      (appState.mode === "academy" && canViewAcademyMenu()) ||
      (appState.mode === "attendance" && canViewAttendanceMenu()) ||
      (appState.mode === "payments" && canViewPaymentsMenu()) ||
      (appState.mode === "platform" && canViewPlatformAdminMenu());

    if (["learning", "academy", "attendance", "payments", "platform"].includes(appState.mode) && !canStayInMode) {
      if (typeof showListMode === "function") {
        showListMode();
      } else {
        showSolveMode();
      }
    }
  }

  function setMenuButtonsVisibility(buttons, shouldShow) {
    buttons.forEach((button) => {
      if (!button) {
        return;
      }

      button.classList.toggle("is-hidden", !shouldShow);
      button.setAttribute("aria-hidden", String(!shouldShow));
      button.tabIndex = shouldShow ? 0 : -1;
    });
  }

  function getAcademyMenuContent(menuType) {
    const menuContent = {
      learning: {
        eyebrow: "Learning",
        title: "학습관리",
        description: "학생 목록과 오답노트, 풀이 기록을 확인하는 메뉴입니다.",
      },
      academy: {
        eyebrow: "Academy",
        title: "학원관리",
        description: "원생 학습, 초대코드, 선생님·학생 계정을 탭별로 운영합니다.",
      },
      attendance: {
        eyebrow: "Attendance",
        title: "출결관리",
        description: "원생 출석과 결석 내역을 관리하는 학원장 전용 메뉴입니다.",
      },
      payments: {
        eyebrow: "Payments",
        title: "결재확인",
        description: "수강료 결재 상태를 확인하는 학원장 전용 메뉴입니다.",
      },
    };

    return menuContent[menuType] ?? menuContent.learning;
  }

  return {
    renderAcademyMenu,
    updateAcademyMenuVisibility,
    getAcademyMenuContent,
    showAcademySection,
    showAcademyStudents,
    showInviteCodesSection,
    showTeacherManagement,
    showStudentAccounts,
    ACADEMY_SECTIONS,
  };
}
