export function createExamView({ elements }) {
  function renderExamSessionBanner(examSession) {
    if (!elements.listSummary || !examSession) {
      return;
    }

    elements.listSummary.textContent = `시험 세트: ${examSession.title} (${examSession.currentIndex + 1}/${examSession.problemIds.length})`;
  }

  function clearExamSessionBanner() {
    if (!elements.listSummary) {
      return;
    }

    elements.listSummary.textContent = "전체 문제를 확인하고 원하는 문제를 선택하세요.";
  }

  return {
    renderExamSessionBanner,
    clearExamSessionBanner,
  };
}
