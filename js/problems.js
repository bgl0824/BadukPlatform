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
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  if (data.length === 0 && seedDefaults && DEFAULT_PROBLEMS.length > 0) {
    await saveProblems(DEFAULT_PROBLEMS);
    return loadProblems({ seedDefaults: false });
  }

  const loadedProblems = data.map((row) => cloneProblem(fromSupabaseRow(row)));
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

async function saveProblems(problemList) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .upsert(problemList.map(toSupabaseRow), { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function saveProblem(problem) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .upsert(toSupabaseRow(problem), { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return cloneProblem(fromSupabaseRow(data));
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

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
  return supabaseClient;
}

function normalizeProblemLevelGroup(value) {
  const groups = ["입문", "초급", "중급", "고급", "유단자"];
  return groups.includes(value) ? value : "입문";
}

function toSupabaseRow(problem) {
  return {
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
  };
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
  };

  if (clonedProblem.type === "ox") {
    clonedProblem.oxAnswer = Boolean(problem.oxAnswer);
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
