import { isOxProblem } from "../game/problem-type.js";

const ACADEMY_MODES = ["learning", "academy", "attendance", "payments"];

export function createSolveView({
  elements,
  appState,
  boardController,
  problems,
  STONE,
  getStoneLabel,
  getProblemStartFeedback,
  getFilteredProblems,
  renderProblemList,
  formatCategoryProblemLabel,
  getProblemsInCategoryOrder,
  setStatus,
  setFeedback,
  updateAcademyMenuVisibility,
  updateAdminVisibility,
  updatePrintUiVisibility,
  renderProblemLibraryScreen,
}) {
  function setMode(mode) {
    appState.mode = mode;
    elements.listModeButton?.classList.toggle("is-active", mode === "list");
    elements.solveModeButton?.classList.toggle("is-active", mode === "study" || mode === "solve");
    elements.learningModeButton?.classList.toggle("is-active", mode === "learning");
    elements.academyModeButton?.classList.toggle("is-active", mode === "academy");
    elements.attendanceModeButton?.classList.toggle("is-active", mode === "attendance");
    elements.paymentsModeButton?.classList.toggle("is-active", mode === "payments");
    elements.platformModeButton?.classList.toggle("is-active", mode === "platform");
    elements.mainMenuButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mainMenu === mode);
    });
    elements.createModeButton?.classList.toggle("is-active", mode === "create");
    elements.creatorPanel.classList.toggle("is-hidden", mode !== "create");
    if (mode !== "create") {
      elements.createOxAnswerPanel?.classList.add("is-hidden");
    }
    elements.nextButton.classList.toggle("is-hidden", mode !== "solve");
    elements.studyLayout.classList.toggle("is-hidden", mode !== "solve" && mode !== "create");
    elements.studyScreen?.classList.toggle("is-hidden", mode !== "study");
    elements.problemListScreen.classList.toggle("is-hidden", mode !== "list");
    elements.platformAdminScreen?.classList.toggle("is-hidden", mode !== "platform");
    elements.academyMenuScreen.classList.toggle("is-hidden", !ACADEMY_MODES.includes(mode));
    elements.heroCard?.classList.toggle("is-compact-hub", mode === "study");
    updateAcademyMenuVisibility();
    updateAdminVisibility();
    updatePrintUiVisibility?.();
  }

  function renderProblemSolveMode(problem) {
    const isOx = isOxProblem(problem);
    elements.moveStatus?.classList.toggle("is-hidden", isOx);
    elements.oxSolvePanel?.classList.toggle("is-hidden", !isOx);
    elements.createOxAnswerPanel?.classList.add("is-hidden");
    elements.boardCard?.classList.toggle("is-readonly", isOx);
    elements.oxSolveButtons?.forEach((button) => {
      button.disabled = appState.isSolved || appState.isAiThinking;
      button.classList.remove("is-selected");
    });
  }

  function renderProblem(problem, index, { reviewItem, boardStones } = {}) {
    setMode("solve");
    elements.title.textContent = problem.title;
    elements.description.textContent = "";
    elements.description.classList.add("is-hidden");
    elements.learningObjective.textContent = problem.description || "정답 1수를 찾아보세요";
    renderProblemSolveMode(problem);
    if (reviewItem) {
      elements.meta.textContent = `${reviewItem.categoryName} 복습 (${reviewItem.positionInQueue}/${reviewItem.totalInQueue})`;
    } else {
      const totalInCategory = getProblemsInCategoryOrder(problem.category, problems, {
        levelGroup: problem.levelGroup,
      }).length;
      elements.meta.textContent = `${formatCategoryProblemLabel(problem, problems)} / ${totalInCategory}`;
    }
    setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
    setFeedback(getProblemStartFeedback(problem));
    boardController.clearAnswerMarker();
    boardController.loadPosition(boardStones ?? problem.stones);
  }

  function renderEmptyProblemState() {
    setMode("list");
    elements.meta.textContent = "No Problems";
    elements.title.textContent = "등록된 문제가 없습니다";
    elements.description.textContent = "관리자 모드에서 새 문제를 추가해 주세요.";
    elements.description.classList.remove("is-hidden");
    elements.learningObjective.textContent = "새 문제를 추가해 주세요";
    setStatus("문제 없음");
    setFeedback("현재 등록된 문제가 없습니다.");
    boardController.clearAnswerMarker();
    boardController.loadPosition([]);
  }

  function renderProblemBank() {
    setMode("list");
    elements.meta.textContent = "Problem Library";
    elements.title.textContent = "문제은행";
    elements.description.textContent =
      "카테고리별로 문제를 살펴보고 학습할 문제를 선택하세요.";
    elements.description.classList.remove("is-hidden");
    elements.learningObjective.textContent = "학습할 문제를 선택하세요";
    renderProblemList();
  }

  return {
    setMode,
    renderProblem,
    renderProblemSolveMode,
    renderEmptyProblemState,
    renderProblemBank,
  };
}
