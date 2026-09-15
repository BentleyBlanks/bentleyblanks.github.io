// 04 机枪点位关中过场《空地上的三个人》**听得见没有**的门禁。
//   node Taierzhuang1938/Script_MachineGunCutsceneAudioTest.mjs
//
// 为什么专门再开一条：`Script_FirstLevelMachineGunCutsceneTest` 已经守住了触发、
// 只播一次、期间世界冻结、还权。它一条都没漏，而 2026-09-16 用户实机反馈的是
// 「这一场声音完全听不见」—— 因为那条测试从头到尾没有问过**输出端有没有电平**。
//
// 「visible ≠ 看得见」的同一条老教训换了个媒介：**`Play` 返回了 ≠ 听得见**。
// 这里按三层逐层钉死，缺一层都能给出「全绿但静音」：
//   1. **声库里有没有这九条 cue**（`audio.voiceBank`）。没有的话 `Play` 在
//      `RECIPES[name]` 那一行静默返回 null —— 没有异常、没有 404、日志全干净。
//   2. **`Play` 有没有真的建起播放头**（返回值非 null 且挂着 buffer 源）。
//   3. **AudioContext 的输出端有没有电平**：`softClip`（destination 前最后一环）
//      上挂一只 AnalyserNode，逐帧量 RMS，按每条台词的起播时刻归窗取峰值。
//
// 对照组是 03 阶段班长那条既有对白（`voice.MissionSupportOrder`），走**同一条
// `Play` 路径、同一只探针**：它量得到，就证明探针本身是好的，九条为零就只能是九条的事。
//
// 三条现场纪律（都踩过）：
//   · URL 不带 `?shot=1` / `audio=0` —— 那两个会把 AudioEngine 整个关掉；
//   · `manual=1` 接管时钟，但**推帧的步长必须是真实经过的时间**：WebAudio 的
//     `ctx.currentTime` 只会按真实时间走，一口气 StepFrames(2640) 会把 44 s 的
//     拍表压进半秒真实时间里，九条台词全叠在一起，量出来的东西没有意义；
//   · 不出画时要**自己把听者贴回相机**（正片里那一行在 `RenderScene` 里）。
//     这一场的台词与音效全是非空间化的，但听者位置仍然决定遮挡/分区那两条探针。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { CS_MachineGunCaptives, VOICE_LINES as CAPTIVE_LINES } from "./Data_CutsceneMachineGunCaptives.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots/MachineGunCutsceneAudio");
const CUT_ID = "CS_MachineGunCaptives";

/** 对照组：03 阶段（Support）班长那条既有整段录音。它与九条台词走同一条 Play。 */
const CONTROL_CUE = "MissionSupportOrder";

/**
 * 判据（输出端峰值 RMS，线性幅度，不是 dB）。
 *
 * **不是拍脑袋的**：修复前这九条在同一只探针下全是 0.0000（`Play` 返回 null，
 * 声库里根本没有这批 cue）；对照组在同一只探针下实测 0.02 量级。取 0.002 是
 * 对照组的约十分之一 —— 既远高于底噪（实测 1e-4 量级），又留足了余量给
 * `weak` 档那两条（比常态轻 3 dB）、以及不同机器的母线压缩差异。
 */
const VOICE_RMS_FLOOR = 0.002;
/** 黑场里那几记刀与倒地：那一段没有台词，量到的就是音效本身。 */
const SFX_RMS_FLOOR = 0.002;
/** 每条起播之后取多长的窗做峰值。0.6 s 足够覆盖第一个重音节。 */
const WINDOW_S = 0.6;

/** 拍表里每条台词、每条音效的全局秒（与 Script_Cutscene._FireCues 同一口径）。 */
function Schedule(cut) {
  const lines = [];
  const sfx = [];
  let start = 0;
  for (const shot of cut.shots || []) {
    for (const line of shot.lines || []) {
      const cue = line.voiceCue ?? line.voice ?? null;
      if (cue) lines.push({ cue, at: +(start + (Number(line.at) || 0)).toFixed(2) });
    }
    for (const entry of shot.sfx || []) sfx.push({ name: entry.name, at: +(start + (Number(entry.at) || 0)).toFixed(2) });
    start += shot.seconds || 0;
  }
  return { lines, sfx, seconds: start };
}

const plan = Schedule(CS_MachineGunCaptives);
const failures = [];
const receipts = {};
const Check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures.push(label);
  return ok;
};

await fs.mkdir(out, { recursive: true });
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 240)));
page.on("response", (response) => {
  if (/\/Audio\//.test(response.url()) && response.status() >= 400) {
    pageErrors.push(`HTTP ${response.status()} ${response.url().split("/").pop()}`);
  }
});

try {
  await page.goto(process.env.MISSION_TEST_URL
    || `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=low&scale=small`,
  { timeout: 180000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 240000 });
  // 真手势解锁 AudioContext：page.evaluate 不算手势，page.mouse.click 算。
  await page.mouse.click(640, 400);
  await page.evaluate(() => window.Tengxian.audio.Unlock());
  await page.waitForFunction(() => {
    const a = window.Tengxian.audio;
    return a.Ready && !a.voiceLoading && !a.sfxLoading;
  }, null, { timeout: 120000 });

  // --- 第 1 层：声库里到底有没有这九条 ---------------------------------------
  // 这一关（?whitebox=p012）的声库是**两路共用**的：第一关的整段录音由
  // Script_FirstLevelMissionVoice 装（键名 Mission*），战场口令与 ch0/ch1 章节台词
  // 由 AudioEngine.LoadVoicePack 装（Data_Voice.VOICE_LINES）。建关时装配层
  // `await missionRuntime.voiceReady`，所以前一路必然先落地 —— 两路共用一个
  // 「载过没有」的旗标时，后一路会被永久挡在门外（那正是本轮的根因）。
  const bank = await page.evaluate((cues) => {
    const a = window.Tengxian.audio;
    const keys = [...a.voiceBank.keys()];
    return {
      ctxState: a.ctx?.state, ready: a.Ready,
      voicesReady: a.voicesReady, voicePackReady: a.voicePackReady,
      packAttempts: { ...a.packAttempts },
      bankSize: keys.length,
      mission: keys.filter((k) => k.startsWith("Mission")).length,
      ch0: keys.filter((k) => k.startsWith("ch0_")).length,
      ch1: keys.filter((k) => k.startsWith("ch1_")).length,
      battle: keys.filter((k) => !k.startsWith("Mission") && !k.startsWith("ch")).length,
      missing: cues.filter((cue) => !a.voiceBank.has(cue)),
      controlInBank: a.voiceBank.has("MissionSupportOrder"),
      voiceErrors: a.voiceErrors.slice(0, 6),
      masterVolume: a.masterVolume, mix: { ...a.mix },
    };
  }, CAPTIVE_LINES.map((line) => line.key));
  receipts.bank = bank;
  console.log("bank", JSON.stringify(bank));
  Check(bank.ctxState === "running", "AudioContext 已解锁并在跑", bank.ctxState);
  Check(bank.voicePackReady && bank.packAttempts.voice >= 1,
    "VOICE_LINES 这一包在本入口真的载过", JSON.stringify(bank.packAttempts));
  Check(bank.missing.length === 0, "本场九条 cue 全在声库里", JSON.stringify(bank.missing));
  Check(bank.battle >= 50 && bank.ch1 > 0 && bank.mission > 0,
    "两路声库并存（战场口令 + 章节台词 + 第一关整段录音）",
    JSON.stringify({ battle: bank.battle, ch0: bank.ch0, ch1: bank.ch1, mission: bank.mission }));
  Check(bank.controlInBank, "对照组那条既有对白也在声库里");

  // --- 对照组：证明探针本身量得到声音 ---------------------------------------
  const control = await page.evaluate(async ({ cue, windowS }) => {
    const a = window.Tengxian.audio;
    const analyser = a.ctx.createAnalyser();
    analyser.fftSize = 2048;
    a.softClip.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const Rms = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      return Math.sqrt(sum / data.length);
    };
    // 先量 0.5 s 底噪（环境床照常在放，这就是这一场真实的地板）
    let floor = 0;
    const floorUntil = a.ctx.currentTime + 0.5;
    while (a.ctx.currentTime < floorUntil) {
      floor = Math.max(floor, Rms());
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    // 与 Script_Cutscene._PlayVoice 逐字相同的调用
    const voice = a.Play(`voice.${cue}`, { volume: 1, priority: true, offset: 0 });
    // 源节点要**就地**数：ReleaseVoice 到点会把 nodes 清空，播完再数永远是 0。
    const sources = voice ? voice.nodes.filter((n) => n.buffer).length : 0;
    const outGain = voice?.out?.gain ? voice.out.gain.value : null;
    let peak = 0;
    const until = a.ctx.currentTime + Math.max(windowS, 1.6);
    while (a.ctx.currentTime < until) {
      peak = Math.max(peak, Rms());
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    if (voice) a.StopVoice(voice);
    a.softClip.disconnect(analyser);
    return { floor: +floor.toFixed(6), peak: +peak.toFixed(6), ok: !!voice, sources, outGain };
  }, { cue: CONTROL_CUE, windowS: WINDOW_S });
  receipts.control = control;
  console.log("control", JSON.stringify(control));
  Check(control.ok && control.sources > 0, "对照组建起了真实采样源", JSON.stringify(control));
  Check(control.peak >= VOICE_RMS_FLOOR * 3 && control.peak > control.floor * 3,
    "对照组在输出端量到明确高于底噪的电平（探针本身是好的）",
    `peak=${control.peak} floor=${control.floor}`);

  // --- 夹具：摆到 04，人放在触发圈里 ----------------------------------------
  // 与 Script_FirstLevelMachineGunCutsceneTest 同一套阶段摆法。差别是这里**直接
  // 站到座位上**：那条测试已经守住了「必须自己走进来才触发」，这里要验的是声音，
  // 多走七米只会把 44 s 的实时采样又推远一点。
  await page.evaluate(async () => {
    const g = window.Tengxian;
    await g.Debug.FirstLevelJump(3);
    const r = g.Debug.FirstLevelMissionRuntime();
    const { MISSION_STAGES } = await import("./Data_FirstLevelMission.mjs");
    const { OPENING } = await import("./Data_FirstLevelOpening.mjs");
    for (const [id, a] of r.enemies) if (a.missionEncounter === "intrusion") { r.ai.Remove(a); r.enemies.delete(id); }
    r.flow.index = MISSION_STAGES.findIndex((s) => s.id === "Support");
    r.flow.Enter();
    r.Record("frontBattleStarted");
    r.SpawnEncounter("front");
    for (let i = 0; i < 100 && r.spawnQueue.length; i += 1) r.DrainSpawns();
    // 路上不留还在开枪的人：这一场要量的是过场自己的电平，不是背景里的枪战。
    for (const a of r.enemies.values()) if (["front", "approach", "tank"].includes(a.missionEncounter)) a.TakeHit(1000, "torso", null);
    r.opening.zhou.TakeHit(50, "torso", null);
    r.PlaceActor(r.opening.zhou, OPENING.zhouRest);
    r.opening.UpdateZhou();
    for (const [i, a] of r.squad.entries()) { r.PlaceActor(a, OPENING.frontPosts[i]); r.squadRoutes.set(a.id, []); }
    r.flow.index = MISSION_STAGES.findIndex((s) => s.id === "MachineGun");
    r.flow.Enter();
    const p = r.Point({ x: 0, z: -127.4 });
    g.player.position.copy(p);
    g.player.body.Teleport(p.x, p.y, p.z);
    g.player.yaw = 0;
    g.player.pitch = 0;
    g.player.stance = "crouch";
    g.player.SyncCamera(0);
  });

  // --- 实时推完整场，逐帧量输出端 -------------------------------------------
  const run = await page.evaluate(async ({ cutId, seconds }) => {
    const g = window.Tengxian, a = g.audio;
    const analyser = a.ctx.createAnalyser();
    analyser.fftSize = 2048;
    a.softClip.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const Chain = () => ({
      master: +a.masterGain.gain.value.toFixed(4),
      sfxBus: +a.sfxBus.gain.value.toFixed(4),
      sfxUser: +a.sfxUser.gain.value.toFixed(4),
      duck: +a.duckGain.gain.value.toFixed(4),
      storyDuck: +a.storyDuck.gain.value.toFixed(4),
      hitGain: +a.hitGain.gain.value.toFixed(4),
      outGain: +a.outGain.gain.value.toFixed(4),
      deafHz: Math.round(a.deafFilter.frequency.value),
      hitHz: Math.round(a.hitFilter.frequency.value),
      concussionHz: Math.round(a.concussionFilter.frequency.value),
    });
    // Play 逐条记账：返回值、增益链、空间化与否、听者与相机的距离。
    const plays = [];
    const original = a.Play.bind(a);
    a.Play = (name, opts = {}) => {
      const voice = original(name, opts);
      const playing = g.Debug.Cutscene();
      plays.push({
        name, t: +a.ctx.currentTime.toFixed(3),
        cutTime: playing.playing ? +playing.time.toFixed(2) : null,
        ok: !!voice,
        inBank: name.startsWith("voice.") ? a.voiceBank.has(name.slice(6)) : null,
        spatial: !!opts.position, priority: !!opts.priority,
        sources: voice ? voice.nodes.filter((node) => node.buffer).length : 0,
        outGain: voice?.out?.gain ? +voice.out.gain.value.toFixed(4) : null,
        effectiveGain: voice ? +voice.effectiveGain.toFixed(4) : null,
        distance: voice ? +voice.distance.toFixed(2) : null,
        chain: Chain(),
      });
      return voice;
    };
    const samples = [];
    let last = performance.now();
    const deadline = last + (seconds + 40) * 1000;
    let started = false;
    let listenerGap = 0;
    while (performance.now() < deadline) {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      g.StepFrames(1, dt, false);
      // 不出画时自己补上 RenderScene 里那一行：听者贴回**当前**相机（过场期间
      // 相机归导演）。不补的话听者停在玩家脚下，空间化那一路的取证全废。
      g.camera.updateWorldMatrix(true, false);
      a.SetListener(g.camera);
      listenerGap = Math.hypot(a.listenerPos.x - g.camera.position.x,
        a.listenerPos.y - g.camera.position.y, a.listenerPos.z - g.camera.position.z);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      const state = g.Debug.Cutscene();
      if (state.playing) started = true;
      samples.push({ t: +a.ctx.currentTime.toFixed(3), ct: +state.time.toFixed(2),
        rms: Math.sqrt(sum / data.length), playing: state.playing });
      if (started && !state.playing) break;
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    a.softClip.disconnect(analyser);
    delete a.Play;
    // `state.cutscenesPlayed` 是在 `RunCutscene` 的 `await pending` 之后才记的。
    // 时间轴走完那一帧同步读它永远是空的 —— 让出一趟事件循环再读。
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { plays, samples, started, listenerGap: +listenerGap.toFixed(3),
      current: g.Debug.Cutscene().current,
      playedIds: g.Debug.Cutscene().played.map((entry) => entry.id) };
  }, { cutId: CUT_ID, seconds: plan.seconds });

  const Peak = (from, to) => run.samples.reduce((best, s) => (s.t >= from && s.t <= to ? Math.max(best, s.rms) : best), 0);
  // 真正的地板取**拍表里写明全静的那一段**：镜 5（35–38 s）的末 1 s。
  // 用「所有起播窗之外的采样点取中位数」当地板是不对的 —— 台词本身有三四秒长，
  // 那个中位数量的是「过场平均有多响」，不是「没有声音时有多响」。
  const silence = run.samples.filter((s) => s.ct >= 37.4 && s.ct <= 38.0).map((s) => s.rms).sort((x, y) => x - y);
  const floor = silence.length ? +silence[Math.floor(silence.length / 2)].toFixed(6) : 0;
  receipts.floor = floor;
  receipts.silenceSamples = silence.length;
  receipts.listenerGap = run.listenerGap;
  receipts.samples = run.samples.length;
  receipts.plays = run.plays.map((p) => ({ name: p.name, t: p.t, cutTime: p.cutTime, ok: p.ok,
    inBank: p.inBank, spatial: p.spatial, priority: p.priority, sources: p.sources,
    outGain: p.outGain, effectiveGain: p.effectiveGain, distance: p.distance }));
  receipts.chainAtFirstLine = run.plays.find((p) => p.name.startsWith("voice."))?.chain ?? null;

  Check(run.started && run.playedIds.filter((id) => id === CUT_ID).length === 1,
    "过场在本轮真的播了一次", JSON.stringify({ played: run.playedIds, current: run.current }));
  Check(run.samples.length > plan.seconds * 20,
    `实时采样点够密（${run.samples.length} 点 / ${plan.seconds} s）`);
  Check(run.listenerGap < 0.01, "听者每帧贴在过场相机上", `gap=${run.listenerGap} m`);
  console.log(`floor(中位) = ${floor}`);

  // --- 九条台词逐条：Play 建起来了 + 输出端有电平 -----------------------------
  // 取窗到**整条录音**为止，不是只取头 0.6 s：`ch1_captive_old_01` 那条
  // （weak 档、「龟儿子……」起手）前 0.6 s 实测只有 −53…−31 dB，重音落在 1.2–1.8 s。
  // 只量头 0.6 s 会把「起手轻」误判成「听不见」。头 0.6 s 的数照样记账（peak06）。
  const lineRows = plan.lines.map((entry) => {
    const play = run.plays.find((p) => p.name === `voice.${entry.cue}`) || null;
    const dur = CAPTIVE_LINES.find((line) => line.key === entry.cue)?.dur || 1;
    return { ...entry, play, dur,
      peak: play ? +Peak(play.t, play.t + dur).toFixed(6) : 0,
      peak06: play ? +Peak(play.t, play.t + WINDOW_S).toFixed(6) : 0 };
  });
  receipts.lines = lineRows.map((row) => ({ cue: row.cue, at: row.at, dur: row.dur,
    peak: row.peak, peak06: row.peak06,
    ok: !!row.play?.ok, inBank: row.play?.inBank ?? null, sources: row.play?.sources ?? 0,
    spatial: row.play?.spatial ?? null, outGain: row.play?.outGain ?? null,
    distance: row.play?.distance ?? null, chain: row.play?.chain ?? null }));
  console.log("lines", JSON.stringify(receipts.lines.map((r) => ({ cue: r.cue, at: r.at,
    peak: r.peak, peak06: r.peak06, ok: r.ok, sources: r.sources, spatial: r.spatial }))));
  for (const row of lineRows) {
    Check(!!row.play && row.play.ok && row.play.sources > 0,
      `${row.cue}（拍表 ${row.at}s）起播时建起了真实播放头`,
      JSON.stringify({ ok: row.play?.ok, inBank: row.play?.inBank, sources: row.play?.sources }));
    Check(row.play ? row.play.spatial === false : false,
      `${row.cue} 走非空间化（对白不吃距离衰减）`, `distance=${row.play?.distance}`);
    Check(row.peak >= VOICE_RMS_FLOOR,
      `${row.cue} 整条录音窗内输出端峰值 RMS ≥ ${VOICE_RMS_FLOOR}`,
      `peak=${row.peak} peak06=${row.peak06} floor=${floor}`);
  }
  // 两条**前后都干净**的台词单独再钉一次：它们的窗里没有任何别的 cue 的尾巴，
  // 量到的电平只可能是台词自己的（防「被音效尾巴抬过阈值」的假绿）。
  for (const cue of ["ch1_ija_gunso_02", "ch1_ija_hei_01"]) {
    const row = lineRows.find((r) => r.cue === cue);
    Check(row && row.peak >= floor * 8,
      `${cue} 在无遮挡窗里明确高于静场地板`, `peak=${row?.peak} floor=${floor}`);
  }

  // --- 音效：一条都不许被去重闸/预算闸静默吃掉 --------------------------------
  const sfxRows = plan.sfx.map((entry, index) => {
    const same = plan.sfx.filter((s) => s.name === entry.name);
    const rank = same.indexOf(entry);
    const play = run.plays.filter((p) => p.name === entry.name)[rank] || null;
    return { ...entry, index, play, peak: play ? +Peak(play.t, play.t + WINDOW_S).toFixed(6) : 0 };
  });
  receipts.sfx = sfxRows.map((row) => ({ name: row.name, at: row.at, peak: row.peak,
    ok: !!row.play?.ok, spatial: row.play?.spatial ?? null, outGain: row.play?.outGain ?? null }));
  console.log("sfx", JSON.stringify(receipts.sfx));
  const dropped = sfxRows.filter((row) => !row.play || !row.play.ok).map((row) => `${row.name}@${row.at}`);
  Check(dropped.length === 0, "拍表里每一条音效都真的起播了", JSON.stringify(dropped));
  // 镜 5 那一段（35–37 s）**没有台词**：那里量到的电平只可能来自刀与倒地本身。
  const blackShot = sfxRows.filter((row) => row.at >= 35 && row.at <= 37);
  for (const row of blackShot) {
    Check(row.peak >= SFX_RMS_FLOOR,
      `黑场里的 ${row.name}@${row.at}s 在输出端有电平（那一段没有台词打掩护）`,
      `peak=${row.peak}`);
  }

  Check(pageErrors.length === 0, "没有页面异常与音频 404", JSON.stringify(pageErrors.slice(0, 4)));
} finally {
  receipts.pageErrors = pageErrors;
  await fs.writeFile(path.join(out, "Data_MachineGunCutsceneAudio.json"),
    JSON.stringify(receipts, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.log(`FAIL 机枪点位关中过场音频：${failures.length} 项`);
  process.exit(1);
}
console.log("PASS 机枪点位关中过场音频：九条台词与全部音效在 AudioContext 输出端都有电平");
