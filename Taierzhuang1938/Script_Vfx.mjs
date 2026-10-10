import { ManagedTextureLoader } from "./Script_TextureImports.mjs";
// 《台儿庄：血战滕县》粒子与特效系统。
//
// 这一层是"3A 观感"里最能一眼看出差距的地方：一发子弹打在青砖墙上有没有砖粉、
// 有没有碎砖弹跳、墙上有没有留下一个亮边暗芯的弹孔。清真寺西小讲堂南外墙
// 每平方米上百个弹孔 —— "无墙不饮弹"要靠弹孔密度表达，不是靠血浆。
//
// 三条决定架构的约束（改之前先想清楚为什么）：
//
//   1) **粒子位置在 vertex shader 里解析式求**，不在 CPU 回写矩阵。
//      生成时间/初速/加速度/阻尼全是实例属性，位置 = 带线性阻尼弹道的闭式解。
//      四千个粒子每帧回写 InstancedMesh 的矩阵是掉帧首因（4000×16 float 上传 +
//      4000 次 Matrix4 合成），改成属性后只有"生成那一帧"才碰缓冲区。
//
//   2) **粒子必须在深度法线预通道里隐身**。Script_Post 第 1 趟用
//      scene.overrideMaterial 覆盖全场烘 rtNormalDepth；半透明粒子被覆盖后会
//      写进深度，SSAO 立刻在烟雾后面出现一圈黑边，软粒子也会自己遮自己。
//      办法是挂 scene.onBeforeRender：overrideMaterial 非空的那一趟把 root 藏掉。
//      粒子根统一标记为预通道排除，遵守共享后处理契约。
//
//   3) **零 Math.random**。抖动全走 Mulberry32，同一串调用永远出同一画面，
//      视觉审查才能逐轮截图比对。
//
// 烟为什么"有体积"：多层半透明 billboard + 各自旋转 + 随时间膨胀 + 用
// rtNormalDepth 做软粒子（与背景深度差小的地方淡出，否则烟像刀切进地面）+
// 近远烟材质共用 3D 密度与光路吸收，保留内部遮光和透光边缘。
//
// 约束 2 有一条必须自己还的债：**粒子不进预通道，就吃不到合成 pass 的雾**。
// Script_Post 的大气透视挂在 rtNormalDepth 的 w 上，而且明写「深度 0 的天空不吃雾」；
// 粒子在预通道里是隐身的，于是背景是天空的那些像素上 nd.w = 0，整段雾被跳过。
// 近处看不出来（雾量本来就接近 0），两百米外的黑烟柱就变成天上一个**纯黑的洞**，
// 而且随着烟越积越多越长越大 —— 这不是 NaN，是缺了大气透视。
// 所以 AERIAL 那一段在粒子自己的着色器里补雾，且只补「背景是天空」的那一半：
// 背景有实体时合成 pass 已经按背景深度盖过雾了，再补一次就是双份。

import * as THREE from "three";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MUZZLE_FLASH } from "./Data_Tuning_FirearmHandling.mjs";
import { VEHICLE_TRACER, HARD_SURFACE_SPARKS } from "./Data_Tuning_BulletVisual.mjs";
import { BloodEffects } from "./Script_BloodEffects.mjs";
import { BattleSmoke } from "./Script_BattleSmoke.mjs";
import { ParticleEffects } from "./Script_ParticleEffects.mjs";
import {StaticSmokeModules} from './Data_ParticleSmoke.mjs';
import {PARTICLE_VOLUME_ASSETS} from './Data_ParticleVolumeAssets.mjs';
import { BURNING_LIGHT, EXPLOSION_PARTICLE_ART, EXPLOSION_VOLUME_ART, PARTICLE_VOLUME, PARTICLE_MESH } from "./Data_Tuning_Particles.mjs";
import { BOMB_BLAST_VFX } from "./Data_AerialBombs.mjs";
import { BlastScale, LinearDragAt } from "./Script_BombBallistics.mjs";

// ---------------------------------------------------------------------------
// 色板：全部来自 docs/Data_HistoryMaterial.md 的考据表。
// 台儿庄的爆炸主体色是**暖的砖粉黄土**，不是好莱坞的橙红火球；
// 发烟筒是白灰色贴地翻滚，**不是绿色毒雾**（1938 年 3—4 月还在催泪筒阶段）。
// ---------------------------------------------------------------------------
const SCRATCH_COLOR = new THREE.Color();

/** hex(sRGB) -> 线性工作空间三元组。整条管线是线性的，最后一 pass 才转 sRGB。 */
function LinearOf(hex, intensity = 1) {
  SCRATCH_COLOR.setHex(hex);
  return [SCRATCH_COLOR.r * intensity, SCRATCH_COLOR.g * intensity, SCRATCH_COLOR.b * intensity];
}

export const VFX_PALETTE = {
  dust: LinearOf(0xC4B49A),         // 砖粉+黄土烟尘（爆炸主体）
  dustDense: LinearOf(0x9E9078),    // 浓处
  dustPale: LinearOf(0xD8CDB6),     // 逆光边缘
  powderSmoke: LinearOf(0x9A9A96),  // 火药烟
  powderThin: LinearOf(0xC2C2BE),   // 薄火药烟
  // 真实的黑烟不是纯黑：亮天里仍会被天空散射抬成深灰。纯黑叠在半透明
  // billboard 上会变成一根吃掉天空与城墙细节的“洞”，而不是烟。
  blackSmoke: LinearOf(0x625e58),   // 木梁/柴油黑烟的外沿（深灰褐）
  blackCore: LinearOf(0x393632),    // 黑烟核心（保留重感，不压成纯黑）
  screenSmoke: LinearOf(0xE2E0D8),  // 发烟筒/催泪筒：白—灰白
  soil: LinearOf(0xA89373),         // 裸土
  soilAir: LinearOf(0xC0AE8C),      // 扬尘后的土色
  brick: LinearOf(0x7E8388),        // 青砖
  brickCore: LinearOf(0x9AA0A3),    // 新弹痕断口（比表面亮 1—2 档）
  brickHole: LinearOf(0x2A2724),    // 弹孔暗芯
  wood: LinearOf(0x5A4630),         // 素木
  woodBurnt: LinearOf(0x2E2A26),
  burlap: LinearOf(0x8C8467),       // 麻袋/沙包布
  sand: LinearOf(0xC8B583),
  water: LinearOf(0x6E7358),
  brass: LinearOf(0xC9A227),        // 弹壳
  steel: LinearOf(0x8E9299),
  blood: LinearOf(0x8E1E12),        // 出膛那一下的鲜红：比暗红亮两档，雾团才有形
  bloodDark: LinearOf(0x3A0E0A),
  bloodFresh: LinearOf(0xC22A18),   // 雾芯的高光，只给最前面几片
  bloodDrop: LinearOf(0x5A140E),    // 飞溅的血滴/落地血渍
  // --- HDR 发光（数值给到 3—8，泛光阈值 1.05，Script_Post 会接住）---
  fireHot: LinearOf(0xFFD9A0, 7.0),
  fireMid: LinearOf(0xFF8A2A, 4.0),
  fireCool: LinearOf(0x8E2A10, 1.6),
  flashCore: LinearOf(0xFFF3D6, 22.0),   // 爆炸中心的短命强光
  muzzleCore: LinearOf(0xFFF0CC, 8.0),
  muzzleEdge: LinearOf(0xFF9A3A, 3.2),
  tracerNra: LinearOf(0xFFE3B0, 5.5),    // 中方：偏暖白
  tracerIja: LinearOf(0xFFB028, 5.0),    // 日方：橙黄 —— 比中方的暖白更饱和、更偏橙，靠饱和度分敌我
  // 光束的余辉：比弹头暗一档、色相更饱和，弹头掠过之后留下的那条线（TracerBeam）
  tracerTrailNra: LinearOf(0xFFB45E, 3.2),
  tracerTrailIja: LinearOf(0xFF8A12, 2.8),
  sparkHot: LinearOf(0xFFE2B0, 6.5),
  sparkCool: LinearOf(0xD05A16, 2.0),
  // 砖墙/铁件上的弹着火星（_HardSurfaceSparks）：比铁板那档更偏橙，一眼读成「火」
  // 而不是一把白色碎玻璃；尾色压到暗橙红，熄灭前有一段冷却。
  sparkBurstHot: LinearOf(0xFFC46A, 5.5),
  sparkBurstCool: LinearOf(0xFF6418, 2.4),
  markerWarn: LinearOf(0xFF6A3A, 3.0),   // 炮弹落点预警：准星线稿与收缩环
  markerHot: LinearOf(0xFFC48A, 9.0),    // 预警最后半秒的中心亮核
  markerScorch: LinearOf(0x66605A),      // 准星线稿间的焦土颗粒：比任何地面都暗一档，读作阴影而不是橙漆
};

// ---------------------------------------------------------------------------
// 画质档：预算既控制池容量，也控制每次效果的发射数量。
// 目标 1600x900 / 55fps，粒子总数 4000 以内。
// ---------------------------------------------------------------------------
const QUALITY_PRESETS = {
  low: { budget: 0.35, spawn: 0.45, decals: 60, dust: 0.35, soft: false },
  medium: { budget: 0.65, spawn: 0.72, decals: 120, dust: 0.7, soft: true },
  high: { budget: 1.0, spawn: 1.0, decals: 200, dust: 1.0, soft: true },
  ultra: { budget: 1.0, spawn: 1.25, decals: 240, dust: 1.25, soft: true },
};

// 升柱烟的阻尼系数。闭式解 v(t) = a/k + (v0 − a/k)e^(−kt)：只要浮力给成 rise·k，
// 终速就锁在 rise 上，烟柱这条支线才有"一直往上"这个行为。
// 0.55 是"还看得出初速衰减、但九秒能爬三十米"的折中；再大就又变回一颗球。
const BUOYANT_DRAG = 0.55;

// 池容量分配（占总预算的比例）。烟最费，因为它活得久、片子大。
const POOL_SHARE = {
  smoke: 0.22, fire: 0.05, sourceSmoke: 0.08, sourceFire: 0.03,
  streak: 0.14, debris: 0.10, dust: 0.16, star: 0.03,
  ring: 0.02, decal: 0.09, sprite: 0.08,
};

const VEFECTS_MASKS = {
  fire: "./Texture/Texture_VefectsFireMask_01.webp",
  groundFire: "./Texture/Texture_VefectsGroundFireMask_01.webp",
  smoke: "./Texture/Texture_VefectsSmokeMask_01.webp",
  noise: "./Texture/Texture_VefectsNoise_03.webp",
  detailNoise: "./Texture/Texture_VefectsNoise_08.webp",
};

// 炮弹落点预警准星：R 线稿 / G 焦土颗粒 / B 尘团，由 _import/BuildIncomingMarkerTexture.py
// 从两张 imagegen 源图打包而成（来源见 _import/Data_SourceLicenses.md）。
const MARKER_TEXTURE = "./Texture/Texture_IncomingMarker_01.webp";

// 三格 PBR 弹痕图集：0/1 是普通枪弹随机组，2 固定给轻、重机枪。
// Base 带透明度；Normal 是切线空间法线；ORM = AO / Roughness / Metallic。
const BULLET_DECAL_TEXTURES = Object.freeze({
  base: "./Texture/Texture_BulletImpactPbrAtlasBase.webp",
  normal: "./Texture/Texture_BulletImpactPbrAtlasNormal.webp",
  orm: "./Texture/Texture_BulletImpactPbrAtlasOrm.webp",
});
const BULLET_DECAL_UNIFORMS = Object.freeze({
  base: "uDecalBaseMap", normal: "uDecalNormalMap", orm: "uDecalOrmMap",
});

/** 0/1 = 普通枪随机双变体；2 = 机枪专用变体。 */
export function SelectBulletDecalVariant(weaponKind = "rifle", roll = 0.5) {
  if (weaponKind === "lmg" || weaponKind === "hmg") return 2;
  const r = Math.min(0.999999, Math.max(0, Number(roll) || 0));
  return r < 0.5 ? 0 : 1;
}

/** 可供关卡编辑器与独立预览器布设的持续场景特效。 */
export const SCENE_EFFECTS = Object.freeze({
  FireSmall: {
    name: "小型燃烧", note: "木箱、杂物与小片残火",
    options: { kind: "black", rate: 5, radius: 0.28, rise: 1.3, sizeStart: 0.30, sizeEnd: 2.0, life: 4.2, opacity: 0.20, fire: 0.55, fireShape: "column" },
  },
  FireMedium: {
    name: "中型燃烧", note: "街边火堆与局部建筑失火",
    options: { kind: "black", rate: 8, radius: 0.55, rise: 2.1, sizeStart: 0.48, sizeEnd: 3.8, life: 6.2, opacity: 0.22, fire: 0.85, fireShape: "column" },
  },
  GroundFire: {
    name: "贴地火带", note: "油料、木梁或瓦砾上的低矮火焰",
    options: { kind: "black", rate: 4, radius: 0.85, rise: 1.0, sizeStart: 0.25, sizeEnd: 1.8, life: 3.5, opacity: 0.16, fire: 0.75, fireShape: "ground" },
  },
  SmokeWhite: {
    name: "白灰烟", note: "灰烬、湿料与轻烟",
    options: { kind: "dust", colorA: VFX_PALETTE.screenSmoke, colorB: VFX_PALETTE.powderThin, rate: 8, radius: 0.42, rise: 1.7, sizeStart: 0.42, sizeEnd: 3.4, life: 5.2, opacity: 0.24, fire: 0 },
  },
  SmokeDust: {
    name: "扬尘", note: "黄土与碎砖粉尘",
    options: { kind: "dust", rate: 8, radius: 0.65, rise: 0.8, sizeStart: 0.45, sizeEnd: 3.6, life: 4.8, opacity: 0.24, fire: 0 },
  },
  SmokeBlack: {
    name: "黑烟柱", note: "远景失火与持续燃烧",
    options: { kind: "black", rate: 10, radius: 0.70, rise: 3.0, sizeStart: 0.58, sizeEnd: 5.8, life: 8.0, opacity: 0.22, growthPower: 0.90, turbulence: 0.30, fire: 0 },
  },
  BurningWreck: {
    name: "燃烧残骸", note: "车辆、器材与大型瓦砾",
    options: { kind: "black", rate: 9, radius: 0.72, rise: 2.6, sizeStart: 0.50, sizeEnd: 4.8, life: 7.0, opacity: 0.23, turbulence: 0.24, fire: 0.9, fireShape: "ground" },
  },
  BurningHouse: {
    name: "燃烧房屋", note: "更宽、更高的建筑火场",
    options: { kind: "black", rate: 13, radius: 1.25, rise: 3.5, sizeStart: 0.70, sizeEnd: 7.2, life: 9.0, opacity: 0.21, turbulence: 0.32, fire: 1.2, fireShape: "column" },
  },
  SmokeScreen: {
    name: "发烟筒烟幕", note: "贴地铺开的白灰烟幕",
    options: { kind: "screen", rate: 12, radius: 0.50, rise: 0.35, sizeStart: 0.45, sizeEnd: 2.8, life: 5.0, opacity: 0.30, fire: 0 },
  },
});

// ---------------------------------------------------------------------------
// 共用 GLSL
// ---------------------------------------------------------------------------




// toCamOrZ 只在 LIT 分支用得到，写成函数是为了让 #ifdef 里那一行读得懂。
// 相机正好落在粒子中心时 cameraPosition - world 会退化成零向量，normalize 出 NaN，
// 整片粒子会闪成黑块 —— 所以退化时给一个固定方向。












// ---------------------------------------------------------------------------
// 生成描述符：模块级唯一一份，调用方填字段再交给池。
// 每秒上千次 new {} 的 GC 压力会在爆炸那一帧变成掉帧，所以这里刻意复用。
// ---------------------------------------------------------------------------
const SPAWN = {
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  ax: 0, ay: 0, az: 0,
  life: 1, sizeStart: 0.2, sizeEnd: 0.5,
  drag: 0.8, opacity: 1, fadeIn: 0.08,
  angle: 0, spin: 0, stretch: 0, flicker: 0, groundY: -9999, frame: 0,
  // 拉伸池（曳光/火星/光束）的像素保底半宽；0 = 只按米算（旧行为）
  minPx: 0,
  colorA: VFX_PALETTE.dust, colorB: VFX_PALETTE.dustDense,
  seed: 0, nx: 0, ny: 1, nz: 0,
};


// BombBlast 的抛射土团：与着色器同一条「重力 + 线性阻尼」闭式解（Script_BombBallistics.LinearDragAt）。
const BOMB_GRAVITY_G = 9.81;
const BOMB_GRAVITY = Object.freeze({ x: 0, y: -BOMB_GRAVITY_G, z: 0 });
const BOMB_HEAD = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

// 碎块的生成描述符，同样只有一份（爆炸一次要塞 20 个，别在这儿制造垃圾）
const DEBRIS_SPAWN = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  sx: 0.03, sy: 0.03, sz: 0.03, rx: 0, ry: 0, rz: 0,
  color: VFX_PALETTE.brick, life: 2, drag: 0.55, groundY: 0, bounce: 0.3, seed: 0,
};

function ResetSpawn() {
  SPAWN.x = 0; SPAWN.y = 0; SPAWN.z = 0;
  SPAWN.vx = 0; SPAWN.vy = 0; SPAWN.vz = 0;
  SPAWN.ax = 0; SPAWN.ay = 0; SPAWN.az = 0;
  SPAWN.life = 1; SPAWN.sizeStart = 0.2; SPAWN.sizeEnd = 0.5;
  SPAWN.drag = 0.8; SPAWN.opacity = 1; SPAWN.fadeIn = 0.08;
  SPAWN.angle = 0; SPAWN.spin = 0; SPAWN.stretch = 0; SPAWN.flicker = 0;
  SPAWN.groundY = -9999; SPAWN.seed = 0; SPAWN.frame = 0; SPAWN.minPx = 0;
  SPAWN.colorA = VFX_PALETTE.dust; SPAWN.colorB = VFX_PALETTE.dustDense;
  SPAWN.nx = 0; SPAWN.ny = 1; SPAWN.nz = 0;
  return SPAWN;
}

/** 四角面片（-1..1）。position.xy 直接当形状坐标用，省一套 uv。 */
// ---------------------------------------------------------------------------
// 通用粒子池
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 碎块池：真几何小方块，会翻滚会弹跳。砖块/木屑/弹壳共用。
// ---------------------------------------------------------------------------
/**
 * 土块：二十面体的顶点各自往里外推一点（固定种子），再拆成独立三角面算平面法线 ——
 * 翻滚时一面亮一面暗，读得出是一块不规则的湿土，不是方糖。约 1 m 见方，按 iScale 缩放。
 */
export function MakeClodGeometry(seed = "Taierzhuang.Vfx.Clod") {
  const random = Mulberry32(HashString(seed));
  const ico = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = ico.getAttribute("position");
  // 同一个角点在非索引几何里出现多次：按坐标记住推过的量，面才不会裂开。
  const pushed = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!pushed.has(key)) pushed.set(key, 0.72 + random() * 0.5);
    const k = pushed.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.82, pos.getZ(i) * k);
  }
  const flat = ico.index ? ico.toNonIndexed() : ico;
  flat.computeVertexNormals();
  return flat;
}

/**
 * 木片：沿 z 的细长楔子，一头削尖、断口歪斜（碎木劈开的样子），拆面算平面法线。约 1 m 长，按 iScale 缩放。
 */
export function MakeSplinterGeometry(seed = "Taierzhuang.Vfx.Splinter") {
  const random = Mulberry32(HashString(seed));
  const box = new THREE.BoxGeometry(1, 1, 1, 1, 1, 2);
  const pos = box.getAttribute("position");
  // BoxGeometry 每个面各有一份角点：按坐标缓存变换，相邻面的同一个角落到同一处，不裂缝。
  const moved = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), key = `${x},${y},${z}`;
    if (!moved.has(key)) {
      if (z > 0.49) moved.set(key, [x * 0.22 + 0.12, y * 0.35, z + (y > 0 ? 0.12 : 0)]);                 // 削尖的一头
      else if (Math.abs(z) < 0.01) moved.set(key, [x * (0.85 + random() * 0.2), y * 0.9, z + (random() - 0.5) * 0.08]);
      else moved.set(key, [x, y, z + (x > 0 ? 0.08 : -0.04)]);                                            // 歪斜的断口
    }
    pos.setXYZ(i, ...moved.get(key));
  }
  const flat = box.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

// ---------------------------------------------------------------------------
// 浮尘场：整场战斗都在一层灰里。
// 位置是时间的周期函数 + 绕相机回卷，永远不需要生成/回收，CPU 侧每帧零成本。
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 表面反馈表。每种材质"打上去应该是什么样"都写在这儿，Impact 只做分发。
// ---------------------------------------------------------------------------
const SURFACE_PROFILES = {
  brick: {
    puffs: 8, puffLife: [0.55, 1.1], puffSize: [0.05, 0.42], puffSpeed: 1.9,
    colorA: VFX_PALETTE.dustPale, colorB: VFX_PALETTE.dustDense, opacity: 0.5,
    chunks: 4, chunkSize: [0.011, 0.030], chunkSpeed: 3.4, chunkColor: VFX_PALETTE.brick,
    sparks: 0, decal: true, decalSize: 0.11,
    decalRim: VFX_PALETTE.brickCore, decalHole: VFX_PALETTE.brickHole,
  },
  dirt: {
    puffs: 10, puffLife: [0.6, 1.3], puffSize: [0.06, 0.55], puffSpeed: 2.2,
    colorA: VFX_PALETTE.soilAir, colorB: VFX_PALETTE.soil, opacity: 0.55,
    chunks: 4, chunkSize: [0.02, 0.05], chunkSpeed: 2.8, chunkColor: VFX_PALETTE.soil,
    sparks: 0, decal: true, decalSize: 0.16,
    decalRim: VFX_PALETTE.soil, decalHole: VFX_PALETTE.brickHole,
  },
  wood: {
    puffs: 4, puffLife: [0.35, 0.7], puffSize: [0.04, 0.24], puffSpeed: 1.4,
    colorA: VFX_PALETTE.dustPale, colorB: VFX_PALETTE.wood, opacity: 0.35,
    chunks: 6, chunkSize: [0.012, 0.06], chunkSpeed: 3.2, chunkColor: VFX_PALETTE.wood,
    sparks: 0, decal: true, decalSize: 0.09,
    decalRim: VFX_PALETTE.wood, decalHole: VFX_PALETTE.woodBurnt, splinter: true,
  },
  metal: {
    puffs: 3, puffLife: [0.25, 0.5], puffSize: [0.03, 0.18], puffSpeed: 1.2,
    colorA: VFX_PALETTE.powderThin, colorB: VFX_PALETTE.powderSmoke, opacity: 0.28,
    chunks: 0, chunkSize: [0.01, 0.02], chunkSpeed: 2.0, chunkColor: VFX_PALETTE.steel,
    sparks: 12, decal: true, decalSize: 0.07,
    decalRim: VFX_PALETTE.steel, decalHole: VFX_PALETTE.brickHole,
  },
  sandbag: {
    puffs: 6, puffLife: [0.5, 0.95], puffSize: [0.05, 0.3], puffSpeed: 1.3,
    colorA: VFX_PALETTE.sand, colorB: VFX_PALETTE.burlap, opacity: 0.5,
    chunks: 3, chunkSize: [0.01, 0.028], chunkSpeed: 1.6, chunkColor: VFX_PALETTE.burlap,
    sparks: 0, decal: true, decalSize: 0.1,
    decalRim: VFX_PALETTE.sand, decalHole: VFX_PALETTE.brickHole, sandStream: true,
  },
  flesh: {
    // 血全部交给 Blood() 出（雾 + 溅射 + 血滴 + 地面血渍），这里只负责把量给足。
    puffs: 0, puffLife: [0.3, 0.6], puffSize: [0.03, 0.16], puffSpeed: 1.0,
    colorA: VFX_PALETTE.blood, colorB: VFX_PALETTE.bloodDark, opacity: 0.4,
    chunks: 0, chunkSize: [0, 0], chunkSpeed: 0, chunkColor: VFX_PALETTE.blood,
    sparks: 0, decal: false, decalSize: 0, blood: 1.0,
  },
  water: {
    puffs: 5, puffLife: [0.35, 0.7], puffSize: [0.04, 0.26], puffSpeed: 2.6,
    colorA: VFX_PALETTE.dustPale, colorB: VFX_PALETTE.water, opacity: 0.42,
    chunks: 5, chunkSize: [0.01, 0.02], chunkSpeed: 3.0, chunkColor: VFX_PALETTE.water,
    sparks: 0, decal: false, decalSize: 0, waterRing: true,
  },
};

/**
 * 枪口焰形制。
 *
 * smoke 是出膛瞬间被高压气体推走的快烟；wisps 是火光灭后才读出来的慢余烟。
 * 过去只有前者，而且所有调用方都漏传 kind，结果每把枪都是同一团两片烟。
 * 两层拆开以后，栓动步枪是一声一缕，机枪则靠连续的小缕叠成一条烟带。
 */
const MUZZLE_KINDS = {
  rifle: { size: 0.29, life: 0.048, smoke: 2, wisps: 2, spikes: 2 },
  boltRifle: { size: 0.31, life: 0.052, smoke: 2, wisps: 3, spikes: 2 },
  // 自动武器单发焰略短；连续射击靠频率累积亮度和烟，不把每发都做成火球。
  lmg: { size: 0.28, life: 0.042, smoke: 2, wisps: 1, spikes: 2 },
  hmg: { size: 0.40, life: 0.050, smoke: 3, wisps: 2, spikes: 3 },
  pistol: { size: 0.19, life: 0.040, smoke: 1, wisps: 1, spikes: 2 },
  launcher: { size: 0.58, life: 0.075, smoke: 5, wisps: 4, spikes: 3 },
  // 战车主炮（57 mm 短身管）：炮口一团大火、浓烟往前推一大截；地面那圈尘环另走 GroundDustRing。
  cannon: { size: 1.05, life: 0.095, smoke: 9, wisps: 6, spikes: 4 },
};

const EXPLOSION_KINDS = {
  grenade: { flash: 1.0, fire: 6, smoke: 9, chunks: 12, sparks: 4, sooty: 0.15, column: 1.0 },
  launcher: { flash: 0.85, fire: 4, smoke: 7, chunks: 10, sparks: 3, sooty: 0.1, column: 0.8 },
  shell: { flash: 1.4, fire: 9, smoke: 14, chunks: 20, sparks: 8, sooty: 0.35, column: 1.5 },
  tank: { flash: 1.7, fire: 14, smoke: 18, chunks: 22, sparks: 16, sooty: 0.8, column: 2.2 },
  // 航空炸弹（BombBlast 的火球那一层）：只要闪光、火球与一圈尘环。烟、土块另由 BombBlast
  // 按装药画进专用池 —— 两三百米外那一撮小碎块与火星本来就不到一个像素，却会挤掉近处手榴弹的碎块。
  bomb: { flash: 1.6, fire: 9, smoke: 0, chunks: 0, sparks: 0, sooty: 0.55, column: 1.8, rings: 1 },
};

// 四套爆炸序列帧共用同一套粒子 API，但不能共用一个材质：一次炮击的烟尾还没散，
// 下一颗手榴弹若把 sampler 换掉，屏幕上的旧实例会在半空中瞬间变脸。每套各占原
// sprite 总预算的四分之一，显存/实例总量不增加，只多三个很便宜的 draw call。
const EXPLOSION_SPRITE_VARIANTS = Object.freeze({
  legacy: Object.freeze({
    pool: "spriteLegacy", path: "./Texture/Texture_ExplosionFire_01.webp?v=20260928",
    grid: [4, 4], frames: 16, authoredColor: false, blending: "additive",
    emission: 1, aerial: false, fadeOutStart: 0.82,
    life: [0.40, 0.52], mainSize: [0.55, 1.45], secondarySize: [0.30, 0.85],
  }),
  compact: Object.freeze({
    pool: "spriteCompact", path: "./Texture/Texture_ExplosionUnityCompact_01.webp",
    grid: [5, 5], frames: 25, authoredColor: true, blending: "normal",
    emission: 2.6, aerial: true, fadeOutStart: 0.88,
    life: [0.72, 0.90], mainSize: [0.50, 1.25], secondarySize: [0.28, 0.75],
  }),
  fireball: Object.freeze({
    pool: "spriteFireball", path: "./Texture/Texture_ExplosionUnityFireBall_02.webp",
    grid: [8, 8], frames: 64, authoredColor: true, blending: "additive",
    emission: 3.4, aerial: false, fadeOutStart: 0.88,
    life: [0.55, 0.72], mainSize: [0.45, 1.22], secondarySize: [0.25, 0.70],
  }),
  heavy: Object.freeze({
    pool: "spriteHeavy", path: "./Texture/Texture_ExplosionUnityHeavy_02.webp",
    grid: [5, 5], frames: 25, authoredColor: true, blending: "normal",
    emission: 3.0, aerial: true, fadeOutStart: 0.92,
    life: [1.00, 1.25], mainSize: [0.62, 1.55], secondarySize: [0.35, 0.90],
  }),
});

/**
 * 按实际冲击量挑动画，而不是把手榴弹和师团炮放进同一个纯随机袋。
 * 每档保留两种邻近形制：连续爆炸不会克隆粘贴，但也不会小炮炸出重炮蘑菇云。
 */
export function SelectExplosionSpriteVariant(effectivePower, roll = 0.5) {
  const power = Math.max(0, Number(effectivePower) || 0);
  const r = Math.min(0.999999, Math.max(0, Number(roll) || 0));
  if (power < 5.2) return r < 0.35 ? "legacy" : "compact";
  if (power < 10) return r < 0.65 ? "compact" : "fireball";
  return r < 0.18 ? "fireball" : "heavy";
}

const CASING_SIZES = {
  "7.92": [0.0079, 0.057], "7.7": [0.0077, 0.058],
  "6.5": [0.0065, 0.050], "7.63": [0.0076, 0.025],
};

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

// ---------------------------------------------------------------------------
export class VfxSystem {
  constructor(scene, library, { quality = "high", maxParticles = 4000, lights = null } = {}) {
    this.scene = scene;
    // 材质库这里用不上：粒子全部走自定义 ShaderMaterial（PBR 材质进不了加性混合，
    // 也吃不起 SSAO 注入）。留着引用是给以后"贴图版弹孔贴花"用的。
    this.library = library;
    // 粒子与光必须共用同一个生命周期入口。过去调用方在 Combat 里拿枪口灯假扮爆炸
    // 灯，编辑器/过场/直接调用 Vfx 时全漏；持续火源则一盏灯都没有。
    this.lights = lights;
    this.quality = QUALITY_PRESETS[quality] ? quality : "high";
    this.preset = QUALITY_PRESETS[this.quality];
    this.budget = Math.max(200, Math.round(maxParticles * this.preset.budget));
    this.spawnScale = this.preset.spawn;

    this.time = 0;
    /** 上一帧的机位。Blood 按它算屏幕张角做距离补偿（见 Blood 的抬头）。 */
    this.eye = new THREE.Vector3();
    this.random = Mulberry32(HashString("Taierzhuang.Vfx.1938"));
    this.wind = new THREE.Vector3(0.35, 0, -0.15);     // 鲁南春季多西南风，考据里写死的
    this.groundLevel = 0;                              // 碎块/弹壳落到哪一层，见 SetGroundLevel
    this.smokeSources = new Map();
    this.battleSmoke = null;
    this.nextSourceId = 1;
    // 运行时取证：冒烟测试确认调用方传了真实枪种、快烟与余烟两层都生成。
    this.lastMuzzleProfile = null;

    this.root = new THREE.Group();
    this.root.name = "VfxRoot";
    this.root.frustumCulled = false;
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);

    // 1x1 兜底深度图：WebGL2 下未绑定的 sampler 是未定义行为，哪怕分支里不采样也得挂一张
    this.fallbackDepth = new THREE.DataTexture(
      new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.fallbackDepth.needsUpdate = true;

    // 序列帧贴图的 1×1 白图占位：贴图异步加载到位前，火球池采样这张白图，
    // mask 恒为 1，形状退化成普通辉光圆片 —— 与旧版程序化火球观感一致，绝不黑屏。
    this.spritePlaceholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.spritePlaceholder.needsUpdate = true;
    // Unity Labs 两张爆炸图走 NormalBlending；白图兜底会变成方形闪光，所以它们在
    // 贴图未到位时用全透明占位，外层程序化火焰/尘环/烟柱仍照常生成。
    this.spriteTransparentPlaceholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.spriteTransparentPlaceholder.needsUpdate = true;
    this.maskTransparentPlaceholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.maskTransparentPlaceholder.colorSpace = THREE.NoColorSpace;
    this.maskTransparentPlaceholder.needsUpdate = true;
    this.decalNormalPlaceholder = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    this.decalNormalPlaceholder.colorSpace = THREE.NoColorSpace;
    this.decalNormalPlaceholder.needsUpdate = true;
    this.decalOrmPlaceholder = new THREE.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1);
    this.decalOrmPlaceholder.colorSpace = THREE.NoColorSpace;
    this.decalOrmPlaceholder.needsUpdate = true;

    this.shared = {
      uParticleFireMap: { value: this.maskTransparentPlaceholder },
      uParticleFireReady: { value: 0 },
      uTime: { value: 0 },
      uGlobalFade: { value: 1 },
      uNormalDepth: { value: this.fallbackDepth },
      uResolution: { value: new THREE.Vector2(1600, 900) },
      uSoftEnabled: { value: 0 },
      uNearFade: { value: 0.45 },
      // 序列帧与淡出曲线：除火球池外全部用默认值（淡出起点 0.45、单帧白图）。
      uFadeOutStart: { value: 0.45 },
      uSpriteMap: { value: this.spritePlaceholder },
      uSpriteGrid: { value: new THREE.Vector2(1, 1) },
      uSpriteFrames: { value: 1 },
      uMaskMap: { value: this.maskTransparentPlaceholder },
      uMaskNoiseMap: { value: this.spritePlaceholder },
      uMaskNoiseDetailMap: { value: this.spritePlaceholder },
      uDecalBaseMap: { value: this.spriteTransparentPlaceholder },
      uDecalNormalMap: { value: this.decalNormalPlaceholder },
      uDecalOrmMap: { value: this.decalOrmPlaceholder },
      uSunDirection: { value: new THREE.Vector3(0.32, 0.62, -0.72).normalize() },
      // 默认值对齐 LightRig 的 smokyDay：平行光 5.4，漫反射出射亮度约 I/π ≈ 1.7。
      // 这里给小了的话，碎块和烟会比同一场景里的 PBR 物体暗一大截，一眼假。
      uSunColor: { value: new THREE.Vector3(1.72, 1.58, 1.34) },
      uSkyColor: { value: new THREE.Vector3(0.14, 0.17, 0.22) },
      // 大气透视。默认值抄 SKY_PRESETS.smokyDay.fog —— 调用方不接 SetFog 时
      // 也得有一档能用的雾，不然远处的烟又变回天上的黑洞。
      uDepthValid: { value: 0 },
      // 预通道的 24 位硬件深度。只有投影血迹用它求几何法线（见 Script_SurfaceDecals）。
      uSceneDepth: { value: this.fallbackDepth },
      uSceneDepthValid: { value: 0 },
      uFogDensity: { value: 0.0145 },
      uFogFalloff: { value: 15 },
      uFogBase: { value: 0 },
      uFogMax: { value: 0.88 },
      uFogColorSky: { value: new THREE.Vector3(0.72, 0.70, 0.66) },
      uFogColorGround: { value: new THREE.Vector3(0.38, 0.39, 0.42) },
      uFogSunGain: { value: 0.24 },
      uSunColorFog: { value: new THREE.Vector3(1, 0.92, 0.78) },
    };

    const cap = (share, floor) => Math.max(floor, Math.round(this.budget * share));
    const spriteCapacity = cap(POOL_SHARE.sprite / Object.keys(EXPLOSION_SPRITE_VARIANTS).length, 8);
    const makeSpritePool = (variant) => this.particles.Channel(variant.pool,spriteCapacity, {
      shape: "sprite", orient: "billboard",
      blending: variant.blending === "normal" ? THREE.NormalBlending : THREE.AdditiveBlending,
      aerial: variant.aerial, softRange: 0.25, renderOrder: 8,
      fadeOutStart: variant.fadeOutStart,
      sprite: {
        texture: variant.pool === "spriteLegacy"
          ? this.spritePlaceholder : this.spriteTransparentPlaceholder,
        grid: variant.grid, frames: variant.frames,
        authoredColor: variant.authoredColor, emission: variant.emission,
      },
    }, this.shared);
    this.particles = new ParticleEffects(this.root, this.shared, this.quality);
    this.pools = {
      // 烟：alpha 混合 + 朗伯着色 + 软粒子，是"体积感"的全部来源。
      // aerial 只给它一个池：加性的火/曳光/枪口焰是 HDR 自发光，大气透视对它们
      // 是**消光**（乘 1−fog）而不是混向雾色，压下去两百米外的火就没了；
      // 它们又都是零点几秒的短命货，天上留不住洞。要补的话另开一轮，别混在这儿。
      smoke: this.particles.Channel('smoke',cap(POOL_SHARE.smoke, 96), {
        shape: "puff", orient: "billboard", blending: THREE.NormalBlending,
        lit: true, aerial: true, softRange: 0.45, renderOrder: 6,
      }, this.shared),
      // 火/闪光：加性，HDR 3—22，交给 Script_Post 的泛光
      fire: this.particles.Channel('fire',cap(POOL_SHARE.fire, 64), {
        shape: "puff", orient: "billboard", blending: THREE.AdditiveBlending,
        softRange: 0.25, renderOrder: 8,
      }, this.shared),
      // Vefects 原作轮廓 + 流动噪声：只接常驻场景源。
      sourceSmoke: this.particles.Channel('sourceSmoke',cap(POOL_SHARE.sourceSmoke, 48), {
        shape: "masked", orient: "billboard", blending: THREE.NormalBlending,
        lit: true, aerial: true, softRange: 0.45, renderOrder: 6,
        mask: { texture: this.maskTransparentPlaceholder, noise: this.spritePlaceholder },
      }, this.shared),
      sourceFire: this.particles.Channel('sourceFire',cap(POOL_SHARE.sourceFire * 0.5, 16), {
        shape: "masked", orient: "billboard", blending: THREE.AdditiveBlending,
        softRange: 0.22, renderOrder: 8,
        mask: { texture: this.maskTransparentPlaceholder, noise: this.spritePlaceholder, fire: true, emission: 4.6 },
      }, this.shared),
      sourceGroundFire: this.particles.Channel('sourceGroundFire',cap(POOL_SHARE.sourceFire * 0.5, 16), {
        shape: "masked", orient: "billboard", blending: THREE.AdditiveBlending,
        softRange: 0.18, renderOrder: 8,
        mask: { texture: this.maskTransparentPlaceholder, noise: this.spritePlaceholder, fire: true, emission: 4.2 },
      }, this.shared),
      // 四套序列帧按当量随机：旧 16 帧、紧凑爆炸、持续火球、重炮爆炸。容量四等分，
      // 总预算仍是 POOL_SHARE.sprite；NormalBlending 两池能留下黑烟，另两池走 HDR 加性。
      spriteLegacy: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.legacy),
      spriteCompact: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.compact),
      spriteFireball: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.fireball),
      spriteHeavy: makeSpritePool(EXPLOSION_SPRITE_VARIANTS.heavy),
      // 曳光与火星共用一个"沿速度拉长"的池
      streak: this.particles.Channel('streak',cap(POOL_SHARE.streak, 64), {
        shape: "streak", orient: "stretch", blending: THREE.AdditiveBlending,
        bounce: true, softRange: 0.12, renderOrder: 9,
      }, this.shared),
      // 一发一条的弹道光束（TracerBeam，战车机枪）。容量固定、不吃画质档预算：
      // 它是「火力从哪儿来」的玩法信号，与落点预警准星同一个待遇。
      // 淡出全交给片元里的余辉，池级淡出推到寿命最末。
      beam: this.particles.Channel('beam',48, {
        shape: "beam", orient: "stretch", blending: THREE.AdditiveBlending,
        softRange: 0.12, renderOrder: 9, fadeOutStart: 0.995, segments: 32,
      }, this.shared),
      // 枪口焰：星芒
      star: this.particles.Channel('star',cap(POOL_SHARE.star, 24), {
        shape: "star", orient: "billboard", blending: THREE.AdditiveBlending,
        softRange: 0.2, renderOrder: 10,
      }, this.shared),
      // 航空炸弹的土柱与烟团（BombBlast）：与 smoke 同一种片子（同一个着色器程序，不多编），
      // 容量按画质档固定、不吃战斗烟池 —— 一轮几十颗不会把手榴弹、炮击的烟挤掉。只画活着的格子。
      bombSmoke: this.particles.Channel('bombSmoke',BOMB_BLAST_VFX.poolCapacity[this.quality] ?? BOMB_BLAST_VFX.poolCapacity.high, {
        shape: "puff", orient: "billboard", blending: THREE.NormalBlending,
        lit: true, aerial: true, softRange: 0.45, renderOrder: 6, fadeOutStart: BOMB_BLAST_VFX.fadeOutStart,
      }, this.shared),
      // 贴面的环：爆炸尘环、水花圈
      ring: this.particles.Channel('ring',cap(POOL_SHARE.ring, 16), {
        shape: "ring", orient: "normal", blending: THREE.NormalBlending,
        litSurface: true, softRange: 0, renderOrder: 5,
      }, this.shared),
      // 炮弹落点预警：准星贴图 + 程序化收缩环，一张 quad 演完整个倒计时。容量固定 ——
      // 同屏预警不过十几发，而且这是玩法信号，不能被画质档的预算削没。
      marker: this.particles.Channel('marker',12, {
        shape: "marker", orient: "normal", blending: THREE.NormalBlending,
        litSurface: true, softRange: 0, renderOrder: 5, polygonOffset: true,
        fadeOutStart: 0.985,
        sprite: { texture: this.spriteTransparentPlaceholder, grid: [1, 1], frames: 1 },
        marker: { soil: VFX_PALETTE.markerScorch, dust: VFX_PALETTE.soilAir, hot: VFX_PALETTE.markerHot },
      }, this.shared),
      // 弹孔贴花：几何留在命中面，polygonOffset 只动深度；预通道逐像素裁掉悬空部分。
      decal: this.particles.Channel('decal',Math.min(this.preset.decals, cap(POOL_SHARE.decal, 32)), {
        shape: "decal", orient: "normal", blending: THREE.NormalBlending,
        litSurface: true, softRange: 0, renderOrder: 3, polygonOffset: true,
        preserveTargetAlpha: true,
        decal: {
          base: this.spriteTransparentPlaceholder,
          normal: this.decalNormalPlaceholder,
          orm: this.decalOrmPlaceholder,
          ready: 0,
        },
      }, this.shared),
    };
    this.bloodEffects = new BloodEffects({root:this.root,shared:this.shared,lights,quality:this.quality,
      CreatePool:(capacity,config)=>this.particles.Channel(config.shape,capacity,config),
      random:this.random,GroundLevel:()=>this.groundLevel});
    this.pools.bloodMist=this.bloodEffects.mist;
    this.pools.bloodDrop=this.bloodEffects.drops;
    this.bloodSpurts=this.bloodEffects.sources;
    this.debris = this.particles.Channel('debris',cap(POOL_SHARE.debris,48),{renderer:'mesh',geometryName:'rubble',shape:MakeClodGeometry('GeneralRubble')});
    // 开场近爆（Script_OpeningBlastFx，SB02）专用的三只池：甩出来的湿泥（沿速度拉伸、受光、软边）、
    // 不规则土块、劈开的木片。容量固定、空着就整只藏起来（hideWhenIdle）—— 不吃画质档预算、
    // 不占每帧的绑定，也不改手榴弹 / 炮弹的碎块与烟（那些仍走 debris / smoke）。
    // 土块与木片池和 debris 是同一份着色器（只换源几何），泥浆池的 program 由开场布景装载时
    // 生的一颗预热粒子在关卡预热里真画一次（Script_OpeningBlastFx.Warm）。
    this.pools.mud = this.particles.Channel('mud',128, {
      shape: "mud", orient: "stretch", blending: THREE.NormalBlending,
      lit: true, softRange: 0.08, renderOrder: 6, hideWhenIdle: true,
    }, this.shared);
    this.chunks = {
      clod: this.particles.Channel('clod',96,{renderer:'mesh',geometryName:'clod',shape:MakeClodGeometry(),hideWhenIdle:true}),
      splinter: this.particles.Channel('splinter',48,{renderer:'mesh',geometryName:'splinter',shape:MakeSplinterGeometry(),hideWhenIdle:true}),
      casing: this.particles.Channel('casing',PARTICLE_MESH.casingCapacity,{renderer:'mesh',geometryName:'casing',shape:new THREE.CylinderGeometry(.5,.5,1,PARTICLE_MESH.casingSides).rotateX(Math.PI/2),hideWhenIdle:true,metalness:PARTICLE_MESH.metalness,roughness:PARTICLE_MESH.roughness}),
    };

    for (const pool of Object.values(this.pools)) if(!pool.particleId)this.root.add(pool.mesh);
    // All emitted mesh fragments live under the same ParticleEffects root.

    this.dust = null;
    this.dustBox = null;

    // 四套 CC0 爆炸贴图并行加载，来源与许可见 _import/Data_SourceLicenses.md。
    // 单张失败只让对应层透明降级，不会拖死页面，程序化火焰/尘环/碎块仍完整存在。
    this.explosionSpriteTextures = new Map();
    this.loadedExplosionSprites = new Set();
    this.lastExplosionSprite = null;
    const textureLoader = new ManagedTextureLoader(undefined, { flipY: false });

    // 三张图同时到位才切换到 PBR；任一加载失败就继续画原程序化弹孔，避免半套
    // 法线/ORM 与错误的 Base 配在一起。每张是 3×1 图集，不随每发换 sampler。
    this.bulletDecalTextures = new Map();
    this.loadedBulletDecalMaps = new Set();
    this.lastBulletDecal = null;
    for (const [key, path] of Object.entries(BULLET_DECAL_TEXTURES)) {
      textureLoader.load(new URL(path, import.meta.url).href, (texture) => {
        texture.colorSpace = key === "base" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.flipY = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        this.bulletDecalTextures.set(key, texture);
        this.loadedBulletDecalMaps.add(key);
        this.pools.decal.material.uniforms[BULLET_DECAL_UNIFORMS[key]].value = texture;
        if (this.loadedBulletDecalMaps.size === Object.keys(BULLET_DECAL_TEXTURES).length) {
          this.pools.decal.material.uniforms.uDecalReady.value = 1;
        }
      }, undefined, () => {});
    }

    this.explosionSpritesReady = Promise.all(Object.entries(EXPLOSION_SPRITE_VARIANTS).map(([key, variant]) => new Promise(resolve => {
      textureLoader.load(new URL(variant.path, import.meta.url).href, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        // 所有源图都按左上→右下排帧；沿用旧爆炸图验证过的 UV 方向。
        texture.flipY = false;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        this.explosionSpriteTextures.set(key, texture);
        this.loadedExplosionSprites.add(key);
        const pool = this.pools?.[variant.pool];
        if (pool) pool.material.uniforms.uSpriteMap.value = texture;
        resolve(true);
      }, undefined, () => resolve(false));
    })));

    // 第 2 套 Vefects 免费火焰包；仓库只带正片实际依赖的 5 张转换纹理。
    this.vefectsTextures = new Map();
    this.loadedVefectsMasks = new Set();
    for (const [key, path] of Object.entries(VEFECTS_MASKS)) {
      textureLoader.load(new URL(path, import.meta.url).href, (texture) => {
        texture.colorSpace = THREE.NoColorSpace;
        texture.flipY = false;
        const noise = key === "noise" || key === "detailNoise";
        texture.wrapS = noise ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.wrapT = noise ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        this.vefectsTextures.set(key, texture);
        this.loadedVefectsMasks.add(key);
        const noiseTexture = this.vefectsTextures.get("noise") || this.vefectsTextures.get("detailNoise");
        const detailNoiseTexture = this.vefectsTextures.get("detailNoise") || noiseTexture;
        if (noiseTexture && detailNoiseTexture) {
          for (const poolName of ["sourceSmoke", "sourceFire", "sourceGroundFire"]) {
            this.pools[poolName].material.uniforms.uMaskNoiseMap.value = noiseTexture;
            this.pools[poolName].material.uniforms.uMaskNoiseDetailMap.value = detailNoiseTexture;
          }
        }
        if (key === "smoke") this.pools.sourceSmoke.material.uniforms.uMaskMap.value = texture;
        if (key === "fire") {
          this.pools.sourceFire.material.uniforms.uMaskMap.value = texture;
          this.shared.uParticleFireMap.value = texture;
          this.shared.uParticleFireReady.value = 1;
        }
        if (key === "groundFire") this.pools.sourceGroundFire.material.uniforms.uMaskMap.value = texture;
      }, undefined, () => {});
    }

    // 落点预警准星：imagegen 线稿 + 尘团经 _import/BuildIncomingMarkerTexture.py 打包成
    // 三通道 mask。加载前 / 失败时池挂全透明占位，只剩程序化收缩环与亮核，不会黑屏。
    this.markerTexture = null;
    textureLoader.load(new URL(MARKER_TEXTURE, import.meta.url).href, (texture) => {
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // 贴地准星几乎总是被斜着看：没有各向异性，虚线在十米外就糊成一圈色块。
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      this.markerTexture = texture;
      this.pools.marker.material.uniforms.uSpriteMap.value = texture;
    }, undefined, () => {});

    // 深度法线预通道里必须隐身（见文件头第 2 条）。挂钩子而不是改 Script_Post。
    this.previousSceneHook = scene.onBeforeRender;
    this.sceneHook = (renderer, hookScene, camera, target) => {
      if (typeof this.previousSceneHook === "function") {
        this.previousSceneHook.call(hookScene, renderer, hookScene, camera, target);
      }
      this.root.visible = !hookScene.overrideMaterial && hookScene.userData.whiteboxEffects !== false;
    };
    scene.onBeforeRender = this.sceneHook;
  }

  // --- 外部接线 -------------------------------------------------------------

  /**
   * 交出 Script_Post 的 rtNormalDepth（RGBA16F，w = 线性视深度），软粒子才成立。
   * 分辨率能从 RenderTarget 纹理的 image 上直接读，所以不用调用方再报一遍。
   * `sceneDepth` 是同一张靶的 DepthTexture（post.SceneDepthTexture）：半精度线性深度
   * 每 1–8 mm 才跳一级，拿它做屏幕导数会把陡俯视的投影血迹切成横纹。
   */
  SetDepthSource(texture, width = 0, height = 0, sceneDepth = null) {
    this.shared.uSceneDepth.value = texture && sceneDepth ? sceneDepth : this.fallbackDepth;
    this.shared.uSceneDepthValid.value = texture && sceneDepth ? 1 : 0;
    if (!texture) {
      this.shared.uNormalDepth.value = this.fallbackDepth;
      this.shared.uSoftEnabled.value = 0;
      this.shared.uDepthValid.value = 0;
      return;
    }
    this.shared.uNormalDepth.value = texture;
    this.shared.uSoftEnabled.value = this.preset.soft ? 1 : 0;
    // 软粒子可以按画质档关掉，但"背景是不是天空"这个判据不能跟着关 ——
    // 大气透视要靠它区分"合成 pass 已经上过雾"和"这一像素合成 pass 根本不管"。
    this.shared.uDepthValid.value = 1;
    const image = texture.image;
    const w = width || (image && image.width) || this.shared.uResolution.value.x;
    const h = height || (image && image.height) || this.shared.uResolution.value.y;
    this.shared.uResolution.value.set(w, h);
  }

  /** 编辑器/冒烟测试可传固定 roll 预览分档；实战省略时仍走本系统的确定性随机流。 */
  SelectExplosionSpriteVariant(effectivePower, roll = this.random()) {
    return SelectExplosionSpriteVariant(effectivePower, roll);
  }

  /**
   * 太阳方向（指向太阳）与光色 —— 烟的明暗面与碎块受光都靠它。
   * 粒子不走 PBR，所以强度得手动对齐灯光钻机：漫反射出射亮度 ≈ lightIntensity / π，
   * 环境项约等于 hemi 的天空色乘一个小系数。给 SKY_PRESETS 的话就是
   *   SetSun(sky.sunDirection, preset.lightColor, preset.hemiSky,
   *          { sunIntensity: preset.lightIntensity / Math.PI });
   * @param {*} sunColor Color / hex / 字符串都行
   */
  SetSun(direction, sunColor = null, skyColor = null,
    { sunIntensity = 1.7, skyIntensity = 0.38 } = {}) {
    if (direction) this.shared.uSunDirection.value.copy(direction).normalize();
    if (sunColor !== null && sunColor !== undefined) {
      SCRATCH_COLOR.set(sunColor);
      this.shared.uSunColor.value.set(
        SCRATCH_COLOR.r * sunIntensity, SCRATCH_COLOR.g * sunIntensity, SCRATCH_COLOR.b * sunIntensity);
    }
    if (skyColor !== null && skyColor !== undefined) {
      SCRATCH_COLOR.set(skyColor);
      this.shared.uSkyColor.value.set(
        SCRATCH_COLOR.r * skyIntensity, SCRATCH_COLOR.g * skyIntensity, SCRATCH_COLOR.b * skyIntensity);
    }
  }

  /**
   * 大气透视。参数就是 SKY_PRESETS[...].fog 那一坨，原样传进来即可：
   *   SetFog(preset.fog, preset.sunColor);
   * 必须与喂给 post.Render 的是同一份 —— 两边对不齐，烟柱跨过屋脊线会裂成两截。
   */
  SetFog(fog, sunColor = null) {
    const U = this.shared;
    if (fog) {
      U.uFogDensity.value = fog.density ?? 0.0145;
      U.uFogFalloff.value = fog.falloff ?? 15;
      U.uFogBase.value = fog.base ?? 0;
      U.uFogMax.value = fog.max ?? 0.88;
      if (fog.sky) U.uFogColorSky.value.fromArray(fog.sky);
      if (fog.ground) U.uFogColorGround.value.fromArray(fog.ground);
      U.uFogSunGain.value = fog.sunGain ?? 0.24;
    } else {
      U.uFogDensity.value = 0;
    }
    if (sunColor) U.uSunColorFog.value.fromArray(sunColor);
  }

  SetWind(vector) { this.wind.copy(vector); this.particles?.SetWind(vector); }

  /**
   * 当前脚下的地面高度（米）。碎砖、木屑、弹壳落到这一层就停。
   * 关卡里上了屋顶/城墙就把它改掉，否则碎块会穿过屋顶掉到街上。
   */
  SetGroundLevel(y) { this.groundLevel = y; }

  /** 全局淡出（过场/死亡黑屏时把特效一起收掉）。 */
  SetGlobalFade(value) { this.shared.uGlobalFade.value = Math.max(0, Math.min(1, value)); }

  // --- 主循环 ---------------------------------------------------------------

  Update(dt, camera, elapsed) {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    this.time = Number.isFinite(elapsed) ? elapsed : this.time + step;
    this.shared.uTime.value = this.time;
    // 记一份机位。Blood 要按距离补尺寸（见那边的抬头），而粒子是**世界尺寸**的
    // 广告牌，只有拿到相机才知道它在屏幕上究竟有几个像素。
    if (camera) this.eye.copy(camera.position);
    this.UpdateBurningLights();

    if (step > 0) this.particles.Resume();
    this.particles.Update(step);
    this._UpdateSmokeSources(step);
    this.battleSmoke?.Update();
    this.bloodEffects.Update(step,this.time,camera);

    if(this.dust&&!this.particles.systems.has(this.dust.particleId))this.dust=null;
    if (this.dust && camera) {
      // 浮尘盒跟着相机走，但被 AmbientDust 给的战斗区域夹住 —— 越出战场就没有尘
      TMP_A.copy(camera.position);
      if (this.dustBox) this.dustBox.clampPoint(TMP_A, TMP_A);
      this.dust.Move(TMP_A.toArray());
    }

    for (const pool of Object.values(this.pools)) pool.Flush(this.time);
    this.debris.Flush(this.time);
    for (const pool of Object.values(this.chunks)) pool.Flush(this.time);
  }

  // --- 效果 -----------------------------------------------------------------

  /**
   * 枪口焰。真枪就是两帧的事，所以寿命 45—75 ms；
   * 观感靠"不规则星芒 + 一小团发白的烟 + 一片向前炸开的空气扰动"，不靠持续时间。
   */
  MuzzleFlash(position, direction, { scale = 1, kind = "rifle", player = false } = {}) {
    const profile = MUZZLE_KINDS[kind] || MUZZLE_KINDS.rifle;
    const dir = TMP_A.copy(direction).normalize();
    const size = profile.size * scale;
    const smokeCount = Math.max(1, Math.round(profile.smoke * this.spawnScale));
    const wispCount = Math.max(1, Math.round(profile.wisps * this.spawnScale));
    this.lastMuzzleProfile = {
      kind: MUZZLE_KINDS[kind] ? kind : "rifle",
      size,
      smokeCount,
      wispCount,
      life: profile.life,
    };
    if (this.lights) {
      const intensity = 24 * scale * Math.max(0.65, Math.min(1.6, profile.size / 0.29));
      this.lights.FlashMuzzle(position, player ? MUZZLE_FLASH.lightIntensity * scale : intensity, {
        duration: player ? MUZZLE_FLASH.lightLifeS : profile.life * 1.12,
        color: player ? MUZZLE_FLASH.lightColor : 0xffd9a0,
        radius: player ? MUZZLE_FLASH.lightRadiusM : 22,
        priority: player,
      });
    }

    // The player's flame is attached to the viewmodel muzzle. A second world
    // billboard here would cover it with an oversized star during ADS.
    if (!player) {
      for (let i = 0; i < profile.spikes; i += 1) {
        const s = ResetSpawn();
        s.x = position.x + dir.x * 0.04;
        s.y = position.y + dir.y * 0.04;
        s.z = position.z + dir.z * 0.04;
        s.vx = dir.x * 2.2; s.vy = dir.y * 2.2; s.vz = dir.z * 2.2;
        s.drag = 12;
        s.life = profile.life * (i === 0 ? 1 : 0.7);
        s.sizeStart = size * (i === 0 ? 1 : 0.62);
        s.sizeEnd = size * (i === 0 ? 1.35 : 0.8);
        s.opacity = 1;
        s.fadeIn = 0.02;
        s.angle = this._Range(0, 6.283);
        s.spin = this._Signed(6);
        s.colorA = VFX_PALETTE.muzzleCore;
        s.colorB = VFX_PALETTE.muzzleEdge;
        s.seed = this.random();
        this.pools.star.Spawn(s, this.time);
      }

      // 枪口前那一小团 HDR 亮核，负责在泛光里"炸开"
      {
        const s = ResetSpawn();
        s.x = position.x + dir.x * 0.06;
        s.y = position.y + dir.y * 0.06;
        s.z = position.z + dir.z * 0.06;
        s.life = profile.life * 1.1;
        s.sizeStart = size * 0.55; s.sizeEnd = size * 0.9;
        s.drag = 10; s.opacity = 1; s.fadeIn = 0.02;
        s.colorA = VFX_PALETTE.muzzleCore; s.colorB = VFX_PALETTE.fireMid;
        s.seed = this.random();
        this.pools.fire.Spawn(s, this.time);
      }

    }

    // 向前的空气扰动：一片飞快膨胀又消失的贴面，正对枪口方向
    {
      const s = ResetSpawn();
      s.x = position.x + dir.x * 0.18;
      s.y = position.y + dir.y * 0.18;
      s.z = position.z + dir.z * 0.18;
      s.nx = dir.x; s.ny = dir.y; s.nz = dir.z;
      s.life = 0.09;
      s.sizeStart = size * 0.5; s.sizeEnd = size * 3.4;
      s.opacity = 0.16; s.fadeIn = 0.05; s.drag = 20;
      s.colorA = VFX_PALETTE.powderThin; s.colorB = VFX_PALETTE.powderSmoke;
      s.angle = this._Range(0, 3.14);
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }

    // 发白的火药烟，被枪口气流往前推一点点
    for (let i = 0; i < smokeCount; i += 1) {
      const s = ResetSpawn();
      s.x = position.x + dir.x * (0.1 + i * 0.05) + this._Signed(0.03);
      s.y = position.y + dir.y * (0.1 + i * 0.05) + this._Signed(0.03);
      s.z = position.z + dir.z * (0.1 + i * 0.05) + this._Signed(0.03);
      s.vx = dir.x * 1.6 + this._Signed(0.35);
      s.vy = dir.y * 1.6 + this._Signed(0.25) + 0.3;
      s.vz = dir.z * 1.6 + this._Signed(0.35);
      s.ax = this.wind.x * 0.5; s.ay = 0.35; s.az = this.wind.z * 0.5;
      s.drag = 2.6;
      s.life = this._Range(0.45, 0.85) * scale;
      s.sizeStart = 0.06 * scale; s.sizeEnd = this._Range(0.35, 0.6) * scale;
      s.opacity = 0.34; s.fadeIn = 0.12;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(1.6);
      s.colorA = VFX_PALETTE.powderThin; s.colorB = VFX_PALETTE.powderSmoke;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }

    // 慢余烟：初速很低、受风比爆口快烟更明显，并用较长 fadeIn 让它在火光灭后浮出来。
    // 它们立即进 GPU 粒子池但前 0.12—0.20 s 几乎透明，不需要 CPU 定时器或逐帧发射器。
    for (let i = 0; i < wispCount; i += 1) {
      const s = ResetSpawn();
      const along = 0.045 + i * 0.025;
      s.x = position.x + dir.x * along + this._Signed(0.012);
      s.y = position.y + dir.y * along + this._Signed(0.012);
      s.z = position.z + dir.z * along + this._Signed(0.012);
      s.vx = dir.x * this._Range(0.10, 0.28) + this._Signed(0.05);
      s.vy = dir.y * 0.12 + this._Range(0.10, 0.22);
      s.vz = dir.z * this._Range(0.10, 0.28) + this._Signed(0.05);
      s.ax = this.wind.x * 0.9; s.ay = 0.22; s.az = this.wind.z * 0.9;
      s.drag = 0.72;
      s.life = this._Range(0.90, 1.45) * Math.sqrt(scale);
      s.sizeStart = this._Range(0.018, 0.035) * scale;
      s.sizeEnd = this._Range(0.16, 0.28) * scale;
      s.opacity = 0.18; s.fadeIn = this._Range(0.14, 0.22);
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.65);
      s.colorA = VFX_PALETTE.powderThin; s.colorB = VFX_PALETTE.powderSmoke;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }
  }

  /**
   * 炮口冲击波掀起的地面尘环（战车主炮）。尘从炮口正下方的地面一圈往外推、慢慢升起，
   * 1–1.5 s 里把车前那片遮住 —— 玩家冲出掩体的天然窗口，也是「刚开过炮」的读法。
   * 数值（粒子数 / 不透明度 / 终态尺寸 / 升起速度）由调用方从 Data_Tuning_Tank.view.groundRing 传入，
   * 这里的缺省只是兜底。粒子数有下限 minCount：遮蔽是玩法窗口，低画质也不能减没了。
   * @param {THREE.Vector3} position 炮口投到地面上的点（y = 地面高）
   * @param {THREE.Vector3} direction 炮口朝向（只用水平分量）：环往炮口前方偏
   */
  GroundDustRing(position, direction, { radius = 3.2, life = 1.3, count = 16, minCount = 6, opacity = 0.34,
    sizeStart = 0.35, sizeEnd = [1.3, 2.0], rise = [0.35, 0.9], rings = 1 } = {}) {
    const n = Math.max(minCount, Math.round(count * this.spawnScale));
    const fx = direction?.x || 0, fz = direction?.z || 0, fl = Math.hypot(fx, fz) || 1;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + this._Signed(0.2);
      const cx = Math.cos(a), cz = Math.sin(a);
      // 前半圈更猛：冲击波顺着炮口方向。
      const bias = 0.55 + 0.45 * Math.max(0, (cx * fx + cz * fz) / fl);
      const s = ResetSpawn();
      // 两圈：外圈推得远、铺开车前那片；内圈贴着车脚堆高（rings = 2 时每隔一个粒子走内圈）。
      const inner = rings > 1 && i % 2 === 1;
      s.x = position.x + cx * 0.4; s.y = position.y + 0.15; s.z = position.z + cz * 0.4;
      const speed = radius * (inner ? 1.3 : 2.4) * bias;
      s.vx = cx * speed; s.vy = this._Range(rise[0], rise[1]) * (inner ? 1.4 : 1); s.vz = cz * speed;
      s.ax = this.wind.x * 0.4; s.ay = 0.25; s.az = this.wind.z * 0.4;
      s.drag = 3.2;
      s.life = life * this._Range(0.85, 1.15);
      s.sizeStart = sizeStart; s.sizeEnd = this._Range(sizeEnd[0], sizeEnd[1]) * bias;
      s.opacity = opacity; s.fadeIn = 0.04;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.8);
      s.colorA = VFX_PALETTE.soilAir; s.colorB = VFX_PALETTE.dust;
      s.groundY = position.y;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }
    this.lastGroundRing = { x: position.x, y: position.y, z: position.z, count: n, radius, life, opacity };
    return n;
  }

  /**
   * 曳光/弹道。中方偏暖白、日方橙黄 —— 这是玩家分辨"谁在朝我打"的唯一线索。
   * 拉伸长度按速度给：帧间位移约 8 m，streak 短了就变成一串虚线。
   */
  Tracer(from, to, { speed = 480, kind = "nra" } = {}) {
    TMP_A.copy(to).sub(from);
    const distance = TMP_A.length();
    if (distance < 0.05) return;
    const life = Math.min(distance / speed, 1.2);
    // Sub-millisecond trails are below ParticleSystem's lifetime limit. Omit
    // their visual streak instead of extending it beyond the actual hit point.
    if (life < 0.001) return;
    TMP_A.divideScalar(distance);
    const s = ResetSpawn();
    s.x = from.x; s.y = from.y; s.z = from.z;
    s.vx = TMP_A.x * speed; s.vy = TMP_A.y * speed; s.vz = TMP_A.z * speed;
    s.drag = 0.05;
    s.life = life;
    s.sizeStart = 0.035; s.sizeEnd = 0.02;
    s.stretch = Math.min(Math.max(speed * 0.022, 2), 14);
    s.opacity = 1; s.fadeIn = 0.01;
    s.groundY = -9999;                                   // 曳光不弹跳
    const warm = kind !== "ija";
    s.colorA = warm ? VFX_PALETTE.tracerNra : VFX_PALETTE.tracerIja;
    s.colorB = warm ? VFX_PALETTE.fireMid : VFX_PALETTE.tracerIja;
    s.seed = this.random();
    this.pools.streak.Spawn(s, this.time);
  }

  /**
   * 一发子弹一条的弹道光束（战车机枪，Script_Main.FireVehicleBullet）。
   *
   * 与 Tracer 的区别：Tracer 是一小段跟着速度跑的亮条，迎面打来会沿视线塌成一个点，
   * 远处又细到不足一个像素。这里是**一整条从枪口到弹着点的线**：弹头按表现速度飞过去，
   * 掠过的那一段留余辉慢慢暗下去；线宽带像素保底，四十米外仍读得出一条线。
   * 颜色沿用曳光的敌我约定（中方暖白、日方橙黄），参数见 Data_Tuning_BulletVisual。
   */
  TracerBeam(from, to, { kind = "ija", speed = VEHICLE_TRACER.speedMps } = {}) {
    TMP_A.copy(to).sub(from);
    const distance = TMP_A.length();
    if (distance < 0.05) return;
    TMP_A.divideScalar(distance);
    const T = VEHICLE_TRACER;
    const flight = distance / Math.max(speed, 1);
    const s = ResetSpawn();
    // 钉在弹着点上（着色器里 SHAPE_BEAM 不积分弹道），iVelocity 只给方向
    s.x = to.x; s.y = to.y; s.z = to.z;
    s.vx = TMP_A.x; s.vy = TMP_A.y; s.vz = TMP_A.z;
    s.life = flight + T.glowS * 5;
    s.sizeStart = T.halfWidthM; s.sizeEnd = T.halfWidthM;
    s.stretch = distance;
    s.minPx = T.minHalfWidthPx;
    s.groundY = T.maxHalfWidthPx;        // 光束池没有地面回弹，这一格借来放像素上限
    // 光束参数借空着的弹道槽递进着色器（见 VERT_PARTICLE 的 SHAPE_BEAM 抬头）
    s.angle = flight; s.spin = T.glowS;
    s.ax = T.headLengthM; s.ay = T.trailOpacity; s.az = T.muzzleFadeM;
    s.opacity = 1; s.fadeIn = 0;
    const warm = kind !== "ija";
    s.colorA = warm ? VFX_PALETTE.tracerNra : VFX_PALETTE.tracerIja;
    s.colorB = warm ? VFX_PALETTE.tracerTrailNra : VFX_PALETTE.tracerTrailIja;
    s.seed = this.random();
    this.pools.beam.Spawn(s, this.time);
    this.lastTracerBeam = { kind: warm ? "nra" : "ija", distance, flight, life: s.life };
  }

  /**
   * 命中反馈。不同表面必须一眼分得出来，这是"打得实不实"的全部。
   * hardSparks：打在硬面（HARD_SURFACE_SPARKS.surfaces）上另出一簇火星与亮闪 ——
   * 目前只有战车机枪传；incoming 是弹道方向，火星顺着反弹方向溅出去。
   */
  Impact(position, normal, surface = "dirt", { weaponKind = "rifle", hardSparks = false, incoming = null } = {}) {
    const profile = SURFACE_PROFILES[surface] || SURFACE_PROFILES.dirt;
    const n = TMP_A.copy(normal).normalize();
    // 打在地上（法线朝上）碎块就落在弹着点；打在墙上则要一路掉到地面 ——
    // 早先一律用 position.y 的版本，让碎砖悬在墙面高度上不动，像一堆黑方块贴着墙。
    const groundY = n.y > 0.6 ? position.y - 0.02 : this.groundLevel;

    const puffs = Math.round(profile.puffs * this.spawnScale);
    for (let i = 0; i < puffs; i += 1) {
      const s = ResetSpawn();
      this._ConeVelocity(n, 0.75, profile.puffSpeed * this._Range(0.35, 1));
      // 离面 8 cm 起手：贴着面生成的话，软粒子会把刚出生的砖粉抹掉一大半
      s.x = position.x + n.x * 0.08; s.y = position.y + n.y * 0.08; s.z = position.z + n.z * 0.08;
      s.vx = TMP_B.x; s.vy = TMP_B.y + 0.35; s.vz = TMP_B.z;
      s.ax = this.wind.x * 0.3; s.ay = -0.9; s.az = this.wind.z * 0.3;
      s.drag = 3.4;
      s.life = this._Range(profile.puffLife[0], profile.puffLife[1]);
      s.sizeStart = profile.puffSize[0];
      s.sizeEnd = profile.puffSize[1] * this._Range(0.7, 1.25);
      s.opacity = profile.opacity;
      s.fadeIn = 0.08;
      s.angle = this._Range(0, 6.283); s.spin = this._Signed(2.2);
      s.colorA = profile.colorA; s.colorB = profile.colorB;
      s.seed = this.random();
      this.pools.smoke.Spawn(s, this.time);
    }

    const chunks = Math.round(profile.chunks * this.spawnScale);
    for (let i = 0; i < chunks; i += 1) {
      this._ConeVelocity(n, 1.0, profile.chunkSpeed * this._Range(0.4, 1));
      const long = profile.splinter ? this._Range(2.5, 5.5) : 1;
      const size = this._Range(profile.chunkSize[0], profile.chunkSize[1]);
      this._SpawnDebris(
        position.x + n.x * 0.03, position.y + n.y * 0.03, position.z + n.z * 0.03,
        TMP_B.x, TMP_B.y + 1.2, TMP_B.z,
        size, size * this._Range(0.6, 1.1), size * long,
        profile.chunkColor, this._Range(1.1, 1.9), groundY, 0.34, 0.9);
    }

    // 火星只有金属才有：明亮、有拖尾、会弹跳
    const sparks = Math.round(profile.sparks * this.spawnScale);
    for (let i = 0; i < sparks; i += 1) {
      const s = ResetSpawn();
      this._ConeVelocity(n, 1.25, this._Range(3, 9));
      s.x = position.x + n.x * 0.02; s.y = position.y + n.y * 0.02; s.z = position.z + n.z * 0.02;
      s.vx = TMP_B.x; s.vy = TMP_B.y + 1.4; s.vz = TMP_B.z;
      s.ay = -9.8; s.drag = 1.1;
      s.life = this._Range(0.28, 0.7);
      s.sizeStart = 0.012; s.sizeEnd = 0.004;
      s.stretch = this._Range(0.15, 0.4);
      s.opacity = 1; s.fadeIn = 0.02;
      s.groundY = groundY;
      s.colorA = VFX_PALETTE.sparkHot; s.colorB = VFX_PALETTE.sparkCool;
      s.seed = this.random();
      this.pools.streak.Spawn(s, this.time);
    }
    if (hardSparks && HARD_SURFACE_SPARKS.surfaces.includes(surface)) {
      this._HardSurfaceSparks(position, n, incoming, groundY);
    }

    // 沙包被打穿：一股顺着重力往下淌的沙流，不是爆开的云
    if (profile.sandStream) {
      const count = Math.round(7 * this.spawnScale);
      for (let i = 0; i < count; i += 1) {
        const s = ResetSpawn();
        s.x = position.x + n.x * 0.04 + this._Signed(0.03);
        s.y = position.y + this._Signed(0.02);
        s.z = position.z + n.z * 0.04 + this._Signed(0.03);
        s.vx = n.x * this._Range(0.2, 0.6); s.vy = -this._Range(0.4, 1.1); s.vz = n.z * this._Range(0.2, 0.6);
        s.ay = -6.5; s.drag = 1.6;
        s.life = this._Range(0.5, 0.95);
        s.sizeStart = 0.02; s.sizeEnd = 0.05;
        s.opacity = 0.6; s.fadeIn = 0.05;
        s.colorA = VFX_PALETTE.sand; s.colorB = VFX_PALETTE.soil;
        s.seed = this.random();
        this.pools.smoke.Spawn(s, this.time);
      }
    }

    if (profile.waterRing) {
      const s = ResetSpawn();
      s.x = position.x; s.y = position.y + 0.01; s.z = position.z;
      s.nx = 0; s.ny = 1; s.nz = 0;
      s.life = 0.75; s.sizeStart = 0.06; s.sizeEnd = 0.7;
      s.opacity = 0.35; s.fadeIn = 0.06;
      s.colorA = VFX_PALETTE.dustPale; s.colorB = VFX_PALETTE.water;
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }

    if (profile.blood) this.Blood(position, n, profile.blood);

    if (profile.decal) {
      const roll = this.random();
      const variant = SelectBulletDecalVariant(weaponKind, roll);
      this.lastBulletDecal = {
        variant, weaponKind, surface, roll,
        pbrReady: this.loadedBulletDecalMaps.size === Object.keys(BULLET_DECAL_TEXTURES).length,
      };
      this._SpawnDecal(position, n, profile.decalSize, profile.decalRim, profile.decalHole,
        0.85, 1, variant);
    }
  }

  /**
   * 硬面弹着的火星：一簇顺着反弹方向溅开、带重力会弹跳的亮条，加弹着点一下星芒亮闪。
   * 火星带像素保底宽度 —— 二十米外一颗 1.6 cm 的火星本来连一个像素都占不满。
   * n 是 Impact 里的 TMP_A（后面贴弹孔还要用），这里只动 TMP_B / TMP_C。
   */
  _HardSurfaceSparks(position, n, incoming, groundY) {
    const P = HARD_SURFACE_SPARKS;
    const axis = TMP_C.copy(n);
    if (incoming) {
      // 镜面反弹方向 d − 2(d·n)n，再往法线拉回一部分：掠射进来的弹，火星贴着墙面往前溅；
      // 正面打进来的弹，火星迎着来路散开。
      const dot = incoming.x * n.x + incoming.y * n.y + incoming.z * n.z;
      axis.set(incoming.x - 2 * dot * n.x, incoming.y - 2 * dot * n.y, incoming.z - 2 * dot * n.z);
      if (axis.lengthSq() > 1e-8) {
        axis.normalize().multiplyScalar(P.reflectWeight).addScaledVector(n, 1 - P.reflectWeight);
        if (axis.lengthSq() > 1e-8) axis.normalize(); else axis.copy(n);
      } else axis.copy(n);
    }
    const count = Math.max(1, Math.round(P.count * this.spawnScale));
    for (let i = 0; i < count; i += 1) {
      const s = ResetSpawn();
      this._ConeVelocity(axis, P.spread, this._Range(P.speedMps[0], P.speedMps[1]));
      s.x = position.x + n.x * 0.03; s.y = position.y + n.y * 0.03; s.z = position.z + n.z * 0.03;
      s.vx = TMP_B.x; s.vy = TMP_B.y + 0.8; s.vz = TMP_B.z;
      s.ay = -9.8; s.drag = 1.2;
      s.life = this._Range(P.lifeS[0], P.lifeS[1]);
      s.sizeStart = P.halfWidthM; s.sizeEnd = P.halfWidthM * 0.35;
      s.stretch = this._Range(P.lengthM[0], P.lengthM[1]);
      s.minPx = P.minHalfWidthPx;
      s.opacity = 1; s.fadeIn = 0.02;
      s.groundY = groundY;
      s.colorA = VFX_PALETTE.sparkBurstHot; s.colorB = VFX_PALETTE.sparkBurstCool;
      s.seed = this.random();
      this.pools.streak.Spawn(s, this.time);
    }
    // 弹着点那一下亮闪：星芒池（与枪口焰同一个形状），两三帧就灭
    const f = ResetSpawn();
    f.x = position.x + n.x * 0.04; f.y = position.y + n.y * 0.04; f.z = position.z + n.z * 0.04;
    f.drag = 12;
    f.life = P.flashLifeS;
    f.sizeStart = P.flashSizeM; f.sizeEnd = P.flashSizeM * 1.3;
    f.opacity = 1; f.fadeIn = 0.02;
    f.angle = this._Range(0, 6.283); f.spin = this._Signed(6);
    f.colorA = VFX_PALETTE.muzzleCore; f.colorB = VFX_PALETTE.sparkBurstHot;
    f.seed = this.random();
    this.pools.star.Spawn(f, this.time);
    this.lastHardSurfaceSparks = { count, position: [position.x, position.y, position.z],
      axis: [axis.x, axis.y, axis.z] };
  }

  /**
   * 爆炸。看起来"有当量"的关键不是火球大小，是**贴地扩散的尘环**：
   * 冲击波沿地面推出去的那一圈灰，才让人相信地面被砸了一下。
   */
  Explosion(position, {
    radius = 6, kind = "grenade", groundY = null, spriteVariant = null,
  } = {}) {
    const profile = EXPLOSION_KINDS[kind] || EXPLOSION_KINDS.grenade;
    const art = EXPLOSION_PARTICLE_ART[kind] || EXPLOSION_PARTICLE_ART.grenade;
    const scale = Math.max(0.35, radius / 6);
    // 空炸（打在墙上、屋顶上）时爆点比地面高，碎块得继续往下掉
    const ground = groundY ?? Math.min(position.y - 0.05, this.groundLevel);
    const effectivePower = radius * profile.flash;
    const spriteKey = EXPLOSION_SPRITE_VARIANTS[spriteVariant]
      ? spriteVariant : this.SelectExplosionSpriteVariant(effectivePower);
    const spriteProfile = EXPLOSION_SPRITE_VARIANTS[spriteKey];
    const spritePool = this.pools[spriteProfile.pool];
    this.lastExplosionSprite = {
      key: spriteKey, effectivePower, radius, kind,
      loaded: this.loadedExplosionSprites.has(spriteKey),
    };

    // 点光与火球共用 sprite 形制的寿命：紧凑爆炸亮得短，重炮火团则能把附近墙面
    // 多照几拍。强度沿用原来 Combat 的 radius×9 量级，但半径与颜色终于跟当量一起变。
    if (this.lights) {
      const spriteLife = (spriteProfile.life[0] + spriteProfile.life[1]) * 0.5;
      const lightProfile = {
        intensity: Math.max(38, Math.min(180, radius * (8.2 + profile.flash * 1.8))),
        radius: Math.max(14, Math.min(52, radius * (2.7 + profile.flash * 0.5))),
        duration: Math.min(art.lightSeconds, spriteLife * 0.78),
        coreColor: 0xfff1d2,
        fireColor: profile.sooty >= 0.7 ? 0xff641d : 0xff7a26,
      };
      this.lights.FlashExplosion(position, lightProfile);
      this.lastExplosionSprite.light = lightProfile;
    }

    // 1) 中心强光：HDR 20+，只活三四帧
    {
      const s = ResetSpawn();
      s.x = position.x; s.y = position.y; s.z = position.z;
      // 三四帧、直径远小于当量半径 —— 剩下的"大"交给泛光去铺。
      // 做成 radius 级别的白球会直接糊掉半个屏幕，那不是强光是曝光失败。
      s.life = 0.055 * profile.flash;
      s.sizeStart = radius * 0.08; s.sizeEnd = radius * 0.26 * profile.flash;
      s.opacity = 1; s.fadeIn = 0.02; s.drag = 8;
      s.colorA = VFX_PALETTE.flashCore; s.colorB = VFX_PALETTE.fireHot;
      s.seed = this.random();
      this.pools.fire.Spawn(s, this.time);
    }

    // A single evolving 3D field carries blast expansion and the cooling cloud.
    // Fragmentation keeps only the brief flash above; sustained emission belongs to fuel.
    const volumeArt=EXPLOSION_VOLUME_ART[kind]||EXPLOSION_VOLUME_ART.grenade;
    this.lastExplosionSprite.volume=this.particles.VolumeBurst([position.x,position.y,position.z],{
      ...volumeArt,size:scale*volumeArt.scale,seed:Math.floor(this.random()*4294967295),
    });

    // 3) 贴地尘环（两圈错开，前一圈快、后一圈慢）
    for (let i = 0; i < (profile.rings ?? 2); i += 1) {
      const s = ResetSpawn();
      s.x = position.x; s.y = ground + 0.08 + i * 0.05; s.z = position.z;
      s.nx = 0; s.ny = 1; s.nz = 0;
      s.life = 0.9 + i * 0.5;
      s.sizeStart = radius * 0.2;
      // 环的可见半径约是这个半宽的 0.72 倍，1.05 差不多正好铺到杀伤半径外沿
      s.sizeEnd = radius * (1.05 + i * 0.4);
      s.opacity = 0.22 - i * 0.07; s.fadeIn = 0.035;
      s.angle = this._Range(0, 3.14);
      s.colorA = VFX_PALETTE.dust; s.colorB = VFX_PALETTE.dustDense;
      s.seed = this.random();
      this.pools.ring.Spawn(s, this.time);
    }

    // 4) 抛射碎块
    const chunkCount = Math.round(profile.chunks * this.spawnScale);
    for (let i = 0; i < chunkCount; i += 1) {
      const a = this.random() * 6.2831853;
      const up = this._Range(0.35, 1.5);
      const speed = this._Range(3.5, 11) * scale;
      const size = this._Range(0.02, 0.075) * scale;
      this._SpawnDebris(
        position.x, position.y + 0.1, position.z,
        Math.cos(a) * speed, up * speed * 0.8, Math.sin(a) * speed,
        size, size * this._Range(0.5, 1.0), size * this._Range(0.8, 2.2),
        this.random() < profile.sooty ? VFX_PALETTE.woodBurnt : VFX_PALETTE.brick,
        this._Range(0.9, 1.8), ground, 0.3, this._Range(1.6, 3.2));
    }

    // 5) 火星（战车/炮弹才明显）
    const sparkCount = Math.round(profile.sparks * this.spawnScale);
    for (let i = 0; i < sparkCount; i += 1) {
      const s = ResetSpawn();
      const a = this.random() * 6.2831853;
      const speed = this._Range(4, 14) * scale;
      s.x = position.x; s.y = position.y + 0.1; s.z = position.z;
      s.vx = Math.cos(a) * speed; s.vy = this._Range(2, 9); s.vz = Math.sin(a) * speed;
      s.ay = -9.8; s.drag = 0.9;
      s.life = this._Range(0.4, 1.1);
      s.sizeStart = 0.016; s.sizeEnd = 0.005;
      s.stretch = this._Range(0.2, 0.6);
      s.opacity = 1; s.fadeIn = 0.02; s.groundY = ground;
      s.colorA = VFX_PALETTE.sparkHot; s.colorB = VFX_PALETTE.sparkCool;
      s.seed = this.random();
      this.pools.streak.Spawn(s, this.time);
    }

    // Persistent blast discoloration belongs to TerrainDeformationView's soil
    // material. A horizontal scorch quad stays at the OLD ground elevation:
    // after excavation its depth tolerance cuts concentric bands into the pit
    // walls, and repeated blasts stack those slices at successive heights.
    // Impact() still uses small surface decals for ordinary bullet holes.
  }

  /**
   * 航空炸弹落地（2026-09-28；第一关轮番轰炸经 BattleSound.BombVisual 调）。尺度全按装药立方根
   *（Script_BombBallistics.BlastScale，数在 Data_AerialBombs）：闪光、火球与一圈尘环走 Explosion 的 bomb 档，
   * 其余五层画在 bombSmoke 专用池里 ——
   *   冲击环    地面上一圈极快外扩的浮土，差不多音速，到 shockR = 18·∛W 处消失；
   *   抛射土柱   倒锥形抛射幕：每条的头是一团沿弹道飞的土（重力 + 线性阻尼，与着色器同一条闭式解），
   *             沿途按它**那一刻的位置**预排几团土（延时出生），连起来就是一条条弯下去的土柱；
   *             斜着砸进去的弹，下游一侧抛得多；
   *   中心土柱   竖直冲上去的尘土，阻尼减速、重的往回落；
   *   底涌尘浪   贴地向外滚的一圈尘，外沿到 surgeR；
   *   久留烟团   一两秒后在土柱半高处成形、慢慢上浮随风飘十几二十秒，一轮炸完落区上空压着一片。
   * budget < 1 时每层团数按比例摊薄（一轮几十颗时由调用方给）。返回这一颗的取证。
   */
  BombBlast(position, { chargeKg = 22, groundY = null, budget = 1, dirX = 0, dirZ = 0 } = {}) {
    const V = BOMB_BLAST_VFX, S = BlastScale(chargeKg);
    const ground = groundY ?? position.y;
    const cx = position.x, cz = position.z, now = this.time;
    const pool = this.pools.bombSmoke;
    const rel = S.cube / 2.8;                           // 相对 50 kg 级
    const scale = this.spawnScale * Math.max(0.05, Math.min(1, budget));
    const count = (base) => Math.max(1, Math.round(base * scale));
    const h = Math.hypot(dirX, dirZ), fx = h > 1e-3 ? dirX / h : 0, fz = h > 1e-3 ? dirZ / h : 0;
    const wind = this.wind;

    // 0) 闪光、火球、尘环。
    this.Explosion({ x: cx, y: ground + 0.3 * rel, z: cz }, { radius: S.visualRadius, kind: "bomb", groundY: ground });

    // 1) 冲击环：尘环的可见半径约是半宽的 0.72 倍；寿命按音速跑完 shockR 再留一点收尾。
    {
      const s = ResetSpawn();
      s.x = cx; s.y = ground + 0.12; s.z = cz;
      s.nx = 0; s.ny = 1; s.nz = 0;
      s.life = Math.max(0.18, 1.5 * S.shockR / 340);
      s.sizeStart = S.craterR; s.sizeEnd = S.shockR / 0.72;
      s.opacity = 0.42; s.fadeIn = 0.01;
      s.angle = this._Range(0, 3.14);
      s.colorA = VFX_PALETTE.dustPale; s.colorB = VFX_PALETTE.dust;
      s.seed = this.random();
      this.pools.ring.Spawn(s, now);
    }

    // 2) 抛射土柱。
    const streamers = count(V.streamerBase + V.streamerPerCube * S.cube);
    const trail = Math.max(1, Math.round(V.trailPuffs * Math.min(1, scale + 0.3)));
    const gravity = BOMB_GRAVITY, head = BOMB_HEAD;
    const a0 = this.random() * Math.PI * 2;
    for (let i = 0; i < streamers; i += 1) {
      const az = a0 + (i + this._Signed(0.35)) * (Math.PI * 2 / streamers);
      let hx = Math.cos(az) + fx * V.downrangeBias, hz = Math.sin(az) + fz * V.downrangeBias;
      const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      const el = this._Range(V.elevationDeg[0], V.elevationDeg[1]) * Math.PI / 180;
      const v = this._Range(S.ejectaV[0], S.ejectaV[1]);
      const p0 = { x: cx + hx * S.craterR * 0.4, y: ground + 0.4, z: cz + hz * S.craterR * 0.4 };
      const v0 = { x: hx * Math.cos(el) * v, y: Math.sin(el) * v, z: hz * Math.cos(el) * v };
      const k = V.clodDrag;
      // 头：一团暗土沿弹道飞，落回地面那一刻熄掉（烟池没有地面回弹）。牛顿迭代求落地时刻。
      let flight = 2 * v0.y / BOMB_GRAVITY_G;
      for (let it = 0; it < 4; it += 1) {
        LinearDragAt(p0, v0, gravity, k, flight, head);
        flight = Math.max(0.3, flight - (head.y - ground) / Math.min(-1, head.vy));
      }
      {
        const s = ResetSpawn();
        s.x = p0.x; s.y = p0.y; s.z = p0.z;
        s.vx = v0.x; s.vy = v0.y; s.vz = v0.z;
        s.ay = gravity.y; s.drag = k;
        s.life = flight;
        const size = this._Range(V.clodM[0], V.clodM[1]) * rel;
        s.sizeStart = size; s.sizeEnd = size * 1.5;
        s.opacity = 0.55; s.fadeIn = 0.02;
        s.stretch = 0.4;
        s.colorA = VFX_PALETTE.soil; s.colorB = VFX_PALETTE.dustDense;
        s.seed = this.random();
        pool.Spawn(s, now);
      }
      // 尾：沿途几团土，头飞到哪儿才在哪儿出生（延时出生），带走一小截速度，随后慢慢沉、随风散。
      // 头一团贴着弹坑，其余沿整条弧线铺开（头在烟池里过半寿命就开始淡，弧线靠尾巴画出来）。
      for (let m = 0; m < trail; m += 1) {
        const tau = 0.04 + flight * V.trailSpan * (m / trail) * this._Range(0.85, 1.1);
        if (tau >= flight) break;
        const at = LinearDragAt(p0, v0, gravity, k, tau, head);
        const s = ResetSpawn();
        s.x = at.x; s.y = at.y; s.z = at.z;
        s.vx = at.vx * 0.22 + wind.x; s.vy = at.vy * 0.22; s.vz = at.vz * 0.22 + wind.z;
        s.ax = wind.x * 0.3; s.ay = -0.6; s.az = wind.z * 0.3;
        s.drag = 1.1;
        s.life = this._Range(4, 6.5) * (0.8 + 0.2 * rel);
        s.sizeStart = V.trailSizeM[0] * (1 + m * 0.25) * rel;
        s.sizeEnd = V.trailSizeM[1] * this._Range(0.75, 1.15) * rel * (1 + m * 0.12);
        s.opacity = V.trailOpacity - m * 0.07; s.fadeIn = 0.05;
        s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.4);
        s.colorA = m === 0 ? VFX_PALETTE.blackCore : VFX_PALETTE.dustDense; s.colorB = VFX_PALETTE.soil;
        s.seed = this.random();
        pool.Spawn(s, now + tau);
      }
    }

    // Bulk soil expansion and the ground surge are the DustImpact volume
    // emitted above. Keep ballistic streamers, without stacking giant puff balls.
    const columnN=0,surgeN=0;

    // 5) The cooling explosion field replaces a stack of oversized spherical caps.
    const capN=1,top=S.columnV[1]/.85,capLife=(V.capLifeS[0]+V.capLifeS[1])*.5,cap=V.capVolume;
    this.particles.VolumeBurst([cx,ground+top*V.capHeightU[0],cz],{
      asset:'GroundExplosion',size:rel,life:capLife,speed:PARTICLE_VOLUME_ASSETS.GroundExplosion.duration/capLife,
      bounds:cap.boundsScale.map(n=>n*V.capSizeM[1]),density:cap.density/Math.max(.5,rel),
      emission:0,flameExtinction:0,delay:cap.delay,fadeIn:cap.fadeIn,velocity:[wind.x*cap.wind,cap.rise,wind.z*cap.wind],
      seed:Math.floor(this.random()*4294967295),
    });

    this.bombBlasts = (this.bombBlasts || 0) + 1;
    this.lastBombBlast = { chargeKg: S.chargeKg, budget, radius: S.visualRadius, shockR: S.shockR, surgeR: S.surgeR,
      ejectaV: S.ejectaV, streamers, trail, column: columnN, surge: surgeN, cap: capN };
    return this.lastBombBlast;
  }

  /**
   * 抛壳。尺寸按真实弹壳给（7.92×57 就是 7.9 mm × 57 mm）—— 做大了会立刻假。
   * @param {*} caliber 数字(mm) 或 "7.92×57mm" / "7.92" 这类字符串
   */
  ShellCasing(position, direction, caliber = "7.92") {
    const key = typeof caliber === "number"
      ? caliber.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
      : String(caliber).split(/[×x* ]/)[0];
    const size = CASING_SIZES[key] || CASING_SIZES["7.92"];
    const dir = TMP_A.copy(direction).normalize();
    const speed = this._Range(1.8, 3.2);
    this.SpawnChunk('casing',
      position.x, position.y, position.z,
      dir.x * speed + this._Signed(0.4),
      dir.y * speed + this._Range(0.8, 1.8),
      dir.z * speed + this._Signed(0.4),
      size[0], size[0], size[1],
      VFX_PALETTE.brass, this._Range(...PARTICLE_MESH.casingLife), this.groundLevel, 0.42,
      this._Range(8, 18));                    // 弹壳出膛是翻着飞的，转速要高
  }

  /**
   * 持续冒烟源（烧着的房子、烧毁的战车、发烟筒）。
   * @returns {number} handle，交给 RemoveSmokeSource
   */
  SmokeSource(position, opts = {}) {
    const id = this.nextSourceId;
    this.nextSourceId += 1;
    const kind = opts.kind || "dust";
    const palette = kind === "black"
      ? [VFX_PALETTE.blackCore, VFX_PALETTE.blackSmoke]
      : kind === "screen"
        ? [VFX_PALETTE.screenSmoke, VFX_PALETTE.powderThin]   // 发烟筒：白灰，贴地翻滚
        : [VFX_PALETTE.dustDense, VFX_PALETTE.dust];
    const source = {
      kind,
      seed: opts.backdrop?.seed ?? id * 7919,
      position: new THREE.Vector3(position.x, position.y, position.z),
      rate: (opts.rate ?? 10) * this.spawnScale,
      radius: opts.radius ?? 0.35,
      rise: opts.rise ?? (kind === "screen" ? 0.35 : 1.5),
      sizeStart: opts.sizeStart ?? 0.35,
      sizeEnd: opts.sizeEnd ?? (kind === "screen" ? 2.4 : 3.0),
      life: opts.life ?? 4.5,
      opacity: opts.opacity ?? 0.42,
      // 黑烟是持续上升的羽流，不能套爆炸烟“半程已膨到终值”的曲线。
      // turbulence 让每个烟团以不同相位轻轻摆动：层级来自上升流，不是堆
      // 更大的黑色透明片。发烟筒仍略快一些，让贴地扩散读得出来。
      growthPower: opts.growthPower ?? (kind === "black" ? 0.82 : kind === "screen" ? 1.35 : 2.0),
      turbulence: opts.turbulence ?? (kind === "black" ? 0.28 : 0),
      // An optional local drift leaves the shared wind and all combat FX intact.
      wind: opts.wind ? { x: opts.wind.x, z: opts.wind.z } : null,
      prewarm: !!opts.prewarm,
      prewarmPending: !!opts.prewarm,
      backdrop: opts.backdrop || null,
      fire: opts.fire ?? 0,
      firePosition: opts.firePosition ? new THREE.Vector3(opts.firePosition.x,opts.firePosition.y,opts.firePosition.z) : null,
      nearLight: !!opts.nearLight,
      nearLightActive: false,
      fireShape: opts.fireShape === "column" ? "column" : "ground",
      colorA: opts.colorA || palette[0],
      colorB: opts.colorB || palette[1],
      groundHug: kind === "screen",
      accumulator: 0,
      lightHandle: -1,
      lightProfile: null,
    };
    if (source.fire > 0 && (opts.light !== false || source.nearLight) && this.lights) {
      const fireScale = Math.max(0, Number(source.fire) || 0);
      const lightPosition = (source.firePosition || source.position).clone();
      lightPosition.y += opts.lightHeight
        ?? Math.max(0.38, Math.min(1.8, source.sizeStart * 1.4 + fireScale * 0.35));
      const lightIntensity = opts.lightIntensity
        ?? Math.max(4, Math.min(28,
          3 + 12 * fireScale * Math.sqrt(Math.max(0.25, source.radius))));
      const lightRadius = opts.lightRadius
        ?? Math.max(10, Math.min(34, 8 + source.radius * 8 + fireScale * 8));
      const lightColor = opts.lightColor
        ?? (source.fireShape === "column" ? 0xff8a2a : 0xff681c);
      source.lightProfile = {
        position: lightPosition, intensity: lightIntensity, radius: lightRadius, color: lightColor,
      };
      if(source.nearLight) Object.assign(source.lightProfile,{
        position:(source.firePosition||source.position).clone().add(new THREE.Vector3(0,BURNING_LIGHT.height,0)),
        intensity:BURNING_LIGHT.intensity*Math.sqrt(fireScale),radius:BURNING_LIGHT.radius,color:BURNING_LIGHT.color,
      });
      this.AttachSourceLight(source);
    }
    this.smokeSources.set(id, source);
    if (source.backdrop) {
      this.battleSmoke ||= new BattleSmoke({ root: this.root, shared: this.shared, quality: this.quality,particles:this.particles });
      this.battleSmoke.Set(id, source);
    }
    else if(opts.volume&&source.rate>0){
      const spec=StaticSmokeModules(source,source.wind||this.wind),id=this.particles.Create(spec).id;source.volumeSmokeHandles=[id];
      if(!source.wind)this.particles.Get(id).volumeWindBase=spec.modules.main.startRotation;
    }
    if (source.fire > 0) source.particleHandles = this.particles.Burning(source, this.spawnScale);
    return id;
  }

  /** 特效编辑器隔离正片火场时使用；逻辑烟源与粒子状态不动，只摘/挂直接光。 */
  AttachSourceLight(source) {
    if (!source || source.lightHandle >= 0 || !source.lightProfile || !this.lights || (source.nearLight&&!source.nearLightActive)) {
      return source?.lightHandle ?? -1;
    }
    const profile = source.lightProfile;
    source.lightHandle = this.lights.AddFire(profile.position, profile);
    return source.lightHandle;
  }

  DetachSourceLight(source) {
    if (!source || source.lightHandle < 0 || !this.lights) return;
    this.lights.RemoveFire(source.lightHandle);
    source.lightHandle = -1;
  }

  UpdateBurningLights() {
    if(!this.lights)return;
    const candidates=[];
    for(const source of this.smokeSources.values())if(source.nearLight&&source.lightProfile){
      const distance=source.lightProfile.position.distanceToSquared(this.eye);
      if(distance<BURNING_LIGHT.viewDistance**2)candidates.push({source,distance});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    const selected=new Set(candidates.slice(0,BURNING_LIGHT.count).map(v=>v.source));
    for(const source of this.smokeSources.values())if(source.nearLight){
      source.nearLightActive=selected.has(source);
      if(source.nearLightActive)this.AttachSourceLight(source);else this.DetachSourceLight(source);
    }
  }

  /**
   * 把一个烟源挪到别处。**会动的发烟体**（照明弹伞降的微烟迹、燃烧着往下掉的
   * 残骸）用它 —— 已经生成的粒子留在原地不动，新粒子从新位置出，那条「迹」
   * 就是这么来的。每帧 Remove+Add 得不到这个效果：那样每帧只剩一团。
   * 挂了直接光的烟源（fire > 0）连灯一起挪。
   * @returns {boolean} 这个句柄还在不在
   */
  MoveSmokeSource(handle, position) {
    const source = this.smokeSources.get(handle);
    if (!source || !position) return false;
    // 灯按**位移**跟着走，不是直接对齐：SmokeSource 建灯时给了一段抬高
    // （火头比烟根高），照抄坐标会把那段抬高抹掉。
    const dx = position.x - source.position.x;
    const dy = position.y - source.position.y;
    const dz = position.z - source.position.z;
    source.position.set(position.x, position.y, position.z);
    if (source.firePosition) source.firePosition.add(new THREE.Vector3(dx, dy, dz));
    const fireOrigin = source.firePosition || source.position;
    for (const id of source.particleHandles || []) if(this.particles.systems.has(id))this.particles.Move(id, fireOrigin.toArray());
    for (const id of source.volumeSmokeHandles || []) if(this.particles.systems.has(id))this.particles.Move(id,source.position.toArray());
    if (source.backdrop) this.battleSmoke?.Set(handle, source);
    if (source.lightProfile) {
      source.lightProfile.position.x += dx;
      source.lightProfile.position.y += dy;
      source.lightProfile.position.z += dz;
      if (source.lightHandle >= 0 && this.lights) {
        this.lights.UpdateFire?.(source.lightHandle, { position: source.lightProfile.position });
      }
    }
    return true;
  }

  RemoveSmokeSource(handle) {
    const source = this.smokeSources.get(handle);
    this.DetachSourceLight(source);
    this.smokeSources.delete(handle);
    if (source?.backdrop) this.battleSmoke?.Remove(handle);
    for (const id of source?.particleHandles || []) if(this.particles.systems.has(id))this.particles.Remove(id);
    for (const id of source?.volumeSmokeHandles || []) if(this.particles.systems.has(id))this.particles.Remove(id);
  }

  /** 按统一目录创建可序列化的场景持续特效。 */
  SceneEffect(position, id, { scale = 1 } = {}) {
    const effect = SCENE_EFFECTS[id];
    if (!effect) return 0;
    const size = Math.max(0.15, Number.isFinite(scale) ? scale : 1);
    const options = { ...effect.options, volume:true };
    for (const key of ["radius", "sizeStart", "sizeEnd"]) {
      if (options[key] != null) options[key] *= size;
    }
    if (options.rate != null) options.rate *= Math.max(0.45, size);
    if (options.fire != null) options.fire *= Math.sqrt(size);
    return this.SmokeSource(position, options);
  }

  RemoveSceneEffect(handle) { this.RemoveSmokeSource(handle); }

  /**
   * 空气里的浮尘。只保留很淡的环境层；方向性太阳拖影由后处理负责。
   * @param {THREE.Box3} box 战斗区域；微粒盒会跟着相机走但被夹在这个范围内
   * @param {number} density 每立方米微粒数（0.04—0.12 是合适的量）
   */
  AmbientDust(box, density = 0.06) {
    const capacity = Math.max(32, Math.round(this.budget * POOL_SHARE.dust * this.preset.dust));
    TMP_A.set(0, 0, 0);
    let cell = TMP_A.set(30, 9, 30);
    if (box && box.isBox3) {
      this.dustBox = box.clone();
      box.getSize(TMP_B);
      cell = TMP_A.set(Math.min(TMP_B.x, 34), Math.min(Math.max(TMP_B.y, 3), 12), Math.min(TMP_B.z, 34));
    } else {
      this.dustBox = null;
    }
    const volume = Math.max(1, cell.x * cell.y * cell.z);
    const count = Math.max(32, Math.min(capacity, Math.round(volume * density)));

    if (this.dust) { this.root.remove(this.dust.mesh); this.dust.Dispose(); }
    this.dust = this.particles.Motes(cell.toArray(),count);
    return count;
  }

  /** Shared blood pipeline: mist, ballistic droplets, surface projection and corpse seepage. */
  Blood(position,direction,amount=1){this.bloodEffects.Emit(position,direction,amount);}
  BloodBurst(position,direction,amount=1.6){this.bloodEffects.Emit(position,direction,amount,true);}
  /** 爆头血：出口血雾＋长血滴扇面＋入口回溅；给了 soldier 就再从头部按心跳泵几秒（BLOOD_HEADSHOT）。 */
  HeadshotBlood(position,direction,soldier=null){
    const actor=soldier?.actor,rig=actor?.characterRig,node=rig?.hitboxNodes?.headCenter||rig?.bones?.head||actor?.head||null;
    // 头已经卸掉（断肢链自带断口泵血）或人在远景层（骨架摘出场景）就不再挂伤口源。
    const attach=node&&!soldier?.gore?.limbs?.has?.("head")&&actor?.root?.parent?node:null;
    return this.bloodEffects.Headshot(position,direction,{node:attach,root:actor?.root||null});
  }
  BloodSpurt(node,offset,direction,options={}){return this.bloodEffects.Spurt(node,offset,direction,options);}
  RemoveBloodSpurt(handle){this.bloodEffects.sources.delete(handle);}
  get bloodSpurtCount(){return this.bloodEffects.sources.size;}
  CorpseBlood(actor){return this.bloodEffects.Corpse(actor);}
  CreateBloodDecalLayer(parent,capacity){return this.bloodEffects.CreateLayer(parent,capacity);}
  SetBloodSurface(raycast){this.bloodEffects.raycast=raycast;}

  /**
   * 炮弹 / 掷弹筒落点预警。掷弹筒 1.6 s、炮兵 2.6 s 提前量：玩家要能"听到啸声、
   * 看见地上一枚收拢的准星"然后跑开。准星（贴图线稿 + 程序化收缩环 + 中心亮核）由
   * marker 池的一张 quad 全程演完；外圈半径按杀伤半径给，看得出这一发大概波及多大。
   * @param {{x:number,y:number,z:number}} position 落点（已贴地）
   * @param {number} secondsToImpact 距落地秒数 = 粒子寿命
   * @param {{radius?:number}} [options] radius 为该弹种的杀伤半径（米）
   */
  IncomingMarker(position, secondsToImpact = 1.5, { radius = 5 } = {}) {
    const life = Math.max(0.35, secondsToImpact);
    const outer = Math.min(4.2, Math.max(2.4, radius * 0.5));
    const s = ResetSpawn();
    s.x = position.x; s.y = position.y + 0.04; s.z = position.z;
    s.nx = 0; s.ny = 1; s.nz = 0;
    s.life = life; s.sizeStart = outer; s.sizeEnd = outer;   // 收拢在着色器里做，quad 不动
    s.opacity = 1; s.fadeIn = 0.06; s.flicker = 0;
    s.angle = this._Range(0, 6.283); s.spin = 0.22;          // 准星慢转，虚线才"活"
    s.colorA = VFX_PALETTE.markerWarn; s.colorB = VFX_PALETTE.markerWarn;
    s.seed = this.random();
    this.pools.marker.Spawn(s, this.time);
    // 外圈附近几团低矮的土尘被往落点方向"吸"：弹体下压的气流先于爆炸到地面，
    // 这是整套预警里唯一贴近物理的一笔。很淡，只负责让准星像长在地上而不是贴在地上。
    const puffs = Math.max(2, Math.round(3 * this.spawnScale));
    for (let i = 0; i < puffs; i += 1) {
      const a = this._Range(0, 6.283), r = outer * this._Range(0.55, 0.85);
      const d = ResetSpawn();
      d.x = position.x + Math.cos(a) * r; d.y = position.y + 0.12; d.z = position.z + Math.sin(a) * r;
      d.vx = -Math.cos(a) * 0.45; d.vy = 0.22; d.vz = -Math.sin(a) * 0.45;
      d.life = life; d.sizeStart = 0.45; d.sizeEnd = 1.5; d.drag = 1.6;
      d.opacity = 0.12; d.fadeIn = 0.3; d.spin = this._Signed(0.6); d.angle = this._Range(0, 6.283);
      d.colorA = VFX_PALETTE.dust; d.colorB = VFX_PALETTE.dustDense; d.seed = this.random();
      this.pools.smoke.Spawn(d, this.time);
    }
    // 落点正上方一缕更细的尘往上走，提示"有东西正在下来"
    const c = ResetSpawn();
    c.x = position.x; c.y = position.y + 0.15; c.z = position.z;
    c.life = life; c.sizeStart = 0.22; c.sizeEnd = 0.7;
    c.opacity = 0.16; c.fadeIn = 0.25; c.drag = 6; c.vy = 0.3;
    c.colorA = VFX_PALETTE.dust; c.colorB = VFX_PALETTE.dustDense; c.seed = this.random();
    this.pools.smoke.Spawn(c, this.time);
  }

  /**
   * 把**还活着的一次性粒子**一把清空（烟、火、环、曳光、弹着、血雾、贴花、碎块）。
   *
   * 【2026-09-09 为什么需要它】着色器预热是**在镜头前三米真炸一发**
   *（见 Script_Main.WarmLevel：dt=0 的帧里粒子不会活，只能真放一发让 ANGLE
   * 把那批像素着色器变体编出来）。可它们活得比预热长 —— 玩家点「进城」的那一刻
   * 火球还在烧：实测交出控制权的第一帧 smoke 37 / debris 22 / ring 2 / streak 4 /
   * decal 3，整整两秒半，第一眼就是一团糊在脸上的火。用户报的「一开始就有爆炸
   * 在我脸上」就是这个 —— 与音频无关，我上一轮全找错了地方。
   *
   * 只清粒子，**不动 smokeSources**：那些是常驻发射器（烧着的房子），清了下一帧
   * 它们自己又会补上，白清一次。
   */
  ClearParticles() {
    for (const pool of Object.values(this.pools || {})) pool.Clear?.();
    this.battleSmoke?.ClearParticles();
    this.particles?.Restart();
    // Warm-up clears combat bursts. Established backdrop fires rebuild on the
    // next live update, using its clock (including a checkpoint's reset clock).
    for (const source of this.smokeSources.values()) source.prewarmPending = source.prewarm;
    this.debris?.Clear?.();
    for (const pool of Object.values(this.chunks || {})) pool.Clear();
    // 血源与 smokeSources 不同：它挂在一根**已经不在场上**的骨头上，清粒子那一刻
    // 那个断口八成也随着换关拆掉了，留着只会在下一关的原点冒血。
    this.bloodEffects.Clear();
  }

  Dispose() {
    this.battleSmoke?.Dispose();
    this.particles.Dispose();
    if (this.scene.onBeforeRender === this.sceneHook) {
      this.scene.onBeforeRender = this.previousSceneHook;
    }
    this.bloodEffects.Dispose();
    this.scene.remove(this.root);
    for (const pool of Object.values(this.pools)) pool.Dispose();
    this.debris.Dispose();
    for (const pool of Object.values(this.chunks)) pool.Dispose();
    if (this.dust) this.dust.Dispose();
    for (const texture of this.explosionSpriteTextures.values()) texture.dispose();
    this.explosionSpriteTextures.clear();
    this.loadedExplosionSprites.clear();
    for (const texture of this.bulletDecalTextures.values()) texture.dispose();
    this.bulletDecalTextures.clear();
    this.loadedBulletDecalMaps.clear();
    for (const texture of this.vefectsTextures.values()) texture.dispose();
    this.vefectsTextures.clear();
    if (this.markerTexture) this.markerTexture.dispose();
    this.markerTexture = null;
    this.loadedVefectsMasks.clear();
    if (this.spritePlaceholder) this.spritePlaceholder.dispose();
    if (this.spriteTransparentPlaceholder) this.spriteTransparentPlaceholder.dispose();
    if (this.maskTransparentPlaceholder) this.maskTransparentPlaceholder.dispose();
    if (this.decalNormalPlaceholder) this.decalNormalPlaceholder.dispose();
    if (this.decalOrmPlaceholder) this.decalOrmPlaceholder.dispose();
    this.fallbackDepth.dispose();
    for (const source of this.smokeSources.values()) {
      this.DetachSourceLight(source);
    }
    this.smokeSources.clear();
    this.bloodSpurts.clear();
    this.dust = null;
  }

  // --- 内部 -----------------------------------------------------------------

  _Range(a, b) { return a + (b - a) * this.random(); }
  _Signed(scale) { return (this.random() * 2 - 1) * scale; }

  /** 以 axis 为中心、halfAngle 张角的锥形速度，结果写进 TMP_B。 */
  _ConeVelocity(axis, spread, speed) {
    const ax = axis.x, ay = axis.y, az = axis.z;
    // 取一个与 axis 不共线的参考轴构正交基（axis 接近 ±Y 时换一根，否则叉积退化）
    const gx = Math.abs(ay) > 0.9 ? 1 : 0;
    const gy = Math.abs(ay) > 0.9 ? 0 : 1;
    let tx = gy * az - 0 * ay;
    let ty = 0 * ax - gx * az;
    let tz = gx * ay - gy * ax;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const bx = ay * tz - az * ty;
    const by = az * tx - ax * tz;
    const bz = ax * ty - ay * tx;
    const angle = this.random() * 6.2831853;
    const r = Math.sqrt(this.random()) * spread;
    const dx = ax + (tx * Math.cos(angle) + bx * Math.sin(angle)) * r;
    const dy = ay + (ty * Math.cos(angle) + by * Math.sin(angle)) * r;
    const dz = az + (tz * Math.cos(angle) + bz * Math.sin(angle)) * r;
    const dl = Math.hypot(dx, dy, dz) || 1;
    TMP_B.set(dx / dl * speed, dy / dl * speed, dz / dl * speed);
    return TMP_B;
  }

  _SpawnDebris(x, y, z, vx, vy, vz, sx, sy, sz, color, life, groundY, bounce, spinRate) {
    const d = DEBRIS_SPAWN;
    d.x = x; d.y = y; d.z = z;
    d.vx = vx; d.vy = vy; d.vz = vz;
    d.sx = sx; d.sy = sy; d.sz = sz;
    d.color = color; d.life = life; d.groundY = groundY;
    d.bounce = bounce; d.drag = 0.55; d.seed = this.random();
    d.rx = this._Signed(spinRate); d.ry = this._Signed(spinRate); d.rz = this._Signed(spinRate);
    this.debris.Spawn(d, this.time);
  }

  /**
   * 一块不规则碎块（开场近爆）：kind = "clod"（土块）/ "splinter"（木片），参数与 _SpawnDebris 相同。
   * 没有这只池（或 kind 写错）就退回方块池，调用方不用分情况。
   */
  SpawnChunk(kind, x, y, z, vx, vy, vz, sx, sy, sz, color, life, groundY, bounce, spinRate) {
    const pool = this.chunks?.[kind];
    if (!pool) { this._SpawnDebris(x, y, z, vx, vy, vz, sx, sy, sz, color, life, groundY, bounce, spinRate); return; }
    const d = DEBRIS_SPAWN;
    d.x = x; d.y = y; d.z = z;
    d.vx = vx; d.vy = vy; d.vz = vz;
    d.sx = sx; d.sy = sy; d.sz = sz;
    d.color = color; d.life = life; d.groundY = groundY;
    d.bounce = bounce; d.drag = 0.55; d.seed = this.random();
    d.rx = this._Signed(spinRate); d.ry = this._Signed(spinRate); d.rz = this._Signed(spinRate);
    pool.Spawn(d, this.time);
  }

  /** 弹孔贴花：原位贴面；polygonOffset 负责防 z-fighting，深度预通道负责裁悬空边。 */
  _SpawnDecal(position, normal, size, rim, hole, opacity = 0.85, rays = 1, variant = 0) {
    const s = ResetSpawn();
    s.x = position.x;
    s.y = position.y;
    s.z = position.z;
    s.nx = normal.x; s.ny = normal.y; s.nz = normal.z;
    s.life = 1e5;                       // 一关打不完；超上限由环形缓冲先进先出淘汰
    s.sizeStart = size; s.sizeEnd = size;
    s.opacity = opacity; s.fadeIn = 0;
    s.stretch = rays;                    // 贴花池里 stretch 复用为放射线强度
    s.frame = Math.min(2, Math.max(0, variant | 0)); // PBR 图集列：普通 A/B、机枪
    s.angle = this._Range(0, 6.283);
    s.colorA = rim; s.colorB = hole;
    s.seed = this.random();
    this.pools.decal.Spawn(s, this.time);
  }

  _SpawnSourceSmoke(source, birthTime = this.time) {
    const wind = source.wind || this.wind;
    const s = ResetSpawn();
    const a = this.random() * 6.2831853;
    const r = Math.sqrt(this.random()) * source.radius;
    s.x = source.position.x + Math.cos(a) * r;
    s.y = source.position.y + this._Range(0, 0.15);
    s.z = source.position.z + Math.sin(a) * r;
    s.vx = this._Signed(0.25) + wind.x * 0.4;
    s.vy = source.rise * this._Range(0.7, 1.3);
    s.vz = this._Signed(0.25) + wind.z * 0.4;
    s.ax = wind.x * 0.5;
    // 发烟筒是贴地翻滚的：浮力压到接近零，让它铺开而不是升柱
    //
    // 事故：升柱那一支原来是 drag 1.3 配固定浮力 0.42 —— 闭式解的终速是 a/k，
    // 也就是 0.32 m/s，rise 给到 3.4 也没用，初速在半秒内就被阻尼吃干净。
    // 实测九秒寿命的"烟柱"最高只爬到 6.6 m，而同一片子膨到 11 m 半径：
    // 宽度是高度的三倍多，柱子变成一颗球，几百片叠在一起 alpha 直接饱和。
    // 天上那个越长越大的黑球就是这么来的（另一半原因是没有大气透视）。
    // 浮力改成跟着 rise 走（a = rise·k），终速就等于 rise，柱子才真的是柱子。
    s.ay = source.groundHug ? 0.05 : source.rise * BUOYANT_DRAG;
    s.az = wind.z * 0.5;
    s.drag = source.groundHug ? 0.9 : BUOYANT_DRAG;
    // 标准烟团不走 GROUND_BOUNCE，故 iExtra.z 可安全作为羽流摇摆幅度。
    // 负值是 ResetSpawn 的“未启用”哨兵，别让枪烟与尘土也开始摇。
    s.groundY = source.turbulence > 0 ? source.turbulence : -9999;
    s.life = source.life * this._Range(0.75, 1.25);
    s.sizeStart = source.sizeStart;
    s.sizeEnd = source.sizeEnd * this._Range(0.8, 1.2);
    s.stretch = source.growthPower;
    s.opacity = source.opacity;
    s.fadeIn = Math.min(.18,PARTICLE_VOLUME.sourceFadeSeconds/s.life);
    s.angle = this._Range(0, 6.283); s.spin = this._Signed(0.55);
    s.colorA = source.colorA; s.colorB = source.colorB;
    s.seed = this.random();
    const useAuthoredSmoke = this.loadedVefectsMasks.has("smoke")
      && (this.loadedVefectsMasks.has("noise") || this.loadedVefectsMasks.has("detailNoise"));
    (useAuthoredSmoke ? this.pools.sourceSmoke : this.pools.smoke).Spawn(s, birthTime);
  }

  _UpdateSmokeSources(dt) {
    if (dt <= 0 || this.smokeSources.size === 0) return;
    for (const source of this.smokeSources.values()) {
      if (!source.backdrop&&!source.volumeSmokeHandles) {
        if (source.prewarmPending) {
          source.prewarmPending = false;
          const count = Math.ceil(source.rate * source.life * 1.25);
          for (let i = count - 1; i >= 0; i -= 1) {
            this._SpawnSourceSmoke(source, this.time - (i + 0.5) / source.rate);
          }
        }
        source.accumulator += source.rate * dt;
        const emit = Math.floor(source.accumulator);
        source.accumulator -= emit;
        for (let i = 0; i < emit; i += 1) this._SpawnSourceSmoke(source);
      }

    }
  }
}

// 01–03 过场分镜（Set 包 Script_OpeningBlastFx 的定向喷土）借同一份粒子生成描述符。
// 只加导出、不改旧函数（契约 docs/Data_FirstLevelStoryboard0103Contract.md §3）。
export { ResetSpawn as ResetVfxSpawn };
