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

export function canManageProblems(user) {
  return normalizeRole(user?.role) === ROLES.admin;
}

export function canManageCategories(user) {
  return canManageProblems(user);
}

export function canManageAcademy(user) {
  return [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user?.role));
}

/** 학원관리 메인 메뉴(학원관리 화면) 진입 */
export function canViewAcademyMenu(user) {
  return [ROLES.admin, ROLES.academyOwner, ROLES.teacher].includes(normalizeRole(user?.role));
}

/** 학원관리 하위 탭: invites / teachers 는 학원장·관리자만 */
export function canViewAcademySubmenu(user, section) {
  const role = normalizeRole(user?.role);
  if (section === "invites" || section === "teachers") {
    return [ROLES.admin, ROLES.academyOwner].includes(role);
  }
  if (section === "accounts" || section === "students") {
    return [ROLES.admin, ROLES.academyOwner, ROLES.teacher].includes(role);
  }
  return canViewAcademyMenu(user);
}

export function canUsePrintBuilder(user) {
  return [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user?.role));
}

export function canManageInviteCodes(user) {
  return canManageAcademy(user);
}

export function canManageStudents(user) {
  return [ROLES.admin, ROLES.academyOwner, ROLES.teacher].includes(normalizeRole(user?.role));
}

export function canAssignStudentTeacher(user) {
  return canManageAcademy(user);
}

export function canViewAllAcademyStudents(user) {
  return canManageAcademy(user);
}

export function canResetMemberPassword(user) {
  return [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user?.role));
}

export function canManageMemberLifecycle(user) {
  return [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user?.role));
}

export function canManageAttendance(user) {
  return [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user?.role));
}

export function canViewReviews(user) {
  return [ROLES.admin, ROLES.academyOwner, ROLES.teacher].includes(normalizeRole(user?.role));
}

export function canViewPayments(user) {
  return [ROLES.admin, ROLES.academyOwner].includes(normalizeRole(user?.role));
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
