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
await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 180000 });

// 真点一下：AudioContext 要用户手势才 resume。page.evaluate 不算手势，
// page.mouse.click 发的是 trusted 事件，算。
await page.mouse.click(640, 400);
await page.evaluate(() => window.Taierzhuang.audio.Unlock());

// 采样包是异步 fetch + decode 的，等它落地（或者等到确定失败）
await page.waitForFunction(
  () => { const a = window.Taierzhuang.audio; return a.sfxReady || a.sfxErrors.length > 0; },
  null, { timeout: 60000 },
).catch(() => {});
await page.waitForFunction(
  () => { const a = window.Taierzhuang.audio; return a.voicesReady || a.voiceErrors.length > 0; },
  null, { timeout: 60000 },
).catch(() => {});

const load = await page.evaluate(() => {
  const a = window.Taierzhuang.audio;
  return {
    enabled: a.enabled,
    ready: a.Ready,
    sfxReady: a.sfxReady,
    // 环境包与音效包并行载入；机器快时 amb.* 可能在这里先注册，不能算进 SFX 覆盖数。
    covered: [...a.sampleCues].filter((name) => !name.startsWith("amb.")).sort(),
    errors: a.sfxErrors.slice(0, 6),
    manifestCues: a.sfxManifest ? Object.keys(a.sfxManifest.cues).length : 0,
    prologueSfx: ["trainBrake", "trainWhistle", "carriageRattle", "stretcherWood", "coughLow", "gearRustle", "carriageDoorSlide", "stepBallast"]
      .filter((name) => !a.sampleCues.has(name)),
    toneHz: a.sfxManifest && a.sfxManifest.cues.bugleTone
      ? a.sfxManifest.cues.bugleTone.toneHz : null,
  };
});

const RECIPE_COUNT = 41;   // 2026-08-24 序章车厢新增 SeedAudio 蒸汽机车汽笛

if (!load.enabled) Fail("AudioEngine 被禁用了（正常模式不该走到出图那条路）");
if (load.manifestCues !== RECIPE_COUNT) {
  Fail(`清单里只有 ${load.manifestCues} 个 cue，期望 ${RECIPE_COUNT}`);
} else Ok(`清单 ${load.manifestCues} 个 cue`);

if (load.covered.length !== RECIPE_COUNT) {
  Fail(`只盖住了 ${load.covered.length} / ${RECIPE_COUNT} 条配方`);
} else Ok(`实录采样盖住 ${load.covered.length} / ${RECIPE_COUNT} 条配方`);

if (load.errors.length) Fail(`采样载入报错 ${JSON.stringify(load.errors)}`);
else Ok("采样载入零报错");
if (load.prologueSfx.length) Fail(`序章专用音未盖上：${load.prologueSfx.join(" ")}`);
else Ok("序章 8 条专用音全部盖上");

const voiceSeek = await page.evaluate(() => {
  const a = window.Taierzhuang.audio;
  const key = "prologue_young_dispatch_01";
  const entry = a.voiceBank.get(key);
  if (!entry) return null;
  const name = `voice.${key}`;
  a.lastPlayAt.delete(name);
  const voice = a.Play(name, { priority: true, volume: 0.01, offset: 0.5 });
  if (!voice) return { full: entry.duration, voice: null };
  const out = { full: entry.duration, offset: voice.offset, duration: voice.duration };
  a.StopVoice(voice);
  return out;
});
if (!voiceSeek || voiceSeek.duration === undefined) {
  Fail(`序章人声无法做采样跳转：${JSON.stringify(voiceSeek)}`);
} else if (Math.abs(voiceSeek.offset - 0.5) > 0.001
    || Math.abs(voiceSeek.duration - (voiceSeek.full - 0.5)) > 0.05) {
  Fail(`人声采样偏移不对：${JSON.stringify(voiceSeek)}`);
} else Ok("序章人声可从 Timeline 目标采样点起播");

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
  null, { timeout: 60000 },
).catch(() => {});

const packs = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const mod = await import("./Script_Audio.mjs");
  const train = a.ambBuffers.get("trainInterior");
  let seam = null;
  if (train) {
    const d = train.getChannelData(0);
    seam = Math.abs(d[0] - d[d.length - 1]);
  }
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
    trainSeamDelta: seam,
    hasTrainPreset: !!mod.AMBIENCE_PRESETS.trainInterior,
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
if (!packs.hasTrainPreset || !packs.bedNames.includes("trainInterior")) Fail("序章 trainInterior 床或 preset 缺失");
else Ok("序章 trainInterior 床与 preset 已接入");
if (packs.trainSeamDelta === null || packs.trainSeamDelta > 0.03) Fail(`序章床首尾接缝 ${packs.trainSeamDelta}（应 ≤ 0.03）`);
else Ok(`序章床首尾接缝可量化通过（Δ ${packs.trainSeamDelta.toFixed(5)}）`);

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
// 一辈子停在世界原点。城外那一章的切片离城心五百多米，于是每一发枪声都按五百米
// 算距离 —— 直达声被 panner 压掉三十分贝没了，而混响 send 在 Panner 之前分出去、
// 不吃距离衰减，玩家听到的就只剩全场每一发枪的混响尾巴糊在一起：密密麻麻、
// 没有方向（HRTF 只在 25 m 内开）、没有高频（空气低通钳在 700 Hz 的地板上）。
// 实测直达声 −66.9 → −36.2 dBFS，侧向/中央 −41.8 → −7.5 dB。
const listener = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 第一章（城外原野）：切片离世界原点五百多米，听者钉住不动一眼看得出来。
  // **不能用序章**：那是过场承载章，JumpToPhase 对它不重建场、不 Respawn，
  // 相机停在上一关哪儿就还在哪儿，这条断言就测不到东西了。
  T.JumpToPhase(1);
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

// ---------------------------------------------------------------------------
// 距离这一层：混响不许压过干声，太远的枪不许逐发播
//
// 2026-08-20 之前这三条都是坏的，而且**三条都测不出来** ——
// 声音全都在响，控制台干净，通关冒烟全绿，只是听起来「一打起来就一片
// 不知道哪儿来的、带拖尾的音效糊在一起」。三条各自的成因：
//   1) 混响 send 完全不吃距离衰减，反而随距离**往上加**（1 + d×0.03，1.0 封顶）。
//      一百六十米外那一枪：干声 0.024、湿 1.0 —— 湿是干的二十倍，
//      而混响是立体声、不带方位、拖 0.95—2.6 s。玩家听到的几乎全是它。
//   2) 场上四十个兵，平均一百三十米开外，每一枪都逐发播；
//      「几百米外连成一片的仗」本来就有环境床 battleFar 负责。
//   3) 预算闸先到先得，丢的是随机的三成五，眼前那一枪和两百米外那一枪一样看运气。
// 所以这三条要各留一道断言，别再回去。
const dist = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.Ambience("silence"); a.Music(null);
  await sleep(500);
  const L = a.listenerPos;
  const At = (m) => ({ x: L.x + m, y: L.y, z: L.z });
  // panner 的 inverse 曲线，与 Script_Audio 里那组参数一致
  const Dry = (m) => 3.5 / (3.5 + 0.9 * Math.max(0, m - 3.5));
  const ret = a.space === "open" ? 0.7 : 0.85;
  const Measure = (m) => {
    const v = a.Play("rifleNra", { position: At(m), priority: true, volume: 1 });
    if (!v) return null;
    const g = v.out.gain.value;
    return { dry: g * Dry(m), wet: g * v.wetGain.gain.value * ret };
  };
  const near = Measure(2);
  await sleep(120);
  const far = Measure(120);
  await sleep(120);
  const before = { ...a.drops };
  const culled = a.PlayGunshot("rifleNra", { position: At(300), volume: 1 });
  await sleep(60);
  const kept = a.PlayGunshot("rifleNra", { position: At(100), volume: 1 });
  return { near, far, culled: !culled, kept: !!kept,
    culledCount: a.drops.distance - before.distance };
});
if (!dist.near || !dist.far) {
  Fail("量不到干湿电平（Play 返回 null，多半是被预算闸挡了）");
} else {
  const nearRatio = dist.near.wet / dist.near.dry;
  const farRatio = dist.far.wet / dist.far.dry;
  // 近处：混响是点缀。远处：混响占比**可以**上去（那正是「远」的听感），
  // 但绝不许压过干声一大截 —— 三倍是「还听得出方位」的边界。
  if (nearRatio > 0.6) Fail(`两米外那一枪湿/干 ${nearRatio.toFixed(2)}（上限 0.6）`);
  else if (farRatio > 3) Fail(`一百二十米外那一枪湿/干 ${farRatio.toFixed(2)}（上限 3；改坏之前是 19）`);
  else if (farRatio < nearRatio) Fail(`远处反而比近处干（近 ${nearRatio.toFixed(2)} 远 ${farRatio.toFixed(2)}），距离感是反的`);
  else Ok(`湿/干随距离上升但不失控：2 m ${nearRatio.toFixed(2)} → 120 m ${farRatio.toFixed(2)}`);
}
// culledCount 只要求 ≥1：这一刻场上还在打，两次调用之间可能正好有一句
// 九十米外的喊话被 VOICE_CULL_M 掐掉，也记在同一个计数上。
if (!dist.culled || dist.culledCount < 1) {
  Fail(`三百米外那一枪还在逐发播（应该交给环境床 battleFar；`
    + `返回 ${dist.culled ? "null" : "有声"}，距离闸计数 +${dist.culledCount}）`);
}
else if (!dist.kept) Fail("一百米外那一枪被掐掉了 —— 闸门开得太狠");
else Ok("三百米外不逐发播、一百米外照播");

// 抛壳落地：这条 cue 以前根本不存在，代码里拿「野外迫击炮爆炸」当弹壳用，
// 每开一枪跟一记 2.8 秒的迫击炮。所以既要断言 cue 在，也要断言**开枪不再去要它**。
const shell = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const entry = a.sfxManifest && a.sfxManifest.cues.shellDrop;
  // 得先站到一章里，手上还得有枪有子弹 —— 前面那条听者断言把关卡跳到了第一章。
  T.JumpToPhase(2);
  await sleep(900);
  T.StepFrames(30);
  const before = {
    drop: a.RequestedCount("shellDrop"),
    mortar: a.RequestedCount("shellImpact"),
    rifle: a.RequestedCount("rifleNra"),
  };
  for (let i = 0; i < 3; i += 1) { T.Debug.Fire(); await sleep(1400); }
  return {
    variants: entry ? entry.files.length : 0,
    seconds: entry ? entry.seconds : 0,
    drop: a.RequestedCount("shellDrop") - before.drop,
    mortar: a.RequestedCount("shellImpact") - before.mortar,
    rifle: a.RequestedCount("rifleNra") - before.rifle,
    slots: T.Debug.Slots ? T.Debug.Slots() : null,
    ammo: T.state.ammo,
  };
});
if (shell.variants < 2) Fail(`shellDrop 只有 ${shell.variants} 个变体（每开一枪响一次的音必须多变体）`);
else if (shell.seconds > 1.4) Fail(`shellDrop 长达 ${shell.seconds}s —— 那不是弹壳，是别的东西`);
else if (shell.mortar > 0) Fail(`开三枪去要了 ${shell.mortar} 次 shellImpact（迫击炮爆炸），弹壳那条又接错了`);
else if (shell.rifle < 1) Fail(`Debug.Fire 三次一枪都没打出去（ammo ${shell.ammo}，${JSON.stringify(shell.slots)}）—— 这条断言本身没测到东西`);
else if (shell.drop < 1) Fail(`打出 ${shell.rifle} 枪，一次弹壳落地都没要`);
else Ok(`抛壳走 shellDrop（${shell.variants} 变体 / ${shell.seconds}s），开三枪零记迫击炮`);

// 白刃三音：2026-08-26 从 Sonniss 顶包换成人工选定的 SeedAudio take。
// 两种回归都是静默的 ——「全量 SfxBake 把 cue 写回借来的顶包」与「挥空掉回一个变体」，
// 前者听感变回不对的兵器，后者连砍两下复读，都过得了上面「41/41 盖住」那条。
const melee = await page.evaluate(() => {
  const cues = window.Taierzhuang.audio.sfxManifest?.cues || {};
  const pick = (name) => ({
    variants: cues[name]?.files?.length || 0,
    seconds: cues[name]?.seconds || 0,
    license: cues[name]?.license || "",
  });
  return { swing: pick("dadaoSwing"), dadao: pick("dadaoHit"), bayonet: pick("bayonetHit") };
});
const borrowed = Object.entries(melee).filter(([, v]) => v.license !== "volcengine");
if (borrowed.length) Fail(`白刃音又变回顶包：${borrowed.map(([k, v]) => `${k}=${v.license || "缺"}`).join(" ")}`);
else if (melee.swing.variants < 3) Fail(`dadaoSwing 只有 ${melee.swing.variants} 个变体（白刃是连续动作，连砍会复读）`);
else if (melee.swing.seconds > 0.8) Fail(`dadaoSwing 长达 ${melee.swing.seconds}s —— 挥空音没有那么长，多半是切点跑了`);
else Ok(`白刃三音走 SeedAudio（挥空 ${melee.swing.variants} 变体 / ${melee.swing.seconds}s、`
  + `砍中 ${melee.dadao.seconds}s、刺中 ${melee.bayonet.seconds}s）`);

// 挥空必须**按顺序轮**、且**不许变调**：三条是人工一条条选定的，随机挑会连出两次
// 同一条，±3% 变调会把选中的音色拧走（0.2 秒的破风声听得出来）。两者都是静默回归 ——
// 上面那条「3 变体」的断言拦不住，它只看清单不看真正播了哪一条。
const cycle = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const made = [];
  const orig = a.ctx.createBufferSource;
  a.ctx.createBufferSource = function patched() { const src = orig.call(this); made.push(src); return src; };
  // 同帧齐射有 22 ms 去重窗，六次要拉开放。
  for (let i = 0; i < 6; i += 1) { a.Play("dadaoSwing"); await sleep(60); }
  a.ctx.createBufferSource = orig;
  // 只数**一次性**源：环境床与音乐是循环源，它们在这半秒里刚好载完补起播的话
  // 会混进来，把「播六次抓到几个」变成抛硬币。
  return made.filter((s) => s.buffer && !s.loop).map((s) => ({
    durMs: Math.round(s.buffer.duration * 1000),
    rate: Number(s.playbackRate.value.toFixed(4)),
  }));
});
const durs = cycle.map((c) => c.durMs);
const rates = cycle.map((c) => c.rate);
const unique = [...new Set(durs)];
if (cycle.length !== 6) Fail(`播六次挥空只抓到 ${cycle.length} 个源 —— 这条断言本身没测到东西`);
else if (rates.some((r) => r !== 1)) Fail(`挥空被逐发变调了：${rates.join(" ")}（选定的三条要原样播）`);
else if (unique.length !== 3) Fail(`播六次只用到 ${unique.length} 条变体：${durs.join(" ")} ms`);
else if (durs[0] !== durs[3] || durs[1] !== durs[4] || durs[2] !== durs[5]) {
  Fail(`挥空不是按顺序轮的：${durs.join(" ")} ms（随机挑会连出两次同一条）`);
} else Ok(`挥空按顺序轮播且不变调（${durs.slice(0, 3).join(" → ")} ms 循环，rate 恒为 1）`);

if (problems.length) { for (const p of problems.slice(0, 10)) Fail(p); }

await browser.close();
server.close();
console.log(failed ? `\n音频冒烟失败 ${failed} 项。` : "\n音频冒烟全过。");
process.exit(failed ? 1 : 0);
