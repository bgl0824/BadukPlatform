import { EXAM_SET_ROLE, EXAM_SET_TYPE, normalizeExamSetRole, normalizeExamSetType } from "./exam-set-constants.js";

const STORAGE_PREFIX = "BADUK_EXAM_SET_LEARNING_PROGRESS";

function storageKey(userId) {
  return `${STORAGE_PREFIX}_${String(userId ?? "").trim()}`;
}

function readStore(userId) {
  if (!userId) {
    return {};
  }
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(userId, store) {
  if (!userId) {
    return;
  }
  localStorage.setItem(storageKey(userId), JSON.stringify(store));
}

/** question_bank 기출(학습) 세트만 이어풀기 대상 */
export function isResumableQuestionBankSet(set) {
  return (
    normalizeExamSetRole(set?.setRole) === EXAM_SET_ROLE.questionBank &&
    normalizeExamSetType(set?.type) === EXAM_SET_TYPE.pastExam
  );
}

export function isResumableLearningProgress(progress) {
  if (!progress) {
    return false;
  }
  const resumeIndex = Number(progress.resumeIndex ?? 0);
  const total = Number(progress.totalQuestionCount ?? 0);
  return resumeIndex > 0 && total > 0 && resumeIndex < total;
}

export function getLearningProgress(userId, examSetId) {
  if (!userId || !examSetId) {
    return null;
  }
  const store = readStore(userId);
  const entry = store[examSetId];
  return entry ? { ...entry } : null;
}

export function getAllLearningProgress(userId) {
  const store = readStore(userId);
  return new Map(Object.entries(store).map(([examSetId, entry]) => [examSetId, { ...entry }]));
}

export function clearLearningProgress(userId, examSetId) {
  if (!userId || !examSetId) {
    return;
  }
  const store = readStore(userId);
  delete store[examSetId];
  writeStore(userId, store);
}

export function saveLearningProgress({
  studentUserId,
  examSetId,
  resumeIndex,
  totalQuestionCount,
  problemIds = [],
  completedProblemIds = [],
}) {
  if (!studentUserId || !examSetId) {
    return null;
  }

  const total = Number(totalQuestionCount ?? 0);
  const index = Math.max(0, Math.min(Number(resumeIndex ?? 0), total > 0 ? total - 1 : 0));

  if (total <= 0 || index <= 0) {
    clearLearningProgress(studentUserId, examSetId);
    return null;
  }

  const store = readStore(studentUserId);
  const completed = Array.isArray(completedProblemIds)
    ? completedProblemIds
    : problemIds.slice(0, index);

  const entry = {
    studentUserId,
    examSetId,
    resumeIndex: index,
    totalQuestionCount: total,
    completedProblemIds: completed,
    problemIds: Array.isArray(problemIds) ? [...problemIds] : [],
    updatedAt: new Date().toISOString(),
  };

  store[examSetId] = entry;
  writeStore(studentUserId, store);
  return entry;
}

export function validateLearningProgress(progress, problemIds) {
  if (!progress || !Array.isArray(problemIds) || problemIds.length === 0) {
    return false;
  }

  const savedIds = progress.problemIds ?? [];
  if (savedIds.length === 0) {
    return Number(progress.totalQuestionCount) === problemIds.length;
  }

  if (savedIds.length !== problemIds.length) {
    return false;
  }

  return savedIds.every((id, idx) => id === problemIds[idx]);
}

export function formatLearningProgressDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLearningProgressPercent(progress) {
  const total = Number(progress?.totalQuestionCount ?? 0);
  const done = Number(progress?.resumeIndex ?? 0);
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((done / total) * 100));
}

export const examSetLearningProgressService = {
  isResumableQuestionBankSet,
  isResumableLearningProgress,
  getLearningProgress,
  getAllLearningProgress,
  clearLearningProgress,
  saveLearningProgress,
  validateLearningProgress,
  formatLearningProgressDate,
  getLearningProgressPercent,
};
