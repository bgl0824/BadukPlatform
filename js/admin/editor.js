import {
  isValidBoardPoint,
  sanitizeBoardPoint,
  sanitizeStone,
} from "../game/board-point-validation.js";
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
  simulateFullAnswerSequence,
  toFullAnswerSequencePayload,
  validateFullAnswerSequence,
} from "../solve/ai-response-solve/answer-sequence.js";
import {
  AI_RESPONSE_STYLES,
  AI_RESPONSE_STYLE_LABELS,
} from "../solve/ai-response-solve/tactical-response-styles.js";
import {
  formatAnswerMoveLabel,
  formatAnswerMovesSummary,
  normalizeProblemAnswerMoves,
  syncProblemAnswerFields,
  validateProblemAnswerMoves,
} from "../game/answer-moves.js";
import { syncTargetWhiteGroupOnProblem } from "../solve/ai-response-solve/target-white-group.js";
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

    normalizeProblemAnswerMoves(draft, BOARD_SIZE);

    if (isAiResponseDraft(draft)) {
      syncTargetWhiteGroupOnProblem(draft, BOARD_SIZE);
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
            최선정답:
            <strong id="admin-best-answer-label">${formatBestAnswerLabel(draft)}</strong>
          </p>
          <p class="admin-answer-status">
            허용정답:
            <strong id="admin-alternative-answer-label">${formatAlternativeAnswerLabel(draft)}</strong>
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
            <p class="admin-field-hint">오답 백 응수 타깃: 백돌에 △ 1개만 찍어도 <strong>연결된 백그룹 전체</strong>가 타깃입니다. 서로 떨어진 그룹은 △를 각각 찍으세요. 저장 시 <code>target_white_group</code>에 그룹 전체 좌표가 저장됩니다.</p>
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
          <button class="admin-board-tool admin-board-tool--board-only${isOx ? " is-hidden" : ""}" data-admin-tool="best-answer" type="button">최선정답</button>
          <button class="admin-board-tool admin-board-tool--board-only${isOx ? " is-hidden" : ""}" data-admin-tool="alternative-answer" type="button">허용정답</button>
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
      <p class="admin-board-help${isOx ? " is-hidden" : ""}">활로: 활로 정답 추가. AI 응수형: 「정답 수순 입력」 후 보드 클릭. 일반: 최선정답(△)·허용정답(□).</p>
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

  function ensureAdminAnswerMoveLists() {
    if (!adminState.draft) {
      return;
    }
    if (!Array.isArray(adminState.draft.bestMoves)) {
      adminState.draft.bestMoves = [];
    }
    if (!Array.isArray(adminState.draft.alternativeMoves)) {
      adminState.draft.alternativeMoves = [];
    }
    normalizeProblemAnswerMoves(adminState.draft, BOARD_SIZE);
  }

  function formatBestAnswerLabel(problem) {
    if (isOxProblem(problem)) {
      return problem.oxAnswer ? "O (둘 수 있음)" : "X (둘 수 없음)";
    }

    normalizeProblemAnswerMoves(problem, BOARD_SIZE);
    const summary = formatAnswerMovesSummary(problem.bestMoves, BOARD_SIZE);
    return summary || "미지정";
  }

  function formatAlternativeAnswerLabel(problem) {
    if (isOxProblem(problem)) {
      return "—";
    }

    normalizeProblemAnswerMoves(problem, BOARD_SIZE);
    const summary = formatAnswerMovesSummary(problem.alternativeMoves, BOARD_SIZE);
    return summary || "없음";
  }

  function formatBoardAnswerLabel(problem) {
    return `${formatBestAnswerLabel(problem)} / 허용: ${formatAlternativeAnswerLabel(problem)}`;
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

  function buildAdminAiSequenceBoardState(draft = adminState.draft) {
    const fullSequence = getAdminFullSequence(draft);
    return simulateFullAnswerSequence(draft?.stones ?? [], fullSequence, {
      boardSize: BOARD_SIZE,
      stoneColors: { black: STONE.black, white: STONE.white },
      enforceSimpleKo: false,
    });
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
    const bestLabel = elements.adminEditor.querySelector("#admin-best-answer-label");
    if (bestLabel && adminState.draft) {
      bestLabel.textContent = formatBestAnswerLabel(adminState.draft);
    }
    const alternativeLabel = elements.adminEditor.querySelector("#admin-alternative-answer-label");
    if (alternativeLabel && adminState.draft) {
      alternativeLabel.textContent = formatAlternativeAnswerLabel(adminState.draft);
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

  function safeAdminBoardAdd(adminBoard, object, context = "admin") {
    if (!isValidBoardPoint(object, BOARD_SIZE)) {
      console.warn("[AdminBoard] skip invalid WGo object", { object, context });
      return false;
    }

    try {
      adminBoard.addObject(object);
      return true;
    } catch (error) {
      console.warn("[AdminBoard] addObject failed", {
        object,
        context,
        message: error?.message,
      });
      return false;
    }
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

    const aiResponseDraft = isAiResponseDraft(adminState.draft);
    const previewSequence = aiResponseDraft ? getAdminFullSequence(adminState.draft) : [];
    const aiBoardState = aiResponseDraft
      ? buildAdminAiSequenceBoardState(adminState.draft)
      : null;
    const markByPointKey = new Map();
    adminState.draft.stones.forEach((stone) => {
      const sanitized = sanitizeStone(stone, BOARD_SIZE, "admin:stone");
      if (!sanitized) {
        return;
      }
      if (sanitized.mark) {
        markByPointKey.set(`${sanitized.x}:${sanitized.y}`, sanitized.mark);
      }
    });

    const stonesToRender = aiResponseDraft
      ? aiBoardState?.stones ?? []
      : adminState.draft.stones;

    stonesToRender.forEach((stone) => {
      const sanitized = sanitizeStone(stone, BOARD_SIZE, "admin:stone-render");
      if (!sanitized) {
        return;
      }
      safeAdminBoardAdd(adminBoard, {
        x: sanitized.x,
        y: sanitized.y,
        c: sanitized.color === STONE.black ? WGo.B : WGo.W,
      });

      const retainedMark = markByPointKey.get(`${sanitized.x}:${sanitized.y}`);
      const markType = getWgoMarkType(sanitized.mark ?? retainedMark);
      if (markType) {
        safeAdminBoardAdd(adminBoard, { x: sanitized.x, y: sanitized.y, type: markType });
      }
    });

    if (
      isBoardProblem(adminState.draft) &&
      !(aiResponseDraft && previewSequence.length > 0)
    ) {
      normalizeProblemAnswerMoves(adminState.draft, BOARD_SIZE);
      (adminState.draft.bestMoves ?? []).forEach((move) => {
        const point = sanitizeBoardPoint(move, BOARD_SIZE, "admin:bestMove");
        if (point) {
          safeAdminBoardAdd(adminBoard, { x: point.x, y: point.y, type: "TR" });
        }
      });
      (adminState.draft.alternativeMoves ?? []).forEach((move) => {
        const point = sanitizeBoardPoint(move, BOARD_SIZE, "admin:alternativeMove");
        if (point) {
          safeAdminBoardAdd(adminBoard, { x: point.x, y: point.y, type: "SQ" });
        }
      });
    }

    if (
      isBoardProblem(adminState.draft) &&
      adminState.draft.category === "활로" &&
      Array.isArray(adminState.draft.correctSequence)
    ) {
      adminState.draft.correctSequence.forEach((move) => {
        const point = sanitizeBoardPoint(move, BOARD_SIZE, "admin:correctSequence");
        if (point) {
          safeAdminBoardAdd(adminBoard, { x: point.x, y: point.y, type: "CR" });
        }
      });
    }

    if (isBoardProblem(adminState.draft) && aiResponseDraft) {
      const stoneAt = new Set((aiBoardState?.stones ?? []).map((s) => `${s.x}:${s.y}`));
      previewSequence.forEach((move) => {
        const point = sanitizeBoardPoint(move, BOARD_SIZE, "admin:sequenceMarker");
        if (!point) {
          return;
        }
        if (!stoneAt.has(`${point.x}:${point.y}`)) {
          return;
        }
        safeAdminBoardAdd(adminBoard, {
          x: point.x,
          y: point.y,
          type: "LB",
          text: String(move.ply ?? ""),
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

    if (adminState.activeTool === "best-answer" || adminState.activeTool === "alternative-answer") {
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

      ensureAdminAnswerMoveLists();
      const isBestTool = adminState.activeTool === "best-answer";
      const targetList = isBestTool ? adminState.draft.bestMoves : adminState.draft.alternativeMoves;
      const otherList = isBestTool ? adminState.draft.alternativeMoves : adminState.draft.bestMoves;
      const existingIndex = targetList.findIndex((move) => isSamePoint(move, point));

      if (existingIndex >= 0) {
        targetList.splice(existingIndex, 1);
        setFeedback(
          `${isBestTool ? "최선" : "허용"}정답 ${formatAnswerMoveLabel(point, BOARD_SIZE)} 을(를) 제거했습니다.`,
        );
      } else {
        const otherIndex = otherList.findIndex((move) => isSamePoint(move, point));
        if (otherIndex >= 0) {
          otherList.splice(otherIndex, 1);
        }
        targetList.push({ ...point });
        setFeedback(
          `${isBestTool ? "최선" : "허용"}정답 ${formatAnswerMoveLabel(point, BOARD_SIZE)} 을(를) 추가했습니다.`,
          "correct",
        );
      }

      syncProblemAnswerFields(adminState.draft, BOARD_SIZE);
      renderAdminBoard();
      updateAdminAnswerLabel();
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

    const answerMoveCount = normalizeAnswerMoveCount(
      adminState.draft.answerMoveCount ?? adminState.draft.answer_move_count ?? 1,
    );
    const current = getAdminFullSequence();
    const currentState = buildAdminAiSequenceBoardState(adminState.draft);
    if (currentState.error) {
      setFeedback(
        `현재 입력된 ${currentState.error.ply}수에서 수순이 불법입니다. 먼저 수정해 주세요.`,
        "wrong",
      );
      return;
    }

    if ((currentState.stones ?? []).some((stone) => isSamePoint(stone, point))) {
      setFeedback("현재 수순 기준으로 이미 돌이 있는 자리입니다.", "wrong");
      return;
    }

    if (current.some((entry) => entry.x === point.x && entry.y === point.y)) {
      const wasCaptured = !(currentState.stones ?? []).some((stone) => isSamePoint(stone, point));
      if (!wasCaptured) {
        setFeedback("이미 정답 수순에 포함된 자리입니다.", "wrong");
        return;
      }
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
    const nextRenumbered = renumberSequenceMoves(next);
    const nextState = simulateFullAnswerSequence(adminState.draft.stones ?? [], nextRenumbered, {
      boardSize: BOARD_SIZE,
      stoneColors: { black: STONE.black, white: STONE.white },
      enforceSimpleKo: false,
    });
    if (nextState.error) {
      const reason = nextState.error.reason;
      if (reason === "suicide") {
        setFeedback(`${ply}수는 자살수라 둘 수 없습니다.`, "wrong");
      } else if (reason === "occupied") {
        setFeedback(`${ply}수는 이미 돌이 있는 자리입니다.`, "wrong");
      } else {
        setFeedback(`${ply}수는 바둑 룰상 둘 수 없습니다.`, "wrong");
      }
      console.warn("[AdminSequence] illegal sequence move", {
        ply,
        point,
        reason,
      });
      return;
    }

    setAdminFullSequence(nextRenumbered);
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
      adminState.draft.correctMove = null;
    }
    ensureAdminAnswerMoveLists();
    adminState.draft.bestMoves = adminState.draft.bestMoves.filter(
      (move) => !isSamePoint(move, point),
    );
    adminState.draft.alternativeMoves = adminState.draft.alternativeMoves.filter(
      (move) => !isSamePoint(move, point),
    );
    syncProblemAnswerFields(adminState.draft, BOARD_SIZE);

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
      if (isAiResponseDraft(savedProblemDraft)) {
        const synced = syncTargetWhiteGroupOnProblem(savedProblemDraft, BOARD_SIZE);
        console.log("[Admin] target_white_group synced from △ marks (connected groups expanded)", {
          problemId: savedProblemDraft.id,
          policy: synced.policy,
          markedSeeds: synced.markedSeeds,
          stoneCount: synced.entries.length,
          targetWhiteGroupStones: synced.entries.map((entry) => formatCoordLabel(entry)).join(", "),
          expandedGroups: synced.expandedGroups,
        });
      }

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
      syncProblemAnswerFields(adminState.draft, BOARD_SIZE);
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
      adminState.draft.correctSequence = adminState.draft.bestMoves?.length
        ? adminState.draft.bestMoves.map((move) => ({ ...move }))
        : adminState.draft.correctMove
          ? [{ ...adminState.draft.correctMove }]
          : [];
    }

    syncProblemAnswerFields(adminState.draft, BOARD_SIZE);
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

    const answerError = validateProblemAnswerMoves(problem, occupied, BOARD_SIZE);
    if (answerError) {
      return answerError;
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
