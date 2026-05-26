import {
  activateStudentMember,
  activateTeacherMember,
  assignStudentTeacher,
  countStudentsByTeacher,
  deactivateStudentMember,
  deactivateTeacherMember,
  explainAcademyMemberFilter,
  getAcademyMembersByAcademyId,
  getAcademyMembersByAcademyScope,
  refreshAcademyMembersCache,
  readAcademyMembers,
  selectAcademyMembersForUser,
  buildTeacherAssignmentMatchIds,
  isStudentAssignedToTeacher,
  isActiveMember,
  MEMBER_STATUS,
  normalizeAcademyMemberRole,
  normalizeMemberStatus,
  resolveAcademyScopeId,
  resolveAcademyScopeIds,
  transferStudentsToTeacher,
} from "../services/academy-service.js";
import {
  canAssignStudentTeacher,
  canManageMemberLifecycle,
  canResetMemberPassword,
  canViewAllAcademyStudents,
  getStudentCardActionPermissions,
  isPlatformAdmin,
  normalizeRole,
  ROLES,
} from "../permissions/permission-service.js";
import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugLog,
  debugWarn,
  isDebugLogsEnabled,
} from "../bootstrap/debug-logs.js";

const UI = DEBUG_CHANNELS.ui;

const ACADEMY = DEBUG_CHANNELS.academy;
import { DEFAULT_RESET_PASSWORD } from "../services/auth-service.js";
import {
  getStudentLearningDetail,
  groupLearningDetailByLevelGroup,
} from "../services/student-learning-detail-service.js";
import { normalizeLevelGroup } from "../services/level-group-service.js";
import { getCategoryProblemNumberForProblem } from "../services/category-problem-number.js";
import { getTotalWrongCount } from "../services/review-service.js";
import {
  ensureStudentProgressHydratedForViewer,
  getAttempts,
  getLatestAttempt,
  getProgressStatus,
  getStudentProgressByUserId,
  getStudentProgressSummary,
  hydrateStudentProgressCache,
  isReviewArchived,
  isReviewDeleted,
  isReviewResolved,
  PROGRESS_STATUS,
  setReviewArchivedForStudent,
  setReviewDeletedForStudent,
} from "../services/student-progress-service.js";

export function createAcademyMemberController({
  elements,
  getCurrentUser,
  getTotalProblemCount,
  getProblems,
  getProblemById,
  openProblemInLibrary,
  escapeHtml,
  formatDateTime,
}) {
  const studentListState = {
    view: "students",
    showTeachers: true,
    nameQuery: "",
    level: "all",
    sortOrder: "name-asc",
    selectedTeacherId: "all",
    showInactiveStudents: false,
    showInactiveTeachers: false,
    accountNameQuery: "",
    accountSortOrder: "name-asc",
    showInactiveStudentAccounts: false,
  };
  let membersRenderGeneration = 0;

  const activeLearningDetailState = {
    studentId: null,
    activeLevelTab: null,
    sections: [],
  };

  const reviewModalDragState = {
    x: 0,
    y: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  };
  const activeReviewState = {
    summaries: [],
    studentId: null,
    showArchived: false,
  };

  function bindAcademyMemberEvents() {
    elements.studentNameSearch?.addEventListener("input", () => {
      studentListState.nameQuery = normalizeSearchValue(elements.studentNameSearch.value);
      refreshAcademyMemberView();
    });
    elements.studentLevelFilter?.addEventListener("change", () => {
      studentListState.level = elements.studentLevelFilter.value;
      refreshAcademyMemberView();
    });
    elements.studentSortOrder?.addEventListener("change", () => {
      studentListState.sortOrder = elements.studentSortOrder.value;
      refreshAcademyMemberView();
    });
    elements.showInactiveStudents?.addEventListener("click", () => {
      studentListState.showInactiveStudents = !studentListState.showInactiveStudents;
      syncInactiveFilterToggles();
      refreshAcademyMemberView();
    });
    elements.showInactiveTeachers?.addEventListener("click", () => {
      studentListState.showInactiveTeachers = !studentListState.showInactiveTeachers;
      syncInactiveFilterToggles();
      refreshAcademyMemberView();
    });
    elements.studentTeacherFilter?.addEventListener("click", handleTeacherFilterClick);
    elements.academyStudentList?.addEventListener("click", (event) => {
      const resetButton = event.target.closest("[data-reset-password-user-id]");
      if (resetButton) {
        handleMemberPasswordReset(resetButton.dataset.resetPasswordUserId);
        return;
      }

      const learningDetailButton = event.target.closest("[data-learning-detail-student-id]");
      if (learningDetailButton) {
        openStudentLearningDetailModal(learningDetailButton.dataset.learningDetailStudentId);
        return;
      }

      const reviewButton = event.target.closest("[data-review-student-id]");
      if (reviewButton) {
        openStudentReviewModal(reviewButton.dataset.reviewStudentId);
        return;
      }

      const deactivateButton = event.target.closest("[data-deactivate-student-id]");
      if (deactivateButton) {
        handleDeactivateStudent(deactivateButton.dataset.deactivateStudentId);
        return;
      }

      const activateButton = event.target.closest("[data-activate-student-id]");
      if (activateButton) {
        handleActivateStudent(activateButton.dataset.activateStudentId);
        return;
      }

      const deleteButton = event.target.closest("[data-delete-student-id]");
      if (deleteButton) {
        handleDeleteStudent(deleteButton.dataset.deleteStudentId);
        return;
      }

      handleTeacherFilterClick(event);
    });
    elements.academyTeacherList?.addEventListener("click", (event) => {
      const resetButton = event.target.closest("[data-reset-password-user-id]");
      if (resetButton) {
        handleMemberPasswordReset(resetButton.dataset.resetPasswordUserId);
        return;
      }

      const editButton = event.target.closest("[data-edit-member-profile-id]");
      if (editButton) {
        handleEditMemberProfile(editButton.dataset.editMemberProfileId);
        return;
      }

      const transferButton = event.target.closest("[data-transfer-students-from]");
      if (transferButton) {
        handleTransferStudents(transferButton.dataset.transferStudentsFrom);
        return;
      }

      const deactivateButton = event.target.closest("[data-deactivate-teacher-id]");
      if (deactivateButton) {
        handleDeactivateTeacher(deactivateButton.dataset.deactivateTeacherId);
        return;
      }

      const activateButton = event.target.closest("[data-activate-teacher-id]");
      if (activateButton) {
        handleActivateTeacher(activateButton.dataset.activateTeacherId);
        return;
      }
    });
    elements.academyStudentList?.addEventListener("change", handleStudentAssignChange);
    elements.closeStudentReviewModal?.addEventListener("click", closeStudentReviewModal);
    elements.closeStudentLearningDetailModal?.addEventListener("click", closeStudentLearningDetailModal);
    elements.studentLearningDetailOpenReview?.addEventListener("click", () => {
      const studentId = activeLearningDetailState.studentId;
      if (!studentId) {
        return;
      }
      closeStudentLearningDetailModal();
      openStudentReviewModal(studentId);
    });
    elements.studentLearningDetailModal?.addEventListener("click", (event) => {
      if (event.target === elements.studentLearningDetailModal) {
        closeStudentLearningDetailModal();
      }
    });
    elements.studentLearningDetailLevelNav?.addEventListener("click", handleLearningDetailLevelTabClick);
    elements.toggleArchivedReviewNotes?.addEventListener("click", () => {
      activeReviewState.showArchived = !activeReviewState.showArchived;
      syncArchivedReviewToggle();
      refreshStudentReviewModal();
    });
    elements.studentReviewModal?.addEventListener("click", (event) => {
      if (event.target === elements.studentReviewModal) {
        closeStudentReviewModal();
      }
    });
    elements.studentReviewList?.addEventListener("click", handleStudentReviewListClick);
    elements.studentReviewDragHandle?.addEventListener("pointerdown", startReviewModalDrag);

    elements.studentAccountNameSearch?.addEventListener("input", () => {
      studentListState.accountNameQuery = normalizeSearchValue(elements.studentAccountNameSearch.value);
      renderStudentAccounts();
    });
    elements.studentAccountSortOrder?.addEventListener("change", () => {
      studentListState.accountSortOrder = elements.studentAccountSortOrder.value;
      renderStudentAccounts();
    });
    elements.showInactiveStudentAccounts?.addEventListener("click", () => {
      studentListState.showInactiveStudentAccounts = !studentListState.showInactiveStudentAccounts;
      syncInactiveStudentAccountsToggle();
      renderStudentAccounts();
    });
    elements.academyStudentAccountList?.addEventListener("click", (event) => {
      const resetButton = event.target.closest("[data-reset-password-user-id]");
      if (resetButton) {
        handleMemberPasswordReset(resetButton.dataset.resetPasswordUserId);
        return;
      }

      const deactivateButton = event.target.closest("[data-deactivate-student-id]");
      if (deactivateButton) {
        handleDeactivateStudent(deactivateButton.dataset.deactivateStudentId);
        return;
      }

      const activateButton = event.target.closest("[data-activate-student-id]");
      if (activateButton) {
        handleActivateStudent(activateButton.dataset.activateStudentId);
        return;
      }

      const deleteButton = event.target.closest("[data-delete-student-id]");
      if (deleteButton) {
        handleDeleteStudent(deleteButton.dataset.deleteStudentId);
        return;
      }
    });
  }

  function refreshAcademyMemberView() {
    switch (studentListState.view) {
      case "teachers":
        renderTeacherManagement();
        break;
      case "accounts":
        renderStudentAccounts();
        break;
      case "learningStudents":
        renderAcademyStudents({ context: "learning" });
        break;
      case "students":
      default:
        renderAcademyStudents({ context: "academy" });
        break;
    }
  }

  function resolveMemberView({ showTeachers, view } = {}) {
    if (view) {
      return view;
    }

    return showTeachers === false ? "learningStudents" : "students";
  }

  function renderAcademyStudents({ context = "academy" } = {}) {
    renderAcademyMembers({
      view: context === "learning" ? "learningStudents" : "students",
    });
  }

  function renderTeacherManagement() {
    renderAcademyMembers({ view: "teachers" });
  }

  function renderStudentAccounts() {
    renderAcademyMembers({ view: "accounts" });
  }

  function renderPlatformAdminAcademyPlaceholder() {
    const message =
      '<p class="academy-empty-state">플랫폼 운영 계정은 학원별 학습·운영 데이터를 이 화면에서 조회하지 않습니다. <strong>플랫폼</strong> 메뉴를 이용해 주세요.</p>';

    if (elements.academyStudentList) {
      elements.academyStudentList.innerHTML = message;
    }
    if (elements.academyTeacherList) {
      elements.academyTeacherList.innerHTML = message;
    }
    if (elements.academyStudentAccountList) {
      elements.academyStudentAccountList.innerHTML = message;
    }
    if (elements.inviteCodeList) {
      elements.inviteCodeList.innerHTML = message;
    }
  }

  async function renderAcademyMembers({ showTeachers = true, view } = {}) {
    const renderGeneration = ++membersRenderGeneration;
    studentListState.view = resolveMemberView({ showTeachers, view });
    studentListState.showTeachers = studentListState.view === "teachers";
    const currentUser = getCurrentUser();

    if (isPlatformAdmin(currentUser)) {
      renderPlatformAdminAcademyPlaceholder();
      return;
    }

    const academyScopeId = resolveAcademyScopeId(currentUser);
    const cacheBeforeRefresh = readAcademyMembers();

    const refreshResult = await refreshAcademyMembersCache(academyScopeId, { user: currentUser });

    if (renderGeneration !== membersRenderGeneration) {
      debugWarn(DEBUG_CHANNELS.sync, "renderAcademyMembers aborted (stale async)", {
        source: DEBUG_SOURCES.fallback,
        renderGeneration,
        latestGeneration: membersRenderGeneration,
        view: studentListState.view,
      });
      return;
    }

    const membersSnapshot = refreshResult.cacheAfterSync ?? readAcademyMembers();
    const scopeIds = resolveAcademyScopeIds(currentUser);

    debugLog(DEBUG_CHANNELS.sync, "members render cache timeline", {
      source: refreshResult?.source ?? DEBUG_SOURCES.localCache,
      renderGeneration,
      academyScopeId: academyScopeId ?? "all",
      scopeIds,
      cacheBeforeRefresh: cacheBeforeRefresh.length,
      cacheAfterSync: membersSnapshot.length,
      teachersBeforeFetch: refreshResult.teachersBeforeFetch ?? null,
      teachersRemote: refreshResult.teachersRemote ?? null,
      teachersAfterSync: refreshResult.teachersAfterSync ?? null,
      sameSnapshotReference: membersSnapshot === refreshResult.cacheAfterSync,
    });

    const canViewAllStudents = canViewAllAcademyStudents(currentUser);
    const canManageLifecycle = canManageMemberLifecycle(currentUser);
    const activeTeacherMembers = selectAcademyMembersForUser(membersSnapshot, currentUser, {
      role: "teacher",
      status: "active",
    });

    debugLog(ACADEMY, "activeTeacherMembers raw", {
      renderGeneration,
      source: refreshResult?.source ?? DEBUG_SOURCES.localCache,
      scopeIds,
      count: activeTeacherMembers.length,
      membersSnapshotCount: membersSnapshot.length,
      readAcademyMembersCount: readAcademyMembers().length,
      snapshotMatchesLiveCache: membersSnapshot.length === readAcademyMembers().length,
      teachers: activeTeacherMembers.map((teacher) => ({
        userId: teacher.userId,
        academyId: teacher.academyId,
        role: teacher.role,
        status: teacher.status,
      })),
    });

    traceTeacherDropdownPipeline({
      currentUser,
      academyScopeId,
      fetchSource: refreshResult?.source,
      activeTeacherMembers,
      membersSnapshot,
      renderGeneration,
      scopeIds,
      view: studentListState.view,
      canAssignTeacher: canAssignStudentTeacher(currentUser),
    });
    const allTeacherMembers = selectAcademyMembersForUser(membersSnapshot, currentUser, {
      role: "teacher",
      status: "all",
    });
    const activeStudentMembers = selectAcademyMembersForUser(membersSnapshot, currentUser, {
      role: "student",
      status: "active",
    });
    const allStudentMembers = selectAcademyMembersForUser(membersSnapshot, currentUser, {
      role: "student",
      status: "all",
    });
    const inactiveStudentMembers = allStudentMembers.filter((member) => !isActiveMember(member));
    const inactiveTeacherMembers = allTeacherMembers.filter((member) => !isActiveMember(member));

    const studentUserIds = [
      ...new Set(allStudentMembers.map((member) => member.userId).filter(Boolean)),
    ];
    if (studentUserIds.length > 0) {
      await ensureStudentProgressHydratedForViewer(studentUserIds);
      if (renderGeneration !== membersRenderGeneration) {
        debugWarn(DEBUG_CHANNELS.sync, "renderAcademyMembers aborted after progress hydrate", {
          source: DEBUG_SOURCES.supabase,
          renderGeneration,
          latestGeneration: membersRenderGeneration,
        });
        return;
      }
    }

    const selfTeacherMember =
      activeTeacherMembers.find(
        (member) => String(member.userId ?? "").trim() === String(currentUser?.id ?? "").trim(),
      ) ??
      allTeacherMembers.find(
        (member) => String(member.userId ?? "").trim() === String(currentUser?.id ?? "").trim(),
      ) ??
      null;

    const scopedActiveStudents = getScopedStudentMembers(activeStudentMembers, currentUser, {
      teacherMembers: activeTeacherMembers,
      selfTeacherMember,
    });
    const scopedInactiveStudents = canManageLifecycle
      ? getScopedStudentMembers(inactiveStudentMembers, currentUser, {
          teacherMembers: activeTeacherMembers,
          selfTeacherMember,
        })
      : [];

    logTeacherStudentAssignmentFilter({
      currentUser,
      selfTeacherMember,
      teacherMembers: activeTeacherMembers,
      activeStudentMembers,
      scopedActiveStudents,
    });
    const filteredActiveStudents = getVisibleStudentMembers(scopedActiveStudents, activeTeacherMembers);
    const filteredInactiveStudents = studentListState.showInactiveStudents
      ? getVisibleStudentMembers(scopedInactiveStudents, activeTeacherMembers)
      : [];
    const visibleTeacherMembers = [
      ...activeTeacherMembers,
      ...(studentListState.showInactiveTeachers ? inactiveTeacherMembers : []),
    ];

    const canResetPassword = canResetMemberPassword(currentUser);
    const memberView = studentListState.view;
    const isLearningStudentsView = memberView === "learningStudents";
    const isStudentsView = memberView === "students";
    const isTeachersView = memberView === "teachers";
    const isAccountsView = memberView === "accounts";

    elements.showInactiveStudentsWrap?.classList.toggle(
      "is-hidden",
      !canManageLifecycle || !(isStudentsView || isLearningStudentsView),
    );
    elements.showInactiveTeachersWrap?.classList.toggle("is-hidden", !canManageLifecycle || !isTeachersView);
    elements.showInactiveStudentAccountsWrap?.classList.toggle(
      "is-hidden",
      !canManageLifecycle || !isAccountsView,
    );

    syncInactiveFilterToggles();
    syncInactiveStudentAccountsToggle();

    if (isTeachersView) {
      renderMemberList(elements.academyTeacherList, visibleTeacherMembers, {
        canResetPassword,
        canManageLifecycle,
        activeTeacherMembers,
        allStudentMembers: activeStudentMembers,
        emptyMessage: "가입한 선생님이 없습니다.",
      });
      return;
    }

    if (isAccountsView) {
      const accountStudents = getVisibleAccountStudentMembers([
        ...scopedActiveStudents,
        ...(studentListState.showInactiveStudentAccounts ? scopedInactiveStudents : []),
      ]);

      renderStudentAccountList(elements.academyStudentAccountList, accountStudents, {
        teacherMembers: activeTeacherMembers,
        canResetPassword,
        canManageLifecycle,
        emptyMessage: getStudentAccountEmptyMessage({
          activeCount: activeStudentMembers.length,
          inactiveCount: inactiveStudentMembers.length,
          visibleCount: accountStudents.length,
        }),
      });
      return;
    }

    if (isStudentsView || isLearningStudentsView) {
      if (elements.academyStudentsTitle) {
        elements.academyStudentsTitle.textContent = isLearningStudentsView
          ? "학생 학습관리"
          : "원생 운영 현황";
      }

      if (elements.academyStudentsDescription) {
        elements.academyStudentsDescription.textContent = isLearningStudentsView
          ? "학생별 진도, 오답노트, 학습 상세를 확인하는 학습 분석 메뉴입니다."
          : "담당 배정·진도 요약 중심의 운영 카드입니다. 학습 분석은 학습관리 메뉴를 이용해 주세요.";
      }

      const studentCardActions = getStudentCardActionPermissions(currentUser);

      renderTeacherFilterBar(activeTeacherMembers, activeStudentMembers, canViewAllStudents && isStudentsView);

      renderMemberList(elements.academyStudentList, [...filteredActiveStudents, ...filteredInactiveStudents], {
        teacherMembers: activeTeacherMembers,
        canAssignTeacher: studentCardActions.canAssignTeacher && isStudentsView,
        studentCardActions,
        canResetPassword: false,
        canManageLifecycle: false,
        cardMode: isLearningStudentsView ? "learning" : "operations",
        emptyMessage: getStudentEmptyMessage({
          academyActiveCount: activeStudentMembers.length,
          scopedActiveCount: scopedActiveStudents.length,
          inactiveCount: inactiveStudentMembers.length,
          visibleCount: filteredActiveStudents.length + filteredInactiveStudents.length,
          isTeacherView: normalizeRole(currentUser?.role) === ROLES.teacher,
        }),
      });
    }
  }

  function syncInactiveStudentAccountsToggle() {
    const toggle = elements.showInactiveStudentAccounts;
    if (!toggle) {
      return;
    }

    toggle.classList.toggle("is-active", studentListState.showInactiveStudentAccounts);
    toggle.setAttribute("aria-pressed", String(studentListState.showInactiveStudentAccounts));
  }

  function getStudentAccountEmptyMessage({ activeCount, inactiveCount, visibleCount }) {
    if (visibleCount > 0) {
      return "조건에 맞는 학생 계정이 없습니다.";
    }

    if (activeCount === 0 && inactiveCount > 0 && !studentListState.showInactiveStudentAccounts) {
      return "활성 학생 계정이 없습니다. 비활성 학생 보기를 켜 주세요.";
    }

    if (activeCount === 0 && inactiveCount === 0) {
      return "등록된 학생 계정이 없습니다. 초대코드로 가입을 안내해 주세요.";
    }

    return "조건에 맞는 학생 계정이 없습니다.";
  }

  function getVisibleAccountStudentMembers(studentMembers) {
    return studentMembers
      .filter((member) => {
        const name = normalizeSearchValue(`${member.name || ""} ${member.username || ""}`);
        return !studentListState.accountNameQuery || name.includes(studentListState.accountNameQuery);
      })
      .sort((left, right) => {
        if (studentListState.accountSortOrder === "joined-desc") {
          return new Date(right.joinedAt).getTime() - new Date(left.joinedAt).getTime();
        }

        return getStudentDisplayName(left).localeCompare(getStudentDisplayName(right), "ko");
      });
  }

  function syncInactiveFilterToggles() {
    const studentToggle = elements.showInactiveStudents;
    const teacherToggle = elements.showInactiveTeachers;

    if (studentToggle) {
      studentToggle.classList.toggle("is-active", studentListState.showInactiveStudents);
      studentToggle.setAttribute("aria-pressed", String(studentListState.showInactiveStudents));
    }

    if (teacherToggle) {
      teacherToggle.classList.toggle("is-active", studentListState.showInactiveTeachers);
      teacherToggle.setAttribute("aria-pressed", String(studentListState.showInactiveTeachers));
    }
  }

  function getStudentEmptyMessage({
    academyActiveCount = 0,
    scopedActiveCount = 0,
    inactiveCount = 0,
    visibleCount = 0,
    isTeacherView = false,
  }) {
    if (visibleCount > 0) {
      return "조건에 맞는 학생이 없습니다.";
    }

    if (isTeacherView && academyActiveCount > 0 && scopedActiveCount === 0) {
      return "담당으로 배정된 학생이 없습니다.";
    }

    if (academyActiveCount === 0 && inactiveCount > 0 && !studentListState.showInactiveStudents) {
      return "활성 학생이 없습니다. 비활성 학생 보기를 켜 주세요.";
    }

    if (academyActiveCount === 0 && inactiveCount === 0) {
      return "가입한 학생이 없습니다.";
    }

    return "조건에 맞는 학생이 없습니다.";
  }

  function formatAccountDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
  }

  function renderStudentAccountList(element, members, options = {}) {
    if (!element) {
      return;
    }

    const { teacherMembers = [], canResetPassword = false, canManageLifecycle = false, emptyMessage = "" } =
      options;

    if (members.length === 0) {
      element.classList.remove("student-account-table");
      element.innerHTML = `<p class="academy-member-empty">${emptyMessage}</p>`;
      return;
    }

    element.classList.add("student-account-table");
    element.innerHTML = `
      <div class="student-account-table__header" aria-hidden="true">
        <span>이름</span>
        <span>상태</span>
        <span>담당</span>
        <span>가입일</span>
        <span>관리</span>
      </div>
      <div class="student-account-table__body">
        ${members
          .map((member) =>
            renderStudentAccountRow(member, {
              teacherMembers,
              canResetPassword,
              canManageLifecycle,
            }),
          )
          .join("")}
      </div>
    `;
  }

  function renderStudentAccountRow(member, { teacherMembers, canResetPassword, canManageLifecycle }) {
    const isInactive = !isActiveMember(member);
    const displayName = getMemberDisplayName(member);
    const statusLabel = isInactive ? "비활성" : "활성";
    const assignedTeacherName = getTeacherDisplayName(member.assignedTeacherId, teacherMembers);
    const joinedLabel = formatAccountDate(member.joinedAt);
    const hasManagePanel = canResetPassword || canManageLifecycle;
    const rowClass = `student-account-row${isInactive ? " is-inactive-member" : ""}`;

    const cells = `
      <span class="student-account-cell student-account-cell--name">
        <strong>${escapeHtml(displayName)}</strong>
      </span>
      <span class="student-account-cell student-account-cell--status">
        <span class="member-status-badge${isInactive ? "" : " member-status-badge--active"}">${statusLabel}</span>
      </span>
      <span class="student-account-cell student-account-cell--teacher">${escapeHtml(assignedTeacherName)}</span>
      <span class="student-account-cell student-account-cell--joined">${escapeHtml(joinedLabel)}</span>
    `;

    if (!hasManagePanel) {
      return `
        <article class="${rowClass}">
          <div class="student-account-row__static">
            ${cells}
            <span class="student-account-cell student-account-cell--manage" aria-hidden="true">—</span>
          </div>
        </article>
      `;
    }

    return `
      <article class="${rowClass}">
        <details class="student-account-manage-panel">
          <summary class="student-account-row__summary">
            ${cells}
            <span class="student-account-cell student-account-cell--manage">
              <span class="student-account-manage-toggle">관리</span>
            </span>
          </summary>
          ${renderStudentAccountManageBody(member, { canResetPassword, canManageLifecycle, isInactive })}
        </details>
      </article>
    `;
  }

  function renderStudentAccountManageBody(member, { canResetPassword, canManageLifecycle, isInactive }) {
    const inviteCode = member.inviteCode ? `초대코드 ${member.inviteCode}` : "초대코드 없음";

    return `
      <div class="student-account-manage-body">
        <p class="student-account-manage-meta">
          아이디 ${escapeHtml(member.username || "-")} · 가입 경로 ${escapeHtml(inviteCode)}
        </p>
        <div class="student-account-manage-actions">
          ${canResetPassword ? renderPasswordResetButton(member, "ghost-button") : ""}
          ${renderStudentLifecycleActions(member, { canManageLifecycle, isInactive })}
        </div>
      </div>
    `;
  }

  function renderMemberList(element, members, options = {}) {
    if (!element) {
      return;
    }

    const emptyMessage = typeof options === "string" ? options : options.emptyMessage;
    const teacherMembers = options.teacherMembers ?? [];
    const activeTeacherMembers = options.activeTeacherMembers ?? teacherMembers;
    const allStudentMembers = options.allStudentMembers ?? [];
    const canAssignTeacher = options.canAssignTeacher ?? false;
    const canResetPassword = options.canResetPassword ?? false;
    const canManageLifecycle = options.canManageLifecycle ?? false;
    const cardMode = options.cardMode ?? "learning";
    const studentCardActions =
      options.studentCardActions ?? getStudentCardActionPermissions(getCurrentUser());

    if (members.length === 0) {
      element.innerHTML = `<p class="academy-member-empty">${emptyMessage}</p>`;
      return;
    }

    element.innerHTML = members
      .map((member) => {
        if (member.role === "student") {
          return renderStudentCard(member, {
            teacherMembers,
            canAssignTeacher,
            canResetPassword,
            canManageLifecycle,
            cardMode,
            studentCardActions,
          });
        }

        return renderTeacherCard(member, {
          canResetPassword,
          canManageLifecycle,
          activeTeacherMembers,
          allStudentMembers,
        });
      })
      .join("");

    if (canAssignTeacher && cardMode === "operations") {
      queueMicrotask(() => logTeacherSelectDomState(element));
    }
  }

  function renderTeacherCard(member, { canResetPassword, canManageLifecycle, activeTeacherMembers, allStudentMembers }) {
    const isInactive = !isActiveMember(member);
    const assignedCount = countStudentsByTeacher(allStudentMembers, member.userId);
    const displayName = getMemberDisplayName(member);
    const hasManagePanel = canResetPassword || canManageLifecycle;

    if (!hasManagePanel) {
      return `
        <article class="academy-member-card academy-teacher-card academy-teacher-card--compact${isInactive ? " is-inactive-member" : ""}">
          <div class="teacher-card-summary teacher-card-summary--static">
            <div class="teacher-card-compact-info">
              <strong>${escapeHtml(displayName)}</strong>
              <p class="teacher-card-meta">담당 학생 ${assignedCount}명</p>
            </div>
            ${isInactive ? `<span class="member-status-badge">비활성</span>` : ""}
          </div>
        </article>
      `;
    }

    return `
      <article class="academy-member-card academy-teacher-card academy-teacher-card--compact${isInactive ? " is-inactive-member" : ""}">
        <details class="teacher-manage-panel">
          <summary class="teacher-card-summary">
            <div class="teacher-card-compact-info">
              <strong>${escapeHtml(displayName)}</strong>
              <p class="teacher-card-meta">담당 학생 ${assignedCount}명</p>
            </div>
            <span class="teacher-card-summary-actions">
              ${isInactive ? `<span class="member-status-badge">비활성</span>` : ""}
              <span class="teacher-manage-toggle">관리</span>
            </span>
          </summary>
          ${renderTeacherManageBody(member, {
            canResetPassword,
            canManageLifecycle,
            activeTeacherMembers,
            assignedCount,
            isInactive,
          })}
        </details>
      </article>
    `;
  }

  function renderTeacherManageBody(member, options) {
    const { canResetPassword, canManageLifecycle, activeTeacherMembers, assignedCount, isInactive } = options;

    return `
      <div class="teacher-manage-body">
        <p class="teacher-manage-meta">아이디 ${escapeHtml(member.username || "-")} · 가입 ${formatDateTime(member.joinedAt)}</p>
        <div class="teacher-manage-actions">
          ${canManageLifecycle ? `<button class="secondary-button" type="button" data-edit-member-profile-id="${escapeHtml(member.userId)}">이름/아이디 수정</button>` : ""}
          ${canResetPassword ? renderPasswordResetButton(member, "ghost-button") : ""}
          ${
            canManageLifecycle && isInactive
              ? `<button class="secondary-button" type="button" data-activate-teacher-id="${escapeHtml(member.userId)}">다시 활성화</button>`
              : renderTeacherAdvancedPanel(member, {
                  canManageLifecycle,
                  activeTeacherMembers,
                  assignedCount,
                  isInactive,
                })
          }
        </div>
      </div>
    `;
  }

  function renderTeacherAdvancedPanel(member, { canManageLifecycle, activeTeacherMembers, assignedCount, isInactive }) {
    if (!canManageLifecycle || isInactive) {
      return "";
    }

    const transferTargets = activeTeacherMembers.filter((teacher) => teacher.userId !== member.userId);
    const canTransfer = assignedCount > 0 && transferTargets.length > 0;

    return `
      <details class="teacher-advanced-panel">
        <summary class="teacher-advanced-toggle">고급 관리</summary>
        <div class="teacher-advanced-body">
          ${
            canTransfer
              ? `
                <label class="teacher-transfer-field">
                  담당 학생 이전
                  <select data-transfer-target-for="${escapeHtml(member.userId)}">
                    ${transferTargets
                      .map((teacher) => {
                        return `<option value="${escapeHtml(teacher.userId)}">${escapeHtml(getMemberDisplayName(teacher))}</option>`;
                      })
                      .join("")}
                  </select>
                </label>
                <button class="ghost-button" type="button" data-transfer-students-from="${escapeHtml(member.userId)}">
                  담당 학생 일괄 이전 (${assignedCount}명)
                </button>
              `
              : `<p class="teacher-advanced-note">이전할 담당 학생이 없습니다.</p>`
          }
          <button class="ghost-button member-danger-button" type="button" data-deactivate-teacher-id="${escapeHtml(member.userId)}">
            비활성화
          </button>
        </div>
      </details>
    `;
  }

  function renderPasswordResetButton(member, buttonClass = "secondary-button") {
    return `
      <button
        class="${buttonClass} member-password-reset-button"
        type="button"
        data-reset-password-user-id="${escapeHtml(member.userId)}"
      >
        비밀번호 초기화
      </button>
    `;
  }

  function renderStudentCard(
    member,
    {
      teacherMembers,
      canAssignTeacher,
      canResetPassword,
      canManageLifecycle,
      cardMode = "learning",
      studentCardActions,
    },
  ) {
    return renderStudentSummaryCard(member, {
      teacherMembers,
      canAssignTeacher,
      cardMode,
      studentCardActions,
    });
  }

  /** operations = 운영 summary, learning = 학습 분석 레이아웃 */
  function renderStudentSummaryCard(
    member,
    { teacherMembers, canAssignTeacher, cardMode = "operations", studentCardActions },
  ) {
    const actions =
      studentCardActions ?? getStudentCardActionPermissions(getCurrentUser());
    const progress = getStudentProgress(member);
    const assignedTeacherName = getTeacherDisplayName(member.assignedTeacherId, teacherMembers);
    const isInactive = !isActiveMember(member);
    const statusLabel = isInactive ? "비활성" : "활성";
    const isLearningCard = cardMode === "learning";
    const cardVariant = isLearningCard ? "learning" : "operations";
    const canShowDetails = isLearningCard && actions.canViewDetails;
    const canShowWrongNotes = isLearningCard && actions.canViewWrongNotes;
    const showLearningActions = canShowDetails || canShowWrongNotes;

    return `
      <article class="academy-member-card academy-student-card academy-student-card--summary academy-student-card--${cardVariant}${isInactive ? " is-inactive-member" : ""}" data-student-id="${escapeHtml(member.userId)}">
        <div class="student-card-header student-card-header--compact">
          <div>
            <strong>${escapeHtml(member.name || member.username)}</strong>
            <p class="student-assigned-teacher">담당: ${escapeHtml(assignedTeacherName)}</p>
          </div>
          <span class="member-status-badge">${statusLabel}</span>
        </div>
        ${canAssignTeacher && cardMode === "operations" && !isInactive ? renderAssignTeacherSelect(member, teacherMembers) : ""}
        <dl class="student-progress-summary student-progress-summary--summary">
          ${renderStudentSummaryMetrics(progress, { includeLevel: isLearningCard })}
        </dl>
        ${
          showLearningActions
            ? renderStudentLearningActionButtons(member, {
                canViewDetails: canShowDetails,
                canViewWrongNotes: canShowWrongNotes,
              })
            : ""
        }
      </article>
    `;
  }

  function renderStudentSummaryMetrics(progress, { includeLevel = false } = {}) {
    const rows = [
      `
        <div>
          <dt>진도율</dt>
          <dd>${progress.progressRate}% · ${progress.solvedProblemCount}/${progress.totalProblemCount}문제</dd>
        </div>
        <div>
          <dt>최근 학습</dt>
          <dd>${escapeHtml(progress.recentCategory)}</dd>
        </div>
      `,
    ];

    if (includeLevel) {
      rows.push(`
        <div>
          <dt>급수</dt>
          <dd>${escapeHtml(progress.level)}</dd>
        </div>
      `);
    }

    return rows.join("");
  }

  function renderStudentLearningActionButtons(
    member,
    { canViewDetails = false, canViewWrongNotes = false } = {},
  ) {
    if (!isActiveMember(member)) {
      return "";
    }

    if (!canViewDetails && !canViewWrongNotes) {
      return "";
    }

    const buttons = [];

    if (canViewDetails) {
      buttons.push(`
        <button
          class="secondary-button student-learning-detail-button"
          type="button"
          data-learning-detail-student-id="${escapeHtml(member.userId)}"
        >
          상세
        </button>
      `);
    }

    if (canViewWrongNotes) {
      buttons.push(`
        <button
          class="secondary-button student-review-button"
          type="button"
          data-review-student-id="${escapeHtml(member.userId)}"
        >
          오답노트
        </button>
      `);
    }

    return `
      <div class="student-card-actions student-card-actions--split">
        ${buttons.join("")}
      </div>
    `;
  }

  function renderStudentLifecycleActions(member, { canManageLifecycle, isInactive }) {
    if (!canManageLifecycle) {
      return "";
    }

    if (isInactive) {
      return `
        <button class="secondary-button" type="button" data-activate-student-id="${escapeHtml(member.userId)}">
          다시 활성화
        </button>
        <button class="secondary-button member-danger-button" type="button" data-delete-student-id="${escapeHtml(member.userId)}">
          완전 삭제
        </button>
      `;
    }

    return `
      <button class="secondary-button member-danger-button" type="button" data-deactivate-student-id="${escapeHtml(member.userId)}">
        비활성화
      </button>
    `;
  }

  async function handleMemberPasswordReset(userId) {
    const currentUser = getCurrentUser();
    if (!canResetMemberPassword(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(userId);
    if (!member || !canResetMemberInAcademy(currentUser, member)) {
      window.alert("이 계정은 초기화할 수 없습니다.");
      return;
    }

    const displayName = getMemberDisplayName(member);
    const confirmed = window.confirm(
      `${displayName} 계정 비밀번호를 ${DEFAULT_RESET_PASSWORD}으로 초기화할까요?`,
    );
    if (!confirmed) {
      return;
    }

    const result = await window.BadukAuth?.resetUserPassword?.(userId);
    if (!result?.ok) {
      window.alert(result?.message || "비밀번호 초기화에 실패했습니다.");
      return;
    }

    const loginHint = member?.username
      ? `\n\n로그인: 아이디 ${member.username} / 비밀번호 ${DEFAULT_RESET_PASSWORD}`
      : "";
    window.alert(`비밀번호가 ${DEFAULT_RESET_PASSWORD}으로 초기화되었습니다.${loginHint}`);
  }

  function getAcademyId() {
    return resolveAcademyScopeId(getCurrentUser());
  }

  function traceTeacherDropdownPipeline({
    currentUser,
    academyScopeId,
    fetchSource,
    activeTeacherMembers,
    membersSnapshot,
    renderGeneration,
    scopeIds: scopeIdsInput,
    view,
    canAssignTeacher,
  }) {
    const scopeIds = scopeIdsInput ?? resolveAcademyScopeIds(currentUser);
    const scopeId = String(academyScopeId ?? scopeIds[0] ?? "").trim();
    const scopeIdSet = new Set(scopeIds);
    const filterOptions = { role: "teacher", status: "active" };
    const allMembers = membersSnapshot ?? readAcademyMembers();
    const liveCacheMembers = readAcademyMembers();
    const teachersGlobal = allMembers.filter(
      (member) => normalizeAcademyMemberRole(member.role) === "teacher",
    );
    const teachersLiveCache = liveCacheMembers.filter(
      (member) => normalizeAcademyMemberRole(member.role) === "teacher",
    );

    teachersGlobal.forEach((teacher) => {
      const filterTrace = explainAcademyMemberFilter(teacher, scopeIds, filterOptions);
      debugLog(ACADEMY, "teacher row", {
        userId: teacher.userId,
        academyId: teacher.academyId,
        role: teacher.role,
        status: teacher.status,
        userType: teacher.userType ?? null,
        matchesOwnerScope: scopeIdSet.has(String(teacher.academyId ?? "").trim()),
        ownerAuthId: currentUser?.id ?? null,
        dropdownFilter: filterTrace,
      });
    });

    const membersBeforeFilter = teachersGlobal;
    const afterScopeFilter = teachersGlobal.filter((member) =>
      scopeIdSet.has(String(member.academyId ?? "").trim()),
    );
    const afterRoleFilter = afterScopeFilter.filter(
      (member) => normalizeAcademyMemberRole(member.role) === "teacher",
    );
    const afterStatusFilter = afterRoleFilter.filter((member) => isActiveMember(member));
    const assignableTeachers = getAcademyMembersByAcademyScope(scopeIds, filterOptions, allMembers);

    debugLog(ACADEMY, "teacher candidates", {
      source: fetchSource ?? DEBUG_SOURCES.localCache,
      renderGeneration,
      scopeId,
      scopeIds,
      view,
      dataSource: {
        usesSnapshot: Boolean(membersSnapshot),
        snapshotTeacherCount: teachersGlobal.length,
        liveCacheTeacherCount: teachersLiveCache.length,
        snapshotDiffersFromLiveCache: teachersGlobal.length !== teachersLiveCache.length,
      },
      ownerSession: {
        id: currentUser?.id,
        role: currentUser?.role,
        userType: currentUser?.userType,
        roleNormalized: normalizeRole(currentUser?.role ?? currentUser?.userType),
        academyIdMeta: currentUser?.academyId ?? null,
        scopeMatchesOwnerId: scopeId === String(currentUser?.id ?? "").trim(),
      },
      memberRoleField: "academy_members.role (auth userType/type 무관)",
      filterPipeline: {
        membersBeforeFilter: membersBeforeFilter.length,
        afterScopeFilter: afterScopeFilter.length,
        afterRoleFilter: afterRoleFilter.length,
        afterStatusFilter: afterStatusFilter.length,
        getAcademyMembersByAcademyScope: assignableTeachers.length,
        activeTeacherMembers: activeTeacherMembers.length,
      },
      rejectSamples: membersBeforeFilter
        .map((teacher) => explainAcademyMemberFilter(teacher, scopeIds, filterOptions))
        .filter((trace) => !trace.included)
        .slice(0, 5),
    });

    debugLog(ACADEMY, "assignable teachers (dropdown source)", {
      source: fetchSource ?? DEBUG_SOURCES.localCache,
      scopeId,
      scopeIds,
      count: activeTeacherMembers.length,
      canAssignTeacher,
      renderAssignTeacherSelectWillRun: canAssignTeacher && activeTeacherMembers.length > 0,
      teachers: activeTeacherMembers.map((teacher) => ({
        userId: teacher.userId,
        name: teacher.name,
        username: teacher.username,
        academyId: teacher.academyId,
        role: teacher.role,
        status: teacher.status,
      })),
    });

    if (afterStatusFilter.length > 0 && activeTeacherMembers.length === 0) {
      debugWarn(ACADEMY, "dropdown emptied between filter and getAcademyMembersForUser", {
        source: DEBUG_SOURCES.fallback,
        scopeIds,
        afterStatusFilter: afterStatusFilter.map((t) => t.userId),
        getAcademyMembersForUserPath: "academy-scope",
      });
    }

    const mismatchedTeachers = teachersGlobal.filter(
      (teacher) => !scopeIdSet.has(String(teacher.academyId ?? "").trim()),
    );
    if (mismatchedTeachers.length > 0 && scopeId) {
      debugWarn(ACADEMY, "teacher academy_id mismatch — run repair_academy_member_scope SQL", {
        source: DEBUG_SOURCES.fallback,
        ownerAuthId: currentUser?.id ?? null,
        expectedScopeIds: scopeIds,
        mismatched: mismatchedTeachers.map((teacher) => ({
          userId: teacher.userId,
          academyId: teacher.academyId,
          role: teacher.role,
          status: teacher.status,
        })),
      });
    }
  }

  function findAcademyMemberByUserId(userId) {
    const scopeIds = resolveAcademyScopeIds(getCurrentUser());
    return [
      ...getAcademyMembersByAcademyScope(scopeIds, { role: "teacher", status: "all" }),
      ...getAcademyMembersByAcademyScope(scopeIds, { role: "student", status: "all" }),
    ].find((member) => member.userId === userId);
  }

  async function handleDeactivateStudent(studentUserId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(studentUserId);
    if (!member || member.role !== "student" || !isActiveMember(member)) {
      return;
    }

    const confirmed = window.confirm(
      `${getMemberDisplayName(member)} 학생을 비활성화할까요?\n비활성 학생은 기본 목록에서 숨겨지며 로그인할 수 없습니다.`,
    );
    if (!confirmed) {
      return;
    }

    const result = await deactivateStudentMember({
      academyId: member.academyId || getAcademyId(),
      studentUserId,
    });

    if (!result?.ok) {
      window.alert(result?.message || "학생 비활성화에 실패했습니다.");
      return;
    }

    await refreshAcademyMemberView();
  }

  async function handleActivateStudent(studentUserId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(studentUserId);
    if (!member || member.role !== "student") {
      return;
    }

    const result = await activateStudentMember({
      academyId: member.academyId || getAcademyId(),
      studentUserId,
    });

    if (!result?.ok) {
      window.alert(result?.message || "학생 활성화에 실패했습니다.");
      return;
    }

    await refreshAcademyMemberView();
  }

  async function handleDeleteStudent(studentUserId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(studentUserId);
    if (!member || member.role !== "student" || isActiveMember(member)) {
      window.alert("비활성화된 학생만 완전 삭제할 수 있습니다.");
      return;
    }

    const confirmed = window.confirm(
      `${getMemberDisplayName(member)} 학생을 완전히 삭제할까요?\n학습 기록(student_progress 포함)도 함께 제거됩니다.`,
    );
    if (!confirmed) {
      return;
    }

    const academyId = getAcademyId();
    const deleteResult = await window.BadukAuth?.deleteMemberAccount?.({
      userId: studentUserId,
      academyId,
      member,
    });
    if (!deleteResult?.ok) {
      window.alert(deleteResult?.message || "계정 삭제에 실패했습니다.");
      return;
    }

    window.alert(deleteResult.message || "학생과 학습 기록이 삭제되었습니다.");
    await refreshAcademyMemberView();
  }

  async function handleDeactivateTeacher(teacherUserId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(teacherUserId);
    if (!member || member.role !== "teacher" || !isActiveMember(member)) {
      return;
    }

    const assignedCount = countStudentsByTeacher(
      getAcademyMembersByAcademyId(getAcademyId(), { role: "student", status: "all" }),
      teacherUserId,
    );
    const confirmed = window.confirm(
      `${getMemberDisplayName(member)} 선생님을 비활성화할까요?\n담당 학생 ${assignedCount}명의 배정이 해제되고, 새 학생 배정이 불가능해집니다.`,
    );
    if (!confirmed) {
      return;
    }

    const result = await deactivateTeacherMember({
      academyId: member.academyId || getAcademyId(),
      teacherUserId,
      clearAssignments: true,
    });

    if (!result?.ok) {
      window.alert(result?.message || "선생님 비활성화에 실패했습니다.");
      return;
    }

    await refreshAcademyMemberView();
  }

  async function handleActivateTeacher(teacherUserId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(teacherUserId);
    if (!member || member.role !== "teacher") {
      return;
    }

    const result = await activateTeacherMember({
      academyId: member.academyId || getAcademyId(),
      teacherUserId,
    });

    if (!result?.ok) {
      window.alert(result?.message || "선생님 활성화에 실패했습니다.");
      return;
    }

    await refreshAcademyMemberView();
  }

  async function handleEditMemberProfile(userId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const member = findAcademyMemberByUserId(userId);
    if (!member) {
      return;
    }

    const nextName = window.prompt("이름", member.name || member.username || "");
    if (nextName === null) {
      return;
    }

    const nextUsername = window.prompt("아이디", member.username || "");
    if (nextUsername === null) {
      return;
    }

    const result = await window.BadukAuth?.updateMemberAccount?.({
      userId,
      academyId: getAcademyId(),
      name: nextName,
      username: nextUsername,
    });

    if (!result?.ok) {
      window.alert(result?.message || "계정 정보 수정에 실패했습니다.");
      return;
    }

    if (result.passwordReset) {
      window.alert(
        `아이디가 변경되어 비밀번호가 ${DEFAULT_RESET_PASSWORD}으로 초기화되었습니다. 다음 로그인 시 변경을 안내해 주세요.`,
      );
    }

    refreshAcademyMemberView();
  }

  function handleTransferStudents(fromTeacherUserId) {
    const currentUser = getCurrentUser();
    if (!canManageMemberLifecycle(currentUser)) {
      return;
    }

    const select = elements.academyTeacherList?.querySelector(
      `[data-transfer-target-for="${fromTeacherUserId}"]`,
    );
    const toTeacherUserId = select?.value;
    if (!toTeacherUserId) {
      window.alert("이전할 선생님을 선택해 주세요.");
      return;
    }

    const fromTeacher = findAcademyMemberByUserId(fromTeacherUserId);
    const toTeacher = findAcademyMemberByUserId(toTeacherUserId);
    const transferCount = countStudentsByTeacher(
      getAcademyMembersByAcademyId(getAcademyId(), { role: "student", status: "active" }),
      fromTeacherUserId,
    );

    const confirmed = window.confirm(
      `${getMemberDisplayName(fromTeacher)} 담당 학생 ${transferCount}명을 ${getMemberDisplayName(toTeacher)} 선생님에게 이전할까요?`,
    );
    if (!confirmed) {
      return;
    }

    const result = transferStudentsToTeacher({
      academyId: getAcademyId(),
      fromTeacherUserId,
      toTeacherUserId,
    });

    if (!result.ok) {
      window.alert(result.message || "담당 학생 이전에 실패했습니다.");
      return;
    }

    window.alert(`${result.transferredCount}명의 담당 학생을 이전했습니다.`);
    refreshAcademyMemberView();
  }

  function getAcademyMembersForUser(currentUser, options = {}, membersList) {
    return selectAcademyMembersForUser(membersList ?? readAcademyMembers(), currentUser, options);
  }

  function canResetMemberInAcademy(currentUser, member) {
    const academyId = resolveAcademyScopeId(currentUser);
    return (
      String(member.academyId ?? "").trim() === academyId &&
      ["student", "teacher"].includes(normalizeAcademyMemberRole(member.role))
    );
  }

  function getScopedStudentMembers(
    studentMembers,
    currentUser,
    { teacherMembers = [], selfTeacherMember = null } = {},
  ) {
    if (canViewAllAcademyStudents(currentUser)) {
      return filterStudentsBySelectedTeacher(studentMembers, teacherMembers);
    }

    if (normalizeRole(currentUser?.role) === ROLES.teacher) {
      const matchIds = buildTeacherAssignmentMatchIds(
        currentUser,
        teacherMembers,
        selfTeacherMember,
      );
      return studentMembers.filter((member) => isStudentAssignedToTeacher(member, matchIds));
    }

    return studentMembers;
  }

  function logTeacherStudentAssignmentFilter({
    currentUser,
    selfTeacherMember,
    teacherMembers,
    activeStudentMembers,
    scopedActiveStudents,
  }) {
    if (normalizeRole(currentUser?.role) !== ROLES.teacher) {
      return;
    }

    const matchIds = buildTeacherAssignmentMatchIds(
      currentUser,
      teacherMembers,
      selfTeacherMember,
    );
    const payload = {
      currentUserId: currentUser?.id ?? null,
      currentUserRole: currentUser?.role ?? null,
      selfTeacherMemberId: selfTeacherMember?.id ?? null,
      selfTeacherMemberUserId: selfTeacherMember?.userId ?? null,
      matchIds: [...matchIds],
      academyActiveStudentCount: activeStudentMembers.length,
      scopedActiveStudentCount: scopedActiveStudents.length,
      assignmentSamples: activeStudentMembers.slice(0, 8).map((student) => ({
        studentUserId: student.userId,
        assignedTeacherId: student.assignedTeacherId ?? null,
        matchesCurrentTeacher: isStudentAssignedToTeacher(student, matchIds),
      })),
    };

    debugLog(ACADEMY, "teacher student assignment filter", payload);

    if (activeStudentMembers.length > 0 && scopedActiveStudents.length === 0) {
      console.warn("[academy] teacher assignment filter removed all students", payload);
    } else if (activeStudentMembers.length === 0) {
      console.warn("[academy] teacher sees no academy students before assignment filter", payload);
    }
  }

  function filterStudentsBySelectedTeacher(studentMembers, teacherMembers = []) {
    if (studentListState.selectedTeacherId === "all") {
      return studentMembers;
    }

    if (studentListState.selectedTeacherId === "unassigned") {
      return studentMembers.filter((member) => !member.assignedTeacherId);
    }

    const matchIds = buildTeacherAssignmentMatchIds(
      { id: studentListState.selectedTeacherId },
      teacherMembers,
    );

    return studentMembers.filter((member) => isStudentAssignedToTeacher(member, matchIds));
  }

  function renderTeacherFilterBar(teacherMembers, studentMembers, canViewAllStudents) {
    if (!elements.studentTeacherFilter) {
      return;
    }

    elements.studentTeacherFilter.classList.toggle("is-hidden", !canViewAllStudents);
    if (!canViewAllStudents) {
      elements.studentTeacherFilter.innerHTML = "";
      return;
    }

    elements.studentTeacherFilter.innerHTML = `
      <div class="teacher-filter-list">
        ${renderTeacherFilterChip("all", "전체", countStudentsByTeacher(studentMembers, "all"))}
        ${teacherMembers
          .map((teacher) => {
            const label = getMemberDisplayName(teacher);
            const count = countStudentsByTeacher(studentMembers, teacher.userId, teacherMembers);
            return renderTeacherFilterChip(teacher.userId, label, count);
          })
          .join("")}
        ${renderTeacherFilterChip("unassigned", "미배정", countStudentsByTeacher(studentMembers, "unassigned"))}
      </div>
    `;
  }

  function renderTeacherFilterChip(teacherId, label, count) {
    const isActive = studentListState.selectedTeacherId === teacherId;
    return `
      <button
        class="teacher-filter-chip${isActive ? " is-active" : ""}"
        type="button"
        data-teacher-filter="${escapeHtml(teacherId)}"
      >
        ${escapeHtml(label)}(${count})
      </button>
    `;
  }

  function getTeacherOptionLabel(teacher) {
    const name = String(teacher?.name ?? "").trim();
    const username = String(teacher?.username ?? "").trim();
    if (name) {
      return name;
    }
    if (username) {
      return username;
    }
    const userId = String(teacher?.userId ?? "").trim();
    return userId ? `선생님 (${userId.slice(0, 8)})` : "이름 없음";
  }

  function buildTeacherAssignSelectOptions(member, teacherMembers) {
    const assignedId = String(member?.assignedTeacherId ?? "").trim();
    const rows = [
      {
        value: "",
        label: "미배정",
        selected: !assignedId,
        nameRaw: null,
        usernameRaw: null,
      },
    ];

    teacherMembers.forEach((teacher) => {
      const value = String(teacher?.userId ?? "").trim();
      const label = getTeacherOptionLabel(teacher);
      const teacherMatchIds = buildTeacherAssignmentMatchIds(teacher, teacherMembers, teacher);
      rows.push({
        value,
        label,
        selected: isStudentAssignedToTeacher(member, teacherMatchIds),
        nameRaw: teacher?.name ?? null,
        usernameRaw: teacher?.username ?? null,
        labelIsBlank: label.length === 0,
        labelCharCodes: [...label].slice(0, 12).map((ch) => ch.charCodeAt(0)),
      });
    });

    return rows;
  }

  function renderAssignTeacherSelect(member, teacherMembers) {
    const optionRows = buildTeacherAssignSelectOptions(member, teacherMembers);
    const optionHtml = optionRows
      .map((row) => {
        const selectedAttr = row.selected ? " selected" : "";
        return `<option value="${escapeHtml(row.value)}"${selectedAttr}>${escapeHtml(row.label)}</option>`;
      })
      .join("");
    const selectHtml = `
      <label class="student-assign-teacher">
        <span class="student-assign-teacher-label">담당 선생님</span>
        <select data-assign-student-id="${escapeHtml(String(member?.userId ?? ""))}" aria-label="담당 선생님 선택">
          ${optionHtml}
        </select>
      </label>
    `.trim();

    debugLog(ACADEMY, "renderAssignTeacherSelect", {
      studentUserId: member?.userId ?? null,
      assignedTeacherId: member?.assignedTeacherId ?? null,
      dropdownOptionCount: teacherMembers.length,
      teacherUserIds: teacherMembers.map((teacher) => teacher.userId),
    });

    debugLog(UI, "teacher option labels", {
      studentUserId: member?.userId ?? null,
      options: optionRows,
    });

    debugLog(UI, "teacher select html", {
      studentUserId: member?.userId ?? null,
      html: selectHtml,
      optionCount: optionRows.length,
      hasEmptyLabel: optionRows.some((row) => row.labelIsBlank),
    });

    return selectHtml;
  }

  function logTeacherSelectDomState(rootElement) {
    if (!isDebugLogsEnabled() || !rootElement) {
      return;
    }

    const selects = rootElement.querySelectorAll(".student-assign-teacher select[data-assign-student-id]");
    selects.forEach((select) => {
      const label = select.closest(".student-assign-teacher");
      const styles = window.getComputedStyle(select);
      const labelStyles = label ? window.getComputedStyle(label) : null;
      const rect = select.getBoundingClientRect();
      const options = [...select.options].map((option) => ({
        value: option.value,
        text: option.text,
        textLength: option.text.length,
        textTrimmedLength: option.text.trim().length,
        selected: option.selected,
        disabled: option.disabled,
        hidden: option.hidden,
      }));

      debugLog(UI, "teacher select dom state", {
        studentUserId: select.dataset.assignStudentId ?? null,
        outerHtml: select.outerHTML.slice(0, 800),
        options,
        selectedIndex: select.selectedIndex,
        value: select.value,
        disabled: select.disabled,
        hidden: select.hidden,
        ariaHidden: select.getAttribute("aria-hidden"),
        tabIndex: select.tabIndex,
        offsetSize: { width: select.offsetWidth, height: select.offsetHeight },
        clientRect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
        },
        isVisible: rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden" && styles.display !== "none",
        selectComputed: {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          opacity: styles.opacity,
          visibility: styles.visibility,
          display: styles.display,
          overflow: styles.overflow,
          zIndex: styles.zIndex,
          fontSize: styles.fontSize,
          lineHeight: styles.lineHeight,
          WebkitAppearance: styles.getPropertyValue("-webkit-appearance"),
          appearance: styles.appearance,
        },
        labelComputed: labelStyles
          ? {
              color: labelStyles.color,
              opacity: labelStyles.opacity,
              overflow: labelStyles.overflow,
            }
          : null,
        parentCardOverflow: select.closest(".academy-member-card")
          ? window.getComputedStyle(select.closest(".academy-member-card")).overflow
          : null,
      });
    });
  }

  function getTeacherDisplayName(teacherRef, teacherMembers) {
    const assigned = String(teacherRef ?? "").trim();
    if (!assigned) {
      return "미배정";
    }

    const teacher = teacherMembers.find(
      (member) =>
        String(member.userId ?? "").trim() === assigned ||
        String(member.id ?? "").trim() === assigned,
    );
    return teacher ? getMemberDisplayName(teacher) : "미배정";
  }

  function getMemberDisplayName(member) {
    return getTeacherOptionLabel(member);
  }

  function handleTeacherFilterClick(event) {
    const filterButton = event.target.closest("[data-teacher-filter]");
    if (!filterButton) {
      return;
    }

    studentListState.selectedTeacherId = filterButton.dataset.teacherFilter;
    refreshAcademyMemberView();
  }

  async function handleStudentAssignChange(event) {
    const select = event.target.closest("[data-assign-student-id]");
    if (!select) {
      return;
    }

    const currentUser = getCurrentUser();
    const academyId = resolveAcademyScopeId(currentUser);
    const studentUserId = select.dataset.assignStudentId;
    const teacherUserId = select.value || null;
    const previousMember = findAcademyMemberByUserId(studentUserId);
    const previousAssignedTeacherId = previousMember?.assignedTeacherId ?? null;

    const result = await assignStudentTeacher({
      academyId,
      studentUserId,
      teacherUserId,
    });

    if (!result?.ok) {
      select.value = previousAssignedTeacherId ?? "";
      if (result?.message) {
        window.alert(result.message);
      }
      refreshAcademyMemberView();
      return;
    }

    await refreshAcademyMemberView();
  }

  function getStudentProgressPlaceholder() {
    return {
      level: "급수 미정",
      progressRate: 0,
      totalProblemCount: 0,
      solvedProblemCount: 0,
      inProgressProblemCount: 0,
      notStartedProblemCount: 0,
      recentCategory: "기록 없음",
    };
  }

  function getStudentProgress(member) {
    if (!member?.userId) {
      return getStudentProgressPlaceholder();
    }

    return getStudentProgressSummary(member.userId, getTotalProblemCount());
  }

  function getVisibleStudentMembers(studentMembers, teacherMembers = []) {
    return studentMembers
      .map((member) => ({
        member,
        progress: getStudentProgress(member),
      }))
      .filter(({ member, progress }) => {
        const name = normalizeSearchValue(member.name || member.username);
        const matchesName = !studentListState.nameQuery || name.includes(studentListState.nameQuery);
        const matchesLevel = studentListState.level === "all" || progress.level === studentListState.level;

        return matchesName && matchesLevel;
      })
      .sort(compareStudentMembers)
      .map(({ member }) => member);
  }

  function compareStudentMembers(left, right) {
    const leftMember = left.member;
    const rightMember = right.member;

    if (studentListState.sortOrder === "joined-desc") {
      return new Date(rightMember.joinedAt).getTime() - new Date(leftMember.joinedAt).getTime();
    }

    if (studentListState.sortOrder === "progress-asc") {
      return left.progress.progressRate - right.progress.progressRate;
    }

    if (studentListState.sortOrder === "progress-desc") {
      return right.progress.progressRate - left.progress.progressRate;
    }

    return getStudentDisplayName(leftMember).localeCompare(getStudentDisplayName(rightMember), "ko");
  }

  function getStudentDisplayName(member) {
    return member.name || member.username || "";
  }

  function normalizeSearchValue(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function loadStudentLearningDetailSections(studentUserId) {
    const categoryRows = getStudentLearningDetail(studentUserId, getProblems());
    return groupLearningDetailByLevelGroup(categoryRows);
  }

  function resolveInitialLevelTab(sections, progress) {
    if (!sections.length) {
      return null;
    }

    const preferred = normalizeLevelGroup(progress?.level);
    if (sections.some((section) => section.levelGroup === preferred)) {
      return preferred;
    }

    return sections[0].levelGroup;
  }

  function renderLearningDetailLevelNav(sections, activeLevelTab) {
    if (!sections.length) {
      return "";
    }

    return sections
      .map((section) => {
        const isActive = section.levelGroup === activeLevelTab;
        return `
          <button
            id="learning-level-tab-${escapeHtml(section.levelGroup)}"
            class="student-learning-level-chip${isActive ? " is-active" : ""}"
            type="button"
            role="tab"
            aria-selected="${isActive}"
            data-learning-level-tab="${escapeHtml(section.levelGroup)}"
          >
            ${escapeHtml(section.levelGroup)}
            <span class="student-learning-level-chip-count">${section.rows.length}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderLearningDetailLevelBody(section) {
    if (!section) {
      return `<p class="student-learning-detail-empty">선택한 급수에 표시할 카테고리가 없습니다.</p>`;
    }

    if (!section.rows.length) {
      return `<p class="student-learning-detail-empty">${escapeHtml(section.levelGroup)} 과정 학습 기록이 없습니다.</p>`;
    }

    return `
      <section class="student-learning-level-panel" data-level-group="${escapeHtml(section.levelGroup)}">
        <p class="student-learning-level-panel-meta">${escapeHtml(section.description)}</p>
        <ul class="student-category-detail-list">
          ${section.rows.map((row) => renderCategoryDetailRow(row)).join("")}
        </ul>
      </section>
    `;
  }

  function refreshStudentLearningDetailModal() {
    const studentId = activeLearningDetailState.studentId;
    if (!studentId) {
      return;
    }

    const student = findRenderedStudent(studentId);
    const progress = student ? getStudentProgress(student) : getStudentProgressPlaceholder();
    const sections = activeLearningDetailState.sections.length
      ? activeLearningDetailState.sections
      : loadStudentLearningDetailSections(studentId);

    activeLearningDetailState.sections = sections;

    if (!sections.length) {
      activeLearningDetailState.activeLevelTab = null;
      if (elements.studentLearningDetailLevelNav) {
        elements.studentLearningDetailLevelNav.innerHTML = "";
      }
      if (elements.studentLearningDetailBody) {
        elements.studentLearningDetailBody.innerHTML =
          `<p class="student-learning-detail-empty">아직 학습 기록이 없습니다.</p>`;
      }
      return;
    }

    if (
      !activeLearningDetailState.activeLevelTab ||
      !sections.some((section) => section.levelGroup === activeLearningDetailState.activeLevelTab)
    ) {
      activeLearningDetailState.activeLevelTab = resolveInitialLevelTab(sections, progress);
    }

    const activeSection = sections.find(
      (section) => section.levelGroup === activeLearningDetailState.activeLevelTab,
    );

    if (elements.studentLearningDetailLevelNav) {
      elements.studentLearningDetailLevelNav.innerHTML = renderLearningDetailLevelNav(
        sections,
        activeLearningDetailState.activeLevelTab,
      );
    }

    if (elements.studentLearningDetailBody) {
      elements.studentLearningDetailBody.innerHTML = renderLearningDetailLevelBody(activeSection);
      elements.studentLearningDetailBody.setAttribute(
        "aria-labelledby",
        `learning-level-tab-${activeLearningDetailState.activeLevelTab}`,
      );
    }
  }

  function handleLearningDetailLevelTabClick(event) {
    const tabButton = event.target.closest("[data-learning-level-tab]");
    if (!tabButton || !activeLearningDetailState.studentId) {
      return;
    }

    const nextTab = tabButton.dataset.learningLevelTab;
    if (!nextTab || nextTab === activeLearningDetailState.activeLevelTab) {
      return;
    }

    activeLearningDetailState.activeLevelTab = nextTab;
    refreshStudentLearningDetailModal();
  }

  async function openStudentLearningDetailModal(studentId) {
    const student = findRenderedStudent(studentId);
    if (!student) {
      return;
    }

    await hydrateStudentProgressCache(studentId);

    activeLearningDetailState.studentId = studentId;
    activeLearningDetailState.sections = loadStudentLearningDetailSections(studentId);
    const progress = getStudentProgress(student);
    activeLearningDetailState.activeLevelTab = resolveInitialLevelTab(
      activeLearningDetailState.sections,
      progress,
    );

    const teacherMembers = getAcademyMembersByAcademyId(getAcademyId(), {
      role: "teacher",
      status: "all",
    });

    if (elements.studentLearningDetailTitle) {
      elements.studentLearningDetailTitle.textContent = `${getMemberDisplayName(student)} 학습 상세`;
    }

    if (elements.studentLearningDetailMeta) {
      elements.studentLearningDetailMeta.textContent = `담당 ${getTeacherDisplayName(student.assignedTeacherId, teacherMembers)} · 진도 ${progress.progressRate}% · ${progress.level}`;
    }

    if (elements.studentLearningDetailOpenReview) {
      elements.studentLearningDetailOpenReview.dataset.reviewStudentId = studentId;
    }

    refreshStudentLearningDetailModal();
    elements.studentLearningDetailModal?.classList.remove("is-hidden");
  }

  function closeStudentLearningDetailModal() {
    activeLearningDetailState.studentId = null;
    activeLearningDetailState.activeLevelTab = null;
    activeLearningDetailState.sections = [];
    elements.studentLearningDetailModal?.classList.add("is-hidden");
    if (elements.studentLearningDetailLevelNav) {
      elements.studentLearningDetailLevelNav.innerHTML = "";
    }
    if (elements.studentLearningDetailBody) {
      elements.studentLearningDetailBody.innerHTML = "";
      elements.studentLearningDetailBody.removeAttribute("aria-labelledby");
    }
  }

  function renderCategoryDetailRow(row) {
    const reviewLines = [];
    if (row.unresolvedReviewCount > 0) {
      reviewLines.push(`복습 필요 ${row.unresolvedReviewCount}문제`);
    }
    if (row.resolvedReviewCount > 0) {
      reviewLines.push(`해결된 복습 ${row.resolvedReviewCount}문제`);
    }

    const metaItems = [row.recentLabel];
    if (!row.statusLabel.includes("완료") && row.continueLabel !== "카테고리 완료") {
      metaItems.push(row.continueLabel);
    }
    metaItems.push(...reviewLines);

    return `
      <li class="student-category-detail-item is-${row.status}">
        <div class="student-category-detail-head">
          <strong>${escapeHtml(row.categoryName)}</strong>
          <span>${row.solved}/${row.total} · ${escapeHtml(row.statusLabel)}</span>
        </div>
        <ul class="student-category-detail-meta">
          ${metaItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </li>
    `;
  }

  function openStudentReviewModal(studentId) {
    activeReviewState.studentId = studentId;
    activeReviewState.showArchived = false;
    syncArchivedReviewToggle();
    refreshStudentReviewModal();
    applyReviewModalPosition();
    elements.studentReviewModal?.classList.remove("is-hidden");
  }

  function refreshStudentReviewModal() {
    const studentId = activeReviewState.studentId;
    if (!studentId) {
      return;
    }

    const student = findRenderedStudent(studentId);
    const reviewSummaries = getReviewableProblemSummaries(studentId, {
      includeArchived: activeReviewState.showArchived,
    });
    activeReviewState.summaries = reviewSummaries;

    if (elements.studentReviewTitle) {
      elements.studentReviewTitle.textContent = `${student?.name || student?.username || "학생"} 오답노트`;
    }

    if (elements.studentReviewList) {
      elements.studentReviewList.innerHTML = renderStudentReviewList(reviewSummaries, studentId);
      renderSummaryBoards(reviewSummaries);
    }
  }

  function closeStudentReviewModal() {
    activeReviewState.summaries = [];
    activeReviewState.studentId = null;
    activeReviewState.showArchived = false;
    syncArchivedReviewToggle();
    elements.studentReviewModal?.classList.add("is-hidden");
  }

  function syncArchivedReviewToggle() {
    const button = elements.toggleArchivedReviewNotes;
    if (!button) {
      return;
    }

    button.setAttribute("aria-pressed", String(activeReviewState.showArchived));
    button.textContent = activeReviewState.showArchived
      ? "보관된 오답 숨기기"
      : "보관된 오답 보기";
  }

  function getReviewableProblemSummaries(studentId, { includeArchived = false } = {}) {
    return getStudentProgressByUserId(studentId)
      .filter(hasReviewableWrongHistory)
      .filter((progress) => !isReviewDeleted(progress))
      .filter((progress) => includeArchived || !isReviewArchived(progress))
      .map((progress) => buildProblemReviewSummary(progress));
  }

  function hasReviewableWrongHistory(progress) {
    const attempts = getAttempts(progress);
    if (attempts.length > 0) {
      return attempts.some((attempt) => (attempt.wrongCount ?? 0) > 0);
    }

    return (progress.wrongCount ?? 0) > 0;
  }

  function resolveLastWrongMoveFromProgress(progress) {
    const attempts = getAttempts(progress);
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
      const wrongMoves = attempts[index]?.wrongMoves;
      if (Array.isArray(wrongMoves) && wrongMoves.length > 0) {
        return wrongMoves[wrongMoves.length - 1];
      }
    }

    const legacyMoves = progress?.wrongMoves;
    if (Array.isArray(legacyMoves) && legacyMoves.length > 0) {
      return legacyMoves[legacyMoves.length - 1];
    }

    return null;
  }

  function buildProblemReviewSummary(progress) {
    const attempts = getAttempts(progress);
    const latestAttempt = getLatestAttempt(progress);
    const problem = getProblemById(progress.problemId);
    const totalWrongCount = getTotalWrongCount(progress);
    const categoryProblemNumber = problem
      ? getCategoryProblemNumberForProblem(problem, getProblems())
      : 0;
    const snapshotStones = problem?.stones ? problem.stones.map((stone) => ({ ...stone })) : [];

    return {
      problemId: progress.problemId,
      problemTitle: progress.problemTitle || progress.problemId,
      category: progress.category || problem?.category || "미분류",
      categoryProblemNumber,
      attemptCount: attempts.length || (progress.wrongCount > 0 ? 1 : 0),
      totalWrongCount,
      latestStatus: getProgressStatus(progress),
      latestWrongCount: latestAttempt?.wrongCount ?? progress.wrongCount ?? 0,
      latestWrongMove: resolveLastWrongMoveFromProgress(progress),
      reviewResolved: isReviewResolved(progress),
      reviewArchived: isReviewArchived(progress),
      snapshotStones,
      updatedAt: progress.updatedAt,
    };
  }

  function formatAttemptCountLabel(attemptCount) {
    if (attemptCount <= 1) {
      return "시도 1회";
    }

    return `반복 시도 ${attemptCount}회`;
  }

  function renderStudentReviewList(reviewSummaries, studentId) {
    if (reviewSummaries.length === 0) {
      const emptyLabel = activeReviewState.showArchived
        ? "보관된 오답 기록이 없습니다."
        : "표시할 오답 기록이 없습니다. 보관된 오답은 토글로 확인할 수 있습니다.";
      return `<p class="student-review-empty">${emptyLabel}</p>`;
    }

    return reviewSummaries
      .map((summary) => {
        const boardKey = escapeHtml(summary.problemId);
        const problemLabel = summary.categoryProblemNumber
          ? `${summary.category} ${summary.categoryProblemNumber}번`
          : summary.problemTitle;
        const lifecycleBadges = renderReviewLifecycleBadges(summary);
        return `
          <article class="student-review-item${summary.reviewArchived ? " is-archived" : ""}" data-review-problem-id="${boardKey}">
            <div class="student-review-card">
              <div class="student-review-summary-text">
                <div class="student-review-title-row">
                  <strong>${escapeHtml(problemLabel)}</strong>
                  <span class="student-review-category">${escapeHtml(summary.category)}</span>
                </div>
                <div class="student-review-lifecycle-badges">${lifecycleBadges}</div>
                <p class="student-review-stats">
                  <span>누적 오답 ${summary.totalWrongCount}회</span>
                  <span>${escapeHtml(formatAttemptCountLabel(summary.attemptCount))}</span>
                  <span>${formatDateTime(summary.updatedAt)}</span>
                </p>
                <div class="student-review-card-actions">
                  <button class="secondary-button" type="button" data-retry-problem-id="${boardKey}">다시 풀기</button>
                  ${
                    summary.reviewArchived
                      ? `<button class="secondary-button" type="button" data-unarchive-review-problem-id="${boardKey}" data-review-student-id="${escapeHtml(studentId)}">보관 해제</button>`
                      : `<button class="secondary-button" type="button" data-archive-review-problem-id="${boardKey}" data-review-student-id="${escapeHtml(studentId)}">보관</button>`
                  }
                  <button class="secondary-button member-danger-button" type="button" data-delete-review-problem-id="${boardKey}" data-review-student-id="${escapeHtml(studentId)}">삭제</button>
                </div>
              </div>
              <div class="wrong-move-board wrong-move-board--compact" data-review-board-key="${boardKey}" aria-label="문제 원본 기준 오답 위치 미니 바둑판"></div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderReviewLifecycleBadges(summary) {
    const badges = [];
    if (summary.reviewResolved) {
      badges.push('<span class="review-lifecycle-badge is-resolved">복습 해결 완료</span>');
    }
    if (summary.reviewArchived) {
      badges.push('<span class="review-lifecycle-badge is-archived">보관됨</span>');
    }
    return badges.join("");
  }

  function handleStudentReviewListClick(event) {
    const retryButton = event.target.closest("[data-retry-problem-id]");
    if (retryButton) {
      handleRetryReviewProblem(retryButton.dataset.retryProblemId);
      return;
    }

    const archiveButton = event.target.closest("[data-archive-review-problem-id]");
    if (archiveButton) {
      handleArchiveReviewProblem(archiveButton.dataset.reviewStudentId, archiveButton.dataset.archiveReviewProblemId);
      return;
    }

    const unarchiveButton = event.target.closest("[data-unarchive-review-problem-id]");
    if (unarchiveButton) {
      handleArchiveReviewProblem(
        unarchiveButton.dataset.reviewStudentId,
        unarchiveButton.dataset.unarchiveReviewProblemId,
        false,
      );
      return;
    }

    const deleteButton = event.target.closest("[data-delete-review-problem-id]");
    if (deleteButton) {
      handleDeleteReviewProblem(deleteButton.dataset.reviewStudentId, deleteButton.dataset.deleteReviewProblemId);
    }
  }

  function handleRetryReviewProblem(problemId) {
    const problem = getProblemById(problemId);
    if (!problem) {
      window.alert("문제 정보를 찾을 수 없습니다.");
      return;
    }

    closeStudentReviewModal();
    openProblemInLibrary?.(problemId);
  }

  function handleArchiveReviewProblem(studentId, problemId, archived = true) {
    const result = setReviewArchivedForStudent({ studentUserId: studentId, problemId, archived });
    if (!result) {
      window.alert("오답 기록을 찾을 수 없습니다.");
      return;
    }

    refreshStudentReviewModal();
    refreshAcademyMemberView();
  }

  function handleDeleteReviewProblem(studentId, problemId) {
    const summary = activeReviewState.summaries.find((item) => item.problemId === problemId);
    const label = summary?.categoryProblemNumber
      ? `${summary.category} ${summary.categoryProblemNumber}번`
      : summary?.problemTitle || problemId;

    const confirmed = window.confirm(
      `${label} 오답노트를 삭제할까요?\n\n` +
        "삭제 범위:\n" +
        "- 선생님/원장 오답노트 목록에서 제거됩니다.\n" +
        "- 학생 복습 추천·미해결 복습 집계에서 제외됩니다.\n" +
        "- 카테고리 완료 수·진도율 등 학습 진행 기록은 유지됩니다.\n" +
        "- attempts의 오답 이력 데이터는 통계용으로 localStorage에 남습니다.",
    );
    if (!confirmed) {
      return;
    }

    const result = setReviewDeletedForStudent({ studentUserId: studentId, problemId });
    if (!result) {
      window.alert("오답 기록을 찾을 수 없습니다.");
      return;
    }

    refreshStudentReviewModal();
    refreshAcademyMemberView();
  }

  function findRenderedStudent(studentId) {
    return getAcademyMembersByAcademyId(getAcademyId(), { role: "student", status: "all" }).find((member) => {
      return member.userId === studentId;
    });
  }

  function renderSummaryBoards(reviewSummaries) {
    if (!window.WGo || !elements.studentReviewList) {
      return;
    }

    elements.studentReviewList.querySelectorAll("[data-review-board-key]").forEach((boardElement) => {
      const summary = reviewSummaries.find((item) => item.problemId === boardElement.dataset.reviewBoardKey);
      if (!summary) {
        return;
      }

      const problem = getProblemById(summary.problemId);
      const hasSnapshot =
        (summary.snapshotStones?.length ?? 0) > 0 || (problem?.stones?.length ?? 0) > 0;
      if (!hasSnapshot && !summary.latestWrongMove) {
        return;
      }

      renderWrongMoveBoard(boardElement, summary, summary.latestWrongMove);
    });
  }

  const REVIEW_BOARD_MARK_TYPES = {
    triangle: "TR",
    circle: "CR",
    square: "SQ",
    cross: "MA",
  };

  function renderWrongMoveBoard(element, summary, wrongMove) {
    element.innerHTML = "";
    const defaultWidth = 72;
    const reviewBoard = new WGo.Board(element, {
      size: 13,
      width: element.clientWidth || defaultWidth,
      section: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });

    const problem = getProblemById(summary.problemId);
    const boardStones =
      summary.snapshotStones?.length > 0
        ? summary.snapshotStones
        : (problem?.stones ?? []).map((stone) => ({ ...stone }));

    boardStones.forEach((stone) => {
      reviewBoard.addObject({
        x: stone.x,
        y: stone.y,
        c: stone.color === "black" ? WGo.B : WGo.W,
      });
      const markType = REVIEW_BOARD_MARK_TYPES[stone.mark];
      if (markType) {
        reviewBoard.addObject({ x: stone.x, y: stone.y, type: markType });
      }
    });

    if (wrongMove) {
      reviewBoard.addObject({ x: wrongMove.x, y: wrongMove.y, c: WGo.B });
      reviewBoard.addObject({ x: wrongMove.x, y: wrongMove.y, type: "CR" });
    }
  }

  function startReviewModalDrag(event) {
    if (!elements.studentReviewModalCard) {
      return;
    }

    event.preventDefault();
    reviewModalDragState.isDragging = true;
    reviewModalDragState.startX = event.clientX;
    reviewModalDragState.startY = event.clientY;
    reviewModalDragState.originX = reviewModalDragState.x;
    reviewModalDragState.originY = reviewModalDragState.y;
    elements.studentReviewModalCard.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", dragReviewModal);
    window.addEventListener("pointerup", stopReviewModalDrag, { once: true });
  }

  function dragReviewModal(event) {
    if (!reviewModalDragState.isDragging) {
      return;
    }

    reviewModalDragState.x = reviewModalDragState.originX + event.clientX - reviewModalDragState.startX;
    reviewModalDragState.y = reviewModalDragState.originY + event.clientY - reviewModalDragState.startY;
    applyReviewModalPosition();
  }

  function stopReviewModalDrag() {
    reviewModalDragState.isDragging = false;
    window.removeEventListener("pointermove", dragReviewModal);
  }

  function applyReviewModalPosition() {
    if (!elements.studentReviewModalCard) {
      return;
    }

    elements.studentReviewModalCard.style.transform =
      `translate(${reviewModalDragState.x}px, ${reviewModalDragState.y}px)`;
  }

  function getProgressStatusLabel(status) {
    const labels = {
      [PROGRESS_STATUS.notStarted]: "NOT_STARTED",
      [PROGRESS_STATUS.inProgress]: "IN_PROGRESS",
      [PROGRESS_STATUS.solved]: "SOLVED",
    };

    return labels[status] ?? status;
  }

  return {
    bindAcademyMemberEvents,
    renderAcademyMembers,
    renderAcademyStudents,
    renderTeacherManagement,
    renderStudentAccounts,
    refreshAcademyMemberView,
  };
}
