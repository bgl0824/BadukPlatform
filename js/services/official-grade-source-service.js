export const OFFICIAL_GRADE_SOURCES = [
  { code: "kba", label: "대한바둑협회" },
  { code: "kgf", label: "한국기원" },
  { code: "platform", label: "플랫폼 자체급수" },
];

const sourceByCode = new Map(OFFICIAL_GRADE_SOURCES.map((entry) => [entry.code, entry]));

export function normalizeOfficialGradeSource(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || !sourceByCode.has(raw)) {
    return null;
  }

  return raw;
}

export function formatOfficialGradeSourceLabel(code, { emptyLabel = "출처 미지정" } = {}) {
  const normalized = normalizeOfficialGradeSource(code);
  return normalized ? sourceByCode.get(normalized).label : emptyLabel;
}

export function getOfficialGradeSourceSelectOptions() {
  return OFFICIAL_GRADE_SOURCES.map((entry) => ({
    value: entry.code,
    label: entry.label,
  }));
}
