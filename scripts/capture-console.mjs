import { chromium } from "playwright";

const errors = [];
const logs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const client = await page.context().newCDPSession(page);

await client.send("Runtime.enable");

client.on("Runtime.exceptionThrown", (event) => {
  const details = event.exceptionDetails;
  errors.push({
    kind: "cdp",
    text: details.exception?.description ?? details.text,
    url: details.url,
    line: details.lineNumber,
    column: details.columnNumber,
  });
});

page.on("pageerror", (error) => {
  errors.push({ kind: "pageerror", message: error.message, stack: error.stack });
});

page.on("console", (message) => {
  const text = message.text();
  if (message.type() === "error") {
    errors.push({ kind: "console.error", text });
  }
  if (text.includes("[AppInit]") || text.includes("[Bootstrap]")) {
    logs.push(text);
  }
});

await page.goto("http://127.0.0.1:3457/index.html", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem(
    "BADUK_AUTH_USER",
    JSON.stringify({ id: "local-admin", username: "admin", role: "admin" }),
  );
});
await page.goto("http://127.0.0.1:3457/index.html", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);

const title = await page.locator("#problem-title").textContent();
const studyVisible = await page.locator("#study-screen").isVisible();
const listHidden = await page.locator("#problem-list-screen").evaluate((el) =>
  el.classList.contains("is-hidden"),
);
const boardHasCanvas = await page.locator("#board canvas").count();

await page.locator('[data-main-menu="list"]').click();
await page.waitForTimeout(1000);
const listSummary = await page.locator("#list-summary").textContent();
const cardCount = await page.locator(".problem-card").count();

if (cardCount > 0) {
  await page.locator(".problem-card-main").first().click();
  await page.waitForTimeout(1000);
}

const solveTitle = await page.locator("#problem-title").textContent();
const solveBoardCanvas = await page.locator("#board canvas").count();

console.log("--- ERRORS ---");
if (errors.length === 0) {
  console.log("(none)");
} else {
  errors.forEach((entry, index) => {
    console.log(`#${index + 1}`, JSON.stringify(entry, null, 2));
  });
}

console.log("\n--- BOOT LOGS (sample) ---");
logs.slice(-15).forEach((line) => console.log(line));

console.log("\n--- VERIFICATION ---");
console.log("study visible:", studyVisible);
console.log("list hidden (initial):", listHidden);
console.log("hero title:", title);
console.log("board canvas (initial):", boardHasCanvas);
console.log("list summary:", listSummary);
console.log("problem cards:", cardCount);
console.log("solve title after click:", solveTitle);
console.log("solve board canvas:", solveBoardCanvas);

await browser.close();
