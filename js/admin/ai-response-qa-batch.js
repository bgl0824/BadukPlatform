/**
 * AI 응수 QA 일괄 미리보기 — runAiResponseQa 재사용 (엔진/DB 수정 없음)
 */

import { isAiResponseProblem } from "../game/problem-mode.js";
import { formatCategoryProblemLabel } from "../services/category-problem-number.js";
import { getProblemsInCategoryOrder } from "../services/learning-flow-service.js";
import {
  bindQaManualMarkEvents,
  buildQaCaseKey,
  filterCasesForDisplay,
  isCaseManuallyMarked,
  renderQaInspectionCaseCard,
} from "./ai-response-qa-inspection.js";
import {
  beginQaSession,
  endQaSession,
  formatQaEta,
  isQaManualMarkEnabled,
  resolveQaRunMode,
  throwIfQaAborted,
} from "./ai-response-qa-session.js";
import {
  buildQaAggregateSummary,
  countQaCasesForProblem,
  renderQaAggregateSummaryHtml,
  runAiResponseQa,
  validateAiResponseQaProblem,
} from "./ai-response-qa.js";

function attachCaseKeys(results, problemId, problemLabel) {
  return (results ?? []).map((row) => ({
    ...row,
    caseKey: buildQaCaseKey(problemId, row),
    problemLabel,
  }));
}

function countMarkedCases(cases, manualMarks) {
  return cases.filter((row) => isCaseManuallyMarked(manualMarks, row.caseKey)).length;
}

/**
 * @param {object} params
 */
export function collectAiResponseQaBatchTargets({
  problems,
  category,
  levelGroup,
  boardSize,
}) {
  const normalizedCategory = String(category ?? "").trim();
  if (!normalizedCategory || normalizedCategory === "전체") {
    return [];
  }

  return getProblemsInCategoryOrder(normalizedCategory, problems, { levelGroup })
    .map((entry) => entry.problem)
    .filter((problem) => isAiResponseProblem(problem))
    .map((problem) => {
      const validation = validateAiResponseQaProblem(problem, boardSize);
      return {
        problem,
        validation,
        eligible: validation.ok,
      };
    });
}

function estimateBatchCaseTotal(eligibleTargets, boardSize, stoneColors) {
  let total = 0;
  for (const target of eligibleTargets) {
    total += countQaCasesForProblem(target.problem, boardSize, stoneColors);
  }
  return total;
}

/**
 * @param {object} progress
 * @param {(value: string) => string} escapeHtml
 */
export function renderQaBatchProgressHtml(progress, escapeHtml) {
  const problemPct =
    progress.problemTotal > 0
      ? Math.round((progress.problemIndex / progress.problemTotal) * 100)
      : 0;
  const casePct =
    progress.caseTotal > 0
      ? Math.round((progress.completedCases / progress.caseTotal) * 100)
      : 0;

  return `
    <div class="admin-ai-response-qa-batch-panel" data-qa-progress-root>
      <div class="admin-ai-response-qa-progress" role="status" aria-live="polite">
        <p class="admin-ai-response-qa-batch-progress">
          <strong>문제</strong> ${escapeHtml(String(progress.problemIndex))} / ${escapeHtml(String(progress.problemTotal))}
          · <strong>응수 케이스</strong> ${escapeHtml(String(progress.completedCases))} / ${escapeHtml(String(progress.caseTotal))}
        </p>
        <div class="admin-ai-response-qa-progress-bars">
          <div class="admin-ai-response-qa-progress-track" title="문제 진행">
            <div class="admin-ai-response-qa-progress-fill" style="width:${problemPct}%"></div>
          </div>
          <div class="admin-ai-response-qa-progress-track" title="응수 케이스 진행">
            <div class="admin-ai-response-qa-progress-fill admin-ai-response-qa-progress-fill--cases" style="width:${casePct}%"></div>
          </div>
        </div>
        ${
          progress.currentLabel
            ? `<p class="admin-field-hint">현재 문제: ${escapeHtml(progress.currentLabel)}${
                progress.currentCaseLabel
                  ? ` · 응수 ${escapeHtml(progress.currentCaseLabel)}`
                  : ""
              }</p>`
            : ""
        }
        <p class="admin-field-hint">
          예상 남은 시간: ${escapeHtml(formatQaEta(progress.etaMs))}
          · 모드: ${escapeHtml(progress.qaModeLabel ?? "—")}
          ${progress.qaWaitForKatago ? " · KataGo 완료 대기" : " · replace_window 허용(빠른)"}
        </p>
        <button type="button" class="secondary-button admin-ai-response-qa-cancel" data-qa-cancel>중단</button>
      </div>
    </div>
  `;
}

/**
 * @param {object} params
 */
export async function runAiResponseQaBatch({
  problems,
  category,
  levelGroup,
  boardSize,
  stoneColors,
  onProgress,
  signal = null,
  waitForKatago = true,
  qaMode = waitForKatago ? "precise" : "fast",
}) {
  const runMode = resolveQaRunMode(qaMode);
  const resolvedWaitForKatago = runMode.waitForKatago;

  beginQaSession({ qaMode: runMode.id, waitForKatago: resolvedWaitForKatago, signal });
  const normalizedCategory = String(category ?? "").trim();
  if (!normalizedCategory || normalizedCategory === "전체") {
    return { ok: false, error: "카테고리를 하나 선택한 뒤 일괄 미리보기를 실행하세요." };
  }

  try {
    const targets = collectAiResponseQaBatchTargets({
      problems,
      category: normalizedCategory,
      levelGroup,
      boardSize,
    });

    if (targets.length === 0) {
      return {
        ok: false,
        error: `${normalizedCategory}에 AI 응수형(3·5·7수) 문제가 없습니다.`,
      };
    }

    const eligibleTargets = targets.filter((entry) => entry.eligible);
    if (eligibleTargets.length === 0) {
      return {
        ok: false,
        error: `${normalizedCategory} AI 응수형 문제가 있으나 미리보기 가능한 문제가 없습니다.`,
        skippedPreview: targets.map((entry) => entry.validation.error).slice(0, 3),
      };
    }

    const caseTotal = estimateBatchCaseTotal(eligibleTargets, boardSize, stoneColors);
    const items = [];
    let completedProblems = 0;
    let completedCases = 0;
    const batchStartMs = Date.now();

    for (const target of targets) {
      throwIfQaAborted(signal);

      const { problem, validation, eligible } = target;
      const label = formatCategoryProblemLabel(problem, problems);
      const problemId = problem?.id ?? label;

      onProgress?.({
        phase: "running",
        problemIndex: completedProblems,
        problemTotal: targets.length,
        completedCases,
        caseTotal,
        currentLabel: label,
        currentCaseLabel: null,
        etaMs: null,
        qaMode: runMode.id,
        qaModeLabel: runMode.label,
        qaWaitForKatago: resolvedWaitForKatago,
      });

      if (!eligible) {
        items.push({
          problem,
          problemId,
          label,
          skipped: true,
          skipReason: validation.error,
          cases: [],
        });
        completedProblems += 1;
        continue;
      }

      const report = await runAiResponseQa({
        problem,
        boardSize,
        stoneColors,
        signal,
        onCaseProgress: (caseProgress) => {
          const caseIndexInBatch = completedCases + caseProgress.caseIndex;
          const elapsed = Date.now() - batchStartMs;
          const avgMs = caseIndexInBatch > 0 ? elapsed / caseIndexInBatch : null;
          const remaining = caseTotal - caseIndexInBatch;
          const etaMs = avgMs != null ? avgMs * remaining : null;

          onProgress?.({
            phase: "running",
            problemIndex: completedProblems + 1,
            problemTotal: targets.length,
            completedCases: caseIndexInBatch,
            caseTotal,
            currentLabel: label,
            currentCaseLabel: `${caseProgress.blackPly ?? "?"}흑 ${caseProgress.candidateMove ?? ""}`,
            etaMs,
            qaMode: runMode.id,
            qaModeLabel: runMode.label,
            qaWaitForKatago: resolvedWaitForKatago,
          });
        },
      });

      const cases = report.ok
        ? attachCaseKeys(report.results, problemId, label)
        : [];

      completedCases += cases.length;

      items.push({
        problem,
        problemId,
        label,
        skipped: false,
        report,
        error: report.ok ? null : report.error,
        cases,
      });

      completedProblems += 1;

      const elapsed = Date.now() - batchStartMs;
      const avgMs = completedCases > 0 ? elapsed / completedCases : null;
      const remaining = caseTotal - completedCases;
      onProgress?.({
        phase: "running",
        problemIndex: completedProblems,
        problemTotal: targets.length,
        completedCases,
        caseTotal,
        currentLabel: label,
        currentCaseLabel: null,
        etaMs: avgMs != null ? avgMs * remaining : null,
        qaMode: runMode.id,
        qaModeLabel: runMode.label,
        qaWaitForKatago: resolvedWaitForKatago,
      });
    }

    const scannedItems = items.filter((item) => !item.skipped);
    const allCases = scannedItems.flatMap((item) => item.cases ?? []);
    const aggregate = buildQaAggregateSummary(allCases);

    return {
      ok: true,
      category: normalizedCategory,
      levelGroup,
      qaMode: runMode.id,
      qaModeLabel: runMode.label,
      items,
      allCases,
      aggregate,
      summary: {
        problems: scannedItems.length,
        cases: allCases.length,
        skipped: items.filter((item) => item.skipped).length,
        errors: scannedItems.filter((item) => item.error).length,
        good: aggregate.good,
        review: aggregate.review,
        problem: aggregate.problem,
        fallbackCount: aggregate.fallbackCount,
      },
    };
  } catch (error) {
    if (error?.code === "QA_ABORTED" || error?.name === "QaAbortedError") {
      const scannedItems = items.filter((item) => !item.skipped);
      const allCases = scannedItems.flatMap((item) => item.cases ?? []);
      const aggregate = buildQaAggregateSummary(allCases);
      return {
        ok: false,
        aborted: true,
        partial: allCases.length > 0,
        category: normalizedCategory,
        levelGroup,
        items,
        allCases,
        aggregate,
        error: error.message ?? "QA 실행이 중단되었습니다.",
        summary: {
          problems: scannedItems.length,
          cases: allCases.length,
          skipped: items.filter((item) => item.skipped).length,
          errors: scannedItems.filter((item) => item.error).length,
          good: aggregate.good,
          review: aggregate.review,
          problem: aggregate.problem,
          fallbackCount: aggregate.fallbackCount,
        },
      };
    }
    throw error;
  } finally {
    endQaSession();
  }
}

function renderBatchProblemGroup(item, escapeHtml, manualMarks, showMode) {
  if (item.skipped) {
    return `
      <details class="admin-ai-response-qa-batch-problem is-skipped">
        <summary>${escapeHtml(item.label)} · 스킵</summary>
        <p class="admin-field-hint">${escapeHtml(item.skipReason ?? "점검 대상 아님")}</p>
      </details>
    `;
  }

  const cases = filterCasesForDisplay(item.cases ?? [], { showMode, manualMarks });
  const markedInProblem = isQaManualMarkEnabled()
    ? countMarkedCases(item.cases ?? [], manualMarks)
    : 0;

  if (showMode !== "all" && cases.length === 0) {
    return "";
  }

  const cards = cases
    .map((row) =>
      renderQaInspectionCaseCard({
        row,
        caseKey: row.caseKey,
        problemLabel: item.label,
        manualMarked: isCaseManuallyMarked(manualMarks, row.caseKey),
        escapeHtml,
      }),
    )
    .join("");

  const errorNote = item.error
    ? `<p class="admin-ai-response-qa-error">${escapeHtml(item.error)}</p>`
    : "";

  const manualSuffix = isQaManualMarkEnabled() ? ` · 수동 ${markedInProblem}` : "";

  return `
    <details class="admin-ai-response-qa-batch-problem">
      <summary>
        ${escapeHtml(item.label)}
        · ${(item.cases ?? []).length}케이스
        ${manualSuffix}
      </summary>
      ${errorNote}
      <div class="admin-ai-response-qa-inspection-cards">${cards}</div>
    </details>
  `;
}

/**
 * @param {object} report
 * @param {(value: string) => string} escapeHtml
 * @param {{ progress?: object|null, showMode?: 'all'|'issues'|'marked', manualMarks?: Set<string> }} [options]
 */
export function renderAiResponseQaBatchReportHtml(
  report,
  escapeHtml,
  { progress = null, showMode = "issues", manualMarks = new Set() } = {},
) {
  if (progress?.phase === "running") {
    return renderQaBatchProgressHtml(progress, escapeHtml);
  }

  if (report?.aborted) {
    return `<p class="admin-ai-response-qa-error">${escapeHtml(report.error ?? "QA 실행이 중단되었습니다.")}</p>`;
  }

  if (!report?.ok) {
    return `<p class="admin-ai-response-qa-error">${escapeHtml(report?.error ?? "일괄 미리보기 실패")}</p>`;
  }

  const { summary, category, levelGroup, items = [], allCases = [], aggregate } = report;
  const resolvedAggregate = aggregate ?? buildQaAggregateSummary(allCases);
  const markedCount = isQaManualMarkEnabled()
    ? countMarkedCases(allCases, manualMarks)
    : 0;
  const issueCount = allCases.filter((row) => row.verdict !== "good").length;
  const skippedNote =
    summary.skipped > 0
      ? `<p class="admin-field-hint">스킵 ${summary.skipped}문제 (1수·수순 미완성 등)</p>`
      : "";

  const groups = items
    .map((item) => renderBatchProblemGroup(item, escapeHtml, manualMarks, showMode))
    .filter(Boolean)
    .join("");

  const emptyMessage =
    showMode === "marked" && markedCount === 0
      ? `<p class="admin-field-hint">수동 표시된 케이스가 없습니다. (디버그 모드)</p>`
      : showMode === "issues" && issueCount === 0
        ? `<p class="admin-field-hint">검토·문제 케이스가 없습니다. 전체 보기로 전환하세요.</p>`
        : "";

  const manualFilterOption = isQaManualMarkEnabled()
    ? `<option value="marked"${showMode === "marked" ? " selected" : ""}>수동 표시 (${markedCount})</option>`
    : "";

  return `
    <div class="admin-ai-response-qa-batch-panel" data-qa-batch-root>
      <header class="admin-ai-response-qa-batch-head">
        <p class="panel-label">${escapeHtml(category)} AI 응수 일괄 미리보기 · ${escapeHtml(levelGroup ?? "")}${report.qaModeLabel ? ` · ${escapeHtml(report.qaModeLabel)}` : ""}</p>
        ${renderQaAggregateSummaryHtml(resolvedAggregate, escapeHtml)}
        <div class="admin-ai-response-qa-toolbar">
          <p class="admin-ai-response-qa-summary">
            문제 ${summary.problems} · 응수 ${summary.cases}건 · 카드 표시 ${showMode === "all" ? summary.cases : issueCount}건
          </p>
          <label class="admin-ai-response-qa-filter">
            표시:
            <select data-qa-batch-show-mode>
              <option value="issues"${showMode === "issues" ? " selected" : ""}>검토·문제만 (${issueCount})</option>
              <option value="all"${showMode === "all" ? " selected" : ""}>전체 (${summary.cases})</option>
              ${manualFilterOption}
            </select>
          </label>
        </div>
        ${skippedNote}
      </header>
      ${emptyMessage}
      <div class="admin-ai-response-qa-batch-groups">${groups}</div>
    </div>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {object} report
 * @param {(value: string) => string} escapeHtml
 * @param {{ manualMarks?: Set<string> }} [options]
 */
export function bindAiResponseQaBatchReport(container, report, escapeHtml, options = {}) {
  if (!container || !report?.ok) {
    return;
  }

  const manualMarks = options.manualMarks ?? new Set();
  let showMode = options.showMode ?? "issues";

  const rerender = () => {
    showMode = container.__qaBatchShowMode ?? showMode;
    container.innerHTML = renderAiResponseQaBatchReportHtml(report, escapeHtml, {
      showMode,
      manualMarks,
    });
    bindAiResponseQaBatchReport(container, report, escapeHtml, { manualMarks, showMode });
  };

  container.__qaBatchShowMode = showMode;

  if (isQaManualMarkEnabled()) {
    bindQaManualMarkEvents(container, {
      manualMarks,
      rerender,
    });
  }

  if (!container.__qaBatchShowModeBound) {
    container.__qaBatchShowModeBound = true;
    container.addEventListener("change", (event) => {
      const select = event.target.closest("[data-qa-batch-show-mode]");
      if (!select || !container.contains(select)) {
        return;
      }
      const value = select.value;
      container.__qaBatchShowMode =
        value === "all" ? "all" : value === "marked" ? "marked" : "issues";
      container.__qaManualRerender?.() ?? rerender();
    });
  }

  container.__qaManualRerender = rerender;
}
