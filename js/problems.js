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

const problems = [];
const SUPABASE_PROBLEMS_TABLE = "problems";

const ProblemStore = {
  getDefaultProblems,
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

  return data.map(fromSupabaseRow);
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

  return fromSupabaseRow(data);
}

async function deleteProblem(problemId) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(SUPABASE_PROBLEMS_TABLE)
    .delete()
    .eq("id", problemId);

  if (error) {
    throw error;
  }
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

function toSupabaseRow(problem) {
  return {
    id: problem.id,
    title: problem.title,
    description: problem.description,
    level: problem.level ?? "",
    category: problem.category,
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
    category: row.category,
    stones: row.stones ?? [],
    correctMove: row.correct_move,
  };

  if (Array.isArray(row.correct_sequence)) {
    problem.correctSequence = row.correct_sequence;
  }

  return problem;
}

function cloneProblem(problem) {
  return {
    ...problem,
    correctMove: problem.correctMove ? { ...problem.correctMove } : null,
    correctSequence: Array.isArray(problem.correctSequence)
      ? problem.correctSequence.map((move) => ({ ...move }))
      : undefined,
    stones: Array.isArray(problem.stones)
      ? problem.stones.map((stone) => ({ ...stone }))
      : [],
  };
}

window.BadukProblems = {
  BOARD_SIZE,
  STONE,
  problems,
  ProblemStore,
};
})();
