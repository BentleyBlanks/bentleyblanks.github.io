// ===========================================================================
// Script_AiTacticsTest.mjs —— 班组战术层的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_EnemyAi.md §4.4 与 §9 里点名的每一条：
//   ① 攻击令牌：玩家上限走 COMBAT.maxShootersOnPlayer、AI 目标走 TACTICS.maxShootersPerTarget，
//      到期回收、换目标回收、死亡回收；**没有令牌的人一律不许 ENGAGE**；
//   ② 剧本旗（scriptDefensive / p012Guided / emplacementId / meleeCombat / covert /
//      scriptedNoncombatant / dummy）与守区 holdZone 的人不分配机动类任务；
//   ③ 侧翼点在目标正面锥以外、落在可走格上、估路受限（假 Walkable 摆一堵墙）；
//   ④ 跃进配对交替（同一对人两次调用 mover / coverer 互换）；
//   ⑤ 投弹的七个条件各一条反例 + 一条正例；
//   ⑥ 撤退的正反例（守区的人永不撤）；
//   ⑦ 去查看的正反例；
//   ⑧ 黑板合并取最新 / 同刻取高置信、过期清理、Primary 的四秒迟滞；
//   ⑨ 六人组分配出至少三种不同任务，且机枪手（support）不去绕后。
//
// 为什么全在纯 Node 里：这一层不认识 three、不认识场景 —— 「谁去打谁、谁去绕、
// 谁扔弹」是规则；把规则摆到画面里去验证要开浏览器、要撒兵、要等三十秒，
// 而这里一次跑完只要几毫秒（项目契约 2）。
//
// 断言里的期望值一律从 Data_Tuning_AiTactics / Data_Battle 里读，不抄数
// （docs/Data_TextAndTuning.md §4：测试读表，不复制常量）。
//
// 跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=AiTacticsTest
//   或：node Taierzhuang1938/Script_AiTacticsTest.mjs
// ===========================================================================

import assert from "node:assert/strict";
import {
  TacticsDirector, SquadBlackboard, TASK, MANEUVER_TASKS, HOLD_SAFE_TASKS,
  PLAYER_TARGET_ID, IsScripted, CanManeuver, IsManeuverTask,
} from "./Script_AiTactics.mjs";
import {
  TACTICS, FLANK, BOUND, GRENADE, RETREAT, INVESTIGATE, BLACKBOARD, ROLE_PREFERENCE,
} from "./Data_Tuning_AiTactics.mjs";
import { COMBAT } from "./Data_Battle.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const PLAYER_CAP = Number.isFinite(COMBAT.maxShootersOnPlayer) ? COMBAT.maxShootersOnPlayer : 3;
const AI_CAP = TACTICS.maxShootersPerTarget;

// ---------------------------------------------------------------------------
// 假件：宿主回调、士兵、班、掩体注册表、Track
// ---------------------------------------------------------------------------

/** 假宿主。now 可写，测试直接改它来推进时间；Rnd 恒定，保证可重跑。 */
function MakeHost(over = {}) {
  const host = {
    now: Number.isFinite(over.now) ? over.now : 0,
    Time: () => host.now,
    Rnd: over.Rnd || (() => 0),
    Walkable: over.Walkable || (() => true),
    GroundHeight: () => 0,
  };
  if (over.Steer) host.Steer = over.Steer;
  return host;
}

let nextSoldierId = 1;
/** 假兵：只带战术层读得到的字段（Script_Ai.Soldier 的同名子集）。 */
function MakeSoldier(over = {}) {
  return {
    id: over.id !== undefined ? over.id : nextSoldierId++,
    side: over.side || "ija",
    alive: over.alive !== false,
    squadId: over.squadId !== undefined ? over.squadId : "ija_1",
    tacticalRole: over.tacticalRole || "rifleman",
    position: { x: over.x || 0, y: over.y || 0, z: over.z || 0 },
    yaw: over.yaw || 0,
    order: over.order || "advance",
    holdZone: over.holdZone || null,
    emplacementId: over.emplacementId !== undefined ? over.emplacementId : null,
    meleeCombat: over.meleeCombat || null,
    scriptDefensive: over.scriptDefensive === true,
    p012Guided: over.p012Guided === true,
    scriptedNoncombatant: over.scriptedNoncombatant === true,
    dummy: over.dummy === true,
    covertUntil: Number.isFinite(over.covertUntil) ? over.covertUntil : -99,
    unarmed: over.unarmed === true,
    cohesion: Number.isFinite(over.cohesion) ? over.cohesion : 1,
    suppression: Number.isFinite(over.suppression) ? over.suppression : 0,
    lonelyTime: Number.isFinite(over.lonelyTime) ? over.lonelyTime : 0,
    throwables: over.throwables,
    grenades: over.grenades,
    lastGrenadeAt: over.lastGrenadeAt,
    task: null,
  };
}

/** 假 group：形状与 Script_Ai.UpdateSquads 算出来的那个一致。 */
function MakeGroup(members, over = {}) {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const m of members) {
    if (!m || m.alive === false) continue;
    x += m.position.x; z += m.position.z; n += 1;
  }
  return {
    id: over.id || "ija_1",
    side: over.side || "ija",
    members,
    count: n,
    x: n ? x / n : 0,
    z: n ? z / n : 0,
    forwardX: over.forwardX !== undefined ? over.forwardX : 0,
    forwardZ: over.forwardZ !== undefined ? over.forwardZ : -1,
    focusKind: over.focusKind || "none",
    focusId: over.focusId !== undefined ? over.focusId : null,
    focusX: over.focusX,
    focusZ: over.focusZ,
  };
}

/** 假掩体注册表：只实现战术层真正调的 Nearby（鸭子类型，不 import Script_AiCover）。 */
function MakeCoverRegistry(over = {}) {
  const covers = over.covers === undefined ? [{ id: "c0", x: 0, z: 0, height: 1.0 }] : over.covers;
  return {
    calls: 0,
    Nearby(x, z, radiusM) { this.calls += 1; return over.Nearby ? over.Nearby(x, z, radiusM) : covers; },
    Query() { return []; },
    IsFlanked() { return false; },
  };
}

function MakeTrack(over = {}) {
  return {
    id: over.id !== undefined ? over.id : 99,
    isPlayer: over.isPlayer === true,
    lkp: {
      x: over.x || 0,
      y: over.y || 0,
      z: over.z || 0,
      time: Number.isFinite(over.time) ? over.time : 0,
      confidence: Number.isFinite(over.confidence) ? over.confidence : 1,
    },
    lastSeenAt: Number.isFinite(over.lastSeenAt) ? over.lastSeenAt : (Number.isFinite(over.time) ? over.time : 0),
    awareness: Number.isFinite(over.awareness) ? over.awareness : 1,
    yaw: over.yaw,
    coverId: over.coverId,
    stationaryS: over.stationaryS,
    alert: over.alert,
  };
}

/** 六人班：角色照 Data_Tuning_Ai.SQUAD.slots 的顺序发。 */
function MakeSixManSquad(over = {}) {
  const roles = ["leader", "assault", "rifleman", "support", "rifleman", "flank"];
  const members = [];
  for (let i = 0; i < roles.length; i += 1) {
    members.push(MakeSoldier({
      tacticalRole: roles[i],
      x: (i - 2.5) * 2,
      z: over.z !== undefined ? over.z : 20,
      squadId: over.squadId || "ija_1",
      ...over.each,
    }));
  }
  return members;
}

function KindsOf(members) {
  const kinds = [];
  for (const m of members) {
    const kind = m.task ? m.task.kind : null;
    if (kind && kinds.indexOf(kind) < 0) kinds.push(kind);
  }
  return kinds;
}

// ===========================================================================
{
  // --- ① 攻击令牌：玩家上限、AI 上限、续租、换目标、释放、到期回收 -------
  const host = MakeHost();
  const director = new TacticsDirector(host);

  const granted = [];
  for (let i = 1; i <= PLAYER_CAP + 2; i += 1) granted.push(director.AcquireToken(PLAYER_TARGET_ID, i));
  for (let i = 0; i < PLAYER_CAP; i += 1) Check(granted[i] === true, "玩家名额之内的人拿得到令牌");
  for (let i = PLAYER_CAP; i < granted.length; i += 1) Check(granted[i] === false, "超过玩家名额的人拿不到令牌");
  Check(director.TokenCount(PLAYER_TARGET_ID) === PLAYER_CAP, "玩家身上的令牌数正好是 COMBAT.maxShootersOnPlayer");

  Check(director.AcquireToken(PLAYER_TARGET_ID, 1) === true, "已持有的人是续租不是重新排队");
  Check(director.TokenCount(PLAYER_TARGET_ID) === PLAYER_CAP, "续租不会把名额算两次");

  Check(director.ReleaseToken(1) === true, "释放成功");
  Check(director.TokenCount(PLAYER_TARGET_ID) === PLAYER_CAP - 1, "释放之后名额空出来一个");
  Check(director.AcquireToken(PLAYER_TARGET_ID, 99) === true, "空出来的名额别人补得上");

  // AI 目标另算一套上限
  const aiGranted = [];
  for (let i = 200; i < 200 + AI_CAP + 2; i += 1) aiGranted.push(director.AcquireToken(77, i));
  for (let i = 0; i < AI_CAP; i += 1) Check(aiGranted[i] === true, "AI 目标名额之内拿得到");
  for (let i = AI_CAP; i < aiGranted.length; i += 1) Check(aiGranted[i] === false, "AI 目标超额拿不到");
  Check(director.TokenCount(77) === AI_CAP, "AI 目标的上限是 TACTICS.maxShootersPerTarget");

  // 换目标：旧令牌自动回收
  const before = director.TokenCount(77);
  Check(director.AcquireToken(88, 200) === true, "换目标能拿到新令牌");
  Check(director.TokenCount(77) === before - 1, "换目标会把旧目标的名额还回去");
  Check(director.TokenTarget(200) === 88, "持有者记的是新目标");

  // 到期回收
  host.now = TACTICS.tokenLeaseS;
  director.SweepTokens();
  Check(director.TokenCount(PLAYER_TARGET_ID) === 0, "租期一到玩家身上的令牌全部回收");
  Check(director.TokenCount(77) === 0 && director.TokenCount(88) === 0, "AI 目标的令牌同样到期回收");
  Check(director.HasToken(1) === false, "回收之后谁都不再持有");
  Check(director.AcquireToken(PLAYER_TARGET_ID, 5) === true, "回收之后名额可以重新发放");

  // 目标死亡：一次收回指着他的全部令牌
  director.AcquireToken(PLAYER_TARGET_ID, 6);
  Check(director.ReleaseTokensForTarget(PLAYER_TARGET_ID) >= 2, "目标阵亡能一次收回所有令牌");
  Check(director.TokenCount(PLAYER_TARGET_ID) === 0, "收回之后计数归零");
}
console.log("ok  令牌：玩家/AI 两套上限、续租、换目标、释放、到期与目标阵亡回收");

// ===========================================================================
{
  // --- ② 六人组：至少三种任务、support 不绕后、ENGAGE 必须有令牌 --------
  const host = MakeHost();
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const members = MakeSixManSquad();
  const group = MakeGroup(members);
  const blackboard = director.Blackboard(group.id, group.side);
  // 全班都看见了同一个敌人（他正面朝我们，yaw=π → 前向量 (0, +1)）
  for (const m of members) blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0, yaw: Math.PI }));

  const enemy = director.UpdateSquad(group, null);
  Check(enemy !== null && enemy.id === 99, "队级敌情从黑板解出来");

  const kinds = KindsOf(members);
  Check(kinds.length >= 3, `六人组至少分出三种任务（实得 ${kinds.join("/")}）`);

  let engage = 0;
  for (const m of members) {
    const task = m.task;
    Check(task !== null, "每个人都拿到了 task 对象");
    if (task.kind !== TASK.ENGAGE) continue;
    engage += 1;
    Check(director.HasToken(m.id, 99) === true, "ENGAGE 的人必须持有该目标的令牌");
  }
  Check(engage > 0 && engage <= AI_CAP, "同时 ENGAGE 的人数不超过 AI 目标上限");
  for (const m of members) {
    if (m.task.kind === TASK.ENGAGE) continue;
    Check(director.HasToken(m.id, 99) === false, "没在 ENGAGE 的人不占着令牌");
  }

  const support = members.find((m) => m.tacticalRole === "support");
  Check(support.task.kind !== TASK.FLANK, "机枪手不去绕后（support 偏好压制）");
  Check(ROLE_PREFERENCE.support === "suppress", "角色偏好表里 support 就是压制位");
  const flanker = members.find((m) => m.tacticalRole === "flank");
  Check(flanker.task.kind === TASK.FLANK, "专职侧翼手拿到 FLANK");
  Check(flanker.task.point !== null, "FLANK 带落点");

  // 任务对象与点位对象都是复用的（热路径零分配）
  const taskRef = members[0].task;
  const pointRef = members[0].task.point;
  host.now = 1;
  director.UpdateSquad(group, null);
  Check(members[0].task === taskRef, "第二次分配复用同一个 task 对象");
  Check(members[0].task.point === null || members[0].task.point === pointRef, "点位对象同样复用");
}
console.log("ok  六人组：三种以上任务、support 不绕后、ENGAGE 与令牌一一对应、对象复用");

// ===========================================================================
{
  // --- ③ 剧本旗与守区：只给 HOLD / ENGAGE / SUPPRESS / GRENADE ----------
  const flagCases = [
    { name: "scriptDefensive", each: { scriptDefensive: true } },
    { name: "p012Guided", each: { p012Guided: true } },
    { name: "emplacementId", each: { emplacementId: "CH5_MG_1" } },
    { name: "meleeCombat", each: { meleeCombat: { phase: "lock" } } },
    { name: "covert", each: { order: "covert" } },
    { name: "scriptedNoncombatant", each: { scriptedNoncombatant: true } },
    { name: "dummy", each: { dummy: true } },
    { name: "holdZone", each: { holdZone: { x: 0, z: 20, radius: 8 } } },
  ];
  for (const singleCase of flagCases) {
    const host = MakeHost();
    const director = new TacticsDirector(host, MakeCoverRegistry());
    const members = MakeSixManSquad({ each: singleCase.each, squadId: `s_${singleCase.name}` });
    const group = MakeGroup(members, { id: `s_${singleCase.name}` });
    const blackboard = director.Blackboard(group.id, group.side);
    for (const m of members) blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0, yaw: Math.PI }));
    director.UpdateSquad(group, null);
    for (const m of members) {
      const kind = m.task.kind;
      Check(!IsManeuverTask(kind), `${singleCase.name} 的人不许拿机动任务（实得 ${kind}）`);
      Check(kind === null || HOLD_SAFE_TASKS.indexOf(kind) >= 0,
        `${singleCase.name} 的人只能拿 HOLD/ENGAGE/SUPPRESS/GRENADE（实得 ${kind}）`);
    }
  }
  Check(MANEUVER_TASKS.length === 4, "机动类任务就是 FLANK / BOUND / INVESTIGATE / RETREAT 四条");

  // 守区的人：掩体查询半径被压在守区里（方案 §6 的 Defend 语义）
  const host = MakeHost();
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const zone = { x: 0, z: 20, radius: 8 };
  const members = MakeSixManSquad({ each: { holdZone: zone }, squadId: "hold_1" });
  const group = MakeGroup(members, { id: "hold_1" });
  const blackboard = director.Blackboard(group.id, group.side);
  for (const m of members) blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0 }));
  director.UpdateSquad(group, null);
  for (const m of members) {
    Check(Math.abs(m.task.coverRadiusM - (zone.radius + TACTICS.holdCoverSlackM)) < 1e-6,
      "守区的人掩体查询半径 = 守区半径 + holdCoverSlackM");
  }
  const engaged = members.filter((m) => m.task.kind === TASK.ENGAGE).length;
  const suppressed = members.filter((m) => m.task.kind === TASK.SUPPRESS).length;
  Check(engaged > 0, "守区的人照样可以对射（不是被钉住不动）");
  Check(suppressed > 0, "抢不到令牌的守军转压制");

  // 旗子判定本身
  Check(IsScripted(MakeSoldier({ scriptDefensive: true })) === true, "IsScripted 认剧本防守");
  Check(IsScripted(MakeSoldier({ covertUntil: 10 }), 5) === true, "潜行有效期内也算剧本旗");
  Check(IsScripted(MakeSoldier({ covertUntil: 10 }), 20) === false, "潜行过期就不算了");
  Check(CanManeuver(MakeSoldier({ holdZone: { x: 0, z: 0, radius: 5 } })) === false, "守区的人不许机动");
  Check(CanManeuver(MakeSoldier({})) === true, "普通兵可以机动");
}
console.log("ok  剧本旗与守区：七种旗子 + holdZone 一律不给机动任务，仍能对射与压制");

// ===========================================================================
{
  // --- ④ 侧翼点：正面锥以外、可走、路程受限 -----------------------------
  // 假地形：x > 0 是一堵墙（走不进去，也走不过去）。
  const host = MakeHost({ Walkable: (x) => x <= 0 });
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const soldier = MakeSoldier({ x: 0, z: 25 });
  const group = MakeGroup([soldier]);
  // 目标在原点、朝 +Z（yaw = π）—— 正对着我们。
  const enemy = { id: 99, isPlayer: false, yaw: Math.PI, lkp: { x: 0, y: 0, z: 0, time: 0, confidence: 1 } };

  const point = director.FlankPoint(group, enemy, soldier);
  Check(point !== null, "开阔地上找得到侧翼点");
  Check(host.Walkable(point.x, point.z) === true, "侧翼点落在可走格上（不在墙里）");
  const fx = -Math.sin(enemy.yaw);
  const fz = -Math.cos(enemy.yaw);
  const dx = point.x - enemy.lkp.x;
  const dz = point.z - enemy.lkp.z;
  const len = Math.hypot(dx, dz) || 1;
  const angle = Math.acos(Math.max(-1, Math.min(1, (dx / len) * fx + (dz / len) * fz)));
  Check(angle >= FLANK.flankMinAngleRad, `侧翼点在目标正面锥以外（夹角 ${angle.toFixed(2)} rad）`);
  Check(Math.abs(len - FLANK.flankRadiusM) < 1e-6, "侧翼点摆在 flankRadiusM 的圈上");
  const path = director.EstimatePathM(soldier.position.x, soldier.position.z, point.x, point.z);
  Check(path <= FLANK.flankMaxPathM, "到侧翼点的估路在 flankMaxPathM 之内");
  Check(director.EstimatePathM(0, 0, 30, 0) === Infinity, "墙那边的点估路是不可达");

  // 太远：整个圈都超出 flankMaxPathM
  const farSoldier = MakeSoldier({ x: 0, z: 400 });
  Check(director.FlankPoint(MakeGroup([farSoldier]), enemy, farSoldier) === null,
    "路程超过 flankMaxPathM 就不给侧翼点");

  // 附近没有掩体：绕过去也是送死，不给
  const noCover = new TacticsDirector(host, MakeCoverRegistry({ covers: [] }));
  Check(noCover.FlankPoint(group, enemy, soldier) === null, "侧翼点附近没有掩体就不选");

  // 到处都是墙：一个候选都活不下来
  const walled = new TacticsDirector(MakeHost({ Walkable: () => false }), MakeCoverRegistry());
  Check(walled.FlankPoint(group, enemy, soldier) === null, "没有可走格时不硬给点");

  // 侧翼点到位之后转正面，不许「一到位就再派一个新点」来回横跳
  const host2 = MakeHost();
  const director2 = new TacticsDirector(host2, MakeCoverRegistry());
  const members = MakeSixManSquad({ squadId: "fk_1" });
  const group2 = MakeGroup(members, { id: "fk_1" });
  const board = director2.Blackboard("fk_1", "ija");
  for (const m of members) board.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0, yaw: Math.PI }));
  director2.UpdateSquad(group2, null);
  const walker = members.find((m) => m.task.kind === TASK.FLANK);
  Check(walker !== undefined, "有人被派去绕");
  const target = { x: walker.task.point.x, z: walker.task.point.z };
  host2.now = 1;
  for (const m of members) board.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 1, yaw: Math.PI }));
  director2.UpdateSquad(group2, null);
  Check(walker.task.kind === TASK.FLANK
    && Math.abs(walker.task.point.x - target.x) < 1e-6
    && Math.abs(walker.task.point.z - target.z) < 1e-6, "认账期内不重选侧翼点");

  walker.position.x = target.x;                 // 走到了
  walker.position.z = target.z;
  host2.now = 2;
  for (const m of members) board.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 2, yaw: Math.PI }));
  director2.UpdateSquad(group2, null);
  Check(walker.task.kind !== TASK.FLANK, "到位之后不再绕（转回正面那一档）");
  host2.now = 3;
  for (const m of members) board.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 3, yaw: Math.PI }));
  director2.UpdateSquad(group2, null);
  Check(walker.task.kind !== TASK.FLANK, "recycleS 之内不会立刻再派他去绕");

  // 不知道目标朝向时拿「目标 → 我方重心」当正面
  const noYaw = { id: 99, isPlayer: false, lkp: { x: 0, y: 0, z: 0, time: 0, confidence: 1 } };
  const blindPoint = director.FlankPoint(group, noYaw, soldier);
  Check(blindPoint !== null, "不知道朝向也能给侧翼点");
  const bdx = blindPoint.x - noYaw.lkp.x;
  const bdz = blindPoint.z - noYaw.lkp.z;
  const blen = Math.hypot(bdx, bdz) || 1;
  // 兜底正面 = 目标 → 我方重心 = +Z 方向
  const bangle = Math.acos(Math.max(-1, Math.min(1, (bdz / blen) * 1)));
  Check(bangle >= FLANK.flankMinAngleRad, "兜底正面同样把候选点推到锥外");
}
console.log("ok  侧翼点：锥外 + 可走 + 估路受限；无掩体/无可走格/太远时老实返回 null");

// ===========================================================================
{
  // --- ⑤ 跃进配对：一动一掩护，两次调用互换 -----------------------------
  const host = MakeHost();
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const a = MakeSoldier({ x: 0, z: 0 });
  const b = MakeSoldier({ x: 2, z: 0 });
  const c = MakeSoldier({ x: 40, z: 0 });
  const d = MakeSoldier({ x: 42, z: 0 });
  const held = MakeSoldier({ x: 1, z: 1, holdZone: { x: 0, z: 0, radius: 5 } });
  const group = MakeGroup([a, b, c, d, held]);

  const first = director.BoundPairs(group).map((pair) => [pair[0].id, pair[1].id]);
  Check(first.length === 2, "四个可机动的人配成两对（远处那两个各自成对）");
  Check(first[0][0] !== first[0][1], "一对里是两个人");
  for (const pair of first) Check(pair.indexOf(held.id) < 0, "守区的人不进跃进配对");
  // 同一对人里，两个人的距离不超过 maxPairDistM
  Check(Math.abs(a.position.x - b.position.x) <= BOUND.maxPairDistM, "配对按距离就近");

  const second = director.BoundPairs(group).map((pair) => [pair[0].id, pair[1].id]);
  Check(second.length === first.length, "两次配对出的对数一样");
  for (let i = 0; i < first.length; i += 1) {
    Check(second[i][0] === first[i][1] && second[i][1] === first[i][0],
      "第二次调用 mover 与 coverer 互换（一动一掩护轮着来）");
  }

  // UpdateSquad 里：mover 拿 BOUND、搭档拿掩护任务，且 BOUND 带队向不带落点
  const host2 = MakeHost();
  const director2 = new TacticsDirector(host2, MakeCoverRegistry());
  const members = MakeSixManSquad({ squadId: "bd_1" });
  const group2 = MakeGroup(members, { id: "bd_1", forwardX: 0, forwardZ: -1 });
  const blackboard = director2.Blackboard(group2.id, group2.side);
  for (const m of members) blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0, yaw: Math.PI }));
  director2.UpdateSquad(group2, null);
  const mover = members.find((m) => m.task.kind === TASK.BOUND);
  Check(mover !== undefined, "六人组里有人在跃进");
  Check(mover.task.point === null, "BOUND 只给方向不给落点（下一个掩体由集成者 Query）");
  Check(Math.abs(Math.hypot(mover.task.towardX, mover.task.towardZ) - 1) < 1e-6, "BOUND 的队向是单位向量");
  Check(mover.task.partnerId !== null, "BOUND 记着掩护自己的那个人");
  Check(mover.task.coverRadiusM <= TACTICS.boundCoverSearchM, "跃进时掩体查询半径收窄");
}
console.log("ok  跃进：就近配对、守区不入对、两次调用互换、mover 只拿方向");

// ===========================================================================
{
  // --- ⑥ 投弹：七个条件各一条反例 + 一条正例 ---------------------------
  const minM = TacticsDirector.GrenadeMinM();
  const maxM = Math.min(GRENADE.maxM, TacticsDirector.GrenadeReachM());
  Check(minM >= WEAPONS.Grenade.radiusM, "最小投掷距离不小于手榴弹杀伤半径（不炸自己）");
  Check(maxM <= TacticsDirector.GrenadeReachM(), "最大投掷距离不超过初速算出的射程");

  const MakeCase = (soldierOver = {}, enemyOver = {}) => {
    const host = MakeHost({ now: 100 });
    const director = new TacticsDirector(host);
    const soldier = MakeSoldier({
      x: 0, z: 0, squadId: "gr_1", throwables: { Grenade: 2 }, ...soldierOver,
    });
    const enemy = {
      id: 99, isPlayer: false, coverId: "c1", stationaryS: 0,
      lkp: { x: 0, y: 0, z: 15, time: 100, confidence: 1 },
      ...enemyOver,
    };
    return { host, director, soldier, enemy };
  };

  const base = MakeCase();
  Check(base.director.ShouldGrenade(base.soldier, base.enemy, 100) === true,
    "正例：有弹 + 对方在掩体里 + 距离合适 + 冷却已过 + 高差合理 + 情报新");

  const noAmmo = MakeCase({ throwables: { Grenade: 0 } });
  Check(noAmmo.director.ShouldGrenade(noAmmo.soldier, noAmmo.enemy, 100) === false, "反例①：身上没弹不扔");
  const noField = MakeCase({ throwables: undefined });
  Check(noField.director.ShouldGrenade(noField.soldier, noField.enemy, 100) === false,
    "反例①：连携行字段都没有（默认没弹）不扔");
  const legacyField = MakeCase({ throwables: undefined, grenades: 2 });
  Check(legacyField.director.ShouldGrenade(legacyField.soldier, legacyField.enemy, 100) === true,
    "退回 soldier.grenades 也认");

  const notPinned = MakeCase({}, { coverId: null, stationaryS: 0 });
  Check(notPinned.director.ShouldGrenade(notPinned.soldier, notPinned.enemy, 100) === false,
    "反例②：对方还在动就不扔");
  const stationary = MakeCase({}, { coverId: null, stationaryS: GRENADE.holdS });
  Check(stationary.director.ShouldGrenade(stationary.soldier, stationary.enemy, 100) === true,
    "在同一处站够 holdS 秒也算钉住");

  const tooClose = MakeCase({}, { lkp: { x: 0, y: 0, z: minM - 1, time: 100, confidence: 1 } });
  Check(tooClose.director.ShouldGrenade(tooClose.soldier, tooClose.enemy, 100) === false,
    "反例③：太近不扔（自己也在杀伤半径里）");
  const tooFar = MakeCase({}, { lkp: { x: 0, y: 0, z: maxM + 5, time: 100, confidence: 1 } });
  Check(tooFar.director.ShouldGrenade(tooFar.soldier, tooFar.enemy, 100) === false, "反例③：太远扔不到");

  const squadCase = MakeCase();
  const mate = MakeSoldier({ x: 1, z: 0, squadId: "gr_1", throwables: { Grenade: 2 } });
  squadCase.director.NoteGrenadeThrown(squadCase.soldier, 100);
  Check(squadCase.director.ShouldGrenade(mate, squadCase.enemy, 100 + GRENADE.squadCooldownS - 1) === false,
    "反例④：班里刚扔过，别人在冷却里不扔");
  squadCase.enemy.lkp.time = 100 + GRENADE.squadCooldownS;   // 情报也得是新的
  Check(squadCase.director.ShouldGrenade(mate, squadCase.enemy, 100 + GRENADE.squadCooldownS) === true,
    "班组冷却一过就能扔");

  const personal = MakeCase({ lastGrenadeAt: 100 - GRENADE.personalCooldownS + 1 });
  Check(personal.director.ShouldGrenade(personal.soldier, personal.enemy, 100) === false,
    "反例⑤：自己刚扔过，个人冷却没到");

  const high = MakeCase({}, { lkp: { x: 0, y: GRENADE.maxRiseM + 1, z: 15, time: 100, confidence: 1 } });
  Check(high.director.ShouldGrenade(high.soldier, high.enemy, 100) === false,
    "反例⑥：目标比我高太多，抛物线粗验不过");

  const stale = MakeCase({}, { lkp: { x: 0, y: 0, z: 15, time: 100 - GRENADE.lkpMaxAgeS - 1, confidence: 1 } });
  Check(stale.director.ShouldGrenade(stale.soldier, stale.enemy, 100) === false,
    "反例⑦：情报太旧，不往影子上扔");

  // 扣弹与冷却由 NoteGrenadeThrown 写（判据本身无副作用）
  const consume = MakeCase();
  Check(consume.director.ShouldGrenade(consume.soldier, consume.enemy, 100) === true, "判据可以反复问");
  Check(consume.soldier.throwables.Grenade === 2, "问过之后携行不变（无副作用）");
  consume.director.NoteGrenadeThrown(consume.soldier, 100);
  Check(consume.soldier.throwables.Grenade === 1, "真扔出去才扣一枚");
  consume.director.NoteGrenadeThrown(consume.soldier, 200, false);
  Check(consume.soldier.throwables.Grenade === 1, "consume=false 时不重复扣（集成层自己扣）");

  // UpdateSquad 里：投弹会写进 task，且一次更新最多派一枚
  const host = MakeHost({ now: 100 });
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const members = MakeSixManSquad({ squadId: "gr_2", each: { throwables: { Grenade: 3 } } });
  for (const m of members) { m.position.x = 0; m.position.z = 15; }
  const group = MakeGroup(members, { id: "gr_2" });
  const blackboard = director.Blackboard(group.id, group.side);
  for (const m of members) {
    blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 100, yaw: Math.PI, coverId: "c1" }));
  }
  director.UpdateSquad(group, null);
  const throwers = members.filter((m) => m.task.kind === TASK.GRENADE);
  Check(throwers.length === 1, "一次更新全班最多派一枚手榴弹");
  Check(throwers[0].task.point !== null && throwers[0].task.point.z === 0, "投弹任务的落点是敌情 LKP");
}
console.log("ok  投弹：七条件各一反例 + 正例、班组/个人冷却、判据无副作用、每班每次一枚");

// ===========================================================================
{
  // --- ⑦ 撤退 -----------------------------------------------------------
  const host = MakeHost();
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const members = MakeSixManSquad({ squadId: "rt_1" });
  const group = MakeGroup(members, { id: "rt_1" });
  director.UpdateSquad(group, null);            // 记下峰值人数 6

  const survivor = members[0];
  Check(director.ShouldRetreat(survivor, group) === false, "满编的班不撤");

  for (let i = 2; i < members.length; i += 1) members[i].alive = false;
  const thin = MakeGroup(members.filter((m) => m.alive), { id: "rt_1" });
  Check(2 / 6 < RETREAT.retreatSurvivorRatio, "六个人剩两个确实低于存活比阈值");
  Check(director.ShouldRetreat(survivor, thin) === true, "本班打剩两个人：撤");

  survivor.holdZone = { x: 0, z: 20, radius: 8 };
  Check(director.ShouldRetreat(survivor, thin) === false, "守区的人打到只剩自己也不撤（守点纪律）");
  survivor.holdZone = null;
  survivor.scriptDefensive = true;
  Check(director.ShouldRetreat(survivor, thin) === false, "剧本防守的人不撤");
  survivor.scriptDefensive = false;

  // 孤立 + 散/被打狠
  const host2 = MakeHost();
  const director2 = new TacticsDirector(host2, MakeCoverRegistry());
  const full = MakeSixManSquad({ squadId: "rt_2" });
  const fullGroup = MakeGroup(full, { id: "rt_2" });
  director2.UpdateSquad(fullGroup, null);
  const lone = full[0];
  lone.cohesion = RETREAT.retreatCohesion - 0.1;
  lone.lonelyTime = RETREAT.lonelyS + 1;
  Check(director2.ShouldRetreat(lone, fullGroup) === true, "孤立够久 + 班组散了：撤");
  lone.lonelyTime = 0;
  Check(director2.ShouldRetreat(lone, fullGroup) === false, "人堆里就算 cohesion 低也不撤（那是缩进掩体的事）");
  lone.cohesion = 1;
  lone.suppression = RETREAT.retreatSuppression + 0.05;
  lone.lonelyTime = RETREAT.lonelyS + 1;
  Check(director2.ShouldRetreat(lone, fullGroup) === true, "孤立够久 + 被压得抬不起头：撤");
  lone.lonelyTime = RETREAT.lonelyS - 1;
  Check(director2.ShouldRetreat(lone, fullGroup) === false, "孤立时间没够就不撤");

  // 撤退在 UpdateSquad 里会真的写成 RETREAT 任务并带集结点
  lone.lonelyTime = RETREAT.lonelyS + 1;
  const blackboard = director2.Blackboard("rt_2", "ija");
  for (const m of full) blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0 }));
  director2.UpdateSquad(fullGroup, null);
  Check(lone.task.kind === TASK.RETREAT, "撤退判定会盖过对射");
  Check(lone.task.point !== null, "撤退任务带集结点");
  Check(lone.task.point.z > fullGroup.z, "集结点在背敌方向（敌人在 z=0，班在 z=20）");
}
console.log("ok  撤退：存活比/孤立+散/孤立+压制三条判据，守区与剧本旗永不撤");

// ===========================================================================
{
  // --- ⑧ 去查看 ---------------------------------------------------------
  const host = MakeHost({ now: 50 });
  const director = new TacticsDirector(host);
  const soldier = MakeSoldier({ x: 0, z: 0 });
  const near = MakeTrack({ id: 99, x: 0, z: 20, time: 50, confidence: 0.8, alert: "alert" });
  Check(director.ShouldInvestigate(soldier, near, 50) === true, "正例：警戒 + 情报可信 + 距离够近");

  const lowConfidence = MakeTrack({ id: 99, x: 0, z: 20, time: 50, alert: "alert" });
  lowConfidence.lkp.confidence = INVESTIGATE.investigateConfidence - 0.05;
  Check(director.ShouldInvestigate(soldier, lowConfidence, 50) === false, "反例：情报置信度不够");

  const far = MakeTrack({ id: 99, x: 0, z: INVESTIGATE.investigateMaxM + 10, time: 50, confidence: 0.8, alert: "alert" });
  Check(director.ShouldInvestigate(soldier, far, 50) === false, "反例：太远，不追");

  const tooNear = MakeTrack({ id: 99, x: 0, z: INVESTIGATE.minM - 1, time: 50, confidence: 0.8, alert: "alert" });
  Check(director.ShouldInvestigate(soldier, tooNear, 50) === false, "反例：已经站在最后目击点上了");

  const unaware = MakeTrack({ id: 99, x: 0, z: 20, time: 50, confidence: 0.8, alert: "unaware", awareness: 0 });
  Check(director.ShouldInvestigate(soldier, unaware, 50) === false, "反例：还没起疑心");
  const byAwareness = MakeTrack({ id: 99, x: 0, z: 20, time: 50, confidence: 0.8, awareness: INVESTIGATE.minAwareness });
  Check(director.ShouldInvestigate(soldier, byAwareness, 50) === true, "没有 alert 字段时用 awareness 兜底");

  const stale = MakeTrack({ id: 99, x: 0, z: 20, time: 50 - INVESTIGATE.maxAgeS - 1, confidence: 0.8, alert: "alert" });
  Check(director.ShouldInvestigate(soldier, stale, 50) === false, "反例：情报太旧");

  const held = MakeSoldier({ x: 0, z: 0, holdZone: { x: 0, z: 0, radius: 6 } });
  Check(director.ShouldInvestigate(held, near, 50) === false, "反例：守区的人不许离岗去查看");
  const scripted = MakeSoldier({ x: 0, z: 0, scriptDefensive: true });
  Check(director.ShouldInvestigate(scripted, near, 50) === false, "反例：剧本防守的人不去查看");

  // UpdateSquad 里：没有交火价值的旧情报会变成 INVESTIGATE
  const host2 = MakeHost({ now: 50 });
  const director2 = new TacticsDirector(host2, MakeCoverRegistry());
  const members = MakeSixManSquad({ squadId: "iv_1", z: 0 });
  const group = MakeGroup(members, { id: "iv_1" });
  const blackboard = director2.Blackboard("iv_1", "ija");
  // 情报旧到不值得压制（suppressMaxAgeS 之外），但还没被黑板遗忘
  const age = TACTICS.suppressMaxAgeS + 1;
  Check(age < BLACKBOARD.blackboardMemoryS, "这条情报还在黑板记忆窗口里");
  for (const m of members) {
    blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 20, time: 50 - age, confidence: 0.8, alert: "alert" }));
  }
  director2.UpdateSquad(group, null);
  const scouts = members.filter((m) => m.task.kind === TASK.INVESTIGATE);
  Check(scouts.length > 0, "旧情报会派人去查看，而不是原地发呆");
  Check(scouts[0].task.point.z === 20, "查看任务的落点就是最后目击位置");
}
console.log("ok  查看：置信度/距离/警戒级别/时效/守区五道闸，旧情报转 INVESTIGATE");

// ===========================================================================
{
  // --- ⑨ 黑板：合并、过期、Primary 迟滞 ---------------------------------
  const host = MakeHost();
  const blackboard = new SquadBlackboard("bb_1", "ija", host);
  const a = MakeSoldier({ id: 1 });
  const b = MakeSoldier({ id: 2 });

  host.now = 2;
  blackboard.Share(a, MakeTrack({ id: 99, x: 1, z: 1, time: 1, confidence: 0.9 }));
  blackboard.Share(b, MakeTrack({ id: 99, x: 2, z: 2, time: 2, confidence: 0.4 }));
  let entry = blackboard.Get(99);
  Check(entry.lkp.x === 2 && entry.lkp.time === 2, "同一目标取最新的一条（新的压过旧的）");
  Check(entry.lkp.confidence === 0.4, "置信度跟着最新那条走");

  blackboard.Share(a, MakeTrack({ id: 99, x: 3, z: 3, time: 2, confidence: 0.8 }));
  entry = blackboard.Get(99);
  Check(entry.lkp.x === 3, "同一时刻取置信度更高的那条");

  blackboard.Share(b, MakeTrack({ id: 99, x: 9, z: 9, time: 0.5, confidence: 1 }));
  entry = blackboard.Get(99);
  Check(entry.lkp.x === 3, "更旧的情报不许覆盖新情报（哪怕当时看得更清楚）");

  Check(blackboard.Enemies().length === 1, "同一个人只占一条");
  Check(blackboard.Get(99).seenBy === 2, "seenBy 数的是有几个人上报过");

  host.now = 2 + BLACKBOARD.blackboardMemoryS + 1;
  Check(blackboard.Enemies().length === 0, "过了 blackboardMemoryS 的条目被清掉");
  Check(blackboard.Primary() === null, "黑板空了就没有队级焦点");

  // Primary 的四秒迟滞 + 三成距离差
  const host2 = MakeHost();
  const board = new SquadBlackboard("bb_2", "ija", host2);
  board.SetCenter(0, 0);
  host2.now = 0;
  board.Share(a, MakeTrack({ id: 11, x: 0, z: 10, time: 0 }));
  Check(board.Primary().id === 11, "第一个敌情直接当焦点");
  host2.now = 1;
  board.Share(b, MakeTrack({ id: 12, x: 0, z: 5, time: 1 }));
  Check(board.Primary().id === 11, "迟滞窗口内更近的新目标也不换（不许六把枪一起摆）");
  host2.now = BLACKBOARD.focusHoldS + 0.5;
  board.Share(a, MakeTrack({ id: 11, x: 0, z: 10, time: host2.now }));
  board.Share(b, MakeTrack({ id: 12, x: 0, z: 5, time: host2.now }));
  Check(10 > 5 * BLACKBOARD.switchRatio, "10 m 与 5 m 的差距确实超过三成");
  Check(board.Primary().id === 12, "窗口过后、且新目标近出三成以上，才换焦点");

  // 差距不到三成就不换
  const host3 = MakeHost();
  const board3 = new SquadBlackboard("bb_3", "ija", host3);
  board3.SetCenter(0, 0);
  board3.Share(a, MakeTrack({ id: 21, x: 0, z: 10, time: 0 }));
  board3.Primary();
  host3.now = BLACKBOARD.focusHoldS + 1;
  board3.Share(a, MakeTrack({ id: 21, x: 0, z: 10, time: host3.now }));
  board3.Share(b, MakeTrack({ id: 22, x: 0, z: 9, time: host3.now }));
  Check(board3.Primary().id === 21, "只近一点点不值得全队换目标");

  // 上限：超过 maxEnemies 丢最旧的
  const host4 = MakeHost();
  const board4 = new SquadBlackboard("bb_4", "ija", host4);
  for (let i = 0; i < BLACKBOARD.maxEnemies + 3; i += 1) {
    host4.now = i;
    board4.Share(a, MakeTrack({ id: 500 + i, x: i, z: 0, time: i }));
  }
  Check(board4.Enemies().length <= BLACKBOARD.maxEnemies, "黑板不会无限膨胀");
  Check(board4.Get(500) === null, "挤掉的是最旧的那条");
}
console.log("ok  黑板：最新/同刻高置信合并、seenBy、过期清理、Primary 四秒迟滞与三成差");

// ===========================================================================
{
  // --- ⑩ 死人不占位、换关重置 -------------------------------------------
  const host = MakeHost();
  const director = new TacticsDirector(host, MakeCoverRegistry());
  const members = MakeSixManSquad({ squadId: "dz_1" });
  const group = MakeGroup(members, { id: "dz_1" });
  const blackboard = director.Blackboard("dz_1", "ija");
  for (const m of members) blackboard.Share(m, MakeTrack({ id: 99, x: 0, z: 0, time: 0, yaw: Math.PI }));
  director.UpdateSquad(group, null);
  const shooter = members.find((m) => m.task.kind === TASK.ENGAGE);
  Check(director.HasToken(shooter.id, 99) === true, "开火的人持有令牌");

  shooter.alive = false;
  host.now = 1;
  director.UpdateSquad(MakeGroup(members, { id: "dz_1" }), null);
  Check(director.HasToken(shooter.id) === false, "阵亡的人把令牌交回来");
  Check(shooter.task.kind === null, "阵亡的人任务被清空");

  director.Reset();
  Check(director.TokenCount(99) === 0, "换关重置清空令牌");
  Check(director.State().squads.length === 0, "换关重置清空班记录");

  const state = director.State();
  Check(Array.isArray(state.tokens) && typeof state.stats.updates === "number", "取证口给的是脱敏快照");
}
console.log("ok  死亡与换关：令牌回收、任务清空、Reset 清台");

console.log(`\nAiTacticsTest 通过：${checks} 条断言`);
