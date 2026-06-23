import { CURRICULUM_PROGRESS_STATUS } from "./student-curriculum-progress-service.js";
import { LEVEL_GROUPS, normalizeLevelGroup } from "./level-group-service.js";

const FINISHING_PERCENT_THRESHOLD = 90;

const LEVEL_GROUP_CAPABILITY = {
  입문: {
    completePhrase: "돌을 잡는 원리와 기본 전술을 익혔습니다",
    inProgressPhrase: "돌을 잡는 원리와 기본 전술을 익히는 과정을 학습 중입니다",
  },
  초급: {
    completePhrase: "기본 전술을 익히고 실전 감각을 키웠습니다",
    inProgressPhrase: "기본 전술과 실전 감각을 키우는 과정을 학습 중입니다",
  },
  중급: {
    completePhrase: "전술과 형세 판단력을 키웠습니다",
    inProgressPhrase: "전술과 형세 판단을 익히는 과정을 학습 중입니다",
  },
  고급: {
    completePhrase: "복잡한 수읽기와 실전 적용력을 키웠습니다",
    inProgressPhrase: "복잡한 수읽기를 연습하는 과정을 학습 중입니다",
  },
  유단자: {
    completePhrase: "고급 전술과 종합 판단력을 키웠습니다",
    inProgressPhrase: "고급 전술을 익히는 과정을 학습 중입니다",
  },
};

const DIRECTOR_STRENGTH_COMMENTS = {
  착수금지: "착수 금지 자리를 구분하는 감각이 안정적입니다.",
  "연결&끊음": "돌을 연결하고 끊는 판단은 안정적입니다.",
  연결: "돌을 연결하고 끊는 판단은 안정적입니다.",
  끊음: "돌을 연결하고 끊는 판단은 안정적입니다.",
  활로: "활로를 줄이고 잡는 판단이 안정적입니다.",
  서로단수: "단수 상황을 구분하는 감각이 좋습니다.",
  축: "축을 활용하는 기본 감각이 안정적입니다.",
  패: "패 상황을 이해하는 감각이 좋습니다.",
};

const DIRECTOR_WEAKNESS_COMMENTS = {
  활로: "활로 계산은 반복 복습을 통해 더욱 향상될 수 있습니다.",
  서로단수: "단수 판단은 반복 복습을 통해 더욱 향상될 수 있습니다.",
  착수금지: "착수 금지 자리 구분은 반복 복습으로 더 단단해질 수 있습니다.",
  "연결&끊음": "연결과 끊음 판단은 반복 복습으로 더 단단해질 수 있습니다.",
  연결: "연결 판단은 반복 복습으로 더 단단해질 수 있습니다.",
  끊음: "끊음 판단은 반복 복습으로 더 단단해질 수 있습니다.",
  축: "축 활용은 반복 복습을 통해 더욱 향상될 수 있습니다.",
  패: "패 상황은 반복 복습을 통해 더욱 향상될 수 있습니다.",
};

function resolveCategoryKey(categoryName) {
  const name = String(categoryName ?? "").trim();
  if (!name) {
    return "";
  }
  if (name.includes("연결") && (name.includes("끊") || name.includes("&"))) {
    return "연결&끊음";
  }
  return name;
}

function pickDirectorComment(commentMap, categories, fallback) {
  for (const row of categories) {
    const key = resolveCategoryKey(row.categoryName);
    if (commentMap[key]) {
      return commentMap[key];
    }
    if (commentMap[row.categoryName]) {
      return commentMap[row.categoryName];
    }
  }
  return fallback;
}

export function buildDirectorComments(strengths = [], weaknesses = []) {
  return {
    strengthLine: pickDirectorComment(
      DIRECTOR_STRENGTH_COMMENTS,
      strengths,
      strengths.length
        ? `${strengths[0].categoryName} 유형의 이해도가 좋습니다.`
        : "꾸준히 학습하며 기본기를 쌓고 있습니다.",
    ),
    weaknessLine: pickDirectorComment(
      DIRECTOR_WEAKNESS_COMMENTS,
      weaknesses,
      weaknesses.length
        ? `${weaknesses[0].categoryName} 유형은 반복 복습으로 더 향상될 수 있습니다.`
        : "현재 뚜렷하게 보완이 필요한 유형은 없습니다.",
    ),
  };
}

function getNextLevelGroup(levelGroup) {
  const normalized = normalizeLevelGroup(levelGroup);
  const index = LEVEL_GROUPS.indexOf(normalized);
  if (index < 0 || index >= LEVEL_GROUPS.length - 1) {
    return null;
  }
  return LEVEL_GROUPS[index + 1];
}

function getLevelGroupRow(levelGroups, levelGroup) {
  return (levelGroups ?? []).find((row) => row.levelGroup === levelGroup) ?? null;
}

function getLevelGroupPercent(levelGroups, levelGroup) {
  return getLevelGroupRow(levelGroups, levelGroup)?.percent ?? 0;
}

function getCapabilityPhrases(levelGroup) {
  return LEVEL_GROUP_CAPABILITY[normalizeLevelGroup(levelGroup)] ?? LEVEL_GROUP_CAPABILITY.입문;
}

function resolveCurrentGradeLabel(officialGrade, projectedGrade) {
  const officialLabel = officialGrade?.gradeLabel ?? "";
  if (officialGrade?.gradeCode && officialLabel && officialLabel !== "미등록") {
    return officialLabel;
  }
  if (projectedGrade?.projectedGradeLabel) {
    return projectedGrade.projectedGradeLabel;
  }
  return "미등록";
}

export function resolveGrowthSummaryLevelGroup(levelGroups, activeLevelGroup) {
  return resolveSummaryContext(levelGroups, activeLevelGroup);
}

function resolveSummaryContext(levelGroups, activeLevelGroup) {
  const rows = levelGroups ?? [];
  const activeRow = rows.find((row) => row.levelGroup === activeLevelGroup);
  const completedRows = rows.filter((row) => row.status === CURRICULUM_PROGRESS_STATUS.complete);

  if (activeRow?.status === CURRICULUM_PROGRESS_STATUS.complete) {
    return {
      focusLevelGroup: activeRow.levelGroup,
      focusPercent: 100,
      isFocusComplete: true,
      currentLevelGroup: activeRow.levelGroup,
      currentStatus: activeRow.status,
      narrativeLevelGroup: activeRow.levelGroup,
    };
  }

  const lastCompleted = completedRows[completedRows.length - 1];
  if (
    lastCompleted &&
    activeRow &&
    activeRow.status === CURRICULUM_PROGRESS_STATUS.inProgress &&
    activeRow.levelGroup !== lastCompleted.levelGroup
  ) {
    return {
      focusLevelGroup: lastCompleted.levelGroup,
      focusPercent: 100,
      isFocusComplete: true,
      currentLevelGroup: activeRow.levelGroup,
      currentStatus: activeRow.status,
      narrativeLevelGroup: lastCompleted.levelGroup,
    };
  }

  const narrativeLevelGroup = activeRow?.levelGroup ?? activeLevelGroup;
  return {
    focusLevelGroup: narrativeLevelGroup,
    focusPercent: getLevelGroupPercent(rows, narrativeLevelGroup),
    isFocusComplete: false,
    currentLevelGroup: narrativeLevelGroup,
    currentStatus: activeRow?.status ?? CURRICULUM_PROGRESS_STATUS.notStarted,
    narrativeLevelGroup,
  };
}

function buildOpeningLine(honorificName, context, levelGroups) {
  const levelGroup = context.narrativeLevelGroup;

  if (context.isFocusComplete) {
    return `${honorificName}은 ${levelGroup} 과정을 모두 완료했습니다.`;
  }

  const percent = getLevelGroupPercent(levelGroups, levelGroup);
  return `${honorificName}은 ${levelGroup} 과정을 ${percent}% 완료했습니다.`;
}

function buildProgressLine(context, levelGroups) {
  const levelGroup = context.narrativeLevelGroup;
  const phrases = getCapabilityPhrases(levelGroup);
  const nextGroup = getNextLevelGroup(levelGroup);

  if (context.isFocusComplete) {
    return `${levelGroup} 과정의 전체 학습을 마치며 ${phrases.completePhrase}.`;
  }

  const percent = getLevelGroupPercent(levelGroups, levelGroup);
  if (percent >= FINISHING_PERCENT_THRESHOLD && nextGroup) {
    return `현재 과정의 마무리 단계에 접어들었으며 ${nextGroup} 과정 진입을 준비하고 있습니다.`;
  }

  return `현재 ${phrases.inProgressPhrase}.`;
}

function buildMaturityLine(context, levelGroups) {
  if (!context.isFocusComplete) {
    const percent = getLevelGroupPercent(levelGroups, context.narrativeLevelGroup);
    if (percent < FINISHING_PERCENT_THRESHOLD) {
      return null;
    }
    return null;
  }

  return "최근에는 상대 돌이 잡히는지, 내 돌이 위험한지를 스스로 판단하는 단계까지 성장했습니다.";
}

function buildGrowthOutcome(context, levelGroups, officialGrade, projectedGrade) {
  const currentGradeLabel = resolveCurrentGradeLabel(officialGrade, projectedGrade);
  const nextFromFocus = getNextLevelGroup(context.focusLevelGroup);
  const nextFromCurrent = getNextLevelGroup(context.currentLevelGroup);

  if (
    context.isFocusComplete &&
    context.currentStatus === CURRICULUM_PROGRESS_STATUS.inProgress &&
    context.currentLevelGroup !== context.focusLevelGroup
  ) {
    return {
      stageLabel: `${context.focusLevelGroup} 과정 완료`,
      currentGradeLabel,
      nextStepLabel: `${context.currentLevelGroup} 과정 진입 준비 완료`,
    };
  }

  if (context.isFocusComplete) {
    return {
      stageLabel: `${context.focusLevelGroup} 과정 완료`,
      currentGradeLabel,
      nextStepLabel: nextFromFocus
        ? `${nextFromFocus} 과정 진입 준비 완료`
        : "심화 학습 단계",
    };
  }

  const percent = getLevelGroupPercent(levelGroups, context.currentLevelGroup);
  if (percent >= FINISHING_PERCENT_THRESHOLD) {
    return {
      stageLabel: `${context.currentLevelGroup} 과정 진행 중`,
      currentGradeLabel,
      nextStepLabel: `${context.currentLevelGroup} 과정 마무리 단계`,
    };
  }

  return {
    stageLabel: `${context.currentLevelGroup} 과정 진행 중`,
    currentGradeLabel,
    nextStepLabel: nextFromCurrent
      ? `${nextFromCurrent} 과정 진입 준비 중`
      : `${context.currentLevelGroup} 과정 학습 중`,
  };
}

/**
 * @param {{
 *   studentName?: string,
 *   curriculumProgress: object,
 *   levelGroups: object[],
 *   projectedGrade: object,
 *   officialGrade?: { gradeCode?: string, gradeLabel?: string } | null,
 * }} params
 */
export function buildGrowthSummaryNarrative(params) {
  const studentName = String(params.studentName ?? "").trim() || "학생";
  const honorificName = studentName.endsWith("학생") ? studentName : `${studentName} 학생`;
  const { curriculumProgress, levelGroups, projectedGrade, officialGrade } = params;

  const context = resolveSummaryContext(levelGroups, curriculumProgress.activeLevelGroup);
  const officialLabel = officialGrade?.gradeLabel ?? "미등록";
  const projectedLabel = projectedGrade?.projectedGradeLabel ?? null;

  const paragraphs = [
    buildOpeningLine(honorificName, context, levelGroups),
    buildProgressLine(context, levelGroups),
    buildMaturityLine(context, levelGroups),
  ].filter(Boolean);

  const growthOutcome = buildGrowthOutcome(context, levelGroups, officialGrade, projectedGrade);

  return {
    honorificName,
    paragraphs,
    growthOutcome,
    grades: {
      officialLabel,
      officialRegistered: Boolean(officialGrade?.gradeCode),
      projectedLabel,
      projectedAvailable: Boolean(projectedLabel),
    },
  };
}
