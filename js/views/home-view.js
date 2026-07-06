function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0%";
  }
  return `${Math.max(0, Math.round(number))}%`;
}

function formatDateLabel(date = new Date()) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function getGreetingByHour(hour) {
  if (hour < 12) {
    return "좋은 아침입니다.";
  }
  if (hour < 18) {
    return "좋은 오후입니다.";
  }
  return "좋은 저녁입니다.";
}

function renderTodoItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="home-card-empty">오늘 처리할 항목이 없습니다.</p>';
  }

  return `
    <ul class="home-todo-list">
      ${items
        .map(
          (item) => `
        <li class="home-todo-item">□ ${escapeHtml(item)}</li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function renderWrongItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="home-card-empty">최근 오답 데이터가 없습니다.</p>';
  }

  return `
    <ul class="home-wrong-list">
      ${items
        .map(
          (item) => `
        <li class="home-wrong-item">${escapeHtml(item)}</li>
      `,
        )
        .join("")}
    </ul>
  `;
}

export function renderOwnerHomeDashboard(root, payload) {
  if (!root) {
    return;
  }

  const {
    academyName = "우리 바둑학원",
    learning = {},
    attendance = {},
    payments = {},
    sms = {},
    wrong = {},
    todos = [],
  } = payload ?? {};

  const now = new Date();
  root.innerHTML = `
    <section class="home-welcome-card" aria-label="홈 인사">
      <p class="home-greeting">${escapeHtml(getGreetingByHour(now.getHours()))}</p>
      <h2 class="home-academy-name">${escapeHtml(academyName)}</h2>
      <p class="home-date">${escapeHtml(formatDateLabel(now))}</p>
    </section>

    <section class="home-cards-grid" aria-label="오늘 학원 대시보드">
      <button type="button" class="home-card" data-home-target="learning">
        <p class="home-card-icon" aria-hidden="true">📘</p>
        <h3>오늘 학습</h3>
        <p>학습 학생 <strong>${learning.activeStudents ?? 0}</strong>명</p>
        <p>문제 풀이 <strong>${learning.solveAttempts ?? 0}</strong>건</p>
        <p>정답률 <strong>${formatPercent(learning.accuracyRate ?? 0)}</strong></p>
      </button>

      <button type="button" class="home-card" data-home-target="attendance">
        <p class="home-card-icon" aria-hidden="true">✅</p>
        <h3>오늘 출결</h3>
        <p>출석 학생 <strong>${attendance.presentStudents ?? 0}</strong>명</p>
        <p>미출석 학생 <strong>${attendance.absentStudents ?? 0}</strong>명</p>
        <p>현재 수업부 <strong>${escapeHtml(attendance.currentPeriodName ?? "-")}</strong></p>
      </button>

      <button type="button" class="home-card" data-home-target="payments">
        <p class="home-card-icon" aria-hidden="true">💳</p>
        <h3>결제 현황</h3>
        <p>이번 달 결제 완료 <strong>${payments.paidCount ?? 0}</strong>명</p>
        <p>미확인 <strong>${payments.unpaidCount ?? 0}</strong>명</p>
      </button>

      <button type="button" class="home-card" data-home-target="sms-logs">
        <p class="home-card-icon" aria-hidden="true">💬</p>
        <h3>최근 문자</h3>
        <p>발송대기 <strong>${sms.pendingCount ?? 0}</strong>건</p>
        <p>발송성공 <strong>${sms.sentCount ?? 0}</strong>건</p>
        <p>발송실패 <strong>${sms.failedCount ?? 0}</strong>건</p>
      </button>

      <button type="button" class="home-card home-card--wide" data-home-target="wrong-notes">
        <p class="home-card-icon" aria-hidden="true">📝</p>
        <h3>최근 오답</h3>
        ${renderWrongItems(wrong.items)}
      </button>

      <button type="button" class="home-card home-card--wide" data-home-target="todos">
        <p class="home-card-icon" aria-hidden="true">📌</p>
        <h3>오늘 해야 할 일</h3>
        ${renderTodoItems(todos)}
      </button>
    </section>
  `;
}
