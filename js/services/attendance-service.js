const ATTENDANCE_STORAGE_KEY = "BADUK_ATTENDANCE";

/** @typedef {{ id: string, name: string, start_time: string, end_time: string, sort_order: number, is_active: boolean }} AttendancePeriod */

/** @typedef {{ lesson_count: number | null, attendance_days: string, payment_date: string | null }} AttendanceStudentMeta */

const DEFAULT_PERIODS = /** @type {AttendancePeriod[]} */ ([
  {
    id: "period-1",
    name: "1부",
    start_time: "14:00",
    end_time: "15:30",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "period-2",
    name: "2부",
    start_time: "15:45",
    end_time: "17:15",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "period-3",
    name: "3부",
    start_time: "17:30",
    end_time: "19:00",
    sort_order: 3,
    is_active: true,
  },
]);

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(store));
}

function ensureAcademyBucket(store, academyId) {
  if (!store[academyId]) {
    store[academyId] = {
      periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
      studentMeta: {},
      records: {},
    };
  }

  if (!Array.isArray(store[academyId].periods) || store[academyId].periods.length === 0) {
    store[academyId].periods = DEFAULT_PERIODS.map((period) => ({ ...period }));
  }

  if (!store[academyId].studentMeta || typeof store[academyId].studentMeta !== "object") {
    store[academyId].studentMeta = {};
  }

  if (!store[academyId].records || typeof store[academyId].records !== "object") {
    store[academyId].records = {};
  }

  ensureAttendanceCodesBucket(store[academyId]);

  return store[academyId];
}

export function buildMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey) {
  const [yearText, monthText] = String(monthKey ?? "").split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
  };
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function buildDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatAttendanceDateLabel(year, month, day) {
  const date = new Date(year, month - 1, day);
  const weekday = WEEKDAY_LABELS[date.getDay()] ?? "";
  return `${month}월 ${day}일 ${weekday}`;
}

export function formatMonthLabel(year, month) {
  return `${year}년 ${month}월`;
}

export function getActivePeriods(academyId) {
  return getAllPeriods(academyId).filter((period) => period.is_active !== false);
}

export function getAllPeriods(academyId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  return [...bucket.periods].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ko"),
  );
}

export function createPeriodId() {
  return `period-${Date.now()}`;
}

function normalizePeriodName(name) {
  const text = String(name ?? "").trim();
  return text || "신규 수업부";
}

export function normalizePeriodTime(value, fallback = "14:00") {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clonePeriod(period) {
  return {
    id: period.id,
    name: period.name,
    start_time: period.start_time,
    end_time: period.end_time,
    sort_order: period.sort_order,
    is_active: period.is_active !== false,
  };
}

/**
 * @param {string} academyId
 * @param {AttendancePeriod[]} drafts
 */
export function saveAcademyPeriods(academyId, drafts) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const existingById = new Map(bucket.periods.map((period) => [period.id, period]));

  const nextPeriods = drafts.map((draft, index) => {
    const id = String(draft.id ?? "").trim();
    if (!id) {
      throw new Error("수업부 id가 없습니다.");
    }

    const existing = existingById.get(id);
    if (existing) {
      return {
        id: existing.id,
        name: normalizePeriodName(draft.name),
        start_time: normalizePeriodTime(draft.start_time, existing.start_time),
        end_time: normalizePeriodTime(draft.end_time, existing.end_time),
        sort_order: index + 1,
        is_active: draft.is_active !== false,
      };
    }

    return {
      id,
      name: normalizePeriodName(draft.name),
      start_time: normalizePeriodTime(draft.start_time, "14:00"),
      end_time: normalizePeriodTime(draft.end_time, "15:00"),
      sort_order: index + 1,
      is_active: draft.is_active !== false,
    };
  });

  bucket.periods = nextPeriods;
  writeStore(store);
  return getAllPeriods(academyId);
}

export function createDefaultPeriodDraft(existingPeriods = []) {
  const maxSortOrder = existingPeriods.reduce(
    (max, period) => Math.max(max, Number(period.sort_order) || 0),
    0,
  );

  return {
    id: createPeriodId(),
    name: "신규 수업부",
    start_time: "14:00",
    end_time: "15:00",
    sort_order: maxSortOrder + 1,
    is_active: true,
  };
}

export function clonePeriodDrafts(periods) {
  return periods.map((period) => clonePeriod(period));
}

export function normalizePaymentDateKey(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const shortMatch = text.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (shortMatch) {
    const year = new Date().getFullYear();
    const month = String(shortMatch[1]).padStart(2, "0");
    const day = String(shortMatch[2]).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function normalizeLessonCount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeStudentMetaRaw(meta) {
  if (!meta || typeof meta !== "object") {
    return {
      lesson_count: null,
      attendance_days: "",
      payment_date: null,
    };
  }

  const lesson_count = normalizeLessonCount(
    meta.lesson_count ?? meta.monthlyFrequency ?? meta.lessonCount,
  );
  const attendance_days = String(meta.attendance_days ?? meta.attendanceDays ?? "").trim();
  const payment_date = normalizePaymentDateKey(meta.payment_date ?? meta.paymentDate);

  return {
    lesson_count,
    attendance_days,
    payment_date,
  };
}

export function formatPaymentDateShort(paymentDate) {
  const normalized = normalizePaymentDateKey(paymentDate);
  if (!normalized) {
    return "";
  }

  const [, monthText, dayText] = normalized.split("-");
  return `${Number(monthText)}.${Number(dayText)}`;
}

export function getTodayDateKey() {
  const today = new Date();
  return buildDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

export function getStudentMeta(academyId, studentId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  return normalizeStudentMetaRaw(bucket.studentMeta[studentId]);
}

/**
 * @param {string} academyId
 * @param {string} studentId
 * @param {{ lesson_count?: number | null, attendance_days?: string, payment_date?: string | null }} updates
 */
export function saveStudentMeta(academyId, studentId, updates) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const current = normalizeStudentMetaRaw(bucket.studentMeta[studentId]);

  const next = {
    lesson_count:
      updates.lesson_count !== undefined
        ? normalizeLessonCount(updates.lesson_count)
        : current.lesson_count,
    attendance_days:
      updates.attendance_days !== undefined
        ? String(updates.attendance_days ?? "").trim()
        : current.attendance_days,
    payment_date:
      updates.payment_date !== undefined
        ? normalizePaymentDateKey(updates.payment_date)
        : current.payment_date,
  };

  bucket.studentMeta[studentId] = next;
  writeStore(store);
  return next;
}

export function toggleStudentPaymentDate(academyId, studentId, todayDateKey = getTodayDateKey()) {
  const current = getStudentMeta(academyId, studentId);
  if (current.payment_date) {
    return saveStudentMeta(academyId, studentId, { payment_date: null });
  }

  return saveStudentMeta(academyId, studentId, { payment_date: todayDateKey });
}

export function isAttendanceMarked(academyId, monthKey, studentId, dateKey, periodId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const monthRecords = bucket.records[monthKey] ?? {};
  const recordKey = `${studentId}::${dateKey}::${periodId}`;
  return Boolean(monthRecords[recordKey]);
}

export function toggleAttendanceMark(academyId, monthKey, studentId, dateKey, periodId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);

  if (!bucket.records[monthKey]) {
    bucket.records[monthKey] = {};
  }

  const recordKey = `${studentId}::${dateKey}::${periodId}`;
  const nextValue = !bucket.records[monthKey][recordKey];

  if (nextValue) {
    bucket.records[monthKey][recordKey] = true;
  } else {
    delete bucket.records[monthKey][recordKey];
  }

  writeStore(store);
  return nextValue;
}

export function parseTimeToMinutes(timeValue) {
  const normalized = normalizePeriodTime(timeValue, "00:00");
  const [hoursText, minutesText] = normalized.split(":");
  return Number(hoursText) * 60 + Number(minutesText);
}

export function getClosestPeriodByTime(periods, referenceDate = new Date()) {
  const activePeriods = periods.filter((period) => period.is_active !== false);
  if (activePeriods.length === 0) {
    return null;
  }

  const currentMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  let closestPeriod = activePeriods[0];
  let smallestDistance = Infinity;

  activePeriods.forEach((period) => {
    const startMinutes = parseTimeToMinutes(period.start_time);
    const distance = Math.abs(currentMinutes - startMinutes);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestPeriod = period;
    }
  });

  return closestPeriod;
}

export function getClosestActivePeriod(academyId, referenceDate = new Date()) {
  return getClosestPeriodByTime(getActivePeriods(academyId), referenceDate);
}

export function getNextPeriodStartMinutes(periods, referenceDate = new Date()) {
  const activePeriods = periods.filter((period) => period.is_active !== false);
  if (activePeriods.length === 0) {
    return null;
  }

  const currentMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const upcomingStarts = activePeriods
    .map((period) => parseTimeToMinutes(period.start_time))
    .filter((startMinutes) => startMinutes > currentMinutes)
    .sort((a, b) => a - b);

  return upcomingStarts[0] ?? null;
}

/**
 * @returns {{ status: "saved" | "duplicate" | "invalid", monthKey?: string, dateKey?: string, periodId?: string }}
 */
export function saveAttendanceCheckIn(academyId, studentId, dateKey, periodId) {
  if (!academyId || !studentId || !dateKey || !periodId) {
    return { status: "invalid" };
  }

  const [yearText, monthText] = String(dateKey).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) {
    return { status: "invalid" };
  }

  const monthKey = buildMonthKey(year, month);
  if (isAttendanceMarked(academyId, monthKey, studentId, dateKey, periodId)) {
    return { status: "duplicate", monthKey, dateKey, periodId };
  }

  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  if (!bucket.records[monthKey]) {
    bucket.records[monthKey] = {};
  }

  const recordKey = `${studentId}::${dateKey}::${periodId}`;
  bucket.records[monthKey][recordKey] = true;
  writeStore(store);

  return { status: "saved", monthKey, dateKey, periodId };
}

export function countStudentMonthAttendance(academyId, monthKey, studentId, periodIds) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const monthRecords = bucket.records[monthKey] ?? {};
  const prefix = `${studentId}::`;

  return Object.keys(monthRecords).filter((key) => {
    if (!key.startsWith(prefix) || !monthRecords[key]) {
      return false;
    }
    const periodId = key.split("::")[2];
    return periodIds.includes(periodId);
  }).length;
}

export function countMonthAttendanceTotal(academyId, monthKey) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const monthRecords = bucket.records[monthKey] ?? {};
  return Object.values(monthRecords).filter(Boolean).length;
}

export function countTodayAttendance(academyId, monthKey, studentIds, periodIds, todayDateKey) {
  let count = 0;

  studentIds.forEach((studentId) => {
    const hasTodayMark = periodIds.some((periodId) =>
      isAttendanceMarked(academyId, monthKey, studentId, todayDateKey, periodId),
    );
    if (hasTodayMark) {
      count += 1;
    }
  });

  return count;
}

export function countAttendanceForDatePeriod(academyId, monthKey, dateKey, periodId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const monthRecords = bucket.records[monthKey] ?? {};
  const suffix = `::${dateKey}::${periodId}`;

  return Object.keys(monthRecords).filter((key) => key.endsWith(suffix) && monthRecords[key]).length;
}

/** @typedef {{ code: string, assigned_at?: string }} AttendanceCodeEntry */

const ATTENDANCE_CODE_MIN = 1001;
const ATTENDANCE_CODE_MAX = 9999;

function ensureAttendanceCodesBucket(bucket) {
  if (!bucket.attendanceCodes || typeof bucket.attendanceCodes !== "object") {
    bucket.attendanceCodes = {};
  }
  return bucket.attendanceCodes;
}

export function normalizeAttendanceCode(code) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return digits.padStart(4, "0").slice(-4);
}

export function getStudentAttendanceCode(academyId, studentId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const codes = ensureAttendanceCodesBucket(bucket);
  const entry = codes[studentId];
  if (!entry?.code) {
    return null;
  }
  return normalizeAttendanceCode(entry.code);
}

export const ATTENDANCE_CODE_MISSING_LABEL = "(----)";

export function formatAttendanceCodeQuickLabel(code) {
  const normalized = code ? normalizeAttendanceCode(code) : null;
  return normalized ?? ATTENDANCE_CODE_MISSING_LABEL;
}

export function formatStudentNameWithAttendanceCode(name, code) {
  const displayName = String(name ?? "이름 없음").trim() || "이름 없음";
  return `${displayName} (${formatAttendanceCodeQuickLabel(code)})`;
}

function getMaxAttendanceCodeNumber(codes) {
  let max = ATTENDANCE_CODE_MIN - 1;

  Object.values(codes).forEach((entry) => {
    const normalized = normalizeAttendanceCode(entry?.code);
    if (!normalized) {
      return;
    }

    const value = Number(normalized);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  });

  return max;
}

function getNextAttendanceCodeFromCodes(codes) {
  const next = getMaxAttendanceCodeNumber(codes) + 1;

  if (next < ATTENDANCE_CODE_MIN || next > ATTENDANCE_CODE_MAX) {
    return null;
  }

  return String(next).padStart(4, "0");
}

export function getNextAttendanceCode(academyId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const codes = ensureAttendanceCodesBucket(bucket);
  return getNextAttendanceCodeFromCodes(codes);
}

export function bulkAssignMissingAttendanceCodes(academyId, studentIds) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const codes = ensureAttendanceCodesBucket(bucket);
  const assignedAt = new Date().toISOString();
  const assigned = [];

  studentIds.forEach((studentId) => {
    const existingCode = normalizeAttendanceCode(codes[studentId]?.code);
    if (existingCode) {
      return;
    }

    const nextCode = getNextAttendanceCodeFromCodes(codes);
    if (!nextCode) {
      return;
    }

    codes[studentId] = /** @type {AttendanceCodeEntry} */ ({
      code: nextCode,
      assigned_at: assignedAt,
    });
    assigned.push({ studentId, code: nextCode });
  });

  if (assigned.length > 0) {
    writeStore(store);
  }

  return assigned;
}

export function assignAttendanceCode(academyId, studentId, code, options = {}) {
  const normalizedCode = normalizeAttendanceCode(code);
  if (!normalizedCode) {
    return null;
  }

  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const codes = ensureAttendanceCodesBucket(bucket);
  const entry = /** @type {AttendanceCodeEntry} */ ({
    code: normalizedCode,
    assigned_at: options.assignedAt ?? new Date().toISOString(),
  });
  codes[studentId] = entry;
  writeStore(store);
  return entry;
}

export function findStudentIdByAttendanceCode(academyId, code) {
  const normalizedCode = normalizeAttendanceCode(code);
  if (!normalizedCode) {
    return null;
  }

  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  const codes = ensureAttendanceCodesBucket(bucket);

  for (const [studentId, entry] of Object.entries(codes)) {
    if (normalizeAttendanceCode(entry?.code) === normalizedCode) {
      return studentId;
    }
  }

  return null;
}

export function getStudentLastAttendanceDate(academyId, studentId) {
  const store = readStore();
  const bucket = ensureAcademyBucket(store, academyId);
  let latest = null;

  Object.values(bucket.records).forEach((monthRecords) => {
    if (!monthRecords || typeof monthRecords !== "object") {
      return;
    }

    Object.entries(monthRecords).forEach(([key, marked]) => {
      if (!marked) {
        return;
      }

      const [recordStudentId, dateKey] = key.split("::");
      if (recordStudentId !== studentId || !dateKey) {
        return;
      }

      if (!latest || dateKey > latest) {
        latest = dateKey;
      }
    });
  });

  return latest;
}
