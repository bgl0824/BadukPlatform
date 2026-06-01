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
  let batchShowMode = "issues";
  let abortController = null;

  function isBatchUiVisible() {
    return (
      adminState.isEnabled &&
      adminState.listPanel === "problems" &&
      appState.mode === "list"
    );
  }

  function resetBatchSession(category) {
    batchManualMarks = new Set();
    batchShowMode = "issues";
    lastBatchReport = null;
    abortController = null;
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
    button.textContent = running
      ? `${category} QA 실행 중…`
      : `${category} AI 응수 일괄 미리보기`;
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

  function bindCancelButton(container) {
    if (!container || container.__qaCancelBound) {
      return;
    }
    container.__qaCancelBound = true;
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-qa-cancel]");
      if (!button || !container.contains(button)) {
        return;
      }
      abortController?.abort();
      setFeedback("QA 중단 요청됨…", "neutral");
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
    abortController = new AbortController();
    updateAiResponseQaBatchUi();

    if (resultContainer) {
      resultContainer.classList.remove("is-hidden");
      resultContainer.innerHTML = renderAiResponseQaBatchReportHtml(
        { ok: true },
        escapeHtml,
        {
          progress: {
            phase: "running",
            problemIndex: 0,
            problemTotal: 0,
            completedCases: 0,
            caseTotal: 0,
            currentLabel: "준비 중…",
            etaMs: null,
          },
        },
      );
      bindCancelButton(resultContainer);
    }

    setFeedback(`${category} AI 응수 일괄 미리보기 시작…`, "neutral");

    try {
      const report = await runAiResponseQaBatch({
        problems,
        category,
        levelGroup: getActiveLevelGroup(),
        boardSize,
        stoneColors,
        signal: abortController.signal,
        waitForKatago: true,
        onProgress: (progress) => {
          if (resultContainer) {
            resultContainer.innerHTML = renderAiResponseQaBatchReportHtml(
              { ok: true },
              escapeHtml,
              { progress },
            );
            bindCancelButton(resultContainer);
          }
        },
      });

      lastBatchReport = report;

      if (resultContainer) {
        if (report.aborted && report.partial) {
          lastBatchReport = { ...report, ok: true };
          renderBatchResult(resultContainer);
        } else if (report.aborted) {
          resultContainer.innerHTML = renderAiResponseQaBatchReportHtml(report, escapeHtml);
        } else {
          renderBatchResult(resultContainer);
        }
        resultContainer.dataset.staleCategory = category;
        resultContainer.classList.remove("is-hidden");
      }

      if (!report.ok) {
        setFeedback(report.error ?? "AI 응수 일괄 미리보기 실패", report.aborted ? "neutral" : "wrong");
        return;
      }

      const { summary } = report;
      const message = `${category} 미리보기 완료 — ${summary.problems}문제 · ${summary.cases}케이스 · fallback ${summary.fallbackCount}`;
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
      abortController = null;
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
