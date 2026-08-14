import { getProblemsInCategoryOrder } from "../services/learning-flow-service.js";
import { getCategoryProblemNumberForProblem } from "../services/category-problem-number.js";
import { formatGradeLevelLabel, normalizeGradeLevelCode } from "../services/grade-level-service.js";

export function createGradeAssignmentManager({
  elements,
  adminState,
  appState,
  problems,
  problemService,
  ProblemStore,
  getActiveLevelGroup,
  getCurrentUser,
  isCurrentUserAdmin,
  requireAdminMode,
  setFeedback,
  escapeHtml,
  getFilteredProblems,
  renderProblemList,
  getProblemStoreErrorMessage,
}) {
  let eventsBound = false;
  let bulkApplying = false;

  function isGradeAssignmentMode() {
    return adminState.isEnabled && isCurrentUserAdmin() && adminState.listPanel === "grades";
  }

  function getGradeAssignmentState() {
    if (!adminState.gradeAssignment) {
      adminState.gradeAssignment = {
        selectedProblemIds: new Set(),
        showUnassignedOnly: false,
        rangeFrom: 1,
        rangeTo: 1,
      };
    }

    return adminState.gradeAssignment;
  }

  function isProblemSelectedForGrade(problemId) {
    return getGradeAssignmentState().selectedProblemIds.has(problemId);
  }

  function getCategoryEntriesInLearningOrder() {
    const category = String(appState.selectedCategory ?? "").trim();
    if (!category || category === "전체") {
      return [];
    }

    return getProblemsInCategoryOrder(category, problems, {
      levelGroup: getActiveLevelGroup(),
    });
  }

  function getVisibleCardEntries() {
    if (!isGradeAssignmentMode()) {
      return [];
    }

    return getFilteredProblems();
  }

  function applyGradeToMemory(problemId, gradeLevel) {
    const problem = problems.find((entry) => entry.id === problemId);
    if (!problem) {
      return;
    }

    if (gradeLevel) {
      problem.gradeLevel = gradeLevel;
    } else {
      delete problem.gradeLevel;
    }
  }

  function updateProblemCardGradeUi(card, problem) {
    const select = card.querySelector("[data-inline-grade-problem-id]");
    if (select && !select.disabled) {
      select.value = normalizeGradeLevelCode(problem.gradeLevel) ?? "";
    }
  }

  function patchGradeCards(problemIds) {
    if (!isGradeAssignmentMode() || !elements.problemCards) {
      return;
    }

    problemIds.forEach((problemId) => {
      const problem = problems.find((entry) => entry.id === problemId);
      const card = elements.problemCards.querySelector(
        `[data-problem-id="${CSS.escape(problemId)}"]`,
      );
      if (!problem || !card) {
        return;
      }

      if (!matchesGradeAssignmentListFilter(problem)) {
        card.remove();
        getGradeAssignmentState().selectedProblemIds.delete(problemId);
        return;
      }

      updateProblemCardGradeUi(card, problem);
      syncGradeCardSelectionState(card, isProblemSelectedForGrade(problemId));
    });

    updateGradeSummaryText();
    updateGradeListSummary();
  }

  function updateGradeListSummary() {
    if (!isGradeAssignmentMode() || !elements.listSummary) {
      return;
    }

    const category = String(appState.selectedCategory ?? "").trim();
    const levelGroup = getActiveLevelGroup();
    const categoryLabel =
      category && category !== "전체" ? `${levelGroup} · ${category}` : `${levelGroup} 전체`;
    const visibleCount = getVisibleCardEntries().length;
    const selectedCount = getGradeAssignmentState().selectedProblemIds.size;

    elements.listSummary.textContent =
      !category || category === "전체"
        ? "급수 배정: 상단에서 카테고리를 선택하세요."
        : `${categoryLabel} · 급수 배정 선택 ${selectedCount}개 / 표시 ${visibleCount}개`;
  }

  function setBulkApplying(isApplying) {
    bulkApplying = isApplying;
    const applyButton = elements.adminGradeApplyButton;
    if (applyButton) {
      applyButton.disabled = isApplying;
      applyButton.textContent = isApplying ? "적용 중..." : "선택 문제 급수 적용";
    }
    if (elements.adminGradeTargetSelect) {
      elements.adminGradeTargetSelect.disabled = isApplying;
    }
    if (elements.adminGradeClearButton) {
      elements.adminGradeClearButton.disabled = isApplying;
    }
  }

  function bindGradeAssignmentEvents() {
    if (eventsBound) {
      return;
    }

    eventsBound = true;

    elements.adminGradesPanel?.addEventListener("click", handleGradesPanelClick);
    elements.adminGradesPanel?.addEventListener("change", handleGradesPanelChange);
    elements.problemCards?.addEventListener("change", handleProblemCardsChange);
  }

  function handleGradesPanelChange(event) {
    if (event.target.id === "admin-grade-unassigned-only") {
      getGradeAssignmentState().showUnassignedOnly = event.target.checked;
      renderGradeAssignmentPanel();
      renderProblemList();
    }
  }

  function handleGradesPanelClick(event) {
    if (event.target.closest("[data-grade-select-problem-id]")) {
      return;
    }

    const actionButton = event.target.closest(
      "#admin-grade-select-all, #admin-grade-clear-selection, #admin-grade-select-range, #admin-grade-apply, #admin-grade-clear",
    );

    if (!actionButton) {
      return;
    }

    event.preventDefault();

    if (actionButton.id === "admin-grade-select-all") {
      selectAllVisible();
      return;
    }

    if (actionButton.id === "admin-grade-clear-selection") {
      clearSelection();
      return;
    }

    if (actionButton.id === "admin-grade-select-range") {
      selectRange();
      return;
    }

    if (actionButton.id === "admin-grade-apply") {
      void applyGradeToSelection();
      return;
    }

    if (actionButton.id === "admin-grade-clear") {
      void clearGradeFromSelection();
    }
  }

  function handleProblemCardsChange(event) {
    if (!isGradeAssignmentMode()) {
      return;
    }

    const checkbox = event.target.closest("[data-grade-assign-select]");
    if (!checkbox) {
      return;
    }

    event.stopPropagation();
    toggleProblemSelection(checkbox.dataset.gradeAssignSelect, checkbox.checked);
    syncGradeCardSelectionState(checkbox.closest(".problem-card"), checkbox.checked);
    updateGradeSummaryText();
    updateGradeListSummary();
  }

  function toggleProblemSelection(problemId, isSelected) {
    if (!problemId) {
      return;
    }

    const state = getGradeAssignmentState();
    if (isSelected) {
      state.selectedProblemIds.add(problemId);
    } else {
      state.selectedProblemIds.delete(problemId);
    }
  }

  function syncGradeCardSelectionState(card, isSelected) {
    if (!card) {
      return;
    }

    card.classList.toggle("is-grade-assign-selected", isSelected);
    const checkbox = card.querySelector("[data-grade-assign-select]");
    if (checkbox) {
      checkbox.checked = Boolean(isSelected);
    }
  }

  function syncAllVisibleGradeSelections() {
    getVisibleCardEntries().forEach(({ problem }) => {
      const card = elements.problemCards?.querySelector(
        `[data-problem-id="${CSS.escape(problem.id)}"]`,
      );
      syncGradeCardSelectionState(card, isProblemSelectedForGrade(problem.id));
    });
  }

  function selectRange() {
    if (!requireAdminMode()) {
      return;
    }

    const category = String(appState.selectedCategory ?? "").trim();
    if (!category || category === "전체") {
      setFeedback("범위 선택은 카테고리를 먼저 선택해 주세요.", "wrong");
      return;
    }

    const from = Math.max(1, Math.floor(Number(elements.adminGradeRangeFrom?.value) || 1));
    const to = Math.max(from, Math.floor(Number(elements.adminGradeRangeTo?.value) || from));
    const state = getGradeAssignmentState();
    state.rangeFrom = from;
    state.rangeTo = to;

    let added = 0;
    getCategoryEntriesInLearningOrder().forEach((entry) => {
      const number = getCategoryProblemNumberForProblem(entry.problem, problems);
      if (number >= from && number <= to) {
        state.selectedProblemIds.add(entry.problem.id);
        added += 1;
      }
    });

    syncAllVisibleGradeSelections();
    updateGradeSummaryText();
    updateGradeListSummary();
    setFeedback(`${from}~${to}번(학습 순서) ${added}개 문제를 선택했습니다.`, "correct");
  }

  function selectAllVisible() {
    if (!requireAdminMode()) {
      return;
    }

    const visible = getVisibleCardEntries();
    if (visible.length === 0) {
      setFeedback("선택할 문제가 없습니다. 카테고리를 선택해 주세요.", "wrong");
      return;
    }

    const state = getGradeAssignmentState();
    visible.forEach(({ problem }) => {
      state.selectedProblemIds.add(problem.id);
    });

    syncAllVisibleGradeSelections();
    updateGradeSummaryText();
    updateGradeListSummary();
    setFeedback(`표시 중인 ${visible.length}개 문제를 선택했습니다.`, "correct");
  }

  function clearSelection() {
    getGradeAssignmentState().selectedProblemIds.clear();
    syncAllVisibleGradeSelections();
    updateGradeSummaryText();
    updateGradeListSummary();
    setFeedback("급수 배정 선택을 해제했습니다.", "correct");
  }

  async function applyGradeToSelection() {
    if (!requireAdminMode() || bulkApplying) {
      return;
    }

    const rawGradeValue = elements.adminGradeTargetSelect?.value;
    const gradeLevel = normalizeGradeLevelCode(rawGradeValue);
    const problemIds = [...getGradeAssignmentState().selectedProblemIds];

    if (!gradeLevel) {
      setFeedback("적용할 급수/단수를 선택해 주세요.", "wrong");
      return;
    }

    if (problemIds.length === 0) {
      setFeedback("급수를 적용할 문제를 선택해 주세요.", "wrong");
      return;
    }

    const previousGrades = new Map(
      problemIds.map((id) => {
        const problem = problems.find((entry) => entry.id === id);
        return [id, normalizeGradeLevelCode(problem?.gradeLevel)];
      }),
    );

    setBulkApplying(true);

    try {
      const result = await problemService.bulkSetGradeLevels({
        user: getCurrentUser(),
        problemIds,
        gradeLevel,
        ProblemStore,
      });

      if (result.updatedCount < problemIds.length) {
        console.warn("[GradeAssignment] partial DB update", {
          requested: problemIds.length,
          updated: result.updatedCount,
        });
      }

      problemIds.forEach((problemId) => applyGradeToMemory(problemId, gradeLevel));
      patchGradeCards(problemIds);

      setFeedback(
        `${result.updatedCount}개 문제에 ${formatGradeLevelLabel(gradeLevel)}을(를) 적용했습니다.`,
        "correct",
      );
    } catch (error) {
      console.error("[GradeAssignment] apply failed", error);
      problemIds.forEach((id) => applyGradeToMemory(id, previousGrades.get(id)));
      patchGradeCards(problemIds);

      const message =
        getProblemStoreErrorMessage?.(error, "급수 일괄 적용") ??
        "급수 일괄 적용에 실패했습니다.";
      setFeedback(message, "wrong");
    } finally {
      setBulkApplying(false);
    }
  }

  async function clearGradeFromSelection() {
    if (!requireAdminMode() || bulkApplying) {
      return;
    }

    const problemIds = [...getGradeAssignmentState().selectedProblemIds];

    if (problemIds.length === 0) {
      setFeedback("급수를 해제할 문제를 선택해 주세요.", "wrong");
      return;
    }

    const previousGrades = new Map(
      problemIds.map((id) => {
        const problem = problems.find((entry) => entry.id === id);
        return [id, normalizeGradeLevelCode(problem?.gradeLevel)];
      }),
    );

    setBulkApplying(true);

    try {
      const result = await problemService.bulkSetGradeLevels({
        user: getCurrentUser(),
        problemIds,
        gradeLevel: null,
        ProblemStore,
      });

      problemIds.forEach((problemId) => applyGradeToMemory(problemId, null));
      patchGradeCards(problemIds);

      setFeedback(`${result.updatedCount}개 문제의 급수 지정을 해제했습니다.`, "correct");
    } catch (error) {
      console.error("[GradeAssignment] clear grade failed", error);
      problemIds.forEach((id) => applyGradeToMemory(id, previousGrades.get(id)));
      patchGradeCards(problemIds);

      const message =
        getProblemStoreErrorMessage?.(error, "급수 해제") ?? "급수 해제에 실패했습니다.";
      setFeedback(message, "wrong");
    } finally {
      setBulkApplying(false);
    }
  }

  function updateGradeSelectionCount() {
    const count = getGradeAssignmentState().selectedProblemIds.size;
    const label = `${count}개 선택됨`;

    if (elements.adminGradeSelectionCount) {
      elements.adminGradeSelectionCount.textContent = label;
    }
  }

  function updateGradeSummaryText() {
    updateGradeSelectionCount();

    if (!elements.adminGradeSummary) {
      return;
    }

    const category = String(appState.selectedCategory ?? "").trim();
    const levelGroup = getActiveLevelGroup();
    const state = getGradeAssignmentState();

    if (!category || category === "전체") {
      elements.adminGradeSummary.textContent =
        "급수 배정은 특정 카테고리를 선택한 뒤 사용합니다. display_order(학습 번호)는 변경되지 않습니다.";
      return;
    }

    const visibleCount = getVisibleCardEntries().length;
    const unassignedCount = getCategoryEntriesInLearningOrder().filter(
      ({ problem }) => !normalizeGradeLevelCode(problem.gradeLevel),
    ).length;

    elements.adminGradeSummary.textContent = `${levelGroup} · ${category} · 표시 ${visibleCount}개 · 미지정 ${unassignedCount}개 · 급수 선택 ${state.selectedProblemIds.size}개`;
  }

  function renderGradeAssignmentPanel() {
    bindGradeAssignmentEvents();

    const category = String(appState.selectedCategory ?? "").trim();
    const levelGroup = getActiveLevelGroup();
    const state = getGradeAssignmentState();

    if (elements.adminGradeCategoryLabel) {
      elements.adminGradeCategoryLabel.textContent =
        category && category !== "전체"
          ? `${levelGroup} · ${category}`
          : "카테고리를 선택해 주세요";
    }

    if (elements.adminGradeUnassignedOnly) {
      elements.adminGradeUnassignedOnly.checked = state.showUnassignedOnly;
    }

    if (elements.adminGradeRangeFrom) {
      elements.adminGradeRangeFrom.value = String(state.rangeFrom);
    }

    if (elements.adminGradeRangeTo) {
      elements.adminGradeRangeTo.value = String(state.rangeTo);
    }

    updateGradeSummaryText();

    if (elements.adminGradeList) {
      elements.adminGradeList.innerHTML = "";
      elements.adminGradeList.classList.add("is-hidden");
    }

    if (isGradeAssignmentMode()) {
      renderProblemList();
    }
  }

  function resetSelectionOnCategoryChange() {
    getGradeAssignmentState().selectedProblemIds.clear();
  }

  function shouldShowUnassignedOnlyFilter() {
    return getGradeAssignmentState().showUnassignedOnly;
  }

  function matchesGradeAssignmentListFilter(problem) {
    if (!shouldShowUnassignedOnlyFilter()) {
      return true;
    }

    return !normalizeGradeLevelCode(problem.gradeLevel);
  }

  return {
    bindGradeAssignmentEvents,
    renderGradeAssignmentPanel,
    resetSelectionOnCategoryChange,
    isGradeAssignmentMode,
    isProblemSelectedForGrade,
    matchesGradeAssignmentListFilter,
    updateGradeSummaryText,
    applyGradeToMemory,
    patchGradeCards,
  };
}
