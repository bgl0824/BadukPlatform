const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not(.is-hidden), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createCategoryCompleteModalController({ elements, onAction }) {
  const dragState = {
    x: 0,
    y: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  };

  let previousActiveElement = null;
  let isOpen = false;

  function bind() {
    const modal = elements.categoryCompleteModal;
    if (!modal) {
      return;
    }

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-category-complete-backdrop]")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const actionButton = event.target.closest("[data-category-complete-action]");
      if (!actionButton || actionButton.disabled) {
        return;
      }

      event.preventDefault();
      onAction(actionButton.dataset.categoryCompleteAction);
    });

    elements.categoryCompleteDragHandle?.addEventListener("pointerdown", startDrag);
    modal.addEventListener("keydown", handleKeydown);
  }

  function show(context) {
    const modal = elements.categoryCompleteModal;
    const panel = elements.categoryCompletePanel;
    if (!modal || !panel || !context) {
      return;
    }

    resetPanelPosition();
    updateContent(context);

    previousActiveElement = document.activeElement;
    isOpen = true;

    modal.classList.remove("is-hidden");
    modal.classList.add("is-open");
    document.body.classList.add("category-complete-modal-open");

    requestAnimationFrame(() => {
      modal.classList.add("is-visible");
      focusInitialAction();
    });
  }

  function hide() {
    const modal = elements.categoryCompleteModal;
    if (!modal || !isOpen) {
      return;
    }

    isOpen = false;
    modal.classList.remove("is-visible", "is-open");
    modal.classList.add("is-hidden");
    document.body.classList.remove("category-complete-modal-open");
    resetPanelPosition();

    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      previousActiveElement.focus();
    }
    previousActiveElement = null;
  }

  function updateContent(context) {
    elements.categoryCompleteTitle.textContent = `${context.categoryName} 완료 🎉`;

    if (elements.categoryCompleteSummary) {
      elements.categoryCompleteSummary.textContent = `${context.totalCount}문제를 모두 완료했어요.`;
    }

    if (context.reviewOffer) {
      elements.categoryCompleteReviewSection?.classList.remove("is-hidden");
      elements.categoryCompleteReviewMeta.textContent =
        `${context.reviewOffer.categoryName} · 복습 추천 ${context.reviewOffer.problemCount}문제`;
      elements.categoryCompleteReviewButton?.classList.remove("is-hidden");
      elements.categoryCompleteReviewButton.disabled = false;
    } else {
      elements.categoryCompleteReviewSection?.classList.add("is-hidden");
      elements.categoryCompleteReviewButton?.classList.add("is-hidden");
    }

    if (context.nextCategoryName) {
      elements.categoryCompleteNextSection?.classList.remove("is-hidden");
      elements.categoryCompleteNextMeta.textContent = context.nextCategoryName;
      elements.categoryCompleteNextButton?.classList.remove("is-hidden");
      elements.categoryCompleteNextButton.disabled = !context.nextProblem;
    } else {
      elements.categoryCompleteNextSection?.classList.add("is-hidden");
      elements.categoryCompleteNextButton?.classList.add("is-hidden");
    }
  }

  function focusInitialAction() {
    const candidates = [
      elements.categoryCompleteNextButton,
      elements.categoryCompleteReviewButton,
      elements.categoryCompleteLaterButton,
    ];

    const target = candidates.find((button) => {
      return button && !button.disabled && !button.classList.contains("is-hidden");
    });

    target?.focus();
  }

  function handleKeydown(event) {
    if (!isOpen || event.key !== "Tab") {
      return;
    }

    const modal = elements.categoryCompleteModal;
    const focusable = [...modal.querySelectorAll(FOCUSABLE_SELECTOR)].filter((node) => {
      return node.offsetParent !== null;
    });

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function startDrag(event) {
    const dialog = elements.categoryCompleteDialog;
    const panel = elements.categoryCompletePanel;
    if (!dialog || !panel || event.button !== 0) {
      return;
    }

    if (event.target.closest("[data-category-complete-action]")) {
      return;
    }

    event.preventDefault();
    dragState.isDragging = true;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.originX = dragState.x;
    dragState.originY = dragState.y;
    dialog.classList.add("is-dragging");
    elements.categoryCompleteDragHandle?.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", dragPanel);
    window.addEventListener("pointerup", stopDrag, { once: true });
    window.addEventListener("pointercancel", stopDrag, { once: true });
  }

  function dragPanel(event) {
    if (!dragState.isDragging) {
      return;
    }

    dragState.x = dragState.originX + event.clientX - dragState.startX;
    dragState.y = dragState.originY + event.clientY - dragState.startY;
    applyPanelPosition();
  }

  function stopDrag() {
    dragState.isDragging = false;
    elements.categoryCompleteDialog?.classList.remove("is-dragging");
    window.removeEventListener("pointermove", dragPanel);
  }

  function applyPanelPosition() {
    const dialog = elements.categoryCompleteDialog;
    if (!dialog) {
      return;
    }

    dialog.style.transform = `translate(${dragState.x}px, ${dragState.y}px)`;
  }

  function resetPanelPosition() {
    dragState.x = 0;
    dragState.y = 0;
    dragState.isDragging = false;
    const dialog = elements.categoryCompleteDialog;
    const panel = elements.categoryCompletePanel;
    if (dialog) {
      dialog.style.transform = "";
    }
    dialog?.classList.remove("is-dragging");
  }

  return {
    bind,
    show,
    hide,
  };
}
