/**
 * AI 응수 QA 일괄 미리보기 — runAiResponseQa 재사용 (엔진/DB 수정 없음)
 */

import { isAiResponseProblem } from "../game/problem-mode.js";
import { formatCategoryProblemLabel } from "../services/category-problem-number.js";
import { getProblemsInCategoryOrder } from "../services/learning-flow-service.js";
import {
  bindQaManualMarkEvents,
  buildQaCaseKey,
  filterCasesByManualMark,
  isCaseManuallyMarked,
  renderQaInspectionCaseCard,
} from "./ai-response-qa-inspection.js";
import {
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
}) {
  const normalizedCategory = String(category ?? "").trim();
  if (!normalizedCategory || normalizedCategory === "전체") {
    return { ok: false, error: "카테고리를 하나 선택한 뒤 일괄 미리보기를 실행하세요." };
  }

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

  const items = [];
  let completed = 0;

  for (const target of targets) {
    const { problem, validation, eligible } = target;
    const label = formatCategoryProblemLabel(problem, problems);
    const problemId = problem?.id ?? label;

    onProgress?.({
      phase: "running",
      completed,
      total: targets.length,
      eligibleTotal: eligibleTargets.length,
      currentLabel: label,
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
      completed += 1;
      onProgress?.({
        phase: "running",
        completed,
        total: targets.length,
        eligibleTotal: eligibleTargets.length,
        currentLabel: label,
      });
      continue;
    }

    const report = await runAiResponseQa({
      problem,
      boardSize,
      stoneColors,
    });

    const cases = report.ok
      ? attachCaseKeys(report.results, problemId, label)
      : [];

    items.push({
      problem,
      problemId,
      label,
      skipped: false,
      report,
      error: report.ok ? null : report.error,
      cases,
    });

    completed += 1;
    onProgress?.({
      phase: "running",
      completed,
      total: targets.length,
      eligibleTotal: eligibleTargets.length,
      currentLabel: label,
    });
  }

  const scannedItems = items.filter((item) => !item.skipped);
  const allCases = scannedItems.flatMap((item) => item.cases ?? []);

  return {
    ok: true,
    category: normalizedCategory,
    levelGroup,
    items,
    allCases,
    summary: {
      problems: scannedItems.length,
      cases: allCases.length,
      skipped: items.filter((item) => item.skipped).length,
      errors: scannedItems.filter((item) => item.error).length,
    },
  };
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

  const cases = filterCasesByManualMark(item.cases ?? [], manualMarks, showMode);
  const markedInProblem = countMarkedCases(item.cases ?? [], manualMarks);

  if (showMode === "marked" && cases.length === 0) {
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

  return `
    <details class="admin-ai-response-qa-batch-problem" open>
      <summary>
        ${escapeHtml(item.label)}
        · ${(item.cases ?? []).length}케이스
        · 수동 ${markedInProblem}
      </summary>
      ${errorNote}
      <div class="admin-ai-response-qa-inspection-cards">${cards}</div>
    </details>
  `;
}

/**
 * @param {object} report
 * @param {(value: string) => string} escapeHtml
 * @param {{ progress?: object|null, showMode?: 'all'|'marked', manualMarks?: Set<string> }} [options]
 */
export function renderAiResponseQaBatchReportHtml(
  report,
  escapeHtml,
  { progress = null, showMode = "all", manualMarks = new Set() } = {},
) {
  if (progress?.phase === "running") {
    return `
      <div class="admin-ai-response-qa-batch-panel">
        <p class="admin-ai-response-qa-batch-progress">
          수집 중… <strong>${escapeHtml(String(progress.completed))}</strong> / ${escapeHtml(String(progress.total))} 문제
        </p>
        ${
          progress.currentLabel
            ? `<p class="admin-field-hint">현재: ${escapeHtml(progress.currentLabel)}</p>`
            : ""
        }
        <p class="admin-field-hint">순차 실행 · DB/저장 변경 없음 · 자동 판정은 참고용</p>
      </div>
    `;
  }

  if (!report?.ok) {
    return `<p class="admin-ai-response-qa-error">${escapeHtml(report?.error ?? "일괄 미리보기 실패")}</p>`;
  }

  const { summary, category, levelGroup, items = [], allCases = [] } = report;
  const markedCount = countMarkedCases(allCases, manualMarks);
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
      ? `<p class="admin-field-hint">수동 표시된 케이스가 없습니다. 각 응수 카드에서 「문제 있음으로 표시」를 체크하세요.</p>`
      : "";

  return `
    <div class="admin-ai-response-qa-batch-panel" data-qa-batch-root>
      <header class="admin-ai-response-qa-batch-head">
        <p class="panel-label">${escapeHtml(category)} AI 응수 일괄 미리보기 · ${escapeHtml(levelGroup ?? "")}</p>
        <div class="admin-ai-response-qa-toolbar">
          <p class="admin-ai-response-qa-summary">
            문제 ${summary.problems} · 응수 케이스 ${summary.cases} · 수동 표시 ${markedCount}
          </p>
          <label class="admin-ai-response-qa-filter">
            표시:
            <select data-qa-batch-show-mode>
              <option value="all"${showMode === "all" ? " selected" : ""}>전체</option>
              <option value="marked"${showMode === "marked" ? " selected" : ""}>수동 표시 (${markedCount})</option>
            </select>
          </label>
        </div>
        ${skippedNote}
        <p class="admin-field-hint">응수 결과를 모아 검수합니다. 자동 판정(정상/검토/문제)은 각 카드 「참고」에만 표시됩니다.</p>
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
  let showMode = options.showMode ?? "all";

  const rerender = () => {
    showMode = container.__qaBatchShowMode ?? showMode;
    container.innerHTML = renderAiResponseQaBatchReportHtml(report, escapeHtml, {
      showMode,
      manualMarks,
    });
    bindAiResponseQaBatchReport(container, report, escapeHtml, { manualMarks, showMode });
  };

  container.__qaBatchShowMode = showMode;

  bindQaManualMarkEvents(container, {
    manualMarks,
    rerender,
  });

  if (!container.__qaBatchShowModeBound) {
    container.__qaBatchShowModeBound = true;
    container.addEventListener("change", (event) => {
      const select = event.target.closest("[data-qa-batch-show-mode]");
      if (!select || !container.contains(select)) {
        return;
      }
      container.__qaBatchShowMode = select.value === "marked" ? "marked" : "all";
      container.__qaManualRerender?.();
    });
  }
}
