import { examSetService } from "../services/exam-set-service.js";
import {
  formatExamSetTypeLabel,
  EXAM_SET_ROLE,
  EXAM_SET_TYPE,
  EXAM_SET_VISIBILITY,
} from "../services/exam-set-constants.js";
import { formatGradeLevelLabel } from "../services/grade-level-service.js";
import { normalizeRole, ROLES } from "../permissions/permission-service.js";
import { mockTestAttemptService } from "../services/mock-test-attempt-service.js";
import {
  examSetLearningProgressService,
  formatLearningProgressDate,
  getLearningProgressPercent,
  isResumableLearningProgress,
} from "../services/exam-set-learning-progress-service.js";

export function createExamCatalogController({
  elements,
  appState,
  getCurrentUser,
  escapeHtml,
  onStartExamSet,
  onPreviewExamSet,
  onShowMockResults,
  onHideMockResults,
}) {
  let catalogSets = [];
  let studentMockAttemptBySetId = new Map();
  let studentLearningProgressBySetId = new Map();
  let openMockResultsExamSetId = null;

  function bindExamCatalogEvents() {
    elements.examSetCatalogList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-start-exam-set-id]");
      if (!button) {
        return;
      }

      const examSetId = button.dataset.startExamSetId;
      const examSet = catalogSets.find((set) => set.id === examSetId);
      if (!examSet) {
        return;
      }

      void onStartExamSet?.(examSet);
      return;
    });

    elements.examSetCatalogList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preview-exam-set-id]");
      if (!button) {
        return;
      }
      const examSetId = button.dataset.previewExamSetId;
      const examSet = catalogSets.find((set) => set.id === examSetId);
      if (!examSet) {
        return;
      }
      void onPreviewExamSet?.(examSet);
    });

    elements.examSetCatalogList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view-mock-results-id]");
      if (!button) {
        return;
      }
      const examSetId = button.dataset.viewMockResultsId;
      const examSet = catalogSets.find((set) => set.id === examSetId);
      if (!examSet) {
        return;
      }
      toggleMockResults(examSet);
    });
  }

  function toggleMockResults(examSet) {
    if (openMockResultsExamSetId === examSet.id) {
      openMockResultsExamSetId = null;
      onHideMockResults?.();
      renderExamCatalog();
      return;
    }

    openMockResultsExamSetId = examSet.id;
    renderExamCatalog();
    void onShowMockResults?.(examSet);
  }

  function clearOpenMockResults() {
    if (!openMockResultsExamSetId) {
      return;
    }
    openMockResultsExamSetId = null;
    renderExamCatalog();
  }

  async function refreshExamCatalog() {
    if (!elements.examSetCatalog) {
      return;
    }

    const user = getCurrentUser();
    if (!user?.id) {
      elements.examSetCatalog.classList.add("is-hidden");
      return;
    }

    try {
      const result = await examSetService.listExamSetsForViewer({ user });
      catalogSets = result.sets ?? [];
      const questionBankSets = catalogSets.filter(
        (set) => String(set.setRole ?? "question_bank") === "question_bank",
      );
      const promotionPaperSets = catalogSets.filter(
        (set) => String(set.setRole ?? "question_bank") === "promotion_paper",
      );
      console.log("[ExamCatalog] loaded for viewer", {
        roleRaw: user.role,
        role: normalizeRole(user.role),
        count: catalogSets.length,
        questionBankCount: questionBankSets.length,
        promotionPaperCount: promotionPaperSets.length,
        promotionPapers: promotionPaperSets.map((set) => ({
          id: set.id,
          title: set.title,
          setRole: set.setRole,
          status: set.status,
          visibility: set.visibility,
          availableFrom: set.availableFrom,
          availableUntil: set.availableUntil,
        })),
        titles: catalogSets.map((set) => set.title),
      });
    } catch (error) {
      console.error("[ExamCatalog] load failed", error);
      catalogSets = [];
    }

    await loadStudentMockAttempts(user);
    loadStudentLearningProgress(user);
    renderExamCatalog();
    if (openMockResultsExamSetId) {
      const openSet = catalogSets.find((set) => set.id === openMockResultsExamSetId);
      if (openSet) {
        void onShowMockResults?.(openSet);
      } else {
        openMockResultsExamSetId = null;
        onHideMockResults?.();
      }
    }
  }

  function loadStudentLearningProgress(user) {
    studentLearningProgressBySetId = new Map();
    if (normalizeRole(user?.role) !== ROLES.student || !user?.id) {
      return;
    }
    studentLearningProgressBySetId = examSetLearningProgressService.getAllLearningProgress(user.id);
  }

  async function loadStudentMockAttempts(user) {
    studentMockAttemptBySetId = new Map();
    if (normalizeRole(user?.role) !== ROLES.student || !user?.id) {
      return;
    }

    const mockSets = catalogSets.filter((set) => set.type === EXAM_SET_TYPE.mockTest);
    await Promise.all(
      mockSets.map(async (set) => {
        const result = await mockTestAttemptService.getLatestMockTestAttemptForStudent({
          user,
          examSetId: set.id,
        });
        if (result.ok && result.attempt) {
          studentMockAttemptBySetId.set(set.id, result.attempt);
        }
      }),
    );
  }

  function renderExamCatalog() {
    if (!elements.examSetCatalog || !elements.examSetCatalogList) {
      return;
    }

    const user = getCurrentUser();
    if (!user?.id) {
      elements.examSetCatalog.classList.add("is-hidden");
      return;
    }

    elements.examSetCatalog.classList.remove("is-hidden");

    if (elements.examSetCatalog instanceof HTMLDetailsElement) {
      elements.examSetCatalog.open = Boolean(appState.examSession?.title);
    }

    if (elements.examSetCatalogSummary) {
      if (appState.examSession?.title) {
        elements.examSetCatalogSummary.textContent = `진행 중: ${appState.examSession.title}`;
      } else if (catalogSets.length === 0) {
        elements.examSetCatalogSummary.textContent =
          "현재 이용 가능한 게시 세트가 없습니다. (비공개·초안 세트는 표시되지 않습니다)";
      } else {
        elements.examSetCatalogSummary.textContent =
          "게시된 시험 세트를 선택해 풀이를 시작하세요. 학원·학생·원장 계정도 문제은행에서 동일하게 보입니다.";
      }
    }

    if (catalogSets.length === 0) {
      elements.examSetCatalogList.innerHTML = `
        <p class="exam-set-catalog-empty">표시할 기출/시험 세트가 없습니다.</p>`;
      return;
    }

    elements.examSetCatalogList.innerHTML = catalogSets
      .map((set) => {
        const gradeLabel = set.gradeLevel
          ? formatGradeLevelLabel(set.gradeLevel)
          : "급수 미지정";
        const typeLabel = formatExamSetTypeLabel(set.type);
        const count = set.questionCount ?? 0;
        const studentAttempt = studentMockAttemptBySetId.get(set.id) ?? null;
        const role = normalizeRole(user?.role);
        const mockCompleted =
          set.type === EXAM_SET_TYPE.mockTest && role === ROLES.student && Boolean(studentAttempt);
        const learningProgress = studentLearningProgressBySetId.get(set.id) ?? null;
        const hasLearningProgress = isResumableLearningProgress(learningProgress);
        const primaryAction = resolveExamCatalogPrimaryAction(set, user, {
          mockCompleted,
          hasLearningProgress,
        });
        const visibilityNote =
          set.visibility === EXAM_SET_VISIBILITY.academy
            ? " · 학원 공개"
            : set.visibility === EXAM_SET_VISIBILITY.public
              ? " · 전체 공개"
              : "";
        const learningProgressNote =
          hasLearningProgress && learningProgress
            ? `<p class="exam-set-card-learning-progress">진행률 ${getLearningProgressPercent(learningProgress)}% · ${learningProgress.resumeIndex} / ${learningProgress.totalQuestionCount} 완료</p>
              <p class="exam-set-card-learning-date">최근 학습 ${escapeHtml(formatLearningProgressDate(learningProgress.updatedAt))}</p>`
            : "";

        const showResultButton = canViewMockResultButton(user, set, studentAttempt);
        const resultsOpen = openMockResultsExamSetId === set.id;
        const resultsButtonLabel = resultsOpen ? "▲ 결과 닫기" : "▼ 결과 보기";
        return `
          <article class="exam-set-card${mockCompleted ? " exam-set-card--mock-complete" : ""}">
            <div class="exam-set-card-body">
              <h4 class="exam-set-card-title">${escapeHtml(set.title)}</h4>
              ${
                mockCompleted
                  ? `<p class="exam-set-card-mock-score">정답률 <strong>${studentAttempt.accuracyRate}%</strong></p>
              <p class="exam-set-card-mock-subscore">${studentAttempt.correctCount} / ${studentAttempt.totalQuestionCount}</p>`
                  : ""
              }
              ${learningProgressNote}
              <p class="exam-set-card-meta">${escapeHtml(gradeLabel)} · ${escapeHtml(typeLabel)} · ${count}문제${escapeHtml(visibilityNote)}</p>
              ${
                set.description
                  ? `<p class="exam-set-card-description">${escapeHtml(set.description)}</p>`
                  : ""
              }
            </div>
            <div class="exam-set-card-actions">
              ${
                primaryAction
                  ? `<button
                type="button"
                class="primary-button exam-set-card-action"
                ${
                  primaryAction.kind === "preview"
                    ? `data-preview-exam-set-id="${escapeHtml(set.id)}"`
                    : `data-start-exam-set-id="${escapeHtml(set.id)}"`
                }
                ${count === 0 ? "disabled" : ""}
              >${escapeHtml(primaryAction.label)}</button>`
                  : ""
              }
              ${
                showResultButton
                  ? `<button
                type="button"
                class="${mockCompleted || resultsOpen ? "primary-button exam-set-card-action" : "ghost-button exam-set-card-action-secondary"}${resultsOpen ? " is-active" : ""}"
                data-view-mock-results-id="${escapeHtml(set.id)}"
                aria-expanded="${resultsOpen ? "true" : "false"}"
              >${escapeHtml(resultsButtonLabel)}</button>`
                  : ""
              }
            </div>
          </article>`;
      })
      .join("");
  }

  function syncOpenMockResults(examSetId) {
    openMockResultsExamSetId = examSetId || null;
    renderExamCatalog();
  }

  return {
    bindExamCatalogEvents,
    refreshExamCatalog,
    renderExamCatalog,
    clearOpenMockResults,
    syncOpenMockResults,
  };
}

function isExamCatalogStaffRole(role) {
  return role === ROLES.admin || role === ROLES.academyOwner || role === ROLES.teacher;
}

function resolveExamCatalogPrimaryAction(set, user, { mockCompleted = false, hasLearningProgress = false } = {}) {
  const role = normalizeRole(user?.role);

  if (mockCompleted) {
    return null;
  }

  if (set?.setRole === EXAM_SET_ROLE.promotionPaper) {
    return { kind: "start", label: "승급심사 시험지 열람" };
  }

  if (set?.type === EXAM_SET_TYPE.promotionTest) {
    return { kind: "start", label: "승급시험 응시" };
  }

  if (set?.type === EXAM_SET_TYPE.mockTest) {
    if (isExamCatalogStaffRole(role)) {
      return { kind: "preview", label: "문제 열람" };
    }
    return { kind: "start", label: "모의시험 시작" };
  }

  if (examSetLearningProgressService.isResumableQuestionBankSet(set) && hasLearningProgress) {
    return { kind: "start", label: "이어서 학습하기" };
  }

  return { kind: "start", label: "기출문제 풀기" };
}

function canViewMockResultButton(user, set, studentAttempt = null) {
  if (set?.type !== EXAM_SET_TYPE.mockTest) {
    return false;
  }
  const role = normalizeRole(user?.role);
  if (role === ROLES.student) {
    return Boolean(studentAttempt);
  }
  return role === ROLES.admin || role === ROLES.academyOwner || role === ROLES.teacher;
}
