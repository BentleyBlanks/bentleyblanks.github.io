// Script_FirstLevelStreetFightTest.mjs —— 08–11 耿家庄巷战的纯 Node 门禁（2026-10-12 03–11 重构 C 包，
// docs/Data_FirstLevel0311Refactor20261012Contract.md §3.6–3.9 / §5）。
//   · 表：四个新遭遇组与折线、激活表、事实门、任务字、锚点 / 夹道盒子 / 屋顶点、台词 cue 与播完记事实；
//   · 纯规则（Script_FirstLevelStreetFight）：推进点与逐个放人、人口预算、夹道 ≥ 8 m 窜出、后院计时投弹 / 指人、
//     先打死就什么都不发生、第二拨 90 s 上限、机枪压住-抬头的放行门、推车 10 s 窗口；
//   · 投弹力道按距离反解；
//   · 副作用层（Script_FirstLevelVillageBlock）的薄钩子在运行时源码里真的接着。
// 用法：node Taierzhuang1938/Script_FirstLevelStreetFightTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MISSION_STAGES, MISSION_ENCOUNTERS, MISSION_TACTICS } from "./Data_FirstLevelMission.mjs";
import { MISSION_FACT_GATES, MISSION_ENCOUNTER_ACTIVATION, MISSION_STEP_SPAWNS, MISSION_VOICE_FACTS } from "./Data_FirstLevelMissionGates.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { MID_TUNING as M } from "./Data_Tuning_FirstLevelMid.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { MISSION_LEADER_STAGES } from "./Data_FirstLevelLeaderGuide.mjs";
import { MISSION_CIVILIAN_AFTERMATH_HOUSES } from "./Data_FirstLevelMissionCivilianAftermath.mjs";
import { FIRST_LEVEL_ENCOUNTER_STARTS, FIRST_LEVEL_DEFERRED_ENCOUNTERS, FIRST_LEVEL_STAGE_ENCOUNTERS } from "./Data_FirstLevelMissionStages.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { StreetFightRules, InBox, AlleyDepth, ThrowPowerFor } from "./Script_FirstLevelStreetFight.mjs";
import { VILLAGE_BYSTANDERS, VILLAGE_STREET_POSTS, VILLAGE_ENCOUNTER_IDS, GENG_CART_LANE_ROUTE, GengCartTransferRoute } from "./Script_FirstLevelVillageBlock.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Read = (file) => fs.readFileSync(path.join(HERE, file), "utf8");
const T = M.streetFight;
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks++; };
const Stage = (id) => MISSION_STAGES.find((stage) => stage.id === id);

// 1. 表：步骤、遭遇组、折线、激活、事实门、任务字。
{
  Check(Stage("Village").requirements.join() === "streetBlockSeen,littersInCover,sideRouteEntered", "08 过关 = 看见街堵 + 担架进墙后 + 跨进侧路");
  Check(Stage("Courtyard").requirements.join() === "villageGunSilent,courtyardGateOpen,courtyardPassed", "10 requirements 不变");
  Check(Stage("TransferApproach").requirements.length === 3 && Stage("Melee").requirements.join() === "meleeResolved", "09 / 11 requirements 不变");
  Check(Stage("Village").objective.includes("灶屋") && Stage("Village").objective.includes("夹道"), "08 任务字写两条看得见的路");
  Check(Stage("Courtyard").objective.includes("巷口") && Stage("Courtyard").objective.includes("院门"), "10 任务字只写巷口与院门");
  for (const [group, n] of [["streetPush", 4], ["alleyPop", 1], ["roofThrower", 1], ["laneWave2", 4]])
    Check(MISSION_ENCOUNTERS[group]?.length === n, `${group} ${n} 人`);
  Check(MISSION_ENCOUNTERS.courtyard.length === 4, "courtyard 第一拨 3 + 1");
  Check(MISSION_ENCOUNTERS.laneWave2[0].id === "LaneGunner" && MISSION_ENCOUNTERS.laneWave2[0].weapon === "Type11" && MISSION_ENCOUNTERS.laneWave2[0].hold, "LaneGunner 是歪把子 hold");
  Check(MISSION_ENCOUNTERS.village.find((s) => s.id === "RearWindow").weapon === "Type11", "东窗改歪把子");
  for (const spec of [...MISSION_ENCOUNTERS.streetPush, ...MISSION_ENCOUNTERS.laneWave2, MISSION_ENCOUNTERS.alleyPop[0]])
    Check(MISSION_TACTICS[spec.id]?.fact && MISSION_TACTICS[spec.id].points.length >= 2, `${spec.id} 有 fact 门控折线`);
  Check(MISSION_TACTICS.StreetPushA.fact === "streetBlockSeen" && MISSION_TACTICS.LaneGunner.fact === "courtyardGateOpen" && MISSION_TACTICS.AlleyPop.fact === "alleyPopped", "折线门控的事实");
  Check(MISSION_ENCOUNTERS.streetPush.every((s) => s.x > 82.5 && s.z > 2.5 && s.z < 19.5), "东巷 4 人出生在两道巷墙之间、主街东墙以东");
  Check(MISSION_ENCOUNTERS.streetPush.every((s) => MISSION_TACTICS[s.id].points.slice(1).every((p) => p.x <= 79.85 && p.x >= 76)
    && MISSION_TACTICS[s.id].points.at(-1).z < -13), "东巷来的人出巷口后贴东墙根（街东房前墙 x 80.2 以西 0.35 m）往北压到街北半段");
  Check(MISSION_TACTICS.MeleeAlley.points[0].holdS > 0 && Distance(MISSION_TACTICS.MeleeAlley.points[0], T.windowThrowPost) < 0.01, "MeleeAlley 先到东窗外停一拍再进门");
  Check(Distance(MISSION_TACTICS.LaneGunner.points.at(-1), { x: 77.5, z: 42.5 }) < 0.01, "LaneGunner 架在巷东头主街口的草垛边");
  // 激活表与生成表。
  Check(MISSION_ENCOUNTER_ACTIVATION.streetPush.spawn.fact === "streetBlockSeen" && MISSION_ENCOUNTER_ACTIVATION.alleyPop.spawn.fact === "westAlleyEntered"
    && MISSION_ENCOUNTER_ACTIVATION.laneWave2.spawn.fact === "courtyardGateOpen", "三组 fact 放出");
  Check(MISSION_STEP_SPAWNS.Melee.includes("roofThrower") && MISSION_ENCOUNTER_ACTIVATION.roofThrower.dormant, "屋顶那个进 09 按表生、装睡");
  Check(FIRST_LEVEL_ENCOUNTER_STARTS.streetPush === 8 && FIRST_LEVEL_ENCOUNTER_STARTS.laneWave2 === 10 && FIRST_LEVEL_ENCOUNTER_STARTS.roofThrower === 9, "起始阶段");
  Check(FIRST_LEVEL_DEFERRED_ENCOUNTERS[8].includes("streetPush") && FIRST_LEVEL_DEFERRED_ENCOUNTERS[10].includes("laneWave2"), "延后组登记");
  Check(FIRST_LEVEL_STAGE_ENCOUNTERS[8].includes("roofThrower") && FIRST_LEVEL_STAGE_ENCOUNTERS[9].includes("roofThrower"), "09 / 10 跳转起点屋顶那个还在");
  for (const fact of ["gengHouseOffered", "sideRouteEntered", "westAlleyEntered", "streetPushStopped", "alleyPopped", "roofThrowerSpotted", "roofThrowerDown",
    "gengGateHeard", "laneMgSuppressed", "laneWave2Spent", "cartPushed", "gengCartArrived", "gengAsked"])
    Check(MISSION_FACT_GATES[fact]?.text, `事实门 ${fact} 讲得出人话`);
  Check(MISSION_FACT_GATES.westAlleyEntered.kind === "interior" && MISSION_FACT_GATES.westAlleyEntered.box === "westAlley" && P.westAlley, "westAlleyEntered 是夹道盒子的 interior 门");
  Check(MISSION_FACT_GATES.roofThrowerDown.member === "RoofThrower" && MISSION_FACT_GATES.laneMgSuppressed.member === "LaneGunner", "两条 combat 门指到人");
  Check(MISSION_VOICE_FACTS.GengGate === "gengGateHeard" && MISSION_VOICE_FACTS.AskGeng === "gengAsked", "两条播完记事实");
  Check(["Kitchen", "ConnectedHouse"].every((id) => !MISSION_CIVILIAN_AFTERMATH_HOUSES.includes(id)), "灶屋 / 连屋的百姓尸体撤掉");
  Check(VILLAGE_ENCOUNTER_IDS.length === 7 && T.villageAliveMax === 14, "村落人口预算 ≤ 14（契约 §4）");
}

// 2. 台词：五条新 cue（整段格式）、说话人与句数按契约 §5.2；北方官话占位的老耿不说四川话、不用「咯」。
{
  const byId = new Map(MISSION_DIALOGUE.map((cue) => [cue.id, cue]));
  for (const [id, who] of [["GengHouse", "geng,geng,geng"], ["GengGate", "luo,geng,geng,luo,geng"], ["CartPush", "geng,luo,shunzi"],
    ["GengCart", "geng,geng,geng"], ["AskGeng", "shunzi,geng,shunzi,geng"]]) {
    const cue = byId.get(id);
    Check(cue && !cue.perLine && cue.lines.map((l) => l.who).join() === who, `${id}：整段格式、说话人 ${who}`);
    Check(cue.delivery && cue.lines.every((l) => !/咯/.test(l.text)), `${id} 有导演提示、不用「咯」`);
  }
  Check(byId.get("GengHouse").lines[0].text === "死哪去了！满庄子找你！" && byId.get("AskGeng").lines[3].text === "再往南是临城。俺在那儿没亲没故，去干啥？", "台词逐字按契约");
}

// 3. 空间：锚点、夹道盒子、屋顶点、草垛、侧门、车位。
{
  Check(InBox(A.westAlleyNorth, { ...P.westAlley, minZ: P.westAlley.minZ - 3 }) && InBox(A.westAlleySouth, { ...P.westAlley, maxZ: P.westAlley.maxZ + 1 }), "夹道南北口锚点在夹道两头");
  Check(P.westAlley.maxX - P.westAlley.minX >= 2.3 && P.westAlley.maxZ - P.westAlley.minZ >= 30, "夹道 ≥ 2.3 m 宽、≥ 30 m 长（改稿：约 2.4 × 37）");
  const blocks = MISSION_LAYOUT.blocks.filter((b) => b.solid !== false);
  const Hit = (p, pad = 0.35) => blocks.filter((b) => Math.abs(p.x - b.x) < b.w / 2 + pad && Math.abs(p.z - b.z) < b.d / 2 + pad
    && b.y + b.h / 2 > Ground(p.x, p.z) + 0.3 && b.y - b.h / 2 < Ground(p.x, p.z) + 1.7 && !b.ry).map((b) => b.id);
  for (let z = P.westAlley.minZ + 0.5; z < P.westAlley.maxZ; z += 0.5) Check(Hit({ x: 50.5, z }).length === 0, `夹道中线 z=${z.toFixed(1)} 走得通（${Hit({ x: 50.5, z })}）`);
  Check(blocks.some((b) => b.id === "WestAlleyDoorHead") && !blocks.some((b) => b.id === "MachineGunHouseEastBack"), "机枪屋东墙后段换成了侧门");
  Check(Hit({ x: 49, z: 13.4 }, 0.3).length === 0, "侧门门洞 z 13.4 通着");
  Check(Hit({ x: 49, z: 11.8 }, 0.1).length > 0 && Hit({ x: 49, z: 15.0 }, 0.1).length > 0, "门洞两边是填墙");
  const slope = blocks.find((b) => b.id === "SideRoomSlope1");
  Check(slope && Math.abs(A.roofPost.x - slope.x) < slope.w / 2 && Math.abs(A.roofPost.z - slope.z) < slope.d / 2, "A.roofPost 在侧间屋顶东坡面块上");
  Check(Math.abs((slope.y + slope.h / 2) - (Ground(A.roofPost.x, A.roofPost.z) + T.roofTopM)) < 0.05, `roofTopM 就是坡面块的顶（${(slope.y + slope.h / 2 - Ground(A.roofPost.x, A.roofPost.z)).toFixed(3)}）`);
  Check(InBox(A.roofPost, { minX: 64, maxX: 72, minZ: 5.5, maxZ: 16 }) && !InBox(A.roofPost, T.yardBox), "屋顶点在后院东排房上、不在院子地面盒子里");
  const hay = blocks.find((b) => b.id === "LaneHaystack");
  Check(hay && Distance(hay, MISSION_TACTICS.LaneGunner.points.at(-1)) < 2.2 && Distance(hay, MISSION_TACTICS.LaneGunner.points.at(-1)) > 0.8, "草垛在机枪手身边");
  Check(hay.x > 72.35 && hay.x < 81.65 && hay.z > 38.3 && hay.z < 46, "草垛在主街西墙 z 38–46 那道缺口的街里");
  Check(Distance(A.laneEast, A.gate) < 6 && A.laneEast.x > A.gate.x && A.laneEast.z > A.gate.z, "A.laneEast 在院门外东侧");
  Check(InBox(A.gengCartYard, T.yardBox) && Hit(A.gengCartYard, 0.9).length === 0, "驴车在后院里、周围 0.9 m 没有实心件");
  for (const p of [T.gengVat, T.gengTable, T.gengUnbar, T.cartGateway, T.cartWallFoot, T.cartPushPoint, T.heTable, T.heCartPush])
    Check(Hit(p).length === 0, `10 的摆位 (${p.x},${p.z}) 站得住（${Hit(p)}）`);
  const vat = blocks.find((b) => b.id === "CourtGateVat"), table = blocks.find((b) => b.id === "CourtGateTable");
  Check(vat && table && Math.abs(vat.x - A.gate.x) > vat.w / 2 + 1.0 && Math.abs(table.x - A.gate.x) > table.w / 2 + 1.0, "缸与桌都让开 x=53 的担架道（±1 m）");
  Check(Math.abs(T.gengVat.x - A.gate.x) > 0.95 && Math.abs(T.gengTable.x - A.gate.x) > 0.95, "老耿抱缸 / 拖桌站的点也不站在担架道上");
  for (const p of [...GENG_CART_LANE_ROUTE, ...GengCartTransferRoute()])
    Check(Hit(p, 0.25).length === 0, `驴车折线点 (${p.x},${p.z}) 不在实心件里（${Hit(p, 0.25)}）`);
  Check(GengCartTransferRoute().at(-1).x === T.gengCartBay.x && Distance(T.gengCartBay, P.cartBays[0]) > 4.5 && Distance(T.gengCartBay, A.transfer) > 3, "驴车停车位让开四个车位与顺子的射位");
  Check(Distance(T.askPoint, T.gengCartBay) < 5, "AskGeng 的交互点在车旁");
  Check(VILLAGE_BYSTANDERS.length === 4 && VILLAGE_STREET_POSTS.length === 2 && VILLAGE_STREET_POSTS[0].cast === "heyoutian", "街口：前队两个退到担架墙后，何有田 + 刘文财压东窗");
  Check(MISSION_LEADER_STAGES.Village.target.z < -16.8, "08 的标记指灶屋北门（门洞外），不指屋里");
}

// 4. 投弹力道：按射程反解，单调、落在 [0,1]，高处扔得更远。
{
  const a = ThrowPowerFor(6), b = ThrowPowerFor(12), c = ThrowPowerFor(16);
  Check(a.power < b.power && b.power < c.power && a.power >= 0 && c.power <= 1, "射程越远 power 越大");
  Check(Math.abs(b.rangeM - 12) < 0.05, `12 m 的解射程就是 12 m（${b.rangeM.toFixed(2)}）`);
  Check(ThrowPowerFor(12, 3.8).speed < b.speed, "从 3.8 m 高的屋顶扔同样远用的初速更小");
  Check(ThrowPowerFor(1).power === 0 && ThrowPowerFor(60).power === 1, "超出射程范围夹到两端");
}

// 5. 纯规则：逐帧喂现场。
const alley = P.westAlley, yard = T.yardBox;
function Scene(over = {}) {
  return { stage: "Village", streetSeen: false, kitchenEntered: false, player: { x: 48, z: -20 }, aliveVillage: 9, pushSpawned: 0,
    alleyPop: { present: false, alive: false }, roof: { present: false, alive: false }, gateOpen: false, laneSpawned: 0,
    gunner: { present: false, alive: false, suppressed: false }, cartAtThreshold: false, cartPushed: false, ...over };
}
function Run(rules, seconds, scene) {
  const out = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) out.push(...rules.Update(1 / 60, scene));
  return out;
}
{
  // 08：看见街堵了起逐个放人；进了灶屋就停，没放出来的不放。
  const rules = new StreetFightRules(T, { alley, yard });
  Check(Run(rules, 5, Scene()).length === 0, "没看见街堵什么都不发生");
  let events = Run(rules, 0.1, Scene({ streetSeen: true }));
  Check(events.includes("spawnPusher") && rules.State().push.spawned === 1, "看见街堵：第一个立刻放");
  events = Run(rules, T.pushGapsS[1] + 0.2, Scene({ streetSeen: true }));
  Check(events.filter((e) => e === "spawnPusher").length === 1 && rules.State().push.spawned === 2, `隔 ${T.pushGapsS[1]} s 放第二个`);
  events = Run(rules, 1, Scene({ streetSeen: true, kitchenEntered: true }));
  Check(events.includes("sideRouteEntered") && events.includes("pushStopped") && !events.includes("westAlleyEntered"), "进了灶屋：推进点 + 不再补人");
  events = Run(rules, 60, Scene({ streetSeen: true, kitchenEntered: true }));
  Check(!events.includes("spawnPusher") && rules.State().push.spawned === 2, "停了之后 60 s 一个都不再放");
  // 人口预算：满了就不放。
  const full = new StreetFightRules(T, { alley, yard });
  Check(!Run(full, 2, Scene({ streetSeen: true, aliveVillage: T.villageAliveMax })).includes("spawnPusher"), "村落活人到顶：不放");
  Check(Run(full, 0.1, Scene({ streetSeen: true, aliveVillage: T.villageAliveMax - 1 })).includes("spawnPusher"), "空出一个名额才放");
}
{
  // 09 夹道：从北口进，走 8 m 才窜出来；先走灶屋再绕进夹道也照记。
  const rules = new StreetFightRules(T, { alley, yard });
  const inAlley = (z) => Scene({ streetSeen: true, player: { x: 50.5, z }, alleyPop: { present: true, alive: true } });
  let events = Run(rules, 0.1, inAlley(alley.minZ + 1));
  Check(events.includes("westAlleyEntered") && events.includes("sideRouteEntered") && rules.alleyEnteredFrom === "north", "跨进夹道北口：两条事实、记下从北边进");
  Check(!Run(rules, 1, inAlley(alley.minZ + 5)).includes("alleyPop"), "走了 5 m 还没窜");
  Check(Run(rules, 0.1, inAlley(alley.minZ + T.alleyPopDepthM + 0.1)).includes("alleyPop"), `走了 ${T.alleyPopDepthM} m 窜出来`);
  Check(AlleyDepth({ x: 50.5, z: alley.maxZ - 3 }, alley, "south") > 2.9 && AlleyDepth({ x: 50.5, z: alley.maxZ - 3 }, alley, "south") < 3.1, "从后院那头进按另一头量里程");
  const late = new StreetFightRules(T, { alley, yard });
  Run(late, 0.1, Scene({ streetSeen: true, kitchenEntered: true }));
  const second = Run(late, 0.1, inAlley(alley.maxZ - 1));
  Check(second.includes("westAlleyEntered") && !second.includes("sideRouteEntered") && late.alleyEnteredFrom === "south", "先走灶屋、后从后院绕进夹道：照记、从南边进");
}
{
  // 09 后院：进院 1.8 s 妮儿指、6 s 投弹；先打死就什么都不发生。
  const rules = new StreetFightRules(T, { alley, yard });
  const inYard = (roof) => Scene({ stage: "Melee", streetSeen: true, kitchenEntered: true, player: { x: 50, z: 25 }, roof });
  let events = Run(rules, 0.1, inYard({ present: true, alive: true }));
  Check(events.includes("yardEntered") && !events.includes("roofSpot"), "进后院：先只是进了");
  events = Run(rules, T.roofSpotDelayS, inYard({ present: true, alive: true }));
  Check(events.includes("roofSpot") && !events.includes("roofThrow"), `${T.roofSpotDelayS} s 妮儿指他`);
  events = Run(rules, T.roofThrowDelayS - T.roofSpotDelayS + 0.1, inYard({ present: true, alive: true }));
  Check(events.includes("roofThrow"), `${T.roofThrowDelayS} s 投弹`);
  Check(Run(rules, 0.1, inYard({ present: true, alive: false })).includes("roofDown"), "之后被打死记 roofDown");
  const dead = new StreetFightRules(T, { alley, yard });
  const out = Run(dead, 10, inYard({ present: true, alive: false }));
  Check(out.includes("roofDown") && !out.includes("roofSpot") && !out.includes("roofThrow"), "先打死：不指、不投");
  const outside = new StreetFightRules(T, { alley, yard });
  Check(!Run(outside, 1, Scene({ stage: "Village", player: { x: 50, z: 25 }, roof: { present: true, alive: true } })).includes("yardEntered"), "08 里站在院子位置不算进后院（要在 09/10）");
}
{
  // 10：开门起逐个放第二拨、90 s 不再补；机枪压住 ≥ 2 s 才放行、抬头 1.5 s 后关门、死了就开；推车 10 s 窗口。
  const rules = new StreetFightRules(T, { alley, yard });
  const lane = (over) => Scene({ stage: "Courtyard", streetSeen: true, kitchenEntered: true, gateOpen: true, ...over });
  Check(rules.LaneOpen() === false, "起步：门还没开（机枪没来也要等规则跑一帧）");
  let events = Run(rules, 0.1, lane({}));
  Check(rules.LaneOpen() === true && !events.includes("laneSuppressed"), "机枪没来：门是开的，但不记事实");
  events = Run(rules, T.laneWaveGapsS[0] + 0.1, lane({}));
  Check(events.includes("spawnLane") && rules.State().lane.spawned === 1, "开门后第一个（机枪）放出");
  events = Run(rules, T.laneWaveGapsS[3] - T.laneWaveGapsS[0] + 0.2, lane({}));
  Check(rules.State().lane.spawned === 4, "四个都放了");
  const up = { present: true, alive: true, suppressed: false };
  events = Run(rules, T.laneMgRegraceS + 0.1, lane({ gunner: up }));
  Check(events.includes("laneRaised") && rules.LaneOpen() === false, "机枪架好没被压住：担架不许过门");
  const down = { present: true, alive: true, suppressed: true };
  events = Run(rules, T.laneMgSuppressS - 0.3, lane({ gunner: down }));
  Check(!events.includes("laneSuppressed") && rules.LaneOpen() === false, "压住不到 2 s 不算");
  events = Run(rules, 0.4, lane({ gunner: down }));
  Check(events.includes("laneSuppressed") && rules.LaneOpen() === true && rules.State().lane.suppressedEver, "压住 ≥ 2 s：放行、记事实");
  events = Run(rules, T.laneMgRegraceS + 0.1, lane({ gunner: up }));
  Check(events.includes("laneRaised") && rules.LaneOpen() === false, "抬头：余量过了就关门");
  Run(rules, 3, lane({ gunner: down }));
  Check(rules.LaneOpen() === true, "再压住又放行");
  const gone = { present: true, alive: false, suppressed: false };
  Run(rules, 0.1, lane({ gunner: gone }));
  Check(rules.LaneOpen() === true, "打死了就一直开着");
  const cap = new StreetFightRules(T, { alley, yard });
  const capEvents = Run(cap, T.laneWaveCapS + 1, lane({ aliveVillage: T.villageAliveMax }));
  Check(capEvents.includes("laneSpent") && !capEvents.includes("spawnLane"), "人口一直满：90 s 到点 laneSpent、一个都没放");
  Check(!Run(cap, 5, lane({ aliveVillage: 0 })).includes("spawnLane"), "spent 之后名额空出来也不再补");
  // 推车：10 s 没按就喊何有田；按了就不喊。
  const push = new StreetFightRules(T, { alley, yard });
  Run(push, 0.1, lane({ cartAtThreshold: true }));
  Check(!Run(push, T.cartPushWindowS - 0.5, lane({ cartAtThreshold: true })).includes("cartHelp"), "窗口里不喊");
  Check(Run(push, 1, lane({ cartAtThreshold: true })).includes("cartHelp"), "10 s 没推：何有田去推");
  const pushed = new StreetFightRules(T, { alley, yard });
  Run(pushed, 0.1, lane({ cartAtThreshold: true }));
  Check(!Run(pushed, T.cartPushWindowS + 2, lane({ cartAtThreshold: true, cartPushed: true })).includes("cartHelp"), "玩家推了就不喊");
  for (const key of ["push", "sideRouteEntered", "alleyPopped", "yard", "lane", "cart", "events"]) Check(key in rules.State(), `State() 有 ${key}`);
}

// 6. 薄钩子：运行时与副作用层真的接着。
{
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  Check(runtime.includes("OpenCourtyardGate()") && runtime.includes('"MissionCartPush"') && runtime.includes('"MissionAskGeng"'), "运行时：开门一个口、两个新交互点");
  Check(runtime.includes("this.village.LaneOpen()") && runtime.includes("this.village.CartLeft()"), "运行时：放行门与驴车出门两条薄钩子");
  const village = Read("Script_FirstLevelVillageBlock.mjs");
  Check(village.includes("new StreetFightRules(") && village.includes('r.Say("GengHouse")') && village.includes('r.Say("GengGate")') && village.includes('r.Say("CartPush")'), "副作用层用纯规则、喊 08 / 10 的三段");
  Check(village.includes("ThrowPowerFor(") && village.includes("BeginGrenadeThrow"), "投弹走 AI 的投掷链");
  const transfer = Read("Script_FirstLevelTransferCart.mjs");
  Check(transfer.includes('r.Record("gengCartArrived"') && transfer.includes('r.Say("GengCart")') && transfer.includes('this.r.Say("AskGeng")'), "11：驴车到场、三句、问路");
  const text = Read("Data_Text_FirstLevel.mjs");
  Check(text.includes('"Script_FirstLevelStreetFight.mjs"') && text.includes("firstLevel.interaction.cartPush") && text.includes("firstLevel.interaction.askGeng"), "文本表：新模块进闸门清单、两个交互文案");
  const family = Read("Script_FirstLevelGengFamily.mjs");
  for (const method of ["CartFollowRoute(", "CartHalt(", "GengFace(", "GengCrouchAt(", "GengFollowCart(", "NierRideCart(", "CartSeatPoints("])
    Check(family.includes(`  ${method}`), `GengFamily 加了 ${method}`);
}
console.log(`ok 08–11 耿家庄巷战：表 / 台词 / 空间 / 投弹力道 / 纯规则（推进点、夹道、后院、巷口、推车）/ 薄钩子（${checks} 项）`);
