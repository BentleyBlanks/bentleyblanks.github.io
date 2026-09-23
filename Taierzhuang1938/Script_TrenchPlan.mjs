// 壕沟规划层：把几条中心线编译成「一个可采样的开挖场 + 一串布设站」。
// **纯数学，不 import three** —— 与 Script_RoadPath / Script_WallPlan 同一条
// 纪律：纯 Node 的回归（Script_TrenchPlanTest）不起浏览器就能逐数验它。
// 几何预览在 Script_TrenchSpline，接线在 Data_FirstLevelMissionTerrain。
//
// ## 为什么壕沟也走样条
// 旧的壕沟是 7 条折线各带三个常量（depth / bottom / bank），高度场里一个
// `for (trench)` 循环把它们逐条 min 下去。问题不在数学而在读感：**整条沟从头
// 到尾一个宽度、一个深度、沟沿一刀切平**，七条沟还都一样 —— 实拍就是七条挤
// 出来的工业管槽。护壁也是同一笔账：Layout 里「每 5 m 两侧各一根桩」的双重
// 循环，间距、根数、倾斜全是常数。
// 收拢成：控制点 →（可选圆角）中心线 → 位置噪声决定逐点宽/深/抛土 → 分桶网格
// 加速采样 → 每米一站交给布设。
//
// ## 随机为什么是 2-D 位置噪声，不是弧长噪声
// 沿弧长抖宽度，在三岔口会出事：三条沟在同一个点上各自按自己的弧长取噪声，
// 同一块土会被要求同时挖成两种宽度，接口处必然出一道台阶。位置噪声
// `N(x,z)` 对**所有**段是同一张图，两段在同一点读到同一个值，拐角和三岔口
// 天然连续。代价是「沟的宽窄跟着地块走而不是跟着沟走」—— 正是想要的效果。
// 噪声通道的种子只挂在网络级（spec.seed + 通道名），不挂段 id，也是这个原因。
//
// ## 并集与抛土
// 开挖取并集（同一点被两段覆盖时取更深的那一个）：
//   cut_i = natural - depth_i(x,z) * (1 - Smooth((d_i - halfFloor_i) / bank_i))
//   height = min(height, min_i cut_i)
// 抛土堆只在「不落在任何一段的开挖坡内」时才加 —— 否则两条沟交汇处会把土堆
// 进邻沟的沟底，走进去就是一道半米高的坎。这条是硬规矩，不是抛光。
//
// ## 法向与 bermSide（与契约的唯一出入，见报告）
// 站点法向取 `n = (-tz, tx)`：对一条自西向东（t=+X）的沟，n 指向 +Z＝南。
// 于是 FrontTraverse（射击壕）写 `bermSide:"minus"` 时抛土堆落在 z<-124 的
// 北侧＝敌方，与数据里那句「北侧=敌方」对得上。契约 §3.2 写的 n=(tz,-tx)
// 会把同一句话读反，故此处按语义取 n，只差一个符号，D 的横断面对称不受影响。
//
// ## 热路径
// Apply / Corridor / Depth 被高度场烘焙与爆炸帧顶点色按每格点/每顶点调用。
// 内部是**整数键的分桶网格**（Script_TerrainDeformation 头注那笔账：字符串键
// 的格点查询能把爆炸帧吃掉一大半），每次查询只碰落在同一格里的几条边，
// 绝不遍历全部站点或全部段。回归里钉了一条计时断言：10 万次 Apply < 200 ms。

import { MakeRoadPath } from "./Script_RoadPath.mjs";
import { Mulberry32, HashString, ValueNoise2 } from "./Script_Noise.mjs";

/** 与 Data_FirstLevelMissionTerrain 里那个 Smooth 逐位相同 —— legacy 等价靠它。 */
const Smooth = (value) => {
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
};

/** 抛土堆剖面：在 [0,1] 内平滑起落，越界为 0（峰在 0.5）。 */
const Bump = (u) => (u <= 0 || u >= 1 ? 0 : (u < 0.5 ? Smooth(u * 2) : Smooth((1 - u) * 2)));

// bermSide 编码（热路径里不比字符串）
const SIDE_NONE = 0, SIDE_BOTH = 1, SIDE_PLUS = 2, SIDE_MINUS = 3;
const SideCode = (name) => (name === "both" ? SIDE_BOTH
  : name === "plus" ? SIDE_PLUS : name === "minus" ? SIDE_MINUS : SIDE_NONE);
const SideAllowed = (code, side) => (code === SIDE_BOTH ? true
  : code === SIDE_PLUS ? side > 0 : code === SIDE_MINUS ? side < 0 : false);

// --- 预设：布设参数的唯一真相（与 Script_WallSpline.WALL_PRESETS 同一条纪律）---
// 数值含义见 docs/Data_TrenchSpline.md。改这里＝改全关卡，编辑器滑杆只走
// SetTrenchPresetOverride（覆盖不落盘，基线永远在源码里）。
const REVETMENT = {
  spacingM: 4.5, spacingJitter: 0.35, skipChance: 0.12,
  slatsMin: 2, slatsMax: 4, postHMin: 0.85, postHMax: 1.05,
  slatLenM: 3.5, leanRad: 0.06, insetM: 0.18,
};
const DUCKBOARD = { chance: 0.3, lenM: 2.4, widthM: 0.7, thickM: 0.05 };
const BAYS = {
  everyM: 34, jitter: 0.4, lenMin: 3.5, lenMax: 5,
  h: 0.55, d: 0.9, side: "minus", maxCount: 6,
};
// placements 的 asset 必须是 Data_FirstLevelMissionFortifications.MISSION_DEFENSE_ASSETS
// 已登记的名字 —— 发一个没登记的名字，Fortifications 那边只会静默少一件。
const PROPS = {
  perM: 0.015,
  kinds: Object.freeze(["battlefieldSupplyBox", "battlefieldCompartmentCrate", "battlefieldCanvasCover01"]),
};

export const TRENCH_PRESETS = Object.freeze({
  // floorW：史料 + 本关玩法下限（契约 §5b）给的是 3.0，实跑不通过 —— 四人班在
  // 沟里错身时 Script_SquadMarchAi.CanPause 要求站点四向各 0.85 m 内地面高差
  // ≤0.35 m；人贴到离中线 0.78 m 时，那 0.85 m 就落到沟壁上，避让整个被关掉，
  // 两个对向的人永远互相让行（Script_SquadMarchCoverBrowserTest 死锁，实测 4.2
  // 通过、3.0 不过）。1.1 m 的坡上 0.35 m 高差只能容 0.27 m，反推最窄半宽要
  // ≥1.63−0.27=1.36，即 floorW ≥ 3.24（jitter 最窄 −16%）。取 3.4。
  communication: {
    label: "交通壕", depth: 2.0, floorW: 3.4, bankW: 1.1,
    bermH: 0.25, bermW: 1.6, bermSide: "both",
    floorJitter: 0.16, bankJitter: 0.22, depthJitter: 0.04, floorRutM: 0.03,
    noiseCellM: 9, bermCellM: 6, edgeJitterM: 0.12, edgeCellM: 3.2, bankRoughM: 0.07, bankRoughCellM: 1.8, cornerRadiusM: 0.6,
    revetment: { ...REVETMENT }, duckboard: { ...DUCKBOARD },
    bays: { ...BAYS }, props: { ...PROPS },
  },
  fire: {
    label: "射击壕", depth: 2.0, floorW: 2.6, bankW: 1.2,
    bermH: 0.42, bermW: 1.8, bermSide: "minus",
    floorJitter: 0.16, bankJitter: 0.22, depthJitter: 0.04, floorRutM: 0.03,
    noiseCellM: 9, bermCellM: 6, edgeJitterM: 0.12, edgeCellM: 3.2, bankRoughM: 0.07, bankRoughCellM: 1.8, cornerRadiusM: 0.6,
    revetment: { ...REVETMENT, spacingM: 4.0, skipChance: 0.08 },
    duckboard: { ...DUCKBOARD, chance: 0.22 },
    bays: { ...BAYS, everyM: 26, maxCount: 4 }, props: { ...PROPS },
  },
  evacuation: {
    label: "后送壕", depth: 2.0, floorW: 3.6, bankW: 1.6,
    bermH: 0.2, bermW: 1.6, bermSide: "both",
    floorJitter: 0.16, bankJitter: 0.22, depthJitter: 0.04, floorRutM: 0.03,
    noiseCellM: 9, bermCellM: 6, edgeJitterM: 0.12, edgeCellM: 3.2, bankRoughM: 0.07, bankRoughCellM: 1.8, cornerRadiusM: 0.8,
    revetment: { ...REVETMENT, spacingM: 5.0, slatLenM: 4.0 },
    duckboard: { ...DUCKBOARD, chance: 0.45, widthM: 0.9 },
    bays: { ...BAYS, maxCount: 2 }, props: { ...PROPS, perM: 0.01 },
  },
  loop: {
    label: "回环", depth: 2.0, floorW: 2.6, bankW: 1.1,
    bermH: 0.2, bermW: 1.4, bermSide: "both",
    floorJitter: 0.16, bankJitter: 0.22, depthJitter: 0.04, floorRutM: 0.03,
    noiseCellM: 9, bermCellM: 6, edgeJitterM: 0.12, edgeCellM: 3.2, bankRoughM: 0.07, bankRoughCellM: 1.8, cornerRadiusM: 0.5,
    revetment: { ...REVETMENT, spacingM: 4.0 }, duckboard: { ...DUCKBOARD },
    bays: { ...BAYS, maxCount: 0 }, props: { ...PROPS },
  },
  sap: {
    label: "敌方掘壕", depth: 2.0, floorW: 2.2, bankW: 1.2,
    bermH: 0.15, bermW: 1.2, bermSide: "both",
    floorJitter: 0.16, bankJitter: 0.22, depthJitter: 0.04, floorRutM: 0.03,
    noiseCellM: 9, bermCellM: 6, edgeJitterM: 0.12, edgeCellM: 3.2, bankRoughM: 0.07, bankRoughCellM: 1.8, cornerRadiusM: 0.4,
    revetment: { ...REVETMENT, skipChance: 0.35 },
    duckboard: { ...DUCKBOARD, chance: 0.1 },
    bays: { ...BAYS, maxCount: 0 }, props: { ...PROPS, perM: 0.008 },
  },
});

const NESTED_KEYS = ["revetment", "duckboard", "bays", "props"];

// --- 编辑器覆盖（基线在源码里，覆盖只活在本次会话）------------------------
const presetOverrides = new Map();
const segmentOverrides = new Map();
let revision = 1;

function MergePreset(base, patch) {
  if (!patch) return base;
  const out = { ...base, ...patch };
  for (const key of NESTED_KEYS) {
    if (patch[key]) out[key] = { ...base[key], ...patch[key] };
  }
  return out;
}

/** 预设 + 编辑器覆盖 合并后的只读拷贝。 */
export function TrenchPreset(name) {
  const base = TRENCH_PRESETS[name] || TRENCH_PRESETS.communication;
  const merged = MergePreset(base, presetOverrides.get(name));
  const out = { ...merged };
  for (const key of NESTED_KEYS) out[key] = Object.freeze({ ...merged[key] });
  return Object.freeze(out);
}

/** 编辑器滑杆 → 管线；返回新的 revision。 */
export function SetTrenchPresetOverride(name, patch) {
  presetOverrides.set(name, MergePreset(presetOverrides.get(name) || {}, patch));
  revision += 1;
  return revision;
}

export function ClearTrenchPresetOverrides() {
  presetOverrides.clear();
  revision += 1;
  return revision;
}

/** 编辑器拖点 / 段级参数（{points,depth,widthScale,...}）；patch=null 清掉。 */
export function SetTrenchSegmentOverride(id, patch) {
  if (patch == null) segmentOverrides.delete(id);
  else segmentOverrides.set(id, { ...(segmentOverrides.get(id) || {}), ...patch });
  revision += 1;
  return revision;
}

export function ClearTrenchSegmentOverrides() {
  segmentOverrides.clear();
  revision += 1;
  return revision;
}

/** 任一覆盖改动 +1；C 用它做编译缓存键。 */
export function TrenchRevision() {
  return revision;
}

// --- 圆角 -------------------------------------------------------------------
/**
 * 对内角做小圆角。半径夹到 0.5×较短邻边；圆角后中心线到原控制点的偏离恰为
 * `r·(1/cos(θ/2) − 1)`（θ = 转角，直线为 0）—— 回归按这条公式验。
 * radius = 0 时原样返回控制点，折线与旧公式逐位一致。
 */
function RoundCorners(points, radius) {
  const pts = points.map((p) => [p[0], p[1]]);
  if (!(radius > 0) || pts.length < 3) return { pts, corners: [] };
  const out = [[pts[0][0], pts[0][1]]];
  const corners = [];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    let ux = a[0] - b[0], uz = a[1] - b[1];
    let vx = c[0] - b[0], vz = c[1] - b[1];
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < 1e-6 || lv < 1e-6) { out.push([b[0], b[1]]); continue; }
    ux /= lu; uz /= lu; vx /= lv; vz /= lv;
    const cosA = Math.min(1, Math.max(-1, ux * vx + uz * vz));
    const theta = Math.PI - Math.acos(cosA);          // 转角：直线 0，掉头 π
    if (theta < 0.02 || theta > Math.PI - 0.05) { out.push([b[0], b[1]]); continue; }
    const half = theta / 2;
    const minLen = Math.min(lu, lv);
    let r = Math.min(radius, 0.5 * minLen);
    let t = r * Math.tan(half);
    if (t > 0.5 * minLen) { t = 0.5 * minLen; r = t / Math.tan(half); }
    const p0 = [b[0] + ux * t, b[1] + uz * t];
    const p1 = [b[0] + vx * t, b[1] + vz * t];
    let bx = ux + vx, bz = uz + vz;
    const lb = Math.hypot(bx, bz) || 1;
    bx /= lb; bz /= lb;
    const dist = Math.hypot(t, r);                    // = r / cos(θ/2)
    const ox = b[0] + bx * dist, oz = b[1] + bz * dist;
    const a0 = Math.atan2(p0[1] - oz, p0[0] - ox);
    const a1 = Math.atan2(p1[1] - oz, p1[0] - ox);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(da) / 0.35));
    // 弧用折线近似时，**弦比弧更远离控制点**（弦心距 r·cos(δ/2) < r），照半径
    // 直接取点会让实际偏离超过 r·(1/cos(θ/2)−1) 那条设计上界。把中间顶点推到
    // 外接半径 r/cos(δ/2)，弦正好切在设计圆上，偏离等于上界而不是越过它。
    const chord = Math.cos(Math.abs(da) / steps / 2);
    const rs = r / (chord || 1);
    out.push(p0);
    for (let k = 1; k < steps; k += 1) {
      const ang = a0 + (da * k) / steps;
      out.push([ox + Math.cos(ang) * rs, oz + Math.sin(ang) * rs]);
    }
    out.push(p1);
    corners.push({ x: b[0], z: b[1], r, theta, deviation: dist - r });
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return { pts: out, corners };
}

// --- 分桶网格（整数键，不拼字符串）-----------------------------------------
const GRID_CELL_M = 6;
const GRID_BIAS = 16384;
const GridKey = (ix, iz) => (ix + GRID_BIAS) * 32768 + (iz + GRID_BIAS);

// --- 编译 -------------------------------------------------------------------
/**
 * 把网络规格编译成可采样的 plan。
 *
 * @param spec  { version, seed, segments:[{ id, preset, role, points, source,
 *                routeBound, depth?, floorW?, bankW?, bermH?, bermW?, bermSide?,
 *                widthScale?, seed?, cornerRadiusM?, jitterScale? }] }
 * @param opts  natural      (x,z)=>自然地面高；只做 Apply 的第四参缺省值与预览用
 *              jitterScale  全局随机总闸（0 = 全部退化为常量宽/深）
 *              legacy       true = jitterScale 0 + cornerRadiusM 0 + bermH 0，
 *                           与旧 SampleMissionTerrain 的 trench 循环逐点相等
 */
export function CompileTrenchNetwork(spec, { natural = null, jitterScale = 1, legacy = false } = {}) {
  const seed = spec.seed || "trench";
  const globalJitter = legacy ? 0 : jitterScale;

  // 噪声通道：种子只挂网络级 + 通道名（见头注：接口处必须读到同一个值）
  const seedFloor = HashString(`${seed}:floor`);
  const seedBank = HashString(`${seed}:bank`);
  const seedDepth = HashString(`${seed}:depth`);
  const seedRut = HashString(`${seed}:rut`);
  const seedBerm = HashString(`${seed}:berm`);
  // 两路细尺度通道（2026-09-17 验收补的）：9 m 一档的宽度噪声在沟里平视时读不
  // 出来，沟沿仍是一条光滑曲线、坡面仍是一张挤出来的斜面。edge 给沟沿 3 m 一档
  // 的毛边（±edgeJitterM，米），rough 给坡面 1.8 m 一档的起伏（±bankRoughM，只在
  // 坡上，沟底与沟沿两端归零，不碰通行面也不碰 Rapier 的落地高度）。
  const seedEdge = HashString(`${seed}:edge`);
  const seedRough = HashString(`${seed}:rough`);

  const specSegments = spec.segments || [];
  const n = specSegments.length;
  const segs = [];

  // 逐段常量（热路径用平铺的数值数组，不走对象属性）
  const cFloorHalf = new Float64Array(n);
  const cFloorJ = new Float64Array(n);
  const cBank = new Float64Array(n);
  const cBankJ = new Float64Array(n);
  const cDepth = new Float64Array(n);
  const cDepthJ = new Float64Array(n);
  const cRut = new Float64Array(n);
  const cBermH = new Float64Array(n);
  const cBermW = new Float64Array(n);
  const cBermSide = new Int32Array(n);
  const cJitter = new Int32Array(n);
  const cReach = new Float64Array(n);
  const cReachSq = new Float64Array(n);
  const cCellInv = new Float64Array(n);
  const cRutInv = new Float64Array(n);
  const cBermCellInv = new Float64Array(n);
  const cEdgeJ = new Float64Array(n);
  const cEdgeInv = new Float64Array(n);
  const cRough = new Float64Array(n);
  const cRoughInv = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    const raw = specSegments[i];
    const seg = { ...raw, ...(segmentOverrides.get(raw.id) || {}) };
    const preset = TrenchPreset(seg.preset);
    const widthScale = seg.widthScale ?? 1;
    const js = globalJitter * (seg.jitterScale ?? 1);
    const depth = seg.depth ?? preset.depth;
    const floorW = (seg.floorW ?? preset.floorW) * widthScale;
    const bankW = seg.bankW ?? preset.bankW;
    const bermH = legacy ? 0 : (seg.bermH ?? preset.bermH);
    const bermW = seg.bermW ?? preset.bermW;
    const bermSide = seg.bermSide ?? preset.bermSide;
    const cornerRadiusM = legacy ? 0 : (seg.cornerRadiusM ?? preset.cornerRadiusM);

    cFloorHalf[i] = floorW / 2;
    cFloorJ[i] = preset.floorJitter * js;
    cBank[i] = bankW;
    cBankJ[i] = preset.bankJitter * js;
    cDepth[i] = depth;
    cDepthJ[i] = preset.depthJitter * js;
    cRut[i] = preset.floorRutM * js;
    cBermH[i] = bermH;
    cBermW[i] = bermW;
    cBermSide[i] = bermH > 0 ? SideCode(bermSide) : SIDE_NONE;
    cJitter[i] = js > 0 ? 1 : 0;
    cEdgeJ[i] = (preset.edgeJitterM ?? 0) * js;
    cEdgeInv[i] = 1 / (preset.edgeCellM || 3.2);
    cRough[i] = (preset.bankRoughM ?? 0) * js;
    cRoughInv[i] = 1 / (preset.bankRoughCellM || 1.8);

    const maxHalfTop = cFloorHalf[i] * (1 + cFloorJ[i]) + cEdgeJ[i] + bankW * (1 + cBankJ[i]);
    cReach[i] = maxHalfTop + (cBermSide[i] !== SIDE_NONE ? bermW : 0) + 1e-6;
    cReachSq[i] = cReach[i] * cReach[i];
    cCellInv[i] = 1 / preset.noiseCellM;
    cRutInv[i] = 4 / preset.noiseCellM;
    cBermCellInv[i] = 1 / preset.bermCellM;

    const control = (seg.points || []).map((p) => (Array.isArray(p)
      ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }));
    const rounded = RoundCorners(control.map((p) => [p.x, p.z]), cornerRadiusM);
    const path = MakeRoadPath(rounded.pts, { subdivisions: 1 });

    segs.push({
      index: i,
      id: seg.id,
      role: seg.role ?? null,
      preset: seg.preset,
      routeBound: seg.routeBound ?? false,
      source: seg.source || "",
      control,
      nominal: Object.freeze({ depth, floorW, bankW, bermH, bermW, bermSide }),
      corners: rounded.corners,
      path,
      dense: path.points,
      cornerRadiusM,
      jitterScale: js,
      // frameLengthM: lay the stations and the dressing out as if the segment were this long (arc length
      // from its start). Re-routing or trimming a segment's tail then leaves every station, revetment,
      // duckboard, bay and prop before the change byte-identical (the 2026-09-23 01-06 rebuild moved
      // FrontCommunication's north end; the 07+ dressing along its 220 m must not reshuffle).
      frameLength: seg.frameLengthM > 0 ? seg.frameLengthM : null,
      stations: [],
      junctions: [],
      bounds: null,
      preset_: preset,
    });
  }

  // --- 逐点场（位置噪声）---------------------------------------------------
  const HalfFloorAt = (i, x, z) => {
    if (!cJitter[i]) return cFloorHalf[i];
    const c = cCellInv[i], e = cEdgeInv[i];
    return cFloorHalf[i] * (1 + cFloorJ[i] * (ValueNoise2(x * c, z * c, seedFloor) * 2 - 1))
      + cEdgeJ[i] * (ValueNoise2(x * e, z * e, seedEdge) * 2 - 1);
  };
  const BankAt = (i, x, z) => {
    if (!cJitter[i]) return cBank[i];
    const c = cCellInv[i];
    return cBank[i] * (1 + cBankJ[i] * (ValueNoise2(x * c, z * c, seedBank) * 2 - 1));
  };
  const DepthAt = (i, x, z) => {
    if (!cJitter[i]) return cDepth[i];
    const c = cCellInv[i], r = cRutInv[i];
    return cDepth[i] * (1 + cDepthJ[i] * (ValueNoise2(x * c, z * c, seedDepth) * 2 - 1))
      + cRut[i] * (ValueNoise2(x * r, z * r, seedRut) * 2 - 1);
  };
  const BermHAt = (i, x, z) => {
    if (!cJitter[i]) return cBermH[i];
    const c = cBermCellInv[i];
    return cBermH[i] * (0.6 + 0.4 * ValueNoise2(x * c, z * c, seedBerm));
  };

  // --- 边表 + 分桶网格 -----------------------------------------------------
  let edgeCount = 0;
  for (const seg of segs) edgeCount += Math.max(0, seg.dense.length - 1);
  const ex0 = new Float64Array(edgeCount);
  const ez0 = new Float64Array(edgeCount);
  const edx = new Float64Array(edgeCount);
  const edz = new Float64Array(edgeCount);
  const einv = new Float64Array(edgeCount);
  const elen = new Float64Array(edgeCount);
  const es0 = new Float64Array(edgeCount);
  const eseg = new Int32Array(edgeCount);
  const buckets = new Map();
  {
    let e = 0;
    for (const seg of segs) {
      const pts = seg.dense;
      const reach = cReach[seg.index];
      let acc = 0;
      for (let k = 0; k < pts.length - 1; k += 1, e += 1) {
        const x0 = pts[k][0], z0 = pts[k][1];
        const dx = pts[k + 1][0] - x0, dz = pts[k + 1][1] - z0;
        const len = Math.hypot(dx, dz);
        ex0[e] = x0; ez0[e] = z0; edx[e] = dx; edz[e] = dz;
        einv[e] = 1 / (dx * dx + dz * dz || 1);
        elen[e] = len; es0[e] = acc; eseg[e] = seg.index;
        acc += len;
        const loX = Math.floor((Math.min(x0, x0 + dx) - reach) / GRID_CELL_M);
        const hiX = Math.floor((Math.max(x0, x0 + dx) + reach) / GRID_CELL_M);
        const loZ = Math.floor((Math.min(z0, z0 + dz) - reach) / GRID_CELL_M);
        const hiZ = Math.floor((Math.max(z0, z0 + dz) + reach) / GRID_CELL_M);
        for (let ix = loX; ix <= hiX; ix += 1) {
          for (let iz = loZ; iz <= hiZ; iz += 1) {
            const key = GridKey(ix, iz);
            const list = buckets.get(key);
            if (list) list.push(e); else buckets.set(key, [e]);
          }
        }
      }
    }
  }
  const cells = new Map();
  for (const [key, list] of buckets) cells.set(key, Int32Array.from(list));

  // --- 查询用的复用暂存（单线程，绝不每次分配）-----------------------------
  const mark = new Int32Array(n);
  const bestD2 = new Float64Array(n);
  const bestEdge = new Int32Array(n);
  const bestT = new Float64Array(n);
  const hits = new Int32Array(n);
  let generation = 0;
  let hitCount = 0;

  /** 落在同一格里的边逐条量距离；每段只留最近的那条。返回命中的段数。 */
  function Gather(x, z) {
    hitCount = 0;
    const list = cells.get(GridKey(Math.floor(x / GRID_CELL_M), Math.floor(z / GRID_CELL_M)));
    if (list === undefined) return 0;
    generation += 1;
    const gen = generation;
    for (let k = 0; k < list.length; k += 1) {
      const e = list[k];
      const px = x - ex0[e], pz = z - ez0[e];
      let t = (px * edx[e] + pz * edz[e]) * einv[e];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - edx[e] * t, qz = pz - edz[e] * t;
      const d2 = qx * qx + qz * qz;
      const si = eseg[e];
      if (mark[si] !== gen) {
        mark[si] = gen; bestD2[si] = d2; bestEdge[si] = e; bestT[si] = t;
        hits[hitCount] = si; hitCount += 1;
      } else if (d2 < bestD2[si]) {
        bestD2[si] = d2; bestEdge[si] = e; bestT[si] = t;
      }
    }
    return hitCount;
  }

  /** 该点的开挖深度（0 = 沟外）。顶点色按这个调。 */
  function Depth(x, z) {
    const count = Gather(x, z);
    let deepest = 0;
    for (let k = 0; k < count; k += 1) {
      const si = hits[k];
      if (bestD2[si] >= cReachSq[si]) continue;          // 平方先挡一道，sqrt 留给真候选
      const d = Math.sqrt(bestD2[si]);
      const half = HalfFloorAt(si, x, z);
      const bank = BankAt(si, x, z);
      const cut = 1 - Smooth((d - half) / bank);
      if (cut <= 0) continue;
      const dep = DepthAt(si, x, z) * cut;
      if (dep > deepest) deepest = dep;
    }
    return deepest;
  }

  /**
   * 开挖并集 + 抛土堆。替换旧的 `for (const trench of spec.trenches)` 循环。
   * height 是当前已算到这一步的高度，natural 是自然地面（缺省走编译期的 natural）。
   */
  function Apply(x, z, height, naturalY) {
    const count = Gather(x, z);
    if (count === 0) return height;
    const base = naturalY === undefined
      ? (natural ? natural(x, z) : height) : naturalY;
    let deepest = 0;
    let outside = true;
    let berm = 0;
    for (let k = 0; k < count; k += 1) {
      const si = hits[k];
      if (bestD2[si] >= cReachSq[si]) continue;
      const d = Math.sqrt(bestD2[si]);
      const half = HalfFloorAt(si, x, z);
      const bank = BankAt(si, x, z);
      const halfTop = half + bank;
      if (d <= halfTop) {
        outside = false;
        const t = (d - half) / bank;
        let dep = DepthAt(si, x, z) * (1 - Smooth(t));
        // 坡面粗糙度：Bump(t) 在沟底（t≤0）与沟沿（t≥1）归零，只揉坡面那一段
        if (t > 0 && cRough[si] > 0) {
          const r = cRoughInv[si];
          dep -= cRough[si] * (ValueNoise2(x * r, z * r, seedRough) * 2 - 1) * Bump(t);
        }
        if (dep > deepest) deepest = dep;
      } else if (cBermSide[si] !== SIDE_NONE) {
        const u = (d - halfTop) / cBermW[si];
        if (u < 1) {
          const e = bestEdge[si];
          const len = elen[e] || 1;
          // n = (-tz, tx)：对自西向东的沟指向 +Z（南）。见头注。
          const nx = -edz[e] / len, nz = edx[e] / len;
          const side = (x - ex0[e]) * nx + (z - ez0[e]) * nz;
          if (SideAllowed(cBermSide[si], side)) {
            const h = BermHAt(si, x, z) * Bump(u);
            if (h > berm) berm = h;
          }
        }
      }
    }
    let out = height;
    if (deepest > 0) {
      const cut = base - deepest;
      if (cut < out) out = cut;
    }
    // 抛土只在「不落在任何一段的开挖坡内」时才加 —— 否则土堆进邻沟的沟底。
    if (outside && berm > 0) out += berm;
    return out;
  }

  /** 最近段的走廊信息（null = 不在任何段的影响范围内）。 */
  function Corridor(x, z, reach = Infinity) {
    const count = Gather(x, z);
    let bestSeg = -1, bestSq = Infinity;
    for (let k = 0; k < count; k += 1) {
      const si = hits[k];
      if (bestD2[si] < bestSq) { bestSq = bestD2[si]; bestSeg = si; }
    }
    if (bestSeg < 0) return null;
    const bestDist = Math.sqrt(bestSq);
    if (bestDist > reach || bestDist >= cReach[bestSeg]) return null;
    const e = bestEdge[bestSeg];
    const len = elen[e] || 1;
    const nx = -edz[e] / len, nz = edx[e] / len;
    const side = (x - ex0[e]) * nx + (z - ez0[e]) * nz;
    const halfFloor = HalfFloorAt(bestSeg, x, z);
    const bank = BankAt(bestSeg, x, z);
    return {
      id: segs[bestSeg].id,
      s: es0[e] + len * bestT[bestSeg],
      d: bestDist,
      side: side >= 0 ? 1 : -1,
      halfFloor, bank, halfTop: halfFloor + bank,
      inFloor: bestDist <= halfFloor,
      inCut: bestDist <= halfFloor + bank,
    };
  }

  // --- 站点（每米一站）-----------------------------------------------------
  // junctionClear 与布设的「离别段太近就让开」是同一条规矩，旧写法是
  // `other.bottom/2 + 2`；这里等价成 `别段 halfFloor + 1.2`（halfFloor 已经是
  // 半宽，旧的 bottom/2 也是半宽，余量 2 → 1.2 是因为新沟底窄了 1 m）。
  const JUNCTION_MARGIN_M = 1.2;
  function NearestOnSegment(si, x, z) {
    const pts = segs[si].dense;
    let best = Infinity, bestS = 0;
    let acc = 0;
    for (let k = 0; k < pts.length - 1; k += 1) {
      const x0 = pts[k][0], z0 = pts[k][1];
      const dx = pts[k + 1][0] - x0, dz = pts[k + 1][1] - z0;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - x0) * dx + (z - z0) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = x - x0 - dx * t, qz = z - z0 - dz * t;
      const d = Math.hypot(qx, qz);
      if (d < best) { best = d; bestS = acc + Math.sqrt(len2) * t; }
      acc += Math.sqrt(len2);
    }
    return { d: best, s: bestS };
  }
  function JunctionClearAt(si, x, z) {
    for (let sj = 0; sj < n; sj += 1) {
      if (sj === si) continue;
      const near = NearestOnSegment(sj, x, z);
      if (near.d >= cReach[sj] + JUNCTION_MARGIN_M) continue;
      const p = segs[sj].path.At(near.s);
      if (near.d < HalfFloorAt(sj, p.x, p.z) + JUNCTION_MARGIN_M) return true;
    }
    return false;
  }

  for (const seg of segs) {
    const { path } = seg;
    const frame = seg.frameLength ?? path.length;
    const steps = Math.max(1, Math.round(frame));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i <= steps; i += 1) {
      const s = (frame * i) / steps;
      if (s > path.length + 1e-9) break;
      const p = path.At(s);
      const nx = -p.tz, nz = p.tx;
      const halfFloor = HalfFloorAt(seg.index, p.x, p.z);
      const bank = BankAt(seg.index, p.x, p.z);
      const depth = DepthAt(seg.index, p.x, p.z);
      const halfTop = halfFloor + bank;
      const code = cBermSide[seg.index];
      const crest = halfTop + cBermW[seg.index] / 2;
      const bermPlus = SideAllowed(code, 1)
        ? BermHAt(seg.index, p.x + nx * crest, p.z + nz * crest) : 0;
      const bermMinus = SideAllowed(code, -1)
        ? BermHAt(seg.index, p.x - nx * crest, p.z - nz * crest) : 0;
      seg.stations.push({
        s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, nx, nz,
        halfFloor, bank, depth, bermPlus, bermMinus,
        junctionClear: JunctionClearAt(seg.index, p.x, p.z),
      });
      const reach = cReach[seg.index];
      if (p.x - reach < minX) minX = p.x - reach;
      if (p.x + reach > maxX) maxX = p.x + reach;
      if (p.z - reach < minZ) minZ = p.z - reach;
      if (p.z + reach > maxZ) maxZ = p.z + reach;
    }
    seg.bounds = Object.freeze({ minX, maxX, minZ, maxZ });
  }

  // --- junction 识别 -------------------------------------------------------
  // 端点落在别段中心线上 → "T"（别段中段）或 "end"（端点对端点）；
  // 两段中段真交叉 → "cross"。全网再按位置去重成一张三岔口表。
  const END_TOLERANCE_M = 1.5;
  const events = [];
  for (let si = 0; si < n; si += 1) {
    const a = segs[si];
    for (const endS of [0, a.path.length]) {
      const p = a.path.At(endS);
      for (let sj = 0; sj < n; sj += 1) {
        if (sj === si) continue;
        const b = segs[sj];
        const near = NearestOnSegment(sj, p.x, p.z);
        const q = b.path.At(near.s);
        const reach = Math.max(1.0, HalfFloorAt(sj, q.x, q.z));
        if (near.d > reach) continue;
        const atEnd = near.s < END_TOLERANCE_M || near.s > b.path.length - END_TOLERANCE_M;
        const kind = atEnd ? "end" : "T";
        a.junctions.push({ s: endS, x: p.x, z: p.z, otherId: b.id, otherS: near.s, kind });
        events.push({ x: p.x, z: p.z, members: [{ id: a.id, s: endS }, { id: b.id, s: near.s }] });
      }
    }
  }
  for (let si = 0; si < n; si += 1) {
    for (let sj = si + 1; sj < n; sj += 1) {
      const a = segs[si], b = segs[sj];
      const pa = a.dense, pb = b.dense;
      let accA = 0;
      for (let i = 0; i < pa.length - 1; i += 1) {
        const ax = pa[i][0], az = pa[i][1];
        const adx = pa[i + 1][0] - ax, adz = pa[i + 1][1] - az;
        const aLen = Math.hypot(adx, adz);
        let accB = 0;
        for (let k = 0; k < pb.length - 1; k += 1) {
          const bx = pb[k][0], bz = pb[k][1];
          const bdx = pb[k + 1][0] - bx, bdz = pb[k + 1][1] - bz;
          const bLen = Math.hypot(bdx, bdz);
          const den = adx * bdz - adz * bdx;
          if (Math.abs(den) > 1e-9) {
            const t = ((bx - ax) * bdz - (bz - az) * bdx) / den;
            const u = ((bx - ax) * adz - (bz - az) * adx) / den;
            if (t > 0 && t < 1 && u > 0 && u < 1) {
              const sA = accA + aLen * t, sB = accB + bLen * u;
              const endA = sA < END_TOLERANCE_M || sA > a.path.length - END_TOLERANCE_M;
              const endB = sB < END_TOLERANCE_M || sB > b.path.length - END_TOLERANCE_M;
              if (!endA && !endB) {
                const x = ax + adx * t, z = az + adz * t;
                a.junctions.push({ s: sA, x, z, otherId: b.id, otherS: sB, kind: "cross" });
                b.junctions.push({ s: sB, x, z, otherId: a.id, otherS: sA, kind: "cross" });
                events.push({ x, z, members: [{ id: a.id, s: sA }, { id: b.id, s: sB }] });
              }
            }
          }
          accB += bLen;
        }
        accA += aLen;
      }
    }
  }
  const junctions = [];
  for (const ev of events) {
    let cluster = junctions.find((j) => Math.hypot(j.x - ev.x, j.z - ev.z) <= END_TOLERANCE_M);
    if (!cluster) { cluster = { x: ev.x, z: ev.z, members: [] }; junctions.push(cluster); }
    for (const m of ev.members) {
      if (!cluster.members.some((o) => o.id === m.id)) cluster.members.push({ ...m });
    }
  }

  // --- 组装 ---------------------------------------------------------------
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const outSegments = segs.map((seg) => {
    minX = Math.min(minX, seg.bounds.minX); maxX = Math.max(maxX, seg.bounds.maxX);
    minZ = Math.min(minZ, seg.bounds.minZ); maxZ = Math.max(maxZ, seg.bounds.maxZ);
    return Object.freeze({
      id: seg.id, role: seg.role, preset: seg.preset,
      routeBound: seg.routeBound, source: seg.source,
      control: seg.control, nominal: seg.nominal, corners: seg.corners,
      path: seg.path, stations: seg.stations, junctions: seg.junctions,
      bounds: seg.bounds,
      cornerRadiusM: seg.cornerRadiusM, jitterScale: seg.jitterScale, frameLength: seg.frameLength,
      params: seg.preset_,
      // 逐点场的段级出口（回归与编辑器按段取样用；Corridor 在三岔口会跳到邻段）
      HalfFloorAt: (x, z) => HalfFloorAt(seg.index, x, z),
      BankAt: (x, z) => BankAt(seg.index, x, z),
      DepthAt: (x, z) => DepthAt(seg.index, x, z),
      BermHAt: (x, z) => BermHAt(seg.index, x, z),
    });
  });

  const trenches = segs.map((seg) => Object.freeze({
    id: seg.id, role: seg.role,
    points: seg.control.map((p) => Object.freeze({ x: p.x, z: p.z })),
    depth: seg.nominal.depth, bottom: seg.nominal.floorW, bank: seg.nominal.bankW,
  }));

  return Object.freeze({
    revision, seed, version: spec.version ?? 1,
    segments: Object.freeze(outSegments),
    junctions: Object.freeze(junctions),
    bounds: Object.freeze({ minX, maxX, minZ, maxZ }),
    natural,
    Apply, Corridor, Depth,
    trenches: Object.freeze(trenches),
  });
}

// --- 布设 -------------------------------------------------------------------
const LANE_CUT_SEGMENTS = ["BundleApproach"];

/** 旋转矩形包住一个点（含外扩）。 */
function InRotatedRect(px, pz, rect, margin) {
  const c = Math.cos(rect.ry || 0), s = Math.sin(rect.ry || 0);
  const dx = px - rect.x, dz = pz - rect.z;
  return Math.abs(dx * c - dz * s) < rect.w / 2 + margin
    && Math.abs(dx * s + dz * c) < rect.d / 2 + margin;
}

/** 路线（折线）每 0.5 m 一个采样点穿过这个旋转矩形（旧清理网的口径）。 */
function RouteCrosses(routes, rect, margin) {
  const c = Math.cos(rect.ry || 0), s = Math.sin(rect.ry || 0);
  const reach = Math.hypot(rect.w, rect.d) / 2 + margin;
  for (const route of routes) {
    if (!route || route.length < 2) continue;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1], b = route[i];
      const ax = a.x ?? a[0], az = a.z ?? a[1];
      const bx = b.x ?? b[0], bz = b.z ?? b[1];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-6) continue;
      // 线段包围盒先挡一道：整关几十条路线，逐条走满是白烧
      if (Math.min(ax, bx) - reach > rect.x || Math.max(ax, bx) + reach < rect.x
        || Math.min(az, bz) - reach > rect.z || Math.max(az, bz) + reach < rect.z) continue;
      for (let d = 0; d <= length; d += 0.5) {
        const x = ax + ((bx - ax) * d) / length - rect.x;
        const z = az + ((bz - az) * d) / length - rect.z;
        if (Math.abs(x * c - z * s) < rect.w / 2 + margin
          && Math.abs(x * s + z * c) < rect.d / 2 + margin) return true;
      }
    }
  }
  return false;
}

/**
 * 沿编译好的中心线布设护壁 / 踏板 / 射击位 / 杂物。
 *
 * 随机全部确定性（Mulberry32(HashString(seed + segId + ":" + 通道))），同种子
 * 两次结果逐位相同 —— 布设进的是烘焙结果，每次重建都换一套就没法做视觉比对。
 *
 * @param plan        CompileTrenchNetwork 的结果
 * @param groundAt    (x,z)=>烘完的地面高。**必须传宿主那一份**（沟底已经挖下去了）
 * @param avoidRoutes [[{x,z},...],...] 任务/AI 路线；件与路线相交就跳过
 * @param keepOut     [{x,z,w,d,ry}] 手摆体块占地（外扩 0.5 m）
 * @param laneCuts    (x,z,w,d,margin)=>bool，只对 laneCutSegments 里的段生效
 * @returns { blocks, placements, stats }
 *   blocks     与 Layout 的 Block() 记录同形，y 已经算好
 *   placements 外部模型件 { id, asset, x, z, ry, scale, solid }
 */
export function PlanTrenchDressing(plan, {
  groundAt,
  avoidRoutes = [],
  keepOut = [],
  laneCuts = null,
  laneCutSegments = LANE_CUT_SEGMENTS,
  seed = plan.seed,
} = {}) {
  const blocks = [];
  const placements = [];
  const stats = {
    revetments: 0, duckboards: 0, bays: 0, props: 0,
    skipped: { route: 0, keepOut: 0, junction: 0, lane: 0 },
  };
  const laneSet = new Set(laneCutSegments || []);
  const ROUTE_MARGIN = 0.9;
  const KEEPOUT_MARGIN = 0.5;
  const END_CLEAR_M = 3;
  const BAY_CLEAR_M = 6;

  const Blocked = (segId, rect, useLane) => {
    if (RouteCrosses(avoidRoutes, rect, ROUTE_MARGIN)) { stats.skipped.route += 1; return true; }
    for (const box of keepOut) {
      const pad = Math.max(rect.w, rect.d) / 2 + KEEPOUT_MARGIN;
      if (InRotatedRect(rect.x, rect.z, box, pad)) { stats.skipped.keepOut += 1; return true; }
    }
    if (useLane && laneCuts && laneSet.has(segId)) {
      const c = Math.abs(Math.cos(rect.ry || 0)), s = Math.abs(Math.sin(rect.ry || 0));
      if (laneCuts(rect.x, rect.z, c * rect.w + s * rect.d, s * rect.w + c * rect.d, 0.8)) {
        stats.skipped.lane += 1; return true;
      }
    }
    return false;
  };

  for (const seg of plan.segments) {
    const p = seg.params;
    const stations = seg.stations;
    const length = seg.path.length;
    // frame = the arc length the stations were laid out for (= length unless the segment pins frameLengthM).
    const frame = seg.frameLength ?? length;
    const frameSteps = Math.max(1, Math.round(frame));
    if (!stations.length || length < 2 * END_CLEAR_M) continue;
    const IndexAt = (s) => Math.min(stations.length - 1,
      Math.max(0, Math.round((s / frame) * frameSteps)));
    const StationAt = (s) => stations[IndexAt(s)];

    // --- 护壁：每 spacingM 一组，两侧各自抽签 ---
    const rev = p.revetment;
    const rnd = Mulberry32(HashString(`${seed}:${seg.id}:revetment`));
    const board = Mulberry32(HashString(`${seed}:${seg.id}:duckboard`));
    let s = END_CLEAR_M + rnd() * rev.spacingM * 0.5;
    while (s <= length - END_CLEAR_M) {
      const k = IndexAt(s);
      const st = stations[k];
      const step = rev.spacingM * (1 + rev.spacingJitter * (rnd() * 2 - 1));
      // 站距是 length/round(length)，略小于 1 m：snap 之后可能倒退到 3 m 以内，
      // 端头净空得按**站点自己的 s** 判，不能按游标 s 判。
      if (st.s < END_CLEAR_M || st.s > length - END_CLEAR_M) {
        s += Math.max(1, step);
        continue;
      }
      if (st.junctionClear) {
        stats.skipped.junction += 1;
        s += Math.max(1, step);
        continue;
      }
      const ry = Math.atan2(st.tx, st.tz);
      for (const side of [-1, 1]) {
        const lean = (rnd() - 0.5) * 2 * rev.leanRad;
        const postH = Math.min(st.depth,
          rev.postHMin + rnd() * (rev.postHMax - rev.postHMin));
        const slats = rev.slatsMin
          + Math.floor(rnd() * (rev.slatsMax - rev.slatsMin + 1));
        if (rnd() < rev.skipChance) continue;
        const off = st.halfFloor + rev.insetM;
        const x = st.x + st.nx * side * off;
        const z = st.z + st.nz * side * off;
        const id = `${seg.id}Revetment${k}_${side}`;
        const unit = { x, z, w: 0.13, d: rev.slatLenM, ry: ry + lean };
        if (Blocked(seg.id, unit, true)) continue;
        const ground = groundAt(x, z);
        blocks.push({
          id: `${id}Post`, x, y: ground - 0.05 + postH / 2, z,
          w: 0.13, h: postH, d: 0.17, semantic: "timber", ry: ry + lean, solid: false,
        });
        const rise = (postH - 0.25) / Math.max(1, slats - 1);
        for (let level = 0; level < slats; level += 1) {
          blocks.push({
            id: `${id}Slat${level}`, x, y: ground + 0.15 + level * rise, z,
            w: 0.07, h: 0.16, d: rev.slatLenM, semantic: "timber",
            ry: ry + lean, solid: false,
          });
        }
        stats.revetments += 1;
      }

      // --- 踏板：沟底中线偏一点，长边沿切向 ---
      const duck = p.duckboard;
      if (board() < duck.chance) {
        const lateral = (board() < 0.5 ? -1 : 1) * 0.3;
        const x = st.x + st.nx * lateral;
        const z = st.z + st.nz * lateral;
        const rect = { x, z, w: duck.widthM, d: duck.lenM, ry };
        if (!Blocked(seg.id, rect, true)) {
          blocks.push({
            id: `${seg.id}Duckboard${k}`, x, y: groundAt(x, z) + duck.thickM / 2, z,
            w: duck.widthM, h: duck.thickM, d: duck.lenM,
            semantic: "timber", ry, solid: false,
          });
          stats.duckboards += 1;
        }
      }
      s += Math.max(1, step);
    }

    // --- 射击位：沟沿一侧，面朝沟外，离三岔口和段端都得让开 ---
    const bays = p.bays;
    if (bays.maxCount > 0 && length > 2 * BAY_CLEAR_M) {
      const bayRnd = Mulberry32(HashString(`${seed}:${seg.id}:bay`));
      const sideSign = bays.side === "plus" ? 1 : -1;
      let placed = 0;
      const count = Math.max(1, Math.round(frame / bays.everyM));
      for (let i = 0; i < count && placed < bays.maxCount; i += 1) {
        const nominal = (frame * (i + 0.5)) / count;
        const bs = nominal + (bayRnd() * 2 - 1) * bays.jitter * bays.everyM * 0.5;
        if (bs < BAY_CLEAR_M || bs > length - BAY_CLEAR_M) continue;
        const st = StationAt(bs);
        if (st.s < BAY_CLEAR_M || st.s > length - BAY_CLEAR_M) continue;
        const w = bays.lenMin + bayRnd() * (bays.lenMax - bays.lenMin);
        const off = st.halfFloor + st.bank + 0.5;
        const x = st.x + st.nx * sideSign * off;
        const z = st.z + st.nz * sideSign * off;
        if (plan.junctions.some((j) => Math.hypot(j.x - x, j.z - z) < BAY_CLEAR_M)) continue;
        const ry = Math.atan2(-st.tz, st.tx);
        const rect = { x, z, w, d: bays.d, ry };
        if (Blocked(seg.id, rect, true)) continue;
        blocks.push({
          id: `${seg.id}TrenchBay${placed}`, x, y: groundAt(x, z) + bays.h / 2, z,
          w, h: bays.h, d: bays.d, semantic: "cover", ry, solid: true,
          cover: { faceX: st.nx * sideSign, faceZ: st.nz * sideSign },
        });
        stats.bays += 1;
        placed += 1;
      }
    }

    // --- 杂物：沟底随机撒，只发登记过的资产名 ---
    const props = p.props;
    const total = Math.round(frame * props.perM);
    if (total > 0 && props.kinds.length) {
      const propRnd = Mulberry32(HashString(`${seed}:${seg.id}:props`));
      for (let i = 0; i < total; i += 1) {
        const ps = END_CLEAR_M + propRnd() * Math.max(0, frame - 2 * END_CLEAR_M);
        const st = StationAt(ps);
        if (ps > length - END_CLEAR_M) {
          // Past a trimmed tail: burn the draws this prop would have taken so the ones after keep their values.
          propRnd(); propRnd(); propRnd(); continue;
        }
        if (st.junctionClear) { stats.skipped.junction += 1; continue; }
        const lateral = (propRnd() * 2 - 1) * Math.max(0, st.halfFloor - 0.55);
        const x = st.x + st.nx * lateral;
        const z = st.z + st.nz * lateral;
        const ry = Math.atan2(st.tx, st.tz) + (propRnd() * 2 - 1) * 0.5;
        if (Blocked(seg.id, { x, z, w: 0.9, d: 0.9, ry }, true)) continue;
        placements.push({
          id: `${seg.id}TrenchProp${i}`,
          asset: props.kinds[Math.floor(propRnd() * props.kinds.length) % props.kinds.length],
          x, z, ry, scale: 1, solid: false,
        });
        stats.props += 1;
      }
    }
  }

  return { blocks, placements, stats };
}

export default CompileTrenchNetwork;
