const INVITE_CODES_STORAGE_KEY = "BADUK_ACADEMY_INVITE_CODES";
const ACADEMY_MEMBERS_STORAGE_KEY = "BADUK_ACADEMY_MEMBERS";

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

export function createAcademyMember({ user, invite }) {
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
  const academyMembers = readAcademyMembers().filter((member) => {
    return !(member.academyId === nextMember.academyId && member.userId === nextMember.userId);
  });

  saveAcademyMembers([nextMember, ...academyMembers]);
  return nextMember;
}

export function getAcademyMembersByAcademyId(academyId, options = {}) {
  const statusFilter = options.status ?? MEMBER_STATUS.active;

  return readAcademyMembers().filter((member) => {
    const matchesAcademy = member.academyId === academyId;
    const memberStatus = normalizeMemberStatus(member.status);
    const matchesStatus =
      statusFilter === "all" ? true : memberStatus === normalizeMemberStatus(statusFilter);
    const matchesRole = options.role ? member.role === options.role : true;
    const matchesTeacher =
      options.assignedTeacherId === undefined
        ? true
        : member.assignedTeacherId === options.assignedTeacherId;
    return matchesAcademy && matchesStatus && matchesRole && matchesTeacher;
  });
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

export function assignStudentTeacher({ academyId, studentUserId, teacherUserId = null }) {
  if (!academyId || !studentUserId) {
    return null;
  }

  const academyMembers = readAcademyMembers();
  const studentIndex = academyMembers.findIndex((member) => {
    return (
      member.academyId === academyId &&
      member.userId === studentUserId &&
      member.role === "student"
    );
  });

  if (studentIndex === -1) {
    return null;
  }

  if (teacherUserId) {
    const hasTeacher = academyMembers.some((member) => {
      return (
        member.academyId === academyId &&
        member.userId === teacherUserId &&
        member.role === "teacher" &&
        isActiveMember(member)
      );
    });

    if (!hasTeacher) {
      return null;
    }
  }

  if (!isActiveMember(academyMembers[studentIndex])) {
    return null;
  }

  const nextMember = {
    ...academyMembers[studentIndex],
    assignedTeacherId: teacherUserId || null,
  };
  const nextMembers = [...academyMembers];
  nextMembers[studentIndex] = nextMember;
  saveAcademyMembers(nextMembers);
  return nextMember;
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
