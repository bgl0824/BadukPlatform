import { DEFAULT_LEVEL_GROUP, getLevelGroupInfo, LEVEL_GROUPS, normalizeLevelGroup } from "./level-group-service.js";
import { getNextCategoryName, getOrderedCategoryNames } from "./category-service.js";
import { compareProblemsInCategory } from "./problem-order-service.js";
import { getProgressStatus, PROGRESS_STATUS } from "./student-progress-service.js";

export function getProblemsInCategoryOrder(categoryName, problems, { levelGroup } = {}) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const normalizedLevelGroup = levelGroup ? normalizeLevelGroup(levelGroup) : null;

  return problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => {
      if (problem.category !== normalizedCategory) {
        return false;
      }

      if (normalizedLevelGroup) {
        return normalizeLevelGroup(problem.levelGroup) === normalizedLevelGroup;
      }

      return true;
    })
    .sort((left, right) => compareProblemsInCategory(left.problem, right.problem));
}

export function getActiveCategoryName({ progressList, categoryNames, problems, levelGroup }) {
  const curriculum = categoryNames.length > 0 ? categoryNames : getOrderedCategoryNames(undefined, { levelGroup });
  const normalizedLevelGroup = levelGroup ? normalizeLevelGroup(levelGroup) : null;
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const problemIdsInLevel = normalizedLevelGroup
    ? new Set(
        problems
          .filter((problem) => normalizeLevelGroup(problem.levelGroup) === normalizedLevelGroup)
          .map((problem) => problem.id),
      )
    : null;

  const resolveProgressCategory = (progress) => {
    const problem = problemById.get(progress.problemId);
    const category = String(problem?.category ?? progress.category ?? "").trim();
    return curriculum.includes(category) ? category : null;
  };

  const relevantProgress = progressList
    .filter((progress) => {
      if (problemIdsInLevel && !problemIdsInLevel.has(progress.problemId)) {
        return false;
      }

      return Boolean(resolveProgressCategory(progress));
    })
    .sort((left, right) => {
      return new Date(right.updatedAt ?? right.solvedAt ?? 0).getTime() -
        new Date(left.updatedAt ?? left.solvedAt ?? 0).getTime();
    });

  if (relevantProgress.length > 0) {
    return resolveProgressCategory(relevantProgress[0]);
  }

  return (
    curriculum.find(
      (categoryName) => getProblemsInCategoryOrder(categoryName, problems, { levelGroup }).length > 0,
    ) ?? curriculum[0] ?? null
  );
}

export function resolveActiveLevelGroupFromProgress(progressList, problems) {
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const sortedProgress = [...progressList].sort((left, right) => {
    return new Date(right.updatedAt ?? right.solvedAt ?? 0).getTime() -
      new Date(left.updatedAt ?? left.solvedAt ?? 0).getTime();
  });

  for (const progress of sortedProgress) {
    const problem = problemById.get(progress.problemId);
    if (problem?.levelGroup) {
      return normalizeLevelGroup(problem.levelGroup);
    }
  }

  return DEFAULT_LEVEL_GROUP;
}

export function getLevelGroupProgressRow(levelGroup, categoryNames, problems, progressByProblemId = null) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const rows = categoryNames.map((categoryName) => {
    return getCategoryProgressRow(categoryName, problems, progressByProblemId, {
      levelGroup: normalizedLevelGroup,
    });
  });

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const solved = rows.reduce((sum, row) => sum + row.solved, 0);
  const startedCategories = rows.filter((row) => row.isInProgress || row.isComplete).length;
  const completedCategories = rows.filter((row) => row.isComplete && row.total > 0).length;
  const isComplete = total > 0 && solved === total;
  const isInProgress = solved > 0 && !isComplete;

  return {
    levelGroup: normalizedLevelGroup,
    solved,
    total,
    startedCategories,
    completedCategories,
    categoryCount: categoryNames.length,
    isComplete,
    isInProgress,
    percent: total > 0 ? Math.round((solved / total) * 100) : 0,
    label: isComplete ? "완료" : isInProgress ? "진행중" : "시작 전",
  };
}

export function getContinueTargetForCategory(
  categoryName,
  { progressList, problems, progressByProblemId = null, levelGroup } = {},
) {
  const categoryProblems = getProblemsInCategoryOrder(categoryName, problems, { levelGroup });
  if (categoryProblems.length === 0) {
    return null;
  }

  const problemIdsInCategory = new Set(categoryProblems.map(({ problem }) => problem.id));
  const recentInProgressInCategory = [...progressList]
    .filter((progress) => problemIdsInCategory.has(progress.problemId))
    .filter((progress) => getProgressStatus(progress) === PROGRESS_STATUS.inProgress)
    .sort((left, right) => {
      return new Date(right.updatedAt ?? right.solvedAt ?? 0).getTime() -
        new Date(left.updatedAt ?? left.solvedAt ?? 0).getTime();
    });

  for (const progress of recentInProgressInCategory) {
    const entry = categoryProblems.find(({ problem }) => problem.id === progress.problemId);
    if (entry) {
      return {
        ...toProblemTarget(entry, categoryProblems),
        isResumeInProgress: true,
      };
    }
  }

  return getNextProblemForCategory(categoryName, problems, progressByProblemId, { levelGroup });
}

export function getCategoryLearningRow(
  categoryName,
  problems,
  progressByProblemId,
  progressList,
  { levelGroup } = {},
) {
  const row = getCategoryProgressRow(categoryName, problems, progressByProblemId, { levelGroup });
  const continueTarget = getContinueTargetForCategory(categoryName, {
    progressList,
    problems,
    progressByProblemId,
    levelGroup,
  });

  return {
    ...row,
    continueTarget,
  };
}

export function getNextProblemForCategory(
  categoryName,
  problems,
  progressByProblemId = null,
  { levelGroup } = {},
) {
  const categoryProblems = getProblemsInCategoryOrder(categoryName, problems, { levelGroup });
  if (categoryProblems.length === 0) {
    return null;
  }

  const nextUnsolvedEntry = categoryProblems.find(({ problem }) => {
    return getProblemProgressStatus(progressByProblemId?.get(problem.id)) !== PROGRESS_STATUS.solved;
  });
  if (nextUnsolvedEntry) {
    return toProblemTarget(nextUnsolvedEntry, categoryProblems);
  }

  return null;
}

export function getCategoryProgressRow(
  categoryName,
  problems,
  progressByProblemId = null,
  { levelGroup } = {},
) {
  const categoryProblems = getProblemsInCategoryOrder(categoryName, problems, { levelGroup });
  const total = categoryProblems.length;
  const solved = categoryProblems.filter(({ problem }) => {
    return getProblemProgressStatus(progressByProblemId?.get(problem.id)) === PROGRESS_STATUS.solved;
  }).length;
  const hasStarted = categoryProblems.some(({ problem }) => progressByProblemId?.has(problem.id));
  const isComplete = total > 0 && solved === total;
  const isInProgress = hasStarted && !isComplete;

  return {
    name: categoryName,
    solved,
    total,
    isComplete,
    isInProgress,
    label: isComplete ? "완료" : isInProgress ? "진행중" : "시작 전",
  };
}

export function getNextCategoryRecommendation(
  categoryName,
  problems,
  progressByProblemId = null,
  { levelGroup } = {},
) {
  const nextCategoryName = getNextCategoryName(categoryName, undefined, { levelGroup });
  if (!nextCategoryName) {
    return null;
  }

  const nextProblem = getNextProblemForCategory(nextCategoryName, problems, progressByProblemId, {
    levelGroup,
  });
  if (!nextProblem) {
    return {
      categoryName: nextCategoryName,
      problem: null,
      index: -1,
      positionInCategory: 0,
      totalInCategory: getProblemsInCategoryOrder(nextCategoryName, problems, { levelGroup }).length,
    };
  }

  return {
    categoryName: nextCategoryName,
    ...nextProblem,
  };
}

export function getLevelGroupLearningFlow(
  levelGroup,
  { progressList, problems, progressByProblemId = null },
) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const levelInfo = getLevelGroupInfo(normalizedLevelGroup);
  const categoryNames = getOrderedCategoryNames(undefined, { levelGroup: normalizedLevelGroup });
  const recentlyStudiedCategory = getActiveCategoryName({
    progressList,
    categoryNames,
    problems,
    levelGroup: normalizedLevelGroup,
  });
  const categoryRows = categoryNames
    .map((categoryName) => {
      return getCategoryLearningRow(categoryName, problems, progressByProblemId, progressList, {
        levelGroup: normalizedLevelGroup,
      });
    })
    .filter((row) => row.total > 0);

  const activeRow = categoryRows.find((row) => row.name === recentlyStudiedCategory) ?? null;
  const continueTarget = activeRow?.continueTarget ?? null;
  const levelProgress = getLevelGroupProgressRow(
    normalizedLevelGroup,
    categoryNames,
    problems,
    progressByProblemId,
  );

  let recommendation = null;
  if (recentlyStudiedCategory && activeRow?.isComplete) {
    recommendation = getNextCategoryRecommendation(
      recentlyStudiedCategory,
      problems,
      progressByProblemId,
      { levelGroup: normalizedLevelGroup },
    );
  }

  return {
    levelGroup: normalizedLevelGroup,
    levelInfo,
    levelProgress,
    activeCategory: recentlyStudiedCategory,
    recentlyStudiedCategory,
    activeRow,
    continueTarget,
    categoryRows,
    recommendation,
    isLevelEmpty: levelProgress.total === 0,
    hasCurriculum: categoryNames.length > 0,
  };
}

export function getStudyCurriculumTree({
  progressList,
  problems,
  progressByProblemId = null,
  activeLevelGroup,
} = {}) {
  const currentLevelGroup = normalizeLevelGroup(
    activeLevelGroup ?? resolveActiveLevelGroupFromProgress(progressList, problems),
  );

  return {
    currentLevelGroup,
    levelGroups: LEVEL_GROUPS.map((levelGroup) => ({
      ...getLevelGroupLearningFlow(levelGroup, { progressList, problems, progressByProblemId }),
      isCurrent: levelGroup === currentLevelGroup,
    })),
  };
}

export function getCurrentLearningFlow({
  progressList,
  problems,
  progressByProblemId = null,
  activeLevelGroup,
} = {}) {
  const levelGroup = normalizeLevelGroup(
    activeLevelGroup ?? resolveActiveLevelGroupFromProgress(progressList, problems),
  );

  return {
    ...getLevelGroupLearningFlow(levelGroup, { progressList, problems, progressByProblemId }),
    hasProgress: progressList.length > 0,
  };
}

function getProblemProgressStatus(progress) {
  if (!progress) {
    return PROGRESS_STATUS.notStarted;
  }

  return getProgressStatus(progress);
}

function toProblemTarget(entry, categoryProblems) {
  const categoryProblemNumber =
    categoryProblems.findIndex(({ problem }) => problem.id === entry.problem.id) + 1;
  return {
    problem: entry.problem,
    index: entry.index,
    categoryName: entry.problem.category,
    categoryProblemNumber,
    positionInCategory: categoryProblemNumber,
    totalInCategory: categoryProblems.length,
    label: `${entry.problem.category} ${categoryProblemNumber}번`,
  };
}
