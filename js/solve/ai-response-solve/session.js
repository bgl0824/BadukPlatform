import { resolveAnswerSequenceConfig } from "./answer-sequence.js";

/**
 * @param {object} problem
 * @param {number} boardSize
 */
export function createAiResponseSolveSession(problem, boardSize) {
  const { answerMoveCount, fullSequence, blackAnswers, whiteAnswers } =
    resolveAnswerSequenceConfig(problem, boardSize);

  return {
    answerMoveCount,
    fullSequence,
    blackAnswers,
    whiteAnswers,
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

/** 정답 루트: 제작자 백 수 자동 착수 후 */
export function advanceAfterAuthorWhiteOnCorrect(session, whiteMove) {
  session.playedMoves.push(whiteMove);
  session.blackAnswerIndex += 1;
  session.currentPly += 1;
  session.phase = "await_black";
}

/** @deprecated alias */
export const advanceAfterKatagoWhiteOnCorrect = advanceAfterAuthorWhiteOnCorrect;

/** 오답 루트: KataGo 백 응수 후 */
export function advanceAfterKatagoWhiteOnWrong(session, whiteMove) {
  session.playedMoves.push(whiteMove);
  session.currentPly += 1;
  session.phase = "wrong_reveal";
}
