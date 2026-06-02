import { getStudentCurriculumOverview } from "./student-curriculum-progress-service.js";
import { getStudentProjectedGradeSummary } from "./student-growth-report-service.js";

/**
 * 학원관리 카드용 관리 요약 (목록에서 확인하는 운영·전달 요약).
 *
 * @param {string} userId
 * @param {object[]} problems
 */
export function getStudentAcademyCardSummary(userId, problems = []) {
  const curriculum = getStudentCurriculumOverview(userId, problems);
  const projectedGrade = getStudentProjectedGradeSummary(userId, problems);

  return {
    activeLevelGroup: curriculum.activeLevelGroup,
    activeLevelGroupPercent: curriculum.activeLevelGroupPercent ?? 0,
    statusLabel: curriculum.activeLevelGroupStatusLabel,
    recentCategory: curriculum.recentCategory,
    projectedGradeLabel: projectedGrade.projectedGradeLabel ?? "참고 어려움",
  };
}

/**
 * 학생 프로필 허브 ViewModel — 카드에 없는 운영 정보만.
 *
 * @param {{
 *   studentName?: string,
 *   generatedAt?: string,
 *   officialGrade?: {
 *     gradeCode: string,
 *     gradeLabel: string,
 *     acquiredAt: string,
 *     gradeSource: string,
 *     gradeSourceLabel: string,
 *   } | null,
 * }} [options]
 */
export function buildStudentAcademyProfileView(options = {}) {
  const officialGradeRecord = options.officialGrade ?? null;

  return {
    studentName: options.studentName ?? "",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    officialGrade: officialGradeRecord
      ? {
          status: "registered",
          gradeCode: officialGradeRecord.gradeCode,
          gradeLabel: officialGradeRecord.gradeLabel,
          acquiredAt: officialGradeRecord.acquiredAt,
          gradeSource: officialGradeRecord.gradeSource,
          gradeSourceLabel: officialGradeRecord.gradeSourceLabel,
        }
      : {
          status: "unregistered",
          gradeLabel: "미등록",
        },
    promotionReview: {
      status: "pending",
      label: "준비 중",
      note: "승급 추천·응시·결과 관리는 추후 제공됩니다.",
    },
    consultation: {
      status: "pending",
      label: "준비 중",
      note: "원장·선생 상담 메모는 추후 제공됩니다.",
    },
    parentDeliveryHistory: {
      status: "empty",
      label: "기록 없음",
      note: "성장리포트 전달·상담 공유 이력은 추후 제공됩니다.",
    },
    attendance: {
      status: "pending",
      label: "준비 중",
      note: "출결 관리는 추후 제공됩니다.",
    },
    paymentStatus: {
      status: "pending",
      label: "준비 중",
      note: "결제·수강료 확인은 추후 제공됩니다.",
    },
  };
}
