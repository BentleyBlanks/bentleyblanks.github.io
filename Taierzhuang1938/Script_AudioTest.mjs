// 《滕县 一九三八》音频冒烟：真浏览器里把实录采样包载进去，逐条播一遍。
//
// 为什么单开一层：音效的失败是**静默**的 ——
//   · 采样 404 了，LoadSfxPack 吞掉异常退回合成，画面照跑、控制台干净，
//     表现只是「怎么听着还是那套合成音」，没人查得出来；
//   · 清单里写了个不存在的配方名，盖不上去，同样静默；
//   · 配方里一个参数越界，Play 吞掉异常返回 null，那一声就是不响。
// 这三种都过得了开机冒烟与通关冒烟。所以这里逐条断言：**盖上了几条、
// 播出来几条、有没有留下异常**。
//
// 用法：node Taierzhuang1938/Script_AudioTest.mjs
// 退出码即成败。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});
// 音频文件的 404 只在网络层看得见：decodeAudioData 拿到一页 HTML 会抛，
// 但那个异常被 LoadSfxPack 按设计吞掉了。
page.on("response", (res) => {
  if (!/\/Audio\//.test(res.url())) return;
  if (res.status() >= 400) problems.push(`HTTP ${res.status()} ${res.url().split("/").pop()}`);
});

let failed = 0;
const Fail = (msg) => { console.log(`FAIL ${msg}`); failed += 1; };
const Ok = (msg) => console.log(`ok   ${msg}`);

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?scale=small`, { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Taierzhuang !== undefined, { timeout: 180000 });

// 真点一下：AudioContext 要用户手势才 resume。page.evaluate 不算手势，
// page.mouse.click 发的是 trusted 事件，算。
await page.mouse.click(640, 400);
await page.evaluate(() => window.Taierzhuang.audio.Unlock());

// 采样包是异步 fetch + decode 的，等它落地（或者等到确定失败）
await page.waitForFunction(
  () => { const a = window.Taierzhuang.audio; return a.sfxReady || a.sfxErrors.length > 0; },
  { timeout: 60000 },
).catch(() => {});

const load = await page.evaluate(() => {
  const a = window.Taierzhuang.audio;
  return {
    enabled: a.enabled,
    ready: a.Ready,
    sfxReady: a.sfxReady,
    covered: [...a.sampleCues].sort(),
    errors: a.sfxErrors.slice(0, 6),
    manifestCues: a.sfxManifest ? Object.keys(a.sfxManifest.cues).length : 0,
    toneHz: a.sfxManifest && a.sfxManifest.cues.bugleTone
      ? a.sfxManifest.cues.bugleTone.toneHz : null,
  };
});

const RECIPE_COUNT = 32;

if (!load.enabled) Fail("AudioEngine 被禁用了（正常模式不该走到出图那条路）");
if (load.manifestCues !== RECIPE_COUNT) {
  Fail(`清单里只有 ${load.manifestCues} 个 cue，期望 ${RECIPE_COUNT}`);
} else Ok(`清单 ${load.manifestCues} 个 cue`);

if (load.covered.length !== RECIPE_COUNT) {
  Fail(`只盖住了 ${load.covered.length} / ${RECIPE_COUNT} 条配方`);
} else Ok(`实录采样盖住 ${load.covered.length} / ${RECIPE_COUNT} 条配方`);

if (load.errors.length) Fail(`采样载入报错 ${JSON.stringify(load.errors)}`);
else Ok("采样载入零报错");

// 军号是「一个音 + playbackRate 排动机」，基频量错了整段跑调 ——
// 495.5 Hz 是 Last Post 那个持续音的实测值（G 号的 B4）。
if (!load.toneHz || Math.abs(load.toneHz - 495.5) > 12) {
  Fail(`军号基频 ${load.toneHz} Hz 不在预期附近（应为 ~495.5 Hz）`);
} else Ok(`军号基频 ${load.toneHz} Hz`);

// 逐条播：只要 Play 返回 null 就是没响（预算闸、去重窗、配方抛异常都会这样）。
//
// 先把环境床与音乐停掉再扫：它们是**常驻节点**，一直占着几十个预算。
// 不停的话，LOW_PRIORITY 那几条（弹着砖/土/木、脚步、远射）会被
// NODE_BUDGET × 0.62 的低优先级天花板挡在门外 —— 那是设计好的行为，
// 但在这里会伪装成「这条音效坏了」。要测的是配方本身响不响。
const played = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  a.Ambience("silence");
  a.Music(null);
  await new Promise((r) => setTimeout(r, 1500));
  const mod = await import("./Script_Audio.mjs");
  const silent = [];
  const budgetAt = {};
  for (const name of mod.SOUND_NAMES) {
    let voice = null;
    // 重试三次：场上还有 AI 在打枪，预算是浮动的，一次没抢到不算坏
    for (let i = 0; i < 3 && !voice; i += 1) {
      voice = a.Play(name, { priority: true, volume: 0.05 });
      if (!voice) await new Promise((r) => setTimeout(r, 260));
    }
    if (!voice) { silent.push(name); budgetAt[name] = a.liveNodes; }
    await new Promise((r) => setTimeout(r, 55));
  }
  return {
    silent, budgetAt, liveNodes: a.liveNodes,
    total: mod.SOUND_NAMES.length, lastError: a.lastError, errorCount: a.errorCount,
  };
});

if (played.silent.length) Fail(`没响的音效：${played.silent.join(" ")}（当时 liveNodes ${JSON.stringify(played.budgetAt)}）`);
else Ok(`${played.total} 条全部发声`);
if (played.errorCount) Fail(`配方异常 ${played.errorCount} 次：${JSON.stringify(played.lastError)}`);
else Ok("配方零异常");

// 连发武器：采样版的射速仍然必须由引擎排（九二式 200 rpm 的「啄木鸟」是它的身份证）。
// 点射 5 发的 voice 寿命应该明显长于单发，否则说明 burst 根本没生效。
const burst = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const one = a.Play("type92", { priority: true, volume: 0.02, burst: 1 });
  const oneLife = one ? one.life : 0;
  await new Promise((r) => setTimeout(r, 120));
  const many = a.Play("type92", { priority: true, volume: 0.02, burst: 5 });
  return { oneLife, manyLife: many ? many.life : 0 };
});
// 5 发 × 0.30 s 间隔 = 至少多出 1.2 s
if (burst.manyLife - burst.oneLife < 1.0) {
  Fail(`九二式点射没排开：单发 ${burst.oneLife.toFixed(2)}s，5 发 ${burst.manyLife.toFixed(2)}s`);
} else Ok(`九二式 5 发点射排开到 ${burst.manyLife.toFixed(2)}s（单发 ${burst.oneLife.toFixed(2)}s）`);

if (problems.length) { for (const p of problems.slice(0, 10)) Fail(p); }

await browser.close();
server.close();
console.log(failed ? `\n音频冒烟失败 ${failed} 项。` : "\n音频冒烟全过。");
process.exit(failed ? 1 : 0);
