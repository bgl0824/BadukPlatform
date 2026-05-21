import { getOrderedCategoryNames } from "./category-service.js";
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
  const categoryNames = getOrderedCategoryNames();

  return categoryNames
    .map((categoryName) => {
      return buildCategoryLearningRow(categoryName, problems, progressByProblemId, progressList);
    })
    .filter(Boolean);
}

function buildCategoryLearningRow(categoryName, problems, progressByProblemId, progressList) {
  const row = getCategoryProgressRow(categoryName, problems, progressByProblemId);
  if (row.total === 0) {
    return null;
  }

  const categoryProblems = getProblemsInCategoryOrder(categoryName, problems);
  const continueTarget = getContinueTargetForCategory(categoryName, {
    progressList,
    problems,
    progressByProblemId,
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

  return {
    categoryName,
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
