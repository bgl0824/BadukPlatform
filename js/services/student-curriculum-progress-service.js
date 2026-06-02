import { getOrderedCategoryNames, readCategories } from "./category-service.js";
import {
  DEFAULT_LEVEL_GROUP,
  getLevelGroupInfo,
  LEVEL_GROUPS,
  normalizeLevelGroup,
} from "./level-group-service.js";
import {
  getLevelGroupProgressRow,
  resolveActiveLevelGroupFromProgress,
} from "./learning-flow-service.js";
import {
  getProgressStatus,
  getStudentProgressByUserId,
  PROGRESS_STATUS,
} from "./student-progress-service.js";

/** 과정(level_group) 단위 진행 상태 */
export const CURRICULUM_PROGRESS_STATUS = {
  notStarted: "not_started",
  inProgress: "in_progress",
  complete: "complete",
};

const CURRICULUM_STATUS_LABELS = {
  [CURRICULUM_PROGRESS_STATUS.notStarted]: "시작 전",
  [CURRICULUM_PROGRESS_STATUS.inProgress]: "진행중",
  [CURRICULUM_PROGRESS_STATUS.complete]: "완료",
};

export function getCurriculumStatusLabel(status) {
  return CURRICULUM_STATUS_LABELS[status] ?? CURRICULUM_STATUS_LABELS[CURRICULUM_PROGRESS_STATUS.notStarted];
}

/**
 * @param {{ total: number, solved: number, isComplete?: boolean, isInProgress?: boolean }} row
 */
export function resolveCurriculumStatusFromCounts(row) {
  const total = Number(row?.total ?? 0);
  const solved = Number(row?.solved ?? 0);

  if (total <= 0) {
    return CURRICULUM_PROGRESS_STATUS.notStarted;
  }

  if (row?.isComplete || solved >= total) {
    return CURRICULUM_PROGRESS_STATUS.complete;
  }

  if (row?.isInProgress || solved > 0) {
    return CURRICULUM_PROGRESS_STATUS.inProgress;
  }

  return CURRICULUM_PROGRESS_STATUS.notStarted;
}

/**
 * @param {string} levelGroup
 * @param {object[]} problems
 * @param {Map<string, object>|null} progressByProblemId
 */
export function getLevelGroupCurriculumProgress(levelGroup, problems, progressByProblemId = null) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const categories = readCategories();
  const categoryNames = getOrderedCategoryNames(categories, { levelGroup: normalizedLevelGroup });
  const aggregate = getLevelGroupProgressRow(
    normalizedLevelGroup,
    categoryNames,
    problems,
    progressByProblemId,
  );
  const status = resolveCurriculumStatusFromCounts(aggregate);
  const info = getLevelGroupInfo(normalizedLevelGroup);

  return {
    levelGroup: normalizedLevelGroup,
    title: info.title,
    description: info.description,
    total: aggregate.total,
    solved: aggregate.solved,
    percent: aggregate.percent,
    status,
    statusLabel: getCurriculumStatusLabel(status),
    startedCategories: aggregate.startedCategories,
    completedCategories: aggregate.completedCategories,
    categoryCount: aggregate.categoryCount,
    isComplete: aggregate.isComplete,
    isInProgress: aggregate.isInProgress,
  };
}

/**
 * @param {object[]} levelGroupRows
 * @param {object[]} progressList
 * @param {object[]} problems
 */
export function resolveActiveLevelGroup({ levelGroupRows, progressList, problems }) {
  const rowsWithProblems = (levelGroupRows ?? []).filter((row) => row.total > 0);
  const inProgressRow = rowsWithProblems.find(
    (row) => row.status === CURRICULUM_PROGRESS_STATUS.inProgress,
  );
  if (inProgressRow) {
    return inProgressRow.levelGroup;
  }

  const notStartedRow = rowsWithProblems.find(
    (row) => row.status === CURRICULUM_PROGRESS_STATUS.notStarted,
  );
  if (notStartedRow) {
    return notStartedRow.levelGroup;
  }

  if (rowsWithProblems.length > 0) {
    const allComplete = rowsWithProblems.every(
      (row) => row.status === CURRICULUM_PROGRESS_STATUS.complete,
    );
    if (allComplete) {
      return rowsWithProblems[rowsWithProblems.length - 1].levelGroup;
    }
  }

  return resolveActiveLevelGroupFromProgress(progressList, problems);
}

/**
 * student_progress 기반 학생별 과정 진행 개요 (1차: 예상 급수·승급심사 제외).
 *
 * @param {string} userId
 * @param {object[]} problems
 */
export function getStudentCurriculumOverview(userId, problems = []) {
  const progressList = getStudentProgressByUserId(userId);
  const progressByProblemId = new Map(
    progressList.map((progress) => [progress.problemId, progress]),
  );

  const levelGroups = LEVEL_GROUPS.map((levelGroup) =>
    getLevelGroupCurriculumProgress(levelGroup, problems, progressByProblemId),
  );

  const activeLevelGroup = resolveActiveLevelGroup({
    levelGroupRows: levelGroups,
    progressList,
    problems,
  });

  const activeRow =
    levelGroups.find((row) => row.levelGroup === activeLevelGroup) ??
    getLevelGroupCurriculumProgress(DEFAULT_LEVEL_GROUP, problems, progressByProblemId);

  const recentProgress = progressList[0];
  const globalSolvedCount = progressList.filter(
    (progress) => getProgressStatus(progress) === PROGRESS_STATUS.solved,
  ).length;
  const globalInProgressCount = progressList.filter(
    (progress) => getProgressStatus(progress) === PROGRESS_STATUS.inProgress,
  ).length;
  const globalTotalProblems = problems.length;

  return {
    activeLevelGroup: activeRow.levelGroup,
    activeLevelGroupTitle: activeRow.title,
    activeLevelGroupPercent: activeRow.percent,
    activeLevelGroupStatus: activeRow.status,
    activeLevelGroupStatusLabel: activeRow.statusLabel,
    levelGroups,
    /** 활성 과정 기준 (목록·정렬용) */
    level: activeRow.levelGroup,
    progressRate: activeRow.percent,
    totalProblemCount: activeRow.total,
    solvedProblemCount: activeRow.solved,
    inProgressProblemCount: globalInProgressCount,
    notStartedProblemCount: Math.max(0, activeRow.total - activeRow.solved - globalInProgressCount),
    recentCategory: recentProgress?.category || "기록 없음",
    /** 전체 문제 은행 대비 (참고용) */
    globalProgressRate:
      globalTotalProblems > 0
        ? Math.round((globalSolvedCount / globalTotalProblems) * 100)
        : 0,
    globalSolvedProblemCount: globalSolvedCount,
    globalTotalProblemCount: globalTotalProblems,
  };
}
