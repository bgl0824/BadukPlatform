import { PROBLEM_TYPE } from "../game/problem-type.js";

export function createProblemCreatorView({
  elements,
  creatorState,
  boardController,
  CREATOR_CATEGORIES,
}) {
  function renderOxAnswerChoice() {
    const isOx = creatorState.problemType === PROBLEM_TYPE.ox;

    elements.createOxAnswerPanel?.classList.toggle("is-hidden", !isOx);

    elements.createOxAnswerButtons?.forEach((button) => {
      const isSelected = button.dataset.createOxAnswer === String(creatorState.oxAnswer);
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function renderCreateMode() {
    elements.meta.textContent = "Problem Builder";
    elements.title.textContent = "문제 제작 모드";
    elements.description.textContent =
      "카테고리와 타입을 고른 뒤 바둑판을 배치하고 정답을 지정하세요.";
    elements.description.classList.remove("is-hidden");
    elements.learningObjective.textContent = "문제도를 직접 만들어 보세요";
    renderProblemTypeUi();
    boardController.loadPosition(creatorState.stones);
    boardController.setAnswerMarker(creatorState.correctMove);
  }

  function renderProblemTypeUi() {
    const isOx = creatorState.problemType === PROBLEM_TYPE.ox;

    if (elements.createProblemType) {
      elements.createProblemType.value = creatorState.problemType;
    }

    renderOxAnswerChoice();

    const answerTool = Array.from(elements.toolButtons ?? []).find(
      (button) => button.dataset.tool === "answer",
    );

    answerTool?.classList.toggle("is-hidden", isOx);

    if (isOx) {
      boardController.clearAnswerMarker();
    } else {
      boardController.setAnswerMarker(creatorState.correctMove);
    }
  }

  function renderCreatorCategoryOptions({ onSelectCategory }) {
    elements.createCategoryOptions.innerHTML = "";
    elements.selectedCreateCategory.textContent = creatorState.selectedCategory;
    elements.createCategoryToggle.setAttribute(
      "aria-expanded",
      String(creatorState.isCategoryOpen),
    );
    elements.createCategoryToggle.classList.toggle("is-open", creatorState.isCategoryOpen);
    elements.createCategoryOptions.classList.toggle("is-open", creatorState.isCategoryOpen);

    CREATOR_CATEGORIES.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "creator-category-button";
      button.dataset.category = category;
      button.textContent = category;
      button.classList.toggle("is-active", category === creatorState.selectedCategory);
      button.addEventListener("click", () => onSelectCategory(category));
      elements.createCategoryOptions.append(button);
    });
  }

  function renderCreatorBoard() {
    boardController.setStones(creatorState.stones);
    if (creatorState.problemType === PROBLEM_TYPE.ox) {
      boardController.clearAnswerMarker();
      return;
    }

    boardController.setAnswerMarker(creatorState.correctMove);
  }

  function renderActiveTool(tool) {
    elements.toolButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === tool);
    });
    elements.markButtons.forEach((button) => {
      button.classList.remove("is-active");
    });
  }

  function renderActiveMark(mark) {
    elements.toolButtons.forEach((button) => {
      button.classList.remove("is-active");
    });
    elements.markButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mark === mark);
    });
  }

  function clearProblemJson() {
    elements.problemJson.value = "";
  }

  function renderProblemJson(problem) {
    elements.problemJson.value = `${JSON.stringify(problem, null, 2)},`;
  }

  return {
    renderCreateMode,
    renderProblemTypeUi,
    renderOxAnswerChoice,
    renderCreatorCategoryOptions,
    renderCreatorBoard,
    renderActiveTool,
    renderActiveMark,
    clearProblemJson,
    renderProblemJson,
  };
}
