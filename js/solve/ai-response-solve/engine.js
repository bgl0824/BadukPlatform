import { isValidBoardPoint } from "../../game/board-point-validation.js";
import { getProblemBoardSize } from "../../game/board-size.js";
import { AI_RESPONSE_SOLVE_MESSAGES } from "./constants.js";
import { getExpectedAuthorWhite, formatCoordLabel } from "./answer-sequence.js";
import { isCorrectBlackMove } from "./black-sequence.js";
import { logAiResponseSolveContext, shouldUseAiResponseSolve } from "../../game/problem-mode.js";
import {
  advanceAfterAuthorWhiteOnCorrect,
  advanceAfterKatagoWhiteOnWrong,
  advancePlyAfterBlack,
  createAiResponseSolveSession,
  getExpectedBlackAnswer,
  isLastBlackAnswer,
} from "./session.js";
import { isValidWhiteResponseMove, resolveWhiteResponse } from "./resolve-white-response.js";
import { logAiResponseSessionSnapshot } from "./respond-diagnostics.js";

const DEFAULT_AUTHOR_WHITE_RESPONSE_DELAY_MS = 500;

function getAuthorWhiteResponseDelayMs() {
  const configured = Number(window.BadukConfig?.authorWhiteResponseDelayMs);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return DEFAULT_AUTHOR_WHITE_RESPONSE_DELAY_MS;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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
  getBoardCandidateLabels,
  markProblemInProgress,
}) {
  function getActiveBoardSize(problem = getCurrentProblem?.()) {
    return getProblemBoardSize(problem ?? {});
  }

  function getSession() {
    return appState.aiResponseSolveSession;
  }

  function initSession(problem) {
    appState.aiResponseSolveSession = createAiResponseSolveSession(
      problem,
      getActiveBoardSize(problem),
    );
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
    let session = getSession();

    if (!session?.phase && problem && shouldUseAiResponseSolve(problem)) {
      console.warn("[AI_RESPONSE] missing session — auto initSession", {
        problemId: problem.id,
      });
      initSession(problem);
      session = getSession();
    }

    console.log("[AI_RESPONSE] handleStudentBlackMove", {
      point,
      phase: session?.phase,
      currentPly: session?.currentPly,
      blackAnswerIndex: session?.blackAnswerIndex,
    });

    if (
      !problem ||
      !session ||
      session.phase === "katago_pending" ||
      session.phase === "author_white_pending"
    ) {
      return;
    }

    if (appState.isSolved) {
      return;
    }

    if (
      session.phase === "wrong_reveal" ||
      session.phase === "author_white_pending" ||
      session.phase === "completed" ||
      appState.isAiThinking
    ) {
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
    const wrongBlackCapturedCount = removeCapturedStonesAfterMove(userMove);
    session.playedMoves.push(userMove);
    advancePlyAfterBlack(session);

    markProblemInProgress?.(problem);

    if (!isCorrect) {
      recordWrongMove(problem, userMove);
      console.warn("[AI_RESPONSE] wrong black move capture", {
        move: formatCoordLabel(userMove),
        capturedCount: wrongBlackCapturedCount,
        stonesAfterCount: boardController.getStones().length,
      });
      await revealWrongWithWhite(problem, session, userMove);
      return;
    }

    if (isLastBlackAnswer(session)) {
      session.phase = "completed";
      logAiResponseSessionSnapshot(appState, "last black correct — before completeProblem");
      console.log("[AI_RESPONSE] last black correct — complete");
      completeProblem(problem);
      clearSession();
      return;
    }

    const authorOk = await playAuthorWhiteOnCorrect(problem, session);
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
    boardController.loadPosition(cloneBoardStones(appState.initialBoardStones ?? problem.stones ?? []), {
      candidateLabels: getBoardCandidateLabels?.(problem) ?? [],
    });
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

  async function playAuthorWhiteOnCorrect(problem, session) {
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
    if (!isValidBoardPoint(point, getActiveBoardSize(problem))) {
      console.warn("[AI_RESPONSE] invalid author white coordinate", expected);
      rollbackAuthorWhiteFailure(session, problem);
      return false;
    }
    if (boardController.hasStone(point)) {
      setFeedback("제작자 정답 백 수 좌표에 이미 돌이 있습니다.", "wrong");
      rollbackAuthorWhiteFailure(session, problem);
      return false;
    }

    const delayMs = getAuthorWhiteResponseDelayMs();
    session.phase = "author_white_pending";
    appState.isAiThinking = true;
    syncBoardPreviewContext();
    setStatus(AI_RESPONSE_SOLVE_MESSAGES.authorWhiteThinking, { aiResponseTurn: true });

    if (delayMs > 0) {
      await delay(delayMs);
    }

    if (getSession() !== session || session.phase !== "author_white_pending") {
      appState.isAiThinking = false;
      syncBoardPreviewContext();
      return false;
    }

    if (boardController.hasStone(point)) {
      appState.isAiThinking = false;
      session.phase = "await_black";
      syncBoardPreviewContext();
      setFeedback("제작자 정답 백 수 좌표에 이미 돌이 있습니다.", "wrong");
      rollbackAuthorWhiteFailure(session, problem);
      return false;
    }

    const whiteMove = { ...point, color: stoneColors.white };
    boardController.addStone(whiteMove);
    removeCapturedStonesAfterMove(whiteMove);
    advanceAfterAuthorWhiteOnCorrect(session, whiteMove);
    appState.isAiThinking = false;
    syncBoardPreviewContext();

    console.log("[AI_RESPONSE] author white (correct route)", {
      move: expected.label,
      ply: session.currentPly - 1,
      blackAnswerIndex: session.blackAnswerIndex,
      delayMs,
    });

    return true;
  }

  function rollbackAuthorWhiteFailure(session, problem) {
    appState.isAiThinking = false;
    if (session.playedMoves.length > 0) {
      session.playedMoves.pop();
      session.currentPly = Math.max(1, session.currentPly - 1);
      rebuildBoardFromPlayedMoves(problem, session.playedMoves);
    }
    session.phase = "await_black";
    syncBoardPreviewContext();
  }

  async function playKatagoWhiteOnWrong(problem, session, lastBlackMove) {
    const stones = boardController.getStones();
    const result = await resolveWhiteResponse({
      problem,
      boardSize: getActiveBoardSize(problem),
      stones,
      playedMoves: session.playedMoves,
      initialStones: appState.initialBoardStones ?? problem.stones ?? [],
      lastBlackMove,
      stoneColors,
      studentMoveResult: "wrong",
      currentPly: session.currentPly,
      blackAnswerIndex: session.blackAnswerIndex,
    });

    console.log("[AI_RESPONSE] KataGo white (wrong route)", {
      ok: result.ok,
      source: result.source,
      point: result.point,
      selectedReason: result.selectedReason,
      usedLocalFallback: result.usedLocalFallback,
      katagoElapsedMs: result.katagoElapsedMs,
      totalElapsedMs: result.totalElapsedMs,
    });
    logAiResponseSessionSnapshot(appState, "after resolveWhiteResponse", {
      respondOk: result.ok,
      selectedReason: result.selectedReason,
      usedLocalFallback: result.usedLocalFallback,
    });

    if (!isValidWhiteResponseMove(result)) {
      logAiResponseSessionSnapshot(appState, "invalid white response — rollback", {
        result,
      });
      const message = result.message ?? AI_RESPONSE_SOLVE_MESSAGES.serverRequired;
      setFeedback(message, "wrong");
      window.alert?.(message);
      rollbackFailedKatago(session, problem);
      return false;
    }

    if (!isValidBoardPoint(result.point, getActiveBoardSize(problem))) {
      console.warn("[AI_RESPONSE] invalid KataGo white coordinate", result.point);
      setFeedback("백 응수 좌표가 올바르지 않습니다.", "wrong");
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
        session?.phase === "author_white_pending" ||
        session?.phase === "wrong_reveal" ||
        appState.isAiThinking
      );
    },
  };
}
