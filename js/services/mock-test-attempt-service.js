import { MOCK_TEST_TIME_LIMIT_SECONDS } from "../constants/mock-test-constants.js";
import { normalizeRole, ROLES } from "../permissions/permission-service.js";
import { fetchAcademyMemberByUserId } from "./academy-member-service.js";
import {
  fetchLatestMockTestAttemptForStudentFromSupabase,
  fetchMockTestAttemptsByExamSetFromSupabase,
  insertMockTestAttemptToSupabase,
} from "./mock-test-attempt-persistence-service.js";

export async function resolveAcademyIdForMockAttempt(user) {
  const fromUser = String(user?.academyId ?? "").trim();
  if (fromUser) {
    return fromUser;
  }

  if (!user?.id) {
    return "";
  }

  const member = await fetchAcademyMemberByUserId(user.id);
  return String(member?.academyId ?? "").trim();
}

export async function recordMockTestAttempt({
  user,
  examSetId,
  examSetTitle,
  totalQuestionCount,
  correctCount,
  wrongProblemNumbers,
  durationSeconds = 0,
  overtimeSeconds = 0,
  timeLimitSeconds = MOCK_TEST_TIME_LIMIT_SECONDS,
}) {
  if (!user?.id || !examSetId) {
    return { ok: false, message: "invalid input" };
  }

  const total = Number(totalQuestionCount ?? 0);
  const correct = Number(correctCount ?? 0);
  const accuracyRate = total > 0 ? Math.round((correct / total) * 100) : 0;
  const academyId = await resolveAcademyIdForMockAttempt(user);

  console.log("[MockTestAttempt] record", {
    studentUserId: user.id,
    examSetId,
    academyId,
    examSetTitle,
    totalQuestionCount: total,
    correctCount: correct,
    accuracyRate,
    durationSeconds,
    overtimeSeconds,
  });

  return insertMockTestAttemptToSupabase({
    examSetId,
    examSetTitle,
    studentUserId: user.id,
    studentName: user.name ?? user.username ?? "",
    academyId,
    attemptedAt: new Date().toISOString(),
    totalQuestionCount: total,
    correctCount: correct,
    accuracyRate,
    wrongProblemNumbers: Array.isArray(wrongProblemNumbers) ? wrongProblemNumbers : [],
    durationSeconds: Number(durationSeconds ?? 0),
    overtimeSeconds: Number(overtimeSeconds ?? 0),
    timeLimitSeconds: Number(timeLimitSeconds ?? MOCK_TEST_TIME_LIMIT_SECONDS),
  });
}

export async function getLatestMockTestAttemptForStudent({ user, examSetId } = {}) {
  if (!user?.id || !examSetId) {
    return { ok: false, attempt: null, message: "invalid input" };
  }

  return fetchLatestMockTestAttemptForStudentFromSupabase({
    examSetId,
    studentUserId: user.id,
  });
}

export async function listMockTestAttemptsForViewer({ user, examSetId, limit = 30 } = {}) {
  const role = normalizeRole(user?.role);
  const viewerAcademyId =
    role === ROLES.academyOwner
      ? String(user?.id ?? "").trim()
      : String(user?.academyId ?? "").trim();

  if (role === ROLES.student) {
    console.log("[MockTestAttempt] listForViewer (student)", {
      role,
      examSetId,
      studentUserId: user?.id,
      academyId: viewerAcademyId,
    });
    const latest = await fetchLatestMockTestAttemptForStudentFromSupabase({
      examSetId,
      studentUserId: user.id,
    });
    if (!latest.ok) {
      return { ok: false, attempts: [], message: latest.message };
    }
    return { ok: true, attempts: latest.attempt ? [latest.attempt] : [] };
  }

  if (![ROLES.admin, ROLES.academyOwner, ROLES.teacher].includes(role)) {
    return { ok: true, attempts: [] };
  }

  console.log("[MockTestAttempt] listForViewer (academy/admin)", {
    role,
    viewerUserId: user?.id,
    examSetId,
    viewerAcademyId,
    studentUserIdFilter: null,
  });

  return fetchMockTestAttemptsByExamSetFromSupabase({
    examSetId,
    limit,
  });
}

/** @deprecated Use listMockTestAttemptsForViewer */
export async function listMockTestAttemptsForAcademyViewer({ user, examSetId, limit = 30 } = {}) {
  return listMockTestAttemptsForViewer({ user, examSetId, limit });
}

export const mockTestAttemptService = {
  recordMockTestAttempt,
  getLatestMockTestAttemptForStudent,
  listMockTestAttemptsForViewer,
  listMockTestAttemptsForAcademyViewer,
};
