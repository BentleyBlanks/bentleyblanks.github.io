// 第一关拓扑门禁 · Notion 2026.09.19 采用稿的**四个空间区**
// （docs/Data_FirstLevelRebuildSource20260919.md「四个空间区」与
//  docs/Data_FirstLevelRebuild20260919Contract.md §3）。
//
// 这份文件只管**空间关系**：邻接、方向、距离、视线。
// 逐阶段的 requirements 归 Spine 包的 Script_FirstLevelMissionTest；
// 白盒几何的米制校验归 Script_FirstLevelSpaceTest。旧版（2026.09.14 军列开场）
// 那份「18 个阶段事实逐条抄录」已随采用稿下线，不在这里重建。
import assert from "node:assert/strict";
import { MISSION_ANCHORS as A, MISSION_ROUTES as Routes,
  MISSION_LAYOUT as Layout } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_RECEPTION_SPACE as Reception, MISSION_REARGUARD_POCKETS as Pockets,
  MISSION_STAGE_ANCHORS as S, MISSION_STAGE_ROUTES as StageRoutes,
  MISSION_NORTH_RIVER as River, MISSION_RAIL_BRIDGE as RailBridge,
  MISSION_TOPOLOGY_VERSION } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_RETURN_ROUTES } from "./Data_FirstLevelMissionReturn.mjs";
import { MissionRouteLength, MissionRouteNextIndex } from "./Script_FirstLevelMissionColumn.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
assert.match(MISSION_TOPOLOGY_VERSION, /^first-level-20260919-/, "the adopted 2026.09.19 topology is live");

// ---------------------------------------------------------------------------
// 1. 四个空间区：各自的 z 带，且 A → B → C → 北沙河 → D 单调南行
// ---------------------------------------------------------------------------
const ZONES = [
  { id: "A", label: "前沿与后交通壕 01-06", z: [-220, -96],
    anchors: ["bunker", "bunkerDoor", "bunkerKilling", "bunkerRear", "rearCorner", "collection"] },
  { id: "B", label: "村落与后送线 07-10", z: [-30, 46],
    anchors: ["litterHold", "streetBlock", "eastAlley", "streetRejoin"] },
  { id: "C", label: "桥头接运与空袭 11-14", z: [86, 145],
    anchors: ["cartBoard", "cartHalt", "sideAlley"] },
  { id: "D", label: "桥南接收与回援 15-18", z: [165, 252],
    anchors: ["wallPathStart", "wallPathEnd", "receptionGate", "bridgeSouthEnd", "bridgeCover",
      "blastSafe", "marchOut"] },
];
for (const zone of ZONES) for (const id of zone.anchors) {
  const point = S[id] || A[id];
  assert.ok(point, `${id} exists`);
  assert.ok(point.z >= zone.z[0] && point.z <= zone.z[1],
    `${id} (z=${point.z}) belongs to zone ${zone.id} ${JSON.stringify(zone.z)}`);
}
for (let i = 1; i < ZONES.length; i++)
  assert.ok(ZONES[i].z[0] > ZONES[i - 1].z[1], `zone ${ZONES[i].id} lies south of ${ZONES[i - 1].id}`);
// 北沙河把 C 与 D 隔开，正是它该在的位置。
assert.ok(River.z > ZONES[2].z[1] && River.z < ZONES[3].z[0],
  "the North Sha He runs between the transfer point and the south bank");
console.log("ok four zones hold their anchors and run monotonically south", ZONES.map((z) => z.id).join("->"));

// ---------------------------------------------------------------------------
// 2. 阶段路线的方向：15 之前一路南下，18 是唯一一次回头向北
// ---------------------------------------------------------------------------
// 02 是例外，也只是这一个例外：它先向南撤出掩蔽部、途经伤员集结处（06 在那儿等着），
// 再折回前沿交通壕三岔口去接 03 —— Notion 正文写的就是「02 去 03 时经过 06 的
// 背坡伤员集结处」，不是一条单向南下的腿。
{
  const route = StageRoutes.rearTrench;
  assert.ok(route.some((p) => Math.hypot(p.x - S.collection.x, p.z - S.collection.z) < 0.01),
    "02 walks through the casualty collection point on its way to 03");
  const south = Math.max(...route.map((p) => p.z));
  assert.ok(south >= S.collection.z, "02 reaches at least as far south as the collection point");
  assert.ok(route.at(-1).z < S.collection.z - 15, "02 ends back at the front communication trench");
}
const SOUTHBOUND = ["southWalk", "courtyardBypass", "cartRide", "wallPath"];
for (const name of SOUTHBOUND) {
  const route = StageRoutes[name];
  assert.ok(route.at(-1).z > route[0].z + 8,
    `${name} makes real southward progress: ${route[0].z} -> ${route.at(-1).z}`);
}
assert.ok(StageRoutes.toBridge.at(-1).z < StageRoutes.toBridge[0].z - 40,
  "18 is the one march back north, from the reception yard to the rail bridge");
assert.ok(StageRoutes.collectionReturn.at(-1).z > StageRoutes.collectionReturn[0].z,
  "05 returns south to the collection point rather than pressing on");
// 尾队自北向南过桥，随后继续南下与小队汇合。
const crossing = StageRoutes.bridgeCrossing;
assert.ok(crossing[0].z < S.railBridge.z && crossing.at(-1).z > S.railBridge.z,
  "the rear column crosses the bridge from the north bank to the south");
console.log("ok stage routes run south except the single return to the bridge");

// ---------------------------------------------------------------------------
// 3. 邻接与距离（Notion「图示修正说明」要求按真实米制校验的几项）
// ---------------------------------------------------------------------------
const measured = {
  bunkerKillingM: Distance(S.bunker, S.bunkerKilling),
  bunkerToRearM: Distance(S.bunker, S.bunkerRear),
  rearToCollectionM: MissionRouteLength(StageRoutes.rearTrench),
  southWalkM: MissionRouteLength(StageRoutes.southWalk),
  villageBypassM: MissionRouteLength(StageRoutes.courtyardBypass),
  transferToRoadBridgeM: Distance(A.queue, { x: 76, z: River.z }),
  blastSafeM: Distance(S.blastSafe, S.railBridge),
  wallPathM: MissionRouteLength(StageRoutes.wallPath),
  toBridgeM: MissionRouteLength(StageRoutes.toBridge),
};
// 掩蔽部门外的刺杀处在 8–12 m 的可读距离上（不是贴脸，也不是看不清的远处）。
assert.ok(measured.bunkerKillingM >= 16 && measured.bunkerKillingM <= 24,
  `the killing ground sits 8-12 m beyond the door: ${measured.bunkerKillingM.toFixed(1)} m from the player`);
assert.ok(Distance(S.bunkerDoor, S.bunkerKilling) >= 6 && Distance(S.bunkerDoor, S.bunkerKilling) <= 12,
  "8-12 m from the doorway itself");
// 02 的折角与集结处在同一片背坡之后。
assert.ok(Distance(S.rearCorner, S.collection) < 20, "the trench corner and the collection point are neighbours");
assert.ok(S.rearCorner.z < S.collection.z, "the corner is north of the collection point");
// 06 的接令点与集结处同区。
assert.ok(Distance(A.orders, S.collection) < 12, "the orders anchor moved into the collection area");
// 村落绕行：改道不能比直穿主街短，也不能长成一条新关卡。
const straight = Distance(StageRoutes.courtyardBypass[0], S.streetRejoin);
assert.ok(measured.villageBypassM > straight * 1.3 && measured.villageBypassM < 120,
  `the village detour is a real detour but not a maze: ${measured.villageBypassM.toFixed(1)} vs ${straight.toFixed(1)} m`);
// 桥头接运点到路桥：一段路，不是一步之遥。
assert.ok(measured.transferToRoadBridgeM > 30 && measured.transferToRoadBridgeM < 70,
  `the loading yard stands off the road bridge: ${measured.transferToRoadBridgeM.toFixed(1)} m`);
// 爆破安全距离。
assert.ok(measured.blastSafeM >= 40, `blast stand-off: ${measured.blastSafeM.toFixed(1)} m`);
// 15A—C 的降压步行：按 1.4 m/s 至少要有一分钟的「没人打你」的路。
const regroupSeconds = (measured.wallPathM) / 1.4;
assert.ok(regroupSeconds > 45, `15B gives the player a real breather: ${regroupSeconds.toFixed(0)} s at 1.4 m/s`);
console.log("ok metric adjacency", JSON.stringify(Object.fromEntries(
  Object.entries(measured).map(([k, v]) => [k, +v.toFixed(1)]))));

// ---------------------------------------------------------------------------
// 4. 视线规则
// ---------------------------------------------------------------------------
const solids = [
  ...Layout.blocks.filter((block) => block.solid !== false
    && !Layout.walkableSurfaces.some((surface) => surface.id === block.id)),
  ...Layout.scenario.states.find((state) => state.id === "BunkerCollapsed").blocks
    .filter((block) => block.solid !== false),
];
function Blocked(from, to, eye = 1.6) {
  const a = { ...from, y: SampleMissionTerrain(from.x, from.z) + eye };
  const b = { ...to, y: SampleMissionTerrain(to.x, to.z) + eye };
  const steps = Math.ceil(Distance(from, to) * 5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
    if (SampleMissionTerrain(x, z) > y + 0.02) return true;
    for (const box of solids) {
      const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
      if (Math.abs(dx * cos - dz * sin) < box.w / 2 && Math.abs(dx * sin + dz * cos) < box.d / 2
        && y > box.y - box.h / 2 && y < box.y + box.h / 2) return true;
    }
  }
  return false;
}
// 背坡：集结处看不见前沿，前沿也看不见集结处（同一堵坎，两个方向都要成立）。
assert.ok(Blocked(S.collection, A.gun), "the collection point cannot see the machine-gun nest");
assert.ok(Blocked(A.gun, S.collection), "the machine-gun nest cannot see the collection point");
assert.ok(Blocked(S.collection, S.bunkerKilling), "the collection point cannot see the bunker doorway ground");
// 担架等待点与主街障碍。
assert.ok(Blocked(S.litterHold, S.streetBlock), "the waiting litters are out of sight of the street block");
// 撤离线的连续折角切断长射线（旧规则保留：这条是 15 的降压设计本身）。
assert.ok(Blocked(A.retreatA, A.retreatB), "A to B long sightline is broken");
assert.ok(Blocked(A.retreatB, A.retreatC), "B to C long sightline is broken");
// 18：南岸射位、北岸土坎与桥面互相看得见（站姿）。
assert.ok(!Blocked(S.bridgeCover, S.bridgeEnemy), "the south bank and the north ridge trade fire");
// 桥心的「地面」在河槽底 -4.2，所以这条线量的是桥面而不是地面：
// 爆破区要看得见的是那座桥，不是桥下的河床。
assert.ok(!Blocked(S.blastSafe, S.bridgeSouthEnd), "the blast-safe position watches the span it is waiting on");
{
  const deck = { x: RailBridge.x, z: RailBridge.z, y: RailBridge.deckTopY + 0.9 };
  const from = { ...S.blastSafe, y: SampleMissionTerrain(S.blastSafe.x, S.blastSafe.z) + 1.6 };
  const steps = Math.ceil(Distance(S.blastSafe, RailBridge) * 5);
  let clear = true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = from.x + (deck.x - from.x) * t, z = from.z + (deck.z - from.z) * t,
      y = from.y + (deck.y - from.y) * t;
    if (SampleMissionTerrain(x, z) > y + 0.02) { clear = false; break; }
    for (const box of solids) {
      const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
      if (Math.abs(dx * cos - dz * sin) < box.w / 2 && Math.abs(dx * sin + dz * cos) < box.d / 2
        && y > box.y - box.h / 2 && y < box.y + box.h / 2) { clear = false; break; }
    }
    if (!clear) break;
  }
  assert.ok(clear, "the demolition is witnessed from the blast-safe position, over its own parapet");
}
console.log("ok sight rules: reverse slope both ways, covered litters, broken withdrawal lines, open bridge lines");

// ---------------------------------------------------------------------------
// 5. 两座桥的生命周期与后卫口袋
// ---------------------------------------------------------------------------
for (const [id, signal] of [["MissionBridgeWreck", "MissionBridgeDestroyed"],
  ["RailBridgeWreckSpan", RailBridge.signal]]) {
  const gate = Layout.gates.find((g) => g.id === id);
  assert.ok(gate, `${id} exists`);
  assert.equal(gate.appearSignal, signal, `${id} appears only once the bridge is destroyed`);
}
for (const [id, signal] of [["TemporaryBridge", "MissionBridgeDestroyed"],
  ["RailBridgeDeck", RailBridge.signal]]) {
  const gate = Layout.gates.find((g) => g.id === id);
  assert.equal(gate.signal, signal, `${id} disappears on its own signal`);
  assert.equal(gate.walkableId, id, `${id} leaves the walkable set with its mesh`);
}
assert.ok(Layout.scenario.states.some((state) => state.signal === "BunkerCollapsed"),
  "the bunker has an authored collapsed state");
assert.ok(Layout.scenario.states.some((state) => state.signal === "NightGateShown"),
  "the closing north-gate slice hangs off its own signal");
for (const pocket of Pockets) {
  assert.ok(pocket.route.some((p) => Distance(p, pocket.anchor) < 0.01),
    `${pocket.id} keeps its anchor on the route`);
  assert.deepEqual(MISSION_RETURN_ROUTES[pocket.id], pocket.route,
    "return warning follows the actual bent route");
  const next = MissionRouteNextIndex(Routes.evacuation, pocket.anchor);
  assert.ok(Distance(Routes.evacuation[next], pocket.anchor) < 0.01,
    "pursuit never selects an unrelated point by east/west coordinate");
}
// 接收院仍然是一个院子。
const bounds = Reception.bounds;
const Inside = (p) => p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ;
for (const id of ["reception", "zhouPickup", "zhouDrop", "finalCover"])
  assert.ok(Inside(A[id]), `${id} shares the reception compound`);
assert.ok(!Inside(A.rearExit) && A.rearExit.x < bounds.minX, "the back door leads west into the liaison alley");
assert.ok(S.receptionGate.x > bounds.maxX && Math.abs(S.receptionGate.z - Reception.entry.z) < 2,
  "the yard gate stands on the east wall, on the line the column already walks");
assert.ok(Reception.wardThreshold.z === Reception.ward.maxZ, "the threshold is the ward's own doorway");
console.log("ok bridge lifecycles, bunker/night scenario states, rearguard pockets and one reception compound");

console.log("ok Notion 2026.09.19 topology: four zones, southward progression, metric adjacency, sight rules");
