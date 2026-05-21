import { getCategoryProblemNumberForProblem } from "./category-problem-number.js";
import { getProblemsInCategoryOrder } from "./learning-flow-service.js";

export const PRINT_SELECTION_MODE = {
  add: "add",
  remove: "remove",
  set: "set",
};

export const PRINT_SELECTION_ORDER = {
  asc: "asc",
  random: "random",
};

/**
 * @typedef {object} PrintSelectionCriteria
 * @property {string} [category]
 * @property {number} [from] categoryProblemNumber inclusive
 * @property {number} [to] categoryProblemNumber inclusive
 * @property {number} [count]
 * @property {string} [order] asc | random
 */

export function getCategoryProblemEntries(categoryName, problems, { levelGroup } = {}) {
  return getProblemsInCategoryOrder(categoryName, problems, { levelGroup })
    .map((entry) => ({
      ...entry,
      categoryProblemNumber: getCategoryProblemNumberForProblem(entry.problem, problems),
    }))
    .filter((entry) => entry.categoryProblemNumber > 0)
    .sort((left, right) => left.categoryProblemNumber - right.categoryProblemNumber);
}

export function resolveCategoryAllIds(categoryName, problems, { levelGroup } = {}) {
  return getCategoryProblemEntries(categoryName, problems, { levelGroup }).map(({ problem }) => problem.id);
}

export function resolveCategoryRangeIds(categoryName, problems, from, to, { levelGroup } = {}) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);

  return getCategoryProblemEntries(categoryName, problems, { levelGroup })
    .filter(
      ({ categoryProblemNumber }) =>
        categoryProblemNumber >= start && categoryProblemNumber <= end,
    )
    .map(({ problem }) => problem.id);
}

export function resolveCategoryCountIds(
  categoryName,
  problems,
  count,
  { order = PRINT_SELECTION_ORDER.asc, randomFn = Math.random, levelGroup } = {},
) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount === 0) {
    return [];
  }

  let entries = getCategoryProblemEntries(categoryName, problems, { levelGroup });
  if (order === PRINT_SELECTION_ORDER.random) {
    entries = shuffleEntries(entries, randomFn);
  }

  return entries.slice(0, safeCount).map(({ problem }) => problem.id);
}

export function resolveCompositionSelection(
  composition,
  problems,
  { order = PRINT_SELECTION_ORDER.asc, randomFn = Math.random, levelGroup } = {},
) {
  const problemIds = [];

  composition.forEach(({ category, count }) => {
    if (!category || !count) {
      return;
    }

    problemIds.push(
      ...resolveCategoryCountIds(category, problems, count, { order, randomFn, levelGroup }),
    );
  });

  return problemIds;
}

export function applyPrintSelection(selectedIds, problemIds, mode = PRINT_SELECTION_MODE.add) {
  if (mode === PRINT_SELECTION_MODE.set) {
    selectedIds.clear();
    problemIds.forEach((problemId) => selectedIds.add(problemId));
    return;
  }

  if (mode === PRINT_SELECTION_MODE.remove) {
    problemIds.forEach((problemId) => selectedIds.delete(problemId));
    return;
  }

  problemIds.forEach((problemId) => selectedIds.add(problemId));
}

export function orderProblemsForPrint(
  problems,
  selectedIds,
  categoryOrder = [],
  { levelGroup } = {},
) {
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  if (selectedSet.size === 0) {
    return [];
  }

  const ordered = [];
  const seen = new Set();
  const categories =
    categoryOrder.length > 0
      ? categoryOrder
      : [...new Set(problems.map((problem) => problem.category).filter(Boolean))];

  categories.forEach((categoryName) => {
    getCategoryProblemEntries(categoryName, problems, { levelGroup }).forEach((entry) => {
      if (!selectedSet.has(entry.problem.id) || seen.has(entry.problem.id)) {
        return;
      }

      seen.add(entry.problem.id);
      ordered.push(entry);
    });
  });

  problems.forEach((problem, index) => {
    if (!selectedSet.has(problem.id) || seen.has(problem.id)) {
      return;
    }

    seen.add(problem.id);
    ordered.push({
      problem,
      index,
      categoryProblemNumber: getCategoryProblemNumberForProblem(problem, problems),
    });
  });

  return ordered;
}

export function isCategoryFullySelected(categoryName, problems, selectedIds) {
  const categoryIds = resolveCategoryAllIds(categoryName, problems);
  if (categoryIds.length === 0) {
    return false;
  }

  return categoryIds.every((problemId) => selectedIds.has(problemId));
}

export function isCategoryPartiallySelected(categoryName, problems, selectedIds) {
  const categoryIds = resolveCategoryAllIds(categoryName, problems);
  if (categoryIds.length === 0) {
    return false;
  }

  const selectedCount = categoryIds.filter((problemId) => selectedIds.has(problemId)).length;
  return selectedCount > 0 && selectedCount < categoryIds.length;
}

export function toggleCategoryPrintSelection(categoryName, problems, selectedIds) {
  const categoryIds = resolveCategoryAllIds(categoryName, problems);
  if (categoryIds.length === 0) {
    return { changed: false, selected: false };
  }

  if (isCategoryFullySelected(categoryName, problems, selectedIds)) {
    applyPrintSelection(selectedIds, categoryIds, PRINT_SELECTION_MODE.remove);
    return { changed: true, selected: false };
  }

  applyPrintSelection(selectedIds, categoryIds, PRINT_SELECTION_MODE.add);
  return { changed: true, selected: true };
}

export function getPrintPageCount(selectedCount, pageSize = 8) {
  if (selectedCount <= 0) {
    return 0;
  }

  return Math.ceil(selectedCount / pageSize);
}

export function getSelectedCategoryCounts(selectedIds, problems, categoryOrder = []) {
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const countsByCategory = new Map();

  problems.forEach((problem) => {
    if (!selectedSet.has(problem.id)) {
      return;
    }

    const category = String(problem.category ?? "").trim();
    if (!category) {
      return;
    }

    countsByCategory.set(category, (countsByCategory.get(category) ?? 0) + 1);
  });

  const orderedCategories = [];
  const seen = new Set();

  categoryOrder.forEach((category) => {
    if (!countsByCategory.has(category)) {
      return;
    }

    orderedCategories.push(category);
    seen.add(category);
  });

  [...countsByCategory.keys()]
    .filter((category) => !seen.has(category))
    .sort((left, right) => left.localeCompare(right, "ko"))
    .forEach((category) => orderedCategories.push(category));

  return orderedCategories
    .map((category) => ({
      category,
      count: countsByCategory.get(category) ?? 0,
    }))
    .filter(({ count }) => count > 0);
}

export function formatPrintSelectionSummary(
  selectedIds,
  problems,
  { categoryOrder = [], pageSize = 8 } = {},
) {
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const categories = getSelectedCategoryCounts(selectedSet, problems, categoryOrder);
  const total = categories.reduce((sum, { count }) => sum + count, 0);
  const pageCount = getPrintPageCount(total, pageSize);

  if (total === 0) {
    return {
      text: "인쇄할 문제를 선택하세요",
      categories: [],
      total: 0,
      pageCount: 0,
    };
  }

  const categoryText = categories.map(({ category, count }) => `${category} ${count}`).join(" · ");
  const text = `${categoryText} · 총 ${total}문제 · ${pageCount}페이지`;

  return {
    text,
    categories,
    total,
    pageCount,
  };
}

function shuffleEntries(entries, randomFn) {
  const copy = [...entries];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}
