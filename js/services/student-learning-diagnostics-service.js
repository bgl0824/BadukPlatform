import { getTotalWrongCount, isReviewEligible } from "./review-service.js";
import {
  getStudentProgressByUserId,
  isReviewArchived,
  isReviewDeleted,
} from "./student-progress-service.js";

/**
 * 학습관리 카드·진단용 경량 집계 (student_progress 단일 소스).
 *
 * @param {string} userId
 */
export function getStudentLearningDiagnostics(userId) {
  const progressList = getStudentProgressByUserId(userId);
  let wrongNoteCount = 0;
  let reviewNeededCount = 0;

  progressList.forEach((progress) => {
    if (isReviewDeleted(progress)) {
      return;
    }

    const wrongTotal = getTotalWrongCount(progress);
    if (wrongTotal > 0 && !isReviewArchived(progress)) {
      wrongNoteCount += 1;
    }

    if (isReviewEligible(progress)) {
      reviewNeededCount += 1;
    }
  });

  const recentProgress = progressList[0] ?? null;

  return {
    wrongNoteCount,
    reviewNeededCount,
    recentActivityAt: recentProgress?.updatedAt ?? recentProgress?.solvedAt ?? null,
    recentCategory: recentProgress?.category ?? "기록 없음",
  };
}
