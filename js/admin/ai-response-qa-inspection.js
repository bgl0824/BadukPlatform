/**
 * AI 응수 QA — 검수(미리보기) UI 공통 (자동 판정은 참고용)
 */

import { NEGATIVE_FACTOR_LABELS, POSITIVE_FACTOR_LABELS } from "./ai-response-qa-quality.js";
import { isQaManualMarkEnabled } from "./ai-response-qa-session.js";

const VERDICT_LABELS = {
  good: "정상",
  review: "검토",
  problem: "문제 있음",
};

/**
 * @param {string|number|null|undefined} problemId
 * @param {object} row
 */
export function buildQaCaseKey(problemId, row) {
  const id = String(problemId ?? "unknown").trim() || "unknown";
  const blackPly = String(row?.blackPly ?? "?");
  const candidate = String(row?.candidateMove ?? "?").trim() || "?";
  return `${id}:${blackPly}:${candidate}`;
}

/**
 * @param {Set<string>|string[]|undefined|null} manualMarks
 * @param {string} caseKey
 */
export function isCaseManuallyMarked(manualMarks, caseKey) {
  if (!manualMarks) {
    return false;
  }
  if (manualMarks instanceof Set) {
    return manualMarks.has(caseKey);
  }
  return manualMarks.includes(caseKey);
}

function formatFallbackLabel(row) {
  if (row?.usedFallback) {
    return "예 (fallback)";
  }
  if (row?.source === "katago") {
    return "아니오 (KataGo)";
  }
  if (row?.source) {
    return `아니오 (${row.source})`;
  }
  return "—";
}

function renderReferenceBlock(row, escapeHtml) {
  const verdict = row?.verdict ?? "review";
  const verdictLabel = VERDICT_LABELS[verdict] ?? verdict;
  const score = row?.qualityScore ?? 0;
  const referenceNotes = [
    ...(row?.problemReasons ?? []),
    ...(row?.positiveLabels ?? []).map((label) => `+ ${label}`),
  ].filter(Boolean);

  const notesHtml = referenceNotes.length
    ? `<ul class="admin-ai-response-qa-reference-list">${referenceNotes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join("")}</ul>`
    : `<p class="admin-field-hint">자동 분석 메모 없음</p>`;

  const libertyDetail = row?.targetDiagnostics?.hasTarget
    ? `<p class="admin-field-hint">타깃 활로: ${escapeHtml(row.targetDiagnostics.libertyChangeLabel ?? "—")}</p>`
    : "";

  const profileLine = row?.qaProfile
    ? `<p class="admin-field-hint">QA 프로필: ${escapeHtml(String(row.qaProfile))} · goal ${escapeHtml(String(row.qualityGoal ?? "—"))}</p>`
    : "";
  const negSummary = (row?.negativeFactors ?? [])
    .slice(0, 4)
    .map((key) => NEGATIVE_FACTOR_LABELS[key] ?? key)
    .join(", ");
  const posSummary = (row?.positiveFactors ?? [])
    .slice(0, 4)
    .map((key) => POSITIVE_FACTOR_LABELS[key] ?? key)
    .join(", ");

  return `
    <details class="admin-ai-response-qa-reference">
      <summary>참고 · 자동 ${escapeHtml(verdictLabel)} ${escapeHtml(String(score))}점</summary>
      <p class="admin-field-hint">자동 판정은 참고용입니다. 상단 요약과 검토·문제 필터를 우선 사용하세요.</p>
      ${profileLine}
      ${negSummary ? `<p class="admin-field-hint">감점: ${escapeHtml(negSummary)}</p>` : ""}
      ${posSummary ? `<p class="admin-field-hint">가점: ${escapeHtml(posSummary)}</p>` : ""}
      ${libertyDetail}
      ${notesHtml}
    </details>
  `;
}

/**
 * @param {object} params
 */
export function renderQaInspectionCaseCard({
  row,
  caseKey,
  problemLabel = null,
  manualMarked = false,
  escapeHtml,
}) {
  const previewHtml = row?.previewDataUrl
    ? `<img class="admin-ai-response-qa-thumb" src="${row.previewDataUrl}" alt="보드 미리보기" width="120" height="120" />`
    : `<div class="admin-ai-response-qa-thumb admin-ai-response-qa-thumb--empty">미리보기 없음</div>`;

  const problemLine = problemLabel
    ? `<p class="admin-ai-response-qa-inspection-line"><span>문제</span> <strong>${escapeHtml(problemLabel)}</strong></p>`
    : "";

  const manualMarkHtml = isQaManualMarkEnabled()
    ? `
      <label class="admin-ai-response-qa-manual-mark">
        <input type="checkbox" data-qa-manual-mark="${escapeHtml(caseKey)}"${manualMarked ? " checked" : ""} />
        문제 있음으로 표시 (디버그)
      </label>`
    : "";

  return `
    <article class="admin-ai-response-qa-inspection-card${manualMarked ? " is-manually-marked" : ""}" data-qa-case-key="${escapeHtml(caseKey)}">
      ${manualMarkHtml}
      <div class="admin-ai-response-qa-inspection-body">
        <div class="admin-ai-response-qa-inspection-preview">${previewHtml}</div>
        <div class="admin-ai-response-qa-inspection-fields">
          ${problemLine}
          <p class="admin-ai-response-qa-inspection-line">
            <span>오답 후보</span>
            <strong>${escapeHtml(String(row?.blackPly ?? "?"))}흑 ${escapeHtml(row?.candidateMove ?? "—")}</strong>
          </p>
          <p class="admin-ai-response-qa-inspection-line">
            <span>AI 응수</span>
            <strong>${escapeHtml(row?.selectedMove ?? "—")}</strong>
            <span class="admin-ai-response-qa-meta">${escapeHtml(String(row?.responseTimeMs ?? "—"))}ms</span>
          </p>
          <p class="admin-ai-response-qa-inspection-line">
            <span>selectedReason</span>
            <code>${escapeHtml(row?.selectedReason ?? "—")}</code>
            <span class="admin-ai-response-qa-meta">${escapeHtml(row?.selectedReasonLabel ?? "")}</span>
          </p>
          <p class="admin-ai-response-qa-inspection-line">
            <span>fallback</span>
            <strong>${escapeHtml(formatFallbackLabel(row))}</strong>
          </p>
          ${renderReferenceBlock(row, escapeHtml)}
        </div>
      </div>
    </article>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 */
export function bindQaManualMarkEvents(container, {
  manualMarks,
  onToggle,
  rerender,
}) {
  if (!container) {
    return;
  }

  container.__qaManualMarks = manualMarks;
  container.__qaManualRerender = rerender;
  container.__qaManualOnToggle = onToggle;

  if (container.__qaManualBound) {
    return;
  }

  container.__qaManualBound = true;
  container.addEventListener("change", (event) => {
    const input = event.target.closest("[data-qa-manual-mark]");
    if (!input || !container.contains(input)) {
      return;
    }

    const marks = container.__qaManualMarks;
    const caseKey = input.getAttribute("data-qa-manual-mark");
    if (!caseKey || !marks) {
      return;
    }

    if (input.checked) {
      marks.add(caseKey);
    } else {
      marks.delete(caseKey);
    }

    container.__qaManualOnToggle?.(caseKey, input.checked, marks);
    container.__qaManualRerender?.();
  });
}

/**
 * @param {Iterable<string>} manualMarks
 * @param {Array<{ caseKey: string }>} cases
 */
export function filterCasesByManualMark(cases, manualMarks, showMode) {
  if (showMode !== "marked") {
    return cases;
  }
  const markSet = manualMarks instanceof Set ? manualMarks : new Set(manualMarks);
  return cases.filter((row) => markSet.has(row.caseKey));
}

/**
 * @param {object[]} cases
 * @param {{ showMode?: 'all'|'issues'|'marked', manualMarks?: Set<string> }} options
 */
export function filterCasesForDisplay(cases, { showMode = "issues", manualMarks = null } = {}) {
  if (showMode === "marked") {
    return filterCasesByManualMark(cases, manualMarks, "marked");
  }
  if (showMode === "all") {
    return cases;
  }
  return (cases ?? []).filter((row) => row.verdict !== "good");
}
