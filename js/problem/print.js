function formatPrintBuilderDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export const PRINT_FORMAT = {
  detailed: "detailed",
  textbook: "textbook",
};

const DETAILED_PROBLEMS_PER_PAGE = 6;
const TEXTBOOK_PROBLEMS_PER_PAGE = 6;
/** 교재형 WGo 논리 기준 폭 — 실제 렌더는 getPrintBoardRenderPixelWidth() */
const TEXTBOOK_BOARD_RENDER_WIDTH = 480;
/** 상세형 WGo 논리 기준 폭 */
const DETAILED_BOARD_RENDER_WIDTH = 420;

function getPrintBoardRenderPixelWidth(baseWidth) {
  const deviceRatio =
    typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  const printScale = Math.max(3, Math.ceil(deviceRatio * 2));
  return Math.round(baseWidth * printScale);
}

function getTextbookBoardRenderPixelWidth() {
  return getPrintBoardRenderPixelWidth(TEXTBOOK_BOARD_RENDER_WIDTH);
}

function getDetailedBoardRenderPixelWidth() {
  return getPrintBoardRenderPixelWidth(DETAILED_BOARD_RENDER_WIDTH);
}

function getPrintBoardCanvases(element) {
  const wgoBoard = element?.querySelector(".wgo-board");
  if (wgoBoard) {
    return [...wgoBoard.querySelectorAll("canvas")];
  }

  return [...(element?.querySelectorAll("canvas") ?? [])];
}

function buildPrintBuilderHeaderMeta(selectedProblems, { titleOverride } = {}) {
  const counts = new Map();
  for (const { problem } of selectedProblems) {
    const category = String(problem?.category ?? "").trim() || "미분류";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"),
  );
  const categoryNames = ranked.map(([name]) => name);
  const autoTitle =
    categoryNames.length === 0
      ? "문제집"
      : categoryNames.length === 1
        ? `${categoryNames[0]} 문제집`
        : `${categoryNames.join(" · ")} 문제집`;
  const title = String(titleOverride ?? "").trim() || autoTitle;

  return {
    title,
    totalCount: selectedProblems.length,
    printDate: formatPrintBuilderDate(),
  };
}

function renderPrintBuilderHeaderHtml(headerMeta, escapeHtml) {
  return `
    <div class="print-header print-builder-header">
      <p class="eyebrow">Baduk Learning</p>
      <h1>${escapeHtml(headerMeta.title)}</h1>
      <p class="print-header-meta">총 ${headerMeta.totalCount}문제</p>
      <p class="print-header-meta">출력일 ${escapeHtml(headerMeta.printDate)}</p>
    </div>`;
}

function sanitizeTextbookCategoryDescription(text) {
  return String(text ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function resolveCategoryPrintDescription(category, selectedProblems) {
  const categoryName = String(category ?? "").trim() || "미분류";
  const match = selectedProblems.find(
    (entry) => String(entry.problem?.category ?? "").trim() || "미분류" === categoryName,
  );

  return sanitizeTextbookCategoryDescription(match?.problem?.description ?? "");
}

function resolvePrintProblemNumber(entry, fallbackIndex) {
  const number = Number(entry?.categoryProblemNumber);
  if (Number.isFinite(number) && number > 0) {
    return number;
  }

  return fallbackIndex + 1;
}

function formatDetailedPrintHeading(problem, problems, formatCategoryProblemLabel) {
  const label = formatCategoryProblemLabel(problem, problems);
  const title = String(problem?.title ?? "").trim();
  if (!title || title === label) {
    return label;
  }

  return `${label} · ${title}`;
}

export function createProblemPrintController({
  elements,
  problems,
  getSelectedPrintProblems,
  renderProblemPreviewBoard,
  setFeedback,
  escapeHtml,
  chunkArray,
  formatCategoryProblemLabel,
}) {
  function getSelectedPrintFormat(options = {}) {
    if (options.printFormat === PRINT_FORMAT.textbook || options.printFormat === PRINT_FORMAT.detailed) {
      return options.printFormat;
    }

    const checked = [...(elements.printFormatRadios ?? [])].find((input) => input.checked);
    return checked?.value === PRINT_FORMAT.textbook ? PRINT_FORMAT.textbook : PRINT_FORMAT.detailed;
  }

  function runPrintJob(selectedProblems, options = {}) {
    if (selectedProblems.length === 0) {
      setFeedback("인쇄할 문제를 먼저 선택해 주세요.", "wrong");
      return false;
    }

    const printFormat = getSelectedPrintFormat(options);
    const isMonochromePrint = Boolean(elements.printMonochrome?.checked);
    renderPrintProblems(selectedProblems, isMonochromePrint, { ...options, printFormat });

    const formatLabel = printFormat === PRINT_FORMAT.textbook ? "교재형" : "상세형";
    setFeedback(
      options.feedbackMessage ??
        `${formatLabel} 형식으로 선택한 ${selectedProblems.length}개 문제를 인쇄합니다.`,
      "correct",
    );

    document.body.classList.remove("promotion-paper-print");
    document.body.classList.remove("promotion-paper-print-monochrome");
    document.body.classList.remove("print-builder-print--textbook");
    document.body.classList.remove("print-builder-print--detailed");
    document.querySelector("#promotion-paper-page-style")?.remove();
    document.body.classList.add("print-builder-print");
    document.body.classList.add(
      printFormat === PRINT_FORMAT.textbook
        ? "print-builder-print--textbook"
        : "print-builder-print--detailed",
    );

    const handleAfterPrint = () => {
      document.body.classList.remove("print-builder-print");
      document.body.classList.remove("print-builder-print--textbook");
      document.body.classList.remove("print-builder-print--detailed");
      window.removeEventListener("afterprint", handleAfterPrint);
      options.onAfterPrint?.();
    };
    window.addEventListener("afterprint", handleAfterPrint);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });

    return true;
  }

  function printSelectedProblems() {
    runPrintJob(getSelectedPrintProblems());
  }

  function printExplicitProblems(selectedProblems, options = {}) {
    runPrintJob(selectedProblems, options);
  }

  function renderPrintProblems(selectedProblems, isMonochromePrint, options = {}) {
    const printFormat = getSelectedPrintFormat(options);
    elements.printArea.innerHTML = "";
    elements.printArea.classList.toggle("is-monochrome", isMonochromePrint);
    elements.printArea.classList.toggle("is-textbook-format", printFormat === PRINT_FORMAT.textbook);
    elements.printArea.classList.toggle("is-detailed-format", printFormat === PRINT_FORMAT.detailed);

    if (printFormat === PRINT_FORMAT.textbook) {
      renderTextbookPrintProblems(selectedProblems, isMonochromePrint);
      return;
    }

    renderDetailedPrintProblems(selectedProblems, isMonochromePrint, options);
  }

  function renderDetailedPrintProblems(selectedProblems, isMonochromePrint, { titleOverride } = {}) {
    const headerMeta = buildPrintBuilderHeaderMeta(selectedProblems, { titleOverride });
    const headerHtml = renderPrintBuilderHeaderHtml(headerMeta, escapeHtml);

    chunkArray(selectedProblems, DETAILED_PROBLEMS_PER_PAGE).forEach((pageProblems) => {
      const page = document.createElement("section");
      page.className = "print-page print-page--detailed";
      page.innerHTML = `
        ${headerHtml}
        <div class="print-problems print-problems--detailed"></div>
      `;

      const printProblems = page.querySelector(".print-problems");
      pageProblems.forEach(({ problem }) => {
        const article = document.createElement("article");
        article.className = "print-problem print-problem--detailed";
        const levelLabel = String(problem.level ?? "").trim();
        article.innerHTML = `
          <div class="print-problem-detailed-copy">
            <p class="print-problem-detailed-heading">${escapeHtml(
              formatDetailedPrintHeading(problem, problems, formatCategoryProblemLabel),
            )}</p>
            <p class="print-problem-detailed-description">${escapeHtml(problem.description ?? "")}</p>
            ${levelLabel ? `<p class="print-problem-detailed-level">${escapeHtml(levelLabel)}</p>` : ""}
          </div>
          <div class="print-problem-board-slot">
            <div class="print-problem-board" aria-hidden="true"></div>
          </div>
        `;
        printProblems.append(article);
        renderDetailedPrintBoard(
          article.querySelector(".print-problem-board"),
          problem,
          isMonochromePrint,
        );
      });

      elements.printArea.append(page);
    });
  }

  function renderTextbookCategoryIntro(category, description) {
    const intro = document.createElement("header");
    intro.className = "print-textbook-category-intro";
    intro.innerHTML = `
      <h2 class="print-textbook-category-title">${escapeHtml(category)}</h2>
      ${description ? `<p class="print-textbook-category-description">${escapeHtml(description)}</p>` : ""}
    `;
    return intro;
  }

  function renderTextbookPrintProblems(selectedProblems, isMonochromePrint) {
    const categoryDescriptions = new Map();
    selectedProblems.forEach((entry) => {
      const category = String(entry.problem?.category ?? "").trim() || "미분류";
      if (!categoryDescriptions.has(category)) {
        categoryDescriptions.set(category, resolveCategoryPrintDescription(category, selectedProblems));
      }
    });

    let lastCategoryOnDocument = null;

    chunkArray(selectedProblems, TEXTBOOK_PROBLEMS_PER_PAGE).forEach((pageProblems, pageIndex) => {
      const page = document.createElement("section");
      page.className = "print-page print-page--textbook";

      const firstCategory =
        String(pageProblems[0]?.problem?.category ?? "").trim() || "미분류";
      if (firstCategory !== lastCategoryOnDocument) {
        page.append(
          renderTextbookCategoryIntro(
            firstCategory,
            categoryDescriptions.get(firstCategory) ?? "",
          ),
        );
        lastCategoryOnDocument = firstCategory;
      }

      const printProblems = document.createElement("div");
      printProblems.className = "print-problems print-problems--textbook";
      page.append(printProblems);

      pageProblems.forEach((entry, indexOnPage) => {
        const { problem } = entry;
        const globalIndex = pageIndex * TEXTBOOK_PROBLEMS_PER_PAGE + indexOnPage;
        const article = document.createElement("article");
        article.className = "print-problem print-problem--textbook";
        const problemNumber = resolvePrintProblemNumber(entry, globalIndex);
        article.innerHTML = `
          <p class="print-problem-number">${escapeHtml(String(problemNumber))}번</p>
          <div class="print-problem-board" aria-hidden="true"></div>
        `;
        printProblems.append(article);
        renderTextbookPrintBoard(
          article.querySelector(".print-problem-board"),
          problem,
          isMonochromePrint,
        );
      });

      elements.printArea.append(page);
    });
  }

  function renderDetailedPrintBoard(element, problem, isMonochromePrint) {
    const renderPixelWidth = getDetailedBoardRenderPixelWidth();
    element.replaceChildren();
    element.style.width = `${renderPixelWidth}px`;
    element.style.height = `${renderPixelWidth}px`;
    renderProblemPreviewBoard(element, problem, { width: renderPixelWidth });
    replaceCompositePrintBoardCanvasWithImage(element, isMonochromePrint ? "#ffffff" : "#f3d08a", {
      imageClassName: "print-detailed-board-image",
      fitSquareInContainer: true,
    });
  }

  function renderTextbookPrintBoard(element, problem, isMonochromePrint) {
    const renderPixelWidth = getTextbookBoardRenderPixelWidth();
    element.replaceChildren();
    element.style.width = `${renderPixelWidth}px`;
    element.style.height = `${renderPixelWidth}px`;
    renderProblemPreviewBoard(element, problem, { width: renderPixelWidth });
    replaceCompositePrintBoardCanvasWithImage(element, isMonochromePrint ? "#ffffff" : "#f3d08a", {
      imageClassName: "print-textbook-board-image",
    });
  }

  function replaceCompositePrintBoardCanvasWithImage(
    element,
    backgroundColor,
    { imageClassName = "", fitSquareInContainer = false } = {},
  ) {
    const canvases = getPrintBoardCanvases(element).filter(
      (canvas) => canvas.width > 0 && canvas.height > 0,
    );
    const baseCanvas = canvases[0];
    if (!baseCanvas) {
      return;
    }

    const exportWidth = baseCanvas.width;
    const exportHeight = baseCanvas.height;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;

    const context = exportCanvas.getContext("2d", { alpha: false });
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, exportWidth, exportHeight);
    context.imageSmoothingEnabled = false;

    canvases.forEach((canvas) => {
      if (canvas.width === exportWidth && canvas.height === exportHeight) {
        context.drawImage(canvas, 0, 0);
        return;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, exportWidth, exportHeight);
      context.imageSmoothingEnabled = false;
    });

    const image = document.createElement("img");
    if (imageClassName) {
      image.className = imageClassName;
    }
    image.src = exportCanvas.toDataURL("image/png");
    image.alt = "인쇄용 바둑판";
    image.decoding = "sync";
    image.width = exportWidth;
    image.height = exportHeight;
    image.style.display = "block";
    image.style.objectFit = "contain";

    if (fitSquareInContainer) {
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.maxWidth = "100%";
      image.style.maxHeight = "100%";
    } else {
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.maxWidth = "100%";
      image.style.maxHeight = "100%";
    }

    element.style.width = "";
    element.style.height = "";
    element.replaceChildren(image);
  }

  return {
    printSelectedProblems,
    printExplicitProblems,
    renderPrintProblems,
    renderDetailedPrintBoard,
    renderTextbookPrintBoard,
    replaceCompositePrintBoardCanvasWithImage,
  };
}
