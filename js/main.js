import { createAcademyInviteController } from "./academy/invite.js";
import { createAcademyMemberController } from "./academy/members.js";
import { createCategoryManagerController } from "./admin/category-manager.js";
import { createAdminEditorController } from "./admin/editor.js";
import { createAcademyController } from "./controllers/academy-controller.js";
import { createAdminController } from "./controllers/admin-controller.js";
import { createProblemCreatorController } from "./controllers/create-controller.js";
import { bindSolveController } from "./controllers/solve-controller.js";
import { academyElements } from "./dom/academy-elements.js";
import { adminElements } from "./dom/admin-elements.js";
import { problemElements } from "./dom/problem-elements.js";
import { removeCapturedStonesAfterMove as calculateStonesAfterCapture } from "./game/capture.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "./game/placement-validation.js";
import { isSamePoint } from "./game/rules.js";
import { isOxProblem } from "./game/problem-type.js";
import { advanceCorrectSequence, getProblemCorrectSequence } from "./game/sequence.js";
import { isCorrectMove, isCorrectOxAnswer, isCorrectUserMove } from "./game/validation.js";
import {
  canManageAcademy,
  canManageAttendance,
  canManageProblems,
  canManageStudents,
  canViewAcademyMenu,
  canViewAcademySubmenu,
  canViewPayments,
  canViewReviews,
  canUsePrintBuilder,
  normalizeRole,
  ROLES,
} from "./permissions/permission-service.js";
import { createProblemPrintController } from "./problem/print.js";
import {
  getNextCategoryName,
  getOrderedCategoryNames,
  initializeCategoryRegistry,
  readCategories,
  syncCategoriesFromProblems as syncCategoryRegistryFromProblems,
  syncCategoryNames,
} from "./services/category-service.js";
import { formatCategoryProblemLabel } from "./services/category-problem-number.js";
import {
  DEFAULT_LEVEL_GROUP,
  LEVEL_GROUPS,
  normalizeLevelGroup,
} from "./services/level-group-service.js";
import {
  applyPrintSelection,
  orderProblemsForPrint,
  PRINT_SELECTION_MODE,
} from "./services/print-selection-service.js";
import { createPrintBuilderController } from "./ui/print-builder.js";
import { createBootLogger, safeOn } from "./bootstrap/boot-logger.js";
import {
  getCategoryProgressRow,
  getCurrentLearningFlow,
  getNextProblemForCategory,
  getProblemsInCategoryOrder,
  getStudyCurriculumTree,
  resolveActiveLevelGroupFromProgress,
} from "./services/learning-flow-service.js";
import { buildReviewQueue, getReviewOffer } from "./services/review-service.js";
import { problemService } from "./services/problem-service.js";
import { PROGRESS_STATUS, studentProgressService } from "./services/student-progress-service.js";
import { adminState } from "./state/admin-state.js";
import { appState } from "./state/app-state.js";
import { createCreatorState } from "./state/creator-state.js";
import { createAcademyView } from "./views/academy-view.js";
import { createAdminView } from "./views/admin-view.js";
import { createExamView } from "./views/exam-view.js";
import { createProblemCreatorView } from "./views/create-view.js";
import { createSolveView } from "./views/solve-view.js";
import { createCategoryCompleteModalController } from "./ui/category-complete-modal-controller.js";
import { createStudyView } from "./views/study-view.js";

const { BoardController } = window.BadukBoard;
const { BOARD_SIZE, ProblemStore, problems, STONE } = window.BadukProblems;
const { createProblemSgf } = window.BadukSgf;

const CREATOR_CATEGORIES = [];
initializeCategoryRegistry();
syncCreatorCategoriesForLevelGroup();
const elements = {
  ...problemElements,
  ...adminElements,
  ...academyElements,
};

if (!window.WGo) {
  elements.feedback.textContent =
    "WGo.js를 불러오지 못했습니다. 인터넷 연결 또는 CDN 접근을 확인해 주세요.";
  throw new Error("WGo.js failed to load.");
}

const creatorState = createCreatorState(CREATOR_CATEGORIES);

const boardController = new BoardController(elements.board, {
  size: BOARD_SIZE,
  onPlay: (point) => handleBoardClick(point, { button: "primary" }),
  onSecondaryPlay: (point) => handleBoardClick(point, { button: "secondary" }),
  onInvalidPlay: handleInvalidBoardPlay,
  preview: {
    enabled: true,
    getActiveColor: () => getBoardPreviewColor(),
    evaluatePoint: (point, { stones }) => evaluateBoardPreviewPoint(point, stones),
  },
});

function getBoardPreviewColor() {
  if (appState.mode === "create" && isCreatorStonePlacementTool()) {
    return STONE.black;
  }

  return STONE.black;
}

function isCreatorStonePlacementTool() {
  return creatorState.activeTool === "black" || creatorState.activeTool === "white";
}

function evaluateBoardPreviewPoint(point, stones = boardController.getStones()) {
  if (appState.mode === "create") {
    return evaluateCreatorPreviewPoint(point, stones);
  }

  if (appState.mode === "solve") {
    const color = getBoardPreviewColor();
    return evaluatePlacement(
      stones,
      { ...point, color },
      { boardSize: BOARD_SIZE, stoneColors: STONE },
    );
  }

  return { status: PLACEMENT_STATUS.occupied };
}

function evaluateCreatorPreviewPoint(point, stones) {
  if (creatorState.activeTool === "answer") {
    return boardController.hasStone(point)
      ? { status: PLACEMENT_STATUS.occupied }
      : { status: PLACEMENT_STATUS.legal };
  }

  if (creatorState.activeTool === "mark") {
    return boardController.hasStone(point)
      ? { status: PLACEMENT_STATUS.legal }
      : { status: PLACEMENT_STATUS.occupied };
  }

  if (isCreatorStonePlacementTool()) {
    return { status: PLACEMENT_STATUS.legal };
  }

  if (boardController.hasStone(point)) {
    const existingStone = stones.find((stone) => isSamePoint(stone, point));
    if (existingStone?.color === creatorState.activeTool) {
      return { status: PLACEMENT_STATUS.legal };
    }

    return { status: PLACEMENT_STATUS.occupied };
  }

  return { status: PLACEMENT_STATUS.legal };
}

function syncBoardPreviewContext() {
  const problem = appState.mode === "solve" ? getCurrentProblem() : null;
  const isOxSolve = appState.mode === "solve" && isOxProblem(problem);
  const enabled =
    !isOxSolve &&
    (appState.mode === "solve" || appState.mode === "create") &&
    !appState.isSolved &&
    !appState.isAiThinking;

  boardController.setPreviewContext({
    enabled,
    editorStonePlacement: appState.mode === "create" && isCreatorStonePlacementTool(),
    getActiveColor: () => getBoardPreviewColor(),
    evaluatePoint: (point, { stones }) => evaluateBoardPreviewPoint(point, stones),
  });

  if (!enabled) {
    boardController.clearPreview();
  }
}

function handleInvalidBoardPlay(point, evaluation) {
  if (evaluation.reason === "suicide") {
    setFeedback("자살수는 둘 수 없습니다. 다른 곳을 선택해 보세요.", "wrong");
    return;
  }

  setFeedback("이 자리에는 둘 수 없습니다.", "wrong");
}
let solveView;
const setMode = (mode) => {
  solveView.setMode(mode);
  syncBoardPreviewContext();
};

const {
  bindInviteCodeEvents,
  createInviteCode,
  renderInviteCodes,
} = createAcademyInviteController({
  elements,
  getCurrentUser,
  isAcademyUser,
  setFeedback,
  escapeHtml,
  formatDateTime,
});

const {
  bindAcademyMemberEvents,
  renderAcademyMembers,
  renderAcademyStudents,
  renderTeacherManagement,
  renderStudentAccounts,
} = createAcademyMemberController({
  elements,
  getCurrentUser,
  getTotalProblemCount: () => problems.length,
  getProblems: () => problems,
  getProblemById: (problemId) => problems.find((problem) => problem.id === problemId),
  openProblemInLibrary: (problemId) => {
    const problem = problems.find((item) => item.id === problemId);
    if (!problem) {
      return;
    }

    appState.selectedLevelGroup = normalizeLevelGroup(problem.levelGroup);
    appState.selectedCategory = problem.category || "전체";
    showListMode();
    renderLevelGroupFilters();
    renderCategoryFilters();
    renderProblemList();
  },
  escapeHtml,
  formatDateTime,
});

const printBuilder = createPrintBuilderController({
  elements,
  getCategories: () => CREATOR_CATEGORIES,
  getProblems: () => problems,
  getActiveLevelGroup,
  getSelectedIds: () => appState.selectedPrintProblemIds,
  onSelectionChange: syncPrintSelectionUi,
  onClearAll: () => {
    clearPrintSelectionSession({ reason: "builder-clear-all", showFeedback: false });
    setFeedback("인쇄 작업을 종료했습니다.", "correct");
  },
  setFeedback,
  escapeHtml,
});

function clearPrintSelectionSession(options = {}) {
  const { reason = "manual", showFeedback = false } = options;

  if (!canUsePrintFeatures()) {
    return;
  }

  const countBefore = appState.selectedPrintProblemIds.size;
  console.info("[PrintSession]", "clearPrintSelectionSession", { reason, countBefore });

  appState.selectedPrintProblemIds.clear();

  if (elements.printArea) {
    elements.printArea.innerHTML = "";
    elements.printArea.classList.remove("is-monochrome");
  }

  syncPrintSelectionUi();

  if (showFeedback) {
    setFeedback("인쇄 선택을 해제했습니다.", "correct");
  }
}

const { printSelectedProblems: runPrintSelectedProblems } = createProblemPrintController({
  elements,
  problems,
  getSelectedPrintProblems,
  renderProblemPreviewBoard,
  setFeedback,
  escapeHtml,
  chunkArray,
  formatCategoryProblemLabel,
});

function printSelectedProblems() {
  if (!canUsePrintFeatures()) {
    return;
  }

  runPrintSelectedProblems();
}

let adminEditorActions = {
  renderAdminEditor: () => {},
  closeAdminEditor: () => {},
};

function requireAdminModeForCategories() {
  if (adminState.isEnabled && isCurrentUserAdmin()) {
    return true;
  }

  setFeedback("관리자로 로그인한 경우에만 관리자 기능을 사용할 수 있습니다.", "wrong");
  return false;
}

const {
  bindCategoryManagerEvents,
  renderCategoryManager,
  registerCategoryByName,
} = createCategoryManagerController({
  elements,
  problems,
  ProblemStore,
  problemService,
  CREATOR_CATEGORIES,
  getActiveLevelGroup,
  getCurrentUser,
  requireAdminMode: requireAdminModeForCategories,
  setFeedback,
  renderCategoryFilters: () => renderCategoryFilters(),
  renderCreatorCategoryOptions: () => renderCreatorCategoryOptions(),
  renderProblemList,
  escapeHtml,
});

const adminView = createAdminView({
  elements,
  adminState,
  appState,
  isCurrentUserAdmin,
  renderCategoryManager,
});

const {
  bindAdminEvents,
  updateAdminVisibility,
  requireAdminMode,
  handleAdminProblemSaved,
  startEditingProblem,
  deleteProblem,
} = createAdminController({
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
  renderCreatorCategoryOptions: () => renderCreatorCategoryOptions(),
  renderCategoryManager,
  registerCategoryByName,
  renderProblemList,
  getFilteredProblems,
  getProblemStoreErrorMessage,
  createProblemId,
  cloneProblem,
  getActiveLevelGroup,
  getEditorActions: () => adminEditorActions,
});

const {
  renderAdminEditor,
  closeAdminEditor,
} = createAdminEditorController({
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
  onProblemSaved: handleAdminProblemSaved,
  cloneProblem,
  isSamePoint,
  getWgoMarkType,
  escapeHtml,
  getProblemStoreErrorMessage,
});
adminEditorActions = { renderAdminEditor, closeAdminEditor };

const academyView = createAcademyView({
  elements,
  appState,
  canViewLearningMenu,
  canViewAcademyMenu: () => canViewAcademyMenu(getCurrentUser()),
  canViewAcademySubmenu: (section) => canViewAcademySubmenu(getCurrentUser(), section),
  canViewAttendanceMenu,
  canViewPaymentsMenu,
  showSolveMode,
  renderInviteCodes,
  renderAcademyStudents,
  renderTeacherManagement,
  renderStudentAccounts,
});

const {
  showAcademyMenu,
  updateAcademyMenuVisibility,
  bindAcademyEvents,
} = createAcademyController({
  elements,
  appState,
  canAccessAcademyMenu,
  setFeedback,
  setMode,
  clearPendingAiMove,
  academyView,
  closeAdminEditor,
});

const createView = createProblemCreatorView({
  elements,
  creatorState,
  boardController,
  CREATOR_CATEGORIES,
});

const {
  bindCreateEvents,
  renderCreatorCategoryOptions,
  handleCreatorBoardClick,
} = createProblemCreatorController({
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
});

const examView = createExamView({ elements });
void examView;

const studyView = createStudyView({
  elements,
  escapeHtml,
});

solveView = createSolveView({
  elements,
  appState,
  boardController,
  problems,
  STONE,
  getStoneLabel,
  getProblemStartFeedback,
  getFilteredProblems,
  renderProblemList,
  formatCategoryProblemLabel,
  getProblemsInCategoryOrder,
  setStatus,
  setFeedback,
  updateAcademyMenuVisibility,
  updateAdminVisibility,
  updatePrintUiVisibility,
});

const categoryCompleteModal = createCategoryCompleteModalController({
  elements,
  onAction: handleCategoryCompleteAction,
});

startApplication();

async function startApplication() {
  try {
    await window.BadukAuth?.authReady;
  } catch (error) {
    console.error("Auth initialization failed before app bootstrap.", error);
  }

  applyInitialListScreen();
  runApplicationBootstrap();
  await initializeApp();
}

function runApplicationBootstrap() {
  const boot = createBootLogger("Bootstrap");

  try {
    boot.run("bindSolveController", () => {
      bindSolveController({
        elements,
        showListMode,
        showSolveMode: showStudyMode,
        showNextProblem,
        showMainMenuTarget,
      });
    });
    boot.run("bindStudyScreenEvents", () => bindStudyScreenEvents());
    boot.run("bindAcademyMemberEvents", () => bindAcademyMemberEvents());
    boot.run("bindInviteCodeEvents", () => bindInviteCodeEvents());
    boot.run("bindAcademyEvents", () => bindAcademyEvents());
    boot.run("bindCreateEvents", () => bindCreateEvents());
    boot.run("bindOxSolveEvents", () => bindOxSolveEvents());
    boot.run("bindAdminEvents", () => bindAdminEvents());
    boot.run("bindCategoryManagerEvents", () => bindCategoryManagerEvents());
    boot.runOptional("initPrintBuilder", () => {
      printBuilder.bind();
      printBuilder.render();
    });
    boot.runOptional("bindPrintActions", () => {
      safeOn(elements.printSelectedButton, "click", printSelectedProblems, {
        stepName: "printSelectedButton",
      });
      safeOn(
        elements.createTeacherCodeButton,
        "click",
        () => createInviteCode("teacher"),
        { stepName: "createTeacherCodeButton" },
      );
      safeOn(
        elements.createStudentCodeButton,
        "click",
        () => createInviteCode("student"),
        { stepName: "createStudentCodeButton" },
      );
      safeOn(
        elements.answerModal,
        "click",
        () => {
          if (appState.canDismissAnswerModal) {
            hideAnswerModal();
          }
        },
        { stepName: "answerModal" },
      );
    });
    boot.run("bindCategoryCompleteModal", () => categoryCompleteModal.bind());
    boot.summary();
  } catch (error) {
    console.error("[Bootstrap] Initialization stopped before app data load.", error);
    setFeedback("화면 초기화 중 오류가 발생했습니다. 콘솔 로그를 확인해 주세요.", "wrong");
  }
}

async function initializeApp() {
  const boot = createBootLogger("AppInit");

  setStatus("문제 데이터를 불러옵니다.");
  setFeedback("Supabase에서 문제 목록을 불러오는 중입니다.");

  try {
    await boot.runAsync("loadProblems", async () => {
      try {
        const migrationResult = await ProblemStore.migrateLegacyProblems();
        const loadedProblems = await ProblemStore.loadProblems();
        replaceProblemList(loadedProblems);
        ProblemStore.subscribe(handleRealtimeProblemUpdate);
        if (migrationResult.migratedCount > 0) {
          setFeedback(
            `기존 로컬 문제 ${migrationResult.migratedCount}개를 Supabase로 이전했습니다.`,
            "correct",
          );
        }
      } catch (error) {
        console.error("Failed to load Supabase problems.", error);
        replaceProblemList(ProblemStore.getDefaultProblems());
        setFeedback("Supabase 문제 데이터를 불러오지 못해 기본 문제를 표시합니다.", "wrong");
      }
    });

    boot.run("syncCategoriesFromProblems", () => syncCategoriesFromProblems());
    boot.run("renderCategoryManager", () => renderCategoryManager());
    boot.run("renderCreatorCategoryOptions", () => renderCreatorCategoryOptions());
    boot.run("updateAcademyMenuVisibility", () => updateAcademyMenuVisibility());
    boot.run("updatePrintUiVisibility", () => updatePrintUiVisibility());

    boot.run("showInitialScreen", () => {
      logScreen("showInitialScreen");
      if (problems.length > 0) {
        refreshProblemBank();
      } else {
        showEmptyProblemState();
      }
    });

    boot.run("syncBoardPreviewContext", () => syncBoardPreviewContext());
    boot.summary();
  } catch (error) {
    console.error("[AppInit] App initialization halted.", error);
    setFeedback("앱 데이터 초기화 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.", "wrong");

    try {
      replaceProblemList(ProblemStore.getDefaultProblems());
      syncCategoriesFromProblems();
      refreshProblemBank();
    } catch (recoveryError) {
      console.error("[AppInit] Recovery render failed.", recoveryError);
    }
  }
}

function bindStudyScreenEvents() {
  elements.studyScreen?.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-study-level]");
    if (toggleButton) {
      toggleStudyLevelGroup(toggleButton.dataset.toggleStudyLevel);
      renderStudyScreen();
      return;
    }

    const startButton = event.target.closest("[data-start-problem-index]");
    if (startButton) {
      const problemIndex = Number(startButton.dataset.startProblemIndex);
      if (!Number.isNaN(problemIndex)) {
        loadProblem(problemIndex);
      }
      return;
    }

    const reviewButton = event.target.closest("[data-start-review-category]");
    if (reviewButton) {
      startReviewSession(
        reviewButton.dataset.startReviewCategory,
        reviewButton.dataset.reviewLevelGroup,
      );
      return;
    }

    if (event.target.closest("[data-go-problem-bank]")) {
      showListMode();
    }
  });
}

function logScreen(event, detail) {
  if (detail === undefined) {
    console.info(`[Screen] ${event}`);
    return;
  }

  console.info(`[Screen] ${event}`, detail);
}

function applyInitialListScreen() {
  logScreen("applyInitialListScreen");
  hideCategoryCompleteModal();
  clearReviewSession();
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  appState.mode = "list";
  setMode("list");
  studyView.clearStudyHubMeta();
  elements.meta.textContent = "Problem Library";
  elements.title.textContent = "문제은행";
  elements.description.textContent =
    "카테고리별로 문제를 살펴보고 학습할 문제를 선택하세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "학습할 문제를 선택하세요";
}

function refreshProblemBank() {
  logScreen("refreshProblemBank", { problemCount: problems.length });
  studyView.clearStudyHubMeta();
  appState.mode = "list";
  setMode("list");

  logScreen("renderCategoryFilters");
  renderCategoryFilters();

  logScreen("renderProblemList");
  elements.meta.textContent = "Problem Library";
  elements.title.textContent = "문제은행";
  elements.description.textContent =
    "카테고리별로 문제를 살펴보고 학습할 문제를 선택하세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "학습할 문제를 선택하세요";
  renderProblemList();
}

function resolveActiveLevelGroupForStudy(progressList) {
  return resolveActiveLevelGroupFromProgress(progressList, problems);
}

function getStudyExpandedLevelGroups(defaultLevelGroup) {
  if (appState.studyExpandedLevelGroups === null) {
    appState.studyExpandedLevelGroups = new Set([normalizeLevelGroup(defaultLevelGroup)]);
  }

  return appState.studyExpandedLevelGroups;
}

function toggleStudyLevelGroup(levelGroup) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);

  if (appState.studyExpandedLevelGroups === null) {
    appState.studyExpandedLevelGroups = new Set();
  }

  if (appState.studyExpandedLevelGroups.has(normalizedLevelGroup)) {
    appState.studyExpandedLevelGroups.delete(normalizedLevelGroup);
  } else {
    appState.studyExpandedLevelGroups.add(normalizedLevelGroup);
  }
}

function buildReviewOffersByLevel(curriculumTree, progressByProblemId) {
  const reviewOffersByLevel = {};

  curriculumTree.levelGroups.forEach((levelFlow) => {
    if (!levelFlow.activeCategory || !levelFlow.activeRow?.isComplete) {
      return;
    }

    const reviewOffer = getReviewOffer(
      levelFlow.activeCategory,
      problems,
      progressByProblemId,
      { levelGroup: levelFlow.levelGroup },
    );

    if (reviewOffer) {
      reviewOffersByLevel[levelFlow.levelGroup] = reviewOffer;
    }
  });

  return reviewOffersByLevel;
}

function renderStudyScreen() {
  logScreen("renderStudyScreen", { mode: appState.mode });
  const currentUser = getCurrentUser();
  const progressList = currentUser?.id
    ? studentProgressService.getStudentProgressByUserId(currentUser.id)
    : [];
  const progressByProblemId = getCurrentStudentProgressByProblemId();
  const activeLevelGroup = resolveActiveLevelGroupForStudy(progressList);
  const curriculumTree = getStudyCurriculumTree({
    progressList,
    problems,
    progressByProblemId,
    activeLevelGroup,
  });
  const expandedLevelGroups = getStudyExpandedLevelGroups(curriculumTree.currentLevelGroup);
  const reviewOffersByLevel = buildReviewOffersByLevel(curriculumTree, progressByProblemId);

  studyView.renderStudyScreen({
    curriculumTree,
    expandedLevelGroups,
    reviewOffersByLevel,
  });
}

function showStudyMode() {
  logScreen("showStudyMode");
  if (problems.length === 0) {
    showEmptyProblemState();
    return;
  }

  hideCategoryCompleteModal();
  clearReviewSession();
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  setMode("study");
  const progressList = getCurrentUser()?.id
    ? studentProgressService.getStudentProgressByUserId(getCurrentUser().id)
    : [];
  studyView.renderStudyHubMeta(resolveActiveLevelGroupForStudy(progressList));
  renderStudyScreen();
}

function clearReviewSession() {
  appState.reviewSession = null;
}

function startReviewSession(categoryName, levelGroup = getActiveLevelGroup()) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  if (!normalizedCategory) {
    return;
  }

  const queue = buildReviewQueue(normalizedCategory, problems, getCurrentStudentProgressByProblemId(), {
    levelGroup: normalizedLevelGroup,
  });
  if (queue.length === 0) {
    return;
  }

  appState.reviewSession = {
    categoryName: normalizedCategory,
    levelGroup: normalizedLevelGroup,
    queue,
    currentIndex: 0,
  };
  loadReviewProblem(0);
}

function loadReviewProblem(queueIndex) {
  const session = appState.reviewSession;
  const reviewItem = session?.queue?.[queueIndex];

  if (!reviewItem) {
    clearReviewSession();
    showStudyMode();
    return;
  }

  hideCategoryCompleteModal();
  session.currentIndex = queueIndex;
  clearPendingAiMove();
  clearAutoNext();
  clearWrongTimers();
  hideAnswerModal();
  hideWrongModal();
  setMode("solve");
  appState.currentProblemIndex = reviewItem.index;
  appState.solvedAnswerKeys = new Set();
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];
  const boardStones = captureInitialBoardState(reviewItem.problem);
  solveView.renderProblem(reviewItem.problem, reviewItem.index, { reviewItem, boardStones });
  syncBoardPreviewContext();
}

function getNextReviewProblemInSession() {
  const session = appState.reviewSession;
  if (!session) {
    return null;
  }

  const nextIndex = session.currentIndex + 1;
  if (nextIndex >= session.queue.length) {
    return null;
  }

  return session.queue[nextIndex];
}

function loadProblem(index) {
  const problem = problems[index];

  if (!problem) {
    showEmptyProblemState();
    return;
  }

  hideCategoryCompleteModal();
  clearReviewSession();
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
  const boardStones = captureInitialBoardState(problem);
  solveView.renderProblem(problem, index, { boardStones });
  syncBoardPreviewContext();
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
  solveView.renderEmptyProblemState();
}

function handleBoardClick(point, { button = "primary" } = {}) {
  if (button === "secondary" && appState.mode !== "create") {
    return;
  }

  if (appState.mode === "create") {
    handleCreatorBoardClick(point, { button });
    return;
  }

  const problem = getCurrentProblem();
  if (isOxProblem(problem)) {
    return;
  }

  handleUserMove(point);
}

function handleOxAnswer(userOxAnswer) {
  const problem = getCurrentProblem();

  if (!isOxProblem(problem)) {
    return;
  }

  if (appState.isSolved) {
    setFeedback("이미 정답을 찾았습니다. 다음 문제로 넘어가 보세요.", "correct");
    return;
  }

  if (appState.isAiThinking) {
    return;
  }

  safeRecordStudentProgress(() => {
    studentProgressService.markProblemInProgress({
      user: getCurrentUser(),
      problem,
    });
  });

  elements.oxSolveButtons?.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.oxAnswer === String(userOxAnswer));
  });

  if (isCorrectOxAnswer(userOxAnswer, problem)) {
    completeProblem(problem);
    return;
  }

  resetCurrentProblemAfterWrongMove(problem);
}

function handleUserMove(point) {
  const problem = getCurrentProblem();

  if (appState.isSolved) {
    setFeedback("이미 정답을 찾았습니다. 다음 문제로 넘어가 보세요.", "correct");
    return;
  }

  if (appState.isAiThinking) {
    setFeedback("오답 처리 중입니다. 잠시 후 다시 착수해 보세요.", "wrong");
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
  safeRecordStudentProgress(() => {
    studentProgressService.markProblemInProgress({
      user: getCurrentUser(),
      problem,
    });
  });

  if (isCorrectUserMove(point, problem, appState.solvedAnswerKeys)) {
    const sequenceResult = advanceCorrectSequence(
      problem,
      appState.playedMoves,
      appState.solvedAnswerKeys,
    );
    appState.solvedAnswerKeys = sequenceResult.solvedAnswerKeys;
    if (sequenceResult.shouldContinue) {
      setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
      setFeedback(`좋아요. 활로 정답이 ${sequenceResult.remainingMoves}수 남았습니다.`, "correct");
      appState.playedMoves.push(userMove);
      return;
    }

    completeProblem(problem);
    return;
  }

  recordWrongMove(problem, userMove);
  resetCurrentProblemAfterWrongMove(problem);
}

function showNextProblem() {
  if (appState.mode !== "solve") {
    return;
  }

  if (appState.reviewSession) {
    const session = appState.reviewSession;
    const nextIndex = (session.currentIndex + 1) % session.queue.length;
    loadReviewProblem(nextIndex);
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

function showMainMenuTarget(menuTarget) {
  if (menuTarget === "list") {
    showListMode();
    return;
  }

  if (menuTarget === "study" || menuTarget === "solve") {
    showStudyMode();
    return;
  }

  showAcademyMenu(menuTarget);
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
  showStudyMode();
}

function showListMode() {
  logScreen("showListMode");
  hideCategoryCompleteModal();
  clearReviewSession();
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  appState.mode = "list";
  refreshProblemBank();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderCategoryFilters() {
  renderLevelGroupFilters();

  if (!elements.categoryFilters) {
    console.warn("[renderCategoryFilters] missing #category-filters element");
    return;
  }

  const studentProgressByProblemId = getCurrentStudentProgressByProblemId();
  elements.categoryFilters.innerHTML = "";

  getCategoryFilters().forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    button.dataset.category = category;
    updateCategoryFilterButton(button, category, studentProgressByProblemId);
    button.addEventListener("click", () => handleCategoryChipClick(category));
    elements.categoryFilters.append(button);
  });

  if (canUsePrintFeatures()) {
    printBuilder.render();
  }
}

function renderLevelGroupFilters() {
  if (!elements.levelGroupFilters) {
    return;
  }

  const activeLevelGroup = getActiveLevelGroup();
  elements.levelGroupFilters.innerHTML = "";

  LEVEL_GROUPS.forEach((levelGroup) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-group-button";
    button.dataset.levelGroup = levelGroup;
    button.innerHTML = `
      <span>${levelGroup}</span>
      <span class="category-count">${getLevelGroupCount(levelGroup)}</span>
    `;
    button.classList.toggle("is-active", levelGroup === activeLevelGroup);
    button.addEventListener("click", () => selectLevelGroup(levelGroup));
    elements.levelGroupFilters.append(button);
  });
}

function updateCategoryFilterButton(button, category, studentProgressByProblemId) {
  const categoryProgressLabel = getCategoryProgressLabel(category, studentProgressByProblemId);

  button.innerHTML = `
    <span class="category-button-label">
      <span>${category}</span>
    </span>
    <span class="category-count">${getCategoryCount(category)}</span>
    ${categoryProgressLabel}
  `;
  button.classList.toggle("is-active", category === appState.selectedCategory);
}

function handleCategoryChipClick(category) {
  selectCategory(category);
}

function getCategoryFilters() {
  const levelGroup = getActiveLevelGroup();
  const registryNames = getOrderedCategoryNames(readCategories(), { levelGroup });
  const problemNames = [
    ...new Set(
      getProblemsInActiveLevelGroup()
        .map((problem) => problem.category)
        .filter(Boolean),
    ),
  ];

  const orderedNames = [...registryNames];
  problemNames.forEach((name) => {
    if (!orderedNames.includes(name)) {
      orderedNames.push(name);
    }
  });

  return ["전체", ...orderedNames];
}

function selectLevelGroup(levelGroup) {
  appState.selectedLevelGroup = normalizeLevelGroup(levelGroup);
  appState.selectedCategory = "전체";
  syncCreatorCategoriesForLevelGroup();
  renderLevelGroupFilters();
  renderCategoryFilters();
  renderProblemList();
}

function selectCategory(category) {
  appState.selectedCategory = category || "전체";
  renderCategoryFilters();
  renderProblemList();
}

function getActiveLevelGroup() {
  return normalizeLevelGroup(appState.selectedLevelGroup || DEFAULT_LEVEL_GROUP);
}

function getProblemsInActiveLevelGroup() {
  const levelGroup = getActiveLevelGroup();
  return problems.filter((problem) => normalizeLevelGroup(problem.levelGroup) === levelGroup);
}

function getLevelGroupCount(levelGroup) {
  return problems.filter(
    (problem) => normalizeLevelGroup(problem.levelGroup) === normalizeLevelGroup(levelGroup),
  ).length;
}

function syncCreatorCategoriesForLevelGroup() {
  syncCategoryNames(CREATOR_CATEGORIES, readCategories(), {
    levelGroup: getActiveLevelGroup(),
  });
}

function renderProblemList() {
  if (!elements.problemCards) {
    console.warn("[renderProblemList] missing #problem-cards element");
    return;
  }

  updatePrintUiVisibility();

  const filteredProblems = getFilteredProblems();
  const studentProgressByProblemId = getCurrentStudentProgressByProblemId();
  const canPrint = canUsePrintFeatures();
  elements.problemCards.innerHTML = "";
  const categoryLabel =
    appState.selectedCategory && appState.selectedCategory !== "전체"
      ? `${getActiveLevelGroup()} · ${appState.selectedCategory}`
      : `${getActiveLevelGroup()} 전체`;
  elements.listSummary.textContent = `${categoryLabel}에서 ${filteredProblems.length}개 문제를 표시합니다.`;

  if (canPrint) {
    updatePrintSelectionControls();
  }

  if (filteredProblems.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-list-message";
    emptyMessage.textContent = "이 카테고리에는 아직 문제가 없습니다.";
    elements.problemCards.append(emptyMessage);
    return;
  }

  filteredProblems.forEach(({ problem, index }) => {
    try {
      const progressView = getProblemProgressView(problem, studentProgressByProblemId);
      const card = document.createElement("article");
      card.className = "problem-card";
      card.dataset.problemId = problem.id;
      card.dataset.progressStatus = progressView.status;
      card.classList.toggle(
        "is-selected",
        canPrint && appState.selectedPrintProblemIds.has(problem.id),
      );
      const problemNumberLabel = escapeHtml(formatCategoryProblemLabel(problem, problems));
      const categoryLabel = escapeHtml(problem.category ?? "");
      const levelLabel = escapeHtml(problem.level ?? "");
      const hasStatusRow = Boolean(levelLabel || progressView.badge);

      card.innerHTML = `
        <button class="problem-card-main" type="button">
          <div class="problem-card-header">
            <div class="problem-card-meta-row">
              <div class="problem-card-meta-primary">
                <span class="problem-card-number">${problemNumberLabel}</span>
                <span class="problem-category-badge">${categoryLabel}</span>
              </div>
              ${
                canPrint
                  ? `
              <label class="problem-print-select">
                <input type="checkbox" data-print-select />
                <span>인쇄 선택</span>
              </label>`
                  : ""
              }
            </div>
            <div class="problem-card-title-row">
              <h3>${escapeHtml(problem.title ?? "제목 없음")}</h3>
              ${progressView.wrongBadge}
            </div>
            ${
              hasStatusRow
                ? `
            <div class="problem-card-status">
              ${levelLabel ? `<span class="problem-card-level">${levelLabel}</span>` : ""}
              ${progressView.badge}
            </div>`
                : ""
            }
          </div>
          <span class="problem-preview-board" data-preview-index="${index}" aria-hidden="true"></span>
          <p>${escapeHtml(problem.description ?? "")}</p>
        </button>
      `;
      if (canPrint) {
        const printSelect = card.querySelector("[data-print-select]");
        const printSelectLabel = card.querySelector(".problem-print-select");
        if (printSelect) {
          printSelect.checked = appState.selectedPrintProblemIds.has(problem.id);
          printSelect.addEventListener("click", (event) => event.stopPropagation());
          printSelect.addEventListener("change", () => {
            togglePrintProblemSelection(problem.id, printSelect.checked);
            card.classList.toggle("is-selected", printSelect.checked);
          });
        }
        printSelectLabel?.addEventListener("click", (event) => event.stopPropagation());
      }

      card.querySelector(".problem-card-main")?.addEventListener("click", () => selectProblemById(problem.id));

      if (adminState.isEnabled && isCurrentUserAdmin()) {
        const actions = document.createElement("div");
        actions.className = "admin-card-actions";
        actions.innerHTML = `
          <button class="secondary-button" type="button" data-admin-action="edit">수정</button>
          <button class="danger-button" type="button" data-admin-action="delete">삭제</button>
        `;
        actions
          .querySelector('[data-admin-action="edit"]')
          ?.addEventListener("click", () => startEditingProblem(index));
        actions
          .querySelector('[data-admin-action="delete"]')
          ?.addEventListener("click", () => deleteProblem(index));
        card.append(actions);
      }

      elements.problemCards.append(card);
      renderProblemPreviewBoard(card.querySelector(".problem-preview-board"), problem);
    } catch (error) {
      console.error(`[renderProblemList] Failed to render problem card: ${problem?.id ?? index}`, error);
    }
  });

  if (canPrint) {
    updatePrintSelectionControls();
  }
}

function selectProblemById(problemId) {
  const problemIndex = problems.findIndex((problem) => problem.id === problemId);
  if (problemIndex === -1) {
    return;
  }

  loadProblem(problemIndex);
}

function getCurrentStudentProgressByProblemId() {
  const currentUser = getCurrentUser();
  if (normalizeRole(currentUser?.role) !== ROLES.student) {
    return null;
  }

  return new Map(
    studentProgressService
      .getStudentProgressByUserId(currentUser.id)
      .map((progress) => [progress.problemId, progress]),
  );
}

function getProblemProgressView(problem, progressByProblemId) {
  if (!progressByProblemId) {
    return {
      status: "",
      badge: "",
      wrongBadge: "",
    };
  }

  const progress = progressByProblemId.get(problem.id);
  const status = progress ? studentProgressService.getProgressStatus(progress) : PROGRESS_STATUS.notStarted;
  const statusContent = getProblemStatusContent(status);
  const wrongCount = progress?.wrongCount ?? 0;
  const wrongBadge =
    wrongCount > 0 ? `<span class="problem-wrong-badge">오답 ${wrongCount}회</span>` : "";

  return {
    status,
    badge: `
      <span class="problem-progress-badge ${statusContent.className}">
        ${statusContent.label}
      </span>
    `,
    wrongBadge,
  };
}

function getProblemStatusContent(status) {
  const statusContent = {
    [PROGRESS_STATUS.solved]: {
      label: "✅ 완료",
      className: "is-solved",
    },
    [PROGRESS_STATUS.inProgress]: {
      label: "🔄 풀이중",
      className: "is-in-progress",
    },
    [PROGRESS_STATUS.notStarted]: {
      label: "⚪ 미풀이",
      className: "is-not-started",
    },
  };

  return statusContent[status] ?? statusContent[PROGRESS_STATUS.notStarted];
}

function togglePrintProblemSelection(problemId, isSelected) {
  if (!canUsePrintFeatures()) {
    return;
  }

  applyPrintSelection(
    appState.selectedPrintProblemIds,
    [problemId],
    isSelected ? PRINT_SELECTION_MODE.add : PRINT_SELECTION_MODE.remove,
  );
  syncPrintSelectionUi();
}

function syncPrintSelectionUi() {
  if (!canUsePrintFeatures()) {
    return;
  }

  syncPrintCheckboxes();
  updatePrintSelectionControls();
}

function syncPrintCheckboxes() {
  if (!elements.problemCards) {
    return;
  }

  elements.problemCards.querySelectorAll(".problem-card").forEach((card) => {
    const problemId = card.dataset.problemId;
    const isSelected = appState.selectedPrintProblemIds.has(problemId);
    card.classList.toggle("is-selected", isSelected);
    const checkbox = card.querySelector("[data-print-select]");
    if (checkbox) {
      checkbox.checked = isSelected;
    }
  });
}

function updatePrintSelectionControls() {
  if (!canUsePrintFeatures()) {
    return;
  }

  pruneMissingPrintSelections();
  const summary = printBuilder.renderSelectionSummary(
    elements.printSelectionCount,
    appState.selectedPrintProblemIds,
    problems,
    CREATOR_CATEGORIES,
  );

  if (elements.printSelectedButton) {
    elements.printSelectedButton.disabled = summary.total === 0;
  }

  const hasSelection = summary.total > 0;
  elements.printPanel?.classList.toggle("has-print-selection", hasSelection);
  elements.printPanel?.classList.toggle("is-idle", !hasSelection);
  elements.problemListScreen?.classList.toggle("has-print-selection", hasSelection);
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
  return orderProblemsForPrint(problems, appState.selectedPrintProblemIds, CREATOR_CATEGORIES, {
    levelGroup: getActiveLevelGroup(),
  });
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function renderProblemPreviewBoard(element, problem) {
  if (!element || !window.WGo || !Array.isArray(problem?.stones)) {
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
  const levelGroup = getActiveLevelGroup();

  return problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => {
      if (normalizeLevelGroup(problem.levelGroup) !== levelGroup) {
        return false;
      }

      if (!appState.selectedCategory || appState.selectedCategory === "전체") {
        return true;
      }

      return problem.category === appState.selectedCategory;
    });
}

function getCategoryCount(category) {
  const scopedProblems = getProblemsInActiveLevelGroup();

  if (category === "전체") {
    return scopedProblems.length;
  }

  return scopedProblems.filter((problem) => problem.category === category).length;
}

function getCategoryProgressLabel(category, progressByProblemId) {
  if (!progressByProblemId) {
    return "";
  }

  const categoryProblems = getProblemsByCategory(category);
  const solvedCount = categoryProblems.filter((problem) => {
    const progress = progressByProblemId.get(problem.id);
    return progress && studentProgressService.getProgressStatus(progress) === PROGRESS_STATUS.solved;
  }).length;

  return `<span class="category-progress">${solvedCount}/${categoryProblems.length}</span>`;
}

function getProblemsByCategory(category) {
  const scopedProblems = getProblemsInActiveLevelGroup();

  if (category === "전체") {
    return scopedProblems;
  }

  return scopedProblems.filter((problem) => problem.category === category);
}

function isCurrentUserAdmin() {
  return canManageProblems(getCurrentUser());
}

function isAcademyUser() {
  return canManageAcademy(getCurrentUser());
}

function canViewLearningMenu() {
  const currentUser = getCurrentUser();
  return canManageStudents(currentUser) || canViewReviews(currentUser);
}

function canViewAttendanceMenu() {
  return canManageAttendance(getCurrentUser());
}

function canViewPaymentsMenu() {
  return canViewPayments(getCurrentUser());
}

function canAccessAcademyMenu(menuType) {
  const currentUser = getCurrentUser();
  const menuPermissions = {
    learning: canViewLearningMenu(),
    academy: canViewAcademyMenu(currentUser),
    attendance: canManageAttendance(currentUser),
    payments: canViewPayments(currentUser),
  };

  return Boolean(menuPermissions[menuType]);
}

function getCurrentUser() {
  return window.BadukAuth?.getCurrentUser?.() ?? null;
}

function canUsePrintFeatures() {
  return canUsePrintBuilder(getCurrentUser());
}

function updatePrintUiVisibility() {
  const canPrint = canUsePrintFeatures();

  elements.printPanel?.classList.toggle("is-hidden", !canPrint);
  elements.problemListScreen?.classList.toggle("has-print-features", canPrint);

  if (!canPrint) {
    elements.printPanel?.classList.remove("has-print-selection", "is-idle");
    elements.problemListScreen?.classList.remove("has-print-selection");
    return;
  }

  updatePrintSelectionControls();
}

function replaceProblemList(nextProblems) {
  problems.splice(0, problems.length, ...nextProblems);
}

function syncCategoriesFromProblems() {
  syncCategoryRegistryFromProblems(problems);
  syncCreatorCategoriesForLevelGroup();
}

function handleRealtimeProblemUpdate(nextProblems) {
  const currentProblemId = problems[appState.currentProblemIndex]?.id;
  replaceProblemList(nextProblems);
  syncCategoriesFromProblems();
  renderCategoryManager();
  renderCategoryFilters();
  renderCreatorCategoryOptions();
  renderProblemList();

  if (problems.length === 0) {
    showEmptyProblemState();
    return;
  }

  const nextIndex = problems.findIndex((problem) => problem.id === currentProblemId);
  appState.currentProblemIndex = nextIndex === -1 ? 0 : nextIndex;

  if (appState.mode === "solve") {
    loadProblem(appState.currentProblemIndex);
  } else {
  }
}

function getProblemStoreErrorMessage(error, actionLabel) {
  const message = error?.message ?? "";

  if (message.includes("row-level security")) {
    return `Supabase ${actionLabel} 권한 정책이 필요합니다. README의 problems RLS policy SQL을 실행해 주세요.`;
  }

  if (message.includes("delete returned no rows")) {
    return "Supabase 삭제 권한이 적용되지 않아 실제로 삭제된 문제가 없습니다. README의 delete_problem SQL을 실행해 주세요.";
  }

  if (message.includes("correct_move") || message.includes("correct_sequence")) {
    return "Supabase problems 테이블에 correct_move/correct_sequence 컬럼이 필요합니다.";
  }

  if (message.includes("column")) {
    return `Supabase problems 테이블 컬럼 설정을 확인해 주세요: ${message}`;
  }

  return `Supabase 문제 ${actionLabel}에 실패했습니다.`;
}

function cloneBoardStones(stones = []) {
  return stones.map((stone) => ({ ...stone }));
}

function captureInitialBoardState(problem) {
  appState.initialBoardStones = cloneBoardStones(problem?.stones ?? []);
  return appState.initialBoardStones;
}

function cloneProblem(problem) {
  const clonedProblem = {
    ...problem,
    levelGroup: normalizeLevelGroup(problem.levelGroup),
    type: problem.type === "ox" ? "ox" : "board",
    correctMove: problem.correctMove ? { ...problem.correctMove } : null,
    stones: cloneBoardStones(problem.stones),
  };

  if (clonedProblem.type === "ox") {
    clonedProblem.oxAnswer = Boolean(problem.oxAnswer);
  }

  if (Array.isArray(problem.correctSequence)) {
    clonedProblem.correctSequence = problem.correctSequence.map((move) => ({ ...move }));
  }

  return clonedProblem;
}

function buildStudentProgressMap(extraProgress = null) {
  const currentUser = getCurrentUser();
  if (!currentUser?.id || normalizeRole(currentUser?.role) !== ROLES.student) {
    return null;
  }

  const progressMap = new Map(
    studentProgressService
      .getStudentProgressByUserId(currentUser.id)
      .map((progress) => [progress.problemId, progress]),
  );

  if (extraProgress?.problemId) {
    progressMap.set(extraProgress.problemId, extraProgress);
  }

  return progressMap;
}

function buildCategoryCompletionContext(categoryName, levelGroup, progressByProblemId = null) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const resolvedProgressMap = progressByProblemId ?? buildStudentProgressMap();
  const row = getCategoryProgressRow(categoryName, problems, resolvedProgressMap, {
    levelGroup: normalizedLevelGroup,
  });
  if (!row.isComplete) {
    return null;
  }

  const reviewOffer = getReviewOffer(categoryName, problems, resolvedProgressMap, {
    levelGroup: normalizedLevelGroup,
  });
  const nextCategoryName = getNextCategoryName(categoryName, readCategories(), {
    levelGroup: normalizedLevelGroup,
  });
  const nextProblem = nextCategoryName
    ? getNextProblemForCategory(nextCategoryName, problems, resolvedProgressMap, {
        levelGroup: normalizedLevelGroup,
      })
    : null;

  return {
    categoryName,
    levelGroup: normalizedLevelGroup,
    totalCount: row.total,
    reviewOffer,
    nextCategoryName,
    nextProblem,
  };
}

function showCategoryCompleteModal(context) {
  appState.pendingCategoryCompletion = context;
  categoryCompleteModal.show(context);
}

function hideCategoryCompleteModal() {
  categoryCompleteModal.hide();
  appState.pendingCategoryCompletion = null;
}

function handleCategoryCompleteAction(action) {
  const context = appState.pendingCategoryCompletion;
  categoryCompleteModal.hide();
  appState.pendingCategoryCompletion = null;

  if (!context) {
    return;
  }

  if (action === "review") {
    if (context.reviewOffer) {
      startReviewSession(context.categoryName, context.levelGroup);
    }
    return;
  }

  if (action === "next") {
    if (context.nextProblem) {
      loadProblem(context.nextProblem.index);
    } else {
      showStudyMode();
    }
    return;
  }

  if (action === "later") {
    showStudyMode();
  }
}

function completeProblem(problem) {
  const levelGroup = normalizeLevelGroup(problem.levelGroup);
  const progressBeforeSolve = buildStudentProgressMap();
  const wasCategoryCompleteBefore = getCategoryProgressRow(
    problem.category,
    problems,
    progressBeforeSolve,
    { levelGroup },
  ).isComplete;

  hideWrongModal();
  appState.isSolved = true;
  syncBoardPreviewContext();
  solveView.renderProblemSolveMode(problem);
  let savedProgress = null;
  safeRecordStudentProgress(() => {
    savedProgress = studentProgressService.markProblemSolved({
      user: getCurrentUser(),
      problem,
    });
  });
  const progressAfterSolve = buildStudentProgressMap(savedProgress);
  setStatus("정답입니다.");
  setFeedback(
    isOxProblem(problem)
      ? "정답입니다! 판정이 맞습니다."
      : "좋습니다! 핵심 급소를 정확히 찾았습니다.",
    "correct",
  );
  logSgfForExtension(problem);

  if (appState.reviewSession) {
    safeRecordStudentProgress(() => {
      studentProgressService.markReviewResolved({
        user: getCurrentUser(),
        problem,
      });
    });
    const nextReviewProblem = getNextReviewProblemInSession();
    showAnswerModal(
      nextReviewProblem
        ? "정답입니다. 1초 후 다음 복습 문제로 이동합니다."
        : "정답입니다. 복습을 마쳤습니다.",
      !nextReviewProblem,
    );

    if (nextReviewProblem) {
      appState.autoNextTimeout = window.setTimeout(() => {
        hideAnswerModal();
        loadReviewProblem(appState.reviewSession.currentIndex + 1);
      }, 1000);
    } else {
      appState.autoNextTimeout = window.setTimeout(() => {
        hideAnswerModal();
        clearReviewSession();
        showStudyMode();
      }, 1000);
    }
    return;
  }

  const completionContext = !wasCategoryCompleteBefore
    ? buildCategoryCompletionContext(problem.category, levelGroup, progressAfterSolve)
    : null;

  if (completionContext) {
    clearAutoNext();
    hideAnswerModal();
    showCategoryCompleteModal(completionContext);
    renderStudyScreen();
    return;
  }

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

function recordWrongMove(problem, move) {
  safeRecordStudentProgress(() => {
    studentProgressService.recordWrongMove({
      user: getCurrentUser(),
      problem,
      move,
      moveNumber: appState.playedMoves.length,
    });
  });
}

function safeRecordStudentProgress(record) {
  try {
    record();
  } catch (error) {
    console.error("학습 기록 저장 중 오류가 발생했습니다.", error);
  }
}

function resetCurrentProblemAfterWrongMove(problem) {
  appState.isAiThinking = true;
  syncBoardPreviewContext();
  solveView.renderProblemSolveMode(problem);
  setStatus("오답입니다.");
  setFeedback(
    isOxProblem(problem)
      ? "오답입니다. O/X 중 다시 선택해 보세요."
      : "오답 착수를 확인한 뒤 문제가 초기 상태로 돌아갑니다.",
    "wrong",
  );

  clearWrongTimers();
  appState.wrongResetTimeout = window.setTimeout(() => {
    appState.wrongResetTimeout = null;
    showWrongModal(problem, () => restoreProblemInitialStateAfterWrong(problem));
  }, 150);
}

function restoreProblemInitialStateAfterWrong(problem) {
  appState.solvedAnswerKeys = new Set();
  appState.playedMoves = [];
  appState.isAiThinking = false;

  if (isOxProblem(problem)) {
    syncBoardPreviewContext();
    solveView.renderProblemSolveMode(problem);
    setStatus("O/X 판정");
    setFeedback("오답입니다. O/X 중 다시 선택해 보세요.", "wrong");
    return;
  }

  boardController.clearAnswerMarker();
  boardController.loadPosition(cloneBoardStones(appState.initialBoardStones ?? problem.stones));
  syncBoardPreviewContext();
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

function showWrongModal(problem, onHidden) {
  if (elements.wrongModalMessage) {
    elements.wrongModalMessage.textContent = isOxProblem(problem)
      ? "O/X 중 다시 선택해 보세요."
      : "문제가 초기 상태로 돌아갑니다. 다시 시도해 보세요.";
  }

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

function getProblemStartFeedback(problem) {
  if (isOxProblem(problem)) {
    return "O/X 중 정답을 선택하세요.";
  }

  const sequence = getProblemCorrectSequence(problem);
  if (sequence.length > 1) {
    return `활로 문제입니다. 흑 정답 수순 ${sequence.length}수를 이어서 두세요.`;
  }

  return "첫 수를 선택해 보세요.";
}

function bindOxSolveEvents() {
  elements.oxSolveButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      handleOxAnswer(button.dataset.oxAnswer === "true");
    });
  });
}

function removeCapturedStonesAfterMove(move) {
  const stones = boardController.getStones();
  const result = calculateStonesAfterCapture(stones, move, {
    boardSize: BOARD_SIZE,
    stoneColors: STONE,
  });

  if (result.capturedCount > 0) {
    boardController.setStones(result.stones);
  }
  return result.capturedCount;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function setFeedback(message, tone = "neutral") {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle("is-correct", tone === "correct");
  elements.feedback.classList.toggle("is-wrong", tone === "wrong");
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
