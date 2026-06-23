import {
  findStudentIdByAttendanceCode,
  formatPaymentDateShort,
  getActivePeriods,
  getClosestPeriodByTime,
  getNextPeriodStartMinutes,
  getTodayDateKey,
  saveAttendanceCheckIn,
} from "../services/attendance-service.js";
import { queueAttendanceCheckInSmsLog } from "../services/attendance-sms-log-service.js";
import {
  readAcademyMembers,
  refreshAcademyMembersCache,
  resolveMemberAcademyId,
} from "../services/academy-service.js";

export const CHECK_PERIOD_AUTO_REFRESH_MS = 60_000;
export const CHECK_RESULT_RESET_MS = 2_000;

function formatCurrentClockLabel(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function createAttendanceCheckKiosk({
  mount,
  getAcademyContext,
  getCurrentUser,
  escapeHtml,
  isActive = () => true,
  onAttendanceSaved,
  features = {},
}) {
  const {
    showHeader = true,
    showCurrentTime = false,
    showAcademyBanner = false,
    showKioskOpenLink = false,
    kioskOpenHref = "./attendance-check",
    largeLayout = false,
  } = features;

  let selectedCheckPeriodId = null;
  let checkPeriodAutoEnabled = true;
  let checkPeriodAutoResumeAtMinutes = null;
  let checkPeriodAutoIntervalId = null;
  let resultResetTimeoutId = null;
  let eventsBound = false;
  let boundSubmitHandler = null;

  function resolveAcademyContext() {
    return getAcademyContext?.() ?? null;
  }

  function resolveAcademyId() {
    return resolveAcademyContext()?.academyId ?? "";
  }

  function findStudentNameInAcademy(academyId, studentUserId) {
    const student = readAcademyMembers().find((member) => {
      if (String(member.userId) !== String(studentUserId)) {
        return false;
      }

      const memberAcademyId = resolveMemberAcademyId(member, member.userId);
      return memberAcademyId === academyId;
    });

    return String(student?.name ?? "학생");
  }

  function resetCheckPeriodAutoState() {
    checkPeriodAutoEnabled = true;
    checkPeriodAutoResumeAtMinutes = null;
  }

  function updateCheckPeriodButtonStates(periodId) {
    mount
      ?.querySelectorAll('[data-attendance-action="select-check-period"]')
      .forEach((button) => {
        const isSelected = button.dataset.periodId === periodId;
        button.classList.toggle("is-active", isSelected);
        button.setAttribute("aria-pressed", isSelected ? "true" : "false");
      });
  }

  function updateCurrentTimeDisplay() {
    const timeNode = mount?.querySelector("[data-attendance-check-clock]");
    if (!timeNode) {
      return;
    }
    timeNode.textContent = formatCurrentClockLabel();
  }

  function syncCheckPeriodAutoSelection() {
    if (!isActive()) {
      return;
    }

    const academyId = resolveAcademyId();
    if (!academyId) {
      return;
    }

    const periods = getActivePeriods(academyId);
    if (periods.length === 0) {
      return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (!checkPeriodAutoEnabled) {
      if (
        checkPeriodAutoResumeAtMinutes !== null &&
        currentMinutes >= checkPeriodAutoResumeAtMinutes
      ) {
        checkPeriodAutoEnabled = true;
        checkPeriodAutoResumeAtMinutes = null;
      } else {
        return;
      }
    }

    const closestPeriod = getClosestPeriodByTime(periods, now);
    const nextPeriodId = closestPeriod?.id ?? periods[0]?.id ?? null;
    if (!nextPeriodId || nextPeriodId === selectedCheckPeriodId) {
      return;
    }

    selectedCheckPeriodId = nextPeriodId;
    updateCheckPeriodButtonStates(nextPeriodId);
    updateSelectedPeriodSummary(periods, nextPeriodId);
  }

  function updateSelectedPeriodSummary(periods, periodId) {
    const summaryNode = mount?.querySelector("[data-attendance-check-period-summary]");
    if (!summaryNode) {
      return;
    }

    const period = periods.find((item) => item.id === periodId);
    summaryNode.textContent = period?.name ?? "—";
  }

  function buildCheckPeriodSelectorMarkup(periods, selectedPeriodId) {
    if (periods.length === 0) {
      return `
        <p class="attendance-check-period-empty">활성 수업부가 없습니다. 월간 출석부에서 수업부를 설정해 주세요.</p>
      `;
    }

    const options = periods
      .map((period) => {
        const isSelected = period.id === selectedPeriodId;
        return `
          <button
            type="button"
            class="attendance-check-period-button${isSelected ? " is-active" : ""}"
            data-attendance-action="select-check-period"
            data-period-id="${escapeHtml(period.id)}"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <span class="attendance-check-period-name">${escapeHtml(period.name)}</span>
            <span class="attendance-check-period-time">${escapeHtml(period.start_time)}~${escapeHtml(period.end_time)}</span>
          </button>
        `;
      })
      .join("");

    return `
      <div class="attendance-check-period-section">
        <p class="attendance-check-period-label">현재 수업부</p>
        <div class="attendance-check-period-options" role="group" aria-label="수업부 선택">
          ${options}
        </div>
      </div>
    `;
  }

  function clearResultResetTimeout() {
    if (resultResetTimeoutId !== null) {
      window.clearTimeout(resultResetTimeoutId);
      resultResetTimeoutId = null;
    }
  }

  function scheduleInputReset() {
    clearResultResetTimeout();
    resultResetTimeoutId = window.setTimeout(() => {
      resultResetTimeoutId = null;
      const input = mount?.querySelector("[data-attendance-check-input]");
      const resultNode = mount?.querySelector("[data-attendance-check-result]");
      if (input) {
        input.value = "";
      }
      resultNode?.classList.add("is-hidden");
      input?.focus();
    }, CHECK_RESULT_RESET_MS);
  }

  function showAttendanceCheckResult({ status, studentName = "", periodName = "" }) {
    const resultNode = mount?.querySelector("[data-attendance-check-result]");
    if (!resultNode) {
      return;
    }

    resultNode.classList.remove("is-hidden", "is-success", "is-error", "is-duplicate");

    if (status === "invalid-code") {
      resultNode.classList.add("is-error");
      resultNode.textContent = "등록되지 않은 출결코드입니다.";
      scheduleInputReset();
      return;
    }

    if (status === "duplicate") {
      resultNode.classList.add("is-duplicate");
      resultNode.innerHTML = `
        <p class="attendance-check-result-name">${escapeHtml(studentName)}</p>
        <p class="attendance-check-result-message">이미 출석 처리되었습니다.</p>
      `;
      scheduleInputReset();
      return;
    }

    if (status === "saved") {
      resultNode.classList.add("is-success");
      resultNode.innerHTML = `
        <p class="attendance-check-result-name">${escapeHtml(studentName)}</p>
        <p class="attendance-check-result-message">${escapeHtml(periodName)} 출석 처리되었습니다.</p>
      `;
      scheduleInputReset();
      return;
    }

    resultNode.classList.add("is-error");
    resultNode.textContent = "출석 처리에 실패했습니다. 다시 시도해 주세요.";
    scheduleInputReset();
  }

  function handleSubmit(event) {
    event.preventDefault();

    const input = mount?.querySelector("[data-attendance-check-input]");
    const academyId = resolveAcademyId();
    const code = String(input?.value ?? "").replace(/\D/g, "").slice(0, 4);
    const periodId = selectedCheckPeriodId;
    const dateKey = getTodayDateKey();

    if (!academyId || !periodId || code.length !== 4) {
      showAttendanceCheckResult({ status: "error" });
      return;
    }

    const studentId = findStudentIdByAttendanceCode(academyId, code);
    if (!studentId) {
      showAttendanceCheckResult({ status: "invalid-code" });
      return;
    }

    const studentName = findStudentNameInAcademy(academyId, studentId);
    const periods = getActivePeriods(academyId);
    const period = periods.find((item) => item.id === periodId);
    const periodName = String(period?.name ?? "수업부");

    const result = saveAttendanceCheckIn(academyId, studentId, dateKey, periodId);

    if (result.status === "duplicate") {
      showAttendanceCheckResult({
        status: "duplicate",
        studentName,
        periodName,
      });
      return;
    }

    if (result.status !== "saved") {
      showAttendanceCheckResult({ status: "error" });
      return;
    }

    showAttendanceCheckResult({
      status: "saved",
      studentName,
      periodName,
    });

    const academyContext = getAcademyContext?.() ?? null;
    const attendanceTime = new Date().toISOString();
    queueAttendanceCheckInSmsLog({
      academyId,
      studentId,
      studentName,
      academyName: String(academyContext?.academyName ?? "").trim(),
      dateKey,
      periodName,
      attendanceTime,
    });

    onAttendanceSaved?.({
      academyId,
      studentId,
      dateKey,
      periodId,
      monthKey: result.monthKey,
    });
  }

  function handleClick(event) {
    const actionButton = event.target.closest("[data-attendance-action]");
    if (!actionButton || !mount?.contains(actionButton)) {
      return;
    }

    const action = actionButton.dataset.attendanceAction;
    if (action === "select-check-period") {
      const periodId = actionButton.dataset.periodId;
      if (!periodId) {
        return;
      }

      selectedCheckPeriodId = periodId;
      checkPeriodAutoEnabled = false;

      const academyId = resolveAcademyId();
      const periods = academyId ? getActivePeriods(academyId) : [];
      checkPeriodAutoResumeAtMinutes = getNextPeriodStartMinutes(periods);

      updateCheckPeriodButtonStates(periodId);
      updateSelectedPeriodSummary(periods, periodId);
      return;
    }

    if (action === "open-kiosk-page") {
      window.open(kioskOpenHref, "_blank", "noopener,noreferrer");
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!target.matches("[data-attendance-check-input]")) {
      return;
    }

    const digitsOnly = String(target.value ?? "").replace(/\D/g, "").slice(0, 4);
    if (target.value !== digitsOnly) {
      target.value = digitsOnly;
    }
  }

  function bindEvents() {
    if (!mount || eventsBound) {
      return;
    }

    mount.addEventListener("click", handleClick);
    boundSubmitHandler = (event) => {
      if (event.target.matches("[data-attendance-check-form]")) {
        handleSubmit(event);
      }
    };
    mount.addEventListener("submit", boundSubmitHandler);
    mount.addEventListener("input", handleInput);
    eventsBound = true;
  }

  function unbindEvents() {
    if (!mount || !eventsBound) {
      return;
    }

    mount.removeEventListener("click", handleClick);
    if (boundSubmitHandler) {
      mount.removeEventListener("submit", boundSubmitHandler);
      boundSubmitHandler = null;
    }
    mount.removeEventListener("input", handleInput);
    eventsBound = false;
  }

  function start({ resetAuto = false } = {}) {
    if (resetAuto) {
      resetCheckPeriodAutoState();
    }

    bindEvents();
    stopTimers();
    syncCheckPeriodAutoSelection();
    updateCurrentTimeDisplay();

    checkPeriodAutoIntervalId = window.setInterval(() => {
      syncCheckPeriodAutoSelection();
      updateCurrentTimeDisplay();
    }, CHECK_PERIOD_AUTO_REFRESH_MS);

    mount?.querySelector("[data-attendance-check-input]")?.focus();
  }

  function stopTimers() {
    if (checkPeriodAutoIntervalId !== null) {
      window.clearInterval(checkPeriodAutoIntervalId);
      checkPeriodAutoIntervalId = null;
    }

    clearResultResetTimeout();
  }

  function stop() {
    stopTimers();
  }

  function destroy() {
    stop();
    unbindEvents();
    if (mount) {
      mount.innerHTML = "";
    }
  }

  function render() {
    if (!mount) {
      return;
    }

    const academyContext = resolveAcademyContext();
    const academyId = academyContext?.academyId ?? "";
    const periods = academyId ? getActivePeriods(academyId) : [];

    if (
      checkPeriodAutoEnabled ||
      !periods.some((period) => period.id === selectedCheckPeriodId)
    ) {
      selectedCheckPeriodId = getClosestPeriodByTime(periods)?.id ?? periods[0]?.id ?? null;
    }

    const selectedPeriod = periods.find((period) => period.id === selectedCheckPeriodId);
    const layoutClass = largeLayout ? " attendance-check-kiosk--standalone" : "";
    const academyBannerMarkup =
      showAcademyBanner && academyContext
        ? `
          <header class="attendance-kiosk-academy-banner" aria-label="연결된 학원">
            <p class="attendance-kiosk-academy-name">${escapeHtml(academyContext.academyName || "연결된 학원")}</p>
            <p class="attendance-kiosk-academy-eyebrow">출결 체크</p>
          </header>
        `
        : "";
    const headerMarkup = showHeader
      ? `
        <header class="attendance-check-header">
          <h4>출결 체크</h4>
          <p>수업부를 확인한 뒤 출결코드를 입력해 주세요.</p>
          ${
            showKioskOpenLink
              ? `
                <button
                  type="button"
                  class="secondary-button attendance-check-open-kiosk-button"
                  data-attendance-action="open-kiosk-page"
                >
                  공용폰 화면 열기
                </button>
              `
              : ""
          }
        </header>
      `
      : "";

    const currentTimeMarkup = showCurrentTime
      ? `
        <section class="attendance-check-clock-section" aria-label="현재 시간">
          <p class="attendance-check-clock-label">현재 시간</p>
          <p class="attendance-check-clock-value" data-attendance-check-clock>${escapeHtml(formatCurrentClockLabel())}</p>
        </section>
      `
      : "";

    const periodSummaryMarkup = largeLayout
      ? `
        <section class="attendance-check-period-summary-section" aria-live="polite">
          <p class="attendance-check-period-summary-label">현재 수업부</p>
          <p class="attendance-check-period-summary-value" data-attendance-check-period-summary>${escapeHtml(selectedPeriod?.name ?? "—")}</p>
        </section>
      `
      : buildCheckPeriodSelectorMarkup(periods, selectedCheckPeriodId);

    mount.innerHTML = `
      <div class="attendance-check-kiosk${layoutClass}">
        ${academyBannerMarkup}
        ${headerMarkup}
        ${currentTimeMarkup}
        ${periodSummaryMarkup}
        ${
          largeLayout
            ? buildCheckPeriodSelectorMarkup(periods, selectedCheckPeriodId)
            : ""
        }
        <form class="attendance-check-form" data-attendance-check-form>
          <label class="attendance-check-label" for="attendance-check-code-input">출결코드</label>
          <input
            id="attendance-check-code-input"
            class="attendance-check-input"
            type="text"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]*"
            placeholder="0000"
            autocomplete="off"
            data-attendance-check-input
            ${periods.length === 0 ? "disabled" : ""}
          />
          <button
            type="submit"
            class="primary-button attendance-check-submit"
            data-attendance-action="submit-attendance-check"
            ${periods.length === 0 ? "disabled" : ""}
          >
            출석 확인
          </button>
        </form>
        <div class="attendance-check-result is-hidden" data-attendance-check-result aria-live="polite"></div>
      </div>
    `;

    updateSubmitButtonState();
  }

  function updateSubmitButtonState() {
    const input = mount?.querySelector("[data-attendance-check-input]");
    const submitButton = mount?.querySelector('[data-attendance-action="submit-attendance-check"]');
    if (!input || !submitButton) {
      return;
    }

    const syncDisabled = () => {
      submitButton.disabled = input.disabled || String(input.value ?? "").length !== 4;
    };

    syncDisabled();
    input.addEventListener("input", syncDisabled);
  }

  async function prepare({ refreshMembers = false } = {}) {
    const academyId = resolveAcademyId();
    const currentUser = getCurrentUser?.() ?? null;
    if (refreshMembers && academyId && currentUser) {
      await refreshAcademyMembersCache(academyId, { user: currentUser });
    }
  }

  return {
    render,
    start,
    stop,
    destroy,
    prepare,
    resetCheckPeriodAutoState,
  };
}
