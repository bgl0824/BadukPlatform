/** 시험/기출 세트 유형 */
export const EXAM_SET_TYPE = {
  pastExam: "past_exam",
  promotionTest: "promotion_test",
  mockTest: "mock_test",
};

export const EXAM_SET_TYPE_LABELS = {
  [EXAM_SET_TYPE.pastExam]: "기출문제",
  [EXAM_SET_TYPE.promotionTest]: "승급시험",
  [EXAM_SET_TYPE.mockTest]: "모의시험",
};

/** 공개 범위 */
export const EXAM_SET_VISIBILITY = {
  public: "public",
  academy: "academy",
  private: "private",
};

export const EXAM_SET_VISIBILITY_LABELS = {
  [EXAM_SET_VISIBILITY.public]: "전체 공개",
  [EXAM_SET_VISIBILITY.academy]: "특정 학원",
  [EXAM_SET_VISIBILITY.private]: "비공개",
};

/** 배포 상태 */
export const EXAM_SET_STATUS = {
  draft: "draft",
  published: "published",
};

export const EXAM_SET_STATUS_LABELS = {
  [EXAM_SET_STATUS.draft]: "초안",
  [EXAM_SET_STATUS.published]: "게시됨",
};

/** 세트 역할: 학습용 기출세트 vs 실전 승급심사 시험지 */
export const EXAM_SET_ROLE = {
  questionBank: "question_bank",
  promotionPaper: "promotion_paper",
};

export const EXAM_SET_ROLE_LABELS = {
  [EXAM_SET_ROLE.questionBank]: "기출세트",
  [EXAM_SET_ROLE.promotionPaper]: "승급심사 시험지",
};

export function normalizeExamSetType(value) {
  const raw = String(value ?? "").trim();
  return Object.values(EXAM_SET_TYPE).includes(raw) ? raw : EXAM_SET_TYPE.pastExam;
}

export function normalizeExamSetVisibility(value) {
  const raw = String(value ?? "").trim();
  return Object.values(EXAM_SET_VISIBILITY).includes(raw)
    ? raw
    : EXAM_SET_VISIBILITY.private;
}

export function normalizeExamSetStatus(value) {
  const raw = String(value ?? "").trim();
  return Object.values(EXAM_SET_STATUS).includes(raw) ? raw : EXAM_SET_STATUS.draft;
}

export function normalizeExamSetRole(value) {
  const raw = String(value ?? "").trim();
  return Object.values(EXAM_SET_ROLE).includes(raw) ? raw : EXAM_SET_ROLE.questionBank;
}

/** type 기준으로 set_role 강제 매핑 (운영 규칙) */
export function resolveExamSetRoleByType(type) {
  return normalizeExamSetType(type) === EXAM_SET_TYPE.promotionTest
    ? EXAM_SET_ROLE.promotionPaper
    : EXAM_SET_ROLE.questionBank;
}

export function formatExamSetTypeLabel(type) {
  return EXAM_SET_TYPE_LABELS[normalizeExamSetType(type)] ?? type;
}

export function formatExamSetVisibilityLabel(visibility) {
  return EXAM_SET_VISIBILITY_LABELS[normalizeExamSetVisibility(visibility)] ?? visibility;
}

export function formatExamSetStatusLabel(status) {
  return EXAM_SET_STATUS_LABELS[normalizeExamSetStatus(status)] ?? status;
}

export function formatExamSetRoleLabel(role) {
  return EXAM_SET_ROLE_LABELS[normalizeExamSetRole(role)] ?? role;
}

/** 저장 버튼 라벨 — 상태에 따라 의미 구분 */
export function getExamSetSaveButtonLabel(status) {
  return normalizeExamSetStatus(status) === EXAM_SET_STATUS.published ? "세트 게시" : "임시 저장";
}

export function getExamSetSaveHint(status) {
  if (normalizeExamSetStatus(status) === EXAM_SET_STATUS.published) {
    return "게시하면 문제은행 상단 「기출 / 시험」에 노출됩니다. (공개 범위·문제·급수 조건 충족 필요)";
  }

  return "초안은 관리자만 볼 수 있습니다. 학습자에게 보이게 하려면 상태를 「게시됨」으로 바꾼 뒤 세트 게시하세요.";
}

export function buildExamSetSaveSuccessMessage({
  title,
  status,
  visibility,
  questionCount,
}) {
  const safeTitle = String(title ?? "").trim() || "시험 세트";
  const count = Number(questionCount) || 0;
  const visibilityLabel = formatExamSetVisibilityLabel(visibility);

  if (normalizeExamSetStatus(status) === EXAM_SET_STATUS.published) {
    return `「${safeTitle}」 기출/시험 세트가 게시되었습니다. ${count}문제가 포함되었습니다. · 공개: ${visibilityLabel}`;
  }

  return `「${safeTitle}」 임시 저장되었습니다. ${count}문제 · 상태: 초안 (학습자에게는 아직 보이지 않음)`;
}

export function getExamSetTypeOptions() {
  return Object.entries(EXAM_SET_TYPE_LABELS).map(([value, label]) => ({ value, label }));
}

export function getExamSetVisibilityOptions() {
  return Object.entries(EXAM_SET_VISIBILITY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
}

export function getExamSetStatusOptions() {
  return Object.entries(EXAM_SET_STATUS_LABELS).map(([value, label]) => ({ value, label }));
}

export function getExamSetRoleOptions() {
  return Object.entries(EXAM_SET_ROLE_LABELS).map(([value, label]) => ({ value, label }));
}

export function createExamSetId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `exam-${crypto.randomUUID()}`;
  }

  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
