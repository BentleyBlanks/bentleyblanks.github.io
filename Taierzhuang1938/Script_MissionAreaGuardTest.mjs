// 任务走廊与「离开战场区域 · 返回 · N 秒」（S 包，docs/Data_FirstLevelGuidance20260928.md §3.3）的纯 node 闸门。
//
//   node Taierzhuang1938/Script_MissionAreaGuardTest.mjs
//
// 1. 表：27 个可玩步骤一个不多一个不少，路线键 / 锚点全都解析得出来。
// 2. 覆盖（宁松勿紧）：每一步的契约路线（带路线、回头警告线、15 的三段折线）、目标、上一步目标（交接处）、
//    接近门的锚点、该阶段的检查点出生点、MISSION_PLACEMENT 里这一步的摆位、05 的取弹路 / 攻击支路 / 投掷位、
//    现有连续驾驭脚本（Script_FirstLevelCampaign*）在这一步走过的每一个点 —— 全部在走廊里，而且离边至少 MARGIN_M。
// 3. 走廊真的拦东西：关卡四角、每一步往错方向走的几个点在走廊外。
// 4. 计时器：宽限、倒计时、回滞、回来补满、蹭边不补满、受控段 / 豁免步 / 换步宽限、判负只报一次。
// 5. 空气墙调试显示：?airWalls=1 时 tag:"airWall" 的体块画成半透明红板，默认不画；两种情况碰撞体都在。
import assert from "node:assert/strict";
import * as THREE from "three";
import { MISSION_AREA_STEPS, MISSION_AREA_WALK_M } from "./Data_FirstLevelMissionArea.mjs";
import { MISSION_AREA_GUARD as G } from "./Data_Tuning_MissionArea.mjs";
import { MISSION_RETURN } from "./Data_Tuning_FirstLevel.mjs";
import { MissionAreaGuard, ResolveMissionAreas, ResolveMissionArea, DistanceToArea, PolygonSignedDistance } from "./Script_MissionAreaGuard.mjs";
import { MISSION_STAGES, MISSION_GUIDANCE } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES as Stage, MISSION_RECEPTION_SPACE as Reception, MISSION_REGROUP_CORRIDORS } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_RETURN_ROUTES } from "./Data_FirstLevelMissionReturn.mjs";
import { MISSION_FACT_GATES } from "./Data_FirstLevelMissionGates.mjs";
import { FRONT_SORTIE as S, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { OPENING_STORYBOARDS as Storyboards } from "./Data_OpeningStoryboards.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MID_TUNING as M } from "./Data_Tuning_FirstLevelMid.mjs";
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";

let checks = 0;
const Check = (ok, message) => { checks += 1; assert.ok(ok, message); };
/** 每个该在里面的点离走廊边至少这么远：驾驶器躲雷、绕掩体、到点容差 0.8 m 都在这点余量里。 */
const MARGIN_M = 4;
const PLAY_STEPS = MISSION_STAGES.map((stage) => stage.id).filter((id) => id !== "Complete");
const AREAS = ResolveMissionAreas(MISSION_AREA_STEPS, { routes: Routes, anchors: A });

// ---------------------------------------------------------------------------------------------
// 1. 表
// ---------------------------------------------------------------------------------------------
assert.deepEqual(Object.keys(MISSION_AREA_STEPS).sort(), [...PLAY_STEPS].sort(), "每个可玩内部步骤正好一条走廊");
Check(PLAY_STEPS.length === 27, "27 个可玩内部步骤");
for (const id of PLAY_STEPS) {
  const area = AREAS[id];
  Check(!!area, `${id}: resolves`);
  if (area.exempt) continue;
  Check(area.capsules.every((capsule) => capsule.halfWidthM >= 25 && capsule.halfWidthM <= 40),
    `${id}: 步行段胶囊半宽在工作单的 25–40 m 里`);
  Check(area.capsules.every((capsule) => capsule.halfWidthM > MISSION_RETURN.corridorM),
    `${id}: 胶囊比回头警告的 ${MISSION_RETURN.corridorM} m 宽 —— 先出方向提示，再出倒计时`);
}
Check(MISSION_AREA_WALK_M === 40, "步行段半宽 40 m（回头警告 36 m + 4 m）");
assert.throws(() => ResolveMissionArea({ routes: [{ key: "noSuchRoute", halfWidthM: 30 }] }, { routes: Routes, anchors: A }, "Bad"),
  /unknown route key/, "路线键写错开机就抛");
assert.throws(() => ResolveMissionArea({ discs: [{ anchor: "noSuchAnchor", r: 10 }] }, { routes: Routes, anchors: A }, "Bad"),
  /unknown disc anchor/, "锚点名写错开机就抛");
assert.throws(() => ResolveMissionArea({}, { routes: Routes, anchors: A }, "Bad"), /empty corridor/, "空走廊要显式标 exempt");
// 受控段一律豁免（口径 §3.3：受困、坐车、抬担架、扑沟、死亡场、夜行军）。
for (const id of ["Trapped", "CartRide", "Carry", "Dive", "Death", "NightMarch"]) Check(AREAS[id].exempt, `${id}: exempt`);
Check(AREAS.BunkerRescue.exemptUntil === "luoRescueComplete", "02 还权之前不判");
Check(MISSION_FACT_GATES[AREAS.BunkerRescue.exemptUntil]?.step === "BunkerRescue", "exemptUntil 是这一步自己的事实");

// ---------------------------------------------------------------------------------------------
// 2. 覆盖
// ---------------------------------------------------------------------------------------------
const Pt = (p) => ({ x: p.x, z: p.z });
const Pts = (list) => list.map(Pt);
const Box = (b) => [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }];
const StageTarget = (id) => MISSION_STAGES.find((stage) => stage.id === id).target;
/** step → [label, point[]]：这一步必须框住的点。 */
const must = Object.fromEntries(PLAY_STEPS.map((id) => [id, []]));
const Need = (id, label, points) => { if (!AREAS[id].exempt) must[id].push([label, Pts([].concat(points))]); };

for (const [index, stage] of MISSION_STAGES.entries()) {
  if (stage.id === "Complete") continue;
  Need(stage.id, "stage.target", stage.target);
  // 交接处：上一步收尾时人多半还在上一步的目标上。
  if (index > 0) Need(stage.id, `previous target (${MISSION_STAGES[index - 1].id})`, MISSION_STAGES[index - 1].target);
  // 回头警告线就是这一步的带路线按步切好的那一段（带路表 MISSION_GUIDANCE 的 village 这种跨三步的长线不整条算）。
  Need(stage.id, "MISSION_RETURN_ROUTES（回头警告线）", MISSION_RETURN_ROUTES[stage.id]);
  const guide = MISSION_GUIDANCE[stage.id]?.route;
  if (guide && Stage[guide]) Need(stage.id, `guide route ${guide}`, Stage[guide]);
}
// 契约路线（MISSION_STAGE_ROUTES，分包契约 §3）按它服务的步骤。bridgeCrossing 是回援尾队的线，只算过了桥的南岸段。
const CONTRACT = {
  BunkerRescue: [Stage.rearTrench], RearTrench: [Stage.rearTrench], Tank: [Stage.collectionReturn], Orders: [Stage.collectionReturn],
  South: [Stage.southWalk], Courtyard: [Stage.courtyardBypass], WallPath: [Stage.wallPath], ReceptionGate: [Stage.wallPath.slice(3)],
  BridgeOrders: [Stage.toBridge], BridgeCover: [Stage.toBridge, Stage.bridgeCrossing.slice(2)],
  BridgeWithdraw: [Stage.bridgeWithdraw, Stage.marchOut, Stage.bridgeCrossing.slice(2)],
};
for (const [id, routes] of Object.entries(CONTRACT)) for (const route of routes) Need(id, "contract route", route);
Check(Object.keys(Stage).every((key) => Object.values(CONTRACT).flat().includes(Stage[key]) || ["cartRide", "nightMarch", "bridgeCrossing"].includes(key)),
  "every contract route is owned by a judged step (cartRide / nightMarch run in exempt steps)");
for (const corridor of MISSION_REGROUP_CORRIDORS) Need(corridor.id, "MISSION_REGROUP_CORRIDORS", corridor.route);
for (const stage of FIRST_LEVEL_STAGES) Need(stage.entry, `stage ${stage.number} checkpoint spawn`, stage.spawn);
for (const [fact, gate] of Object.entries(MISSION_FACT_GATES)) {
  if (gate.kind !== "proximity" || !MISSION_AREA_STEPS[gate.step]) continue;
  const at = gate.point || A[gate.anchor];
  Check(!!at, `${fact}: proximity gate has a point`);
  Need(gate.step, `proximity gate ${fact}`, at);
}
// 摆位（MISSION_PLACEMENT 与各包的摆位表）：这一步里有人站、有东西摆的地方。
const B = P.bunker, C = P.collection, SB = P.streetBlock, RY = P.receptionYard, BR = P.bridge;
Need("BunkerRescue", "bunker placement", [B.rifle, B.rifleMouth, B.returnSpot, ...B.exitLane]);
Need("RearTrench", "bunker exit lane", [B.returnSpot, ...B.exitLane, B.luoEntry, B.yaowaLift, ...B.rescueRoute]);
for (const id of ["Support", "MachineGun", "Tank"]) {
  Need(id, "relief / guards / tank targets", [...P.reliefApproach, ...P.reliefPositions, ...P.guardWithdrawalRoutes.flat(), ...P.tankTargets]);
  Need(id, "FRONT_SORTIE", [...S.approach, S.nest, S.seat, S.leaderCover, S.rear, ...S.rearRoute, ...S.route, ...S.attackRoute,
    S.house, S.bundle, S.keeper, S.leaderDoorSide, S.leaderAttackSide, S.throw, S.leftGun, S.leftSeat, ...S.leftRoute, ...S.zhouExit,
    S.gap, S.lastCover, ...S.guardRoute, S.damagedLip]);
  Need(id, "FRONT_SPACE", [Space.observation, Space.returnMeet, Space.fold, Space.safeZone, Space.gapJunction, Space.westDoor,
    Space.rearDoor, Space.roadMouth, ...Space.roadLink, Space.rearCorner, Space.supportJunction]);
}
Need("Orders", "collection placement", [...C.litters, ...C.wounded, ...C.bearers, ...C.bearerWait, ...C.bearerClose, C.zhouWall,
  C.zhouRecline, C.borrowStand, C.runner]);
Need("Orders", "06 rally from the bundle trench / throw spot", [...S.route, ...S.attackRoute, S.throw, Space.returnMeet]);
for (const id of ["Village", "Melee", "Courtyard"]) {
  Need(id, "streetBlock placement", [SB.gap, ...SB.frontParty, ...SB.withdrawnGuards, ...SB.litterWait, SB.windowShooter]);
  Need(id, "kitchen / connected house", [...Box(P.kitchenInterior), ...Box(P.roomInterior), ...P.ambushSquadPosts, P.ambushYaowaPost,
    ...P.ambushSquadEntry, ...P.ambushSquadRoute, P.sideRoomGunner, A.litterHold, A.eastAlley, A.melee, A.courtCover]);
}
Need("Courtyard", "courtyard gate / bypass", [A.gate, A.streetRejoin, ...Stage.courtyardBypass]);
for (const id of ["Transfer", "AirFirst"]) Need(id, "transfer yard", [...P.cartBays, A.transfer, A.queue, A.cartBoard, A.cartHalt,
  A.transferWall, A.sideAlley, A.transferSupply, M.loadingThreatPoint, M.villageRoadMouth, ...Stage.cartRide]);
Need("Rescue", "west ditch", [A.ditch, A.ditchMouth]);
Need("Regroup", "15A picket / drover", [...E.picketPosts, E.droverPost, E.droverCart, A.ditch, A.ditchMouth, A.retreatA]);
Need("WallPath", "15B stragglers", P.wallPath.stragglers);
for (const id of ["ReceptionGate", "Handover", "BridgeOrders", "BridgeCover"]) {
  Need(id, "reception yard", [...RY.gateGuard, RY.receiver, RY.surgeon, RY.yaowaBedside, RY.zhouPlaced, RY.nextLitterEntry,
    RY.emptyLitterStack, Reception.entry, Reception.wardEntry, Reception.wardExit, Reception.yardJunction, Reception.deathView,
    Reception.wardThreshold, Reception.litterOrigin, Reception.walkerOrigin, A.reception, A.zhouPickup, A.zhouDrop, A.finalCover,
    A.rearExit, ...Box(Reception.ward)]);
}
Need("BridgeCover", "bridge placement", [BR.officer, ...BR.demolition, BR.luoCover, BR.heyoutianCover, A.bridgeSouthEnd, A.railBridge]);
Need("BridgeWithdraw", "bridge placement", [BR.luoCover, BR.heyoutianCover, A.bridgeCover, A.blastSafe, A.marchOut, ...Stage.marchOut]);

// 现有连续驾驭脚本在这一步走过的点（照 Script_FirstLevelCampaign* 抄，60166b9f）。
const Campaign = (id, label, points) => Need(id, `campaign ${label}`, points);
const withdraw = [...Storyboards.withdraw.lane.slice(1), ...Stage.rearTrench.slice(3)];
Campaign("BunkerRescue", "Opening OpeningRifle / OpeningWithdraw", withdraw);
Campaign("RearTrench", "Opening OpeningWithdraw / OpeningRearTrench", withdraw);
for (const id of ["Support", "MachineGun", "Tank", "Orders"]) {
  Campaign(id, "FrontBattle RightNestApproach…OriginalCollectionPoint", [...Routes.support, ...S.approach, ...S.rearRoute,
    { x: 30, z: -141.8 }, S.seat, ...Routes.bundle, { x: S.bundle.x, z: S.bundle.z + 1 }, ...Routes.bundleReturn,
    ...S.attackRoute, S.throw, ...Stage.collectionReturn, Space.returnMeet]);
}
Campaign("Orders", "Front CollectionReturn / BorrowStand", [A.collection, C.borrowStand, ...Stage.collectionReturn]);
Campaign("South", "Front SouthWalkFirst / SouthWalk", Routes.southWalk);
Campaign("Village", "Mid StreetBlockMouth / StreetBlockApproach / KitchenEntry", [{ x: 58, z: -21 }, { x: 66, z: -24 },
  { x: 72, z: -24.3 }, { x: 76, z: -22 }, { x: 77, z: -12 }, { x: 77, z: -5 }, { x: 77, z: -14 }, { x: 60, z: -21 },
  { x: 58, z: -18 }, { x: 58, z: -12 }, { x: 58, z: -6 }]);
Campaign("Melee", "Mid KitchenLink", [{ x: 58, z: -6 }, { x: 58, z: -4 }, { x: 58, z: 0.2 }]);
Campaign("Courtyard", "Mid CourtyardWindowGun…CourtyardWatch", [{ x: 58, z: 0.2 }, { x: 58, z: 8.5 }, { x: 62.5, z: 8.5 },
  { x: 65.5, z: 8.5 }, { x: 70, z: 10 }, { x: 58, z: 8 }, { x: 58, z: 18 }, { x: 53, z: 24 }, { x: 53, z: 32.8 }, { x: 53, z: 38 },
  { x: 57, z: 38 }, { x: 53, z: 35 }, { x: 53, z: 32.2 }, { x: 50, z: 32.5 }, { x: 53, z: 36.4 }, { x: 51.2, z: 36.4 }]);
Campaign("TransferApproach", "Mid TransferApproachWalk", [{ x: 51.2, z: 36.4 }, { x: 57, z: 38 }, { x: 55, z: 39 }, { x: 66, z: 39 },
  { x: 74, z: 39 }, { x: 77, z: 35 }, { x: 78, z: 50 }, { x: 78, z: 62 }, { x: 76, z: 85 }, { x: 84, z: 92 }, { x: 90, z: 98 }, { x: 95, z: 103 }]);
Campaign("Transfer", "Mid TransferSupply…TransferBackToPost / CartBoarding", [{ x: 95, z: 103 }, { x: 82, z: 97.6 }, { x: 78, z: 96 },
  { x: 70, z: 88.5 }, { x: 64.4, z: 88.1 }, { x: 67.5, z: 85.6 }, { x: 78, z: 86.4 }, { x: 91.3, z: 86.4 }, { x: 78, z: 95 },
  { x: 78.5, z: 98 }, A.cartBoard, ...P.cartBays]);
Campaign("AirFirst", "Mid cart halt / unload", [A.cartHalt, { x: 70, z: 112 }, { x: 63, z: 112 }, { x: 54, z: 114 }]);
Campaign("Rescue", "Mid DiveAndRescue", [A.ditch, A.ditchMouth, { x: 54, z: 114 }]);
Campaign("Regroup", "End RegroupDitchMouth / RegroupDrover / RegroupRally", [{ x: A.ditch.x + 6, z: A.ditch.z }, A.ditch,
  { x: 47, z: 114 }, { x: E.droverPost.x + 2.4, z: E.droverPost.z + 1.2 }, ...Routes.evacuation.slice(0, 4)]);
Campaign("WallPath", "End WallPathEnter…WallPathToGate", [...Routes.evacuation.slice(2, 7), ...Stage.wallPath]);
Campaign("ReceptionGate", "End WallPathToGate tail", Stage.wallPath.slice(3));
Campaign("Handover", "End HandoverThreshold / HandoverPlace", [Reception.yardJunction, Reception.wardExit,
  { x: Reception.wardThreshold.x, z: Reception.wardThreshold.z + 1.5 }, A.zhouDrop, { x: A.zhouDrop.x - 0.8, z: A.zhouDrop.z + 0.6 }]);
for (const id of ["BridgeOrders", "BridgeCover"])
  Campaign(id, "End WardToCourtyard / BridgeToCover", [...Routes.reception.slice(-2).reverse(), ...Stage.toBridge]);
Campaign("BridgeWithdraw", "End BridgeWithdrawToSafe / NightMarchOut", [...Stage.bridgeWithdraw.slice(0, -1), { x: -73, z: 201.5 },
  A.blastSafe, ...Stage.marchOut]);

let covered = 0;
for (const id of PLAY_STEPS) {
  const area = AREAS[id];
  if (area.exempt) { Check(must[id].length === 0, `${id}: exempt steps collect nothing`); continue; }
  Check(must[id].length > 0, `${id}: has coverage points`);
  for (const [label, points] of must[id]) {
    for (const point of points) {
      const d = DistanceToArea(point, area);
      covered += 1;
      assert.ok(d <= -MARGIN_M, `${id}: ${label} (${point.x},${point.z}) 要在走廊里、离边 ≥ ${MARGIN_M} m，实际 ${d.toFixed(2)}`);
    }
  }
}
checks += 1;

// ---------------------------------------------------------------------------------------------
// 3. 走廊真的拦东西
// ---------------------------------------------------------------------------------------------
const bounds = MISSION_LAYOUT.bounds;
const corners = [{ x: bounds.minX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.maxZ }, { x: bounds.minX, z: bounds.maxZ }];
for (const id of PLAY_STEPS) {
  if (AREAS[id].exempt) continue;
  for (const corner of corners) Check(DistanceToArea(corner, AREAS[id]) > 20, `${id}: level corner (${corner.x},${corner.z}) is outside`);
}
const wrongWay = {
  Support: [{ x: -110, z: -140 }, { x: 110, z: -150 }, { x: 0, z: -225 }, { x: -30, z: -60 }],
  Tank: [{ x: 100, z: -210 }, { x: 95, z: -110 }],
  South: [{ x: -100, z: -101 }, { x: -110, z: -60 }, { x: 40, z: -110 }],
  Village: [{ x: 10, z: 30 }, { x: 120, z: 0 }, { x: 70, z: 70 }],
  Courtyard: [{ x: 10, z: 30 }, { x: 76, z: 80 }],
  TransferApproach: [{ x: 10, z: 60 }, { x: 140, z: 80 }, { x: 76, z: 150 }],
  Transfer: [{ x: 76, z: 160 }, { x: 130, z: 100 }, { x: 10, z: 100 }, { x: 76, z: 20 }],
  Regroup: [{ x: 110, z: 110 }, { x: 0, z: 190 }],
  WallPath: [{ x: 110, z: 200 }, { x: -40, z: 170 }],
  BridgeCover: [{ x: -77, z: 115 }, { x: -140, z: 200 }, { x: 40, z: 240 }],
  BridgeWithdraw: [{ x: -77, z: 125 }, { x: -140, z: 220 }],
};
for (const [id, points] of Object.entries(wrongWay))
  for (const point of points) Check(DistanceToArea(point, AREAS[id]) > 0, `${id}: wrong way (${point.x},${point.z}) is outside`);

// 几何小件：多边形里外与距离。
const square = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
Check(Math.abs(PolygonSignedDistance({ x: 5, z: 5 }, square) + 5) < 1e-9, "polygon: centre is 5 m inside");
Check(Math.abs(PolygonSignedDistance({ x: 13, z: 5 }, square) - 3) < 1e-9, "polygon: 3 m outside the east edge");
const capsuleArea = ResolveMissionArea({ routes: [{ key: "line", halfWidthM: 10 }] }, { routes: { line: [{ x: 0, z: 0 }, { x: 0, z: 100 }] } }, "Line");
Check(Math.abs(DistanceToArea({ x: 25, z: 50 }, capsuleArea) - 15) < 1e-9, "capsule: 25 m off a 10 m half-width line is 15 m outside");
Check(Math.abs(DistanceToArea({ x: 0, z: -20 }, capsuleArea) - 10) < 1e-9, "capsule: rounded end");
Check(DistanceToArea({ x: 9999, z: 9999 }, AREAS.Trapped) === -Infinity, "exempt area is inside everywhere");

// ---------------------------------------------------------------------------------------------
// 4. 计时器（数值从表里读，不抄数）
// ---------------------------------------------------------------------------------------------
const DT = 1 / 60;
const line = capsuleArea, IN = { x: 0, z: 50 }, OUT = { x: 30, z: 50 }, EDGE_IN = { x: 9, z: 50 };
function Run(guard, seconds, spec) { let view = null; for (let t = 0; t < seconds - 1e-9; t += DT) view = guard.Update(DT, spec); return view; }
{
  const guard = new MissionAreaGuard(G), base = { step: "S", area: line };
  let view = Run(guard, G.stepGraceS - 0.2, { ...base, point: OUT });
  Check(!view.warning && !view.outside, "step grace: a new step is not judged in its first stepGraceS");
  view = Run(guard, 0.4, { ...base, point: IN });
  Check(!view.outside && !view.warning, "inside after the grace");
  view = Run(guard, G.graceS - 0.1, { ...base, point: OUT });
  Check(view.outside && !view.warning && view.secondsLeft === G.countdownS, "outside shorter than graceS: no warning, clock untouched");
  view = Run(guard, 0.2, { ...base, point: OUT });
  Check(view.warning && view.secondsLeft < G.countdownS && view.secondsLeft > G.countdownS - 0.2, "warning after graceS, countdown starts");
  Check(Math.abs(view.distanceM - 20) < 1e-9, "distance is reported in metres outside");
  view = Run(guard, 1, { ...base, point: { x: 11, z: 50 } });
  Check(view.warning, "hysteresis: 1 m inside the edge is not back yet while warning");
  view = Run(guard, DT, { ...base, point: { x: 10 - G.reenterM - 0.1, z: 50 } });
  Check(!view.warning && !view.outside, "back past reenterM: warning off immediately");
  const left = view.secondsLeft;
  Check(left < G.countdownS - 1, "clock keeps the time spent outside");
  view = Run(guard, G.resetS - 0.5, { ...base, point: EDGE_IN });
  Check(view.secondsLeft === left, "inside shorter than resetS: clock not refilled");
  view = Run(guard, DT, { ...base, point: OUT });
  Check(view.warning, "re-leaving before resetS: warning at once (no second grace)");
  Check(view.secondsLeft < left, "…and the clock continues from where it was");
  view = Run(guard, G.resetS + 0.1, { ...base, point: IN });
  Check(view.secondsLeft === G.countdownS, "inside for resetS: clock refilled");
  // 走完倒计时：判负只报一次，随后整只计时器归零。
  let failedFrames = 0, urgentSeen = false, last = null;
  for (let t = 0; t < G.graceS + G.countdownS + 0.5; t += DT) {
    last = guard.Update(DT, { ...base, point: OUT });
    if (last.failed) failedFrames += 1;
    if (last.urgent) { urgentSeen = true; Check(last.secondsLeft <= G.urgentS, "urgent only in the last urgentS"); }
  }
  Check(failedFrames === 1, `failed is reported exactly once (${failedFrames})`);
  Check(urgentSeen, "urgent shows in the last seconds");
  Check(guard.log.some((entry) => entry.failed && entry.step === "S" && entry.maxDistanceM >= 20), "episode log keeps the failure");
  // 受控段：清零、不判。
  const controlled = new MissionAreaGuard(G);
  Run(controlled, G.stepGraceS + G.graceS + 1, { ...base, point: OUT });
  Check(controlled.warning, "fixture: warning is on before control");
  view = Run(controlled, 60, { ...base, point: OUT, controlled: true });
  Check(!view.warning && !view.failed && view.secondsLeft === G.countdownS, "controlled (cutscene / carry / down): never judged, clock refilled");
  // 豁免步：永远在里面。
  const exempt = new MissionAreaGuard(G);
  view = Run(exempt, 60, { step: "Trapped", area: AREAS.Trapped, point: { x: 9999, z: 9999 } });
  Check(!view.warning && !view.failed, "exempt step is never judged");
  // 换步：从头计，前 stepGraceS 不判。
  const change = new MissionAreaGuard(G);
  Run(change, G.stepGraceS + G.graceS + 1, { ...base, point: OUT });
  view = change.Update(DT, { step: "T", area: line, point: OUT });
  Check(!view.warning && view.secondsLeft === G.countdownS, "a new step starts from zero");
  // 没有走廊 / 没有点：不判。
  Check(!new MissionAreaGuard(G).Update(1, { step: "X", area: null, point: OUT }).warning, "no corridor, no judgement");
}
// 真走廊上走一遍：07 从集结处往西跑，40 m 出头出界（浏览器探针 Script_MissionAreaGuardBrowserTest 实机同一条）。
{
  const guard = new MissionAreaGuard(G), south = AREAS.South;
  let firstOut = null;
  for (let x = A.collection.x; x > -140; x -= 0.5) {
    if (DistanceToArea({ x, z: A.collection.z }, south) > 0) { firstOut = x; break; }
  }
  Check(firstOut != null && A.collection.x - firstOut >= MISSION_AREA_WALK_M - 1 && A.collection.x - firstOut <= MISSION_AREA_WALK_M + 6,
    `07 west of the collection: the corridor ends about ${MISSION_AREA_WALK_M} m out (at x ${firstOut})`);
  const view = Run(guard, G.stepGraceS + G.graceS + 0.2, { step: "South", area: south, point: { x: -100, z: A.collection.z } });
  Check(view.warning, "07: standing at x −100 west of the collection shows the warning");
}

// ---------------------------------------------------------------------------------------------
// 5. 空气墙调试显示（?airWalls=1）
// ---------------------------------------------------------------------------------------------
{
  const layout = {
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    ground: { x: 0, y: -0.05, z: 0, w: 40, h: 0.1, d: 40, semantic: "ground" },
    semanticColors: { ground: 0x777777, structure: 0x999999 },
    blocks: [
      { id: "Wall", x: 0, y: 1, z: 0, w: 4, h: 2, d: 0.5, semantic: "structure" },
      { id: "EdgeAirWall", x: 10, y: 2, z: 0, w: 0.4, h: 4, d: 12, semantic: "airWall", visual: false, tag: "airWall" },
    ],
    walkableSurfaces: [], gates: [],
  };
  const Build = (debugAirWalls) => {
    const scene = new THREE.Scene();
    const field = new FirstLevelWhiteboxField(scene, null, { whiteboxLayout: layout, debugAirWalls });
    field.BuildWhiteBoxes();
    const debug = []; scene.traverse((object) => { if (object.isMesh && object.name === "FirstLevelWhitebox_AirWallDebug") debug.push(object); });
    return { field, debug };
  };
  const plain = Build(false), shown = Build(true);
  Check(plain.debug.length === 0, "default: air walls are not drawn");
  Check(shown.debug.length === 1, "?airWalls=1: one merged debug mesh");
  const material = shown.debug[0].material;
  Check(material.transparent && material.opacity < 0.6 && material.depthWrite === false, "debug mesh is a see-through plate");
  Check(material.color.r > 0.6 && material.color.g < 0.3 && material.color.b < 0.3, "debug mesh is red");
  Check(material.allowOverride === false, "debug plate stays out of the prepass (MarkNoPrepass)");
  Check(!shown.debug[0].castShadow, "debug plate casts no shadow");
  const box = new THREE.Box3().setFromObject(shown.debug[0]);
  Check(Math.abs(box.min.x - 9.8) < 1e-6 && Math.abs(box.max.x - 10.2) < 1e-6 && Math.abs(box.max.y - 4) < 1e-6, "debug plate matches the air wall block");
  for (const { field } of [plain, shown])
    Check(field.colliders.some((collider) => collider.tag === "airWall" && Math.abs(collider.c[0] - 10) < 1e-9), "air wall collider exists either way");
  Check(shown.field.colliders.length === plain.field.colliders.length, "debug display adds no collider");
}

console.log(`PASS mission area: ${PLAY_STEPS.length} steps (${PLAY_STEPS.filter((id) => AREAS[id].exempt).length} exempt), ${covered} corridor points ≥ ${MARGIN_M} m inside, ${checks} checks`);
