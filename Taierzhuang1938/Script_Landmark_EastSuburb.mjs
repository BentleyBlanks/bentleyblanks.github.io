// 东关：第一区公所 + 第731团1营 —— 在东关院落迷宫里落成挂牌院落。工作包 C3 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。spec = Data_Tengxian.EAST_SUBURB.features 整个数组
// （派发处 BuildOutskirts 既没有 InBounds，也没有 SetSector，也没有 ctx —— 三样都由本文件自理）。
//
// 史实底子（docs/Data_TengxianCity.md §3.2、docs/Data_TengxianTimeline.md 3/16）：
//   东关不是一堵墙，是**一片可以被打穿的、家家有枪眼的鲁南院落迷宫**。日方检讨说得很直白：
//   「敌ハ一歩一歩家屋ノ銃眼ヲ利用シ道路ヲ縦射或ハ側射シ……」。从 16 日 14:15 突入东寨门
//   到 17 日 14:00 肃清外城，光这一片打了 24 小时。第731团第1营（营长严翊）就是在这里
//   以密集手榴弹反复堵口。所以这两座挂牌院落**不许做成城内那种规整机关院**：
//   它们是从民房肌理里长出来的、外墙掏满枪眼的院子，只在门脸上比邻居讲究一档。
//
// 两条本包踩出来的坑（后面动东关的人先读这两条）：
//
//   ① **迷宫的让位是按格心判的，不是按格子的轮廓判的。**
//      BuildEastSuburb 的跳格条件是 `|cellCenter - featureCenter| < rect/2 + 6`。
//      格子本身 15—21 m 宽，于是「格心在 rect+6 之外」的邻居完全可以**压进 rect 里**：
//      实测第一区公所（38×44）东侧邻格的西边缘落在 x=384.85，rect 东边就是 385.0 ——
//      净空 0.04 m；南侧两格更是直接吃进 rect 0.33 m。所以本文件**把院墙按 SETBACK 往里收**，
//      不是照 f.w/f.d 一比一砌到 rect 边上。正解是让主会话把跳格判据换成矩形相交（见交付报告）。
//
//   ② **第二条南北巷（x≈456.6）从第731团1营的院子正中穿过。**
//      三条巷子按 `startX + (maxX-startX) * [0.27,0.56,0.81]` 定位，跳格判据管不着它们，
//      巷面 DirtRoad 是从 z=-235 一路铺到 220 的一整条。营部 rect 是 x∈[430,486]，
//      巷子正好在中间。堵死一条巷 = 动巷网，所以这里**不砌一座 56 m 的大院**，
//      而是照真实的驻扎方式做成**隔巷两院**：巷西是营部本院（billet 套件），
//      巷东是同族的辎重院（马棚/草料/粪堆），巷口设卡。巷子照旧走得通。

import {
  AddWall, AddCompound, AddLoopholes, AddSandbagEmplacement,
} from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
import { AddYardWear, AddStalkStack, AddManureHeap } from "./Script_LivedInProps.mjs";
import { BuildOffice } from "./Script_Landmark_Commerce.mjs";
import { BuildBillet } from "./Script_Landmark_Headquarters.mjs";

// ---------------------------------------------------------------------------
// 与 Script_TengxianCity 同步的镜像常量
// ---------------------------------------------------------------------------

/** 合批分区：150 m 见方。与 Script_TengxianCity.SectorKey 同式（不许 import 城）。 */
const SECTOR_SIZE = 150;
function SectorKey(x, z) {
  return `S${Math.floor(x / SECTOR_SIZE)}_${Math.floor(z / SECTOR_SIZE)}`;
}

/**
 * 东关三条南北巷的 x。**镜像值**，算式抄自 BuildEastSuburb：
 *   startX = max(EAST_SUBURB.bounds.minX 334, MOAT.outerEdge 328.5 + GATE_BULGE 16 + 6) = 350.5
 *   at[i]  = startX + (bounds.maxX 540 - startX) * [0.27, 0.56, 0.81]
 *   half[i]= [lane.min 1.5, (min+max)/2 2.0, lane.max 2.5][i] / 2
 * 改 EAST_SUBURB.bounds / lane 时这里要跟着改（正解是把整块 EAST_SUBURB 喂进构建器，见报告）。
 */
const EAST_LANES = [
  { at: 401.72, half: 0.75 },
  { at: 456.62, half: 1.00 },
  { at: 503.99, half: 1.25 },
];

/** 东关大街（EAST_SUBURB.roadZ / STREETS.EastGateStreet.width）。同样是镜像值。 */
const EAST_STREET = { z: -65, width: 9 };

/**
 * 院墙相对 rect 的退让。见头注 ①：迷宫按格心让位，rect 边上可能已经站着邻居的墙。
 * 1.5 m 换来的是与最近邻格 ≥1.1 m 的夹道（鲁南夹道 1.2—1.8 m，读起来正好）。
 */
const SETBACK = 1.5;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 一块摆好位置的方料（不落地的构件只能这么砌：AddWall 恒从 y=0 起）。 */
function Slab(sink, material, { x, y, z, w, h, d, ry = 0, rx = 0, seed, tile }) {
  sink.Add(material, PlaceGeometry(
    MakeBox(w, h, d, tile ?? TILE_METERS.brick, seed,
      String(material).startsWith("BrickWall") ? BRICK_UV_GRID : null),
    { x, y, z, ry, rx }));
}

/**
 * 沿一个轴对齐矩形的四面外墙掏枪眼。
 *
 * **朝向是这里唯一容易写错的东西**：AddLoopholes 的局部 +z 在 ry 下指
 * (sin ry, cos ry)，而白茬与洞都压在 wallFace 之外 —— 也就是说 ry 必须指向**墙外**。
 * 北面（z 小的那面）朝外是 -z ⇒ ry=π；南面 ry=0；东面 ry=π/2；西面 ry=-π/2。
 * （城里 AddSuburbLoopholes / 寺院地那两处把这四个值取反了，枪眼落在院子里侧，
 *   街上根本看不见 —— 见交付报告，不在本包能改的文件里。）
 */
function RectLoopholes(sink, rect, {
  seed, ys = [1.05, 1.45], wallFace = 0.28, damage = 0, gateFace = null,
}) {
  if (damage > 0.85) return;
  const hx = rect.w / 2, hz = rect.d / 2;
  const faces = [
    { x: rect.x, z: rect.z - hz, ry: Math.PI, span: rect.w, tag: "n", ax: 1, az: 0 },
    { x: rect.x, z: rect.z + hz, ry: 0, span: rect.w, tag: "s", ax: 1, az: 0 },
    { x: rect.x + hx, z: rect.z, ry: Math.PI / 2, span: rect.d, tag: "e", ax: 0, az: 1 },
    { x: rect.x - hx, z: rect.z, ry: -Math.PI / 2, span: rect.d, tag: "w", ax: 0, az: 1 },
  ];
  for (const face of faces) {
    if (face.tag === gateFace) {
      // 开门那一面：门洞与门楼占着正中，枪眼只能分到两端 —— 一边一个，
      // 而不是照 spread 均分（均分的第一版有一个洞正好浮在门洞的空气里）。
      for (const side of [-1, 1]) {
        const off = face.span * 0.34 * side;
        AddLoopholes(sink, {
          x: face.x + face.ax * off, z: face.z + face.az * off, ry: face.ry, ys,
          count: 1, spread: 0, seed: `${seed}:lp${face.tag}${side}`, wallFace,
        });
      }
      continue;
    }
    AddLoopholes(sink, {
      x: face.x, z: face.z, ry: face.ry, ys,
      count: Clamp(Math.round(face.span / 7), 2, 5),
      spread: face.span * 0.62, seed: `${seed}:lp${face.tag}`, wallFace,
    });
  }
}

/**
 * 门口的沙袋哨位 —— 照 A5 的血泪：街面净宽两侧各留 1.2 m 退让带，
 * 差 0.1 m 压进去整座哨位就不生成。所以是**往门口收几档再试**，不是一票否决。
 * @param {{x:number,z:number}} gate 门洞中心（世界）
 * @param {{x:number,z:number}} out  门朝外的单位向量
 */
function GatePost(host, gate, out, side, { seed, length = 4.2, depth = 1.9 }) {
  const hx = length / 2 + 0.4, hz = depth / 2 + 0.4;
  const alongX = -out.z, alongZ = out.x;
  for (const dist of [2.7, 1.9, 1.2]) {
    const x = gate.x + out.x * dist + alongX * side;
    const z = gate.z + out.z * dist + alongZ * side;
    if (host.OnStreet(x, z, hx, hz)) continue;
    AddSandbagEmplacement(host.sink, {
      x, z, ry: Math.atan2(out.x, out.z), baseY: 0, seed: `${seed}:post`,
      length, depth, height: 0.72,
    });
    return true;
  }
  return false;
}

/**
 * 布告墙：一段独立的砖墙 + 一排糊在上面的布告纸 + 瓦帽。
 *
 * 区公所在街上的第一符号不是门楼（民居也有门楼），是**门外这堵贴满纸的墙**：
 * 征丁、清乡、防空、坚壁清野的告示一层压一层，边角翻起。净几何不写字
 * （写什么是战斗时段的事），靠「一排浅色矩形 + 参差的边」把它读成布告。
 */
function NoticeWall(host, { x, z, ry, length, seed, damage, burnt }) {
  const sink = host.sink;
  const height = 2.25;
  if (host.OnStreet(x, z, length / 2 + 0.4, 0.9)) return false;
  AddWall(sink, burnt ? "BrickWallSooty" : "BrickWall", {
    x, z, length, height, thickness: 0.36, ry,
    ruin: damage * 0.45, seed: `${seed}:wall`, plinth: "Stone", cope: true,
  });
  // 纸：两排，错落、有的只剩半张。
  // **贴在朝街那一面**：布告墙用的是院子那套局部坐标（+z = 大门朝外的方向），
  // 而 PlaceGeometry 的局部 +z 在 ry=0 时指世界 +z —— 两套差 180°。
  // 直接照几何的 +z 偏移，纸会糊在墙的背面（第一版就是这样，出图上只看见一堵素墙）。
  const rnd = Mulberry32(HashString(`${seed}:paper`));
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const outX = -sin, outZ = -cos, face = 0.20;
  for (let row = 0; row < 2; row += 1) {
    const y = 1.62 - row * 0.72;
    for (let i = 0; i < 4; i += 1) {
      if (rnd() < 0.18) continue;
      const lx = -length / 2 + length * (i + 0.5) / 4 + (rnd() - 0.5) * 0.35;
      const w = 0.52 + rnd() * 0.26;
      const h = (0.60 + rnd() * 0.18) * (rnd() < 0.25 ? 0.55 : 1);
      Slab(sink, "HouseholdCloth", {
        x: x + cos * lx + outX * face, y: y + (rnd() - 0.5) * 0.12,
        z: z - sin * lx + outZ * face,
        w, h, d: 0.03, ry, rz: (rnd() - 0.5) * 0.09,
        seed: `${seed}:pp${row}${i}`, tile: TILE_METERS.cloth,
      });
    }
  }
  return true;
}

/**
 * 一间岗棚：四柱 + 单坡瓦顶 + 一面背墙。门岗站的地方，比沙袋多一层「这门有人管」。
 * 背墙材质跟着院子走：机关院砌砖，借住的民宅院用土坯 —— 第一版一律 Adobe，
 * 结果在青砖机关院门口读成一块孤零零的亮橙色板子。
 */
function SentryBox(sink, { x, z, ry, seed, material = "Adobe" }) {
  const w = 1.15, d = 1.05, high = 2.35, low = 2.05;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = At(sx * w / 2, sz * d / 2);
      const h = sz < 0 ? high : low;
      Slab(sink, "WoodBeam", {
        x: p.x, y: h / 2, z: p.z, w: 0.11, h, d: 0.11, ry,
        seed: `${seed}:p${sx}${sz}`, tile: TILE_METERS.wood,
      });
    }
  }
  // 后墙（背街那一面做实，风才吹不进来）
  const back = At(0, -d / 2);
  Slab(sink, material, {
    x: back.x, y: (high - 0.3) / 2, z: back.z, w, h: high - 0.3, d: 0.16, ry,
    seed: `${seed}:back`, tile: material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
  });
  const slope = Math.atan2(high - low, d);
  Slab(sink, "RoofTile", {
    x, y: (high + low) / 2 + 0.14, z, w: w + 0.42, h: 0.10,
    d: Math.hypot(d, high - low) + 0.34, ry, rx: -slope,
    seed: `${seed}:roof`, tile: TILE_METERS.roof,
  });
  sink.Solid(x, high / 2, z, w / 2, high / 2, d / 2, "villagePost", ry);
}

/** 拒马：两根交叉木料 + 一道横撑。巷口设卡用，挡车不挡人。 */
function ChevalDeFrise(sink, { x, z, ry, seed }) {
  const len = 2.4;
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", {
      x, y: 0.62, z, w: 0.11, h: len, d: 0.11, ry, rx: s * 0.72,
      seed: `${seed}:x${s}`, tile: TILE_METERS.wood,
    });
  }
  Slab(sink, "WoodBeam", {
    x, y: 0.66, z, w: 2.2, h: 0.10, d: 0.10, ry,
    seed: `${seed}:bar`, tile: TILE_METERS.wood,
  });
  sink.Solid(x, 0.55, z, 1.1, 0.55, 0.5, "prop", ry);
}

// ---------------------------------------------------------------------------
// 第一区公所 —— 机关院 + 布告墙 + 门岗
// ---------------------------------------------------------------------------

/**
 * 第一区区公所。城防示意图把它标在东关大街南侧、离濠外不远的那一块。
 *
 * 形制走 A4 的 BuildOffice（门房 + 大影壁 + 台明上的办公正房 + 两列厢房 + 旗杆 + 公告牌），
 * 但**朝向要拧过来**：东关大街在 z=-65，院子在 z=-28 —— 街在院子的**北**边。
 * BuildOffice 的场地约定是「局部 +z = 临街开门那一面」，ry=0 时它指世界 -z（北），
 * 所以这一座恰好 ry=0；不要照城内那套「坐北朝南 ⇒ ry=π」的肌肉记忆抄。
 *
 * 本包在院外另加两件东关味的东西：门外一堵**布告墙**（区公所在街上的第一符号），
 * 与门侧的沙袋哨位 + 岗棚。四面外墙掏枪眼 —— 这里是东关，区公所也是一个火力点。
 */
function BuildDistrictOffice(host, f, ctx) {
  const sink = host.sink;
  const seed = `map:${f.id}`;
  const inner = { ...f, w: f.w - SETBACK * 2, d: f.d - SETBACK * 2 };
  const ry = ctx.ry;

  BuildOffice(host, inner, ctx);

  // 门脸朝向：局部 +z 在世界里的指向（= 大门朝外）
  const out = { x: -Math.sin(ry), z: -Math.cos(ry) };
  const along = { x: -out.z, z: out.x };
  const hd = inner.d / 2;
  const gate = { x: f.x + out.x * hd, z: f.z + out.z * hd };

  // 门前这一溜的排布是量出来的，不是估的：BuildOffice 自己在**局部 +x 5.2 / 外挑 1.5**
  // 摆了一块公告牌，本包三件东西都得躲开它，否则四样构件全挤在门洞前两米里
  //（第一版就是这样：岗棚正贴着门洞，出图上门被自己的岗棚挡住了）。
  //   沿墙坐标（along，正方向 = 局部 +x）：
  //     -12.1 … -5.9  布告墙        |  -5.5 … -1.3  沙袋哨位
  //      -1.0 …  1.0  门洞          |   1.6 …  2.8  岗棚
  //       3.8 …  6.7  BuildOffice 的公告牌
  const At = (a, o) => ({ x: gate.x + out.x * o + along.x * a, z: gate.z + out.z * o + along.z * a });

  const notice = At(-9.0, 2.0);
  NoticeWall(host, {
    x: notice.x, z: notice.z, ry, length: 6.2,
    seed: `${seed}:notice`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 布告墙下的两条石凳：看布告的人蹲在这儿等消息
  for (let i = 0; i < 2; i += 1) {
    const b = At(-10.4 + i * 2.8, 3.4);
    Slab(sink, "Stone", {
      x: b.x, y: 0.21, z: b.z, w: 1.5, h: 0.42, d: 0.4, ry,
      seed: `${seed}:bench${i}`, tile: TILE_METERS.stone,
    });
    sink.Solid(b.x, 0.21, b.z, 0.75, 0.21, 0.2, "furniture", ry);
  }

  // 门岗：门西侧一座沙袋位 + 门东侧一间岗棚
  GatePost(host, gate, out, -3.4, { seed: `${seed}:gp` });
  const boxAt = At(2.2, 1.5);
  if (!host.OnStreet(boxAt.x, boxAt.z, 1.1, 1.1)) {
    // ry + π：岗棚用 PlaceGeometry 的局部坐标（+z → 世界 +z），院子用的是差 180° 的那一套。
    // 不加 π 的话背墙糊在朝街这一面，岗哨背对着他要看的街。
    SentryBox(sink, {
      x: boxAt.x, z: boxAt.z, ry: ry + Math.PI, seed: `${seed}:sentry`,
      material: ctx.burnt ? "BrickWallSooty" : "BrickWall",
    });
  }

  // 门前被反复踩实的一片地（来办事的、贴布告的、蹲着等消息的）
  AddYardWear(sink, {
    x: gate.x + out.x * 3.2, z: gate.z + out.z * 3.2, ry, baseY: 0,
    seed: `${seed}:approach`, radius: 5.0,
  });

  // 四面外墙的枪眼：区公所也在迷宫里，家家有枪眼这条对它同样成立
  RectLoopholes(sink, { x: f.x, z: f.z, w: inner.w, d: inner.d }, {
    seed, damage: ctx.damage, wallFace: 0.30, gateFace: "n",
  });
}

// ---------------------------------------------------------------------------
// 第731团1营 —— 隔巷两院（营部本院 + 辎重院），巷子照旧走得通
// ---------------------------------------------------------------------------

/**
 * 巷东的辎重院：走民居院本体（AddCompound）+ 马棚料垛那一套。
 * 它**故意不比邻居讲究**——营部借住的杂用院就该读成一座普通东关民宅，
 * 挂牌的那一座只有一处（巷西）。
 */
function SupplyYard(host, f, ctx, seed) {
  const sink = host.sink;
  const ry = ctx.ry;
  AddCompound(sink, {
    x: f.x, z: f.z, ry, width: f.w, depth: f.d, seed: `${seed}:yard`,
    damage: ctx.damage, burnt: ctx.burnt,
  });
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (lx, lz) => ({ x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz });
  const rnd = Mulberry32(HashString(`${seed}:supply`));
  // 草料垛两座 + 粪堆：借住的营连在院里留下的第一层痕迹
  for (let i = 0; i < 2; i += 1) {
    const p = At(-f.w * 0.28 + i * 3.3, f.d * 0.16);
    if (host.OnStreet(p.x, p.z, 1.6, 1.6)) continue;
    AddStalkStack(sink, {
      x: p.x, z: p.z, ry: ry + rnd() * 0.7, y: 0,
      seed: `${seed}:stalk${i}`, scale: 0.92 + rnd() * 0.18,
    });
  }
  const heap = At(f.w * 0.30, f.d * 0.22);
  if (!host.OnStreet(heap.x, heap.z, 1.6, 1.6)) {
    AddManureHeap(sink, { x: heap.x, z: heap.z, seed: `${seed}:heap`, scale: 0.95 });
  }
  AddYardWear(sink, {
    x: f.x, z: f.z + f.d * 0.06, ry, baseY: 0, seed: `${seed}:wear`,
    radius: Math.min(f.w, f.d) * 0.3,
  });
  RectLoopholes(sink, { x: f.x, z: f.z, w: f.w, d: f.d }, {
    seed: `${seed}:supply`, damage: ctx.damage, wallFace: 0.26, gateFace: "s",
  });
}

/**
 * 第731团第1营（营长严翊）驻地。
 *
 * 数据给的是一块 56×40 的 rect，而东关的第二条南北巷（x≈456.6）正从它中间穿过。
 * 所以这里做成**隔巷两院**：巷西是营部本院（A5 的 billet 套件：土坯院墙、窄门、
 * 长条库房翼、马棚草料粪堆碌碡），巷东是同族的辎重院；巷口朝街那一端设卡
 * （沙袋 + 拒马）。这既保住了巷网，也正是「一个营借住关厢民宅」的真实样子。
 *
 * 朝向：营部在东关大街（z=-65）的**北**侧，门要朝南（世界 +z）⇒ ry=π。
 */
function BuildBattalionBillet(host, f, ctx) {
  const sink = host.sink;
  const seed = `map:${f.id}`;
  const rect = { x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 };

  // 穿过 rect 的巷子（可能一条也没有）。取第一条，把 rect 切成两半。
  const lane = EAST_LANES.find((l) =>
    l.at - l.half > rect.x0 + 12 && l.at + l.half < rect.x1 - 12) || null;

  const z0 = rect.z0 + SETBACK, z1 = rect.z1 - SETBACK;
  const zc = (z0 + z1) / 2, depth = z1 - z0;
  const courts = [];
  if (lane) {
    const gap = lane.half + 1.4;                 // 巷面之外再留半米余量给墙厚
    courts.push({ x0: rect.x0 + SETBACK, x1: lane.at - gap, role: "billet" });
    courts.push({ x0: lane.at + gap, x1: rect.x1 - SETBACK, role: "supply" });
  } else {
    courts.push({ x0: rect.x0 + SETBACK, x1: rect.x1 - SETBACK, role: "billet" });
  }

  for (const court of courts) {
    const width = court.x1 - court.x0;
    if (width < 14) continue;
    const sub = {
      ...f, x: (court.x0 + court.x1) / 2, z: zc, w: width, d: depth,
      id: `${f.id}${court.role === "supply" ? "Supply" : ""}`,
    };
    if (court.role === "billet") {
      BuildBillet(host, sub, ctx);
      // 「家家有枪眼」对营部本院同样成立 —— 而且这一座是巷战里最该有枪眼的一座。
      // 土坯墙比青砖薄，wallFace 取 0.26 就够把白茬压出墙面。
      RectLoopholes(sink, { x: sub.x, z: sub.z, w: sub.w, d: sub.d }, {
        seed: `${seed}:hq`, damage: ctx.damage, wallFace: 0.26, gateFace: "s",
      });
    } else {
      SupplyYard(host, sub, ctx, `${seed}:sup`);
    }
  }

  if (!lane) return;

  // —— 巷口设卡 ——
  // 街在 z=-65（rect 之南），所以卡子设在巷子朝街的那一端。
  const mouthZ = rect.z1 + 2.6;
  if (!host.OnStreet(lane.at, mouthZ, 2.6, 1.6)) {
    AddSandbagEmplacement(sink, {
      x: lane.at - lane.half - 1.5, z: mouthZ, ry: 0, baseY: 0,
      seed: `${seed}:lanePost`, length: 2.6, depth: 1.7, height: 0.72,
    });
    ChevalDeFrise(sink, { x: lane.at + 0.35, z: mouthZ, ry: 0, seed: `${seed}:chev` });
  }
  // 巷子在两院之间这一段被踩得比别处实（营部的人天天从这儿过）
  for (let i = 0; i < 3; i += 1) {
    AddYardWear(sink, {
      x: lane.at, z: z0 + depth * (i + 0.5) / 3, ry: Math.PI / 2, baseY: 0,
      seed: `${seed}:laneWear${i}`, radius: 3.0,
    });
  }
}

// ---------------------------------------------------------------------------
// 派发
// ---------------------------------------------------------------------------

/**
 * 战损：东关打了 24 小时，全片都在 0.3—0.45 这一档。
 * 梯度照 BuildEastSuburb 的口径（越靠内城越挨得狠 —— 日军从东寨门一路往城墙推），
 * 只是把值夹进本包约定的区间，免得挂牌院落跟旁边的民居差出两档。
 */
const KIT = {
  FirstDistrictOffice: { build: BuildDistrictOffice, ry: 0, damage: 0.42 },
  Battalion731: { build: BuildBattalionBillet, ry: Math.PI, damage: 0.34 },
};

export function BuildEastSuburbFeatures(host, spec, ctx) {
  if (!Array.isArray(spec)) return;
  for (const f of spec) {
    const kit = KIT[f.id];
    if (!kit) continue;
    // 派发处没有 InBounds：不自己挡的话，L1/L5 这种切到城西的关卡也会在
    // 三百米外把整座院子生成出来（白花 draw call，还可能撞红线）。
    const pad = Math.max(f.w, f.d) / 2 + 14;
    if (typeof host.InBounds === "function" && !host.InBounds(f.x, f.z, pad)) continue;
    const sector = SectorKey(f.x, f.z);
    host.sink.SetSector(sector);
    host.farSink.SetSector(sector);
    kit.build(host, f, {
      damage: ctx?.damage ?? kit.damage,
      burnt: ctx?.burnt ?? false,
      ry: ctx?.ry ?? f.ry ?? kit.ry,
    });
    host.sink.SetSector("");
    host.farSink.SetSector("");
  }
}

// 镜像值导出给自测脚本断言用（巷位/街位一旦与 Data_Tengxian 脱钩，本文件会静默错位）。
export const EAST_SUBURB_MIRRORS = Object.freeze({ EAST_LANES, EAST_STREET, SETBACK });
