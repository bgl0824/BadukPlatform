import {
  canManageExamSets,
  canViewPublishedExamSets,
  filterExamSetsForViewer,
} from "../permissions/permission-service.js";
import {
  createExamSetId,
  EXAM_SET_STATUS,
  normalizeExamSetStatus,
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
