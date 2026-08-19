// 1938 年 3 月 · 滕县城 —— 整座城的生成器。
//
// 数字全部来自 Data_Tengxian.mjs（那份文件里逐条带出处与「推定」标注），
// 这里只负责把它们变成几何、碰撞与导航面。**任何尺寸都不许在这个文件里另起炉灶。**
//
// ---------------------------------------------------------------------------
// 三条这座城独有的、不许为了「关卡好玩」放弃的空间事实：
//
//   ① **上城道全城只有四条**（每门内侧旁一条，宽 2.4 m）。
//      城墙是一条连续的、只有四个出入口的 11.5 m 高空回廊。
//      所以它必须在**碰撞上真的成立**：除这四条以外任何地方都上不去，
//      而这四条必须真的走得上去（台儿庄那次的教训是马道做成了一块斜板 +
//      一个实心大盒子，画面上是坡、碰撞上是墙，谁也上不去）。
//
//   ② **z=0 上不得有任何遮挡**：西城门楼 →西门里街 →十字街口 是一条通视直线走廊。
//      「日兵占领西城门楼后，即集中火力向城中心十字街口扫射」——
//      这条视线是全城崩溃的机制原因，也是王铭章殉国那一段的空间前提。
//      CheckSightCorridor() 每次生成完都要跑一遍，挡住了就是事故。
//
//   ③ **家家临街墙上有新掏的枪眼，边缘发白**。日方战详报反复点名
//      「敌一步一步利用房屋的枪眼，对道路纵射或侧射」——
//      这是滕县巷战的第一视觉符号，不是装饰。
//
// ---------------------------------------------------------------------------
// 性能：600×600 m 的方城 + 210×360 m 的东关密集院落，绘制量远超台儿庄的六关切片。
// 三条控住的手段：
//   · 静态几何按材质合批（BuildSink），一整座城落在三十来个 draw call 上；
//   · 三档 LOD：焦点附近做完整四合院，中距做简化院落，远景只做体块剪影；
//   · 远景那一档单独一个 sink，Flush 时 castShadow=false —— 阴影 pass 是
//     整帧三角形数的第二份拷贝，远处的剪影不值得占这一份。
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Mulberry32, HashString, Clamp, Clamp01, Fbm2, SmoothStep } from "./Script_Noise.mjs";
import {
  CITY, MOAT, GATES, BARBICAN, WALL_SIDES, BASTION, BASTIONS,
  CORNER_TOWERS, RAMPS, RAMP, DUGOUT, CROSSROAD, STREETS, SIGHT_CORRIDOR,
  LANDMARKS, OUTER_LANDMARKS, EAST_SUBURB, WEST_SUBURB, OUTSKIRTS, MARCH_GROUND,
  PALETTE, WALL_TOP_Y,
} from "./Data_Tengxian.mjs";
import {
  BuildSink, AddCityWall, AddBastion, AddCornerTower, AddCityRamp, AddDugout,
  AddLoopholes, AddGateComplex, AddYamen, AddPaifang, AddAlarmTower, AddSquareFort,
  AddChurch, AddPagoda, AddZhaiWall, AddCompound, AddRoomBlock, AddHardMountainRoof,
  AddTree,
} from "./Script_World.mjs";
import {
  MakeBox, MakePlane, MergeGeometries, PlaceGeometry, CarveCraters,
  MakeInstanced, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";

// ---------------------------------------------------------------------------
// 材质：逻辑名 → 既有烘焙配方 + 调色
//
// Script_TexBake.mjs 这一轮不归我改，而滕县要的是「同一张贴图的不同调色」——
// 城砖 #7A7F84（冷灰青）、民居青砖 #7E8388、条石 #B0ADA3（灰白偏冷）、
// 夯土芯 #A38F6C（暖黄）。MeshStandardMaterial.color 是**乘**在 albedo 上的，
// 所以只能往暗里调、不能往亮里调：条石的目标值比 BakeStone 的基色还亮一点，
// 这里只能给一个近白的冷调，靠光照把它抬到那个明度。这条限制记在交付说明里。
//
// 整城调性：灰青（城砖）× 灰白（条石）× 褐黄（夯土与裸地）× 骨灰褐（无叶乔木）。
// 比台儿庄更冷、更灰、更「石头」—— 因为滕县有大量石灰岩条石。
// ---------------------------------------------------------------------------
/** 往浮尘色里混一档：三月的鲁南春旱扬尘，什么颜色都蒙着一层灰。 */
function DustBlend(hex, amount, dust = 0x8A8076) {
  const mix = (a, b) => Math.round(a * (1 - amount) + b * amount);
  return (mix((hex >> 16) & 255, (dust >> 16) & 255) << 16)
    | (mix((hex >> 8) & 255, (dust >> 8) & 255) << 8)
    | mix(hex & 255, dust & 255);
}

const MATERIAL_MAP = {
  // 城墙一套
  CityBrick: { recipe: "BrickWall", color: 0xdde4ee, roughness: 1.0 },
  CityBrickWorn: { recipe: "BrickWallSooty", color: 0xe6eaf0 },
  Ashlar: { recipe: "Stone", color: 0xf4f6ff },
  RammedEarth: { recipe: "Adobe", color: 0xf0dcb4 },
  ZhaiEarth: { recipe: "Adobe", color: 0xe8d8ae },
  // 民居一套（鲁南：青砖 + 淡色过墙石交织，平原段大量土坯 + 麦秸泥）
  BrickWall: { recipe: "BrickWall", color: 0xe8ecf2 },
  BrickWallSooty: { recipe: "BrickWallSooty", color: 0xdfe2e6 },
  HouseBrick: { recipe: "BrickWall", color: 0xe8ecf2 },
  CrossStone: { recipe: "Stone", color: 0xfbfaf6 },
  Stone: { recipe: "Stone", color: 0xfbfaf6 },
  Adobe: { recipe: "Adobe", color: 0xf6e6c4 },
  RoofTile: { recipe: "RoofTile", color: 0xd8dde4 },
  // 城楼筒瓦：比民居小青瓦更深更冷
  TubeTile: { recipe: "RoofTile", color: 0xb6bfcb },
  WoodBeam: { recipe: "WoodBeam" },
  WoodDoor: { recipe: "WoodDoor" },
  Sandbag: { recipe: "Sandbag", color: 0xe4dcc0 },
  Ground: { recipe: "Ground" },
  GroundRubble: { recipe: "GroundRubble" },
  DirtRoad: { recipe: "Ground", color: 0xe9d9bb },
  // 枪眼白茬：新凿开的砖断口比风化面亮两档，这一圈白是滕县的第一符号
  LoopholeRim: { recipe: "Stone", color: 0xffffff },
  Willow: { recipe: "WoodBeam", color: 0xc09a86 },
};
// 纯色（没有对应烘焙配方的）
const PLAIN_MAP = {
  // 城楼彩画：1938 年应严重褪色、蒙尘、局部剥落 —— 用褪色值不是新漆的值
  // 色板给的已经是褪色值，但纯色材质没有纹理、读起来仍然太新。
  // 再往「蒙尘」(#8A8076) 里混三成半：1938 年的城楼彩画是严重褪色 + 蒙尘 + 局部剥落。
  PaintRed: { color: DustBlend(PALETTE.paintRed, 0.35), roughness: 0.92 },
  PaintGreen: { color: DustBlend(PALETTE.paintGreen, 0.35), roughness: 0.94 },
  IronPlate: { color: PALETTE.ironDoor, roughness: 0.62, metalness: 0.5 },
  Charred: { color: PALETTE.charred, roughness: 0.95 },
  Wheat: { color: PALETTE.wheat, roughness: 0.94 },
  MoatWater: { color: PALETTE.moatWater, roughness: 0.24, metalness: 0.0 },
};

/** 桶名 → 材质。传给 BuildSink.Flush 的 resolve 钩子。 */
export function ResolveTengxianMaterial(name, library) {
  const plain = PLAIN_MAP[name];
  if (plain) return library.Plain(name, plain);
  const spec = MATERIAL_MAP[name];
  if (!spec) return library.Get(name);              // 没登记的按配方名直接取
  const { recipe, ...options } = spec;
  return library.Get(recipe, options);
}

// ---------------------------------------------------------------------------
// 地形：城内台地 + 护城河环 + 城外原野
// ---------------------------------------------------------------------------

/**
 * 瓮城把护城河顶出去的那一段。
 *
 * 图纸给的两个数打架：瓮城半径 18 m 从墙脚（310）算过去到 328，
 * 而护城河内岸在 318 —— 直接建的话瓮城站在水里。
 * 真实城池的做法就是**濠在城门处外绕**（顺带承载桥与瓮城），所以这里让护城河
 * 在四座门前各往外让 16 m，让出瓮城 + 一圈 6 m 的马道。
 * 这是为了让两个史料数字同时成立的工程解，不是自己发挥。
 */
const GATE_BULGE = 16;
function MoatBulge(along) {
  const a = Math.abs(along);
  if (a <= 26) return GATE_BULGE;
  if (a >= 40) return 0;
  return GATE_BULGE * (1 - SmoothStep(26, 40, a));
}

/**
 * 濠外需要**找平到城内地坪高度（y=0）**的几块地。
 *
 * 由来是工程的：鲁南民居那一整套构件（AddCompound / AddRoomBlock / AddChurch /
 * AddPaifang）全部以 y=0 起砌、没有 baseY 参数，而濠外原野压在 -1.2 m。
 * 与其给每个构件加一个参数、再在每个调用点算一次地高，不如把它们脚下的地找平 ——
 * 关厢与南关本来也是与城同高的一片附郭街区，不是坡上的房子。
 * feather 是过渡带宽度：1.2 m 的高差摊在十几米上，看不出台阶。
 */
const OUTER_PADS = [
  { id: "EastSuburb", x: 431, z: 0, w: 210, d: 396, feather: 16 },
  { id: "SouthChurch", x: 0, z: 420, w: 52, d: 52, feather: 14 },
  { id: "ShanguoGate", x: 0, z: 900, w: 36, d: 28, feather: 12 },
  { id: "NorthMission", x: -60, z: -420, w: 160, d: 110, feather: 18 },
  { id: "PowerPlant", x: -700, z: 30, w: 70, d: 48, feather: 16 },
  { id: "Station", x: -1450, z: 40, w: 80, d: 46, feather: 16 },
  { id: "Pagoda", x: 620, z: 210, w: 38, d: 38, feather: 14 },
  { id: "FortSE", x: 370, z: 370, w: 26, d: 26, feather: 10 },
  { id: "FortSW", x: -370, z: 370, w: 26, d: 26, feather: 10 },
];

function PadBlend(x, z) {
  let best = 0;
  for (const p of OUTER_PADS) {
    const dx = Math.abs(x - p.x) - p.w / 2;
    const dz = Math.abs(z - p.z) - p.d / 2;
    const d = Math.max(dx, dz);
    if (d >= p.feather) continue;
    const v = d <= 0 ? 1 : 1 - SmoothStep(0, p.feather, d);
    if (v > best) best = v;
  }
  return best;
}

/**
 * 合批分区：150 m 见方。见 BuildSink.SetSector 的注释 ——
 * 整座城合成三十个横跨全城的大网格的话，视锥剔除等于没有。
 */
const SECTOR_SIZE = 150;
function SectorKey(x, z) {
  return `S${Math.floor(x / SECTOR_SIZE)}_${Math.floor(z / SECTOR_SIZE)}`;
}

/**
 * 把一格院子从一块「不许占」的矩形里让出来 —— **是裁，不是整格丢掉**。
 *
 * 整格丢掉是第一版的做法，代价很直观：十字街口 30×30 加上院子自己的半宽，
 * 一圈六十米内一格院子都不剩，出图上是一片荒滩中间摆着一个十字路口。
 * 真实的县城里，铺面是**贴着**街口砌的。所以相交时沿穿透最浅的那一轴退到边上，
 * 退完还够 8 m 才留下。
 *
 * @returns {boolean} 裁完还够大就 true
 */
function ClipCell(cell, b, margin = 1.0) {
  if (cell.x1 <= b.minX - margin || cell.x0 >= b.maxX + margin) return true;
  if (cell.z1 <= b.minZ - margin || cell.z0 >= b.maxZ + margin) return true;
  const cx = (cell.x0 + cell.x1) / 2, cz = (cell.z0 + cell.z1) / 2;
  const bx = (b.minX + b.maxX) / 2, bz = (b.minZ + b.maxZ) / 2;
  const overlapX = Math.min(cell.x1, b.maxX + margin) - Math.max(cell.x0, b.minX - margin);
  const overlapZ = Math.min(cell.z1, b.maxZ + margin) - Math.max(cell.z0, b.minZ - margin);
  if (overlapX <= overlapZ) {
    if (cx > bx) cell.x0 = b.maxX + margin; else cell.x1 = b.minX - margin;
  } else if (cz > bz) cell.z0 = b.maxZ + margin; else cell.z1 = b.minZ - margin;
  return cell.x1 - cell.x0 >= 8 && cell.z1 - cell.z0 >= 8;
}

/** 把 [lo,hi] 按一组街道切成几段（街占的那一段挖掉）。 */
function SplitBands(lo, hi, streets) {
  const cuts = streets
    .map((s) => [s.at - s.half, s.at + s.half])
    .filter(([a, b]) => b > lo && a < hi)
    .sort((a, b) => a[0] - b[0]);
  const bands = [];
  let cursor = lo;
  for (const [a, b] of cuts) {
    if (a - cursor > 10) bands.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (hi - cursor > 10) bands.push([cursor, hi]);
  return bands;
}

/** 方环上的一点：side 0..3（北东南西），t 0..1，s = 半边长。 */
function RingPoint(side, t, s) {
  const a = -s + 2 * s * t;
  if (side === 0) return [a, -s];        // 北边，z=-s
  if (side === 1) return [s, a];         // 东边，x=+s
  if (side === 2) return [-a, s];        // 南边，z=+s
  return [-s, -a];                       // 西边，x=-s
}

/** 这一点在哪条边上、沿边走了多远（用来算瓮城让出去的那一段）。 */
function SideAndAlong(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (az >= ax) return z < 0 ? [0, x] : [2, -x];
  return x > 0 ? [1, z] : [3, -z];
}

/**
 * 河道（荆河）中心线。城东南北向流过，z≈+380 转向西南沿城南而去。
 * 护城河自明代起即引荆河水 —— 所以两者在东南角是连着的。
 */
const RIVER_PATH = [[680, -900], [680, OUTSKIRTS.river.turnZ], [200, 900]];

function DistanceToRiver(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER_PATH.length - 1; i += 1) {
    const [x0, z0] = RIVER_PATH[i], [x1, z1] = RIVER_PATH[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    const t = Clamp01(((x - x0) * dx + (z - z0) * dz) / (len2 || 1));
    const d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * 上城道从坡脚到墙顶要占多长。城墙与坡道两边都得算这个数（一个开宇墙的口、
 * 一个铺台阶），各写一份必然对不上，所以抽出来。
 */
export function RampRunLength() {
  const steps = Math.max(4, Math.ceil((WALL_TOP_Y - CITY.platformY) / 0.46));
  return (steps - 1) * RAMP.run + RAMP.landingRun;
}

// ---------------------------------------------------------------------------

export class TengxianCity {
  /**
   * @param {object} options
   *   foci        LOD 焦点表 [[x,z], …]：离任一焦点近的做完整院落。
   *   detailRadius / midRadius 三档 LOD 的分界
   *   bounds      只生成这个范围里的东西（关卡切片用，见 Data_Tengxian.LEVEL_BOUNDS）
   */
  constructor(scene, library, {
    quality = "high", seed = 19380317, foci = [[0, 0]],
    detailRadius = 100, midRadius = 210, bounds = null, breaches = true,
    farGroundRings = 5,
  } = {}) {
    this.scene = scene;
    this.library = library;
    this.quality = quality;
    this.seed = seed;
    this.foci = foci;
    this.detailRadius = detailRadius;
    this.midRadius = midRadius;
    this.bounds = bounds;
    this.wantBreaches = breaches;
    /**
     * 濠外原野那张网格在 700—1700 m 之间分几圈。
     *
     * 默认 5 = **原行为，城内六关一个像素都不变**（那六关的切片最远只到 700 m，
     * 远圈只是天边的一层皮，5 圈够了）。
     * 一·北沙河（x≈-1450）整关都站在这段远圈上，5 圈意味着径向 200 m 一格：
     * 那张地表是 5 条 200 m 宽的巨型三角带，地面起伏被彻底混叠掉，
     * 贴在上面的麦田块会被网格插值误差吃进去半块。那一关传 24（径向 ~42 m），
     * 代价是全场多约 1.8 万三角。
     *
     * 序·界河曾经也走这条路，但 42 m 一格仍然刻不出 38 m 宽的河槽 ——
     * 那一关已经拆成独立场景（Script_JieheField，自己铺地、河槽一带 3.2 m 一格），
     * 不再经过这里。**这个参数现在只有 L1 用。**
     */
    this.farGroundRings = Math.max(1, Math.round(farGroundRings));

    this.sink = new BuildSink();          // 近景：投阴影
    this.farSink = new BuildSink();       // 远景剪影：不投阴影（省掉阴影 pass 的那一份三角形）
    this.meshes = [];
    this.colliders = [];
    this.covers = [];
    this.grid = new Map();
    this.gridSize = 12;
    this.stats = { compoundsDetail: 0, compoundsMid: 0, silhouettes: 0 };
    this.wallTopY = WALL_TOP_Y;

    /**
     * 1938 年 3 月 17 日下午被轰开的缺口。
     * 日方战详报把突破口之一选在「东南角望楼西 20 m 处」—— 那是**南墙**靠东南角
     * 的一段。另一处在东墙（正对东关的主攻方向）。缺口宽度为推定。
     */
    this.breaches = {
      South: [{ at: 285, width: 20, floor: 0.2 }],
      East: [{ at: 70, width: 17, floor: 0.24 }],
      North: [], West: [],
    };
  }

  InBounds(x, z, pad = 0) {
    const b = this.bounds;
    if (!b) return true;
    return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
  }

  /** 离最近的 LOD 焦点有多远。 */
  FocusDistance(x, z) {
    let best = 1e9;
    for (const f of this.foci) {
      const d = Math.hypot(x - f[0], z - f[1]);
      if (d < best) best = d;
    }
    return best;
  }

  // =========================================================================
  /** 分帧生成。用法：for (const step of city.BuildSteps()) { 更新进度条; await raf; } */
  *BuildSteps() {
    const rnd = Mulberry32(this.seed);

    yield { label: "夯地：城内台地与濠外原野", progress: 0.03 };
    this.BuildTerrain(rnd);

    yield { label: "挖濠：宽 10.5 深 4.8", progress: 0.10 };
    this.BuildMoat(rnd);

    yield { label: "筑城：墙身 11.5 米", progress: 0.16 };
    this.BuildWalls(rnd);

    yield { label: "马面与角楼", progress: 0.26 };
    this.BuildBastions(rnd);

    yield { label: "开四门：半圆瓮城与城楼", progress: 0.34 };
    this.BuildGates(rnd);

    yield { label: "上城道（全城只有四条）", progress: 0.42 };
    this.BuildRamps(rnd);

    yield { label: "铺街：十字街口与四条门里街", progress: 0.47 };
    this.BuildStreets(rnd);

    // --- 城内院落 ---
    const cells = this.PlanBlocks(rnd);
    let done = 0;
    for (const cell of cells) {
      this.BuildBlock(cell, rnd);
      done += 1;
      if (done % 24 === 0) {
        yield { label: `盖房子 ${done}/${cells.length}`, progress: 0.47 + 0.28 * (done / cells.length) };
      }
    }

    yield { label: "县衙、警报楼、牌坊、天主堂", progress: 0.77 };
    this.BuildLandmarks(rnd);

    yield { label: "东关：家家有枪眼的院落迷宫", progress: 0.84 };
    this.BuildEastSuburb(rnd);

    yield { label: "城外：龙泉塔、荆河、西关", progress: 0.90 };
    this.BuildOutskirts(rnd);

    yield { label: "合批", progress: 0.95 };
    // 注意是 push 不是赋值：地面／河面那几张网格是在前面几步直接挂进场景的，
    // 写成 this.meshes = Flush(...) 会把它们从表里抹掉（包围盒与销毁都要用这张表）。
    for (const m of this.sink.Flush(this.scene, this.library,
      { resolve: ResolveTengxianMaterial })) this.meshes.push(m);
    for (const m of this.farSink.Flush(this.scene, this.library,
      { resolve: ResolveTengxianMaterial, castShadow: false })) this.meshes.push(m);
    this.FlushProps();
    this.colliders = this.sink.colliders.concat(this.farSink.colliders);
    this.covers = this.sink.covers;
    this.BuildCollisionGrid();

    yield { label: "就绪", progress: 1.0 };
  }

  // =========================================================================
  // 地形
  // =========================================================================

  /**
   * 城内是一块微微抬起的台地（+1.2 m）—— 依据现地描述「东面高起入城内的位置
   * 是西城墙所在处」。这个高差今天还看得出来，不是平铺在平地上的城。
   */
  BuildTerrain(rnd) {
    const s = CITY.platformEdge;
    const segs = this.quality === "low" ? 88 : 116;
    const platform = MakePlane(s * 2, s * 2, TILE_METERS.ground, segs);
    // 弹坑：东半城与东南角最密（日军自东面攻、炮兵在东沙河放列、龙泉塔在东郊校射）
    const craters = [];
    for (let i = 0; i < 190; i += 1) {
      const x = (rnd() - 0.5) * 560;
      const z = (rnd() - 0.5) * 560;
      if (Math.max(Math.abs(x), Math.abs(z)) > 292) continue;    // 别啃到台地边，濠口会裂
      const eastness = Clamp01((x + 300) / 600);
      if (rnd() > 0.18 + eastness * 0.7) continue;
      craters.push({ x, z, radius: 2.4 + rnd() * 4.6, depth: 0.45 + rnd() * 0.9 });
    }
    CarveCraters(platform, craters);
    // 抬到台地高度
    const pos = platform.attributes.position;
    for (let i = 0; i < pos.count; i += 1) pos.setY(i, pos.getY(i) + CITY.platformY);
    pos.needsUpdate = true;
    platform.computeVertexNormals();
    const groundMesh = new THREE.Mesh(platform, this.library.Get("Ground"));
    groundMesh.receiveShadow = true;
    groundMesh.castShadow = false;
    groundMesh.name = "CityPlatform";
    this.scene.add(groundMesh);
    this.meshes.push(groundMesh);
    this.craters = craters;

    // 瓮城让出去的那四块马道（台地在城门前外凸的一段）
    for (let side = 0; side < 4; side += 1) {
      const strip = [];
      const n = 26;
      for (let i = 0; i < n; i += 1) {
        const a0 = -44 + (88 * i) / n, a1 = -44 + (88 * (i + 1)) / n;
        const b0 = MoatBulge(a0), b1 = MoatBulge(a1);
        if (b0 <= 0.01 && b1 <= 0.01) continue;
        const [x0, z0] = RingPoint(side, 0.5 + a0 / (2 * s), s);
        const [x1, z1] = RingPoint(side, 0.5 + a1 / (2 * s), s);
        const nx = side === 1 ? 1 : side === 3 ? -1 : 0;
        const nz = side === 0 ? -1 : side === 2 ? 1 : 0;
        strip.push(this.Quad(
          [x0, CITY.platformY, z0], [x1, CITY.platformY, z1],
          [x1 + nx * b1, CITY.platformY, z1 + nz * b1], [x0 + nx * b0, CITY.platformY, z0 + nz * b0]));
      }
      if (strip.length) this.sink.Add("Ground", MergeGeometries(strip));
    }

    // 城外原野：从濠外岸一圈铺到远处。三月的鲁南 —— 大片裸露褐土，
    // 冬小麦贴地返青、不连续、露土率高，乔木完全落叶。绝不做成绿意盎然的春天。
    this.BuildOuterGround();
  }

  /** 一片四边形（给手工拼的地面条带用）。 */
  Quad(a, b, c, d, tile = TILE_METERS.ground) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const uv = new Float32Array(12);
    const pts = [a, b, c, a, c, d];
    for (let i = 0; i < 6; i += 1) { uv[i * 2] = pts[i][0] / tile; uv[i * 2 + 1] = pts[i][2] / tile; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  /**
   * 城外地面。做成方环状的条带：内边贴着护城河外岸（跟着瓮城的外凸走），
   * 外边一路铺到 1700 m。地隙（东关外的南北向冲沟）与荆河都直接压在这张网格上。
   */
  BuildOuterGround() {
    const perSide = 108;
    const near = 700, far = 1700;
    const radialNear = 52, radialFar = this.farGroundRings;
    const s0 = CITY.platformEdge;
    const geometries = [];
    for (let side = 0; side < 4; side += 1) {
      const cols = [];
      for (let i = 0; i <= perSide; i += 1) {
        const t = i / perSide;
        const along = -s0 + 2 * s0 * t;
        const bulge = MoatBulge(along);
        const inner = MOAT.outerEdge + bulge;
        const col = [];
        for (let r = 0; r <= radialNear + radialFar; r += 1) {
          const dist = r <= radialNear
            ? inner + (near - inner) * (r / radialNear)
            : near + (far - near) * ((r - radialNear) / radialFar);
          const [bx, bz] = RingPoint(side, t, dist);
          col.push([bx, this.OuterHeight(bx, bz), bz]);
        }
        cols.push(col);
      }
      for (let i = 0; i < perSide; i += 1) {
        for (let r = 0; r < radialNear + radialFar; r += 1) {
          geometries.push(this.Quad(cols[i][r], cols[i + 1][r], cols[i + 1][r + 1], cols[i][r + 1], 3.4));
        }
      }
    }
    const merged = MergeGeometries(geometries);
    const mesh = new THREE.Mesh(merged, this.library.Get("Ground"));
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = "OuterGround";
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }

  /**
   * 濠外原野的高程。三样东西压在这张平地上：
   *   · 荆河河槽（城东南北向，转西南沿城南）；
   *   · **地隙** —— 河西岸与外城之间的南北向冲沟。日军沿这条沟可以掩蔽接近到
   *     寨墙 200 m 处而不暴露，3 月 16 日 14:15 第三中队就是沿它冲进东寨门的。
   *     这条沟是东关这一关的地形骨架，不是装饰；
   *   · 一点点起伏，免得城外是一块玻璃板。
   */
  OuterHeight(x, z) {
    let y = CITY.outerY + (Fbm2(x * 0.0032, z * 0.0032, { octaves: 3, seed: 4211 }) - 0.5) * 1.1;
    // 荆河
    const dr = DistanceToRiver(x, z);
    const halfRiver = OUTSKIRTS.river.width / 2;
    if (dr < halfRiver + 14) {
      const t = Clamp01((halfRiver + 14 - dr) / (halfRiver + 14));
      y -= 4.6 * SmoothStep(0, 1, t);
    }
    // 地隙
    const g = EAST_SUBURB.gully;
    if (z > g.fromZ - 20 && z < g.toZ + 20) {
      const d = Math.abs(x - g.x);
      const half = g.width / 2 + 4;
      if (d < half) {
        const endFade = Math.min(SmoothStep(g.fromZ - 20, g.fromZ, z), SmoothStep(g.toZ + 20, g.toZ, z));
        y -= g.depth * Math.pow(1 - d / half, 0.8) * endFade;
      }
    }
    // 平台：这几块地必须抬平到城内地坪的高度（y=0）。
    // 鲁南民居那一整套构件都是以 y=0 起砌、没有 baseY 参数的，
    // 与其给每个构件加参数，不如把它们脚下的地找平 ——
    // 关厢本来也是与城同高的一片附郭街区，不是坡上的房子。
    const pad = PadBlend(x, z);
    if (pad > 0) y = y * (1 - pad);
    return y;
  }

  /**
   * 护城河：宽 10.5 m、深 4.8 m、濠内边距墙脚 8 m。
   * 濠底到墙顶总落差 16.3 m —— 这个数解释了日方「城壁高 20 m」的印象，
   * 也是日军工兵突击桥尺度不足的原因。
   * 濠岸栽柳（史料），三月柳条无叶，深褐红枝条。
   */
  BuildMoat(rnd) {
    const s0 = CITY.platformEdge;
    const perSide = 108;
    // 四道环线：内岸顶 → 濠底内 → 濠底外 → 外岸顶
    const profile = [
      { off: 0, y: CITY.platformY },
      { off: MOAT.bankRunInner, y: MOAT.bottomY },
      { off: MOAT.width - MOAT.bankRunOuter, y: MOAT.bottomY },
      { off: MOAT.width, y: CITY.outerY },
    ];
    const strips = [];
    const waterQuads = [];
    for (let side = 0; side < 4; side += 1) {
      for (let i = 0; i < perSide; i += 1) {
        const t0 = i / perSide, t1 = (i + 1) / perSide;
        const b0 = MoatBulge(-s0 + 2 * s0 * t0), b1 = MoatBulge(-s0 + 2 * s0 * t1);
        for (let k = 0; k < profile.length - 1; k += 1) {
          const p = profile[k], q = profile[k + 1];
          const a = RingPoint(side, t0, s0 + b0 + p.off);
          const b = RingPoint(side, t1, s0 + b1 + p.off);
          const c = RingPoint(side, t1, s0 + b1 + q.off);
          const d = RingPoint(side, t0, s0 + b0 + q.off);
          strips.push(this.Quad([a[0], p.y, a[1]], [b[0], p.y, b[1]], [c[0], q.y, c[1]], [d[0], q.y, d[1]], 3.0));
        }
        // 水面：在 -0.4 处宽约 9.4 m，合志载「水面宽约 8—9 m」
        const wIn = MOAT.bankRunInner * ((CITY.platformY - MOAT.waterY) / MOAT.depth);
        const upFrac = (MOAT.waterY - MOAT.bottomY) / (CITY.outerY - MOAT.bottomY);
        const wOut = MOAT.width - MOAT.bankRunOuter * (1 - upFrac);
        const a = RingPoint(side, t0, s0 + b0 + wIn);
        const b = RingPoint(side, t1, s0 + b1 + wIn);
        const c = RingPoint(side, t1, s0 + b1 + wOut);
        const d = RingPoint(side, t0, s0 + b0 + wOut);
        waterQuads.push(this.Quad([a[0], MOAT.waterY, a[1]], [b[0], MOAT.waterY, b[1]],
          [c[0], MOAT.waterY, c[1]], [d[0], MOAT.waterY, d[1]], 6.0));
      }
    }
    const bank = new THREE.Mesh(MergeGeometries(strips), this.library.Get("GroundRubble"));
    bank.receiveShadow = true; bank.castShadow = false;
    bank.name = "MoatBank";
    this.scene.add(bank);
    this.meshes.push(bank);

    // 水面是半透明的 —— **建完必须 MarkNoPrepass**，否则深度法线预通道会拿
    // overrideMaterial 把它一起覆盖掉，SSAO 与体积光的判据跟着废。
    const waterMat = this.library.Plain("MoatWater", {
      color: PALETTE.moatWater, roughness: 0.22, metalness: 0.0,
      transparent: true, opacity: 0.86, depthWrite: false,
    });
    MarkNoPrepass(waterMat);
    const water = new THREE.Mesh(MergeGeometries(waterQuads), waterMat);
    water.receiveShadow = false; water.castShadow = false;
    water.name = "MoatWater";
    this.scene.add(water);
    this.meshes.push(water);

    // 濠上桥四座（明代记为浮桥，1938 年状态无载 —— 做成简易木桥并标推定）
    for (const gate of GATES) {
      if (!this.InBounds(gate.x * 1.15, gate.z * 1.15, 60)) continue;
      const dirX = gate.outward[0], dirZ = gate.outward[1];
      const rIn = CITY.platformEdge + GATE_BULGE;
      const cx = dirX * (rIn + MOAT.width / 2), cz = dirZ * (rIn + MOAT.width / 2);
      const ry = dirX !== 0 ? Math.PI / 2 : 0;
      this.sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(4.4, 0.32, MOAT.width + 3.0, TILE_METERS.wood, `bridge${gate.id}`),
        { x: cx, y: -0.32, z: cz, ry }));
      this.sink.Solid(cx, -0.4, cz, 2.2, 0.4, MOAT.width / 2 + 1.5, "bridge", ry);
      for (const s of [-1, 1]) {
        this.sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.16, 0.9, MOAT.width + 2.4, TILE_METERS.wood, `bridgeRail${gate.id}${s}`),
          { x: cx + (dirZ ? s * 2.1 : 0), y: 0.3, z: cz + (dirX ? s * 2.1 : 0), ry }));
      }
    }

    // 濠岸栽柳：三月无叶，只有深褐红的枝条骨架
    const perim = 4 * (CITY.platformEdge * 2);
    const n = Math.round(perim / MOAT.willowSpacing);
    for (let i = 0; i < n; i += 1) {
      const side = Math.floor((i / n) * 4) % 4;
      const t = ((i / n) * 4) % 1;
      const along = -CITY.platformEdge + 2 * CITY.platformEdge * t;
      const [wx, wz] = RingPoint(side, t, CITY.platformEdge + MoatBulge(along) + MOAT.width + 3.4);
      if (!this.InBounds(wx, wz, 30)) continue;
      this.farSink.SetSector(SectorKey(wx, wz));
      AddTree(this.farSink, {
        x: wx, z: wz, seed: `willow${i}`, scale: 0.85, material: "Willow",
        height: 6.2 + (i % 5) * 0.5, baseY: this.OuterHeight(wx, wz),
      });
      this.farSink.SetSector("");
    }
  }

  // =========================================================================
  // 城墙
  // =========================================================================

  BuildWalls(rnd) {
    const half = CITY.wallCenter;
    for (const side of WALL_SIDES) {
      if (!this.InBounds(side.x, side.z, 340)) continue;
      // 城门那一段由 AddGateComplex 自己砌（它要在里面掏门洞），这里留出 22 m 的空
      const gaps = [{ at: 0, width: 22 }];
      const breaches = this.wantBreaches ? (this.breaches[side.id] || []) : [];
      // 上城道到顶的那一段要在宇墙上开口，否则爬到墙顶被 0.9 m 的宇墙挡住
      const innerGaps = RAMPS.filter((r) => r.side === side.id)
        .map((r) => ({ at: r.at + r.dir * (RampRunLength() - 4), width: 12 }));
      this.sink.SetSector(`Wall${side.id}`);
      AddCityWall(this.sink, {
        x: side.x, z: side.z, ry: side.ry, length: half * 2, baseY: CITY.platformY,
        seed: `wall${side.id}`, gaps, breaches, innerGaps,
      });
      this.sink.SetSector("");
    }
    // 墙脚防空洞：内侧墙根，每 40 m 一个
    for (const side of WALL_SIDES) {
      const cos = Math.cos(side.ry), sin = Math.sin(side.ry);
      const n = Math.floor((half * 2) / DUGOUT.spacing);
      for (let i = 0; i < n; i += 1) {
        const lx = -half + DUGOUT.spacing * (i + 0.5);
        if (Math.abs(lx) < 16) continue;                 // 门洞那一段没有
        // 上城道占的也是这条墙根带，别把防空洞开在坡道底下
        let onRamp = false;
        for (const r of RAMPS) {
          if (r.side !== side.id) continue;
          const a0 = Math.min(r.at, r.at + r.dir * RampRunLength());
          const a1 = Math.max(r.at, r.at + r.dir * RampRunLength());
          if (lx > a0 - 3 && lx < a1 + 3) onRamp = true;
        }
        if (onRamp) continue;
        const lz = -(CITY.wallBaseWidth / 2 + DUGOUT.depth * 0.42);
        const x = side.x + cos * lx + sin * lz;
        const z = side.z - sin * lx + cos * lz;
        if (!this.InBounds(x, z, 20)) continue;
        this.sink.SetSector(SectorKey(x, z));
        AddDugout(this.sink, {
          x, z, ry: side.ry + Math.PI, baseY: CITY.platformY, seed: `dug${side.id}${i}`,
          width: DUGOUT.width, height: DUGOUT.height, depth: DUGOUT.depth,
        });
        this.sink.SetSector("");
      }
    }
  }

  BuildBastions(rnd) {
    for (const b of BASTIONS) {
      const side = WALL_SIDES.find((s) => s.id === b.side);
      const cos = Math.cos(side.ry), sin = Math.sin(side.ry);
      const x = side.x + cos * b.at;
      const z = side.z - sin * b.at;
      if (!this.InBounds(x, z, 30)) continue;
      this.sink.SetSector(SectorKey(x, z));
      AddBastion(this.sink, {
        x, z, ry: side.ry, baseY: CITY.platformY, seed: `bastion${b.side}${Math.round(b.at)}`,
        out: BASTION.out, width: BASTION.width,
      });
    }
    for (const c of CORNER_TOWERS) {
      if (!this.InBounds(c.x, c.z, 30)) continue;
      this.sink.SetSector(SectorKey(c.x, c.z));
      AddCornerTower(this.sink, { x: c.x, z: c.z, baseY: CITY.platformY, seed: `corner${c.id}` });
    }
    this.sink.SetSector("");
  }

  BuildGates(rnd) {
    for (const gate of GATES) {
      if (!this.InBounds(gate.x, gate.z, 60)) continue;
      this.sink.SetSector(`Gate${gate.id}`);
      AddGateComplex(this.sink, {
        x: gate.x, z: gate.z, ry: gate.ry, baseY: CITY.platformY, seed: `gate${gate.id}`,
        innerW: BARBICAN.innerGateW, innerH: BARBICAN.innerGateH,
        outerW: BARBICAN.outerGateW, outerH: BARBICAN.outerGateH,
        barbicanRadius: BARBICAN.radius, barbicanH: BARBICAN.wallHeight,
        barbicanT: BARBICAN.wallThickness,
        blocked: gate.blocked, slitWidth: gate.slitWidth || 0.9,
        sidework: gate.sidework, plaqueInner: gate.plaqueInner, plaqueOuter: gate.plaqueOuter,
      });
      this.sink.SetSector("");
    }
  }

  /**
   * 上城道 —— 全城只有四条。生成完必须自检：
   * 除了这四条，城墙上不许有第二种上得去的路。
   */
  BuildRamps(rnd) {
    for (const r of RAMPS) {
      const side = WALL_SIDES.find((s) => s.id === r.side);
      const cos = Math.cos(side.ry), sin = Math.sin(side.ry);
      const x = side.x + cos * r.at;
      const z = side.z - sin * r.at;
      if (!this.InBounds(x, z, 40)) continue;
      this.sink.SetSector(SectorKey(x, z));
      AddCityRamp(this.sink, {
        x, z, ry: side.ry, at: 0, baseY: CITY.platformY, topY: WALL_TOP_Y,
        seed: r.seed, width: RAMP.width, run: RAMP.run,
        landingAt: RAMP.landingAt, landingRun: RAMP.landingRun, dir: r.dir,
      });
      this.sink.SetSector("");
    }
  }

  // =========================================================================
  // 街与院落
  // =========================================================================

  /** 一条街的净宽范围（含两侧各 1.2 m 的余量，院子不许压进来）。 */
  StreetZones() {
    if (this.streetZones) return this.streetZones;
    const zones = STREETS.map((s) => ({
      axis: s.axis, at: s.at, half: s.width / 2 + 1.2, from: s.from, to: s.to,
    }));
    this.streetZones = zones;
    return zones;
  }

  /**
   * 一个矩形有没有压到街上。**必须按轴分别比**，不能拿「外接半径」当余量 ——
   * 第一版就是 OnStreet(x, z, max(w,d)/2)：一个 26×22 的院子只要**沿街方向**
   * 离街心 13 m 以内就被判成压街，于是每条街两侧各空出十几米。
   * 出图上是一条一百多米宽的大马路穿过全城，而不是 9 m 的西门里街。
   */
  OnStreet(x, z, hx = 0, hz = 0) {
    for (const s of this.StreetZones()) {
      if (s.axis === "x") {
        if (Math.abs(z - s.at) < s.half + hz && x + hx >= s.from - 1 && x - hx <= s.to + 1) return true;
      } else if (Math.abs(x - s.at) < s.half + hx && z + hz >= s.from - 1 && z - hz <= s.to + 1) return true;
    }
    if (Math.abs(x) < CROSSROAD.size / 2 + hx && Math.abs(z) < CROSSROAD.size / 2 + hz) return true;
    return false;
  }

  BuildStreets(rnd) {
    // 土路：春旱干裂、车辙深。压在台地上一层薄板，比夯土地面浅两档
    for (const s of STREETS) {
      const len = s.to - s.from;
      const cx = s.axis === "x" ? (s.from + s.to) / 2 : s.at;
      const cz = s.axis === "x" ? s.at : (s.from + s.to) / 2;
      if (!this.InBounds(cx, cz, Math.max(len, s.width))) continue;
      this.sink.Add("DirtRoad", PlaceGeometry(
        MakeBox(s.axis === "x" ? len : s.width, 0.12, s.axis === "x" ? s.width : len,
          TILE_METERS.ground, `road${s.id}`),
        { x: cx, y: CITY.platformY + 0.05, z: cz }));
    }
    // 十字街口：全城的中心地标，王铭章亲临这里指挥
    this.sink.Add("DirtRoad", PlaceGeometry(
      MakeBox(CROSSROAD.size, 0.14, CROSSROAD.size, TILE_METERS.ground, "crossroad"),
      { x: 0, y: CITY.platformY + 0.06, z: 0 }));
    // 十字街口四角的铺面不在这里单独摆：它就是贴着街口的那一格院子，
    // 由 PlanBlocks 打上 shop 标记、BuildBlock 按临街铺面的样子盖（见那里的注释）。
  }

  /**
   * 城内地块划分：按 28×24 m 的格子铺院落，挖掉街、十字街口、地标、上城道、
   * 顺城街与那条不许挡的视线走廊。
   * 巷宽 2 m —— 与院落尺寸一样，**全部为推定**（无任何实测数据）。
   */
  PlanBlocks(rnd) {
    const inner = CITY.wallCenter - CITY.wallBaseWidth / 2 - CITY.innerRingWidth;   // 286
    // 先把街网切出来的「大街坊」找出来，再在每个街坊里按 27×23 的节奏分院子。
    // 直接铺一张全城的格子是不行的：格子与街的位置对不上，靠街那一排院子
    // 总会有一半压在街上被剔掉，街两侧就永远是缺牙的。
    const bandsX = SplitBands(-inner, inner, this.StreetZones().filter((s) => s.axis === "z"));
    const bandsZ = SplitBands(-inner, inner, this.StreetZones().filter((s) => s.axis === "x"));
    const cells = [];
    const lane = 2.0;
    for (let bi = 0; bi < bandsX.length; bi += 1) {
      const bx = bandsX[bi];
      const nx = Math.max(1, Math.round((bx[1] - bx[0]) / 27));
      const cw = (bx[1] - bx[0]) / nx - lane;
      if (cw < 8) continue;
      for (let bj = 0; bj < bandsZ.length; bj += 1) {
        const bz = bandsZ[bj];
        const nz = Math.max(1, Math.round((bz[1] - bz[0]) / 23));
        const cd = (bz[1] - bz[0]) / nz - lane;
        if (cd < 8) continue;
        for (let i = 0; i < nx; i += 1) {
          for (let j = 0; j < nz; j += 1) {
            const x = bx[0] + ((bx[1] - bx[0]) * (i + 0.5)) / nx;
            const z = bz[0] + ((bz[1] - bz[0]) * (j + 0.5)) / nz;
            if (!this.InBounds(x, z, 20)) continue;
            if (this.HitsRamp(x, z, cw / 2, cd / 2)) continue;
            const cell = { x0: x - cw / 2, x1: x + cw / 2, z0: z - cd / 2, z1: z + cd / 2 };
            let alive = true;
            for (const b of this.BlockerRects()) {
              if (!ClipCell(cell, b)) { alive = false; break; }
            }
            if (!alive) continue;
            const cx = (cell.x0 + cell.x1) / 2, cz = (cell.z0 + cell.z1) / 2;
            // 贴着十字街口的那一圈 = 志载「十字街口四角有铺面」。
            // 不另摆四座铺子，而是把这一格盖成临街铺面 —— 另摆的话它会把
            // 同一格院子裁到活不下去，街口四周反而空一大片（实测踩过这个坑）。
            const half = CROSSROAD.size / 2;
            const shop = Math.abs(cx) < half + 26 && Math.abs(cz) < half + 26
              && (Math.abs(cell.x0) < half + 3 || Math.abs(cell.x1) < half + 3
                || Math.abs(cell.z0) < half + 3 || Math.abs(cell.z1) < half + 3);
            cells.push({
              x: cx, z: cz, w: cell.x1 - cell.x0, d: cell.z1 - cell.z0,
              seed: `blk${bi}_${bj}_${i}_${j}`, shop,
            });
          }
        }
      }
    }
    return cells;
  }

  /** 院子不许占的矩形：十字街口、四角铺面、各处地标。 */
  BlockerRects() {
    if (this.blockerRects) return this.blockerRects;
    const list = [{
      minX: -CROSSROAD.size / 2, maxX: CROSSROAD.size / 2,
      minZ: -CROSSROAD.size / 2, maxZ: CROSSROAD.size / 2,
    }];
    for (const l of LANDMARKS) {
      const lw = (l.w || l.span || 12) / 2 + 3, ld = (l.d || l.span || 12) / 2 + 3;
      list.push({ minX: l.x - lw, maxX: l.x + lw, minZ: l.z - ld, maxZ: l.z + ld });
    }
    this.blockerRects = list;
    return list;
  }

  HitsRamp(x, z, hx, hz) {
    for (const r of RAMPS) {
      const side = WALL_SIDES.find((s) => s.id === r.side);
      const cos = Math.cos(side.ry), sin = Math.sin(side.ry);
      // 坡道从 at 起沿 dir 方向展开 30 m，向城里 6 m
      for (let k = 0; k <= 30; k += 6) {
        const lx = r.at + r.dir * k;
        const lz = -(CITY.wallBaseWidth / 2 + 3);
        const rx = side.x + cos * lx + sin * lz;
        const rz = side.z - sin * lx + cos * lz;
        if (Math.abs(x - rx) < hx + 5 && Math.abs(z - rz) < hz + 5) return true;
      }
    }
    return false;
  }

  /**
   * 一个地块。三档 LOD：
   *   detail  完整四合院（院墙 + 正房 + 厢房 + 影壁 + 家什）+ 临街枪眼
   *   mid     简化院落：一圈墙 + 一座正房 + 屋顶，仍带枪眼（枪眼是滕县的符号，不许省）
   *   far     体块剪影：一个盒子 + 一片坡顶，不投阴影
   */
  BuildBlock(cell, rnd) {
    this.sink.SetSector(SectorKey(cell.x, cell.z));
    this.farSink.SetSector(SectorKey(cell.x, cell.z));
    const dist = this.FocusDistance(cell.x, cell.z);
    // 破坏梯度：东半城与东南角打得最烂（日军自东面攻，十七日下午城内起火）
    const eastness = Clamp01((cell.x + 300) / 600);
    const seedRnd = Mulberry32(HashString(cell.seed));
    const damage = Clamp(0.10 + Math.pow(eastness, 1.6) * 0.55 + (seedRnd() - 0.5) * 0.25, 0, 0.92);
    const burnt = seedRnd() < 0.12 + eastness * 0.3;

    if (cell.shop) {
      // 铺面：临街一长条房，不是内向的四合院 —— 商业街的立面是连着的铺板门
      const alongX = cell.w >= cell.d;
      const facing = alongX ? (cell.z > 0 ? Math.PI : 0) : (cell.x > 0 ? -Math.PI / 2 : Math.PI / 2);
      AddRoomBlock(this.sink, {
        x: cell.x, z: cell.z, ry: facing,
        width: (alongX ? cell.w : cell.d) - 1.2, depth: (alongX ? cell.d : cell.w) - 1.2,
        eaveY: 3.0, ridgeY: 4.7, seed: `${cell.seed}:shop`, damage, burnt, facing: 1, bays: 5,
      });
      this.AddStreetLoopholes(this.sink, cell, damage);
      this.stats.compoundsDetail += 1;
      return;
    }
    if (dist < this.detailRadius) {
      AddCompound(this.sink, {
        x: cell.x, z: cell.z, ry: 0, width: cell.w, depth: cell.d,
        seed: cell.seed, damage, burnt,
      });
      this.AddStreetLoopholes(this.sink, cell, damage);
      this.stats.compoundsDetail += 1;
      return;
    }
    if (dist < this.midRadius) {
      this.AddSimpleCompound(this.sink, cell, damage, burnt);
      this.AddStreetLoopholes(this.sink, cell, damage);
      this.stats.compoundsMid += 1;
      return;
    }
    this.AddSilhouetteBlock(cell, damage, burnt);
    this.stats.silhouettes += 1;
  }

  /**
   * 简化院落：一圈不切片的院墙 + 一座正房。
   * 形制上仍守住鲁南那条最重要的规矩 —— **对外不开窗**，街两侧是连续实墙。
   */
  AddSimpleCompound(sink, cell, damage, burnt) {
    const { x, z, w, d, seed } = cell;
    const mat = burnt ? "BrickWallSooty" : (HashString(seed) % 100 < 38 ? "Adobe" : "HouseBrick");
    const h = 2.0;
    for (const [ox, oz, len, ry] of [
      [0, -d / 2, w, 0], [0, d / 2, w, 0],
      [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2],
    ]) {
      sink.Add(mat, PlaceGeometry(
        MakeBox(len, h, 0.42, mat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
          `${seed}:sw${ox}${oz}`, mat === "Adobe" ? null : BRICK_UV_GRID),
        { x: x + ox, y: CITY.platformY + h / 2, z: z + oz, ry }));
      sink.Solid(x + ox, CITY.platformY + h / 2, z + oz, len / 2, h / 2, 0.25, "wall", ry);
    }
    const bw = w * 0.62, bd = d * 0.42;
    const eave = 2.6, ridge = 3.9;
    sink.Add(burnt ? "BrickWallSooty" : "HouseBrick", PlaceGeometry(
      MakeBox(bw, eave, bd, TILE_METERS.brick, `${seed}:body`, BRICK_UV_GRID),
      { x, y: CITY.platformY + eave / 2, z: z - d * 0.18 }));
    sink.Solid(x, CITY.platformY + eave / 2, z - d * 0.18, bw / 2, eave / 2, bd / 2, "wall");
    AddHardMountainRoof(sink, {
      x, z: z - d * 0.18, width: bw, depth: bd,
      eaveY: CITY.platformY + eave, ridgeY: CITY.platformY + ridge,
      seed: `${seed}:roof`, ruined: damage > 0.72, burnt,
    });
  }

  /** 远景剪影：一个体块 + 一片坡顶。够读出「灰砖小院的海」就行。 */
  AddSilhouetteBlock(cell, damage, burnt) {
    const { x, z, w, d, seed } = cell;
    const rnd = Mulberry32(HashString(`${seed}:sil`));
    const h = 2.5 + rnd() * 0.9;
    const y = CITY.platformY;
    this.farSink.Add(burnt ? "BrickWallSooty" : "HouseBrick", PlaceGeometry(
      MakeBox(w * 0.86, h, d * 0.82, TILE_METERS.brick, `${seed}:sil`, BRICK_UV_GRID),
      { x, y: y + h / 2, z }));
    this.farSink.Solid(x, y + h / 2, z, w * 0.43, h / 2, d * 0.41, "wall");
    if (damage < 0.75) {
      for (const s of [-1, 1]) {
        this.farSink.Add("RoofTile", PlaceGeometry(
          MakeBox(w * 0.94, 0.14, d * 0.5, TILE_METERS.roof, `${seed}:sr${s}`),
          { x, y: y + h + 0.5, z: z + s * d * 0.2, rx: -s * 0.5 }));
      }
      this.farSink.Add("RoofTile", PlaceGeometry(
        MakeBox(w * 0.94, 0.18, 0.32, TILE_METERS.roof, `${seed}:sridge`),
        { x, y: y + h + 1.02, z }));
    }
  }

  /**
   * 临街那一面墙上的枪眼。
   *
   * 「家家在墙上掏枪眼」被日方战详报反复点名，是滕县巷战最典型的视觉符号：
   * 每一面临街的院墙上都应该有几个**新掏的、边缘发白的**方形射孔。
   * 所以这一步不跟着 LOD 省 —— 只要这个院子还画墙，枪眼就得在。
   */
  AddStreetLoopholes(sink, cell, damage) {
    if (damage > 0.8) return;                       // 塌掉的墙上没有完整的枪眼
    const { x, z, w, d, seed } = cell;
    // 找最近的一条街，朝那一面掏
    let best = null, bestDist = 1e9;
    for (const s of this.StreetZones()) {
      const dist = s.axis === "x" ? Math.abs(z - s.at) : Math.abs(x - s.at);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    if (!best || bestDist > 26) return;
    const facing = best.axis === "x"
      ? { ry: z < best.at ? 0 : Math.PI, ox: 0, oz: (z < best.at ? 1 : -1) * d / 2 }
      : { ry: x < best.at ? Math.PI / 2 : -Math.PI / 2, ox: (x < best.at ? 1 : -1) * w / 2, oz: 0 };
    AddLoopholes(sink, {
      x: x + facing.ox, z: z + facing.oz, ry: facing.ry,
      ys: [1.05, 1.42], count: 3, spread: (best.axis === "x" ? w : d) * 0.55,
      seed: `${seed}:lp`, wallFace: 0.24,
    });
  }

  // =========================================================================
  // 地标
  // =========================================================================

  BuildLandmarks(rnd) {
    for (const l of LANDMARKS) {
      if (!this.InBounds(l.x, l.z, Math.max(l.w || 20, l.d || 20))) continue;
      this.BuildOneLandmark(l, rnd);
    }
  }

  BuildOneLandmark(l, rnd) {
    this.sink.SetSector(SectorKey(l.x, l.z));
    this.farSink.SetSector(SectorKey(l.x, l.z));
    const sink = this.sink;
    const y = CITY.platformY;
    switch (l.kind) {
      case "yamen":
        // 大门中心在 (230,-30)，轴线朝南 —— 东门里街东首北侧，唐宋以来同一处
        AddYamen(sink, { x: l.x, z: l.z, ry: l.ry, w: l.w, d: l.d, seed: "yamen", damage: 0.3 });
        break;
      case "paifang":
        AddPaifang(sink, {
          x: l.x, z: l.z, ry: l.ry, span: l.span, seed: l.id, iron: !!l.iron, arch: !!l.arch,
        });
        break;
      case "alarmTower":
        AddAlarmTower(sink, { x: l.x, z: l.z, ry: l.ry, height: l.height, seed: l.id });
        break;
      case "squareFort":
        AddSquareFort(sink, { x: l.x, z: l.z, ry: l.ry, w: l.w, d: l.d, seed: l.id, damage: 0.3 });
        break;
      case "church":
        AddChurch(sink, {
          x: l.x, z: l.z, ry: l.ry, nave: l.nave, towerH: l.towerH, seed: l.id, damage: 0.12,
        });
        break;
      case "shrine":
        // 王家祠堂：形制无资料，做一进带门楼的四合院
        AddCompound(sink, {
          x: l.x, z: l.z, ry: l.ry, width: l.w, depth: l.d, seed: l.id, damage: 0.28,
        });
        break;
      case "shop":
        AddRoomBlock(sink, {
          x: l.x, z: l.z, ry: l.ry, width: l.w, depth: l.d,
          eaveY: 3.2, ridgeY: 5.0, seed: l.id, damage: 0.3, facing: 1, bays: 3,
        });
        break;
      case "pagoda":
        AddPagoda(sink, { x: l.x, z: l.z, tiers: l.tiers, seed: l.id, baseY: 0 });
        break;
      case "silhouetteCluster":
        this.AddCluster(l);
        break;
      default:
        break;
    }
    this.sink.SetSector("");
    this.farSink.SetSector("");
    void y;
  }

  /** 远景剪影群（北关的弘道院／华北神学院一带：位置布局形制均无资料，只做远景）。 */
  AddCluster(l) {
    const rnd = Mulberry32(HashString(l.id));
    for (let i = 0; i < 7; i += 1) {
      const x = l.x + (rnd() - 0.5) * l.w;
      const z = l.z + (rnd() - 0.5) * l.d;
      const w = 14 + rnd() * 12, d = 9 + rnd() * 6, h = 6.5 + rnd() * 2.4;   // 两层西式校舍
      this.farSink.Add("HouseBrick", PlaceGeometry(
        MakeBox(w, h, d, TILE_METERS.brick, `${l.id}:${i}`, BRICK_UV_GRID),
        { x, y: this.OuterHeight(x, z) + h / 2, z }));
      this.farSink.Add("RoofTile", PlaceGeometry(
        MakeBox(w + 0.8, 0.9, d + 0.8, TILE_METERS.roof, `${l.id}:r${i}`),
        { x, y: this.OuterHeight(x, z) + h + 0.45, z }));
    }
  }

  // =========================================================================
  // 东关 —— 本战真正的主战场
  // =========================================================================

  /**
   * 「对守军有利的不是城墙的高度与坚固，而是外城的存在与环绕城墙的密集民房的存在。」
   * ——日军自己的战后检讨。
   *
   * 所以东关不能做成一堵墙加几间房：它是一片**可以被打穿的、家家有枪眼的院落迷宫**。
   * 日军的打法是不走巷子，用工兵爆破逐间打通民房墙壁，把速射炮推到近距离
   * 直瞄射击枪眼，一个院子一个院子拔 —— 从 16 日 14:15 突入东寨门到 17 日 14:00
   * 扫荡完，光这一片打了 24 小时。
   *
   * 注意：图纸给的东关西界是 x=310（紧贴墙脚），但护城河占了 318—328.5，
   * 所以密集院落实际从濠外 334 起。310—334 那一条是濠与濠外的一圈空地。
   */
  BuildEastSuburb(rnd) {
    const b = EAST_SUBURB.bounds;
    const startX = Math.max(b.minX, MOAT.outerEdge + GATE_BULGE + 6);
    const pitchX = 20, pitchZ = 18;
    const nx = Math.floor((b.maxX - 4 - startX) / pitchX);
    const nz = Math.floor((b.maxZ - b.minZ) / pitchZ);
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const x = startX + pitchX * (i + 0.5);
        const z = b.minZ + pitchZ * (j + 0.5);
        if (!this.InBounds(x, z, 16)) continue;
        // 东关大街：一条穿关而过的东西向街，正对东城门
        if (Math.abs(z) < 5.5) continue;
        // 寺院地阵地那一块留给寺庙
        const t = EAST_SUBURB.temple;
        if (Math.abs(x - t.x) < t.w / 2 + 8 && Math.abs(z - t.z) < t.d / 2 + 8) continue;
        const cell = { x, z, w: pitchX - 2.0, d: pitchZ - 1.8, seed: `east${i}_${j}` };
        this.sink.SetSector(SectorKey(x, z));
        this.farSink.SetSector(SectorKey(x, z));
        const dist = this.FocusDistance(x, z);
        const dmg = Clamp(0.3 + (1 - (x - startX) / (b.maxX - startX)) * 0.35
          + (Mulberry32(HashString(cell.seed))() - 0.5) * 0.24, 0, 0.95);
        // 东关的地坪在濠外，标高 0 附近
        const saveY = CITY.platformY;
        if (dist < this.detailRadius) {
          AddCompound(this.sink, {
            x, z, ry: 0, width: cell.w, depth: cell.d, seed: cell.seed,
            damage: dmg, burnt: dmg > 0.6,
          });
          this.AddSuburbLoopholes(cell, dmg);
          this.stats.compoundsDetail += 1;
        } else if (dist < this.midRadius) {
          this.AddSimpleCompoundAt(this.sink, cell, dmg, dmg > 0.6, 0);
          this.AddSuburbLoopholes(cell, dmg);
          this.stats.compoundsMid += 1;
        } else {
          this.AddSilhouetteAt(cell, dmg, dmg > 0.6, 0);
          this.stats.silhouettes += 1;
        }
        void saveY;
      }
    }
    this.sink.SetSector("");
    this.farSink.SetSector("");

    // 东关寨墙：**高 2 m、顶宽 0.4 m**（日方实测）—— 极薄，一炮一个口。
    const zw = EAST_SUBURB.zhaiWall;
    if (this.InBounds(zw.x, 0, 220)) {
      AddZhaiWall(this.sink, {
        x: zw.x, z: 0, ry: Math.PI / 2, length: zw.toZ - zw.fromZ,
        height: zw.height, topWidth: zw.topWidth, baseWidth: zw.baseWidth, seed: "zhaiEast",
        gaps: [{ at: 0, width: EAST_SUBURB.zhaiGate.width + 1.6 }],
        // 3 月 16 日 14:00 第二轮集中炮击把东寨门完全打毁，14:15 第三中队沿地隙冲入
        breaches: [{ at: 24, width: 16 }, { at: -52, width: 12 }],
        baseY: 0,
      });
      // 东寨门：砖券洞
      const g = EAST_SUBURB.zhaiGate;
      for (const s of [-1, 1]) {
        this.sink.Add("HouseBrick", PlaceGeometry(
          MakeBox(1.4, g.height, 1.0, TILE_METERS.brick, `zhaiGate${s}`, BRICK_UV_GRID),
          { x: g.x, y: g.height / 2, z: g.z + s * (g.width / 2 + 0.7) }));
      }
      this.sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(1.0, 0.9, g.width + 2.8, TILE_METERS.brick, "zhaiGateTop", BRICK_UV_GRID),
        { x: g.x, y: g.height + 0.45, z: g.z }));
    }

    // 寺院地阵地：日方称之为「敌之有力据点」的一座小寺庙
    const t = EAST_SUBURB.temple;
    if (this.InBounds(t.x, t.z, 30)) {
      AddCompound(this.sink, {
        x: t.x, z: t.z, ry: 0, width: t.w, depth: t.d, seed: "eastTemple", damage: 0.45,
      });
      AddRoomBlock(this.sink, {
        x: t.x, z: t.z - t.d * 0.18, ry: 0, width: 14, depth: 8,
        eaveY: 4.0, ridgeY: 6.6, seed: "eastTempleHall", damage: 0.4, facing: 1, bays: 3,
      });
      for (const s of [-1, 1]) {
        AddLoopholes(this.sink, {
          x: t.x + s * t.w / 2, z: t.z, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2,
          ys: [1.1, 1.5], count: 3, spread: t.d * 0.5, seed: `eastTempleLp${s}`, wallFace: 0.26,
        });
      }
    }
  }

  AddSuburbLoopholes(cell, damage) {
    if (damage > 0.85) return;
    // 东关每一面墙都朝着巷子，四面都掏
    for (const [ox, oz, ry, span] of [
      [0, -cell.d / 2, 0, cell.w], [0, cell.d / 2, Math.PI, cell.w],
      [-cell.w / 2, 0, Math.PI / 2, cell.d], [cell.w / 2, 0, -Math.PI / 2, cell.d],
    ]) {
      AddLoopholes(this.sink, {
        x: cell.x + ox, z: cell.z + oz, ry, ys: [1.05, 1.45], count: 2, spread: span * 0.5,
        seed: `${cell.seed}:lp${ox}${oz}`, wallFace: 0.24,
      });
    }
  }

  /** 与 AddSimpleCompound 同，但地坪高度可指定（东关在濠外，标高 0）。 */
  AddSimpleCompoundAt(sink, cell, damage, burnt, baseY) {
    const saved = CITY.platformY;
    const { x, z, w, d, seed } = cell;
    const mat = burnt ? "BrickWallSooty" : (HashString(seed) % 100 < 42 ? "Adobe" : "HouseBrick");
    const h = 2.0;
    for (const [ox, oz, len, ry] of [
      [0, -d / 2, w, 0], [0, d / 2, w, 0],
      [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2],
    ]) {
      sink.Add(mat, PlaceGeometry(
        MakeBox(len, h, 0.42, mat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
          `${seed}:sw${ox}${oz}`, mat === "Adobe" ? null : BRICK_UV_GRID),
        { x: x + ox, y: baseY + h / 2, z: z + oz, ry }));
      sink.Solid(x + ox, baseY + h / 2, z + oz, len / 2, h / 2, 0.25, "wall", ry);
    }
    const bw = w * 0.62, bd = d * 0.44;
    sink.Add(burnt ? "BrickWallSooty" : "HouseBrick", PlaceGeometry(
      MakeBox(bw, 2.6, bd, TILE_METERS.brick, `${seed}:body`, BRICK_UV_GRID),
      { x, y: baseY + 1.3, z: z - d * 0.16 }));
    sink.Solid(x, baseY + 1.3, z - d * 0.16, bw / 2, 1.3, bd / 2, "wall");
    AddHardMountainRoof(sink, {
      x, z: z - d * 0.16, width: bw, depth: bd,
      eaveY: baseY + 2.6, ridgeY: baseY + 3.9, seed: `${seed}:roof`,
      ruined: damage > 0.74, burnt,
    });
    void saved;
  }

  AddSilhouetteAt(cell, damage, burnt, baseY) {
    const { x, z, w, d, seed } = cell;
    const rnd = Mulberry32(HashString(`${seed}:sil`));
    const h = 2.5 + rnd() * 0.8;
    this.farSink.Add(burnt ? "BrickWallSooty" : "HouseBrick", PlaceGeometry(
      MakeBox(w * 0.88, h, d * 0.84, TILE_METERS.brick, `${seed}:sil`, BRICK_UV_GRID),
      { x, y: baseY + h / 2, z }));
    this.farSink.Solid(x, baseY + h / 2, z, w * 0.44, h / 2, d * 0.42, "wall");
    if (damage < 0.8) {
      for (const s of [-1, 1]) {
        this.farSink.Add("RoofTile", PlaceGeometry(
          MakeBox(w * 0.96, 0.14, d * 0.52, TILE_METERS.roof, `${seed}:sr${s}`),
          { x, y: baseY + h + 0.48, z: z + s * d * 0.2, rx: -s * 0.5 }));
      }
    }
  }

  // =========================================================================
  // 城外
  // =========================================================================

  BuildOutskirts(rnd) {
    for (const l of OUTER_LANDMARKS) {
      if (!this.InBounds(l.x, l.z, 120)) continue;
      this.BuildOneLandmark(l, rnd);
    }

    // 西关电灯厂：烟囱是西关天际线上的关键剪影，距西城门楼约 395 m，
    // 在城楼机枪的直瞄射程内（300—600 m 为推定）。
    const pp = WEST_SUBURB.powerPlant;
    if (this.InBounds(pp.x, pp.z, 80)) {
      const y = this.OuterHeight(pp.x, pp.z);
      this.farSink.Add("HouseBrick", PlaceGeometry(
        MakeBox(pp.w, 7.5, pp.d, TILE_METERS.brick, "powerPlant", BRICK_UV_GRID),
        { x: pp.x, y: y + 3.75, z: pp.z }));
      this.farSink.Add("RoofTile", PlaceGeometry(
        MakeBox(pp.w + 1, 0.7, pp.d + 1, TILE_METERS.roof, "powerPlantRoof"),
        { x: pp.x, y: y + 7.8, z: pp.z }));
      const chimney = new THREE.CylinderGeometry(0.9, 1.7, pp.chimneyH, 10);
      const uv = chimney.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * pp.chimneyH / 1.2);
      this.sink.Add("HouseBrick", PlaceGeometry(chimney,
        { x: pp.x + pp.w * 0.36, y: y + pp.chimneyH / 2, z: pp.z - pp.d * 0.3 }));
    }

    // 滕县站与津浦铁路：只做剪影，位置与形制全为推定
    const st = WEST_SUBURB.station;
    if (this.InBounds(st.x, st.z, 120)) {
      const y = this.OuterHeight(st.x, st.z);
      this.farSink.Add("HouseBrick", PlaceGeometry(
        MakeBox(st.w, 5.2, st.d, TILE_METERS.brick, "station", BRICK_UV_GRID),
        { x: st.x, y: y + 2.6, z: st.z }));
      this.farSink.Add("HouseBrick", PlaceGeometry(
        MakeBox(st.w * 0.3, 3.4, st.d, TILE_METERS.brick, "stationMid", BRICK_UV_GRID),
        { x: st.x, y: y + 6.9, z: st.z }));
      this.farSink.Add("RoofTile", PlaceGeometry(
        MakeBox(st.w + 1.6, 1.4, st.d + 1.8, TILE_METERS.roof, "stationRoof"),
        { x: st.x, y: y + 5.9, z: st.z }));
    }

    // 城外空心炮台 2 座（1908 建）—— **位置无载**，推定置于东南、西南墙外 60 m
    for (const f of OUTSKIRTS.hollowForts) {
      if (!this.InBounds(f.x, f.z, 40)) continue;
      const y = this.OuterHeight(f.x, f.z);
      this.sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(11, 4.2, 11, TILE_METERS.brick, `fort${f.x}`, BRICK_UV_GRID),
        { x: f.x, y: y + 2.1, z: f.z }));
      this.sink.Solid(f.x, y + 2.1, f.z, 5.5, 2.1, 5.5, "wall");
      AddLoopholes(this.sink, {
        x: f.x, z: f.z - 5.5, ry: Math.PI, ys: [1.6, 2.8], count: 3, spread: 6,
        seed: `fortLp${f.x}`, wallFace: 0.2, size: 0.34,
      });
    }

    // 荆河水面
    const riverQuads = [];
    for (let i = 0; i < RIVER_PATH.length - 1; i += 1) {
      const [x0, z0] = RIVER_PATH[i], [x1, z1] = RIVER_PATH[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const nx = -dz / len, nz = dx / len;
      const hw = OUTSKIRTS.river.width / 2;
      const steps = Math.max(2, Math.round(len / 60));
      for (let k = 0; k < steps; k += 1) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const a = [x0 + dx * t0, z0 + dz * t0], b = [x0 + dx * t1, z0 + dz * t1];
        riverQuads.push(this.Quad(
          [a[0] - nx * hw, -3.0, a[1] - nz * hw], [b[0] - nx * hw, -3.0, b[1] - nz * hw],
          [b[0] + nx * hw, -3.0, b[1] + nz * hw], [a[0] + nx * hw, -3.0, a[1] + nz * hw], 6.0));
      }
    }
    if (riverQuads.length) {
      const mat = this.library.Plain("RiverWater", {
        color: PALETTE.moatWater, roughness: 0.2, transparent: true, opacity: 0.88, depthWrite: false,
      });
      MarkNoPrepass(mat);
      const river = new THREE.Mesh(MergeGeometries(riverQuads), mat);
      river.castShadow = false; river.receiveShadow = false;
      river.name = "JingRiver";
      this.scene.add(river);
      this.meshes.push(river);
    }

    // 三月的地表：冬小麦返青（贴地、不连续、露土率高）+ 光秃的杨柳
    this.BuildMarchGround(rnd);
  }

  BuildMarchGround(rnd) {
    const patches = [];
    for (let i = 0; i < MARCH_GROUND.wheatPatch.count; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = 380 + rnd() * 900;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.InBounds(x, z, 120)) continue;
      if (Math.max(Math.abs(x), Math.abs(z)) < MOAT.outerEdge + 30) continue;
      const w = MARCH_GROUND.wheatPatch.minSize
        + rnd() * (MARCH_GROUND.wheatPatch.maxSize - MARCH_GROUND.wheatPatch.minSize);
      const d = w * (0.55 + rnd() * 0.7);
      const y = this.OuterHeight(x, z);
      patches.push(PlaceGeometry(
        MakeBox(w, 0.6, d, TILE_METERS.ground, `wheat${i}`), { x, y: y + 0.06, z, ry: rnd() * 0.4 }));
    }
    if (patches.length) {
      // 冬小麦返青期：苗高 15—30 cm，贴地、不连续 —— 不是一片绿毯
      const mat = this.library.Plain("Wheat", { color: PALETTE.wheat, roughness: 0.95 });
      const mesh = new THREE.Mesh(MergeGeometries(patches), mat);
      mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.name = "WinterWheat";
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    // 落叶乔木：三月完全无叶，只有骨架；树形高瘦、直干、分枝稀疏，
    // 高度约为房屋的 2—3 倍（日军 1938-03-16 现场速写《写景図第一》）
    for (let i = 0; i < 42; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = 360 + rnd() * 760;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.InBounds(x, z, 60)) continue;
      if (Math.max(Math.abs(x), Math.abs(z)) < MOAT.outerEdge + 12) continue;
      this.farSink.SetSector(SectorKey(x, z));
      AddTree(this.farSink, {
        x, z, seed: `tree${i}`, scale: 0.95, material: "Willow",
        height: MARCH_GROUND.treeHeight[0]
          + rnd() * (MARCH_GROUND.treeHeight[1] - MARCH_GROUND.treeHeight[0]),
        baseY: this.OuterHeight(x, z),
      });
      this.farSink.SetSector("");
    }
  }

  // =========================================================================
  // 收尾
  // =========================================================================

  FlushProps() {
    const bagMatrices = [];
    const rubble = [];
    const dummy = new THREE.Object3D();
    for (const sink of [this.sink, this.farSink]) {
      for (const p of sink.props) {
        if (p.kind === "sandbags") { bagMatrices.push(...p.matrices); continue; }
        if (p.kind === "breachSpill" || p.kind === "rubblePile") {
          const rnd = Mulberry32(HashString(p.seed || "pile"));
          const n = p.kind === "breachSpill" ? 26 : 34;
          for (let i = 0; i < n; i += 1) {
            const a = rnd() * Math.PI * 2;
            const r = rnd() * (p.radius || 3);
            const s = 0.16 + rnd() * 0.5;
            dummy.position.set(p.x + Math.cos(a) * r, this.GroundHeight(p.x, p.z) + s * 0.3,
              p.z + Math.sin(a) * r);
            dummy.rotation.set(rnd() * 0.9 - 0.45, rnd() * Math.PI * 2, rnd() * 0.9 - 0.45);
            dummy.scale.set(s * 1.4, s * 0.6, s * 1.2);
            dummy.updateMatrix();
            rubble.push(dummy.matrix.clone());
          }
          continue;
        }
        if (p.kind === "tree") AddTree(this.farSink, p);
      }
      sink.props.length = 0;
    }
    if (bagMatrices.length) {
      const mesh = MakeInstanced(MakeBox(0.62, 0.24, 0.34, TILE_METERS.sandbag, "bag"),
        ResolveTengxianMaterial("Sandbag", this.library), bagMatrices);
      mesh.name = "SandbagPlugs";
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    if (rubble.length) {
      const mesh = MakeInstanced(MakeBox(1, 1, 1, 0.32, "rubbleUnit"),
        ResolveTengxianMaterial("CityBrickWorn", this.library), rubble, { castShadow: false });
      mesh.name = "Rubble";
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  BuildCollisionGrid() {
    this.grid.clear();
    const g = this.gridSize;
    for (const box of this.colliders) {
      const x0 = Math.floor(box.min[0] / g), x1 = Math.floor(box.max[0] / g);
      const z0 = Math.floor(box.min[2] / g), z1 = Math.floor(box.max[2] / g);
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = x * 100003 + z;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(box);
        }
      }
    }
  }

  BoxesNear(x, z) {
    const g = this.gridSize;
    return this.grid.get(Math.floor(x / g) * 100003 + Math.floor(z / g)) || [];
  }

  /**
   * 脚下的地面高程。城内是 +1.2 m 的台地，濠里是斜坡，濠外是原野。
   * 台地上的弹坑不进这条解析式（弹坑是网格上的位移）—— 差值最大约 1 m，
   * 接进游戏时要么改用射线取地，要么把弹坑也写进这里。
   */
  GroundHeight(x, z) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    const [, along] = SideAndAlong(x, z);
    const bulge = MoatBulge(along);
    const inner = CITY.platformEdge + bulge;
    if (m <= inner) return CITY.platformY;
    const outer = inner + MOAT.width;
    if (m >= outer) return this.OuterHeight(x, z);
    const t = m - inner;
    if (t < MOAT.bankRunInner) {
      return CITY.platformY + (MOAT.bottomY - CITY.platformY) * (t / MOAT.bankRunInner);
    }
    const outStart = MOAT.width - MOAT.bankRunOuter;
    if (t > outStart) {
      return MOAT.bottomY + (0 - MOAT.bottomY) * ((t - outStart) / MOAT.bankRunOuter);
    }
    return MOAT.bottomY;
  }

  // =========================================================================
  // 自检
  // =========================================================================

  /**
   * **硬约束自检**：西城门楼 → 西门里街 → 十字街口 必须通视。
   * 挡住了就是事故 —— 那一枪、那一段崩溃、那一段殉国全都建立在这条直线上。
   */
  CheckSightCorridor() {
    const y = CITY.platformY + SIGHT_CORRIDOR.eyeY;
    const blockers = [];
    for (let x = SIGHT_CORRIDOR.fromX + 3; x <= SIGHT_CORRIDOR.toX; x += 0.5) {
      for (const b of this.BoxesNear(x, SIGHT_CORRIDOR.atZ)) {
        if (b.tag === "bridge") continue;
        if (x < b.min[0] - 1e-6 || x > b.max[0] + 1e-6) continue;
        if (SIGHT_CORRIDOR.atZ < b.min[2] - 1e-6 || SIGHT_CORRIDOR.atZ > b.max[2] + 1e-6) continue;
        if (y < b.min[1] - 1e-6 || y > b.max[1] + 1e-6) continue;
        blockers.push({ x, tag: b.tag, box: b });
      }
    }
    return { ok: blockers.length === 0, blockers };
  }

  /**
   * **硬约束自检**：全城只有四条上城道。
   *
   * 判据只能是**连通性**，不能是「在某条线上高度递增」——
   * 马道是沿着墙平行爬的，垂直于墙扫一条线永远扫不到它（第一版就是这么错的，
   * 报出来的结果是「一条上城道都没有」）。
   *
   * 所以这里在墙内侧那条带上铺一张 0.75 m 的高度图（每格取脚下能踩住的最高顶面），
   * 从城里那一侧起洪，只往高差 ≤ 0.56 m（玩家与 AI 的自动抬腿线）的邻格淌，
   * 看有几段能淌到 11.5 m 的墙顶。返回的段数应当正好是 4。
   */
  CheckWallAccess(step = 0.75, { excludeRamps = false } = {}) {
    const groups = [];
    for (const side of WALL_SIDES) {
      const cos = Math.cos(side.ry), sin = Math.sin(side.ry);
      const lzFrom = -34, lzTo = 2.4;
      const nx = Math.floor((CITY.wallCenter * 2 - 8) / step);
      const nz = Math.floor((lzTo - lzFrom) / step);
      const height = new Float32Array(nx * nz);
      for (let i = 0; i < nx; i += 1) {
        const lx = -CITY.wallCenter + 4 + i * step;
        for (let j = 0; j < nz; j += 1) {
          const lz = lzFrom + j * step;
          const px = side.x + cos * lx + sin * lz;
          const pz = side.z - sin * lx + cos * lz;
          let best = this.GroundHeight(px, pz);
          for (const b of this.BoxesNear(px, pz)) {
            if (excludeRamps && b.tag === "ramp") continue;
            if (px < b.min[0] || px > b.max[0] || pz < b.min[2] || pz > b.max[2]) continue;
            if (b.max[1] > best) best = b.max[1];
          }
          height[i * nz + j] = best;
        }
      }
      // 起点：离墙最远那两列上，站得住的地面
      const seen = new Uint8Array(nx * nz);
      const queue = [];
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          const k = i * nz + j;
          if (height[k] > CITY.platformY + 0.6) continue;
          seen[k] = 1; queue.push(k);
        }
      }
      const reachedTops = [];
      while (queue.length) {
        const k = queue.pop();
        const i = Math.floor(k / nz), j = k % nz;
        if (height[k] >= WALL_TOP_Y - 0.5) reachedTops.push(-CITY.wallCenter + 4 + i * step);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const nk = ni * nz + nj;
          if (seen[nk]) continue;
          if (Math.abs(height[nk] - height[k]) > 0.56) continue;
          seen[nk] = 1; queue.push(nk);
        }
      }
      reachedTops.sort((a, b) => a - b);
      let run = null;
      for (const at of reachedTops) {
        if (run && at - run.to <= 4) { run.to = at; continue; }
        run = { side: side.id, from: at, to: at };
        groups.push(run);
      }
    }
    return groups;
  }

  /**
   * 「城墙是一条只有四个出入口的高空回廊」这句话在运行时到底成不成立。
   *
   * 只数「墙顶有多少格走得到」是不够的 —— 走得到只说明有路，不说明**只有这四条路**。
   * 所以跑两遍泛洪：带上马道一遍、把 tag==="ramp" 的碰撞盒全摘掉再一遍。
   * 前者必须有、后者必须没有 —— 后者一旦有值，就是某处的房顶／土堆／马面
   * 悄悄搭出了第五条上墙的路。
   */
  CheckWallCorridor() {
    const withRamps = this.CheckWallAccess(0.75);
    const without = this.CheckWallAccess(0.75, { excludeRamps: true });
    const span = (list) => list.reduce((sum, g) => sum + (g.to - g.from), 0);
    return {
      rampCount: RAMPS.length,
      topReachableSpan: +span(withRamps).toFixed(1),
      topSegments: withRamps.length,
      leakSpan: +span(without).toFixed(1),
      leaks: without.slice(0, 4),
      ok: span(withRamps) > 800 && without.length === 0,
    };
  }

  /** 整座城的包围盒（给相机远近平面与自检用）。 */
  ComputeBounds() {
    const box = new THREE.Box3();
    for (const m of this.meshes) {
      m.updateMatrixWorld(true);
      box.expandByObject(m);
    }
    return box;
  }
}
