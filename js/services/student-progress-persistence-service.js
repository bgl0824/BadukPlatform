import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugFetch,
  debugSync,
  debugWarn,
} from "../bootstrap/debug-logs.js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

const PROGRESS = DEBUG_CHANNELS.progress;

export const SUPABASE_STUDENT_PROGRESS_TABLE = "student_progress";

function isRemoteProgressUserId(userId) {
  return Boolean(userId) && !String(userId).startsWith("local-");
}

function progressUpdatedAt(progress) {
  return new Date(progress?.updatedAt ?? progress?.solvedAt ?? progress?.createdAt ?? 0).getTime();
}

function rowToProgress(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    academyId: row.academy_id ?? null,
    problemId: row.problem_id,
    problemTitle: row.problem_title ?? "",
    category: row.category ?? "",
    status: row.status ?? "IN_PROGRESS",
    solved: Boolean(row.solved),
    wrongCount: Number(row.wrong_count ?? 0),
    wrongMoves: Array.isArray(row.wrong_moves) ? row.wrong_moves : [],
    solvedAt: row.solved_at ?? null,
    attempts: Array.isArray(row.attempts) ? row.attempts : [],
    reviewResolved: Boolean(row.review_resolved),
    reviewCompletedAt: row.review_completed_at ?? null,
    reviewArchived: Boolean(row.review_archived),
    reviewArchivedAt: row.review_archived_at ?? null,
    reviewDeleted: Boolean(row.review_deleted),
    reviewDeletedAt: row.review_deleted_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function progressToRow(progress) {
  return {
    id: progress.id,
    user_id: progress.userId,
    academy_id: progress.academyId ?? null,
    problem_id: progress.problemId,
    problem_title: progress.problemTitle ?? "",
    category: progress.category ?? "",
    status: progress.status ?? "IN_PROGRESS",
    solved: Boolean(progress.solved),
    wrong_count: Number(progress.wrongCount ?? 0),
    wrong_moves: progress.wrongMoves ?? [],
    solved_at: progress.solvedAt ?? null,
    attempts: progress.attempts ?? [],
    review_resolved: Boolean(progress.reviewResolved),
    review_completed_at: progress.reviewCompletedAt ?? null,
    review_archived: Boolean(progress.reviewArchived),
    review_archived_at: progress.reviewArchivedAt ?? null,
    review_deleted: Boolean(progress.reviewDeleted),
    review_deleted_at: progress.reviewDeletedAt ?? null,
    created_at: progress.createdAt ?? new Date().toISOString(),
    updated_at: progress.updatedAt ?? new Date().toISOString(),
  };
}

export function mergeProgressRecords(remoteList, localList) {
  const mergedByProblemId = new Map();

  remoteList.forEach((progress) => {
    if (progress?.problemId) {
      mergedByProblemId.set(progress.problemId, progress);
    }
  });

  localList.forEach((progress) => {
    if (!progress?.problemId) {
      return;
    }

    const existing = mergedByProblemId.get(progress.problemId);
    if (!existing || progressUpdatedAt(progress) >= progressUpdatedAt(existing)) {
      mergedByProblemId.set(progress.problemId, progress);
    }
  });

  return [...mergedByProblemId.values()].sort(
    (left, right) => progressUpdatedAt(right) - progressUpdatedAt(left),
  );
}

export async function fetchStudentProgressFromSupabase(userId) {
  if (!isSupabaseConfigured() || !isRemoteProgressUserId(userId)) {
    return { ok: false, source: DEBUG_SOURCES.localCache, progress: [] };
  }

  debugFetch(PROGRESS, "fetch start", { source: DEBUG_SOURCES.supabase, userId });

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_STUDENT_PROGRESS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    debugWarn(PROGRESS, "fetch failed", {
      source: DEBUG_SOURCES.fallback,
      userId,
      message: error.message,
    });
    return { ok: false, progress: [], message: error.message };
  }

  const progress = (data ?? []).map(rowToProgress).filter(Boolean);
  debugFetch(PROGRESS, "fetch complete", {
    source: DEBUG_SOURCES.supabase,
    userId,
    count: progress.length,
  });

  return { ok: true, source: DEBUG_SOURCES.supabase, progress };
}

export async function upsertStudentProgressToSupabase(progress) {
  if (!isSupabaseConfigured() || !progress?.userId || !isRemoteProgressUserId(progress.userId)) {
    return { ok: true, source: DEBUG_SOURCES.localCache, skipped: true };
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_STUDENT_PROGRESS_TABLE)
    .upsert(progressToRow(progress), { onConflict: "id" });

  if (error) {
    debugWarn(PROGRESS, "upsert failed", {
      source: DEBUG_SOURCES.supabase,
      problemId: progress.problemId,
      message: error.message,
    });
    return { ok: false, message: error.message };
  }

  return { ok: true, source: DEBUG_SOURCES.supabase };
}

export async function upsertStudentProgressBatchToSupabase(progressList) {
  if (!isSupabaseConfigured() || !progressList?.length) {
    return { ok: true, source: DEBUG_SOURCES.localCache, skipped: true };
  }

  const rows = progressList
    .filter((progress) => isRemoteProgressUserId(progress?.userId))
    .map(progressToRow);

  if (!rows.length) {
    return { ok: true, source: DEBUG_SOURCES.localCache, skipped: true };
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_STUDENT_PROGRESS_TABLE)
    .upsert(rows, { onConflict: "id" });

  if (error) {
    debugWarn(PROGRESS, "batch upsert failed", {
      source: DEBUG_SOURCES.supabase,
      count: rows.length,
      message: error.message,
    });
    return { ok: false, message: error.message };
  }

  debugSync(PROGRESS, "batch upsert complete", {
    source: DEBUG_SOURCES.supabase,
    count: rows.length,
  });

  return { ok: true, source: DEBUG_SOURCES.supabase, count: rows.length };
}

export async function deleteStudentProgressForUserInSupabase(userId) {
  if (!isSupabaseConfigured() || !isRemoteProgressUserId(userId)) {
    return { ok: true, skipped: true };
  }

  const client = getSupabaseClient();
  const { error } = await client.from(SUPABASE_STUDENT_PROGRESS_TABLE).delete().eq("user_id", userId);

  if (error) {
    debugWarn(PROGRESS, "delete by user failed", { userId, message: error.message });
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
