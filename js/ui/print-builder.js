import {

  applyPrintSelection,

  formatPrintSelectionSummary,

  getCategoryProblemEntries,

  PRINT_SELECTION_MODE,

  PRINT_SELECTION_ORDER,

  resolveCategoryAllIds,

  resolveCategoryRangeIds,

  resolveCompositionSelection,

} from "../services/print-selection-service.js";



export function createPrintBuilderController({

  elements,

  getCategories,

  getProblems,

  getActiveLevelGroup,

  getSelectedIds,

  onSelectionChange,

  onClearAll,

  setFeedback,

  escapeHtml,

}) {

  let isBound = false;

  let accordionBound = false;



  function getPrintScopeOptions() {

    return { levelGroup: getActiveLevelGroup?.() };

  }



  function bind() {

    if (isBound) {

      return;

    }



    isBound = true;

    const clickHost = elements.printPanel ?? elements.printBuilder ?? document;

    clickHost.addEventListener("click", handleBuilderClick);

    elements.printRangeForm?.addEventListener("submit", handleRangeSubmit);

    elements.printComposeForm?.addEventListener("submit", handleComposeSubmit);

    elements.printRangeCategory?.addEventListener("change", applyPrintRangeInputDefaults);

    bindExclusivePanels();

  }



  function getCategoryPrintRangeDefaults(categoryName) {

    const entries = getCategoryProblemEntries(categoryName, getProblems(), getPrintScopeOptions());

    const maxNumber =

      entries.length > 0 ? entries[entries.length - 1].categoryProblemNumber : 1;



    return { from: 1, to: Math.max(1, maxNumber) };

  }



  function applyPrintRangeInputDefaults() {

    if (!elements.printRangeFrom || !elements.printRangeTo || !elements.printRangeCategory) {

      return;

    }



    const category = elements.printRangeCategory.value;

    if (!category) {

      elements.printRangeFrom.value = "1";

      elements.printRangeTo.value = "1";

      return;

    }



    const { from, to } = getCategoryPrintRangeDefaults(category);

    elements.printRangeFrom.value = String(from);

    elements.printRangeTo.value = String(to);

  }



  function bindExclusivePanels() {

    if (accordionBound) {

      return;

    }



    const panels = [

      ...(elements.printBuilder?.querySelectorAll(".print-builder-panel[data-print-panel]") ?? []),

    ];



    if (panels.length === 0) {

      return;

    }



    accordionBound = true;

    panels.forEach((panel) => {

      panel.addEventListener("toggle", () => {

        if (!panel.open) {

          return;

        }



        panels.forEach((otherPanel) => {

          if (otherPanel !== panel) {

            otherPanel.open = false;

          }

        });

      });

    });

  }



  function render() {

    bindExclusivePanels();



    const categories = getCategories();



    if (elements.printRangeCategory) {

      const currentValue = elements.printRangeCategory.value;

      elements.printRangeCategory.innerHTML = categories

        .map(

          (category) =>

            `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`,

        )

        .join("");

      if (categories.includes(currentValue)) {

        elements.printRangeCategory.value = currentValue;

      }

      applyPrintRangeInputDefaults();

    }



    if (!elements.printComposeFields) {

      return;

    }



    elements.printComposeFields.innerHTML = categories

      .map(

        (category) => `

          <label class="print-compose-cell">

            <span class="print-compose-label">${escapeHtml(category)}</span>

            <input

              class="print-compose-input"

              type="number"

              min="0"

              step="1"

              inputmode="numeric"

              data-compose-category="${escapeHtml(category)}"

              placeholder="0"

            />

          </label>

        `,

      )

      .join("");

  }



  function handleBuilderClick(event) {

    const button = event.target.closest("[data-print-action]");

    if (!button) {

      return;

    }



    if (button.dataset.printAction === "clear-all") {

      clearAll();

    }

  }



  function handleRangeSubmit(event) {

    event.preventDefault();



    const category = elements.printRangeCategory?.value;

    const from = Number(elements.printRangeFrom?.value);

    const to = Number(elements.printRangeTo?.value);

    const mode = elements.printRangeMode?.value ?? PRINT_SELECTION_MODE.add;



    if (!category) {

      setFeedback("범위 선택할 카테고리를 선택해 주세요.", "wrong");

      return;

    }



    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) {

      setFeedback("카테고리 문제 번호 범위(1 이상)를 입력해 주세요.", "wrong");

      return;

    }



    const problemIds = resolveCategoryRangeIds(category, getProblems(), from, to, getPrintScopeOptions());

    if (problemIds.length === 0) {

      setFeedback(`${category} ${Math.min(from, to)}~${Math.max(from, to)}번 문제가 없습니다.`, "wrong");

      return;

    }



    applyPrintSelection(getSelectedIds(), problemIds, mode);

    notifySelectionChange(

      `${category} ${Math.min(from, to)}~${Math.max(from, to)}번 ${problemIds.length}문제를 ${

        mode === PRINT_SELECTION_MODE.set ? "선택했습니다" : "추가했습니다"

      }.`,

    );

  }



  function handleComposeSubmit(event) {

    event.preventDefault();



    const composition = readComposition();

    if (composition.length === 0) {

      setFeedback("자동 구성할 카테고리별 문제 수를 1 이상 입력해 주세요.", "wrong");

      return;

    }



    const order = elements.printComposeOrder?.value ?? PRINT_SELECTION_ORDER.asc;

    const mode = elements.printComposeMode?.value ?? PRINT_SELECTION_MODE.set;

    const problemIds = resolveCompositionSelection(composition, getProblems(), {
      order,
      ...getPrintScopeOptions(),
    });



    if (problemIds.length === 0) {

      setFeedback("조건에 맞는 문제를 찾지 못했습니다.", "wrong");

      return;

    }



    applyPrintSelection(getSelectedIds(), problemIds, mode);

    const summary = composition

      .map(({ category, count }) => `${category} ${count}문제`)

      .join(", ");

    notifySelectionChange(`인쇄 세트를 생성했습니다. (${summary}, 총 ${problemIds.length}문제)`);

  }



  function readComposition() {

    return [...(elements.printComposeFields?.querySelectorAll("[data-compose-category]") ?? [])]

      .map((input) => ({

        category: input.dataset.composeCategory,

        count: Number(input.value),

      }))

      .filter((entry) => entry.category && Number.isFinite(entry.count) && entry.count > 0);

  }



  function selectCategoryAll(category) {

    const problemIds = resolveCategoryAllIds(category, getProblems(), getPrintScopeOptions());

    if (problemIds.length === 0) {

      setFeedback(`${category} 카테고리에 문제가 없습니다.`, "wrong");

      return false;

    }



    applyPrintSelection(getSelectedIds(), problemIds, PRINT_SELECTION_MODE.add);

    notifySelectionChange(`${category} ${problemIds.length}문제를 인쇄 선택에 추가했습니다.`);

    return true;

  }



  function clearCategory(category) {

    const problemIds = resolveCategoryAllIds(category, getProblems(), getPrintScopeOptions());

    applyPrintSelection(getSelectedIds(), problemIds, PRINT_SELECTION_MODE.remove);

    notifySelectionChange(`${category} 인쇄 선택을 해제했습니다.`);

  }



  function clearAll() {

    if (typeof onClearAll === "function") {

      onClearAll();

      return;

    }

    getSelectedIds().clear();

    notifySelectionChange("인쇄 작업을 종료했습니다.");

  }



  function notifySelectionChange(message, tone = "correct") {

    onSelectionChange();

    if (message) {

      setFeedback(message, tone);

    }

  }



  function formatSelectionSummary(selectedIds, problems, categoryOrder = []) {

    return formatPrintSelectionSummary(selectedIds, problems, { categoryOrder });

  }



  function renderSelectionSummary(target, selectedIds, problems, categoryOrder = []) {

    if (!target) {

      return formatSelectionSummary(selectedIds, problems, categoryOrder);

    }



    const summary = formatSelectionSummary(selectedIds, problems, categoryOrder);

    target.classList.toggle("is-empty", summary.total === 0);



    if (summary.total === 0) {

      target.textContent = summary.text;

      return summary;

    }



    const categoryMarkup = summary.categories

      .map(

        ({ category, count }) =>

          `<span class="print-summary-segment"><strong>${escapeHtml(category)}</strong> ${count}</span>`,

      )

      .join('<span class="print-summary-dot" aria-hidden="true"> · </span>');



    target.innerHTML = `${categoryMarkup}<span class="print-summary-dot" aria-hidden="true"> · </span><span class="print-summary-total">총 ${summary.total}문제</span><span class="print-summary-dot" aria-hidden="true"> · </span><span class="print-summary-pages">${summary.pageCount}페이지</span>`;

    target.setAttribute("aria-label", summary.text);



    return summary;

  }



  return {

    bind,

    render,

    formatSelectionSummary,

    renderSelectionSummary,

    selectCategoryAll,

    clearCategory,

    clearAll,

  };

}

