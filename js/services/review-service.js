import { getProblemsInCategoryOrder } from "./learning-flow-service.js";
import { getAttempts, isReviewArchived, isReviewDeleted, isReviewResolved } from "./student-progress-service.js";

export const REVIEW_MIN_WRONG_COUNT = 2;

export function getTotalWrongCount(progress) {
  if (!progress) {
    return 0;
  }

  return getAttempts(progress).reduce((sum, attempt) => {
    return sum + (attempt.wrongCount ?? 0);
  }, 0);
}

export function isReviewEligible(progress, minWrongCount = REVIEW_MIN_WRONG_COUNT) {
  if (!progress || isReviewResolved(progress) || isReviewArchived(progress) || isReviewDeleted(progress)) {
    return false;
  }

  return getTotalWrongCount(progress) >= minWrongCount;
}

export function getReviewProblemsForCategory(
  categoryName,
  problems,
  progressByProblemId = null,
  { minWrongCount = REVIEW_MIN_WRONG_COUNT } = {},
) {
  return getProblemsInCategoryOrder(categoryName, problems, options)
    .map(({ problem, index }) => {
      const progress = progressByProblemId?.get(problem.id) ?? null;
      const totalWrongCount = getTotalWrongCount(progress);
      return {
        problem,
        index,
        totalWrongCount,
        progress,
      };
    })
    .filter((entry) => isReviewEligible(entry.progress, minWrongCount))
    .sort((left, right) => right.totalWrongCount - left.totalWrongCount);
}

export function hasReviewProblems(categoryName, problems, progressByProblemId, options) {
  return getReviewProblemsForCategory(categoryName, problems, progressByProblemId, options).length > 0;
}

export function buildReviewQueue(categoryName, problems, progressByProblemId, options) {
  const reviewProblems = getReviewProblemsForCategory(
    categoryName,
    problems,
    progressByProblemId,
    options,
  );

  return reviewProblems.map((entry, entryIndex) => ({
    problem: entry.problem,
    index: entry.index,
    totalWrongCount: entry.totalWrongCount,
    positionInQueue: entryIndex + 1,
    totalInQueue: reviewProblems.length,
    categoryName,
  }));
}

export function getReviewOffer(categoryName, problems, progressByProblemId, options) {
  const queue = buildReviewQueue(categoryName, problems, progressByProblemId, options);
  if (queue.length === 0) {
    return null;
  }

  return {
    categoryName,
    levelGroup: options?.levelGroup,
    problemCount: queue.length,
    queue,
  };
}
