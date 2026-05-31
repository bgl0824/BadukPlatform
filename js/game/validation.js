import { isBoardProblem, isOxProblem } from "./problem-type.js";
import { getProblemCorrectSequence } from "./sequence.js";
import { isAcceptedUserMove } from "./answer-moves.js";

export function isCorrectUserMove(move, problem, solvedAnswerKeys = new Set()) {
  if (!isBoardProblem(problem)) {
    return false;
  }

  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 0) {
    return isAcceptedUserMove(move, problem, solvedAnswerKeys);
  }

  return isAcceptedUserMove(move, problem, solvedAnswerKeys);
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

export { classifyUserMove, ANSWER_QUALITY } from "./answer-moves.js";
