// 冲击波推人（纯 Node）：冲量模型（Script_BlastKnockback）与倒地状态机（Script_PlayerKnockback）。
// 浏览器那一半（真炸、真胶囊、真相机）用 tmp 探针在 ?impacts=1 里看，验收口径见 docs/Data_BlastKnockback.md。
// 用法：node Taierzhuang1938/Script_BlastKnockbackTest.mjs
import assert from "node:assert/strict";
import { BLAST_KNOCKBACK } from "./Data_Tuning_BlastKnockback.mjs";
import { PeakOverpressureKPa, ChargeKgFor } from "./Script_BlastExposure.mjs";
import {
  BlastWave, BodyImpulse, BlastPush, BalanceLimitMps, LiftoffMps, KnockRegime, ImpactDamage, ToppleSpinRadS,
} from "./Script_BlastKnockback.mjs";
import { PlayerKnockback } from "./Script_PlayerKnockback.mjs";
import { LooseGunLaunch, LooseGunRod, GunReachPose } from "./Script_LooseGun.mjs";

let groups = 0;
const Group = (name, fn) => { fn(); groups += 1; console.log(`ok  ${name}`); };
const Near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: ${got.toFixed(3)} vs ${want} ±${tol}`);
const KG = (id) => ChargeKgFor(id);
const EYE = { stand: 1.62, crouch: 1.05, prone: 0.42 };

/** 平地（y = 0）+ 可选的一堵墙（x = wallX，胶囊半径 0.34）上跑状态机；返回轨迹摘要。 */
function Simulate({ id, distanceM, stance = "stand", wallX = null, seconds = 9, yaw = Math.PI / 2, occluded = false }) {
  const pos = { x: distanceM, y: 0, z: 0 };
  const push = BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: pos, stance, chargeKg: KG(id), occluded });
  const kb = new PlayerKnockback();
  const res = kb.Push(push, { stance, eyeM: EYE[stance], baseY: 0, x: pos.x, z: pos.z });
  const mover = (dx, dy, dz) => {
    let blocked = false, nx = pos.x + dx;
    if (wallX != null && nx > wallX - 0.34) { nx = wallX - 0.34; blocked = Math.abs(dx) > 1e-5; }
    pos.x = nx; pos.z += dz; pos.y += dy;
    let grounded = false;
    if (pos.y <= 0) { pos.y = 0; grounded = true; }
    return { ...pos, grounded, blocked };
  };
  const phases = [], impacts = [];
  let t = 0, minEye = Infinity, lyingPose = null, activeFrames = 0, staggerFrames = 0, minControl = 1;
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    kb.Step(1 / 60, mover); kb.Track(pos.x, pos.z); t += 1 / 60;
    if (kb.Active) activeFrames += 1;
    if (kb.Staggering) staggerFrames += 1;
    minControl = Math.min(minControl, kb.ControlScale);
    const key = kb.phase === "tumble" ? `tumble/${kb.contact}` : kb.phase;
    if (phases.at(-1)?.key !== key) phases.push({ key, t });
    const cam = kb.CameraPose(yaw, EYE[stance]);
    if (cam) minEye = Math.min(minEye, pos.y + cam.y);
    if (kb.phase === "lie" && !lyingPose) lyingPose = cam;
    for (const e of kb.ConsumeImpacts() || []) impacts.push(e);
    if (!kb.Active && !kb.Staggering && i > 2) break;
  }
  return { push, res, kb, phases, impacts, t, minEye, lyingPose, travel: kb.peak.travel, airS: kb.peak.airS, activeFrames, staggerFrames, minControl, end: { ...pos } };
}

Group("冲击波：超压与 BlastExposure 同一个式子，正压持续、风速、反射压量级对", () => {
  for (const [id, d] of [["Grenade", 3], ["Shell75", 8], ["Shell150", 20], ["Bomb250kg", 40]]) {
    const w = BlastWave(d, KG(id));
    Near(w.psKPa, PeakOverpressureKPa(d, KG(id)), 1e-9, `${id} ${d} m 超压同源`);
    assert.ok(w.prKPa > 2 * w.psKPa && w.prKPa < 8 * w.psKPa, `${id} 正面反射压在 2–8 倍侧压之间`);
    assert.ok(w.shockMps > 340 && w.windMps > 0 && w.windMps < w.shockMps, `${id} 激波比声速快、风比激波慢`);
  }
  // Kinney–Graham 拟合式本身：Z = 2 时 td / W^⅓ ≈ 1.18 ms；Z = 10 时 ≈ 3.5 ms（远处正压拖得更长）
  const w = BlastWave(2 * Math.cbrt(1.8), 1), far = BlastWave(10 * Math.cbrt(1.8), 1);
  Near(w.tdS / Math.cbrt(1.8) * 1000, 1.18, 0.05, "Z = 2 正压 ms/kg^⅓");
  assert.ok(far.tdS > 2.5 * w.tdS, `远处正压更长（${(far.tdS * 1000).toFixed(2)} ms）`);
  // 250 kg 炸弹 12 m 约 180 kPa、正压约 7 ms
  const b = BlastWave(12, KG("Bomb250kg"));
  Near(b.psKPa, 180, 15, "250 kg 12 m 超压 kPa"); Near(b.tdS * 1000, 7, 1.5, "250 kg 12 m 正压 ms");
});

Group("人身上的 Δv：参考表（站姿、到质心的距离）", () => {
  const table = [["Grenade", 2, 0.60], ["Grenade", 3, 0.28], ["Shell75", 3, 1.28], ["Shell150", 5, 1.56],
    ["Bomb250kg", 20, 0.77], ["Bomb250kg", 12, 3.18], ["Bomb250kg", 8, 9.49]];
  for (const [id, d, want] of table) Near(BodyImpulse({ distanceM: d, chargeKg: KG(id) }).dvMps, want, Math.max(0.03, want * 0.03), `${id} ${d} m`);
  let prev = Infinity;
  for (const d of [2, 3, 5, 8, 12, 20, 30, 60]) {
    const v = BodyImpulse({ distanceM: d, chargeKg: KG("Shell150") }).dvMps;
    assert.ok(v < prev, `Δv 随距离单调降（${d} m）`); prev = v;
  }
  const s = BodyImpulse({ distanceM: 8, chargeKg: KG("Shell150") }), c = BodyImpulse({ distanceM: 8, chargeKg: KG("Shell150"), stance: "crouch" });
  const p = BodyImpulse({ distanceM: 8, chargeKg: KG("Shell150"), stance: "prone" }), o = BodyImpulse({ distanceM: 8, chargeKg: KG("Shell150"), occluded: true });
  Near(c.dvMps / s.dvMps, 0.38 / 0.6, 1e-9, "蹲着按迎波面积缩"); Near(p.dvMps / s.dvMps, 0.12 / 0.6, 1e-9, "趴着按迎波面积缩");
  Near(o.dvMps / s.dvMps, BLAST_KNOCKBACK.impulse.occludedScale, 1e-9, "隔墙按绕射扣");
  const close = BodyImpulse({ distanceM: 1, chargeKg: KG("Bomb250kg") });
  assert.ok(close.dvMps <= BLAST_KNOCKBACK.impulse.maxDeltaVMps && close.capped, "贴脸的 Δv 封顶");
  assert.ok(s.diffractionPaS > 0 && s.dragPaS > 0, "绕射段与拖曳段都有份");
});

Group("站得住的上限、脚撑不住的速度（外推质心 / L·ω² > g）", () => {
  Near(BalanceLimitMps("stand"), 1.19, 0.02, "站姿迈一步接得住"); Near(BalanceLimitMps("crouch"), 1.99, 0.02, "蹲姿");
  assert.equal(BalanceLimitMps("prone"), Infinity, "趴着推不倒");
  Near(LiftoffMps("stand"), 3.92, 0.02, "站姿脚离地"); Near(LiftoffMps("crouch"), 3.25, 0.03, "蹲姿脚离地");
  const L = BLAST_KNOCKBACK.body.comHeightM.stand, g = BLAST_KNOCKBACK.body.gravityMps2;
  Near(L * ToppleSpinRadS(LiftoffMps("stand"), "stand") ** 2, g, 1e-6, "离地那一刻 L·ω0² = g");
});

Group("分档：小手榴弹只晃、大炸弹推倒或掀飞（脚踩在地上、方向指向质心）", () => {
  const Regime = (id, d, stance = "stand") => BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: { x: d, y: 0, z: 0 }, stance, chargeKg: KG(id) }).regime;
  // 手榴弹：2 m 推一下（0.43 m/s），3 m 刚到门槛（0.25 m/s，轻轻一下），4 m 以外什么都没有 —— 伤是弹片的事
  assert.equal(Regime("Grenade", 2), "stagger"); assert.equal(Regime("Grenade", 4), "none"); assert.equal(Regime("Grenade", 5), "none");
  assert.equal(Regime("Shell75", 3), "stagger"); assert.equal(Regime("Shell75", 2), "thrown");
  assert.equal(Regime("Shell150", 5), "fall"); assert.equal(Regime("Shell150", 3), "thrown"); assert.equal(Regime("Shell150", 8), "stagger");
  assert.equal(Regime("Bomb250kg", 30), "stagger"); assert.equal(Regime("Bomb250kg", 20), "stagger");
  assert.equal(Regime("Bomb250kg", 12), "fall"); assert.equal(Regime("Bomb250kg", 8), "thrown");
  assert.equal(Regime("Bomb250kg", 12, "crouch"), "fall"); assert.equal(Regime("Bomb250kg", 20, "crouch"), "stagger");
  assert.equal(Regime("Bomb250kg", 8, "prone"), "slide"); assert.equal(Regime("Bomb250kg", 20, "prone"), "none");
  // 往上掀只在本来就站不住时才算飞：站得住的那一下往上抬几毫米，落回来还是晃
  assert.equal(KnockRegime({ horizontalMps: 0.9, upMps: 0.9 }), "stagger");
  assert.equal(KnockRegime({ horizontalMps: 1.5, upMps: 0.9 }), "thrown");
  assert.equal(KnockRegime({ horizontalMps: 0.1, upMps: 0.1 }), "none");
  const p = BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: { x: 6, y: 0, z: 8 }, chargeKg: KG("Shell150") });
  Near(p.dirX, 0.6, 1e-9, "水平方向从爆点指向人"); Near(p.dirZ, 0.8, 1e-9, "水平方向从爆点指向人");
  assert.ok(p.upMps > 0 && p.horizontalMps > p.upMps, "地面爆炸推力主要是水平的、略往上");
});

Group("撞击钝伤：Glasstone 表 12.49 的速度判据", () => {
  Near(ImpactDamage(3.0, "wall"), 0, 1e-9, "撞墙 3 m/s 不伤"); Near(ImpactDamage(6.4, "wall"), 45, 1e-9, "撞墙出人命的门槛");
  Near(ImpactDamage(16.5, "wall"), 100, 1e-9, "撞墙一半死亡");
  Near(ImpactDamage(4.0, "ground"), 0, 1e-9, "普通摔倒不伤"); Near(ImpactDamage(9.1, "ground"), 12, 1e-9, "翻滚 1% 受伤");
  Near(ImpactDamage(22.9, "ground"), 100, 1e-9, "翻滚一半");
  let prev = -1;
  for (let v = 0; v <= 30; v += 0.5) { const d = ImpactDamage(v, "ground"); assert.ok(d >= prev, `地面伤害单调（${v}）`); prev = d; }
  assert.ok(ImpactDamage(8, "wall") > ImpactDamage(8, "ground"), "同样速度撞墙比在地上翻滚重");
});

Group("状态机：推一把不占身体，控制慢慢交还", () => {
  const r = Simulate({ id: "Grenade", distanceM: 2 });
  assert.equal(r.res.regime, "stagger"); assert.equal(r.activeFrames, 0, "推一把不进倒地");
  assert.ok(r.res.addVx > 0.3 && r.res.addVx < 0.6, `加给玩家的速度 ${r.res.addVx.toFixed(2)}`);
  assert.ok(r.minControl < 0.3, "刚挨那一下移动输入只剩一小部分");
  assert.ok(r.staggerFrames > 15 && r.staggerFrames < 50, `晃 ${r.staggerFrames} 帧`);
  assert.ok(r.minEye > 1.55, "站得住：眼睛只低一点");
});

Group("状态机：站不住 → 绕脚翻倒 → 身体着地 → 躺 → 爬起来（普通摔倒不伤人）", () => {
  const r = Simulate({ id: "Shell150", distanceM: 5 });
  assert.deepEqual(r.phases.map((p) => p.key), ["tumble/pivot", "slide", "lie", "rise", "none"]);
  const hit = r.phases.find((p) => p.key === "slide").t;
  assert.ok(hit > 0.5 && hit < 0.9, `从站着翻到身体着地 ${hit.toFixed(2)} s（绊倒类摔倒约 0.7 s）`);
  assert.equal(r.impacts.length, 1); assert.equal(r.impacts[0].surface, "ground"); assert.equal(r.impacts[0].damage, 0, "站着摔倒不扣血");
  assert.ok(r.minEye < 0.3, `躺着眼睛贴地 ${r.minEye.toFixed(2)} m`);
  assert.ok(r.travel > 0.6 && r.travel < 1.6, `往后倒出去 ${r.travel.toFixed(2)} m`);
  // 人面朝 +X（yaw = −π/2 → 前 = (1,0,0)），被往 +X 推 = 往前扑：相机低头；面朝 −X 被往 +X 推 = 仰面倒：相机抬头看天
  const front = Simulate({ id: "Shell150", distanceM: 5, yaw: -Math.PI / 2 }), back = Simulate({ id: "Shell150", distanceM: 5, yaw: Math.PI / 2 });
  assert.ok(front.lyingPose.pitch < -1 && Math.abs(front.lyingPose.roll) < 1e-6, "往前扑倒：低头");
  assert.ok(back.lyingPose.pitch > 1, "仰面倒：抬头");
  const side = Simulate({ id: "Shell150", distanceM: 5, yaw: 0 });   // 面朝 −Z，右手是 +X：往右倒
  assert.ok(side.lyingPose.roll < -1 && Math.abs(side.lyingPose.pitch) < 1e-6, "往右倒：相机往右滚");
  assert.ok(r.t > 2 && r.t < 4.5, `整段 ${r.t.toFixed(2)} s`);
});

Group("状态机：掀飞 → 半空转 → 身体砸地（按着地速度扣血）→ 滑出去", () => {
  const r = Simulate({ id: "Bomb250kg", distanceM: 8 });
  assert.equal(r.res.regime, "thrown"); assert.equal(r.phases[0].key, "tumble/air");
  assert.ok(r.airS > 0.35 && r.airS < 0.9, `飞了 ${r.airS.toFixed(2)} s`);
  assert.equal(r.impacts[0].surface, "ground");
  assert.ok(r.impacts[0].speed > 9 && r.impacts[0].speed < 12, `着地 ${r.impacts[0].speed.toFixed(2)} m/s`);
  assert.ok(r.impacts[0].damage > 10 && r.impacts[0].damage < 30, `摔地 ${r.impacts[0].damage.toFixed(1)} HP`);
  assert.ok(r.travel > 8, `连飞带滑 ${r.travel.toFixed(1)} m`);
  assert.ok(Math.abs(r.kb.lieS - BLAST_KNOCKBACK.fall.lieMaxS) < 1e-9, "狠的一下躺满");
  const wall = Simulate({ id: "Bomb250kg", distanceM: 8, wallX: 12 });
  assert.equal(wall.impacts[0].surface, "wall");
  assert.ok(wall.impacts[0].damage > 40, `飞着撞上 4 m 外的墙 ${wall.impacts[0].damage.toFixed(1)} HP`);
  assert.ok(wall.end.x <= 12 - 0.34 + 1e-9, "人停在墙前");
  const prone = Simulate({ id: "Bomb250kg", distanceM: 8, stance: "prone" });
  assert.deepEqual(prone.phases.map((p) => p.key), ["slide", "none"], "趴着只被推着滑，不翻、不躺、不爬");
  assert.ok(prone.travel > 0.1 && prone.travel < 0.6);
});

Group("状态机：再挨一下叠进去、被闸住只晃、确定性", () => {
  const kb = new PlayerKnockback();
  const push = BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: { x: 5, y: 0, z: 0 }, chargeKg: KG("Shell150") });
  const gated = kb.Push(push, { stance: "stand", eyeM: 1.62, allowKnockdown: false });
  assert.equal(gated.regime, "stagger"); assert.ok(!kb.Active, "过场 / 白刃里只晃不倒");
  assert.ok(gated.addVx <= BalanceLimitMps("stand") + 1e-9, "闸住时加的速度不超过站得住的上限");
  const kb2 = new PlayerKnockback(); kb2.Push(push, { stance: "stand", eyeM: 1.62 });
  const pos = { x: 5, y: 0, z: 0 };
  const mover = (dx, dy, dz) => { pos.x += dx; pos.z += dz; pos.y = Math.max(0, pos.y + dy); return { ...pos, grounded: pos.y <= 0, blocked: false }; };
  for (let i = 0; i < 70; i += 1) kb2.Step(1 / 60, mover);
  assert.ok(kb2.phase === "lie" || kb2.phase === "slide", `第二发来时已经倒在地上（${kb2.phase}）`);
  const lying = BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: pos, stance: "prone", chargeKg: KG("Bomb250kg") });
  const add = kb2.Push(lying, { stance: "prone", eyeM: 0.42 });
  assert.equal(add.regime, "add"); assert.equal(kb2.phase, "slide", "躺着又挨一下：被推着滑");
  const a = Simulate({ id: "Bomb250kg", distanceM: 9 }), b = Simulate({ id: "Bomb250kg", distanceM: 9 });
  assert.deepEqual(a.end, b.end, "同样的输入同样的结果"); assert.deepEqual(a.impacts, b.impacts);
  kb2.Reset(); assert.ok(!kb2.Active && !kb2.Staggering && kb2.ControlScale === 1, "Reset 回到站着");
});

Group("状态机：被这一下炸死的人照样被掀出去，躺下不再起来；推不动的交回普通死亡镜头", () => {
  const pos = { x: 8, y: 0, z: 0 };
  const mover = (dx, dy, dz) => { pos.x += dx; pos.z += dz; pos.y = Math.max(0, pos.y + dy); return { ...pos, grounded: pos.y <= 0, blocked: false }; };
  const kb = new PlayerKnockback();
  const push = BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: pos, chargeKg: KG("Bomb250kg") });
  assert.equal(kb.Push(push, { stance: "stand", eyeM: 1.62, dead: true }).regime, "thrown");
  assert.ok(!kb.LookAllowed, "死了不许转头");
  for (let i = 0; i < 60 * 12; i += 1) kb.Step(1 / 60, mover);
  assert.equal(kb.phase, "lie", "十二秒后还躺着"); assert.ok(kb.EyeHeight() < 0.3);
  const weak = new PlayerKnockback();
  const far = BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: { x: 25, y: 0, z: 0 }, chargeKg: KG("Bomb250kg") });
  assert.equal(weak.Push(far, { stance: "stand", eyeM: 1.62, dead: true }).regime, "none", "推不倒的那一下交回普通死亡镜头");
  assert.ok(!weak.Active && !weak.dead && !weak.Staggering);
  const alive = new PlayerKnockback(); alive.Push(BlastPush({ burst: { x: 0, y: 0, z: 0 }, feet: { x: 5, y: 0, z: 0 }, chargeKg: KG("Shell150") }), { stance: "stand", eyeM: 1.62 });
  for (let i = 0; i < 40; i += 1) alive.Step(1 / 60, mover);
  alive.Die();
  for (let i = 0; i < 60 * 8; i += 1) alive.Step(1 / 60, mover);
  assert.equal(alive.phase, "lie", "倒着的时候人没了：同样不再起来");
});

Group("枪脱手（Script_LooseGun）：飞出去、落地弹几下、侧躺停稳、离人一两米；斜坡、墙、确定性", () => {
  const L = BLAST_KNOCKBACK.looseGun;
  assert.deepEqual([...L.regimes], ["fall", "thrown"], "推倒 / 掀飞才脱手，推一把不脱");
  const Run = (serial, ground, sweep = null) => {
    const launch = LooseGunLaunch({ hand: { x: 0, y: ground(0, 0) + 1.25, z: 0 }, facing: { x: 0, z: -1 }, body: { x: 0, y: -0.4, z: 1.6 },
      push: { dirX: 0, dirZ: 1, horizontalMps: 2.2 }, serial });
    const rod = new LooseGunRod();
    rod.Launch(launch, { halfLengthM: 0.62, radiusM: 0.04 });
    let t = 0, minAbove = Infinity;
    const world = { Ground: ground, Sweep: sweep };
    while (!rod.asleep && t < 10) {
      rod.Step(1 / 60, world); t += 1 / 60;
      for (const p of [rod.a, rod.b]) minAbove = Math.min(minAbove, p.y - ground(p.x, p.z));
    }
    const c = rod.Center, pose = rod.Pose();
    return { t, c, pose, minAbove, rod, bounces: rod.stats.bounces, walls: rod.stats.walls };
  };
  const flat = () => 0;
  for (const serial of [1, 2, 3, 4, 5, 6]) {
    const r = Run(serial, flat);
    assert.ok(r.rod.asleep && r.t < L.sleep.maxFlightS, `第 ${serial} 次停住了（${r.t.toFixed(2)} s）`);
    assert.ok(r.bounces >= 1, "落地至少弹一下");
    Near(r.c.y, 0.04, 0.005, "停稳后中心离地 = 半厚");
    assert.ok(Math.abs(r.pose.up.y) < 0.05, `侧躺：枪的「上」水平（${r.pose.up.y.toFixed(3)}）`);
    assert.ok(Math.abs(r.pose.axis.y) < 0.05, "枪管放平");
    const d = Math.hypot(r.c.x, r.c.z);
    assert.ok(d > 0.3 && d < 4, `离出手点 ${d.toFixed(2)} m`);
    assert.ok(r.minAbove > -0.002, "两头从不钻进地里");
  }
  const slope = (x, z) => 0.3 * x + 0.08 * Math.sin(z * 3);
  const s = Run(2, slope);
  assert.ok(s.rod.asleep && s.minAbove > -0.002, "斜坡上也停得住、不钻地");
  // 一堵墙（z = 0.8 的竖面）：飞出去被挡回来，不穿过去
  const wallZ = 0.8;
  const sweep = (from, to) => (from.z < wallZ && to.z >= wallZ - 0.04 ? { dist: Math.max(0, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * Math.max(0, (wallZ - from.z) / Math.max(1e-6, to.z - from.z))), normal: { x: 0, y: 0, z: -1 } } : null);
  const w = Run(1, flat, sweep);
  assert.ok(w.walls >= 1 && w.c.z < wallZ, `撞墙弹回来（停在 z = ${w.c.z.toFixed(2)}）`);
  assert.deepEqual(Run(3, flat).c, Run(3, flat).c, "同样的序号同样的落点");
  // 捡起来：先低头伸手、reachS 时抓到、直起身后结束
  const P = L.pickup;
  assert.ok(GunReachPose(P.reachS * 0.7).reach > 0.3 && !GunReachPose(P.reachS * 0.7).grabbed, "伸手中");
  assert.ok(GunReachPose(P.reachS).grabbed && GunReachPose(P.reachS + 0.01).dip > 0.95, "抓到时弯到底");
  assert.ok(GunReachPose(P.reachS + P.holdS + P.returnS).done && GunReachPose(P.reachS + P.holdS + P.returnS).dip === 0, "直起身");
});

console.log(`PASS BlastKnockbackTest: ${groups} groups`);
