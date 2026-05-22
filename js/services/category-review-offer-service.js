import { DEBUG_CHANNELS, DEBUG_SOURCES, debugSync } from "../bootstrap/debug-logs.js";
import { normalizeLevelGroup } from "./level-group-service.js";

const PROGRESS = DEBUG_CHANNELS.progress;

export const CATEGORY_REVIEW_OFFER_STATUS = {
  pending: "pending",
  completed: "completed",
  dismissed: "dismissed",
};

const CATEGORY_REVIEW_OFFERS_STORAGE_KEY = "BADUK_CATEGORY_REVIEW_OFFERS";

function normalizeCategoryName(categoryName) {
  return String(categoryName ?? "").trim();
}

function createOfferId(userId, categoryName, levelGroup) {
  return `category-review-${userId}-${normalizeLevelGroup(levelGroup)}-${normalizeCategoryName(categoryName)}`;
}

export function readCategoryReviewOffers() {
  try {
    const offers = JSON.parse(localStorage.getItem(CATEGORY_REVIEW_OFFERS_STORAGE_KEY));
    return Array.isArray(offers) ? offers : [];
  } catch {
    return [];
  }
}

export function saveCategoryReviewOffers(offers) {
  localStorage.setItem(CATEGORY_REVIEW_OFFERS_STORAGE_KEY, JSON.stringify(offers));
}

export function findCategoryReviewOffer({ userId, categoryName, levelGroup, status = null }) {
  const normalizedCategory = normalizeCategoryName(categoryName);
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const offerId = createOfferId(userId, normalizedCategory, normalizedLevelGroup);

  return (
    readCategoryReviewOffers().find((offer) => {
      if (offer.id !== offerId) {
        return false;
      }
      if (status && offer.status !== status) {
        return false;
      }
      return true;
    }) ?? null
  );
}

export function getPendingCategoryReviewOffersForUser(userId, { levelGroup = null } = {}) {
  if (!userId) {
    return [];
  }

  const normalizedLevelGroup = levelGroup ? normalizeLevelGroup(levelGroup) : null;

  return readCategoryReviewOffers()
    .filter((offer) => {
      if (offer.userId !== userId || offer.status !== CATEGORY_REVIEW_OFFER_STATUS.pending) {
        return false;
      }
      if (normalizedLevelGroup && normalizeLevelGroup(offer.levelGroup) !== normalizedLevelGroup) {
        return false;
      }
      return Array.isArray(offer.problemIds) && offer.problemIds.length > 0;
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
    );
}

/**
 * 카테고리 완료 시 복습 추천 스냅샷 저장 (이미 pending 이면 유지).
 */
export function ensureCategoryReviewOffer({ user, categoryName, levelGroup, problemIds }) {
  if (!user?.id) {
    return null;
  }

  const normalizedCategory = normalizeCategoryName(categoryName);
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const uniqueProblemIds = [...new Set((problemIds ?? []).filter(Boolean))];

  if (!normalizedCategory || uniqueProblemIds.length === 0) {
    return null;
  }

  const existingPending = findCategoryReviewOffer({
    userId: user.id,
    categoryName: normalizedCategory,
    levelGroup: normalizedLevelGroup,
    status: CATEGORY_REVIEW_OFFER_STATUS.pending,
  });

  if (existingPending) {
    return existingPending;
  }

  const now = new Date().toISOString();
  const nextOffer = {
    id: createOfferId(user.id, normalizedCategory, normalizedLevelGroup),
    userId: user.id,
    categoryName: normalizedCategory,
    levelGroup: normalizedLevelGroup,
    status: CATEGORY_REVIEW_OFFER_STATUS.pending,
    problemIds: uniqueProblemIds,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    dismissedAt: null,
  };

  const allOffers = readCategoryReviewOffers().filter((offer) => offer.id !== nextOffer.id);
  saveCategoryReviewOffers([nextOffer, ...allOffers]);

  debugSync(PROGRESS, "category review offer created", {
    source: DEBUG_SOURCES.localCache,
    categoryName: normalizedCategory,
    levelGroup: normalizedLevelGroup,
    problemCount: uniqueProblemIds.length,
  });

  return nextOffer;
}

export function ensureCategoryReviewOfferFromReviewOffer(user, reviewOffer) {
  if (!reviewOffer?.categoryName || !Array.isArray(reviewOffer.queue)) {
    return null;
  }

  return ensureCategoryReviewOffer({
    user,
    categoryName: reviewOffer.categoryName,
    levelGroup: reviewOffer.levelGroup,
    problemIds: reviewOffer.queue.map((item) => item.problem?.id).filter(Boolean),
  });
}

export function updateCategoryReviewOfferStatus({
  userId,
  categoryName,
  levelGroup,
  status,
  timestamp = new Date().toISOString(),
}) {
  const normalizedCategory = normalizeCategoryName(categoryName);
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const offerId = createOfferId(userId, normalizedCategory, normalizedLevelGroup);
  const allOffers = readCategoryReviewOffers();
  const target = allOffers.find((offer) => offer.id === offerId);

  if (!target) {
    return null;
  }

  const nextOffer = {
    ...target,
    status,
    updatedAt: timestamp,
    completedAt: status === CATEGORY_REVIEW_OFFER_STATUS.completed ? timestamp : target.completedAt,
    dismissedAt: status === CATEGORY_REVIEW_OFFER_STATUS.dismissed ? timestamp : target.dismissedAt,
  };

  saveCategoryReviewOffers([
    nextOffer,
    ...allOffers.filter((offer) => offer.id !== offerId),
  ]);

  debugSync(PROGRESS, "category review offer status updated", {
    source: DEBUG_SOURCES.localCache,
    categoryName: normalizedCategory,
    levelGroup: normalizedLevelGroup,
    status,
  });

  return nextOffer;
}

export function completeCategoryReviewOffer({ userId, categoryName, levelGroup }) {
  return updateCategoryReviewOfferStatus({
    userId,
    categoryName,
    levelGroup,
    status: CATEGORY_REVIEW_OFFER_STATUS.completed,
  });
}

export function dismissCategoryReviewOffer({ userId, categoryName, levelGroup }) {
  return updateCategoryReviewOfferStatus({
    userId,
    categoryName,
    levelGroup,
    status: CATEGORY_REVIEW_OFFER_STATUS.dismissed,
  });
}

export function deleteCategoryReviewOffersByUserId(userId) {
  if (!userId) {
    return { removedCount: 0 };
  }

  const allOffers = readCategoryReviewOffers();
  const nextOffers = allOffers.filter((offer) => offer.userId !== userId);
  const removedCount = allOffers.length - nextOffers.length;
  saveCategoryReviewOffers(nextOffers);
  return { removedCount };
}
