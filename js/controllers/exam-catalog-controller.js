import { examSetService } from "../services/exam-set-service.js";
import {
  formatExamSetTypeLabel,
  EXAM_SET_TYPE,
  EXAM_SET_VISIBILITY,
} from "../services/exam-set-constants.js";
import { formatGradeLevelLabel } from "../services/grade-level-service.js";
import { normalizeRole } from "../permissions/permission-service.js";

export function createExamCatalogController({
  elements,
  appState,
  getCurrentUser,
  escapeHtml,
  onStartExamSet,
}) {
  let catalogSets = [];

  function bindExamCatalogEvents() {
    elements.examSetCatalogList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-start-exam-set-id]");
      if (!button) {
        return;
      }

      const examSetId = button.dataset.startExamSetId;
      const examSet = catalogSets.find((set) => set.id === examSetId);
      if (!examSet) {
        return;
      }

      void onStartExamSet?.(examSet);
    });
  }

  async function refreshExamCatalog() {
    if (!elements.examSetCatalog) {
      return;
    }

    const user = getCurrentUser();
    if (!user?.id) {
      elements.examSetCatalog.classList.add("is-hidden");
      return;
    }

    try {
      const result = await examSetService.listExamSetsForViewer({ user });
      catalogSets = result.sets ?? [];
      console.log("[ExamCatalog] loaded for viewer", {
        role: normalizeRole(user.role),
        count: catalogSets.length,
        titles: catalogSets.map((set) => set.title),
      });
    } catch (error) {
      console.error("[ExamCatalog] load failed", error);
      catalogSets = [];
    }

    renderExamCatalog();
  }

  function renderExamCatalog() {
    if (!elements.examSetCatalog || !elements.examSetCatalogList) {
      return;
    }

    const user = getCurrentUser();
    if (!user?.id) {
      elements.examSetCatalog.classList.add("is-hidden");
      return;
    }

    elements.examSetCatalog.classList.remove("is-hidden");

    if (elements.examSetCatalogSummary) {
      if (appState.examSession?.title) {
        elements.examSetCatalogSummary.textContent = `진행 중: ${appState.examSession.title}`;
      } else if (catalogSets.length === 0) {
        elements.examSetCatalogSummary.textContent =
          "현재 이용 가능한 게시 세트가 없습니다. (비공개·초안 세트는 표시되지 않습니다)";
      } else {
        elements.examSetCatalogSummary.textContent =
          "게시된 시험 세트를 선택해 풀이를 시작하세요. 학원·학생·원장 계정도 문제은행에서 동일하게 보입니다.";
      }
    }

    if (catalogSets.length === 0) {
      elements.examSetCatalogList.innerHTML = `
        <p class="exam-set-catalog-empty">표시할 기출/시험 세트가 없습니다.</p>`;
      return;
    }

    elements.examSetCatalogList.innerHTML = catalogSets
      .map((set) => {
        const gradeLabel = set.gradeLevel
          ? formatGradeLevelLabel(set.gradeLevel)
          : "급수 미지정";
        const typeLabel = formatExamSetTypeLabel(set.type);
        const actionLabel = getExamActionLabel(set.type);
        const count = set.questionCount ?? 0;
        const visibilityNote =
          set.visibility === EXAM_SET_VISIBILITY.academy
            ? " · 학원 공개"
            : set.visibility === EXAM_SET_VISIBILITY.public
              ? " · 전체 공개"
              : "";

        return `
          <article class="exam-set-card">
            <div class="exam-set-card-body">
              <h4 class="exam-set-card-title">${escapeHtml(set.title)}</h4>
              <p class="exam-set-card-meta">${escapeHtml(gradeLabel)} · ${escapeHtml(typeLabel)} · ${count}문제${escapeHtml(visibilityNote)}</p>
              ${
                set.description
                  ? `<p class="exam-set-card-description">${escapeHtml(set.description)}</p>`
                  : ""
              }
            </div>
            <button
              type="button"
              class="primary-button exam-set-card-action"
              data-start-exam-set-id="${escapeHtml(set.id)}"
              ${count === 0 ? "disabled" : ""}
            >${escapeHtml(actionLabel)}</button>
          </article>`;
      })
      .join("");
  }

  return {
    bindExamCatalogEvents,
    refreshExamCatalog,
    renderExamCatalog,
  };
}

function getExamActionLabel(type) {
  if (type === EXAM_SET_TYPE.promotionTest) {
    return "승급시험 응시";
  }

  if (type === EXAM_SET_TYPE.mockTest) {
    return "모의시험 시작";
  }

  return "기출문제 풀기";
}
