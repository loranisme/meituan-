/**
 * Static + optional browser smoke for 走起不 demo.
 * Run: node scripts/smoke-test.mjs
 * Browser (needs server): node scripts/browser-smoke.mjs
 */
import { readFileSync } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
}
function fail(label, detail = "") {
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  failed += 1;
}

console.log("smoke-test: static checks");

for (const f of ["app.js", "mockData.js", "index.html", "style.css", "utils/matching.js"]) {
  try {
    readFileSync(join(root, f), "utf8");
    ok(`file ${f}`);
  } catch {
    fail(`missing ${f}`);
  }
}

const appSrc = readFileSync(join(root, "app.js"), "utf8");
const htmlSrc = readFileSync(join(root, "index.html"), "utf8");
const mockSrc = readFileSync(join(root, "mockData.js"), "utf8");

if (!appSrc.includes("function initMockMap()")) fail("initMockMap broken");
else ok("initMockMap exists");

if (!appSrc.includes("function renderCirclePage()")) fail("renderCirclePage missing");
else ok("renderCirclePage exists");

if (!appSrc.includes("走起不") && !htmlSrc.includes("走起不")) fail("brand 走起不 not found");
else ok("brand 走起不 present");

if (!mockSrc.includes("lifeCircles")) fail("lifeCircles missing in mockData");
else ok("lifeCircles in mockData");

if (!mockSrc.includes("brand")) fail("brand config missing");
else ok("brand config in mockData");

if (htmlSrc.includes("凑局") || htmlSrc.includes("恰好")) fail("old brand name still in HTML");
else ok("no stale brand names in HTML");

if (!appSrc.includes("browseRadiusKm")) fail("browseRadiusKm state missing");
else ok("browseRadiusKm wired");

if (!appSrc.includes("function refreshMapSupply()")) fail("refreshMapSupply missing");
else ok("refreshMapSupply helper");

const runBrowser = process.env.SKIP_BROWSER !== "1";
if (runBrowser) {
  console.log("\nsmoke-test: browser (playwright)");
  const server = spawn("python3", ["server.py"], { cwd: root, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  try {
    const { execSync } = await import("child_process");
    execSync("node scripts/browser-smoke.mjs", {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, BASE_URL: "http://127.0.0.1:8000" }
    });
    ok("browser-smoke passed");
  } catch (e) {
    fail("browser-smoke", e.message || "exit non-zero");
  } finally {
    server.kill("SIGTERM");
  }
} else {
  console.log("\n(smoke-test: SKIP_BROWSER=1, browser skipped)");
}

console.log(failed ? `\nsmoke-test FAILED (${failed})` : "\nsmoke-test: all OK");
process.exit(failed ? 1 : 0);
