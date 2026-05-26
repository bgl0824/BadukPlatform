/** @typedef {{ code: string, label: string, sortKey: number }} GradeLevelDefinition */

const DAN_LABELS = {
  "1d": "초단",
  "2d": "2단",
  "3d": "3단",
  "4d": "4단",
  "5d": "5단",
};

/** @type {GradeLevelDefinition[]} */
export const GRADE_LEVELS = [];

for (let kyu = 30; kyu >= 1; kyu -= 1) {
  GRADE_LEVELS.push({
    code: `${kyu}k`,
    label: `${kyu}급`,
    sortKey: kyu,
  });
}

for (let dan = 1; dan <= 5; dan += 1) {
  const code = `${dan}d`;
  GRADE_LEVELS.push({
    code,
    label: DAN_LABELS[code] ?? `${dan}단`,
    sortKey: 100 + dan,
  });
}

export const GRADE_LEVEL_FILTER = {
  all: "all",
  unassigned: "unassigned",
};

const gradeByCode = new Map(GRADE_LEVELS.map((entry) => [entry.code, entry]));

export function normalizeGradeLevelCode(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "unassigned" || raw === "null") {
    return null;
  }

  if (gradeByCode.has(raw)) {
    return raw;
  }

  const legacyKyu = raw.match(/^(\d{1,2})\s*급$/);
  if (legacyKyu) {
    const code = `${legacyKyu[1]}k`;
    return gradeByCode.has(code) ? code : null;
  }

  return null;
}

export function getGradeLevelDefinition(code) {
  const normalized = normalizeGradeLevelCode(code);
  return normalized ? gradeByCode.get(normalized) ?? null : null;
}

export function formatGradeLevelLabel(code, { emptyLabel = "급수 미지정" } = {}) {
  const definition = getGradeLevelDefinition(code);
  return definition?.label ?? emptyLabel;
}

export function getGradeLevelSortKey(code) {
  const definition = getGradeLevelDefinition(code);
  return definition?.sortKey ?? Number.MAX_SAFE_INTEGER;
}

export function compareGradeLevels(leftCode, rightCode) {
  return getGradeLevelSortKey(leftCode) - getGradeLevelSortKey(rightCode);
}

export function getGradeLevelSelectOptions({ includeUnassigned = true } = {}) {
  const options = GRADE_LEVELS.map((entry) => ({
    value: entry.code,
    label: entry.label,
  }));

  if (includeUnassigned) {
    return [{ value: "", label: "급수 미지정" }, ...options];
  }

  return options;
}

export function getGradeLevelFilterOptions() {
  return [
    { value: GRADE_LEVEL_FILTER.all, label: "급수 전체" },
    { value: GRADE_LEVEL_FILTER.unassigned, label: "급수 미지정만" },
    ...GRADE_LEVELS.map((entry) => ({
      value: entry.code,
      label: entry.label,
    })),
  ];
}

export function matchesGradeLevelFilter(problem, filterValue) {
  const filter = String(filterValue ?? GRADE_LEVEL_FILTER.all);
  const code = normalizeGradeLevelCode(problem?.gradeLevel);

  if (filter === GRADE_LEVEL_FILTER.all) {
    return true;
  }

  if (filter === GRADE_LEVEL_FILTER.unassigned) {
    return !code;
  }

  return code === filter;
}
