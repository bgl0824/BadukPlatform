(function () {
const BOARD_SIZE = 13;

const STONE = {
  black: "black",
  white: "white",
};

const DEFAULT_PROBLEMS = [
  {
    id: "활로-새-문제-1778978691561",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (4곳)",
    level: "",
    category: "활로",
    stones: [{ x: 3, y: 9, color: "white", mark: "triangle" }],
    correctMove: { x: 2, y: 9 },
    correctSequence: [
      { x: 2, y: 9 },
      { x: 3, y: 8 },
      { x: 3, y: 10 },
      { x: 4, y: 9 },
    ],
  },
  {
    id: "활로-새-문제-1778978944087",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (3곳)",
    level: "",
    category: "활로",
    stones: [{ x: 3, y: 12, color: "white", mark: "triangle" }],
    correctMove: { x: 2, y: 12 },
    correctSequence: [
      { x: 2, y: 12 },
      { x: 3, y: 11 },
      { x: 4, y: 12 },
    ],
  },
  {
    id: "활로-새-문제-1778978982670",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (2곳)",
    level: "",
    category: "활로",
    stones: [{ x: 0, y: 12, color: "white", mark: "triangle" }],
    correctMove: { x: 0, y: 11 },
    correctSequence: [
      { x: 0, y: 11 },
      { x: 1, y: 12 },
    ],
  },
  {
    id: "활로-새-문제-1778979028695",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (2곳)",
    level: "",
    category: "활로",
    stones: [
      { x: 3, y: 9, color: "white", mark: "triangle" },
      { x: 3, y: 8, color: "black" },
      { x: 4, y: 9, color: "black" },
    ],
    correctMove: { x: 2, y: 9 },
    correctSequence: [
      { x: 2, y: 9 },
      { x: 3, y: 10 },
    ],
  },
  {
    id: "활로-새-문제-1778979061595",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (2곳)",
    level: "",
    category: "활로",
    stones: [
      { x: 3, y: 12, color: "white", mark: "triangle" },
      { x: 3, y: 11, color: "black" },
    ],
    correctMove: { x: 2, y: 12 },
    correctSequence: [
      { x: 2, y: 12 },
      { x: 4, y: 12 },
    ],
  },
  {
    id: "활로-새-문제-1778979085402",
    title: "활로 줄이기",
    description: "백 △돌의 활로를 모두 막아보세요. (1곳)",
    level: "",
    category: "활로",
    stones: [
      { x: 0, y: 12, color: "white", mark: "triangle" },
      { x: 0, y: 11, color: "black" },
    ],
    correctMove: { x: 1, y: 12 },
    correctSequence: [{ x: 1, y: 12 }],
  },
];

const RETIRED_MUTUAL_ATARI_INTRO_IDS = [
  "서로단수-입문-001",
  "서로단수-입문-002",
  "서로단수-입문-003",
  "서로단수-입문-004",
  "서로단수-입문-005",
  "서로단수-입문-006",
];

const problems = [];
const SUPABASE_PROBLEMS_TABLE = "problems";
const LEGACY_PROBLEMS_STORAGE_KEY = "BADUK_PLATFORM_PROBLEMS";
const LEGACY_PROBLEMS_MIGRATED_KEY = "BADUK_PLATFORM_PROBLEMS_MIGRATED_TO_SUPABASE";
const LEGACY_PROBLEMS_BACKUP_KEY = "BADUK_PLATFORM_PROBLEMS_MIGRATED_BACKUP";

const ProblemStore = {
  getDefaultProblems,
  migrateLegacyProblems,
  loadProblems,
  saveProblem,
  bulkSetGradeLevels,
  reorderProblemsInCategory,
  deleteProblem,
  subscribe,
  isConfigured,
};

let supabaseClient = null;
let realtimeChannel = null;

function getDefaultProblems() {
  return DEFAULT_PROBLEMS.map(cloneProblem);
}

async function migrateLegacyProblems() {
  const legacyProblems = readLegacyProblems();
  if (legacyProblems.length === 0) {
    return { migratedCount: 0 };
  }

  await saveProblems(legacyProblems);

  try {
    window.localStorage?.setItem(
      LEGACY_PROBLEMS_BACKUP_KEY,
      JSON.stringify(legacyProblems),
    );
    window.localStorage?.setItem(
      LEGACY_PROBLEMS_MIGRATED_KEY,
      new Date().toISOString(),
    );
    window.localStorage?.removeItem(LEGACY_PROBLEMS_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to mark legacy problems as migrated.", error);
  }

  return { migratedCount: legacyProblems.length };
}

async function loadProblems({ seedDefaults = true } = {}) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  if (data.length === 0 && seedDefaults && DEFAULT_PROBLEMS.length > 0) {
    await saveProblems(DEFAULT_PROBLEMS);
    return loadProblems({ seedDefaults: false });
  }

  const loadedProblems = sortLoadedProblems(
    data.map((row) => cloneProblem(fromSupabaseRow(row))),
  );
  return removeRetiredMutualAtariIntroProblems(loadedProblems);
}

async function removeRetiredMutualAtariIntroProblems(existingProblems) {
  const retiredIds = new Set(RETIRED_MUTUAL_ATARI_INTRO_IDS);
  const hasRetired = existingProblems.some((problem) => retiredIds.has(problem.id));
  if (!hasRetired) {
    return existingProblems;
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .delete()
    .in("id", [...retiredIds]);

  if (error) {
    console.warn("Failed to delete retired 서로단수 intro problems.", error);
  }

  return existingProblems.filter((problem) => !retiredIds.has(problem.id));
}

function readLegacyProblems() {
  try {
    const storedValue = window.localStorage?.getItem(LEGACY_PROBLEMS_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsedProblems = JSON.parse(storedValue);
    if (!Array.isArray(parsedProblems)) {
      return [];
    }

    return parsedProblems.filter((problem) => {
      return problem?.id && problem?.title && problem?.category;
    });
  } catch (error) {
    console.warn("Failed to read legacy localStorage problems.", error);
    return [];
  }
}

function assignSeedDisplayOrders(problemList) {
  const counters = new Map();

  return problemList.map((problem) => {
    const levelGroup = normalizeProblemLevelGroup(problem.levelGroup);
    const key = `${levelGroup}::${problem.category}`;
    const existingOrder = Number(problem.displayOrder);
    const nextOrder =
      Number.isFinite(existingOrder) && existingOrder > 0
        ? existingOrder
        : (counters.get(key) ?? 0) + 1;
    counters.set(key, Math.max(counters.get(key) ?? 0, nextOrder));

    return {
      ...problem,
      displayOrder: nextOrder,
    };
  });
}

async function saveProblems(problemList) {
  const client = getSupabaseClient();
  const preparedProblems = assignSeedDisplayOrders(problemList);
  const { error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .upsert(preparedProblems.map(toSupabaseRow), { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function saveProblem(problem) {
  const client = getSupabaseClient();
  const displayOrder = await resolveDisplayOrderForSave(problem);
  const preparedProblem = {
    ...problem,
    category: String(problem.category ?? "").trim(),
    levelGroup: normalizeProblemLevelGroup(problem.levelGroup),
    displayOrder,
  };
  const row = toSupabaseRow(preparedProblem);
  const { data, error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const savedProblem = cloneProblem(fromSupabaseRow(data));
  console.log("[ProblemStore] saved problem display_order", {
    id: savedProblem.id,
    category: savedProblem.category,
    levelGroup: savedProblem.levelGroup,
    displayOrder: savedProblem.displayOrder,
    supabaseRow: data?.display_order,
  });
  return savedProblem;
}

async function bulkSetGradeLevels(problemIds, gradeLevel) {
  const safeIds = [...new Set(problemIds.filter(Boolean))];
  console.log("[ProblemStore] bulkSetGradeLevels start", {
    problemIds: safeIds,
    gradeLevel,
  });

  if (safeIds.length === 0) {
    console.warn("[ProblemStore] bulkSetGradeLevels skipped — empty problemIds");
    return { updatedCount: 0 };
  }

  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    console.error("[ProblemStore] bulkSetGradeLevels session error", sessionError);
    throw sessionError;
  }

  if (!sessionData?.session?.user) {
    throw new Error(
      "Supabase 로그인 세션이 없습니다. 급수 저장은 Supabase Auth(admin) 로그인 후 가능합니다.",
    );
  }

  const normalizedGrade =
    gradeLevel === null || gradeLevel === undefined || gradeLevel === ""
      ? null
      : String(gradeLevel).trim().toLowerCase();

  const { data, error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .update({ grade_level: normalizedGrade })
    .in("id", safeIds)
    .select("id");

  if (error) {
    console.error("[ProblemStore] bulkSetGradeLevels update error", error);
    throw error;
  }

  let updatedCount = Array.isArray(data) ? data.length : 0;
  console.log("[ProblemStore] bulkSetGradeLevels direct update", {
    updatedCount,
    requested: safeIds.length,
    gradeLevel: normalizedGrade,
  });

  if (updatedCount < safeIds.length) {
    const rpcCount = await bulkSetGradeLevelsWithRpc(client, safeIds, normalizedGrade);
    if (rpcCount > updatedCount) {
      updatedCount = rpcCount;
      console.log("[ProblemStore] bulkSetGradeLevels RPC applied", { updatedCount });
    }
  }

  if (updatedCount === 0) {
    throw new Error(
      "bulk grade update returned no rows — check Supabase session, RLS (problems_update_by_managers), and grade_level column",
    );
  }

  console.log("[ProblemStore] bulkSetGradeLevels success", { updatedCount });
  return { updatedCount };
}

async function bulkSetGradeLevelsWithRpc(client, problemIds, gradeLevel) {
  const { data, error } = await client.rpc("bulk_set_problems_grade_levels", {
    problem_ids: problemIds,
    new_grade_level: gradeLevel,
  });

  if (error) {
    if (
      error.message?.includes("function") ||
      error.message?.includes("bulk_set_problems_grade_levels") ||
      error.code === "PGRST202"
    ) {
      console.warn(
        "[ProblemStore] bulk_set_problems_grade_levels RPC not available — run scripts/supabase-problems-grade-level.sql",
      );
      return 0;
    }

    console.error("[ProblemStore] bulkSetGradeLevels RPC error", error);
    throw error;
  }

  const count = Number(data);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

async function reorderProblemsInCategory({ category, levelGroup, orderedProblemIds }) {
  const normalizedCategory = String(category ?? "").trim();
  const normalizedLevelGroup = normalizeProblemLevelGroup(levelGroup);
  const safeIds = orderedProblemIds.filter(Boolean);

  if (!normalizedCategory || safeIds.length === 0) {
    return;
  }

  const client = getSupabaseClient();
  const updates = safeIds.map((problemId, index) =>
    client
      .from(SUPABASE_PROBLEMS_TABLE)
      .update({ display_order: index + 1 })
      .eq("id", problemId)
      .eq("category", normalizedCategory)
      .eq("level_group", normalizedLevelGroup),
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

async function deleteProblem(problemId) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .delete()
    .eq("id", problemId)
    .select("id");

  if (error) {
    throw error;
  }

  if (Array.isArray(data) && data.length > 0) {
    return;
  }

  const deletedByRpc = await deleteProblemWithRpc(client, problemId);
  if (!deletedByRpc) {
    throw new Error("delete returned no rows");
  }
}

async function deleteProblemWithRpc(client, problemId) {
  const { data, error } = await client.rpc("delete_problem", {
    problem_id: problemId,
  });

  if (error) {
    if (
      error.message?.includes("function") ||
      error.message?.includes("delete_problem") ||
      error.code === "PGRST202"
    ) {
      return false;
    }

    throw error;
  }

  return data === true;
}

function subscribe(onProblemsChanged) {
  const client = getSupabaseClient();

  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
  }

  realtimeChannel = client
    .channel("baduk-problems-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: SUPABASE_PROBLEMS_TABLE },
      async () => {
        try {
          const latestProblems = await loadProblems({ seedDefaults: false });
          onProblemsChanged(latestProblems);
        } catch (error) {
          console.error("Failed to refresh realtime problem data.", error);
        }
      },
    )
    .subscribe();

  return realtimeChannel;
}

function isConfigured() {
  const config = window.BadukConfig ?? {};
  return Boolean(config.supabaseUrl && config.supabaseKey && window.supabase?.createClient);
}

function getSupabaseClient() {
  if (typeof window !== "undefined" && window.__BADUK_SHARED_SUPABASE_CLIENT__) {
    supabaseClient = window.__BADUK_SHARED_SUPABASE_CLIENT__;
    return supabaseClient;
  }

  if (supabaseClient) {
    return supabaseClient;
  }

  const config = window.BadukConfig ?? {};
  if (!window.supabase?.createClient) {
    throw new Error("Supabase 라이브러리를 불러오지 못했습니다.");
  }

  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("Supabase URL 또는 KEY가 설정되지 않았습니다.");
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (typeof window !== "undefined") {
    window.__BADUK_SHARED_SUPABASE_CLIENT__ = supabaseClient;
  }

  return supabaseClient;
}

function normalizeProblemLevelGroup(value) {
  const groups = ["입문", "초급", "중급", "고급", "유단자"];
  return groups.includes(value) ? value : "입문";
}

function getMaxDisplayOrderInScopeMemory(categoryName, levelGroup, problemList, excludeProblemId) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const normalizedLevelGroup = normalizeProblemLevelGroup(levelGroup);
  let maxOrder = 0;

  problemList.forEach((entry) => {
    if (excludeProblemId && entry.id === excludeProblemId) {
      return;
    }

    if (String(entry.category ?? "").trim() !== normalizedCategory) {
      return;
    }

    if (normalizeProblemLevelGroup(entry.levelGroup) !== normalizedLevelGroup) {
      return;
    }

    const order = Number(entry.displayOrder);
    if (Number.isFinite(order) && order > maxOrder) {
      maxOrder = order;
    }
  });

  return maxOrder;
}

async function fetchMaxDisplayOrderInScope(categoryName, levelGroup, { excludeProblemId } = {}) {
  const normalizedCategory = String(categoryName ?? "").trim();
  const normalizedLevelGroup = normalizeProblemLevelGroup(levelGroup);

  if (!normalizedCategory) {
    return 0;
  }

  const client = getSupabaseClient();
  let query = client
    .from(SUPABASE_PROBLEMS_TABLE)
    .select("display_order")
    .eq("category", normalizedCategory)
    .eq("level_group", normalizedLevelGroup)
    .gt("display_order", 0)
    .order("display_order", { ascending: false })
    .limit(1);

  if (excludeProblemId) {
    query = query.neq("id", excludeProblemId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const maxValue = Number(data?.[0]?.display_order);
  return Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0;
}

async function resolveDisplayOrderForSave(problem) {
  const category = String(problem.category ?? "").trim();
  const levelGroup = normalizeProblemLevelGroup(problem.levelGroup);
  const client = getSupabaseClient();

  const { data: existingRow, error: existingError } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .select("id, display_order")
    .eq("id", problem.id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const isUpdate = Boolean(existingRow?.id);
  const requestedOrder = Number(problem.displayOrder);

  if (isUpdate) {
    if (Number.isFinite(requestedOrder) && requestedOrder > 0) {
      return Math.floor(requestedOrder);
    }

    const storedOrder = Number(existingRow.display_order);
    if (Number.isFinite(storedOrder) && storedOrder > 0) {
      return Math.floor(storedOrder);
    }
  }

  const memoryMax = getMaxDisplayOrderInScopeMemory(category, levelGroup, problems, problem.id);
  const dbMax = await fetchMaxDisplayOrderInScope(category, levelGroup, {
    excludeProblemId: problem.id,
  });
  const nextOrder = Math.max(memoryMax, dbMax) + 1;

  console.log("[ProblemStore] resolve display_order (append)", {
    id: problem.id,
    category,
    levelGroup,
    isUpdate,
    requestedOrder: Number.isFinite(requestedOrder) ? requestedOrder : null,
    memoryMax,
    dbMax,
    displayOrder: nextOrder,
  });

  return nextOrder;
}

function compareProblemsForLoad(left, right) {
  const leftRank = getLoadSortRank(left);
  const rightRank = getLoadSortRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return (
    new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime() ||
    String(left.id ?? "").localeCompare(String(right.id ?? ""), "ko")
  );
}

function getLoadSortRank(problem) {
  const order = Number(problem.displayOrder);
  return Number.isFinite(order) && order > 0 ? order : Number.MAX_SAFE_INTEGER;
}

function sortLoadedProblems(problemList) {
  return [...problemList].sort(compareProblemsForLoad);
}

function toSupabaseRow(problem) {
  const displayOrder = Number(problem.displayOrder);
  if (!Number.isFinite(displayOrder) || displayOrder <= 0) {
    throw new Error(
      `display_order must be a positive integer before save (problem=${problem.id}, got=${problem.displayOrder})`,
    );
  }

  const row = {
    id: problem.id,
    title: problem.title,
    description: problem.description,
    level: problem.level ?? "",
    level_group: normalizeProblemLevelGroup(problem.levelGroup),
    category: problem.category,
    type: problem.type ?? "board",
    ox_answer: problem.type === "ox" ? Boolean(problem.oxAnswer) : null,
    stones: problem.stones ?? [],
    correct_move: problem.correctMove ?? null,
    correct_sequence: problem.correctSequence ?? null,
    display_order: Math.floor(displayOrder),
    grade_level: normalizeGradeLevelForStorage(problem.gradeLevel),
  };

  if (problem.problemMode) {
    row.problem_mode = problem.problemMode;
  }

  if (Array.isArray(problem.aiResponseCandidates) && problem.aiResponseCandidates.length > 0) {
    row.ai_response_candidates = problem.aiResponseCandidates;
  }

  const answerMoveCount = Number(problem.answerMoveCount);
  if ([1, 3, 5, 7].includes(answerMoveCount)) {
    row.answer_move_count = answerMoveCount;
  }

  if (Array.isArray(problem.blackAnswerSequence) && problem.blackAnswerSequence.length > 0) {
    row.black_answer_sequence = problem.blackAnswerSequence;
  }

  return row;
}

function normalizeGradeLevelForStorage(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "unassigned" || raw === "null") {
    return null;
  }

  return raw;
}

function fromSupabaseRow(row) {
  const problem = {
    id: row.id,
    title: row.title,
    description: row.description,
    level: row.level ?? "",
    levelGroup: normalizeProblemLevelGroup(row.level_group),
    category: row.category,
    type: row.type === "ox" ? "ox" : "board",
    stones: row.stones ?? [],
    correctMove: row.correct_move,
  };

  if (problem.type === "ox") {
    problem.oxAnswer = Boolean(row.ox_answer);
  }

  if (Array.isArray(row.correct_sequence)) {
    problem.correctSequence = row.correct_sequence;
  }

  const displayOrder = Number(row.display_order);
  if (Number.isFinite(displayOrder) && displayOrder > 0) {
    problem.displayOrder = displayOrder;
  }

  if (row.created_at) {
    problem.createdAt = row.created_at;
  }

  const gradeLevel = normalizeGradeLevelForStorage(row.grade_level);
  if (gradeLevel) {
    problem.gradeLevel = gradeLevel;
  }

  if (row.problem_mode) {
    problem.problemMode = String(row.problem_mode).trim();
  }

  if (Array.isArray(row.ai_response_candidates)) {
    problem.aiResponseCandidates = row.ai_response_candidates;
  }

  if (Array.isArray(row.candidate_responses)) {
    problem.candidateResponses = row.candidate_responses;
  }

  const answerMoveCount = Number(row.answer_move_count);
  if ([1, 3, 5, 7].includes(answerMoveCount)) {
    problem.answerMoveCount = answerMoveCount;
  }

  if (Array.isArray(row.black_answer_sequence)) {
    problem.blackAnswerSequence = row.black_answer_sequence;
  }

  return problem;
}

function cloneProblem(problem) {
  const clonedProblem = {
    ...problem,
    levelGroup: normalizeProblemLevelGroup(problem.levelGroup),
    type: problem.type === "ox" ? "ox" : "board",
    correctMove: problem.correctMove ? { ...problem.correctMove } : null,
    correctSequence: Array.isArray(problem.correctSequence)
      ? problem.correctSequence.map((move) => ({ ...move }))
      : undefined,
    stones: Array.isArray(problem.stones)
      ? problem.stones.map((stone) => ({ ...stone }))
      : [],
    problemMode: problem.problemMode,
    aiResponseCandidates: Array.isArray(problem.aiResponseCandidates)
      ? problem.aiResponseCandidates.map((entry) => ({ ...entry }))
      : undefined,
    candidateResponses: Array.isArray(problem.candidateResponses)
      ? problem.candidateResponses.map((entry) => ({ ...entry }))
      : undefined,
    answerMoveCount: problem.answerMoveCount,
    blackAnswerSequence: Array.isArray(problem.blackAnswerSequence)
      ? [...problem.blackAnswerSequence]
      : undefined,
  };

  if (clonedProblem.type === "ox") {
    clonedProblem.oxAnswer = Boolean(problem.oxAnswer);
  }

  const gradeLevel = normalizeGradeLevelForStorage(problem.gradeLevel);
  if (gradeLevel) {
    clonedProblem.gradeLevel = gradeLevel;
  }

  return clonedProblem;
}

window.BadukProblems = {
  BOARD_SIZE,
  STONE,
  problems,
  ProblemStore,
};
})();
