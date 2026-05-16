(function () {
const { getTemporaryAiResponse } = window.BadukAi;
const { BoardController } = window.BadukBoard;
const { BOARD_SIZE, problems, STONE } = window.BadukProblems;
const { createProblemSgf } = window.BadukSgf;

const CATEGORY_FILTERS = ["전체", "활로", "따내기", "축", "사활"];
const CREATOR_CATEGORIES = CATEGORY_FILTERS.filter((category) => category !== "전체");
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
  adminListActions: document.querySelector("#admin-list-actions"),
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
  selectedCategory: "전체",
  currentProblemIndex: 0,
  isSolved: false,
  isAiThinking: false,
  pendingAiTimeout: null,
  playedMoves: [],
};

const creatorState = {
  activeTool: STONE.black,
  activeMark: "triangle",
  selectedCategory: CREATOR_CATEGORIES[0],
  isCategoryOpen: false,
  stones: [],
  correctMove: null,
  history: [],
};

const adminState = {
  isEnabled: false,
  editingIndex: null,
  draft: null,
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
elements.addProblemButton.addEventListener("click", startAddingProblem);
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

renderCategoryFilters();
renderCreatorCategoryOptions();
renderProblemList();
loadProblem(0);

function loadProblem(index) {
  const problem = problems[index];

  clearPendingAiMove();
  setMode("solve");
  appState.currentProblemIndex = index;
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];

  elements.title.textContent = problem.title;
  elements.description.textContent = problem.description;
  elements.grade.textContent = problem.level;
  elements.meta.textContent = `문제 ${index + 1} / ${problems.length} · ${problem.category}`;
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
  setFeedback("첫 수를 선택해 보세요.");

  boardController.clearAnswerMarker();
  boardController.loadPosition(problem.stones);
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
    setFeedback("임시 AI 응수 후 다시 착수할 수 있습니다.", "wrong");
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

  if (isCorrectMove(point, problem.correctMove)) {
    appState.isSolved = true;
    setStatus("정답입니다.");
    setFeedback("좋습니다! 핵심 급소를 정확히 찾았습니다.", "correct");
    logSgfForExtension(problem);
    return;
  }

  setStatus("임시 AI가 응수합니다.");
  setFeedback("아쉬워요. 임시 AI가 한 수 응수합니다.", "wrong");
  appState.isAiThinking = true;
  appState.pendingAiTimeout = window.setTimeout(
    () => playTemporaryAiMove(userMove, problem.id),
    450,
  );
}

function playTemporaryAiMove(lastMove, problemId) {
  const problem = getCurrentProblem();

  appState.pendingAiTimeout = null;

  if (appState.isSolved || problem.id !== problemId) {
    appState.isAiThinking = false;
    return;
  }

  const aiMove = getTemporaryAiResponse({
    lastMove,
    stones: boardController.getStones(),
    boardSize: BOARD_SIZE,
  });

  if (!aiMove) {
    appState.isAiThinking = false;
    setStatus("더 둘 수 있는 자리가 없습니다.");
    return;
  }

  boardController.addStone(aiMove);
  removeCapturedStonesAfterMove(aiMove);
  appState.playedMoves.push(aiMove);
  appState.isAiThinking = false;
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
}

function showNextProblem() {
  if (appState.mode !== "solve") {
    return;
  }

  const filteredProblems = getFilteredProblems();
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

  CATEGORY_FILTERS.forEach((category) => {
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
  elements.listSummary.textContent = `${appState.selectedCategory} 카테고리에서 ${filteredProblems.length}개 문제를 표시합니다.`;

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
    card.innerHTML = `
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
}

function selectProblemById(problemId) {
  const problemIndex = problems.findIndex((problem) => problem.id === problemId);
  if (problemIndex === -1) {
    return;
  }

  loadProblem(problemIndex);
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
      return appState.selectedCategory === "전체" || problem.category === appState.selectedCategory;
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

function startAddingProblem() {
  adminState.editingIndex = null;
  adminState.draft = {
    id: createProblemId("새 문제", CREATOR_CATEGORIES[0]),
    title: "",
    description: "",
    level: "",
    category: CREATOR_CATEGORIES[0],
    stones: [],
    correctMove: { x: 0, y: 0 },
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
      <label>
        정답 x
        <input id="admin-correct-x" type="number" min="0" max="${BOARD_SIZE - 1}" value="${draft.correctMove.x}" />
      </label>
      <label>
        정답 y
        <input id="admin-correct-y" type="number" min="0" max="${BOARD_SIZE - 1}" value="${draft.correctMove.y}" />
      </label>
    </div>
    <div>
      <p class="panel-label">stones</p>
      <div id="admin-stones" class="stone-editor-list">
        ${draft.stones.map(renderStoneEditorRow).join("")}
      </div>
    </div>
    <div class="admin-editor-actions">
      <button id="admin-add-stone" class="secondary-button" type="button">돌 추가</button>
      <button id="admin-cancel" class="secondary-button" type="button">취소</button>
      <button id="admin-save" class="primary-button" type="button">저장</button>
    </div>
  `;

  elements.adminEditor.querySelector("#admin-add-stone").addEventListener("click", addAdminStone);
  elements.adminEditor.querySelector("#admin-cancel").addEventListener("click", closeAdminEditor);
  elements.adminEditor.querySelector("#admin-save").addEventListener("click", saveAdminProblem);
  elements.adminEditor.querySelectorAll("[data-remove-stone]").forEach((button) => {
    button.addEventListener("click", () => removeAdminStone(Number(button.dataset.removeStone)));
  });
}

function renderStoneEditorRow(stone, index) {
  return `
    <div class="stone-editor-row" data-stone-index="${index}">
      <label>
        x
        <input data-stone-field="x" type="number" min="0" max="${BOARD_SIZE - 1}" value="${stone.x}" />
      </label>
      <label>
        y
        <input data-stone-field="y" type="number" min="0" max="${BOARD_SIZE - 1}" value="${stone.y}" />
      </label>
      <label>
        color
        <select data-stone-field="color">
          <option value="${STONE.black}" ${stone.color === STONE.black ? "selected" : ""}>black</option>
          <option value="${STONE.white}" ${stone.color === STONE.white ? "selected" : ""}>white</option>
        </select>
      </label>
      <label>
        mark
        <select data-stone-field="mark">
          <option value="" ${stone.mark ? "" : "selected"}>없음</option>
          <option value="triangle" ${stone.mark === "triangle" ? "selected" : ""}>triangle</option>
          <option value="circle" ${stone.mark === "circle" ? "selected" : ""}>circle</option>
          <option value="square" ${stone.mark === "square" ? "selected" : ""}>square</option>
          <option value="cross" ${stone.mark === "cross" ? "selected" : ""}>cross</option>
        </select>
      </label>
      <button class="danger-button" type="button" data-remove-stone="${index}">삭제</button>
    </div>
  `;
}

function renderCategoryOptions(selectedCategory) {
  return CREATOR_CATEGORIES.map((category) => {
    return `<option value="${category}" ${category === selectedCategory ? "selected" : ""}>${category}</option>`;
  }).join("");
}

function addAdminStone() {
  syncAdminDraftFromForm();
  adminState.draft.stones.push({ x: 0, y: 0, color: STONE.black });
  renderAdminEditor();
}

function removeAdminStone(index) {
  syncAdminDraftFromForm();
  adminState.draft.stones.splice(index, 1);
  renderAdminEditor();
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
  adminState.draft.correctMove = {
    x: clampBoardCoordinate(editor.querySelector("#admin-correct-x").value),
    y: clampBoardCoordinate(editor.querySelector("#admin-correct-y").value),
  };
  adminState.draft.stones = [...editor.querySelectorAll(".stone-editor-row")].map((row) => {
    const mark = row.querySelector('[data-stone-field="mark"]').value;
    const stone = {
      x: clampBoardCoordinate(row.querySelector('[data-stone-field="x"]').value),
      y: clampBoardCoordinate(row.querySelector('[data-stone-field="y"]').value),
      color: row.querySelector('[data-stone-field="color"]').value,
    };
    if (mark) {
      stone.mark = mark;
    }
    return stone;
  });
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
  return {
    ...problem,
    correctMove: { ...problem.correctMove },
    stones: problem.stones.map((stone) => ({ ...stone })),
  };
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
  const category = creatorState.selectedCategory;
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
