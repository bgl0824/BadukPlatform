import {
  formatGradeLevelLabel,
  getGradeLevelSelectOptions,
  normalizeGradeLevelCode,
} from "../services/grade-level-service.js";

export function renderProblemCardGradeSelectHtml(problem, escapeHtml) {
  const current = normalizeGradeLevelCode(problem?.gradeLevel) ?? "";
  const options = getGradeLevelSelectOptions({ includeUnassigned: true })
    .map((option) => {
      const selected = option.value === current ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join("");

  return `<select
    class="problem-card-grade-select"
    data-inline-grade-problem-id="${escapeHtml(problem.id)}"
    aria-label="${escapeHtml(formatGradeLevelLabel(problem.gradeLevel))} 급수 변경"
  >${options}</select>`;
}

export function createInlineGradeEditor({
  problems,
  problemService,
  ProblemStore,
  getCurrentUser,
  requireAdminMode,
  setFeedback,
  getProblemStoreErrorMessage,
  isGradeAssignmentMode,
  applyGradeToMemory,
  patchGradeCards,
}) {
  const savingProblemIds = new Set();
  let eventsBound = false;

  function isSaving(problemId) {
    return savingProblemIds.has(problemId);
  }

  function bindInlineGradeEvents(problemCardsRoot) {
    if (eventsBound || !problemCardsRoot) {
      return;
    }

    eventsBound = true;

    problemCardsRoot.addEventListener("change", (event) => {
      const select = event.target.closest("[data-inline-grade-problem-id]");
      if (!select || !isGradeAssignmentMode()) {
        return;
      }

      event.stopPropagation();
      void handleInlineGradeChange(select);
    });

    problemCardsRoot.addEventListener("click", (event) => {
      if (event.target.closest("[data-inline-grade-problem-id]")) {
        event.stopPropagation();
      }
    });
  }

  async function handleInlineGradeChange(select) {
    if (!requireAdminMode() || !isGradeAssignmentMode()) {
      return;
    }

    const problemId = select.dataset.inlineGradeProblemId;
    if (!problemId || isSaving(problemId)) {
      return;
    }

    const problem = problems.find((entry) => entry.id === problemId);
    if (!problem) {
      return;
    }

    const previousGrade = normalizeGradeLevelCode(problem.gradeLevel);
    const nextGrade = normalizeGradeLevelCode(select.value);

    if (previousGrade === nextGrade) {
      return;
    }

    savingProblemIds.add(problemId);
    select.disabled = true;
    select.classList.add("is-saving");

    try {
      await problemService.bulkSetGradeLevels({
        user: getCurrentUser(),
        problemIds: [problemId],
        gradeLevel: nextGrade,
        ProblemStore,
      });

      applyGradeToMemory(problemId, nextGrade);
      patchGradeCards([problemId]);

      setFeedback(
        `${formatGradeLevelLabel(nextGrade, { emptyLabel: "급수 미지정" })}(으)로 변경했습니다.`,
        "correct",
      );
    } catch (error) {
      console.error("[InlineGradeEditor] save failed", error);
      select.value = previousGrade ?? "";
      const message =
        getProblemStoreErrorMessage?.(error, "급수 변경") ?? "급수 변경에 실패했습니다.";
      setFeedback(message, "wrong");
    } finally {
      savingProblemIds.delete(problemId);
      if (select.isConnected) {
        select.disabled = false;
        select.classList.remove("is-saving");
      }
    }
  }

  return {
    renderProblemCardGradeSelectHtml,
    bindInlineGradeEvents,
    isSaving,
    handleInlineGradeChange,
  };
}
