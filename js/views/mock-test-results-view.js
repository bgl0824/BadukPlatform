import { formatDurationKorean } from "../utils/mock-test-time.js";

export function formatMockAttemptDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function renderMockTestResultsTableHtml(attempts, escapeHtml) {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return "";
  }

  const rows = attempts
    .map((attempt) => {
      const wrong = Array.isArray(attempt.wrongProblemNumbers) ? attempt.wrongProblemNumbers : [];
      const wrongLabel = wrong.length > 0 ? wrong.join(",") : "-";
      const durationLabel = formatDurationKorean(attempt.durationSeconds ?? 0);
      return `
        <tr>
          <td>${escapeHtml(attempt.studentName || "이름없음")}</td>
          <td>${attempt.correctCount}/${attempt.totalQuestionCount}</td>
          <td>${attempt.accuracyRate}%</td>
          <td>${escapeHtml(durationLabel)}</td>
          <td>${escapeHtml(wrongLabel)}</td>
          <td>${escapeHtml(formatMockAttemptDate(attempt.attemptedAt))}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="mock-test-results-table-wrap">
      <table class="mock-test-results-table">
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">점수</th>
            <th scope="col">정답률</th>
            <th scope="col">소요시간</th>
            <th scope="col">틀린문제</th>
            <th scope="col">응시일</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
