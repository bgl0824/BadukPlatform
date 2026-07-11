export const ROLES = {
  admin: "admin",
  academyOwner: "academy_owner",
  teacher: "teacher",
  student: "student",
};

const ROLE_ALIASES = {
  academy: ROLES.academyOwner,
  owner: ROLES.academyOwner,
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
  const academyIds = [
    user?.academyId,
    user?.academy_id,
    user?.metadata?.academyId,
    user?.user_metadata?.academyId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const academyId = academyIds[0] ?? "";
  const role = normalizeRole(user?.role);
  const now = Date.now();
  const roleRaw = String(user?.role ?? "");
  console.log("[ExamSets][ViewerFilter] start", {
    roleRaw,
    roleNormalized: role,
    academyId,
    totalSets: sets.length,
  });

  const filtered = sets.filter((set) => {
    if (set.status !== "published") {
      return false;
    }

    const setRole = String(set.setRole ?? "question_bank").trim();
    if (setRole === "promotion_paper") {
      if (role === ROLES.student) {
        console.log("[ExamSets][ViewerFilter] drop promotion_paper by role", {
          id: set.id,
          title: set.title,
          roleRaw,
          roleNormalized: role,
        });
        return false;
      }

      // admin 은 기간 조건과 무관하게 항상 확인 가능해야 한다.
      if (role === ROLES.admin) {
        console.log("[ExamSets][ViewerFilter] allow promotion_paper for admin", {
          id: set.id,
          title: set.title,
        });
        return true;
      }

      if (![ROLES.academyOwner, ROLES.teacher].includes(role)) {
        console.log("[ExamSets][ViewerFilter] drop promotion_paper by unsupported role", {
          id: set.id,
          title: set.title,
          roleRaw,
          roleNormalized: role,
        });
        return false;
      }

      console.log("[ExamSets][ViewerFilter] promotion_paper raw window values", {
        id: set.id,
        title: set.title,
        availableFromRaw: set.availableFrom,
        availableUntilRaw: set.availableUntil,
      });

      const availableFrom = set.availableFrom ? new Date(set.availableFrom).getTime() : null;
      const availableUntil = set.availableUntil ? new Date(set.availableUntil).getTime() : null;
      console.log("[ExamSets][ViewerFilter] promotion_paper parsed window values", {
        id: set.id,
        title: set.title,
        availableFrom,
        availableUntil,
        now,
        nowType: typeof now,
        nowIso: new Date(now).toISOString(),
      });
      if (!Number.isFinite(availableFrom) || !Number.isFinite(availableUntil)) {
        console.log("[ExamSets][ViewerFilter] drop promotion_paper by window", {
          id: set.id,
          title: set.title,
          availableFrom: set.availableFrom,
          availableUntil: set.availableUntil,
        });
        return false;
      }

      // 기간 판정은 반드시 Date.now() 기준 epoch 비교를 사용한다.
      const inWindow = now >= availableFrom && now <= availableUntil;
      console.log("[ExamSets][ViewerFilter] promotion_paper window check", {
        id: set.id,
        title: set.title,
        status: set.status,
        visibility: set.visibility,
        availableFrom: set.availableFrom,
        availableUntil: set.availableUntil,
        now,
        availableFromEpoch: availableFrom,
        availableUntilEpoch: availableUntil,
        nowIso: new Date(now).toISOString(),
        inWindow,
      });
      return inWindow;
    }

    if (role === ROLES.student && set.type === "mock_test") {
      console.log("[ExamSets][ViewerFilter] student mock_test candidate", {
        id: set.id,
        title: set.title,
        visibility: set.visibility,
        academyId: set.academyId,
      });
    }

    if (set.visibility === "public") {
      return true;
    }

    if (set.visibility === "academy") {
      if (role === ROLES.student && !academyIds.length) {
        // 학생 계정 academyId 메타가 비어있는 경우, 1차 필터는 RLS 결과를 신뢰한다.
        return true;
      }
      if (!academyIds.length) {
        return false;
      }
      return academyIds.includes(String(set.academyId ?? "").trim());
    }

    return false;
  });

  const questionBankCount = filtered.filter((set) => String(set.setRole ?? "question_bank") === "question_bank").length;
  const promotionPaperCount = filtered.filter((set) => String(set.setRole ?? "question_bank") === "promotion_paper").length;
  console.log("[ExamSets][ViewerFilter] result", {
    roleRaw,
    roleNormalized: role,
    filteredCount: filtered.length,
    questionBankCount,
    promotionPaperCount,
  });
  return filtered;
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

/** 홈 메뉴 — 학원장·선생님·학생 */
export function canViewHomeMenu(user) {
  const role = normalizeRole(user?.role);
  return [ROLES.academyOwner, ROLES.teacher, ROLES.student].includes(role);
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
