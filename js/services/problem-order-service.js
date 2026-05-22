import { getOrderedCategoryNames } from "./category-service.js";
import { LEVEL_GROUPS, normalizeLevelGroup } from "./level-group-service.js";

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

export function sortProblemsGlobally(problems, { categoryOrderByLevelGroup } = {}) {
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
    const order = getCategoryOrder(problem.levelGroup);
    const index = order.indexOf(problem.category);
    return index === -1 ? order.length : index;
  };

  return [...problems].sort((left, right) => {
    const levelDiff = levelGroupIndex(left.levelGroup) - levelGroupIndex(right.levelGroup);
    if (levelDiff !== 0) {
      return levelDiff;
    }

    const categoryDiff = categoryIndex(left) - categoryIndex(right);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return compareProblemsInCategory(left, right);
  });
}

export function sortFilteredProblemEntries(entries) {
  return [...entries].sort((left, right) =>
    compareProblemsInCategory(left.problem, right.problem),
  );
}

export function buildDisplayOrderUpdates(orderedProblemIds) {
  return orderedProblemIds.map((problemId, index) => ({
    id: problemId,
    displayOrder: index + 1,
  }));
}
