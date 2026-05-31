import {
  bindAiResponseQaBatchReport,
  collectAiResponseQaBatchTargets,
  renderAiResponseQaBatchReportHtml,
  runAiResponseQaBatch,
} from "./ai-response-qa-batch.js";

export function createAiResponseQaBatchController({
  elements,
  adminState,
  appState,
  problems,
  boardSize,
  stoneColors,
  getActiveLevelGroup,
  requireAdminMode,
  setFeedback,
  escapeHtml,
}) {
  let running = false;
  let lastBatchReport = null;
  let batchManualMarks = new Set();
  let batchShowMode = "all";

  function isBatchUiVisible() {
    return (
      adminState.isEnabled &&
      adminState.listPanel === "problems" &&
      appState.mode === "list"
    );
  }

  function resetBatchSession(category) {
    batchManualMarks = new Set();
    batchShowMode = "all";
    lastBatchReport = null;
    const result = elements.adminAiResponseQaBatchResult;
    if (result) {
      result.dataset.staleCategory = category;
    }
  }

  function updateAiResponseQaBatchUi() {
    const button = elements.adminAiResponseQaBatchButton;
    const result = elements.adminAiResponseQaBatchResult;
    if (!button) {
      return;
    }

    const visible = isBatchUiVisible();
    button.classList.toggle("is-hidden", !visible);

    if (!visible) {
      return;
    }

    const category = String(appState.selectedCategory ?? "").trim();
    const disabled = running || !category || category === "전체";
    button.disabled = disabled;

    if (!category || category === "전체") {
      button.textContent = "AI 응수 일괄 미리보기";
      button.title = "카테고리를 하나 선택하세요.";
      return;
    }

    const targets = collectAiResponseQaBatchTargets({
      problems,
      category,
      levelGroup: getActiveLevelGroup(),
      boardSize,
    });
    const eligibleCount = targets.filter((entry) => entry.eligible).length;
    button.textContent = `${category} AI 응수 일괄 미리보기`;
    button.title = `미리보기 가능 ${eligibleCount}문제 (AI 응수 3·5·7수)`;

    if (!running && result?.dataset.staleCategory && result.dataset.staleCategory !== category) {
      result.classList.add("is-hidden");
      result.innerHTML = "";
      delete result.dataset.staleCategory;
      batchManualMarks = new Set();
      lastBatchReport = null;
    }
  }

  function renderBatchResult(container) {
    if (!container || !lastBatchReport?.ok) {
      return;
    }
    container.innerHTML = renderAiResponseQaBatchReportHtml(lastBatchReport, escapeHtml, {
      showMode: batchShowMode,
      manualMarks: batchManualMarks,
    });
    bindAiResponseQaBatchReport(container, lastBatchReport, escapeHtml, {
      manualMarks: batchManualMarks,
      showMode: batchShowMode,
    });
  }

  async function handleBatchQa() {
    if (!requireAdminMode() || running) {
      return;
    }

    const category = String(appState.selectedCategory ?? "").trim();
    if (!category || category === "전체") {
      setFeedback("카테고리를 하나 선택한 뒤 일괄 미리보기를 실행하세요.", "wrong");
      return;
    }

    const resultContainer = elements.adminAiResponseQaBatchResult;
    resetBatchSession(category);
    running = true;
    updateAiResponseQaBatchUi();

    if (resultContainer) {
      resultContainer.classList.remove("is-hidden");
      resultContainer.innerHTML = renderAiResponseQaBatchReportHtml(
        { ok: true },
        escapeHtml,
        {
          progress: {
            phase: "running",
            completed: 0,
            total: 0,
            currentLabel: "준비 중…",
          },
        },
      );
    }

    setFeedback(`${category} AI 응수 일괄 미리보기 시작…`, "neutral");

    try {
      const report = await runAiResponseQaBatch({
        problems,
        category,
        levelGroup: getActiveLevelGroup(),
        boardSize,
        stoneColors,
        onProgress: (progress) => {
          if (resultContainer) {
            resultContainer.innerHTML = renderAiResponseQaBatchReportHtml(
              { ok: true },
              escapeHtml,
              { progress },
            );
          }
        },
      });

      lastBatchReport = report;

      if (resultContainer) {
        renderBatchResult(resultContainer);
        resultContainer.dataset.staleCategory = category;
        resultContainer.classList.remove("is-hidden");
      }

      if (!report.ok) {
        setFeedback(report.error ?? "AI 응수 일괄 미리보기 실패", "wrong");
        return;
      }

      const { summary } = report;
      const markedCount = batchManualMarks.size;
      const message = `${category} 미리보기 완료 — ${summary.problems}문제 · ${summary.cases}케이스 · 수동 표시 ${markedCount}`;
      setFeedback(message, "correct");
    } catch (error) {
      console.error("[AI_QA_BATCH] run failed", error);
      const message = error?.message ?? "AI 응수 일괄 미리보기 중 오류";
      if (resultContainer) {
        resultContainer.innerHTML = `<p class="admin-ai-response-qa-error">${escapeHtml(message)}</p>`;
        resultContainer.classList.remove("is-hidden");
      }
      setFeedback(message, "wrong");
    } finally {
      running = false;
      updateAiResponseQaBatchUi();
    }
  }

  function bindAiResponseQaBatchEvents() {
    elements.adminAiResponseQaBatchButton?.addEventListener("click", () => {
      void handleBatchQa();
    });
  }

  return {
    bindAiResponseQaBatchEvents,
    updateAiResponseQaBatchUi,
  };
}
