import {
  formatGradeLevelLabel,
  normalizeGradeLevelCode,
} from "./grade-level-service.js";
import {
  formatOfficialGradeSourceLabel,
  normalizeOfficialGradeSource,
} from "./official-grade-source-service.js";
import {
  fetchStudentOfficialGradeFromSupabase,
  upsertStudentOfficialGradeToSupabase,
} from "./student-official-grade-persistence-service.js";
import { isSupabaseConfigured } from "./supabase-client.js";

const OFFICIAL_GRADES_STORAGE_KEY = "BADUK_STUDENT_OFFICIAL_GRADES";

function cacheKey(academyId, studentUserId) {
  return `${academyId}::${studentUserId}`;
}

function readOfficialGradesCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(OFFICIAL_GRADES_STORAGE_KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function writeOfficialGradeCache(grade) {
  const cache = readOfficialGradesCache();
  cache[cacheKey(grade.academyId, grade.studentUserId)] = grade;
  localStorage.setItem(OFFICIAL_GRADES_STORAGE_KEY, JSON.stringify(cache));
}

function readOfficialGradeFromCache(academyId, studentUserId) {
  const cache = readOfficialGradesCache();
  return cache[cacheKey(academyId, studentUserId)] ?? null;
}

export function enrichOfficialGradeRecord(grade) {
  if (!grade) {
    return null;
  }

  return {
    ...grade,
    gradeLabel: formatGradeLevelLabel(grade.gradeCode, { emptyLabel: "급수 미지정" }),
    gradeSourceLabel: formatOfficialGradeSourceLabel(grade.gradeSource),
  };
}

function normalizeAcquiredDate(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return raw;
}

export function validateOfficialGradeInput(input) {
  const gradeCode = normalizeGradeLevelCode(input?.gradeCode);
  const acquiredAt = normalizeAcquiredDate(input?.acquiredAt);
  const gradeSource = normalizeOfficialGradeSource(input?.gradeSource);

  if (!gradeCode) {
    return { ok: false, message: "실제 급수를 선택해 주세요." };
  }

  if (!acquiredAt) {
    return { ok: false, message: "취득일을 올바르게 입력해 주세요." };
  }

  if (!gradeSource) {
    return { ok: false, message: "급수 출처를 선택해 주세요." };
  }

  return {
    ok: true,
    value: {
      gradeCode,
      acquiredAt,
      gradeSource,
    },
  };
}

export async function fetchStudentOfficialGrade(academyId, studentUserId) {
  if (!academyId || !studentUserId) {
    return null;
  }

  if (isSupabaseConfigured()) {
    const remoteResult = await fetchStudentOfficialGradeFromSupabase(academyId, studentUserId);
    if (remoteResult.ok && remoteResult.grade) {
      const enriched = enrichOfficialGradeRecord(remoteResult.grade);
      writeOfficialGradeCache(enriched);
      return enriched;
    }

    if (remoteResult.ok && !remoteResult.grade) {
      return null;
    }
  }

  return enrichOfficialGradeRecord(readOfficialGradeFromCache(academyId, studentUserId));
}

export async function upsertStudentOfficialGrade(academyId, studentUserId, input) {
  const validation = validateOfficialGradeInput(input);
  if (!validation.ok) {
    return validation;
  }

  if (!academyId || !studentUserId) {
    return { ok: false, message: "학생 정보를 확인할 수 없습니다." };
  }

  const grade = enrichOfficialGradeRecord({
    academyId,
    studentUserId,
    ...validation.value,
  });

  if (isSupabaseConfigured()) {
    const remoteResult = await upsertStudentOfficialGradeToSupabase(grade);
    if (!remoteResult.ok) {
      return {
        ok: false,
        message:
          remoteResult.message ??
          "실제 급수를 저장하지 못했습니다. Supabase 설정과 RLS를 확인해 주세요.",
      };
    }
  }

  writeOfficialGradeCache(grade);
  return { ok: true, grade };
}
