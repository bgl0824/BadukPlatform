const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "auth.html",
  "index.html",
  "signup.html",
  "styles.css",
  "vendor/wgo.min.js",
  "vendor/wood1.jpg",
  "favicon.svg",
  "js/runtime-config.js",
  "js/problems.js",
  "js/ai-response.js",
  "js/sgf.js",
  "js/board.js",
  "js/auth.js",
  "js/services/auth-service.js",
  "js/services/supabase-client.js",
  "js/permissions/permission-service.js",
  "js/main.js",
  "backend/katago-api/server.js",
  "api/katago/respond.js",
  "api/lib/katago-respond-core.js",
];

const scriptFiles = [
  "js/problems.js",
  "js/runtime-config.js",
  "js/ai-response.js",
  "js/sgf.js",
  "js/board.js",
  "js/services/auth-service.js",
  "js/services/supabase-client.js",
  "js/auth.js",
  "js/main.js",
  "api/katago/respond.js",
  "api/lib/katago-respond-core.js",
];

const authMarkers = [
  { file: "js/services/auth-service.js", includes: 'USERNAME_AUTH_EMAIL_DOMAIN = "baduk.app"' },
  { file: "js/services/auth-service.js", includes: "usernameToAuthEmail" },
  { file: "js/services/auth-service.js", includes: "is_auth_username_available" },
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

for (const file of requiredFiles) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

for (const file of scriptFiles) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], {
    stdio: "inherit",
  });
}

const html = readProjectFile("index.html");
if (!html.includes("./vendor/wgo.min.js")) {
  throw new Error("index.html must load the local WGo.js bundle for production.");
}

const wgoBundle = readProjectFile("vendor/wgo.min.js");
if (!wgoBundle.includes("WGo")) {
  throw new Error("vendor/wgo.min.js does not look like a WGo.js bundle.");
}

for (const marker of authMarkers) {
  const source = readProjectFile(marker.file);
  if (!source.includes(marker.includes)) {
    throw new Error(`Auth deploy marker missing in ${marker.file}: ${marker.includes}`);
  }
}

const runtimeConfig = readProjectFile("js/runtime-config.js");
const katagoClient = readProjectFile("js/solve/ai-response-solve/katago-respond-client.js");
const tacticalEngine = readProjectFile("js/solve/ai-response-solve/tactical-response-engine.js");
const katagoCore = readProjectFile("api/lib/katago-respond-core.js");
const katagoRespondApi = readProjectFile("api/katago/respond.js");
const boardStateAudit = readProjectFile("js/solve/ai-response-solve/board-state-audit.js");

for (const needle of [
  "export function auditKatagoStonesParity",
  "export function buildBoardStateHash",
  "[KatagoRespond] stones parity audit",
  "katagoReplayMatchesPayload",
  "lastBlackMoveCapture",
]) {
  if (!boardStateAudit.includes(needle)) {
    throw new Error(`board-state-audit.js missing ${needle}`);
  }
}

for (const needle of [
  "katagoWrongMaxVisits: 24",
  "katagoWrongMaxTime: 0.45",
  "katagoWrongReplaceMs: 3000",
  'wrongRevealLimitsTag: "24.0.45.3000"',
]) {
  if (!runtimeConfig.includes(needle)) {
    throw new Error(`js/runtime-config.js missing ${needle} — run npm run build`);
  }
}

for (const needle of [
  "const WRONG_KATAGO_MAX_VISITS = 24",
  "const WRONG_KATAGO_MAX_TIME = 0.45",
  'WRONG_REVEAL_LIMITS_TAG = "24.0.45.3000"',
  'KATAGO_SELECTION_LOG_TAG = "katago-candidate-selection-v1"',
  "[KatagoRespond] client module loaded",
  "wrongRevealResolveTrace",
  "SELECTED_SOURCE_KATAGO",
  "SELECTED_SOURCE_KATAGO_TACTICAL_BOOST",
  "selectWrongRevealKatagoFirstMove",
  "[KatagoRespond] katago candidate selection",
  'console.warn("[KatagoRespond] katago candidate selection"',
  "resolveKatagoCandidatePoint",
  "upstream HTTP error detail",
  "requestBoardSize",
  "replace window expired before KataGo finished",
  "auditKatagoStonesParity",
]) {
  if (!katagoClient.includes(needle)) {
    throw new Error(`katago-respond-client.js missing ${needle}`);
  }
}

for (const needle of [
  "export function selectWrongRevealKatagoFirstMove",
  "export const WRONG_REVEAL_KATAGO_TOP_N = 5",
  "[KatagoRespond] wrong reveal katago-first selection",
  "[KatagoRespond] wrong reveal selection trace",
  "[KatagoRespond] katago top region diagnostic",
  "[KatagoRespond] raw in-region candidates",
  "katago_full_raw_in_region",
  "export function diagnoseWrongRevealCandidateScoreable",
  "boardStateHash",
  "import { buildBoardStateHash } from \"./board-state-audit.js\"",
  "parsedX",
  "coordMismatch",
  "formatScoreableCheckForLog",
  "logKatagoTopScoreableCheck",
  'console.warn("[KatagoRespond] katago top scoreable check"',
]) {
  if (!tacticalEngine.includes(needle)) {
    throw new Error(`tactical-response-engine.js missing ${needle}`);
  }
}

for (const needle of [
  "const WRONG_REVEAL_MAX_VISITS = 24",
  "const WRONG_REVEAL_MAX_TIME = 0.45",
  "katagoBoardXSize: boardSize",
  "produceKatagoRespond",
  "boardInputAudit",
  "buildKatagoInputAudit",
]) {
  if (!katagoCore.includes(needle)) {
    throw new Error(`katago-respond-core.js missing ${needle}`);
  }
}

for (const needle of ["[api/katago/respond] request", "[api/katago/respond] failed"]) {
  if (!katagoRespondApi.includes(needle)) {
    throw new Error(`api/katago/respond.js missing ${needle}`);
  }
}

console.log("BadukPlatform static build check passed.");
console.log("Auth bundle ready for Vercel (baduk.app virtual email).");
