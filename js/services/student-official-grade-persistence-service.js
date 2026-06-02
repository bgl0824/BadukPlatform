import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugFetch,
  debugWarn,
} from "../bootstrap/debug-logs.js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";

const OFFICIAL_GRADE = DEBUG_CHANNELS.academy;

export const SUPABASE_STUDENT_OFFICIAL_GRADES_TABLE = "student_official_grades";

export function rowToOfficialGrade(row) {
  if (!row) {
    return null;
  }

  return {
    academyId: row.academy_id,
    studentUserId: row.student_user_id,
    gradeCode: row.grade_code,
    acquiredAt: row.acquired_at,
    gradeSource: row.grade_source,
  };
}

export function officialGradeToRow(grade) {
  return {
    academy_id: grade.academyId,
    student_user_id: grade.studentUserId,
    grade_code: grade.gradeCode,
    acquired_at: grade.acquiredAt,
    grade_source: grade.gradeSource,
  };
}

export async function fetchStudentOfficialGradeFromSupabase(academyId, studentUserId) {
  if (!isSupabaseConfigured() || !academyId || !studentUserId) {
    return { ok: false, source: DEBUG_SOURCES.localCache, grade: null, skipped: true };
  }

  debugFetch(OFFICIAL_GRADE, "official grade fetch start", {
    source: DEBUG_SOURCES.supabase,
    academyId,
    studentUserId,
  });

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_STUDENT_OFFICIAL_GRADES_TABLE)
    .select("*")
    .eq("academy_id", academyId)
    .eq("student_user_id", studentUserId)
    .maybeSingle();

  if (error) {
    debugWarn(OFFICIAL_GRADE, "official grade fetch failed", {
      source: DEBUG_SOURCES.supabase,
      academyId,
      studentUserId,
      message: error.message,
    });
    return { ok: false, grade: null, message: error.message };
  }

  const grade = rowToOfficialGrade(data);
  debugFetch(OFFICIAL_GRADE, "official grade fetch complete", {
    source: DEBUG_SOURCES.supabase,
    academyId,
    studentUserId,
    found: Boolean(grade),
  });

  return { ok: true, source: DEBUG_SOURCES.supabase, grade };
}

export async function upsertStudentOfficialGradeToSupabase(grade) {
  if (!isSupabaseConfigured() || !grade?.academyId || !grade?.studentUserId) {
    return { ok: false, source: DEBUG_SOURCES.localCache, skipped: true };
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_STUDENT_OFFICIAL_GRADES_TABLE)
    .upsert(officialGradeToRow(grade), {
      onConflict: "academy_id,student_user_id",
    });

  if (error) {
    debugWarn(OFFICIAL_GRADE, "official grade upsert failed", {
      source: DEBUG_SOURCES.supabase,
      academyId: grade.academyId,
      studentUserId: grade.studentUserId,
      message: error.message,
    });
    return { ok: false, message: error.message };
  }

  return { ok: true, source: DEBUG_SOURCES.supabase };
}
