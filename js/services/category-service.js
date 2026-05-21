import { DEFAULT_LEVEL_GROUP, normalizeLevelGroup } from "./level-group-service.js";

const CATEGORIES_STORAGE_KEY = "BADUK_CURRICULUM_CATEGORIES";
const SUPPRESSED_CATEGORIES_KEY = "BADUK_SUPPRESSED_CATEGORIES";
const FALLBACK_CATEGORY_NAME = "미분류";
export const DEFAULT_CATEGORY_NAMES = [
  "활로",
  "돌따내기",
  "돌살리기",
  "서로단수",
  "착수금지",
  "패",
  "연결",
  "끊음",
  "단수쳐서잡기",
  "양단수",
  "촉촉수",
  "축",
  "장문",
  "환격",
  "수상전",
  "먹여치기",
  "옥집",
  "두집만들기",
  "두집없애기",
  "빅",
  "끝내기",
  "공배",
];

export function readCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(CATEGORIES_STORAGE_KEY));
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .map(normalizeCategoryRecord)
      .filter(Boolean)
      .sort(compareCategoryOrder);
  } catch {
    return [];
  }
}

export function saveCategories(categories) {
  const normalized = sortCategoriesByOrder(
    categories
      .map(normalizeCategoryRecord)
      .filter(Boolean)
      .filter((category) => category.status !== "deleted"),
  );

  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(normalized));
  void import("./category-persistence-service.js").then(({ persistCategoriesToSupabase }) =>
    persistCategoriesToSupabase(normalized),
  );
}

export async function hydrateCategoryRegistry(defaultNames = DEFAULT_CATEGORY_NAMES) {
  const { fetchCategoriesFromSupabase, persistCategoriesToSupabase } = await import(
    "./category-persistence-service.js",
  );
  const remote = await fetchCategoriesFromSupabase();

  if (remote.ok && remote.categories.length > 0) {
    saveCategories(remote.categories);
    return readCategories();
  }

  const local = readCategories();
  if (local.length > 0) {
    await persistCategoriesToSupabase(local);
    return local;
  }

  const seeded = defaultNames.map((name, order) =>
    createCategoryRecord(name, order, DEFAULT_LEVEL_GROUP),
  );
  saveCategories(seeded);
  return readCategories();
}

export function initializeCategoryRegistry(defaultNames = DEFAULT_CATEGORY_NAMES) {
  const categories = readCategories();
  if (categories.length > 0) {
    return categories;
  }

  const seeded = defaultNames.map((name, order) =>
    createCategoryRecord(name, order, DEFAULT_LEVEL_GROUP),
  );
  saveCategories(seeded);
  return readCategories();
}

export function syncCategoryNames(targetArray, categories = readCategories(), options = {}) {
  targetArray.splice(
    0,
    targetArray.length,
    ...getOrderedCategoryNames(categories, options),
  );
  return targetArray;
}

export function getOrderedCategoryNames(categories = readCategories(), { levelGroup } = {}) {
  const scopedCategories = filterCategoriesByLevelGroup(categories, levelGroup);
  return scopedCategories.map((category) => category.name);
}

export function filterCategoriesByLevelGroup(categories = readCategories(), levelGroup) {
  if (!levelGroup) {
    return sortCategoriesByOrder(categories);
  }

  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  return sortCategoriesByOrder(
    categories.filter(
      (category) => normalizeLevelGroup(category.levelGroup) === normalizedLevelGroup,
    ),
  );
}

export function getCategoryByName(name, categories = readCategories(), { levelGroup } = {}) {
  const normalizedName = String(name ?? "").trim();
  const matches = categories.filter((category) => category.name === normalizedName);
  if (matches.length === 0) {
    return null;
  }

  if (levelGroup) {
    const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
    return (
      matches.find(
        (category) => normalizeLevelGroup(category.levelGroup) === normalizedLevelGroup,
      ) ?? null
    );
  }

  return matches[0];
}
export function getNextCategoryName(currentName, categories = readCategories(), { levelGroup } = {}) {
  const names = getOrderedCategoryNames(categories, { levelGroup });
  const currentIndex = names.indexOf(currentName);
  if (currentIndex < 0 || currentIndex >= names.length - 1) {
    return null;
  }

  return names[currentIndex + 1];
}

export function syncCategoriesFromProblemNames(problemNames, categories = readCategories()) {
  const nextCategories = [...categories];
  let changed = false;

  problemNames.forEach((name) => {
    const trimmedName = String(name ?? "").trim();
    if (!trimmedName || trimmedName === "전체") {
      return;
    }

    if (!nextCategories.some((category) => category.name === trimmedName) && !isCategorySuppressed(trimmedName)) {
      nextCategories.push(createCategoryRecord(trimmedName, nextCategories.length));
      changed = true;
    }
  });

  if (changed) {
    saveCategories(nextCategories);
  }

  return readCategories();
}

export function syncCategoriesFromProblems(problemList, categories = readCategories()) {
  const nextCategories = [...categories];
  let changed = false;

  problemList.forEach((problem) => {
    const trimmedName = String(problem?.category ?? "").trim();
    const levelGroup = normalizeLevelGroup(problem?.levelGroup);
    if (!trimmedName || trimmedName === "전체") {
      return;
    }

    const exists = nextCategories.some(
      (category) =>
        category.name === trimmedName &&
        normalizeLevelGroup(category.levelGroup) === levelGroup,
    );

    if (!exists && !isCategorySuppressed(trimmedName, levelGroup)) {
      const groupCount = nextCategories.filter(
        (category) => normalizeLevelGroup(category.levelGroup) === levelGroup,
      ).length;
      nextCategories.push(createCategoryRecord(trimmedName, groupCount, levelGroup));
      changed = true;
    }
  });

  if (changed) {
    saveCategories(nextCategories);
  }

  return readCategories();
}
export function addCategory(name, categories = readCategories(), { levelGroup = DEFAULT_LEVEL_GROUP } = {}) {
  const trimmedName = String(name ?? "").trim();
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  if (!trimmedName) {
    return { ok: false, message: "카테고리 이름을 입력해 주세요." };
  }

  if (trimmedName === "전체") {
    return { ok: false, message: "사용할 수 없는 카테고리 이름입니다." };
  }

  if (
    categories.some(
      (category) =>
        category.name === trimmedName &&
        normalizeLevelGroup(category.levelGroup) === normalizedLevelGroup,
    )
  ) {
    return { ok: false, message: "이미 존재하는 카테고리입니다." };
  }

  const nextCategories = [
    ...categories,
    createCategoryRecord(trimmedName, categories.length, normalizedLevelGroup),
  ];
  saveCategories(nextCategories);
  return { ok: true, categories: readCategories(), name: trimmedName, levelGroup: normalizedLevelGroup };
}
export function renameCategory(categoryId, nextName, categories = readCategories()) {
  const trimmedName = String(nextName ?? "").trim();
  if (!trimmedName) {
    return { ok: false, message: "카테고리 이름을 입력해 주세요." };
  }

  if (trimmedName === "전체") {
    return { ok: false, message: "사용할 수 없는 카테고리 이름입니다." };
  }

  const targetIndex = categories.findIndex((category) => category.id === categoryId);
  if (targetIndex < 0) {
    return { ok: false, message: "카테고리를 찾을 수 없습니다." };
  }

  const previousName = categories[targetIndex].name;
  const previousLevelGroup = normalizeLevelGroup(categories[targetIndex].levelGroup);
  if (
    trimmedName !== previousName &&
    categories.some(
      (category) =>
        category.name === trimmedName &&
        normalizeLevelGroup(category.levelGroup) === previousLevelGroup,
    )
  ) {
    return { ok: false, message: "이미 존재하는 카테고리입니다." };
  }

  const nextCategories = categories.map((category) => {
    if (category.id !== categoryId) {
      return category;
    }

    return { ...category, name: trimmedName };
  });
  saveCategories(nextCategories);
  return {
    ok: true,
    categories: readCategories(),
    previousName,
    nextName: trimmedName,
  };
}

export function moveCategory(categoryId, direction, categories = readCategories()) {
  const target = categories.find((category) => category.id === categoryId);
  if (!target) {
    return { ok: false, message: "카테고리를 찾을 수 없습니다." };
  }

  const levelGroup = normalizeLevelGroup(target.levelGroup);
  const groupCategories = filterCategoriesByLevelGroup(categories, levelGroup);
  const currentIndex = groupCategories.findIndex((category) => category.id === categoryId);
  if (currentIndex < 0) {
    return { ok: false, message: "카테고리를 찾을 수 없습니다." };
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= groupCategories.length) {
    return { ok: false, message: "더 이상 이동할 수 없습니다." };
  }

  const reorderedGroup = [...groupCategories];
  const [moved] = reorderedGroup.splice(currentIndex, 1);
  reorderedGroup.splice(targetIndex, 0, moved);

  const orderById = new Map(reorderedGroup.map((category, index) => [category.id, index]));
  const nextCategories = categories.map((category) => {
    const nextOrder = orderById.get(category.id);
    if (nextOrder === undefined) {
      return category;
    }

    return { ...category, order: nextOrder };
  });
  saveCategories(nextCategories);
  return { ok: true, categories: readCategories() };
}

export function reorderCategories(orderedIds, categories = readCategories(), { levelGroup } = {}) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, message: "순서를 변경할 카테고리가 없습니다." };
  }

  if (levelGroup) {
    const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
    const groupCategories = filterCategoriesByLevelGroup(categories, normalizedLevelGroup);
    if (orderedIds.length !== groupCategories.length) {
      return { ok: false, message: "카테고리 순서를 다시 확인해 주세요." };
    }

    const groupIdSet = new Set(groupCategories.map((category) => category.id));
    if (!orderedIds.every((categoryId) => groupIdSet.has(categoryId))) {
      return { ok: false, message: "카테고리를 찾을 수 없습니다." };
    }

    const orderById = new Map(orderedIds.map((categoryId, index) => [categoryId, index]));
    const nextCategories = categories.map((category) => {
      if (normalizeLevelGroup(category.levelGroup) !== normalizedLevelGroup) {
        return category;
      }

      return { ...category, order: orderById.get(category.id) ?? category.order };
    });
    saveCategories(nextCategories);
    return { ok: true, categories: readCategories() };
  }

  const sortedCategories = sortCategoriesByOrder(categories);
  if (orderedIds.length !== sortedCategories.length) {
    return { ok: false, message: "카테고리 순서를 다시 확인해 주세요." };
  }

  const categoryById = new Map(sortedCategories.map((category) => [category.id, category]));
  const reordered = orderedIds.map((categoryId) => categoryById.get(categoryId)).filter(Boolean);
  if (reordered.length !== sortedCategories.length) {
    return { ok: false, message: "카테고리를 찾을 수 없습니다." };
  }

  saveCategories(reordered);
  return { ok: true, categories: readCategories() };
}

export async function deleteCategory(categoryId, categories = readCategories()) {
  const target = categories.find((category) => category.id === categoryId);
  if (!target) {
    return { ok: false, message: "카테고리를 찾을 수 없습니다." };
  }

  markCategorySuppressed(target.name, target.levelGroup);
  const nextCategories = categories.filter((category) => category.id !== categoryId);
  saveCategories(nextCategories);

  const { markCategoryDeletedInSupabase } = await import("./category-persistence-service.js");
  await markCategoryDeletedInSupabase(target);

  return {
    ok: true,
    categories: readCategories(),
    removedName: target.name,
    levelGroup: normalizeLevelGroup(target.levelGroup),
  };
}

/** 문제 재배치가 필요할 때만 호출 — 빈 삭제 시 미분류 자동 생성 방지 */
export function resolveFallbackCategoryForReassign(
  categories = readCategories(),
  { levelGroup = DEFAULT_LEVEL_GROUP, excludingName = "" } = {},
) {
  const normalizedLevelGroup = normalizeLevelGroup(levelGroup);
  const normalizedExclude = String(excludingName ?? "").trim();
  const inGroup = filterCategoriesByLevelGroup(categories, normalizedLevelGroup).filter(
    (category) => category.name !== normalizedExclude,
  );

  const uncategorized = inGroup.find((category) => category.name === FALLBACK_CATEGORY_NAME);
  if (uncategorized) {
    return FALLBACK_CATEGORY_NAME;
  }

  if (inGroup.length > 0) {
    return inGroup[0].name;
  }

  const nextCategories = [
    ...categories,
    createCategoryRecord(FALLBACK_CATEGORY_NAME, 0, normalizedLevelGroup),
  ];
  saveCategories(nextCategories);
  return FALLBACK_CATEGORY_NAME;
}

export function ensureFallbackCategoryName(categories = readCategories()) {
  return resolveFallbackCategoryForReassign(categories);
}

export function countProblemsInCategory(categoryName, problems, { levelGroup } = {}) {
  return problems.filter((problem) => {
    if (problem.category !== categoryName) {
      return false;
    }

    if (levelGroup) {
      return normalizeLevelGroup(problem.levelGroup) === normalizeLevelGroup(levelGroup);
    }

    return true;
  }).length;
}
function normalizeCategoryRecord(category) {
  if (!category || typeof category !== "object") {
    return null;
  }

  const name = String(category.name ?? "").trim();
  if (!name) {
    return null;
  }

  return {
    id: String(category.id ?? createStableCategoryId(name, category.levelGroup)),
    name,
    order: Number.isFinite(Number(category.order)) ? Number(category.order) : 0,
    levelGroup: normalizeLevelGroup(category.levelGroup),
    status: category.status ?? "active",
  };
}

function createCategoryRecord(name, order, levelGroup = DEFAULT_LEVEL_GROUP) {
  return {
    id: createCategoryId(name, levelGroup),
    name,
    order,
    levelGroup: normalizeLevelGroup(levelGroup),
    status: "active",
  };
}

function createStableCategoryId(name, levelGroup = DEFAULT_LEVEL_GROUP) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣-]/g, "");
  const groupSlug = normalizeLevelGroup(levelGroup)
    .toLowerCase()
    .replace(/\s+/g, "-");
  return `category-${groupSlug}-${slug || "item"}`;
}

function createCategoryId(name, levelGroup = DEFAULT_LEVEL_GROUP) {
  return `${createStableCategoryId(name, levelGroup)}-${Date.now().toString(36)}`;
}

function sortCategoriesByOrder(categories) {
  return [...categories].sort(compareCategoryOrder);
}

function compareCategoryOrder(left, right) {
  const groupDiff = String(left.levelGroup ?? "").localeCompare(String(right.levelGroup ?? ""), "ko");
  if (groupDiff !== 0) {
    return groupDiff;
  }

  const orderDiff = left.order - right.order;
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return left.name.localeCompare(right.name, "ko");
}

function categorySuppressionKey(name, levelGroup = DEFAULT_LEVEL_GROUP) {
  return `${normalizeLevelGroup(levelGroup)}::${String(name ?? "").trim()}`;
}

function readSuppressedCategoryKeys() {
  try {
    const stored = JSON.parse(localStorage.getItem(SUPPRESSED_CATEGORIES_KEY));
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveSuppressedCategoryKeys(keys) {
  localStorage.setItem(SUPPRESSED_CATEGORIES_KEY, JSON.stringify([...keys]));
}

export function markCategorySuppressed(name, levelGroup = DEFAULT_LEVEL_GROUP) {
  const keys = readSuppressedCategoryKeys();
  keys.add(categorySuppressionKey(name, levelGroup));
  saveSuppressedCategoryKeys(keys);
}

export function isCategorySuppressed(name, levelGroup = DEFAULT_LEVEL_GROUP) {
  return readSuppressedCategoryKeys().has(categorySuppressionKey(name, levelGroup));
}
