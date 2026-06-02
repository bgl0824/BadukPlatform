import { getOrderedCategoryNames, readCategories } from "./category-service.js";
import {
  formatGradeLevelLabel,
  getGradeLevelSortKey,
  GRADE_LEVELS,
  normalizeGradeLevelCode,
} from "./grade-level-service.js";
import {
  getCategoryProgressRow,
  getContinueTargetForCategory,
  getProblemsInCategoryOrder,
} from "./learning-flow-service.js";
import { getTotalWrongCount } from "./review-service.js";
import { getStudentCurriculumOverview } from "./student-curriculum-progress-service.js";
import {
  getProgressStatus,
  getStudentProgressByUserId,
  isReviewDeleted,
  isReviewResolved,
  PROGRESS_STATUS,
} from "./student-progress-service.js";
import { normalizeLevelGroup } from "./level-group-service.js";

export const GROWTH_REPORT_WINDOW_DAYS = 28;

/** 과정 완료율 → 참고 예상 급수 (v1 규칙) */
const LEVEL_GROUP_GRADE_BANDS = {
  입문: [
    { maxPercent: 29, code: "30k" },
    { maxPercent: 69, code: "25k" },
    { maxPercent: 99, code: "20k" },
    { maxPercent: 100, code: "18k" },
  ],
  초급: [
    { maxPercent: 29, code: "15k" },
    { maxPercent: 69, code: "12k" },
    { maxPercent: 99, code: "8k" },
    { maxPercent: 100, code: "6k" },
  ],
  중급: [
    { maxPercent: 29, code: "5k" },
    { maxPercent: 69, code: "3k" },
    { maxPercent: 99, code: "1k" },
    { maxPercent: 100, code: "1d" },
  ],
  고급: [
    { maxPercent: 29, code: "1d" },
    { maxPercent: 69, code: "2d" },
    { maxPercent: 99, code: "3d" },
    { maxPercent: 100, code: "4d" },
  ],
  유단자: [
    { maxPercent: 29, code: "2d" },
    { maxPercent: 69, code: "3d" },
    { maxPercent: 99, code: "4d" },
    { maxPercent: 100, code: "5d" },
  ],
};

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isInActiveLevelGroup(problem, activeLevelGroup) {
  if (!problem) {
    return false;
  }
  return normalizeLevelGroup(problem.levelGroup) === normalizeLevelGroup(activeLevelGroup);
}


function countRecentSolvedInLevelGroup(progressList, problems, activeLevelGroup, windowDays) {
  const since = parseTimestamp(daysAgoIso(windowDays));
  if (!since) {
    return 0;
  }

  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  return progressList.filter((progress) => {
    if (getProgressStatus(progress) !== PROGRESS_STATUS.solved) {
      return false;
    }
    const solvedAt = parseTimestamp(progress.solvedAt ?? progress.updatedAt);
    if (!solvedAt || solvedAt < since) {
      return false;
    }
    const problem = problemById.get(progress.problemId);
    return isInActiveLevelGroup(problem, activeLevelGroup);
  }).length;
}

function buildCategoryMetrics(activeLevelGroup, problems, progressByProblemId) {
  const categories = readCategories();
  const categoryNames = getOrderedCategoryNames(categories, { levelGroup: activeLevelGroup });

  return categoryNames
    .map((categoryName) => {
      const row = getCategoryProgressRow(categoryName, problems, progressByProblemId, {
        levelGroup: activeLevelGroup,
      });
      if (row.total <= 0) {
        return null;
      }

      const categoryProblems = getProblemsInCategoryOrder(categoryName, problems, {
        levelGroup: activeLevelGroup,
      });
      let repeatWrongCount = 0;
      let wrongNoteCount = 0;
      let totalWrongEvents = 0;
      let startedCount = 0;

      categoryProblems.forEach(({ problem }) => {
        const progress = progressByProblemId.get(problem.id);
        if (!progress || isReviewDeleted(progress)) {
          return;
        }

        startedCount += 1;
        const wrongTotal = getTotalWrongCount(progress);
        if (wrongTotal > 0) {
          wrongNoteCount += 1;
          totalWrongEvents += wrongTotal;
        }
        if (wrongTotal >= 2) {
          repeatWrongCount += 1;
        }
      });

      const completionRate = row.total > 0 ? row.solved / row.total : 0;
      const wrongRateOnSolved = row.solved > 0 ? totalWrongEvents / row.solved : totalWrongEvents;
      const strengthScore =
        completionRate * 100 -
        (row.solved > 0 ? repeatWrongCount / row.solved : 0) * 20 -
        wrongRateOnSolved * 4;
      const weaknessScore =
        (1 - completionRate) * 100 +
        (startedCount > 0 ? repeatWrongCount / startedCount : 0) * 25 +
        wrongRateOnSolved * 3;

      return {
        categoryName,
        solved: row.solved,
        total: row.total,
        completionRate,
        completionPercent: Math.round(completionRate * 100),
        isComplete: row.isComplete,
        isInProgress: row.isInProgress,
        startedCount,
        repeatWrongCount,
        wrongNoteCount,
        strengthScore,
        weaknessScore,
      };
    })
    .filter(Boolean);
}

function pickStrengthCategories(metrics) {
  return [...metrics]
    .filter((row) => row.solved >= 2)
    .sort((left, right) => right.strengthScore - left.strengthScore)
    .slice(0, 2);
}

function pickWeaknessCategories(metrics, strengthNames) {
  const strengthSet = new Set(strengthNames);
  return [...metrics]
    .filter(
      (row) =>
        !strengthSet.has(row.categoryName) &&
        row.startedCount > 0 &&
        (!row.isComplete || row.repeatWrongCount > 0 || row.completionPercent < 70),
    )
    .sort((left, right) => right.weaknessScore - left.weaknessScore)
    .slice(0, 2);
}

function resolveRecommendedCategory({
  activeLevelGroup,
  problems,
  progressList,
  progressByProblemId,
  weaknessCategories,
}) {
  if (weaknessCategories.length > 0) {
    const incompleteWeak = weaknessCategories.find((row) => !row.isComplete);
    if (incompleteWeak) {
      return {
        categoryName: incompleteWeak.categoryName,
        reason: "보완이 필요한 유형을 우선 추천합니다.",
      };
    }
  }

  const categories = readCategories();
  const categoryNames = getOrderedCategoryNames(categories, { levelGroup: activeLevelGroup });
  for (const categoryName of categoryNames) {
    const row = getCategoryProgressRow(categoryName, problems, progressByProblemId, {
      levelGroup: activeLevelGroup,
    });
    if (row.total > 0 && !row.isComplete) {
      const continueTarget = getContinueTargetForCategory(categoryName, {
        progressList,
        problems,
        progressByProblemId,
        levelGroup: activeLevelGroup,
      });
      if (continueTarget) {
        return {
          categoryName,
          reason: "현재 과정에서 이어서 학습할 카테고리입니다.",
        };
      }
      return {
        categoryName,
        reason: "아직 완료하지 않은 카테고리입니다.",
      };
    }
  }

  return null;
}

function buildReviewSection(progressList, problems, activeLevelGroup) {
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  let wrongNoteCount = 0;
  let reviewResolvedCount = 0;
  let repeatWrongCount = 0;

  progressList.forEach((progress) => {
    const problem = problemById.get(progress.problemId);
    if (!isInActiveLevelGroup(problem, activeLevelGroup)) {
      return;
    }
    if (isReviewDeleted(progress)) {
      return;
    }

    const wrongTotal = getTotalWrongCount(progress);
    if (wrongTotal > 0) {
      wrongNoteCount += 1;
    }
    if (wrongTotal >= 2) {
      repeatWrongCount += 1;
    }
    if (isReviewResolved(progress)) {
      reviewResolvedCount += 1;
    }
  });

  let parentSentence = "";
  if (wrongNoteCount === 0) {
    parentSentence = "아직 기록된 오답 문제가 없습니다.";
  } else if (reviewResolvedCount > 0) {
    parentSentence = `틀린 문제 ${wrongNoteCount}개 중 ${reviewResolvedCount}개를 다시 풀어 맞췄습니다.`;
  } else {
    parentSentence = `틀린 문제 ${wrongNoteCount}개가 오답노트에 있습니다.`;
  }

  if (repeatWrongCount > 0) {
    parentSentence += ` 반복해서 틀린 문제는 ${repeatWrongCount}개입니다.`;
  }

  return {
    wrongNoteCount,
    reviewResolvedCount,
    repeatWrongCount,
    parentSentence,
  };
}

function gradeFromLevelGroupPercent(levelGroup, percent) {
  const bands = LEVEL_GROUP_GRADE_BANDS[normalizeLevelGroup(levelGroup)] ?? LEVEL_GROUP_GRADE_BANDS.입문;
  for (const band of bands) {
    if (percent <= band.maxPercent) {
      return band.code;
    }
  }
  return bands[bands.length - 1]?.code ?? "30k";
}

function shiftGradeCode(code, penaltySteps) {
  const normalized = normalizeGradeLevelCode(code);
  if (!normalized) {
    return null;
  }
  const index = GRADE_LEVELS.findIndex((entry) => entry.code === normalized);
  if (index < 0) {
    return normalized;
  }
  const nextIndex = Math.min(GRADE_LEVELS.length - 1, index + penaltySteps);
  return GRADE_LEVELS[nextIndex]?.code ?? normalized;
}

function dominantGradeFromSolved(progressList, problems, activeLevelGroup) {
  const problemById = new Map(problems.map((problem) => [problem.id, problem]));
  const counts = new Map();

  progressList.forEach((progress) => {
    if (getProgressStatus(progress) !== PROGRESS_STATUS.solved) {
      return;
    }
    const problem = problemById.get(progress.problemId);
    if (!isInActiveLevelGroup(problem, activeLevelGroup)) {
      return;
    }
    const code = normalizeGradeLevelCode(problem?.gradeLevel);
    if (!code) {
      return;
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
  });

  let bestCode = null;
  let bestCount = 0;
  counts.forEach((count, code) => {
    if (count > bestCount || (count === bestCount && getGradeLevelSortKey(code) < getGradeLevelSortKey(bestCode))) {
      bestCode = code;
      bestCount = count;
    }
  });

  return bestCode ? { code: bestCode, count: bestCount } : null;
}

function buildProjectedGradeSection({
  activeLevelGroup,
  activePercent,
  solvedInBand,
  repeatWrongCount,
  wrongNoteCount,
  progressList,
  problems,
}) {
  let code = gradeFromLevelGroupPercent(activeLevelGroup, activePercent);
  let basisParts = [`${activeLevelGroup} 과정 ${activePercent}%`];

  const dominant = dominantGradeFromSolved(progressList, problems, activeLevelGroup);
  if (dominant && dominant.count >= 5) {
    code = dominant.code;
    basisParts.push(`완료 문제 급수 분포(${formatGradeLevelLabel(dominant.code)})`);
  }

  const repeatRate = solvedInBand > 0 ? repeatWrongCount / solvedInBand : 0;
  if (repeatRate >= 0.3) {
    code = shiftGradeCode(code, 1) ?? code;
    basisParts.push("반복 오답 보정");
  }

  const label = formatGradeLevelLabel(code, { emptyLabel: "참고 어려움" });
  const lowConfidence = solvedInBand < 5;

  let basisSummary = basisParts.join(" · ");
  if (lowConfidence) {
    basisSummary += " · 풀이 기록이 적어 참고용입니다";
  }
  if (wrongNoteCount === 0 && solvedInBand < 3) {
    return {
      projectedGradeCode: null,
      projectedGradeLabel: null,
      basisSummary: "풀이 기록이 아직 적어 예상 급수를 표시하지 않습니다.",
      disclaimer: "공식 급수가 아닌 참고용 추정치입니다. 승급시험 합격 후 공식 급수가 기록됩니다.",
      lowConfidence: true,
    };
  }

  return {
    projectedGradeCode: code,
    projectedGradeLabel: label,
    basisSummary,
    disclaimer: "공식 급수가 아닌 참고용 추정치입니다. 승급시험 합격 후 공식 급수가 기록됩니다.",
    lowConfidence,
  };
}

/**
 * 성장리포트 전체 없이 예상급수 요약만 계산 (카드·프로필 허브용).
 *
 * @param {string} userId
 * @param {object[]} problems
 */
export function getStudentProjectedGradeSummary(userId, problems = []) {
  const progressList = getStudentProgressByUserId(userId);
  const curriculum = getStudentCurriculumOverview(userId, problems);
  const activeLevelGroup = curriculum.activeLevelGroup;
  const activePercent = curriculum.activeLevelGroupPercent ?? 0;
  const review = buildReviewSection(progressList, problems, activeLevelGroup);
  const solvedInBand = curriculum.solvedProblemCount ?? 0;

  return buildProjectedGradeSection({
    activeLevelGroup,
    activePercent,
    solvedInBand,
    repeatWrongCount: review.repeatWrongCount,
    wrongNoteCount: review.wrongNoteCount,
    progressList,
    problems,
  });
}

/**
 * @param {string} userId
 * @param {object[]} problems
 * @param {{ windowDays?: number, studentName?: string, generatedAt?: string }} [options]
 */
export function buildStudentGrowthReport(userId, problems = [], options = {}) {
  const windowDays = options.windowDays ?? GROWTH_REPORT_WINDOW_DAYS;
  const progressList = getStudentProgressByUserId(userId);
  const progressByProblemId = new Map(progressList.map((progress) => [progress.problemId, progress]));
  const curriculum = getStudentCurriculumOverview(userId, problems);
  const activeLevelGroup = curriculum.activeLevelGroup;
  const activePercent = curriculum.activeLevelGroupPercent ?? 0;

  const recentSolvedCount = countRecentSolvedInLevelGroup(
    progressList,
    problems,
    activeLevelGroup,
    windowDays,
  );

  const categoryMetrics = buildCategoryMetrics(activeLevelGroup, problems, progressByProblemId);
  const strengths = pickStrengthCategories(categoryMetrics);
  const weaknesses = pickWeaknessCategories(
    categoryMetrics,
    strengths.map((row) => row.categoryName),
  );
  const recommended = resolveRecommendedCategory({
    activeLevelGroup,
    problems,
    progressList,
    progressByProblemId,
    weaknessCategories: weaknesses,
  });

  const review = buildReviewSection(progressList, problems, activeLevelGroup);
  const solvedInBand = curriculum.solvedProblemCount ?? 0;

  const projectedGrade = buildProjectedGradeSection({
    activeLevelGroup,
    activePercent,
    solvedInBand,
    repeatWrongCount: review.repeatWrongCount,
    wrongNoteCount: review.wrongNoteCount,
    progressList,
    problems,
  });

  return {
    version: "v1",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    studentName: options.studentName ?? "",
    windowDays,
    curriculumProgress: {
      activeLevelGroup,
      activeLevelGroupStatusLabel: curriculum.activeLevelGroupStatusLabel,
      completionPercent: activePercent,
      solvedCount: curriculum.solvedProblemCount ?? 0,
      totalCount: curriculum.totalProblemCount ?? 0,
      recentSolvedCount,
      recentWindowLabel: `최근 ${windowDays}일`,
    },
    categoryAnalysis: {
      strengths: strengths.map((row) => ({
        categoryName: row.categoryName,
        solved: row.solved,
        total: row.total,
        completionPercent: row.completionPercent,
      })),
      weaknesses: weaknesses.map((row) => ({
        categoryName: row.categoryName,
        solved: row.solved,
        total: row.total,
        completionPercent: row.completionPercent,
        repeatWrongCount: row.repeatWrongCount,
      })),
      recommended: recommended
        ? {
            categoryName: recommended.categoryName,
            reason: recommended.reason,
          }
        : null,
    },
    reviewHabits: review,
    projectedGrade,
  };
}

export function formatStudentGrowthReportPlainText(report) {
  if (!report) {
    return "";
  }

  const lines = [];
  const namePrefix = report.studentName ? `${report.studentName} ` : "";

  lines.push(`${namePrefix}성장리포트 (V1)`);
  lines.push(`작성 기준: ${report.generatedAt?.slice(0, 10) ?? ""}`);
  lines.push("");

  lines.push("[1. 과정 진행]");
  lines.push(
    `현재 과정: ${report.curriculumProgress.activeLevelGroup} (${report.curriculumProgress.activeLevelGroupStatusLabel})`,
  );
  lines.push(
    `완료율: ${report.curriculumProgress.completionPercent}% (${report.curriculumProgress.solvedCount}/${report.curriculumProgress.totalCount}문제)`,
  );
  lines.push(
    `${report.curriculumProgress.recentWindowLabel} 새로 완료: ${report.curriculumProgress.recentSolvedCount}문제`,
  );
  lines.push("");

  lines.push("[2. 카테고리 분석]");
  if (report.categoryAnalysis.strengths.length) {
    lines.push(
      `강점: ${report.categoryAnalysis.strengths.map((row) => `${row.categoryName} ${row.solved}/${row.total}`).join(", ")}`,
    );
  } else {
    lines.push("강점: 아직 판단할 기록이 부족합니다.");
  }
  if (report.categoryAnalysis.weaknesses.length) {
    lines.push(
      `보완: ${report.categoryAnalysis.weaknesses.map((row) => `${row.categoryName} ${row.solved}/${row.total}`).join(", ")}`,
    );
  } else {
    lines.push("보완: 뚜렷한 보완 유형이 없습니다.");
  }
  if (report.categoryAnalysis.recommended) {
    lines.push(`추천 학습: ${report.categoryAnalysis.recommended.categoryName}`);
  }
  lines.push("");

  lines.push("[3. 복습 습관]");
  lines.push(`오답노트 문제: ${report.reviewHabits.wrongNoteCount}개`);
  lines.push(`복습 완료: ${report.reviewHabits.reviewResolvedCount}개`);
  lines.push(`반복 오답: ${report.reviewHabits.repeatWrongCount}개`);
  lines.push(report.reviewHabits.parentSentence);
  lines.push("");

  lines.push("[4. 예상 급수 (참고)]");
  if (report.projectedGrade.projectedGradeLabel) {
    lines.push(`예상: ${report.projectedGrade.projectedGradeLabel}`);
    lines.push(`근거: ${report.projectedGrade.basisSummary}`);
  } else {
    lines.push(report.projectedGrade.basisSummary);
  }
  lines.push(report.projectedGrade.disclaimer);

  return lines.join("\n");
}
