import { canManageGradeLevels, canManageProblems } from "../permissions/permission-service.js";
import { getSupabaseAuthSession, isSupabaseAuthUser } from "./auth-service.js";

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

export async function bulkSetGradeLevels({ user, problemIds, gradeLevel, ProblemStore }) {
  if (!canManageGradeLevels(user)) {
    throw new Error("permission denied: manage grade levels");
  }

  if (!isSupabaseAuthUser(user)) {
    throw new Error(
      "Supabase Auth 로그인이 필요합니다. 로컬 계정으로는 급수를 저장할 수 없습니다.",
    );
  }

  const session = await getSupabaseAuthSession();
  if (!session?.user) {
    throw new Error("Supabase 로그인 세션이 없습니다. 다시 로그인한 뒤 시도해 주세요.");
  }

  return ProblemStore.bulkSetGradeLevels(problemIds, gradeLevel);
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
  bulkSetGradeLevels,
  reorderProblemsInCategory,
};
