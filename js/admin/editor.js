import { isBoardProblem, isOxProblem, PROBLEM_TYPE } from "../game/problem-type.js";
import { LEVEL_GROUPS, normalizeLevelGroup } from "../services/level-group-service.js";
import {
  assignDisplayOrderForNewProblem,
  sortProblemsGlobally,
} from "../services/problem-order-service.js";

export function createAdminEditorController({
  elements,
  adminState,
  appState,
  problems,
  ProblemStore,
  problemService,
  BOARD_SIZE,
  STONE,
  CREATOR_CATEGORIES,
  requireAdminMode,
  getCurrentUser,
  setFeedback,
  loadProblem,
  onProblemSaved,
  cloneProblem,
  isSamePoint,
  getWgoMarkType,
  escapeHtml,
  getProblemStoreErrorMessage,
}) {
  function renderAdminEditor() {
    if (!requireAdminMode()) {
      return;
    }

    const draft = adminState.draft;
    if (!draft) {
      closeAdminEditor();
      return;
    }

    const problemType = adminState.draft.type === PROBLEM_TYPE.ox ? PROBLEM_TYPE.ox : PROBLEM_TYPE.board;
    const isOx = problemType === PROBLEM_TYPE.ox;
    const oxAnswer = Boolean(adminState.draft.oxAnswer);

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
          levelGroup
          <select id="admin-level-group">${renderLevelGroupOptions(draft.levelGroup)}</select>
        </label>
        <label>
          category
          <select id="admin-category">${renderCategoryOptions(draft.category)}</select>
        </label>
        <label>
          type
          <select id="admin-type">
            <option value="board" ${problemType === PROBLEM_TYPE.board ? "selected" : ""}>board</option>
            <option value="ox" ${problemType === PROBLEM_TYPE.ox ? "selected" : ""}>ox</option>
          </select>
        </label>
      </div>
      <div class="admin-board-tools">
        <p class="panel-label">바둑판 배치</p>
        <p class="creator-placement-hint">좌클릭=흑 · 우클릭=백 · 같은 돌 다시 클릭=제거</p>
        <div class="admin-board-answer-meta${isOx ? " is-hidden" : ""}">
          <p class="admin-answer-status">
            현재 정답:
            <strong id="admin-answer-label">${formatBoardAnswerLabel(draft)}</strong>
          </p>
          <p class="admin-answer-status">
            활로 정답 수순:
            <strong id="admin-sequence-label">${formatCorrectSequence(draft)}</strong>
          </p>
        </div>
        <div class="tool-grid">
          <button class="admin-board-tool is-active" data-admin-tool="black" type="button">흑돌</button>
          <button class="admin-board-tool" data-admin-tool="white" type="button">백돌</button>
          <button class="admin-board-tool admin-board-tool--board-only${isOx ? " is-hidden" : ""}" data-admin-tool="answer" type="button">정답 수정</button>
          <button class="admin-board-tool admin-board-tool--board-only${isOx ? " is-hidden" : ""}" data-admin-tool="sequence" type="button">활로 정답 추가</button>
          <button class="admin-board-tool admin-board-tool--board-only${isOx ? " is-hidden" : ""}" data-admin-tool="clear-sequence" type="button">수순 초기화</button>
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
      <section id="admin-ox-answer-panel" class="admin-ox-answer-panel ox-choice-panel${isOx ? "" : " is-hidden"}">
        <p class="panel-label">정답 판정</p>
        <p class="ox-choice-hint">바둑판을 본 뒤 정답을 선택하세요.</p>
        <div class="ox-choice-actions" role="radiogroup" aria-label="O/X 정답">
          <button
            class="ox-choice-button${oxAnswer ? " is-selected" : ""}"
            type="button"
            data-admin-ox-answer="true"
            aria-pressed="${oxAnswer ? "true" : "false"}"
          >
            <span class="ox-choice-symbol">O</span>
            <span class="ox-choice-label">둘 수 있음</span>
          </button>
          <button
            class="ox-choice-button${!oxAnswer ? " is-selected" : ""}"
            type="button"
            data-admin-ox-answer="false"
            aria-pressed="${!oxAnswer ? "true" : "false"}"
          >
            <span class="ox-choice-symbol">X</span>
            <span class="ox-choice-label">둘 수 없음</span>
          </button>
        </div>
      </section>
      <p class="admin-board-help${isOx ? " is-hidden" : ""}">활로 문제는 활로 정답 추가로 여러 흑 수순을 순서대로 찍을 수 있습니다. 일반 문제는 정답 수정만 사용하면 됩니다.</p>
      <p id="admin-editor-status" class="admin-editor-status" aria-live="polite">문제 정보를 입력한 뒤 저장을 눌러 주세요.</p>
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
    elements.adminEditor.querySelector("#admin-type")?.addEventListener("change", (event) => {
      adminState.draft.type =
        event.target.value === PROBLEM_TYPE.ox ? PROBLEM_TYPE.ox : PROBLEM_TYPE.board;
      updateAdminTypeUi();
      renderAdminBoard();
    });
    elements.adminEditor.querySelectorAll("[data-admin-ox-answer]").forEach((button) => {
      button.addEventListener("click", () => {
        adminState.draft.oxAnswer = button.dataset.adminOxAnswer === "true";
        updateAdminOxAnswerChoice();
        updateAdminAnswerLabel();
      });
    });
    renderAdminBoard();
  }

  function updateAdminOxAnswerChoice() {
    if (!adminState.draft || elements.adminEditor.classList.contains("is-hidden")) {
      return;
    }

    elements.adminEditor.querySelectorAll("[data-admin-ox-answer]").forEach((button) => {
      const isSelected = button.dataset.adminOxAnswer === String(adminState.draft.oxAnswer);
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function formatBoardAnswerLabel(problem) {
    if (isOxProblem(problem)) {
      return problem.oxAnswer ? "O (둘 수 있음)" : "X (둘 수 없음)";
    }

    if (!problem.correctMove) {
      return "미지정";
    }

    return `(${problem.correctMove.x}, ${problem.correctMove.y})`;
  }

  function updateAdminTypeUi() {
    if (!adminState.draft || elements.adminEditor.classList.contains("is-hidden")) {
      return;
    }

    const isOx = isOxProblem(adminState.draft);
    elements.adminEditor.querySelector(".admin-board-answer-meta")?.classList.toggle("is-hidden", isOx);
    elements.adminEditor
      .querySelectorAll(".admin-board-tool--board-only")
      .forEach((button) => button.classList.toggle("is-hidden", isOx));
    elements.adminEditor.querySelector("#admin-ox-answer-panel")?.classList.toggle("is-hidden", !isOx);
    elements.adminEditor.querySelector(".admin-board-help")?.classList.toggle("is-hidden", isOx);
  }

  function renderLevelGroupOptions(selectedLevelGroup) {
    const normalizedSelection = normalizeLevelGroup(selectedLevelGroup);
    return LEVEL_GROUPS.map((levelGroup) => {
      return `<option value="${levelGroup}" ${levelGroup === normalizedSelection ? "selected" : ""}>${levelGroup}</option>`;
    }).join("");
  }

  function renderCategoryOptions(selectedCategory) {
    const categories = CREATOR_CATEGORIES.length > 0 ? CREATOR_CATEGORIES : ["미분류"];
    return categories.map((category) => {
      return `<option value="${category}" ${category === selectedCategory ? "selected" : ""}>${category}</option>`;
    }).join("");
  }

  function formatCorrectSequence(problem) {
    if (
      !isBoardProblem(problem) ||
      problem.category !== "활로" ||
      !Array.isArray(problem.correctSequence) ||
      problem.correctSequence.length === 0
    ) {
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

    if (isBoardProblem(adminState.draft) && adminState.draft.correctMove) {
      adminBoard.addObject({
        x: adminState.draft.correctMove.x,
        y: adminState.draft.correctMove.y,
        type: "TR",
      });
    }

    if (
      isBoardProblem(adminState.draft) &&
      adminState.draft.category === "활로" &&
      Array.isArray(adminState.draft.correctSequence)
    ) {
      adminState.draft.correctSequence.forEach((move) => {
        adminBoard.addObject({ x: move.x, y: move.y, type: "CR" });
      });
    }

    adminBoard.addEventListener("click", (x, y) => {
      handleAdminBoardClick(x, y, { button: "primary" });
    });
    adminBoard.addEventListener("contextmenu", (x, y, event) => {
      event?.preventDefault?.();
      handleAdminBoardClick(x, y, { button: "secondary" });
    });
  }

  function updateAdminAnswerLabel() {
    const answerLabel = elements.adminEditor.querySelector("#admin-answer-label");
    if (!answerLabel || !adminState.draft) {
      return;
    }

    answerLabel.textContent = formatBoardAnswerLabel(adminState.draft);
    const sequenceLabel = elements.adminEditor.querySelector("#admin-sequence-label");
    if (sequenceLabel) {
      sequenceLabel.textContent = formatCorrectSequence(adminState.draft);
    }
  }

  function handleAdminBoardClick(x, y, { button = "primary" } = {}) {
    const point = { x, y };
    if (!adminState.draft) {
      return;
    }

    if (adminState.activeTool === "answer") {
      if (button === "secondary") {
        return;
      }

      if (isOxProblem(adminState.draft)) {
        setFeedback("O/X 문제는 정답 위치 대신 O/X 선택을 사용합니다.", "wrong");
        return;
      }
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
      if (button === "secondary") {
        return;
      }

      updateAdminStoneMark(point);
      return;
    }

    if (adminState.activeTool === "sequence") {
      if (button === "secondary") {
        return;
      }

      addAdminSequenceMove(point);
      return;
    }

    const color = button === "secondary" ? STONE.white : STONE.black;
    updateAdminStone(point, color);
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

    if (adminState.draft.correctMove && isSamePoint(adminState.draft.correctMove, point)) {
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

  async function saveAdminProblem() {
    if (!requireAdminMode()) {
      return;
    }

    syncAdminDraftFromForm();
    const validationError = validateAdminDraft(adminState.draft);
    if (validationError) {
      setAdminEditorStatus(validationError, "wrong");
      setFeedback(validationError, "wrong");
      return;
    }

    const isNewProblem = adminState.editingIndex === null;
    const savedProblemDraft = isNewProblem
      ? assignDisplayOrderForNewProblem(cloneProblem(adminState.draft), problems)
      : cloneProblem(adminState.draft);

    if (isNewProblem) {
      console.log("[Admin] new problem display_order (client estimate before save)", {
        id: savedProblemDraft.id,
        category: savedProblemDraft.category,
        levelGroup: savedProblemDraft.levelGroup,
        displayOrder: savedProblemDraft.displayOrder,
      });
    }

    const saveButton = elements.adminEditor.querySelector("#admin-save");
    saveButton.disabled = true;
    setAdminEditorStatus("Supabase에 문제를 저장하는 중입니다...");

    try {
      const savedProblem = await problemService.saveProblem({
        user: getCurrentUser(),
        problem: savedProblemDraft,
        ProblemStore,
      });

      if (isNewProblem) {
        console.log("[Admin] new problem display_order (saved from Supabase)", {
          id: savedProblem.id,
          category: savedProblem.category,
          levelGroup: savedProblem.levelGroup,
          displayOrder: savedProblem.displayOrder,
        });
      }

      if (adminState.editingIndex === null) {
        problems.push(cloneProblem(savedProblem));
      } else {
        problems[adminState.editingIndex] = cloneProblem(savedProblem);
        if (appState.mode === "solve" && appState.currentProblemIndex === adminState.editingIndex) {
          loadProblem(adminState.editingIndex);
        }
      }

      const sortedProblems = sortProblemsGlobally(problems);
      problems.splice(0, problems.length, ...sortedProblems);
      if (isNewProblem) {
        const savedIndex = problems.findIndex((entry) => entry.id === savedProblem.id);
        appState.currentProblemIndex =
          savedIndex === -1 ? Math.max(0, problems.length - 1) : savedIndex;
      } else if (appState.mode === "solve") {
        const nextIndex = problems.findIndex((entry) => entry.id === savedProblem.id);
        if (nextIndex !== -1) {
          appState.currentProblemIndex = nextIndex;
        }
      }
    } catch (error) {
      console.error("Failed to save problem.", error);
      const errorMessage = getProblemStoreErrorMessage(error, "저장");
      setAdminEditorStatus(errorMessage, "wrong");
      setFeedback(errorMessage, "wrong");
      saveButton.disabled = false;
      return;
    }

    closeAdminEditor();
    onProblemSaved();
    setFeedback("Supabase에 문제를 저장했습니다.", "correct");
  }

  function setAdminEditorStatus(message, tone = "neutral") {
    const statusElement = elements.adminEditor.querySelector("#admin-editor-status");
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message;
    statusElement.classList.toggle("is-correct", tone === "correct");
    statusElement.classList.toggle("is-wrong", tone === "wrong");
  }

  function syncAdminDraftFromForm() {
    const editor = elements.adminEditor;
    if (!adminState.draft || editor.classList.contains("is-hidden")) {
      return;
    }

    adminState.draft.title = editor.querySelector("#admin-title").value.trim() || "새 문제";
    adminState.draft.description =
      editor.querySelector("#admin-description").value.trim() || "문제 설명을 입력하세요.";
    adminState.draft.levelGroup = normalizeLevelGroup(
      editor.querySelector("#admin-level-group")?.value,
    );
    adminState.draft.category = editor.querySelector("#admin-category").value;
    adminState.draft.type =
      editor.querySelector("#admin-type")?.value === PROBLEM_TYPE.ox
        ? PROBLEM_TYPE.ox
        : PROBLEM_TYPE.board;

    if (isOxProblem(adminState.draft)) {
      adminState.draft.oxAnswer = Boolean(adminState.draft.oxAnswer);
      adminState.draft.correctMove = null;
      delete adminState.draft.correctSequence;
      return;
    }

    delete adminState.draft.oxAnswer;
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

    if (isOxProblem(problem)) {
      if (typeof problem.oxAnswer !== "boolean") {
        return "O/X 정답을 선택해 주세요.";
      }
      return "";
    }

    if (!problem.correctMove) {
      return "정답 위치를 지정해 주세요.";
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

  return {
    renderAdminEditor,
    renderAdminBoard,
    handleAdminBoardClick,
    saveAdminProblem,
    closeAdminEditor,
  };
}
