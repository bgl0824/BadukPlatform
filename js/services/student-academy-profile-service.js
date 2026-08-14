import { getStudentCurriculumOverview } from "./student-curriculum-progress-service.js";
import { getStudentProjectedGradeSummary } from "./student-growth-report-service.js";
import { getStudentCardPaymentSummary } from "./student-payment-service.js";

/**
 * 학원관리 카드용 관리 요약 (목록에서 확인하는 운영·전달 요약).
 *
 * @param {string} userId
 * @param {object[]} problems
 * @param {{ academyId?: string }} [options]
 */
export function getStudentAcademyCardSummary(userId, problems = [], options = {}) {
  const curriculum = getStudentCurriculumOverview(userId, problems);
  const projectedGrade = getStudentProjectedGradeSummary(userId, problems);
  const academyId = String(options.academyId ?? "").trim();
  const payment = academyId ? getStudentCardPaymentSummary(academyId, userId) : null;

  return {
    activeLevelGroup: curriculum.activeLevelGroup,
    activeLevelGroupPercent: curriculum.activeLevelGroupPercent ?? 0,
    statusLabel: curriculum.activeLevelGroupStatusLabel,
    recentCategory: curriculum.recentCategory,
    projectedGradeLabel: projectedGrade.projectedGradeLabel ?? "참고 어려움",
    payment,
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
 *   guardianProfile?: {
 *     guardian_phone?: string,
 *     attendance_notification_enabled?: boolean,
 *   } | null,
 *   paymentProfile?: {
 *     settings?: { monthly_fee?: number | null, billing_day?: number | null },
 *     monthlyFeeLabel?: string,
 *     billingDayLabel?: string,
 *     invoices?: Array<{
 *       billingMonth: string,
 *       historyLabel: string,
 *       status: string,
 *       statusLabel: string,
 *       amountLabel: string,
 *     }>,
 *   } | null,
 * }} [options]
 */
export function buildStudentAcademyProfileView(options = {}) {
  const officialGradeRecord = options.officialGrade ?? null;
  const guardianProfile = options.guardianProfile ?? null;
  const paymentProfile = options.paymentProfile ?? null;
  const guardianPhone = String(guardianProfile?.guardian_phone ?? "");
  const attendanceNotificationEnabled =
    guardianProfile?.attendance_notification_enabled !== false;

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
    guardianInfo: {
      guardian_phone: guardianPhone,
      attendance_notification_enabled: attendanceNotificationEnabled,
      phoneLabel: guardianPhone ? undefined : "미등록",
      notificationLabel: attendanceNotificationEnabled ? "사용" : "미사용",
    },
    attendance: {
      status: "pending",
      label: "준비 중",
      note: "출결 관리는 추후 제공됩니다.",
    },
    payment: {
      monthly_fee: paymentProfile?.settings?.monthly_fee ?? null,
      billing_day: paymentProfile?.settings?.billing_day ?? null,
      monthlyFeeLabel: paymentProfile?.monthlyFeeLabel ?? "미설정",
      billingDayLabel: paymentProfile?.billingDayLabel ?? "미설정",
      invoices: Array.isArray(paymentProfile?.invoices) ? paymentProfile.invoices : [],
    },
  };
}
