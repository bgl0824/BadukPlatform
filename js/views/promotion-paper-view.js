const PROMOTION_PAPER_PAGE1_COUNT = 9;
const GRID_COLUMNS = 3;

function chunkItems(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function renderProblemCellInner({ number, prompt, problemId, escapeHtml }) {
  return `
    <div class="promotion-paper-cell-wrap">
      <div class="promotion-paper-cell-caption">
        <span class="promotion-paper-cell-num">${number}</span>
        <span class="promotion-paper-cell-prompt">${escapeHtml(prompt)}</span>
      </div>
      <div class="promotion-paper-cell-body">
        <div class="promotion-paper-board" data-promotion-paper-problem-id="${escapeHtml(problemId)}"></div>
      </div>
    </div>`;
}

function renderProblemCell({ number, prompt, problemId, escapeHtml }) {
  return `<td class="promotion-paper-problem-cell promotion-paper-problem-cell--filled">${renderProblemCellInner({ number, prompt, problemId, escapeHtml })}</td>`;
}

function renderClosingCellInner() {
  return `
    <div class="promotion-paper-cell-wrap promotion-paper-cell-wrap--closing">
      <div class="promotion-paper-closing-text">
        <p>수고하셨습니다.</p>
        <p>다시 한 번 확인하세요.</p>
      </div>
    </div>`;
}

function renderClosingCell() {
  return `<td class="promotion-paper-problem-cell promotion-paper-problem-cell--closing">${renderClosingCellInner()}</td>`;
}

function renderEmptyCell() {
  return `<td class="promotion-paper-problem-cell promotion-paper-problem-cell--empty" aria-hidden="true"></td>`;
}

function renderProblemTable(cells) {
  const rows = chunkItems(cells, GRID_COLUMNS);
  return `
    <table class="promotion-paper-problem-table" cellspacing="0" cellpadding="0" aria-label="문항">
      <tbody>
        ${rows.map((row) => `<tr>${row.join("")}</tr>`).join("")}
      </tbody>
    </table>`;
}

function renderExamHeader({ examSet, gradeLabel, examDateLabel, organizationName, escapeHtml }) {
  const examTitle = escapeHtml(examSet.title || "승단급심사");
  const gradeMain = escapeHtml(gradeLabel || "급수 미지정");
  const organizationLabel = organizationName ? escapeHtml(organizationName) : "";

  return `
    <header class="promotion-paper-exam-header" aria-label="시험지 헤더">
      <div class="promotion-paper-exam-top">
        <div class="promotion-paper-exam-title-box">
          <p class="promotion-paper-exam-grade-main">${examTitle}</p>
          <p class="promotion-paper-exam-grade-sub">[${gradeMain}]</p>
        </div>
        <div class="promotion-paper-exam-organization-box" aria-label="주최 기관">
          <p class="promotion-paper-exam-organization-name" data-promotion-paper-organization>${organizationLabel}</p>
        </div>
      </div>
      <table class="promotion-paper-info-table" aria-label="응시 정보">
        <tbody>
          <tr>
            <th>이름</th>
            <td></td>
            <th>학원</th>
            <td></td>
          </tr>
          <tr>
            <th>학교</th>
            <td></td>
            <th>학년</th>
            <td></td>
          </tr>
          <tr>
            <th>시험명</th>
            <td>${examTitle}</td>
            <th>응시일</th>
            <td>${escapeHtml(examDateLabel)}</td>
          </tr>
        </tbody>
      </table>
      <p class="promotion-paper-exam-notice">※ 모든 문제는 흑의 돌 차례입니다.</p>
    </header>`;
}

function buildProblemCells(questions, problems, startNumber, getPrompt, escapeHtml) {
  return questions
    .map((entry, offset) => {
      const problem = problems.find((row) => row.id === entry.problemId);
      if (!problem) {
        return "";
      }
      return renderProblemCell({
        number: startNumber + offset,
        prompt: getPrompt(problem),
        problemId: problem.id,
        escapeHtml,
      });
    })
    .filter(Boolean);
}

/**
 * 승급심사 시험지 인쇄/열람 레이아웃 (A4 세로 2페이지, 3열 표)
 */
export function buildPromotionPaperPagesHtml({
  examSet,
  questions,
  problems,
  escapeHtml,
  getPrompt,
  gradeLabel,
  examDateLabel,
  organizationName = "",
}) {
  if (!questions.length) {
    return '<p class="promotion-paper-empty">표시할 문제가 없습니다.</p>';
  }

  const resolvedOrganizationName =
    organizationName ||
    examSet?.organizationName ||
    examSet?.organization_name ||
    "";

  const page1Questions = questions.slice(0, PROMOTION_PAPER_PAGE1_COUNT);
  const page2Questions = questions.slice(PROMOTION_PAPER_PAGE1_COUNT);

  const page1Cells = buildProblemCells(page1Questions, problems, 1, getPrompt, escapeHtml);
  while (page1Cells.length < PROMOTION_PAPER_PAGE1_COUNT) {
    page1Cells.push(renderEmptyCell());
  }

  const page2Cells = buildProblemCells(
    page2Questions,
    problems,
    PROMOTION_PAPER_PAGE1_COUNT + 1,
    getPrompt,
    escapeHtml,
  );
  page2Cells.push(renderClosingCell());
  while (page2Cells.length % GRID_COLUMNS !== 0) {
    page2Cells.push(renderEmptyCell());
  }

  const headerHtml = renderExamHeader({
    examSet,
    gradeLabel,
    examDateLabel,
    organizationName: resolvedOrganizationName,
    escapeHtml,
  });

  return `
    <div class="promotion-paper-pages">
      <section class="promotion-paper-page promotion-paper-page--1" aria-label="시험지 1페이지">
        ${headerHtml}
        ${renderProblemTable(page1Cells)}
      </section>
      <section class="promotion-paper-page promotion-paper-page--2" aria-label="시험지 2페이지">
        ${renderProblemTable(page2Cells)}
      </section>
    </div>`;
}

export { PROMOTION_PAPER_PAGE1_COUNT };
