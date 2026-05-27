import { isBoardProblem, isOxProblem, PROBLEM_TYPE } from "../game/problem-type.js";
import { PROBLEM_MODE } from "../game/problem-mode.js";
import {
  ANSWER_MOVE_COUNTS,
  normalizeAnswerMoveCount,
} from "../solve/ai-response-solve/constants.js";
import {
  formatCoordLabel,
  getNextSequenceColor,
  getSequenceColorLabel,
  normalizeFullAnswerSequence,
  resolveAnswerSequenceConfig,
  applyFullAnswerSequenceToDraft,
  renumberSequenceMoves,
  toFullAnswerSequencePayload,
  validateFullAnswerSequence,
} from "../solve/ai-response-solve/answer-sequence.js";
import {
  AI_RESPONSE_STYLES,
  AI_RESPONSE_STYLE_LABELS,
} from "../solve/ai-response-solve/tactical-response-styles.js";
import { LEVEL_GROUPS, normalizeLevelGroup } from "../services/level-group-service.js";
import {
  assignDisplayOrderForNewProblem,
  sortProblemsGlobally,
} from "../services/problem-order-service.js";
import {
  getGradeLevelSelectOptions,
  normalizeGradeLevelCode,
} from "../services/grade-level-service.js";

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
        <label>
          급수/단수 (선택)
          <select id="admin-grade-level">${renderGradeLevelOptions(draft.gradeLevel)}</select>
        </label>
        <label>
          문제 모드
          <select id="admin-problem-mode">${renderProblemModeOptions(draft.problemMode)}</select>
        </label>
        <label id="admin-answer-move-count-wrap">
          정답 수 (AI 응수형)
          <select id="admin-answer-move-count">${renderAnswerMoveCountOptions(draft.answerMoveCount)}</select>
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
          <div class="admin-ai-response-meta${isAiResponseDraft(draft) ? "" : " is-hidden"}">
            <label class="admin-ai-response-style-label">
              백 응수 전술 스타일
              <select id="admin-ai-response-style">${renderAiResponseStyleOptions(draft)}</select>
            </label>
            <p class="admin-field-hint">비우면 카테고리명으로만 보조 추론(단수치기→capture 등). 사활·맥 문제는 스타일을 직접 지정하세요.</p>
            <p class="panel-label">정답 수순 (${formatFullAnswerSequenceSummary(draft)})</p>
            <button
              type="button"
              id="admin-full-sequence-input-toggle"
              class="secondary-button admin-full-sequence-input-toggle"
            >
              정답 수순 입력
            </button>
            <p id="admin-full-sequence-input-hint" class="admin-field-hint"></p>
            <ul id="admin-full-sequence-list" class="admin-black-sequence-list"></ul>
            <button
              type="button"
              class="secondary-button admin-black-sequence-clear"
              data-admin-action="clear-full-sequence"
            >
              정답 수순 전체 초기화
            </button>
          </div>
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
      <p class="admin-board-help${isOx ? " is-hidden" : ""}">활로: 활로 정답 추가. AI 응수형: 「정답 수순 입력」 후 보드 클릭. 일반: 정답 수정.</p>
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
    elements.adminEditor.querySelector("#admin-problem-mode")?.addEventListener("change", () => {
      adminState.draft.problemMode =
        elements.adminEditor.querySelector("#admin-problem-mode")?.value || PROBLEM_MODE.normal;
      updateAdminTypeUi();
      updateAdminAnswerLabel();
    });
    elements.adminEditor.querySelector("#admin-ai-response-style")?.addEventListener("change", (event) => {
      const value = String(event.target.value ?? "").trim();
      if (!value) {
        delete adminState.draft.aiResponseStyle;
        delete adminState.draft.ai_response_style;
      } else {
        adminState.draft.aiResponseStyle = value;
        adminState.draft.ai_response_style = value;
      }
    });
    elements.adminEditor.querySelector("#admin-answer-move-count")?.addEventListener("change", () => {
      adminState.draft.answerMoveCount = Number(
        elements.adminEditor.querySelector("#admin-answer-move-count")?.value ?? 1,
      );
      trimFullSequenceToAnswerCount(adminState.draft);
      updateFullSequenceInputUi();
      updateAdminAnswerLabel();
      renderAdminBoard();
    });
    elements.adminEditor
      .querySelector("#admin-full-sequence-input-toggle")
      ?.addEventListener("click", toggleFullSequenceInputMode);
    elements.adminEditor.querySelector("[data-admin-action='clear-full-sequence']")?.addEventListener(
      "click",
      clearAdminFullSequence,
    );
    elements.adminEditor
      .querySelector("#admin-full-sequence-list")
      ?.addEventListener("click", handleFullSequenceListClick);
    elements.adminEditor.querySelectorAll("[data-admin-ox-answer]").forEach((button) => {
      button.addEventListener("click", () => {
        adminState.draft.oxAnswer = button.dataset.adminOxAnswer === "true";
        updateAdminOxAnswerChoice();
        updateAdminAnswerLabel();
      });
    });
    renderAdminBoard();
    updateFullSequenceInputUi();
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
    const isAiResponse = isAiResponseDraft(adminState.draft);
    elements.adminEditor.querySelector(".admin-board-answer-meta")?.classList.toggle("is-hidden", isOx);
    elements.adminEditor
      .querySelectorAll(".admin-board-tool--board-only")
      .forEach((button) => button.classList.toggle("is-hidden", isOx || isAiResponse));
    elements.adminEditor
      .querySelectorAll(".admin-board-tool--ai-response")
      .forEach((button) => button.classList.toggle("is-hidden", isOx || !isAiResponse));
    elements.adminEditor.querySelector("#admin-ox-answer-panel")?.classList.toggle("is-hidden", !isOx);
    elements.adminEditor.querySelector(".admin-board-help")?.classList.toggle("is-hidden", isOx);
    elements.adminEditor
      .querySelector("#admin-answer-move-count-wrap")
      ?.classList.toggle("is-hidden", !isAiResponse);
    elements.adminEditor
      .querySelector(".admin-ai-response-meta")
      ?.classList.toggle("is-hidden", !isAiResponse);
    if (isAiResponse) {
      renderAdminFullSequenceList();
      updateFullSequenceInputUi();
    }
  }

  function updateFullSequenceInputUi() {
    const toggle = elements.adminEditor.querySelector("#admin-full-sequence-input-toggle");
    const hint = elements.adminEditor.querySelector("#admin-full-sequence-input-hint");
    const board = elements.adminEditor.querySelector("#admin-board");
    if (!toggle || !adminState.draft || !isAiResponseDraft(adminState.draft)) {
      return;
    }

    const fullSequence = getAdminFullSequence(adminState.draft);
    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );
    const isComplete = fullSequence.length >= answerMoveCount;

    if (isComplete) {
      adminState.fullSequenceInputMode = false;
    }

    const inInput = adminState.fullSequenceInputMode && !isComplete;

    toggle.classList.toggle("is-active", inInput);
    toggle.textContent = inInput
      ? "입력 중… (닫기)"
      : isComplete
        ? "정답 수순 표시"
        : "정답 수순 입력";

    board?.classList.toggle("is-full-sequence-input", inInput);

    if (hint) {
      if (inInput) {
        const nextPly = fullSequence.length + 1;
        const nextColor = getSequenceColorLabel(getNextSequenceColor(fullSequence.length));
        hint.textContent = `${nextPly}수(${nextColor})를 보드에서 클릭하세요. (${fullSequence.length}/${answerMoveCount})`;
      } else if (isComplete) {
        hint.textContent = `${answerMoveCount}수 정답 수순 입력 완료. 수정하려면 목록에서 삭제하거나 전체 초기화하세요.`;
      } else {
        hint.textContent =
          "「정답 수순 입력」을 누른 뒤 보드에서 순서대로 찍으세요 (흑·백 교대).";
      }
    }
  }

  function toggleFullSequenceInputMode() {
    if (!adminState.draft || !isAiResponseDraft(adminState.draft)) {
      return;
    }

    const fullSequence = getAdminFullSequence(adminState.draft);
    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );

    if (fullSequence.length >= answerMoveCount) {
      adminState.fullSequenceInputMode = false;
      updateFullSequenceInputUi();
      renderAdminBoard();
      setFeedback(`${answerMoveCount}수 정답 수순 입력 완료`, "correct");
      return;
    }

    adminState.fullSequenceInputMode = !adminState.fullSequenceInputMode;
    updateFullSequenceInputUi();
    renderAdminBoard();

    if (adminState.fullSequenceInputMode) {
      setFeedback(
        `보드에서 ${answerMoveCount}착까지 순서대로 클릭하세요 (1수=흑).`,
        "correct",
      );
    } else {
      setFeedback("정답 수순 입력을 종료했습니다.");
    }
  }

  function isAiResponseDraft(draft) {
    return String(draft?.problemMode ?? "") === PROBLEM_MODE.aiResponse;
  }

  function renderAiResponseStyleOptions(draft) {
    const current = String(
      draft?.aiResponseStyle ?? draft?.ai_response_style ?? "",
    ).trim();
    const autoOption = `<option value=""${!current ? " selected" : ""}>자동 (카테고리 보조)</option>`;
    const styleOptions = AI_RESPONSE_STYLES.map(
      (style) =>
        `<option value="${style}"${style === current ? " selected" : ""}>${AI_RESPONSE_STYLE_LABELS[style] ?? style}</option>`,
    ).join("");
    return autoOption + styleOptions;
  }

  function renderProblemModeOptions(selectedMode) {
    const modes = [
      { value: PROBLEM_MODE.normal, label: "일반 1수" },
      { value: PROBLEM_MODE.aiResponse, label: "AI 응수형" },
    ];
    const current = selectedMode || PROBLEM_MODE.normal;
    return modes
      .map(
        (entry) =>
          `<option value="${entry.value}"${entry.value === current ? " selected" : ""}>${entry.label}</option>`,
      )
      .join("");
  }

  function renderAnswerMoveCountOptions(selected) {
    const current = Number(selected) || 1;
    return ANSWER_MOVE_COUNTS.map(
      (count) =>
        `<option value="${count}"${count === current ? " selected" : ""}>${count}수</option>`,
    ).join("");
  }

  function formatFullAnswerSequenceSummary(draft) {
    const answerMoveCount = normalizeAnswerMoveCount(
      draft?.answerMoveCount ?? draft?.answer_move_count ?? 1,
    );
    return `${getAdminFullSequence(draft).length} / ${answerMoveCount}착`;
  }

  function getAdminFullSequence(draft = adminState.draft) {
    return normalizeFullAnswerSequence(
      draft?.fullAnswerSequence ?? draft?.full_answer_sequence ?? [],
      BOARD_SIZE,
    );
  }

  function setAdminFullSequence(fullSequence) {
    if (!adminState.draft) {
      return;
    }
    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );
    const trimmed = fullSequence.slice(0, answerMoveCount);
    applyFullAnswerSequenceToDraft(adminState.draft, trimmed, BOARD_SIZE);
  }

  function trimFullSequenceToAnswerCount(draft) {
    const answerMoveCount = normalizeAnswerMoveCount(
      draft?.answerMoveCount ?? draft?.answer_move_count ?? 1,
    );
    const current = normalizeFullAnswerSequence(
      draft?.fullAnswerSequence ?? draft?.full_answer_sequence ?? [],
      BOARD_SIZE,
    );
    if (current.length > answerMoveCount) {
      applyFullAnswerSequenceToDraft(draft, current.slice(0, answerMoveCount), BOARD_SIZE);
    }
  }

  function refreshAdminSequenceUi() {
    const answerLabel = elements.adminEditor.querySelector("#admin-answer-label");
    if (answerLabel && adminState.draft) {
      answerLabel.textContent = formatBoardAnswerLabel(adminState.draft);
    }
    const sequenceLabel = elements.adminEditor.querySelector("#admin-sequence-label");
    if (sequenceLabel && adminState.draft) {
      sequenceLabel.textContent = formatCorrectSequence(adminState.draft);
    }
    renderAdminFullSequenceList();
    updateFullSequenceInputUi();
  }

  function renderAdminFullSequenceList() {
    const list =
      elements.adminEditor.querySelector("#admin-full-sequence-list") ??
      elements.adminEditor.querySelector("#admin-black-sequence-list");
    if (!list || !adminState.draft) {
      return;
    }

    const fullSequence = getAdminFullSequence(adminState.draft);
    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );

    if (fullSequence.length === 0) {
      list.innerHTML = `<li class="admin-black-sequence-empty">${answerMoveCount}착 정답 수순을 「정답 수순 입력」 후 보드에서 지정하세요.</li>`;
      return;
    }

    list.innerHTML = fullSequence
      .map((entry, index) => {
        const label = entry.label ?? formatCoordLabel(entry);
        const colorLabel = getSequenceColorLabel(entry.color);
        return `
          <li class="admin-black-sequence-item">
            <span>${entry.ply}수(${colorLabel}) <strong>${label}</strong></span>
            <button
              type="button"
              class="secondary-button admin-black-sequence-delete"
              data-admin-sequence-delete="${index}"
            >
              삭제
            </button>
          </li>`;
      })
      .join("");

    if (fullSequence.length !== answerMoveCount) {
      list.insertAdjacentHTML(
        "beforeend",
        `<li class="admin-black-sequence-warn">⚠ ${answerMoveCount}수 문제는 총 ${answerMoveCount}착이 필요합니다.</li>`,
      );
    }
  }

  function handleFullSequenceListClick(event) {
    const button = event.target.closest("[data-admin-sequence-delete]");
    if (!button || !adminState.draft) {
      return;
    }

    const index = Number(button.dataset.adminSequenceDelete);
    if (!Number.isInteger(index)) {
      return;
    }

    const next = renumberSequenceMoves(
      getAdminFullSequence().filter((_, itemIndex) => itemIndex !== index),
    );
    setAdminFullSequence(next);

    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );
    adminState.fullSequenceInputMode = next.length < answerMoveCount;

    renderAdminBoard();
    refreshAdminSequenceUi();
    setFeedback(
      next.length === 0
        ? "정답 수순을 모두 삭제했습니다."
        : `정답 수순 ${index + 1}착을 삭제했습니다. (${next.length}/${answerMoveCount})`,
      "correct",
    );
  }

  function clearAdminFullSequence() {
    if (!adminState.draft || !isAiResponseDraft(adminState.draft)) {
      return;
    }

    applyFullAnswerSequenceToDraft(adminState.draft, [], BOARD_SIZE);
    adminState.fullSequenceInputMode = false;

    const status = elements.adminEditor.querySelector("#admin-editor-status");
    if (status) {
      status.textContent = "정답 수순을 초기화했습니다.";
      status.classList.remove("is-correct", "is-wrong");
    }

    renderAdminBoard();
    refreshAdminSequenceUi();
    setFeedback("정답 수순을 초기화했습니다.", "correct");
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

  function renderGradeLevelOptions(selectedGradeLevel) {
    const normalized = normalizeGradeLevelCode(selectedGradeLevel) ?? "";
    return getGradeLevelSelectOptions({ includeUnassigned: true })
      .map((option) => {
        const isSelected = option.value === normalized;
        return `<option value="${option.value}" ${isSelected ? "selected" : ""}>${option.label}</option>`;
      })
      .join("");
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
      if (isAiResponseDraft(adminState.draft)) {
        clearAdminFullSequence();
      } else {
        adminState.draft.correctSequence = [];
        renderAdminBoard();
        setFeedback("활로 정답 수순을 초기화했습니다.");
      }
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

    const aiResponseDraft = isAiResponseDraft(adminState.draft);
    const previewSequence = aiResponseDraft ? getAdminFullSequence(adminState.draft) : [];

    if (
      isBoardProblem(adminState.draft) &&
      adminState.draft.correctMove &&
      !(aiResponseDraft && previewSequence.length > 0)
    ) {
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

    if (isBoardProblem(adminState.draft) && aiResponseDraft) {
      previewSequence.forEach((move) => {
        adminBoard.addObject({
          x: move.x,
          y: move.y,
          c: move.color === "white" ? WGo.W : WGo.B,
        });
        adminBoard.addObject({
          x: move.x,
          y: move.y,
          type: "LB",
          text: String(move.ply),
        });
      });
    }

    adminBoard.addEventListener("click", (x, y) => {
      handleAdminBoardClick(x, y, { button: "primary" });
    });
    adminBoard.addEventListener("contextmenu", (x, y, event) => {
      event?.preventDefault?.();
      handleAdminBoardClick(x, y, { button: "secondary" });
    });

    refreshAdminSequenceUi();
  }

  function updateAdminAnswerLabel() {
    refreshAdminSequenceUi();
  }

  function handleAdminBoardClick(x, y, { button = "primary" } = {}) {
    const point = { x, y };
    if (!adminState.draft) {
      return;
    }

    if (
      isAiResponseDraft(adminState.draft) &&
      adminState.fullSequenceInputMode &&
      button === "primary"
    ) {
      addAdminAnswerSequenceMove(point);
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

  function addAdminAnswerSequenceMove(point) {
    if (!isAiResponseDraft(adminState.draft)) {
      setFeedback("AI 응수형 문제에서만 정답 수순을 추가할 수 있습니다.", "wrong");
      return;
    }

    if (adminState.draft.stones.some((stone) => isSamePoint(stone, point))) {
      setFeedback("정답 수순은 빈 곳에만 지정해 주세요.", "wrong");
      return;
    }

    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );
    const current = getAdminFullSequence();

    if (current.some((entry) => entry.x === point.x && entry.y === point.y)) {
      setFeedback("이미 정답 수순에 포함된 자리입니다.", "wrong");
      return;
    }

    if (current.length >= answerMoveCount) {
      adminState.fullSequenceInputMode = false;
      updateFullSequenceInputUi();
      setFeedback(`${answerMoveCount}수 정답 수순 입력 완료`, "correct");
      return;
    }

    const color = getNextSequenceColor(current.length);
    const ply = current.length + 1;
    const next = [
      ...current,
      {
        color,
        x: point.x,
        y: point.y,
        label: formatCoordLabel(point),
        ply,
      },
    ];
    setAdminFullSequence(renumberSequenceMoves(next));
    renderAdminBoard();

    if (next.length >= answerMoveCount) {
      adminState.fullSequenceInputMode = false;
      updateFullSequenceInputUi();
      setFeedback(`${answerMoveCount}수 정답 수순 입력 완료`, "correct");
      return;
    }

    setFeedback(
      `${ply}수(${getSequenceColorLabel(color)}) ${formatCoordLabel(point)} (${next.length}/${answerMoveCount})`,
      "correct",
    );
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

    const gradeLevel = normalizeGradeLevelCode(editor.querySelector("#admin-grade-level")?.value);
    if (gradeLevel) {
      adminState.draft.gradeLevel = gradeLevel;
    } else {
      delete adminState.draft.gradeLevel;
    }

    if (isOxProblem(adminState.draft)) {
      adminState.draft.oxAnswer = Boolean(adminState.draft.oxAnswer);
      adminState.draft.correctMove = null;
      delete adminState.draft.correctSequence;
      return;
    }

    delete adminState.draft.oxAnswer;

    adminState.draft.problemMode =
      editor.querySelector("#admin-problem-mode")?.value || PROBLEM_MODE.normal;
    const answerMoveCount = Number(editor.querySelector("#admin-answer-move-count")?.value ?? 1);
    if ([1, 3, 5, 7].includes(answerMoveCount)) {
      adminState.draft.answerMoveCount = answerMoveCount;
    }

    if (isAiResponseDraft(adminState.draft)) {
      const styleRaw = String(
        editor.querySelector("#admin-ai-response-style")?.value ?? "",
      ).trim();
      if (styleRaw) {
        adminState.draft.aiResponseStyle = styleRaw;
        adminState.draft.ai_response_style = styleRaw;
      } else {
        delete adminState.draft.aiResponseStyle;
        delete adminState.draft.ai_response_style;
      }

      delete adminState.draft.correctSequence;
      applyFullAnswerSequenceToDraft(
        adminState.draft,
        getAdminFullSequence(),
        BOARD_SIZE,
      );
      return;
    }

    delete adminState.draft.blackAnswerSequence;
    delete adminState.draft.black_answer_sequence;
    delete adminState.draft.fullAnswerSequence;
    delete adminState.draft.full_answer_sequence;
    delete adminState.draft.answerMoveCount;

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

    if (isAiResponseDraft(problem)) {
      return validateFullAnswerSequence(problem, BOARD_SIZE, occupied) || "";
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
    adminState.fullSequenceInputMode = false;
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
