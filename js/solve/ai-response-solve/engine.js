import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import { getExpectedAuthorWhite } from "./answer-sequence.js";
import { isCorrectBlackMove } from "./black-sequence.js";
import { logAiResponseSolveContext } from "../../game/problem-mode.js";
import {
  advanceAfterAuthorWhiteOnCorrect,
  advanceAfterKatagoWhiteOnWrong,
  advancePlyAfterBlack,
  createAiResponseSolveSession,
  getExpectedBlackAnswer,
  isLastBlackAnswer,
} from "./session.js";
import { isKatagoWhiteMove, resolveWhiteResponse } from "./resolve-white-response.js";

/**
 * AI 응수형: 정답 루트 백 = 제작자 수순, 오답 루트 백 = KataGo.
 */
export function createAiResponseSolveEngine({
  appState,
  boardController,
  boardSize,
  stoneColors,
  getCurrentProblem,
  setStatus,
  setFeedback,
  syncBoardPreviewContext,
  removeCapturedStonesAfterMove,
  recordWrongMove,
  completeProblem,
  resetCurrentProblemAfterWrong,
  finishWrongReveal,
  cloneBoardStones,
  markProblemInProgress,
}) {
  function getSession() {
    return appState.aiResponseSolveSession;
  }

  function initSession(problem) {
    appState.aiResponseSolveSession = createAiResponseSolveSession(problem, boardSize);
    logAiResponseSolveContext(problem, "initSession");
    console.log("[AI_RESPONSE] session", appState.aiResponseSolveSession);
    syncBoardPreviewContext();
    updateTurnUi();
  }

  function clearSession() {
    appState.aiResponseSolveSession = null;
    appState.isAiThinking = false;
    syncBoardPreviewContext();
  }

  function updateTurnUi() {
    const session = getSession();
    if (!session) {
      return;
    }
    setStatus(
      AI_RESPONSE_SOLVE_MESSAGES.awaitBlack(session.currentPly, session.answerMoveCount),
      { aiResponseTurn: false },
    );
  }

  async function handleStudentBlackMove(point) {
    const problem = getCurrentProblem();
    const session = getSession();

    console.log("[AI_RESPONSE] handleStudentBlackMove", {
      point,
      phase: session?.phase,
      currentPly: session?.currentPly,
      blackAnswerIndex: session?.blackAnswerIndex,
    });

    if (!problem || !session || session.phase === "katago_pending") {
      return;
    }

    if (appState.isSolved) {
      return;
    }

    if (session.phase === "wrong_reveal" || appState.isAiThinking) {
      return;
    }

    if (boardController.hasStone(point)) {
      setFeedback("이미 돌이 있는 자리입니다.", "wrong");
      return;
    }

    const expected = getExpectedBlackAnswer(session);
    const userMove = { ...point, color: stoneColors.black };
    const isCorrect = isCorrectBlackMove(point, expected);

    boardController.addStone(userMove);
    removeCapturedStonesAfterMove(userMove);
    session.playedMoves.push(userMove);
    advancePlyAfterBlack(session);

    markProblemInProgress?.(problem);

    if (!isCorrect) {
      recordWrongMove(problem, userMove);
      await revealWrongWithWhite(problem, session, userMove);
      return;
    }

    if (isLastBlackAnswer(session)) {
      console.log("[AI_RESPONSE] last black correct — complete");
      completeProblem(problem);
      clearSession();
      return;
    }

    const authorOk = playAuthorWhiteOnCorrect(problem, session);
    if (!authorOk) {
      return;
    }
    updateTurnUi();
    setFeedback("흑 정답입니다. 이어서 다음 수를 두세요.", "correct");
  }

  async function revealWrongWithWhite(problem, session, lastBlackMove) {
    session.phase = "katago_pending";
    appState.isAiThinking = true;
    syncBoardPreviewContext();
    setStatus(AI_RESPONSE_SOLVE_MESSAGES.katagoThinking);

    const whiteOk = await playKatagoWhiteOnWrong(problem, session, lastBlackMove);

    if (!whiteOk) {
      appState.isAiThinking = false;
      session.phase = "await_black";
      resetCurrentProblemAfterWrong(problem);
      clearSession();
      return;
    }

    syncBoardPreviewContext();
    finishWrongReveal(problem);
  }

  function rebuildBoardFromPlayedMoves(problem, playedMoves) {
    boardController.loadPosition(cloneBoardStones(appState.initialBoardStones ?? problem.stones ?? []));
    playedMoves.forEach((move) => {
      if (!boardController.hasStone(move)) {
        boardController.addStone(move);
        removeCapturedStonesAfterMove(move);
      }
    });
  }

  function rollbackFailedKatago(session, problem) {
    if (session.playedMoves.length > 0) {
      session.playedMoves.pop();
      session.currentPly = Math.max(1, session.currentPly - 1);
      rebuildBoardFromPlayedMoves(problem, session.playedMoves);
      session.phase = "await_black";
      return;
    }

    resetCurrentProblemAfterWrong(problem);
    clearSession();
  }

  function playAuthorWhiteOnCorrect(problem, session) {
    const expected = getExpectedAuthorWhite(session);
    if (!expected) {
      const message =
        "정답 루트의 백 수가 설정되지 않았습니다. 관리자에서 전체 정답 수순을 입력해 주세요.";
      setFeedback(message, "wrong");
      window.alert?.(message);
      rollbackAuthorWhiteFailure(session, problem);
      return false;
    }

    const point = { x: expected.x, y: expected.y };
    if (boardController.hasStone(point)) {
      setFeedback("제작자 정답 백 수 좌표에 이미 돌이 있습니다.", "wrong");
      rollbackAuthorWhiteFailure(session, problem);
      return false;
    }

    const whiteMove = { ...point, color: stoneColors.white };
    boardController.addStone(whiteMove);
    removeCapturedStonesAfterMove(whiteMove);
    advanceAfterAuthorWhiteOnCorrect(session, whiteMove);

    console.log("[AI_RESPONSE] author white (correct route)", {
      move: expected.label,
      ply: session.currentPly - 1,
      blackAnswerIndex: session.blackAnswerIndex,
    });

    return true;
  }

  function rollbackAuthorWhiteFailure(session, problem) {
    if (session.playedMoves.length > 0) {
      session.playedMoves.pop();
      session.currentPly = Math.max(1, session.currentPly - 1);
      rebuildBoardFromPlayedMoves(problem, session.playedMoves);
    }
    session.phase = "await_black";
  }

  async function playKatagoWhiteOnWrong(problem, session, lastBlackMove) {
    const stones = boardController.getStones();
    const result = await resolveWhiteResponse({
      problem,
      boardSize,
      stones,
      playedMoves: session.playedMoves,
      initialStones: appState.initialBoardStones ?? problem.stones ?? [],
      lastBlackMove,
      stoneColors,
      studentMoveResult: "wrong",
      currentPly: session.currentPly,
    });

    console.log("[AI_RESPONSE] KataGo white (wrong route)", {
      ok: result.ok,
      source: result.source,
      point: result.point,
      selectedReason: result.selectedReason,
    });

    if (!isKatagoWhiteMove(result)) {
      const message = result.message ?? AI_RESPONSE_SOLVE_MESSAGES.serverRequired;
      setFeedback(message, "wrong");
      window.alert?.(message);
      rollbackFailedKatago(session, problem);
      return false;
    }

    if (boardController.hasStone(result.point)) {
      setFeedback("백 응수 좌표가 이미 돌이 있는 곳입니다.", "wrong");
      rollbackFailedKatago(session, problem);
      return false;
    }

    const whiteMove = { ...result.point, color: stoneColors.white };
    boardController.addStone(whiteMove);
    removeCapturedStonesAfterMove(whiteMove);
    advanceAfterKatagoWhiteOnWrong(session, whiteMove);

    return true;
  }

  return {
    initSession,
    clearSession,
    handleStudentBlackMove,
    isActive: () => Boolean(getSession()),
    isBlockingInput: () => {
      const session = getSession();
      return (
        session?.phase === "katago_pending" ||
        session?.phase === "wrong_reveal" ||
        appState.isAiThinking
      );
    },
  };
}
