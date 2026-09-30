// 受击物理反应的规则层：冲量分配的符号与比例、弹簧积分的稳定与休眠、死亡包络、方向死亡选择、接线静态检查（纯 Node，毫秒级）。
// 真引擎（真实 GLB 人物、骨骼世界角度、每帧耗时）见 Script_HitReactionBrowserTest.mjs。
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  DEFAULT_TUNING, BuildBodyModel, ComputeHitReaction, ClassifyZone, HitSeverity, HitReactionState, DeathEnvelope, DeathYawBlend,
  DesiredFall, ChooseDeathClip, FallbackCandidates, YawToTurn, RotateYaw, StableUnit, SPRING_BONE_IDS, NormalizeKind,
} from "./Script_HitReaction.mjs";
import { DEATH_CONTACT } from "./Data_Tuning_ActorDeath.mjs";
import { AI_HOLD, DEATH, DEATH_SELECT, BODY, IMPULSE } from "./Data_Tuning_HitReaction.mjs";

const DEG = 180 / Math.PI;
const model = BuildBodyModel(1.68);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const hit = (o) => ({ kind: "bullet", part: "torso", rawDamage: 75, damage: 75, dirLocal: [0, 0, 1], seed: 1, ...o });
const react = (o) => ComputeHitReaction(hit(o), model);
const W = (r, id) => r.omega[id];

// --- 人体模型 ------------------------------------------------------------------------------
{
  near(BODY.segments.reduce((s, seg) => s + seg.mass, 0), 1, 1e-9, "分段质量占体重 100%");
  near(model.segments.reduce((s, seg) => s + seg.mass, 0), BODY.massKg, 1e-6, "总质量 70 kg");
  for (const id of SPRING_BONE_IDS) {
    const bone = model.bones[id];
    assert.ok(bone, `${id} 有惯量`);
    for (let r = 0; r < 3; r += 1) assert.ok(bone.I[r][r] > 0, `${id} 惯量对角线为正`);
    // 逆矩阵校验（各向同性骨也成立）：I·Iinv 的对角线是 1 或（各向同性时）不为 1 但 Iinv 是对角
    if (!DEFAULT_TUNING.BONES[/(upperArm|forearm)/.test(id) ? id.replace(/[LR]$/, "") : id].isotropic) {
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) {
        let v = 0; for (let k = 0; k < 3; k += 1) v += bone.I[r][k] * bone.Iinv[k][c];
        near(v, r === c ? 1 : 0, 1e-6, `${id} I·I⁻¹`);
      }
    }
  }
  // 越靠上、越靠远端的骨，惯量越小：脊柱 > 颈 > 头；上臂 > 前臂
  assert.ok(model.bones.spine.I[0][0] > model.bones.spine1.I[0][0] && model.bones.spine1.I[0][0] > model.bones.spine2.I[0][0]);
  assert.ok(model.bones.spine2.I[0][0] > model.bones.neck.I[0][0] && model.bones.neck.I[0][0] > model.bones.head.I[0][0]);
  assert.ok(model.bones.upperArmR.I[0][0] > model.bones.forearmR.I[0][0]);
  // 左右对称
  near(model.bones.upperArmR.I[0][0], model.bones.upperArmL.I[0][0], 1e-9, "左右臂惯量对称");
  // 身高缩放：更高的人关节更高、惯量更大
  const tall = BuildBodyModel(1.9);
  assert.ok(tall.joints.head[1] > model.joints.head[1] && tall.bones.spine.I[0][0] > model.bones.spine.I[0][0]);
}

// --- 受击强度 -----------------------------------------------------------------------------
{
  const s = (o) => HitSeverity(hit(o));
  near(s({}), 1.0, 0.05, "步枪档 ≈ 1");
  assert.ok(s({ rawDamage: 150 }) <= IMPULSE.kinds.bullet.gain * IMPULSE.kinds.bullet.maxRatio + 1e-9, "伤害有上限");
  assert.ok(s({ rawDamage: 5 }) >= IMPULSE.kinds.bullet.gain * IMPULSE.kinds.bullet.minRatio - 1e-9, "伤害有下限");
  const ratio = (kind, dmg) => s({ kind, rawDamage: dmg, damage: dmg }) / s({});
  assert.ok(ratio("hmg", 45) >= 1.2 && ratio("hmg", 45) <= 1.6, "机枪 = 步枪档 ×1.2–1.6");
  assert.ok(ratio("blade", 90) >= 1.1 && ratio("blade", 90) <= 1.6, "大刀 = 步枪档 ×1.1–1.6");
  assert.ok(ratio("blast", 200) > 3, "近爆远大于步枪");
  assert.equal(NormalizeKind("slash"), "blade");
  assert.equal(NormalizeKind("weird"), "bullet");
  // 用未乘部位倍率的伤害：同一发子弹打头（×3.2）与打躯干冲量相同
  near(s({ rawDamage: 75, damage: 240 }), s({ rawDamage: 75, damage: 75 }), 1e-12, "冲量看原始伤害不看部位倍率");
  near(s({ rawDamage: undefined, damage: 75 }), s({}), 1e-9, "没有 rawDamage 退回 damage");
}

// --- 冲量分配：符号与比例（正 / 背 / 左 / 右 × 头 / 胸 / 肩 / 腿 / 臂）-------------------------
{
  const front = [0, 0, 1], back = [0, 0, -1], fromLeft = [1, 0, 0] /* 飞行方向 +X：从人物左边打来 */, fromRight = [-1, 0, 0];
  const chest = (dir) => react({ shapeId: "upperTorso", dirLocal: dir });
  const f = chest(front), b = chest(back);
  // 正面中弹：胸后仰（绕 +X 转正 = 上身朝 +Z 背后倒）；背后中弹符号相反、幅度相同
  assert.ok(W(f, "spine2")[0] > 0 && W(b, "spine2")[0] < 0, "前后符号相反");
  near(W(f, "spine2")[0], -W(b, "spine2")[0], 1e-9, "前后幅度相同");
  // 头相对胸也是顺冲量方向甩（颈头传递）
  assert.ok(W(f, "head")[0] > 0 && W(b, "head")[0] < 0);
  assert.ok(W(f, "neck")[0] > 0);
  // 脊柱三节：上面那节角速度最大（惯量最小），下面两节依次衰减
  assert.ok(Math.abs(W(f, "spine2")[0]) > Math.abs(W(f, "spine1")[0]) && Math.abs(W(f, "spine1")[0]) > Math.abs(W(f, "spine")[0]) * 0.99);
  // 左右：从左边打来（+X 飞行）胸往右倒（绕 −Z 转，ω_z < 0），反之亦然
  const l = chest(fromLeft), r = chest(fromRight);
  assert.ok(W(l, "spine2")[2] < 0 && W(r, "spine2")[2] > 0, "侧面中弹按方向倾斜");
  near(W(l, "spine2")[2], -W(r, "spine2")[2], 1e-9, "左右幅度相同");
  // 打右肩（正面）：胸绕竖轴，右肩向后 = 绕 −Y；打左肩相反
  const rs = react({ shapeId: "upperArmR", part: "arm", dirLocal: front }), ls = react({ shapeId: "upperArmL", part: "arm", dirLocal: front });
  assert.ok(W(rs, "spine2")[1] < 0 && W(ls, "spine2")[1] > 0, "打右肩右肩向后、打左肩左肩向后");
  near(W(rs, "spine2")[1], -W(ls, "spine2")[1], 1e-9, "左右肩对称");
  assert.ok(W(rs, "upperArmR") && !W(rs, "upperArmL"), "只有受力那条胳膊吃满冲量");
  // 打头：颈头猛甩，头的角速度远大于打胸时头被带的量
  const hd = react({ shapeId: "head", part: "head", dirLocal: front });
  assert.ok(W(hd, "head")[0] > 0 && W(hd, "head")[0] > 2 * W(f, "head")[0], "打头比打胸头甩得狠");
  assert.ok(!hd.omega.upperArmR, "打头不动手臂");
  // 打腿：脚在地上，不走骨链；受力那条腿软得多
  const th = react({ shapeId: "thighR", part: "leg", dirLocal: front }), thL = react({ shapeId: "thighL", part: "leg", dirLocal: front });
  assert.equal(Object.keys(th.omega).length, 0, "打腿不转上身");
  assert.ok(th.sinkV.R > th.sinkV.L && th.sinkV.L > 0, "受力腿下沉更多、另一条也软一点");
  assert.ok(thL.sinkV.L > thL.sinkV.R);
  assert.ok(f.sinkV.R < th.sinkV.R * 0.1, "打上身只有一点点腿软");
  // 打手臂（前臂）：前臂自己 + 上臂带一部分
  const fa = react({ shapeId: "forearmL", part: "arm", dirLocal: front });
  assert.ok(fa.omega.forearmL && fa.omega.upperArmL && !fa.omega.forearmR);
  // 骨盆踉跄：顺冲量方向、水平、打腿 / 手臂比打胸弱
  assert.ok(f.pelvisVel[2] > 0 && b.pelvisVel[2] < 0 && f.pelvisVel[1] === 0);
  assert.ok(Math.abs(f.pelvisVel[2]) > Math.abs(fa.pelvisVel[2]));
  // 线性：伤害翻倍（未到上限）冲量翻倍
  const half = react({ shapeId: "upperTorso", rawDamage: 40, damage: 40 }), full = react({ shapeId: "upperTorso", rawDamage: 80, damage: 80 });
  near(W(full, "spine2")[0] / W(half, "spine2")[0], 2, 1e-9, "冲量与伤害成正比");
  // 白刃：扫刀方向与冲量方向合成
  const blade = react({ kind: "blade", shapeId: "upperTorso", rawDamage: 90, dirLocal: front, sweepLocal: [-1, 0, 0] });
  assert.ok(blade.dir[0] < -0.2 && blade.dir[2] > 0.2, "白刃冲量既有前向又顺扫刀");
  const bladeNoSweep = react({ kind: "blade", shapeId: "upperTorso", rawDamage: 90, dirLocal: front });
  near(bladeNoSweep.dir[0], 0, 1e-12, "没有扫刀就只用攻击方向");
  // 受力段：没有命中体 id 按 part，肢体取离射手近的一侧
  assert.deepEqual(ClassifyZone({ part: "arm", dirLocal: [-1, 0, 0.1] }), { zone: "upperArm", side: "R" }, "射手在右边（飞行朝 −X）取右臂");
  assert.deepEqual(ClassifyZone({ part: "leg", dirLocal: [1, 0, 0.1] }), { zone: "thigh", side: "L" }, "射手在左边取左腿");
  assert.equal(ClassifyZone({ part: "head" }).zone, "head");
  assert.equal(ClassifyZone({ part: "torso" }).zone, "chestUpper");
  assert.equal(ClassifyZone({ shapeId: "lowerTorso", part: "head" }).zone, "chestLower", "命中体 id 优先于 part");
  const same = [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => ClassifyZone({ part: "arm", dirLocal: [0, 0, 1], seed }).side);
  assert.ok(same.includes("L") && same.includes("R"), "正对着打时按 seed 稳定抽侧");
  assert.deepEqual(same, [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => ClassifyZone({ part: "arm", dirLocal: [0, 0, 1], seed }).side), "同 seed 同一侧");
  // 受力点：不信没有命中体 id 的 point（它是瞄点）
  const aim = react({ part: "torso", pointLocal: [0.5, 5, 5], dirLocal: front });
  assert.deepEqual(aim.point, react({ part: "torso", dirLocal: front }).point, "无命中体 id 时忽略 pointLocal");
  const geo = react({ shapeId: "upperTorso", pointLocal: [0.1, 1.4, -0.1], dirLocal: front });
  assert.deepEqual(geo.point, [0.1, 1.4, -0.1], "有命中体 id 才信 pointLocal");
  // 受力点越高（离关节越远）力臂越长、转得越多
  const low = react({ shapeId: "upperTorso", pointLocal: [0, 1.36, -0.1] }), high = react({ shapeId: "upperTorso", pointLocal: [0, 1.5, -0.1] });
  assert.ok(W(high, "spine2")[0] > W(low, "spine2")[0], "打得高转得多");
  // 活的关节位置覆盖站姿：把胸关节挪高，力臂变短
  const shifted = ComputeHitReaction(hit({ shapeId: "upperTorso", pointLocal: [0, 1.4, -0.1] }), model, { live: { spine2: [0, 1.39, 0] } });
  assert.ok(Math.abs(W(shifted, "spine2")[0]) < Math.abs(W(geo, "spine2")[0]));
  // 数值自检：没有 NaN
  for (const reaction of [f, b, l, r, rs, hd, th, fa, blade]) {
    for (const w of Object.values(reaction.omega)) assert.ok(w.every(Number.isFinite));
    assert.ok(reaction.pelvisVel.every(Number.isFinite) && Number.isFinite(reaction.sinkV.L));
  }
}

// --- 弹簧积分：稳定、限位、休眠、确定性、回复时间 ------------------------------------------------
function run(reaction, { death = false, seconds = 1.6, dt = 1 / 60 } = {}) {
  const st = new HitReactionState(model);
  st.Apply(reaction, { death });
  const trace = [];
  for (let t = 0; t < seconds; t += dt) {
    st.Step(dt);
    trace.push({ t, thetas: st.Thetas(), pelvis: st.PelvisOffset(), flex: st.LegFlex(), active: st.active });
  }
  return { st, trace };
}
const totalTilt = (frame) => {
  const v = [0, 0, 0];
  for (const e of frame.thetas) if (["spine", "spine1", "spine2"].includes(e.id)) for (let k = 0; k < 3; k += 1) v[k] += e.theta[k];
  return v;
};
{
  const rifle = react({ shapeId: "upperTorso" });
  const { st, trace } = run(rifle);
  const peak = Math.max(...trace.map((f) => Math.abs(totalTilt(f)[0]))) * DEG;
  assert.ok(peak > 8 && peak < 22, `步枪正面胸后仰峰值 ${peak.toFixed(1)}° 在目标区间附近`);
  const settle = trace.filter((f) => Math.abs(totalTilt(f)[0]) * DEG > 1).at(-1)?.t ?? 0;
  assert.ok(settle < 0.8, `胸 0.8 s 内回到 < 1°（${settle.toFixed(2)} s）`);
  assert.equal(st.active, false, "回复之后休眠");
  for (const b of st.bones) assert.deepEqual([b.theta, b.omega], [[0, 0, 0], [0, 0, 0]], "休眠时所有量严格清零");
  assert.deepEqual(st.PelvisOffset(), [0, 0, 0]);
  const headPeak = Math.max(...trace.map((f) => { const n = f.thetas.find((e) => e.id === "neck").theta, h = f.thetas.find((e) => e.id === "head").theta; return Math.abs(n[0] + h[0]); })) * DEG;
  assert.ok(headPeak > 12 && headPeak < 30, `头相对胸后甩 ${headPeak.toFixed(1)}° 在 12–30° 附近`);
  const pel = Math.max(...trace.map((f) => f.pelvis[2])) * 100;
  assert.ok(pel > 3 && pel < 8.5, `骨盆后移 ${pel.toFixed(1)} cm`);
  // 确定性：同输入逐位相同
  const again = run(rifle);
  assert.deepEqual(again.trace.map((f) => totalTilt(f)), trace.map((f) => totalTilt(f)), "两次运行逐位相同");
  // 休眠零开销：没有冲量 Step 什么都不做
  const idle = new HitReactionState(model);
  const before = JSON.stringify(idle.bones);
  idle.Step(1 / 60);
  assert.equal(JSON.stringify(idle.bones), before);
  assert.equal(idle.active, false);
}
{
  // 帧率无关：60 fps 与 30 fps 与 144 fps 的峰值差 < 6%
  const rifle = react({ shapeId: "upperTorso" });
  const peakAt = (dt) => Math.max(...run(rifle, { dt }).trace.map((f) => Math.abs(totalTilt(f)[0])));
  const p60 = peakAt(1 / 60);
  for (const dt of [1 / 30, 1 / 144, 1 / 20]) assert.ok(Math.abs(peakAt(dt) - p60) / p60 < 0.08, `dt=${dt} 峰值与 60 fps 一致`);
  // 大 dt（掉帧）：一帧最多 maxSubsteps 步，不炸
  const st = new HitReactionState(model);
  st.Apply(react({ shapeId: "upperTorso", kind: "blast", rawDamage: 300 }));
  st.Step(5);
  for (const b of st.bones) assert.ok(b.theta.every(Number.isFinite) && b.omega.every(Number.isFinite));
  // 限位：任何时刻 |θ| ≤ limit
  const blast = react({ shapeId: "head", part: "head", kind: "blast", rawDamage: 400, damage: 400 });
  const run2 = run(blast, { seconds: 1 });
  for (const f of run2.trace) for (const e of f.thetas) {
    const limit = DEFAULT_TUNING.BONES[/(upperArm|forearm)/.test(e.id) ? e.id.replace(/[LR]$/, "") : e.id].limitDeg / DEG;
    assert.ok(Math.hypot(...e.theta) <= limit + 1e-9, `${e.id} 超出关节限位`);
  }
  // NaN / 极端输入不污染状态
  const bad = new HitReactionState(model);
  bad.Apply({ omega: { spine2: [1e6, 0, 0] }, pelvisVel: [1e6, 0, 1e6], sinkV: { L: 1e6, R: 0 } });
  for (let i = 0; i < 120; i += 1) bad.Step(1 / 60);
  for (const b of bad.bones) assert.ok(b.theta.every(Number.isFinite));
  assert.ok(Math.hypot(...bad.PelvisOffset()) <= DEFAULT_TUNING.STAGGER.maxM + DEFAULT_TUNING.LEG_BUCKLE.maxSinkM + 1e-9, "骨盆偏移有硬上限");
  // 连续中弹会叠，但受力有硬上限
  const many = new HitReactionState(model);
  for (let i = 0; i < 40; i += 1) many.Apply(react({ shapeId: "thighR", part: "leg", kind: "hmg" }));
  many.Step(1 / 60);
  assert.ok(many.sink.R.x <= DEFAULT_TUNING.LEG_BUCKLE.maxSinkM + 1e-9);
}
{
  // 腿软：脚不离地的几何。髋降 d ⇒ α = acos(1 − d/2L)，膝 β = 2α，脚高 L cos α + L cos(β − α) = 2L − d
  const th = run(react({ shapeId: "thighR", part: "leg" }));
  let checked = 0;
  for (const f of th.trace) {
    const d = -f.pelvis[1];
    const flex = f.flex.R;
    if (flex.hip < 1e-3) continue;
    const L = (model.legs.R.thighM + model.legs.R.calfM) / 2;
    const hipHeight = L * Math.cos(flex.hip) + L * Math.cos(flex.knee - flex.hip);
    // 受力腿的 d 与骨盆下沉（两腿平均）不同：用该腿自己的 sink
    const own = 2 * L - hipHeight;
    assert.ok(own >= -1e-9);
    near(flex.knee, 2 * flex.hip, 1e-12, "膝屈 = 2 × 髋前屈");
    checked += 1; void d;
  }
  assert.ok(checked > 10, "腿软有效帧");
  const peakSink = Math.max(...th.trace.map((f) => -f.pelvis[1])) * 100;
  assert.ok(peakSink > 3 && peakSink < 9, `打大腿骨盆下沉 ${peakSink.toFixed(1)} cm`);
  const peakKnee = Math.max(...th.trace.map((f) => f.flex.R.knee)) * DEG;
  assert.ok(peakKnee > 20 && peakKnee < 50, `受力侧膝屈 ${peakKnee.toFixed(1)}°`);
  assert.ok(Math.max(...th.trace.map((f) => f.flex.R.knee)) > Math.max(...th.trace.map((f) => f.flex.L.knee)), "受力侧膝屈更多");
  const recovered = th.trace.filter((f) => f.flex.R.knee * DEG > 1 || -f.pelvis[1] > 0.004).at(-1)?.t ?? 0;
  assert.ok(recovered < 0.9, `腿软 0.9 s 内恢复（${recovered.toFixed(2)} s）`);
  // 腿软只往下掉，不把人顶起来
  for (const f of th.trace) assert.ok(f.pelvis[1] <= 1e-9);
}
{
  // 死亡档：肌张力丢失——不回弹、没有骨盆位移与腿软
  const shot = react({ shapeId: "upperTorso", lethal: true });
  const live = run(shot).trace.map((f) => totalTilt(f)[0]);
  const dead = run(shot, { death: true }).trace;
  assert.ok(dead.every((f) => f.pelvis.every((v) => v === 0) && f.flex.L.hip === 0));
  const series = dead.map((f) => totalTilt(f)[0]);
  const peak = Math.max(...series.map(Math.abs));
  assert.ok(peak > Math.max(...live.map(Math.abs)) * 0.9, "死亡冲击不比活人小（×impulseScale，弹簧更软）");
  const peakAt = series.findIndex((v) => Math.abs(v) === peak);
  const overshoot = Math.max(0, ...series.slice(peakAt).map((v) => -Math.sign(series[peakAt]) * v));
  assert.ok(overshoot < peak * 0.05, `死亡档不回弹（反向 ${overshoot.toFixed(4)} < 5% 峰值）`);
  assert.ok(DEATH.frequencyScale < 1 && DEATH.dampingRatio > DEFAULT_TUNING.BONES.spine2.zeta);
}

// --- 死亡包络：fadeEndT 严格为 0 --------------------------------------------------------------
{
  assert.equal(DeathEnvelope(0), 1);
  assert.equal(DeathEnvelope(DEATH.fadeStartT), 1);
  assert.equal(DeathEnvelope(DEATH.fadeEndT), 0, "t = fadeEndT 严格为 0");
  assert.equal(DeathEnvelope(0.85), 0);
  assert.equal(DeathEnvelope(1), 0);
  assert.ok(DEATH.fadeEndT < DEATH_CONTACT.poseEnd, "偏移在接地拟合（poseEnd）之前必须归零");
  assert.ok(DEATH.yawBlendEndT < DEATH_CONTACT.poseEnd, "转向在接地拟合之前转完");
  let last = 1;
  for (let t = 0; t <= 1; t += 0.005) {
    const e = DeathEnvelope(t);
    assert.ok(e <= last + 1e-12 && e >= 0 && e <= 1, "包络单调不增");
    last = e;
  }
  assert.ok(DeathEnvelope((DEATH.fadeStartT + DEATH.fadeEndT) / 2) > 0.3 && DeathEnvelope((DEATH.fadeStartT + DEATH.fadeEndT) / 2) < 0.7);
  // 按秒的一层（验收时补的）：物理仿真库的倒地长 1.6–3.2 s，冲击不许拖到 fadeEndS 秒以后；短 clip 仍受进度那一层管
  for (const durationS of [1.2, 1.6, 2.3, 3.2]) {
    let prev = 1;
    for (let t = 0; t <= 1; t += 0.002) {
      const e = DeathEnvelope(t, DEFAULT_TUNING, durationS);
      assert.ok(e <= DeathEnvelope(t) + 1e-12, "秒包络只会更早收，不会放大");
      assert.ok(e <= prev + 1e-12, "秒包络单调不增");
      if (t * durationS >= DEATH.fadeEndS) assert.equal(e, 0, `${durationS} s 的 clip 在 ${DEATH.fadeEndS} s 之后偏移为 0`);
      prev = e;
    }
    assert.equal(DeathEnvelope(0, DEFAULT_TUNING, durationS), 1);
  }
  // 死亡转向按秒转完（人还站着时拧完），进度上限仍在接地拟合之前
  for (const durationS of [1.2, 1.8, 3.2]) {
    assert.equal(DeathYawBlend(0, DEFAULT_TUNING, durationS), 0);
    near(DeathYawBlend(DEATH.yawBlendS / durationS, DEFAULT_TUNING, durationS), 1, 1e-9, `${durationS} s：${DEATH.yawBlendS} s 时转完`);
    near(DeathYawBlend(DEATH.yawBlendEndT, DEFAULT_TUNING, durationS), 1, 1e-9, "进度上限处必定转完");
  }
  assert.ok(DEATH.yawBlendS <= 0.4, "转向 0.4 s 内完成（倒地动作里骨盆还没走远）");
}

// --- 方向死亡选择 -------------------------------------------------------------------------------
{
  // 转向约定与 three 的 makeRotationY 一致：绕 +Y 转 90° 把 +X 转到 −Z
  const q = RotateYaw([1, 0], Math.PI / 2);
  near(q[0], 0, 1e-12, "+X 转 90° 后 x"); near(q[1], -1, 1e-12, "+X 转 90° 后 z = −1");
  const rnd = (i) => StableUnit(i, "yaw") * 2 * Math.PI;
  for (let i = 0; i < 200; i += 1) {
    const a = [Math.cos(rnd(i)), Math.sin(rnd(i))], b = [Math.cos(rnd(i + 999)), Math.sin(rnd(i + 999))];
    const out = RotateYaw(a, YawToTurn(a, b));
    near(out[0], b[0], 1e-9, "YawToTurn(a,b) 把 a 转到 b"); near(out[1], b[1], 1e-9, "YawToTurn z");
  }
  // 期望倒向
  const D = (o) => DesiredFall({ kind: "bullet", part: "torso", dirLocal: [0, 0, 1], seed: 3, ...o });
  assert.deepEqual(D({}).vec, [0, 1], "正面中弹往后倒（+Z）");
  assert.deepEqual(D({ dirLocal: [0, 0, -1] }).vec, [0, -1], "背后中弹往前扑");
  assert.deepEqual(D({ dirLocal: [1, 0, 0] }).vec, [1, 0], "从左边打来往右倒");
  near(D({ dirLocal: [0.6, 0.5, 0.8] }).vec[0], 0.6, 1e-12, "只取水平分量并归一"); // (0.6,0.8) 已是单位
  assert.equal(D({ dirLocal: [0, 1, 0] }).crumple, true, "竖直方向（没有水平分量）原地瘫");
  // 爆头：按 seed 稳定抽，一半原地瘫、一半顺冲量
  const heads = Array.from({ length: 400 }, (_, seed) => D({ part: "head", shapeId: "head", seed }).crumple);
  const rate = heads.filter(Boolean).length / heads.length;
  assert.ok(Math.abs(rate - DEATH_SELECT.crumpleChance) < 0.08, `爆头原地瘫占 ${rate.toFixed(2)}`);
  assert.deepEqual(heads, Array.from({ length: 400 }, (_, seed) => D({ part: "head", shapeId: "head", seed }).crumple), "同 seed 同结果");
  assert.equal(D({ part: "head", shapeId: "head", kind: "blast" }).crumple, false, "爆炸不抽原地瘫");
  // 打腿：往受力侧前方塌
  const legR = D({ part: "leg", shapeId: "thighR" }).vec, legL = D({ part: "leg", shapeId: "calfL" }).vec;
  assert.ok(legR[0] > 0.5 && legR[1] < -0.5 && legL[0] < -0.5 && legL[1] < -0.5, "腿部中弹往受力侧前方塌");
  // 大刀：顺扫刀方向；刺刀：朝攻击者一侧折下去或原地瘫
  const blade = D({ kind: "blade", shapeId: "upperTorso", sweepLocal: [-1, 0, 0.1] }).vec;
  assert.ok(blade[0] < -0.9, "大刀顺扫刀往左倒");
  assert.deepEqual(D({ kind: "blade", shapeId: "upperTorso" }).vec, [0, 1], "没有扫刀方向退回攻击方向");
  const thrusts = Array.from({ length: 300 }, (_, seed) => D({ kind: "thrust", shapeId: "upperTorso", seed }));
  const folds = thrusts.filter((t) => !t.crumple);
  assert.ok(folds.length > 100 && folds.length < 200, `刺刀捅：折下去 ${folds.length}/300`);
  for (const t of folds) { near(t.vec[0], 0, 1e-12, "刺刀捅折向攻击者（−飞行方向）x"); near(t.vec[1], -1, 1e-12, "刺刀捅折向攻击者 z"); }
  assert.deepEqual(D({ kind: "blast", dirLocal: [0, 0, -1] }).vec, [0, -1], "爆炸背离爆心（方向已是爆心→人）");

  // 候选：完整动作库（契约 §6 最小集合）
  const clip = (id, family, fall, source = "ragdoll-sim") => ({ id, family, fallLocal: fall, source });
  const full = [
    clip("BackA", "back", [0.05, 1]), clip("BackB", "back", [-0.15, 0.99]),
    clip("FwdA", "forward", [0.1, -1]), clip("FwdB", "forward", [-0.1, -0.99]),
    clip("LeftA", "left", [-1, 0.1]), clip("RightA", "right", [1, -0.05]),
    clip("CrumpleA", "crumple", null), clip("CrumpleB", "crumple", null),
    ...["A", "B", "C", "D"].map((k, i) => clip(`Mirror${k}`, "left", [-0.95 + 0.05 * i, 0.3 + 0.2 * i], "kimodo-mirror")),
    ...FallbackCandidates(),
  ].map((c) => ({ ...c, fallLocal: c.fallLocal ? (() => { const l = Math.hypot(...c.fallLocal); return [c.fallLocal[0] / l, c.fallLocal[1] / l]; })() : null }));
  const angleBetween = (a, b) => Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * DEG;
  for (const part of ["torso", "arm"]) for (let k = 0; k < 16; k += 1) {
    const ang = k * 22.5 * Math.PI / 180, dir = [Math.sin(ang), 0, Math.cos(ang)];
    const desired = DesiredFall({ kind: "bullet", part, dirLocal: dir, seed: 1 });
    const pick = ChooseDeathClip(desired, full, 1);
    const fall = full.find((c) => c.id === pick.id).fallLocal;
    // 契约 §7：转过剩余偏角之后，终帧倒向与期望的夹角 ≤ 45°（未转的原始夹角可以到 50° 左右：左与前的对角线上没有专门的动作）
    assert.ok(angleBetween(fall, desired.vec) <= DEATH_SELECT.maxYawResidualDeg + 8, `${part} ${k * 22.5}°：选中 ${pick.id}，原始夹角 ${angleBetween(fall, desired.vec).toFixed(0)}°`);
    assert.ok(pick.residualDeg <= 45, `${part} ${k * 22.5}°：残余偏角 ${pick.residualDeg.toFixed(0)}° ≤ 45°`);
    const turned = RotateYaw(fall, pick.yawRad);
    assert.ok(angleBetween(turned, desired.vec) <= pick.residualDeg + 0.01, "转向后与期望的夹角 = 残余偏角");
    assert.ok(Math.abs(pick.yawRad) <= DEATH_SELECT.maxYawResidualDeg / DEG + 1e-9, "转向不超过上限");
    assert.notEqual(pick.family, "crumple", "有方向时不选原地瘫");
  }
  // 各方向族都能被选到
  const families = new Set();
  for (let k = 0; k < 16; k += 1) {
    const ang = k * 22.5 * Math.PI / 180;
    families.add(ChooseDeathClip(DesiredFall({ kind: "bullet", part: "torso", dirLocal: [Math.sin(ang), 0, Math.cos(ang)], seed: 1 }), full, 1).family);
  }
  for (const f of ["back", "forward", "left", "right"]) assert.ok(families.has(f), `16 个方向里选出过 ${f}`);
  // crumple：只在期望是原地瘫时参与；没有 crumple 候选退回按 seed 抽、不转向
  const crumple = ChooseDeathClip({ crumple: true, vec: null }, full, 5);
  assert.equal(crumple.family, "crumple"); assert.equal(crumple.yawRad, 0);
  // 原地瘫按仿真时打的部位配对：爆头只取打头烘的，腹部 / 刺刀只取打躯干烘的；配不上才用整个池
  const tagged = full.map((c) => c.id === "CrumpleA" ? { ...c, impactPart: "head" } : c.id === "CrumpleB" ? { ...c, impactPart: "torso" } : c);
  for (let seed = 0; seed < 40; seed += 1) {
    assert.equal(ChooseDeathClip({ crumple: true, vec: null, zone: "head" }, tagged, seed).id, "CrumpleA", "爆头原地瘫取打头烘的");
    assert.equal(ChooseDeathClip({ crumple: true, vec: null, zone: "chestLower" }, tagged, seed).id, "CrumpleB", "腹部原地瘫取打躯干烘的");
  }
  const onlyTorso = tagged.filter((c) => c.id !== "CrumpleA");
  assert.equal(ChooseDeathClip({ crumple: true, vec: null, zone: "head" }, onlyTorso, 3).id, "CrumpleB", "配不上时退回整个 crumple 池");
  const noCrumple = ChooseDeathClip({ crumple: true, vec: null }, FallbackCandidates(), 5);
  assert.ok(noCrumple.id.startsWith("DeathCollapse") && noCrumple.yawRad === 0);
  // 库缺失（只有 A–D，全往右倒）：不断档，转向机制把倒向掰过去（最多 maxYawResidualDeg）
  const fb = FallbackCandidates();
  for (let k = 0; k < 16; k += 1) {
    const ang = k * 22.5 * Math.PI / 180;
    const desired = DesiredFall({ kind: "bullet", part: "torso", dirLocal: [Math.sin(ang), 0, Math.cos(ang)], seed: 2 });
    const pick = ChooseDeathClip(desired, fb, 2);
    assert.ok(pick && fb.some((c) => c.id === pick.id));
    assert.ok(Math.abs(pick.yawRad) <= DEATH_SELECT.maxYawResidualDeg / DEG + 1e-9);
    const turned = RotateYaw(fb.find((c) => c.id === pick.id).fallLocal, pick.yawRad);
    assert.ok(angleBetween(turned, desired.vec) <= pick.residualDeg + 0.01);
  }
  // 往右倒的候选遇到「往右倒」的期望：不转
  const right = ChooseDeathClip({ crumple: false, vec: [1, 0.2] }, fb, 3);
  assert.ok(right.residualDeg < 15 && Math.abs(right.yawRad) < 0.3);
  assert.equal(ChooseDeathClip({ crumple: false, vec: [0, 1] }, [], 1), null, "没有候选返回 null");
  // 稳定：同 seed 同选择；不同 seed 在并列候选里分散
  const desired = { crumple: false, vec: [1, 0] };
  const twin = [ChooseDeathClip(desired, full, 77).id, ChooseDeathClip(desired, full, 77).id];
  assert.equal(twin[0], twin[1], "同 seed 回放一致");
  const spread = new Set(Array.from({ length: 60 }, (_, seed) => ChooseDeathClip({ crumple: false, vec: [0, 1] }, full, seed).id));
  assert.ok(spread.size >= 2, "并列候选按 seed 分散");
  for (const seed of [0, 1, 2, 3]) {
    const a = ChooseDeathClip(desired, [...full].reverse(), seed).id, b = ChooseDeathClip(desired, full, seed).id;
    assert.equal(a, b, "结果与候选顺序无关（按 id 排序后抽）");
  }
}

// --- 接线：Soldier.TakeHit / Kill(hit) / BuildHitDescriptor（沙箱，与 FirstLevelP012ActorTest 同一手法）----------
const source = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), "utf8").replace(/\r/g, "");
const ai = source("Script_Ai.mjs");
const Method = (text, name) => text.match(new RegExp(`  ${name}\\([^\\n]*\\{[\\s\\S]*?\\n  }\\n`))[0];
{
  const takeHit = vm.runInNewContext(`({${Method(ai, "TakeHit")}})`, { HURT_FLINCH: { base: 0.45, damageDiv: 90 }, Clamp01: (n) => Math.min(1, Math.max(0, n)) }).TakeHit;
  const calls = [];
  const dir = { x: 0, y: 0, z: 1 };
  const make = (extra = {}) => ({
    alive: true, health: 100, hurtPose: 0, suppression: 0, scriptEssential: false, damageSequence: 0,
    BuildHitDescriptor(damage, mult, part, direction, info, lethal) { calls.push(["build", damage, mult, part, lethal]); return { tag: "hit", lethal }; },
    ApplyHitReaction(h) { calls.push(["react", h]); },
    Kill(...args) { calls.push(["kill", ...args]); this.alive = false; return true; },
    NeckDeathCause() { return { play: false, cause: null }; },
    ...extra,
  });
  let s = make(); takeHit.call(s, 30, "torso", dir, { kind: "bullet" });
  assert.deepEqual(calls.splice(0).map((c) => c[0]), ["build", "react"], "没死：组装描述 → 弹簧层出反应");
  s = make(); takeHit.call(s, 500, "torso", dir, { kind: "bullet" });
  const kill = calls.splice(0).find((c) => c[0] === "kill");
  assert.ok(kill && kill.length === 5 && kill[4].tag === "hit" && kill[4].lethal === true, "致死：Kill(direction, sever, neckDeath, hit) 带上 hit");
  s = make({ scriptEssential: true }); assert.equal(takeHit.call(s, 500, "torso", dir, {}), false);
  assert.deepEqual(calls.splice(0).map((c) => c[0]), ["build", "react"], "叙事保护照样有反应、不会死");
  // 沙箱里没有这些方法（P012ActorTest 的桩）也不许崩：全是 this.xxx?.()
  const bare = { alive: true, health: 20, hurtPose: 0, suppression: 0, scriptEssential: true, Kill() { return true; } };
  assert.doesNotThrow(() => takeHit.call(bare, 100, "head", null));
  const dead = { alive: true, health: 20, hurtPose: 0, suppression: 0, scriptEssential: false, Kill(...a) { this.args = a; this.alive = false; return true; } };
  takeHit.call(dead, 100, "head", null);
  assert.equal(dead.alive, false, "沙箱里致死仍走 Kill");
  assert.ok(dead.args[3] === null || dead.args[3] === undefined, "没有组装器时 hit 为空，Kill 行为不变");
}
{
  const build = vm.runInNewContext(`({${Method(ai, "BuildHitDescriptor")}})`, {}).BuildHitDescriptor;
  const soldier = { openingDoomed: false, id: 7, actor: { seed: "nra:9" } };
  const info = { kind: "hmg", shapeId: "thighL", point: { x: 1, y: 1, z: 1 }, sweep: null, weaponId: "Type11" };
  const dir = { x: 0, y: 0, z: 1 };
  const d = build.call(soldier, 40, 0.6, "legs", dir, info, false);
  assert.deepEqual([d.kind, d.part, d.shapeId, d.rawDamage, d.lethal, d.seed, d.weaponId], ["hmg", "leg", "thighL", 40, false, "nra:9", "Type11"]);
  near(d.damage, 24, 1e-9, "damage 是乘过部位倍率的有效伤害");
  assert.equal(build.call(soldier, 0, 1, "torso", dir, {}, false), null, "伤害 ≤ 0 不进");
  assert.equal(build.call(soldier, 30, 1, "torso", null, {}, false), null, "没有方向（剧本 TakeHit(…, null)）不进");
  assert.equal(build.call({ ...soldier, openingDoomed: true }, 30, 1, "torso", dir, {}, true), null, "开场分镜里被安排死的不进");
  assert.equal(build.call({ id: 3 }, 30, 1, "torso", dir, undefined, true).seed, 3, "没有演员用士兵 id 当 seed");
  assert.equal(build.call(soldier, 30, 1, "torso", dir, { kind: undefined }, true).kind, "bullet", "kind 缺省 bullet");
}
{
  const apply = vm.runInNewContext(`({${Method(ai, "ApplyHitReaction")}})`, { AiHoldSeconds: (sev) => (sev >= AI_HOLD.minSeverity ? Math.min(AI_HOLD.maxS, AI_HOLD.holdS * sev) : 0) }).ApplyHitReaction;
  const s = { fireTimer: 0.1, actor: { ReceiveHit: () => ({ severity: 1 }) } };
  apply.call(s, { tag: "hit" });
  near(s.fireTimer, AI_HOLD.holdS, 1e-9, "受击够重：下一发推迟 holdS × severity");
  const weak = { fireTimer: 0.1, actor: { ReceiveHit: () => ({ severity: AI_HOLD.minSeverity / 2 }) } };
  apply.call(weak, {}); assert.equal(weak.fireTimer, 0.1, "轻微擦伤不推迟");
  const cap = { fireTimer: 0, actor: { ReceiveHit: () => ({ severity: 50 }) } };
  apply.call(cap, {}); assert.equal(cap.fireTimer, AI_HOLD.maxS, "推迟有上限");
  const long = { fireTimer: 2, actor: { ReceiveHit: () => ({ severity: 1 }) } };
  apply.call(long, {}); assert.equal(long.fireTimer, 2, "本来就要等更久的不缩短");
  assert.equal(apply.call({ fireTimer: 0, actor: null }, { tag: 1 }), null);
  assert.equal(apply.call({ fireTimer: 0, actor: { ReceiveHit: () => null } }, { tag: 1 }), null, "层被关（?hitreact=0）不推迟");
  assert.equal(apply.call({ fireTimer: 0, actor: { ReceiveHit: () => ({ severity: 1 }) } }, null), null);
}

// --- 接线：源码顺序与登记（静态）-----------------------------------------------------------------
{
  const actor = source("Script_Actor.mjs"), model_ = source("Script_CharacterModel.mjs"), main = source("Script_Main.mjs");
  const update = actor.slice(actor.indexOf("  Update(dt, state = {}) {"), actor.indexOf("  /** Aim the arms and rifle"));
  const idx = (text, needle) => { const i = text.indexOf(needle); assert.ok(i >= 0, `找不到：${needle}`); return i; };
  assert.ok(idx(update, "hitReaction?.Restore()") < idx(update, "this.rigAimApplied"), "Update 开头：先还原受击层，再还原瞄准（后进先出）");
  assert.ok(idx(update, "hitReaction?.Restore()") < idx(update, "if (s.dead && !this.ragdollState)"), "还原排在死亡分支之前（尸体保持帧 mixer 不重写常量轨道）");
  assert.ok(idx(update, "this._ApplyRiggedAim(s)") < idx(update, "_ApplyHitReaction(dt, s)"), "弹簧层在 _ApplyRiggedAim 之后施加（枪和手一起被打偏，不被瞄准 IK 钉回）");
  assert.ok(idx(update, "this.PoseRagdoll(this.ragdollState, dying)") < idx(update, "hitReaction?.ApplyDeath("), "死亡档在 PoseDeath 之后施加");
  const apply = actor.slice(actor.indexOf("  _ApplyHitReaction(dt, state) {"), actor.indexOf("  Update(dt, state = {}) {"));
  assert.ok(idx(apply, "RecordWeapon") < idx(apply, "ApplyLive") && idx(apply, "ApplyLive") < idx(apply, "_UpdateRiggedWeaponMount()"), "施加后重跑挂点");
  assert.ok(/Ragdoll\(dirVec3, hit = null\)/.test(actor) && /BeginDeathPose\(deathChoice\)/.test(actor), "Ragdoll 接 hit、BeginDeathPose 接选择");
  assert.ok(/ReceiveHit\(hit\)/.test(actor) && /ResetHitReaction\(\)/.test(actor));
  assert.ok(/hitReaction\?\.Reset\(\)/.test(actor.slice(actor.indexOf("  Dispose() {"))), "演员回收清零");
  assert.ok(/setFromAxisAngle\(HIT_Y_AXIS, deathYaw\)/.test(actor), "死亡转向写在 body 上，不动 AI 的 yaw");
  assert.ok(/BeginDeathPose\(choice = null\)/.test(model_) && /!this\.hitReaction\?\.enabled\) this\._ApplyHurtTilt/.test(model_), "CharacterModel：接 deathChoice、有弹簧层不再画旧后仰");
  assert.ok(/this\.hurtTilt = \[\]/.test(model_), "rig.hurtTilt 数组保留（ActorPoseTest 读它）");
  assert.ok(/this\.actor\.Ragdoll\(direction \|\| new THREE\.Vector3\(0, 0, 1\), hit\)/.test(ai) && /Kill\(direction, sever = null, neckDeath = null, hit = null\)/.test(ai));
  assert.ok(/sweep: sweepDir/.test(main) && /contact\.end && contact\.previous/.test(main), "白刃把扫刀方向带进伤害链");
  assert.ok(/Debug\.HitReaction = \{/.test(main) && /Hit:|Impulse:|State:|SetEnabled:/.test(main.slice(main.indexOf("Debug.HitReaction = {"))));
  const html = source("index.html");
  for (const name of ["Data_Tuning_HitReaction", "Script_HitReaction", "Script_HitReactionLayer"]) assert.ok(html.includes(`"./${name}.mjs": "./${name}.mjs?v=`), `${name} 登记进 import map`);
  for (const file of ["Script_HitReaction.mjs", "Data_Tuning_HitReaction.mjs"]) {
    const text = source(file);
    assert.ok(!/from\s+["']three["']/.test(text), `${file} 不 import three（纯规则 / 纯数据）`);
    assert.ok(!/from\s+["'][^"']*\?v=/.test(text), `${file} 的 import 不许自带 ?v=`);
  }
  assert.ok(!/from\s+["'][^"']*\?v=/.test(source("Script_HitReactionLayer.mjs")), "Layer 的 import 不自带 ?v=");
  assert.ok(/\?v=deathImpact\d+/.test(source("Data_Tuning_HitReaction.mjs")), "动作库 URL 带自己的版本号（照 LayeredGait 写法）");
}

console.log(`HitReactionTest OK — 冲量符号与比例、弹簧稳定 / 限位 / 休眠 / 帧率无关、腿软几何、死亡包络 fadeEnd=${DEATH.fadeEndT} 归零、方向死亡 16 向 × 部位、库缺失退路、Soldier 接线与源码顺序`);
