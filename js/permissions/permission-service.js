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
  const normalizedRole = String(role ?? "").trim();
  return ROLE_ALIASES[normalizedRole] ?? normalizedRole;
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
