// Script_FirstLevelFrontPressureTest.mjs —— 第一关敌军「不当木桩」这一轮的纯 Node 门禁（docs/Data_EnemyAi.md §20）。
//
// 覆盖四块：
//   ① 压力表数据（Data_FirstLevelFrontPressure）：相位事实是真事实、组员在名册里、每个跃进组每相位都有
//      下一步（loop）、每相位最多一次成组冲锋、让口子的相位不打撤退口、授权点与各路线不穿实体；
//   ② 压力表运行时（Script_FirstLevelFrontPressure）在假运行时上：任务侧开关、相位切换写的跃进范围 /
//      组标记 / 军官、环境射击点与过口窗口、伤亡退线与 frontAttackRepelled、成组冲锋只一次、让口子、
//      阵位守卫非 hold 与后撤、出 02–05 收回授权点；
//   ③ 大脑（Script_Ai 的真实方法，three 走 vendor）：环境射击挑点 / 接管枪口 / 一发的账（命中恒 false、
//      不占令牌、不扣玩家血）、迟疑、成组冲锋与跟冲、军官阵亡、喊话点名与任务侧开关、掩体开关；
//   ④ 01 背景兵（Script_FirstLevelBackdropSquads）：跑—停—打的节拍、交接、离开 01–02 整组撤场。
//
// 直接 node 跑：node Taierzhuang1938/Script_FirstLevelFrontPressureTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FRONT_PRESSURE_PHASES, FRONT_PRESSURE_GROUPS, FRONT_FIRE_POINTS, FRONT_PRESSURE_STAGES, FRONT_PRESSURE_TACTICS,
  FRONT_RESERVE_ROAD_LANE, FRONT_PRESSURE_TICK,
} from "./Data_FirstLevelFrontPressure.mjs";
import {
  FirstLevelFrontPressure, FrontPressurePhase, FrontFirePoints, FrontGroupMembers, AssaultRoundEnd, AssaultTop,
  NearestLineIndex, GroupFallbackDue, FrontChargeDue, FrontChargeCheck, FIRST_LEVEL_AI_RULE_STEPS, PressureRoute, RouteIndex,
  RushStalled, RushPaused, AssaultState, LanePoints, RunBackSeconds, StalemateDue, ReserveDue,
} from "./Script_FirstLevelFrontPressure.mjs";
import { Sight, Eye } from "./Script_FirstLevelSpaceProbe.mjs";
import { FRONT_SORTIE, FRONT_SPACE } from "./Data_FirstLevelFrontRoute.mjs";
import { BACKDROP_SQUADS, BACKDROP_FIRE_POINTS } from "./Data_FirstLevelBackdropSquads.mjs";
import { FirstLevelBackdropSquads, BackdropStep, BackdropFirePoints, InCameraView } from "./Script_FirstLevelBackdropSquads.mjs";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TACTICS, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_FACT_GATES } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { FrontAssaultLane } from "./Data_FirstLevelMissionFront.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { MISSION_DEFENSE_OBJECTS, MISSION_STAKE_FENCE } from "./Data_FirstLevelMissionFortifications.mjs";
import { AMBIENT_FIRE } from "./Data_Tuning_AiShooting.mjs";
import { SQUAD_REACTION, CHARGE_FOLLOW, MELEE_STALL } from "./Data_Tuning_AiTactics.mjs";
import { COVER_CYCLE } from "./Data_Tuning_AiCover.mjs";

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks += 1; };
const Eq = (a, b, message) => { assert.deepEqual(a, b, message); checks += 1; };

// ---------------------------------------------------------------------------
// ① 数据
// ---------------------------------------------------------------------------
const roster = new Map(Object.entries(MISSION_ENCOUNTERS).flatMap(([encounter, list]) =>
  list.map((spec) => [spec.id, { ...spec, encounter }])));
const facts = new Set([...MISSION_STAGES.flatMap((s) => s.requirements), ...Object.keys(MISSION_FACT_GATES)]);
const steps = new Set(MISSION_STAGES.map((s) => s.id));
for (const [groupId, group] of Object.entries(FRONT_PRESSURE_GROUPS)) {
  if (group.ids) for (const id of group.ids) Check(roster.has(id), `group ${groupId} member ${id} is in MISSION_ENCOUNTERS`);
  if (group.encounter) Check(!!MISSION_ENCOUNTERS[group.encounter], `group ${groupId} encounter ${group.encounter} exists`);
  if (group.officer) Check(group.ids?.includes(group.officer), `group ${groupId} officer belongs to the group`);
}
for (const step of [...FRONT_PRESSURE_STAGES, ...FIRST_LEVEL_AI_RULE_STEPS]) Check(steps.has(step), `step ${step} is a mission step`);
Check(!FIRST_LEVEL_AI_RULE_STEPS.includes("South"), "07 and later never get the mission AI switches");
for (const phase of FRONT_PRESSURE_PHASES) {
  if (phase.when) Check(facts.has(phase.when), `phase ${phase.id} waits for a real fact: ${phase.when}`);
  for (const step of phase.stages || []) Check(FRONT_PRESSURE_STAGES.includes(step), `phase ${phase.id} step ${step}`);
  for (const id of phase.fire) Check(!!FRONT_FIRE_POINTS[id], `phase ${phase.id} fire point ${id} exists`);
  if (phase.yield) Check(phase.fire.every((id) => !FRONT_FIRE_POINTS[id].gapPath),
    `yield phase ${phase.id} never authorises the withdrawal gap`);
  let charges = 0;
  for (const [groupId, cfg] of Object.entries(phase.groups || {})) {
    Check(!!FRONT_PRESSURE_GROUPS[groupId], `phase ${phase.id} group ${groupId} is declared`);
    Check(["hold", "assault", "nestGuard"].includes(cfg.role), `phase ${phase.id} ${groupId} role ${cfg.role}`);
    // 「跃进不能在 60–90 s 后停摆：每相位都有下一步」—— 每个跃进组在每个相位都是循环的。
    if (cfg.role === "assault") Check(cfg.loop === true, `phase ${phase.id} ${groupId} always has a next step (loop)`);
    // A group's own fire list (the fire base): known points only, never the withdrawal gap it cannot see anyway.
    if (cfg.fire) Check(cfg.fire.length > 0 && cfg.fire.every((id) => FRONT_FIRE_POINTS[id] && !FRONT_FIRE_POINTS[id].gapPath),
      `phase ${phase.id} ${groupId} fire list names known non-gap points`);
    if (cfg.charge) charges += 1;
    if (cfg.fallback?.repelledFact) Check(facts.has(cfg.fallback.repelledFact), `${cfg.fallback.repelledFact} is a mission fact`);
  }
  Check(charges <= 1, `phase ${phase.id} scripts at most one group charge`);
}
const bounds = MISSION_LAYOUT.bounds;
for (const [id, p] of [...Object.entries(FRONT_FIRE_POINTS), ...Object.entries(BACKDROP_FIRE_POINTS)]) {
  Check([p.x, p.z, p.h, p.r].every(Number.isFinite), `fire point ${id} is finite`);
  Check(p.x > bounds.minX && p.x < bounds.maxX && p.z > bounds.minZ && p.z < bounds.maxZ, `fire point ${id} is on the map`);
  Check(p.h >= 0 && p.h <= 2 && p.r > 0 && p.r <= 5, `fire point ${id} height/scatter are sane`);
}
// Every authored leg this package adds must clear solid blocks (same capsule test as FirstLevelMissionTest)
// and the solid battlefield obstacles (barbed-wire stake fences are not in MISSION_LAYOUT.blocks: the first
// 01 backdrop draft ran three men straight into WestWire at z = -147 and they stood there).
const OBSTACLES = MISSION_DEFENSE_OBJECTS.filter((o) => o.solid).map((o) => o.asset === "battlefieldBarbedWire02"
  ? { id: o.id, x: o.x, z: o.z, ry: o.ry || 0, w: 2 * MISSION_STAKE_FENCE.wireHalfLength * (o.scale || 1), d: 0.1 }
  : { id: o.id, x: o.x, z: o.z, ry: o.ry || 0, w: 3, d: 3 });
function RouteClear(name, route) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], distance = Math.hypot(a.x - b.x, a.z - b.z);
    for (let d = 0; d <= distance; d += 0.4) {
      const t = distance ? d / distance : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = SampleMissionTerrain(x, z);
      for (const box of MISSION_LAYOUT.blocks) {
        if (MISSION_LAYOUT.walkableSurfaces.some((surface) => surface.id === box.id) || box.solid === false) continue;
        const dx = x - box.x, dz = z - box.z, c = Math.cos(box.ry || 0), s = Math.sin(box.ry || 0);
        const blocked = Math.abs(dx * c - dz * s) < box.w / 2 + 0.35 && Math.abs(dx * s + dz * c) < box.d / 2 + 0.35
          && box.y + box.h / 2 > y + 0.3 && box.y - box.h / 2 < y + 1.7;
        assert.equal(blocked, false, `${name} crosses ${box.id} at ${x.toFixed(1)},${z.toFixed(1)}`);
      }
      for (const o of OBSTACLES) {
        const dx = x - o.x, dz = z - o.z, c = Math.cos(o.ry), s = Math.sin(o.ry);
        const hit = Math.abs(dx * c - dz * s) < o.w / 2 + 0.35 && Math.abs(dx * s + dz * c) < o.d / 2 + 0.35;
        assert.equal(hit, false, `${name} runs into ${o.id} at ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
  checks += 1;
}
// Lanes the table hands out (Front 2026-09-24): the flank group / officer own lanes, the jump-off reserve field lanes,
// the road reserve down the tank road. Checked once per distinct (man, lane).
{
  const walked = new Set();
  for (const phase of FRONT_PRESSURE_PHASES) for (const [groupId, cfg] of Object.entries(phase.groups || {})) {
    if (!cfg.lane) continue;
    for (const id of FRONT_PRESSURE_GROUPS[groupId].ids || []) {
      const key = `${id}:${typeof cfg.lane === "string" ? cfg.lane : "road"}`;
      if (walked.has(key)) continue;
      walked.add(key);
      const spec = roster.get(id), lane = LanePoints(spec, cfg.lane);
      Check(Array.isArray(lane) && lane.length >= 2, `${groupId}/${id} gets a lane of at least two bounds`);
      RouteClear(`lane ${groupId}/${id}`, [spec, ...lane]);
    }
  }
  Check(walked.size >= FRONT_PRESSURE_GROUPS.flank.ids.length + FRONT_PRESSURE_GROUPS.reserveWest.ids.length + FRONT_PRESSURE_GROUPS.reserveRoad.ids.length,
    "every flank man, the officer and every reserve got a lane checked");
}
for (const phase of FRONT_PRESSURE_PHASES) for (const [groupId, cfg] of Object.entries(phase.groups || {})) {
  if (!cfg.points) continue;
  for (const id of FRONT_PRESSURE_GROUPS[groupId].ids || []) {
    const spec = roster.get(id);
    RouteClear(`${phase.id}/${groupId}/${id}`, [spec, ...PressureRoute(FrontAssaultLane(spec.x, spec.z), cfg)]);
  }
}
Eq([RouteIndex(-1, 3), RouteIndex(-2, 3), RouteIndex(5, 3), RouteIndex(-9, 3)], [2, 1, 2, 0], "negative route indices count from the end");
{
  const anchor = FRONT_PRESSURE_PHASES[0].groups.nest.fallback.to;
  RouteClear("nest fallback anchor", [anchor, { x: anchor.x + 0.01, z: anchor.z }]);
}
for (const [id, plan] of Object.entries(FRONT_PRESSURE_TACTICS)) {
  Check(MISSION_TACTICS[id] === plan, `MISSION_TACTICS keeps the pressure-table route for ${id}`);
  Check(facts.has(plan.fact) && !plan.near, `${id} is released by a real mission fact, never a standby proximity gate`);
  RouteClear(`tactic ${id}`, [roster.get(id), ...plan.points]);
}
for (const spec of BACKDROP_SQUADS.members) {
  RouteClear(`backdrop ${spec.id}`, [spec, ...spec.route]);
  for (const stop of spec.route) for (const id of stop.fire) Check(!!BACKDROP_FIRE_POINTS[id], `backdrop ${spec.id} fire ${id}`);
  Check(spec.route.at(-1).fire.length > 0, `backdrop ${spec.id} ends on a firing stop`);
}
console.log(`ok ① pressure / backdrop data: ${FRONT_PRESSURE_PHASES.length} phases, facts real, routes clear, every assault phase loops`);

// ---------------------------------------------------------------------------
// ② 压力表运行时（假运行时）
// ---------------------------------------------------------------------------
{
  // Pure helpers first.
  const has = new Set();
  const Has = (id) => has.has(id);
  Eq(FrontPressurePhase("Trapped", Has), null, "01 has no front pressure phase");
  Eq(FrontPressurePhase("BunkerRescue", Has)?.id, "standby");
  Eq(FrontPressurePhase("Support", Has), null, "Support before frontBattleStarted keeps the old standby behaviour");
  has.add("frontBattleStarted"); Eq(FrontPressurePhase("Support", Has)?.id, "assault");
  has.add("rightNestCaptured"); Eq(FrontPressurePhase("Support", Has)?.id, "nestLost");
  has.add("frontRifleDefense"); Eq(FrontPressurePhase("Support", Has)?.id, "firstWithdrawal");
  has.add("rifleWithdrawalResolved"); has.add("tankPreviewed"); Eq(FrontPressurePhase("Support", Has)?.id, "tankShown");
  has.add("tankPositionPressured"); Eq(FrontPressurePhase("MachineGun", Has)?.id, "tankPressure");
  Eq(FrontPressurePhase("Support", Has)?.id, "tankShown", "a phase only runs in its own steps");
  has.add("bundleTaken"); has.add("tankImmobilized"); Eq(FrontPressurePhase("Tank", Has)?.id, "secondWithdrawal");
  has.add("lastGuardsWithdrawn"); Eq(FrontPressurePhase("Tank", Has)?.id, "disengage");
  Eq(FrontPressurePhase("Orders", Has), null, "06 and later have no pressure phase");
  const assault = FRONT_PRESSURE_PHASES.find((p) => p.id === "assault");
  Check(FrontFirePoints(assault, false).some((p) => p.id === "gapWest"), "normal windows authorise the gap sides");
  Check(!FrontFirePoints(assault, true).some((p) => FRONT_FIRE_POINTS[p.id].gapPath), "evacuation windows never fire on the gap path");
  // Round logic.
  const s = { points: [{ x: 0, z: -187 }, { x: 0, z: -175.5 }, { x: 0, z: -166 }, { x: 0, z: -159.5 }],
    index: 0, hold: 9, shifts: 0, cycles: 0, volley: 0, mode: "hold" };
  const actor = { fireSequence: 7 };
  Eq(AssaultRoundEnd(actor, s, R, false), "advance"); Eq(s.index, 1);
  s.index = 3; Eq(AssaultRoundEnd(actor, s, R, true), "round"); Eq(s.volley, 7);
  s.shifts = R.assaultLateralShifts; Eq(AssaultRoundEnd(actor, s, R, true), "regroup"); Eq(s.index, R.assaultRegroupLine);
  s.index = 3; s.shifts = R.assaultLateralShifts; s.cycles = R.assaultRegroupCycles;
  Eq(AssaultRoundEnd(actor, s, R, true), "settled", "without the pressure table the finite rhythm ends");
  s.loop = true; Eq(AssaultRoundEnd(actor, s, R, true), "regroup", "a looping phase always has a next step");
  s.maxIndex = 0; s.regroupLine = 2; s.index = 3; s.shifts = R.assaultLateralShifts;
  Eq(AssaultTop(s), 0); AssaultRoundEnd(actor, s, R, true); Eq(s.index, 0, "regroup never lands beyond the phase cap");
  s.holdUntil = 50; s.index = 0; Eq(AssaultRoundEnd(actor, s, R, false, 10), "wait", "a group that just fell back waits out holdS");
  Eq(s.index, 0);
  delete s.maxIndex; Eq(NearestLineIndex(s, { x: 0, z: -167 }), 2);
  // §20.7 A rush into a wall: no progress for assaultRushStallS and the line counts as reached where he stands.
  {
    const r = { index: 1 }, line = { x: 0, z: -175.5 };
    Check(!RushStalled(r, { x: 0, z: -180 }, line, 0.1, R), "the first frame of a rush only sets the mark");
    Check(!RushStalled(r, { x: 0, z: -179 }, line, R.assaultRushStallS - 0.2, R), "real progress resets the stall clock");
    Check(!RushStalled(r, { x: 0, z: -178.9 }, line, R.assaultRushStallS - 0.2, R), "less than assaultRushProgressM is not progress, but the clock is not up yet");
    Check(RushStalled(r, { x: 0, z: -178.9 }, line, 0.3, R), "no progress for assaultRushStallS: stalled");
    r.index = 2; Check(!RushStalled(r, { x: 0, z: -178.9 }, { x: 0, z: -166 }, 10, R), "a new line restarts the clock");
    // 2026-09-24 review: an officer's death froze his men for 3-5 s and the rush clock called that a stall.
    Check(SQUAD_REACTION.officerHesitateMaxS > R.assaultRushStallS, "fixture: a long hesitation outlasts the stall window");
    Check(RushPaused({ hesitateUntil: 10 }, 9) && RushPaused({ state: "reload" }, 0) && RushPaused({ state: "grenade" }, 0)
      && !RushPaused({ hesitateUntil: 10, state: "advance" }, 10.01), "hesitating / reloading / throwing is a pause, not a stall");
  }
  const people = [1, 2, 3, 4].map((i) => ({ alive: i > 2 }));
  Check(GroupFallbackDue(people, 4, { casualtyFraction: 0.5 }), "half dead trips the fallback");
  Check(!GroupFallbackDue(people.map(() => ({ alive: true })), 4, { casualtyFraction: 0.5 }));
  Check(GroupFallbackDue(people, 4, { casualties: 2 }) && !GroupFallbackDue(people, 4, { casualties: 3 }));
  Check(!GroupFallbackDue(people.map(() => ({ alive: false })), 4, { casualtyFraction: 0.5 }), "a dead group has nobody left to fall back");
  const line = (i) => ({ alive: true, position: { x: i, z: -159.5 }, missionAssault: { mode: "hold", index: 3, points: s.points } });
  const rule = { afterS: 30, minAlive: 4, playerWithinM: 60, lastLineShare: 0.5 };
  Check(!FrontChargeDue([0, 1, 2, 3].map(line), rule, 10, { x: 0, z: -142 }), "no charge before afterS");
  Check(FrontChargeDue([0, 1, 2, 3].map(line), rule, 31, { x: 0, z: -142 }), "charge once the group holds its last line near the player");
  Check(!FrontChargeDue([0, 1, 2, 3].map(line), rule, 31, { x: 0, z: -60 }), "no charge at a far player");
  Check(!FrontChargeDue([0, 1, 2].map(line), rule, 31, { x: 0, z: -142 }), "no charge below minAlive");
  Eq([FrontChargeCheck([0, 1, 2, 3].map(line), rule, 10, { x: 0, z: -142 }), FrontChargeCheck([0, 1, 2].map(line), rule, 31, { x: 0, z: -142 }),
    FrontChargeCheck([0, 1, 2, 3].map(line), rule, 31, { x: 0, z: -60 })], ["tooEarly", "tooFew", "playerFar"], "a missed charge names its reason");
  const rushing = (i) => ({ ...line(i), missionAssault: { mode: "rush", index: 3, points: s.points } });
  Check(FrontChargeDue([0, 1, 2, 3].map(rushing), rule, 31, { x: 0, z: -142 }), "men still running up to the last line count as pressed forward");
  const back = (i) => ({ ...line(i), missionAssault: { mode: "hold", index: 1, points: s.points } });
  Eq(FrontChargeCheck([0, 1, 2, 3].map(back), rule, 31, { x: 0, z: -142 }), "notForward");
}
const PRESSURE_ENCOUNTERS = ["approach", "front", "frontFlank", "frontOfficer", "machineGun", "tank", "bundleApproach", "village"];
function MakeActor(encounter, spec) {
  const weapon = WEAPONS[spec.weapon || "Type38"];
  const points = ["front", "machineGun"].includes(encounter) && !spec.hold ? FrontAssaultLane(spec.x, spec.z) : [];
  return {
    missionId: spec.id, missionEncounter: encounter, alive: true, weapon, weaponId: spec.weapon || "Type38",
    position: { x: spec.x, y: 0, z: spec.z }, holdZone: { x: spec.x, z: spec.z, radius: spec.hold ? 0.4 : 2 },
    scriptDefensive: !!spec.hold, tacticalRadiusM: spec.hold ? 0 : R.infantryTacticalRadiusM, grenades: 0, fireSequence: 0,
    missionFrontStandby: encounter === "machineGun", target: { isPlayer: true },
    missionAssault: points.length ? AssaultState(spec.x, spec.z, points) : null,
  };
}
function MakeWorld(stage = "BunkerRescue") {
  const world = { facts: new Set(), barks: [], charges: [], defends: [], threats: new Set(), records: [], spawned: [] };
  const enemies = new Map();
  for (const [encounter, list] of Object.entries(MISSION_ENCOUNTERS)) {
    if (!PRESSURE_ENCOUNTERS.includes(encounter)) continue;
    for (const spec of list) enemies.set(spec.id, MakeActor(encounter, spec));
  }
  const r = {
    flow: { stage: { id: stage } }, time: 0, enemies, guards: [], spawnQueue: [],
    Has: (id) => world.facts.has(id), Record: (id, detail) => { world.facts.add(id); world.records.push([id, detail]); },
    ai: { missionCoverRules: false, missionReactions: false, time: 0,
      Bark: (a, kind) => world.barks.push([a.missionId, kind]),
      SetStance: (a, stance) => { a.stance = stance; (world.stances ||= []).push([a.missionId, stance]); },
      GroupCharge: (members, opts) => { world.charges.push({ ids: members.map((a) => a.missionId), leader: opts.leader?.missionId ?? null }); return members.length; } },
    player: { position: { x: 25.9, z: -153.9 } },
    Defend: (a, p, radius, slack) => { world.defends.push([a.missionId, p.x, p.z, radius, slack]); a.holdZone = { x: p.x, z: p.z, radius }; a.scriptDefensive = !(a.tacticalRadiusM > 0); },
    Threatens: (point, ids) => world.threats.has(ids[0]),
    SpawnEncounterActor: (id, spec) => { const a = MakeActor(id, spec); enemies.set(spec.id, a); world.spawned.push(spec.id); return a; },
  };
  const Drain = () => { while (r.spawnQueue.length) r.spawnQueue.shift()(); };
  return { r, world, enemies, Drain, pressure: new FirstLevelFrontPressure(r) };
}
{
  const { r, world, enemies, pressure } = MakeWorld("Trapped");
  pressure.Update();
  Check(r.ai.missionCoverRules && r.ai.missionReactions, "01 opens the mission AI switches");
  Eq(pressure.phase, null);
  r.flow.stage.id = "BunkerRescue"; pressure.Update();
  Eq(pressure.phase?.id, "standby");
  const front = enemies.get("FrontRifleA"), village = enemies.get("VillageCorner");
  Check(Array.isArray(front.ambientFirePoints) && front.ambientFirePoints.length > 0, "02 front riflemen get authorised points");
  Check(Array.isArray(enemies.get("FrontFlankA").ambientFirePoints), "02 the flank group fires on authorised points too (no man on the front stands idle)");
  Eq(village.ambientFirePoints ?? null, null, "a village enemy never gets front fire points");
  const gunner = enemies.get("RightNestGunner"), guard = enemies.get("RightNestGuard");
  Check(gunner.scriptDefensive && !(gunner.tacticalRadiusM > 0), "the nest gunner stays on hold");
  Check(!guard.scriptDefensive && guard.tacticalRadiusM === R.nestGuardTacticalRadiusM && guard.grenades === R.nestGuardGrenades,
    "nest riflemen are live local-area soldiers with one grenade");
  Eq(world.barks.length, 0, "no bark on the very first phase");
  // 03 opens.
  r.flow.stage.id = "Support"; world.facts.add("frontBattleStarted"); r.time = 1; pressure.Update();
  Eq(pressure.phase.id, "assault");
  // The jump-off trench push group waits offstage until the tank shows (FRONT_PRESSURE_GROUPS.mgAttack.offstage).
  const mgPush = FrontGroupMembers("mgAttack", enemies);
  Check(mgPush.length === 4 && mgPush.every((a) => a.missionDormant && a.scriptedNoncombatant), "03: the push group waits offstage before the tank shows");
  {
    const gunnerMan = enemies.get("RightNestGunner"), guardMan = enemies.get("RightNestGuard");
    gunnerMan.alive = false; gunnerMan.drop = { weaponId: "Type11", taken: false }; guardMan.alive = false; guardMan.drop = { weaponId: "Type38", taken: false };
    r.time += 0.1; pressure.Update();
    Check(gunnerMan.drop.taken && !guardMan.drop.taken, "the nest gunner leaves no second LMG on the captured gun's seat; the riflemen still drop theirs");
    gunnerMan.alive = true; guardMan.alive = true;
  }
  // The fire base fires from its own list (crest and left gun only); the bounders keep the phase list.
  const fbIds = (enemies.get("FrontGunner").ambientFirePoints || []).map((p) => p.id);
  const assaultPhase = FRONT_PRESSURE_PHASES.find((p) => p.id === "assault");
  Eq(fbIds, [...assaultPhase.groups.fireBase.fire], "the fire base picks from its own list");
  {
    const fg = enemies.get("FrontGunner"), post = assaultPhase.groups.fireBase.posts?.FrontGunner;
    Check(post && fg.holdZone && Math.hypot(fg.holdZone.x - post.x, fg.holdZone.z - post.z) < 1e-6,
      "the fire base LMG holds its measured post at the west end of its wall (not behind the wall's middle)");
  }
  Eq((enemies.get("FrontRifleA").ambientFirePoints || []).map((p) => p.id), [...assaultPhase.fire], "the bounders keep the phase list");
  // Fire base stance: out of the cover cycle they stand to fire over the 1.1 m wall; the cover cycle and heavy
  // suppression stay with the AI.
  {
    const fg = enemies.get("FrontGunner"), fs = enemies.get("FrontSupportGunner"), fh = enemies.get("FrontRifleH");
    Object.assign(fg, { state: "fire", stance: 1, suppression: 0 }); Object.assign(fs, { state: "cover_engage", stance: 1, suppression: 0 });
    Object.assign(fh, { state: "suppress", stance: 2, suppression: 0.8 });
    r.time += 1; pressure.Update();
    Check(fg.stance === 0 && fs.stance === 1 && fh.stance === 2, "the fire base stands to fire over its wall, except in the cover cycle or pinned down");
  }
  const west = FrontGroupMembers("boundWest", enemies), east = FrontGroupMembers("boundEast", enemies);
  Eq([west.length, east.length], [3, 3], "two bounding teams of three");
  Check(west.every((a) => a.reactionGroup === "boundWest" && a.missionFireGroup === "boundWest"), "bounders carry their group tags");
  Check([...west, ...east].every((a) => a.missionAssault.loop && a.missionAssault.maxIndex === a.missionAssault.points.length - 1),
    "the assault phase lets both teams push to their last line and loop");
  Check(west.every((a) => a.missionAssault.regroupLine === 1) && east.every((a) => a.missionAssault.regroupLine === 2),
    "the teams regroup on different lines, so one is always forward while the other comes again");
  // Flank group: the table gives them the lane from the roster (they spawn without one).
  const flankA = enemies.get("FrontFlankA").missionAssault, flankSpec = roster.get("FrontFlankA");
  Eq(flankA.points, flankSpec.lane.map((p) => ({ x: p.x, z: p.z })), "the flank men bound crater to crater down their own lane");
  Check(flankA.index === 0 && flankA.loop && flankA.regroupLine === flankSpec.lane.length - 2, "from the first crater, looping from the second-to-last");
  const officer = enemies.get("FrontOfficer");
  Check(officer.aiOfficer && officer.missionAssault?.points.length === roster.get("FrontOfficer").lane.length
    && !enemies.get("FrontFlankA").aiOfficer, "the officer leads the flank group one bound behind, marked as the officer");
  Check(world.barks.some(([id, kind]) => id === "FrontOfficer" && kind === "advance"), "the officer shouts the advance on the phase change");
  // Gap discipline.
  Check(front.ambientFirePoints.some((p) => p.id === "gapWest"), "gap sides are authorised while nobody crosses");
  r.guards = [{ actor: { alive: true }, crossing: true, safe: false }]; pressure.Update();
  Check(!front.ambientFirePoints.some((p) => FRONT_FIRE_POINTS[p.id].gapPath), "a crossing guard closes the gap points at once");
  Check(pressure.events.some((e) => e.kind === "evacuationOpen"));
  r.guards = [];
  // Withdrawal: cap and yield.
  for (const a of [...west, ...east]) { a.missionAssault.index = a.missionAssault.points.length - 1; a.missionAssault.mode = "hold"; }
  world.facts.add("rightNestCaptured"); world.facts.add("frontRifleDefense"); r.time = 2; pressure.Update();
  Eq(pressure.phase.id, "firstWithdrawal");
  Check([...west, ...east].every((a) => a.missionAssault.index <= 2), "the withdrawal phase pulls the bounders off the last line");
  Check(flankA.maxIndex === flankA.points.length - 2, "the flank men stop one crater short of the one that sees the gap");
  const e0 = enemies.get("FrontRifleE"), a0 = e0.missionAssault; a0.mode = "hold"; const before = a0.index;
  e0.position = { ...a0.points[a0.index], y: 0 };
  Check(before >= 1, "fixture: E holds a line beyond the first");
  world.threats.add("FrontRifleE"); r.time = 3; pressure.Update();
  Eq(a0.index, before - 1, "a man who can see the gap during a withdrawal gives one line back");
  Eq(a0.maxIndex, a0.index, "and may not come forward again this phase");
  Check(pressure.events.some((e) => e.kind === "yield" && e.id === "FrontRifleE"));
  Check(a0.yieldUntil >= r.time + RunBackSeconds(e0.position, a0.points[a0.index], 0) - 1e-9 && a0.yieldUntil >= r.time + FRONT_PRESSURE_TICK.yieldMoveS,
    "the pulled man ignores close contact until he can have reached the line (never less than yieldMoveS)");
  // A man fighting at close range on his line (contact) is pulled back the same way (09-24: an LMG in contact by the
  // left gun kept the gap covered and the second batch never got out).
  {
    const g = enemies.get("FrontRifleD").missionAssault;
    g.index = Math.min(2, AssaultTop(g)); g.mode = "contact"; const was = g.index;
    enemies.get("FrontRifleD").yieldCheckAt = 0;
    world.threats.add("FrontRifleD"); r.time = 3.5; pressure.Update();
    Check(was >= 1 && g.index === was - 1 && g.mode === "rush" && g.yieldUntil > r.time, "a man in close contact who sees the gap gives a line back too");
    world.threats.delete("FrontRifleD");
  }
  const a1 = enemies.get("FrontRifleA").missionAssault; a1.index = 0; a1.mode = "hold";
  world.threats.add("FrontRifleA"); r.time = 4; pressure.Update();
  const specA = roster.get("FrontRifleA");
  Eq([a1.points[0].x, a1.points[0].z, a1.index, a1.maxIndex], [specA.x, specA.z, 0, 0],
    "a man already on his first line who still sees the gap goes back to where he started");
  world.threats.clear();
  // Casualty fallback.
  world.facts.add("rifleWithdrawalResolved"); r.time = 4.5; pressure.Update();
  Eq(pressure.phase.id, "firstDone");
  Check(a1.points.length === FrontAssaultLane(specA.x, specA.z).length && a1.route == null, "the next phase gives the yielded man his own lane back");
  const tops = new Map();
  for (const a of west) { a.missionAssault.index = AssaultTop(a.missionAssault); a.missionAssault.mode = "hold"; tops.set(a, a.missionAssault.index); }
  enemies.get("FrontRifleA").alive = false; enemies.get("FrontRifleB").alive = false;
  r.time = 5; world.barks.length = 0; pressure.Update();
  Check(west.filter((a) => a.alive).every((a) => a.missionAssault.index === Math.max(0, tops.get(a) - 1)
    && a.missionAssault.holdUntil > r.time), "half the team down: the survivor falls back one line and holds it for holdS");
  Check(world.barks.some(([id, kind]) => id === "FrontRifleC" && kind === "fallback"), "the survivor calls the fall back");
  // 2026-09-24 review: a group past half casualties used to fall back again on every later phase change.
  const fallbacksBefore = pressure.events.filter((e) => e.kind === "fallback" && e.group === "boundWest").length;
  // Flank group: two down, the rest go two craters back (out of the gap's sight: 03 "压下去了").
  {
    const flank = FrontGroupMembers("flank", enemies).filter((a) => a.missionId !== "FrontOfficer");
    for (const a of flank) { a.missionAssault.index = AssaultTop(a.missionAssault); a.missionAssault.mode = "hold"; }
    flank[0].alive = false; flank[1].alive = false; r.time = 5.3; pressure.Update();
    Check(flank.slice(2).every((a) => a.missionAssault.index === AssaultTop(a.missionAssault) - 2),
      "two flank men down: the other two fall back two craters");
  }
  // Machine-gun attack: charge once, then repelled.
  world.facts.add("tankPreviewed"); r.time = 6; pressure.Update();
  Check(FrontGroupMembers("mgAttack", enemies).every((a) => !a.missionDormant && !a.scriptedNoncombatant), "the tank shows: the push group wakes");
  Eq(pressure.phase.id, "tankShown");
  // Men of the machine-gun attack killed while they were still waiting are not the attack's casualties.
  const mgWait = FrontGroupMembers("mgAttack", enemies);
  Check(pressure.groupState.get("mgAttack").total === mgWait.length, "fixture: nobody of the attack died in standby here");
  r.time = 6.3; pressure.Update();
  Eq(pressure.events.filter((e) => e.kind === "fallback" && e.group === "boundWest").length, fallbacksBefore,
    "a group that already fell back does not fall back again on the next phase");
  const mg = FrontGroupMembers("mgAttack", enemies);
  for (const a of mg) { a.missionFrontStandby = false; a.missionAssault.index = a.missionAssault.points.length - 1; a.missionAssault.mode = "hold"; a.position = { ...a.missionAssault.points.at(-1), y: 0 }; }
  r.player.position = { x: -20, z: -150 };
  const chargeRule = FRONT_PRESSURE_PHASES.find((p) => p.id === "tankShown").groups.mgAttack.charge;
  r.time = 6 + chargeRule.afterS - 1; pressure.Update(); Eq(world.charges.length, 0, "no charge before afterS");
  r.time = 6 + chargeRule.afterS + 1; pressure.Update();
  Eq(world.charges.length, 1, "one scripted group charge in the phase");
  Eq(world.charges[0].leader, FRONT_PRESSURE_GROUPS.mgAttack.officer, "the officer leads it");
  Check(world.charges[0].ids.length >= 2 && mg.filter((a) => a.weapon.bayonet).every((a) => a.missionAssault.mode === "charge")
    && mg.filter((a) => !a.weapon.bayonet).every((a) => a.missionAssault.mode !== "charge"), "bayonet men are released from the script, machine gunners stay");
  r.time = 60; pressure.Update(); Eq(world.charges.length, 1, "never a second charge in the same phase");
  // Stalemate (Front 2026-09-24): a man in close contact with a man who cannot die gives a line back after essentialS;
  // against the player he keeps fighting up to contactS.
  {
    const rule = FRONT_PRESSURE_PHASES.find((p) => p.id === "tankShown").groups.mgAttack.stalemate;
    const gunnerMg = mg.find((a) => !a.weapon.bayonet), s = gunnerMg.missionAssault;
    s.mode = "contact"; s.index = AssaultTop(s); s.contactS = 0;
    gunnerMg.position = { ...s.points[s.index], y: 0 };
    gunnerMg.target = { isPlayer: false, ref: { scriptEssential: true } };
    const top = s.index;
    for (let t = 60.25; t < 60 + rule.essentialS - 0.5; t += 0.25) { r.time = t; pressure.Update(); }
    Eq(s.index, top, "not yet: the stand-off is younger than essentialS");
    for (let t = 60 + rule.essentialS - 0.5; t < 60 + rule.essentialS + 0.6; t += 0.25) { r.time = t; pressure.Update(); }
    Check(s.index === top - rule.backLines && s.mode === "rush" && s.yieldUntil > r.time,
      "a stand-off with an unkillable man (He Youtian at the left gun) is broken off one line back");
    Check(pressure.events.some((e) => e.kind === "stalemate" && e.id === gunnerMg.missionId && e.essential));
    s.mode = "contact"; s.contactS = 0; s.index = AssaultTop(s); gunnerMg.target = { isPlayer: true, ref: {} };
    const t0 = r.time;
    for (let t = t0 + 0.25; t < t0 + rule.essentialS + 1; t += 0.25) { r.time = t; pressure.Update(); }
    Eq(s.index, AssaultTop(s), "against the player the same man keeps fighting past essentialS");
    Check(StalemateDue(rule.contactS, false, rule) && !StalemateDue(rule.contactS - 0.1, false, rule), "contactS is the ordinary stand-off limit");
    s.mode = "hold";
  }
  for (const a of mg) a.alive = false;
  r.time += 1; pressure.Update();
  Check(world.facts.has("frontAttackRepelled"), "a destroyed machine-gun attack still records frontAttackRepelled");
  // A man who spawns after the phase change still gets this phase's orders (split-frame spawns, reinforcements).
  const late = { ...enemies.get("FrontRifleF"), missionId: "FrontRifleF", alive: true, pressurePhaseId: null, reactionGroup: null,
    missionAssault: { ...enemies.get("FrontRifleF").missionAssault, maxIndex: undefined, loop: false } };
  enemies.set("FrontRifleF", late);
  r.time += 0.5; pressure.Update();
  Check(late.reactionGroup === "boundEast" && late.missionAssault.loop === true && late.pressurePhaseId === "tankShown",
    "a late spawn picks up the phase config on the next group tick");
  // Nest fallback: two of four down.
  const { r: r2, world: w2, enemies: e2, pressure: p2 } = MakeWorld("BunkerRescue");
  p2.Update(); e2.get("RightNestGunner").alive = false; e2.get("RightEntryGuard").alive = false;
  r2.time = 1; p2.Update();
  const nestTo = FRONT_PRESSURE_PHASES[0].groups.nest.fallback.to;
  Check(w2.defends.some(([id, x, z, , slack]) => id === "RightNestGuard" && x === nestTo.x && z === nestTo.z && slack === R.nestFallbackCoverSlackM),
    "two nest casualties send the rest to the rear anchor, covers only right by it");
  const anchorToGun = Math.hypot(nestTo.x - FRONT_SORTIE.nest.x, nestTo.z - FRONT_SORTIE.nest.z);
  Check(anchorToGun - R.defendHoldRadiusM - R.nestFallbackCoverSlackM >= 7 && anchorToGun <= 14,
    "the rear anchor keeps the fallen-back guards out of bayonet reach of the gun, but in rifle reach (all four must die for the capture)");
  // ... and in sight: the seat (sitting 1.5, crouched 1.0), the west door (standing) and Luo's post (crouched) all see
  // a man standing, kneeling or crouching there (Space probe, same ray rule the runtime capture relies on).
  for (const [name, eye] of [["seat sitting", Eye(FRONT_SORTIE.seat, 1.5)], ["seat crouched", Eye(FRONT_SORTIE.seat, 1.0)],
    ["west door", Eye(FRONT_SPACE.westDoor, 1.55)], ["leader post", Eye(FRONT_SORTIE.leaderCover, 1.0)]])
    for (const h of [0.6, 1.0, 1.4]) Eq(Sight(eye, Eye(nestTo, h)), null, `the nest fallback anchor is in sight from the ${name} at ${h} m`);
  Check(w2.barks.some(([, kind]) => kind === "fallback"));
  // A group that lost men before its first phase counts casualties from the men it went in with.
  {
    const { r: r4, world: w4, enemies: e4, pressure: p4 } = MakeWorld("Support");
    w4.facts.add("frontBattleStarted");
    r4.time = 1; p4.Update();
    const mgMen = FrontGroupMembers("mgAttack", e4);
    const half = Math.ceil(mgMen.length / 2);
    for (const a of mgMen.slice(0, half)) a.alive = false;
    w4.facts.add("tankPreviewed"); r4.time = 2; p4.Update(); r4.time = 2.3; p4.Update();
    Check(!p4.events.some((e) => e.kind === "fallback" && e.group === "mgAttack"),
      "half the attack killed while waiting: it does not fall back the moment it shows");
    const st = p4.groupState.get("mgAttack");
    Eq([st.deadAtStart, st.total], [half, mgMen.length - half]);
    for (const a of mgMen.slice(half, half + Math.ceil((mgMen.length - half) / 2))) a.alive = false;
    r4.time = 2.6; p4.Update();
    Check(p4.events.some((e) => e.kind === "fallback" && e.group === "mgAttack"), "half of the men it went in with: now it falls back");
  }
  // Reinforcements (contract §2.8 / §6): nobody before the tank has pressed the nest; 2+2 in 04, 1 more in 05, never twice.
  {
    const { r: r5, world: w5, enemies: e5, Drain, pressure: p5 } = MakeWorld("MachineGun");
    for (const f of ["frontBattleStarted", "rightNestCaptured", "frontRifleDefense", "rifleWithdrawalResolved", "tankPreviewed"]) w5.facts.add(f);
    r5.time = 1; p5.Update(); Drain();
    Eq(w5.spawned.length, 0, "no reserve before tankPositionPressured");
    w5.facts.add("tankPositionPressured"); r5.time = 2; p5.Update(); Drain();
    const byEntry = (entry) => w5.spawned.filter((id) => roster.get(id).entry === entry).length;
    Eq([byEntry("NorthWestPlateau"), byEntry("RoadCutting")], [2, 2], "04 releases two from each hidden entry");
    r5.time = 2.5; p5.Update(); Drain(); Eq(w5.spawned.length, 4, "the same man is never queued twice");
    const westMan = e5.get(w5.spawned.find((id) => roster.get(id).entry === "NorthWestPlateau"));
    const roadMan = e5.get(w5.spawned.find((id) => roster.get(id).entry === "RoadCutting"));
    const westSpec = roster.get(westMan.missionId);
    Eq(westMan.missionAssault?.points, FrontAssaultLane(westSpec.x, westSpec.z), "the jump-off reserve bounds down the field lanes");
    Eq(roadMan.missionAssault?.points, FRONT_RESERVE_ROAD_LANE.map((p) => ({ x: p.x, z: p.z })), "the road reserve comes down the tank road");
    Check([westMan, roadMan].every((a) => a.reactionGroup?.startsWith("reserve") && a.ambientFirePoints?.length), "reserves carry group tags and fire points");
    r5.flow.stage.id = "Tank"; r5.time = 3; p5.Update(); Drain();
    Eq(w5.spawned.length, 5, "05 releases the last one");
    Eq(ReserveDue(MISSION_ENCOUNTERS.frontReserve, "Support").length, 0, "03 never releases a reserve");
  }
  // Phase exit logs why a configured charge never happened; a hold phase freezes a former assault man in place.
  {
    const { r: r3, world: w3, enemies: e3, pressure: p3 } = MakeWorld("Support");
    for (const f of ["frontBattleStarted", "tankPreviewed"]) w3.facts.add(f);
    r3.time = 1; p3.Update(); Eq(p3.phase.id, "tankShown");
    r3.time = 2; p3.Update();
    w3.facts.add("tankPositionPressured"); r3.flow.stage.id = "Tank"; r3.time = 3; p3.Update();
    Eq(p3.phase.id, "tankPressure");
    const notDue = p3.events.find((e) => e.kind === "chargeNotDue" && e.group === "mgAttack");
    Check(notDue && notDue.why === "tooEarly", "the skipped charge is logged with its reason");
    const bounder = e3.get("FrontRifleE").missionAssault;
    bounder.index = 1;
    w3.facts.add("bundleTaken"); w3.facts.add("tankImmobilized"); w3.facts.add("lastGuardsWithdrawn"); r3.time = 4; p3.Update();
    Eq(p3.phase.id, "disengage");
    Check(bounder.maxIndex === 1 && bounder.loop === false && bounder.index === 1, "disengage holds a bounder on the line he is on");
    Check(!e3.get("FrontGunner").missionAssault, "a fire-base man the table never sent forward keeps his post");
  }
  // Out of 02-05.
  r.flow.stage.id = "Orders"; r.time = 200; pressure.Update();
  Eq(pressure.phase, null);
  Check([...enemies.values()].every((a) => !a.ambientFirePoints), "06 takes every authorised point back");
  r.flow.stage.id = "South"; pressure.Update();
  Check(!r.ai.missionCoverRules && !r.ai.missionReactions, "07 closes the mission AI switches");
  r.ai.missionReactions = true; pressure.Dispose(); Check(!r.ai.missionReactions, "Dispose closes the switches");
}
console.log("ok ② pressure runtime: switches, phases, lanes, gap discipline, yield, fallback, stalemate, reserves, single charge, repelled fact, nest guards");

// ---------------------------------------------------------------------------
// ③ 大脑（Script_Ai 的真实方法）
// ---------------------------------------------------------------------------
const { registerHooks } = await import("node:module");
const vendorRoot = new URL("./vendor/", import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  if (url.startsWith(vendorRoot) && url.endsWith(".js")) return { format: "module", source: fs.readFileSync(new URL(url), "utf8"), shortCircuit: true };
  return next(url, context);
} });
let AiDirector, Soldier, THREE;
try {
  ({ AiDirector, Soldier } = await import("./Script_Ai.mjs"));
  THREE = await import("three");
} finally { hooks.deregister(); }
function MakeDirector({ blocked = false } = {}) {
  const log = { barks: [], shots: [], tracers: [], impacts: [], taken: [], suppress: [] };
  const ctx = {
    battlefield: { covers: [], Raycast: () => (blocked ? { t: 0.5, normal: [0, 1, 0] } : null), GroundHeight: () => 0 },
    scene: { add() {}, remove() {} },
    audio: { Bark: (kind, opts) => { log.barks.push({ kind, ...opts }); return {}; }, PlayGunshot: (cue) => log.shots.push(cue) },
    vfx: { MuzzleFlash() {}, Tracer: (a, b) => log.tracers.push(b.clone()), Impact: (p) => log.impacts.push(p.clone()) },
  };
  const ai = new AiDirector(ctx);
  ai.time = 10;
  return { ai, ctx, log };
}
function Man(ai, side, x, z, options = {}) {
  const s = new Soldier(side, { x, z, weapon: options.weapon || (side === "ija" ? "Type38" : "HanYang") });
  s.director = ai; s.state = options.state || "fire"; s.ammo = 5; s.fireTimer = 0; s.aimBlend = 1;
  ai.soldiers.push(s);
  return s;
}
{
  const { ai, ctx, log } = MakeDirector();
  const s = Man(ai, "ija", 0, 0);
  s.yaw = 0;   // faces -Z
  const front = { id: "front", x: 0, z: -30, h: 0.5, r: 1 }, back = { id: "back", x: 0, z: 30, h: 0.5, r: 1 };
  Eq(ai.PickAmbientFire(s), null, "no authorised points, no ambient fire");
  s.ambientFirePoints = [back, front];
  for (let i = 0; i < 6; i++) { s.ambientPickAt = -99; s.ambientUntil = -99; s.ambientFirePoint = null; ai.PickAmbientFire(s);
    Eq(s.ambientFirePoint?.id, "front", "the point in front of him is picked before the one behind"); }
  Check(s.ambientUntil >= ai.time + AMBIENT_FIRE.dwellMinS && s.ambientUntil <= ai.time + AMBIENT_FIRE.dwellMaxS, "he keeps a point for the dwell window");
  // §20.11 The bank top itself is masked by his own parapet: the point is retried one raise step higher (a high round).
  {
    const low = Man(ai, "ija", 40, 0); low.yaw = 0;
    low.ambientFirePoints = [{ id: "bank", x: 40, z: -30, h: 0.3, r: 1 }];
    const Raycast = ctx.battlefield.Raycast;
    let rays = 0;
    ctx.battlefield.Raycast = (from, dir, len) => { rays++; return dir.y < 0 ? { t: len * 0.3, normal: [0, 1, 0] } : null; };
    ai.PickAmbientFire(low);
    Check(low.ambientFirePoint && low.ambientFirePoint.y > 0.3 + 1e-6, "a masked bank top is taken as a high round over it");
    Check(rays <= AMBIENT_FIRE.losRetries, "every raise step is one ray inside the losRetries budget");
    ctx.battlefield.Raycast = () => ({ t: 0.5, normal: [0, 1, 0] });
    low.ambientFirePoint = null; low.ambientPickAt = -99; low.ambientUntil = -99;
    Eq(ai.PickAmbientFire(low), null, "fully masked at every height: no point");
    ctx.battlefield.Raycast = Raycast;
    ai.soldiers.splice(ai.soldiers.indexOf(low), 1);
  }
  // A man with a real shot never takes ambient.
  s.target = { isPlayer: false, position: new THREE.Vector3(5, 0, -5), id: 99 }; s.targetVisible = true;
  Eq(ai.PickAmbientFire(s), null, "a visible, unheld target owns the trigger");
  // A target only in (credible) memory: TryFire suppresses first; a stalled trigger hands over to ambient.
  s.targetVisible = false; s.lkpConfidence = 0.9; s.targetLostTime = 0.5; s.targetFireAt = -99;
  Check(!ai.AmbientBlocked(s), "a fresh memory target is suppressed by TryFire first");
  s.targetLostTime = AMBIENT_FIRE.stalledTargetS + 0.1;
  Check(ai.AmbientBlocked(s), "memory target, no real round for stalledTargetS: the trigger is stalled, ambient takes over");
  s.targetFireAt = ai.time - 0.5;
  Check(!ai.AmbientBlocked(s), "a man whose suppression still gets out keeps suppressing");
  s.targetFireAt = -99; s.targetLostTime = 0; s.lkpConfidence = 0;
  // §20.7 A visible target whose rounds never get out (the peek sees him, his parapet stops the round):
  // the dry-trigger clock hands over to ambient after stalledTargetS, and the dwell hands the muzzle back.
  {
    // (his own man: the rounds of s are counted further down, so s.rnd must not move)
    const d = Man(ai, "ija", 0, 0); d.yaw = 0; d.ambientFirePoints = [back, front];
    d.target = { isPlayer: false, position: new THREE.Vector3(5, 0, -5), id: 99 }; d.targetVisible = true;
    d.triggerDrySince = ai.time - 0.5;
    Check(!ai.AmbientBlocked(d), "a visible target, trigger dry for half a second: TryFire keeps trying");
    d.triggerDrySince = ai.time - AMBIENT_FIRE.stalledTargetS - 0.1;
    Check(ai.AmbientBlocked(d), "visible but no round out for stalledTargetS: the trigger is stalled, ambient takes over");
    d.ambientPickAt = -99; d.ambientUntil = -99; d.ambientFirePoint = null;
    Check(ai.PickAmbientFire(d), "a stalled trigger picks an authorised point");
    d.ambientUntil = ai.time - 0.01; d.ambientPickAt = -99;
    Eq(ai.PickAmbientFire(d), null, "dwell over: the muzzle goes back to the target for another try");
    Eq(d.triggerDrySince, -1, "the retry restarts the dry-trigger clock");
    d.triggerDrySince = 3;
    ai.SetTarget(d, { isPlayer: false, position: new THREE.Vector3(1, 0, -9), ref: {}, id: 55, stance: 0 });
    Eq(d.triggerDrySince, -1, "a new target restarts the dry-trigger clock");
    ai.soldiers.splice(ai.soldiers.indexOf(d), 1);
  }
  // Waiting guards never come back as a memory target (their gunfire is heard).
  {
    const guard = { alive: true, missionUntargetable: true, position: new THREE.Vector3(0, 0, -12) };
    const m = Man(ai, "ija", 3, 0);
    m.perception = { list: [{ ref: guard, id: 77, isPlayer: false, confidence: 0.9, stance: 2 }] };
    m.lkpConfidence = 0.9; m.lkp = { x: 0, y: 0, z: -12 }; m.target = null;
    Check(!ai.ReviveTargetFromMemory(m, null), "an untargetable guard is never revived from memory");
    guard.missionUntargetable = false;
    Check(ai.ReviveTargetFromMemory(m, null) && m.target.id === 77, "a released guard is fair game again");
    ai.soldiers.splice(ai.soldiers.indexOf(m), 1);
  }
  s.target = { isPlayer: false, position: new THREE.Vector3(5, 0, -5), id: 99 }; s.targetVisible = true;
  // Held on the player (not the suppress rank): ambient.
  s.target = { isPlayer: true, position: new THREE.Vector3(0, 0, -20), id: -1 }; s.missionFireHold = true; s.missionFireSuppressOnly = false;
  s.ambientPickAt = -99; Check(ai.PickAmbientFire(s), "a held man fires at authorised points instead of standing there");
  s.missionFireSuppressOnly = true; Eq(ai.PickAmbientFire(s), null, "the suppress rank keeps suppressing the player");
  s.missionFireSuppressOnly = false; s.ambientPickAt = -99; ai.PickAmbientFire(s);
  // Ownership gates.
  Check(ai.AmbientOwnsAim(s), "a still FIRE man with a held trigger owns his aim for ambient fire");
  s.moveSpeed = 0.5; Check(!ai.AmbientOwnsAim(s), "nobody fires ambient on the run"); s.moveSpeed = 0;
  s.hesitateUntil = ai.time + 1; Check(!ai.AmbientOwnsAim(s), "a hesitating man does not fire"); s.hesitateUntil = -99;
  for (const state of ["reload", "charge", "suppressed", "grenade", "bound"]) { s.state = state; Check(!ai.AmbientOwnsAim(s), `no ambient in ${state}`); }
  s.state = "advance"; s.order = "advance"; Check(!ai.AmbientOwnsAim(s), "no ambient while advancing");
  s.order = "hold"; Check(ai.AmbientOwnsAim(s), "a scripted man holding his stop may fire ambient");
  s.state = "fire";
  // One ambient shot: the whole ledger.
  let resolveOpts = null, tokens = 0;
  const Resolve = ai.shooting.Resolve.bind(ai.shooting);
  ai.shooting.Resolve = (soldier, from, aim, opts) => { resolveOpts = opts; return Resolve(soldier, from, aim, opts); };
  const AcquireToken = ai.tactics.AcquireToken.bind(ai.tactics);
  ai.tactics.AcquireToken = (...args) => { tokens++; return AcquireToken(...args); };
  const player = { Alive: true, position: new THREE.Vector3(0.4, 0, -30), stance: "stand", yaw: 0, velocity: new THREE.Vector3(),
    LeanOffsetM: 0, TakeHit: (...args) => log.taken.push(args), Suppress: (...args) => log.suppress.push(args) };
  ctx.player = player;
  const fired = ai.TryAmbientFire(s, 0.016, false);
  Check(fired, "a ready man fires at his authorised point");
  Eq(resolveOpts.baseAccuracy, 0, "ambient fire resolves with baseAccuracy 0");
  Eq(resolveOpts.exposure, 0);
  Eq(tokens, 0, "ambient fire never takes a firing token");
  Eq(log.taken.length, 0, "ambient fire never damages the player");
  Check(log.suppress.length === 1, "a round past the player's head still suppresses him (near miss)");
  Eq(s.ammo, 4); Check(s.fireTimer > 0, "the shot starts his fire cycle");
  Eq(ai.stats.ambientShots, 1); Eq(ai.stats.aimedShots, 0); Eq(s.ambientShots, 1);
  Eq(log.shots, ["rifleIja"], "the shot is heard with the Japanese rifle cue");
  Check(!ai.TryAmbientFire(s, 0.016, false), "the fire cycle gates the next round");
  for (let i = 0; i < 7; i++) { s.fireTimer = 0; s.ammo = 5; ai.TryAmbientFire(s, 0, true); }
  Eq(log.tracers.length, 8, "every ambient round draws a tracer");
  Check(log.impacts.length >= 2, `rounds that dig into the ground throw dirt (${log.impacts.length}/8; high misses fly on)`);
  Check(log.impacts.every((p) => Math.hypot(p.x, p.z + 30) < 8), "the rounds land around the authorised point, never elsewhere");
  Eq(log.taken.length, 0, "eight ambient rounds, still no damage");
  s.ammo = 4;
  // Cover: only peeking fires.
  s.fireTimer = 0; s.state = "cover_engage"; s.coverPhase = "hide"; Check(!ai.TryAmbientFire(s, 0, true), "hidden in cover: no ambient");
  s.coverPhase = "peek"; Check(ai.TryAmbientFire(s, 0, true), "peeking from cover: ambient fire");
  // Turned away: no shot.
  s.fireTimer = 0; s.state = "fire"; s.yaw = Math.PI; Check(!ai.TryAmbientFire(s, 0, true), "the muzzle must face the point");
  // A scripted man holding his stop reloads in place (nobody else will).
  s.state = "advance"; s.order = "hold"; s.yaw = 0; s.ammo = 0; s.fireTimer = 0; s.reloadTimer = 0;
  Check(!ai.TryAmbientFire(s, 0.1, false), "an empty rifle does not fire");
  for (let i = 0; i < 40 && s.ammo === 0; i++) ai.TryAmbientFire(s, 0.1, false);
  Eq(s.ammo, s.weapon.magazine, "a scripted backdrop man presses in a fresh clip and keeps firing");
  s.state = "fire";
  // Machine gun: short bursts.
  const gun = Man(ai, "ija", 4, 0, { weapon: "Type11" }); gun.yaw = 0; gun.ambientFirePoints = [front];
  ai.PickAmbientFire(gun); let bursts = 0;
  for (let i = 0; i < 400; i++) { ai.time += 0.05; if (ai.TryAmbientFire(gun, 0.05, false)) bursts++; gun.ammo = 30; }
  Check(bursts > 10, `a held machine gunner lays directed bursts on his point (${bursts} rounds in 20 s)`);
  Check(log.shots.includes("type11"));
  // Blocked line of sight: no pick.
  const blockedWorld = MakeDirector({ blocked: true });
  const b = Man(blockedWorld.ai, "ija", 0, 0); b.yaw = 0; b.ambientFirePoints = [front];
  Eq(blockedWorld.ai.PickAmbientFire(b), null, "a point behind a solid wall is never picked");
  // §20.7 A point picked from eye height that the muzzle cannot reach is dropped at once, not stared at for the dwell.
  b.ambientFirePoint = { x: 0, y: 0.5, z: -30, r: 1, id: "front" }; b.ambientUntil = blockedWorld.ai.time + 5; b.fireTimer = 0;
  Check(!blockedWorld.ai.TryAmbientFire(b, 0, true), "no round through the wall");
  Check(b.ambientFirePoint === null && b.ambientUntil < blockedWorld.ai.time, "the blocked point is let go for a fresh pick");
  Eq(b.ambientBlockedId, "front", "and remembered as blocked");
  {
    const open = MakeDirector();
    const o = Man(open.ai, "ija", 0, 0); o.yaw = 0; o.ambientFirePoints = [front];
    o.ambientBlockedId = "front"; o.ambientBlockedUntil = open.ai.time + AMBIENT_FIRE.blockedRetryS;
    Eq(open.ai.PickAmbientFire(o), null, "a point that was just blocked from his muzzle is not picked again at once");
    open.ai.time += AMBIENT_FIRE.blockedRetryS + 0.1; o.ambientPickAt = -99;
    Eq(open.ai.PickAmbientFire(o)?.id, "front", "after blockedRetryS it may be tried again");
    o.cover = { id: "box", firePos: { x: 0.6, y: 0, z: 0 }, hidePos: { x: 0, y: 0, z: 0 }, fireStance: 0, hideStance: 1 };
    o.stance = 1; o.ambientFirePoint = null; o.ambientPickAt = -99; open.ai.PickAmbientFire(o);
    Check(Math.abs(open.ai._ambientEye.x - 0.6) < 1e-9, "in cover the sight line is taken from the peek position");
    Check(Math.abs(open.ai._ambientEye.y - (1.5 - 0.15)) < 1e-6, "at the peek stance's muzzle height");
  }
}
{
  // Squad reaction.
  const { ai, log } = MakeDirector();
  const dead = Man(ai, "ija", 0, 0), near = Man(ai, "ija", 3, 0), far = Man(ai, "ija", 12, 0), other = Man(ai, "ija", 25, 0);
  for (const s of [dead, near, far, other]) s.reactionGroup = "center";
  other.reactionGroup = "mgAttack";
  ai.NotifyDeath(dead);
  Check(near.hesitateUntil < 0 && near.suppression === 0, "reactions are off unless the mission switch is on");
  ai.missionReactions = true;
  ai.NotifyDeath(dead);
  Check(near.hesitateUntil >= ai.time + SQUAD_REACTION.hesitateMinS && near.hesitateUntil <= ai.time + SQUAD_REACTION.hesitateMaxS,
    "a man beside the body hesitates");
  Eq(near.suppression, SQUAD_REACTION.witnessSuppression, "and ducks");
  Check(far.hesitateUntil < 0, "a man 12 m away does not see it");
  dead.aiOfficer = true; ai.NotifyDeath(dead);
  Check(far.hesitateUntil >= ai.time + SQUAD_REACTION.officerHesitateMinS, "the officer's death stops his whole group");
  Check(other.hesitateUntil < 0, "another group is not his");
  Check(log.barks.some((b) => b.key === "ija_hurt_leader" && b.priority === true), "someone shouts that the section leader is down");
  // Hesitation blocks charges.
  near.target = { isPlayer: true, position: new THREE.Vector3(3, 0, -5), id: -1 }; near.targetVisible = true;
  near.groupChargeAt = ai.time; near.groupChargeUntil = ai.time + 5;
  Check(!ai.UpdateChargeIntent(near), "a hesitating man does not charge");
  near.hesitateUntil = -99;
  Check(ai.UpdateChargeIntent(near), "a grouped man charges without the personal ChargeOpportunity gates");
}
{
  // Group charge and follow-ups.
  const { ai, ctx, log } = MakeDirector();
  ai.missionReactions = true;
  const squad = [0, 1, 2, 3].map((i) => Man(ai, "ija", i * 1.5, 0));
  for (const s of squad) { s.reactionGroup = "mgAttack"; s.target = { isPlayer: true, position: new THREE.Vector3(0, 0, -20), id: -1 }; s.targetVisible = true; }
  const started = ai.GroupCharge(squad, { leader: squad[2] });
  Eq(started, 4);
  Eq(squad[2].groupChargeAt, ai.time, "the leader goes first");
  Check(squad.every((s) => s.groupChargeAt <= ai.time + CHARGE_FOLLOW.groupStaggerMaxS && s.bayonetFixed), "the rest follow within the stagger, bayonets fixed");
  Check(log.barks.some((b) => b.key === "ija_rally_storm" && b.priority === true), "the leader shouts the storm");
  Eq(ai.stats.groupCharges, 1);
  // A held man looking at an NRA soldier is turned on the player before a group charge.
  {
    const h = Man(ai, "ija", 20, 0);
    h.target = { isPlayer: false, position: new THREE.Vector3(20, 0, -10), id: 42 };
    ctx.player = { Alive: true, Protected: false, stance: "crouch", position: new THREE.Vector3(20, 0, -25) };
    Check(ai.TargetPlayerForCharge(h) && h.target.isPlayer && h.target.stance === 1, "the charger's target becomes the player");
    ctx.player.Protected = true; h.target = null;
    Check(!ai.TargetPlayerForCharge(h) && !h.target, "a protected (spawn-shielded) player is never made a target");
    ctx.player = undefined;
    ai.soldiers.splice(ai.soldiers.indexOf(h), 1);
  }
  // Follow-ups from a spontaneous charge.
  const { ai: ai2 } = MakeDirector();
  ai2.missionReactions = true;
  const lead = Man(ai2, "ija", 0, 0), mate = Man(ai2, "ija", 2, 0), stranger = Man(ai2, "ija", 9, 0);
  const noBayonet = Man(ai2, "ija", 1, 1, { weapon: "Type11" });
  for (const s of [lead, mate, stranger, noBayonet]) { s.reactionGroup = "g"; s.target = { isPlayer: true, position: new THREE.Vector3(0, 0, -8), id: -1 }; s.targetVisible = true; }
  // 2026-09-24 review: requiring a bayonet already fixed meant nobody ever followed (only chargers have one fixed).
  Check(!mate.bayonetFixed, "fixture: the mate has not fixed his bayonet yet");
  Eq(ai2.RallyCharge(lead), 1, "only the rifleman within 3 m follows (the gunner has no bayonet, the stranger is too far)");
  Check(mate.bayonetFixed && !noBayonet.bayonetFixed, "the follower fixes his bayonet as he gets up");
  Check(mate.chargeFollowAt >= ai2.time + CHARGE_FOLLOW.followDelayMinS && mate.chargeFollowAt <= ai2.time + CHARGE_FOLLOW.followDelayMaxS);
  Check(!ai2.UpdateChargeIntent(mate), "not before his stagger");
  ai2.time = mate.chargeFollowAt + 0.01;
  Check(ai2.UpdateChargeIntent(mate), "he gets up on his stagger");
}
{
  // Bark keys and the mission switches.
  const { ai, ctx, log } = MakeDirector();
  const s = Man(ai, "ija", 0, 0);
  ai.Bark(s, "spot"); Eq(log.barks.at(-1).key ?? null, null, "07+: the Japanese spot line is still drawn from the pool");
  ai.missionReactions = true; ai.Bark(s, "spot");
  Check(["ija_spot_enemy", "ija_spot_target"].includes(log.barks.at(-1).key), "01-06: never 'enemy on the roof' in a trench");
  for (const [kind, key] of [["fallback", "ija_move_back"], ["mg", "ija_spot_mg"], ["down", "ija_warn_down"], ["charge", "ija_rally_storm"]]) {
    ai.Bark(s, kind); Eq(log.barks.at(-1).key, key, `bark ${kind}`);
  }
  ai.Bark(s, "advance"); Check(["ija_move_advance", "ija_move_forward"].includes(log.barks.at(-1).key));
  Eq(ai.Bark(s, "follow"), null, "the unused follow line is gone");
  // 2026-09-24 review: 'advance' fired on every Think that re-wrote BOUND (10 542 calls in one 01->06 drive).
  {
    const b = Man(ai, "ija", 3, 3, { state: "bound" });
    const count = () => log.barks.filter((x) => ["ija_move_advance", "ija_move_forward"].includes(x.key)).length;
    const n0 = count();
    Check(ai.AdvanceBark(b), "a man who ends his Think in BOUND for the first time shouts the advance");
    Check(!ai.AdvanceBark(b), "still bounding next Think: no second shout");
    b.state = "fire"; ai.AdvanceBark(b); b.state = "bound";
    Check(!ai.AdvanceBark(b), "BOUND -> FIRE -> BOUND flicker inside the cooldown stays quiet");
    ai.time += SQUAD_REACTION.advanceBarkCooldownS + 0.1; b.state = "fire"; ai.AdvanceBark(b); b.state = "bound";
    Check(ai.AdvanceBark(b), "after the cooldown a new bound is a new shout");
    const waiting = Man(ai, "ija", 4, 4, { state: "bound" }); waiting.missionFrontStandby = true;
    const scripted = Man(ai, "ija", 5, 4, { state: "bound" }); scripted.missionTacticStandby = true;
    Check(!ai.AdvanceBark(waiting) && !ai.AdvanceBark(scripted), "standby and scripted-tactic men never shout the advance");
    Eq(count() - n0, 2);
    // Over a simulated minute of flicker (Think every 0.1 s) one man shouts at most 60 / cooldown times.
    const f = Man(ai, "ija", 6, 6, { state: "bound" });
    let shouts = 0;
    for (let i = 0; i < 600; i++) { ai.time += 0.1; f.state = i % 2 ? "bound" : "fire"; if (ai.AdvanceBark(f)) shouts++; }
    Check(shouts <= Math.ceil(60 / SQUAD_REACTION.advanceBarkCooldownS), "flicker for a minute: " + shouts + " shouts");
  }
  Check(!ai.RefinedCoverSide(s) && ai.RefinedCoverSide(Man(ai, "nra", 0, 0)), "by default only the NRA runs the refined cover cycle");
  ai.missionCoverRules = true; Check(ai.RefinedCoverSide(s), "the mission switch gives the Japanese the refined cover cycle");
  // §20.7 Wasted peeks: he sees the man in the trench, but not one round gets past that parapet.
  const Peek = (w, fired) => {
    w.coverPhase = "peek"; w.coverPhaseUntil = ai.time - 0.01; w.peekSaw = true; w.peekFired = fired;
    ai.UpdateCoverCycle(w, null);
  };
  const w = Man(ai, "ija", 0, 0, { state: "cover_engage" });
  w.target = { isPlayer: false, position: new THREE.Vector3(0, 0, -30), id: 7 }; w.targetVisible = true;
  const cover = { id: "parapetBox", hidePos: { x: 0, y: 0, z: 0 }, firePos: { x: 0.5, y: 0, z: 0 }, hideStance: 1, fireStance: 1 };
  w.cover = cover;
  ai.missionCoverRules = false;
  for (let i = 0; i < 4; i++) Peek(w, false);
  Check(w.cover === cover && w.blindPeeks === 0, "07+: a peek that saw the target is never blind, rounds or not");
  ai.missionCoverRules = true;
  Peek(w, true); Peek(w, false); Peek(w, false);
  Check(w.cover === cover, "a peek that got a round out resets the count");
  Peek(w, false);
  Check(w.cover === null && w.failedCoverId === "parapetBox", "01-06: three peeks in a row that saw him but fired nothing: move to another cover");
  // §20.11 A man with authorised points whose covers all fire nothing goes out to kneel in the open for a while.
  {
    const o = Man(ai, "ija", 0, 0, { state: "cover_engage" });
    o.target = { isPlayer: false, position: new THREE.Vector3(0, 0, -30), id: 8 }; o.targetVisible = true;
    o.ambientFirePoints = [{ id: "bank", x: 0, z: -30, h: 0.3, r: 1 }];
    const Burn = (id) => { o.cover = { ...cover, id }; for (let i = 0; i < COVER_CYCLE.blindPeeksBeforeMove; i++) Peek(o, false); };
    Burn("coverA");
    Check(!(o.missionOpenUntil > ai.time), "one bad cover: he just tries another");
    ai.time += 5; Burn("coverB");
    Check(o.missionOpenUntil > ai.time && ai.stats.openGround === 1, "two bad covers inside the window: he kneels in the open for a while");
    o.task = null; o.suppression = 0; o.position.set(0, 0, 0);
    Check(ai.UpdateCover(o) === false && o.cover == null, "while it lasts he picks no cover");
    ctx.player = { Alive: true, position: new THREE.Vector3(0, 0, -20) };
    const n = Man(ai, "ija", 1, 0, { state: "cover_engage" });
    n.target = o.target; n.targetVisible = true; n.ambientFirePoints = o.ambientFirePoints;
    for (const id of ["n1", "n2"]) { n.cover = { ...cover, id }; for (let i = 0; i < COVER_CYCLE.blindPeeksBeforeMove; i++) Peek(n, false); }
    Check(!(n.missionOpenUntil > ai.time), "a man near the player never goes out into the open");
    ctx.player.position.set(0, 0, 0);
    ai.UpdateCover(o);
    Check(!(o.missionOpenUntil > ai.time), "and one already out comes back when the player gets close");
    ctx.player = undefined;
    const p = Man(ai, "ija", 2, 0, { state: "cover_engage" });
    p.target = o.target; p.targetVisible = true;
    for (const id of ["c1", "c2"]) { p.cover = { ...cover, id }; for (let i = 0; i < COVER_CYCLE.blindPeeksBeforeMove; i++) Peek(p, false); }
    Check(!(p.missionOpenUntil > ai.time), "a man without authorised points never leaves cover this way");
    ai.missionCoverRules = false;
    const q = Man(ai, "ija", 4, 0, { state: "cover_engage" }); q.target = o.target; q.targetVisible = true; q.ambientFirePoints = o.ambientFirePoints;
    for (const id of ["d1", "d2", "d3"]) { q.cover = { ...cover, id }; for (let i = 0; i < 4; i++) Peek(q, false); }
    Check(!(q.missionOpenUntil > ai.time), "07+: the switch is off, nobody goes out into the open");
    ai.missionCoverRules = true;
  }
}
// §20.7 Melee stall: pulled into a bayonet fight across a parapet he cannot climb, a man stood there for 86 s.
{
  const { ai } = MakeDirector();
  const m = Man(ai, "ija", 0, 0, { state: "charge" });
  m.meleeCombat = { managed: true, state: "idle" };
  Check(!ai.UpdateMeleeStall(m), "the first idle frame only anchors the stall clock");
  ai.time += MELEE_STALL.stallS * 0.5; Check(!ai.UpdateMeleeStall(m), "half the stall window: still his fight");
  m.position.x += MELEE_STALL.moveM + 0.1; ai.time += 0.1; ai.UpdateMeleeStall(m);
  ai.time += MELEE_STALL.stallS - 0.2; Check(!ai.UpdateMeleeStall(m), "a man who stepped in re-anchors the clock");
  m.meleeCombat = { managed: true, state: "attack" }; ai.time += 5; Check(!ai.UpdateMeleeStall(m), "a thrust is not a stall");
  m.meleeCombat = { managed: true, state: "idle" }; ai.UpdateMeleeStall(m);
  ai.time += MELEE_STALL.stallS + 0.1;
  Check(ai.UpdateMeleeStall(m), "idle and rooted for stallS: released from the melee director");
  Check(m.meleeDormant === true && m.meleeCombat === null, "released: meleeDormant, no melee pose");
  Eq(m.state, "fire", "a released charger goes back to the firefight");
  Check(m.chargeCooldownUntil > ai.time && m.groupChargeUntil < ai.time, "and does not charge the same parapet again at once");
  Eq(ai.stats.meleeStallReleases, 1);
  ai.time += MELEE_STALL.releaseS - 0.1; ai.UpdateMeleeStall(m); Check(m.meleeDormant, "stays out for releaseS");
  ai.time += 0.2; ai.UpdateMeleeStall(m);
  Check(m.meleeDormant === false && m.meleeStallDormantUntil === 0, "after releaseS the melee director may take him again");
}
console.log("ok ③ brain: ambient pick/ownership/ledger, dry trigger, MG bursts, hesitation, officer death, group charge, follow-ups, bark keys, cover switch, wasted peeks, blocked points, melee stall");

// ---------------------------------------------------------------------------
// ④ 01 背景兵
// ---------------------------------------------------------------------------
{
  const spec = { delayS: 2, route: [{ x: 0, z: 0, holdS: 3, fire: [] }, { x: 5, z: 0, holdS: 0, fire: [] }] };
  const st = { index: 0, arrived: false, holdUntil: 0, startAt: 0 };
  Eq(BackdropStep(spec, st, 1).kind, "wait");
  Eq(BackdropStep(spec, st, 2).kind, "run");
  st.arrived = true; st.holdUntil = 5;
  Eq(BackdropStep(spec, st, 4).kind, "hold");
  const next = BackdropStep(spec, st, 5.1); Eq([next.kind, next.index], ["run", 1], "after holdS he runs on");
  st.arrived = true; st.holdUntil = 5.1; Eq(BackdropStep(spec, st, 99).kind, "hold", "the last stop holds for good");
  // Fixture ids come from the data (the roster is Space's MISSION_ENCOUNTERS.bunkerBackdrop since 2026-09-24).
  const FIRST_IJA = BACKDROP_SQUADS.members.find((m) => m.side === "ija").id;
  const stop = BACKDROP_SQUADS.members.find((m) => m.side === "ija").route[0];
  Check(stop.fire.length > 0, "fixture: the first Japanese runner fires at his first stop");
  Check(BackdropFirePoints(stop) === BackdropFirePoints(stop) && BackdropFirePoints(stop).length === stop.fire.length, "stop point lists are stable references");

  const facts = new Set(), spawned = [], removed = [], moves = [], defends = [];
  const r = {
    flow: { stage: { id: "Trapped" } }, time: 0, enemies: new Map(), spawnQueue: [],
    Has: (id) => facts.has(id),
    ai: { Spawn: (side, x, z, opts) => { const a = { side, alive: true, position: { x, y: 0, z }, goal: { set(x2, y2, z2) { this.x = x2; this.z = z2; } }, opts };
        spawned.push(a); return a; },
      Remove: (a) => removed.push(a), SetStance() {} },
    MoveActor: (a, p, speed) => { moves.push([a.missionId, p.x, p.z, speed]); a.order = "advance"; a.holdZone = null; a.scriptMoveSpeedMps = speed; },
    Defend: (a, p) => { defends.push(a.missionId); a.order = "hold"; },
  };
  const squads = new FirstLevelBackdropSquads(r);
  squads.Update(); Eq(r.spawnQueue.length, 0, "nothing before the blast buries the bunker");
  facts.add("bunkerCollapsed"); squads.Update();
  Eq(r.spawnQueue.length, BACKDROP_SQUADS.members.length);
  while (r.spawnQueue.length) r.spawnQueue.shift()();
  Eq(spawned.length, BACKDROP_SQUADS.members.length);
  const ija = BACKDROP_SQUADS.members.filter((m) => m.side === "ija");
  Eq(r.enemies.size, 0, "scripted runners stay out of the mission enemy table until the hand-off (the 01-02 roster snapshot never sees them)");
  Check(spawned.every((a) => a.scriptedNoncombatant), "backdrop men are scripted");
  Check(spawned.filter((a) => a.side === "nra").every((a) => a.missionUntargetable), "the far NRA answerers are not targets");
  const runner = spawned.find((a) => a.missionId === FIRST_IJA);
  r.time = 1; squads.Update();
  Check(moves.some(([id]) => id === FIRST_IJA), "the first man runs his route");
  Eq(runner.ambientFirePoints ?? null, null, "nobody fires on the run");
  const firstStop = BACKDROP_SQUADS.members.find((m) => m.id === FIRST_IJA).route[0];
  runner.position = { x: firstStop.x, y: 0, z: firstStop.z }; squads.Update();
  Check(runner.order === "hold" && runner.ambientFirePoints?.length === firstStop.fire.length, "at the stop he kneels and fires at his authorised points");
  facts.add("rifleRecovered"); squads.Update();
  Check(ija.every((m) => defends.includes(m.id)) && !runner.scriptedNoncombatant, "hand-off: the Japanese become live local-area soldiers");
  Eq(r.enemies.size, ija.length, "and from the hand-off on they are ordinary mission enemies (fire windows, stage counts)");
  r.flow.stage.id = "Support"; squads.Update();
  Eq(removed.length, spawned.length, "leaving 01-02 with nobody watching removes the whole backdrop");
  Eq(r.enemies.size, 0, "and nothing of it leaks into the 03 enemy table");
  // 2026-09-24 review: handed-over men still fighting near the 03 start vanished in front of the player.
  {
    // Camera at the origin looking down -Z (three's default), 70 deg vertical fov.
    const Cam = (yawDeg, x = 0, z = 0) => {
      const y = (yawDeg * Math.PI) / 180;
      return { fov: 70, aspect: 16 / 9, matrixWorld: { elements: [Math.cos(y), 0, -Math.sin(y), 0, 0, 1, 0, 0, Math.sin(y), 0, Math.cos(y), 0, x, 1.6, z, 1] } };
    };
    Check(InCameraView(Cam(0), { x: 0, y: 1.6, z: -20 }) && !InCameraView(Cam(0), { x: 0, y: 1.6, z: 20 }), "in front is seen, behind is not");
    Check(!InCameraView(null, { x: 0, y: 0, z: -5 }), "no camera: nobody is watching");
    Check(InCameraView(Cam(180), { x: 0, y: 1.6, z: 20 }), "turn round and the man behind is in view");
    const sp2 = [], rm2 = [];
    const r2 = { ...r, flow: { stage: { id: "Trapped" } }, time: 0, enemies: new Map(), spawnQueue: [],
      player: { position: { x: -40, y: 0, z: -140 } }, camera: Cam(0, -40, -140),
      ai: { ...r.ai, Spawn: (side, x, z, opts) => { const a = { side, alive: true, position: { x, y: 0, z }, goal: { set() {} }, opts }; sp2.push(a); return a; },
        Remove: (a) => rm2.push(a) } };
    const q = new FirstLevelBackdropSquads(r2);
    facts.add("bunkerCollapsed");
    q.Update(); while (r2.spawnQueue.length) r2.spawnQueue.shift()();
    q.Update();
    const seen = sp2.find((a) => a.missionId === FIRST_IJA);
    seen.position = { x: -40, y: 0, z: -150 };           // 10 m straight ahead of the camera
    for (const a of sp2) if (a !== seen) a.position = { x: -40, y: 0, z: -120 };   // behind the player
    q.Update();   // hand-off already recorded (rifleRecovered)
    r2.flow.stage.id = "Support"; r2.time = 1; q.Update();
    Eq(r2.enemies.size, 0, "the enemy table is cleared at once");
    Check(!rm2.includes(seen) && rm2.length === sp2.length - 1, "a man in plain view is not removed yet; the rest are");
    Check(seen.scriptedNoncombatant === true && seen.target == null, "and he is back to a scripted backdrop man (no shots at people)");
    r2.time = 5; q.Update(); Check(!rm2.includes(seen), "still in view: still there");
    r2.camera = Cam(180, -40, -140); r2.time = 6; q.Update();
    Check(rm2.includes(seen), "once the player looks away he is removed");
    Eq(q.State().leaving, 0);
  }
}
console.log("ok ④ 01 backdrop: wait-run-hold rhythm, stop fire lists, hand-off, clean removal on leaving 01-02");
console.log(`FirstLevelFrontPressureTest 通过：${checks} 条断言`);
