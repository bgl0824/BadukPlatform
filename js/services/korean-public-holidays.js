import { buildDateKey } from "./attendance-service.js";

/**
 * 한국 공휴일 정적 데이터.
 * 키: YYYY-MM-DD (buildDateKey 형식)
 * 값: { name: 표시명, kind?: 분류 }
 *
 * 연도별로 항목을 추가·갱신합니다. API 연동은 하지 않습니다.
 */
export const KOREAN_PUBLIC_HOLIDAYS = {
  "2026-01-01": { name: "신정", kind: "fixed" },
  "2026-02-16": { name: "설날", kind: "lunar" },
  "2026-02-17": { name: "설날", kind: "lunar" },
  "2026-02-18": { name: "설날", kind: "lunar" },
  "2026-03-01": { name: "삼일절", kind: "fixed" },
  "2026-05-05": { name: "어린이날", kind: "fixed" },
  "2026-05-24": { name: "부처님오신날", kind: "lunar" },
  "2026-06-06": { name: "현충일", kind: "fixed" },
  "2026-08-15": { name: "광복절", kind: "fixed" },
  "2026-09-24": { name: "추석", kind: "lunar" },
  "2026-09-25": { name: "추석", kind: "lunar" },
  "2026-09-26": { name: "추석", kind: "lunar" },
  "2026-10-03": { name: "개천절", kind: "fixed" },
  "2026-10-09": { name: "한글날", kind: "fixed" },
  "2026-12-25": { name: "성탄절", kind: "fixed" },
};

export const ATTENDANCE_DAY_TONES = {
  weekday: "weekday",
  saturday: "saturday",
  sunday: "sunday",
  holiday: "holiday",
};

export function getKoreanPublicHoliday(dateKey) {
  return KOREAN_PUBLIC_HOLIDAYS[dateKey] ?? null;
}

export function resolveAttendanceDayTone(year, month, day) {
  const dateKey = buildDateKey(year, month, day);
  if (getKoreanPublicHoliday(dateKey)) {
    return ATTENDANCE_DAY_TONES.holiday;
  }

  const dayOfWeek = new Date(year, month - 1, day).getDay();
  if (dayOfWeek === 0) {
    return ATTENDANCE_DAY_TONES.sunday;
  }
  if (dayOfWeek === 6) {
    return ATTENDANCE_DAY_TONES.saturday;
  }

  return ATTENDANCE_DAY_TONES.weekday;
}

export function getAttendanceDayToneClass(tone) {
  if (tone === ATTENDANCE_DAY_TONES.saturday) {
    return "is-saturday";
  }
  if (tone === ATTENDANCE_DAY_TONES.sunday || tone === ATTENDANCE_DAY_TONES.holiday) {
    return "is-sunday-like";
  }
  return "";
}
