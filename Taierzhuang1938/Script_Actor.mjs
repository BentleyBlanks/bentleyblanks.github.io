// 《血战台儿庄》程序化人物：模型 + 动画。
//
// 为什么全部手搭骨架而不用 SkinnedMesh：
//   深度法线预通道靠 scene.overrideMaterial 覆盖全场（见 Script_Post.mjs 的帧结构第 1 步），
//   覆盖材质里没有 skinning 的 define 和 uniform，蒙皮网格在那一 pass 里会整个塌到原点，
//   于是 SSAO 拿到一团乱码、墙角全是黑斑。所以人物一律 Object3D 层级 + 逐帧写
//   rotation/quaternion，每根骨头就是一个 Group，底下挂着若干已经合批好的静态网格。
//
// 三条贯穿本文件的规矩：
//   1) **零 Math.random**。个体差异（身高、军装深浅、待机相位、鞋子）全部来自
//      Mulberry32(HashString(kind + seed))。视觉审查靠逐轮截图比对，人物自己在抖
//      就没法判断「这一版比上一版好」。
//   2) **按材质分桶合并**。一根骨头下面可能有十几个盒子，但它们按材质合并成 1—3 个
//      网格再挂上去。24 人同屏是硬指标，一个盒子一个 mesh 直接把 draw call 打爆。
//      quality 从 high 降到 low 主要就是在合并材质桶（手并进袖子、帽徽并掉）。
//   3) **几何按 kind 缓存、材质按个体着色**。身高的 ±4% 个体差走 root.scale，
//      手持武器再乘一个 1/scale 抵消 —— 枪长是史实数据，不许跟着人一起缩放。
//
// 史实红线（改造型之前先看 docs/Data_HistoryMaterial.md 第三节）：
//   · 中方第 2 集团军**没有钢盔**，是灰蓝土布军帽 + 青天白日帽徽；
//   · 日军 1938 年 3—4 月是**立领昭五式 + 步兵红领章**，**没有屁帘**（垂布 6 月 1 日才配发）；
//   · 中方子弹带必须大面积瘪着、只有靠身几格鼓 —— 这是一眼读出「缺弹」的美术语言。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp, Clamp01, SmoothStep } from "./Script_Noise.mjs";
import { MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

const Lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 色板：全部抄自 docs/Data_HistoryMaterial.md 第三节，别在这里即兴发挥。
// ---------------------------------------------------------------------------
const HEX = {
  // 中方：军装是自染土布，「同一个连队深浅不一」，所以是四档而不是一个色
  nraCloth: [0x5C6674, 0x6E7684, 0x828A93, 0x8A8778],
  nraPuttee: 0x7C8188,
  nraWebbing: [0x8C8467, 0x7B7660, 0x6F6A55],
  badgeBlue: 0x1F3A93,
  badgeWhite: 0xEDEFF2,
  strawShoe: 0xC4A96C,
  clothShoe: 0x2B2B2E,
  towel: 0xEDE9DF,
  redBinding: 0x9E2B22,            // 大刀柄尾铁环上缠的红布
  // 日方
  ijaCloth: [0x7C7350, 0x8B8158, 0x968C6E],
  ijaCollar: 0xB03A2E,             // 步兵红领章 —— 昭五式的识别点
  ijaHelmet: 0x5A5646,
  ijaStar: 0xB08A3C,
  ijaLeather: 0x3A2C22,
  ijaBoot: 0x3E3227,
  // 平民：本白与靛蓝
  civilCloth: [0xC6BFAE, 0x3F4A66, 0x8A8778],
  // 通用
  skin: [0xB4906C, 0xA8825F, 0xC0A184],
};

// 各配方烘焙时用的基色（对应 Script_TexBake.mjs 里的 hue / base 参数）。
// 材质的 color 是**线性空间的乘法**，所以想把 ClothNra 染成比基色更亮的 #828A93，
// 分量必须大于 1 —— THREE.Color 的分量本来就是浮点、不钳到 1，这条成立。
const RECIPE_BASE = {
  ClothNra: [106, 112, 118],
  ClothIja: [124, 116, 82],
  Steel: [58, 60, 64],
  SteelHelmet: [64, 66, 60],
  WoodStock: [98, 66, 40],
};

/** 把「烘焙基色 → 目标色」换算成材质 color 乘数（在线性空间里除，别在 sRGB 里除）。 */
function TintTo(recipeName, targetHex) {
  const base = RECIPE_BASE[recipeName];
  const b = new THREE.Color().setRGB(base[0] / 255, base[1] / 255, base[2] / 255, THREE.SRGBColorSpace);
  const t = new THREE.Color(targetHex);
  return new THREE.Color(
    Clamp(t.r / Math.max(b.r, 0.004), 0.04, 4),
    Clamp(t.g / Math.max(b.g, 0.004), 0.04, 4),
    Clamp(t.b / Math.max(b.b, 0.004), 0.04, 4));
}

// ---------------------------------------------------------------------------
// 体型比例：全写成身高 H 的比值，换 kind 只改一个 height。
// 数字按 1930 年代中日士兵的实际比例定（腿短、肩不宽），别照现代模特比例做。
// ---------------------------------------------------------------------------
function Dimensions(height) {
  const H = height;
  return {
    height: H,
    ankleY: 0.055 * H, kneeY: 0.285 * H, hipY: 0.520 * H, waistY: 0.600 * H,
    shoulderY: 0.820 * H, neckY: 0.855 * H, headCenterY: 0.930 * H,
    thighLen: (0.520 - 0.285) * H,
    shinLen: (0.285 - 0.055) * H,
    upperArmLen: 0.165 * H,
    forearmLen: 0.155 * H,
    hipHalf: 0.050 * H,
    shoulderHalf: 0.113 * H,
    // 躯干的收分：腰窄肩宽。这是「不是胶囊 + 球」的第一眼判据。
    waistHalf: 0.086 * H, waistDepth: 0.068 * H,
    chestHalf: 0.107 * H, chestDepth: 0.083 * H,
    headW: 0.113 * H, headH: 0.132 * H, headD: 0.143 * H,
    // 脚的高度**等于**踝关节高度：IK 解到踝，脚这块料正好从踝铺到地面，
    // 随手给个 0.04H 的话人会陷进地里或者浮起来。
    footLen: 0.148 * H, footW: 0.056 * H, footH: 0.055 * H,
  };
}

/** 站直也留一点膝盖弯：腿绷成一条直线是「假人」最明显的一处。 */
const STAND_SETTLE = 0.014;

/**
 * LOD 表。这里要记住一条反直觉的事：**只有同一根骨头上的两个材质桶合并才真省
 * draw call** —— 把鞋换成和裤子一个材质，可脚还是独立一根骨头的话，网格数一个没少。
 * 所以降级同时做两件事：合材质桶（mergeTo），以及把末端小骨头的几何并进父骨头
 * （脚并进小腿、盆骨并进躯干），代价是丢掉踝关节与腰胯的相对扭动。
 * 实测每人可见网格数：high≈21 / medium≈18 / low≈14。24 人同屏请分档建工厂 ——
 * 最近的几个给 high，远处一律 low，全场都上 high 的话光 draw call 就吃掉半个帧预算。
 */
const LOD = {
  high: { handSkin: true, capDisc: true, footInShin: false, pelvisInChest: false, mergeTo: null },
  medium: { handSkin: false, capDisc: true, footInShin: false, pelvisInChest: true, mergeTo: null },
  low: {
    handSkin: false, capDisc: false, footInShin: true, pelvisInChest: true,
    mergeTo: { accessory: "uniform", leather: "uniform", shoe: "uniform", red: "uniform" },
  },
};

const KIND_SPEC = {
  nra: {
    height: 1.66, clothRecipe: "ClothNra", clothHex: HEX.nraCloth,
    headgear: "cap", shoe: "mixed", gear: "nra", defaultWeapon: "ZhongZheng",
  },
  nraDare: {
    height: 1.68, clothRecipe: "ClothNra", clothHex: HEX.nraCloth,
    headgear: "cap", shoe: "mixed", gear: "nra", defaultWeapon: "HanYang",
    dadao: true, grenadeBelt: true, towelOn: true,
  },
  ija: {
    height: 1.62, clothRecipe: "ClothIja", clothHex: HEX.ijaCloth,
    headgear: "helmet", shoe: "boot", gear: "ija", defaultWeapon: "Type38",
  },
  ijaOfficer: {
    height: 1.64, clothRecipe: "ClothIja", clothHex: HEX.ijaCloth,
    headgear: "peakCap", shoe: "boot", gear: "ija", defaultWeapon: "Mauser96",
  },
  civilian: {
    height: 1.60, clothRecipe: "ClothNra", clothHex: HEX.civilCloth,
    headgear: "wrap", shoe: "clothShoe", gear: "none", defaultWeapon: null,
  },
};

// ---------------------------------------------------------------------------
// 几何小工具
// ---------------------------------------------------------------------------

/**
 * 往材质桶里塞一块几何（带位姿）。transform 走 PlaceGeometry，源几何随手释放。
 * buckets.remap 是 LOD 的合桶表：低模下鞋/绑腿/皮具全并进军装那一桶。
 */
function Add(buckets, key, geometry, transform) {
  const k = buckets.remap ? (buckets.remap[key] || key) : key;
  const g = transform ? PlaceGeometry(geometry, transform) : geometry;
  if (transform) geometry.dispose();
  let list = buckets.get(k);
  if (!list) { list = []; buckets.set(k, list); }
  list.push(g);
}

/** 把一个部件构建器的产物整体平移后并进目标桶（低模时把小骨头并进父骨头）。 */
function AddShifted(target, builder, dy) {
  const local = new Map();
  local.remap = target.remap;
  builder(local);
  for (const [key, list] of local) {
    const merged = MergeGeometries(list);
    let out = target.get(key);
    if (!out) { out = []; target.set(key, out); }
    if (dy) { out.push(PlaceGeometry(merged, { y: dy })); merged.dispose(); } else out.push(merged);
  }
}

/** 把桶里的几何按材质合并成 materialKey -> BufferGeometry。 */
function BakeBuckets(buckets) {
  const out = new Map();
  for (const [key, list] of buckets) out.set(key, MergeGeometries(list));
  return out;
}

// 人物贴图密度统一走 TILE_METERS.cloth / steel / wood ——
// 军装上的布纹比墙上的砖还大是最常见的穿帮。
const Cloth = (w, h, d, seed) => MakeBox(w, h, d, TILE_METERS.cloth, seed);
const SteelBox = (w, h, d, seed) => MakeBox(w, h, d, TILE_METERS.steel, seed);
const WoodBox = (w, h, d, seed) => MakeBox(w, h, d, TILE_METERS.wood, seed);

/** 圆管，按米重算 UV。CylinderGeometry 默认沿 Y，枪管要沿 Z。 */
function TubeY(rTop, rBottom, len, segments, tile) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, segments, 1, false);
  const uv = g.attributes.uv;
  const circumference = Math.PI * (rTop + rBottom);
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * (circumference / tile), uv.getY(i) * (len / tile));
  }
  uv.needsUpdate = true;
  return g;
}

function TubeZ(rTop, rBottom, len, segments, tile) {
  const g = TubeY(rTop, rBottom, len, segments, tile);
  g.rotateX(Math.PI / 2);
  return g;
}

/** n 角星（青天白日的十二芒、九〇式铁帽的五角星）。ShapeGeometry 在 XY 面、朝 +Z。 */
function StarGeometry(points, outer, inner) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** 平行四边形：昭五式领章的形状。做成正矩形一眼就不对。 */
function ParallelogramGeometry(w, h, slant) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + slant, -h / 2);
  s.lineTo(w / 2 + slant, -h / 2);
  s.lineTo(w / 2 - slant, h / 2);
  s.lineTo(-w / 2 - slant, h / 2);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

// ---------------------------------------------------------------------------
// 两段肢体解算（胯→膝→脚 / 肩→肘→腕）
//
// 关键技巧：先用 setFromUnitVectors 把骨骼的 -Y 轴对准目标，再**右乘**一个绕 Y 的
// 滚转 —— 绕 -Y 转不改变指向，所以「朝哪」和「往哪边弯」这两件事彻底解耦，一个
// roll 参数就能把膝盖摆到前面、把肘尖甩到后外侧，不用再跟欧拉角顺序较劲。
// 最后右乘绕 X 的 hipAngle 让骨骼从目标连线上偏开，余弦定理保证末端还落在目标上
// （y 分量 = -(lenA·cos a + lenB·cos C) = -d，z 分量由正弦定理抵消为 0）。
// ---------------------------------------------------------------------------
const TMP_V = new THREE.Vector3();
const TMP_Q1 = new THREE.Quaternion();
const TMP_Q2 = new THREE.Quaternion();
const TMP_E = new THREE.Euler();
const AXIS_DOWN = new THREE.Vector3(0, -1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function SolveTwoBone(upper, lower, targetLocal, lenA, lenB, roll) {
  TMP_V.copy(targetLocal).sub(upper.position);
  let dist = TMP_V.length();
  if (dist < 1e-5) { TMP_V.set(0, -1, 0); dist = 1e-5; }
  TMP_V.multiplyScalar(1 / dist);
  // 过伸就把腿绷直、过屈就留一点余量，别让 acos 吃到 NaN
  const reach = Clamp(dist, Math.abs(lenA - lenB) + 1e-3, (lenA + lenB) * 0.998);
  TMP_Q1.setFromUnitVectors(AXIS_DOWN, TMP_V);
  TMP_Q2.setFromAxisAngle(AXIS_Y, roll);
  TMP_Q1.multiply(TMP_Q2);
  const cosHip = Clamp((lenA * lenA + reach * reach - lenB * lenB) / (2 * lenA * reach), -1, 1);
  const cosKnee = Clamp((lenA * lenA + lenB * lenB - reach * reach) / (2 * lenA * lenB), -1, 1);
  TMP_Q2.setFromAxisAngle(AXIS_X, Math.acos(cosHip));
  upper.quaternion.copy(TMP_Q1).multiply(TMP_Q2);
  lower.quaternion.setFromAxisAngle(AXIS_X, -(Math.PI - Math.acos(cosKnee)));
}

/** 取四元数里绕 X 的近似分量。脚踝要抵消大腿+小腿的累计俯仰才能贴地。 */
function ExtractPitch(q) {
  TMP_E.setFromQuaternion(q, "XYZ");
  return TMP_E.x;
}

/** 把一根骨头朝一组欧拉角混过去（蹲/卧/倒地这些覆盖姿势都叠在 IK 之上）。 */
function BlendEuler(object, x, y, z, t) {
  if (t <= 0) return;
  TMP_E.set(x, y, z, "YXZ");
  TMP_Q1.setFromEuler(TMP_E);
  object.quaternion.slerp(TMP_Q1, Clamp01(t));
}

// ---------------------------------------------------------------------------
// 躯干 / 头 / 四肢的几何
// ---------------------------------------------------------------------------

/** 胯：带收分的盆骨，顺带把裤裆的分叉做出来（不然腿像插在一个桶上）。 */
function BuildHips(buckets, d, spec, quality) {
  const H = d.height;
  Add(buckets, "uniform", Cloth(d.waistHalf * 2.05, 0.085 * H, d.waistDepth * 2.1, "pelvis"), { y: 0.012 * H });
  Add(buckets, "uniform", Cloth(d.waistHalf * 1.85, 0.055 * H, d.waistDepth * 1.9, "pelvisLow"), { y: -0.042 * H });
  if (quality !== "low") {
    for (const s of [-1, 1]) {
      Add(buckets, "uniform", Cloth(0.072 * H, 0.05 * H, d.waistDepth * 1.7, `crotch${s}`),
        { x: s * d.hipHalf, y: -0.058 * H });
    }
  }
}

/** 躯干：腰→肩三段收分 + 肩轭。日方多一圈立领 + 红领章。 */
function BuildChest(buckets, d, spec, quality) {
  const H = d.height;
  const rise = d.shoulderY - d.waistY;
  Add(buckets, "uniform", Cloth(d.waistHalf * 2, 0.075 * H, d.waistDepth * 2, "torsoLow"), { y: 0.028 * H });
  Add(buckets, "uniform",
    Cloth((d.waistHalf + d.chestHalf) * 1.02, 0.085 * H, d.waistDepth + d.chestDepth, "torsoMid"), { y: 0.108 * H });
  Add(buckets, "uniform", Cloth(d.chestHalf * 2, 0.08 * H, d.chestDepth * 2, "torsoUp"), { y: 0.182 * H });
  // 肩轭：比胸再宽一点、薄一点，肩线才有棱
  Add(buckets, "uniform", Cloth((d.shoulderHalf + 0.008 * H) * 2, 0.05 * H, d.chestDepth * 1.72, "yoke"),
    { y: rise - 0.012 * H });

  if (spec.gear === "ija") {
    // 昭五式立领：一圈明显高出肩线的硬领 —— 和九八式折领最直观的区别就在这
    Add(buckets, "uniform", Cloth(0.098 * H, 0.042 * H, 0.108 * H, "collar"), { y: rise + 0.028 * H });
    // 步兵红领章：平行四边形，缀在立领两侧。全场高饱和色一共就两处，这是其一。
    for (const s of [-1, 1]) {
      // z 要比立领前脸再多让出 3 mm，压在同一平面上会闪（z-fighting）
      Add(buckets, "accentA", ParallelogramGeometry(0.042, 0.026, 0.008 * s),
        { x: s * 0.046 * H, y: rise + 0.028 * H, z: -0.057 * H, ry: s * 0.42 });
    }
  } else if (spec.gear === "nra") {
    // 中式军装的翻领：两片小三角。不做的话胸口就是块光板。
    for (const s of [-1, 1]) {
      Add(buckets, "uniform", Cloth(0.05 * H, 0.055 * H, 0.014 * H, `lapel${s}`),
        { x: s * 0.026 * H, y: rise - 0.028 * H, z: -d.chestDepth - 0.005 * H, rz: s * 0.28 });
    }
  } else {
    // 平民短褂：下摆盖到胯下。当兵的和老百姓的剪影从这里就分开了。
    Add(buckets, "uniform", Cloth(d.waistHalf * 2.25, 0.16 * H, d.waistDepth * 2.2, "gown"), { y: -0.06 * H });
  }
}

/**
 * 头。所有偏移都相对**脖子关节**（neckY），不是头心 —— 这里写错的话整颗头
 * 会掉进胸腔里，而且因为帽子跟着一起掉，截图上很容易看成「模型比例不对」。
 */
function BuildHead(buckets, d, spec, quality) {
  const H = d.height;
  const hy = d.headCenterY - d.neckY;            // 头心相对脖子关节的高度
  // 脖子：从关节往下接到肩线
  Add(buckets, "skin", TubeY(0.028 * H, 0.032 * H, 0.06 * H, 8, TILE_METERS.cloth), { y: -0.012 * H });
  // 颅骨 + 下颌。下颌是「有下巴剪影」的最低成本做法。
  Add(buckets, "skin", Cloth(d.headW, d.headH * 0.72, d.headD, "skull"), { y: hy + 0.018 * H });
  Add(buckets, "skin", Cloth(d.headW * 0.82, d.headH * 0.34, d.headD * 0.86, "jaw"),
    { y: hy - 0.042 * H, z: -0.006 * H });

  if (spec.headgear === "cap") {
    // 西北军软顶布军帽：帽墙 + 略鼓的帽顶 + 一小片帽檐。**绝不给钢盔。**
    Add(buckets, "uniform", Cloth(d.headW * 1.06, 0.036 * H, d.headD * 1.05, "capBand"), { y: hy + 0.045 * H });
    Add(buckets, "uniform", Cloth(d.headW * 1.02, 0.042 * H, d.headD * 0.99, "capCrown"), { y: hy + 0.078 * H });
    Add(buckets, "uniform", Cloth(d.headW * 0.92, 0.009 * H, 0.046 * H, "capVisor"),
      { y: hy + 0.036 * H, z: -d.headD * 0.62, rx: -0.22 });
    // 青天白日帽徽：直径 32 mm（史料给 30—35 mm），蓝底白十二芒
    if (LOD[quality].capDisc) {
      Add(buckets, "accentA", new THREE.CircleGeometry(0.016, 14),
        { y: hy + 0.047 * H, z: -d.headD * 0.545, ry: Math.PI });
    }
    Add(buckets, "accentB", StarGeometry(12, 0.0112, 0.0052),
      { y: hy + 0.047 * H, z: -d.headD * 0.556, ry: Math.PI });
  } else if (spec.headgear === "helmet") {
    // 九〇式铁帽：半球 + 小檐 + 边缘外翻，正面一枚黄铜五角星。
    // **不许有屁帘** —— 帽垂布 1938 年 6 月 1 日才配发，台儿庄打完两个月了。
    const r = 0.079 * H;
    const dome = new THREE.SphereGeometry(
      r, quality === "low" ? 10 : 14, quality === "low" ? 4 : 6, 0, Math.PI * 2, 0, Math.PI * 0.56);
    dome.scale(1.06, 0.94, 1.12);
    Add(buckets, "helmet", dome, { y: hy + 0.026 * H });
    // 外翻的盔缘：上小下大的锥面，剪影上是一圈亮边
    Add(buckets, "helmet", TubeY(r * 1.06, r * 1.24, 0.026 * H, quality === "low" ? 10 : 16, TILE_METERS.steel),
      { y: hy + 0.022 * H });
    Add(buckets, "helmet", SteelBox(r * 1.5, 0.011 * H, 0.034 * H, "brim"),
      { y: hy + 0.017 * H, z: -r * 1.16, rx: -0.16 });
    Add(buckets, "accentB", StarGeometry(5, 0.021, 0.0092),
      { y: hy + 0.034 * H, z: -r * 1.18, ry: Math.PI, rx: 0.12 });
  } else if (spec.headgear === "peakCap") {
    Add(buckets, "uniform", Cloth(d.headW * 1.08, 0.048 * H, d.headD * 1.06, "offCap"), { y: hy + 0.058 * H });
    Add(buckets, "uniform", Cloth(d.headW * 1.0, 0.012 * H, 0.058 * H, "offVisor"),
      { y: hy + 0.036 * H, z: -d.headD * 0.66, rx: -0.14 });
    Add(buckets, "accentB", StarGeometry(5, 0.014, 0.0062),
      { y: hy + 0.05 * H, z: -d.headD * 0.6, ry: Math.PI });
  } else {
    // 平民包头巾：一圈布 + 侧面一个结
    Add(buckets, "accessory", TubeY(d.headW * 0.62, d.headW * 0.66, 0.052 * H, 10, TILE_METERS.cloth),
      { y: hy + 0.045 * H });
    Add(buckets, "accessory", Cloth(0.04 * H, 0.032 * H, 0.036 * H, "knot"),
      { x: d.headW * 0.6, y: hy + 0.05 * H, rz: 0.4 });
  }
}

/** 上臂 / 前臂（末端带一只手，quality=high 才单独占一个皮肤桶）。 */
function BuildArm(buckets, d, spec, quality, side, part) {
  const H = d.height;
  if (part === "upper") {
    Add(buckets, "uniform", Cloth(0.062 * H, d.upperArmLen * 1.02, 0.062 * H, `up${side}`),
      { y: -d.upperArmLen * 0.5 });
    // 肩头：一个稍大的方块，把袖子撑出圆肩
    Add(buckets, "uniform", Cloth(0.072 * H, 0.052 * H, 0.07 * H, `sh${side}`), { y: -0.014 * H });
  } else {
    Add(buckets, "uniform", Cloth(0.052 * H, d.forearmLen * 0.82, 0.052 * H, `fo${side}`),
      { y: -d.forearmLen * 0.42 });
    // 手是唯一露出皮肤的肢体末端，低模就并进袖子那一桶（省两个 mesh）
    const handKey = LOD[quality].handSkin ? "skin" : "uniform";
    Add(buckets, handKey, Cloth(0.044 * H, 0.062 * H, 0.038 * H, `hand${side}`), { y: -d.forearmLen * 0.92 });
  }
}

/** 大腿 / 小腿（整根就是绑腿）/ 脚（草鞋、布鞋或编上靴）。 */
function BuildLeg(buckets, d, spec, quality, side, part) {
  const H = d.height;
  if (part === "thigh") {
    Add(buckets, "uniform", Cloth(0.078 * H, d.thighLen * 1.04, 0.082 * H, `th${side}`), { y: -d.thighLen * 0.5 });
  } else if (part === "shin") {
    // 绑腿宽 10 cm、自踝上缠至膝下 —— 也就是说整根小腿就是绑腿，正好一个材质桶
    Add(buckets, "accessory", Cloth(0.06 * H, d.shinLen * 0.98, 0.062 * H, `sn${side}`), { y: -d.shinLen * 0.5 });
    if (quality !== "low") {
      // 缠绕的层次：三道略粗的环，末端在**小腿外侧**打结（所以左右腿几何不能共用）
      for (let i = 0; i < 3; i += 1) {
        Add(buckets, "accessory", Cloth(0.064 * H, 0.022 * H, 0.066 * H, `wrap${side}${i}`),
          { y: -d.shinLen * (0.24 + i * 0.26), rz: 0.06 * (i % 2 ? 1 : -1) });
      }
      Add(buckets, "accessory", Cloth(0.022 * H, 0.02 * H, 0.03 * H, `knot${side}`),
        { x: side * 0.036 * H, y: -d.shinLen * 0.34, z: 0.012 * H });
    }
  } else {
    // 脚：从踝关节铺到地面（footH === ankleY），脚尖朝 -Z
    Add(buckets, "shoe", Cloth(d.footW, d.footH, d.footLen * 0.86, `ft${side}`),
      { y: -d.footH * 0.5, z: -d.footLen * 0.2 });
    if (spec.shoe === "boot") {
      Add(buckets, "shoe", Cloth(d.footW * 1.04, 0.05 * H, d.footW * 1.12, `boot${side}`), { y: 0.018 * H });
    } else {
      // 草鞋/布鞋：底薄、露脚背，前端翘一点
      Add(buckets, "shoe", Cloth(d.footW * 0.92, 0.012 * H, 0.03 * H, `toe${side}`),
        { y: -d.footH * 0.82, z: -d.footLen * 0.5, rx: 0.22 });
    }
  }
}

/**
 * 装具。中方的重点是**子弹带瘪着**：斜挎过胸的一条带子上挂十来个弹包，
 * 只有靠身（腰后那几格）鼓着，其余全是压扁的空袋 —— 杂牌部队「最多也就二三十发」，
 * 这比任何 UI 数字都直观。
 */
function BuildGear(buckets, d, spec, quality) {
  const H = d.height;
  const rise = d.shoulderY - d.waistY;
  if (spec.gear === "nra") {
    // 从右肩斜挎到左胯
    const ax = 0.088 * H, ay = rise - 0.02 * H;
    const bx = -0.075 * H, by = -0.03 * H;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const rz = Math.atan2(dx, -dy);            // 让盒子的 -Y 指向 (dx,dy)
    const front = -d.chestDepth * 0.92;
    Add(buckets, "accessory", Cloth(0.052 * H, len, 0.03 * H, "bandStrap"),
      { x: (ax + bx) / 2, y: (ay + by) / 2, z: front - 0.024 * H, rz });
    const pouches = quality === "low" ? 6 : 11;
    for (let i = 0; i < pouches; i += 1) {
      const t = (i + 0.5) / pouches;
      // 只有末端（贴腰那几格）是满的，其余瘪成一张纸
      const full = t > 0.74 ? 1 : (t > 0.63 ? 0.45 : 0.1);
      Add(buckets, "accessory", Cloth(0.05 * H, (len / pouches) * 0.86, Lerp(0.012, 0.05, full) * H, `pouch${i}`),
        {
          x: Lerp(ax, bx, t), y: Lerp(ay, by, t),
          z: front - 0.026 * H - Lerp(0.006, 0.026, full) * H, rz,
        });
    }
    // 干粮袋：一头缝实一头开口的粗布袋，斜挎在另一侧
    Add(buckets, "accessory", Cloth(0.115 * H, 0.13 * H, 0.045 * H, "haversack"),
      { x: -0.1 * H, y: -0.055 * H, z: 0.055 * H, rz: -0.1 });
    Add(buckets, "accessory", Cloth(0.028 * H, 0.34 * H, 0.014 * H, "haverStrap"),
      { x: -0.02 * H, y: rise * 0.5, z: 0.03 * H, rz: -0.32 });
    Add(buckets, "accessory", Cloth(d.waistHalf * 2.1, 0.036 * H, d.waistDepth * 2.1, "belt"), { y: -0.012 * H });
  } else if (spec.gear === "ija") {
    // 三只皮弹盒：腰带前方左右各一小盒、后腰一大盒（大盒容量约等于两小盒之和）
    Add(buckets, "leather", Cloth(d.waistHalf * 2.06, 0.038 * H, d.waistDepth * 2.06, "ijaBelt"), { y: -0.01 * H });
    for (const s of [-1, 1]) {
      Add(buckets, "leather", Cloth(0.072 * H, 0.058 * H, 0.042 * H, `smallPouch${s}`),
        { x: s * 0.052 * H, y: -0.012 * H, z: -d.waistDepth - 0.016 * H });
    }
    Add(buckets, "leather", Cloth(0.15 * H, 0.07 * H, 0.05 * H, "bigPouch"),
      { y: -0.012 * H, z: d.waistDepth + 0.02 * H });
    // 刺刀鞘挂左腰、水壶挂后腰
    Add(buckets, "leather", Cloth(0.022 * H, 0.29 * H, 0.026 * H, "scabbard"),
      { x: -d.waistHalf - 0.022 * H, y: -0.11 * H, z: 0.02 * H, rx: 0.18 });
    Add(buckets, "leather", TubeZ(0.045 * H, 0.045 * H, 0.032 * H, 10, TILE_METERS.cloth),
      { x: 0.085 * H, y: -0.03 * H, z: d.waistDepth + 0.032 * H });
  }
}

/** 敢死队腰间挂满的木柄手榴弹（第 31 师一役用掉三十万余枚，这不是装饰）。 */
function BuildGrenadeBelt(buckets, d, quality) {
  const H = d.height;
  const count = quality === "low" ? 4 : 6;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const x = (t - 0.5) * d.waistHalf * 2.4;
    const z = -d.waistDepth - 0.026 * H + Math.abs(t - 0.5) * 0.06 * H;
    const tilt = (t - 0.5) * 0.3;
    // 弹体近似圆柱 φ58 × 92 mm、木柄 φ29 —— 改良后全长 220 mm
    Add(buckets, "steel", TubeY(0.029, 0.029, 0.092, 8, TILE_METERS.steel), { x, y: -0.052 * H, z, rz: tilt });
    Add(buckets, "wood", TubeY(0.0145, 0.0145, 0.125, 6, TILE_METERS.wood), { x, y: -0.135 * H, z, rz: tilt });
  }
}

/**
 * 背在身后的大刀。**背法**：布带斜挎，刀柄露在**左肩上方**、刀刃朝外、刀背贴身，
 * 拔刀是右手过左肩顺势抽出。别做成武侠式竖背正中反手拔刀。
 * 做法上先在「刀尖朝 +Y」的局部系里拼零件，合并后整把刀过一次斜挎矩阵，
 * 否则每个零件都得自己算旋转后的位置，改一次角度要改六处。
 */
function BuildDadao(buckets, d, quality) {
  const H = d.height;
  const rise = d.shoulderY - d.waistY;
  const local = new Map();
  // 刃长 595、身宽 57→38、刀背厚 5—6、护手是一小片铁、柄长 215、柄尾必有铁环
  Add(local, "steel", SteelBox(0.052, 0.50, 0.0055, "blade"), { y: 0.40 });
  Add(local, "steel", SteelBox(0.042, 0.10, 0.0055, "tip"), { y: 0.70, rz: 0.05 });
  Add(local, "steel", SteelBox(0.025, 0.012, 0.026, "guard"), { y: 0.14 });
  Add(local, "accessory", Cloth(0.030, 0.20, 0.026, "grip"), { y: 0.03 });
  Add(local, "steel", new THREE.TorusGeometry(0.038, 0.006, 6, 12), { y: -0.10, rx: Math.PI / 2 });
  if (quality !== "low") Add(local, "red", Cloth(0.026, 0.05, 0.024, "rag"), { y: -0.075 });
  // rz≈-2.54：刀尖甩到右下、刀柄露到左肩上方；rx 让刀身贴住后背的弧度
  const sling = { x: -0.026 * H, y: rise - 0.047 * H, z: d.chestDepth + 0.03 * H, rz: -2.54, rx: 0.14 };
  for (const [key, list] of local) Add(buckets, key, MergeGeometries(list), sling);
}

// ---------------------------------------------------------------------------
// 武器几何
// 全部建在「右手握把 = 原点、枪管沿 -Z、膛线轴在 y=+0.035」这个规范坐标系里。
// 换枪只换一个 Group，据枪姿势 / 枪口位置 / 拉栓点全都不用跟着改。
// ---------------------------------------------------------------------------
function BuildWeaponGeometry(id, quality) {
  const data = WEAPONS[id];
  const buckets = new Map();
  // 枪的木/钢两桶不合并（全木或全钢的剪影一眼就错），只合小件（刀柄缠布、红布条）
  buckets.remap = LOD[quality].mergeTo;
  const bore = 0.035;
  const result = {
    muzzle: new THREE.Vector3(0, bore, -0.6),
    gripFront: new THREE.Vector3(0, -0.01, -0.30),
    bolt: new THREE.Vector3(0.04, bore + 0.012, 0.02),
    twoHanded: true,
  };
  if (!data) return Object.assign(result, { geometries: BakeBuckets(buckets) });
  const seg = quality === "low" ? 6 : 10;

  if (data.kind === "boltRifle" || data.kind === "lmg") {
    const total = data.lengthM;
    const buttZ = 0.255;                                   // 右手握把到枪托底板
    const barrelLen = data.barrelM || total * 0.52;
    const muzzleZ = -(total - buttZ);
    result.muzzle.set(0, bore, muzzleZ - 0.01);
    result.gripFront.set(0, -0.012, muzzleZ * 0.52);       // 左手扶在护木中段

    // 枪托分三段（底板 / 托腮 / 握把颈）：一根方料是玩具，分段才有枪托的剪影
    Add(buckets, "wood", WoodBox(0.042, 0.128, 0.032, "buttPlate"), { y: 0.012, z: buttZ });
    Add(buckets, "wood", WoodBox(0.040, 0.105, 0.160, "comb"), { y: 0.018, z: buttZ - 0.10, rx: 0.05 });
    Add(buckets, "wood", WoodBox(0.036, 0.062, 0.130, "wrist"), { y: 0.002, z: 0.075 });
    // 机匣 + 弹仓（中正式是 5 发桥夹压入的固定弹仓，机匣下方一块凸料）
    Add(buckets, "steel", SteelBox(0.034, 0.050, 0.190, "receiver"), { y: bore - 0.004, z: -0.055 });
    Add(buckets, "wood", WoodBox(0.038, 0.050, 0.090, "magazine"), { y: -0.008, z: -0.045 });
    // 护木 + 枪管 + 准星照门
    const foreLen = Math.abs(muzzleZ) * 0.72;
    Add(buckets, "wood", WoodBox(0.036, 0.044, foreLen, "forend"), { y: bore - 0.026, z: -0.155 - foreLen * 0.5 });
    Add(buckets, "steel",
      TubeZ(0.0085, 0.0092, Math.min(barrelLen, Math.abs(muzzleZ) - 0.02), seg, TILE_METERS.steel),
      { y: bore, z: muzzleZ * 0.62 });
    Add(buckets, "steel", SteelBox(0.008, 0.020, 0.016, "frontSight"), { y: bore + 0.016, z: muzzleZ + 0.03 });
    Add(buckets, "steel", SteelBox(0.026, 0.014, 0.050, "rearSight"), { y: bore + 0.026, z: -0.02 });
    Add(buckets, "steel", SteelBox(0.030, 0.026, 0.040, "trigger"), { y: -0.036, z: 0.028 });
    if (quality !== "low") {
      // 拉机柄：拉栓动画里唯一「看得见」的零件，低模也别省
      Add(buckets, "steel", TubeZ(0.006, 0.006, 0.055, 6, TILE_METERS.steel),
        { x: 0.032, y: bore + 0.006, z: 0.01, ry: Math.PI / 2, rz: 0.35 });
      Add(buckets, "steel", TubeZ(0.011, 0.011, 0.012, 6, TILE_METERS.steel), { x: 0.058, y: bore + 0.020, z: 0.01 });
    }

    if (id === "HanYang") {
      // 老套筒：枪管外那层薄套筒，是它区别于中正式的剪影特征
      Add(buckets, "steel", TubeZ(0.0155, 0.0165, Math.abs(muzzleZ) * 0.52, seg, TILE_METERS.steel),
        { y: bore, z: muzzleZ * 0.66 });
    }
    if (id === "Type38") {
      // 三八式的防尘滑盖：机匣上方一块随栓前后滑动的薄板
      Add(buckets, "steel", SteelBox(0.030, 0.010, 0.145, "dustCover"), { y: bore + 0.026, z: -0.05 });
    }
    if (id === "Zb26") {
      // 捷克式：20 发弧形弹匣**从上方插入**（做成下插就废了），提把在枪管上方
      for (let i = 0; i < 3; i += 1) {
        Add(buckets, "steel", SteelBox(0.030, 0.075, 0.042 - i * 0.004, `mag${i}`),
          { y: bore + 0.06 + i * 0.07, z: -0.09 - i * 0.016, rx: -0.1 * i });
      }
      Add(buckets, "wood", WoodBox(0.026, 0.05, 0.16, "carryHandle"), { y: bore + 0.055, z: -0.30 });
      for (const s of [-1, 1]) {
        Add(buckets, "steel", SteelBox(0.008, 0.24, 0.008, `bipod${s}`),
          { x: s * 0.06, y: bore - 0.13, z: muzzleZ * 0.78, rz: s * 0.32, rx: -0.12 });
      }
    }
    if (id === "Type11") {
      // 歪把子：左上方一个敞口方斗（装 6 个 5 发桥夹）+ 顶部压弹板
      Add(buckets, "steel", SteelBox(0.075, 0.090, 0.115, "hopper"), { x: -0.055, y: bore + 0.05, z: -0.05 });
      Add(buckets, "steel", SteelBox(0.065, 0.012, 0.100, "hopperLid"), { x: -0.055, y: bore + 0.10, z: -0.05 });
      for (const s of [-1, 1]) {
        Add(buckets, "steel", SteelBox(0.008, 0.20, 0.008, `bipod${s}`),
          { x: s * 0.05, y: bore - 0.11, z: muzzleZ * 0.8, rz: s * 0.3 });
      }
    }
    if (data.bayonet && quality === "high") {
      const bl = data.bayonetLengthM || 0.395;
      Add(buckets, "steel", SteelBox(0.016, 0.024, bl, "bayonet"), { y: bore - 0.006, z: muzzleZ - bl * 0.5 });
    }
  } else if (data.kind === "pistol") {
    // 驳壳枪：方机匣 + 前伸的固定弹仓 + 细枪管。单手武器。
    result.muzzle.set(0, 0.030, -0.19);
    result.gripFront.set(0, -0.02, -0.06);
    result.bolt.set(0.02, 0.05, -0.01);
    result.twoHanded = false;
    Add(buckets, "wood", WoodBox(0.030, 0.115, 0.042, "grip"), { y: -0.05, z: 0.012, rx: -0.12 });
    Add(buckets, "steel", SteelBox(0.028, 0.062, 0.145, "frame"), { y: 0.024, z: -0.055 });
    Add(buckets, "steel", SteelBox(0.026, 0.050, 0.048, "mag"), { y: -0.012, z: -0.058 });
    Add(buckets, "steel", TubeZ(0.0065, 0.0065, 0.088, 6, TILE_METERS.steel), { y: 0.032, z: -0.148 });
  } else if (data.kind === "melee") {
    // 大刀：刀身朝 +Y（劈砍时挂点自己会把它抡下来）
    result.muzzle.set(0, 0.42, -0.02);
    result.gripFront.set(0, 0.12, 0);
    result.twoHanded = true;
    Add(buckets, "steel", SteelBox(0.052, 0.50, 0.0055, "blade"), { y: 0.40 });
    Add(buckets, "steel", SteelBox(0.042, 0.10, 0.0055, "tip"), { y: 0.70, rz: 0.05 });
    Add(buckets, "steel", SteelBox(0.025, 0.012, 0.026, "guard"), { y: 0.14 });
    Add(buckets, "accessory", Cloth(0.030, 0.20, 0.026, "handle"), { y: 0.03 });
    Add(buckets, "steel", new THREE.TorusGeometry(0.038, 0.006, 6, 12), { y: -0.10, rx: Math.PI / 2 });
    if (quality !== "low") Add(buckets, "red", Cloth(0.026, 0.05, 0.024, "rag"), { y: -0.075 });
  } else if (data.kind === "throwable") {
    // 巩式木柄手榴弹：弹体 φ58×92、木柄 φ29、全长 220
    result.muzzle.set(0, 0.10, 0);
    result.twoHanded = false;
    Add(buckets, "steel", TubeY(0.029, 0.029, 0.092, 8, TILE_METERS.steel), { y: 0.16 });
    Add(buckets, "wood", TubeY(0.0145, 0.0145, 0.128, 6, TILE_METERS.wood), { y: 0.05 });
  } else {
    // 掷弹筒之类：一根带弧形驻钣的短筒。至少别让人空着手站那儿。
    result.muzzle.set(0, 0.05, -0.30);
    result.gripFront.set(0, 0.02, -0.14);
    Add(buckets, "steel", TubeZ(0.025, 0.025, data.lengthM || 0.41, seg, TILE_METERS.steel), { y: 0.04, z: -0.2 });
    Add(buckets, "wood", WoodBox(0.05, 0.05, 0.12, "base"), { y: 0.02, z: 0.06 });
  }
  return Object.assign(result, { geometries: BakeBuckets(buckets) });
}

// ---------------------------------------------------------------------------
// 人物
// ---------------------------------------------------------------------------

/** 一根骨头：Group + 若干按材质合并好的网格。 */
function AttachBone(parent, geometries, materials, position) {
  const bone = new THREE.Group();
  if (position) bone.position.copy(position);
  if (geometries) {
    for (const [key, geometry] of geometries) {
      const mesh = new THREE.Mesh(geometry, materials[key] || materials.uniform);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bone.add(mesh);
    }
  }
  parent.add(bone);
  return bone;
}

// 每帧复用的临时量。24 个人 × 每人几十次向量运算，这里 new 一个 Vector3
// 就是每秒几千次分配 —— GC 抖动在 55fps 的预算里是看得见的。
const POSE_A = new THREE.Vector3();
const POSE_B = new THREE.Vector3();
const REST_Q = new THREE.Quaternion();
const AIM_Q = new THREE.Quaternion();
const PARENT_Q = new THREE.Quaternion();
const OFF_Q = new THREE.Quaternion();
const POSE_E = new THREE.Euler();

export class Actor {
  /** @param {ActorFactory} factory */
  constructor(factory, kind, options = {}) {
    const spec = KIND_SPEC[kind] || KIND_SPEC.nra;
    const seedText = `${kind}:${options.seed ?? 0}`;
    const rnd = Mulberry32(HashString(seedText));

    this.factory = factory;
    this.kind = kind;
    this.spec = spec;
    this.seed = seedText;
    this.quality = factory.quality;
    this.rank = options.rank ?? 0;

    // 身高 ±4% 的个体差走整体缩放，手持武器再乘 1/scale 抵消 —— 枪长是史实数据
    this.sizeScale = 1 + (rnd() - 0.5) * 0.08;
    this.weaponScale = 1 / this.sizeScale;
    this.height = spec.height * this.sizeScale;

    const build = factory.KindGeometry(kind);
    const d = build.dims;
    this.dims = d;
    this.materials = factory.ActorMaterials(kind, rnd);

    this.root = new THREE.Group();
    this.root.name = `Actor_${kind}_${options.seed ?? 0}`;
    this.root.scale.setScalar(this.sizeScale);

    // body 的枢轴放在胯高：倒地/俯卧是绕胯翻的，绕脚踝翻的话人会整个甩出去
    this.body = new THREE.Group();
    this.body.position.y = d.hipY;
    this.root.add(this.body);

    this.hips = AttachBone(this.body, build.bones.hips, this.materials, null);
    this.chest = AttachBone(this.hips, build.bones.chest, this.materials,
      new THREE.Vector3(0, d.waistY - d.hipY, 0));
    this.neck = AttachBone(this.chest, build.bones.head, this.materials,
      new THREE.Vector3(0, d.neckY - d.waistY, 0));

    this.arms = {};
    for (const side of [-1, 1]) {
      const tag = side < 0 ? "L" : "R";
      const shoulder = AttachBone(this.chest, build.bones[`arm${tag}`], this.materials,
        new THREE.Vector3(side * d.shoulderHalf, d.shoulderY - d.waistY - 0.02 * d.height, 0));
      const elbow = AttachBone(shoulder, build.bones[`fore${tag}`], this.materials,
        new THREE.Vector3(0, -d.upperArmLen, 0));
      this.arms[tag] = { shoulder, elbow };
    }

    this.legs = {};
    for (const side of [-1, 1]) {
      const tag = side < 0 ? "L" : "R";
      const thigh = AttachBone(this.hips, build.bones.thigh, this.materials,
        new THREE.Vector3(side * d.hipHalf, 0, 0));
      const knee = AttachBone(thigh, build.bones[`shin${tag}`], this.materials,
        new THREE.Vector3(0, -d.thighLen, 0));
      const ankle = AttachBone(knee, build.bones.foot, this.materials,
        new THREE.Vector3(0, -d.shinLen, 0));
      this.legs[tag] = { thigh, knee, ankle, side };
    }

    // 白毛巾：缠头或缠左上臂，敢死队的识别标志（3 月 28 日夜那批还换穿了日军军服）
    this.towelHead = AttachBone(this.neck, build.bones.towelHead, this.materials, null);
    this.towelArm = AttachBone(this.arms.L.shoulder, build.bones.towelArm, this.materials, null);
    this.SetTowel(!!spec.towelOn);

    // 背后的大刀 / 腰间的手榴弹：挂在 chest 上，跟着上身一起晃
    if (build.bones.dadao) AttachBone(this.chest, build.bones.dadao, this.materials, null);
    if (build.bones.grenades) AttachBone(this.chest, build.bones.grenades, this.materials, null);

    // 持枪挂点：据枪时它就是「枪托贴肩」那个位姿，两只手再 IK 过去
    this.weaponMount = new THREE.Group();
    this.chest.add(this.weaponMount);
    this.weaponGroup = null;
    this.weaponData = null;
    this.weaponMuzzle = new THREE.Vector3();
    this.weaponGripFront = new THREE.Vector3();
    this.weaponBolt = new THREE.Vector3();
    this.weaponTwoHanded = true;
    this.SetWeapon(options.weapon === undefined ? spec.defaultWeapon : options.weapon);

    // --- 动画内部状态（全部确定性）---
    this.time = 0;
    this.gaitPhase = rnd();                  // 起步相位各不相同，一排人才不像广播体操
    this.idlePhase = rnd() * Math.PI * 2;
    this.breathRate = 0.72 + rnd() * 0.22;
    this.swayScale = 0.75 + rnd() * 0.5;
    this.prevFiring = false;
    this.boltTimer = null;
    this.recoil = 0;
    this.ragdollState = null;
    this.disposed = false;

    this.tmpTarget = new THREE.Vector3();
    this.gripR = new THREE.Vector3();
    this.gripL = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();

    this.Update(0, { moveSpeed: 0, aim: 0, elapsed: 0 });
  }

  /** 换手持模型。几何在工厂里按 id 缓存，这里只换 Group。 */
  SetWeapon(weaponId) {
    if (this.weaponGroup) {
      this.weaponMount.remove(this.weaponGroup);
      this.weaponGroup = null;
    }
    this.weaponId = weaponId || null;
    this.weaponData = weaponId ? WEAPONS[weaponId] || null : null;
    if (!weaponId) { this.weaponTwoHanded = false; return this; }
    const built = this.factory.WeaponGeometry(weaponId);
    const group = new THREE.Group();
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // 抵消 root 上的身高缩放：人可以高矮不同，中正式永远是 1110 mm
    group.scale.setScalar(this.weaponScale);
    this.weaponMount.add(group);
    this.weaponGroup = group;
    this.weaponMuzzle.copy(built.muzzle);
    this.weaponGripFront.copy(built.gripFront);
    this.weaponBolt.copy(built.bolt);
    this.weaponTwoHanded = built.twoHanded;
    return this;
  }

  /** 敢死队白毛巾（缠头 + 缠左上臂）。 */
  SetTowel(on) {
    this.towelOn = !!on;
    if (this.towelHead) this.towelHead.visible = this.towelOn;
    if (this.towelArm) this.towelArm.visible = this.towelOn;
    return this;
  }

  /** 枪口世界坐标。弹道与枪口火光都从这里取，别自己去猜手在哪。 */
  MuzzleWorld(target) {
    const out = target || new THREE.Vector3();
    if (!this.weaponGroup) {
      this.neck.updateWorldMatrix(true, false);
      return out.set(0, 0, -0.2).applyMatrix4(this.neck.matrixWorld);
    }
    this.weaponGroup.updateWorldMatrix(true, false);
    return out.copy(this.weaponMuzzle).applyMatrix4(this.weaponGroup.matrixWorld);
  }

  /**
   * 倒地。**不做物理** —— 布娃娃在这个规模上既贵又不可复现，而且十有八九摆出一个
   * 考据上不可能的姿势。这里走一段 0.8 秒的确定性姿态过渡：膝先软 → 上身前扑或
   * 后仰 → 最后贴地不再动。
   * @param {THREE.Vector3} dirVec3 世界空间的冲击方向（取子弹的飞行方向）
   */
  Ragdoll(dirVec3) {
    if (this.ragdollState) return this;
    const local = POSE_A.set(0, 0, -1);
    if (dirVec3 && dirVec3.lengthSq() > 1e-8) {
      local.copy(dirVec3);
      this.root.updateWorldMatrix(true, false);
      this.tmpQuat.setFromRotationMatrix(this.root.matrixWorld).invert();
      local.applyQuaternion(this.tmpQuat).normalize();
    }
    this.ragdollState = {
      t: 0,
      // 子弹朝人物正面（-Z）飞 = 打在背上 = 往前扑
      forward: local.z < 0 ? 1 : -1,
      side: Clamp(local.x, -1, 1),
    };
    return this;
  }

  Update(dt, state = {}) {
    if (this.disposed) return;
    const d = this.dims;
    const H = d.height;
    const s = state;
    const moveSpeed = Clamp01(s.moveSpeed ?? 0);
    const strafe = Clamp(s.strafe ?? 0, -1, 1);
    const crouch = Clamp01(s.crouch ?? 0);
    const prone = Clamp01(s.prone ?? 0);
    const hurt = Clamp01(s.hurt ?? 0);
    const throwing = Clamp01(s.throwing ?? 0);
    const melee = Clamp01(s.melee ?? 0);
    const dying = Clamp01(s.dying ?? 0);
    // 卧倒/投弹/劈砍时据不了标准枪，把 aim 压下去，不然肩线会拧成麻花
    const aim = Clamp01(s.aim ?? 0) * (1 - prone * 0.45) * (1 - throwing) * (1 - melee);
    const elapsed = s.elapsed ?? (this.time + dt);
    this.time += dt;

    // --- 开火 / 拉栓的边沿检测 --------------------------------------------
    const firing = !!s.firing;
    const weapon = this.weaponData;
    if (firing && !this.prevFiring) {
      this.recoil = 1;
      // 拉栓要**看得见**：延后 0.12 秒起手，先让后坐把枪推回来再动右手
      if (weapon && weapon.kind === "boltRifle") this.boltTimer = -0.12;
    }
    this.prevFiring = firing;
    const recoverS = (weapon && weapon.recoil && weapon.recoil.recoverS) || 0.35;
    this.recoil = Math.max(0, this.recoil - dt / recoverS);
    let boltPhase = 0;
    if (this.boltTimer !== null) {
      this.boltTimer += dt;
      const boltTime = (weapon && weapon.boltTimeS) || 1.05;
      if (this.boltTimer >= boltTime) this.boltTimer = null;
      else if (this.boltTimer > 0) boltPhase = this.boltTimer / boltTime;
    }

    if (s.dead && !this.ragdollState) this.Ragdoll(null);
    if (this.ragdollState) {
      this.ragdollState.t = Math.min(1, this.ragdollState.t + dt / 0.8);
      this.PoseRagdoll(this.ragdollState, dying);
      return;
    }

    // --- 步态相位 ----------------------------------------------------------
    // 步频与步幅联动：设 moveSpeed=1 对应 4.2 m/s（冲刺），步幅 = 速度 / 步频。
    // 这样支撑相里脚相对地面的速度正好为零 —— 不这么算出来的就是滑步。
    const speedMs = moveSpeed * 4.2;
    const cadence = 1.5 + moveSpeed * 1.65;
    const stride = moveSpeed > 0.02 ? Clamp(speedMs / cadence, 0.12, 1.5) : 0;
    if (moveSpeed > 0.02) this.gaitPhase = (this.gaitPhase + dt * cadence * 0.5) % 1;

    // --- 站姿高度：蹲就是把胯压下去，膝盖弯多少交给腿 IK 自己算 ------------
    const stanceDrop = crouch * 0.34 + prone * 0.60;
    const breath = Math.sin(elapsed * this.breathRate * Math.PI * 2 + this.idlePhase);
    const idleSway = Math.sin(elapsed * 0.41 * Math.PI * 2 + this.idlePhase * 1.7) * this.swayScale;
    const bob = moveSpeed > 0.02
      ? -Math.abs(Math.sin(this.gaitPhase * Math.PI * 2)) * 0.022 * H * (0.4 + moveSpeed)
      : breath * 0.004 * H;

    this.body.position.set(0, d.hipY, 0);
    this.body.rotation.set(0, 0, 0);
    this.hips.position.set(0, -stanceDrop * d.hipY + bob - STAND_SETTLE * H, 0);
    // 走起来胯要摆、上身反向拧一点，不然像块板子在平移。
    // 用 cos 不用 sin：相位 0 是左脚**最前**（支撑相起点），骨盆这时也该拧到头，
    // 写成 sin 的话摆胯比迈腿慢四分之一个周期，看着像在扭秧歌。
    const gaitSwing = Math.cos(this.gaitPhase * Math.PI * 2) * moveSpeed;
    this.hips.rotation.set(0, -gaitSwing * 0.14, gaitSwing * 0.05 + idleSway * 0.006);

    // --- 腿：落脚点 IK -----------------------------------------------------
    // 目标是**踝关节**（两段骨头的末端），所以站立时是 y = ankleY 而不是 0；
    // 写成 0 的话踝会去贴地、整只脚陷进地面里。
    const lift = Lerp(0.05, 0.16, moveSpeed) * H;
    const stanceEnd = 0.62;                       // 支撑相占 62%，走路才有双支撑期
    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      const phase = (this.gaitPhase + (tag === "R" ? 0.5 : 0)) % 1;
      let footZ = 0, footY = d.ankleY;
      if (stride > 0) {
        if (phase < stanceEnd) {
          // 支撑相：脚钉在地上，身体从它上面走过去
          footZ = Lerp(-stride * 0.5, stride * 0.5, phase / stanceEnd);
        } else {
          const t = (phase - stanceEnd) / (1 - stanceEnd);
          footZ = Lerp(stride * 0.5, -stride * 0.5, SmoothStep(0, 1, t));
          footY += Math.sin(Math.PI * t) * lift;
        }
      } else {
        footZ = leg.side * 0.035 * H;              // 立正也别两脚并齐
      }
      const spread = d.hipHalf + crouch * 0.035 * H + Math.abs(strafe) * 0.05 * H;
      const footX = leg.side * spread + strafe * 0.12 * H * (phase < stanceEnd ? 1 : 0.4);
      this.tmpTarget.set(footX, footY, footZ);
      this.RootToHips(this.tmpTarget);
      SolveTwoBone(leg.thigh, leg.knee, this.tmpTarget, d.thighLen, d.shinLen, leg.side * 0.10);
      // 脚踝：抵消大腿+小腿的累计俯仰让鞋底贴地，腾空时勾一下脚尖
      const pitch = ExtractPitch(leg.thigh.quaternion) + ExtractPitch(leg.knee.quaternion);
      leg.ankle.rotation.set(-pitch + (footY - d.ankleY) * 1.6 - crouch * 0.25, 0, 0);
    }

    // --- 上身：看的方向按 35% / 65% 分给胸和头 ------------------------------
    // 符号约定（三个都栽过跟头，写下来）：人物正面朝 -Z，于是
    //   rotation.x 为**正** = 上身后仰 / 抬头 / 垂下的胳膊腿往**前**摆。
    // 所以「前倾」必须是负的 x，而腿的 IK 解出来的正角度恰好是向前迈 —— 两者不矛盾。
    const lookYaw = Clamp(s.lookYaw ?? 0, -1.4, 1.4);
    const lookPitch = Clamp(s.lookPitch ?? 0, -1.0, 0.9);
    const leanFwd = 0.06 + moveSpeed * 0.26 + crouch * 0.30 + aim * 0.08;
    this.chest.rotation.set(
      -leanFwd + lookPitch * 0.22 + this.recoil * 0.06,     // 后坐把上身顶得后仰
      lookYaw * 0.35 + gaitSwing * 0.20,                    // 肩与胯反向拧
      idleSway * 0.012 - strafe * 0.05);
    // 上身前倾多少，脖子就要抬回来一部分，不然跑起来是低头看地
    this.neck.rotation.set(
      // 末项是贴腮：据枪时头要压到枪托上够照门，不压的话是「举着枪平视前方」
      lookPitch * 0.62 + leanFwd * 0.75 + breath * 0.008 - aim * 0.12,
      lookYaw * 0.65 - aim * 0.10,
      aim * 0.13 + idleSway * 0.01);                        // 据枪时头偏向照门

    // PoseWeapon 必须在 chest.rotation 写完之后调用：挂点是 chest 的子节点，
    // 它要减掉上身自己的俯仰偏航才能让枪口指到玩家真正看的方向。
    this.PoseWeapon(aim, moveSpeed, lookPitch, lookYaw, boltPhase, throwing, melee, breath, idleSway);
    this.PoseArms(aim, moveSpeed, boltPhase, throwing, melee, hurt);

    // --- 覆盖姿势：卧倒 / 中弹踉跄 / 濒死下沉 ------------------------------
    if (prone > 0.001) this.PoseProne(prone);
    if (hurt > 0.001) {
      // 中弹踉跄：上身被顶得后仰、头往后甩、脚下往后错半步
      const shake = Math.sin(elapsed * 26) * hurt;
      this.chest.rotation.x += 0.34 * hurt;
      this.chest.rotation.z += 0.16 * shake;
      this.neck.rotation.x += 0.20 * hurt;
      this.hips.position.z += 0.03 * H * hurt;
    }
    if (dying > 0.001) {
      // 濒死是往下瘫、往前塌，和中弹后仰正好相反
      this.hips.position.y -= dying * d.hipY * 0.35;
      this.chest.rotation.x -= dying * 0.45;
    }
  }

  /** 把 root 空间的落脚点换算进 hips 的父子链（body 与 hips 都可能有旋转/位移）。 */
  RootToHips(v) {
    v.sub(this.body.position);
    this.tmpQuat.copy(this.body.quaternion).invert();
    v.applyQuaternion(this.tmpQuat);
    v.sub(this.hips.position);
    this.tmpQuat.copy(this.hips.quaternion).invert();
    v.applyQuaternion(this.tmpQuat);
  }

  /**
   * 持枪挂点的位姿：低姿持枪 ↔ 枪托贴肩之间插值，再叠上后坐、拉栓的横滚、
   * 投弹时的收枪。这些常量是按 1.66 m 定的，换身高按 k 缩放。
   */
  PoseWeapon(aim, moveSpeed, lookPitch, lookYaw, boltPhase, throwing, melee, breath, idleSway) {
    const d = this.dims;
    const k = d.height / 1.66;
    const mount = this.weaponMount;
    if (!this.weaponGroup) { mount.position.set(0, 0, 0); mount.rotation.set(0, 0, 0); return; }
    const kind = this.weaponData ? this.weaponData.kind : "boltRifle";

    if (kind === "throwable" || kind === "melee") {
      // 手榴弹与大刀由投掷/劈砍动作驱动，挂点跟着右手走
      const swing = kind === "melee" ? melee : throwing;
      mount.position.set(0.15 * k, (0.16 + Math.sin(swing * Math.PI) * 0.18) * k, (-0.12 - swing * 0.20) * k);
      mount.rotation.set(-0.4 + swing * 2.2, 0.2, -0.3 + swing * 0.5);
      return;
    }

    // 低姿持枪：枪口朝前下约 17°，右手在右腰前。
    // 跑起来枪要往身侧收、枪口压低，不然满屏都是横在胸前的枪管。
    const running = moveSpeed > 0.55;
    const restPx = (running ? 0.145 : 0.115) * k;
    const restPy = (running ? 0.030 : 0.075) * k;
    const restPz = (running ? -0.060 : -0.135) * k;
    const restRx = running ? -0.55 : -0.30;
    const restRy = running ? 0.50 : 0.34;
    const restRz = running ? 0.30 : 0.16;
    // 据枪：枪托底板顶进右肩窝（肩关节往下 4 cm 的那个窝）。
    // y=0.325 是按肩高 0.22H 减出来的 —— 早先按 0.29 摆，枪口比眼睛低了 40 cm。
    const t = SmoothStep(0, 1, aim);
    mount.position.set(
      Lerp(restPx, 0.085 * k, t),
      Lerp(restPy, 0.325 * k, t) + breath * 0.004 * k * (1 - aim * 0.6),
      Lerp(restPz, -0.300 * k, t));

    // 据枪朝向：先算出「枪身在 root 空间该指哪」，再**整体除掉**上身累积的旋转。
    // 这里必须用四元数，不能写成 aimRx = lookPitch - chest.rotation.x：
    // 欧拉角不能逐轴相减，单看俯仰是准的，可一旦偏航也不为零，两轴耦合最大能偏 8°
    // —— 那正是「准心套住人却打不中」的那类 bug，而且在静止截图上完全看不出来。
    POSE_E.set(lookPitch, lookYaw, 0, "YXZ");
    AIM_Q.setFromEuler(POSE_E);
    PARENT_Q.copy(this.body.quaternion).multiply(this.hips.quaternion).multiply(this.chest.quaternion).invert();
    AIM_Q.premultiply(PARENT_Q);
    POSE_E.set(restRx, restRy, restRz, "XYZ");
    REST_Q.setFromEuler(POSE_E);
    mount.quaternion.slerpQuaternions(REST_Q, AIM_Q, t);

    // 附加动作都绕枪自己的轴，所以右乘：后坐抬头、拉栓横滚、投弹让位
    const kick = (this.weaponData && this.weaponData.recoil ? this.weaponData.recoil.kick : 0.05);
    mount.position.z += this.recoil * kick;             // 枪往肩窝里退
    let extraY = idleSway * 0.006 * (1 - aim);
    let extraZ = Lerp(restRz, 0.02, t) + throwing * 0.5;
    if (boltPhase > 0) {
      // 拉栓时把枪往内一转露出抛壳口，右手才有地方去拉 —— 真人就是这么打的
      const cant = Math.sin(boltPhase * Math.PI);
      extraZ += cant * 0.30;
      extraY += cant * 0.14;
      mount.position.y -= cant * 0.02 * k;
    }
    if (throwing > 0) mount.position.x += throwing * 0.06 * k;
    POSE_E.set(this.recoil * 0.16 + idleSway * 0.004, extraY, extraZ, "XYZ");
    OFF_Q.setFromEuler(POSE_E);
    mount.quaternion.multiply(OFF_Q);
  }

  /**
   * 手臂。有枪就两只手 IK 到枪上的握点（**先摆枪、手再跟过去**），
   * 空手才走自由摆臂。反过来做的话手永远对不上枪。
   */
  PoseArms(aim, moveSpeed, boltPhase, throwing, melee, hurt) {
    const d = this.dims;
    const H = d.height;
    const L = this.arms.L, R = this.arms.R;
    const lenA = d.upperArmLen, lenB = d.forearmLen;

    if (!this.weaponGroup) {
      // 空手摆臂。同样用 cos 与步态同相：相位 0 左腿在前，左臂就该在后。
      const swing = Math.cos(this.gaitPhase * Math.PI * 2) * (0.15 + moveSpeed * 0.7);
      L.shoulder.rotation.set(-swing, 0, -0.13 - moveSpeed * 0.06);
      R.shoulder.rotation.set(swing, 0, 0.13 + moveSpeed * 0.06);
      L.elbow.rotation.set(-0.28 - moveSpeed * 0.55, 0, 0);
      R.elbow.rotation.set(-0.28 - moveSpeed * 0.55, 0, 0);
      return;
    }

    // 枪上的握点换算到 chest 空间。weaponMount 是 chest 的直接子节点，更新它自己的
    // 局部矩阵就够，不用惊动整棵世界矩阵树；weaponScale 是抵消身高缩放的那一份。
    this.weaponMount.updateMatrix();
    this.gripR.set(0, 0, 0).applyMatrix4(this.weaponMount.matrix);
    this.gripL.copy(this.weaponGripFront).multiplyScalar(this.weaponScale)
      .applyMatrix4(this.weaponMount.matrix);

    if (boltPhase > 0) {
      // 拉栓：右手离开握把 → 摸到拉机柄 → 向后拉 → 推回 → 回握把
      const reach = SmoothStep(0, 0.22, boltPhase) * (1 - SmoothStep(0.78, 1, boltPhase));
      const pull = Math.sin(Clamp01((boltPhase - 0.2) / 0.6) * Math.PI) * 0.10;
      POSE_A.copy(this.weaponBolt).multiplyScalar(this.weaponScale);
      POSE_A.z += pull;
      POSE_A.applyMatrix4(this.weaponMount.matrix);
      this.gripR.lerp(POSE_A, reach);
    }

    let leftFollows = this.weaponTwoHanded;
    if (throwing > 0.001) {
      // 投弹：抡臂 —— 手过肩往后（0—0.45）→ 抡到前上方（0.42—0.72）→ 随挥
      const back = 1 - SmoothStep(0, 0.5, throwing);
      const fwd = SmoothStep(0.42, 0.72, throwing);
      this.gripR.set(
        0.16 * H * (1 - fwd * 0.4),
        Lerp(0.30, 0.46, back) * H - fwd * 0.12 * H,
        Lerp(0.10, -0.42, fwd) * H + back * 0.16 * H);
      this.chest.rotation.y += back * 0.28 - fwd * 0.34;   // 投弹靠的是腰不是胳膊
      leftFollows = false;
    } else if (melee > 0.001) {
      // 大刀劈砍：右手从右上抡到左下，力线从肩过腰
      const raise = 1 - SmoothStep(0, 0.4, melee);
      const chop = SmoothStep(0.35, 0.72, melee);
      this.gripR.set(
        Lerp(0.22, -0.16, chop) * H,
        Lerp(0.30, 0.52, raise) * H - chop * 0.42 * H,
        Lerp(0.14, -0.36, chop) * H);
      this.gripL.copy(this.gripR).add(POSE_B.set(-0.04 * H, 0.05 * H, -0.07 * H));
      this.chest.rotation.y += raise * 0.30 - chop * 0.40;
      this.chest.rotation.x += chop * 0.30;
      leftFollows = true;
    }

    // 肘往哪边弯：roll≈π 是往后，再各加一点让肘尖向外张开。
    // 这几个数是对着截图调出来的，不是算出来的 —— 改之前先存一张对比图。
    const rollR = Math.PI * (1.16 - aim * 0.10) + hurt * 0.2;
    const rollL = Math.PI * (0.80 + aim * 0.06) - hurt * 0.2;
    SolveTwoBone(R.shoulder, R.elbow, this.gripR, lenA, lenB, rollR);
    if (leftFollows) {
      SolveTwoBone(L.shoulder, L.elbow, this.gripL, lenA, lenB, rollL);
    } else {
      // 单手武器（驳壳枪）或正在投弹：左手自然垂着摆
      const swing = Math.cos(this.gaitPhase * Math.PI * 2) * (0.2 + moveSpeed * 0.5);
      L.shoulder.rotation.set(-swing, 0, -0.16);
      L.elbow.rotation.set(-0.35 - moveSpeed * 0.4, 0, 0);
    }
  }

  /**
   * 卧倒：整个人绕胯翻到接近水平（**负的** x 才是脸朝下、头朝前），
   * 腿顺着身体轴往后伸直，上身用肘撑起来一点，不然趴下去就什么都看不见了。
   * 身体轴比水平低约 10°，正好让踝落回地面附近 —— 腿这里不需要再单独摆。
   */
  PoseProne(prone) {
    const d = this.dims;
    const t = SmoothStep(0, 1, prone);
    this.body.rotation.x = Lerp(this.body.rotation.x, -1.40, t);
    this.body.position.y = Lerp(this.body.position.y, 0.095 * d.height, t);
    this.chest.rotation.x = Lerp(this.chest.rotation.x, 0.32, t);
    this.neck.rotation.x = Lerp(this.neck.rotation.x, 0.50, t);
    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      BlendEuler(leg.thigh, 0.06, 0, leg.side * 0.22, t);
      BlendEuler(leg.knee, -0.18, 0, 0, t);
      BlendEuler(leg.ankle, 0.70, 0, 0, t);                 // 脚背贴地
      BlendEuler(this.arms[tag].shoulder, 0, 0, leg.side * 0.55, t * 0.55);
    }
  }

  /**
   * 倒地的确定性姿态过渡（0.8 秒）：
   *   0.00—0.30 膝先软，胯往下掉；
   *   0.12—0.78 上身按中弹方向前扑或后仰，手臂脱力甩开；
   *   0.62—1.00 落定，之后不再动 —— 不做二次弹跳，那个一眼就是假物理。
   */
  PoseRagdoll(rag, dying) {
    const d = this.dims;
    const t = rag.t;
    const knee = SmoothStep(0, 0.30, t);
    const fall = SmoothStep(0.12, 0.78, t);
    const settle = SmoothStep(0.62, 1, t);
    const dir = rag.forward;

    // 胯落到 0.085H：贴地的躯干厚度就这么多。翻转方向是 -dir —— 正的 x 是后仰。
    this.body.position.set(0, Lerp(d.hipY, 0.085 * d.height, SmoothStep(0.05, 0.82, t)), 0);
    this.body.rotation.set(-dir * Lerp(0, 1.52, fall), rag.side * 0.35 * fall, rag.side * 0.28 * fall);
    this.hips.position.set(0, -knee * 0.22 * d.hipY, 0);
    this.hips.rotation.set(0, 0, 0);
    // 上身在膝软的那一下弓一下，落定后必须归零 —— 留着弯度就成了「半坐着的尸体」
    this.chest.rotation.set(dir * 0.30 * knee * (1 - settle), rag.side * 0.2, -rag.side * 0.18 * fall);
    this.neck.rotation.set(dir * 0.26 * fall, rag.side * 0.4 * fall, rag.side * 0.35);

    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      // 膝先软，落地后再松开一半 —— 一直保持大弯度会变成「空中蹬着腿」
      const bend = Lerp(0.15, 0.95, knee) * (1 - 0.55 * settle) * (tag === "L" ? 1 : 0.72);
      BlendEuler(leg.thigh, -bend * dir * 0.5 + 0.25 * fall, 0, leg.side * (0.12 + 0.26 * fall), 1);
      BlendEuler(leg.knee, -bend * 1.15, 0, 0, 1);
      BlendEuler(leg.ankle, 0.35 * fall, 0, 0, 1);
      const arm = this.arms[tag];
      BlendEuler(arm.shoulder, dir * 0.9 * fall - 0.2, 0, leg.side * (0.35 + 0.55 * fall), 1);
      BlendEuler(arm.elbow, -0.5 - 0.4 * fall, 0, 0, 1);
    }
    // 死了枪就脱手：挂点甩到身侧，不再据枪
    if (this.weaponGroup) {
      this.weaponMount.position.set(0.10 * d.height, -0.05 * d.height, -0.05 * d.height);
      this.weaponMount.rotation.set(-0.4 * dir, 0.7, 1.1 * fall);
    }
    if (dying > 0) this.body.rotation.x += dying * 0.02;
  }

  /**
   * 释放。几何与材质都是工厂 / 材质库共有的，这里只摘节点、断引用；
   * 真正的 dispose 在 ActorFactory.Dispose()。误 dispose 共享几何会让别的人物一起消失。
   */
  Dispose() {
    if (this.disposed) return;
    if (this.root.parent) this.root.parent.remove(this.root);
    this.root.clear();
    this.weaponGroup = null;
    this.disposed = true;
  }
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------
export class ActorFactory {
  /**
   * @param {import("./Script_Materials.mjs").MaterialLibrary} library 已经 Prepare 过的材质库
   * @param {{quality?: "low"|"medium"|"high"}} options
   *   quality 主要影响材质桶数量（≈ 每人的 draw call）：high≈20、medium≈16、low≈12。
   *   24 人同屏建议只给最近的几个 high，其余用 medium/low 各建一个工厂。
   */
  constructor(library, { quality = "high" } = {}) {
    this.library = library;
    this.quality = quality === "low" || quality === "medium" ? quality : "high";
    this.kindCache = new Map();      // kind -> { dims, bones }
    this.weaponCache = new Map();    // weaponId|quality -> { geometries, muzzle, ... }
    this.materialCache = new Map();
    this.disposed = false;
  }

  /**
   * kind: "nra" | "nraDare" | "ija" | "ijaOfficer" | "civilian"
   * options: { seed, weapon (Data_Weapons 的 id 或 null), rank }
   */
  Create(kind, options = {}) {
    return new Actor(this, KIND_SPEC[kind] ? kind : "nra", options);
  }

  /** 按 kind 缓存整套骨骼几何：24 个人各自合并六十来个盒子会卡出一个肉眼可见的顿。 */
  KindGeometry(kind) {
    const cached = this.kindCache.get(kind);
    if (cached) return cached;
    const spec = KIND_SPEC[kind];
    const dims = Dimensions(spec.height);
    const quality = this.quality;
    const hy = dims.headCenterY - dims.neckY;
    const lod = LOD[quality];
    const bones = {};
    const make = (fn) => {
      const buckets = new Map();
      buckets.remap = lod.mergeTo;
      fn(buckets);
      return BakeBuckets(buckets);
    };

    // 低模把盆骨并进躯干：代价是腰胯不再有相对扭动，远处根本看不出来
    bones.hips = lod.pelvisInChest ? null : make((b) => BuildHips(b, dims, spec, quality));
    bones.chest = make((b) => {
      BuildChest(b, dims, spec, quality);
      BuildGear(b, dims, spec, quality);
      if (lod.pelvisInChest) AddShifted(b, (t) => BuildHips(t, dims, spec, quality), dims.hipY - dims.waistY);
    });
    bones.head = make((b) => BuildHead(b, dims, spec, quality));
    bones.armL = make((b) => BuildArm(b, dims, spec, quality, -1, "upper"));
    bones.armR = make((b) => BuildArm(b, dims, spec, quality, 1, "upper"));
    bones.foreL = make((b) => BuildArm(b, dims, spec, quality, -1, "fore"));
    bones.foreR = make((b) => BuildArm(b, dims, spec, quality, 1, "fore"));
    bones.thigh = make((b) => BuildLeg(b, dims, spec, quality, 1, "thigh"));
    // 低模把脚并进小腿：踝不再单独摆正，腾空那半个周期脚尖会跟着小腿转，
    // 换来两个 mesh —— 远处人物值这个价，近处（high/medium）绝不这么干。
    const shin = (side) => (b) => {
      BuildLeg(b, dims, spec, quality, side, "shin");
      if (lod.footInShin) AddShifted(b, (t) => BuildLeg(t, dims, spec, quality, side, "foot"), -dims.shinLen);
    };
    bones.shinL = make(shin(-1));
    bones.shinR = make(shin(1));
    bones.foot = lod.footInShin ? null : make((b) => BuildLeg(b, dims, spec, quality, 1, "foot"));

    // 白毛巾默认就建好，用 visible 开关 —— SetTowel 可能在战斗中途调用，
    // 那时候再合并几何会掉帧。
    bones.towelHead = make((b) => {
      Add(b, "towel", TubeY(dims.headW * 0.66, dims.headW * 0.68, 0.042 * dims.height, 10, TILE_METERS.cloth),
        { y: hy + 0.052 * dims.height });
      Add(b, "towel", Cloth(0.03 * dims.height, 0.09 * dims.height, 0.02 * dims.height, "towelTail"),
        { x: dims.headW * 0.6, y: hy + 0.012 * dims.height, z: 0.03 * dims.height, rz: 0.3 });
    });
    bones.towelArm = make((b) => {
      Add(b, "towel", Cloth(0.072 * dims.height, 0.062 * dims.height, 0.072 * dims.height, "towelArm"),
        { y: -dims.upperArmLen * 0.34 });
    });

    if (spec.dadao) bones.dadao = make((b) => BuildDadao(b, dims, quality));
    if (spec.grenadeBelt) bones.grenades = make((b) => BuildGrenadeBelt(b, dims, quality));

    const entry = { dims, bones };
    this.kindCache.set(kind, entry);
    return entry;
  }

  WeaponGeometry(weaponId) {
    const key = `${weaponId}|${this.quality}`;
    let built = this.weaponCache.get(key);
    if (!built) {
      built = BuildWeaponGeometry(weaponId, this.quality);
      this.weaponCache.set(key, built);
    }
    return built;
  }

  /** 取（并缓存）一份材质。同一组参数全场只建一个，省的是着色器编译不是内存。 */
  Material(key, create) {
    let m = this.materialCache.get(key);
    if (!m) { m = create(); this.materialCache.set(key, m); }
    return m;
  }

  /**
   * 一个人的一整套材质。军装从 3—5 档色变里按 seed 抽一档 —— 史料原话是
   * 「同一个连队深浅不一」，一个班全是同一个灰就假了。
   */
  ActorMaterials(kind, rnd) {
    const spec = KIND_SPEC[kind];
    const lib = this.library;
    const recipe = spec.clothRecipe;
    const clothHex = spec.clothHex[Math.min(spec.clothHex.length - 1, Math.floor(rnd() * spec.clothHex.length))];
    const skinHex = HEX.skin[Math.min(HEX.skin.length - 1, Math.floor(rnd() * HEX.skin.length))];
    const webHex = HEX.nraWebbing[Math.min(HEX.nraWebbing.length - 1, Math.floor(rnd() * HEX.nraWebbing.length))];

    // tintId 这个字段 Get() 根本不看，它只是为了进 Get 的缓存键：
    // Get 用 JSON.stringify(options) 做键，而 THREE.Color.toJSON() 返回 getHex()，
    // 会把大于 1 的染色分量钳到 0xff —— 两个不同的亮色染色会撞成同一份材质。
    const uniform = this.Material(`uniform:${recipe}:${clothHex}`,
      () => lib.Get(recipe, { color: TintTo(recipe, clothHex), tintId: `u${clothHex}`, roughness: 1 }));

    // 绑腿「色同军装或更浅」；日方就是同色布脚绊。中方这一桶还兼着子弹带与干粮袋。
    const accessoryHex = spec.gear === "nra" ? webHex : (spec.gear === "ija" ? clothHex : HEX.nraPuttee);
    const accessory = this.Material(`acc:${recipe}:${accessoryHex}`,
      () => lib.Get(recipe, { color: TintTo(recipe, accessoryHex), tintId: `a${accessoryHex}`, roughness: 1 }));

    // 台儿庄是 3—4 月，草鞋与布鞋**混杂**出现，所以这里掷一次骰子
    const shoeHex = spec.shoe === "boot" ? HEX.ijaBoot
      : (spec.shoe === "clothShoe" || rnd() < 0.45 ? HEX.clothShoe : HEX.strawShoe);

    return {
      uniform,
      accessory,
      shoe: this.Material(`shoe:${shoeHex}`,
        () => lib.Plain(`shoe${shoeHex}`, { color: shoeHex, roughness: 0.94, metalness: 0 })),
      skin: this.Material(`skin:${skinHex}`,
        () => lib.Plain(`skin${skinHex}`, { color: skinHex, roughness: 0.78, metalness: 0 })),
      helmet: this.Material("helmet", () => lib.Get("SteelHelmet",
        { color: TintTo("SteelHelmet", HEX.ijaHelmet), tintId: "helm", roughness: 0.72, metalness: 0.85 })),
      steel: this.Material("steel", () => lib.Get("Steel", { roughness: 0.62, metalness: 0.9 })),
      wood: this.Material("wood", () => lib.Get("WoodStock", { roughness: 0.86, metalness: 0 })),
      leather: this.Material("leather",
        () => lib.Plain("leather", { color: HEX.ijaLeather, roughness: 0.66, metalness: 0 })),
      towel: this.Material("towel", () => lib.Plain("towel", { color: HEX.towel, roughness: 0.95, metalness: 0 })),
      red: this.Material("red", () => lib.Plain("red", { color: HEX.redBinding, roughness: 0.92, metalness: 0 })),
      // 全场唯二的高饱和点：青天白日帽徽的蓝白、日军领章的红。别再加第三处。
      // 都是单面 Shape/Circle，正反装错就消失，所以一律 DoubleSide。
      accentA: this.Material(`accentA:${spec.gear}`, () => lib.Plain(`accentA${spec.gear}`, {
        color: spec.gear === "ija" ? HEX.ijaCollar : HEX.badgeBlue,
        roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
      })),
      accentB: this.Material(`accentB:${spec.gear}`, () => lib.Plain(`accentB${spec.gear}`, {
        color: spec.gear === "ija" ? HEX.ijaStar : HEX.badgeWhite,
        roughness: spec.gear === "ija" ? 0.42 : 0.7,
        metalness: spec.gear === "ija" ? 0.8 : 0, side: THREE.DoubleSide,
      })),
    };
  }

  Dispose() {
    if (this.disposed) return;
    for (const entry of this.kindCache.values()) {
      for (const bone of Object.values(entry.bones)) {
        if (!bone) continue;
        for (const geometry of bone.values()) geometry.dispose();
      }
    }
    for (const built of this.weaponCache.values()) {
      for (const geometry of built.geometries.values()) geometry.dispose();
    }
    // 材质归 MaterialLibrary 所有（它自己的 Dispose 会收），这里只断引用
    this.kindCache.clear();
    this.weaponCache.clear();
    this.materialCache.clear();
    this.disposed = true;
  }
}

export { KIND_SPEC, HEX as ACTOR_PALETTE };
