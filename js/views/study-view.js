export function createStudyView({ elements, escapeHtml }) {
  function renderStudyScreen({ curriculumTree, expandedLevelGroups, reviewOffersByLevel = {} }) {
    if (!elements.studyCurriculumAccordion) {
      return;
    }

    hideFlowSummary();

    const expandedSet =
      expandedLevelGroups instanceof Set ? expandedLevelGroups : new Set(expandedLevelGroups ?? []);

    elements.studyCurriculumAccordion.innerHTML = curriculumTree.levelGroups
      .map((levelFlow) => {
        return renderLevelAccordionSection({
          levelFlow,
          isExpanded: expandedSet.has(levelFlow.levelGroup),
          reviewOffer: reviewOffersByLevel[levelFlow.levelGroup] ?? null,
        });
      })
      .join("");
  }

  function renderLevelAccordionSection({ levelFlow, isExpanded, reviewOffer }) {
    const {
      levelGroup,
      levelInfo,
      levelProgress,
      isCurrent,
      isLevelEmpty,
      categoryRows,
      recentlyStudiedCategory,
      activeRow,
      recommendation,
    } = levelFlow;

    const title = levelInfo?.title ?? `${levelGroup} 과정`;
    const description = levelInfo?.description ?? "";
    const solved = levelProgress?.solved ?? 0;
    const total = levelProgress?.total ?? 0;
    const percent = levelProgress?.percent ?? 0;
    const statusLabel = levelProgress?.label ?? "시작 전";
    const toggleIcon = isExpanded ? "▼" : "▶";
    const progressSummary =
      total > 0 ? `${solved}/${total} · ${statusLabel}` : "커리큘럼 준비 중";

    return `
      <section
        class="study-level-accordion${isExpanded ? " is-expanded" : ""}${isCurrent ? " is-current" : ""}${isLevelEmpty ? " is-empty" : ""}"
        data-study-level-group="${escapeHtml(levelGroup)}"
      >
        <button
          class="study-level-accordion-toggle"
          type="button"
          data-toggle-study-level="${escapeHtml(levelGroup)}"
          aria-expanded="${isExpanded ? "true" : "false"}"
        >
          <span class="study-level-accordion-icon" aria-hidden="true">${toggleIcon}</span>
          <span class="study-level-accordion-heading">
            <span class="study-level-accordion-title">${escapeHtml(title)}</span>
            <span class="study-level-accordion-summary">${escapeHtml(progressSummary)}</span>
          </span>
          ${isCurrent ? `<span class="study-level-current-badge">진행 중</span>` : ""}
        </button>
        <div class="study-level-accordion-panel"${isExpanded ? "" : " hidden"}>
          <p class="study-level-accordion-description">${escapeHtml(description)}</p>
          ${renderLevelProgressBar({ title, solved, total, percent, statusLabel, levelProgress })}
          ${renderLevelReviewOffer(reviewOffer, levelGroup)}
          ${renderLevelRecommendation(recommendation, activeRow)}
          ${renderLevelCategoryBody({
            levelFlow,
            categoryRows,
            recentlyStudiedCategory,
            activeRow,
            recommendation,
            isLevelEmpty,
          })}
        </div>
      </section>
    `;
  }

  function renderLevelProgressBar({ title, solved, total, percent, statusLabel, levelProgress }) {
    if (total === 0) {
      return "";
    }

    const completedCategories = levelProgress?.completedCategories ?? 0;
    const categoryCount = levelProgress?.categoryCount ?? 0;

    return `
      <div class="study-level-progress">
        <div class="study-level-progress-head">
          <span class="study-level-progress-label">전체 진행률</span>
          <span class="study-level-progress-value">${escapeHtml(String(solved))}/${escapeHtml(String(total))} · ${escapeHtml(statusLabel)}</span>
        </div>
        <div
          class="study-level-progress-track"
          role="progressbar"
          aria-valuenow="${percent}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="${escapeHtml(title)} 진행률"
        >
          <span class="study-level-progress-fill" style="width: ${percent}%"></span>
        </div>
        <p class="study-level-progress-meta">카테고리 ${escapeHtml(String(completedCategories))}/${escapeHtml(String(categoryCount))} 완료</p>
      </div>
    `;
  }

  function renderLevelReviewOffer(reviewOffer, levelGroup) {
    if (!reviewOffer) {
      return "";
    }

    return `
      <div class="study-review-offer">
        <p class="study-review-eyebrow">복습 추천</p>
        <p class="study-review-meta">${escapeHtml(reviewOffer.categoryName)} · 복습 추천 ${reviewOffer.problemCount}문제</p>
        <button
          class="study-review-start-button"
          type="button"
          data-start-review-category="${escapeHtml(reviewOffer.categoryName)}"
          data-review-level-group="${escapeHtml(levelGroup)}"
        >
          복습 시작
        </button>
      </div>
    `;
  }

  function renderLevelRecommendation(recommendation, activeRow) {
    if (!activeRow?.isComplete || !recommendation || recommendation.problem) {
      return "";
    }

    return `
      <div class="study-recommendation">
        <p>${escapeHtml(recommendation.categoryName)} 카테고리에 아직 문제가 없습니다.</p>
      </div>
    `;
  }

  function renderLevelCategoryBody({
    levelFlow,
    categoryRows,
    recentlyStudiedCategory,
    activeRow,
    recommendation,
    isLevelEmpty,
  }) {
    const { levelGroup } = levelFlow;

    if (isLevelEmpty) {
      return `
        <p class="study-level-placeholder">아직 준비 중입니다. 곧 커리큘럼이 추가됩니다.</p>
      `;
    }

    if (categoryRows.length === 0) {
      return `
        <p class="study-level-placeholder">커리큘럼 준비 중입니다.</p>
      `;
    }

    const noticeHtml = buildFlowNotice({ activeRow, recommendation, categoryRows, levelGroup });

    return `
      <ul class="study-flow-list">
        ${noticeHtml}
        ${categoryRows
          .map((row) => {
            const isRecentlyStudied = row.name === recentlyStudiedCategory;
            const flowState = getFlowState(row, recentlyStudiedCategory);
            const isNextRecommended =
              row.name === recommendation?.categoryName && activeRow?.isComplete;
            const rowContinueTarget = row.continueTarget ?? null;
            const showContinue = Boolean(rowContinueTarget) && !row.isComplete;
            const showRecommend =
              isNextRecommended && recommendation?.problem && activeRow?.isComplete;

            const recentBadge = isRecentlyStudied
              ? `<span class="study-recent-learning-badge">최근 학습</span>`
              : "";

            return `
              <li class="study-flow-item is-category-child is-${flowState}${isRecentlyStudied ? " is-recent-learning" : ""}${isNextRecommended ? " is-recommended" : ""}">
                <span class="study-flow-branch" aria-hidden="true">├</span>
                <span class="study-flow-marker" aria-hidden="true">${getFlowMarker(flowState, isNextRecommended)}</span>
                <div class="study-flow-body">
                  <p class="study-flow-title">${escapeHtml(row.name)}${recentBadge}</p>
                  <p class="study-flow-meta">${escapeHtml(getRowMeta(row, showContinue, showRecommend, recommendation))}</p>
                  ${renderRowAction({ showContinue, showRecommend, continueTarget: rowContinueTarget, recommendation })}
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  function hideFlowSummary() {
    const target = elements.studyFlowSummary ?? elements.studyContinueCard;
    if (!target) {
      return;
    }

    target.classList.add("is-hidden");
    target.innerHTML = "";
  }

  function buildFlowNotice({ activeRow, recommendation, categoryRows, levelGroup }) {
    if (categoryRows.length === 0) {
      return "";
    }

    const allComplete = categoryRows.every((row) => row.isComplete);
    const anyStarted = categoryRows.some((row) => row.isInProgress || row.isComplete);
    const hasAnyContinue = categoryRows.some((row) => row.continueTarget);

    if (allComplete) {
      return `
        <li class="study-flow-notice">
          <p>${escapeHtml(levelGroup)} 과정을 모두 마쳤습니다. <button type="button" data-go-problem-bank>문제은행</button>에서 복습할 수 있습니다.</p>
        </li>
      `;
    }

    if (!anyStarted && !hasAnyContinue) {
      return `
        <li class="study-flow-notice">
          <p>시작할 문제가 없습니다. <button type="button" data-go-problem-bank>문제은행</button>에서 선택해 주세요.</p>
        </li>
      `;
    }

    if (
      activeRow?.isComplete &&
      !recommendation?.problem &&
      !hasAnyContinue
    ) {
      return `
        <li class="study-flow-notice">
          <p>${escapeHtml(activeRow.name)} 테마를 완료했습니다. 다른 테마를 이어가거나 <button type="button" data-go-problem-bank>문제은행</button>에서 복습해 주세요.</p>
        </li>
      `;
    }

    return "";
  }

  function getContinueNumber(target) {
    return target?.categoryProblemNumber ?? target?.positionInCategory ?? 0;
  }

  function getRowMeta(row, showContinue, showRecommend, recommendation) {
    const continueTarget = row.continueTarget;
    if (showContinue && continueTarget) {
      const numberLabel = `${getContinueNumber(continueTarget)}번 이어하기`;
      return `${row.solved}/${row.total} 완료 · ${numberLabel}`;
    }

    if (showRecommend && recommendation) {
      const recommendNumber =
        recommendation.categoryProblemNumber ?? recommendation.positionInCategory ?? 0;
      return `${row.solved}/${row.total} · 다음 추천 ${recommendNumber}번`;
    }

    if (row.isComplete) {
      return `${row.solved}/${row.total} 완료`;
    }

    if (row.isInProgress) {
      return `${row.solved}/${row.total} · 진행중`;
    }

    return `${row.solved}/${row.total}`;
  }

  function renderRowAction({ showContinue, showRecommend, continueTarget, recommendation }) {
    if (showContinue && continueTarget) {
      return `
        <button
          class="study-flow-continue-button"
          type="button"
          data-start-problem-index="${continueTarget.index}"
        >
          이어하기
        </button>
      `;
    }

    if (showRecommend && recommendation?.problem) {
      return `
        <button
          class="study-flow-continue-button is-recommend"
          type="button"
          data-start-problem-index="${recommendation.index}"
        >
          추천 시작
        </button>
      `;
    }

    return "";
  }

  function getFlowState(row, recentlyStudiedCategory) {
    if (row.isComplete) {
      return "complete";
    }

    if (row.name === recentlyStudiedCategory) {
      return "current";
    }

    if (row.isInProgress || row.continueTarget?.isResumeInProgress) {
      return "progress";
    }

    return "upcoming";
  }

  function getFlowMarker(flowState, isRecommended) {
    if (flowState === "complete") {
      return "✔";
    }

    if (flowState === "current" || flowState === "progress" || isRecommended) {
      return "▶";
    }

    return "○";
  }

  function renderStudyHubMeta(currentLevelGroup = "입문") {
    elements.meta.textContent = "Study";
    elements.title.textContent = "학습중";
    elements.description.textContent = "단계별 학습 흐름을 확인하고 이어갑니다.";
    elements.description.classList.remove("is-hidden");
    elements.heroCard?.classList.add("is-compact-hub");
  }

  function clearStudyHubMeta() {
    elements.heroCard?.classList.remove("is-compact-hub");
  }

  return {
    renderStudyScreen,
    renderStudyHubMeta,
    clearStudyHubMeta,
  };
}
