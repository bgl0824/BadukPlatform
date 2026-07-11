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

function renderWelcomeCard({ title, subtitle, dateLabel }) {
  const now = new Date();
  return `
    <section class="home-welcome-card" aria-label="홈 인사">
      <p class="home-greeting">${escapeHtml(getGreetingByHour(now.getHours()))}</p>
      <h2 class="home-academy-name">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="home-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      <p class="home-date">${escapeHtml(dateLabel ?? formatDateLabel(now))}</p>
    </section>
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
    ${renderWelcomeCard({
      title: academyName,
      dateLabel: formatDateLabel(now),
    })}

    <section class="home-cards-grid" aria-label="오늘 학원 대시보드">
      <button type="button" class="home-card home-card--order-learning" data-home-target="learning">
        <p class="home-card-icon" aria-hidden="true">📘</p>
        <h3>오늘 학습</h3>
        <p>학습 학생 <strong>${learning.activeStudents ?? 0}</strong>명</p>
        <p>문제 풀이 <strong>${learning.solveAttempts ?? 0}</strong>건</p>
        <p>정답률 <strong>${formatPercent(learning.accuracyRate ?? 0)}</strong></p>
      </button>

      <button type="button" class="home-card home-card--order-attendance" data-home-target="attendance">
        <p class="home-card-icon" aria-hidden="true">✅</p>
        <h3>오늘 출결</h3>
        <p>출석 학생 <strong>${attendance.presentStudents ?? 0}</strong>명</p>
        <p>미출석 학생 <strong>${attendance.absentStudents ?? 0}</strong>명</p>
        <p>현재 수업부 <strong>${escapeHtml(attendance.currentPeriodName ?? "-")}</strong></p>
      </button>

      <button type="button" class="home-card home-card--order-payments" data-home-target="payments">
        <p class="home-card-icon" aria-hidden="true">💳</p>
        <h3>결제 현황</h3>
        <p>이번 달 결제 완료 <strong>${payments.paidCount ?? 0}</strong>명</p>
        <p>미확인 <strong>${payments.unpaidCount ?? 0}</strong>명</p>
      </button>

      <button type="button" class="home-card home-card--order-sms" data-home-target="sms-logs">
        <p class="home-card-icon" aria-hidden="true">💬</p>
        <h3>최근 문자</h3>
        <p>발송대기 <strong>${sms.pendingCount ?? 0}</strong>건</p>
        <p>발송성공 <strong>${sms.sentCount ?? 0}</strong>건</p>
        <p>발송실패 <strong>${sms.failedCount ?? 0}</strong>건</p>
      </button>

      <button type="button" class="home-card home-card--wide home-card--order-wrong" data-home-target="wrong-notes">
        <p class="home-card-icon" aria-hidden="true">📝</p>
        <h3>최근 오답</h3>
        ${renderWrongItems(wrong.items)}
      </button>

      <button type="button" class="home-card home-card--wide home-card--order-todos" data-home-target="todos">
        <p class="home-card-icon" aria-hidden="true">📌</p>
        <h3>오늘 해야 할 일</h3>
        ${renderTodoItems(todos)}
      </button>
    </section>
  `;
}

export function renderTeacherHomeDashboard(root, payload) {
  if (!root) {
    return;
  }

  const {
    teacherName = "선생님",
    academyName = "우리 바둑학원",
    attendance = {},
    learning = {},
    review = {},
    wrong = {},
    todos = [],
  } = payload ?? {};

  root.innerHTML = `
    ${renderWelcomeCard({
      title: teacherName,
      subtitle: academyName,
    })}

    <section class="home-cards-grid" aria-label="선생님 홈 대시보드">
      <button type="button" class="home-card" data-home-target="attendance">
        <p class="home-card-icon" aria-hidden="true">✅</p>
        <h3>오늘 출석</h3>
        <p>출석 학생 <strong>${attendance.presentStudents ?? 0}</strong>명</p>
        <p>미출석 학생 <strong>${attendance.absentStudents ?? 0}</strong>명</p>
        <p>현재 수업부 <strong>${escapeHtml(attendance.currentPeriodName ?? "-")}</strong></p>
      </button>

      <button type="button" class="home-card" data-home-target="learning">
        <p class="home-card-icon" aria-hidden="true">📘</p>
        <h3>오늘 학습</h3>
        <p>학습 학생 <strong>${learning.activeStudents ?? 0}</strong>명</p>
        <p>문제 풀이 <strong>${learning.solveAttempts ?? 0}</strong>건</p>
        <p>정답률 <strong>${formatPercent(learning.accuracyRate ?? 0)}</strong></p>
      </button>

      <button type="button" class="home-card" data-home-target="learning">
        <p class="home-card-icon" aria-hidden="true">🔁</p>
        <h3>복습이 필요한 학생</h3>
        <p>복습 필요 학생 <strong>${review.studentCount ?? 0}</strong>명</p>
      </button>

      <button type="button" class="home-card" data-home-target="learning">
        <p class="home-card-icon" aria-hidden="true">📝</p>
        <h3>최근 오답</h3>
        <p>오늘 오답 학생 <strong>${wrong.studentCount ?? 0}</strong>명</p>
      </button>

      <button type="button" class="home-card home-card--wide" data-home-target="todos">
        <p class="home-card-icon" aria-hidden="true">📌</p>
        <h3>오늘 해야 할 일</h3>
        ${renderTodoItems(todos)}
      </button>
    </section>
  `;
}

export function renderStudentHomeDashboard(root, payload) {
  if (!root) {
    return;
  }

  const {
    studentName = "학생",
    learning = {},
    curriculum = {},
    projectedGradeLabel = "산정 중",
    recent = {},
    wrongNotes = {},
  } = payload ?? {};

  root.innerHTML = `
    <div class="home-student-shell" data-home-role="student">
      ${renderWelcomeCard({
        title: `${studentName}님`,
        subtitle: "오늘도 한 수 더 성장해 봐요.",
      })}

      <section class="home-cards-grid" aria-label="학습 홈 대시보드">
        <article class="home-card home-card--static">
          <p class="home-card-icon" aria-hidden="true">📘</p>
          <h3>오늘의 학습</h3>
          <p>오늘 풀 문제 <strong>${learning.assignedCount ?? 0}</strong>개</p>
          <p>오늘 푼 문제 <strong>${learning.solvedCount ?? 0}</strong>개</p>
          <p>정답 수 <strong>${learning.correctCount ?? 0}</strong>개</p>
        </article>

        <article class="home-card home-card--static">
          <p class="home-card-icon" aria-hidden="true">🎯</p>
          <h3>현재 과정</h3>
          <p><strong>${escapeHtml(curriculum.activeLevelGroup ?? "입문")}</strong></p>
          <p>${curriculum.percent ?? 0}% · ${escapeHtml(curriculum.statusLabel ?? "시작 전")}</p>
        </article>

        <article class="home-card home-card--static">
          <p class="home-card-icon" aria-hidden="true">🏅</p>
          <h3>예상 급수</h3>
          <p><strong>${escapeHtml(projectedGradeLabel)}</strong></p>
        </article>

        <article class="home-card home-card--static">
          <p class="home-card-icon" aria-hidden="true">🕒</p>
          <h3>최근 학습</h3>
          <p class="home-card-ellipsis" title="${escapeHtml(recent.category ?? "기록 없음")}">
            <strong>${escapeHtml(recent.category ?? "기록 없음")}</strong>
          </p>
          <p>최근 학습일 <strong>${escapeHtml(recent.activityAtLabel ?? "기록 없음")}</strong></p>
        </article>

        <button type="button" class="home-card" data-home-target="wrong-notes">
          <p class="home-card-icon" aria-hidden="true">📒</p>
          <h3>오답노트</h3>
          <p>오답 <strong>${wrongNotes.wrongNoteCount ?? 0}</strong>개</p>
          <p>복습 필요 <strong>${wrongNotes.reviewNeededCount ?? 0}</strong>개</p>
        </button>

        <button type="button" class="home-card home-card--cta" data-home-target="study-start">
          <p class="home-card-icon" aria-hidden="true">▶</p>
          <h3>학습 시작</h3>
          <p>지금 바로 학습 화면으로 이동합니다.</p>
        </button>
      </section>
    </div>
  `;
}
