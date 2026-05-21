import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";
import { readAcademyMembers, saveAcademyMembers } from "./academy-service.js";

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

export async function fetchAcademyMembersFromSupabase({ academyId } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: true, source: "localStorage", members: readAcademyMembers() };
  }

  const client = getSupabaseClient();
  let query = client.from(SUPABASE_ACADEMY_MEMBERS_TABLE).select("*").order("joined_at", {
    ascending: false,
  });

  if (academyId) {
    query = query.eq("academy_id", academyId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("[AcademyMember] fetch.error", error.message);
    const localMembers = academyId
      ? readAcademyMembers().filter((member) => member.academyId === academyId)
      : readAcademyMembers();
    return { ok: false, source: "localStorage", members: localMembers, message: error.message };
  }

  const members = (data ?? []).map(rowToMember);
  mergeMembersIntoLocalCache(members);
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

export async function insertAcademyMemberToSupabase(member) {
  mergeMembersIntoLocalCache([member]);

  if (!isSupabaseConfigured()) {
    console.warn("[AcademyMember] insert.localStorage-only", { userId: member.userId });
    return { ok: true, source: "localStorage", member };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_MEMBERS_TABLE)
    .upsert(memberToRow(member), { onConflict: "id" })
    .select("*")
    .single();

  console.info("[AcademyMember] insert", {
    ok: !error,
    userId: member.userId,
    academyId: member.academyId,
    error: error?.message,
  });

  if (error) {
    return { ok: false, message: error.message, member };
  }

  const savedMember = rowToMember(data);
  mergeMembersIntoLocalCache([savedMember]);
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

  if (!isSupabaseConfigured()) {
    return { ok: true, source: "localStorage", member };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_MEMBERS_TABLE)
    .update(memberToRow(member))
    .eq("id", member.id)
    .select("*")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  const savedMember = rowToMember(data);
  mergeMembersIntoLocalCache([savedMember]);
  return { ok: true, member: savedMember };
}
