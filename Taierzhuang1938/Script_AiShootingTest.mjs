// Script_AiShootingTest.mjs — 敌军射击模型的纯 Node 回归（毫秒级，无 three、无浏览器）。
//
// 盯住的是 docs/Data_EnemyAi.md §9 给射击模型列的那几条，外加一条不许破的账：
//
//   1. 瞄准误差从初值单调收敛到底，且对 dt 怎么切不敏感；
//   2. 移动 / 被压制 / 目标在动会把误差重新撑开；
//   3. **满暴露 + 误差收敛到底时命中率精确等于 baseAccuracy**
//      —— docs/Data_PlayerDamage.md 那本 TTK 账靠这一条不变；
//   4. **fraction = 0 时永远不命中**（看不见的人打不中，只能压制射击）；
//   5. 假射线（解析矮墙）下：玩家蹲在墙后只露头 → fraction = 1/3 且瞄点是头；
//      墙再高一点就整个人被盖住 → fraction = 0；空地上 → fraction = 1；
//   6. 友军在射击走廊里就不开枪，在走廊外就照打；
//   7. 点射计划真的消费 `aiBurstMin/Max`（步枪恒 1、机枪落在区间里）；
//   8. 压制点在掩体沿之上、枪口优先级与兜底、暴露结果在缓存窗口内不重复射线。
//
// 判据一律**从表里读**（`Data_Tuning_AiShooting` / `Data_Weapons` / `Data_Tuning_Player`），
// 不抄数 —— 抄了的话改表就得改测试，而改表的人不会知道这里也藏着一份。

import assert from "node:assert/strict";
import { Mulberry32 } from "./Script_Noise.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { STANCE } from "./Data_Tuning_Player.mjs";
import { PLAYER_HITBOX } from "./Script_PlayerHitbox.mjs";
import { AIM, SHOOTING, BURST, SAMPLES, CLOSE_RANGE } from "./Data_Tuning_AiShooting.mjs";
import { ShootingModel, ExposureCurve, AimErrorCurve, CloseRangeWeight, SAMPLE_PART } from "./Script_AiShooting.mjs";

// --------------------------------------------------------------------------
// 假宿主：一堵解析矮墙 + 可数的射线计数器 + 可拨的时钟
// --------------------------------------------------------------------------

/**
 * 墙是 z = wall.z 上一块从 y=0 到 y=wall.top 的无限宽挡板。
 * 射线与它求交是一行解析式 —— 不需要物理引擎，也就不需要浏览器。
 */
function MakeHost(options = {}) {
  const state = {
    now: 0,
    rays: 0,
    wall: options.wall || null,
    rnd: options.rnd || Mulberry32(20260908),
  };
  const host = {
    state,
    Time: () => state.now,
    Rnd: options.fixedRnd ? () => options.fixedRnd : () => state.rnd(),
    Raycast(from, dir, maxDist) {
      state.rays += 1;
      const w = state.wall;
      if (!w) return null;
      if (Math.abs(dir.z) < 1e-9) return null;
      const t = (w.z - from.z) / dir.z;
      if (!(t > 0 && t < maxDist)) return null;
      const y = from.y + dir.y * t;
      if (y > w.top || y < 0) return null;          // 从墙沿上方过去 / 从墙底下过去
      return { t, normal: [0, 0, -1] };
    },
  };
  if (options.stanceEye) host.StanceEye = options.stanceEye;
  return host;
}

function MakeSoldier(over = {}) {
  return {
    id: 1,
    stance: 0,
    suppression: 0,
    weapon: WEAPONS.Type38,
    position: { x: 0, y: 0, z: 0 },
    rnd: Mulberry32(4242),
    ...over,
  };
}

const Near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --------------------------------------------------------------------------
// 1. 两条曲线的端点与单调性 —— 这是整套契约的地基
// --------------------------------------------------------------------------
{
  assert.equal(ExposureCurve(1), 1, "满暴露不打折");
  assert.equal(ExposureCurve(0), 0, "零暴露就是零");
  assert.equal(ExposureCurve(-3), 0, "负数按零");
  assert.equal(ExposureCurve(9), 1, "超过 1 按 1");
  assert.ok(ExposureCurve(1 / 3) < 1 / 3, `只露头比按面积成比例还难打 ${ExposureCurve(1 / 3)}`);
  let prev = -1;
  for (let i = 0; i <= 20; i += 1) {
    const v = ExposureCurve(i / 20);
    assert.ok(v > prev - 1e-12, "暴露曲线单调不降");
    prev = v;
  }

  const floor = AIM.floorRad.boltRifle;
  assert.equal(AimErrorCurve(floor, floor), 1, "误差到底时曲线精确为 1");
  assert.equal(AimErrorCurve(floor - 0.5, floor), 1, "低于底也算 1");
  assert.ok(Near(AimErrorCurve(floor + AIM.halfRad, floor), 0.5),
    "超出底一个 halfRad 时命中率对折");
  prev = 2;
  for (let i = 0; i <= 40; i += 1) {
    const v = AimErrorCurve(floor + i * 0.005, floor);
    assert.ok(v < prev + 1e-12, "误差曲线随误差单调下降");
    assert.ok(v > 0 && v <= 1, "误差曲线落在 (0,1]");
    prev = v;
  }
}
console.log("AiShootingTest OK — 暴露/误差两条曲线的端点、单调性与半衰点");

// --------------------------------------------------------------------------
// 2. 瞄准误差：收敛、幂等、dt 无关、扰动
// --------------------------------------------------------------------------
{
  const host = MakeHost();
  const model = new ShootingModel(host);
  const s = MakeSoldier();

  model.BeginAim(s, "player");
  const initial = model.AimError(s);
  const floor = model.AimFloor(s);
  assert.ok(Near(initial, AIM.initialErrorRad.boltRifle * AIM.stanceScale[0]),
    `初值按武器 kind 与姿态取 ${initial}`);
  assert.ok(Near(floor, AIM.floorRad.boltRifle * AIM.stanceScale[0]), `底噪同理 ${floor}`);
  assert.ok(initial > floor, "初值高于底噪");

  // 幂等：同一个目标反复 BeginAim 不重置（重置的话误差永远停在初值，AI 再也瞄不准）
  model.UpdateAim(s, 0.5, {});
  const mid = model.AimError(s);
  assert.ok(mid < initial, "瞄了半秒就该更准");
  model.BeginAim(s, "player");
  assert.equal(model.AimError(s), mid, "同一目标反复 BeginAim 不重置误差");
  model.BeginAim(s, "player", { force: true });
  assert.ok(Near(model.AimError(s), initial), "探头出来（force）时重新回到初值");
  // **先把误差瞄下去再换目标**，否则"从不重置"与"正确重置"读到的是同一个数
  model.UpdateAim(s, 0.5, {});
  assert.ok(model.AimError(s) < initial - 1e-6, "先让它离开初值");
  model.BeginAim(s, "other");
  assert.ok(Near(model.AimError(s), initial), "换目标重新回到初值");

  // 单调收敛到底，且真的到得了底（吸附）
  model.BeginAim(s, "player", { force: true });
  let prev = model.AimError(s);
  for (let i = 0; i < 300; i += 1) {
    const e = model.UpdateAim(s, 1 / 30, {});
    assert.ok(e <= prev + 1e-12, `不许反弹 ${e} > ${prev}`);
    prev = e;
  }
  assert.equal(prev, floor, "收敛到底是精确等于 floor（吸附），不是无限接近");

  // dt 怎么切都读同一个数：分帧 AI 的硬要求
  const a = MakeSoldier(), b = MakeSoldier();
  model.BeginAim(a, "t"); model.BeginAim(b, "t");
  for (let i = 0; i < 4; i += 1) model.UpdateAim(a, 0.25, {});
  for (let i = 0; i < 20; i += 1) model.UpdateAim(b, 0.05, {});
  assert.ok(Math.abs(model.AimError(a) - model.AimError(b)) < 1e-9,
    `同样一秒切四刀与切二十刀结果一致 ${model.AimError(a)} vs ${model.AimError(b)}`);

  // 形状是**指数**不是匀速：举枪的头半秒买走大半个准头，之后越来越慢。
  // 这条钉的是"抢在他瞄准之前缩回去"那个时间窗的存在（匀速的话玩家读不出该在哪一刻缩头）。
  {
    const c = MakeSoldier();
    model.BeginAim(c, "t");
    let last = model.AimError(c), lastStep = Infinity;
    for (let i = 0; i < 12; i += 1) {
      const e = model.UpdateAim(c, 0.1, {});
      const step = last - e;
      assert.ok(step > 0 && step < lastStep, `每一步的收敛量都比上一步小 ${step} < ${lastStep}`);
      last = e; lastStep = step;
    }
    const c2 = MakeSoldier();
    model.BeginAim(c2, "t");
    const half = Math.LN2 / AIM.convergePerS.boltRifle;
    for (let i = 0; i < 40; i += 1) model.UpdateAim(c2, half / 40, {});
    assert.ok(Math.abs((model.AimError(c2) - floor) - (initial - floor) * 0.5) < (initial - floor) * 0.03,
      "一个半衰期正好把「离底还差多少」砍掉一半");
  }

  // 与扰动合成的稳态有闭式：稳态 = 扰动/s ÷ 收敛率。调表的人靠这条直接算"边走边打有多散"。
  {
    const d = MakeSoldier();
    model.BeginAim(d, "t");
    for (let i = 0; i < 900; i += 1) model.UpdateAim(d, 1 / 30, { moving: true });
    const steady = model.AimError(d) - floor;
    const expect = AIM.disturbMovingPerS / AIM.convergePerS.boltRifle;
    assert.ok(Math.abs(steady - expect) < expect * 0.1,
      `边走边打的稳态误差 ≈ 扰动/收敛率（${steady} vs ${expect}）`);
  }

  // 扰动：从底噪出发，各来一下都该把误差撑开，且量级按表里的比例
  const Disturb = (opts) => {
    const d = MakeSoldier();
    model.BeginAim(d, "t");
    for (let i = 0; i < 300; i += 1) model.UpdateAim(d, 1 / 30, {});
    assert.equal(model.AimError(d), floor, "先收敛到底");
    model.UpdateAim(d, 0.5, opts);
    return model.AimError(d) - floor;
  };
  assert.equal(Disturb({}), 0, "什么都不做就待在底噪上");
  const moving = Disturb({ moving: true });
  const pinned = Disturb({ suppression: 1 });
  const chasing = Disturb({ targetMoving: true });
  assert.ok(moving > 0 && pinned > 0 && chasing > 0, "三种扰动都把误差撑开");
  assert.ok(moving > pinned && pinned > chasing,
    `边走边打最散、其次被压制、打提前量最轻 ${moving} > ${pinned} > ${chasing}`);
  assert.ok(Near(moving, AIM.disturbMovingPerS * 0.5, 1e-9), "移动扰动就是表里的每秒量 × dt");
  assert.ok(Disturb({ moving: 0.5 }) < moving, "移动量给 0..1 时按比例折算");

  // 扰动再离谱也封在 maxRad：再散下去曳光会飞到画面外，读起来像枪坏了
  {
    const wild = MakeSoldier();
    model.BeginAim(wild, "t");
    model.UpdateAim(wild, 10, { moving: true, suppression: 1, targetMoving: true });
    assert.equal(model.AimError(wild), AIM.maxRad, "误差封顶在 maxRad");
  }

  // 姿态：卧姿有依托，初值与底噪一起降
  const prone = MakeSoldier({ stance: 2 });
  model.BeginAim(prone, "t");
  assert.ok(model.AimError(prone) < initial, "卧姿初值更小");
  assert.ok(model.AimFloor(prone) < floor, "卧姿底噪更小");

  // 姿态在瞄准途中变了，底噪与收敛率跟着重算（趴下之后有依托，能更准）
  {
    const e = MakeSoldier();
    model.BeginAim(e, "t");
    const standFloor = model.AimFloor(e);
    e.stance = 2;
    model.UpdateAim(e, 0.1, {});
    assert.ok(model.AimFloor(e) < standFloor, "瞄准途中趴下，底噪跟着降");
    e.stance = 0;
    model.UpdateAim(e, 0.1, {});
    assert.ok(Near(model.AimFloor(e), standFloor), "站起来又回去");
  }

  // 被压制的人举枪时初值更大
  const shaken = MakeSoldier({ suppression: 1 });
  model.BeginAim(shaken, "t");
  assert.ok(Near(model.AimError(shaken), initial * (1 + AIM.suppressedInitialScale)),
    "压制值 1 的人初值按表里的倍率放大");

  // 暴露越久收敛越快
  const patient = MakeSoldier(), hasty = MakeSoldier();
  model.BeginAim(patient, "t"); model.BeginAim(hasty, "t");
  for (let i = 0; i < 10; i += 1) {
    model.UpdateAim(patient, 0.05, { exposedS: AIM.exposedConvergeCapS });
    model.UpdateAim(hasty, 0.05, { exposedS: 0 });
  }
  assert.ok(model.AimError(patient) < model.AimError(hasty),
    "目标一直露着的话，同样时间瞄得更准");

  // 没挂过状态的人：读到的是他这支枪的初值（不替调用方补 BeginAim）
  const fresh = MakeSoldier();
  assert.ok(Near(model.AimError(fresh), initial), "没瞄过的人按初值算");
  assert.equal(fresh.shooting, undefined, "AimError 不偷偷挂状态");
  model.BeginAim(fresh, "t");
  assert.ok(fresh.shooting, "BeginAim 才挂");
  model.Detach(fresh);
  assert.equal(fresh.shooting, undefined, "Detach 卸干净");

  // **漏调 BeginAim 不许变成白拿满命中率**：挂上来的误差播在初值，不是 0。
  // （误差 0 会让 AimErrorCurve 读成"已经瞄到底" —— 漏调用应该让 AI 变差，不该让它变强。）
  {
    const never = MakeSoldier();
    const r = model.Resolve(never, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.2, z: 30 },
      { baseAccuracy: 0.26, exposure: 1, distance: 30, rnd: Mulberry32(1) });
    assert.ok(Near(r.aimError, initial), "一次 BeginAim 都没调过的人按初值算");
    assert.ok(r.aimErrorCurve < 0.5, `而且那一档明显不如瞄到底 ${r.aimErrorCurve}`);
    assert.ok(Near(model.AimError(never), initial), "挂了但没瞄过与根本没挂过读到同一个数");
    assert.ok(Near(model.AimFloor(never), floor), "底噪同理");
  }
}
console.log("AiShootingTest OK — 误差收敛/幂等/force 重瞄/dt 无关/三种扰动/姿态与压制档/暴露加成");

// --------------------------------------------------------------------------
// 3. 结算：满暴露 + 零误差 == baseAccuracy；零暴露永不命中
// --------------------------------------------------------------------------
{
  const host = MakeHost();
  const model = new ShootingModel(host);
  const s = MakeSoldier();
  model.BeginAim(s, "player");
  for (let i = 0; i < 400; i += 1) model.UpdateAim(s, 1 / 30, {});
  assert.equal(model.AimError(s), model.AimFloor(s), "先把误差瞄到底");

  const from = { x: 0, y: 1.35, z: 0 };
  const aim = { x: 0, y: 1.2, z: 25 };
  const base = 0.26;
  const rnd = Mulberry32(861);
  let hits = 0;
  const n = 10000;
  for (let i = 0; i < n; i += 1) {
    const r = model.Resolve(s, from, aim, { baseAccuracy: base, exposure: 1, distance: 25, rnd });
    if (r.hit) hits += 1;
  }
  const rate = hits / n;
  assert.ok(Math.abs(rate - base) < 0.02, `满暴露零误差的命中率就是 baseAccuracy：${rate} vs ${base}`);

  const probe = model.Resolve(s, from, aim, { baseAccuracy: base, exposure: 1, distance: 25, rnd });
  assert.equal(probe.exposureCurve, 1, "满暴露那条曲线精确为 1");
  assert.equal(probe.aimErrorCurve, 1, "误差到底那条曲线精确为 1");
  assert.equal(probe.accuracy, base, "两条曲线都是 1 时命中率逐位等于 baseAccuracy");
  assert.ok(Near(Math.hypot(probe.dir.x, probe.dir.y, probe.dir.z), 1), "dir 归一");
  assert.ok(Near(Math.hypot(probe.missDir.x, probe.missDir.y, probe.missDir.z), 1), "missDir 归一");

  // fraction = 0：baseAccuracy 拉满也一发不中
  let blind = 0;
  for (let i = 0; i < 3000; i += 1) {
    if (model.Resolve(s, from, aim, { baseAccuracy: 1.5, exposure: 0, distance: 25, rnd }).hit) blind += 1;
    if (model.Resolve(s, from, aim, { baseAccuracy: 1.5, exposure: { fraction: 0 }, distance: 25, rnd }).hit) blind += 1;
  }
  assert.equal(blind, 0, "看不见的目标永远打不中（数字与视图两种传法都要挡住）");

  // 部分暴露、以及误差没收敛完，都只会让命中率**变低**，绝不会变高
  let partial = 0;
  for (let i = 0; i < 6000; i += 1) {
    if (model.Resolve(s, from, aim, { baseAccuracy: base, exposure: 1 / 3, distance: 25, rnd }).hit) partial += 1;
  }
  assert.ok(partial / 6000 < base, `只露头时命中率低于 baseAccuracy ${partial / 6000}`);
  assert.ok(Near(partial / 6000, base * ExposureCurve(1 / 3), 0.02), "而且就是曲线算出来的那个数");

  // 漏调 UpdateAim 的后果要看得见：误差停在初值，命中率按初值那档算
  const lazy = MakeSoldier();
  model.BeginAim(lazy, "player");
  const expect = base * AimErrorCurve(model.AimError(lazy), model.AimFloor(lazy));
  let lazyHits = 0;
  for (let i = 0; i < 8000; i += 1) {
    if (model.Resolve(lazy, from, aim, { baseAccuracy: base, exposure: 1, distance: 25, rnd }).hit) lazyHits += 1;
  }
  assert.ok(Near(lazyHits / 8000, expect, 0.02),
    `刚举枪那一发按初值算（${lazyHits / 8000} vs ${expect}）—— 集成方必须每次 Think 调 UpdateAim`);
  assert.ok(expect < base * 0.5, "刚举枪那一发明显不如瞄到底的");

  // 打偏的落点绝不与瞄点重合，也不会飞到另一条街上
  for (let i = 0; i < 500; i += 1) {
    const r = model.Resolve(s, from, aim, { baseAccuracy: 0, exposure: 1, distance: 60, rnd });
    const d = Math.hypot(r.missPoint.x - aim.x, r.missPoint.y - aim.y, r.missPoint.z - aim.z);
    assert.ok(d >= SHOOTING.missMinOffsetM - 1e-9, `落点不与瞄点重合 ${d}`);
    assert.ok(d <= SHOOTING.missMaxOffsetM + 1e-9, `落点不会飞出上限 ${d}`);
  }
  // 误差越大散得越开
  const Spread = (err) => {
    let sum = 0;
    for (let i = 0; i < 400; i += 1) {
      const r = model.Resolve(s, from, aim, { baseAccuracy: 0, exposure: 1, distance: 50, aimError: err, rnd });
      sum += Math.hypot(r.missPoint.x - aim.x, r.missPoint.y - aim.y, r.missPoint.z - aim.z);
    }
    return sum / 400;
  };
  assert.ok(Spread(0.08) > Spread(0.02) * 2, "误差翻两番，落点散布跟着翻");
}
console.log("AiShootingTest OK — 满暴露零误差 == baseAccuracy / 零暴露不命中 / 部分暴露折价 / 打偏散布");

// --------------------------------------------------------------------------
// 4. 采样点：玩家用 Script_PlayerHitbox 的几何，AI 按姿态取高度
// --------------------------------------------------------------------------
{
  const model = new ShootingModel(MakeHost());

  // AI 目标：三档高度逐条对表，卧姿只有两个点
  for (let stance = 0; stance < 3; stance += 1) {
    const spec = SAMPLES.soldier[stance];
    const pts = model.SoldierSamples({ x: 3, y: 7, z: -2 }, stance, []);
    const expect = [spec.head, spec.chest, spec.pelvis].filter((v) => Number.isFinite(v));
    assert.equal(pts.length, expect.length, `姿态 ${stance} 的采样点个数`);
    pts.forEach((p, i) => {
      assert.ok(Near(p.y, 7 + expect[i]), `姿态 ${stance} 第 ${i} 点的高度对表`);
      assert.ok(Near(p.x, 3) && Near(p.z, -2), "采样柱在脚底正上方");
    });
    assert.equal(pts[0].part, SAMPLE_PART.HEAD, "第一个点永远是头（缓存键用它）");
  }
  assert.equal(model.SoldierSamples({ x: 0, y: 0, z: 0 }, 2, []).length, 2, "卧姿只有头与胸两个点");
  const scaled = model.SoldierSamples({ x: 0, y: 0, z: 0 }, 0, [], 0.5);
  assert.ok(Near(scaled[0].y, SAMPLES.soldier[0].head * 0.5), "身高缩放乘在高度上");

  // 玩家：头点 = PLAYER_HITBOX 的头球心；胸 / 盆在躯干胶囊上；膝盖在腿上
  for (const stance of ["stand", "crouch", "prone"]) {
    const player = { position: { x: 0, y: 0, z: 20 }, yaw: 0, stance };
    const pts = model.PlayerSamples(player, []);
    assert.deepEqual(pts.map((p) => p.part),
      [SAMPLE_PART.HEAD, SAMPLE_PART.CHEST, SAMPLE_PART.PELVIS, SAMPLE_PART.KNEE, SAMPLE_PART.KNEE],
      `${stance} 的采样顺序固定`);
    const head = PLAYER_HITBOX[stance].find((b) => b.part === "head");
    assert.ok(Near(pts[0].y, head.y), `${stance} 头点就是头球心 ${pts[0].y} vs ${head.y}`);
    const torso = PLAYER_HITBOX[stance].find((b) => b.part === "torso");
    const lo = Math.min(torso.y0, torso.y1), hi = Math.max(torso.y0, torso.y1);
    for (const p of [pts[1], pts[2]]) {
      assert.ok(p.y >= lo - 1e-9 && p.y <= hi + 1e-9, `${stance} 胸/盆落在躯干胶囊的两端之间`);
    }
    // 「胸端」是离头更近的那一端：站/蹲在上方，卧姿在**前方**
    assert.ok(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y, pts[1].z - pts[0].z)
      < Math.hypot(pts[2].x - pts[0].x, pts[2].y - pts[0].y, pts[2].z - pts[0].z),
      `${stance} 胸比盆离头更近`);
  }
  assert.ok(Near(model.PlayerSamples({ position: { x: 0, y: 0, z: 0 }, yaw: 0, stance: "stand" }, [])[0].y,
    STANCE.stand.eye - 0.07), "站姿头心 = 眼高 − 0.07（与 Script_PlayerHitbox 同源）");

  // 数字姿态与非法姿态都要接得住
  assert.equal(model.PlayerSamples({ position: { x: 0, y: 0, z: 0 }, yaw: 0, stance: 1 }, []).length, 5,
    "stance 传数字（0/1/2）也认");
  assert.equal(model.PlayerSamples(null, []).length, 0, "没有玩家就没有采样点");

  // 探身时头点取真眼位（与 HasLineOfSight / TryFire 同一个点）
  const leaning = {
    position: { x: 0, y: 0, z: 20 }, yaw: 0, stance: "stand",
    LeanOffsetM: 0.42, EyePosition: { x: 0.42, y: 1.62, z: 20 },
  };
  const lean = model.PlayerSamples(leaning, []);
  assert.ok(Near(lean[0].x, 0.42) && Near(lean[0].y, 1.62), "探身时头点 = EyePosition");
}
console.log("AiShootingTest OK — 采样点：AI 三档高度对表 / 玩家几何取自 Script_PlayerHitbox / 探身取眼位");

// --------------------------------------------------------------------------
// 5. 暴露：解析矮墙下"只露头"、"整个人被盖住"、"空地上"
// --------------------------------------------------------------------------
{
  // 玩家蹲在 z=20，面朝 -Z（正对射手）；射手枪口在 z=0、高 1.35 m。
  // 墙在两人中间 z=18。蹲姿头心 1.05−0.07 = 0.98，胸采样 0.785、盆 0.519：
  // 0.90 m 的墙正好把胸与盆挡住、把头放过去。
  const player = { position: { x: 0, y: 0, z: 20 }, yaw: 0, stance: "crouch" };
  const from = { x: 0, y: 1.35, z: 0 };

  const OnlyHead = () => {
    const host = MakeHost({ wall: { z: 18, top: 0.90 } });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const samples = model.PlayerSamples(player, []);
    const ex = model.Exposure(s, from, samples, { targetId: "player" });
    return { host, model, samples, ex };
  };
  {
    const { host, samples, ex } = OnlyHead();
    assert.ok(Near(ex.fraction, 1 / 3), `蹲在矮墙后只露头 → fraction = 1/3（读到 ${ex.fraction}）`);
    assert.deepEqual(ex.visibleParts, [SAMPLE_PART.HEAD], "看得见的只有头");
    assert.ok(ex.aimPoint, "有可见点就有瞄点");
    assert.ok(Near(ex.aimPoint.x, samples[0].x) && Near(ex.aimPoint.y, samples[0].y)
      && Near(ex.aimPoint.z, samples[0].z), "瞄点就是那颗头");
    assert.equal(host.state.rays, SHOOTING.exposureSamples, "一次暴露判定只射预算内的线");
  }

  // 墙抬到 1.2 m：连头都盖住 —— 这就是「不隔墙打人」那条验收的另一半
  {
    const host = MakeHost({ wall: { z: 18, top: 1.2 } });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const ex = model.Exposure(s, from, model.PlayerSamples(player, []), { targetId: "player" });
    assert.equal(ex.fraction, 0, "整个人被盖住 → fraction = 0");
    assert.equal(ex.aimPoint, null, "全被挡时没有瞄点");
    assert.deepEqual(ex.visibleParts, [], "一个部位都看不见");
    // 而 fraction=0 的人打不中：两条链接上就是「玩家躲在矮墙后受伤 = 0」
    const r = model.Resolve(s, from, { x: 0, y: 1, z: 20 },
      { baseAccuracy: 1, exposure: ex, distance: 20, rnd: Mulberry32(1) });
    assert.equal(r.hit, false, "隔着墙打不中");
  }

  // 站着躲在 1.4 m 的墙后，同样只露头
  {
    const host = MakeHost({ wall: { z: 18, top: 1.40 } });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const standing = { position: { x: 0, y: 0, z: 20 }, yaw: 0, stance: "stand" };
    const ex = model.Exposure(s, from, model.PlayerSamples(standing, []), { targetId: "player" });
    assert.ok(Near(ex.fraction, 1 / 3), `站姿只露头 ${ex.fraction}`);
    assert.deepEqual(ex.visibleParts, [SAMPLE_PART.HEAD], "看得见的只有头");
  }

  // 空地上：三条线全通，瞄点落在躯干上（不是那颗头）
  {
    const host = MakeHost({ wall: null });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const samples = model.PlayerSamples(player, []);
    const ex = model.Exposure(s, from, samples, { targetId: "player" });
    assert.equal(ex.fraction, 1, "空地上全暴露");
    assert.deepEqual(ex.visibleParts, [SAMPLE_PART.HEAD, SAMPLE_PART.CHEST, SAMPLE_PART.PELVIS],
      "三个采样点都看得见");
    assert.ok(Near(ex.aimPoint.y, samples[1].y), "瞄点取最靠近躯干中心的可见点 = 胸口");
  }

  // 贴着目标那一下**不算掩体**：射线打在采样点前 blockedMarginM 之内的东西
  // （目标自己的身体、他手边的门框）不能读成"被挡住"，否则近处的人永远打不着。
  // 墙抬到 3 m、挪到离目标 0.2 m 处：几何上确实挡在中间，但余量说这不算。
  {
    const host = MakeHost({ wall: { z: 20 - SHOOTING.blockedMarginM * 0.67, top: 3.0 } });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const ex = model.Exposure(s, from, model.PlayerSamples(player, []), { targetId: "player" });
    assert.equal(ex.fraction, 1, "贴着目标的障碍在余量之内，不算掩体");
    // 同一堵墙退到余量之外就真的挡住了 —— 两条一起才钉住余量的方向
    const far = MakeHost({ wall: { z: 20 - SHOOTING.blockedMarginM * 4, top: 3.0 } });
    const m2 = new ShootingModel(far);
    const s2 = MakeSoldier();
    m2.BeginAim(s2, "player");
    assert.equal(m2.Exposure(s2, from, m2.PlayerSamples(player, []), { targetId: "player" }).fraction, 0,
      "退到余量之外的同一堵墙就真的挡住了");
  }

  // 瞄点取的是**最靠近躯干中心**的可见点，不是最靠上的那个。
  // 用一根横木（窗户上的过梁）只挡住胸那一条线：头与骨盆都看得见时，该瞄骨盆不是头
  // —— 躯干中心是胸与盆的中点，骨盆离它更近。
  {
    const beam = { z: 18, low: 0.78, high: 0.90 };     // 只拦这一条高度带
    const host = MakeHost({ wall: null });
    let rays = 0;
    host.Raycast = (fromPt, dir, maxDist) => {
      rays += 1;
      if (Math.abs(dir.z) < 1e-9) return null;
      const t = (beam.z - fromPt.z) / dir.z;
      if (!(t > 0 && t < maxDist)) return null;
      const y = fromPt.y + dir.y * t;
      return (y >= beam.low && y <= beam.high) ? { t, normal: [0, 0, -1] } : null;
    };
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const samples = model.PlayerSamples(player, []);
    const ex = model.Exposure(s, from, samples, { targetId: "player" });
    assert.ok(Near(ex.fraction, 2 / 3), `横木只挡住胸 → fraction = 2/3（读到 ${ex.fraction}）`);
    assert.deepEqual(ex.visibleParts, [SAMPLE_PART.HEAD, SAMPLE_PART.PELVIS], "看得见头与骨盆");
    assert.ok(Near(ex.aimPoint.y, samples[2].y),
      "瞄的是骨盆（离躯干中心更近），不是露在最上面的头");
    assert.equal(rays, 3, "三条线都射了");
  }

  // BlocksSight 也算挡住（战车 / 关卡自己的遮挡通道），而且它比射线便宜、先问它
  {
    const host = MakeHost({ wall: null });
    host.BlocksSight = () => true;
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const ex = model.Exposure(s, from, model.PlayerSamples(player, []), { targetId: "player" });
    assert.equal(ex.fraction, 0, "BlocksSight 说挡住就是挡住");
    assert.equal(host.state.rays, 0, "被 BlocksSight 挡下的线不再射");
  }

  // 射线预算：给五个采样点也只射 exposureSamples 条
  {
    const host = MakeHost({ wall: null });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const samples = model.PlayerSamples(player, []);
    assert.equal(samples.length, 5, "采样点生成器一共给五个（含双膝）");
    model.Exposure(s, from, samples, { targetId: "player" });
    assert.equal(host.state.rays, SHOOTING.exposureSamples, "只射预算内的三条");
  }

  // 每次重算都是**重算**：可见部位不越积越多，上一次的瞄点不留到这一次
  {
    const host = MakeHost({ wall: null });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    host.state.now = 100;
    const samples = model.PlayerSamples(player, []);
    let ex = model.Exposure(s, from, samples, { targetId: "player" });
    assert.equal(ex.visibleParts.length, SHOOTING.exposureSamples, "第一次三个部位");
    host.state.now += SHOOTING.exposureCacheS * 2;
    ex = model.Exposure(s, from, samples, { targetId: "player" });
    assert.equal(ex.visibleParts.length, SHOOTING.exposureSamples, "再问一次还是三个，不是六个");
    host.state.wall = { z: 18, top: 1.2 };                 // 墙立起来了（掩体被推上来 / 战车挡住）
    host.state.now += SHOOTING.exposureCacheS * 2;
    ex = model.Exposure(s, from, samples, { targetId: "player" });
    assert.equal(ex.fraction, 0, "全被挡");
    assert.equal(ex.aimPoint, null, "上一次的瞄点不许留到这一次（留着就会隔墙开枪）");
    assert.deepEqual(ex.visibleParts, [], "可见部位清空");
  }

  // fraction 的分母是**真正射出去的线数**，不是射线预算：
  // 卧姿目标只有两个采样点，全看得见就该是 1，不是 2/3。
  {
    const host = MakeHost({ wall: null });
    const model = new ShootingModel(host);
    const s = MakeSoldier();
    model.BeginAim(s, "prone");
    const prone = model.SoldierSamples({ x: 0, y: 0, z: 30 }, 2, []);
    assert.ok(prone.length < SHOOTING.exposureSamples, "前提：卧姿采样点比射线预算少");
    const ex = model.Exposure(s, from, prone, { targetId: "prone" });
    assert.equal(ex.fraction, 1, "两个点都看得见就是满暴露");
    assert.equal(host.state.rays, prone.length, "也只射这么多条");
  }

  // 没有 Raycast 注入时退化成全可见（纯逻辑环境不至于全场瞎掉）
  {
    const model = new ShootingModel({ Time: () => 0 });
    const s = MakeSoldier();
    model.BeginAim(s, "player");
    const ex = model.Exposure(s, from, model.PlayerSamples(player, []), { targetId: "player" });
    assert.equal(ex.fraction, 1, "缺 Raycast 时不当作被挡");
  }
}
console.log("AiShootingTest OK — 暴露：只露头 1/3 且瞄点是头 / 全挡 0 且打不中 / 空地 1 且瞄胸 / 射线预算");

// --------------------------------------------------------------------------
// 6. 暴露缓存：窗口内不重复射线，几何变了立刻作废
// --------------------------------------------------------------------------
{
  const host = MakeHost({ wall: null });
  const model = new ShootingModel(host);
  const s = MakeSoldier();
  const player = { position: { x: 0, y: 0, z: 20 }, yaw: 0, stance: "stand" };
  const from = { x: 0, y: 1.35, z: 0 };
  model.BeginAim(s, "player");

  host.state.now = 10;
  const samples = model.PlayerSamples(player, []);
  model.Exposure(s, from, samples, { targetId: "player" });
  const first = host.state.rays;
  assert.equal(first, SHOOTING.exposureSamples, "第一次真射线");

  model.Exposure(s, from, samples, { targetId: "player" });
  assert.equal(host.state.rays, first, "缓存窗口内不重复射线");

  host.state.now = 10 + SHOOTING.exposureCacheS * 0.5;
  model.Exposure(s, from, samples, { targetId: "player" });
  assert.equal(host.state.rays, first, "窗口没过完仍然吃缓存");

  host.state.now = 10 + SHOOTING.exposureCacheS + 1e-6;
  model.Exposure(s, from, samples, { targetId: "player" });
  assert.equal(host.state.rays, first * 2, "窗口过了重算");

  // 换目标：立刻作废
  model.Exposure(s, from, samples, { targetId: "someone-else" });
  assert.equal(host.state.rays, first * 3, "换了目标不吃上一个目标的缓存");

  // 射手挪窝：时间没到但几何变了
  const rays = host.state.rays;
  model.Exposure(s, from, samples, { targetId: "someone-else" });
  assert.equal(host.state.rays, rays, "原地不动仍吃缓存");
  const moved = { x: from.x + SHOOTING.exposureCacheMoveM * 2, y: from.y, z: from.z };
  model.Exposure(s, moved, samples, { targetId: "someone-else" });
  assert.equal(host.state.rays, rays + first, "射手挪出阈值就重算");

  // 目标挪窝：同理（缓存键是头点）
  player.position.z = 26;
  const moved2 = model.PlayerSamples(player, []);
  const before = host.state.rays;
  model.Exposure(s, moved, moved2, { targetId: "someone-else" });
  assert.equal(host.state.rays, before + first, "目标挪出阈值也重算");
}
console.log("AiShootingTest OK — 暴露缓存：窗口内零射线 / 过期、换目标、任一端移动都作废");

// --------------------------------------------------------------------------
// 7. 射击走廊：不打自己人
// --------------------------------------------------------------------------
{
  const model = new ShootingModel(MakeHost());
  const from = { x: 0, y: 1.35, z: 0 };
  const to = { x: 0, y: 1.20, z: 30 };

  assert.equal(model.LineOfFireClear(from, to, []), true, "没有友军就照打");
  assert.equal(model.LineOfFireClear(from, to, null), true, "allies 缺省也照打");
  assert.equal(model.LineOfFireClear(from, to, [{ x: 0.3, y: 1.0, z: 15 }]), false,
    "友军站在射击线上 → 不开枪");
  assert.equal(model.LineOfFireClear(from, to, [{ x: 2.0, y: 1.0, z: 15 }]), true,
    "友军离得够远 → 照打");
  assert.equal(model.LineOfFireClear(from, to, [{ x: 0.2, y: 1.0, z: -6 }]), true,
    "在射手身后的人不挡枪");
  assert.equal(model.LineOfFireClear(from, to, [{ x: 0.2, y: 1.0, z: 40 }]), true,
    "在目标之后的人不挡枪");
  assert.equal(model.LineOfFireClear(from, to, [{ x: 0.1, y: 1.3, z: 0.2 }]), true,
    `枪口正前 ${SHOOTING.friendlyMinAlongM} m 内不算（那是自己的身体）`);
  assert.equal(model.LineOfFireClear(from, to,
    [{ x: 5, y: 1, z: 10 }, { x: 0.2, y: 1.2, z: 20 }]), false, "任何一个挡住就不打");
  // 逐个体型：给了 radius 就按 radius 算
  assert.equal(model.LineOfFireClear(from, to, [{ x: 1.2, y: 1.2, z: 15 }]), true,
    "默认走廊半径下 1.2 m 外算安全");
  assert.equal(model.LineOfFireClear(from, to, [{ x: 1.2, y: 1.2, z: 15, radius: 2.0 }]), false,
    "自带 radius 的（比如趴着展开的机枪组）按自己的算");
}
console.log("AiShootingTest OK — 射击走廊：走廊内不开枪 / 身后与目标之后不算 / 枪口自身不算 / 自带半径");

// --------------------------------------------------------------------------
// 8. 点射计划：真的消费 aiBurstMin/Max
// --------------------------------------------------------------------------
{
  const model = new ShootingModel(MakeHost());
  const rnd = Mulberry32(777);

  // 拉栓步枪恒 1 发 —— 表里写着 aiBurstMax = 2，但两发之间必须拉栓
  assert.ok(WEAPONS.Type38.aiBurstMax > 1, "前提：三八式表里的 aiBurstMax 确实大于 1");
  for (let i = 0; i < 200; i += 1) {
    const p = model.BurstPlan(WEAPONS.Type38, rnd);
    assert.equal(p.shots, 1, "拉栓步枪恒 1 发");
    assert.equal(p.intervalS, WEAPONS.Type38.fireIntervalS, "间隔就是武器表的射击周期");
    assert.equal(p.pauseS, BURST.byKind.boltRifle.pauseMinS, "单发没有额外停顿");
  }

  const Range = (weapon, spec) => {
    const seen = new Set();
    for (let i = 0; i < 600; i += 1) {
      const p = model.BurstPlan(weapon, rnd);
      assert.ok(p.shots >= spec.min && p.shots <= spec.max,
        `${weapon.id} 一梭子 ${p.shots} 落在 [${spec.min},${spec.max}]`);
      assert.ok(p.pauseS >= spec.pauseMinS - 1e-12 && p.pauseS <= spec.pauseMaxS + 1e-12,
        `${weapon.id} 停顿 ${p.pauseS} 落在表里的区间`);
      assert.equal(p.intervalS, weapon.fireIntervalS, `${weapon.id} 间隔取武器表`);
      seen.add(p.shots);
    }
    return seen;
  };
  const t11 = Range(WEAPONS.Type11,
    { ...BURST.byKind.lmg, min: WEAPONS.Type11.aiBurstMin, max: WEAPONS.Type11.aiBurstMax });
  assert.ok(t11.has(WEAPONS.Type11.aiBurstMin) && t11.has(WEAPONS.Type11.aiBurstMax),
    "上下界都抽得到（不是恒定值）");
  assert.equal(t11.size, WEAPONS.Type11.aiBurstMax - WEAPONS.Type11.aiBurstMin + 1,
    "区间里每个值都抽得到");
  const t92 = Range(WEAPONS.Type92Hmg,
    { ...BURST.byKind.hmg, min: WEAPONS.Type92Hmg.aiBurstMin, max: WEAPONS.Type92Hmg.aiBurstMax });
  assert.ok(t92.size > 4, "重机枪的一梭子长度真的在变");

  // 武器表**真的被读了**：拿一支上下界都与 kind 兜底不同的枪来验。
  // （表里 Type11 的 4—9 与 BURST.byKind.lmg 恰好同值，光用它证不出这一条。）
  {
    const odd = { kind: "lmg", fireIntervalS: 0.1, aiBurstMin: 2, aiBurstMax: 3 };
    assert.ok(odd.aiBurstMin < BURST.byKind.lmg.min && odd.aiBurstMax < BURST.byKind.lmg.max,
      "前提：这支枪的上下界与 kind 兜底不同");
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) {
      const p = model.BurstPlan(odd, rnd);
      assert.ok(p.shots >= odd.aiBurstMin && p.shots <= odd.aiBurstMax,
        `武器表的 aiBurstMin/Max 说了算，不是 kind 兜底 ${p.shots}`);
      seen.add(p.shots);
    }
    assert.deepEqual([...seen].sort(), [2, 3], "上下界都抽得到");
  }

  // 中方几支枪的武器表里没有 aiBurstMin/Max —— 按 kind 兜底，不是崩掉也不是恒 1
  assert.equal(WEAPONS.Zb26.aiBurstMin, undefined, "前提：捷克式表里没写 aiBurstMin");
  Range(WEAPONS.Zb26, BURST.byKind.lmg);
  const pistol = model.BurstPlan(WEAPONS.ServicePistol, rnd);
  assert.ok(pistol.shots >= BURST.byKind.pistol.min && pistol.shots <= BURST.byKind.pistol.max,
    "手枪按 kind 兜底");

  // 没有随机源时取中值（确定性，不是 Math.random）
  const bare = new ShootingModel({});
  const a = bare.BurstPlan(WEAPONS.Type11);
  const shots = a.shots, pause = a.pauseS;
  const b = bare.BurstPlan(WEAPONS.Type11);
  assert.equal(b.shots, shots, "缺随机源时同样的输入出同样的结果");
  assert.equal(b.pauseS, pause, "停顿同理");

  // 武器表里填了离谱的数也要夹住
  const silly = { kind: "lmg", fireIntervalS: 0.12, aiBurstMin: -5, aiBurstMax: 999 };
  for (let i = 0; i < 200; i += 1) {
    const p = model.BurstPlan(silly, rnd);
    assert.ok(p.shots >= 1 && p.shots <= BURST.maxShots, `离谱的表也夹在 [1,${BURST.maxShots}] ${p.shots}`);
  }
  // 认不出 kind 的（刺刀、掷弹筒…）落到 default
  const unknown = model.BurstPlan({ kind: "melee" }, rnd);
  assert.equal(unknown.shots, BURST.byKind.default.min, "认不出的 kind 落到 default");
}
console.log("AiShootingTest OK — 点射：步枪恒 1 / 机枪落在 aiBurstMin..Max / 无表按 kind 兜底 / 离谱值夹住");

// --------------------------------------------------------------------------
// 9. 压制点：打在掩体沿之上
// --------------------------------------------------------------------------
{
  const model = new ShootingModel(MakeHost());
  const lkp = { x: 5, y: 2, z: 12.5 };
  const cover = { x: 5, z: 12, height: 1.1, nx: 0, nz: -1 };
  const lip = lkp.y + cover.height;

  for (let i = 0; i < 400; i += 1) {
    const p = model.SuppressPoint(lkp, cover);
    assert.ok(p.y > lip, `压制弹永远打在掩体沿之上 ${p.y} > ${lip}`);
    assert.ok(p.y <= lip + SHOOTING.suppressAboveCoverM + SHOOTING.suppressVerticalScatterM + 1e-9,
      "也不会打到天上去");
    const lateral = Math.hypot(p.x - cover.x, p.z - cover.z);
    assert.ok(lateral <= SHOOTING.suppressOutsideM + SHOOTING.suppressScatterM + 1e-9,
      `横向散布在表里的半幅之内 ${lateral}`);
  }
  // 散布真的在散（不是十发钉在同一个像素上）
  const xs = new Set();
  for (let i = 0; i < 60; i += 1) xs.add(model.SuppressPoint(lkp, cover).x.toFixed(4));
  assert.ok(xs.size > 40, "压制弹扫出一条线，不是钉在一个点上");

  // 三种字段名都认（WallPlan 的 h/fx/fz、World.Cover 的 height/faceX/faceZ、假件的 nx/nz）
  const fixed = new ShootingModel(MakeHost({ fixedRnd: 0.5 }));
  const a = { ...fixed.SuppressPoint(lkp, { x: 5, z: 12, height: 1.1, nx: 0, nz: -1 }) };
  const b = { ...fixed.SuppressPoint(lkp, { x: 5, z: 12, h: 1.1, fx: 0, fz: -1 }) };
  const c = { ...fixed.SuppressPoint(lkp, { x: 5, z: 12, height: 1.1, faceX: 0, faceZ: -1 }) };
  assert.deepEqual(b, a, "WallPlan 的 {h,fx,fz} 与 {height,nx,nz} 读出同一个点");
  assert.deepEqual(c, a, "World.Cover 的 {height,faceX,faceZ} 同理");
  assert.ok(Near(a.y, lkp.y + 1.1 + SHOOTING.suppressAboveCoverM), "中值下就是掩体沿 + 0.3");
  assert.ok(Near(a.z, 12 - SHOOTING.suppressOutsideM), "沿法线往外偏一点");

  // 掩体自带 y 的时候用它自己的地面高，不用 LKP 的
  const raised = fixed.SuppressPoint(lkp, { x: 5, z: 12, height: 1.1, y: 9, nx: 0, nz: -1 });
  assert.ok(Near(raised.y, 9 + 1.1 + SHOOTING.suppressAboveCoverM), "掩体带 y 就用掩体的地面高");

  // 没有掩体：打 LKP 的胸高
  const open = fixed.SuppressPoint(lkp, null);
  assert.ok(Near(open.y, lkp.y + SHOOTING.suppressLkpChestM), "无掩体时打最后目击位置的胸高");
  assert.ok(Near(open.x, lkp.x) && Near(open.z, lkp.z), "中值下不偏");
  const noHeight = fixed.SuppressPoint(lkp, { x: 5, z: 12 });
  assert.ok(Near(noHeight.y, lkp.y + SHOOTING.suppressLkpChestM), "掩体没有高度字段时按无掩体处理");
  for (let i = 0; i < 200; i += 1) {
    const p = model.SuppressPoint(lkp, null);
    assert.ok(Math.abs(p.x - lkp.x) <= SHOOTING.suppressScatterM + 1e-9, "无掩体时的散布也在半幅内");
  }
}
console.log("AiShootingTest OK — 压制点：永远高于掩体沿 / 三种字段名归一 / 无掩体打 LKP 胸高");

// --------------------------------------------------------------------------
// 10. 枪口与抬枪角
// --------------------------------------------------------------------------
{
  const model = new ShootingModel(MakeHost());
  const s = MakeSoldier({ position: { x: 1, y: 2, z: 3 } });

  // 兜底：姿态眼高 − muzzleDropM
  for (let stance = 0; stance < 3; stance += 1) {
    s.stance = stance;
    const p = model.MuzzleOrigin(s);
    assert.ok(Near(p.y, 2 + SHOOTING.stanceEyeM[stance] - SHOOTING.muzzleDropM),
      `姿态 ${stance} 的兜底枪口高 ${p.y}`);
    assert.ok(Near(p.x, 1) && Near(p.z, 3), "兜底枪口在人的正上方");
  }

  // 优先级：muzzleWorld > actor.weaponMuzzleWorld > 兜底
  s.stance = 0;
  s.actor = { weaponMuzzleWorld: { x: 4, y: 5, z: 6 } };
  let p = model.MuzzleOrigin(s);
  assert.ok(Near(p.x, 4) && Near(p.y, 5) && Near(p.z, 6), "没有 muzzleWorld 时用 actor 的");
  s.muzzleWorld = { x: 9, y: 8, z: 7 };
  p = model.MuzzleOrigin(s);
  assert.ok(Near(p.x, 9) && Near(p.y, 8) && Near(p.z, 7), "muzzleWorld 优先");
  s.muzzleWorld = { x: 9, y: NaN, z: 7 };
  p = model.MuzzleOrigin(s);
  assert.ok(Near(p.x, 4) && Near(p.y, 5), "muzzleWorld 里有 NaN 就退回下一级（不许把 NaN 传给弹道）");
  s.muzzleWorld = null; s.actor = null;
  p = model.MuzzleOrigin(s);
  assert.ok(Near(p.y, 2 + SHOOTING.stanceEyeM[0] - SHOOTING.muzzleDropM), "两级都没有就兜底");

  // 宿主注入的 StanceEye（带身高缩放）优先于表里的兜底
  const tall = new ShootingModel(MakeHost({ stanceEye: (stance) => [1.8, 1.2, 0.6][stance] }));
  const kid = MakeSoldier({ position: { x: 0, y: 0, z: 0 }, stance: 1 });
  assert.ok(Near(tall.MuzzleOrigin(kid).y, 1.2 - SHOOTING.muzzleDropM), "有 host.StanceEye 就用它");

  // 抬枪角：**向上为正**（Script_Actor 的符号约定）
  const o = { x: 0, y: 0, z: 0 };
  assert.ok(model.LookPitch(o, { x: 0, y: 5, z: 10 }) > 0, "目标在高处 → 正（抬枪）");
  assert.ok(model.LookPitch({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 10 }) < 0, "目标在低处 → 负（压枪）");
  assert.ok(Near(model.LookPitch(o, { x: 0, y: 5, z: 10 }), Math.atan2(5, 10)), "就是 atan2(高差, 水平距)");
  assert.equal(model.LookPitch(o, { x: 0, y: 0, z: 40 }), 0, "平射为零");
  assert.equal(model.LookPitch(o, { x: 0, y: 100, z: 0 }), SHOOTING.lookPitchMaxRad,
    "正上方夹到上界（与 Script_Actor 的 Clamp 同一组数）");
  assert.equal(model.LookPitch(o, { x: 0, y: -100, z: 0 }), SHOOTING.lookPitchMinRad, "正下方夹到下界");
  assert.equal(model.LookPitch(o, null), 0, "缺参数时不产出 NaN");
}
console.log("AiShootingTest OK — 枪口三级优先与姿态兜底 / 抬枪角向上为正且按 Actor 的界夹住");

// --------------------------------------------------------------------------
// 11. 确定性与复用契约
// --------------------------------------------------------------------------
{
  const Run = () => {
    const model = new ShootingModel(MakeHost({ rnd: Mulberry32(5) }));
    const s = MakeSoldier({ rnd: Mulberry32(5) });
    model.BeginAim(s, "player");
    const out = [];
    for (let i = 0; i < 50; i += 1) {
      model.UpdateAim(s, 1 / 30, { moving: i % 3 === 0, suppression: (i % 7) / 7 });
      const r = model.Resolve(s, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.2, z: 30 },
        { baseAccuracy: 0.26, exposure: 0.7, distance: 30 });
      out.push(`${r.hit ? 1 : 0}:${r.missPoint.x.toFixed(6)}:${r.accuracy.toFixed(6)}`);
    }
    return out.join("|");
  };
  assert.equal(Run(), Run(), "同种子重跑逐位一致（一行 Math.random 都没有）");

  // 返回的是复用对象：这条写进契约是为了让调用方知道要 copy
  const model = new ShootingModel(MakeHost());
  const s = MakeSoldier();
  model.BeginAim(s, "player");
  const r1 = model.Resolve(s, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.2, z: 30 }, { baseAccuracy: 0.2 });
  const r2 = model.Resolve(s, { x: 0, y: 1.4, z: 0 }, { x: 1, y: 1.2, z: 30 }, { baseAccuracy: 0.2 });
  assert.equal(r1, r2, "Resolve 返回同一个复用对象");
  assert.equal(model.SuppressPoint({ x: 0, y: 0, z: 0 }), model.SuppressPoint({ x: 1, y: 0, z: 0 }),
    "SuppressPoint 同理");
  assert.equal(model.MuzzleOrigin(s), model.MuzzleOrigin(s), "MuzzleOrigin 同理");

  // 状态只挂在 soldier.shooting 这一个字段上
  const bare = MakeSoldier();
  const before = Object.keys(bare).sort();
  model.BeginAim(bare, "x");
  model.UpdateAim(bare, 0.1, {});
  model.Exposure(bare, { x: 0, y: 1, z: 0 }, model.SoldierSamples({ x: 0, y: 0, z: 20 }, 0, []));
  model.Resolve(bare, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 20 }, { baseAccuracy: 0.3 });
  assert.deepEqual(Object.keys(bare).sort(), [...before, "shooting"].sort(),
    "除了 soldier.shooting 之外不往士兵身上写任何字段");
}
console.log("AiShootingTest OK — 确定性重跑一致 / 返回对象复用 / 只写 soldier.shooting");

console.log("AiShootingTest OK — 全部通过");

{
  assert.equal(CloseRangeWeight(2), 1);
  assert.equal(CloseRangeWeight(25), 0);
  assert.equal(CloseRangeWeight(Infinity), 0);
  let previous=1;
  for(let distance=0;distance<=60;distance+=.25){
    const w=CloseRangeWeight(distance);
    assert.ok(w<=previous && w>=0);previous=w;
  }
  const err=AIM.initialErrorRad.boltRifle, floor=AIM.floorRad.boltRifle;
  const near=AimErrorCurve(err,floor,Math.atan(CLOSE_RANGE.targetRadiusM/2));
  const far=AimErrorCurve(err,floor,Math.atan(CLOSE_RANGE.targetRadiusM/25));
  assert.ok(near>.8 && near>far, "near body tolerates acquisition error");
  assert.equal(far,AimErrorCurve(err,floor), "25 m acquisition balance unchanged");
}
console.log("AiShootingTest OK — close range blend and angular tolerance");
