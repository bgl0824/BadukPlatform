import { getProblemsInCategoryOrder } from "./learning-flow-service.js";

export function getCategoryProblemNumber(problemId, categoryName, problems, { levelGroup } = {}) {
  const categoryProblems = getProblemsInCategoryOrder(categoryName, problems, { levelGroup });
  const position = categoryProblems.findIndex(({ problem }) => problem.id === problemId);
  return position >= 0 ? position + 1 : 0;
}

export function getCategoryProblemNumberForProblem(problem, problems) {
  if (!problem?.id || !problem?.category) {
    return 0;
  }

  return getCategoryProblemNumber(problem.id, problem.category, problems, {
    levelGroup: problem.levelGroup,
  });
}
export function formatCategoryProblemLabel(problem, problems, { includeCategoryName = true } = {}) {
  const categoryProblemNumber = getCategoryProblemNumberForProblem(problem, problems);
  if (!categoryProblemNumber) {
    return problem?.title ?? "";
  }

  if (includeCategoryName) {
    return `${problem.category} ${categoryProblemNumber}번`;
  }

  return `${categoryProblemNumber}번`;
}
