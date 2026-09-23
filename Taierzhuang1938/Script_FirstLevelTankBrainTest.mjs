// Script_FirstLevelTankBrainTest.mjs —— 第一关战车纯规则大脑（纯 Node，秒级）
//
// 覆盖：驾驶加减速 / 停车才原地转 / 行进转向率随车速 / 阶段拴绳；炮手预兆链（手摇速率、
// 瞄准停顿、只在停车点开炮）、目标过滤（missionUntargetable / protect）、散布收敛、提前量、
// 新暴露警告弹、保护半径；机枪首次接触零伤害走进来、射界；反应（后倒下限与投掷距离、
// 炮塔甩向投掷者、机枪压制、护兵散开、诱饵冷却）；护兵槽；两段毁伤（履带 / 发动机）；
// 视线预算。口径：docs/Data_FirstLevel0105Refactor20260923Contract.md §5.7。
import assert from "node:assert/strict";
import { CreateTankBrain, SeededRng, YawTo, Forward, Right, HullLocal,
  TankClearFact, BundleResupplyOpen, LuoFinishDue, LanePoint } from "./Script_FirstLevelTankBrain.mjs";
import { TANK, TANK_TEMP_PATH, NEVER_BREAKABLE_RULES } from "./Data_Tuning_Tank.mjs";
import { TankAudio, TankLoopParams, CannonLayerWeights, ShellPassPoint } from "./Script_TankAudio.mjs";
import { TANK_SFX, TankSfxFiles } from "./Data_SfxSources.mjs";
import { SOUND_NAMES } from "./Script_Audio.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  ok(Math.abs(shots[0].damage - TANK.gunner.shellDamage * TANK.gunner.warningDamageScale) < 1e-9 && shots[1].damage === TANK.gunner.shellDamage,
    "warning shell carries reduced damage, the next ones are real");
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
  // 同一堵墙后面站着还没被警告过的玩家：第一发区域弹按警告弹算（减伤），之后才是真的。
  const warned = CreateTankBrain(StraightPath(), TANK, { seed: 13 });
  warned.PlaceAt(1);
  const man = { id: "player", kind: "mannedMg", x: -24.5, y: 1.6, z: -71, ground: 0 };
  const zw = World({ targets: [zone, man], Los: () => false, Cover: () => ({ ...lip }) });
  const zshots = [];
  Run(warned, zw, 20, (o) => { for (const f of o.fire) if (f.weapon === "main") zshots.push(f); });
  ok(zshots[0].warning && zshots[0].damage < TANK.gunner.shellDamage && !zshots[1].warning, "first zone shell beside an unwarned player is his warning");
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
  // Dispose 把接管时塌掉的静态顶点、摘掉的静态碰撞盒还回去（读档重建任务运行时而战场不重建时，墙不会永久消失）。
  ok(scene.children.length === 0, "dispose removes the segment meshes");
  ok(battlefield.colliders.length === 1 && battlefield.colliders[0] === staticCollider && staticCollider._physicsHandle != null
    && solids.has(staticCollider._physicsHandle), "dispose restores the taken-over static collider (list + physics)");
  let restored = 0; for (let i = 0; i < 24; i++) if (Math.abs(pos.getX(i) - block.x) > 1e-6 || Math.abs(pos.getY(i) - (block.y - block.h / 2)) > 1e-6) restored++;
  ok(restored === 24, "dispose restores the taken-over static vertices");
  // 永不可破坏也按区域认：外廓碰到受保护区域（layout.zones 的语义 id）就拒绝，不靠体块名对上。
  const zoned = new FirstLevelFrontBreakables({ scene, battlefield: { ...battlefield, colliders: [], meshes: [] }, physics,
    layout: { blocks: [], zones: [{ id: "rightRear", x: 0, z: 0, radius: 8 }, { id: "withdrawalGap", x: 100, z: 0, radius: 8 }] } }, [
    { id: "InsideRear", x: 5, z: 0, w: 2, d: 0.6, base: 0, stages: [[[-1, 1, 1]], [[-1, 1, 0.3]]] },
    { id: "EdgeTouchesGap", x: 91, z: 0, w: 2.4, d: 0.6, base: 0, stages: [[[-1, 1, 1]], [[-1, 1, 0.3]]] },
    { id: "FarAway", x: 50, z: 0, w: 2, d: 0.6, base: 0, stages: [[[-1, 1, 1]], [[-1, 1, 0.3]]] },
  ], NEVER_BREAKABLE_RULES);
  ok(zoned.items.length === 1 && zoned.items[0].id === "FarAway" && zoned.rejected.map((r) => r.why).join() === "zone:rightRear,zone:withdrawalGap",
    "breakables inside / touching a protected zone (sap trench, guard safe area) are refused by region, not by name");
  zoned.Dispose();
}

// --- 11 审查修复（2026-09-24）：打不死的不打、撤离窗口、挪窝重来、攻击支路区域火力、补弹与补刀、后甲板 -------------
{
  // 11a 打不死的剧情人物（scriptEssential）权重压到 essentialScale：同样看得见，炮手打普通兵 / 玩家。
  const brain = CreateTankBrain(StraightPath(), TANK, { seed: 31 });
  brain.PlaceAt(1);
  const he = { id: "heyoutian", kind: "leftGun", x: -20, y: 1.2, z: -75, ground: 0, essential: true };
  const player = { id: "player", kind: "player", x: 20, y: 1.65, z: -85, ground: 0 };
  const world = World({ targets: [he, player] });
  const shots = [];
  Run(brain, world, 30, (o) => { for (const f of o.fire) if (f.weapon === "main") shots.push(f); });
  ok(shots.length >= 2 && shots.every((f) => f.target === "player"), `essential companion is not worth a shell (${shots.map((f) => f.target).join(",")})`);
  const alone = CreateTankBrain(StraightPath(), TANK, { seed: 31 });
  alone.PlaceAt(1);
  const loneShots = [];
  Run(alone, World({ targets: [he] }), 20, (o) => { for (const f of o.fire) if (f.weapon === "main") loneShots.push(f); });
  ok(loneShots.length >= 1, "an essential target is still shot at when nothing else is there (weight is scaled, not zeroed)");

  // 11b 撤离窗口：带 damageCap 的玩家，落在他弹片范围里的每一发都只按上限伤人；打墙的力道仍是整发。
  const retreat = CreateTankBrain(StraightPath(), TANK, { seed: 32 });
  retreat.PlaceAt(1);
  const runner = { id: "player", kind: "player", x: -15, y: 1.65, z: -70, ground: 0, damageCap: TANK.gunner.retreatDamageScale, weightScale: TANK.gunner.retreatWeightScale };
  const capped = [];
  Run(retreat, World({ targets: [runner] }), 40, (o) => { for (const f of o.fire) if (f.weapon === "main") capped.push(f); });
  ok(capped.length >= 3 && capped.every((f) => f.damage <= TANK.gunner.shellDamage * TANK.gunner.retreatDamageScale + 1e-9),
    `retreat window: every shell near the player is capped (${capped.map((f) => f.damage.toFixed(0)).join(",")})`);
  ok(capped.every((f) => f.coverDamage === TANK.gunner.shellDamage), "cover still takes the full shell (warning / capped shells break walls too)");

  // 11c 挪窝：目标离上一发瞄的位置 > moveResetM，散布回到第一发（不接着收敛）。
  const mover = CreateTankBrain(StraightPath(), TANK, { seed: 33 });
  mover.PlaceAt(1);
  const target = { id: "player", kind: "player", x: -15, y: 1.65, z: -75, ground: 0 };
  const steps = [];
  Run(mover, World({ targets: [target] }), 40, (o, b) => { for (const f of o.fire) if (f.weapon === "main") steps.push(b.telemetry.shots.at(-1).spreadStep); });
  ok(steps.at(-1) >= 3, `static target: scatter keeps converging (steps ${steps.join(",")})`);
  target.x += TANK.gunner.moveResetM + 2;
  const moved = [];
  Run(mover, World({ targets: [target] }), 25, (o, b) => { for (const f of o.fire) if (f.weapon === "main") moved.push(b.telemetry.shots.at(-1).spreadStep); });
  ok(moved.includes(0), `moved ${TANK.gunner.moveResetM + 2} m: the next planned shell is back to first-shot scatter (${moved.join(",")})`);

  // 11d 攻击支路区域火力：LanePoint 取整、沟外为 null；区域目标进了最小射程不再规划。
  const lane = TANK_TEMP_PATH.lanes[0];
  const lp = LanePoint(lane, { x: 35.4, z: -128.2 });
  ok(lp && Math.abs(lp.s % lane.stepM) < 1e-6 && lp.d < 2, `lane point snaps to ${lane.stepM} m steps (s=${lp?.s})`);
  ok(LanePoint(lane, { x: 27, z: -110 }) === null, "off the lane → no zone target");
  ok(LanePoint(lane, { x: 27, z: -127 }) === null, "the rear rally point (27,−127) is not part of the lane");
  const zoneBrain = CreateTankBrain(StraightPath(), TANK, { seed: 34 });
  zoneBrain.PlaceAt(1);
  const near = { id: "attackLane", kind: "zone", weight: 2.5, x: zoneBrain.x + 6, y: 1.1, z: zoneBrain.z, ground: 0 };
  let nearShots = 0;
  Run(zoneBrain, World({ targets: [near] }), 15, (o) => { nearShots += o.fire.filter((f) => f.weapon === "main").length; });
  ok(nearShots === 0 && zoneBrain.targetId == null, "a zone inside the main gun's minimum range is dropped, not re-planned every frame");
  // 05 现布局：玩家在攻击支路上、车停在挤压点 → 炮塔转向他脚下那段沟并开炮（沟沿），不是 60 m 外的何有田。
  const b05 = CreateTankBrain(TANK_TEMP_PATH, TANK, { seed: 35 });
  b05.PlaceForStage("Tank");
  const lanePt = LanePoint(lane, { x: 33, z: -127.5 });
  const lanes = [
    { id: "heyoutian", kind: "leftGun", x: -31, y: 1.2, z: -150, ground: 0, essential: true },
    { id: "gapZone", kind: "zone", weight: 1, x: -8, y: 1.2, z: -139, ground: 0 },
    { id: "attackLane", kind: "zone", weight: lane.weight, x: lanePt.x, y: 1.1, z: lanePt.z, ground: 0, scatterM: lane.scatterM },
  ];
  const lip = { x: lanePt.x + 0.6, y: 0.4, z: lanePt.z - 0.8 };
  const w05 = World({ stage: "Tank", facts: new Set(["bundleTaken"]), targets: lanes, Los: () => false, Cover: () => ({ ...lip }) });
  const s05 = [];
  Run(b05, w05, 40, (o) => { for (const f of o.fire) if (f.weapon === "main") s05.push(f); });
  ok(s05.length >= 2 && s05.every((f) => f.target === "attackLane" && f.kind === "cover"),
    `05: the main gun works the attack lane's cover lip (${s05.map((f) => `${f.target}/${f.kind}`).join(",")})`);

  // 11e 事实口径 / 补弹 / 补刀。
  ok(TankClearFact({ brain: true }) === "tankFireDisabled" && TankClearFact({}) === "tankImmobilized", "clear fact: brain → tankFireDisabled, legacy → tankImmobilized");
  ok(BundleResupplyOpen({ brain: true, immobilized: true, fireDisabled: false }, true), "MobilityKill: the ammo house still hands out bundles");
  ok(!BundleResupplyOpen({ brain: true, immobilized: true, fireDisabled: true }, true), "Disabled: no more bundles");
  ok(!BundleResupplyOpen({ immobilized: true }, true) && BundleResupplyOpen({ immobilized: false }, true) && BundleResupplyOpen({ immobilized: true }, false),
    "legacy path unchanged");
  ok(!LuoFinishDue({ state: "MobilityKill", noBundleSince: 10, now: 10 + TANK.damage.luoFinishS - 0.1 })
    && LuoFinishDue({ state: "MobilityKill", noBundleSince: 10, now: 10 + TANK.damage.luoFinishS })
    && !LuoFinishDue({ state: "Intact", noBundleSince: 10, now: 100 }) && !LuoFinishDue({ state: "MobilityKill", noBundleSince: null, now: 100 }),
    "Luo finishes the tank only after MobilityKill with no bundles for luoFinishS");
  // 断履带、手里零捆：没有别的办法也能到 Disabled（补刀），而且只到一次。
  const stuck = CreateTankBrain(StraightPath(), TANK, { seed: 36 });
  stuck.PlaceAt(2); stuck.hullYaw = 1.7;
  const rr = Right(stuck.hullYaw);
  stuck.OnBlast({ x: stuck.x + rr.x * 1.9, y: 0.25, z: stuck.z + rr.z * 1.9, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, World());
  ok(stuck.damageState === "MobilityKill", "first bundle: MobilityKill");
  // 普通手榴弹补不了（只认集束弹）：
  stuck.OnBlast({ x: stuck.x + rr.x * 1.2, y: 0.25, z: stuck.z + rr.z * 1.2, explosiveId: "Grenade", damage: 160, radius: 4, byPlayer: true }, World());
  ok(stuck.damageState === "MobilityKill", "a plain grenade does not finish it");
  stuck.ForceDisable("luoHatch");
  ok(stuck.damageState === "Disabled" && stuck.damageLog.at(-1).zone === "luoHatch", "Luo's hatch grenade (ForceDisable) reaches Disabled");

  // 11f 扔上车顶的那捆停在碰撞盒顶 2.56 m：认得出是后甲板（发动机舱）。
  const top = CreateTankBrain(StraightPath(), TANK, { seed: 37 });
  top.PlaceAt(2); top.hullYaw = 1.7;
  const aft = Forward(top.hullYaw + Math.PI);
  const onDeck = top.OnBlast({ x: top.x + aft.x * 1.2, y: 2.56, z: top.z + aft.z * 1.2, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, World());
  ok(onDeck.zone === "engineDeck" && onDeck.state === "Disabled" && top.engineKilled, `bundle resting on the collider top over the engine = engineDeck (${onDeck.zone})`);
  // 远侧履带边（越过车顶扔过去）：断履带，不是发动机。
  const farSide = CreateTankBrain(StraightPath(), TANK, { seed: 38 });
  farSide.PlaceAt(2); farSide.hullYaw = 1.7;
  const fr = Right(farSide.hullYaw), fb = Forward(farSide.hullYaw + Math.PI);
  const across = farSide.OnBlast({ x: farSide.x - fr.x * 1.6 + fb.x * 0.7, y: 0.1, z: farSide.z - fr.z * 1.6 + fb.z * 0.7, explosiveId: "GrenadeBundle", damage: 620, radius: 4.2, byPlayer: true }, World());
  ok(across.zone === "trackL" && across.state === "MobilityKill", `bundle beside the far track = MobilityKill (${across.zone})`);
}

// --- 声音（Step 2）：映射是纯函数，控制器配一个假引擎 ---------------------------------
{
  const A = TANK.audio, D = TANK.drive;
  const base = { idleRpm: D.idleRpm, maxRpm: D.maxRpm, cruiseMps: D.cruiseMps, pivotMaxRad: D.pivotRadS };
  const idle = TankLoopParams({ ...base, rpm: D.idleRpm, load: 0 }, A);
  const full = TankLoopParams({ ...base, rpm: D.maxRpm, load: 1, speed: D.cruiseMps }, A);
  const mid = TankLoopParams({ ...base, rpm: (D.idleRpm + D.maxRpm) / 2, load: 0.5, speed: 1 }, A);
  ok(idle.running && idle.engine.gains[0] > 0.3 && idle.engine.gains[1] < 1e-6, "idle: only the idle layer sounds");
  ok(full.engine.gains[1] > full.engine.gains[0] && full.engine.gains[0] < 1e-6, "full revs: only the load layer sounds");
  const power = (p) => (p.engine.gains[0] / A.idleGain) ** 2 + (p.engine.gains[1] / A.loadGain) ** 2;
  ok(Math.abs(power(TankLoopParams({ ...base, rpm: 1200, load: 0 }, A)) - 1) < 1e-6, "idle/load crossfade is equal-power");
  for (const p of [idle, mid, full]) for (const r of p.engine.rates) ok(r >= A.rateMin - 1e-9 && r <= A.rateMax + 1e-9, `engine rate ${r.toFixed(3)} inside ±12%`);
  ok(idle.engine.subHz === 30 && full.engine.subHz === 70 && mid.engine.subHz > 30 && mid.engine.subHz < 70,
    `ignition sub-bass 30→70 Hz follows rpm/20 (idle ${idle.engine.subHz}, mid ${mid.engine.subHz.toFixed(1)}, full ${full.engine.subHz})`);
  ok(full.engine.subGain > idle.engine.subGain, "sub layer grows with load");
  ok(idle.tracks.gains[0] < 1e-6 && full.tracks.gains[0] > 0.5, "tracks silent at a standstill, loud at cruise");
  ok(TankLoopParams({ ...base, rpm: D.idleRpm, pivotRate: D.pivotRadS }, A).tracks.gains[0] > 0.3, "pivoting in place still clanks the tracks");
  ok(TankLoopParams({ ...base, rpm: D.idleRpm, turretRate: 0.26, cranking: false }, A).turret.gains[0] === 0, "turret crank silent when not cranking");
  const crank = TankLoopParams({ ...base, rpm: D.idleRpm, turretRate: 0.26, cranking: true }, A).turret;
  ok(crank.gains[0] > 0.5 && crank.rates[0] > 0.95 && crank.rates[0] < 1.05, "hand crank at 0.26 rad/s plays at ~1x");
  const stalled = TankLoopParams({ ...base, rpm: 0, load: 0 }, A);
  ok(!stalled.running && stalled.engine.gains.every((g) => g === 0) && stalled.engine.subGain === 0, "rpm 0: engine and sub fully silent");
  const dying = TankLoopParams({ ...base, rpm: D.idleRpm * 0.4 }, A);
  ok(dying.engine.gains[0] < idle.engine.gains[0] && dying.engine.rates[0] < idle.engine.rates[0], "stalling engine sinks in level and pitch");

  const Sq = (w) => w.reduce((s, x) => s + x * x, 0);
  for (const d of [0, 20, 40, 60, 85, 110, 200]) ok(Math.abs(Sq(CannonLayerWeights(d, A)) - 1) < 1e-9, `cannon layers equal-power at ${d} m`);
  ok(CannonLayerWeights(10, A)[0] === 1 && CannonLayerWeights(200, A)[2] === 1 && CannonLayerWeights(60, A)[1] > 0.99, "near / mid / far land on the right recordings");

  const from = { x: 0, y: 2, z: 0 }, at = { x: 0, y: 1, z: -60 };
  const pass = ShellPassPoint(from, at, { x: 3, y: 1.6, z: -30 }, 0.17, A);
  ok(pass && Math.abs(pass.t - 0.085) < 0.01 && pass.miss < 3.2, "a shell flying 3 m past the listener gets a pass-by at the closest point");
  ok(!ShellPassPoint(from, at, { x: 0.5, y: 1.6, z: -59 }, 0.17, A), "a shell landing at the listener's feet is not a pass-by");
  ok(!ShellPassPoint(from, at, { x: 15, y: 1.6, z: -30 }, 0.17, A), "15 m off the line: no pass-by");
  ok(!ShellPassPoint(from, at, { x: 2, y: 1.6, z: 10 }, 0.17, A), "listener behind the muzzle: no pass-by");

  // 假引擎：只记 Play / MoveVoice / StopVoice。
  const fake = { ctx: {}, disposed: false, listenerPos: { x: 0, y: 1.6, z: 0 }, played: [], moved: 0, stopped: 0,
    SourceZone: () => "open",
    Play(name, opts) {
      this.played.push({ name, opts });
      const v = { name, nodes: [1, 2], distance: 0, effectiveGain: 0.5, calls: [] };
      if (["tankEngine", "tankTracks", "tankTurret"].includes(name)) v.SetTank = (p, tau) => v.calls.push({ p, tau });
      return v;
    },
    MoveVoice() { this.moved++; return true; },
    StopVoice(v) { v.nodes = []; this.stopped++; return true; },
  };
  const s = new TankAudio(fake, A, D);
  for (let i = 0; i < 60; i++) s.Offstage(1 / 30, { x: 0, y: 0, z: -120 });
  ok(s.State().liveLoops === 1 && s.loops.tankEngine && !s.loops.tankTracks, "03 offstage: only the engine idles behind the ridge");
  ok(s.loops.tankEngine.calls[0].tau === 0, "first SetTank is immediate (no slide from the audition default)");
  ok(s.fadeIn > 0.35 && s.fadeIn < 0.45, `offstage engine fades in over ${A.offstageFadeInS} s (2 s → ${s.fadeIn.toFixed(2)})`);
  const T = (over = {}) => ({ x: 0, z: -40, groundY: 0, rpm: D.idleRpm, load: 0, speed: 0, pivotRate: 0, turretRate: 0, cranking: false, damageState: "Intact", ...over });
  s.Update(1 / 60, T({ speed: 2, rpm: 1400, load: 0.8 }));
  ok(s.State().liveLoops === 3 && fake.played.filter((p) => p.name === "tankEngine").length === 1, "in view: ≤ 3 resident loops, the engine voice is the same one (no restart)");
  ok(fake.played.every((p) => !["tankEngine", "tankTracks", "tankTurret"].includes(p.name) || p.opts.priority), "resident loops are priority (never stolen)");
  s.Update(1 / 60, T({ turretRate: 0.26, cranking: true }));
  const crankCall = s.loops.tankTurret.calls.at(-1);
  s.Update(1 / 60, T({ turretRate: 0, cranking: false }));
  const stopCall = s.loops.tankTurret.calls.at(-1);
  ok(crankCall.p.gains[0] > 0.5 && stopCall.p.gains[0] === 0 && stopCall.tau <= 0.06, "crank stops within 60 ms of the turret stopping (the telegraph)");
  fake.played.length = 0;
  s.OnCannon({ x: 0, y: 2, z: -40 }, { x: 0, y: 1, z: 20 }, 0.18);
  const layers = fake.played.filter((p) => p.name.startsWith("tankCannon")).map((p) => p.name);
  ok(layers.length === 2 && layers.includes("tankCannon") && layers.includes("tankCannonMid"), `40 m away: near + mid layers (${layers.join(",")})`);
  ok(fake.played.some((p) => p.name === "gunTailOpenMg" && p.opts.pitch < 1), "cannon gets a pitched-down zone tail");
  ok(s.pending.length === 1, "shell through the listener's lane schedules a pass-by");
  s.Update(0.2, T());
  ok(fake.played.some((p) => p.name === "tankShellPass"), "pass-by plays once its time comes");
  fake.played.length = 0;
  s.OnEvent("halt", { x: 0, y: 0, z: -40 }); s.OnEvent("start", { x: 0, y: 0, z: -40 });
  ok(fake.played.filter((p) => p.name === "tankTrackSqueal").length === 1, "track squeal is throttled");
  s.OnBulletHit({ x: 0, y: 1, z: -40 }); s.OnBulletHit({ x: 0, y: 1, z: -40 });
  ok(fake.played.filter((p) => p.name === "tankArmorPing").length === 1, "armor ping throttled inside one burst");
  s.OnBark("visionSlit", { x: 0, y: 1.8, z: -40 });
  ok(fake.played.some((p) => p.name === "tankHatch" && p.opts.pitch > 1), "vision slit shuts with a small clack");
  s.OnState("MobilityKill", { x: 0, y: 0, z: -40 });
  ok(!fake.played.some((p) => p.name === "tankStall"), "tracks cut: engine keeps running");
  s.OnState("Disabled", { x: 0, y: 0, z: -40 });
  ok(fake.played.some((p) => p.name === "tankStall") && fake.played.some((p) => p.name === "tankTurretJam"), "disabled: stall + turret jam");
  for (let i = 0; i < 30 * 12; i++) s.Update(1 / 30, T({ rpm: 0, damageState: "Disabled" }));
  ok(s.State().liveLoops === 0, "loops released after the stall");
  ok(fake.played.filter((p) => p.name === "tankCoolTick").length >= 2, "cooling ticks after the engine dies");
  s.Stop();
  ok(s.State().liveLoops === 0 && s.pending.length === 0, "Stop clears everything");

  // 素材：清单、文件、循环区间、配方名三方对齐。
  const here = path.dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "Audio/Sfx/Data_SfxManifest.json"), "utf8"));
  for (const e of TANK_SFX) {
    const entry = manifest.cues[e.cue];
    ok(entry && JSON.stringify(entry.files) === JSON.stringify(TankSfxFiles(e)), `${e.cue} registered in the SFX manifest`);
    ok(SOUND_NAMES.includes(e.cue), `${e.cue} has a synth fallback recipe (samples can override it)`);
    for (const f of entry.files) ok(fs.existsSync(path.join(here, "Audio/Sfx", f)), `${f} exists`);
    if (e.loop) ok(entry.loopSpans?.length === e.files.length && entry.loopSpans.every(([a, b]) => a > 0.05 && b > a + 1), `${e.cue} carries loop spans`);
  }
  ok(TANK_SFX.filter((e) => e.loop).length <= 3, "contract §6: at most 3 resident tank loops");
}

console.log(`PASS FirstLevelTankBrain: ${checks} checks (drive, telegraph, targeting, scatter, MG walk-in, dead zone, reactions, escorts, two-stage damage, 03→05 temp path, breakable cover, tank audio)`);
