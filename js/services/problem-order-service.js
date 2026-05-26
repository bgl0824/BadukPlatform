import { getOrderedCategoryNames } from "./category-service.js";
import { compareGradeLevels } from "./grade-level-service.js";
import { LEVEL_GROUPS, normalizeLevelGroup } from "./level-group-service.js";

export const PROBLEM_LIST_SORT = {
  learning: "learning",
  grade: "grade",
};

export function getProblemDisplayOrder(problem) {
  const value = Number(problem?.displayOrder);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export function compareProblemsInCategory(left, right) {
  const orderDiff = getProblemDisplayOrder(left) - getProblemDisplayOrder(right);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  const createdDiff =
    new Date(left?.createdAt ?? 0).getTime() - new Date(right?.createdAt ?? 0).getTime();
  if (createdDiff !== 0) {
    return createdDiff;
  }

  return String(left?.id ?? "").localeCompare(String(right?.id ?? ""), "ko");
}

export function getMaxDisplayOrderInScope(
  categoryName,
  levelGroup,
  problems,
  { excludeProblemId } = {},
) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  let maxOrder = 0;

  problems.forEach((problem) => {
    if (excludeProblemId && problem.id === excludeProblemId) {
      return;
    }

    if (String(problem.category ?? "").trim() !== normalizedCategory) {
      return;
    }

    if (normalizeLevelGroup(problem.levelGroup) !== normalizedLevelGroup) {
      return;
    }

    const order = Number(problem.displayOrder);
    if (Number.isFinite(order) && order > maxOrder) {
      maxOrder = order;
    }
  });

  return maxOrder;
}

export function resolveAppendDisplayOrder(problem, problems, { dbMax = 0, excludeProblemId } = {}) {
  const category = String(problem.category ?? "").trim();
  const levelGroup = normalizeLevelGroup(problem.levelGroup);
  const memoryMax = getMaxDisplayOrderInScope(category, levelGroup, problems, {
    excludeProblemId: excludeProblemId ?? problem.id,
  });
  const safeDbMax = Number.isFinite(Number(dbMax)) && Number(dbMax) > 0 ? Number(dbMax) : 0;
  const nextOrder = Math.max(memoryMax, safeDbMax) + 1;

  return {
    problem: {
      ...problem,
      category,
      levelGroup,
      displayOrder: nextOrder,
    },
    meta: {
      category,
      levelGroup,
      memoryMax,
      dbMax: safeDbMax,
      displayOrder: nextOrder,
    },
  };
}

export function assignDisplayOrderForNewProblem(problem, problems) {
  const requested = Number(problem.displayOrder);
  if (Number.isFinite(requested) && requested > 0) {
    const scopeMax = getMaxDisplayOrderInScope(problem.category, problem.levelGroup, problems, {
      excludeProblemId: problem.id,
    });
    if (requested <= scopeMax) {
      return resolveAppendDisplayOrder(problem, problems).problem;
    }

    return {
      ...problem,
      category: String(problem.category ?? "").trim(),
      levelGroup: normalizeLevelGroup(problem.levelGroup),
      displayOrder: requested,
    };
  }

  return resolveAppendDisplayOrder(problem, problems).problem;
}

function createProblemListSortContext({ categoryOrderByLevelGroup } = {}) {
  const categoryOrderCache = new Map();

  const getCategoryOrder = (levelGroup) => {
    const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
    if (categoryOrderCache.has(normalizedLevelGroup)) {
      return categoryOrderCache.get(normalizedLevelGroup);
    }

    const order =
      categoryOrderByLevelGroup?.[normalizedLevelGroup] ??
      getOrderedCategoryNames(undefined, { levelGroup: normalizedLevelGroup });
    categoryOrderCache.set(normalizedLevelGroup, order);
    return order;
  };

  const levelGroupIndex = (levelGroup) => {
    const normalized = normalizeLevelGroup(levelGroup);
    const index = LEVEL_GROUPS.indexOf(normalized);
    return index === -1 ? LEVEL_GROUPS.length : index;
  };

  const categoryIndex = (problem) => {
    const order = getCategoryOrder(problem?.levelGroup);
    const index = order.indexOf(String(problem?.category ?? "").trim());
    return index === -1 ? order.length : index;
  };

  return { levelGroupIndex, categoryIndex };
}

/**
 * display_order는 카테고리 내부 순서 — 전역 정렬에 쓰지 않음.
 * level_group → category(커리큘럼) → [grade_level] → display_order
 */
export function compareProblemsForListView(
  left,
  right,
  { sortMode = PROBLEM_LIST_SORT.learning, categoryOrderByLevelGroup } = {},
) {
  const { levelGroupIndex, categoryIndex } = createProblemListSortContext({
    categoryOrderByLevelGroup,
  });

  const levelDiff = levelGroupIndex(left?.levelGroup) - levelGroupIndex(right?.levelGroup);
  if (levelDiff !== 0) {
    return levelDiff;
  }

  const categoryDiff = categoryIndex(left) - categoryIndex(right);
  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  if (sortMode === PROBLEM_LIST_SORT.grade) {
    const gradeDiff = compareGradeLevels(left?.gradeLevel, right?.gradeLevel);
    if (gradeDiff !== 0) {
      return gradeDiff;
    }
  }

  return compareProblemsInCategory(left, right);
}

export function sortProblemsGlobally(problems, options = {}) {
  const sortMode = options.sortMode ?? PROBLEM_LIST_SORT.learning;
  return [...problems].sort((left, right) =>
    compareProblemsForListView(left, right, { ...options, sortMode }),
  );
}

export function sortFilteredProblemEntries(
  entries,
  { sortMode = PROBLEM_LIST_SORT.learning, categoryOrderByLevelGroup } = {},
) {
  return [...entries].sort((left, right) => {
    const orderDiff = compareProblemsForListView(left.problem, right.problem, {
      sortMode,
      categoryOrderByLevelGroup,
    });
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return left.index - right.index;
  });
}

export function buildDisplayOrderUpdates(orderedProblemIds) {
  return orderedProblemIds.map((problemId, index) => ({
    id: problemId,
    displayOrder: index + 1,
  }));
}
