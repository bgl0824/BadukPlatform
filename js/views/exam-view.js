export function createExamView({ elements }) {
  function renderExamPlaceholder() {
    elements.meta.textContent = "Exam";
    elements.title.textContent = "시험 관리";
    elements.description.textContent = "시험지 생성과 응시 결과 관리를 위한 화면입니다.";
    elements.description.classList.remove("is-hidden");
    elements.learningObjective.textContent = "시험 기능을 준비 중입니다.";
  }

  return {
    renderExamPlaceholder,
  };
}
