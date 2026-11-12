// 独立工具宿主与游戏宿主的画面对照：同一个工具、同一个确定状态，分别在
//   游戏宿主   index.html?editor=tools&tool=<id>
//   独立宿主   AdvancedTools/Tool_Studio.html?tool=<id>
// 里出画，逐像素比对整张页面截图（画布 + 菜单栏 + Inspector），每个工具的平均绝对像素差必须 ≤ 2/255。
// 阈值不放宽：超了就是两边装配出现了真实差别（光照 / 材质 / 后处理 / 布景），要去对 Script_ToolStudioRenderBase。
//
// 两边都 manual=1（时钟归测试）：开工具、按各工具的「确定状态」摆好，再各自 StepFrames 同样的帧数与步长后截图。
// 输出：_shots/ToolStudioParity/<id>_Game.png / _Studio.png / <id>_Diff.png，以及 Contact.png（对照联系表：左游戏右独立，整张长边 ≤ 640 px）
// 和 Parity.json（各工具差值）。
//
// 用法：node Taierzhuang1938/Script_ToolStudioParityBrowserTest.mjs [--only=actor,vfx] [--quality=low] [--threshold=2]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { STUDIO_TOOL_IDS } from "./AdvancedTools/Data_AdvancedTools.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outDir = path.join(projectDir, "_shots", "ToolStudioParity");
const sharp = createRequire(import.meta.url)("sharp");
const Arg = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const only = Arg("only", null) ? new Set(Arg("only").split(",")) : null;
const quality = Arg("quality", "low");
const threshold = Number(Arg("threshold", 2));
const SIZE = { width: 1280, height: 720 };
const FRAMES = 90, DT = 1 / 60, SETTLE_MS = 12000;
await fs.mkdir(outDir, { recursive: true });

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

/**
 * 每个工具的「确定状态」：两边都用同一段页面内脚本摆（editor 是各自宿主里的当前编辑器实例）。
 * 目标是让画面只取决于摆法，不取决于开页以来过了多久：动画停在固定一帧、不播的东西不播。
 */
const SETUP = {
  actor: (editor) => { editor.playing = false; },
  facial: () => {},
  squadMarch: () => {},
  weapon: () => {},
  firstPerson: () => {},
  vfx: (editor) => { editor.playing = false; },
  audio: () => {},
  props: () => {},
  assetStandards: () => {},
};

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser({ extraArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const gameUrl = (id) => `http://127.0.0.1:${port}/Taierzhuang1938/index.html?editor=tools&tool=${id}&quality=${quality}&scale=small&manual=1&audio=0`;
const studioUrl = (id) => `http://127.0.0.1:${port}/Taierzhuang1938/AdvancedTools/Tool_Studio.html?tool=${id}&quality=${quality}&scale=small&manual=1&audio=0`;

async function Shoot(url, host, id) {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
  page.on("console", (message) => { if (message.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(message.location()?.url || "")) errors.push(message.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: "commit", timeout: 180000 });
  const ready = host === "game"
    ? () => window.Tengxian?.state?.ready && window.Tengxian.editor?.ActiveId
    : () => window.ToolStudio?.ready && window.ToolStudio.activeId;
  await page.waitForFunction(ready, null, { timeout: 420000, polling: 500 });
  await page.evaluate(([code, which]) => {
    const editor = which === "game" ? window.Tengxian.editor.active : window.ToolStudio.editor;
    new Function("editor", code)(editor);
  }, [`(${SETUP[id]})(editor)`, host]);
  // 模型 / 贴图的异步加载按真实时间走（游戏宿主那边更慢）：先等它落定，再按帧数步进，两边才是同一个状态
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(([which, frames, dt]) => (which === "game" ? window.Tengxian.StepFrames(frames, dt) : window.ToolStudio.StepFrames(frames, dt)), [host, FRAMES, DT]);
  await page.waitForTimeout(300);
  const buffer = await page.screenshot({ timeout: 240000 });
  await page.close();
  return { buffer, errors };
}

/** 平均绝对像素差（0–255，RGB 三通道的平均）。 */
async function MeanAbsDiff(a, b) {
  const left = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const diff = Buffer.alloc(left.data.length);
  let sum = 0;
  for (let i = 0; i < left.data.length; i += 1) {
    const d = Math.abs(left.data[i] - right.data[i]);
    sum += d;
    diff[i] = Math.min(255, d * 8);
  }
  return { mean: sum / left.data.length, diff, info: left.info };
}

const rows = [];
try {
  for (const id of STUDIO_TOOL_IDS) {
    if (only && !only.has(id)) continue;
    const game = await Shoot(gameUrl(id), "game", id);
    const studio = await Shoot(studioUrl(id), "studio", id);
    const { mean, diff, info } = await MeanAbsDiff(game.buffer, studio.buffer);
    await fs.writeFile(path.join(outDir, `${id}_Game.png`), game.buffer);
    await fs.writeFile(path.join(outDir, `${id}_Studio.png`), studio.buffer);
    await sharp(diff, { raw: info }).png().toFile(path.join(outDir, `${id}_Diff.png`));
    rows.push({ id, mean: Number(mean.toFixed(3)) });
    Check(`${id}：独立宿主与游戏宿主画面平均绝对差 ≤ ${threshold}/255`, mean <= threshold, `${mean.toFixed(3)}/255`);
    Check(`${id}：两边都没有页面错误`, game.errors.length === 0 && studio.errors.length === 0, [...game.errors, ...studio.errors].slice(0, 2).join(" | "));
  }
} finally {
  await browser.close();
  server.close();
}

await fs.writeFile(path.join(outDir, "Parity.json"), JSON.stringify({ quality, frames: FRAMES, threshold, rows }, null, 2));
// 联系表：三列三行，每格 [游戏 | 独立]，整张长边 ≤ 640 px（按格子缩小）；另给每个工具一张 640×180 的左右对照 Pair_<id>.png
if (rows.length) {
  const COLS = 3, cellW = 106, cellH = 60, gap = 1;
  const rowsOfCells = Math.ceil(rows.length / COLS);
  const width = COLS * (cellW * 2 + gap) - gap, height = rowsOfCells * (cellH + gap) - gap;
  const composites = [];
  for (const [index, row] of rows.entries()) {
    const left = (index % COLS) * (cellW * 2 + gap), top = Math.floor(index / COLS) * (cellH + gap);
    for (const [col, host] of ["Game", "Studio"].entries()) {
      composites.push({ input: await sharp(path.join(outDir, `${row.id}_${host}.png`)).resize(cellW, cellH).toBuffer(), left: left + col * cellW, top });
    }
    await sharp({ create: { width: 640, height: 180, channels: 3, background: "#000" } }).composite([
      { input: await sharp(path.join(outDir, `${row.id}_Game.png`)).resize(320, 180).toBuffer(), left: 0, top: 0 },
      { input: await sharp(path.join(outDir, `${row.id}_Studio.png`)).resize(320, 180).toBuffer(), left: 320, top: 0 },
    ]).png().toFile(path.join(outDir, `Pair_${row.id}.png`));
  }
  await sharp({ create: { width, height, channels: 3, background: "#000" } }).composite(composites).png().toFile(path.join(outDir, "Contact.png"));
}

console.log(failed ? `${failed} 项未过` : "独立宿主画面对照：全部通过");
console.log(rows.map((row) => `${row.id}=${row.mean}`).join("  "));
process.exitCode = failed ? 1 : 0;
