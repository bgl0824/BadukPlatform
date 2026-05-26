import {
  normalizeExamSetStatus,
  normalizeExamSetType,
  normalizeExamSetVisibility,
} from "./exam-set-constants.js";
import { normalizeGradeLevelCode } from "./grade-level-service.js";
import { normalizeLevelGroup } from "./level-group-service.js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

export const SUPABASE_EXAM_SETS_TABLE = "exam_sets";
export const SUPABASE_EXAM_SET_QUESTIONS_TABLE = "exam_set_questions";

function rowToExamSet(row) {
  if (!row) {
    return null;
  }

  const gradeLevel = normalizeGradeLevelCode(row.grade_level);

  return {
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? "",
    gradeLevel: gradeLevel ?? null,
    type: normalizeExamSetType(row.type),
    visibility: normalizeExamSetVisibility(row.visibility),
    status: normalizeExamSetStatus(row.status),
    levelGroup: row.level_group ? normalizeLevelGroup(row.level_group) : null,
    academyId: row.academy_id ?? "",
    sortOrder: Number(row.sort_order ?? 0),
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questionCount: Number(row.question_count ?? 0),
  };
}

function rowToExamSetQuestion(row) {
  if (!row) {
    return null;
  }

  return {
    examSetId: row.exam_set_id,
    problemId: row.problem_id,
    orderIndex: Number(row.order_index ?? 0),
  };
}

function examSetToRow(examSet) {
  return {
    id: examSet.id,
    title: examSet.title,
    description: examSet.description ?? "",
    grade_level: examSet.gradeLevel ?? null,
    type: normalizeExamSetType(examSet.type),
    visibility: normalizeExamSetVisibility(examSet.visibility),
    status: normalizeExamSetStatus(examSet.status),
    level_group: examSet.levelGroup ?? null,
    academy_id: examSet.academyId || null,
    sort_order: Number.isFinite(Number(examSet.sortOrder)) ? Number(examSet.sortOrder) : 0,
    created_by: examSet.createdBy ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchExamSetsFromSupabase({ includeDrafts = false } = {}) {
  if (!isSupabaseConfigured()) {
    console.warn("[ExamSetStore] fetch skipped — Supabase not configured");
    return { ok: false, source: "local", sets: [], message: "Supabase not configured" };
  }

  const client = getSupabaseClient();
  const { data: sessionData } = await client.auth.getSession();
  console.log("[ExamSetStore] fetchExamSets start", {
    includeDrafts,
    hasSession: Boolean(sessionData?.session?.user),
    userId: sessionData?.session?.user?.id ?? null,
  });

  let query = client
    .from(SUPABASE_EXAM_SETS_TABLE)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ExamSetStore] fetchExamSets error", error);
    return { ok: false, sets: [], message: error.message };
  }

  const sets = (data ?? []).map(rowToExamSet).filter(Boolean);
  console.log("[ExamSetStore] fetchExamSets success", { count: sets.length });
  return { ok: true, source: "supabase", sets };
}

export async function fetchExamSetById(examSetId, { includeDrafts = false } = {}) {
  if (!isSupabaseConfigured() || !examSetId) {
    return { ok: false, set: null };
  }

  const client = getSupabaseClient();
  let query = client.from(SUPABASE_EXAM_SETS_TABLE).select("*").eq("id", examSetId);

  if (!includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[ExamSetStore] fetchExamSetById error", { examSetId, error });
    return { ok: false, set: null, message: error.message };
  }

  if (!data) {
    return { ok: false, set: null, message: `exam set not found: ${examSetId}` };
  }

  return { ok: true, set: rowToExamSet(data) };
}

export async function fetchExamSetQuestions(examSetId) {
  if (!isSupabaseConfigured() || !examSetId) {
    return { ok: false, questions: [] };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_EXAM_SET_QUESTIONS_TABLE)
    .select("exam_set_id, problem_id, order_index")
    .eq("exam_set_id", examSetId)
    .order("order_index", { ascending: true });

  if (error) {
    return { ok: false, questions: [], message: error.message };
  }

  const questions = (data ?? []).map(rowToExamSetQuestion).filter(Boolean);
  return { ok: true, questions };
}

export async function upsertExamSetToSupabase(examSet) {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Supabase not configured" };
  }

  const client = getSupabaseClient();
  const row = examSetToRow(examSet);
  console.log("[ExamSetStore] upsertExamSet start", {
    id: row.id,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
  });

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    console.error("[ExamSetStore] upsertExamSet session error", sessionError);
    return { ok: false, message: sessionError.message };
  }

  if (!sessionData?.session?.user) {
    const message =
      "Supabase 로그인 세션이 없습니다. admin 계정으로 Supabase Auth 로그인 후 저장하세요.";
    console.error("[ExamSetStore] upsertExamSet blocked — no session");
    return { ok: false, message };
  }

  const { data, error } = await client
    .from(SUPABASE_EXAM_SETS_TABLE)
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("[ExamSetStore] upsertExamSet error", error);
    return { ok: false, message: error.message };
  }

  if (!data) {
    const message =
      "exam_sets upsert returned no rows — RLS 또는 테이블(migration)을 확인하세요.";
    console.error("[ExamSetStore] upsertExamSet no rows", message);
    return { ok: false, message };
  }

  console.log("[ExamSetStore] upsertExamSet success", { id: data.id });
  return { ok: true, set: rowToExamSet(data) };
}

export async function deleteExamSetFromSupabase(examSetId) {
  if (!isSupabaseConfigured() || !examSetId) {
    return { ok: false };
  }

  const client = getSupabaseClient();
  const { error } = await client.from(SUPABASE_EXAM_SETS_TABLE).delete().eq("id", examSetId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function replaceExamSetQuestions(examSetId, orderedProblemIds) {
  if (!isSupabaseConfigured() || !examSetId) {
    return { ok: false, message: "Supabase not configured" };
  }

  const client = getSupabaseClient();
  const { error: deleteError } = await client
    .from(SUPABASE_EXAM_SET_QUESTIONS_TABLE)
    .delete()
    .eq("exam_set_id", examSetId);

  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  const safeIds = orderedProblemIds.filter(Boolean);
  if (safeIds.length === 0) {
    return { ok: true, count: 0 };
  }

  const rows = safeIds.map((problemId, index) => ({
    exam_set_id: examSetId,
    problem_id: problemId,
    order_index: index + 1,
  }));

  console.log("[ExamSetStore] replaceExamSetQuestions insert", {
    examSetId,
    count: safeIds.length,
  });

  const { error: insertError } = await client
    .from(SUPABASE_EXAM_SET_QUESTIONS_TABLE)
    .insert(rows);

  if (insertError) {
    console.error("[ExamSetStore] replaceExamSetQuestions insert error", insertError);
    return { ok: false, message: insertError.message };
  }

  console.log("[ExamSetStore] replaceExamSetQuestions success", { count: safeIds.length });
  return { ok: true, count: safeIds.length };
}

export async function fetchExamSetsWithQuestionCounts({ includeDrafts = false } = {}) {
  const setsResult = await fetchExamSetsFromSupabase({ includeDrafts });
  if (!setsResult.ok) {
    return setsResult;
  }

  const client = getSupabaseClient();
  const setIds = setsResult.sets.map((set) => set.id);
  if (setIds.length === 0) {
    return setsResult;
  }

  const { data, error } = await client
    .from(SUPABASE_EXAM_SET_QUESTIONS_TABLE)
    .select("exam_set_id")
    .in("exam_set_id", setIds);

  if (error) {
    return { ...setsResult, message: error.message };
  }

  const countBySet = new Map();
  (data ?? []).forEach((row) => {
    const id = row.exam_set_id;
    countBySet.set(id, (countBySet.get(id) ?? 0) + 1);
  });

  setsResult.sets = setsResult.sets.map((set) => ({
    ...set,
    questionCount: countBySet.get(set.id) ?? 0,
  }));

  return setsResult;
}
