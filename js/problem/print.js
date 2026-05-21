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
  function printSelectedProblems() {
    const selectedProblems = getSelectedPrintProblems();

    if (selectedProblems.length === 0) {
      setFeedback("인쇄할 문제를 먼저 선택해 주세요.", "wrong");
      return;
    }

    renderPrintProblems(selectedProblems, elements.printMonochrome.checked);
    setFeedback(`선택한 ${selectedProblems.length}개 문제를 인쇄합니다.`, "correct");

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  function renderPrintProblems(selectedProblems, isMonochromePrint) {
    elements.printArea.innerHTML = "";
    elements.printArea.classList.toggle("is-monochrome", isMonochromePrint);

    chunkArray(selectedProblems, 8).forEach((pageProblems) => {
      const page = document.createElement("section");
      page.className = "print-page";
      page.innerHTML = `
        <div class="print-header">
          <p class="eyebrow">Baduk Learning</p>
          <h1>선택 문제 인쇄</h1>
        </div>
        <div class="print-problems"></div>
      `;

      const printProblems = page.querySelector(".print-problems");
      pageProblems.forEach(({ problem }) => {
        const article = document.createElement("article");
        article.className = "print-problem";
        article.innerHTML = `
          <div>
            <p class="problem-card-meta">
              <span>${escapeHtml(formatCategoryProblemLabel(problem, problems))}</span>
              <span class="problem-category-badge">${escapeHtml(problem.category)}</span>
              <span>${escapeHtml(problem.level ?? "")}</span>
            </p>
            <h2>${escapeHtml(problem.title)}</h2>
            <p>${escapeHtml(problem.description)}</p>
          </div>
          <div class="print-problem-board" aria-hidden="true"></div>
        `;
        printProblems.append(article);
        renderProblemPrintBoard(
          article.querySelector(".print-problem-board"),
          problem,
          isMonochromePrint,
        );
      });

      elements.printArea.append(page);
    });
  }

  function renderProblemPrintBoard(element, problem, isMonochromePrint) {
    renderProblemPreviewBoard(element, problem);
    replaceBoardCanvasWithImage(
      element,
      isMonochromePrint ? "#ffffff" : "#f3d08a",
    );
  }

  function replaceBoardCanvasWithImage(element, backgroundColor) {
    const canvases = [...element.querySelectorAll("canvas")];
    const baseCanvas = canvases[0];
    if (!baseCanvas) {
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = baseCanvas.width;
    exportCanvas.height = baseCanvas.height;

    const context = exportCanvas.getContext("2d");
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    canvases.forEach((canvas) => {
      context.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    });

    const image = document.createElement("img");
    image.src = exportCanvas.toDataURL("image/png");
    image.alt = "인쇄용 바둑판";
    image.decoding = "sync";

    element.replaceChildren(image);
  }

  return {
    printSelectedProblems,
    renderPrintProblems,
    renderProblemPrintBoard,
    replaceBoardCanvasWithImage,
  };
}
