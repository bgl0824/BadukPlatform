import { AI_RESPONSE_UX_MESSAGES } from "./config.js";
import { resolveCandidateResponses } from "./candidates.js";
import { clearAiResponseSpots, renderAiResponseSpots } from "./spot-renderer.js";

/**
 * AI 응수 UX 프로토타입 — 명시적 candidateResponses만 스팟 표시 (KataGo 연동 대비).
 */

/** @typedef {"entered" | "no_candidates"} AiResponseEnterResult */
export function createAiResponseUxController({
  appState,
  boardController,
  boardSize,
  stoneColors,
  elements,
  getCurrentProblem,
  setStatus,
  setFeedback,
  syncBoardPreviewContext,
  removeCapturedStonesAfterMove,
  cloneBoardStones,
}) {
  function isActive() {
    return Boolean(appState.aiResponseSession?.active);
  }

  function isPickingWhiteResponse() {
    return appState.aiResponseSession?.phase === "pick_white";
  }

  function getCandidateAt(point) {
    const session = appState.aiResponseSession;
    if (!session?.candidates) {
      return null;
    }

    return (
      session.candidates.find(
        (candidate) => candidate.x === point.x && candidate.y === point.y,
      ) ?? null
    );
  }

  /**
   * @returns {AiResponseEnterResult | null} entered = 모드 진입, no_candidates = 후보 없음, null = 비활성
   */
  function enterAfterWrongMove(problem, wrongMove) {
    const stones = boardController.getStones();
    const candidates = resolveCandidateResponses(problem, { boardSize });

    if (candidates.length === 0) {
      console.info("[AiResponseUx] no candidate responses — skip spot overlay");
      return "no_candidates";
    }

    appState.aiResponseSession = {
      active: true,
      phase: "pick_white",
      problemId: problem.id,
      wrongMove: { ...wrongMove },
      candidates,
      boardSnapshotAfterWrong: cloneBoardStones(stones),
    };

    appState.isAiThinking = false;
    renderAiResponseSpots(boardController, candidates, boardSize);
    renderPanel({ visible: true, showActions: false });
    syncBoardPreviewContext();
    setStatus("백 응수 차례", { aiResponseTurn: true });
    setFeedback(AI_RESPONSE_UX_MESSAGES.pickWhite);
    return "entered";
  }

  function handleBoardClick(point) {
    const session = appState.aiResponseSession;
    if (!session?.active) {
      return false;
    }

    if (session.phase === "revealed") {
      return true;
    }

    if (!isPickingWhiteResponse()) {
      return true;
    }

    const candidate = getCandidateAt(point);
    if (!candidate) {
      setFeedback("파란/초록 스팟 위에 백 돌을 놓아 보세요.");
      return true;
    }

    if (boardController.hasStone(point)) {
      setFeedback("이미 돌이 있는 자리입니다.");
      return true;
    }

    const whiteMove = { ...point, color: stoneColors.white };
    boardController.addStone(whiteMove);
    removeCapturedStonesAfterMove(whiteMove);

    session.phase = "revealed";
    session.selectedCandidate = candidate;
    session.whiteMove = whiteMove;
    clearAiResponseSpots(boardController);
    syncBoardPreviewContext();

    const hint =
      candidate.color === "blue"
        ? "백이 이렇게 응수하면 축이 성립하지 않습니다."
        : "백이 이렇게 두면 다른 변화가 됩니다. 축이 왜 안 되는지 느껴 보세요.";

    setStatus("오답입니다.");
    setFeedback(`오답입니다. ${hint}`);
    renderPanel({
      visible: true,
      showActions: true,
      message: hint,
    });
    return true;
  }

  function retryFromWrongPosition() {
    const session = appState.aiResponseSession;
    const problem = getCurrentProblem();
    if (!session?.boardSnapshotAfterWrong || !problem) {
      exit({ silent: true });
      return;
    }

    boardController.loadPosition(cloneBoardStones(session.boardSnapshotAfterWrong));
    session.phase = "pick_white";
    session.selectedCandidate = null;
    session.whiteMove = null;

    renderAiResponseSpots(boardController, session.candidates, boardSize);
    renderPanel({ visible: true, showActions: false });
    syncBoardPreviewContext();
    setStatus("백 응수 차례", { aiResponseTurn: true });
    setFeedback(AI_RESPONSE_UX_MESSAGES.pickWhite);
  }

  function restartFromBeginning() {
    const problem = getCurrentProblem();
    if (!problem) {
      exit({ silent: true });
      return;
    }

    boardController.loadPosition(
      cloneBoardStones(appState.initialBoardStones ?? problem.stones ?? []),
    );
    appState.playedMoves = [];
    appState.solvedAnswerKeys = new Set();
    exit({ silent: true });
    syncBoardPreviewContext();
    setStatus("흑 차례입니다.", { aiResponseTurn: false });
    setFeedback("처음부터 다시 풀어 보세요.");
  }

  function exit({ silent = false } = {}) {
    appState.aiResponseSession = null;
    clearAiResponseSpots(boardController);
    renderPanel({ visible: false, showActions: false });
    if (!silent) {
      syncBoardPreviewContext();
    }
  }

  function evaluatePreviewPoint(point, stones) {
    if (!isPickingWhiteResponse()) {
      return { status: "illegal" };
    }

    if (stones.some((stone) => stone.x === point.x && stone.y === point.y)) {
      return { status: "occupied" };
    }

    if (!getCandidateAt(point)) {
      return { status: "illegal" };
    }

    return { status: "legal" };
  }

  function getPreviewColor() {
    return stoneColors.white;
  }

  function renderPanel({ visible, showActions = false, message = "" }) {
    const panel = elements.aiResponseUxPanel;
    const messageEl = elements.aiResponseUxMessage;
    if (!panel) {
      return;
    }

    panel.classList.toggle("is-hidden", !visible);
    panel.classList.toggle("is-revealed", showActions);

    if (messageEl) {
      messageEl.textContent = message;
    }

    elements.aiResponseUxRetry?.classList.toggle("is-hidden", !showActions);
    elements.aiResponseUxRestart?.classList.toggle("is-hidden", !showActions);
  }

  function bindEvents() {
    elements.aiResponseUxPanel?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ai-response-action]");
      if (!button) {
        return;
      }

      const action = button.dataset.aiResponseAction;
      if (action === "retry") {
        retryFromWrongPosition();
        return;
      }

      if (action === "restart") {
        restartFromBeginning();
      }
    });
  }

  return {
    bindEvents,
    isActive,
    isPickingWhiteResponse,
    enterAfterWrongMove,
    handleBoardClick,
    evaluatePreviewPoint,
    getPreviewColor,
    exit,
    retryFromWrongPosition,
    restartFromBeginning,
  };
}
