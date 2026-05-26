import { resolveBlackAnswerConfig } from "./black-sequence.js";

/**
 * @param {object} problem
 * @param {number} boardSize
 */
export function createAiResponseSolveSession(problem, boardSize) {
  const { answerMoveCount, blackAnswers } = resolveBlackAnswerConfig(problem, boardSize);

  return {
    answerMoveCount,
    blackAnswers,
    currentPly: 1,
    blackAnswerIndex: 0,
    phase: "await_black",
    playedMoves: [],
  };
}

export function getExpectedBlackAnswer(session) {
  return session.blackAnswers[session.blackAnswerIndex] ?? null;
}

export function isLastBlackAnswer(session) {
  return session.blackAnswerIndex >= session.blackAnswers.length - 1;
}

/** 흑 착수 직후 — 다음 ply(백)로 진행 */
export function advancePlyAfterBlack(session) {
  session.currentPly += 1;
}

/** 정답 루트에서 백 응수 후 — 다음 흑 정답 인덱스·ply */
export function advanceAfterKatagoWhiteOnCorrect(session, whiteMove) {
  session.playedMoves.push(whiteMove);
  session.blackAnswerIndex += 1;
  session.currentPly += 1;
  session.phase = "await_black";
}

/** 오답 루트에서 백 응수 후 */
export function advanceAfterKatagoWhiteOnWrong(session, whiteMove) {
  session.playedMoves.push(whiteMove);
  session.currentPly += 1;
  session.phase = "wrong_reveal";
}
