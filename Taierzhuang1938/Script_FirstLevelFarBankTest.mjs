// 第一关 18 · 对岸日军步坦部队（纯 Node，不启动浏览器）。
//
// 口径：docs/Data_FirstLevelBridgeFarBank.md。三块：
//   1. 数据与几何 —— 名册站得住（岸沿以北、地面平、不在实心体块里、间距够）、兵力账（同屏日军 ≤ ija 池）、
//      冲桥终点在被炸孔的北半、环境射击点离射位 ≥ 12 m 且在射程内、炮击候选点在每个玩家位置都有得选、
//      战车路线净空、撤离路线净空与坡度、撤离土岗真的把视线挡住（岗前看得见、岗后看不见）；
//   2. 纯规则 —— 分档、炮击落点判据、环境射击授权点表；
//   3. 替身宿主真跑 —— BridgeCover 放兵 / BridgeWithdraw 放真 AI 与冲桥组 / ReadyForBlast 拦起爆器 / 起爆杀伤与抛起 /
//      桥断后没有一个人能过河 / 炮击安全落点 / retreatOutOfReach 与 Retire。
import assert from "node:assert/strict";
import { MISSION_LAYOUT as Layout, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain as Ground, MISSION_TERRAIN } from "./Data_FirstLevelMissionTerrain.mjs";
import { NORTH_TERRACES, NORTH_TERRACE_WEST } from "./Data_FirstLevelWhiteboxTerrainRear.mjs";
import { CompileWhiteboxTerrain, WHITEBOX_TERRAIN_REGIONS } from "./Data_FirstLevelWhiteboxTerrain.mjs";
import { MISSION_STAGE_ROUTES as Routes, MISSION_RAIL_BRIDGE as Bridge, MISSION_NORTH_RIVER, RiverWaterAt } from "./Data_FirstLevelMissionTopology.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import {
  FAR_BANK_REAL, FAR_BANK_REAL_SPAWN_BACK_M, FAR_BANK_SHORE_A, FAR_BANK_SHORE_B, FAR_BANK_STANDBY, FAR_BANK_VANGUARD, FAR_BANK_RUSH,
  FarBankRushSlot, FAR_BANK_CROWD, FAR_BANK_FIRE_POINTS, FAR_BANK_FIRE_LISTS, FAR_BANK_TANKS, FAR_BANK_SHELL_SPOTS, FAR_BANK_REINFORCE, FAR_BANK_BLAST,
  FarBankShoreZ, FarBankPoint, FarBankTankPostZ, FarBankTankPushZ, FarBankTankVia,
} from "./Data_FirstLevelBridgeFarBank.mjs";
import { CrowdGroundY, BuildFarBankCrowdRoster, AssignCrowdWaves, FAR_BANK_CROWD_AXIS_X, FAR_BANK_CROWD_SPAWN_Z, FAR_BANK_CROWD_SLOPE_RANKS, FAR_BANK_CROWD_KEEPOUT } from "./Data_FirstLevelFarBankCrowd.mjs";
import { FarBankCrowd } from "./Script_FirstLevelFarBankCrowd.mjs";
import { FirstLevelFarBank, FarBankTier, FarBankFireList, ShellSpotVerdict, RouteDistance, FarBankWalkInVia, FarBankSpawnAt } from "./Script_FirstLevelBridgeFarBank.mjs";

const T = E.farBank;
let checks = 0;
const SOFT = process.env.FARBANK_SOFT === "1", failures = [];
const Check = (condition, message) => { if (SOFT) { if (!condition) { failures.push(message); console.log("FAIL", message); } } else assert.ok(condition, message); checks += 1; };
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------------------
// 0. 几何工具（与 Script_FirstLevelSpaceTest 同一口径）
// ---------------------------------------------------------------------------
const Scenario = Object.fromEntries(Layout.scenario.states.map((state) => [state.id, state.blocks]));
const Solids = () => [...Layout.blocks.filter((b) => b.solid !== false && !Layout.walkableSurfaces.some((surface) => surface.id === b.id)), ...Scenario.BunkerCollapsed.filter((b) => b.solid !== false)];
const solids = Solids();
function Overlap(x, z, margin, list = solids) {
  // 脚下：地面与桥面（可走面）取高者；三孔桥的桥面在河槽上方 4 m，桥上的点脚下是甲板
  let y = Ground(x, z);
  for (const surface of Layout.walkableSurfaces) if (Math.abs(x - surface.x) <= surface.w / 2 && Math.abs(z - surface.z) <= surface.d / 2) y = Math.max(y, surface.y + surface.h / 2);
  const hits = [];
  for (const box of list) {
    const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
    if (Math.abs(dx * cos - dz * sin) < box.w / 2 + margin && Math.abs(dx * sin + dz * cos) < box.d / 2 + margin
      && box.y + box.h / 2 > y + 0.3 && box.y - box.h / 2 < y + 1.9) hits.push(box.id);
  }
  return hits;
}
// 空气墙（semantic airWall）只挡角色控制器，子弹与视线穿过：视线判定不算它。
const sightSolids = solids.filter((b) => b.semantic !== "airWall");
function LineOfSight(from, to, list = sightSolids) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t, y = from.y + (to.y - from.y) * t;
    if (Ground(x, z) > y) return "terrain";
    for (const box of list) {
      const cos = Math.cos(box.ry || 0), sin = Math.sin(box.ry || 0), dx = x - box.x, dz = z - box.z;
      if (Math.abs(dx * cos - dz * sin) < box.w / 2 && Math.abs(dx * sin + dz * cos) < box.d / 2 && y > box.y - box.h / 2 && y < box.y + box.h / 2) return box.id;
    }
  }
  return null;
}
const Eye = (p, h) => ({ x: p.x, z: p.z, y: Ground(p.x, p.z) + h });

// ---------------------------------------------------------------------------
// 1. 数据与几何
// ---------------------------------------------------------------------------
{
  // 北岸岸沿：河拓宽后是 z 90，随 RiverReachAt 走
  Check(Math.abs(FarBankShoreZ(-77) - 90) < 1e-9, `北岸岸沿 z=${FarBankShoreZ(-77)}（R1a 把河往北拓宽后是 90）`);
  const water = RiverWaterAt(Bridge.x, MISSION_NORTH_RIVER);
  Check(Math.abs(FAR_BANK_BLAST.waterSouthZ - water.z1) < 1e-9 && FAR_BANK_BLAST.waterSouthZ > 150, "南水线取桥轴上的 RiverWaterAt.z1");
  Check(FAR_BANK_BLAST.centre.z === Bridge.blast.centerZ && FAR_BANK_BLAST.spanZ[0] === 136 && FAR_BANK_BLAST.spanZ[1] === 160, "被炸孔是 z 136…160、中心 148");

  const groups = { real: FAR_BANK_REAL, shoreA: FAR_BANK_SHORE_A, shoreB: FAR_BANK_SHORE_B, standby: FAR_BANK_STANDBY };
  const all = [];
  for (const [name, list] of Object.entries(groups)) for (const spec of list) all.push({ name, ...spec });
  Check(FAR_BANK_REAL.length === 8, "真战斗 AI 8 个");
  Check(FAR_BANK_SHORE_A.length === 12 && FAR_BANK_SHORE_B.length === 6 && FAR_BANK_STANDBY.length === 10, "脚本兵：岸线 12 + 补拨 6 + 待命 10");
  Check(new Set(all.map((u) => u.id)).size === all.length, "名册 id 唯一");
  const bridgeNorth = MISSION_ENCOUNTERS.bridgeNorth.length;
  const scriptedTotal = FAR_BANK_SHORE_A.length + FAR_BANK_SHORE_B.length + FAR_BANK_STANDBY.length;
  Check(FAR_BANK_REAL.length + scriptedTotal + bridgeNorth <= T.ijaCap && T.ijaCap <= 48,
    `同屏日军峰值 ${FAR_BANK_REAL.length + scriptedTotal + bridgeNorth} ≤ 上限 ${T.ijaCap} ≤ actorPool ija 48（补员另受 ijaCap 卡）`);
  Check(T.scriptedKeepMin <= scriptedTotal, "补员线不超过脚本兵总数");
  for (const u of all) {
    const shore = FarBankShoreZ(u.x);
    Check(u.z < shore - 1.5 && u.z > shore - 70, `${u.id} 站在岸沿以北 ${(shore - u.z).toFixed(1)} m`);
    Check(u.x >= -114 && u.x <= -40, `${u.id} x=${u.x} 在给对岸留的 −114…−40 里（R1a 的北岸村子在 −140…−100，交界外一点）`);
    Check(Math.abs(u.x - Bridge.x) >= 4.5 || u.name === "standby" || u.id === "FarBankRealOfficer", `${u.id} 让开桥轴`);
    Check(Overlap(u.x, u.z, 0.55).length === 0, `${u.id} 不埋在实心体块里：${Overlap(u.x, u.z, 0.55)}`);
    const ground = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([dx, dz]) => Ground(u.x + dx, u.z + dz));
    Check(Math.max(...ground) - Math.min(...ground) < 0.7 && Math.min(...ground) > -0.5, `${u.id} 脚下地面平（${ground.map((g) => g.toFixed(2))}）`);
    if (u.to) Check(Overlap(u.to.x, u.to.z, 0.55).length === 0 && Math.min(Ground(u.to.x, u.to.z)) > -0.5, `${u.id} 的踱步点站得住`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    Check(Distance(all[i], all[j]) >= 1.6 || all[i].name === "standby" && all[j].name === "standby", `${all[i].id} 与 ${all[j].id} 间距 ≥ 1.6 m`);
  // 走进来的路（FarBankWalkInVia）：从桥轴上的出生点沿桥轴走下来、再横着走到自己的位置，全程 0.5 m 内没有实心件、
  // 地面不低于 −0.5 m（前沿交通壕的尾巴 −2 m）。没有导航网格，直线走进院墙 / 壕沟的人会卡在半路（实拍：待命兵卡在 RearFarm 北墙前）。
  for (const u of all) {
    for (let n = 0; n < 5; n++) {
      const path = [FarBankSpawnAt(n, 100), ...FarBankWalkInVia(u), { x: u.x, z: u.z }];
      const bad = new Set();
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], L = Distance(a, b);
        for (let d = 0; d <= L; d += 0.5) {
          const t = L ? d / L : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          for (const id of Overlap(x, z, 0.5)) bad.add(`${id}@${x.toFixed(0)},${z.toFixed(0)}`);
          if (Ground(x, z) < -0.5) bad.add(`trench@${x.toFixed(0)},${z.toFixed(0)}`);
        }
      }
      Check(bad.size === 0, `${u.id} 走进来的路（出生点 ${n}）畅通：${[...bad].slice(0, 3)}`);
    }
  }
  // 出生点（walk-in）：离桥头 ≥ 150 m（玩家在射位 z 179 看不见），落在平地上
  for (const u of [...FAR_BANK_REAL, ...FAR_BANK_SHORE_B]) {
    const at = { x: u.x, z: FarBankShoreZ(u.x) - FAR_BANK_REAL_SPAWN_BACK_M - 20 };
    Check(Distance(at, A.bridgeCover) >= T.hiddenSpawnM, `${u.id} 出生点离射位 ≥ ${T.hiddenSpawnM} m`);
    Check(Overlap(at.x, at.z, 0.55).length === 0, `${u.id} 出生点站得住：${Overlap(at.x, at.z, 0.55)}`);
  }
  for (const [i, x] of FAR_BANK_REINFORCE.xs.entries()) {
    const at = FarBankPoint(x, FAR_BANK_REINFORCE.backM[i]);
    Check(Distance(at, A.bridgeCover) >= T.hiddenSpawnM && Overlap(at.x, at.z, 0.55).length === 0, `补员出生点 ${i} 隐蔽且站得住`);
  }

  // 冲桥组：终点在被炸孔的北半，起爆中心 4–9 m 之内；两列在桁架内净宽里
  for (let i = 0; i < 6; i++) {
    const slot = FarBankRushSlot(i);
    Check(slot.endZ >= 136 && slot.endZ <= 148, `冲桥兵 ${i} 终点 z ${slot.endZ} 在被炸孔北半（2 号墩 z 136 以南）`);
    Check(Math.abs(slot.lane - Bridge.x) <= Bridge.deckW / 2 - 0.5, `冲桥兵 ${i} 在桥面净宽里`);
    Check(Distance({ x: slot.lane, z: slot.endZ }, FAR_BANK_BLAST.centre) <= T.blastKillM - 3, `冲桥兵 ${i} 离起爆中心在杀伤圈里`);
  }
  // 两条车道从岸沿到被炸孔北半一路没有实心件、空气墙的缺口够宽（桥墩顶在桥面下，脚下是甲板，不算挡路）
  for (const lane of FAR_BANK_RUSH.lanes) {
    const hits = new Set();
    for (let z = FarBankShoreZ(lane) - 6; z <= 146; z += 0.5) for (const id of Overlap(lane, z, 0.35)) if (!/^RailBridgePier/.test(id)) hits.add(`${id}@${z}`);
    Check(hits.size === 0, `车道 x ${lane} 从岸边到被炸孔一路畅通：${[...hits].slice(0, 4)}`);
  }
  // 冲桥组与人堆从待命位 / 岸线位走到车道起点（岸沿−12，土坎北面）：路上没有实心件
  for (const [index, unitIndex] of FAR_BANK_RUSH.assign.entries()) {
    const post = FAR_BANK_STANDBY[unitIndex], lane = FarBankRushSlot(index).lane, start = { x: lane, z: FarBankShoreZ(Bridge.x) - 12 };
    const bad = new Set();
    for (let d = 0; d <= Distance(post, start); d += 0.5) {
      const t = d / Distance(post, start), x = post.x + (start.x - post.x) * t, z = post.z + (start.z - post.z) * t;
      for (const id of Overlap(x, z, 0.5)) bad.add(`${id}@${x.toFixed(0)},${z.toFixed(0)}`);
      if (Ground(x, z) < -0.5) bad.add(`trench@${x.toFixed(0)},${z.toFixed(0)}`);
    }
    Check(bad.size === 0, `冲桥兵 ${index} 从待命位到车道起点畅通：${[...bad].slice(0, 3)}`);
  }
  for (const c of FAR_BANK_CROWD) {
    const post = FAR_BANK_STANDBY.find((s) => s.id === c.from);
    if (!post) continue;
    const start = { x: c.lane, z: FarBankShoreZ(Bridge.x) - 12 }, bad = new Set(), L = Distance(post, start);
    for (let d = 0; d <= L; d += 0.5) {
      const t = d / L, x = post.x + (start.x - post.x) * t, z = post.z + (start.z - post.z) * t;
      for (const id of Overlap(x, z, 0.5)) bad.add(`${id}@${x.toFixed(0)},${z.toFixed(0)}`);
      if (Ground(x, z) < -0.5) bad.add(`trench@${x.toFixed(0)},${z.toFixed(0)}`);
    }
    Check(bad.size === 0, `人堆 ${c.from} 从待命位到车道起点畅通：${[...bad].slice(0, 3)}`);
  }
  Check(FAR_BANK_RUSH.assign.length === 6 && FAR_BANK_RUSH.assign.every((n) => n >= 0 && n < FAR_BANK_STANDBY.length), "冲桥组由待命兵担任");
  Check(FAR_BANK_VANGUARD.every((v) => all.some((u) => u.id === v.from)), "前锋从岸线名册里出");
  for (const v of FAR_BANK_VANGUARD) Check(v.post.z > FarBankShoreZ(v.post.x) && v.post.z < 112, `前锋 ${v.from} 趴在北桥台后的甲板上（z ${v.post.z}）`);

  // 桥头人堆：名册在 B 拨与深处待命兵里，车道在桥面净宽内，z 在杀伤圈之外的桥面北两孔
  for (const c of FAR_BANK_CROWD) {
    Check(all.some((u) => u.id === c.from) && !FAR_BANK_RUSH.assign.map((i) => FAR_BANK_STANDBY[i].id).includes(c.from), `人堆 ${c.from} 不与冲桥组重叠`);
    Check(Math.abs(c.lane - Bridge.x) <= Bridge.deckW / 2 - 0.5 && c.z >= 112 && c.z <= 134, `人堆 ${c.from} 在桥面北两孔的净宽里`);
    Check(Distance({ x: c.lane, z: c.z }, FAR_BANK_BLAST.centre) > T.blastKillM + 2, `人堆 ${c.from} 在起爆杀伤圈之外`);
  }
  Check(new Set(FAR_BANK_CROWD.map((c) => c.from)).size === FAR_BANK_CROWD.length, "人堆名册不重复");
  // 环境射击授权点：全在南岸（南水线之北的水面上的桥面点除外），离射位与撤出线 ≥ 12 m、离爆破组 ≥ 9 m
  const guarded = [A.bridgeCover, A.blastSafe, P.bridge.luoCover, P.bridge.heyoutianCover];
  const crew = [P.bridge.officer, ...P.bridge.demolition];
  for (const [id, p] of Object.entries(FAR_BANK_FIRE_POINTS)) {
    for (const g of guarded) Check(Distance(p, g) >= 12, `射击点 ${id} 离 (${g.x},${g.z}) ≥ 12 m（${Distance(p, g).toFixed(1)}）`);
    for (const c of crew) Check(Distance(p, c) >= 9, `射击点 ${id} 离爆破组 ≥ 9 m`);
    for (const route of [Routes.toBridge, Routes.bridgeWithdraw, Routes.marchOut]) Check(RouteDistance(p, route) >= 8 || /^deck|^pier/.test(id), `射击点 ${id} 离玩家路线 ≥ 8 m`);
  }
  for (const [key, ids] of Object.entries(FAR_BANK_FIRE_LISTS)) {
    Check(ids.every((id) => FAR_BANK_FIRE_POINTS[id]), `射击表 ${key} 的点都登记了`);
    const list = FarBankFireList(key);
    Check(FarBankFireList(key) === list && Object.isFrozen(list), `射击表 ${key} 同一份冻结引用（大脑按引用判断换没换）`);
  }
  // 射程：每个脚本兵至少有 3 个点在 8–150 m 内（AMBIENT_FIRE.minRangeM / maxRangeM）
  for (const u of [...FAR_BANK_SHORE_A, ...FAR_BANK_SHORE_B, ...FAR_BANK_STANDBY]) {
    const key = u.x < Bridge.x - 6 ? "west" : u.x > Bridge.x + 6 ? "east" : "deck";
    const inRange = FAR_BANK_FIRE_LISTS[key].filter((id) => { const d = Distance(FAR_BANK_FIRE_POINTS[id], u); return d >= 8 && d <= 150; });
    Check(inRange.length >= 3, `${u.id} 在射程内有 ≥ 3 个授权点（${inRange.length}）`);
  }
  // 冲桥兵与前锋的表（rush / deck）也得有射程内的点
  for (const key of ["rush", "deck"]) if (FAR_BANK_FIRE_LISTS[key]) Check(FAR_BANK_FIRE_LISTS[key].length >= 3, `射击表 ${key}`);
}

// 炮击候选：每个玩家会待的位置、每一档，都有 ≥ 4 个安全落点；每个落点在每辆战车的射程内至少被一辆够得着
{
  const spots = FAR_BANK_SHELL_SPOTS;
  const posts = FAR_BANK_TANKS.map((tank) => ({ x: tank.x, z: FarBankShoreZ(tank.x) - tank.pushBackM }));
  for (const spot of spots) {
    Check(Ground(spot.x, spot.z) > -0.8 && Overlap(spot.x, spot.z, 1).length === 0, `炮击点 (${spot.x},${spot.z}) 在南岸空地上`);
    Check(posts.some((post) => { const d = Distance(post, spot); return d >= 30 && d <= 175; }), `炮击点 (${spot.x},${spot.z}) 至少一辆战车够得着`);
  }
  const stands = [["射位", A.bridgeCover, "contact"], ["射位偏东", { x: -66, z: 186 }, "contact"], ["安全区", A.blastSafe, "mid"],
    ["行军途中", { x: -63, z: 224 }, "far"], ["岗前", { x: -68, z: 268 }, "far"]];
  for (const [label, at, tier] of stands) {
    const friendlies = [P.bridge.officer, ...P.bridge.demolition, P.bridge.luoCover, P.bridge.heyoutianCover, at];
    const safe = spots.filter((s) => !ShellSpotVerdict(s, { player: at, friendlies, minPlayerM: T.shellMinPlayerM[tier] }));
    Check(safe.length >= 4, `${label}（${tier} 档）安全的炮击点 ${safe.length} ≥ 4`);
  }
  // 判据本身
  Check(ShellSpotVerdict({ x: 0, z: 0 }, { player: { x: 10, z: 0 }, minPlayerM: 22, friendlies: [], routes: [] }) === "player", "离玩家太近 → player");
  Check(ShellSpotVerdict({ x: 0, z: 0 }, { player: { x: 100, z: 0 }, minPlayerM: 22, friendlies: [{ x: 5, z: 0 }], routes: [] }) === "friendly", "离己方太近 → friendly");
  Check(ShellSpotVerdict({ x: 0, z: 3 }, { player: { x: 100, z: 0 }, minPlayerM: 22, friendlies: [], routes: [[{ x: -5, z: 0 }, { x: 5, z: 0 }]] }) === "route", "离玩家路线太近 → route");
  Check(ShellSpotVerdict({ x: 0, z: 30 }, { player: { x: 100, z: 0 }, minPlayerM: 22, friendlies: [{ x: 50, z: 50 }], routes: [[{ x: -5, z: 0 }, { x: 5, z: 0 }]] }) === null, "全都够远 → 安全");
}

// 战车路线：从桥轴路堤（startX）出发，经 via 到停位；离实心体块 ≥ 2.6 m，地面起伏 < 1 m（桥面上那辆按桥面算，逐 0.5 m 坡度 ≤ 0.4）
{
  Check(FAR_BANK_TANKS.length === 3, "三辆傀儡战车");
  Check(FAR_BANK_TANKS.filter((tank) => tank.kind === "bridge").length === 1, "其中一辆开上桥面（bridge）");
  for (const tank of FAR_BANK_TANKS) {
    const shore = FarBankShoreZ(tank.x), to = FarBankTankPushZ(tank), bridgeTank = tank.kind === "bridge", terrace = tank.z != null;
    if (terrace) Check(tank.pushZ >= tank.z && tank.pushZ - tank.z <= 4, `${tank.id} 先停在台面 z ${tank.z}，BridgeWithdraw 起最多往南下压 4 m 到 ${tank.pushZ}`);
    else Check(tank.backM >= tank.pushBackM, `${tank.id} 先停在 back ${tank.backM}，BridgeWithdraw 起停位不更靠南 back ${tank.pushBackM}`);
    Check(tank.enter === "BridgeCover", `${tank.id} BridgeCover 起就进场（射位站姿的视野里要看得见三辆）`);
    const path = [{ x: tank.startX ?? tank.x, z: shore - T.tankStartBackM }, ...FarBankTankVia(tank),
      { x: tank.x, z: FarBankTankPostZ(tank) }, { x: tank.x, z: to }];
    // 桥面上那辆：等待位 → 桥轴（z 72）→ 桥台 → 桥中孔的停位 → 起爆后的停位（沿桥轴，桥面高度）
    if (bridgeTank) path.push({ x: tank.deckX, z: FarBankShoreZ(tank.deckX) - 18 }, { x: tank.deckX, z: 96 }, { x: tank.deckX, z: tank.deckPostZ }, { x: tank.deckX, z: tank.blastPostZ });
    let lo = Infinity, hi = -Infinity, hit = new Set(), maxStep = 0, lastY = null;
    const Y = (x, z) => CrowdGroundY(x, z, Ground);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], L = Distance(a, b);
      for (let d = 0; d <= L; d += 0.5) {
        const t = L ? d / L : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = Y(x, z);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        if (lastY != null) maxStep = Math.max(maxStep, Math.abs(y - lastY));
        lastY = y;
        for (const dx of [-2.6, 0, 2.6]) for (const dz of [-2.6, 0, 2.6]) for (const id of Overlap(x + dx, z + dz, 0, solids)) hit.add(id);
      }
    }
    Check(hit.size === 0, `${tank.id} 路线净空（履带宽 2.2 m + 余量）：${[...hit]}`);
    // 台地上的车：一路只越过坡地东端 ≤ 1.6 m 的缓坡，逐 0.5 m 落差 ≤ 0.13 m（≤ 14.6°），车在平台上（停位 ± 2.2 m 内地面落差 ≤ 0.5 m）
    Check(bridgeTank ? (maxStep <= 0.4 && lo > -0.6) : terrace ? (maxStep <= 0.13 && lo > -0.6) : (hi - lo < 1.0 && lo > -0.6),
      `${tank.id} 路线地面平（${lo.toFixed(2)}…${hi.toFixed(2)}，逐 0.5 m 最大落差 ${maxStep.toFixed(2)}）`);
    if (terrace) for (const z of [FarBankTankPostZ(tank), tank.pushZ]) {
      const ys = [-2.2, 0, 2.2].flatMap((dx) => [-2.2, 0, 2.2].map((dz) => Ground(tank.x + dx, z + dz)));
      Check(Math.max(...ys) - Math.min(...ys) <= 0.75, `${tank.id} 停位 (${tank.x}, ${z}) 的车体下面地面落差 ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} ≤ 0.75 m（平台，不是陡坡）`);
    }
    if (bridgeTank) {
      // 等待位：桥头以北、桥西侧路堤旁，离桥轴 ≥ 4.5 m（尾队沿桥轴 x −77 从北岸过桥，车不能挡他们的路）
      Check(Math.abs(tank.x - Bridge.x) >= 4.5 && to >= 60 && to <= 76, `${tank.id} 先等在桥头以北的空地上（x ${tank.x}，z ${to}）`);
      Check(Math.abs(tank.deckX - Bridge.x) < 0.01 && tank.deckPostZ >= 112 && tank.deckPostZ <= 126, `${tank.id} 尾队过完桥后开上桥中孔（SpanMid z 112…136）的桥面（z ${tank.deckPostZ}）`);
      Check(tank.blastPostZ > tank.deckPostZ && tank.blastPostZ + 2.15 <= Bridge.spans[0].z1 + 0.01 && tank.blastPostZ + 2.15 >= 126, `${tank.id} 起爆后停在断口北侧：车头 ${(tank.blastPostZ + 2.15).toFixed(1)} 在 2 号墩（z 136）以北 ≤ 10 m`);
      Check(Distance({ x: tank.deckX, z: tank.deckPostZ }, A.bridgeCover) >= 45, `${tank.id} 桥面停位离射位 ≥ 45 m（炮弹落点、机枪曳光另按分档避开玩家）`);
      // 桥头以北的等待位不压尾队的路线（bridgeCrossing 前两个点 (−77,70)、北桥头）
      Check(Distance({ x: tank.x, z: to }, Routes.bridgeCrossing[0]) >= 4.5, `${tank.id} 等待位离尾队起点 ≥ 4.5 m`);
    } else {
      Check(Math.abs(tank.x - Bridge.x) >= 9, `${tank.id} 不压在桥轴的铁路上`);
      Check(Distance({ x: tank.x, z: to }, { x: A.bridgeCover.x, z: A.bridgeCover.z }) >= 80, `${tank.id} 停位离射位 ≥ 80 m`);
      // R2c：台地上的车停在台面（不再是岸边空地）：第一级 / 第二级顶沿 ±4 m 内，离岸沿 20…45 m，炮口朝南岸的射线不被自己前面的台地挡住（车头前 10 m 内地面不高于炮口）
      const level = Ground(tank.x, FarBankTankPostZ(tank));
      Check(terrace && level > 1.0 && level < 4.5 && shore - to >= 20 && shore - to <= 45, `${tank.id} 在坡地台面上（地面 ${level.toFixed(2)} m，岸沿以北 ${(shore - to).toFixed(1)} m）`);
      let muzzleY = level + 2.0, blocked = false;
      for (let d = 3; d <= 12; d += 1) if (Ground(tank.x, to + d) > muzzleY - 0.3) blocked = true;
      Check(!blocked, `${tank.id} 炮口前 12 m 内没有更高的地面挡着（台沿以南是下坡）`);
    }
  }
}

// 撤离路线：净空、坡度、岗前看得见岗后看不见
{
  const route = Routes.marchOut;
  let length = 0, maxSlope = 0; const hit = new Set();
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], L = Distance(a, b); length += L;
    for (let d = 0; d <= L; d += 0.4) {
      const t = d / L, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const id of Overlap(x, z, 0.35)) hit.add(`${id}@${x.toFixed(0)},${z.toFixed(0)}`);
      const y0 = Ground(x, z), y1 = Ground(x + (b.x - a.x) / L * 0.5, z + (b.z - a.z) / L * 0.5);
      maxSlope = Math.max(maxSlope, Math.abs(y1 - y0) / 0.5);
    }
  }
  Check(hit.size === 0, `marchOut 胶囊净空：${[...hit]}`);
  Check(maxSlope < Math.tan(30 * Math.PI / 180), `marchOut 最陡 ${maxSlope.toFixed(2)}（担架与人都走得上，< 30°）`);
  Check(length > 100 && length < 130, `marchOut ${length.toFixed(1)} m：blastSafe 起约 110 m`);
  Check(Routes.marchOut.at(-1) === A.marchOut && A.marchOut.z > 290, "路线终点就是 marchOut 锚点，离北岸 > 200 m");
  Check(Routes.bridgeCrossing.at(-1).x === -62 && Routes.bridgeCrossing.at(-1).z === 232, "尾队线终点是 (−62,232)，与 marchOut 解耦");
  const bank = Eye(FarBankPoint(-77, 5), 1.5);
  let firstHidden = null, lastVisible = null;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], L = Distance(a, b);
    for (let d = 0; d < L; d += 2) {
      const t = d / L, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const dz = z - FarBankShoreZ(x), blocked = LineOfSight(Eye({ x, z }, 1.65), bank);
      if (blocked === "terrain" && firstHidden == null) firstHidden = dz;
      if (blocked == null) lastVisible = dz;
    }
  }
  Check(lastVisible != null && lastVisible >= 140, `离北岸 ≥ 140 m 一路都还看得见对岸（回头看那两张图要用）：lastVisible ${lastVisible}`);
  Check(firstHidden != null && firstHidden > 170 && firstHidden < T.outDzM + 8, `地形在离北岸 ${firstHidden?.toFixed(0)} m 起把视线挡住（岗后）`);
  const end = Eye(A.marchOut, 1.65);
  for (const dx of [-25, 0, 25]) Check(LineOfSight(end, Eye(FarBankPoint(-77 + dx, 5), 1.5)) !== null, `终点看不见对岸 x ${-77 + dx} 的人`);
  Check(A.marchOut.z - FarBankShoreZ(A.marchOut.x) >= T.outDzM, "终点在 outDzM 之外");
}

// ---------------------------------------------------------------------------
// 2. 纯规则
// ---------------------------------------------------------------------------
Check(FarBankTier(89) === "contact" && FarBankTier(99.9) === "contact" && FarBankTier(100) === "mid" && FarBankTier(129) === "mid"
  && FarBankTier(130) === "far" && FarBankTier(169) === "far" && FarBankTier(170) === "out" && FarBankTier(300) === "out", "分档边界");
Check(FarBankTier(A.bridgeCover.z - FarBankShoreZ(A.bridgeCover.x)) === "contact", "射位（89 m）是 contact 档");
Check(FarBankTier(A.blastSafe.z - FarBankShoreZ(A.blastSafe.x)) === "mid", "安全区（111 m）是 mid 档");
Check(T.tierM[0] < T.tierM[1] && T.tierM[1] < T.tierM[2] && T.tierM[2] < T.outDzM, "分档递增，黑屏线在最远档之外");
Check(T.outDzM < T.outFallbackDzM && T.outFallbackDzM <= A.marchOut.z - FarBankShoreZ(A.marchOut.x) + 20, "黑屏兜底线不越过终点太多");

// ---------------------------------------------------------------------------
// 3. 替身宿主
// ---------------------------------------------------------------------------
function FakeVec(x, y, z) { return { x, y, z, normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; } }; }
function FakeActor(id, x, z, options = {}) {
  const actor = {
    id, alive: true, side: "ija", weaponId: options.weapon, stance: 0, order: null, holdZone: null, target: null, targetVisible: false,
    position: { x, y: 0, z }, yaw: 0, scriptedNoncombatant: false,
    goal: { x, y: 0, z, set(nx, ny, nz) { this.x = nx; this.z = nz; } },
    Kill(direction) { this.alive = false; this.killedBy = direction; return true; },
  };
  return actor;
}
function FakeRuntime() {
  const facts = new Set(), records = [];
  const r = {
    time: 0, dt: 1 / 20,
    player: { position: { x: A.bridgeCover.x, y: 0, z: A.bridgeCover.z }, EyePosition: { x: A.bridgeCover.x, y: 1.65, z: A.bridgeCover.z } },
    squad: [{ alive: true, position: { x: -79.4, y: 0, z: 180.2 } }, { alive: true, position: { x: -84.2, y: 0, z: 179 } }],
    extras: { list: [], State() { return this.list; }, Actor(id) { return this.map?.get(id) || null; }, map: new Map() },
    enemies: new Map(), soldiers: [], removed: [], fired: [], shells: [], bullets: [], flash: [],
    battlefield: { GroundHeight: () => 0 },
    camera: null,
    vfx: { MuzzleFlash(from, dir, opts) { r.flash.push({ ...opts }); } },
    Has: (id) => facts.has(id),
    Record(id, detail) { if (facts.has(id)) return false; facts.add(id); records.push({ id, detail }); return true; },
    Point: (point, rise = 0) => FakeVec(point.x, rise, point.z),
    InstallSentry() {},
    MoveActor(actor, point, speed) {
      if (!actor?.alive) return;
      actor.order = "advance"; actor.holdZone = null;
      const d = Distance(actor.position, point), step = Math.min(d, speed * r.dt);
      if (d > 1e-6) { actor.position.x += (point.x - actor.position.x) / d * step; actor.position.z += (point.z - actor.position.z) / d * step; }
      actor.moved = (actor.moved || 0) + step;
    },
    Defend(actor, point, radius) { actor.order = "hold"; actor.scriptedNoncombatant = false; actor.holdZone = { ...point, radius }; },
    ai: {
      spawnFailures: 0,
      Spawn(side, x, z, options) {
        if (r.ai.spawnFailures > 0) { r.ai.spawnFailures -= 1; return null; }
        const actor = FakeActor(`S${r.soldiers.length}`, x, z, options); r.soldiers.push(actor); return actor;
      },
      Remove(actor) { actor.alive = false; actor.removed = true; r.removed.push(actor.missionId); r.soldiers.splice(r.soldiers.indexOf(actor), 1); },
      SetStance(actor, stance) { actor.stance = stance; },
      CountSide() { return r.soldiers.filter((a) => a.alive).length + [...r.enemies.values()].filter((a) => a.alive).length; },
    },
    combat: {
      FireShell(from, at, options) { r.shells.push({ from: { ...from }, at: { x: at.x, z: at.z }, options }); },
      PredictShellImpact(from, at) { return { x: at.x, y: 0, z: at.z }; },
    },
    FireVehicleBullet(from, dir, options) { r.bullets.push({ options, dir: { ...dir } }); return true; },
    BlocksSight(from, to) { return LineOfSight({ x: from.x, z: from.z, y: Ground(from.x, from.z) + 1.65 }, { x: to.x, z: to.z, y: Ground(to.x, to.z) + to.y }) !== null; },
  };
  r.facts = facts; r.records = records;
  // 己方桥头人员（extras）：位置固定在射位一带
  for (const [id, point] of [["BridgeOfficer", P.bridge.officer], ["BridgeDemolitionWest", P.bridge.demolition[0]], ["BridgeDemolitionEast", P.bridge.demolition[1]]]) {
    r.extras.list.push({ id, alive: true, x: point.x, z: point.z }); r.extras.map.set(id, { id, alive: true });
  }
  return r;
}
const Run = (bank, r, seconds, step) => { for (let i = 0; i < Math.round(seconds / r.dt); i++) { r.time += r.dt; bank.Update(r.dt, step); } };

{
  const r = FakeRuntime();
  const bank = new FirstLevelFarBank(r, { vec: FakeVec });
  // 18 之外什么也不做
  bank.Enter("Transfer"); Run(bank, r, 1, "Transfer");
  Check(!bank.started && r.soldiers.length === 0, "18 以外的步骤对岸空无一人");
  // BridgeCover：放兵，慢慢走进来
  bank.Enter("BridgeCover");
  Run(bank, r, 2, "BridgeCover");
  Check(bank.started && bank.State().pending > 10, "BridgeCover 起排队放兵（第一拨 12 + 10）");
  Run(bank, r, 30, "BridgeCover");
  let s = bank.State();
  Check(s.shore >= 10 && s.standby >= 8, `30 s 内第一拨陆续生成：岸线 ${s.shore} 待命 ${s.standby}`);
  Check(s.real === 0, "真 AI BridgeWithdraw 才放出");
  Check(bank.tanks.some((t) => t.state !== "queued"), "T1 已经开动");
  r.player.position.z = A.bridgeCover.z;
  Run(bank, r, 40, "BridgeCover");
  s = bank.State();
  Check(s.shore === 12 && s.standby === 10, `70 s 后第一拨到齐：岸线 ${s.shore} 待命 ${s.standby}`);
  Check(s.ijaCount <= T.ijaCap, "同屏日军不超上限");
  Check(bank.tanks.filter((t) => t.state === "posted").length >= 2, "T1、T2 到位停车");
  Check(bank.tanks.filter((t) => t.spec.kind !== "bridge").every((t) => t.z < FarBankShoreZ(t.x) - 5), "岸边两辆停在岸沿以北");
  const bt = bank.tanks.find((t) => t.spec.kind === "bridge");
  Check(bt.state === "posted" && Math.abs(bt.x - Bridge.x) >= 4.5 && bt.z < 76, `桥面上那辆先等在桥头以北，不挡尾队过桥（x ${bt.x.toFixed(1)}，z ${bt.z.toFixed(1)}）`);
  Check(bank.tanks.every((t) => t.state === "posted"), "三辆都到位停车");
  // 岸线兵到了射位，环境射击授权点轮换：同时 ≤ ambientMax
  const armed = r.soldiers.filter((a) => a.ambientFirePoints);
  Check(armed.length > 0 && armed.length <= T.ambientMax, `环境射击同时 ${armed.length} 人（≤ ${T.ambientMax}）`);
  Check(armed.every((a) => a.scriptedNoncombatant && a.missionUntargetable), "脚本兵是 scriptedNoncombatant 且班里人不隔河点名");
  Check(!r.shells.length, "BridgeCover 不炮击（只有机枪曳光）");
  // southBankReached 之后 mgStartAfterS 秒起车载机枪，damageScale 0
  r.Record("southBankReached");
  Run(bank, r, T.mgStartAfterS + 12, "BridgeCover");
  Check(r.bullets.length > 0 && r.bullets.every((b) => b.options.damageScale === 0 && b.options.weaponId === "Type11"), `车载机枪只打曳光（${r.bullets.length} 发，damageScale 0）`);
  // bridgeFireBroken → T3 进场、前锋上桥；rearColumnCrossed → 前锋回岸
  r.Record("bridgeFireBroken");
  Run(bank, r, 4, "BridgeCover");
  Check(bank.tanks.find((t) => t.spec.kind === "bridge").z < 76, "尾队还没过完桥，桥面上那辆仍等在桥头以北（不堵桥）");
  Run(bank, r, 22, "BridgeCover");
  s = bank.State();
  Check(s.vanguard === 2, "两个前锋冲上桥");
  const vg = FAR_BANK_VANGUARD.map((v) => bank.byId.get(v.from).actor);
  Check(vg.every((a) => a.position.z > 95 && a.position.z < 106), `前锋趴在北桥台后的甲板上（z ${vg.map((a) => a.position.z.toFixed(1))}）`);
  r.Record("rearColumnCrossed");
  Run(bank, r, 15, "BridgeCover");
  Check(vg.every((a) => a.position.z < 92), "尾队过完桥，前锋退回岸边");
  Check(s.bank.southBank === 0, "任何时候没有人过南水线");

  // BridgeWithdraw：真 AI 8 + 补拨 6 走进来；冲桥组起跑；起爆器被拦到位
  bank.Enter("BridgeWithdraw");
  Check(r.extras.map.get("BridgeOfficer").missionUntargetable === true && r.extras.map.get("BridgeDemolitionEast").missionUntargetable === true, "桥头人员对岸真 AI 不点名");
  Run(bank, r, 1, "BridgeWithdraw");
  Check(bank.ReadyForBlast(0.05) === false, "冲桥组还没到位，起爆器被拦住");
  // 与 FirstLevelBridge.UpdateWithdraw 一样每帧问一次，记下第一次放行的时刻
  // （Bridge 只在药装好、玩家到安全区、爆破区清空之后才问，实机大约 14 s 起；这里从第 14 s 起问）
  let releasedAt = null, blockedFrames = 0;
  for (let i = 0; i < Math.round(40 / r.dt); i++) {
    r.time += r.dt; bank.Update(r.dt, "BridgeWithdraw");
    if (i * r.dt < 13) continue;
    if (bank.ReadyForBlast(r.dt)) { if (releasedAt == null) releasedAt = r.time; } else blockedFrames += 1;
  }
  Check(releasedAt != null && blockedFrames > 20, `起爆器被拦了 ${blockedFrames} 帧，放行时刻 ${releasedAt?.toFixed(1)}`);
  s = bank.State();
  const deckTank = bank.tanks.find((t) => t.spec.kind === "bridge");
  Check(deckTank.state === "posted" && Math.abs(deckTank.x - Bridge.x) < 0.5 && deckTank.z >= 112 && deckTank.z <= 126, `尾队过完桥后桥面上那辆开上桥中孔（x ${deckTank.x.toFixed(1)}, z ${deckTank.z.toFixed(1)}）`);
  Check(s.rushState.settled && !s.rushState.timedOut, "冲桥组是到位站稳放行的，不是超时放行");
  Check(s.real === 8 && s.shore === 12 + 6 || s.shore >= 16, `第二拨到位：真 AI ${s.real} 岸线 ${s.shore}`);
  Check(s.rushState.started && s.rush === 6, "冲桥组 6 人");
  Check(s.rushState.arrived, `冲桥组到位（z ${s.rushState.minZ.toFixed(1)}…${s.rushState.maxZ.toFixed(1)}）`);
  Check(s.rushState.maxZ <= 148 && s.rushState.minZ >= 136, "冲桥组停在被炸孔北半 z 136…148");
  // 桥头人堆：八个人涌上桥面北两孔，单膝跪着，全在起爆杀伤圈之外
  const crowd = bank.units.filter((u) => u.crowdPost && u.actor.alive);
  Check(crowd.length === 8 && crowd.every((u) => u.mode === "crowded"), `桥头人堆 8 人到位（${crowd.map((u) => u.mode)}）`);
  Check(crowd.every((u) => u.actor.position.z >= 112 && u.actor.position.z <= 134 && u.actor.stance === 1), "人堆在桥面北两孔（z 112…134）单膝跪着");
  Check(s.ijaCount <= T.ijaCap, `同屏日军 ${s.ijaCount} ≤ ${T.ijaCap}`);
  // 真 AI 分档开火权
  const real = FAR_BANK_REAL.map((u) => bank.byId.get(u.id)?.actor).filter(Boolean);
  Check(real.length === 8, "八个真 AI 都在");
  Check(real.every((a) => a.order === "hold" && a.scriptedNoncombatant === false), "真 AI 到位就是守区兵");
  Check(real.filter((a) => a.missionFireHold === false).length === T.realShooters
    && real.filter((a) => a.missionFireHold === false).every((a) => a.weaponId === "Type11"), "contact 档只有机枪手轮换真开火");
  Check(real.filter((a) => a.missionFireHold).every((a) => a.missionFireSuppressOnly), "其余只压制");
  r.player.position.z = A.blastSafe.z; Run(bank, r, 1, "BridgeWithdraw");
  Check(real.every((a) => a.missionFireHold && a.missionFireSuppressOnly), "mid 档全体真 AI 只压制");
  // 炮击：BridgeWithdraw 起，落点安全
  Run(bank, r, 40, "BridgeWithdraw");
  s = bank.State();
  Check(s.shells.fired >= 3, `战车炮击了 ${s.shells.fired} 发`);
  Check(r.shells.every((sh) => sh.options.damage === 0 && sh.options.feedbackOnly === true && sh.options.kind === "Shell57"), "炮弹零伤害、只给反馈");
  Check(s.shells.minPlayerM >= T.shellMinPlayerM.contact && s.shells.minFriendlyM >= T.shellFriendlyM,
    `落点离玩家最近 ${s.shells.minPlayerM} m、离己方最近 ${s.shells.minFriendlyM} m`);
  const shellTimes = s.shells.log.map((e) => e.t);
  for (let i = 1; i < shellTimes.length; i++) Check(shellTimes[i] - shellTimes[i - 1] >= T.shellGlobalGapS - 0.2, "全场炮击间隔 ≥ shellGlobalGapS");
  // 起爆器放行 → 起爆
  Check(bank.ReadyForBlast(0.05) === true, "冲桥组到位并站稳，起爆器放行");
  const before = bank.State();
  bank.OnBridgeBlast();
  Run(bank, r, 0.1, "BridgeWithdraw");
  Check(bank.State().blastKilled === 0, "起爆后 0.25 s 才炸死（火球先起）");
  Run(bank, r, 0.4, "BridgeWithdraw");
  s = bank.State();
  Check(s.blastKilled === 6, `桥面上的 ${s.blastKilled} 个日军被炸死（冲桥组 6）`);
  const thrown = bank.units.filter((u) => u.blastKilled);
  Check(thrown.every((u) => u.actor.alive === false && u.actor.deathPush.y >= 5 && Math.hypot(u.actor.deathPush.x, u.actor.deathPush.z) <= 3),
    "死者带向上的初速（deathPush 抛起），水平只有几米每秒（跟着那一孔落河）");
  Run(bank, r, T.corpseRemoveS + 1, "BridgeWithdraw");
  Check(thrown.every((u) => u.removed), `尸体 ${T.corpseRemoveS} s 后移除（不留在半空）`);
  Run(bank, r, T.bankSettleS + 2, "BridgeWithdraw");
  s = bank.State();
  Check(s.bank.southBank === 0 && s.bank.southMostZ <= FAR_BANK_BLAST.spanZ[1], `全程没有人过河：最南 z ${s.bank.southMostZ}`);
  Check(s.bank.overAfterSettle === 0, "桥断 14 s 后对岸活着的人全在岸沿以北（停在岸边隔河射击）");
  Check(deckTank.advanced && deckTank.state === "posted" && deckTank.z >= 126 && deckTank.z + 2.15 <= 136, `桥断后桥面上那辆开到断口北侧停下（z ${deckTank.z.toFixed(1)}，车头 ${(deckTank.z + 2.15).toFixed(1)}）`);
  Check(s.alive >= T.scriptedKeepMin && s.real === 8, `对岸仍有 ${s.alive} 人（补员线 ${T.scriptedKeepMin}）`);
  Check(s.ijaCount <= T.ijaCap, "补员不越过 ijaCap");
  // 补员：死一批，从隐蔽点补
  const victims = bank.units.filter((u) => u.kind === "shore" && u.actor.alive).slice(0, 8);
  for (const v of victims) v.actor.alive = false;
  Run(bank, r, 30, "BridgeWithdraw");
  s = bank.State();
  Check(s.reinforced > 0 && s.scripted >= T.scriptedKeepMin - 1, `补员 ${s.reinforced} 人，脚本兵回到 ${s.scripted}`);
  Check(s.ijaCount <= T.ijaCap, "补员之后仍不超上限");
  Check(bank.pending.every((p) => Distance(p.at, A.bridgeCover) >= T.hiddenSpawnM), "补员从视线外出生");
  // 分档：far 档环境射击停、炮弹改远雷
  r.player.position.x = -63; r.player.position.z = 236; Run(bank, r, 6, "NightMarch");
  Check(bank.tier === "far" && r.soldiers.every((a) => !a.ambientFirePoints), "far 档环境射击全停");
  const shellCount = r.shells.length;
  Run(bank, r, 40, "NightMarch");
  const newShells = r.shells.slice(shellCount);
  Check(newShells.every((sh) => Distance(sh.at, r.player.position) >= T.shellMinPlayerM.far), "far 档炮弹落点 ≥ 48 m（远雷）");
  // 黑屏条件
  Check(!r.Has("retreatOutOfReach"), "还在 far 档不算出了射程");
  r.player.position.x = -80; r.player.position.z = 284; r.player.EyePosition = { x: -80, y: Ground(-80, 284) + 1.65, z: 284 };
  Run(bank, r, 1, "NightMarch");
  Check(!r.Has("retreatOutOfReach"), "离北岸 194 m 但还没连续看不见 1.5 s 不算");
  r.player.position.x = -98; r.player.position.z = 295; r.player.EyePosition = { x: -98, y: Ground(-98, 295) + 1.65, z: 295 };
  Run(bank, r, 2.2, "NightMarch");
  Check(r.Has("retreatOutOfReach"), `终点：dz ${bank.State().out.dz}、岗挡视线、连续 ${T.blindS} s 看不见 → retreatOutOfReach`);
  // 真 AI 看得见玩家就重新计时
  const bank2 = new FirstLevelFarBank(FakeRuntime(), { vec: FakeVec });
  const r2 = bank2.r; r2.player.position.x = -98; r2.player.position.z = 295; r2.player.EyePosition = { x: -98, y: Ground(-98, 295) + 1.65, z: 295 };
  const spotter = FakeActor("Spotter", -70, 80); spotter.target = r2.player; spotter.targetVisible = true;
  bank2.units.push({ kind: "real", actor: spotter, mode: "post", id: "Spotter", spec: {} });
  Run(bank2, r2, 3, "NightMarch");
  Check(!r2.Has("retreatOutOfReach"), "对岸真 AI 看得见玩家，黑屏条件不成立");
  spotter.targetVisible = false; Run(bank2, r2, T.blindS + 0.5, "NightMarch");
  Check(r2.Has("retreatOutOfReach"), "看不见满 blindS 秒才成立");
  // 绕开土岗走空地的兜底
  // 找一条走空地绕开土岗与院子的纵线：从对岸单位到 dz = outFallbackDzM 视线通畅
  let openX = null;
  for (let x = -140; x <= -20 && openX == null; x += 2) {
    const z = FarBankShoreZ(x) + T.outFallbackDzM + 1;
    if (LineOfSight(Eye({ x, z }, 1.65), Eye({ x, z: FarBankShoreZ(x) - 10 }, 1.3)) == null) openX = x;
  }
  Check(openX != null, `走空地绕开土岗：存在一条 dz ${T.outFallbackDzM} 处仍看得见对岸的纵线（x ${openX}）`);
  const bank3 = new FirstLevelFarBank(FakeRuntime(), { vec: FakeVec });
  const r3 = bank3.r;
  const Stand = (dz) => { const z = FarBankShoreZ(openX) + dz; r3.player.position.x = openX; r3.player.position.z = z; r3.player.EyePosition = { x: openX, y: Ground(openX, z) + 1.65, z }; };
  bank3.units.push({ kind: "real", actor: FakeActor("Far", openX, FarBankShoreZ(openX) - 10), mode: "post", id: "Far", spec: {} });
  Stand(T.outDzM + 10); Run(bank3, r3, 3, "NightMarch");
  Check(!r3.Has("retreatOutOfReach"), "远但看得见：不到兜底线不放行");
  Stand(T.outFallbackDzM + 1); Run(bank3, r3, 3, "NightMarch");
  Check(r3.Has("retreatOutOfReach"), "走空地绕开土岗：dz ≥ outFallbackDzM 兜底放行");
  // Retire：黑屏里对岸全部收走
  const alive = bank.State().alive;
  bank.Retire();
  Check(alive > 0 && r.soldiers.filter((a) => a.farBank).length === 0 && bank.State().alive === 0 && bank.retired, "Retire 收走所有对岸单位");
  Run(bank, r, 5, "NightMarch");
  Check(r.soldiers.length === 0, "Retire 之后不再放兵");
  // 回跳到 18 以前：整个撤掉、状态清零
  const bank4 = new FirstLevelFarBank(FakeRuntime(), { vec: FakeVec });
  bank4.Enter("BridgeCover"); Run(bank4, bank4.r, 10, "BridgeCover");
  Check(bank4.State().spawned > 0, "阶段跳转夹具：先有兵");
  bank4.Enter("Death");
  Check(!bank4.started && bank4.r.soldiers.length === 0, "回跳到 17：对岸整个撤掉");
  // 直接跳进 BridgeWithdraw：第一拨直接摆在射位，不必走
  const bank5 = new FirstLevelFarBank(FakeRuntime(), { vec: FakeVec });
  bank5.Enter("BridgeWithdraw"); Run(bank5, bank5.r, 3, "BridgeWithdraw");
  Check(bank5.State().shore >= 6 && bank5.State().standby + bank5.State().rush >= 8, "跳进 BridgeWithdraw：第一拨直接站在射位上 " + JSON.stringify(bank5.State()).slice(0, 400));
  // 满员时放兵推迟不丢
  const bank6 = new FirstLevelFarBank(FakeRuntime(), { vec: FakeVec });
  bank6.r.ai.spawnFailures = 6; bank6.Enter("BridgeCover"); Run(bank6, bank6.r, 60, "BridgeCover");
  Check(bank6.State().spawned === 22, `spawn 失败（满员）会重试，最后 22 个都放出来了（${bank6.State().spawned}）`);
}

// ---------------------------------------------------------------------------
// 4. 规模感：纯视觉的远景人群（docs/Data_FirstLevelBridgeFarBank.md §10）
// ---------------------------------------------------------------------------
{
  const K = E.farBank.crowd;
  const roster = AssignCrowdWaves(BuildFarBankCrowdRoster(), K.waves);
  const kinds = (kind) => roster.filter((u) => u.kind === kind);
  Check(roster.length >= 300, `视觉人群名册 ${roster.length} ≥ 300（另有 R2 的真 AI 与脚本兵 ${FAR_BANK_REAL.length + FAR_BANK_SHORE_A.length + FAR_BANK_SHORE_B.length + FAR_BANK_STANDBY.length}）`);
  Check(roster.length >= 380 && roster.length <= 512, `视觉人群名册 ${roster.length} 在 380…512（ActorCrowd 容量 512）`);
  Check(kinds("shore").length >= 120 && kinds("slope").length >= 140 && kinds("bridge").length >= 30 && kinds("reserve").length >= 40,
    `岸线 ${kinds("shore").length}、坡地 ${kinds("slope").length}、桥头纵队 ${kinds("bridge").length}、留守 ${kinds("reserve").length}`);
  Check(new Set(roster.map((u) => u.id)).size === roster.length, "视觉人群 id 唯一");
  Check(roster.filter((u) => u.flag).length >= 10 && roster.filter((u) => u.sword).length >= 6, `旗 ${roster.filter((u) => u.flag).length} 面、刀 ${roster.filter((u) => u.sword).length} 把`);
  Check(roster.every((u) => ["cover", "fire", "withdraw", "blast"].includes(u.wave)), "每个人都分到一拨");
  const waveShare = Object.fromEntries(K.waves.map((w) => [w.id, roster.filter((u) => u.wave === w.id).length / roster.length]));
  Check(K.waves.every((w) => Math.abs(waveShare[w.id] - w.share) < 0.02), `分拨占比 ${JSON.stringify(waveShare)}`);
  // 站位：站得住、不压真 AI 的名册位、不互相叠
  const r2 = [...FAR_BANK_REAL, ...FAR_BANK_SHORE_A, ...FAR_BANK_SHORE_B, ...FAR_BANK_STANDBY];
  const overlapBad = [], groundBad = [], r2Bad = [], packBad = [];
  for (const u of roster) {
    const g = CrowdGroundY(u.post.x, u.post.z, Ground);
    if (Overlap(u.post.x, u.post.z, 0.4).length) overlapBad.push(`${u.id}@${u.post.x},${u.post.z}:${Overlap(u.post.x, u.post.z, 0.4)}`);
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => CrowdGroundY(u.post.x + dx, u.post.z + dz, Ground));
    if (g < -0.6 || (g !== Bridge.deckTopY && Math.max(g, ...around) - Math.min(g, ...around) > 0.9)) groundBad.push(`${u.id}:${g.toFixed(2)}`);
    if (r2.some((p) => Distance(p, u.post) < 1.2)) r2Bad.push(u.id);
  }
  for (let i = 0; i < roster.length; i++) for (let j = i + 1; j < roster.length; j++) if (Distance(roster[i].post, roster[j].post) < 0.62) packBad.push(`${roster[i].id}/${roster[j].id}`);
  Check(overlapBad.length === 0, `视觉人群站位不埋在实心体块里：${overlapBad.slice(0, 4)}（${overlapBad.length}）`);
  Check(groundBad.length === 0, `视觉人群脚下地面平、不在壕里：${groundBad.slice(0, 4)}（${groundBad.length}）`);
  Check(r2Bad.length === 0, `不压真 AI / 脚本兵的名册位：${r2Bad.slice(0, 4)}`);
  Check(packBad.length === 0, `人与人间距 ≥ 0.62 m：${packBad.slice(0, 4)}（${packBad.length}）`);
  // 战车让路：坡地与岸线几排不压台地上两辆车的车体（先停位与下压后的位置都算），也不贴车体 3.4 m 内（坡地与留守）
  for (const t of FAR_BANK_TANKS.filter((tank) => tank.kind !== "bridge")) {
    for (const tz of [FarBankTankPostZ(t), FarBankTankPushZ(t)]) {
      const clash = roster.filter((u) => Math.abs(u.post.x - t.x) < 1.6 && Math.abs(u.post.z - tz) < 2.9);
      Check(clash.length === 0, `${t.id} 车体上（z ${tz}）没有人：${clash.map((u) => u.id)}`);
      const near = roster.filter((u) => (u.kind === "slope" || u.kind === "reserve") && Distance(u.post, { x: t.x, z: tz }) < 3.4);
      Check(near.length === 0, `${t.id} 车体旁 3.4 m 内没有坡地 / 留守的人：${near.map((u) => u.id)}`);
    }
  }
  // 桥面上那辆的等待位旁也不站人
  for (const t of FAR_BANK_TANKS.filter((tank) => tank.kind === "bridge")) {
    const clash = roster.filter((u) => u.kind !== "bridge" && Distance(u.post, { x: t.x, z: FarBankTankPostZ(t) }) < 2.9);
    Check(clash.length === 0, `${t.id} 等待位上没有人：${clash.map((u) => u.id)}`);
  }
  // 路线：逐 0.5 m 量净空（0.4 m 内无实心件、地面不低于 −0.6 m）
  const routeBad = new Set();
  let longest = 0;
  for (const u of roster) {
    const path = [u.spawn ?? { x: FAR_BANK_CROWD_AXIS_X + u.lane, z: FAR_BANK_CROWD_SPAWN_Z }, ...u.route];
    let L = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], d = Distance(a, b); L += d;
      for (let k = 0; k <= d; k += 0.5) {
        const t = d ? k / d : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (Overlap(x, z, 0.4).length) routeBad.add(`${u.id}:${Overlap(x, z, 0.4)[0]}@${x.toFixed(0)},${z.toFixed(0)}`);
        if (CrowdGroundY(x, z, Ground) < -0.6) routeBad.add(`${u.id}:trench@${x.toFixed(0)},${z.toFixed(0)}`);
      }
    }
    longest = Math.max(longest, L);
  }
  Check(routeBad.size === 0, `视觉人群的路线畅通：${[...routeBad].slice(0, 5)}（${routeBad.size}）`);
  Check(longest / K.runMps < 60, `最长的一条路跑 ${(longest / K.runMps).toFixed(0)} s < 60 s（第一拨在射位站姿的 60 s 观察点前到齐）`);
  // 出生点在视线外：离射位 ≥ 150 m
  Check(Distance({ x: FAR_BANK_CROWD_AXIS_X, z: FAR_BANK_CROWD_SPAWN_Z }, A.bridgeCover) >= 150, "出生点离射位 ≥ 150 m");
  // 桥面上的人在桥面净宽里，z 在 SpanNorth / SpanMid（起爆杀伤圈 z ≥ 135 以北），排在 R2 人堆（z ≥ 120）之后
  for (const u of kinds("bridge")) Check(Math.abs(u.post.x - Bridge.x) <= Bridge.deckW / 2 - 0.3 && u.post.z >= 92 && u.post.z < 118, `${u.id} 在桥面净宽里、桥北两孔、R2 人堆之后 (${u.post.x}, ${u.post.z})`);

  // 替身宿主：时间线
  const sink = { pushes: [], Push(kind, position, yaw, scale, prone, dead, pose) { this.pushes.push({ kind, x: position.x, y: position.y, z: position.z, pose }); } };
  const view = { visible: () => true };
  const crowd = new FarBankCrowd({ ground: Ground, targets: { west: [{ x: -100, z: 165, h: 0.4, r: 2 }], east: [{ x: -60, z: 165, h: 0.4, r: 2 }] } });
  const dt = 1 / 20;
  const Tick = (seconds, ctx) => { for (let i = 0; i < Math.round(seconds / dt); i++) { crowd.Update(dt, ctx); sink.pushes.length = 0; crowd.Draw(sink, view); } };
  crowd.Update(dt, {});
  Check(crowd.State().onField === 0, "没 Start 之前一个人也没有");
  crowd.Start(false);
  Tick(20, { tier: "contact" });
  let cs = crowd.State();
  Check(cs.onField > 60 && cs.running > 40, `Cover +20 s：上场 ${cs.onField}、在路上 ${cs.running}（纵队沿路堤涌来）`);
  Check(sink.pushes.length === cs.onField && sink.pushes.every((p) => p.kind === "ija"), "每个上场的人这一帧 Push 一次（ija 姿势桶）");
  Check(sink.pushes.some((p) => p.pose.moveSpeedMps > 1 && Number.isFinite(p.pose.phase)), "跑动的人带步态相位（跑步翻页桶）");
  Tick(40, { tier: "contact" });
  cs = crowd.State();
  Check(cs.arrived >= 100 && cs.holding >= 100, `Cover +60 s：到位 ${cs.arrived}、在位 ${cs.holding}`);
  const stances = new Set(sink.pushes.filter((p) => !(p.pose.moveSpeedMps > 0)).map((p) => p.pose.stance));
  Check(stances.has(0) && stances.has(1) && stances.has(2), "在位的人有站、跪、卧三种姿势");
  Check(cs.flashes > 100, `枪口焰事件 ${cs.flashes} 个（contact 档 ${K.flashHz.contact} Hz）`);
  crowd.TakeShots();
  Tick(3, { tier: "contact" });
  const shots2 = crowd.TakeShots();
  Check(shots2.length >= 50 && shots2.length <= 90, `contact 档 3 s 出 ${shots2.length} 个枪口焰事件`);
  Check(shots2.every((e) => e.to.z > 150 && Math.abs(Math.hypot(e.dir.x, e.dir.y, e.dir.z) - 1) < 1e-6 && e.from.y > 0), "枪口焰朝南岸、方向是单位向量");
  Tick(3, { tier: "far" }); const farShots = crowd.TakeShots();
  Tick(3, { tier: "out" }); const outShots = crowd.TakeShots();
  Check(farShots.length < shots2.length / 2 && outShots.length === 0, `far 档减半（${farShots.length}）、out 档不开火（${outShots.length}）`);
  // 分拨：fire / withdraw 事实放行下一拨；blast 拨在起爆之后
  Check(crowd.State().waves.fire != null, "fire 拨在 fireFallbackS 之后放行");
  Check(crowd.State().waves.withdraw == null && crowd.State().waves.blast == null, "withdraw / blast 拨还没放");
  Tick(2, { tier: "contact", withdraw: true });
  Check(crowd.State().waves.withdraw != null, "BridgeWithdraw 放 withdraw 拨");
  Tick(25, { tier: "contact", withdraw: true });
  cs = crowd.State();
  Check(cs.onField === roster.filter((u) => u.wave !== "blast").length, `起爆前上场 ${cs.onField} = 三拨 ${roster.filter((u) => u.wave !== "blast").length}`);
  // 起爆：duckM 内的人趴下，随后爬起来；blast 拨在 blastTrickleDelayS 后放
  crowd.OnBridgeBlast();
  Check(crowd.State().ducked > 100, `起爆：${crowd.State().ducked} 人趴下`);
  sink.pushes.length = 0; crowd.Draw(sink, view);
  Check(sink.pushes.filter((p) => p.pose.stance === 2).length > 100, "趴下的人画成卧姿桶");
  Tick(K.duckS + K.duckJitterS + 1, { tier: "contact", withdraw: true });
  Check(crowd.units.filter((u) => u.mode === "duck").length === 0, "趴完了都爬起来接着打");
  Tick(K.blastTrickleDelayS + 1, { tier: "contact", withdraw: true });
  Check(crowd.State().waves.blast != null, "起爆之后最后一拨仍在涌来");
  Tick(70, { tier: "contact", withdraw: true });
  cs = crowd.State();
  Check(cs.onField === roster.length && cs.running === 0, `桥断后 ${cs.onField}/${roster.length} 人全在位（还在路上 ${cs.running}）`);
  Check(crowd.units.every((u) => u.z <= FarBankShoreZ(u.x) + 0.5 || u.kind === "bridge"), "没有人越过岸沿（桥头纵队在桥面上）");
  Check(crowd.units.every((u) => u.z < 135.5), "没有人到被炸孔上（z ≥ 136）");
  // 视野估计：射位站姿 1280×720、垂直视场 62°（水平 ≈ 96°）内，投影身高 ≥ 6 px 的人（身高 1.7 m，焦距 = 360 / tan(vfov/2)）
  const cam = { x: A.bridgeCover.x, y: Ground(A.bridgeCover.x, A.bridgeCover.z) + 1.65, z: A.bridgeCover.z };
  const yaw = Math.atan2(cam.x - (-77), cam.z - 86), vfov = 62 * Math.PI / 180, focal = 360 / Math.tan(vfov / 2), hHalf = Math.atan(Math.tan(vfov / 2) * 16 / 9);
  const visible = (u) => {
    const dx = u.x - cam.x, dz = u.z - cam.z, dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(-dx, -dz) - yaw, b = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    return Math.abs(b) < hHalf && 1.7 * focal / dist >= 6;
  };
  const shown = crowd.units.filter(visible).length;
  Check(shown >= 60, `射位默认视野里 ≥ 6 px 高的视觉人群 ${shown} ≥ 60（另有真 AI 与脚本兵）`);
  // 撤场：Retire 之后一个人也不画
  crowd.Retire(); sink.pushes.length = 0; crowd.Draw(sink, view);
  Check(sink.pushes.length === 0 && crowd.State().onField === 0, "Retire 之后一个人也不画");
  // 阶段跳转直接落在 BridgeWithdraw：所有人直接在位
  const inst = new FarBankCrowd({ ground: Ground, targets: { west: [], east: [] } });
  inst.Start(true);
  Check(inst.State().onField === inst.units.length && inst.State().running === 0, "instant：阶段跳转后所有人直接在位");
  Check(inst.Bearers().length === inst.units.filter((u) => u.flag || u.sword).length, "旗与刀的持有人都在场上");
}

// ---------------------------------------------------------------------------
// 5. 北岸坡地（R2c，docs/Data_FirstLevelBridgeFarBank.md §11）：坡有多陡、画面里占多高、人在坡上分几排、村子与出生点在坡顶后面
// ---------------------------------------------------------------------------
{
  // 「平地」= 同一份地形只拿掉四级台地（其余白盒地形——路堤、南堤、桥座槽、撤离土岗——照旧）
  const flatSpec = { ...MISSION_TERRAIN, whiteboxTerrain: CompileWhiteboxTerrain(WHITEBOX_TERRAIN_REGIONS.map((region) => ({ ...region,
    shapes: region.shapes.filter((shape) => !/^NorthTerrace\d$/.test(shape.id)) }))) };
  const Flat = (x, z) => Ground(x, z, flatSpec);
  const cover = A.bridgeCover, eyeY = Ground(cover.x, cover.z) + 1.62;
  const roster = AssignCrowdWaves(BuildFarBankCrowdRoster(), E.farBank.crowd.waves);
  const slope = roster.filter((u) => u.kind === "slope");

  // (1) 台地的高度与坡度：四级台面 +1.6 / +3.2 / +4.8 / +6.4 m（±0.25），坡段（台地内部）最陡 ≤ 12.5°
  for (const [i, t] of NORTH_TERRACES.entries()) {
    const zFlat = i === 3 ? 14 : t.southZ - 1.5;    // 第 i 级顶面正中（坡顶那一级取台面深处）
    const y = Ground(-125, zFlat) - Flat(-125, zFlat);
    Check(Math.abs(y - t.dy) <= 0.25, `${t.id} 台面高出原地面 ${y.toFixed(2)} m ≈ ${t.dy}（x −125，z ${zFlat}）`);
  }
  let steepest = 0, steepAt = null;
  for (let x = -140; x <= -106; x += 1.5) for (let z = 27; z <= 80; z += 1.5) {
    const gx = (Ground(x + 0.75, z) - Ground(x - 0.75, z)) / 1.5, gz = (Ground(x, z + 0.75) - Ground(x, z - 0.75)) / 1.5, s = Math.hypot(gx, gz);
    if (s > steepest) { steepest = s; steepAt = { x, z }; }
  }
  Check(steepest <= Math.tan(12.5 * Math.PI / 180), `坡地台阶内部最陡 ${(Math.atan(steepest) * 180 / Math.PI).toFixed(1)}° ≤ 12.5°（(${steepAt.x}, ${steepAt.z})）`);
  Check(NORTH_TERRACES.every((t, i) => i === 0 || t.southZ < NORTH_TERRACES[i - 1].southZ - 11.5) && NORTH_TERRACES.at(-1).dy >= 5 && NORTH_TERRACES.at(-1).dy <= 8, "四级台地由南往北一级比一级高，坡顶在 +5…+8 m 之内");
  Check(NORTH_TERRACE_WEST === -150, "台地西缘 −150（Bridge18 框西缘 −164 放得下 11.5 m 羽化）");

  // (2) 不碰的地方：岸台（z ≥ 81.5）、桥轴铁路带（|x+77| ≤ 3、z 50…90）、北桥台桥座槽、两段土坎的地面
  const moved = (x, z) => Math.abs(Ground(x, z) - Flat(x, z));
  let worstShelf = 0, worstRail = 0, worstShoulder = 0;
  for (let x = -146; x <= -80; x += 2) for (let z = 81.5; z <= 92; z += 1) worstShelf = Math.max(worstShelf, moved(x, z));
  for (let x = -78.6; x <= -75.4; x += 0.4) for (let z = 50; z <= 90; z += 1) worstRail = Math.max(worstRail, moved(x, z));
  for (let x = -80; x <= -74; x += 0.5) for (let z = 50; z <= 90; z += 1) worstShoulder = Math.max(worstShoulder, moved(x, z));
  Check(worstShoulder <= 0.2, `桥轴路基肩（x −80…−74）最多被台地东端的羽化抬 ${worstShoulder.toFixed(3)} m ≤ 0.2`);
  Check(worstShelf <= 0.02, `岸台（z ≥ 81.5）与原地面一致：最大差 ${worstShelf.toFixed(3)} m（岸沿、北岸空气墙、土坎脚下都在这里）`);
  Check(worstRail <= 0.03, `铁轨与枕木所在（x −78.6…−75.4、z 50…90）与原地面一致：最大差 ${worstRail.toFixed(3)} m（铁轨不被台地抬歪）`);
  Check(moved(-77, 88.55) === 0 && moved(-77, 86) === 0, "北桥台桥座槽与轨道断口处地面不动");

  // (3) 画面里占多高：射位站姿、1280×720、垂直视场 55°、朝 (−77,86)。逐列（每 20 px）量「北岸岸沿 → 地形天际线」的角度差换成像素，
  //     与同一份地形拿掉坡地（平地）比。平地也有 ≈ 12–20 px（岸沿到地平线之间那条细带）；坡地要在画面左半（岸沿在 x −128…−90 的一段）≥ 40 px、比平地多 ≥ 18 px。
  const yaw = Math.atan2(-77 - cover.x, -(86 - cover.z));       // 0 = 朝北（−z），正 = 往东；LOOK 点 (−77, 86)
  const vfov = 55, hfov = 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * 16 / 9) * 180 / Math.PI, pxPerDeg = 720 / vfov;
  const Band = (px, sample) => {
    const bearing = ((px - 640) / 1280) * hfov, a = yaw + bearing * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a);
    let sky = -90, edge = null;
    for (let d = 20; d < 330; d += 0.5) {
      const x = cover.x + dx * d, z = cover.z + dz * d;
      if (z < -20) break;
      const h = sample(x, z), ang = Math.atan2(h - eyeY, d * Math.cos(bearing * Math.PI / 180)) * 180 / Math.PI;
      if (edge == null && z <= FarBankShoreZ(x) && h > -1) edge = { ang, x };
      if (edge != null && ang > sky) sky = ang;
    }
    return { px, x: edge?.x, band: edge ? (sky - edge.ang) * pxPerDeg : 0 };
  };
  const cols = [];
  for (let px = 80; px <= 560; px += 20) cols.push({ now: Band(px, Ground), flat: Band(px, Flat) });
  const good40 = cols.filter((c) => c.now.band >= 40).length, goodGain = cols.filter((c) => c.now.band - c.flat.band >= 18).length;
  Check(good40 >= cols.length * 0.7, `画面左半（px 80…560，岸沿 x ${cols[0].now.x?.toFixed(0)}…${cols.at(-1).now.x?.toFixed(0)}）${good40}/${cols.length} 列坡面高 ≥ 40 px`);
  Check(goodGain >= cols.length * 0.7, `其中 ${goodGain}/${cols.length} 列比平地多 ≥ 18 px（平地 ${Math.min(...cols.map((c) => c.flat.band)).toFixed(0)}–${Math.max(...cols.map((c) => c.flat.band)).toFixed(0)} px → 坡地 ${Math.min(...cols.map((c) => c.now.band)).toFixed(0)}–${Math.max(...cols.map((c) => c.now.band)).toFixed(0)} px）`);
  Check(Math.max(...cols.map((c) => c.now.band)) >= 50, "最高一列坡面 ≥ 50 px");

  // (4) 人在坡上：八排、每排 ≥ 12 人、脚下高度逐排往北升高；射位看得见的（没被地形挡、身高 ≥ 6 px）≥ 250 人；相邻两排在画面上错开 ≥ 2.5 px
  const byRank = FAR_BANK_CROWD_SLOPE_RANKS.map((rank) => slope.filter((u) => Math.abs(u.post.z - rank.z) < 0.5));
  Check(byRank.length === 8 && byRank.every((list) => list.length >= 12), `坡地八排每排 ≥ 12 人：${byRank.map((list) => list.length)}`);
  Check(slope.every((u) => byRank.some((list) => list.includes(u))), "坡地的人都落在八排里");
  const meanY = byRank.map((list) => list.reduce((s, u) => s + Ground(u.post.x, u.post.z), 0) / list.length);
  Check(meanY.every((y, i) => i === 0 || y > meanY[i - 1] + 0.25), `逐排往北升高：${meanY.map((y) => y.toFixed(1))}`);
  const footAngle = (u) => Math.atan2(Ground(u.post.x, u.post.z) - eyeY, Math.hypot(u.post.x - cover.x, u.post.z - cover.z)) * 180 / Math.PI;
  const rankAngle = byRank.map((list) => list.map(footAngle).sort((a, b) => a - b)[Math.floor(list.length / 2)]);
  Check(rankAngle.every((a, i) => i === 0 || (a - rankAngle[i - 1]) * pxPerDeg >= 2.5), `相邻两排的脚在画面上错开 ≥ 2.5 px（整片坡面高约 40 px，八排平均 5 px；身高 10–14 px，所以排与排叠成一片）：${rankAngle.map((a, i) => i ? ((a - rankAngle[i - 1]) * pxPerDeg).toFixed(1) : "-")}`);
  const camEye = { x: cover.x, z: cover.z, y: eyeY };
  let seen = 0, tall = 0;
  for (const u of roster) {
    const head = { x: u.post.x, z: u.post.z, y: Ground(u.post.x, u.post.z) + (u.pose === "stand" ? 1.7 : u.pose === "kneel" ? 1.1 : 0.4) * u.scale };
    const dist = Math.hypot(u.post.x - cover.x, u.post.z - cover.z), bearing = Math.atan2(u.post.x - cover.x, -(u.post.z - cover.z)) - yaw;
    const b = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    if (Math.abs(b) * 180 / Math.PI > hfov / 2) continue;
    if (LineOfSight(camEye, head) !== null) continue;
    seen += 1;
    if ((head.y - Ground(u.post.x, u.post.z)) / dist * 180 / Math.PI * pxPerDeg >= 6) tall += 1;
  }
  Check(seen >= 300 && tall >= 250, `射位站姿的视野里没被地形挡住的视觉人群 ${seen}，其中身高 ≥ 6 px 的 ${tall}（≥ 250）`);

  // (5) 出生点与村子在坡顶后面：出生点被坡顶挡着（射位看不见）；村子的体块都在坡顶前沿（z 26）之北，不挡射位到坡面的视线
  for (const u of slope) Check(u.spawn && LineOfSight(camEye, { x: u.spawn.x, z: u.spawn.z, y: Ground(u.spawn.x, u.spawn.z) + 1.9 }) === "terrain", `${u.id} 的出生点 (${u.spawn?.x}, ${u.spawn?.z}) 被坡顶挡着`);
  const village = Layout.blocks.filter((b) => /^(NorthBankHouse|WestFieldHouse)/.test(b.id));
  Check(village.length >= 30, `坡顶村的体块 ${village.length} 件`);
  Check(village.every((b) => b.z + b.d / 2 <= 27), "村子全在坡顶前沿（z 26）之北（最南的一件到 z " + Math.max(...village.map((b) => b.z + b.d / 2)).toFixed(1) + "）");
  Check(village.every((b) => b.x - b.w / 2 >= -152 && b.x + b.w / 2 <= -100), "村子在坡顶台面的 x −150…−105 之内");
  const crestY = Ground(-125, 14);
  Check(village.filter((b) => !/Roof|Lintel|Gable|Ridge|Eave/.test(b.id)).every((b) => Math.abs(b.y - b.h / 2 - crestY) < 0.6), "村子的墙脚落在坡顶台面上");
  // 坡地上的枯树干（Layout 的 FieldPoplarWest*）每一棵都在名册的避让表里（挪了树忘了改表，人会站进树里）
  const trunks = Layout.blocks.filter((b) => /^FieldPoplarWest\d+(NB)?Trunk$/.test(b.id) && b.x > -152 && b.x < -100 && b.z > 0 && b.z < 100);
  Check(trunks.length >= 7 && trunks.every((t) => FAR_BANK_CROWD_KEEPOUT.some(([x, z]) => Math.hypot(x - t.x, z - t.z) < 0.5)), `坡地上的 ${trunks.length} 根枯树干都在名册避让表里`);
  // 台地上的真 AI（两名步枪手在第一级顶沿）与两辆车都站在平台上
  for (const id of ["FarBankRealWest0", "FarBankRealWest1"]) {
    const u = FAR_BANK_REAL.find((p) => p.id === id);
    Check(Ground(u.x, u.z) > 1.0 && Ground(u.x, u.z) < 2.4, `${id} 站在第一级台地顶沿（地面 ${Ground(u.x, u.z).toFixed(2)} m）`);
  }
}

console.log(`ok 18 对岸步坦部队：数据几何、纯规则、替身宿主时间线（${checks} 项）`);
