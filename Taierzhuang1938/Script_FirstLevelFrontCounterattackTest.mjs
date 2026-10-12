// Script_FirstLevelFrontCounterattackTest.mjs —— 第一关 03–05 反击模块的纯规则部分（纯 Node，秒级）
//
// 覆盖：撤退窗口双条件（跃进组缩回 && 机枪压住/打死，窗口会关、再开）；去程支沟落弹选点与阵位落弹选点的安全距；
// 跟车步兵退离缺口的三种解封；阵位前半边的人选（侧翼优先、就近）；攻击支路进度判定；表数据合约（落弹点在支沟里、
// 前半边岗位在院内且互不挤、车组弃车成员/路线、Tuning.counter 的关键数）；运行时钩子（RUNTIME 三行、Say/Record 事实名
// 在事实表里）。口径：docs/Data_FirstLevel0311Refactor20261012Contract.md §3.1–3.3。
import assert from "node:assert/strict";
import fs from "node:fs";
import { GapWindow, PickSapShellPoint, PickNestShellPoint, EscortsClear, NestFrontPicks, OnAttackBranch } from "./Script_FirstLevelFrontCounterattack.mjs";
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { FRONT_SAP_SHELL_POINTS, FRONT_NEST_SHELL_AREA, FRONT_NEST_FRONT_POSTS, FRONT_TANK_CREW, FRONT_ESCORT_WITHDRAWN } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_ENCOUNTERS, MISSION_TACTICS } from "./Data_FirstLevelMission.mjs";
import { MISSION_FACT_GATES, MISSION_ENCOUNTER_ACTIVATION } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";
import { TANK } from "./Data_Tuning_Tank.mjs";

const T = B.counter;
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.equal(a, b, message); checks++; };

// ---------------------------------------------------------------- 撤退窗口（§3.1）
{
  const state = {};
  const far = { x: S.gap.x + 20, z: S.gap.z - 20 };
  const attackers = [{ alive: true, position: far, mode: "hold" }, { alive: true, position: far, mode: null }, { alive: false, position: S.gap, mode: "rush" }];
  const gunners = [{ alive: true, suppression: 0 }, { alive: true, suppression: 0 }];
  let w = GapWindow({ attackers, gunners, now: 0, state });
  ok(w.rushRepelled && !w.fireSuppressed && !w.open, "men back on their line but both guns up: no window");
  // One gun pinned: it must stay pinned for suppressS before the fact is true.
  gunners[0].suppression = T.suppressLevel;
  w = GapWindow({ attackers, gunners, now: 1, state });
  ok(!w.fireSuppressed, "a gun pinned for a moment is not suppressed yet");
  w = GapWindow({ attackers, gunners, now: 1 + T.suppressS, state });
  ok(w.fireSuppressed && w.open, "a gun held under for suppressS opens the window");
  // The gun lifts its head: the window closes (both facts stay latched by the runtime, the live window does not).
  gunners[0].suppression = 0;
  w = GapWindow({ attackers, gunners, now: 2 + T.suppressS, state });
  ok(!w.fireSuppressed && !w.open, "the gun lifting its head closes the window");
  // A dead gun counts as suppressed for good.
  gunners[1].alive = false;
  w = GapWindow({ attackers, gunners, now: 3 + T.suppressS, state });
  ok(!w.fireSuppressed, "a dead gun also needs suppressS to count (the burst stops, the men still duck)");
  w = GapWindow({ attackers, gunners, now: 3 + 2 * T.suppressS, state });
  ok(w.open, "dead gun + men on their line: open");
  // A live rusher inside gapRadiusM, or any rusher anywhere, shuts it.
  attackers[0].position = { x: S.gap.x + T.gapRadiusM - 1, z: S.gap.z };
  ok(!GapWindow({ attackers, gunners, now: 20, state }).rushRepelled, "a man inside the gap radius keeps the window shut");
  attackers[0].position = far; attackers[1].mode = "charge";
  ok(GapWindow({ attackers, gunners, now: 21, state }).rushRepelled, "a man bounding between covers far out (" + Dist(far, S.gap).toFixed(0) + " m) does not shut the window");
  attackers[1].position = { x: S.gap.x + T.gapRushCloseM - 1, z: S.gap.z };
  ok(!GapWindow({ attackers, gunners, now: 21.5, state }).rushRepelled, "a charging man inside gapRushCloseM keeps the window shut");
  attackers[1].mode = "rush";
  ok(!GapWindow({ attackers, gunners, now: 22, state }).rushRepelled, "a rushing man inside gapRushCloseM keeps the window shut");
  attackers[1].mode = "hold";
  ok(GapWindow({ attackers, gunners, now: 22.5, state }).rushRepelled, "the same man holding behind cover outside the gap radius: repelled");
  attackers[1].position = far; attackers[1].mode = null;
  ok(GapWindow({ attackers, gunners, now: 23, state }).open, "and it opens again when he is back on his line");
  ok(GapWindow({ attackers: [], gunners: [], now: 0, state: {} }).open, "no attackers and no gunners (checkpoint fixture): open");
}

// ---------------------------------------------------------------- 落弹选点
{
  const player = { x: -23.6, z: -126.4 }; // standing on sapShellB
  const squad = [{ x: -28.4, z: -121.6 }]; // a squad man on sapShellA
  const picks = new Set();
  for (let i = 0; i < 40; i++) { const p = PickSapShellPoint(FRONT_SAP_SHELL_POINTS, player, squad, T.sapShellPlayerClearM, () => i / 40); if (p) picks.add(p.id); }
  ok(!picks.has("sapShellB") && !picks.has("sapShellA"), "never the player's or a squad man's point");
  ok(picks.has("sapShellC") && picks.has("sapShellD"), "the other bends are drawn");
  eq(PickSapShellPoint(FRONT_SAP_SHELL_POINTS, player, FRONT_SAP_SHELL_POINTS.map((p) => ({ ...p })), T.sapShellPlayerClearM), null, "squad on every point: no round this turn");
  for (const p of FRONT_SAP_SHELL_POINTS) {
    const { distance } = MissionRouteProjection(MISSION_ROUTES.support, p);
    ok(distance <= 2.2, p.id + " lies on the support sap floor (" + distance.toFixed(2) + " m off the route)");
  }
  // Nest shells: every draw inside the yard box, never within the player's clearance or the squad's.
  const seat = { x: 25.9, z: -153.9 }, luo = { x: 24.75, z: -151.1 };
  let seq = 0; const rng = () => ((seq++ * 7919) % 1000) / 1000;
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const p = PickNestShellPoint(FRONT_NEST_SHELL_AREA, seat, [luo], T.nestShellPlayerClearM, T.nestShellSquadClearM, rng);
    if (!p) continue; n++;
    ok(p.x >= FRONT_NEST_SHELL_AREA.minX && p.x <= FRONT_NEST_SHELL_AREA.maxX && p.z >= FRONT_NEST_SHELL_AREA.minZ && p.z <= FRONT_NEST_SHELL_AREA.maxZ, "inside the yard");
    ok(Dist(p, seat) >= T.nestShellPlayerClearM && Dist(p, luo) >= T.nestShellSquadClearM, "clear of the player and the squad");
  }
  ok(n >= 40, "the yard is wide enough that most draws land: " + n);
  eq(PickNestShellPoint({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { x: .5, z: .5 }, [], 3, 3, rng), null, "a yard the player fills gives no point");
}

// ---------------------------------------------------------------- 跟车步兵解封（§3.3）
{
  const near = { x: S.gap.x + 5, z: S.gap.z }, far = { x: S.gap.x + FRONT_ESCORT_WITHDRAWN.gapClearM + 1, z: S.gap.z };
  eq(EscortsClear([{ alive: true, position: near }], S.gap, 0, 1).clear, false, "an escort near the gap keeps it shut");
  assert.deepEqual(EscortsClear([{ alive: true, position: far }, { alive: false, position: near }], S.gap, 0, 1), { clear: true, why: "withdrawn" }); checks++;
  assert.deepEqual(EscortsClear([{ alive: false, position: near }], S.gap, 0, 1), { clear: true, why: "dead" }); checks++;
  assert.deepEqual(EscortsClear([{ alive: true, position: near }], S.gap, 10, 10 + FRONT_ESCORT_WITHDRAWN.maxS), { clear: true, why: "timeout" }); checks++;
}

// ---------------------------------------------------------------- 阵位前半边人选（§3.2）
{
  const far = (d) => ({ x: S.nest.x + d, z: S.nest.z - d });
  const picks = NestFrontPicks([
    { id: "r1", alive: true, flank: false, position: far(5) },
    { id: "f1", alive: true, flank: true, position: far(40) },
    { id: "f2", alive: false, flank: true, position: far(3) },
    { id: "r2", alive: true, flank: false, position: far(20) },
    { id: "r3", alive: true, flank: false, position: far(10) },
  ], 3);
  assert.deepEqual(picks.map((p) => p.id), ["f1", "r1", "r3"], "flank survivors first, then the nearest reserves; the dead are skipped"); checks++;
  eq(NestFrontPicks([], 4).length, 0, "nobody left: nobody climbs in");
  // The posts: inside the yard's front half, apart from each other and from the gun block.
  for (const p of FRONT_NEST_FRONT_POSTS) {
    ok(p.x > 24.4 && p.x < 33 && p.z <= -151 && p.z > -157.2, "post inside the nest's front half");
    ok(Dist(p, { x: 24.9, z: -153.9 }) >= 1.2, "post clear of the captured gun block");
  }
  for (let i = 0; i < FRONT_NEST_FRONT_POSTS.length; i++) for (let j = i + 1; j < FRONT_NEST_FRONT_POSTS.length; j++)
    ok(Dist(FRONT_NEST_FRONT_POSTS[i], FRONT_NEST_FRONT_POSTS[j]) >= 1.6, "posts >= 1.6 m apart");
}

// ---------------------------------------------------------------- 攻击支路进度（§3.3 渗透组放行）
{
  const r = S.attackRoute;
  ok(!OnAttackBranch(r[0]), "at the rear junction: not yet");
  ok(!OnAttackBranch(r[1]), "at attackRoute[1]: not yet (needs 1 m past it)");
  ok(OnAttackBranch({ x: (r[1].x + r[2].x) / 2, z: (r[1].z + r[2].z) / 2 }), "halfway to [2]: started");
  ok(OnAttackBranch(S.bundleDrop), "at the bundle drop: started");
  ok(!OnAttackBranch({ x: r[3].x + T.branchCorridorM + 3, z: r[3].z }), "off the branch corridor: not counted");
}

// ---------------------------------------------------------------- 数据合约
{
  eq(MISSION_ENCOUNTERS.tankCrew, FRONT_TANK_CREW, "tankCrew encounter group is the roster");
  eq(FRONT_TANK_CREW.length, 2, "two crewmen bail out");
  ok(FRONT_TANK_CREW.every((s) => s.role === "crew" && Math.abs(s.hatchSide) === 1), "each has a hatch side");
  for (const s of FRONT_TANK_CREW) {
    const tactic = MISSION_TACTICS[s.id];
    ok(tactic && tactic.fact === "tankCrewBailed" && tactic.points?.length >= 3, s.id + " runs its flight route on the bail-out fact");
  }
  eq(MISSION_ENCOUNTER_ACTIVATION.tankCrew?.spawn?.fact, "tankFireDisabled", "the crew exists only once the tank is Disabled");
  for (const id of ["gapRushRepelled", "gapFireSuppressed", "frontObserved", "gapGuardKilled", "nestFrontContested", "sapInfiltrationStarted", "tankCrewBailed", "escortsWithdrawn", "tankAtBendExit", "tankHeard"])
    ok(MISSION_FACT_GATES[id], "fact gate exists: " + id);
  ok(!MISSION_FACT_GATES.tankPreviewed && !MISSION_FACT_GATES.bundleReturned && !MISSION_FACT_GATES.bundleHouseReached, "retired facts are gone from the gate table");
  ok(MISSION_FACT_GATES.frontRifleDefense.requires.includes("gapRushRepelled") && MISSION_FACT_GATES.frontRifleDefense.requires.includes("gapFireSuppressed"), "frontRifleDefense needs both window facts");
  // The sacrificed guard is a second-batch man, not the first-batch speaker (FACED_FRONT_GUARD_INDEX 5) and not a first-batch man.
  ok(T.gapSacrificeGuard >= B.firstBatch && T.gapSacrificeGuard !== 5, "the sacrificed guard is in the second batch and is not the faced speaker");
  ok(T.woundedGuard < B.firstBatch, "the wounded man is in the first batch");
  ok(T.nestShellPlayerClearM >= 3.5 && T.sapShellPlayerClearM >= 5, "shells keep their distance from the player");
  eq(T.sapShellDamage, 0, "sap shells are ambient (no TTK account)");
  // 10-12 drives: at 110 a round cost 23 hp at 3.5 m; at 40 still 3.5-5 hp plus a bleeding wound each (nine rounds bled the
  // player out). The yard rounds are theatre with concussion: no hp (FireShell feedbackOnly).
  eq(T.nestShellDamage, 0, "nest shells are pressure, not the killer: no hp, no wound");
  ok(T.suppressLevel <= 0.3, "the gun counts as suppressed at the AI's own threshold (Script_Ai wake check 0.3)");
  ok(T.gapRushCloseM > T.gapRadiusM, "the rush ring is wider than the gap ring");
  ok(T.gapKillShots >= 3 && T.gapRunMaxS >= 5, "the hull MG walks a burst onto the guard, not an instant kill");
  ok(TANK.sapWatch && TANK.sapWatch.stage === "Tank" && TANK.sapWatch.playerClearM >= 3, "the tank's sap watch is a 05 thing with a player clearance");
  eq(TANK.barkCues.turretTraverse, null, "tank_turret is retired");
}

// ---------------------------------------------------------------- 03 交枪：坑沿兜底（FrontBattle.RampLift）
{
  const { FirstLevelFrontBattle } = await import("./Script_FirstLevelFrontBattle.mjs");
  const placed = [];
  const he = { id: 3, castId: "heyoutian", alive: true, position: { x: S.leftSeat.x, z: S.leftSeat.z + 4.1 } };
  const r = { time: 0, squadRoutes: new Map(), tank: {}, flow: { stage: { id: "Support" } }, Has: () => false, PlaceActor: (a, p) => { a.position = { ...p }; placed.push({ ...p }); } };
  const battle = new FirstLevelFrontBattle(r);
  battle.RampLift(he); r.time = B.walkStallS - 0.1; battle.RampLift(he);
  eq(placed.length, 0, "no lift before walkStallS without progress");
  he.position.z -= 1.0; battle.RampLift(he); r.time = B.walkStallS + 2; battle.RampLift(he);
  eq(placed.length, 0, "progress on the ramp resets the clock");
  r.time = 2 * B.walkStallS + 3; battle.RampLift(he);
  eq(placed.length, 1, "a man stalled at the ramp's foot for walkStallS is lifted onto the pit floor");
  ok(Math.abs(placed[0].z - (S.leftSeat.z + B.handoverRampLiftM)) < 1e-9 && placed[0].x === S.leftSeat.x, "lifted handoverRampLiftM short of the seat");
  ok(battle.State().stalls.some((s) => s.kind === "rampLift" && s.id === "heyoutian"), "the lift is logged for probes");
  const far = { id: 4, castId: "x", alive: true, position: { x: S.leftSeat.x, z: S.leftSeat.z + 9 } };
  battle.RampLift(far); r.time += 2 * B.walkStallS; battle.RampLift(far);
  eq(placed.length, 1, "a man far up the trench is not the ramp's business");
  ok(B.handoverRampFootM[0] > B.arrivalM && B.handoverRampLiftM > B.arrivalM, "the lift lands him short of arrival, the walk finishes on foot");
}

// ---------------------------------------------------------------- 运行时钩子
{
  const read = (f) => fs.readFileSync(new URL("./" + f, import.meta.url), "utf8");
  const runtime = read("Script_FirstLevelMissionRuntime.mjs");
  ok(runtime.includes("new FirstLevelFrontCounterattack(this)"), "runtime owns one counterattack module");
  ok(runtime.indexOf("this.frontCounter.Update(dt)") < runtime.indexOf("this.frontBattle.Update(dt)"), "counterattack updates before FrontBattle (it writes the flags FrontBattle reads this frame)");
  ok(runtime.includes("frontCounter:this.frontCounter.State()") || runtime.includes("frontCounter: this.frontCounter.State()"), "state exposed for the browser gates");
  const mod = read("Script_FirstLevelFrontCounterattack.mjs");
  for (const fact of [...mod.matchAll(/r\.Record\("([A-Za-z]+)"/g)].map((m) => m[1])) ok(MISSION_FACT_GATES[fact], "recorded fact is in the gate table: " + fact);
  const battle = read("Script_FirstLevelFrontBattle.mjs");
  ok(battle.includes("frontCounter.WindowOpenFor") || battle.includes("frontCounter?.WindowOpenFor"), "the first batch asks the window before each man leaves cover");
  ok(battle.includes("g.sacrifice"), "FrontBattle skips the sacrificed guard");
  ok(battle.includes("GapBody"), "FrontBattle tugs at the body in the gap");
}

console.log(`FirstLevelFrontCounterattackTest 通过：${checks} 条断言`);
