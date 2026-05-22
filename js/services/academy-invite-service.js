import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugFetch,
  debugLog,
  debugWarn,
} from "../bootstrap/debug-logs.js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";
import {
  isInviteCodeActive,
  normalizeInviteCode,
  readInviteCodes,
  saveInviteCodes,
} from "./academy-service.js";

export const SUPABASE_ACADEMY_INVITE_TABLE = "academy_invite_codes";

const LOCAL_INVITE_MIGRATED_KEY = "BADUK_ACADEMY_INVITE_CODES_MIGRATED";
const INVITE = DEBUG_CHANNELS.invite;

export function logInvite(scope, detail = {}) {
  const payload = { table: SUPABASE_ACADEMY_INVITE_TABLE, ...detail };
  const isFallback = scope.includes("fallback") || scope.includes("miss") || detail.source === "localStorage";
  const isValidated = scope.includes("validated") || (detail.found && !isFallback);

  if (isValidated) {
    debugLog(INVITE, scope, payload);
    return;
  }

  if (isFallback || scope.endsWith(".error") || scope === "signup.lookup.miss") {
    debugWarn(INVITE, scope, { ...payload, source: detail.source ?? DEBUG_SOURCES.fallback });
    return;
  }

  debugFetch(INVITE, scope, {
    source: detail.source ?? DEBUG_SOURCES.supabase,
    ...payload,
  });
}

function rowToInvite(row) {
  if (!row) {
    return null;
  }

  return {
    code: row.code,
    role: row.role,
    academyId: row.academy_id,
    academyName: row.academy_name ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    status: row.status ?? "active",
    expiresAt: row.expires_at ?? null,
  };
}

function inviteToRow(invite) {
  return {
    code: invite.code,
    role: invite.role,
    academy_id: invite.academyId,
    academy_name: invite.academyName ?? "",
    created_by: invite.createdBy,
    status: invite.status ?? "active",
    expires_at: invite.expiresAt ?? null,
    created_at: invite.createdAt ?? new Date().toISOString(),
  };
}

function readLocalInviteCodes() {
  return readInviteCodes();
}

function writeLocalInviteCache(invites) {
  saveInviteCodes(invites);
}

export async function migrateLocalInviteCodesToSupabase() {
  if (!isSupabaseConfigured()) {
    return { ok: false, skipped: true, reason: "supabase-not-configured" };
  }

  try {
    if (window.localStorage?.getItem(LOCAL_INVITE_MIGRATED_KEY)) {
      return { ok: true, skipped: true, migratedCount: 0 };
    }
  } catch {
    return { ok: false, skipped: true };
  }

  const localInvites = readLocalInviteCodes();
  if (localInvites.length === 0) {
    try {
      window.localStorage?.setItem(LOCAL_INVITE_MIGRATED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    return { ok: true, migratedCount: 0 };
  }

  const client = getSupabaseClient();
  const rows = localInvites.map(inviteToRow);
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_INVITE_TABLE)
    .upsert(rows, { onConflict: "code", ignoreDuplicates: true })
    .select("code");

  logInvite("migrate.local", {
    localCount: localInvites.length,
    ok: !error,
    inserted: data?.length ?? 0,
    error: error?.message,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  try {
    window.localStorage?.setItem(LOCAL_INVITE_MIGRATED_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }

  return { ok: true, migratedCount: data?.length ?? 0 };
}

export async function insertInviteCodeToSupabase(invite) {
  if (!isSupabaseConfigured()) {
    logInvite("create.skip", { reason: "supabase-not-configured", code: invite?.code });
    return { ok: false, message: "Supabase 설정이 없어 가입 코드를 저장할 수 없습니다." };
  }

  const client = getSupabaseClient();
  const row = inviteToRow(invite);
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_INVITE_TABLE)
    .insert(row)
    .select("*")
    .single();

  logInvite("create.insert", {
    code: invite.code,
    academyId: invite.academyId,
    ok: !error,
    error: error?.message,
    row: error ? null : data,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const savedInvite = rowToInvite(data);
  const cached = readLocalInviteCodes().filter((item) => item.code !== savedInvite.code);
  writeLocalInviteCache([savedInvite, ...cached]);

  return { ok: true, invite: savedInvite };
}

export async function fetchInviteCodesByAcademyId(academyId) {
  if (!isSupabaseConfigured()) {
    logInvite("list.fallback", { reason: "supabase-not-configured", academyId });
    return {
      ok: true,
      source: "localStorage",
      invites: readLocalInviteCodes().filter((invite) => invite.academyId === academyId),
    };
  }

  await migrateLocalInviteCodesToSupabase();

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_INVITE_TABLE)
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });

  logInvite("list.fetch", {
    academyId,
    count: data?.length ?? 0,
    ok: !error,
    error: error?.message,
  });

  if (error) {
    return {
      ok: false,
      source: "localStorage",
      message: error.message,
      invites: readLocalInviteCodes().filter((invite) => invite.academyId === academyId),
    };
  }

  const invites = (data ?? []).map(rowToInvite);
  writeLocalInviteCache(
    mergeInviteCaches(readLocalInviteCodes(), invites),
  );

  return { ok: true, source: "supabase", invites };
}

function mergeInviteCaches(existing, incoming) {
  const byCode = new Map(existing.map((invite) => [invite.code, invite]));
  incoming.forEach((invite) => {
    byCode.set(invite.code, invite);
  });
  return [...byCode.values()].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}

export async function findInviteCodeByCode(code) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) {
    return null;
  }

  if (!isSupabaseConfigured()) {
    const localInvite = readLocalInviteCodes().find((invite) =>
      isInviteCodeActive(invite, normalizedCode),
    );
    logInvite("signup.lookup", {
      code: normalizedCode,
      source: "localStorage",
      found: Boolean(localInvite),
    });
    return localInvite ?? null;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_ACADEMY_INVITE_TABLE)
    .select("*")
    .eq("code", normalizedCode)
    .maybeSingle();

  logInvite("signup.lookup", {
    code: normalizedCode,
    source: "supabase",
    found: Boolean(data),
    ok: !error,
    error: error?.message,
  });

  if (error) {
    const fallbackInvite = readLocalInviteCodes().find((invite) =>
      isInviteCodeActive(invite, normalizedCode),
    );
    if (fallbackInvite) {
      logInvite("signup.lookup.fallback", { code: normalizedCode, source: "localStorage" });
      return fallbackInvite;
    }
    logInvite("signup.lookup.miss", { code: normalizedCode, error: error.message });
    return null;
  }

  if (!data) {
    const fallbackInvite = readLocalInviteCodes().find((invite) =>
      isInviteCodeActive(invite, normalizedCode),
    );
    if (fallbackInvite) {
      logInvite("signup.lookup.fallback", { code: normalizedCode, source: "localStorage" });
      return fallbackInvite;
    }
    logInvite("signup.lookup.miss", { code: normalizedCode });
    return null;
  }

  const invite = rowToInvite(data);
  if (isInviteCodeActive(invite, normalizedCode)) {
    logInvite("invite code validated", {
      code: normalizedCode,
      source: DEBUG_SOURCES.supabase,
      academyId: invite.academyId,
      role: invite.role,
    });
    return invite;
  }

  logInvite("signup.lookup.inactive", { code: normalizedCode, source: DEBUG_SOURCES.supabase });
  return null;
}

export async function deleteInviteCodeFromSupabase({ code, academyId }) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode || !academyId) {
    return { ok: false, message: "초대코드를 찾을 수 없습니다." };
  }

  if (isSupabaseConfigured()) {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from(SUPABASE_ACADEMY_INVITE_TABLE)
      .delete()
      .eq("code", normalizedCode)
      .eq("academy_id", academyId)
      .select("*");

    logInvite("delete", {
      code: normalizedCode,
      academyId,
      ok: !error,
      deleted: data?.length ?? 0,
      error: error?.message,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    if (!data?.length) {
      return { ok: false, message: "초대코드를 찾을 수 없습니다." };
    }
  }

  const inviteCodes = readLocalInviteCodes();
  const targetIndex = inviteCodes.findIndex(
    (invite) => invite.code === normalizedCode && invite.academyId === academyId,
  );
  if (targetIndex >= 0) {
    const [removed] = inviteCodes.splice(targetIndex, 1);
    writeLocalInviteCache(inviteCodes);
    return { ok: true, removed };
  }

  return { ok: false, message: "초대코드를 찾을 수 없습니다." };
}
