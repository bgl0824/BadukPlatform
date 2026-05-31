/** @typedef {"correct" | "wrong"} BoardFeedbackTone */

const FADE_MS = 240;

const PRESETS = {
  correct: {
    title: "정답!",
    subtitle: "잘했어요!",
  },
  correctNext: {
    title: "정답!",
    subtitle: "잠시 후 다음 문제로 이동합니다.",
  },
  correctLast: {
    title: "정답!",
    subtitle: "이 카테고리의 마지막 문제예요.",
  },
  correctReviewNext: {
    title: "정답!",
    subtitle: "다음 복습 문제로 이동합니다.",
  },
  correctReviewDone: {
    title: "정답!",
    subtitle: "복습을 마쳤어요.",
  },
  alternative: {
    title: "좋은 수!",
    subtitle: "실전적으로 충분히 좋은 수입니다.",
  },
  alternativeNext: {
    title: "좋은 수!",
    subtitle: "잠시 후 다음 문제로 이동합니다.",
  },
  alternativeLast: {
    title: "좋은 수!",
    subtitle: "이 카테고리의 마지막 문제예요.",
  },
  alternativeReviewNext: {
    title: "좋은 수!",
    subtitle: "다음 복습 문제로 이동합니다.",
  },
  alternativeReviewDone: {
    title: "좋은 수!",
    subtitle: "복습을 마쳤어요.",
  },
  wrong: {
    title: "아쉬워요",
    subtitle: "다시 한 번 도전해 보세요.",
  },
  wrongOx: {
    title: "다시 선택",
    subtitle: "O/X 중 정답을 골라보세요.",
  },
};

/**
 * 바둑판 위 정답/오답 피드백 (pointer-events: none, fade only).
 * 향후 character-layer / speech-bubble-layer 는 동일 overlay 루트에 추가.
 */
export function createBoardFeedbackOverlay({
  overlayLayer,
  messageLayer,
  contentEl,
  titleEl,
  subtitleEl,
  characterSlot = null,
  speechSlot = null,
}) {
  let hideTimer = null;
  let fadeOutTimer = null;

  function clearTimers() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (fadeOutTimer) {
      window.clearTimeout(fadeOutTimer);
      fadeOutTimer = null;
    }
  }

  function applyTone(tone) {
    contentEl?.classList.remove("is-correct", "is-wrong");
    if (tone === "correct") {
      contentEl?.classList.add("is-correct");
    } else if (tone === "wrong") {
      contentEl?.classList.add("is-wrong");
    }
  }

  function resetMessageContent() {
    contentEl?.classList.add("is-hidden");
    contentEl?.classList.remove("is-correct", "is-wrong");
    if (titleEl) {
      titleEl.textContent = "";
    }
    if (subtitleEl) {
      subtitleEl.textContent = "";
    }
  }

  function hide() {
    clearTimers();
    overlayLayer?.classList.remove("is-visible");
    messageLayer?.classList.remove("is-visible");
    overlayLayer?.setAttribute("aria-hidden", "true");

    fadeOutTimer = window.setTimeout(() => {
      fadeOutTimer = null;
      resetMessageContent();
    }, FADE_MS);
  }

  /** Fade 없이 즉시 숨김 (모달 등 상위 UI가 열릴 때). */
  function forceHide() {
    clearTimers();
    overlayLayer?.classList.remove("is-visible");
    messageLayer?.classList.remove("is-visible");
    overlayLayer?.setAttribute("aria-hidden", "true");
    resetMessageContent();
    characterSlot?.setAttribute("hidden", "");
    speechSlot?.setAttribute("hidden", "");
  }

  /**
   * @param {object} options
   * @param {BoardFeedbackTone} options.tone
   * @param {string} [options.title]
   * @param {string} [options.subtitle]
   * @param {keyof typeof PRESETS} [options.preset]
   * @param {number} [options.duration] 0 = manual hide
   * @param {() => void} [options.onHidden]
   */
  function show({
    tone,
    title = "",
    subtitle = "",
    preset = null,
    duration = 1000,
    onHidden = null,
  }) {
    clearTimers();

    const presetCopy = preset ? PRESETS[preset] : null;
    const resolvedTitle = title || presetCopy?.title || "";
    const resolvedSubtitle = subtitle || presetCopy?.subtitle || "";

    if (titleEl) {
      titleEl.textContent = resolvedTitle;
    }
    if (subtitleEl) {
      subtitleEl.textContent = resolvedSubtitle;
    }

    contentEl?.classList.remove("is-hidden");
    applyTone(tone);

    overlayLayer?.setAttribute("aria-hidden", "false");
    void overlayLayer?.offsetWidth;
    overlayLayer?.classList.add("is-visible");
    messageLayer?.classList.add("is-visible");

    if (duration > 0) {
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        hide();
        onHidden?.();
      }, duration);
    }

    return { hide };
  }

  function showCorrectSequenceRemaining(remainingMoves) {
    return show({
      tone: "correct",
      title: "좋아요!",
      subtitle: `정답 ${remainingMoves}수 남았어요.`,
      duration: 700,
    });
  }

  function showCorrectPreset(preset, { duration = 1000, onHidden = null } = {}) {
    return show({ tone: "correct", preset, duration, onHidden });
  }

  function showWrongPreset(preset, { duration = 1000, onHidden = null } = {}) {
    return show({ tone: "wrong", preset, duration, onHidden });
  }

  return {
    hide,
    forceHide,
    clearTimers,
    show,
    showCorrectPreset,
    showWrongPreset,
    showCorrectSequenceRemaining,
    characterSlot,
    speechSlot,
  };
}
