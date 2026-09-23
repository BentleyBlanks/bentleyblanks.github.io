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
} from "./Data_FirstLevelFrontPressure.mjs";
import {
  FirstLevelFrontPressure, FrontPressurePhase, FrontFirePoints, FrontGroupMembers, AssaultRoundEnd, AssaultTop,
  NearestLineIndex, GroupFallbackDue, FrontChargeDue, FIRST_LEVEL_AI_RULE_STEPS, PressureRoute, RouteIndex,
} from "./Script_FirstLevelFrontPressure.mjs";
import { BACKDROP_SQUADS, BACKDROP_FIRE_POINTS } from "./Data_FirstLevelBackdropSquads.mjs";
import { FirstLevelBackdropSquads, BackdropStep, BackdropFirePoints } from "./Script_FirstLevelBackdropSquads.mjs";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TACTICS, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_FACT_GATES } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { FrontAssaultLane } from "./Data_FirstLevelMissionFront.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { MISSION_DEFENSE_OBJECTS, MISSION_STAKE_FENCE } from "./Data_FirstLevelMissionFortifications.mjs";
import { AMBIENT_FIRE } from "./Data_Tuning_AiShooting.mjs";
import { SQUAD_REACTION, CHARGE_FOLLOW, MELEE_STALL } from "./Data_Tuning_AiTactics.mjs";

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
}
function MakeWorld(stage = "BunkerRescue") {
  const world = { facts: new Set(), barks: [], charges: [], defends: [], threats: new Set(), records: [] };
  const enemies = new Map();
  for (const [encounter, list] of Object.entries(MISSION_ENCOUNTERS)) {
    if (!["approach", "front", "machineGun", "tank", "bundleApproach", "village"].includes(encounter)) continue;
    for (const spec of list) {
      const weapon = WEAPONS[spec.weapon || "Type38"];
      const points = ["front", "machineGun"].includes(encounter) && !spec.hold ? FrontAssaultLane(spec.x, spec.z) : [];
      enemies.set(spec.id, {
        missionId: spec.id, missionEncounter: encounter, alive: true, weapon, weaponId: spec.weapon || "Type38",
        position: { x: spec.x, y: 0, z: spec.z }, holdZone: { x: spec.x, z: spec.z, radius: spec.hold ? 0.4 : 2 },
        scriptDefensive: !!spec.hold, tacticalRadiusM: spec.hold ? 0 : R.infantryTacticalRadiusM, grenades: 0, fireSequence: 0,
        missionFrontStandby: encounter === "machineGun", target: { isPlayer: true },
        missionAssault: points.length ? { points, index: 0, hold: 0, walk: 0, pinned: 0, cycles: 0, shifts: 0, volley: 0, mode: "rush", jitter: 1 } : null,
      });
    }
  }
  const r = {
    flow: { stage: { id: stage } }, time: 0, enemies, guards: [],
    Has: (id) => world.facts.has(id), Record: (id, detail) => { world.facts.add(id); world.records.push([id, detail]); },
    ai: { missionCoverRules: false, missionReactions: false, time: 0,
      Bark: (a, kind) => world.barks.push([a.missionId, kind]),
      GroupCharge: (members, opts) => { world.charges.push({ ids: members.map((a) => a.missionId), leader: opts.leader?.missionId ?? null }); return members.length; } },
    player: { position: { x: 27, z: -142 } },
    Defend: (a, p, radius, slack) => { world.defends.push([a.missionId, p.x, p.z, radius, slack]); a.holdZone = { x: p.x, z: p.z, radius }; a.scriptDefensive = !(a.tacticalRadiusM > 0); },
    Threatens: (point, ids) => world.threats.has(ids[0]),
  };
  return { r, world, enemies, pressure: new FirstLevelFrontPressure(r) };
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
  Eq(village.ambientFirePoints ?? null, null, "a village enemy never gets front fire points");
  const gunner = enemies.get("RightNestGunner"), guard = enemies.get("RightNestGuard");
  Check(gunner.scriptDefensive && !(gunner.tacticalRadiusM > 0), "the nest gunner stays on hold");
  Check(!guard.scriptDefensive && guard.tacticalRadiusM === R.nestGuardTacticalRadiusM && guard.grenades === R.nestGuardGrenades,
    "nest riflemen are live local-area soldiers with one grenade");
  Eq(world.barks.length, 0, "no bark on the very first phase");
  // 03 opens.
  r.flow.stage.id = "Support"; world.facts.add("frontBattleStarted"); r.time = 1; pressure.Update();
  Eq(pressure.phase.id, "assault");
  const centre = FrontGroupMembers("center", enemies);
  Check(centre.every((a) => a.reactionGroup === "center" && a.missionFireGroup === "center"), "centre men carry their group tags");
  Check(enemies.get("FrontRifleC").aiOfficer && !enemies.get("FrontRifleA").aiOfficer, "the group officer is marked");
  Check(centre.filter((a) => a.missionAssault).every((a) => a.missionAssault.loop && a.missionAssault.maxIndex === a.missionAssault.points.length - 1),
    "the assault phase lets the centre push to its last line and loop");
  const flank = enemies.get("FrontRifleE").missionAssault;
  Check(flank.points.at(-1).x === -45 && flank.points.at(-2).z === -166 && flank.index === 0,
    "the west flank men bound down their own lane to -166 and slide west behind the farm column");
  Eq(flank.regroupLine, flank.points.length - 2, "the flank post regroups on the via line");
  Check(world.barks.some(([id, kind]) => id === "FrontRifleC" && kind === "advance"), "the officer shouts the advance on the phase change");
  // Gap discipline.
  Check(front.ambientFirePoints.some((p) => p.id === "gapWest"), "gap sides are authorised while nobody crosses");
  r.guards = [{ actor: { alive: true }, crossing: true, safe: false }]; pressure.Update();
  Check(!front.ambientFirePoints.some((p) => FRONT_FIRE_POINTS[p.id].gapPath), "a crossing guard closes the gap points at once");
  Check(pressure.events.some((e) => e.kind === "evacuationOpen"));
  r.guards = [];
  // Withdrawal: cap and yield.
  for (const a of centre) if (a.missionAssault) { a.missionAssault.index = a.missionAssault.points.length - 1; a.missionAssault.mode = "hold"; }
  world.facts.add("rightNestCaptured"); world.facts.add("frontRifleDefense"); r.time = 2; pressure.Update();
  Eq(pressure.phase.id, "firstWithdrawal");
  Check(centre.filter((a) => a.missionAssault).every((a) => a.missionAssault.index <= 2), "the withdrawal phase pulls the centre off the last line");
  const a0 = enemies.get("FrontRifleH").missionAssault; a0.mode = "hold"; const before = a0.index;
  Check(before >= 1, "fixture: H holds a line beyond the first");
  world.threats.add("FrontRifleH"); r.time = 3; pressure.Update();
  Eq(a0.index, before - 1, "a man who can see the gap during a withdrawal gives one line back");
  Eq(a0.maxIndex, a0.index, "and may not come forward again this phase");
  Check(pressure.events.some((e) => e.kind === "yield" && e.id === "FrontRifleH"));
  const a1 = enemies.get("FrontRifleA").missionAssault; a1.index = 0; a1.mode = "hold";
  world.threats.add("FrontRifleA"); r.time = 4; pressure.Update();
  Eq([a1.points[0].x, a1.points[0].z, a1.index, a1.maxIndex], [23, -163, 0, 0],
    "a man already on his first line who still sees the gap goes back to where he started");
  world.threats.clear();
  // Casualty fallback.
  world.facts.add("rifleWithdrawalResolved"); r.time = 4.5; pressure.Update();
  Eq(pressure.phase.id, "firstDone");
  Check(a1.points.length === 1 && a1.route == null, "the next phase gives the yielded man his own lane back");
  const tops = new Map();
  for (const a of centre) if (a.missionAssault) { a.missionAssault.index = AssaultTop(a.missionAssault); a.missionAssault.mode = "hold"; tops.set(a, a.missionAssault.index); }
  enemies.get("FrontRifleA").alive = false; enemies.get("FrontRifleB").alive = false; enemies.get("FrontRifleG").alive = false;
  r.time = 5; world.barks.length = 0; pressure.Update();
  Check(centre.filter((a) => a.alive && a.missionAssault).every((a) => a.missionAssault.index === Math.max(0, tops.get(a) - 1)
    && a.missionAssault.holdUntil > r.time), "half the group down: the survivors fall back one line and hold it for holdS");
  Check(world.barks.some(([id, kind]) => id === "FrontRifleC" && kind === "fallback"), "the officer calls the fall back");
  // Machine-gun attack: charge once, then repelled.
  world.facts.add("tankPreviewed"); r.time = 6; pressure.Update();
  Eq(pressure.phase.id, "tankShown");
  const mg = FrontGroupMembers("mgAttack", enemies);
  for (const a of mg) { a.missionFrontStandby = false; a.missionAssault.index = a.missionAssault.points.length - 1; a.missionAssault.mode = "hold"; a.position = { ...a.missionAssault.points.at(-1), y: 0 }; }
  r.player.position = { x: 0, z: -150 };
  r.time = 20; pressure.Update(); Eq(world.charges.length, 0, "no charge before afterS");
  r.time = 40; pressure.Update();
  Eq(world.charges.length, 1, "one scripted group charge in the phase");
  Eq(world.charges[0].leader, FRONT_PRESSURE_GROUPS.mgAttack.officer, "the officer leads it");
  Check(world.charges[0].ids.length >= 4 && mg.filter((a) => a.weapon.bayonet).every((a) => a.missionAssault.mode === "charge")
    && mg.filter((a) => !a.weapon.bayonet).every((a) => a.missionAssault.mode !== "charge"), "bayonet men are released from the script, machine gunners stay");
  r.time = 60; pressure.Update(); Eq(world.charges.length, 1, "never a second charge in the same phase");
  for (const a of mg) a.alive = false;
  r.time = 61; pressure.Update();
  Check(world.facts.has("frontAttackRepelled"), "a destroyed machine-gun attack still records frontAttackRepelled");
  // Nest fallback: two of four down.
  const { r: r2, world: w2, enemies: e2, pressure: p2 } = MakeWorld("BunkerRescue");
  p2.Update(); e2.get("RightNestGunner").alive = false; e2.get("RightEntryGuard").alive = false;
  r2.time = 1; p2.Update();
  Check(w2.defends.some(([id, x, z]) => id === "RightNestGuard" && x === 31 && z === -146), "two nest casualties send the rest to the rear anchor");
  Check(w2.barks.some(([, kind]) => kind === "fallback"));
  // Out of 02-05.
  r.flow.stage.id = "Orders"; r.time = 70; pressure.Update();
  Eq(pressure.phase, null);
  Check([...enemies.values()].every((a) => !a.ambientFirePoints), "06 takes every authorised point back");
  r.flow.stage.id = "South"; pressure.Update();
  Check(!r.ai.missionCoverRules && !r.ai.missionReactions, "07 closes the mission AI switches");
  r.ai.missionReactions = true; pressure.Dispose(); Check(!r.ai.missionReactions, "Dispose closes the switches");
}
console.log("ok ② pressure runtime: switches, phases, gap discipline, yield, fallback, single charge, repelled fact, nest guards");

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
  const { ai, log } = MakeDirector();
  ai.missionReactions = true;
  const squad = [0, 1, 2, 3].map((i) => Man(ai, "ija", i * 1.5, 0));
  for (const s of squad) { s.reactionGroup = "mgAttack"; s.target = { isPlayer: true, position: new THREE.Vector3(0, 0, -20), id: -1 }; s.targetVisible = true; }
  const started = ai.GroupCharge(squad, { leader: squad[2] });
  Eq(started, 4);
  Eq(squad[2].groupChargeAt, ai.time, "the leader goes first");
  Check(squad.every((s) => s.groupChargeAt <= ai.time + CHARGE_FOLLOW.groupStaggerMaxS && s.bayonetFixed), "the rest follow within the stagger, bayonets fixed");
  Check(log.barks.some((b) => b.key === "ija_rally_storm" && b.priority === true), "the leader shouts the storm");
  Eq(ai.stats.groupCharges, 1);
  // Follow-ups from a spontaneous charge.
  const { ai: ai2 } = MakeDirector();
  ai2.missionReactions = true;
  const lead = Man(ai2, "ija", 0, 0), mate = Man(ai2, "ija", 2, 0), stranger = Man(ai2, "ija", 9, 0), noBayonet = Man(ai2, "ija", 1, 1);
  for (const s of [lead, mate, stranger, noBayonet]) { s.reactionGroup = "g"; s.target = { isPlayer: true, position: new THREE.Vector3(0, 0, -8), id: -1 }; s.targetVisible = true; }
  mate.bayonetFixed = true; stranger.bayonetFixed = true; noBayonet.bayonetFixed = false;
  Eq(ai2.RallyCharge(lead), 1, "only the bayonet-armed mate within 3 m follows");
  Check(mate.chargeFollowAt >= ai2.time + CHARGE_FOLLOW.followDelayMinS && mate.chargeFollowAt <= ai2.time + CHARGE_FOLLOW.followDelayMaxS);
  Check(!ai2.UpdateChargeIntent(mate), "not before his stagger");
  ai2.time = mate.chargeFollowAt + 0.01;
  Check(ai2.UpdateChargeIntent(mate), "he gets up on his stagger");
}
{
  // Bark keys and the mission switches.
  const { ai, log } = MakeDirector();
  const s = Man(ai, "ija", 0, 0);
  ai.Bark(s, "spot"); Eq(log.barks.at(-1).key ?? null, null, "07+: the Japanese spot line is still drawn from the pool");
  ai.missionReactions = true; ai.Bark(s, "spot");
  Check(["ija_spot_enemy", "ija_spot_target"].includes(log.barks.at(-1).key), "01-06: never 'enemy on the roof' in a trench");
  for (const [kind, key] of [["fallback", "ija_move_back"], ["mg", "ija_spot_mg"], ["down", "ija_warn_down"], ["charge", "ija_rally_storm"]]) {
    ai.Bark(s, kind); Eq(log.barks.at(-1).key, key, `bark ${kind}`);
  }
  ai.Bark(s, "advance"); Check(["ija_move_advance", "ija_move_forward"].includes(log.barks.at(-1).key));
  Check(!ai.RefinedCoverSide(s) && ai.RefinedCoverSide(Man(ai, "nra", 0, 0)), "by default only the NRA runs the refined cover cycle");
  ai.missionCoverRules = true; Check(ai.RefinedCoverSide(s), "the mission switch gives the Japanese the refined cover cycle");
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
console.log("ok ③ brain: ambient pick/ownership/ledger, dry trigger, MG bursts, hesitation, officer death, group charge, follow-ups, bark keys, cover switch, melee stall");

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
  const stop = BACKDROP_SQUADS.members[0].route[0];
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
  const runner = spawned.find((a) => a.missionId === "BackdropIjaA");
  r.time = 1; squads.Update();
  Check(moves.some(([id]) => id === "BackdropIjaA"), "the first man runs his route");
  Eq(runner.ambientFirePoints ?? null, null, "nobody fires on the run");
  const firstStop = BACKDROP_SQUADS.members.find((m) => m.id === "BackdropIjaA").route[0];
  runner.position = { x: firstStop.x, y: 0, z: firstStop.z }; squads.Update();
  Check(runner.order === "hold" && runner.ambientFirePoints?.length === firstStop.fire.length, "at the stop he kneels and fires at his authorised points");
  facts.add("rifleRecovered"); squads.Update();
  Check(ija.every((m) => defends.includes(m.id)) && !runner.scriptedNoncombatant, "hand-off: the Japanese become live local-area soldiers");
  Eq(r.enemies.size, ija.length, "and from the hand-off on they are ordinary mission enemies (fire windows, stage counts)");
  r.flow.stage.id = "Support"; squads.Update();
  Eq(removed.length, spawned.length, "leaving 01-02 removes the whole backdrop");
  Eq(r.enemies.size, 0, "and nothing of it leaks into the 03 enemy table");
}
console.log("ok ④ 01 backdrop: wait-run-hold rhythm, stop fire lists, hand-off, clean removal on leaving 01-02");
console.log(`FirstLevelFrontPressureTest 通过：${checks} 条断言`);
