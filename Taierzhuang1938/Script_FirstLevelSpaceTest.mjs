// 第一关 2026.09.19 重构 · 空间白盒门禁（纯 Node，不启动浏览器）。
//
// 需求：docs/Data_FirstLevelRebuild20260919Contract.md §3 与
//       docs/Data_FirstLevelRebuildSource20260919.md 文末「图示修正说明」
//       （射界、沟宽、桥头距离、村落绕行长度、降压步行时长、爆破安全距离，
//        一律按真实米制校验）。
//
// 这里量的是**几何**：锚点站不站得住、路线过不过得去、该看见的看不看得见、
// 该看不见的挡没挡住。真物理胶囊与炸桥前后四态在
// Script_FirstLevelMissionTopologyBrowserTest 里走。
import assert from "node:assert/strict";
import fs from "node:fs";
import { SouthFingerprint } from "./Script_FirstLevelSpaceProbe.mjs";
import { MISSION_AFTERMATH } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_LAYOUT as Layout, MISSION_ANCHORS as A, MISSION_ROUTES as Routes,
  MISSION_PLACEMENT as P, MISSION_NIGHT_GATE_BLOCK_IDS as NightIds, MISSION_SUPPLIES,
  MISSION_SUPPLY_COLLIDER, MISSION_TRENCH_PLACEMENTS } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ANCHORS as S, MISSION_STAGE_ROUTES as StageRoutes,
  MISSION_NORTH_RIVER as River, RiverCutAt, RiverProfileAt, RiverReachAt, RiverWaterAt,
  MISSION_PONTOON_BRIDGE as Pontoon, PONTOON_HEADS, MISSION_SOUTH_BRIDGE as RoadBridge,
  MISSION_RECEPTION_SPACE as Reception } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ENCOUNTERS, MISSION_TACTICS } from "./Data_FirstLevelMission.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { END_TUNING as END } from "./Data_Tuning_FirstLevelEnd.mjs";
import { ZhouGunExitRoute } from "./Script_FirstLevelOpening.mjs";
import { FirstLevelFrontBattle } from "./Script_FirstLevelFrontBattle.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FRONT_SORTIE as Sortie, FRONT_SPACE as Space } from "./Data_FirstLevelFrontRoute.mjs";
import { SampleMissionNaturalHeight as Natural } from "./Data_FirstLevelMissionTerrain.mjs";

// Scope selection for the 06–18 refactor. The default still exercises every
// original front/opening assertion, including the retired gunner-exit fixture.
const rearOnly = process.argv.includes("--rear-only");

const TAN52 = Math.tan(52 * Math.PI / 180);   // Script_Physics: setMaxSlopeClimbAngle(52°)
const CAPSULE_R = 0.35;                        // 路线净空半径（MakeCharacter 的 0.34 + 余量）
const Scenario = Object.fromEntries(Layout.scenario.states.map((state) => [state.id, state.blocks]));
const Solids = (stateId = "BunkerCollapsed") => [
  ...Layout.blocks.filter((block) => block.solid !== false
    && !Layout.walkableSurfaces.some((surface) => surface.id === block.id)),
  ...Scenario[stateId].filter((block) => block.solid !== false),
];
const Walkable = (x, z) => {
  let top = Ground(x, z);
  for (const surface of Layout.walkableSurfaces) {
    if (Math.abs(x - surface.x) > surface.w / 2 || Math.abs(z - surface.z) > surface.d / 2) continue;
    top = Math.max(top, surface.y + surface.h / 2);
  }
  return top;
};
function Hits(x, z, y, box, margin, ceiling) {
  const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
  return Math.abs(dx * cos - dz * sin) < box.w / 2 + margin
    && Math.abs(dx * sin + dz * cos) < box.d / 2 + margin
    && box.y + box.h / 2 > y + 0.3 && box.y - box.h / 2 < y + ceiling;
}
/** 沿路线每 0.4 m 量一次胶囊净空。`half` 是 [x 半宽, z 半宽]，圆柱就两个都给半径。 */
function RouteClearance(route, blocks, { margin = CAPSULE_R, ceiling = 1.7, boxHalf = null } = {}) {
  const bad = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d <= length; d += 0.4) {
      const t = length ? d / length : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = Walkable(x, z);
      for (const box of blocks) {
        const mx = boxHalf ? boxHalf[0] : margin, mz = boxHalf ? boxHalf[1] : margin;
        const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
        if (Math.abs(dx * cos - dz * sin) < box.w / 2 + mx
          && Math.abs(dx * sin + dz * cos) < box.d / 2 + mz
          && box.y + box.h / 2 > y + 0.3 && box.y - box.h / 2 < y + ceiling)
          bad.push(`${box.id} @ ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
  return [...new Set(bad)];
}
/** 三维线段被实心体块或地形挡住了没有。返回挡住它的第一个东西的名字，通则 null。 */
function SightBlocker(from, to, blocks) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) * 5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t,
      y = from.y + (to.y - from.y) * t;
    if (Ground(x, z) > y + 0.02) return "terrain";
    for (const box of blocks) {
      if (box.tag === "airWall") continue;                 // 空气墙只挡角色控制器，射线与视线穿过（Guidance §3.2）
      const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
      if (Math.abs(dx * cos - dz * sin) < box.w / 2 && Math.abs(dx * sin + dz * cos) < box.d / 2
        && y > box.y - box.h / 2 && y < box.y + box.h / 2) return box.id;
    }
  }
  return null;
}
const Eye = (p, h) => ({ x: p.x, z: p.z, y: Ground(p.x, p.z) + h });
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const RouteLength = (route) => route.slice(1)
  .reduce((sum, p, i) => sum + Distance(route[i], p), 0);
const report = {};

// 2026-09-23 01–06 空间重排：老周的左枪挪到土坎西端（Sortie.leftSeat），前沿补给箱不再在他身边。
// 负伤的老周沿何有田来的那条路下撤：左枪通道 → 支沟 → 支沟交汇 SJ → 集结处（Sortie.zhouExit），
// 全程胶囊净空、坡度可爬。数据折线在这里断言净空与坡度；运行时（FrontBattle.UpdateZhou，03 交枪与 04 检查点
// 两处）走的是 ZhouGunExitRoute 的返回值——下面用桩运行时真跑一遍 UpdateZhou，拿它交给 SetWalk 的路线来量，
// 同一只胶囊、同一条 52° 规则（2026-09-24 v1.8 接线，原来这里是 TODO 行）。
// 06–18 专项（--rear-only）不跑这一段（master 2026-09-24 白盒重建的分段口径）。
if (!rearOnly) {
  const route=Sortie.zhouExit;
  assert.deepEqual(route[0],Sortie.leftSeat,"Zhou's exit starts at the left gun seat");
  assert.ok(Distance(route.at(-1),OPENING.zhouRest)<0.01,"Zhou's exit ends at his rest by the collection");
  assert.deepEqual(RouteClearance(route,Solids("BunkerIntact")),[],"wounded Zhou's exit route is physically clear");
  let previous=Walkable(route[0].x,route[0].z);
  for(let leg=1;leg<route.length;leg++){
    const a=route[leg-1],b=route[leg],length=Distance(a,b),steps=Math.ceil(length/.2);
    for(let i=1;i<=steps;i++){
      const t=i/steps,y=Walkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
      assert.ok(Math.abs(y-previous)<=TAN52*(length/steps)+.03,
        `Zhou exit climbs a passable slope (${previous.toFixed(2)} -> ${y.toFixed(2)})`);
      previous=y;
    }
  }
  // The runtime walk, as UpdateZhou hands it to SetWalk (a stub runtime: facts, Zhou, Yaowa, the gun).
  const RuntimeZhouRoute=(zhouAt,facts)=>{
    const zhou={id:54,alive:true,health:80,position:{...zhouAt}},yaowa={id:2,alive:true,position:{...zhouAt}};
    const r={opening:{zhou},column:{zhou:{}},squadRoutes:new Map(),companion:{Handle:()=>yaowa},
      Has:(id)=>facts.includes(id),Record:()=>{},Defend:()=>{},OnPlayerDown:()=>{},MissionFailure:()=>{},
      emplacement:{NpcVacate:()=>{}},ai:{Remove:()=>{}},PlaceActor:(actor,at)=>Object.assign(actor.position,{x:at.x,z:at.z})};
    const battle=new FirstLevelFrontBattle(r);battle.Walk=()=>false;battle.UpdateZhou();
    const walk=battle.walks.get(zhou.id);
    return walk&&{from:{x:zhou.position.x,z:zhou.position.z},route:walk.route.map((p)=>({x:p.x,z:p.z}))};
  };
  const handover=RuntimeZhouRoute(Sortie.leftSeat,["rifleWithdrawalResolved"]);
  const checkpoint=RuntimeZhouRoute(Sortie.leftSeat,["rifleWithdrawalResolved","zhouLeftGun"]);
  assert.ok(handover&&checkpoint,"UpdateZhou starts Zhou's walk at the 03 hand-over and at the 04 checkpoint");
  const helper=ZhouGunExitRoute(Sortie.leftSeat,.34),rest=P.collection.zhouWall;
  assert.deepEqual(handover.route,[...helper,{x:rest.x,z:rest.z}],"the 03 hand-over walks the route ZhouGunExitRoute returns");
  assert.deepEqual(checkpoint.from,{x:route[2].x,z:route[2].z},"the 04 checkpoint puts Zhou on zhouExit[2]");
  assert.deepEqual(checkpoint.route,[...route.slice(3).map((p)=>({x:p.x,z:p.z})),{x:rest.x,z:rest.z}],
    "the 04 checkpoint walks on from zhouExit[3] (the corner he stands on is behind him)");
  // What Zhou actually walks from the seat, measured with the same capsule and 52 deg rule as the data polyline.
  const runtime=[Sortie.leftSeat,...handover.route.slice(0,-1)],runtimeHits=RouteClearance(runtime,Solids("BunkerIntact"));
  let runtimeSlopeDeg=0,prevY=Walkable(runtime[0].x,runtime[0].z);
  for(let leg=1;leg<runtime.length;leg++){
    const a=runtime[leg-1],b=runtime[leg],length=Distance(a,b),steps=Math.ceil(length/.2);
    for(let i=1;i<=steps;i++){const t=i/steps,y=Walkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
      assert.ok(Math.abs(y-prevY)<=TAN52*(length/steps)+.03,`Zhou's runtime exit climbs a passable slope (${prevY.toFixed(2)} -> ${y.toFixed(2)})`);
      runtimeSlopeDeg=Math.max(runtimeSlopeDeg,Math.atan2(Math.abs(y-prevY),length/steps)*180/Math.PI);prevY=y;}
  }
  assert.deepEqual(runtimeHits,[],"Zhou's runtime exit is physically clear");
  assert.ok(runtime.length>=route.length&&Distance(runtime.at(-1),OPENING.zhouRest)<0.01,"Zhou's runtime exit is the whole access-trench polyline to zhouRest");
  report.zhouRuntimeExit={points:runtime.length,hits:runtimeHits,maxSlopeDeg:+runtimeSlopeDeg.toFixed(0),wired:true};
  report.zhouExitM=+RouteLength(route).toFixed(1);
  console.log(`ok wounded Zhou walks ${report.zhouExitM} m from the left gun down the access trench to the collection`);
}

// ---------------------------------------------------------------------------
// 1. 契约锚点站得住人
// ---------------------------------------------------------------------------
{
  const collapsed = Solids("BunkerCollapsed"), night = Solids("NightGate");
  const nightAnchors = new Set(["nightSpawn", "northGateApproach", "northGate", "gateInside"]);
  for (const [id, point] of Object.entries(S)) {
    const blocks = nightAnchors.has(id) ? night : collapsed;
    const y = Walkable(point.x, point.z);
    const buried = blocks.filter((box) => Hits(point.x, point.z, y, box, 0.34, 1.7)).map((b) => b.id);
    assert.deepEqual(buried, [], `contract anchor ${id} (${point.x},${point.z}) is buried`);
  }
  // 白天站在夜景那一片上，脚下必须是空地。
  for (const id of ["nightSpawn", "northGateApproach", "northGate", "gateInside"]) {
    const y = Walkable(S[id].x, S[id].z);
    assert.deepEqual(Solids("BunkerCollapsed").filter((box) => Hits(S[id].x, S[id].z, y, box, 0.34, 1.7))
      .map((b) => b.id), [], `${id} must be open ground before NightGateShown`);
  }
  console.log(`ok all ${Object.keys(S).length} contract anchors stand in open space`);
}

// ---------------------------------------------------------------------------
// 1b. 18 桥头人员的撤出折线也要走得通（它们不在 MISSION_STAGE_ROUTES 里，
//     以前谁都没量过）。实拍 2026-09-20：爆破手西那条的第一个点 (−80,178) 埋在
//     BridgeSouthCoverWest 那道 1.47 m 的掩体墙里 —— 他顶着墙走不出爆破区，
//     桥只能靠 blastFriendlyStuck 兜底晚二十秒才炸。
// ---------------------------------------------------------------------------
{
  const collapsed = Solids("BunkerCollapsed");
  const legs = [
    ...END.demolitionPullback.map((route, index) => [`demolitionPullback${index}`,
      [P.bridge.demolition[index], ...route]]),
    ["officerPullback", [P.bridge.officer, ...END.officerPullback]],
  ];
  for (const [name, route] of legs) {
    assert.deepEqual(RouteClearance(route, collapsed), [], `${name} 撤出折线被挡住了`);
    const last = route.at(-1);
    assert.ok(Distance(last, A.railBridge) > END.blastClearRadiusM,
      `${name} 的终点要在爆破清场半径之外，实际 ${Distance(last, A.railBridge).toFixed(1)} m`);
  }
  console.log("ok 18 桥头三个人的撤出折线走得通、终点在爆破清场半径之外");
}

// ---------------------------------------------------------------------------
// 2. 契约路线 0.35 m 胶囊净空
// ---------------------------------------------------------------------------
{
  const collapsed = Solids("BunkerCollapsed"), night = Solids("NightGate");
  for (const [name, route] of Object.entries(StageRoutes)) {
    const blocked = RouteClearance(route, name === "nightMarch" ? night : collapsed);
    assert.deepEqual(blocked, [], `${name} capsule route is not clear`);
    assert.ok(Routes[name] === route, `${name} is merged into MISSION_ROUTES`);
  }
  report.routeLengths = Object.fromEntries(Object.entries(StageRoutes)
    .map(([name, route]) => [name, +RouteLength(route).toFixed(1)]));
  report.walkSeconds = Object.fromEntries(["southWalk", "wallPath", "toBridge", "bridgeCrossing",
    "marchOut", "nightMarch"].map((name) => [name, +(RouteLength(StageRoutes[name]) / 1.4).toFixed(0)]));
  // 07 的目标时长是 45–75 秒（契约 §2）。这里只钉**长度**的上限 —— 配速归 Front
  // 玩法包（行军 2.2–2.6 m/s）：140 m 在 2.2 m/s 下是 64 s，还在窗口里；
  // 旧的 188 m 线连 2.6 m/s 都要 72 s，一慢就超。
  report.southWalkM = report.routeLengths.southWalk;
  assert.ok(report.southWalkM <= 140,
    `07 southWalk is 45-75 s of marching, not a hike: ${report.southWalkM} m`);
  assert.ok(report.southWalkM >= 110, `07 still walks a real stretch: ${report.southWalkM} m`);
  // 担架队跟着走同一条线：通行宽 1.25 m（两人抬）要过得去。
  const litterBlocked = RouteClearance(StageRoutes.southWalk, Solids("BunkerCollapsed"),
    { margin: 0.65 });
  assert.deepEqual(litterBlocked, [], "a two-bearer litter team walks 07 beside the player");
  // 旧 `south` 键与 07 合成一条（担架队与带路都读它）。
  assert.ok(Routes.south === StageRoutes.southWalk, "the legacy `south` route is the 07 walk itself");
  console.log("ok every contract route clears a 0.35 m capsule and is merged into MISSION_ROUTES",
    JSON.stringify(report.routeLengths));
}

// ---------------------------------------------------------------------------
// 3. 01 防炮洞：交通壕弯角外侧的单口低矮洞室，躺姿从洞里看出去是一条东向走廊
//    （杀俘位 8 m、岔口 J 15 m、折角 F 20 m），洞口塌土挡住 02 的还权位
// ---------------------------------------------------------------------------
if (!rearOnly) {
  const blocks = Solids("BunkerCollapsed");
  report.bunkerKillingM = +Distance(S.bunker, S.bunkerKilling).toFixed(2);
  report.bunkerMouthM = +Distance(S.bunker, S.bunkerDoor).toFixed(2);
  assert.ok(report.bunkerKillingM >= 6 && report.bunkerKillingM <= 9,
    `the kill spot reads at a glance: ${report.bunkerKillingM} m from the pinned spot`);
  assert.ok(report.bunkerMouthM >= 1.5 && report.bunkerMouthM <= 4, `a low dugout, the mouth is close: ${report.bunkerMouthM} m`);
  // 洞是挖进地里的坑，不是房子：洞底比自然地面低 1.8 m 以上，顶板压在自然地面上。
  const pit = Natural(S.bunker.x, S.bunker.z) - Ground(S.bunker.x, S.bunker.z);
  assert.ok(pit >= 1.8, `the dugout floor is dug into the trench wall: ${pit.toFixed(2)} m below natural`);
  const roof = Scenario.BunkerCollapsed.find((box) => box.id === "BunkerRoof");
  assert.ok(roof && Math.abs(roof.x - S.bunker.x) < 1.5 && Math.abs(roof.z - S.bunker.z) < 1.5, "a timber roof covers the dugout");
  // 躺姿三个眼高都看得见：杀俘位、岔口 J、折角 F（站着的人胸口 1.2）。
  const band = [];
  for (const eyeH of [0.35, 0.42, 0.50]) {
    const eye = Eye(S.bunker, eyeH);
    for (const [label, target] of [["killing", S.bunkerKilling], ["junction", S.bunkerJunction], ["fold", S.bunkerFold]]) {
      const blocker = SightBlocker(eye, { x: target.x, z: target.z, y: Ground(target.x, target.z) + 1.2 }, blocks);
      band.push({ eyeH, label, blocker });
      assert.equal(blocker, null, `prone eye ${eyeH} cannot see ${label} from the dugout (blocked by ${blocker})`);
    }
  }
  report.bunkerSight = band;
  // 行刑的人（两名日兵落点、被拖到杀俘位的川军）全身都在视野里。
  report.bunkerFullBody = [];
  for (const eyeH of [0.35, 0.42, 0.50]) {
    const eye = Eye(S.bunker, eyeH);
    for (const [label, point] of [["comrade", P.bunker.captives[0]], ["ijaA", P.bunker.ijaKill[0]], ["ijaB", P.bunker.ijaKill[1]]]) {
      for (const h of [0.35, 0.9, 1.75]) {
        const blocker = SightBlocker(eye, { x: point.x, z: point.z, y: Ground(point.x, point.z) + h }, blocks);
        assert.equal(blocker, null, `prone eye ${eyeH} sees ${label} at ${h} m (blocked by ${blocker})`);
      }
      if (eyeH === 0.42) report.bunkerFullBody.push({ label, d: +Distance(S.bunker, point).toFixed(2) });
    }
  }
  // 单口：洞口朝东。向北、向南、向西看出去都是洞壁（坑壁地形或护壁），只有东向那条走廊开着。
  const eye = Eye(S.bunker, 0.42);
  report.bunkerOcclusion = [["north", { x: S.bunker.x + 1, z: S.bunker.z - 8 }], ["south", { x: S.bunker.x + 1, z: S.bunker.z + 8 }],
    ["west", { x: S.bunker.x - 8, z: S.bunker.z }], ["north-east off the trench", { x: S.bunkerKilling.x, z: S.bunkerKilling.z - 7 }]]
    .map(([label, target]) => ({ label, blocker: SightBlocker(eye, { x: target.x, z: target.z, y: Ground(target.x, target.z) + 1.2 }, blocks) }));
  for (const row of report.bunkerOcclusion) assert.ok(row.blocker, `the dugout walls must close the ${row.label} view`);
  // 02 还权位：塌土挡住折角 F 与岔口 J 的直射。
  for (const [label, target] of [["fold", S.bunkerFold], ["junction", S.bunkerJunction]])
    assert.ok(SightBlocker(Eye(S.bunkerRear, 1.0), { ...target, y: Ground(target.x, target.z) + 1.5 }, blocks),
      `the mouth spoil shields the return spot from the ${label}`);
  const spoil = Scenario.BunkerCollapsed.find((box) => box.id === "BunkerMouthSpoil");
  assert.ok(spoil && spoil.solid !== false, "the mouth spoil is a real collider");
  // 步枪在够得着的地方（木架压住时够不着，是木架的事）。
  const reach = Distance(P.bunker.player, P.bunker.rifle);
  assert.ok(reach < 1.5, `the kicked rifle is within reach: ${reach.toFixed(2)} m`);
  for (const pin of P.bunker.pinnedFrame)
    assert.ok(Scenario.BunkerCollapsed.some((box) => box.solid !== false
      && Math.abs(box.x - pin.x) < 1 && Math.abs(box.z - pin.z) < 1), "pinning frame is a real solid");
  // 何有田从弯角内侧（塌低段后）能打到杀俘位；刘文财的远射位隔着弹坑唇看得见岔口 J。
  assert.equal(SightBlocker(Eye(P.bunker.heyoutianFire, 1.1),
    { ...S.bunkerKilling, y: Ground(S.bunkerKilling.x, S.bunkerKilling.z) + 1.2 }, blocks), null,
  "He Youtian's position can fire at the kill spot");
  assert.deepEqual(RouteClearance(P.bunker.rescueRoute, blocks), [],
    "Luo and He come down from the rear corner past the mouth spoil to the kill spot");
  assert.equal(SightBlocker(Eye(P.bunker.liuwencaiShot, 1.5),
    { ...S.bunkerJunction, y: Ground(S.bunkerJunction.x, S.bunkerJunction.z) + 1.3 }, blocks), null,
  "Liu Wencai's long shot reaches the junction J down the east-west leg");
  // 还权位的塌土是掩体（契约 §4：碰撞 + 掩体标签），朝着追兵开火的连接支沟（J、F）。
  const mouthSpoil = Scenario.BunkerCollapsed.find((box) => box.id === "BunkerMouthSpoil");
  assert.ok(mouthSpoil?.cover && mouthSpoil.solid !== false, "the mouth spoil is a solid cover in the collapsed state");
  const toFold = Math.atan2(S.bunkerFold.z - mouthSpoil.z, S.bunkerFold.x - mouthSpoil.x), face = Math.atan2(mouthSpoil.cover.faceZ, mouthSpoil.cover.faceX);
  assert.ok(Math.abs(Math.atan2(Math.sin(face - toFold), Math.cos(face - toFold))) < 0.4, "the spoil's cover faces the fold F");
  report.bunkerRifleReachM = +reach.toFixed(2);
  console.log("ok dugout: single east mouth, prone sightlines to kill spot/J/F, closed flanks, spoil shields the return spot");
}

// ---------------------------------------------------------------------------
// 4. 背坡伤员集结处：站姿看不见前沿
// ---------------------------------------------------------------------------
{
  const blocks = Solids("BunkerCollapsed");
  const from = Eye(S.collection, 1.6);
  const hidden = [["gun", A.gun], ["bunkerKilling", S.bunkerKilling], ["north", { x: -39, z: -160 }],
    ["bunkerDoor", S.bunkerDoor]];
  report.collectionCover = hidden.map(([label, target]) => ({ label,
    blocker: SightBlocker(from, Eye(target, 1.6), blocks) }));
  for (const row of report.collectionCover)
    assert.ok(row.blocker, `the back slope must hide ${row.label} from the collection point`);
  // orders 与 collection 同区，且场坪放得下担架队。
  assert.ok(Distance(A.orders, S.collection) < 12, "the orders anchor moved to the collection point");
  for (const litter of P.collection.litters) {
    assert.ok(Distance(litter, S.collection) < 14, "litters stand on the collection pad");
    const y = Walkable(litter.x, litter.z);
    // 担架 0.7 x 1.85，两人抬：按 1.0 x 1.4 的半尺寸量净空。
    assert.deepEqual(blocks.filter((box) => Hits(litter.x, litter.z, y, box, 0.5, 1.7)).map((b) => b.id),
      [], "a litter fits where it is placed");
  }
  console.log("ok reverse slope hides the front from the collection point",
    JSON.stringify(report.collectionCover));
}

// ---------------------------------------------------------------------------
// 5. 主街障碍：人过得去、担架过不去
// ---------------------------------------------------------------------------
{
  const Named = (id) => Layout.blocks.find((box) => box.id === id);
  const west = Named("StreetBlockFallenWall"), east = Named("StreetBlockCart");
  const gap = (east.x - east.w / 2) - (west.x + west.w / 2);
  report.streetGapM = +gap.toFixed(2);
  assert.ok(gap >= 0.72 && gap <= 1.0, `the man-gap is a squeeze, not a door: ${gap.toFixed(2)} m`);
  assert.ok(gap > 0.68, "a 0.34 m radius player capsule fits through the gap");
  assert.ok(gap < 1.25, "a two-bearer litter team does not fit through the gap");
  // 障碍真的横跨整条街（两侧都顶到临街墙）。
  const streetWest = Named("CourtyardEast"), streetEast = Named("StreetEastWallSouthA");
  assert.ok(west.x - west.w / 2 <= streetWest.x + streetWest.w / 2 + 0.6, "the fallen wall reaches the west frontage");
  assert.ok(east.x + east.w / 2 >= streetEast.x - streetEast.w / 2 - 0.6, "the cart reaches the east frontage");
  assert.ok(west.h >= 1.2 && east.h >= 1.5, "neither half is a step-over");
  // 东侧那扇窗能打到障碍北侧的主街。
  const blocks = Solids("BunkerCollapsed");
  const windowEye = { x: 82, z: 5, y: Ground(82, 5) + 1.3 };
  const northOfBlock = { x: 76.65, z: 12, y: Ground(76.65, 12) + 1.3 };
  assert.equal(SightBlocker(windowEye, northOfBlock, blocks.filter((b) => !/StreetEastWindow/.test(b.id))),
    null, "the east window covers the street north of the obstacle");
  // 担架等待的遮挡是真遮挡。
  for (const [label, threat] of [["obstacle", { x: 76.65, z: 20 }], ["window", { x: 82, z: 5 }]])
    assert.ok(SightBlocker(Eye(threat, 1.4), Eye(S.litterHold, 1.4), blocks),
      `litterHold is hidden from the ${label}`);
  // 绕行长度：内院门出来到接回主街。
  report.villageBypassM = +RouteLength(StageRoutes.courtyardBypass).toFixed(1);
  assert.ok(S.streetRejoin.z > 20, "the column rejoins the street south of the obstacle");
  console.log("ok street block: 0.9 m man-gap, no litter, covered wait, east window over the north street",
    JSON.stringify({ gap: report.streetGapM, bypassM: report.villageBypassM }));
}

// ---------------------------------------------------------------------------
// 6. 牛车：cartRide 全程对 2.5 x 2.9 m 车盒净空
// ---------------------------------------------------------------------------
{
  const blocked = RouteClearance(StageRoutes.cartRide, Solids("BunkerCollapsed"),
    { boxHalf: [1.25, 1.45], ceiling: 2.2 });
  assert.deepEqual(blocked, [], "the ox cart clears the bridgehead road");
  assert.ok(S.cartHalt.z < River.z - River.floorHalfW - River.bankRun,
    "the cart halts north of the North Sha He, not on its bank");
  assert.ok(P.cartBays.every((bay) => RiverCutAt(bay.x, bay.z) === 0), "no cart bay sits in the river channel");
  // 停着的牛车不是布局体块（Script_FirstLevelMissionView 直接挂物理），所以上面那趟
  // 净空看不见它们。车体 3 x 5.8 m：锚点与路线都得让开半宽 1.5 + 胶囊 0.34。
  for (const [id, point] of Object.entries(S)) for (const bay of P.cartBays)
    assert.ok(Math.abs(point.x - bay.x) > 1.9 || Math.abs(point.z - bay.z) > 3.3,
      `anchor ${id} stands inside the parked cart at ${bay.x},${bay.z}`);
  for (let i = 1; i < StageRoutes.cartRide.length; i++) {
    const a = StageRoutes.cartRide[i - 1], b = StageRoutes.cartRide[i];
    const length = Distance(a, b);
    for (let d = 0; d <= length; d += 0.4) {
      const t = d / length, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const bay of P.cartBays.slice(1))
        assert.ok(Math.abs(x - bay.x) > 1.9 || Math.abs(z - bay.z) > 3.3,
          `the cart lane runs through the cart parked at ${bay.x},${bay.z}`);
    }
  }
  report.cartRideM = +RouteLength(StageRoutes.cartRide).toFixed(1);
  console.log("ok cart ride clears a 2.5x2.9 m cart and halts north of the river", report.cartRideM + " m");
}

// ---------------------------------------------------------------------------
// 7. 15B 夹道净宽 2.5–3 m、坎低于 stepMax、院门过得了担架
// ---------------------------------------------------------------------------
{
  const Named = (id) => Layout.blocks.find((box) => box.id === id);
  const yard = Named("WallPathYardWall"), low = Named("WallPathLowWall");
  const clear = (low.z - low.d / 2) - (yard.z + yard.d / 2);
  report.wallPathWidthM = +clear.toFixed(2);
  assert.ok(clear >= 2.5 && clear <= 3.0, `the 15B lane is 2.5-3 m wide: ${clear.toFixed(2)}`);
  assert.ok(yard.h >= 2.7, "one side is a continuous yard wall");
  assert.ok(low.h >= 1.0 && low.h <= 1.3, "the other side is a low wall");
  const bump = Named("WallPathBump");
  assert.ok(bump.h > 0.18 && bump.h < TRAVERSAL.stepMax, `the lane bump is walked over: ${bump.h}`);
  // 一个左拐：西行之后转向南。
  const lane = StageRoutes.wallPath;
  const heading = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);
  const turn = heading(lane[2], lane[3]) - heading(lane[1], lane[2]);
  assert.ok(Math.abs(Math.abs(turn) - Math.PI / 2) < 0.4, "the lane makes one square turn");
  // 门槛。
  const threshold = Named("WardThreshold");
  assert.ok(threshold.h >= 0.12 && threshold.h <= 0.18, `ward threshold height: ${threshold.h}`);
  assert.ok(threshold.h < TRAVERSAL.stepMax, "the ward threshold is walked over, not vaulted");
  assert.ok(Math.abs(threshold.z - Reception.wardThreshold.z) < 0.01, "the threshold sits in the ward door");
  // 院门净宽够担架（0.7 m 宽、两人抬）。
  const north = Named("ReceptionEastNorth"), south = Named("ReceptionEastSouth");
  const gate = (south.z - south.d / 2) - (north.z + north.d / 2);
  report.receptionGateM = +gate.toFixed(2);
  assert.ok(gate >= 3.2, `the reception gate passes a litter: ${gate.toFixed(2)} m`);
  assert.ok(Math.abs(S.receptionGate.x - north.x) < 0.01 && S.receptionGate.z > north.z + north.d / 2
    && S.receptionGate.z < south.z - south.d / 2, "the receptionGate anchor stands in the gateway");
  const bedside=P.receptionYard.yaowaBedside,ward=Reception.ward;
  assert.ok(bedside.x>ward.minX+CAPSULE_R&&bedside.x<ward.maxX-CAPSULE_R
    &&bedside.z>ward.minZ+CAPSULE_R&&bedside.z<ward.maxZ-CAPSULE_R,
  "Yaowa's bedside post leaves a full capsule inside the ward");
  const bedsideDistance=Math.hypot(bedside.x-A.zhouDrop.x,bedside.z-A.zhouDrop.z);
  assert.ok(bedsideDistance>1.8&&bedsideDistance<2.4,
    `Yaowa stays beside Zhou without occupying the player's rear handle: ${bedsideDistance.toFixed(2)} m`);
  assert.deepEqual(RouteClearance([...Routes.reception,bedside],Solids("BunkerCollapsed")),[],
    "Yaowa walks to the bedside post through the real ward route");
  console.log("ok 15B lane, bump, ward threshold and reception gateway",
    JSON.stringify({ lane: report.wallPathWidthM, bump: bump.h, threshold: threshold.h,
      gate: report.receptionGateM,bedsideM:+bedsideDistance.toFixed(2) }));
}

// ---------------------------------------------------------------------------
// 8. 浮桥：21 条船、三段桥面、中间被炸段可炸、炸后断口不可通行（2026-09-30 浮桥取代铁路桥，docs/Data_PontoonBridge.md）
// ---------------------------------------------------------------------------
{
  const deck = Layout.walkableSurfaces.find((surface) => surface.id === "PontoonBridgeDeck");
  assert.ok(deck, "the blasted section's deck is a walkable surface");
  assert.ok(Math.abs(deck.z - Pontoon.blast.centerZ) < 0.01 && Math.abs(deck.d - 2 * Pontoon.deckHalfD) < 0.01,
    "PontoonBridgeDeck is the blasted section, centred where the charges are");
  assert.equal(Pontoon.z, Pontoon.blast.centerZ, "the bridge centre is the blast centre");
  assert.deepEqual([S.railBridge.x, S.railBridge.z], [Pontoon.x, Pontoon.z], "the railBridge anchor (key kept) is the blasted section's centre");
  // 桥面整体（南截 + 被炸段 + 北截）连续、无缝，从北栈终点盖到南栈起点，并且跨过整条拓宽的河（北岸沿到南水线）。
  const decks = Layout.walkableSurfaces.filter((surface) => Math.abs(surface.x - Pontoon.x) < 0.01
    && surface.id !== "TemporaryBridge").sort((a, b) => a.z - b.z);
  assert.equal(decks.length, 3, "north section, blasted section and south section carry the deck");
  for (let i = 1; i < decks.length; i++)
    assert.ok(Math.abs((decks[i - 1].z + decks[i - 1].d / 2) - (decks[i].z - decks[i].d / 2)) < 0.01,
      `decks ${decks[i - 1].id} and ${decks[i].id} meet without a gap`);
  const north = decks[0].z - decks[0].d / 2, south = decks.at(-1).z + decks.at(-1).d / 2;
  assert.ok(Math.abs(north - PONTOON_HEADS.north) < 0.01 && Math.abs(south - PONTOON_HEADS.south) < 0.01, "the deck runs exactly from head to head");
  const reach = RiverReachAt(Pontoon.x), water = RiverWaterAt(Pontoon.x);
  assert.ok(reach, "the pontoon bridge stands in the widened reach");
  assert.ok(north <= reach.crestZ && south >= water.z1 + 2, "the deck spans the whole water, north bank crest to the south mud flat");
  report.pontoonSpanM = +(south - north).toFixed(1);
  // 船：21 条、间距 3 m、每条都在水里（中心在南北水线之间），被炸的 5 条以桥心为中心，被炸段 = 船 3…11 的桥面。
  const B = Pontoon.boats, boatZ = (i) => B.firstZ - i * B.pitchZ;
  assert.equal(B.count, 21, "21 boats");
  for (let i = 0; i < B.count; i++)
    assert.ok(boatZ(i) > water.z0 + 0.5 && boatZ(i) < water.z1, `boat ${i} floats in the water (z ${boatZ(i)}, water ${water.z0.toFixed(1)}..${water.z1.toFixed(1)})`);
  const blastedMid = (boatZ(B.blasted[0]) + boatZ(B.blasted[1])) / 2;
  assert.equal(blastedMid, Pontoon.z, "the five blasted boats are centred on the bridge centre");
  assert.equal(B.blasted[1] - B.blasted[0] + 1, 5, "five boats are blown apart");
  assert.deepEqual([...B.sinking], [B.blasted[0] - 2, B.blasted[0] - 1, B.blasted[1] + 1, B.blasted[1] + 2], "two boats each side tilt and sink");
  const gate = Pontoon.spans.find((span) => span.blasted);
  assert.equal(gate.z0, boatZ(B.sinking[0]) + B.pitchZ / 2, "the blasted section starts at the first sinking boat's south edge");
  assert.equal(gate.z1, boatZ(B.sinking[3]) - B.pitchZ / 2, "and ends at the last sinking boat's north edge");
  assert.equal(2 * Pontoon.deckHalfD, gate.z0 - gate.z1, "deckHalfD is half the blasted section");
  // 桥面顶比水面高 0.5 m（水面 = 南岸自然地面下 1 m），船身长 6–7 m、宽 1.6–2 m。
  const waterTop = Natural(Pontoon.x, River.z) + water.level;
  assert.ok(Math.abs(Pontoon.deckTopY - (waterTop + 0.5)) < 0.05, `the deck stands 0.5 m over the water: ${(Pontoon.deckTopY - waterTop).toFixed(2)}`);
  assert.ok(B.length >= 6 && B.length <= 7 && B.beam >= 1.6 && B.beam <= 2, "flat-bottomed boats 6-7 m long, 1.6-2 m wide");
  assert.ok(Pontoon.deckW >= 2.6 && Pontoon.deckW <= 3, "the deck is 2.6-3 m wide");
  // 上下桥没有台阶（两个桥头）。
  for (const z of [north - 1, south + 1]) {
    const step = Math.abs(Pontoon.deckTopY - Ground(Pontoon.x, z));
    assert.ok(step < TRAVERSAL.stepMax, `stepping onto the deck at z=${z}: ${step.toFixed(2)} m`);
  }
  const intact = Layout.gates.filter((g) => g.signal === Pontoon.signal);
  const wreck = Layout.gates.filter((g) => g.appearSignal === Pontoon.signal);
  assert.equal(intact.length, 3, "the intact blasted section has its deck and two rope-rail pieces");
  assert.equal(wreck.length, 2, "the broken bridge has an air wall at each cut end");
  assert.ok(intact.some((g) => g.walkableId === "PontoonBridgeDeck"),
    "the blasted section's deck leaves walkableSurfaces when the bridge goes");
  assert.ok(wreck.every((g) => g.tag === "airWall") && intact.filter((g) => /Rail/.test(g.id)).every((g) => g.tag === "airWall"),
    "rails and cut walls only stop characters, never bullets or sight");
  // 炸后：被炸段上没有任何别的可走面；南北两截永久留着（桥不是整座消失）。
  const others = Layout.walkableSurfaces.filter((surface) => surface.id !== "PontoonBridgeDeck"
    && Math.abs(surface.x - Pontoon.x) < 8
    && surface.z + surface.d / 2 > Pontoon.z - Pontoon.deckHalfD + 0.01
    && surface.z - surface.d / 2 < Pontoon.z + Pontoon.deckHalfD - 0.01);
  assert.deepEqual(others.map((s2) => s2.id), [], "nothing else carries a man over the blasted section at x=-77");
  assert.ok(decks.at(-1).z - decks.at(-1).d / 2 >= Pontoon.z + Pontoon.deckHalfD - 0.01, "the south stub ends at the cut");
  assert.ok(decks[0].z + decks[0].d / 2 <= Pontoon.z - Pontoon.deckHalfD + 0.01, "the north stub ends at the cut");
  // 断口两端的空气墙落在两截桥面之内（不然炸前会把桥面挡在中间）。
  for (const g of wreck) { const off = Math.abs(g.z - Pontoon.z);
    assert.ok(off >= Pontoon.deckHalfD + 0.2 && off <= Pontoon.deckHalfD + 0.5, `cut wall ${g.id} stands just inside its stub`); }
  // 铁路：在河口前收尾（北段止于 z 66、南段从 z 184 起），河那一段不铺道砟 / 枕木 / 钢轨。
  const gaps = Layout.railway.railGaps[0];
  assert.deepEqual(gaps, Pontoon.railGapZ.map((z) => z + 186), "the ballast and rails break over the whole river");
  assert.ok(Pontoon.railGapZ[0] <= reach.crestZ - 20 && Pontoon.railGapZ[0] >= reach.crestZ - 30, "the north rail ends 20-30 m short of the north bank");
  assert.ok(Pontoon.railGapZ[1] >= water.z1 + 20 && Pontoon.railGapZ[1] <= water.z1 + 30, "the south rail starts 20-30 m past the waterline");
  for (const id of ["RailBufferNorthBeam", "RailBufferSouthBeam"])
    assert.ok(Layout.blocks.some((b) => b.id === id && b.solid === false), `${id} marks the end of the line`);
  assert.equal(Layout.blocks.filter((b) => /RailBridge/.test(b.id)).length, 0, "no steel-bridge piece is left in the layout");
  console.log("ok pontoon bridge: 21 boats over the widened channel, blasted section is destructible, rails stop short of the river",
    JSON.stringify({ spanM: report.pontoonSpanM, intact: intact.length, wreck: wreck.length }));
}

// ---------------------------------------------------------------------------
// 9. 18 的视线与爆破安全距离（2026-09-30 浮桥：射位在南岸烂泥垄后，蹲下被垄挡住、站起越过它看浮桥）
// ---------------------------------------------------------------------------
{
  const blocks = Solids("BunkerCollapsed");
  const deckTop = { x: Pontoon.x, z: Pontoon.z, y: Pontoon.deckTopY + 0.8 };
  const cover = Eye(S.bridgeCover, 1.62), blast = Eye(S.blastSafe, 1.6);
  // 桥头（北岸）土坎后面的机枪手在桥轴西侧；桥头的步枪手（BridgeNorthB 一带）站在桥轴上，沿桥面看得见桥心与南桥头。
  const axis = MISSION_ENCOUNTERS.bridgeNorth.find((member) => member.id === "BridgeNorthB");
  const sight = {
    coverToDeck: SightBlocker(cover, deckTop, blocks),
    coverToHead: SightBlocker(cover, { x: S.bridgeSouthEnd.x, z: S.bridgeSouthEnd.z, y: Pontoon.deckTopY + 0.8 }, blocks),
    coverToEnemy: SightBlocker(cover, Eye(S.bridgeEnemy, 1.6), blocks),
    blastToDeck: SightBlocker(blast, deckTop, blocks),
    enemyToDeck: SightBlocker(Eye(axis, 1.6), deckTop, blocks),
    enemyToSouthEnd: SightBlocker(Eye(axis, 1.6), Eye(S.bridgeSouthEnd, 1.2), blocks),
  };
  report.bridgeSight = sight;
  for (const [key, blocker] of Object.entries(sight))
    assert.equal(blocker, null, `${key} must be a clear line: blocked by ${blocker}`);
  // 射位在烂泥垄后（地形 raise，BridgeMudRidge*）：蹲下去（眼高 1.05）断线，站起来（1.62）才越得过它看到浮桥与对岸。
  // 垄顶比射位地面高 0.9–1.4 m，垄的范围 x −105…−86，离射位 2–5 m。
  let crestY = -Infinity, crestAt = null;
  for (let x = -108; x <= -83; x += 0.5) for (let z = 168; z <= 176; z += 0.25) {
    const y = Ground(x, z);
    if (y > crestY) { crestY = y; crestAt = { x, z }; }
  }
  const ridgeOver = crestY - Ground(S.bridgeCover.x, S.bridgeCover.z);
  report.mudRidgeOverGroundM = +ridgeOver.toFixed(2);
  assert.ok(ridgeOver >= 0.9 && ridgeOver <= 1.4, `the mud ridge is 0.9-1.4 m over the firing spot: ${ridgeOver.toFixed(2)} at ${JSON.stringify(crestAt)}`);
  assert.ok(Distance(crestAt, S.bridgeCover) <= 8, "the highest point of the ridge is close to the firing spot");
  assert.ok(SightBlocker(Eye(S.bridgeCover, 1.05), deckTop, blocks), "the mud ridge breaks a crouched (1.05 m eye) line to the blasted section");
  assert.ok(SightBlocker(Eye(S.bridgeCover, 1.05), Eye(S.bridgeEnemy, 1.6), blocks), "the mud ridge breaks a crouched line to the gunner");
  // 射位离南桥头 10–20 m，离被炸段中心 ≥ 37 m（射位不在爆破清场圈里；起爆前玩家仍要退到 blastSafe）。
  const headM = Distance(S.bridgeCover, S.bridgeSouthEnd), coverBlastM = Distance(S.bridgeCover, S.railBridge);
  report.coverToHeadM = +headM.toFixed(1); report.coverToBlastM = +coverBlastM.toFixed(1);
  assert.ok(headM >= 10 && headM <= 20, `the firing spot is 10-20 m from the south head: ${headM.toFixed(1)}`);
  assert.ok(coverBlastM > END.blastClearRadiusM, `the firing spot is outside the blast clear radius: ${coverBlastM.toFixed(1)}`);
  const Named = (id) => Layout.blocks.find((box) => box.id === id);
  const ridge = Named("BridgeNorthRidgeWest");
  assert.ok(ridge && ridge.h >= 1.1 && ridge.h <= 1.7, `north ridge is a 1.1-1.6 m parapet: ${ridge?.h}`);
  assert.ok(SightBlocker(Eye(S.bridgeEnemy, 0.9), deckTop, blocks), "north ridge breaks a crouched line");
  // 南岸没有堤了（R3 撤掉 BridgeLevee*）：射位以外的南岸自然地面之上不再有 1 m 以上的凸起（烂泥垄除外，它在射位北面）。
  for (const x of [-79, -76, -73]) assert.ok(Ground(x, 173) - Natural(x, 173) < 0.2,
    `no levee or railway embankment in the bridgehead gap at x=${x}: ${(Ground(x, 173) - Natural(x, 173)).toFixed(2)}`);
  const blastM = Distance(S.blastSafe, S.railBridge);
  report.blastSafeM = +blastM.toFixed(1);
  assert.ok(blastM >= 40, `the blast-safe position is at least 40 m from the blasted section's centre: ${blastM.toFixed(1)}`);
  assert.ok(Named("BlastSafeBank"), "the blast-safe position has its own cover");
  console.log("ok bridge firing lines, south mud ridge (crouch cut), north ridge and a 40 m blast stand-off", JSON.stringify(
    { blastSafeM: report.blastSafeM, ridgeOverM: report.mudRidgeOverGroundM, coverToHeadM: report.coverToHeadM,
      coverToEnemyM: +Distance(S.bridgeCover, S.bridgeEnemy).toFixed(1) }));
}

// ---------------------------------------------------------------------------
// 10. 关尾夜景片白天不存在
// ---------------------------------------------------------------------------
{
  const nightState = Layout.scenario.states.find((state) => state.signal === "NightGateShown");
  assert.ok(nightState, "the night slice hangs off NightGateShown");
  const earlier = new Set(Layout.scenario.states.filter((state) => state !== nightState)
    .flatMap((state) => state.blocks.map((block) => block.id)));
  assert.ok(NightIds.length >= 12, "the north gate slice is more than a marker");
  for (const id of NightIds) {
    assert.ok(!earlier.has(id), `${id} must not exist before NightGateShown`);
    assert.ok(!Layout.blocks.some((block) => block.id === id), `${id} must not be a permanent block`);
    assert.ok(!Layout.gates.some((gate) => gate.id === id), `${id} must not be a permanent gate`);
  }
  const wall = nightState.blocks.find((block) => block.id === "NightWallWest");
  assert.ok(wall.h >= 8 && wall.h <= 10, `the city wall stands 8-10 m: ${wall.h}`);
  const east = nightState.blocks.find((block) => block.id === "NightWallEast");
  const opening = (east.x - east.w / 2) - (wall.x + wall.w / 2);
  report.northGateOpeningM = +opening.toFixed(2);
  assert.ok(opening >= 3.6 && opening <= 4.2, `the gateway is ~3.8 m clear: ${opening.toFixed(2)}`);
  assert.ok(nightState.blocks.some((block) => /Barbican/.test(block.id)), "a simplified barbican mass stands outside");
  assert.equal(P.night.braziers.length, nightState.blocks.filter((block) => /^NightBrazier/.test(block.id)).length,
    "every brazier placement has a whitebox body");
  // 全片都在 bounds 里（第二波收缩 bounds 时要保留它）。
  for (const block of nightState.blocks.filter((b) => NightIds.includes(b.id))) {
    assert.ok(block.x - block.w / 2 > Layout.bounds.minX && block.x + block.w / 2 < Layout.bounds.maxX
      && block.z - block.d / 2 > Layout.bounds.minZ && block.z + block.d / 2 < Layout.bounds.maxZ,
    `${block.id} stays inside the level bounds`);
  }
  console.log("ok the north gate night slice is absent by day and inside bounds",
    JSON.stringify({ blocks: NightIds.length, openingM: report.northGateOpeningM }));
}

// ---------------------------------------------------------------------------
// 11. 北沙河：浅滩与两座桥之外处处不可横穿（原断面 + 2026-09-30 拓宽河段 RailBridgeReach）
// ---------------------------------------------------------------------------
{
  assert.ok(Layout.terrainSpec.rivers?.includes(River), "the river is data on the terrain spec");
  const reachDef = River.reaches[0];
  // 原断面：全宽 24–34 m。拓宽河段：水面 60–70 m、河口（北岸沿→沙滩南端）70–85 m。
  const width = 2 * (River.floorHalfW + River.bankRun);
  report.riverWidthM = width;
  assert.ok(width >= 24 && width <= 34, `the original channel is 24-34 m wide: ${width}`);
  const reach = RiverReachAt(Pontoon.x);
  const water = RiverWaterAt(Pontoon.x);
  report.reachWaterWidthM = +(water.z1 - water.z0).toFixed(1);
  report.reachMouthWidthM = +(reach.shoreZ - reach.crestZ).toFixed(1);
  assert.ok(report.reachWaterWidthM >= 60 && report.reachWaterWidthM <= 70, `the widened reach carries 60-70 m of water: ${report.reachWaterWidthM}`);
  assert.ok(report.reachMouthWidthM >= 70 && report.reachMouthWidthM <= 85, `the widened mouth is 70-85 m: ${report.reachMouthWidthM}`);
  // 只往北拓宽：南岸自然地面位置（河口南沿）与原断面差 < 3 m。
  assert.ok(Math.abs(reach.shoreZ - (River.z + River.floorHalfW + River.bankRun)) < 3, "the south bank does not move");
  assert.ok(reach.crestZ < River.z - River.floorHalfW - River.bankRun - 40, "the north bank moved ~50 m north");
  // 逐米扫：每个 x（浅滩与两桥除外）河槽的北岸都是一道斜率 > tan52° 且落差 ≥ 1.5 m 的坎（下去就上不来），
  // 南侧同样是这样一道坎，**或者**该处水线有空气墙（拓宽段的南岸是缓沙滩，过渡带里南岸坡在 50°上下，
  // 靠空气墙拦住下水）—— 所以任何一点都过不了河。原断面两侧都是 63° 的岸。
  const TanOf = (x, z0, z1) => { let worst = 0, rise = 0, prev = RiverCutAt(x, z0);
    for (let z = z0 + 0.25; z <= z1; z += 0.25) { const c = RiverCutAt(x, z), slope = Math.abs(c - prev) / 0.25;
      if (slope > TAN52) rise += Math.abs(c - prev); worst = Math.max(worst, slope); prev = c; }
    return { worst, rise }; };
  const soft = [];
  for (let x = Layout.bounds.minX + 6; x <= Layout.bounds.maxX - 6; x += 1) {
    if (River.crossings.some((crossing) => Math.abs(x - crossing.x) <= crossing.halfW)) continue;
    // 槽底（最深处）的 z：取全断面最大 cut 的中点。
    let deepest = 0, zBed = River.z;
    for (let z = 60; z <= 180; z += 0.25) { const c = RiverCutAt(x, z); if (c > deepest + 1e-9) { deepest = c; zBed = z; } }
    let north = TanOf(x, 60, zBed), south = TanOf(x, zBed, 180);
    const Walled = (pattern) => Layout.blocks.some((box) => box.tag === "airWall" && pattern.test(box.id)
      && Math.abs(box.x - x) <= box.w / 2);
    const walled = Walled(/^BridgeShoreAirWall/) && Walled(/^BridgeNorthBankAirWall/);
    if (deepest < 3 || north.rise < 1.5 || (south.rise < 1.5 && !walled)) soft.push(`${x}:${deepest.toFixed(1)}/${north.rise.toFixed(1)}/${south.rise.toFixed(1)}`);
  }
  assert.deepEqual(soft, [], "the channel is only crossable at the ford and the two bridges");
  // 拓宽段南岸烂泥滩走得下去（缓坡），但水线以下是走不回来的陡坎，且水线有空气墙；北岸岸沿同样有墙
  //（陡坡本身拦不住真胶囊，见 Layout 里空气墙那一段的注释与 TopologyBrowserTest 的 shore 实测）。
  {
    let beachWorst = 0, prev = RiverCutAt(Pontoon.x, reach.shoreZ);
    for (let z = reach.shoreZ - 0.25; z >= reach.waterZ; z -= 0.25) {
      const c = RiverCutAt(Pontoon.x, z); beachWorst = Math.max(beachWorst, Math.abs(c - prev) / 0.25); prev = c; }
    report.beachWorstSlope = +beachWorst.toFixed(2);
    assert.ok(beachWorst < TAN52 * 0.4, `the beach is a gentle walk to the waterline: worst slope ${beachWorst.toFixed(2)}`);
    const walls = Layout.blocks.filter((box) => box.tag === "airWall" && /^BridgeShoreAirWall/.test(box.id));
    const northWalls = Layout.blocks.filter((box) => box.tag === "airWall" && /^BridgeNorthBankAirWall/.test(box.id));
    assert.ok(walls.length >= 25 && northWalls.length === walls.length, `the widened shore has a waterline air wall on both banks: ${walls.length} + ${northWalls.length} pieces`);
    assert.ok(northWalls.every((box) => box.visual === false && RiverCutAt(box.x, box.z + box.d / 2 + 0.05) < 1.6),
      "north bank air walls are invisible and stand on the bank top, not in the channel");
    assert.ok(walls.every((box) => box.visual === false), "shore air walls are invisible");
    // 水线南沿（z1）与墙之间是可走的沙，墙在水线南 0–3.5 m。
    for (const wall of walls.filter((box) => Math.abs(box.x - Pontoon.x) < 30)) {
      const z1 = RiverWaterAt(wall.x).z1, gap = (wall.z - wall.d / 2) - z1;
      assert.ok(gap >= -0.3 && gap <= 2.6, `air wall ${wall.id} sits ${gap.toFixed(2)} m off the waterline`);
    }
    // 墙不横跨任何路线（尾队沿 x=−77 走桥面，桥两侧 3.4 m 内不摆墙，桥面两侧另有绳栏空气墙）。
    for (const [name, route] of Object.entries(Routes)) for (let i = 1; i < route.length; i++) {
      const allWalls = [...walls, ...northWalls];
      const a2 = route[i - 1], b2 = route[i], n = Math.ceil(Distance(a2, b2) / 0.5);
      for (let k = 0; k <= n; k++) {
        const p = { x: a2.x + (b2.x - a2.x) * k / (n || 1), z: a2.z + (b2.z - a2.z) * k / (n || 1) };
        const hit = allWalls.find((wall) => Math.abs(p.x - wall.x) < wall.w / 2 + 0.35 && Math.abs(p.z - wall.z) < wall.d / 2 + 0.35);
        assert.ok(!hit, `route ${name} crosses shore air wall ${hit?.id}`);
      }
    }
  }
  // 浅滩真的走得下去（西沟的撤离线从那儿过河）。
  const ford = River.fords[0];
  const fordProfile = RiverProfileAt(ford.x);
  assert.ok(1.5 * fordProfile.depth / fordProfile.bankRun < TAN52, "the ford banks are walkable");
  let worst = 0;
  const evacuation = Routes.evacuation;
  for (let i = 1; i < evacuation.length; i++) {
    const a = evacuation[i - 1], b = evacuation[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d < length; d += 0.75) {
      const t = d / length, t2 = Math.min(1, (d + 0.75) / length);
      const p0 = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const p1 = { x: a.x + (b.x - a.x) * t2, z: a.z + (b.z - a.z) * t2 };
      worst = Math.max(worst, Math.abs(Ground(p1.x, p1.z) - Ground(p0.x, p0.z)) / (Distance(p0, p1) || 1));
    }
  }
  report.evacuationWorstSlope = +worst.toFixed(2);
  assert.ok(worst < TAN52, `the evacuation route crosses the river on foot: worst slope ${worst.toFixed(2)}`);
  // 路桥仍然跨得过去，gate 生命周期没被动过。
  const road = Layout.gates.find((gate) => gate.id === "TemporaryBridge");
  assert.equal(road.signal, "MissionBridgeDestroyed");
  assert.equal(road.walkableId, "TemporaryBridge");
  assert.ok(road.d >= 2 * (River.floorHalfW + River.bankRun), "the road bridge spans the original channel");
  assert.ok(Layout.gates.some((gate) => gate.id === "MissionBridgeWreck"
    && gate.appearSignal === "MissionBridgeDestroyed"), "the road wreck still appears on the same signal");
  // 原断面 x（拓宽段与两端过渡之外）逐位不变：过渡带内才有拓宽的影响。
  // 东端过渡止于 x 30，不碰浅滩插值带 x 34…60 与路桥 x 76；西端过渡止于 MISSION_BOUNDS.minX −205。
  assert.equal(reachDef.x0 - reachDef.blendWestM, Layout.bounds.minX, "the west transition ends exactly at the level bound");
  assert.ok(reachDef.x1 + reachDef.blendEastM < River.fords[0].x - River.fords[0].halfW - River.fords[0].blend, "the east transition stays clear of the ford band");
  for (const x of [reachDef.x0 - reachDef.blendWestM - 1, reachDef.x1 + reachDef.blendEastM + 1, 34, 60, 76, 100])
    assert.equal(RiverReachAt(x), null, `no widening at x=${x}`);
  console.log("ok North Sha He: 28.4 m channel elsewhere, 65 m widened reach at the pontoon bridge, impassable banks, one ford and two bridges",
    JSON.stringify({ widthM: report.riverWidthM, reachWaterM: report.reachWaterWidthM, reachMouthM: report.reachMouthWidthM,
      beachWorstSlope: report.beachWorstSlope, evacuationWorstSlope: report.evacuationWorstSlope }));
}

// ---------------------------------------------------------------------------
// 12. 玩法包要用的摆位键齐全
// ---------------------------------------------------------------------------
{
  for (const key of ["bunker", "collection", "streetBlock", "cartRide", "wallPath",
    "receptionYard", "bridge", "night"])
    assert.ok(P[key], `MISSION_PLACEMENT.${key} is published for the gameplay packages`);
  const points = [P.bunker.player, P.bunker.rifle, P.bunker.heyoutianFire, P.collection.zhouWall,
    P.receptionYard.zhouPlaced, P.bridge.officer, P.night.usher,
    ...P.collection.litters, ...P.streetBlock.litterWait, ...P.wallPath.stragglers,
    ...P.bridge.enemyRidge, ...P.night.column, ...P.night.carriers];
  for (const point of points)
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z), "every placement carries x and z");
  const blocks = Solids("BunkerCollapsed");
  // 桥头军官、爆破人员与罗/何都在南岸，不站在河槽里。
  // 浮桥：爆破手蹲在南岸烂泥滩上；「不站在河槽里」= 站在水线以上至少 0.5 m 的干泥上（cut < −waterRel − 0.5；军官与罗/何在垄后，cut 为 0）。
  for (const point of [P.bridge.officer, P.bridge.luoCover, P.bridge.heyoutianCover, ...P.bridge.demolition])
    assert.ok(RiverCutAt(point.x, point.z) < -RiverReachAt(point.x).waterRel - 0.5, "no bridgehead actor stands in the channel or at the waterline");
  for (const point of [P.collection.zhouWall, P.receptionYard.receiver, P.streetBlock.windowShooter]) {
    const y = Walkable(point.x, point.z);
    assert.deepEqual(blocks.filter((box) => Hits(point.x, point.z, y, box, 0.3, 1.7)).map((b) => b.id),
      [], `placement ${point.x},${point.z} is inside a block`);
  }
  console.log("ok placement keys for bunker/collection/street/cart/wall/reception/bridge/night");
}

// ---------------------------------------------------------------------------
// 13. 北沙河的水面：读得出是一条河，但拦不住任何东西
// ---------------------------------------------------------------------------
{
  const water = Layout.blocks.filter((block) => block.semantic === "water");
  assert.ok(water.length >= 30, `the channel carries a water surface: ${water.length} slabs`);
  assert.ok(Layout.semanticColors.water !== undefined, "the water surface has its own semantic colour");
  // 一块都不许是实心：不进碰撞、不挡子弹、不进净空与视线。
  assert.deepEqual(water.filter((block) => block.solid !== false).map((b) => b.id), [],
    "the water surface is never a solid");
  const solids = Solids("BunkerCollapsed");
  assert.deepEqual(solids.filter((block) => block.semantic === "water").map((b) => b.id), [],
    "no water slab reaches the clearance / sightline set");
  const reachDef = River.reaches[0];
  const InReach = (block) => block.x >= reachDef.x0 && block.x <= reachDef.x1;
  const original = water.filter((block) => !RiverReachAt(block.x)), widened = water.filter(InReach);
  assert.ok(widened.length >= 20, `the widened reach carries its own slabs: ${widened.length}`);
  // 原断面：水位槽底以上 1.0–1.4 m（低水位），且离自然河岸还有余量（不是一条漫出来的河）。
  const depths = original.map((block) => {
    const floor = Ground(block.x, block.z);
    return { id: block.id, level: block.y + block.h / 2 - floor, freeboard: Ground(block.x, River.z + River.floorHalfW + River.bankRun + 2) - (block.y + block.h / 2) };
  });
  report.waterLevelM = +Math.max(...depths.map((d) => d.level)).toFixed(2);
  for (const d of depths)
    assert.ok(d.level >= 1.0 && d.level <= 1.4, `${d.id} sits 1.0-1.4 m above the channel floor: ${d.level.toFixed(2)}`);
  // 原断面河面比槽窄，且浅滩处收窄／断开露出滩地。
  const halfWidths = original.map((block) => block.d / 2);
  assert.ok(Math.max(...halfWidths) < River.floorHalfW,
    `March low water is narrower than the trough: ${Math.max(...halfWidths)} < ${River.floorHalfW}`);
  const ford = River.fords[0];
  assert.deepEqual(water.filter((block) => Math.abs(block.x - ford.x) <= ford.halfW).map((b) => b.id), [],
    "the ford shows bare shoal, not water");
  assert.ok(halfWidths.some((half) => half < Math.max(...halfWidths) - 1),
    "the surface narrows on its way into the ford instead of stopping square");
  // 拓宽段：水面在南岸自然地面下 0.8–1.2 m（浮桥：R3 抬回水面，桥面在水上 0.5 m），河心水深 ≥ 2.5 m，宽 60–70 m，
  // 整段同一个水位（相对自然地面），且不漫出岸（北岸岸沿、南岸沙滩以上都在水面之上）。
  const wide = [];
  for (const block of widened) {
    const top = block.y + block.h / 2, southNatural = Natural(block.x, reachDef.shoreZ + 4);
    const centreDepth = top - Ground(block.x, block.z), freeboard = southNatural - top;
    wide.push({ id: block.id, freeboard, centreDepth, half: block.d / 2 });
    assert.ok(freeboard >= 0.8 && freeboard <= 1.2, `${block.id} sits 0.8-1.2 m under the south bank ground: ${freeboard.toFixed(2)}`);
    assert.ok(centreDepth >= 2.5, `${block.id} is at least 2.5 m deep mid-river: ${centreDepth.toFixed(2)}`);
    assert.ok(block.d >= 50 && block.d <= 72, `${block.id} spans 50-72 m (66.7 m at the bridge, banks wander): ${block.d.toFixed(1)}`);
    assert.ok(Ground(block.x, block.z - block.d / 2 - 0.3) > top, `${block.id}: the north bank stands above the water`);
    assert.ok(Ground(block.x, block.z + block.d / 2 + 0.3) > top, `${block.id}: the south beach stands above the water`);
  }
  report.reachWaterFreeboardM = [+Math.min(...wide.map((d) => d.freeboard)).toFixed(2), +Math.max(...wide.map((d) => d.freeboard)).toFixed(2)];
  // 相邻两块的水位与宽度在整条河上连续（过渡带里不出现断崖）。
  const sorted = water.slice().sort((p, q) => p.x - q.x);
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1], q = sorted[i];
    if (q.x - p.x > 8 || q.x < reachDef.x0 - reachDef.blendWestM - 6 || q.x > reachDef.x1 + reachDef.blendEastM) continue;  // 只查拓宽段与两端过渡（原断面在浅滩前水位随槽底抬升，旧口径）
    assert.ok(Math.abs((p.y + p.h / 2) - (q.y + q.h / 2)) < 0.6, `water level is continuous at x=${q.x}`);
    assert.ok(Math.abs(p.d - q.d) < 22, `water width is continuous at x=${q.x}: ${p.d.toFixed(1)} -> ${q.d.toFixed(1)}`);
  }
  // 两座桥下连续（桥墩之间不断流）。
  for (const [label, x] of [["road bridge", RoadBridge.deck.x], ["pontoon bridge", Pontoon.x]])
    assert.ok(water.some((block) => Math.abs(block.x - x) <= block.w / 2 + 3),
      `the water runs under the ${label}`);
  report.waterHalfWidthM = [+Math.min(...halfWidths).toFixed(2), +Math.max(...wide.map((d) => d.half)).toFixed(2)];
  console.log("ok North Sha He reads as water: non-solid slabs, 65 m widened low water 1 m under the south bank, dry ford, continuous under both bridges",
    JSON.stringify({ slabs: water.length, widened: widened.length, levelM: report.waterLevelM,
      freeboardM: report.reachWaterFreeboardM, halfWidthM: report.waterHalfWidthM }));
}

// ---------------------------------------------------------------------------
// 14. 侧巷 = 12 守线右手的东巷（2026-09-27 掩护装载改守来时路，docs/Data_FirstLevelTransferCover20260927.md）：
//     巷子够窄、两侧是整面屋墙 / 院墙；巷口那挺机枪隔着低墙东段罩得住车列出场的路；
//     从低墙东段打得到它，从顺子的射口打不到（逼玩家沿墙往右挪）。
// ---------------------------------------------------------------------------
{
  const Named = (id) => Layout.blocks.find((box) => box.id === id);
  const west = [Named("StreetEastSouthRowBBody"), Named("VillageRoadEastHouseBody")], east = Named("VillageEastLaneWall");
  assert.ok(west.every(Boolean) && east, "the side lane is a house row on the west and a yard wall on the east");
  const westFace = Math.max(...west.map((b) => b.x + b.w / 2)), eastFace = east.x - east.w / 2;
  const clear = eastFace - westFace;
  report.sideAlleyWidthM = +clear.toFixed(2);
  assert.ok(clear >= 5 && clear <= 9, `the lane is a lane, not a yard: ${clear.toFixed(2)} m`);
  assert.ok(east.h >= 2.4 && west.every((b) => b.h >= 2.4), "both sides are full-height walls");
  assert.ok(S.sideAlley.x > westFace && S.sideAlley.x < eastFace
    && S.sideAlley.z > east.z - east.d / 2 && S.sideAlley.z < east.z + east.d / 2, "the anchor stands in the lane itself");
  assert.ok(S.sideAlley.x > S.transferWall.x + 20 && S.sideAlley.z < S.transferWall.z - 15,
    "the lane opens on the right hand of the wall post, in front of the wall");
  // 旧的西侧那条巷子没了；装载区东南那两道 SideAlley 墙留作院墙，不再有人从那里出来。
  assert.deepEqual(Layout.blocks.filter((b) => /^SideAlley/.test(b.id) && b.x < 80).map((b) => b.id), [],
    "the first-wave west-side alley is gone");
  const solids = Solids("BunkerCollapsed");
  const gun = MISSION_TACTICS[MISSION_ENCOUNTERS.transferAlley[0].id].points.at(-1);
  assert.ok(Math.hypot(gun.x - S.sideAlley.x, gun.z - S.sideAlley.z) < 8 && gun.x > westFace && gun.x < eastFace,
    "the lane gun lies in the lane mouth");
  report.sideAlleySight = {};
  for (const [label, target] of [["cartRide", StageRoutes.cartRide[2]], ["bridgeheadRoad", { x: 76, z: 127 }]]) {
    const blocker = SightBlocker(Eye(gun, 1.1), Eye(target, 1.2), solids);
    report.sideAlleySight[label] = blocker;
    assert.equal(blocker, null, `the lane gun covers the ${label}: blocked by ${blocker}`);
  }
  {
    const blocker = SightBlocker(Eye({ x: 91.5, z: 85.6 }, 1.6), Eye(gun, 1.4), solids);
    report.sideAlleySight["east end of the village wall"] = blocker;
    assert.equal(blocker, null, `the player returns fire from the east end of the wall: blocked by ${blocker}`);
  }
  report.sideAlleySight.notch = SightBlocker(Eye(S.transferWall, 1.6), Eye(gun, 1.4), solids);
  assert.ok(report.sideAlleySight.notch, "the lane gun is out of sight from the notch");
  assert.deepEqual(RouteClearance(StageRoutes.cartRide, solids, { boxHalf: [1.25, 1.45], ceiling: 2.2 }), [],
    "the cart lane stays clear");
  console.log("ok the side lane is the east lane on the right of the village wall",
    JSON.stringify({ widthM: report.sideAlleyWidthM, anchor: S.sideAlley, gun }));
}

// ---------------------------------------------------------------------------
// 15. 军列/车站下线与 bounds 收缩
// ---------------------------------------------------------------------------
{
  const gone = /^(?:StationCar\d|StationEngine|StationExitStep|TrainDoor|WaterTower|SupplyTable$|UnloadingShed|BrokenStationWall$|ApronEastBank$|TrenchMouthBank$|RailLockBank$|FlankLockBank$|StationSupply|StationMedical)/;
  for (const collection of [Layout.blocks, Layout.gates, ...Layout.scenario.states.map((s) => s.blocks)])
    assert.deepEqual(collection.filter((item) => gone.test(item.id)).map((i) => i.id), [],
      "no train or unloading-platform geometry is left in the mission layout");
  assert.deepEqual(Layout.walkableSurfaces.map((s) => s.id), ["TemporaryBridge", "PontoonBridgeDeck", "PontoonBridgeSpanSouthDeck",
    "PontoonBridgeSpanNorthDeck"],
  "the only walkable surfaces left are the road deck and the pontoon decks (blasted section, south section, north section)");
  assert.equal(P.stationCasualties, undefined, "the station casualty placement is gone");
  assert.equal(Layout.derailCar, undefined, "the derailed-carriage hook is gone");
  // 铁路只剩河两岸的两段（浮桥取代铁路桥之后在河口前收尾）。
  const [railNorth, railSouth] = Layout.railway.points;
  report.railwayZ = [railNorth[1], railSouth[1]];
  assert.ok(railSouth[1] <= 200, `the track stops south of the river: z=${railSouth[1]}`);
  assert.ok(railNorth[1] <= -184 && railSouth[1] > Pontoon.railGapZ[1],
    "the track still exists on both banks (north run and the south stub)");
  // bounds 收到实际内容外沿，且每一件（含夜景片）仍在里面。
  const B = Layout.bounds;
  report.bounds = B;
  assert.ok(B.maxZ <= 400 && B.maxZ >= 360, `the level ends south of the night gate slice: ${B.maxZ}`);
  assert.ok(B.minZ <= -225 && B.minZ >= -245, `the north field bank stays inside: ${B.minZ}`);
  const everything = [...Layout.blocks, ...Layout.gates, ...Layout.scenario.states.flatMap((s) => s.blocks)];
  const outside = everything.filter((item) => item.x - item.w / 2 < B.minX || item.x + item.w / 2 > B.maxX
    || item.z - item.d / 2 < B.minZ || item.z + item.d / 2 > B.maxZ).map((i) => i.id);
  assert.deepEqual(outside, [], "every authored piece stays inside the shrunken bounds");
  for (const [id, point] of Object.entries(A))
    assert.ok(point.x > B.minX && point.x < B.maxX && point.z > B.minZ && point.z < B.maxZ,
      `anchor ${id} stands inside the bounds`);
  // 地块与 bounds 是同一个矩形（高度场按 ground 烘，玩家按 bounds 夹）。
  const g = Layout.ground;
  assert.equal(g.w, B.maxX - B.minX);
  assert.equal(g.d, B.maxZ - B.minZ);
  assert.equal(g.x, (B.minX + B.maxX) / 2);
  assert.equal(g.z, (B.minZ + B.maxZ) / 2);
  console.log("ok the train, the station platform and the 370+ m approach run are gone",
    JSON.stringify({ bounds: B, groundM: [g.w, g.d], railwayZ: report.railwayZ }));
}

// ---------------------------------------------------------------------------
// 07 以后结构冻结：z > −95 的体块、壕沟杂物与共享地面采样与原基线一致；
// 2026-09-26 用户授权统一壕沟外观，只排除已移除的非实体通用木护壁/踏板（另断言其不存在）。
//（Data_FirstLevelSpaceSouthFingerprint.json；只许从 baseline 字段那份提交重新生成）。基线原是重排前的 f581ac7dd；
// 2026-09-24 并入 master 后换成 master 的 b3ba06096（其 c85614d43 重建了 06–18 白盒），合并后 07+ 与它逐项相同。
// 2026-09-27 05–18 按概念图重做白盒（docs/Data_FirstLevelWhitebox0518Gap.md），用户授权改动 07+ 的体块与地面，基线随之换成该集成提交。
// ---------------------------------------------------------------------------
{
  const expected = JSON.parse(fs.readFileSync(new URL("./Data_FirstLevelSpaceSouthFingerprint.json", import.meta.url), "utf8"));
  const now = SouthFingerprint({ blocks: Layout.blocks, placements: MISSION_TRENCH_PLACEMENTS, bodies: MISSION_AFTERMATH,
    sample: (x, z) => Ground(x, z), zMin: expected.zMin });
  for (const key of ["structuralBlocks", "placements", "bodies", "ground"])
    assert.deepEqual(now[key], { ...expected[key] }, `south of z=${expected.zMin} the ${key} are exactly the baseline ${expected.baseline}'s`);
  assert.equal(now.blocks.count, now.structuralBlocks.count, "reference 07 removes generic timber cladding, retaining dugout and authored structures");
  console.log(`ok 07+ structure retained: ${now.structuralBlocks.count} blocks, ${now.placements.count} trench props, ${now.bodies.count} dead, ${now.ground.count} ground samples match ${expected.baseline}`);
}

// 16–17 are a roofed wing in the same ordinary receiving courtyard. Sample the
// working floor, not one known roof ID, so a narrow cut-away strip cannot pass.
{
  const solids = Solids();
  const roomSamples = [-30, -26, -22].flatMap(x => [227, 231, 235, 239, 241].map(z => ({x,z})));
  for (const p of roomSamples) {
    const floor = Ground(p.x, p.z);
    const roof = solids.find(b => Math.abs(p.x-b.x)<b.w/2 && Math.abs(p.z-b.z)<b.d/2
      && b.y-b.h/2>floor+2.4 && b.y-b.h/2<floor+4.2);
    assert.ok(roof, `the ward floor at ${p.x},${p.z} has actual overhead cover`);
  }
  assert.deepEqual(RouteClearance(Routes.reception, solids, {margin:.625,ceiling:1.9}), [],
    "two bearers can take the litter through the receiving yard and into the roofed ward");
  for (const state of Layout.scenario.states) {
    const ids=[...Layout.blocks,...state.blocks].map(b=>b.id);
    assert.equal(new Set(ids).size,ids.length,`${state.id} has no duplicate whitebox block identifiers`);
  }
  report.wardCoveredSamples=roomSamples.length;
  console.log("ok 16–17 roof covers the working floor and the two-bearer reception route stays clear");
}
console.log(rearOnly ? "ok first-level 06–18 space:" : "ok first-level 2026.09.19 space:", JSON.stringify(report));
