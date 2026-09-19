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
  MISSION_PLACEMENT as P, MISSION_NIGHT_GATE_BLOCK_IDS as NightIds } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ANCHORS as S, MISSION_STAGE_ROUTES as StageRoutes,
  MISSION_NORTH_RIVER as River, RiverCutAt, RiverProfileAt,
  MISSION_RAIL_BRIDGE as RailBridge, MISSION_SOUTH_BRIDGE as RoadBridge,
  MISSION_RECEPTION_SPACE as Reception } from "./Data_FirstLevelMissionTopology.mjs";
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";

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
  console.log("ok all 26 contract anchors stand in open space");
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
  console.log("ok every contract route clears a 0.35 m capsule and is merged into MISSION_ROUTES",
    JSON.stringify(report.routeLengths));
}

// ---------------------------------------------------------------------------
// 3. 掩蔽部：躺姿视线到门外 8–12 m
// ---------------------------------------------------------------------------
{
  const blocks = Solids("BunkerCollapsed");
  const doorZ = -133, band = [];
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
  // 门框与碎砖必须真的遮住一部分（不然「破口」就是一扇敞开的门）。
  const eye = Eye(S.bunker, 0.42);
  // 门框把视野切成一条缝：刺杀处正前方看得见，左右各 6 m 就被门垛挡住；
  // 门框立柱本身再挡掉当中一条（-38.3 正在立柱的射影上）。
  report.bunkerOcclusion = [-46, -38.3, -34].map((x) => ({ x,
    blocker: SightBlocker(eye, { x, z: S.bunkerKilling.z, y: Ground(x, S.bunkerKilling.z) + 1.2 }, blocks) }));
  for (const row of report.bunkerOcclusion)
    assert.ok(row.blocker, `the doorway must occlude x=${row.x} outside the bunker`);
  // 步枪落在够不到的地方。
  const reach = Distance(P.bunker.player, P.bunker.rifle);
  assert.ok(reach > 2.5, `the rifle is out of reach: ${reach.toFixed(2)} m`);
  // 压手的木架是实心小块。
  for (const pin of P.bunker.pinnedFrame)
    assert.ok(Scenario.BunkerCollapsed.some((box) => box.solid !== false
      && Math.abs(box.x - pin.x) < 1 && Math.abs(box.z - pin.z) < 1), "pinning frame is a real solid");
  // 何有田从后侧交通壕能打到门外刺杀处（绕过掩蔽部西墙）。
  assert.equal(SightBlocker(Eye(P.bunker.heyoutianFire, 1.1),
    { ...S.bunkerKilling, y: Ground(S.bunkerKilling.x, S.bunkerKilling.z) + 1.2 }, blocks), null,
  "He Youtian's rear-trench position can fire at the killing ground");
  report.bunkerRifleReachM = +reach.toFixed(2);
  console.log("ok collapsed bunker: prone sightline 8-12 m out, occluded flanks, unreachable rifle");
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
  console.log("ok 15B lane, bump, ward threshold and reception gateway",
    JSON.stringify({ lane: report.wallPathWidthM, bump: bump.h, threshold: threshold.h, gate: report.receptionGateM }));
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
  assert.ok(intact.length >= 3 && wreck.length >= 2, "destroying the bridge swaps whole pieces");
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

console.log("ok first-level 2026.09.19 space:", JSON.stringify(report));
