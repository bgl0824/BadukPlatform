import {
  formatGuardianPhoneDisplay,
  getStudentGuardianProfile,
} from "./student-guardian-profile-service.js";

const ATTENDANCE_SMS_LOGS_STORAGE_KEY = "BADUK_ATTENDANCE_SMS_LOGS";

export const SMS_LOG_STATUS = {
  pending: "pending",
  sent: "sent",
  failed: "failed",
};

export const SMS_LOG_TYPE = {
  attendanceCheckIn: "attendance_check_in",
};

/** @typedef {{
 *   id: string,
 *   academy_id: string,
 *   student_id: string,
 *   student_name: string,
 *   guardian_phone: string,
 *   type: string,
 *   message: string,
 *   status: string,
 *   created_at: string,
 *   attendance_time: string,
 *   date_key?: string,
 *   period_name?: string,
 * }} AttendanceSmsLog */

function readLogsStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTENDANCE_SMS_LOGS_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLogsStore(store) {
  localStorage.setItem(ATTENDANCE_SMS_LOGS_STORAGE_KEY, JSON.stringify(store));
}

function ensureAcademyLogs(store, academyId) {
  if (!Array.isArray(store[academyId])) {
    store[academyId] = [];
  }
  return store[academyId];
}

function createSmsLogId() {
  return `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatAttendanceSmsDateTimeLabel(attendanceTime) {
  const date = new Date(attendanceTime);
  if (Number.isNaN(date.getTime())) {
    return String(attendanceTime ?? "");
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}월 ${day}일 ${hours}:${minutes}`;
}

export function buildAttendanceCheckInSmsMessage({
  academyName,
  studentName,
  attendanceTime,
}) {
  const schoolName = String(academyName ?? "학원").trim() || "학원";
  const name = String(studentName ?? "학생").trim() || "학생";
  const dateTimeLabel = formatAttendanceSmsDateTimeLabel(attendanceTime);

  return `[${schoolName}]\n${name} 학생이\n${dateTimeLabel}에 학원에 도착했습니다.`;
}

export function getSmsLogStatusLabel(status) {
  if (status === SMS_LOG_STATUS.sent) {
    return "발송성공";
  }
  if (status === SMS_LOG_STATUS.failed) {
    return "발송실패";
  }
  return "발송대기";
}

export function listAttendanceSmsLogs(academyId, { limit = 200 } = {}) {
  if (!academyId) {
    return [];
  }

  const store = readLogsStore();
  const logs = ensureAcademyLogs(store, academyId);
  return [...logs]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit);
}

export function listPendingAttendanceSmsLogs(academyId) {
  return listAttendanceSmsLogs(academyId).filter(
    (log) => log.status === SMS_LOG_STATUS.pending,
  );
}

/**
 * @param {string} academyId
 * @param {string} logId
 * @param {"pending"|"sent"|"failed"} status
 */
export function updateAttendanceSmsLogStatus(academyId, logId, status) {
  if (!academyId || !logId) {
    return null;
  }

  const store = readLogsStore();
  const logs = ensureAcademyLogs(store, academyId);
  const index = logs.findIndex((log) => log.id === logId);
  if (index < 0) {
    return null;
  }

  logs[index] = {
    ...logs[index],
    status,
    updated_at: new Date().toISOString(),
  };
  writeLogsStore(store);
  return logs[index];
}

function appendAttendanceSmsLog(entry) {
  const store = readLogsStore();
  const logs = ensureAcademyLogs(store, entry.academy_id);
  logs.unshift(entry);
  writeLogsStore(store);
  return entry;
}

/**
 * 출석 저장 성공 후 호출. 조건 미충족 시 null 반환.
 */
export function queueAttendanceCheckInSmsLog({
  academyId,
  studentId,
  studentName,
  academyName = "",
  dateKey,
  periodName,
  attendanceTime = new Date().toISOString(),
}) {
  if (!academyId || !studentId || !dateKey) {
    return null;
  }

  const guardianProfile = getStudentGuardianProfile(academyId, studentId);
  if (!guardianProfile.guardian_phone) {
    return null;
  }

  if (!guardianProfile.attendance_notification_enabled) {
    return null;
  }

  const normalizedAttendanceTime = String(attendanceTime ?? "").trim() || new Date().toISOString();
  const message = buildAttendanceCheckInSmsMessage({
    academyName,
    studentName,
    attendanceTime: normalizedAttendanceTime,
  });

  return appendAttendanceSmsLog({
    id: createSmsLogId(),
    academy_id: academyId,
    student_id: studentId,
    student_name: String(studentName ?? "학생"),
    guardian_phone: guardianProfile.guardian_phone,
    type: SMS_LOG_TYPE.attendanceCheckIn,
    message,
    status: SMS_LOG_STATUS.pending,
    created_at: new Date().toISOString(),
    attendance_time: normalizedAttendanceTime,
    date_key: dateKey,
    period_name: String(periodName ?? ""),
  });
}

/**
 * 향후 알리고 API 연동 시 pending 로그를 순회하며 발송·상태 갱신.
 * @returns {Promise<{ processed: number, sent: number, failed: number }>}
 */
export async function processPendingAttendanceSmsLogs(academyId, _sendHandler) {
  const pendingLogs = listPendingAttendanceSmsLogs(academyId);
  if (pendingLogs.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const log of pendingLogs) {
    if (typeof _sendHandler !== "function") {
      break;
    }

    try {
      const result = await _sendHandler(log);
      if (result?.ok) {
        updateAttendanceSmsLogStatus(academyId, log.id, SMS_LOG_STATUS.sent);
        sent += 1;
      } else {
        updateAttendanceSmsLogStatus(academyId, log.id, SMS_LOG_STATUS.failed);
        failed += 1;
      }
    } catch {
      updateAttendanceSmsLogStatus(academyId, log.id, SMS_LOG_STATUS.failed);
      failed += 1;
    }
  }

  return { processed: sent + failed, sent, failed };
}
