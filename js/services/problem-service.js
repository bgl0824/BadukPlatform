import { canManageProblems } from "../permissions/permission-service.js";

export async function saveProblem({ user, problem, ProblemStore }) {
  if (!canManageProblems(user)) {
    throw new Error("permission denied: manage problems");
  }

  return ProblemStore.saveProblem(problem);
}

export async function deleteProblem({ user, problemId, ProblemStore }) {
  if (!canManageProblems(user)) {
    throw new Error("permission denied: manage problems");
  }

  return ProblemStore.deleteProblem(problemId);
}

export async function reorderProblemsInCategory({
  user,
  category,
  levelGroup,
  orderedProblemIds,
  ProblemStore,
}) {
  if (!canManageProblems(user)) {
    throw new Error("permission denied: manage problems");
  }

  return ProblemStore.reorderProblemsInCategory({
    category,
    levelGroup,
    orderedProblemIds,
  });
}

export const problemService = {
  saveProblem,
  deleteProblem,
  reorderProblemsInCategory,
};
