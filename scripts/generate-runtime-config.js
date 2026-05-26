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

const katagoRespondMaxVisits = Number(process.env.KATAGO_RESPOND_MAX_VISITS) || 50;

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
    supabaseUrl: ${JSON.stringify(supabaseUrl)},
    supabaseKey: ${JSON.stringify(supabaseKey)},
    debugLogs: false,
    debugAuth: false,
  };
})();
`;

fs.writeFileSync(outputPath, contents);

const katagoServer = process.env.KATAGO_SERVER_URL || "(not set — set on Vercel for /api/katago/respond)";
console.log("Runtime config generated.");
console.log(`  katagoRespondApiEnabled: ${katagoRespondApiEnabled}`);
console.log(`  katagoRespondApiUrl: ${katagoRespondApiUrl}`);
console.log(`  KATAGO_SERVER_URL (Vercel server): ${katagoServer}`);
