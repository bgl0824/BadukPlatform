import {
  addCategory,
  countProblemsInCategory,
  deleteCategory,
  moveCategory,
  readCategories,
  renameCategory,
  reorderCategories,
  syncCategoriesFromProblems,
  syncCategoryNames,
} from "../services/category-service.js";

export function createCategoryManagerController({
  elements,
  problems,
  ProblemStore,
  problemService,
  CREATOR_CATEGORIES,
  getActiveLevelGroup,
  getCurrentUser,
  requireAdminMode,
  setFeedback,
  renderCategoryFilters,
  renderCreatorCategoryOptions,
  renderProblemList,
  escapeHtml,
}) {
  let categoryManagerEventsBound = false;
  let draggedCategoryId = null;
  let draggedListItem = null;
  let dragFromHandle = false;

  function bindCategoryManagerEvents() {
    if (categoryManagerEventsBound || !elements.categoryManagerList) {
      return;
    }

    categoryManagerEventsBound = true;
    const list = elements.categoryManagerList;
    list.addEventListener("click", handleCategoryManagerClick);
    list.addEventListener("pointerdown", handleCategoryPointerDown);
    list.addEventListener("dragstart", handleCategoryDragStart);
    list.addEventListener("dragenter", handleCategoryDragEnter, true);
    list.addEventListener("dragover", handleCategoryDragOver, true);
    list.addEventListener("drop", handleCategoryDrop, true);
    list.addEventListener("dragend", handleCategoryDragEnd);
  }

  function getEventElement(target) {
    return target instanceof Element ? target : target?.parentElement ?? null;
  }

  function handleCategoryPointerDown(event) {
    dragFromHandle = Boolean(getEventElement(event.target)?.closest(".category-drag-handle"));
  }

  function handleCategoryDragEnter(event) {
    if (!draggedListItem) {
      return;
    }

    event.preventDefault();
  }

  function handleCategoryManagerClick(event) {
    const moveButton = event.target.closest("[data-move-category-id]");
    if (moveButton) {
      event.preventDefault();
      handleMoveCategory(
        moveButton.getAttribute("data-move-category-id"),
        moveButton.getAttribute("data-move-category-direction"),
      );
      return;
    }

    const renameButton = event.target.closest("[data-rename-category-id]");
    if (renameButton) {
      handleRenameCategory(renameButton.getAttribute("data-rename-category-id"));
      return;
    }

    const deleteButton = event.target.closest("[data-delete-category-id]");
    if (deleteButton) {
      handleDeleteCategory(deleteButton.getAttribute("data-delete-category-id"));
    }
  }

  function handleCategoryDragStart(event) {
    const handle = getEventElement(event.target)?.closest(".category-drag-handle");
    if (!handle || !dragFromHandle) {
      event.preventDefault();
      return;
    }

    const item = handle.closest(".category-manager-item");
    if (!item?.dataset.categoryId) {
      event.preventDefault();
      return;
    }

    draggedListItem = item;
    draggedCategoryId = item.dataset.categoryId;
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedCategoryId);

    if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(item, 28, 20);
    }

    window.requestAnimationFrame(() => {
      item.classList.add("is-dragging-ghost");
    });
  }

  function handleCategoryDragOver(event) {
    if (!draggedListItem || !elements.categoryManagerList) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const list = elements.categoryManagerList;
    const afterElement = getDragAfterElement(list, event.clientY);
    if (afterElement == null) {
      list.appendChild(draggedListItem);
    } else if (afterElement !== draggedListItem) {
      list.insertBefore(draggedListItem, afterElement);
    }

    updateCategoryListPresentation();
  }

  function handleCategoryDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedListItem || !draggedCategoryId) {
      return;
    }

    if (!requireAdminMode()) {
      return;
    }

    const result = persistOrderFromList();
    if (!result?.ok) {
      setFeedback(result?.message || "카테고리 순서 저장에 실패했습니다.", "wrong");
      renderCategoryManager();
      return;
    }

    refreshCurriculumViews({ reRenderList: false });
    updateCategoryListPresentation();
    setFeedback("카테고리 순서를 변경했습니다.", "correct");
  }

  function handleCategoryDragEnd() {
    dragFromHandle = false;
    draggedCategoryId = null;
    draggedListItem = null;
    elements.categoryManagerList
      ?.querySelectorAll(".category-manager-item")
      .forEach((entry) => {
        entry.classList.remove("is-dragging", "is-dragging-ghost", "is-drop-target");
      });
  }

  function getDragAfterElement(container, pointerY) {
    const items = [...container.querySelectorAll(".category-manager-item:not(.is-dragging)")];
    return items.reduce(
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

  function persistOrderFromList() {
    const orderedIds = [...elements.categoryManagerList.querySelectorAll(".category-manager-item")]
      .map((item) => item.dataset.categoryId)
      .filter(Boolean);

    return reorderCategories(orderedIds, readCategories(), { levelGroup: getActiveLevelGroup() });
  }

  function renderCategoryManager() {
    bindCategoryManagerEvents();
    if (!elements.categoryManagerList) {
      return;
    }

    const levelGroup = getActiveLevelGroup();
    const categories = readCategories().filter(
      (category) => String(category.levelGroup ?? "입문").trim() === levelGroup,
    );
    if (categories.length === 0) {
      elements.categoryManagerList.innerHTML = `<li class="category-manager-empty">${escapeHtml(levelGroup)} 단계에 등록된 카테고리가 없습니다.</li>`;
      return;
    }

    elements.categoryManagerList.innerHTML = `
      <li class="curriculum-flow-hint" aria-hidden="true">
        <span>${escapeHtml(levelGroup)} · 학습 흐름</span>
        <span class="curriculum-flow-arrow">↓</span>
        <span>아래 순서대로 진행</span>
      </li>
      ${categories.map((category, index) => renderCategoryListItem(category, index, categories.length)).join("")}
    `;
    updateCategoryListPresentation();
  }

  function renderCategoryListItem(category, index, totalCount) {
    const problemCount = countProblemsInCategory(category.name, problems, {
      levelGroup: category.levelGroup,
    });
    const isLast = index === totalCount - 1;

    return `
      <li
        class="category-manager-item"
        data-category-id="${escapeHtml(category.id)}"
        data-problem-count="${problemCount}"
      >
        <div class="curriculum-flow-rail" aria-hidden="true">
          <span class="curriculum-step-badge">${index + 1}</span>
          <span class="curriculum-flow-connector${isLast ? " is-last" : ""}">↓</span>
        </div>
        <span
          class="category-drag-handle"
          draggable="true"
          role="button"
          tabindex="0"
          aria-label="${escapeHtml(category.name)} 순서 변경"
          title="드래그하여 순서 변경"
        >⋮⋮</span>
        <div class="category-manager-order">
          <button
            class="secondary-button category-move-button"
            type="button"
            data-move-category-id="${escapeHtml(category.id)}"
            data-move-category-direction="up"
            ${index === 0 ? "disabled" : ""}
            aria-label="${escapeHtml(category.name)} 위로"
          >
            ↑
          </button>
          <button
            class="secondary-button category-move-button"
            type="button"
            data-move-category-id="${escapeHtml(category.id)}"
            data-move-category-direction="down"
            ${isLast ? "disabled" : ""}
            aria-label="${escapeHtml(category.name)} 아래로"
          >
            ↓
          </button>
        </div>
        <div class="category-manager-main">
          <strong>${escapeHtml(category.name)}</strong>
          <span class="category-manager-meta">공식 순서 ${index + 1} · 문제 ${problemCount}개</span>
        </div>
        <div class="category-manager-actions">
          <button
            class="secondary-button"
            type="button"
            data-rename-category-id="${escapeHtml(category.id)}"
          >
            수정
          </button>
          <button
            class="secondary-button category-delete-button"
            type="button"
            data-delete-category-id="${escapeHtml(category.id)}"
          >
            삭제
          </button>
        </div>
      </li>
    `;
  }

  function updateCategoryListPresentation() {
    const items = [...elements.categoryManagerList.querySelectorAll(".category-manager-item")];
    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const problemCount = Number(item.dataset.problemCount ?? 0);
      const badge = item.querySelector(".curriculum-step-badge");
      const meta = item.querySelector(".category-manager-meta");
      const connector = item.querySelector(".curriculum-flow-connector");
      const upButton = item.querySelector('[data-move-category-direction="up"]');
      const downButton = item.querySelector('[data-move-category-direction="down"]');

      if (badge) {
        badge.textContent = String(index + 1);
      }

      if (meta) {
        meta.textContent = `공식 순서 ${index + 1} · 문제 ${problemCount}개`;
      }

      if (connector) {
        connector.classList.toggle("is-last", isLast);
        connector.hidden = isLast;
      }

      if (upButton) {
        upButton.disabled = index === 0;
      }

      if (downButton) {
        downButton.disabled = isLast;
      }
    });
  }

  function refreshCurriculumViews({ reRenderList = true } = {}) {
    syncCategoryNamesFromStorage();
    if (reRenderList) {
      renderCategoryManager();
    }
    renderCategoryFilters();
    renderCreatorCategoryOptions();
  }

  function refreshCategoryViews() {
    syncCategoriesFromProblems(problems);
    refreshCurriculumViews();
    renderProblemList();
  }

  function syncCategoryNamesFromStorage() {
    syncCategoryNames(CREATOR_CATEGORIES, readCategories(), {
      levelGroup: getActiveLevelGroup(),
    });
  }

  function handleMoveCategory(categoryId, direction) {
    if (!requireAdminMode() || !categoryId || !direction) {
      return;
    }

    const result = moveCategory(categoryId, direction);
    if (!result.ok) {
      setFeedback(result.message, "wrong");
      return;
    }

    refreshCurriculumViews();
    setFeedback("카테고리 순서를 변경했습니다.", "correct");
  }

  function handleRenameCategory(categoryId) {
    if (!requireAdminMode()) {
      return;
    }

    const category = readCategories().find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }

    const nextName = window.prompt("새 카테고리 이름", category.name);
    if (nextName === null) {
      return;
    }

    const result = renameCategory(categoryId, nextName);
    if (!result.ok) {
      setFeedback(result.message, "wrong");
      return;
    }

    if (result.previousName !== result.nextName) {
      reassignProblemsCategory(result.previousName, result.nextName, category.levelGroup);
    }

    refreshCategoryViews();
    setFeedback(`카테고리 이름을 "${result.nextName}"(으)로 변경했습니다.`, "correct");
  }

  async function handleDeleteCategory(categoryId) {
    if (!requireAdminMode()) {
      return;
    }

    const category = readCategories().find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }

    const problemCount = countProblemsInCategory(category.name, problems, {
      levelGroup: category.levelGroup,
    });
    const confirmed = window.confirm(
      problemCount > 0
        ? "이 카테고리에는 문제가 포함되어 있습니다. 삭제할까요?"
        : "이 카테고리를 삭제할까요?",
    );
    if (!confirmed) {
      return;
    }

    const result = deleteCategory(categoryId);
    if (!result.ok) {
      setFeedback(result.message, "wrong");
      return;
    }

    if (problemCount > 0) {
      await reassignProblemsCategory(result.removedName, result.fallbackName, category.levelGroup);
    }

    refreshCategoryViews();
    setFeedback("카테고리를 삭제했습니다.", "correct");
  }

  async function reassignProblemsCategory(fromName, toName, levelGroup) {
    const normalizedLevelGroup = String(levelGroup ?? "입문").trim();
    const affectedProblems = problems.filter(
      (problem) =>
        problem.category === fromName &&
        String(problem.levelGroup ?? "입문").trim() === normalizedLevelGroup,
    );
    if (affectedProblems.length === 0) {
      return;
    }

    for (const problem of affectedProblems) {
      problem.category = toName;
      try {
        await problemService.saveProblem({
          user: getCurrentUser(),
          problem,
          ProblemStore,
        });
      } catch (error) {
        console.error("Failed to update problem category.", error);
        setFeedback("문제 카테고리 반영 중 오류가 발생했습니다.", "wrong");
      }
    }
  }

  function registerCategoryByName(name) {
    const result = addCategory(name, readCategories(), { levelGroup: getActiveLevelGroup() });
    if (!result.ok) {
      return result;
    }

    refreshCategoryViews();
    return result;
  }

  return {
    bindCategoryManagerEvents,
    renderCategoryManager,
    refreshCategoryViews,
    registerCategoryByName,
  };
}
