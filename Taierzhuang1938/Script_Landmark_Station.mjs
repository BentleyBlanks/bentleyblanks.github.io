// 津浦路滕县站（1911 德建三等小站）+ 城西段津浦铁路。工作包 B1 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// —— 史实纪律 ——
// 有据的只有三条（docs/Data_TengxianCity.md 第五节）：
//   · `[主流记载]` 滕县站在西关外，1908 开工、1911 站房竣工、1912 投用；
//   · `[主流记载]` 津浦路以韩庄运河桥为界分南北段，**滕县属德国工程司承建的北段**；
//   · `[信史]` 1938-03-17 14:40 赤柴命第Ⅱ大队「直チニ滕県駅ヲ占領」——车站是封口的钥匙。
// **站房的图纸与照片一张都没有找到**（docs uncertainties 明列）。所以这里做的是
// docs 里那句推定的最保守落地：「单层局部两层、清水砖墙、石质窗套与转角、
// 陡坡瓦屋面、木构月台雨棚」。同区间的泰安站、济南站只当风格参照，
// **一律不照抄**：三等小站没有钟楼、没有大厅、没有青年派山花，正面只有
// 一进站厅 + 一间售票房，两侧各一间平房翼。所有尺寸见文件末的推定登记。
//
// 识别语言（土坯民居的西关里一眼可辨的三件）：
//   ① 陡坡瓦屋面（35°，鲁南硬山是 26—29°）+ 局部两层的中段；
//   ② 清水砖墙上的**石窗套与石转角**——中式民居没有这一笔；
//   ③ 一条钢轨线 + 石站台 + 木构月台雨棚。
// 臂板信号机属 tzm 饰件轮，本轮不做。
//
// —— 坐标系 ——
// 本文件统一用与 PlaceGeometry(ry) 一致的那一套（同 A7）：
//   局部 +x → 世界 (cos ry, -sin ry)；局部 +z → 世界 (sin ry, cos ry)
// **不调用 AddCompound / AddRoomBlock / AddFeatureRoom**（那三个的门脸排在局部 -z，
// 与这里的约定差 180°，见注册表头注坑①）。
// 站房长向沿局部 z（= f.w 34 m，与铁路平行），进深沿局部 x（= f.d 12 m），
// 站台与铁路在局部 -x 侧。
//
// f = WEST_SUBURB.station（w34 d12）。铁路数据 **没有**随 f 传进来（派发处只给了
// station 那一条），而契约禁止 import Data_Tengxian —— 这里镜像一份常量，
// 并优先读 f.railway：主会话把 railway 并进派发参数后本文件不用改。

import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
// 只借这一个纯碰撞工具：它按「沿墙 = 局部 x、墙厚 = 局部 z」登记，
// 与本文件 Band() 的摆法完全一致（上面那条禁令针对的是 AddCompound 那三个门脸函数）。
import { SolidWithOpenings } from "./Script_World.mjs";

/** Data_Tengxian.WEST_SUBURB.railway 的镜像（主会话改数据时要同步这里）。 */
const RAILWAY = { x: -480, gauge: 1.435, fromZ: -330, toZ: 330, crossings: [0] };

/** 与 Script_TengxianCity 的合批分区同一把尺（150 m）：桶名对齐才不会多出批次。 */
const SECTOR_SIZE = 150;
const SectorKey = (x, z) => `S${Math.floor(x / SECTOR_SIZE)}_${Math.floor(z / SECTOR_SIZE)}`;

const STONE = "PlatformStone";     // 石窗套 / 石转角 / 站台面共用一种石材（省 draw call）
const BRICK = "StationBrick";

function MakeFrame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

// ---------------------------------------------------------------------------
// 基础构件（都以**绝对 y** 落位：站房坐在 0.75 m 的站台面上，
// Script_World 那一套 y=0 起砌的构件在这里全用不了）
// ---------------------------------------------------------------------------

/** 一块方料。 */
function Slab(sink, mat, { x, y, z, w, h, d, ry = 0, rz = 0, rx = 0, seed, tile = TILE_METERS.stone, grid = null }) {
  sink.Add(mat, PlaceGeometry(MakeBox(w, h, d, tile, seed, grid), { x, y, z, ry, rx, rz }));
}

/**
 * 一条水平墙带：沿墙长方向除掉 gaps 之后剩下的实心段。
 *
 * 门窗洞不是往墙上贴一块深色板，而是**真的不砌那一段**——墙由若干条水平带叠成，
 * 每条带各有各的洞口表：窗台以下一条、窗洞那一条（洞是空的）、过梁以上一条。
 * 站厅里因此有真正的采光，站在站台上能从窗洞看穿到对面的窗。
 *
 * @returns 实心段区间表 [[a,b]...]（沿墙局部坐标），给碰撞登记用
 */
function Band(sink, mat, {
  cx, cz, ry, len, y0, y1, thickness, seed, gaps = [],
  tile = TILE_METERS.brick, grid = BRICK_UV_GRID,
}) {
  const h = y1 - y0;
  const runs = [];
  if (h <= 0.03) return runs;
  const sorted = [...gaps].sort((a, b) => a.c - b.c);
  let cursor = -len / 2;
  for (const g of sorted) {
    const a = g.c - g.w / 2, b = g.c + g.w / 2;
    if (a > cursor) runs.push([cursor, Math.min(a, len / 2)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < len / 2) runs.push([cursor, len / 2]);
  const cos = Math.cos(ry), sin = Math.sin(ry);
  runs.forEach(([a, b], i) => {
    const w = b - a;
    if (w < 0.03) return;
    const off = (a + b) / 2;
    sink.Add(mat, PlaceGeometry(
      MakeBox(w, h, thickness, tile, `${seed}:${i}`, grid),
      { x: cx + cos * off, y: (y0 + y1) / 2, z: cz - sin * off, ry }));
  });
  return runs;
}

/**
 * 石窗套一副：窗台石 + 过梁石 + 两侧石套 + 木窗棂。
 *
 * 这一副石头是「这不是中式民居」的第一提示，也是唯一一处必须出挑的线脚：
 * 石套比墙面各出 0.05 m，斜阳下沿窗洞画出一圈亮边。
 */
function StoneWindow(sink, {
  cx, cz, ry, off, sillY, headY, openW, thickness, seed, mullions = true,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (o) => ({ x: cx + cos * o, z: cz - sin * o });
  const p = At(off);
  const h = headY - sillY;
  Slab(sink, STONE, {
    x: p.x, y: sillY - 0.09, z: p.z, w: openW + 0.52, h: 0.18, d: thickness + 0.24,
    ry, seed: `${seed}:sill`,
  });
  Slab(sink, STONE, {
    x: p.x, y: headY + 0.12, z: p.z, w: openW + 0.52, h: 0.24, d: thickness + 0.16,
    ry, seed: `${seed}:lin`,
  });
  for (const s of [-1, 1]) {
    const q = At(off + s * (openW / 2 + 0.12));
    Slab(sink, STONE, {
      x: q.x, y: (sillY + headY) / 2, z: q.z, w: 0.24, h, d: thickness + 0.1,
      ry, seed: `${seed}:jb${s}`,
    });
  }
  if (!mullions) return;                       // 炸掉窗棂的那几扇：洞口读作「打空了」
  const face = At(off);
  Slab(sink, "WoodBeam", {
    x: face.x, y: (sillY + headY) / 2, z: face.z, w: 0.08, h, d: thickness * 0.5,
    ry, seed: `${seed}:mv`, tile: TILE_METERS.wood,
  });
  for (let k = 1; k <= 2; k += 1) {
    Slab(sink, "WoodBeam", {
      x: face.x, y: sillY + h * (k / 3), z: face.z, w: openW - 0.1, h: 0.07, d: thickness * 0.5,
      ry, seed: `${seed}:mh${k}`, tile: TILE_METERS.wood,
    });
  }
}

/** 门洞的交代：门槛石 + 木门框 + 一扇敞在洞侧的门板。 */
function DoorDress(sink, {
  cx, cz, ry, off, floorY, headY, openW, thickness, seed, leaf = true,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (o) => ({ x: cx + cos * o, z: cz - sin * o });
  const p = At(off);
  Slab(sink, STONE, {
    x: p.x, y: floorY + 0.06, z: p.z, w: openW + 0.7, h: 0.14, d: thickness + 0.5,
    ry, seed: `${seed}:sill`,
  });
  for (const s of [-1, 1]) {
    const q = At(off + s * (openW / 2 + 0.12));
    Slab(sink, STONE, {
      x: q.x, y: floorY + (headY - floorY) / 2, z: q.z, w: 0.24, h: headY - floorY,
      d: thickness + 0.12, ry, seed: `${seed}:jb${s}`,
    });
  }
  Slab(sink, STONE, {
    x: p.x, y: headY + 0.13, z: p.z, w: openW + 0.62, h: 0.26, d: thickness + 0.16,
    ry, seed: `${seed}:lin`,
  });
  if (!leaf) return;
  // 门板敞在洞口侧壁上（车站的门白天不关）
  for (const s of [-1, 1]) {
    const q = At(off + s * (openW / 2 - 0.06));
    Slab(sink, "WoodDoor", {
      x: q.x + Math.sin(ry) * s * 0.32, y: floorY + (headY - floorY) / 2 - 0.05,
      z: q.z + Math.cos(ry) * s * 0.32, w: 0.1, h: headY - floorY - 0.2, d: openW / 2,
      ry, seed: `${seed}:lf${s}`, tile: TILE_METERS.wood,
    });
  }
}

/** 陡坡两坡瓦顶（脊沿局部 z）。鲁南硬山 26—29°，这里 35°：读图上一眼分得开。 */
function GableRoof(sink, {
  L, lz, lengthZ, depthX, eaveY, ridgeY, ry, seed, overX = 0.55, overZ = 0.5,
  mat = "RoofTile",
}) {
  const rise = ridgeY - eaveY;
  const half = depthX / 2;
  const slope = Math.hypot(half, rise);
  const angle = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    const lx = s * half * (1 + overX / slope) * 0.5;
    const cy = (ridgeY + eaveY - rise * overX / slope) * 0.5;
    const p = L(lx, lz);
    Slab(sink, mat, {
      x: p.x, y: cy, z: p.z, w: slope + overX, h: 0.16, d: lengthZ + overZ * 2,
      ry, rz: -s * angle, seed: `${seed}:s${s}`, tile: TILE_METERS.roof,
    });
    // 檐口木博风：出檐那一圈阴影全靠它
    const e = L(s * (half + overX * 0.8), lz);
    Slab(sink, "WoodBeam", {
      x: e.x, y: eaveY - 0.16, z: e.z, w: 0.14, h: 0.22, d: lengthZ + overZ * 2,
      ry, seed: `${seed}:fa${s}`, tile: TILE_METERS.wood,
    });
  }
  const r = L(0, lz);
  Slab(sink, mat, {
    x: r.x, y: ridgeY + 0.09, z: r.z, w: 0.5, h: 0.22, d: lengthZ + overZ * 2,
    ry, seed: `${seed}:ridge`, tile: TILE_METERS.roof,
  });
}

/**
 * 山尖：把三角砌成 8 段（6 段时坡面读成阶梯）。
 *
 * 每段取**外端**的坡高，不是段心的：取段心的话每一段的外半边都高过屋面，
 * 出图上是一排砖块骑在瓦面上往脊上爬（第一版出图抓到的就是这个）。
 */
function GableWall(sink, mat, {
  L, lz, width, eaveY, ridgeY, thickness, ry, seed, steps = 8,
}) {
  const rise = ridgeY - eaveY;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const lx = -width / 2 + width * (t0 + t1) * 0.5;
    const outer = Math.max(Math.abs(t0 * 2 - 1), Math.abs(t1 * 2 - 1));
    const h = Math.max(0.2, rise * (1 - outer));
    const p = L(lx, lz);
    Slab(sink, mat, {
      x: p.x, y: eaveY + h / 2, z: p.z, w: width / steps, h, d: thickness,
      ry, seed: `${seed}:g${i}`, tile: TILE_METERS.brick, grid: BRICK_UV_GRID,
    });
  }
  // 山墙压顶（Verge）：沿坡面的一条斜砖带，比瓦面高出一线。
  // 它一石三鸟 —— 收住阶梯砌的锯齿、封死山墙与屋面之间那条透光缝、
  // 补上德式砖房山墙那条直边（中式硬山靠的是同一处，做法不同）。
  const angle = Math.atan2(rise, width / 2);
  const runLen = Math.hypot(width / 2, rise);
  for (const s of [-1, 1]) {
    // 斜带的中心 = 顶边中点沿板面法线往下 0.5（板厚 1.0）
    const p = L(s * (width / 4 - 0.5 * Math.sin(angle)), lz);
    Slab(sink, mat, {
      x: p.x, y: eaveY + rise / 2 + 0.30 - 0.5 * Math.cos(angle),
      z: p.z, w: runLen, h: 1.0, d: thickness + 0.14,
      ry, rz: -s * angle, seed: `${seed}:verge${s}`,
      tile: TILE_METERS.brick, grid: BRICK_UV_GRID,
    });
  }
}

/** 石转角：交替出挑的隅石。德式清水砖房的第二个识别特征。 */
function Quoin(sink, { L, lx, lz, sx, sz, y0, y1, ry, seed, block = 0.66, course = 0.52 }) {
  const n = Math.max(3, Math.round((y1 - y0) / course));
  for (let i = 0; i < n; i += 1) {
    const y = y0 + course * (i + 0.5);
    if (y > y1) break;
    const wide = i % 2 === 0;
    const w = wide ? block : block * 0.58;
    const d = wide ? block * 0.58 : block;
    const p = L(lx - sx * (w / 2 - 0.12), lz - sz * (d / 2 - 0.12));
    Slab(sink, STONE, {
      x: p.x, y, z: p.z, w, h: course * 0.94, d, ry, seed: `${seed}:q${i}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 内部与站台家什（第二轮批次 E）
//
// 三条纪律照「内部空间契约」：家什全走 sink 几何（合批 + 破坏一致）、
// 材质只用本文件已经在用的那 10 个名字（不新增一个 draw call）、
// 内部没有独立光源 —— 售票房的光从北翼那六扇真洞窗与隔墙上的售票口进来。
// ---------------------------------------------------------------------------

/** 站台长椅一条：三根腿 + 座板 + 靠背，背贴站房外墙。 */
function PlatformBench(sink, { L, ry, yB, lx, lz, seed }) {
  const seat = L(lx, lz);
  Slab(sink, "WoodBeam", {
    x: seat.x, y: yB + 0.45, z: seat.z, w: 0.52, h: 0.07, d: 1.80, ry,
    seed: `${seed}:seat`, tile: TILE_METERS.wood,
  });
  for (const s of [-1, 0, 1]) {
    const p = L(lx, lz + s * 0.76);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 0.21, z: p.z, w: 0.46, h: 0.42, d: 0.10, ry,
      seed: `${seed}:leg${s}`, tile: TILE_METERS.wood,
    });
  }
  // 靠背贴着墙那一侧（局部 +x 方向就是站房）
  const back = L(lx + 0.30, lz);
  Slab(sink, "WoodBeam", {
    x: back.x, y: yB + 0.76, z: back.z, w: 0.07, h: 0.44, d: 1.80, ry,
    seed: `${seed}:back`, tile: TILE_METERS.wood,
  });
  sink.Solid(seat.x, yB + 0.26, seat.z, 0.3, 0.26, 0.9, "furniture", ry);
}

/**
 * 站名牌：两根柱夹一面**净牌**（1938 年三月的字样无资料，与 A7 的匾额同一口径）。
 * 牌面加一圈木框 —— 没有框的一块板在出图上读作「靠着两根杆的门板」，
 * 有了框才读作牌子。牌位定在雨棚下、南端车头停靠的那一段（三等小站的常规位置）。
 */
function StationNameBoard(sink, { L, ry, yB, lx, lz, seed }) {
  const boardY = yB + 1.86, halfZ = 0.78, halfY = 0.38;
  for (const s of [-1, 1]) {
    const p = L(lx, lz + s * halfZ);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 1.18, z: p.z, w: 0.12, h: 2.36, d: 0.12, ry,
      seed: `${seed}:post${s}`, tile: TILE_METERS.wood,
    });
    sink.Solid(p.x, yB + 1.18, p.z, 0.1, 1.18, 0.1, "villagePost", ry);
    // 柱头斜撑（短一档：0.88 m 的撑子在出图上和牌面连成一个 A 字）
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 1.34, z: p.z - s * 0.22, w: 0.07, h: 0.07, d: 0.62, ry,
      rx: s * 0.78, seed: `${seed}:brace${s}`, tile: TILE_METERS.wood,
    });
  }
  const c = L(lx, lz);
  Slab(sink, "WoodDoor", {
    x: c.x, y: boardY, z: c.z, w: 0.06, h: halfY * 2, d: halfZ * 2 - 0.06, ry,
    seed: `${seed}:panel`, tile: TILE_METERS.wood,
  });
  for (const s of [-1, 1]) {
    const h = L(lx - 0.03, lz);
    Slab(sink, "WoodBeam", {
      x: h.x, y: boardY + s * (halfY + 0.04), z: h.z, w: 0.09, h: 0.09, d: halfZ * 2 + 0.12, ry,
      seed: `${seed}:rail${s}`, tile: TILE_METERS.wood,
    });
    const v = L(lx - 0.03, lz + s * (halfZ + 0.02));
    Slab(sink, "WoodBeam", {
      x: v.x, y: boardY, z: v.z, w: 0.09, h: halfY * 2 + 0.16, d: 0.09, ry,
      seed: `${seed}:stile${s}`, tile: TILE_METERS.wood,
    });
  }
}

/**
 * 售票房（北翼，局部 z∈[6,17]）内部。
 *
 * 进来的路只有一条：镇子侧或站台侧的大门 → 站厅 → 隔墙上那道 1.3 m 的门。
 * 三等小站的售票房本来就不朝站台开门（票从窗口递出去，人不进来），
 * 所以「只能穿过站厅进」不是漏做，是形制。
 *
 * 售票口的位置与尺寸不许另起炉灶：它就是隔墙 Band 里 `{ c:-2.2, w:0.9 }`
 * 那个洞（y∈[yB+1.05, yB+1.9]），台面是已经在那儿的 `:counter` 那块木板。
 */
function TicketOffice(sink, {
  L, ry, yB, DX, eaveY, seed, damage, rnd,
}) {
  const winLx = -2.2;                    // 售票口在隔墙上的局部 x（与 Facade 的 gaps 对齐）
  const partLz = 6, endLz = 17;
  const inA = partLz + 0.25, inB = endLz - 0.5;

  // --- 两道木梁：屋里抬头有个交代（与站厅同一族做法）---
  for (const lz of [inA + 2.4, inB - 2.4]) {
    const p = L(0, lz);
    Slab(sink, "WoodBeam", {
      x: p.x, y: eaveY - 0.22, z: p.z, w: DX, h: 0.24, d: 0.20, ry,
      seed: `${seed}:tk:tie${Math.round(lz)}`, tile: TILE_METERS.wood,
    });
  }

  // --- 票窗格栅 ---
  // 栅下留 0.14 m 的递票缝（台面顶 yB+1.16，栅脚 yB+1.30）——
  // **这条缝是「售票窗」与「墙上一个方洞」的全部区别**，别把栅条砌到底。
  const gy0 = yB + 1.30, gy1 = yB + 1.88;
  for (const s of [-1, 1]) {
    const p = L(winLx + s * 0.50, partLz);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 1.475, z: p.z, w: 0.10, h: 0.85, d: 0.46, ry,
      seed: `${seed}:tk:jamb${s}`, tile: TILE_METERS.wood,
    });
  }
  {
    const p = L(winLx, partLz);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 1.94, z: p.z, w: 1.10, h: 0.10, d: 0.46, ry,
      seed: `${seed}:tk:head`, tile: TILE_METERS.wood,
    });
  }
  if (damage < 0.5) {
    for (let i = 0; i < 5; i += 1) {
      const p = L(winLx - 0.36 + i * 0.18, partLz);
      Slab(sink, "WoodBeam", {
        x: p.x, y: (gy0 + gy1) / 2, z: p.z, w: 0.05, h: gy1 - gy0, d: 0.11, ry,
        seed: `${seed}:tk:bar${i}`, tile: TILE_METERS.wood,
      });
    }
  }

  // --- 售票柜台：靠隔墙、正对售票口，掌柜背对北翼的窗子坐着 ---
  const cLz = partLz + 0.54, cW = 2.7;
  {
    const p = L(winLx, cLz);
    Slab(sink, STONE, {
      x: p.x, y: yB + 0.09, z: p.z, w: cW + 0.14, h: 0.18, d: 0.72, ry,
      seed: `${seed}:tk:cplinth`,
    });
    Slab(sink, "WoodDoor", {
      x: p.x, y: yB + 0.57, z: p.z, w: cW, h: 0.78, d: 0.62, ry,
      seed: `${seed}:tk:cbody`, tile: TILE_METERS.wood,
    });
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 1.00, z: p.z, w: cW + 0.18, h: 0.09, d: 0.80, ry,
      seed: `${seed}:tk:ctop`, tile: TILE_METERS.wood,
    });
    sink.Solid(p.x, yB + 0.52, p.z, (cW + 0.18) / 2, 0.52, 0.4, "furniture", ry);
  }
  // 票柜：一格一种票的鸽笼柜，摆在柜台一头（避开售票口那 0.9 m）
  {
    const p = L(winLx - 0.98, cLz - 0.06);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 1.40, z: p.z, w: 0.64, h: 0.70, d: 0.32, ry,
      seed: `${seed}:tk:rack`, tile: TILE_METERS.wood,
    });
    for (let i = 0; i < 3; i += 1) {
      const q = L(winLx - 0.98, cLz - 0.22);
      Slab(sink, "WoodDoor", {
        x: q.x, y: yB + 1.14 + i * 0.24, z: q.z, w: 0.58, h: 0.03, d: 0.03, ry,
        seed: `${seed}:tk:rk${i}`, tile: TILE_METERS.wood,
      });
    }
  }
  // 掌柜的高凳 + 台面上一摞票据
  {
    const p = L(winLx + 0.2, cLz + 0.92);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 0.62, z: p.z, w: 0.36, h: 0.06, d: 0.36, ry,
      seed: `${seed}:tk:stool`, tile: TILE_METERS.wood,
    });
    for (const s of [-1, 1]) {
      const q = L(winLx + 0.2 + s * 0.13, cLz + 0.92);
      Slab(sink, "WoodBeam", {
        x: q.x, y: yB + 0.30, z: q.z, w: 0.06, h: 0.60, d: 0.30, ry,
        seed: `${seed}:tk:sl${s}`, tile: TILE_METERS.wood,
      });
    }
    if (damage < 0.55) {
      const d = L(winLx + 0.95, cLz - 0.02);
      Slab(sink, "WoodDoor", {
        x: d.x, y: yB + 1.09, z: d.z, w: 0.30, h: 0.09, d: 0.24, ry,
        seed: `${seed}:tk:ledger`, tile: TILE_METERS.wood,
      });
    }
  }

  // --- 行李秤位：台秤 + 砝码 + 等着过秤的行李 ---
  // 三等小站没有独立的行李房柜台，行李在售票口这一侧过秤挂签。
  const sLx = 3.0, sLz = 9.8;
  {
    // **秤台压得很扁**：第一版底盘 0.14 + 台面 0.07 摞起来，箱子往上一放
    // 出图上读成「两只木箱叠在一起」（本包实拍抓到的）。磅秤的读图信号是
    // 「一块贴地的铁台 + 一根立柱 + 柱头挑出来的秤杆」，台越薄越像秤。
    const p = L(sLx, sLz);
    Slab(sink, "RailSteel", {
      x: p.x, y: yB + 0.045, z: p.z, w: 1.12, h: 0.09, d: 0.92, ry,
      seed: `${seed}:tk:scbase`, tile: TILE_METERS.steel,
    });
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 0.115, z: p.z, w: 0.96, h: 0.05, d: 0.76, ry,
      seed: `${seed}:tk:scdeck`, tile: TILE_METERS.wood,
    });
    const col = L(sLx + 0.48, sLz);
    Slab(sink, "RailSteel", {
      x: col.x, y: yB + 0.72, z: col.z, w: 0.14, h: 1.22, d: 0.14, ry,
      seed: `${seed}:tk:sccol`, tile: TILE_METERS.steel,
    });
    // 柱头的秤杆匣 + 挑出来的秤杆 + 游砣：三件合起来才认得出是磅秤
    Slab(sink, "RailSteel", {
      x: col.x, y: yB + 1.40, z: col.z, w: 0.22, h: 0.34, d: 0.30, ry,
      seed: `${seed}:tk:schead`, tile: TILE_METERS.steel,
    });
    const beam = L(sLx + 0.48, sLz + 0.52);
    Slab(sink, "RailSteel", {
      x: beam.x, y: yB + 1.50, z: beam.z, w: 0.05, h: 0.05, d: 0.94, ry,
      seed: `${seed}:tk:scbeam`, tile: TILE_METERS.steel,
    });
    const poise = L(sLx + 0.48, sLz + 0.74);
    Slab(sink, "RailSteel", {
      x: poise.x, y: yB + 1.43, z: poise.z, w: 0.09, h: 0.16, d: 0.09, ry,
      seed: `${seed}:tk:scpoise`, tile: TILE_METERS.steel,
    });
    sink.Solid(p.x, yB + 0.09, p.z, 0.56, 0.09, 0.46, "furniture", ry);
    // 砝码三只：摆在立柱外侧的地上（挡在秤台后面就等于没做）
    for (let i = 0; i < 3; i += 1) {
      const q = L(sLx + 0.92, sLz - 0.72 + i * 0.24);
      Slab(sink, "RailSteel", {
        x: q.x, y: yB + 0.09, z: q.z, w: 0.14, h: 0.18, d: 0.14, ry,
        seed: `${seed}:tk:wt${i}`, tile: TILE_METERS.steel,
      });
    }
  }
  // 行李：秤上一只木箱，脚边两只（damage 高时只剩一只 —— 东西都拿走了）
  {
    const on = L(sLx - 0.10, sLz + 0.04);
    Slab(sink, "WoodDoor", {
      x: on.x, y: yB + 0.37, z: on.z, w: 0.62, h: 0.46, d: 0.48,
      ry: ry + 0.12, seed: `${seed}:tk:bag0`, tile: TILE_METERS.wood,
    });
    const cases = damage > 0.45 ? 1 : 2;
    for (let i = 0; i < cases; i += 1) {
      const q = L(sLx - 1.35 - i * 0.1, sLz + 1.15 + i * 0.78);
      const h = 0.40 + rnd() * 0.14;
      Slab(sink, "WoodDoor", {
        x: q.x, y: yB + h / 2, z: q.z, w: 0.66, h, d: 0.52,
        ry: ry + (rnd() - 0.5) * 0.5, seed: `${seed}:tk:bag${i + 1}`, tile: TILE_METERS.wood,
      });
      sink.Solid(q.x, yB + h / 2, q.z, 0.35, h / 2, 0.3, "prop", ry);
    }
  }
}

// ===========================================================================
// 车站
// ===========================================================================

/**
 * 月台南端的行包与行车家什。
 *
 * 站房、月台、正线本身已经把「铁路」讲清楚；这一组不另起一栋推定建筑，
 * 只补上 1938 年小站每天都会留下的可读痕迹：两架机械臂板信号机、货门外的
 * 装卸木台、待运木箱和两辆手推行李车。俯瞰时，信号臂和木台把长条月台的用途
 * 钉死；走到地面，箱垛、轮子和吊钩又给人一个能相信的尺度。
 */
function StationOperations(sink, {
  L, ry, y0, yB, railX, stationZ, westFace, seed,
}) {
  // --- 机械臂板信号机 ---
  // 两端各一架，设在站台以外、正线东侧。臂板朝南北伸出，远看是两根高杆
  // 加一条横臂；近看补上配重和梯档，避免读成电线杆。它们不挡正线或月台通路。
  for (const [i, offsetZ] of [-40, 40].entries()) {
    const z = stationZ + offsetZ;
    const x = railX + 2.15;
    const baseY = y0 + 0.42;
    Slab(sink, "RailSteel", {
      x, y: baseY + 2.35, z, w: 0.16, h: 4.70, d: 0.16,
      seed: `${seed}:signal${i}:mast`, tile: TILE_METERS.steel,
    });
    // 基脚的石墩让细杆在俯瞰图上有一个明确的落点。
    Slab(sink, STONE, {
      x, y: baseY + 0.12, z, w: 0.64, h: 0.24, d: 0.64,
      seed: `${seed}:signal${i}:foot`,
    });
    const direction = i === 0 ? 1 : -1;
    Slab(sink, "WoodDoor", {
      x, y: baseY + 4.35, z: z + direction * 0.74, w: 0.12, h: 0.24, d: 1.52,
      ry, seed: `${seed}:signal${i}:arm`, tile: TILE_METERS.wood,
    });
    Slab(sink, "RailSteel", {
      x, y: baseY + 3.88, z: z - direction * 0.16, w: 0.28, h: 0.28, d: 0.28,
      seed: `${seed}:signal${i}:counterweight`, tile: TILE_METERS.steel,
    });
    for (let rung = 0; rung < 5; rung += 1) {
      Slab(sink, "RailSteel", {
        x, y: baseY + 0.95 + rung * 0.56, z, w: 0.48, h: 0.055, d: 0.07,
        seed: `${seed}:signal${i}:rung${rung}`, tile: TILE_METERS.steel,
      });
    }
    sink.Solid(x, baseY + 2.1, z, 0.16, 2.1, 0.16, "villagePost");
  }

  // --- 南翼货门外的低木装卸台 ---
  // 放在既有货门旁、靠站台边，给月台留下穿行线；不用再造一间没有资料支持的
  // 货栈，也让玩家从地面看得出南翼不是第二间候车室。
  const apronLx = westFace - 2.45;
  const apronLz = -12.4;
  const apron = L(apronLx, apronLz);
  Slab(sink, "WoodBeam", {
    x: apron.x, y: yB + 0.10, z: apron.z, w: 2.45, h: 0.16, d: 6.8, ry,
    seed: `${seed}:freight:apron`, tile: TILE_METERS.wood,
  });
  for (const offset of [-2.75, -1.38, 0, 1.38, 2.75]) {
    const p = L(apronLx, apronLz + offset);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 0.22, z: p.z, w: 2.68, h: 0.09, d: 0.12, ry,
      seed: `${seed}:freight:plank${Math.round((offset + 3) * 10)}`, tile: TILE_METERS.wood,
    });
  }

  const Crate = (index, lx, lz, w, h, d) => {
    const p = L(lx, lz);
    Slab(sink, "WoodDoor", {
      x: p.x, y: yB + 0.16 + h / 2, z: p.z, w, h, d, ry,
      seed: `${seed}:freight:crate${index}`, tile: TILE_METERS.wood,
    });
    // 两条压箱木：在顶视图把箱子读成货箱而不是随手一块木板。
    for (const side of [-1, 1]) {
      const band = L(lx + side * (w / 2 + 0.025), lz);
      Slab(sink, "WoodBeam", {
        x: band.x, y: yB + 0.16 + h / 2, z: band.z, w: 0.07, h: h + 0.05, d: d + 0.08, ry,
        seed: `${seed}:freight:crate${index}:band${side}`, tile: TILE_METERS.wood,
      });
    }
    sink.Solid(p.x, yB + 0.16 + h / 2, p.z, w / 2, h / 2, d / 2, "furniture", ry);
  };
  Crate(0, apronLx, apronLz - 1.62, 0.92, 0.86, 1.08);
  Crate(1, apronLx - 0.72, apronLz + 0.28, 0.78, 0.64, 0.86);
  Crate(2, apronLx + 0.78, apronLz + 1.54, 0.72, 1.22, 0.76);

  // --- 两辆行李手推车 ---
  // 车停在箱垛北边，避开货门与主站厅的门轴。木台 + 钢轮 + 把手足够形成
  // 小尺度的作业语义，且只复用本文件已在用的材质批次。
  for (const [i, lz] of [-7.8, -5.6].entries()) {
    const lx = westFace - 2.25;
    const p = L(lx, lz);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 0.42, z: p.z, w: 1.16, h: 0.12, d: 0.72, ry,
      seed: `${seed}:cart${i}:bed`, tile: TILE_METERS.wood,
    });
    for (const side of [-1, 1]) {
      const wheel = L(lx + side * 0.42, lz - 0.23);
      Slab(sink, "RailSteel", {
        x: wheel.x, y: yB + 0.22, z: wheel.z, w: 0.18, h: 0.34, d: 0.12, ry,
        seed: `${seed}:cart${i}:wheel${side}`, tile: TILE_METERS.steel,
      });
    }
    const handle = L(lx, lz + 0.64);
    Slab(sink, "WoodBeam", {
      x: handle.x, y: yB + 0.72, z: handle.z, w: 0.12, h: 0.12, d: 0.88, ry,
      rx: 0.54, seed: `${seed}:cart${i}:handle`, tile: TILE_METERS.wood,
    });
    sink.Solid(p.x, yB + 0.28, p.z, 0.58, 0.28, 0.36, "furniture", ry);
  }
}

export function BuildStation(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry || 0;
  const seed = `map:${f.id || "station"}`;
  const rnd = Mulberry32(HashString(`${seed}:station`));
  const damage = Clamp(ctx.damage ?? 0.2, 0, 0.6);
  const rw = f.railway || RAILWAY;

  // 站房脚下的地：OUTER_PADS 的 Station 把这一片垫到 y=0（编辑器替身恒 0）
  const y0 = host.OuterHeight(f.x, f.z);
  const PLAT_H = 0.75;                 // 站台面 = 站房室内地坪（低站台，1911 年的常规）
  const yB = y0 + PLAT_H;

  const LZ = f.w;                      // 长向（沿铁路）34
  const DX = f.d;                      // 进深 12
  const T = 0.5;                       // 清水砖外墙厚
  const L = MakeFrame(f.x, f.z, ry);

  const wingEave = yB + 4.3;
  const midEave = yB + 6.9;            // 局部两层
  const rise = (DX / 2) * Math.tan(35 * Math.PI / 180);   // 陡坡 35°
  const wingRidge = wingEave + rise;
  const midRidge = midEave + rise;
  const midHalf = 6;                   // 中段 12 m，两翼各 11 m
  const wingMid = (midHalf + LZ / 2) / 2;
  const wingLen = LZ / 2 - midHalf;

  const railX = rw.x;
  const westFace = -DX / 2;            // 站台侧墙心所在的局部 x（墙心 -DX/2+T/2）
  const platEdgeX = railX + 3.6;       // 站台边缘离轨心 3.6 m（低站台限界，推定）

  // --- 站台 + 站房基座：同一块石台，站房就坐在它上面 ---
  {
    const platInnerX = f.x + westFace;                 // 站房西墙外皮
    const platW = platInnerX - platEdgeX;
    const platCx = (platInnerX + platEdgeX) / 2;
    const platLen = 60;                                // 60 m（推定；见末尾登记）
    const bottom = y0 - 1.7;                           // 埋进濠外原野（-1.2 起伏 ±0.6）
    Slab(sink, STONE, {
      x: platCx, y: (yB + bottom) / 2, z: f.z, w: platW, h: yB - bottom, d: platLen,
      seed: `${seed}:plat`, tile: TILE_METERS.ground,
    });
    sink.Solid(platCx, (yB + bottom) / 2, f.z, platW / 2, (yB - bottom) / 2, platLen / 2,
      "villageFoundation");
    // 站台边缘石：出挑 0.06，是站台在俯瞰图上的那条白线
    Slab(sink, STONE, {
      x: platEdgeX + 0.3, y: yB + 0.03, z: f.z, w: 0.7, h: 0.12, d: platLen,
      seed: `${seed}:edge`,
    });
    // 站房基座（站台之外的那一半，东侧到墙外皮）
    const baseCx = f.x + 0.4;
    Slab(sink, STONE, {
      x: baseCx, y: (yB + bottom) / 2, z: f.z, w: DX + 0.8, h: yB - bottom, d: LZ + 0.8,
      seed: `${seed}:podium`, tile: TILE_METERS.ground,
    });
    sink.Solid(baseCx, (yB + bottom) / 2, f.z, (DX + 0.8) / 2, (yB - bottom) / 2, (LZ + 0.8) / 2,
      "villageFoundation");
    // 两端的斜坡：站台不能是一圈 0.75 m 的坎（引擎自动抬腿只有 0.55 m）
    for (const s of [-1, 1]) {
      const rampLen = 3.6;
      const cz = f.z + s * (platLen / 2 + rampLen / 2 - 0.2);
      const ang = Math.atan2(PLAT_H, rampLen);
      Slab(sink, STONE, {
        x: platCx, y: yB - PLAT_H / 2 - 0.05, z: cz, w: Math.min(platW, 6.0), h: 0.5, d: rampLen + 0.6,
        rx: s * ang, seed: `${seed}:ramp${s}`, tile: TILE_METERS.ground,
      });
      sink.Solid(platCx, y0 + PLAT_H * 0.45, cz, Math.min(platW, 6.0) / 2, PLAT_H * 0.45, rampLen / 2,
        "villageFoundation");
    }
    // 东侧（镇子那一面）主门前的三级台阶
    for (let i = 0; i < 3; i += 1) {
      const h = PLAT_H * (1 - i / 3);
      const px = f.x + DX / 2 + 0.6 + i * 0.42;
      Slab(sink, STONE, {
        x: px, y: y0 + h / 2, z: f.z, w: 0.46, h, d: 3.6, seed: `${seed}:step${i}`,
      });
      sink.Solid(px, y0 + h / 2, f.z, 0.23, h / 2, 1.8, "villageFoundation");
    }
    // 室内砖墁地（站厅 + 两翼一块铺到底）。
    //
    // 站台、基座、门槛全是 PlatformStone（0xd9dade），白天整片亮到过曝 ——
    // 站厅的地板与站台是同一块石头，站在屋里与站在露天一个亮度，「进了屋」
    // 这件事在画面上根本不成立（第一版内景实拍：站厅地面一片死白）。
    // 铺一层 StationBrick 就够了：不新起地面材质，这一片分区里不多一个 draw call。
    Slab(sink, BRICK, {
      x: f.x, y: yB - 0.005, z: f.z, w: DX - 1.04, h: 0.08, d: LZ - 1.04, ry,
      seed: `${seed}:ifloor`, tile: TILE_METERS.brick, grid: BRICK_UV_GRID,
    });
  }

  // --- 墙体 ---
  const zWallRy = ry - Math.PI / 2;      // 沿局部 z 走的墙：沿墙 + 方向 = 局部 +z
  const wallCx = DX / 2 - T / 2;
  const sillY = yB + 1.05, headY = yB + 2.95;          // 一层窗
  const upSill = yB + 4.6, upHead = yB + 6.2;          // 二层窗（中段）
  const doorHead = yB + 3.05;

  /** 一段外墙（含窗/门洞、石套与碰撞）。openings 的 c 是沿墙局部坐标。 */
  const Facade = (tag, { lxSign, lz0, lz1, top, openings }) => {
    const len = lz1 - lz0;
    const cz = (lz0 + lz1) / 2;
    const p = L(lxSign * wallCx, cz);
    const doors = openings.filter((o) => o.type === "door");
    const rel = (o) => o.c - cz;
    // 洞口以下：整条实墙（门洞落地，窗洞不落地）
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry: zWallRy, len, y0: yB, y1: sillY, thickness: T,
      seed: `${seed}:${tag}:b0`, gaps: doors.map((o) => ({ c: rel(o), w: o.w })),
    });
    // 一层洞口那一条
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry: zWallRy, len, y0: sillY, y1: headY, thickness: T,
      seed: `${seed}:${tag}:b1`,
      gaps: openings.filter((o) => !o.up).map((o) => ({ c: rel(o), w: o.w })),
    });
    // 门头到窗头之间（门比窗高）
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry: zWallRy, len, y0: headY, y1: doorHead, thickness: T,
      seed: `${seed}:${tag}:b2`, gaps: doors.map((o) => ({ c: rel(o), w: o.w })),
    });
    const hasUp = openings.some((o) => o.up);
    if (hasUp) {
      Band(sink, BRICK, {
        cx: p.x, cz: p.z, ry: zWallRy, len, y0: doorHead, y1: upSill, thickness: T,
        seed: `${seed}:${tag}:b3`,
      });
      Band(sink, BRICK, {
        cx: p.x, cz: p.z, ry: zWallRy, len, y0: upSill, y1: upHead, thickness: T,
        seed: `${seed}:${tag}:b4`, gaps: openings.filter((o) => o.up).map((o) => ({ c: rel(o), w: o.w })),
      });
      Band(sink, BRICK, {
        cx: p.x, cz: p.z, ry: zWallRy, len, y0: upHead, y1: top, thickness: T,
        seed: `${seed}:${tag}:b5`,
      });
    } else {
      Band(sink, BRICK, {
        cx: p.x, cz: p.z, ry: zWallRy, len, y0: doorHead, y1: top, thickness: T,
        seed: `${seed}:${tag}:b6`,
      });
    }
    // 檐口填砌：屋面斜板在墙心处已经比檐口高出 0.34 m，砌到檐口就等于沿两条
    // 长墙各留一条通天的缝 —— 站在站厅里抬头看得见星空（第一版内景出图抓到）。
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry: zWallRy, len, y0: top, y1: top + 0.45, thickness: T,
      seed: `${seed}:${tag}:eave`,
    });
    // 石套
    for (const o of openings) {
      if (o.type === "door") {
        DoorDress(sink, {
          cx: p.x, cz: p.z, ry: zWallRy, off: rel(o), floorY: yB, headY: doorHead,
          openW: o.w, thickness: T, seed: `${seed}:${tag}:d${Math.round(o.c * 10)}`,
        });
      } else {
        StoneWindow(sink, {
          cx: p.x, cz: p.z, ry: zWallRy, off: rel(o),
          sillY: o.up ? upSill : sillY, headY: o.up ? upHead : headY,
          openW: o.w, thickness: T, seed: `${seed}:${tag}:w${Math.round(o.c * 10)}${o.up ? "u" : ""}`,
          mullions: rnd() > damage * 1.6,
        });
      }
    }
    // 碰撞：**跟着上面那几条 Band 走** —— 砌了砖的地方才有盒子。
    // 旧版只按门洞分段、且通高一只盒，于是每一扇石套窗都是「看得见的洞 +
    // 摸得着的墙」：站在站台上朝窗口扔手榴弹，弹回脸上（玩家实测报的就是这里）。
    // 门楣以上、窗楣以上这几条带照旧登记 —— 它们的底面高过 1.6 m，
    // NavGrid 与 AiDirector.Blocked 都跳过，门口不会被判成死路。
    SolidWithOpenings(sink, {
      x: p.x, z: p.z, ry: zWallRy, length: len, y0: yB, y1: top + 0.45, thickness: T,
      openings: openings.map((o) => ({
        c: rel(o),
        w: o.w,
        y0: o.type === "door" ? yB : (o.up ? upSill : sillY),
        y1: o.type === "door" ? doorHead : (o.up ? upHead : headY),
      })),
    });
    sink.Cover(p.x, p.z, top - y0, lxSign * Math.cos(ry), -lxSign * Math.sin(ry));
  };

  // 站台侧（西）：中段一道大门 + 两扇高窗 + 二层三扇；两翼各两窗一门
  Facade("w-mid", {
    lxSign: -1, lz0: -midHalf, lz1: midHalf, top: midEave,
    openings: [
      { type: "door", c: 0, w: 2.4 },
      { type: "win", c: -3.7, w: 1.35 }, { type: "win", c: 3.7, w: 1.35 },
      { type: "win", c: -3.6, w: 1.15, up: true },
      { type: "win", c: 0, w: 1.15, up: true },
      { type: "win", c: 3.6, w: 1.15, up: true },
    ],
  });
  Facade("w-s", {
    lxSign: -1, lz0: -LZ / 2, lz1: -midHalf, top: wingEave,
    openings: [
      { type: "win", c: -14.4, w: 1.25 },
      { type: "door", c: -11.3, w: 1.5 },
      { type: "win", c: -8.3, w: 1.25 },
    ],
  });
  Facade("w-n", {
    lxSign: -1, lz0: midHalf, lz1: LZ / 2, top: wingEave,
    openings: [
      { type: "win", c: 8.3, w: 1.25 },
      { type: "win", c: 11.3, w: 1.25 },
      { type: "win", c: 14.4, w: 1.25 },
    ],
  });
  // 镇子侧（东）：主入口在中段，两翼各三窗（南翼一扇货门）
  Facade("e-mid", {
    lxSign: 1, lz0: -midHalf, lz1: midHalf, top: midEave,
    openings: [
      { type: "door", c: 0, w: 2.2 },
      { type: "win", c: -3.7, w: 1.35 }, { type: "win", c: 3.7, w: 1.35 },
      { type: "win", c: -2.4, w: 1.15, up: true },
      { type: "win", c: 2.4, w: 1.15, up: true },
    ],
  });
  Facade("e-s", {
    lxSign: 1, lz0: -LZ / 2, lz1: -midHalf, top: wingEave,
    openings: [
      { type: "win", c: -14.4, w: 1.25 },
      { type: "door", c: -11.3, w: 1.8 },
      { type: "win", c: -8.3, w: 1.25 },
    ],
  });
  Facade("e-n", {
    lxSign: 1, lz0: midHalf, lz1: LZ / 2, top: wingEave,
    openings: [
      { type: "win", c: 8.3, w: 1.25 },
      { type: "win", c: 11.3, w: 1.25 },
      { type: "win", c: 14.4, w: 1.25 },
    ],
  });

  // 两端山墙（沿局部 x 走）+ 山尖
  for (const s of [-1, 1]) {
    const lz = s * (LZ / 2 - T / 2);
    const p = L(0, lz);
    const openings = [{ c: -2.7, w: 1.15 }, { c: 2.7, w: 1.15 }];
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: yB, y1: sillY, thickness: T, seed: `${seed}:end${s}:b0`,
    });
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: sillY, y1: headY, thickness: T,
      seed: `${seed}:end${s}:b1`, gaps: openings,
    });
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: headY, y1: wingEave, thickness: T, seed: `${seed}:end${s}:b2`,
    });
    for (const o of openings) {
      StoneWindow(sink, {
        cx: p.x, cz: p.z, ry, off: o.c, sillY, headY, openW: o.w, thickness: T,
        seed: `${seed}:end${s}w${o.c}`, mullions: rnd() > damage * 1.6,
      });
    }
    GableWall(sink, BRICK, {
      L, lz, width: DX, eaveY: wingEave, ridgeY: wingRidge, thickness: T, ry,
      seed: `${seed}:end${s}`,
    });
    // 两端山墙的碰撞同样让开那两扇窗（同 Facade 的理由）
    SolidWithOpenings(sink, {
      x: p.x, z: p.z, ry, length: DX, y0: yB, y1: wingEave, thickness: T,
      openings: openings.map((o) => ({ c: o.c, w: o.w, y0: sillY, y1: headY })),
    });
    // 四角石转角
    for (const sx of [-1, 1]) {
      Quoin(sink, {
        L, lx: sx * DX / 2, lz, sx, sz: s, y0: yB, y1: wingEave - 0.2, ry,
        seed: `${seed}:qn${s}${sx}`,
      });
    }
  }

  // 中段两道横墙（= 站厅与两翼的隔墙，也是露在翼屋面之上的那两片山墙）
  for (const s of [-1, 1]) {
    const lz = s * midHalf;
    const p = L(0, lz);
    const t = 0.4;
    // 售票口开在北隔墙上：一个 0.9 m 的小洞 + 木台面
    const isTicket = s > 0;
    const doorC = s > 0 ? 2.6 : 0;
    const gaps = [{ c: doorC, w: 1.3 }];
    if (isTicket) gaps.push({ c: -2.2, w: 0.9 });
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: yB, y1: yB + 1.05, thickness: t,
      seed: `${seed}:part${s}:b0`, gaps: [{ c: doorC, w: 1.3 }],
    });
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: yB + 1.05, y1: yB + 1.9, thickness: t,
      seed: `${seed}:part${s}:b1`, gaps,
    });
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: yB + 1.9, y1: yB + 2.5, thickness: t,
      seed: `${seed}:part${s}:b2`, gaps: [{ c: doorC, w: 1.3 }],
    });
    Band(sink, BRICK, {
      cx: p.x, cz: p.z, ry, len: DX, y0: yB + 2.5, y1: midEave, thickness: t,
      seed: `${seed}:part${s}:b3`,
    });
    GableWall(sink, BRICK, {
      L, lz, width: DX, eaveY: midEave, ridgeY: midRidge, thickness: t, ry,
      seed: `${seed}:part${s}`,
    });
    if (isTicket) {
      // 售票口的台面：**要伸出墙面**。第一版做成 0.62 厚（= 隔墙厚 + 一点点）、
      // 顶面 yB+1.07 正好贴着洞口下沿 yB+1.05 —— 从站厅那边看根本看不见它，
      // 洞口下半截直接望进售票房的地面。伸出两侧各 0.28 m、顶面抬到 yB+1.16 之后，
      // 它才是「递票的那块板」。
      const tp = L(-2.2, lz);
      Slab(sink, "WoodBeam", {
        x: tp.x, y: yB + 1.10, z: tp.z, w: 1.32, h: 0.12, d: 0.96, ry,
        seed: `${seed}:counter`, tile: TILE_METERS.wood,
      });
    }
    // 门洞两侧登记碰撞（门口不登记，AI 与玩家要能穿过站厅）
    for (const side of [-1, 1]) {
      const a = side < 0 ? -DX / 2 : doorC + 0.65;
      const b = side < 0 ? doorC - 0.65 : DX / 2;
      if (b - a < 0.3) continue;
      const q = L((a + b) / 2, lz);
      sink.Solid(q.x, (yB + midEave) / 2, q.z, (b - a) / 2, (midEave - yB) / 2, t / 2, "wall", ry);
    }
  }

  // --- 屋面：两翼低、中段高。中段的高屋面骑在两翼之上，是「局部两层」的读图落点 ---
  for (const s of [-1, 1]) {
    GableRoof(sink, {
      L, lz: s * (wingMid + 0.25), lengthZ: wingLen + 0.5, depthX: DX + 0.5,
      eaveY: wingEave, ridgeY: wingRidge, ry, seed: `${seed}:wr${s}`, overZ: 0,
    });
  }
  GableRoof(sink, {
    L, lz: 0, lengthZ: midHalf * 2, depthX: DX + 0.5,
    eaveY: midEave, ridgeY: midRidge, ry, seed: `${seed}:mr`, overZ: 0.5,
  });
  // 烟囱：中段屋脊上一根，比脊高 1.6 m
  {
    const p = L(0, 3.2);
    Slab(sink, "ChimneyBrick", {
      x: p.x, y: (midEave + midRidge + 1.6) / 2, z: p.z, w: 0.85, h: midRidge + 1.6 - midEave,
      d: 0.85, ry, seed: `${seed}:chim`, tile: TILE_METERS.brick, grid: BRICK_UV_GRID,
    });
    Slab(sink, STONE, {
      x: p.x, y: midRidge + 1.68, z: p.z, w: 1.05, h: 0.16, d: 1.05, ry, seed: `${seed}:chimcap`,
    });
  }

  // --- 木构月台雨棚：柱列 + 单坡瓦面。站台上唯一的木头，也是站台的进深交代 ---
  {
    const postLx = westFace - 6.2;
    const wallLx = westFace + 0.1;
    const attachY = yB + 3.6;
    const headY2 = yB + 2.75;
    const run = 32;                       // 沿站台 32 m
    const span = wallLx - postLx;
    const ang = Math.atan2(attachY - headY2, span);
    const posts = 9;
    for (let i = 0; i < posts; i += 1) {
      const lz = -run / 2 + (run / (posts - 1)) * i;
      const p = L(postLx, lz);
      Slab(sink, "WoodBeam", {
        x: p.x, y: yB + (headY2 - yB) / 2, z: p.z, w: 0.22, h: headY2 - yB, d: 0.22, ry,
        seed: `${seed}:post${i}`, tile: TILE_METERS.wood,
      });
      sink.Solid(p.x, yB + (headY2 - yB) / 2, p.z, 0.13, (headY2 - yB) / 2, 0.13, "balk", ry);
      // 柱头斜撑（向雨棚外侧）
      Slab(sink, "WoodBeam", {
        x: p.x - 0.42, y: headY2 - 0.42, z: p.z, w: 1.25, h: 0.11, d: 0.11, ry, rz: 0.78,
        seed: `${seed}:brace${i}`, tile: TILE_METERS.wood,
      });
      // 檩下椽
      const rp = L(postLx + span / 2, lz);
      Slab(sink, "WoodBeam", {
        x: rp.x, y: (attachY + headY2) / 2 - 0.12, z: rp.z, w: span + 0.9, h: 0.12, d: 0.14,
        ry, rz: ang, seed: `${seed}:raft${i}`, tile: TILE_METERS.wood,
      });
    }
    const bp = L(postLx, 0);
    Slab(sink, "WoodBeam", {
      x: bp.x, y: headY2 + 0.13, z: bp.z, w: 0.2, h: 0.26, d: run + 0.8, ry,
      seed: `${seed}:plate`, tile: TILE_METERS.wood,
    });
    const wp = L(wallLx, 0);
    Slab(sink, "WoodBeam", {
      x: wp.x, y: attachY + 0.13, z: wp.z, w: 0.24, h: 0.26, d: run + 0.8, ry,
      seed: `${seed}:wallplate`, tile: TILE_METERS.wood,
    });
    // 瓦面（破损档位高时缺一块，缺口露出椽子）
    const deckLen = damage > 0.35 ? run * 0.62 : run + 0.8;
    const deckCz = damage > 0.35 ? -run * 0.16 : 0;
    const dp = L(postLx + span / 2 - 0.25, deckCz);
    Slab(sink, "RoofTile", {
      x: dp.x, y: (attachY + headY2) / 2 + 0.03, z: dp.z, w: span + 1.5, h: 0.12, d: deckLen,
      ry, rz: ang, seed: `${seed}:deck`, tile: TILE_METERS.roof,
    });
    const fp = L(postLx - 0.6, deckCz);
    Slab(sink, "WoodBeam", {
      x: fp.x, y: headY2 + 0.02, z: fp.z, w: 0.1, h: 0.24, d: deckLen, ry,
      seed: `${seed}:fascia`, tile: TILE_METERS.wood,
    });
    // 站名牌位：雨棚下南段（车头停靠的那一截），净牌不刻字
    StationNameBoard(sink, {
      L, ry, yB, lx: postLx + 1.6, lz: -run / 2 + 3.0, seed: `${seed}:name`,
    });
  }

  // --- 站台长椅两条：背贴站房西墙，避开中段大门与南翼货门 ---
  // 站台上除了雨棚柱子没有任何等车的人可以落脚的地方 —— 长椅是「这是月台
  // 不是一条石头堤」最便宜的一句话。座面 0.45 m 高，靠背贴墙不占站台净宽。
  for (const lz of [-6.0, 4.2]) {
    PlatformBench(sink, {
      L, ry, yB, lx: westFace - 0.40, lz, seed: `${seed}:bench${Math.round(lz)}`,
    });
  }

  // 站厅是通到屋架的一间高房：三道木梁把两片高墙拉住，也给这间屋顶一个交代
  for (let i = -1; i <= 1; i += 1) {
    const p = L(0, i * 3.6);
    Slab(sink, "WoodBeam", {
      x: p.x, y: midEave - 0.2, z: p.z, w: DX, h: 0.26, d: 0.22, ry,
      seed: `${seed}:tie${i}`, tile: TILE_METERS.wood,
    });
  }

  // --- 站厅里的两条长凳 ---
  //
  // **靠南隔墙横着摆，不在门轴上。** 第一版把两条凳子顺着进深摆在 lx=±3.6、
  // lz∈[-2.8, 0.4] —— 两道大门都在 lz=0，于是从镇子侧或站台侧进门走两米就
  // 撞在凳子上（本包探针实测 tag=furniture）。候车室的长凳本来也是靠墙排的：
  // 现在贴南隔墙（行李房那道），中间留 2.2 m 让开南翼货房的门与穿堂的路。
  for (const s of [-1, 1]) {
    const p = L(s * 2.6, -5.15);
    Slab(sink, "WoodBeam", {
      x: p.x, y: yB + 0.45, z: p.z, w: 3.0, h: 0.09, d: 0.50, ry,
      seed: `${seed}:bench${s}`, tile: TILE_METERS.wood,
    });
    for (const k of [-1, 1]) {
      const q = L(s * 2.6 + k * 1.28, -5.15);
      Slab(sink, "WoodBeam", {
        x: q.x, y: yB + 0.21, z: q.z, w: 0.12, h: 0.42, d: 0.44, ry,
        seed: `${seed}:bl${s}${k}`, tile: TILE_METERS.wood,
      });
    }
    // 靠背贴隔墙
    const b = L(s * 2.6, -5.42);
    Slab(sink, "WoodBeam", {
      x: b.x, y: yB + 0.76, z: b.z, w: 3.0, h: 0.44, d: 0.07, ry,
      seed: `${seed}:bb${s}`, tile: TILE_METERS.wood,
    });
    sink.Solid(p.x, yB + 0.25, p.z, 1.5, 0.25, 0.28, "furniture", ry);
  }

  // --- 站厅的铸铁炉：屋脊上那根烟囱到今天为止没有下文 ---
  // 烟囱是 B1 就摆好的（中段脊上 +1.6 m），可站厅里没有任何烧火的东西，
  // 从屋里抬头看是「一根没有炉子的烟囱」。炉身 + 一节竖管 + 一节横管接到
  // 烟囱正下方（L(0, 3.2)），三只盒子把这条线补上。
  // 炉子摆在东北角（lx=4.4）——**不许摆在门轴上**：两道大门都在 lz=0，
  // 炉身半径 0.32 m 摆在 lx≈2 就把穿堂的路堵掉一半（长凳那一条同理）。
  {
    const st = L(4.4, 3.2);
    Slab(sink, "RailSteel", {
      x: st.x, y: yB + 0.37, z: st.z, w: 0.56, h: 0.74, d: 0.56, ry,
      seed: `${seed}:stove`, tile: TILE_METERS.steel,
    });
    Slab(sink, "RailSteel", {
      x: st.x, y: yB + 0.79, z: st.z, w: 0.66, h: 0.10, d: 0.66, ry,
      seed: `${seed}:stovetop`, tile: TILE_METERS.steel,
    });
    sink.Solid(st.x, yB + 0.42, st.z, 0.32, 0.42, 0.32, "furniture", ry);
    Slab(sink, "RailSteel", {
      x: st.x, y: yB + 1.62, z: st.z, w: 0.13, h: 1.56, d: 0.13, ry,
      seed: `${seed}:flue0`, tile: TILE_METERS.steel,
    });
    const run = L(2.2, 3.2);
    Slab(sink, "RailSteel", {
      x: run.x, y: yB + 2.45, z: run.z, w: 4.4, h: 0.13, d: 0.13, ry,
      seed: `${seed}:flue1`, tile: TILE_METERS.steel,
    });
    const up = L(0, 3.2);
    Slab(sink, "RailSteel", {
      x: up.x, y: (yB + 2.45 + midEave) / 2, z: up.z, w: 0.13, h: midEave - yB - 2.45, d: 0.13, ry,
      seed: `${seed}:flue2`, tile: TILE_METERS.steel,
    });
    // 煤斗
    const coal = L(4.45, 4.35);
    Slab(sink, "WoodDoor", {
      x: coal.x, y: yB + 0.19, z: coal.z, w: 0.42, h: 0.38, d: 0.36, ry: ry + 0.2,
      seed: `${seed}:coal`, tile: TILE_METERS.wood,
    });
  }

  // --- 售票房内部（北翼）---
  TicketOffice(sink, {
    L, ry, yB, DX, eaveY: wingEave, seed, damage, rnd,
  });

  StationOperations(sink, {
    L, ry, y0, yB, railX, stationZ: f.z, westFace, seed,
  });

  BuildRailway(host, f, ctx, rw);
}

// ===========================================================================
// 城西段津浦铁路
//
// 参照 Script_TengxianOutfield.BuildRailway 的做法**在本文件内自建**
//（契约禁止 import 城模块；outfield 也不是本关的场景）。三条与野外版不同：
//   · 路基压得很低（0.46 m）。野外那条 1.35 m 的堤在城关里会把导航沿 x=-480
//     切成两半（NavGrid 的判据是盒顶高出地面 0.56 m），而 L1 的出生点
//     (-480,-205) **就站在这条线上** —— 堤高一档，玩家开局就卡在道砟里。
//   · 轨面高程走「地面平滑值 + 0.46」并夹在 [地面+0.15, 地面+0.50]：
//     车站那一片被 OUTER_PADS 垫到 y=0，濠外原野在 -1.2，不平滑就是一个台阶。
//   · 近段（车站与出生点之间）枕木 1.2 m 一根、进 sink；远段 3.0 m 一根、
//     进 farSink（不投影）——远处靠雾吃掉，投影没有意义。
// ===========================================================================

function BuildRailway(host, f, ctx, rw) {
  const sink = host.sink;
  const farSink = host.farSink;
  const rnd = Mulberry32(HashString(`map:${f.id || "station"}:rail`));
  const fromZ = rw.fromZ !== undefined ? Math.max(rw.fromZ, -330) : -330;
  const toZ = rw.toZ !== undefined ? Math.min(rw.toZ, 330) : 330;
  const railX = rw.x;
  const halfGauge = (rw.gauge || 1.435) / 2;
  const crossings = rw.crossings || [0];
  const CROSS_HALF = 4.5;
  const InCrossing = (z) => crossings.some((c) => Math.abs(z - c) < CROSS_HALF);

  // 分区：桶名跟着世界坐标走，否则 660 m 的钢轨会和车站合成同一只网格，
  // 视锥剔除对它完全失效（Script_World.BuildSink.SetSector 的注释讲的就是这件事）
  const prevSector = sink.sector;
  const prevFarSector = farSink.sector;
  const Near = (z) => Math.abs(z - f.z) < 130;
  const Use = (z) => (Near(z) ? sink : farSink);
  const At = (z) => {
    const s = Use(z);
    s.SetSector(SectorKey(railX, z));
    return s;
  };

  // 地面剖面：**避开 OUTER_PADS 的采样点**（西关的垫地都在 x>-484），
  // 取轨线以西 62 m 的原野作平滑基准，再与轨线正下方的真实地面夹一次。
  const STEP = 4;
  const n = Math.round((toZ - fromZ) / STEP) + 1;
  const field = new Float32Array(n);
  const local = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const z = fromZ + i * STEP;
    field[i] = host.OuterHeight(railX - 62, z);
    local[i] = host.OuterHeight(railX, z);
  }
  const SMOOTH = 4;                       // ±16 m 的箱式平滑：坡度摊到 2% 以下
  const CrownAt = (i) => {
    let sum = 0, cnt = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k += 1) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      sum += Math.max(field[j], local[j]);
      cnt += 1;
    }
    const smooth = sum / cnt;
    return Clamp(smooth + 0.46, local[i] + 0.15, local[i] + 0.50);
  };
  // 碰撞盒顶只压到 地面+0.34：NavGrid 的「挡路」判据是**每个格子各自的地面**
  // +0.56，而一段路基盒横跨 8—16 m，地形在段内还会起伏 ~0.15 m。
  // 贴着 0.5 登记的话，某几个格子会被判成墙，导航沿 x=-480 出现随机的断点。
  // 玩家因此比道砟面陷进去 0.12 m —— 第一人称完全看不出来。
  const COLLIDER_RISE = 0.34;

  // --- 道砟路基：分段梯形（顶面 + 两侧坡肩），底面埋进土里 ---
  const SLOPE = 1.75;                     // 水平:垂直
  const topHalf = 3.4;
  // 先把道口从整条线上挖掉，再逐段细分 —— 「段心落在道口里就跳过」那种写法
  // 会在道口两侧留下半段长的缺口（缺口宽度取决于段长，而不是道口宽度）。
  const runs = [];
  {
    let cut = fromZ;
    for (const c of [...crossings].sort((a, b) => a - b)) {
      const a = c - CROSS_HALF, b = c + CROSS_HALF;
      if (a > cut) runs.push([cut, Math.min(a, toZ)]);
      cut = Math.max(cut, b);
    }
    if (cut < toZ) runs.push([cut, toZ]);
  }
  let seg = 0;
  const segments = [];
  for (const [a, b] of runs) {
    let p0 = a;
    while (p0 < b) {
      const segLen = Near(p0) ? 8 : 16;
      segments.push([p0, Math.min(p0 + segLen, b)]);
      p0 += segLen;
    }
  }
  for (const [z, z1] of segments) {
    const cz = (z + z1) / 2;
    const i = Math.round((cz - fromZ) / STEP);
    const crown = CrownAt(Math.min(n - 1, Math.max(0, i)));
    const ground = local[Math.min(n - 1, Math.max(0, i))];
    const bottom = ground - 1.4;
    const s = At(cz);
    Slab(s, "RailBallast", {
      x: railX, y: (crown + bottom) / 2, z: cz, w: topHalf * 2, h: crown - bottom, d: z1 - z,
      seed: `rail:bal${seg}`, tile: TILE_METERS.ground,
    });
    const drop = Math.max(0.25, crown - ground);
    const shoulder = Math.hypot(drop * SLOPE, drop);
    const ang = Math.atan2(drop, drop * SLOPE);
    for (const side of [-1, 1]) {
      Slab(s, "RailBallast", {
        x: railX + side * (topHalf + drop * SLOPE / 2), y: crown - drop / 2 - 0.12, z: cz,
        w: shoulder, h: 0.3, d: z1 - z, rz: -side * ang,
        seed: `rail:sh${side}${seg}`, tile: TILE_METERS.ground,
      });
    }
    // 玩家沿轨面走得上去，AI 与南撤的人流照旧能横穿铁路（见 COLLIDER_RISE）
    sink.Solid(railX, ground + COLLIDER_RISE / 2, cz, topHalf + drop * SLOPE,
      COLLIDER_RISE / 2, (z1 - z) / 2, "embankment");
    seg += 1;
  }

  // --- 枕木 ---
  let tie = 0;
  for (let tz = fromZ; tz < toZ; tz += Near(tz) ? 1.2 : 3.0) {
    if (InCrossing(tz)) continue;
    const i = Math.round((tz - fromZ) / STEP);
    const crown = CrownAt(Math.min(n - 1, Math.max(0, i)));
    const s = At(tz);
    Slab(s, "SleeperWood", {
      x: railX + (rnd() - 0.5) * 0.08, y: crown + 0.09, z: tz, w: 2.6, h: 0.18, d: 0.24,
      ry: (rnd() - 0.5) * 0.03, seed: `rail:tie${tie}`, tile: TILE_METERS.wood,
    });
    tie += 1;
  }

  // --- 双轨：24 m 一节（钢轨本身 12 m 一根，这里两根合一段省三角）---
  for (let rz0 = fromZ; rz0 < toZ; rz0 += 24) {
    const rz1 = Math.min(rz0 + 24, toZ);
    const cz = (rz0 + rz1) / 2;
    const i = Math.round((cz - fromZ) / STEP);
    const crown = CrownAt(Math.min(n - 1, Math.max(0, i)));
    const s = At(cz);
    for (const side of [-1, 1]) {
      Slab(s, "RailSteel", {
        x: railX + side * halfGauge, y: crown + 0.26, z: cz, w: 0.12, h: 0.16, d: rz1 - rz0,
        seed: `rail:r${side}${Math.round(cz)}`, tile: TILE_METERS.steel,
      });
    }
  }

  // --- 平交道口：路基在这里被压平成一条土面，钢轨照旧连续 ---
  for (const c of crossings) {
    if (c < fromZ || c > toZ) continue;
    const i = Math.round((c - fromZ) / STEP);
    const crown = CrownAt(Math.min(n - 1, Math.max(0, i)));
    const ground = local[Math.min(n - 1, Math.max(0, i))];
    const s = At(c);
    // 钢轨在道口是**连续**的（上面那一轮已经铺满全线），这里只把路基压成土面：
    // 轨顶仍高出土面 0.14 m，正是乡道道口的样子。
    const deckTop = crown + 0.2;
    Slab(s, "DirtRoad", {
      x: railX, y: (deckTop + ground - 0.6) / 2, z: c, w: 13,
      h: deckTop - (ground - 0.6), d: CROSS_HALF * 2 + 0.6,
      seed: `rail:xing${Math.round(c)}`, tile: TILE_METERS.ground,
    });
    // 两侧的引道：土路从地面爬上路基。少了这一段，道口就是一块凭空浮在
    // 麦田里的土台（第一版出图抓到的）。
    for (const side of [-1, 1]) {
      const runX = 6.5;
      const drop = deckTop - ground;
      const ang = Math.atan2(drop, runX);
      Slab(s, "DirtRoad", {
        x: railX + side * (6.5 + runX / 2), y: ground + drop / 2 - 0.1, z: c,
        w: Math.hypot(runX, drop) + 0.4, h: 0.34, d: CROSS_HALF * 2 + 0.6,
        rz: -side * ang, seed: `rail:xapr${side}${Math.round(c)}`, tile: TILE_METERS.ground,
      });
    }
    sink.Solid(railX, ground + COLLIDER_RISE / 2, c, 10, COLLIDER_RISE / 2,
      CROSS_HALF + 0.3, "embankment");
  }

  sink.sector = prevSector;
  farSink.sector = prevFarSector;
  void ctx;
}

// ---------------------------------------------------------------------------
// PRESUMED 候选（**不改 Data_Tengxian，交主会话登记**）
//   stationForm+  站房：中段 12 m 局部两层（檐 6.9 / 脊 11.1），两翼各 11 m
//                （檐 4.3 / 脊 8.5），墙厚 0.5，屋面坡 35°，室内地坪 = 站台面 +0.75
//   stationPlatform  站台 60×12.4 m、高 0.75 m、边缘离轨心 3.6 m、两端 3.6 m 斜坡
//   stationCanopy    木构月台雨棚：柱距 4 m、9 柱、跨 6.3 m、单坡 7.7°、净高 2.75 m
//   railwayGrade     城西段路基高 0.46 m（野外版是 1.35 m）、顶宽 6.8 m、坡 1:1.75、
//                    枕木 1.2 m（近段）/3.0 m（远段）、道口半宽 4.5 m
// 以上全部无史料，是「一眼可辨 + 玩法可通行」的设计推定。
// ---------------------------------------------------------------------------
