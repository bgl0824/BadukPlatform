(function () {
const { getAiCounterMove } = window.BadukAi;
const { BoardController } = window.BadukBoard;
const { BOARD_SIZE, problems, STONE } = window.BadukProblems;
const { createProblemSgf } = window.BadukSgf;

const CREATOR_CATEGORIES = [
  "활로",
  "돌따내기",
  "돌살리기",
  "서로단수",
  "착수금지",
  "패",
  "연결",
  "끊음",
  "단수쳐서잡기",
  "양단수",
  "촉촉수",
  "축",
  "장문",
  "환격",
  "수상전",
  "먹여치기",
  "옥집",
  "두집만들기",
  "두집없애기",
  "빅",
  "끝내기",
  "공배",
];
const STORAGE_KEYS = {
  problems: "BADUK_PLATFORM_PROBLEMS",
  categories: "BADUK_PLATFORM_CATEGORIES",
};
const CAPTURE_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const elements = {
  meta: document.querySelector("#problem-meta"),
  title: document.querySelector("#problem-title"),
  description: document.querySelector("#problem-description"),
  learningObjective: document.querySelector("#learning-objective"),
  grade: document.querySelector("#problem-grade"),
  board: document.querySelector("#board"),
  status: document.querySelector("#move-status"),
  feedback: document.querySelector("#feedback"),
  nextButton: document.querySelector("#next-problem"),
  adminModeToggle: document.querySelector("#admin-mode-toggle"),
  studyLayout: document.querySelector("#study-layout"),
  listModeButton: document.querySelector("#list-mode"),
  solveModeButton: document.querySelector("#solve-mode"),
  createModeButton: document.querySelector("#create-mode"),
  problemListScreen: document.querySelector("#problem-list-screen"),
  categoryFilters: document.querySelector("#category-filters"),
  listSummary: document.querySelector("#list-summary"),
  problemCards: document.querySelector("#problem-cards"),
  printSelectionCount: document.querySelector("#print-selection-count"),
  printMonochrome: document.querySelector("#print-monochrome"),
  printSelectedButton: document.querySelector("#print-selected-problems"),
  printArea: document.querySelector("#print-area"),
  answerModal: document.querySelector("#answer-modal"),
  answerModalMessage: document.querySelector("#answer-modal-message"),
  wrongModal: document.querySelector("#wrong-modal"),
  adminListActions: document.querySelector("#admin-list-actions"),
  adminNewCategory: document.querySelector("#admin-new-category"),
  addCategoryButton: document.querySelector("#add-category"),
  addProblemButton: document.querySelector("#add-problem"),
  adminEditor: document.querySelector("#admin-editor"),
  creatorPanel: document.querySelector("#creator-panel"),
  createTitle: document.querySelector("#create-title"),
  createDescription: document.querySelector("#create-description"),
  createLevel: document.querySelector("#create-level"),
  createCategoryToggle: document.querySelector("#create-category-toggle"),
  selectedCreateCategory: document.querySelector("#selected-create-category"),
  createCategoryOptions: document.querySelector("#create-category-options"),
  toolButtons: document.querySelectorAll(".tool-button"),
  markButtons: document.querySelectorAll(".mark-button"),
  undoCreateButton: document.querySelector("#undo-create"),
  resetCreateButton: document.querySelector("#reset-create"),
  generateJsonButton: document.querySelector("#generate-json"),
  problemJson: document.querySelector("#problem-json"),
};

if (!window.WGo) {
  elements.feedback.textContent =
    "WGo.js를 불러오지 못했습니다. 인터넷 연결 또는 CDN 접근을 확인해 주세요.";
  throw new Error("WGo.js failed to load.");
}

const appState = {
  mode: "solve",
  selectedCategory: "",
  currentProblemIndex: 0,
  solvedAnswerKeys: new Set(),
  isSolved: false,
  isAiThinking: false,
  pendingAiTimeout: null,
  autoNextTimeout: null,
  wrongModalTimeout: null,
  wrongResetTimeout: null,
  canDismissAnswerModal: false,
  selectedPrintProblemIds: new Set(),
  playedMoves: [],
};

const creatorState = {
  activeTool: STONE.black,
  activeMark: "triangle",
  selectedCategory: CREATOR_CATEGORIES[0] ?? "",
  isCategoryOpen: false,
  stones: [],
  correctMove: null,
  history: [],
};

const adminState = {
  isEnabled: false,
  editingIndex: null,
  draft: null,
  activeTool: STONE.black,
  activeMark: "triangle",
};

const boardController = new BoardController(elements.board, {
  size: BOARD_SIZE,
  onPlay: handleBoardClick,
});

elements.listModeButton.addEventListener("click", showListMode);
elements.solveModeButton.addEventListener("click", showSolveMode);
elements.createModeButton.addEventListener("click", showCreateMode);
elements.nextButton.addEventListener("click", showNextProblem);
elements.adminModeToggle.addEventListener("click", toggleAdminMode);
elements.addCategoryButton.addEventListener("click", addAdminCategory);
elements.addProblemButton.addEventListener("click", startAddingProblem);
elements.printSelectedButton.addEventListener("click", printSelectedProblems);
elements.toolButtons.forEach((button) => {
  button.addEventListener("click", () => setCreatorTool(button.dataset.tool));
});
elements.markButtons.forEach((button) => {
  button.addEventListener("click", () => setCreatorMark(button.dataset.mark));
});
elements.undoCreateButton.addEventListener("click", undoCreatorAction);
elements.resetCreateButton.addEventListener("click", resetCreatorBoard);
elements.generateJsonButton.addEventListener("click", generateProblemJson);
elements.createCategoryToggle.addEventListener("click", toggleCreatorCategoryOptions);
elements.answerModal.addEventListener("click", () => {
  if (appState.canDismissAnswerModal) {
    hideAnswerModal();
  }
});

restoreAdminData();
renderCategoryFilters();
renderCreatorCategoryOptions();
renderProblemList();
if (problems.length > 0) {
  loadProblem(0);
} else {
  showEmptyProblemState();
}

function loadProblem(index) {
  const problem = problems[index];

  if (!problem) {
    showEmptyProblemState();
    return;
  }

  clearPendingAiMove();
  clearAutoNext();
  clearWrongTimers();
  hideAnswerModal();
  hideWrongModal();
  setMode("solve");
  appState.currentProblemIndex = index;
  appState.solvedAnswerKeys = new Set();
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];

  elements.title.textContent = problem.title;
  elements.description.textContent = "";
  elements.description.classList.add("is-hidden");
  elements.learningObjective.textContent = problem.description || "정답 1수를 찾아보세요";
  elements.grade.textContent = problem.level;
  elements.meta.textContent = `문제 ${index + 1} / ${problems.length} · ${problem.category}`;
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
  setFeedback(getProblemStartFeedback(problem));

  boardController.clearAnswerMarker();
  boardController.loadPosition(problem.stones);
}

function showEmptyProblemState() {
  clearPendingAiMove();
  clearAutoNext();
  clearWrongTimers();
  hideAnswerModal();
  hideWrongModal();
  setMode("list");
  appState.currentProblemIndex = 0;
  appState.solvedAnswerKeys = new Set();
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];

  elements.meta.textContent = "No Problems";
  elements.title.textContent = "등록된 문제가 없습니다";
  elements.description.textContent = "관리자 모드나 문제 제작 모드에서 새 문제를 추가해 주세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "새 문제를 추가해 주세요";
  elements.grade.textContent = "0문제";
  setStatus("문제 없음");
  setFeedback("현재 등록된 문제가 없습니다.");
  boardController.clearAnswerMarker();
  boardController.loadPosition([]);
  renderProblemList();
}

function handleBoardClick(point) {
  if (appState.mode === "create") {
    handleCreatorBoardClick(point);
    return;
  }

  handleUserMove(point);
}

function handleUserMove(point) {
  const problem = getCurrentProblem();

  if (appState.isSolved) {
    setFeedback("이미 정답을 찾았습니다. 다음 문제로 넘어가 보세요.", "correct");
    return;
  }

  if (appState.isAiThinking) {
    setFeedback(
      appState.wrongResetTimeout || appState.wrongModalTimeout
        ? "오답 처리 중입니다. 잠시 후 다시 착수해 보세요."
        : "임시 AI 응수 후 다시 착수할 수 있습니다.",
      "wrong",
    );
    return;
  }

  if (boardController.hasStone(point)) {
    setFeedback("이미 돌이 있는 자리입니다. 다른 곳에 착수해 보세요.", "wrong");
    return;
  }

  const userMove = { ...point, color: STONE.black };
  boardController.addStone(userMove);
  removeCapturedStonesAfterMove(userMove);
  appState.playedMoves.push(userMove);

  if (isCorrectUserMove(point, problem)) {
    if (advanceCorrectSequence(problem)) {
      appState.playedMoves.push(userMove);
      return;
    }

    completeProblem(problem);
    return;
  }

  if (problem.category === "활로") {
    resetCurrentProblemAfterWrongMove(problem);
    return;
  }

  setStatus("AI가 반격 수를 분석합니다.");
  setFeedback("아쉬워요. AI가 오답을 응징할 반격 수를 찾고 있습니다.", "wrong");
  appState.isAiThinking = true;
  appState.pendingAiTimeout = window.setTimeout(
    () => playAiCounterMove(userMove, problem.id),
    450,
  );
}

async function playAiCounterMove(lastMove, problemId) {
  const problem = getCurrentProblem();

  appState.pendingAiTimeout = null;

  if (appState.isSolved || problem.id !== problemId) {
    appState.isAiThinking = false;
    return;
  }

  const aiMove = await getAiCounterMove({
    lastMove,
    stones: boardController.getStones(),
    boardSize: BOARD_SIZE,
    problem,
    playedMoves: appState.playedMoves,
    sgf: createProblemSgf(problem, appState.playedMoves),
  });

  if (appState.isSolved || getCurrentProblem().id !== problemId) {
    appState.isAiThinking = false;
    return;
  }

  if (!aiMove || boardController.hasStone(aiMove)) {
    appState.isAiThinking = false;
    setStatus("더 둘 수 있는 자리가 없습니다.");
    return;
  }

  boardController.addStone(aiMove);
  removeCapturedStonesAfterMove(aiMove);
  appState.playedMoves.push(aiMove);
  appState.isAiThinking = false;
  setFeedback(
    aiMove.source === "external-ai"
      ? "AI가 반격 수를 두었습니다. 다시 응수해 보세요."
      : "임시 AI가 반격 수를 두었습니다. 다시 응수해 보세요.",
  );
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
}

function showNextProblem() {
  if (appState.mode !== "solve") {
    return;
  }

  const filteredProblems = getFilteredProblems();
  if (filteredProblems.length === 0) {
    showEmptyProblemState();
    return;
  }

  const currentFilteredIndex = filteredProblems.findIndex(
    ({ index }) => index === appState.currentProblemIndex,
  );
  const nextFilteredProblem =
    filteredProblems[(currentFilteredIndex + 1) % filteredProblems.length];
  const nextIndex = nextFilteredProblem?.index ?? (appState.currentProblemIndex + 1) % problems.length;
  loadProblem(nextIndex);
}

function getCurrentProblem() {
  return problems[appState.currentProblemIndex];
}

function clearPendingAiMove() {
  if (appState.pendingAiTimeout) {
    window.clearTimeout(appState.pendingAiTimeout);
    appState.pendingAiTimeout = null;
  }
}

function showSolveMode() {
  if (problems.length === 0) {
    showEmptyProblemState();
    return;
  }

  setMode("solve");
  loadProblem(appState.currentProblemIndex);
}

function showListMode() {
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  setMode("list");

  elements.meta.textContent = "Problem Library";
  elements.title.textContent = "문제 목록";
  elements.description.textContent =
    "카테고리별로 문제를 살펴보고 학습할 문제를 선택하세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "학습할 문제를 선택하세요";
  elements.grade.textContent = `${getFilteredProblems().length}문제`;
  renderProblemList();
}

function showCreateMode() {
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  setMode("create");

  elements.meta.textContent = "Problem Builder";
  elements.title.textContent = "문제 제작 모드";
  elements.description.textContent =
    "돌을 배치하고 정답 위치를 지정한 뒤 JSON을 출력하세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "문제도를 직접 만들어 보세요";
  elements.grade.textContent = "제작";
  setStatus("흑돌 배치 도구가 선택되었습니다.");
  setFeedback("바둑판을 눌러 문제도를 만들어 보세요.");

  boardController.loadPosition(creatorState.stones);
  boardController.setAnswerMarker(creatorState.correctMove);
}

function setMode(mode) {
  appState.mode = mode;
  elements.listModeButton.classList.toggle("is-active", mode === "list");
  elements.solveModeButton.classList.toggle("is-active", mode === "solve");
  elements.createModeButton.classList.toggle("is-active", mode === "create");
  elements.creatorPanel.classList.toggle("is-hidden", mode !== "create");
  elements.nextButton.classList.toggle("is-hidden", mode !== "solve");
  elements.studyLayout.classList.toggle("is-hidden", mode === "list");
  elements.problemListScreen.classList.toggle("is-hidden", mode !== "list");
  updateAdminVisibility();
}

function renderCategoryFilters() {
  elements.categoryFilters.innerHTML = "";

  getCategoryFilters().forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    button.dataset.category = category;
    button.textContent = `${category} ${getCategoryCount(category)}`;
    button.classList.toggle("is-active", category === appState.selectedCategory);
    button.addEventListener("click", () => selectCategory(category));
    elements.categoryFilters.append(button);
  });
}

function getCategoryFilters() {
  return ["전체", ...CREATOR_CATEGORIES];
}

function renderCreatorCategoryOptions() {
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
    button.addEventListener("click", () => selectCreatorCategory(category));
    elements.createCategoryOptions.append(button);
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

function selectCategory(category) {
  appState.selectedCategory = category;
  renderCategoryFilters();
  renderProblemList();
  elements.grade.textContent = `${getFilteredProblems().length}문제`;
}

function renderProblemList() {
  const filteredProblems = getFilteredProblems();
  elements.problemCards.innerHTML = "";
  const categoryLabel = appState.selectedCategory || "전체";
  elements.listSummary.textContent = `${categoryLabel} 카테고리에서 ${filteredProblems.length}개 문제를 표시합니다.`;
  updatePrintSelectionControls();

  if (filteredProblems.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-list-message";
    emptyMessage.textContent = "이 카테고리에는 아직 문제가 없습니다.";
    elements.problemCards.append(emptyMessage);
    return;
  }

  filteredProblems.forEach(({ problem, index }) => {
    const card = document.createElement("article");
    card.className = "problem-card";
    card.dataset.problemId = problem.id;
    card.classList.toggle("is-selected", appState.selectedPrintProblemIds.has(problem.id));
    card.innerHTML = `
      <label class="problem-print-select">
        <input type="checkbox" data-print-select />
        <span>인쇄 선택</span>
      </label>
      <button class="problem-card-main" type="button">
        <span class="problem-card-meta">
          <span>문제 ${index + 1}</span>
          <span class="problem-category-badge">${problem.category}</span>
          <span>${problem.level ?? ""}</span>
        </span>
        <span class="problem-preview-board" data-preview-index="${index}" aria-hidden="true"></span>
        <h3>${escapeHtml(problem.title)}</h3>
        <p>${escapeHtml(problem.description)}</p>
        <span class="problem-card-footer">
          <span>돌 ${problem.stones.length}개</span>
          <span>풀기</span>
        </span>
      </button>
    `;
    const printSelect = card.querySelector("[data-print-select]");
    printSelect.checked = appState.selectedPrintProblemIds.has(problem.id);
    printSelect.addEventListener("click", (event) => event.stopPropagation());
    printSelect.addEventListener("change", () => {
      togglePrintProblemSelection(problem.id, printSelect.checked);
      card.classList.toggle("is-selected", printSelect.checked);
    });
    card.querySelector(".problem-card-main").addEventListener("click", () => selectProblemById(problem.id));

    if (adminState.isEnabled) {
      const actions = document.createElement("div");
      actions.className = "admin-card-actions";
      actions.innerHTML = `
        <button class="secondary-button" type="button" data-admin-action="edit">수정</button>
        <button class="danger-button" type="button" data-admin-action="delete">삭제</button>
      `;
      actions
        .querySelector('[data-admin-action="edit"]')
        .addEventListener("click", () => startEditingProblem(index));
      actions
        .querySelector('[data-admin-action="delete"]')
        .addEventListener("click", () => deleteProblem(index));
      card.append(actions);
    }

    elements.problemCards.append(card);
    renderProblemPreviewBoard(card.querySelector(".problem-preview-board"), problem);
  });

  updatePrintSelectionControls();
}

function selectProblemById(problemId) {
  const problemIndex = problems.findIndex((problem) => problem.id === problemId);
  if (problemIndex === -1) {
    return;
  }

  loadProblem(problemIndex);
}

function togglePrintProblemSelection(problemId, isSelected) {
  if (isSelected) {
    appState.selectedPrintProblemIds.add(problemId);
  } else {
    appState.selectedPrintProblemIds.delete(problemId);
  }

  updatePrintSelectionControls();
}

function updatePrintSelectionControls() {
  pruneMissingPrintSelections();
  const selectedCount = getSelectedPrintProblems().length;
  elements.printSelectionCount.textContent = `선택 ${selectedCount}개`;
  elements.printSelectedButton.disabled = selectedCount === 0;
}

function pruneMissingPrintSelections() {
  const existingIds = new Set(problems.map((problem) => problem.id));
  appState.selectedPrintProblemIds.forEach((problemId) => {
    if (!existingIds.has(problemId)) {
      appState.selectedPrintProblemIds.delete(problemId);
    }
  });
}

function getSelectedPrintProblems() {
  return problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => appState.selectedPrintProblemIds.has(problem.id));
}

function printSelectedProblems() {
  const selectedProblems = getSelectedPrintProblems();

  if (selectedProblems.length === 0) {
    setFeedback("인쇄할 문제를 먼저 선택해 주세요.", "wrong");
    return;
  }

  renderPrintProblems(selectedProblems, elements.printMonochrome.checked);
  setFeedback(`선택한 ${selectedProblems.length}개 문제를 인쇄합니다.`, "correct");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.print());
  });
}

function renderPrintProblems(selectedProblems, isMonochromePrint) {
  elements.printArea.innerHTML = "";
  elements.printArea.classList.toggle("is-monochrome", isMonochromePrint);

  chunkArray(selectedProblems, 8).forEach((pageProblems) => {
    const page = document.createElement("section");
    page.className = "print-page";
    page.innerHTML = `
      <div class="print-header">
        <p class="eyebrow">Baduk Learning</p>
        <h1>선택 문제 인쇄</h1>
      </div>
      <div class="print-problems"></div>
    `;

    const printProblems = page.querySelector(".print-problems");
    pageProblems.forEach(({ problem, index }) => {
      const article = document.createElement("article");
      article.className = "print-problem";
      article.innerHTML = `
        <div>
          <p class="problem-card-meta">
            <span>문제 ${index + 1}</span>
            <span class="problem-category-badge">${escapeHtml(problem.category)}</span>
            <span>${escapeHtml(problem.level ?? "")}</span>
          </p>
          <h2>${escapeHtml(problem.title)}</h2>
          <p>${escapeHtml(problem.description)}</p>
        </div>
        <div class="print-problem-board" aria-hidden="true"></div>
      `;
      printProblems.append(article);
      renderProblemPrintBoard(
        article.querySelector(".print-problem-board"),
        problem,
        isMonochromePrint,
      );
    });

    elements.printArea.append(page);
  });
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function renderProblemPrintBoard(element, problem, isMonochromePrint) {
  renderProblemPreviewBoard(element, problem);
  replaceBoardCanvasWithImage(
    element,
    isMonochromePrint ? "#ffffff" : "#f3d08a",
  );
}

function replaceBoardCanvasWithImage(element, backgroundColor) {
  const canvases = [...element.querySelectorAll("canvas")];
  const baseCanvas = canvases[0];
  if (!baseCanvas) {
    return;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = baseCanvas.width;
  exportCanvas.height = baseCanvas.height;

  const context = exportCanvas.getContext("2d");
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  canvases.forEach((canvas) => {
    context.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  });

  const image = document.createElement("img");
  image.src = exportCanvas.toDataURL("image/png");
  image.alt = "인쇄용 바둑판";
  image.decoding = "sync";

  element.replaceChildren(image);
}

function renderProblemPreviewBoard(element, problem) {
  if (!element || !window.WGo) {
    return;
  }

  const previewBoard = new WGo.Board(element, {
    size: BOARD_SIZE,
    width: element.clientWidth || 160,
    section: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  });

  problem.stones.forEach((stone) => {
    previewBoard.addObject({
      x: stone.x,
      y: stone.y,
      c: stone.color === STONE.black ? WGo.B : WGo.W,
    });

    const markType = getWgoMarkType(stone.mark);
    if (markType) {
      previewBoard.addObject({
        x: stone.x,
        y: stone.y,
        type: markType,
      });
    }
  });
}

function getWgoMarkType(mark) {
  const markTypes = {
    triangle: "TR",
    circle: "CR",
    square: "SQ",
    cross: "MA",
  };
  return markTypes[mark] ?? "";
}

function getFilteredProblems() {
  return problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => {
      return (
        !appState.selectedCategory ||
        appState.selectedCategory === "전체" ||
        problem.category === appState.selectedCategory
      );
    });
}

function getCategoryCount(category) {
  if (category === "전체") {
    return problems.length;
  }

  return problems.filter((problem) => problem.category === category).length;
}

function toggleAdminMode() {
  adminState.isEnabled = !adminState.isEnabled;
  elements.adminModeToggle.classList.toggle("is-active", adminState.isEnabled);
  elements.adminModeToggle.setAttribute("aria-pressed", String(adminState.isEnabled));

  if (!adminState.isEnabled) {
    closeAdminEditor();
  } else if (appState.mode !== "list") {
    showListMode();
  }

  updateAdminVisibility();
  renderProblemList();
}

function updateAdminVisibility() {
  const shouldShowAdminListActions = adminState.isEnabled && appState.mode === "list";
  elements.adminListActions.classList.toggle("is-hidden", !shouldShowAdminListActions);

  if (!adminState.draft) {
    elements.adminEditor.classList.add("is-hidden");
  }
}

function restoreAdminData() {
  const savedCategories = readStorageJson(STORAGE_KEYS.categories, []);
  savedCategories.forEach((category) => {
    if (category && !CREATOR_CATEGORIES.includes(category)) {
      CREATOR_CATEGORIES.push(category);
    }
  });

  const savedProblems = readStorageJson(STORAGE_KEYS.problems, null);
  if (Array.isArray(savedProblems)) {
    problems.splice(0, problems.length, ...savedProblems);
  }
}

function persistAdminData() {
  try {
    window.localStorage?.setItem(STORAGE_KEYS.problems, JSON.stringify(problems));
    window.localStorage?.setItem(STORAGE_KEYS.categories, JSON.stringify(CREATOR_CATEGORIES));
  } catch (error) {
    console.warn("Failed to persist admin data.", error);
  }
}

function readStorageJson(key, fallbackValue) {
  try {
    const storedValue = window.localStorage?.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallbackValue;
  } catch (error) {
    console.warn(`Failed to read ${key} from localStorage.`, error);
    return fallbackValue;
  }
}

function addAdminCategory() {
  const category = elements.adminNewCategory.value.trim();
  if (!category) {
    setFeedback("추가할 카테고리 이름을 입력해 주세요.", "wrong");
    return;
  }

  if (category === "전체" || CREATOR_CATEGORIES.includes(category)) {
    setFeedback("이미 존재하는 카테고리입니다.", "wrong");
    return;
  }

  CREATOR_CATEGORIES.push(category);
  persistAdminData();
  elements.adminNewCategory.value = "";
  renderCategoryFilters();
  renderCreatorCategoryOptions();
  renderProblemList();
  setFeedback(`${category} 카테고리를 추가했습니다.`, "correct");
}

function startAddingProblem() {
  adminState.editingIndex = null;
  adminState.draft = {
    id: createProblemId("새 문제", CREATOR_CATEGORIES[0] ?? "미분류"),
    title: "",
    description: "",
    level: "",
    category: CREATOR_CATEGORIES[0] ?? "미분류",
    stones: [],
    correctMove: { x: 0, y: 0 },
    correctSequence: [],
  };
  renderAdminEditor();
}

function startEditingProblem(index) {
  adminState.editingIndex = index;
  adminState.draft = cloneProblem(problems[index]);
  renderAdminEditor();
}

function deleteProblem(index) {
  const problem = problems[index];
  if (!problem || !window.confirm(`"${problem.title}" 문제를 삭제할까요?`)) {
    return;
  }

  problems.splice(index, 1);
  appState.selectedPrintProblemIds.delete(problem.id);
  persistAdminData();
  if (appState.currentProblemIndex >= problems.length) {
    appState.currentProblemIndex = Math.max(0, problems.length - 1);
  } else if (index < appState.currentProblemIndex) {
    appState.currentProblemIndex -= 1;
  }

  closeAdminEditor();
  renderCategoryFilters();
  renderProblemList();
  elements.grade.textContent = `${getFilteredProblems().length}문제`;
}

function renderAdminEditor() {
  const draft = adminState.draft;
  if (!draft) {
    closeAdminEditor();
    return;
  }

  elements.adminEditor.classList.remove("is-hidden");
  elements.adminEditor.innerHTML = `
    <h3>${adminState.editingIndex === null ? "새 문제 추가" : "문제 수정"}</h3>
    <div class="admin-form-grid">
      <label class="full-span">
        제목
        <input id="admin-title" type="text" value="${escapeHtml(draft.title)}" />
      </label>
      <label class="full-span">
        설명
        <textarea id="admin-description" rows="3">${escapeHtml(draft.description)}</textarea>
      </label>
      <label>
        category
        <select id="admin-category">${renderCategoryOptions(draft.category)}</select>
      </label>
    </div>
    <div class="admin-board-tools">
      <p class="panel-label">바둑판 편집 도구</p>
      <p class="admin-answer-status">
        현재 정답:
        <strong id="admin-answer-label">(${draft.correctMove.x}, ${draft.correctMove.y})</strong>
      </p>
      <p class="admin-answer-status">
        활로 정답 수순:
        <strong id="admin-sequence-label">${formatCorrectSequence(draft)}</strong>
      </p>
      <div class="tool-grid">
        <button class="admin-board-tool is-active" data-admin-tool="black" type="button">흑돌</button>
        <button class="admin-board-tool" data-admin-tool="white" type="button">백돌</button>
        <button class="admin-board-tool" data-admin-tool="answer" type="button">정답 수정</button>
        <button class="admin-board-tool" data-admin-tool="sequence" type="button">활로 정답 추가</button>
        <button class="admin-board-tool" data-admin-tool="clear-sequence" type="button">수순 초기화</button>
      </div>
      <div class="mark-grid">
        <button class="admin-board-tool" data-admin-tool="mark" data-admin-mark="triangle" type="button">세모</button>
        <button class="admin-board-tool" data-admin-tool="mark" data-admin-mark="circle" type="button">동그라미</button>
        <button class="admin-board-tool" data-admin-tool="mark" data-admin-mark="square" type="button">네모</button>
        <button class="admin-board-tool" data-admin-tool="mark" data-admin-mark="cross" type="button">X 표시</button>
        <button class="admin-board-tool" data-admin-tool="mark" data-admin-mark="none" type="button">표시 지우기</button>
      </div>
    </div>
    <div id="admin-board" class="admin-board" aria-label="관리자 문제 편집 바둑판"></div>
    <p class="admin-board-help">활로 문제는 활로 정답 추가로 여러 흑 수순을 순서대로 찍을 수 있습니다. 일반 문제는 정답 수정만 사용하면 됩니다.</p>
    <div class="admin-editor-actions">
      <button id="admin-cancel" class="secondary-button" type="button">취소</button>
      <button id="admin-save" class="primary-button" type="button">저장</button>
    </div>
  `;

  elements.adminEditor.querySelector("#admin-cancel").addEventListener("click", closeAdminEditor);
  elements.adminEditor.querySelector("#admin-save").addEventListener("click", saveAdminProblem);
  elements.adminEditor.querySelectorAll("[data-admin-tool]").forEach((button) => {
    button.addEventListener("click", () => setAdminBoardTool(button));
  });
  renderAdminBoard();
}

function renderCategoryOptions(selectedCategory) {
  const categories = CREATOR_CATEGORIES.length > 0 ? CREATOR_CATEGORIES : ["미분류"];
  return categories.map((category) => {
    return `<option value="${category}" ${category === selectedCategory ? "selected" : ""}>${category}</option>`;
  }).join("");
}

function formatCorrectSequence(problem) {
  if (problem.category !== "활로" || !Array.isArray(problem.correctSequence) || problem.correctSequence.length === 0) {
    return "없음";
  }

  return problem.correctSequence
    .map((move, index) => `${index + 1}.(${move.x}, ${move.y})`)
    .join(" → ");
}

function setAdminBoardTool(button) {
  adminState.activeTool = button.dataset.adminTool;
  adminState.activeMark = button.dataset.adminMark || adminState.activeMark;

  if (adminState.activeTool === "clear-sequence") {
    adminState.draft.correctSequence = [];
    renderAdminBoard();
    setFeedback("활로 정답 수순을 초기화했습니다.");
    return;
  }

  elements.adminEditor.querySelectorAll("[data-admin-tool]").forEach((toolButton) => {
    toolButton.classList.toggle("is-active", toolButton === button);
  });
}

function renderAdminBoard() {
  const boardElement = elements.adminEditor.querySelector("#admin-board");
  if (!boardElement || !adminState.draft) {
    return;
  }

  updateAdminAnswerLabel();
  boardElement.innerHTML = "";
  const adminBoard = new WGo.Board(boardElement, {
    size: BOARD_SIZE,
    width: boardElement.clientWidth || 360,
    section: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  });

  adminState.draft.stones.forEach((stone) => {
    adminBoard.addObject({
      x: stone.x,
      y: stone.y,
      c: stone.color === STONE.black ? WGo.B : WGo.W,
    });

    const markType = getWgoMarkType(stone.mark);
    if (markType) {
      adminBoard.addObject({ x: stone.x, y: stone.y, type: markType });
    }
  });

  adminBoard.addObject({
    x: adminState.draft.correctMove.x,
    y: adminState.draft.correctMove.y,
    type: "TR",
  });

  if (adminState.draft.category === "활로" && Array.isArray(adminState.draft.correctSequence)) {
    adminState.draft.correctSequence.forEach((move) => {
      adminBoard.addObject({ x: move.x, y: move.y, type: "CR" });
    });
  }

  adminBoard.addEventListener("click", handleAdminBoardClick);
}

function updateAdminAnswerLabel() {
  const answerLabel = elements.adminEditor.querySelector("#admin-answer-label");
  if (!answerLabel || !adminState.draft) {
    return;
  }

  answerLabel.textContent = `(${adminState.draft.correctMove.x}, ${adminState.draft.correctMove.y})`;
  const sequenceLabel = elements.adminEditor.querySelector("#admin-sequence-label");
  if (sequenceLabel) {
    sequenceLabel.textContent = formatCorrectSequence(adminState.draft);
  }
}

function handleAdminBoardClick(x, y) {
  const point = { x, y };
  if (!adminState.draft) {
    return;
  }

  if (adminState.activeTool === "answer") {
    if (adminState.draft.stones.some((stone) => isSamePoint(stone, point))) {
      setFeedback("정답 위치는 돌이 없는 곳에 지정해 주세요.", "wrong");
      return;
    }
    adminState.draft.correctMove = point;
    renderAdminBoard();
    setFeedback(`정답 좌표를 (${point.x}, ${point.y})로 수정했습니다.`, "correct");
    return;
  }

  if (adminState.activeTool === "mark") {
    updateAdminStoneMark(point);
    return;
  }

  if (adminState.activeTool === "sequence") {
    addAdminSequenceMove(point);
    return;
  }

  updateAdminStone(point, adminState.activeTool);
}

function addAdminSequenceMove(point) {
  if (adminState.draft.category !== "활로") {
    setFeedback("여러 정답 수순은 활로 카테고리에서만 사용할 수 있습니다.", "wrong");
    return;
  }

  if (adminState.draft.stones.some((stone) => isSamePoint(stone, point))) {
    setFeedback("정답 수순은 빈 곳에만 지정해 주세요.", "wrong");
    return;
  }

  adminState.draft.correctSequence = [
    ...(adminState.draft.correctSequence ?? []),
    point,
  ];
  adminState.draft.correctMove = adminState.draft.correctSequence[0];
  renderAdminBoard();
  setFeedback(`활로 정답 ${adminState.draft.correctSequence.length}수를 추가했습니다.`, "correct");
}

function updateAdminStone(point, color) {
  const existingStone = adminState.draft.stones.find((stone) => isSamePoint(stone, point));
  if (existingStone?.color === color) {
    adminState.draft.stones = adminState.draft.stones.filter((stone) => !isSamePoint(stone, point));
  } else {
    adminState.draft.stones = [
      ...adminState.draft.stones.filter((stone) => !isSamePoint(stone, point)),
      { ...point, color },
    ];
  }

  if (isSamePoint(adminState.draft.correctMove, point)) {
    adminState.draft.correctMove = { x: 0, y: 0 };
  }

  renderAdminBoard();
}

function updateAdminStoneMark(point) {
  const targetStone = adminState.draft.stones.find((stone) => isSamePoint(stone, point));
  if (!targetStone) {
    setFeedback("표시는 바둑알 위에만 추가할 수 있습니다.", "wrong");
    return;
  }

  adminState.draft.stones = adminState.draft.stones.map((stone) => {
    if (!isSamePoint(stone, point)) {
      return stone;
    }

    if (adminState.activeMark === "none") {
      const { mark, ...stoneWithoutMark } = stone;
      return stoneWithoutMark;
    }

    return { ...stone, mark: adminState.activeMark };
  });

  renderAdminBoard();
}

function saveAdminProblem() {
  syncAdminDraftFromForm();
  const validationError = validateAdminDraft(adminState.draft);
  if (validationError) {
    setFeedback(validationError, "wrong");
    return;
  }

  if (adminState.editingIndex === null) {
    problems.push(cloneProblem(adminState.draft));
  } else {
    problems[adminState.editingIndex] = cloneProblem(adminState.draft);
    if (appState.mode === "solve" && appState.currentProblemIndex === adminState.editingIndex) {
      loadProblem(adminState.editingIndex);
    }
  }

  persistAdminData();
  closeAdminEditor();
  renderCategoryFilters();
  renderProblemList();
  elements.grade.textContent = `${getFilteredProblems().length}문제`;
  setFeedback("관리자 변경사항을 문제 목록에 반영했습니다.", "correct");
}

function syncAdminDraftFromForm() {
  const editor = elements.adminEditor;
  if (!adminState.draft || editor.classList.contains("is-hidden")) {
    return;
  }

  adminState.draft.title = editor.querySelector("#admin-title").value.trim() || "새 문제";
  adminState.draft.description =
    editor.querySelector("#admin-description").value.trim() || "문제 설명을 입력하세요.";
  adminState.draft.category = editor.querySelector("#admin-category").value;
  if (adminState.draft.category !== "활로") {
    delete adminState.draft.correctSequence;
  } else if (!Array.isArray(adminState.draft.correctSequence)) {
    adminState.draft.correctSequence = adminState.draft.correctMove
      ? [{ ...adminState.draft.correctMove }]
      : [];
  }
}

function validateAdminDraft(problem) {
  const occupied = new Set();
  for (const stone of problem.stones) {
    const key = `${stone.x}:${stone.y}`;
    if (occupied.has(key)) {
      return `중복된 돌 좌표가 있습니다: ${key}`;
    }
    occupied.add(key);
  }

  if (occupied.has(`${problem.correctMove.x}:${problem.correctMove.y}`)) {
    return "정답 위치는 기존 돌과 겹칠 수 없습니다.";
  }

  return "";
}

function closeAdminEditor() {
  adminState.editingIndex = null;
  adminState.draft = null;
  elements.adminEditor.innerHTML = "";
  elements.adminEditor.classList.add("is-hidden");
}

function cloneProblem(problem) {
  const clonedProblem = {
    ...problem,
    correctMove: { ...problem.correctMove },
    stones: problem.stones.map((stone) => ({ ...stone })),
  };

  if (Array.isArray(problem.correctSequence)) {
    clonedProblem.correctSequence = problem.correctSequence.map((move) => ({ ...move }));
  }

  return clonedProblem;
}

function clampBoardCoordinate(value) {
  const numericValue = Number.parseInt(value, 10);
  if (Number.isNaN(numericValue)) {
    return 0;
  }
  return Math.min(BOARD_SIZE - 1, Math.max(0, numericValue));
}

function setCreatorTool(tool) {
  creatorState.activeTool = tool;
  elements.toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
  elements.markButtons.forEach((button) => {
    button.classList.remove("is-active");
  });

  const label = tool === "answer" ? "정답 위치" : getStoneLabel(tool);
  setStatus(`${label} 도구가 선택되었습니다.`);
}

function setCreatorMark(mark) {
  creatorState.activeTool = "mark";
  creatorState.activeMark = mark;
  elements.toolButtons.forEach((button) => {
    button.classList.remove("is-active");
  });
  elements.markButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mark === mark);
  });

  setStatus(`${getMarkLabel(mark)} 도구가 선택되었습니다.`);
  setFeedback("표시를 넣을 바둑알을 선택하세요.");
}

function handleCreatorBoardClick(point) {
  if (creatorState.activeTool === "answer") {
    setCreatorAnswer(point);
    return;
  }

  if (creatorState.activeTool === "mark") {
    setCreatorStoneMark(point);
    return;
  }

  placeCreatorStone(point, creatorState.activeTool);
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

    return {
      ...stone,
      mark: creatorState.activeMark,
    };
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
  elements.problemJson.value = "";
  renderCreatorBoard();
  setFeedback("제작 중인 문제를 초기화했습니다.");
}

function renderCreatorBoard() {
  boardController.setStones(creatorState.stones);
  boardController.setAnswerMarker(creatorState.correctMove);
}

function pushCreatorHistory() {
  creatorState.history.push({
    stones: creatorState.stones.map((stone) => ({ ...stone })),
    correctMove: creatorState.correctMove ? { ...creatorState.correctMove } : null,
  });
}

function generateProblemJson() {
  if (!creatorState.correctMove) {
    setFeedback("JSON 출력 전에 정답 위치를 지정해 주세요.", "wrong");
    return;
  }

  const title = elements.createTitle.value.trim() || "새 바둑 문제";
  const category = creatorState.selectedCategory || "미분류";
  const problem = {
    id: createProblemId(title, category),
    title,
    description: elements.createDescription.value.trim() || "문제 설명을 입력하세요.",
    level: elements.createLevel.value.trim() || "30급",
    category,
    stones: sortStones(creatorState.stones),
    correctMove: { ...creatorState.correctMove },
  };

  elements.problemJson.value = `${JSON.stringify(problem, null, 2)},`;
  setFeedback("problems.js 배열에 붙여넣을 수 있는 JSON을 생성했습니다.", "correct");
}

function isCorrectMove(move, answer) {
  return move.x === answer.x && move.y === answer.y;
}

function completeProblem(problem) {
  appState.isSolved = true;
  setStatus("정답입니다.");
  setFeedback("좋습니다! 핵심 급소를 정확히 찾았습니다.", "correct");
  logSgfForExtension(problem);

  const nextProblem = getNextProblemInCurrentCategory();
  showAnswerModal(
    nextProblem
      ? "정답입니다. 1초 후 다음 문제로 이동합니다."
      : "정답입니다. 이 카테고리의 마지막 문제입니다.",
    !nextProblem,
  );

  if (nextProblem) {
    appState.autoNextTimeout = window.setTimeout(() => {
      hideAnswerModal();
      loadProblem(nextProblem.index);
    }, 1000);
  }
}

function resetCurrentProblemAfterWrongMove(problem) {
  appState.isAiThinking = true;
  setStatus("오답입니다.");
  setFeedback("오답 착수를 확인한 뒤 문제가 초기 상태로 돌아갑니다.", "wrong");

  clearWrongTimers();
  appState.wrongResetTimeout = window.setTimeout(() => {
    appState.wrongResetTimeout = null;
    showWrongModal(() => restoreProblemInitialStateAfterWrong(problem));
  }, 150);
}

function restoreProblemInitialStateAfterWrong(problem) {
  appState.solvedAnswerKeys = new Set();
  appState.playedMoves = [];
  appState.isAiThinking = false;
  boardController.clearAnswerMarker();
  boardController.loadPosition(problem.stones);
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
  setFeedback("오답입니다. 문제를 초기 상태로 되돌렸습니다.", "wrong");
}

function getNextProblemInCurrentCategory() {
  const filteredProblems = getFilteredProblems();
  const currentIndex = filteredProblems.findIndex(
    ({ index }) => index === appState.currentProblemIndex,
  );

  if (currentIndex === -1 || currentIndex >= filteredProblems.length - 1) {
    return null;
  }

  return filteredProblems[currentIndex + 1];
}

function showAnswerModal(message, canDismiss = false) {
  elements.answerModalMessage.textContent = message;
  appState.canDismissAnswerModal = canDismiss;
  elements.answerModal.classList.remove("is-hidden");
}

function hideAnswerModal() {
  appState.canDismissAnswerModal = false;
  elements.answerModal.classList.add("is-hidden");
}

function showWrongModal(onHidden) {
  elements.wrongModal.classList.remove("is-hidden");
  appState.wrongModalTimeout = window.setTimeout(() => {
    appState.wrongModalTimeout = null;
    hideWrongModal();
    onHidden?.();
  }, 1000);
}

function hideWrongModal() {
  elements.wrongModal.classList.add("is-hidden");
}

function clearWrongTimers() {
  if (appState.wrongModalTimeout) {
    window.clearTimeout(appState.wrongModalTimeout);
    appState.wrongModalTimeout = null;
  }

  if (appState.wrongResetTimeout) {
    window.clearTimeout(appState.wrongResetTimeout);
    appState.wrongResetTimeout = null;
  }
}

function clearAutoNext() {
  if (appState.autoNextTimeout) {
    window.clearTimeout(appState.autoNextTimeout);
    appState.autoNextTimeout = null;
  }
}

function isCorrectUserMove(move, problem) {
  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 0) {
    return sequence.some((answer) => {
      return isCorrectMove(move, answer) && !appState.solvedAnswerKeys.has(pointKey(answer));
    });
  }

  return problem.correctMove ? isCorrectMove(move, problem.correctMove) : false;
}

function getProblemCorrectSequence(problem) {
  if (problem.category !== "활로" || !Array.isArray(problem.correctSequence)) {
    return [];
  }

  return problem.correctSequence;
}

function advanceCorrectSequence(problem) {
  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length <= 1) {
    return false;
  }

  const latestMove = appState.playedMoves[appState.playedMoves.length - 1];
  appState.solvedAnswerKeys.add(pointKey(latestMove));

  if (appState.solvedAnswerKeys.size >= sequence.length) {
    return false;
  }

  const remainingMoves = sequence.length - appState.solvedAnswerKeys.size;
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
  setFeedback(`좋아요. 활로 정답이 ${remainingMoves}수 남았습니다.`, "correct");
  return true;
}

function getProblemStartFeedback(problem) {
  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 1) {
    return `활로 문제입니다. 흑 정답 수순 ${sequence.length}수를 이어서 두세요.`;
  }

  return "첫 수를 선택해 보세요.";
}

function removeCapturedStonesAfterMove(move) {
  const stones = boardController.getStones();
  const opponentColor = move.color === STONE.black ? STONE.white : STONE.black;
  const capturedKeys = new Set();
  const checkedKeys = new Set();

  getNeighborPoints(move).forEach((neighbor) => {
    const neighborStone = getStoneAtPoint(stones, neighbor);
    if (!neighborStone || neighborStone.color !== opponentColor) {
      return;
    }

    const neighborKey = pointKey(neighbor);
    if (checkedKeys.has(neighborKey)) {
      return;
    }

    const group = collectConnectedGroup(stones, neighborStone);
    group.forEach((stone) => checkedKeys.add(pointKey(stone)));

    if (countGroupLiberties(stones, group) === 0) {
      group.forEach((stone) => capturedKeys.add(pointKey(stone)));
    }
  });

  if (capturedKeys.size === 0) {
    return 0;
  }

  boardController.setStones(stones.filter((stone) => !capturedKeys.has(pointKey(stone))));
  return capturedKeys.size;
}

function collectConnectedGroup(stones, startStone) {
  const group = [];
  const visited = new Set();
  const queue = [startStone];

  while (queue.length > 0) {
    const stone = queue.shift();
    const key = pointKey(stone);
    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    group.push(stone);

    getNeighborPoints(stone).forEach((neighbor) => {
      const neighborStone = getStoneAtPoint(stones, neighbor);
      if (
        neighborStone &&
        neighborStone.color === startStone.color &&
        !visited.has(pointKey(neighborStone))
      ) {
        queue.push(neighborStone);
      }
    });
  }

  return group;
}

function countGroupLiberties(stones, group) {
  const liberties = new Set();

  group.forEach((stone) => {
    getNeighborPoints(stone).forEach((neighbor) => {
      if (!getStoneAtPoint(stones, neighbor)) {
        liberties.add(pointKey(neighbor));
      }
    });
  });

  return liberties.size;
}

function getNeighborPoints(point) {
  return CAPTURE_DIRECTIONS.map(([dx, dy]) => ({
    x: point.x + dx,
    y: point.y + dy,
  })).filter(isOnBoard);
}

function getStoneAtPoint(stones, point) {
  return stones.find((stone) => isSamePoint(stone, point));
}

function isOnBoard(point) {
  return point.x >= 0 && point.y >= 0 && point.x < BOARD_SIZE && point.y < BOARD_SIZE;
}

function pointKey(point) {
  return `${point.x}:${point.y}`;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function setFeedback(message, tone = "neutral") {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle("is-correct", tone === "correct");
  elements.feedback.classList.toggle("is-wrong", tone === "wrong");
}

function isSamePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function sortStones(stones) {
  return [...stones].sort((a, b) => a.y - b.y || a.x - b.x);
}

function createProblemId(title, category) {
  const slug = `${category}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "custom-problem"}-${Date.now()}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStoneLabel(color) {
  return color === STONE.black ? "흑" : "백";
}

function getMarkLabel(mark) {
  const labels = {
    triangle: "세모",
    circle: "동그라미",
    square: "네모",
    cross: "X 표시",
    none: "표시 지우기",
  };
  return labels[mark] ?? "표시";
}

function logSgfForExtension(problem) {
  const sgf = createProblemSgf(problem, appState.playedMoves);
  console.info("SGF export preview:", sgf);
}
})();
