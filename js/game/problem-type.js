export const PROBLEM_TYPE = {
  board: "board",
  ox: "ox",
};

export function normalizeProblemType(problem) {
  return problem?.type === PROBLEM_TYPE.ox ? PROBLEM_TYPE.ox : PROBLEM_TYPE.board;
}

export function isOxProblem(problem) {
  return normalizeProblemType(problem) === PROBLEM_TYPE.ox;
}

export function isBoardProblem(problem) {
  return !isOxProblem(problem);
}

export function normalizeProblemFields(problem) {
  if (!problem || typeof problem !== "object") {
    return problem;
  }

  const normalized = { ...problem };
  normalized.type = normalizeProblemType(normalized);

  if (normalized.type === PROBLEM_TYPE.ox) {
    normalized.oxAnswer = Boolean(normalized.oxAnswer);
  }

  return normalized;
}
