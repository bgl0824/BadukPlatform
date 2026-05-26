export const ROLES = {
  admin: "admin",
  academyOwner: "academy_owner",
  teacher: "teacher",
  student: "student",
};

const ROLE_ALIASES = {
  academy: ROLES.academyOwner,
  individual: ROLES.student,
  user: ROLES.student,
};

export function normalizeRole(role) {
  const normalizedRole = String(role ?? "").trim().toLowerCase();
  const aliasedRole = ROLE_ALIASES[normalizedRole] ?? normalizedRole;
  return aliasedRole === "academy_owner" ? ROLES.academyOwner : aliasedRole;
}

/** 플랫폼 운영자 — 특정 학원 scope 에 속하지 않음 */
export function isPlatformAdmin(user) {
  return normalizeRole(user?.role) === ROLES.admin;
}

/** 문제은행 열람·학습 — academy 와 무관한 공통 학습 영역 */
export function canAccessProblemLibrary(user) {
  return canSolveProblems(user);
}

/** 커리큘럼·문제 CRUD — platform admin 전용 (canManageAcademy 와 분리) */
export function canManageCurriculum(user) {
  return isPlatformAdmin(user);
}

/** @deprecated alias — canManageCurriculum 과 동일 */
export function canManageProblems(user) {
  return canManageCurriculum(user);
}

export function canManageCategories(user) {
  return canManageCurriculum(user);
}

/** 급수/단수 배정·수정 — platform admin 전용 */
export function canManageGradeLevels(user) {
  return canManageCurriculum(user);
}

/** 기출/시험 세트 CRUD — platform admin 전용 */
export function canManageExamSets(user) {
  return canManageCurriculum(user);
}

/** 게시된 시험 세트 열람·응시 (학습 흐름과 별도) */
export function canViewPublishedExamSets(user) {
  return Boolean(user?.id);
}

export function filterExamSetsForViewer(sets, user) {
  const academyId = String(user?.academyId ?? "").trim();

  return sets.filter((set) => {
    if (set.status !== "published") {
      return false;
    }

    if (set.visibility === "public") {
      return true;
    }

    if (set.visibility === "academy" && academyId && set.academyId === academyId) {
      return true;
    }

    return false;
  });
}

/** 문제은행 관리자 모드 토글 */
export function canEnterAdminMode(user) {
  return canManageCurriculum(user);
}

/** 학원장·선생·학생 운영 — academy_owner 전용 (admin 제외) */
export function canManageAcademy(user) {
  return normalizeRole(user?.role) === ROLES.academyOwner;
}

/** 학원관리 메인 메뉴 — 학원장만 */
export function canViewAcademyMenu(user) {
  return canManageAcademy(user);
}

/** 플랫폼 운영 대시보드 — admin 전용 */
export function canViewPlatformAdminMenu(user) {
  return isPlatformAdmin(user);
}

/** 학습관리 메뉴 — 학원장·선생님 (admin 제외) */
export function canViewLearningMenu(user) {
  const role = normalizeRole(user?.role);
  return [ROLES.academyOwner, ROLES.teacher].includes(role);
}

/** 학원관리 하위 탭: invites / teachers 는 학원장만 */
export function canViewAcademySubmenu(user, section) {
  const role = normalizeRole(user?.role);
  if (section === "invites" || section === "teachers") {
    return role === ROLES.academyOwner;
  }
  if (section === "accounts" || section === "students") {
    return role === ROLES.academyOwner;
  }
  return canViewAcademyMenu(user);
}

/** 문제은행 인쇄·구성 — platform admin · 학원장 (teacher/student 제외) */
export function canUsePrintBuilder(user) {
  const role = normalizeRole(user?.role);
  return role === ROLES.admin || role === ROLES.academyOwner;
}

export function canManageInviteCodes(user) {
  return canManageAcademy(user);
}

export function canManageStudents(user) {
  return [ROLES.academyOwner, ROLES.teacher].includes(normalizeRole(user?.role));
}

export function canAssignStudentTeacher(user) {
  return canManageAcademy(user);
}

export function canViewAllAcademyStudents(user) {
  return canManageAcademy(user);
}

export function canResetMemberPassword(user) {
  return normalizeRole(user?.role) === ROLES.academyOwner;
}

export function canManageMemberLifecycle(user) {
  return normalizeRole(user?.role) === ROLES.academyOwner;
}

export function canManageAttendance(user) {
  return normalizeRole(user?.role) === ROLES.academyOwner;
}

export function canViewReviews(user) {
  return [ROLES.academyOwner, ROLES.teacher].includes(normalizeRole(user?.role));
}

/** 학생 카드 UI — owner ⊇ teacher 학습 분석 권한 */
export function getStudentCardActionPermissions(user) {
  const role = normalizeRole(user?.role);
  const canViewLearningInsights = [ROLES.academyOwner, ROLES.teacher].includes(role);

  return {
    canViewDetails: canViewLearningInsights,
    canViewWrongNotes: canViewLearningInsights,
    canAssignTeacher: role === ROLES.academyOwner,
  };
}

export function canViewStudentLearningDetails(user) {
  return getStudentCardActionPermissions(user).canViewDetails;
}

export function canViewStudentWrongNotes(user) {
  return getStudentCardActionPermissions(user).canViewWrongNotes;
}

export function canViewPayments(user) {
  return normalizeRole(user?.role) === ROLES.academyOwner;
}

export function canSolveProblems(user) {
  return [
    ROLES.admin,
    ROLES.academyOwner,
    ROLES.teacher,
    ROLES.student,
  ].includes(normalizeRole(user?.role));
}

export function getDisplayUserName(user) {
  if (!user) {
    return "";
  }

  const username = String(user.username ?? "").trim();
  const name = String(user.name ?? "").trim();
  const preferUsername = [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user.role));

  if (preferUsername) {
    return username || name;
  }

  return name || username;
}
