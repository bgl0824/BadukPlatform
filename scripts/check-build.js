const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "index.html",
  "styles.css",
  "vendor/wgo.min.js",
  "js/problems.js",
  "js/ai-response.js",
  "js/sgf.js",
  "js/board.js",
  "js/main.js",
];

const scriptFiles = [
  "js/problems.js",
  "js/ai-response.js",
  "js/sgf.js",
  "js/board.js",
  "js/main.js",
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

console.log("BadukPlatform static build check passed.");
