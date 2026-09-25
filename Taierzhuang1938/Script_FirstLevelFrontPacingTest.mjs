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
//   ⑦ 卡住兜底（2026-09-24 审查的两次冷启动卡死）：走路卡在一个中间点不动 → 跳点；接防班长期卡住、有人阵亡
//      也照样记 reliefInPosition；罗班长被枪座挡住 → 玩家在后墙岔口等够 rearLeaderGraceS 照样 rightRearReached；
//      受保护的待撤守军身边不落手榴弹（任务侧投弹否决）
//   ⑧ 09-25 分镜还原（docs/Data_FirstLevelStoryboard0103Contract.md §2.11–12，SB07/SB08）：罗班长 03 领路保持在玩家前
//      3–5 m（落后就跑、超前就等、拐角停下指路）；「贴这道墙！前头有人！」在玩家约 (5,−143) 触发；背坡机枪组是第二批里的
//      两名守军（03 趴在坡上只打授权点、04 下到浅壕集合）；第一批 5 人成一列过缺口（间距 firstColumnSpacingM 1.6 m）；
//      指路那 2.8 s 罗站着慢走、只放下枪（不清目标）；SB08 视线锥里不摆尸体
//
// 跑法：node Taierzhuang1938/Script_FirstLevelFrontPacingTest.mjs
// ===========================================================================
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FirstLevelFrontBattle, ColumnDeparture, BatchPastGap, SplitRoute, GuardClearOfGap, GuardWithdrawalRoute, FrontGuardMgMember, LeadPace, LeadCorner, LastCoverIndex } from "./Script_FirstLevelFrontBattle.mjs";
import { FRONT_GUARD_MG_GROUP, FRONT_GUARD_POSTS, MISSION_AFTERMATH, FRONT_SB08_SIGHTLINE, InFrontSb08Sightline } from "./Data_FirstLevelMissionFront.mjs";
import { FACED_FRONT_GUARD_INDEX } from "./Data_FirstLevelSpeakingCast.mjs";
import { RouteClearance } from "./Script_FirstLevelSpaceProbe.mjs";
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
  // Contract v1.8: ZhouGunExitRoute counts the corner under his feet as behind him. Zhou sits on the seat,
  // zhouExit[0], so he walks the whole polyline from [1] (the old copy started with the seat he stands on).
  assert.ok(Dist(S.zhouExit[0], S.leftSeat) < 1e-9, "zhouExit starts at the seat");
  assert.deepEqual(route.slice(0, -1).map((p) => [p.x, p.z]), S.zhouExit.slice(1).map((p) => [p.x, p.z]),
    "Zhou walks the access-trench polyline FRONT_SORTIE.zhouExit on from the seat");
  assert.deepEqual(route.at(-1), { ...P.collection.zhouWall }, "... and ends at the collection wall");
  // 09-24 01->06 verify run: He's walk had ended while Zhou still held the gun, then he was shoved to 1.31 m and
  // the hold order parked him there - the seat stayed free for 240 s and 03 never ended.
  battle.walks.get(he.id).index = battle.walks.get(he.id).route.length;
  he.position = { x: -33.34, z: -155.11 };
  battle.UpdateHandover();
  assert.ok(gun.npc === null && !facts.has("leftGunHandover"), "1.31 m off the seat is not a handover");
  const reWalk = battle.walks.get(he.id);
  assert.ok(reWalk.index === 0 && reWalk.route.length === 1 && Dist(reWalk.route[0], S.leftSeat) < 1e-9,
    "a finished walk off the free seat is walked onto the seat again");
  battle.UpdateHandover();
  assert.ok(battle.walks.get(he.id) === reWalk, "... once, not every frame");
  he.position = { x: S.leftSeat.x + 0.3, z: S.leftSeat.z };
  battle.UpdateHandover();
  assert.ok(gun.npc === he && facts.has("leftGunHandover"), "He takes the gun Zhou left");
  zhou.position = { x: S.leftSeat.x, z: S.leftSeat.z + (B.zhouLeftGunM - 0.2) };
  battle.UpdateZhou();
  assert.ok(!facts.has("zhouLeftGun"), "9.8 m off the gun is not yet off it");
  zhou.position = { x: S.leftSeat.x, z: S.leftSeat.z + (B.zhouLeftGunM + 0.2) };
  battle.UpdateZhou();
  assert.ok(facts.has("zhouLeftGun") && !facts.has("zhouGunWounded"), "10.2 m: zhouLeftGun, the walk to the collection goes on");
  checks += 12;
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
  const guards = Array.from({ length: 8 }, (_, i) => ({ actor: { id: 100 + i, alive: true }, route: guardRoute(i), progress: i < B.firstBatch ? guardRoute(i).length : 1, safe: i < B.firstBatch }));
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
  for (const g of guards.slice(B.firstBatch)) g.progress = g.route.findIndex((p) => Dist(p, S.gap) < 0.01) + 1;
  assert.ok(BatchPastGap(guards.slice(B.firstBatch)), "BatchPastGap reads the guards' route progress");
  battle.UpdateSortie();
  assert.equal(battle.leg, "disengage", "once the batch is past the gap the pair goes on toward the safe zone");
  const toMeet = battle.walks.get(luo.id).route;
  assert.ok(Dist(toMeet.at(-1), Space.returnMeet) < Space.returnMeet.radiusM, "the disengage leg ends at returnMeet");
  luo.position = { ...Space.returnMeet };
  battle.UpdateSortie();
  assert.equal(battle.leg, "disengage", "Luo holds at returnMeet until FrontRelief has started");
  assert.ok(!facts.has("frontDisengaged"), "the player still at the rear junction has not disengaged");
  player.position = { x: Space.returnMeet.x + 1, z: Space.returnMeet.z };
  battle.UpdateSortie();
  assert.ok(facts.has("frontDisengaged"), "both behind the fold in the safe zone: frontDisengaged (not at SJ next to the collection)");
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
  checks += 13;
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
  // A tank call held back by a scene goes first and supersedes a BundleRetreat that has not started (09-24 review:
  // 「履带断了！还在打！再补一捆！」 never played, BundleRetreat's opposite 「回来！低头！」 took its slot).
  handles[1].done = true; scenes.Update();
  scenes.Say("BundleRetreat"); scenes.Say("TankStopped");
  let hold = true; r.tankRuntime = { HoldsDialogue: () => hold };
  assert.ok(scenes.Drop("BundleRetreat") && !scenes.Drop("BundleRetreat"), "Drop takes a pending scene off the queue once");
  scenes.Update();
  assert.equal(played.length, 2, "a queued / sounding tank call holds the next scene");
  hold = false; scenes.Update();
  assert.deepEqual(played.slice(2), ["TankStopped"], "then the queue goes on without the dropped scene");
  const tankRt = Read("Script_FirstLevelTankRuntime.mjs");
  assert.ok(tankRt.includes('if (id === "trackCut") this.r.frontScenes?.Drop?.("BundleRetreat")') && tankRt.includes("RetryBarks()"),
    "the tank runtime queues a call the dialogue held back and drops BundleRetreat for the track call");
  checks += 16;
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
  const beside = Math.hypot(B.guideTankLeadM, B.guideTankSideM);
  // Bearing from the player: the marker sits off the tank's line by guideTankSideM (not on the turret).
  const OffLine = (t, m) => { const p = r.player.position, ax = t.x - p.x, az = t.z - p.z, bx = m.x - p.x, bz = m.z - p.z;
    return Math.abs(ax * bz - az * bx) / Math.hypot(ax, az); };
  assert.ok(g.label === "tank" && Math.abs(Dist(g.target, { x: 49.5, z: -202.4 }) - beside) < 0.01
    && OffLine({ x: 49.5, z: -202.4 }, g.target) > B.guideTankSideM * 0.8,
    "03 preview: the tank (the marker beside it on the ground, off the turret's line of sight)");
  r.flow.stage.id = "MachineGun"; r.tank.x = 60; r.tank.z = -177;
  g = battle.Guide();
  assert.ok(g.label === "tank" && Math.abs(Dist(g.target, { x: 60, z: -177 }) - beside) < 0.01, "04 before the pressure: the tank coming out of the bend");
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

// The next guard starts when the man ahead is gapClearM past the gap, not when he is in the safe zone.
{
  const route = P.guardWithdrawalRoutes[0], gapI = route.findIndex((p) => Dist(p, S.gap) < 0.01);
  const g = { safe: false, route, actor: { position: { ...S.gap } } };
  assert.ok(!GuardClearOfGap(g), "a man in the gap blocks the next one");
  g.actor.position = { x: S.gap.x, z: S.gap.z + B.gapClearM + 0.3 };
  assert.ok(gapI > 0 && GuardClearOfGap(g), "gapClearM past the gap (toward the trench) frees it");
  checks += 2;
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

// ---------------------------------------------------------------------------
// ⑦ stall fallbacks and the grenade veto (09-24 review: two cold starts hung, one lost the second batch)
// ---------------------------------------------------------------------------
function WalkRuntime(extra = {}) {
  const facts = new Map(), said = [], moves = [];
  const r = { time: 0, squadRoutes: new Map(), player: { position: { x: 0, z: 0 } }, guards: [],
    flow: { stage: { id: "MachineGun" } }, voice: { played: new Set(), finished: new Set() },
    Has: (id) => facts.has(id), Record: (id, d) => { if (facts.has(id)) return false; facts.set(id, d ?? true); return true; },
    Near: (p, m) => Near(r.player.position, p, m), Say: (id) => said.push(id),
    RespondToGrenade: () => false, Defend() {}, MoveActor: (a, p, speed) => moves.push({ id: a.id, x: p.x, z: p.z, speed }),
    ai: { ReleaseCover() {}, SetStance() {} }, BlocksSight: () => true, view: { TankMuzzle: () => ({}), tankCollider: null },
    tank: {}, ...extra };
  return { r, facts, said, moves };
}
{
  // A walker held 0.6 m off an intermediate corner (the old V / Ideal3 stalls): no progress for walkStallS -> skip it.
  const { r, moves } = WalkRuntime();
  const battle = new FirstLevelFrontBattle(r);
  const actor = { id: 7, missionId: "Relief1", alive: true, position: { x: 0.6, z: 0 }, scriptArrivalRadius: 1 };
  battle.SetWalk(actor, [{ x: 0, z: 0 }, { x: 0, z: -5 }, { x: 0, z: -10 }]);
  for (let t = 0; t < B.walkStallS - 0.5; t += 0.5) { r.time = t; battle.Walk(actor); }
  assert.equal(battle.walks.get(actor.id).index, 0, "under walkStallS without progress: still on the first corner");
  r.time = B.walkStallS + 0.1; battle.Walk(actor);
  assert.equal(battle.walks.get(actor.id).index, 1, "walkStallS without progress: the corner is skipped");
  assert.ok(battle.State().stalls.some((s) => s.id === "Relief1" && s.index === 0 && !s.final), "the skip is logged for probes");
  assert.deepEqual(moves.at(-1), { id: 7, x: 0, z: -5, speed: R.squadSpeedMps }, "and he walks on to the next point");
  // Real progress resets the clock.
  const b2 = new FirstLevelFrontBattle(r), mover = { id: 8, alive: true, position: { x: 0, z: 2 }, scriptArrivalRadius: 1 };
  b2.SetWalk(mover, [{ x: 0, z: -3 }, { x: 0, z: -10 }]);
  r.time = 0;
  for (let t = 0; t <= B.walkStallS * 2; t += 0.5) { r.time = t; mover.position.z -= 0.2; b2.Walk(mover); }
  assert.equal(b2.walks.get(mover.id).index, 1, "a man still closing in is never skipped (only the real arrival advanced him)");
  assert.equal(b2.stalls.length, 0, "no stall logged for a moving walker");
  // A final point: taken as reached within arrivalM x walkStallArrivalScale, never from further off.
  const b3 = new FirstLevelFrontBattle(r), near = { id: 9, alive: true, position: { x: B.arrivalM * 1.6, z: 0 }, scriptArrivalRadius: 1 };
  const far = { id: 10, alive: true, position: { x: B.arrivalM * 3, z: 0 }, scriptArrivalRadius: 1 };
  b3.SetWalk(near, [{ x: 0, z: 0 }]); b3.SetWalk(far, [{ x: 0, z: 0 }]);
  let nearDone = false, farDone = false;
  for (let t = 0; t <= B.walkStallS * 3; t += 0.5) { r.time = 100 + t; nearDone = b3.Walk(near) || nearDone; farDone = b3.Walk(far) || farDone; }
  assert.ok(nearDone && !farDone, "final point: 1.6 m off counts after the stall, 3 m off never does");
  checks += 7;
}
{
  // Relief: the gunner stuck on the leftRoute leg for 70 s (probe V) and one man killed on the way -> still in position.
  const { r, facts } = WalkRuntime({ flow: { stage: { id: "Tank" } }, tank: { brain: {}, fireDisabled: true },
    companion: { Handle: () => null }, emplacement: { NpcVacate() {}, NpcOccupy() {} } });
  const spawned = [];
  r.ai.Spawn = (side, x, z, opts) => { const a = { id: 600 + spawned.length, alive: true, position: { x, z }, opts, scriptArrivalRadius: 1 }; spawned.push(a); return a; };
  facts.set("tankFireDisabled", true);
  const battle = new FirstLevelFrontBattle(r);
  battle.UpdateRelief(0.1);
  const [nco, gunner, holder] = r.relief;
  // Everybody but the gunner is on his post; the gunner is held 0.8 m beside a corner of the access trench.
  for (const e of [nco, holder]) { const w = battle.walks.get(e.actor.id); w.index = w.route.length - 1; e.actor.position = { ...w.route.at(-1) }; }
  const gw = battle.walks.get(gunner.actor.id);
  gw.index = 6; gunner.actor.position = { x: gw.route[6].x + 0.8, z: gw.route[6].z };
  holder.actor.alive = false;
  let t = 0;
  for (; t < 60 && !facts.has("reliefInPosition"); t += 0.5) {
    r.time = t;
    battle.UpdateRelief(0.5);
    // The stuck man only moves once he has been sent past the corner: then he really walks to each point.
    const w = battle.walks.get(gunner.actor.id);
    if (w.index > 6 && w.index < w.route.length) gunner.actor.position = { ...w.route[w.index] };
  }
  assert.ok(facts.has("reliefInPosition"), `the stuck gunner is sent past the corner and the relief is in position (t ${t.toFixed(1)} s)`);
  assert.ok(t <= B.walkStallS + 3, `within one stall window, not never (${t} s)`);
  assert.ok(!holder.actor.alive, "... with one relief man dead on the way");
  checks += 3;
}
{
  // 04: Luo held beside the captured gun (the block between him and the seat) while the player waits at the rear junction.
  const luo = { id: 1, alive: true, position: { x: 23.29, z: -153.8 }, scriptArrivalRadius: 1 };
  const { r, facts, said } = WalkRuntime({ companion: { Handle: (who) => (who === "luo" ? luo : null) } });
  facts.set("tankPositionPressured", true);
  const battle = new FirstLevelFrontBattle(r);
  battle.UpdatePressure();
  assert.ok(Dist(battle.walks.get(luo.id).route[0], S.rearRoute[1]) < 0.01, "Luo's rear leg starts at the corner after the seat, not on the gun's seat");
  r.player.position = { ...S.rear };
  for (let t = 0; t < B.rearLeaderGraceS - 0.5; t += 0.5) { r.time = t; battle.UpdatePressure(); }
  assert.ok(!facts.has("rightRearReached"), "the player alone at the junction: Luo still gets rearLeaderGraceS to arrive");
  r.time = B.rearLeaderGraceS + 0.1; battle.UpdatePressure();
  assert.ok(facts.get("rightRearReached")?.leaderLate && said.includes("BundleOrder"), "after rearLeaderGraceS: rightRearReached (leaderLate) and the order");
  // The ideal order still records at once.
  const { r: r2, facts: f2 } = WalkRuntime({ companion: { Handle: () => ({ id: 1, alive: true, position: { ...S.rear } }) } });
  f2.set("tankPositionPressured", true); r2.player.position = { ...S.rear };
  new FirstLevelFrontBattle(r2).UpdatePressure();
  assert.ok(f2.has("rightRearReached") && f2.get("rightRearReached") === true, "both at the junction: recorded at once, no leaderLate");
  checks += 4;
}
{
  // Grenade veto: a protected waiting guard within guardGrenadeShieldM of the aim point.
  const guard = { alive: true, missionUntargetable: true, position: { x: -8, z: -155.2 } };
  const { r } = WalkRuntime();
  r.guards = [{ actor: guard }];
  const battle = new FirstLevelFrontBattle(r);
  assert.ok(battle.grenadeVeto({ side: "ija" }, -8 + B.guardGrenadeShieldM - 0.5, -155.2), "aim point inside the shield: vetoed");
  assert.ok(!battle.grenadeVeto({ side: "ija" }, -8 + B.guardGrenadeShieldM + 0.5, -155.2), "outside the shield: allowed");
  guard.missionUntargetable = false;
  assert.ok(!battle.grenadeVeto({ side: "ija" }, -8, -155.2), "a guard already in the safe zone (not protected) does not veto");
  assert.ok(B.guardGrenadeShieldM >= 6.5 + 2, "the shield covers the grenade's 6.5 m radius plus scatter");
  const tactics = Read("Script_AiTactics.mjs"), ai = Read("Script_Ai.mjs"), runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/this\.grenadeVeto && this\.grenadeVeto\(soldier, ex, ez\)\) return false/.test(tactics), "ShouldGrenade asks the veto at the lkp");
  assert.ok(ai.includes("this.tactics?.grenadeVeto?.(s, at.x, at.z)"), "TryGrenade asks it again at the real aim point");
  assert.ok(runtime.includes("this.ai.tactics.grenadeVeto=this.frontBattle.Active?this.frontBattle.grenadeVeto:null"),
    "the runtime installs it only while the front battle (03-05) is active");
  checks += 7;
  Ok("⑦ stall fallbacks: corner skip, relief with a stuck and a dead man, Luo late at the rear junction; grenade veto");
}
{
  // 04 checkpoint: the 03 facts carry zhouLeftGun; Opening respawns Zhou on the seat and the checkpoint puts He there too.
  const facts = new Map([["rifleWithdrawalResolved", true], ["leftGunHandover", true], ["zhouLeftGun", { distance: 10.2 }]]), placed = [];
  const he = { id: 3, alive: true, position: { ...S.leftSeat } };
  const yaowa = { id: 2, alive: true, position: { x: -25, z: -100 } };
  const zhou = { id: 54, alive: true, health: 80, position: { ...S.leftSeat } };
  const gun = { npc: zhou };
  const r = { opening: { zhou }, column: { zhou: {} }, squadRoutes: new Map(), time: 0,
    companion: { Handle: (who) => ({ heyoutian: he, yaowa })[who] },
    Has: (id) => facts.has(id), Record: (id, d) => { if (facts.has(id)) return false; facts.set(id, d ?? true); return true; },
    Defend() {}, OnPlayerDown() {}, Say() {}, PlaceActor: (a, p) => { a.position = { ...p }; placed.push(a.id); },
    emplacement: { guns: new Map([["Left", gun]]), NpcVacate: () => { gun.npc = null; }, NpcOccupy: (_, a) => { gun.npc = a; } },
    leftGunId: "Left", ai: { Remove() {} } };
  const battle = new FirstLevelFrontBattle(r);
  battle.Walk = () => false;
  battle.StartHandover(false);
  assert.deepEqual(battle.walks.get(he.id).route, [{ ...S.leftSeat }], "He already on the seat: no walk up the access trench and back");
  battle.UpdateZhou();
  assert.ok(Dist(zhou.position, S.leftSeat) >= B.zhouLeftGunM && Dist(zhou.position, S.zhouExit[2]) < 0.01,
    "Zhou starts past the 10 m line on zhouExit, not on the seat He was put on");
  assert.ok(battle.walks.has(zhou.id) && battle.walks.get(zhou.id).route.at(-1).x === P.collection.zhouWall.x, "... walking on to the collection wall");
  assert.ok(battle.walks.has(yaowa.id) && Dist(yaowa.position, zhou.position) < 2, "Yaowa escorts him from there");
  battle.UpdateHandover();
  assert.ok(gun.npc === he, "He takes the gun Zhou's checkpoint body left");
  checks += 5;
  Ok("⑦b 04 checkpoint: Zhou already off the gun, He on it, no shared spawn");
}
{
  // Close contact is anchored on the man's line, and after the capture its circle stops short of the captured gun.
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/const line=s\.points\[Math\.min\(s\.index,s\.points\.length-1\)\]\|\|actor\.position;\s*\n\s*if\(s\.mode!=="contact"\)this\.Defend\(actor,line,/.test(runtime),
    "contact re-anchors on the current line, not on where the man stands (no creeping contact by contact)");
  assert.ok(runtime.includes("Distance(line,Sortie.seat)-FB.capturedGunKeepOutM"), "after the capture the contact circle keeps capturedGunKeepOutM off the gun seat");
  // The east bounders' and the flank's last lines are 15-16 m from the seat: their circles end >= keep-out short of it.
  const seat = S.seat, lastF = { x: 16.8, z: -166.57 }, lastFlankA = { x: 39.2, z: -162.2 };
  for (const line of [lastF, lastFlankA]) assert.ok(Dist(line, seat) - B.capturedGunKeepOutM >= 2, "a last line leaves room for a >= 2 m contact circle");
  checks += 4;
}

// ---------------------------------------------------------------------------
// ⑧ 09-25 storyboard round: SB07 lead / trigger / backslope LMG pair, SB08 first-batch column
// ---------------------------------------------------------------------------
{
  // Budget (contract §6): the batches split the same eight men; the pair is two of the second batch, not extra men.
  assert.equal(R.guardCount, 8, "eight withdrawing guards, as before");
  assert.equal(B.firstBatch, 5, "SB08: the first batch is five men");
  const mg = FRONT_GUARD_MG_GROUP.members;
  assert.deepEqual(mg.map((m) => m.role), ["gunner", "assistant"]);
  for (const m of mg) assert.ok(m.guard >= B.firstBatch && m.guard < R.guardCount, "the LMG pair are second-batch guards");
  assert.ok(FACED_FRONT_GUARD_INDEX >= B.firstBatch && !FrontGuardMgMember(FACED_FRONT_GUARD_INDEX), "the faced guard is the second batch's first man, not one of the pair");
  // Every withdrawal route passes the last cover (the pair's route is spliced there, the column is measured from it);
  // a route without it throws instead of falling back (09-25 review).
  assert.throws(() => LastCoverIndex([{ x: 0, z: 0 }, { x: 1, z: 0 }], "probe route"), /lastCover/, "a route without the last cover is a data error");
  for (let i = 0; i < R.guardCount; i++) assert.ok(LastCoverIndex(P.guardWithdrawalRoutes[i]) >= 1, "guard " + i + "'s Layout route passes the last cover");
  checks += 2;
  for (let i = 0; i < R.guardCount; i++) {
    const { route, gatherIndex, mg: member } = GuardWithdrawalRoute(i), base = P.guardWithdrawalRoutes[i];
    const tail = (r) => r.slice(r.findIndex((p) => Dist(p, S.lastCover) < 0.01)).map((p) => [p.x, p.z]);
    assert.deepEqual(tail(route), tail(base), "guard " + i + " withdraws along his Layout route from the last cover on");
    if (!member) { assert.equal(route, base); assert.equal(gatherIndex, 1); continue; }
    assert.deepEqual(route[0], { x: member.x, z: member.z }, "the pair starts on its backslope spot");
    assert.equal(gatherIndex, FRONT_GUARD_MG_GROUP.exit.length);
    assert.ok(Dist(route[gatherIndex], { x: -6.3, z: -156.8 }) < 0.01, "... and gathers where the east posts do (behind the last-cover sandbags)");
    assert.ok(Dist(FRONT_GUARD_POSTS[i], route[0]) > 20, "the pair is not on its scrape post");
    const exit = RouteClearance(route.slice(0, gatherIndex + 2));
    assert.ok(!exit.hits.length && !exit.slopes.length, "the pair's way down into the scrape clears every block and slope: " + JSON.stringify(exit));
  }
  // The pair is on the upper backslope (only z <= -158.8 shows over the right low trench's lip) and its casualty is a body.
  for (const m of mg) assert.ok(m.z <= -158.8 && m.z > -160, m.role + " on the upper backslope, behind the crest");
  const wounded = MISSION_AFTERMATH.find((b) => b.id === "AftermathMgWounded");
  assert.ok(wounded && wounded.side === "nra" && wounded.blood >= 1.3, "the bloodied casualty lies beside them (battlefield body)");
  for (const b of MISSION_AFTERMATH) if (b !== wounded) for (const p of [...mg, FRONT_GUARD_MG_GROUP.wounded])
    assert.ok(Dist(b, p) >= FRONT_GUARD_MG_GROUP.bodyClearanceM, "no battlefield body under the pair: " + b.id);
  for (const p of FRONT_GUARD_MG_GROUP.fire) {
    const d = Dist(p, mg[0]), bearing = Math.atan2(p.x - mg[0].x, -(p.z - mg[0].z));
    assert.ok(d >= 8 && d <= 150 && Math.abs(bearing) <= 1.1, "fire point " + p.id + " in range and in front of the gunner");
    assert.ok(p.z < -160.3, "fire points are north of the crest (the enemy side)");
  }
  checks += 8 + R.guardCount * 2;
  Ok("⑧a batches 5+3, the LMG pair is two second-batch guards on the upper backslope, its casualty a body");
}
{
  // SB07 trigger: FrontApproach fires with the player at about (5,-143) walking in from the west (contract §2.11, ±0.6 m).
  const at = S.approach[B.frontApproachCallIndex], from = S.approach[B.frontApproachCallIndex - 1];
  let hit = null;
  for (let t = 0; t <= 1; t += 0.001) { const p = { x: from.x + (at.x - from.x) * t, z: from.z + (at.z - from.z) * t }; if (Dist(p, at) < B.frontApproachCallRadiusM) { hit = p; break; } }
  assert.ok(hit && Dist(hit, { x: 5, z: -143 }) <= 0.6, "FrontApproach fires near (5,-143): " + JSON.stringify(hit));
  // Lead pace: runs below catchUpM (faster than the player's sprint), keeps running to minM, walks, waits past maxM.
  const L = B.leaderLead, route = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 40, z: 0 }], st = {};
  assert.ok(L.runMps > 3.05 * 1.72, "Luo's run outpaces a sprinting player (5.25 m/s)");
  const Pace = (lx, px) => LeadPace(route, 1, { x: lx, z: 0 }, { x: px, z: 0 }, st);
  let p = Pace(11, 10); assert.ok(p.speed === L.runMps && !p.wait, "player within catchUpM: he runs");
  p = Pace(12.5, 10); assert.equal(p.speed, L.runMps, "... and keeps running until minM");
  p = Pace(13.2, 10); assert.ok(p.speed === R.squadSpeedMps && !p.wait, "3-5 m ahead: he walks");
  p = Pace(15.6, 10); assert.ok(p.wait, "more than maxM ahead: he waits");
  p = Pace(5, 10); assert.equal(p.speed, L.runMps, "behind the player: he runs to get in front");
  // Corner: a turn > cornerTurnDeg just passed -> hold and point along the next leg until the player is within minM.
  const bend = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: -10 }];
  assert.deepEqual(LeadCorner(bend, 2, { x: 10.2, z: -0.3 }), { x: 10, z: -10 }, "at a right-angle corner he points down the next leg");
  assert.equal(LeadCorner(route, 2, { x: 20, z: 0 }), null, "a straight run is no corner");
  const cs = {};
  let c = LeadPace(bend, 2, { x: 10, z: -0.2 }, { x: 6, z: 0 }, cs); assert.ok(c.wait && c.corner, "player 4 m back: he holds at the corner");
  c = LeadPace(bend, 2, { x: 10, z: -0.2 }, { x: 8, z: 0 }, cs); assert.ok(!c.wait, "player within minM: he goes on");
  // Pointing holds his aim and trigger for pointS (an aiming brain drops the upper-body clip: 09-25 SB07 shot) and
  // nothing else: target, tactical state and the scene flag stay as they were (09-25 review: scriptedNoncombatant
  // cleared his target and cover every frame and changed 03's outcome).
  assert.equal(L.pointHoldsFire, true, "Luo holds fire while he points");
  { const q = new FirstLevelFrontBattle({}), foe = { id: 9 }, man = { scriptedNoncombatant: false, target: foe, state: "fire", aimBlend: 1, coolUntil: -99 };
    q.PointQuiet(man, true, 10);
    assert.ok(man.aimBlend === 0 && man.coolUntil >= 10.1, "pointing: the rifle goes down and the trigger is held");
    assert.ok(man.scriptedNoncombatant === false && man.target === foe && man.state === "fire", "... and he keeps his target and his place in the fight");
    man.coolUntil = 30; q.PointQuiet(man, true, 11); assert.equal(man.coolUntil, 30, "a longer cool-down he already had is kept");
    q.PointQuiet(man, false); assert.equal(q.pointQuiet, null, "... the hold ends with the pointing");
    const held = { scriptedNoncombatant: true, aimBlend: 0 }; q.PointQuiet(held, true, 0); q.PointQuiet(held, false);
    assert.equal(held.scriptedNoncombatant, true, "a man already held by the scene stays held"); }
  // The Walk option drives MoveActor with that pace, and only in the lead stretch (before approach[endApproachIndex]).
  const moves = [], r = { time: 0, squadRoutes: new Map(), player: { position: { x: 0, z: -141.6 } }, guards: [], flow: { stage: { id: "Support" } },
    Has: () => false, Record() {}, Near: () => false, Say() {}, RespondToGrenade: () => false, Defend() {},
    MoveActor: (a, pt, speed) => moves.push(speed), ai: { ReleaseCover() {}, SetStance: (a, s) => stances.push(s), time: 0 }, leaderGuide: { Watch() {} } };
  const stances = [];
  const battle = new FirstLevelFrontBattle(r), luo = { id: 1, alive: true, position: { x: -3, z: -141.2 }, scriptArrivalRadius: 1 };
  battle.SetWalk(luo, S.approach.slice(7));
  battle.Walk(luo, { follow: true, lead: true }); assert.equal(moves.at(-1), L.runMps, "Luo behind the player at 03 runs past him");
  assert.equal(stances.at(-1), 1, "... crouched behind a crouched player (0.6 x runMps = 3.6 m/s beats the crouched 1.62)");
  r.player.stance = "stand"; battle.Walk(luo, { follow: true, lead: true });
  assert.equal(stances.at(-1), 0, "... upright behind a standing player (a crouched run would lose to his 5.25 m/s sprint)");
  r.player.stance = "crouch";
  luo.position = { x: 4, z: -142.1 }; battle.Walk(luo, { follow: true, lead: true }); assert.equal(moves.at(-1), R.squadSpeedMps, "4 m ahead: walks");
  luo.position = { x: 6.2, z: -142.9 }; battle.Walk(luo, { follow: true, lead: true }); assert.equal(moves.at(-1), 0, "6.4 m ahead: waits for the player");
  // SB07: through the FrontApproach pointing he walks on upright and slowly (legs keep walking, contract §5), and only
  // stops pointExtraM beyond maxM (09-25 review: the shot caught him squatting still at 5.01 m).
  battle.approachPointAt = 0; r.time = 0.5;
  luo.position = { x: 5.4, z: -142.6 }; battle.Walk(luo, { follow: true, lead: true });
  assert.ok(battle.lead.gap > L.maxM && battle.lead.gap < L.maxM + L.pointExtraM, "probe: just past maxM ahead " + battle.lead.gap);
  assert.ok(moves.at(-1) === L.pointWalkMps && stances.at(-1) === 0, "pointing just past maxM: he walks on, upright, at pointWalkMps");
  luo.position = { x: 4, z: -142.1 }; battle.Walk(luo, { follow: true, lead: true });
  assert.ok(moves.at(-1) === L.pointWalkMps && stances.at(-1) === 0, "pointing 4 m ahead: the same slow upright walk");
  luo.position = { x: 7.4, z: -143.4 }; battle.Walk(luo, { follow: true, lead: true });
  assert.equal(moves.at(-1), 0, "pointing, more than maxM + pointExtraM ahead: he stops");
  r.time = L.pointS + 0.1; luo.position = { x: 5.4, z: -142.6 }; battle.Walk(luo, { follow: true, lead: true });
  assert.ok(moves.at(-1) === 0 && stances.at(-1) === 1, "after pointS the lead rule is back (waits past maxM, crouched)");
  // A grenade dive: no stale lead or pointing (09-25 review: the corner he had reached kept pointing him through the dodge).
  r.time = 0.5; r.RespondToGrenade = () => true; battle.Walk(luo, { follow: true, lead: true });
  assert.ok(battle.lead === null && battle.leaderDodging === true, "diving from a grenade: not leading");
  r.RespondToGrenade = () => false; battle.approachPointAt = null; r.time = 0;
  // 5.8 m ahead but 6 m away: the lead rule would hold him, the old one (wait only beyond leaderWaitM) lets him walk.
  luo.position = { x: 21, z: -148.5 }; r.player.position = { x: 16, z: -146 };
  battle.walks.get(luo.id).index = 5; battle.Walk(luo, { follow: true, lead: true });
  assert.ok(battle.lead === null && moves.at(-1) === R.squadSpeedMps, "past the last bend before the west door the old follow rule is back");
  checks += 25;
  Ok("⑧b SB07: FrontApproach at (5,-143), Luo keeps 3-5 m ahead (runs, walks, waits, holds at corners, walks upright while he points)");
}
{
  // Backslope LMG pair: on the slope in 03 (ambient fire only), down the exit points into the scrape and the gather at 04.
  const facts = new Map(), moves = [], stances = [];
  const Actor = (i, p) => ({ id: 100 + i, missionId: "Guard" + i, alive: true, position: { ...p }, stance: 2, goal: { set() {} } });
  const guards = Array.from({ length: R.guardCount }, (_, i) => { const w = GuardWithdrawalRoute(i); return { actor: Actor(i, w.route[0]), progress: 0, safe: false, route: w.route, gatherIndex: w.gatherIndex, mg: w.mg }; });
  const r = { time: 0, guards, flow: { stage: { id: "Support" } }, player: { position: { x: 0, z: -141.6 } },
    Has: (id) => facts.has(id), Record: (id, d) => { if (!facts.has(id)) facts.set(id, d ?? true); }, Near: () => false,
    Defend: (a) => { a.scriptedNoncombatant = false; a.defended = true; }, MoveActor: (a, pt, speed) => moves.push({ id: a.id, x: pt.x, z: pt.z, speed }),
    ai: { time: 0, SetStance: (a, s) => stances.push({ id: a.id, s }) }, OnPlayerDown() {}, MissionFailure() {} };
  const battle = new FirstLevelFrontBattle(r);
  battle.InfantryBlockade = () => false; battle.TankBlockade = () => false;
  battle.UpdateGuards(1 / 60);
  const [gunner, assistant] = FRONT_GUARD_MG_GROUP.members.map((m) => guards[m.guard]);
  assert.ok(gunner.actor.scriptedNoncombatant && assistant.actor.scriptedNoncombatant, "03: the pair are scripted non-combatants (no real target, no hit)");
  assert.equal(gunner.actor.ambientFirePoints, FRONT_GUARD_MG_GROUP.fire, "the gunner fires at the authorised points only");
  assert.equal(assistant.actor.ambientFirePoints, null, "the assistant does not fire");
  assert.ok(!gunner.actor.defended && gunner.actor.missionUntargetable, "never handed to Defend (that clears the scripted flag); protected like every waiting guard");
  assert.ok(gunner.actor.scriptDefensive === false, "not scriptDefensive: the script-defense RELOAD would never finish for a scripted man (one magazine, then silence)");
  assert.ok(stances.some((e) => e.id === gunner.actor.id && e.s === 2), "prone");
  // 04: they leave the slope, walk the exit points, then gather at the last cover with the second batch.
  r.flow.stage.id = "MachineGun"; moves.length = 0;
  battle.UpdateGuards(1 / 60);
  assert.equal(gunner.actor.ambientFirePoints, null, "04: no more ambient fire");
  assert.ok(moves.some((m) => m.id === gunner.actor.id && Dist(m, FRONT_GUARD_MG_GROUP.exit[0]) < 0.01), "04: down the first exit point");
  for (let step = 0; step < 12 && !facts.has("remainingGuardsGathered"); step++) {
    moves.length = 0; battle.UpdateGuards(1 / 60);
    for (const m of moves) { const g = guards.find((e) => e.actor.id === m.id); if (m.speed > 0) g.actor.position = { x: m.x, z: m.z }; }
  }
  assert.ok(facts.has("remainingGuardsGathered"), "the second batch, the pair included, gathers at the last cover in 04");
  assert.equal(gunner.progress, gunner.gatherIndex, "the pair holds at its gather index (the crossing starts from there)");
  checks += 9;
  Ok("⑧c backslope LMG pair: ambient fire on the slope in 03, exit and gather with the second batch in 04");
}
{
  // SB08: the first batch crosses as one column, firstColumnSpacingM apart; a stuck man ahead is passed.
  const facts = new Map([["rightNestCaptured", true], ["frontRifleDefense", true]]), moves = [];
  const guards = Array.from({ length: R.guardCount }, (_, i) => { const w = GuardWithdrawalRoute(i);
    return { actor: { id: 100 + i, alive: true, position: { ...w.route[0] }, stance: 1, goal: { set() {} } }, progress: 0, safe: false, route: w.route, gatherIndex: w.gatherIndex, mg: w.mg }; });
  const r = { time: 0, guards, flow: { stage: { id: "Support" } }, player: { position: { x: 25.6, z: -155.2 } },
    Has: (id) => facts.has(id), Record: (id, d) => { if (!facts.has(id)) facts.set(id, d ?? true); }, Near: () => false,
    Defend() {}, MoveActor: (a, pt, speed) => moves.push({ id: a.id, speed }), ai: { time: 0, SetStance() {} }, OnPlayerDown() {}, MissionFailure() {} };
  const battle = new FirstLevelFrontBattle(r);
  battle.InfantryBlockade = () => false; battle.TankBlockade = () => false;
  const Moving = () => new Set(moves.filter((m) => m.speed > 0).map((m) => m.id));
  battle.UpdateGuards(1 / 60);
  const order = battle.firstColumn, head = order[0], second = order[1];
  assert.equal(order.length, B.firstBatch, "the column is the whole first batch");
  assert.ok(battle.ColumnAlong(head) >= battle.ColumnAlong(order.at(-1)), "nearest the last cover goes first");
  assert.deepEqual([...Moving()], [head.actor.id], "at release only the head of the column moves");
  // Put a man s metres along his own route from the last cover (negative: back along it, before the last cover).
  const Place = (g, s) => { const w = g.route, at = LastCoverIndex(w), dir = s < 0 ? -1 : 1; let left = Math.abs(s), i = at, p = { ...w[at] };
    while (left > 0 && i + dir >= 0 && i + dir < w.length) { const n = w[i + dir], d = Dist(p, n); if (d >= left) { p = { x: p.x + (n.x - p.x) * left / d, z: p.z + (n.z - p.z) * left / d }; left = 0; } else { left -= d; p = { ...n }; i += dir; } }
    g.actor.position = p; };
  const secondAlong = battle.ColumnAlong(second);
  // The head only firstColumnSpacingM - 0.8 ahead of the second man (both before the last cover): the second man waits.
  // (09-25 review: the old placement clamped the head to the last cover, 3.2 m ahead, and this assertion never ran.)
  r.time = 0.5; Place(head, secondAlong + B.firstColumnSpacingM - 0.8);
  assert.ok(Math.abs(battle.ColumnAlong(head) - secondAlong - (B.firstColumnSpacingM - 0.8)) < 0.05, "probe: head placed under firstColumnSpacingM ahead");
  moves.length = 0; battle.UpdateGuards(1 / 60);
  assert.ok(!Moving().has(second.actor.id), "the man behind waits while the head is under firstColumnSpacingM ahead");
  r.time = 1; Place(head, Math.max(0, secondAlong) + B.firstColumnSpacingM + 0.5);
  moves.length = 0; battle.UpdateGuards(1 / 60);
  assert.ok(Moving().has(second.actor.id), "firstColumnSpacingM ahead: the next man goes");
  // A crossing man closer than firstColumnMinM to the one ahead pauses (speed 0) instead of bunching up.
  Place(second, battle.ColumnAlong(head) - 0.5);
  moves.length = 0; battle.UpdateGuards(1 / 60);
  assert.ok(moves.some((m) => m.id === second.actor.id && m.speed === 0), "closer than firstColumnMinM: he pauses");
  // The head stops moving for firstColumnStallS: the man behind passes him.
  r.time += B.firstColumnStallS + 0.1; moves.length = 0; battle.UpdateGuards(1 / 60);
  assert.ok(Moving().has(second.actor.id), "a stuck man ahead is passed after firstColumnStallS");
  checks += 7;
  Ok("⑧d SB08: the first batch crosses as one column, firstColumnSpacingM apart, a stuck man is passed");
}
{
  // SB08 middle ground: no battlefield body in the sightline from the nest to the gap, short of the gap (09-25 review:
  // 13 bodies of the held line's east end lay across the strip the column crosses). The dead at the gap stay.
  const L = FRONT_SB08_SIGHTLINE;
  assert.ok(Dist(L.to, S.gap) < 0.01, "the sightline ends at the gap");
  assert.ok(Dist(L.from, { x: 25.6, z: -155.2 }) < 0.01, "... and starts north of the captured gun (contract §5 SB08)");
  const inCone = MISSION_AFTERMATH.filter((b) => InFrontSb08Sightline(b));
  assert.deepEqual(inCone.map((b) => b.id), [], "no body in the SB08 sightline");
  assert.ok(InFrontSb08Sightline({ x: 6, z: -154.5 }) && !InFrontSb08Sightline({ x: -10.4, z: -152.8 }) && !InFrontSb08Sightline({ x: 9.3, z: -158.9 }),
    "the cone covers the scrape's east end, not the dead at the gap or the LMG pair's casualty");
  assert.ok(MISSION_AFTERMATH.filter((b) => b.id.startsWith("Aftermath14_")).length === 4, "the 4 dead north-west of the gap are still there");
  assert.ok(MISSION_AFTERMATH.filter((b) => b.id.startsWith("Aftermath15_")).length >= 5, "the held line's east end keeps its dead outside the cone");
  checks += 6;
  Ok("⑧e SB08: the sightline from the nest to the gap is clear of battlefield bodies");
}

console.log(`FirstLevelFrontPacingTest 通过：${checks} 条断言`);
