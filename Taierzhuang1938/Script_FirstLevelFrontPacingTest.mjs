// ===========================================================================
// Script_FirstLevelFrontPacingTest.mjs —— 03–06 节奏与流程（Front 包 2026-09-24 第二步）的纯 Node 门禁
//
// 契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §2.6、§5.5、§8（v1.1 两处卡死）；
// 空间 docs/Data_FirstLevelSpace0106_20260923.md §10.2（returnMeet、zhouExit）。
//   ① 03 过关：何有田先到枪边老周才松手；老周离枪 ≥10 m 记 zhouLeftGun；下撤走 FRONT_SORTIE.zhouExit
//   ② 05 非理想顺序：先炸车（没到攻击位）照样往下走；撤离与接防并行（西门看缺口 → 安全区汇合 → 回集结处）
//   ③ 06 起行：担架一开始就按间距排开，zhouOnLitter 那一帧不许判「已起行」（v1.1 卡死 ①）
//   ④ 03–06 对白走 voice.PlayScene、一次一场、说话人按 binder 找到的真人
//   ⑤ 指引：战车露面、压阵位之前指向战车
//   ⑥ 场外落弹区离战车路线、出发壕、我方沟网足够远
//
// 跑法：node Taierzhuang1938/Script_FirstLevelFrontPacingTest.mjs
// ===========================================================================
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FirstLevelFrontBattle, ColumnDeparture, BatchPastGap, SplitRoute } from "./Script_FirstLevelFrontBattle.mjs";
import { FirstLevelFrontScenes, FRONT_SCENE_IDS, FrontSceneSpeakers } from "./Script_FirstLevelFrontScenes.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as Space, FRONT_TANK_PATH } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES as Routes, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { MISSION_BATTLE_SOUND as Sound } from "./Data_FirstLevelMissionBattleSound.mjs";
import { FIRST_LEVEL_MUSIC_COMBAT } from "./Data_FirstLevelMissionMusic.mjs";
import { MISSION_FACT_GATES } from "./Data_FirstLevelMissionGates.mjs";
import { FirstLevelMissionColumn } from "./Script_FirstLevelMissionColumn.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Read = (name) => fs.readFileSync(path.join(here, name), "utf8");
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Near = (a, b, m) => Dist(a, b) < m;
let checks = 0;
const Ok = (label) => console.log(`ok ${label}`);

// ---------------------------------------------------------------------------
// ① 03 handover: He first, Zhou 10 m off the gun
// ---------------------------------------------------------------------------
{
  const facts = new Map(), calls = [];
  const he = { id: 3, alive: true, position: { x: -34, z: -147 } };
  const yaowa = { id: 2, alive: true, position: { ...S.leftSeat } };
  const zhou = { id: 54, alive: true, health: 80, position: { ...S.leftSeat } };
  const gun = { npc: zhou };
  const r = { opening: { zhou }, column: { zhou: {} }, squadRoutes: new Map(), time: 0,
    companion: { Handle: (who) => ({ heyoutian: he, yaowa })[who] },
    Has: (id) => facts.has(id), Record: (id, d) => { if (facts.has(id)) return false; facts.set(id, d ?? true); return true; },
    Defend: () => calls.push("defend"), OnPlayerDown: () => calls.push("fail"),
    emplacement: { guns: new Map([["Left", gun]]), NpcVacate: () => { gun.npc = null; calls.push("vacate"); },
      NpcOccupy: (_, a) => { gun.npc = a; calls.push("occupy"); } },
    leftGunId: "Left", ai: { Remove: () => calls.push("remove") }, Say: (id) => calls.push(`say:${id}`) };
  const battle = new FirstLevelFrontBattle(r); r.frontBattle = battle;
  facts.set("rifleWithdrawalResolved", true);
  battle.Walk = () => false;
  battle.UpdateZhou();
  assert.ok(!battle.walks.has(zhou.id) && gun.npc === zhou, "Zhou keeps the gun while He is still 9 m up the access trench");
  battle.StartHandover();
  assert.ok(calls.includes("say:TakeOverGun") && battle.walks.get(he.id).route.at(-1).x === S.leftSeat.x, "He is sent to the seat");
  he.position = { x: S.leftSeat.x + 0.4, z: S.leftSeat.z + 2.2 };
  battle.UpdateZhou();
  assert.ok(calls.includes("vacate"), "Zhou lets go once He stands within handoverReadyM of the seat");
  const route = battle.walks.get(zhou.id).route;
  assert.deepEqual(route.slice(0, S.zhouExit.length).map((p) => [p.x, p.z]), S.zhouExit.map((p) => [p.x, p.z]),
    "Zhou walks the access-trench polyline FRONT_SORTIE.zhouExit");
  assert.deepEqual(route.at(-1), { ...P.collection.zhouWall }, "... and ends at the collection wall");
  he.position = { x: S.leftSeat.x + 0.3, z: S.leftSeat.z };
  battle.UpdateHandover();
  assert.ok(gun.npc === he && facts.has("leftGunHandover"), "He takes the gun Zhou left");
  zhou.position = { x: S.leftSeat.x, z: S.leftSeat.z + (B.zhouLeftGunM - 0.2) };
  battle.UpdateZhou();
  assert.ok(!facts.has("zhouLeftGun"), "9.8 m off the gun is not yet off it");
  zhou.position = { x: S.leftSeat.x, z: S.leftSeat.z + (B.zhouLeftGunM + 0.2) };
  battle.UpdateZhou();
  assert.ok(facts.has("zhouLeftGun") && !facts.has("zhouGunWounded"), "10.2 m: zhouLeftGun, the walk to the collection goes on");
  checks += 8;
  Ok("① 03 handover: He at the gun before Zhou lets go, zhouExit walk, zhouLeftGun at 10 m");
}

// ---------------------------------------------------------------------------
// ② 05 in a non-ideal order: bomb first, then a parallel withdrawal and return
// ---------------------------------------------------------------------------
{
  const facts = new Map(), said = [];
  const player = { position: { ...S.attackRoute[3] } };
  const luo = { id: 1, alive: true, position: { ...S.attackRoute[2] } };
  const guardRoute = (i) => P.guardWithdrawalRoutes[i];
  const guards = Array.from({ length: 8 }, (_, i) => ({ actor: { id: 100 + i, alive: true }, route: guardRoute(i), progress: i < 2 ? guardRoute(i).length : 1, safe: i < 2 }));
  const r = { time: 0, tank: { brain: {}, fireDisabled: true, immobilized: true }, player, guards, squadRoutes: new Map(),
    flow: { stage: { id: "Tank" } }, voice: { played: new Set(), finished: new Set() },
    companion: { Handle: (who) => (who === "luo" ? luo : null) },
    Has: (id) => facts.has(id), Record: (id, d) => { if (facts.has(id)) return false; facts.set(id, d ?? true); return true; },
    Near: (p, m) => Near(player.position, p, m), Inventory: () => ({ bundles: 0 }), Say: (id) => said.push(id) };
  const battle = new FirstLevelFrontBattle(r);
  for (const f of ["bundleTaken", "bundleReturned", "tankImmobilized", "tankFireDisabled"]) facts.set(f, true);
  // The player threw from the branch before either of them stood on the attack position (contract v1.1 deadlock ②).
  battle.UpdateSortie();
  assert.ok(facts.get("attackPositionReached")?.skipped, "bomb-first: attackPositionReached is recorded as skipped, not waited for");
  assert.equal(battle.leg, "retreat", "the pair first falls back along the attack branch");
  player.position = { ...S.rear };
  battle.UpdateSortie();
  assert.ok(facts.has("attackRetreated") && battle.leg === "gapWatch",
    "back at the rear junction with the last batch still behind the gap: hold at the nest's west door, not on the branch");
  const watch = battle.walks.get(luo.id).route;
  assert.ok(Dist(watch.at(-1), Space.westDoor) < 0.3, "the gap-watch leg ends at the west door (K10)");
  assert.ok(!facts.has("lastGuardsWithdrawn"), "the last batch is not home yet (the stage cannot pass on the pair's return alone)");
  // The last batch crosses: every live man past the gap point on his route.
  for (const g of guards.slice(2)) g.progress = g.route.findIndex((p) => Dist(p, S.gap) < 0.01) + 1;
  assert.ok(BatchPastGap(guards.slice(2)), "BatchPastGap reads the guards' route progress");
  battle.UpdateSortie();
  assert.equal(battle.leg, "disengage", "once the batch is past the gap the pair goes on toward the safe zone");
  const toMeet = battle.walks.get(luo.id).route;
  assert.ok(Dist(toMeet.at(-1), Space.returnMeet) < Space.returnMeet.radiusM, "the disengage leg ends at returnMeet");
  luo.position = { ...Space.returnMeet };
  battle.UpdateSortie();
  assert.equal(battle.leg, "disengage", "Luo holds at returnMeet until FrontRelief has started");
  r.voice.played.add("FrontRelief");
  battle.UpdateSortie();
  assert.equal(battle.leg, "home", "after the meeting the pair walks home");
  const home = battle.walks.get(luo.id).route;
  assert.ok(Dist(home.at(-1), Routes.orders.at(-1)) < 0.01, "home ends at the collection");
  // A meeting nobody comes to cannot hold the pair for ever.
  const r2 = { ...r, time: 0, voice: { played: new Set(), finished: new Set() }, squadRoutes: new Map() };
  const b2 = new FirstLevelFrontBattle(r2); b2.gapWatched = true;
  b2.UpdateSortie(); r2.time = B.returnMeetMaxWaitS + 0.1; b2.UpdateSortie();
  assert.equal(b2.leg, "home", "returnMeetMaxWaitS bounds the wait at returnMeet");
  checks += 11;
  Ok("② 05 bomb-first + parallel withdrawal: skipped attack position, west-door watch, returnMeet, home");
}

// ②b the relief comes up when the tank is silenced; FrontRelief is said at returnMeet by the NCO posted there
{
  const facts = new Map(), said = [], spawned = [];
  const player = { position: { ...S.rear } };
  const r = { time: 0, tank: { brain: {}, fireDisabled: true }, player, guards: [], squadRoutes: new Map(),
    flow: { stage: { id: "Tank" } }, voice: { played: new Set(), finished: new Set() },
    companion: { Handle: () => null },
    Has: (id) => facts.has(id), Record: (id, d) => { if (facts.has(id)) return false; facts.set(id, d ?? true); return true; },
    Near: (p, m) => Near(player.position, p, m), Say: (id) => said.push(id),
    ai: { Spawn: (side, x, z, opts) => { const a = { id: 500 + spawned.length, alive: true, position: { x, z }, opts }; spawned.push(a); return a; } },
    emplacement: { NpcVacate() {}, NpcOccupy() {} } };
  const battle = new FirstLevelFrontBattle(r);
  battle.UpdateRelief(0.1);
  assert.equal(spawned.length, 0, "no relief while the tank still fires");
  facts.set("tankFireDisabled", true);
  battle.Walk = () => false;
  battle.UpdateRelief(0.1);
  assert.equal(spawned.length, 3, "tank silenced: the relief (NCO, gunner, gap-junction holder) comes up at once, before the last batch is home");
  const nco = r.relief.find((e) => e.speaking);
  assert.ok(nco && r.relief.filter((e) => e.speaking).length === 1, "one relief man is the speaking NCO");
  assert.ok(Dist(nco.route.at(-1), Space.returnMeet) < Space.returnMeet.radiusM, "the NCO's post is at returnMeet");
  const holder = r.relief.find((e) => !e.speaking && !e.gun);
  assert.ok(holder.route.some((p) => Dist(p, S.approach[7]) < 0.01), "the gap-junction holder walks the support sap, not a straight line across it");
  battle.Walk = () => true;
  facts.set("lastGuardsWithdrawn", true);
  battle.UpdateRelief(0.1);
  assert.ok(facts.has("reliefInPosition") && !said.includes("FrontRelief"), "relief in position; FrontRelief waits for the pair at returnMeet");
  player.position = { ...Space.returnMeet };
  battle.UpdateRelief(0.1);
  assert.ok(said.includes("FrontRelief") && facts.has("returnMet"), "FrontRelief is said when the player reaches returnMeet");
  checks += 7;
  Ok("②b relief dispatched on tankFireDisabled, NCO at returnMeet, FrontRelief on arrival");
}

// ---------------------------------------------------------------------------
// ③ 06 departure (contract v1.1 deadlock ①)
// ---------------------------------------------------------------------------
{
  const column = new FirstLevelMissionColumn();
  const litters = column.litters, zhou = litters.find((l) => l.zhou);
  assert.ok(litters.some((l) => l.progress >= R.litterSpacingM), "precondition: the litters start spaced out (the old test was true at once)");
  zhou.state = "fallen";
  let d = ColumnDeparture(null, litters, R.litterSpacingM);
  assert.ok(!d.departed && d.baseline === null, "Zhou still by the wall (fallen): not departed, no baseline");
  zhou.state = "waiting";
  d = ColumnDeparture(d.baseline, litters, R.litterSpacingM);
  assert.ok(!d.departed && d.lead === 0, "same frame Zhou is back in the queue: not departed");
  for (const l of litters) l.progress += R.litterSpacingM - 0.1;
  d = ColumnDeparture(d.baseline, litters, R.litterSpacingM);
  assert.ok(!d.departed, "3.3 m of movement is not a departure");
  litters[0].progress += 0.2;
  d = ColumnDeparture(d.baseline, litters, R.litterSpacingM);
  assert.ok(d.departed && d.lead >= R.litterSpacingM, "the lead litter has really moved litterSpacingM");
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(runtime.includes("ColumnDeparture(this.columnDepartureBase,this.column.litters,R.litterSpacingM)")
    && !runtime.includes("this.column.litters.some(litter=>litter.progress>=R.litterSpacingM)"), "the runtime uses ColumnDeparture, not the absolute progress test");
  checks += 6;
  Ok("③ 06 columnDeparted only after Zhou's litter is back in the queue and the column moved a spacing");
}

// ---------------------------------------------------------------------------
// ④ 03–06 scenes: voice.PlayScene, one at a time, speakers from live bodies
// ---------------------------------------------------------------------------
{
  const perLine = new Set(MISSION_DIALOGUE.filter((cue) => cue.perLine).map((cue) => cue.id));
  for (const id of FRONT_SCENE_IDS) assert.ok(perLine.has(id), `${id} is a per-line scene`);
  // Every per-line scene the 03–06 code triggers is owned here.
  const triggered = new Set();
  for (const file of ["Script_FirstLevelFrontBattle.mjs", "Script_FirstLevelFrontShow.mjs", "Script_FirstLevelCollection.mjs",
    "Script_FirstLevelTankRuntime.mjs"])
    for (const m of Read(file).matchAll(/\bSay\("([A-Za-z]+)"\)/g)) if (perLine.has(m[1])) triggered.add(m[1]);
  for (const m of Read("Script_FirstLevelMissionRuntime.mjs").matchAll(/this\.Say\("([A-Za-z]+)"\)/g))
    if (perLine.has(m[1]) && ["TankStopped", "TankTerror", "Volunteer"].includes(m[1])) triggered.add(m[1]);
  for (const id of triggered) assert.ok(FRONT_SCENE_IDS.includes(id), `${id} (triggered in 03–06) plays as a scene`);
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/if \(this\.frontScenes\?\.Owns\(id\)\) \{ this\.frontScenes\.Say\(id\); return; \}\s*\n\s*if \(CUE_IDS\.has\(id\)\) \{ this\.voice\.Enqueue/.test(runtime),
    "runtime.Say hands 03–06 scenes to FirstLevelFrontScenes before the old queue");

  const played = [], soldiers = [];
  const handles = [];
  const voice = { played: new Set(), current: null, queue: [], paused: false, CancelGuidance() {},
    PlayScene(id, opts) { const h = { id, opts, done: false }; handles.push(h); played.push(id); this.played.add(id); return h; },
    Enqueue(id) { this.queue.push(id); } };
  const zhouBody = { id: 54, alive: true, position: { x: -33.6, y: 0, z: -156.4 } };
  const heBody = { id: 3, alive: true, position: { x: -30, y: 0, z: -150 } };
  soldiers.push(heBody);
  const r = { voice, flow: { stage: { id: "Support" } }, ai: { soldiers }, time: 0,
    speakers: { ActorForWho: (who) => ({ zhou: zhouBody, heyoutian: heBody })[who] || null } };
  const scenes = new FirstLevelFrontScenes(r);
  assert.ok(scenes.Owns("FrontBlockade") && !scenes.Owns("SouthWhisper"), "owns 03–06 scenes only");
  r.flow.stage.id = "South";
  assert.ok(!scenes.Owns("FrontBlockade"), "outside 03–06 the old queue keeps every id");
  r.flow.stage.id = "Support";
  scenes.Say("FrontBlockade"); scenes.Say("FrontApproach"); scenes.Say("FrontBlockade");
  scenes.Update();
  assert.deepEqual(played, ["FrontBlockade"], "one scene at a time, duplicates dropped");
  assert.ok(scenes.Busy, "busy while a scene plays (reminders and casualty reactions hold off)");
  scenes.Update();
  assert.deepEqual(played, ["FrontBlockade"], "the next scene waits for the first to finish");
  const speakers = handles[0].opts.speakers;
  assert.ok(!("shunzi" in speakers), "Shunzi speaks centred (no body)");
  assert.equal(speakers.zhou(), null, "a body no longer in the simulation falls back to the runtime position");
  soldiers.push(zhouBody);
  assert.deepEqual(speakers.zhou(), { x: -33.6, y: 1.5, z: -156.4 }, "Zhou's line comes from Zhou's body at the left gun");
  handles[0].done = true;
  scenes.Update();
  assert.deepEqual(played, ["FrontBlockade", "FrontApproach"], "then the next one");
  scenes.Say("FrontBlockade");
  handles[1].done = true; scenes.Update();
  assert.deepEqual(played, ["FrontBlockade", "FrontApproach"], "a scene is never played twice");
  const he = FrontSceneSpeakers(MISSION_DIALOGUE.find((c) => c.id === "TankRoadContact"), (who) => (who === "heyoutian" ? heBody : null));
  assert.deepEqual(he.heyoutian(), { x: -30, y: 1.5, z: -150 }, "「右边路上！战车出来了！」 comes from He's own position");
  const guide = Read("Script_FirstLevelLeaderGuide.mjs");
  assert.ok(guide.includes("r.frontScenes?.Busy"), "the leader's reminders treat a playing front scene as story");
  checks += 12;
  Ok(`④ ${FRONT_SCENE_IDS.length} scenes through PlayScene: routing, one at a time, live speakers, fallback`);
}

// ---------------------------------------------------------------------------
// ⑤ guide targets the tank at its reveal and before it shells the nest
// ---------------------------------------------------------------------------
{
  const facts = new Set(["rightNestCaptured"]);
  const r = { flow: { stage: { id: "Support" } }, tank: { present: true, x: 49.5, z: -202.4 }, player: { position: { ...S.seat } },
    Has: (id) => facts.has(id), Near: () => false, companion: { Handle: () => null } };
  const battle = new FirstLevelFrontBattle(r);
  assert.equal(battle.Guide().label, "front", "03 before the preview: the gap");
  facts.add("tankPreviewed");
  let g = battle.Guide();
  assert.ok(g.label === "tank" && g.target.x === 49.5 && g.target.z === -202.4, "03 preview: the tank");
  r.flow.stage.id = "MachineGun"; r.tank.x = 60; r.tank.z = -177;
  g = battle.Guide();
  assert.ok(g.label === "tank" && g.target.x === 60, "04 before the pressure: the tank coming out of the bend");
  facts.add("tankPositionPressured");
  assert.equal(battle.Guide().label, "bundle", "04 after the pressure: back to the rear wall");
  const text = Read("Data_Text_FirstLevel.mjs");
  assert.ok(text.includes('"firstLevel.guide.tank"'), "guide label text for the tank");
  checks += 5;
  Ok("⑤ guide points at the tank during the preview and before the pressure");
}

// ---------------------------------------------------------------------------
// ⑥ artillery zones and the music stinger
// ---------------------------------------------------------------------------
{
  const zones = Sound.artillery.zones;
  const RectPointDistance = (z, p) => Math.hypot(Math.max(z.xMin - p.x, 0, p.x - z.xMax), Math.max(z.zMin - p.z, 0, p.z - z.zMax));
  const Samples = [];
  for (let i = 1; i < FRONT_TANK_PATH.length; i++) {
    const a = FRONT_TANK_PATH[i - 1], b = FRONT_TANK_PATH[i], n = Math.ceil(Dist(a, b) / 0.5);
    for (let k = 0; k <= n; k++) Samples.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  for (const z of zones) {
    const tank = Math.min(...Samples.map((p) => RectPointDistance(z, p)));
    assert.ok(tank >= 12, `${z.id} is ${tank.toFixed(1)} m from the tank road (>= 12)`);
    const [j0, j1] = Space.jumpOff.trench, jump = Math.min(...[0, .25, .5, .75, 1].map((t) => RectPointDistance(z, { x: j0.x + (j1.x - j0.x) * t, z: j0.z })));
    assert.ok(jump >= 10, `${z.id} is ${jump.toFixed(1)} m from the north jump-off trench (>= 10)`);
    // Our side: the trench network, nest, yard and collection all lie inside x -45..56, z -165..-95.
    const ours = { xMin: -45, xMax: 56, zMin: -165, zMax: -95 };
    const overlap = z.xMin < ours.xMax && z.xMax > ours.xMin && z.zMin < ours.zMax && z.zMax > ours.zMin;
    assert.ok(!overlap, `${z.id} stays off our side`);
  }
  assert.ok(FIRST_LEVEL_MUSIC_COMBAT.stingers.includes("breachReopened") && MISSION_FACT_GATES.breachReopened?.step === "Tank",
    "breachReopened is a fact with a gate entry and a music stinger");
  const battle = Read("Script_FirstLevelFrontBattle.mjs");
  assert.ok(battle.includes('r.Record("breachReopened")'), "FrontBattle records breachReopened");
  checks += zones.length * 3 + 2;
  Ok(`⑥ ${zones.length} artillery zones clear of the tank road, the jump-off trench and our side; breachReopened stinger`);
}

// Routes the legs are cut from actually pass the named points.
{
  const back = Routes.orders.slice(S.attackRoute.length - 1);
  const [head, tail] = SplitRoute(back, Space.westDoor);
  assert.ok(Dist(head.at(-1), Space.westDoor) < 0.3 && Dist(tail[0], head.at(-1)) < 1e-9, "the 05 return passes the west door");
  const [toMeet] = SplitRoute(tail, Space.returnMeet);
  assert.ok(Dist(toMeet.at(-1), Space.returnMeet) < Space.returnMeet.radiusM, "... and returnMeet");
  checks += 2;
}

console.log(`FirstLevelFrontPacingTest 通过：${checks} 条断言`);
