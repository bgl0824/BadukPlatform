import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugError,
  debugLog,
  debugWarn,
} from "../bootstrap/debug-logs.js";

const ACADEMY = DEBUG_CHANNELS.academy;
import { normalizeRole, ROLES } from "../permissions/permission-service.js";

const INVITE_CODES_STORAGE_KEY = "BADUK_ACADEMY_INVITE_CODES";
const ACADEMY_MEMBERS_STORAGE_KEY = "BADUK_ACADEMY_MEMBERS";

/** academy_members.role — auth userType/role 과 별도, DB 값은 student | teacher 만 사용 */
export function normalizeAcademyMemberRole(role) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "teacher") {
    return "teacher";
  }
  if (value === "student") {
    return "student";
  }
  return value;
}

/**
 * 학원 멤버 조회 scope — academy_members.academy_id 는 학원장 auth.users.id 와 동일해야 함.
 * 학원장 세션의 metadata.academyId 와 불일치해도 owner.id 기준으로 조회한다.
 */
export function resolveAcademyScopeId(user) {
  const scopeIds = resolveAcademyScopeIds(user);
  return scopeIds[0] ?? "";
}

/**
 * 멤버 조회에 쓸 academy_id 후보 (학원장: auth.uid + 레거시 metadata.academyId)
 */
export function resolveAcademyScopeIds(user) {
  if (!user?.id) {
    return [];
  }

  const role = normalizeRole(user.role ?? user.userType);
  const primary = (() => {
    if (role === ROLES.academyOwner) {
      return String(user.id).trim();
    }
    if (role === ROLES.admin) {
      return String(user.academyId ?? "").trim();
    }
    return String(user.academyId || user.id).trim();
  })();

  if (!primary) {
    return [];
  }

  if (role === ROLES.academyOwner) {
    const legacyMeta = String(user.academyId ?? "").trim();
    if (legacyMeta && legacyMeta !== primary) {
      return [primary, legacyMeta];
    }
  }

  return [primary];
}

export const MEMBER_STATUS = {
  active: "active",
  inactive: "inactive",
};

export function normalizeMemberStatus(status) {
  if (status === "disabled") {
    return MEMBER_STATUS.inactive;
  }

  return status === MEMBER_STATUS.inactive ? MEMBER_STATUS.inactive : MEMBER_STATUS.active;
}

export function isActiveMember(member) {
  return normalizeMemberStatus(member?.status) === MEMBER_STATUS.active;
}

export function readInviteCodes() {
  try {
    const inviteCodes = JSON.parse(localStorage.getItem(INVITE_CODES_STORAGE_KEY));
    return Array.isArray(inviteCodes) ? inviteCodes : [];
  } catch {
    return [];
  }
}

export function saveInviteCodes(inviteCodes) {
  localStorage.setItem(INVITE_CODES_STORAGE_KEY, JSON.stringify(inviteCodes));
}

/** @deprecated 동기 localStorage 조회 — signup/생성은 findInviteCodeAsync 사용 */
export function findInviteCodeLocal(code) {
  const normalizedCode = normalizeInviteCode(code);
  return readInviteCodes().find((invite) => isInviteCodeActive(invite, normalizedCode));
}

export async function findInviteCode(code) {
  const { findInviteCodeByCode } = await import("./academy-invite-service.js");
  return findInviteCodeByCode(code);
}

export function isInviteCodeActive(invite, normalizedCode = normalizeInviteCode(invite?.code ?? "")) {
  if (!invite || invite.code !== normalizedCode) {
    return false;
  }

  if (invite.status === "disabled" || invite.status === "expired") {
    return false;
  }

  if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) {
    return false;
  }

  return true;
}

export async function removeInviteCode({ code, academyId }) {
  const { deleteInviteCodeFromSupabase } = await import("./academy-invite-service.js");
  return deleteInviteCodeFromSupabase({ code, academyId });
}

export function normalizeInviteCode(code) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function readAcademyMembers() {
  try {
    const academyMembers = JSON.parse(localStorage.getItem(ACADEMY_MEMBERS_STORAGE_KEY));
    return Array.isArray(academyMembers) ? academyMembers : [];
  } catch {
    return [];
  }
}

export function saveAcademyMembers(academyMembers) {
  localStorage.setItem(ACADEMY_MEMBERS_STORAGE_KEY, JSON.stringify(academyMembers));
}

export async function createAcademyMember({ user, invite }) {
  if (!user?.id || !invite?.academyId) {
    return null;
  }

  const nextMember = {
    id: createAcademyMemberId(user.id, invite.academyId),
    academyId: invite.academyId,
    academyName: invite.academyName ?? "",
    userId: user.id,
    username: user.username,
    name: user.name || user.username,
    role: invite.role,
    assignedTeacherId: invite.role === "student" ? null : undefined,
    inviteCode: invite.code,
    invitedBy: invite.createdBy ?? "",
    joinedAt: new Date().toISOString(),
    status: "active",
  };

  const { insertAcademyMemberToSupabase } = await import("./academy-member-service.js");
  const result = await insertAcademyMemberToSupabase(nextMember);
  return result.member ?? nextMember;
}

export async function refreshAcademyMembersCache(academyId, { user } = {}) {
  const { fetchAcademyMembersFromSupabase, repairAcademyMemberScope } = await import(
    "./academy-member-service.js"
  );

  if (user && normalizeRole(user.role ?? user.userType) === ROLES.academyOwner) {
    const repairResult = await repairAcademyMemberScope();
    if (repairResult?.fixedMembers > 0 || repairResult?.fixedInviteCodes > 0) {
      const { debugLog } = await import("../bootstrap/debug-logs.js");
      debugLog("academy", "scope repaired before member fetch", {
        fixedMembers: repairResult.fixedMembers,
        fixedInviteCodes: repairResult.fixedInviteCodes,
      });
    }
  }

  const scopeId = String(academyId || (user ? resolveAcademyScopeId(user) : "") || "").trim();
  const cacheBeforeFetch = readAcademyMembers();
  const result = await fetchAcademyMembersFromSupabase(scopeId ? { academyId: scopeId } : {});
  const cacheAfterSync = readAcademyMembers();

  return {
    ...result,
    scopeId: scopeId || null,
    cacheBeforeFetchCount: cacheBeforeFetch.length,
    cacheAfterSyncCount: cacheAfterSync.length,
    cacheAfterSync,
    teachersBeforeFetch: countTeachersInMembers(cacheBeforeFetch, scopeId),
    teachersRemote: countTeachersInMembers(result.members ?? [], scopeId),
    teachersAfterSync: countTeachersInMembers(cacheAfterSync, scopeId),
  };
}

/** dropdown/목록 필터 단계별 진단 (debugLogs=true 일 때만 상세 반환) */
export function explainAcademyMemberFilter(member, scopeIds, options = {}) {
  const statusFilter = options.status ?? MEMBER_STATUS.active;
  const idSet = new Set(
    (Array.isArray(scopeIds) ? scopeIds : [scopeIds])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );
  const memberAcademyId = String(member?.academyId ?? "").trim();
  const normalizedRole = normalizeAcademyMemberRole(member?.role);
  const expectedRole = options.role ? normalizeAcademyMemberRole(options.role) : null;
  const memberStatus = normalizeMemberStatus(member?.status);
  const expectedStatus = statusFilter === "all" ? "all" : normalizeMemberStatus(statusFilter);

  const matchesAcademy = idSet.size > 0 && idSet.has(memberAcademyId);
  const matchesRole = expectedRole ? normalizedRole === expectedRole : true;
  const matchesStatus =
    statusFilter === "all" ? true : memberStatus === expectedStatus;
  const matchesAssignedTeacher =
    options.assignedTeacherId === undefined
      ? true
      : member?.assignedTeacherId === options.assignedTeacherId;

  return {
    userId: member?.userId ?? null,
    academyId: memberAcademyId || null,
    roleRaw: member?.role ?? null,
    roleNormalized: normalizedRole,
    statusRaw: member?.status ?? null,
    statusNormalized: memberStatus,
    userType: member?.userType ?? null,
    scopeIds: [...idSet],
    matchesAcademy,
    matchesRole,
    matchesStatus,
    matchesAssignedTeacher,
    included: matchesAcademy && matchesRole && matchesStatus && matchesAssignedTeacher,
    rejectReasons: [
      !idSet.size ? "empty_scope_ids" : null,
      !matchesAcademy ? "academy_scope" : null,
      !matchesRole ? "role" : null,
      !matchesStatus ? "status" : null,
      !matchesAssignedTeacher ? "assigned_teacher" : null,
    ].filter(Boolean),
  };
}

function countTeachersInMembers(members, scopeId) {
  const scopeKey = String(scopeId ?? "").trim();
  return members.filter(
    (member) =>
      normalizeAcademyMemberRole(member.role) === "teacher" &&
      (!scopeKey || String(member.academyId ?? "").trim() === scopeKey),
  ).length;
}

/** readAcademyMembers() 대신 명시적 스냅샷에서 조회 (cache race 방지) */
export function selectAcademyMembersForUser(members, currentUser, options = {}) {
  const list = Array.isArray(members) ? members : [];
  const role = normalizeRole(currentUser?.role ?? currentUser?.userType);
  const scopeIds = resolveAcademyScopeIds(currentUser);

  if (role === ROLES.admin && !currentUser?.academyId) {
    const statusFilter = options.status ?? MEMBER_STATUS.active;

    return list.filter((member) => {
      const memberStatus = normalizeMemberStatus(member.status);
      const matchesStatus =
        statusFilter === "all" ? true : memberStatus === normalizeMemberStatus(statusFilter);
      const matchesRole = options.role
        ? normalizeAcademyMemberRole(member.role) === normalizeAcademyMemberRole(options.role)
        : true;
      const matchesTeacher =
        options.assignedTeacherId === undefined
          ? true
          : member.assignedTeacherId === options.assignedTeacherId;
      return matchesStatus && matchesRole && matchesTeacher;
    });
  }

  if (!scopeIds.length) {
    if (list.some((member) => normalizeAcademyMemberRole(member.role) === "teacher")) {
      debugWarn("academy", "selectAcademyMembersForUser: empty scopeIds with teachers in snapshot", {
        source: DEBUG_SOURCES.fallback,
        userId: currentUser?.id ?? null,
        role: currentUser?.role ?? null,
        userType: currentUser?.userType ?? null,
        academyIdMeta: currentUser?.academyId ?? null,
      });
    }
    return [];
  }

  return list.filter((member) => explainAcademyMemberFilter(member, scopeIds, options).included);
}

export function getAcademyMembersByAcademyScope(scopeIds, options = {}, membersList) {
  const source = membersList ?? readAcademyMembers();
  return source.filter((member) => explainAcademyMemberFilter(member, scopeIds, options).included);
}

export function getAcademyMembersByAcademyId(academyId, options = {}) {
  return getAcademyMembersByAcademyScope(academyId, options);
}

export function findAcademyMember({ academyId, userId }) {
  return readAcademyMembers().find((member) => {
    return member.academyId === academyId && member.userId === userId;
  });
}

export function setMemberStatus({ academyId, userId, status }) {
  if (!academyId || !userId) {
    return { ok: false, message: "멤버 정보를 찾을 수 없습니다." };
  }

  const nextStatus = normalizeMemberStatus(status);
  const academyMembers = readAcademyMembers();
  const memberIndex = academyMembers.findIndex((member) => {
    return member.academyId === academyId && member.userId === userId;
  });

  if (memberIndex < 0) {
    return { ok: false, message: "멤버 정보를 찾을 수 없습니다." };
  }

  const nextMembers = [...academyMembers];
  nextMembers[memberIndex] = {
    ...nextMembers[memberIndex],
    status: nextStatus,
    statusUpdatedAt: new Date().toISOString(),
  };
  saveAcademyMembers(nextMembers);
  return { ok: true, member: nextMembers[memberIndex] };
}

export function deactivateStudentMember({ academyId, studentUserId }) {
  return setMemberStatus({
    academyId,
    userId: studentUserId,
    status: MEMBER_STATUS.inactive,
  });
}

export function activateStudentMember({ academyId, studentUserId }) {
  return setMemberStatus({
    academyId,
    userId: studentUserId,
    status: MEMBER_STATUS.active,
  });
}

export function deactivateTeacherMember({ academyId, teacherUserId, clearAssignments = true }) {
  const deactivateResult = setMemberStatus({
    academyId,
    userId: teacherUserId,
    status: MEMBER_STATUS.inactive,
  });

  if (!deactivateResult.ok) {
    return deactivateResult;
  }

  if (!clearAssignments) {
    return deactivateResult;
  }

  clearTeacherAssignments({ academyId, teacherUserId });
  return deactivateResult;
}

export function activateTeacherMember({ academyId, teacherUserId }) {
  return setMemberStatus({
    academyId,
    userId: teacherUserId,
    status: MEMBER_STATUS.active,
  });
}

export function clearTeacherAssignments({ academyId, teacherUserId }) {
  const academyMembers = readAcademyMembers();
  let changedCount = 0;
  const nextMembers = academyMembers.map((member) => {
    if (
      member.academyId !== academyId ||
      member.role !== "student" ||
      member.assignedTeacherId !== teacherUserId
    ) {
      return member;
    }

    changedCount += 1;
    return {
      ...member,
      assignedTeacherId: null,
    };
  });

  if (changedCount > 0) {
    saveAcademyMembers(nextMembers);
  }

  return { changedCount };
}

export function transferStudentsToTeacher({ academyId, fromTeacherUserId, toTeacherUserId }) {
  if (!academyId || !fromTeacherUserId || !toTeacherUserId) {
    return { ok: false, message: "이전 대상을 선택해 주세요." };
  }

  if (fromTeacherUserId === toTeacherUserId) {
    return { ok: false, message: "같은 선생님으로는 이전할 수 없습니다." };
  }

  const academyMembers = readAcademyMembers();
  const targetTeacher = academyMembers.find((member) => {
    return (
      member.academyId === academyId &&
      member.userId === toTeacherUserId &&
      member.role === "teacher" &&
      isActiveMember(member)
    );
  });

  if (!targetTeacher) {
    return { ok: false, message: "활성 선생님을 선택해 주세요." };
  }

  let transferredCount = 0;
  const nextMembers = academyMembers.map((member) => {
    if (
      member.academyId !== academyId ||
      member.role !== "student" ||
      member.assignedTeacherId !== fromTeacherUserId
    ) {
      return member;
    }

    transferredCount += 1;
    return {
      ...member,
      assignedTeacherId: toTeacherUserId,
    };
  });

  saveAcademyMembers(nextMembers);
  return { ok: true, transferredCount };
}

export function updateAcademyMemberProfile({ academyId, userId, name, username }) {
  const academyMembers = readAcademyMembers();
  const memberIndex = academyMembers.findIndex((member) => {
    return member.academyId === academyId && member.userId === userId;
  });

  if (memberIndex < 0) {
    return { ok: false, message: "멤버 정보를 찾을 수 없습니다." };
  }

  const nextMembers = [...academyMembers];
  nextMembers[memberIndex] = {
    ...nextMembers[memberIndex],
    name: String(name ?? nextMembers[memberIndex].name ?? "").trim(),
    username: String(username ?? nextMembers[memberIndex].username ?? "").trim().toLowerCase(),
    profileUpdatedAt: new Date().toISOString(),
  };
  saveAcademyMembers(nextMembers);
  return { ok: true, member: nextMembers[memberIndex] };
}

export function removeAcademyMember({ academyId, userId }) {
  const academyMembers = readAcademyMembers();
  const member = academyMembers.find((entry) => {
    return entry.academyId === academyId && entry.userId === userId;
  });

  if (!member) {
    return { ok: false, message: "멤버 정보를 찾을 수 없습니다." };
  }

  saveAcademyMembers(
    academyMembers.filter((entry) => {
      return !(entry.academyId === academyId && entry.userId === userId);
    }),
  );
  return { ok: true, member };
}

export function deleteInactiveStudentMember({ academyId, studentUserId }) {
  const member = findAcademyMember({ academyId, userId: studentUserId });
  if (!member || member.role !== "student") {
    return { ok: false, message: "학생 정보를 찾을 수 없습니다." };
  }

  if (isActiveMember(member)) {
    return { ok: false, message: "활성 학생은 바로 삭제할 수 없습니다. 먼저 비활성화해 주세요." };
  }

  return removeAcademyMember({ academyId, userId: studentUserId });
}

export async function assignStudentTeacher({ academyId, studentUserId, teacherUserId = null }) {
  const scopeId = String(academyId ?? "").trim();
  const normalizedStudentId = String(studentUserId ?? "").trim();
  const normalizedTeacherId = teacherUserId ? String(teacherUserId).trim() : null;

  const payload = {
    academyId: scopeId,
    studentUserId: normalizedStudentId,
    teacherUserId: normalizedTeacherId,
    assignedTeacherId: normalizedTeacherId,
  };

  debugLog(ACADEMY, "assign teacher start", payload);

  if (!scopeId || !normalizedStudentId) {
    debugLog(ACADEMY, "assign teacher failed", {
      ...payload,
      reason: "missing_ids",
    });
    return { ok: false, reason: "missing_ids", message: "학원 또는 학생 정보가 없습니다." };
  }

  const academyMembers = readAcademyMembers();
  const studentIndex = academyMembers.findIndex((member) => {
    return (
      String(member.academyId ?? "").trim() === scopeId &&
      String(member.userId ?? "").trim() === normalizedStudentId &&
      normalizeAcademyMemberRole(member.role) === "student"
    );
  });

  if (studentIndex === -1) {
    debugLog(ACADEMY, "assign teacher failed", {
      ...payload,
      reason: "student_not_found",
      membersInScope: academyMembers.filter((m) => String(m.academyId ?? "").trim() === scopeId).length,
    });
    return { ok: false, reason: "student_not_found", message: "학생 멤버를 찾을 수 없습니다." };
  }

  const previousMember = academyMembers[studentIndex];
  const previousAssignedTeacherId = previousMember.assignedTeacherId ?? null;

  if (normalizedTeacherId) {
    const hasTeacher = academyMembers.some((member) => {
      return (
        String(member.academyId ?? "").trim() === scopeId &&
        String(member.userId ?? "").trim() === normalizedTeacherId &&
        normalizeAcademyMemberRole(member.role) === "teacher" &&
        isActiveMember(member)
      );
    });

    if (!hasTeacher) {
      debugLog(ACADEMY, "assign teacher failed", {
        ...payload,
        reason: "teacher_not_found",
      });
      return { ok: false, reason: "teacher_not_found", message: "활성 선생님을 찾을 수 없습니다." };
    }
  }

  if (!isActiveMember(previousMember)) {
    debugLog(ACADEMY, "assign teacher failed", {
      ...payload,
      reason: "student_inactive",
    });
    return { ok: false, reason: "student_inactive", message: "비활성 학생에게는 배정할 수 없습니다." };
  }

  const nextMember = {
    ...previousMember,
    assignedTeacherId: normalizedTeacherId,
  };

  debugLog(ACADEMY, "assign teacher payload", {
    ...payload,
    memberId: nextMember.id,
    previousAssignedTeacherId,
    nextAssignedTeacherId: nextMember.assignedTeacherId,
    persistTarget: "academy_members.assigned_teacher_id",
  });

  const nextMembers = [...academyMembers];
  nextMembers[studentIndex] = nextMember;
  saveAcademyMembers(nextMembers);

  const { updateAcademyMemberInSupabase } = await import("./academy-member-service.js");
  const persistResult = await updateAcademyMemberInSupabase(nextMember);

  if (!persistResult.ok) {
    saveAcademyMembers(academyMembers);
    debugLog(ACADEMY, "assign teacher rollback", {
      ...payload,
      reason: "persist_failed",
      message: persistResult.message ?? null,
      previousAssignedTeacherId,
    });
    debugError(ACADEMY, "assign teacher failed", {
      ...payload,
      reason: "persist_failed",
      message: persistResult.message ?? null,
    });
    return {
      ok: false,
      reason: "persist_failed",
      message: persistResult.message || "담당 선생님 저장에 실패했습니다.",
      rollback: true,
      previousAssignedTeacherId,
    };
  }

  const savedMember = persistResult.member ?? nextMember;
  debugLog(ACADEMY, "assign teacher success", {
    ...payload,
    source: persistResult.source ?? DEBUG_SOURCES.supabase,
    memberId: savedMember.id,
    assignedTeacherId: savedMember.assignedTeacherId ?? null,
  });

  return {
    ok: true,
    member: savedMember,
    source: persistResult.source ?? "supabase",
    previousAssignedTeacherId,
  };
}

export function countStudentsByTeacher(students, teacherUserId) {
  if (teacherUserId === "all") {
    return students.length;
  }

  if (teacherUserId === "unassigned") {
    return students.filter((student) => !student.assignedTeacherId).length;
  }

  return students.filter((student) => student.assignedTeacherId === teacherUserId).length;
}

function createAcademyMemberId(userId, academyId) {
  return `academy-member-${academyId}-${userId}`;
}

export const academyService = {
  readInviteCodes,
  saveInviteCodes,
  findInviteCode,
  normalizeInviteCode,
  readAcademyMembers,
  saveAcademyMembers,
  createAcademyMember,
  getAcademyMembersByAcademyId,
  assignStudentTeacher,
  countStudentsByTeacher,
  MEMBER_STATUS,
  normalizeMemberStatus,
  isActiveMember,
  findAcademyMember,
  setMemberStatus,
  deactivateStudentMember,
  activateStudentMember,
  deactivateTeacherMember,
  activateTeacherMember,
  clearTeacherAssignments,
  transferStudentsToTeacher,
  updateAcademyMemberProfile,
  removeAcademyMember,
  deleteInactiveStudentMember,
};
