import {
  createExamSetId,
  EXAM_SET_ROLE,
  EXAM_SET_STATUS,
  buildExamSetSaveSuccessMessage,
  formatExamSetRoleLabel,
  formatExamSetStatusLabel,
  formatExamSetTypeLabel,
  formatExamSetVisibilityLabel,
  getExamSetRoleOptions,
  getExamSetSaveButtonLabel,
  getExamSetSaveHint,
  getExamSetStatusOptions,
  getExamSetTypeOptions,
  getExamSetVisibilityOptions,
  normalizeExamSetStatus,
  normalizeExamSetType,
  normalizeExamSetVisibility,
  normalizeExamSetRole,
  resolveExamSetRoleByType,
} from "../services/exam-set-constants.js";
import { examSetService } from "../services/exam-set-service.js";
import {
  formatGradeLevelLabel,
  getGradeLevelFilterOptions,
  getGradeLevelSelectOptions,
  matchesGradeLevelFilter,
  normalizeGradeLevelCode,
} from "../services/grade-level-service.js";
import { PROBLEM_LIST_SORT, sortProblemsGlobally } from "../services/problem-order-service.js";

function createEmptyDraft({ user }) {
  return {
    id: "",
    title: "",
    description: "",
    gradeLevel: "30k",
    type: "past_exam",
    setRole: EXAM_SET_ROLE.questionBank,
    visibility: "private",
    status: "draft",
    academyId: "",
    sourceExamSetId: "",
    availableFrom: "",
    availableUntil: "",
    examDate: "",
    sortOrder: 0,
    createdBy: user?.id ?? "",
    orderedProblemIds: [],
    /** 인쇄/급수배정과 분리 — 카드·인라인 피커 공용 */
    selectedToAddIds: new Set(),
    pickerGradeFilter: "30k",
    pickerCategory: "전체",
  };
}

export function createExamSetManager({
  elements,
  adminState,
  appState,
  problems,
  getCurrentUser,
  requireAdminMode,
  setFeedback,
  escapeHtml,
  getOrderedCategoryNames,
  renderProblemList,
  onExamSetSaved,
}) {
  let eventsBound = false;
  let cardEventsBound = false;

  function ensureExamSetState() {
    if (!adminState.examSetManager) {
      adminState.examSetManager = {
        sets: [],
        selectedSetId: null,
        draft: null,
        loading: false,
      };
    }

    return adminState.examSetManager;
  }

  function isExamSetPickerMode() {
    return (
      adminState.isEnabled &&
      adminState.listPanel === "exam-sets" &&
      Boolean(ensureExamSetState().draft)
    );
  }

  function isProblemInExamSet(problemId) {
    const draft = ensureExamSetState().draft;
    return Boolean(draft?.orderedProblemIds?.includes(problemId));
  }

  function isProblemSelectedForExamSetAdd(problemId) {
    return ensureExamSetState().draft?.selectedToAddIds?.has(problemId) ?? false;
  }

  function toggleExamSetSelection(problemId, isSelected) {
    if (!problemId || isProblemInExamSet(problemId)) {
      return;
    }

    const draft = ensureExamSetState().draft;
    if (!draft) {
      return;
    }

    if (isSelected) {
      draft.selectedToAddIds.add(problemId);
    } else {
      draft.selectedToAddIds.delete(problemId);
    }
  }

  function bindExamSetCardEvents() {
    if (cardEventsBound) {
      return;
    }

    cardEventsBound = true;
    elements.problemCards?.addEventListener("change", handleProblemCardsChange);
  }

  function handleProblemCardsChange(event) {
    if (!isExamSetPickerMode()) {
      return;
    }

    const checkbox = event.target.closest("[data-exam-set-select]");
    if (!checkbox || checkbox.disabled) {
      return;
    }

    event.stopPropagation();
    toggleExamSetSelection(checkbox.dataset.examSetSelect, checkbox.checked);
    const card = checkbox.closest(".problem-card");
    if (card) {
      card.classList.toggle("is-exam-set-selected", checkbox.checked);
    }
  }

  function bindExamSetEvents() {
    if (eventsBound) {
      return;
    }

    eventsBound = true;

    elements.adminExamSetsPanel?.addEventListener("click", handlePanelClick);
    elements.adminExamSetsPanel?.addEventListener("change", handlePanelChange);
  }

  function handlePanelChange(event) {
    const target = event.target;
    const state = ensureExamSetState();
    const draft = state.draft;
    if (!draft) {
      return;
    }

    if (target.id === "admin-exam-set-title") {
      draft.title = target.value;
      return;
    }

    if (target.id === "admin-exam-set-description") {
      draft.description = target.value;
      return;
    }

    if (target.id === "admin-exam-set-grade") {
      const gradeLevel = normalizeGradeLevelCode(target.value) ?? null;
      draft.gradeLevel = gradeLevel;
      if (gradeLevel) {
        draft.pickerGradeFilter = gradeLevel;
      }
      renderPickerProblems();
      renderProblemList?.();
      return;
    }

    if (target.id === "admin-exam-set-type") {
      draft.type = normalizeExamSetType(target.value);
      draft.setRole = resolveExamSetRoleByType(draft.type);
      if (draft.setRole !== EXAM_SET_ROLE.promotionPaper) {
        draft.sourceExamSetId = "";
        draft.availableFrom = "";
        draft.availableUntil = "";
        draft.examDate = "";
      }
      renderExamSetEditor();
      return;
    }

    if (target.id === "admin-exam-set-role") {
      draft.setRole = normalizeExamSetRole(target.value);
      if (draft.setRole === EXAM_SET_ROLE.promotionPaper) {
        draft.type = "promotion_test";
      } else if (draft.type === "promotion_test") {
        draft.type = "past_exam";
      }
      if (draft.setRole !== EXAM_SET_ROLE.promotionPaper) {
        draft.sourceExamSetId = "";
        draft.availableFrom = "";
        draft.availableUntil = "";
        draft.examDate = "";
      }
      renderExamSetEditor();
      return;
    }

    if (target.id === "admin-exam-set-visibility") {
      draft.visibility = normalizeExamSetVisibility(target.value);
      renderExamSetEditor();
      return;
    }

    if (target.id === "admin-exam-set-status") {
      draft.status = normalizeExamSetStatus(target.value);
      updateExamSetSaveUi();
      return;
    }

    if (target.id === "admin-exam-set-academy-id") {
      draft.academyId = target.value.trim();
      return;
    }

    if (target.id === "admin-exam-set-source-id") {
      draft.sourceExamSetId = target.value.trim();
      return;
    }

    if (target.id === "admin-exam-set-available-from") {
      draft.availableFrom = target.value;
      return;
    }

    if (target.id === "admin-exam-set-available-until") {
      draft.availableUntil = target.value;
      return;
    }

    if (target.id === "admin-exam-set-date") {
      draft.examDate = target.value;
      return;
    }

    if (target.id === "admin-exam-picker-grade-filter") {
      draft.pickerGradeFilter = target.value;
      renderPickerProblems();
      renderProblemList?.();
      return;
    }

    if (target.id === "admin-exam-picker-category") {
      draft.pickerCategory = target.value;
      renderPickerProblems();
      renderProblemList?.();
    }
  }

  function handlePanelClick(event) {
    const button = event.target.closest("[data-exam-set-action]");
    if (!button) {
      return;
    }

    event.preventDefault();
    const action = button.dataset.examSetAction;

    if (action === "create") {
      startNewExamSet();
      return;
    }

    if (action === "select") {
      void selectExamSet(button.dataset.examSetId);
      return;
    }

    if (action === "save") {
      console.log("[ExamSetManager] save button clicked (panel)");
      void saveCurrentExamSet();
      return;
    }

    if (action === "delete") {
      void deleteCurrentExamSet();
      return;
    }

    if (action === "add-selected") {
      void addSelectedProblemsToSet();
      return;
    }

    if (action === "add-all-visible") {
      void addAllVisibleProblemsToSet();
      return;
    }

    if (action === "generate-random-20") {
      void generateRandomPromotionPaperQuestions();
      return;
    }

    if (action === "remove-question") {
      removeQuestionFromSet(button.dataset.problemId);
      return;
    }

    if (action === "move-up") {
      moveQuestionInSet(button.dataset.problemId, -1);
      return;
    }

    if (action === "move-down") {
      moveQuestionInSet(button.dataset.problemId, 1);
    }
  }

  function mergeSetIntoLocalList(state, savedSet, questionCount) {
    if (!savedSet?.id) {
      return;
    }

    const entry = {
      ...savedSet,
      questionCount: Number(questionCount) || 0,
    };
    const index = state.sets.findIndex((set) => set.id === entry.id);
    if (index === -1) {
      state.sets.push(entry);
    } else {
      state.sets[index] = entry;
    }

    state.sets.sort((left, right) => {
      const orderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (orderDiff !== 0) {
        return orderDiff;
      }

      return String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? ""));
    });
  }

  async function loadExamSets() {
    const state = ensureExamSetState();
    state.loading = true;
    renderExamSetList();

    console.log("[ExamSetManager] loadExamSets start");

    try {
      const result = await examSetService.listExamSetsForAdmin({
        user: getCurrentUser(),
      });

      console.log("[ExamSetManager] loadExamSets result", {
        ok: result.ok,
        count: result.sets?.length ?? 0,
      });

      if (!result.ok) {
        throw new Error(result.message ?? "exam_sets 목록 조회 실패");
      }

      state.sets = result.sets ?? [];
    } catch (error) {
      console.error("[ExamSetManager] load failed", error);
      const message = error?.message ?? "시험 세트 목록을 불러오지 못했습니다.";
      setFeedback(message, "wrong");
      window.alert?.(message);
      if (state.sets.length === 0 && state.draft?.id) {
        mergeSetIntoLocalList(state, buildExamSetPayloadFromDraft(state.draft), state.draft.orderedProblemIds.length);
      }
    } finally {
      state.loading = false;
      renderExamSetList();
      if (state.draft) {
        renderExamSetEditor();
      }
      if (state.selectedSetId && !state.draft) {
        void selectExamSet(state.selectedSetId);
      }
    }
  }

  function startNewExamSet() {
    if (!requireAdminMode()) {
      return;
    }

    const state = ensureExamSetState();
    state.selectedSetId = null;
    state.draft = createEmptyDraft({
      user: getCurrentUser(),
    });
    renderExamSetManager();
    renderProblemList?.();
  }

  async function selectExamSet(examSetId) {
    if (!requireAdminMode() || !examSetId) {
      return;
    }

    const state = ensureExamSetState();
    state.selectedSetId = examSetId;

    try {
      const detail = await examSetService.getExamSetDetail({
        user: getCurrentUser(),
        examSetId,
        forAdmin: true,
      });

      if (!detail.set) {
        setFeedback("시험 세트를 찾을 수 없습니다.", "wrong");
        return;
      }

      state.draft = {
        id: detail.set.id,
        title: detail.set.title,
        description: detail.set.description,
        gradeLevel: detail.set.gradeLevel,
        type: detail.set.type,
        setRole: resolveExamSetRoleByType(detail.set.type),
        visibility: detail.set.visibility,
        status: detail.set.status,
        academyId: detail.set.academyId ?? "",
        sourceExamSetId: detail.set.sourceExamSetId ?? "",
        availableFrom: detail.set.availableFrom ?? "",
        availableUntil: detail.set.availableUntil ?? "",
        examDate: detail.set.examDate ?? "",
        sortOrder: detail.set.sortOrder ?? 0,
        createdBy: detail.set.createdBy,
        orderedProblemIds: detail.questions.map((q) => q.problemId),
        selectedToAddIds: new Set(),
        pickerGradeFilter: detail.set.gradeLevel ?? "all",
        pickerCategory: "전체",
      };
    } catch (error) {
      console.error("[ExamSetManager] select failed", error);
      setFeedback("시험 세트를 불러오지 못했습니다.", "wrong");
      return;
    }

    renderExamSetManager();
  }

  function validateExamSetBeforeSave(draft) {
    const title = String(draft.title ?? "").trim();
    if (!title) {
      return { ok: false, message: "세트 제목을 입력해 주세요." };
    }

    if (draft.visibility === "academy" && !String(draft.academyId ?? "").trim()) {
      return { ok: false, message: "학원 공개 세트는 academy ID가 필요합니다." };
    }

    if (draft.setRole === EXAM_SET_ROLE.promotionPaper) {
      if (!String(draft.sourceExamSetId ?? "").trim()) {
        return { ok: false, message: "승급심사 시험지는 기반 기출세트를 선택해 주세요." };
      }
      if (!draft.availableFrom || !draft.availableUntil) {
        return { ok: false, message: "승급심사 시험지는 공개 시작/종료 일시가 필요합니다." };
      }
      if (new Date(draft.availableFrom).getTime() > new Date(draft.availableUntil).getTime()) {
        return { ok: false, message: "공개 시작일은 공개 종료일보다 늦을 수 없습니다." };
      }
      if ((draft.orderedProblemIds?.length ?? 0) !== 20) {
        return { ok: false, message: "승급심사 시험지는 정확히 20문제로 구성해 주세요." };
      }
    }

    const status = normalizeExamSetStatus(draft.status);
    if (status === EXAM_SET_STATUS.published) {
      const questionCount = draft.orderedProblemIds?.length ?? 0;
      if (questionCount === 0) {
        return { ok: false, message: "문제를 추가한 뒤 게시할 수 있습니다." };
      }

      if (!normalizeGradeLevelCode(draft.gradeLevel)) {
        return { ok: false, message: "게시하려면 대표 급수/단수를 선택해 주세요." };
      }
    }

    return { ok: true, title };
  }

  function updateExamSetSaveUi() {
    const draft = ensureExamSetState().draft;
    if (!draft || !elements.adminExamSetEditor) {
      return;
    }

    const saveButton = elements.adminExamSetEditor.querySelector('[data-exam-set-action="save"]');
    const hint = elements.adminExamSetEditor.querySelector(".admin-exam-set-save-hint");

    if (saveButton) {
      saveButton.textContent = getExamSetSaveButtonLabel(draft.status);
    }

    if (hint) {
      hint.textContent = getExamSetSaveHint(draft.status);
    }
  }

  async function saveCurrentExamSet() {
    if (!requireAdminMode()) {
      return;
    }

    const state = ensureExamSetState();
    const draft = state.draft;
    if (!draft) {
      setFeedback("저장할 시험 세트를 선택하거나 새로 만드세요.", "wrong");
      return;
    }

    const validation = validateExamSetBeforeSave(draft);
    if (!validation.ok) {
      setFeedback(validation.message, "wrong");
      return;
    }

    const title = validation.title;
    const questionCountBefore = draft.orderedProblemIds.length;
    const isPublishing = normalizeExamSetStatus(draft.status) === EXAM_SET_STATUS.published;

    console.log("[ExamSetManager] save clicked", {
      status: draft.status,
      visibility: draft.visibility,
      questionCount: questionCountBefore,
      examSetId: draft.id || "(new)",
    });

    const examSet = {
      id: draft.id || createExamSetId(),
      title,
      description: draft.description ?? "",
      gradeLevel: draft.gradeLevel,
      type: draft.type,
      setRole: draft.setRole,
      visibility: draft.visibility,
      status: draft.status,
      academyId: draft.academyId,
      sourceExamSetId: draft.sourceExamSetId,
      availableFrom: draft.availableFrom || null,
      availableUntil: draft.availableUntil || null,
      examDate: draft.examDate || null,
      sortOrder: draft.sortOrder,
      createdBy: draft.createdBy,
    };

    try {
      const saved = await examSetService.saveExamSet({
        user: getCurrentUser(),
        examSet,
        orderedProblemIds: draft.orderedProblemIds,
      });

      draft.id = saved.set.id;
      state.selectedSetId = saved.set.id;

      console.log("[ExamSetManager] saveExamSet success", {
        selectedExamSetId: state.selectedSetId,
        questionCount: saved.questionCount,
      });

      mergeSetIntoLocalList(state, saved.set, saved.questionCount ?? questionCountBefore);

      const successMessage = buildExamSetSaveSuccessMessage({
        title,
        status: draft.status,
        visibility: draft.visibility,
        questionCount: saved.questionCount ?? questionCountBefore,
      });

      setFeedback(successMessage, "correct");

      if (isPublishing) {
        console.log("[ExamSetManager] published — visible in exam catalog when public/academy rules match");
      }

      state.draft = draft;
      renderExamSetList();

      try {
        await loadExamSets();
      } catch (reloadError) {
        console.error("[ExamSetManager] reload after save failed", reloadError);
      }

      renderExamSetManager();
      await onExamSetSaved?.();
    } catch (error) {
      console.error("[ExamSetManager] save failed", error);
      const message = error?.message ?? "시험 세트 저장에 실패했습니다.";
      setFeedback(message, "wrong");
      window.alert?.(message);
    }
  }

  async function deleteCurrentExamSet() {
    if (!requireAdminMode()) {
      return;
    }

    const state = ensureExamSetState();
    const examSetId = state.draft?.id ?? state.selectedSetId;
    if (!examSetId) {
      return;
    }

    if (!window.confirm("이 시험 세트를 삭제할까요? 포함 문제 연결도 삭제됩니다.")) {
      return;
    }

    try {
      await examSetService.deleteExamSet({
        user: getCurrentUser(),
        examSetId,
      });
      state.selectedSetId = null;
      state.draft = null;
      setFeedback("시험 세트를 삭제했습니다.", "correct");
      await loadExamSets();
      renderExamSetManager();
    } catch (error) {
      console.error("[ExamSetManager] delete failed", error);
      setFeedback(error?.message ?? "삭제에 실패했습니다.", "wrong");
    }
  }

  function getSortedVisiblePickerProblems() {
    const visible = getPickerProblems();
    return sortProblemsGlobally(visible, { sortMode: PROBLEM_LIST_SORT.learning });
  }

  function getAppendableVisibleProblemIds() {
    const draft = ensureExamSetState().draft;
    if (!draft) {
      return { visibleCandidateProblemIds: [], appendableProblemIds: [] };
    }

    const inSet = new Set(draft.orderedProblemIds);
    const visibleCandidateProblemIds = getSortedVisiblePickerProblems().map((problem) => problem.id);
    const appendableProblemIds = visibleCandidateProblemIds.filter(
      (problemId) => !inSet.has(problemId),
    );

    return { visibleCandidateProblemIds, appendableProblemIds };
  }

  function buildExamSetPayloadFromDraft(draft) {
    return {
      id: draft.id,
      title: draft.title,
      description: draft.description,
      gradeLevel: draft.gradeLevel,
      type: draft.type,
      setRole: draft.setRole,
      visibility: draft.visibility,
      status: draft.status,
      academyId: draft.academyId,
      sourceExamSetId: draft.sourceExamSetId,
      availableFrom: draft.availableFrom || null,
      availableUntil: draft.availableUntil || null,
      examDate: draft.examDate || null,
      sortOrder: draft.sortOrder,
      createdBy: draft.createdBy,
    };
  }

  async function appendProblemsToSet(problemIds) {
    const draft = ensureExamSetState().draft;
    if (!draft) {
      setFeedback("시험 세트를 먼저 선택하거나 생성하세요.", "wrong");
      return { ok: false, addedCount: 0 };
    }

    const inSet = new Set(draft.orderedProblemIds);
    const appendableProblemIds = problemIds.filter((problemId) => !inSet.has(problemId));

    if (appendableProblemIds.length === 0) {
      return { ok: false, addedCount: 0 };
    }

    const startCount = draft.orderedProblemIds.length;
    appendableProblemIds.forEach((problemId, offset) => {
      draft.orderedProblemIds.push(problemId);
      console.log(
        "[ExamSetManager] append problemId",
        problemId,
        "order_index",
        startCount + offset + 1,
      );
    });

    draft.selectedToAddIds.clear();

    if (!draft.id) {
      console.log(
        "[ExamSetManager] insert skipped — save exam set title/metadata first, then add persists to exam_set_questions",
      );
      return { ok: true, addedCount: appendableProblemIds.length };
    }

    console.log("[ExamSetManager] insert exam_set_questions start");
    try {
      const saved = await examSetService.saveExamSet({
        user: getCurrentUser(),
        examSet: buildExamSetPayloadFromDraft(draft),
        orderedProblemIds: draft.orderedProblemIds,
      });
      console.log("[ExamSetManager] insert exam_set_questions success", {
        questionCount: saved.questionCount,
      });
      return { ok: true, addedCount: appendableProblemIds.length };
    } catch (error) {
      console.error("[ExamSetManager] insert exam_set_questions failed", error);
      appendableProblemIds.forEach((id) => {
        const index = draft.orderedProblemIds.lastIndexOf(id);
        if (index !== -1) {
          draft.orderedProblemIds.splice(index, 1);
        }
      });
      setFeedback(error?.message ?? "문제 추가 저장에 실패했습니다.", "wrong");
      window.alert?.(error?.message ?? "exam_set_questions 저장 실패 (RLS·세션 확인)");
      return { ok: false, addedCount: 0 };
    }
  }

  function refreshAfterExamSetQuestionsChanged() {
    updateExamSetQuestionsUi();
    renderPickerProblems();
    renderProblemList?.();
  }

  async function addSelectedProblemsToSet() {
    console.log("[ExamSetManager] add selected clicked");

    const draft = ensureExamSetState().draft;
    if (!draft) {
      setFeedback("시험 세트를 먼저 선택하거나 생성하세요.", "wrong");
      return;
    }

    const selectedProblemIds = [...draft.selectedToAddIds].filter(
      (problemId) => !draft.orderedProblemIds.includes(problemId),
    );

    console.log("[ExamSetManager] selectedProblemIds:", selectedProblemIds);
    console.log("[ExamSetManager] selectedExamSetId:", draft.id || "(not saved yet)");

    if (selectedProblemIds.length === 0) {
      setFeedback("세트에 추가할 문제를 카드에서 선택해 주세요.", "wrong");
      return;
    }

    const result = await appendProblemsToSet(selectedProblemIds);
    if (!result.ok) {
      if (result.addedCount === 0 && selectedProblemIds.length > 0) {
        refreshAfterExamSetQuestionsChanged();
      }
      return;
    }

    refreshAfterExamSetQuestionsChanged();
    setFeedback(`${result.addedCount}개 문제를 세트에 추가했습니다.`, "correct");
  }

  async function addAllVisibleProblemsToSet() {
    console.log("[ExamSetManager] add all visible clicked");

    const draft = ensureExamSetState().draft;
    if (!draft) {
      setFeedback("시험 세트를 먼저 선택하거나 생성하세요.", "wrong");
      return;
    }

    const { visibleCandidateProblemIds, appendableProblemIds } =
      getAppendableVisibleProblemIds();

    console.log("[ExamSetManager] visibleCandidateProblemIds:", visibleCandidateProblemIds);
    console.log("[ExamSetManager] appendableProblemIds:", appendableProblemIds);
    console.log("[ExamSetManager] selectedExamSetId:", draft.id || "(not saved yet)");

    if (appendableProblemIds.length === 0) {
      setFeedback("현재 필터에 추가할 새 문제가 없습니다.", "wrong");
      return;
    }

    const result = await appendProblemsToSet(appendableProblemIds);
    if (!result.ok) {
      refreshAfterExamSetQuestionsChanged();
      return;
    }

    refreshAfterExamSetQuestionsChanged();
    console.log("[ExamSetManager] add all success", { addedCount: result.addedCount });
    setFeedback(
      `표시 중인 문제 ${result.addedCount}개를 세트에 추가했습니다.`,
      "correct",
    );
  }

  function updateExamSetQuestionsUi() {
    const draft = ensureExamSetState().draft;
    if (!draft) {
      return;
    }

    const heading = elements.adminExamSetEditor?.querySelector(
      ".admin-exam-set-questions h4",
    );
    if (heading) {
      heading.textContent = `세트 문제 (${draft.orderedProblemIds.length}개)`;
    }

    renderExamSetQuestionsList();
  }

  function removeQuestionFromSet(problemId) {
    const draft = ensureExamSetState().draft;
    if (!draft || !problemId) {
      return;
    }

    draft.orderedProblemIds = draft.orderedProblemIds.filter((id) => id !== problemId);
    updateExamSetQuestionsUi();
    renderPickerProblems();
    renderProblemList?.();
  }

  function moveQuestionInSet(problemId, direction) {
    const draft = ensureExamSetState().draft;
    if (!draft) {
      return;
    }

    const ids = draft.orderedProblemIds;
    const index = ids.indexOf(problemId);
    if (index === -1) {
      return;
    }

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= ids.length) {
      return;
    }

    const copy = [...ids];
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    draft.orderedProblemIds = copy;
    updateExamSetQuestionsUi();
  }

  function matchesExamSetPickerFilters(problem) {
    const draft = ensureExamSetState().draft;
    if (!draft) {
      return false;
    }

    if (
      draft.pickerCategory &&
      draft.pickerCategory !== "전체" &&
      problem.category !== draft.pickerCategory
    ) {
      return false;
    }

    return matchesGradeLevelFilter(problem, draft.pickerGradeFilter);
  }

  function getExamSetPickerFilteredProblems() {
    if (!isExamSetPickerMode()) {
      return [];
    }

    return getSortedVisiblePickerProblems()
      .map((problem) => {
        const index = problems.findIndex((entry) => entry.id === problem.id);
        return { problem, index: index === -1 ? 0 : index };
      });
  }

  function getPickerProblems() {
    if (!ensureExamSetState().draft) {
      return [];
    }

    return problems.filter((problem) => matchesExamSetPickerFilters(problem));
  }

  function toDatetimeLocalValue(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function shuffleArray(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  async function generateRandomPromotionPaperQuestions() {
    const draft = ensureExamSetState().draft;
    if (!draft) {
      return;
    }
    if (draft.setRole !== EXAM_SET_ROLE.promotionPaper) {
      setFeedback("승급심사 시험지에서만 사용할 수 있습니다.", "wrong");
      window.alert?.("승급심사 시험지에서만 사용할 수 있습니다.");
      return;
    }
    if (!draft.sourceExamSetId) {
      setFeedback("기반 기출세트를 먼저 선택해 주세요.", "wrong");
      window.alert?.("기반 기출세트를 먼저 선택해 주세요.");
      return;
    }
    console.log("[ExamSetManager] generate random 20 clicked", {
      draftId: draft.id || "(new)",
      sourceExamSetId: draft.sourceExamSetId,
    });

    try {
      const detail = await examSetService.getExamSetDetail({
        user: getCurrentUser(),
        examSetId: draft.sourceExamSetId,
        forAdmin: true,
      });
      const sourceProblemIds = detail.questions.map((row) => row.problemId).filter(Boolean);
      if (sourceProblemIds.length < 20) {
        setFeedback("기반 기출세트 문제 수가 20개 미만이라 생성할 수 없습니다.", "wrong");
        window.alert?.("기반 기출세트 문제 수가 20개 미만이라 생성할 수 없습니다.");
        return;
      }

      draft.orderedProblemIds = shuffleArray(sourceProblemIds).slice(0, 20);
      draft.selectedToAddIds.clear();
      refreshAfterExamSetQuestionsChanged();
      setFeedback("기반 기출세트에서 랜덤 20문제를 구성했습니다.", "correct");
      console.log("[ExamSetManager] generate random 20 success", {
        sourceCount: sourceProblemIds.length,
        generatedCount: draft.orderedProblemIds.length,
      });
    } catch (error) {
      console.error("[ExamSetManager] generate random 20 failed", error);
      setFeedback(error?.message ?? "랜덤 20문제 생성에 실패했습니다.", "wrong");
      window.alert?.(error?.message ?? "랜덤 20문제 생성에 실패했습니다.");
    }
  }

  function renderExamSetManager() {
    bindExamSetEvents();
    bindExamSetCardEvents();
    renderExamSetList();
    renderExamSetEditor();
    renderProblemList?.();
  }

  function renderExamSetList() {
    if (!elements.adminExamSetList) {
      return;
    }

    const state = ensureExamSetState();

    if (state.loading) {
      elements.adminExamSetList.innerHTML = `<p class="admin-exam-set-empty">불러오는 중…</p>`;
      return;
    }

    if (state.sets.length === 0) {
      elements.adminExamSetList.innerHTML = `<p class="admin-exam-set-empty">등록된 시험 세트가 없습니다.</p>`;
      return;
    }

    elements.adminExamSetList.innerHTML = state.sets
      .map((set) => {
        const isActive = set.id === state.selectedSetId;
        const gradeLabel = set.gradeLevel
          ? formatGradeLevelLabel(set.gradeLevel)
          : "급수 미지정";
        const status = normalizeExamSetStatus(set.status);
        const statusClass =
          status === EXAM_SET_STATUS.published
            ? "admin-exam-set-badge is-published"
            : "admin-exam-set-badge is-draft";
        return `
          <button
            type="button"
            class="admin-exam-set-list-item${isActive ? " is-active" : ""}"
            data-exam-set-action="select"
            data-exam-set-id="${escapeHtml(set.id)}"
          >
            <span class="admin-exam-set-list-title">${escapeHtml(set.title)}</span>
            <span class="admin-exam-set-badges">
              <span class="${statusClass}">${escapeHtml(formatExamSetStatusLabel(set.status))}</span>
              <span class="admin-exam-set-badge is-role">${escapeHtml(formatExamSetRoleLabel(set.setRole))}</span>
              <span class="admin-exam-set-badge is-visibility">${escapeHtml(formatExamSetVisibilityLabel(set.visibility))}</span>
            </span>
            <span class="admin-exam-set-list-meta">${escapeHtml(gradeLabel)} · ${escapeHtml(formatExamSetTypeLabel(set.type))} · ${set.questionCount ?? 0}문제</span>
          </button>`;
      })
      .join("");
  }

  function renderExamSetEditor() {
    if (!elements.adminExamSetEditor) {
      return;
    }

    const draft = ensureExamSetState().draft;
    if (!draft) {
      elements.adminExamSetEditor.innerHTML = `
        <p class="admin-exam-set-empty">왼쪽에서 세트를 선택하거나 「새 시험 세트」를 눌러 주세요.</p>`;
      return;
    }

    const categories = ["전체", ...getOrderedCategoryNames()];
    const isPromotionPaper = draft.setRole === EXAM_SET_ROLE.promotionPaper;
    const sourceCandidates = ensureExamSetState().sets.filter((set) => {
      return set.id !== draft.id && set.setRole === EXAM_SET_ROLE.questionBank;
    });
    console.log("[ExamSetManager] source question_bank sets", {
      totalSets: ensureExamSetState().sets.length,
      questionBankCount: sourceCandidates.length,
      titles: sourceCandidates.map((set) => set.title),
    });

    elements.adminExamSetEditor.innerHTML = `
      <div class="admin-exam-set-form">
        <label>제목 <input id="admin-exam-set-title" type="text" value="${escapeHtml(draft.title)}" placeholder="예: 30급 기출문제" /></label>
        <label>설명 <textarea id="admin-exam-set-description" rows="2">${escapeHtml(draft.description)}</textarea></label>
        <div class="admin-exam-set-form-row">
          <label>대표 급수
            <select id="admin-exam-set-grade">${getGradeLevelSelectOptions({ includeUnassigned: true })
              .map(
                (o) =>
                  `<option value="${escapeHtml(o.value)}"${draft.gradeLevel === o.value || (!draft.gradeLevel && !o.value) ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
              )
              .join("")}</select>
          </label>
          <label>유형 <select id="admin-exam-set-type">${getExamSetTypeOptions()
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}"${draft.type === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
            )
            .join("")}</select></label>
          <label>세트 역할 <select id="admin-exam-set-role">${getExamSetRoleOptions()
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}"${draft.setRole === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
            )
            .join("")}</select></label>
        </div>
        ${
          isPromotionPaper
            ? `
        <div class="admin-exam-set-form-row">
          <label>기반 기출세트
            <select id="admin-exam-set-source-id">
              <option value="">기출세트를 선택하세요</option>
              ${sourceCandidates
                .map(
                  (set) =>
                    `<option value="${escapeHtml(set.id)}"${draft.sourceExamSetId === set.id ? " selected" : ""}>${escapeHtml(set.title)}</option>`,
                )
                .join("")}
            </select>
          </label>
          <label>시험일
            <input id="admin-exam-set-date" type="date" value="${escapeHtml(draft.examDate ?? "")}" />
          </label>
        </div>
        <div class="admin-exam-set-form-row">
          <label>공개 시작
            <input id="admin-exam-set-available-from" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(draft.availableFrom))}" />
          </label>
          <label>공개 종료
            <input id="admin-exam-set-available-until" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(draft.availableUntil))}" />
          </label>
        </div>`
            : ""
        }
        <div class="admin-exam-set-form-row">
          <label>공개 <select id="admin-exam-set-visibility">${getExamSetVisibilityOptions()
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}"${draft.visibility === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
            )
            .join("")}</select></label>
          <label>상태 <select id="admin-exam-set-status">${getExamSetStatusOptions()
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}"${draft.status === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
            )
            .join("")}</select></label>
        </div>
        <label class="admin-exam-set-academy-field${draft.visibility === "academy" ? "" : " is-hidden"}">학원 ID
          <input id="admin-exam-set-academy-id" type="text" value="${escapeHtml(draft.academyId)}" placeholder="academy UUID" />
        </label>
        <p class="admin-exam-set-save-hint">${escapeHtml(getExamSetSaveHint(draft.status))}</p>
        <div class="admin-exam-set-form-actions">
          <button type="button" class="primary-button" data-exam-set-action="save">${escapeHtml(getExamSetSaveButtonLabel(draft.status))}</button>
          <button type="button" class="secondary-button" data-exam-set-action="delete"${draft.id ? "" : " disabled"}>삭제</button>
          <button type="button" class="secondary-button" data-exam-set-action="generate-random-20"${isPromotionPaper ? "" : " disabled"}>기출 기반 랜덤 20</button>
        </div>
      </div>
      <section class="admin-exam-set-questions" aria-label="세트 문제">
        <h4>세트 문제 (${draft.orderedProblemIds.length}개)</h4>
        <ol id="admin-exam-set-questions-list" class="admin-exam-set-questions-list"></ol>
      </section>
      <section class="admin-exam-set-picker" aria-label="문제 추가">
        <h4>문제 선택</h4>
        <div class="admin-exam-set-picker-filters">
          <label>급수 필터 <select id="admin-exam-picker-grade-filter">${getGradeLevelFilterOptions()
            .map(
              (o) =>
                `<option value="${escapeHtml(o.value)}"${draft.pickerGradeFilter === o.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
            )
            .join("")}</select></label>
          <label>카테고리 <select id="admin-exam-picker-category">${categories
            .map(
              (name) =>
                `<option value="${escapeHtml(name)}"${draft.pickerCategory === name ? " selected" : ""}>${escapeHtml(name)}</option>`,
            )
            .join("")}</select></label>
          <button type="button" class="secondary-button" data-exam-set-action="add-selected">선택 추가</button>
          <button type="button" class="secondary-button" data-exam-set-action="add-all-visible">전체 추가</button>
        </div>
        <div id="admin-exam-picker-list" class="admin-exam-picker-list"></div>
      </section>`;

    bindPickerCheckboxes();
    renderExamSetQuestionsList();
    renderPickerProblems();
    updateExamSetSaveUi();
  }

  function bindPickerCheckboxes() {
    elements.adminExamPickerList?.querySelectorAll("[data-exam-picker-id]").forEach((input) => {
      input.addEventListener("change", () => {
        const draft = ensureExamSetState().draft;
        if (!draft) {
          return;
        }

        const problemId = input.dataset.examPickerId;
        if (isProblemInExamSet(problemId)) {
          return;
        }

        if (input.checked) {
          draft.selectedToAddIds.add(problemId);
        } else {
          draft.selectedToAddIds.delete(problemId);
        }
      });
    });
  }

  function renderExamSetQuestionsList() {
    const list = elements.adminExamSetQuestionsList;
    const draft = ensureExamSetState().draft;
    if (!list || !draft) {
      return;
    }

    if (draft.orderedProblemIds.length === 0) {
      list.innerHTML = `<li class="admin-exam-set-empty">아직 포함된 문제가 없습니다.</li>`;
      return;
    }

    list.innerHTML = draft.orderedProblemIds
      .map((problemId, index) => {
        const problem = problems.find((p) => p.id === problemId);
        const title = problem?.title ?? problemId;
        const category = problem?.category ?? "";
        const grade = formatGradeLevelLabel(problem?.gradeLevel);
        return `
          <li class="admin-exam-set-question-item">
            <span class="admin-exam-set-question-order">${index + 1}</span>
            <span class="admin-exam-set-question-title">${escapeHtml(title)}</span>
            <span class="admin-exam-set-question-meta">${escapeHtml(category)} · ${escapeHtml(grade)}</span>
            <div class="admin-exam-set-question-actions">
              <button type="button" class="ghost-button" data-exam-set-action="move-up" data-problem-id="${escapeHtml(problemId)}" aria-label="위로">↑</button>
              <button type="button" class="ghost-button" data-exam-set-action="move-down" data-problem-id="${escapeHtml(problemId)}" aria-label="아래로">↓</button>
              <button type="button" class="ghost-button" data-exam-set-action="remove-question" data-problem-id="${escapeHtml(problemId)}">제거</button>
            </div>
          </li>`;
      })
      .join("");
  }

  function renderPickerProblems() {
    const container = elements.adminExamPickerList;
    const draft = ensureExamSetState().draft;
    if (!container || !draft) {
      return;
    }

    const pickerProblems = getPickerProblems().filter(
      (p) => !draft.orderedProblemIds.includes(p.id),
    );

    if (pickerProblems.length === 0) {
      container.innerHTML = `<p class="admin-exam-set-empty">추가할 문제가 없습니다. 필터를 조정해 보세요.</p>`;
      return;
    }

    container.innerHTML = pickerProblems
      .slice(0, 80)
      .map((problem) => {
        const checked = draft.selectedToAddIds.has(problem.id);
        return `
          <label class="admin-exam-picker-item">
            <input type="checkbox" data-exam-picker-id="${escapeHtml(problem.id)}"${checked ? " checked" : ""} />
            <span>${escapeHtml(problem.title ?? problem.id)}</span>
            <span class="admin-exam-picker-meta">${escapeHtml(problem.category ?? "")} · ${escapeHtml(formatGradeLevelLabel(problem.gradeLevel))}</span>
          </label>`;
      })
      .join("");

    bindPickerCheckboxes();
  }

  return {
    bindExamSetEvents,
    bindExamSetCardEvents,
    renderExamSetManager,
    loadExamSets,
    isExamSetPickerMode,
    isProblemSelectedForExamSetAdd,
    isProblemInExamSet,
    getExamSetPickerFilteredProblems,
  };
}
