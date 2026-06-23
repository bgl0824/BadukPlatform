const STUDENT_ACADEMY_PROFILES_STORAGE_KEY = "BADUK_STUDENT_ACADEMY_PROFILES";

/** @typedef {{ guardian_phone: string, attendance_notification_enabled: boolean, updated_at?: string }} StudentGuardianProfile */

function profileCacheKey(academyId, studentUserId) {
  return `${academyId}::${studentUserId}`;
}

function readProfilesStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STUDENT_ACADEMY_PROFILES_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProfilesStore(store) {
  localStorage.setItem(STUDENT_ACADEMY_PROFILES_STORAGE_KEY, JSON.stringify(store));
}

export function normalizeGuardianPhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatGuardianPhoneDisplay(value) {
  const digits = normalizeGuardianPhone(value);
  if (!digits) {
    return "";
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

export function validateGuardianPhone(value) {
  const digits = normalizeGuardianPhone(value);
  if (!digits) {
    return { ok: true, phone: "" };
  }

  if (!/^01[016789]\d{7,8}$/.test(digits)) {
    return {
      ok: false,
      message: "올바른 휴대폰 번호를 입력해 주세요. (예: 01012345678)",
    };
  }

  return { ok: true, phone: digits };
}

function normalizeGuardianProfile(raw) {
  const phoneValidation = validateGuardianPhone(raw?.guardian_phone ?? raw?.guardianPhone ?? "");
  const guardian_phone = phoneValidation.ok ? phoneValidation.phone : "";

  return {
    guardian_phone,
    attendance_notification_enabled:
      raw?.attendance_notification_enabled !== false &&
      raw?.attendanceNotificationEnabled !== false,
    updated_at: raw?.updated_at ? String(raw.updated_at) : undefined,
  };
}

export function getDefaultStudentGuardianProfile() {
  return {
    guardian_phone: "",
    attendance_notification_enabled: true,
  };
}

export function getStudentGuardianProfile(academyId, studentUserId) {
  if (!academyId || !studentUserId) {
    return getDefaultStudentGuardianProfile();
  }

  const store = readProfilesStore();
  const entry = store[profileCacheKey(academyId, studentUserId)];
  if (!entry) {
    return getDefaultStudentGuardianProfile();
  }

  return normalizeGuardianProfile(entry);
}

/**
 * @param {string} academyId
 * @param {string} studentUserId
 * @param {{ guardian_phone?: string, attendance_notification_enabled?: boolean }} input
 */
export function saveStudentGuardianProfile(academyId, studentUserId, input) {
  if (!academyId || !studentUserId) {
    return { ok: false, message: "학생 또는 학원 정보를 확인할 수 없습니다." };
  }

  const phoneValidation = validateGuardianPhone(input?.guardian_phone ?? "");
  if (!phoneValidation.ok) {
    return phoneValidation;
  }

  const current = getStudentGuardianProfile(academyId, studentUserId);
  const next = {
    guardian_phone: phoneValidation.phone,
    attendance_notification_enabled:
      input?.attendance_notification_enabled !== undefined
        ? Boolean(input.attendance_notification_enabled)
        : current.attendance_notification_enabled,
    updated_at: new Date().toISOString(),
  };

  const store = readProfilesStore();
  store[profileCacheKey(academyId, studentUserId)] = next;
  writeProfilesStore(store);

  return { ok: true, profile: next };
}
