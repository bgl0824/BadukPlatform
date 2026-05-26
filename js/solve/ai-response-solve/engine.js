import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import { isCorrectBlackMove } from "./black-sequence.js";
import { logAiResponseSolveContext } from "../../game/problem-mode.js";
import {
  advanceAfterKatagoWhiteOnCorrect,
  advanceAfterKatagoWhiteOnWrong,
  advancePlyAfterBlack,
  createAiResponseSolveSession,
  getExpectedBlackAnswer,
  isLastBlackAnswer,
} from "./session.js";
import { isKatagoWhiteMove, resolveWhiteResponse } from "./resolve-white-response.js";

/**
 * AI 응수형 전용 문제풀이 엔진 (일반 handleUserMove와 분리).
 * 오답: 백 응수 자동 → boardFeedbackOverlay 오답 팝업 → 초기화 (한수 문제풀이와 동일).
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

    const whiteOk = await playWhiteResponse(problem, session, userMove, "correct");
    if (!whiteOk) {
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

    const whiteOk = await playWhiteResponse(problem, session, lastBlackMove, "wrong");

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

  function rollbackFailedKatago(session, problem, { wasCorrectPath }) {
    if (wasCorrectPath && session.playedMoves.length > 0) {
      session.playedMoves.pop();
      session.currentPly = Math.max(1, session.currentPly - 1);
      rebuildBoardFromPlayedMoves(problem, session.playedMoves);
      session.phase = "await_black";
      return;
    }

    resetCurrentProblemAfterWrong(problem);
    clearSession();
  }

  async function playWhiteResponse(problem, session, lastBlackMove, studentMoveResult) {
    const stones = boardController.getStones();
    const result = await resolveWhiteResponse({
      problem,
      boardSize,
      stones,
      playedMoves: session.playedMoves,
      initialStones: appState.initialBoardStones ?? problem.stones ?? [],
      lastBlackMove,
      stoneColors,
      studentMoveResult,
      currentPly: session.currentPly,
    });

    console.log("[AI_RESPONSE] white response", {
      studentMoveResult,
      ok: result.ok,
      source: result.source,
      point: result.point,
      selectedReason: result.selectedReason,
      currentPly: session.currentPly,
      needsServer: result.needsServer,
    });

    if (!isKatagoWhiteMove(result)) {
      const message = result.message ?? AI_RESPONSE_SOLVE_MESSAGES.serverRequired;
      setFeedback(message, "wrong");
      window.alert?.(message);
      rollbackFailedKatago(session, problem, {
        wasCorrectPath: studentMoveResult === "correct",
      });
      return false;
    }

    if (boardController.hasStone(result.point)) {
      setFeedback("백 응수 좌표가 이미 돌이 있는 곳입니다.", "wrong");
      rollbackFailedKatago(session, problem, {
        wasCorrectPath: studentMoveResult === "correct",
      });
      return false;
    }

    const whiteMove = { ...result.point, color: stoneColors.white };
    boardController.addStone(whiteMove);
    removeCapturedStonesAfterMove(whiteMove);

    if (studentMoveResult === "correct") {
      advanceAfterKatagoWhiteOnCorrect(session, whiteMove);
    } else {
      advanceAfterKatagoWhiteOnWrong(session, whiteMove);
    }

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
