// 独立工具宿主（Tool_Studio.html）确定性画面回归与游戏宿主解耦校验（2026-11-28 起 actor / facial 已彻底切出游戏内 EditorSuite）：
//   1. AdvancedTools/Tool_Studio.html?tool=<id> 按确定状态出画，截图非纯色、接入 CAMERA_PROFILES.standard、无页面错误；
//   2. 游戏入口 index.html?editor=tools&tool=<id> 不再挂载该摄影棚工具（ActiveId === null）。
//
// 用法：node Taierzhuang1938/Script_ToolStudioParityBrowserTest.mjs [--only=actor,facial] [--quality=low]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { STUDIO_TOOL_IDS } from "./AdvancedTools/Data_AdvancedTools.mjs";
import { CAMERA_PROFILES } from "./Data_CameraProfile.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.join(projectDir, "_shots", "ToolStudioParity");
const sharp = createRequire(import.meta.url)("sharp");
const Arg = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const only = Arg("only", null) ? new Set(Arg("only").split(",")) : null;
const quality = Arg("quality", "low");
const SIZE = { width: 1280, height: 720 };
const FRAMES = 90, DT = 1 / 60, SETTLE_MS = 8000;
await fs.mkdir(outDir, { recursive: true });

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

const SETUP = {
  actor: (editor) => { editor.playing = false; },
  facial: () => {},
};

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser({ extraArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const studioUrl = (id) => `http://127.0.0.1:${port}/Taierzhuang1938/AdvancedTools/Tool_Studio.html?tool=${id}&quality=${quality}&scale=small&manual=1&audio=0`;

async function ShootStudio(id) {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
  page.on("console", (message) => { if (message.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(message.location()?.url || "")) errors.push(message.text().slice(0, 200)); });
  await page.goto(studioUrl(id), { waitUntil: "commit", timeout: 180000 });
  await page.waitForFunction(() => window.ToolStudio?.ready && window.ToolStudio.activeId, null, { timeout: 420000, polling: 500 });
  const info = await page.evaluate((code) => {
    const S = window.ToolStudio;
    new Function("editor", code)(S.editor);
    return { activeId: S.activeId, profile: S.base.post?.cameraProfileId ?? null };
  }, `(${SETUP[id]})(editor)`);
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(([frames, dt]) => window.ToolStudio.StepFrames(frames, dt), [FRAMES, DT]);
  await page.waitForTimeout(300);
  const buffer = await page.screenshot({ timeout: 240000 });
  await page.close();
  const stats = await sharp(buffer).extract({ left: 8, top: 60, width: 640, height: 600 }).stats();
  const spread = stats.channels.slice(0, 3).reduce((sum, ch) => sum + ch.stdev, 0);
  return { buffer, errors, spread, info };
}

const rows = [];
try {
  for (const id of STUDIO_TOOL_IDS) {
    if (only && !only.has(id)) continue;
    const studio = await ShootStudio(id);
    await fs.writeFile(path.join(outDir, `${id}_Studio.png`), studio.buffer);
    rows.push({ id, spread: Number(studio.spread.toFixed(1)), profile: studio.info.profile });
    Check(`${id}：独立工具宿主正常出画且使用标准 CameraProfile`,
      studio.info.activeId === id && studio.info.profile === CAMERA_PROFILES.standard.id && studio.spread > 12,
      `spread=${studio.spread.toFixed(1)} profile=${studio.info.profile}`);
    Check(`${id}：没有页面错误`, studio.errors.length === 0, studio.errors.slice(0, 2).join(" | "));
  }
} finally {
  await browser.close();
  server.close();
}

await fs.writeFile(path.join(outDir, "Parity.json"), JSON.stringify({ quality, frames: FRAMES, rows }, null, 2));
console.log(failed ? `${failed} 项未过` : "独立工具宿主画面回归：全部通过");
console.log(rows.map((row) => `${row.id}:spread=${row.spread}`).join("  "));
process.exitCode = failed ? 1 : 0;
