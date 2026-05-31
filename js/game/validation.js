import { isBoardProblem, isOxProblem } from "./problem-type.js";
import { pointKey } from "./rules.js";
import { getProblemCorrectSequence } from "./sequence.js";

export function isCorrectUserMove(move, problem, solvedAnswerKeys = new Set()) {
  if (!isBoardProblem(problem)) {
    return false;
  }

  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 0) {
    return sequence.some((answer) => {
      return isCorrectMove(move, answer) && !solvedAnswerKeys.has(pointKey(answer));
    });
  }

  return problem.correctMove ? isCorrectMove(move, problem.correctMove) : false;
}

export function isCorrectOxAnswer(oxAnswer, problem) {
  if (!isOxProblem(problem)) {
    return false;
  }

  return Boolean(oxAnswer) === Boolean(problem.oxAnswer);
}
export function isCorrectMove(move, answer) {
  return move.x === answer.x && move.y === answer.y;
}
