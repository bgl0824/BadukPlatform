import {
  canManageExamSets,
  canViewPublishedExamSets,
  filterExamSetsForViewer,
} from "../permissions/permission-service.js";
import {
  createExamSetId,
  EXAM_SET_ROLE,
  EXAM_SET_STATUS,
  normalizeExamSetType,
  normalizeExamSetRole,
  normalizeExamSetStatus,
  resolveExamSetRoleByType,
} from "./exam-set-constants.js";
import { normalizeGradeLevelCode } from "./grade-level-service.js";
import {
  deleteExamSetFromSupabase,
  fetchExamSetById,
  fetchExamSetQuestions,
  fetchExamSetsWithQuestionCounts,
  replaceExamSetQuestions,
  upsertExamSetToSupabase,
} from "./exam-set-persistence-service.js";
import { getSupabaseAuthSession, isSupabaseAuthUser } from "./auth-service.js";

export async function listExamSetsForAdmin({ user } = {}) {
  if (!canManageExamSets(user)) {
    throw new Error("permission denied: manage exam sets");
  }

  const result = await fetchExamSetsWithQuestionCounts({ includeDrafts: true });
  if (!result.ok) {
    throw new Error(
      result.message ??
        "exam_sets 목록을 불러오지 못했습니다. scripts/supabase-exam-sets.sql 실행 및 Supabase 로그인을 확인하세요.",
    );
  }

  return result;
}

export async function listExamSetsForViewer({ user } = {}) {
  if (!canViewPublishedExamSets(user)) {
    return { ok: true, sets: [] };
  }

  const result = await fetchExamSetsWithQuestionCounts({ includeDrafts: false });
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    sets: filterExamSetsForViewer(result.sets, user),
  };
}

export async function getExamSetDetail({ user, examSetId, forAdmin = false } = {}) {
  if (!examSetId) {
    return { ok: false, set: null, questions: [] };
  }

  if (forAdmin) {
    if (!canManageExamSets(user)) {
      throw new Error("permission denied: manage exam sets");
    }
  } else if (!canViewPublishedExamSets(user)) {
    return { ok: false, set: null, questions: [] };
  }

  const setResult = await fetchExamSetById(examSetId, { includeDrafts: forAdmin });
  if (!setResult.ok || !setResult.set) {
    return { ok: false, set: null, questions: [], message: setResult.message };
  }

  if (!forAdmin) {
    const visible = filterExamSetsForViewer([setResult.set], user);
    if (visible.length === 0) {
      return { ok: false, set: null, questions: [] };
    }
  }

  const questionsResult = await fetchExamSetQuestions(examSetId);
  return {
    ok: true,
    set: setResult.set,
    questions: questionsResult.questions ?? [],
  };
}

export async function saveExamSet({
  user,
  examSet,
  orderedProblemIds = [],
}) {
  assertSupabaseWriteSession(user);

  if (!canManageExamSets(user)) {
    throw new Error("permission denied: manage exam sets");
  }

  const title = String(examSet?.title ?? "").trim();
  if (!title) {
    throw new Error("세트 제목을 입력해 주세요.");
  }

  const type = normalizeExamSetType(examSet?.type);
  const setRole = resolveExamSetRoleByType(type);
  const availableFromInput = examSet?.availableFrom ?? null;
  const availableUntilInput = examSet?.availableUntil ?? null;
  const sourceExamSetId = String(examSet?.sourceExamSetId ?? "").trim();
  const availableFrom = normalizeLocalDateTimeToUtcIso(availableFromInput, "공개 시작");
  const availableUntil = normalizeLocalDateTimeToUtcIso(availableUntilInput, "공개 종료");

  if (setRole === EXAM_SET_ROLE.promotionPaper) {
    if (!sourceExamSetId) {
      throw new Error("승급심사 시험지는 기반 기출세트를 선택해 주세요.");
    }
    if (!availableFrom || !availableUntil) {
      throw new Error("승급심사 시험지는 공개 시작/종료 일시가 필요합니다.");
    }
    if (new Date(availableFrom).getTime() > new Date(availableUntil).getTime()) {
      throw new Error("공개 시작일은 공개 종료일보다 늦을 수 없습니다.");
    }
    if (!Array.isArray(orderedProblemIds) || orderedProblemIds.length !== 20) {
      throw new Error("승급심사 시험지는 정확히 20문제로 구성해야 합니다.");
    }
  }

  if (normalizeExamSetStatus(examSet?.status) === EXAM_SET_STATUS.published) {
    if (!Array.isArray(orderedProblemIds) || orderedProblemIds.length === 0) {
      throw new Error("문제를 추가한 뒤 게시할 수 있습니다.");
    }

    if (!normalizeGradeLevelCode(examSet?.gradeLevel)) {
      throw new Error("게시하려면 대표 급수/단수를 선택해 주세요.");
    }
  }

  const payload = {
    ...examSet,
    id: examSet.id || createExamSetId(),
    type,
    setRole,
    sourceExamSetId,
    availableFrom,
    availableUntil,
    createdBy: examSet.createdBy || user?.id || "",
  };

  console.log("[ExamSetService] saveExamSet start", {
    id: payload.id,
    status: payload.status,
    problemCount: orderedProblemIds.length,
  });

  const saveResult = await upsertExamSetToSupabase(payload);
  if (!saveResult.ok) {
    throw new Error(saveResult.message ?? "Failed to save exam set");
  }

  const questionsResult = await replaceExamSetQuestions(payload.id, orderedProblemIds);
  if (!questionsResult.ok) {
    throw new Error(questionsResult.message ?? "Failed to save exam set questions");
  }

  console.log("[ExamSetService] saveExamSet success", {
    id: saveResult.set.id,
    questionCount: questionsResult.count ?? orderedProblemIds.length,
  });

  return {
    set: saveResult.set,
    questionCount: questionsResult.count ?? orderedProblemIds.length,
  };
}

/**
 * datetime-local 입력값(로컬시간)을 UTC ISO 문자열로 정규화한다.
 * - 입력 예: 2026-06-02T19:52
 * - 저장 예: 2026-06-02T10:52:00.000Z
 * 이미 ISO(Z/offset)인 값은 그대로 ISO로 정규화한다.
 */
function normalizeLocalDateTimeToUtcIso(value, fieldLabel) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldLabel} 일시 형식이 올바르지 않습니다.`);
  }

  return parsed.toISOString();
}

export async function deleteExamSet({ user, examSetId }) {
  assertSupabaseWriteSession(user);

  if (!canManageExamSets(user)) {
    throw new Error("permission denied: manage exam sets");
  }

  const result = await deleteExamSetFromSupabase(examSetId);
  if (!result.ok) {
    throw new Error(result.message ?? "Failed to delete exam set");
  }

  return { ok: true };
}

export async function resolveExamSetProblemIds(examSetId, { user, forAdmin = false } = {}) {
  const detail = await getExamSetDetail({ user, examSetId, forAdmin });
  if (!detail.ok || !detail.set) {
    return [];
  }

  return detail.questions.map((entry) => entry.problemId);
}

function assertSupabaseWriteSession(user) {
  if (!isSupabaseAuthUser(user)) {
    throw new Error(
      "Supabase Auth 로그인이 필요합니다. 시험 세트 저장은 Supabase Auth 계정에서만 가능합니다.",
    );
  }
}

export const examSetService = {
  listExamSetsForAdmin,
  listExamSetsForViewer,
  getExamSetDetail,
  saveExamSet,
  deleteExamSet,
  resolveExamSetProblemIds,
};
