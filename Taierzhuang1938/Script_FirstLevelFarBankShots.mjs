// 第一关 18 · 对岸步坦部队的出图与帧耗时对照（真浏览器，调试跳转 + 强记事实，**不算通关证据**）。
//
//   node Taierzhuang1938/Script_FirstLevelFarBankShots.mjs --stage-jumps --stage-from=18 [--quality=whitebox|high|low]
//        [--out=<目录>] [--perf] [--baseline-root=<不带对岸模块的检出根>]
//
// 为什么另起一只：整关驾驶（Script_FirstLevelCampaignEnd）在共享机器上一趟要二三十分钟，出图与 A/B 帧耗时不需要
// 真走一遍，只需要「同一套时间点」。这里 JumpStage(18) 之后用 runtime.Record 强记 bridgeOrdersHeard / bridgeFireBroken /
// rearColumnCrossed，把玩家传送到各机位，按游戏时间推帧：
//   1. BridgeCover 起 60 s：第一拨到位、战车开进来 —— 站 / 蹲各拍一张，量帧耗时
//   2. BridgeWithdraw 起 22 s：真 AI 与冲桥组、战车推到岸边 —— 站 / 蹲各拍一张，量帧耗时
//   3. 起爆瞬间与 +3 s：拍两张，量帧耗时（起爆瞬间 12 帧）
//   4. 撤离：离北岸 ~120 m、~160 m 回头看对岸各一张；黑屏前最后一帧
// --perf 只量帧耗时不拍图（A/B：同一份脚本先后对着本树与 --baseline-root 跑，交替几轮）。
// 基线树没有 end.farBank，量帧耗时的那几个时间点照样按游戏时间到。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ParseCampaignArgs, OpenCampaign, CloseCampaign } from "./Script_FirstLevelCampaignKit.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES as Routes } from "./Data_FirstLevelMissionTopology.mjs";

const argv = process.argv.slice(2);
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const perf = argv.includes("--perf");
const options = ParseCampaignArgs();
options.suite = "FirstLevelFarBankShots";
const ctx = await OpenCampaign(options);
const { page } = ctx;
const out = path.resolve(arg("out") || path.join(ctx.output, options.quality || "low"));
await fs.mkdir(out, { recursive: true });
const timings = {}, notes = {};
const LOOK = { x: A.railBridge.x, z: 86, height: 1.4 };

const State = () => page.evaluate(() => { const m = window.Tengxian.Debug.FirstLevelMission(); return { stage: m.stage, time: m.time, facts: m.facts, fb: m.end.farBank ?? null, hp: window.Tengxian.player.health }; });
const Step = (seconds) => page.evaluate((s) => { const g = window.Tengxian; for (let i = 0; i < Math.round(s * 60); i += 1) g.StepFrames(1, 1 / 60, false); }, seconds);
const Record = (id) => page.evaluate((id) => window.Tengxian.Debug.FirstLevelMissionRuntime().Record(id), id);
async function Place(x, z, stance = "stand") {
  await page.evaluate(({ x, z, stance }) => {
    const g = window.Tengxian, p = g.player, y = g.battlefield.GroundHeight(x, z);
    const free = g.physics?.FindFreeSpot ? g.physics.FindFreeSpot(x, z, p.radius, 1.78) : { x, y, z };
    p.position.set(free.x, free.y, free.z); p.body?.Teleport(free.x, free.y, free.z); p.velocity.set(0, 0, 0); p.SetStance(stance);
  }, { x, z, stance });
}
async function Look(point) {
  await page.evaluate((point) => {
    const g = window.Tengxian, p = g.player.position, eye = g.player.EyePosition;
    g.player.yaw = Math.atan2(p.x - point.x, p.z - point.z);
    g.player.pitch = Math.atan2(g.battlefield.GroundHeight(point.x, point.z) + (point.height || 1.2) - eye.y, Math.hypot(p.x - point.x, p.z - point.z));
  }, point);
}
async function Shot(name, point = LOOK, stance = null) {
  if (perf) return;
  if (stance) await page.evaluate((s) => window.Tengxian.player.SetStance(s), stance);
  await Look(point);
  await page.evaluate(() => window.Tengxian.StepFrames(6, 1 / 60, true));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log("SHOT", name);
}
/** 举枪瞄准（右键，铁瞄视野收窄）看对岸拍一张：玩家打对岸真会这么看。 */
async function ShotAds(name, point = LOOK) {
  if (perf) return;
  await page.evaluate(() => { const g = window.Tengxian; g.player.SetStance("stand"); g.Debug.Mouse(2, true); });
  await Look(point);
  await page.evaluate(() => window.Tengxian.StepFrames(40, 1 / 60, true));
  await Look(point);
  await page.evaluate(() => window.Tengxian.StepFrames(4, 1 / 60, true));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.evaluate(() => { const g = window.Tengxian; g.Debug.Mouse(2, false); g.StepFrames(20, 1 / 60, false); });
  console.log("SHOT", name);
}
async function Timing(label, frames = 24) {
  const t = await page.evaluate((frames) => {
    const g = window.Tengxian, gl = g.renderer.getContext(), samples = [];
    for (let i = 0; i < frames + 4; i += 1) { const s = performance.now(); g.StepFrames(1, 1 / 60, true); gl.finish(); if (i >= 4) samples.push(performance.now() - s); }
    samples.sort((a, b) => a - b);
    const rinfo = g.renderer.info, wasReset = rinfo.autoReset; rinfo.autoReset = false; rinfo.reset(); g.StepFrames(1, 1 / 60, true); const info = { calls: rinfo.render.calls, triangles: rinfo.render.triangles }; rinfo.autoReset = wasReset;
    let ija = 0; for (const s of g.ai.soldiers) if (s.alive && s.side === "ija") ija += 1;
    return { p50: +samples[Math.floor(samples.length / 2)].toFixed(2), p95: +samples[Math.floor(samples.length * 0.95)].toFixed(2),
      mean: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2), drawCalls: info.calls, triangles: info.triangles, ija, skinned: (() => { let n = 0; g.scene.traverse((o) => { if (o.isSkinnedMesh) n += 1; }); return n; })() };
  }, frames);
  timings[label] = t;
  console.log("FRAME", label, JSON.stringify(t));
}
try {
  // 18 起点（调试跳转）：传令兵跑到接收处之前先强记令已听到
  const receipt = await page.evaluate(async () => { const g = window.Tengxian; const after = await g.Debug.FirstLevelJump(18); return { stage: after.stage, phase: after.phaseNumber }; });
  assert.equal(receipt.phase, 18);
  await page.evaluate(() => { const g = window.Tengxian; g.player.health = 100; });
  await Record("bridgeOrdersHeard");
  await Step(1);
  let s = await State();
  console.log("STAGE", s.stage);
  await Place(A.bridgeCover.x, A.bridgeCover.z);
  await Step(1);
  s = await State();
  assert.equal(s.stage, "BridgeCover", `强记 bridgeOrdersHeard 之后进 BridgeCover，实际 ${s.stage}`);
  // 1. BridgeCover 60 s
  await Step(60);
  s = await State(); notes.cover = s.fb && { shore: s.fb.shore, standby: s.fb.standby, real: s.fb.real, ija: s.fb.ijaCount, tanks: s.fb.tanks };
  console.log("COVER", JSON.stringify(notes.cover), "stage", s.stage, "hp", s.hp);
  await Shot("01_CoverStand", LOOK, "stand");
  await Shot("02_CoverCrouch", LOOK, "crouch");
  await Shot("02w_CoverWest", { x: -99, z: 82, height: 1.4 }, "stand");
  await Shot("02e_CoverEast", { x: -56, z: 82, height: 1.4 }, "stand");
  await Shot("03_CoverTanks", { x: A.railBridge.x + 20, z: 76, height: 1.5 }, "stand");
  await ShotAds("03b_CoverAds", LOOK);
  await page.evaluate(() => window.Tengxian.player.SetStance("stand"));
  await Timing("cover+60s");
  // 2. 打断北岸火力 / 尾队过桥：强记，进 BridgeWithdraw
  await Record("bridgeFireBroken");
  await Step(20);
  await Shot("04_Vanguard", { x: A.railBridge.x, z: 100, height: 1.2 }, "stand");
  await Record("rearColumnCrossed");
  await Step(1);
  s = await State();
  assert.equal(s.stage, "BridgeWithdraw", `进 BridgeWithdraw，实际 ${s.stage}`);
  await Step(22);
  s = await State(); notes.withdraw = s.fb && { real: s.fb.real, shore: s.fb.shore, rush: s.fb.rush, rushState: s.fb.rushState, ija: s.fb.ijaCount, shells: s.fb.shells, mg: s.fb.mg, tanks: s.fb.tanks };
  console.log("WITHDRAW", JSON.stringify(notes.withdraw), "hp", s.hp);
  await Shot("05_WithdrawStand", LOOK, "stand");
  await Shot("06_WithdrawCrouch", LOOK, "crouch");
  await Shot("06w_WithdrawWest", { x: -99, z: 82, height: 1.4 }, "stand");
  await Shot("06e_WithdrawEast", { x: -56, z: 82, height: 1.4 }, "stand");
  await Shot("07_WithdrawRush", { x: A.railBridge.x, z: 128, height: 1.5 }, "stand");
  await ShotAds("07b_WithdrawAds", LOOK);
  await page.evaluate(() => window.Tengxian.player.SetStance("stand"));
  await Timing("withdraw+22s");
  // 3. 起爆：玩家退到安全区，等 bridgeDestroyed
  await Place(A.blastSafe.x, A.blastSafe.z);
  await Look({ x: A.railBridge.x, z: A.railBridge.z, height: 2 });
  let fired = false;
  for (let i = 0; i < 400 && !fired; i += 1) {
    fired = await page.evaluate(() => { const g = window.Tengxian; for (let k = 0; k < 30; k += 1) { if (g.Debug.FirstLevelMission().facts.includes("bridgeDestroyed")) return true; g.StepFrames(1, 1 / 60, false); } return g.Debug.FirstLevelMission().facts.includes("bridgeDestroyed"); });
    if (!fired) await Look({ x: A.railBridge.x, z: A.railBridge.z, height: 2 });
  }
  assert.ok(fired, "等不到 bridgeDestroyed");
  await Timing("blast+0.2s", 12);
  await Shot("08_BlastMoment", { x: A.railBridge.x, z: 142, height: 2.5 }, "stand");
  await Step(3);
  await Timing("blast+3s", 12);
  await Shot("09_Blast3s", { x: A.railBridge.x, z: 142, height: 2.5 }, "stand");
  await Step(12);
  s = await State(); notes.blast = s.fb && { blast: s.fb.blast, blastKilled: s.fb.blastKilled, alive: s.fb.alive, bank: s.fb.bank, shells: s.fb.shells, mg: s.fb.mg };
  console.log("BLAST", JSON.stringify(notes.blast), "stage", s.stage, "hp", s.hp);
  await Shot("10_HaltedAtBank", LOOK, "stand");
  // 4. 撤离：离北岸 ~120 m（z 210）与 ~160 m（z 250）各回头看一眼，再走到终点前一帧
  const march = Routes.marchOut;
  await Place(-64.6, 214); await Step(2);
  s = await State(); notes.retreat120 = s.fb && { dz: s.fb.dz, tier: s.fb.tier, alive: s.fb.alive, shells: s.fb.shells.fired };
  await Shot("11_Retreat120", LOOK, "stand"); await Timing("retreat120", 12);
  await Place(-62, 250); await Step(2);
  s = await State(); notes.retreat160 = s.fb && { dz: s.fb.dz, tier: s.fb.tier, alive: s.fb.alive, shells: s.fb.shells.fired };
  await Shot("12_Retreat160", LOOK, "stand");
  await Place(march[4].x, march[4].z);
  await Shot("13_MoundBase", { x: march[5].x, z: march[5].z, height: 1.6 }, "stand");
  await Place(-78, 282); await Step(1);
  await Shot("14_LastFrameOnCrest", LOOK, "stand");
  await Place(march.at(-1).x + 4, march.at(-1).z - 3);
  let transition = false;
  for (let i = 0; i < 60 && !transition; i += 1) {
    transition = await page.evaluate(() => { const g = window.Tengxian; for (let k = 0; k < 20; k += 1) { if (g.Debug.FirstLevelMission().facts.includes("marchOutReached")) return true; g.StepFrames(1, 1 / 60, false); } return false; });
    if (!transition) await Place(march.at(-1).x, march.at(-1).z);
  }
  s = await State(); notes.out = s.fb && s.fb.out;
  console.log("OUT", JSON.stringify(notes.out), "transition", transition, "stage", s.stage);
  await Shot("15_BeforeBlackout", LOOK, "stand");
  await fs.writeFile(path.join(out, "Data_FarBankShots.json"), JSON.stringify({ quality: options.quality || "low", perf, timings, notes }, null, 2));
  console.log("DONE", JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, v.p50]))));
} finally {
  await CloseCampaign(ctx);
}
