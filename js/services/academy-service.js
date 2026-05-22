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
 * academy_members.academy_id 정규화 — 레거시에 본인 auth uid 가 들어간 경우 invited_by(학원장) 로 보정.
 */
export function resolveMemberAcademyId(member, authUserId = member?.userId) {
  const academyId = String(member?.academyId ?? "").trim();
  const invitedBy = String(member?.invitedBy ?? "").trim();
  const userKey = String(authUserId ?? "").trim();

  if (invitedBy && userKey && academyId === userKey) {
    return invitedBy;
  }

  return academyId || invitedBy;
}

/**
 * 멤버 조회에 쓸 academy_id 후보 (학원장: auth.uid + 레거시 metadata.academyId)
 */
export function resolveAcademyScopeIds(user) {
  if (!user?.id) {
    return [];
  }

  const role = normalizeRole(user.role ?? user.userType);

  if (role === ROLES.admin) {
    return [];
  }

  if (role === ROLES.academyOwner) {
    const primary = String(user.id).trim();
    if (!primary) {
      return [];
    }

    const legacyMeta = String(user.academyId ?? "").trim();
    if (legacyMeta && legacyMeta !== primary) {
      return [primary, legacyMeta];
    }

    return [primary];
  }

  if (role === ROLES.teacher || role === ROLES.student) {
    const academyId = String(user.academyId ?? "").trim();
    return academyId ? [academyId] : [];
  }

  const academyId = String(user.academyId ?? "").trim();
  return academyId ? [academyId] : [];
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
  const {
    fetchAcademyMembersFromSupabase,
    fetchAcademyMemberByUserId,
    fetchStudentsAssignedToTeacher,
    repairAcademyMemberScope,
    repairMyAcademyMemberScope,
  } = await import("./academy-member-service.js");

  const userRole = user ? normalizeRole(user.role ?? user.userType) : "";

  if (userRole === ROLES.academyOwner) {
    const repairResult = await repairAcademyMemberScope();
    if (repairResult?.fixedMembers > 0 || repairResult?.fixedInviteCodes > 0) {
      const { debugLog } = await import("../bootstrap/debug-logs.js");
      debugLog("academy", "scope repaired before member fetch", {
        fixedMembers: repairResult.fixedMembers,
        fixedInviteCodes: repairResult.fixedInviteCodes,
      });
    }
  }

  if (userRole === ROLES.teacher || userRole === ROLES.student) {
    const repairSelf = await repairMyAcademyMemberScope();
    if (!repairSelf.ok) {
      debugWarn(ACADEMY, "repair my academy scope skipped", {
        source: DEBUG_SOURCES.supabase,
        message: repairSelf.message ?? null,
      });
    }
    const selfMember = await fetchAcademyMemberByUserId(user.id);
    if (selfMember) {
      const correctedAcademyId = resolveMemberAcademyId(selfMember, user.id);
      if (correctedAcademyId && correctedAcademyId !== String(user.academyId ?? "").trim()) {
        debugWarn(ACADEMY, "teacher/student scope corrected from member row", {
          source: DEBUG_SOURCES.fallback,
          userId: user.id,
          sessionAcademyId: user.academyId ?? null,
          memberAcademyId: selfMember.academyId ?? null,
          invitedBy: selfMember.invitedBy ?? null,
          correctedAcademyId,
        });
        user = { ...user, academyId: correctedAcademyId };
      }
    }
  }

  const scopeId = String(
    academyId || (user ? resolveAcademyScopeId(user) : "") || "",
  ).trim();
  const cacheBeforeFetch = readAcademyMembers();
  let result = await fetchAcademyMembersFromSupabase(
    scopeId ? { academyId: scopeId, user } : { user },
  );

  if (userRole === ROLES.teacher && scopeId) {
    const selfMember =
      (await fetchAcademyMemberByUserId(user.id)) ??
      readAcademyMembers().find((member) => String(member.userId ?? "").trim() === String(user.id).trim());
    const assignedResult = await fetchStudentsAssignedToTeacher({
      academyId: scopeId,
      authUserId: user.id,
      memberId: selfMember?.id,
    });

    if (assignedResult.ok && assignedResult.members?.length) {
      const mergedByUserId = new Map(
        (result.members ?? []).map((member) => [member.userId, member]),
      );
      assignedResult.members.forEach((member) => {
        mergedByUserId.set(member.userId, member);
      });
      const mergedMembers = [...mergedByUserId.values()];
      const { syncAcademyMembersCache } = await import("./academy-member-service.js");
      syncAcademyMembersCache(scopeId, mergedMembers);
      result = { ...result, members: mergedMembers, assignedStudentsMerged: assignedResult.members.length };
      debugLog(ACADEMY, "teacher assigned students merged into cache", {
        source: assignedResult.source ?? DEBUG_SOURCES.supabase,
        scopeId,
        assignedCount: assignedResult.members.length,
        mergedCount: mergedMembers.length,
      });
    }
  }

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

export async function setMemberStatus({ academyId, userId, status }) {
  const scopeId = String(academyId ?? "").trim();
  const targetUserId = String(userId ?? "").trim();

  if (!scopeId || !targetUserId) {
    return { ok: false, message: "멤버 정보를 찾을 수 없습니다." };
  }

  const nextStatus = normalizeMemberStatus(status);
  const academyMembers = readAcademyMembers();
  const memberIndex = academyMembers.findIndex((member) => {
    return (
      String(member.academyId ?? "").trim() === scopeId &&
      String(member.userId ?? "").trim() === targetUserId
    );
  });

  if (memberIndex < 0) {
    debugWarn(ACADEMY, "setMemberStatus member not found in cache", {
      scopeId,
      targetUserId,
      cachedCount: academyMembers.length,
    });
    return { ok: false, message: "멤버 정보를 찾을 수 없습니다." };
  }

  const previousMembers = academyMembers;
  const nextMember = {
    ...academyMembers[memberIndex],
    status: nextStatus,
  };
  const nextMembers = [...academyMembers];
  nextMembers[memberIndex] = nextMember;
  saveAcademyMembers(nextMembers);

  const { updateAcademyMemberInSupabase } = await import("./academy-member-service.js");
  const persistResult = await updateAcademyMemberInSupabase(nextMember);

  if (!persistResult.ok) {
    saveAcademyMembers(previousMembers);
    debugError(ACADEMY, "setMemberStatus persist failed", {
      scopeId,
      targetUserId,
      nextStatus,
      message: persistResult.message ?? null,
    });
    return {
      ok: false,
      message: persistResult.message || "멤버 상태 저장에 실패했습니다.",
    };
  }

  const savedMember = persistResult.member ?? nextMember;
  const syncedMembers = [...nextMembers];
  syncedMembers[memberIndex] = savedMember;
  saveAcademyMembers(syncedMembers);

  debugLog(ACADEMY, "setMemberStatus success", {
    scopeId,
    targetUserId,
    status: savedMember.status,
    source: persistResult.source ?? DEBUG_SOURCES.supabase,
  });

  return { ok: true, member: savedMember, source: persistResult.source ?? "supabase" };
}

export async function deactivateStudentMember({ academyId, studentUserId }) {
  return setMemberStatus({
    academyId,
    userId: studentUserId,
    status: MEMBER_STATUS.inactive,
  });
}

export async function activateStudentMember({ academyId, studentUserId }) {
  return setMemberStatus({
    academyId,
    userId: studentUserId,
    status: MEMBER_STATUS.active,
  });
}

export async function deactivateTeacherMember({
  academyId,
  teacherUserId,
  clearAssignments = true,
}) {
  const deactivateResult = await setMemberStatus({
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

export async function activateTeacherMember({ academyId, teacherUserId }) {
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
  let normalizedTeacherId = teacherUserId ? String(teacherUserId).trim() : null;

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

  if (normalizedTeacherId) {
    const teacherMember = academyMembers.find((member) => {
      return (
        String(member.academyId ?? "").trim() === scopeId &&
        normalizeAcademyMemberRole(member.role) === "teacher" &&
        (String(member.userId ?? "").trim() === normalizedTeacherId ||
          String(member.id ?? "").trim() === normalizedTeacherId)
      );
    });
    if (teacherMember?.userId) {
      normalizedTeacherId = String(teacherMember.userId).trim();
      payload.teacherUserId = normalizedTeacherId;
      payload.assignedTeacherId = normalizedTeacherId;
    }
  }

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

/** 담당 배정 비교용 id 집합 — auth uid, academy_members.id, 레거시 composite id */
export function buildTeacherAssignmentMatchIds(authUser, teacherMembers = [], selfMember = null) {
  const matchIds = new Set();
  const authId = String(authUser?.id ?? authUser ?? "").trim();

  if (authId) {
    matchIds.add(authId);
  }

  const member =
    selfMember ??
    teacherMembers.find((entry) => String(entry?.userId ?? "").trim() === authId);

  if (member) {
    const userId = String(member.userId ?? "").trim();
    const memberId = String(member.id ?? "").trim();
    const academyId = String(member.academyId ?? "").trim();

    if (userId) {
      matchIds.add(userId);
    }
    if (memberId) {
      matchIds.add(memberId);
    }
    if (userId && academyId) {
      matchIds.add(createAcademyMemberId(userId, academyId));
    }
  }

  return matchIds;
}

export function isStudentAssignedToTeacher(student, matchIds) {
  const assigned = String(student?.assignedTeacherId ?? "").trim();

  if (!assigned || !matchIds?.size) {
    return false;
  }

  if (matchIds.has(assigned)) {
    return true;
  }

  const legacyUserId = assigned.match(/^academy-member-[^-]+-(.+)$/);
  if (legacyUserId?.[1] && matchIds.has(legacyUserId[1])) {
    return true;
  }

  return false;
}

export function countStudentsByTeacher(students, teacherUserId, teacherMembers = []) {
  if (teacherUserId === "all") {
    return students.length;
  }

  if (teacherUserId === "unassigned") {
    return students.filter((student) => !student.assignedTeacherId).length;
  }

  const matchIds = buildTeacherAssignmentMatchIds({ id: teacherUserId }, teacherMembers);
  return students.filter((student) => isStudentAssignedToTeacher(student, matchIds)).length;
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
