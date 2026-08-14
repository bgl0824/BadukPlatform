/**
 * 시험지 계열 공통 레이아웃 (A4 가로, 5열×2행, 앞 1~10 / 뒤 11~20)
 * 대상: 기출문제 / 모의시험 / 승급심사
 */

import {
  EXAM_SET_ROLE,
  EXAM_SET_TYPE,
  formatExamHostOrganizationLabel,
  formatExamVariantLabel,
  normalizeExamSetRole,
  normalizeExamSetType,
} from "../services/exam-set-constants.js";

const GRID_COLS = 5;
/** 승급심사 단일 표 — 문제 1칸 = colspan 2 (전체 10열) */
const PROMOTION_SHEET_COLS = 10;
const PROMOTION_PROBLEM_COLSPAN = 2;

export const EXAM_PAPER_PAGE1_COUNT = 10;
const PAGE2_COUNT = 10;

function chunkItems(items, size) {
  const rows = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function isPromotionExamPaper(examSet) {
  const role = normalizeExamSetRole(examSet?.setRole);
  const type = normalizeExamSetType(examSet?.type);
  return role === EXAM_SET_ROLE.promotionPaper || type === EXAM_SET_TYPE.promotionTest;
}

function renderProblemCellInner({ number, prompt, problemId, escapeHtml }) {
  return `
    <div class="ep-cell-wrap">
      <div class="ep-caption">
        <span class="ep-caption-num">${number}.</span><span class="ep-caption-prompt">${escapeHtml(prompt)}</span>
      </div>
      <div class="ep-board-body">
        <div class="exam-paper-board" data-exam-paper-problem-id="${escapeHtml(problemId)}"></div>
      </div>
    </div>`;
}

function renderProblemCell({ number, prompt, problemId, escapeHtml, colspan = 1 }) {
  const span = colspan > 1 ? ` colspan="${colspan}"` : "";
  return `<td class="ep-cell ep-cell--problem"${span}>${renderProblemCellInner({ number, prompt, problemId, escapeHtml })}</td>`;
}

function renderEmptyCell({ colspan = 1 } = {}) {
  const span = colspan > 1 ? ` colspan="${colspan}"` : "";
  return `<td class="ep-cell ep-cell--empty"${span} aria-hidden="true"></td>`;
}

function buildProblemCells(questions, problems, startNumber, getPrompt, escapeHtml, { colspan = 1 } = {}) {
  return questions
    .map((entry, offset) => {
      const problem = problems.find((p) => p.id === entry.problemId);
      if (!problem) return "";
      return renderProblemCell({
        number: startNumber + offset,
        prompt: getPrompt(problem),
        problemId: problem.id,
        escapeHtml,
        colspan,
      });
    })
    .filter(Boolean);
}

function renderProblemTable(cells) {
  const rows = chunkItems(cells, GRID_COLS);
  return `
    <table class="ep-grid" cellspacing="0" cellpadding="0" aria-label="문항">
      <tbody>
        ${rows.map((row) => `<tr class="ep-grid-row">${row.join("")}</tr>`).join("")}
      </tbody>
    </table>`;
}

function blankCell(label = "") {
  return label
    ? `<td class="ep-header-value ep-header-value--write">${label}</td>`
    : `<td class="ep-header-value ep-header-value--write"></td>`;
}

function renderPromotionMetaRows({
  gradeLabel,
  variantLabel,
  hostLabel,
  sponsorLabel,
  examDateLabel,
  escapeHtml,
}) {
  const gradeText = escapeHtml(gradeLabel || "급수 미지정");
  const variantText = variantLabel ? escapeHtml(variantLabel) : "";
  const gradeVariantValue = variantText ? `${gradeText} ${variantText}` : gradeText;
  const hostText = hostLabel ? escapeHtml(hostLabel) : "";
  const sponsorText = sponsorLabel ? escapeHtml(sponsorLabel) : "";
  const orgParts = [hostText, sponsorText].filter(Boolean);
  const orgLine = orgParts.length ? orgParts.join(" · ") : "";
  const dateText = examDateLabel && examDateLabel !== "____________" ? escapeHtml(examDateLabel) : "";

  return `
        <tr class="ep-sheet-meta-row ep-sheet-meta-row--1">
          <th class="ep-sheet-grade" colspan="2" rowspan="2" scope="rowgroup">
            <span class="ep-sheet-grade-label">심사급수</span>
            <span class="ep-sheet-grade-value">${gradeVariantValue}</span>
          </th>
          <th class="ep-sheet-label">이름</th>
          <td class="ep-sheet-write"></td>
          <th class="ep-sheet-label">학원</th>
          <td class="ep-sheet-write"></td>
          <td class="ep-sheet-orgs" colspan="4" rowspan="2">
            ${orgLine ? `<span class="ep-sheet-org-line">${orgLine}</span>` : ""}
            ${dateText ? `<span class="ep-sheet-date">${dateText}</span>` : ""}
          </td>
        </tr>
        <tr class="ep-sheet-meta-row ep-sheet-meta-row--2">
          <th class="ep-sheet-label">학년</th>
          <td class="ep-sheet-write"></td>
          <th class="ep-sheet-label">학교</th>
          <td class="ep-sheet-write"></td>
        </tr>
        <tr class="ep-sheet-notice-row">
          <td class="ep-sheet-notice" colspan="${PROMOTION_SHEET_COLS}">※모든 문제는 흑이 둘 차례입니다.</td>
        </tr>`;
}

function renderPromotionProblemRows(cells) {
  const rows = chunkItems(cells, GRID_COLS);
  return rows
    .map((row) => `<tr class="ep-sheet-problem-row">${row.join("")}</tr>`)
    .join("");
}

function renderPromotionFrontSheet(params) {
  const { p1Cells } = params;
  return `
    <table class="ep-sheet ep-sheet--promotion ep-sheet--front" cellspacing="0" cellpadding="0" aria-label="승급심사 시험지 앞면">
      <colgroup>
        ${Array.from({ length: PROMOTION_SHEET_COLS }, () => `<col span="1" />`).join("")}
      </colgroup>
      <tbody>
        ${renderPromotionMetaRows(params)}
        ${renderPromotionProblemRows(p1Cells)}
      </tbody>
    </table>`;
}

function renderPromotionBackSheet(p2Cells) {
  const rows = chunkItems(p2Cells, GRID_COLS);
  return `
    <table class="ep-sheet ep-sheet--promotion ep-sheet--back" cellspacing="0" cellpadding="0" aria-label="승급심사 시험지 뒷면">
      <colgroup>
        ${Array.from({ length: PROMOTION_SHEET_COLS }, () => `<col span="1" />`).join("")}
      </colgroup>
      <tbody>
        ${rows.map((row) => `<tr class="ep-sheet-problem-row">${row.join("")}</tr>`).join("")}
        <tr class="ep-sheet-closing-row">
          <td class="ep-sheet-closing" colspan="${PROMOTION_SHEET_COLS}">수고하셨습니다. 틀린 문제가 없는지 다시 한 번 확인하세요.</td>
        </tr>
      </tbody>
    </table>`;
}

function renderPastExamHeader({ examSet, gradeLabel, examDateLabel, escapeHtml }) {
  const titleText = escapeHtml(examSet.title || "기출문제");
  const gradeText = escapeHtml(gradeLabel || "급수 미지정");
  const dateText = escapeHtml(examDateLabel);

  return `
    <header class="ep-front-header ep-front-header--past" aria-label="기출 시험지 헤더">
      <table class="ep-header-table" cellspacing="0" cellpadding="0">
        <tbody>
          <tr>
            <th class="ep-header-cell ep-header-cell--title">
              <p class="ep-header-title-main">${titleText}</p>
              <p class="ep-header-title-sub">기출문제 · ${gradeText}</p>
            </th>
            <th class="ep-header-label">시험일</th>
            <td class="ep-header-value">${dateText}</td>
          </tr>
        </tbody>
      </table>
      <p class="ep-notice">※ 모든 문제는 흑이 둘 차례입니다.</p>
    </header>`;
}

function renderMockTestHeader({ examSet, gradeLabel, examDateLabel, escapeHtml }) {
  const titleText = escapeHtml(examSet.title || "모의시험");
  const gradeText = escapeHtml(gradeLabel || "급수 미지정");
  const dateText = escapeHtml(examDateLabel);

  return `
    <header class="ep-front-header ep-front-header--mock" aria-label="모의시험지 헤더">
      <table class="ep-header-table" cellspacing="0" cellpadding="0">
        <tbody>
          <tr>
            <th class="ep-header-cell ep-header-cell--title" rowspan="2">
              <p class="ep-header-title-main">${titleText}</p>
              <p class="ep-header-title-sub">모의시험 · ${gradeText}</p>
            </th>
            <th class="ep-header-label">이름</th>
            ${blankCell()}
            <th class="ep-header-label">학원</th>
            ${blankCell()}
          </tr>
          <tr>
            <th class="ep-header-label">학년</th>
            ${blankCell()}
            <th class="ep-header-label">시험일</th>
            <td class="ep-header-value">${dateText}</td>
          </tr>
        </tbody>
      </table>
      <p class="ep-notice">※ 모든 문제는 흑이 둘 차례입니다.</p>
    </header>`;
}

function renderFrontHeader(params) {
  const type = normalizeExamSetType(params.examSet?.type);
  if (type === EXAM_SET_TYPE.mockTest) {
    return renderMockTestHeader(params);
  }
  return renderPastExamHeader(params);
}

/**
 * @param {{
 *   examSet: object,
 *   questions: Array<{problemId: string, orderIndex: number}>,
 *   problems: object[],
 *   escapeHtml: (s:string)=>string,
 *   getPrompt: (problem:object)=>string,
 *   gradeLabel: string,
 *   examDateLabel: string,
 * }} params
 */
export function buildExamPaperPagesHtml({
  examSet,
  questions,
  problems,
  escapeHtml,
  getPrompt,
  gradeLabel,
  examDateLabel,
}) {
  if (!questions.length) {
    return '<p class="exam-paper-empty">표시할 문제가 없습니다.</p>';
  }

  const p1Questions = questions.slice(0, EXAM_PAPER_PAGE1_COUNT);
  const p2Questions = questions.slice(EXAM_PAPER_PAGE1_COUNT, EXAM_PAPER_PAGE1_COUNT + PAGE2_COUNT);

  const headerParams = {
    examSet,
    gradeLabel,
    variantLabel: formatExamVariantLabel(examSet.examVariant),
    hostLabel: formatExamHostOrganizationLabel(examSet.hostOrganization),
    sponsorLabel: examSet.sponsorOrganization ?? "",
    examDateLabel,
    escapeHtml,
  };

  if (isPromotionExamPaper(examSet)) {
    const colspan = PROMOTION_PROBLEM_COLSPAN;
    const p1Cells = buildProblemCells(p1Questions, problems, 1, getPrompt, escapeHtml, { colspan });
    while (p1Cells.length < EXAM_PAPER_PAGE1_COUNT) {
      p1Cells.push(renderEmptyCell({ colspan }));
    }

    const p2Cells = buildProblemCells(
      p2Questions,
      problems,
      EXAM_PAPER_PAGE1_COUNT + 1,
      getPrompt,
      escapeHtml,
      { colspan },
    );
    while (p2Cells.length < PAGE2_COUNT) {
      p2Cells.push(renderEmptyCell({ colspan }));
    }

    return `
    <div class="exam-paper-pages exam-paper-pages--promotion">
      <section class="exam-paper-page exam-paper-page--1 exam-paper-page--promotion" aria-label="시험지 앞면 (1~10번)">
        ${renderPromotionFrontSheet({ ...headerParams, p1Cells, p2Cells })}
      </section>
      <section class="exam-paper-page exam-paper-page--2 exam-paper-page--promotion" aria-label="시험지 뒷면 (11~20번)">
        ${renderPromotionBackSheet(p2Cells)}
      </section>
    </div>`;
  }

  const p1Cells = buildProblemCells(p1Questions, problems, 1, getPrompt, escapeHtml);
  while (p1Cells.length < EXAM_PAPER_PAGE1_COUNT) p1Cells.push(renderEmptyCell());

  const p2Cells = buildProblemCells(p2Questions, problems, EXAM_PAPER_PAGE1_COUNT + 1, getPrompt, escapeHtml);
  while (p2Cells.length < PAGE2_COUNT) p2Cells.push(renderEmptyCell());

  const frontHeader = renderFrontHeader(headerParams);

  return `
    <div class="exam-paper-pages">
      <section class="exam-paper-page exam-paper-page--1" aria-label="시험지 앞면 (1~10번)">
        ${frontHeader}
        ${renderProblemTable(p1Cells)}
      </section>
      <section class="exam-paper-page exam-paper-page--2" aria-label="시험지 뒷면 (11~20번)">
        ${renderProblemTable(p2Cells)}
        <p class="ep-closing-notice">수고하셨습니다. 틀린 문제가 없는지 다시 한 번 확인하세요.</p>
      </section>
    </div>`;
}

/** @deprecated promotion-paper-view 호환 */
export const buildPromotionPaperPagesHtml = buildExamPaperPagesHtml;
export const PROMOTION_PAPER_PAGE1_COUNT = EXAM_PAPER_PAGE1_COUNT;
