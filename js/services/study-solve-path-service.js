import { normalizeLevelGroup } from "./level-group-service.js";
import { getProblemsInCategoryOrder } from "./learning-flow-service.js";
import { getProgressStatus, PROGRESS_STATUS } from "./student-progress-service.js";

/**
 * 학습중 이어하기/추천 — 카테고리 순서 고정 목록 (문제은행 필터와 분리)
 * @param {string} categoryName
 * @param {object[]} problems
 * @param {{ levelGroup?: string }} [options]
 */
export function buildStudySolvePath(categoryName, problems, { levelGroup } = {}) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const entries = getProblemsInCategoryOrder(normalizedCategory, problems, {
    levelGroup: normalizedLevelGroup,
  });

  return {
    categoryName: normalizedCategory,
    levelGroup: normalizedLevelGroup,
    problemIds: entries.map(({ problem }) => problem.id),
    entries: entries.map(({ problem, index }) => ({
      problemId: problem.id,
      index,
    })),
  };
}

function getProblemProgressStatus(progress) {
  if (!progress) {
    return PROGRESS_STATUS.notStarted;
  }
  return getProgressStatus(progress);
}

function isProblemSolved(problemId, progressByProblemId) {
  const progress = progressByProblemId?.get(problemId);
  return getProblemProgressStatus(progress) === PROGRESS_STATUS.solved;
}

/**
 * @param {ReturnType<typeof buildStudySolvePath>} studyPath
 * @param {Map<string, object>} progressByProblemId
 */
export function getRemainingUnsolvedProblemIds(studyPath, progressByProblemId) {
  if (!studyPath?.problemIds) {
    return [];
  }

  return studyPath.problemIds.filter(
    (problemId) => !isProblemSolved(problemId, progressByProblemId),
  );
}

/**
 * @param {ReturnType<typeof buildStudySolvePath>} studyPath
 * @param {string} problemId
 * @param {Map<string, object>} progressByProblemId
 */
export function findCurrentIndexInStudyPath(studyPath, problemId, progressByProblemId) {
  if (!studyPath?.problemIds?.length) {
    return -1;
  }

  const candidates = [problemId].filter(Boolean);
  for (const id of candidates) {
    const idx = studyPath.problemIds.indexOf(id);
    if (idx >= 0) {
      return idx;
    }
  }

  return -1;
}

/**
 * @param {ReturnType<typeof buildStudySolvePath>} studyPath
 * @param {object[]} problems
 * @param {string} problemId
 */
export function resolveStudyPathProblemEntry(studyPath, problems, problemId) {
  const index = problems.findIndex((entry) => entry.id === problemId);
  if (index === -1) {
    return null;
  }

  const pathIndex = studyPath?.problemIds?.indexOf(problemId) ?? -1;
  return {
    problem: problems[index],
    index,
    pathIndex,
  };
}

/**
 * study path에서 현재 문제 이후 첫 미완료 (현재는 이미 solved 가정)
 * @param {ReturnType<typeof buildStudySolvePath>} studyPath
 * @param {object[]} problems
 * @param {Map<string, object>} progressByProblemId
 * @param {string} currentProblemId
 * @param {string|null} [fallbackProblemId]
 */
export function getNextUnsolvedInStudyPath(
  studyPath,
  problems,
  progressByProblemId,
  currentProblemId,
  fallbackProblemId = null,
) {
  if (!studyPath?.problemIds?.length) {
    return null;
  }

  let startIndex = findCurrentIndexInStudyPath(studyPath, currentProblemId, progressByProblemId);
  if (startIndex === -1 && fallbackProblemId) {
    startIndex = findCurrentIndexInStudyPath(studyPath, fallbackProblemId, progressByProblemId);
  }

  if (startIndex === -1) {
    const firstUnsolvedId = studyPath.problemIds.find(
      (id) => id !== currentProblemId && !isProblemSolved(id, progressByProblemId),
    );
    return firstUnsolvedId ? resolveStudyPathProblemEntry(studyPath, problems, firstUnsolvedId) : null;
  }

  for (let index = startIndex + 1; index < studyPath.problemIds.length; index += 1) {
    const problemId = studyPath.problemIds[index];
    if (!isProblemSolved(problemId, progressByProblemId)) {
      return resolveStudyPathProblemEntry(studyPath, problems, problemId);
    }
  }

  return null;
}

/**
 * @param {ReturnType<typeof buildStudySolvePath>} studyPath
 * @param {Map<string, object>} progressByProblemId
 */
export function isActuallyLastProblemInStudyPath(studyPath, progressByProblemId) {
  return getRemainingUnsolvedProblemIds(studyPath, progressByProblemId).length === 0;
}
