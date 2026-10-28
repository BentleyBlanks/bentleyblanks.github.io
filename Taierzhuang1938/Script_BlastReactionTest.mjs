// 近爆的人物反应（纯 Node）：暴露模型（Script_BlastExposure）与第一人称反应的时间线（Script_BlastFlinch）。
// 浏览器那一半（真炸、真相机、真耳朵节点、离线渲染耳鸣）在 Script_BattleReactionRangeBrowserTest.mjs。
// 用法：node Taierzhuang1938/Script_BlastReactionTest.mjs
import assert from "node:assert/strict";
import { BlastExposure, BlastBearing, ChargeKgFor, PeakOverpressureKPa, PeakSplDb, WindowStrength } from "./Script_BlastExposure.mjs";
import { BlastFlinch } from "./Script_BlastFlinch.mjs";
import { BLAST_EXPOSURE, BLAST_FLINCH, EAR_TRAUMA } from "./Data_Tuning_BlastReaction.mjs";
import { BATTLE_REACTION_STANDS, BATTLE_REACTION_MUNITION_SPECS, ReactionPoint, BATTLE_REACTION_RANGE_PHASE, BATTLE_REACTION_PAVED, InPavedYard } from "./Data_BattleReactionRange.mjs";
import { SHELL_IMPACT_TRENCH_SEGMENTS, SHELL_IMPACT_TREES, SHELL_IMPACT_DRUMS, SHELL_IMPACT_PROPS, SHELL_IMPACT_WORLD } from "./Data_ShellImpactRange.mjs";
import { GROUND_IMPACT_SURFACES } from "./Data_Tuning_GroundImpact.mjs";

let groups = 0;
const Group = (name, fn) => { fn(); groups += 1; console.log(`ok  ${name}`); };
const Exposure = (id, d, opts = {}) => BlastExposure({ distanceM: d, chargeKg: ChargeKgFor(id), ...opts });
const Run = (flinch, seconds, dt = 1 / 60, each = null) => {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i += 1) { flinch.Update(dt); each?.(flinch, (i + 1) * dt); }
};
const Peak = (id, d, bearing, extra = {}) => {
  const f = new BlastFlinch(); f.SetEnabled(true);
  const e = Exposure(id, d, { lateral: bearing.lateral, ...extra });
  f.Blast(e, bearing);
  const peak = { yaw: 0, pitch: 0, roll: 0, drop: 0, side: 0, eye: 0, focus: 0, armsDy: 0, armsRy: 0, tremor: 0, eyeAt: 0 };
  Run(f, 4, 1 / 60, (fl, t) => {
    for (const [k, v] of [["yaw", fl.yaw], ["pitch", fl.pitch], ["roll", fl.roll], ["drop", fl.dropM], ["side", fl.sideM], ["armsDy", fl.arms.dy], ["armsRy", fl.arms.ry]]) {
      if (Math.abs(v) > Math.abs(peak[k])) peak[k] = v;
    }
    if (fl.eyeClosure > peak.eye) { peak.eye = fl.eyeClosure; peak.eyeAt = t; }
    peak.focus = Math.max(peak.focus, fl.daze.focus);
    peak.tremor = Math.max(peak.tremor, fl.tremor);
  });
  return { peak, exposure: e, flinch: f };
};
const RIGHT = { lateral: 1, forward: 0, up: 0 }, LEFT = { lateral: -1, forward: 0, up: 0 };
const FRONT = { lateral: 0, forward: 1, up: 0 }, BACK = { lateral: 0, forward: -1, up: 0 };

Group("峰值超压：Kinney–Graham 量级、随距离降、随装药升、遮挡与头影扣分", () => {
  // 手榴弹（0.165 kg × 地面 1.8）：5 m 约 177 dB，12 m 约 168 dB；150 毫米（4.38 kg）35 m 约 168 dB。
  const g5 = Exposure("Grenade", 5), g12 = Exposure("Grenade", 12), s35 = Exposure("Shell150", 35);
  assert.ok(Math.abs(g5.db - 177.5) < 1.5, `手榴弹 5 m ${g5.db.toFixed(1)} dB`);
  assert.ok(Math.abs(g12.db - 167.9) < 1.5, `手榴弹 12 m ${g12.db.toFixed(1)} dB`);
  assert.ok(Math.abs(s35.db - 168.3) < 1.5, `150 毫米 35 m ${s35.db.toFixed(1)} dB`);
  let prev = Infinity;
  for (const d of [1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 200]) {
    const kPa = PeakOverpressureKPa(d, 0.81);
    assert.ok(kPa < prev, `超压随距离单调降（${d} m）`); prev = kPa;
  }
  assert.ok(PeakOverpressureKPa(20, 4.38) > PeakOverpressureKPa(20, 0.81), "装药越多越响");
  assert.ok(Math.abs(PeakSplDb(20) - 20 * Math.log10(20000 / 20e-6)) < 1e-9, "dB 换算以 20 µPa 为零");
  const open = Exposure("Shell75", 15), shut = Exposure("Shell75", 15, { occluded: true });
  assert.ok(Math.abs(open.db - shut.db + BLAST_EXPOSURE.occludedDb) < 1e-9, "遮挡扣 occludedDb");
  assert.ok(shut.flinch < open.flinch && shut.tinnitus < open.tinnitus, "隔着沟壁反应更轻");
  const right = Exposure("Grenade", 6, { lateral: 1 }), front = Exposure("Grenade", 6, { lateral: 0 });
  assert.ok(right.dbRight - right.dbLeft === -BLAST_EXPOSURE.headShadowDb, "正右侧：左耳被头挡掉 headShadowDb");
  assert.ok(right.tinnitusRight > right.tinnitusLeft, "朝爆点那只耳朵鸣得重");
  assert.equal(front.dbLeft, front.dbRight, "正前方两耳一样");
  assert.equal(WindowStrength(100, [148, 166, 1]), 0); assert.equal(WindowStrength(200, [148, 166, 1]), 1);
});

Group("各反应的出闸距离（手榴弹：远处只眨眼；20 m 起耳鸣；3 m 近满）", () => {
  const far = Exposure("Grenade", 60), mid = Exposure("Grenade", 25), near = Exposure("Grenade", 12), close = Exposure("Grenade", 3);
  assert.ok(far.blink > 0 && far.flinch === 0 && far.tinnitus === 0, "60 m：只眨一下眼");
  assert.ok(mid.flinch < 0.03 && mid.tinnitus === 0 && mid.squeeze === 0, "25 m：头基本不动，不耳鸣，不闭紧");
  assert.ok(near.tinnitus > 0 && near.daze === 0 && near.squeeze === 0, "12 m：开始耳鸣，不发懵，不闭紧");
  assert.ok(close.flinch > 0.9 && close.squeeze > 0.6 && close.tinnitus > 0.9 && close.daze > 0.3, "3 m：缩身扭头近满、闭紧、耳鸣满、发懵");
  // 2026-10-22 用户实测：35 m 的 75 野炮反应太大 —— 现在只眨一下，头的反应 < 0.05。
  const s35 = Exposure("Shell75", 35);
  assert.ok(s35.blink > 0 && s35.flinch < 0.05 && s35.squeeze === 0, `75 野炮 35 m：只眨眼（缩身 ${s35.flinch.toFixed(3)}）`);
  // 大的炸得远：250 公斤炸弹 100 m 外仍要耳鸣，手榴弹 100 m 外什么都没有。
  assert.ok(Exposure("Bomb250kg", 100).tinnitus > 0 && Exposure("Grenade", 100).flinch === 0);
});

Group("装药查表与回退", () => {
  assert.equal(ChargeKgFor("Grenade"), 0.165);
  assert.equal(ChargeKgFor("grenade"), 0.165, "Combat 的 kind 也认");
  assert.equal(ChargeKgFor("Type89Tank"), ChargeKgFor("Shell57"), "战车 id 走 VEHICLE_EXPLOSIVES");
  assert.ok(Math.abs(ChargeKgFor(null, 6.5) - 0.165) < 1e-9, "没有弹种：按半径立方反推（6.5 m ↔ 0.165 kg）");
  assert.ok(ChargeKgFor(null, 13) > 1.2 && ChargeKgFor(null, 13) < 1.4, "半径翻倍装药 ×8");
});

Group("方位：右 / 左 / 前 / 后 / 上，随朝向旋转", () => {
  const eye = { x: 0, y: 1.6, z: 0 };
  const b = (x, y, z, yaw = 0) => BlastBearing(eye, { x, y, z }, yaw);
  assert.ok(b(5, 1.6, 0).lateral > 0.99, "朝北时东边是右");
  assert.ok(b(-5, 1.6, 0).lateral < -0.99, "西边是左");
  assert.ok(b(0, 1.6, -5).forward > 0.99, "北边是前");
  assert.ok(b(0, 1.6, 5).forward < -0.99, "南边是后");
  assert.ok(b(0, 9, 0.1).up > 0.9, "头顶");
  assert.ok(b(0, 1.6, -5, Math.PI / 2).lateral > 0.99, "朝西（yaw = π/2）时北边在右");
  assert.ok(Math.abs(b(3, 1.6, 4).distance - 5) < 1e-9);
});

Group("反应关着什么都不做；人死了不反应（Player 侧）", () => {
  const f = new BlastFlinch();
  assert.equal(f.Blast(Exposure("Grenade", 4), RIGHT), null);
  f.Update(0.2);
  assert.ok(!f.Active && f.yaw === 0 && f.eyeClosure === 0);
  f.SetEnabled(true); f.Blast(Exposure("Grenade", 4), RIGHT); f.Update(0.2);
  assert.ok(f.Active && f.yaw !== 0);
  f.SetEnabled(false);
  assert.ok(!f.Active && f.yaw === 0, "关掉时顺手清掉");
});

Group("右边炸：头往左转、往左歪、低头、缩身、往左让；枪往右甩、往下压", () => {
  const { peak } = Peak("Grenade", 5, RIGHT);
  assert.ok(peak.yaw > 0.3, `转开 ${(peak.yaw * 57.3).toFixed(0)}°（yaw + = 往左）`);
  assert.ok(peak.roll > 0.08, "头往左歪（roll +）");
  assert.ok(peak.pitch < -0.12, "低头");
  assert.ok(peak.drop > 0.1, "缩身（眼位下沉）");
  assert.ok(peak.side < -0.02, "往背离爆点那侧（左）让");
  assert.ok(peak.armsRy < 0, "手臂跟得少：枪反向转回一部分（在画面里甩向爆点）");
  assert.ok(peak.armsDy < -0.015, "枪往下压");
  const left = Peak("Grenade", 5, LEFT).peak;
  // 镜头那一点手抖（tremor.cameraRad）是确定性噪声、不镜像，所以转头只比到它的量级。
  assert.ok(Math.abs(left.yaw + peak.yaw) < 2 * BLAST_FLINCH.tremor.cameraRad && Math.abs(left.roll + peak.roll) < 1e-9, "左边炸：左右镜像");
});

Group("正前方炸也要转开（左右交替）；身后炸只缩不转", () => {
  const f = new BlastFlinch(); f.SetEnabled(true);
  const e = Exposure("Shell75", 10, { lateral: 0 });
  const first = f.Blast(e, FRONT), second = f.Blast(e, FRONT);
  assert.ok(first.yaw !== 0 && Math.sign(first.yaw) === -Math.sign(second.yaw), "正前方：转开，下一发换另一边");
  const back = Peak("Shell75", 7, BACK).peak, front = Peak("Shell75", 7, FRONT).peak;
  assert.ok(Math.abs(back.yaw) < 0.02, `身后：基本不转（${(back.yaw * 57.3).toFixed(1)}°）`);
  assert.ok(back.pitch < -0.1 && back.drop > 0.08, "身后：照样低头缩身");
  assert.ok(Math.abs(front.yaw) > 0.15, "正前：转开");
});

Group("距离决定程度：近的转得多、闭得久；远的只眨眼", () => {
  const p5 = Peak("Grenade", 5, RIGHT).peak, p12 = Peak("Grenade", 12, RIGHT).peak, p25 = Peak("Grenade", 25, RIGHT).peak;
  assert.ok(p5.yaw > p12.yaw && p12.yaw > p25.yaw, "转头角度随距离降");
  assert.ok(p5.drop > p12.drop && p12.drop > p25.drop, "缩身随距离降");
  assert.ok(p5.focus > p25.focus, "发糊随距离降");
  // 闭眼时长：近的闭得久一点、远的眨一下就睁开；单发再近也不会一直闭着（2026-10-22 用户：除非连续引爆）。
  const closedFor = (id, d, repeats = []) => {
    const f = new BlastFlinch(); f.SetEnabled(true);
    const e = Exposure(id, d, { lateral: 1 }), shots = [...repeats];
    f.Blast(e, RIGHT);
    let t = 0;
    Run(f, 6, 1 / 120, (fl, at) => {
      while (shots.length && shots[0] <= at) { shots.shift(); fl.Blast(e, RIGHT); }
      if (fl.eyeClosure > 0.8) t += 1 / 120;
    });
    return t;
  };
  const c3 = closedFor("Grenade", 3), c12 = closedFor("Grenade", 12), c60 = closedFor("Grenade", 60);
  assert.ok(c3 > c12 && c12 >= c60, `闭眼 3 m ${c3.toFixed(2)} s > 12 m ${c12.toFixed(2)} s ≥ 60 m ${c60.toFixed(2)} s`);
  assert.ok(c3 < 0.4, `单发 3 m 也只闭一下：${c3.toFixed(2)} s`);
  assert.ok(c60 < 0.12, `远处只是一刹那的眨眼：${c60.toFixed(2)} s`);
  const barrage = closedFor("Shell75", 8, [1.2, 2.4, 3.6]), single = closedFor("Shell75", 8);
  assert.ok(barrage > single * 3.5, `连续四发越闭越久：${barrage.toFixed(2)} s vs 单发 ${single.toFixed(2)} s`);
  assert.ok(Peak("Grenade", 60, RIGHT).peak.yaw === 0, "60 m：头不动");
  assert.ok(Math.abs(Peak("Shell75", 35, RIGHT).peak.yaw) < 0.03, "75 野炮 35 m：头基本不动（< 2°）");
});

Group("冲击到了才反应（按声速）、先眨眼后转头", () => {
  const f = new BlastFlinch(); f.SetEnabled(true);
  const e = Exposure("Bomb250kg", 100, { lateral: 1 });
  f.Blast(e, RIGHT);
  let firstEye = null, firstHead = null;
  Run(f, 1.2, 1 / 240, (fl, t) => {
    if (firstEye == null && fl.eyeClosure > 0.01) firstEye = t;
    if (firstHead == null && Math.abs(fl.yaw) > 0.005) firstHead = t;
  });
  const arrival = 100 / BLAST_EXPOSURE.soundSpeedMps;
  assert.ok(firstEye > arrival + BLAST_FLINCH.blinkLatencyS - 0.01 && firstEye < arrival + 0.1, `眨眼在冲击到后（${firstEye?.toFixed(3)} s）`);
  assert.ok(firstHead > firstEye, "头比眼皮慢（颈部反射潜伏期更长）");
});

Group("全部回零、事件清空", () => {
  const { flinch } = Peak("Grenade", 3, RIGHT);
  Run(flinch, 40, 1 / 30);
  assert.ok(!flinch.Active, "几十秒后事件清空");
  assert.ok(flinch.yaw === 0 && flinch.eyeClosure === 0 && flinch.daze.focus === 0 && flinch.tremor === 0 && flinch.heart === 0);
});

Group("连续近爆：软限幅，不把头越拧越偏", () => {
  const f = new BlastFlinch(); f.SetEnabled(true);
  for (let i = 0; i < 10; i += 1) { f.Blast(Exposure("Shell150", 6, { lateral: 1 }), RIGHT); f.Update(0.05); }
  let maxYaw = 0, maxDrop = 0;
  Run(f, 3, 1 / 60, (fl) => { maxYaw = Math.max(maxYaw, Math.abs(fl.yaw)); maxDrop = Math.max(maxDrop, fl.dropM); });
  assert.ok(f.events.length <= BLAST_FLINCH.maxEvents);
  assert.ok(maxYaw <= BLAST_FLINCH.head.yawRad * BLAST_FLINCH.stackCap + BLAST_FLINCH.tremor.cameraRad + 1e-6, `转头封顶 ${(maxYaw * 57.3).toFixed(0)}°`);
  assert.ok(maxDrop <= BLAST_FLINCH.head.dropM * BLAST_FLINCH.stackCap + 1e-9);
});

Group("确定性：同样的输入同样的曲线（出图可复现）", () => {
  const a = Peak("Shell82", 7, { lateral: 0.4, forward: 0.9, up: 0 }).flinch, b = Peak("Shell82", 7, { lateral: 0.4, forward: 0.9, up: 0 }).flinch;
  assert.deepEqual(a.State(), b.State());
});

Group("喘与心跳：强的那一下之后有，远的没有", () => {
  const near = new BlastFlinch(); near.SetEnabled(true); near.Blast(Exposure("Grenade", 4, { lateral: 1 }), RIGHT); near.Update(0.5);
  assert.ok(near.breathless > 3 && near.heart > 0.2 && near.heartBpm >= BLAST_FLINCH.body.heartBpmMin);
  const far = new BlastFlinch(); far.SetEnabled(true); far.Blast(Exposure("Grenade", 40, { lateral: 1 }), RIGHT); far.Update(0.5);
  assert.equal(far.breathless, 0); assert.equal(far.heart, 0);
});

Group("测试场数据：站位、弹种、落点换算、开关", () => {
  assert.equal(BATTLE_REACTION_RANGE_PHASE.groundImpactDust, true, "开扬尘");
  assert.equal(BATTLE_REACTION_RANGE_PHASE.blastReaction, true, "开人物反应");
  assert.ok(BATTLE_REACTION_STANDS.some((s) => s.id === "trench"), "有沟里的站位");
  assert.ok(BATTLE_REACTION_MUNITION_SPECS.length >= 8 && BATTLE_REACTION_MUNITION_SPECS.every((s) => s.fillingKg > 0));
  const at = ReactionPoint({ x: 0, z: 0 }, 0, 90, 10);
  assert.ok(Math.abs(at.x - 10) < 1e-9 && Math.abs(at.z) < 1e-9, "朝北时右边 10 m 在东");
  const front = ReactionPoint({ x: 0, z: 0 }, Math.PI / 2, 0, 10);
  assert.ok(Math.abs(front.x + 10) < 1e-9, "朝西时正前 10 m 在西");
  assert.equal(EAR_TRAUMA.ringNodes, 14, "一条鸣响 14 个节点（Script_AudioEarTrauma.BuildRing）");
});

Group("砖铺场院：站位在砖地正中、离壕沟和布景够远、砖地出尘不到黄土地一成", () => {
  const pad = BATTLE_REACTION_PAVED, stand = BATTLE_REACTION_STANDS.find((s) => s.id === "paved");
  assert.ok(stand && stand.x === pad.x && stand.z === pad.z, "站位在场院正中");
  assert.ok(InPavedYard(pad.x + pad.halfX - 0.1, pad.z) && !InPavedYard(pad.x + pad.halfX + 0.1, pad.z), "边界");
  const near = (x, z) => Math.abs(x - pad.x) < pad.halfX + 3 && Math.abs(z - pad.z) < pad.halfZ + 3;
  for (const seg of SHELL_IMPACT_TRENCH_SEGMENTS) for (const p of seg.points) assert.ok(!near(p.x, p.z), `壕沟 ${seg.id} 不进场院`);
  for (const e of [...SHELL_IMPACT_TREES, ...SHELL_IMPACT_DRUMS, ...SHELL_IMPACT_PROPS]) assert.ok(!near(e.x, e.z), `布景 ${e.id} 不进场院`);
  assert.ok(pad.x - pad.halfX > SHELL_IMPACT_WORLD.minX && pad.z + pad.halfZ < SHELL_IMPACT_WORLD.maxZ, "在地皮里");
  const brick = GROUND_IMPACT_SURFACES[pad.surface];
  assert.ok(brick && brick.massScale < 0.1 * GROUND_IMPACT_SURFACES.loess.massScale && brick.ejecta < 0.2, "砖地出尘少");
});

console.log(`BlastReactionTest: ${groups} groups passed`);
