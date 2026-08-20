// 《滕县 1938》过场出图：真浏览器跑正片页面，播一场过场，在指定秒数各落一张 PNG。
//
// 这是过场视觉审查的**唯一输入来源**：分镜写在 Data_TengxianScript 里只是一串数字，
// 机位对不对、人有没有背对镜头、天是不是一块亮盘，全都只能靠出图看。
// 可复现：固定视口、固定步长（1/60 s）、不用 Math.random 的抖动。
//
// 用法：
//   node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_Chuchuan [--times=0.5,4,9.2]
//        [--phase=0] [--out=目录] [--quality=high] [--every=1.5] [--width=1600] [--height=900]
//
//   --cut     过场 id（CUTSCENES 的键）；可逗号分隔多场，或 all
//   --times   要落图的过场秒数（全局时间，不是镜内时间）。不给就按 --every 等间隔，
//             默认每镜的开头 +0.4 s 与镜中各一张
//   --phase   先进哪一关再播（决定脚下是哪一块战场 / 哪一种天空）。
//             不给就按过场的 trigger 推：beforeLevel:Li → 第 i-1 关（i=0 时第 0 关），
//             afterLevel:Li → 第 i 关 —— 与正片里真正播它时脚下的场一致。
//   --out     输出目录，默认 Taierzhuang1938/_shots/cutscene/（已 gitignore）
//
// 每张图落盘后，顺带把 director 到那一刻为止的字幕/台词日志打印出来，
// 不看图也能核对「这一秒该出的字出了没有」。

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { CUTSCENES, CUTSCENE_ORDER, LEVELS } from "./Data_TengxianScript.mjs";
import { ValidateCutscene, LintCutscene } from "./Script_CutsceneCheck.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith("--"))
  .map((a) => { const i = a.indexOf("="); return i < 0 ? [a.slice(2), "1"] : [a.slice(2, i), a.slice(i + 1)]; }));

const cutArg = args.cut || "all";
const cutIds = cutArg === "all" ? CUTSCENE_ORDER.slice() : cutArg.split(",").map((s) => s.trim()).filter(Boolean);
for (const id of cutIds) {
  if (!CUTSCENES[id]) { console.error(`没有这场过场：${id}（可选：${CUTSCENE_ORDER.join(" / ")}）`); process.exit(2); }
}
const outDir = path.resolve(args.out || path.join(projectDir, "_shots", "cutscene"));
fs.mkdirSync(outDir, { recursive: true });
const quality = args.quality || "high";
const VIEWPORT = { width: parseInt(args.width || "1600", 10), height: parseInt(args.height || "900", 10) };

/** 过场在正片里播的时候脚下是哪一关的场。 */
function DefaultPhase(cut) {
  const m = /^(beforeLevel|afterLevel):(\w+)$/.exec(cut.trigger || "");
  if (!m) return 0;
  const index = LEVELS.findIndex((l) => l.id === m[2]);
  if (index < 0) return 0;
  return m[1] === "beforeLevel" ? Math.max(0, index - 1) : index;
}

/** 没给 --times 时的默认采样：每镜开头 +0.4 s 与镜中各一张。 */
function DefaultTimes(cut) {
  if (args.every) {
    const step = Math.max(0.25, parseFloat(args.every));
    const list = [];
    for (let t = 0.4; t < cut.seconds - 0.05; t += step) list.push(Number(t.toFixed(2)));
    return list;
  }
  const list = [];
  let at = 0;
  for (const s of cut.shots) {
    list.push(Number((at + Math.min(0.4, s.seconds * 0.3)).toFixed(2)));
    if (s.seconds >= 2.5) list.push(Number((at + s.seconds * 0.55).toFixed(2)));
    at += s.seconds;
  }
  return list;
}

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

let allOk = true;
for (const id of cutIds) {
  const cut = CUTSCENES[id];
  const phase = args.phase !== undefined ? parseInt(args.phase, 10) : DefaultPhase(cut);
  const times = (args.times ? args.times.split(",").map(Number).filter((n) => Number.isFinite(n)) : DefaultTimes(cut))
    .map((t) => Math.max(0, Math.min(cut.seconds - 0.02, t)))
    .sort((a, b) => a - b);
  problems.length = 0;
  const url = `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=${phase}&quality=${quality}&scale=medium`;
  console.log(`\n== ${id}「${cut.title}」 ${cut.seconds}s · ${cut.shots.length} 镜 · 第 ${phase} 关的场 · ${times.length} 张`);
  // 先过一遍数据自检：硬错 Play() 会直接抛，软错（字幕读不完、滑步）在这里提醒
  const hard = ValidateCutscene(cut);
  for (const p of hard) console.log(`  ✗ ${p}`);
  for (const w of LintCutscene(cut)) console.log(`  ! ${w}`);
  if (hard.length) { allOk = false; continue; }
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 120000 });
    // 先让战场跑活、后期历史稳住
    await page.evaluate(() => window.Taierzhuang.StepFrames(90));
    await page.waitForTimeout(400);
    // **把页面自己的 rAF 主循环停掉**（Loop 见 state.running 为假就不推帧）。
    // 出图模式一进页面就 StartRun 了，主循环按真实时间在跑 —— 不停的话
    // 每次 evaluate 之间过场都会偷偷前进零点几秒，落图的「t」就不是真的 t。
    await page.evaluate(() => { window.Taierzhuang.state.running = false; });
    // afterLevel 的过场在正片里播的时候这一关已经打完：路标全到了（常驻烟柱不再挂在
    // 未到达的路标上）、场上的 AI 不会正好冻在开局的集结点。出图照这个状态摆：
    // 路标标成 reached、AI 藏起来 —— 不然十字街口那根黑烟柱会横在每一镜里。
    if (/^afterLevel:/.test(cut.trigger || "")) {
      await page.evaluate(() => {
        const D = window.Taierzhuang;
        for (const o of (D.ai && D.ai.ctx && D.ai.ctx.battlefield ? D.ai.ctx.battlefield.objectives : []) || []) o.reached = true;
        for (const sd of (D.ai && D.ai.soldiers) || []) { if (sd.actor && sd.actor.root) sd.actor.root.visible = false; }
        for (const handle of D.state.smokeHandles || []) D.vfx.RemoveSmokeSource(handle);
        D.state.smokeHandles.length = 0;
      });
    }
    const started = await page.evaluate((cutId) => {
      const D = window.Taierzhuang;
      try {
        D.Debug.PlayCutscene(cutId).catch(() => null);
        return { ok: D.Debug.Cutscene().playing, error: null };
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) };
      }
    }, id);
    if (!started.ok) {
      console.log(`ERR  ${id}: 过场没播起来 —— ${started.error || "未知原因"}`);
      allOk = false;
      continue;
    }
    let logged = 0;
    let now = 0;
    for (const t of times) {
      // 推到 t：逻辑帧不渲染（快），最后三帧渲染（把运动模糊/AO 历史刷到这一刻）
      const steps = Math.max(0, Math.round((t - now) * 60) - 3);
      await page.evaluate((n) => window.Taierzhuang.StepFrames(n, 1 / 60, false), steps);
      await page.evaluate(() => window.Taierzhuang.StepFrames(3, 1 / 60, true));
      await page.waitForTimeout(120);
      now = t;
      const info = await page.evaluate(() => {
        const c = window.Taierzhuang.Debug.Cutscene();
        const cam = window.Taierzhuang.camera;
        return {
          playing: c.playing, time: c.time, log: c.log,
          cam: cam ? [cam.position.x, cam.position.y, cam.position.z].map((v) => v.toFixed(2)).join(",") : "?",
          fov: cam ? cam.fov.toFixed(1) : "?",
        };
      });
      const file = path.join(outDir, `${id}_t${t.toFixed(1).padStart(5, "0")}.png`);
      await page.screenshot({ path: file });
      const size = fs.statSync(file).size;
      // 当前镜
      let at = 0, shotN = "?";
      for (const s of cut.shots) { if (t < at + s.seconds) { shotN = s.n; break; } at += s.seconds; }
      console.log(`  t=${t.toFixed(1).padStart(5)}  镜${String(shotN).padEnd(2)} cam=(${info.cam}) fov=${info.fov}  ${(size / 1024).toFixed(0)}KB  ${path.basename(file)}`);
      for (const entry of (info.log || []).slice(logged)) {
        const who = entry.who ? `${entry.who}：` : (entry.kind === "sub" ? "〔字幕〕" : "");
        console.log(`           ↳ 镜${entry.shot} ${who}${entry.text}`);
      }
      logged = (info.log || []).length;
      if (!info.playing) { console.log("           （过场已结束）"); break; }
    }
    if (problems.length) {
      allOk = false;
      for (const p of problems.slice(0, 6)) console.log(`  ${p}`);
    }
  } catch (error) {
    console.log(`ERR  ${id}: ${String(error).slice(0, 240)}`);
    allOk = false;
  }
}

await browser.close();
server.close();
console.log(allOk ? `\n出图完成，无报错。目录：${outDir}` : `\n出图完成，但有报错，见上。目录：${outDir}`);
process.exit(allOk ? 0 : 1);
