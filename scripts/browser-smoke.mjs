/**
 * Headless smoke: load app, run rule-layer AI match, open chat, reject rematch.
 * Run: node scripts/browser-smoke.mjs  (requires: npx playwright install chromium once)
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8000";
const errors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() => window.MatchingUtils && window.mockData, null, { timeout: 10000 });

  const initOk = await page.evaluate(() => {
    const s = window.appState;
    return !!(s && s.currentPage === "map" && document.querySelector("#mapPage"));
  });
  if (!initOk) throw new Error("init failed");

  await page.click('.nav-item[data-page="ai"]');
  await page.waitForFunction(
    () => document.getElementById("aiPage")?.classList.contains("block") && document.getElementById("runAIButton"),
    null,
    { timeout: 8000 }
  );
  await page.click("#runAIButton");
  await page.waitForFunction(
    () => window.appState && !window.appState.aiLoading && window.appState.matchResults.length > 0,
    null,
    { timeout: 25000 }
  );

  const matchCount = await page.evaluate(() => window.appState.matchResults.length);
  if (!matchCount) throw new Error("no match results after runAI");

  await page.click("[data-select-match='0']");
  await page.waitForFunction(() => window.appState.currentPage === "chat", null, { timeout: 8000 });

  await page.click("#simulateReject");
  await page.waitForFunction(
    () => window.appState.planStatus === "fallback_ready" || window.appState.fallbackSuggestion,
    null,
    { timeout: 12000 }
  );

  const rejectState = await page.evaluate(() => ({
    planStatus: window.appState.planStatus,
    hasFallback: !!window.appState.pendingFallbackMatch,
    msgCount: window.appState.chatThread?.messages?.length || 0
  }));
  if (!rejectState.hasFallback && rejectState.planStatus !== "fallback_ready") {
    throw new Error(`reject flow weak: ${JSON.stringify(rejectState)}`);
  }

  await page.goto(`${BASE}/?script=reject`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(
    () => window.appState && (window.appState.planStatus === "fallback_ready" || window.appState.lastRejectRematch),
    null,
    { timeout: 35000 }
  );

  await browser.close();

  const bad = errors.filter((e) => !/MatchingUtils|favicon|404|503|ai-match|Service Unavailable/.test(e));
  if (bad.length) {
    console.error("Browser errors:", bad.join("\n"));
    process.exit(2);
  }
  console.log("browser-smoke: OK");
}

main().catch((e) => {
  console.error("browser-smoke FAIL:", e.message);
  process.exit(1);
});
