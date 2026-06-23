import { createAcademyInviteController } from "./academy/invite.js";
import { createAcademyMemberController } from "./academy/members.js";
import { createCategoryManagerController } from "./admin/category-manager.js";
import { createAdminEditorController } from "./admin/editor.js";
import { createAcademyController } from "./controllers/academy-controller.js";
import { createAdminController } from "./controllers/admin-controller.js";
import { createPlatformAdminController } from "./controllers/platform-admin-controller.js";
import { createProblemCreatorController } from "./controllers/create-controller.js";
import { bindSolveController } from "./controllers/solve-controller.js";
import { academyElements } from "./dom/academy-elements.js";
import { adminElements } from "./dom/admin-elements.js";
import { platformAdminElements } from "./dom/platform-admin-elements.js";
import { problemElements } from "./dom/problem-elements.js";
import { removeCapturedStonesAfterMove as calculateStonesAfterCapture } from "./game/capture.js";
import { sanitizeStones, isValidBoardPoint } from "./game/board-point-validation.js";
import { getBoardSizeLabel, getProblemBoardSize } from "./game/board-size.js";
import {
  applyCandidateLabelsToWgoBoard,
  cloneCandidateLabels,
  getProblemCandidateLabels,
} from "./game/candidate-labels.js";
import { evaluatePlacement, PLACEMENT_STATUS } from "./game/placement-validation.js";
import { isSamePoint } from "./game/rules.js";
import {
  isAiResponseProblem,
  logAiResponseSolveContext,
  shouldUseAiResponseSolve,
  shouldUseAiResponseUx,
} from "./game/problem-mode.js";
import { createAiResponseSolveEngine } from "./solve/ai-response-solve/engine.js";
import {
  logAiResponseSessionSnapshot,
  logLearningFlow,
  logStudyPathDiagnostics,
} from "./solve/ai-response-solve/respond-diagnostics.js";
import {
  buildStudySolvePath,
  getNextUnsolvedInStudyPath,
  getRemainingUnsolvedProblemIds,
  isActuallyLastProblemInStudyPath,
} from "./services/study-solve-path-service.js";
import { AI_RESPONSE_UX_MESSAGES } from "./solve/ai-response-ux/config.js";
import { isOxProblem } from "./game/problem-type.js";
import { createAiResponseUxController } from "./solve/ai-response-ux/controller.js";
import { advanceCorrectSequence, getProblemCorrectSequence } from "./game/sequence.js";
import { isCorrectMove, isCorrectOxAnswer, isCorrectUserMove } from "./game/validation.js";
import {
  canManageAcademy,
  canManageAttendance,
  canManageProblems,
  canEnterAdminMode,
  canViewAcademyMenu,
  canViewAcademySubmenu,
  canViewLearningMenu,
  canViewPayments,
  canViewPlatformAdminMenu,
  canUsePrintBuilder,
  isPlatformAdmin,
  normalizeRole,
  ROLES,
} from "./permissions/permission-service.js";
import { createProblemPrintController } from "./problem/print.js";
import {
  getDefaultCategoryNameForLevelGroup,
  getNextCategoryName,
  getOrderedCategoryNames,
  hydrateCategoryRegistry,
  initializeCategoryRegistry,
  readCategories,
  syncCategoriesFromProblems as syncCategoryRegistryFromProblems,
  syncCategoryNames,
} from "./services/category-service.js";
import { formatCategoryProblemLabel } from "./services/category-problem-number.js";
import { createProblemReorderController } from "./admin/problem-reorder-manager.js";
import { createGradeAssignmentManager } from "./admin/grade-assignment-manager.js";
import { createAiResponseQaBatchController } from "./admin/ai-response-qa-batch-controller.js";
import { createExamSetManager } from "./admin/exam-set-manager.js";
import { createExamCatalogController } from "./controllers/exam-catalog-controller.js";
import { examSetService } from "./services/exam-set-service.js";
import { EXAM_SET_ROLE, EXAM_SET_TYPE } from "./services/exam-set-constants.js";
import { mockTestAttemptService } from "./services/mock-test-attempt-service.js";
import {
  getGradeLevelFilterOptions,
  getGradeLevelSelectOptions,
  matchesGradeLevelFilter,
  formatGradeLevelLabel,
  GRADE_LEVELS,
  normalizeGradeLevelCode,
} from "./services/grade-level-service.js";
import {
  PROBLEM_LIST_SORT,
  sortFilteredProblemEntries,
  sortProblemsGlobally,
} from "./services/problem-order-service.js";
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
import {
  DEBUG_CHANNELS,
  DEBUG_SOURCES,
  debugError,
  debugFetch,
  debugLog,
  debugSync,
} from "./bootstrap/debug-logs.js";
import { createBootLogger, safeOn } from "./bootstrap/boot-logger.js";
import {
  getCategoryProgressRow,
  getCurrentLearningFlow,
  getNextProblemForCategory,
  getProblemsInCategoryOrder,
  getStudyCurriculumTree,
  resolveActiveLevelGroupFromProgress,
} from "./services/learning-flow-service.js";
import {
  completeCategoryReviewOffer,
  dismissCategoryReviewOffer,
  ensureCategoryReviewOfferFromReviewOffer,
} from "./services/category-review-offer-service.js";
import {
  buildReviewQueue,
  getReviewOffer,
  getPersistentReviewOffersForLevel,
} from "./services/review-service.js";
import { problemService } from "./services/problem-service.js";
import { resolveAcademyScopeId } from "./services/academy-service.js";
import { getStudentCurriculumOverview } from "./services/student-curriculum-progress-service.js";
import { getStudentProjectedGradeSummary } from "./services/student-growth-report-service.js";
import { fetchStudentOfficialGrade } from "./services/student-official-grade-service.js";
import {
  invalidateStudentProgressHydrateCache,
  PROGRESS_STATUS,
  studentProgressService,
} from "./services/student-progress-service.js";
import { adminState } from "./state/admin-state.js";
import { appState } from "./state/app-state.js";
import { createCreatorState } from "./state/creator-state.js";
import { createAcademyView } from "./views/academy-view.js";
import { createAttendanceView } from "./views/attendance-view.js";
import { createAdminView } from "./views/admin-view.js";
import { createPlatformAdminView } from "./views/platform-admin-view.js";
import { createExamView } from "./views/exam-view.js";
import { createProblemCreatorView } from "./views/create-view.js";
import { createSolveView } from "./views/solve-view.js";
import { createBoardFeedbackOverlay } from "./ui/board-feedback-overlay.js";
import { createCategoryCompleteModalController } from "./ui/category-complete-modal-controller.js";
import { createMockTestUi } from "./ui/mock-test-ui.js";
import { createStudyView } from "./views/study-view.js";
import { renderMockTestResultsTableHtml } from "./views/mock-test-results-view.js";
import { buildPromotionPaperPagesHtml } from "./views/promotion-paper-view.js";
import { computeMockTestTiming } from "./utils/mock-test-time.js";
import { mockTestLeaveGuard } from "./mock-test/mock-test-leave-guard.js";
import {
  examSetLearningProgressService,
  isResumableLearningProgress,
} from "./services/exam-set-learning-progress-service.js";
import { createExamSetResumeUi } from "./ui/exam-set-resume-ui.js";

const { BoardController } = window.BadukBoard;
const { BOARD_SIZE, ProblemStore, problems, STONE } = window.BadukProblems;
const { createProblemSgf } = window.BadukSgf;

const CREATOR_CATEGORIES = [];
const elements = {
  ...problemElements,
  ...adminElements,
  ...academyElements,
  ...platformAdminElements,
};

if (!window.WGo) {
  elements.feedback.textContent =
    "WGo.js를 불러오지 못했습니다. 인터넷 연결 또는 CDN 접근을 확인해 주세요.";
  throw new Error("WGo.js failed to load.");
}

const creatorState = createCreatorState(CREATOR_CATEGORIES);

const boardFeedbackOverlay = createBoardFeedbackOverlay({
  overlayLayer: elements.boardOverlayLayer,
  messageLayer: elements.feedbackMessageLayer,
  contentEl: elements.boardFeedbackContent,
  titleEl: elements.boardFeedbackTitle,
  subtitleEl: elements.boardFeedbackSubtitle,
  characterSlot: elements.boardCharacterLayer,
  speechSlot: elements.boardSpeechLayer,
  studyLayout: elements.studyLayout,
});

const examSetResumeUi = createExamSetResumeUi({
  modal: elements.examSetResumeModal,
  titleEl: elements.examSetResumeTitle,
  bodyEl: elements.examSetResumeBody,
  resumeButton: elements.examSetResumeContinueButton,
  restartButton: elements.examSetResumeRestartButton,
  cancelButton: elements.examSetResumeCancelButton,
});

const mockTestUi = createMockTestUi({
  startModal: elements.mockTestStartModal,
  startTitle: elements.mockTestStartTitle,
  startBody: elements.mockTestStartBody,
  startCancelButton: elements.mockTestStartCancelButton,
  startConfirmButton: elements.mockTestStartConfirmButton,
  resultModal: elements.mockTestResultModal,
  resultTitle: elements.mockTestResultTitle,
  resultSubtitle: elements.mockTestResultSubtitle,
  resultScore: elements.mockTestResultScore,
  resultWrong: elements.mockTestResultWrong,
  resultDuration: elements.mockTestResultDuration,
  resultOvertime: elements.mockTestResultOvertime,
  resultViewButton: elements.mockTestResultViewButton,
  resultCloseButton: elements.mockTestResultCloseButton,
  timerRoot: elements.mockTestTimer,
  timerLabel: elements.mockTestTimerLabel,
  timerValue: elements.mockTestTimerValue,
});

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

let aiResponseUx;
let aiResponseSolve;

function getBoardPreviewColor() {
  if (appState.mode === "solve" && aiResponseUx?.isPickingWhiteResponse?.()) {
    return aiResponseUx.getPreviewColor();
  }

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

  if (appState.mode === "solve" && aiResponseUx?.isPickingWhiteResponse?.()) {
    const preview = aiResponseUx.evaluatePreviewPoint(point, stones);
    if (preview.status === "legal") {
      return { status: PLACEMENT_STATUS.legal };
    }
    if (preview.status === "occupied") {
      return { status: PLACEMENT_STATUS.occupied };
    }
    return { status: PLACEMENT_STATUS.illegal };
  }

  if (appState.mode === "solve") {
    const color = getBoardPreviewColor();
    return evaluatePlacement(
      stones,
      { ...point, color },
      { boardSize: boardController.size, stoneColors: STONE },
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
  const aiResponsePicking = appState.mode === "solve" && aiResponseUx?.isPickingWhiteResponse?.();
  const enabled =
    !isOxSolve &&
    (appState.mode === "solve" || appState.mode === "create") &&
    !appState.isSolved &&
    !appState.isAiThinking &&
    (!aiResponseUx?.isActive?.() || aiResponsePicking);

  elements.boardCard?.classList.toggle("is-ai-response-mode", Boolean(aiResponseUx?.isActive?.()));
  elements.aiResponseUxPanel?.classList.toggle(
    "is-picking",
    Boolean(aiResponseUx?.isPickingWhiteResponse?.()),
  );

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
let problemBankReady = false;
const setMode = (mode) => {
  solveView.setMode(mode);
  syncBoardPreviewContext();
  void renderStudentGradeSummaryCard();
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

const { renderAttendancePanel, bindAttendanceEvents, hideAttendancePanel } = createAttendanceView({
  elements,
  getCurrentUser,
  escapeHtml,
});

let printReviewProblemsForAcademy = null;

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
  printReviewProblems: (...args) => printReviewProblemsForAcademy?.(...args),
  openProblemInLibrary: (problemId) => {
    const problem = problems.find((item) => item.id === problemId);
    if (!problem) {
      return;
    }

    appState.selectedLevelGroup = normalizeLevelGroup(problem.levelGroup);
    appState.selectedCategory =
      problem.category || resolveDefaultSelectedCategory(appState.selectedLevelGroup);
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

const {
  printSelectedProblems: runPrintSelectedProblems,
  printExplicitProblems: runPrintExplicitProblems,
} = createProblemPrintController({
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

function printReviewProblems(problemIds, { title, onAfterPrint } = {}) {
  const idSet = new Set(problemIds.filter(Boolean));
  const selectedProblems = orderProblemsForPrint(problems, idSet, CREATOR_CATEGORIES, {});

  if (selectedProblems.length === 0) {
    setFeedback("인쇄할 문제를 찾을 수 없습니다.", "wrong");
    return;
  }

  runPrintExplicitProblems(selectedProblems, {
    titleOverride: title,
    onAfterPrint,
    printFormat: "detailed",
    feedbackMessage: `선택한 ${selectedProblems.length}개 오답 문제를 인쇄합니다.`,
  });
}

printReviewProblemsForAcademy = printReviewProblems;

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

const problemReorder = createProblemReorderController({
  elements,
  problems,
  problemService,
  ProblemStore,
  adminState,
  appState,
  getActiveLevelGroup,
  getFilteredProblems: () => getFilteredProblems(),
  getCurrentUser,
  requireAdminMode: () => requireAdminModeForGrades(),
  setFeedback,
  renderProblemList: () => renderProblemList(),
  escapeHtml,
});

function requireAdminModeForGrades() {
  if (adminState.isEnabled && isCurrentUserAdmin()) {
    return true;
  }

  setFeedback("관리자로 로그인한 경우에만 관리자 기능을 사용할 수 있습니다.", "wrong");
  return false;
}

const {
  bindGradeAssignmentEvents,
  renderGradeAssignmentPanel,
  resetSelectionOnCategoryChange: resetGradeAssignmentSelection,
  isGradeAssignmentMode,
  isProblemSelectedForGrade,
  matchesGradeAssignmentListFilter,
  updateGradeSummaryText,
} = createGradeAssignmentManager({
  elements,
  adminState,
  appState,
  problems,
  problemService,
  ProblemStore,
  getActiveLevelGroup,
  getCurrentUser,
  isCurrentUserAdmin,
  requireAdminMode: requireAdminModeForGrades,
  setFeedback,
  escapeHtml,
  getFilteredProblems: () => getFilteredProblems(),
  renderProblemList: () => renderProblemList(),
  reloadProblemsFromStore: async () => {
    const loadedProblems = await ProblemStore.loadProblems({ seedDefaults: false });
    replaceProblemList(loadedProblems);
  },
  getProblemStoreErrorMessage,
});

const {
  bindExamSetEvents,
  bindExamSetCardEvents,
  renderExamSetManager,
  loadExamSets,
  isExamSetPickerMode,
  isProblemSelectedForExamSetAdd,
  isProblemInExamSet,
  getExamSetPickerFilteredProblems,
} = createExamSetManager({
  elements,
  adminState,
  appState,
  problems,
  getCurrentUser,
  requireAdminMode: requireAdminModeForGrades,
  setFeedback,
  escapeHtml,
  getOrderedCategoryNames: () => getOrderedCategoryNames(readCategories()),
  renderProblemList: () => renderProblemList(),
  onExamSetSaved: async () => {
    await examCatalog.refreshExamCatalog();
  },
});

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
  renderGradeAssignmentPanel,
  renderExamSetManager,
});

const {
  bindAdminEvents,
  updateAdminVisibility,
  requireAdminMode,
  handleAdminProblemSaved,
  startEditingProblem,
  deleteProblem,
  updateProblemSortModeUi,
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
  getProblemSortHintMessage: () => problemReorder.getSortModeHintMessage(),
  renderGradeAssignmentPanel,
  resetGradeAssignmentSelection,
  renderExamSetManager,
  loadExamSets,
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

const {
  bindAiResponseQaBatchEvents,
  updateAiResponseQaBatchUi,
} = createAiResponseQaBatchController({
  elements,
  adminState,
  appState,
  problems,
  boardSize: BOARD_SIZE,
  stoneColors: STONE,
  getActiveLevelGroup,
  requireAdminMode: requireAdminModeForGrades,
  setFeedback,
  escapeHtml,
});

const platformAdminView = createPlatformAdminView({
  elements,
  escapeHtml,
});

let updatePlatformAdminMenuVisibility = () => {};

const academyView = createAcademyView({
  elements,
  appState,
  getCurrentUser,
  canViewLearningMenu: () => canViewLearningMenu(getCurrentUser()),
  canViewAcademyMenu: () => canViewAcademyMenu(getCurrentUser()),
  canViewAcademySubmenu: (section) => canViewAcademySubmenu(getCurrentUser(), section),
  canViewAttendanceMenu,
  canViewPaymentsMenu,
  canViewPlatformAdminMenu: () => canViewPlatformAdminMenu(getCurrentUser()),
  updatePlatformAdminMenuVisibility: () => updatePlatformAdminMenuVisibility(),
  showSolveMode,
  showListMode,
  renderInviteCodes,
  renderAcademyStudents,
  renderTeacherManagement,
  renderStudentAccounts,
  renderAttendancePanel,
  hideAttendancePanel,
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

const platformAdminController = createPlatformAdminController({
  elements,
  appState,
  setMode,
  getCurrentUser,
  canViewPlatformAdminMenu: () => canViewPlatformAdminMenu(getCurrentUser()),
  setFeedback,
  platformAdminView,
  updateAcademyMenuVisibility,
});

const { showPlatformAdminMenu, bindPlatformAdminEvents } = platformAdminController;

updatePlatformAdminMenuVisibility = platformAdminController.updatePlatformAdminMenuVisibility;

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

const examCatalog = createExamCatalogController({
  elements,
  appState,
  getCurrentUser,
  escapeHtml,
  onStartExamSet: (examSet) => {
    if (examSet?.type === EXAM_SET_TYPE.mockTest) {
      mockTestUi.showStartConfirm({
        examTitle: examSet.title,
        questionCount: examSet.questionCount ?? 0,
        onConfirm: () => {
          void startExamSetSession(examSet);
        },
      });
      return;
    }
    void beginQuestionBankExamSet(examSet);
  },
  onPreviewExamSet: (examSet) => {
    void openExamSetQuestionPreview(examSet);
  },
  onShowMockResults: (examSet) => showMockTestResults(examSet),
  onHideMockResults: () => hideMockTestResults(),
});

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
  renderProblemLibraryScreen: () => renderProblemLibraryScreen(),
});

aiResponseUx = createAiResponseUxController({
  appState,
  boardController,
  boardSize: BOARD_SIZE,
  stoneColors: STONE,
  elements,
  getCurrentProblem,
  setStatus,
  setFeedback,
  syncBoardPreviewContext,
  removeCapturedStonesAfterMove,
  cloneBoardStones,
  getBoardCandidateLabels,
});
aiResponseUx.bindEvents();

aiResponseSolve = createAiResponseSolveEngine({
  appState,
  boardController,
  boardSize: BOARD_SIZE,
  stoneColors: STONE,
  getCurrentProblem,
  setStatus,
  setFeedback,
  syncBoardPreviewContext,
  removeCapturedStonesAfterMove,
  recordWrongMove,
  completeProblem,
  resetCurrentProblemAfterWrong: resetCurrentProblemAfterWrongMove,
  finishWrongReveal: finishAiResponseWrongReveal,
  cloneBoardStones,
  getBoardCandidateLabels,
  markProblemInProgress: (problem) => {
    safeRecordStudentProgress(() => {
      studentProgressService.markProblemInProgress({
        user: getCurrentUser(),
        problem,
      });
    });
  },
});
const categoryCompleteModal = createCategoryCompleteModalController({
  elements,
  onAction: handleCategoryCompleteAction,
});

let authSessionNotifyFrame = 0;
let studentProgressHydrateUserId = null;
let studentProgressHydratePromise = null;

window.BadukAppHooks = {
  onAuthSessionChanged() {
    if (authSessionNotifyFrame) {
      window.cancelAnimationFrame(authSessionNotifyFrame);
    }

    authSessionNotifyFrame = window.requestAnimationFrame(() => {
      authSessionNotifyFrame = 0;
      invalidateStudentProgressHydrateCache();
      updateAcademyMenuVisibility();
      updateAdminVisibility();
      void refreshStudentProgressFromRemote().then(() => {
        refreshScreensAfterProgressSync();
      });
      if (appState.mode === "academy" || appState.mode === "learning") {
        refreshAcademyMemberView();
      }
    });
  },
};

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
    boot.run("bindAttendanceEvents", () => bindAttendanceEvents());
    boot.run("bindInviteCodeEvents", () => bindInviteCodeEvents());
    boot.run("bindAcademyEvents", () => bindAcademyEvents());
    boot.run("bindPlatformAdminEvents", () => bindPlatformAdminEvents());
    boot.run("bindCreateEvents", () => bindCreateEvents());
    boot.run("bindOxSolveEvents", () => bindOxSolveEvents());
    boot.run("bindAdminEvents", () => bindAdminEvents());
    boot.run("bindProblemReorderEvents", () => problemReorder.bindProblemReorderEvents());
    boot.run("bindGradeAssignmentEvents", () => bindGradeAssignmentEvents());
    boot.run("bindAiResponseQaBatchEvents", () => bindAiResponseQaBatchEvents());
    boot.run("bindExamSetEvents", () => bindExamSetEvents());
    boot.run("bindExamSetCardEvents", () => bindExamSetCardEvents());
    boot.run("bindExamCatalogEvents", () => examCatalog.bindExamCatalogEvents());
    boot.run("bindAdminProblemListControls", () => bindAdminProblemListControls());
    boot.run("populateAdminGradeSelects", () => populateAdminGradeSelects());
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
        debugFetch(DEBUG_CHANNELS.problem, "load start", { source: DEBUG_SOURCES.supabase });
        const migrationResult = await ProblemStore.migrateLegacyProblems();
        if (migrationResult.migratedCount > 0) {
          debugSync(DEBUG_CHANNELS.problem, "legacy problems migrated", {
            source: DEBUG_SOURCES.localCache,
            count: migrationResult.migratedCount,
          });
        }
        const loadedProblems = await ProblemStore.loadProblems();
        replaceProblemList(loadedProblems);
        debugFetch(DEBUG_CHANNELS.problem, `loaded count=${loadedProblems.length}`, {
          source: DEBUG_SOURCES.supabase,
        });
        ProblemStore.subscribe(handleRealtimeProblemUpdate);
        if (migrationResult.migratedCount > 0) {
          setFeedback(
            `기존 로컬 문제 ${migrationResult.migratedCount}개를 Supabase로 이전했습니다.`,
            "correct",
          );
        }
      } catch (error) {
        debugError(DEBUG_CHANNELS.problem, "load failed — using defaults", {
          source: DEBUG_SOURCES.fallback,
          message: error?.message,
        });
        console.error("Failed to load Supabase problems.", error);
        const defaults = ProblemStore.getDefaultProblems();
        replaceProblemList(defaults);
        debugFetch(DEBUG_CHANNELS.problem, `loaded count=${defaults.length}`, {
          source: DEBUG_SOURCES.fallback,
        });
        setFeedback("Supabase 문제 데이터를 불러오지 못해 기본 문제를 표시합니다.", "wrong");
      }
    });

    await boot.runAsync("hydrateCategoryRegistry", () => hydrateCategoryRegistry());
    await boot.runAsync("hydrateStudentProgress", () => refreshStudentProgressFromRemote({ force: true }));
    problemBankReady = true;
    boot.run("syncCategoriesFromProblems", () => syncCategoriesFromProblems());
    boot.run("renderCategoryManager", () => renderCategoryManager());
    boot.run("renderCreatorCategoryOptions", () => renderCreatorCategoryOptions());
    boot.run("updateAcademyMenuVisibility", () => updateAcademyMenuVisibility());
    boot.run("updateAdminVisibility", () => updateAdminVisibility());
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
      problemBankReady = true;
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
        const isContinue = startButton.classList.contains("study-flow-continue-button");
        if (isContinue) {
          startProblemFromStudyHub(problemIndex, { source: "study-continue" });
        } else {
          loadProblem(problemIndex, { source: "study-recommend" });
        }
      }
      return;
    }

    const dismissReviewButton = event.target.closest("[data-dismiss-review-category]");
    if (dismissReviewButton) {
      const currentUser = getCurrentUser();
      if (currentUser?.id) {
        dismissCategoryReviewOffer({
          userId: currentUser.id,
          categoryName: dismissReviewButton.dataset.dismissReviewCategory,
          levelGroup: dismissReviewButton.dataset.reviewLevelGroup,
        });
        renderStudyScreen();
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

  elements.promotionPaperPrintButton?.addEventListener("click", () => {
    void runPromotionPaperPrint();
  });
  elements.promotionPaperCloseButton?.addEventListener("click", () => {
    clearPromotionPaperPrintModeClasses();
    clearPromotionPaperPageStyle();
    showListMode();
  });
  window.addEventListener("beforeprint", () => {
    const paperVisible = !elements.promotionPaperScreen?.classList.contains("is-hidden");
    if (!paperVisible) {
      return;
    }

    const monochrome = isPromotionPaperMonochromePrintEnabled();
    setPromotionPaperPrintModeClasses({ monochrome });
    ensurePromotionPaperPageStyle();
    preparePromotionPaperPrintBoardsSync(elements.promotionPaperQuestions, { monochrome });
  });
  window.addEventListener("afterprint", () => {
    const paperVisible = !elements.promotionPaperScreen?.classList.contains("is-hidden");
    clearPromotionPaperPrintModeClasses();
    clearPromotionPaperPageStyle();
    if (paperVisible) {
      mountPromotionPaperBoards(elements.promotionPaperQuestions);
    }
  });
}

function ensurePromotionPaperPageStyle() {
  if (document.querySelector("#promotion-paper-page-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "promotion-paper-page-style";
  style.textContent = "@media print { @page { size: A4 portrait; margin: 8mm; } }";
  document.head.append(style);
}

function clearPromotionPaperPageStyle() {
  document.querySelector("#promotion-paper-page-style")?.remove();
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
  hideAttendancePanel?.();
  clearReviewSession();
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  ensureDefaultCategorySelection();
  appState.mode = "list";
  setMode("list");
  studyView.clearStudyHubMeta();
  elements.meta.textContent = "Problem Library";
  elements.title.textContent = "문제은행";
  elements.description.textContent =
    "카테고리별로 문제를 살펴보고 학습할 문제를 선택하세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "학습할 문제를 선택하세요";
  void renderStudentGradeSummaryCard();
}

function ensureProblemLibraryElements() {
  elements.problemLibraryBody = document.querySelector("#problem-library-body");
  elements.categoryFilterStack = document.querySelector(
    "#problem-library-body .category-filter-stack",
  );
  elements.levelGroupFilters = document.querySelector("#level-group-filters");
  elements.categoryFilters = document.querySelector("#category-filters");
  elements.problemCards = document.querySelector("#problem-cards");
}

function syncProblemLibraryChrome() {
  ensureProblemLibraryElements();
  elements.problemLibraryBody?.classList.remove("is-hidden");
  elements.categoryFilterStack?.classList.remove("is-hidden");
  elements.levelGroupFilters?.classList.remove("is-hidden");
  elements.categoryFilters?.classList.remove("is-hidden");
  elements.problemCards?.classList.remove("is-hidden");
  updatePrintUiVisibility();
  updateAdminVisibility();
  updateAdminProblemListControlsVisibility();
  updateAiResponseQaBatchUi?.();
  if (adminState.listPanel === "grades") {
    renderGradeAssignmentPanel();
  }
}

function renderProblemLibraryScreen() {
  if (!problemBankReady) {
    return;
  }

  try {
    ensureDefaultCategorySelection();
    ensureProblemLibraryElements();

    if (!elements.levelGroupFilters) {
      console.warn("[problem-library] missing #level-group-filters");
      return;
    }

    syncProblemLibraryChrome();
    renderCategoryFilters();
    void examCatalog.refreshExamCatalog();
    renderProblemList();
  } catch (error) {
    console.error("[problem-library] renderProblemLibraryScreen failed", error);
  }
}

function refreshProblemBank() {
  logScreen("refreshProblemBank", { problemCount: problems.length });
  studyView.clearStudyHubMeta();
  ensureDefaultCategorySelection();
  appState.mode = "list";
  setMode("list");

  if (!problemBankReady) {
    return;
  }

  logScreen("renderProblemLibraryScreen");
  elements.meta.textContent = "Problem Library";
  elements.title.textContent = "문제은행";
  elements.description.textContent =
    "카테고리별로 문제를 살펴보고 학습할 문제를 선택하세요.";
  elements.description.classList.remove("is-hidden");
  elements.learningObjective.textContent = "학습할 문제를 선택하세요";
  renderProblemLibraryScreen();
  void renderStudentGradeSummaryCard();
}

function resolveActiveLevelGroupForStudy(progressList) {
  return resolveActiveLevelGroupFromProgress(progressList, problems);
}

function getStudyExpandedLevelGroups(defaultLevelGroup) {
  if (appState.studyExpandedLevelGroups === null) {
    appState.studyExpandedLevelGroups = new Set();
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
  const currentUser = getCurrentUser();

  curriculumTree.levelGroups.forEach((levelFlow) => {
    try {
      const offers = getPersistentReviewOffersForLevel({
        user: currentUser,
        categoryRows: levelFlow.categoryRows,
        problems,
        progressByProblemId,
        levelGroup: levelFlow.levelGroup,
      });

      if (offers.length > 0) {
        reviewOffersByLevel[levelFlow.levelGroup] = offers;
      }
    } catch (error) {
      console.error("[study] getPersistentReviewOffersForLevel failed", {
        levelGroup: levelFlow.levelGroup,
        message: error?.message,
      });
    }
  });

  return reviewOffersByLevel;
}

async function refreshStudentProgressFromRemote({ force = false } = {}) {
  const currentUser = getCurrentUser();
  if (!currentUser?.id || normalizeRole(currentUser.role) !== ROLES.student) {
    studentProgressHydrateUserId = null;
    return { ok: false, skipped: true };
  }

  if (!force && studentProgressHydrateUserId === currentUser.id && studentProgressHydratePromise) {
    return studentProgressHydratePromise;
  }

  studentProgressHydrateUserId = currentUser.id;
  studentProgressHydratePromise = studentProgressService
    .hydrateStudentProgressCache(currentUser.id)
    .finally(() => {
      if (studentProgressHydrateUserId === currentUser.id) {
        studentProgressHydratePromise = null;
      }
    });

  return studentProgressHydratePromise;
}

function refreshScreensAfterProgressSync() {
  if (appState.mode === "study") {
    const progressList = getCurrentUser()?.id
      ? studentProgressService.getStudentProgressByUserId(getCurrentUser().id)
      : [];
    studyView.renderStudyHubMeta(resolveActiveLevelGroupForStudy(progressList));
    renderStudyScreen();
    return;
  }

  if (appState.mode === "list" && problemBankReady) {
    renderProblemLibraryScreen();
  }

  void renderStudentGradeSummaryCard();
}

let studentGradeSummaryRenderSeq = 0;

function hideStudentGradeSummaryCard() {
  if (!elements.studentGradeSummaryCard) {
    return;
  }

  elements.studentGradeSummaryCard.classList.add("is-hidden");
  elements.studentGradeSummaryCard.innerHTML = "";
}

function resolveNextGoalGradeCode(baseGradeCode) {
  const normalized = normalizeGradeLevelCode(baseGradeCode);
  if (!normalized) {
    return null;
  }

  const currentIndex = GRADE_LEVELS.findIndex((entry) => entry.code === normalized);
  if (currentIndex < 0 || currentIndex >= GRADE_LEVELS.length - 1) {
    return null;
  }

  return GRADE_LEVELS[currentIndex + 1]?.code ?? null;
}

function renderStudentGradeSummaryHtml({
  curriculumLabel,
  projectedGradeLabel,
  officialGradeLabel,
  officialGradeMeta,
  nextGoalGradeLabel,
}) {
  return `
    <h2>급수 현황</h2>
    <dl class="student-grade-summary-grid">
      <div>
        <dt>현재 과정</dt>
        <dd>${escapeHtml(curriculumLabel)}</dd>
      </div>
      <div>
        <dt>실제급수 (공식)</dt>
        <dd class="student-grade-summary-official">${escapeHtml(officialGradeLabel)}</dd>
        <p class="student-grade-summary-note">${escapeHtml(officialGradeMeta)}</p>
      </div>
      <div>
        <dt>예상급수 (참고)</dt>
        <dd>${escapeHtml(projectedGradeLabel)}</dd>
      </div>
      <div>
        <dt>다음 목표 급수</dt>
        <dd>${escapeHtml(nextGoalGradeLabel)}</dd>
      </div>
    </dl>
  `;
}

async function renderStudentGradeSummaryCard() {
  if (!elements.studentGradeSummaryCard) {
    return;
  }

  const currentUser = getCurrentUser();
  const role = normalizeRole(currentUser?.role);
  if (!currentUser?.id || role !== ROLES.student || !["list", "study"].includes(appState.mode)) {
    hideStudentGradeSummaryCard();
    return;
  }

  const renderSeq = ++studentGradeSummaryRenderSeq;
  const curriculum = getStudentCurriculumOverview(currentUser.id, problems);
  const projected = getStudentProjectedGradeSummary(currentUser.id, problems);
  const academyId = resolveAcademyScopeId(currentUser);
  const official = await fetchStudentOfficialGrade(academyId, currentUser.id);

  if (renderSeq !== studentGradeSummaryRenderSeq) {
    return;
  }

  const officialGradeCode = official?.gradeCode ?? null;
  const baseForNextGoal = officialGradeCode ?? projected.projectedGradeCode ?? null;
  const nextGoalCode = resolveNextGoalGradeCode(baseForNextGoal);
  const officialGradeLabel = official?.gradeLabel ?? "미등록";
  const officialGradeMeta = official
    ? `${official.gradeSourceLabel} · 취득 ${official.acquiredAt}`
    : "공식 급수가 아직 등록되지 않았습니다.";

  elements.studentGradeSummaryCard.innerHTML = renderStudentGradeSummaryHtml({
    curriculumLabel: `${curriculum.activeLevelGroup} (${curriculum.activeLevelGroupStatusLabel})`,
    projectedGradeLabel: projected.projectedGradeLabel ?? "산정 중",
    officialGradeLabel,
    officialGradeMeta,
    nextGoalGradeLabel: nextGoalCode ? formatGradeLevelLabel(nextGoalCode) : "설정 필요",
  });
  elements.studentGradeSummaryCard.classList.remove("is-hidden");
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
  if (
    !mockTestLeaveGuard.confirmLeaveInApp(appState, () => {
      clearExamSession();
    })
  ) {
    return;
  }

  logScreen("showStudyMode");
  logLearningFlow("showStudyMode", {
    previousMode: appState.mode,
    hadStudySolvePath: Boolean(appState.studySolvePath),
  });
  if (problems.length === 0) {
    showEmptyProblemState();
    return;
  }

  hideCategoryCompleteModal();
  hideAttendancePanel?.();
  clearReviewSession();
  clearPendingAiMove();
  clearStudySolvePath();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  setMode("study");
  const progressList = getCurrentUser()?.id
    ? studentProgressService.getStudentProgressByUserId(getCurrentUser().id)
    : [];
  studyView.renderStudyHubMeta(resolveActiveLevelGroupForStudy(progressList));
  renderStudyScreen();
  void renderStudentGradeSummaryCard();
}

function clearReviewSession({ completeCategoryOffer = false } = {}) {
  const session = appState.reviewSession;
  if (completeCategoryOffer && session?.categoryName) {
    const currentUser = getCurrentUser();
    if (currentUser?.id) {
      completeCategoryReviewOffer({
        userId: currentUser.id,
        categoryName: session.categoryName,
        levelGroup: session.levelGroup,
      });
    }
  }

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
  hideBoardFeedback();
  setMode("solve");
  appState.currentProblemIndex = reviewItem.index;
  appState.currentProblemId = reviewItem.problem.id;
  appState.solvedAnswerKeys = new Set();
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];
  aiResponseSolve?.clearSession?.();
  const boardStones = captureInitialBoardState(reviewItem.problem);
  boardController.setSize(getProblemBoardSize(reviewItem.problem));
  solveView.renderProblem(reviewItem.problem, reviewItem.index, { reviewItem, boardStones });
  logLearningFlow("loadReviewProblem", {
    source: "review",
    problemId: reviewItem.problem.id,
    problemMode: reviewItem.problem.problemMode ?? reviewItem.problem.problem_mode,
    queueIndex,
  });
  ensureAiResponseSolveSession(reviewItem.problem, { source: "review", forceReinit: true });
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

function loadProblemById(problemId, { examSessionIndex } = {}) {
  const index = problems.findIndex((entry) => entry.id === problemId);
  if (index === -1) {
    setFeedback("문제를 찾을 수 없습니다.", "wrong");
    return;
  }

  if (appState.examSession && Number.isFinite(examSessionIndex)) {
    appState.examSession.currentIndex = examSessionIndex;
    examView.renderExamSessionBanner(appState.examSession);
  }

  loadProblem(index);
}

const PROMOTION_PAPER_BOARD_COLOR_BACKGROUND = "#f3d08a";
const PROMOTION_PAPER_BOARD_MONOCHROME_BACKGROUND = "#ffffff";

function getPromotionPaperMonochromeBoardTheme() {
  const defaultTheme = window.WGo?.Board?.themes?.default ?? {};
  return {
    ...defaultTheme,
    gridLinesColor: "#222222",
    gridLinesWidth: 1,
    starColor: "#111111",
    shadowBlur: 0,
    shadowSize: 0,
  };
}

function addPromotionPaperBoardStones(previewBoard, problem) {
  const boardSize = getProblemBoardSize(problem);
  problem.stones.forEach((stone) => {
    if (!isValidBoardPoint(stone, boardSize)) {
      return;
    }

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

  applyCandidateLabelsToWgoBoard(previewBoard, getProblemCandidateLabels(problem), boardSize);
}

function renderPromotionPaperPrintBoard(element, problem, { monochrome = false } = {}) {
  if (!element || !window.WGo || !Array.isArray(problem?.stones)) {
    return;
  }

  const boardSize = getProblemBoardSize(problem);
  const boardWidth = element.clientWidth || 196;
  const boardOptions = {
    size: boardSize,
    width: boardWidth,
    section: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  };

  if (monochrome) {
    boardOptions.background = PROMOTION_PAPER_BOARD_MONOCHROME_BACKGROUND;
    boardOptions.theme = getPromotionPaperMonochromeBoardTheme();
  }

  const previewBoard = new WGo.Board(element, boardOptions);
  addPromotionPaperBoardStones(previewBoard, problem);
}

let promotionPaperPrintPrepared = false;

function getPromotionPaperBoardCanvases(element) {
  const wgoBoard = element.querySelector(".wgo-board");
  if (wgoBoard) {
    return [...wgoBoard.querySelectorAll("canvas")];
  }
  return [...element.querySelectorAll("canvas")];
}

function getPromotionPaperBoardFlattenBackground(element, fallbackColor) {
  const wgoBoard = element.querySelector(".wgo-board");
  if (!wgoBoard) {
    return fallbackColor;
  }

  const backgroundColor = getComputedStyle(wgoBoard).backgroundColor;
  if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" && backgroundColor !== "transparent") {
    return backgroundColor;
  }

  return fallbackColor;
}

function flattenPromotionPaperBoardForPrint(
  element,
  backgroundColor = PROMOTION_PAPER_BOARD_COLOR_BACKGROUND,
) {
  const canvases = getPromotionPaperBoardCanvases(element);
  const baseCanvas = canvases[0];
  if (!baseCanvas || baseCanvas.width === 0 || baseCanvas.height === 0) {
    return;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = baseCanvas.width;
  exportCanvas.height = baseCanvas.height;

  const context = exportCanvas.getContext("2d");
  context.fillStyle = getPromotionPaperBoardFlattenBackground(element, backgroundColor);
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  canvases.forEach((canvas) => {
    context.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  });

  const image = document.createElement("img");
  image.src = exportCanvas.toDataURL("image/png");
  image.alt = "승급심사 바둑판";
  image.decoding = "sync";
  image.dataset.ppPrintBoard = "1";
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "contain";

  element.replaceChildren(image);
}

function mountPromotionPaperBoardNode(node, problem) {
  node.replaceChildren();
  node.style.width = "";
  node.style.height = "";
  renderProblemPreviewBoard(node, problem);
}

function mountPromotionPaperBoards(root = elements.promotionPaperQuestions) {
  if (!root) {
    return;
  }
  root.querySelectorAll("[data-promotion-paper-problem-id]").forEach((node) => {
    const problemId = node.dataset.promotionPaperProblemId;
    const problem = problems.find((row) => row.id === problemId);
    if (!problem) {
      return;
    }
    mountPromotionPaperBoardNode(node, problem);
  });
}

function ensurePromotionPaperBoardMounted(node, problem, { monochrome = false } = {}) {
  const hasPrintImage = node.querySelector("img[data-pp-print-board='1']");
  if (hasPrintImage) {
    node.replaceChildren();
    node.style.width = "";
    node.style.height = "";
  }

  const hasLiveBoard = node.querySelector(".wgo-board canvas");

  if (monochrome) {
    if (!hasLiveBoard || hasPrintImage) {
      node.replaceChildren();
      node.style.width = "";
      node.style.height = "";
      renderPromotionPaperPrintBoard(node, problem, { monochrome: true });
    }
    return;
  }

  if (!node.querySelector(".wgo-board canvas")) {
    mountPromotionPaperBoardNode(node, problem);
  }
}

async function waitForPromotionPaperBoardRender() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function flattenPromotionPaperPrintBoards(
  root = elements.promotionPaperQuestions,
  { monochrome = false } = {},
) {
  if (!root) {
    return;
  }

  const flattenBackground = monochrome
    ? PROMOTION_PAPER_BOARD_MONOCHROME_BACKGROUND
    : PROMOTION_PAPER_BOARD_COLOR_BACKGROUND;

  root.querySelectorAll("[data-promotion-paper-problem-id]").forEach((node) => {
    flattenPromotionPaperBoardForPrint(node, flattenBackground);
  });
}

async function preparePromotionPaperPrintBoards(
  root = elements.promotionPaperQuestions,
  { monochrome = false } = {},
) {
  if (!root) {
    return;
  }

  const nodes = [...root.querySelectorAll("[data-promotion-paper-problem-id]")];
  nodes.forEach((node) => {
    const problemId = node.dataset.promotionPaperProblemId;
    const problem = problems.find((row) => row.id === problemId);
    if (!problem) {
      return;
    }
    ensurePromotionPaperBoardMounted(node, problem, { monochrome });
  });

  await waitForPromotionPaperBoardRender();
  flattenPromotionPaperPrintBoards(root, { monochrome });
  promotionPaperPrintPrepared = true;
}

function preparePromotionPaperPrintBoardsSync(
  root = elements.promotionPaperQuestions,
  { monochrome = false } = {},
) {
  if (!root || promotionPaperPrintPrepared) {
    return;
  }

  const nodes = [...root.querySelectorAll("[data-promotion-paper-problem-id]")];
  nodes.forEach((node) => {
    const problemId = node.dataset.promotionPaperProblemId;
    const problem = problems.find((row) => row.id === problemId);
    if (!problem) {
      return;
    }
    ensurePromotionPaperBoardMounted(node, problem, { monochrome });
  });
  flattenPromotionPaperPrintBoards(root, { monochrome });
  promotionPaperPrintPrepared = true;
}

function isPromotionPaperMonochromePrintEnabled() {
  return Boolean(elements.promotionPaperMonochrome?.checked);
}

function setPromotionPaperPrintModeClasses({ monochrome = false } = {}) {
  document.body.classList.add("promotion-paper-print");
  document.body.classList.toggle("promotion-paper-print-monochrome", monochrome);
}

function clearPromotionPaperPrintModeClasses() {
  document.body.classList.remove("promotion-paper-print");
  document.body.classList.remove("promotion-paper-print-monochrome");
  promotionPaperPrintPrepared = false;
}

function waitForPromotionPaperPrintImages(root = elements.promotionPaperQuestions) {
  if (!root) {
    return Promise.resolve();
  }

  const images = [...root.querySelectorAll(".promotion-paper-board img")];
  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
          window.setTimeout(resolve, 600);
        }),
    ),
  );
}

async function runPromotionPaperPrint() {
  const monochrome = isPromotionPaperMonochromePrintEnabled();
  promotionPaperPrintPrepared = false;
  setPromotionPaperPrintModeClasses({ monochrome });
  ensurePromotionPaperPageStyle();
  await preparePromotionPaperPrintBoards(elements.promotionPaperQuestions, { monochrome });
  await waitForPromotionPaperPrintImages(elements.promotionPaperQuestions);
  window.print();
}

function renderPromotionPaperScreen(examSet, detail) {
  const questions = detail.questions ?? [];
  const gradeLabel = examSet.gradeLevel ? formatGradeLevelLabel(examSet.gradeLevel) : "급수 미지정";
  const examDateLabel = formatPromotionPaperDate(examSet.examDate);

  if (elements.promotionPaperMeta) {
    elements.promotionPaperMeta.textContent = "Promotion Paper";
  }
  if (elements.promotionPaperTitle) {
    elements.promotionPaperTitle.textContent = examSet.title ?? "승급심사 시험지";
  }
  if (elements.promotionPaperDescription) {
    elements.promotionPaperDescription.textContent = `${gradeLabel} · ${examDateLabel} · 총 ${questions.length}문제`;
  }
  if (elements.promotionPaperQuestions) {
    elements.promotionPaperQuestions.innerHTML = buildPromotionPaperPagesHtml({
      examSet,
      questions,
      problems,
      escapeHtml,
      getPrompt: getPromotionPaperPrompt,
      gradeLabel,
      examDateLabel,
      organizationName: examSet.organizationName ?? examSet.organization_name ?? "",
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        mountPromotionPaperBoards(elements.promotionPaperQuestions);
      });
    });
  }

  setMode("paper");
  elements.meta.textContent = "Promotion Paper";
  elements.title.textContent = "승급심사 시험지";
  elements.description.textContent = "온라인 풀이가 아닌 인쇄/열람 전용 화면입니다.";
  elements.description.classList.remove("is-hidden");
}

function getPromotionPaperPrompt(problem) {
  const candidates = [
    problem?.prompt,
    problem?.problemPrompt,
    problem?.problem_prompt,
    problem?.description,
    problem?.title,
  ];
  const value = candidates.find((entry) => String(entry ?? "").trim().length > 0);
  return value ? String(value).trim() : "문제 설명이 없습니다.";
}

function formatPromotionPaperDate(value) {
  if (!value) {
    return "____________";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

async function openExamSetQuestionPreview(examSet) {
  try {
    const detail = await examSetService.getExamSetDetail({
      user: getCurrentUser(),
      examSetId: examSet.id,
    });
    const questions = detail.questions ?? [];
    if (questions.length === 0) {
      setFeedback("이 시험 세트에 포함된 문제가 없습니다.", "wrong");
      return;
    }
    clearExamSession();
    renderPromotionPaperScreen(detail.set ?? examSet, detail);
  } catch (error) {
    console.error("[ExamSet] question preview failed", error);
    setFeedback("시험 문제를 열람하지 못했습니다.", "wrong");
  }
}

function persistExamLearningProgressFromSession() {
  const session = appState.examSession;
  const user = getCurrentUser();
  if (!session || !user?.id || session.sessionMode !== "learning") {
    return;
  }
  if (!examSetLearningProgressService.isResumableQuestionBankSet(session)) {
    return;
  }
  if (normalizeRole(user.role) !== ROLES.student) {
    return;
  }

  examSetLearningProgressService.saveLearningProgress({
    studentUserId: user.id,
    examSetId: session.examSetId,
    resumeIndex: session.currentIndex,
    totalQuestionCount: session.problemIds.length,
    problemIds: session.problemIds,
    completedProblemIds: session.problemIds.slice(0, session.currentIndex),
  });
}

function beginQuestionBankExamSet(examSet) {
  const user = getCurrentUser();
  if (
    !examSetLearningProgressService.isResumableQuestionBankSet(examSet) ||
    normalizeRole(user?.role) !== ROLES.student ||
    !user?.id
  ) {
    void startExamSetSession(examSet, { startIndex: 0 });
    return;
  }

  const progress = examSetLearningProgressService.getLearningProgress(user.id, examSet.id);
  if (!isResumableLearningProgress(progress)) {
    void startExamSetSession(examSet, { startIndex: 0 });
    return;
  }

  examSetResumeUi.show({
    examTitle: examSet.title,
    completedCount: progress.resumeIndex,
    totalCount: progress.totalQuestionCount,
    onResume: () => {
      void startExamSetSession(examSet, { startIndex: progress.resumeIndex });
    },
    onRestart: () => {
      examSetLearningProgressService.clearLearningProgress(user.id, examSet.id);
      void startExamSetSession(examSet, { startIndex: 0 });
    },
  });
}

async function startExamSetSession(examSet, { startIndex = 0 } = {}) {
  try {
    const detail = await examSetService.getExamSetDetail({
      user: getCurrentUser(),
      examSetId: examSet.id,
    });
    if ((detail.set?.setRole ?? examSet.setRole) === EXAM_SET_ROLE.promotionPaper) {
      clearExamSession();
      renderPromotionPaperScreen(detail.set ?? examSet, detail);
      return;
    }
    const problemIds = (detail.questions ?? []).map((entry) => entry.problemId);

    if (problemIds.length === 0) {
      setFeedback("이 시험 세트에 포함된 문제가 없습니다.", "wrong");
      return;
    }

    const isMock = (detail.set?.type ?? examSet.type) === EXAM_SET_TYPE.mockTest;
    const user = getCurrentUser();
    let resumeIndex = Math.max(0, Number(startIndex) || 0);
    if (!isMock && examSetLearningProgressService.isResumableQuestionBankSet(detail.set ?? examSet)) {
      const saved = user?.id
        ? examSetLearningProgressService.getLearningProgress(user.id, examSet.id)
        : null;
      if (saved && !examSetLearningProgressService.validateLearningProgress(saved, problemIds)) {
        examSetLearningProgressService.clearLearningProgress(user.id, examSet.id);
        resumeIndex = 0;
      } else if (resumeIndex >= problemIds.length) {
        resumeIndex = 0;
      }
    } else {
      resumeIndex = 0;
    }

    appState.examSession = {
      examSetId: examSet.id,
      title: examSet.title,
      problemIds,
      currentIndex: resumeIndex,
      sessionMode: isMock ? "mock" : "learning",
      setRole: detail.set?.setRole ?? examSet.setRole ?? EXAM_SET_ROLE.questionBank,
      type: detail.set?.type ?? examSet.type,
      correctCount: 0,
      wrongProblemNumbers: [],
      mockStartedAt: isMock ? Date.now() : null,
    };

    if (isMock) {
      mockTestUi.startTimer({ startedAt: appState.examSession.mockStartedAt });
      mockTestLeaveGuard.activate();
    }

    loadProblemById(problemIds[resumeIndex], { examSessionIndex: resumeIndex });
  } catch (error) {
    console.error("[ExamSession] start failed", error);
    setFeedback("시험 세트를 시작하지 못했습니다.", "wrong");
  }
}

function clearExamSession({ persistProgress = true } = {}) {
  if (persistProgress) {
    persistExamLearningProgressFromSession();
  }
  mockTestLeaveGuard.deactivate();
  mockTestUi.stopTimer();
  appState.examSession = null;
  examView.clearExamSessionBanner();
  elements.promotionPaperScreen?.classList.add("is-hidden");
  elements.mockTestResultsPanel?.classList.add("is-hidden");
  examCatalog.clearOpenMockResults?.();
  document.body.classList.remove("promotion-paper-print");
  document.body.classList.remove("promotion-paper-print-monochrome");
  clearPromotionPaperPageStyle();
}

function showMockExamFeedback(tone) {
  if (tone === "correct") {
    boardFeedbackOverlay.show({
      tone: "correct",
      title: "정답입니다.",
      subtitle: "잠시 후 다음 문제로 넘어갑니다.",
      duration: 1000,
    });
    return;
  }

  boardFeedbackOverlay.show({
    tone: "wrong",
    title: "오답입니다.",
    subtitle: "잠시 후 다음 문제로 넘어갑니다.",
    duration: 800,
  });
}

async function finishMockTestSession(session) {
  const startedAt =
    session.mockStartedAt ?? mockTestUi.getTimerStartedAt() ?? Date.now();
  const { durationSeconds, overtimeSeconds } = computeMockTestTiming(Date.now() - startedAt);
  const total = session.problemIds.length;
  const correctCount = Number(session.correctCount ?? 0);
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const wrongProblemNumbers = Array.isArray(session.wrongProblemNumbers)
    ? session.wrongProblemNumbers
    : [];
  const examSetRef = { id: session.examSetId, title: session.title };

  const saveResult = await mockTestAttemptService.recordMockTestAttempt({
    user: getCurrentUser(),
    examSetId: session.examSetId,
    examSetTitle: session.title,
    totalQuestionCount: total,
    correctCount,
    wrongProblemNumbers,
    durationSeconds,
    overtimeSeconds,
  });
  if (!saveResult.ok) {
    console.warn("[MockTestAttempt] save failed after mock test", saveResult.message);
  }

  mockTestUi.stopTimer();
  clearExamSession();
  await examCatalog.refreshExamCatalog();
  showListMode();

  mockTestUi.showResultModal({
    examTitle: session.title,
    correctCount,
    totalQuestionCount: total,
    accuracyRate: accuracy,
    wrongProblemNumbers,
    durationSeconds,
    overtimeSeconds,
    onViewResults: () => {
      examCatalog.syncOpenMockResults?.(examSetRef.id);
      void showMockTestResults(examSetRef);
    },
    onClose: () => {
      setFeedback(`"${session.title}" 모의시험을 마쳤습니다.`, "correct");
    },
  });
}

function hideMockTestResults() {
  if (!elements.mockTestResultsPanel) {
    return;
  }
  elements.mockTestResultsPanel.classList.add("is-hidden");
  if (elements.mockTestResultsList) {
    elements.mockTestResultsList.innerHTML = "";
  }
}

async function showMockTestResults(examSet) {
  if (!elements.mockTestResultsPanel || !elements.mockTestResultsList) {
    return;
  }
  elements.mockTestResultsPanel.classList.remove("is-hidden");
  elements.mockTestResultsPanel.dataset.examSetId = examSet.id;
  elements.mockTestResultsPanel.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  elements.mockTestResultsTitle.textContent = `${examSet.title} 결과`;
  elements.mockTestResultsList.innerHTML = '<p class="mock-test-results-empty">결과를 불러오는 중...</p>';

  const result = await mockTestAttemptService.listMockTestAttemptsForViewer({
    user: getCurrentUser(),
    examSetId: examSet.id,
    limit: 200,
  });

  if (!result.ok) {
    elements.mockTestResultsList.innerHTML = `<p class="mock-test-results-empty">결과를 불러오지 못했습니다: ${escapeHtml(result.message ?? "unknown")}</p>`;
    return;
  }

  const attempts = result.attempts ?? [];
  if (attempts.length === 0) {
    elements.mockTestResultsList.innerHTML =
      '<p class="mock-test-results-empty">저장된 모의시험 결과가 없습니다.</p>';
    return;
  }

  elements.mockTestResultsList.innerHTML = renderMockTestResultsTableHtml(attempts, escapeHtml);
}

function resolveProblemEntry(index) {
  if (!Number.isInteger(index) || index < 0 || index >= problems.length) {
    logLearningFlow("resolveProblemEntry — invalid index", {
      index,
      problemsLength: problems.length,
    });
    return null;
  }

  const problem = problems[index];
  if (!problem) {
    logLearningFlow("resolveProblemEntry — missing problem at index", { index });
    return null;
  }

  return { problem, index };
}

function logResumeAiResponseState(problem, source) {
  const session = appState.aiResponseSolveSession;
  logLearningFlow("resume/continue — before load", {
    source,
    problemId: problem?.id,
    problemIndex: appState.currentProblemIndex,
    currentProblemId: appState.currentProblemId,
    category: problem?.category,
    answerMoveCount: problem?.answerMoveCount ?? problem?.answer_move_count,
    fullAnswerSequenceLength: Array.isArray(problem?.full_answer_sequence)
      ? problem.full_answer_sequence.length
      : Array.isArray(problem?.fullAnswerSequence)
        ? problem.fullAnswerSequence.length
        : 0,
    sessionPhaseBeforeLoad: session?.phase ?? null,
    blackAnswerIndexBeforeLoad: session?.blackAnswerIndex ?? null,
    isSolved: appState.isSolved,
    isAiThinking: appState.isAiThinking,
  });
}

const STUDY_SOLVE_SOURCES = new Set([
  "study-continue",
  "study-recommend",
  "auto-next-after-complete",
  "study-category-complete-next",
]);

function isStudySolveSource(source) {
  return STUDY_SOLVE_SOURCES.has(source);
}

function establishStudySolvePath(problem, { source = "study" } = {}) {
  if (!problem?.category) {
    appState.studySolvePath = null;
    return;
  }

  appState.studySolvePath = buildStudySolvePath(problem.category, problems, {
    levelGroup: problem.levelGroup,
  });

  logLearningFlow("establishStudySolvePath", {
    source,
    categoryName: appState.studySolvePath.categoryName,
    levelGroup: appState.studySolvePath.levelGroup,
    count: appState.studySolvePath.problemIds.length,
  });
}

function clearStudySolvePath() {
  if (appState.studySolvePath) {
    logLearningFlow("clearStudySolvePath", {
      categoryName: appState.studySolvePath.categoryName,
    });
  }
  appState.studySolvePath = null;
}

function logAiResponseEntry(problem, source, session) {
  console.log("[AI_RESPONSE] entry", {
    problemId: problem?.id,
    problemMode: problem?.problemMode ?? problem?.problem_mode,
    source,
    phase: session?.phase,
    currentPly: session?.currentPly,
    blackAnswerIndex: session?.blackAnswerIndex,
  });
}

/**
 * AI 응수형 세션 — 모든 진입 경로에서 동일하게 초기화
 * @param {object} problem
 * @param {{ source?: string, forceReinit?: boolean }} [options]
 */
function ensureAiResponseSolveSession(problem, { source = "direct", forceReinit = false } = {}) {
  if (!shouldUseAiResponseSolve(problem)) {
    return;
  }

  const existing = appState.aiResponseSolveSession;
  const needsInit = forceReinit || !existing?.phase;

  if (!needsInit) {
    logAiResponseSessionSnapshot(appState, `ensure — existing (${source})`);
    logAiResponseEntry(problem, source, existing);
    return;
  }

  aiResponseSolve?.clearSession?.();
  logAiResponseSolveContext(problem, `ensure init (${source})`);
  aiResponseSolve.initSession(problem);
  logAiResponseSessionSnapshot(appState, `ensure — ${source}`);
  logAiResponseEntry(problem, source, appState.aiResponseSolveSession);

  if (source === "review" || source === "direct" || isStudySolveSource(source)) {
    setFeedback(getProblemStartFeedback(problem));
  }
}

function startProblemFromStudyHub(problemIndex, { source = "study-continue" } = {}) {
  logLearningFlow("startProblemFromStudyHub", { source, problemIndex });
  const resolved = resolveProblemEntry(problemIndex);
  if (!resolved) {
    setFeedback("문제를 찾을 수 없습니다.", "wrong");
    return;
  }

  establishStudySolvePath(resolved.problem, { source });
  logResumeAiResponseState(resolved.problem, source);
  loadProblem(resolved.index, { source });

  if (shouldUseAiResponseSolve(resolved.problem)) {
    logAiResponseSessionSnapshot(appState, `after continue — ${source}`, {
      answerMoveCount: appState.aiResponseSolveSession?.answerMoveCount,
      blackAnswerIndex: appState.aiResponseSolveSession?.blackAnswerIndex,
      phase: appState.aiResponseSolveSession?.phase,
    });
  }
}

function loadProblem(index, { source = "direct" } = {}) {
  const resolved = resolveProblemEntry(index);
  if (!resolved) {
    showEmptyProblemState();
    return;
  }

  const { problem, index: resolvedIndex } = resolved;
  logLearningFlow("loadProblem", {
    source,
    index: resolvedIndex,
    problemId: problem.id,
    category: problem.category,
    mode: appState.mode,
    hasStudySolvePath: Boolean(appState.studySolvePath),
  });

  if (!isStudySolveSource(source)) {
    clearStudySolvePath();
  } else if (source === "study-recommend") {
    establishStudySolvePath(problem, { source });
  }

  hideCategoryCompleteModal();
  if (!appState.examSession) {
    clearReviewSession();
  }
  clearPendingAiMove();
  clearAutoNext();
  clearWrongTimers();
  hideBoardFeedback();
  aiResponseUx?.exit?.({ silent: true });
  aiResponseSolve?.clearSession?.();
  setMode("solve");
  appState.currentProblemIndex = resolvedIndex;
  appState.currentProblemId = problem.id;
  appState.solvedAnswerKeys = new Set();
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];
  const boardStones = captureInitialBoardState(problem);
  boardController.setSize(getProblemBoardSize(problem));
  solveView.renderProblem(problem, resolvedIndex, { boardStones, examSession: appState.examSession });
  ensureAiResponseSolveSession(problem, { source, forceReinit: true });
  if (!shouldUseAiResponseSolve(problem) && isAiResponseProblem(problem)) {
    logAiResponseSolveContext(problem, "loadProblem — ai_response but solve engine OFF");
  }

  syncBoardPreviewContext();
}

function showEmptyProblemState() {
  clearPendingAiMove();
  clearAutoNext();
  clearWrongTimers();
  hideBoardFeedback();
  setMode("list");
  appState.currentProblemIndex = 0;
  appState.currentProblemId = null;
  appState.solvedAnswerKeys = new Set();
  appState.isSolved = false;
  appState.isAiThinking = false;
  appState.playedMoves = [];
  aiResponseSolve?.clearSession?.();
  solveView.renderEmptyProblemState();
  if (problemBankReady) {
    renderProblemLibraryScreen();
  }
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

  if (aiResponseSolve?.isBlockingInput?.()) {
    setFeedback("백 응수를 불러오는 중입니다.", "wrong");
    return;
  }

  if (shouldUseAiResponseSolve(problem)) {
    console.log("[AI_RESPONSE] using ai response solve engine", {
      problemMode: problem.problemMode ?? problem.problem_mode,
      aiResponseSolveEnabled: window.BadukConfig?.aiResponseSolveEnabled,
      katagoRespondApiEnabled: window.BadukConfig?.katagoRespondApiEnabled,
    });
    void aiResponseSolve.handleStudentBlackMove(point);
    return;
  }

  if (isAiResponseProblem(problem)) {
    console.log("[AI_RESPONSE] fallback to handleUserMove", {
      problemMode: problem.problemMode ?? problem.problem_mode,
      aiResponseSolveEnabled: window.BadukConfig?.aiResponseSolveEnabled,
    });
  }

  if (aiResponseUx?.isActive?.()) {
    aiResponseUx.handleBoardClick(point);
    return;
  }

  console.log("[AI_RESPONSE] using standard handleUserMove", {
    problemMode: problem?.problemMode ?? problem?.problem_mode,
  });
  handleUserMove(point);
}

function handleOxAnswer(userOxAnswer) {
  const problem = getCurrentProblem();

  if (!isOxProblem(problem)) {
    return;
  }

  if (appState.isSolved) {
    boardFeedbackOverlay.showCorrectPreset("correct", { duration: 800 });
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

  if (handleMockExamWrong(problem)) {
    return;
  }

  resetCurrentProblemAfterWrongMove(problem);
}

function handleUserMove(point) {
  const problem = getCurrentProblem();

  if (appState.isSolved) {
    boardFeedbackOverlay.showCorrectPreset("correct", { duration: 800 });
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
      boardFeedbackOverlay.showCorrectSequenceRemaining(sequenceResult.remainingMoves);
      appState.playedMoves.push(userMove);
      return;
    }

    completeProblem(problem);
    return;
  }

  if (appState.examSession?.sessionMode !== "mock") {
    recordWrongMove(problem, userMove);
  }

  if (shouldUseAiResponseUx(problem)) {
    const enterResult = aiResponseUx.enterAfterWrongMove(problem, userMove);
    if (enterResult === "entered") {
      return;
    }
    if (enterResult === "no_candidates") {
      setFeedback(AI_RESPONSE_UX_MESSAGES.noCandidates, "wrong");
    }
  }

  if (handleMockExamWrong(problem)) {
    return;
  }

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

  if (appState.examSession) {
    const session = appState.examSession;
    const nextIndex = (session.currentIndex + 1) % session.problemIds.length;
    loadProblemById(session.problemIds[nextIndex], { examSessionIndex: nextIndex });
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
  if (
    !mockTestLeaveGuard.confirmLeaveInApp(appState, () => {
      clearExamSession();
    })
  ) {
    return;
  }

  if (menuTarget === "list") {
    showListMode();
    return;
  }

  if (menuTarget === "study" || menuTarget === "solve") {
    showStudyMode();
    return;
  }

  if (menuTarget === "platform") {
    showPlatformAdminMenu();
    return;
  }

  showAcademyMenu(menuTarget);
}

function getCurrentProblem() {
  if (appState.currentProblemId) {
    const byId = problems.findIndex((entry) => entry.id === appState.currentProblemId);
    if (byId >= 0) {
      if (byId !== appState.currentProblemIndex) {
        logLearningFlow("getCurrentProblem — realigned index from id", {
          previousIndex: appState.currentProblemIndex,
          nextIndex: byId,
          problemId: appState.currentProblemId,
        });
        appState.currentProblemIndex = byId;
      }
      return problems[byId];
    }

    logLearningFlow("getCurrentProblem — stale problem id", {
      currentProblemId: appState.currentProblemId,
      currentProblemIndex: appState.currentProblemIndex,
    });
  }

  return problems[appState.currentProblemIndex] ?? null;
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
  if (!mockTestLeaveGuard.confirmLeaveInApp(appState)) {
    return;
  }

  logScreen("showListMode");
  logLearningFlow("showListMode", {
    previousMode: appState.mode,
    currentProblemIndex: appState.currentProblemIndex,
    currentProblemId: appState.currentProblemId,
    sessionPhase: appState.aiResponseSolveSession?.phase ?? null,
  });
  hideCategoryCompleteModal();
  hideAttendancePanel?.();
  clearReviewSession();
  clearExamSession();
  clearPendingAiMove();
  appState.isAiThinking = false;
  appState.isSolved = false;
  appState.playedMoves = [];
  appState.currentProblemId = null;
  clearStudySolvePath();
  aiResponseSolve?.clearSession?.();
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
  ensureProblemLibraryElements();
  try {
    renderLevelGroupFilters();
  } catch (error) {
    console.error("[renderCategoryFilters] renderLevelGroupFilters failed", error);
    return;
  }

  if (!elements.categoryFilters) {
    console.warn("[renderCategoryFilters] missing #category-filters element");
    return;
  }

  const studentProgressByProblemId = getCurrentStudentProgressByProblemId();
  const categories = getCategoryFilters();
  elements.categoryFilters.innerHTML = "";

  categories.forEach((category) => {
    try {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-button";
      button.dataset.category = category;
      updateCategoryFilterButton(button, category, studentProgressByProblemId);
      button.addEventListener("click", () => handleCategoryChipClick(category));
      elements.categoryFilters.append(button);
    } catch (error) {
      console.error(`[renderCategoryFilters] failed for category: ${category}`, error);
    }
  });

  if (categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list-message";
    empty.textContent = "표시할 카테고리가 없습니다.";
    elements.categoryFilters.append(empty);
  }

  if (canUsePrintFeatures()) {
    try {
      printBuilder.render();
    } catch (error) {
      console.error("[renderCategoryFilters] printBuilder.render failed", error);
    }
  }
}

function renderLevelGroupFilters() {
  ensureProblemLibraryElements();

  if (!elements.levelGroupFilters) {
    console.warn("[renderLevelGroupFilters] missing #level-group-filters");
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

function resolveDefaultSelectedCategory(levelGroup = getActiveLevelGroup()) {
  return getDefaultCategoryNameForLevelGroup(levelGroup, {
    categories: readCategories(),
    problems,
  });
}

function ensureDefaultCategorySelection() {
  const defaultCategory = resolveDefaultSelectedCategory();
  const availableFilters = getCategoryFilters();
  const isAllSelected =
    !appState.selectedCategory || appState.selectedCategory === "전체";
  const isKnownCategory =
    appState.selectedCategory &&
    appState.selectedCategory !== "전체" &&
    availableFilters.includes(appState.selectedCategory);

  if (isAllSelected || !isKnownCategory) {
    appState.selectedCategory = defaultCategory;
  }
}

function selectLevelGroup(levelGroup) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  appState.selectedLevelGroup = normalizedLevelGroup;
  appState.selectedCategory = resolveDefaultSelectedCategory(normalizedLevelGroup);
  resetGradeAssignmentSelection?.();
  syncCreatorCategoriesForLevelGroup();
  renderLevelGroupFilters();
  renderCategoryFilters();
  renderGradeAssignmentPanel?.();
  renderProblemList();
}

function selectCategory(category) {
  if (category === "전체") {
    appState.selectedCategory = "전체";
  } else {
    appState.selectedCategory = category || resolveDefaultSelectedCategory();
  }
  resetGradeAssignmentSelection?.();
  renderCategoryFilters();
  renderGradeAssignmentPanel?.();
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
  ensureProblemLibraryElements();

  if (!elements.problemCards) {
    console.warn("[renderProblemList] missing #problem-cards element");
    return;
  }

  const gradeMode = isGradeAssignmentMode?.() ?? false;
  const examSetMode = isExamSetPickerMode?.() ?? false;
  const hideExamCatalog =
    gradeMode || (adminState.isEnabled && adminState.listPanel === "exam-sets");
  elements.examSetCatalog?.classList.toggle("is-hidden", hideExamCatalog);

  updatePrintUiVisibility();
  updateAdminProblemListControlsVisibility();
  updateAiResponseQaBatchUi?.();
  updateProblemSortModeUi?.();
  elements.problemListScreen?.classList.toggle("is-grade-assignment-mode", gradeMode);
  elements.problemListScreen?.classList.toggle("is-exam-set-picker-mode", examSetMode);
  elements.problemCards.classList.toggle("is-grade-assignment-mode", gradeMode);
  elements.problemCards.classList.toggle("is-exam-set-picker-mode", examSetMode);
  elements.problemCards.classList.toggle(
    "is-problem-sort-mode",
    adminState.isEnabled && adminState.problemSortMode && isCurrentUserAdmin(),
  );

  const filteredProblems = getFilteredProblems();
  const isProblemSortMode =
    adminState.isEnabled &&
    adminState.problemSortMode &&
    isCurrentUserAdmin() &&
    problemReorder.canReorderInCurrentView();
  const studentProgressByProblemId =
    gradeMode || examSetMode ? null : getCurrentStudentProgressByProblemId();
  const canPrint = canUsePrintFeatures() && !gradeMode && !examSetMode;
  elements.problemCards.innerHTML = "";
  const categoryLabel =
    appState.selectedCategory && appState.selectedCategory !== "전체"
      ? `${getActiveLevelGroup()} · ${appState.selectedCategory}`
      : `${getActiveLevelGroup()} 전체`;
  const gradeSelectionCount = adminState.gradeAssignment?.selectedProblemIds?.size ?? 0;
  const examSetAddSelectionCount = adminState.examSetManager?.draft?.selectedToAddIds?.size ?? 0;
  const examSetQuestionCount =
    adminState.examSetManager?.draft?.orderedProblemIds?.length ?? 0;

  if (gradeMode) {
    elements.listSummary.textContent =
      !appState.selectedCategory || appState.selectedCategory === "전체"
        ? "급수 배정: 상단에서 카테고리를 선택하세요."
        : `${categoryLabel} · 급수 배정 선택 ${gradeSelectionCount}개 / 표시 ${filteredProblems.length}개`;
  } else if (examSetMode) {
    elements.listSummary.textContent = `시험 세트 구성 · 추가 선택 ${examSetAddSelectionCount}개 · 세트 ${examSetQuestionCount}문제 · 표시 ${filteredProblems.length}개 (상단 필터 연동)`;
  } else {
    elements.listSummary.textContent = `${categoryLabel}에서 ${filteredProblems.length}개 문제를 표시합니다.`;
  }

  if (canPrint) {
    updatePrintSelectionControls();
  }

  if (filteredProblems.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-list-message";
    emptyMessage.textContent = gradeMode
      ? !appState.selectedCategory || appState.selectedCategory === "전체"
        ? "급수 배정을 위해 카테고리를 하나 선택해 주세요."
        : "조건에 맞는 문제가 없습니다."
      : "이 카테고리에는 아직 문제가 없습니다.";
    elements.problemCards.append(emptyMessage);
    updateGradeSummaryText?.();
    return;
  }

  filteredProblems.forEach(({ problem, index }, filteredIndex) => {
    try {
      const progressView = getProblemProgressView(problem, studentProgressByProblemId);
      const card = document.createElement("article");
      card.className = "problem-card";
      if (isProblemSortMode) {
        card.classList.add("is-reorderable");
      }
      card.dataset.problemId = problem.id;
      card.dataset.progressStatus = progressView.status;
      card.classList.toggle(
        "is-selected",
        canPrint && appState.selectedPrintProblemIds.has(problem.id),
      );
      const displayNumber = filteredIndex + 1;
      const problemNumberLabel = isProblemSortMode
        ? escapeHtml(`${displayNumber}번`)
        : escapeHtml(formatCategoryProblemLabel(problem, problems));
      const categoryLabel = escapeHtml(problem.category ?? "");
      const levelLabel = escapeHtml(problem.level ?? "");
      const boardSizeLabel = escapeHtml(getBoardSizeLabel(getProblemBoardSize(problem)));
      const gradeBadge = gradeMode
        ? `<span class="problem-card-grade">${escapeHtml(formatGradeLevelLabel(problem.gradeLevel))}</span>`
        : adminState.isEnabled && isCurrentUserAdmin() && adminState.listPanel === "problems"
          ? `<span class="problem-card-grade">${escapeHtml(formatGradeLevelLabel(problem.gradeLevel))}</span>`
          : "";
      const isGradeSelected = gradeMode && isProblemSelectedForGrade?.(problem.id);
      const alreadyInExamSet = examSetMode && isProblemInExamSet?.(problem.id);
      const isExamSetSelected =
        examSetMode && isProblemSelectedForExamSetAdd?.(problem.id);
      const hasStatusRow = Boolean(levelLabel || gradeBadge || progressView.badge);

      if (gradeMode) {
        card.classList.toggle("is-grade-assign-selected", isGradeSelected);
      }

      if (examSetMode) {
        card.classList.toggle("is-exam-set-selected", isExamSetSelected);
        card.classList.toggle("is-exam-set-included", alreadyInExamSet);
      }

      const printCardActionHtml = canPrint
        ? `
        <div class="problem-card-print-action">
          <button
            type="button"
            class="problem-print-select-btn"
            data-print-select
            aria-pressed="false"
            aria-label="문제집에 인쇄 추가"
          >
            <span class="problem-print-select-btn__icon" aria-hidden="true">🖨</span>
            <span class="problem-print-select-btn__label">인쇄 추가</span>
          </button>
        </div>`
        : "";

      card.innerHTML = `
        ${printCardActionHtml}
        <button class="problem-card-main" type="button"${isProblemSortMode || gradeMode || examSetMode ? " disabled" : ""}>
          <div class="problem-card-header">
            <div class="problem-card-meta-row">
              <div class="problem-card-meta-primary">
                <span class="problem-card-number">${problemNumberLabel}</span>
                <span class="problem-category-badge">${categoryLabel}</span>
                <span class="problem-board-size-badge">${boardSizeLabel}</span>
              </div>
              ${
                gradeMode
                  ? `
              <label class="problem-grade-assign-select">
                <input
                  type="checkbox"
                  data-grade-assign-select="${escapeHtml(problem.id)}"
                  ${isGradeSelected ? "checked" : ""}
                />
                <span>급수 선택</span>
              </label>`
                  : examSetMode
                    ? alreadyInExamSet
                      ? `
              <span class="problem-exam-set-included-badge">이미 추가됨</span>`
                      : `
              <label class="problem-exam-set-select">
                <input
                  type="checkbox"
                  data-exam-set-select="${escapeHtml(problem.id)}"
                  ${isExamSetSelected ? "checked" : ""}
                />
                <span>세트 선택</span>
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
              ${gradeBadge}
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
        const printSelectButton = card.querySelector("[data-print-select]");
        if (printSelectButton) {
          updateProblemPrintSelectButton(printSelectButton, problem.id);
          printSelectButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const nextSelected = !appState.selectedPrintProblemIds.has(problem.id);
            togglePrintProblemSelection(problem.id, nextSelected);
            card.classList.toggle("is-selected", nextSelected);
            updateProblemPrintSelectButton(printSelectButton, problem.id);
          });
        }
      }

      if (gradeMode) {
        const gradeSelect = card.querySelector("[data-grade-assign-select]");
        const gradeSelectLabel = card.querySelector(".problem-grade-assign-select");
        gradeSelect?.addEventListener("click", (event) => event.stopPropagation());
        gradeSelectLabel?.addEventListener("click", (event) => event.stopPropagation());
      }

      if (examSetMode && !alreadyInExamSet) {
        const examSelect = card.querySelector("[data-exam-set-select]");
        const examSelectLabel = card.querySelector(".problem-exam-set-select");
        examSelect?.addEventListener("click", (event) => event.stopPropagation());
        examSelectLabel?.addEventListener("click", (event) => event.stopPropagation());
      }

      if (!isProblemSortMode && !gradeMode && !examSetMode) {
        card.querySelector(".problem-card-main")?.addEventListener("click", () =>
          selectProblemById(problem.id),
        );
      }

      if (isProblemSortMode && problemReorder.canReorderInCurrentView()) {
        card.prepend(
          problemReorder.renderProblemReorderChrome(card, {
            problemNumber: displayNumber,
            isFirst: filteredIndex === 0,
            isLast: filteredIndex === filteredProblems.length - 1,
            problemId: problem.id,
          }),
        );
      } else if (
        adminState.isEnabled &&
        isCurrentUserAdmin() &&
        !isProblemSortMode &&
        !gradeMode &&
        !examSetMode
      ) {
        const actions = document.createElement("div");
        actions.className = "admin-card-actions";
        actions.innerHTML = `
          <button class="secondary-button" type="button" data-admin-action="edit">수정</button>
          <button class="danger-button" type="button" data-admin-action="delete">삭제</button>
        `;
        actions
          .querySelector('[data-admin-action="edit"]')
          ?.addEventListener("click", () => startEditingProblem(problem.id));
        actions
          .querySelector('[data-admin-action="delete"]')
          ?.addEventListener("click", () => deleteProblem(problem.id));
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

  if (gradeMode) {
    updateGradeSummaryText?.();
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

function updateProblemPrintSelectButton(button, problemId) {
  if (!button) {
    return;
  }

  const isSelected = appState.selectedPrintProblemIds.has(problemId);
  button.classList.toggle("is-active", isSelected);
  button.setAttribute("aria-pressed", String(isSelected));
  button.setAttribute(
    "aria-label",
    isSelected ? "문제집 선택 해제" : "문제집에 인쇄 추가",
  );

  const label = button.querySelector(".problem-print-select-btn__label");
  if (label) {
    label.textContent = isSelected ? "선택됨" : "인쇄 추가";
  }
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
    const printSelectButton = card.querySelector("[data-print-select]");
    if (printSelectButton) {
      updateProblemPrintSelectButton(printSelectButton, problemId);
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

function renderProblemPreviewBoard(element, problem, options = {}) {
  if (!element || !window.WGo || !Array.isArray(problem?.stones)) {
    return;
  }

  const boardSize = getProblemBoardSize(problem);
  const requestedWidth = Number(options.width);
  const boardWidth =
    Number.isFinite(requestedWidth) && requestedWidth > 0
      ? requestedWidth
      : element.clientWidth || 160;

  const previewBoard = new WGo.Board(element, {
    size: boardSize,
    width: boardWidth,
    section: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
  });

  problem.stones.forEach((stone) => {
    if (!isValidBoardPoint(stone, boardSize)) {
      return;
    }

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

  applyCandidateLabelsToWgoBoard(previewBoard, getProblemCandidateLabels(problem), boardSize);
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
  const gradeMode = isGradeAssignmentMode?.() ?? false;
  const examSetMode = isExamSetPickerMode?.() ?? false;

  if (examSetMode) {
    const sortMode =
      appState.problemListSort === PROBLEM_LIST_SORT.grade
        ? PROBLEM_LIST_SORT.grade
        : PROBLEM_LIST_SORT.learning;
    return sortFilteredProblemEntries(getExamSetPickerFilteredProblems(), { sortMode });
  }

  const filtered = problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => {
      if (normalizeLevelGroup(problem.levelGroup) !== levelGroup) {
        return false;
      }

      if (gradeMode) {
        if (!appState.selectedCategory || appState.selectedCategory === "전체") {
          return false;
        }

        if (problem.category !== appState.selectedCategory) {
          return false;
        }

        if (!matchesGradeAssignmentListFilter?.(problem)) {
          return false;
        }

        return matchesGradeLevelFilter(problem, appState.problemGradeFilter);
      }

      if (!appState.selectedCategory || appState.selectedCategory === "전체") {
        return matchesGradeLevelFilter(problem, appState.problemGradeFilter);
      }

      return (
        problem.category === appState.selectedCategory &&
        matchesGradeLevelFilter(problem, appState.problemGradeFilter)
      );
    });

  const sortMode =
    appState.problemListSort === PROBLEM_LIST_SORT.grade
      ? PROBLEM_LIST_SORT.grade
      : PROBLEM_LIST_SORT.learning;

  return sortFilteredProblemEntries(filtered, { sortMode });
}

let adminProblemListControlsBound = false;

function populateAdminGradeSelects() {
  if (elements.adminGradeTargetSelect) {
    elements.adminGradeTargetSelect.innerHTML = getGradeLevelSelectOptions({ includeUnassigned: false })
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
      )
      .join("");
  }

  if (elements.problemGradeFilter) {
    elements.problemGradeFilter.innerHTML = getGradeLevelFilterOptions()
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
      )
      .join("");
    elements.problemGradeFilter.value = appState.problemGradeFilter;
  }

  if (elements.problemListSort) {
    elements.problemListSort.value = appState.problemListSort;
  }
}

function bindAdminProblemListControls() {
  if (adminProblemListControlsBound) {
    return;
  }

  adminProblemListControlsBound = true;

  elements.problemListSort?.addEventListener("change", () => {
    appState.problemListSort = elements.problemListSort.value;
    renderProblemList();
    if (isGradeAssignmentMode?.()) {
      updateGradeSummaryText?.();
    }
  });

  elements.problemGradeFilter?.addEventListener("change", () => {
    appState.problemGradeFilter = elements.problemGradeFilter.value;
    renderProblemList();
    if (isGradeAssignmentMode?.()) {
      updateGradeSummaryText?.();
    }
  });
}

function updateAdminProblemListControlsVisibility() {
  const visible =
    adminState.isEnabled &&
    isCurrentUserAdmin() &&
    (adminState.listPanel === "problems" || adminState.listPanel === "grades");
  elements.adminProblemListControls?.classList.toggle("is-hidden", !visible);
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
  return canEnterAdminMode(getCurrentUser());
}

function isAcademyUser() {
  return canManageAcademy(getCurrentUser());
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
    learning: canViewLearningMenu(currentUser),
    academy: canViewAcademyMenu(currentUser),
    attendance: canManageAttendance(currentUser),
    payments: canViewPayments(currentUser),
    platform: canViewPlatformAdminMenu(currentUser),
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
  const gradeMode = isGradeAssignmentMode?.() ?? false;
  const examSetMode = isExamSetPickerMode?.() ?? false;

  elements.printPanel?.classList.toggle("is-hidden", !canPrint || gradeMode || examSetMode);
  elements.problemListScreen?.classList.toggle("has-print-features", canPrint);

  if (!canPrint) {
    elements.printPanel?.classList.remove("has-print-selection", "is-idle");
    elements.problemListScreen?.classList.remove("has-print-selection");
    return;
  }

  updatePrintSelectionControls();
}

function replaceProblemList(nextProblems) {
  problems.splice(0, problems.length, ...sortProblemsGlobally(nextProblems));
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
  renderGradeAssignmentPanel?.();
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

  if (message.includes("display_order")) {
    return "Supabase problems 테이블에 display_order 컬럼이 필요합니다. scripts/supabase-problems-display-order.sql 을 실행해 주세요.";
  }

  if (message.includes("grade_level")) {
    return "Supabase problems 테이블에 grade_level 컬럼이 필요합니다. scripts/supabase-problems-grade-level.sql 을 실행해 주세요.";
  }

  if (
    message.includes("target_white_group") ||
    message.includes("target_white_mark")
  ) {
    return "Supabase problems 테이블에 target_white_group/target_white_mark 컬럼이 필요합니다. scripts/supabase-problems-target-white-group.sql 을 실행해 주세요.";
  }

  if (message.includes("candidate_labels")) {
    return "Supabase problems 테이블에 candidate_labels 컬럼이 필요합니다. scripts/supabase-problems-candidate-labels.sql 을 실행해 주세요.";
  }

  if (message.includes("exam_sets") || message.includes("exam_set_questions")) {
    return "Supabase exam_sets 테이블이 필요합니다. scripts/supabase-exam-sets.sql 을 실행해 주세요.";
  }

  if (
    message.includes("bulk grade update returned no rows") ||
    message.includes("returned no rows")
  ) {
    return `Supabase ${actionLabel}이(가) 반영되지 않았습니다. admin 계정으로 Supabase 로그인했는지, scripts/supabase-problems-rls.sql 과 supabase-problems-grade-level.sql 을 실행했는지 확인해 주세요.`;
  }

  if (message.includes("permission denied: manage grade levels")) {
    return "플랫폼 admin 계정만 급수를 배정할 수 있습니다.";
  }

  if (message.includes("Supabase Auth 로그인") || message.includes("로그인 세션")) {
    return `${message} (문제 저장·급수 배정은 Supabase Auth 계정이 필요합니다.)`;
  }

  if (message.includes("JWT") || message.includes("401") || message.includes("Unauthorized")) {
    return "Supabase 인증(401)으로 저장이 거절되었습니다. 다시 로그인하고, admin/academy_owner/teacher 권한과 access token 상태를 확인해 주세요.";
  }

  if (message.includes("column")) {
    return `Supabase problems 테이블 컬럼 설정을 확인해 주세요: ${message}`;
  }

  return `Supabase 문제 ${actionLabel}에 실패했습니다.`;
}

function cloneBoardStones(stones = [], boardSize = BOARD_SIZE) {
  return sanitizeStones(stones, boardSize, "cloneBoardStones").map((stone) => ({
    ...stone,
  }));
}

function captureInitialBoardState(problem) {
  const boardSize = getProblemBoardSize(problem);
  appState.initialBoardStones = cloneBoardStones(problem?.stones ?? [], boardSize);
  appState.initialCandidateLabels = cloneCandidateLabels(
    getProblemCandidateLabels(problem),
    boardSize,
  );
  return appState.initialBoardStones;
}

function getBoardCandidateLabels(problem) {
  if (Array.isArray(appState.initialCandidateLabels) && appState.initialCandidateLabels.length > 0) {
    return appState.initialCandidateLabels;
  }
  return getProblemCandidateLabels(problem);
}

function cloneProblem(problem) {
  const boardSize = getProblemBoardSize(problem);
  const clonedProblem = {
    ...problem,
    levelGroup: normalizeLevelGroup(problem.levelGroup),
    type: problem.type === "ox" ? "ox" : "board",
    boardSize,
    correctMove: problem.correctMove ? { ...problem.correctMove } : null,
    stones: cloneBoardStones(problem.stones, boardSize),
  };

  if (clonedProblem.type === "ox") {
    clonedProblem.oxAnswer = Boolean(problem.oxAnswer);
  }

  if (Array.isArray(problem.correctSequence)) {
    clonedProblem.correctSequence = problem.correctSequence.map((move) => ({ ...move }));
  }

  const candidateLabels = cloneCandidateLabels(getProblemCandidateLabels(problem), boardSize);
  if (candidateLabels.length > 0) {
    clonedProblem.candidateLabels = candidateLabels;
    clonedProblem.candidate_labels = candidateLabels;
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

  let reviewOffer = null;
  try {
    reviewOffer = getReviewOffer(categoryName, problems, resolvedProgressMap, {
      levelGroup: normalizedLevelGroup,
    });
    if (reviewOffer) {
      const currentUser = getCurrentUser();
      ensureCategoryReviewOfferFromReviewOffer(currentUser, reviewOffer);
    }
  } catch (error) {
    console.error("[learning] getReviewOffer failed during category completion", {
      categoryName,
      levelGroup: normalizedLevelGroup,
      message: error?.message,
    });
  }

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
  hideBoardFeedback({ immediate: true });
  boardController.clearPreview();
  syncBoardPreviewContext();
  setMode("study");
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
      establishStudySolvePath(context.nextProblem.problem ?? problems[context.nextProblem.index], {
        source: "study-category-complete-next",
      });
      loadProblem(context.nextProblem.index, { source: "study-category-complete-next" });
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

  hideBoardFeedback();
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
    isOxProblem(problem) ? "O/X 판정이 맞습니다." : "핵심 급소를 찾았습니다.",
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
    const preset = nextReviewProblem ? "correctReviewNext" : "correctReviewDone";
    boardFeedbackOverlay.showCorrectPreset(preset, { duration: 1000 });

    if (nextReviewProblem) {
      appState.autoNextTimeout = window.setTimeout(() => {
        hideBoardFeedback();
        loadReviewProblem(appState.reviewSession.currentIndex + 1);
      }, 1000);
    } else {
      appState.autoNextTimeout = window.setTimeout(() => {
        hideBoardFeedback();
        clearReviewSession({ completeCategoryOffer: true });
        showStudyMode();
      }, 1000);
    }
    return;
  }

  if (appState.examSession) {
    const session = appState.examSession;
    session.correctCount = Number(session.correctCount ?? 0) + 1;
    const nextIndex = session.currentIndex + 1;
    const hasNext = nextIndex < session.problemIds.length;
    if (session.sessionMode === "mock") {
      showMockExamFeedback("correct");
    } else {
      boardFeedbackOverlay.showCorrectPreset(hasNext ? "correctNext" : "correctLast", {
        duration: 1000,
      });
    }

    if (hasNext) {
      appState.autoNextTimeout = window.setTimeout(() => {
        hideBoardFeedback();
        loadProblemById(session.problemIds[nextIndex], { examSessionIndex: nextIndex });
        if (session.sessionMode === "learning" && examSetLearningProgressService.isResumableQuestionBankSet(session)) {
          const user = getCurrentUser();
          if (user?.id && normalizeRole(user.role) === ROLES.student) {
            examSetLearningProgressService.saveLearningProgress({
              studentUserId: user.id,
              examSetId: session.examSetId,
              resumeIndex: nextIndex,
              totalQuestionCount: session.problemIds.length,
              problemIds: session.problemIds,
              completedProblemIds: session.problemIds.slice(0, nextIndex),
            });
          }
        }
      }, 1000);
    } else {
      appState.autoNextTimeout = window.setTimeout(async () => {
        hideBoardFeedback();
        const title = session.title;
        if (session.sessionMode === "mock") {
          await finishMockTestSession(session);
          return;
        }
        const user = getCurrentUser();
        if (
          user?.id &&
          normalizeRole(user.role) === ROLES.student &&
          examSetLearningProgressService.isResumableQuestionBankSet(session)
        ) {
          examSetLearningProgressService.clearLearningProgress(user.id, session.examSetId);
        }
        clearExamSession({ persistProgress: false });
        showListMode();
        void examCatalog.refreshExamCatalog();
        setFeedback(`"${title}" 세트를 완료했습니다.`, "correct");
      }, 1000);
    }
    return;
  }

  if (appState.studySolvePath) {
    completeProblemInStudyPath(problem, {
      levelGroup,
      wasCategoryCompleteBefore,
      progressAfterSolve,
    });
    return;
  }

  const completionContext = !wasCategoryCompleteBefore
    ? buildCategoryCompletionContext(problem.category, levelGroup, progressAfterSolve)
    : null;

  if (completionContext) {
    clearAutoNext();
    showCategoryCompleteModal(completionContext);
    renderStudyScreen();
    return;
  }

  const nextProblem = resolveNextProblemAfterComplete(problem);
  const preset = nextProblem ? "correctNext" : "correctLast";
  boardFeedbackOverlay.showCorrectPreset(preset, { duration: 1000 });

  logLearningFlow("completeProblem — auto next (problem bank)", {
    problemId: problem?.id,
    nextProblemId: nextProblem?.problem?.id ?? null,
    nextIndex: nextProblem?.index ?? null,
  });

  if (nextProblem) {
    appState.autoNextTimeout = window.setTimeout(() => {
      hideBoardFeedback();
      loadProblem(nextProblem.index, { source: "problem-bank-auto-next" });
    }, 1000);
  }
}

function completeProblemInStudyPath(problem, { levelGroup, wasCategoryCompleteBefore, progressAfterSolve }) {
  const studyPath = appState.studySolvePath;
  const remainingProblemIds = getRemainingUnsolvedProblemIds(studyPath, progressAfterSolve);
  const isActuallyLastProblem = isActuallyLastProblemInStudyPath(studyPath, progressAfterSolve);

  const nextProblem = isActuallyLastProblem
    ? null
    : getNextUnsolvedInStudyPath(
        studyPath,
        problems,
        progressAfterSolve,
        problem.id,
        appState.currentProblemId,
      );

  logStudyPathDiagnostics({
    studyPath,
    problem,
    appState,
    nextProblem,
    remainingProblemIds,
    isActuallyLastProblem,
  });

  const completionContext = !wasCategoryCompleteBefore
    ? buildCategoryCompletionContext(problem.category, levelGroup, progressAfterSolve)
    : null;

  if (isActuallyLastProblem) {
    clearAutoNext();
    if (completionContext) {
      logLearningFlow("completeProblem — study path category complete (modal)", {
        categoryName: problem.category,
      });
      showCategoryCompleteModal(completionContext);
      renderStudyScreen();
      return;
    }

    logLearningFlow("completeProblem — study path last (no modal context)", {
      categoryName: problem.category,
    });
    boardFeedbackOverlay.showCorrectPreset("correctLast", { duration: 1000 });
    return;
  }

  if (!nextProblem) {
    logLearningFlow("completeProblem — study path no next but not last (recover)", {
      remainingProblemIds,
    });
    if (completionContext) {
      clearAutoNext();
      showCategoryCompleteModal(completionContext);
      renderStudyScreen();
      return;
    }
    boardFeedbackOverlay.showCorrectPreset("correctLast", { duration: 1000 });
    return;
  }

  boardFeedbackOverlay.showCorrectPreset("correctNext", { duration: 1000 });
  logLearningFlow("completeProblem — study path auto next", {
    problemId: problem.id,
    nextProblemId: nextProblem.problem.id,
    nextIndex: nextProblem.index,
  });

  appState.autoNextTimeout = window.setTimeout(() => {
    hideBoardFeedback();
    loadProblem(nextProblem.index, { source: "auto-next-after-complete" });
  }, 1000);
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
  setFeedback(isOxProblem(problem) ? "O/X를 다시 선택해 보세요." : "다시 도전해 보세요.");

  clearWrongTimers();
  const preset = isOxProblem(problem) ? "wrongOx" : "wrong";
  boardFeedbackOverlay.showWrongPreset(preset, {
    duration: 1000,
    onHidden: () => restoreProblemInitialStateAfterWrong(problem),
  });
}

function handleMockExamWrong(problem) {
  const session = appState.examSession;
  if (!session || session.sessionMode !== "mock") {
    return false;
  }

  appState.isAiThinking = true;
  syncBoardPreviewContext();
  solveView.renderProblemSolveMode(problem);
  setStatus("오답입니다.");
  setFeedback("오답입니다. 잠시 후 다음 문제로 넘어갑니다.");
  clearWrongTimers();

  const nextIndex = session.currentIndex + 1;
  session.wrongProblemNumbers = [
    ...(Array.isArray(session.wrongProblemNumbers) ? session.wrongProblemNumbers : []),
    Number(session.currentIndex) + 1,
  ];
  const hasNext = nextIndex < session.problemIds.length;
  showMockExamFeedback("wrong");
  appState.autoNextTimeout = window.setTimeout(async () => {
    hideBoardFeedback();
    appState.isAiThinking = false;
    if (hasNext) {
      loadProblemById(session.problemIds[nextIndex], { examSessionIndex: nextIndex });
      return;
    }
    await finishMockTestSession(session);
  }, 850);
  return true;
}

/** AI 응수형: 오답 흑수 + 백 응수 표시 후 일반 오답 팝업 → 초기화 */
function finishAiResponseWrongReveal(problem) {
  appState.isAiThinking = true;
  syncBoardPreviewContext();
  solveView.renderProblemSolveMode(problem);
  setStatus("오답입니다.");
  setFeedback("다시 도전해 보세요.");

  clearWrongTimers();
  boardFeedbackOverlay.showWrongPreset("wrong", {
    duration: 1000,
    onHidden: () => {
      restoreProblemInitialStateAfterWrong(problem);
      if (shouldUseAiResponseSolve(problem)) {
        aiResponseSolve.initSession(problem);
      }
    },
  });
}

function restoreProblemInitialStateAfterWrong(problem) {
  appState.solvedAnswerKeys = new Set();
  appState.playedMoves = [];
  appState.isAiThinking = false;

  if (isOxProblem(problem)) {
    syncBoardPreviewContext();
    solveView.renderProblemSolveMode(problem);
    setStatus("O/X 판정");
    setFeedback("O/X 중 정답을 선택하세요.");
    return;
  }

  boardController.clearAnswerMarker();
  boardController.loadPosition(cloneBoardStones(appState.initialBoardStones ?? problem.stones), {
    candidateLabels: getBoardCandidateLabels(problem),
  });
  syncBoardPreviewContext();
  setStatus(`${getStoneLabel(STONE.black)} 차례입니다.`);
  setFeedback(getProblemStartFeedback(problem));
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

/** 문제은행 경로 전용 — 학습중 이어하기는 studySolvePath + completeProblemInStudyPath 사용 */
function resolveNextProblemAfterComplete(problem) {
  if (appState.studySolvePath) {
    return getNextUnsolvedInStudyPath(
      appState.studySolvePath,
      problems,
      getCurrentStudentProgressByProblemId(),
      problem.id,
      appState.currentProblemId,
    );
  }

  const fromListFilter = getNextProblemInCurrentCategory();
  if (fromListFilter) {
    logLearningFlow("resolveNextProblemAfterComplete — from list filter", {
      nextId: fromListFilter.problem?.id,
      nextIndex: fromListFilter.index,
    });
    return fromListFilter;
  }

  logLearningFlow("resolveNextProblemAfterComplete — no next (problem bank)", {
    problemId: problem?.id,
    selectedCategory: appState.selectedCategory,
  });
  return null;
}

function hideBoardFeedback({ immediate = false } = {}) {
  boardFeedbackOverlay.clearTimers();
  if (immediate) {
    boardFeedbackOverlay.forceHide();
    return;
  }
  boardFeedbackOverlay.hide();
}

function hideAnswerModal() {
  hideBoardFeedback();
}

function hideWrongModal() {
  hideBoardFeedback();
}

function clearWrongTimers() {
  boardFeedbackOverlay.clearTimers();

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
  if (isAiResponseProblem(problem)) {
    const count = problem.answerMoveCount ?? 1;
    return `AI 응수형 ${count}수 문제입니다. 흑만 두세요. 백은 시스템이 응수합니다.`;
  }

  if (shouldUseAiResponseUx(problem)) {
    return "흑으로 두세요. 오답이면 백 응수 후보(설정된 좌표)를 체험할 수 있습니다.";
  }

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
    boardSize: boardController.size,
    stoneColors: STONE,
  });

  if (result.capturedCount > 0) {
    boardController.setStones(result.stones);
  }
  return result.capturedCount;
}

function setStatus(message, options = {}) {
  if (elements.status) {
    elements.status.textContent = message;
  }

  elements.moveStatus?.classList.toggle("is-ai-response-turn", Boolean(options.aiResponseTurn));
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
  return String(value ?? "")
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
