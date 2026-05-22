import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugError,
  debugFetch,
  debugLog,
  debugSync,
  debugWarn,
} from "../bootstrap/debug-logs.js";
import { normalizeRole, ROLES } from "../permissions/permission-service.js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";
import {
  normalizeAcademyMemberRole,
  readAcademyMembers,
  saveAcademyMembers,
} from "./academy-service.js";

const ACADEMY = DEBUG_CHANNELS.academy;
const SYNC = DEBUG_CHANNELS.sync;

export const SUPABASE_ACADEMY_MEMBERS_TABLE = "academy_members";

function rowToMember(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    academyId: row.academy_id,
    academyName: row.academy_name ?? "",
    userId: row.user_id,
    username: row.username ?? "",
    name: row.name ?? "",
    role: row.role,
    assignedTeacherId: row.assigned_teacher_id ?? null,
    inviteCode: row.invite_code ?? "",
    invitedBy: row.invited_by ?? "",
    joinedAt: row.joined_at,
    status: row.status ?? "active",
  };
}

function memberToRow(member) {
  return {
    id: member.id,
    academy_id: member.academyId,
    academy_name: member.academyName ?? "",
    user_id: member.userId,
    username: member.username ?? "",
    name: member.name ?? "",
    role: member.role,
    assigned_teacher_id: member.assignedTeacherId ?? null,
    invite_code: member.inviteCode ?? "",
    invited_by: member.invitedBy ?? "",
    status: member.status ?? "active",
    joined_at: member.joinedAt ?? new Date().toISOString(),
  };
}

export async function fetchAcademyMemberByUserId(userId) {
  if (!userId || !isSupabaseConfigured()) {
    return null;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_MEMBERS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const member = rowToMember(data);
  mergeMembersIntoLocalCache([member]);
  return member;
}

export async function repairAcademyMemberScope() {
  if (!isSupabaseConfigured()) {
    return { ok: true, source: "localStorage", fixedMembers: 0, fixedInviteCodes: 0 };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("repair_academy_member_scope");

  if (error) {
    debugWarn(ACADEMY, "repair academy scope failed", {
      source: DEBUG_SOURCES.supabase,
      message: error.message,
    });
    return { ok: false, message: error.message };
  }

  const fixedMembers = Number(data?.fixedMembers ?? 0);
  const fixedInviteCodes = Number(data?.fixedInviteCodes ?? 0);

  debugLog(ACADEMY, "repair academy scope", {
    source: DEBUG_SOURCES.supabase,
    ownerId: data?.ownerId ?? null,
    fixedMembers,
    fixedInviteCodes,
  });

  return {
    ok: true,
    source: "supabase",
    fixedMembers,
    fixedInviteCodes,
    ownerId: data?.ownerId ?? null,
  };
}

/** 선생님/학생: 본인 row의 academy_id 를 invited_by(학원장 uid) 로 맞춤 */
export async function repairMyAcademyMemberScope() {
  if (!isSupabaseConfigured()) {
    return { ok: true, source: "localStorage", fixed: false };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("repair_my_academy_member_scope");

  if (error) {
    debugWarn(ACADEMY, "repair my academy scope failed", {
      source: DEBUG_SOURCES.supabase,
      message: error.message,
    });
    return { ok: false, message: error.message };
  }

  const fixed = Boolean(data?.fixed);
  if (fixed) {
    debugLog(ACADEMY, "repair my academy scope", {
      source: DEBUG_SOURCES.supabase,
      academyId: data?.academyId ?? null,
      invitedBy: data?.invitedBy ?? null,
    });
  }

  return {
    ok: true,
    source: "supabase",
    fixed,
    academyId: data?.academyId ?? null,
    invitedBy: data?.invitedBy ?? null,
  };
}

export async function fetchAcademyMembersFromSupabase({ academyId, academyIds, user } = {}) {
  const beforeCount = readAcademyMembers().length;
  const scopeIds = [
    ...(Array.isArray(academyIds) ? academyIds : []),
    ...(academyId ? [academyId] : []),
  ]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const uniqueScopeIds = [...new Set(scopeIds)];
  const scopeLabel = uniqueScopeIds.length ? uniqueScopeIds.join(",") : "all";

  if (!isSupabaseConfigured()) {
    const members = uniqueScopeIds.length
      ? readAcademyMembers().filter((member) =>
          uniqueScopeIds.includes(String(member.academyId ?? "").trim()),
        )
      : readAcademyMembers();
    debugFetch(ACADEMY, "members fetch skipped", {
      source: DEBUG_SOURCES.localCache,
      academyId: scopeLabel,
      before: beforeCount,
      after: members.length,
    });
    return { ok: true, source: "localStorage", members };
  }

  debugFetch(ACADEMY, "members fetch start", {
    source: DEBUG_SOURCES.supabase,
    academyId: scopeLabel,
    before: beforeCount,
  });

  const client = getSupabaseClient();
  let query = client.from(SUPABASE_ACADEMY_MEMBERS_TABLE).select("*").order("joined_at", {
    ascending: false,
  });

  if (uniqueScopeIds.length === 1) {
    query = query.eq("academy_id", uniqueScopeIds[0]);
  } else if (uniqueScopeIds.length > 1) {
    query = query.in("academy_id", uniqueScopeIds);
  }

  const { data, error } = await query;

  if (error) {
    const localMembers = uniqueScopeIds.length
      ? readAcademyMembers().filter((member) =>
          uniqueScopeIds.includes(String(member.academyId ?? "").trim()),
        )
      : readAcademyMembers();
    console.error("[academy] academy_members fetch failed", {
      academyId: scopeLabel,
      status: error.code ?? null,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    debugFetch(ACADEMY, "members fetch failed", {
      source: DEBUG_SOURCES.fallback,
      academyId: scopeLabel,
      before: beforeCount,
      after: localMembers.length,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    return { ok: false, source: "localStorage", members: localMembers, message: error.message };
  }

  const members = (data ?? []).map(rowToMember);
  const userRole = user ? normalizeRole(user.role ?? user.userType) : "";

  if (uniqueScopeIds.length === 1) {
    const scopeKey = uniqueScopeIds[0];
    const incomingStudents = members.filter(
      (member) => normalizeAcademyMemberRole(member.role) === "student",
    );
    const previousSlice = readAcademyMembers().filter(
      (member) => String(member.academyId ?? "").trim() === scopeKey,
    );
    const hadStudents = previousSlice.some(
      (member) => normalizeAcademyMemberRole(member.role) === "student",
    );

    if (userRole === ROLES.teacher && hadStudents && incomingStudents.length === 0) {
      debugWarn(ACADEMY, "teacher fetch returned no students — preserving cached slice (check RLS)", {
        source: DEBUG_SOURCES.fallback,
        scopeKey,
        remoteCount: members.length,
        cachedStudents: previousSlice.filter(
          (member) => normalizeAcademyMemberRole(member.role) === "student",
        ).length,
      });
      mergeMembersIntoLocalCache(members);
    } else {
      syncAcademyMembersCache(scopeKey, members);
    }
  } else if (uniqueScopeIds.length > 1) {
    uniqueScopeIds.forEach((scopeId) => {
      const slice = members.filter((member) => String(member.academyId ?? "").trim() === scopeId);
      syncAcademyMembersCache(scopeId, slice);
    });
  } else {
    saveAcademyMembers(members);
  }

  const afterCount = readAcademyMembers().length;
  debugFetch(ACADEMY, "members fetched", {
    source: DEBUG_SOURCES.supabase,
    academyId: scopeLabel,
    before: beforeCount,
    after: afterCount,
    remoteCount: members.length,
  });

  return { ok: true, source: "supabase", members };
}

/** 선생님 담당 학생 — assigned_teacher_id 가 auth uid / member id 어느 쪽이든 조회 */
export async function fetchStudentsAssignedToTeacher({ academyId, authUserId, memberId } = {}) {
  const refs = [
    ...new Set(
      [authUserId, memberId]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ];

  if (!refs.length) {
    return { ok: true, source: "skip", members: [] };
  }

  if (!isSupabaseConfigured()) {
    const local = readAcademyMembers().filter(
      (member) =>
        normalizeAcademyMemberRole(member.role) === "student" &&
        refs.includes(String(member.assignedTeacherId ?? "").trim()) &&
        (!academyId || String(member.academyId ?? "").trim() === String(academyId).trim()),
    );
    return { ok: true, source: "localStorage", members: local };
  }

  const client = getSupabaseClient();
  let query = client
    .from(SUPABASE_ACADEMY_MEMBERS_TABLE)
    .select("*")
    .eq("role", "student")
    .in("assigned_teacher_id", refs);

  const scopeKey = String(academyId ?? "").trim();
  if (scopeKey) {
    query = query.eq("academy_id", scopeKey);
  }

  const { data, error } = await query;

  if (error) {
    debugWarn(ACADEMY, "assigned students fetch failed", {
      source: DEBUG_SOURCES.supabase,
      refs,
      academyId: scopeKey || null,
      message: error.message,
    });
    return { ok: false, message: error.message, members: [] };
  }

  const members = (data ?? []).map(rowToMember);
  debugFetch(ACADEMY, "assigned students fetched", {
    source: DEBUG_SOURCES.supabase,
    refs,
    academyId: scopeKey || null,
    count: members.length,
  });

  return { ok: true, source: "supabase", members };
}

function mergeMembersIntoLocalCache(incomingMembers) {
  if (!incomingMembers.length) {
    return;
  }

  const byId = new Map(readAcademyMembers().map((member) => [member.id, member]));
  incomingMembers.forEach((member) => {
    byId.set(member.id, member);
  });
  saveAcademyMembers([...byId.values()]);
}

function summarizeTeachers(members, scopeKey) {
  return members
    .filter((member) => String(member.role ?? "").toLowerCase() === "teacher")
    .map((member) => ({
      userId: member.userId,
      academyId: member.academyId,
      status: member.status,
      inScope: !scopeKey || String(member.academyId ?? "").trim() === scopeKey,
    }));
}

/** 학원 단위 목록 동기화 — 삭제 후 유령 멤버가 남지 않도록 해당 academy 슬라이스를 교체 */
export function syncAcademyMembersCache(academyId, incomingMembers) {
  const beforeAll = readAcademyMembers();
  const beforeCount = beforeAll.length;

  if (!academyId) {
    saveAcademyMembers(incomingMembers);
    debugSync(SYNC, "members cache replace (all academies)", {
      source: DEBUG_SOURCES.supabase,
      before: beforeCount,
      after: incomingMembers.length,
    });
    return incomingMembers;
  }

  const scopeKey = String(academyId ?? "").trim();
  const previousSlice = beforeAll.filter(
    (member) => String(member.academyId ?? "").trim() === scopeKey,
  );
  const others = beforeAll.filter((member) => String(member.academyId ?? "").trim() !== scopeKey);
  const nextMembers = [...others, ...incomingMembers];
  saveAcademyMembers(nextMembers);

  const removedFromSlice = previousSlice.filter(
    (prev) => !incomingMembers.some((next) => next.userId === prev.userId),
  );
  const incomingTeacherRows = summarizeTeachers(incomingMembers, scopeKey);
  const removedTeacherRows = summarizeTeachers(removedFromSlice, scopeKey);

  debugSync(SYNC, "cache overwrite details", {
    source: DEBUG_SOURCES.supabase,
    academyId: scopeKey,
    before: beforeCount,
    after: nextMembers.length,
    sliceBefore: previousSlice.length,
    sliceIncoming: incomingMembers.length,
    sliceAfter: incomingMembers.length,
    removedCount: removedFromSlice.length,
    removedTeachers: removedTeacherRows,
    incomingTeachers: incomingTeacherRows,
    teachersBeforeSlice: summarizeTeachers(previousSlice, scopeKey).length,
    teachersAfterSlice: incomingTeacherRows.length,
  });

  if (removedTeacherRows.length > 0 && incomingTeacherRows.length === 0) {
    debugWarn(SYNC, "teachers removed from cache slice with no incoming teachers", {
      source: DEBUG_SOURCES.fallback,
      academyId: scopeKey,
      removedTeachers: removedTeacherRows,
    });
  }

  return nextMembers;
}

export async function insertAcademyMemberToSupabase(member) {
  mergeMembersIntoLocalCache([member]);

  if (!isSupabaseConfigured()) {
    debugWarn(ACADEMY, "member insert localStorage-only", {
      source: DEBUG_SOURCES.localCache,
      userId: member.userId,
      academyId: member.academyId,
    });
    return { ok: true, source: "localStorage", member };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_MEMBERS_TABLE)
    .upsert(memberToRow(member), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    debugFetch(ACADEMY, "member insert failed", {
      source: DEBUG_SOURCES.supabase,
      userId: member.userId,
      message: error.message,
    });
    return { ok: false, message: error.message, member };
  }

  const savedMember = rowToMember(data);
  mergeMembersIntoLocalCache([savedMember]);
  debugLog(ACADEMY, "member insert success", {
    source: DEBUG_SOURCES.supabase,
    userId: savedMember.userId,
    academyId: savedMember.academyId,
    inviteCode: savedMember.inviteCode || null,
  });
  return { ok: true, source: "supabase", member: savedMember };
}

export async function deleteAcademyMemberFromSupabase({ id, academyId, userId }) {
  if (!isSupabaseConfigured()) {
    return { ok: true, source: "localStorage" };
  }

  const client = getSupabaseClient();
  let query = client.from(SUPABASE_ACADEMY_MEMBERS_TABLE).delete();

  if (id) {
    query = query.eq("id", id);
  } else if (academyId && userId) {
    query = query.eq("academy_id", academyId).eq("user_id", userId);
  } else {
    return { ok: false, message: "삭제할 멤버 정보가 없습니다." };
  }

  const { error } = await query;
  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, source: "supabase" };
}

export async function updateAcademyMemberInSupabase(member) {
  mergeMembersIntoLocalCache([member]);

  const row = memberToRow(member);
  debugLog(ACADEMY, "member update request", {
    source: DEBUG_SOURCES.supabase,
    memberId: member.id,
    academyId: row.academy_id,
    userId: row.user_id,
    role: row.role,
    assignedTeacherId: row.assigned_teacher_id ?? null,
    status: row.status,
  });

  if (!isSupabaseConfigured()) {
    debugLog(ACADEMY, "member update localStorage-only", {
      source: DEBUG_SOURCES.localCache,
      memberId: member.id,
    });
    return { ok: true, source: "localStorage", member };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_MEMBERS_TABLE)
    .update(row)
    .eq("id", member.id)
    .select("*")
    .single();

  if (error) {
    console.error("[academy] academy_members update failed", {
      memberId: member.id,
      academyId: row.academy_id,
      userId: row.user_id,
      status: row.status,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    debugError(ACADEMY, "member update failed", {
      source: DEBUG_SOURCES.supabase,
      memberId: member.id,
      message: error.message,
      details: error.details ?? null,
      assignedTeacherId: row.assigned_teacher_id ?? null,
    });
    return { ok: false, message: error.message };
  }

  const savedMember = rowToMember(data);
  mergeMembersIntoLocalCache([savedMember]);
  debugLog(ACADEMY, "member update success", {
    source: DEBUG_SOURCES.supabase,
    memberId: savedMember.id,
    assignedTeacherId: savedMember.assignedTeacherId ?? null,
  });
  return { ok: true, source: "supabase", member: savedMember };
}
