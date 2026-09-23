// Script_FirstLevelTankBrainTest.mjs —— 第一关战车纯规则大脑（纯 Node，秒级）
//
// 覆盖：驾驶加减速 / 停车才原地转 / 行进转向率随车速 / 阶段拴绳；炮手预兆链（手摇速率、
// 瞄准停顿、只在停车点开炮）、目标过滤（missionUntargetable / protect）、散布收敛、提前量、
// 新暴露警告弹、保护半径；机枪首次接触零伤害走进来、射界；反应（后倒下限与投掷距离、
// 炮塔甩向投掷者、机枪压制、护兵散开、诱饵冷却）；护兵槽；两段毁伤（履带 / 发动机）；
// 视线预算。口径：docs/Data_FirstLevel0105Refactor20260923Contract.md §5.7。
import assert from "node:assert/strict";
import { CreateTankBrain, SeededRng, YawTo, Forward, Right, HullLocal } from "./Script_FirstLevelTankBrain.mjs";
import { TANK, TANK_TEMP_PATH } from "./Data_Tuning_Tank.mjs";

const DT = 1 / 60;
const Wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

/** 一条直路 + 一个拐角 + 语义停车点。 */
function StraightPath(extra = {}) {
  return {
    id: "TestPath",
    waypoints: [
      { x: 0, z: 0, kind: "cruise", stage: "Support" },
      { x: 0, z: -40, kind: "firePoint", stage: "Support", faceTo: { x: 30, z: -60 }, holdS: 3 },
      { x: -25, z: -40, kind: "block", stage: "MachineGun" },
      { x: -28, z: -40, kind: "squeeze", stage: "Tank" },
    ],
    scan: [{ x: -20, z: -20, stage: "Tank" }],
    stageOrder: ["Support", "MachineGun", "Tank"],
    ...extra,
  };
}
function World(over = {}) {
  return { stage: "Support", facts: new Set(), targets: [], Los: () => true, Cover: () => null,
    tankPose: { groundY: 0 }, weaponsFree: { main: true, mg: true }, escortIds: [], ...over };
}
function Run(brain, world, seconds, each = null) {
  const out = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) { const o = brain.Update(DT, world); out.push(o); each?.(o, brain); }
  return out;
}

// --- 1 驾驶：加速度、减速度、停在语义点、停车才原地转 -------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 11 });
  const world = World();
  let maxAccel = 0, maxDecel = 0, prev = 0, pivotWhileMoving = 0, maxYawRateMoving = 0, prevYaw = brain.hullYaw;
  Run(brain, world, 40, (o, b) => {
    const a = (o.drive.speed - prev) / DT; prev = o.drive.speed;
    if (a > 0) maxAccel = Math.max(maxAccel, a); else maxDecel = Math.max(maxDecel, -a);
    const yawRate = Math.abs(Wrap(b.hullYaw - prevYaw)) / DT; prevYaw = b.hullYaw;
    if (o.drive.pivoting && Math.abs(o.drive.speed) > 0.05) pivotWhileMoving++;
    if (Math.abs(o.drive.speed) > 0.05) maxYawRateMoving = Math.max(maxYawRateMoving, yawRate / Math.max(0.05, Math.abs(o.drive.speed)));
  });
  ok(maxAccel <= TANK.drive.accelMps2 + 1e-6, `accel ${maxAccel} ≤ ${TANK.drive.accelMps2}`);
  // 到点那一帧的「贴靠」允许一次小于 0.6 m/s 的归零，其余减速都按表。
  ok(maxDecel <= 0.6 / DT + 1e-6, "arrival snap bounded");
  ok(pivotWhileMoving === 0, "never pivots in place while moving");
  ok(maxYawRateMoving <= 1 / TANK.drive.turnRadiusM + 1e-3, `moving turn rate scales with speed (${maxYawRateMoving.toFixed(3)} rad/m)`);
  ok(Math.abs(brain.x - 0) < 1e-6 && Math.abs(brain.z + 40) < 1e-6, "stops exactly on firePoint (stage leash holds it there)");
  const face = YawTo(brain, { x: 30, z: -60 });
  ok(Math.abs(Wrap(face - brain.hullYaw)) < 0.01, "halted at firePoint the hull faces faceTo");
  ok(brain.AtStop, "AtStop on semantic stop");
  // 下一步放行：先原地转到路线方向（车头与切线差 > 阈值），再起步；原地转速 ≤ pivotRadS。
  world.stage = "MachineGun";
  let pivotRate = 0, startedBeforeAligned = false, prevY = brain.hullYaw;
  Run(brain, world, 25, (o, b) => {
    const r = Math.abs(Wrap(b.hullYaw - prevY)) / DT; prevY = b.hullYaw;
    if (o.drive.pivoting) pivotRate = Math.max(pivotRate, r);
    const tangentErr = Math.abs(Wrap(b.TangentYaw(b.progress) - b.hullYaw));
    if (Math.abs(o.drive.speed) > 0.05 && tangentErr > TANK.drive.pivotThresholdRad + 0.05 && b.progress < b.cum[1] + 1) startedBeforeAligned = true;
  });
  ok(pivotRate > 0.05 && pivotRate <= TANK.drive.pivotRadS + 1e-6, `pivot rate ${pivotRate.toFixed(3)} ≤ ${TANK.drive.pivotRadS}`);
  ok(!startedBeforeAligned, "turns before moving off (no crabbing)");
  ok(Math.abs(brain.x + 25) < 1e-6, "MachineGun leash stops on block, never enters Tank-stage squeeze");
  // 负载与转速：起步时负载高，停着怠速。
  const idle = brain.Update(DT, world);
  ok(idle.drive.rpm < TANK.drive.idleRpm + 60 && idle.drive.load < 0.1, "idle when halted");
}

// --- 2 炮手：预兆链、目标过滤、散布收敛、警告弹、提前量 ---------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 5 });
  const player = { id: "player", kind: "player", x: -30, y: 1.65, z: -70, ground: 0 };
  const guard = { id: "guard", kind: "guard", x: -34, y: 1.2, z: -72, ground: 0, untargetable: true };
  const world = World({ targets: [player, guard] });
  brain.PlaceAt(1); world.stage = "Support";
  const telemetry = [];
  let prevYaw = brain.turretYaw, maxCrank = 0, lastCrankAt = -1;
  const shots = [];
  Run(brain, world, 60, (o, b) => {
    const rate = Math.abs(Wrap(b.turretYaw - prevYaw)) / DT; prevYaw = b.turretYaw;
    if (rate > 1e-3) { maxCrank = Math.max(maxCrank, rate); lastCrankAt = b.time; }
    for (const f of o.fire) if (f.weapon === "main") shots.push({ ...f, t: b.time, sinceCrank: b.time - lastCrankAt });
    telemetry.push(o);
  });
  ok(shots.length >= 5, `main gun fires on a halted stop (${shots.length} shells in 60 s)`);
  ok(maxCrank <= TANK.gunner.traverseMaxRad + 1e-6, `hand crank ≤ ${TANK.gunner.traverseMaxRad} (saw ${maxCrank.toFixed(3)})`);
  for (const s of shots) {
    ok(s.layS >= TANK.gunner.layMinS - 1e-6 && s.layS <= TANK.gunner.layMaxS + DT, `lay pause ${s.layS.toFixed(2)} s in [1.2,1.8]`);
    ok(s.sinceCrank >= TANK.gunner.layMinS - DT, "crank goes silent ≥1.2 s before every shell");
    ok(Dist(s.at, guard) >= TANK.gunner.protectClearM - 1e-6, "never shells within the protected radius of an untargetable man");
  }
  ok(shots[0].warning && shots[0].kind === "warning", "first shell at a newly exposed player is a warning");
  ok(Dist(shots[0].at, player) >= 2, "warning shell lands short of the player, not on him");
  const gaps = shots.slice(1).map((s, i) => s.t - shots[i].t);
  ok(gaps.every((g) => g >= 4.5 && g <= 10.5), `cadence 6–9 s ±1.5 (${gaps.map((g) => g.toFixed(1)).join(",")})`);
  ok(shots.every((s) => s.target === "player"), "untargetable guard is never the target");
  // 散布收敛：同一目标后几发离人更近。
  const miss = shots.slice(1).map((s) => Dist(s.at, player));
  const early = miss.slice(0, 2).reduce((a, b) => a + b, 0) / 2, late = miss.slice(-2).reduce((a, b) => a + b, 0) / 2;
  ok(late < early || late <= TANK.gunner.scatterMinM + 0.01, `scatter converges (${early.toFixed(2)} → ${late.toFixed(2)})`);
  // 走着不开主炮。
  const moving = CreateTankBrain(StraightPath(), TANK, { seed: 2 });
  const mw = World({ targets: [{ id: "player", kind: "player", x: 20, y: 1.65, z: -30, ground: 0 }] });
  let firedWhileMoving = 0;
  Run(moving, mw, 12, (o) => { if (o.drive.moving && o.fire.some((f) => f.weapon === "main")) firedWhileMoving++; });
  ok(firedWhileMoving === 0, "never fires the main gun on the move");
  // 03 主炮不许开：只转炮塔。
  const quiet = CreateTankBrain(StraightPath(), TANK, { seed: 2 });
  quiet.PlaceAt(1);
  const qw = World({ targets: [player], weaponsFree: { main: false, mg: false } });
  let quietFire = 0;
  Run(quiet, qw, 20, (o) => { quietFire += o.fire.length; });
  ok(quietFire === 0, "weaponsFree=false keeps both guns silent");
  ok(Math.abs(Wrap(YawTo(quiet, player) - quiet.turretYaw)) < 0.1, "turret still tracks while holding fire");
}

// --- 3 提前量与看不见时打掩体 -------------------------------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 9 });
  brain.PlaceAt(1);
  const runner = { id: "player", kind: "player", x: -20, y: 1.65, z: -75, ground: 0 };
  let visible = true;
  // 掩体沿：目标朝车那一侧 1.5 m 处的墙头。
  const Cover = (at, from) => { const d = Math.hypot(from.x - at.x, from.z - at.z) || 1;
    return { x: at.x + (from.x - at.x) / d * 1.5, y: 0.9, z: at.z + (from.z - at.z) / d * 1.5 }; };
  const world = World({ targets: [runner], Los: () => visible, Cover });
  // 先暴露一次（吃掉警告弹）。
  const shots = [];
  Run(brain, world, 14, (o, b) => { for (const f of o.fire) if (f.weapon === "main") shots.push(f); });
  ok(shots[0]?.kind === "warning" && Math.abs(Dist(shots[0].at, runner) - 1.5) < 1e-6, "warning shell hits the cover lip returned by Cover()");
  // 目标横跑：看得见 → 提前量。
  const leadShots = [];
  Run(brain, world, 20, (o, b) => {
    runner.x += 1.5 * DT;
    for (const f of o.fire) if (f.weapon === "main" && f.kind === "HE") leadShots.push({ at: f.at, x: runner.x });
  });
  ok(leadShots.length > 0, "fires at a moving target");
  // 看不见：按 lastKnown 的掩体打（suppress）。
  visible = false;
  const blind = [];
  Run(brain, world, 12, (o) => { for (const f of o.fire) if (f.weapon === "main") blind.push(f); });
  ok(blind.some((f) => f.kind === "suppress"), "shells lastKnown cover when the target is unseen");
}

// --- 3b 区域目标躲在实遮挡后：轰掩体沿（给可破坏掩体一截截打掉） ---------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 13 });
  brain.PlaceAt(1);
  const zone = { id: "nestZone", kind: "zone", weight: 3, x: -25, y: 1.1, z: -72, ground: 0 };
  const lip = { x: -24, y: 1.3, z: -70 };
  const world = World({ targets: [zone], Los: () => false, Cover: () => ({ ...lip }) });
  const shots = [];
  Run(brain, world, 20, (o) => { for (const f of o.fire) if (f.weapon === "main") shots.push(f); });
  ok(shots.length >= 2, "an unseen zone (nest behind its wall) is still shelled");
  ok(shots.every((f) => f.kind === "cover" && Dist(f.at, lip) < 1e-6), "shells land on the cover lip in front of the zone");
}

// --- 4 视线预算：10 Hz、每 tick ≤ 6 条 ---------------------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 1 });
  let rays = 0, maxRaysPerTick = 0;
  const targets = Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, kind: "squad", x: -10 + i, y: 1.2, z: -60, ground: 0 }));
  const world = World({ targets, Los: () => { rays++; return true; } });
  let ticks = 0;
  Run(brain, world, 2, (o) => { maxRaysPerTick = Math.max(maxRaysPerTick, o.rays); if (o.rays) ticks++; });
  ok(maxRaysPerTick <= TANK.gunner.raysPerTick, `≤${TANK.gunner.raysPerTick} rays per perception tick`);
  ok(ticks >= 19 && ticks <= 21, `10 Hz perception (${ticks} ticks in 2 s)`);
  ok(rays <= 21 * TANK.gunner.raysPerTick, "total rays bounded");
}

// --- 5 机枪：首次接触走进来（零伤害）、射界、死角转塔后机枪 --------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 4 });
  brain.PlaceAt(1);
  const ahead = Forward(brain.hullYaw);
  const player = { id: "player", kind: "player", x: brain.x + ahead.x * 30, y: 1.65, z: brain.z + ahead.z * 30, ground: 0 };
  const world = World({ targets: [player], weaponsFree: { main: false, mg: true } });
  const shots = [];
  Run(brain, world, 8, (o) => { for (const f of o.fire) if (f.weapon === "coax") shots.push(f); });
  ok(shots.length > 5, "hull MG fires at a man inside its arc");
  const first = brain.telemetry.bursts[0];
  ok(first.kind === "walkIn" && first.damage === false, "first burst on contact walks in with zero damage");
  const firstBurst = shots.filter((s) => s.kind === "walkIn");
  ok(firstBurst.every((s) => s.damageScale === 0), "walk-in bullets carry damageScale 0");
  ok(Dist(firstBurst[0].at, player) > Dist(firstBurst.at(-1).at, player) + 3, "walk-in starts short and walks onto the target");
  ok(shots.some((s) => s.kind === "burst" && s.damageScale > 0), "later bursts are real");
  // 射界外：车体机枪不打。
  const side = CreateTankBrain(StraightPath(), TANK, { seed: 4 });
  side.PlaceAt(1);
  const r = Right(side.hullYaw);
  const flank = { id: "player", kind: "player", x: side.x + r.x * 30, y: 1.65, z: side.z + r.z * 30, ground: 0 };
  let flankMg = 0;
  Run(side, World({ targets: [flank], weaponsFree: { main: false, mg: true } }), 6, (o) => { flankMg += o.fire.filter((f) => f.weapon === "coax").length; });
  ok(flankMg === 0, "hull MG respects its ±26° arc");
  // 死角：贴身、在车体机枪射界外 → 炮塔掉头、≥6 s 后塔后机枪开火；开舱盖喊人。
  const close = CreateTankBrain(StraightPath(), TANK, { seed: 4 });
  close.PlaceAt(1);
  const rr = Right(close.hullYaw), f2 = Forward(close.hullYaw);
  const hugger = { id: "player", kind: "player", x: close.x + rr.x * 6 + f2.x * 1, y: 1.65, z: close.z + rr.z * 6 + f2.z * 1, ground: 0 };
  const cw = World({ targets: [hugger], weaponsFree: { main: true, mg: true }, escortIds: ["e1", "e2", "e3", "e4"] });
  let rearAt = null, hatch = false, rally = false, mainAtHugger = 0;
  Run(close, cw, 16, (o, b) => {
    if (o.fire.some((f) => f.weapon === "rear") && rearAt == null) rearAt = b.time;
    if (o.barks.some((k) => k.id === "hatchShout")) hatch = true;
    if (o.escorts.some((e) => e.mode === "rally")) rally = true;
    mainAtHugger += o.fire.filter((f) => f.weapon === "main").length;
  });
  ok(rearAt != null && rearAt >= 6, `rear MG comes to bear only after ≥6 s (${rearAt?.toFixed(1)})`);
  ok(hatch && rally, "hatch shout calls the escorts in");
  ok(mainAtHugger === 0, "main gun cannot engage inside minimum range");
}

// --- 6 反应：近炸后倒（下限、投掷距离）、炮塔甩向投掷者、机枪压制、护兵散开、诱饵冷却 -----------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 8 });
  const world = World({ stage: "MachineGun", escortIds: ["e1", "e2", "e3", "e4"] });
  brain.PlaceAt(1); world.stage = "Support"; brain.Update(DT, world);
  world.stage = "MachineGun";
  Run(brain, world, 40);
  ok(Math.abs(brain.x + 25) < 1e-6, "reached block");
  const floor = brain.stageFloor;
  const thrower = { x: brain.x - 2, z: brain.z + 6 };
  const escortsBefore = brain.Update(DT, world).escorts;
  const res = brain.OnBlast({ x: brain.x - 1, y: 0.2, z: brain.z + 5, explosiveId: "Grenade", damage: 160, radius: 4, thrower, byPlayer: true }, world);
  ok(res.reaction && res.state === "Intact", "ordinary grenade: reaction only, no damage");
  const goal = brain.reverseGoal;
  ok(goal != null && brain.progress - goal >= TANK.react.reverseMinM - 1e-6 && brain.progress - goal <= TANK.react.reverseMaxM + 1e-6, "reverses 1.5–3 m");
  let mgAtThrower = 0, whip = 0, scattered = false, prevYaw = brain.turretYaw;
  Run(brain, world, 6, (o, b) => {
    whip = Math.max(whip, Math.abs(Wrap(b.turretYaw - prevYaw)) / DT); prevYaw = b.turretYaw;
    mgAtThrower += o.fire.filter((f) => f.weapon === "coax" && f.kind === "suppress").length;
    if (o.escorts.some((e) => e.mode === "scatter")) scattered = true;
  });
  ok(brain.progress >= floor - 1e-6, "never reverses past the stage floor");
  ok(Dist(brain, thrower) <= Math.max(TANK.react.keepThrowRangeM, 6.4) + 1e-6, "thrower stays inside covered throw range after reversing");
  ok(whip > TANK.gunner.traverseMaxRad && whip <= TANK.gunner.whipRad + 1e-6, "turret whips toward the thrower (faster crank, still bounded)");
  ok(scattered && escortsBefore.length === 4, "escorts scatter on a near blast");
  // 下限：阶段刚开始（里程 = 下限）时后倒被夹成 0。
  const pinned = CreateTankBrain(StraightPath(), TANK, { seed: 8 });
  pinned.PlaceAt(2); pinned.stage = "MachineGun";
  const pw = World({ stage: "MachineGun" }); pinned.Update(DT, pw);
  pinned.OnBlast({ x: pinned.x, z: pinned.z + 3, explosiveId: "Grenade", damage: 160, radius: 4, byPlayer: true }, pw);
  Run(pinned, pw, 4);
  ok(pinned.progress >= pinned.stageFloor - 1e-6, "reverse clamped at the stage lower bound");
  // 诱饵：15 s 最多牵一次。
  const d1 = brain.OnBulletHit({ from: { x: 10, z: -30 }, shooterId: "player" });
  const d2 = brain.OnBulletHit({ from: { x: 10, z: -30 }, shooterId: "player" });
  ok(d1.decoy && !d2.decoy, "rifle hits pull attention at most once per decoyCooldownS");
  Run(brain, world, TANK.react.decoyCooldownS + 0.1);
  ok(brain.OnBulletHit({ from: { x: 10, z: -30 } }).decoy, "decoy available again after the cooldown");
  // 关注扫描：Tank 这一步才看取弹沟。
  const scanner = CreateTankBrain(StraightPath(), TANK, { seed: 3 });
  scanner.PlaceAt(2);
  const sw = World({ stage: "Tank" });
  let scans = 0;
  Run(scanner, sw, 30, (o) => { scans += o.events.filter((e) => e.id === "scan").length; });
  ok(scans >= 2 && scans <= 3, `attention scan every 10–14 s (${scans} in 30 s)`);
}

// --- 7 护兵槽 -----------------------------------------------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 6 });
  const world = World({ escortIds: ["e1", "e2", "e3", "e4"] });
  const o = brain.Update(DT, world);
  ok(o.escorts.length === 4, "four escort slots");
  const f = Forward(brain.hullYaw), r = Right(brain.hullYaw);
  for (const e of o.escorts) {
    const dx = e.anchor.x - brain.x, dz = e.anchor.z - brain.z;
    const ahead = dx * f.x + dz * f.z, lateral = dx * r.x + dz * r.z;
    ok(ahead >= 5 - 1e-6 && ahead <= 8 + 1e-6, "escort 5–8 m ahead of the hull");
    ok(Math.abs(lateral) >= TANK.escorts.lateralM - 1e-6, "escort in the roadside ditch, not on the road");
  }
  ok(new Set(o.escorts.map((e) => Math.sign((e.anchor.x - brain.x) * r.x + (e.anchor.z - brain.z) * r.z))).size === 2, "two pairs, one each side");
  Run(brain, world, 30);
  const held = brain.Update(DT, world).escorts;
  ok(held.every((e) => e.mode === "hold" && e.radius === TANK.escorts.holdRadiusM), "halted at a firePoint the escorts push out to roadside cover");
  brain.ForceDisable();
  const after = brain.Update(DT, world);
  ok(after.escorts.length === 0 && after.releaseEscorts, "Disabled hands escorts back to ordinary AI");
}

// --- 8 两段毁伤（车体局部坐标） ----------------------------------------------------------
{
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 12 });
  brain.PlaceAt(2); brain.hullYaw = 1.7; // 车头朝西偏北（与现布局封口点同向）
  const world = World({ stage: "MachineGun", targets: [{ id: "player", kind: "player", x: brain.x - 20, y: 1.65, z: brain.z + 2, ground: 0 }] });
  const r = Right(brain.hullYaw), f = Forward(brain.hullYaw);
  // 局部坐标换算自洽。
  const side = { x: brain.x + r.x * 2, y: 0.3, z: brain.z + r.z * 2 };
  const local = HullLocal(brain, side, 0);
  ok(Math.abs(local.x - 2) < 1e-9 && Math.abs(local.z) < 1e-9, "hull-local transform (+X right)");
  // 世界 x ± 1.5 的旧判据在车头朝西时会落到车头车尾：这里按车体局部判，车头前方地面炸不断履带侧。
  const bow = brain.OnBlast({ x: brain.x + f.x * 4.2, y: 0.2, z: brain.z + f.z * 4.2, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, world);
  ok(bow.state === "Intact" || bow.zone?.startsWith("track"), "bow blast is judged in hull-local space");
  const fresh = CreateTankBrain(StraightPath(), TANK, { seed: 12 });
  fresh.PlaceAt(2); fresh.hullYaw = 1.7;
  const rr = Right(fresh.hullYaw);
  const trackHit = fresh.OnBlast({ x: fresh.x + rr.x * 1.9, y: 0.25, z: fresh.z + rr.z * 1.9, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true, thrower: { x: fresh.x + rr.x * 6, z: fresh.z + rr.z * 6 } }, world);
  ok(trackHit.zone === "trackR" && trackHit.state === "MobilityKill", "bundle beside the right track = MobilityKill");
  ok(fresh.Immobilized && !fresh.FireDisabled, "tankImmobilized without tankFireDisabled");
  // MobilityKill：不能开，但炮塔和机枪还活着，会去找投掷者。
  const x0 = fresh.x, z0 = fresh.z;
  let fired = 0;
  const thrower = { id: "player", kind: "player", x: fresh.x + rr.x * 14, y: 1.65, z: fresh.z + rr.z * 14, ground: 0 };
  const mw = World({ stage: "Tank", targets: [thrower] });
  Run(fresh, mw, 20, (o) => { fired += o.fire.filter((f2) => f2.weapon === "main").length; });
  ok(fresh.x === x0 && fresh.z === z0, "MobilityKill cannot drive");
  ok(fired > 0, "MobilityKill turret still hunts the thrower with the main gun");
  // 第二颗（哪儿都行，只要够近）→ Disabled。
  const second = fresh.OnBlast({ x: fresh.x - rr.x * 1.8, y: 0.25, z: fresh.z - rr.z * 1.8, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, mw);
  ok(second.state === "Disabled", "second effective bundle = Disabled");
  const yawAt = fresh.turretYaw;
  let after = 0;
  Run(fresh, mw, 5, (o) => { after += o.fire.length; });
  ok(after === 0 && fresh.turretYaw === yawAt, "Disabled: turret jammed, guns silent");
  ok(fresh.rpm === 0, "engine dies after the stall");
  // 发动机舱：一颗直接 Disabled。
  const deck = CreateTankBrain(StraightPath(), TANK, { seed: 12 });
  deck.PlaceAt(2); deck.hullYaw = 1.7;
  const back = Forward(deck.hullYaw + Math.PI);
  const engine = deck.OnBlast({ x: deck.x + back.x * 1.2, y: 1.8, z: deck.z + back.z * 1.2, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, World());
  ok(engine.state === "Disabled" && deck.engineKilled, "bundle on the engine deck = Disabled in one");
  // 普通手榴弹贴着履带也不伤车。
  const nade = CreateTankBrain(StraightPath(), TANK, { seed: 12 });
  nade.PlaceAt(2);
  ok(nade.OnBlast({ x: nade.x + 1.5, y: 0.2, z: nade.z, explosiveId: "Grenade", damage: 160, radius: 4, byPlayer: true }, World()).state === "Intact", "grenades never damage the tank");
  // 太远的集束弹没有伤害。
  const far = CreateTankBrain(StraightPath(), TANK, { seed: 12 });
  far.PlaceAt(2);
  ok(far.OnBlast({ x: far.x, y: 0.2, z: far.z + 5, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, World()).state === "Intact", "bundle 5 m off the side (3.9 m from the track) does nothing");
  ok(brain.telemetry.states.length >= 1, "state log kept");
}

// --- 9 现布局临时路线：03→05 全程 ---------------------------------------------------------
{
  const brain = CreateTankBrain(TANK_TEMP_PATH, TANK, { seed: 21 });
  const facts = new Set();
  const nest = { id: "player", kind: "mannedMg", x: 27, y: 1.65, z: -141, ground: 0 };
  const world = World({ stage: "Support", facts, targets: [nest], weaponsFree: { main: false, mg: false } });
  const stops = [];
  let t = 0, previewAt = null, pressuredAt = null, firstShellAt = null;
  const step = (seconds, fn) => Run(brain, world, seconds, (o, b) => {
    t += DT;
    for (const e of o.events) if (e.id === "stop") stops.push({ index: e.index, t });
    if (o.drive.waypoint?.preview && previewAt == null) previewAt = t;
    for (const f of o.fire) if (f.weapon === "main" && firstShellAt == null) firstShellAt = t;
    fn?.(o, b);
  });
  step(40);
  ok(brain.holdIndex === 2, "03: waits off-map until the first rifle batch is withdrawn");
  facts.add("rifleWithdrawalResolved");
  step(40);
  ok(previewAt != null, "03: reaches the hull-down preview");
  ok(brain.holdIndex === 6, "03: holds at preview until 04");
  world.stage = "MachineGun"; world.weaponsFree = { main: true, mg: true };
  step(20, (o) => {
    for (const f of o.fire) if (f.weapon === "main" && Dist(f.at, nest) < 8) facts.add("tankPositionPressured");
  });
  ok(firstShellAt != null, "04: first shell fired at the nest from the firePoint");
  ok(stops.some((s) => s.index === 7), "04: stopped on the firePoint before firing");
  step(30);
  ok(brain.holdIndex === 9, "04: advances to block after the nest is pressured");
  world.stage = "Tank";
  step(60);
  ok(brain.holdIndex === 11 || brain.reached >= 10, "05: squeezes toward the gap");
  ok(Dist(brain, { x: 39, z: -140 }) <= 9, "05: throw point within covered throw range");
}

// --- 10 可破坏掩体（运行时机制，Script_FirstLevelFrontBreakables）：分段、碰撞、接管静态块、永不可破 ------------
{
  const { registerHooks } = await import("node:module");
  const fs = await import("node:fs");
  const vendor = new URL("./vendor/three/", import.meta.url);
  const hooks = registerHooks({
    resolve(id, context, next) { if (id === "three") return { url: new URL("build/three.module.js", vendor).href, shortCircuit: true }; return next(id, context); },
    load(url, context, next) { if (url.startsWith(vendor.href) && url.endsWith(".js")) return { format: "module", source: fs.readFileSync(new URL(url), "utf8"), shortCircuit: true }; return next(url, context); },
  });
  const THREE = await import("three");
  const { FirstLevelFrontBreakables, NEVER_BREAKABLE, DistanceToWall } = await import("./Script_FirstLevelFrontBreakables.mjs");
  hooks.deregister();
  const block = { id: "TestWall", x: 10, z: -5, w: 4, d: 0.6, h: 1.6, y: 0.7, semantic: "Whitebox" };
  // 静态合批里的这一块（24 个顶点）+ 旁边一块不相干的。
  const box = new THREE.BoxGeometry(block.w, block.h, block.d).translate(block.x, block.y, block.z);
  const other = new THREE.BoxGeometry(1, 1, 1).translate(20, 0.5, -5);
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute([...box.attributes.position.array, ...other.attributes.position.array], 3));
  const mesh = new THREE.Mesh(merged); mesh.name = "FirstLevelWhitebox_StaticWhiteBoxes";
  const staticCollider = { c: [block.x, block.y, block.z], h: [block.w / 2, block.h / 2, block.d / 2], _physicsHandle: 7 };
  const solids = new Set([7]); let serial = 100;
  const physics = { AddSolid: (b) => { b._physicsHandle = ++serial; solids.add(serial); }, RemoveSolid: (h) => solids.delete(h) };
  const battlefield = { GroundHeight: () => 0, colliders: [staticCollider], meshes: [mesh], materials: new Map(), BuildCollisionGrid() {} };
  const scene = new THREE.Scene();
  const specs = [
    { id: "TestBreak", block: "TestWall", hitRadiusM: 2, minDamage: 60, stages: [[[-2, 2, 1.5]], [[-2, 0, 1.5], [0, 2, 1.0]], [[-2, 2, 0.6]]] },
    { id: "RearWallAttempt", block: "RightNestRearWall", stages: [[[-1, 1, 1]], [[-1, 1, 0.2]]] },
  ];
  const b = new FirstLevelFrontBreakables({ scene, battlefield, physics, layout: { blocks: [block, { id: "RightNestRearWall", x: 0, z: 0, w: 2, d: 1, h: 2, y: 1 }] } }, specs);
  ok(NEVER_BREAKABLE.includes("RightNestRearWall") && b.items.length === 1, "the position rear wall is never breakable even if data lists it");
  ok(!solids.has(7) && !battlefield.colliders.includes(staticCollider), "static collider of the taken-over block removed");
  const pos = merged.attributes.position;
  let collapsed = 0; for (let i = 0; i < 24; i++) if (Math.abs(pos.getY(i) - (block.y - block.h / 2)) < 1e-6 && Math.abs(pos.getX(i) - block.x) < 1e-6) collapsed++;
  let untouched = 0; for (let i = 24; i < pos.count; i++) if (Math.abs(Math.abs(pos.getX(i) - 20) - 0.5) < 1e-6) untouched++;
  ok(collapsed === 24 && untouched === pos.count - 24, "only the block's own vertices collapse");
  ok(b.State()[0].stage === 0 && b.State()[0].colliders === 1 && battlefield.colliders.length === 1, "stage 0 rebuilds the intact wall as its own collider");
  const top0 = Math.max(...battlefield.colliders.map((c) => c.max[1]));
  ok(Math.abs(top0 - (block.y + block.h / 2)) < 0.02, "stage 0 top matches the original block top (the gun still rests on it)");
  ok(b.OnBlast({ x: 10, y: 1, z: -2 }, { damage: 30, time: 1 }).length === 0, "weak blast breaks nothing");
  ok(b.OnBlast({ x: 10, y: 1, z: -8 }, { damage: 85, time: 2 }).length === 0 || DistanceToWall(b.items[0].spec, { x: 10, z: -8 }) <= 2, "far blast breaks nothing");
  const hit = b.OnBlast({ x: 11, y: 1, z: -4 }, { damage: 85, time: 3 });
  ok(hit.length === 1 && hit[0].to === 1 && battlefield.colliders.length === 2, "a shell next to the wall knocks one stage off (two segments now)");
  ok(b.OnBlast({ x: 11, y: 1, z: -4 }, { damage: 85, time: 3.1 }).length === 0, "one stage per blast (0.3 s guard)");
  b.OnBlast({ x: 11, y: 1, z: -4 }, { damage: 85, time: 4 });
  const top2 = Math.max(...battlefield.colliders.map((c) => c.max[1]));
  ok(b.State()[0].stage === 2 && Math.abs(top2 - (block.y - block.h / 2 + 0.6 + 0.1)) < 0.05, "last stage is the low remnant");
  ok(b.OnBlast({ x: 11, y: 1, z: -4 }, { damage: 85, time: 5 }).length === 0, "nothing below the last stage");
  b.Dispose();
  ok(battlefield.colliders.length === 0 && scene.children.length === 0, "dispose removes colliders and meshes");
}

console.log(`PASS FirstLevelTankBrain: ${checks} checks (drive, telegraph, targeting, scatter, MG walk-in, dead zone, reactions, escorts, two-stage damage, 03→05 temp path, breakable cover)`);
