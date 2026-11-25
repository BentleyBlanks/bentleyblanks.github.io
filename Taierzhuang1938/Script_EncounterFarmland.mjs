// 遭遇设计编辑器、场景编辑器与 Play/正式战役共用的农田条带、道路 Splat 权重与宏观调色规则。
// 纯 JS 模块：零 three、零 DOM，Node 测试、浏览器 Worker 与主线程共用。

import { MakeRoadPath, SampleRun } from "./Script_RoadPath.mjs";

const F = Object.freeze;
const Clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const SmoothStep = (edge0, edge1, x) => {
  const t = Clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function InsidePolygon(point, polygon) {
  let inside = false;
  const px = point[0], pz = point[1];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], zi = polygon[i][1];
    const xj = polygon[j][0], zj = polygon[j][1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function FieldHash01(...seeds) {
  let h = 2166136261 >>> 0;
  for (const s of seeds) { h ^= (Math.round(s * 7919) + 0x9e3779b9) >>> 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// 06-10 耿家庄条田分区与条带（原定义在 Data_EditorBlockoutFirstLevel0610Space.mjs，拆至此处避免把整份 0105/0610 空间表拖进主游戏模块图）。
export const L0610_FIELD_ZONES = F([
  F({ id: "W", name: "河西", angle: 6, poly: F([[-18, 205], [12, 205], [16, 240], [10, 290], [8, 340], [12, 372], [-18, 372]]) }),
  F({ id: "WW", name: "河西南", angle: -4, poly: F([[-18, 380], [10, 380], [14, 430], [18, 480], [22, 520], [24, 548], [-18, 548]]) }),
  F({ id: "M", name: "河汊子和凹路之间", angle: -5, poly: F([[44, 206], [80, 206], [84, 220], [86, 245], [85, 262], [89, 282], [94, 302], [92, 324], [95, 346], [97, 362], [95, 372], [44, 372], [40, 352], [46, 332], [50, 304], [48, 284], [40, 266], [36, 246], [40, 224]]) }),
  F({ id: "E1", name: "凹路东边", angle: 3, poly: F([[108, 206], [205, 206], [205, 296], [196, 330], [180, 358], [165, 366], [108, 366], [104, 345], [101, 322], [103, 302], [97, 282]]) }),
  F({ id: "E2", name: "驿道两边", angle: -8, poly: F([[205, 206], [318, 206], [318, 300], [290, 340], [262, 380], [238, 376], [228, 366], [214, 352], [205, 296]]) }),
  F({ id: "SE", name: "庄子东南", angle: 5, poly: F([[241, 384], [318, 384], [318, 560], [128, 560], [128, 556], [238, 552], [246, 470], [250, 440], [258, 410]]) }),
]);
const L0610_FIELD_KINDS = ["wheat", "wheat", "wheat", "plowed", "fallow"];
function BuildL0610Fields() {
  const pieces = [];
  for (const zone of L0610_FIELD_ZONES) {
    const xs = zone.poly.map((p) => p[0]), zs = zone.poly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    let row = 0;
    for (let bz = minZ - 25; bz < maxZ + 10; row++) {
      const bd = 70 + FieldHash01(zone.angle, row, 1) * 70;
      let col = 0;
      for (let bx = minX - 25; bx < maxX + 10; col++) {
        const bw = 50 + FieldHash01(zone.angle, row, col, 2) * 60;
        const cx = bx + bw / 2, cz = bz + bd / 2;
        const keep = [[0, 0], [-bw / 4, -bd / 4], [bw / 4, -bd / 4], [-bw / 4, bd / 4], [bw / 4, bd / 4]].some(([ox, oz]) => InsidePolygon([cx + ox, cz + oz], zone.poly));
        if (keep) {
          const turn = FieldHash01(zone.angle, row, col, 3) < 0.25 ? 90 : 0;
          const angleDeg = zone.angle + (FieldHash01(zone.angle, row, col, 4) - 0.5) * 28 + turn;
          const whole = FieldHash01(zone.angle, row, col, 17) < 0.2;
          const strips = [];
          let u = -bw / 2;
          while (u < bw / 2 - 0.01) {
            const w = whole ? bw : Math.min(10 + FieldHash01(zone.angle, row, col, strips.length, 6) * 22, bw / 2 - u);
            strips.push(F({ from: Math.round(u * 100) / 100, to: Math.round((u + w) * 100) / 100, kind: L0610_FIELD_KINDS[Math.floor(FieldHash01(zone.angle, row, col, strips.length, 7) * L0610_FIELD_KINDS.length)] }));
            u += w;
          }
          pieces.push(F({ id: `${zone.id}_${row}_${col}`, zone: zone.id, x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10, w: Math.round(bw * 10) / 10, d: Math.round(bd * 10) / 10, angleDeg: Math.round(angleDeg * 10) / 10, whole, strips: F(strips) }));
        }
        bx += bw;
      }
      bz += bd;
    }
  }
  return F(pieces);
}
export const L0610_FIELDS = BuildL0610Fields();

// 1938 年 3 月中旬（惊蛰后）鲁南条田的图层权重与低频宏观调色（sRGB 倍率，[1,1,1] = 原贴图不变）。
// 权重语义与 Data_Tuning_Terrain.TERRAIN_SETS.MissionPlain 一致：
//   track = CartTrack(1)，spoil = SpoilEarth(3)，stubble = DryStubble(2)，余量 = FieldSoil(0)。
export const FARMLAND_SPLAT_PRESETS = Object.freeze({
  wheatRich:   Object.freeze({ track: 0.00, spoil: 0.00, stubble: 0.90, tint: Object.freeze([0.74, 0.96, 0.62]) }),
  wheat:       Object.freeze({ track: 0.00, spoil: 0.00, stubble: 0.80, tint: Object.freeze([0.82, 0.98, 0.68]) }),
  wheatSparse: Object.freeze({ track: 0.00, spoil: 0.04, stubble: 0.66, tint: Object.freeze([0.92, 0.98, 0.74]) }),
  plowedFresh: Object.freeze({ track: 0.00, spoil: 0.48, stubble: 0.04, tint: Object.freeze([0.88, 0.78, 0.68]) }),
  plowed:      Object.freeze({ track: 0.00, spoil: 0.36, stubble: 0.08, tint: Object.freeze([0.94, 0.84, 0.72]) }),
  stubble:     Object.freeze({ track: 0.04, spoil: 0.06, stubble: 0.52, tint: Object.freeze([1.08, 0.99, 0.80]) }),
  fallow:      Object.freeze({ track: 0.06, spoil: 0.08, stubble: 0.22, tint: Object.freeze([1.02, 0.97, 0.88]) }),
  garden:      Object.freeze({ track: 0.00, spoil: 0.14, stubble: 0.78, tint: Object.freeze([0.68, 0.92, 0.56]) }),
  sandy:       Object.freeze({ track: 0.32, spoil: 0.06, stubble: 0.12, tint: Object.freeze([1.12, 1.07, 0.94]) }),
  bund:        Object.freeze({ track: 0.46, spoil: 0.12, stubble: 0.16, tint: Object.freeze([1.05, 0.98, 0.86]) }),
});

// 前沿随机种子的条田（与原 L1Map0107/Base.mjs 同种子）。
export function FrontPaperFields() {
  let seed = 1938031;
  const Random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const fields = [], kinds = ["wheat", "wheat", "wheat", "plowed", "fallow"];
  for (let z = -42; z < 216; z += 60 + Random() * 45) {
    for (let x = -190; x < 340; x += 45 + Random() * 40) {
      const width = 50 + Random() * 60, depth = 70 + Random() * 70;
      const angle = 4 + (Random() - 0.5) * 28 + (Random() < 0.25 ? 90 : 0);
      const whole = Random() < 0.2, strips = [];
      for (let offset = -width / 2; offset < width / 2;) {
        const stripWidth = whole ? width : 10 + Random() * 22;
        strips.push({ from: offset, to: Math.min(width / 2, offset + stripWidth), kind: kinds[Math.floor(Random() * kinds.length)] });
        offset += stripWidth;
      }
      fields.push({ zone: "FrontPaper", x: x + width / 2, z: z + depth / 2, w: width, d: depth, angleDeg: angle, strips });
    }
  }
  return fields;
}

// 北沙河单村合并版 z >= 206 的 12 片多角度鲁南条田垧区（犬牙凹凸紧贴村缘与河道）。
export function MergedFieldZones(maxZ = 990) {
  return [
    { id: "MergedWestRailN", poly: [[-160, 206], [-83.2, 206], [-83.2, 530], [-122, 538], [-160, 532]] },
    { id: "MergedWestRailS", poly: [[-160, 532.6], [-122, 538.6], [-83.2, 530.6], [-83.2, 822], [-160, 834]] },
    { id: "MergedNorthWest", poly: [[-75.5, 206], [94.8, 206], [94.8, 474], [58, 480], [26, 471], [-20, 478], [-75.5, 474]] },
    { id: "MergedNorthEast", poly: [[105.5, 206], [320, 206], [320, 482], [268, 474], [228, 482], [192, 475], [156, 472], [105.5, 474]] },
    {
      id: "MergedWestPlainN",
      poly: [
        [-75.5, 474.6], [-20, 478.6], [26, 471.6], [56, 480.6],
        [47, 502], [53, 526], [62, 548], [52, 566], [44, 594], [54, 624], [58, 638],
        [14, 642], [-30, 633], [-75.5, 639],
      ],
    },
    {
      id: "MergedWestPlainS",
      poly: [
        [-75.5, 639.6], [-30, 633.6], [14, 642.6], [58, 638.6],
        [61, 658], [52, 682], [38, 704], [48, 728], [56, 748],
        [20.5, 756], [18, 796], [-44, 798], [-75.5, 804],
      ],
    },
    { id: "MergedNorthBankStrip", poly: [[21.1, 756.6], [51.5, 756.6], [48.5, 788], [20.5, 798]] },
    {
      id: "MergedEastPlainN",
      poly: [
        [228, 482.6], [268, 474.6], [320, 482.6], [320, 626], [272, 632],
        [214, 624], [224, 588], [220, 566], [209, 544], [216, 518], [228, 498],
      ],
    },
    {
      id: "MergedEastPlainS",
      poly: [
        [214, 624.6], [272, 632.6], [320, 626.6], [320, 766], [256, 750],
        [218, 732], [222, 692], [214, 668], [207, 648],
      ],
    },
    { id: "MergedSouthBankW", poly: [[-160, 876], [-83.2, 876], [-83.2, maxZ], [-160, maxZ]] },
    { id: "MergedSouthBankMid", poly: [[-75.5, 876], [96, 876], [88, 932], [95, maxZ], [-75.5, maxZ]] },
    { id: "MergedSouthBankFarE", poly: [[96.6, 876], [320, 876], [320, maxZ], [95.6, maxZ], [88.6, 932]] },
  ];
}

export function MergedPaperFields(maxZ = 990) {
  let seed = 19380314;
  const Random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const zones = MergedFieldZones(maxZ);
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));
  const fields = [];
  const MAIN_KINDS = [
    "wheatRich", "wheatRich", "wheatRich", "wheatSparse", "wheatSparse",
    "plowedFresh", "plowedFresh", "stubble", "stubble", "wheatRich",
  ];
  const RIVER_KINDS = ["wheatSparse", "plowedFresh", "stubble", "sandy", "sandy", "wheatRich", "stubble"];
  const GARDEN_KINDS = ["garden", "garden", "wheatRich", "plowedFresh", "garden", "stubble"];

  const AddTiltedSector = (zoneId, angleDeg, tractWRange, tractDRange, opts = {}) => {
    const zone = zoneById[zoneId];
    if (!zone) return;
    const xs = zone.poly.map((p) => p[0]), zs = zone.poly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZVal = Math.max(...zs);
    const ox = (minX + maxX) / 2, oz = (minZ + maxZVal) / 2;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [px, pz] of zone.poly) {
      const dx = px - ox, dz = pz - oz;
      const u = dx * cos - dz * sin, v = dx * sin + dz * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const vBreaks = [minV - 2];
    while (vBreaks.at(-1) < maxV + 2) {
      vBreaks.push(vBreaks.at(-1) + tractDRange[0] + Random() * (tractDRange[1] - tractDRange[0]));
    }
    for (let vi = 0; vi < vBreaks.length - 1; vi++) {
      const v0 = vBreaks[vi] + 0.45, v1 = vBreaks[vi + 1] - 0.45;
      if (v1 - v0 < 10) continue;
      const uBreaks = [minU - 2];
      while (uBreaks.at(-1) < maxU + 2) {
        uBreaks.push(uBreaks.at(-1) + tractWRange[0] + Random() * (tractWRange[1] - tractWRange[0]));
      }
      for (let ui = 0; ui < uBreaks.length - 1; ui++) {
        const u0 = uBreaks[ui] + 0.45, u1 = uBreaks[ui + 1] - 0.45;
        if (u1 - u0 < 8) continue;
        const w = u1 - u0, d = v1 - v0;
        const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
        const wx = ox + uc * cos + vc * sin;
        const wz = oz - uc * sin + vc * cos;
        const samples = [
          [wx, wz],
          [ox + u0 * cos + v0 * sin, oz - u0 * sin + v0 * cos],
          [ox + u1 * cos + v0 * sin, oz - u1 * sin + v0 * cos],
          [ox + u1 * cos + v1 * sin, oz - u1 * sin + v1 * cos],
          [ox + u0 * cos + v1 * sin, oz - u0 * sin + v1 * cos],
          [ox + uc * cos + v0 * sin, oz - uc * sin + v0 * cos],
          [ox + uc * cos + v1 * sin, oz - uc * sin + v1 * cos],
        ];
        if (!samples.some((pt) => InsidePolygon(pt, zone.poly))) continue;

        const isNearVillage = opts.gardenTest ? opts.gardenTest(wx, wz) : false;
        const isNearRiver = opts.riverTest ? opts.riverTest(wx, wz) : false;
        const palette = isNearVillage ? GARDEN_KINDS : isNearRiver ? RIVER_KINDS : MAIN_KINDS;
        const strips = [];
        const targetStripW = isNearVillage ? (5.5 + Random() * 3.5) : (7.0 + Random() * 6.5);
        const stripCount = Math.max(2, Math.min(7, Math.round(w / targetStripW)));
        let cursor = -w / 2;
        let prevKind = null;
        for (let s = 0; s < stripCount; s++) {
          const isLast = s === stripCount - 1;
          const step = isLast ? (w / 2 - cursor) : (w / stripCount) * (0.76 + Random() * 0.48);
          const to = isLast ? w / 2 : Math.min(w / 2 - 2.5, cursor + step);
          let kind = palette[Math.floor(Random() * palette.length)];
          if (kind === prevKind && Random() < 0.55) kind = palette[Math.floor(Random() * palette.length)];
          prevKind = kind;
          strips.push({ from: Number(cursor.toFixed(2)), to: Number(to.toFixed(2)), kind });
          cursor = to;
        }
        fields.push({
          zone: zoneId,
          x: Number(wx.toFixed(2)), z: Number(wz.toFixed(2)),
          w: Number(w.toFixed(2)), d: Number(d.toFixed(2)),
          angleDeg, strips,
        });
      }
    }
  };

  AddTiltedSector("MergedWestRailN", -11, [28, 42], [54, 82]);
  AddTiltedSector("MergedWestRailS", 78, [30, 44], [52, 78], { riverTest: (_x, z) => z > 785 });
  AddTiltedSector("MergedNorthWest", 10, [30, 46], [56, 86], { gardenTest: (x, z) => x > 32 && z > 445 });
  AddTiltedSector("MergedNorthEast", -14, [32, 48], [56, 88], { gardenTest: (x, z) => x < 225 && z > 448 });
  AddTiltedSector("MergedWestPlainN", 76, [26, 40], [48, 72], { gardenTest: (x, z) => x > 22 && z > 495 && z < 632 });
  AddTiltedSector("MergedWestPlainS", -15, [28, 42], [46, 70], {
    gardenTest: (x, z) => x > 20 && z < 756,
    riverTest: (_x, z) => z > 770,
  });
  AddTiltedSector("MergedNorthBankStrip", 12, [16, 24], [24, 34], { gardenTest: () => true });
  AddTiltedSector("MergedEastPlainN", -13, [28, 42], [50, 74], { gardenTest: (x) => x < 242 });
  AddTiltedSector("MergedEastPlainS", 74, [26, 40], [48, 72], {
    gardenTest: (x, z) => x < 240 && z < 715,
    riverTest: (_x, z) => z > 728,
  });
  AddTiltedSector("MergedSouthBankW", 12, [28, 44], [52, 76], { riverTest: (_x, z) => z < 906 });
  AddTiltedSector("MergedSouthBankMid", -11, [30, 46], [50, 78], {
    riverTest: (_x, z) => z < 902,
    gardenTest: (x, z) => x > -52 && x < -4 && z > 904 && z < 968,
  });
  AddTiltedSector("MergedSouthBankFarE", 79, [32, 48], [54, 82], { riverTest: (_x, z) => z < 904 });
  return fields;
}

/** 按场景 id 返回遭遇场景共用的农田条带与分区表（仅 FirstLevelEncounter / FirstLevelMerged）。 */
export function EncounterFarmlandForScene(sceneId, maxZ = 1440) {
  if (sceneId === "FirstLevelMerged") {
    return {
      fields: [...FrontPaperFields(), ...MergedPaperFields(maxZ)],
      fieldZones: [
        { id: "FrontPaper", poly: [[-160, -12], [330, -12], [330, 206], [-160, 206]] },
        ...MergedFieldZones(maxZ),
      ],
    };
  }
  if (sceneId === "FirstLevelEncounter") {
    return {
      fields: [...FrontPaperFields(), ...L0610_FIELDS],
      fieldZones: [
        { id: "FrontPaper", poly: [[-160, -12], [330, -12], [330, 206], [-160, 206]] },
        ...L0610_FIELD_ZONES,
      ],
    };
  }
  return null;
}

/**
 * 为农田条带建立空间分桶索引（32 m 一桶），让数百万像素/顶点的查询从 O(N) 降到 O(1)。
 * 同时对每个垧区建外包框，便于区分垧内田埂间隙与垧外空地。
 */
export function CompileFarmlandFieldGrid(fields = [], fieldZones = [], bucketM = 32) {
  const zoneMap = new Map();
  const compiledZones = [];
  for (const zone of fieldZones || []) {
    if (!zone?.poly?.length) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const pt of zone.poly) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minZ) minZ = pt[1];
      if (pt[1] > maxZ) maxZ = pt[1];
    }
    const entry = { id: zone.id, poly: zone.poly, minX, maxX, minZ, maxZ, merged: String(zone.id).startsWith("Merged") };
    zoneMap.set(zone.id, entry);
    compiledZones.push(entry);
  }
  const buckets = new Map();
  const zoneBuckets = new Map();
  const Insert = (map, minX, maxX, minZ, maxZ, item) => {
    const ix0 = Math.floor(minX / bucketM), ix1 = Math.floor(maxX / bucketM);
    const iz0 = Math.floor(minZ / bucketM), iz1 = Math.floor(maxZ / bucketM);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const key = `${ix},${iz}`;
        let list = map.get(key);
        if (!list) { list = []; map.set(key, list); }
        list.push(item);
      }
    }
  };
  for (const z of compiledZones) {
    if (z.merged) Insert(zoneBuckets, z.minX, z.maxX, z.minZ, z.maxZ, z);
  }
  for (const field of fields || []) {
    const zone = zoneMap.get(field.zone);
    if (!zone) continue;
    const rad = (field.angleDeg || 0) * Math.PI / 180;
    const cosine = Math.cos(rad), sine = Math.sin(rad);
    const hw = field.w * 0.5, hd = field.d * 0.5;
    const ax = Math.abs(cosine) * hw + Math.abs(sine) * hd;
    const az = Math.abs(sine) * hw + Math.abs(cosine) * hd;
    const minX = Math.max(zone.minX, field.x - ax), maxX = Math.min(zone.maxX, field.x + ax);
    const minZ = Math.max(zone.minZ, field.z - az), maxZ = Math.min(zone.maxZ, field.z + az);
    if (minX > maxX || minZ > maxZ) continue;
    const compiled = {
      x: field.x, z: field.z, hw, hd, cosine, sine,
      strips: field.strips,
      polygon: zone.poly,
      merged: zone.merged,
      minX, maxX, minZ, maxZ,
    };
    Insert(buckets, minX, maxX, minZ, maxZ, compiled);
  }
  return { bucketM, buckets, zoneBuckets };
}

/** 查询世界坐标 (x, z) 落入的条田种类与 Splat/调色预设；不在条田内返回 null。 */
export function SampleFarmlandStrip(compiled, x, z) {
  if (!compiled) return null;
  const key = `${Math.floor(x / compiled.bucketM)},${Math.floor(z / compiled.bucketM)}`;
  const list = compiled.buckets.get(key);
  if (list) {
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      const dx = x - f.x, dz = z - f.z;
      const u = dx * f.cosine - dz * f.sine;
      const v = dx * f.sine + dz * f.cosine;
      if (Math.abs(u) > f.hw || Math.abs(v) > f.hd) continue;
      if (!InsidePolygon([x, z], f.polygon)) continue;
      const strips = f.strips;
      let kind = strips[strips.length - 1].kind;
      for (let s = 0; s < strips.length; s++) {
        if (u >= strips[s].from && u < strips[s].to) { kind = strips[s].kind; break; }
      }
      return { kind, preset: FARMLAND_SPLAT_PRESETS[kind] || FARMLAND_SPLAT_PRESETS.fallow };
    }
  }
  // 合并版垧区内、相邻两块条田之间的 0.9 m 间隙自动作为硬土田埂（不靠 0.28 m 亚像素细线混叠）
  const zones = compiled.zoneBuckets.get(key);
  if (zones) {
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
      if (InsidePolygon([x, z], zone.poly)) return { kind: "bund", preset: FARMLAND_SPLAT_PRESETS.bund };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 道路 / 院坪 Splat 与解析车辙横向距离栅格（供遭遇编辑器与 Play/场景编辑器共用）

const ROAD_TIER_ORDER = Object.freeze({ footpath: 0, villageAlley: 1, villageStreet: 2, guandao: 3 });

function InferRoadKind(road) {
  if (road.kind) return road.kind;
  const w = road.width || 3;
  if (w >= 4.0) return "guandao";
  if (w >= 2.4) return "villageStreet";
  return "villageAlley";
}

function PointToPoint2(pt) {
  return Array.isArray(pt) ? [pt[0], pt[1]] : [pt.x, pt.z];
}

/**
 * 按真实道路等级与样条曲线烘焙两张标量场：
 *   T (Float32Array): 踩实路面权重（CartTrack，紧致过渡边，由片元 Height Lerp 自动咬合自然路缘）
 *   R (Float32Array): 道路横向有符号距离 ÷ encodeRangeM，夹在 [-1, 1]（无车辙区 = 1.0）。
 *     距离场向路外延伸至 halfW + 1.5 m 并保持同侧符号连续，杜绝双线性插值跨零产生假车辙。
 */
export function BuildRoadSplatRaster(roads, footpaths, floors, bounds, { cellM: startCellM = 0.5, maxCells = 4000000, encodeRangeM = 4 } = {}) {
  const minX = bounds.minX, maxX = bounds.maxX, minZ = bounds.minZ, maxZ = bounds.maxZ;
  if (!(maxX > minX && maxZ > minZ)) return null;
  let cellM = startCellM;
  while (((maxX - minX) / cellM + 1) * ((maxZ - minZ) / cellM + 1) > maxCells) cellM *= 2;
  const cols = Math.ceil((maxX - minX) / cellM) + 1;
  const rows = Math.ceil((maxZ - minZ) / cellM) + 1;
  const total = cols * rows;
  const T = new Float32Array(total);
  const R = new Float32Array(total).fill(1);
  const bestRutDist = new Float32Array(total).fill(Infinity);

  // 1) 院坪 / 场坪多边形先写入较温和的硬地权重（不压车辙）
  for (const floor of floors || []) {
    const pts = (floor.points || []).map(PointToPoint2);
    if (pts.length < 3) continue;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const p of pts) {
      if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0];
      if (p[1] < bz0) bz0 = p[1]; if (p[1] > bz1) bz1 = p[1];
    }
    const pad = 0.8;
    const i0 = Math.max(0, Math.floor((bx0 - pad - minX) / cellM));
    const i1 = Math.min(cols - 1, Math.ceil((bx1 + pad - minX) / cellM));
    const j0 = Math.max(0, Math.floor((bz0 - pad - minZ) / cellM));
    const j1 = Math.min(rows - 1, Math.ceil((bz1 + pad - minZ) / cellM));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + j * cellM;
      for (let i = i0; i <= i1; i++) {
        const x = minX + i * cellM;
        if (InsidePolygon([x, z], pts)) {
          const at = j * cols + i;
          if (T[at] < 0.72) T[at] = 0.72;
        }
      }
    }
  }

  // 2) 分级样条道路与田间小径（低级先写、高级官道覆写）
  const entries = [
    ...(footpaths || []).map((pts, idx) => ({
      id: `Footpath_${idx}`,
      kind: "footpath",
      points: (pts || []).map(PointToPoint2),
      width: 1.1,
      widthJitter: 0.12,
    })),
    ...(roads || []).map((road, idx) => ({
      id: road.id || `Road_${idx}`,
      kind: InferRoadKind(road),
      points: (road.points || []).map(PointToPoint2),
      width: road.width || 3.2,
      widthJitter: road.widthJitter ?? (InferRoadKind(road) === "guandao" ? 0.05 : 0.04),
    })),
  ].filter((e) => e.points.length >= 2);
  entries.sort((a, b) => (ROAD_TIER_ORDER[a.kind] ?? 2) - (ROAD_TIER_ORDER[b.kind] ?? 2));

  const stamp = new Int32Array(total);
  const minDist = new Float32Array(total);
  const bestSigned = new Float32Array(total);
  const bestHalf = new Float32Array(total);
  const touched = [];
  let roadId = 0;

  for (const entry of entries) {
    let path;
    try { path = MakeRoadPath(entry.points); } catch { continue; }
    const samples = SampleRun(path, 0, path.length, 1.5);
    if (samples.length < 2) continue;
    roadId += 1;
    touched.length = 0;
    const baseHalf = Math.max(0.4, entry.width * 0.5);
    const jitterAmp = entry.widthJitter || 0;
    const seed = [...String(entry.id)].reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 17) * 0.001;
    const HalfAt = (s) => baseHalf * (1 + jitterAmp * (0.65 * Math.sin(s * 0.21 + seed) + 0.35 * Math.cos(s * 0.47 - seed * 1.7)));
    const hasRuts = entry.kind === "guandao" || (entry.kind === "villageStreet" && entry.width >= 3.2);
    const maxTrack = entry.kind === "guandao" ? 1.0 : entry.kind === "villageStreet" ? 0.92 : entry.kind === "villageAlley" ? 0.86 : 0.78;
    const vergeStart = entry.kind === "footpath" ? 0.72 : 0.84;
    const vergeEnd = entry.kind === "footpath" ? 1.24 : 1.18;
    const rutExtraM = hasRuts ? 1.6 : 0;

    for (let k = 0; k < samples.length - 1; k++) {
      const a = samples[k], b = samples[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const segLen = Math.sqrt(len2);
      const midHalf = HalfAt((a.s + b.s) * 0.5);
      const reach = Math.max(midHalf * vergeEnd, midHalf + rutExtraM) + cellM;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - minX) / cellM));
      const i1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x) + reach - minX) / cellM));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach - minZ) / cellM));
      const j1 = Math.min(rows - 1, Math.ceil((Math.max(a.z, b.z) + reach - minZ) / cellM));
      for (let j = j0; j <= j1; j++) {
        const z = minZ + j * cellM;
        const rowOff = j * cols;
        for (let i = i0; i <= i1; i++) {
          const x = minX + i * cellM;
          const u = Clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
          const px = a.x + dx * u, pz = a.z + dz * u;
          const dist = Math.hypot(x - px, z - pz);
          const s = a.s + segLen * u;
          const half = HalfAt(s);
          const maxR = Math.max(half * vergeEnd, half + rutExtraM);
          if (dist > maxR) continue;
          const cross = dx * (z - a.z) - dz * (x - a.x);
          const signed = cross < 0 ? -dist : dist;
          const at = rowOff + i;
          if (stamp[at] !== roadId) {
            stamp[at] = roadId;
            minDist[at] = dist;
            bestSigned[at] = signed;
            bestHalf[at] = half;
            touched.push(at);
          } else if (dist < minDist[at]) {
            minDist[at] = dist;
            bestSigned[at] = signed;
            bestHalf[at] = half;
          }
        }
      }
    }

    for (let idx = 0; idx < touched.length; idx++) {
      const at = touched[idx];
      const dist = minDist[at];
      const half = bestHalf[at];
      const t = dist / half;
      const w = (1 - SmoothStep(vergeStart, vergeEnd, t)) * maxTrack;
      if (w > T[at]) T[at] = w;
      if (hasRuts && dist < bestRutDist[at]) {
        bestRutDist[at] = dist;
        R[at] = Clamp(bestSigned[at] / encodeRangeM, -1, 1);
      }
    }
  }

  return HydrateRoadSplatRaster({ cellM, minX, minZ, cols, rows, T, R });
}

export function HydrateRoadSplatRaster(raster) {
  if (!raster) return null;
  const { cellM, minX, minZ, cols, rows, T, R } = raster;
  const Sample = (x, z, out = [0, 1]) => {
    const gx = (x - minX) / cellM, gz = (z - minZ) / cellM;
    if (!(gx >= 0 && gz >= 0 && gx <= cols - 1 && gz <= rows - 1)) {
      out[0] = 0; out[1] = 1;
      return out;
    }
    const i = Math.min(cols - 2, Math.floor(gx)), j = Math.min(rows - 2, Math.floor(gz));
    if (i < 0 || j < 0) { out[0] = 0; out[1] = 1; return out; }
    const u = gx - i, v = gz - j;
    const a00 = j * cols + i, a10 = a00 + 1, a01 = a00 + cols, a11 = a01 + 1;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    out[0] = T[a00] * w00 + T[a10] * w10 + T[a01] * w01 + T[a11] * w11;
    const r00 = R[a00], r10 = R[a10], r01 = R[a01], r11 = R[a11];
    // 只有四角均连续（没有夹杂 1.0 哨兵与负侧跳变）才双线性插值车辙坐标，避免路外插出假零点
    const maxSpread = Math.max(r00, r10, r01, r11) - Math.min(r00, r10, r01, r11);
    if (maxSpread < 0.85) {
      out[1] = r00 * w00 + r10 * w10 + r01 * w01 + r11 * w11;
    } else {
      const ni = u < 0.5 ? i : i + 1, nj = v < 0.5 ? j : j + 1;
      out[1] = R[nj * cols + ni];
    }
    return out;
  };
  return { ...raster, Sample };
}

// ---------------------------------------------------------------------------
// 场景 authored paint → 低频宏观调色规则（保留条田/弹坑烧焦/河滩沙洲/菜园色相，不覆盖细节贴图）

function HexRgb(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// 将 paint 颜色温和归一化为贴图倍率（避免把已经带明暗的 PBR 贴图压黑或拉爆）
function SoftTintFromHex(hex, baseLuma = 0.62, strength = 0.55) {
  const rgb = HexRgb(hex);
  if (!rgb) return null;
  const out = [1, 1, 1];
  for (let c = 0; c < 3; c++) {
    const ratio = Clamp(rgb[c] / baseLuma, 0.55, 1.32);
    out[c] = 1 + (ratio - 1) * strength;
  }
  return out;
}

/** 场景 paint 项 → 低频宏观调色倍率 [r, g, b]（sRGB 0–1.5，[1,1,1] = 不调色）；返回 null 表示该项不改色。 */
export function PaintMacroTintFor(item) {
  if (!item) return null;
  if (typeof item.tint === "string" && /^#[0-9a-f]{6}$/i.test(item.tint)) return HexRgb(item.tint);
  if (Array.isArray(item.tint) && item.tint.length === 3 && item.tint.every((v) => Number.isFinite(v) && v >= 0 && v <= 2)) {
    return item.tint;
  }
  const id = String(item.id || "");
  if (/^BombScorch/.test(id)) return [0.54, 0.50, 0.46];
  if (/^Rail(North|South)/.test(id)) return [0.72, 0.72, 0.75];
  if (/^(VillageFringe_W1|VillageFringe_W3|VillageFringe_E|Village_InnerGardenW|Garden_)/.test(id)) return [0.78, 0.95, 0.66];
  if (/^Wheat_/.test(id)) return [0.80, 0.96, 0.66];
  if (/^(SandBar_|SandBed$)/.test(id)) return SoftTintFromHex(item.color, 0.60, 0.45) || [1.10, 1.05, 0.92];
  if (/^SandBedDamp/.test(id)) return [0.82, 0.82, 0.78];
  if (/^(ThreshingFloor|Village_InnerGardenMid|VillageFringe_W2|GateYard)/.test(id)) return [1.08, 1.03, 0.92];
  if (/^(Village|Lizihang|RailSecYard_Base|BridgeSouthHamlet_Base)$/.test(id)) return [1.05, 1.01, 0.93];
  if (/^Field_/.test(id)) return SoftTintFromHex(item.color, 0.56, 0.55);
  return null;
}
