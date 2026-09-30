// ===========================================================================
// Script_FirstLevelBridgeFarBank.mjs —— 18 北沙河对岸的日军步坦部队（零 three，node 里可直接 import）
//
// 用户 2026-09-30：「在最后撤离炸桥的过程中，河对岸还是有比较大量的步坦部队的，只是暂时没有桥过不来
// （参考 COD5 第一关的结尾），然后脱离战场后才黑幕进入下一幕。」
// 口径、时间线、分档与数值出处：docs/Data_FirstLevelBridgeFarBank.md。名册与摆位 Data_FirstLevelBridgeFarBank.mjs，
// 数值 Data_Tuning_FirstLevelEnd.END_TUNING.farBank。
//
// 三层兵力（同屏日军总数 ≤ END_TUNING.farBank.ijaCap）：
//   real      真战斗 AI（BridgeWithdraw 放出，会还击）。**不进 r.enemies**：FireWindows 每拍会重置 r.enemies 里的开火开关，
//             Threatens / FireBroken / BlastZoneOccupant 也不该看见他们。开火权按玩家离北岸的距离分档：
//             contact 档只有机枪手轮换真开火、其余只压制，mid 及更远全体只压制（missionFireHold / missionFireSuppressOnly）。
//   scripted  脚本兵：scriptedNoncombatant + 环境射击（ambientFirePoints，命中恒 false）。岸线射击、待命踱步、
//             前锋上桥、冲桥组、补员都是这一层。同时有授权点的最多 ambientMax 人，轮换。
//   tanks     傀儡八九式：运动学开进、转炮塔、炮击（FireShell feedbackOnly，零伤害）与机枪曳光（damageScale 0）。
//             不进 03–05 的战车运行时（r.tank 是单例）；碰撞盒 tag 是 farBankTank，不触发 tankRuntime.OnBulletHit。
//
// 宿主接口（运行时 / 替身宿主都要有）：r.time / r.player / r.squad / r.extras.State() / r.ai.Spawn|Remove|SetStance|CountSide? /
// r.MoveActor / r.Defend / r.InstallSentry? / r.Point / r.Has / r.Record / r.combat.FireShell|PredictShellImpact? /
// r.FireVehicleBullet? / r.BlocksSight? / r.camera? / r.enemies。deps 可选：vec(x,y,z)（要 three 的 Vector3 才能喂 Kill /
// FireShell）、muzzle(tank, kind)、tankCollider(tank)、sound（TankAudio）。
// ===========================================================================
import { END_TUNING } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { TANK } from "./Data_Tuning_Tank.mjs";
import {
  FAR_BANK_REAL, FAR_BANK_REAL_SPAWN_BACK_M, FAR_BANK_SHORE_A, FAR_BANK_SHORE_B, FAR_BANK_STANDBY, FAR_BANK_VANGUARD, FAR_BANK_CROWD,
  FAR_BANK_RUSH, FarBankRushSlot, FAR_BANK_FIRE_POINTS, FAR_BANK_FIRE_LISTS, FAR_BANK_TANKS, FAR_BANK_SHELL_SPOTS,
  FAR_BANK_REINFORCE, FAR_BANK_PLAYER_ROUTE_KEYS, FAR_BANK_BLAST, FarBankShoreZ, FarBankPoint,
  FarBankTankPostZ, FarBankTankPushZ, FarBankTankVia,
} from "./Data_FirstLevelBridgeFarBank.mjs";
import { FarBankCrowd } from "./Script_FirstLevelFarBankCrowd.mjs";

const T = END_TUNING.farBank;
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const AngleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** 点到线段的水平距离。 */
function SegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? Clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}
/** 点到折线的最短水平距离。 */
export function RouteDistance(point, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) best = Math.min(best, SegmentDistance(point, route[i - 1], route[i]));
  return best;
}
const PLAYER_ROUTES = Object.freeze(FAR_BANK_PLAYER_ROUTE_KEYS.map((key) => MISSION_STAGE_ROUTES[key]));

/** 确定性随机（测试与实机都不靠 Math.random，出图与回归可复现）。 */
function Rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * 玩家离北岸的距离分档。dz = 玩家 z − 北岸岸沿 z。
 * contact（< tierM[0]）→ mid → far → out（≥ tierM[2]）。
 */
export function FarBankTier(dz, tiers = T.tierM) {
  if (!(dz >= tiers[0])) return "contact";
  if (dz < tiers[1]) return "mid";
  if (dz < tiers[2]) return "far";
  return "out";
}
export const FarBankPlayerDz = (player) => player.z - FarBankShoreZ(player.x);

/**
 * 一个炮击落点安全不安全：离玩家 ≥ minPlayerM、离每个己方 ≥ friendlyM、离玩家要走的路线 ≥ routeM。
 * 纯函数（测试直接调）。返回 null = 安全，否则是被哪条规则挡的。
 */
export function ShellSpotVerdict(spot, { player, friendlies = [], minPlayerM, friendlyM = T.shellFriendlyM, routeM = T.shellRouteM, routes = PLAYER_ROUTES }) {
  if (Distance(spot, player) < minPlayerM) return "player";
  for (const f of friendlies) if (Distance(spot, f) < friendlyM) return "friendly";
  for (const route of routes) if (RouteDistance(spot, route) < routeM) return "route";
  return null;
}

/**
 * 走进来的路（没有导航网格，AI 只会朝目标直走、顶到东西就卡）：所有人都先沿桥轴从北面走下来 ——
 * 桥轴 x −77 两侧是 R1a 北岸土坎的缺口（BridgeNorthRidge 两段之间），北边一路没有院子、村子与前沿壕沟（RearFarm 院子在
 * x −72.5…−59.5，前沿交通壕的尾巴在 x −58…−30，北岸西侧村子在 x −143…−102）；走到自己岸线位那一排的 z，再横着走过去。
 * 岸线上（z ≥ 岸沿−8）的人要穿过两段土坎之间的缺口（先到岸沿−5）再横走。纯函数，测试逐条量净空。
 */
// 土坎与缺口是绝对坐标（BridgeNorthRidge 两段 z 81.6…82.8，缺口在桥轴两侧）：河岸沿（R1a 让它随 x 起伏）不能拿来算。
const GATE_Z = () => FarBankShoreZ(AXIS_X) - 4.5;      // 缺口出口：土坎南脸之南 2.7 m（z 85.5）
const NORTH_Z = () => FarBankShoreZ(AXIS_X) - 12;       // 土坎北面走廊：北脸之北 3.6 m（z 78）
const RIDGE_SOUTH_Z = () => FarBankShoreZ(AXIS_X) - 8.5; // 位置 z 不小于它的算「岸线上」（土坎南面）
export function FarBankWalkInVia(post) {
  // 岸线上的人：走下缺口到 z 85.5，再沿这一排横着走到他那一列；土坎后面的人（真 AI、待命兵）：在北面走到自己那一排的 z（最多 78）再横着走。
  if (post.z >= RIDGE_SOUTH_Z()) return [{ x: AXIS_X, z: GATE_Z() }, { x: post.x, z: GATE_Z() }];
  return [{ x: AXIS_X, z: Math.min(post.z, NORTH_Z()) }];
}
/** 从桥轴缺口（z 85.5）出发到某个岸线位的路（退回岸边用；WalkInVia 去掉前面那段下坡）。 */
export function FarBankBankVia(post) {
  if (post.z >= RIDGE_SOUTH_Z()) return [{ x: post.x, z: GATE_Z() }];
  return [{ x: AXIS_X, z: Math.min(post.z, NORTH_Z()) }];
}
/** 第 n 个走进来的人的出生点：桥轴上往北 back 米，左右错开一点（±3.2 m）。 */
export function FarBankSpawnAt(n, back) {
  return { x: AXIS_X + ((n % 5) - 2) * 1.6, z: FarBankShoreZ(AXIS_X) - back };
}
const FIRE_LIST_CACHE = new Map();
/** 授权点表（带 id、冻结、同一 key 同一份引用：大脑按引用判断「换没换」）。 */
export function FarBankFireList(key) {
  if (FIRE_LIST_CACHE.has(key)) return FIRE_LIST_CACHE.get(key);
  const ids = FAR_BANK_FIRE_LISTS[key];
  if (!ids) throw new Error(`FarBank: unknown fire list ${key}`);
  const list = Object.freeze(ids.map((id) => {
    const p = FAR_BANK_FIRE_POINTS[id];
    if (!p) throw new Error(`FarBank: unknown fire point ${id}`);
    return Object.freeze({ id, x: p.x, z: p.z, h: p.h, r: p.r });
  }));
  FIRE_LIST_CACHE.set(key, list);
  return list;
}
const SCRIPTED_KINDS = new Set(["shore", "standby", "vanguard", "rush", "reinforce"]);
const AXIS_X = FAR_BANK_BLAST.bridgeAxisX;
const FAR_BANK_ENTER_STEPS = new Set(["BridgeOrders", "BridgeCover", "BridgeWithdraw", "NightMarch"]);
/** 南岸水线 z：活着的日军越过它就是过了河（桥轴 x 上的 RiverWaterAt.z1，拓宽段外退回原断面）。 */
const RIVER_SOUTH_Z = FAR_BANK_BLAST.waterSouthZ;

function InView(camera, point, marginDeg = 8) {
  const e = camera?.matrixWorld?.elements;
  if (!e) return false;
  const dx = point.x - e[12], dy = (point.y ?? 0) - e[13], dz = point.z - e[14];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return true;
  const fx = -e[8], fy = -e[9], fz = -e[10], flen = Math.hypot(fx, fy, fz) || 1;
  const vHalf = ((Number.isFinite(camera.fov) ? camera.fov : 70) * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * (Number.isFinite(camera.aspect) ? camera.aspect : 16 / 9));
  return (dx * fx + dy * fy + dz * fz) / (len * flen) >= Math.cos(Math.min(Math.PI, Math.max(vHalf, hHalf) + (marginDeg * Math.PI) / 180));
}

export class FirstLevelFarBank {
  constructor(runtime, deps = {}) {
    this.r = runtime;
    this.deps = deps;
    this.vec = deps.vec || ((x, y, z) => ({ x, y, z }));
    this.Reset();
  }
  Reset() {
    this.Clear();
    // 纯视觉的远景人群（规模感，docs §10）：不占 actorPool；枪口焰 / 曳光朝南岸授权点里的岸边与堤顶点打。
    this.crowd?.Dispose?.();
    const targetsOf = (key) => FarBankFireList(key).filter((p) => !/^(deck|pier|axis)/.test(p.id));
    this.crowd = new FarBankCrowd({ ground: (x, z) => this.Ground(x, z), targets: { west: targetsOf("west"), east: targetsOf("east") } });
    this.t = 0;
    this.step = null;
    this.started = false;
    this.startedAt = 0;
    this.units = [];
    this.byId = new Map();
    this.pending = [];
    this.tanks = [];
    this.rnd = Rng(0x18F4B);
    this.phase = "idle";      // idle → gather → withdraw → halted → retired
    this.tier = "contact";
    this.dz = 0;
    this.blast = null;         // { at, killed, prone, done }
    this.rush = null;          // { goAt, arrivedAt, settled, waitedS }
    this.vanguardSent = false; this.vanguardBack = false;
    this.withdrawBegun = false;
    this.ambientAt = -99; this.ambientCursor = 0; this.flagsAt = -99; this.reinforceAt = -99; this.reinforced = 0;
    this.shell = { lastAt: -99, lastNearAt: -99, cursor: 0, fired: 0, withheld: 0, minPlayerM: Infinity, minFriendlyM: Infinity, aborted: 0, log: [] };
    this.mg = { bursts: 0, rounds: 0 };
    this.out = { blindS: 0, seen: false, hidden: false, recorded: false, dz: 0 };
    this.bank = { southBank: 0, overNow: 0, southZ: -Infinity, overAfterSettle: 0 };
    this.southBankAt = null;
    this.counts = { spawned: 0, deadByPlayer: 0, blastKilled: 0, removed: 0 };
    this.retired = false;
  }
  /** 撤掉所有单位（重来 / 回跳 / Dispose）。 */
  Clear() {
    for (const u of this.units || []) this.Remove(u);
    this.units = []; this.byId = new Map(); this.pending = []; this.tanks = [];
  }

  // -------------------------------------------------------------------------
  // 宿主口
  // -------------------------------------------------------------------------
  Enter(step) {
    // 18 之外的步骤（含回跳到 18 以前）：对岸整个撤掉；Complete 沿用黑屏里已经撤走的状态。
    if (!FAR_BANK_ENTER_STEPS.has(step)) { if (step !== "Complete" && (this.started || this.units.length || this.retired)) this.Reset(); return; }
    if (this.retired && step !== "BridgeOrders") return;
    this.step = step;
    if (step === "BridgeOrders") { this.Reset(); return; }
    if (step === "BridgeCover") this.Start(false);
    if (step === "BridgeWithdraw") { this.Start(true); this.BeginWithdraw(); }
    if (step === "NightMarch") this.phase = this.started ? "halted" : this.phase;
  }
  /** 黑屏里对岸单位全部收走（PlaceNightArrival 调）。 */
  Retire() {
    this.Clear();
    this.crowd.Retire();
    this.retired = true; this.phase = "retired";
  }
  /** 玩家阵亡重来：分档计时清零（单位不动，重来点仍在同一步骤里）。 */
  OnRetry() {
    this.out.blindS = 0; this.flagsAt = -99; this.ambientAt = -99;
  }

  /** 起爆之前的最后一道闸（Bridge.UpdateWithdraw 在按起爆器前问）：冲桥组到位、玩家看一眼，才放行。 */
  ReadyForBlast(dt) {
    const rush = this.rush;
    if (!rush || this.retired) return true;
    const alive = this.RushUnits().filter((u) => u.actor?.alive);
    if (!alive.length) return true;
    rush.waitedS += dt;
    const arrived = alive.every((u) => u.mode === "rushed");
    if (arrived && rush.arrivedAt == null) rush.arrivedAt = this.t;
    if (rush.arrivedAt != null && this.t - rush.arrivedAt >= T.rushSettleS) { rush.settled = true; return true; }
    if (rush.waitedS >= T.rushWaitMaxS) { rush.settled = true; rush.timedOut = true; return true; }
    return false;
  }

  /** 起爆那一刻（Bridge.Fire 调）：kill 排在 0.25 s 之后（火球先起）。 */
  OnBridgeBlast() {
    if (this.blast || this.retired) return;
    this.blast = { at: this.t, killed: 0, prone: 0, done: false };
    this.crowd.OnBridgeBlast();
  }
  RushUnits() { return this.units.filter((u) => u.rushSlot != null); }

  // -------------------------------------------------------------------------
  // 开局与放兵
  // -------------------------------------------------------------------------
  Start(instant) {
    if (this.started) return;
    this.started = true; this.startedAt = this.t; this.phase = "gather";
    this.crowd.Start(instant);
    const stagger = T.waveStaggerS;
    let n = 0;
    const walkIn = (spec, kind, extra = {}) => {
      const back = 100 + (n % 5) * 6;
      this.Queue(spec, kind, { at: instant ? { x: spec.x, z: spec.z } : FarBankSpawnAt(n, back), via: instant ? null : FarBankWalkInVia(spec),
        delay: instant ? 0 : n * stagger, post: { x: spec.x, z: spec.z }, ...extra });
      n += 1;
    };
    for (const spec of FAR_BANK_SHORE_A) walkIn(spec, "shore");
    FAR_BANK_STANDBY.forEach((spec, index) => walkIn(spec, "standby", { alt: spec.to, rushSlot: FAR_BANK_RUSH.assign.indexOf(index) }));
    // 坦克：T1、T2 起步在放兵之后不久；T3 等 bridgeFireBroken。
    FAR_BANK_TANKS.forEach((spec, index) => this.tanks.push(this.MakeTank(spec, index, instant)));
  }
  MakeTank(spec, index, instant) {
    const shore = FarBankShoreZ(spec.x);
    const post = { x: spec.x, z: FarBankTankPostZ(spec) };
    const pushGoal = { x: spec.x, z: FarBankTankPushZ(spec) };
    const route = instant ? [] : FarBankTankVia(spec);
    const tank = {
      id: spec.id, spec, index, x: instant ? spec.x : (spec.startX ?? spec.x), z: instant ? post.z : shore - T.tankStartBackM, hullYaw: Math.PI, turretYaw: Math.PI,
      gunPitch: 0.03, recoil: 0, speed: 0, pivotRate: 0, rpm: 0, load: 0, hullPitch: 0,
      state: "queued", startAt: Infinity, route, post, pushGoal, pushed: false, visible: false,
      aim: { x: FAR_BANK_BLAST.centre.x, z: FAR_BANK_BLAST.centre.z + 20 }, pending: null,
      nextShellAt: 0, nextMgAt: 0, mgLeft: 0, mgAt: 0, shots: 0, mgBursts: 0, muzzleFlashAt: -99,
    };
    if (spec.enter === "BridgeCover") tank.startAt = this.t + (instant ? 0 : index * T.tankStaggerS);
    if (instant) { tank.state = "posted"; tank.visible = true; tank.startAt = this.t; }
    return tank;
  }
  BeginWithdraw() {
    if (this.withdrawBegun || this.retired) return;
    this.withdrawBegun = true; this.phase = "withdraw"; this.withdrawAt = this.t;
    const r = this.r;
    // 己方桥头人员与已过桥尾队：对岸真 AI 不把他们当目标（爆破手被隔河打死，桥就永远炸不了）。
    for (const entry of r.extras?.State?.() || []) {
      if (!/^(BridgeOfficer|BridgeDemolition|RearColumn)/.test(entry.id)) continue;
      const actor = r.extras.Actor?.(entry.id);
      if (actor) actor.missionUntargetable = true;
    }
    // 第二拨：岸线补 6 个、真 AI 8 个，从视线外走进来。
    let n = 0;
    const late = (spec, kind, extra = {}) => {
      const back = FAR_BANK_REAL_SPAWN_BACK_M + (n % 4) * 5;
      this.Queue(spec, kind, { at: FarBankSpawnAt(n, back + (kind === "shore" ? 20 : 0)), via: FarBankWalkInVia(spec),
        delay: 0.4 + n * 0.7, post: { x: spec.x, z: spec.z }, ...extra });
      n += 1;
    };
    for (const spec of FAR_BANK_REAL) late(spec, "real");
    // 第二拨的岸线补拨兵直接编进桥头人堆（FAR_BANK_CROWD）：出生后一路小跑上桥，不先站岸线。
    for (const spec of FAR_BANK_SHORE_B) late(spec, "shore", { crowd: FAR_BANK_CROWD.find((c) => c.from === spec.id) || null });
    // 冲桥组：靠桥轴的六个待命兵（若哪个还没走到岸边，等他到）。rushDelayS 后起跑。
    this.rush = { goAt: this.t + T.rushDelayS, arrivedAt: null, settled: false, waitedS: 0, started: false, timedOut: false };
    // 坦克推到岸边。
    for (const tank of this.tanks) {
      if (tank.state === "queued" && tank.spec.enter === "BridgeCover") { tank.startAt = this.t; }
      tank.pushed = true;
      if (tank.state === "posted") tank.state = "push";
    }
    const third = this.tanks.find((tank) => tank.spec.enter === "bridgeFireBroken");
    if (third && third.state === "queued") third.startAt = this.t;
  }

  // -------------------------------------------------------------------------
  // 单位
  // -------------------------------------------------------------------------
  Queue(spec, kind, opts) {
    this.pending.push({ spec, kind, due: this.t + (opts.delay || 0), ...opts });
  }
  IjaCount() {
    const r = this.r;
    if (typeof r.ai?.CountSide === "function") return r.ai.CountSide("ija");
    return this.units.filter((u) => u.actor?.alive).length;
  }
  SpawnNow(p) {
    const r = this.r, spec = p.spec;
    const real = p.kind === "real";
    const actor = r.ai.Spawn("ija", p.at.x, p.at.z, { weapon: spec.weapon || "Type38", squadId: `Mission_farBank_${p.kind}` });
    if (!actor) return false;
    r.InstallSentry?.(actor);
    actor.missionId = spec.id; actor.missionEncounter = real ? "bridgeFarBank" : "farBank"; actor.farBank = p.kind;
    actor.manualGoalUntil = Infinity;
    actor.reactionGroup = "farBank";
    actor.grenades = 0;
    if (real) {
      // 真 AI：与 SpawnEncounterActor 的守区兵同一套口径（命中系数 .5、射击间隔 ×1.45），到位后 Defend 成守区；
      // 开火权由 ApplyFlags 每拍按分档写。
      actor.scriptedNoncombatant = true;
      actor.missionAccuracyScale = actor.scriptAccuracyScale = 0.5;
      actor.missionFireIntervalScale = actor.scriptFireIntervalScale = 1.45;
      actor.missionFireHold = true; actor.missionFireSuppressOnly = true;
    } else {
      actor.scriptedNoncombatant = true;
      actor.missionUntargetable = true;   // 班里人不隔河点名（玩家照样打得到他们）
    }
    const unit = { id: spec.id, kind: p.kind, spec, actor, mode: "walk", goal: p.post, post: p.post, alt: p.alt || null, via: p.via ? p.via.map((v) => ({ ...v })) : null,
      rushSlot: Number.isInteger(p.rushSlot) && p.rushSlot >= 0 ? p.rushSlot : null, bornAt: this.t, stance: (this.units.length % 2) ? 0 : 1,
      fireKey: this.FireKeyFor(p.post.x), hopAt: this.t + T.standbyHopS * (0.6 + this.rnd()), fireList: null, deadAt: null, proneUntil: 0 };
    if (p.crowd) this.AssignCrowd(unit, p.crowd);
    this.units.push(unit); this.byId.set(unit.id, unit);
    this.counts.spawned += 1;
    if (p.at.x === p.post.x && p.at.z === p.post.z) this.Arrive(unit);   // 阶段跳转：直接摆在射位
    return true;
  }
  FireKeyFor(x) { return x < AXIS_X - 6 ? "west" : x > AXIS_X + 6 ? "east" : "deck"; }
  Remove(unit) {
    if (unit?.actor && !unit.removed) { unit.removed = true; this.r.ai?.Remove?.(unit.actor); this.counts.removed += 1; }
    if (unit) this.byId?.delete?.(unit.id);
  }
  /** 停在这儿：守区 + order hold + 没有剧本速度（大脑的 WatchScripted 认这三条才给戒备姿态）。 */
  HoldAt(actor, point, stance) {
    if (actor.order === "hold" && actor.holdZone && Distance(actor.holdZone, point) < 0.05) return;
    actor.p012Guided = false;
    delete actor.scriptMoveSpeedMps;
    actor.order = "hold";
    actor.holdZone = { id: `FarBank_${actor.missionId}`, x: point.x, z: point.z, radius: 0.6 };
    actor.goal.set(point.x, 0, point.z);
    this.r.ai.SetStance(actor, stance, 1.2, true);
  }
  Arrive(unit) {
    const a = unit.actor;
    unit.mode = "post";
    if (unit.kind === "real") {
      a.scriptedNoncombatant = false;
      this.r.Defend(a, unit.post, 1.5, R.defendCoverSlackM);
      this.r.ai.SetStance(a, 1, 1.5, true);
    } else this.HoldAt(a, unit.post, unit.stance);
  }
  Speed(unit) { return unit.kind === "reinforce" ? T.dashMps : unit.mode === "rush" ? T.rushMps : unit.dash ? T.dashMps : T.marchMps; }

  UpdateUnit(unit, dt) {
    const r = this.r, a = unit.actor;
    if (!a) return;
    if (!a.alive) {
      if (unit.deadAt == null) {
        unit.deadAt = this.t; unit.mode = "dead";
        if (!unit.blastKilled) this.counts.deadByPlayer += 1;
      }
      const keep = unit.blastKilled ? T.corpseRemoveS : T.deadKeepS;
      if (this.t - unit.deadAt >= keep && !unit.removed) this.Remove(unit);
      return;
    }
    if (unit.mode === "prone") {
      if (this.t < unit.proneUntil) { r.ai.SetStance(a, 2, 0.4, true); return; }
      // 趴完了：没被炸死的（冲桥组后排、前锋）回岸边
      this.GoHome(unit);
    }
    if (unit.mode === "walk") {
      // 途经点（从桥面退回岸边要先走出北桥台的空气墙缺口，直线斜插会顶在桁架与空气墙上）
      while (unit.via?.length && Distance(a.position, unit.via[0]) < 1.6) unit.via.shift();
      const goal = unit.via?.length ? unit.via[0] : unit.goal;
      if (!unit.via?.length && Distance(a.position, unit.goal) < 1.0) {
        if (unit.goal === unit.bankPost) unit.post = unit.goal;   // 退回岸边的人以后就站这儿
        this.Arrive(unit);
        return;
      }
      a.ambientFirePoints = null; a.ambientFirePoint = null;
      r.ai.SetStance(a, 0, 0.4, true);
      r.MoveActor(a, goal, this.Speed(unit));
      return;
    }
    if (unit.mode === "rush") { this.UpdateRush(unit); return; }
    if (unit.mode === "crowd") { this.UpdateCrowd(unit); return; }
    if (unit.mode === "vanguard") { this.UpdateVanguard(unit); return; }
    if (unit.mode === "post" || unit.mode === "rushed" || unit.mode === "vanguarded" || unit.mode === "crowded") {
      if (unit.mode === "post") this.HoldAt(a, unit.post, unit.stance);
      else r.ai.SetStance(a, unit.mode === "crowded" ? 1 : 2, 0.5, true);      // 桥面上的趴 / 跪着打（SetStance 只管 0.5 s，每帧续）
      // 待命兵在两个点之间踱
      if (unit.kind === "standby" && unit.mode === "post" && unit.alt && this.t >= unit.hopAt && !this.rush?.started) {
        unit.hopAt = this.t + T.standbyHopS * (0.7 + this.rnd() * 0.6);
        const swap = unit.post; unit.post = unit.alt; unit.alt = swap; unit.goal = unit.post; unit.mode = "walk"; unit.dash = false;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 冲桥组与前锋
  // -------------------------------------------------------------------------
  StartRush() {
    const rush = this.rush;
    rush.started = true;
    for (const [index, unitIndex] of FAR_BANK_RUSH.assign.entries()) {
      const spec = FAR_BANK_STANDBY[unitIndex], unit = spec && this.byId.get(spec.id);
      if (!unit || !unit.actor?.alive) continue;
      const slot = FarBankRushSlot(index);
      unit.rushSlot = index; unit.slot = slot; unit.mode = "rush"; unit.kind = "rush";
      unit.route = [{ x: slot.lane, z: NORTH_Z() }, { x: slot.lane, z: FAR_BANK_RUSH.deckStartZ }, { x: slot.lane, z: slot.endZ }];
      unit.routeIndex = 0; unit.fireKey = "rush";
    }
  }
  UpdateRush(unit) {
    const a = unit.actor, r = this.r, route = unit.route;
    const goal = route[unit.routeIndex];
    if (Distance(a.position, goal) < (unit.routeIndex === route.length - 1 ? 1.6 : 1.8)) {
      if (unit.routeIndex < route.length - 1) { unit.routeIndex += 1; return; }
      unit.mode = "rushed"; unit.post = goal;
      a.p012Guided = false; delete a.scriptMoveSpeedMps;
      a.order = "hold"; a.holdZone = { id: `FarBank_${a.missionId}`, x: goal.x, z: goal.z, radius: 0.5 };
      a.goal.set(goal.x, 0, goal.z);
      r.ai.SetStance(a, 2, 1.2, true);
      return;
    }
    a.ambientFirePoints = null; a.ambientFirePoint = null;
    r.ai.SetStance(a, 0, 0.4, true);
    r.MoveActor(a, goal, T.rushMps);
  }
  /** 回岸边：在桥面 / 桥台一带的人先沿车道走到桥台外沿再出缺口，其余直接回自己的岸线位。 */
  GoHome(unit) {
    const a = unit.actor, shore = FarBankShoreZ(a.position.x);
    unit.bankPost = unit.bankPost || this.BankPostFor(unit);
    unit.goal = unit.bankPost; unit.mode = "walk"; unit.dash = true; unit.via = null;
    unit.fireKey = this.FireKeyFor(unit.bankPost.x);
    if (Math.abs(a.position.x - AXIS_X) <= 6 && a.position.z > shore - 2) {
      const lane = Clamp(a.position.x, FAR_BANK_RUSH.lanes[0], FAR_BANK_RUSH.lanes[1]);
      // 桥面 → 桥台外沿 → 缺口出口（岸沿−4.5）→ 沿岸线横走 / 绕到土坎后面
      unit.via = [{ x: lane, z: Math.min(a.position.z, FAR_BANK_RUSH.deckStartZ) }, { x: lane, z: GATE_Z() }, ...FarBankBankVia(unit.bankPost)];
    } else if (a.position.z >= RIDGE_SOUTH_Z() && unit.bankPost.z < RIDGE_SOUTH_Z()) unit.via = [{ x: AXIS_X, z: GATE_Z() }, ...FarBankBankVia(unit.bankPost)];
  }
  /** 桥头人堆：出生（或从待命位）之后沿 (车道, 岸沿−4) → 桥台外沿 → 车道上的位置，一路小跑上桥，到位单膝跪着打。 */
  AssignCrowd(unit, c) {
    unit.crowdPost = { x: c.lane, z: c.z };
    unit.bankPost = unit.bankPost || { ...unit.post };
    unit.route = [{ x: c.lane, z: NORTH_Z() }, { x: c.lane, z: FAR_BANK_RUSH.deckStartZ }, { x: c.lane, z: c.z }];
    unit.routeIndex = 0; unit.mode = "crowd"; unit.fireKey = "rush"; unit.dash = true;
  }
  StartCrowd() {
    this.crowdStarted = true;
    for (const c of FAR_BANK_CROWD) {
      const unit = this.byId.get(c.from);
      if (unit?.actor?.alive && !unit.crowdPost && unit.kind !== "real") this.AssignCrowd(unit, c);
    }
  }
  UpdateCrowd(unit) {
    const a = unit.actor, r = this.r, route = unit.route, goal = route[unit.routeIndex];
    if (Distance(a.position, goal) < (unit.routeIndex === route.length - 1 ? 1.6 : 1.8)) {
      if (unit.routeIndex < route.length - 1) { unit.routeIndex += 1; return; }
      unit.mode = "crowded"; unit.post = goal;
      a.p012Guided = false; delete a.scriptMoveSpeedMps;
      a.order = "hold"; a.holdZone = { id: `FarBank_${a.missionId}`, x: goal.x, z: goal.z, radius: 0.5 };
      a.goal.set(goal.x, 0, goal.z);
      r.ai.SetStance(a, 1, 1.2, true);
      return;
    }
    a.ambientFirePoints = null; a.ambientFirePoint = null;
    r.ai.SetStance(a, 0, 0.4, true);
    r.MoveActor(a, goal, T.rushMps);
  }
  SendVanguard() {
    this.vanguardSent = true;
    for (const v of FAR_BANK_VANGUARD) {
      const unit = this.byId.get(v.from);
      if (!unit?.actor?.alive || unit.mode === "dead") continue;
      unit.mode = "vanguard"; unit.vanguardPost = v.post; unit.bankPost = unit.post; unit.fireKey = "deck";
    }
  }
  UpdateVanguard(unit) {
    const a = unit.actor, r = this.r, goal = unit.vanguardPost;
    if (Distance(a.position, goal) < 1.6) {
      unit.mode = "vanguarded";
      a.p012Guided = false; delete a.scriptMoveSpeedMps;
      a.order = "hold"; a.holdZone = { id: `FarBank_${a.missionId}`, x: goal.x, z: goal.z, radius: 0.5 };
      a.goal.set(goal.x, 0, goal.z);
      r.ai.SetStance(a, 2, 1.2, true);
      return;
    }
    a.ambientFirePoints = null; a.ambientFirePoint = null;
    r.ai.SetStance(a, 0, 0.4, true);
    r.MoveActor(a, goal, T.rushMps);
  }
  RecallVanguard() {
    this.vanguardBack = true;
    for (const unit of this.units) {
      if (unit.vanguardPost && unit.actor?.alive && unit.mode !== "dead") this.GoHome(unit);
    }
  }

  // -------------------------------------------------------------------------
  // 起爆
  // -------------------------------------------------------------------------
  UpdateBlast() {
    const b = this.blast;
    if (!b || b.done || this.t - b.at < 0.25) return;
    b.done = true;
    const centre = FAR_BANK_BLAST.centre;
    for (const unit of this.units) {
      const a = unit.actor;
      if (!a?.alive) continue;
      const d = Distance(a.position, centre);
      const onBridge = Math.abs(a.position.x - AXIS_X) <= 2.2 && a.position.z >= FAR_BANK_BLAST.spanZ[0] - 0.5 && a.position.z <= FAR_BANK_BLAST.spanZ[1] + 0.5;
      if (d <= T.blastKillM && onBridge) {
        this.Throw(unit, centre); b.killed += 1; this.counts.blastKilled += 1;
      } else if (d <= T.blastProneM) {
        unit.mode = "prone"; unit.proneUntil = this.t + T.blastProneS; unit.bankPost = unit.bankPost || this.BankPostFor(unit); b.prone += 1;
      }
    }
    // 没被炸到的冲桥组 / 前锋，都回岸边
    for (const unit of this.units) if ((unit.rushSlot != null && unit.slot) || unit.vanguardPost || unit.crowdPost) {
      if (unit.actor?.alive && unit.mode !== "prone") {
        this.GoHome(unit);
        unit.fireKey = this.FireKeyFor(unit.bankPost.x);
      }
    }
    this.phase = "halted";
  }
  BankPostFor(unit) {
    const x = unit.post?.x ?? AXIS_X;
    const dx = x < AXIS_X ? Math.min(x, -90) : Math.max(x, -64);
    return { x: dx, z: FarBankShoreZ(dx) - 3 };
  }
  /** 近爆致死并抛起：deathPush 是尸体刚体的初速（StepCorpse 首帧消费），桥面 gate 在同一拍摘掉，人跟着落河。 */
  Throw(unit, from) {
    const a = unit.actor;
    const dx = a.position.x - from.x, dz = a.position.z - from.z, len = Math.hypot(dx, dz) || 1;
    unit.blastKilled = true;
    a.Kill(this.vec(dx / len, 0.35, dz / len), null);
    a.deathPush = { x: dx / len * T.throwOutMps, y: T.throwUpMps, z: dz / len * T.throwOutMps };
  }

  // -------------------------------------------------------------------------
  // 分档、开火权、环境射击
  // -------------------------------------------------------------------------
  UpdateTier() {
    const p = this.r.player?.position;
    if (!p) return;
    this.dz = FarBankPlayerDz(p);
    this.tier = FarBankTier(this.dz);
  }
  ApplyFlags() {
    if (this.t - this.flagsAt < 0.25) return;
    this.flagsAt = this.t;
    const contact = this.tier === "contact";
    const real = this.units.filter((u) => u.kind === "real" && u.actor?.alive);
    // contact 档轮换真开火的人：机枪手优先（90–100 m 上只有机枪手够得着，ENGAGE.supportM 95）。
    const gunners = real.filter((u) => u.spec.role === "gunner");
    const shooters = new Set((gunners.length ? gunners : real).slice(0, T.realShooters).map((u) => u.id));
    for (const u of real) {
      const a = u.actor, free = contact && shooters.has(u.id) && u.mode === "post";
      a.missionFireHold = !free;
      a.missionFireSuppressOnly = !free;
    }
  }
  ApplyAmbient() {
    if (this.t - this.ambientAt < T.ambientRotateS) return;
    this.ambientAt = this.t;
    const live = this.tier === "contact" || this.tier === "mid";
    const eligible = this.units.filter((u) => u.actor?.alive && SCRIPTED_KINDS.has(u.kind)
      && (u.mode === "post" || u.mode === "rushed" || u.mode === "vanguarded" || u.mode === "crowded"));
    for (const u of this.units) if (SCRIPTED_KINDS.has(u.kind) && u.actor?.alive && !eligible.includes(u)) { u.actor.ambientFirePoints = null; }
    if (!live || !eligible.length || this.retired) { for (const u of eligible) { u.actor.ambientFirePoints = null; u.actor.ambientFirePoint = null; } this.ambientActive = 0; return; }
    const chosen = new Set();
    const n = eligible.length, count = Math.min(T.ambientMax, n);
    for (let i = 0; i < count; i++) chosen.add(eligible[(this.ambientCursor + i) % n].id);
    this.ambientCursor = (this.ambientCursor + count) % Math.max(1, n);
    for (const u of eligible) {
      const a = u.actor;
      if (chosen.has(u.id)) {
        const list = FarBankFireList(u.fireKey);
        if (a.ambientFirePoints !== list) { a.ambientFirePoints = list; a.ambientFirePoint = null; }
      } else { a.ambientFirePoints = null; a.ambientFirePoint = null; }
    }
    this.ambientActive = chosen.size;
  }

  // -------------------------------------------------------------------------
  // 补员
  // -------------------------------------------------------------------------
  UpdateReinforce() {
    if (this.retired || this.phase === "idle" || this.t - this.reinforceAt < T.reinforceEveryS) return;
    this.reinforceAt = this.t;
    if (this.reinforced >= T.reinforceMaxTotal) return;
    const scripted = this.units.filter((u) => SCRIPTED_KINDS.has(u.kind) && u.actor?.alive).length
      + this.pending.filter((p) => SCRIPTED_KINDS.has(p.kind)).length;
    if (scripted >= T.scriptedKeepMin) return;
    if (this.IjaCount() + this.pending.length + T.reinforceBatch > T.ijaCap) return;
    const r = this.r, eye = r.player?.position;
    for (let i = 0; i < T.reinforceBatch; i++) {
      const slot = (this.reinforced + i) % FAR_BANK_REINFORCE.xs.length;
      const at = FarBankSpawnAt(this.reinforced + i, FAR_BANK_REINFORCE.backM[slot]);
      // 玩家看不见的地方出生：离玩家远（≥ hiddenSpawnM）或不在镜头里
      if (eye && Distance(at, eye) < T.hiddenSpawnM && InView(r.camera, { x: at.x, y: 1.2, z: at.z })) continue;
      const shorePost = this.FreeShorePost();
      if (!shorePost) return;
      const id = `FarBankReinforce${this.reinforced + i}`;
      this.Queue({ id, x: shorePost.x, z: shorePost.z }, "reinforce", { at, via: FarBankWalkInVia(shorePost), delay: 0, post: shorePost });
      this.reinforced += 1;
    }
  }
  /** 岸线上没人占的空位（补员站进去）：把 A/B 两拨的名册位挨个看，谁的位置 3 m 内没有活人就用谁的。 */
  FreeShorePost() {
    const spots = [...FAR_BANK_SHORE_A, ...FAR_BANK_SHORE_B];
    const taken = this.units.filter((u) => u.actor?.alive).map((u) => u.post).concat(this.pending.map((p) => p.post));
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[(this.reinforced * 5 + i) % spots.length];
      if (!taken.some((p) => Distance(p, spot) < 3)) return { x: spot.x, z: spot.z };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 战车
  // -------------------------------------------------------------------------
  Ground(x, z) { return this.r.battlefield?.GroundHeight?.(x, z) ?? 0; }
  StepTank(tank, dt) {
    if (tank.state === "queued") {
      if (this.t >= tank.startAt) { tank.state = "approach"; tank.visible = true; }
      else return;
    }
    // 路线：先走 via 里的途经点（绕开沟与院子），最后一个目标是停位（BridgeWithdraw 起换成推到岸边的位置）。
    while (tank.route.length && Distance(tank, tank.route[0]) < 1.5) tank.route.shift();
    const final = !tank.route.length, goal = tank.route[0] || (tank.pushed ? tank.pushGoal : tank.post);
    const dx = goal.x - tank.x, dz = goal.z - tank.z, dist = Math.hypot(dx, dz);
    const moving = tank.state === "approach" || tank.state === "push" || (tank.state === "posted" && dist > 0.3 && tank.pushed);
    if (moving && tank.state === "posted") tank.state = "push";
    let target = 0;
    const yawGoal = Math.atan2(-dx, -dz), headingGap = Math.abs(AngleDelta(tank.hullYaw, yawGoal));
    if (moving && dist > 0.15) target = final ? Math.min(T.tankCruiseMps, Math.sqrt(2 * 1.6 * dist) + 0.3) : T.tankCruiseMps;
    if (headingGap > 0.5) target *= 0.4;      // 车头没转过来就慢着走（不横着滑）
    tank.speed += Clamp(target - tank.speed, -1.6 * dt, 0.9 * dt);
    if (moving && dist > 0.02 && tank.speed > 0.01) {
      const step = Math.min(dist, tank.speed * dt);
      tank.x += dx / dist * step; tank.z += dz / dist * step;
      tank.pivotRate = Clamp(AngleDelta(tank.hullYaw, yawGoal), -T.tankTurnRadPerS * dt, T.tankTurnRadPerS * dt) / Math.max(dt, 1e-6);
      tank.hullYaw += tank.pivotRate * dt;
    } else {
      // 停下来才原地转：车头回到朝南（隔河对着南岸）。
      const gap = AngleDelta(tank.hullYaw, Math.PI), turn = Clamp(gap, -0.3 * dt, 0.3 * dt);
      tank.pivotRate = Math.abs(gap) > 0.01 ? turn / Math.max(dt, 1e-6) : 0;
      if (Math.abs(gap) > 0.01) tank.hullYaw += turn;
    }
    if (moving && final && dist <= 0.15 && tank.speed < 0.05) { tank.state = "posted"; tank.speed = 0; }
    tank.rpm = tank.visible ? (moving ? 1500 + tank.speed * 220 : 900) : 0;
    tank.load = moving ? Clamp(0.35 + tank.speed / 6, 0, 1) : 0.12;
    tank.recoil = Math.max(0, tank.recoil - dt * 1.1);
    // 炮塔：追瞄 tank.aim（站着不动的时候朝桥；开火前朝落点）
    const aimYaw = Math.atan2(tank.x - tank.aim.x, tank.z - tank.aim.z);
    tank.turretYaw += Clamp(AngleDelta(tank.turretYaw, aimYaw), -T.tankTurretRadPerS * dt, T.tankTurretRadPerS * dt);
    tank.aimGap = Math.abs(AngleDelta(tank.turretYaw, aimYaw));
  }
  TankMuzzle(tank, kind) {
    if (this.deps.muzzle) { const m = this.deps.muzzle(tank, kind); if (m) return m; }
    const fx = -Math.sin(tank.turretYaw), fz = -Math.cos(tank.turretYaw), y = this.Ground(tank.x, tank.z);
    return kind === "mg" ? { x: tank.x + fx * 1.5, y: y + 1.9, z: tank.z + fz * 1.5 } : { x: tank.x + fx * 2.3, y: y + 2.0, z: tank.z + fz * 2.3 };
  }
  Friendlies() {
    const r = this.r, list = [];
    for (const a of r.squad || []) if (a?.alive) list.push({ x: a.position.x, z: a.position.z });
    for (const e of r.extras?.State?.() || []) if (e.alive && Number.isFinite(e.x)) list.push({ x: e.x, z: e.z });
    return list;
  }
  /** 挑一个现在安全的落点（轮着挑；都不安全返回 null）。 */
  PickShellSpot(tank, tier) {
    const player = this.r.player.position, friendlies = this.Friendlies();
    const ctx = { player, friendlies, minPlayerM: T.shellMinPlayerM[tier] ?? T.shellMinPlayerM.far };
    const n = FAR_BANK_SHELL_SPOTS.length;
    for (let i = 0; i < n; i++) {
      const spot = FAR_BANK_SHELL_SPOTS[(this.shell.cursor + i) % n];
      const range = Distance(spot, tank);
      if (range < 30 || range > 175) continue;
      if (ShellSpotVerdict(spot, ctx)) continue;
      this.shell.cursor = (this.shell.cursor + i + 1) % n;
      return spot;
    }
    return null;
  }
  UpdateTankFire(tank, step) {
    const r = this.r;
    if (!(tank.state === "posted" || tank.state === "push") || this.retired || tank.speed > 0.4) return;
    const tier = this.tier;
    if (tier === "out") { tank.pending = null; return; }
    // ---- 主炮：BridgeWithdraw 起（推到岸边之后）炮击安全落点 ----
    const shelling = this.withdrawBegun && step !== "BridgeOrders";
    if (tank.pending) {
      const p = tank.pending;
      tank.aim = { x: p.spot.x, z: p.spot.z };
      if (this.t > p.giveUp) { tank.pending = null; this.shell.aborted += 1; tank.nextShellAt = this.t + 2; }
      else if (tank.aimGap < 0.06) this.FireShellAt(tank, p);
      return;
    }
    if (shelling && this.t >= tank.nextShellAt && this.t - this.shell.lastAt >= T.shellGlobalGapS) {
      const spot = this.PickShellSpot(tank, tier);
      if (!spot) { this.shell.withheld += 1; tank.nextShellAt = this.t + 2; }
      else {
        const nearby = Distance(spot, r.player.position) <= T.shellNearM;
        if (nearby && this.t - this.shell.lastNearAt < T.shellNearGapS) { tank.nextShellAt = this.t + 1; }
        else tank.pending = { spot, nearby, giveUp: this.t + 6 };
      }
    }
    // ---- 车载机枪：只打曳光 ----
    if ((tier === "contact" || tier === "mid") && this.southBankAt != null && this.t - this.southBankAt >= T.mgStartAfterS
      && typeof r.FireVehicleBullet === "function") this.UpdateTankMg(tank);
  }
  FireShellAt(tank, pending) {
    const r = this.r, tier = this.tier;
    // 三辆车可能同一拍都瞄好了：全场间隔与近距落点间隔在起飞这一刻再守一遍（先到先打，后面的等着）。
    if (this.t - this.shell.lastAt < T.shellGlobalGapS) { pending.giveUp = Math.max(pending.giveUp, this.t + 3); return; }
    if (pending.nearby && this.t - this.shell.lastNearAt < T.shellNearGapS) { pending.giveUp = Math.max(pending.giveUp, this.t + 3); return; }
    const from = this.TankMuzzle(tank, "cannon");
    const spotY = this.Ground(pending.spot.x, pending.spot.z);
    const at = r.Point({ x: pending.spot.x, z: pending.spot.z }, 0);
    const fromV = this.vec(from.x, from.y, from.z);
    // 起飞前再验一次：这一拍的己方位置 + 预测落点（弹道被桥桁架、土坎截断就放弃这个点）。
    const friendlies = this.Friendlies();
    const verdict = ShellSpotVerdict(pending.spot, { player: r.player.position, friendlies, minPlayerM: T.shellMinPlayerM[tier] ?? T.shellMinPlayerM.far });
    let impact = null;
    if (!verdict && typeof r.combat?.PredictShellImpact === "function") {
      impact = r.combat.PredictShellImpact(fromV, at, { flight: T.tankShellFlightS, sourceCollider: this.deps.tankCollider?.(tank) });
      if (impact && Math.hypot(impact.x - pending.spot.x, impact.z - pending.spot.z) > T.shellAimTolM) { tank.pending = null; this.shell.aborted += 1; tank.nextShellAt = this.t + 1.5; return; }
      if (impact) { const v2 = ShellSpotVerdict({ x: impact.x, z: impact.z }, { player: r.player.position, friendlies, minPlayerM: T.shellMinPlayerM[tier] ?? T.shellMinPlayerM.far }); if (v2) { tank.pending = null; this.shell.aborted += 1; tank.nextShellAt = this.t + 1.5; return; } }
    }
    if (verdict) { tank.pending = null; this.shell.aborted += 1; tank.nextShellAt = this.t + 1.5; return; }
    const land = impact || { x: pending.spot.x, z: pending.spot.z };
    const dir = this.vec(at.x - from.x, at.y - from.y, at.z - from.z);
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    if (dir.normalize) dir.normalize(); else { dir.x /= len; dir.y /= len; dir.z /= len; }
    // 九十米外一团炮口焰只有几个像素：焰放大、炮口前一圈与车尾后各扬一圈尘（GroundDustRing，与 03–05 的战车同一套，放大到远处读得出）。
    const V = TANK.view || {}, ring = V.groundRing, big = T.cannonFxScale;
    r.vfx?.MuzzleFlash?.(fromV, dir, { scale: (V.cannonMuzzleScale ?? 1) * big, kind: "cannon" });
    if (ring && r.vfx?.GroundDustRing) {
      const fx = -Math.sin(tank.hullYaw), fz = -Math.cos(tank.hullYaw), ringOpts = { radius: ring.radiusM * big, life: ring.lifeS * 1.3, count: ring.count, minCount: ring.minCount,
        opacity: Math.min(0.75, ring.opacity * 1.3), sizeStart: ring.sizeStart * big, sizeEnd: ring.sizeEnd.map((v) => v * big), rise: ring.rise, rings: ring.rings };
      r.vfx.GroundDustRing(this.vec(from.x, this.Ground(from.x, from.z), from.z), dir, ringOpts);
      r.vfx.GroundDustRing(this.vec(tank.x - fx * 2.6, this.Ground(tank.x, tank.z), tank.z - fz * 2.6), this.vec(-fx, 0, -fz), ringOpts);
    }
    this.deps.sound?.OnCannon?.({ x: from.x, y: from.y, z: from.z }, { x: land.x, y: spotY, z: land.z }, T.tankShellFlightS);
    r.combat.FireShell(fromV, at, {
      flight: T.tankShellFlightS, kind: "Shell57", report: !this.deps.sound, radius: T.tankShellRadiusM, damage: 0, feedbackOnly: true,
      incoming: true, sourceCollider: this.deps.tankCollider?.(tank),
    });
    tank.recoil = 0.34; tank.shots += 1; tank.pending = null; tank.muzzleFlashAt = this.t;
    tank.nextShellAt = this.t + T.shellTankGapS + this.rnd() * 5;
    this.shell.lastAt = this.t; if (pending.nearby) this.shell.lastNearAt = this.t;
    this.shell.fired += 1;
    const dPlayer = Distance(land, r.player.position);
    let dFriend = Infinity;
    for (const f of friendlies) dFriend = Math.min(dFriend, Distance(land, f));
    this.shell.minPlayerM = Math.min(this.shell.minPlayerM, dPlayer);
    this.shell.minFriendlyM = Math.min(this.shell.minFriendlyM, dFriend);
    if (this.shell.log.length < 40) this.shell.log.push({ t: +this.t.toFixed(1), tank: tank.id, x: +land.x.toFixed(1), z: +land.z.toFixed(1), playerM: +dPlayer.toFixed(1), friendlyM: Number.isFinite(dFriend) ? +dFriend.toFixed(1) : null, tier });
  }
  UpdateTankMg(tank) {
    const r = this.r;
    if (tank.mgLeft > 0) {
      if (this.t < tank.mgAt) return;
      tank.mgAt = this.t + T.mgIntervalS; tank.mgLeft -= 1;
      const from = this.TankMuzzle(tank, "mg"), p = tank.mgTarget;
      const jitter = (this.rnd() - 0.5) * 2 * (p.r ?? 1.5);
      const dir = this.vec(p.x + jitter - from.x, this.Ground(p.x, p.z) + (p.h ?? 0.5) - from.y, p.z + (this.rnd() - 0.5) * 2 * (p.r ?? 1.5) - from.z);
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      if (dir.normalize) dir.normalize(); else { dir.x /= len; dir.y /= len; dir.z /= len; }
      const A = TANK.audio || {};
      r.FireVehicleBullet(this.vec(from.x, from.y, from.z), dir, { weaponId: "Type11", damageScale: 0, sourceCollider: this.deps.tankCollider?.(tank),
        gunCue: A.mgCue, gunOpts: { volume: A.mgVolume, burst: 1, weaponClass: "mg", ...(A.mgAirCutHz ? { airCut: A.mgAirCutHz } : {}) } });
      this.mg.rounds += 1;
      if (tank.mgLeft <= 0) tank.nextMgAt = this.t + T.mgBurstGapS[0] + this.rnd() * (T.mgBurstGapS[1] - T.mgBurstGapS[0]);
      return;
    }
    if (this.t < tank.nextMgAt) return;
    // 新一串：朝南岸沙滩 / 堤顶的授权点（不打玩家附近的点：这些点都离射位 ≥ 12 m）
    const west = tank.spec.x < AXIS_X, list = FarBankFireList(west ? "west" : "east");
    const p = list[Math.floor(this.rnd() * list.length)];
    tank.mgTarget = p; tank.aim = { x: p.x, z: p.z };
    if ((tank.aimGap ?? 1) > 0.3) { tank.nextMgAt = this.t + 0.4; return; }
    tank.mgLeft = Math.round(T.mgRounds[0] + this.rnd() * (T.mgRounds[1] - T.mgRounds[0])); tank.mgAt = this.t; tank.mgBursts += 1; this.mg.bursts += 1;
  }

  // -------------------------------------------------------------------------
  // 黑屏条件：retreatOutOfReach
  // -------------------------------------------------------------------------
  /** 眼位到最近几个对岸单位的视线是否都被地形 / 地物挡住（没有 BlocksSight 的替身宿主：按距离兜底）。 */
  HiddenFromBank() {
    const r = this.r;
    if (typeof r.BlocksSight !== "function" || !r.player?.EyePosition) return this.dz >= T.outFallbackDzM;
    const p = r.player.position;
    const near = this.units.filter((u) => u.actor?.alive && u.mode !== "dead")
      .map((u) => ({ u, d: Distance(u.actor.position, p) })).sort((a, b) => a.d - b.d).slice(0, 3);
    if (!near.length) return true;
    return near.every(({ u }) => r.BlocksSight(r.player.EyePosition, r.Point({ x: u.actor.position.x, z: u.actor.position.z }, 1.3)));
  }
  /** 有没有对岸的真 AI（含 bridgeNorth 那几个）此刻看得见玩家。 */
  SeenByRealAi() {
    const r = this.r, seen = (a) => a?.alive && a.target && (a.target.isPlayer || a.target === r.player) && a.targetVisible;
    for (const u of this.units) if (u.kind === "real" && seen(u.actor)) return true;
    for (const [id, a] of r.enemies || []) if (/^BridgeNorth/.test(id) && seen(a)) return true;
    return false;
  }
  UpdateOutOfReach(dt) {
    const o = this.out;
    if (o.recorded) return;
    o.dz = this.dz;
    o.seen = this.SeenByRealAi();
    o.blindS = o.seen ? 0 : o.blindS + dt;
    o.hidden = this.dz >= T.outDzM ? this.HiddenFromBank() : false;
    if (this.dz >= T.outDzM && o.blindS >= T.blindS && (o.hidden || this.dz >= T.outFallbackDzM)) {
      o.recorded = true;
      this.r.Record("retreatOutOfReach", { dz: Number(this.dz.toFixed(1)), hidden: o.hidden, blindS: Number(o.blindS.toFixed(1)) });
    }
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------
  Update(dt, step) {
    const r = this.r;
    if (this.retired) return;
    this.t += dt;
    this.step = step;
    this.UpdateTier();
    if (step === "NightMarch") this.UpdateOutOfReach(dt);
    if (!this.started) return;
    if (this.southBankAt == null && r.Has?.("southBankReached")) this.southBankAt = this.t;
    // 放兵（每帧最多 2 个：spawn 是整场最贵的一步）
    let spawned = 0;
    for (let i = 0; i < this.pending.length && spawned < 2;) {
      const p = this.pending[i];
      if (this.t < p.due) { i += 1; continue; }
      if (this.IjaCount() >= T.ijaCap || !this.SpawnNow(p)) { i += 1; continue; }
      this.pending.splice(i, 1); spawned += 1;
    }
    // 时间线
    if (step === "BridgeCover" || step === "BridgeWithdraw") {
      if (r.Has?.("bridgeFireBroken")) {
        if (!this.vanguardSent) this.SendVanguard();
        const third = this.tanks.find((tank) => tank.spec.enter === "bridgeFireBroken");
        if (third && third.state === "queued" && !Number.isFinite(third.startAt)) third.startAt = this.t;
      }
      if (r.Has?.("rearColumnCrossed") && this.vanguardSent && !this.vanguardBack) this.RecallVanguard();
    }
    if (this.rush && !this.rush.started && this.t >= this.rush.goAt && !this.blast) this.StartRush();
    if (this.rush?.started && !this.crowdStarted && !this.blast && this.t >= this.rush.goAt + T.crowdDelayS) this.StartCrowd();
    for (const unit of this.units) this.UpdateUnit(unit, dt);
    this.UpdateBlast();
    for (const tank of this.tanks) { this.StepTank(tank, dt); this.UpdateTankFire(tank, step); }
    this.crowd.Update(dt, { tier: this.tier, fireBroken: !!r.Has?.("bridgeFireBroken"), withdraw: this.withdrawBegun });
    for (const shot of this.crowd.TakeShots()) this.deps.crowdShot?.(shot);
    this.ApplyFlags();
    this.ApplyAmbient();
    this.UpdateReinforce();
    this.AuditBank();
  }
  /** 桥断了之后对岸没有一个人能过河：记录越过岸沿的人数与最大越界（测试与驾驶脚本读）。 */
  AuditBank() {
    // southZ：活着的日军里最靠南的 z（南岸水线 RIVER_SOUTH_Z 以南 = 已经过了河，任何时候都不许出现）；
    // overNow：桥断 bankSettleS 秒之后仍在岸沿以南 bankStopSouthM 之外的人（他们必须已经退回岸边或死了）。
    let southZ = -Infinity, overNow = 0, southBank = 0;
    const settled = this.blast?.done && this.t - this.blast.at >= T.bankSettleS;
    for (const u of this.units) {
      const a = u.actor;
      if (!a?.alive) continue;
      southZ = Math.max(southZ, a.position.z);
      if (a.position.z >= RIVER_SOUTH_Z) southBank += 1;
      if (settled && a.position.z > FarBankShoreZ(a.position.x) + FAR_BANK_BLAST.bankStopSouthM) overNow += 1;
    }
    this.bank.southBank = southBank; this.bank.overNow = overNow;
    this.bank.southZ = Math.max(this.bank.southZ, southZ);
    if (settled) this.bank.overAfterSettle = Math.max(this.bank.overAfterSettle, overNow);
  }

  // -------------------------------------------------------------------------
  State() {
    const alive = (u) => !!u.actor?.alive;
    const by = (kind) => this.units.filter((u) => u.kind === kind && alive(u)).length;
    return {
      phase: this.phase, tier: this.tier, dz: Number(this.dz.toFixed(1)), started: this.started, retired: this.retired,
      real: by("real"), shore: by("shore"), standby: by("standby"), vanguard: this.units.filter((u) => u.vanguardPost && alive(u)).length, crowd: this.units.filter((u) => u.crowdPost && alive(u)).length,
      crowdOnDeck: this.units.filter((u) => (u.mode === "crowd" || u.mode === "crowded") && alive(u)).map((u) => `${u.id}@${u.actor.position.x.toFixed(0)},${u.actor.position.z.toFixed(0)}`),
      rush: this.units.filter((u) => u.rushSlot != null && u.slot && alive(u)).length, reinforce: by("reinforce"),
      scripted: this.units.filter((u) => SCRIPTED_KINDS.has(u.kind) && alive(u)).length,
      alive: this.units.filter(alive).length, pending: this.pending.length, spawned: this.counts.spawned,
      deadByPlayer: this.counts.deadByPlayer, blastKilled: this.counts.blastKilled, removed: this.counts.removed, reinforced: this.reinforced,
      ijaCount: this.IjaCount(), ijaCap: T.ijaCap, ambientActive: this.ambientActive || 0,
      rushUnits: this.units.filter((u) => u.slot || u.rushSlot != null).map((u) => `${u.id}:${u.mode}${u.actor?.alive ? "" : ":dead"}@${u.actor?.position.x.toFixed(0)},${u.actor?.position.z.toFixed(0)}`),
      rushState: this.rush && { started: this.rush.started, arrived: this.rush.arrivedAt != null, settled: this.rush.settled, timedOut: this.rush.timedOut, waitedS: Number(this.rush.waitedS.toFixed(1)),
        onDeck: this.units.filter((u) => (u.mode === "rush" || u.mode === "rushed") && alive(u)).length,
        minZ: this.units.filter((u) => u.rushSlot != null && u.slot && alive(u)).reduce((m, u) => Math.min(m, u.actor.position.z), Infinity),
        maxZ: this.units.filter((u) => u.rushSlot != null && u.slot && alive(u)).reduce((m, u) => Math.max(m, u.actor.position.z), -Infinity) },
      blast: this.blast && { ...this.blast }, blastAgeS: this.blast ? Number((this.t - this.blast.at).toFixed(1)) : null,
      bank: { southBank: this.bank.southBank, southMostZ: Number.isFinite(this.bank.southZ) ? Number(this.bank.southZ.toFixed(1)) : null,
        overNow: this.bank.overNow, overAfterSettle: this.bank.overAfterSettle },
      shells: { fired: this.shell.fired, withheld: this.shell.withheld, aborted: this.shell.aborted,
        minPlayerM: Number.isFinite(this.shell.minPlayerM) ? Number(this.shell.minPlayerM.toFixed(1)) : null,
        minFriendlyM: Number.isFinite(this.shell.minFriendlyM) ? Number(this.shell.minFriendlyM.toFixed(1)) : null, log: this.shell.log.slice(-12) },
      mg: { ...this.mg }, crowd: this.crowd.State(),
      tanks: this.tanks.map((t) => ({ id: t.id, state: t.state, x: Number(t.x.toFixed(1)), z: Number(t.z.toFixed(1)), speed: Number(t.speed.toFixed(2)), shots: t.shots, mgBursts: t.mgBursts })),
      out: { ...this.out, blindS: Number(this.out.blindS.toFixed(1)), dz: Number((this.out.dz || 0).toFixed(1)) },
    };
  }
  Dispose() { this.Clear(); }
}

export { FarBankShoreZ };
