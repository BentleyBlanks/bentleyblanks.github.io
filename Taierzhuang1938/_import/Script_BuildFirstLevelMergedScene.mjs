// 构建「北沙河单村合并版」变体场景 Scenes/FirstLevelMerged/：
//   - z < 355 实时继承自 FirstLevelEncounter（零复制：01–07 前沿防炮洞、交通沟、集结处、凹路战车唯一真源）
//   - z >= 355 由 FirstLevelEncounter 的北沙河片区（原 z >= 885）整体北移 ΔZ = -530m，并在平坦切缝 z=606 处保留 +80m
//     纵深（maxZ = 990m）以 100% 保护 08a–13e 全链路剧本坐标与零穿墙路径。
//   - 北沙河村 S2 史料规模重构（撤除超标东西方盒翼 Exp_W*/Exp_E*，东西收至 ~176m、实际建成区 ~3.3 ha / ~84 座院落，
//     匹配 1938 年档案约 500 余口、百余户、240 余间房被焚尺度；村心以共墙蜂窝宗族院落、断头胡同、王家坑与南坑塘、
//     村内菜园与官道商铺重构，并按 T1–T7 / P1–P5 鲁南 12 型建筑谱系塑造真实民居与圣言会德国教堂）。
//   - 1938 年 3 月 14 日（惊蛰后 8 日）小队可穿越农田：删除 4 座错放的七八月看青草棚（Merged_Hut_*），
//     在地形中烘入 G2 主田埂、G4 排涝灌溉干沟与水坑，并布设 F1–F8 八类真实田间构筑（辘轳/桔槔浇地井、某家林族坟、
//     馒头砖窑、封门小荒庙、青石板小桥、残半冬麦秸垛、三月春耕土粪堆/弃犁、干砌青石堰）。
//   - 津浦铁路北沙河桥“桥圈六区”：升级四孔钢梁桥（八字翼墙/锥体护坡/分水尖/避车台/双态爆破）、以德式砖石巡道房小院
//     替换浮空假墙 Encounter_BeishaheBridgeRushScreen、修正起爆引线 RailFuse_Bank 改接桥南西侧工兵与起爆所、
//     补齐北段拆轨现场与排水涵洞、早春枯水沙河滩与蹚水石、南堤三营阵地与堤后伤员避弹凹窝，及桥南小庄夜行带。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DecodeSceneHeights, EncodeSceneHeights, FormatSceneJson, ValidateScene,
} from "../Script_SceneDoc.mjs";
import { DecodeTrenchDatum, EncodeTrenchDatum } from "../Script_SceneTrenches.mjs";
import { ResolveInheritedScene } from "../Script_SceneInherit.mjs";
import { MakeRoadPath, SampleRun } from "../Script_RoadPath.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(dirHere, "..");
const baseDir = path.join(projectDir, "Scenes/FirstLevelEncounter");
const outDir = path.join(projectDir, "Scenes/FirstLevelMerged");

const INHERIT_MAX_Z = 355;
const SOURCE_START_Z = 885;
const DELTA_Z = INHERIT_MAX_Z - SOURCE_START_Z; // -530m
const SPLIT_Z = 606;                            // 平坦切缝（合并坐标 z=606，对应源 z=1136）
const SOURCE_SPLIT_Z = SPLIT_Z - DELTA_Z;       // 1136
const EXPAND_Z = 80;                            // 村落向南无损扩展 80m（maxZ: 910 -> 990）
const BLEND_ROWS = 40;                          // 20m smooth transition (z = 355..375)

const Fix = (v) => Number(v.toFixed(4));
const HashStr = (str) => [...str].reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 7);
const MapZ = (srcZ, forceSouth = null) => {
  const shifted = srcZ + DELTA_Z;
  const south = forceSouth !== null ? forceSouth : shifted >= SPLIT_Z;
  return Fix(shifted + (south ? EXPAND_Z : 0));
};
const ShiftPoint = (pt, forceSouth = null) => (Array.isArray(pt)
  ? [pt[0], MapZ(pt[1], forceSouth), ...pt.slice(2)]
  : { ...pt, z: MapZ(pt.z, forceSouth) });

function IsSouthObject(raw) {
  if (raw.id.startsWith("WB2_")) return false;
  if (raw.id.startsWith("GE1_") || raw.id.startsWith("Well_3_")) return true;
  return (raw.pos[2] + DELTA_Z) >= SPLIT_Z;
}

function ShiftObject(raw) {
  const obj = structuredClone(raw);
  const south = IsSouthObject(raw);
  const dz = DELTA_Z + (south ? EXPAND_Z : 0);
  if (Array.isArray(obj.pos)) obj.pos[2] = Fix(obj.pos[2] + dz);
  if (obj.group?.startsWith("11–18/")) {
    obj.group = obj.group.replace(/^11–18\//, "08–13合并/");
  }
  if (obj.meta) {
    if (Array.isArray(obj.meta.waterRibbon)) {
      obj.meta.waterRibbon = obj.meta.waterRibbon.map(([x, nz, sz]) => [x, Fix(nz + dz), Fix(sz + dz)]);
    }
    if (Array.isArray(obj.meta.openings)) {
      obj.meta.openings = obj.meta.openings.map((op) => ({
        ...op,
        p: Array.isArray(op.p) ? [op.p[0], Fix(op.p[1] + dz)] : op.p,
      }));
    }
    if (obj.meta.room?.center) {
      obj.meta.room.center = [obj.meta.room.center[0], Fix(obj.meta.room.center[1] + dz)];
    }
    if (obj.meta.shelter && Number.isFinite(obj.meta.shelter.z)) {
      obj.meta.shelter.z = Fix(obj.meta.shelter.z + dz);
    }
  }
  return obj;
}

function DistToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-8) return { dist: Math.hypot(px - ax, pz - az), side: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  const cx = ax + vx * t, cz = az + vz * t;
  const cross = vx * (pz - az) - vz * (px - ax);
  return { dist: Math.hypot(px - cx, pz - cz), side: Math.sign(cross) };
}

function BuildMergedScene() {
  const baseDoc = JSON.parse(fs.readFileSync(path.join(baseDir, "Scene_FirstLevelEncounter.json"), "utf8"));
  const baseHeightBytes = fs.readFileSync(path.join(baseDir, baseDoc.terrain.file));
  const baseHeights = DecodeSceneHeights(baseHeightBytes, baseDoc.terrain);
  const baseDatumBytes = fs.readFileSync(path.join(baseDir, baseDoc.trenches.datum.file));
  const baseDatum = DecodeTrenchDatum(baseDoc.trenches.datum, baseDatumBytes);

  const { minX, minZ, cellM, cols, rows } = baseDoc.terrain;
  const width = cols + 1;
  const baseSplitRow = Math.round((INHERIT_MAX_Z - minZ) / cellM);  // 1670
  const srcStartRow = Math.round((SOURCE_START_Z - minZ) / cellM);  // 2730
  const srcSplitRow = Math.round((SOURCE_SPLIT_Z - minZ) / cellM);  // 3232
  const expandRows = Math.round(EXPAND_Z / cellM);                  // 160
  const northCount = srcSplitRow - srcStartRow;                     // 502 (z=355..606)
  const southCount = rows - srcSplitRow;                            // 608 (z=686..990)
  const outRows = northCount + expandRows + southCount;             // 1270 -> maxZ = 990

  const ownHeights = new Float32Array((outRows + 1) * width);
  // 1) North half: z = 355 .. 606
  for (let iz = 0; iz <= northCount; iz++) {
    const srcRow = srcStartRow + iz;
    ownHeights.set(baseHeights.subarray(srcRow * width, (srcRow + 1) * width), iz * width);
  }
  // 2) Flat expansion band: z = 606.5 .. 686 (keeps railway at x=-80 straight & level)
  const rowA = baseHeights.subarray(srcSplitRow * width, (srcSplitRow + 1) * width);
  const rowB = baseHeights.subarray(Math.min(rows, srcSplitRow + 1) * width, (Math.min(rows, srcSplitRow + 1) + 1) * width);
  for (let k = 1; k <= expandRows; k++) {
    const t = k / (expandRows + 1);
    const dstOff = (northCount + k) * width;
    for (let ix = 0; ix < width; ix++) {
      ownHeights[dstOff + ix] = rowA[ix] * (1 - t) + rowB[ix] * t;
    }
  }
  // 3) South half: z = 686.5 .. 990 (Aid, Tian, Church, River, RailwayBridge, SouthBank)
  for (let iz = 1; iz <= southCount; iz++) {
    const srcRow = srcSplitRow + iz;
    const dstRow = northCount + expandRows + iz;
    ownHeights.set(baseHeights.subarray(srcRow * width, (srcRow + 1) * width), dstRow * width);
  }
  // 4) Smoothly blend rows 0..BLEND_ROWS so row 0 matches base row 1670 identically (zero seam step).
  for (let iz = 0; iz <= BLEND_ROWS; iz++) {
    const t = iz / BLEND_ROWS;
    const w = Math.sin((Math.PI / 2) * t) ** 2;
    const northRow = Math.min(rows, baseSplitRow + iz);
    for (let ix = 0; ix < width; ix++) {
      const hNorth = baseHeights[baseSplitRow * width + ix] * (1 - t * 0.5) + baseHeights[northRow * width + ix] * (t * 0.5);
      const hSouth = ownHeights[iz * width + ix];
      ownHeights[iz * width + ix] = hNorth * (1 - w) + hSouth * w;
    }
  }

  // ---------------------------------------------------------------------------
  // 5) 3D 地形微地貌精修（严格限定 z >= 380，绝对不碰 z = 355..375 拼接过渡带）：
  //    - 村心南坑塘、村西南取土苇坑、桥西南取土苇洼、堤后伤员避弹浅凹窝
  //    - 3 条 G4 可穿越农田排涝/灌溉干沟（小队可蹲姿沿沟穿田）
  //    - G2 户界主田埂（+0.30..0.36m 真实卧倒微地形起伏）
  //    - 北沙河早春枯水北半河床干沙洲微起伏
  // ---------------------------------------------------------------------------
  const SafeMinIz = BLEND_ROWS + 10; // z >= 380
  const HeightAtOwn = (x, z) => {
    const ix = Math.max(0, Math.min(cols, Math.round((x - minX) / cellM)));
    const iz = Math.max(0, Math.min(outRows, Math.round((z - INHERIT_MAX_Z) / cellM)));
    return ownHeights[iz * width + ix];
  };
  const CarveEllipticalPit = (cx, cz, rx, rz, depth, flatRatio = 0.52) => {
    const ix0 = Math.max(0, Math.floor((cx - rx - minX) / cellM));
    const ix1 = Math.min(cols, Math.ceil((cx + rx - minX) / cellM));
    const iz0 = Math.max(SafeMinIz, Math.floor((cz - rz - INHERIT_MAX_Z) / cellM));
    const iz1 = Math.min(outRows, Math.ceil((cz + rz - INHERIT_MAX_Z) / cellM));
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = INHERIT_MAX_Z + iz * cellM;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = minX + ix * cellM;
        const r = Math.hypot((wx - cx) / rx, (wz - cz) / rz);
        if (r >= 1) continue;
        const k = r <= flatRatio ? 1 : 0.5 * (1 + Math.cos(Math.PI * (r - flatRatio) / (1 - flatRatio)));
        ownHeights[iz * width + ix] -= depth * k;
      }
    }
  };
  const CarvePolylineDitch = (pts, halfFloorW, slopeW, depth, spoilSide = 0, spoilH = 0.22) => {
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    const reach = halfFloorW + slopeW + (spoilSide ? 2.2 : 0.5);
    for (const [px, pz] of pts) {
      if (px - reach < bx0) bx0 = px - reach;
      if (px + reach > bx1) bx1 = px + reach;
      if (pz - reach < bz0) bz0 = pz - reach;
      if (pz + reach > bz1) bz1 = pz + reach;
    }
    const ix0 = Math.max(0, Math.floor((bx0 - minX) / cellM));
    const ix1 = Math.min(cols, Math.ceil((bx1 - minX) / cellM));
    const iz0 = Math.max(SafeMinIz, Math.floor((bz0 - INHERIT_MAX_Z) / cellM));
    const iz1 = Math.min(outRows, Math.ceil((bz1 - INHERIT_MAX_Z) / cellM));
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = INHERIT_MAX_Z + iz * cellM;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = minX + ix * cellM;
        let minD = Infinity, bestSide = 0;
        for (let i = 1; i < pts.length; i++) {
          const res = DistToSegment(wx, wz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
          if (res.dist < minD) { minD = res.dist; bestSide = res.side; }
        }
        if (minD < halfFloorW + slopeW) {
          const k = minD <= halfFloorW ? 1 : 0.5 * (1 + Math.cos(Math.PI * (minD - halfFloorW) / slopeW));
          ownHeights[iz * width + ix] -= depth * k;
        } else if (spoilSide && bestSide === spoilSide) {
          const sd = minD - (halfFloorW + slopeW);
          if (sd < 2.0) {
            const k = Math.sin(Math.PI * sd / 2.0);
            ownHeights[iz * width + ix] += spoilH * k * k;
          }
        }
      }
    }
  };
  const RaisePolylineBund = (pts, halfW, height) => {
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    const reach = halfW + 0.8;
    for (const [px, pz] of pts) {
      if (px - reach < bx0) bx0 = px - reach;
      if (px + reach > bx1) bx1 = px + reach;
      if (pz - reach < bz0) bz0 = pz - reach;
      if (pz + reach > bz1) bz1 = pz + reach;
    }
    const ix0 = Math.max(0, Math.floor((bx0 - minX) / cellM));
    const ix1 = Math.min(cols, Math.ceil((bx1 - minX) / cellM));
    const iz0 = Math.max(SafeMinIz, Math.floor((bz0 - INHERIT_MAX_Z) / cellM));
    const iz1 = Math.min(outRows, Math.ceil((bz1 - INHERIT_MAX_Z) / cellM));
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = INHERIT_MAX_Z + iz * cellM;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = minX + ix * cellM;
        let minD = Infinity;
        for (let i = 1; i < pts.length; i++) {
          const res = DistToSegment(wx, wz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
          if (res.dist < minD) minD = res.dist;
        }
        if (minD >= reach) continue;
        const k = minD <= halfW * 0.45 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (minD - halfW * 0.45) / (reach - halfW * 0.45)));
        ownHeights[iz * width + ix] += height * k;
      }
    }
  };

  // 村内与周边取土水坑 / 避弹凹窝
  CarveEllipticalPit(146, 643, 8.8, 6.8, 1.18, 0.50);   // 村心南坑塘（打破+80m僵直网格，还原鲁南水坑）
  CarveEllipticalPit(46, 704, 8.2, 6.4, 1.12, 0.48);    // 村西南取土苇坑
  CarveEllipticalPit(-118, 906, 10.5, 7.6, 1.08, 0.48); // 桥南西侧取土苇洼（5F）
  CarveEllipticalPit(-93.2, 884.8, 4.0, 3.6, 0.30, 0.55); // 堤后伤员与百姓避弹浅凹窝（5C）

  // 先期炮击与日机轰炸弹坑（凹坑 + 翻起焦土唇边，体现进入北沙河前已遭轰炸）
  const CarveBombCrater = (cx, cz, radius, depth, rimH = 0.24) => {
    const outerR = radius * 1.55;
    const ix0 = Math.max(0, Math.floor((cx - outerR - minX) / cellM));
    const ix1 = Math.min(cols, Math.ceil((cx + outerR - minX) / cellM));
    const iz0 = Math.max(SafeMinIz, Math.floor((cz - outerR - INHERIT_MAX_Z) / cellM));
    const iz1 = Math.min(outRows, Math.ceil((cz + outerR - INHERIT_MAX_Z) / cellM));
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = INHERIT_MAX_Z + iz * cellM;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = minX + ix * cellM;
        const r = Math.hypot(wx - cx, wz - cz);
        if (r >= outerR) continue;
        if (r <= radius) {
          const t = r / radius;
          ownHeights[iz * width + ix] -= depth * Math.cos((Math.PI / 2) * t) ** 1.6;
        } else {
          const t = (r - radius) / (outerR - radius);
          ownHeights[iz * width + ix] += rimH * Math.sin(Math.PI * t) ** 2;
        }
      }
    }
  };
  const PRE_BOMB_CRATERS = [
    { id: "NorthField", x: 128.0, z: 452.0, r: 2.8, depth: 0.85, fire: false, debris: "field" },
    { id: "NorthWest", x: 64.0, z: 492.0, r: 3.1, depth: 0.92, fire: true, debris: "ruin" },
    { id: "NorthEast", x: 150.0, z: 493.0, r: 3.3, depth: 0.98, fire: true, debris: "ruin" },
    { id: "MidEast", x: 216.0, z: 546.0, r: 3.0, depth: 0.88, fire: true, debris: "ruin" },
    { id: "MidSouth", x: 136.0, z: 656.0, r: 2.7, depth: 0.78, fire: false, debris: "ruin" },
    { id: "SouthWest", x: 74.0, z: 712.0, r: 2.6, depth: 0.75, fire: false, debris: "ruin" },
  ];
  for (const c of PRE_BOMB_CRATERS) CarveBombCrater(c.x, c.z, c.r, c.depth);

  // G4 可穿越农田排涝/灌溉干沟（小队可蹲伏穿行大片开阔田野）
  const WestFieldDitchPts = [[-6, 488], [-10, 548], [-12, 616], [-18, 672], [-28, 728], [-58, 766], [-73.5, 789]];
  const NorthBankDitchPts = [[44, 762], [26, 768], [6, 778], [-14, 796]];
  const EastFieldDitchNPts = [[234, 492], [242, 542], [248, 560]];
  const EastFieldDitchSPts = [[254, 586], [258, 646], [244, 706]];
  CarvePolylineDitch(WestFieldDitchPts, 0.55, 1.05, 0.78, 1, 0.22);
  CarvePolylineDitch(NorthBankDitchPts, 0.45, 0.85, 0.56, -1, 0.18);
  CarvePolylineDitch(EastFieldDitchNPts, 0.50, 0.95, 0.72, 1, 0.20);
  CarvePolylineDitch(EastFieldDitchSPts, 0.50, 0.95, 0.72, 1, 0.20);

  // G2 真实 3D 户界主田埂（开阔田野卧倒防掠射微地形，严格避开所有路/河/建筑与任务路径）
  for (const [pts, h] of [
    [[[-68, 412], [-20, 422], [38, 430], [82, 434]], 0.32],
    [[[-68, 506], [-24, 514], [18, 508], [44, 512]], 0.34],
    [[[-68, 594], [-26, 586], [14, 592], [44, 588]], 0.34],
    [[[-66, 658], [-32, 666], [8, 660], [42, 666]], 0.32],
    [[[-64, 724], [-34, 720], [-2, 726], [36, 718]], 0.30],
    [[[152, 404], [208, 418], [264, 432], [308, 440]], 0.32],
    [[[228, 514], [270, 506], [312, 514]], 0.32],
    [[[228, 608], [274, 616], [312, 608]], 0.34],
    [[[226, 678], [272, 686], [312, 676]], 0.32],
    [[[-148, 616], [-116, 624], [-88, 620]], 0.32],
    [[[-148, 724], [-118, 732], [-90, 728]], 0.32],
    [[[-146, 944], [-114, 938], [-88, 944]], 0.30],
    [[[8, 916], [56, 926], [110, 918]], 0.30],
  ]) RaisePolylineBund(pts, 0.72, h);

  // 北沙河早春枯水北半河床干沙洲微起伏（z: 830..847，避开桥墩与桥台紧贴区）
  for (let iz = Math.floor((831 - INHERIT_MAX_Z) / cellM); iz <= Math.ceil((846 - INHERIT_MAX_Z) / cellM); iz++) {
    const wz = INHERIT_MAX_Z + iz * cellM;
    const zEnv = Math.sin(Math.PI * Math.max(0, Math.min(1, (wz - 831) / 15)));
    for (let ix = 0; ix <= cols; ix++) {
      const wx = minX + ix * cellM;
      if (wx > 18 || Math.abs(wx - (-80)) < 4.5) continue;
      if (ownHeights[iz * width + ix] > -2.1) continue;
      const bar = 0.5 + 0.5 * Math.sin(wx * 0.085 + wz * 0.24) * Math.cos(wx * 0.032 - wz * 0.11);
      ownHeights[iz * width + ix] += 0.28 * zEnv * bar;
    }
  }

  // Shift datum patches in Beishahe
  const ownDatum = baseDatum
    .filter((patch) => patch.minZ >= SOURCE_START_Z)
    .map((patch) => ({ ...patch, minZ: MapZ(patch.minZ) }));

  // ---------------------------------------------------------------------------
  // 6) 复制并净化基线北沙河物件（z >= 885）：
  //    - 跳过 WA1（替换为关帝庙）、TeleWire_06（跨缝重建）
  //    - 删除浮空假墙 Encounter_BeishaheBridgeRushScreen（由二区德式砖石巡道房取代！）
  //    - 跳过旧版 RailCharge_* / RailFuse_* / FallenGirder_*（在桥圈一区以修复西接火线+写实塌梁重建）
  // ---------------------------------------------------------------------------
  const SKIP_BASE_IDS = new Set([
    "TeleWire_06",
    "Encounter_BeishaheBridgeRushScreen",
    "RailCharge_1", "RailCharge_2",
    "RailFuse_Bridge", "RailFuse_Bank",
    "FallenGirder_S1W", "FallenGirder_S1E", "FallenGirder_S2W", "FallenGirder_S2E",
  ]);
  const ownObjects = [];
  for (const raw of baseDoc.objects) {
    if (!raw.pos || raw.pos[2] < SOURCE_START_Z) continue;
    if (raw.id.startsWith("WA1_")) continue;
    if (SKIP_BASE_IDS.has(raw.id)) continue;
    if (raw.id === "MA3_WallR") {
      ownObjects.push(
        {
          id: "MA3_WallR_North", asset: "Whitebox/Box", material: "Whitebox/Plaster",
          pos: [125.1, null, 563.55], size: [0.5, 2.2, 0.95], yawDeg: raw.yawDeg,
          group: "08–13合并/建筑/MA3",
        },
        {
          id: "MA3_WallR_South", asset: "Whitebox/Box", material: "Whitebox/Plaster",
          pos: [125.1, null, 572.1], size: [0.5, 2.2, 13.0], yawDeg: raw.yawDeg,
          group: "08–13合并/建筑/MA3",
        },
        {
          id: "MA3_SideGate_Door", asset: "Whitebox/Box", material: "Whitebox/Timber",
          pos: [125.1, null, 564.8], size: [0.18, 2.0, 1.55], yawDeg: raw.yawDeg,
          hideOn: "SideGateOpen", group: "08–13合并/事件/便门",
        },
      );
      continue;
    }
    if (raw.id === "BshTree_04") {
      const moved = ShiftObject(raw);
      moved.pos = [120.5, null, 556.5];
      ownObjects.push(moved);
      continue;
    }
    const shifted = ShiftObject(raw);
    if (shifted.id === "RailWalk_S1" || shifted.id === "RailWalk_S2") {
      shifted.hideOn = "BridgeBlown";
    }
    ownObjects.push(shifted);
  }

  // ---------------------------------------------------------------------------
  // 7) 既有院落按鲁南社会经济梯度差异化（打破千院一面，同时 100% 保护主线可进院落）
  // ---------------------------------------------------------------------------
  const SKIP_DIVERSIFY = new Set(["MA3", "MA4", "Aid", "Tian", "Mat", "Church", "YBombed", "Merged", "LoneYard"]);
  const compoundOrder = [];
  const compoundMap = new Map();
  for (const obj of ownObjects) {
    const m = /^([A-Za-z0-9]+)_(Wall|House)/.exec(obj.id);
    if (!m) continue;
    const prefix = m[1];
    if (SKIP_DIVERSIFY.has(prefix)) continue;
    if (!compoundMap.has(prefix)) {
      compoundMap.set(prefix, []);
      compoundOrder.push(prefix);
    }
    compoundMap.get(prefix).push(obj);
  }
  const decorAdded = [];
  for (let idx = 0; idx < compoundOrder.length; idx++) {
    const prefix = compoundOrder[idx];
    const parts = compoundMap.get(prefix);
    const hVal = HashStr(prefix);
    const isEdgePoor = /^(NA1|NA2|NC2|WB|SW|Lz)/.test(prefix);
    const isRichCenter = /^(DA1|DB2|GE1|GW1|SR2|MC1)/.test(prefix);
    const style = isRichCenter ? 2 : isEdgePoor ? (hVal % 2 === 0 ? 1 : 3) : ((hVal + idx * 2) % 5);
    const isNorthFront = /^(NA|NB|NC)/.test(prefix);
    const walls = parts.filter((o) => o.id.startsWith(`${prefix}_Wall`));
    const roofs = parts.filter((o) => /_House\d+_Roof$/.test(o.id));
    const houseWalls = parts.filter((o) => /_House\d+/.test(o.id) && !/_Roof$/.test(o.id));

    if (style === 0) {
      for (const r of roofs) {
        const isMain = r.id.includes("House1");
        const lift = isMain ? 0.35 : 0.1;
        r.pos[1] = Fix(r.pos[1] + lift);
        r.size[1] = Fix(isMain ? 0.40 : 0.36);
        decorAdded.push({
          id: `${r.id}_Ridge`, asset: "Whitebox/Box", material: "Whitebox/Roof",
          pos: [r.pos[0], Fix(r.pos[1] + r.size[1] * 0.90), r.pos[2]],
          size: [Fix(r.size[0] * 0.94), Fix(isMain ? 0.56 : 0.40), Fix(r.size[2] * 0.52)],
          yawDeg: r.yawDeg, group: r.group,
        });
        if (isMain) {
          decorAdded.push({
            id: `${r.id}_Crest`, asset: "Whitebox/Box", material: "Whitebox/Structure",
            pos: [r.pos[0], Fix(r.pos[1] + r.size[1] + 0.50), r.pos[2]],
            size: [Fix(r.size[0] * 0.96), 0.22, 0.38],
            yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
      for (const hw of houseWalls) {
        if (hw.id.includes("House1") && hw.size[1] >= 2.5) hw.size[1] = Fix(hw.size[1] + 0.35);
      }
    } else if (style === 1) {
      // 陡坡厚草顶土坯农舍（T2 半面槽风貌）
      for (const w of walls) {
        w.material = "Whitebox/Step";
        w.size[1] = Fix(1.88 + (hVal % 3) * 0.08);
      }
      for (const hw of houseWalls) {
        if (hw.material === "Whitebox/Plaster") hw.material = "Whitebox/Step";
      }
      for (const r of roofs) {
        r.material = "Whitebox/Canvas";
        r.size[1] = 0.48;
        decorAdded.push(
          {
            id: `${r.id}_ThatchCrown`, asset: "Whitebox/Box", material: "Whitebox/Canvas",
            pos: [r.pos[0], Fix(r.pos[1] + 0.42), r.pos[2]],
            size: [Fix(r.size[0] * 0.90), 0.50, Fix(r.size[2] * 0.62)],
            yawDeg: r.yawDeg, group: r.group,
          },
          {
            id: `${r.id}_ThatchCap`, asset: "Whitebox/Box", material: "Whitebox/Step",
            pos: [r.pos[0], Fix(r.pos[1] + 0.88), r.pos[2]],
            size: [Fix(r.size[0] * 0.86), 0.28, Fix(r.size[2] * 0.28)],
            yawDeg: r.yawDeg, group: r.group,
          },
        );
        if (r.id.includes("House1")) {
          const rad = (r.yawDeg || 0) * Math.PI / 180;
          const off = r.size[0] * 0.34;
          decorAdded.push({
            id: `${prefix}_Chimney`, asset: "Whitebox/Box", material: "Whitebox/Structure",
            pos: [Fix(r.pos[0] + Math.cos(rad) * off), Fix(r.pos[1] + 0.35), Fix(r.pos[2] - Math.sin(rad) * off)],
            size: [0.55, 1.45, 0.55], yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
    } else if (style === 2) {
      // 殷实砖瓦高脊大院（T4/T5）
      for (const w of walls) {
        w.size[1] = 2.45;
        decorAdded.push({
          id: `${w.id}_Coping`, asset: "Whitebox/Box", material: "Whitebox/Coping",
          pos: [w.pos[0], 2.72, w.pos[2]],
          size: [Fix(w.size[0] + 0.08), 0.16, Fix(w.size[2] + 0.08)],
          yawDeg: w.yawDeg, group: w.group, solid: false,
        });
      }
      for (const r of roofs) {
        const isMain = r.id.includes("House1");
        r.pos[1] = Fix(r.pos[1] + (isMain ? 0.55 : 0.25));
        r.size[1] = 0.44;
        decorAdded.push({
          id: `${r.id}_HighRidge`, asset: "Whitebox/Box", material: "Whitebox/Roof",
          pos: [r.pos[0], Fix(r.pos[1] + 0.40), r.pos[2]],
          size: [Fix(r.size[0] * 0.92), Fix(isMain ? 0.72 : 0.46), Fix(r.size[2] * 0.48)],
          yawDeg: r.yawDeg, group: r.group,
        });
        if (isMain) {
          decorAdded.push({
            id: `${r.id}_BrickCrest`, asset: "Whitebox/Box", material: "Whitebox/Structure",
            pos: [r.pos[0], Fix(r.pos[1] + 1.08), r.pos[2]],
            size: [Fix(r.size[0] * 0.96), 0.22, 0.38],
            yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
      for (const hw of houseWalls) {
        if (hw.id.includes("House1") && hw.size[1] >= 2.5) hw.size[1] = Fix(hw.size[1] + 0.55);
      }
      const mainRoof = roofs.find((r) => r.id.includes("House1"));
      const wallF = walls.find((w) => w.id.endsWith("_WallF_1"));
      if (mainRoof && wallF) {
        decorAdded.push({
          id: `${prefix}_YardTree`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
          pos: [Fix((mainRoof.pos[0] + wallF.pos[0]) * 0.5), null, Fix((mainRoof.pos[2] + wallF.pos[2]) * 0.5)],
          size: [0.46, Fix(5.2 + (hVal % 3) * 0.9), 0.46], group: mainRoof.group,
        });
      }
    } else if (style === 3) {
      // 矮墙偏棚草房院（T2 贫户）
      for (const w of walls) {
        w.material = (hVal % 2 === 0) ? "Whitebox/EarthDark" : "Whitebox/Step";
        w.size[1] = 1.72;
      }
      for (const r of roofs) {
        if (r.id.includes("House2")) {
          r.material = "Whitebox/Canvas";
          r.pos[1] = Fix(r.pos[1] - 0.18);
          r.size[1] = 0.38;
        } else {
          r.material = "Whitebox/Roof";
          decorAdded.push({
            id: `${r.id}_LowPitch`, asset: "Whitebox/Box", material: "Whitebox/Roof",
            pos: [r.pos[0], Fix(r.pos[1] + 0.42), r.pos[2]],
            size: [Fix(r.size[0] * 0.90), 0.40, Fix(r.size[2] * 0.46)],
            yawDeg: r.yawDeg, group: r.group,
          });
        }
      }
      const wallL = walls.find((w) => w.id.endsWith("_WallL"));
      const mainRoof = roofs.find((r) => r.id.includes("House1"));
      if (wallL && mainRoof) {
        decorAdded.push({
          id: `${prefix}_Firewood`, asset: "Whitebox/Box", material: "Whitebox/Timber",
          pos: [Fix(wallL.pos[0] + (mainRoof.pos[0] > wallL.pos[0] ? 1.2 : -1.2)), null, Fix(wallL.pos[2])],
          size: [1.1, 0.92, 2.1], yawDeg: wallL.yawDeg, group: wallL.group,
        });
      }
    } else {
      // 炮损/战损残梁院落（T7）
      for (const w of walls) {
        w.material = isNorthFront ? "Whitebox/Step" : "Whitebox/Plaster";
        if (w.id.endsWith("_WallF_2") || w.id.endsWith("_WallB")) w.size[1] = 1.32;
      }
      for (const r of roofs) {
        if (r.id.includes("House1")) {
          r.material = "Whitebox/Roof";
          r.size[0] = Fix(r.size[0] * 0.78);
          decorAdded.push(
            {
              id: `${r.id}_Rafter1`, asset: "Whitebox/Box", material: "Whitebox/Timber",
              pos: [r.pos[0], Fix(r.pos[1] + 0.36), r.pos[2]],
              size: [Fix(r.size[0] * 1.15), 0.16, 0.22], yawDeg: r.yawDeg, group: r.group,
            },
            {
              id: `${r.id}_RemnantPitch`, asset: "Whitebox/Box", material: "Whitebox/Roof",
              pos: [r.pos[0], Fix(r.pos[1] + 0.44), r.pos[2]],
              size: [Fix(r.size[0] * 0.72), 0.38, Fix(r.size[2] * 0.48)], yawDeg: r.yawDeg, group: r.group,
            },
          );
        }
      }
    }
  }
  const ma4MainRoof = ownObjects.find((o) => o.id === "MA4_House1_Roof");
  const ma4KitRoof = ownObjects.find((o) => o.id === "MA4_House2_Roof");
  if (ma4MainRoof) {
    decorAdded.push(
      {
        id: "MA4_House1_Ridge", asset: "Whitebox/Box", material: "Whitebox/Roof",
        pos: [ma4MainRoof.pos[0], Fix(ma4MainRoof.pos[1] + 0.48), ma4MainRoof.pos[2]],
        size: [9.6, 0.56, 2.8], yawDeg: ma4MainRoof.yawDeg, group: ma4MainRoof.group,
      },
      {
        id: "MA4_House1_Crest", asset: "Whitebox/Box", material: "Whitebox/Structure",
        pos: [ma4MainRoof.pos[0], Fix(ma4MainRoof.pos[1] + 1.02), ma4MainRoof.pos[2]],
        size: [9.8, 0.22, 0.36], yawDeg: ma4MainRoof.yawDeg, group: ma4MainRoof.group,
      },
    );
  }
  if (ma4KitRoof) {
    decorAdded.push({
      id: "MA4_Kitchen_Chimney", asset: "Whitebox/Box", material: "Whitebox/Structure",
      pos: [Fix(ma4KitRoof.pos[0] - 1.5), Fix(ma4KitRoof.pos[1] + 0.45), Fix(ma4KitRoof.pos[2] + 2.2)],
      size: [0.55, 1.4, 0.55], yawDeg: ma4KitRoof.yawDeg, group: ma4KitRoof.group,
    });
  }
  ownObjects.push(...decorAdded);

  // ---------------------------------------------------------------------------
  // 8) 升级圣言会德国天主教堂（P1，保留原有门洞/墙体/地面，强化德式教堂尖顶与扶壁剪影）
  // ---------------------------------------------------------------------------
  const churchG = "08–13合并/地标/德国教堂";
  const churchBaseY = 0.37;
  ownObjects.push(
    // 礼拜堂高陡双坡红/灰瓦顶（三阶陡坡 + 石砌屋脊）
    { id: "Church_Gable_1", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [63.01, 7.42, 768.5], size: [14.6, 0.72, 7.2], group: churchG },
    { id: "Church_Gable_2", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [63.01, 8.10, 768.5], size: [14.4, 0.68, 4.4], group: churchG },
    { id: "Church_Gable_3", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [63.01, 8.74, 768.5], size: [14.2, 0.56, 1.8], group: churchG },
    { id: "Church_RidgeCrest", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [63.01, 9.26, 768.5], size: [14.5, 0.24, 0.42], group: churchG },
    // 教堂毛石基脚与外墙扶壁砖柱
    { id: "Church_PlinthN", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [63.01, churchBaseY, 763.82], size: [14.3, 0.82, 0.42], group: churchG, solid: false },
    { id: "Church_PlinthW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [55.82, churchBaseY, 768.5], size: [0.42, 0.82, 9.3], group: churchG, solid: false },
    { id: "Church_Buttress_NW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [55.75, churchBaseY, 764.4], size: [0.55, 5.4, 0.65], group: churchG },
    { id: "Church_Buttress_SW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [55.75, churchBaseY, 772.6], size: [0.55, 5.4, 0.65], group: churchG },
    { id: "Church_Buttress_NE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [70.25, churchBaseY, 764.4], size: [0.55, 5.4, 0.65], group: churchG },
    { id: "Church_Buttress_NM1", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [60.2, churchBaseY, 763.75], size: [0.58, 5.4, 0.55], group: churchG },
    { id: "Church_Buttress_NM2", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [65.8, churchBaseY, 763.75], size: [0.58, 5.4, 0.55], group: churchG },
    // 钟楼百叶窗暗洞与四坡阶梯尖顶
    { id: "Church_BelfryVoidS", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [72.01, 8.6, 772.12], size: [0.95, 1.85, 0.14], group: churchG, solid: false },
    { id: "Church_BelfryVoidE", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [73.62, 8.6, 770.49], size: [0.14, 1.85, 0.95], group: churchG, solid: false },
    { id: "Church_Spire_1", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [72.01, 12.50, 770.49], size: [2.35, 1.15, 2.35], group: churchG },
    { id: "Church_Spire_2", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [72.01, 13.60, 770.49], size: [1.25, 1.05, 1.25], group: churchG },
    // 教堂西侧中式神父房/育德小学偏厢（靠西院墙内侧，远离正门 x=63）
    { id: "Church_SchoolBody", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [54.1, null, 777.2], size: [3.2, 2.85, 7.0], group: churchG },
    { id: "Church_SchoolRoof", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [54.1, 3.15, 777.2], size: [3.7, 0.36, 7.5], group: churchG },
    { id: "Church_SchoolRidge", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [54.1, 3.48, 777.2], size: [2.0, 0.42, 7.2], group: churchG },
    // 院外逃难老乡包袱与木车轮
    { id: "Church_RefugeePack1", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [59.2, null, 783.1], size: [1.1, 0.52, 0.8], yawDeg: 14, group: churchG },
    { id: "Church_RefugeePack2", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [67.4, null, 783.0], size: [0.95, 0.44, 0.72], yawDeg: -18, group: churchG },
  );
  // 提高原有十字架到新尖顶之上
  for (const o of ownObjects) {
    if (o.id === "Church_Cross") o.pos[1] = 14.62;
    if (o.id === "Church_CrossArm") o.pos[1] = 15.52;
  }

  // ---------------------------------------------------------------------------
  // 9) 鲁南 T1–T7 真实民居与商铺生成器（替代僵硬方盒 AddLunanYard）
  //    支持：
  //      T1 贫农独栋/排房草屋（无砖院墙，仅前部矮荆笆，低檐 2.15m 陡坡厚草顶 + 泥灶烟囱 + 柴垛）
  //      T2 半面槽 L 型草房院（1.85m 土墙 + 陡坡草顶正房 + 单侧偏坡灶屋 + 连茅圈猪厕 + 水缸）
  //      T3 兄弟分家剖半窄院（中间土坯隔墙劈成两窄院，一瓦一草错落，共享山墙）
  //      T4 中农里生外熟砖瓦三合院（0.6m 石勒脚 + 青砖灰瓦正房 + 东西偏厢 + 砖门楼 + 影壁 + 连茅圈）
  //      T5 殷实青砖四合院（高墙瓦压顶 + 高脊灰瓦正房 + 对称厢房 + 高大门楼 + 院内古树）
  //      T6 官道临街铺面/大车店（无封闭前院墙，临街敞口铺面 + 挑檐雨搭 + 拴马桩 + 长石槽 + 枕木垛）
  //    支持 opts.damaged (T7 战损残梁 / 院内斜坡避难土洞) 与 opts.sharedWalls（相邻共墙省去重复贴墙）
  // ---------------------------------------------------------------------------
  const AddLunanCompound = (id, type, cx, cz, w, d, opts = {}) => {
    const hVal = HashStr(id);
    const gateSide = opts.gateSide || "S";
    const yawDeg = opts.yawDeg ?? (((hVal % 7) - 3) * 0.55);
    const group = opts.group || `08–13合并/建筑/${id}`;
    const wallT = 0.46;
    const hw = w / 2, hd = d / 2;
    const rad = (yawDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const LocalToWorld = (lx, lz) => [Fix(cx + lx * cos + lz * sin), Fix(cz - lx * sin + lz * cos)];
    const Push = (suffix, lx, y, lz, sw, sh, sd, mat, extra = {}) => {
      if (sw <= 0.05 || sh <= 0.05 || sd <= 0.05) return;
      const [wx, wz] = LocalToWorld(lx, lz);
      ownObjects.push({
        id: `${id}_${suffix}`, asset: "Whitebox/Box", material: mat,
        pos: [wx, y === null ? null : Fix(y), wz],
        size: [Fix(sw), Fix(sh), Fix(sd)],
        ...(yawDeg ? { yawDeg: Fix(yawDeg) } : {}),
        group, ...extra,
      });
    };

    const AddPitchedRoof = (prefix, lx, lz, rw, rd, eaveY, styleKind) => {
      if (styleKind === "thatch") {
        // 陡坡厚草顶（38°–42° 三阶梯轮廓 + 泥封草脊）
        Push(`${prefix}_Roof`, lx, eaveY, lz, rw + 0.72, 0.42, rd + 0.72, "Whitebox/Canvas");
        Push(`${prefix}_ThatchCrown`, lx, eaveY + 0.38, lz, rw + 0.32, 0.52, rd * 0.64, "Whitebox/Canvas");
        Push(`${prefix}_ThatchCap`, lx, eaveY + 0.86, lz, rw * 0.94, 0.34, rd * 0.28, "Whitebox/Step");
      } else if (styleKind === "highTile") {
        Push(`${prefix}_Roof`, lx, eaveY, lz, rw + 0.66, 0.38, rd + 0.66, "Whitebox/Roof");
        Push(`${prefix}_HighRidge`, lx, eaveY + 0.36, lz, rw + 0.24, 0.62, rd * 0.52, "Whitebox/Roof");
        Push(`${prefix}_Crest`, lx, eaveY + 0.94, lz, rw + 0.36, 0.22, 0.38, "Whitebox/Structure");
      } else if (styleKind === "damaged") {
        Push(`${prefix}_Roof`, lx - rw * 0.08, eaveY, lz, rw * 0.76, 0.36, rd + 0.52, "Whitebox/Roof");
        Push(`${prefix}_Ridge`, lx - rw * 0.10, eaveY + 0.34, lz, rw * 0.66, 0.42, rd * 0.48, "Whitebox/Roof");
        Push(`${prefix}_Rafter1`, lx + rw * 0.16, eaveY + 0.22, lz - rd * 0.18, rw * 0.48, 0.14, 0.20, "Whitebox/Timber");
        Push(`${prefix}_Rafter2`, lx + rw * 0.18, eaveY + 0.22, lz + rd * 0.16, rw * 0.44, 0.14, 0.20, "Whitebox/Timber");
      } else {
        // 标准鲁南硬山小青瓦双坡顶
        Push(`${prefix}_Roof`, lx, eaveY, lz, rw + 0.62, 0.36, rd + 0.62, "Whitebox/Roof");
        Push(`${prefix}_Ridge`, lx, eaveY + 0.34, lz, rw + 0.20, 0.48, rd * 0.50, "Whitebox/Roof");
        Push(`${prefix}_Crest`, lx, eaveY + 0.78, lz, rw + 0.26, 0.18, 0.32, "Whitebox/Structure");
      }
    };

    const AddPigstyLatrine = (lx, lz) => {
      // 鲁南标配院角无顶“连茅圈”（猪厕一体矮土墙 + 猪槽）
      Push("Pigsty_W", lx - 1.15, null, lz, 0.30, 1.18, 2.2, "Whitebox/Step");
      Push("Pigsty_E", lx + 1.15, null, lz, 0.30, 1.18, 2.2, "Whitebox/Step");
      Push("Pigsty_N", lx, null, lz - 1.0, 2.4, 1.18, 0.30, "Whitebox/Step");
      Push("Pigsty_Trough", lx - 0.35, null, lz + 0.3, 0.95, 0.38, 0.42, "Whitebox/Structure");
    };

    const AddShelterDugout = (lx, lz) => {
      // 院内战时斜坡避难土洞（覆土高粱席顶 + 暗口）
      Push("Dugout_Mound", lx, null, lz, 3.2, 0.85, 2.4, "Whitebox/EarthDark");
      Push("Dugout_Mat", lx, 0.82, lz, 3.0, 0.10, 2.2, "Whitebox/Canvas", { solid: false });
      Push("Dugout_Mouth", lx, null, lz + 1.15, 1.15, 0.72, 0.32, "Whitebox/Void", { solid: false });
    };

    // ----- T1：贫农独栋/排房草屋（无完整砖墙，矮荆笆围前场） -----
    if (type === "T1") {
      const hW = Math.max(5.8, w - 0.8), hD = Math.min(4.5, Math.max(3.6, d * 0.44));
      const hZ = gateSide === "N" ? (hd - hD / 2 - 0.3) : (-hd + hD / 2 + 0.3);
      const eaveH = 2.18;
      Push("House1_Body", 0, null, hZ, hW, eaveH, hD, "Whitebox/Step");
      Push("House1_DoorVoid", 0, null, hZ + (gateSide === "N" ? -hD / 2 - 0.04 : hD / 2 + 0.04), 1.05, 1.72, 0.12, "Whitebox/Void", { solid: false });
      AddPitchedRoof("House1", 0, hZ, hW, hD, eaveH + 0.18, opts.damaged ? "damaged" : "thatch");
      Push("Chimney", hW * 0.38, eaveH + 0.2, hZ, 0.48, 1.35, 0.48, "Whitebox/Structure");
      // 前场矮荆条篱笆（敞口柴门）
      const fZ = gateSide === "N" ? (-hd + 0.35) : (hd - 0.35);
      Push("Fence_FrontL", -hw * 0.56, null, fZ, hw * 0.72, 1.05, 0.22, "Whitebox/Timber");
      Push("Fence_FrontR", hw * 0.56, null, fZ, hw * 0.72, 1.05, 0.22, "Whitebox/Timber");
      Push("Fence_SideW", -hw + 0.25, null, (fZ + hZ) * 0.5, 0.22, 1.05, Math.max(1.8, Math.abs(fZ - hZ) - hD * 0.45), "Whitebox/Timber");
      // 檐下柴禾垛 + 破陶水缸
      Push("Firewood", -hW * 0.34, null, hZ + (gateSide === "N" ? -hD * 0.65 : hD * 0.65), 1.6, 0.85, 0.9, "Whitebox/Timber");
      Push("WaterVat", hW * 0.26, null, hZ + (gateSide === "N" ? -hD * 0.62 : hD * 0.62), 0.72, 0.82, 0.72, "Whitebox/EarthDark");
      return;
    }

    // ----- T6：官道临街铺面 / 大车店（前店无封闭院墙，带挑檐雨搭与马槽） -----
    if (type === "T6") {
      const shopD = Math.min(5.2, d * 0.42);
      const frontIsE = gateSide === "E";
      const frontIsW = gateSide === "W";
      if (frontIsE || frontIsW) {
        const dir = frontIsE ? 1 : -1;
        const shopX = dir * (hw - shopD / 2 - 1.2);
        const shopH = 2.85;
        Push("House1_Body", shopX, null, 0, shopD, shopH, d - 0.8, "Whitebox/Plaster");
        Push("House1_Plinth", shopX, null, 0, shopD + 0.14, 0.55, d - 0.65, "Whitebox/Structure", { solid: false });
        AddPitchedRoof("House1", shopX, 0, shopD, d - 0.8, shopH + 0.20, "tile");
        // 临街敞口铺门暗面 + 挑檐草/木雨搭 + 拴马桩/长石槽
        Push("ShopFrontVoid", shopX + dir * (shopD / 2 + 0.05), null, 0, 0.14, 2.2, Math.min(4.6, d * 0.46), "Whitebox/Void", { solid: false });
        Push("ShopAwning", shopX + dir * (shopD / 2 + 0.92), 2.38, 0, 1.85, 0.16, d - 1.2, "Whitebox/Canvas", { solid: false });
        Push("AwningPost1", shopX + dir * (shopD / 2 + 1.65), null, -(d / 2 - 1.2), 0.16, 2.38, 0.16, "Whitebox/Timber");
        Push("AwningPost2", shopX + dir * (shopD / 2 + 1.65), null, (d / 2 - 1.2), 0.16, 2.38, 0.16, "Whitebox/Timber");
        Push("HorseTrough", shopX + dir * (shopD / 2 + 1.15), null, d * 0.24, 0.62, 0.55, 2.1, "Whitebox/Structure");
        // 后院围墙与枕木柴垛
        const backX = -dir * (hw - wallT / 2);
        Push("WallBack", backX, null, 0, wallT, 2.05, d, "Whitebox/Step");
        Push("WallN", -dir * 1.4, null, -hd + wallT / 2, w - shopD - 1.0, 2.05, wallT, "Whitebox/Step");
        Push("WallS", -dir * 1.4, null, hd - wallT / 2, w - shopD - 1.0, 2.05, wallT, "Whitebox/Step");
        Push("SleeperStack", shopX + dir * (shopD / 2 + 1.0), null, -d * 0.28, 1.05, 0.78, 2.3, "Whitebox/Timber");
      } else {
        const dir = gateSide === "S" ? 1 : -1;
        const shopZ = dir * (hd - shopD / 2 - 1.1);
        const shopH = 2.85;
        Push("House1_Body", 0, null, shopZ, w - 0.8, shopH, shopD, "Whitebox/Plaster");
        AddPitchedRoof("House1", 0, shopZ, w - 0.8, shopD, shopH + 0.20, "tile");
        Push("ShopAwning", 0, 2.38, shopZ + dir * (shopD / 2 + 0.9), w - 1.4, 0.16, 1.8, "Whitebox/Canvas", { solid: false });
        Push("HorseTrough", -w * 0.25, null, shopZ + dir * (shopD / 2 + 1.1), 2.1, 0.55, 0.62, "Whitebox/Structure");
        Push("WallBack", 0, null, -dir * (hd - wallT / 2), w, 2.05, wallT, "Whitebox/Step");
        Push("WallW", -hw + wallT / 2, null, -dir * 1.2, wallT, 2.05, d - shopD - 1.0, "Whitebox/Step");
        Push("WallE", hw - wallT / 2, null, -dir * 1.2, wallT, 2.05, d - shopD - 1.0, "Whitebox/Step");
      }
      return;
    }

    // ----- T2 / T3 / T4 / T5 围合院落 -----
    const wallH = type === "T5" ? 2.50 : type === "T4" ? 2.18 : type === "T3" ? 1.98 : 1.86;
    const wallMat = (type === "T4" || type === "T5") ? "Whitebox/Plaster" : (hVal % 2 === 0 ? "Whitebox/Step" : "Whitebox/EarthDark");
    const mainH = type === "T5" ? 3.25 : type === "T4" ? 2.85 : type === "T3" ? 2.48 : 2.38;
    const mainRoofStyle = opts.damaged ? "damaged"
      : type === "T5" ? "highTile"
      : type === "T4" ? "tile"
      : "thatch";
    const gateW = type === "T3" ? 1.55 : type === "T5" ? 2.25 : 1.95;

    const AddSideWall = (sideName, isHoriz, offset, span, hasGate, gateOffset = 0) => {
      if (!hasGate) {
        if (isHoriz) Push(`Wall${sideName}`, 0, null, offset, span, wallH, wallT, wallMat);
        else Push(`Wall${sideName}`, offset, null, 0, wallT, wallH, span, wallMat);
        if (type === "T5") {
          if (isHoriz) Push(`Wall${sideName}_Coping`, 0, wallH + 0.16, offset, span + 0.08, 0.16, wallT + 0.10, "Whitebox/Coping", { solid: false });
          else Push(`Wall${sideName}_Coping`, offset, wallH + 0.16, 0, wallT + 0.10, 0.16, span + 0.08, "Whitebox/Coping", { solid: false });
        }
        return;
      }
      const leftSpan = Math.max(0.9, span / 2 + gateOffset - gateW / 2);
      const rightSpan = Math.max(0.9, span / 2 - gateOffset - gateW / 2);
      const leftCenter = -span / 2 + leftSpan / 2;
      const rightCenter = span / 2 - rightSpan / 2;
      if (isHoriz) {
        Push(`Wall${sideName}_1`, leftCenter, null, offset, leftSpan, wallH, wallT, wallMat);
        Push(`Wall${sideName}_2`, rightCenter, null, offset, rightSpan, wallH, wallT, wallMat);
        if (type === "T4" || type === "T5") {
          // 鲁南硬山砖门楼 + 院内影壁
          Push("Gatehouse_Roof", gateOffset, wallH + 0.32, offset, gateW + 1.15, 0.42, 1.35, "Whitebox/Roof", { solid: false });
          Push("Gatehouse_Ridge", gateOffset, wallH + 0.70, offset, gateW + 0.85, 0.34, 0.62, "Whitebox/Roof", { solid: false });
          const screenZ = offset + (offset > 0 ? -2.2 : 2.2);
          Push("SpiritScreen", gateOffset, null, screenZ, Math.min(2.6, gateW + 0.4), 1.95, 0.34, "Whitebox/Plaster");
        } else {
          Push("GateLintel", gateOffset, wallH + 0.10, offset, gateW + 0.45, 0.28, wallT + 0.12, "Whitebox/Timber", { solid: false });
        }
      } else {
        Push(`Wall${sideName}_1`, offset, null, leftCenter, wallT, wallH, leftSpan, wallMat);
        Push(`Wall${sideName}_2`, offset, null, rightCenter, wallT, wallH, rightSpan, wallMat);
        if (type === "T4" || type === "T5") {
          Push("Gatehouse_Roof", offset, wallH + 0.32, gateOffset, 1.35, 0.42, gateW + 1.15, "Whitebox/Roof", { solid: false });
          Push("Gatehouse_Ridge", offset, wallH + 0.70, gateOffset, 0.62, 0.34, gateW + 0.85, "Whitebox/Roof", { solid: false });
          const screenX = offset + (offset > 0 ? -2.2 : 2.2);
          Push("SpiritScreen", screenX, null, gateOffset, 0.34, 1.95, Math.min(2.6, gateW + 0.4), "Whitebox/Plaster");
        } else {
          Push("GateLintel", offset, wallH + 0.10, gateOffset, wallT + 0.12, 0.28, gateW + 0.45, "Whitebox/Timber", { solid: false });
        }
      }
    };

    // 传统鲁南院门偏开东南/西南角（非死板居中）
    const gateShift = (type === "T4" || type === "T5" || type === "T2")
      ? ((gateSide === "S" || gateSide === "N") ? Math.min(hw * 0.38, Math.max(0, hw - 2.6)) : Math.min(hd * 0.32, Math.max(0, hd - 2.6)))
      : 0;

    if (type === "T3" && w >= 12.0) {
      // 兄弟分家剖半双窄院：外围共用南北/东西墙 + 中间 1.85m 分家土坯隔墙 + 一瓦一草双屋顶
      AddSideWall("N", true, -hd + wallT / 2, w, gateSide === "N", -hw * 0.45);
      AddSideWall("S", true, hd - wallT / 2, w, gateSide === "S", hw * 0.45);
      AddSideWall("W", false, -hw + wallT / 2, d - wallT * 2, gateSide === "W", 0);
      AddSideWall("E", false, hw - wallT / 2, d - wallT * 2, gateSide === "E", 0);
      Push("SplitWall_Mid", 0, null, 0, 0.38, 1.88, d - wallT * 2, "Whitebox/Step");
      const hD = Math.min(4.4, Math.max(3.5, d * 0.33));
      const hZ = gateSide === "N" ? (hd - wallT - hD / 2 - 0.1) : (-hd + wallT + hD / 2 + 0.1);
      const halfW = hw - wallT - 0.35;
      // 西半院：草顶土坯正房 + 烟囱
      Push("House1_Body", -hw / 2, null, hZ, halfW, 2.38, hD, "Whitebox/Step");
      AddPitchedRoof("House1", -hw / 2, hZ, halfW, hD, 2.56, "thatch");
      Push("Chimney", -hw * 0.22, 2.60, hZ, 0.48, 1.35, 0.48, "Whitebox/Structure");
      // 东半院：青瓦硬山正房（翻盖新顶，体现分家层累感）
      Push("House2_Body", hw / 2, null, hZ, halfW, 2.68, hD, "Whitebox/Plaster");
      AddPitchedRoof("House2", hw / 2, hZ, halfW, hD, 2.86, "tile");
      // 两院院内柴垛与水缸
      Push("Firewood_W", -hw * 0.65, null, hd * 0.25, 1.1, 0.85, 1.8, "Whitebox/Timber");
      Push("WaterVat_E", hw * 0.32, null, hd * 0.18, 0.72, 0.82, 0.72, "Whitebox/EarthDark");
      return;
    }

    AddSideWall("N", true, -hd + wallT / 2, w, gateSide === "N", gateShift);
    AddSideWall("S", true, hd - wallT / 2, w, gateSide === "S", gateShift);
    AddSideWall("W", false, -hw + wallT / 2, d - wallT * 2, gateSide === "W", gateShift);
    AddSideWall("E", false, hw - wallT / 2, d - wallT * 2, gateSide === "E", gateShift);

    // 正房（House1）
    const houseDepth = Math.min(5.2, Math.max(3.6, d * 0.36));
    const houseWidth = Math.max(5.4, w - 1.3);
    const houseZ = gateSide === "N" ? (hd - wallT - houseDepth / 2 - 0.12) : (-hd + wallT + houseDepth / 2 + 0.12);
    const mainBodyMat = (type === "T4" || type === "T5") ? "Whitebox/Plaster" : "Whitebox/Step";
    Push("House1_Body", 0, null, houseZ, houseWidth, mainH, houseDepth, mainBodyMat);
    if (type === "T4" || type === "T5") {
      // 鲁南“里生外熟”粗石防潮勒脚
      Push("House1_Plinth", 0, null, houseZ, houseWidth + 0.14, 0.58, houseDepth + 0.14, "Whitebox/Structure", { solid: false });
    }
    AddPitchedRoof("House1", 0, houseZ, houseWidth, houseDepth, mainH + 0.22, mainRoofStyle);
    if (type === "T2" || type === "T4") {
      Push("Chimney", houseWidth * 0.32, mainH + 0.25, houseZ, 0.52, 1.4, 0.52, "Whitebox/Structure");
    }

    // 厢房 / 偏坡灶屋
    const hasTwoWings = (type === "T4" || type === "T5") && w >= 12.2 && d >= 11.5;
    const hasOneWing = !hasTwoWings && opts.wing !== false && w >= 9.2 && d >= 10.2;
    const wingW = Math.min(3.4, Math.max(2.6, w * 0.26));
    const wingD = Math.max(3.8, d - houseDepth - 2.9);
    const wingZ = gateSide === "N" ? (-hd + wallT + wingD / 2 + 0.45) : (houseZ + houseDepth / 2 + wingD / 2 + 0.35);
    const wingH = Fix(mainH - 0.55);
    if (hasTwoWings) {
      const wxE = hw - wallT - wingW / 2 - 0.12;
      const wxW = -hw + wallT + wingW / 2 + 0.12;
      Push("House2_Body", wxW, null, wingZ, wingW, wingH, wingD, mainBodyMat);
      AddPitchedRoof("House2", wxW, wingZ, wingW, wingD, wingH + 0.18, type === "T5" ? "tile" : "thatch");
      if (gateSide !== "E") {
        Push("House3_Body", wxE, null, wingZ, wingW, wingH, wingD, mainBodyMat);
        AddPitchedRoof("House3", wxE, wingZ, wingW, wingD, wingH + 0.18, "tile");
      }
    } else if (hasOneWing) {
      const wingEast = (hVal % 2 === 0 && gateSide !== "E") || gateSide === "W";
      const wx = wingEast ? (hw - wallT - wingW / 2 - 0.12) : (-hw + wallT + wingW / 2 + 0.12);
      Push("House2_Body", wx, null, wingZ, wingW, wingH, wingD, "Whitebox/Step");
      AddPitchedRoof("House2", wx, wingZ, wingW, wingD, wingH + 0.18, "thatch");
    }

    // 院内人间烟火细节（连茅圈、柴草垛、水缸、避难土洞或院树）
    if (d >= 11.2 && w >= 10.0) {
      const cornerZ = gateSide === "N" ? (-hd + 2.0) : (hd - 2.0);
      const pigX = gateShift > 0 ? (-hw + 2.1) : (hw - 2.1);
      AddPigstyLatrine(pigX, cornerZ);
    }
    if (opts.dugout) {
      AddShelterDugout(0, gateSide === "N" ? -hd * 0.18 : hd * 0.14);
    } else if (hVal % 3 === 0 && d >= 11.2) {
      Push("YardTree", (hVal % 2 === 0 ? -1 : 1) * (hw * 0.22), null, gateSide === "N" ? -hd * 0.22 : hd * 0.16, 0.44, Fix(5.0 + (hVal % 3) * 0.95), 0.44, "Whitebox/Foliage");
    } else {
      Push("Firewood", 0, null, gateSide === "N" ? -hd * 0.28 : hd * 0.26, 1.4, 0.88, 1.8, "Whitebox/Timber");
    }
  };

  // ============================================================================
  // 10) S2 史料规模北沙河村有机院落群（彻底撤除东西超标翼 Exp_W*/Exp_E*！
  //     仅保留紧凑共墙宗族团块 + 村心水坑/菜园/打麦场 + 官道商铺，总计约 82–86 座院落）
  // ============================================================================
  // 10A) 村北西/关帝庙与打麦场周边宗族团块（紧贴错缝，留足西巷 x=84..90 与打麦场 106,540）
  AddLunanCompound("S2_NW_1", "T2", 99.2, 524.8, 11.8, 9.6, { gateSide: "S", yawDeg: -1.2, wing: false });
  AddLunanCompound("S2_NW_2", "T1", 59.8, 526.2, 9.8, 10.6, { gateSide: "N", yawDeg: 2.0 });
  AddLunanCompound("S2_NW_3", "T2", 73.8, 548.8, 12.2, 11.2, { gateSide: "E", yawDeg: -1.5 });
  AddLunanCompound("S2_NW_4", "T3", 104.2, 550.2, 15.8, 9.6, { gateSide: "S", yawDeg: 0.8 });
  AddLunanCompound("S2_NW_5", "T1", 116.4, 550.6, 7.6, 8.8, { gateSide: "S", yawDeg: -1.5 });

  // 10B) 村心南半部（z=610..680）有机宗族组团——打破旧版 3×8=24 方盒网格！
  //      · 西片（x:56..78, x:90..117）：前后错缝退线参差的 T1/T2/T3/T4 宗族蜂窝 + 2 条曲折死胡同 + 村西小菜园留白
  AddLunanCompound("S2_MW_1", "T2", 66.2, 620.2, 13.8, 14.6, { gateSide: "S", yawDeg: 2.0 });
  AddLunanCompound("S2_MW_2", "T1", 67.6, 640.8, 10.2, 9.0, { gateSide: "E", yawDeg: -2.8 }); // 旁留村内菜园 z=648..664
  AddLunanCompound("S2_MW_3", "T2", 69.2, 672.6, 13.6, 12.2, { gateSide: "S", yawDeg: 1.6, dugout: true });

  AddLunanCompound("S2_MCW_1", "T3", 99.8, 622.6, 17.6, 15.0, { gateSide: "S", yawDeg: -1.2 }); // 共墙剖半双窄院
  AddLunanCompound("S2_MCW_2", "T1", 112.8, 619.8, 8.0, 11.8, { gateSide: "S", yawDeg: 2.2 });
  AddLunanCompound("S2_MCW_3", "T4", 97.4, 647.8, 14.4, 13.8, { gateSide: "N", yawDeg: 1.5, dugout: true });
  AddLunanCompound("S2_MCW_4", "T2", 111.4, 651.4, 11.2, 12.4, { gateSide: "W", yawDeg: -2.0 });
  AddLunanCompound("S2_MCW_5", "T3", 102.6, 672.8, 18.2, 12.8, { gateSide: "S", yawDeg: 1.0 });

  //      · 中东片（围绕村心南坑塘 [146, 643] 与斜穿官道 x=170→174→172，严守主街与南中街通道！）
  AddLunanCompound("S2_MCE_1", "T4", 136.4, 621.8, 14.6, 14.4, { gateSide: "S", yawDeg: -1.8 });
  AddLunanCompound("S2_MCE_2", "T2", 150.6, 619.4, 12.8, 13.4, { gateSide: "S", yawDeg: 2.0 });
  AddLunanCompound("S2_MCE_3", "T6", 163.8, 622.4, 11.2, 14.2, { gateSide: "E", yawDeg: 4.5 }); // 官道西侧临街杂货铺
  //        (z=635..655, x=135..157 为村心南坑塘 + 岸边菜园与小场院，彻底打破兵营方格！)
  AddLunanCompound("S2_MCE_4", "T6", 164.4, 649.6, 11.0, 13.4, { gateSide: "E", yawDeg: -2.8 }); // 官道西侧铁匠/修车铺
  AddLunanCompound("S2_MCE_5", "T2", 134.2, 671.4, 13.2, 13.0, { gateSide: "S", yawDeg: 2.2, damaged: true });
  AddLunanCompound("S2_MCE_6", "T4", 149.8, 673.0, 14.0, 12.6, { gateSide: "S", yawDeg: -1.4 });
  AddLunanCompound("S2_MCE_7", "T1", 162.4, 669.8, 10.4, 11.0, { gateSide: "E", yawDeg: 3.0 });

  //      · 官道东侧组团（x:181..213，顺官道大车店 + 东缘散落草屋，不越过 x=216）
  AddLunanCompound("S2_ME_1", "T6", 185.6, 621.6, 13.4, 14.8, { gateSide: "W", yawDeg: -4.0 }); // 官道东侧车马大车店
  AddLunanCompound("S2_ME_2", "T3", 202.4, 623.6, 16.2, 14.4, { gateSide: "S", yawDeg: 2.2 });
  AddLunanCompound("S2_ME_3", "T4", 186.8, 650.8, 13.6, 13.4, { gateSide: "W", yawDeg: 1.8 });
  AddLunanCompound("S2_ME_4", "T2", 201.0, 649.6, 13.8, 12.6, { gateSide: "N", yawDeg: -2.5 });
  AddLunanCompound("S2_ME_5", "T2", 187.2, 669.6, 13.6, 10.6, { gateSide: "N", yawDeg: 1.5, damaged: true });
  AddLunanCompound("S2_ME_6", "T1", 203.6, 670.4, 11.6, 10.2, { gateSide: "N", yawDeg: -3.2 });

  // 10C) 村南救护所/田嫂家两侧有机补密 + 犬牙村咀零散草屋（严守 x=121 出村通道与救护所空地）
  AddLunanCompound("S2_SE_1", "T4", 137.4, 723.2, 13.4, 13.2, { gateSide: "W", yawDeg: 1.2, dugout: true });
  AddLunanCompound("S2_SE_2", "T2", 152.6, 724.4, 13.2, 12.6, { gateSide: "N", yawDeg: -1.6 });
  AddLunanCompound("S2_SE_3", "T2", 137.8, 741.8, 13.2, 12.6, { gateSide: "W", yawDeg: -1.0, damaged: true });
  AddLunanCompound("S2_SE_4", "T1", 153.2, 742.6, 11.6, 11.2, { gateSide: "S", yawDeg: 2.8 });
  AddLunanCompound("S2_SW_1", "T2", 68.2, 723.8, 13.6, 12.8, { gateSide: "E", yawDeg: -1.4 });
  AddLunanCompound("S2_SW_2", "T1", 67.6, 742.4, 11.4, 10.8, { gateSide: "S", yawDeg: 2.4 });
  // 村缘犬牙凹凸小村咀（3 座零散贫户草屋，彻底打破矩形村界）
  AddLunanCompound("S2_Edge_NW", "T1", 54.0, 505.8, 8.6, 9.2, { gateSide: "S", yawDeg: 4.0 });
  AddLunanCompound("S2_Edge_NE", "T1", 205.5, 488.5, 9.2, 8.6, { gateSide: "S", yawDeg: -4.5 });
  AddLunanCompound("S2_Edge_SE", "T1", 211.0, 686.5, 9.6, 9.4, { gateSide: "W", yawDeg: 5.0 });

  // 村心南坑塘 & 村西南取土苇坑水面、岸边歪柳、干苇与坑边避难土洞
  const pondG = "08–13合并/地标/村内坑塘";
  ownObjects.push(
    { id: "Pond_Mid_Water", asset: "Whitebox/Box", material: "Whitebox/Water", pos: [146, -0.78, 643], size: [12.5, 0.52, 9.2], solid: false, group: pondG },
    { id: "Pond_Mid_Willow1", asset: "Whitebox/Box", material: "Whitebox/Foliage", pos: [137.2, null, 639.2], size: [0.46, 6.4, 0.46], group: pondG },
    { id: "Pond_Mid_Willow2", asset: "Whitebox/Box", material: "Whitebox/Foliage", pos: [154.6, null, 646.8], size: [0.44, 5.8, 0.44], group: pondG },
    { id: "Pond_Mid_Dugout", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [144.5, null, 635.2], size: [3.4, 0.85, 2.2], yawDeg: -6, group: pondG },
    { id: "Pond_Mid_DugoutMat", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [144.5, 0.86, 635.2], size: [3.1, 0.10, 2.0], yawDeg: -6, solid: false, group: pondG },
    { id: "Pond_Mid_Reeds1", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [152.2, null, 641.2], size: [2.2, 0.95, 1.4], solid: false, group: pondG },
    { id: "Pond_Mid_Reeds2", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [140.4, null, 647.5], size: [2.4, 0.88, 1.2], solid: false, group: pondG },
    { id: "Pond_SW_Water", asset: "Whitebox/Box", material: "Whitebox/Water", pos: [46, -0.76, 704], size: [11.6, 0.50, 8.6], solid: false, group: pondG },
    { id: "Pond_SW_Willow", asset: "Whitebox/Box", material: "Whitebox/Foliage", pos: [52.2, null, 699.2], size: [0.46, 6.6, 0.46], group: pondG },
    { id: "Pond_SW_Reeds", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [40.2, null, 707.6], size: [2.6, 0.92, 1.5], solid: false, group: pondG },
    // 村内公井与官道拆轨枕木柴垛（人间烟火细节）
    { id: "Village_Well_SouthMid_Curb", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [128.5, null, 643.5], size: [1.3, 0.48, 1.3], group: "08–13合并/地标/村心公井" },
    { id: "Village_Well_SouthMid_P1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [127.9, null, 643.5], size: [0.14, 1.35, 0.14], group: "08–13合并/地标/村心公井" },
    { id: "Village_Well_SouthMid_P2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [129.1, null, 643.5], size: [0.14, 1.35, 0.14], group: "08–13合并/地标/村心公井" },
    { id: "Village_Well_SouthMid_Axle", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [128.5, 1.22, 643.5], size: [1.35, 0.14, 0.14], group: "08–13合并/地标/村心公井" },
    { id: "Village_SleeperStack_1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [168.5, null, 610.5], size: [1.1, 0.82, 2.4], yawDeg: 4, group: "08–13合并/村街烟火" },
    { id: "Village_SleeperStack_2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [179.2, null, 634.5], size: [1.1, 0.76, 2.4], yawDeg: -5, group: "08–13合并/村街烟火" },
    { id: "Village_SleeperStack_3", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [127.6, null, 681.5], size: [2.4, 0.78, 1.05], yawDeg: 2, group: "08–13合并/村街烟火" },
    { id: "Village_GardenFence_W1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [65.5, null, 654.2], size: [11.5, 0.92, 0.20], yawDeg: 2, group: "08–13合并/村街烟火" },
    { id: "Village_GardenFence_W2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [59.8, null, 658.4], size: [0.20, 0.92, 8.2], yawDeg: 2, group: "08–13合并/村街烟火" },
    { id: "Village_ThreshRoller_S", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [131.5, null, 654.5], size: [1.35, 0.68, 0.72], yawDeg: 28, group: "08–13合并/村街烟火" },
  );

  // 环村自然老榆/旱柳树环（明恩溥记“山东村落远看一团树裹着土屋”）
  for (const [idx, x, z, h] of [
    [1, 48.5, 502, 7.2], [2, 46.5, 528, 6.6], [3, 50.0, 560, 7.4], [4, 49.5, 600, 6.8],
    [5, 52.5, 646, 7.0], [6, 54.0, 686, 6.4], [7, 51.0, 738, 7.3],
    [8, 217.5, 506, 6.9], [9, 218.5, 544, 7.4], [10, 219.0, 594, 6.8], [11, 218.5, 638, 7.1],
    [12, 217.0, 676, 6.5], [13, 210.0, 718, 7.2], [14, 174.0, 742, 6.6],
  ]) {
    ownObjects.push({
      id: `Village_EdgeTree_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
      pos: [x, null, z], size: [0.46, h, 0.46], group: "08–13合并/地标/环村树带",
    });
  }

  // ============================================================================
  // 11) 1938 年 3 月 14 日小队可穿越农田 F1–F8 真实历史构筑（严禁七八月看青草棚！）
  // ============================================================================
  // F1: 浇地井群（辘轳井 / 4.8m 桔槔浅井 + 砖土稳水池）
  const AddFieldWell = (id, x, z, style = "windlass", yawDeg = 0) => {
    const g = "08–13合并/田野/浇地井";
    const rad = yawDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const Pt = (lx, lz) => [Fix(x + lx * cos + lz * sin), Fix(z - lx * sin + lz * cos)];
    const WPush = (suf, lx, y, lz, sw, sh, sd, mat, extra = {}) => {
      const [wx, wz] = Pt(lx, lz);
      ownObjects.push({
        id: `Merged_Well_${id}_${suf}`, asset: "Whitebox/Box", material: mat,
        pos: [wx, y === null ? null : Fix(y), wz], size: [Fix(sw), Fix(sh), Fix(sd)],
        ...(yawDeg ? { yawDeg } : {}), group: g, ...extra,
      });
    };
    const gy = HeightAtOwn(x, z);
    // 青石井栏 + 暗水口 + 踏石 + 稳水池（双人硬掩体！）
    WPush("Curb", 0, null, 0, 1.35, 0.48, 1.35, "Whitebox/Structure");
    WPush("Hole", 0, gy + 0.44, 0, 0.78, 0.08, 0.78, "Whitebox/Void", { solid: false });
    WPush("Basin", 1.55, null, 0, 1.65, 0.56, 1.45, "Whitebox/Step");
    WPush("BasinWater", 1.55, gy + 0.46, 0, 1.25, 0.12, 1.05, "Whitebox/Water", { solid: false });
    if (style === "shadoof") {
      // 鲁南浅井“桔槔”长杠杆（3.2m 木叉立柱 + 阶梯斜杆 + 尾端青石配重）
      WPush("Fulcrum", -1.45, null, 0, 0.24, 3.25, 0.24, "Whitebox/Timber");
      WPush("Brace", -1.75, null, 0, 0.18, 1.75, 0.18, "Whitebox/Timber");
      for (let i = 0; i < 4; i++) {
        WPush(`Lever_${i + 1}`, -2.8 + i * 1.15, gy + 2.35 + i * 0.48, 0, 1.35, 0.14, 0.14, "Whitebox/Timber", { solid: false });
      }
      WPush("CounterWeight", -3.35, null, 0, 0.58, 0.52, 0.52, "Whitebox/Structure");
      WPush("Bucket", 0, gy + 0.50, 0.15, 0.36, 0.44, 0.36, "Whitebox/Timber");
    } else {
      // 辘轳架
      WPush("PostW", -0.62, null, 0, 0.15, 1.42, 0.15, "Whitebox/Timber");
      WPush("PostE", 0.62, null, 0, 0.15, 1.42, 0.15, "Whitebox/Timber");
      WPush("Axle", 0, gy + 1.28, 0, 1.45, 0.16, 0.16, "Whitebox/Timber", { solid: false });
    }
  };
  for (const [id, x, z, style, yaw] of [
    ["ChurchGarden", 26.5, 764.2, "shadoof", 12],
    ["WestDitch", -14.8, 548.5, "shadoof", -8],
    ["WestGarden", 34.5, 578.0, "windlass", 6],
    ["NorthWest", 74.0, 440.0, "windlass", -14],
    ["NorthEast", 172.0, 434.0, "windlass", 10],
    ["EastGarden", 232.0, 522.0, "shadoof", -16],
    ["SouthHamlet", 18.0, 936.0, "windlass", 18],
  ]) AddFieldWell(id, x, z, style, yaw);

  // F2: 宗族坟林（“某家林”：矮土围堰 + 4–6 座风化坟包 + 青石碑供案 + 常绿松柏群）+ 散落孤坟
  const AddFamilyGrove = (id, cx, cz, w, d, yawDeg = 0) => {
    const g = `08–13合并/田野/坟林_${id}`;
    const hVal = HashStr(id);
    const rad = yawDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const Pt = (lx, lz) => [Fix(cx + lx * cos + lz * sin), Fix(cz - lx * sin + lz * cos)];
    const GPush = (suf, lx, y, lz, sw, sh, sd, mat, extra = {}) => {
      const [wx, wz] = Pt(lx, lz);
      ownObjects.push({
        id: `Merged_Grove_${id}_${suf}`, asset: "Whitebox/Box", material: mat,
        pos: [wx, y === null ? null : Fix(y), wz], size: [Fix(sw), Fix(sh), Fix(sd)],
        ...(yawDeg ? { yawDeg } : {}), group: g, ...extra,
      });
    };
    const hw = w / 2, hd = d / 2;
    // 外围 0.78m 夯土防牛围堰（南留 2.6m 入口）
    GPush("BermN", 0, null, -hd + 0.35, w, 0.78, 0.70, "Whitebox/EarthDark");
    GPush("BermW", -hw + 0.35, null, 0, 0.70, 0.78, d - 1.2, "Whitebox/EarthDark");
    GPush("BermE", hw - 0.35, null, 0, 0.70, 0.78, d - 1.2, "Whitebox/EarthDark");
    GPush("BermS1", -hw * 0.56, null, hd - 0.35, w * 0.38, 0.76, 0.70, "Whitebox/EarthDark");
    GPush("BermS2", hw * 0.56, null, hd - 0.35, w * 0.38, 0.76, 0.70, "Whitebox/EarthDark");
    // 内排主坟 + 副坟（阶梯圆锥状风化坟丘）
    const mounds = [
      [0, -hd * 0.36, 4.2, 1.55],
      [-hw * 0.44, -hd * 0.10, 3.2, 1.20],
      [hw * 0.44, -hd * 0.08, 3.1, 1.15],
      [-hw * 0.28, hd * 0.24, 2.8, 0.98],
      [hw * 0.30, hd * 0.22, 2.9, 1.02],
    ];
    mounds.forEach(([mx, mz, md, mh], i) => {
      GPush(`Mound${i + 1}_B`, mx, null, mz, md, Fix(mh * 0.56), Fix(md * 0.92), "Whitebox/EarthDark");
      GPush(`Mound${i + 1}_T`, mx, null, mz, Fix(md * 0.58), mh, Fix(md * 0.54), "Whitebox/EarthDark");
    });
    // 主坟前青石墓碑与供案
    GPush("Stele", 0, null, -hd * 0.05, 0.68, 1.62, 0.20, "Whitebox/Structure");
    GPush("Altar", 0, null, hd * 0.06, 1.35, 0.58, 0.62, "Whitebox/Structure");
    // 5 株苍老常绿松柏
    const trees = [
      [-hw * 0.68, -hd * 0.62, 7.4], [hw * 0.66, -hd * 0.58, 6.8],
      [-hw * 0.70, hd * 0.42, 6.2], [hw * 0.68, hd * 0.46, 7.1],
      [(hVal % 2 === 0 ? -1 : 1) * hw * 0.22, -hd * 0.68, 7.8],
    ];
    trees.forEach(([tx, tz, th], i) => {
      GPush(`Cypress${i + 1}`, tx, null, tz, 0.52, th, 0.52, "Whitebox/Foliage");
    });
  };
  AddFamilyGrove("BridgeWest", -124, 782, 19, 22, 12); // 桥西坟林（夕阳剪影）
  AddFamilyGrove("GengWest", -38, 622, 18, 20, -10);   // 耿家西林（西田硬据点）
  AddFamilyGrove("NorthWest", -28, 424, 16, 18, 8);    // 北西宗族林
  AddFamilyGrove("WangEast", 278, 526, 18, 20, -14);   // 王家东林（东田硬据点）

  // 散落田心孤坟（Merged_Mound_*）
  const AddBurialMound = (id, x, z, withTree = true) => {
    ownObjects.push(
      {
        id: `Merged_Mound_${id}_Base`, asset: "Whitebox/Box", material: "Whitebox/EarthDark",
        pos: [x, null, z], size: [3.8, 0.78, 3.5], yawDeg: (id * 23) % 45, group: "08–13合并/田野/坟头",
      },
      {
        id: `Merged_Mound_${id}_Top`, asset: "Whitebox/Box", material: "Whitebox/EarthDark",
        pos: [x, null, z], size: [2.2, 1.32, 2.0], yawDeg: (id * 23) % 45, group: "08–13合并/田野/坟头",
      },
    );
    if (withTree) {
      ownObjects.push({
        id: `Merged_Mound_${id}_Tree`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
        pos: [Fix(x + 2.2), null, Fix(z - 1.1)], size: [0.42, Fix(5.2 + (id % 3) * 1.1), 0.42], group: "08–13合并/田野/坟头",
      });
    }
  };
  for (const [idx, x, z, tree] of [
    [1, 68, 396, true], [2, 164, 384, true], [3, 196, 440, true], [4, 18, 444, true],
    [5, -52, 514, true], [6, 18, 614, false], [7, -56, 676, true], [8, 294, 488, true],
    [9, 292, 616, true], [10, -116, 560, true], [11, -112, 954, true], [12, 58, 944, true],
  ]) AddBurialMound(idx, x, z, tree);

  // F3: 鲁南“馒头砖窑 / 土窑”与晾坯场（穿田高价值立体战术据点！）
  const AddBrickKiln = (id, cx, cz, yawDeg = 0) => {
    const g = `08–13合并/田野/砖窑_${id}`;
    const rad = yawDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const Pt = (lx, lz) => [Fix(cx + lx * cos + lz * sin), Fix(cz - lx * sin + lz * cos)];
    const KPush = (suf, lx, y, lz, sw, sh, sd, mat, extra = {}) => {
      const [wx, wz] = Pt(lx, lz);
      ownObjects.push({
        id: `Merged_Kiln_${id}_${suf}`, asset: "Whitebox/Box", material: mat,
        pos: [wx, y === null ? null : Fix(y), wz], size: [Fix(sw), Fix(sh), Fix(sd)],
        ...(yawDeg ? { yawDeg } : {}), group: g, ...extra,
      });
    };
    const gy = HeightAtOwn(cx, cz);
    // 半球截顶阶梯馒头窑体（底 5.2m → 高 3.85m + 窑顶烟孔）
    KPush("Dome1", 0, null, 0, 5.2, 1.55, 5.2, "Whitebox/Step");
    KPush("Dome2", 0, gy + 1.50, 0, 4.1, 1.15, 4.1, "Whitebox/EarthDark");
    KPush("Dome3", 0, gy + 2.60, 0, 2.7, 0.85, 2.7, "Whitebox/EarthDark");
    KPush("Chimney", 0, gy + 3.40, 0, 1.35, 0.55, 1.35, "Whitebox/Structure");
    // 朝南拱形窑门洞与烧火灶坑侧护墙
    KPush("MouthFrame", 0, null, 2.62, 1.65, 1.85, 0.55, "Whitebox/Structure");
    KPush("MouthVoid", 0, null, 2.86, 1.05, 1.52, 0.22, "Whitebox/Void", { solid: false });
    KPush("FireWallW", -1.45, null, 3.8, 0.42, 0.95, 2.2, "Whitebox/Step");
    KPush("FireWallE", 1.45, null, 3.8, 0.42, 0.95, 2.2, "Whitebox/Step");
    // 3 排晾砖坯垛（1.25m 高硬掩体 + 防雨麦秸顶）
    for (const [si, sx, sz] of [[1, 5.2, -1.6], [2, 5.2, 1.4], [3, -5.2, 0.4]]) {
      KPush(`BrickStack${si}`, sx, null, sz, 3.2, 1.25, 1.15, "Whitebox/Structure");
      KPush(`BrickCap${si}`, sx, gy + 1.25, sz, 3.35, 0.16, 1.28, "Whitebox/Canvas", { solid: false });
    }
    KPush("AshHeap", -2.8, null, 3.8, 1.9, 0.55, 1.6, "Whitebox/EarthDark");
  };
  // 东田砖窑（位于 z=560 遮挡 [256,573] 敌军生成，严格让开 z=570..576 东侧包路线！）
  AddBrickKiln("East", 246, 558, -10);
  // 北岸西田砖窑（李子行西北，靠近西排水干沟）
  AddBrickKiln("NorthBank", -48, 740, 14);

  // F4: 封门小荒庙（明恩溥记山东远村小庙以砖土砌封门洞防匪）
  const AddFieldShrine = (id, x, z, yawDeg = 0) => {
    const g = "08–13合并/田野/封门小荒庙";
    const gy = HeightAtOwn(x, z);
    ownObjects.push(
      { id: `Merged_FieldShrine_${id}_Base`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [x, null, z], size: [2.8, 0.36, 2.6], yawDeg, group: g },
      { id: `Merged_FieldShrine_${id}_Body`, asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [x, gy + 0.34, z], size: [2.5, 1.85, 2.3], yawDeg, group: g },
      { id: `Merged_FieldShrine_${id}_BrickSeal`, asset: "Whitebox/Box", material: "Whitebox/Step", pos: [x, gy + 0.34, Fix(z + 1.16)], size: [1.05, 1.35, 0.18], yawDeg, group: g },
      { id: `Merged_FieldShrine_${id}_Roof`, asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [x, gy + 2.18, z], size: [2.95, 0.32, 2.75], yawDeg, group: g },
      { id: `Merged_FieldShrine_${id}_Ridge`, asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [x, gy + 2.48, z], size: [2.75, 0.42, 1.25], yawDeg, group: g },
      { id: `Merged_FieldShrine_${id}_Tree`, asset: "Whitebox/Box", material: "Whitebox/Foliage", pos: [Fix(x + 2.5), null, Fix(z - 1.2)], size: [0.42, 6.2, 0.42], group: g },
    );
  };
  AddFieldShrine("West", -36, 686, 12);
  AddFieldShrine("East", 262, 660, -16);

  // F5: 过水干沟青石板小桥（铺设于 G4 干沟与田间小径交点，保障担架与小队顺畅跨沟）
  const AddDitchBridge = (id, x, z, yawDeg = 0) => {
    const g = "08–13合并/田野/青石板小桥";
    const bankY = Math.max(HeightAtOwn(x - 2.2, z), HeightAtOwn(x + 2.2, z), 0.05);
    ownObjects.push(
      { id: `Merged_DitchBridge_${id}_Slab`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [x, Fix(bankY - 0.16), z], size: [3.2, 0.22, 1.75], yawDeg, standOn: true, group: g },
      { id: `Merged_DitchBridge_${id}_AbutL`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [Fix(x - 1.35), Fix(bankY - 0.95), z], size: [0.55, 0.85, 1.9], yawDeg, group: g },
      { id: `Merged_DitchBridge_${id}_AbutR`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [Fix(x + 1.35), Fix(bankY - 0.95), z], size: [0.55, 0.85, 1.9], yawDeg, group: g },
    );
  };
  AddDitchBridge("WestMid", -10.0, 546.0, 4);
  AddDitchBridge("WestSouth", -16.8, 668.0, 14);
  AddDitchBridge("NorthBank", 26.0, 768.0, 68);
  AddDitchBridge("EastMid", 256.5, 628.0, -6);

  // F6: 残余越冬麦秸垛（3 月中旬被取烧半边的塌斜残半垛 + 矮荆笆，彻底替换 4 座错放看青草棚！）
  const AddStrawRick = (id, x, z, scale = 1, yawDeg = 0) => {
    const g = "08–13合并/田野/麦秸垛";
    const gy = HeightAtOwn(x, z);
    ownObjects.push(
      { id: `Merged_Rick_${id}_Base`, asset: "Whitebox/Box", material: "Whitebox/Step", pos: [x, null, z], size: [Fix(3.1 * scale), 0.28, Fix(2.9 * scale)], yawDeg, group: g },
      // 后半高垛 + 前半掏低台阶，呈现三月中旬取烧过半的真实“残半垛”
      { id: `Merged_Rick_${id}_Back`, asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [x, null, Fix(z - 0.35 * scale)], size: [Fix(2.6 * scale), Fix(1.95 * scale), Fix(1.75 * scale)], yawDeg, group: g },
      { id: `Merged_Rick_${id}_Scoop`, asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [Fix(x + 0.15 * scale), null, Fix(z + 0.65 * scale)], size: [Fix(2.1 * scale), Fix(1.15 * scale), Fix(1.1 * scale)], yawDeg, group: g },
      { id: `Merged_Rick_${id}_Cap`, asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [x, Fix(gy + 1.92 * scale), Fix(z - 0.40 * scale)], size: [Fix(1.8 * scale), Fix(0.55 * scale), Fix(1.25 * scale)], yawDeg, group: g },
    );
  };
  for (const [idx, x, z, sc, yaw] of [
    [1, 36, 514, 1.05, 8], [2, 40, 520, 0.82, -12], [3, 30, 594, 1.0, 15], [4, 24, 656, 0.95, -6],
    [5, -24, 536, 0.92, 22], [6, -42, 468, 1.0, -14], [7, 62, 434, 0.88, 5], [8, 166, 424, 1.08, -10],
    [9, 232, 502, 0.96, 12], [10, 236, 616, 1.02, -18], [11, 228, 694, 0.90, 9], [12, -22, 722, 0.92, 16],
  ]) AddStrawRick(idx, x, z, sc, yaw);

  // F7: 三月春耕土粪堆（成排低矮掩体跳点）& 逃难中断春耕的弃犁/独轮车
  const AddManureRow = (id, x, z, count, dx, dz) => {
    const g = "08–13合并/田野/春耕土粪堆";
    for (let i = 0; i < count; i++) {
      const mx = Fix(x + i * dx), mz = Fix(z + i * dz);
      ownObjects.push(
        { id: `Merged_Manure_${id}_${i + 1}B`, asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [mx, null, mz], size: [1.95, 0.52, 1.85], yawDeg: (i * 19) % 45, group: g },
        { id: `Merged_Manure_${id}_${i + 1}T`, asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [mx, null, mz], size: [1.15, 0.88, 1.10], yawDeg: (i * 19) % 45, group: g },
      );
    }
  };
  AddManureRow(1, 14, 418, 4, 8.5, 1.5);
  AddManureRow(2, 154, 412, 3, 9.0, -2.0);
  AddManureRow(3, -38, 562, 4, 8.0, 2.2);
  AddManureRow(4, 10, 628, 3, 8.2, -1.8);
  AddManureRow(5, 256, 594, 3, 9.5, 2.4);
  AddManureRow(6, 266, 688, 3, 8.8, -2.2);
  AddManureRow(7, -36, 770, 3, -8.0, 2.0); // 北岸西麦田粪堆（避开李子行与主路）
  AddManureRow(8, 22, 742, 3, 7.5, 1.2);
  AddManureRow(9, 16, 916, 3, 9.0, 1.8);

  // 停摆春耕的木犁 / 装土独轮车（4 处）
  for (const [id, x, z, yaw] of [
    [1, 22, 566, 24], [2, 178, 444, -32], [3, 252, 608, 18], [4, -18, 718, -22],
  ]) {
    const g = "08–13合并/田野/弃置春耕农具";
    ownObjects.push(
      { id: `Merged_Plow_${id}_Frame`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [x, null, z], size: [1.85, 0.62, 0.72], yawDeg: yaw, group: g },
      { id: `Merged_Plow_${id}_Wheel`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [Fix(x + 0.5), null, Fix(z + 0.2)], size: [0.16, 0.85, 0.85], yawDeg: yaw, group: g },
    );
  }

  // F8: 护地干砌青石堰（0.72m 矮石墙硬掩体，衔接农田与战场）
  for (const [id, x, z, len, yaw] of [
    [1, 34, 466, 8.5, 8], [2, 162, 460, 7.8, -12], [3, 18, 694, 8.0, -8],
    [4, 240, 646, 7.4, 82], [5, -24, 782, 6.8, -14], [6, 12, 800, 7.2, -16],
  ]) {
    ownObjects.push({
      id: `Merged_StoneWall_${id}`, asset: "Whitebox/Box", material: "Whitebox/Structure",
      pos: [x, null, z], size: [len, 0.74, 0.52], yawDeg: yaw, group: "08–13合并/田野/干砌青石堰",
    });
  }

  // 矮荆笆（村周菜园护篱，非直线队列）
  for (const [id, x, z, len, yaw] of [
    [1, 42, 558, 7.5, 84], [2, 42, 616, 8.0, 96], [3, 224, 536, 7.2, 88],
    [4, 34, 758, 8.5, 10], [5, 152, 462, 7.6, -8],
  ]) {
    ownObjects.push({
      id: `Merged_Fence_${id}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [x, null, z], size: [len, 0.92, 0.22], yawDeg: yaw, group: "08–13合并/田野/菜园篱笆",
    });
  }

  // 散落田野地头枯榆与沟边旱柳（零星自然成簇，绝非机械等距队列！）
  for (const [idx, x, z, h] of [
    [1, 8, 376, 6.4], [2, -4, 424, 5.8], [3, 20, 474, 7.0], [4, -14, 518, 6.2],
    [5, -8, 568, 6.9], [6, -15, 642, 6.1], [7, -26, 708, 6.5], [8, -46, 586, 5.9],
    [9, -56, 444, 6.4], [10, 152, 374, 6.5], [11, 160, 426, 5.9], [12, 214, 386, 7.0],
    [13, 226, 446, 6.3], [14, 240, 494, 6.0], [15, 250, 540, 6.8], [16, 260, 616, 6.2],
    [17, 252, 692, 6.7], [18, 294, 558, 6.4], [19, -112, 440, 6.4], [20, -108, 632, 6.9],
    [21, -138, 704, 6.1], [22, 44, 912, 7.1], [23, 126, 908, 6.3], [24, 18, 960, 6.5],
  ]) {
    ownObjects.push({
      id: `Merged_FieldTree_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
      pos: [x, null, z], size: [0.45, h, 0.45], group: "08–13合并/田野/地头树",
    });
  }

  // ============================================================================
  // 12) 津浦铁路北沙河桥「桥圈六区」（x ∈ [-160, 20], z ∈ [740, 990]）
  // ============================================================================
  // --- 一区：四孔钢梁桥工程细部 + 修正西接起爆线（修 Bug A） + 写实双态爆破 ---
  const brG = "08–13合并/桥圈/一区_桥体与爆破";
  // 1A) 南北石砌八字翼墙、压顶石、干砌石锥体护坡、东侧检修石阶
  ownObjects.push(
    // 北桥台八字翼墙 & 压顶石
    { id: "RailAbutN_Cap", asset: "Whitebox/Box", material: "Whitebox/Coping", pos: [-80, 2.40, 828.8], size: [6.4, 0.22, 2.25], group: brG },
    { id: "RailAbutN_WingW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-84.6, -2.5, 826.5], size: [5.4, 4.9, 1.15], yawDeg: 40, group: brG },
    { id: "RailAbutN_WingE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-75.4, -2.5, 826.5], size: [5.4, 4.9, 1.15], yawDeg: -40, group: brG },
    { id: "RailAbutN_ConeW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-85.2, -2.7, 830.6], size: [4.2, 2.4, 3.6], yawDeg: 22, group: brG },
    { id: "RailAbutN_ConeE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-74.8, -2.7, 830.6], size: [4.2, 2.4, 3.6], yawDeg: -22, group: brG },
    { id: "RailAbutN_Step1", asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-74.8, -0.3, 829.8], size: [1.1, 0.5, 1.2], group: brG },
    { id: "RailAbutN_Step2", asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-74.5, -1.2, 831.2], size: [1.1, 0.9, 1.3], group: brG },
    // 南桥台八字翼墙 & 压顶石 & 锥体护坡
    { id: "RailAbutS_Cap", asset: "Whitebox/Box", material: "Whitebox/Coping", pos: [-80, 2.40, 871.2], size: [6.4, 0.22, 2.25], group: brG },
    { id: "RailAbutS_WingW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-84.6, -2.5, 873.5], size: [5.4, 4.9, 1.15], yawDeg: -40, group: brG },
    { id: "RailAbutS_WingE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-75.4, -2.5, 873.5], size: [5.4, 4.9, 1.15], yawDeg: 40, group: brG },
    { id: "RailAbutS_ConeW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-85.2, -2.7, 869.4], size: [4.2, 2.4, 3.6], yawDeg: -22, group: brG },
    { id: "RailAbutS_ConeE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-74.8, -2.7, 869.4], size: [4.2, 2.4, 3.6], yawDeg: 22, group: brG },
  );
  // 1B) 三座石桥墩：压顶石 + 上游东侧三角形分水尖 + 墩底抛石护坦 + 汛期水渍带
  for (const [idx, pz] of [[1, 839], [2, 850], [3, 861]]) {
    ownObjects.push(
      { id: `RailPier_${idx}_Cap`, asset: "Whitebox/Box", material: "Whitebox/Coping", pos: [-80, 1.18, pz], size: [3.35, 0.22, 2.15], ...(idx === 1 ? { hideOn: "BridgeBlown" } : {}), group: brG },
      { id: `RailPier_${idx}_Cutwater`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-78.2, -2.7, pz], size: [1.35, 3.75, 1.35], yawDeg: 45, group: brG },
      { id: `RailPier_${idx}_CutwaterTip`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-77.55, -2.7, pz], size: [0.68, 3.10, 0.68], yawDeg: 45, group: brG },
      { id: `RailPier_${idx}_Apron`, asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-79.6, -2.75, pz], size: [5.4, 0.62, 3.8], yawDeg: 6, group: brG },
      { id: `RailPier_${idx}_WaterStain`, asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [-80, -2.25, pz], size: [3.08, 0.72, 1.88], solid: false, group: brG },
    );
  }
  // 1C) 钢梁细部（竖向加劲肋、底横联、护轨、中墩两侧避车台；严守无全桥护栏！）
  for (const [si, zMid, isNorthTwo] of [[1, 833.5, true], [2, 844.5, true], [3, 855.5, false], [4, 866.5, false]]) {
    const hideProp = isNorthTwo ? { hideOn: "BridgeBlown" } : {};
    for (const off of [-3.6, 0, 3.6]) {
      ownObjects.push(
        { id: `RailStiff_S${si}W_${off}`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-81.45, 1.22, Fix(zMid + off)], size: [0.14, 1.16, 0.16], solid: false, ...hideProp, group: brG },
        { id: `RailStiff_S${si}E_${off}`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-78.55, 1.22, Fix(zMid + off)], size: [0.14, 1.16, 0.16], solid: false, ...hideProp, group: brG },
        { id: `RailCross_S${si}_${off}`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-80.0, 1.32, Fix(zMid + off)], size: [2.2, 0.18, 0.18], solid: false, ...hideProp, group: brG },
      );
    }
    // 轨内护轨与外缘护木
    ownObjects.push(
      { id: `RailGuard_S${si}W`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-80.42, 2.54, zMid], size: [0.06, 0.12, 10.9], solid: false, ...hideProp, group: brG },
      { id: `RailGuard_S${si}E`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-79.58, 2.54, zMid], size: [0.06, 0.12, 10.9], solid: false, ...hideProp, group: brG },
    );
  }
  // 中墩避车台（[-82.4, 850] 与 [-77.6, 850]）
  for (const [side, rx, railX] of [["W", -82.35, -83.10], ["E", -77.65, -76.90]]) {
    ownObjects.push(
      { id: `RailRefuge_${side}_Deck`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [rx, 2.40, 850], size: [1.55, 0.16, 1.60], standOn: true, group: brG },
      { id: `RailRefuge_${side}_Bracket`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [rx, 1.85, 850], size: [1.45, 0.55, 1.40], solid: false, group: brG },
      { id: `RailRefuge_${side}_Post1`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [railX, 2.56, 849.25], size: [0.08, 1.05, 0.08], solid: false, group: brG },
      { id: `RailRefuge_${side}_Post2`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [railX, 2.56, 850.75], size: [0.08, 1.05, 0.08], solid: false, group: brG },
      { id: `RailRefuge_${side}_Rail`, asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [railX, 3.55, 850], size: [0.08, 0.08, 1.60], solid: false, group: brG },
    );
  }
  // 1D) 桥头行车标识（津浦 561 粁里程碑 + 限速桥牌）
  ownObjects.push(
    { id: "RailMilestone_561", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-83.5, null, 824.0], size: [0.46, 1.12, 0.24], group: brG },
    { id: "RailMilestone_561Cap", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-83.5, Fix(HeightAtOwn(-83.5, 824.0) + 1.12), 824.0], size: [0.50, 0.10, 0.28], solid: false, group: brG },
    { id: "RailBridgeSign_Post", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-77.0, null, 826.5], size: [0.14, 2.15, 0.14], group: brG },
    { id: "RailBridgeSign_Board", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-77.0, Fix(HeightAtOwn(-77.0, 826.5) + 1.78), 826.5], size: [0.72, 0.44, 0.08], solid: false, group: brG },
  );
  // 1E) 爆破准备态（showOn: ChargesSet, hideOn: BridgeBlown）— 修正 Bug A：火线改沿西钢梁连向西侧工兵与起爆箱！
  ownObjects.push(
    // 墩 1 / 墩 2 炸药木箱 + 压包沙袋 + 施工竹木梯
    { id: "RailCharge_1", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-81.4, 0.85, 839.0], size: [0.56, 0.36, 0.52], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailCharge_1E", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-78.5, 0.85, 839.0], size: [0.52, 0.34, 0.48], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailCharge_1Tamp", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-81.6, 0.72, 839.0], size: [0.42, 0.58, 0.88], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailCharge_2", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-81.4, 0.85, 850.0], size: [0.56, 0.36, 0.52], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailCharge_2E", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-78.5, 0.85, 850.0], size: [0.52, 0.34, 0.48], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailCharge_2Tamp", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-81.6, 0.72, 850.0], size: [0.42, 0.58, 0.88], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    // 工兵刚绑完药斜靠在 1 号墩东侧的施工梯（分阶构成斜梯）
    { id: "RailSapperLadder_1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-77.3, -2.4, 839.0], size: [0.18, 1.35, 0.62], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailSapperLadder_2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-77.8, -1.1, 839.0], size: [0.18, 1.35, 0.62], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    { id: "RailSapperLadder_3", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-78.3, 0.2, 839.0], size: [0.18, 1.25, 0.62], showOn: "ChargesSet", hideOn: "BridgeBlown", solid: false, group: brG },
    // 修正后的西接起爆火线（沿西侧钢梁 x=-81.42 → 西翼墙 [-81.5,872] → 工兵 [-83.5,875] → 起爆箱 [-87.2,880.6]）
    { id: "RailFuse_Bridge", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-81.42, 1.35, 855.5], size: [0.06, 0.05, 33.2], solid: false, showOn: "ChargesSet", hideOn: "BridgeBlown", group: brG },
    { id: "RailFuse_Bank", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-82.5, Fix(HeightAtOwn(-82.5, 873.5) + 0.14), 873.5], size: [3.65, 0.05, 0.06], yawDeg: 56.3, solid: false, showOn: "ChargesSet", hideOn: "BridgeBlown", group: brG },
    { id: "RailFuse_Bank_West", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-85.35, Fix(HeightAtOwn(-85.35, 877.8) + 0.12), 877.8], size: [6.75, 0.05, 0.06], yawDeg: 56.5, solid: false, showOn: "ChargesSet", hideOn: "BridgeBlown", group: brG },
  );
  // 1F) 炸毁垮塌态（showOn: BridgeBlown）— 折断阶梯斜插沙洲与浅水 + 炸塌墩顶碎石堆 + 焦黑弹痕
  ownObjects.push(
    { id: "FallenGirder_S1W", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-82.2, -1.65, 831.4], size: [1.15, 0.62, 5.4], yawDeg: -14, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S1W_Low", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-82.9, -2.42, 836.2], size: [1.15, 0.58, 5.2], yawDeg: -18, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S1E", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-78.2, -1.55, 831.8], size: [1.15, 0.62, 5.4], yawDeg: 9, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S1E_Low", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-77.4, -2.38, 836.6], size: [1.15, 0.58, 5.2], yawDeg: 14, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S2W", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-81.6, -2.35, 842.2], size: [1.15, 0.60, 5.4], yawDeg: -8, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S2W_High", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-81.1, -1.45, 847.2], size: [1.15, 0.60, 5.0], yawDeg: -4, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S2E", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-77.5, -2.28, 842.6], size: [1.15, 0.60, 5.4], yawDeg: 16, showOn: "BridgeBlown", group: brG },
    { id: "FallenGirder_S2E_High", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-78.3, -1.35, 847.4], size: [1.15, 0.60, 5.0], yawDeg: 11, showOn: "BridgeBlown", group: brG },
    { id: "BlownPier1_Rubble1", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-81.8, -2.55, 839.2], size: [2.6, 0.95, 2.2], yawDeg: 18, showOn: "BridgeBlown", group: brG },
    { id: "BlownPier1_Rubble2", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [-78.2, -2.50, 838.6], size: [2.2, 0.85, 2.0], yawDeg: -24, showOn: "BridgeBlown", group: brG },
    { id: "BlownPier2_Rubble", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-80.4, -2.55, 849.6], size: [2.8, 0.92, 2.4], yawDeg: -12, showOn: "BridgeBlown", group: brG },
  );

  // --- 二区：桥北西翼——德式砖石巡道房小院（替换 Bug B 假墙！）+ 臂板信号机 + 护堤枯柳 ---
  const z2G = "08–13合并/桥圈/二区_德式巡道房与信号机";
  const secY = HeightAtOwn(-96, 808);
  ownObjects.push(
    // 主屋（x:-101.5..-90.5, z:803.5..809.5；毛石基脚 + 砖墙 + 三阶陡坡德式瓦顶 + 拱券暗窗 + 砖烟囱）
    { id: "RailSec_Plinth", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-96.0, null, 806.5], size: [11.2, 0.85, 6.2], group: z2G },
    { id: "RailSec_Body", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-96.0, Fix(secY + 0.82), 806.5], size: [10.9, 2.58, 5.9], group: z2G },
    { id: "RailSec_Roof1", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [-96.0, Fix(secY + 3.38), 806.5], size: [11.7, 0.45, 6.7], group: z2G },
    { id: "RailSec_Roof2", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [-96.0, Fix(secY + 3.80), 806.5], size: [11.4, 0.58, 4.4], group: z2G },
    { id: "RailSec_Roof3", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [-96.0, Fix(secY + 4.35), 806.5], size: [11.2, 0.46, 2.0], group: z2G },
    { id: "RailSec_Crest", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-96.0, Fix(secY + 4.78), 806.5], size: [11.3, 0.22, 0.38], group: z2G },
    { id: "RailSec_Chimney", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-92.4, Fix(secY + 3.45), 805.2], size: [0.68, 2.15, 0.68], group: z2G },
    // 德式拱券小窗与门洞暗面
    { id: "RailSec_WinS1", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-99.0, Fix(secY + 1.35), 809.52], size: [0.95, 1.35, 0.14], solid: false, group: z2G },
    { id: "RailSec_WinS2", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-93.0, Fix(secY + 1.35), 809.52], size: [0.95, 1.35, 0.14], solid: false, group: z2G },
    { id: "RailSec_DoorS", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-96.0, Fix(secY + 0.82), 809.52], size: [1.15, 2.05, 0.14], solid: false, group: z2G },
    { id: "RailSec_WinE", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-90.48, Fix(secY + 1.35), 806.5], size: [0.14, 1.35, 1.05], solid: false, group: z2G },
    // 砖石院墙（x:-104..-88.2, z:801.5..815.5 — 100% 实心遮挡 [-90,878] → [-89,798] 视线！）
    { id: "RailSec_WallW", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-103.8, null, 808.5], size: [0.46, 2.15, 14.0], group: z2G },
    { id: "RailSec_WallS", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-96.0, null, 815.3], size: [15.8, 2.15, 0.46], group: z2G },
    { id: "RailSec_WallN1", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-101.2, null, 801.7], size: [5.4, 2.15, 0.46], group: z2G },
    { id: "RailSec_WallN2", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-92.1, null, 801.7], size: [8.0, 2.15, 0.46], group: z2G },
    // 东院墙（留 1.8m 朝向路基的院门于 z=811.8，北段 z=801.5..810.8 与南段 z=812.8..815.5 形成连续遮挡）
    { id: "RailSec_WallE1", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-88.4, null, 806.15], size: [0.46, 2.25, 9.3], group: z2G },
    { id: "RailSec_WallE2", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-88.4, null, 814.15], size: [0.46, 2.25, 2.7], group: z2G },
    { id: "RailSec_WallE_Coping", asset: "Whitebox/Box", material: "Whitebox/Coping", pos: [-88.4, Fix(secY + 2.25), 806.15], size: [0.56, 0.16, 9.4], solid: false, group: z2G },
    { id: "RailSec_GateLeaf", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-89.0, null, 811.2], size: [0.14, 1.95, 1.45], yawDeg: 35, group: z2G },
    // 院内西南木工具棚、压水井、煤渣坑
    { id: "RailSec_ToolShed", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-101.6, null, 813.0], size: [3.4, 2.25, 3.6], group: z2G },
    { id: "RailSec_ToolRoof", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [-101.6, Fix(secY + 2.28), 813.0], size: [3.8, 0.28, 4.0], group: z2G },
    { id: "RailSec_WellCurb", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-92.2, null, 812.6], size: [1.15, 0.55, 1.15], group: z2G },
    { id: "RailSec_CoalPit", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [-96.5, null, 813.4], size: [2.4, 0.42, 1.8], group: z2G },
    // 院北废料场与手摇平车架（严格置于 x <= -93，100% 让开 MergedBridgeRush [-89.6, 798]！）
    { id: "RailSec_SleeperRack", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-100.5, null, 799.2], size: [3.2, 0.92, 1.8], yawDeg: 4, group: z2G },
    { id: "RailSec_ScrapRail1", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-96.2, null, 798.8], size: [4.6, 0.18, 0.22], yawDeg: 12, group: z2G },
    { id: "RailSec_ScrapRail2", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-95.8, null, 799.6], size: [4.2, 0.18, 0.22], yawDeg: -8, group: z2G },
    { id: "RailSec_Handcar", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-95.2, null, 797.8], size: [2.1, 0.72, 1.55], yawDeg: 18, group: z2G },
    // 津浦线 7.5m 机械臂板信号机（[-87.5, 820]，夕阳强地标）
    { id: "RailSemaphore_Base", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-87.5, null, 820.0], size: [0.95, 0.65, 0.95], group: z2G },
    { id: "RailSemaphore_Mast", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-87.5, null, 820.0], size: [0.24, 7.6, 0.24], group: z2G },
    { id: "RailSemaphore_Blade", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-86.65, Fix(HeightAtOwn(-87.5, 820) + 7.05), 820.0], size: [1.65, 0.26, 0.08], yawDeg: 0, solid: false, group: z2G },
    { id: "RailSemaphore_LeverBox", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-88.1, null, 820.2], size: [0.55, 0.85, 0.45], group: z2G },
  );
  // 北岸西段护堤枯柳带 & 护岸矮土埂
  for (const [idx, x, z, h] of [
    [1, -96, 824, 6.8], [2, -104, 826, 7.4], [3, -113, 825, 6.2], [4, -122, 827, 7.1],
    [5, -132, 828, 6.6], [6, -142, 829, 7.5], [7, -150, 830, 6.4], [8, -110, 812, 5.8],
  ]) {
    ownObjects.push({
      id: `RailNorthWest_Willow_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
      pos: [x, null, z], size: [0.46, h, 0.46], group: z2G,
    });
  }
  ownObjects.push({
    id: "RailNorthWest_LeveeBerm", asset: "Whitebox/Box", material: "Whitebox/EarthDark",
    pos: [-126, null, 825.5], size: [42, 0.82, 1.6], yawDeg: -6, group: z2G,
  });

  // --- 三区：桥北东翼——北段拆轨现场、路基排水涵洞、桥北土坎细化、北坡道哨卡与弃车 ---
  const z3G = "08–13合并/桥圈/三区_桥北拆轨与交火带";
  ownObjects.push(
    // 北段拆轨现场（x:-82..-73, z:750..820，兑现范长江 1938.2 北沙河以北拆轨取枕木史料）
    { id: "RailDismantle_Ballast1", asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-80.0, 2.58, 764.0], size: [2.8, 0.24, 16.0], solid: false, group: z3G },
    { id: "RailDismantle_Ballast2", asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-80.0, 2.58, 792.0], size: [2.8, 0.24, 16.0], solid: false, group: z3G },
    { id: "RailDismantle_Ballast3", asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-80.0, 2.58, 814.0], size: [2.8, 0.24, 14.0], solid: false, group: z3G },
    // 东坡滑落的撬弯残轨与拆剩枕木散垛（严格避开 MergedRailAmbush/BridgeGun/BridgeRush 路径）
    { id: "RailScrap_Rail1", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-75.6, null, 762.5], size: [0.16, 0.16, 7.2], yawDeg: 26, group: z3G },
    { id: "RailScrap_Rail2", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-74.8, null, 785.2], size: [0.16, 0.16, 6.4], yawDeg: -18, group: z3G },
    { id: "RailScrap_Rail3", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-75.4, null, 804.8], size: [0.16, 0.16, 6.8], yawDeg: 14, group: z3G },
    { id: "RailScrap_Rail4", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-76.2, null, 814.0], size: [0.16, 0.16, 5.4], yawDeg: -22, group: z3G },
    { id: "RailScrap_SleeperPile1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-74.2, null, 768.0], size: [1.35, 0.72, 2.55], yawDeg: 16, group: z3G },
    { id: "RailScrap_SleeperPile2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-74.5, null, 809.5], size: [1.25, 0.68, 2.45], yawDeg: -12, group: z3G },
    { id: "RailScrap_SleeperPile3", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-84.5, null, 766.0], size: [1.35, 0.74, 2.55], yawDeg: 8, group: z3G },
    // 路基砖石排水小涵洞（z = 790，西接西田排涝干沟）
    { id: "RailCulvertN_HeadE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-75.8, null, 790.0], size: [0.65, 1.85, 3.2], group: z3G },
    { id: "RailCulvertN_VoidE", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-75.46, null, 790.0], size: [0.22, 1.25, 1.55], solid: false, group: z3G },
    { id: "RailCulvertN_HeadW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-84.2, null, 790.0], size: [0.65, 1.85, 3.2], group: z3G },
    { id: "RailCulvertN_VoidW", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-84.54, null, 790.0], size: [0.22, 1.25, 1.55], solid: false, group: z3G },
    // 桥北土坎（z=807）北坡防汛枝束 & 坎南洼地避难弃物（全 < 0.38m，不阻挡 13b 班长三人冲桥）
    { id: "NorthBank_Brush1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-58.0, null, 805.2], size: [3.2, 0.42, 1.1], yawDeg: 8, group: z3G },
    { id: "NorthBank_Brush2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-47.5, null, 805.6], size: [2.8, 0.38, 1.0], yawDeg: -6, group: z3G },
    { id: "NorthBank_DoorBoard1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-61.2, null, 809.8], size: [2.1, 0.12, 0.85], yawDeg: 22, solid: false, group: z3G },
    { id: "NorthBank_DoorBoard2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-54.8, null, 810.4], size: [2.0, 0.12, 0.82], yawDeg: -15, solid: false, group: z3G },
    { id: "NorthBank_MatRoll", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-57.6, null, 810.2], size: [1.3, 0.34, 0.42], yawDeg: 35, group: z3G },
    // 北坡道护帮 & 桥头东坎弃置三营哨卡（严格放在 z>=825.5 坡道南侧，保持坡道净宽 > 3.5m！）
    { id: "NorthRamp_CurbN", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-72.8, null, 819.8], size: [7.8, 0.36, 0.28], yawDeg: -8, group: z3G },
    { id: "NorthRamp_CurbS", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-72.8, null, 824.6], size: [7.6, 0.36, 0.28], yawDeg: -8, group: z3G },
    { id: "BridgeCheck_Bags", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-74.8, null, 826.4], size: [2.6, 1.05, 0.72], yawDeg: -14, group: z3G },
    { id: "BridgeCheck_Hedgehog1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-71.4, null, 826.2], size: [1.85, 0.95, 0.95], yawDeg: 28, group: z3G },
    { id: "BridgeCheck_Wire", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-69.0, null, 826.4], size: [2.4, 0.75, 0.85], yawDeg: -8, meta: { obstacle: "barbedWire" }, group: z3G },
    // 北滑坡口（SlideNorth）断轴弃车与包袱（无声交代大车下不了陡岸）
    { id: "SlideNorth_CartBody", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-61.2, null, 825.6], size: [1.75, 0.65, 0.92], yawDeg: -34, group: z3G },
    { id: "SlideNorth_CartWheel", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-60.3, null, 826.1], size: [0.16, 0.85, 0.85], yawDeg: 22, group: z3G },
    { id: "SlideNorth_Bundle", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-62.4, null, 826.2], size: [0.82, 0.38, 0.64], yawDeg: 18, group: z3G },
    // 李子行西沿乡土过渡（牲口偏棚 + 弃车架 + 荆笆）
    { id: "LiziWest_ShedBody", asset: "Whitebox/Box", material: "Whitebox/Step", pos: [-44.8, null, 774.5], size: [3.8, 2.05, 5.2], yawDeg: 4, group: z3G },
    { id: "LiziWest_ShedRoof", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-44.8, Fix(HeightAtOwn(-44.8, 774.5) + 2.10), 774.5], size: [4.3, 0.38, 5.7], yawDeg: 4, group: z3G },
    { id: "LiziWest_Fence", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-42.5, null, 783.5], size: [0.22, 0.92, 8.8], yawDeg: -5, group: z3G },
    { id: "LiziWest_CartFrame", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-45.5, null, 786.5], size: [2.4, 0.58, 1.35], yawDeg: 28, group: z3G },
  );

  // --- 四区：早春枯水北沙河河床（低矮卵石滩、漂木、细簇枯苇茬、东侧老乡蹚水踏石渡道） ---
  const z4G = "08–13合并/桥圈/四区_早春枯水河床";
  for (const [idx, x, z, sw, sh, sd, yaw] of [
    [1, -92, 836, 4.4, 0.16, 2.4, 18], [2, -68, 838, 4.8, 0.18, 2.6, -12],
    [3, -44, 840, 5.6, 0.17, 2.8, 8], [4, -118, 844, 5.2, 0.19, 2.6, -16],
    [5, -22, 836, 4.0, 0.15, 2.2, 24], [6, -138, 848, 4.6, 0.16, 2.4, 10],
  ]) {
    ownObjects.push(
      { id: `River_CobbleShoal_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Step", pos: [x, null, z], size: [sw, sh, sd], yawDeg: yaw, solid: false, group: z4G },
      { id: `River_CobbleRock_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [Fix(x + 0.7), null, Fix(z - 0.3)], size: [0.85, 0.28, 0.65], yawDeg: yaw + 22, group: z4G },
    );
  }
  for (const [idx, x, z, len, yaw] of [
    [1, -88, 843, 4.2, 22], [2, -69, 845, 3.6, -16], [3, -106, 841, 4.8, 12], [4, -36, 844, 3.8, -24],
  ]) {
    ownObjects.push({
      id: `River_Driftwood_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [x, null, z], size: [len, 0.24, 0.28], yawDeg: yaw, group: z4G,
    });
  }
  const AddReedCluster = (prefix, cx, cz, count, baseH, group) => {
    for (let i = 0; i < count; i++) {
      const ox = Fix((i - (count - 1) / 2) * 0.72 + ((i % 2) ? 0.18 : -0.14));
      const oz = Fix(((i % 3) - 1) * 0.34);
      const th = Fix(baseH * (0.78 + ((i * 19) % 5) * 0.08));
      ownObjects.push({
        id: `${prefix}_T${i + 1}`, asset: "Whitebox/Box", material: (i % 2 === 0) ? "Whitebox/Canvas" : "Whitebox/Step",
        pos: [Fix(cx + ox), null, Fix(cz + oz)], size: [0.32, th, 0.28], yawDeg: (i * 29) % 70, solid: false, group,
      });
    }
  };
  for (const [idx, x, z, cnt, h] of [
    [1, -98, 847.5, 4, 0.86], [2, -114, 849.0, 5, 0.94], [3, -132, 851.0, 5, 0.98],
    [4, -88, 857.5, 4, 0.84], [5, -104, 859.0, 4, 0.90], [6, -68, 857.2, 3, 0.80],
    [7, -50, 855.5, 4, 0.92], [8, -32, 853.0, 5, 0.88], [9, -14, 849.5, 4, 0.85],
    [10, -72, 847.0, 3, 0.76],
  ]) AddReedCluster(`River_DryReeds_${idx}`, x, z, cnt, h, z4G);
  // 东侧老乡蹚水踏石渡道（x=-64..-62, z=846..857）+ 漂浮竹扁担
  for (const [idx, x, z] of [
    [1, -63.4, 846.8], [2, -62.9, 848.4], [3, -63.5, 850.1],
    [4, -62.8, 851.8], [5, -63.3, 853.5], [6, -62.7, 855.2], [7, -63.2, 856.8],
  ]) {
    ownObjects.push({
      id: `River_FordStone_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Structure",
      pos: [x, -2.62, z], size: [0.82, 0.42, 0.68], yawDeg: (idx * 27) % 50, group: z4G,
    });
  }
  ownObjects.push({
    id: "River_FordPole", asset: "Whitebox/Box", material: "Whitebox/Timber",
    pos: [-64.8, -2.42, 852.4], size: [1.95, 0.08, 0.10], yawDeg: 32, solid: false, group: z4G,
  });

  // --- 五区：桥南核心战场——七二七团三营桥头阵地、工兵起爆所、堤后伤员避弹凹窝与猫耳洞 ---
  const z5G = "08–13合并/桥圈/五区_南岸三营桥头阵地";
  ownObjects.push(
    // 5A 西段主阻击胸墙延展（接 Merged_Cover_SouthBankBags [-89.8, 875.6] 西侧，+ 教范分散弹药/手榴弹箱）
    { id: "SouthWest_ParapetExt", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-94.0, null, 875.7], size: [3.2, 1.02, 0.62], yawDeg: -6, group: z5G },
    { id: "SouthWest_ParapetSleeper", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-94.0, Fix(HeightAtOwn(-94.0, 875.7) + 0.98), 875.7], size: [3.1, 0.16, 0.34], yawDeg: -6, solid: false, group: z5G },
    { id: "SouthWest_AmmoCrate", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-92.8, null, 877.4], size: [0.62, 0.34, 0.42], yawDeg: 14, group: z5G },
    { id: "SouthWest_GrenadeCrate", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-95.2, null, 877.8], size: [0.52, 0.30, 0.38], yawDeg: -22, group: z5G },
    // 5B 工兵起爆掩体胸墙（严格位于 [-80,874]→[-90,878] 通道北侧 z=873.6！）+ 南侧起爆机箱与线轴（h=0.40 < 0.45m）
    { id: "Detonation_Parapet", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-84.6, null, 873.6], size: [3.6, 1.02, 0.62], yawDeg: 10, group: z5G },
    { id: "Detonation_SleeperTop", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-84.6, Fix(HeightAtOwn(-84.6, 873.6) + 0.98), 873.6], size: [3.4, 0.16, 0.34], yawDeg: 10, solid: false, group: z5G },
    { id: "Detonation_ExploderBox", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-87.2, null, 880.6], size: [0.46, 0.40, 0.36], yawDeg: 18, group: z5G },
    { id: "Detonation_WireReel", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [-86.4, null, 880.9], size: [0.42, 0.36, 0.42], yawDeg: -10, group: z5G },
    { id: "Detonation_DynamiteCrate", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-85.5, null, 881.2], size: [0.62, 0.34, 0.42], yawDeg: 8, group: z5G },
    // 5C 堤后伤员与百姓避弹凹窝（西墙 x=-97.5、南墙 z=889.5、西北短角 x:-97.5..-94.8；东北/东口完全敞开保 13d/13e 0 穿墙！）
    { id: "WoundedAlcove_WallW", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-97.5, null, 885.0], size: [0.68, 0.92, 9.0], group: z5G },
    { id: "WoundedAlcove_WallS", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-93.5, null, 889.5], size: [8.2, 0.92, 0.68], group: z5G },
    { id: "WoundedAlcove_WallNW", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-96.2, null, 880.5], size: [2.8, 0.90, 0.65], group: z5G },
    { id: "WoundedAlcove_MatBed1", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-92.5, null, 885.8], size: [3.6, 0.06, 2.6], solid: false, group: z5G },
    { id: "WoundedAlcove_MatBed2", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-90.2, null, 881.2], size: [2.2, 0.06, 1.8], solid: false, group: z5G },
    { id: "WoundedAlcove_LanternPost", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-96.3, null, 885.4], size: [0.14, 1.95, 0.14], group: z5G },
    { id: "WoundedAlcove_Lantern", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-96.1, Fix(HeightAtOwn(-96.3, 885.4) + 1.65), 885.4], size: [0.24, 0.34, 0.24], solid: false, group: z5G },
    { id: "WoundedAlcove_WaterVat", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [-96.2, null, 888.2], size: [0.76, 0.84, 0.76], group: z5G },
    { id: "WoundedAlcove_MedCrate", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-94.8, null, 888.4], size: [0.85, 0.42, 0.52], yawDeg: 8, group: z5G },
    // 5D 东段三营交叉火力机枪窝 + 铁路枕木覆土防炮猫耳洞（z=881..885，门朝南背敌）
    { id: "SouthEast_MgNestFront", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-69.2, null, 876.5], size: [5.4, 1.08, 0.72], yawDeg: -5, group: z5G },
    { id: "SouthEast_MgNestSideW", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-72.0, null, 878.0], size: [0.68, 1.02, 2.8], yawDeg: -5, group: z5G },
    { id: "SouthEast_MgNestSideE", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-66.4, null, 877.8], size: [0.68, 1.02, 2.8], yawDeg: -5, group: z5G },
    { id: "SouthEast_DugoutRoof", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [-51.0, Fix(HeightAtOwn(-51.0, 882.6) + 1.18), 882.6], size: [6.8, 0.65, 3.8], yawDeg: -6, group: z5G },
    { id: "SouthEast_DugoutTimbers", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-51.0, Fix(HeightAtOwn(-51.0, 882.6) + 1.02), 882.6], size: [6.4, 0.22, 3.4], yawDeg: -6, solid: false, group: z5G },
    { id: "SouthEast_DugoutWallN", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-51.0, null, 880.9], size: [6.4, 1.22, 0.48], yawDeg: -6, group: z5G },
    { id: "SouthEast_DugoutWallW", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-54.1, null, 882.6], size: [0.48, 1.22, 3.2], yawDeg: -6, group: z5G },
    { id: "SouthEast_DugoutWallE", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-47.9, null, 882.6], size: [0.48, 1.22, 3.2], yawDeg: -6, group: z5G },
    { id: "SouthEast_DugoutMouth", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-51.0, null, 884.2], size: [2.2, 1.05, 0.28], yawDeg: -6, solid: false, group: z5G },
    { id: "SouthEast_DugoutCrate", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-53.2, null, 885.2], size: [1.1, 0.58, 0.72], yawDeg: 12, group: z5G },
    // 5E 南坡道收容指路哨（[-68,890] 两侧，严格保持 13e 路径居中 ≥ 5m 净空！）
    { id: "SouthRally_SignPost", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-60.2, null, 889.8], size: [0.16, 2.55, 0.16], group: z5G },
    { id: "SouthRally_SignBoard", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-59.7, Fix(HeightAtOwn(-60.2, 889.8) + 2.15), 889.8], size: [1.1, 0.36, 0.08], solid: false, group: z5G },
    { id: "SouthRally_Lantern", asset: "Whitebox/Box", material: "Whitebox/Danger", pos: [-60.2, Fix(HeightAtOwn(-60.2, 889.8) + 2.48), 889.8], size: [0.24, 0.32, 0.24], solid: false, group: z5G },
    { id: "SouthRally_WaterBarrel", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-59.0, null, 891.2], size: [0.75, 0.92, 0.75], group: z5G },
    { id: "SouthRally_Stretcher1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-58.4, null, 893.2], size: [2.1, 0.14, 0.85], yawDeg: 18, solid: false, group: z5G },
    { id: "SouthRally_Stretcher2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-73.2, null, 891.8], size: [2.1, 0.14, 0.85], yawDeg: -24, solid: false, group: z5G },
    { id: "SouthRally_Barrow1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-74.0, null, 894.0], size: [1.75, 0.66, 0.92], yawDeg: 32, group: z5G },
    // 5F 南岸西侧防洪柳林与取土苇洼（[-118, 906]）
    { id: "Pond_SWBridge_Water", asset: "Whitebox/Box", material: "Whitebox/Water", pos: [-118, -0.74, 906], size: [14.5, 0.48, 10.2], solid: false, group: z5G },
    { id: "Pond_SWBridge_Reeds1", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-111.5, null, 903.0], size: [3.2, 0.98, 1.8], solid: false, group: z5G },
    { id: "Pond_SWBridge_Reeds2", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [-124.5, null, 909.5], size: [3.6, 0.92, 1.6], solid: false, group: z5G },
  );
  for (const [idx, x, z, h] of [
    [1, -104, 882, 6.8], [2, -112, 884, 7.2], [3, -122, 886, 6.5], [4, -133, 887, 7.4],
    [5, -144, 888, 6.6], [6, -106, 904, 6.2], [7, -128, 916, 7.0], [8, -142, 926, 6.4],
  ]) {
    ownObjects.push({
      id: `SouthWest_Willow_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Foliage",
      pos: [x, null, z], size: [0.46, h, 0.46], group: z5G,
    });
  }
  AddStrawRick(13, -104, 928, 0.96, 14);
  AddStrawRick(14, -132, 944, 0.88, -18);

  // --- 六区：南岸路夜行带 & “桥南小庄”（3 座鲁南空院 + 老槐树井台土地龛 + 撤退弃物） ---
  const z6G = "08–13合并/桥圈/六区_南岸夜行与桥南小庄";
  ownObjects.push(
    // 南段铁路人行道口木铺面（z=886，恰在 13e 跨铁路处，非碰撞铺面保 0 穿墙）
    { id: "RailCrossS_Planks", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-80.0, 2.66, 886.0], size: [3.6, 0.10, 4.2], solid: false, group: z6G },
    { id: "RailCrossS_PostW1", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-82.8, null, 883.4], size: [0.18, 1.15, 0.18], group: z6G },
    { id: "RailCrossS_PostE1", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-77.2, null, 888.6], size: [0.18, 1.15, 0.18], group: z6G },
    // 南段铁路石砌排水涵洞（z=926）& 里程碑（[-83.5, 945]）
    { id: "RailCulvertS_HeadE", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-75.8, null, 926.0], size: [0.65, 1.85, 3.0], group: z6G },
    { id: "RailCulvertS_VoidE", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-75.46, null, 926.0], size: [0.22, 1.20, 1.45], solid: false, group: z6G },
    { id: "RailCulvertS_HeadW", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-84.2, null, 926.0], size: [0.65, 1.85, 3.0], group: z6G },
    { id: "RailCulvertS_VoidW", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-84.54, null, 926.0], size: [0.22, 1.20, 1.45], solid: false, group: z6G },
    { id: "RailMilestone_562", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-83.5, null, 945.0], size: [0.46, 1.12, 0.24], group: z6G },
    // 桥南小庄村口老槐树、青石公井、石碾与路边小土地龛（[-44, 920]，距 13e 路径 > 12m）
    { id: "SouthHam_Locust", asset: "Whitebox/Box", material: "Whitebox/Foliage", pos: [-43.5, null, 918.5], size: [0.58, 8.2, 0.58], group: z6G },
    { id: "SouthHam_WellCurb", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-41.8, null, 922.0], size: [1.28, 0.48, 1.28], group: z6G },
    { id: "SouthHam_Mill", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [-44.5, null, 923.6], size: [1.45, 0.72, 1.45], group: z6G },
    { id: "SouthHam_ShrineBody", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [-45.6, null, 914.5], size: [1.85, 1.65, 1.65], yawDeg: -12, group: z6G },
    { id: "SouthHam_ShrineRoof", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [-45.6, Fix(HeightAtOwn(-45.6, 914.5) + 1.68), 914.5], size: [2.25, 0.36, 2.05], yawDeg: -12, group: z6G },
    { id: "SouthHam_ShrineVoid", asset: "Whitebox/Box", material: "Whitebox/Void", pos: [-46.45, Fix(HeightAtOwn(-45.6, 914.5) + 0.55), 914.5], size: [0.14, 0.85, 0.72], yawDeg: -12, solid: false, group: z6G },
    // 南岸路夜行撤退生态（西侧断辕马车 [-71, 918]、熄灭火堆与空担架 [-66, 932]）
    { id: "SouthRoad_WagonBody", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-70.8, null, 918.0], size: [1.85, 0.92, 3.1], yawDeg: -22, group: z6G },
    { id: "SouthRoad_WagonWheel", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-69.6, null, 917.2], size: [0.18, 1.05, 1.05], yawDeg: 42, group: z6G },
    { id: "SouthRoad_CampfireAsh", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [-66.2, null, 932.0], size: [1.45, 0.16, 1.45], solid: false, group: z6G },
    { id: "SouthRoad_CampStretcher", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-67.8, null, 933.2], size: [2.1, 0.14, 0.82], yawDeg: 28, solid: false, group: z6G },
  );
  // 桥南小庄 3 座鲁南空农舍院落（x: -38..-12, z: 912..958）+ 场边麦秸垛
  AddLunanCompound("SouthHam_1", "T2", -29.5, 920.5, 13.4, 13.0, { gateSide: "W", yawDeg: -4.0, group: z6G });
  AddLunanCompound("SouthHam_2", "T2", -26.8, 938.5, 13.8, 13.2, { gateSide: "W", yawDeg: 2.5, group: z6G });
  AddLunanCompound("SouthHam_3", "T1", -15.5, 928.5, 9.6, 10.2, { gateSide: "S", yawDeg: -3.5, group: z6G });
  AddStrawRick(15, -36.5, 954.0, 0.94, 12);
  AddStrawRick(16, -14.0, 950.5, 0.86, -15);

  // ============================================================================
  // 13) 移建鲁南核心历史地标（关帝庙、官道土地庙、S2 东北角土炮楼、大槐树石碾）
  // ============================================================================
  const Transplant = (raw, dx, dz, group, idPrefix = "Merged_", patch = null) => {
    const obj = structuredClone(raw);
    obj.id = `${idPrefix}${raw.id}`;
    obj.pos = [Fix(raw.pos[0] + dx), raw.pos[1], Fix(raw.pos[2] + dz)];
    obj.group = group;
    if (obj.meta?.openings) {
      obj.meta.openings = obj.meta.openings.map((op) => ({
        ...op,
        p: Array.isArray(op.p) ? [Fix(op.p[0] + dx), Fix(op.p[1] + dz)] : op.p,
      }));
    }
    if (obj.meta?.room?.center) {
      obj.meta.room.center = [Fix(obj.meta.room.center[0] + dx), Fix(obj.meta.room.center[1] + dz)];
    }
    if (patch) patch(obj);
    ownObjects.push(obj);
  };

  for (const raw of baseDoc.objects) {
    if (!/^House_TempleHall|^Temple(Guandi|Incense|Dropped|Fallen|Altar|Desk|YardWest|HallWest)/.test(raw.id)) continue;
    Transplant(raw, -4.2, 99.5, "08–13合并/地标/关帝庙", "Merged_", (obj) => {
      if (raw.id === "TempleYardWestSouth") {
        obj.pos[2] = 534.8;
        obj.size = [0.5, 2.4, 6.8];
      }
    });
  }
  for (const raw of baseDoc.objects) {
    if (!/^RoadShrine/.test(raw.id)) continue;
    Transplant(raw, 0, -442, "08–13合并/地标/土地庙", "Merged_");
  }
  // 土炮楼随 S2 缩村迁回北沙河东北角 [220, 496]，并加收分基座与残土圩坎（P3）
  for (const raw of baseDoc.objects) {
    if (!/^WatchTower/.test(raw.id)) continue;
    Transplant(raw, 220 - 229.5, 496 - 390.5, "08–13合并/地标/土炮楼", "Merged_");
  }
  ownObjects.push(
    { id: "Merged_WatchTower_Batter", asset: "Whitebox/Box", material: "Whitebox/Structure", pos: [220, null, 496], size: [5.4, 1.35, 5.4], group: "08–13合并/地标/土炮楼" },
    { id: "Merged_WatchTower_RampartN", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [216.5, null, 490.8], size: [9.5, 1.12, 1.15], yawDeg: -8, group: "08–13合并/地标/土炮楼" },
    { id: "Merged_WatchTower_RampartE", asset: "Whitebox/Box", material: "Whitebox/EarthDark", pos: [224.2, null, 499.5], size: [1.15, 1.08, 10.5], yawDeg: -4, group: "08–13合并/地标/土炮楼" },
  );
  for (const raw of baseDoc.objects) {
    if (raw.id === "BigLocust") Transplant(raw, 132.5 - 121.5, 551.5 - 548.5, "08–13合并/地标/村心广场", "Merged_");
    if (raw.id === "MillBase" || raw.id === "MillStone") Transplant(raw, 128 - 77, 553 - 457, "08–13合并/地标/村心广场", "Merged_");
  }

  // Telegraph poles bridging north approach (z=365..455) AND the +80m expanded band (z=575..690)
  for (const [idx, zPos] of [375, 410, 445].entries()) {
    ownObjects.push({
      id: `Merged_TelePole_${idx + 1}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [-87, null, zPos], size: [0.24, 7.6, 0.24], group: "08–13合并/其他/Tele",
    });
  }
  const teleBridgeZs = [575, 613, 651, 690];
  for (let i = 1; i < teleBridgeZs.length - 1; i++) {
    const zp = teleBridgeZs[i];
    ownObjects.push(
      { id: `Merged_TelePole_Exp${i}`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-87, null, zp], size: [0.22, 7.0, 0.22], group: "08–13合并/其他/Tele" },
      { id: `Merged_TeleArm_Exp${i}`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [-87, 6.8, zp], size: [1.4, 0.1, 0.1], group: "08–13合并/其他/Tele" },
    );
  }
  for (let i = 0; i < teleBridgeZs.length - 1; i++) {
    const za = teleBridgeZs[i], zb = teleBridgeZs[i + 1];
    ownObjects.push({
      id: `Merged_TeleWire_Exp${i + 1}`, asset: "Whitebox/Box", material: "Whitebox/Metal",
      pos: [-87, 6.8, Fix((za + zb) / 2)], size: [0.03, 0.03, Fix(zb - za - 0.22)], solid: false, group: "08–13合并/其他/Tele",
    });
  }

  // 14) 全部 15 处战术掩体块（严格保持 d=0.50m + 双隐蔽点 cover.points，严守 AI CoverRegistry 门禁）
  for (const [id, x, z, w, h, d, fx, fz, yawDeg = 0] of [
    ["NorthBerm1", 144.0, 412.8, 4.4, 1.08, 0.50, 0, 1, 0],
    ["NorthBerm2", 136.5, 413.6, 4.2, 1.08, 0.50, 0, 1, 0],
    ["NorthBerm3", 130.0, 438.6, 4.6, 1.12, 0.50, 0, 1, 0],
    ["NorthBerm4", 123.0, 439.4, 4.2, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm1", 108.5, 434.2, 3.6, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm2", 94.0, 434.2, 3.6, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm3", 106.2, 456.8, 3.4, 1.08, 0.50, 0, 1, 0],
    ["RoadBerm4", 93.2, 456.8, 3.4, 1.08, 0.50, 0, 1, 0],
    ["MainStBags", 130.2, 550.2, 3.8, 1.08, 0.50, 0, 1, 0],
    ["SouthMidBags", 170.6, 634.0, 3.2, 1.08, 0.50, 0, -1, 8],
    ["SouthStBags", 126.2, 688.8, 3.6, 1.08, 0.50, 0, -1, 0],
    ["RailStones1", -72.8, 780.0, 3.8, 1.08, 0.50, 0.6, 0.8, 0],
    ["RailStones2", -76.5, 776.2, 3.8, 1.08, 0.50, 0.6, 0.8, 0],
    ["BridgeGunBags", -73.2, 775.4, 3.6, 1.08, 0.50, 0, 1, 0],
    ["SouthBankBags", -89.8, 875.6, 4.4, 1.08, 0.50, 0, -1, 0],
  ]) {
    const span = +(w * 0.27).toFixed(2);
    const points = w >= 3.2
      ? [{ x: +(x - span).toFixed(2), z }, { x: +(x + span).toFixed(2), z }]
      : [{ x, z }];
    ownObjects.push({
      id: `Merged_Cover_${id}`, asset: "Whitebox/Box", material: "Whitebox/Cover",
      pos: [x, null, z], size: [w, h, d], ...(yawDeg ? { yawDeg } : {}),
      cover: { faceX: fx, faceZ: fz, points }, meta: { planning: true },
      group: "08–13合并/战术掩体",
    });
  }

  // 15) 村缘不规则乡土过渡附屋（打破直线村界）+ 先期轰炸残垣弹坑 + 玩家动线收束（自然路障 + KeepIn 空气墙）
  // 15A) 村缘突出“村咀”零星牲口棚/柴草棚（嵌入犬牙村界突出处）
  for (const [id, x, z, w, h, d, yaw] of [
    ["FringeShed_W1", 49.0, 588.0, 3.8, 2.05, 5.2, 8],
    ["FringeShed_W2", 47.2, 682.5, 4.2, 1.98, 4.4, -12],
    ["FringeShed_E1", 219.5, 580.5, 4.0, 2.02, 5.0, -9],
    ["FringeShed_E2", 216.2, 694.0, 3.6, 1.95, 4.6, 11],
  ]) {
    const gy = HeightAtOwn(x, z);
    ownObjects.push(
      { id: `S2_${id}_Body`, asset: "Whitebox/Box", material: "Whitebox/Step", pos: [x, null, z], size: [w, h, d], yawDeg: yaw, group: "08–13合并/村缘过渡" },
      { id: `S2_${id}_Roof`, asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [x, Fix(gy + h + 0.05), z], size: [Fix(w + 0.5), 0.36, Fix(d + 0.5)], yawDeg: yaw, group: "08–13合并/村缘过渡" },
    );
  }

  // 15B) 先期轰炸弹坑碎砖瓦砾、焦黑断梁与烟熏残迹（呼应 3.14 村子已遭先期空袭与炮击）
  const bombG = "08–13合并/战损/先期轰炸痕迹";
  const bombScorchPaint = [];
  for (const c of PRE_BOMB_CRATERS) {
    const gy = HeightAtOwn(c.x, c.z);
    // 焦黑弹坑底盘涂色（10 边形不规则焦土）
    const poly = [];
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      const rr = c.r * (1.15 + ((k * 17 + Math.round(c.x)) % 5) * 0.08);
      poly.push({ x: Fix(c.x + Math.cos(ang) * rr), z: Fix(c.z + Math.sin(ang) * rr) });
    }
    bombScorchPaint.push({ id: `BombScorch_${c.id}`, poly, feather: 1.4, color: "#4a4137", strength: 0.78 });
    // 坑边碎砖土块与焦黑残木梁
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2 + 0.4;
      const dist = c.r * (0.95 + (k % 2) * 0.25);
      const rx = Fix(c.x + Math.cos(ang) * dist), rz = Fix(c.z + Math.sin(ang) * dist);
      ownObjects.push({
        id: `BombCrater_${c.id}_Rubble${k + 1}`, asset: "Whitebox/Box",
        material: k % 2 === 0 ? "Whitebox/EarthDark" : (c.debris === "ruin" ? "Whitebox/Plaster" : "Whitebox/Step"),
        pos: [rx, null, rz], size: [Fix(1.3 + (k % 3) * 0.45), Fix(0.36 + (k % 2) * 0.22), Fix(0.9 + (k % 2) * 0.35)],
        yawDeg: (k * 37) % 180, group: bombG,
      });
    }
    if (c.debris === "ruin") {
      ownObjects.push(
        { id: `BombCrater_${c.id}_Beam1`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [Fix(c.x + 1.1), Fix(gy + 0.22), Fix(c.z - 0.8)], size: [2.9, 0.16, 0.18], yawDeg: 32, group: bombG },
        { id: `BombCrater_${c.id}_Beam2`, asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [Fix(c.x - 1.3), Fix(gy + 0.28), Fix(c.z + 1.0)], size: [2.4, 0.16, 0.18], yawDeg: -48, group: bombG },
        { id: `BombCrater_${c.id}_Tiles`, asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [Fix(c.x + 1.8), null, Fix(c.z + 1.2)], size: [1.85, 0.42, 1.35], yawDeg: 18, group: bombG },
      );
    }
    if (c.fire) {
      // 阴燃炭火底芯（配合 smokeColumns 烟柱在白盒与实机均有视觉焦点）
      ownObjects.push({
        id: `BombCrater_${c.id}_Ember`, asset: "Whitebox/Box", material: "Whitebox/Danger",
        pos: [c.x, Fix(gy + 0.10), c.z], size: [1.1, 0.14, 1.1], yawDeg: 24, solid: false, group: bombG,
      });
    }
  }

  // 15C) 动线收束：物理自然阻挡 + 村落半环形外围纵深防御工事（折线纵深铁丝网、东西翼折回防线、拒马、侧翼机枪窝、弹药龛、清扫射界树桩）+ 玩家专用 KeepIn 空气墙走廊
  const defG = "08–13合并/工事/村落环形防线";
  const AddWireLine = (prefix, pts, segLen = 5.4) => {
    let idx = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az;
      const dist = Math.hypot(dx, dz);
      const count = Math.max(1, Math.round(dist / segLen));
      const yawDeg = Fix((-Math.atan2(dz, dx) * 180) / Math.PI);
      for (let s = 0; s < count; s++) {
        const t0 = s / count, t1 = (s + 1) / count;
        const mx = Fix(ax + dx * (t0 + t1) * 0.5);
        const mz = Fix(az + dz * (t0 + t1) * 0.5);
        const len = Fix(dist / count - 0.12);
        idx++;
        ownObjects.push(
          {
            id: `${prefix}_${String(idx).padStart(2, "0")}`, asset: "Whitebox/Box", material: "Whitebox/Metal",
            pos: [mx, null, mz], size: [len, 0.88, 1.05], yawDeg, meta: { obstacle: "barbedWire" }, group: defG,
          },
          {
            id: `${prefix}_Stake_${String(idx).padStart(2, "0")}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
            pos: [Fix(ax + dx * t0), null, Fix(az + dz * t0)], size: [0.14, 1.05, 0.14], group: defG,
          },
        );
      }
    }
  };
  const AddAbatisLine = (prefix, pts, step = 6.2) => {
    let idx = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az;
      const dist = Math.hypot(dx, dz);
      const count = Math.max(1, Math.round(dist / step));
      const yawDeg = Fix((-Math.atan2(dz, dx) * 180) / Math.PI);
      for (let s = 0; s < count; s++) {
        const t = (s + 0.5) / count;
        idx++;
        ownObjects.push({
          id: `${prefix}_${String(idx).padStart(2, "0")}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
          pos: [Fix(ax + dx * t), null, Fix(az + dz * t)], size: [Fix(Math.min(4.2, dist / count - 0.4)), 0.78, 1.15],
          yawDeg: Fix(yawDeg + ((idx % 3) - 1) * 7), meta: { obstacle: "barbedWire" }, group: defG,
        });
      }
    }
  };

  // ① 封补原东北 45m 铁丝网/鹿砦缺口（x=176→228）+ 增设外道“人字折线”纵深铁丝网（将敌军导入东西机枪侧射杀伤袋；保留官道口 x=89..110 与九四式碾压缺口 x=113..119）
  AddWireLine("BshWireNE", [[178, 469], [204, 474], [228, 486]], 5.5);
  AddAbatisLine("AbatisNE", [[175, 474], [202, 479], [224, 490]], 6.0);
  AddWireLine("BshWireOuterW", [[32, 468], [58, 452], [87, 460]], 5.5);
  AddWireLine("BshWireOuterE", [[122, 456], [156, 447], [192, 456], [226, 472]], 5.5);
  // 九四式在 x=115 处碾塌的铁丝网残桩与压扁网带（不阻挡行进，视觉还原“九四式碾过铁丝网停在沟北沿”）
  ownObjects.push(
    { id: "BshWireTankCrush_1", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [115.0, null, 458.5], size: [4.2, 0.22, 1.4], yawDeg: 14, solid: false, meta: { obstacle: "barbedWire" }, group: defG },
    { id: "BshWireTankCrush_2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [113.2, null, 457.8], size: [0.95, 0.16, 0.16], yawDeg: 38, solid: false, group: defG },
    // 官道板桥北头两侧预备随时推上封路的可移动木拒马（避开 x=95..105 官道与驴车净空）
    { id: "RoadMouth_HedgehogW", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [93.0, null, 466.5], size: [2.1, 1.05, 1.05], yawDeg: 18, group: defG },
    { id: "RoadMouth_HedgehogE", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [106.8, null, 466.5], size: [2.1, 1.05, 1.05], yawDeg: -22, group: defG },
  );

  // ② 东西翼防侧包铁丝网与枣树枝鹿砦（东翼中街口 z=566..580 刻意呈现遭爆破剪开的突破口，完美解释 08c 日军东翼尖兵切入老耿家！）
  AddWireLine("BshWireEastN", [[231, 492], [235, 526], [233, 562]], 5.6);
  AddAbatisLine("AbatisEastN", [[228, 498], [231, 528], [229, 558]], 6.5);
  AddWireLine("BshWireEastS", [[233, 584], [231, 626], [232, 668]], 5.6);
  AddAbatisLine("AbatisEastS", [[229, 588], [227, 626], [228, 666]], 6.5);
  // 东翼中街突破口处被炸断/推开的残网与翻倒沙袋（严格避开 z=569..576 侧包通道）
  ownObjects.push(
    { id: "EastBreach_BrokenWireN", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [231.0, null, 565.2], size: [2.8, 0.35, 1.1], yawDeg: 42, solid: false, meta: { obstacle: "barbedWire" }, group: defG },
    { id: "EastBreach_BrokenWireS", asset: "Whitebox/Box", material: "Whitebox/Metal", pos: [231.5, null, 580.2], size: [2.8, 0.35, 1.1], yawDeg: -36, solid: false, meta: { obstacle: "barbedWire" }, group: defG },
    { id: "EastBreach_BagsN", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [222.5, null, 565.5], size: [2.2, 0.65, 0.8], yawDeg: 18, group: defG },
    { id: "EastBreach_BagsS", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [222.5, null, 579.8], size: [2.2, 0.65, 0.8], yawDeg: -14, group: defG },
  );
  // 西翼折回铁丝网与鹿砦（护卫西翼战壕与关帝庙西侧）
  AddWireLine("BshWireWestN", [[29, 488], [28, 524], [31, 562]], 5.6);
  AddAbatisLine("AbatisWestN", [[33, 496], [33, 526], [36, 558]], 6.5);
  AddWireLine("BshWireWestS", [[28, 592], [30, 634], [33, 668]], 5.6);
  AddAbatisLine("AbatisWestS", [[33, 596], [35, 634], [39, 666]], 6.5);

  // ③ 东西侧翼沙袋机枪窝 + 东南残桥警戒掩体 + 村北清扫射界伐木树桩 + 1936教范分散弹药/手榴弹龛 + 二线街口街垒
  ownObjects.push(
    // 东翼侧射机枪窝（[224.2, 526]，配胸墙/侧翼挡墙/踏脚台）
    { id: "BshFlankMgE_Front", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [225.4, null, 526.0], size: [0.85, 1.05, 3.6], yawDeg: -6, group: defG },
    { id: "BshFlankMgE_SideN", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [223.8, null, 524.2], size: [2.8, 0.95, 0.72], yawDeg: -6, group: defG },
    { id: "BshFlankMgE_Ammo", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [223.4, null, 527.2], size: [0.58, 0.32, 0.40], yawDeg: 12, group: defG },
    // 西翼侧射机枪窝（[39.0, 526]）
    { id: "BshFlankMgW_Front", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [38.2, null, 526.0], size: [0.85, 1.05, 3.6], yawDeg: 6, group: defG },
    { id: "BshFlankMgW_SideN", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [39.8, null, 524.2], size: [2.8, 0.95, 0.72], yawDeg: 6, group: defG },
    { id: "BshFlankMgW_Ammo", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [40.2, null, 527.2], size: [0.58, 0.32, 0.40], yawDeg: -15, group: defG },
    // 东南官道断桥俯控掩体（[219.5, 672] & [212.5, 718]）
    { id: "BshFlankPitSE_Front", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [223.6, null, 672.0], size: [0.85, 1.02, 3.4], yawDeg: 10, group: defG },
    { id: "BshSouthEast_Sandbags", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [213.5, null, 720.2], size: [3.6, 0.98, 0.75], yawDeg: -32, group: defG },
    // 1936 步兵工作教范分散配置：弹药龛与手榴弹龛土墙隔离（北线东西两翼）
    { id: "NorthNiche_AmmoW", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [66.5, null, 487.5], size: [0.62, 0.34, 0.42], yawDeg: 8, group: defG },
    { id: "NorthNiche_GrenadeW", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [70.2, null, 487.0], size: [0.48, 0.28, 0.34], yawDeg: -14, group: defG },
    { id: "NorthNiche_AmmoE", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [145.5, null, 480.8], size: [0.62, 0.34, 0.42], yawDeg: -6, group: defG },
    { id: "NorthNiche_GrenadeE", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [149.2, null, 481.2], size: [0.48, 0.28, 0.34], yawDeg: 16, group: defG },
    // 村北前沿二线墙后木制射击台（北排院墙构成第二道射界阶梯）
    { id: "NorthWallStep_1", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [81.0, null, 498.5], size: [3.4, 0.85, 0.85], group: defG },
    { id: "NorthWallStep_2", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [125.0, null, 502.8], size: [3.4, 0.85, 0.85], group: defG },
    { id: "NorthWallStep_3", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [152.0, null, 501.8], size: [3.4, 0.85, 0.85], group: defG },
    { id: "NorthWallStep_4", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [189.0, null, 501.5], size: [3.4, 0.85, 0.85], group: defG },
    // 村内纵深二线街口枕木沙袋半街垒（贴街肩摆设，留足驴车与全员通行净宽，0 穿墙！）
    { id: "InnerBarricade_NorthMain", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [108.5, null, 510.2], size: [2.4, 0.96, 0.72], yawDeg: -18, group: defG },
    { id: "InnerBarricade_NorthMainLog", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [108.5, Fix(HeightAtOwn(108.5, 510.2) + 0.92), 510.2], size: [2.3, 0.16, 0.34], yawDeg: -18, solid: false, group: defG },
    { id: "InnerBarricade_SouthMain", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [178.4, null, 675.2], size: [2.6, 0.98, 0.72], yawDeg: 14, group: defG },
    { id: "InnerBarricade_MidEastN", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [212.0, null, 567.8], size: [2.4, 0.85, 0.78], yawDeg: 12, group: defG },
    { id: "InnerBarricade_MidEastS", asset: "Whitebox/Box", material: "Whitebox/Canvas", pos: [212.0, null, 576.6], size: [2.4, 0.88, 0.78], yawDeg: -10, group: defG },
  );
  // 村北清扫射界留下的新鲜伐木树桩（解释沟沿枣树枝鹿砦来源）
  for (const [idx, x, z] of [
    [1, 56, 446], [2, 74, 438], [3, 120, 444], [4, 152, 436], [5, 178, 448], [6, 204, 456], [7, 42, 458],
  ]) {
    ownObjects.push({
      id: `FelledStump_${idx}`, asset: "Whitebox/Box", material: "Whitebox/Timber",
      pos: [x, null, z], size: [0.46, 0.52, 0.46], yawDeg: (idx * 23) % 60, group: defG,
    });
  }

  const blockG = "08–13合并/动线引导路障";
  for (const [id, x, z, w, h, d, mat, yaw, extra = {}] of [
    ["NorthWestAbatis", 61.5, 424.0, 1.2, 0.95, 11.0, "Whitebox/Timber", 6, { meta: { obstacle: "barbedWire" } }],
    ["NorthEastAbatis", 152.5, 424.0, 1.2, 0.95, 11.0, "Whitebox/Timber", -8, { meta: { obstacle: "barbedWire" } }],
    ["WestEdgeCart", 24.5, 546.5, 2.8, 1.15, 1.6, "Whitebox/Timber", 78],
    ["WestEdgeRubble", 20.0, 646.0, 1.6, 1.15, 6.2, "Whitebox/EarthDark", 14],
    ["EastEdgeRubbleS", 231.5, 642.0, 1.8, 1.20, 6.8, "Whitebox/EarthDark", 12],
    ["NorthBankSteepWire", -52.0, 827.0, 9.5, 0.85, 1.0, "Whitebox/Metal", -8, { meta: { obstacle: "barbedWire" } }],
    ["SouthBankEastWire", -42.5, 892.0, 1.1, 0.85, 9.0, "Whitebox/Metal", 6, { meta: { obstacle: "barbedWire" } }],
  ]) {
    ownObjects.push({
      id: `Merged_GuideBlock_${id}`, asset: "Whitebox/Box", material: mat,
      pos: [x, null, z], size: [w, h, d], yawDeg: yaw, group: blockG, ...extra,
    });
  }
  const AddAirWallChain = (prefix, pts) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      const yawDeg = Fix((-Math.atan2(dz, dx) * 180) / Math.PI);
      ownObjects.push({
        id: `Merged_KeepIn_${prefix}_${String(i).padStart(2, "0")}`,
        asset: "Whitebox/Box",
        material: "Whitebox/AirWall",
        pos: [Fix((ax + bx) / 2), null, Fix((az + bz) / 2)],
        size: [Fix(len + 0.35), 6.0, 0.4],
        yawDeg,
        visual: false,
        tag: "airWall",
        group: "08–13合并/空气墙",
      });
    }
  };
  const KEEP_IN_WEST = [
    [62, 355], [62, 435], [46, 466], [22, 496], [16, 610], [16, 706],
    [-60, 728], [-62, 764], [-86, 782], [-106, 794], [-106, 822],
    [-82.2, 825], [-82.2, 874], [-102, 876], [-102, 916], [-86, 956], [-78, 968],
  ];
  const KEEP_IN_EAST = [
    [152, 355], [152, 435], [198, 468], [234, 492], [235, 560], [233, 635], [230, 704],
    [194, 748], [132, 774], [68, 800], [-4, 818], [-54, 828],
    [-77.8, 828], [-77.8, 874], [-42, 876], [-40, 910], [-38, 968],
  ];
  AddAirWallChain("W", KEEP_IN_WEST);
  AddAirWallChain("E", KEEP_IN_EAST);
  AddAirWallChain("S", [[-78, 968], [-38, 968]]);

  // 15D) 场景级先期轰炸烟柱与阴燃火光（实机与遭遇编辑器 3D/2D 同步可见）
  const ownSmokeColumns = [
    {
      x: 150.0, z: 493.0, heightOffset: 0.4,
      options: {
        kind: "black", rate: 5.8, fire: 0.92, radius: 1.25, rise: 1.35, sizeStart: 1.9, sizeEnd: 8.6,
        life: 9.2, opacity: 0.072, turbulence: 0.62, lightIntensity: 5.2, lightRadius: 9.0, prewarm: true,
        wind: { x: -0.62, z: 0.28 }, colorA: [0.068, 0.062, 0.058], colorB: [0.12, 0.112, 0.106],
      },
    },
    {
      x: 64.0, z: 492.0, heightOffset: 0.35,
      options: {
        kind: "black", rate: 4.8, fire: 0.72, radius: 1.05, rise: 1.15, sizeStart: 1.6, sizeEnd: 7.2,
        life: 8.5, opacity: 0.064, turbulence: 0.55, lightIntensity: 4.0, lightRadius: 7.5, prewarm: true,
        wind: { x: -0.58, z: 0.24 }, colorA: [0.075, 0.068, 0.064], colorB: [0.135, 0.126, 0.118],
      },
    },
    {
      x: 216.0, z: 546.0, heightOffset: 0.45,
      options: {
        kind: "black", rate: 5.4, fire: 0.85, radius: 1.18, rise: 1.28, sizeStart: 1.8, sizeEnd: 8.2,
        life: 9.0, opacity: 0.068, turbulence: 0.60, lightIntensity: 4.6, lightRadius: 8.5, prewarm: true,
        wind: { x: -0.64, z: 0.26 }, colorA: [0.066, 0.060, 0.056], colorB: [0.118, 0.110, 0.104],
      },
    },
    {
      x: 153.4, z: 595.2, heightOffset: 0.55,
      options: {
        kind: "black", rate: 4.4, fire: 0.55, radius: 1.1, rise: 1.05, sizeStart: 1.7, sizeEnd: 6.8,
        life: 8.2, opacity: 0.058, turbulence: 0.52, lightIntensity: 3.2, lightRadius: 6.5, prewarm: true,
        wind: { x: -0.55, z: 0.25 }, colorA: [0.082, 0.076, 0.072], colorB: [0.145, 0.136, 0.128],
      },
    },
    {
      x: 136.0, z: 656.0, heightOffset: 0.35,
      options: {
        kind: "black", rate: 3.6, fire: 0, radius: 1.0, rise: 0.95, sizeStart: 1.4, sizeEnd: 6.0,
        life: 7.8, opacity: 0.052, turbulence: 0.48, prewarm: true,
        wind: { x: -0.52, z: 0.22 }, colorA: [0.105, 0.098, 0.092], colorB: [0.175, 0.165, 0.156],
      },
    },
    {
      x: 88.5, z: 769.0, heightOffset: 2.2,
      options: {
        kind: "black", rate: 3.2, fire: 0.35, radius: 0.85, rise: 0.92, sizeStart: 1.2, sizeEnd: 5.4,
        life: 7.5, opacity: 0.050, turbulence: 0.45, lightIntensity: 2.2, lightRadius: 5.0, prewarm: true,
        wind: { x: -0.56, z: 0.24 }, colorA: [0.095, 0.088, 0.082], colorB: [0.165, 0.155, 0.146],
      },
    },
    {
      x: 128.0, z: 452.0, heightOffset: 0.25,
      options: {
        kind: "dust", rate: 4.5, fire: 0, radius: 1.4, rise: 0.65, sizeStart: 1.5, sizeEnd: 5.2,
        life: 6.8, opacity: 0.055, turbulence: 0.35, prewarm: true,
        wind: { x: -0.45, z: 0.20 }, colorA: [0.18, 0.165, 0.148], colorB: [0.27, 0.248, 0.225],
      },
    },
  ];

  // Shift Beishahe trenches & add 1938 NRA horseshoe flank wing trenches + rear communication trenches
  const MakeDefenseTrench = (id, points, opts = {}) => {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const depth = opts.depth ?? 1.15;
    return {
      id,
      preset: opts.preset || "fire",
      points,
      group: "08–13合并/壕沟",
      note: opts.note || "七二七团二营村落环形侧翼防御战壕",
      depthAlong: [[0, depth], [Number(total.toFixed(1)), depth]],
      floorW: opts.floorW ?? 1.0,
      bankW: 0.35,
      bermH: opts.bermH ?? 0.35,
      bermW: opts.bermW ?? 0.9,
      bermSide: opts.bermSide || "minus",
      cornerRadiusM: 0,
      jitterScale: 0,
      look: "scrape",
    };
  };
  const ownSegments = [
    ...(baseDoc.trenches?.segments || [])
      .filter((seg) => seg.points.every((pt) => pt[1] >= SOURCE_START_Z))
      .map((seg) => {
        const south = seg.points.every((pt) => (pt[1] + DELTA_Z) >= SPLIT_Z);
        return {
          ...seg,
          group: seg.group?.replace(/^11–18\//, "08–13合并/") || seg.group,
          points: seg.points.map((pt) => [pt[0], MapZ(pt[1], south)]),
        };
      }),
    // 西翼折回防侧包战壕（南北两段，堆土朝西 bermSide:"plus"）
    MakeDefenseTrench("VillageWestFlankN", [[36, 493], [40, 524], [43, 556]], {
      bermSide: "plus", note: "二营西翼折回战壕北段（接西翼机枪窝护右翼防铁路侧包）",
    }),
    MakeDefenseTrench("VillageWestFlankS", [[39, 594], [42, 634], [46, 668]], {
      bermSide: "plus", note: "二营西翼折回战壕南段（俯控村西菜园与排水干沟）",
    }),
    // 东翼折回防侧包战壕（中街 z=564..582 处留未合拢/遭突破缺口，呼应 08c 日军侧包；堆土朝东 bermSide:"minus"）
    MakeDefenseTrench("VillageEastFlankN", [[218, 495], [224, 524], [223, 558]], {
      bermSide: "minus", note: "二营东翼折回战壕北段（接东北土炮楼与东翼机枪窝）",
    }),
    MakeDefenseTrench("VillageEastFlankS", [[223, 586], [221, 624], [222, 666]], {
      bermSide: "minus", note: "二营东翼折回战壕南段（守村东田野与东南方向）",
    }),
    // 东南官道断桥警戒壕（堆土朝东南 bermSide:"plus"）
    MakeDefenseTrench("VillageSouthEastGuard", [[198, 728], [214, 718], [222, 702]], {
      bermSide: "plus", depth: 1.05, note: "二营东南官道断桥警戒壕",
    }),
    // 村北前沿往村内延伸的 2 条短联络交通壕（两侧堆土防破片，掩护弹药手与传令兵）
    MakeDefenseTrench("VillageCommW", [[72, 484], [73, 494]], {
      preset: "communication", bermSide: "both", floorW: 0.9, depth: 1.15, bermH: 0.25, note: "北西前沿往村内后方联络壕",
    }),
    MakeDefenseTrench("VillageCommE", [[175, 481], [176, 496]], {
      preset: "communication", bermSide: "both", floorW: 0.9, depth: 1.15, bermH: 0.25, note: "北东前沿往王家坑与村内联络壕",
    }),
  ];

  // Shift Beishahe paint & rebuild organic scalloped S2 village contour + street & ditch paint
  const InSouth = (pts) => pts?.every((pt) => (Array.isArray(pt) ? pt[1] : pt.z) >= SOURCE_START_Z);
  const REBUILT_PAINT_IDS = new Set([
    "Village", "ThreshingFloor", "Road_MainStreet", "Road_NorthStreet",
    "Road_MidStreet", "Road_SouthStreet", "Road_WestLane", "Road_ExitPath",
  ]);
  const ShiftPaintEntry = (entry) => {
    const pts = entry.poly || entry.line || [];
    const avgZ = pts.length ? pts.reduce((a, p) => a + (Array.isArray(p) ? p[1] : p.z), 0) / pts.length : 0;
    const south = (avgZ + DELTA_Z) >= SPLIT_Z;
    const shifted = {
      ...entry,
      ...(entry.poly ? { poly: entry.poly.map((p) => ShiftPoint(p, south)) } : {}),
      ...(entry.line ? { line: entry.line.map((p) => ShiftPoint(p, south)) } : {}),
    };
    if (/^Garden_/.test(entry.id || "")) {
      shifted.color = "#86966a";
      shifted.strength = 0.45;
    } else if (entry.id === "Lizihang") {
      shifted.color = "#c6b99c";
      shifted.feather = 2.6;
    } else if (/^Road_|^GateYard$/.test(entry.id || "")) {
      shifted.color = "#e3dac2";
    }
    return shifted;
  };
  const ownPaint = (baseDoc.paint || [])
    .filter((e) => InSouth(e.poly || e.line) && !/^Wheat_/.test(e.id || "") && !REBUILT_PAINT_IDS.has(e.id || ""))
    .map(ShiftPaintEntry);

  const mainStreetPts = [
    { x: 99, z: 475 }, { x: 114, z: 520 }, { x: 140, z: 560 }, { x: 170, z: 600 },
    { x: 174, z: 638 }, { x: 172, z: 680 }, { x: 205, z: 720 }, { x: 240, z: 756 }, { x: 246, z: 754 },
  ];
  const northStreetPts = [
    { x: 52, z: 514 }, { x: 74, z: 517 }, { x: 90, z: 516 }, { x: 114, z: 520 },
    { x: 145, z: 521 }, { x: 175, z: 518 }, { x: 208, z: 522 }, { x: 218, z: 525 },
  ];
  const midStreetPts = [
    { x: 54, z: 560 }, { x: 84, z: 561 }, { x: 122, z: 558 },
    { x: 140, z: 560 }, { x: 157, z: 564 }, { x: 185, z: 569 }, { x: 218, z: 572 },
  ];
  const eastFlankTrackPts = [
    { x: 218, z: 572 }, { x: 238, z: 571 }, { x: 256, z: 573 },
  ];
  const southMidStreetPts = [
    { x: 74, z: 635 }, { x: 84, z: 636 }, { x: 105, z: 634 }, { x: 121, z: 637 }, { x: 136, z: 634 },
  ];
  const southMidEastAlleyPts = [
    { x: 174, z: 638 }, { x: 196, z: 636 }, { x: 209, z: 642 },
  ];
  const southStreetPts = [
    { x: 58, z: 692 }, { x: 84, z: 688 }, { x: 121, z: 693 },
    { x: 146, z: 687 }, { x: 172, z: 680 }, { x: 204, z: 678 }, { x: 216, z: 684 },
  ];
  const westLanePts = [
    { x: 90, z: 516 }, { x: 86, z: 538 }, { x: 84, z: 561 }, { x: 80, z: 586 },
    { x: 84, z: 608 }, { x: 84, z: 636 }, { x: 84, z: 688 },
  ];
  const exitPathPts = [
    { x: 121, z: 613 }, { x: 121, z: 637 }, { x: 121, z: 693 }, { x: 121, z: 732 }, { x: 121, z: 755 },
  ];

  ownPaint.unshift(
    {
      // S2 史料规模犬牙凹凸自然村界（与东西农田片区锯齿咬合，柔化边缘过渡 feather=5.5，彻底打破直线框！）
      id: "Village",
      poly: [
        { x: 47, z: 502 }, { x: 64, z: 486 }, { x: 104, z: 484 }, { x: 158, z: 480 }, { x: 208, z: 482 }, { x: 228, z: 498 },
        { x: 216, z: 518 }, { x: 209, z: 544 }, { x: 220, z: 566 }, { x: 224, z: 588 }, { x: 214, z: 624 },
        { x: 207, z: 648 }, { x: 214, z: 668 }, { x: 222, z: 692 }, { x: 216, z: 726 },
        { x: 194, z: 738 }, { x: 162, z: 754 }, { x: 124, z: 760 }, { x: 92, z: 774 }, { x: 52, z: 772 },
        { x: 56, z: 748 }, { x: 48, z: 728 }, { x: 38, z: 704 }, { x: 52, z: 682 }, { x: 61, z: 658 },
        { x: 54, z: 624 }, { x: 44, z: 594 }, { x: 52, z: 566 }, { x: 62, z: 548 }, { x: 53, z: 526 },
      ],
      feather: 5.5, color: "#c6b99c",
    },
    // 村缘不规则菜园/土场过渡带（骑在村界凹凸口上，使村与田自然渗透）
    { id: "VillageFringe_W1", poly: [{ x: 46, z: 536 }, { x: 64, z: 538 }, { x: 62, z: 556 }, { x: 44, z: 552 }], feather: 2.4, color: "#809362", strength: 0.56 },
    { id: "VillageFringe_W2", poly: [{ x: 40, z: 580 }, { x: 54, z: 582 }, { x: 52, z: 604 }, { x: 38, z: 598 }], feather: 2.2, color: "#cfc2a2", strength: 0.62 },
    { id: "VillageFringe_W3", poly: [{ x: 48, z: 644 }, { x: 76, z: 648 }, { x: 74, z: 666 }, { x: 46, z: 660 }], feather: 2.4, color: "#7c8f5f", strength: 0.58 },
    { id: "VillageFringe_E1", poly: [{ x: 204, z: 532 }, { x: 222, z: 536 }, { x: 218, z: 556 }, { x: 202, z: 552 }], feather: 2.4, color: "#7f9262", strength: 0.56 },
    { id: "VillageFringe_E2", poly: [{ x: 202, z: 636 }, { x: 220, z: 642 }, { x: 218, z: 662 }, { x: 200, z: 656 }], feather: 2.4, color: "#819364", strength: 0.54 },
    ...bombScorchPaint,
    {
      id: "ThreshingFloor",
      poly: [
        { x: 97, z: 540 }, { x: 100, z: 533 }, { x: 106, z: 532 }, { x: 113, z: 533 },
        { x: 115, z: 540 }, { x: 113, z: 546 }, { x: 106, z: 547 }, { x: 100, z: 546 },
      ],
      feather: 2.0, color: "#d8cb9f",
    },
    // 村心菜园与打麦小场（打破 +80m 中段僵直）
    {
      id: "Village_InnerGardenW",
      poly: [{ x: 58, z: 648 }, { x: 78, z: 648 }, { x: 78, z: 664 }, { x: 58, z: 664 }],
      feather: 1.4, color: "#7f9262", strength: 0.62,
    },
    {
      id: "Village_InnerGardenMid",
      poly: [{ x: 124, z: 642 }, { x: 137, z: 640 }, { x: 138, z: 662 }, { x: 125, z: 662 }],
      feather: 1.4, color: "#d4c79c", strength: 0.58,
    },
    {
      id: "RailSecYard_Base",
      poly: [{ x: -106, z: 797 }, { x: -87, z: 797 }, { x: -87, z: 817 }, { x: -106, z: 817 }],
      feather: 1.8, color: "#bdb197", strength: 0.78,
    },
    {
      id: "BridgeSouthHamlet_Base",
      poly: [{ x: -46, z: 910 }, { x: -9, z: 910 }, { x: -9, z: 958 }, { x: -46, z: 958 }],
      feather: 2.6, color: "#c6b99c", strength: 0.85,
    },
    // G4 农田干沟底深土涂色（凸显干沟立体走线；村路与田间小路改由 ways.roadRibbons 样条管线生成，不再用平色涂抹）
    { id: "FieldDitch_West", line: WestFieldDitchPts.map(([x, z]) => ({ x, z })), halfW: 1.15, feather: 0.55, color: "#9b8768", strength: 0.72 },
    { id: "FieldDitch_NorthBank", line: NorthBankDitchPts.map(([x, z]) => ({ x, z })), halfW: 0.90, feather: 0.45, color: "#9b8768", strength: 0.68 },
    { id: "FieldDitch_EastN", line: EastFieldDitchNPts.map(([x, z]) => ({ x, z })), halfW: 1.05, feather: 0.50, color: "#9b8768", strength: 0.70 },
    { id: "FieldDitch_EastS", line: EastFieldDitchSPts.map(([x, z]) => ({ x, z })), halfW: 1.05, feather: 0.50, color: "#9b8768", strength: 0.70 },
  );

  // Build updated ways.roads & typed spline roadRibbons (Script_RoadPath / Script_RoadSpline)
  const ToPairs = (pts) => pts.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]));
  const southBaseRoads = (baseDoc.ways?.roads || [])
    .filter((line) => line.every((pt) => ((pt.z ?? pt[1]) + DELTA_Z) >= 665))
    .map((line) => line.map((pt) => ShiftPoint(pt, true)));
  const ownRoads = [
    [{ x: 98.5, z: 344 }, { x: 99, z: 355 }, { x: 103, z: 392 }, { x: 103.5, z: 418 }, { x: 102, z: 440 }, { x: 99, z: 467 }],
    [{ x: 99, z: 467 }, { x: 99, z: 475 }],
    mainStreetPts,
    northStreetPts,
    midStreetPts,
    eastFlankTrackPts,
    southMidStreetPts,
    southStreetPts,
    westLanePts,
    exitPathPts,
    [{ x: 145, z: 521 }, { x: 152, z: 540 }, { x: 157, z: 564 }],
    [{ x: 185, z: 569 }, { x: 190, z: 586 }, { x: 188, z: 601 }],
    [{ x: 175, z: 518 }, { x: 178, z: 498 }],
    [{ x: 84, z: 561 }, { x: 68, z: 544 }],
    ...southBaseRoads,
  ];
  const ownRoadRibbons = [
    // Tier 1: 官道 / 村主街（宽 4.2–4.8 m，双车辙 + 路肩，在村口防坦克沟 z=471..479 处自然断开）
    { id: "MergedConnectRoad", kind: "guandao", width: 4.8, widthJitter: 0.06,
      points: [[98.5, 344], [99, 358], [103, 392], [103.5, 418], [102, 442], [99.2, 470.5]] },
    { id: "Road_MainStreet", kind: "guandao", width: 4.3, widthJitter: 0.05,
      points: [[99.5, 479], [106, 498], [114, 520], [140, 560], [170, 600], [174, 638], [172, 680], [205, 720], [238, 754]] },
    ...southBaseRoads.map((line, i) => ({
      id: `Road_SouthBank_${i}`, kind: "guandao", width: 4.0, widthJitter: 0.06, points: ToPairs(line),
    })),
    // Tier 2: 村内主横街（宽 2.5–3.1 m，单车/独轮车压痕）
    { id: "Road_NorthStreet", kind: "villageStreet", width: 2.6, widthJitter: 0.05, points: ToPairs(northStreetPts) },
    { id: "Road_MidStreet", kind: "villageStreet", width: 3.0, widthJitter: 0.05, points: ToPairs(midStreetPts) },
    { id: "Road_SouthStreet", kind: "villageStreet", width: 2.8, widthJitter: 0.05, points: ToPairs(southStreetPts) },
    { id: "Road_ExitPath", kind: "villageStreet", width: 2.6, widthJitter: 0.05, points: ToPairs(exitPathPts) },
    // Tier 3: 村内密巷 / 东出田土路（宽 1.7–2.1 m）
    { id: "Road_WestLane", kind: "villageAlley", width: 2.0, widthJitter: 0.06, points: ToPairs(westLanePts) },
    { id: "Road_SouthMidStreet", kind: "villageAlley", width: 1.9, widthJitter: 0.06, points: ToPairs(southMidStreetPts) },
    { id: "Road_SouthMidEastAlley", kind: "villageAlley", width: 1.8, widthJitter: 0.06, points: ToPairs(southMidEastAlleyPts) },
    { id: "Road_EastFlankTrack", kind: "villageAlley", width: 2.1, widthJitter: 0.08, points: ToPairs(eastFlankTrackPts) },
    { id: "Road_InnerLink1", kind: "villageAlley", width: 1.8, widthJitter: 0.06, points: [[145, 521], [152, 540], [157, 564]] },
    { id: "Road_InnerLink2", kind: "villageAlley", width: 1.8, widthJitter: 0.06, points: [[185, 569], [190, 586], [188, 601]] },
    { id: "Road_InnerLink3", kind: "villageAlley", width: 1.8, widthJitter: 0.06, points: [[175, 518], [178, 498]] },
    { id: "Road_InnerLink4", kind: "villageAlley", width: 1.8, widthJitter: 0.06, points: [[84, 561], [68, 544]] },
    // Tier 4: 田间曲折毛细小路（宽 0.95–1.15 m，高有机摆动，贴合农田条块与村缘菜园）
    { id: "Footpath_WestNW", kind: "footpath", width: 1.05, widthJitter: 0.14, points: [[10, 355], [2, 412], [-8, 462], [20, 492], [44, 508], [58, 518]] },
    { id: "Footpath_WestMid", kind: "footpath", width: 1.05, widthJitter: 0.14, points: [[-74, 540], [-38, 549], [-8, 543], [22, 552], [48, 544], [62, 556]] },
    { id: "Footpath_WestSW", kind: "footpath", width: 1.05, widthJitter: 0.14, points: [[56, 634], [38, 650], [12, 654], [-14, 669], [-40, 687], [-74, 696]] },
    { id: "Footpath_WestSpine", kind: "footpath", width: 1.0, widthJitter: 0.14, points: [[-12, 546], [-18, 610], [-22, 676], [-34, 732], [-46, 772]] },
    { id: "Footpath_NorthBank", kind: "footpath", width: 1.1, widthJitter: 0.13, points: [[50, 766], [26, 768], [6, 784], [-20, 798], [-48, 801], [-74, 790]] },
    { id: "Footpath_NorthEastIn", kind: "footpath", width: 1.0, widthJitter: 0.14, points: [[148, 355], [158, 414], [176, 466]] },
    { id: "Footpath_EastOuter", kind: "footpath", width: 1.15, widthJitter: 0.14, points: [[212, 355], [226, 424], [224, 480], [234, 522], [246, 566], [286, 572], [316, 574]] },
    { id: "Footpath_EastSouth", kind: "footpath", width: 1.05, widthJitter: 0.14, points: [[246, 566], [254, 628], [240, 684], [220, 706], [204, 718]] },
    { id: "Footpath_EastGrove", kind: "footpath", width: 1.0, widthJitter: 0.14, points: [[212, 538], [234, 526], [272, 522], [314, 526]] },
    { id: "Footpath_SouthHamlet", kind: "footpath", width: 1.1, widthJitter: 0.13, points: [[-58, 922], [-42, 924], [-14, 932], [28, 938], [88, 928]] },
    { id: "Footpath_SouthWestRail", kind: "footpath", width: 1.05, widthJitter: 0.13, points: [[-118, 888], [-116, 932], [-96, 972]] },
  ];
  // 烘入轻微的样条道路横断面微地形（官道双车辙与路肩微隆、村街/小路踩实微凹；避开河道/坑塘/干沟/弹坑低洼处）
  for (const r of ownRoadRibbons) {
    if (!r.points || r.points.length < 2) continue;
    const roadPath = MakeRoadPath(r.points);
    const samples = SampleRun(roadPath, 0, roadPath.length, 1.5);
    const halfW = (r.width || 2.5) * 0.5;
    const pad = halfW * 1.35 + 0.6;
    for (let k = 0; k < samples.length - 1; k++) {
      const a = samples[k], b = samples[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z, segLen = Math.hypot(dx, dz);
      if (segLen < 1e-4) continue;
      const tx = dx / segLen, tz = dz / segLen;
      const nx = tz, nz = -tx;
      const gx0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - minX) / cellM));
      const gx1 = Math.min(cols, Math.ceil((Math.max(a.x, b.x) + pad - minX) / cellM));
      const gz0 = Math.max(4, Math.floor((Math.min(a.z, b.z) - pad - INHERIT_MAX_Z) / cellM));
      const gz1 = Math.min(outRows, Math.ceil((Math.max(a.z, b.z) + pad - INHERIT_MAX_Z) / cellM));
      for (let gz = gz0; gz <= gz1; gz++) {
        const z = INHERIT_MAX_Z + gz * cellM;
        const seamFade = Math.min(1, Math.max(0, (z - (INHERIT_MAX_Z + 2)) / 5));
        if (seamFade <= 0) continue;
        for (let gx = gx0; gx <= gx1; gx++) {
          const x = minX + gx * cellM;
          const idx = gz * (cols + 1) + gx;
          if (ownHeights[idx] <= -0.9) continue; // 不干扰河床/干沟/坑塘/弹坑
          const rx = x - a.x, rz = z - a.z;
          const proj = rx * tx + rz * tz;
          if (proj < -0.25 || proj > segLen + 0.25) continue;
          const lat = Math.abs(rx * nx + rz * nz);
          const t = lat / halfW;
          if (t > 1.35) continue;
          let delta = 0;
          if (r.kind === "guandao") {
            const rut = Math.exp(-Math.pow((t - 0.52) / 0.16, 2));
            const crown = Math.exp(-Math.pow(t / 0.28, 2));
            const shoulder = Math.exp(-Math.pow((t - 1.02) / 0.20, 2));
            delta = -0.045 * rut + 0.02 * crown + 0.03 * shoulder;
          } else if (r.kind === "villageStreet") {
            const wear = Math.exp(-Math.pow(t / 0.45, 2));
            const shoulder = Math.exp(-Math.pow((t - 1.0) / 0.22, 2));
            delta = -0.028 * wear + 0.015 * shoulder;
          } else {
            delta = -0.02 * Math.exp(-Math.pow(t / 0.55, 2));
          }
          ownHeights[idx] = Fix(ownHeights[idx] + delta * 0.5 * seamFade);
        }
      }
    }
  }
  const ownWayTrenches = (baseDoc.ways?.trenches || [])
    .filter((line) => line.every((pt) => (pt.z ?? pt[1]) >= SOURCE_START_Z))
    .map((line) => {
      const south = line.every((pt) => ((pt.z ?? pt[1]) + DELTA_Z) >= SPLIT_Z);
      return line.map((pt) => ShiftPoint(pt, south));
    });

  const ownMarkers = [
    ...(baseDoc.markers || [])
      .filter((m) => m.z >= SOURCE_START_Z)
      .map((m) => {
        if (m.id === "LmVillage") {
          return {
            ...m, x: 136, z: 622, w: 176, d: 266,
            note: "1938 北沙河村（约百余户五百余口；实际建成区 ~3.3 ha，官道斜穿主街与宗族共墙密巷、坑塘菜园交织）",
          };
        }
        if (m.id === "LmThreshing") return { ...m, x: 106, z: 540, w: 17, d: 15 };
        if (m.id === "LmSouthStreet") return { ...m, x: 108, z: 690 };
        if (m.id === "LmSouthStreetCorner") return { ...m, x: 172, z: 680 };
        if (m.id === "LmExitPath") return { ...m, x: 121, z: 744 };
        const forceSouth = m.id === "LmWell_3" ? true : null;
        return { ...m, z: MapZ(m.z, forceSouth) };
      }),
    { id: "LmMergedSouthMidStreet", name: "南中街（民居密巷）", x: 142.0, z: 636.0, kind: "place" },
    { id: "LmMergedMidPond", name: "村心南坑塘", x: 146.0, z: 643.0, kind: "place" },
    { id: "LmMergedTemple", name: "关帝庙（兼村塾）", x: 80.3, z: 526.5, kind: "place" },
    { id: "LmMergedRoadShrine", name: "小土地庙", x: 109.0, z: 418.0, kind: "place" },
    { id: "LmMergedWatchTower", name: "土炮楼", x: 220.0, z: 496.0, kind: "place" },
    { id: "LmMergedWestFlank", name: "二营西翼折回阵地", x: 40.0, z: 530.0, kind: "place" },
    { id: "LmMergedEastFlank", name: "二营东翼折回阵地", x: 223.0, z: 530.0, kind: "place" },
    { id: "LmMergedBigLocust", name: "大槐树", x: 132.5, z: 551.5, kind: "place" },
    { id: "LmMergedMill", name: "石碾", x: 128.0, z: 553.0, kind: "place" },
    { id: "LmMergedGengYard", name: "老耿家（中街西头）", x: 131.6, z: 569.5, kind: "place" },
    { id: "LmMergedSideGate", name: "夹壁便门", x: 125.1, z: 564.8, kind: "place" },
    { id: "LmMergedEastKiln", name: "村东砖窑", x: 246.0, z: 558.0, kind: "place" },
    { id: "LmMergedWestKiln", name: "北岸砖窑", x: -48.0, z: 740.0, kind: "place" },
    { id: "LmMergedGengWestGrove", name: "耿家西林", x: -38.0, z: 622.0, kind: "place" },
    { id: "LmMergedWangEastGrove", name: "王家东林", x: 278.0, z: 526.0, kind: "place" },
    { id: "LmMergedRailSecHouse", name: "德式巡道房", x: -96.0, z: 808.0, kind: "place" },
    { id: "LmMergedSemaphore", name: "臂板信号机", x: -87.5, z: 820.0, kind: "place" },
    { id: "LmMergedDetonationPost", name: "工兵起爆所", x: -85.5, z: 877.5, kind: "place" },
    { id: "LmMergedWoundedAlcove", name: "堤后伤员避弹窝", x: -93.5, z: 885.0, kind: "place" },
    { id: "LmMergedSouthHamlet", name: "桥南小庄", x: -27.0, z: 932.0, kind: "place" },
  ];

  const maxZ = INHERIT_MAX_Z + outRows * cellM; // 990
  const mergedDoc = {
    schema: "tengxian-scene/1",
    id: "FirstLevelMerged",
    title: "第一关 · 北沙河单村合并版",
    inherit: { scene: "FirstLevelEncounter", maxZ: INHERIT_MAX_Z },
    source: {
      inheritedNorthFrom: "FirstLevelEncounter",
      inheritMaxZ: INHERIT_MAX_Z,
      beishaheShiftZ: DELTA_Z,
      villageExpandZ: EXPAND_Z,
      villageSplitZ: SPLIT_Z,
      builder: "Taierzhuang1938/_import/Script_BuildFirstLevelMergedScene.mjs",
    },
    bounds: { minX: -160, maxX: 320, minZ: INHERIT_MAX_Z, maxZ },
    spawn: { x: 98.5, z: 356, yawDeg: 180 },
    terrain: {
      file: "Scene_FirstLevelMerged.height.bin",
      encoding: "int16-cm-le",
      minX, minZ: INHERIT_MAX_Z, cellM, cols, rows: outRows,
    },
    look: baseDoc.look,
    backdrop: {
      ...baseDoc.backdrop,
      siteBounds: { minX: -160, maxX: 320, minZ: -480, maxZ },
      paint: (baseDoc.backdrop?.paint || []).filter((e) => InSouth(e.poly || e.line)).map(ShiftPaintEntry),
    },
    paint: ownPaint,
    ways: { roads: ownRoads, roadRibbons: ownRoadRibbons, trenches: ownWayTrenches },
    trenches: {
      seed: baseDoc.trenches.seed,
      earthProfile: baseDoc.trenches.earthProfile,
      datum: {
        file: "Scene_FirstLevelMerged.trench.bin",
        encoding: "int16-cm-le",
        patches: ownDatum.map(({ minX: px, minZ: pz, cellM: pc, cols: pCols, rows: pRows }) => ({
          minX: px, minZ: pz, cellM: pc, cols: pCols, rows: pRows,
        })),
      },
      segments: ownSegments,
    },
    markers: ownMarkers,
    smokeColumns: ownSmokeColumns,
    objects: ownObjects,
  };

  const check = ValidateScene(mergedDoc);
  if (!check.ok) throw new Error(`FirstLevelMerged 校验未通过：\n${check.errors.join("\n")}`);

  const resolved = ResolveInheritedScene(mergedDoc, ownHeights, ownDatum, {
    doc: baseDoc, heights: baseHeights, datum: baseDatum,
  });
  const resolvedCheck = ValidateScene(resolved.doc);
  if (!resolvedCheck.ok) throw new Error(`合成后场景校验未通过：\n${resolvedCheck.errors.join("\n")}`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "Scene_FirstLevelMerged.json"), FormatSceneJson(mergedDoc), "utf8");
  fs.writeFileSync(path.join(outDir, "Scene_FirstLevelMerged.height.bin"), EncodeSceneHeights(ownHeights));
  fs.writeFileSync(path.join(outDir, "Scene_FirstLevelMerged.trench.bin"), EncodeTrenchDatum(ownDatum));

  const envDoc = {
    schema: "tengxian-env-scene/1",
    scene: "FirstLevelMerged",
    time: { hour: 12, speed: 0.1, paused: true },
    volumes: [
      { id: "Fallback", name: "兜底（全场）", shape: "global", priority: 0, blendS: 0, mode: "full", preset: "FirstLevelEncounter" },
      {
        id: "BeishaheDusk",
        name: "北沙河黄昏（田嫂家出村 z720 起转落日向西赶桥）",
        shape: "box",
        center: [80, 0, 855],
        size: [520, 400, 270],
        priority: 10,
        blendS: 20,
        mode: "full",
        preset: "FirstLevelEncounterDusk",
      },
    ],
  };
  fs.writeFileSync(path.join(outDir, "Environment_FirstLevelMerged.json"), JSON.stringify(envDoc, null, 2) + "\n", "utf8");

  console.log(
    `Built FirstLevelMerged (S2 historical village + March 14 playable fields + 6-zone rail bridge): `
    + `southRows=${outRows}, southObjects=${ownObjects.length}, resolvedRows=${resolved.doc.terrain.rows}, `
    + `resolvedObjects=${resolved.doc.objects.length}, markers=${ownMarkers.length}, maxZ=${maxZ}`,
  );
}

BuildMergedScene();
