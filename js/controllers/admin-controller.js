import {

  getOrderedCategoryNames,

  readCategories,

  syncCategoriesFromProblems as syncCategoryRegistryFromProblems,

} from "../services/category-service.js";



export function createAdminController({

  elements,

  adminState,

  appState,

  adminView,

  problems,

  ProblemStore,

  problemService,

  CREATOR_CATEGORIES,

  isCurrentUserAdmin,

  getCurrentUser,

  setFeedback,

  showListMode,

  renderCategoryFilters,

  renderCreatorCategoryOptions,

  renderCategoryManager,

  registerCategoryByName,

  renderProblemList,

  getFilteredProblems,

  getProblemStoreErrorMessage,

  createProblemId,

  cloneProblem,

  getActiveLevelGroup,

  getEditorActions,

  getProblemSortHintMessage,

}) {

  function bindAdminEvents() {

    elements.adminModeToggle?.addEventListener("click", toggleAdminMode);

    elements.addCategoryButton?.addEventListener("click", addAdminCategory);

    elements.addProblemButton?.addEventListener("click", startAddingProblem);

    elements.adminProblemSortToggle?.addEventListener("click", toggleProblemSortMode);

    elements.adminPanelTabs?.addEventListener("click", handleAdminPanelTabClick);

  }



  function handleAdminPanelTabClick(event) {

    const tabButton = event.target.closest("[data-admin-panel]");

    if (!tabButton || !adminState.isEnabled) {

      return;

    }



    setAdminListPanel(tabButton.dataset.adminPanel);

  }



  function setAdminListPanel(panel) {

    if (!["problems", "curriculum"].includes(panel)) {

      return;

    }



    adminState.listPanel = panel;

    if (panel === "curriculum") {

      getEditorActions().closeAdminEditor();

    }



    adminView.updateAdminVisibility();

    if (panel === "problems") {

      renderProblemList();

    }

  }



  function toggleAdminMode() {

    if (!isCurrentUserAdmin()) {

      setAdminModeEnabled(false);

      setFeedback("관리자로 로그인한 경우에만 관리자 모드를 사용할 수 있습니다.", "wrong");

      return;

    }



    setAdminModeEnabled(!adminState.isEnabled);

  }



  function setAdminModeEnabled(isEnabled) {

    adminState.isEnabled = isEnabled && isCurrentUserAdmin();

    if (!adminState.isEnabled) {

      adminState.listPanel = "problems";

      adminState.problemSortMode = false;

    }



    adminView.renderAdminModeToggle();



    if (!adminState.isEnabled) {

      getEditorActions().closeAdminEditor();

    } else if (appState.mode !== "list") {

      showListMode();

    }



    updateAdminVisibility();

    updateProblemSortModeUi();

    renderProblemList();

  }



  function toggleProblemSortMode() {

    if (!requireAdminMode()) {

      return;

    }



    adminState.problemSortMode = !adminState.problemSortMode;

    if (adminState.problemSortMode) {

      getEditorActions().closeAdminEditor();

    }



    updateProblemSortModeUi();

    renderProblemList();

  }



  function updateProblemSortModeUi() {

    const isActive = adminState.isEnabled && adminState.problemSortMode;

    elements.adminProblemSortToggle?.classList.toggle("is-active", isActive);

    elements.adminProblemSortToggle?.setAttribute("aria-pressed", String(isActive));

    elements.adminProblemSortHint?.classList.toggle("is-hidden", !isActive);

    if (elements.adminProblemSortHint && isActive) {

      elements.adminProblemSortHint.textContent =

        typeof getProblemSortHintMessage === "function"

          ? getProblemSortHintMessage()

          : "";

    }

  }



  function updateAdminVisibility() {

    if (!isCurrentUserAdmin() && adminState.isEnabled) {

      adminState.isEnabled = false;

      adminState.listPanel = "problems";

      getEditorActions().closeAdminEditor();

    }

    adminView.updateAdminVisibility();

  }



  function requireAdminMode() {

    if (adminState.isEnabled && isCurrentUserAdmin()) {

      return true;

    }



    setAdminModeEnabled(false);

    setFeedback("관리자로 로그인한 경우에만 관리자 기능을 사용할 수 있습니다.", "wrong");

    return false;

  }



  function addAdminCategory() {

    if (!requireAdminMode()) {

      return;

    }



    setAdminListPanel("curriculum");



    const category = elements.adminNewCategory.value.trim();

    if (!category) {

      setFeedback("추가할 카테고리 이름을 입력해 주세요.", "wrong");

      return;

    }



    const result = registerCategoryByName(category);

    if (!result?.ok) {

      setFeedback(result?.message || "이미 존재하는 카테고리입니다.", "wrong");

      return;

    }



    elements.adminNewCategory.value = "";

    setFeedback(`${category} 카테고리를 추가했습니다.`, "correct");

  }



  function handleAdminProblemSaved() {

    syncCategoriesFromProblems();

    renderCategoryManager?.();

    renderCategoryFilters();

    renderProblemList();

    adminView.renderProblemCount(getFilteredProblems().length);

  }



  function startAddingProblem() {

    if (!requireAdminMode()) {

      return;

    }



    setAdminListPanel("problems");



    adminState.editingIndex = null;

    adminState.draft = {

      id: createProblemId("새 문제", CREATOR_CATEGORIES[0] ?? "미분류"),

      title: "",

      description: "",

      level: "",

      levelGroup: getActiveLevelGroup(),

      category: CREATOR_CATEGORIES[0] ?? "미분류",

      type: "board",

      oxAnswer: true,

      stones: [],

      correctMove: { x: 0, y: 0 },

      correctSequence: [],

    };

    getEditorActions().renderAdminEditor();

  }



  function startEditingProblem(problemId) {

    if (!requireAdminMode()) {

      return;

    }



    const index = problems.findIndex((entry) => entry.id === problemId);

    if (index === -1) {

      return;

    }



    setAdminListPanel("problems");



    adminState.editingIndex = index;

    adminState.draft = cloneProblem(problems[index]);

    getEditorActions().renderAdminEditor();

  }



  async function deleteProblem(problemId) {

    if (!requireAdminMode()) {

      return;

    }



    const index = problems.findIndex((entry) => entry.id === problemId);

    const problem = problems[index];

    if (!problem || !window.confirm(`"${problem.title}" 문제를 삭제할까요?`)) {

      return;

    }



    try {

      await problemService.deleteProblem({

        user: getCurrentUser(),

        problemId: problem.id,

        ProblemStore,

      });

      problems.splice(index, 1);

      appState.selectedPrintProblemIds.delete(problem.id);

      if (appState.currentProblemIndex >= problems.length) {

        appState.currentProblemIndex = Math.max(0, problems.length - 1);

      } else if (index < appState.currentProblemIndex) {

        appState.currentProblemIndex -= 1;

      }



      getEditorActions().closeAdminEditor();

      renderCategoryFilters();

      renderProblemList();

      adminView.renderProblemCount(getFilteredProblems().length);

      setFeedback("Supabase에서 문제를 삭제했습니다.", "correct");

    } catch (error) {

      console.error("Failed to delete problem.", error);

      setFeedback(getProblemStoreErrorMessage(error, "삭제"), "wrong");

    }

  }



  function syncCategoriesFromProblems() {

    syncCategoryRegistryFromProblems(problems);

    CREATOR_CATEGORIES.splice(

      0,

      CREATOR_CATEGORIES.length,

      ...getOrderedCategoryNames(readCategories(), { levelGroup: getActiveLevelGroup() }),

    );

  }



  return {

    bindAdminEvents,

    toggleAdminMode,

    setAdminModeEnabled,

    setAdminListPanel,

    updateAdminVisibility,

    requireAdminMode,

    addAdminCategory,

    handleAdminProblemSaved,

    startAddingProblem,

    startEditingProblem,

    deleteProblem,

    toggleProblemSortMode,

    updateProblemSortModeUi,

  };

}


