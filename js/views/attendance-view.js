import {
  buildDateKey,
  buildMonthKey,
  clonePeriodDrafts,
  countMonthAttendanceTotal,
  countStudentMonthAttendance,
  countTodayAttendance,
  createDefaultPeriodDraft,
  formatAttendanceDateLabel,
  formatMonthLabel,
  formatPaymentDateShort,
  getActivePeriods,
  getAllPeriods,
  getDaysInMonth,
  getStudentAttendanceCode,
  getStudentLastAttendanceDate,
  bulkAssignMissingAttendanceCodes,
  getStudentMeta,
  getTodayDateKey,
  isAttendanceMarked,
  saveAcademyPeriods,
  saveStudentMeta,
  toggleAttendanceMark,
  toggleStudentPaymentDate,
} from "../services/attendance-service.js";
import {
  getSmsLogStatusLabel,
  listAttendanceSmsLogs,
  queueAttendanceCheckInSmsLog,
} from "../services/attendance-sms-log-service.js";
import { formatGuardianPhoneDisplay } from "../services/student-guardian-profile-service.js";
import {
  readAcademyMembers,
  refreshAcademyMembersCache,
  resolveAcademyScopeId,
  selectAcademyMembersForUser,
} from "../services/academy-service.js";
import { createAttendanceCheckKiosk } from "../attendance/attendance-check-kiosk.js";
import {
  buildKioskConnectUrlForCurrentOrigin,
  isKioskBoundToAcademy,
} from "../services/attendance-kiosk-service.js";

const PAYMENT_UNCONFIRMED_LABEL = "미확인";

const ATTENDANCE_SECTIONS = {
  MONTHLY: "monthly",
  CODES: "codes",
  CHECK: "check",
  KIOSK: "kiosk",
  SMS_LOGS: "sms-logs",
};

function getTeacherDisplayName(teacherId, members) {
  const normalizedId = String(teacherId ?? "").trim();
  if (!normalizedId) {
    return "미배정";
  }

  const teacher = members.find(
    (member) => member.role === "teacher" && String(member.userId) === normalizedId,
  );
  const name = String(teacher?.name ?? "").trim();
  return name || "미배정";
}

function getPaymentDisplayLabel(paymentDate) {
  return paymentDate ? formatPaymentDateShort(paymentDate) : PAYMENT_UNCONFIRMED_LABEL;
}

const STICKY_COLUMNS = [
  { key: "index", label: "번호", width: 44 },
  { key: "name", label: "이름", width: 76 },
  { key: "frequency", label: "수강횟수", width: 78 },
  { key: "days", label: "등원요일", width: 78 },
  { key: "payment", label: "결제", width: 60 },
  { key: "total", label: "총 출석수", width: 68 },
];

export function createAttendanceView({
  elements,
  getCurrentUser,
  escapeHtml,
}) {
  let selectedYear = new Date().getFullYear();
  let selectedMonth = new Date().getMonth() + 1;
  let renderGeneration = 0;
  let codesRenderGeneration = 0;
  let periodsSectionOpen = false;
  let activeAttendanceSection = ATTENDANCE_SECTIONS.MONTHLY;
  /** @type {import("../services/attendance-service.js").AttendancePeriod[] | null} */
  let periodSettingsDraft = null;

  const attendanceCheckKiosk = createAttendanceCheckKiosk({
    mount: elements.attendanceCheckBody,
    getAcademyContext: () => {
      const currentUser = getCurrentUser?.() ?? null;
      const academyId = resolveAcademyScopeId(currentUser);
      if (!academyId) {
        return null;
      }

      return {
        academyId,
        academyName: String(currentUser?.academyName ?? "").trim(),
      };
    },
    getCurrentUser,
    escapeHtml,
    isActive: () => activeAttendanceSection === ATTENDANCE_SECTIONS.CHECK,
    onAttendanceSaved: (payload) => {
      refreshMonthlyAttendanceAfterCheckIn(payload);
      if (activeAttendanceSection === ATTENDANCE_SECTIONS.SMS_LOGS) {
        renderSmsLogsPanel();
      }
    },
    features: {
      showHeader: true,
      showCurrentTime: false,
      showKioskOpenLink: false,
      largeLayout: false,
    },
  });

  function getTodayParts() {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      dateKey: buildDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    };
  }

  function shiftMonth(delta) {
    const date = new Date(selectedYear, selectedMonth - 1 + delta, 1);
    selectedYear = date.getFullYear();
    selectedMonth = date.getMonth() + 1;
    void renderAttendanceMonthlyPanel();
  }

  function goToTodayMonth() {
    const today = getTodayParts();
    selectedYear = today.year;
    selectedMonth = today.month;
    void renderAttendanceMonthlyPanel();
  }

  function buildPeriodListMarkup(periods) {
    if (periods.length === 0) {
      return `<p class="attendance-period-empty">활성화된 수업부가 없습니다.</p>`;
    }

    return `
      <ul class="attendance-period-list" aria-label="활성 수업부">
        ${periods
          .map(
            (period) => `
              <li class="attendance-period-chip">
                <span class="attendance-period-chip-name">${escapeHtml(period.name)}</span>
                <span class="attendance-period-chip-time">${escapeHtml(period.start_time)}~${escapeHtml(period.end_time)}</span>
              </li>
            `,
          )
          .join("")}
      </ul>
    `;
  }

  function mountPeriodSettingsModal() {
    let root = elements.attendancePanel?.querySelector("#attendance-period-settings-modal");
    if (!root && elements.attendancePanel) {
      root = document.createElement("div");
      root.id = "attendance-period-settings-modal";
      root.className = "attendance-period-settings-modal is-hidden";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "attendance-period-settings-title");
      elements.attendancePanel.appendChild(root);
    }
    return root;
  }

  function buildPeriodSettingsRowsMarkup(drafts) {
    if (drafts.length === 0) {
      return `<p class="attendance-period-settings-empty">등록된 수업부가 없습니다. 아래에서 추가해 주세요.</p>`;
    }

    return `
      <div class="attendance-period-settings-list">
        ${drafts
          .map((period) => {
            const isActive = period.is_active !== false;
            return `
              <article
                class="attendance-period-settings-row${isActive ? "" : " is-inactive"}"
                data-period-id="${escapeHtml(period.id)}"
              >
                <div class="attendance-period-settings-row-head">
                  <p class="attendance-period-settings-row-title">${escapeHtml(period.name)}</p>
                  <p class="attendance-period-settings-row-id">ID: ${escapeHtml(period.id)}</p>
                </div>
                <div class="attendance-period-settings-fields">
                  <label>
                    <span>수업부 이름</span>
                    <input
                      type="text"
                      value="${escapeHtml(period.name)}"
                      data-period-field="name"
                      data-period-id="${escapeHtml(period.id)}"
                      maxlength="40"
                    />
                  </label>
                  <label>
                    <span>시작 시간</span>
                    <input
                      type="time"
                      value="${escapeHtml(period.start_time)}"
                      data-period-field="start_time"
                      data-period-id="${escapeHtml(period.id)}"
                    />
                  </label>
                  <label>
                    <span>종료 시간</span>
                    <input
                      type="time"
                      value="${escapeHtml(period.end_time)}"
                      data-period-field="end_time"
                      data-period-id="${escapeHtml(period.id)}"
                    />
                  </label>
                  <label class="attendance-period-active-toggle">
                    <span>사용</span>
                    <input
                      type="checkbox"
                      data-period-field="is_active"
                      data-period-id="${escapeHtml(period.id)}"
                      ${isActive ? "checked" : ""}
                    />
                  </label>
                </div>
                ${
                  isActive
                    ? `<button
                        type="button"
                        class="attendance-period-deactivate-button"
                        data-attendance-action="deactivate-period"
                        data-period-id="${escapeHtml(period.id)}"
                      >
                        비활성 처리
                      </button>`
                    : `<p class="attendance-period-inactive-note">비활성 수업부는 출석부에 표시되지 않습니다.</p>`
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderPeriodSettingsModal() {
    const root = mountPeriodSettingsModal();
    if (!root) {
      return;
    }

    if (!periodSettingsDraft) {
      root.classList.add("is-hidden");
      document.body.classList.remove("attendance-period-settings-open");
      root.innerHTML = "";
      return;
    }

    root.classList.remove("is-hidden");
    document.body.classList.add("attendance-period-settings-open");
    root.innerHTML = `
      <button
        type="button"
        class="attendance-period-settings-backdrop"
        data-attendance-action="cancel-period-settings"
        aria-label="수업부 설정 닫기"
      ></button>
      <div class="attendance-period-settings-card">
        <header class="attendance-period-settings-header">
          <div>
            <p class="eyebrow">Attendance</p>
            <h3 id="attendance-period-settings-title">수업부 설정</h3>
            <p class="attendance-period-settings-lead">이름·시간·사용 여부를 변경할 수 있습니다. 수업부 ID는 유지됩니다.</p>
          </div>
          <button
            type="button"
            class="attendance-period-settings-close"
            data-attendance-action="cancel-period-settings"
            aria-label="닫기"
          >
            ×
          </button>
        </header>
        ${buildPeriodSettingsRowsMarkup(periodSettingsDraft)}
        <div class="attendance-period-settings-actions">
          <button type="button" class="secondary-button" data-attendance-action="add-period">
            + 수업부 추가
          </button>
        </div>
        <footer class="attendance-period-settings-footer">
          <button type="button" class="secondary-button" data-attendance-action="cancel-period-settings">
            취소
          </button>
          <button type="button" class="primary-button" data-attendance-action="save-period-settings">
            저장
          </button>
        </footer>
      </div>
    `;
  }

  function openPeriodSettings(academyId) {
    periodSettingsDraft = clonePeriodDrafts(getAllPeriods(academyId));
    renderPeriodSettingsModal();
  }

  function closePeriodSettings() {
    periodSettingsDraft = null;
    renderPeriodSettingsModal();
  }

  function updatePeriodDraftField(periodId, field, value) {
    if (!periodSettingsDraft) {
      return;
    }

    const period = periodSettingsDraft.find((item) => item.id === periodId);
    if (!period) {
      return;
    }

    if (field === "is_active") {
      period.is_active = Boolean(value);
      return;
    }

    if (field === "name") {
      period.name = String(value ?? "");
      return;
    }

    if (field === "start_time" || field === "end_time") {
      period[field] = String(value ?? "");
    }
  }

  function deactivatePeriodDraft(periodId) {
    if (!periodSettingsDraft) {
      return;
    }

    const period = periodSettingsDraft.find((item) => item.id === periodId);
    if (!period) {
      return;
    }

    period.is_active = false;
    renderPeriodSettingsModal();
  }

  function addPeriodDraft() {
    if (!periodSettingsDraft) {
      return;
    }

    periodSettingsDraft.push(createDefaultPeriodDraft(periodSettingsDraft));
    renderPeriodSettingsModal();
  }

  async function savePeriodSettings(academyId) {
    if (!periodSettingsDraft) {
      return;
    }

    saveAcademyPeriods(academyId, periodSettingsDraft);
    closePeriodSettings();
    await renderAttendanceMonthlyPanel();
  }

  function buildSummaryStripMarkup({
    studentCount,
    monthAttendanceTotal,
    todayAttendanceCount,
  }) {
    const todayValue =
      todayAttendanceCount === null || todayAttendanceCount === undefined ? "—" : todayAttendanceCount;

    return `
      <div class="attendance-summary-strip" data-attendance-summary-root aria-label="출결 요약">
        <div class="attendance-summary-item">
          <span class="attendance-summary-label">전체 학생 수</span>
          <strong class="attendance-summary-value" data-attendance-summary="students">${studentCount}</strong>
        </div>
        <div class="attendance-summary-item">
          <span class="attendance-summary-label">이번 달 출석 수</span>
          <strong class="attendance-summary-value" data-attendance-summary="month">${monthAttendanceTotal}</strong>
        </div>
        <div class="attendance-summary-item">
          <span class="attendance-summary-label">오늘 출석 수</span>
          <strong class="attendance-summary-value" data-attendance-summary="today">${todayValue}</strong>
        </div>
      </div>
    `;
  }

  function buildDateHeaderMarkup(year, month, day) {
    const date = new Date(year, month - 1, day);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] ?? "";
    return `
      <span class="attendance-date-head-day">${month}/${day}</span>
      <span class="attendance-date-head-weekday">${weekday}</span>
    `;
  }

  function buildFixedHeaderCells() {
    return STICKY_COLUMNS.map((column, index) => {
      const isEdge = index === STICKY_COLUMNS.length - 1;
      return `
        <th
          class="attendance-grid-fixed-head${isEdge ? " attendance-grid-fixed-head--edge" : ""}"
          scope="col"
          style="--attendance-col-width: ${column.width}px;"
        >
          ${escapeHtml(column.label)}
        </th>
      `;
    }).join("");
  }

  function buildScrollHeaderCells(periods, year, month) {
    const dayCount = getDaysInMonth(year, month);
    const dateHeaders = [];
    const periodHeaders = [];

    for (let day = 1; day <= dayCount; day += 1) {
      dateHeaders.push(`
        <th
          class="attendance-grid-date-head"
          colspan="${periods.length}"
          scope="colgroup"
        >
          ${buildDateHeaderMarkup(year, month, day)}
        </th>
      `);

      periods.forEach((period) => {
        periodHeaders.push(`
          <th class="attendance-grid-period-head" scope="col" title="${escapeHtml(period.name)} ${escapeHtml(period.start_time)}~${escapeHtml(period.end_time)}">
            ${escapeHtml(period.name)}
          </th>
        `);
      });
    }

    return {
      dateHeaders: dateHeaders.join(""),
      periodHeaders: periodHeaders.join(""),
    };
  }

  function buildFixedStudentCells({
    student,
    rowIndex,
    academyId,
    monthKey,
    periodIds,
  }) {
    const studentId = student.userId;
    const meta = getStudentMeta(academyId, studentId);
    const totalAttendance = countStudentMonthAttendance(
      academyId,
      monthKey,
      studentId,
      periodIds,
    );
    const lessonCountValue =
      meta.lesson_count === null || meta.lesson_count === undefined ? "" : String(meta.lesson_count);
    const daysValue = meta.attendance_days ?? "";
    const paymentLabel = getPaymentDisplayLabel(meta.payment_date);
    const paymentTitle = meta.payment_date
      ? `${paymentLabel} (클릭하여 미확인으로 변경)`
      : "클릭하여 오늘 날짜로 저장";

    return `
      <td
        class="attendance-grid-fixed-cell"
        style="--attendance-col-width: ${STICKY_COLUMNS[0].width}px;"
      >
        ${rowIndex}
      </td>
      <td
        class="attendance-grid-fixed-cell attendance-grid-fixed-cell--name"
        style="--attendance-col-width: ${STICKY_COLUMNS[1].width}px;"
        title="${escapeHtml(student.name || student.username || "이름 없음")}"
      >
        ${escapeHtml(student.name || student.username || "이름 없음")}
      </td>
      <td
        class="attendance-grid-fixed-cell attendance-grid-fixed-cell--editable"
        style="--attendance-col-width: ${STICKY_COLUMNS[2].width}px;"
      >
        <input
          class="attendance-meta-input attendance-meta-input--count"
          type="number"
          min="0"
          max="99"
          inputmode="numeric"
          value="${escapeHtml(lessonCountValue)}"
          placeholder="—"
          data-attendance-meta-field="lesson_count"
          data-student-id="${escapeHtml(studentId)}"
          aria-label="${escapeHtml(student.name || "학생")} 수강횟수"
        />
      </td>
      <td
        class="attendance-grid-fixed-cell attendance-grid-fixed-cell--editable"
        style="--attendance-col-width: ${STICKY_COLUMNS[3].width}px;"
      >
        <input
          class="attendance-meta-input attendance-meta-input--days"
          type="text"
          value="${escapeHtml(daysValue)}"
          placeholder="—"
          title="${escapeHtml(daysValue || "등원요일 입력")}"
          data-attendance-meta-field="attendance_days"
          data-student-id="${escapeHtml(studentId)}"
          aria-label="${escapeHtml(student.name || "학생")} 등원요일"
        />
      </td>
      <td
        class="attendance-grid-fixed-cell attendance-grid-fixed-cell--editable"
        style="--attendance-col-width: ${STICKY_COLUMNS[4].width}px;"
      >
        <button
          type="button"
          class="attendance-payment-date-button${meta.payment_date ? " has-date" : " is-unconfirmed"}"
          data-attendance-action="toggle-payment-date"
          data-student-id="${escapeHtml(studentId)}"
          title="${escapeHtml(paymentTitle)}"
          aria-label="${escapeHtml(student.name || "학생")} 결제 ${paymentLabel}"
        >
          ${escapeHtml(paymentLabel)}
        </button>
      </td>
      <td
        class="attendance-grid-fixed-cell attendance-grid-fixed-cell--edge attendance-grid-fixed-cell--total"
        style="--attendance-col-width: ${STICKY_COLUMNS[5].width}px;"
        data-attendance-student-total="${escapeHtml(studentId)}"
      >
        ${totalAttendance}
      </td>
    `;
  }

  function buildScrollCheckCells({
    student,
    academyId,
    monthKey,
    periods,
    year,
    month,
  }) {
    const dayCount = getDaysInMonth(year, month);
    const checkCells = [];

    for (let day = 1; day <= dayCount; day += 1) {
      const dateKey = buildDateKey(year, month, day);
      periods.forEach((period) => {
        const checked = isAttendanceMarked(
          academyId,
          monthKey,
          student.userId,
          dateKey,
          period.id,
        );
        checkCells.push(`
          <td class="attendance-grid-check-cell">
            <button
              type="button"
              class="attendance-check-button${checked ? " is-checked" : ""}"
              data-attendance-action="toggle"
              data-student-id="${escapeHtml(student.userId)}"
              data-date-key="${escapeHtml(dateKey)}"
              data-period-id="${escapeHtml(period.id)}"
              aria-pressed="${checked ? "true" : "false"}"
              aria-label="${escapeHtml(student.name || "학생")} ${escapeHtml(formatAttendanceDateLabel(year, month, day))} ${escapeHtml(period.name)} 출석"
            >
              <span class="attendance-check-icon" aria-hidden="true">${checked ? "✓" : ""}</span>
            </button>
          </td>
        `);
      });
    }

    return checkCells.join("");
  }

  function buildStudentRowsMarkup({
    students,
    academyId,
    monthKey,
    periods,
    year,
    month,
  }) {
    const periodIds = periods.map((period) => period.id);
    const fixedRows = [];
    const scrollRows = [];

    students.forEach((student, index) => {
      const rowIndex = index + 1;
      fixedRows.push(`
        <tr class="attendance-grid-row">
          ${buildFixedStudentCells({
            student,
            rowIndex,
            academyId,
            monthKey,
            periodIds,
          })}
        </tr>
      `);
      scrollRows.push(`
        <tr class="attendance-grid-row">
          ${buildScrollCheckCells({
            student,
            academyId,
            monthKey,
            periods,
            year,
            month,
          })}
        </tr>
      `);
    });

    return {
      fixedRows: fixedRows.join(""),
      scrollRows: scrollRows.join(""),
    };
  }

  function buildGridMarkup({
    students,
    academyId,
    monthKey,
    periods,
    year,
    month,
  }) {
    if (students.length === 0) {
      return `<p class="attendance-empty-state">등록된 활성 학생이 없습니다. 학원관리에서 학생을 등록한 뒤 출석부를 사용할 수 있습니다.</p>`;
    }

    if (periods.length === 0) {
      return `<p class="attendance-empty-state">활성화된 수업부가 없습니다.</p>`;
    }

    const fixedHeaders = buildFixedHeaderCells();
    const scrollHeaders = buildScrollHeaderCells(periods, year, month);
    const { fixedRows, scrollRows } = buildStudentRowsMarkup({
      students,
      academyId,
      monthKey,
      periods,
      year,
      month,
    });

    return `
      <div class="attendance-grid-frame" tabindex="0" aria-label="월간 출석부">
        <div class="attendance-grid-outer">
          <div class="attendance-grid-split">
            <div class="attendance-grid-fixed-pane" aria-hidden="false">
              <table class="attendance-grid attendance-grid--fixed">
                <thead>
                  <tr class="attendance-grid-head-row attendance-grid-head-row--fixed">
                    ${fixedHeaders}
                  </tr>
                </thead>
                <tbody>
                  ${fixedRows}
                </tbody>
              </table>
            </div>
            <div class="attendance-grid-scroll-pane">
              <table class="attendance-grid attendance-grid--scroll">
                <thead>
                  <tr class="attendance-grid-head-row attendance-grid-head-row--dates">
                    ${scrollHeaders.dateHeaders}
                  </tr>
                  <tr class="attendance-grid-head-row attendance-grid-head-row--periods">
                    ${scrollHeaders.periodHeaders}
                  </tr>
                </thead>
                <tbody>
                  ${scrollRows}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function renderAttendanceMonthlyPanel() {
    const body = elements.attendancePanelBody;
    if (!body) {
      return;
    }

    const generation = ++renderGeneration;
    const currentUser = getCurrentUser?.() ?? null;
    const academyId = resolveAcademyScopeId(currentUser);
    const monthKey = buildMonthKey(selectedYear, selectedMonth);

    body.innerHTML = `
      <div class="attendance-panel-loading" aria-live="polite">출석부를 불러오는 중입니다…</div>
    `;

    if (!academyId) {
      body.innerHTML = `<p class="attendance-empty-state">학원 정보를 확인할 수 없습니다. 학원장 계정으로 다시 로그인해 주세요.</p>`;
      return;
    }

    await refreshAcademyMembersCache(academyId, { user: currentUser });
    if (generation !== renderGeneration) {
      return;
    }

    const members = readAcademyMembers();
    const students = selectAcademyMembersForUser(members, currentUser, {
      role: "student",
      status: "active",
    }).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko"));

    const periods = getActivePeriods(academyId);
    const studentIds = students.map((student) => student.userId);
    const today = getTodayParts();
    const isSelectedCurrentMonth =
      selectedYear === today.year && selectedMonth === today.month;
    const monthAttendanceTotal = countMonthAttendanceTotal(academyId, monthKey);
    const todayAttendanceCount = isSelectedCurrentMonth
      ? countTodayAttendance(academyId, monthKey, studentIds, periods.map((p) => p.id), today.dateKey)
      : null;

    body.innerHTML = `
      <div class="attendance-panel-stack">
        <section class="attendance-control-bar" aria-label="월 선택">
          <div class="attendance-month-nav">
            <button
              type="button"
              class="attendance-icon-button"
              data-attendance-action="prev-month"
              aria-label="이전 달"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <p class="attendance-month-label" aria-live="polite">${escapeHtml(formatMonthLabel(selectedYear, selectedMonth))}</p>
            <button
              type="button"
              class="attendance-icon-button"
              data-attendance-action="next-month"
              aria-label="다음 달"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <button type="button" class="attendance-today-button" data-attendance-action="today-month">
            오늘
          </button>
        </section>

        ${buildSummaryStripMarkup({
          studentCount: students.length,
          monthAttendanceTotal,
          todayAttendanceCount,
        })}

        <details class="attendance-period-details"${periodsSectionOpen ? " open" : ""}>
          <summary class="attendance-period-summary">
            <span class="attendance-period-summary-label">수업부</span>
            <span class="attendance-period-summary-meta">${periods.length}개 활성</span>
            <button
              type="button"
              class="secondary-button attendance-period-settings-button"
              data-attendance-action="open-period-settings"
            >
              수업부 설정
            </button>
          </summary>
          <div class="attendance-period-details-body">
            ${buildPeriodListMarkup(periods)}
          </div>
        </details>

        <section class="attendance-grid-section" aria-label="월간 출석부">
          <div class="attendance-grid-section-head">
            <h4>월간 출석부</h4>
            <p>가로 스크롤로 날짜별·수업부별 출석을 체크합니다.</p>
          </div>
          ${buildGridMarkup({
            students,
            academyId,
            monthKey,
            periods,
            year: selectedYear,
            month: selectedMonth,
          })}
        </section>
      </div>
    `;

    const periodDetails = body.querySelector(".attendance-period-details");
    periodDetails?.addEventListener("toggle", () => {
      periodsSectionOpen = periodDetails.open;
    });
  }

  function buildAttendanceCodesTableMarkup({ students, members, academyId, monthKey, periods }) {
    const periodIds = periods.map((period) => period.id);
    const rows = students
      .map((student) => {
        const code = getStudentAttendanceCode(academyId, student.userId);
        const teacherName = getTeacherDisplayName(student.assignedTeacherId, members);
        const lastDate = getStudentLastAttendanceDate(academyId, student.userId);
        const monthCount = countStudentMonthAttendance(
          academyId,
          monthKey,
          student.userId,
          periodIds,
        );
        const codeLabel = code ?? "—";
        const lastDateLabel = lastDate ?? "—";
        const copyDisabled = !code;

        return `
          <tr>
            <td>${escapeHtml(String(student.name ?? "이름 없음"))}</td>
            <td>${escapeHtml(teacherName)}</td>
            <td class="attendance-code-cell">${escapeHtml(codeLabel)}</td>
            <td>${escapeHtml(lastDateLabel)}</td>
            <td>${monthCount}회</td>
            <td>
              <button
                type="button"
                class="secondary-button attendance-code-copy-button"
                data-attendance-action="copy-attendance-code"
                data-attendance-code="${escapeHtml(code ?? "")}"
                ${copyDisabled ? "disabled" : ""}
              >
                복사
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="attendance-codes-table-wrap">
        <table class="attendance-codes-table">
          <thead>
            <tr>
              <th scope="col">학생명</th>
              <th scope="col">담당 선생님</th>
              <th scope="col">출결코드</th>
              <th scope="col">최근 출석일</th>
              <th scope="col">이번 달 출석수</th>
              <th scope="col">복사</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="attendance-empty-state">등록된 학생이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderAttendanceCodesPanel() {
    const body = elements.attendanceCodesBody;
    if (!body) {
      return;
    }

    const generation = ++codesRenderGeneration;
    const currentUser = getCurrentUser?.() ?? null;
    const academyId = resolveAcademyScopeId(currentUser);
    const today = getTodayParts();
    const monthKey = buildMonthKey(today.year, today.month);

    body.innerHTML = `
      <div class="attendance-panel-loading" aria-live="polite">출결코드를 불러오는 중입니다…</div>
    `;

    if (!academyId) {
      body.innerHTML = `<p class="attendance-empty-state">학원 정보를 확인할 수 없습니다. 학원장 계정으로 다시 로그인해 주세요.</p>`;
      return;
    }

    await refreshAcademyMembersCache(academyId, { user: currentUser });
    if (generation !== codesRenderGeneration) {
      return;
    }

    const members = readAcademyMembers();
    const students = selectAcademyMembersForUser(members, currentUser, {
      role: "student",
      status: "active",
    }).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko"));
    const periods = getActivePeriods(academyId);

    body.innerHTML = `
      <div class="attendance-codes-panel">
        <header class="attendance-codes-header">
          <div class="attendance-codes-header-text">
            <h4>출결코드 관리</h4>
            <p>학생별 출결코드를 확인하고 복사할 수 있습니다. 기존 학생은 일괄 생성으로 코드를 발급할 수 있습니다.</p>
          </div>
          <button
            type="button"
            class="primary-button attendance-codes-bulk-button"
            data-attendance-action="bulk-generate-attendance-codes"
          >
            출결코드 일괄 생성
          </button>
        </header>
        ${buildAttendanceCodesTableMarkup({
          students,
          members,
          academyId,
          monthKey,
          periods,
        })}
      </div>
    `;
  }

  function formatSmsLogScheduledTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return String(iso ?? "");
    }

    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function renderSmsLogsPanel() {
    const body = elements.attendanceSmsLogsBody;
    if (!body) {
      return;
    }

    const currentUser = getCurrentUser?.() ?? null;
    const academyId = resolveAcademyScopeId(currentUser);
    if (!academyId) {
      body.innerHTML = `<p class="attendance-empty-state">학원 정보를 확인할 수 없습니다. 학원장 계정으로 다시 로그인해 주세요.</p>`;
      return;
    }

    const logs = listAttendanceSmsLogs(academyId);

    if (logs.length === 0) {
      body.innerHTML = `
        <div class="attendance-sms-logs-panel">
          <header class="attendance-sms-logs-header">
            <div class="attendance-sms-logs-header-text">
              <h4>문자 로그</h4>
              <p>출석 처리 시 보호자에게 발송 예정인 문자 내역입니다. (실제 발송은 API 연동 후 진행)</p>
            </div>
          </header>
          <p class="attendance-empty-state">아직 발송 예정 문자가 없습니다.</p>
        </div>
      `;
      return;
    }

    const rows = logs
      .map((log) => {
        const statusLabel = getSmsLogStatusLabel(log.status);
        const statusClass =
          log.status === "sent"
            ? "is-sent"
            : log.status === "failed"
              ? "is-failed"
              : "is-pending";

        return `
          <tr>
            <td>${escapeHtml(formatSmsLogScheduledTime(log.created_at))}</td>
            <td>${escapeHtml(String(log.student_name ?? ""))}</td>
            <td>${escapeHtml(formatGuardianPhoneDisplay(log.guardian_phone))}</td>
            <td class="attendance-sms-logs-message">${escapeHtml(String(log.message ?? ""))}</td>
            <td><span class="attendance-sms-logs-status ${statusClass}">${escapeHtml(statusLabel)}</span></td>
          </tr>
        `;
      })
      .join("");

    body.innerHTML = `
      <div class="attendance-sms-logs-panel">
        <header class="attendance-sms-logs-header">
          <div class="attendance-sms-logs-header-text">
            <h4>문자 로그</h4>
            <p>출석 처리 시 보호자에게 발송 예정인 문자 내역입니다. (실제 발송은 API 연동 후 진행)</p>
          </div>
        </header>
        <div class="attendance-sms-logs-table-wrap">
          <table class="attendance-sms-logs-table">
            <thead>
              <tr>
                <th scope="col">발송 예정 시간</th>
                <th scope="col">학생명</th>
                <th scope="col">보호자 연락처</th>
                <th scope="col">메시지 내용</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderKioskManagementPanel() {
    const body = elements.attendanceKioskBody;
    if (!body) {
      return;
    }

    const currentUser = getCurrentUser?.() ?? null;
    const academyId = resolveAcademyScopeId(currentUser);
    if (!academyId) {
      body.innerHTML = `<p class="attendance-empty-state">학원 정보를 확인할 수 없습니다. 학원장 계정으로 다시 로그인해 주세요.</p>`;
      return;
    }

    const academyName = String(currentUser?.academyName ?? "").trim() || "우리 학원";
    const connectUrl = buildKioskConnectUrlForCurrentOrigin(academyId, academyName);
    const isConnectedOnThisDevice = isKioskBoundToAcademy(academyId);

    body.innerHTML = `
      <div class="attendance-kiosk-management-panel">
        <header class="attendance-kiosk-management-header">
          <h4>공용폰 관리</h4>
          <p>입구 공용폰·태블릿을 <strong>${escapeHtml(academyName)}</strong> 전용 출결기로 연결합니다.</p>
        </header>
        <section class="attendance-kiosk-management-card" aria-label="공용폰 연결">
          <p class="attendance-kiosk-management-label">공용폰 연결 링크</p>
          <p class="attendance-kiosk-management-help">
            공용폰 브라우저에서 아래 링크를 한 번 열면, 이후 로그인 없이 같은 학원 출결만 처리됩니다.
          </p>
          <div class="attendance-kiosk-management-url-wrap">
            <input
              class="attendance-kiosk-management-url"
              type="text"
              readonly
              value="${escapeHtml(connectUrl)}"
              aria-label="공용폰 연결 URL"
              data-attendance-kiosk-url
            />
          </div>
          <div class="attendance-kiosk-management-actions">
            <button
              type="button"
              class="primary-button"
              data-attendance-action="copy-kiosk-connect-url"
            >
              링크 복사
            </button>
            <button
              type="button"
              class="secondary-button"
              data-attendance-action="open-kiosk-connect-url"
            >
              공용폰 화면 열기
            </button>
          </div>
        </section>
        <p class="attendance-kiosk-management-status${isConnectedOnThisDevice ? " is-connected" : ""}">
          ${
            isConnectedOnThisDevice
              ? `이 브라우저에는 <strong>${escapeHtml(academyName)}</strong> 공용폰이 연결되어 있습니다.`
              : "이 브라우저에는 아직 공용폰 연결 정보가 없습니다. 공용폰에서 위 링크를 열어 주세요."
          }
        </p>
      </div>
    `;
  }

  function showAttendanceSection(section) {
    const normalized = Object.values(ATTENDANCE_SECTIONS).includes(section)
      ? section
      : ATTENDANCE_SECTIONS.MONTHLY;
    activeAttendanceSection = normalized;

    attendanceCheckKiosk.stop();

    elements.attendanceSectionPanels?.forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.attendanceSectionPanel !== normalized);
    });

    elements.attendanceSubmenuButtons?.forEach((button) => {
      const isActive = button.dataset.attendanceSection === normalized;
      button.classList.toggle("is-active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (normalized === ATTENDANCE_SECTIONS.MONTHLY) {
      void renderAttendanceMonthlyPanel();
      return;
    }

    if (normalized === ATTENDANCE_SECTIONS.CODES) {
      void renderAttendanceCodesPanel();
      return;
    }

    if (normalized === ATTENDANCE_SECTIONS.CHECK) {
      attendanceCheckKiosk.resetCheckPeriodAutoState();
      void attendanceCheckKiosk.prepare({ refreshMembers: true });
      attendanceCheckKiosk.render();
      attendanceCheckKiosk.start({ resetAuto: true });
      return;
    }

    if (normalized === ATTENDANCE_SECTIONS.KIOSK) {
      renderKioskManagementPanel();
      return;
    }

    if (normalized === ATTENDANCE_SECTIONS.SMS_LOGS) {
      renderSmsLogsPanel();
      return;
    }
  }

  async function renderAttendancePanel(options = {}) {
    if (options.resetSection) {
      activeAttendanceSection = ATTENDANCE_SECTIONS.MONTHLY;
    }

    showAttendanceSection(activeAttendanceSection);
  }

  function refreshAttendanceSummaries({
    academyId,
    monthKey,
    students,
    periods,
    todayAttendanceCount,
  }) {
    const root = elements.attendancePanelBody;
    if (!root) {
      return;
    }

    const periodIds = periods.map((period) => period.id);
    root.querySelector('[data-attendance-summary="students"]')?.replaceChildren(
      document.createTextNode(String(students.length)),
    );
    root.querySelector('[data-attendance-summary="month"]')?.replaceChildren(
      document.createTextNode(String(countMonthAttendanceTotal(academyId, monthKey))),
    );
    const todayNode = root.querySelector('[data-attendance-summary="today"]');
    if (todayNode) {
      const todayValue =
        todayAttendanceCount === null || todayAttendanceCount === undefined
          ? "—"
          : String(todayAttendanceCount);
      todayNode.replaceChildren(document.createTextNode(todayValue));
    }

    students.forEach((student) => {
      const totalCell = root.querySelector(
        `[data-attendance-student-total="${student.userId}"]`,
      );
      if (!totalCell) {
        return;
      }
      totalCell.textContent = String(
        countStudentMonthAttendance(academyId, monthKey, student.userId, periodIds),
      );
    });
  }

  function isAttendanceInteractionTarget(target) {
    return (
      elements.attendancePanelBody?.contains(target) ||
      elements.attendanceCodesBody?.contains(target) ||
      elements.attendanceCheckBody?.contains(target) ||
      elements.attendanceKioskBody?.contains(target) ||
      elements.attendancePanel?.contains(target)
    );
  }

  function refreshMonthlyAttendanceAfterCheckIn({
    academyId,
    studentId,
    dateKey,
    periodId,
    monthKey,
  }) {
    const [yearText, monthText] = String(dateKey).split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (year !== selectedYear || month !== selectedMonth) {
      return;
    }

    const root = elements.attendancePanelBody;
    if (!root) {
      return;
    }

    const toggleButton = root.querySelector(
      `[data-attendance-action="toggle"][data-student-id="${studentId}"][data-date-key="${dateKey}"][data-period-id="${periodId}"]`,
    );
    if (toggleButton) {
      toggleButton.classList.add("is-checked");
      toggleButton.setAttribute("aria-pressed", "true");
      const icon = toggleButton.querySelector(".attendance-check-icon");
      if (icon) {
        icon.textContent = "✓";
      }
    }

    const currentUser = getCurrentUser?.() ?? null;
    const members = readAcademyMembers();
    const students = selectAcademyMembersForUser(members, currentUser, {
      role: "student",
      status: "active",
    });
    const periods = getActivePeriods(academyId);
    const today = getTodayParts();
    const isSelectedCurrentMonth =
      selectedYear === today.year && selectedMonth === today.month;
    const studentIds = students.map((student) => student.userId);
    const todayAttendanceCount = isSelectedCurrentMonth
      ? countTodayAttendance(
          academyId,
          monthKey,
          studentIds,
          periods.map((period) => period.id),
          today.dateKey,
        )
      : null;

    refreshAttendanceSummaries({
      academyId,
      monthKey,
      students,
      periods,
      todayAttendanceCount,
    });
  }

  function handleAttendancePanelClick(event) {
    const sectionButton = event.target.closest("[data-attendance-section]");
    if (sectionButton && elements.attendanceManagementSubmenu?.contains(sectionButton)) {
      showAttendanceSection(sectionButton.dataset.attendanceSection);
      return;
    }

    if (event.target.closest(".attendance-period-settings-button")) {
      event.preventDefault();
      event.stopPropagation();
    }

    const actionButton = event.target.closest("[data-attendance-action]");
    if (!actionButton || !isAttendanceInteractionTarget(actionButton)) {
      return;
    }

    const action = actionButton.dataset.attendanceAction;
    const currentUser = getCurrentUser?.() ?? null;
    const academyId = resolveAcademyScopeId(currentUser);

    if (action === "open-period-settings") {
      if (!academyId) {
        return;
      }
      openPeriodSettings(academyId);
      return;
    }

    if (action === "cancel-period-settings") {
      closePeriodSettings();
      return;
    }

    if (action === "add-period") {
      addPeriodDraft();
      return;
    }

    if (action === "deactivate-period") {
      deactivatePeriodDraft(actionButton.dataset.periodId);
      return;
    }

    if (action === "save-period-settings") {
      if (!academyId) {
        return;
      }
      void savePeriodSettings(academyId);
      return;
    }

    if (action === "prev-month") {
      shiftMonth(-1);
      return;
    }
    if (action === "next-month") {
      shiftMonth(1);
      return;
    }
    if (action === "today-month") {
      goToTodayMonth();
      return;
    }

    if (action === "copy-attendance-code") {
      const code = String(actionButton.dataset.attendanceCode ?? "").trim();
      if (!code) {
        return;
      }
      void navigator.clipboard?.writeText(code);
      return;
    }

    if (action === "copy-kiosk-connect-url") {
      const urlInput = elements.attendanceKioskBody?.querySelector("[data-attendance-kiosk-url]");
      const url = String(urlInput?.value ?? "").trim();
      if (!url) {
        return;
      }
      void navigator.clipboard?.writeText(url);
      return;
    }

    if (action === "open-kiosk-connect-url") {
      const urlInput = elements.attendanceKioskBody?.querySelector("[data-attendance-kiosk-url]");
      const url = String(urlInput?.value ?? "").trim();
      if (!url) {
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "bulk-generate-attendance-codes") {
      if (!academyId) {
        return;
      }

      const members = readAcademyMembers();
      const students = selectAcademyMembersForUser(members, currentUser, {
        role: "student",
        status: "active",
      }).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko"));
      bulkAssignMissingAttendanceCodes(
        academyId,
        students.map((student) => student.userId),
      );
      void renderAttendanceCodesPanel();
      return;
    }

    if (action === "toggle-payment-date") {
      if (!academyId) {
        return;
      }
      const studentId = actionButton.dataset.studentId;
      if (!studentId) {
        return;
      }
      const nextMeta = toggleStudentPaymentDate(academyId, studentId, getTodayDateKey());
      const label = getPaymentDisplayLabel(nextMeta.payment_date);
      actionButton.textContent = label;
      actionButton.classList.toggle("has-date", Boolean(nextMeta.payment_date));
      actionButton.classList.toggle("is-unconfirmed", !nextMeta.payment_date);
      actionButton.title = nextMeta.payment_date
        ? `${label} (클릭하여 미확인으로 변경)`
        : "클릭하여 오늘 날짜로 저장";
      actionButton.setAttribute(
        "aria-label",
        `${actionButton.getAttribute("aria-label")?.split(" 결제")[0] ?? "학생"} 결제 ${label}`,
      );
      return;
    }

    if (action !== "toggle") {
      return;
    }

    if (!academyId) {
      return;
    }

    const studentId = actionButton.dataset.studentId;
    const dateKey = actionButton.dataset.dateKey;
    const periodId = actionButton.dataset.periodId;
    if (!studentId || !dateKey || !periodId) {
      return;
    }

    const monthKey = buildMonthKey(selectedYear, selectedMonth);
    const checked = toggleAttendanceMark(academyId, monthKey, studentId, dateKey, periodId);
    actionButton.classList.toggle("is-checked", checked);
    actionButton.setAttribute("aria-pressed", checked ? "true" : "false");
    actionButton.querySelector(".attendance-check-icon").textContent = checked ? "✓" : "";

    const members = readAcademyMembers();
    const students = selectAcademyMembersForUser(members, currentUser, {
      role: "student",
      status: "active",
    });
    const periods = getActivePeriods(academyId);
    const today = getTodayParts();
    const isSelectedCurrentMonth =
      selectedYear === today.year && selectedMonth === today.month;
    const studentIds = students.map((student) => student.userId);
    const todayAttendanceCount = isSelectedCurrentMonth
      ? countTodayAttendance(
          academyId,
          monthKey,
          studentIds,
          periods.map((period) => period.id),
          today.dateKey,
        )
      : null;

    refreshAttendanceSummaries({
      academyId,
      monthKey,
      students,
      periods,
      todayAttendanceCount,
    });
  }

  function handleAttendancePanelInput(event) {
    const target = event.target;
    if (!isAttendanceInteractionTarget(target)) {
      return;
    }

    const field = target.dataset.periodField;
    const periodId = target.dataset.periodId;
    if (!field || !periodId || !periodSettingsDraft) {
      return;
    }

    if (field === "is_active") {
      updatePeriodDraftField(periodId, field, target.checked);
      if (!target.checked) {
        renderPeriodSettingsModal();
      }
      return;
    }

    updatePeriodDraftField(periodId, field, target.value);
  }

  function handleAttendancePanelBlur(event) {
    const target = event.target;
    if (!isAttendanceInteractionTarget(target)) {
      return;
    }

    const field = target.dataset.attendanceMetaField;
    const studentId = target.dataset.studentId;
    if (!field || !studentId) {
      return;
    }

    const currentUser = getCurrentUser?.() ?? null;
    const academyId = resolveAcademyScopeId(currentUser);
    if (!academyId) {
      return;
    }

    if (field === "lesson_count") {
      const nextMeta = saveStudentMeta(academyId, studentId, {
        lesson_count: target.value,
      });
      target.value =
        nextMeta.lesson_count === null || nextMeta.lesson_count === undefined
          ? ""
          : String(nextMeta.lesson_count);
      return;
    }

    if (field === "attendance_days") {
      const nextMeta = saveStudentMeta(academyId, studentId, {
        attendance_days: target.value,
      });
      target.value = nextMeta.attendance_days;
      target.title = nextMeta.attendance_days || "등원요일 입력";
    }
  }

  function bindAttendanceEvents() {
    if (!elements.attendancePanel || elements.attendancePanel.dataset.attendanceEventsBound === "true") {
      return;
    }

    elements.attendancePanel.dataset.attendanceEventsBound = "true";
    elements.attendancePanel.addEventListener("click", handleAttendancePanelClick);
    elements.attendancePanel.addEventListener("input", handleAttendancePanelInput);
    elements.attendancePanel.addEventListener("change", handleAttendancePanelInput);
    elements.attendancePanel.addEventListener("blur", handleAttendancePanelBlur, true);
  }

  function hideAttendancePanel() {
    attendanceCheckKiosk.stop();
    closePeriodSettings();
    elements.attendancePanel?.classList.add("is-hidden");
  }

  return {
    renderAttendancePanel,
    bindAttendanceEvents,
    hideAttendancePanel,
  };
}
