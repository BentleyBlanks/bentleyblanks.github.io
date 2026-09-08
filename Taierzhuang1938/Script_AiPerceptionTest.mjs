// Script_AiPerceptionTest.mjs — 敌军感知模型的纯 Node 回归（docs/Data_EnemyAi.md §9 第一条）。
//
// 量的是七件事：视锥内外的累积差异、觉察级别的迟滞不抖、枪声写 LKP（只对敌方、只在
// 可闻半径内）、LKP 随时间衰减并在 memoryS 后遗忘、目标锁迟滞（1.2 s 闪断 / 5 s 遗忘 /
// 更近一半才换人）、开火的目标瞬间拉满、Attach 幂等与 Sense 的对象复用（零分配）。
//
// 断言里的**期望值一律从 `Data_Tuning_AiPerception` 读**，不抄数（docs/Data_TextAndTuning.md §4）。
// 只有两处例外是方案里写死的**验收口径**而不是表里的数：
//   · 40 m 上站着开火的目标 < 0.3 s 拉满；
//   · 80 m 上静止蹲着的目标 2–4 s 才拉满。
// 这两条就是要在有人重新调表时红给他看 —— 它们是设计意图，不是实现细节。
//
// 跑法：`node Taierzhuang1938/Script_AiPerceptionTest.mjs`，退出码即成败。
import assert from "node:assert/strict";
import v8 from "node:v8";
import vm from "node:vm";
import { Mulberry32 } from "./Script_Noise.mjs";
import { PERCEPTION } from "./Data_Tuning_AiPerception.mjs";
import { ALERT, ALERT_ORDER, PLAYER_TRACK_ID, PerceptionModel } from "./Script_AiPerception.mjs";

const { fov, awareness: AW, hearing: HE, memory: ME, lock: LK, exposure: EX } = PERCEPTION;

// 假宿主：时间可推进、SightRange 走 [120,80,45] × 倍率（照明弹那条读点的语义）、
// StanceEye 走 [1.5,1.0,0.5]、随机是确定的 Mulberry32。
function MakeHost(seed = 20260908) {
  const rnd = Mulberry32(seed);
  const host = {
    t: 0,
    sightScale: 1,
    Time: () => host.t,
    Rnd: () => rnd(),
    SightRange: (stance) => [120, 80, 45][Math.min(Math.max(stance | 0, 0), 2)] * host.sightScale,
    StanceEye: (stance) => [1.5, 1.0, 0.5][Math.min(Math.max(stance | 0, 0), 2)],
    Advance: (dt) => { host.t += dt; },
  };
  return host;
}

const MakeSoldier = (id, side, x, z, yaw = 0, stance = 0) =>
  ({ id, side, alive: true, position: { x, y: 0, z }, yaw, stance });

const MakeCand = (id, x, z, over = {}) => ({
  ref: over.ref === undefined ? { alive: true, id } : over.ref,
  isPlayer: !!over.isPlayer,
  id,
  position: { x, y: 0, z },
  stance: over.stance || 0,
  moving: !!over.moving,
  firingRecently: !!over.firingRecently,
  visible: over.visible !== false,
});

/** 从视锥前方 θ 度、距离 d 的一点（yaw=0 面朝 −Z，cosA = −dz/d）。 */
const AtAngle = (deg, d) => ({ x: Math.sin(deg * Math.PI / 180) * d, z: -Math.cos(deg * Math.PI / 180) * d });

/** 推一拍 Think：先推时间再 Sense，和 Script_Ai 的顺序一致。 */
function Step(model, host, soldier, cands, dt = 0.1) {
  host.Advance(dt);
  return model.Sense(soldier, cands, dt);
}

let checks = 0;
const ok = (line) => { checks += 1; console.log(`ok ${checks} — ${line}`); };

// ---------------------------------------------------------------- 表本身
{
  assert.ok(Object.isFrozen(PERCEPTION) && Object.isFrozen(fov) && Object.isFrozen(AW)
    && Object.isFrozen(HE) && Object.isFrozen(ME) && Object.isFrozen(LK) && Object.isFrozen(EX),
    "调参表分组冻结");
  for (const key of ["suspicious", "alert", "engaged"]) {
    assert.ok(AW.release[key] < AW.thresholds[key], `${key} 的回落阈值低于升级阈值（迟滞带存在）`);
  }
  assert.ok(AW.thresholds.suspicious < AW.thresholds.alert && AW.thresholds.alert < AW.thresholds.engaged,
    "三级阈值单调");
  assert.ok(HE.awarenessCap < AW.thresholds.engaged,
    "听觉封顶低于 ENGAGED 阈值 —— 光靠听永远不许进入交战");
  assert.ok(ME.memoryS > LK.forgetS, "LKP 记忆比目标锁活得久：丢目标不等于忘掉敌情");
  assert.deepEqual(ALERT_ORDER.map((v) => typeof v), ["string", "string", "string", "string"], "警戒级别是字符串契约");
  ok("调参表：分组冻结、迟滞带存在、阈值单调、听觉封顶在 ENGAGED 之下、记忆比锁长");
}

// ---------------------------------------------------------------- 视锥
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const ahead = MakeCand(11, 0, -40, { moving: true });                 // 正前方 0°
  const side = MakeCand(12, 40, 0, {});                                  // 正右 90°
  const behind = MakeCand(13, 0, 40, {});                                // 正后 180°
  const cands = [ahead, side, behind];

  for (let i = 0; i < 3; i += 1) Step(model, host, s, cands);
  const t0 = model.Track(s, 11);
  assert.ok(t0 && t0.awareness > 0, "正前方的目标在累积觉察");
  assert.equal(model.Track(s, 12), null, "unaware 视锥（±60°）外的 90° 目标一条记忆都不建");
  assert.equal(model.Track(s, 13), null, "背后 180° 的目标看不见");
  assert.ok(model.Alert(s) !== ALERT.ENGAGED, "才三拍还没到交战");

  // 打起来之后视锥变宽：ENGAGED 半角 115° > 90°，侧面那个人这时才进得来。
  for (let i = 0; i < 40 && model.Alert(s) !== ALERT.ENGAGED; i += 1) Step(model, host, s, cands);
  assert.equal(model.Alert(s), ALERT.ENGAGED, "正前方目标看久了进入 ENGAGED");
  for (let i = 0; i < 5; i += 1) Step(model, host, s, cands);
  const tSide = model.Track(s, 12);
  assert.ok(tSide && tSide.awareness > 0, `ENGAGED（半角 ${fov.halfAngleDeg.engaged}°）能看到 90° 的人`);
  assert.equal(model.Track(s, 13), null, "背后 180° 仍然看不见 —— 警戒再高也不是 360° 全知");
  ok("视锥：正前方累积 / 90° 与背后不累积 / 警戒升级后视锥变宽但仍不全向");
}

// ---------------------------------------------------------------- 姿态收窄视锥
{
  const p = AtAngle(50, 40);   // 前方 50°：站姿（60°）看得见，卧姿（60×0.70=42°）看不见
  for (const [stance, shouldSee] of [[0, true], [2, false]]) {
    const host = MakeHost();
    const model = new PerceptionModel(host);
    const s = MakeSoldier(1, "ija", 0, 0, 0, stance);
    const cands = [MakeCand(21, p.x, p.z, { moving: true })];
    for (let i = 0; i < 5; i += 1) Step(model, host, s, cands);
    const t = model.Track(s, 21);
    assert.equal(!!(t && t.awareness > 0), shouldSee,
      `自己姿态 ${stance}（视锥缩放 ${fov.stanceScale[stance]}）时 50° 的目标 ${shouldSee ? "看得见" : "看不见"}`);
  }
  ok("姿态：趴着的视锥更窄（stanceScale），同一个 50° 目标站着看得见、趴着看不见");
}

// ---------------------------------------------------------------- 觉察标定
{
  // (1) 40 m 上站着**开火**的目标：一次 Think 就拉满（枪口焰）。
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const r = Step(model, host, s, [MakeCand(31, 0, -40, { firingRecently: true })]);
  assert.equal(r.awareness, AW.firingFillsTo, "开火的目标瞬间拉满");
  assert.ok(host.t < 0.3, `用时 ${host.t}s < 0.3s（方案 §4.1 的标定点）`);
  assert.equal(r.alert, ALERT.ENGAGED, "拉满同一拍就进入 ENGAGED（级别允许跨级跳）");
  assert.equal(r.visible, true);
  assert.equal(r.exposure, EX.byStance[0], "站着的目标暴露先验取 byStance[0]");
}
{
  // (2) 同样 40 m、站着、在动但**不开枪**：仍然很快，但不是一瞬间。
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const cands = [MakeCand(32, 0, -40, { moving: true })];
  let ticks = 0;
  while (ticks < 200 && (model.Track(s, 32)?.awareness || 0) < 1) { Step(model, host, s, cands); ticks += 1; }
  assert.ok(host.t > 0.1 && host.t <= 0.4, `40 m 走动的目标 ${host.t.toFixed(2)}s 拉满（0.1–0.4s）`);
}
{
  // (3) 80 m 上**静止蹲着**的目标：2–4 s。这是「潜行接近」这件事成立的地方。
  //     79.9 而不是 80：SightRange(1) 正好是 80，等号那一侧不算看得见。
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const cands = [MakeCand(33, 0, -79.9, { stance: 1, moving: false })];
  let ticks = 0;
  while (ticks < 400 && (model.Track(s, 33)?.awareness || 0) < 1) { Step(model, host, s, cands); ticks += 1; }
  assert.ok(host.t >= 2 && host.t <= 4, `80 m 静止蹲姿的目标 ${host.t.toFixed(2)}s 才拉满（2–4s）`);
  // 同一个人如果在动，快得多 —— 「不动的人难被发现」这条机制真的成立。
  const host2 = MakeHost();
  const model2 = new PerceptionModel(host2);
  const s2 = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const moving = [MakeCand(34, 0, -79.9, { stance: 1, moving: true })];
  let n2 = 0;
  while (n2 < 400 && (model2.Track(s2, 34)?.awareness || 0) < 1) { Step(model2, host2, s2, moving); n2 += 1; }
  assert.ok(host2.t < host.t * 0.75, `同距离动着的目标快得多（${host2.t.toFixed(2)}s < ${host.t.toFixed(2)}s）`);
  ok("觉察标定：40 m 开火 <0.3s / 40 m 走动 0.1–0.4s / 80 m 静止蹲姿 2–4s / 动比不动快");
}

// ---------------------------------------------------------------- 觉察级别迟滞
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const cand = MakeCand(41, 0, -40, { moving: false });
  const cands = [cand];

  // 先证明「闪断一拍不许降级」：看到进 SUSPICIOUS 之后断一拍通视，级别不动。
  while (model.Alert(s) === ALERT.UNAWARE) Step(model, host, s, cands);
  const held = model.Alert(s);
  cand.visible = false;
  Step(model, host, s, cands);
  assert.equal(model.Alert(s), held, `通视闪断一拍不降级（decayDelayS=${AW.decayDelayS}s 的宽限）`);

  // 再拿一段**真的**在阈值两侧来回的可见性（3 拍看得见 / 37 拍看不见）跑 60 s：
  // 级别当然会变，但两次变化之间必须至少隔 minDwellS，而且远不到「每拍都切」。
  const changes = [];
  let prev = model.Alert(s);
  for (let i = 0; i < 600; i += 1) {
    cand.visible = (i % 40) < 3;
    Step(model, host, s, cands);
    const now = model.Alert(s);
    if (now !== prev) { changes.push(host.t); prev = now; }
  }
  assert.ok(changes.length >= 4, `阈值附近来回确实会切级（${changes.length} 次），断言不是空的`);
  assert.ok(changes.length < 600 / 10, `600 拍里只切了 ${changes.length} 次，不是每拍都切`);
  for (let i = 1; i < changes.length; i += 1) {
    assert.ok(changes[i] - changes[i - 1] >= AW.minDwellS - 1e-9,
      `第 ${i} 次切级距上一次 ${(changes[i] - changes[i - 1]).toFixed(2)}s ≥ minDwellS(${AW.minDwellS}s)`);
  }
  ok(`觉察级别迟滞：闪断一拍不降级；60 s 抖动里只切 ${changes.length} 次且间隔全部 ≥ minDwellS`);
}

// ---------------------------------------------------------------- 听觉
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  host.Advance(10);
  const near = MakeSoldier(101, "ija", 40, 0);      // 敌方，150 m 内
  const far = MakeSoldier(102, "ija", 200, 0);      // 敌方，但在可闻半径外
  const mate = MakeSoldier(103, "nra", 30, 0);      // 同阵营 —— 自己人开枪不是敌情
  const dead = MakeSoldier(104, "ija", 10, 0); dead.alive = false;
  const shot = { kind: "gunshot", x: 0, y: 1.4, z: 0, side: "nra", isPlayer: true, time: host.t };

  const written = model.Hear(shot, [near, far, mate, dead]);
  assert.equal(written, 1, "四个听者里只有一个写进了记忆");
  assert.equal(far.perception, undefined, "可闻半径外的人连记忆都不挂（预筛在分配之前）");
  assert.equal(mate.perception, undefined, "同阵营的枪声不写敌情");
  assert.equal(dead.perception, undefined, "死人不听");

  const t = model.Track(near, PLAYER_TRACK_ID);
  assert.ok(t, "玩家的枪声在敌人记忆里按 PLAYER_TRACK_ID 立了一条");
  assert.equal(t.source, "sound");
  assert.equal(t.seenCount, 0, "只是听见，没看见");
  const ratio = 40 / HE.loudnessM.gunshot;
  const expectConf = HE.confidenceEdge + (HE.confidenceNear - HE.confidenceEdge) * Math.pow(1 - ratio, HE.curveExp);
  assert.ok(Math.abs(t.confidence - expectConf) < 1e-9, "置信度按响度与距离折算");
  const errMax = HE.localizationErrorM.near + (HE.localizationErrorM.edge - HE.localizationErrorM.near) * ratio;
  assert.ok(Math.hypot(t.lkp.x - shot.x, t.lkp.z - shot.z) <= errMax + 1e-9,
    `听觉写入的 LKP 带定位误差但不超过 ${errMax.toFixed(2)} m`);
  assert.ok(t.awareness <= HE.awarenessCap + 1e-9, "听觉觉察封顶");
  assert.notEqual(model.Alert(near), ALERT.ENGAGED, "光听见枪声进不了 ENGAGED");
  assert.ok(ALERT_ORDER.indexOf(model.Alert(near)) >= ALERT_ORDER.indexOf(ALERT.SUSPICIOUS),
    "40 m 上的一声枪响至少让人警觉起来");

  // 可闻半径按 kind 取表，刺激自带 loudnessM 时以刺激为准。
  const stepNear = MakeSoldier(105, "ija", 5, 0);
  const stepFar = MakeSoldier(106, "ija", 12, 0);
  assert.equal(model.Hear({ kind: "footstep", x: 0, z: 0, side: "nra", isPlayer: true, time: host.t },
    [stepNear, stepFar]), 1, `脚步只传 ${HE.loudnessM.footstep} m`);
  assert.equal(stepFar.perception, undefined, "12 m 外听不见脚步");
  const loudOverride = MakeSoldier(107, "ija", 12, 0);
  assert.equal(model.Hear({ kind: "footstep", loudnessM: 30, x: 0, z: 0, side: "nra", isPlayer: true, time: host.t },
    [loudOverride]), 1, "刺激自带的 loudnessM 覆盖表里的兜底值");
  ok("听觉：只对敌方 / 只在可闻半径内 / LKP 带定位误差 / 置信度按响度折算 / 封顶在 ENGAGED 之下");
}

// ---------------------------------------------------------------- LKP 衰减与遗忘
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  host.Advance(5);
  const s = MakeSoldier(1, "ija", 40, 0);
  model.Hear({ kind: "gunshot", x: 0, z: 0, side: "nra", isPlayer: true, time: host.t }, [s]);
  const conf0 = model.Track(s, PLAYER_TRACK_ID).confidence;
  const none = [];
  let last = conf0;
  for (let i = 0; i < 20; i += 1) {
    Step(model, host, s, none, 0.1);
    const t = model.Track(s, PLAYER_TRACK_ID);
    assert.ok(t.confidence < last, "置信度逐拍衰减");
    last = t.confidence;
  }
  const expected = conf0 - ME.confidenceDecayPerS * 2.0;
  assert.ok(Math.abs(last - expected) < 1e-9, "衰减按真实经过时间线性，不按调用次数");
  // 听来的一条模糊情报（confidence0 < 1）比看见的一条烂得早。
  const dieAt = conf0 + (5 + 2.0) - ME.minConfidence / ME.confidenceDecayPerS; // 仅用于日志
  while (host.t < 5 + (conf0 - ME.minConfidence) / ME.confidenceDecayPerS - 0.3) Step(model, host, s, none, 0.1);
  assert.ok(model.Track(s, PLAYER_TRACK_ID), "掉到 minConfidence 之前还记得");
  for (let i = 0; i < 10; i += 1) Step(model, host, s, none, 0.1);
  assert.equal(model.Track(s, PLAYER_TRACK_ID), null, "置信度掉到 minConfidence 以下就忘了");
  assert.ok(dieAt > 0);

  // 亲眼看见的一条（confidence0 = 1）由 memoryS 收走。
  const host2 = MakeHost();
  const model2 = new PerceptionModel(host2);
  const s2 = MakeSoldier(2, "ija", 0, 0, 0, 0);
  const seen = [MakeCand(51, 0, -30, { moving: true })];
  for (let i = 0; i < 10; i += 1) Step(model2, host2, s2, seen);
  const seenAt = host2.t;
  assert.equal(model2.Track(s2, 51).confidence, ME.seenConfidence, "看得见时置信度每拍刷满");
  while (host2.t < seenAt + ME.memoryS - 0.5) Step(model2, host2, s2, []);
  const late = model2.Track(s2, 51);
  assert.ok(late && late.confidence < ME.seenConfidence, `memoryS 前还记得，但置信度已经掉到 ${late.confidence.toFixed(2)}`);
  assert.ok(late.awareness === 0, "觉察早就衰减到零了（decayPerS 比 memoryS 快得多）");
  while (host2.t < seenAt + ME.memoryS + 0.5) Step(model2, host2, s2, []);
  assert.equal(model2.Track(s2, 51), null, `memoryS=${ME.memoryS}s 之后彻底遗忘`);
  ok("LKP：置信度按真实时间线性衰减 / 听来的先烂 / 看见的活到 memoryS / 之后遗忘");
}

// ---------------------------------------------------------------- 目标锁迟滞
{
  // (a) 通视闪断 keepBlindS 之内不换人。
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const a = MakeCand(61, 0, -30, { moving: true });
  const b = MakeCand(62, 0, -20, { moving: true, visible: false });
  const cands = [a, b];
  for (let i = 0; i < 3; i += 1) Step(model, host, s, cands);
  assert.equal(model.Sense(s, cands, 0).trackId, 61, "先锁上正前方 30 m 的 A");

  a.visible = false; b.visible = true;
  let r = null;
  const flickerTicks = Math.floor((LK.keepBlindS - 0.15) / 0.1);
  for (let i = 0; i < flickerTicks; i += 1) r = Step(model, host, s, cands);
  assert.equal(r.trackId, 61, `闪断 ${(flickerTicks * 0.1).toFixed(1)}s（< keepBlindS ${LK.keepBlindS}s）内不换人`);
  assert.equal(r.visible, false, "保持目标但明确报告「现在看不见」——TryFire 靠这条闸门不隔墙射击");
  assert.equal(r.target, a, "目标仍然是 A 那个候选");
  for (let i = 0; i < 5; i += 1) r = Step(model, host, s, cands);
  assert.equal(r.trackId, 62, "超过 keepBlindS 才把枪口甩给 B");

  // (b) 完全看不见 forgetS 之后丢锁。
  b.visible = false;
  const forgotAt = host.t + LK.forgetS;
  while (host.t < forgotAt - 0.3) r = Step(model, host, s, cands);
  assert.equal(r.trackId, 62, `丢失 ${LK.forgetS}s 之内还锁着（LKP 与压制射击靠它）`);
  while (host.t < forgotAt + 0.3) r = Step(model, host, s, cands);
  assert.equal(r.trackId, null, `看不见超过 forgetS=${LK.forgetS}s 才丢锁`);
  assert.ok(r.lkp && r.lkp.confidence > 0, "丢了锁但 LKP 还在 —— 这就是「过去查看 / 压制射击」的输入");
}
{
  // (c) 锁定期过后，新目标要近到一半才允许换人。
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const a = MakeCand(71, 0, -30, { moving: true });
  const b = MakeCand(72, 0, -20, { moving: true, visible: false });
  const cands = [a, b];
  for (let i = 0; i < 3; i += 1) Step(model, host, s, cands);
  assert.equal(model.Sense(s, cands, 0).trackId, 71, "先锁 A（30 m）");

  b.visible = true;                                   // B 在 20 m，比 A 近，但没近到一半
  let r = null;
  const settle = host.t + LK.lockS + LK.lockJitterS + 0.6;
  while (host.t < settle) r = Step(model, host, s, cands);
  assert.equal(r.trackId, 71,
    `锁定期过了，但 20 m 没到 30 m 的 ${LK.switchDistanceRatio} 倍，不换人`);

  b.position.z = -30 * LK.switchDistanceRatio + 1;    // 挪到 14 m：真的近到一半以内了
  r = Step(model, host, s, cands);
  assert.equal(r.trackId, 72, "近到一半以内才换人");
  assert.equal(r.changed, true, "换人这一拍报 changed —— Bark(\"spot\") 与 BeginAim 靠它");
  ok("目标锁迟滞：闪断 1.2 s 内不换 / 5 s 才遗忘 / 锁定期过后近到一半才换人");
}

// ---------------------------------------------------------------- Attach / Forget
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const m1 = model.Attach(s);
  const m2 = model.Attach(s);
  assert.equal(m1, m2, "Attach 幂等：同一个记忆对象");
  assert.equal(model.stats.attaches, 1, "只真的建了一次");
  const cands = [MakeCand(81, 0, -20, { moving: true })];
  for (let i = 0; i < 5; i += 1) Step(model, host, s, cands);
  assert.equal(model.Attach(s), m1, "Sense 之后再 Attach 还是同一份，记忆不被清空");
  assert.ok(model.Track(s, 81), "记忆还在");

  assert.equal(model.Forget(s, 81), true, "Forget 摘掉一条");
  assert.equal(model.Track(s, 81), null);
  assert.equal(model.Sense(s, [], 0.1).trackId, null, "被 Forget 的目标同时丢锁");
  assert.equal(model.Forget(s, 999), false, "Forget 不存在的目标返回 false");

  // 记忆容量：超过 maxTracks 时淘汰最不可靠的一条，当前锁定的那条永不被淘汰。
  const host2 = MakeHost();
  const model2 = new PerceptionModel(host2);
  const s2 = MakeSoldier(2, "ija", 0, 0, 0, 0);
  const many = [];
  for (let i = 0; i < ME.maxTracks + 3; i += 1) many.push(MakeCand(200 + i, 0, -10 - i, { moving: true }));
  for (let i = 0; i < 5; i += 1) Step(model2, host2, s2, many);
  assert.equal(s2.perception.list.length, ME.maxTracks, `记忆不超过 maxTracks=${ME.maxTracks}`);
  assert.equal(s2.perception.list.length, s2.perception.tracks.size, "数组视图与 Map 始终同步");
  assert.ok(model2.Track(s2, s2.perception.lockId), "锁定的那条没被淘汰");

  model.Detach(s);
  assert.equal(s.perception, null, "Detach 摘干净");
  ok("Attach 幂等 / Forget 同时丢锁 / 记忆容量封顶且不淘汰当前目标 / Detach");
}

// ---------------------------------------------------------------- 零分配
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const cands = [
    MakeCand(91, 0, -25, { moving: true }),
    MakeCand(92, 6, -30, { moving: false }),
    MakeCand(93, 0, 45, {}),                    // 背后：永远看不见，不许每拍建一条记忆再删
  ];
  const r1 = Step(model, host, s, cands);
  const mem = s.perception;
  const track = model.Track(s, 91);
  const listLen = mem.list.length;
  for (let i = 0; i < 200; i += 1) {
    const r = Step(model, host, s, cands);
    assert.equal(r, r1, "Sense 每次返回同一个结果对象");
    assert.equal(r.lkp, mem.lkpOut, "LKP 也是复用的出参");
    assert.equal(model.Track(s, 91), track, "Track 对象复用，不是每拍重建");
    assert.equal(mem.list.length, listLen, "记忆条数稳定（背后那个候选没有制造增删）");
  }
  assert.equal(mem.tracks.size, listLen, "Map 与数组视图一致");
  assert.equal(model.Track(s, 93), null, "看不见的候选不建记忆");

  // 真的量一次堆：v8 的 gc 钩子拿得到就量，拿不到就只留结构复用那几条断言。
  let gc = null;
  try {
    v8.setFlagsFromString("--expose-gc");
    gc = vm.runInNewContext("gc");
    v8.setFlagsFromString("--no-expose-gc");
  } catch { gc = null; }
  if (typeof gc === "function") {
    const n = 20000;
    for (let i = 0; i < 2000; i += 1) Step(model, host, s, cands);   // 先热身，让 JIT 稳定
    gc(); gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < n; i += 1) Step(model, host, s, cands);
    const after = process.memoryUsage().heapUsed;
    const perCall = (after - before) / n;
    assert.ok(perCall < 400, `每次 Sense 的堆增量 ${perCall.toFixed(1)} B < 400 B（热路径不分配）`);
    ok(`Sense 零分配：结果/LKP/Track 全部复用，实测堆增量 ${perCall.toFixed(1)} B/次`);
  } else {
    ok("Sense 零分配：结果/LKP/Track 全部复用（本机拿不到 gc 钩子，跳过堆增量测量）");
  }
}

// ---------------------------------------------------------------- 照明弹倍率不被重复乘
{
  const host = MakeHost();
  const model = new PerceptionModel(host);
  const s = MakeSoldier(1, "ija", 0, 0, 0, 0);
  const cands = [MakeCand(95, 0, -150, { moving: true })];   // 150 m：平时超出站姿 120 m
  for (let i = 0; i < 5; i += 1) Step(model, host, s, cands);
  assert.equal(model.Track(s, 95), null, "平时 150 m 外看不见");
  host.sightScale = 2.4;                                     // 照明弹点燃
  for (let i = 0; i < 5; i += 1) Step(model, host, s, cands);
  assert.ok(model.Track(s, 95), "照明弹底下 150 m 也看得见 —— 倍率只从 host.SightRange 进来");
  ok("照明弹：发现距离倍率只经 host.SightRange 生效，感知层没有第二处乘法");
}

console.log(`AiPerceptionTest OK — ${checks} 项：视锥/姿态/觉察标定/级别迟滞/听觉/LKP 记忆/目标锁/Attach/零分配/照明弹`);
