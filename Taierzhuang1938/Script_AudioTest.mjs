// 《台儿庄：血战滕县》音频冒烟：真浏览器里把三个实录包载进去（音效 / 环境床 / 音乐），逐条播一遍。
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

// 2026-08-24 序章车厢新增 SeedAudio 蒸汽机车汽笛 → 41
// 2026-08-29 集成批 INT3a：缺口批 A2 的十五个 cue 接完线，从 pendingCues 搬进 cues → 56
//   （惨叫 / 痛呼 / 闷哼、照明弹四条、发报两条、日机三条、扫地一条、重机两条）
// 2026-09-11 断肢两音（goreSever / goreLimbLand）→ 83
// 2026-09-11: sampled continuous piston engine.
// 2026-09-13: approved low-health breath, separate from sprint breathing.
const RECIPE_COUNT = 85;

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

// Timeline 静音快进之后，目标时刻仍在说的那一句必须从**对应采样点**接回来，
// 不能从头播、也不能没声（编辑器审片全靠这条）。
// 2026-08-29：取样键从旧序章的 `prologue_young_dispatch_01` 换成新序章的
// `ch0_shunzi_02`（3.36 s，镜 2 顺子读家信那一句）—— 旧序章那 11 条 prologue_* 行
// 已经从 Data_Voice 的总表里退役了，拿它取样只会量到「voiceBank 里没有这条」。
// 挑长的那一句是有理由的：偏移 0.5 s 之后还得剩下够长的一段才量得出差别。
const voiceSeek = await page.evaluate(() => {
  const a = window.Taierzhuang.audio;
  const key = "ch0_shunzi_02";
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
  Fail(`序章章节台词无法做采样跳转：${JSON.stringify(voiceSeek)}（ch0_shunzi_02 没进 voiceBank？）`);
} else if (Math.abs(voiceSeek.offset - 0.5) > 0.001
    || Math.abs(voiceSeek.duration - (voiceSeek.full - 0.5)) > 0.05) {
  Fail(`人声采样偏移不对：${JSON.stringify(voiceSeek)}`);
} else Ok("序章章节台词可从 Timeline 目标采样点起播（ch0_shunzi_02）");

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
    music: [...a.musicBuffers.keys()].filter(cue => !mod.MUSIC_CUES[cue]?.onDemand).length,
    musicNames: [...a.musicBuffers.keys()].filter(cue => !mod.MUSIC_CUES[cue]?.onDemand).sort(),
    musicErrors: a.musicErrors.slice(0, 6),
    presets: Object.keys(mod.AMBIENCE_PRESETS),
    musicCues: Object.keys(mod.MUSIC_CUES).filter(cue => !mod.MUSIC_CUES[cue].onDemand),
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
    if (mod.MUSIC_CUES[cue].onDemand) await a.LoadMusicCue(cue);
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
  // EnterLevel rebuilds physics asynchronously; a fixed sleep can step freed bodies.
  await T.JumpToPhase(1);
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
  const Dry = (m, ref) => ref / (ref + 0.9 * Math.max(0, m - ref));
  const ret = a.space === "open" ? 0.7 : 0.85;
  const Measure = (m) => {
    const v = a.Play("rifleNra", { position: At(m), priority: true, volume: 1 });
    if (!v) return null;
    const g = v.out.gain.value;
    return { dry: g * Dry(m, v.panner.refDistance), wet: g * v.wetGain.gain.value * ret };
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

// Guard audibility and voice-stealing against the actual spatial node curve.
const gunAudibility = await page.evaluate(() => {
  const a = window.Taierzhuang.audio, L = a.listenerPos;
  const At = (d) => ({ x: L.x + d, y: L.y, z: L.z });
  const rows = [];
  for (const cue of ["rifleNra", "rifleIja", "rifleNraFar", "rifleIjaFar", "type11", "type92"]) {
    for (const distance of [2, 100, 150]) {
      const v = a.Play(cue, { position: At(distance), priority: true });
      if (!v) { rows.push({ cue, distance, ok: false }); continue; }
      const ref = v.panner.refDistance;
      const fall = ref / (ref + 0.9 * Math.max(0, distance - ref));
      rows.push({ cue, distance, level: v.effectiveGain, ok: ref === 14
        && Math.abs(v.effectiveGain - v.baseGain * fall) < 1e-6
        && Math.abs(a.LevelAt(cue, distance) - v.effectiveGain) < 1e-6
        && (distance < 100 || v.effectiveGain >= 0.04) });
      a.StopVoice(v, 0.001);
    }
  }
  const field = a.Play("rifleIjaFar", { position: At(220), soundField: true, priority: true });
  for (const distance of [220, 300]) {
    if (distance === 300) a.MoveVoice(field, At(distance));
    const expected = field.baseGain * 64 / (64 + 0.9 * (distance - 64));
    rows.push({ cue: "soundField", distance, ok: Math.abs(field.effectiveGain - expected) < 1e-6 });
  }
  a.StopVoice(field, 0.001);
  return rows;
});
if (gunAudibility.some((row) => !row.ok)) Fail(`gun audibility/spatial priority: ${JSON.stringify(gunAudibility)}`);
else Ok("both armies audible at 100/150 m; far-field stealing matches Panner before/after movement");

// 抛壳落地：这条 cue 以前根本不存在，代码里拿「野外迫击炮爆炸」当弹壳用，
// 每开一枪跟一记 2.8 秒的迫击炮。所以既要断言 cue 在，也要断言**开枪不再去要它**。
const shell = await page.evaluate(async () => {
  const T = window.Taierzhuang, a = T.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const entry = a.sfxManifest && a.sfxManifest.cues.shellDrop;
  // 得先站到一章里，手上还得有枪有子弹 —— 前面那条听者断言把关卡跳到了第一章。
  await T.JumpToPhase(2);
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
//
// **认源要按 dadaoSwing 自己的 buffer 认，不能数「全部一次性源」。**
// 上一版就是数一次性源，于是「播六次抓到 8 个 / 9 个」随机翻红：这 360 ms 的窗口
// 里场上的 AI 随时会喊一句，而 `voice.*` 也是一次性 BufferSource（LoadVoices 里那条
// 配方），采样版的枪声、脚步、弹着同理 —— 它们全都不是循环源，`!s.loop` 一条都挡不住。
// 现在先把清单里那三个挥空文件自己解一份、算出指纹（长度 + 64 点抽样和），
// 抓到的源逐个比对指纹：**只有真的是这三条 buffer 的才算数**，别人喊多少句都无所谓。
// 指纹能比长度可靠：三条变体的时长将来完全可能撞在同一个毫秒上（清单里写的都是 0.55 s）。
const cycle = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const mod = await import("./Script_Audio.mjs");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const entry = a.sfxManifest && a.sfxManifest.cues.dadaoSwing;
  if (!entry || !entry.files) return { error: "清单里没有 dadaoSwing" };
  const Fingerprint = (buf) => {
    const d = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / 64));
    let sum = 0;
    for (let i = 0; i < d.length; i += step) sum += d[i];
    return `${buf.length}:${sum.toFixed(6)}`;
  };
  // 同一个 AudioContext 解同一份 mp3，PCM 逐字节相同 —— 指纹因此是可比的。
  const mine = new Map();
  for (let i = 0; i < entry.files.length; i += 1) {
    const url = `${mod.SFX_BASE}${entry.files[i]}?v=${mod.SFX_PACK_VERSION}`;
    const buf = await a.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    mine.set(Fingerprint(buf), i + 1);
  }
  const made = [];
  const orig = a.ctx.createBufferSource;
  a.ctx.createBufferSource = function patched() { const src = orig.call(this); made.push(src); return src; };
  // 同帧齐射有 22 ms 去重窗，六次要拉开放。
  // priority：这一条测的是**轮播顺序与变调**，不是预算闸 —— 被闸掉一发就成了抛硬币。
  for (let i = 0; i < 6; i += 1) { a.Play("dadaoSwing", { priority: true, volume: 0.02 }); await sleep(60); }
  a.ctx.createBufferSource = orig;
  const picked = made.filter((s) => s.buffer && mine.has(Fingerprint(s.buffer))).map((s) => ({
    variant: mine.get(Fingerprint(s.buffer)),
    durMs: Math.round(s.buffer.duration * 1000),
    rate: Number(s.playbackRate.value.toFixed(4)),
  }));
  return { picked, variants: mine.size, others: made.length - picked.length };
});
if (cycle.error) Fail(`挥空轮播测不到东西：${cycle.error}`);
else {
  const seq = cycle.picked.map((c) => c.variant);
  const durs = cycle.picked.map((c) => c.durMs);
  const rates = cycle.picked.map((c) => c.rate);
  const unique = [...new Set(seq)];
  if (cycle.picked.length !== 6) {
    Fail(`播六次挥空只认到 ${cycle.picked.length} 个 dadaoSwing 源`
      + `（同期另有 ${cycle.others} 个别人的一次性源）—— 这条断言本身没测到东西`);
  } else if (rates.some((r) => r !== 1)) Fail(`挥空被逐发变调了：${rates.join(" ")}（选定的三条要原样播）`);
  else if (cycle.variants !== 3) Fail(`清单里挥空只有 ${cycle.variants} 条变体（白刃是连续动作，连砍会复读）`);
  else if (unique.length !== 3) Fail(`播六次只用到 ${unique.length} 条变体：变体号 ${seq.join(" ")}`);
  else if (seq[0] !== seq[3] || seq[1] !== seq[4] || seq[2] !== seq[5]) {
    Fail(`挥空不是按顺序轮的：变体号 ${seq.join(" ")}（随机挑会连出两次同一条）`);
  } else Ok(`挥空按顺序轮播且不变调（变体 ${seq.slice(0, 3).join(" → ")}，`
    + `${durs.slice(0, 3).join(" / ")} ms，rate 恒为 1；同期滤掉别人的 ${cycle.others} 个一次性源）`);
}

// ---------------------------------------------------------------------------
// 空间三件套 + 动态：遮挡、分区混响、传播延迟、duck/耳鸣、voice stealing、开枪压环境
//
// 这一整块（2026-09-08）测的东西**全都是静默的**：探针没注册上、遮挡只压了湿声、
// 混响送错了档、延迟把去重窗顶掉、duck 随采样一起失效、预算满了丢的是玩家的枪 ——
// 没有一条会报错、掉帧或者让别的断言翻红，只会「听着不对」。
//
// 探针在这里由测试自己注册（宿主侧接线是另一个包的事）：
// occlusion / zone 都从 window 上读一个可写的假值，这样一条断言只动一个变量。
// ---------------------------------------------------------------------------
const spatial = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.Ambience("silence"); a.Music(null);
  await sleep(400);
  window.__occ = 0;
  window.__zone = "street";
  a.SetProbes({
    occlusion: () => window.__occ,
    zone: () => window.__zone,
  });
  const L = a.listenerPos;
  const At = (m) => ({ x: L.x + m, y: L.y, z: L.z });
  const Snap = (v) => v && ({
    // 干声 = 源 gain × 遮挡衰减（occ 为 0 时不建那个节点）
    dry: v.out.gain.value * (v.occGain ? v.occGain.gain.value : 1),
    wet: v.wetGain.gain.value,
    airHz: v.air ? v.air.frequency.value : null,
    occ: v.occ, zone: v.reverbZone, propagation: v.propagation,
    interiorConv: v.reverbNode === a.reverbs.interior,
    streetConv: v.reverbNode === a.reverbs.street,
  });

  // 1) 遮挡：同一条 cue、同一个距离，只把遮挡度从 0 拨到 1。
  //    30 m 是刻意选的：超过 OCCLUSION_MIN_M，又不至于让空气低通自己就压到 1 kHz 以下
  //    （18000/(1+30×0.09) = 4865 Hz）。
  a.lastPlayAt.delete("rifleNra");
  window.__occ = 0;
  const clear = Snap(a.Play("rifleNra", { position: At(30), priority: true, volume: 1 }));
  await sleep(140);
  // 缓存按空间格算，同一格里 0.25 s 内共用一次射线 —— 换个位置才问得到新值。
  window.__occ = 1;
  const blocked = Snap(a.Play("rifleNra", { position: { x: L.x + 30, y: L.y, z: L.z + 40 }, priority: true, volume: 1 }));
  await sleep(140);

  // 2) 分区混响：zone 探针说 interior，湿声就必须接到 interior 那只卷积上。
  window.__occ = 0;
  window.__zone = "interior";
  const inside = Snap(a.Play("rifleIja", { position: { x: L.x + 12, y: L.y, z: L.z - 9 }, priority: true, volume: 1 }));
  await sleep(140);
  window.__zone = "street";
  const outside = Snap(a.Play("rifleIja", { position: { x: L.x - 12, y: L.y, z: L.z + 9 }, priority: true, volume: 1 }));
  await sleep(140);

  // 3) 传播延迟：80 m 外的爆炸该晚 80/340 = 0.235 s；玩家自己那一枪（priority）不延迟。
  //    这一条**不能用 priority 去保它出声**（priority 正是「不延迟」那一档），
  //    所以改成把预算临时抬高 + 清掉去重记录：场上还在打仗，八十米外的低优先级
  //    音随时会被预算闸或 22 ms 窗吃掉，那样这条断言就成了抛硬币。
  const savedBudget = a.nodeBudget;
  a.nodeBudget = 4000;
  a.lastPlayAt.delete("explosionFar");
  const boom = Snap(a.Play("explosionFar", { position: At(80), volume: 0.02 }));
  a.nodeBudget = savedBudget;
  await sleep(140);
  const mine = Snap(a.Play("rifleNra", { position: At(1), priority: true, volume: 0.05 }));
  await sleep(140);

  const queries = a.stats.occlusionQueries;
  a.SetProbes({ occlusion: null, zone: null });
  return { clear, blocked, inside, outside, boom, mine, queries };
});

if (!spatial.clear || !spatial.blocked) {
  Fail(`遮挡量不到（Play 返回 null）：${JSON.stringify(spatial)}`);
} else {
  const dropDb = 20 * Math.log10(spatial.blocked.dry / spatial.clear.dry);
  const wetDb = 20 * Math.log10(spatial.blocked.wet / spatial.clear.wet);
  if (spatial.blocked.occ !== 1) Fail(`遮挡探针没接上：occ ${spatial.blocked.occ}（应为 1）`);
  else if (dropDb > -9) Fail(`挡死的那一枪干声只低了 ${(-dropDb).toFixed(1)} dB（至少要 9 dB）`);
  else if (spatial.blocked.airHz > 1000) Fail(`挡死的那一枪低通还在 ${spatial.blocked.airHz.toFixed(0)} Hz（上限 1000）`);
  else if (wetDb <= dropDb + 3) {
    Fail(`遮挡把湿声也压了 ${(-wetDb).toFixed(1)} dB —— 隔着墙听见的主要就是混响，湿要掉得比干少得多`);
  } else {
    Ok(`遮挡成立：干 ${dropDb.toFixed(1)} dB / 湿 ${wetDb.toFixed(1)} dB / 低通 `
      + `${spatial.clear.airHz.toFixed(0)} → ${spatial.blocked.airHz.toFixed(0)} Hz（射线 ${spatial.queries} 次）`);
  }
}
if (!spatial.inside || !spatial.outside) Fail("分区混响量不到（Play 返回 null）");
else if (spatial.inside.zone !== "interior" || !spatial.inside.interiorConv) {
  Fail(`zone=interior 的声音没接到 interior 卷积上：${JSON.stringify(spatial.inside)}`);
} else if (!spatial.outside.streetConv) {
  Fail(`zone=street 的声音接错了卷积：${JSON.stringify(spatial.outside)}`);
} else Ok("分区混响按声源所在区选 send（interior / street 各自接对）");

if (!spatial.boom || !spatial.mine) Fail("传播延迟量不到（Play 返回 null）");
else if (Math.abs(spatial.boom.propagation - 80 / 340) > 0.01) {
  Fail(`八十米外的爆炸延迟 ${spatial.boom.propagation.toFixed(3)} s（应为 ${(80 / 340).toFixed(3)}）`);
} else if (spatial.mine.propagation !== 0) {
  Fail(`玩家自己那一枪被延迟了 ${spatial.mine.propagation.toFixed(3)} s —— priority 必须跟手`);
} else Ok(`传播延迟：80 m 外 ${spatial.boom.propagation.toFixed(3)} s、玩家自己 0 s`);

// 探针不注册时必须**逐条回到老行为**：不建遮挡节点、不延迟、混响仍走全局那一档。
// 这一条是整块的安全带 —— 宿主还没接线的那几天，游戏不许因为这一轮变难听。
const noProbe = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  a.SetProbes({ occlusion: null, zone: null });
  await sleep(60);
  const L = a.listenerPos;
  const v = a.Play("rifleIja", { position: { x: L.x + 20, y: L.y, z: L.z + 5 }, priority: true, volume: 0.05 });
  return v && { occ: v.occ, occGain: !!v.occGain, zone: v.reverbZone, space: a.space, propagation: v.propagation };
});
if (!noProbe) Fail("没注册探针时连声音都没了");
else if (noProbe.occ !== 0 || noProbe.occGain) Fail(`没注册遮挡探针却建了遮挡节点：${JSON.stringify(noProbe)}`);
else if (noProbe.zone !== noProbe.space) Fail(`没注册 zone 探针却没退回全局档：${JSON.stringify(noProbe)}`);
else Ok(`探针不注册时逐条回到老行为（occ 0、无额外节点、混响走 ${noProbe.space}）`);

// duck / 耳鸣：**采样路径下**也要触发。
// 这条正是这一轮修的 bug —— 原来 A.Duck 写在合成配方体内，采样一盖上去就再也不执行，
// 于是正常路径整局零 duck。用 sampleCues 断言当前确实走的是采样路径，不然测了个寂寞。
const duck = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sampled = a.sampleCues.has("explosionNear");
  a.duckGain.gain.cancelScheduledValues(a.ctx.currentTime);
  a.duckGain.gain.value = 1;
  a.deafFilter.frequency.cancelScheduledValues(a.ctx.currentTime);
  a.deafFilter.frequency.value = 20000;
  const before = a.duckGain.gain.value;
  const ducks = a.stats.ducks, deafens = a.stats.deafens;
  // 脚边那一颗：不给 position = 满量
  a.Play("explosionNear", { priority: true, volume: 0.02 });
  // 【2026-09-09】起音期（Script_Audio.DEAFEN_ATTACK_HOLD_S = 0.13 s）：这一段里
  // 总线仍是全带宽的 —— 原来 30 ms 就压到 520 Hz，把**触发耳鸣的那一声自己**
  // 的高频吃掉了。所以要量两次：起音期内还开着，起音期过后才闷。
  await sleep(60);
  const attack = { deaf: a.deafFilter.frequency.value };
  await sleep(200);
  const near = { gain: a.duckGain.gain.value, deaf: a.deafFilter.frequency.value };
  await sleep(2600);
  // 二百米外那一颗：按距离缩放之后应该几乎不压，也绝不许震聋玩家
  a.duckGain.gain.cancelScheduledValues(a.ctx.currentTime);
  a.duckGain.gain.value = 1;
  a.deafFilter.frequency.cancelScheduledValues(a.ctx.currentTime);
  a.deafFilter.frequency.value = 20000;
  const L = a.listenerPos;
  a.Play("explosionNear", { position: { x: L.x + 200, y: L.y, z: L.z }, priority: true, volume: 0.02 });
  await sleep(120);
  const far = { gain: a.duckGain.gain.value, deaf: a.deafFilter.frequency.value };
  return { sampled, before, attack, near, far, ducks: a.stats.ducks - ducks, deafens: a.stats.deafens - deafens };
});
if (!duck.sampled) Fail("explosionNear 还没被采样盖住 —— 这条断言测的正是采样路径，先修上面那条");
else if (!(duck.near.gain < 0.6)) Fail(`采样路径下 explosionNear 没有 duck：duckGain ${duck.near.gain.toFixed(3)}（应 < 0.6）`);
else if (!(duck.attack.deaf > 15000)) Fail(`耳鸣把爆炸自己的起音吃掉了：60 ms 时低通已到 ${duck.attack.deaf.toFixed(0)} Hz（起音期内应 > 15000）`);
else if (!(duck.near.deaf < 2000)) Fail(`脚边那颗没有耳鸣：耳鸣低通 ${duck.near.deaf.toFixed(0)} Hz（应 < 2000）`);
else if (!(duck.far.gain > 0.9)) Fail(`二百米外那颗把配乐压到了 ${duck.far.gain.toFixed(3)} —— duck 没按距离缩放`);
else if (!(duck.far.deaf > 15000)) Fail(`二百米外那颗把玩家震聋了：耳鸣低通 ${duck.far.deaf.toFixed(0)} Hz`);
else Ok(`采样路径下 duck 与耳鸣照常触发且按距离缩放（贴脸 ${duck.near.gain.toFixed(2)}/`
  + `${duck.near.deaf.toFixed(0)} Hz，200 m ${duck.far.gain.toFixed(2)}/${duck.far.deaf.toFixed(0)} Hz）`);

// 玩家开枪压环境（HDR-lite）：环境床让路 −6 dB，40 ms 压、300 ms 放。
//
// 【2026-09-09】**远声组不再跟着一起走**：栓动步枪单发只压环境床，
// 自动武器 / 连着打才另压远声组，而且只 −3 dB（FIRE_DUCK_FAR_AMOUNT）。
// 原来两条共用一个 −6 dB，于是玩家一连打远处那一片就一直被摁在下面 ——
// 用户报的「打起来整个战场安安静静的」有一半是它。
//
// **必须先给这两条总线喂一路输入**：Chrome 对「上游全静音」的子图会整段跳过处理，
// 于是 AudioParam 的自动化压根不推进，`gain.value` 一直读到你写进去的那个静态值 ——
// 表现就是「DuckAmbience 明明调了、总线纹丝不动」。踩过一次，写在这儿。
// 用 ConstantSource 喂 1e-6（听不见，但不是静音），量完停掉。
const hdr = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  // The 70 ms probe measures WebAudio's attack/hold, not a busy menu render.
  // Freeze only visual frame work during this probe; the real audio clock and
  // first-person Play/DuckAmbience path keep running with unchanged assertions.
  const state = window.Taierzhuang.state;
  const wasWarming = state.warming;
  state.warming = true;
  try {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const keepAlive = [a.ambienceBus, a.farGain].map((dst) => {
    const cs = a.ctx.createConstantSource();
    cs.offset.value = 1e-6;
    cs.connect(dst);
    cs.start();
    return cs;
  });
  const t = a.ctx.currentTime;
  a.ambienceDuck.gain.cancelScheduledValues(t); a.ambienceDuck.gain.value = 1;
  a.farGain.gain.cancelScheduledValues(t); a.farGain.gain.value = 1;
  await sleep(120);
  const before = { amb: a.ambienceDuck.gain.value, far: a.farGain.gain.value, n: a.stats.ambienceDucks };
  const L = a.listenerPos;
  const at = { x: L.x, y: L.y, z: L.z - 0.4 };
  // ① 栓动单发：**上一枪要足够久以前**，否则被判成「连着打」。
  a.lastSelfShotAt = -99;
  a.Play("rifleNra", { position: at, priority: true, volume: 0.02, firstPerson: true, weaponClass: "rifle" });
  await sleep(70);
  const single = { amb: a.ambienceDuck.gain.value, far: a.farGain.gain.value };
  await sleep(600);
  const released = { amb: a.ambienceDuck.gain.value, far: a.farGain.gain.value };
  // ② 自动武器那一枪：远声组这一次要动，而且只动 −3 dB。
  a.farGain.gain.cancelScheduledValues(a.ctx.currentTime); a.farGain.gain.value = 1;
  a.lastPlayAt.delete("zb26");
  a.Play("zb26", { position: at, priority: true, volume: 0.02, firstPerson: true, weaponClass: "mg" });
  await sleep(70);
  const mg = { amb: a.ambienceDuck.gain.value, far: a.farGain.gain.value };
  for (const cs of keepAlive) { try { cs.stop(); cs.disconnect(); } catch (err) { /* 已停 */ } }
  return { before, single, released, mg, n: a.stats.ambienceDucks - before.n };
  } finally {
    state.warming = wasWarming;
  }
});
if (!hdr.n) Fail("玩家开枪没有触发 DuckAmbience（stats.ambienceDucks 没动）");
else if (!(hdr.single.amb < 0.7)) Fail(`开枪后环境总线只压到 ${hdr.single.amb.toFixed(3)}（应 < 0.7，约 −6 dB）`);
else if (!(hdr.single.far > 0.95)) Fail(`栓动单发把远声组压到了 ${hdr.single.far.toFixed(3)} —— 单发不许动远声组`);
else if (!(hdr.released.amb > 0.95)) Fail(`开枪 0.67 s 之后环境还压着 ${hdr.released.amb.toFixed(3)} —— 放不回来`);
else if (!(hdr.mg.far < 0.85 && hdr.mg.far > 0.55)) {
  Fail(`自动武器那一枪远声组压到 ${hdr.mg.far.toFixed(3)}（应在 0.55—0.85，约 −3 dB）`);
} else {
  Ok(`玩家开枪压环境：${hdr.before.amb.toFixed(2)} → ${hdr.single.amb.toFixed(2)} → `
    + `${hdr.released.amb.toFixed(2)}；远声组 单发 ${hdr.single.far.toFixed(2)}（不动）/ `
    + `自动 ${hdr.mg.far.toFixed(2)}（−3 dB）`);
}

// Voice stealing：预算打满时玩家的 priority 枪必须 100% 出声，而且是**偷**出来的位置。
//
// 预算压到 8 才量得准：撑满 120 个节点要在浏览器里排几十条真声音，
// 而这期间场上的 AI 随时会插一脚 —— 那种测法是抛硬币，不是断言。
const steal = await page.evaluate(async () => {
  const a = window.Taierzhuang.audio;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const saved = a.nodeBudget;
  a.Ambience("silence"); a.Music(null);
  await sleep(400);
  const L = a.listenerPos;
  // 顺序很要紧：**先把填料放进去，再把预算压到它们已经撑破的位置**。
  // 反过来（先压预算再放填料）测不到东西 —— 场上的 AI 一直在打，
  // liveNodes 在你压预算的那一刻是多少全看运气，填料会被当场饿死，
  // 于是一条可偷的都没有，断言变成抛硬币（第一版就是这么翻的红）。
  //
  // 填料：30—37 m 外、音量极低的长音。比玩家那一枪又轻又远，正是该让位的那一类。
  // 距离压在 FAR_LOW_PRIORITY_M（45 m）以内 —— 再远它们自己就进不了门，
  // 那样测到的是低优先级天花板，不是 voice stealing。
  a.nodeBudget = 4000;
  const filler = ["shellImpact", "explosionFar", "painMoan", "flareBurn", "telegraphHum", "mgOverheat"];
  for (let i = 0; i < 8; i += 1) {
    a.Play(filler[i % filler.length], { position: { x: L.x + 30 + i, y: L.y, z: L.z + i }, volume: 0.01 });
    await sleep(40);
  }
  a.nodeBudget = Math.max(6, Math.floor(a.liveNodes * 0.8));
  const shots = [];
  const before = { stolen: a.drops.stolen, starved: a.drops.starved };
  for (let i = 0; i < 12; i += 1) {
    const v = a.Play("rifleNra", { position: { x: L.x, y: L.y, z: L.z - 0.4 }, priority: true, volume: 0.02, firstPerson: true });
    shots.push(!!v);
    await sleep(120);
  }
  const out = {
    fired: shots.filter(Boolean).length, total: shots.length,
    stolen: a.drops.stolen - before.stolen, starved: a.drops.starved - before.starved,
    liveNodes: a.liveNodes, over: a.stats.priorityOverBudget,
  };
  a.nodeBudget = saved;
  await sleep(400);
  return out;
});
if (steal.fired !== steal.total) {
  Fail(`预算打满时玩家开了 ${steal.total} 枪只响了 ${steal.fired} 枪 —— priority 必须 100% 出声`);
} else if (steal.stolen < 1) {
  Fail(`预算打满却一条都没偷（stolen ${steal.stolen}，starved ${steal.starved}）—— 这条断言没测到东西`);
} else Ok(`预算打满：玩家 ${steal.fired}/${steal.total} 枪全响，偷了 ${steal.stolen} 条`
  + `（超支放行 ${steal.over} 次，饿死 ${steal.starved} 条）`);

// 两级动态：母线慢压 + 末端快限，参数不许被谁顺手改回单级。
// 抽泵深度的实测（10.08 → 8.91 dB）在 Script_Audio 的 BUS_COMP 抬头与
// docs/Data_AudioEngine.md 里，那是离线渲染量的，不在这条冒烟的成本里。
const chain = await page.evaluate(() => {
  const a = window.Taierzhuang.audio;
  return {
    bus: a.busComp ? { thr: a.busComp.threshold.value, ratio: a.busComp.ratio.value, rel: a.busComp.release.value } : null,
    makeup: a.busMakeup ? a.busMakeup.gain.value : null,
    peak: { thr: a.limiter.threshold.value, ratio: a.limiter.ratio.value, atk: a.limiter.attack.value },
    reverbs: Object.keys(a.reverbs).sort(),
    irSeconds: Object.fromEntries(Object.entries(a.reverbs).map(([k, c]) => [k, +c.buffer.duration.toFixed(2)])),
  };
});
if (!chain.bus) Fail("母线慢压缩不见了 —— 两级动态被改回单级");
else if (!(chain.bus.ratio <= 2 && chain.bus.rel >= 0.5)) {
  Fail(`母线那只不「慢」了：ratio ${chain.bus.ratio} / release ${chain.bus.rel}（慢压缩要 ratio ≤ 2、release ≥ 0.5）`);
} else if (!(chain.peak.ratio >= 12 && chain.peak.atk <= 0.006)) {
  Fail(`末端那只不「快」了：ratio ${chain.peak.ratio} / attack ${chain.peak.atk}`);
} else if (chain.reverbs.join(",") !== "courtyard,interior,open,street") {
  Fail(`混响不是四档：${chain.reverbs.join(" ")}`);
} else if (!(chain.irSeconds.interior < chain.irSeconds.courtyard
    && chain.irSeconds.courtyard < chain.irSeconds.street
    && chain.irSeconds.street < chain.irSeconds.open)) {
  Fail(`四档 IR 的时长排序不对：${JSON.stringify(chain.irSeconds)}`);
} else Ok(`两级动态在位（母线 ${chain.bus.thr}/${chain.bus.ratio}:1/${chain.bus.rel}s ×${chain.makeup}，`
  + `末端 ${chain.peak.thr}/${chain.peak.ratio}:1）；四档 IR ${JSON.stringify(chain.irSeconds)}`);

// Continuous audition regression: real AudioBufferSource nodes must stop, including
// scheduled repeats and editor exit, without stopping an unrelated gameplay engine.
const preview = await page.evaluate(async () => {
  const {AudioEditor} = await import("./Script_EditorAudio.mjs");
  const a = window.Taierzhuang.audio;
  const root = document.createElement("div"); document.body.appendChild(root);
  const editor = new AudioEditor({audio:a, Close:()=>editor.Exit()});
  const world = a.Play("planeDrone", {priority:true, volume:.01,
    position:{x:a.listenerPos.x+50,y:a.listenerPos.y+15,z:a.listenerPos.z}});
  const source = world?.nodes.find(node => node instanceof AudioBufferSourceNode);
  a.MoveVoice(world,{x:a.listenerPos.x+40,y:a.listenerPos.y+15,z:a.listenerPos.z},{velocity:{x:-40,y:0,z:0}});
  const sampledLoop = !!source?.loop && world.loop && typeof world.SetDoppler === "function" && world.doppler > 1;
  editor.Enter(root); editor.soundName="planeDrone"; editor.PlayCurrent(5);
  const first=[...editor.previewVoices], singleLoop=first.length===1 && first[0].loop;
  [...root.querySelectorAll("button")].find(b=>b.textContent==="■ 停止音效").click();
  const buttonStopped=first.every(v=>v.nodes.length===0&&!a.activeVoices.has(v));
  editor.PlayCurrent(); const previous=[...editor.previewVoices];
  editor.soundName="rifleNra";editor.PlayCurrent(5); const burst=[...editor.previewVoices];
  const switchStopped=previous.every(v=>v.nodes.length===0);
  editor.StopSoundPreview();const scheduledStopped=burst.length===5&&burst.every(v=>v.nodes.length===0);
  editor.soundName="planeDrone";editor.PlayCurrent();const timed=[...editor.previewVoices];
  await new Promise(resolve=>setTimeout(resolve,10300));
  const timeoutStopped=timed.every(v=>v.nodes.length===0)&&editor.previewVoices.size===0;
  editor.PlayCurrent();const exiting=[...editor.previewVoices];editor.Exit();
  const exitStopped=exiting.every(v=>v.nodes.length===0)&&editor.previewTimers.size===0;
  const worldRetained=a.activeVoices.has(world)&&world.nodes.length>0;
  a.StopVoice(world);root.remove();
  return {sampledLoop,singleLoop,buttonStopped,switchStopped,scheduledStopped,timeoutStopped,exitStopped,worldRetained};
});
if(Object.values(preview).some(value=>!value))Fail(`continuous audio preview lifecycle ${JSON.stringify(preview)}`);
else Ok("sampled aircraft Doppler; preview stop/switch/delayed burst/10-second timeout/exit; gameplay voice retained");

if (problems.length) { for (const p of problems.slice(0, 10)) Fail(p); }

await browser.close();
server.close();
console.log(failed ? `\n音频冒烟失败 ${failed} 项。` : "\n音频冒烟全过。");
process.exit(failed ? 1 : 0);
