import {
  completeCategoryReviewOffer,
  ensureCategoryReviewOfferFromReviewOffer,
  getPendingCategoryReviewOffersForUser,
} from "./category-review-offer-service.js";
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
  options = {},
) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const { minWrongCount = REVIEW_MIN_WRONG_COUNT, levelGroup } = options;

  return getProblemsInCategoryOrder(normalizedCategory, problems, { levelGroup })
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
    .filter(
      (entry) =>
        entry.problem.category === normalizedCategory &&
        isReviewEligible(entry.progress, minWrongCount),
    )
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
  const normalizedCategory = String(categoryName ?? "").trim();
  if (!normalizedCategory) {
    return null;
  }

  const queue = buildReviewQueue(normalizedCategory, problems, progressByProblemId, options);
  if (queue.length === 0) {
    return null;
  }

  return {
    categoryName: normalizedCategory,
    levelGroup: options?.levelGroup,
    problemCount: queue.length,
    queue,
  };
}

function buildReviewQueueFromEntries(categoryName, entries) {
  const normalizedCategory = String(categoryName ?? "").trim();

  return entries.map((entry, entryIndex) => ({
    problem: entry.problem,
    index: entry.index,
    totalWrongCount: entry.totalWrongCount,
    positionInQueue: entryIndex + 1,
    totalInQueue: entries.length,
    categoryName: normalizedCategory,
  }));
}

/** 저장된 카테고리 복습 스냅샷 → UI용 reviewOffer (pending 유지) */
export function buildReviewOfferFromSnapshot(snapshot, problems, progressByProblemId) {
  if (!snapshot?.categoryName || !Array.isArray(snapshot.problemIds)) {
    return null;
  }

  const normalizedCategory = String(snapshot.categoryName).trim();
  const categoryProblems = getProblemsInCategoryOrder(normalizedCategory, problems, {
    levelGroup: snapshot.levelGroup,
  });
  const indexByProblemId = new Map(
    categoryProblems.map(({ problem, index }) => [problem.id, index]),
  );

  const entries = snapshot.problemIds
    .map((problemId) => {
      const problem = problems.find((item) => item.id === problemId);
      const index = indexByProblemId.get(problemId);
      if (!problem || problem.category !== normalizedCategory || index === undefined) {
        return null;
      }

      const progress = progressByProblemId?.get(problemId) ?? null;
      if (!progress || isReviewResolved(progress) || isReviewArchived(progress) || isReviewDeleted(progress)) {
        return null;
      }

      return {
        problem,
        index,
        totalWrongCount: getTotalWrongCount(progress),
        progress,
      };
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return null;
  }

  const queue = buildReviewQueueFromEntries(normalizedCategory, entries);
  return {
    categoryName: normalizedCategory,
    levelGroup: snapshot.levelGroup,
    problemCount: queue.length,
    queue,
    persistedOfferId: snapshot.id,
  };
}

/**
 * 학습 화면 복습 추천 — 저장된 pending offer 우선 (카테고리 이동 후에도 유지).
 */
export function getPersistentReviewOffersForLevel({
  user,
  categoryRows,
  problems,
  progressByProblemId,
  levelGroup,
}) {
  if (!user?.id) {
    return [];
  }

  const normalizedLevelGroup = levelGroup;
  const pendingSnapshots = getPendingCategoryReviewOffersForUser(user.id, {
    levelGroup: normalizedLevelGroup,
  });
  const offersByCategory = new Map();

  pendingSnapshots.forEach((snapshot) => {
    const offer = buildReviewOfferFromSnapshot(snapshot, problems, progressByProblemId);
    if (offer) {
      offersByCategory.set(offer.categoryName, offer);
      return;
    }

    completeCategoryReviewOffer({
      userId: user.id,
      categoryName: snapshot.categoryName,
      levelGroup: snapshot.levelGroup,
    });
  });

  (categoryRows ?? [])
    .filter((row) => row?.isComplete && row?.name)
    .forEach((row) => {
      if (offersByCategory.has(row.name)) {
        return;
      }

      const liveOffer = getReviewOffer(row.name, problems, progressByProblemId, {
        levelGroup: normalizedLevelGroup,
      });
      if (!liveOffer) {
        return;
      }

      ensureCategoryReviewOfferFromReviewOffer(user, liveOffer);
      offersByCategory.set(row.name, liveOffer);
    });

  return [...offersByCategory.values()];
}

/** @deprecated study 화면은 getPersistentReviewOffersForLevel 사용 */
export function getReviewOffersForCompletedCategories(
  categoryRows,
  problems,
  progressByProblemId,
  { levelGroup, user = null } = {},
) {
  if (user?.id) {
    return getPersistentReviewOffersForLevel({
      user,
      categoryRows,
      problems,
      progressByProblemId,
      levelGroup,
    });
  }

  if (!Array.isArray(categoryRows) || categoryRows.length === 0) {
    return [];
  }

  return categoryRows
    .filter((row) => row?.isComplete && row?.name)
    .map((row) =>
      getReviewOffer(row.name, problems, progressByProblemId, {
        levelGroup,
      }),
    )
    .filter(Boolean);
}
