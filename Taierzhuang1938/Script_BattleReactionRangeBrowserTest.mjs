// 人物战场反应测试场（?reactions=1）的浏览器验收：场地（壕沟 + 扬尘 + 布景）起得来、面板在；
// 真炸（Combat 生产链）之后第一人称相机按「背离爆点」扭头 / 低头 / 歪头 / 缩身、眼皮合上（后期合成收到）、
// 手臂收枪（Viewmodel 的 statePivot）、耳朵模型 trauma 的总线插好、朝爆点那只耳朵更闷；距离越近反应越大；
// 反应关掉 / 耳朵换回旧的 A/B；清空复位；以及用 OfflineAudioContext 渲染**正式的** EarTrauma 方法量 PCM：
// 起音期放过、之后外界变闷变小（朝爆点那只耳朵更狠）、耳鸣音高稳定且偏在挨炸那一侧、低频先回、主音量 0 时不鸣。
// 截图写到 tmp/BattleReactionRange/（已忽略目录，不提交）。纯规则那一半在 Script_BlastReactionTest.mjs。
// 用法：node Taierzhuang1938/Script_BattleReactionRangeBrowserTest.mjs     不碰真指针锁（navigator.webdriver 下游戏走假后端）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { BATTLE_REACTION_MUNITION_SPECS, BATTLE_REACTION_STANDS } from "./Data_BattleReactionRange.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "tmp", "BattleReactionRange");
fs.mkdirSync(out, { recursive: true });
const server = process.env.REACTION_PREVIEW ? null : await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGE ERROR", String(e)); });
page.on("console", (m) => { if (m.type() === "error") { errors.push(m.text()); console.log("CONSOLE ERROR", m.text().slice(0, 300)); } });
const result = {};
try {
  const base = process.env.REACTION_PREVIEW || `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/?reactions=1&shot=1&manual=1&quality=medium&scale=small`, { timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state.ready, null, { timeout: 300000 });
  console.log("SCENE ready");

  // ---- 场地与面板 ------------------------------------------------------------
  result.boot = await page.evaluate(() => {
    const t = window.Taierzhuang, field = t.battlefield;
    t.state.menu = false; t.audio.enabled = true; t.audio.Unlock();
    t.StepFrames(30, 1 / 60, false);
    const p = t.player.position;
    return {
      level: t.Debug.Level().id, pinned: t.state.pinned, invincible: t.player.debug.invincible,
      trench: field.stats.trenchEarth?.meshes ?? 0, layered: !!field.terrainLayers,
      deformable: t.scene.children.filter((c) => c.userData.deformableTerrain).length,
      dust: t.Debug.BattleReaction.State().dust, reaction: t.player.flinch.enabled,
      ear: t.audio.EarState(), soldiers: t.ai?.soldiers?.length ?? 0,
      // 站在沟里：脚下比沟沿低 1.5 m 以上。
      inTrench: field.GroundHeight(p.x, p.z) < field.GroundHeight(p.x, p.z - 3.6) - 1.2,
      panel: {
        title: document.querySelector(".battleReactionLab .siHead b")?.textContent,
        munitions: document.querySelectorAll(".battleReactionLab .brMunition").length,
        distances: document.querySelectorAll(".battleReactionLab .brDistance").length,
        bearings: document.querySelectorAll(".battleReactionLab .brBearing").length,
        stands: document.querySelectorAll(".battleReactionLab .brStand").length,
      },
    };
  });
  assert.equal(result.boot.level, "BattleReactionRange");
  assert.ok(result.boot.pinned && result.boot.invincible);
  assert.ok(result.boot.trench > 0 && result.boot.layered && result.boot.deformable > 0, "壕沟、分层土壤、可挖坑的地面都在");
  assert.ok(result.boot.dust, "扬尘开着");
  assert.ok(result.boot.reaction, "人物反应开着");
  assert.ok(result.boot.ear.model === "trauma" && result.boot.ear.installed, "耳朵模型 trauma 插在总线上");
  assert.equal(result.boot.soldiers, 0, "不刷敌人");
  assert.ok(result.boot.inTrench, "出生在射击壕沟底");
  assert.deepEqual(result.boot.panel, { title: "人物战场反应测试场", munitions: BATTLE_REACTION_MUNITION_SPECS.length,
    distances: 8, bearings: 9, stands: BATTLE_REACTION_STANDS.length });
  await page.evaluate(() => window.Taierzhuang.StepFrames(3));
  await page.screenshot({ path: path.join(out, "Test_Panel.png") });
  console.log("PASS scene / panel");

  // ---- 真炸：右边 5 m 手榴弹（同一站位，按冲击时间逐帧读）-------------------------
  const Blast = (args) => page.evaluate(async ({ munition, distanceM, bearing, frames }) => {
    const t = window.Taierzhuang, api = t.Debug.BattleReaction, p = t.player;
    api.Clear();
    p.yaw = 0; p.pitch = 0; t.StepFrames(2, 1 / 60, false);
    const yaw0 = p.yaw, pitch0 = p.pitch;
    const shot = api.Fire(munition, { distanceM, bearing });
    const series = [];
    for (let i = 0; i < frames; i += 1) {
      t.StepFrames(1, 1 / 60, i % 4 === 0);
      const f = p.flinch, vm = t.viewmodel?.statePivot;
      series.push({
        i, camYaw: t.camera.rotation.y - p.yaw, camPitch: t.camera.rotation.x - p.pitch, camRoll: t.camera.rotation.z,
        eye: f.eyeClosure, drop: f.dropM, focus: f.daze.focus, vmRy: vm ? vm.rotation.y : null, vmY: vm ? vm.position.y : null,
      });
    }
    const state = api.State();
    const peak = (k, sign = 1) => series.reduce((m, s) => Math.max(m, sign * (s[k] ?? 0)), 0);
    return {
      shot, last: state.last, peak: state.peak, ears: t.audio.EarState(),
      yawUnchanged: p.yaw === yaw0 && p.pitch === pitch0,
      maxCamYaw: peak("camYaw"), minCamYaw: -peak("camYaw", -1), maxDown: peak("camPitch", -1), maxRoll: peak("camRoll"),
      maxEye: peak("eye"), maxDrop: peak("drop"), maxFocus: peak("focus"), minVmRy: -peak("vmRy", -1),
      eyeFrames: series.filter((s) => s.eye > 0.8).length,
      end: series[series.length - 1],
    };
  }, { frames: 60, ...args });

  result.right5 = await Blast({ munition: "Grenade", distanceM: 5, bearing: "right" });
  await page.screenshot({ path: path.join(out, "Test_Right5_After1s.png") });
  const r5 = result.right5;
  assert.ok(r5.last.exposure, "这一发的读数对上了");
  assert.ok(r5.last.exposure.db > 170 && r5.last.exposure.tinnitusRight > r5.last.exposure.tinnitusLeft, JSON.stringify(r5.last.exposure));
  assert.ok(r5.yawUnchanged, "玩家的 yaw / pitch 本体不动（枪口不被带歪）");
  assert.ok(r5.maxCamYaw > 0.25, `右边炸：相机往左转开 ${(r5.maxCamYaw * 57.3).toFixed(0)}°`);
  assert.ok(r5.maxDown > 0.12, "低头");
  assert.ok(r5.maxRoll > 0.06, "头往左歪");
  assert.ok(r5.maxEye > 0.95 && r5.eyeFrames >= 8, `眼睛闭紧一会儿（${r5.eyeFrames} 帧 > 0.8）`);
  assert.ok(r5.maxDrop > 0.1, "缩身");
  assert.ok(r5.minVmRy < -0.05, "手臂跟得少：枪反向转回一部分");
  assert.ok(r5.ears.right.lowHz < r5.ears.left.lowHz, `朝爆点那只（右）耳朵更闷：右 ${r5.ears.right.lowHz?.toFixed(0)} / 左 ${r5.ears.left.lowHz?.toFixed(0)} Hz`);
  assert.ok(r5.ears.right.gainDb < -6, "右耳外界小下去");
  assert.ok(r5.ears.ringing && r5.ears.ringNodes === 14, "一条鸣响，14 个节点");
  console.log("PASS right 5 m grenade", JSON.stringify({ yaw: r5.maxCamYaw, eyeFrames: r5.eyeFrames, ears: r5.ears }));

  // 后期合成收到眼皮与恍惚（不只是规则层的数）。
  result.post = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.BattleReaction;
    api.Clear(); api.Fire("Grenade", { distanceM: 3, bearing: "front" });
    t.StepFrames(12, 1 / 60, true);
    const find = (obj, depth = 0) => {
      if (!obj || depth > 4) return null;
      if (obj.uniforms?.uEyeClosure) return obj.uniforms;
      for (const v of Object.values(obj)) { if (v && typeof v === "object") { const hit = find(v, depth + 1); if (hit) return hit; } }
      return null;
    };
    const U = find(t.post);
    return { eye: U?.uEyeClosure.value ?? null, concussion: U ? U.uConcussion.value.toArray() : null };
  });
  await page.screenshot({ path: path.join(out, "Test_Front3_EyesShut.png") });
  assert.ok(result.post.eye > 0.8, `后期合成的眼皮：${result.post.eye}`);
  assert.ok(result.post.concussion[1] > 0.2, "后期合成的发糊");

  // ---- 距离决定程度 ----------------------------------------------------------
  result.right12 = await Blast({ munition: "Grenade", distanceM: 12, bearing: "right" });
  result.right35 = await Blast({ munition: "Grenade", distanceM: 35, bearing: "right" });
  assert.ok(r5.maxCamYaw > result.right12.maxCamYaw && result.right12.maxCamYaw > result.right35.maxCamYaw, "近的转得多");
  assert.ok(r5.eyeFrames > result.right12.eyeFrames, "近的闭得久");
  assert.ok(!(result.right35.ears.right.lowHz < 15000), "35 m 的手榴弹不该把耳朵震闷");
  // 左边炸：反过来往右转。
  result.left8 = await Blast({ munition: "Shell82", distanceM: 8, bearing: "left", frames: 330 });
  assert.ok(result.left8.minCamYaw < -0.15, "左边炸：往右转开");
  console.log("PASS distance / side");

  // ---- A/B：反应关掉、耳朵换回旧的 ----------------------------------------------
  result.ab = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.BattleReaction, p = t.player;
    api.Clear(); api.SetReaction(false); api.SetEarModel("legacy");
    api.Fire("Grenade", { distanceM: 5, bearing: "right" });
    let maxYaw = 0;
    for (let i = 0; i < 30; i += 1) { t.StepFrames(1, 1 / 60, false); maxYaw = Math.max(maxYaw, Math.abs(t.camera.rotation.y - p.yaw - p.shake.yaw)); }
    const off = { maxYaw, flinch: p.flinch.State().events, ear: t.audio.EarState(), deafCutoff: t.audio.deafFilter.frequency.value };
    api.SetReaction(true); api.SetEarModel("trauma");
    return { off, back: { reaction: p.flinch.enabled, ear: t.audio.EarState().installed } };
  });
  assert.ok(result.ab.off.maxYaw < 1e-6 && result.ab.off.flinch === 0, "反应关着：相机只剩震屏");
  assert.ok(!result.ab.off.ear.installed, "旧耳鸣：耳朵那一段已拔掉");
  assert.ok(result.ab.back.reaction && result.ab.back.ear, "开回来");

  // ---- 清空：人与耳朵复位 -----------------------------------------------------
  result.clear = await page.evaluate(async () => {
    const t = window.Taierzhuang, api = t.Debug.BattleReaction;
    api.Fire("Shell150", { distanceM: 8, bearing: "frontRight" });
    t.StepFrames(400, 1 / 60, false);
    api.Clear(); t.StepFrames(2, 1 / 60, false);
    // AudioParam.value 要等音频线程处理过下一块才是新值（同一个 JS 任务里读到的还是旧的）。
    await new Promise((resolve) => setTimeout(resolve, 150));
    const ears = t.audio.EarState();
    return { active: t.player.flinch.Active, ring: ears.ringing, low: [ears.left.lowHz, ears.right.lowHz], records: api.State().records.length };
  });
  assert.ok(!result.clear.active && !result.clear.ring && result.clear.low.every((hz) => hz > 15000) && result.clear.records === 0, JSON.stringify(result.clear));
  console.log("PASS A/B / clear");

  // ---- 站位：沟后空地（没遮挡）比沟里（隔着沟壁）挨得重 ----------------------------
  result.cover = await page.evaluate(() => {
    const t = window.Taierzhuang, api = t.Debug.BattleReaction;
    const read = (stand) => {
      api.Stand(stand); t.StepFrames(5, 1 / 60, false); api.Clear();
      // 正前方 9 m：沟里时落在沟沿外的地面上（被沟壁挡住），空地上是开阔地。
      api.Fire("Shell75", { distanceM: 9, bearing: "front" });
      for (let i = 0; i < 400 && !api.State().last?.exposure; i += 1) t.StepFrames(1, 1 / 60, false);
      return api.State().last.exposure;
    };
    const trench = read("trench"), rear = read("rear");
    api.Stand("trench");
    return { trench, rear };
  });
  assert.ok(result.cover.trench.occluded && !result.cover.rear.occluded, JSON.stringify(result.cover));
  assert.ok(result.cover.trench.flinch < result.cover.rear.flinch, "沟里隔着沟壁反应轻");
  console.log("PASS cover");

  // ---- 离线渲染正式的耳朵模型 ---------------------------------------------------
  result.dsp = await page.evaluate(async () => {
    const audio = window.Taierzhuang.audio, EarTrauma = audio.earTrauma.constructor;
    const RATE = 48000, SECONDS = 14;
    const render = async ({ left, right, muted = false }) => {
      const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE);
      const a = Object.create(Object.getPrototypeOf(audio));
      Object.assign(a, { ctx, liveNodes: 0, nodeBudget: 120, masterVolume: muted ? 0 : 1, toolsVolume: null, mix: { sfx: 1 },
        timers: new Set(), pendingVoices: new Set(), activeVoices: new Set(), noiseCache: new Map(),
        deafFilter: ctx.createBiquadFilter(), outGain: ctx.createGain() });
      a.deafFilter.type = "lowpass"; a.deafFilter.frequency.value = 20000;
      a.deafFilter.connect(a.outGain).connect(ctx.destination);
      for (const [hz, level] of [[180, 0.08], [1000, 0.05], [6000, 0.08]]) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = hz; gain.gain.value = level;
        osc.connect(gain).connect(a.deafFilter); osc.start();
      }
      const ear = new EarTrauma(a);
      ear.Install(a.deafFilter, a.outGain);
      ear.Trigger({ left, right, holdS: 0.13 });
      const buffer = await ctx.startRendering();
      for (const id of a.timers) clearTimeout(id);
      const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
      const amp = (pcm, hz, start, end) => {
        let re = 0, im = 0; const a0 = Math.round(start * RATE), a1 = Math.round(end * RATE);
        for (let i = a0; i < a1; i += 1) { re += pcm[i] * Math.cos(2 * Math.PI * hz * i / RATE); im += pcm[i] * Math.sin(2 * Math.PI * hz * i / RATE); }
        return Math.hypot(re, im) * 2 / (a1 - a0);
      };
      // 耳鸣带着极细的音高起伏（± fmDepth）和刚炸完的音高回落，能量摊在几条谱线上：按频带量（步长 = 1/窗长，平方和开根）。
      const band = (pcm, hz, halfWidth, start, end) => {
        const step = 1 / (end - start); let sum = 0;
        for (let f = hz - halfWidth; f <= hz + halfWidth; f += step) sum += amp(pcm, f, start, end) ** 2;
        return Math.sqrt(sum);
      };
      // 音高：在 ±3% 范围里扫一遍找峰（0.5 Hz 步长太细，取 2 Hz）。
      const pitchAt = (pcm, start, end) => {
        let best = 0, bestHz = 0;
        for (let hz = ear.pitchHz * 0.97; hz <= ear.pitchHz * 1.03; hz += 2) { const v = amp(pcm, hz, start, end); if (v > best) { best = v; bestHz = hz; } }
        return bestHz;
      };
      const P = ear.pitchHz;
      return {
        pitch: P,
        attackR: amp(R, 6000, 0.03, 0.11),
        muffledR: amp(R, 6000, 0.5, 0.8), muffledL: amp(L, 6000, 0.5, 0.8),
        bodyR: amp(R, 180, 0.5, 0.8),
        ringR: band(R, P, P * 0.025, 0.6, 1.0), ringL: band(L, P, P * 0.025, 0.6, 1.0), ringLateR: band(R, P, P * 0.025, 6.0, 6.5),
        pitchEarly: pitchAt(R, 1.0, 1.5), pitchLate: pitchAt(R, 3.0, 3.5),
        lowBackR: amp(R, 180, 6.0, 6.5) / Math.max(1e-6, amp(R, 180, 0.03, 0.11)),
        highBackR: amp(R, 6000, 6.0, 6.5) / Math.max(1e-6, amp(R, 6000, 0.03, 0.11)),
        recoveredR: amp(R, 6000, 13.4, 13.9),
      };
    };
    return { live: await render({ left: 0.3, right: 0.9 }), muted: await render({ left: 0.3, right: 0.9, muted: true }) };
  });
  const d = result.dsp.live;
  console.log("DSP", JSON.stringify(result.dsp));
  assert.ok(d.attackR > 0.06, "起音期：炸的那一声先完整过去");
  assert.ok(d.muffledR < d.attackR * 0.05, "之后右耳的高频被压掉");
  assert.ok(d.muffledL > d.muffledR * 3, "左耳（背对爆点）没那么闷");
  assert.ok(d.bodyR > 0.004 && d.bodyR < 0.06, "低频还在，但整体小下去了（听阈抬高）");
  assert.ok(d.ringR > 0.01, "耳鸣在");
  assert.ok(d.ringR > d.ringL * 1.6, "耳鸣偏在挨炸的右耳");
  assert.ok(d.ringLateR > 0.0005 && d.ringLateR < d.ringR, "六秒后还在鸣、但轻了");
  assert.ok(Math.abs(d.pitchEarly - d.pitchLate) <= d.pitch * 0.006, `音高稳定：${d.pitchEarly} → ${d.pitchLate} Hz（不是一路往下滑）`);
  assert.ok(d.lowBackR > d.highBackR * 1.5, "低频先回、高频后回");
  assert.ok(d.recoveredR > d.attackR * 0.5, "十几秒后基本恢复");
  assert.ok(result.dsp.muted.ringR < 1e-4, "主音量 0：不鸣");
  console.log("PASS ear trauma PCM", JSON.stringify(result.dsp.live));

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, "Report.json"), JSON.stringify(result, null, 2));
  console.log("PASS BattleReactionRange");
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
