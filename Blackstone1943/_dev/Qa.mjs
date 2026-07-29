// Blackstone1943 视觉/运行时 QA 探针（开发工具，不参与游戏运行）
//
// 依赖：npm i -D playwright        （或 playwright-core + 自备 Chrome 路径）
//
// 用法（在仓库根目录或任意目录都行）：
//   node Blackstone1943/_dev/Qa.mjs
//   node Blackstone1943/_dev/Qa.mjs --steps "wait:2500;shot:Title;click:#BeginButton;wait:3500;shot:Game;key:w:1500;shot:Walk"
//   node Blackstone1943/_dev/Qa.mjs --width 1920 --height 1080 --out ./shots
//
// 步骤语法：
//   wait:<ms>              等待
//   key:<键>:<按住ms>      按住某键一段时间（w / Shift / Space...）
//   tap:<键>               点按一次
//   click:<CSS选择器>      点击 DOM
//   move:<dx>:<dy>         拖动鼠标转视角
//   shot:<名字>            截图（PNG 落到 --out 目录）
//   eval:<js>              在页面里执行一段 JS
//
// 输出：一段 JSON —— consoleErrors / pageErrors / requestFails / stats(window.__Blackstone.debug)
// 环境变量：
//   CHROME_PATH   指定浏览器可执行文件（不设则用 playwright 自带的 chromium）
//   SITE_ROOT     指定站点根目录（不设则自动取本文件的上上级 = 仓库根）

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SITE_ROOT || path.resolve(here, "..", "..");

// playwright / playwright-core 都行；优先从站点根的 node_modules 解析
function LoadPlaywright() {
  const require = createRequire(pathToFileURL(path.join(ROOT, "package.json")));
  for (const name of ["playwright", "playwright-core"]) {
    try { return require(name); } catch { /* 继续试下一个 */ }
  }
  throw new Error("找不到 playwright，请先在仓库根目录跑：npm i -D playwright");
}
const { chromium } = LoadPlaywright();

const argv = process.argv.slice(2);
function Arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const outDir = path.resolve(Arg("out", path.join(here, "shots")));
const width = Number(Arg("width", 1600));
const height = Number(Arg("height", 900));
const pageUrlPath = Arg("path", "/Blackstone1943/");
const steps = Arg(
  "steps",
  "wait:2500;shot:Title;click:#BeginButton;wait:3500;shot:GameBoot;key:w:1500;shot:Walk;move:220:0;wait:600;shot:Look;key:Shift:900;shot:Run;tap:c;wait:600;shot:Crouch",
);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(ROOT, urlPath);
  if (urlPath.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!path.resolve(filePath).startsWith(path.resolve(ROOT))) { res.writeHead(403).end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404).end("not found: " + urlPath); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
fs.mkdirSync(outDir, { recursive: true });

const launchOptions = {
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
};
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
const requestFails = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400)); });
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 400)));
page.on("requestfailed", (r) => requestFails.push(`${r.url().slice(-80)} :: ${r.failure()?.errorText}`));

const shots = [];
try {
  await page.goto(`http://127.0.0.1:${port}${pageUrlPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  for (const raw of steps.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [op, a, b] = raw.split(":");
    try {
      if (op === "wait") await page.waitForTimeout(Number(a));
      else if (op === "key") { await page.keyboard.down(a); await page.waitForTimeout(Number(b || 800)); await page.keyboard.up(a); }
      else if (op === "tap") await page.keyboard.press(a);
      else if (op === "click") await page.click(a, { timeout: 5000 }).catch(() => page.evaluate((s) => document.querySelector(s)?.click(), a));
      else if (op === "move") { await page.mouse.move(width / 2, height / 2); await page.mouse.down().catch(() => {}); await page.mouse.move(width / 2 + Number(a), height / 2 + Number(b), { steps: 12 }); await page.mouse.up().catch(() => {}); }
      else if (op === "eval") await page.evaluate(raw.slice(5));
      else if (op === "shot") { const p = path.join(outDir, `${a}.png`); await page.screenshot({ path: p }); shots.push(p); }
    } catch (e) { pageErrors.push(`step ${raw} failed: ${String(e).slice(0, 200)}`); }
  }
  const stats = await page.evaluate(() => {
    const debug = window.__Blackstone?.debug ?? null;
    const canvas = document.querySelector("canvas");
    return { hasCanvas: !!canvas, canvasSize: canvas ? [canvas.width, canvas.height] : null, debug: debug ? JSON.parse(JSON.stringify(debug)) : null };
  }).catch(() => ({}));
  console.log(JSON.stringify({ ok: pageErrors.length === 0 && consoleErrors.length === 0, shots, consoleErrors, pageErrors, requestFails, stats }, null, 2));
} finally {
  await browser.close();
  server.close();
}
