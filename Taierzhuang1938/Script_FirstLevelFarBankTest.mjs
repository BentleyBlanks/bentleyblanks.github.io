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
import { SampleMissionTerrain as Ground } from "./Data_FirstLevelMissionTerrain.mjs";
import { MISSION_STAGE_ROUTES as Routes, MISSION_RAIL_BRIDGE as Bridge, MISSION_NORTH_RIVER, RiverWaterAt } from "./Data_FirstLevelMissionTopology.mjs";
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import {
  FAR_BANK_REAL, FAR_BANK_REAL_SPAWN_BACK_M, FAR_BANK_SHORE_A, FAR_BANK_SHORE_B, FAR_BANK_STANDBY, FAR_BANK_VANGUARD, FAR_BANK_RUSH,
  FarBankRushSlot, FAR_BANK_CROWD, FAR_BANK_FIRE_POINTS, FAR_BANK_FIRE_LISTS, FAR_BANK_TANKS, FAR_BANK_SHELL_SPOTS, FAR_BANK_REINFORCE, FAR_BANK_BLAST,
  FarBankShoreZ, FarBankPoint,
} from "./Data_FirstLevelBridgeFarBank.mjs";
import { FirstLevelFarBank, FarBankTier, FarBankFireList, ShellSpotVerdict, RouteDistance, FarBankWalkInVia, FarBankSpawnAt } from "./Script_FirstLevelBridgeFarBank.mjs";

const T = E.farBank;
let checks = 0;
const Check = (condition, message) => { assert.ok(condition, message); checks += 1; };
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

// 战车路线：从 shore − tankStartBackM 直线开到岸边，离实心体块 ≥ 3.5 m，地面起伏 < 1 m
{
  for (const tank of FAR_BANK_TANKS) {
    const shore = FarBankShoreZ(tank.x), to = shore - tank.pushBackM;
    Check(tank.backM > tank.pushBackM, `${tank.id} 先停在 back ${tank.backM}，BridgeWithdraw 再推到 back ${tank.pushBackM}`);
    // 路线折线：出发点 → via（绕开沟与院子）→ 停位 → 推到岸边的位置
    const path = [{ x: tank.x, z: shore - T.tankStartBackM }, ...tank.via.map(([x, back]) => ({ x, z: FarBankShoreZ(x) - back })),
      { x: tank.x, z: shore - tank.backM }, { x: tank.x, z: to }];
    let lo = Infinity, hi = -Infinity, hit = new Set();
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], L = Distance(a, b);
      for (let d = 0; d <= L; d += 0.5) {
        const t = d / L, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = Ground(x, z);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        for (const dx of [-2.6, 0, 2.6]) for (const dz of [-2.6, 0, 2.6]) for (const id of Overlap(x + dx, z + dz, 0, solids)) hit.add(id);
      }
    }
    Check(hit.size === 0, `${tank.id} 路线净空（履带宽 2.2 m + 余量）：${[...hit]}`);
    Check(hi - lo < 1.0 && lo > -0.6, `${tank.id} 路线地面平（${lo.toFixed(2)}…${hi.toFixed(2)}）`);
    Check(Math.abs(tank.x - Bridge.x) >= 9, `${tank.id} 不压在桥轴的铁路上`);
    Check(Distance({ x: tank.x, z: to }, { x: A.bridgeCover.x, z: A.bridgeCover.z }) >= 80, `${tank.id} 停位离射位 ≥ 80 m`);
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
  Check(bank.tanks.every((t) => t.z < FarBankShoreZ(t.x) - 5), "战车停在岸沿以北");
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
  Check(bank.tanks.find((t) => t.spec.enter === "bridgeFireBroken").state !== "queued", "T3 在 bridgeFireBroken 之后进场");
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

console.log(`ok 18 对岸步坦部队：数据几何、纯规则、替身宿主时间线（${checks} 项）`);
