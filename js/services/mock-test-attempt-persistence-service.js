import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

const TABLE = "mock_test_attempts";

function rowToAttempt(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    examSetId: row.exam_set_id,
    studentUserId: row.student_user_id,
    studentName: row.student_name ?? "",
    academyId: row.academy_id ?? "",
    attemptedAt: row.attempted_at,
    totalQuestionCount: Number(row.total_question_count ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    accuracyRate: Number(row.accuracy_rate ?? 0),
    wrongProblemNumbers: Array.isArray(row.wrong_problem_numbers) ? row.wrong_problem_numbers : [],
    durationSeconds: Number(row.duration_seconds ?? 0),
    overtimeSeconds: Number(row.overtime_seconds ?? 0),
    timeLimitSeconds: Number(row.time_limit_seconds ?? 1200),
    createdAt: row.created_at,
  };
}

function attemptToRow(attempt) {
  return {
    exam_set_id: attempt.examSetId,
    student_user_id: attempt.studentUserId,
    student_name: attempt.studentName ?? "",
    academy_id: attempt.academyId ?? null,
    attempted_at: attempt.attemptedAt ?? new Date().toISOString(),
    total_question_count: Number(attempt.totalQuestionCount ?? 0),
    correct_count: Number(attempt.correctCount ?? 0),
    accuracy_rate: Number(attempt.accuracyRate ?? 0),
    wrong_problem_numbers: Array.isArray(attempt.wrongProblemNumbers) ? attempt.wrongProblemNumbers : [],
    duration_seconds: Number(attempt.durationSeconds ?? 0),
    overtime_seconds: Number(attempt.overtimeSeconds ?? 0),
    time_limit_seconds: Number(attempt.timeLimitSeconds ?? 1200),
  };
}

export async function insertMockTestAttemptToSupabase(attempt) {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Supabase not configured" };
  }
  const client = getSupabaseClient();
  const { data, error } = await client.from(TABLE).insert(attemptToRow(attempt)).select("*").single();
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, attempt: rowToAttempt(data) };
}

export async function fetchLatestMockTestAttemptForStudentFromSupabase({
  examSetId,
  studentUserId,
} = {}) {
  const filters = { examSetId, studentUserId };
  console.log("[mock_test_attempts] fetchLatestForStudent", filters);

  if (!isSupabaseConfigured() || !examSetId || !studentUserId) {
    return { ok: false, attempt: null, message: "invalid input" };
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("exam_set_id", examSetId)
    .eq("student_user_id", studentUserId)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[mock_test_attempts] fetchLatestForStudent failed", { ...filters, message: error.message });
    return { ok: false, attempt: null, message: error.message };
  }

  return { ok: true, attempt: rowToAttempt(data) };
}

export async function fetchMockTestAttemptsByExamSetFromSupabase({ examSetId, academyId, limit = 30 } = {}) {
  const filters = {
    examSetId,
    academyId: academyId ?? null,
    studentUserId: null,
    limit,
  };
  console.log("[mock_test_attempts] fetchByExamSet (exam set only, RLS scopes academy)", filters);

  if (!isSupabaseConfigured() || !examSetId) {
    return { ok: false, attempts: [] };
  }
  const client = getSupabaseClient();
  let query = client
    .from(TABLE)
    .select("*")
    .eq("exam_set_id", examSetId)
    .order("attempted_at", { ascending: false })
    .limit(Number(limit) || 30);
  if (academyId) {
    query = query.eq("academy_id", academyId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn("[mock_test_attempts] fetchByExamSet failed", { ...filters, message: error.message });
    return { ok: false, attempts: [], message: error.message };
  }

  const attempts = (data ?? []).map(rowToAttempt).filter(Boolean);
  console.log("[mock_test_attempts] fetchByExamSet result", {
    ...filters,
    rowCount: attempts.length,
    examSetIds: [...new Set(attempts.map((a) => a.examSetId))],
  });
  return { ok: true, attempts };
}
