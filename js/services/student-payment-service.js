/**
 * 학생 결제·수강료 V1 (원장 전용)
 *
 * - 청구월은 "YYYY-MM"으로만 저장 (표시 문자열 저장 금지)
 * - 상태: unpaid | requested | paid
 * - paid는 PG Webhook 반영용 API만 제공 (수동 완료 버튼 없음)
 */

const STUDENT_PAYMENTS_STORAGE_KEY = "BADUK_STUDENT_PAYMENTS";

export const PAYMENT_STATUS = {
  unpaid: "unpaid",
  requested: "requested",
  paid: "paid",
};

const PAYMENT_STATUS_LABELS = {
  unpaid: "미결제",
  requested: "요청완료",
  paid: "결제완료",
};

/** @typedef {"unpaid" | "requested" | "paid"} PaymentStatus */

/**
 * @typedef {{
 *   monthly_fee: number | null,
 *   billing_day: number | null,
 *   updated_at?: string,
 * }} StudentPaymentSettings
 */

/**
 * @typedef {{
 *   status: PaymentStatus,
 *   amount: number | null,
 *   created_at: string,
 *   updated_at: string,
 *   paid_at: string | null,
 *   payment_provider_ref: string | null,
 * }} StudentPaymentInvoice
 */

/**
 * @typedef {{
 *   settings: StudentPaymentSettings,
 *   invoices: Record<string, StudentPaymentInvoice>,
 * }} StudentPaymentBucket
 */

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STUDENT_PAYMENTS_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STUDENT_PAYMENTS_STORAGE_KEY, JSON.stringify(store));
}

function ensureAcademyBucket(store, academyId) {
  const key = String(academyId ?? "").trim();
  if (!store[key] || typeof store[key] !== "object") {
    store[key] = {};
  }
  return store[key];
}

function ensureStudentBucket(academyBucket, studentId) {
  const key = String(studentId ?? "").trim();
  if (!academyBucket[key] || typeof academyBucket[key] !== "object") {
    academyBucket[key] = {
      settings: {
        monthly_fee: null,
        billing_day: null,
      },
      invoices: {},
    };
  }

  const bucket = academyBucket[key];
  if (!bucket.settings || typeof bucket.settings !== "object") {
    bucket.settings = { monthly_fee: null, billing_day: null };
  }
  if (!bucket.invoices || typeof bucket.invoices !== "object") {
    bucket.invoices = {};
  }
  return /** @type {StudentPaymentBucket} */ (bucket);
}

export function buildBillingMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseBillingMonthKey(billingMonth) {
  const match = String(billingMonth ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function shiftBillingMonth(billingMonth, deltaMonths) {
  const parsed = parseBillingMonthKey(billingMonth);
  if (!parsed) {
    return null;
  }
  const date = new Date(parsed.year, parsed.month - 1 + deltaMonths, 1);
  return buildBillingMonthKey(date.getFullYear(), date.getMonth() + 1);
}

/** 화면용: 2026-07 → "7월 학원비" */
export function formatTuitionMonthLabel(billingMonth) {
  const parsed = parseBillingMonthKey(billingMonth);
  if (!parsed) {
    return "학원비";
  }
  return `${parsed.month}월 학원비`;
}

/** 이력용: 2026-07 → "2026.07" */
export function formatBillingMonthHistoryLabel(billingMonth) {
  const parsed = parseBillingMonthKey(billingMonth);
  if (!parsed) {
    return String(billingMonth ?? "");
  }
  return `${parsed.year}.${String(parsed.month).padStart(2, "0")}`;
}

export function formatMonthlyFeeLabel(amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "미설정";
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    return "미설정";
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatBillingDayLabel(billingDay) {
  const day = normalizeBillingDay(billingDay);
  if (!day) {
    return "미설정";
  }
  return `매월 ${day}일`;
}

/** 카드용 결제완료일: MM.DD (연도 없음). 이력에서는 ISO/연도 유지 */
export function formatPaidAtShortLabel(paidAt) {
  if (!paidAt) {
    return "";
  }

  const parsed = new Date(paidAt);
  if (Number.isNaN(parsed.getTime())) {
    const match = String(paidAt).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return "";
    }
    return `${match[2]}.${match[3]}`;
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

export function getPaymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[normalizePaymentStatus(status)] ?? PAYMENT_STATUS_LABELS.unpaid;
}

export function normalizePaymentStatus(status) {
  const value = String(status ?? "").trim();
  if (value === PAYMENT_STATUS.requested || value === PAYMENT_STATUS.paid) {
    return value;
  }
  return PAYMENT_STATUS.unpaid;
}

export function normalizeBillingDay(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return null;
  }
  return day;
}

export function normalizeMonthlyFee(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const amount = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount);
}

/**
 * 청구일 기준 현재 활성 청구월.
 * 청구일 당일부터 다음 달 청구가 활성화됩니다.
 * 예) 청구일 25일, 7/25 → 2026-08 / 7/24 → 2026-07
 */
export function resolveActiveBillingMonth(referenceDate = new Date(), billingDay = null) {
  const date = referenceDate instanceof Date ? referenceDate : new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const normalizedDay = normalizeBillingDay(billingDay);

  if (!normalizedDay) {
    return buildBillingMonthKey(year, month);
  }

  if (day >= normalizedDay) {
    return shiftBillingMonth(buildBillingMonthKey(year, month), 1);
  }

  return buildBillingMonthKey(year, month);
}

export function getStudentPaymentSettings(academyId, studentId) {
  const store = readStore();
  const academyBucket = ensureAcademyBucket(store, academyId);
  const studentBucket = ensureStudentBucket(academyBucket, studentId);
  return {
    monthly_fee: normalizeMonthlyFee(studentBucket.settings.monthly_fee),
    billing_day: normalizeBillingDay(studentBucket.settings.billing_day),
    updated_at: studentBucket.settings.updated_at,
  };
}

export function saveStudentPaymentSettings(academyId, studentId, draft = {}) {
  const scopeId = String(academyId ?? "").trim();
  const userId = String(studentId ?? "").trim();
  if (!scopeId || !userId) {
    return { ok: false, message: "학원 또는 학생 정보가 없습니다." };
  }

  const monthlyFee = normalizeMonthlyFee(draft.monthly_fee);
  const billingDay = normalizeBillingDay(draft.billing_day);

  if (draft.billing_day !== null && draft.billing_day !== undefined && draft.billing_day !== "" && !billingDay) {
    return { ok: false, message: "청구일은 1~28일 사이 숫자로 입력해 주세요." };
  }

  if (draft.monthly_fee !== null && draft.monthly_fee !== undefined && draft.monthly_fee !== "" && monthlyFee === null) {
    return { ok: false, message: "월 수강료를 올바르게 입력해 주세요." };
  }

  const store = readStore();
  const academyBucket = ensureAcademyBucket(store, scopeId);
  const studentBucket = ensureStudentBucket(academyBucket, userId);
  const now = new Date().toISOString();

  studentBucket.settings = {
    monthly_fee: monthlyFee,
    billing_day: billingDay,
    updated_at: now,
  };

  writeStore(store);
  ensureStudentCurrentInvoice(scopeId, userId);

  return {
    ok: true,
    settings: getStudentPaymentSettings(scopeId, userId),
  };
}

export function getStudentPaymentInvoice(academyId, studentId, billingMonth) {
  const store = readStore();
  const academyBucket = ensureAcademyBucket(store, academyId);
  const studentBucket = ensureStudentBucket(academyBucket, studentId);
  const monthKey = String(billingMonth ?? "").trim();
  const invoice = studentBucket.invoices[monthKey];
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  return {
    billingMonth: monthKey,
    status: normalizePaymentStatus(invoice.status),
    amount: normalizeMonthlyFee(invoice.amount),
    created_at: invoice.created_at ?? null,
    updated_at: invoice.updated_at ?? null,
    paid_at: invoice.paid_at ?? null,
    payment_provider_ref: invoice.payment_provider_ref ?? null,
  };
}

function writeInvoice(academyId, studentId, billingMonth, invoice) {
  const store = readStore();
  const academyBucket = ensureAcademyBucket(store, academyId);
  const studentBucket = ensureStudentBucket(academyBucket, studentId);
  studentBucket.invoices[billingMonth] = invoice;
  writeStore(store);
  return getStudentPaymentInvoice(academyId, studentId, billingMonth);
}

/**
 * 활성 청구월 청구가 없으면 미결제로 자동 생성합니다.
 * (청구일 도래 시 다음 달 청구가 생기는 구조)
 */
export function ensureStudentCurrentInvoice(academyId, studentId, referenceDate = new Date()) {
  const settings = getStudentPaymentSettings(academyId, studentId);
  const billingMonth = resolveActiveBillingMonth(referenceDate, settings.billing_day);
  const existing = getStudentPaymentInvoice(academyId, studentId, billingMonth);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  return writeInvoice(academyId, studentId, billingMonth, {
    status: PAYMENT_STATUS.unpaid,
    amount: settings.monthly_fee,
    created_at: now,
    updated_at: now,
    paid_at: null,
    payment_provider_ref: null,
  });
}

/** 결제 요청 / 다시보내기 — 상태를 requested로 두고 이후 SMS·결제링크 연동 */
export function markInvoiceRequested(academyId, studentId, billingMonth) {
  const invoice = getStudentPaymentInvoice(academyId, studentId, billingMonth);
  if (!invoice) {
    return { ok: false, message: "청구 내역이 없습니다." };
  }
  if (invoice.status === PAYMENT_STATUS.paid) {
    return { ok: false, message: "이미 결제 완료된 청구입니다." };
  }

  const now = new Date().toISOString();
  writeInvoice(academyId, studentId, billingMonth, {
    status: PAYMENT_STATUS.requested,
    amount: invoice.amount,
    created_at: invoice.created_at ?? now,
    updated_at: now,
    paid_at: null,
    payment_provider_ref: invoice.payment_provider_ref,
  });

  return {
    ok: true,
    resent: invoice.status === PAYMENT_STATUS.requested,
    invoice: getStudentPaymentInvoice(academyId, studentId, billingMonth),
  };
}

/**
 * PG Webhook 등으로 결제 완료를 반영합니다.
 * 원장 UI에서 수동 "결제 완료" 버튼을 두지 않는 대신 이 API를 사용합니다.
 *
 * @param {string} academyId
 * @param {string} studentId
 * @param {string} billingMonth YYYY-MM
 * @param {{ paid_at?: string, payment_provider_ref?: string, amount?: number }} [payload]
 */
export function applyPaymentWebhookUpdate(academyId, studentId, billingMonth, payload = {}) {
  const monthKey = String(billingMonth ?? "").trim();
  if (!parseBillingMonthKey(monthKey)) {
    return { ok: false, message: "청구월 형식이 올바르지 않습니다." };
  }

  const settings = getStudentPaymentSettings(academyId, studentId);
  const existing = getStudentPaymentInvoice(academyId, studentId, monthKey);
  const now = new Date().toISOString();
  const paidAt = payload.paid_at ? String(payload.paid_at) : now;

  writeInvoice(academyId, studentId, monthKey, {
    status: PAYMENT_STATUS.paid,
    amount:
      normalizeMonthlyFee(payload.amount) ??
      existing?.amount ??
      settings.monthly_fee,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    paid_at: paidAt,
    payment_provider_ref: payload.payment_provider_ref
      ? String(payload.payment_provider_ref)
      : existing?.payment_provider_ref ?? null,
  });

  return { ok: true, invoice: getStudentPaymentInvoice(academyId, studentId, monthKey) };
}

export function listStudentPaymentInvoices(academyId, studentId) {
  ensureStudentCurrentInvoice(academyId, studentId);
  const store = readStore();
  const academyBucket = ensureAcademyBucket(store, academyId);
  const studentBucket = ensureStudentBucket(academyBucket, studentId);

  return Object.keys(studentBucket.invoices)
    .filter((monthKey) => parseBillingMonthKey(monthKey))
    .sort((a, b) => b.localeCompare(a))
    .map((billingMonth) => getStudentPaymentInvoice(academyId, studentId, billingMonth))
    .filter(Boolean);
}

/** 학생 카드용 — 현재 활성 청구월 상태만 */
export function getStudentCardPaymentSummary(academyId, studentId, referenceDate = new Date()) {
  const scopeId = String(academyId ?? "").trim();
  const userId = String(studentId ?? "").trim();
  if (!scopeId || !userId) {
    return null;
  }

  const settings = getStudentPaymentSettings(scopeId, userId);
  const invoice = ensureStudentCurrentInvoice(scopeId, userId, referenceDate);
  const status = normalizePaymentStatus(invoice.status);

  return {
    billingMonth: invoice.billingMonth,
    tuitionLabel: formatTuitionMonthLabel(invoice.billingMonth),
    status,
    statusLabel: getPaymentStatusLabel(status),
    amount: invoice.amount ?? settings.monthly_fee,
    amountLabel: formatMonthlyFeeLabel(invoice.amount ?? settings.monthly_fee),
    billingDay: settings.billing_day,
    billingDayLabel: formatBillingDayLabel(settings.billing_day),
    paidAt: invoice.paid_at,
    paidAtShortLabel: formatPaidAtShortLabel(invoice.paid_at),
  };
}

/** 학생 프로필 결제·수강료 영역용 */
export function getStudentPaymentProfileSummary(academyId, studentId) {
  const scopeId = String(academyId ?? "").trim();
  const userId = String(studentId ?? "").trim();
  if (!scopeId || !userId) {
    return {
      settings: { monthly_fee: null, billing_day: null },
      invoices: [],
      current: null,
    };
  }

  const settings = getStudentPaymentSettings(scopeId, userId);
  const invoices = listStudentPaymentInvoices(scopeId, userId);
  const current = getStudentCardPaymentSummary(scopeId, userId);

  return {
    settings,
    monthlyFeeLabel: formatMonthlyFeeLabel(settings.monthly_fee),
    billingDayLabel: formatBillingDayLabel(settings.billing_day),
    invoices: invoices.map((invoice) => ({
      ...invoice,
      historyLabel: formatBillingMonthHistoryLabel(invoice.billingMonth),
      statusLabel: getPaymentStatusLabel(invoice.status),
      amountLabel: formatMonthlyFeeLabel(invoice.amount),
    })),
    current,
  };
}
