import { getCategoryByName, getOrderedCategoryNames, readCategories } from "./category-service.js";
import { LEVEL_GROUPS, getLevelGroupInfo, normalizeLevelGroup } from "./level-group-service.js";
import { getCategoryProblemNumberForProblem } from "./category-problem-number.js";
import {
  getContinueTargetForCategory,
  getCategoryProgressRow,
  getProblemsInCategoryOrder,
} from "./learning-flow-service.js";
import { isReviewEligible, getTotalWrongCount } from "./review-service.js";
import {
  getProgressStatus,
  getStudentProgressByUserId,
  isReviewArchived,
  isReviewDeleted,
  isReviewResolved,
  PROGRESS_STATUS,
} from "./student-progress-service.js";

export function getStudentLearningDetail(studentUserId, problems) {
  const progressList = getStudentProgressByUserId(studentUserId);
  const progressByProblemId = new Map(progressList.map((progress) => [progress.problemId, progress]));
  const categories = readCategories();
  const rows = [];

  LEVEL_GROUPS.forEach((levelGroup) => {
    getOrderedCategoryNames(categories, { levelGroup }).forEach((categoryName) => {
      const row = buildCategoryLearningRow(
        categoryName,
        levelGroup,
        problems,
        progressByProblemId,
        progressList,
        categories,
      );
      if (row) {
        rows.push(row);
      }
    });
  });

  return rows;
}

/** levelGroup 섹션 단위로 묶기 (탭 전 단계) */
export function groupLearningDetailByLevelGroup(rows = []) {
  return LEVEL_GROUPS.map((levelGroup) => {
    const sectionRows = rows.filter(
      (row) => normalizeLevelGroup(row.levelGroup) === levelGroup,
    );
    return {
      levelGroup,
      title: levelGroup,
      description: getLevelGroupInfo(levelGroup).description,
      rows: sectionRows,
    };
  }).filter((section) => section.rows.length > 0);
}

function buildCategoryLearningRow(
  categoryName,
  levelGroup,
  problems,
  progressByProblemId,
  progressList,
  categories,
) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const row = getCategoryProgressRow(categoryName, problems, progressByProblemId, {
    levelGroup: normalizedLevelGroup,
  });
  if (row.total === 0) {
    return null;
  }

  const categoryProblems = getProblemsInCategoryOrder(categoryName, problems, {
    levelGroup: normalizedLevelGroup,
  });
  const continueTarget = getContinueTargetForCategory(categoryName, {
    progressList,
    problems,
    progressByProblemId,
    levelGroup: normalizedLevelGroup,
  });

  let unresolvedReviewCount = 0;
  let resolvedReviewCount = 0;

  categoryProblems.forEach(({ problem }) => {
    const progress = progressByProblemId.get(problem.id);
    if (!progress || isReviewDeleted(progress)) {
      return;
    }

    if (isReviewEligible(progress)) {
      unresolvedReviewCount += 1;
      return;
    }

    if (isReviewResolved(progress)) {
      resolvedReviewCount += 1;
    }
  });

  const recentEntry = findRecentCategoryProgress(categoryProblems, progressByProblemId);
  const statusLabel = getCategoryStatusLabel(row);
  const recentLabel = formatRecentProblemLabel(recentEntry, problems);
  const continueLabel = formatContinueLabel(continueTarget, row);

  const registryCategory = getCategoryByName(categoryName, categories, {
    levelGroup: normalizedLevelGroup,
  });

  return {
    categoryName,
    levelGroup: registryCategory?.levelGroup ?? normalizedLevelGroup,
    solved: row.solved,
    total: row.total,
    status: row.isComplete ? "complete" : row.isInProgress ? "in_progress" : "not_started",
    statusLabel,
    recentLabel,
    continueLabel,
    unresolvedReviewCount,
    resolvedReviewCount,
  };
}

function findRecentCategoryProgress(categoryProblems, progressByProblemId) {
  const entries = categoryProblems
    .map(({ problem, index }) => {
      const progress = progressByProblemId.get(problem.id);
      if (!progress) {
        return null;
      }

      return { problem, index, progress };
    })
    .filter(Boolean)
    .sort((left, right) => {
      return new Date(right.progress.updatedAt ?? right.progress.solvedAt ?? 0).getTime() -
        new Date(left.progress.updatedAt ?? left.progress.solvedAt ?? 0).getTime();
    });

  return entries[0] ?? null;
}

function formatRecentProblemLabel(recentEntry, problems) {
  if (!recentEntry) {
    return "최근 학습 없음";
  }

  const { problem, progress } = recentEntry;
  const categoryProblemNumber = getCategoryProblemNumberForProblem(problem, problems);
  const numberLabel = categoryProblemNumber ? `${categoryProblemNumber}번` : "";
  const status = getProgressStatus(progress);

  if (status === PROGRESS_STATUS.solved) {
    return numberLabel ? `최근 ${numberLabel} 완료` : "최근 학습 완료";
  }

  if (status === PROGRESS_STATUS.inProgress) {
    return numberLabel ? `최근 ${numberLabel} 진행중` : "최근 진행중";
  }

  return numberLabel ? `최근 ${numberLabel}` : "최근 학습";
}

function formatContinueLabel(continueTarget, row) {
  if (row.isComplete) {
    return "카테고리 완료";
  }

  if (!continueTarget) {
    return row.isInProgress ? "진행중" : "미시작";
  }

  const number = continueTarget.categoryProblemNumber ?? continueTarget.positionInCategory;
  if (continueTarget.isResumeInProgress) {
    return number ? `${number}번 이어하기` : "이어하기";
  }

  return number ? `다음 ${number}번` : "다음 문제";
}

function getCategoryStatusLabel(row) {
  if (row.isComplete) {
    return "완료";
  }

  if (row.isInProgress) {
    return "진행중";
  }

  return "미시작";
}
