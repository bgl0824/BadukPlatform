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

console.log("BadukPlatform static build check passed.");
console.log("Auth bundle ready for Vercel (baduk.app virtual email).");
