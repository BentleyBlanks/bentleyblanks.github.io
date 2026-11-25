// 滕县北沙河真实 SRTM N35E117 地貌高程、微地貌细节与连续延伸河道系统。
// 纯 JS 模块：零 three、零 DOM，供遭遇设计编辑器、场景编辑器、Play/正式战役及场景构建脚本共用。

import { BEISHAHE_DEM, SampleBeishaheDem } from "./Heightmap/Data_BeishaheDem.mjs";

const Clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SmoothStep = (e0, e1, x) => {
  const t = Clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// 与 Script_LevelFlowGpuRaster.mjs 完全一致的确定性值噪声，保证地形高度与 GPU 着色零偏差。
function Hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function ValueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = Hash2(ix, iz), b = Hash2(ix + 1, iz);
  const c = Hash2(ix, iz + 1), d = Hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

// ---------------------------------------------------------------------------
// 河道折线（北沙河主河道 + 河汊子北延 / 西支 / 南延汇入沙河）

/** 河汊子北段上游延伸：自 RiverWater_1_00 北端 (29.3, 197.7) C1 平滑大半径弧弯绕过前沿战壕南侧，自然折向西北蜿蜒出视距。 */
export const HECHAZI_NORTH_EXT = Object.freeze([
  [29.3, 197.7], [28.5, 187], [22, 177], [8, 170], [-14, 166], [-42, 164],
  [-74, 158], [-108, 144], [-144, 120], [-184, 84], [-232, 34], [-296, -34],
  [-386, -118], [-510, -212], [-680, -310], [-910, -400], [-1220, -470], [-1620, -560], [-2080, -690],
]);

/** 河汊子西来支沟上游延伸：自 TributaryWater_1 上游端 (-18.2, 286.9) 沿原切线平滑西延并自然分叉（不与北干流平行），上游逐级收窄。 */
export const HECHAZI_FEEDER_EXT = Object.freeze([
  [-18.2, 286.9], [-32, 278], [-52, 272], [-80, 271], [-116, 277], [-164, 292],
  [-226, 316], [-310, 344], [-425, 366], [-580, 376], [-790, 368], [-1080, 380], [-1450, 415],
]);

/** 场内原绘河汊子干流中段（z = 197.7..355）与西来支沟汇入段，供统一河流 Shader 无缝贯通。 */
export const HECHAZI_AUTHORED_MID = Object.freeze([
  [29.3, 197.7], [26.8, 204], [22.7, 216], [21.5, 230], [25, 245], [32, 258],
  [37.5, 271], [37, 285], [31, 298], [24.5, 311], [23, 325], [27.5, 338.5], [34, 351], [35.5, 355],
]);
export const HECHAZI_FEEDER_MID = Object.freeze([
  [-18.2, 286.9], [-12, 291], [0, 299], [10, 307], [17.5, 315], [23.5, 321],
]);

/** 合并版（FirstLevelMerged）河汊子南延：自 (35.5, 355) C1 顺接，过铁路涵洞 (-80, 412) 后自然 S 弯南行，在 (-254, 892) 呈锐角顺流汇入北沙河。 */
export const HECHAZI_MERGED_SOUTH = Object.freeze([
  [35.5, 355], [36.8, 367], [31.5, 379], [17, 389], [-7, 396], [-39, 402], [-66, 408], [-80, 412],
  [-103, 422], [-125, 440], [-145, 468], [-159, 506], [-165, 554], [-159, 608],
  [-149, 664], [-149, 722], [-160, 778], [-180, 826], [-212, 864], [-254, 892],
]);

/** 现行双村版（FirstLevelEncounter）河汊子南延：自 (34.5, 574) 自然绕行并在 (-248, 1340) 呈锐角顺流汇入沙河。 */
export const HECHAZI_ENCOUNTER_SOUTH = Object.freeze([
  [34.5, 574], [30, 598], [16, 626], [-8, 656], [-36, 688], [-68, 724], [-102, 766],
  [-132, 814], [-152, 872], [-162, 940], [-160, 1020], [-152, 1105],
  [-154, 1185], [-168, 1252], [-198, 1304], [-248, 1340],
]);

/** 判断是否为北沙河 / 第一关遭遇地理场景，排除单元测试用微型合成地形（如 16×16 relief）。 */
export function BeishaheGeoContext(sceneOrId, bounds) {
  const id = typeof sceneOrId === "string" ? sceneOrId : (sceneOrId?.id || sceneOrId?.scene || "");
  const b = bounds || (typeof sceneOrId === "object" ? sceneOrId?.bounds : null);
  const byId = id === "FirstLevelMerged" || id === "FirstLevelEncounter";
  const byBounds = b && (b.maxX - b.minX) >= 400 && (b.maxZ - b.minZ) >= 600 && b.minX <= -150 && b.maxX >= 310;
  if (!byId && !byBounds) return null;
  const isMerged = id === "FirstLevelMerged" || (!id && b && b.maxZ < 1100);
  const riverZShift = isMerged ? 0 : 450;
  return Object.freeze({
    isMerged,
    bridgeX: -80,
    bridgeZ: isMerged ? 860 : 1310,
    riverZShift,
    branchSouth: isMerged ? HECHAZI_MERGED_SOUTH : HECHAZI_ENCOUNTER_SOUTH,
  });
}

/**
 * 北沙河（沙河）主河道中心线 Z(x)：
 * 场内 x ∈ [-160, 320] 精确对齐实绘 SandBed/Stream（x=-160 -> 870.3，x=320 -> 745.3，东偏北向西偏南流）；
 * 界外平滑接出自然弯曲，左右延伸至 ±6 km 不截断。
 */
export function ShaheCenterZ(x, riverZShift = 0) {
  const baseZ = 870.3 + riverZShift - (x + 160) * 0.26041667;
  const outX = x < -160 ? (-160 - x) : (x > 320 ? (x - 320) : 0);
  if (outX <= 0) return baseZ;
  const m = SmoothStep(0, 240, outX);
  const meander = Math.sin(x * 0.0023 + 0.45) * 48 + Math.sin(x * 0.0061 - 1.15) * 16;
  return baseZ + meander * m;
}

/** 采样点 (x, z) 相对北沙河主河道的宽化河床/水面/岸坡因子。 */
export function SampleShaheChannel(x, z, riverZShift = 0) {
  const cz = ShaheCenterZ(x, riverZShift);
  const dist = Math.abs(z - cz);
  const wMod = 1 + 0.16 * Math.sin(x * 0.0075 + 1.1) + 0.08 * Math.cos(x * 0.019 - 0.6);
  const halfWater = 9.0 * wMod;
  const halfDamp = 14.5 * wMod;
  const halfBed = 36.0 * wMod;
  const bankOuter = halfBed + 18.0;
  if (dist >= bankOuter) return { dist, waterT: 0, dampT: 0, sandT: 0, bankT: 0, carveM: 0 };
  const bankT = 1 - SmoothStep(halfBed, bankOuter, dist);
  const sandT = 1 - SmoothStep(halfBed - 2.5, halfBed + 3.5, dist);
  const dampT = 1 - SmoothStep(halfDamp - 2.0, halfDamp + 4.5, dist);
  const waterT = 1 - SmoothStep(halfWater - 1.4, halfWater + 1.6, dist);
  const thalweg = 1 - SmoothStep(halfWater, halfWater + 8.5, dist);
  const carveM = bankT * 2.75 + thalweg * 0.72;
  return { dist, waterT, dampT, sandT, bankT, carveM };
}

function PolylineDistance(x, z, pts) {
  let minD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1];
    const bx = pts[i][0], bz = pts[i][1];
    const vx = bx - ax, vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 1e-8 ? Clamp(((x - ax) * vx + (z - az) * vz) / len2, 0, 1) : 0;
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < minD) minD = d;
  }
  return minD;
}

/** 采样点 (x, z) 相对河汊子延伸支流（北延 + 西支 + 南延汇入沙河）的距离与断面因子。 */
export function SampleBranchCreek(x, z, ctx, options = {}) {
  if (!ctx) return { dist: Infinity, waterT: 0, bankT: 0, carveM: 0 };
  const includeNorth = options.includeNorth !== false;
  const includeSouth = options.includeSouth !== false;
  let dist = Infinity;
  let halfWater = 5.0;
  let halfBed = 8.6;
  let bankW = 7.0;

  if (includeSouth) {
    const dSouth = PolylineDistance(x, z, ctx.branchSouth);
    if (dSouth < dist) dist = dSouth;
  }
  if (includeNorth) {
    const dNorth = PolylineDistance(x, z, HECHAZI_NORTH_EXT);
    if (dNorth < dist) {
      dist = dNorth;
      const taper = 1 - 0.35 * SmoothStep(120, 1600, Math.max(0, -x));
      halfWater = 4.4 * taper;
      halfBed = 7.8 * taper;
      bankW = 6.2 * taper;
    }
    const dFeeder = PolylineDistance(x, z, HECHAZI_FEEDER_EXT);
    if (dFeeder < dist) {
      dist = dFeeder;
      const taper = 1 - 0.42 * SmoothStep(40, 1100, Math.max(0, -18 - x));
      halfWater = 2.4 * taper;
      halfBed = 4.5 * taper;
      bankW = 4.4 * taper;
    }
  }
  const outer = halfBed + bankW;
  if (dist >= outer) return { dist, waterT: 0, bankT: 0, carveM: 0 };
  const bankT = 1 - SmoothStep(halfBed, outer, dist);
  const waterT = 1 - SmoothStep(halfWater - 0.9, halfWater + 1.1, dist);
  // 铁路路基（x ≈ -80）走涵洞：保留轨道高程不被切塌，两侧立即接回河槽
  const railProtect = (z >= 355 && z <= ctx.bridgeZ - 18) ? (1 - SmoothStep(4.5, 9.5, Math.abs(x - ctx.bridgeX))) : 0;
  const carveM = (bankT * 1.65 + waterT * 0.45) * (1 - railProtect);
  return { dist, waterT: waterT * (1 - railProtect * 0.9), bankT: bankT * (1 - railProtect), carveM };
}

/**
 * 真实 SRTM N35E117 相对高程 + 多尺度鲁南冲积平原/低山丘陵微地貌细节（米）。
 * 相对北沙河桥基准面（SRTM 65.1 m 海拔 -> 场景 0 m）。
 */
export function SampleBeishaheRelief(x, z, ctx) {
  const dx = x - ctx.bridgeX;
  const dz = z - ctx.bridgeZ;
  const demRel = SampleBeishaheDem(dx, dz) - BEISHAHE_DEM.reference.elevationMeters;
  // 在真实 30 m SRTM 基底之上补入亚 30 m 鲁南地貌细节：
  //   - 平原与冲积阶地：舒缓起伏的黄土岗脊与浅洼（±4.2 m），彻底打破高空俯视的“桌面”死平感
  //   - 东北/东侧真实低山丘陵（demRel > 4 m）：按真实高程放大山梁与冲沟立体起伏
  const hillAmp = 1 + Clamp(Math.max(0, demRel) / 11, 0, 2.8);
  const nBroad = (ValueNoise(x * 0.0022 + 13.7, z * 0.0022 - 7.3) - 0.5) * 6.8;
  const nMid = (ValueNoise(x * 0.0062 - 4.1, z * 0.0062 + 19.2) - 0.5) * 3.1;
  const nFine = (ValueNoise(x * 0.017 + 2.3, z * 0.017 + 8.9) - 0.5) * 1.1;
  // 东北-西南向冲洪积扇岗地走向（与滕州东北低山前麓一致）
  const ridgeCoord = (dx * 0.42 + dz * 0.91) * 0.0038;
  const ridge = Math.sin(ridgeCoord + ValueNoise(x * 0.0016, z * 0.0016) * 2.5) * 2.4;
  // 北沙河宽谷阶地（河谷两侧约 175 m 宽缓坡下切，河道坐落于自然河谷中）
  const shaheDist = Math.abs(z - ShaheCenterZ(x, ctx.riverZShift));
  const valleyDrop = (1 - SmoothStep(48, 210, shaheDist)) * 2.6;
  const detail = (nBroad + nMid + nFine + ridge) * hillAmp;
  // 保持真实 SRTM 东高西低、东北滕州-龙山低山丘陵走向；适度 1.6× 垂向表达使 1500 m 视距内地形轮廓清晰真实
  return demRel * 1.6 - valleyDrop + detail;
}

/**
 * 界外地形最终高度采样器（供 Encounter Designer、Scene Editor 与 Play 远景地面共用）：
 * 在 groundBounds 边界与场内实测高度 C1 平滑衔接，向外自然过渡到真实 SRTM N35E117 + 微地貌 + 延伸河道。
 */
export function SampleBeishaheOuterHeight(x, z, edgeHeight, outDist, ctx) {
  if (!ctx || outDist <= 0) return edgeHeight;
  // 距场界 > 4.6 km 的极远外缘平滑收平到地平线基准面，避免 12 km 四叉树极远角无意义细分
  if (outDist >= 4600) return -2.74;
  const relief = SampleBeishaheRelief(x, z, ctx);
  const blend = SmoothStep(0, 125, outDist);
  let y = edgeHeight + (relief - edgeHeight) * blend;

  // 延伸主河道（北沙河）与支流（河汊子）下切河槽：界外直接与实绘河床衔接
  const shahe = SampleShaheChannel(x, z, ctx.riverZShift);
  const branch = SampleBranchCreek(x, z, ctx);
  const riverCarve = Math.max(shahe.carveM, branch.carveM);
  if (riverCarve > 0.001) {
    // 紧贴边界处不叠加双倍下切（场内边界点本身已在河床内时）
    const carveFade = SmoothStep(0, 18, outDist);
    const bedTarget = Math.min(y - riverCarve, relief - riverCarve);
    y = y + (bedTarget - y) * carveFade;
  }
  if (outDist > 3600) {
    const farFlat = SmoothStep(3600, 4600, outDist);
    y = y + (-2.74 - y) * farFlat;
  }
  return y;
}
