import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugError,
  debugLog,
  debugRpc,
  debugSync,
} from "../bootstrap/debug-logs.js";
import {
  findAcademyMember,
  readAcademyMembers,
  refreshAcademyMembersCache,
  removeAcademyMember,
} from "./academy-service.js";
import { deleteAcademyMemberFromSupabase } from "./academy-member-service.js";
import {
  deleteUserById,
  formatSupabaseAuthError,
  isSupabaseConfigured,
} from "./auth-service.js";
import { getSupabaseClient } from "./supabase-client.js";
import { deleteCategoryReviewOffersByUserId } from "./category-review-offer-service.js";
import { deleteStudentProgressByUserId } from "./student-progress-service.js";

const USERS_STORAGE_KEY = "BADUK_AUTH_USERS";

function readLegacyAuthUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY));
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function saveLegacyAuthUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function isLocalAuthUserId(userId) {
  return !userId || String(userId).startsWith("local-");
}

export async function deleteAuthUserFromSupabase({ userId, academyId }) {
  if (!isSupabaseConfigured() || isLocalAuthUserId(userId)) {
    return { ok: true, skipped: true, source: "local" };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("delete_member_account", {
    target_user_id: userId,
    target_academy_id: academyId,
  });

  if (error) {
    debugRpc(DEBUG_CHANNELS.auth, "delete_member_account", {
      payload: { target_user_id: userId, target_academy_id: academyId },
      error,
    });
    const hint =
      error.message?.includes("Could not find the function") || error.code === "PGRST202"
        ? " Supabase SQL Editor에서 scripts/supabase-delete-member-account.sql 을 실행해 주세요."
        : "";
    return {
      ok: false,
      message: `${formatSupabaseAuthError(error.message)}${hint}`,
      error,
    };
  }

  debugRpc(DEBUG_CHANNELS.auth, "delete_member_account", {
    payload: { target_user_id: userId, target_academy_id: academyId },
  });

  return { ok: true, source: "supabase", data };
}

/**
 * 로컬 캐시 정리 (Supabase 성공/실패와 무관하게 유령 데이터 방지)
 */
export function purgeLocalMemberCaches({ userId, academyId }) {
  const progressResult = deleteStudentProgressByUserId(userId);
  const reviewOfferResult = deleteCategoryReviewOffersByUserId(userId);
  const memberResult = removeAcademyMember({ academyId, userId });

  const legacyUsers = readLegacyAuthUsers();
  const authResult = deleteUserById({ users: legacyUsers, userId });
  if (authResult.ok) {
    saveLegacyAuthUsers(authResult.users);
  }

  return {
    removedProgressCount: progressResult.removedCount,
    removedReviewOfferCount: reviewOfferResult.removedCount,
    removedMember: memberResult.ok,
    removedLegacyUser: authResult.ok,
  };
}

/**
 * 통합 삭제: Supabase(auth + academy_members) → 로컬 캐시 → hydrate
 */
export async function deleteMemberAccountFully({
  userId,
  academyId,
  member: memberInput = null,
}) {
  debugLog(DEBUG_CHANNELS.academy, "delete member account start", { userId, academyId });

  if (!userId || !academyId) {
    debugError(DEBUG_CHANNELS.academy, "delete aborted: missing ids", { userId, academyId });
    return { ok: false, message: "삭제할 계정 정보가 없습니다." };
  }

  const member =
    memberInput ??
    findAcademyMember({ academyId, userId }) ??
    readAcademyMembers().find((entry) => entry.academyId === academyId && entry.userId === userId);

  if (!member) {
    return { ok: false, message: "학원 멤버 정보를 찾을 수 없습니다." };
  }

  let supabaseResult = { ok: true, skipped: true };

  if (isSupabaseConfigured() && !isLocalAuthUserId(userId)) {
    supabaseResult = await deleteAuthUserFromSupabase({ userId, academyId });
    if (!supabaseResult.ok) {
      return supabaseResult;
    }
  } else if (isSupabaseConfigured()) {
    const memberDelete = await deleteAcademyMemberFromSupabase({
      id: member.id,
      academyId,
      userId,
    });
    if (!memberDelete.ok) {
      return memberDelete;
    }
  }

  const localCleanup = purgeLocalMemberCaches({ userId, academyId });
  const membersBeforeRefresh = readAcademyMembers().length;
  const refreshResult = await refreshAcademyMembersCache(academyId);
  const membersAfterRefresh = readAcademyMembers().length;

  debugSync(DEBUG_CHANNELS.sync, "delete member hydrate complete", {
    source: refreshResult?.source ?? DEBUG_SOURCES.supabase,
    before: membersBeforeRefresh,
    after: membersAfterRefresh,
    userId,
    academyId,
    inviteCode: member.inviteCode ?? "",
  });

  return {
    ok: true,
    userId,
    academyId,
    inviteCode: member.inviteCode ?? "",
    supabase: supabaseResult,
    localCleanup,
    refresh: refreshResult,
    message: "학생과 학습 기록이 삭제되었습니다.",
  };
}
