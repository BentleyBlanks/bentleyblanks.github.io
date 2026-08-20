// 《滕县 一九三八》音频冒烟：真浏览器里把三个实录包载进去（音效 / 环境床 / 音乐），逐条播一遍。
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

// ---------------------------------------------------------------------------
// 环境床与音乐
//
// 这两层的失败同样是**静默**的，而且比音效更难发现：环境床载不到会退回一层
// 合成的风（听着「有点动静」，其实整套实录都没进来），音乐载不到就是没有音乐。
// 两者都不会报错、不会掉帧、通关冒烟全绿。所以逐条断言。
// ---------------------------------------------------------------------------
await page.waitForFunction(
  () => { const a = window.Taierzhuang.audio; return (a.ambReady && a.musicReady) || a.ambErrors.length > 0 || a.musicErrors.length > 0; },
  { timeout: 60000 },
).catch(() => {});

const packs = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const mod = await import("./Script_Audio.mjs");
  return {
    beds: a.ambBuffers.size,
    bedNames: [...a.ambBuffers.keys()].sort(),
    manifestBeds: a.ambManifest ? Object.keys(a.ambManifest.beds).length : 0,
    manifestCues: a.ambManifest ? Object.keys(a.ambManifest.cues).length : 0,
    ambCues: [...a.sampleCues].filter((n) => n.startsWith("amb.")).sort(),
    ambErrors: a.ambErrors.slice(0, 6),
    music: a.musicBuffers.size,
    musicNames: [...a.musicBuffers.keys()].sort(),
    musicErrors: a.musicErrors.slice(0, 6),
    presets: Object.keys(mod.AMBIENCE_PRESETS),
    musicCues: Object.keys(mod.MUSIC_CUES),
    // 每一档环境引用到的床，必须条条都在清单里 —— 写错一个名字，那一层就
    // 悄悄地少了，游戏照跑。
    missing: Object.entries(mod.AMBIENCE_PRESETS).flatMap(([name, cfg]) =>
      (cfg.layers || []).filter((l) => !a.ambBuffers.has(l.bed)).map((l) => `${name}:${l.bed}`)),
    // 事件引用到的配方同理。
    missingEvents: Object.entries(mod.AMBIENCE_PRESETS).flatMap(([name, cfg]) =>
      (cfg.events || []).filter((e) => !mod.SOUND_NAMES.includes(e.name) && !a.sampleCues.has(e.name))
        .map((e) => `${name}:${e.name}`)),
  };
});

if (packs.ambErrors.length) Fail(`环境床载入报错 ${JSON.stringify(packs.ambErrors)}`);
else Ok("环境床载入零报错");
if (packs.beds !== packs.manifestBeds || !packs.beds) {
  Fail(`床载入 ${packs.beds} / 清单 ${packs.manifestBeds}`);
} else Ok(`${packs.beds} 条床全部载入`);
if (packs.ambCues.length !== packs.manifestCues || !packs.manifestCues) {
  Fail(`环境一次性音注册 ${packs.ambCues.length} / 清单 ${packs.manifestCues}`);
} else Ok(`${packs.ambCues.length} 条环境一次性音注册成配方`);
if (packs.missing.length) Fail(`环境档引用了不存在的床：${packs.missing.join(" ")}`);
else Ok(`${packs.presets.length} 档环境引用的床条条都在`);
if (packs.missingEvents.length) Fail(`环境事件引用了不存在的配方：${packs.missingEvents.join(" ")}`);
else Ok("环境事件引用的配方条条都在");

if (packs.musicErrors.length) Fail(`音乐载入报错 ${JSON.stringify(packs.musicErrors)}`);
else Ok("音乐载入零报错");
if (packs.music !== packs.musicCues.length) {
  Fail(`音乐载入 ${packs.music} / cue 表 ${packs.musicCues.length}（${packs.musicNames.join(" ")}）`);
} else Ok(`${packs.music} 段音乐全部载入`);

// 逐档切一遍：每一档该起几层就起几层，而且切走之后节点必须归零 ——
// 常驻节点泄漏在这一层最容易出：床是一直在响的，漏掉的那几个不会自己停。
const layers = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const mod = await import("./Script_Audio.mjs");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.Ambience("silence"); a.Music(null);
  await sleep(400);
  const base = a.liveNodes;
  const rows = [];
  for (const [name, cfg] of Object.entries(mod.AMBIENCE_PRESETS)) {
    a.Ambience(name);
    await sleep(350);
    // 常驻开销按**播放头**数，不按 liveNodes 的差 —— 前面逐条播过 32 个音效，
    // 尾巴还在飞，差值会算出负数来。
    rows.push({ name, want: (cfg.layers || []).length, got: a.ambLayers.length,
      nodes: a.ambLayers.reduce((n, l) => n + l.heads.size * 2, 0) });
  }
  a.Ambience("silence");
  await sleep(400);
  return { rows, base, after: a.liveNodes };
});

const badLayers = layers.rows.filter((r) => r.got !== r.want);
if (badLayers.length) {
  Fail(`环境层数不对：${badLayers.map((r) => `${r.name} ${r.got}/${r.want}`).join(" ")}`);
} else Ok(`${layers.rows.length} 档环境层数全对（最多 ${Math.max(...layers.rows.map((r) => r.nodes))} 个常驻节点）`);
// 床是**一直在响的**，它吃掉的预算直接从同屏枪声里扣。留个上限，别让谁随手加到八层。
const peakNodes = Math.max(...layers.rows.map((r) => r.nodes));
if (peakNodes > 24) Fail(`某一档环境的常驻节点到了 ${peakNodes} 个（上限 24，再多就该从枪声里抢了）`);
else Ok(`常驻节点峰值 ${peakNodes} / 24`);
if (layers.after > layers.base + 2) {
  Fail(`环境切回 silence 之后还剩 ${layers.after - layers.base} 个节点没回收`);
} else Ok("环境切走之后节点归零");

// 音乐：切 cue 要能接上（旧的淡出、新的淡入），停掉之后不许留节点。
const musicRun = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const mod = await import("./Script_Audio.mjs");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.Music(null);
  await sleep(2200);
  const base = a.liveNodes;
  const rows = [];
  for (const cue of Object.keys(mod.MUSIC_CUES)) {
    a.Music(cue);
    await sleep(300);
    rows.push({ cue, heads: a.musicLayer ? a.musicLayer.heads.size : 0 });
  }
  a.Music(null);
  await sleep(2400);
  return { rows, base, after: a.liveNodes, cue: a.musicCue };
});

const badMusic = musicRun.rows.filter((r) => r.heads < 1);
if (badMusic.length) Fail(`这几段音乐没起来：${badMusic.map((r) => r.cue).join(" ")}`);
else Ok(`${musicRun.rows.length} 段音乐都能起播（切 cue 交叉淡）`);
if (musicRun.after > musicRun.base + 2) {
  Fail(`音乐停掉之后还剩 ${musicRun.after - musicRun.base} 个节点没回收`);
} else Ok("音乐停掉之后节点归零");

// 床的交叉淡：放过一个完整的 seg 周期之后，播放头必须还在（说明续上了），
// 而且不许越积越多（说明旧的回收了）。这一条是「循环有没有断」的唯一机器判据。
const cross = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.Ambience("burningStreet");
  await sleep(500);
  const layer = a.ambLayers.find((l) => l.seg <= 8) || a.ambLayers[0];
  const seg = layer.seg;
  const first = layer.heads.size;
  await sleep((seg + 1.5) * 1000);
  const mid = layer.heads.size;
  await sleep((seg + 1.5) * 1000);
  const late = layer.heads.size;
  a.Ambience("silence");
  await sleep(300);
  return { seg, first, mid, late, stopped: a.ambLayers.length };
});

if (cross.mid < 1 || cross.late < 1) {
  Fail(`床没续上：seg ${cross.seg.toFixed(1)}s，播放头 ${cross.first}→${cross.mid}→${cross.late}`);
} else if (cross.late > 2) {
  Fail(`床的播放头越积越多（${cross.late} 个），旧的没回收`);
} else Ok(`床跨过两个 ${cross.seg.toFixed(1)}s 周期仍在响（播放头 ${cross.first}→${cross.mid}→${cross.late}）`);

// 听者有没有跟着相机走。
//
// 这一条是补的：SetListener 写好之后**全仓库零调用点**，WebAudio 的 listener
// 一辈子停在世界原点。序·界河的切片在 z = −1470，于是每一发枪声都按一千四百米
// 算距离 —— 直达声被 panner 压掉三十分贝没了，而混响 send 在 Panner 之前分出去、
// 不吃距离衰减，玩家听到的就只剩全场每一发枪的混响尾巴糊在一起：密密麻麻、
// 没有方向（HRTF 只在 25 m 内开）、没有高频（空气低通钳在 700 Hz 的地板上）。
// 实测直达声 −66.9 → −36.2 dBFS，侧向/中央 −41.8 → −7.5 dB。
const listener = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  T.JumpToPhase(0);                      // 界河：切片离世界原点一千四百米，钉住不动一眼看得出来
  await sleep(400);
  T.StepFrames(30);
  await sleep(200);
  const cam = T.camera.position;
  const L = T.audio.listenerPos;
  return {
    cam: { x: cam.x, y: cam.y, z: cam.z },
    lis: { x: L.x, y: L.y, z: L.z },
    gap: Math.hypot(cam.x - L.x, cam.y - L.y, cam.z - L.z),
    fromOrigin: Math.hypot(cam.x, cam.z),
  };
});
if (listener.fromOrigin < 50) {
  Fail(`这一关的相机离世界原点只有 ${listener.fromOrigin.toFixed(0)} m，测不出听者钉没钉住 —— 换一关再测`);
} else if (listener.gap > 1.5) {
  Fail(`听者没跟着相机：相机 (${listener.cam.x.toFixed(0)}, ${listener.cam.z.toFixed(0)}) `
    + `听者 (${listener.lis.x.toFixed(0)}, ${listener.lis.z.toFixed(0)})，差 ${listener.gap.toFixed(0)} m`);
} else {
  Ok(`听者贴着相机（离世界原点 ${listener.fromOrigin.toFixed(0)} m 处，差 ${listener.gap.toFixed(2)} m）`);
}

if (problems.length) { for (const p of problems.slice(0, 10)) Fail(p); }

await browser.close();
server.close();
console.log(failed ? `\n音频冒烟失败 ${failed} 项。` : "\n音频冒烟全过。");
process.exit(failed ? 1 : 0);
