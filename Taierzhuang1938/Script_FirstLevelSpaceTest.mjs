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
import { MISSION_LAYOUT as Layout, MISSION_ANCHORS as A, MISSION_ROUTES as Routes,
  MISSION_PLACEMENT as P, MISSION_NIGHT_GATE_BLOCK_IDS as NightIds, MISSION_SUPPLIES,
  MISSION_SUPPLY_COLLIDER } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ANCHORS as S, MISSION_STAGE_ROUTES as StageRoutes,
  MISSION_NORTH_RIVER as River, RiverCutAt, RiverProfileAt,
  MISSION_RAIL_BRIDGE as RailBridge, MISSION_SOUTH_BRIDGE as RoadBridge,
  MISSION_RECEPTION_SPACE as Reception } from "./Data_FirstLevelMissionTopology.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { END_TUNING as END } from "./Data_Tuning_FirstLevelEnd.mjs";
import { ZhouGunExitRoute } from "./Script_FirstLevelOpening.mjs";
import { OPENING_STORYBOARDS } from "./Data_OpeningStoryboards.mjs";

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

// The wounded gunner must walk around the runtime supply collider from every
// physically plausible side. This also samples the one-metre trench-to-step
// rise; the open south detour must climb it as a slope, not a vertical lip.
if (!rearOnly) {
  const spec=MISSION_SUPPLIES.find(entry=>entry.id==="Front"),size=MISSION_SUPPLY_COLLIDER;
  const supply={id:"MissionSupplyFront",x:spec.x,z:spec.z,w:size.w,h:size.h,d:size.d,
    y:Ground(spec.x,spec.z)+size.h/2};
  for(const start of [
    {id:"west",x:-3.0401633947848508,z:-123.90232699904317},
    {id:"east",x:0,z:-123.9},
    {id:"north",x:-2,z:-125.2},
  ]){
    const route=[start,...ZhouGunExitRoute(start,.34)];
    assert.deepEqual(RouteClearance(route,[...Solids(),supply]),[],`${start.id} Zhou exit route is physically clear`);
    let previous=Walkable(route[0].x,route[0].z);
    for(let leg=1;leg<route.length;leg++){
      const a=route[leg-1],b=route[leg],length=Distance(a,b),steps=Math.ceil(length/.2);
      for(let i=1;i<=steps;i++){
        const t=i/steps,y=Walkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
        assert.ok(y-previous<=TAN52*(length/steps)+.03,
          `${start.id} Zhou exit climbs a passable slope (${previous.toFixed(2)} -> ${y.toFixed(2)})`);
        previous=y;
      }
    }
  }
  console.log("ok wounded Zhou routes around the front supply and climbs the real south-side slope");
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
// 3. 掩蔽部：小型（7 × 7 m）、躺姿视线到门外 2–12 m，行刑处整个人都在视野里
// ---------------------------------------------------------------------------
if (!rearOnly) {
  const blocks = Solids("BunkerCollapsed");
  // 2026-09-20 演出打磨：屋子从 12 m 进深收到 7 m，前墙在 z=-128。
  const doorZ = -128, band = [];
  // 受困位到前门 4–5 m、到行刑处 ≤ 9 m（Notion 01「必须让玩家清楚看懂」）。
  report.bunkerDepthM = +(Math.abs(S.bunker.z - doorZ)).toFixed(2);
  report.bunkerKillingM = +Distance(S.bunker, S.bunkerKilling).toFixed(2);
  assert.ok(report.bunkerDepthM >= 1.5 && report.bunkerDepthM <= 3,
    "the new wounded viewpoint is close to the wide dugout mouth");
  assert.ok(report.bunkerKillingM <= 9,
    `the killing ground reads at a glance: ${report.bunkerKillingM} m from the pinned spot`);
  for (const eyeH of [0.35, 0.42, 0.50]) {
    const eye = Eye(S.bunker, eyeH);
    for (const [label, target] of [["killing", S.bunkerKilling], ["8m", { x: S.bunker.x, z: doorZ - 8 }],
      ["12m", { x: S.bunker.x, z: doorZ - 12 }]]) {
      // 看的是站着的人的胸口，不是脚底：门槛的碎砖本来就该挡掉一截地面。
      const to = { x: target.x, z: target.z, y: Ground(target.x, target.z) + 1.2 };
      const blocker = SightBlocker(eye, to, blocks);
      band.push({ eyeH, label, blocker });
      assert.equal(blocker, null, `prone eye ${eyeH} cannot see ${label} outside the bunker door`);
    }
  }
  report.bunkerSight = band;
  // 「两名川军和两名日兵」的**全身**（膝到头顶）都不许被中隔墙裁掉。
  // 脚底那一档（0.05）允许被门槛碎砖挡住 —— 那正是「门框与尘土遮住创口」的一部分，
  // 但挡住它的只许是门口那一带，绝不能是中隔墙。
  report.bunkerFullBody = [];
  for (const eyeH of [0.35, 0.42, 0.50]) {
    const eye = Eye(S.bunker, eyeH);
    for (const [label, point] of [["captive", OPENING_STORYBOARDS.positions.captive],
      ["interpreter", OPENING_STORYBOARDS.positions.interpreter],
      ["ijaA", OPENING_STORYBOARDS.positions.controller], ["ijaB", OPENING_STORYBOARDS.positions.guard]]) {
      for (const h of [0.35, 0.9, 1.75]) {
        const blocker = SightBlocker(eye, { x: point.x, z: point.z, y: Ground(point.x, point.z) + h }, blocks);
        assert.equal(blocker, null,
          `prone eye ${eyeH} sees ${label} at ${h} m (blocked by ${blocker})`);
      }
      const feet = SightBlocker(eye, { x: point.x, z: point.z, y: Ground(point.x, point.z) + 0.05 }, blocks);
      assert.ok(!/Partition/.test(feet || ""), `the partition never crops ${label}`);
      if (eyeH === 0.42) report.bunkerFullBody.push({ label, d: +Distance(S.bunker, point).toFixed(2), feet });
    }
  }
  // 门框与碎砖必须真的遮住一部分（不然「破口」就是一扇敞开的门）。
  const eye = Eye(S.bunker, 0.42);
  // 门框把视野切成一条缝：刺杀处正前方看得见，左右两侧被门垛与塌方堆挡住；
  // 门框立柱本身再挡掉当中一条（行刑处 z=-131.9 这一档，缝是 x -42.59…-37.41，
  // 立柱的射影落在 -38.80…-38.24）。
  report.bunkerOcclusion = [-47, -34].map((x) => ({ x,
    blocker: SightBlocker(eye, { x, z: S.bunkerKilling.z, y: Ground(x, S.bunkerKilling.z) + 1.2 }, blocks) }));
  for (const row of report.bunkerOcclusion)
    assert.ok(row.blocker, `the doorway must occlude x=${row.x} outside the bunker`);
  // 步枪落在够不到的地方。
  const reach = Distance(P.bunker.player, P.bunker.rifle);
  assert.ok(reach < 1.5, `the kicked rifle is within reach: ${reach.toFixed(2)} m`);
  // 压手的木架是实心小块。
  for (const pin of P.bunker.pinnedFrame)
    assert.ok(Scenario.BunkerCollapsed.some((box) => box.solid !== false
      && Math.abs(box.x - pin.x) < 1 && Math.abs(box.z - pin.z) < 1), "pinning frame is a real solid");
  // 何有田从后侧交通壕能打到门外刺杀处（绕过掩蔽部西墙）。
  assert.equal(SightBlocker(Eye(P.bunker.heyoutianFire, 1.1),
    { ...S.bunkerKilling, y: Ground(S.bunkerKilling.x, S.bunkerKilling.z) + 1.2 }, blocks), null,
  "He Youtian's rear-trench position can fire at the killing ground");
  report.bunkerRifleReachM = +reach.toFixed(2);
  console.log("ok dugout: prone full-body sightlines, occluded far flanks, kicked rifle reachable");
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
// 8. 铁路桥：可走、可炸、炸后不可通行
// ---------------------------------------------------------------------------
{
  const deck = Layout.walkableSurfaces.find((surface) => surface.id === "RailBridgeDeck");
  assert.ok(deck, "the rail bridge deck is a walkable surface");
  assert.ok(deck.z - deck.d / 2 <= River.z - River.floorHalfW - River.bankRun
    && deck.z + deck.d / 2 >= River.z + River.floorHalfW + River.bankRun,
  "the deck spans the whole channel mouth");
  report.railBridgeSpanM = deck.d;
  // 上下桥没有台阶。
  for (const z of [deck.z - deck.d / 2 - 1, deck.z + deck.d / 2 + 1]) {
    const step = Math.abs((deck.y + deck.h / 2) - Ground(deck.x, z));
    assert.ok(step < TRAVERSAL.stepMax, `stepping onto the deck at z=${z}: ${step.toFixed(2)} m`);
  }
  const intact = Layout.gates.filter((gate) => gate.signal === RailBridge.signal);
  const wreck = Layout.gates.filter((gate) => gate.appearSignal === RailBridge.signal);
  assert.equal(intact.length, 5, "the intact railway bridge has all five gated pieces");
  assert.equal(wreck.length, 3, "the destroyed railway bridge has all three wreck pieces");
  assert.ok(intact.some((gate) => gate.walkableId === "RailBridgeDeck"),
    "the deck leaves walkableSurfaces when the bridge goes");
  // 炸后：河槽上没有任何别的可走面。
  const others = Layout.walkableSurfaces.filter((surface) => surface.id !== "RailBridgeDeck"
    && Math.abs(surface.x - RailBridge.x) < 8 && Math.abs(surface.z - River.z) < River.floorHalfW);
  assert.deepEqual(others.map((s) => s.id), [], "nothing else carries a man over the channel at x=-77");
  // 道砟/轨在桥段断开，桥面上另摆直轨。
  const gaps = Layout.railway.railGaps[0];
  assert.deepEqual(gaps, RailBridge.gapZ.map((z) => z + 186), "the ballast and rails break over the span");
  assert.equal(intact.filter((gate) => /^RailBridgeRail/.test(gate.id)).length, 2,
    "two straight rails carry the track across the deck");
  console.log("ok rail bridge deck spans the channel, breaks the track and is destructible",
    JSON.stringify({ spanM: deck.d, intact: intact.length, wreck: wreck.length }));
}

// ---------------------------------------------------------------------------
// 9. 18 的三条视线与爆破安全距离
// ---------------------------------------------------------------------------
{
  const blocks = Solids("BunkerCollapsed");
  const deckTop = { x: RailBridge.x, z: RailBridge.z, y: RailBridge.deckTopY + 0.8 };
  const cover = Eye(S.bridgeCover, 1.6), blast = Eye(S.blastSafe, 1.6);
  const sight = {
    coverToDeck: SightBlocker(cover, deckTop, blocks),
    coverToEnemy: SightBlocker(cover, Eye(S.bridgeEnemy, 1.6), blocks),
    blastToDeck: SightBlocker(blast, deckTop, blocks),
    enemyToDeck: SightBlocker(Eye(S.bridgeEnemy, 1.6), deckTop, blocks),
    enemyToSouthEnd: SightBlocker(Eye(S.bridgeEnemy, 1.6), Eye(S.bridgeSouthEnd, 1.2), blocks),
  };
  report.bridgeSight = sight;
  for (const [key, blocker] of Object.entries(sight))
    assert.equal(blocker, null, `${key} must be a clear line: blocked by ${blocker}`);
  // 南岸射位躲在遮挡后面（躺/蹲下去就断线），北岸土坎同理。
  const Named = (id) => Layout.blocks.find((box) => box.id === id);
  for (const [label, eye, id] of [["south cover", S.bridgeCover, "BridgeSouthCoverWest"],
    ["north ridge", S.bridgeEnemy, "BridgeNorthRidgeEast"]]) {
    const wall = Named(id);
    assert.ok(wall && wall.h >= 1.1 && wall.h <= 1.7, `${label} is a 1.1-1.6 m parapet: ${wall?.h}`);
    assert.ok(SightBlocker(Eye(eye, 0.9), deckTop, blocks), `${label} breaks a crouched line`);
  }
  const blastM = Distance(S.blastSafe, S.railBridge);
  report.blastSafeM = +blastM.toFixed(1);
  assert.ok(blastM >= 40, `the blast-safe position is at least 40 m from the span: ${blastM.toFixed(1)}`);
  assert.ok(Named("BlastSafeBank"), "the blast-safe position has its own cover");
  console.log("ok bridge firing lines, parapets and a 40 m blast stand-off", JSON.stringify(
    { blastSafeM: report.blastSafeM, coverToEnemyM: +Distance(S.bridgeCover, S.bridgeEnemy).toFixed(1) }));
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
// 11. 北沙河：浅滩与两座桥之外处处不可横穿
// ---------------------------------------------------------------------------
{
  assert.ok(Layout.terrainSpec.rivers?.includes(River), "the river is data on the terrain spec");
  const width = 2 * (River.floorHalfW + River.bankRun);
  report.riverWidthM = width;
  assert.ok(width >= 24 && width <= 34, `the channel is 24-34 m wide: ${width}`);
  const soft = [];
  for (let x = Layout.bounds.minX + 6; x <= Layout.bounds.maxX - 6; x += 1) {
    if (River.crossings.some((crossing) => Math.abs(x - crossing.x) <= crossing.halfW)) continue;
    const profile = RiverProfileAt(x);
    // smoothstep 的峰值斜率是平均的 1.5 倍。
    const slope = 1.5 * profile.depth / profile.bankRun;
    if (RiverCutAt(x, River.z) < 3 || slope <= TAN52) soft.push(x);
  }
  assert.deepEqual(soft, [], "the channel is only crossable at the ford and the two bridges");
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
  assert.ok(road.d >= 2 * (River.floorHalfW + River.bankRun), "the road bridge spans the widened channel");
  assert.ok(Layout.gates.some((gate) => gate.id === "MissionBridgeWreck"
    && gate.appearSignal === "MissionBridgeDestroyed"), "the road wreck still appears on the same signal");
  console.log("ok North Sha He: 28.4 m channel, impassable banks, one ford and two bridges",
    JSON.stringify({ widthM: report.riverWidthM, evacuationWorstSlope: report.evacuationWorstSlope }));
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
  for (const point of [P.bridge.officer, P.bridge.luoCover, P.bridge.heyoutianCover, ...P.bridge.demolition])
    assert.ok(RiverCutAt(point.x, point.z) < 0.6, "no bridgehead actor stands in the channel");
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
  // 水位：槽底以上 1.0–1.4 m，且离自然河岸还有余量（不是一条漫出来的河）。
  const depths = water.map((block) => {
    const floor = Ground(block.x, block.z);
    return { id: block.id, level: block.y + block.h / 2 - floor, freeboard: Ground(block.x, River.z + River.floorHalfW + River.bankRun + 2) - (block.y + block.h / 2) };
  });
  report.waterLevelM = +Math.max(...depths.map((d) => d.level)).toFixed(2);
  for (const d of depths)
    assert.ok(d.level >= 1.0 && d.level <= 1.4, `${d.id} sits 1.0-1.4 m above the channel floor: ${d.level.toFixed(2)}`);
  // 河面比槽窄，且浅滩处收窄／断开露出滩地。
  const halfWidths = water.map((block) => block.d / 2);
  assert.ok(Math.max(...halfWidths) < River.floorHalfW,
    `March low water is narrower than the trough: ${Math.max(...halfWidths)} < ${River.floorHalfW}`);
  const ford = River.fords[0];
  assert.deepEqual(water.filter((block) => Math.abs(block.x - ford.x) <= ford.halfW).map((b) => b.id), [],
    "the ford shows bare shoal, not water");
  assert.ok(halfWidths.some((half) => half < Math.max(...halfWidths) - 1),
    "the surface narrows on its way into the ford instead of stopping square");
  // 两座桥下连续（桥墩之间不断流）。
  for (const [label, x] of [["road bridge", RoadBridge.deck.x], ["rail bridge", RailBridge.x]])
    assert.ok(water.some((block) => Math.abs(block.x - x) <= block.w / 2 + 3),
      `the water runs under the ${label}`);
  report.waterHalfWidthM = [+Math.min(...halfWidths).toFixed(2), +Math.max(...halfWidths).toFixed(2)];
  console.log("ok North Sha He reads as water: non-solid slabs, 1.2 m low water, dry ford, continuous under both bridges",
    JSON.stringify({ slabs: water.length, levelM: report.waterLevelM, halfWidthM: report.waterHalfWidthM }));
}

// ---------------------------------------------------------------------------
// 14. 侧巷在装载区东南，火力够得着出场的车列，玩家够得着从巷口出来的人
// ---------------------------------------------------------------------------
{
  const Named = (id) => Layout.blocks.find((box) => box.id === id);
  const north = Named("SideAlleyNorthWall"), south = Named("SideAlleySouthWall");
  assert.ok(north && south, "the side alley is two yard walls");
  const clear = (south.z - south.d / 2) - (north.z + north.d / 2);
  report.sideAlleyWidthM = +clear.toFixed(2);
  assert.ok(clear >= 5 && clear <= 9, `the alley is an alley, not a yard: ${clear.toFixed(2)} m`);
  assert.ok(north.h >= 2.4 && south.h >= 2.4, "both sides are full-height yard walls");
  // 东南侧：巷身整个在装载区以东、桥头路以东。
  assert.ok(S.sideAlley.x > A.queue.x + 15, "the alley is east of the loading lane");
  assert.ok(S.sideAlley.z > 110 && S.sideAlley.z < 136, "the alley opens onto the departure road, not the yard entrance");
  assert.ok(S.sideAlley.z > north.z && S.sideAlley.z < south.z, "the anchor stands in the alley itself");
  // 旧的西侧那条巷子没了。
  assert.deepEqual(Layout.blocks.filter((b) => /^SideAlley/.test(b.id) && b.x < 80).map((b) => b.id), [],
    "the first-wave west-side alley is gone");
  const solids = Solids("BunkerCollapsed");
  // 巷口朝西：从巷子里望得见牛马车的出场道（cartRide 中段与桥头路）。
  const mouth = { x: north.x - north.w / 2, z: S.sideAlley.z };
  report.sideAlleySight = {};
  for (const [label, target] of [["cartRide", StageRoutes.cartRide[2]], ["bridgeheadRoad", { x: 76, z: 127 }]]) {
    const blocker = SightBlocker(Eye({ x: S.sideAlley.x + 4, z: S.sideAlley.z }, 1.1), Eye(target, 1.2), solids);
    report.sideAlleySight[label] = blocker;
    assert.equal(blocker, null, `the alley gun covers the ${label}: blocked by ${blocker}`);
  }
  // 玩家朝村落方向的低墙／墙角射位打得到从巷口出来的人。
  for (const [label, from] of [["village wall", { x: 66.5, z: 85.5 }], ["yard corner", { x: 95, z: 97.5 }]]) {
    const blocker = SightBlocker(Eye(from, 1.6), Eye(mouth, 1.4), solids);
    report.sideAlleySight[label] = blocker;
    assert.equal(blocker, null, `the player returns fire from the ${label}: blocked by ${blocker}`);
  }
  // 巷身不许压在车位上，也不许挡住 cartRide 本身。
  for (const bay of P.cartBays) for (const wall of [north, south])
    assert.ok(Math.abs(bay.x - wall.x) > wall.w / 2 + 2 || Math.abs(bay.z - wall.z) > wall.d / 2 + 3.2,
      `the alley wall stands clear of the cart bay at ${bay.x},${bay.z}`);
  assert.deepEqual(RouteClearance(StageRoutes.cartRide, solids, { boxHalf: [1.25, 1.45], ceiling: 2.2 }), [],
    "moving the alley east leaves the cart lane clear");
  console.log("ok the side alley moved to the south-east of the loading yard",
    JSON.stringify({ widthM: report.sideAlleyWidthM, anchor: S.sideAlley }));
}

// ---------------------------------------------------------------------------
// 15. 军列/车站下线与 bounds 收缩
// ---------------------------------------------------------------------------
{
  const gone = /^(?:StationCar\d|StationEngine|StationExitStep|TrainDoor|WaterTower|SupplyTable$|UnloadingShed|BrokenStationWall$|ApronEastBank$|TrenchMouthBank$|RailLockBank$|FlankLockBank$|StationSupply|StationMedical)/;
  for (const collection of [Layout.blocks, Layout.gates, ...Layout.scenario.states.map((s) => s.blocks)])
    assert.deepEqual(collection.filter((item) => gone.test(item.id)).map((i) => i.id), [],
      "no train or unloading-platform geometry is left in the mission layout");
  assert.deepEqual(Layout.walkableSurfaces.map((s) => s.id), ["TemporaryBridge", "RailBridgeDeck"],
    "the only walkable surfaces left are the two bridge decks");
  assert.equal(P.stationCasualties, undefined, "the station casualty placement is gone");
  assert.equal(Layout.derailCar, undefined, "the derailed-carriage hook is gone");
  // 铁路只剩铁路桥引道。
  const [railNorth, railSouth] = Layout.railway.points;
  report.railwayZ = [railNorth[1], railSouth[1]];
  assert.ok(railSouth[1] <= 200, `the track stops south of the rail bridge: z=${railSouth[1]}`);
  assert.ok(railNorth[1] <= -184 && railSouth[1] > RailBridge.z + RailBridge.deckHalfD,
    "the track still carries both approaches of the rail bridge");
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
