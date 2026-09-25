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
//   ⑧ 近处说话人不在画面里：台词等他走进画面；太近就退开
//   ⑬ 罗班长的阵位掩体按 leaderCoverArrivalM 走到（1 m 外是西门门洞，被墙头挡住）；退开说完话再走回去
//   ⑭ 左机枪：枪在座位前 0.6 m、架在自己的沙袋枪托（LeftGunRest）上；何有田接枪后换上捷克式、站着、走回座位、
//      不被压趴、不当刺刀靶子，离枪时把汉阳造还给他（接力第二批 Front 第三步追加 A）
//   ⑫ 说话时队友挡在玩家和说话人之间：挡的人横跨一步让开，这句说完再放（ClearView）
//   ⑪ 05 攻击位：罗班长停在投弹点旁（leaderAttackSide），离投弹点与玩家进来的最后一段都 ≥1.4 m
//   ⑩ 攻击支路过 AttackRuinA 东端留 ≥0.6 m；墙南侧死角里的人按最近路点走、先离开墙面（TankProbe5 卡死点）
//   ⑨ 走路线的人（罗班长）在 FIRE 里被换位命令的 0.6 m 到位半径钉在路线拐点前 0.58 m（后门坡道）：Script_Ai.Act 用路线的半径
//      （只对 FrontBattle.Walk 打了 routeArrivalOwnsRadius 的人；别的剧本走路者照旧）
//   ⑮ 躲手榴弹之后：直线回不去（隔着枪托沙袋/院墙）就沿躲的路原路退回，已到位的人被挤开也会走回岗位
//   ⑯ 守位队友让路：玩家在 1.2 m 内朝他走（看方向键，不看被挡住的速度）→ 他横移让出玩家的路，玩家过去后走回原位
//      （西门：罗班长在门里掩体上挡路，Front fx16；集成负责人定方案 c）；07 以后不做
//   ⑫b 挡在玩家和近处说话人之间的普通守军（r.guards，不含正在过缺口的）/接防的人也让开；守军说完走回原处（验收 acc36：守军 50 挡住 FrontRelief.02）
//   ⑰ 说话人被躲手榴弹带离玩家身边的岗位、在 15 m 外看不见：这句等他走回看得见的地方（至多 speakerReturnHoldS），
//      岗位远的（左枪位）照旧隔空喊（验收空转探针第 2 趟：罗班长躲到巢外 15 m 墙后说 FrontWithdraw.01）
//   ⑱ 09-25 分镜还原（分镜会话原编号 ⑧）（docs/Data_FirstLevelStoryboard0103Contract.md §2.11–12，SB07/SB08）：罗班长 03 领路保持在玩家前
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
import vm from "node:vm";
import { COVER_CYCLE } from "./Data_Tuning_AiCover.mjs";
import { FirstLevelFrontBattle, ColumnDeparture, BatchPastGap, SplitRoute, GuardClearOfGap, GuardWithdrawalRoute, FrontGuardMgMember, LeadPace, LeadCorner, LastCoverIndex } from "./Script_FirstLevelFrontBattle.mjs";
import { FRONT_GUARD_MG_GROUP, FRONT_GUARD_POSTS, MISSION_AFTERMATH, FRONT_SB08_SIGHTLINE, InFrontSb08Sightline } from "./Data_FirstLevelMissionFront.mjs";
import { FACED_FRONT_GUARD_INDEX } from "./Data_FirstLevelSpeakingCast.mjs";
import { RouteClearance } from "./Script_FirstLevelSpaceProbe.mjs";
import { FirstLevelFrontScenes, FRONT_SCENE_IDS, FrontSceneSpeakers, ProjectToView, InPicture, CameraPose, StepCandidates, SegmentDistance, BodyBetween, AsideCandidates } from "./Script_FirstLevelFrontScenes.mjs";
import { DialoguePlayer } from "./Script_DialoguePlayer.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as Space, FRONT_TANK_PATH } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ROUTES as Routes, MISSION_PLACEMENT as P, MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
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
  // The player ran on ahead: Luo, still out on the branch, finishes the branch first (09-26 review tank probe rvtank: given
  // the next leg 13 m out on the branch, he walked into the ruins between and slid along a wall for 30 s).
  assert.ok(facts.has("attackRetreated") && battle.leg === "retreat", "the player at the rear junction, Luo still on the branch: he keeps coming back along it");
  luo.position = { ...S.rear };
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
  // Back at the rear junction with the batch already past the gap: the disengage leg goes in through the rear door, it
  // does not cut straight from the junction to the west door through the nest's rear wall.
  const r3 = { ...r, time: 0, voice: { played: new Set(), finished: new Set() }, squadRoutes: new Map() };
  luo.position = { ...S.rear };
  const b3 = new FirstLevelFrontBattle(r3); b3.gapWatched = true; b3.UpdateSortie();
  const inDoor = b3.walks.get(luo.id).route;
  assert.ok(b3.leg === "disengage" && inDoor.some((p) => Dist(p, Space.rearDoor) < 0.3) && Dist(inDoor[0], S.rear) < 0.5,
    "from the rear junction the disengage leg starts there and goes through the rear door");
  checks += 15;
  Ok("② 05 bomb-first + parallel withdrawal: skipped attack position, Luo finishes the branch, west-door watch, returnMeet, home");
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
  // 09-25 relay r2 Front step 3: a man who reached his last point mid-evade kept missionGrenadeEvade for good (the
  // grenade check sat below the arrival return) and lay prone in his cover through three lines. The walk now lets
  // RespondToGrenade (the runtime's, which drops the flag once no live grenade is near) see him every frame.
  let live = false, asked = 0;
  const { r } = WalkRuntime({ RespondToGrenade: (a) => { asked++; if (!live) { a.missionGrenadeEvade = false; return false; } a.missionGrenadeEvade = true; return true; } });
  const battle = new FirstLevelFrontBattle(r);
  const luo = { id: 11, alive: true, position: { x: 0, z: 0 }, scriptArrivalRadius: 1, missionGrenadeEvade: true };
  battle.SetWalk(luo, [{ x: 0, z: 0 }]);
  assert.equal(battle.Walk(luo), true, "no grenade left: he is at his post");
  assert.equal(luo.missionGrenadeEvade, false, "and the stale evade flag is gone");
  live = true;
  assert.equal(battle.Walk(luo), false, "a live grenade at his post: he evades, not 'arrived'");
  assert.ok(asked >= 2, "the grenade check runs at the post too");
  checks += 4;
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
// ⑧ the speaker is in the picture when he talks (relay r2 Front step 1): a near speaker out of view holds his line
//    (at most speakerViewHoldS) and steps to a spot the player sees; far shouts and Node runs play at once
// ---------------------------------------------------------------------------
{
  // A camera at (0, 1.6, 0) looking down -z (three's default facing), 55 deg vertical field of view, 16:9.
  const fov = 55 * Math.PI / 180, aspect = 16 / 9, near = 0.05, far = 500, f = 1 / Math.tan(fov / 2);
  const Camera = (x = 0, y = 1.6, z = 0) => ({
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1] },
    matrixWorldInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1] },
    projectionMatrix: { elements: [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0] },
  });
  const camera = Camera();
  const ahead = ProjectToView(camera, { x: 0, y: 1.6, z: -3 });
  assert.ok(Math.abs(ahead.x) < 1e-9 && Math.abs(ahead.y) < 1e-9 && Math.abs(ahead.depth - 3) < 1e-9, "a head straight ahead is the centre of the picture");
  assert.equal(ProjectToView(camera, { x: 0, y: 1.6, z: 3 }), null, "a head behind the camera is not in the picture");
  assert.ok(!InPicture(ProjectToView(camera, { x: 3, y: 1.6, z: -1 })) && InPicture(ProjectToView(camera, { x: 1, y: 1.6, z: -3 })),
    "72 deg off the axis is out of the frame, 18 deg is in");
  const pose = CameraPose(camera);
  assert.ok(Math.abs(Math.abs(pose.yaw) - Math.PI) < 1e-9, "the pose yaw is the facing (-z here)");
  const spots = StepCandidates(pose, { x: -1, z: 1 });
  assert.equal(spots.length, B.speakerStepBearingsDeg.length * B.speakerStepDistancesM.length * 2, "every bearing x distance, both sides");
  assert.ok(spots[0].bearing > 0 === Math.sin(Math.atan2(-1, 1) - pose.yaw) > 0, "the speaker's own side first");
  for (const s of spots) assert.ok(InPicture(ProjectToView(camera, { x: s.x, y: 1.55, z: s.z })), `a stepping spot frames a standing head (${s.bearing} deg, ${s.distance} m)`);

  // HoldLine / Steer on a stub runtime: flat ground, nothing blocks, Luo 1.6 m to the player's right, level with him.
  const moves = [], defends = [];
  const luo = { id: 7, alive: true, position: { x: 1.6, y: 0, z: 0.3 } };
  const guard = { id: 8, alive: true, position: { x: -30, y: 0, z: -20 } };
  const V = (x, y, z) => ({ x, y, z, clone() { return V(this.x, this.y, this.z); }, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
  const r = { time: 0, camera, flow: { stage: { id: "Support" } }, ai: { soldiers: [luo, guard] },
    player: { position: { x: 0, y: 0, z: 0 }, get EyePosition() { return V(0, 1.6, 0); } },
    speakers: { ActorForWho: (who) => ({ luo, guard })[who] || null },
    Point: (p, rise = 0) => V(p.x, rise, p.z), BlocksSight: () => false,
    MoveActor: (actor, point, speed) => moves.push({ id: actor.id, ...point, speed }), Defend: (actor, point) => defends.push({ id: actor.id, ...point }) };
  const scenes = new FirstLevelFrontScenes(r);
  const line = (id, who) => ({ id, who, direction: {} });
  assert.equal(scenes.HoldLine(line("TakeOverGun.01", "luo"), "TakeOverGun"), true, "Luo beside the player, out of the picture: the line waits");
  assert.ok(scenes.steer?.soldier === luo && Dist(scenes.steer.spot, luo.position) <= B.speakerStepMaxM, "and Luo is sent to a spot in view");
  const spot = scenes.steer.spot;
  assert.ok(InPicture(ProjectToView(camera, { x: spot.x, y: 1.55, z: spot.z })), "the spot is in the picture");
  scenes.handle = { id: "TakeOverGun", done: false, lines: [{ line: { who: "luo" }, state: "pending" }] };
  scenes.Steer();
  assert.ok(moves.length === 1 && moves[0].id === 7 && moves[0].speed === B.speakerStepSpeedMps, "Steer walks him there (no teleport)");
  assert.ok(scenes.Steers(luo) && !scenes.Steers(guard), "FrontBattle.Walk is told to leave him alone meanwhile");
  r.time = B.speakerViewHoldS * 0.5;
  assert.equal(scenes.HoldLine(line("TakeOverGun.01", "luo"), "TakeOverGun"), true, "still out of view: still waiting");
  luo.position = { x: spot.x, y: 0, z: spot.z };
  assert.equal(scenes.HoldLine(line("TakeOverGun.01", "luo"), "TakeOverGun"), false, "in view: the line starts");
  assert.equal(scenes.holds.get("TakeOverGun.01").released, "inView");
  scenes.Steer();
  assert.ok(defends.length === 1, "at the spot he holds there while his lines last");
  scenes.handle.lines[0].state = "done"; scenes.Steer();
  assert.equal(scenes.steer, null, "his lines done: his own orders take over again");
  // No spot he can walk to straight (every knee-high line blocked): he stays and the line plays at once.
  luo.position = { x: 1.6, y: 0, z: 0.3 }; r.BlocksSight = (a, b) => b.y < 1; r.time = 10;
  assert.equal(scenes.HoldLine(line("TakeOverGun.03", "luo"), "TakeOverGun"), false, "no clear spot: the line is not delayed");
  assert.ok(scenes.steer === null && scenes.holds.get("TakeOverGun.03").released === "noSpot", "and he stays where he is");
  // A spot whose low wall hides a crouched head but not a standing one is no spot (09-25 idle probe e2: the combat brain
  // crouched Luo in the nest's west doorway and the door's wall hid him through FrontWithdraw.01).
  r.BlocksSight = (a, b) => a.y > 1.5 && b.y > 0.8 && b.y < 1.3;
  assert.equal(scenes.StepSpot(luo, CameraPose(camera)), null, "a crouched head behind a wall: not a stepping spot");
  r.BlocksSight = (a, b) => a.y > 1.5 && b.y > 1.3;
  assert.equal(scenes.StepSpot(luo, CameraPose(camera)), null, "nor a standing head behind one");
  r.BlocksSight = () => false;
  assert.ok(scenes.StepSpot(luo, CameraPose(camera)), "open ground: a spot");
  // Level with the player but a metre above the speaker's own floor (c36_d2: up the bank beside the 05 attack position):
  // he cannot walk there, so it is no spot.
  const flatPoint = r.Point;
  r.Point = (p, rise = 0) => V(p.x, (Math.hypot(p.x - luo.position.x, p.z - luo.position.z) < 0.5 ? -1 : 0) + rise, p.z);
  assert.equal(scenes.StepSpot(luo, CameraPose(camera)), null, "a spot a metre above the speaker's floor: not a stepping spot");
  r.Point = flatPoint;
  // Stepping into the picture while his line already plays, and the player stands within speakerViewMinM of him (he never
  // reached the spot): he backs off instead of being held there at the player's elbow.
  {
    const saved = { position: luo.position, handle: scenes.handle, steer: scenes.steer };
    const unreachable = { x: -2.5, z: -3 };
    luo.position = { x: 0.6, y: 0, z: -0.6 };
    scenes.handle = { id: "TakeOverGun", done: false, lines: [{ line: { who: "luo" }, state: "playing" }] };
    scenes.steer = { soldier: luo, who: "luo", spot: unreachable, sceneId: "TakeOverGun", anchor: { x: 0, z: 0 } };
    scenes.Steer();
    assert.ok(scenes.steer?.backOff && Dist(scenes.steer.spot, unreachable) > 0.5, "too near while talking: he backs off instead");
    assert.ok(Dist(scenes.steer.spot, r.player.position) >= Math.min(...B.speakerBackOffDistancesM) - 1e-6, "to a back-off distance from the player");
    scenes.steer = { soldier: luo, who: "luo", spot: unreachable, sceneId: "TakeOverGun", anchor: { x: 0, z: 0 } };
    scenes.handle.lines[0].state = "pending";
    scenes.Steer();
    assert.ok(!scenes.steer?.backOff && Dist(scenes.steer.spot, unreachable) < 1e-9, "still held for his line: he keeps walking to the framed spot");
    Object.assign(scenes, { handle: saved.handle, steer: saved.steer }); luo.position = saved.position;
  }
  // 09-26 c16_a1: the player moved into the rest of the walk after the spot was picked (dodged a grenade, went back to the
  // captured gun) - the step is given up and his own orders take over; a walk that stays clear of the player goes on.
  {
    const saved = { position: luo.position, handle: scenes.handle, steer: scenes.steer };
    luo.position = { x: 3, y: 0, z: 0 };
    scenes.handle = { id: "FrontAttack", done: false, lines: [{ line: { who: "luo" }, state: "playing" }] };
    scenes.steer = { soldier: luo, who: "luo", spot: { x: -2, z: 0 }, sceneId: "FrontAttack", anchor: { x: 0, z: 0 } };
    scenes.Steer();
    assert.equal(scenes.steer, null, "the rest of the walk runs through the player: the step is given up");
    assert.equal(scenes.State().dropped.at(-1)?.who, "luo", "and logged for probes");
    scenes.steer = { soldier: luo, who: "luo", spot: { x: 3, z: -3 }, sceneId: "FrontAttack", anchor: { x: 0, z: 0 } };
    scenes.Steer();
    assert.ok(scenes.steer?.soldier === luo && !scenes.steer.backOff, "a walk that keeps clear of the player goes on");
    Object.assign(scenes, { handle: saved.handle, steer: saved.steer }); luo.position = saved.position;
  }
  // Nor a spot at, or a walk past, the seat of a gun he does not man (c16_a1: 1.5 m east of the captured gun's seat,
  // where the player sat down again). His own gun's seat does not count.
  {
    const first = scenes.StepSpot(luo, CameraPose(camera));
    r.emplacement = { guns: new Map([["Captured", { seat: { x: first.x, y: 0, z: first.z }, npc: null }]]) };
    // Every framed spot on his side lies within 1.5 m of this one: none is left (the line then plays from where he is).
    const other = scenes.StepSpot(luo, CameraPose(camera));
    assert.ok(!other || Dist(other, first) >= B.speakerStepPassM - 1e-9, `a gun seat keeps the stepping spot ${B.speakerStepPassM} m off (${JSON.stringify(other)})`);
    r.emplacement.guns.get("Captured").seat = { x: first.x, y: 0, z: first.z + 10 };
    assert.ok(Dist(scenes.StepSpot(luo, CameraPose(camera)), first) < 1e-9, "a seat 10 m off changes nothing");
    r.emplacement.guns.get("Captured").seat = { x: first.x, y: 0, z: first.z };
    r.emplacement.guns.get("Captured").npc = luo;
    assert.ok(Dist(scenes.StepSpot(luo, CameraPose(camera)), first) < 1e-9, "the seat of his own gun does not count");
    delete r.emplacement;
  }
  // StandToBeSeen (c36_g3): a kneeling speaker in the picture, 3 m off, his crouched head behind something low, stands
  // up for his line when a standing head would be seen; held until that line ends; not when the wall is taller.
  {
    const kneel = { id: 12, alive: true, stance: 1, position: { x: 0.5, y: 0, z: -3 },
      actor: { head: { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 1.0, -3, 1] } } } };
    const stances = [];
    const rs = { time: 0, camera, flow: { stage: { id: "Support" } }, ai: { soldiers: [kneel], SetStance: (a, st) => stances.push([a.id, st]) },
      player: { position: { x: 0, y: 0, z: 0 }, get EyePosition() { return V(0, 1.6, 0); } },
      speakers: { ActorForWho: (who) => (who === "luo" ? kneel : null) },
      Point: (p, rise = 0) => V(p.x, rise, p.z), BlocksSight: (a, b) => b.y < 1.3, MoveActor() {}, Defend() {} };
    const sc = new FirstLevelFrontScenes(rs);
    sc.handle = { id: "TakeOverGun", done: false, lines: [{ line: { id: "TakeOverGun.01", who: "luo" }, state: "playing" }] };
    sc.Steer();
    assert.ok(sc.standing?.lineId === "TakeOverGun.01" && stances.at(-1)?.[1] === 0, "crouched head behind a low wall: he stands up for his line");
    kneel.stance = 0; sc.Steer();
    assert.equal(stances.length, 2, "and is held standing while the line plays");
    sc.handle.lines[0].state = "done"; sc.Steer();
    assert.equal(sc.standing, null, "the line over: the combat brain has him back");
    kneel.stance = 1; sc.handle.lines[0].state = "playing"; rs.BlocksSight = () => true; sc.Steer();
    assert.ok(sc.standing === null && stances.length === 2, "a wall that hides him standing too: he stays down");
    assert.deepEqual(sc.State().stood.map((s) => s.id), ["TakeOverGun.01"], "each stand is logged for probes");
  }
  // Timeout: a spot, but he never gets there (shoved, blocked by a body) -> the line plays after speakerViewHoldS.
  r.BlocksSight = () => false;
  assert.equal(scenes.HoldLine(line("FrontWithdraw.01", "luo"), "FrontWithdraw"), true, "held while he walks");
  r.time = 10 + B.speakerViewHoldS + 0.01;
  assert.equal(scenes.HoldLine(line("FrontWithdraw.01", "luo"), "FrontWithdraw"), false, "after speakerViewHoldS the line plays anyway");
  assert.equal(scenes.holds.get("FrontWithdraw.01").released, "timeout");
  scenes.steer = null;
  assert.equal(scenes.HoldLine(line("BundleOrder.01", "guard"), "BundleOrder"), false, "a shout from 36 m plays at once");
  assert.equal(scenes.HoldLine(line("FrontAttack.01", "shunzi"), "FrontAttack"), false, "Shunzi (the player) is never held");
  // Walking together the leader is not stopped at a spot (he would lose the lead) and the line is not delayed.
  r.BlocksSight = () => false; r.time = 20; r.player.velocity = { x: 2, y: 0, z: 0 };
  assert.equal(scenes.HoldLine(line("FrontBlockade.02", "luo"), "FrontBlockade"), false, "walking: the line plays at once");
  assert.ok(scenes.steer === null && scenes.holds.get("FrontBlockade.02").released === "walking", "walking: the leader keeps his own walk");
  r.player.velocity = { x: 0, y: 0, z: 0 };
  assert.equal(scenes.HoldLine(line("FrontBlockade.03", "luo"), "FrontBlockade"), true, "standing: the next line waits");
  assert.ok(scenes.steer?.soldier === luo, "standing: now he steps up");
  scenes.handle = { id: "FrontBlockade", done: false, lines: [{ line: { who: "luo" }, state: "pending" }] };
  r.player.position = { x: 0, y: 0, z: -(B.speakerStepReleaseM + 0.1) };
  scenes.Steer();
  assert.equal(scenes.steer, null, "the player walked off: the speaker goes back to his own orders");
  r.player.position = { x: 0, y: 0, z: 0 };
  // In the middle of the picture but closer than speakerViewMinM (the camera in his shoulder): he steps back first.
  luo.position = { x: 0, y: 0, z: -(B.speakerViewMinM - 0.4) }; r.time = 30;
  assert.equal(scenes.HoldLine(line("BundleSupply.02", "luo"), "BundleSupply"), true, "too close to be seen talking: the line waits");
  assert.ok(scenes.steer?.soldier === luo && Math.hypot(scenes.steer.spot.x, scenes.steer.spot.z) >= Math.min(...B.speakerStepDistancesM) - 1e-9,
    "and he steps back to a framed distance");
  scenes.steer = null;
  // Right behind the player every way into the picture brushes past his shoulder: no step, the line plays at once.
  luo.position = { x: 0.2, y: 0, z: 1.6 }; r.time = 40;
  assert.equal(scenes.HoldLine(line("TakeOverGun.02", "luo"), "TakeOverGun"), false, "behind him: no walk past the player");
  assert.equal(scenes.holds.get("TakeOverGun.02").released, "noSpot");
  // Aiming down the sights: nobody walks into his picture.
  luo.position = { x: 1.6, y: 0, z: 0.3 }; r.player.ads = 1;
  assert.equal(scenes.HoldLine(line("BundleAttack.01", "luo"), "BundleAttack"), false, "aiming: the line plays at once");
  assert.equal(scenes.holds.get("BundleAttack.01").released, "aiming");
  r.player.ads = 0;
  // Going to a gun no squadmate mans (c16_a1 / c16_d1: the captured nest's seat): nobody steps into that gun position.
  r.emplacement = { guns: new Map([["Captured", { seat: { x: -0.5, y: 0, z: 0.8 }, npc: null }]]) }; r.time = 45;
  assert.equal(scenes.HoldLine(line("GunSeat.01", "luo"), "GunSeat"), false, "at a free gun: the line plays at once");
  assert.ok(scenes.steer === null && scenes.holds.get("GunSeat.01").released === "gun", "and nobody steps into the gun position");
  r.emplacement.guns.get("Captured").npc = guard;
  assert.equal(scenes.HoldLine(line("GunSeat.02", "luo"), "GunSeat"), true, "a gun a squadmate mans is not the player's: he steps up");
  scenes.steer = null; delete r.emplacement;
  // Luo at the heels of a walking player: the line plays at once and he steps back from the player at a walk.
  luo.position = { x: 0.3, y: 0, z: 0.6 }; r.player.velocity = { x: 0, y: 0, z: -2 }; r.time = 50; moves.length = 0;
  assert.equal(scenes.HoldLine(line("FrontApproach.01", "luo"), "FrontApproach"), false, "walking with Luo at his heels: the line is not delayed");
  const back = scenes.steer, heel = Dist(luo.position, r.player.position);
  assert.ok(back?.soldier === luo && back.backOff && scenes.holds.get("FrontApproach.01").backedOff, "but Luo steps back from him");
  assert.ok(Dist(back.spot, r.player.position) >= Math.min(...B.speakerBackOffDistancesM) - 1e-9 && Dist(back.spot, r.player.position) > heel,
    "to a spot outside speakerViewMinM, away from the player");
  assert.ok(SegmentDistance(r.player.position, luo.position, back.spot) >= heel - 0.05, "never passing nearer the player on the way");
  assert.equal(back.lineId, "FrontApproach.01", "the step back belongs to the line it was for");
  scenes.handle = { id: "FrontApproach", done: false, lines: [{ line: { id: "FrontApproach.01", who: "luo" }, state: "playing" },
    { line: { id: "FrontApproach.03", who: "luo" }, state: "waiting" }] };
  r.player.position = { x: 0, y: 0, z: -(B.speakerStepReleaseM + 1) }; scenes.Steer();
  assert.ok(scenes.steer === back && moves.at(-1)?.speed === B.speakerBackOffSpeedMps, "at a walk, and the player walking on does not cancel it");
  // His next line while he is still stepping back (09-26 review: held the full speakerViewHoldS with nobody walking in).
  r.player.velocity = { x: 0, y: 0, z: 0 }; r.time = 51; const farBehind = { ...r.player.position };
  r.player.position = { x: luo.position.x, y: 0, z: luo.position.z - 3 };
  assert.equal(scenes.HoldLine(line("FrontApproach.03", "luo"), "FrontApproach"), false, "his next line is not held while he steps back");
  assert.equal(scenes.holds.get("FrontApproach.03").released, "backOff");
  r.player.position = farBehind; r.player.velocity = { x: 0, y: 0, z: -2 };
  scenes.handle.lines[0].state = "done"; scenes.Steer();
  assert.equal(scenes.steer, null, "the line it was for done: back to his own walk (his other lines do not pin him)");
  // No spot found: not searched again within speakerBackOffRetryS (BackOffSpot is 21 candidates with collider tests).
  {
    let searches = 0; const Spot = scenes.BackOffSpot; scenes.BackOffSpot = () => { searches++; return null; };
    r.time = 52; scenes.RetryBackOffSpot(luo); r.time = 52 + B.speakerBackOffRetryS / 2; scenes.RetryBackOffSpot(luo);
    const within = searches; r.time = 52 + B.speakerBackOffRetryS + 0.01; scenes.RetryBackOffSpot(luo);
    assert.ok(within === 1 && searches === 2, `a failed back-off search waits speakerBackOffRetryS (${within}, ${searches})`);
    scenes.BackOffSpot = Spot; scenes.backOffMiss.clear();
  }
  // Nowhere to step back to (every knee-high line blocked): he stays and the line still plays.
  r.player.position = { x: 0, y: 0, z: 0 }; luo.position = { x: 0.3, y: 0, z: 0.6 }; r.BlocksSight = (a, b) => b.y < 1;
  assert.equal(scenes.HoldLine(line("FrontApproach.02", "luo"), "FrontApproach"), false, "blocked: the line is not delayed");
  assert.ok(scenes.steer === null && !scenes.holds.get("FrontApproach.02").backedOff, "and he stays");
  r.BlocksSight = () => false;
  // Luo right in front of a walking player: not further along his way (he would walk into him again) but aside.
  luo.position = { x: 0.2, y: 0, z: -0.7 }; r.time = 60;
  assert.equal(scenes.HoldLine(line("BundleGo.02", "luo"), "BundleGo"), false, "walking into Luo: the line is not delayed");
  const aside = scenes.steer?.spot;
  assert.ok(aside && Math.acos(-(aside.z) / Math.hypot(aside.x, aside.z)) > B.speakerBackOffAheadDeg * Math.PI / 180 - 1e-9,
    "and Luo steps aside, not ahead of the player's walk");
  // KeepSpace: a line already playing, and the speaker comes too near meanwhile -> he steps back.
  scenes.steer = null; r.player.velocity = { x: 0, y: 0, z: 0 }; luo.position = { x: 0.4, y: 0, z: 0.5 };
  scenes.handle = { id: "BundleProne", done: false, lines: [{ line: { id: "BundleProne.01", who: "luo", direction: {} }, state: "playing" }] };
  scenes.Steer();
  assert.ok(scenes.steer?.soldier === luo && scenes.steer.backOff, "a speaker who came within speakerViewMinM mid-line steps back");
  scenes.handle.lines[0].state = "done"; scenes.Steer(); scenes.handle = null;
  assert.ok(SegmentDistance({ x: 0, z: 0 }, { x: -1, z: 1 }, { x: 1, z: 1 }) === 1 && SegmentDistance({ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }) === 2,
    "segment distance");
  // A live Japanese grenade has the player in its blast (the HUD's warning): the line waits while he gets clear, at
  // most speakerDangerHoldS, and the wait for the speaker's face starts only then (relay r2 Front step 3 addendum B:
  // FrontWithdraw.01 went by while the player ran from a grenade, 0 frames of Luo in the picture).
  let threats = [{ owner: "ija", fuse: 3 }];
  r.combat = { GrenadeThreats: () => threats };
  r.time = 70; luo.position = { x: 0, y: 0, z: -3 }; r.player.velocity = { x: 3, y: 0, z: 0 };
  assert.equal(scenes.HoldLine(line("FrontWithdraw.02", "luo"), "FrontWithdraw"), true, "a grenade at his feet: the line waits, even with Luo in view");
  r.time = 72;
  assert.equal(scenes.HoldLine(line("FrontWithdraw.02", "luo"), "FrontWithdraw"), true, "2 s on, still inside the blast: still waiting");
  threats = [{ owner: "player", fuse: 2 }];
  r.player.velocity = { x: 0, y: 0, z: 0 };
  assert.equal(scenes.HoldLine(line("FrontWithdraw.02", "luo"), "FrontWithdraw"), false, "clear of it (his own grenade does not count): Luo in view, the line starts");
  assert.ok(scenes.holds.get("FrontWithdraw.02").dangerS === 2 && scenes.holds.get("FrontWithdraw.02").released === "inView", "the hold records the 2 s dodge");
  threats = [{ owner: "ija", fuse: 4 }]; r.time = 80;
  assert.equal(scenes.HoldLine(line("FrontWithdraw.03", "luo"), "FrontWithdraw"), true, "another grenade: the next line waits");
  r.time = 80 + B.speakerDangerHoldS + 0.01;
  assert.equal(scenes.HoldLine(line("FrontWithdraw.03", "luo"), "FrontWithdraw"), false, "never clear of it: after speakerDangerHoldS the line plays anyway");
  threats = []; delete r.combat;
  r.camera = null;
  assert.equal(scenes.HoldLine(line("TakeOverGun.02", "luo"), "TakeOverGun"), false, "no camera (Node runs): nothing is held");

  // The dialogue player's hook: a held line starts late, and the next "after prev" line follows its real end.
  const events = [];
  const player = new DialoguePlayer({ Event: (id, scene, detail) => events.push({ id, ...detail }) });
  let held = 30;
  const scene = { id: "T", lines: [
    { id: "T.01", who: "luo", index: 0, duration: 1, direction: {}, speaker: "", text: "" },
    { id: "T.02", who: "zhou", index: 1, duration: 1, direction: { after: "prev", offsetS: 0.2 }, speaker: "", text: "" }] };
  const handle = player.Play(scene, { hold: (l) => l.id === "T.01" && held-- > 0 });
  for (let i = 0; i < 400 && !handle.done; i++) player.Update(1 / 60);
  const starts = events.filter((e) => e.id === "Line");
  assert.ok(handle.done && starts.length === 2, "both lines play");
  assert.ok(starts[0].start >= 30 / 60 - 1e-9, `the held line starts when released (${starts[0].start})`);
  // One frame of slack: a line's clock already advances in the frame it starts (the player's own timing, held or not).
  assert.ok(starts[1].start >= starts[0].start + 1 + 0.2 - 1 / 60 - 1e-6, `the next line keeps its gap after the held one (${starts[1].start})`);
  // Wiring: PlayScene passes the hook, the runtime steers after every mover, FrontBattle.Walk yields.
  const voiceSrc = Read("Script_FirstLevelMissionVoice.mjs"), runtimeSrc = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/speakers, gate, hold, priority,/.test(voiceSrc), "voice.PlayScene hands `hold` to the dialogue player");
  assert.ok(/this\.frontBattle\.Update\(dt\);\s*\n(\s*\/\/[^\n]*\n)*\s*this\.frontScenes\.Steer\(\);/.test(runtimeSrc), "runtime steers the speaker after frontBattle.Update");
  assert.ok(Read("Script_FirstLevelFrontBattle.mjs").includes("if(r.frontScenes?.Steers?.(actor)){w.bestAt=r.time;return false;}"),
    "FrontBattle.Walk neither orders nor stall-skips a speaker stepping into view");
  // 05 ammo house: Luo's supply leg stops beside the door, clear of every sight line from the approach inside
  // supplierRangeM to the keeper (he stood in the doorway and hid the keeper's whole line, 09-25 drive).
  assert.ok(Dist(S.leaderDoorSide, S.route.at(-1)) > 1, "Luo does not stop at the doorway point");
  for (let i = 1; i < S.route.length; i++) for (let k = 0; k <= 10; k++) {
    const a = S.route[i - 1], b = S.route[i], p = { x: a.x + (b.x - a.x) * k / 10, z: a.z + (b.z - a.z) * k / 10 };
    if (Dist(p, S.house) > S.supplierRangeM) continue;
    assert.ok(SegmentDistance(S.leaderDoorSide, p, S.keeper) > 1, `Luo's door-side stop is off the sight line to the keeper from (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
  checks += 69;
  Ok("⑧ near speaker out of the picture: line held <= speakerViewHoldS, he steps into view; one too near steps back; far shouts and Node runs unaffected; a grenade at the player's feet holds a line <= speakerDangerHoldS");
}

{
  // ⑨ Route walker vs a combat state's arrival radius (2026-09-25 relay r2 Front step 2). FIRE's displace order sets
  // moveArriveM 0.6 m; Script_Ai.Act replaced the order with the route goal but kept that radius, so Luo stood 0.58 m
  // short of the 0.25 m rear-door corner (29.7,-145.6) until the displace timed out or Walk skipped the corner
  // (LuoRamp probe: 4 of 16 live 05->06 trials held 4-6 s at (29.7,-145.0) / (27.7,-149.1)). Runs the real Act block.
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "Script_Ai.mjs"), "utf8").replace(/\r/g, "");
  const block = source.slice(source.indexOf("    // P012 route followers"), source.indexOf("    let targetYaw = null;"));
  assert.ok(block.includes("this.StepBody"), "the Act movement block is where the test expects it");
  const Act = vm.runInNewContext(`(function(s,dt){let desired=s.goal,speed=2.6,stepped=false,wantedYaw=0;${block}return {stepped};})`,
    { Clamp01: (v) => Math.max(0, Math.min(1, v)), COVER_CYCLE });
  const Vec = () => ({ x: 0, y: 0, z: 0, copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; }, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  const Run = (guided, frontWalk = guided) => {
    const s = { p012Guided: guided, routeArrivalOwnsRadius: frontWalk, scriptMoveSpeedMps: guided ? R.squadSpeedMps : undefined, position: { x: 29.66, y: 0, z: -145.02 },
      goal: { x: 29.7, y: 0, z: -145.6 }, scriptArrivalRadius: B.arrivalM * .25 * .5, moveArriveM: 0.6, stance: 1,
      detourTime: 0, stuckTime: 0, rnd: () => .5 };
    const host = { ctx: { nav: null }, tmpD: Vec(), navOut: { x: 0, z: 0 }, time: 0, SetStance() {}, TryVault: () => false,
      StepBody(a, dx, dz) { a.position.x += dx; a.position.z += dz; } };
    for (let i = 0; i < 120; i++) Act.call(host, s, 1 / 60);
    return Math.hypot(s.position.x - s.goal.x, s.position.z - s.goal.z);
  };
  const walker = Run(true), ordinary = Run(false), otherScripted = Run(true, false);
  assert.ok(walker < B.arrivalM * .25, `a route walker reaches the 0.25 m corner through a 0.6 m displace radius (left ${walker.toFixed(3)} m)`);
  assert.ok(ordinary > .5, `an ordinary soldier still stops on his own order's 0.6 m radius (left ${ordinary.toFixed(3)} m)`);
  // Only FrontBattle.Walk's walkers (03-06, routeArrivalOwnsRadius): every other P012 mover keeps the old rule (09-26 review).
  assert.ok(otherScripted > .5, `another scripted mover (MissionRuntime.MoveActor 01-18, setpieces) keeps the order's radius (left ${otherScripted.toFixed(3)} m)`);
  const battleSrc = Read("Script_FirstLevelFrontBattle.mjs"), runtimeSrc = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/r\.MoveActor\(actor,w\.rejoin\|\|w\.route\[w\.index\],wait\?0:speed\);[\s\S]{0,300}actor\.routeArrivalOwnsRadius=true;/.test(battleSrc),
    "FrontBattle.Walk marks its walker after moving him");
  assert.ok(/MoveActor\(actor, point, speed = R\.squadSpeedMps\) \{[\s\S]{0,200}actor\.routeArrivalOwnsRadius = false;/.test(runtimeSrc),
    "MissionRuntime.MoveActor clears the mark for every other mover");
  checks += 6;
  Ok("⑨ a route walker in FIRE walks to his corner, not to the displace order's 0.6 m radius");
}

{
  // ⑩ The attack branch past AttackRuinA's east end (2026-09-25 relay r2 Front step 2, TankProbe5: stuck for good at
  // (41.67,-157.31) in the pocket south-west of the end, beside a warning-shell crater). The lane keeps >= 0.6 m off
  // the wall box, and from any spot in that pocket the nearest route point (what CampaignFrontBattle's retreat and a
  // rejoining walker aim at) is reached without the capsule crossing the wall box (0.34 m radius + 0.02 m skin).
  const wall = MISSION_LAYOUT.blocks.find((b) => b.id === "AttackRuinA");
  assert.ok(wall && !wall.ry, "AttackRuinA is an axis-aligned block");
  const box = { minX: wall.x - wall.w / 2, maxX: wall.x + wall.w / 2, minZ: wall.z - wall.d / 2, maxZ: wall.z + wall.d / 2 };
  const BoxDistance = (p) => Math.hypot(Math.max(box.minX - p.x, 0, p.x - box.maxX), Math.max(box.minZ - p.z, 0, p.z - box.maxZ));
  const SegmentClear = (a, b) => { let min = Infinity; for (let i = 0; i <= 200; i++) { const t = i / 200; min = Math.min(min, BoxDistance({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })); } return min; };
  const lane = S.attackRoute, laneClear = Math.min(...lane.slice(1).map((p, i) => SegmentClear(lane[i], p)));
  assert.ok(laneClear >= 0.6, `the attack branch clears AttackRuinA by >= 0.6 m (${laneClear.toFixed(2)} m)`);
  const retreat = [...lane].reverse();
  const Distance = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  for (const start of [{ x: 41.67, z: -157.31 }, { x: 41.0, z: -157.4 }, { x: 40.2, z: -157.3 }, { x: 41.5, z: -157.35 }, { x: 40.6, z: -157.6 }]) {
    const nearest = retreat.reduce((best, p) => Distance(p, start) < Distance(best, start) ? p : best, retreat[0]);
    // Leaving the face: the first 0.2 m of the walk must not get closer to the box than the start is.
    const dir = { x: nearest.x - start.x, z: nearest.z - start.z }, len = Math.hypot(dir.x, dir.z);
    const step = { x: start.x + dir.x / len * .2, z: start.z + dir.z / len * .2 };
    assert.ok(BoxDistance(step) >= BoxDistance(start) - 1e-6 && SegmentClear(start, nearest) >= Math.min(BoxDistance(start), .36) - 1e-6,
      `from the pocket (${start.x},${start.z}) the nearest route point (${nearest.x},${nearest.z}) leads away from AttackRuinA's south face`);
  }
  checks += 7;
  Ok("⑩ the attack branch clears AttackRuinA's east end and a walker in the pocket south of it walks away from the face");
}

{
  // ⑪ Luo stops beside the throw spot (S.leaderAttackSide), never on it and never on the player's way in: >= 1.4 m from
  // the throw spot and from the branch's last leg, so his BundleAttack lines show a face; inside rearArrivalM so
  // attackPositionReached still needs him there; on the trench floor (within 0.4 m of the throw spot's floor height, clear
  // of every block by his capsule).
  const side = S.leaderAttackSide, lane = S.attackRoute, d = Math.hypot(side.x - S.throw.x, side.z - S.throw.z);
  assert.ok(d >= 1.4 && d < B.rearArrivalM, `Luo's attack stop is ${d.toFixed(2)} m from the throw spot`);
  const a = lane.at(-2), b = lane.at(-1), t = Math.max(0, Math.min(1, ((side.x - a.x) * (b.x - a.x) + (side.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
  const off = Math.hypot(side.x - (a.x + (b.x - a.x) * t), side.z - (a.z + (b.z - a.z) * t));
  assert.ok(off >= 1.4, `Luo's attack stop is off the player's last leg in (${off.toFixed(2)} m)`);
  assert.ok(Math.abs(SampleMissionTerrain(side.x, side.z) - SampleMissionTerrain(S.throw.x, S.throw.z)) <= 0.4, "Luo's attack stop is on the trench floor");
  for (const block of MISSION_LAYOUT.blocks) {
    const ry = block.ry || 0, c = Math.cos(ry), q = Math.sin(ry), dx = side.x - block.x, dz = side.z - block.z;
    const lx = dx * c - dz * q, lz = dx * q + dz * c;
    const gap = Math.hypot(Math.max(Math.abs(lx) - block.w / 2, 0), Math.max(Math.abs(lz) - block.d / 2, 0));
    assert.ok(gap >= 0.45, `Luo's attack stop clears ${block.id} (${gap.toFixed(2)} m)`);
  }
  const { r } = WalkRuntime({ flow: { stage: { id: "Tank" } }, companion: { Handle: () => ({ id: 1, alive: true, position: { x: 0, z: 0 } }) } });
  const battle = new FirstLevelFrontBattle(r);
  r.Has = (id) => id === "bundleTaken" || id === "bundleReturned"; r.Inventory = () => ({ bundles: 1 }); r.tank = { brain: true };
  battle.UpdateSortie();
  assert.deepEqual(battle.leaderRoute.at(-1), side, "the 05 attack leg ends at leaderAttackSide");
  checks += 5;
  Ok("⑪ Luo's 05 attack leg ends beside the throw spot, 1.4 m+ from it and off the player's way in");
}

{
  // ⑫ ClearView (relay r2 Front step 2 drives): a squadmate between the player's eye and a talking speaker's head steps
  // aside square to the line of sight and holds there until the line ends; the speaker and the camera stay put.
  const eye = { x: 0, y: 1.6, z: 0 }, head = { x: 0, y: 1.6, z: -3.6 };
  assert.ok(BodyBetween(eye, head, { x: 0.1, y: 0, z: -1.8 }, 1.75), "a standing body on the line of sight hides the head");
  assert.ok(!BodyBetween(eye, head, { x: 0.5, y: 0, z: -1.8 }, 1.75), "0.5 m off the line he does not");
  assert.ok(!BodyBetween(eye, head, { x: 0, y: 0, z: -1.8 }, 1.2), "nor does a crouched man below the line");
  const cands = AsideCandidates(eye, head, { x: -0.1, z: -1.8 });
  assert.ok(cands[0].x < 0 && Math.abs(cands[0].offset) === B.speakerAsideOffsetsM[0], "his own side first, the nearest offset first");
  for (const c of cands) assert.ok(SegmentDistance(c, eye, head) >= B.speakerAsideOffsetsM[0] - 1e-9, "every candidate is off the line of sight");
  const fov = 55 * Math.PI / 180, aspect = 16 / 9, near = 0.05, far = 500, f = 1 / Math.tan(fov / 2);
  const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.6, 0, 1] },
    matrixWorldInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.6, 0, 1] },
    projectionMatrix: { elements: [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0] } };
  const V = (x, y, z) => ({ x, y, z, clone() { return V(this.x, this.y, this.z); }, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
  const luo = { id: 1, castId: "luo", alive: true, position: { x: 0, y: 0, z: -3.6 } };
  const yaowa = { id: 2, castId: "yaowa", alive: true, position: { x: -0.1, y: 0, z: -1.8 } };
  const moves = [], defends = [];
  const r = { time: 0, camera, flow: { stage: { id: "Orders" } }, ai: { soldiers: [luo, yaowa] },
    player: { position: { x: 0, y: 0, z: 0 }, get EyePosition() { return V(0, 1.6, 0); } },
    speakers: { ActorForWho: (who) => ({ luo, yaowa })[who] || null },
    Point: (p, rise = 0) => V(p.x, rise, p.z), BlocksSight: () => false,
    MoveActor: (actor, point) => { moves.push({ id: actor.id, ...point }); }, Defend: (actor, point) => defends.push({ id: actor.id, ...point }) };
  const scenes = new FirstLevelFrontScenes(r);
  scenes.handle = { id: "Volunteer", done: false, lines: [{ line: { id: "Volunteer.05", who: "luo", direction: {} }, state: "playing" }] };
  scenes.Steer();
  assert.ok(scenes.aside?.soldier === yaowa && scenes.asides.at(-1).line === "Volunteer.05", "Yaowa, between the player and Luo, is sent aside");
  assert.ok(moves.at(-1).id === yaowa.id && SegmentDistance(scenes.aside.spot, eye, { x: 0, z: -3.6 }) >= B.speakerAsideOffsetsM[0] - 1e-9 && scenes.aside.spot.x < 0,
    "to her own side, off the line of sight");
  assert.ok(scenes.Steers(yaowa) && !moves.some((m) => m.id === luo.id), "FrontBattle.Walk leaves her alone; Luo is not moved");
  Object.assign(yaowa.position, scenes.aside.spot); scenes.Steer();
  assert.equal(defends.at(-1).id, yaowa.id, "at her spot she holds it");
  scenes.handle.lines[0].state = "done"; scenes.Steer();
  assert.equal(scenes.aside, null, "the line done, she is let go");
  // A squadmate on a gun is never moved.
  const s2 = new FirstLevelFrontScenes({ ...r, emplacement: { guns: new Map([["Left", { npc: yaowa }]]) } });
  yaowa.position = { x: -0.1, y: 0, z: -1.8 };
  s2.handle = { id: "Volunteer", done: false, lines: [{ line: { id: "Volunteer.05", who: "luo", direction: {} }, state: "playing" }] };
  s2.Steer();
  assert.equal(s2.aside, null, "a gunner stays on his gun");
  // ⑫b A guard of the batch (no castId: relay r2 acceptance acc36, safe guard 50 in front of the player hid the relief
  // NCO's FrontRelief.02 for 148 of 155 frames) steps aside the same way, and once the line is done walks back to where
  // he stood and holds it. A guard bounding across the gap is left to his bound; a far shout moves nobody but the named.
  {
    const guard = { id: 50, alive: true, position: { x: -0.1, y: 0, z: -1.8 } };
    const gm = [], gd = [];
    const rg = { ...r, time: 0, ai: { soldiers: [luo, guard] }, guards: [{ actor: guard, safe: true, crossing: true }],
      MoveActor: (actor, point) => gm.push({ id: actor.id, ...point }), Defend: (actor, point) => gd.push({ id: actor.id, ...point }) };
    luo.position = { x: 0, y: 0, z: -3.6 };
    const Playing = () => ({ id: "FrontRelief", done: false, lines: [{ line: { id: "FrontRelief.02", who: "luo", direction: {} }, state: "playing" }] });
    const s3 = new FirstLevelFrontScenes(rg);
    s3.handle = Playing(); s3.Steer();
    assert.ok(s3.aside?.soldier === guard && s3.aside.home && s3.asides.at(-1).who === 50, "a safe guard between the player and the speaker is sent aside");
    assert.ok(gm.at(-1).id === 50 && SegmentDistance(s3.aside.spot, eye, head) >= B.speakerAsideOffsetsM[0] - 1e-9, "off the line of sight");
    Object.assign(guard.position, s3.aside.spot); s3.Steer();
    assert.equal(gd.at(-1).id, 50, "at his spot he holds it while the line plays");
    s3.handle.lines[0].state = "done"; rg.time = 1; s3.Steer();
    assert.ok(s3.aside?.phase === "back" && gm.at(-1).id === 50 && Dist(gm.at(-1), { x: -0.1, z: -1.8 }) < 1e-9, "the line done, he walks back to where he stood");
    assert.ok(s3.Steers(guard), "FrontBattle leaves him alone on the way back");
    Object.assign(guard.position, { x: -0.1, z: -1.8 }); s3.Steer();
    assert.ok(s3.aside === null && gd.at(-1).id === 50 && Dist(gd.at(-1), { x: -0.1, z: -1.8 }) < 1e-9, "back there he holds it again and is let go");
    // Never back (blocked on the way): after speakerAsideReturnS he is given his old spot to hold anyway.
    s3.handle = Playing(); rg.time = 10; s3.Steer();
    assert.ok(s3.aside?.soldier === guard, "sent aside again for the next line");
    s3.handle.lines[0].state = "done"; s3.Steer();
    rg.time = 10 + B.speakerAsideReturnS + 0.01; s3.Steer();
    assert.ok(s3.aside === null && Dist(gd.at(-1), { x: -0.1, z: -1.8 }) < 1e-9, "not back within speakerAsideReturnS: he holds his old spot (Defend walks him there)");
    // A guard in his bound across the gap keeps going.
    rg.guards[0].safe = false;
    const s4 = new FirstLevelFrontScenes(rg);
    s4.handle = Playing(); s4.Steer();
    assert.equal(s4.aside, null, "a guard bounding across the gap is not sent aside");
    // A far speaker (a shout across the front, beyond speakerViewNearM): only a named squadmate steps aside for him.
    rg.guards[0].safe = true; luo.position = { x: 0, y: 0, z: -20 }; guard.position = { x: -0.1, y: 0, z: -10 };
    const s5 = new FirstLevelFrontScenes(rg);
    s5.handle = Playing(); s5.Steer();
    assert.equal(s5.aside, null, "a far shout does not move a guard");
    luo.position = { x: 0, y: 0, z: -3.6 };
  }
  checks += 12 + 10;
  Ok("⑫ a squadmate between the player and a talking speaker steps aside until the line ends");
}

{
  // ⑬ Luo's cover is walked to within B.leaderCoverArrivalM (relay r2 Front step 2: 1.0 m short of it is the west
  // doorway, behind the wall's end from the captured gun), and the walk is taken up again after a step back.
  const { r, moves } = WalkRuntime();
  const battle = new FirstLevelFrontBattle(r), cover = { ...S.leaderCover, arrivalM: B.leaderCoverArrivalM };
  const luo = { id: 1, alive: true, position: { x: S.leaderCover.x - 0.97, z: S.leaderCover.z }, scriptArrivalRadius: 1 };
  battle.SetWalk(luo, [cover]);
  assert.equal(battle.Walk(luo), false, "0.97 m short (the doorway) is not his cover");
  assert.deepEqual([moves.at(-1).x, moves.at(-1).z], [S.leaderCover.x, S.leaderCover.z], "he walks on into it");
  luo.position = { x: S.leaderCover.x - 0.2, z: S.leaderCover.z };
  assert.equal(battle.Walk(luo), true, "within leaderCoverArrivalM he is there");
  luo.position = { x: S.leaderCover.x - 1.3, z: S.leaderCover.z }; moves.length = 0;
  assert.equal(battle.Walk(luo), false, "put 1.3 m off it (a step back for a line), the walk is taken up again");
  assert.equal(moves.at(-1)?.id, 1, "... and he walks back");
  const w = battle.walks.get(luo.id); w.stallAccepted = true; w.index = 1;
  assert.equal(battle.Walk(luo), true, "a spot the stall fallback accepted stays accepted (no stall loop)");
  const src = Read("Script_FirstLevelFrontBattle.mjs");
  assert.equal((src.match(/LeaderCover\(\)\]/g) || []).length, 3, "capture, 04 and after-capture cover legs all end on LeaderCover()");
  assert.ok(!/\[S\.leaderCover\]|,S\.leaderCover\]/.test(src), "no leg ends on the bare leaderCover point");
  checks += 8;
  Ok("⑬ Luo walks right into his cover and back into it after a step back");
}

{
  // ⑭ The left gun (relay r2 Front step 3 addendum A). It stood 1.22 m off the seat, 1.45 m over the pit floor with
  // nothing under it; He held his HanYang 2 m behind it for all of 04-05 (Zhou's exit shoved him off the seat).
  const seatToGun = Dist(S.leftGun, S.leftSeat);
  assert.ok(seatToGun >= 0.5 && seatToGun <= 0.8, `the gun stands 0.5-0.8 m in front of its seat (${seatToGun.toFixed(2)} m)`);
  const rest = MISSION_LAYOUT.blocks.find((b) => b.id === "LeftGunRest");
  assert.ok(rest, "LeftGunRest exists");
  // The rendered gun's lowest vertex sits 0.043 m under its pivot (the RightNestFrontRest rule: pivot 1.45 over the floor
  // at the gun, + sightRiseM 0.08 - 0.12294 to the lowest vertex); the rest's top is there and under the gun's pivot.
  const pivotY = SampleMissionTerrain(S.leftGun.x, S.leftGun.z) + 1.45, top = rest.y + rest.h / 2;
  assert.ok(Math.abs(top - (pivotY + 0.08 - 0.12294)) < 0.01, `the rest's top carries the gun (${top.toFixed(3)} vs pivot ${pivotY.toFixed(3)})`);
  assert.ok(Math.abs(S.leftGun.x - rest.x) <= rest.w / 2 && Math.abs(S.leftGun.z - rest.z) <= rest.d / 2, "the gun's pivot is over the rest");
  const backFace = rest.z + rest.d / 2;
  assert.ok(S.leftSeat.z - backFace >= 0.45, `the rest's back face stays ${(S.leftSeat.z - backFace).toFixed(2)} m >= 0.45 m off the seat (no shove)`);
  assert.ok(pivotY - SampleMissionTerrain(S.leftSeat.x, S.leftSeat.z) > 1.3, "a standing gun: the pivot is over 1.3 m above the seat's floor");

  const stances = [];
  const { r } = WalkRuntime({ ai: { ReleaseCover() {}, SetStance: (a, st) => stances.push([a.id, st]) } });
  const he = { id: 3, castId: "heyoutian", alive: true, weaponId: "HanYang", weapon: { id: "HanYang" }, ammo: 5, meleeDormant: false,
    scriptSuppressible: true, position: { x: S.leftSeat.x + 0.3, z: S.leftSeat.z + 1.7 }, actor: { SetWeapon(id) { this.weaponId = id; } } };
  const gunner = { id: 9, missionId: "Relief1", alive: true, weaponId: "Zb26", weapon: { id: "Zb26" }, position: { ...S.leftSeat }, actor: { SetWeapon() {} } };
  const gun = { npc: he, kind: { weaponId: "Zb26" } };
  Object.assign(r, { opening: { zhou: null }, leftGunId: "Left", emplacement: { guns: new Map([["Left", gun]]) } });
  const battle = new FirstLevelFrontBattle(r);
  battle.UpdateLeftGunner();
  assert.equal(he.weaponId, "Zb26", "He takes the ZB26 into his own hands with the gun");
  assert.equal(he.actor.weaponId, "Zb26", "... the rig shows it");
  assert.ok(he.meleeDormant === true, "the gunner is no bayonet target (he cannot die: a man who reached him bayoneted him for good)");
  const post = battle.walks.get(he.id)?.route.at(-1);
  assert.ok(post && Dist(post, S.leftSeat) < 1e-9 && post.arrivalM === B.leftGunSeatArrivalM && post.stance === 0,
    "shoved 1.7 m off the seat, he walks onto it (within leftGunSeatArrivalM, standing)");
  assert.ok(!stances.length && he.scriptSuppressible === true, "off the seat he is not stood up at the gun yet");
  he.position = { x: S.leftSeat.x + 0.1, z: S.leftSeat.z };
  battle.UpdateLeftGunner();
  assert.deepEqual(stances.at(-1), [3, 0], "on the seat he stands at the gun");
  assert.equal(he.scriptSuppressible, false, "... and fire does not pin him prone behind the rest");
  assert.ok(battle.walks.get(he.id).route.at(-1) === post, "the walk is set once, not every frame");
  // Relief: the gun passes to the relief gunner; He gets his rifle back and is a melee target again.
  gun.npc = gunner;
  battle.UpdateLeftGunner();
  assert.equal(he.weaponId, "HanYang", "He leaves the gun with his HanYang");
  assert.equal(he.meleeDormant, false, "... and melee sees him again");
  assert.ok(gunner.meleeDormant === true && gunner.weaponId === "Zb26", "the relief gunner mans it with his own ZB26");
  const src = Read("Script_FirstLevelFrontBattle.mjs");
  assert.ok(/UpdateHandover\(\);\s*this\.UpdateLeftGunner\(\);/.test(src) && (src.match(/this\.UpdateLeftGunner\(\);/g) || []).length === 2,
    "the gunner is kept every front frame and from UpdateRelief (06 has no FrontBattle.Update)");
  const main = Read("Script_Main.mjs"), runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.ok(/id:"MissionLeftGun"[^\n]*payload:\{npcCarriesGun:true\}/.test(runtime) && /npcCarriesGun/.test(main),
    "the world model on the rest is hidden while its man holds the ZB26 at the seat");
  checks += 19;
  Ok("⑭ the left gun rests on LeftGunRest 0.6 m ahead of the seat; He mans it standing with the ZB26 and gets his rifle back");
}

{
  // ⑮ The way back from a grenade dodge (09-26 relay r2 Front review). He dodged round LeftGunRest to its enemy side;
  // straight back to the seat ran into the rest, the stall fallback accepted the spot 1.31 m off and he stood there
  // for good with the gun showing on the rest (two ZB26s). Luo dodged out of the nest's west door and walked straight
  // back into its outer wall. Here: a 0.5 x 0.3 m block between the seat (0,0) and where the dodge ended.
  const box = { x0: -0.25, x1: 0.25, z0: -1.1, z1: -0.8 };
  const Crosses = (a, b) => { for (let i = 0; i <= 40; i++) { const t = i / 40, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1) return true; } return false; };
  let dodging = false;
  const { r, moves } = WalkRuntime({ RespondToGrenade: (a) => { a.missionGrenadeEvade = dodging; return dodging; },
    Point: (p, rise = 0) => ({ x: p.x, y: rise, z: p.z }), BlocksSight: (a, b) => Crosses(a, b) });
  const battle = new FirstLevelFrontBattle(r);
  const seat = { x: 0, z: 0, arrivalM: B.leftGunSeatArrivalM, stance: 0 };
  const he = { id: 3, castId: "heyoutian", alive: true, position: { x: 0, z: 0 }, scriptArrivalRadius: 1 };
  battle.SetWalk(he, [seat]);
  assert.equal(battle.Walk(he), true, "on his seat");
  battle.walks.get(he.id).stallAccepted = true;
  dodging = true;
  for (const p of [{ x: 0, z: 0 }, { x: -1.3, z: -0.3 }, { x: -1.3, z: -1.3 }, { x: -0.1, z: -1.3 }]) { he.position = p; r.time += 0.3; battle.Walk(he); }
  const w = battle.walks.get(he.id);
  assert.equal(w.trail?.length, 4, "the dodge leaves a trail point every evadeTrailStepM");
  assert.equal(w.stallAccepted, false, "a new dodge undoes the stall fallback's acceptance");
  dodging = false; r.time += 0.1; moves.length = 0;
  assert.equal(battle.Walk(he), false, "the dodge over, 1.3 m in front of the rest: the walk to the seat is taken up again");
  assert.deepEqual([moves.at(-1).x, moves.at(-1).z], [-1.3, -1.3], "straight back is blocked: he walks the trail back round the block first");
  assert.equal(battle.State().evadeReturns.length, 1, "the walk back is reported");
  he.position = { x: -1.2, z: -1.25 }; r.time += 1;
  battle.Walk(he);
  assert.deepEqual([moves.at(-1).x, moves.at(-1).z], [0, 0], "from the trail point with a clear walk, on to the seat");
  he.position = { x: 0.05, z: -0.05 };
  assert.equal(battle.Walk(he), true, "and he is on the seat again");
  // A dodge that ends with a clear walk back: no trail walk, straight to his point.
  dodging = true; he.position = { x: 0, z: 0 }; battle.Walk(he); he.position = { x: 0.9, z: 0.4 }; battle.Walk(he);
  dodging = false; moves.length = 0; battle.Walk(he);
  assert.deepEqual([moves.at(-1).x, moves.at(-1).z], [0, 0], "a clear way back: straight to the seat");
  assert.equal(battle.State().evadeReturns.length, 1, "... without a trail walk");
  // Stalled against the block with no dodge trail (shoved there): not accepted while a way round is clear (PostDetour).
  he.position = { x: 0, z: -1.5 }; battle.SetWalk(he, [seat]); r.time += 1; battle.Walk(he);
  he.position = { x: 0, z: -1.45 }; r.time += B.walkStallS + 0.1; moves.length = 0;
  assert.equal(battle.Walk(he), false, "stalled against the block 1.45 m short of the seat (his capsule 0.35 m off its face): not accepted");
  const via = battle.State().detours.at(-1)?.via;
  assert.ok(via?.length && [he.position, ...via, seat].every((p, i, all) => i === 0 || !Crosses(all[i - 1], p)), `a way round it (${JSON.stringify(via)})`);
  for (const p of via) { r.time += 0.5; battle.Walk(he); assert.ok(Dist(moves.at(-1), p) < 0.01, `he walks round it (${JSON.stringify(p)})`); he.position = { ...p }; }
  r.time += 0.5; battle.Walk(he);
  assert.deepEqual([moves.at(-1).x, moves.at(-1).z], [0, 0], "and from there on to the seat");
  checks += 13;
  Ok("⑮ after a grenade dodge a walker goes back the way he dodged when straight back is blocked, a post is taken up again, and a stall short of a post tries a way round");
}

{
  // ⑯ A squadmate holding his spot lets the player past (2026-09-26 relay r2 wrap-up, option c): 09-26 Front drive fx16,
  // the player at the right nest's west door, Luo in his cover (24.53,-151.05) 0.78 m from him in the doorway; the Script_Ai
  // friendly push starts only at CROWD.spacingM 0.75 m and he never moved. The door's two wall ends (the fx16 stuck dump's
  // colliders: x 23.65-24.35, z -156.8..-151.8 and -148.8..-145.6) stand in as physics.
  const walls = [{ x0: 23.65, x1: 24.35, z0: -156.8, z1: -151.8 }, { x0: 23.65, x1: 24.35, z0: -148.8, z1: -145.6 }];
  const Inside = (x, z, radius) => walls.some((w) => Math.hypot(Math.max(w.x0 - x, 0, x - w.x1), Math.max(w.z0 - z, 0, z - w.z1)) < radius);
  const Crosses = (a, b) => { for (let i = 0; i <= 20; i++) { const t = i / 20; if (Inside(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.3)) return true; } return false; };
  const V = (x, y, z) => ({ x, y, z, clone() { return V(this.x, this.y, this.z); }, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
  const home = { x: 24.53, z: -151.05 };
  const luo = { id: 1, castId: "luo", side: "nra", alive: true, moveSpeed: 0, position: { ...home, y: 0 } };
  const moves = [], defends = [];
  const player = { position: { x: 23.2, y: 0, z: -149.9 }, moveWishX: 0, moveWishZ: 0, velocity: { x: 0, y: 0, z: 0 } };
  const Heading = (to) => { const dx = to.x - player.position.x, dz = to.z - player.position.z, d = Math.hypot(dx, dz); player.moveWishX = dx / d; player.moveWishZ = dz / d; };
  const r = { time: 0, flow: { stage: { id: "Support" } }, ai: { soldiers: [luo], CrowdPinned: () => false }, player,
    Point: (p, rise = 0) => V(p.x, rise, p.z), BlocksSight: (a, b) => Crosses(a, b),
    physics: { Overlaps: (x, y, z, radius) => Inside(x, z, radius) },
    emplacement: { guns: new Map([["Right", { seat: S.seat, npc: null }]]) },
    MoveActor: (actor, point) => { moves.push({ id: actor.id, x: point.x, z: point.z }); },
    Defend: (actor, point) => defends.push({ id: actor.id, x: point.x, z: point.z }) };
  const scenes = new FirstLevelFrontScenes(r);
  // The player cuts across the doorway to the captured gun's seat, straight at Luo.
  const target = S.seat;
  // Coming up to the door, still 1.4 m off: nothing yet.
  Heading(target); scenes.Steer();
  assert.equal(scenes.giveWay, null, "1.8 m off he stays in his cover");
  // In the doorway, keys held towards the door point, blocked (velocity 0): he steps out of the way.
  player.position = { x: 23.7, y: 0, z: -150.4 }; Heading(target); scenes.Steer();
  const gw = scenes.giveWay;
  assert.ok(gw?.soldier === luo && scenes.gaveWay.at(-1)?.who === "luo", "1.05 m off, the player heading at him with his keys (not moving): Luo gives way");
  const hx = player.moveWishX, hz = player.moveWishZ, lateral = (p) => Math.abs((p.x - player.position.x) * hz - (p.z - player.position.z) * hx);
  assert.ok(lateral(gw.spot) >= B.giveWayLaneOffsetsM[0] - 1e-6 && lateral(home) < B.giveWayLaneM, `sideways off the player's line (${lateral(home).toFixed(2)} -> ${lateral(gw.spot).toFixed(2)} m)`);
  assert.ok(!Inside(gw.spot.x, gw.spot.z, 0.3) && !Crosses(home, gw.spot), `to a spot clear of the door's walls, a straight walk (${JSON.stringify(gw.spot)})`);
  assert.ok(Dist(gw.spot, home) <= B.giveWayMaxStepM && SegmentDistance(player.position, home, gw.spot) >= Math.min(B.giveWayPassM, Dist(home, player.position)) - 0.05,
    "a sidestep, never passing nearer the player");
  assert.ok(Dist(gw.spot, S.seat) >= Math.min(B.speakerStepGunSeatM, Dist(home, S.seat)) - 0.05, "not towards the captured gun's seat the player is going to");
  // Standing inside that gun's position, a spot nearer the seat is refused (09-26 wrap-up drive giveway1: Luo 1.24 m from the
  // player on the seat at the capture's staging check).
  // Luo on his cover, the player coming east through the doorway 0.2 m north of him: straight across his line the nearest
  // clear spot is 0.8 m south, towards the seat (2.3 m from it); he goes the other way instead.
  { const s5 = new FirstLevelFrontScenes({ ...r, ai: { soldiers: [] } }), from = { ...S.leaderCover };
    const near = { castId: "luo", position: { ...from, y: 0 } }, keep = { ...player.position };
    player.position = { x: 23.4, y: 0, z: -150.9 };
    const spot = s5.GiveWaySpot(near, { x: 1, z: 0 });
    assert.ok(spot && Dist(spot, S.seat) >= Math.min(B.speakerStepGunSeatM, Dist(from, S.seat)) - 0.05,
      `inside the gun position no step nearer its seat (${JSON.stringify(spot)})`);
    player.position = keep; }
  assert.ok(moves.at(-1)?.id === luo.id && Dist(moves.at(-1), gw.spot) < 1e-9 && luo.routeArrivalOwnsRadius === true, "he walks there, reached within the spot's own radius");
  assert.ok(scenes.Steers(luo), "FrontBattle.Walk leaves him alone meanwhile (no walk order, no stall clock)");
  // At the spot he holds it (still fights: Defend) while the player goes through the door to the gun.
  Object.assign(luo.position, gw.spot); r.time += 0.1; scenes.Steer();
  assert.equal(defends.at(-1)?.id, luo.id, "at the spot he holds it");
  player.position = { x: 24.4, y: 0, z: -151.5 }; Heading(S.seat); r.time += 1; scenes.Steer();
  assert.equal(scenes.giveWay?.phase, "aside", "the player still near his spot: he keeps out of the way");
  player.position = { x: 25.6, y: 0, z: -153.2 }; player.moveWishX = player.moveWishZ = 0; r.time += 0.1; scenes.Steer();
  r.time += B.giveWayClearS + 0.05; moves.length = 0; scenes.Steer();
  assert.equal(scenes.giveWay?.phase, "back", `the player ${Dist(player.position, home).toFixed(2)} m clear for ${B.giveWayClearS} s: he goes back`);
  assert.ok(moves.at(-1)?.id === luo.id && Dist(moves.at(-1), home) < 1e-9, "to the spot he left");
  Object.assign(luo.position, { x: home.x + 0.1, z: home.z }); r.time += 0.5; scenes.Steer();
  assert.ok(scenes.giveWay == null && scenes.gaveWay.at(-1).end === "back" && scenes.gaveWay.at(-1).homeM <= B.giveWayReturnM, "back on his spot, his own orders have him again");
  assert.ok(!scenes.Steers(luo), "... and FrontBattle.Walk walks him again");
  // Not: a player walking away from him, standing still, a man who is walking, a gunner, outside 03-06.
  const Try = (setup, stage = "Support") => {
    const s = new FirstLevelFrontScenes({ ...r, flow: { stage: { id: stage } } });
    Object.assign(luo.position, home); luo.moveSpeed = 0; player.position = { x: 23.7, y: 0, z: -150.4 }; player.velocity = { x: 0, y: 0, z: 0 }; Heading(target);
    setup?.(s); s.Steer(); return s.giveWay;
  };
  assert.ok(Try(null), "the doorway case gives way (control)");
  assert.equal(Try(() => { player.moveWishX = -player.moveWishX; player.moveWishZ = -player.moveWishZ; }), null, "a player walking away from him: no");
  assert.equal(Try(() => { player.moveWishX = player.moveWishZ = 0; }), null, "a player standing still: no");
  assert.ok(Try(() => { player.moveWishX = player.moveWishZ = 0; player.velocity = { x: 0.8, y: 0, z: -1.3 }; }), "no keys but walking at him (velocity): yes");
  assert.equal(Try(() => { luo.moveSpeed = 0.5; }), null, "a squadmate who is walking himself: no");
  assert.equal(Try((s) => { s.r.emplacement = { guns: new Map([["Right", { seat: S.seat, npc: luo }]]) }; }), null, "a man on a gun: no");
  assert.equal(Try(null, "Courtyard"), null, "07 and on: no");
  // His orders change (a new walk, a new step): let go at once.
  const s3 = new FirstLevelFrontScenes({ ...r }); Object.assign(luo.position, home); luo.moveSpeed = 0; player.position = { x: 23.7, y: 0, z: -150.4 }; Heading(target); s3.Steer();
  assert.ok(s3.giveWay, "giving way again");
  s3.r = { ...s3.r, flow: { stage: { id: "MachineGun" } } }; s3.Steer();
  assert.ok(s3.giveWay == null && s3.gaveWay.at(-1).end === "orders", "a new step: he is let go to his orders at once");
  // A leader who stood waiting for the player (his walk not finished): once the player is through he walks on from where
  // he is, not back to where he waited.
  const walk = { index: 0, route: [{ x: 30, z: -140 }] };
  const s4 = new FirstLevelFrontScenes({ ...r, flow: { stage: { id: "Support" } }, frontBattle: { walks: new Map([[luo.id, walk]]) } });
  Object.assign(luo.position, home); luo.moveSpeed = 0; player.position = { x: 23.7, y: 0, z: -150.4 }; Heading(target); s4.Steer();
  assert.ok(s4.giveWay, "a waiting leader gives way too");
  player.position = { x: 25.6, y: 0, z: -153.2 }; player.moveWishX = player.moveWishZ = 0; s4.r.time = 50; s4.Steer(); s4.r.time += B.giveWayClearS + 0.05; s4.Steer();
  assert.ok(s4.giveWay == null && s4.gaveWay.at(-1).end === "walkOn", "... and walks on from where he stepped to, not back");
  // Wiring: Steer runs it, the player reports where his keys point.
  assert.ok(/this\.StepAside\(\);\s*\n\s*this\.GiveWay\(\);/.test(Read("Script_FirstLevelFrontScenes.mjs")), "FrontScenes.Steer runs GiveWay every frame");
  assert.ok(/this\.moveWishX = wish\.x; this\.moveWishZ = wish\.z;/.test(Read("Script_Player.mjs")), "Script_Player reports the movement keys' direction (moveWishX/Z)");
  console.log("  ⑯ Luo's sidestep:", JSON.stringify(scenes.gaveWay[0]));
  checks += 26;
  Ok("⑯ a squadmate holding his spot steps out of the way of a player coming past him and goes back once the player is through");
}

{
  // ⑰ Relay r2 acceptance idle probe 2 (2026-09-26): the grenade the player dodged in the captured nest sent Luo 15.4 m
  // north out of it, behind its walls; FrontWithdraw.01 was released the moment the player was clear ("far") and said from
  // there (227 frames, 0 seen), while Luo walked back and was in his cover 7.5 s later. A far speaker, out of sight, whose
  // post is near the player waits for him to be back in view (at most speakerReturnHoldS); a far post still shouts at once.
  const fov = 55 * Math.PI / 180, aspect = 16 / 9, near = 0.05, far = 500, f = 1 / Math.tan(fov / 2);
  const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.6, 0, 1] },
    matrixWorldInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.6, 0, 1] },
    projectionMatrix: { elements: [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0] } };
  const V = (x, y, z) => ({ x, y, z, clone() { return V(this.x, this.y, this.z); }, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
  const cover = { x: 0.5, z: -4, arrivalM: B.leaderCoverArrivalM };
  const luo = { id: 1, castId: "luo", alive: true, position: { x: 0, y: 0, z: -16 } };
  const walk = { index: 1, route: [cover] };
  // The nest's walls: everything farther out than 10 m in front of the player is behind them.
  const r = { time: 100, camera, flow: { stage: { id: "Support" } }, ai: { soldiers: [luo] },
    player: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, get EyePosition() { return V(0, 1.6, 0); } },
    speakers: { ActorForWho: (who) => (who === "luo" ? luo : null) },
    frontBattle: { Active: true, walks: new Map([[luo.id, walk]]) },
    Point: (p, rise = 0) => V(p.x, rise, p.z), BlocksSight: (a, b) => b.z < -10,
    MoveActor: () => {}, Defend: () => {} };
  const scenes = new FirstLevelFrontScenes(r);
  const line = (id) => ({ id, who: "luo", direction: {} });
  assert.equal(scenes.PostAwayFrom(luo), cover, "Luo 12 m off his cover is away from his post");
  assert.equal(scenes.HoldLine(line("FrontWithdraw.01"), "FrontWithdraw"), true, "15-odd m out, behind the walls, his cover near the player: the line waits");
  r.time = 103; luo.position = { x: 0.2, y: 0, z: -12 };
  assert.equal(scenes.HoldLine(line("FrontWithdraw.01"), "FrontWithdraw"), true, "inside 15 m on his way back, still behind the walls: still waiting");
  assert.equal(scenes.steer, null, "nobody is stepped anywhere meanwhile (his own walk brings him back)");
  r.time = 105.5; luo.position = { x: 0.6, y: 0, z: -5 };
  assert.equal(scenes.HoldLine(line("FrontWithdraw.01"), "FrontWithdraw"), false, "in view on his way back: the line starts");
  const hold = scenes.holds.get("FrontWithdraw.01");
  assert.ok(hold.released === "inView" && hold.returnS === 5.5, "the hold records the 5.5 s wait for him");
  // Never back in view: after speakerReturnHoldS the line is said from where he is.
  r.time = 200; luo.position = { x: 0, y: 0, z: -16 };
  assert.equal(scenes.HoldLine(line("FrontWithdraw.02"), "FrontWithdraw"), true, "another line, him out again: waits");
  r.time = 200 + B.speakerReturnHoldS + 0.01;
  assert.equal(scenes.HoldLine(line("FrontWithdraw.02"), "FrontWithdraw"), false, "not back within speakerReturnHoldS: played anyway");
  assert.equal(scenes.holds.get("FrontWithdraw.02").released, "returnTimeout");
  // What still plays at once: a post far from the player (He's left gun), a man whose stall fallback took where he is, a
  // man still on the way (not his last leg), outside FrontBattle's steps, a speaker already in view.
  const Plays = (label, setup, undo) => {
    setup(); r.time += 20;
    const id = "Probe." + label;
    assert.equal(scenes.HoldLine(line(id), "Probe"), false, label + ": played at once");
    assert.equal(scenes.holds.get(id)?.returnSince, undefined, label + ": no wait for his return");
    undo();
  };
  Plays("far post", () => { walk.route = [{ x: 0, z: -40 }]; }, () => { walk.route = [cover]; });
  Plays("stall accepted", () => { walk.stallAccepted = true; }, () => { walk.stallAccepted = false; });
  Plays("on the way", () => { walk.route = [{ x: 0, z: -30 }, cover]; walk.index = 0; }, () => { walk.route = [cover]; walk.index = 1; });
  Plays("06", () => { r.frontBattle.Active = false; }, () => { r.frontBattle.Active = true; });
  Plays("in view", () => { r.BlocksSight = () => false; }, () => { r.BlocksSight = (a, b) => b.z < -10; });
  // A near speaker off his post (inside 15 m) is judged as before: this wait only starts for one beyond speakerViewNearM.
  luo.position = { x: 0.2, y: 0, z: -12 }; r.player.velocity = { x: 3, y: 0, z: 0 }; r.time += 20;
  assert.equal(scenes.HoldLine(line("Probe.near"), "Probe"), false, "a near speaker behind a wall while the player walks: plays at once, as before");
  assert.equal(scenes.holds.get("Probe.near").released, "walking");
  checks += 21;
  Ok("⑰ a far speaker a grenade dodge put off his post near the player, out of sight: his line waits <= speakerReturnHoldS for him to be back in view");
}

// ---------------------------------------------------------------------------
// ⑱ 09-25 storyboard round: SB07 lead / trigger / backslope LMG pair, SB08 first-batch column
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
  Ok("⑱a batches 5+3, the LMG pair is two second-batch guards on the upper backslope, its casualty a body");
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
  Ok("⑱b SB07: FrontApproach at (5,-143), Luo keeps 3-5 m ahead (runs, walks, waits, holds at corners, walks upright while he points)");
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
  Ok("⑱c backslope LMG pair: ambient fire on the slope in 03, exit and gather with the second batch in 04");
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
  Ok("⑱d SB08: the first batch crosses as one column, firstColumnSpacingM apart, a stuck man is passed");
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
  Ok("⑱e SB08: the sightline from the nest to the gap is clear of battlefield bodies");
}

console.log(`FirstLevelFrontPacingTest 通过：${checks} 条断言`);
