import { PROBLEM_TYPE } from "../game/problem-type.js";
import { normalizeLevelGroup } from "../services/level-group-service.js";

export function createProblemCreatorController({
  elements,
  appState,
  creatorState,
  boardController,
  createView,
  STONE,
  CREATOR_CATEGORIES,
  setFeedback,
  setStatus,
  isSamePoint,
  getStoneLabel,
  getMarkLabel,
  sortStones,
  createProblemId,
  clearPendingAiMove,
  setMode,
  syncBoardPreviewContext,
}) {
  function renderCreatorCategoryOptions() {
    createView.renderCreatorCategoryOptions({
      onSelectCategory: selectCreatorCategory,
    });
  }

  function toggleCreatorCategoryOptions() {
    creatorState.isCategoryOpen = !creatorState.isCategoryOpen;
    renderCreatorCategoryOptions();
  }

  function selectCreatorCategory(category) {
    creatorState.selectedCategory = category;
    creatorState.isCategoryOpen = false;
    renderCreatorCategoryOptions();
    setFeedback(`${category} 카테고리를 선택했습니다.`);
  }

  function getCreatorOxAnswerFromForm() {
    return Boolean(creatorState.oxAnswer);
  }

  function setCreatorOxAnswer(oxAnswer) {
    creatorState.oxAnswer = Boolean(oxAnswer);
    createView.renderOxAnswerChoice();
    setFeedback(
      creatorState.oxAnswer ? "정답을 O(둘 수 있음)로 설정했습니다." : "정답을 X(둘 수 없음)로 설정했습니다.",
    );
  }

  function setCreatorProblemType(type) {
    creatorState.problemType = type === PROBLEM_TYPE.ox ? PROBLEM_TYPE.ox : PROBLEM_TYPE.board;
    createView.renderProblemTypeUi();
    syncBoardPreviewContext?.();
    setFeedback(
      creatorState.problemType === PROBLEM_TYPE.ox
        ? "O/X 판정형입니다. 바둑판을 배치한 뒤 아래에서 정답을 선택하세요."
        : "바둑판 착수형 문제입니다.",
    );
  }

  function showCreateMode() {
    clearPendingAiMove();
    appState.isAiThinking = false;
    appState.isSolved = false;
    appState.playedMoves = [];
    setMode("create");
    createView.renderCreateMode();
    setStatus("흑돌 배치 도구가 선택되었습니다.");
    setFeedback("좌클릭=흑, 우클릭=백으로 돌을 배치할 수 있습니다. 표시·정답은 도구 버튼을 사용하세요.");
  }

  function setCreatorTool(tool) {
    creatorState.activeTool = tool;
    createView.renderActiveTool(tool);
    syncBoardPreviewContext?.();

    const label = tool === "answer" ? "정답 위치" : getStoneLabel(tool);
    setStatus(`${label} 도구가 선택되었습니다.`);
  }

  function setCreatorMark(mark) {
    creatorState.activeTool = "mark";
    creatorState.activeMark = mark;
    createView.renderActiveMark(mark);
    syncBoardPreviewContext?.();
    setStatus(`${getMarkLabel(mark)} 도구가 선택되었습니다.`);
    setFeedback("표시를 넣을 바둑알을 선택하세요.");
  }

  function handleCreatorBoardClick(point, { button = "primary" } = {}) {
    if (creatorState.activeTool === "answer") {
      if (button === "secondary") {
        return;
      }

      setCreatorAnswer(point);
      return;
    }

    if (creatorState.activeTool === "mark") {
      if (button === "secondary") {
        return;
      }

      setCreatorStoneMark(point);
      return;
    }

    const color = button === "secondary" ? STONE.white : STONE.black;
    placeCreatorStone(point, color);
  }

  function setCreatorStoneMark(point) {
    const targetStone = creatorState.stones.find((stone) => isSamePoint(stone, point));
    if (!targetStone) {
      setFeedback("표시는 기존 바둑알 위에만 추가할 수 있습니다.", "wrong");
      return;
    }

    pushCreatorHistory();
    creatorState.stones = creatorState.stones.map((stone) => {
      if (!isSamePoint(stone, point)) {
        return stone;
      }

      if (creatorState.activeMark === "none") {
        const { mark, ...stoneWithoutMark } = stone;
        return stoneWithoutMark;
      }

      return { ...stone, mark: creatorState.activeMark };
    });

    renderCreatorBoard();
    setFeedback(`${getMarkLabel(creatorState.activeMark)} 표시를 적용했습니다.`);
  }

  function placeCreatorStone(point, color) {
    pushCreatorHistory();

    const existingStone = creatorState.stones.find((stone) => isSamePoint(stone, point));
    if (existingStone?.color === color) {
      creatorState.stones = creatorState.stones.filter((stone) => !isSamePoint(stone, point));
      setFeedback("같은 돌을 다시 눌러 제거했습니다.");
    } else {
      creatorState.stones = [
        ...creatorState.stones.filter((stone) => !isSamePoint(stone, point)),
        { ...point, color },
      ];
      setFeedback(`${getStoneLabel(color)}돌을 배치했습니다.`);
    }

    if (creatorState.correctMove && isSamePoint(creatorState.correctMove, point)) {
      creatorState.correctMove = null;
      boardController.clearAnswerMarker();
    }

    renderCreatorBoard();
  }

  function setCreatorAnswer(point) {
    if (creatorState.problemType === PROBLEM_TYPE.ox) {
      setFeedback("O/X 문제는 정답 위치 대신 O/X 선택을 사용합니다.", "wrong");
      return;
    }

    if (creatorState.stones.some((stone) => isSamePoint(stone, point))) {
      setFeedback("돌이 있는 곳은 정답 위치로 지정할 수 없습니다.", "wrong");
      return;
    }

    pushCreatorHistory();
    creatorState.correctMove = { ...point };
    renderCreatorBoard();
    setFeedback("정답 위치를 지정했습니다.");
  }

  function undoCreatorAction() {
    const previousState = creatorState.history.pop();
    if (!previousState) {
      setFeedback("되돌릴 제작 작업이 없습니다.", "wrong");
      return;
    }

    creatorState.stones = previousState.stones;
    creatorState.correctMove = previousState.correctMove;
    renderCreatorBoard();
    setFeedback("마지막 제작 작업을 취소했습니다.");
  }

  function resetCreatorBoard() {
    pushCreatorHistory();
    creatorState.stones = [];
    creatorState.correctMove = null;
    createView.clearProblemJson();
    renderCreatorBoard();
    setFeedback("제작 중인 문제를 초기화했습니다.");
  }

  function renderCreatorBoard() {
    createView.renderCreatorBoard();
  }

  function pushCreatorHistory() {
    creatorState.history.push({
      stones: creatorState.stones.map((stone) => ({ ...stone })),
      correctMove: creatorState.correctMove ? { ...creatorState.correctMove } : null,
    });
  }

  function generateProblemJson() {
    const title = elements.createTitle.value.trim() || "새 바둑 문제";
    const category = creatorState.selectedCategory || "미분류";
    const levelGroup = normalizeLevelGroup(appState.selectedLevelGroup);
    const baseProblem = {
      id: createProblemId(title, category),
      title,
      description: elements.createDescription.value.trim() || "문제 설명을 입력하세요.",
      level: elements.createLevel.value.trim() || "30급",
      levelGroup,
      category,
      stones: sortStones(creatorState.stones),
    };

    if (creatorState.problemType === PROBLEM_TYPE.ox) {
      const problem = {
        ...baseProblem,
        type: PROBLEM_TYPE.ox,
        oxAnswer: getCreatorOxAnswerFromForm(),
      };

      createView.renderProblemJson(problem);
      setFeedback("O/X 문제 JSON을 생성했습니다.", "correct");
      return;
    }

    if (!creatorState.correctMove) {
      setFeedback("JSON 출력 전에 정답 위치를 지정해 주세요.", "wrong");
      return;
    }

    const problem = {
      ...baseProblem,
      type: PROBLEM_TYPE.board,
      correctMove: { ...creatorState.correctMove },
    };

    createView.renderProblemJson(problem);
    setFeedback("problems.js 배열에 붙여넣을 수 있는 JSON을 생성했습니다.", "correct");
  }

  return {
    bindCreateEvents,
    renderCreatorCategoryOptions,
    toggleCreatorCategoryOptions,
    showCreateMode,
    setCreatorTool,
    setCreatorMark,
    handleCreatorBoardClick,
    undoCreatorAction,
    resetCreatorBoard,
    generateProblemJson,
  };

  function bindCreateEvents() {
    elements.createModeButton?.addEventListener("click", showCreateMode);
    elements.toolButtons.forEach((button) => {
      button.addEventListener("click", () => setCreatorTool(button.dataset.tool));
    });
    elements.markButtons.forEach((button) => {
      button.addEventListener("click", () => setCreatorMark(button.dataset.mark));
    });
    elements.undoCreateButton?.addEventListener("click", undoCreatorAction);
    elements.resetCreateButton?.addEventListener("click", resetCreatorBoard);
    elements.generateJsonButton?.addEventListener("click", generateProblemJson);
    elements.createCategoryToggle?.addEventListener("click", toggleCreatorCategoryOptions);
    elements.createProblemType?.addEventListener("change", (event) => {
      setCreatorProblemType(event.target.value);
    });
    elements.createOxAnswerButtons?.forEach((button) => {
      button.addEventListener("click", () => {
        setCreatorOxAnswer(button.dataset.createOxAnswer === "true");
      });
    });
  }
}
