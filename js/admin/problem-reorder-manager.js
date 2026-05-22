import {
  buildDisplayOrderUpdates,
  sortProblemsGlobally,
} from "../services/problem-order-service.js";

export function createProblemReorderController({
  elements,
  problems,
  problemService,
  ProblemStore,
  adminState,
  appState,
  getActiveLevelGroup,
  getFilteredProblems,
  getCurrentUser,
  requireAdminMode,
  setFeedback,
  renderProblemList,
  escapeHtml,
}) {
  let eventsBound = false;
  let draggedCard = null;
  let draggedProblemId = null;
  let dragFromHandle = false;

  function bindProblemReorderEvents() {
    if (eventsBound || !elements.problemCards) {
      return;
    }

    eventsBound = true;
    const list = elements.problemCards;
    list.addEventListener("click", handleReorderClick);
    list.addEventListener("pointerdown", handleReorderPointerDown);
    list.addEventListener("dragstart", handleReorderDragStart);
    list.addEventListener("dragenter", handleReorderDragEnter, true);
    list.addEventListener("dragover", handleReorderDragOver, true);
    list.addEventListener("drop", handleReorderDrop, true);
    list.addEventListener("dragend", handleReorderDragEnd);
  }

  function getEventElement(target) {
    return target instanceof Element ? target : target?.parentElement ?? null;
  }

  function canReorderInCurrentView() {
    return (
      adminState.isEnabled &&
      adminState.problemSortMode &&
      appState.selectedCategory &&
      appState.selectedCategory !== "전체"
    );
  }

  function getReorderScopeEntries() {
    return getFilteredProblems();
  }

  function handleReorderPointerDown(event) {
    dragFromHandle = Boolean(getEventElement(event.target)?.closest(".problem-drag-handle"));
  }

  function handleReorderDragStart(event) {
    if (!canReorderInCurrentView()) {
      event.preventDefault();
      return;
    }

    const handle = getEventElement(event.target)?.closest(".problem-drag-handle");
    if (!handle || !dragFromHandle) {
      event.preventDefault();
      return;
    }

    const card = handle.closest(".problem-card");
    const problemId = card?.dataset.problemId;
    if (!card || !problemId) {
      event.preventDefault();
      return;
    }

    draggedCard = card;
    draggedProblemId = problemId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", problemId);

    if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(card, 28, 20);
    }

    window.requestAnimationFrame(() => {
      card.classList.add("is-dragging-ghost");
    });
  }

  function handleReorderDragEnter(event) {
    if (!draggedCard) {
      return;
    }

    event.preventDefault();
  }

  function handleReorderDragOver(event) {
    if (!draggedCard || !elements.problemCards) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const list = elements.problemCards;
    const afterElement = getDragAfterCard(list, event.clientY);
    if (afterElement == null) {
      list.appendChild(draggedCard);
    } else if (afterElement !== draggedCard) {
      list.insertBefore(draggedCard, afterElement);
    }

    updateReorderCardPresentation();
  }

  async function handleReorderDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedCard || !draggedProblemId) {
      return;
    }

    if (!requireAdminMode() || !canReorderInCurrentView()) {
      return;
    }

    const orderedIds = getOrderedIdsFromDom();
    if (orderedIds.length === 0) {
      return;
    }

    const result = await persistReorder(orderedIds);
    if (!result.ok) {
      setFeedback(result.message, "wrong");
      renderProblemList();
      return;
    }

    setFeedback("문제 순서를 변경했습니다.", "correct");
    renderProblemList();
  }

  function handleReorderDragEnd() {
    dragFromHandle = false;
    draggedProblemId = null;
    draggedCard = null;
    elements.problemCards
      ?.querySelectorAll(".problem-card")
      .forEach((card) => card.classList.remove("is-dragging", "is-dragging-ghost"));
  }

  function getDragAfterCard(container, pointerY) {
    const cards = [...container.querySelectorAll(".problem-card:not(.is-dragging)")];
    return cards.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = pointerY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element;
  }

  function getOrderedIdsFromDom() {
    return [...elements.problemCards.querySelectorAll(".problem-card")]
      .map((card) => card.dataset.problemId)
      .filter(Boolean);
  }

  function applyLocalDisplayOrder(orderedIds) {
    const updates = buildDisplayOrderUpdates(orderedIds);
    const orderById = new Map(updates.map((entry) => [entry.id, entry.displayOrder]));

    problems.forEach((problem) => {
      const nextOrder = orderById.get(problem.id);
      if (nextOrder) {
        problem.displayOrder = nextOrder;
      }
    });
  }

  async function persistReorder(orderedIds) {
    try {
      await problemService.reorderProblemsInCategory({
        user: getCurrentUser(),
        category: appState.selectedCategory,
        levelGroup: getActiveLevelGroup(),
        orderedProblemIds: orderedIds,
        ProblemStore,
      });
      applyLocalDisplayOrder(orderedIds);
      const sortedProblems = sortProblemsGlobally(problems);
      problems.splice(0, problems.length, ...sortedProblems);
      return { ok: true };
    } catch (error) {
      console.error("Failed to reorder problems.", error);
      return { ok: false, message: "문제 순서 저장에 실패했습니다." };
    }
  }

  function handleReorderClick(event) {
    if (!canReorderInCurrentView()) {
      return;
    }

    const moveButton = event.target.closest("[data-move-problem-id]");
    if (!moveButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!requireAdminMode()) {
      return;
    }

    const problemId = moveButton.getAttribute("data-move-problem-id");
    const direction = moveButton.getAttribute("data-move-problem-direction");
    const orderedIds = getOrderedIdsFromDom();
    const currentIndex = orderedIds.indexOf(problemId);
    if (currentIndex === -1) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedIds.length) {
      return;
    }

    const nextOrder = [...orderedIds];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[currentIndex],
    ];

    void persistReorder(nextOrder).then((result) => {
      if (!result.ok) {
        setFeedback(result.message, "wrong");
      } else {
        setFeedback("문제 순서를 변경했습니다.", "correct");
      }
      renderProblemList();
    });
  }

  function updateReorderCardPresentation() {
    const cards = [...elements.problemCards.querySelectorAll(".problem-card")];
    cards.forEach((card, index) => {
      const number = card.querySelector(".problem-card-number");
      const upButton = card.querySelector('[data-move-problem-direction="up"]');
      const downButton = card.querySelector('[data-move-problem-direction="down"]');
      const isLast = index === cards.length - 1;

      if (number) {
        number.textContent = `${index + 1}번`;
      }

      if (upButton) {
        upButton.disabled = index === 0;
      }

      if (downButton) {
        downButton.disabled = isLast;
      }
    });
  }

  function renderProblemReorderChrome(card, { problemNumber, isFirst, isLast, problemId }) {
    const chrome = document.createElement("div");
    chrome.className = "problem-reorder-chrome";
    chrome.innerHTML = `
      <span
        class="problem-drag-handle"
        draggable="true"
        role="button"
        tabindex="0"
        aria-label="문제 ${problemNumber}번 순서 변경"
        title="드래그하여 순서 변경"
      >⋮⋮</span>
      <div class="problem-reorder-order">
        <button
          class="secondary-button problem-move-button"
          type="button"
          data-move-problem-id="${escapeHtml(problemId)}"
          data-move-problem-direction="up"
          ${isFirst ? "disabled" : ""}
          aria-label="위로"
        >↑</button>
        <button
          class="secondary-button problem-move-button"
          type="button"
          data-move-problem-id="${escapeHtml(problemId)}"
          data-move-problem-direction="down"
          ${isLast ? "disabled" : ""}
          aria-label="아래로"
        >↓</button>
      </div>
    `;
    return chrome;
  }

  function getSortModeHintMessage() {
    if (!appState.selectedCategory || appState.selectedCategory === "전체") {
      return "순서 편집은 카테고리를 하나 선택한 뒤 사용할 수 있습니다.";
    }

    return `${appState.selectedCategory} 카테고리 문제 순서를 드래그하거나 ↑↓로 변경합니다. 모든 계정에 즉시 반영됩니다.`;
  }

  return {
    bindProblemReorderEvents,
    canReorderInCurrentView,
    getSortModeHintMessage,
    renderProblemReorderChrome,
    updateReorderCardPresentation,
    persistReorder,
    getReorderScopeEntries,
  };
}
