import { isBoardProblem } from "./problem-type.js";
import { pointKey } from "./rules.js";

export function getProblemCorrectSequence(problem) {
  if (
    !isBoardProblem(problem) ||
    problem.category !== "활로" ||
    !Array.isArray(problem.correctSequence)
  ) {
    return [];
  }
  return problem.correctSequence;
}

export function advanceCorrectSequence(problem, playedMoves, solvedAnswerKeys) {
  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length <= 1) {
    return {
      shouldContinue: false,
      solvedAnswerKeys,
      remainingMoves: 0,
    };
  }

  const latestMove = playedMoves[playedMoves.length - 1];
  const nextSolvedAnswerKeys = new Set(solvedAnswerKeys);
  nextSolvedAnswerKeys.add(pointKey(latestMove));

  const remainingMoves = sequence.length - nextSolvedAnswerKeys.size;

  return {
    shouldContinue: remainingMoves > 0,
    solvedAnswerKeys: nextSolvedAnswerKeys,
    remainingMoves,
  };
}
