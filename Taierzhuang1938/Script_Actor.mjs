// 《血战台儿庄》人物状态机与附件系统。
//
// 国军/日军的可见人体已由 Script_CharacterModel 的蒙皮 GLB 与 AnimationClip 接管。
// 这里的 Object3D 程序化骨架只保留状态机、死亡根运动、百姓与资源故障回退；军人旧网格
// 会被隐藏。SkinnedMesh 整棵标 skipNormalDepth，避免 overrideMaterial 预通道缺 skinning
// define 时塌到原点；主场景和阴影仍正常蒙皮渲染。
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
import { INFANTRY_RELEASE_SECONDS } from "./Script_InfantryAnimation.mjs";
import { Mulberry32, HashString, Clamp, Clamp01, SmoothStep } from "./Script_Noise.mjs";
import { MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { LoadRiggedAssets } from "./Script_RiggedModel.mjs";
import {
  CreateLugouCharacterRig,
  LoadLugouCharacterAssets,
} from "./Script_CharacterModel.mjs";
import { RaycastCapsule } from "./Script_CharacterHitboxMath.mjs";
import {
  ACTOR_MESH_BY_VARIANT,
  MESHES, MeshUrl, SOLDIER_JOINTS, SOLDIER_MESH_BY_KIND, WEAPON_MESH_BY_ID,
  WEAPON_MESH_VARIANTS, WeaponMeshId,
  BAYONET_MESH_BY_WEAPON,
} from "./Data_Meshes.mjs";

const Lerp = (a, b, t) => a + (b - a) * t;

// 车厢生活动作是附加层：所有量都保持 0 时，Update 的结果与旧版完全一致。
// 这里不把动作拆成互斥枚举，导演可以同时给 sit + repairShoe，或 cleanRifle +
// checkAmmo，姿态层会按数值混合。非法值（NaN、Infinity、字符串）统一回到 0，
// 避免一个坏的过场关键帧把整棵骨架污染成 NaN。
export const LIFE_POSE_NAMES = Object.freeze([
  "sit", "repairShoe", "cleanRifle", "sleep", "checkAmmo", "prepare",
]);

const Finite01 = (value) => (typeof value === "number" && Number.isFinite(value)
  ? Clamp01(value) : 0);

export function NormalizeLifePose(input = {}) {
  const source = input && typeof input === "object" && input.lifePose
    && typeof input.lifePose === "object" ? input.lifePose : input;
  const out = {};
  for (const name of LIFE_POSE_NAMES) out[name] = Finite01(source && source[name]);
  return out;
}

// 第二批生活动作。**故意不并进 LIFE_POSE_NAMES**：那张表是对外的姿态契约，
// 已经有测试逐条断言它的内容与顺序（Script_ActorPoseTest）。这两个动作在数据里
// 早就写着了（Data_CutsceneChuchuan 的 CHUCHUAN_CROWD_LIFE 有 warmHands / watch），
// 只是引擎一直把它们过滤掉 —— 于是「搓手的人」和「看窗外的人」在画面上等于普通坐姿，
// 一动不动。这里补上通路，名字与取值规则和上面那张表完全一致。
export const LIFE_POSE_EXTRA_NAMES = Object.freeze(["warmHands", "watch"]);

export function NormalizeLifeExtra(input = {}) {
  const source = input && typeof input === "object" && input.lifePose
    && typeof input.lifePose === "object" ? input.lifePose : input;
  const out = {};
  for (const name of LIFE_POSE_EXTRA_NAMES) out[name] = Finite01(source && source[name]);
  return out;
}

// 待机活化的公共节拍器。**没有一个随机数**：相位只来自个体的 idlePhase，
// 所以同一秒重放永远得到同一帧（截图审查的前提）。
//
// Wave：连续正弦；Pulse：每 period 秒来一下、宽 width 秒的半正弦脉冲。
// 「每 8—15 秒挪一次重心」这种事必须用 Pulse 而不是低频正弦 —— 正弦是全程都在动，
// 看上去是一车人在慢慢摇；脉冲是「停很久，动一下」，那才是人坐着的样子。
const Wave = (t, hz, phase) => Math.sin(t * hz * Math.PI * 2 + phase);
function Pulse(t, period, width, phase01) {
  const p = Math.max(0.5, period);
  const k = ((t / p + phase01) % 1 + 1) % 1;
  const w = Math.min(0.9, Math.max(0.02, width / p));
  return k < w ? Math.sin((k / w) * Math.PI) : 0;
}

// 「这个生活动作是不是意味着他坐下了」。
//
// **坐不是连续量**：一个人要么坐下了要么站着，没有「坐了三成」这回事。可
// repairShoe / checkAmmo / cleanRifle 这些动作在数据里大量是零头（群演的
// 0.18—0.46 只是「这人手上有活儿」的意思），直接按系数并进坐姿量的话，
// 站着的人会拿到三成坐姿：骨盆按比例掉下去、大腿按同一比例折到 45°，
// 出图上就是**站着蹲马步、屁股悬在凳面上方**（序章 t=20 过道里那位）。
// 所以隐含坐姿要过一道判定闸：动作强度过半才认为他真坐下了。
// 显式的 sit 不走这道闸 —— 那是导演直接说「坐」，写多少就是多少。
function ImpliedSeat(amount, weight) {
  return SmoothStep(0.45, 0.85, amount) * weight;
}

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
  strawShoe: 0x9E875A,   // 顺光下 C4A96C 是一块发光的亮黄方块（出川过场贴地镜），压一档
  clothShoe: 0x2B2B2E,
  towel: 0xEDE9DF,
  redBinding: 0x9E2B22,            // 大刀柄尾铁环上缠的红布
  // 日方
  // 昭五式土黄。**这三个数是按可读性压过的，不是史料色**，压的理由值得写下来：
  //
  // 实测第五关（十字街）站在出生点上，最近的日军在 66 m 外、在 900 px 的屏幕上
  // 高 21 px，往后 75—115 m 那一批只有 12—19 px。而原来这三个色的亮度是
  // 114 / 128 / 140，地面（RubbleGround 的 dirt）是 119 —— **和地面一模一样**，
  // 而且同属暖黄色相。二十个像素高、和背景同亮度同色相的东西，人眼是找不到的：
  // 玩家的原话是"我完全看不到敌军在哪里，这怎么玩"。
  //
  // 国军那一套之所以没这个问题，是因为它偏冷蓝（亮度 100—137 但色相是冷的），
  // 在暖色地面上靠色相就分出来了。日方两头都没有。
  //
  // 现在压到亮度 85 / 95 / 105，比地面低一档半。色相仍是土黄（史料是茶褐色，
  // 实物羊毛在照片上本来就比想象的暗），只是把"和地面同一档"这件事挪开。
  // **这是可读性决定，不是考据修正** —— 改回去之前先想清楚 66 m / 21 px 这两个数。
  //
  // 【2026-08-20 再压一档：85/95/105 那一版在屏幕上等于没改】
  // 上一版是拿**地面**当参照配的，可 70 m 外的日军身后大多不是地面，是被雾洗过的
  // 远墙。实测（十字街，1600×900，把每个可见士兵投到屏幕、量躯干与两侧背景）：
  //   日军 70—78 m，屏上高 19—25 px，韦伯对比度 **0.013—0.086**，暖冷指标 R−B
  //   25.0 而背景 24.8 —— 亮度、色相**双双落在噪声里**，人眼找不到是必然的。
  // 根子在大气透视：合成 pass 的雾在 70 m 已经盖了 0.64—0.67，
  // 而雾是朝雾色的线性插值 —— 它把**任何**反照率差都乘上 (1 − fog)，
  // 也就是把差距压到三分之一。想在 70 m 留下 15% 的对比，反照率端就得有 45%。
  //
  // **然后这一版试着再压一档，实测证明这条路走不通，所以数值原样退回来了。**
  // 把亮度从 85/95/105 压到 62/72/83（−27%）之后重新量同一批人：
  //   十字街 70—85 m：韦伯 0.020 → 0.035     东关 71 m：79.2 → 78.6（几乎没动）
  //   北门（夜）61 m：49.1 → 33.6            ← 只有夜战这一档真的变了
  // 同一组镜头把雾密度乘 0.4 再量：韦伯 0.020 → **0.108**，是压军装色的五倍。
  // 结论写死在这儿，省得下一轮再试一遍：**七十米上决定"看不看得见"的是大气透视，
  // 不是反照率**。雾是朝雾色的线性插值，它把任何反照率差都乘上 (1 − fog)；
  // 70 m 上 fog 已经 0.64—0.67，反照率端改多少，到屏幕上都只剩三分之一。
  // 要在这个距离上把人捞出来，只能动 Script_Sky 的 fog（density / desat / flatten），
  // 那是全局观感，属于美术方向，别在这张色表里偷偷解决。
  ijaCloth: [0x5C563A, 0x67603F, 0x716A4E],
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
    headW: 0.102 * H, headH: 0.132 * H, headD: 0.126 * H,
    // 脚的高度**等于**踝关节高度：IK 解到踝，脚这块料正好从踝铺到地面，
    // 随手给个 0.04H 的话人会陷进地里或者浮起来。
    footLen: 0.148 * H, footW: 0.056 * H, footH: 0.055 * H,
  };
}
// Opt-in procedural children; adult model joints and seeded adult variants stay
// unchanged. Larger head share and shorter legs are authored proportions, not
// an adult root scaled down. Physics consumers use the actual actor.height.
function ChildDimensions() {
  const H=1.12,d=Dimensions(H);
  return {...d,ankleY:.05*H,kneeY:.24*H,hipY:.46*H,waistY:.55*H,
    shoulderY:.76*H,neckY:.80*H,headCenterY:.90*H,
    thighLen:.22*H,shinLen:.19*H,upperArmLen:.15*H,forearmLen:.14*H,
    shoulderHalf:.105*H,headW:.145*H,headH:.20*H,headD:.16*H,
    footH:.05*H,footLen:.13*H};
}

/**
 * 九〇式钢盔真正喂给材质的 albedo。**不是** HEX.ijaHelmet ——
 * 那个是史料记的"看上去的颜色"，当 albedo 用会被这条管线的曝光顶成暖白色。
 * 账记在 ActorMaterials 里 helmet 那一行上面。
 */
const IJA_HELMET_ALBEDO = 0x3C3A30;

/**
 * 日军远景辨识补偿。不是描边 UI：它仍走原 PBR、雾和后处理，只在 70 m 外逐渐给
 * 军装/钢盔的掠射轮廓补一点低饱和卡其反光。原色与鲁南春季黄土地太接近，三百米上
 * 剩四五个像素时会完全融进地面；这层把“人形边”留下，但 55 m 内严格为零。
 */
function AddDistantIjaReadability(material, strength = 1) {
  if (!material || material.userData.distantIjaReadable) return material;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) previousCompile.call(material, shader, renderer);
    shader.uniforms.uIjaReadabilityColor = { value: new THREE.Color(0x8B7A48).multiplyScalar(strength) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uIjaReadabilityColor;`)
      .replace("#include <opaque_fragment>", `
        float ijaReadableRange = smoothstep(70.0, 240.0, length(vViewPosition));
        float ijaReadableRim = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 1.6);
        outgoingLight += uIjaReadabilityColor * ijaReadableRange * (0.025 + ijaReadableRim * 0.16);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ""}|ijaReadable:${strength}`;
  material.userData.distantIjaReadable = true;
  material.userData.distantIjaStartM = 70;
  material.needsUpdate = true;
  return material;
}

/** 站直也留一点膝盖弯：腿绷成一条直线是「假人」最明显的一处。 */
const STAND_SETTLE = 0.014;
/** 脚贴地能修正的最大高差（米，root 局部尺度）。超过这个数说明人本来就该掉下去。 */
const FOOT_IK_RANGE = 0.55;
/** 贴地量的收敛速率（每秒）。太快会在台阶边缘抖，太慢上台阶时脚会拖一截。 */
const FOOT_IK_RATE = 14;
/** 鞋底贴斜面的角度上限（弧度，约 22°）。 */
const FOOT_IK_TILT = 0.38;

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
    mergeTo: { accessory: "uniform", leather: "uniform", shoe: "uniform", red: "uniform", hair: "uniform" },
  },
};

const KIND_SPEC = {
  nra: {
    height: 1.66, clothRecipe: "ClothNra", clothHex: HEX.nraCloth,
    headgear: "cap", shoe: "strawSandal", gear: "nra", defaultWeapon: "ZhongZheng",
  },
  nraDare: {
    height: 1.68, clothRecipe: "ClothNra", clothHex: HEX.nraCloth,
    headgear: "cap", shoe: "strawSandal", gear: "nra", defaultWeapon: "HanYang",
    dadao: true, grenadeBelt: true, towelOn: true,
  },
  // 军官：武装带 + 枪套、不背枪；同一支出川队伍仍穿草鞋
  nraOfficer: {
    height: 1.70, clothRecipe: "ClothNra", clothHex: HEX.nraCloth,
    headgear: "peakCap", shoe: "strawSandal", gear: "officer", defaultWeapon: null,
  },
  ija: {
    height: 1.62, clothRecipe: "ClothIja", clothHex: HEX.ijaCloth,
    headgear: "helmet", shoe: "boot", gear: "ija", defaultWeapon: "Type38",
  },
  ijaOfficer: {
    height: 1.64, clothRecipe: "ClothIja", clothHex: HEX.ijaCloth,
    headgear: "peakCap", shoe: "boot", gear: "ija", defaultWeapon: "Type38",
  },
  civilian: {
    height: 1.60, clothRecipe: "ClothNra", clothHex: HEX.civilCloth,
    headgear: "wrap", shoe: "clothShoe", gear: "none", defaultWeapon: null,
    // 男女两个模型（Model/CivilianMale|Female.tzm.json），按 seed 抽。
    // 值是整体缩放：**身高差只能走缩放**，不能给两套 Dimensions ——
    // 关节偏移必须与 _blender 里烘死的那一套逐字一致，改比值就开缝。
    // 1.03 / 0.958 落在 1.65 m / 1.53 m，是 1930 年代华北成年男女的平均身高；
    // 两个模型都建在 1.60 m 上，差值全在这两个数里。
    variants: { male: 1.03, female: 0.958 },
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

// 枪械尺度的贴图格距。**枪不许用 TILE_METERS 那一套**（那是给砖墙、门板调的）：
// 一支枪只有房子的十分之一大，用 wood=1.0 m 的格距，枪托横向只吃到贴图的 4%，
// 木纹的年轮带会拉成横跨整个托身的虎斑。三处必须是同一套数，否则同一把枪
// 在第一人称、在别人手里、在编辑器台架上是三种花纹：
//   · 第一人称手搭 rig —— Script_Viewmodel.VM_TILE
//   · Blender 出的模型 —— _blender/TzmCore.GUN_TILE
//   · 下面这套（模型读不到时的兜底几何，外加腰间手榴弹、背后大刀）
const GUN_TILE = { steel: 0.030, wood: 0.085 };
const GunSteelBox = (w, h, d, seed) => MakeBox(w, h, d, GUN_TILE.steel, seed);
const GunWoodBox = (w, h, d, seed) => MakeBox(w, h, d, GUN_TILE.wood, seed);

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

/**
 * 把一根骨头朝一组欧拉角混过去（蹲/卧/倒地这些覆盖姿势都叠在 IK 之上）。
 *
 * order 不是可有可无的装饰：欧拉序决定**哪一轴先转**，而先转的那一轴才是
 * 「在骨头自己的坐标系里」转。匍匐的青蛙腿必须先绕大腿自己的长轴滚 90°
 * （把膝盖的弯曲轴滚到朝天），再外展 —— 用默认的 YXZ（滚是最外层）就变成
 * 「先外展再整条腿绕竖轴甩」，膝盖会抬到半空去。
 */
function BlendEuler(object, x, y, z, t, order = "YXZ") {
  if (t <= 0) return;
  TMP_E.set(x, y, z, order);
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
    if (spec.gear === "officer") {
      // 中方大檐帽：帽徽仍是青天白日（蓝底白十二芒），不是日军的五角星
      if (LOD[quality].capDisc) {
        Add(buckets, "accentA", new THREE.CircleGeometry(0.016, 14),
          { y: hy + 0.05 * H, z: -d.headD * 0.595, ry: Math.PI });
      }
      Add(buckets, "accentB", StarGeometry(12, 0.0112, 0.0052),
        { y: hy + 0.05 * H, z: -d.headD * 0.606, ry: Math.PI });
    } else {
      Add(buckets, "accentB", StarGeometry(5, 0.014, 0.0062),
        { y: hy + 0.05 * H, z: -d.headD * 0.6, ry: Math.PI });
    }
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
    if (spec.shoe === "strawSandal") {
      // 出川川军草鞋：旧版是一整块方鞋楦；这里拆成裸露脚背、薄草底、V 字系带和
      // 前掌三束草绳。即使正式 TZM 载入失败，贴地过场也不会退回黑布鞋。
      Add(buckets, "skin", Cloth(d.footW * 0.82, d.footH * 0.70, d.footLen * 0.76, `bare${side}`),
        { y: -d.footH * 0.55, z: -d.footLen * 0.18 });
      Add(buckets, "shoe", Cloth(d.footW * 1.05, 0.012 * H, d.footLen * 0.96, `sole${side}`),
        { y: -d.footH + 0.006 * H, z: -d.footLen * 0.06 });
      for (const strapSide of [-1, 1]) {
        Add(buckets, "shoe", Cloth(0.012 * H, 0.008 * H, d.footLen * 0.38,
          `strap${side}${strapSide}`), {
          y: -d.footH * 0.12,
          z: -d.footLen * 0.38,
          ry: strapSide * 0.38,
        });
      }
      for (const toe of [-1, 0, 1]) {
        Add(buckets, "shoe", Cloth(d.footW * 0.15, 0.008 * H, d.footLen * 0.15,
          `toeRope${side}${toe}`), {
          x: toe * d.footW * 0.43,
          y: -d.footH * 0.32,
          z: -d.footLen * 0.69,
          ry: -toe * 0.05,
        });
      }
    } else {
      Add(buckets, "shoe", Cloth(d.footW, d.footH, d.footLen * 0.86, `ft${side}`),
        { y: -d.footH * 0.5, z: -d.footLen * 0.2 });
    }
    if (spec.shoe === "boot") {
      Add(buckets, "shoe", Cloth(d.footW * 1.04, 0.05 * H, d.footW * 1.12, `boot${side}`), { y: 0.018 * H });
    } else if (spec.shoe !== "strawSandal") {
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
  } else if (spec.gear === "officer") {
    // 军官武装带：宽皮腰带 + 自右肩斜下到左胯的斜皮带 + 右胯一只枪套。
    // 没有子弹带、没有干粮袋 —— 剪影上一眼能和兵分开。
    Add(buckets, "leather", Cloth(d.waistHalf * 2.08, 0.042 * H, d.waistDepth * 2.08, "offBelt"), { y: -0.012 * H });
    const ax = 0.08 * H, ay = rise - 0.01 * H;
    const bx = -0.07 * H, by = -0.02 * H;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const rz = Math.atan2(dx, -dy);
    Add(buckets, "leather", Cloth(0.03 * H, len, 0.012 * H, "offStrap"),
      { x: (ax + bx) / 2, y: (ay + by) / 2, z: -d.chestDepth * 0.92 - 0.018 * H, rz });
    Add(buckets, "leather", Cloth(0.03 * H, len, 0.012 * H, "offStrapBack"),
      { x: (ax + bx) / 2, y: (ay + by) / 2, z: d.chestDepth * 0.88 + 0.016 * H, rz: -rz });
    Add(buckets, "leather", Cloth(0.05 * H, 0.10 * H, 0.04 * H, "holster"),
      { x: d.waistHalf + 0.02 * H, y: -0.07 * H, z: 0.01 * H, rz: -0.08 });
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
    Add(buckets, "steel", TubeY(0.029, 0.029, 0.092, 8, GUN_TILE.steel), { x, y: -0.052 * H, z, rz: tilt });
    Add(buckets, "wood", TubeY(0.0145, 0.0145, 0.125, 6, GUN_TILE.wood), { x, y: -0.135 * H, z, rz: tilt });
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
  // 与 Blender 主模型同一参考：右侧那把带孔全茎柄大刀。刀根窄、前段放宽，
  // 刃口外鼓、刀背末段斜切；吞口短，柄尾的圆是孔而不是悬空铁环。
  //
  // 局部系：刀尖朝 +Y、刃宽在 X、刀面法向在 Z。逐段往 -X 挪一点再微转，
  // 拼出刀身那道弧 —— 直的一条在 30 m 外和刺刀分不出来。
  Add(local, "blade", GunSteelBox(0.042, 0.170, 0.0058, "bladeA"), { y: 0.222 });
  Add(local, "blade", GunSteelBox(0.054, 0.170, 0.0056, "bladeB"), { x: -0.005, y: 0.386, rz: 0.035 });
  Add(local, "blade", GunSteelBox(0.068, 0.160, 0.0052, "bladeC"), { x: -0.017, y: 0.546, rz: 0.070 });
  // 斜切刀尖：转过来的一小块，出来的是"背斜下来收尖"，不是两边对称的剑尖
  Add(local, "blade", GunSteelBox(0.054, 0.088, 0.0044, "tip"), { x: -0.035, y: 0.655, rz: 0.250 });
  // 短吞口 + 全茎柄。Torus 与宽柄尾叠在一起，远处读作“柄上开孔”，不是外挂环。
  Add(local, "blade", GunSteelBox(0.054, 0.016, 0.018, "guard"), { y: 0.137 });
  Add(local, "blade", GunSteelBox(0.050, 0.255, 0.010, "tang"), { y: 0.010 });
  Add(local, "grip", GunWoodBox(0.039, 0.185, 0.014, "grip"), { y: 0.030 });
  Add(local, "blade", new THREE.TorusGeometry(0.017, 0.005, 6, 12), { y: -0.113 });
  if (quality !== "low") Add(local, "red", Cloth(0.048, 0.015, 0.020, "wrap"), { y: 0.121 });
  // rz≈-2.54：刀尖甩到右下、刀柄露到左肩上方；rx 让刀身贴住后背的弧度
  const sling = { x: -0.026 * H, y: rise - 0.047 * H, z: d.chestDepth + 0.03 * H, rz: -2.54, rx: 0.14 };
  for (const [key, list] of local) Add(buckets, key, MergeGeometries(list), sling);
}

// ---------------------------------------------------------------------------
// 武器几何
// 全部建在「右手握把 = 原点、枪管沿 -Z、膛线轴在 y=+0.035」这个规范坐标系里。
// 换枪只换一个 Group，据枪姿势 / 枪口位置 / 拉栓点全都不用跟着改。
// ---------------------------------------------------------------------------
function BuildWeaponGeometry(id, quality, includeBayonet = false) {
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
    Add(buckets, "wood", GunWoodBox(0.042, 0.128, 0.032, "buttPlate"), { y: 0.012, z: buttZ });
    Add(buckets, "wood", GunWoodBox(0.040, 0.105, 0.160, "comb"), { y: 0.018, z: buttZ - 0.10, rx: 0.05 });
    Add(buckets, "wood", GunWoodBox(0.036, 0.062, 0.130, "wrist"), { y: 0.002, z: 0.075 });
    // 机匣 + 弹仓（中正式是 5 发桥夹压入的固定弹仓，机匣下方一块凸料）
    Add(buckets, "steel", GunSteelBox(0.034, 0.050, 0.190, "receiver"), { y: bore - 0.004, z: -0.055 });
    Add(buckets, "wood", GunWoodBox(0.038, 0.050, 0.090, "magazine"), { y: -0.008, z: -0.045 });
    // 护木 + 枪管 + 准星照门
    const foreLen = Math.abs(muzzleZ) * 0.72;
    Add(buckets, "wood", GunWoodBox(0.036, 0.044, foreLen, "forend"), { y: bore - 0.026, z: -0.155 - foreLen * 0.5 });
    Add(buckets, "steel",
      TubeZ(0.0085, 0.0092, Math.min(barrelLen, Math.abs(muzzleZ) - 0.02), seg, GUN_TILE.steel),
      { y: bore, z: muzzleZ * 0.62 });
    Add(buckets, "steel", GunSteelBox(0.008, 0.020, 0.016, "frontSight"), { y: bore + 0.016, z: muzzleZ + 0.03 });
    Add(buckets, "steel", GunSteelBox(0.026, 0.014, 0.050, "rearSight"), { y: bore + 0.026, z: -0.02 });
    Add(buckets, "steel", GunSteelBox(0.030, 0.026, 0.040, "trigger"), { y: -0.036, z: 0.028 });
    if (quality !== "low") {
      // 拉机柄：拉栓动画里唯一「看得见」的零件，低模也别省
      Add(buckets, "steel", TubeZ(0.006, 0.006, 0.055, 6, GUN_TILE.steel),
        { x: 0.032, y: bore + 0.006, z: 0.01, ry: Math.PI / 2, rz: 0.35 });
      Add(buckets, "steel", TubeZ(0.011, 0.011, 0.012, 6, GUN_TILE.steel), { x: 0.058, y: bore + 0.020, z: 0.01 });
    }

    if (id === "HanYang") {
      // 老套筒：枪管外那层薄套筒，是它区别于中正式的剪影特征
      Add(buckets, "steel", TubeZ(0.0155, 0.0165, Math.abs(muzzleZ) * 0.52, seg, GUN_TILE.steel),
        { y: bore, z: muzzleZ * 0.66 });
    }
    if (id === "Type38") {
      // 三八式的防尘滑盖：机匣上方一块随栓前后滑动的薄板
      Add(buckets, "steel", GunSteelBox(0.030, 0.010, 0.145, "dustCover"), { y: bore + 0.026, z: -0.05 });
    }
    if (id === "Zb26") {
      // 捷克式：20 发弧形弹匣**从上方插入**（做成下插就废了），提把在枪管上方
      for (let i = 0; i < 3; i += 1) {
        Add(buckets, "steel", GunSteelBox(0.030, 0.075, 0.042 - i * 0.004, `mag${i}`),
          { y: bore + 0.06 + i * 0.07, z: -0.09 - i * 0.016, rx: -0.1 * i });
      }
      Add(buckets, "wood", GunWoodBox(0.026, 0.05, 0.16, "carryHandle"), { y: bore + 0.055, z: -0.30 });
      for (const s of [-1, 1]) {
        Add(buckets, "steel", GunSteelBox(0.008, 0.24, 0.008, `bipod${s}`),
          { x: s * 0.06, y: bore - 0.13, z: muzzleZ * 0.78, rz: s * 0.32, rx: -0.12 });
      }
    }
    if (id === "Type11") {
      // 歪把子：左上方一个敞口方斗（装 6 个 5 发桥夹）+ 顶部压弹板
      Add(buckets, "steel", GunSteelBox(0.075, 0.090, 0.115, "hopper"), { x: -0.055, y: bore + 0.05, z: -0.05 });
      Add(buckets, "steel", GunSteelBox(0.065, 0.012, 0.100, "hopperLid"), { x: -0.055, y: bore + 0.10, z: -0.05 });
      for (const s of [-1, 1]) {
        Add(buckets, "steel", GunSteelBox(0.008, 0.20, 0.008, `bipod${s}`),
          { x: s * 0.05, y: bore - 0.11, z: muzzleZ * 0.8, rz: s * 0.3 });
      }
    }
    if (includeBayonet && data.bayonet) {
      const bl = data.bayonetLengthM || 0.395;
      Add(buckets, "steel", GunSteelBox(0.016, 0.024, bl, "bayonet"), { y: bore - 0.006, z: muzzleZ - bl * 0.5 });
    }
  } else if (data.kind === "pistol") {
    // 军用手枪兜底：握把与套筒，弹匣位于握把内。
    result.muzzle.set(0, 0.030, -0.19);
    result.gripFront.set(0, -0.02, -0.06);
    result.bolt.set(0.02, 0.05, -0.01);
    result.twoHanded = false;
    Add(buckets, "wood", GunWoodBox(0.030, 0.115, 0.042, "grip"), { y: -0.05, z: 0.012, rx: -0.12 });
    Add(buckets, "steel", GunSteelBox(0.028, 0.062, 0.145, "frame"), { y: 0.024, z: -0.055 });
    Add(buckets, "steel", TubeZ(0.0065, 0.0065, 0.088, 6, GUN_TILE.steel), { y: 0.032, z: -0.148 });
  } else if (data.kind === "melee") {
    // 大刀：刀身朝 +Y（劈砍时挂点自己会把它抡下来）
    result.muzzle.set(0, 0.42, -0.02);
    result.gripFront.set(0, 0.12, 0);
    result.twoHanded = true;
    Add(buckets, "steel", GunSteelBox(0.052, 0.50, 0.0055, "blade"), { y: 0.40 });
    Add(buckets, "steel", GunSteelBox(0.042, 0.10, 0.0055, "tip"), { y: 0.70, rz: 0.05 });
    Add(buckets, "steel", GunSteelBox(0.025, 0.012, 0.026, "guard"), { y: 0.14 });
    Add(buckets, "accessory", Cloth(0.030, 0.20, 0.026, "handle"), { y: 0.03 });
    Add(buckets, "steel", new THREE.TorusGeometry(0.038, 0.006, 6, 12), { y: -0.10, rx: Math.PI / 2 });
    if (quality !== "low") Add(buckets, "red", Cloth(0.026, 0.05, 0.024, "rag"), { y: -0.075 });
  } else if (data.kind === "throwable") {
    // 巩式木柄手榴弹：弹体 φ58×92、木柄 φ29、全长 220
    result.muzzle.set(0, 0.10, 0);
    result.twoHanded = false;
    Add(buckets, "steel", TubeY(0.029, 0.029, 0.092, 8, GUN_TILE.steel), { y: 0.16 });
    Add(buckets, "wood", TubeY(0.0145, 0.0145, 0.128, 6, GUN_TILE.wood), { y: 0.05 });
  } else {
    // 掷弹筒之类：一根带弧形驻钣的短筒。至少别让人空着手站那儿。
    result.muzzle.set(0, 0.05, -0.30);
    result.gripFront.set(0, 0.02, -0.14);
    Add(buckets, "steel", TubeZ(0.025, 0.025, data.lengthM || 0.41, seg, GUN_TILE.steel), { y: 0.04, z: -0.2 });
    Add(buckets, "wood", GunWoodBox(0.05, 0.05, 0.12, "base"), { y: 0.02, z: 0.06 });
  }
  return Object.assign(result, { geometries: BakeBuckets(buckets) });
}

// ---------------------------------------------------------------------------
// 人物
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 从 Blender 出的 TZM 模型取骨头
//
// 换模的接缝就在这一小段：加载器（Script_MeshLoad）把「两个关节之间的所有网格
// 按材质烘成一块」，也就是说它交出来的每个关节底下正好是 1—4 个 Mesh，
// **和这个文件里 bones.xxx 那张 materialKey -> BufferGeometry 的表是同一个形状**。
// 所以只要把网格身上的材质名认回来，模型就能原样塞进现有的骨架，
// 姿态代码（PoseWeapon / PoseArms / PoseProne / PoseRagdoll）一行都不用改。
//
// 认名字的办法是**哨兵材质**而不是解析 mesh.name：加载器给网格起的名字是
// `模型名_关节名_材质名`，靠 split("_") 认回来，哪天模型名里多一个下划线就静默错桶
// （错桶不报错，只是军装变成皮肤色）。给它一组一次性的空材质、按对象身份反查，
// 这条路不可能认错。
// ---------------------------------------------------------------------------

/**
 * 换模时的合批档。**故意不直接用 Data_Meshes 的 MERGE_PROFILES**：
 * 那张表在 medium 就把 accentA/accentB 并进军装了，而这两个桶正是
 * 青天白日帽徽与步兵红领章 —— 全场唯二的高饱和点，也是「这是哪一方的兵」
 * 在三十米外唯一读得出来的东西。为省 2 个 draw call 把敌我识别标志抹掉，
 * 换的价钱不对（BootTest 实测 high 档全场才 1030 calls，余量 370）。
 *
 * 另一条容易白忙的规矩（Data_Meshes 里也写了）：**只有同一个关节上的两个桶
 * 合并才真省 draw call**。鞋只挂在踝上、踝上也只有鞋，把 shoe 并进 uniform
 * 一个 call 都省不到，只是把草鞋染成了军装色。所以下面这张表只并真的同关节的桶：
 *   accessory / leather 在躯干上和军装同关节（子弹带、皮弹盒）—— 省 1
 *   accentA / accentB 在头上和帽子同关节（帽徽、五角星）—— 省 2，只在 low 才动
 */
const MESH_MERGE = {
  high: null,
  medium: null,
  low: { accessory: "uniform", leather: "uniform", accentA: "uniform", accentB: "uniform" },
};

/** 关节名 -> Actor 里 bones 表的键。模型没有独立的 head/hand 关节，照抄 Actor。 */
const MODEL_BONE_BY_JOINT = {
  hips: "hips", chest: "chest", neck: "head",
  shoulderL: "armL", shoulderR: "armR",
  elbowL: "foreL", elbowR: "foreR",
  thighL: "thighL", thighR: "thighR",
  kneeL: "shinL", kneeR: "shinR",
  ankleL: "footL", ankleR: "footR",
};

/** 一组只用来认桶名的空材质。用完立刻 dispose —— 它们一个像素都不画。 */
function SentinelMaterials(names) {
  const table = {};
  for (const name of names) {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    table[name] = material;
  }
  return table;
}

/**
 * 把一个关节底下的网格收成 materialKey -> BufferGeometry。
 * scale ≠ 1 时就地缩放几何：模型按 MESHES[id].height 建，而 kind 的身高可能不同
 * （敢死队 1.68 / 军官 1.64），关节偏移由 Dimensions() 给，几何按同一个比例缩就对齐。
 */
function TakeJointGeometry(node, scale) {
  const map = new Map();
  if (!node) return map;
  for (const child of node.children) {
    if (!child.isMesh || !child.geometry) continue;
    const key = (child.material && child.material.name) || "uniform";
    const geometry = child.geometry;
    if (scale && Math.abs(scale - 1) > 1e-4) geometry.scale(scale, scale, scale);
    if (map.has(key)) {
      // 加载器按 (关节, 材质) 分桶，同一个关节下不该出现两块同材质的网格。
      // 真出现了就合并 —— 宁可多花一次合并，也不能默默丢掉一块几何。
      map.set(key, MergeGeometries([map.get(key), geometry]));
    } else {
      map.set(key, geometry);
    }
  }
  return map;
}

/** 已经报过一次的模型，别每个 kind 再刷一遍同样的 warn。 */
const FACED_WARNED = new Set();
const NORMAL_WARNED = new Set();

/**
 * 一块几何的翻面体检。要分开量**两件独立的事**，一起量会把好的也改坏：
 *
 *   facing      —— 顶点法线朝外还是朝里：法线与「形心指向该点」的夹角余弦均值。
 *                  凸壳朝外接近 +1，法线整块反了接近 −1，平片接近 0。
 *   consistency —— 三角**绕序**推出来的几何法线，跟顶点法线是不是一致：
 *                  一致接近 +1，不一致接近 −1。
 *
 * 于是绕序自己的朝外程度 = facing × sign(consistency)。四种组合各治各的：
 *   法线反、绕序也反（钢盔）→ 两样都翻；
 *   只有法线反（袖子、裤腿、绑腿、鞋）→ 只翻法线，**绝不能动绕序** ——
 *     动了就把本来朝外的面剔掉，腿会变成一段惨白的空壳（这一版就这么翻过一次车）。
 */
function ShellAudit(geometry) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  if (!pos || !nrm || pos.count === 0) return { facing: 1, consistency: 1 };
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pos.count; i += 1) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
  cx /= pos.count; cy /= pos.count; cz /= pos.count;

  let acc = 0, weight = 0;
  for (let i = 0; i < pos.count; i += 1) {
    const dx = pos.getX(i) - cx, dy = pos.getY(i) - cy, dz = pos.getZ(i) - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    acc += (nrm.getX(i) * dx + nrm.getY(i) * dy + nrm.getZ(i) * dz) / len;
    weight += 1;
  }
  const facing = weight ? acc / weight : 1;

  const index = geometry.index;
  let agree = 0, tris = 0;
  const triCount = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < triCount; t += 1) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const ax = pos.getX(ia), ay = pos.getY(ia), az = pos.getZ(ia);
    const ux = pos.getX(ib) - ax, uy = pos.getY(ib) - ay, uz = pos.getZ(ib) - az;
    const vx = pos.getX(ic) - ax, vy = pos.getY(ic) - ay, vz = pos.getZ(ic) - az;
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const glen = Math.hypot(gx, gy, gz);
    if (glen < 1e-12) continue;
    const nx = (nrm.getX(ia) + nrm.getX(ib) + nrm.getX(ic)) / 3;
    const ny = (nrm.getY(ia) + nrm.getY(ib) + nrm.getY(ic)) / 3;
    const nz = (nrm.getZ(ia) + nrm.getZ(ib) + nrm.getZ(ic)) / 3;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen < 1e-6) continue;
    agree += (gx * nx + gy * ny + gz * nz) / (glen * nlen);
    tris += 1;
  }
  return { facing, consistency: tris ? agree / tris : 1 };
}

/**
 * 把翻了面的几何翻回来。
 *
 * 事故：模型里**大半个人是内外翻的** —— 九〇式钢盔的半球、两条袖子、两条裤腿、
 * 绑腿、鞋、编上靴。钢盔那一块连绕序一起反了，后果不是"看着怪"，是整顶盔
 * 被背面剔除丢掉、日本兵变成一颗光头；其余几块只有法线反，剪影还在，
 * 但受光是反的 —— 迎光面渲成暗的、背光面渲成亮的，整个人读起来是"平的"。
 * 而包围盒、三角数、draw call、材质桶全部正常，_blender/Verify.mjs 也全绿，
 * **只有真截图才看得见**。
 *
 * 阈值取 ±0.25 而不是 0：平片（帽徽、领章）这两个值本来就在 0 附近晃，
 * 只有明确翻了面的壳才动它。
 *
 * **这个阈值也正是它救不回全部的原因**，记在这里当教训：肩膀、手、日方大腿的
 * facing 落在 −0.13 到 −0.25 之间（细长的壳，形心指向与法线本来就不太一致），
 * 全部躲过了这道网 —— 于是那一版的两条胳膊贴近看是能看进袖子内壁的。
 * 靠形心朝向猜是**启发式**，救不了边界情况。根治在模型侧：
 * TzmCore 的 Loft 按 rings 的走向定绕向、封口绕向也修了，Node.Add 再逐**连通块**
 * 用有符号体积（闭合壳为负 = 必定里外翻，这是几何事实不是猜）兜一道。
 * 现在这一段是空操作，留着只当换模的回归网。
 */
function HealInvertedShell(geometry) {
  const { facing, consistency } = ShellAudit(geometry);
  let changed = false;
  if (facing < -0.25) {
    const nrm = geometry.attributes.normal;
    for (let i = 0; i < nrm.count; i += 1) {
      nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    }
    nrm.needsUpdate = true;
    changed = true;
  }
  // 绕序的朝外程度 = 法线朝外程度 × 两者是否一致
  const windingOut = facing * (consistency >= 0 ? 1 : -1);
  if (windingOut < -0.25 && geometry.index) {
    const a = geometry.index.array;
    for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    geometry.index.needsUpdate = true;
    changed = true;
  }
  return changed;
}

/** 对一个材质桶表整体做一次翻面体检。返回翻了几块。 */
function HealBucket(bucket, modelId, where) {
  if (!bucket) return 0;
  let healed = 0;
  for (const [key, geometry] of bucket) {
    if (HealInvertedShell(geometry)) {
      healed += 1;
      const tag = `${modelId}:${where}:${key}`;
      if (!NORMAL_WARNED.has(tag)) {
        NORMAL_WARNED.add(tag);
        console.warn(`[Actor] ${modelId} 的 ${where}/${key} 是内外翻的（受光反了，严重时整块被背面剔除吞掉），已翻回来`);
      }
    }
  }
  return healed;
}

/**
 * 把帽徽 / 领章 / 五角星转到脸那一侧。
 *
 * 这一段的来历：BuildSoldiers.py 里躯干的装具是按 **-Z 是正面**摆的
 * （腰前小弹盒在 z = -waistDepth，跟这个文件里的程序化几何一致），可头上那一套
 * —— 头形、帽子、帽檐、帽徽、钢盔五角星、连同 eyes 挂点 —— 曾经是按 +Z 摆的，
 * 等于**把整个头装反了**：帽檐扣在后脑勺上，正面看过去人是**没有帽徽**的。
 * 而青天白日帽徽与步兵红领章是史实红线里点名的敌我识别标志
 * （docs/Data_HistoryMaterial.md 第三节），是全场唯二的高饱和点。
 *
 * 根治已经在模型侧做了（HeadShape / FieldCap / 帽徽 / 五角星 / eyes 全部翻到 -Z），
 * 所以**这一段现在是空操作**。留着是当换模的回归网：它按包围盒判断再转，
 * 方向对的时候一个字节都不动，方向错的时候顺手救回来并打一条 warn。
 */
function FaceForward(bucket, modelId, nudge = 0) {
  if (!bucket) return;
  let flipped = 0;
  for (const key of ["accentA", "accentB"]) {
    const geometry = bucket.get(key);
    if (!geometry) continue;
    geometry.computeBoundingBox();
    const center = (geometry.boundingBox.min.z + geometry.boundingBox.max.z) * 0.5;
    if (center <= 0) continue;            // 已经在脸那一侧，什么都不用做
    geometry.rotateY(Math.PI);
    // 帽徽是贴在帽墙上的一片薄圆片，建模时留的间隙只有 1 mm，转到正面之后
    // 正好埋进帽子的前脸里（实测转完仍然一点看不见）。往前再让出 6 mm 才露得出来。
    if (nudge) geometry.translate(0, 0, -nudge);
    flipped += 1;
  }
  if (flipped && !FACED_WARNED.has(modelId)) {
    FACED_WARNED.add(modelId);
    console.warn(`[Actor] ${modelId} 的帽徽/领章建在了后脑勺（+Z），已转到正面；`
      + "根治要改 _blender/BuildSoldiers.py 里头部那一套的 z 号");
  }
}

/**
 * 取一个挂点相对某根骨头的局部偏移。
 * 静止姿势里全树的旋转都是 0，所以两个世界坐标直接相减就是局部偏移；
 * 真要是哪天模型里给挂点加了旋转，这里得改成矩阵求逆 —— 留个记号。
 */
function MountOffset(built, mountName, jointName, scale) {
  const mount = built.nodes.get(mountName);
  const joint = built.nodes.get(jointName);
  if (!mount || !joint) return null;
  const a = new THREE.Vector3().setFromMatrixPosition(mount.matrixWorld);
  const b = new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);
  return a.sub(b).multiplyScalar(scale || 1);
}

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
const ACTOR_HITBOX_SCALE = new THREE.Vector3();
const REST_Q = new THREE.Quaternion();
const AIM_Q = new THREE.Quaternion();
const PARENT_Q = new THREE.Quaternion();
const OFF_Q = new THREE.Quaternion();
const POSE_E = new THREE.Euler();
const SOCKET_SOURCE_AXIS = new THREE.Vector3();
const SOCKET_TARGET_WORLD = new THREE.Vector3();
const SOCKET_TARGET_LOCAL = new THREE.Vector3();
const SOCKET_RIGHT_WORLD = new THREE.Vector3();
const SOCKET_ELBOW_WORLD = new THREE.Vector3();
const SOCKET_BODY_LOW_WORLD = new THREE.Vector3();
const SOCKET_BODY_HIGH_WORLD = new THREE.Vector3();
const SOCKET_SOURCE_UP = new THREE.Vector3();
const SOCKET_SOURCE_RIGHT = new THREE.Vector3();
const SOCKET_TARGET_UP = new THREE.Vector3();
const SOCKET_TARGET_RIGHT = new THREE.Vector3();
const SOCKET_FRAME_SOURCE = new THREE.Matrix4();
const SOCKET_FRAME_TARGET = new THREE.Matrix4();
const SOCKET_MOUNT_INVERSE = new THREE.Matrix4();
const SOCKET_AIM_Q = new THREE.Quaternion();

export class Actor {
  /** @param {ActorFactory} factory */
  constructor(factory, kind, options = {}) {
    const spec = KIND_SPEC[kind] || KIND_SPEC.nra;
    const seedText = `${kind}:${options.seed ?? 0}`;
    const rnd = Mulberry32(HashString(seedText));

    this.factory = factory;
    this.bayonetFixed = options.bayonetFixed === true;
    // 分件表的版本号。合批层按它判断要不要重扫这个人的网格 ——
    // 换枪、掏手榴弹、挂日军 GLB 皮肤都会在原地增删网格。
    this.partsRevision = 0;
    this.kind = kind;
    this.spec = spec;
    this.seed = seedText;
    this.quality = factory.quality;
    this.rank = options.rank ?? 0;

    // 同一个 kind 的模型分身（目前只有百姓分男女）。**不是新 kind** ——
    // AI、伤害、误伤判定都只认 kind，分身纯粹是显示层的事。用 seed 抽，
    // 所以同一个人重开一局还是同一个人。
    const variantNames = spec.variants ? Object.keys(spec.variants) : null;
    this.isChild = kind==="civilian" && ["childBoy","childGirl"].includes(options.variant);
    this.variant = this.isChild ? options.variant : variantNames
      ? (variantNames.includes(options.variant) ? options.variant : variantNames[HashString(`${seedText}|variant`) % variantNames.length])
      : null;

    // 身高 ±4% 的个体差走整体缩放，手持武器再乘 1/scale 抵消 —— 枪长是史实数据
    this.sizeScale = (1 + (rnd() - 0.5) * 0.08)
      * (this.isChild ? 1 : this.variant ? spec.variants[this.variant] : 1);
    this.weaponScale = 1 / this.sizeScale;
    this.height = spec.height * this.sizeScale;

    const build = factory.KindGeometry(kind, this.variant);
    const d = build.dims;
    this.dims = d;
    this.height = d.height * this.sizeScale;
    this.bodyRadius = this.isChild ? .24 : .42;
    this.materials = factory.ActorMaterials(kind, rnd, options);
    // "box" = Blender 模型没读到，退回了程序化方块几何。别把这个字段藏起来：
    // 换模最容易的失败方式就是**静默**退回，画面看着还行、其实一个模型都没用上。
    this.meshSource = build.source;
    this.usingModel = build.source === "model";

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
      // 程序化几何左右腿共用一份（thigh / foot），模型是左右各一份（绑腿的结在外侧、
      // 靴筒的褶不对称）。两种都要能接上，所以按 side 先找、找不到再退回共用的那份。
      // 上衣和裤子可以各自着色。只替换大腿的 uniform 桶，绑腿仍沿用装具色，
      // 因而既能读出不同裤色，也不会把小腿所有布料刷成一整块。
      const legMaterials = { ...this.materials, uniform: this.materials.trouser };
      const thigh = AttachBone(this.hips, build.bones[`thigh${tag}`] || build.bones.thigh, legMaterials,
        new THREE.Vector3(side * d.hipHalf, 0, 0));
      const knee = AttachBone(thigh, build.bones[`shin${tag}`], this.materials,
        new THREE.Vector3(0, -d.thighLen, 0));
      const ankle = AttachBone(knee, build.bones[`foot${tag}`] || build.bones.foot, this.materials,
        new THREE.Vector3(0, -d.shinLen, 0));
      this.legs[tag] = { thigh, knee, ankle, side };
    }
    /** 两条腿这一帧的落点计划（先算完两只脚才知道骨盆要压多少，见 Update）。 */
    this._legPlan = { L: { x: 0, y: 0, z: 0, phase: 0, swing: 0 }, R: { x: 0, y: 0, z: 0, phase: 0, swing: 0 } };
    /** 脚贴地的平滑状态：y 是贴地高差，nx/nz 是地面法线在人物朝向里的分量。 */
    this.footIk = { L: { y: 0, nx: 0, nz: 0 }, R: { y: 0, nx: 0, nz: 0 } };

    // 视线挂点。模型里 eyes 是头上的一个空节点，没模型时按头心比例补一个 ——
    // 上层（音源、AI 视线、过场取景）拿到的接口两条路一模一样。
    this.eyes = new THREE.Group();
    this.eyes.name = "eyes";
    const eyeOffset = build.mounts && build.mounts.eyes;
    if (eyeOffset) {
      // 正面是 -Z（全场约定，装具的前后就是照这个摆的）。取 -|z| 而不是直接用 z：
      // 模型侧曾经把整个头部（含 eyes 挂点）按 +Z 摆过一版，等于**把头装反了**。
      // 那一版已经在 BuildSoldiers.py 里改正，这一行如今是空操作 —— 留着是因为
      // 它的代价为零，而换模改错方向的代价是「所有人的视线从后脑勺发出」。
      this.eyes.position.set(eyeOffset.x, eyeOffset.y, -Math.abs(eyeOffset.z));
    } else {
      this.eyes.position.set(0, d.headCenterY - d.neckY + 0.011 * d.height, -d.headD * 0.52);
    }
    this.neck.add(this.eyes);

    // 白毛巾：缠头或缠左上臂，敢死队的识别标志（3 月 28 日夜那批还换穿了日军军服）
    this.towelHead = AttachBone(this.neck, build.bones.towelHead, this.materials, null);
    this.towelArm = AttachBone(this.arms.L.shoulder, build.bones.towelArm, this.materials, null);
    this.SetTowel(!!spec.towelOn);

    // 背后的大刀 / 腰间的手榴弹：挂在 chest 上，跟着上身一起晃
    if (build.bones.officerGear) AttachBone(this.chest, build.bones.officerGear, this.materials, null);
    if (build.bones.hairBack) AttachBone(this.neck, build.bones.hairBack, this.materials, null);
    // 敢死队背刀、手持刀、第一人称和尸体掉落统一解析到二十九军战刀。
    // 程序化背刀只留作模型文件加载失败时的兜底。
    this.dadaoVariant = spec.dadao ? this._WeaponVariant("Dadao") : 0;
    if (build.bones.dadao) this._MountBackDadao(build.bones.dadao, d);
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

    // 通用挂点只描述人体，不知道鞋、线盘或本序章的道具 ID。节点一经创建就复用，
    // 因而过场可以在任意帧安全地拿到同一个 Object3D；挂点会随骨骼自然更新。
    const makeMount = (name, parent, position = null) => {
      const mount = new THREE.Group();
      mount.name = name;
      if (position) mount.position.copy(position);
      parent.add(mount);
      return mount;
    };
    this.mounts = {
      eyes: this.eyes,
      weapon: this.weaponMount,
      weaponMount: this.weaponMount,
      handL: makeMount("handL", this.arms.L.elbow,
        new THREE.Vector3(0, -d.forearmLen * 0.98, 0.01 * d.height)),
      handR: makeMount("handR", this.arms.R.elbow,
        new THREE.Vector3(0, -d.forearmLen * 0.98, 0.01 * d.height)),
      kneeL: makeMount("kneeL", this.legs.L.knee),
      kneeR: makeMount("kneeR", this.legs.R.knee),
      footL: makeMount("footL", this.legs.L.ankle),
      footR: makeMount("footR", this.legs.R.ankle),
      footEdgeL: makeMount("footEdgeL", this.legs.L.ankle,
        new THREE.Vector3(0, -d.footH * 0.5, -d.footLen * 0.5)),
      footEdgeR: makeMount("footEdgeR", this.legs.R.ankle,
        new THREE.Vector3(0, -d.footH * 0.5, -d.footLen * 0.5)),
      // 人物正面是 -Z，因此背部在胸口局部 +Z。这个点仅用于挂背包/靠墙参照。
      back: makeMount("back", this.chest,
        new THREE.Vector3(0, 0.08 * d.height, 0.11 * d.height)),
    };
    // 百姓与模型加载故障不会再退到“脚底上 0.95 m 的大球”。同样按可见人体的
    // 头/躯干/四肢拆成短胶囊；节点来自这一套程序化骨架，所以坐、卧、倒地、IK
    // 都会同步。军人 GLB 有各自更精确的骨骼表，见 GetBoneHitboxes 的优先分支。
    const capsule = (id, a, b, radius, part, priority = 0) => ({
      id, type: "capsule", a, b, radius, part, priority,
      start: new THREE.Vector3(), end: new THREE.Vector3(), worldRadius: 0,
    });
    this.proceduralHitboxes = [
      capsule("head", this.neck, this.eyes, Math.max(d.headW, d.headD) * 0.56, "head", 3),
      capsule("upperTorso", this.chest, this.neck, Math.max(d.chestHalf, d.chestDepth) * 0.80, "torso", 1),
      capsule("lowerTorso", this.hips, this.chest, Math.max(d.waistHalf, d.waistDepth) * 0.88, "torso", 1),
      capsule("upperArmL", this.arms.L.shoulder, this.arms.L.elbow, 0.037 * d.height, "limb"),
      capsule("forearmL", this.arms.L.elbow, this.mounts.handL, 0.032 * d.height, "limb"),
      capsule("upperArmR", this.arms.R.shoulder, this.arms.R.elbow, 0.037 * d.height, "limb"),
      capsule("forearmR", this.arms.R.elbow, this.mounts.handR, 0.032 * d.height, "limb"),
      capsule("thighL", this.legs.L.thigh, this.mounts.kneeL, 0.044 * d.height, "limb"),
      capsule("calfL", this.legs.L.knee, this.mounts.footL, 0.036 * d.height, "limb"),
      capsule("footL", this.mounts.footL, this.mounts.footEdgeL, 0.034 * d.height, "limb"),
      capsule("thighR", this.legs.R.thigh, this.mounts.kneeR, 0.044 * d.height, "limb"),
      capsule("calfR", this.legs.R.knee, this.mounts.footR, 0.036 * d.height, "limb"),
      capsule("footR", this.mounts.footR, this.mounts.footEdgeR, 0.034 * d.height, "limb"),
    ];
    this._mountAliases = Object.freeze({
      eye: "eyes", eyes: "eyes", weapon: "weapon", weaponmount: "weaponMount",
      hand: "handR", handl: "handL", handleft: "handL", lefthand: "handL",
      handr: "handR", handright: "handR", righthand: "handR",
      knee: "kneeR", kneel: "kneeL", kneer: "kneeR",
      foot: "footR", footl: "footL", footr: "footR", feet: "footR",
      footedge: "footEdgeR", footedgel: "footEdgeL", footedger: "footEdgeR", back: "back",
    });

    // 军人可见模型在所有程序化控制节点建完以后接入：旧节点继续算移动、死亡与
    // 编辑器驱动量，但它们的网格会全部隐藏；蒙皮模型、动作、挂点和命中体只走 GLB。
    this.characterRig = this.isChild ? null : factory.CreateCharacterRig(kind, options, spec.height);
    this.usingRiggedCharacter = !!this.characterRig;
    this.modelVariant = this.characterRig ? this.characterRig.variantIndex : null;
    this.modelId = this.characterRig ? this.characterRig.modelId : null;
    this.riggedWeaponMount = null;
    this.riggedBackMount = null;
    if (this.characterRig) this._AdoptRiggedCharacter();

    // --- 动画内部状态（全部确定性）---
    this.time = 0;
    this.gaitPhase = rnd();                  // 起步相位各不相同，一排人才不像广播体操
    // 匍匐自己一条相位。跟 gaitPhase 分开是必须的：共用的话，从跑动中扑倒的
    // 那一帧，腿会从「迈步到一半」直接跳到「收膝到一半」，一记硬切。
    this.pronePhase = rnd();
    this.idlePhase = rnd() * Math.PI * 2;
    this.breathRate = 0.72 + rnd() * 0.22;
    this.swayScale = 0.75 + rnd() * 0.5;
    this.prevFiring = false;
    this.boltTimer = null;
    this.recoil = 0;
    this.recoilAge = 999;
    this.prevFireSequence = 0;
    this.ragdollState = null;
    this.disposed = false;
    this.lifePose = Object.assign(NormalizeLifePose(), NormalizeLifeExtra());
    // 坐姿竖枪 / 起身提枪的混合量：PoseWeapon 算出来，PoseArms 拿它们决定
    // 右手搭在枪身的哪一段、左手上不上枪。
    this.seatWeaponBlend = 0;
    this.carryWeaponBlend = 0;

    this.grenadeGroup = null;           // 投弹时才建，见 EnsureGrenade
    this.grenadeThrown = false;         // 脱手门闩：一次脉冲只飞一颗
    this.tmpTarget = new THREE.Vector3();
    this.gripR = new THREE.Vector3();
    this.gripL = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();

    this.Update(0, { moveSpeed: 0, aim: 0, elapsed: 0 });
  }

  /**
   * 这个人拿哪一种式样。按自己的 seed 稳定抽 —— 同一个人每次 SetWeapon
   * 都得抽到同一把，不然换个姿势刀就变了。用的哈希与军装色变同源。
   */
  _WeaponVariant(weaponId) {
    const list = WEAPON_MESH_VARIANTS[weaponId];
    if (!list || list.length < 2) return 0;
    return HashString(`${this.seed}|${weaponId}`) % list.length;
  }

  _AdoptRiggedCharacter() {
    // 先藏旧人体，再挂新人体；顺序反过来会把刚挂上的 SkinnedMesh 一起藏掉。
    this.body.traverse((object) => { if (object.isMesh) object.visible = false; });
    this.characterRig.Attach(this);
    this.meshSource = `glb:${this.characterRig.modelId}`;
    this.usingModel = true;

    const weaponSocket = this.characterRig.Grip("weaponR");
    if (weaponSocket) {
      this.riggedWeaponMount = new THREE.Group();
      this.riggedWeaponMount.name = "SocketAttachment_WeaponR";
      weaponSocket.add(this.riggedWeaponMount);
      this.mounts.weapon = this.riggedWeaponMount;
      this.mounts.weaponMount = this.riggedWeaponMount;
    }
    const backSocket = this.characterRig.Socket("backBlade");
    if (backSocket) {
      this.riggedBackMount = new THREE.Group();
      this.riggedBackMount.name = "SocketAttachment_BackBlade";
      backSocket.add(this.riggedBackMount);
    }
    if (this.weaponGroup) this._MountRiggedWeapon(this.weaponGroup);
    if (this.backDadao && this.riggedBackMount) {
      if (this.backDadao.parent) this.backDadao.parent.remove(this.backDadao);
      this.riggedBackMount.add(this.backDadao);
      this.backDadao.position.set(0, 0, 0);
      this.backDadao.rotation.set(-0.18, 0.10, -2.35, "YXZ");
      this.backDadao.scale.setScalar(this._SocketScaleCompensation(this.riggedBackMount));
      this.backDadao.traverse((object) => { if (object.isMesh) object.visible = true; });
    }
  }

  /**
   * Weapons are authored in metres and must keep their real dimensions.  Max Biped
   * armatures arrive with a 0.01 object scale, nested below both the actor's height
   * variation and the GLB normalisation scale.  Cancelling only the two outer scales
   * made every socketed rifle one hundredth size; read the actual socket world scale
   * so the same rule also survives differently authored source rigs.
   */
  _SocketScaleCompensation(socket) {
    this.root.updateWorldMatrix(true, true);
    const worldScale = socket.getWorldScale(new THREE.Vector3());
    const inherited = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
    return inherited > 1e-6 ? 1 / inherited : this.weaponScale;
  }

  _MountRiggedWeapon(group) {
    if (!this.riggedWeaponMount || !group) return;
    if (group.parent) group.parent.remove(group);
    this.riggedWeaponMount.add(group);
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(this._SocketScaleCompensation(this.riggedWeaponMount));
    group.traverse((object) => { if (object.isMesh) object.visible = true; });
  }

  /**
   * Align authored weapon geometry to the animated hand sockets.
   *
   * Weapon models use their right-hand grip as local origin, while their front
   * grip/muzzle lies along the barrel axis.  Max Biped hand axes are not the same
   * as that authoring frame, so inheriting the right-hand quaternion alone lays a
   * rifle sideways across the shoulders.  Two points only determine the barrel
   * axis, not the roll around it: the old bridge used setFromUnitVectors and could
   * therefore leave the stock several centimetres above an otherwise correctly
   * aimed palm.  Reconstruct a complete frame after every mixer update: front grip
   * points at the left hand (or a pistol follows the right forearm), while weapon
   * up follows the animated torso's up direction projected off that axis.  Muzzle
   * flashes and ballistics use weaponGroup.matrixWorld, so they receive this exact
   * same transform.
   */
  _UpdateRiggedWeaponMount() {
    if (!this.riggedWeaponMount || !this.weaponGroup || !this.characterRig) return;
    const rightSocket = this.characterRig.Grip("weaponR");
    if (!rightSocket) return;

    let hasTarget = false;
    if (this.weaponTwoHanded && this.weaponGripFront.lengthSq() > 1e-8) {
      const leftSocket = this.characterRig.Grip("weaponL");
      if (leftSocket) {
        leftSocket.getWorldPosition(SOCKET_TARGET_WORLD);
        hasTarget = true;
        SOCKET_SOURCE_AXIS.copy(this.weaponGripFront);
      }
    } else if (this.weaponMuzzle.lengthSq() > 1e-8) {
      const forearm = this.characterRig.bones.forearmR;
      if (forearm) {
        rightSocket.getWorldPosition(SOCKET_RIGHT_WORLD);
        forearm.getWorldPosition(SOCKET_ELBOW_WORLD);
        SOCKET_TARGET_WORLD.copy(SOCKET_RIGHT_WORLD)
          .multiplyScalar(2).sub(SOCKET_ELBOW_WORLD);
        hasTarget = true;
        SOCKET_SOURCE_AXIS.copy(this.weaponMuzzle);
      }
    }
    if (!hasTarget || SOCKET_SOURCE_AXIS.lengthSq() < 1e-8) return;

    this.riggedWeaponMount.updateWorldMatrix(true, false);
    SOCKET_TARGET_LOCAL.copy(SOCKET_TARGET_WORLD);
    this.riggedWeaponMount.worldToLocal(SOCKET_TARGET_LOCAL);
    if (SOCKET_TARGET_LOCAL.lengthSq() < 1e-8) return;
    SOCKET_SOURCE_AXIS.normalize();
    SOCKET_TARGET_LOCAL.normalize();

    // Build a full source/target basis.  Using only the forward pair leaves roll
    // underdetermined; the shortest-arc quaternion was the reason the rifle could
    // pass above an open palm even though the old direction-dot test stayed green.
    SOCKET_SOURCE_UP.set(0, 1, 0)
      .addScaledVector(SOCKET_SOURCE_AXIS, -SOCKET_SOURCE_UP.dot(SOCKET_SOURCE_AXIS));
    if (SOCKET_SOURCE_UP.lengthSq() < 1e-8) SOCKET_SOURCE_UP.set(1, 0, 0);
    SOCKET_SOURCE_UP.normalize();
    SOCKET_SOURCE_RIGHT.crossVectors(SOCKET_SOURCE_UP, SOCKET_SOURCE_AXIS).normalize();

    const bodyLow = this.characterRig.bones.pelvis;
    const bodyHigh = this.characterRig.bones.neck || this.characterRig.bones.chest;
    if (bodyLow && bodyHigh) {
      bodyLow.getWorldPosition(SOCKET_BODY_LOW_WORLD);
      bodyHigh.getWorldPosition(SOCKET_BODY_HIGH_WORLD);
      SOCKET_TARGET_UP.copy(SOCKET_BODY_HIGH_WORLD).sub(SOCKET_BODY_LOW_WORLD);
      SOCKET_MOUNT_INVERSE.copy(this.riggedWeaponMount.matrixWorld).invert();
      SOCKET_TARGET_UP.transformDirection(SOCKET_MOUNT_INVERSE);
    } else {
      SOCKET_TARGET_UP.set(0, 1, 0);
    }
    SOCKET_TARGET_UP.addScaledVector(SOCKET_TARGET_LOCAL,
      -SOCKET_TARGET_UP.dot(SOCKET_TARGET_LOCAL));
    if (SOCKET_TARGET_UP.lengthSq() < 1e-8) {
      SOCKET_TARGET_UP.set(0, 1, 0)
        .addScaledVector(SOCKET_TARGET_LOCAL, -SOCKET_TARGET_LOCAL.y);
    }
    SOCKET_TARGET_UP.normalize();
    SOCKET_TARGET_RIGHT.crossVectors(SOCKET_TARGET_UP, SOCKET_TARGET_LOCAL).normalize();

    SOCKET_FRAME_SOURCE.makeBasis(SOCKET_SOURCE_RIGHT, SOCKET_SOURCE_UP, SOCKET_SOURCE_AXIS);
    SOCKET_FRAME_TARGET.makeBasis(SOCKET_TARGET_RIGHT, SOCKET_TARGET_UP, SOCKET_TARGET_LOCAL);
    SOCKET_AIM_Q.setFromRotationMatrix(
      SOCKET_FRAME_TARGET.multiply(SOCKET_FRAME_SOURCE.invert()));
    this.weaponGroup.position.set(0, 0, 0);
    this.weaponGroup.quaternion.copy(SOCKET_AIM_Q);
    this.weaponGroup.updateMatrix();
  }

  /** Queue the existing combat projectile at the recovered hand-release frame. */
  BeginGrenadeThrow(onRelease) {
    if (!this.characterRig?.CanPlayInfantry() || this.pendingGrenadeThrow || this.ragdollState
        || this.characterRig.forcedClip || this.characterRig.infantry.IsThrowing()) return false;
    this.pendingGrenadeThrow = { onRelease, serial: this.characterRig.infantry.releaseSerial };
    return true;
  }

  _ApplyInfantryProp(group, helper, weight = 1) {
    if (!group || !helper || !group.parent) return;
    helper.updateWorldMatrix(true, false);
    group.parent.updateWorldMatrix(true, false);
    SOCKET_MOUNT_INVERSE.copy(group.parent.matrixWorld).invert().multiply(helper.matrixWorld);
    SOCKET_MOUNT_INVERSE.decompose(SOCKET_TARGET_LOCAL, SOCKET_AIM_Q, SOCKET_TARGET_UP);
    group.position.lerp(SOCKET_TARGET_LOCAL, weight);
    group.quaternion.slerp(SOCKET_AIM_Q, weight);
    // Weapons keep their real dimensions across character height variations.
    group.scale.setScalar(this._SocketScaleCompensation(group.parent));
    group.updateMatrix();
  }

  _UpdateInfantryProps() {
    const rig = this.characterRig;
    if (!rig) return;
    if (rig.infantryPropWeight > 0 && this.weaponGroup) {
      this._ApplyInfantryProp(this.weaponGroup, rig.infantryProps.rifle, rig.infantryPropWeight);
    }
    const throwing = rig.currentId === "GrenadeThrow";
    if (throwing) {
      this.EnsureGrenade();
      if (this.grenadeGroup && this.grenadeGroup.parent !== rig.root) rig.root.add(this.grenadeGroup);
      this._ApplyInfantryProp(this.grenadeGroup, rig.infantryProps.grenade);
    }
    if (this.grenadeGroup) {
      this.grenadeGroup.visible = throwing && rig.currentAction.time < INFANTRY_RELEASE_SECONDS;
    }
    if (this.pendingGrenadeThrow && rig.infantry.releaseSerial > this.pendingGrenadeThrow.serial) {
      const request = this.pendingGrenadeThrow; this.pendingGrenadeThrow = null;
      const from = rig.infantryProps.grenade.getWorldPosition(new THREE.Vector3());
      request.onRelease?.(from);
    }
  }

  PlayImportedAnimation(actionId) {
    if (this.characterRig) this.characterRig.ForceClip(actionId);
    return this;
  }

  ClearImportedAnimation() {
    if (this.characterRig) this.characterRig.ForceClip(null);
    return this;
  }

  GetBoneHitboxes() {
    if (this.characterRig) return this.characterRig.GetHitboxes();
    this.root.updateWorldMatrix(true, true);
    const scale = this.root.getWorldScale(ACTOR_HITBOX_SCALE).y || 1;
    for (const shape of this.proceduralHitboxes || []) {
      shape.worldRadius = shape.radius * scale;
      shape.a.getWorldPosition(shape.start);
      shape.b.getWorldPosition(shape.end);
    }
    return this.proceduralHitboxes || [];
  }

  RaycastHitboxes(origin, direction, maxDistance) {
    if (this.characterRig) return this.characterRig.Raycast(origin, direction, maxDistance);
    let best = null;
    for (const shape of this.GetBoneHitboxes()) {
      const distance = RaycastCapsule(origin, direction, shape.start, shape.end, shape.worldRadius);
      if (distance !== null && distance <= maxDistance && (!best
          || distance < best.t - 1e-6
          || (Math.abs(distance - best.t) <= 1e-6 && shape.priority > best.shape.priority))) {
        best = { t: distance, part: shape.part, shape };
      }
    }
    return best;
  }

  /**
   * 把持刀模型斜挂到背上。武器规范系的刀尖指向 -Z；旋到背部后刀柄露左肩、
   * 刀尖落右腰，和旧背法一致。模型读不到才挂原来的程序化骨块。
   */
  _MountBackDadao(fallback, d) {
    const built = this.factory.WeaponGeometry("Dadao", this.dadaoVariant);
    if (!built?.geometries?.size) {
      this.backDadao = AttachBone(this.chest, fallback, this.materials, null);
      return this.backDadao;
    }
    const group = new THREE.Group();
    group.name = `BackDadao_${this.dadaoVariant}`;
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // root 受人物身高缩放，背刀和手持刀一样抵消它，保持史实 0.900 m。
    group.scale.setScalar(this.weaponScale);
    group.position.set(-0.12 * d.height, d.shoulderY - d.waistY - 0.02 * d.height,
      d.chestDepth + 0.025 * d.height);
    group.rotation.set(-1.25, -Math.PI * 0.5, 0.06, "YXZ");
    this.chest.add(group);
    this.backDadao = group;
    return group;
  }

  /** 换手持模型。几何在工厂里按 id 缓存，这里只换 Group。 */
  SetWeapon(weaponId) {
    if(this.isChild)weaponId=null;
    if (this.weaponGroup) {
      if (this.weaponGroup.parent) this.weaponGroup.parent.remove(this.weaponGroup);
      this.weaponGroup = null;
    }
    this.weaponId = weaponId || null;
    this.weaponData = weaponId ? WEAPONS[weaponId] || null : null;
    this.weaponVariant = weaponId ? this._WeaponVariant(weaponId) : 0;
    this.partsRevision += 1;
    if (!weaponId) { this.weaponTwoHanded = false; return this; }
    const built = this.factory.WeaponGeometry(weaponId, this.weaponVariant, { includeBayonet: this.bayonetFixed });
    const group = new THREE.Group();
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // 抵消 root 上的身高缩放：人可以高矮不同，中正式永远是 1110 mm
    group.scale.setScalar(this.weaponScale);
    if (this.riggedWeaponMount) this._MountRiggedWeapon(group);
    else this.weaponMount.add(group);
    this.weaponGroup = group;
    this.weaponMuzzle.copy(built.muzzle);
    this.weaponGripFront.copy(built.gripFront);
    this.weaponBolt.copy(built.bolt);
    this.weaponTwoHanded = built.twoHanded;
    return this;
  }

  /**
   * 右手里的木柄手榴弹。**投弹时才建、才显示。**
   *
   * 为什么非有不可：投弹动作的读数全在「手里有个东西被抡出去」上。手是空的话，
   * 那条弧线读作「招手」——上一版就是右臂直挺挺举到头顶、手里什么都没有，
   * 而枪还挂在右手原来的位置跟着一起飞。
   *
   * 为什么懒建：一个人两块几何，24 人同屏白摊 48 个 draw call，而一场里真正
   * 投过弹的人是少数。不可见的 Object3D 在 three 里连遍历都跳过，代价是零。
   */
  EnsureGrenade() {
    if (this.grenadeGroup) return this.grenadeGroup;
    const built = this.factory.WeaponGeometry("Grenade");
    if (!built || !built.geometries) return null;
    const group = new THREE.Group();
    for (const [key, geometry] of built.geometries) {
      const mesh = new THREE.Mesh(geometry, this.materials[key] || this.materials.steel);
      mesh.castShadow = true;
      group.add(mesh);
    }
    group.scale.setScalar(this.weaponScale);
    // 挂在右小臂末端的握点上（与模型里的 gripR 同一处），弹头朝手指外
    group.position.set(0, -this.dims.forearmLen * 0.96, 0.010);
    group.rotation.set(-Math.PI * 0.5, 0, 0);
    group.visible = false;
    this.arms.R.elbow.add(group);
    this.grenadeGroup = group;
    this.partsRevision += 1;
    return group;
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
   * 通用人体挂点。返回稳定复用的 Object3D（不是每次 new 的 Vector3），所以调用方可以
   * 直接把线、弹药袋、背包或镜头目标挂在上面。名称大小写不敏感，未知名称返回 null。
   * 可用：eyes、handL/handR、back、kneeL/kneeR、footL/footR、footEdgeL/footEdgeR、weaponMount。
   */
  GetMount(name) {
    if (typeof name !== "string" || !this.mounts) return null;
    const key = name.trim();
    const canonical = this._mountAliases[key.toLowerCase()] || key;
    return this.mounts[canonical] || null;
  }

  /**
   * 倒地。**不做物理** —— 布娃娃在这个规模上既贵又不可复现，而且十有八九摆出一个
   * 考据上不可能的姿势。这里走一段 0.8 秒的确定性姿态过渡：膝先软 → 上身前扑或
   * 后仰 → 最后贴地不再动。
   * @param {THREE.Vector3} dirVec3 世界空间的冲击方向（取子弹的飞行方向）
   */
  Ragdoll(dirVec3) {
    if (this.ragdollState) return this;
    this.pendingGrenadeThrow = null;
    if (this.grenadeGroup) this.grenadeGroup.visible = false;
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
      // 从**此刻的胯高**开始倒，不是从站直的 hipY。跪着/蹲着的人一 dead 会先弹起
      // 站直再倒 —— 殉国那一秒成了「尸体先站起来」（王铭章过场出图抓到的）。
      startY: this.body.position.y + this.hips.position.y,
    };
    return this;
  }

  Update(dt, state = {}) {
    if (this.disposed) return;
    if (typeof state.bayonetFixed === "boolean" && state.bayonetFixed !== this.bayonetFixed) {
      this.bayonetFixed = state.bayonetFixed;
      if (this.weaponData?.bayonet) this.SetWeapon(this.weaponId);
    }
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
    const grounded = s.grounded !== false;
    const verticalVelocity = Clamp(s.verticalVelocity ?? 0, -14, 7);
    const jumpRise = grounded ? 0 : Clamp01(verticalVelocity / 4.65);
    const jumpFall = grounded ? 0 : Clamp01(-verticalVelocity / 8);
    const airborne = grounded ? 0 : 1;
    // 过场用的三个姿态（战斗 AI 不给）：kneel 双膝跪地；reach 空手往前伸够桌面/袋子/扶人；
    // binoculars 双手举到眼前。都是 0—1 的混合量。
    const kneel = Clamp01(s.kneel ?? 0);
    const reach = Clamp01(s.reach ?? 0);
    const binoculars = Clamp01(s.binoculars ?? 0);
    // 基础六项走对外契约，warmHands / watch 走扩展表；合成一个对象往下传，
    // 姿态层不必知道这两张表是分开的（PoseWeapon / PoseArms 的签名一个都没变）。
    const lifePose = Object.assign(NormalizeLifePose(s), NormalizeLifeExtra(s));
    this.lifePose = lifePose;
    const sit = lifePose.sit;
    const warmHands = lifePose.warmHands;
    const watchOut = lifePose.watch;
    // 说话：0—1，由导演层按台词窗口喂进来（Script_Cutscene 自动合成，数据不必写）。
    // 战斗姿态一律吃掉它 —— 中弹的人不做点头手势。
    const talking = Clamp01(s.talking ?? 0);
    const repairShoe = lifePose.repairShoe;
    const cleanRifle = lifePose.cleanRifle;
    const sleep = lifePose.sleep;
    const checkAmmo = lifePose.checkAmmo;
    const prepare = lifePose.prepare;
    // 卧倒/投弹/劈砍时据不了标准枪，把 aim 压下去，不然肩线会拧成麻花
    const aim = Clamp01(s.aim ?? 0) * (1 - prone * 0.45) * (1 - throwing) * (1 - melee);
    const elapsed = s.elapsed ?? (this.time + dt);
    this.time += dt;

    // --- 开火 / 拉栓的边沿检测 --------------------------------------------
    const firing = !!s.firing;
    if (this.characterRig) {
      this.characterRig.Update(dt, s);
      this._UpdateRiggedWeaponMount();
      this._UpdateInfantryProps();
      // 抬担架/跛行时两只手都不在枪上：枪藏起来（视作背在身后），
      // 否则握姿常量会把整支步枪钉在担架杆的位置上。旗一清就还原。
      if (this.weaponGroup) {
        this.weaponGroup.visible = !(s.carryRole || (s.woundedWalk || 0) > 0.5);
      }
    }
    const weapon = this.weaponData;
    // fireSequence 是战斗 AI 的逐发边沿；过场仍只给 firing，保留旧的布尔退路。
    // 这解决了 500 rpm 机枪 firing 恒 true、整段连射只有第一发人物会动的问题。
    const fireSequence = Number.isFinite(s.fireSequence) ? s.fireSequence : null;
    const fired = fireSequence !== null
      ? fireSequence !== this.prevFireSequence
      : firing && !this.prevFiring;
    if (fired) {
      this.recoil = 1;
      this.recoilAge = 0;
      // 拉栓要**看得见**：延后 0.12 秒起手，先让后坐把枪推回来再动右手
      if (weapon && weapon.kind === "boltRifle") this.boltTimer = -0.12;
    }
    if (fireSequence !== null) this.prevFireSequence = fireSequence;
    this.prevFiring = firing;
    const recoverS = (weapon && weapon.recoil && weapon.recoil.recoverS) || 0.35;
    this.recoilAge += dt;
    // 开枪先在峰值停极短的一拍，再加速回肩。原来的线性 1→0 是一根匀速标尺，
    // 既没有出膛的顿挫，也没有枪托重新吃回肩窝的分量。
    const recoilT = Clamp01(this.recoilAge / Math.max(0.05, recoverS));
    this.recoil = fired ? 1 : 1 - SmoothStep(0.10, 1, recoilT);
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
    // 设 moveSpeed=1 对应 4.2 m/s（冲刺）。步频不是随手给的：1.6→4.5 步/秒是人的
    // 真实区间，给低了步幅就会长到腿够不着地（腿长正好等于胯高，任何前后位移都要
    // 靠沉胯换取），IK 一钳位，脚就开始蹭地。
    const speedMs = moveSpeed * 4.2;
    const cadence = 1.6 + moveSpeed * 2.9;
    // 支撑相占比：走路 62%（有双支撑期），跑起来降到 36%（有腾空期）。
    // 这个数直接决定脚在地上待多久，写死一个值必然在另一端出现滑步。
    const stanceEnd = Lerp(0.62, 0.36, moveSpeed);
    const stride = moveSpeed > 0.02 ? Clamp(speedMs / cadence, 0.12, 1.2) : 0;
    // **不滑步的唯一条件**：支撑相里脚相对身体后移的速度 = 身体前进速度。
    // 一个 gaitPhase 周期是两步（时长 2/cadence），支撑相时长 = stanceEnd·2/cadence，
    // 所以这段时间里脚要相对身体走 speedMs × 2·stanceEnd/cadence = 2·stanceEnd·stride。
    // 早先直接拿 stride 当行程，脚就以 19% 的身速往前飘 —— 那就是「滑步」的来源。
    const stanceTravel = stride * 2 * stanceEnd;
    if (moveSpeed > 0.02) this.gaitPhase = (this.gaitPhase + dt * cadence * 0.5) % 1;
    // 匍匐的循环频率：一个周期 = 左右各蹬一次。0.42—0.9 Hz，也就是一次一秒多。
    // 拿步态那套 1.6—4.5 步/秒推匍匐，出来是「在地上游泳」。
    if (prone > 0.5 && moveSpeed > 0.02) {
      this.pronePhase = (this.pronePhase + dt * (0.42 + moveSpeed * 1.9)) % 1;
    }

    // --- 站姿高度：蹲就是把胯压下去，膝盖弯多少交给腿 IK 自己算 ------------
    // dying 也走这一条（不是事后再减 hips.position.y）：这个高度是在腿 IK **之前**
    // 定的，IK 会把踝钉回地面；事后减的话整条腿跟着胯一起下去，人直接陷进土里
    // 半只小腿（旧版濒死下沉就是这么穿模的）。
    // 跪：胯落到「大腿长 + 膝盖离地 0.07H」，脚往后摆到小腿平铺 —— 两段 IK 自己
    // 会把膝盖解到前下方贴地。kneel 与 crouch 同时给时跪说了算。
    const kneelHipY = d.thighLen + 0.07 * H;
    const kneelDrop = kneel * (d.hipY - kneelHipY) / d.hipY;
    // 坐姿/靠墙睡的胯落到长凳高度；其它生活动作只有**真做到位**才算他坐下了
    // （见 ImpliedSeat 的注释：零头一律当站着，否则站客会半蹲着悬在凳面上方）。
    // sit 走 max 的第一项，所以 sit=1 时无论叠了多少 cleanRifle / repairShoe，
    // 坐姿量都是满的 —— 骨盆一定坐实凳面。
    const seated = Math.max(sit, ImpliedSeat(sleep, 1), ImpliedSeat(repairShoe, 0.72),
      ImpliedSeat(checkAmmo, 0.42), ImpliedSeat(cleanRifle, 0.32)) * (1 - prone);
    // 车厢座面比一般场景的地面高。只抬骨盆、不抬 root，腿 IK 仍把鞋底
    // 固定在地板上，避免“把整个角色抬高”后双脚悬空；这个量必须在解腿前
    // 写入 hips，才能让大腿真的从座面上方落下，而非视觉上穿过座板。
    const seatLift = seated > 0.001 ? Clamp(Number(s.seatLift) || 0, 0, 0.28) : 0;
    const seatedDrop = seated * (d.hipY - d.thighLen - 0.045 * H) / d.hipY;
    const stanceDrop = Math.max(crouch * 0.34, kneelDrop, seatedDrop) + prone * 0.60 + dying * 0.30;
    const breath = Math.sin(elapsed * this.breathRate * Math.PI * 2 + this.idlePhase);
    const idleSway = Math.sin(elapsed * 0.41 * Math.PI * 2 + this.idlePhase * 1.7) * this.swayScale;
    // 走路时胯的起伏是**倒立摆**：腿立直在胯正下方时最高，前后叉开（双支撑期）
    // 时最低。高度由「腿长 × 支撑脚离胯的水平距离」反解。
    //
    // 旧写法是 −|sin(gaitPhase·2π)|·0.022H —— 相位反了：|sin| 在腿正好立在胯下
    // （phase 0.25/0.75）时取最大，于是人在腿最该绷直的那一刻蹲得最深，膝盖从
    // 大腿下面戳出来，从侧面看像反关节的鸟腿。出川过场那张「人物反关节走路」
    // 就是这么来的。
    let support = 0;
    for (const tag of ["L", "R"]) {
      const side = tag === "L" ? -1 : 1;
      const ph = (this.gaitPhase + (tag === "R" ? 0.5 : 0)) % 1;
      if (stride > 0 && ph >= stanceEnd) continue;          // 腾空的那只不承重
      const fz = stride > 0
        ? Lerp(-stanceTravel * 0.5, stanceTravel * 0.5, ph / stanceEnd)
        : side * 0.035 * H;
      const fx = crouch * 0.035 * H + Math.abs(strafe) * 0.05 * H;   // 相对胯的横向偏移
      support = Math.max(support, Math.hypot(fz, fx));
    }
    // 站直时 thighLen + shinLen 正好等于 hipY − ankleY，所以 support=0 时这一项是 0，
    // 那点常驻膝弯由下面的 STAND_SETTLE 给。
    const legSpan = d.thighLen + d.shinLen;
    const bob = Math.sqrt(Math.max(0, legSpan * legSpan - support * support)) - (d.hipY - d.ankleY)
      + (moveSpeed > 0.02 ? 0 : breath * 0.004 * H);

    // --- 待机活化的闸门与节拍 ----------------------------------------------
    //
    // 「坐三十秒一动不动」在画面上读作「这是一排模型」，不是「一车累坏了的兵」；
    // 可整车人同时晃又更假 —— 那是广播体操。所以两条规矩：
    //   1) 相位只来自个体 idlePhase，**零随机数**（截图审查要能逐帧复现）；
    //   2) 大动作走 Pulse（停很久、动一下），不走低频正弦（正弦是全程都在飘）。
    //
    // 闸门把一切战斗姿态挡在外面：据枪、投弹、劈砍、中弹、濒死、倒地、匍匐、
    // 跪、伸手、举镜、走动、刚开过枪、腾空的人都不该有闲来无事的重心挪移。
    // 数据侧想彻底关掉就给 `idleLife:false`。
    const lifeCombat = Math.max(aim, throwing, melee, hurt, dying, prone, kneel, reach, binoculars);
    const lifeGate = (s.idleLife === false || s.dead) ? 0
      : Clamp01(1 - lifeCombat * 3) * Clamp01(1 - moveSpeed * 14) * Clamp01(1 - crouch * 1.8)
        * Clamp01(1 - this.recoil * 3) * (grounded ? 1 : 0) * (boltPhase > 0 ? 0 : 1);
    // 个体错开用的 0—1 种子：直接从 idlePhase 折出来，不再多摇一次随机数
    // （多摇一次会把后面所有人的身高/呼吸/摆幅全部改掉，等于推翻既有全部截图）。
    const seed01 = (this.idlePhase / (Math.PI * 2)) % 1;
    const shiftDir = this.idlePhase > Math.PI ? -1 : 1;
    // 每 8—15 秒挪一次重心，一次 2.6 s；周期与相位都按个体错开
    const shiftPulse = Pulse(elapsed, 8 + seed01 * 7, 2.6, seed01 * 0.83) * lifeGate;
    // 常驻微摆：厘米级，远看是「活的」，近看不晃
    const lifeDrift = Wave(elapsed, 0.11, this.idlePhase * 1.3) * lifeGate;

    this.body.position.set(0, d.hipY - airborne * 0.025 * H, 0);
    this.body.rotation.set(jumpRise * -0.07 + jumpFall * 0.09, 0, 0);
    // 蹲下时胯要**往后坐**。只压高度不后坐的话，膝盖为了补上腿长会整个顶到脚尖
    // 前面去 —— 重心落在脚后跟外，真人这么蹲要仰面摔过去，画面上读作「融化的人」。
    // 后坐 6% 身高 + 下面把落脚点往前挪一点，重心才回到两脚之间。
    this.hips.position.set(0, -stanceDrop * d.hipY + bob - STAND_SETTLE * H + seatLift,
      crouch * 0.060 * H);
    // 走起来胯要摆、上身反向拧一点，不然像块板子在平移。
    // 用 cos 不用 sin：相位 0 是左脚**最前**（支撑相起点），骨盆这时也该拧到头，
    // 写成 sin 的话摆胯比迈腿慢四分之一个周期，看着像在扭秧歌。
    const gaitSwing = Math.cos(this.gaitPhase * Math.PI * 2) * moveSpeed;
    this.hips.rotation.set(0, -gaitSwing * 0.14, gaitSwing * 0.05 + idleSway * 0.006);
    // 挪重心：胯横移一点点 + 骨盆侧倾。**必须写在腿 IK 之前** —— 落脚点是在
    // root 空间给的、由 RootToHips 每帧换算，胯先动腿才会自己重新解，脚才留得住；
    // 解完腿再动胯就是整个人连脚一起平移（滑步）。
    if (lifeGate > 0.001) {
      this.hips.position.x += (shiftPulse * 0.012 * shiftDir + lifeDrift * 0.004) * H;
      this.hips.position.z += shiftPulse * 0.005 * H * (sit > 0.4 ? 1 : 0.4);
      this.hips.rotation.z += shiftPulse * 0.038 * shiftDir + lifeDrift * 0.010;
      this.hips.rotation.y += shiftPulse * 0.05 * shiftDir;
    }

    // --- 腿：落脚点 IK -----------------------------------------------------
    // 目标是**踝关节**（两段骨头的末端），所以站立时是 y = ankleY 而不是 0；
    // 写成 0 的话踝会去贴地、整只脚陷进地面里。
    //
    // 两趟：先把两只脚的落点都算出来并各探一次地，再据此压骨盆、最后解腿。
    // 顺序不能反 —— 骨盆要压多少取决于**两只脚里更低的那一只**，
    // 一只一只解的话第一只解完骨盆还没动，它会先被拉直再被压下去，抖一帧。
    const lift = Lerp(0.05, 0.16, moveSpeed) * H;
    const plan = this._legPlan;
    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      const phase = (this.gaitPhase + (tag === "R" ? 0.5 : 0)) % 1;
      let footZ = 0, footY = d.ankleY, swing = 0;
      if (stride > 0) {
        if (phase < stanceEnd) {
          // 支撑相：脚钉在地上，身体从它上面走过去
          footZ = Lerp(-stanceTravel * 0.5, stanceTravel * 0.5, phase / stanceEnd);
        } else {
          const t = (phase - stanceEnd) / (1 - stanceEnd);
          footZ = Lerp(stanceTravel * 0.5, -stanceTravel * 0.5, SmoothStep(0, 1, t));
          swing = Math.sin(Math.PI * t) * lift;
          footY += swing;
        }
      } else {
        footZ = leg.side * 0.035 * H;              // 立正也别两脚并齐
      }
      // 蹲：脚往前挪，配合上面胯的后坐 —— 这两笔合起来才是「蹲」而不是「矮」
      footZ -= crouch * 0.055 * H;
      const spread = d.hipHalf + crouch * 0.035 * H + Math.abs(strafe) * 0.05 * H;
      let footX = leg.side * spread + strafe * 0.12 * H * (phase < stanceEnd ? 1 : 0.4);
      if (kneel > 0.001) {
        // 跪姿：脚落到胯后方一个小腿长（小腿平铺在地上），左右略分开
        footZ = Lerp(footZ, d.shinLen * 0.92, kneel);
        footX = Lerp(footX, leg.side * d.hipHalf * 1.3, kneel);
        footY = Lerp(footY, d.ankleY * 0.8, kneel);
      }
      if (seated > 0.001) {
        // 坐下时膝盖朝车厢前方（-Z），脚仍靠近地板；两段腿 IK 会自动保留接触。
        footZ = Lerp(footZ, -0.17 * H, seated);
        footX = Lerp(footX, leg.side * 0.070 * H, seated);
        footY = Lerp(footY, d.ankleY, seated);
      }
      if (airborne > 0) {
        // 起跳收腿、下落伸腿接地。左右脚前后错开一点，避免空中变成并腿木偶。
        footZ = Lerp(leg.side * 0.12 * H, leg.side * 0.035 * H, jumpFall);
        footX = leg.side * d.hipHalf * 0.92;
        footY += Lerp(0.15, 0.07, jumpFall) * H;
        swing = Math.max(swing, 0.10 * H);
      }
      const p = plan[tag];
      p.x = footX; p.y = footY; p.z = footZ; p.phase = phase; p.swing = swing;
    }

    // --- 脚贴地：把落点抬到**真实地面**上，够不着就压骨盆 -------------------
    //
    // 在这一段之前，腿的 IK 是一套「平地上的原地步态」：脚永远落在 y = ankleY，
    // 也就是假设脚下是一张无限大的水平地板。于是上马道时人是从台阶里穿上去的、
    // 站在瓦砾堆上两只脚都埋在石头里、走斜坡时一只脚悬空一只脚陷进土里。
    //
    // 现在每只脚各朝下探一次（与角色控制器问的是同一条 GroundProbe），
    //   · 地面比脚下这层高 => 那只脚抬上去（上台阶时前脚先落到上一级）
    //   · 地面比脚下这层低 => 那只脚放下去，同时**骨盆按更低的那只脚下沉**，
    //     不压骨盆的话腿会被拉直、脚仍旧够不着（这是脚部 IK 的标准做法）
    //   · 脚掌再按地面法线拧一下，鞋底贴着斜面而不是插进去
    //
    // 只在**看得见的人**身上做（两条射线/人/帧）。趴着、倒地、在半空的人不做：
    // 那三种姿态下脚本来就不该踩在地上。
    let pelvisDrop = 0;
    const probe = this.factory && this.factory.groundProbe;
    // AI 会在中景关掉这条：18 m 外的鞋底已经读不出贴地偏差，
    // 但两条 Rapier 探测 / 人 / 帧仍然是真实 CPU 成本。过场和独立 Actor 没设值时继续开。
    const doFootIk = !!probe && this.root.visible && this.allowFootIk !== false && grounded
      && prone < 0.5 && dying < 0.02 && !this.ragdollState;
    const scale = this.sizeScale || 1;
    if (doFootIk) {
      const yaw = this.root.rotation.y;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const rate = 1 - Math.exp(-dt * FOOT_IK_RATE);
      for (const tag of ["L", "R"]) {
        const p = plan[tag];
        // 落点的世界坐标（root 带 sizeScale 的整体缩放，别忘了乘）
        const wx = this.root.position.x + (p.x * cy + p.z * sy) * scale;
        const wz = this.root.position.z + (-p.x * sy + p.z * cy) * scale;
        const g = probe(wx, wz, this.root.position.y);
        const ik = this.footIk[tag];
        // 地面相对「脚下这一层」高多少（换算回 root 的局部尺度）
        const delta = Clamp((g.y - this.root.position.y) / scale, -FOOT_IK_RANGE, FOOT_IK_RANGE);
        ik.y += (delta - ik.y) * rate;
        // 法线转进人物自己的朝向：nx 决定左右倾（rotation.z），nz 决定前后仰（rotation.x）
        const n = g.normal;
        const nxl = n[0] * cy - n[2] * sy;
        const nzl = n[0] * sy + n[2] * cy;
        ik.nx += (nxl - ik.nx) * rate;
        ik.nz += (nzl - ik.nz) * rate;
        if (ik.y < pelvisDrop) pelvisDrop = ik.y;
      }
      // 骨盆按**更低的那只脚**整量下沉。
      //
      // 「整量」不是保守选择，是这具骨架逼出来的：胯高 0.842·H、踝高 0.089·H，
      // 腿长正好等于两者之差 —— 也就是说**站直时两条腿已经是伸直的**
      // （这条在上面步频那段注释里也提过）。所以脚只要往下挪一厘米，
      // 腿就够不着了，SolveTwoBone 会把距离钳回臂长，脚停在半空。
      // 取一半试过：台阶外那只脚离地 0.225 m（正常 0.089 m），腿绷成一根直棍。
      //
      // **压骨盆不需要给脚补偿。** 落脚点是在 root 空间给的，RootToHips 每帧重新
      // 把它换算进胯的父子链 —— 胯往下走，换算出来的目标自然就变远，腿自己伸长。
      // 早先这里多写了一项 `footY -= pelvisDrop`，等于把胯的位移又加回脚上，
      // 结果是两只脚一起浮起 0.3 m（实测踝关节离地 0.391 m）。
      this.hips.position.y += pelvisDrop;
    } else {
      for (const tag of ["L", "R"]) {
        const ik = this.footIk[tag];
        ik.y *= 0.86; ik.nx *= 0.86; ik.nz *= 0.86;   // 关掉时缓缓归零，别跳一下
      }
    }

    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      const p = plan[tag];
      const ik = this.footIk[tag];
      // 腾空的那只脚不该被地面拽着走，所以按摆动相的高度把贴地量淡出
      const ground = doFootIk ? ik.y * (1 - Clamp01(p.swing / Math.max(1e-4, lift))) : 0;
      const footY = p.y + ground;
      this.tmpTarget.set(p.x, footY, p.z);
      this.RootToHips(this.tmpTarget);
      // 膝盖外张：蹲下去两条大腿会顶到胸前的枪与手，往外让开一点才有蹲的剪影
      SolveTwoBone(leg.thigh, leg.knee, this.tmpTarget, d.thighLen, d.shinLen,
        leg.side * (0.10 + crouch * 0.20));
      // 脚踝：抵消大腿+小腿的累计俯仰让鞋底贴地，腾空时勾一下脚尖
      const pitch = ExtractPitch(leg.thigh.quaternion) + ExtractPitch(leg.knee.quaternion);
      // 这里原本有一项 `- crouch * 0.25`（蹲下压脚尖 14°）。压是压对了，
      // 但没有配套抬升——鞋料总高才 9.4 cm，压完鞋底就有 4 cm 在地面以下。
      // IK 本身已经把踝关节钉在了正确高度，脚尖不需要再额外拧。
      //
      // 末两项是这一轮加的**鞋底贴斜面**：地面往哪边倒，脚掌就往哪边拧多少。
      // 幅度按摆动相淡出（脚在半空时不该跟着地面转），并钳在 22° 以内 ——
      // 再大就不是"踩在坡上"而是"脚踝扭断了"。
      const tilt = doFootIk ? (1 - Clamp01(p.swing / Math.max(1e-4, lift))) : 0;
      // 跪姿脚尖绷直朝后下（脚背贴地），不是平放
      leg.ankle.rotation.set(
        -pitch + (p.y - d.ankleY) * 1.6 + Clamp(ik.nz * tilt, -FOOT_IK_TILT, FOOT_IK_TILT) - kneel * 1.25,
        0,
        Clamp(-ik.nx * tilt, -FOOT_IK_TILT, FOOT_IK_TILT));
    }

    if (seated > 0.001) this.PoseSeatedLegs(seated);

    // --- 上身：看的方向按 35% / 65% 分给胸和头 ------------------------------
    // 符号约定（三个都栽过跟头，写下来）：人物正面朝 -Z，于是
    //   rotation.x 为**正** = 上身后仰 / 抬头 / 垂下的胳膊腿往**前**摆。
    // 所以「前倾」必须是负的 x，而腿的 IK 解出来的正角度恰好是向前迈 —— 两者不矛盾。
    const lookYaw = Clamp(s.lookYaw ?? 0, -1.4, 1.4);
    const lookPitch = Clamp(s.lookPitch ?? 0, -1.0, 0.9);
    // 蹲姿的前倾要够：胯后坐了，上身不压过来重心就在身后。0.30 → 0.44
    const leanFwd = 0.06 + moveSpeed * 0.26 + crouch * 0.44 + aim * 0.08
      + kneel * 0.10 + reach * 0.22 + jumpRise * 0.08 - jumpFall * 0.05;
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

    // 车厢动作的剪影层：先改胸/头，再交给 PoseWeapon / PoseArms 处理接触点。
    // sleep 是靠墙打盹（头向下），prepare 是炮后停手抬头，后者有意覆盖前者的低头量。
    const actionLean = repairShoe * 0.16 + cleanRifle * 0.08 + checkAmmo * 0.13;
    this.chest.rotation.x -= actionLean;
    this.chest.rotation.z += sleep * 0.055;
    this.neck.rotation.x += -sleep * 0.82 - repairShoe * 0.24 - checkAmmo * 0.30
      - cleanRifle * 0.10 + prepare * 0.46;
    this.neck.rotation.y += sleep * 0.10 - repairShoe * 0.07 + prepare * 0.06;
    // 搓手是低头往手上呵气的姿势；看窗外是抬一点头（手的部分在 PoseArms）
    this.neck.rotation.x += -warmHands * 0.20 + watchOut * 0.05;
    this.chest.rotation.x -= warmHands * 0.10;
    this.hips.position.z += seated * 0.060 * H;
    this.body.rotation.x += sleep * 0.32;

    // --- 待机活化：各生活动作自己的慢周期 ----------------------------------
    // 全是 elapsed + idlePhase 的确定性函数，同一秒重放必然同一帧。
    if (lifeGate > 0.001) {
      // 正在听人说话（lookYaw 被导演层拉住）或自己在说话时，闲逛式的头部动作要让位。
      const attentive = Clamp01(Math.abs(lookYaw) * 1.2 + talking);
      // 搓手：一来一回，肩胸跟着轻轻一送一收
      const rub = Wave(elapsed, 1.15, this.idlePhase * 1.7);
      this.chest.rotation.x -= warmHands * rub * 0.028 * lifeGate;
      this.neck.rotation.x -= warmHands * rub * 0.045 * lifeGate;
      // 看窗外：头慢慢转过去、停几秒、再转回来。11—17 s 一次，不是节拍器。
      const gaze = Pulse(elapsed, 11 + seed01 * 6, 5.4, seed01 * 0.41 + 0.2) * (1 - attentive);
      this.neck.rotation.y += watchOut * gaze * 0.58 * shiftDir * lifeGate;
      this.neck.rotation.x += watchOut * gaze * 0.12 * lifeGate;
      this.chest.rotation.y += watchOut * gaze * 0.13 * shiftDir * lifeGate;
      // 查弹药：翻看的节奏 —— 举到眼前看一眼再放回腰间
      const inspect = Pulse(elapsed, 6.5 + seed01 * 3, 2.4, seed01 * 0.67);
      this.neck.rotation.x += checkAmmo * inspect * 0.24 * lifeGate;
      // 补鞋：一下一下地扎线，1.5—2.0 s 一针（上身跟着一顿）
      const stitch = Pulse(elapsed, 1.55 + seed01 * 0.45, 0.55, seed01 * 0.29);
      this.chest.rotation.x -= repairShoe * stitch * 0.055 * lifeGate;
      this.neck.rotation.x -= repairShoe * stitch * 0.05 * lifeGate;
      // 擦枪：手上的往复在 PoseArms，这里只给上身一点点跟随
      const wipeLean = Wave(elapsed, 0.63, this.idlePhase * 2.2);
      this.chest.rotation.y += cleanRifle * wipeLean * 0.035 * lifeGate;
      // 普通坐姿/站姿：挪重心那一下顺带转个头、耸一下肩线。
      // 正在看着说话的人（lookYaw 被导演层拉住）或者自己正在说话时不许乱瞟 ——
      // 一个人盯着班长听训的时候不会忽然扭头看窗外，那读作「他没在听」。
      this.neck.rotation.y += shiftPulse * 0.26 * shiftDir * (1 - attentive);
      this.neck.rotation.x += shiftPulse * 0.05;
      this.chest.rotation.y += shiftPulse * 0.11 * shiftDir * (1 - attentive);
      this.chest.rotation.z += lifeDrift * 0.012;
      this.neck.rotation.z -= lifeDrift * 0.014;
    }

    // --- 覆盖姿势：卧倒 ------------------------------------------------------
    // **必须排在持枪与手臂之前。** PoseWeapon 是靠「减掉上身累积的旋转」把枪口
    // 指到玩家真正看的方向的，而卧倒改的正是 body 的俯仰。先摆枪再翻身体，那份
    // 补偿就是按站姿算的 —— 上身转平了、枪跟着转，枪口连刺刀一起扎进土里。
    // （旧版卧倒截图里那把插在地上的中正式就是这么来的。）
    if (prone > 0.001) this.PoseProne(prone, moveSpeed);

    // PoseWeapon 必须在 chest.rotation 写完之后调用：挂点是 chest 的子节点，
    // 它要减掉上身自己的俯仰偏航才能让枪口指到玩家真正看的方向。
    // 卧倒的人**总是在枪后面**：不瞄准也是枪托抵肩、枪身贴地朝前，所以这里给
    // aim 垫一个底。垫的只是枪与手，上身/头由 PoseProne 定死，不受影响。
    // 白刃突刺也要把枪端平（低姿持枪是枪口朝下 17°，那个角度捅不到人）
    const bayonet = melee > 0.001 && this.weaponData && this.weaponData.kind !== "melee"
      && this.weaponData.kind !== "throwable" ? melee : 0;
    if (bayonet > 0.001) {
      // 突刺是**腰腿的活**：先拧腰蓄力，再把上身送出去。
      // **这一段必须排在 PoseWeapon 前面**：持枪挂点是靠减掉上身累积旋转来指向的，
      // 摆完枪再拧腰，那份补偿就少算了这一拧 —— 枪跟着腰甩到侧面去，人朝前捅、
      // 刺刀指着左边（这一版调试图上就是这么歪的）。
      const coil = SmoothStep(0, 0.30, bayonet) * (1 - SmoothStep(0.30, 0.62, bayonet));
      const lunge = SmoothStep(0.30, 0.62, bayonet);
      this.chest.rotation.x -= lunge * 0.14;
      this.chest.rotation.y += coil * 0.26 - lunge * 0.16;
      this.neck.rotation.y -= coil * 0.16 - lunge * 0.10;
    }

    const weaponAim = Math.max(aim, prone * 0.9, bayonet * 0.85);
    this.PoseWeapon(weaponAim, moveSpeed, lookPitch, lookYaw, boltPhase, throwing, melee,
      breath, idleSway, prone, bayonet, lifePose);
    this.PoseArms(weaponAim, moveSpeed, boltPhase, throwing, melee, hurt, prone, reach, binoculars,
      lifePose, elapsed);


    // --- 说话 ---------------------------------------------------------------
    // **排在 PoseWeapon / PoseArms 之后**：手已经 IK 到枪上的握点（chest 空间），
    // 这时再动胸和头，枪、手、上身是整体一起动的，接触点一个都不会脱开。
    // 反过来先动胸再摆枪，那点起伏就会被 PoseWeapon 的「减掉上身旋转」抵消掉，
    // 说话的人身上一动不动 —— 这正是这次要修的毛病。
    const talk = talking * Clamp01(1 - Math.max(aim, throwing, melee, prone, hurt, dying) * 2.5)
      * (s.dead ? 0 : 1);
    if (talk > 0.002) {
      // 导演在数据里显式给了头的朝向时，说话只留「活着的抖动」，不改朝向 ——
      // 最后一电/王铭章那几场的镜头是按「不给脸」算过角度的，引擎不许把脸转过去。
      const headAuthority = (!s.lookAuto && Number.isFinite(s.lookYaw)
        && Math.abs(s.lookYaw) > 1e-3) ? 0.3 : 1;
      this.PoseTalk(talk, elapsed, lifePose, moveSpeed, headAuthority, weaponAim, boltPhase);
    }

    // 手里的手榴弹：抡过 0.66 就脱手。**要一个门闩**，不能只比大小 ——
    // throwing 是个 0→1→0 的脉冲，光比数值的话，回收段再次路过 0.66 以下，
    // 弹会凭空回到手里再飞一次。门闩到脉冲归零才复位。
    if (!this.characterRig) {
      if (throwing > 0.001) this.EnsureGrenade();
      if (throwing < 0.02) this.grenadeThrown = false;
      else if (throwing >= 0.70) this.grenadeThrown = true;
      if (this.grenadeGroup) this.grenadeGroup.visible = throwing > 0.02 && !this.grenadeThrown;
    }



    // --- 覆盖姿势：中弹踉跄 / 濒死下沉 --------------------------------------
    if (hurt > 0.001) {
      // 中弹踉跄：上身被顶得后仰、头往后甩、脚下往后错半步
      const shake = Math.sin(elapsed * 26) * hurt;
      this.chest.rotation.x += 0.34 * hurt;
      this.chest.rotation.z += 0.16 * shake;
      this.neck.rotation.x += 0.20 * hurt;
      this.hips.position.z += 0.03 * H * hurt;
    }
    if (dying > 0.001) {
      // 濒死是往下瘫、往前塌，和中弹后仰正好相反。**高度不在这里改** ——
      // 它走上面的 stanceDrop，那一步在腿 IK 之前，脚才留得住在地面上。
      this.chest.rotation.x -= dying * 0.45;
      this.neck.rotation.x -= dying * 0.30;          // 头也垂下去
    }
    // 正常帧的可见骨架由导入动作完整驱动；程序化 body 只在 Ragdoll 的提前返回
    // 分支里保留，用作整个人绕胯倒地的根运动，避免与蒙皮动作叠两遍。
    if (this.characterRig) {
      this.body.position.set(0, d.hipY, 0);
      this.body.rotation.set(0, 0, 0);
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
   * 长凳坐姿不是把站姿的落脚 IK 硬压矮：那会让大腿为了够到地板反向折回座面，
   * 在侧视镜头里穿过小腿和木凳。这里直接给出“膝朝前、胫垂下”的两段折角；
   * 角度按车厢 0.50 m 座高解出，鞋底仍恰好落在地板上。
   */
  PoseSeatedLegs(amount) {
    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      BlendEuler(leg.thigh, 1.27, 0, 0, amount, "XYZ");
      BlendEuler(leg.knee, -1.27, 0, 0, amount, "XYZ");
      BlendEuler(leg.ankle, 0, 0, 0, amount, "XYZ");
    }
  }

  /**
   * 持枪挂点的位姿：低姿持枪 ↔ 枪托贴肩之间插值，再叠上后坐、拉栓的横滚、
   * 投弹时的收枪。这些常量是按 1.66 m 定的，换身高按 k 缩放。
   */
  PoseWeapon(aim, moveSpeed, lookPitch, lookYaw, boltPhase, throwing, melee, breath, idleSway,
    prone = 0, bayonet = 0, lifePose = null) {
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
    //
    // 【2026-08-25 把握把整体往前下方推了一档】旧值把右手握点放在 chest 局部
    // (0.115, 0.075, −0.135)，离右肩只有 0.31 m，而一条胳膊有 0.53 m。两段 IK 遇到
    // 「目标离肩太近」只能把肘往外甩，而手臂的 roll 是按握枪定的（肘尖朝身后），
    // 于是肘直接甩进背心、小臂横穿胸腔 —— 序章 t=45 那张站姿群众「两条小臂不见了」
    // 就是这么来的，不是模型破了。把握点推到 0.40 m 外，肘角回到 80° 左右，
    // 小臂从胸前**外面**过去。枪身也顺带离开躯干 10 cm，不再有「步枪横穿手臂」的帧。
    // 【2026-08-25 第二次，往回收 3 cm】−0.245 把肘角开到 82°，小臂确实从胸前外面
    // 过去了，但代价是整把枪连着两只手一起端到身前 25 cm —— 月台那张（t=104）读作
    // 「端着长矛探雷」。把 z 收到 −0.212、y 抬到 0.040：肩到握把 0.368 m，肘角 88°，
    // 离出问题的那一档（0.299 m / 68°）还差一大截，可枪身整体回到身侧。
    // 再往回收就要重新犯小臂穿胸的毛病了，**这两个数是有下界的，别继续往回调**。
    const running = moveSpeed > 0.55;
    const restPx = (running ? 0.150 : 0.132) * k;
    const restPy = (running ? -0.010 : 0.040) * k;
    const restPz = (running ? -0.185 : -0.212) * k;
    const restRx = running ? -0.55 : -0.30;
    const restRy = running ? 0.50 : 0.34;
    const restRz = running ? 0.30 : 0.16;
    const t = SmoothStep(0, 1, aim);

    // 据枪朝向：先算出「枪身在 root 空间该指哪」，再**整体除掉**上身累积的旋转。
    // 这里必须用四元数，不能写成 aimRx = lookPitch - chest.rotation.x：
    // 欧拉角不能逐轴相减，单看俯仰是准的，可一旦偏航也不为零，两轴耦合最大能偏 8°
    // —— 那正是「准心套住人却打不中」的那类 bug，而且在静止截图上完全看不出来。
    // **朝向必须排在位置前面**：位置是顺着枪自己的轴推出去的，见下。
    POSE_E.set(lookPitch, lookYaw, 0, "YXZ");
    AIM_Q.setFromEuler(POSE_E);
    PARENT_Q.copy(this.body.quaternion).multiply(this.hips.quaternion).multiply(this.chest.quaternion).invert();
    AIM_Q.premultiply(PARENT_Q);
    POSE_E.set(restRx, restRy, restRz, "XYZ");
    REST_Q.setFromEuler(POSE_E);
    mount.quaternion.slerpQuaternions(REST_Q, AIM_Q, t);

    // 据枪位置 = **右肩窝 + 沿枪轴往前 25 cm**（挂点原点就是右手握把）。
    // y=0.325 是按肩高 0.22H 减出来的 —— 早先按 0.29 摆，枪口比眼睛低了 40 cm。
    //
    // 为什么不写死一份 (x, y, z)：挂点在 chest 空间里，而 chest 的 -Z 是「胸口朝外」。
    // 人站着时那是正前方，**趴下之后它指的是地面**。写死的 -0.300k 到了卧姿就是
    // 把握把塞到胸口正下方 30 cm —— 枪进土里，而两只手为了够那个点会缩成两只
    // 鸡翅膀（上一版卧倒俯视图上那对翅膀就是这么来的）。顺着枪轴推就与姿态无关：
    // 站、蹲、卧共用同一组数，枪托永远在肩窝，握把永远在枪托前面 25 cm。
    POSE_A.set(0, 0, -0.250 * k).applyQuaternion(mount.quaternion);
    mount.position.set(
      Lerp(restPx, 0.085 * k + POSE_A.x, t),
      Lerp(restPy, 0.325 * k + POSE_A.y, t) + breath * 0.004 * k * (1 - aim * 0.6),
      Lerp(restPz, -0.050 * k + POSE_A.z, t));

    // 白刃突刺：枪身**顺着自己的轴**捅出去 42 cm，先收 14 cm 蓄力。
    // 两只手 IK 在枪上，所以这一下推出去手臂自己就伸了 —— 这是「摆枪、手跟过去」
    // 这条原则最值的一次：突刺整套动作只有这三行。
    if (bayonet > 0.001) {
      const coil = SmoothStep(0, 0.30, bayonet) * (1 - SmoothStep(0.30, 0.62, bayonet));
      const lunge = SmoothStep(0.30, 0.62, bayonet);
      POSE_A.set(0, 0, -(lunge * 0.42 - coil * 0.14) * k).applyQuaternion(mount.quaternion);
      mount.position.add(POSE_A);
      mount.position.x -= lunge * 0.03 * k;        // 捅出去时枪身往身体中线靠
    }

    // 投弹：枪**换到左手**、垂在身体左侧，枪口朝上斜着背在身前。
    // 上一版只给挂点加了 6 cm 偏移，于是右手抡上去了、枪还留在右手原来的位置，
    // 两样各飞各的 —— 那不是投弹，是甩枪。真人是左手攥着枪、右手抡弹。
    if (throwing > 0.001 && kind !== "throwable") {
      const s = SmoothStep(0, 0.30, throwing);
      POSE_E.set(-1.05, 0.30, -0.45, "XYZ");
      OFF_Q.setFromEuler(POSE_E);
      mount.quaternion.slerp(OFF_Q, s);
      POSE_A.set(-0.150 * k, 0.075 * k, -0.030 * k);
      mount.position.lerp(POSE_A, s);
    }

    // 匍匐：**先把枪往前送，身体再跟上去**。沿体轴（chest 空间的 +Y）推 5 cm，
    // 手是 IK 到枪上的，所以两只手自己会跟着一送一收 —— 这就是「爬」的读数来源。
    if (prone > 0.001) {
      const push = Math.sin(this.pronePhase * Math.PI * 2) * Clamp01(moveSpeed / 0.22) * prone;
      mount.position.y += push * 0.05 * k;
      mount.position.x += push * 0.012 * k;
    }

    // 附加动作都绕枪自己的轴，所以右乘：后坐抬头、拉栓横滚、投弹让位
    const kick = (this.weaponData && this.weaponData.recoil ? this.weaponData.recoil.kick : 0.05);
    mount.position.z += this.recoil * kick;             // 枪往肩窝里退
    let extraY = idleSway * 0.006 * (1 - aim);
    let extraZ = Lerp(restRz, 0.02, t);
    if (boltPhase > 0) {
      // 拉栓时把枪往内一转露出抛壳口，右手才有地方去拉 —— 真人就是这么打的
      const cant = Math.sin(boltPhase * Math.PI);
      extraZ += cant * 0.30;
      extraY += cant * 0.14;
      mount.position.y -= cant * 0.02 * k;
    }
    POSE_E.set(this.recoil * 0.16 + idleSway * 0.004, extraY, extraZ, "XYZ");
    OFF_Q.setFromEuler(POSE_E);
    mount.quaternion.multiply(OFF_Q);

    // 擦枪。**先分清「真在擦」还是「枪抱在怀里」** ——
    //
    // 数据里 cleanRifle 有两种写法：rifleman 写 1（他就是那个在擦枪的人），
    // 群演写 0.34（意思只是「这人手上有活儿」，与 checkAmmo:0.18 同一个量级）。
    // 旧式对两者一视同仁，按 clean 线性把枪往膝前那条横线上拉。0.34 的结果是
    // 一米二五的步枪斜横出去、枪口正好戳在邻座身上（序章 t=20 长凳那一排）。
    //
    // 现在零头走「斜抱怀里」：枪托在右胯、枪身斜挎到左肩前、枪口朝前上方，
    // 剪影是一条贴着身体的斜线，既不占过道也不指人；过了半程才逐渐倒成真正的
    // 横放擦拭。两个目标之间是同一条插值链，中间不会经过第三种姿势。
    const clean = lifePose ? lifePose.cleanRifle : 0;
    const wipe = SmoothStep(0.45, 0.95, clean);          // 真的动手擦
    if (clean > 0.001 && !throwing && !melee && !prone) {
      const cradle = Math.max(SmoothStep(0, 0.45, clean), wipe);   // 抱枪到位程度
      // 抱：(1.00, 0.32, 0.36) 的枪身朝左前上方；擦：(0.15,−1.15,0.06) 绕 Y 约 66°
      // 横跨膝前，擦布/机匣的接触线才读得出来。
      POSE_E.set(Lerp(1.00, 0.15, wipe), Lerp(0.32, -1.15, wipe), Lerp(0.36, 0.06, wipe), "XYZ");
      OFF_Q.setFromEuler(POSE_E);
      mount.quaternion.slerp(OFF_Q, cradle);
      mount.position.x = Lerp(mount.position.x, Lerp(0.115, 0.050, wipe) * k, cradle);
      mount.position.y = Lerp(mount.position.y, Lerp(-0.035, -0.030, wipe) * k, cradle);
      mount.position.z = Lerp(mount.position.z, Lerp(-0.135, -0.115, wipe) * k, cradle);
      // 擦布碰到机匣时有短促卡顿，不另造时间轴；确定性相位来自个体 idlePhase。
      // 只在真擦的时候抖 —— 抱着枪的人手上没有往复。
      mount.rotation.z += Math.sin(this.time * 3.8 + this.idlePhase) * 0.045 * wipe;
    }

    // --- 不打仗的时候枪放哪：坐着拄在脚边 ↔ 起身提在身侧，**一条连续的路** ---
    //
    // 坐姿（sit）：枪托拄在两脚之间的地板上、枪口朝上往身后倒 16°、枪身斜靠肩窝。
    //   旧版坐姿沿用低姿持枪那一组数，于是一米二五的步枪横在膝盖前面，一头悬空、
    //   枪身从手心里穿出去（序章车厢里每一张座位镜都能看到）。真人坐长凳就是把枪
    //   拄在脚边 —— 这个剪影还顺手解决了「枪占着过道」的问题。
    //   高度是**解出来的不是估出来的**：枪托底板离握把 0.271 m（buttZ 0.255 + 底板
    //   半厚 0.016），所以握把必须落在「地板 + 0.271 m」。地板在 chest 局部的高度
    //   由这一帧真实的 body/hips/chest 位移反推 —— 脚下的地面被 foot IK 抬高或压低时
    //   枪托跟着走，不会插进地板也不会浮在半空。
    //
    // 起身（prepare）：枪提到右胯外侧、枪口朝前下 40°，也就是行进间的「提枪」。
    //   为什么不是枪口垂直朝下：手垂在胯外侧时离地只有 0.80 m 上下，而握把到枪口
    //   有 0.9 m —— 垂直朝下的枪是拖在地上的。40° 让枪口停在离地 0.19—0.22 m
    //   （实测：车厢地板上 0.22 / 月台上 0.19），这才是真提得起来的角度。
    //
    // **这两个姿势必须互相插值，不能各自往低姿持枪那组数上叠。**
    // 旧式是 seatWeapon 随 sit 从 1 掉到 0、枪就一路滑回低姿持枪（枪身绕 Y 转了
    // 0.34 rad 指向右前方），于是 90.8—92.3 s 整车人起立的那一秒半里，每个人胸前
    // 都横飘着一根穿过邻座的枪管。现在起点和终点的偏航都近乎 0，中途枪身只在
    // **自己的矢状面**里从朝上扫到朝下，绝不会横过去指人。
    //
    // 顺带记一笔：出川那把 ZB26 的 id 曾拼成 "ZB26"（WEAPONS 表里是 "Zb26"），查不到
    // → weaponData 为 null → kind 落到默认 boltRifle，枪的外形退化成普通步枪（上插
    // 弹匣、提把、两脚架全没建出来）。Data_CutsceneChuchuan 已改成 "Zb26"，机枪手
    // 现在按 lmg 走这条坐姿/提枪分支。0.271 这个数对它照样成立：BuildWeapon 里
    // boltRifle 和 lmg 共用 buttZ 0.255 + 底板半厚 0.016，枪长不同只改枪口那头。
    const seatRest = lifePose ? lifePose.sit : 0;
    const ready = lifePose ? lifePose.prepare : 0;
    const holdOk = (kind === "boltRifle" || kind === "lmg")
      ? (1 - SmoothStep(0, 0.35, aim)) * (1 - Clamp01(throwing * 3)) * (1 - Clamp01(melee * 3))
        * (1 - Clamp01(prone * 3)) * (1 - Clamp01(boltPhase * 4)) * (1 - wipe)
      : 0;
    const seatWeapon = holdOk * Clamp01((seatRest - 0.35) / 0.25);
    // 站着的人**只要导演给了生活动作，就不是在战斗待命** —— 补鞋、打盹、搓手、
    // 看窗外、准备下车，这些人手里的枪都该垂在身侧，而不是端在胸前。车厢过道里
    // 端着的枪一定会横过邻座（t=20 / t=76 那几根穿过别人身体的枪管就是这么来的）。
    //
    // checkAmmo **故意不在这张表里**：它自己有一套手的说法（右手去腰间弹药带、
    // 左手仍托枪），把枪扔到身侧的话右手一走，枪就没人拿了。
    // cleanRifle 也不在：擦枪/抱枪由上面那段专门处理，已经乘进 holdOk 的 (1−wipe)。
    const lifeCue = lifePose
      ? Math.max(ready, seatRest, lifePose.sleep, lifePose.repairShoe,
        lifePose.warmHands || 0, lifePose.watch || 0)
      : 0;
    const carryWeapon = holdOk * SmoothStep(0.08, 0.35, lifeCue);
    const hold = Math.max(seatWeapon, carryWeapon);
    if (hold > 0.001) {
      // blend 1 = 全坐姿拄枪，0 = 全起身提枪。sit 掉下去的同时 prepare 已经满了，
      // 所以 hold 全程接近 1：枪不会在过渡里松回低姿持枪，只是就地转个方向。
      const blend = Clamp01(seatWeapon / Math.max(1e-4, hold));
      const lean = 0.28;
      // 坐姿：放在**右腿外侧**。两条大腿之间只有 5 cm 的缝，一把机匣就有 8 cm 宽，
      // 硬塞进去是穿模；放在小腿后面又会被自己的胫骨挡掉整根枪。
      // lmg 多滚四分之一圈（绕枪管自身轴）：捷克式的两脚架长在枪口端，竖起来时
      // 停在一米高的位置横着伸。不滚，两条腿扎进长凳靠背上的铺盖卷；滚半圈，
      // 换成木提把（离地 0.57 m）整个埋进座板 —— 枪就靠在屁股旁边，凳面在
      // 提把的半径以内，朝凳背或朝过道的水平方向都躲不开凳子（t=20 机枪手
      // 侧拍取证，两个方向各埋过一次）。滚 −π/2 是唯一贴着长凳**平行**走的
      // 方向：两脚架顺着凳子伸向无人那头，弹匣与提把转向玩家一侧的空座位。
      // 纯滚转不动枪管的指向，上面「起身过渡只在矢状面里扫」的保证不受影响。
      POSE_E.set(Math.PI * 0.5 + lean, 0.06, kind === "lmg" ? -Math.PI * 0.5 - 0.10 : -0.10, "XYZ");
      REST_Q.setFromEuler(POSE_E);
      const floorY = -(this.body.position.y + this.hips.position.y + this.chest.position.y);
      const buttToGrip = 0.271 * this.weaponScale * Math.cos(lean);
      POSE_A.set(0.215 * k, floorY + buttToGrip, -0.305 * k);
      // 提枪：手垂在右胯外侧，枪口朝前下并略微外撇，枪身贴着右腿外面过去。
      POSE_E.set(-0.695, -0.12, 0.22, "XYZ");
      OFF_Q.setFromEuler(POSE_E);
      POSE_B.set(0.155 * k, -0.155 * k, -0.055 * k);
      OFF_Q.slerp(REST_Q, blend);
      POSE_B.lerp(POSE_A, blend);
      mount.quaternion.slerp(OFF_Q, hold);
      mount.position.lerp(POSE_B, hold);
      this.seatWeaponBlend = seatWeapon;
      this.carryWeaponBlend = carryWeapon;
    } else { this.seatWeaponBlend = 0; this.carryWeaponBlend = 0; }
  }

  /**
   * 手臂。有枪就两只手 IK 到枪上的握点（**先摆枪、手再跟过去**），
   * 空手才走自由摆臂。反过来做的话手永远对不上枪。
   */
  PoseLifeArmsNoWeapon(repairShoe, sleep, checkAmmo, prepare, H, lenA, lenB,
    sit = 0, warmHands = 0, elapsed = 0) {
    const action = Math.max(repairShoe, sleep, checkAmmo, prepare, sit, warmHands);
    if (action <= 0.001) return;
    // 接触量比强度**要陡**：数据里写 warmHands:0.62 的意思是「这个人在搓手」，
    // 不是「手停在垂手与搓手中间那个谁也认不出的地方」。线性混合的结果实测是
    // 两只手停在肚子里（62% 的路走完，手还没伸出躯干）。强度仍然管幅度与快慢，
    // 只有「手到没到位」这一项按 1.45 倍提前收口。
    const contact = (amount) => Clamp01(amount * 1.45);
    const solveBlended = (arm, target, amount, roll) => {
      const w = contact(amount);
      if (w <= 0.001) return;
      REST_Q.copy(arm.shoulder.quaternion);
      OFF_Q.copy(arm.elbow.quaternion);
      SolveTwoBone(arm.shoulder, arm.elbow, target, lenA, lenB, roll);
      arm.shoulder.quaternion.slerp(REST_Q, 1 - w);
      arm.elbow.quaternion.slerp(OFF_Q, 1 - w);
    };
    // 【够得着的范围】肩在 chest 局部 y=+0.20H，整条胳膊只有 0.32H，所以手最低
    // 只能到 y≈−0.12H，而且越往前伸能下得越少。旧值 (−0.205H, −0.205H) 离肩 0.45H，
    // 两段 IK 够不着就把胳膊钳成一根直棍指过去 —— 出图上「补鞋/查弹药」那两个人
    // 的肘完全不弯，像两根撑杆。下面这几组点都压回了包线里，肘才有角度。
    const phase = this.idlePhase;
    // 普通坐姿：两手搭在大腿上（不是垂在身侧往后飘）。任何更具体的动作都盖过它。
    const plainSit = Clamp01(sit - Math.max(repairShoe, sleep, checkAmmo, prepare, warmHands));
    if (plainSit > 0.001) {
      const lean = Wave(elapsed, 0.09, phase * 1.5) * 0.012;
      POSE_A.set(0.085 * H, (-0.070 + lean) * H, -0.115 * H);
      POSE_B.set(-0.085 * H, (-0.070 - lean) * H, -0.115 * H);
      solveBlended(this.arms.R, POSE_A, plainSit, Math.PI * 1.10);
      solveBlended(this.arms.L, POSE_B, plainSit, Math.PI * 0.90);
    }
    // 搓手：两手在腹前合到一起来回蹭。往复是**这个动作的全部读数** ——
    // 不动的话它和「两手交叠坐着」没有区别。1.15 Hz，相位来自个体 idlePhase。
    if (warmHands > 0.001) {
      const rub = Wave(elapsed, 1.15, phase * 1.7);
      POSE_A.set((0.040 + rub * 0.020) * H, (-0.020 + rub * 0.008) * H, -0.150 * H);
      POSE_B.set((-0.030 + rub * 0.020) * H, (-0.028 - rub * 0.008) * H, -0.155 * H);
      solveBlended(this.arms.R, POSE_A, warmHands, Math.PI * 1.14);
      solveBlended(this.arms.L, POSE_B, warmHands, Math.PI * 0.86);
    }
    // 坐在车厢长凳上补鞋：双手捧着鞋停在膝上方、一下一下扎线（针脚 1.5—2.0 s 一下）。
    if (repairShoe > 0.001) {
      const stitch = Pulse(elapsed, 1.55 + ((phase / (Math.PI * 2)) % 1) * 0.45, 0.55,
        ((phase / (Math.PI * 2)) % 1) * 0.29);
      POSE_A.set((0.075 + stitch * 0.070) * H, (-0.022 + stitch * 0.070) * H,
        (-0.160 - stitch * 0.018) * H);
      POSE_B.set(-0.035 * H, -0.030 * H, -0.168 * H);
      solveBlended(this.arms.R, POSE_A, repairShoe, Math.PI * 1.12);
      solveBlended(this.arms.L, POSE_B, repairShoe, Math.PI * 0.88);
    }
    // 查弹药：右手在腰腹的弹药带上摸出一板，举到眼前看一眼再放回去（6.5—9.5 s 一轮）。
    if (checkAmmo > 0.001) {
      const inspect = Pulse(elapsed, 6.5 + ((phase / (Math.PI * 2)) % 1) * 3, 2.4,
        ((phase / (Math.PI * 2)) % 1) * 0.67);
      POSE_A.set(0.115 * H, (-0.045 + inspect * 0.16) * H, (-0.150 - inspect * 0.045) * H);
      POSE_B.set(-0.095 * H, 0.010 * H, -0.155 * H);
      solveBlended(this.arms.R, POSE_A, checkAmmo, Math.PI * 1.06);
      solveBlended(this.arms.L, POSE_B, checkAmmo, Math.PI * 0.94);
    }
    // 靠墙睡：两手交叠在腹前。**肘必须正着屈** —— 旧值 −0.85 把小臂折到身后，
    // 于是两条小臂整个埋进躯干里（t=45 那张站姿群众「小臂不见了」）。
    if (sleep > 0.001) {
      BlendEuler(this.arms.L.shoulder, 0.20, 0, -0.20, sleep);
      BlendEuler(this.arms.R.shoulder, 0.20, 0, 0.20, sleep);
      BlendEuler(this.arms.L.elbow, 1.05, 0, 0, sleep);
      BlendEuler(this.arms.R.elbow, 1.05, 0, 0, sleep);
    }
    // 炮后准备：手放回身侧、停止游移。同样把肘的符号改正（原来是 −0.30 = 过伸）。
    if (prepare > 0.001) {
      BlendEuler(this.arms.L.shoulder, 0.06, 0, -0.15, prepare);
      BlendEuler(this.arms.R.shoulder, 0.06, 0, 0.15, prepare);
      BlendEuler(this.arms.L.elbow, 0.26, 0, 0, prepare);
      BlendEuler(this.arms.R.elbow, 0.26, 0, 0, prepare);
    }
  }

  /**
   * 说话。
   *
   * 输入只有一个 0—1 的 `talk`（台词窗口，导演层按 line.at…at+seconds 自动合成，
   * 数据文件一个字都不用改）。这里回答的是「一个正在说话的人身上有什么在动」：
   *
   *   头   两条不同频率的正弦叠出点头（1.9 Hz 主 + 3.1 Hz 副）。**必须叠两条** ——
   *        单一正弦是节拍器，人看得出来那是机器在数拍子；两条无理数比的频率叠起来
   *        才不重复。侧倾与微转各一条，幅度比点头小。
   *   胸   随点头一起的起伏 + 轻微的左右送肩：说话是**上半身**的事，只动脖子
   *        像个提线木偶。
   *   手   空闲那只手打小手势（抬小臂、肘一开一合）。哪只手空闲由 lifePose 与
   *        持枪状态算：补鞋/擦枪/搓手/睡着两只手都占着，就只剩头颈；端着枪的人
   *        右手在握把上，那就用左手。
   *
   * 幅度基准：35 mm 焦距、2—3 m 外，头顶到下巴约 120 px。点头峰值 6.6°，
   * 帽檐尖端因此走 7—8 px；小臂手势的手走 10 cm 上下，约 60 px。看得出来，
   * 又不至于变成话剧。
   *
   * 全部相位来自 elapsed + idlePhase，**没有随机数**：同一秒重放同一帧。
   */
  PoseTalk(talk, elapsed, lifePose, moveSpeed, headAuthority = 1, aim = 0, boltPhase = 0) {
    const p = this.idlePhase;
    const life = lifePose || NormalizeLifePose();
    const nod = Wave(elapsed, 1.9, p) * 0.62 + Wave(elapsed, 3.1, p * 1.7) * 0.38;
    const turn = Wave(elapsed, 1.15, p * 2.3) * 0.70 + Wave(elapsed, 0.62, p * 0.6) * 0.30;
    const tilt = Wave(elapsed, 0.83, p * 1.31);
    // 打瞌睡的人嘟囔一句，幅度要减半；不减的话「旧伤兵」会在睡姿上猛点头
    const headScale = talk * (1 - life.sleep * 0.55);
    this.neck.rotation.x += headScale * nod * 0.115;
    this.neck.rotation.y += headScale * turn * 0.105 * headAuthority;
    this.neck.rotation.z += headScale * tilt * 0.075;
    this.chest.rotation.x -= talk * (0.5 + 0.5 * Wave(elapsed, 1.9, p)) * 0.030;
    this.chest.rotation.y += talk * Wave(elapsed, 0.71, p * 1.9) * 0.045 * headAuthority;

    // --- 空闲那只手的小手势 -------------------------------------------------
    // 「占着」= 这只手正在干别的事。两只手都占着就只留头颈（补鞋的人不会腾出手比划）。
    const busyBoth = Math.max(life.repairShoe, life.cleanRifle, life.sleep,
      life.warmHands || 0, life.prepare * 0.45);
    let busyR = busyBoth;
    let busyL = busyBoth;
    if (life.checkAmmo > 0.001) busyR = Math.max(busyR, life.checkAmmo);
    if (this.weaponGroup) {
      // 端着枪：右手锁在握把上；左手在护木上，说话时可以松开来比划。
      busyR = 1;
      busyL = Math.max(busyL, 0.55);
    }
    const tag = busyR <= busyL ? "R" : "L";
    const free = 1 - (tag === "R" ? busyR : busyL);
    // 走动的人两条胳膊都在摆步态，别再往上叠手势；据枪/拉栓时也不比划。
    const gesture = talk * free * Clamp01(1 - moveSpeed * 8)
      * (1 - SmoothStep(0, 0.3, aim)) * (boltPhase > 0 ? 0 : 1);
    if (gesture <= 0.002) return;
    const arm = this.arms[tag];
    const side = tag === "L" ? -1 : 1;
    const g = 0.5 + 0.5 * Wave(elapsed, 0.72, p * 1.4);
    const g2 = 0.5 + 0.5 * Wave(elapsed, 1.05, p * 2.1);
    // 肘正着屈（见 PoseArms 里那条符号注释）：0.80—1.35 rad 是「小臂抬到腰胸之间」。
    BlendEuler(arm.shoulder, 0.14 + g * 0.30, side * (g2 - 0.5) * 0.26,
      side * (0.18 + g2 * 0.16), gesture);
    BlendEuler(arm.elbow, 0.80 + g * 0.55, 0, 0, gesture);
  }

  PoseArms(aim, moveSpeed, boltPhase, throwing, melee, hurt, prone = 0, reach = 0, binoculars = 0,
    lifePose = null, elapsed = 0) {
    const d = this.dims;
    const H = d.height;
    const L = this.arms.L, R = this.arms.R;
    const lenA = d.upperArmLen, lenB = d.forearmLen;
    const life = lifePose || NormalizeLifePose();
    const repairShoe = life.repairShoe;
    const cleanRifle = life.cleanRifle;
    const sleep = life.sleep;
    const checkAmmo = life.checkAmmo;
    const prepare = life.prepare;
    const warmHands = life.warmHands || 0;

    if (!this.weaponGroup) {
      // 空手摆臂。同样用 cos 与步态同相：相位 0 左腿在前，左臂就该在后。
      const swing = Math.cos(this.gaitPhase * Math.PI * 2) * (0.15 + moveSpeed * 0.7);
      L.shoulder.rotation.set(-swing, 0, -0.13 - moveSpeed * 0.06);
      R.shoulder.rotation.set(swing, 0, 0.13 + moveSpeed * 0.06);
      // 肘的符号：**正 = 屈（小臂往前折），负 = 过伸（小臂往身后折）**。
      // 手写姿势里没有 roll，肩和肘的 X 是直接相加的，所以负值就是把小臂折到身后 ——
      // 从侧面是反关节，从正面是「小臂不见了」（它折进了躯干）。IK 那条路不受影响：
      // SolveTwoBone 先绕臂轴滚了约 π 再折，负号在那边正好是往前屈。
      L.elbow.rotation.set(0.20 + moveSpeed * 0.62, 0, 0);
      R.elbow.rotation.set(0.20 + moveSpeed * 0.62, 0, 0);
      // 空手的两个过场手势（符号：shoulder.x 正 = 胳膊往前抬；elbow.x 负 = 肘屈）。
      //   reach      双手往前下方伸（够桌面、电键、土袋、扶人）；叠 melee 当一下一下地扒/拽
      //   binoculars 双手举到眼前（望远镜）
      if (reach > 0.001) {
        const tug = melee * 0.35;
        BlendEuler(L.shoulder, 0.95 + tug * 0.3, 0.10, -0.16, reach);
        BlendEuler(R.shoulder, 0.95 + tug * 0.3, -0.10, 0.16, reach);
        BlendEuler(L.elbow, -0.45 - tug, 0, 0, reach);
        BlendEuler(R.elbow, -0.45 - tug, 0, 0, reach);
      }
      if (binoculars > 0.001) {
        BlendEuler(L.shoulder, 1.05, 0.35, -0.30, binoculars);
        BlendEuler(R.shoulder, 1.05, -0.35, 0.30, binoculars);
        BlendEuler(L.elbow, -2.35, 0, 0, binoculars);
        BlendEuler(R.elbow, -2.35, 0, 0, binoculars);
      }
      if (prone > 0.001) {
        // 空手趴着：上臂从肩往**前下方**伸到地面，前臂再往前铺开，两肘就是支点。
        // **撑起来**是这个姿势的全部意义 —— 平摊着的话头埋在土里什么都看不见
        // （百姓在弹幕下就是这么爬的）。
        //
        // y = π 是把整条胳膊绕自己的长轴滚半圈，滚了肘才往**前**折。不滚的话肘只
        // 会往后折（人的胳膊就长这样）：上臂朝前下、前臂朝后上，摆出来是一只
        // 反关节的螃蟹。用 ZXY 序 —— 滚在最内层，先滚再抬，抬的角度才还是
        // 「从肩往前下」的那个角度。
        const reach = Clamp01(moveSpeed / 0.22) * Math.sin(this.pronePhase * Math.PI * 2);
        for (const tag of ["L", "R"]) {
          const arm = this.arms[tag];
          const side = tag === "L" ? -1 : 1;
          const pull = reach * side;                 // 左右手交替往前扒
          BlendEuler(arm.shoulder, 2.05 + pull * 0.28, Math.PI, side * (0.42 + pull * 0.10),
            prone, "ZXY");
          BlendEuler(arm.elbow, -1.00 + pull * 0.42, 0, 0, prone);
        }
      }
      if (prone <= 0.001) {
        this.PoseLifeArmsNoWeapon(repairShoe, sleep, checkAmmo, prepare, H, lenA, lenB,
          life.sit, warmHands, elapsed);
      }
      return;
    }

    // 枪上的握点换算到 chest 空间。weaponMount 是 chest 的直接子节点，更新它自己的
    // 局部矩阵就够，不用惊动整棵世界矩阵树；weaponScale 是抵消身高缩放的那一份。
    this.weaponMount.updateMatrix();
    // 坐姿步枪搁在膝上时，简化手掌不能仍以枪械中心线为接触点——画面会变成
    // 枪管从手心穿出去。两手在枪的局部向下让出 3 cm，读作从下方托住枪身；
    // 非坐姿不变，保留瞄准、换弹和战斗握把的既有精度。
    const seatedHandClearance = life.sit * 0.030 * (H / 1.66);
    this.gripR.set(0, -seatedHandClearance, 0).applyMatrix4(this.weaponMount.matrix);
    this.gripL.copy(this.weaponGripFront).multiplyScalar(this.weaponScale);
    this.gripL.y -= seatedHandClearance;
    this.gripL.applyMatrix4(this.weaponMount.matrix);

    // 枪竖着拄在脚边时（PoseWeapon 的坐姿分支），握把落在地板上方 27 cm ——
    // 那个高度胳膊根本够不着（肩到腕只有 0.32H，最低能到 chest 局部 −0.12H）。
    // 右手搭在枪身上、位置放低（膝盖高度那一段），左手不上枪：两只手都去够一根
    // 立在右腿外侧的枪，左小臂必然横穿胸口。左手在下面单独放到左腿上。
    const seatHold = this.seatWeaponBlend || 0;
    const carryHold = this.carryWeaponBlend || 0;
    if (seatHold > 0.001) {
      POSE_A.set(0.048, -0.022, -0.29).applyMatrix4(this.weaponMount.matrix);
      this.gripR.lerp(POSE_A, seatHold);
    }

    if (boltPhase > 0) {
      // 拉栓：右手离开握把 → 摸到拉机柄 → 向后拉 → 推回 → 回握把
      const reach = SmoothStep(0, 0.22, boltPhase) * (1 - SmoothStep(0.78, 1, boltPhase));
      const pull = Math.sin(Clamp01((boltPhase - 0.2) / 0.6) * Math.PI) * 0.10;
      POSE_A.copy(this.weaponBolt).multiplyScalar(this.weaponScale);
      POSE_A.z += pull;
      POSE_A.applyMatrix4(this.weaponMount.matrix);
      this.gripR.lerp(POSE_A, reach);
    }

    const weaponKind = this.weaponData ? this.weaponData.kind : "boltRifle";
    let leftFollows = this.weaponTwoHanded;
    if (throwing > 0.001) {
      // 投弹：抡臂 —— 手过肩往后（0—0.45）→ 抡到前上方（0.42—0.72）→ 随挥。
      // 起手要**过肩**：手从耳后上方抡出去才是投木柄弹的样子，从体侧平甩是掷铁饼。
      const back = 1 - SmoothStep(0, 0.5, throwing);
      const fwd = SmoothStep(0.42, 0.72, throwing);
      // 这几个数是 **chest 空间**的，而 chest 只有 0.42 m 高 —— 拿身高 H 当尺子写
      // 0.52H 就是 86 cm，比头顶还高一截，两段 IK 够不着就只好把胳膊竖直举起来
      // （上一版那只「打车的手」）。手要走的是过肩的一条弧：起手在耳后偏上，
      // 出手在肩前上方，随挥落到胸前。全程离肩不超过 46 cm（臂展 53）。
      // 起手要**甩到耳后偏外**：贴着脸抡的话，手里那颗弹整段都埋在脑袋后面，
      // 观众只看得见一条空胳膊在挥（而这个动作的全部读数就是「手里有东西」）。
      this.gripR.set(
        Lerp(0.100, 0.205, back) * H,
        (0.300 + back * 0.040 - fwd * 0.020) * H,
        (Lerp(-0.090, -0.265, fwd) + back * 0.245) * H);
      this.chest.rotation.y += back * 0.28 - fwd * 0.34;   // 投弹靠的是腰不是胳膊
      // 左手改成**攥着枪**（枪这时已经挪到左腰侧）。让它空着自由摆的话，
      // 一边抡弹一边甩一条闲胳膊，人读起来像在跳舞。
      if (this.weaponGroup) {
        leftFollows = true;
        this.gripL.copy(this.weaponMount.position);
      } else {
        leftFollows = false;
      }
    } else if (melee > 0.001 && weaponKind === "melee") {
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

    // 有枪时生活动作仍优先保证接触：擦枪是双手沿枪身移动，查弹药是右手离枪
    // 去腰间取弹，准备动作则让双手停在炮后低姿持枪位。
    if (cleanRifle > 0.001 && !throwing && !melee && !prone) {
      const wipe = 0.5 + 0.5 * Math.sin(this.time * 3.8 + this.idlePhase);
      POSE_A.copy(this.gripL).lerp(this.gripR, 0.25 + wipe * 0.45);
      this.gripR.lerp(POSE_A, cleanRifle);
      leftFollows = true;
    }
    if (checkAmmo > 0.001 && !throwing && !melee && !prone) {
      // chest 局部：右手在腰腹弹药带，左手仍托枪，头部低头由 Update 处理。
      // 加上「摸出来举到眼前看一眼再放回去」的慢周期，否则手就一直按在弹药带上不动。
      const inspect = Pulse(elapsed, 6.5 + ((this.idlePhase / (Math.PI * 2)) % 1) * 3, 2.4,
        ((this.idlePhase / (Math.PI * 2)) % 1) * 0.67);
      POSE_A.set(0.14 * H, (0.10 + inspect * 0.16) * H, (-0.28 - inspect * 0.05) * H);
      this.gripR.lerp(POSE_A, checkAmmo);
    }
    if (prepare > 0.001 && !throwing && !melee && !prone) {
      // 炮后抬头准备：不再做擦枪/查弹的手部游移，双手回到稳定托枪点。
      // 枪竖着拄在脚边时不能往握把收 —— 那个点在地板上方 27 cm，胳膊够不着，
      // 硬拉过去就是两条直棍指着地板（旧版「炮后准备」那个交叉在胸前的怪姿势）。
      // 提枪时同理：右手本来就在握把上，而左手要垂在身侧，往握把收就是横过胸口。
      const settle = prepare * (1 - Math.max(seatHold, carryHold));
      this.gripR.lerp(this.weaponMount.position, settle * 0.35);
      if (leftFollows) this.gripL.lerp(this.weaponMount.position, settle * 0.20);
    }

    // 左手够不着护木前段就**沿着枪身往回滑**，别让它悬在枪外面。
    //
    // 数字：肩到腕 = upperArmLen + forearmLen = 0.32H = 53 cm，而握把到护木前握点
    // 是 33 cm、握把本身又在左肩前方 30 cm 开外 —— 左手要走的直线距离 68 cm，
    // 比整条胳膊还长 15 cm。两段 IK 够不着的时候只保证**方向**对，手就停在半空、
    // 离枪身十几厘米（据枪与卧姿截图上那只悬空的左手）。
    // 沿枪轴回滑就一定还抓在木头上：护木本来就有一截可抓的长度，真人也是想抓哪抓哪。
    if (leftFollows) {
      POSE_B.copy(this.gripL).sub(this.gripR);
      const barrel = POSE_B.length();
      if (barrel > 1e-4) {
        POSE_B.multiplyScalar(1 / barrel);
        POSE_A.copy(this.gripR).sub(L.shoulder.position);
        const along = POSE_A.dot(POSE_B);
        const reach = (lenA + lenB) * 0.97;
        // |gripR + s·轴 - 肩| = reach 的正根；判别式为负说明整条枪轴都够不着，
        // 那就取离肩最近的那一点（s = -along），至少手还在枪上
        const disc = along * along - POSE_A.lengthSq() + reach * reach;
        const slide = disc > 0 ? -along + Math.sqrt(disc) : -along;
        this.gripL.copy(POSE_B).multiplyScalar(Clamp(slide, 0, barrel)).add(this.gripR);
      }
    }

    // 坐着拄枪 / 起身提枪时左手都不上枪。**必须排在上面那段沿枪轴回滑之后** ——
    // 回滑是拿 gripR→gripL 当枪轴算的，先把左手挪走会让它顺着「右手到左腿」那条
    // 假枪轴滑，手就落到膝盖外面去了。
    //   坐着：左手搭在左腿上。
    //   提枪：左手**自然垂在身侧**。一根竖在右胯外侧的枪，两只手都去够它的话，
    //         左小臂必然横穿胸口（就是过道里那些「抱着枪打结」的帧）。
    //         −0.110H 是肩到腕 0.32H 的极限位，胳膊几乎伸直 —— 这正是垂手的读数。
    const handsOff = Math.max(seatHold, carryHold);
    if (handsOff > 0.001) {
      // 两个落点之间按与 PoseWeapon 完全相同的 blend 过渡（大腿 → 身侧），
      // 不能按谁大谁赢来选：起立那一秒半里 seatHold 从 1 掉到 0 而 carryHold 一直是 1，
      // 取胜者的写法会在两者相交的那一帧把左手瞬移 19 cm。
      const blend = Clamp01(seatHold / Math.max(1e-4, handsOff));
      POSE_A.set(Lerp(-0.115, -0.085, blend) * H, Lerp(-0.110, -0.070, blend) * H,
        Lerp(-0.015, -0.115, blend) * H);
      this.gripL.lerp(POSE_A, handsOff);
    }

    // 肘往哪边弯：roll≈π 是往后，再各加一点让肘尖向外张开。
    // 这几个数是对着截图调出来的，不是算出来的 —— 改之前先存一张对比图。
    //
    // 卧姿要整整转半圈：roll 绕的是肩→手那根轴，站着的时候肘尖朝身后（chest 的
    // +Z），而趴下之后 chest 的 +Z 是**朝天**的 —— 照抄站姿就成了「两肘朝天举枪」。
    // 差半圈才是两肘撑地，而两肘撑地正是卧姿据枪唯一的支点。
    //
    // 左手越过身体中线（低姿持枪时它被回滑拉到右腰的握把附近）就把 roll 往 π/2 收：
    // roll 0.80π 的肘尖是「往后又往外」，手在右腰、肘还往后 —— 肘尖正好落进左侧
    // 肋骨里，小臂从胸腔里穿过去（t=45 站姿群众那两条不见了的小臂）。
    // 收到 π/2 时肘尖纯朝外，胳膊从胸口**外面**绕过去。
    // 据枪、投弹、劈砍、卧倒一律不参与：那几套是逐帧对着截图调过的，不许被这条改写。
    const crossL = Clamp01((this.gripL.x + 0.02 * H) / (0.14 * H)) * (1 - prone)
      * (1 - SmoothStep(0, 0.45, aim)) * (1 - Clamp01(throwing * 3)) * (1 - Clamp01(melee * 3));
    const proneRoll = prone * Math.PI;
    const rollR = Math.PI * (1.16 - aim * 0.10) + hurt * 0.2 - proneRoll;
    const rollL = Math.PI * (0.80 + aim * 0.06 - crossL * 0.42) - hurt * 0.2 + proneRoll;
    SolveTwoBone(R.shoulder, R.elbow, this.gripR, lenA, lenB, rollR);
    if (leftFollows) {
      SolveTwoBone(L.shoulder, L.elbow, this.gripL, lenA, lenB, rollL);
    } else {
      // 单手武器（手枪）或正在投弹：左手自然垂着摆
      const swing = Math.cos(this.gaitPhase * Math.PI * 2) * (0.2 + moveSpeed * 0.5);
      L.shoulder.rotation.set(-swing, 0, -0.16);
      L.elbow.rotation.set(-0.35 - moveSpeed * 0.4, 0, 0);
    }
  }

  /**
   * 卧倒 / 匍匐前进。
   *
   * 静止卧姿（moveSpeed≈0）：整个人绕胯翻到接近水平（**负的** x 才是脸朝下、
   * 头朝前），体轴比水平高约 10° —— 头这一端抬起来才看得见前方，而且踝正好落
   * 回地面附近。腿顺着体轴往后伸直、微微分开，脚**背**贴地（脚掌朝天）。
   * 上身由两肘撑起，头再抬一档：趴下去什么都看不见的话，这个姿势在玩法上不成立。
   *
   * 匍匐（moveSpeed>0）：低姿匍匐的动力不在腿上，在**一侧收膝 + 对侧肘往回扒**，
   * 身体贴着地一拱一拱往前挪，同时绕体轴左右滚一点。所以这里排的是：
   *   · 收膝：一条腿外展 + 屈膝（青蛙腿）到位，另一条腿蹬直，左右差半个周期；
   *   · 滚身：body 的 z 滚 ±6°，跟收膝同相 —— 收哪边的膝就往哪边滚；
   *   · 拧胯：胯往收膝那侧偏航，胸反向拧回来（真人就是靠这一拧把身体带过去的）；
   *   · 推枪：枪沿体轴前后推 5 cm。人是**先把枪往前送，身体再跟上去**的。
   * 腿的动作**不**走站立那套落脚点 IK：贴着地面的脚没有摆动相，
   * 拿 IK 去解会得到一条抬到半空的腿。
   *
   * @param {number} prone     0—1
   * @param {number} moveSpeed 0—1（0.22 以上算全速匍匐）
   */
  PoseProne(prone, moveSpeed = 0) {
    const d = this.dims;
    const H = d.height;
    const t = SmoothStep(0, 1, prone);
    const crawl = Clamp01(moveSpeed / 0.22) * t;
    const p = this.pronePhase;
    const swing = Math.sin(p * Math.PI * 2);          // +1 = 收左膝，-1 = 收右膝
    const heave = 0.5 - 0.5 * Math.cos(p * Math.PI * 4);   // 一个周期拱两次

    this.body.rotation.x = Lerp(this.body.rotation.x, -1.40, t);
    this.body.rotation.z = Lerp(this.body.rotation.z, swing * 0.11 * crawl, t);
    // 贴地的躯干厚度就这么多；一拱一拱时上身还会离地一点点（2 cm 量级，别多）
    this.body.position.y = Lerp(this.body.position.y, (0.095 + heave * 0.012) * H, t);
    // 躺下之后躯干高度已经由上面这行单独给定；胯上那份 stanceDrop
    // （站姿用来表示"沉下去"的局部 -Y 偏移）必须清掉。
    // 不清的话它会跟着转过去的体轴变成"朝后下方"，把小腿整根压进地里，
    // 手里的枪连刺刀一起扎到地下一米多。这个 bug 在静态正面截图上看不出来。
    this.hips.position.y = Lerp(this.hips.position.y, 0, t);
    this.hips.position.z = Lerp(this.hips.position.z, 0, t);
    this.hips.rotation.y = Lerp(this.hips.rotation.y, -swing * 0.20 * crawl, t);
    this.hips.rotation.z = Lerp(this.hips.rotation.z, 0, t);
    this.chest.rotation.x = Lerp(this.chest.rotation.x, 0.32 + heave * 0.05 * crawl, t);
    this.chest.rotation.y = Lerp(this.chest.rotation.y, swing * 0.14 * crawl, t);
    this.chest.rotation.z = Lerp(this.chest.rotation.z, -swing * 0.06 * crawl, t);
    this.neck.rotation.x = Lerp(this.neck.rotation.x, 0.50, t);
    this.neck.rotation.y = Lerp(this.neck.rotation.y, swing * 0.10 * crawl, t);

    // 腿在这个姿势下的坐标系（趴着的人整个 body 绕 X 转了 -80°，别凭直觉写）：
    //   -Y 局部 = 顺着体轴往后 = 腿伸直的方向
    //   +X 局部 = 人的右手边（还是水平的）
    //   +Z 局部 = **朝天**
    // 于是「腿往两边张开」是绕 Z 转（贴着地面扫），「腿抬离地面」才是绕 X 转。
    // 而膝盖只会绕自己的 X 弯 —— 大腿不滚的话，那根弯曲轴是水平的，
    // 一弯膝盖整条小腿就竖到天上去（第一版匍匐就是这样，一条腿举在半空）。
    // 所以收膝时把大腿绕自己的长轴滚 90°，把膝盖的弯曲轴滚到朝天，
    // 小腿就贴着地面往外侧折 —— 这才是青蛙腿。
    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      // 左腿在 swing>0 时收膝，右腿差半个周期
      const ph = (p + (tag === "R" ? 0.5 : 0)) % 1;
      const draw = (0.5 - 0.5 * Math.cos(ph * Math.PI * 2)) * crawl;   // 0 蹬直 → 1 收到位
      // 滚的量**不跟着 draw 线性走**，一弯膝就得滚满 90°：滚一半的话弯曲轴是斜的，
      // 小腿就斜着往天上翘（第一版匍匐一条腿举在半空，就是这个数只走到 49°）。
      // 直腿绕自己的长轴滚是看不出来的，所以提前滚满没有代价。
      const roll = leg.side * Math.PI * 0.5 * SmoothStep(0, 0.22, draw);
      BlendEuler(leg.thigh,
        0.02 - draw * 0.06,                          // 几乎不抬离地面
        roll,                                        // 绕长轴滚，把膝的弯曲轴滚到朝天
        leg.side * (0.12 + draw * 0.30),             // 外展：贴着地面往体侧扫
        t, "ZXY");
      BlendEuler(leg.knee, -0.10 - draw * 1.35, 0, 0, t);
      // 脚背贴地：脚要**继续沿着腿往后伸**再往下压一点，脚掌朝天。
      // 这里给正数就成了「脚尖朝前折在腿底下」—— 一个跪着的膝盖，不是趴着的脚。
      // y 上把大腿那 90° 滚回来，脚才还是脚背朝下而不是侧着立在地上。
      BlendEuler(leg.ankle, -0.42 + draw * 0.34, -roll, 0, t);
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
    // 「肢体下面是空的」的下垂量（0—1），由 AiDirector.StepCorpse 按落点地形
    // 喂进来：趴在坟顶/台缘上时，悬空的手脚不该平举在空中，要朝地垂下去。
    // 乘 settle —— 倒地过程中不掺和，落定了才垂。
    const droopBody = (rag.droopBody || 0) * settle;
    const droopArms = (rag.droopArms || 0) * settle;

    // 胯落到 0.085H：贴地的躯干厚度就这么多。翻转方向是 -dir —— 正的 x 是后仰。
    this.body.position.set(0, Lerp(rag.startY ?? d.hipY, 0.085 * d.height, SmoothStep(0.05, 0.82, t)), 0);
    this.body.rotation.set(-dir * Lerp(0, 1.52, fall), rag.side * 0.35 * fall, rag.side * 0.28 * fall);
    this.hips.position.set(0, -knee * 0.22 * d.hipY, 0);
    this.hips.rotation.set(0, 0, 0);
    // 上身在膝软的那一下弓一下，落定后必须归零 —— 留着弯度就成了「半坐着的尸体」
    this.chest.rotation.set(dir * 0.30 * knee * (1 - settle), rag.side * 0.2, -rag.side * 0.18 * fall);
    this.neck.rotation.set(dir * (0.26 * fall + 0.30 * droopBody), rag.side * 0.4 * fall, rag.side * 0.35);

    for (const tag of ["L", "R"]) {
      const leg = this.legs[tag];
      // 膝先软，落地后再松开一半 —— 一直保持大弯度会变成「空中蹬着腿」
      const bend = Lerp(0.15, 0.95, knee) * (1 - 0.55 * settle) * (tag === "L" ? 1 : 0.72);
      BlendEuler(leg.thigh, -bend * dir * 0.5 + 0.25 * fall + dir * 0.55 * droopBody, 0, leg.side * (0.12 + 0.26 * fall), 1);
      BlendEuler(leg.knee, -bend * 1.15, 0, 0, 1);
      BlendEuler(leg.ankle, 0.35 * fall, 0, 0, 1);
      const arm = this.arms[tag];
      BlendEuler(arm.shoulder, dir * (0.9 * fall + 0.55 * droopArms) - 0.2, 0, leg.side * (0.35 + 0.55 * fall), 1);
      BlendEuler(arm.elbow, -0.5 - 0.4 * fall, 0, 0, 1);
    }
    // 死了枪就脱手：**平躺在身侧的地上**。
    //
    // 朝向不能直接写一组欧拉角：上身这时已经翻到脸朝下（body.x ≈ -1.5），挂点是
    // chest 的子节点，写死的角度会跟着一起翻过去 —— 枪连刺刀扎进土里，从任何角度
    // 都只看得见一截枪托（旧版倒地截图里那把「不见了」的枪就是埋在身子底下）。
    // 和据枪走同一条路：先在世界空间摆平，再整体除掉上身累积的旋转。
    if (this.weaponGroup) {
      POSE_E.set(0, 1.15 + rag.side * 0.5, 0, "YXZ");     // 世界空间：枪身水平，枪口偏向一侧
      AIM_Q.setFromEuler(POSE_E);
      PARENT_Q.copy(this.body.quaternion).multiply(this.hips.quaternion)
        .multiply(this.chest.quaternion).invert();
      AIM_Q.premultiply(PARENT_Q);
      this.weaponMount.quaternion.slerp(AIM_Q, 1);
      // 位置：chest 的 -Z 此刻正朝着地面，所以 -0.075H 就是「落到地上」；
      // x 把枪挪到身体右侧外面，别插在人身上
      this.weaponMount.position.set(
        (0.20 + 0.06 * fall) * d.height, -0.05 * d.height, -0.075 * d.height);
    }
    if (dying > 0) this.body.rotation.x += dying * 0.02;
  }

  /**
   * 中景人物的影子连一个像素都不到，但每个身体分件仍会在阴影 pass
   * 里再提交一遍。只在距离档切换时遍历，并记住每个网格原本是否投影，
   * 近景恢复时不会错把枪口火、辅助面之类的原生 false 改成 true。
   */
  SetShadowEnabled(enabled) {
    const next = !!enabled;
    if (this.shadowEnabled === next) return;
    this.shadowEnabled = next;
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.actorOriginalCastShadow === undefined) {
        object.userData.actorOriginalCastShadow = object.castShadow === true;
      }
      object.castShadow = next && object.userData.actorOriginalCastShadow;
    });
  }

  /**
   * 释放。几何与材质都是工厂 / 材质库共有的，这里只摘节点、断引用；
   * 真正的 dispose 在 ActorFactory.Dispose()。误 dispose 共享几何会让别的人物一起消失。
   */
  Dispose() {
    if (this.disposed) return;
    if (this.factory && this.factory.batcher) this.factory.batcher.Remove(this);
    if (this.characterRig) this.characterRig.Dispose();
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
    this.batcher = null;             // 人物合批层，见 SetBatcher
    this.kindCache = new Map();      // kind -> { dims, bones }
    // weaponId|variant|quality -> { geometries, muzzle, ... }
    // 键的格式**别在外面自己拼**，读 source 走 WeaponSource()。
    this.weaponCache = new Map();
    this.materialCache = new Map();
    this.meshDocs = new Map();       // 模型 id -> 解码好的 TZM 文档
    this.meshLoading = null;
    this.meshReport = { requested: 0, loaded: 0, missing: [], ready: false };
    this.riggedAssets = null;
    this.characterAssets = null;
    this.disposed = false;
  }

  /**
   * 预读 Blender 出的模型（_blender/BuildAll.py → Model/*.tzm.json）。
   *
   * **必须在造第一个 Actor 之前 await 掉。** KindGeometry / WeaponGeometry 是同步的
   * （它们在 Actor 构造函数里被调，那条路上不能有 await），只会去 meshDocs 里拿
   * 已经解码好的文档；没预读就一律走程序化方块几何 —— 不报错、不黑屏，只是没换模。
   *
   * 一个模型 404 也只作废那一个 id（LoadDocument 返回 null 不抛），别的照用。
   */
  async PreloadMeshes() {
    if (this.meshLoading) return this.meshLoading;
    const wanted = new Set([
      // SoldierNra / SoldierIja 已从正式通路废弃：军人 GLB 失败时宁可显式退回 box，
      // 也不静默显示旧兵模。百姓仍使用原来的男女程序化模型。
      SOLDIER_MESH_BY_KIND.civilian,
      ...Object.values(ACTOR_MESH_BY_VARIANT).flatMap((byVariant) => Object.values(byVariant)),
      ...Object.values(WEAPON_MESH_BY_ID),
      ...Object.values(WEAPON_MESH_VARIANTS).flat(),
      ...Object.values(BAYONET_MESH_BY_WEAPON),
    ]);
    const ids = [...wanted].filter((id) => MESHES[id]);
    this.meshLoading = (async () => {
      const [docs, riggedAssets, characterAssets] = await Promise.all([
        Promise.all(ids.map((id) => LoadDocument(MeshUrl(id)))),
        LoadRiggedAssets(),
        LoadLugouCharacterAssets(),
      ]);
      ids.forEach((id, i) => { if (docs[i]) this.meshDocs.set(id, docs[i]); });
      this.riggedAssets = riggedAssets;
      this.characterAssets = characterAssets;
      this.meshReport = {
        requested: ids.length,
        loaded: this.meshDocs.size,
        missing: ids.filter((id) => !this.meshDocs.has(id)),
        ready: true,
        rigged: riggedAssets.report,
        characters: characterAssets.report,
      };
      return this.meshReport;
    })();
    return this.meshLoading;
  }

  /**
   * 实例化一个模型，只为了把它的几何摘下来。
   * 材质给的是一次性哨兵（见文件中段 SentinelMaterials 的账），摘完就 dispose。
   */
  /**
   * 取一份**整棵树**的模型实例（车辆走这条，不走 WeaponGeometry）。
   *
   * 与 WeaponGeometry 的区别只有一个，但很关键：那条路只收 root 直属的网格，
   * 因为枪一根关节都没有。车有炮塔关节，炮塔下面的几何在 turret 节点里 ——
   * 走那条路会**丢掉整个炮塔**。这里把 root 原样交出去，节点树也一并给，
   * 将来接载具系统直接 `nodes.get("turret").rotation.y = …`。
   *
   * @returns {{root, nodes, tris, draws, bounds} | null}
   */
  ModelInstance(meshId, materials) {
    const doc = this.meshDocs.get(meshId);
    const entry = MESHES[meshId];
    if (!doc || !entry) return null;
    try {
      return InstantiateModel(doc, {
        materials: materials || {},
        mergeMap: MESH_MERGE[this.quality] || null,
      });
    } catch (error) {
      console.warn(`[Actor] ${meshId} 实例化失败：${String(error).slice(0, 160)}`);
      return null;
    }
  }

  _InstantiateMesh(id) {
    const doc = this.meshDocs.get(id);
    const entry = MESHES[id];
    if (!doc || !entry) return null;
    const profile = MESH_MERGE[this.quality] || null;
    const names = new Set(entry.materials);
    if (profile) for (const target of Object.values(profile)) names.add(target);
    names.add("uniform");
    const sentinels = SentinelMaterials(names);
    let built = null;
    try {
      built = InstantiateModel(doc, { materials: sentinels, mergeMap: profile });
    } catch (error) {
      console.warn(`[Actor] 模型 ${id} 实例化失败：${String(error).slice(0, 160)}`);
      built = null;
    }
    for (const material of Object.values(sentinels)) material.dispose();
    if (built) built.root.updateMatrixWorld(true);
    return built;
  }

  /** 用模型搭一个 kind 的骨头表。任何一环对不上就返回 null，调用方退回方块几何。 */
  _ModelKindGeometry(kind, spec, dims, variant) {
    const byVariant = ACTOR_MESH_BY_VARIANT[kind];
    const id = (variant && byVariant && byVariant[variant]) || SOLDIER_MESH_BY_KIND[kind];
    if (!id || !this.meshDocs.has(id)) return null;
    const built = this._InstantiateMesh(id);
    if (!built) return null;
    // 骨架必须逐字对上再动手摘几何：先查后摘，缺一根就整个退回，不留半拉子。
    for (const joint of SOLDIER_JOINTS) {
      if (!built.nodes.has(joint)) {
        console.warn(`[Actor] 模型 ${id} 缺关节 ${joint}，这个 kind 退回程序化几何`);
        return null;
      }
    }
    const scale = spec.height / (MESHES[id].height || spec.height);
    const bones = {};
    for (const [joint, boneKey] of Object.entries(MODEL_BONE_BY_JOINT)) {
      bones[boneKey] = TakeJointGeometry(built.nodes.get(joint), scale);
    }
    // 头上（帽徽 / 钢盔五角星）与领口（步兵红领章）两处都栽在同一个 z 号上
    // 头上（帽徽 / 钢盔五角星）要再往外让 6 mm 才不被帽子吃掉；
    // 领章贴在立领外面，转过来就够，再往外推会飘到胸口去
    FaceForward(bones.head, id, 0.006);
    FaceForward(bones.chest, id, 0);
    for (const [boneKey, bucket] of Object.entries(bones)) HealBucket(bucket, id, boneKey);
    const mounts = {
      eyes: MountOffset(built, "eyes", "neck", scale),
      weaponMount: MountOffset(built, "weaponMount", "chest", scale),
      slingBack: MountOffset(built, "slingBack", "chest", scale),
      gripL: MountOffset(built, "gripL", "elbowL", scale),
      gripR: MountOffset(built, "gripR", "elbowR", scale),
    };
    return { bones, mounts, meshId: id };
  }

  /**
   * kind: "nra" | "nraDare" | "ija" | "ijaOfficer" | "civilian"
   * options: { seed, weapon (Data_Weapons 的 id 或 null), rank }
   */
  Create(kind, options = {}) {
    const actor = new Actor(this, KIND_SPEC[kind] ? kind : "nra", options);
    // 合批层（Script_ActorBatch）在这里挂钩：造出来就登记，Dispose 时摘掉。
    // 挂在工厂上而不是各个调用点上 —— 人物有五个建造口（AI／过场／人群／
    // 编辑器两处），漏掉一个的后果是那批人在画面上整个消失，而不是掉帧。
    if (this.batcher) this.batcher.Add(actor);
    return actor;
  }

  CreateCharacterRig(kind, options = {}, targetHeight = 1.68) {
    return CreateLugouCharacterRig(
      this.characterAssets, kind, options, targetHeight, this.library,
    );
  }

  /** 接上人物合批层。传 null 就是关掉（每个分件退回自己一个 draw call）。 */
  SetBatcher(batcher) {
    this.batcher = batcher || null;
    return this;
  }

  /**
   * 按 kind 缓存整套骨骼几何：24 个人各自合并六十来个盒子会卡出一个肉眼可见的顿。
   *
   * 两条路：先试 Blender 出的模型，读不到就退回程序化方块几何。
   * **五个 kind 全都有 tzm 模型了**（士兵 2026-08-25、百姓 2026-08-26），
   * 方块几何只是模型 404 时的兜底 —— 它不该在正常一局里被走到，
   * 所以 meshSource 这个字段一直露在外面，别把它藏起来。
   * **不许在这里 await** —— 它在 Actor 构造函数里被调，异步化会让"造一个人"
   * 变成异步操作，AI 那边一整条生成链都要跟着改。预读走 PreloadMeshes()。
   */
  KindGeometry(kind, variant = null) {
    // 分身（百姓男/女）各缓存一份：几何不同，但 dims 与关节偏移是同一套。
    const cacheKey = variant ? `${kind}|${variant}` : kind;
    const cached = this.kindCache.get(cacheKey);
    if (cached) return cached;
    const spec = KIND_SPEC[kind];
    const child=kind==="civilian"&&["childBoy","childGirl"].includes(variant);
    const dims = child ? ChildDimensions() : Dimensions(spec.height);
    const fromModel = child ? null : this._ModelKindGeometry(kind, spec, dims, variant);
    const entry = fromModel
      ? { dims, bones: fromModel.bones, mounts: fromModel.mounts, source: "model", meshId: fromModel.meshId }
      : { dims, bones: this._BoxKindGeometry(spec, dims), mounts: null, source: "box", meshId: null };
    // 毛巾 / 背后的大刀 / 腰间的手榴弹带：模型里没有这三样（敢死队是按 kind 临时挂的，
    // 而且 SetTowel 会在战斗中途开关），两条路都从这里补。
    this._AttachExtraBones(entry.bones, spec, dims);
    entry.meshCount = Object.values(entry.bones)
      .reduce((sum, bone) => sum + (bone ? bone.size : 0), 0);
    this.kindCache.set(cacheKey, entry);
    return entry;
  }

  /** 敢死队的白毛巾 / 背刀 / 手榴弹带。两条路共用，所以单独拎出来。 */
  _AttachExtraBones(bones, spec, dims) {
    const quality = this.quality;
    const hy = dims.headCenterY - dims.neckY;
    const lod = LOD[quality];
    const make = (fn) => {
      const buckets = new Map();
      buckets.remap = lod.mergeTo;
      fn(buckets);
      return BakeBuckets(buckets);
    };
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
    // 军官武装带 + 枪套：模型里没有（士兵模型只有子弹带），两条路都从这里补
    if (spec.gear === "officer") bones.officerGear = make((b) => BuildGear(b, dims, spec, quality));
    // 后脑勺：头是一颗肤色球 + 帽子，帽檐以下的后脑与脸同色，背影镜从后面看像正脸
    //（五场过场的复审全都抓到这条）。给一块深色的发盖，正面看不见它。
    // **只补军帽这两种**：钢盔本来就包到后脑；百姓（wrap）的头发是建在模型里的
    //（男的短发一层、女的包头巾 + 纂儿），再补一块就是两层头发顶在一起。
    if (spec.headgear === "cap" || spec.headgear === "peakCap") {
      bones.hairBack = make((b) => {
        // 尺寸按模型量的（头：宽 0.169、深 0.189、帽檐底在脖子关节上约 0.118 m）。
        // 覆盖整个后半球、一路盖到下颌角 —— 只盖到耳根的话深色带下面又露出一段
        // 肤色后颈，背影里读成「戴了个黑眼罩」。
        Add(b, "hair", Cloth(dims.headW * 0.93, dims.headH * 0.50, dims.headD * 0.44, "hairBack"),
          { y: hy - 0.030 * dims.height, z: dims.headD * 0.26 });
      });
    }
    if (spec.dadao) bones.dadao = make((b) => BuildDadao(b, dims, quality));
    if (spec.grenadeBelt) bones.grenades = make((b) => BuildGrenadeBelt(b, dims, quality));
    return bones;
  }

  /** 程序化方块几何（模型读不到时的退路，也是这个项目前几轮的主力）。 */
  _BoxKindGeometry(spec, dims) {
    const quality = this.quality;
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
      // 军官装具走 _AttachExtraBones（模型路与方块路共用），这里不重复建
      if (spec.gear !== "officer") BuildGear(b, dims, spec, quality);
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
    return bones;
  }

  /**
   * 手持武器的几何 + 挂点。先试模型，读不到退回 BuildWeaponGeometry。
   * 返回的形状两条路完全一致：{ geometries, muzzle, gripFront, bolt, twoHanded }，
   * 所以 Actor.SetWeapon 一行都不用改。
   */
  WeaponGeometry(weaponId, variant = 0, { includeBayonet = false } = {}) {
    const key = `${weaponId}|${variant}|${this.quality}|${includeBayonet ? "bayonet" : "bare"}`;
    let built = this.weaponCache.get(key);
    if (!built) {
      built = this._ModelWeaponGeometry(weaponId, variant, includeBayonet)
        || BuildWeaponGeometry(weaponId, this.quality, includeBayonet);
      this.weaponCache.set(key, built);
    }
    return built;
  }

  /**
   * 这把枪最终走的是模型还是程序化方块。给测试与编辑器读用。
   *
   * 有这个口子是因为**缓存键的格式不该外泄**：它曾经是 `id|quality`，
   * 加了外观变体之后变成 `id|variant|quality`，而 PlayTest 当时直接
   * `weaponCache.get("HanYang|high")` 自己拼键 —— 键一改它就查不到，
   * 于是把一把好好的模型枪报成"退回方块"，红得毫无道理。
   */
  WeaponSource(weaponId, variant = 0) {
    const built = this.weaponCache.get(`${weaponId}|${variant}|${this.quality}|bare`)
      || this.weaponCache.get(`${weaponId}|${variant}|${this.quality}|bayonet`);
    return built ? built.source : null;
  }

  /** 从 TZM 模型取一把枪。挂点全部读模型的 muzzle / gripL，不再自己猜枪口在哪。 */
  _ModelWeaponGeometry(weaponId, variant = 0, includeBayonet = false) {
    const id = WeaponMeshId(weaponId, variant);
    if (!id || !this.meshDocs.has(id)) return null;
    const data = WEAPONS[weaponId];
    const built = this._InstantiateMesh(id);
    if (!built || !built.nodes.has("muzzle")) return null;

    // 枪模型一根关节都没有（MESHES[id].joints === 0），所以整把枪的网格都挂在
    // root 上、局部变换是单位阵 —— 直接摘就是规范坐标系里的几何。
    const kind = data ? data.kind : "boltRifle";
    // 大刀与手榴弹：模型是**刀身朝 -Z**建的（跟枪一个规范系），
    // 而这个文件里的劈砍/投掷动作是按**刀身朝 +Y**写的。绕 X 转 +90° 把两边对上，
    // 这样 PoseWeapon 里那套 swing 常量一个都不用重调。
    const upright = kind === "melee" || kind === "throwable";
    const geometries = new Map();
    for (const child of built.root.children) {
      if (!child.isMesh || !child.geometry) continue;
      const bucket = (child.material && child.material.name) || "steel";
      if (upright) child.geometry.rotateX(Math.PI / 2);
      if (geometries.has(bucket)) {
        geometries.set(bucket, MergeGeometries([geometries.get(bucket), child.geometry]));
      } else {
        geometries.set(bucket, child.geometry);
      }
    }
    if (!geometries.size) return null;
    HealBucket(geometries, id, "weapon");

    const Mount = (name) => {
      const node = built.nodes.get(name);
      if (!node) return null;
      const v = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      if (upright) v.set(v.x, -v.z, v.y);
      return v;
    };
    const bore = 0.035;
    const muzzle = Mount("muzzle");
    const gripFront = Mount("gripL")
      || (upright ? new THREE.Vector3(0, 0.12, 0) : new THREE.Vector3(0, -0.012, -0.30));

    // 装刀状态由演员显式传入；低画质/缺模型用轻量刀片，不能把裸枪画成上刀。
    // 刀的 socket 挂点（枪口环中心）对到枪的 muzzle 上，环再往后坐 12 mm。
    if (includeBayonet && data?.bayonet && muzzle) {
      const bayonetId = BAYONET_MESH_BY_WEAPON[weaponId];
      const bayonetBuilt = this.quality === "high" && bayonetId && this.meshDocs.has(bayonetId)
        ? this._InstantiateMesh(bayonetId) : null;
      if (bayonetBuilt) {
        const socketNode = bayonetBuilt.nodes.get("socket");
        const socket = socketNode
          ? new THREE.Vector3().setFromMatrixPosition(socketNode.matrixWorld)
          : new THREE.Vector3();
        const dx = muzzle.x - socket.x;
        const dy = muzzle.y - socket.y;
        const dz = muzzle.z - socket.z + 0.012;
        bayonetBuilt.root.traverse((child) => {
          if (!child.isMesh || !child.geometry) return;
          const bucket = (child.material && child.material.name) || "steel";
          child.geometry.translate(dx, dy, dz);
          if (geometries.has(bucket)) {
            geometries.set(bucket, MergeGeometries([geometries.get(bucket), child.geometry]));
          } else {
            geometries.set(bucket, child.geometry);
          }
        });
      } else {
        const length = data.bayonetLengthM || 0.395;
        const blade = GunSteelBox(0.016, 0.024, length, "bayonet");
        blade.translate(muzzle.x, muzzle.y - 0.006, muzzle.z - length * 0.5);
        geometries.set("steel", geometries.has("steel")
          ? MergeGeometries([geometries.get("steel"), blade]) : blade);
      }
    }
    // 拉栓的抓握点：模型没有这个挂点（栓在钢件里烘死了），沿用规范坐标系里的常量。
    // 枪机在膛线轴稍上、机匣右侧一点 —— 这两个数是按 BuildWeaponGeometry 定的。
    const bolt = kind === "pistol"
      ? new THREE.Vector3(0.02, 0.05, -0.01)
      : new THREE.Vector3(0.04, bore + 0.012, 0.02);
    return {
      geometries,
      muzzle,
      gripFront,
      bolt,
      twoHanded: kind !== "pistol" && kind !== "throwable",
      source: "model",
      meshId: id,
    };
  }

  /** 换模有没有真的生效。测试与 HUD 调试面板读这个，别去猜。 */
  MeshStatus() {
    const kinds = {};
    for (const [kind, entry] of this.kindCache) kinds[kind] = entry.source;
    const weapons = {};
    for (const [key, built] of this.weaponCache) weapons[key] = built.source === "model" ? "model" : "box";
    return { ...this.meshReport, quality: this.quality, kinds, weapons };
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
  ActorMaterials(kind, rnd, options = {}) {
    const spec = KIND_SPEC[kind];
    const lib = this.library;
    const recipe = spec.clothRecipe;
    const seededClothHex = spec.clothHex[Math.min(spec.clothHex.length - 1, Math.floor(rnd() * spec.clothHex.length))];
    // 绝大多数战场角色继续由 seed 抽军装深浅；过场人群可以显式指定档位，
    // 这样同一车厢不会因为碰巧抽到同色而变成一排复制人。
    const clothHex = Number.isFinite(options.uniformHex) ? options.uniformHex : seededClothHex;
    const skinHex = HEX.skin[Math.min(HEX.skin.length - 1, Math.floor(rnd() * HEX.skin.length))];
    const seededWebHex = HEX.nraWebbing[Math.min(HEX.nraWebbing.length - 1, Math.floor(rnd() * HEX.nraWebbing.length))];

    // tintId 这个字段 Get() 根本不看，它只是为了进 Get 的缓存键：
    // Get 用 JSON.stringify(options) 做键，而 THREE.Color.toJSON() 返回 getHex()，
    // 会把大于 1 的染色分量钳到 0xff —— 两个不同的亮色染色会撞成同一份材质。
    const uniform = this.Material(`uniform:${recipe}:${clothHex}`,
      () => lib.Get(recipe, { color: TintTo(recipe, clothHex), tintId: `u${clothHex}`, roughness: 1 }));

    // 绑腿「色同军装或更浅」；日方就是同色布脚绊。中方这一桶还兼着子弹带与干粮袋。
    const accessoryHex = Number.isFinite(options.accessoryHex) ? options.accessoryHex
      : (spec.gear === "nra" ? seededWebHex : (spec.gear === "ija" ? clothHex : HEX.nraPuttee));
    const trouserHex = Number.isFinite(options.trouserHex) ? options.trouserHex : clothHex;
    const trouser = this.Material(`trouser:${recipe}:${trouserHex}`,
      () => lib.Get(recipe, { color: TintTo(recipe, trouserHex), tintId: `t${trouserHex}`, roughness: 1 }));
    const accessory = this.Material(`acc:${recipe}:${accessoryHex}`,
      () => lib.Get(recipe, { color: TintTo(recipe, accessoryHex), tintId: `a${accessoryHex}`, roughness: 1 }));

    if (kind === "ija" || kind === "ijaOfficer") {
      AddDistantIjaReadability(uniform, 1.0);
      AddDistantIjaReadability(accessory, 0.72);
    }

    // 川军模型锁定为草鞋；日军与平民仍分别使用编上靴、布鞋。
    const shoeHex = spec.shoe === "boot" ? HEX.ijaBoot
      : (spec.shoe === "clothShoe" ? HEX.clothShoe : HEX.strawShoe);

    return {
      uniform,
      trouser,
      accessory,
      shoe: this.Material(`shoe:${shoeHex}`,
        () => lib.Plain(`shoe${shoeHex}`, { color: shoeHex, roughness: 0.94, metalness: 0 })),
      skin: this.Material(`skin:${skinHex}`,
        () => lib.Plain(`skin${skinHex}`, { color: skinHex, roughness: 0.78, metalness: 0 })),
      // 九〇式铁帽。三处都栽过，写下来：
      //  1) 它是**喷漆**的钢盔不是裸钢，metalness 必须接近 0（原来给的是 0.85）；
      //  2) SteelHelmet 这张贴图是按 polish 0.2 烘的，粗糙度图本身偏光滑，
      //     材质上的 roughness 标量是**乘**在那张图上的，给到 1 也压不哑，
      //     所以只能靠压暗 albedo 来救；
      //  3) HEX.ijaHelmet(#5A5646) 是史料给的**日光下看到的颜色**，不是 albedo。
      //     直接拿它当 albedo，TintTo 会算出 (1.99, 1.71, 1.36) 的乘数把那张暗底
      //     贴图整体提亮两倍 —— 换成模型的整块半球之后，实测渲出来是一颗
      //     **和皮肤同色**的暖白球，三十米外等于没戴盔（方块时代那顶盔是几个折面，
      //     高光被切碎了，所以一直没暴露）。落到 albedo 要再压两档。
      helmet: AddDistantIjaReadability(this.Material("helmet", () => lib.Get("SteelHelmet",
        { color: TintTo("SteelHelmet", IJA_HELMET_ALBEDO), tintId: "helm", roughness: 1, metalness: 0.04 })), 0.9),
      // 枪身钢与枪托木。这两桶**只有武器模型在用**（人身上的钢件走 helmet，
      // 皮件走 leather），所以这里的数按枪来调，不必迁就人物。
      //
      // 两处跟着 _blender 的 GUN_TILE 一起改的（第 2 轮视觉审查）：
      //  1) normalScale。模型侧的贴图格距从 0.35 m 收到 0.030 m（钢）/
      //     1.0 m 收到 0.085 m（木），同一张法线图在屏幕上的坡度会陡十倍，
      //     还留 1.0 的话机加工纹会被凿成沟、木纹变成搓衣板。
      //     0.20 / 0.24 抄第一人称那一套（Script_Viewmodel.BuildMaterials）——
      //     两边现在贴的是同密度的同一张图，法线强度没有理由不一样。
      //  2) roughness 从 0.62 提到 0.95。**这是"大刀半边雪白半边漆黑"的真凶**：
      //     BakeSteel 的粗糙度图本身就偏光滑（按 polish 0.35 烘的，均值约 0.45），
      //     材质上的标量是乘在图上的，0.62 乘完只剩 0.28 —— 那是镜面。
      //     刀身于是上半截照到天空反出一片白、下半截照到地面反出一片黑，
      //     中间一条硬边。1938 年的发蓝钢不是镜子，乘完落到 0.43 才对。
      steel: this.Material("steel",
        () => lib.Get("Steel", {
          roughness: 0.82, metalness: 0.68, normalScale: 0.28, envMapIntensity: 1.35,
        })),
      // 大刀刀身单独走干净的 PBR 钢：不借 BakeSteel 的锈斑/凹坑 basecolor，
      // 避免宽刀面被贴成脏石板；高金属度 + 中低粗糙度让转动时有连续钢光。
      blade: this.Material("blade",
        () => lib.Plain("DadaoBlade", { color: 0x929aa2, roughness: 0.34, metalness: 0.95 })),
      grip: this.Material("grip",
        () => lib.Plain("DadaoGrip", { color: 0x8f7c61, roughness: 0.78, metalness: 0 })),
      // CGMOL 主式样保留原 UV，并使用从已购 4K 源图压制的专用 1K PBR。
      // roughness / metalness 都由 ORM 逐像素给出；这里的 1 是通道乘数。
      dadao: this.Material("dadao",
        () => lib.Get("DadaoPbr", {
          roughness: 1, metalness: 1, normalScale: 1, envMapIntensity: 1,
        })),
      // 卢沟桥合集保留源 UV 与逐件贴图；这里的 key 必须与 TZM 材质桶逐字一致。
      lqOfficerSword: this.Material("lqOfficerSword", () => lib.Get("LugouqiaoOfficerSword")),
      lqType11AmmoBox: this.Material("lqType11AmmoBox", () => lib.Get("LugouqiaoType11AmmoBox")),
      lqType11Body: this.Material("lqType11Body", () => lib.Get("LugouqiaoType11Body")),
      lqType11BodyAlt: this.Material("lqType11BodyAlt", () => lib.Get("LugouqiaoType11BodyAlt")),
      lqType11Fore: this.Material("lqType11Fore", () => lib.Get("LugouqiaoType11Fore")),
      lqMediumMortar: this.Material("lqMediumMortar", () => lib.Get("Steel")),
      lqWeaponPlain: this.Material("lqWeaponPlain", () => lib.Get("Steel")),
      wood: this.Material("wood",
        () => lib.Get("WoodStock", { roughness: 0.78, metalness: 0, normalScale: 0.32 })),
      // 车辆装甲板。走 SteelHelmet 那张图（喷漆钢：低金属度、粗糙、带锈斑），
      // **不是** Steel（发蓝裸钢）—— 一辆镜面反光的战车比没有模型还糟。
      // 色是 1938 年在华日军战车的土黄褐单色；albedo 要比"看上去的颜色"再压两档，
      // 理由与九〇式钢盔那一行一模一样：史料记的是日光下的观感，不是反照率。
      // Type 89 uses its authored atlas and split normals, without shared paint tint.
      type89Armor: this.Material("type89Armor", () => lib.Get("Type89Armor", { side: THREE.DoubleSide })),
      type89Barrel: this.Material("type89Barrel", () => lib.Get("Type89Armor", { side: THREE.DoubleSide })),
      type89Track: this.Material("type89Track", () => lib.Get("Type89Track", { side: THREE.DoubleSide })),
      armor: this.Material("armor", () => lib.Get("SteelHelmet",
        { color: TintTo("SteelHelmet", 0x55503A), tintId: "armor", roughness: 1, metalness: 0.05 })),
      // 履带与负重轮：没喷漆的锻钢，接地面被磨得半亮、其余锈着。
      // 给 steel（metalness 0.86）的话在这条管线的曝光下是**纯黑**：
      // 一辆车底下糊着一团黑，履带那条前高后低的剪影线全看不见了。
      track: this.Material("track", () => lib.Get("SteelHelmet",
        { color: TintTo("SteelHelmet", 0x3E3B34), tintId: "track", roughness: 1, metalness: 0.30 })),
      leather: this.Material("leather",
        () => lib.Plain("leather", { color: HEX.ijaLeather, roughness: 0.66, metalness: 0 })),
      towel: this.Material("towel", () => lib.Plain("towel", { color: HEX.towel, roughness: 0.95, metalness: 0 })),
      hair: this.Material("hair", () => lib.Plain("hair", { color: 0x26211b, roughness: 0.96, metalness: 0 })),
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
