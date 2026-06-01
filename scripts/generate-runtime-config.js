const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "js", "runtime-config.js");

const katagoApiUrl =
  process.env.NEXT_PUBLIC_KATAGO_API_URL ||
  process.env.BADUK_AI_API_URL ||
  "";

const katagoRespondApiUrl =
  process.env.KATAGO_RESPOND_API_URL || "/api/katago/respond";

const katagoRespondApiEnabled =
  process.env.KATAGO_RESPOND_API_ENABLED === "true" ||
  process.env.KATAGO_RESPOND_API_ENABLED === "1";

const katagoRespondMaxVisits = Number(process.env.KATAGO_RESPOND_MAX_VISITS) || 8;
const katagoRespondMaxTime = Number(process.env.KATAGO_RESPOND_MAX_TIME) || 0.15;

/** Wrong-reveal KataGo limits — always emitted into runtime-config.js */
const WRONG_REVEAL_DEFAULTS = {
  katagoWrongMaxVisits: 24,
  katagoWrongMaxTime: 0.45,
  katagoWrongReplaceMs: 3000,
};

function resolveWrongRevealNumber(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const katagoWrongMaxVisits = resolveWrongRevealNumber(
  "KATAGO_WRONG_MAX_VISITS",
  WRONG_REVEAL_DEFAULTS.katagoWrongMaxVisits,
);
const katagoWrongMaxTime = resolveWrongRevealNumber(
  "KATAGO_WRONG_MAX_TIME",
  WRONG_REVEAL_DEFAULTS.katagoWrongMaxTime,
);
const katagoWrongReplaceMs = resolveWrongRevealNumber(
  "KATAGO_WRONG_REPLACE_MS",
  WRONG_REVEAL_DEFAULTS.katagoWrongReplaceMs,
);
const wrongRevealLimitsTag = `${katagoWrongMaxVisits}.${katagoWrongMaxTime}.${katagoWrongReplaceMs}`;
const wrongRevealPolicy =
  process.env.WRONG_REVEAL_POLICY === "goal_first"
    ? "goal_first"
    : "katago_filter";
const authorWhiteResponseDelayMs =
  Number(process.env.AUTHOR_WHITE_RESPONSE_DELAY_MS) || 500;

const aiResponseSolveEnabled =
  process.env.AI_RESPONSE_SOLVE_ENABLED !== "false" &&
  process.env.AI_RESPONSE_SOLVE_ENABLED !== "0";

const aiResponseUxEnabled =
  process.env.AI_RESPONSE_UX_ENABLED === "true" ||
  process.env.AI_RESPONSE_UX_ENABLED === "1";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://biprcqrqnizwpxolkfyi.supabase.co";

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_YuonJkHovfeQhOGE3xikIw_P4zbhQqM";

const contents = `(function () {
  window.BadukConfig = {
    katagoApiUrl: ${JSON.stringify(katagoApiUrl)},
    aiResponseUxEnabled: ${aiResponseUxEnabled},
    aiResponseSolveEnabled: ${aiResponseSolveEnabled},
    katagoRespondApiEnabled: ${katagoRespondApiEnabled},
    katagoRespondApiUrl: ${JSON.stringify(katagoRespondApiUrl)},
    katagoRespondAllowMock: false,
    katagoRespondMaxVisits: ${katagoRespondMaxVisits},
    katagoRespondMaxTime: ${katagoRespondMaxTime},
    katagoWrongMaxVisits: ${katagoWrongMaxVisits},
    katagoWrongMaxTime: ${katagoWrongMaxTime},
    katagoWrongReplaceMs: ${katagoWrongReplaceMs},
    wrongRevealLimitsTag: ${JSON.stringify(wrongRevealLimitsTag)},
    wrongRevealPolicy: ${JSON.stringify(wrongRevealPolicy)},
    authorWhiteResponseDelayMs: ${authorWhiteResponseDelayMs},
    supabaseUrl: ${JSON.stringify(supabaseUrl)},
    supabaseKey: ${JSON.stringify(supabaseKey)},
    debugLogs: false,
    debugAuth: false,
  };
})();
`;

fs.writeFileSync(outputPath, contents);

const written = fs.readFileSync(outputPath, "utf8");
const requiredNeedles = [
  `katagoWrongMaxVisits: ${katagoWrongMaxVisits}`,
  `katagoWrongMaxTime: ${katagoWrongMaxTime}`,
  `katagoWrongReplaceMs: ${katagoWrongReplaceMs}`,
  `wrongRevealLimitsTag: ${JSON.stringify(wrongRevealLimitsTag)}`,
  `wrongRevealPolicy: ${JSON.stringify(wrongRevealPolicy)}`,
];
for (const needle of requiredNeedles) {
  if (!written.includes(needle)) {
    throw new Error(
      `runtime-config.js generation failed — missing ${needle}. Check scripts/generate-runtime-config.js`,
    );
  }
}

const katagoServer = process.env.KATAGO_SERVER_URL || "(not set — set on Vercel for /api/katago/respond)";
console.log("Runtime config generated.");
console.log(`  katagoRespondApiEnabled: ${katagoRespondApiEnabled}`);
console.log(`  katagoWrongMaxVisits: ${katagoWrongMaxVisits}`);
console.log(`  katagoWrongMaxTime: ${katagoWrongMaxTime}`);
console.log(`  katagoWrongReplaceMs: ${katagoWrongReplaceMs}`);
console.log(`  wrongRevealLimitsTag: ${wrongRevealLimitsTag}`);
console.log(`  wrongRevealPolicy: ${wrongRevealPolicy}`);
console.log(`  KATAGO_SERVER_URL (Vercel server): ${katagoServer}`);
