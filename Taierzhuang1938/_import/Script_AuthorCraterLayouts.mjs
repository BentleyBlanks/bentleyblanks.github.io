// 确定性弹坑布设与全路径净空核验脚本（FirstLevelEncounter z < 355 与 FirstLevelMerged z >= 355）。
//
// 依据 2026-11-26 场景编辑器总览红圈划分三片主炮击区：
//   1. 西侧河汊与农田（x -65..86, z 165..395，跨 z=355 继承线）
//   2. 东侧农田、孤农舍/打麦场与东北条田（x 112..272, z 138..462，跨 z=355 继承线）
//   3. 村北防线、西南条田、主路两侧与村北外缘（x -28..232, z 395..534，全在 Merged）
//
// 特点：
//   - 按真实炮火急袭带（NE→SW 试射修正线）、重弹锚点、叠坑联弹（双连/三连坑）、近失迫击炮散点排布；
//   - 按地形高程与离河汊/池塘距离自然分配 fresh / weathered / flooded 陈化档；
//   - 严格避让全部建筑/墙/铁丝网/树/道具/水面/既有 6 处 BombCrater 地标、壕沟、道路、坦克轨迹、
//     01–13 全部玩家/友军/敌军/潜行点位与路径，以及 z=355 继承接缝（零台阶）。
//
// 用法：node Taierzhuang1938/_import/Script_AuthorCraterLayouts.mjs [--dry-run]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPLOSIVES, TERRAIN_DEFORMATION } from "../Data_Explosives.mjs";
import { DecodeSceneHeights, FormatSceneJson, ValidateScene } from "../Script_SceneDoc.mjs";
import { DecodeTrenchDatum, GridSampler, PrepareSceneTerrain } from "../Script_SceneTrenches.mjs";
import { ResolveInheritedScene } from "../Script_SceneInherit.mjs";
import { NormalizeSceneCraters } from "../Script_SceneCraters.mjs";
import { Mulberry32 } from "../Script_Noise.mjs";
import * as encFlow from "../Scenes/FirstLevelEncounter/Data_LevelFlow.mjs";
import * as mrgFlow from "../Scenes/FirstLevelMerged/Data_LevelFlowMerged.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const DRY_RUN = process.argv.includes("--dry-run");
const DEG = Math.PI / 180;

const ENC_JSON = path.join(root, "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json");
const ENC_H = path.join(root, "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.height.bin");
const ENC_D = path.join(root, "Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.trench.bin");
const MRG_JSON = path.join(root, "Scenes/FirstLevelMerged/Scene_FirstLevelMerged.json");
const MRG_H = path.join(root, "Scenes/FirstLevelMerged/Scene_FirstLevelMerged.height.bin");
const MRG_D = path.join(root, "Scenes/FirstLevelMerged/Scene_FirstLevelMerged.trench.bin");

const encDoc = JSON.parse(fs.readFileSync(ENC_JSON, "utf8"));
const encHeights = DecodeSceneHeights(fs.readFileSync(ENC_H), encDoc.terrain);
const encDatum = DecodeTrenchDatum(encDoc.trenches.datum, fs.readFileSync(ENC_D));

const mrgDoc = JSON.parse(fs.readFileSync(MRG_JSON, "utf8"));
const mrgHeights = DecodeSceneHeights(fs.readFileSync(MRG_H), mrgDoc.terrain);
const mrgDatum = mrgDoc.trenches?.datum ? DecodeTrenchDatum(mrgDoc.trenches.datum, fs.readFileSync(MRG_D)) : [];

// 先以无弹坑基底合并，构建完整地形 + 障碍物 + 路线真值
const baseEnc = { ...encDoc }; delete baseEnc.craters;
const baseMrg = { ...mrgDoc }; delete baseMrg.craters;
const resolvedBase = ResolveInheritedScene(baseMrg, mrgHeights, mrgDatum, { doc: baseEnc, heights: encHeights, datum: encDatum });
const doc = resolvedBase.doc;
const { heights: baseTerrainHeights, plan: trenchPlan } = PrepareSceneTerrain(doc, resolvedBase.heights, null);
const heightAt = GridSampler(doc.terrain, baseTerrainHeights);

// ---------------------------------------------------------------------------
// 几何距离工具

function SegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function PolylineDist(px, pz, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ax = Array.isArray(a) ? a[0] : a.x, az = Array.isArray(a) ? a[1] : a.z;
    const bx = Array.isArray(b) ? b[0] : b.x, bz = Array.isArray(b) ? b[1] : b.z;
    const d = SegDist(px, pz, ax, az, bx, bz);
    if (d < best) best = d;
  }
  return best;
}

function PolySignedDist(px, pz, pts) {
  let inside = false, best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    const ax = Array.isArray(a) ? a[0] : a.x, az = Array.isArray(a) ? a[1] : a.z;
    const bx = Array.isArray(b) ? b[0] : b.x, bz = Array.isArray(b) ? b[1] : b.z;
    if ((az > pz) !== (bz > pz) && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside;
    const d = SegDist(px, pz, ax, az, bx, bz);
    if (d < best) best = d;
  }
  return inside ? -best : best;
}

function ObbDist(px, pz, obb) {
  const dx = px - obb.x, dz = pz - obb.z;
  const lx = Math.abs(dx * obb.cos - dz * obb.sin) - obb.hx;
  const lz = Math.abs(dx * obb.sin + dz * obb.cos) - obb.hz;
  return Math.hypot(Math.max(0, lx), Math.max(0, lz)) + Math.min(0, Math.max(lx, lz));
}

// ---------------------------------------------------------------------------
// 收集全图禁区（建筑/道具/水面/既有炸坑/道路/坦克轨/壕沟/全部游玩点位与路线）

const obstacles = [];
const waterBodies = [];
for (const obj of doc.objects || []) {
  if (obj.layer === "backdrop" || !obj.pos || !obj.size) continue;
  const [x, , z] = obj.pos;
  if (z < 100 || z > 580) continue;
  const [w, h, d] = obj.size;
  const ry = (obj.yawDeg || 0) * DEG;
  const isWater = obj.material === "Whitebox/Water" || /Water|River|Pond|Tributary/i.test(obj.id);
  const isWire = /Wire|Barbed|Stake/i.test(obj.id);
  const isBombLandmark = /^BombCrater_/i.test(obj.id);
  const isBuilding = w >= 2.5 && d >= 2.5 && h >= 1.8;
  const margin = isWater ? 2.4 : isBombLandmark ? 2.8 : isBuilding ? 1.8 : isWire ? 1.15 : 1.0;
  const rec = { id: obj.id, x, z, hx: w * 0.5, hz: d * 0.5, cos: Math.cos(ry), sin: Math.sin(ry), margin, isWater };
  obstacles.push(rec);
  if (isWater) waterBodies.push(rec);
}

// 既有 6 处手工烘焙的航弹地标坑中心（保留其固定高度的焦木与炭火）
const preBombCenters = [
  [128, 452, 7.6], [64, 492, 8.2], [150, 493, 8.2], [216, 546, 8.0],
];

// 道路与水体/反坦克壕涂色禁区
const keepoutLines = [];
const keepoutPolys = [];
for (const line of doc.ways?.roads || []) {
  if (line.length >= 2) keepoutLines.push({ pts: line, halfW: 2.8, name: "wayRoad" });
}
for (const r of doc.ways?.roadRibbons || []) {
  if (r.points?.length >= 2) keepoutLines.push({ pts: r.points, halfW: (r.width || 3.2) * 0.5 + 1.0, name: r.id });
}
for (const p of doc.paint || []) {
  if (p.line && /^(Road_|PostRoad|NorthRoad|AtDitch|FieldLane_)/i.test(p.id)) {
    keepoutLines.push({ pts: p.line, halfW: (p.halfW || 2) + 1.1, name: p.id });
  }
  if (p.poly && /^(PondWater_|PondDamp_|BombScorch_)/i.test(p.id)) {
    keepoutPolys.push({ pts: p.poly, margin: /^Pond/.test(p.id) ? 2.6 : 1.8, name: p.id });
  }
}
// 坦克追击路线（FLOW_TANK_TRACKS）
for (const [key, track] of Object.entries(encFlow.FLOW_TANK_TRACKS || {})) {
  const pts = track.map((row) => [row[2], row[3]]);
  if (pts.length >= 2) keepoutLines.push({ pts, halfW: 4.2, name: `Tank_${key}` });
}
// 05–07 凹路中线（基于高度图凹槽实测：从干沟口(80,170)沿凹路到(98,355)，宽留 6.5 m）
keepoutLines.push({
  pts: [[80, 165], [82, 200], [86, 235], [91, 270], [95, 310], [98, 355]],
  halfW: 5.8,
  name: "SunkenLaneCorridor",
});
// 08c 主路接续与木板桥（x ≈ 99..102, z = 355..498）
keepoutLines.push({
  pts: [[99, 355], [100, 415], [99, 468], [99, 476], [106, 496], [107, 520]],
  halfW: 5.4,
  name: "MergedConnectRoad",
});

// 全部剧情 / 遭遇点位与折线（01–13 玩家、友军、敌军、潜行路线）
const flowPoints = [];
const flowSegments = [];
function CollectFlow(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    if (node.length === 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      if (node[0] >= -140 && node[0] <= 300 && node[1] >= 120 && node[1] <= 560) flowPoints.push([node[0], node[1]]);
      return;
    }
    // 检查是不是折线点数组 [[x,z], [x,z], ...]
    if (node.length >= 2 && node.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number")) {
      const inBand = node.some((p) => p[1] >= 120 && p[1] <= 560);
      if (inBand) flowSegments.push(node);
    }
    for (const item of node) CollectFlow(item, seen);
    return;
  }
  if (typeof node.x === "number" && typeof node.z === "number" && node.x >= -140 && node.x <= 300 && node.z >= 120 && node.z <= 560) {
    flowPoints.push([node.x, node.z]);
  }
  for (const val of Object.values(node)) CollectFlow(val, seen);
}
CollectFlow(encFlow);
CollectFlow(mrgFlow);

// ---------------------------------------------------------------------------
// 严格净空核验函数

function ClearanceCheck(x, z, radius, rimWidth, existingList, { allowClusterNear = false, seamSide = null } = {}) {
  if (x < -98 || x > 282 || z < 132 || z > 528) return "bounds";
  // 避开村内封闭民宅院落内部（保留北缘缓冲带与外围打麦场/空地）
  if (z > 512 && x > 56 && x < 214) return "innerVillageYard";
  const bodyR = radius + rimWidth * 0.45;
  const outerReach = Math.max(radius * 1.38 + rimWidth, radius * 1.75);
  // 1. 严守 z = 355 继承接缝（留足 outerReach + 0.8 m，保证北/南单边挖坑接缝零台阶）
  if (seamSide === "north" && z + outerReach > 354.2) return "seamNorth";
  if (seamSide === "south" && z - outerReach < 355.8) return "seamSouth";
  // 2. 地势与坡度（不落深河床 / 陡坎 / 壕沟底）
  const y = heightAt(x, z);
  if (y < -0.75) return "lowWater";
  const gx = (heightAt(x + 1, z) - heightAt(x - 1, z)) * 0.5;
  const gz = (heightAt(x, z + 1) - heightAt(x, z - 1)) * 0.5;
  if (Math.hypot(gx, gz) > 0.28) return "steep";
  // 检查坑沿 4 点也不坠入河床/深沟
  for (const [ox, oz] of [[bodyR, 0], [-bodyR, 0], [0, bodyR], [0, -bodyR]]) {
    if (heightAt(x + ox, z + oz) < -0.95) return "rimLowWater";
  }
  // 3. 壕沟走廊（不破壕沟底与胸墙坡）
  const corr = trenchPlan?.Corridor(x, z);
  if (corr && corr.d < corr.halfFloor + corr.bank + bodyR * 0.88 + 0.6) return "trench";
  // 4. 既有 6 处航弹地标坑中心
  for (const [bx, bz, br] of preBombCenters) {
    if (Math.hypot(x - bx, z - bz) < br + radius * 0.7) return "preBomb";
  }
  // 5. 全部建筑/墙/铁丝网/水面/树木/井/道具
  for (const obb of obstacles) {
    if (ObbDist(x, z, obb) < bodyR + obb.margin) return `obj:${obb.id}`;
  }
  // 6. 道路 / 坦克轨迹 / 凹路 / 反坦克壕
  for (const kl of keepoutLines) {
    if (PolylineDist(x, z, kl.pts) < kl.halfW + radius * 0.75) return `line:${kl.name}`;
  }
  // 7. 池塘 / 焦土多边形
  for (const kp of keepoutPolys) {
    if (PolySignedDist(x, z, kp.pts) < kp.margin + bodyR * 0.75) return `poly:${kp.name}`;
  }
  // 8. 剧情点位与路径（玩家 / 友军 / 敌军 / 潜行）
  for (const [fx, fz] of flowPoints) {
    if (Math.hypot(x - fx, z - fz) < bodyR + 1.4) return "flowPt";
  }
  for (const seg of flowSegments) {
    if (PolylineDist(x, z, seg) < radius * 0.8 + 1.1) return "flowPath";
  }
  // 9. 弹坑间最小间距（普通坑保持呼吸感，联弹双/三连坑允许啃边叠加但中心不重合）
  for (const prev of existingList) {
    const d = Math.hypot(x - prev.x, z - prev.z);
    const minD = allowClusterNear ? (radius + prev.radius) * 0.56 : (radius + prev.radius) * 0.92 + 0.8;
    if (d < minD) return "overlap";
  }
  return null;
}

function NearestWaterDist(x, z) {
  let best = Infinity;
  for (const wb of waterBodies) {
    const d = Math.max(0, ObbDist(x, z, wb));
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 构造弹坑并做微调避障

const rng = Mulberry32(19380316);
const placed = [];
let seq = 1;

function PickAge(x, z, zone, rngFn) {
  const y = heightAt(x, z);
  const wDist = NearestWaterDist(x, z);
  // 河汊两侧、池塘边或低洼潮湿地优先出积水老坑
  if ((wDist < 22 && y < 0.85) || y < 0.05) {
    const u = rngFn();
    if (u < 0.58) return "flooded";
    if (u < 0.86) return "weathered";
    return "fresh";
  }
  if (zone === "W") {
    const u = rngFn();
    return u < 0.30 ? "flooded" : u < 0.76 ? "weathered" : "fresh";
  }
  if (zone === "E") {
    const u = rngFn();
    return u < 0.14 ? "flooded" : u < 0.62 ? "weathered" : "fresh";
  }
  // 村北前沿主炮击带：刚炸的新鲜焦坑为主，夹杂旧坑与池塘边湿坑
  const u = rngFn();
  if (wDist < 28 && u < 0.42) return "flooded";
  return u < 0.64 ? "fresh" : u < 0.91 ? "weathered" : "flooded";
}

function TryPlace({ x, z, kind, radius, depth, age, zone, dirDeg, oblique, group, allowClusterNear = false, maxNudge = 6.5 }) {
  const spec = EXPLOSIVES[kind] || EXPLOSIVES.Shell75;
  const seamSide = z < 355 ? "north" : "south";
  const r = Number((radius ?? spec.craterRadiusM * (0.90 + rng() * 0.24)).toFixed(2));
  const rimWidth = Math.max(0.52, Math.min(2.55, r * 0.56));
  const dVal = depth ?? spec.craterDepthM * (0.90 + rng() * 0.20);
  const tryAngles = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.1, 3.7, 4.3, 4.9, 5.5, 6.0];
  const tryRadii = [0, 1.4, 2.8, 4.4, maxNudge];

  for (const nr of tryRadii) {
    const angles = nr === 0 ? [0] : tryAngles;
    for (const ang of angles) {
      const cx = Number((x + Math.cos(ang) * nr).toFixed(2));
      const cz = Number((z + Math.sin(ang) * nr).toFixed(2));
      const side = cz < 355 ? "north" : "south";
      if (side !== seamSide) continue;
      const bad = ClearanceCheck(cx, cz, r, rimWidth, placed, { allowClusterNear, seamSide: side });
      if (bad) continue;
      const finalAge = age || PickAge(cx, cz, zone, rng);
      const ageDepthMul = finalAge === "fresh" ? 1.0 : finalAge === "weathered" ? 0.86 : 0.80;
      const finalDepth = Number(Math.max(0.18, Math.min(2.1, dVal * ageDepthMul)).toFixed(2));
      const finalDir = Number((dirDeg ?? (156 + rng() * 34)).toFixed(1));
      const finalOblique = Number((oblique ?? (kind === "Bomb50kg" ? 0.14 + rng() * 0.14 : 0.28 + rng() * 0.34)).toFixed(2));
      const water = finalAge === "flooded" ? Number((0.82 + rng() * 0.18).toFixed(2))
        : finalAge === "weathered" ? Number((0.18 + rng() * 0.22).toFixed(2)) : 0;
      const item = {
        id: `Crater_${zone}${String(seq++).padStart(3, "0")}`,
        x: cx, z: cz, kind, radius: r, depth: finalDepth, age: finalAge,
        dirDeg: finalDir, oblique: finalOblique,
        ...(water > 0 ? { water } : {}),
        seed: 1000 + seq * 73,
        group,
      };
      placed.push(item);
      return item;
    }
  }
  return null;
}

/** 沿一条炮火急袭带（from -> to）按不均匀间距排布连射弹坑，附带少量偏移散点与双连叠坑。 */
function PlaceBarrageSwath({ from, to, count, kinds, lateralJitter, zone, group, twinChance = 0.24, age = null, dirDeg = null }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : (i + 0.18 + rng() * 0.64) / count;
    const lat = (rng() - 0.5) * 2 * lateralJitter;
    const x = from[0] + dx * t + nx * lat;
    const z = from[1] + dz * t + nz * lat;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const hit = TryPlace({ x, z, kind, zone, group, age, dirDeg });
    if (hit && rng() < twinChance) {
      // 联弹双坑：贴着主坑边缘咬出一个副坑，形成自然的 8 字/葫芦形复合弹坑
      const ang = rng() * Math.PI * 2;
      const subKind = kind === "Bomb50kg" ? "Shell105" : kind === "Shell150" ? "Shell75" : "Shell82";
      const subSpec = EXPLOSIVES[subKind];
      const sep = (hit.radius + subSpec.craterRadiusM) * (0.64 + rng() * 0.18);
      TryPlace({
        x: hit.x + Math.cos(ang) * sep,
        z: hit.z + Math.sin(ang) * sep,
        kind: subKind, zone, group, age: hit.age, dirDeg: hit.dirDeg,
        allowClusterNear: true, maxNudge: 2.2,
      });
    }
  }
}

/** 矩形田块/阵地内有机聚簇散布（偏向聚团而非均匀网格）。 */
function PlaceOrganicScatter({ minX, maxX, minZ, maxZ, clusters, perCluster, kinds, zone, group, age = null, radiusSpread = 16 }) {
  for (let c = 0; c < clusters; c++) {
    const cx = minX + (0.1 + 0.8 * rng()) * (maxX - minX);
    const cz = minZ + (0.1 + 0.8 * rng()) * (maxZ - minZ);
    for (let k = 0; k < perCluster; k++) {
      const ang = rng() * Math.PI * 2;
      const dist = (rng() ** 0.72) * radiusSpread;
      const x = Math.max(minX, Math.min(maxX, cx + Math.cos(ang) * dist));
      const z = Math.max(minZ, Math.min(maxZ, cz + Math.sin(ang) * dist));
      const kind = kinds[Math.floor(rng() * kinds.length)];
      TryPlace({ x, z, kind, zone, group, age, allowClusterNear: k > 0 && rng() < 0.22 });
    }
  }
}

// ===========================================================================
// 区域 1：左侧红圈 — 西侧河汊与西农田（x -65..84, z 165..396）
// ===========================================================================
const G_W = "战地弹坑/西侧河汊农田";

// 1A. 重型锚点坑（远景俯瞰一眼可见）
for (const [x, z, kind, age] of [
  [-26, 258, "Shell150", "weathered"],
  [-38, 308, "Bomb50kg", "weathered"],
  [-64, 336, "Shell150", "weathered"],
  [-56, 376, "Shell150", "weathered"],
  [-22, 374, "Bomb50kg", "weathered"],
  [-8, 330, "Shell150", "flooded"],
  [52, 232, "Shell150", "flooded"],
  [54, 294, "Shell150", "weathered"],
  [12, 218, "Shell105", "flooded"],
  [50, 336, "Shell105", "flooded"],
  [-12, 376, "Shell150", "weathered"],
  [44, 378, "Shell105", "flooded"],
]) {
  TryPlace({ x, z, kind, age, zone: "W", group: G_W, maxNudge: 8 });
}

// 1B. 西大田斜向急袭带（对应截图最左大片平整棕绿田，覆盖至 x=-92）
PlaceBarrageSwath({
  from: [-82, 248], to: [12, 286], count: 10,
  kinds: ["Shell105", "Shell75", "Shell75", "Shell82"], lateralJitter: 15, zone: "W", group: G_W, twinChance: 0.30,
});
PlaceBarrageSwath({
  from: [-88, 304], to: [10, 344], count: 11,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell57"], lateralJitter: 16, zone: "W", group: G_W, twinChance: 0.28,
});
PlaceOrganicScatter({
  minX: -90, maxX: -24, minZ: 280, maxZ: 348, clusters: 4, perCluster: 3,
  kinds: ["Shell105", "Shell75", "Shell82"], zone: "W", group: G_W, radiusSpread: 16,
});
// 1C. 河汊东岸至凹路西缘试射带（夹在河汊与凹路之间的坡田）
PlaceBarrageSwath({
  from: [46, 178], to: [64, 342], count: 13,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell82", "Shell50"], lateralJitter: 11, zone: "W", group: G_W, twinChance: 0.28,
});
// 1D. 西北角与河汊南延（含 z=360..404 跨接缝西大田延续段）
PlaceOrganicScatter({
  minX: -72, maxX: 16, minZ: 185, maxZ: 248, clusters: 3, perCluster: 3,
  kinds: ["Shell75", "Shell82", "Shell105"], zone: "W", group: G_W, radiusSpread: 18,
});
PlaceBarrageSwath({
  from: [-78, 368], to: [68, 396], count: 13,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell75"], lateralJitter: 12, zone: "W", group: G_W, twinChance: 0.28,
});

// ===========================================================================
// 区域 2：中上/右侧红圈 — 东农田、孤农舍/打麦场与东北条田（x 115..272, z 138..462）
// ===========================================================================
const G_E = "战地弹坑/东侧农田条田";

// 2A. 东田重型锚点坑（北段 + 南段东北条田）
for (const [x, z, kind, age] of [
  [146, 184, "Shell150", "weathered"],
  [192, 218, "Bomb50kg", "weathered"],
  [158, 272, "Shell150", "fresh"],
  [226, 286, "Shell150", "weathered"],
  [184, 316, "Shell105", "fresh"],
  [244, 336, "Shell105", "weathered"],
  // z >= 355 东北条田
  [172, 378, "Bomb50kg", "fresh"],
  [224, 396, "Shell150", "weathered"],
  [156, 424, "Shell150", "fresh"],
  [208, 438, "Shell150", "fresh"],
  [248, 426, "Shell105", "weathered"],
]) {
  TryPlace({ x, z, kind, age, zone: "E", group: G_E, maxNudge: 8 });
}

// 2B. 东田北段三条 NE→SW 炮火急袭带（z 138..344）
PlaceBarrageSwath({
  from: [126, 144], to: [256, 204], count: 12,
  kinds: ["Shell105", "Shell75", "Shell75", "Shell82"], lateralJitter: 15, zone: "E", group: G_E, twinChance: 0.30,
});
PlaceBarrageSwath({
  from: [124, 212], to: [258, 294], count: 14,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell57"], lateralJitter: 16, zone: "E", group: G_E, twinChance: 0.28,
});
// 2C. 孤农舍 / 打麦场周边近失弹群（z 296..346，严避建筑与草垛）
PlaceOrganicScatter({
  minX: 122, maxX: 266, minZ: 298, maxZ: 344, clusters: 4, perCluster: 3,
  kinds: ["Shell75", "Shell82", "Shell50", "Shell105"], zone: "E", group: G_E, radiusSpread: 14,
});
// 2D. 东北条田南段密集急袭带（z 362..458，在 Merged 侧）
PlaceBarrageSwath({
  from: [132, 368], to: [258, 412], count: 11,
  kinds: ["Shell105", "Shell75", "Shell75", "Shell82"], lateralJitter: 14, zone: "E", group: G_E, twinChance: 0.28,
});
PlaceBarrageSwath({
  from: [148, 408], to: [252, 456], count: 11,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell57"], lateralJitter: 12, zone: "E", group: G_E, twinChance: 0.26,
});

// ===========================================================================
// 区域 3：下方红圈 — 村北防线、西南条田、主路两侧与村北外缘（x -28..232, z 396..534）
// ===========================================================================
const G_V = "战地弹坑/村北前沿防线";

// 3A. 村北破障重炮/航弹锚点坑（高可见度主弹坑）
for (const [x, z, kind, age] of [
  [12, 434, "Shell150", "weathered"],
  [48, 446, "Bomb50kg", "fresh"],
  [78, 452, "Shell150", "fresh"],
  [118, 430, "Shell150", "fresh"],
  [168, 454, "Bomb50kg", "fresh"],
  [202, 460, "Shell150", "fresh"],
  [30, 472, "Shell105", "fresh"],
  // 村北壕沟内侧至北缘院落间空地
  [84, 502, "Shell105", "fresh"],
  [126, 498, "Shell150", "fresh"],
  [164, 504, "Shell105", "flooded"],
  [196, 502, "Shell105", "flooded"],
  [46, 508, "Shell105", "weathered"],
]) {
  TryPlace({ x, z, kind, age, zone: "V", group: G_V, maxNudge: 7.5 });
}

// 3B. 西南条田与村西铁丝网前沿急袭带（x -38..88, z 400..476）
PlaceBarrageSwath({
  from: [-36, 408], to: [84, 444], count: 14,
  kinds: ["Shell105", "Shell75", "Shell75", "Shell82"], lateralJitter: 14, zone: "V", group: G_V, twinChance: 0.32,
});
PlaceBarrageSwath({
  from: [-14, 446], to: [86, 474], count: 13,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell57"], lateralJitter: 11, zone: "V", group: G_V, twinChance: 0.30,
});
// 3C. 主路东侧至村东北铁丝网前沿（破障密集区，x 112..238, z 404..472）
PlaceBarrageSwath({
  from: [114, 412], to: [232, 466], count: 15,
  kinds: ["Shell105", "Shell75", "Shell82", "Shell75", "Shell50"], lateralJitter: 12, zone: "V", group: G_V, twinChance: 0.32,
});
// 3D. 村北壕沟后缘缓冲带与池塘周边弹坑（x 36..226, z 486..512，保持封闭民宅院内清爽）
PlaceOrganicScatter({
  minX: 36, maxX: 226, minZ: 486, maxZ: 512, clusters: 7, perCluster: 3,
  kinds: ["Shell75", "Shell82", "Shell105", "Shell50"], zone: "V", group: G_V, radiusSpread: 11,
});

// ===========================================================================
// 拆分到两个场景（z < 355 -> FirstLevelEncounter，z >= 355 -> FirstLevelMerged）

const encCraters = placed.filter((c) => c.z < 355).sort((a, b) => a.z - b.z || a.x - b.x);
const mrgCraters = placed.filter((c) => c.z >= 355).sort((a, b) => a.z - b.z || a.x - b.x);

const nextEnc = { ...baseEnc, craters: encCraters };
const nextMrg = { ...baseMrg, craters: mrgCraters };

// 校验两份单独文档 + 合并文档 + 挖坑后接缝零台阶
const checkEnc = ValidateScene(nextEnc);
const checkMrg = ValidateScene(nextMrg);
const resolvedFinal = ResolveInheritedScene(nextMrg, mrgHeights, mrgDatum, { doc: nextEnc, heights: encHeights, datum: encDatum });
const checkRes = ValidateScene(resolvedFinal.doc);
if (!checkEnc.ok) throw new Error(`Encounter 校验失败: ${checkEnc.errors.slice(0, 5).join("; ")}`);
if (!checkMrg.ok) throw new Error(`Merged 校验失败: ${checkMrg.errors.slice(0, 5).join("; ")}`);
if (!checkRes.ok) throw new Error(`Resolved 校验失败: ${checkRes.errors.slice(0, 5).join("; ")}`);

// 验证接缝行（z = 355）在独立挖坑和合并挖坑后与基底完全零台阶
const prepEnc = PrepareSceneTerrain(nextEnc, encHeights, fs.readFileSync(ENC_D));
const prepMrg = PrepareSceneTerrain(nextMrg, mrgHeights, mrgDoc.trenches?.datum ? fs.readFileSync(MRG_D) : null);
const prepRes = PrepareSceneTerrain(resolvedFinal.doc, resolvedFinal.heights, null);
const splitRow = Math.round((355 - encDoc.terrain.minZ) / encDoc.terrain.cellM);
const w = encDoc.terrain.cols + 1;
let maxSeamDiff = 0;
for (let ix = 0; ix < w; ix++) {
  const hN = prepEnc.heights[splitRow * w + ix];
  const hS = prepMrg.heights[ix];
  const hR = prepRes.heights[splitRow * w + ix];
  maxSeamDiff = Math.max(maxSeamDiff, Math.abs(hN - hS), Math.abs(hN - hR));
}
if (maxSeamDiff > 1e-4) throw new Error(`z=355 接缝出现台阶：maxSeamDiff=${maxSeamDiff}`);

// 统计分布
const By = (list, fn) => {
  const m = {};
  for (const x of list) { const k = fn(x); m[k] = (m[k] || 0) + 1; }
  return m;
};
console.log(`Placed total ${placed.length} craters: Encounter(z<355)=${encCraters.length}, Merged(z>=355)=${mrgCraters.length}`);
console.log("By zone:", By(placed, (c) => c.id.slice(7, 8)));
console.log("By kind:", By(placed, (c) => c.kind));
console.log("By age:", By(placed, (c) => c.age));
console.log(`z=355 seam max diff: ${maxSeamDiff.toFixed(6)} m`);

// 计算全图最大深度与最小净空校验
const normAll = NormalizeSceneCraters(placed);
let maxDepthCarved = 0;
for (let i = 0; i < prepRes.heights.length; i++) {
  const d = baseTerrainHeights[i] - prepRes.heights[i];
  if (d > maxDepthCarved) maxDepthCarved = d;
}
console.log(`Carved peak depth delta: ${maxDepthCarved.toFixed(2)} m (normalized count ${normAll.length})`);

if (!DRY_RUN) {
  fs.writeFileSync(ENC_JSON, FormatSceneJson(nextEnc), "utf8");
  fs.writeFileSync(MRG_JSON, FormatSceneJson(nextMrg), "utf8");
  console.log("Written Scene_FirstLevelEncounter.json and Scene_FirstLevelMerged.json (LF, one-item-per-line).");
}
