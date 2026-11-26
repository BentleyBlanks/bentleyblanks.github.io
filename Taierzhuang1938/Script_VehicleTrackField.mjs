// 通用车辆车辙真几何高度场与规则层（纯 Node、零 three，项目契约 2）。
//
// 职责：
//   1. 解析车型配置（Data_VehicleTracks.VEHICLE_TRACK_PROFILES）与场景 JSON `vehicleTracks` 校验；
//   2. 维护稀疏世界锁定的高密车辙高度场（VehicleTrackField）：
//      · 3 m 瓦片，每格 5–12.5 cm（high 档 6.25 cm），仅在真正压过车辙的瓦片分配内存；
//      · 每个格点存 `depth`（下凹深，米）与 `rim`（两侧挤泥棱高，米），单值高度场天然解决交叉碾压零穿模；
//      · 合成高度偏移 = `rim * (1 - smoothstep(lo, hi, depth)) - depth`：泥棱绝不填平已有深槽；
//      · 脏矩形（DirtyBox）追踪：单帧车辆前进只重算并上传几十个顶点，亚毫秒开销；
//   3. 连续条带 / 曲线光栅化（ImprintSegment / ImprintHoof / CompileStaticTrack）：
//      · 动静同源：动态车辆行驶与场景 JSON 静态预设样条走同一套截面数学与 GPU 细部印章生成。

import {
  VEHICLE_TRACK_GEOMETRY as GEO,
  VEHICLE_TRACK_PROFILES as PROFILES,
  VEHICLE_TRACK_ALIASES as ALIASES,
} from "./Data_VehicleTracks.mjs";
import { ValueNoise2 } from "./Script_Noise.mjs";

const PAGE_SPAN = 4096;
const PageKey = (tx, tz) => tx * PAGE_SPAN + tz;
const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Smooth = (a, b, v) => {
  const t = Clamp01((v - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};
const Finite = (v) => typeof v === "number" && Number.isFinite(v);

/** 按画质档位取几何细分规格。 */
export function VehicleTrackGeometryTierOf(quality) {
  return GEO.tiers[quality] || GEO.tiers.high;
}

/** 按 id / 别名 / 兼容旧 spec 解析出完整车型配置。 */
export function ResolveVehicleTrackProfile(profileOrSpec) {
  if (!profileOrSpec) return null;
  if (typeof profileOrSpec === "string") {
    const key = PROFILES[profileOrSpec] ? profileOrSpec : ALIASES[profileOrSpec];
    return key ? PROFILES[key] : null;
  }
  if (Array.isArray(profileOrSpec.contactors)) return profileOrSpec;
  if (typeof profileOrSpec.profile === "string") {
    const base = ResolveVehicleTrackProfile(profileOrSpec.profile);
    if (base) return { ...base, ...profileOrSpec, contactors: base.contactors };
  }
  // 兼容旧版 Data_Tuning_TerrainTrails.TERRAIN_TRAIL_VEHICLES.type89 形如 { trackWidthM, halfGaugeM, contactLengthM }
  if (Finite(profileOrSpec.trackWidthM) && Finite(profileOrSpec.contactLengthM)) {
    const base = PROFILES.type89Tank;
    const half = Finite(profileOrSpec.halfGaugeM) ? profileOrSpec.halfGaugeM : 0.92;
    const measureGauge = !Finite(profileOrSpec.halfGaugeM);
    const makeSide = (side, id) => ({
      ...base.contactors[side < 0 ? 0 : 1],
      id,
      side,
      offsetX: side * half,
      measureGauge,
      widthM: profileOrSpec.trackWidthM,
      contactLengthM: profileOrSpec.contactLengthM,
    });
    return {
      ...base,
      id: "legacyTracked",
      onGroundM: profileOrSpec.onGroundM ?? base.onGroundM,
      recordWithinM: profileOrSpec.recordWithinM ?? base.recordWithinM,
      contactors: [makeSide(-1, "trackL"), makeSide(1, "trackR")],
    };
  }
  return null;
}

/**
 * 校验场景 JSON 顶层可选字段 `vehicleTracks`（供 Script_SceneDoc.ValidateScene 调用）。
 * 每条静态车辙样条形如：
 *   { id, profile, points: [[x, z], ...], passes?: 1..6, depthScale?: 0.1..2.5, softness?: 0.1..2.5,
 *     hooves?: boolean, widthScale?: 0.5..2.0, wobbleM?: 0..0.4 }
 */
export function SceneVehicleTrackIssues(tracks, errors) {
  if (!Array.isArray(tracks)) {
    errors.push("vehicleTracks 要是数组");
    return;
  }
  if (tracks.length > 256) errors.push("vehicleTracks 最多 256 条");
  const ids = new Set();
  tracks.forEach((track, i) => {
    const at = `vehicleTracks[${i}]`;
    if (!track || typeof track !== "object" || Array.isArray(track)) {
      errors.push(`${at} 要是对象`);
      return;
    }
    if (typeof track.id !== "string" || !track.id.length || track.id.length > 96) {
      errors.push(`${at}.id 要是 1–96 字的字符串`);
    } else if (ids.has(track.id)) {
      errors.push(`${at}.id 重复：${track.id}`);
    } else {
      ids.add(track.id);
    }
    if (!ResolveVehicleTrackProfile(track.profile)) {
      errors.push(`${at}.profile 不在车型表（Data_VehicleTracks）：${JSON.stringify(track.profile)}`);
    }
    const pts = track.points;
    const validPts = Array.isArray(pts) && pts.length >= 2 && pts.length <= 2048
      && pts.every((p) => (Array.isArray(p) && p.length >= 2 && Finite(p[0]) && Finite(p[1]))
        || (p && typeof p === "object" && Finite(p.x) && Finite(p.z)));
    if (!validPts) errors.push(`${at}.points 要是至少 2 个 [x, z] 或 {x, z} 点`);
    if (track.passes !== undefined && (!Finite(track.passes) || track.passes < 0.2 || track.passes > 8)) {
      errors.push(`${at}.passes 要在 0.2–8 之间`);
    }
    if (track.depthScale !== undefined && (!Finite(track.depthScale) || track.depthScale <= 0 || track.depthScale > 3)) {
      errors.push(`${at}.depthScale 要在 (0, 3] 之间`);
    }
    if (track.softness !== undefined && (!Finite(track.softness) || track.softness <= 0 || track.softness > 3)) {
      errors.push(`${at}.softness 要在 (0, 3] 之间`);
    }
    if (track.widthScale !== undefined && (!Finite(track.widthScale) || track.widthScale < 0.5 || track.widthScale > 2.5)) {
      errors.push(`${at}.widthScale 要在 [0.5, 2.5] 之间`);
    }
    if (track.hooves !== undefined && typeof track.hooves !== "boolean") {
      errors.push(`${at}.hooves 要是 true / false`);
    }
  });
}

/** 规范化样条点序列到 [{x, z}, ...] 并去重零长度相邻点。 */
export function NormalizeTrackPoints(points) {
  const out = [];
  for (const p of points || []) {
    const x = Array.isArray(p) ? p[0] : p?.x;
    const z = Array.isArray(p) ? p[1] : p?.z;
    if (!Finite(x) || !Finite(z)) continue;
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(x - prev.x, z - prev.z) > 1e-4) out.push({ x, z });
  }
  return out;
}

/**
 * 车辙截面解析：给定距轨道中线的横向距离 absU（米）和沿程相位 alongM（米），返回 [depth01, rim01]。
 * 保证在 absU >= halfW + rimWidth 时精确归零。
 */
export function EvaluateRutCrossSection(absU, alongM, worldX, worldZ, spec, minHalfWM = 0) {
  const halfW = Math.max(0.02, (spec.widthM || 0.2) * 0.5, minHalfWM);
  const rimW = Math.max(0.05, spec.rimWidthM || halfW * 0.75, minHalfWM * 1.15);
  const reach = halfW + rimW;
  if (absU >= reach) return [0, 0];

  const kind = spec.crossSection || "tankTread";
  let depth01 = 0;
  if (absU < halfW) {
    const u = absU / halfW; // 0 中线 .. 1 槽边
    if (kind === "ironWheel") {
      // 铁箍木轮：窄而深的锐利 U/V 切槽，底部略圆，斜向抗锯齿平滑过渡
      const q = Math.max(0, 1 - u * u);
      depth01 = Clamp01(q * q * 1.05 + q * 0.12);
    } else if (kind === "tire") {
      // 充气橡胶胎：弧底，双胎时中间留一条浅土脊
      depth01 = Math.pow(Math.max(0, 1 - u * u), 0.75);
      if (spec.guideRidge > 0) {
        const centerRidge = Math.exp(-((u / 0.18) ** 2)) * spec.guideRidge;
        depth01 *= (1 - centerRidge);
      }
    } else if (kind === "hoof") {
      depth01 = Math.pow(Math.max(0, 1 - u * u), 0.65);
    } else {
      // 坦克 / 轻战车履带：平底梯形深槽 + 陡峭内壁 + 中央导齿微隆 + 轻微履齿宏观起伏
      const wall = Math.pow(u, spec.wallSharpness || 2.4);
      depth01 = Clamp01(1 - wall);
      if (spec.guideRidge > 0) {
        const guide = Math.exp(-((u / 0.22) ** 2)) * spec.guideRidge;
        depth01 *= (1 - guide);
      }
      if (spec.pitchM > 0) {
        const grouser = 0.5 + 0.5 * Math.cos((2 * Math.PI * alongM) / spec.pitchM);
        depth01 *= (0.91 + 0.09 * grouser);
      }
    }
    // 微量土壤颗粒感，打破完美解析曲面
    const fn = ValueNoise2(worldX * GEO.floorNoiseFreq, worldZ * GEO.floorNoiseFreq, 4117);
    depth01 *= (1 - GEO.floorNoiseAmp * 0.5 + GEO.floorNoiseAmp * fn);
  }

  // 两侧挤泥棱：紧贴槽壁外沿（absU ≈ halfW + 0.38 * rimW 处达峰值），边缘平滑归零
  let rim01 = 0;
  const edge = absU - halfW;
  if (edge > -halfW * 0.15 && edge < rimW) {
    const t = Clamp01((edge + halfW * 0.1) / (rimW + halfW * 0.1));
    // 非对称钟形：靠近槽壁陡起，向外侧缓降
    const bell = Math.sin(Math.PI * Math.pow(t, 0.72));
    const rn = ValueNoise2(worldX * GEO.rimNoiseFreq + 5.1, worldZ * GEO.rimNoiseFreq - 2.7, 9137);
    const organic = 1 - GEO.rimNoiseAmp * 0.5 + GEO.rimNoiseAmp * rn;
    rim01 = Clamp01(bell * bell * organic * (1 - Smooth(rimW * 0.78, rimW, edge)));
  }

  return [Clamp01(depth01), Clamp01(rim01)];
}

/** 由格点的 depth 和 rim 计算净高度偏移（负值 = 下凹，正值 = 泥棱隆起）。 */
export function CombineRutHeightOffset(depth, rim) {
  const [lo, hi] = GEO.rimSuppressDepthM;
  const suppress = Smooth(lo, hi, depth);
  return rim * (1 - suppress) - depth;
}

/**
 * 稀疏高密车辙真几何高度场。
 * 瓦片坐标 (tx, tz) 覆盖世界 [tx * tileSizeM, (tx + 1) * tileSizeM] × [tz * tileSizeM, (tz + 1) * tileSizeM]。
 * 节点下标 (ix, iz) 对应世界 (ix * cellM, iz * cellM)。
 */
export class VehicleTrackField {
  constructor({
    BaseHeight = () => 0,
    SoftnessAt = null,
    CanDeform = () => true,
    bounds = null,
    quality = "high",
    tileSizeM = GEO.tileSizeM,
    cells = null,
    maxTiles = null,
  } = {}) {
    const tier = VehicleTrackGeometryTierOf(quality);
    this.base = BaseHeight;
    this.softnessAt = SoftnessAt;
    this.canDeform = CanDeform;
    this.bounds = bounds || { minX: -4096, maxX: 4096, minZ: -4096, maxZ: 4096 };
    this.tileSizeM = tileSizeM;
    this.cells = cells || tier.cells;
    this.cellM = this.tileSizeM / this.cells;
    this.maxTiles = maxTiles || tier.maxTiles || GEO.maxActiveTiles;
    this.depthPages = new Map();     // PageKey -> Float32Array(cells * cells)
    this.rimPages = new Map();       // PageKey -> Float32Array(cells * cells)
    this.tiles = new Map();          // PageKey -> { tx, tz, key, lastTouch }
    this.dirtyKeys = new Set();      // PageKey
    this.dirtyBoxes = new Map();     // PageKey -> { x0, z0, x1, z1, full }
    this.takenBoxes = new Map();
    this.revision = 0;
    this.touchClock = 0;
    this.imprints = 0;
    this._lastPageKey = NaN;
    this._lastDepthPage = null;
    this._lastRimPage = null;
  }

  TileKey(tx, tz) { return `${tx},${tz}`; }

  _GetPages(tx, tz, create = false) {
    const key = PageKey(tx, tz);
    if (key === this._lastPageKey && (this._lastDepthPage || !create)) {
      return this._lastDepthPage ? { depth: this._lastDepthPage, rim: this._lastRimPage, key } : null;
    }
    let depth = this.depthPages.get(key);
    let rim = this.rimPages.get(key);
    if (!depth) {
      if (!create) {
        this._lastPageKey = key;
        this._lastDepthPage = null;
        this._lastRimPage = null;
        return null;
      }
      const len = this.cells * this.cells;
      depth = new Float32Array(len);
      rim = new Float32Array(len);
      this.depthPages.set(key, depth);
      this.rimPages.set(key, rim);
    }
    this._lastPageKey = key;
    this._lastDepthPage = depth;
    this._lastRimPage = rim;
    return { depth, rim, key };
  }

  HasTile(tx, tz) { return this.tiles.has(PageKey(tx, tz)); }

  HasTileAtWorld(x, z) {
    return this.HasTile(Math.floor(x / this.tileSizeM), Math.floor(z / this.tileSizeM));
  }

  NodeDepth(ix, iz) {
    const n = this.cells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    const pages = this._GetPages(tx, tz, false);
    if (!pages) return 0;
    return pages.depth[(iz - tz * n) * n + (ix - tx * n)];
  }

  NodeRim(ix, iz) {
    const n = this.cells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    const pages = this._GetPages(tx, tz, false);
    if (!pages) return 0;
    return pages.rim[(iz - tz * n) * n + (ix - tx * n)];
  }

  NodeOffset(ix, iz) {
    const n = this.cells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    const pages = this._GetPages(tx, tz, false);
    if (!pages) return 0;
    const at = (iz - tz * n) * n + (ix - tx * n);
    return CombineRutHeightOffset(pages.depth[at], pages.rim[at]);
  }

  _MarkTile(tx, tz, lx, lz, halo, haloOnly) {
    const key = PageKey(tx, tz);
    if (haloOnly && !this.tiles.has(key)) return;
    if (!this.tiles.has(key)) {
      if (this.tiles.size >= this.maxTiles) return;
      this.tiles.set(key, { tx, tz, key: this.TileKey(tx, tz), pageKey: key, lastTouch: ++this.touchClock });
      this.dirtyKeys.add(key);
      this.dirtyBoxes.set(key, { x0: 0, z0: 0, x1: this.cells, z1: this.cells, full: true });
      return;
    }
    this.tiles.get(key).lastTouch = ++this.touchClock;
    this.dirtyKeys.add(key);
    let box = this.dirtyBoxes.get(key);
    if (!box) {
      box = { x0: this.cells, z0: this.cells, x1: 0, z1: 0, full: false };
      this.dirtyBoxes.set(key, box);
    }
    if (box.full) return;
    if (lx === null || lz === null) {
      box.full = true; box.x0 = 0; box.z0 = 0; box.x1 = this.cells; box.z1 = this.cells;
      return;
    }
    const x0 = Math.max(0, lx - halo), x1 = Math.min(this.cells, lx + halo);
    const z0 = Math.max(0, lz - halo), z1 = Math.min(this.cells, lz + halo);
    if (x0 < box.x0) box.x0 = x0;
    if (z0 < box.z0) box.z0 = z0;
    if (x1 > box.x1) box.x1 = x1;
    if (z1 > box.z1) box.z1 = z1;
  }

  _SetNode(ix, iz, nextDepth, nextRim) {
    const n = this.cells;
    const tx = Math.floor(ix / n), tz = Math.floor(iz / n);
    const pages = this._GetPages(tx, tz, true);
    const lx = ix - tx * n, lz = iz - tz * n;
    const at = lz * n + lx;
    const changed = Math.abs(nextDepth - pages.depth[at]) > 1e-4 || Math.abs(nextRim - pages.rim[at]) > 1e-4;
    if (!changed) return false;
    pages.depth[at] = nextDepth;
    pages.rim[at] = nextRim;
    // 边界节点（lx <= 1 或 lx === n-1）同时影响邻块接缝顶点或法线光晕
    const x0 = lx <= 1 ? tx - 1 : tx, x1 = lx >= n - 1 ? tx + 1 : tx;
    const z0 = lz <= 1 ? tz - 1 : tz, z1 = lz >= n - 1 ? tz + 1 : tz;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const vx = ix - x * n, vz = iz - z * n;
        const outside = vx < 0 || vx > n || vz < 0 || vz > n;
        this._MarkTile(x, z, vx, vz, 1, outside);
      }
    }
    return true;
  }

  /**
   * 连续压入一段车辙胶囊段 p0 -> p1（支持直线、弯道、原地转向）。
   * 重复碾压按 passDeepenFactor 柔和加深，始终不超过 maxDepthM。
   */
  ImprintSegment(p0, p1, spec, { softness = 1, depthScale = 1, rimScale = 1, phaseStartM = 0, passes = 1 } = {}) {
    if (!p0 || !p1 || !spec) return 0;
    const x0 = p0.x, z0 = p0.z, x1 = p1.x, z1 = p1.z;
    if (![x0, z0, x1, z1].every(Finite)) return 0;
    // 抗锯齿最小半宽：窄铁轮/蹄印在离散顶网格上至少覆盖 ~0.95 格半宽，消除斜向锯齿；2 cm GPU 靶保留锐利刃口
    const minHalfWM = spec.crossSection === "hoof" ? this.cellM * 0.82 : this.cellM * 0.95;
    const halfW = Math.max(0.02, (spec.widthM || 0.2) * 0.5, minHalfWM);
    const rimW = Math.max(0.05, spec.rimWidthM || halfW * 0.75, minHalfWM * 1.15);
    const reach = halfW + rimW + this.cellM;
    const minX = Math.max(this.bounds.minX + this.cellM, Math.min(x0, x1) - reach);
    const maxX = Math.min(this.bounds.maxX - this.cellM, Math.max(x0, x1) + reach);
    const minZ = Math.max(this.bounds.minZ + this.cellM, Math.min(z0, z1) - reach);
    const maxZ = Math.min(this.bounds.maxZ - this.cellM, Math.max(z0, z1) + reach);
    if (minX > maxX || minZ > maxZ) return 0;

    // 预分配涉及的所有瓦片（包括靠近接缝的邻块，确保非活跃边缘高度严格为 0）
    const padTile = this.cellM * 2;
    const tx0 = Math.floor((minX - padTile) / this.tileSizeM);
    const tx1 = Math.floor((maxX + padTile) / this.tileSizeM);
    const tz0 = Math.floor((minZ - padTile) / this.tileSizeM);
    const tz1 = Math.floor((maxZ + padTile) / this.tileSizeM);
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.tiles.has(PageKey(tx, tz)) && this.tiles.size < this.maxTiles) {
          this._MarkTile(tx, tz, null, null, 0, false);
        }
      }
    }

    const dx = x1 - x0, dz = z1 - z0;
    const lenSq = dx * dx + dz * dz;
    const len = Math.sqrt(lenSq);
    const ix0 = Math.floor(minX / this.cellM), ix1 = Math.ceil(maxX / this.cellM);
    const iz0 = Math.floor(minZ / this.cellM), iz1 = Math.ceil(maxZ / this.cellM);

    // 多次碾压在单次调用里按等效加深系数折叠（1 次 = 1.0，2 次 ≈ 1.28，3 次 ≈ 1.48）
    const passGain = passes > 1 ? 1 + (1 - Math.pow(1 - GEO.passDeepenFactor, passes - 1)) * 0.85 : 1;
    const targetDepthBase = (spec.depthM || 0.08) * depthScale * passGain;
    const targetRimBase = (spec.rimM || 0.028) * rimScale * (1 + (passGain - 1) * 0.7);

    let changed = 0;
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = iz * this.cellM;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = ix * this.cellM;
        if (!this.canDeform(wx, wz)) continue;
        // 线段投影
        let t = 0;
        if (lenSq > 1e-8) {
          t = Clamp01(((wx - x0) * dx + (wz - z0) * dz) / lenSq);
        }
        const px = x0 + dx * t, pz = z0 + dz * t;
        const absU = Math.hypot(wx - px, wz - pz);
        if (absU >= halfW + rimW) continue;

        const localSoft = softness * (this.softnessAt ? this.softnessAt(wx, wz) : 1);
        if (localSoft <= 0.01) continue;

        const [d01, r01] = EvaluateRutCrossSection(absU, phaseStartM + t * len, wx, wz, spec, minHalfWM);
        if (d01 <= 0.001 && r01 <= 0.001) continue;

        const oldD = this.NodeDepth(ix, iz);
        const oldR = this.NodeRim(ix, iz);
        const addD = d01 * targetDepthBase * localSoft;
        const addR = r01 * targetRimBase * localSoft;

        // 交叉或二次碾压：以 MAX 为主，叠加少量柔和加深（绝不无限深挖）
        const nextD = Math.min(GEO.maxDepthM, Math.max(oldD, addD) + Math.min(oldD, addD) * GEO.passDeepenFactor * 0.35);
        const nextR = Math.min(GEO.maxRimM, Math.max(oldR, addR));
        if (this._SetNode(ix, iz, nextD, nextR)) changed++;
      }
    }
    if (changed > 0) {
      this.revision++;
      this.imprints++;
    }
    return changed;
  }

  /** 压入一枚局部椭圆凹坑（驴/牛/马蹄印或点状压痕）。 */
  ImprintHoof(x, z, spec, { softness = 1, depthScale = 1, rimScale = 1 } = {}) {
    return this.ImprintSegment({ x, z }, { x, z }, { ...spec, crossSection: "hoof" }, { softness, depthScale, rimScale });
  }

  /**
   * 采样任意世界点的精确车辙高度偏移（米，负值下凹、正值泥棱）。
   * 沿与渲染瓦片一致的三角对角线插值，供车辆接地沉陷与测试断言共用。
   */
  OffsetAt(x, z) {
    if (!this.HasTileAtWorld(x, z)) return 0;
    const s = this.cellM;
    const gx = x / s, gz = z / s;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const u = gx - ix, v = gz - iz;
    const a = this.NodeOffset(ix, iz);
    const b = this.NodeOffset(ix + 1, iz);
    const c = this.NodeOffset(ix, iz + 1);
    const d = this.NodeOffset(ix + 1, iz + 1);
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  /** 含车辙凹陷的真实地表高度。 */
  GroundHeight(x, z) {
    return this.base(x, z) + this.OffsetAt(x, z);
  }

  /** 采样任意世界点的最大车辙深（正值米）。 */
  DepthAt(x, z) {
    if (!this.HasTileAtWorld(x, z)) return 0;
    const s = this.cellM;
    const gx = x / s, gz = z / s;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const u = gx - ix, v = gz - iz;
    const a = this.NodeDepth(ix, iz);
    const b = this.NodeDepth(ix + 1, iz);
    const c = this.NodeDepth(ix, iz + 1);
    const d = this.NodeDepth(ix + 1, iz + 1);
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  /**
   * 填充单个高密瓦片及其 1 格光晕的真实高度数组（供 VehicleTrackView 建网与算平滑法线）。
   * 若边界紧邻未激活的普通粗地形瓦片，该侧边界的偏移被自然锁零（因为 ImprintSegment 已自动激活触及边缘的邻块）。
   */
  FillTile(tx, tz, halo, outHeights, outOffsets = null, box = null) {
    const n = this.cells, s = this.cellM, w = n + 1 + 2 * halo;
    const ix0 = tx * n - halo, iz0 = tz * n - halo;
    const ixa = box ? tx * n + box.x0 - halo : ix0;
    const ixb = box ? tx * n + box.x1 + halo : ix0 + w - 1;
    const iza = box ? tz * n + box.z0 - halo : iz0;
    const izb = box ? tz * n + box.z1 + halo : iz0 + w - 1;
    const hasLeft = this.HasTile(tx - 1, tz);
    const hasRight = this.HasTile(tx + 1, tz);
    const hasNorth = this.HasTile(tx, tz - 1);
    const hasSouth = this.HasTile(tx, tz + 1);

    for (let iz = iza; iz <= izb; iz++) {
      const wz = iz * s;
      const vz = iz - tz * n;
      const lockedZ = (vz <= 0 && !hasNorth) || (vz >= n && !hasSouth);
      for (let ix = ixa; ix <= ixb; ix++) {
        const wx = ix * s;
        const vx = ix - tx * n;
        const lockedX = (vx <= 0 && !hasLeft) || (vx >= n && !hasRight);
        const offset = (lockedX || lockedZ) ? 0 : this.NodeOffset(ix, iz);
        const out = (iz - iz0) * w + (ix - ix0);
        outHeights[out] = this.base(wx, wz) + offset;
        if (outOffsets) outOffsets[out] = offset;
      }
    }
    return w;
  }

  /** 取出本帧标脏的瓦片描述符列表，同时缓存对应的子矩形。 */
  TakeDirty() {
    if (!this.dirtyKeys.size) return [];
    const out = [];
    for (const key of this.dirtyKeys) {
      const tile = this.tiles.get(key);
      if (tile) out.push(tile);
    }
    this.dirtyKeys.clear();
    this.takenBoxes = this.dirtyBoxes;
    this.dirtyBoxes = new Map();
    return out;
  }

  DirtyBox(tx, tz) {
    const box = this.takenBoxes.get(PageKey(tx, tz));
    return box && !box.full && box.x1 >= box.x0 && box.z1 >= box.z0 ? box : null;
  }

  TileRect(tx, tz) {
    const t = this.tileSizeM;
    return { minX: tx * t, maxX: (tx + 1) * t, minZ: tz * t, maxZ: (tz + 1) * t };
  }

  State() {
    return {
      revision: this.revision,
      imprints: this.imprints,
      tiles: this.tiles.size,
      cells: this.cells,
      cellM: +this.cellM.toFixed(4),
      tileSizeM: this.tileSizeM,
      bytes: this.depthPages.size * this.cells * this.cells * 8,
    };
  }

  Clear() {
    this.depthPages.clear();
    this.rimPages.clear();
    this.tiles.clear();
    this.dirtyKeys.clear();
    this.dirtyBoxes.clear();
    this.takenBoxes.clear();
    this._lastPageKey = NaN;
    this._lastDepthPage = null;
    this._lastRimPage = null;
    this.revision++;
    this.imprints = 0;
  }
}

/**
 * 将场景 JSON 里的静态样条 `vehicleTracks` 编译成：
 *   · 供 VehicleTrackField 压入真几何凹槽的连续线段列表 `segments` 与蹄印列表 `hooves`；
 *   · 供 TerrainTrailSystem.AddStaticStamp 写入 GPU 2 cm/纹素微观细节的持久印章列表 `stamps`。
 *
 * 自动沿样条做弧长重采样，并按每个接触单元的局部横向/纵向偏移展开，天然在弯道产生真实的内外轮差与平滑弧线！
 */
export function CompileStaticVehicleTrack(trackSpec) {
  const profile = ResolveVehicleTrackProfile(trackSpec?.profile);
  const rawPts = NormalizeTrackPoints(trackSpec?.points);
  if (!profile || rawPts.length < 2) return { segments: [], hooves: [], stamps: [] };

  const passes = Finite(trackSpec.passes) ? trackSpec.passes : 1;
  const depthScale = Finite(trackSpec.depthScale) ? trackSpec.depthScale : 1;
  const softness = Finite(trackSpec.softness) ? trackSpec.softness : 1;
  const widthScale = Finite(trackSpec.widthScale) ? trackSpec.widthScale : 1;
  const includeHooves = trackSpec.hooves !== false;
  const wobbleM = Finite(trackSpec.wobbleM) ? trackSpec.wobbleM : 0;

  // 先按固定步长（0.25 m）对中心线做弧长重采样，确保弯道法线平滑
  const arc = [0];
  for (let i = 1; i < rawPts.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(rawPts[i].x - rawPts[i - 1].x, rawPts[i].z - rawPts[i - 1].z));
  }
  const totalLen = arc[arc.length - 1];
  if (totalLen < 0.05) return { segments: [], hooves: [], stamps: [] };

  const sampleStep = 0.25;
  const steps = Math.max(2, Math.ceil(totalLen / sampleStep));
  const samples = [];
  let segIdx = 0;
  for (let k = 0; k <= steps; k++) {
    const s = (k / steps) * totalLen;
    while (segIdx < arc.length - 2 && arc[segIdx + 1] < s) segIdx++;
    const a = rawPts[segIdx], b = rawPts[segIdx + 1];
    const segL = Math.max(1e-6, arc[segIdx + 1] - arc[segIdx]);
    const t = Clamp01((s - arc[segIdx]) / segL);
    samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s });
  }
  // 切线与右向（前进方向 = 沿 s 递增，右向 = (-dz, dx) 与项目 −Z 车头 +X 车右一致）
  for (let k = 0; k < samples.length; k++) {
    const prev = samples[Math.max(0, k - 1)], next = samples[Math.min(samples.length - 1, k + 1)];
    const tx = next.x - prev.x, tz = next.z - prev.z;
    const n = Math.hypot(tx, tz) || 1;
    samples[k].fx = tx / n; samples[k].fz = tz / n;
    samples[k].rx = -tz / n; samples[k].rz = tx / n;
  }

  const segments = [];
  const hooves = [];
  const stamps = [];

  for (const contactor of profile.contactors) {
    if (contactor.type === "hoof") {
      if (!includeHooves) continue;
      const stride = Math.max(0.3, contactor.strideM || 0.72);
      const phaseOffset = (contactor.phase || 0) * stride;
      for (let s = phaseOffset; s <= totalLen; s += stride) {
        const idx = Math.min(samples.length - 1, Math.round((s / totalLen) * (samples.length - 1)));
        const pt = samples[idx];
        const jitterX = (ValueNoise2(pt.x * 3.1 + s, pt.z * 3.1, 7103) - 0.5) * 0.04;
        const ox = contactor.offsetX + jitterX;
        const hx = pt.x + pt.rx * ox;
        const hz = pt.z + pt.rz * ox;
        hooves.push({ x: hx, z: hz, contactor, softness, depthScale });
        stamps.push({
          x: hx, z: hz, dirX: pt.fx, dirZ: pt.fz, kind: contactor.stampKind || "hoof",
          side: contactor.side || 1,
          strength: contactor.strength.map((v, i) => Clamp01(v * (i === 3 ? depthScale * softness : 1))),
          widthScale, persistent: true, recordWithinM: 1e6,
        });
      }
      continue;
    }

    // 履带或车轮：生成每个接触单元在曲线上的实际轨迹点，弯道自然带出内外轮弧长差
    const effContactor = widthScale === 1 ? contactor : {
      ...contactor,
      widthM: contactor.widthM * widthScale,
      rimWidthM: (contactor.rimWidthM || contactor.widthM * 0.7) * widthScale,
    };
    const trackPts = samples.map((pt) => {
      const wob = wobbleM > 0 ? (ValueNoise2(pt.x * 0.25, pt.z * 0.25, 3109) - 0.5) * 2 * wobbleM : 0;
      const lat = contactor.offsetX + wob;
      return { x: pt.x + pt.rx * lat, z: pt.z + pt.rz * lat, fx: pt.fx, fz: pt.fz };
    });

    let along = 0;
    const stampStep = Math.max(0.12, contactor.segmentStepM || 0.22);
    let stampCarry = 0;
    for (let k = 1; k < trackPts.length; k++) {
      const p0 = trackPts[k - 1], p1 = trackPts[k];
      const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (d < 1e-4) continue;
      segments.push({
        p0: { x: p0.x, z: p0.z },
        p1: { x: p1.x, z: p1.z },
        contactor: effContactor,
        softness,
        depthScale,
        passes,
        phaseStartM: along,
      });

      // 沿实际轨迹以固定步长密集压出连续 GPU 微观印章，方向严格贴合曲线切线
      const dirX = (p1.x - p0.x) / d, dirZ = (p1.z - p0.z) / d;
      let cursor = stampCarry;
      while (cursor <= d) {
        const t = cursor / d;
        const passBoost = passes > 1 ? Math.min(1.35, 1 + 0.16 * (passes - 1)) : 1;
        stamps.push({
          x: p0.x + (p1.x - p0.x) * t,
          z: p0.z + (p1.z - p0.z) * t,
          dirX, dirZ,
          kind: contactor.stampKind || "tread",
          side: contactor.side || 0,
          strength: contactor.strength.map((v, i) => Clamp01(v * (i === 3 ? depthScale * softness * passBoost : passBoost))),
          widthScale: widthScale * (contactor.widthM / (contactor.stampKind === "ironWheel" ? 0.07 : contactor.stampKind === "tanketteTread" ? 0.21 : contactor.stampKind === "tire" ? 0.22 : 0.32)),
          lengthScale: (stampStep * 1.35) / (contactor.stampKind === "ironWheel" ? 0.32 : contactor.stampKind === "tanketteTread" ? 0.38 : contactor.stampKind === "tire" ? 0.42 : 0.56),
          persistent: true,
          recordWithinM: 1e6,
        });
        cursor += stampStep;
      }
      stampCarry = cursor - d;
      along += d;
    }
  }

  return { segments, hooves, stamps };
}
