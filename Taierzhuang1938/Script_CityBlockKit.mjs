// 城内街区套件 —— 一格院子的六种原型 × 三档 LOD。
//
// 存在的理由（用户原话）：「大量重复村庄」。
// 城内 286 m 半城的院落网格原本每一格都调同一个 `AddCompound`，只有 seed 与
// damage 不同：同一圈院墙、同一座正房、同一对厢房、门永远开在同一面。
// 二百多格铺出来是一张复印纸，俯瞰尤其明显。
//
// 这个文件把「一格院子」拆成**可查表的原型**，由 Script_TengxianCity.BuildBlock
// 按 seed 稳定选型。**街道/十字口/地标/上城道/顺城街/视线走廊的雕格逻辑
// （PlanBlocks）一行都没有动** —— 变的只是同一个格子里盖什么。
//
// 第二轮（D7）在此之上加了两件，都仍然只改「格子里盖什么」：
//   ① **一格两户**：够大的一格按 seed 切成两户共山墙小院（`PickDuplex` / `BuildDuplex`），
//      东西对分或南北对分，各自有门。全城 395 格 → 502 户（+27%）。
//   ② **连排铺面**：一格铺面不再是一整间大铺子，而是 2—3 间门脸相接、
//      檐口与进深参差的独立铺面（`ShopUnit`）。
// 两件都**三档 LOD 同形**：远景两条脊 / 参差长排，走近了才是两个门洞 / 三间门脸。
//
// ---------------------------------------------------------------------------
// 一、局部坐标系（**先读这一段，不然朝向必错**）
//
// Script_LandmarkRegistry 头注①说的两套坐标系差 180°，在这里被收敛成一条规矩：
//
//   **本文件的局部系：ry=0 时，局部 +x = 世界东，局部 +z = 世界南。**
//   也就是 ry=0 就是「坐北朝南」：正房在局部 −z（北），大门在局部 +z（南）。
//
// 转交给 Script_World 的构件时按下表换算（已在代码里写死，调用方不用管）：
//   · `AddCompound` / `AddGatehouse`：传 `ry + Math.PI`
//     （它们的门脸排在自己局部 +z，而它们的局部 +z 在同一个 ry 下指本文件的 −z）
//   · `AddRoomBlock`：传本文件的 `ry`，用 `facing` 定门朝哪边 ——
//     `facing:-1` 门朝局部 +z（南，正房用）；`facing:+1` 门朝局部 −z（北，倒座房用）；
//     厢房传 `ry + π/2`，此时 `facing:+1` 门朝西、`facing:-1` 门朝东。
//   · `AddHardMountainRoof` / `AddWall` / `AddDoorReveal`：传本文件的 `ry`（同系）。
//
// **顺带修掉的一个既有错误**：BuildBlock 原来一律 `ry: 0` 调 AddCompound，
// 于是全城每一座四合院的正房都在**南**边、大门朝**北**开 —— 与
// docs/Data_TengxianCity.md §4.6「坐北朝南，一进院落为主，门多开在东南角」
// 正好反了。改用本套件后 OneEntry 走 `ry + π`，全城转正。
//
// ---------------------------------------------------------------------------
// 二、三档 LOD 认同一个 kind
//
// detail / mid / far 三档都吃同一个 `kind`：玩家从街口走近一个院子时，
// 远景剪影的屋脊走向、进深比例与走到跟前看到的那一座是同一座。
// 如果三档各自随机，走近的过程就是「房子在眼前变形」。
//
// ---------------------------------------------------------------------------
// 三、形制依据（docs/Data_TengxianCity.md §4.6、docs/Data_HistoryMaterial.md）
//
//   · 对外不开窗：临街只有门，窗全朝院里 —— 所有原型的外圈都是连续实墙；
//   · 青砖 + 淡色过墙石交织，平原段大量土坯 + 麦秸泥（AdobeYard 就是这一支）；
//   · 檐口 2.4—2.8 m、脊高 3.5—4.2 m、院墙 1.8—2.2 m（土墙院取下限，砖院取上限）；
//   · 硬山小青瓦，坡度 26°—29°；单开间 3.0—3.6 m，三开间正房面阔 9—11 m。
//
// 只用 `ResolveTengxianMaterial` 已登记的材质名，本文件不申请任何新材质。
//
// ---------------------------------------------------------------------------
// 四、预算
//
// 城内近景院落原本 ≈7.0k 三角/格。六种原型的加权均值压在同一档上下，
// 整城三角量基本持平（各原型实测值见交付报告 WP_C1）。
// 材质桶也刻意不外扩：全部落在 BuildBlock 原本就在用的那十来个名字里，
// 每个 150 m 分区不会因为换原型多出 draw call。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp, Clamp01 } from "./Script_Noise.mjs";
import {
  AddWall, AddRoomBlock, AddHardMountainRoof, AddCompound, AddGatehouse,
  AddDoorReveal, AddWell, AddMillstone, AddWaterVat, AddLoopholes, AddTree,
  SolidWithOpenings,
} from "./Script_World.mjs";
import {
  MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
  RoofSlopeLayout, RoofSlabY,
} from "./Script_Geo.mjs";
import {
  AddCourtyardLife, AddYardWear, AddStalkStack, AddManureHeap,
  AddVegetableBeds, AddStoneRoller,
} from "./Script_LivedInProps.mjs";

const DEG = Math.PI / 180;
/** 硬山坡度 26°—29°。 */
const PITCH_RAD = 27.5 * DEG;
/** 脊高 = 檐口 + 半进深 × tan(27.5°)。 */
const PITCH = Math.tan(PITCH_RAD);

/**
 * 六种原型。`kind` 决定形制与材质味道；**住一户还是两户是另一个维度**
 * （`PickDuplex` 返回的 "ew"/"ns"/null），不占 kind 的位置 ——
 * 两户小院既可以是青砖的也可以是土坯的，那是同一件事的两个自变量。
 */
export const CITY_BLOCK_ARCHETYPES = Object.freeze([
  "OneEntry",     // 一进四合院（原行为，只把朝向转正）
  "TwoEntry",     // 两进院：倒座 + 二门 + 正房 + 东厢
  "AdobeYard",    // 土墙院：土坯院墙 + 过墙石碱脚 + 后院牲口棚
  "LCourtyard",   // L 形院：正房 + 一侧长厢房，另一侧菜畦柴垛
  "WellYard",     // 水井院：巷口半公共井台 + 辘轳
  "ShopRow",      // 临街一层铺面排屋 + 后院库房
]);

/** 本文件的局部系 → 世界。ry=0：+x 东、+z 南。 */
function Frame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => [x + cos * lx + sin * lz, z - sin * lx + cos * lz];
}

/**
 * 这一户是「正格」还是「反格」。
 *
 * `+1` = 门在东南角、厢房在西（鲁南主流：门多开在东南角，巽位）；
 * `-1` = 整个平面左右镜像。约三成的院子走反格。
 *
 * 为什么非有不可：门与厢房的位置如果对所有院子都是同一侧，
 * 俯瞰图上二百个院子的**门洞会排成一条线**——那是另一种复印纸。
 */
function MirrorOf(seed) {
  return ((HashString(`${seed}:mirror`) >>> 0) % 10) < 3 ? -1 : 1;
}

function TileFor(material) {
  if (material === "Adobe") return TILE_METERS.adobe;
  if (material === "Stone" || material === "CrossStone") return TILE_METERS.stone;
  return TILE_METERS.brick;
}

/**
 * 一段开若干豁口的墙。院门、二门、后院矮墙、**一格两户的双院门**共用。
 * 豁口按**沿墙方向的局部偏移** at 定位；沿墙方向 = 本地 x 轴绕 ry+rot。
 *
 * `gaps: [{at, openW}, …]` 开多个口（D7 的两户共山墙小院：南墙上两家各一个门）；
 * 不传就退回单口的 `at` / `openW`。多口时会按位置排序、合并重叠的口 ——
 * 两个门挨得太近（分家分得偏）时不许生出一段负长度的墙，那会在墙上留一条穿帮缝。
 */
function GapWall(sink, {
  x, z, ry, length, height, thickness, material, seed, ruin = 0,
  openW = 1.5, at = 0, gaps = null, plinth = null, cope = true, tag = "wall",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const holes = (gaps && gaps.length ? gaps : [{ at, openW }])
    .map((g) => ({ a: g.at - g.openW / 2, b: g.at + g.openW / 2 }))
    .sort((p, q) => p.a - q.a);
  const segments = [];
  let cursor = -length / 2;
  for (const h of holes) {
    const a = Clamp(h.a, -length / 2, length / 2);
    const b = Clamp(h.b, -length / 2, length / 2);
    if (a > cursor) segments.push({ c: (cursor + a) / 2, len: a - cursor });
    cursor = Math.max(cursor, b);
  }
  segments.push({ c: (cursor + length / 2) / 2, len: length / 2 - cursor });
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (s.len < 0.35) continue;                     // 豁口顶到墙角：那一段干脆没有
    AddWall(sink, material, {
      x: x + cos * s.c, z: z - sin * s.c, length: s.len, height, thickness, ry,
      ruin, seed: `${seed}:g${i}`, tile: TileFor(material), plinth, cope, solid: false,
    });
    sink.Solid(x + cos * s.c, height / 2, z - sin * s.c,
      s.len / 2, height / 2, thickness / 2, tag, ry);
    sink.Cover(x + cos * s.c, z - sin * s.c, height * (1 - ruin * 0.5), Math.sin(ry), Math.cos(ry));
  }
}

/**
 * 院墙一圈。`gate` = { offset, openW } 时在**南面**（局部 +z）开门洞，其余三面实墙。
 * `gates` = [{offset,openW}, …] 开多个（一格两户：南墙上两家各一个门 / 北户的夹道口）。
 * 门楼由调用方决定（砖院上门楼，土墙院只有木门框）。
 */
function WallRing(sink, {
  x, z, ry, w, d, seed, damage = 0, material = "BrickWall", height = 2.1,
  thickness = 0.35, plinth = null, cope = true, gate = null, gates = null, tag = "wall",
}) {
  const gateList = (gates && gates.length) ? gates : (gate ? [gate] : null);
  const F = Frame(x, z, ry);
  const tile = TileFor(material);
  const sides = [
    { lx: 0, lz: -d / 2, len: w, rot: 0, id: "n" },
    { lx: 0, lz: d / 2, len: w, rot: 0, id: "s" },
    { lx: -w / 2, lz: 0, len: d, rot: Math.PI / 2, id: "w" },
    { lx: w / 2, lz: 0, len: d, rot: Math.PI / 2, id: "e" },
  ];
  for (const s of sides) {
    const [wx, wz] = F(s.lx, s.lz);
    if (gateList && s.id === "s") {
      GapWall(sink, {
        x: wx, z: wz, ry, length: s.len, height, thickness, material,
        seed: `${seed}:ring${s.id}`, ruin: damage * 0.7,
        gaps: gateList.map((g) => ({ at: g.offset, openW: g.openW })),
        plinth, cope, tag,
      });
      continue;
    }
    AddWall(sink, material, {
      x: wx, z: wz, length: s.len, height, thickness, ry: ry + s.rot,
      ruin: damage * 0.8, seed: `${seed}:ring${s.id}`, tile, plinth, cope, solid: false,
    });
    sink.Solid(wx, height / 2, wz, s.len / 2, height / 2, thickness / 2, tag, ry + s.rot);
    sink.Cover(wx, wz, height * (1 - damage * 0.4),
      Math.sin(ry + s.rot), Math.cos(ry + s.rot));
  }
}

/**
 * 影壁：门内 2 m 的一堵短墙。它是**从街上透过门洞唯一能看见的受光面** ——
 * 没有它，门洞在出图上就是一块纯黑（AddCompound 的注释里记着这条教训）。
 */
function ScreenWall(sink, { x, z, ry, seed, damage, at = 0, d }) {
  const F = Frame(x, z, ry);
  const [px, pz] = F(at, d / 2 - 2.0);
  AddWall(sink, "BrickWall", {
    x: px, z: pz, length: 2.4, height: 1.9, thickness: 0.28, ry,
    ruin: damage * 0.6, seed: `${seed}:screen`, plinth: "Stone", cope: true,
  });
}

/**
 * 土坯房：土坯墙 + **过墙石碱脚**（鲁南立面最显眼的一笔）+ 硬山瓦顶。
 *
 * 不走 AddRoomBlock：那个函数把墙材写死成 BrickWall，而且每一面都排
 * 格子窗与墙垛，土坯房用不上（也太贵）。这里只做「三面实墙 + 朝院一面
 * 一门一窗」，出檐不做椽子 —— 土坯房的檐口是草泥抹的，本来就看不见椽头。
 */
function AdobeHouse(sink, {
  x, z, ry, width, depth, eaveY, seed, damage = 0, burnt = false, facing = 1,
}) {
  const F = Frame(x, z, ry);
  const rnd = Mulberry32(HashString(`${seed}:ah`));
  const wallMat = burnt ? "BrickWallSooty" : "Adobe";
  const ridgeY = eaveY + depth * 0.5 * PITCH;
  const collapsed = damage > 0.62;
  const openLz = facing > 0 ? depth / 2 : -depth / 2;

  // 三面实墙 —— 对外不开窗
  const closed = [
    { lx: 0, lz: -openLz, len: width, rot: 0 },
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < closed.length; i += 1) {
    const c = closed[i];
    const [cx, cz] = F(c.lx, c.lz);
    AddWall(sink, wallMat, {
      x: cx, z: cz, length: c.len, height: eaveY, thickness: 0.38, ry: ry + c.rot,
      ruin: damage * 0.85, seed: `${seed}:cw${i}`, tile: TILE_METERS.adobe,
      plinth: "CrossStone",                        // 过墙石碱脚
    });
  }
  // 朝院一面：明间一门 + 一侧一窗，其余是垛
  const [ox, oz] = F(0, openLz);
  const doorH = 1.95;
  GapWall(sink, {
    x: ox, z: oz, ry, length: width, height: eaveY, thickness: 0.38, material: wallMat,
    seed: `${seed}:face`, ruin: damage * 0.8, openW: 1.2, at: 0,
    plinth: "CrossStone", cope: false,
  });
  if (damage < 0.6) {
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(1.5, 0.18, 0.42, TILE_METERS.wood, `${seed}:lintel`),
      { x: ox, y: doorH + 0.09, z: oz, ry }));
    const aboveH = Math.max(0.12, eaveY - doorH - 0.18);
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(1.2, aboveH, 0.38, TILE_METERS.adobe, `${seed}:above`),
      { x: ox, y: doorH + 0.18 + aboveH / 2, z: oz, ry }));
    // 门楣以上这块土坯也要有碰撞：GapWall 是按通高掏的口子，不补这一只盒
    // 就等于门头上开了一扇「有渲染无碰撞」的窗。底面 2.13 m，不挡人。
    sink.Solid(ox, doorH + 0.18 + aboveH / 2, oz, 0.6, aboveH / 2, 0.19, "wall", ry);
    AddDoorReveal(sink, {
      x: ox, z: oz, ry: ry + (facing > 0 ? Math.PI : 0), openW: 1.2, openH: doorH,
      depth: 1.3, seed: `${seed}:rv`, paving: "CrossStone", sill: "CrossStone",
    });
    // 朝院的一扇小窗：三根木棂，够读出「窗全朝院里开」。
    // 土坯墙不掏洞（掏洞要拆成窗台墙 + 窗楣墙两段，中景根本看不出来还贵），
    // 木棂**挑在墙面外 0.21 m** —— 土坯房的窗棂本来就钉在墙外皮上。
    const side = rnd() < 0.5 ? -1 : 1;
    const [wx, wz] = F(side * width * 0.28, openLz + Math.sign(openLz) * 0.21);
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(1.05, 0.12, 0.3, TILE_METERS.stone, `${seed}:sill`),
      { x: wx, y: 0.92, z: wz, ry }));
    const frame = [];
    frame.push(PlaceGeometry(MakeBox(0.95, 0.08, 0.1, TILE_METERS.wood, `${seed}:wf0`), { y: 0 }));
    frame.push(PlaceGeometry(MakeBox(0.95, 0.08, 0.1, TILE_METERS.wood, `${seed}:wf1`), { y: 0.95 }));
    for (let m = 0; m < 3; m += 1) {
      frame.push(PlaceGeometry(MakeBox(0.05, 0.95, 0.08, TILE_METERS.wood, `${seed}:wm${m}`),
        { x: -0.32 + m * 0.32, y: 0.475 }));
    }
    sink.Add("WoodDoor", PlaceGeometry(MergeGeometries(frame), { x: wx, y: 0.95, z: wz, ry }));
  }
  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`,
    ruined: collapsed, burnt, rafters: false,
  });
  if (collapsed) {
    sink.props.push({ kind: "rubblePile", x, z, radius: Math.max(width, depth) * 0.45, seed: `${seed}:rp` });
  }
  return ridgeY;
}

/** 木门框 + 小披檐的简易院门（土墙院用；砖院走 AddGatehouse）。 */
function PlainGate(sink, { x, z, ry, seed, damage, openW = 1.3 }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const h = 2.35;
  for (const s of [-1, 1]) {
    const lx = s * (openW / 2 + 0.14);
    sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.22, h, 0.26, TILE_METERS.wood, `${seed}:post${s}`),
      { x: x + cos * lx, y: h / 2, z: z - sin * lx, ry }));
    sink.Solid(x + cos * lx, h / 2, z - sin * lx, 0.13, h / 2, 0.15, "villagePost", ry);
  }
  sink.Add("WoodBeam", PlaceGeometry(MakeBox(openW + 0.9, 0.2, 0.3, TILE_METERS.wood, `${seed}:head`),
    { x, y: h - 0.1, z, ry }));
  if (damage < 0.62) {
    sink.Add("RoofTile", PlaceGeometry(MakeBox(openW + 1.2, 0.1, 0.72, TILE_METERS.roof, `${seed}:eave`),
      { x, y: h + 0.2, z, ry, rx: 0.22 }));
  }
  AddDoorReveal(sink, {
    x, z, ry: ry + Math.PI, openW, openH: 2.0, depth: 1.2, seed: `${seed}:rv`,
    paving: "CrossStone", sill: "CrossStone",
  });
  if (damage < 0.7) {
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.03, 1.98, 0.06, TILE_METERS.wood, `${seed}:leaf`),
      { x: x + cos * (-openW / 4), y: 0.99, z: z - sin * (-openW / 4), ry }));
  }
}

/** 辘轳：两根石柱 + 横木 + 缠绳的木轱辘。水井院从空中一眼认得出的那一件。 */
function WellWindlass(sink, { x, z, ry, seed }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (const s of [-1, 1]) {
    const lx = s * 0.62;
    sink.Add("Stone", PlaceGeometry(MakeBox(0.2, 1.15, 0.2, TILE_METERS.stone, `${seed}:p${s}`),
      { x: x + cos * lx, y: 0.58, z: z - sin * lx, ry }));
    sink.Solid(x + cos * lx, 0.58, z - sin * lx, 0.1, 0.58, 0.1, "villagePost", ry);
  }
  const drum = new THREE.CylinderGeometry(0.14, 0.14, 1.05, 10);
  sink.Add("WoodBeam", PlaceGeometry(drum, { x, y: 1.12, z, ry, rz: Math.PI / 2 }));
  sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.06, 0.30, 0.06, TILE_METERS.wood, `${seed}:crank`),
    { x: x + cos * 0.62, y: 1.26, z: z - sin * 0.62, ry, rz: 0.5 }));
}

/** 石槽（牲口饮水）：井台边上那一条长石头。 */
function StoneTrough(sink, { x, z, ry, seed, length = 1.9 }) {
  sink.Add("Stone", PlaceGeometry(MakeBox(length, 0.46, 0.56, TILE_METERS.stone, `${seed}:trough`),
    { x, y: 0.23, z, ry }));
  sink.Solid(x, 0.23, z, length / 2, 0.23, 0.28, "prop", ry);
}

// ---------------------------------------------------------------------------
// 原型选型
// ---------------------------------------------------------------------------

/**
 * 按 seed 稳定选型。
 *
 * 分布不是均匀噪声，而是**由城心向城根的一道梯度**：
 *   · 靠十字街口（wealth→1）：两进院、店铺排屋多，青砖多；
 *   · 靠城根（wealth→0）：土墙院、L 形院、水井院多。
 * 这是县城本来的贫富纹理，也让俯瞰图读成「有中心的城」而不是随机噪点。
 *
 * **地块尺寸是硬门槛**：PlanBlocks 把与街相交的格子裁掉一半是常事，
 * 全城有相当一部分格子只剩 8—12 m 进深。两进院（倒座 + 二门 + 正房）与
 * 水井院（井台占掉南边四米）在那种窄条上必然与正房穿模 —— 窄格只发标准
 * 一进院与土墙院，它们本来就会按 depth 自动减配。
 *
 * @param {object} o seed 稳定种子；wealth 0..1 离城心的富庶度；shop 是否已被判为临街铺面；
 *                   w/d 这一格实际能用的面阔与进深
 * @returns {string} CITY_BLOCK_ARCHETYPES 里的一个
 */
export function PickCityBlockArchetype({ seed, wealth = 0.5, shop = false, w: cw = 25, d: cd = 21 }) {
  if (shop) return "ShopRow";
  const w = Clamp01(wealth);
  // 两进院要排下「正房 + 后院 + 二门 + 前院 + 倒座」，水井院要排下 4.6 m 的井台：
  // 17 m 是这两样的下限（实测再窄就会退化成一进院，那不如一开始别选它）。
  // L 形院只要厢房排得下就成立，门槛低一档；再窄的条子只发一进院与土墙院，
  // 那两样本来就会按 depth 自动减配。
  const weights = (cd >= 17 && cw >= 16) ? [
    ["OneEntry", 0.30],
    ["TwoEntry", 0.06 + w * 0.26],
    ["AdobeYard", 0.30 - w * 0.20],
    ["LCourtyard", 0.22 - w * 0.06],
    ["WellYard", 0.12 - w * 0.06],
  ] : (cd >= 12 && cw >= 16) ? [
    ["OneEntry", 0.38 + w * 0.14],
    ["AdobeYard", 0.34 - w * 0.14],
    ["LCourtyard", 0.28],
  ] : [
    ["OneEntry", 0.52 + w * 0.18],
    ["AdobeYard", 0.48 - w * 0.18],
  ];
  let total = 0;
  for (const [, weight] of weights) total += weight;
  // 用 HashString 而不是 Mulberry32：同一格在任何一关、任何一次生成里都选同一型。
  let roll = ((HashString(`${seed}:archetype`) >>> 0) % 100000) / 100000 * total;
  for (const [kind, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return "OneEntry";
}

/**
 * 这一格是一户还是两户（D7）。
 *
 * 判定必须**三档 LOD 共用同一个答案**，所以走 HashString 而不是随机数：
 * 玩家从城墙上看见两条脊、走近了就得看见两个门。
 *
 * 谁不分家：
 *   · `ShopRow` —— 铺面本来就是沿街一条排屋，分家的是**间**不是院（见 §连排铺面）；
 *   · `TwoEntry` —— 两进院是这一格里最阔的一户，分了就没有「两进」这回事了；
 *   · `WellYard` —— 井台占掉南边四米半，它的整个识别语言就是那口半公共的井。
 * 剩下的一进院 / 土墙院 / L 形院按 ~55% 分成两户，全城约四成的格子变两户。
 *
 * 尺寸门槛（两户要排下两座正房 + 两个院子；被街裁窄的条子一律仍是一户）：
 *   · 东西对分：面阔 ≥ 17.5（两个 ≥7.7 m 的半边，够两开间正房）、进深 ≥ 12.5；
 *   · 南北对分：进深 ≥ 18（北户 9.2 + 南户 8.8）、面阔 ≥ 17（还要让出 2.8 m 夹道）。
 * 两样都够格时七成走东西对分 —— 东西对分两家都直接临街，是县城里更常见的分法。
 * 全城 395 格里 288 格过得了东西对分的门槛，剩下的都是被街切成条的窄格。
 *
 * @returns {"ew"|"ns"|null}
 */
export function PickDuplex({ seed, kind, w, d, chance = 55 }) {
  if (kind === "ShopRow" || kind === "TwoEntry" || kind === "WellYard") return null;
  const ew = w >= 17.5 && d >= 12.5;
  const ns = d >= 18 && w >= 17;
  if (!ew && !ns) return null;
  if (((HashString(`${seed}:duplex`) >>> 0) % 100) >= chance) return null;
  if (ew && ns) return ((HashString(`${seed}:duplexAxis`) >>> 0) % 10) < 7 ? "ew" : "ns";
  return ew ? "ew" : "ns";
}

// ---------------------------------------------------------------------------
// 近景档（detail）
// ---------------------------------------------------------------------------

function BuildOneEntry(sink, o) {
  // 一进四合院：直接走 Script_World 的 AddCompound（**+π 把朝向转正**）。
  // 留着它是有意的：全城四分之一的格子仍是那座标准院，新原型才读得出是「变化」。
  const built = AddCompound(sink, {
    x: o.x, z: o.z, ry: o.ry + Math.PI, width: o.w, depth: o.d,
    seed: o.seed, damage: o.damage, burnt: o.burnt,
  });
  return built?.householdProps || 0;
}

function BuildTwoEntry(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const rnd = Mulberry32(HashString(`${seed}:two`));
  const w = o.w, d = o.d;
  const F = Frame(x, z, ry);
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const mir = MirrorOf(seed);
  const gateAt = mir * w * (0.18 + rnd() * 0.12);  // 正格：门在东南角（局部 +x = 东）
  const ringH = 2.15 + rnd() * 0.3;

  WallRing(sink, {
    x, z, ry, w, d, seed: `${seed}:ring`, damage, material: wallMat, height: ringH,
    plinth: "CrossStone", cope: true, gate: { offset: gateAt, openW: 1.5 },
  });
  const [gx, gz] = F(gateAt, d / 2);
  AddGatehouse(sink, { x: gx, z: gz, ry: ry + Math.PI, seed: `${seed}:gh`, damage, burnt, openW: 1.5 });
  ScreenWall(sink, { x, z, ry, seed, damage, at: gateAt, d });

  // 正房（后进，三开间，门朝南）
  const mainW = Math.min(w - 3.0, 10.0 + rnd() * 1.4);
  const mainD = Math.min(5.0 + rnd() * 0.9, d * 0.3);
  const eave = 2.55 + rnd() * 0.22;
  const [nx, nz] = F(0, -d / 2 + 0.6 + mainD / 2);
  AddRoomBlock(sink, {
    x: nx, z: nz, ry, width: mainW, depth: mainD,
    eaveY: eave, ridgeY: eave + mainD * 0.5 * PITCH,
    seed: `${seed}:main`, damage, burnt, facing: -1, bays: 3,
  });

  // 剩下的进深要分给：后院（内院）+ 二门 + 前院 + 倒座房。
  // 这四样在一格 25×21 的宅基上刚好排得开；被街裁窄的格子排不开，
  // 就退成「一进院 + 东南角门」——**宁可少一进，不许两座房子穿在一起**。
  const frontD = 3.9;
  const mainBack = -d / 2 + 0.6 + mainD;                 // 正房南墙
  const frontRowFace = d / 2 - 0.45 - frontD;            // 倒座北墙
  const available = frontRowFace - mainBack;
  const twoEntry = available >= 9.0;
  const innerZ = mainBack + (twoEntry ? Math.max(5.2, available * 0.55) : available + 9);

  if (twoEntry) {
    // 倒座房：贴南墙、门朝北开进前院（facing:+1）。它是两进院从街上唯一读得到的
    // 差别 —— 临街那一面多出一条与院墙齐平的瓦脊。
    const frontW = Math.min(w * 0.46, 11.5);
    const [fx, fz] = F(-mir * w * 0.20, d / 2 - 0.45 - frontD / 2);
    AddRoomBlock(sink, {
      x: fx, z: fz, ry, width: frontW, depth: frontD,
      eaveY: 2.38, ridgeY: 2.38 + frontD * 0.5 * PITCH,
      seed: `${seed}:front`, damage: Clamp(damage + rnd() * 0.15, 0, 1), burnt,
      facing: 1, bays: 3,
    });
    // 二门：把院子分成前后两进。这是「两进」二字唯一的物理证据，不许省。
    const [mx, mz] = F(0, innerZ);
    GapWall(sink, {
      x: mx, z: mz, ry, length: w - 0.8, height: 2.25, thickness: 0.3, material: wallMat,
      seed: `${seed}:inner`, ruin: damage * 0.6, openW: 1.6, at: gateAt * 0.4,
      plinth: "CrossStone", cope: true,
    });
    const [ix, iz] = F(gateAt * 0.4, innerZ);
    if (damage < 0.7) {
      for (const s of [-1, 1]) {
        const lx = s * 0.98;
        sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.2, 2.4, 0.34, TILE_METERS.wood, `${seed}:ip${s}`),
          { x: ix + Math.cos(ry) * lx, y: 1.2, z: iz - Math.sin(ry) * lx, ry }));
      }
      sink.Add("RoofTile", PlaceGeometry(MakeBox(2.9, 0.12, 1.05, TILE_METERS.roof, `${seed}:ir`),
        { x: ix, y: 2.62, z: iz, ry }));
    }
  }

  // 厢房（后进，与大门相对的那一侧，脊走南北 —— 俯瞰上与正房的东西脊交成一个 T）。
  // 必须整条待在后院里：伸过二门就会被那道墙从中间穿过去。
  const wingD = 3.6;
  const wingSide = -mir;                            // 正格：门在东，厢房在西
  const wingFrom = mainBack + 0.5;
  const wingTo = Math.min(innerZ - 0.7, d / 2 - 1.4);
  const wingLen = Math.min(wingTo - wingFrom, d * 0.42);
  if (wingLen > 3.2 && w > 16) {
    const [ex, ez] = F(wingSide * (w / 2 - 0.55 - wingD / 2), wingFrom + wingLen / 2);
    AddRoomBlock(sink, {
      x: ex, z: ez, ry: ry + Math.PI / 2, width: wingLen, depth: wingD,
      eaveY: 2.28, ridgeY: 2.28 + wingD * 0.5 * PITCH,
      seed: `${seed}:wing`, damage: Clamp(damage + rnd() * 0.18, 0, 1), burnt,
      facing: wingSide > 0 ? 1 : -1, bays: 2,       // 门朝院心开
    });
  }

  const yardZ = Clamp(mainBack + 2.4, mainBack + 1.4, Math.min(innerZ, d / 2) - 1.4);
  const [lx2, lz2] = F(mir * w * 0.12, yardZ);
  let props = AddCourtyardLife(sink, {
    x: lx2, z: lz2, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, w - 6.0), depth: Math.max(4.5, available * 0.5), damage,
  });
  if (rnd() < 0.6) { AddWell(sink, ...F(mir * w * 0.3, yardZ - 0.4)); props += 1; }
  return props;
}

function BuildAdobeYard(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const rnd = Mulberry32(HashString(`${seed}:adobe`));
  const w = o.w, d = o.d;
  const F = Frame(x, z, ry);
  const wallMat = burnt ? "BrickWallSooty" : "Adobe";
  const mir = MirrorOf(seed);
  const gateAt = mir * w * (0.16 + rnd() * 0.12);
  // 土墙比砖墙矮一档（史料区间的下限 1.8—2.0），没有瓦压顶、没有条石碱脚。
  const ringH = 1.82 + rnd() * 0.22;

  WallRing(sink, {
    x, z, ry, w, d, seed: `${seed}:ring`, damage, material: wallMat, height: ringH,
    thickness: 0.42, plinth: null, cope: false,
    gate: { offset: gateAt, openW: 1.3 },
    tag: "villageCourtyard",                       // 土坯墙比青砖脆：lightMasonry
  });
  const [gx, gz] = F(gateAt, d / 2);
  PlainGate(sink, { x: gx, z: gz, ry, seed: `${seed}:gate`, damage, openW: 1.3 });

  // 正房：土坯 + 过墙石碱脚
  const mainW = Math.min(9.2 + rnd() * 1.6, w - 2.6);
  const mainD = Math.min(4.7 + rnd() * 0.8, d - 3.0);
  const [nx, nz] = F(-mir * w * 0.05, -d / 2 + 0.7 + mainD / 2);
  AdobeHouse(sink, {
    x: nx, z: nz, ry, width: mainW, depth: mainD, eaveY: 2.42 + rnd() * 0.2,
    seed: `${seed}:main`, damage, burnt, facing: 1,
  });
  // 正房南墙的 z（局部）：底下所有东西都要给它让开，否则窄格上必穿模
  const mainBack = -d / 2 + 0.7 + mainD;
  // 厢房一间（矮，土坯），脊走南北；与大门相对的那一侧
  const wingSide = -mir;
  const wingLen = 5.4 + rnd() * 1.4;
  if (rnd() < 0.72 && mainBack + 2.2 + wingLen < d / 2 - 1.0 && w > 16) {
    const [wx, wz] = F(wingSide * (w / 2 - 0.7 - 1.8), mainBack + 2.2 + wingLen / 2);
    AdobeHouse(sink, {
      x: wx, z: wz, ry: ry + Math.PI / 2, width: wingLen, depth: 3.3,
      eaveY: 2.2, seed: `${seed}:wing`, damage: Clamp(damage + rnd() * 0.2, 0, 1),
      burnt, facing: wingSide > 0 ? 1 : -1,
    });
  }

  // 后院矮墙：把院子的南三分之一隔成牲口棚/柴院 —— 土墙院的识别语言。
  // 窄格（进深不足）上正房已经顶到院心，这道墙没有地方站，直接不做。
  const lowZ = Math.max(d * 0.16, mainBack + 1.6);
  if (lowZ < d / 2 - 2.2) {
    const [ly, lz] = F(0, lowZ);
    GapWall(sink, {
      x: ly, z: lz, ry, length: w - 1.2, height: 1.12, thickness: 0.34, material: wallMat,
      seed: `${seed}:low`, ruin: damage * 0.5, openW: 1.8, at: mir * w * 0.18,
      plinth: null, cope: false, tag: "villageCourtyard",
    });
  }
  // 后院家什一律压在「正房南墙之后、南院墙之前」这一段里
  const Yard = (t) => Clamp(mainBack + 1.3 + t, mainBack + 1.3, d / 2 - 1.2);
  const [sx, sz] = F(-mir * w * 0.22, Yard(1.0));
  let props = AddStalkStack(sink, { x: sx, z: sz, ry, seed: `${seed}:stalk`, scale: 0.95 });
  const [hx, hz] = F(mir * w * 0.28, Yard(1.3));
  props += AddManureHeap(sink, { x: hx, z: hz, seed: `${seed}:heap`, scale: 0.8 });
  const [vx, vz] = F(mir * w * 0.06, Yard(1.9));
  props += AddVegetableBeds(sink, { x: vx, z: vz, ry, seed: `${seed}:beds`, rows: 3, rowLength: 3.6 });
  const [yx, yz] = F(-mir * w * 0.05, Yard(0.6));
  props += AddYardWear(sink, { x: yx, z: yz, ry, seed: `${seed}:wear`, radius: 3.0 });
  if (rnd() < 0.5) { AddWaterVat(sink, ...F(-mir * w * 0.32, Yard(0.3)), `${seed}:vat`); props += 1; }
  return props;
}

function BuildLCourtyard(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const rnd = Mulberry32(HashString(`${seed}:ell`));
  const w = o.w, d = o.d;
  const F = Frame(x, z, ry);
  const wallMat = burnt ? "BrickWallSooty" : (rnd() < 0.38 ? "Adobe" : "BrickWall");
  const mir = MirrorOf(seed);
  const gateAt = mir * w * (0.22 + rnd() * 0.10);
  const ringH = 2.0 + rnd() * 0.28;
  const brick = wallMat !== "Adobe";

  WallRing(sink, {
    x, z, ry, w, d, seed: `${seed}:ring`, damage, material: wallMat, height: ringH,
    plinth: brick ? "CrossStone" : null, cope: brick,
    gate: { offset: gateAt, openW: 1.5 },
    tag: brick ? "wall" : "villageCourtyard",
  });
  const [gx, gz] = F(gateAt, d / 2);
  if (brick) AddGatehouse(sink, { x: gx, z: gz, ry: ry + Math.PI, seed: `${seed}:gh`, damage, burnt, openW: 1.5 });
  else PlainGate(sink, { x: gx, z: gz, ry, seed: `${seed}:gate`, damage, openW: 1.4 });
  ScreenWall(sink, { x, z, ry, seed, damage, at: gateAt, d });

  const wingD = 3.8;
  const mainW = Math.min(w * 0.44, 10.5);
  const mainD = 4.9 + rnd() * 0.8;
  const eave = 2.5 + rnd() * 0.24;
  // 正房要给厢房让开：厢房占掉 wingD 一条，正房中心不许越过它
  const wingSide = -mir;
  const mainAt = wingSide * Math.min(w * 0.16, Math.max(0, w / 2 - wingD - mainW / 2 - 0.6));
  const [nx, nz] = F(mainAt, -d / 2 + 0.6 + mainD / 2);
  AddRoomBlock(sink, {
    x: nx, z: nz, ry, width: mainW, depth: mainD,
    eaveY: eave, ridgeY: eave + mainD * 0.5 * PITCH,
    seed: `${seed}:main`, damage, burnt, facing: -1, bays: 3,
  });
  // 一侧一条长厢房：与正房拼成 L。俯瞰上是一条东西脊接一条南北脊。
  const wingLen = Math.min(d * 0.52, d - 5.0);
  const [ex, ez] = F(wingSide * (w / 2 - 0.6 - wingD / 2), -d / 2 + 0.6 + wingLen / 2);
  AddRoomBlock(sink, {
    x: ex, z: ez, ry: ry + Math.PI / 2, width: wingLen, depth: wingD,
    eaveY: 2.32, ridgeY: 2.32 + wingD * 0.5 * PITCH,
    seed: `${seed}:wing`, damage: Clamp(damage + rnd() * 0.12, 0, 1), burnt,
    facing: wingSide > 0 ? 1 : -1, bays: 3,
  });
  // 西半边不盖房：菜畦 + 碌碡 + 一垛柴 —— L 形院的空当本来就是菜地
  const [vx, vz] = F(mir * w * 0.26, -d * 0.05);
  let props = AddVegetableBeds(sink, { x: vx, z: vz, ry, seed: `${seed}:beds`, rows: 4, rowLength: 4.4 });
  const [rx, rz] = F(mir * w * 0.30, d * 0.24);
  props += AddStoneRoller(sink, { x: rx, z: rz, ry: ry + 0.4, seed: `${seed}:roller` });
  const [lx2, lz2] = F(-mir * w * 0.06, -d / 2 + mainD + 2.4);
  props += AddCourtyardLife(sink, {
    x: lx2, z: lz2, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, w * 0.5), depth: Math.max(4.5, d - mainD - 4.0), damage,
  });
  if (rnd() < 0.5) { AddMillstone(sink, ...F(mir * w * 0.10, d * 0.10), `${seed}:ms`); props += 1; }
  return props;
}

function BuildWellYard(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const rnd = Mulberry32(HashString(`${seed}:well`));
  const w = o.w, d = o.d;
  const F = Frame(x, z, ry);
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const ringH = 2.05 + rnd() * 0.2;

  // 巷口井院：南面是一个 3.2 m 的过道口（只有门垛没有门楼），
  // 井台半公共 —— 一条巷子里的几户共用一口井，这是县城的常态。
  // 过道口刻意偏在一侧：居中的话临街枪眼（AddStreetLoopholes 打三个、中间那个在正中）
  // 会正好悬在豁口里，出图上是三个飘在空气中的方洞。
  const mir = MirrorOf(seed);
  const gateAt = mir * w * 0.26;
  WallRing(sink, {
    x, z, ry, w, d, seed: `${seed}:ring`, damage, material: wallMat, height: ringH,
    plinth: "CrossStone", cope: true, gate: { offset: gateAt, openW: 3.2 },
  });
  const [gx, gz] = F(gateAt, d / 2);
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (const s of [-1, 1]) {
    const lx = s * 1.78;
    sink.Add("CrossStone", PlaceGeometry(MakeBox(0.5, ringH + 0.35, 0.62, TILE_METERS.stone, `${seed}:pier${s}`),
      { x: gx + cos * lx, y: (ringH + 0.35) / 2, z: gz - sin * lx, ry }));
    sink.Solid(gx + cos * lx, (ringH + 0.35) / 2, gz - sin * lx,
      0.25, (ringH + 0.35) / 2, 0.31, "wall", ry);
  }

  // 井台：一片条石铺地 + 井 + 辘轳 + 石槽 + 水缸
  const [wx, wz] = F(0, d / 2 - 4.2);
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(5.4, 0.14, 4.6, TILE_METERS.stone, `${seed}:apron`), { x: wx, y: 0.07, z: wz, ry }));
  AddWell(sink, wx, wz);
  WellWindlass(sink, { x: wx, z: wz, ry, seed: `${seed}:lulu` });
  const [tx, tz] = F(mir * 2.0, d / 2 - 5.6);
  StoneTrough(sink, { x: tx, z: tz, ry, seed: `${seed}:trough` });
  AddWaterVat(sink, ...F(-mir * 2.1, d / 2 - 5.4), `${seed}:vat`);
  let props = 4 + AddYardWear(sink, { x: wx, z: wz, ry, seed: `${seed}:wear`, radius: 3.4 });

  // 北面两户：正房 + 一间西厢
  const mainW = Math.min(w * 0.42, 10.0);
  const mainD = 4.8 + rnd() * 0.7;
  const eave = 2.48 + rnd() * 0.24;
  const [nx, nz] = F(-mir * w * 0.18, -d / 2 + 0.6 + mainD / 2);
  AddRoomBlock(sink, {
    x: nx, z: nz, ry, width: mainW, depth: mainD,
    eaveY: eave, ridgeY: eave + mainD * 0.5 * PITCH,
    seed: `${seed}:main`, damage, burnt, facing: -1, bays: 3,
  });
  const [ax, az] = F(mir * w * 0.26, -d / 2 + 0.6 + mainD * 0.9 / 2);
  AddRoomBlock(sink, {
    x: ax, z: az, ry, width: Math.min(w * 0.3, 7.2), depth: mainD * 0.9,
    eaveY: 2.3, ridgeY: 2.3 + mainD * 0.9 * 0.5 * PITCH,
    seed: `${seed}:annex`, damage: Clamp(damage + rnd() * 0.2, 0, 1), burnt,
    facing: -1, bays: 2,
  });
  const [cx2, cz2] = F(0, -d / 2 + mainD + 2.4);
  props += AddCourtyardLife(sink, {
    x: cx2, z: cz2, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, w - 6.0), depth: Math.max(4.5, d - mainD - 8.0), damage,
  });
  return props;
}

// ---------------------------------------------------------------------------
// 一格两户（D7）
//
// WP-C1 的遗留 #1：一格 25 × 21 m 的宅基上只站着一到两座房，院子仍然空 ——
// 真实县城这块地住两三户。这一节把「一格 = 一户」放开成「一格 = 两户共山墙小院」。
//
// **雕格让位语义一行没有动**：街／十字口／地标／上城道／顺城街／视线走廊仍由
// `PlanBlocks` 原样裁切，两户是在**活下来的那一格里面**分的（`BlockPlan` 只多返回
// 一个 `duplex` 字段），所以不会有任何一户挤进街面或地标的退让带。
//
// 两种分法（都是鲁南县城的常态，见 docs/Data_TengxianCity.md §4.6「一进院落为主」）：
//
//   · `"ew"` 东西对分 —— **字面意义的共山墙**：两座正房同进深、同一条脊线并排，
//     两堵硬山山墙在中间贴在一起，中缝再压一道通到南墙的隔墙。两家的门都开在
//     自家院子的东南角，于是南墙上并排两个门洞 —— 这是从街上一眼读出「这是两户」
//     的唯一证据，不许省。
//   · `"ns"` 南北对分 —— 南户临街、北户走**夹道**：南墙上除院门外另开一个 2 m 的
//     夹道口，一条 2.8 m 净宽的夹道贴着西（或东）山墙通到中间那道隔墙，
//     北户的门就开在隔墙上。南户正房的后墙**就是**那道隔墙（共墙不共山墙）。
//     夹道必须真能走 —— 内部空间契约：门洞必可走。
//
// 为什么不给两户各盖一圈院墙：那是四堵墙贴着四堵墙，既贵又假。
// 真的分家是**共一道墙**，这也正好把两户的成本压到接近单户。
// ---------------------------------------------------------------------------

/** 一段直墙 + 碰撞 + Cover。院墙/隔墙/夹道墙共用（比 GapWall 少一层豁口逻辑）。 */
function StraightWall(sink, {
  x, z, ry, length, height, thickness, material, seed, ruin = 0,
  plinth = null, cope = true, tag = "wall",
}) {
  if (length < 0.35) return;
  AddWall(sink, material, {
    x, z, length, height, thickness, ry, ruin, seed,
    tile: TileFor(material), plinth, cope, solid: false,
  });
  sink.Solid(x, height / 2, z, length / 2, height / 2, thickness / 2, tag, ry);
  sink.Cover(x, z, height * (1 - ruin * 0.5), Math.sin(ry), Math.cos(ry));
}

/**
 * 灶棚：贴着院墙的一间单坡小披厦（两个盒子，约 24 三角）。
 *
 * 两户挤一格之后院子小了，正房之外再塞厢房必然穿模；但一户人家总得有个
 * 做饭的地方 —— 灶棚是把「这里住着人」交代清楚的**最便宜**的一件。
 */
function CookShed(sink, { x, z, ry, seed, width = 2.4, depth = 1.9, material }) {
  const h = 1.95;
  sink.Add(material, PlaceGeometry(
    MakeBox(width, h, depth, TileFor(material), `${seed}:shed`), { x, y: h / 2, z, ry }));
  sink.Solid(x, h / 2, z, width / 2, h / 2, depth / 2, "villageCourtyard", ry);
  sink.Add("RoofTile", PlaceGeometry(
    MakeBox(width + 0.3, 0.1, depth + 0.5, TILE_METERS.roof, `${seed}:shedRoof`),
    { x, y: h + 0.18, z, ry, rx: 0.26 }));
}

/**
 * 两户共山墙小院。`o.duplex` = "ew"（东西对分）/ "ns"（南北对分）。
 * `o.kind` 只用来决定材质味道（AdobeYard → 土坯），形制走本函数。
 * @returns {number} 家什件数
 */
function BuildDuplex(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const w = o.w, d = o.d;
  const rnd = Mulberry32(HashString(`${seed}:duplex`));
  const F = Frame(x, z, ry);
  const adobe = o.kind === "AdobeYard";
  const wallMat = burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "BrickWall");
  const ringH = adobe ? 1.84 + rnd() * 0.2 : 2.10 + rnd() * 0.26;
  const ringT = adobe ? 0.42 : 0.35;
  const plinth = adobe ? null : "CrossStone";
  const ringTag = adobe ? "villageCourtyard" : "wall";
  const S = MirrorOf(seed);                        // +1 正格，−1 整个平面左右镜像
  const houseD = Math.min(4.5 + rnd() * 0.6, d * 0.30);
  let props = 0;

  if (o.duplex === "ns") {
    // ---- 南北对分：南户临街，北户走夹道 ----
    const zSplit = -d / 2 + Math.max(9.2, d * 0.45);
    const laneW = 2.8;                             // 夹道净宽（人走得过去，大车过不去）
    const laneWallX = -w / 2 + 0.35 + laneW;       // 夹道与南户院子之间那道墙
    const laneMid = -w / 2 + 0.35 + laneW / 2;
    const southGate = w / 2 - 2.5 - rnd() * 0.7;   // 南户的门：自家院子的东南角
    WallRing(sink, {
      x, z, ry, w, d, seed: `${seed}:ring`, damage, material: wallMat, height: ringH,
      thickness: ringT, plinth, cope: !adobe, tag: ringTag,
      gates: [
        { offset: S * southGate, openW: 1.4 },
        { offset: S * laneMid, openW: 2.0 },       // 夹道口：北户从这里进
      ],
    });
    const [sgx, sgz] = F(S * southGate, d / 2);
    PlainGate(sink, { x: sgx, z: sgz, ry, seed: `${seed}:gs`, damage, openW: 1.4 });
    // 夹道墙：从南墙一直到中间那道隔墙
    const laneLen = d / 2 - zSplit;
    const [lwx, lwz] = F(S * laneWallX, zSplit + laneLen / 2);
    StraightWall(sink, {
      x: lwx, z: lwz, ry: ry + Math.PI / 2, length: laneLen, height: ringH, thickness: 0.32,
      material: wallMat, seed: `${seed}:lane`, ruin: damage * 0.7,
      plinth, cope: !adobe, tag: ringTag,
    });
    // 中间那道隔墙（两户共用）：北户的门开在夹道那一端
    const [pwx, pwz] = F(0, zSplit);
    GapWall(sink, {
      x: pwx, z: pwz, ry, length: w, height: ringH + 0.1, thickness: 0.36, material: wallMat,
      seed: `${seed}:party`, ruin: damage * 0.55,
      gaps: [{ at: S * laneMid, openW: 1.4 }], plinth, cope: !adobe, tag: ringTag,
    });
    const [ngx, ngz] = F(S * laneMid, zSplit);
    PlainGate(sink, { x: ngx, z: ngz, ry, seed: `${seed}:gn`, damage, openW: 1.4 });

    // 北户正房（贴北墙，坐北朝南）
    const nW = Math.min(w - 2.6, 10.4);
    const [nx, nz] = F(S * w * 0.04, -d / 2 + 0.65 + houseD / 2);
    HouseOf(sink, adobe, {
      x: nx, z: nz, ry, width: nW, depth: houseD, eaveY: 2.46 + rnd() * 0.2,
      seed: `${seed}:north`, damage, burnt, facing: 1,
    });
    // 南户正房：后墙就贴着那道隔墙，门朝南开进自家院子
    const sSpanFrom = laneWallX + 0.5, sSpanTo = w / 2 - 0.55;
    const sW = Math.min(sSpanTo - sSpanFrom, 9.6);
    if (sW > 5.0) {
      const [sx, sz] = F(S * (sSpanTo - sW / 2), zSplit + 0.28 + houseD / 2);
      HouseOf(sink, adobe, {
        x: sx, z: sz, ry, width: sW, depth: houseD, eaveY: 2.42 + rnd() * 0.2,
        seed: `${seed}:south`, damage: Clamp(damage + rnd() * 0.12, 0, 1), burnt,
        facing: 1,
      });
    }
    // 两家的院子（北户在隔墙以北、南户在正房以南）
    const [ncx, ncz] = F(S * w * 0.02, -d / 2 + 0.65 + houseD + 1.9);
    props += AddCourtyardLife(sink, {
      x: ncx, z: ncz, ry, baseY: 0, seed: `${seed}:nlife`,
      width: Math.max(5, w - 5.5), depth: Math.max(3.2, zSplit - (-d / 2 + houseD) - 2.4), damage,
    });
    const [scx, scz] = F(S * (sSpanTo - 3.0), zSplit + 0.28 + houseD + 2.1);
    props += AddYardWear(sink, { x: scx, z: scz, ry, seed: `${seed}:swear`, radius: 2.6 });
    const [vx, vz] = F(S * (laneWallX + 2.2), d / 2 - 5.6);
    props += AddVegetableBeds(sink, { x: vx, z: vz, ry, seed: `${seed}:beds`, rows: 2, rowLength: 3.0 });
    // 灶棚贴夹道墙那一侧 —— 南户的院门在另一头的东南角，别堵在门口
    const [kx, kz] = F(S * (laneWallX + 1.8), d / 2 - 2.2);
    CookShed(sink, { x: kx, z: kz, ry, seed: `${seed}:shed`, material: wallMat });
    if (rnd() < 0.55) { AddWaterVat(sink, ...F(S * w * 0.30, -d / 2 + houseD + 1.4), `${seed}:vat`); props += 1; }
    return props;
  }

  // ---- 东西对分：两座正房同脊并排，中间一道共山墙 ----
  const split = (rnd() - 0.5) * w * 0.12;          // 分家分不匀：中缝不在正中
  const leftIn = -w / 2 + 0.55, rightIn = w / 2 - 0.55;
  const spanA = (split - 0.62) - leftIn;           // 西户（局部 −x 那一半）
  const spanB = rightIn - (split + 0.62);
  const gateA = split - 0.62 - 1.35;               // 西户的门：自家院子的东南角
  const gateB = rightIn - 1.9 - rnd() * 0.6;
  WallRing(sink, {
    x, z, ry, w, d, seed: `${seed}:ring`, damage, material: wallMat, height: ringH,
    thickness: ringT, plinth, cope: !adobe, tag: ringTag,
    gates: [{ offset: S * gateA, openW: 1.35 }, { offset: S * gateB, openW: 1.35 }],
  });
  const [gax, gaz] = F(S * gateA, d / 2);
  PlainGate(sink, { x: gax, z: gaz, ry, seed: `${seed}:ga`, damage, openW: 1.35 });
  const [gbx, gbz] = F(S * gateB, d / 2);
  PlainGate(sink, { x: gbx, z: gbz, ry, seed: `${seed}:gb`, damage, openW: 1.35 });

  // 共山墙：房带那一段高过檐口（两堵硬山山墙中缝里的那道墙），院子那一段落回院墙高
  const fin = houseD + 0.55;
  const eaveA = 2.44 + rnd() * 0.18;
  const eaveB = eaveA + (rnd() - 0.5) * 0.24;      // 两家不同年月盖的：脊线错一档
  const [f1x, f1z] = F(S * split, -d / 2 + fin / 2);
  StraightWall(sink, {
    x: f1x, z: f1z, ry: ry + Math.PI / 2, length: fin,
    height: Math.max(eaveA, eaveB) + 0.85, thickness: 0.40, material: wallMat,
    seed: `${seed}:fin`, ruin: damage * 0.5, plinth, cope: !adobe, tag: ringTag,
  });
  const yardLen = d - fin;
  const [f2x, f2z] = F(S * split, -d / 2 + fin + yardLen / 2);
  StraightWall(sink, {
    x: f2x, z: f2z, ry: ry + Math.PI / 2, length: yardLen, height: ringH, thickness: 0.34,
    material: wallMat, seed: `${seed}:mid`, ruin: damage * 0.6, plinth, cope: !adobe, tag: ringTag,
  });

  // 两座正房：同进深、同一条脊线，山墙在中缝贴到一起
  const houseZ = -d / 2 + 0.65 + houseD / 2;
  const halves = [
    { span: spanA, edge: split - 0.62, dir: -1, eave: eaveA, tag: "a", gate: gateA },
    { span: spanB, edge: split + 0.62, dir: 1, eave: eaveB, tag: "b", gate: gateB },
  ];
  for (const h of halves) {
    if (h.span < 5.2) continue;                    // 这一半窄到盖不下正房：留成空院
    const hw = Math.min(h.span - 0.6, 10.6);
    // 正房的山墙要顶到中缝：把这一半靠中缝的那条边当基准往外量
    const houseX = h.edge + h.dir * (hw / 2);
    const [hx, hz] = F(S * houseX, houseZ);
    HouseOf(sink, adobe, {
      x: hx, z: hz, ry, width: hw, depth: houseD, eaveY: h.eave,
      seed: `${seed}:${h.tag}`, damage: Clamp(damage + (h.tag === "b" ? rnd() * 0.14 : 0), 0, 1),
      burnt, facing: 1,
    });
    // 院子：影壁（砖院才有）+ 一点家什 + 灶棚
    if (!adobe && damage < 0.7) {
      ScreenWall(sink, { x, z, ry, seed: `${seed}:${h.tag}`, damage, at: S * h.gate, d });
    }
    const yardMid = -d / 2 + houseD + 1.2 + (d - houseD - 2.4) * 0.45;
    const [cx2, cz2] = F(S * (h.edge + h.dir * (h.span * 0.5)), yardMid);
    props += AddCourtyardLife(sink, {
      x: cx2, z: cz2, ry, baseY: 0, seed: `${seed}:${h.tag}life`,
      width: Math.max(4.5, h.span - 2.0), depth: Math.max(3.4, d - houseD - 4.4), damage,
    });
    // 灶棚摆在**院门对面**那个墙角：西户的门在中缝一侧 ⇒ 灶棚贴外墙；
    // 东户的门在外墙一侧 ⇒ 灶棚贴中缝。第一版两家都贴外墙，东户的灶棚
    // 正好压在自家门口，从门洞进来先撞棚子。
    const shedX = h.tag === "a" ? h.edge + h.dir * (h.span - 1.6) : h.edge + h.dir * 1.6;
    const [kx, kz] = F(S * shedX, d / 2 - 2.3);
    CookShed(sink, { x: kx, z: kz, ry, seed: `${seed}:${h.tag}shed`, material: wallMat });
  }
  if (rnd() < 0.5 && spanA > 5.2) {
    const [stx, stz] = F(S * (split - 0.62 - spanA * 0.4), d / 2 - 3.2);
    props += AddStalkStack(sink, { x: stx, z: stz, ry, seed: `${seed}:stalk`, scale: 0.8 });
  }
  return props;
}

/** 砖房走 AddRoomBlock，土坯房走 AdobeHouse —— 两户小院两种材质都要用得上。 */
function HouseOf(sink, adobe, o) {
  if (adobe) {
    AdobeHouse(sink, {
      x: o.x, z: o.z, ry: o.ry, width: o.width, depth: o.depth, eaveY: o.eaveY,
      seed: o.seed, damage: o.damage, burnt: o.burnt, facing: o.facing,
    });
    return;
  }
  AddRoomBlock(sink, {
    x: o.x, z: o.z, ry: o.ry, width: o.width, depth: o.depth,
    eaveY: o.eaveY, ridgeY: o.eaveY + o.depth * 0.5 * PITCH,
    seed: o.seed, damage: o.damage, burnt: o.burnt,
    facing: o.facing > 0 ? -1 : 1, bays: o.width > 8.4 ? 3 : 2,
  });
}

/**
 * 临街铺面排屋。
 *
 * 与其他原型不同，它**跟着街转**：调用方把 ry 转到「局部 +z 指向那条街」。
 * 铺面在街上只有两条识别语言（WP-B4 在西关街上验过）：
 *   ① 整间可拆的**排门板** —— 有一间卸了板，玩家能看进去；
 *   ② 檐下挑出的**幌子**。
 * 其余从简。后院是一圈矮墙 + 一间库房，不做第二进。
 *
 * 顺带修掉的既有问题：原来的 shop 分支拿 `AddRoomBlock(width: cell.w-1.2,
 * depth: cell.d-1.2)` 盖 —— 一间 24×20 m 的单跨房，脊只比檐高 1.7 m，
 * 等于一块 20 m 进深的平板。铺面本来就是**沿街一条浅进深的排屋**。
 */
/**
 * 一间铺面（连排里的一间）。门脸在局部 +z，前檐线由调用方对齐。
 *
 * 一间 = 台明 + 后檐墙 + 两山墙 + 檐柱 + 排门板 + 硬山瓦顶 + 一根幌子杆。
 * 两间挨着盖时，各自的硬山山墙在中缝贴到一起 —— **那道并起来的砖垛就是
 * 「连排」二字在街上唯一的证据**，所以每一间都留自己的山墙，不共用。
 */
function ShopUnit(sink, {
  x, z, ry, width, depth, eave, seed, damage, burnt, mat, podiumH,
  openBay = -1, sign = true,
}) {
  const rnd = Mulberry32(HashString(`${seed}:unit`));
  const RF = Frame(x, z, ry);
  const collapsed = damage > 0.66;
  const bays = Math.max(2, Math.round(width / 3.3));
  const bayW = width / bays;

  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(width + 0.5, podiumH, depth + 0.5, TILE_METERS.stone, `${seed}:podium`),
    { x, y: podiumH / 2, z, ry }));

  const closed = [
    { lx: 0, lz: -depth / 2, len: width, rot: 0 },
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < closed.length; i += 1) {
    const c = closed[i];
    const [cx, cz] = RF(c.lx, c.lz);
    AddWall(sink, mat, {
      x: cx, z: cz, length: c.len, height: eave, thickness: 0.36, ry: ry + c.rot,
      ruin: damage * 0.85, seed: `${seed}:cw${i}`, plinth: "CrossStone",
    });
  }

  for (let b = 0; b <= bays; b += 1) {
    const lx = -width / 2 + b * bayW;
    const [px, pz] = RF(lx, depth / 2 - 0.12);
    sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.24, eave, 0.24, TILE_METERS.wood, `${seed}:col${b}`),
      { x: px, y: eave / 2, z: pz, ry }));
    sink.Solid(px, eave / 2, pz, 0.13, eave / 2, 0.13, "villagePost", ry);
  }
  const [fx, fz] = RF(0, depth / 2 - 0.12);
  sink.Add("WoodBeam", PlaceGeometry(MakeBox(width + 0.3, 0.26, 0.3, TILE_METERS.wood, `${seed}:archi`),
    { x: fx, y: eave - 0.13, z: fz, ry }));
  for (let b = 0; b < bays; b += 1) {
    const lx = -width / 2 + (b + 0.5) * bayW;
    const [bx, bz] = RF(lx, depth / 2 - 0.12);
    if (b === openBay && !collapsed) {
      // 卸了板的那一间：只剩门槛石与斜靠柱子的两扇板（不摆碰撞，玩家走得进去）
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(bayW - 0.4, 0.16, 0.5, TILE_METERS.stone, `${seed}:sill${b}`),
        { x: bx, y: podiumH + 0.02, z: bz, ry }));
      for (const s of [-1, 1]) {
        const ox = lx + s * (bayW / 2 - 0.36);
        const [dx, dz] = RF(ox, depth / 2 - 0.34);
        sink.Add("WoodDoor", PlaceGeometry(
          MakeBox(0.44, eave - 0.5, 0.06, TILE_METERS.wood, `${seed}:leaned${b}${s}`),
          { x: dx, y: 0.28 + (eave - 0.5) / 2, z: dz, ry, rx: s * 0.12 }));
      }
      continue;
    }
    const panels = Math.max(4, Math.round((bayW - 0.3) / 0.42));
    const panelW = (bayW - 0.3) / panels;
    const gone = [];
    for (let p = 0; p < panels; p += 1) {
      if (damage > 0.45 && ((p + b) % 4 === 0)) { gone.push(p); continue; }   // 打烂的铺子缺几块板
      const ox = lx - (bayW - 0.3) / 2 + (p + 0.5) * panelW;
      const [dx, dz] = RF(ox, depth / 2 - 0.14);
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(panelW * 0.94, eave - 0.34, 0.07, TILE_METERS.wood, `${seed}:panel${b}${p}`),
        { x: dx, y: 0.28 + (eave - 0.34) / 2, z: dz, ry }));
    }
    // 碰撞跟着板走：缺了板的那几格是真洞，看得见就该扔得进去
    if (!gone.length) {
      sink.Solid(bx, eave / 2, bz, bayW / 2, eave / 2, 0.12, "door", ry);
    } else {
      SolidWithOpenings(sink, {
        x: bx, z: bz, ry, length: bayW, y0: 0, y1: eave, thickness: 0.24, tag: "door",
        openings: gone.map((p) => ({
          c: -(bayW - 0.3) / 2 + (p + 0.5) * panelW, w: panelW, y0: 0, y1: eave,
        })),
      });
    }
  }

  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY: eave, ridgeY: eave + depth * 0.5 * PITCH, ry,
    seed: `${seed}:roof`, ruined: collapsed, burnt, rafters: true,
  });

  // 幌子：檐下挑一根杆，杆头一块净几何木牌（不写字）。一间一根 ——
  // 一条街上高低错落的一排幌子，比一间铺子挂两根有用得多。
  if (sign && !collapsed) {
    const lx = (rnd() - 0.5) * width * 0.5;
    const [hx, hz] = RF(lx, depth / 2 + 0.34);
    sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.08, 0.08, 1.0, TILE_METERS.wood, `${seed}:pole`),
      { x: hx, y: eave - 0.34, z: hz, ry }));
    const [sx2, sz2] = RF(lx, depth / 2 + 0.78);
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(0.42, 0.95, 0.05, TILE_METERS.wood, `${seed}:sign`),
      { x: sx2, y: eave - 0.92, z: sz2, ry }));
  }
}

function BuildShopRow(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const rnd = Mulberry32(HashString(`${seed}:shop`));
  const w = o.w, d = o.d;                          // w 沿街、d 垂直于街
  const F = Frame(x, z, ry);
  const mat = burnt ? "BrickWallSooty" : "BrickWall";
  const mir = MirrorOf(seed);
  const rowD = Math.min(6.0, d - 2.0);             // 进深 6 m：一间铺面 + 后柜
  const rowW = Math.min(w - 1.4, 22);
  const collapsed = damage > 0.66;

  // ---- 连排：一格不是一间大铺子，而是 2—3 间门脸相接的铺面（D7）----
  //
  // 改前一格是**一整间** rowW 宽的铺子：一条 22 m 长的檐口、一条通到底的脊、
  // 一排均分的开间。县城的商业街不是这样 —— 它是「三间门面的杂货铺挨着
  // 两间门面的粮行挨着一间药铺」，每家自己的台明、自己的檐口高度、
  // 自己的山墙、自己的幌子。这一节把那条长檐口打断成 2—3 段。
  //
  // 前檐线**必须齐**（门脸相接，街面才是一条直的立面），参差只发生在
  // 檐口高度、进深与台明高度上 —— 那是各家先后翻盖出来的高低。
  const units = rowW >= 15.5 && ((HashString(`${seed}:units`) >>> 0) % 10) < 6 ? 3 : 2;
  const frontZ = d / 2 - 0.5;                      // 各间共用的前檐线
  const spans = [];
  let acc = 0;
  for (let u = 0; u < units; u += 1) {
    // 各家门面宽不等：0.8—1.25 倍均分（分家、买卖、翻盖出来的参差）
    const bias = 0.8 + ((HashString(`${seed}:span${u}`) >>> 0) % 100) / 100 * 0.45;
    spans.push(bias); acc += bias;
  }
  const openUnit = (HashString(`${seed}:openunit`) >>> 0) % units;
  let cursor = -rowW / 2;
  let maxDepth = 0;
  for (let u = 0; u < units; u += 1) {
    const uw = rowW * spans[u] / acc;
    const unitW = uw - 0.34;                       // 让出中缝：两家的硬山山墙在那里贴到一起
    const unitD = Math.max(4.2, rowD - ((HashString(`${seed}:ud${u}`) >>> 0) % 100) / 100 * 0.9);
    const eave = 2.62 + ((HashString(`${seed}:ue${u}`) >>> 0) % 100) / 100 * 0.34;
    const podiumH = 0.22 + ((HashString(`${seed}:up${u}`) >>> 0) % 100) / 100 * 0.12;
    const [ux, uz] = F(cursor + uw / 2, frontZ - unitD / 2);
    const bays = Math.max(2, Math.round(unitW / 3.3));
    ShopUnit(sink, {
      x: ux, z: uz, ry, width: unitW, depth: unitD, eave, podiumH, mat, burnt,
      seed: `${seed}:u${u}`, damage: Clamp(damage + (u === 1 ? rnd() * 0.14 : 0), 0, 1),
      openBay: u === openUnit ? (HashString(`${seed}:openbay`) >>> 0) % bays : -1,
    });
    maxDepth = Math.max(maxDepth, unitD);
    cursor += uw;
  }

  // 枪眼掏在**整条连排两端的山墙**上，不在临街立面 —— 铺面临街那一面是木排
  // 门板，掏不了枪眼。「家家临街墙上有新掏的枪眼」是滕县巷战的第一视觉符号，
  // 换了原型也不许丢；调用方对 ShopRow 会跳过通用的 AddStreetLoopholes。
  if (damage < 0.8) {
    for (const s of [-1, 1]) {
      const [lpx, lpz] = F(s * (rowW / 2 + 0.16), frontZ - maxDepth / 2);
      AddLoopholes(sink, {
        x: lpx, z: lpz, ry: ry + s * Math.PI / 2, ys: [1.08, 1.45], count: 2,
        spread: maxDepth * 0.5, seed: `${seed}:lp${s}`, wallFace: 0.24,
      });
    }
  }
  // 檐下踩实的一条地：铺面门前是全城被踩得最实的地方
  if (!collapsed) {
    const [ax, az] = F(0, d / 2 - 0.2);
    AddYardWear(sink, { x: ax, z: az, ry, seed: `${seed}:tread`, radius: rowW * 0.42 });
  }

  // 后院：一圈矮墙 + 一间库房。铺子的货在后院，不在店里。
  const yardD = d - rowD - 1.4;
  if (yardD > 5.0) {
    const [yx, yz] = F(0, d / 2 - 0.5 - rowD - yardD / 2);
    WallRing(sink, {
      x: yx, z: yz, ry, w: rowW, d: yardD, seed: `${seed}:yard`, damage,
      material: burnt ? "BrickWallSooty" : "Adobe", height: 1.95, thickness: 0.38,
      plinth: null, cope: false, tag: "villageCourtyard",
      gate: { offset: mir * rowW * 0.3, openW: 1.9 },
    });
    const storeW = Math.min(rowW * 0.5, 8.4);
    const [stx, stz] = F(-mir * rowW * 0.16, d / 2 - 0.5 - rowD - yardD + 0.6 + 2.1);
    AdobeHouse(sink, {
      x: stx, z: stz, ry, width: storeW, depth: 4.2, eaveY: 2.35,
      seed: `${seed}:store`, damage, burnt, facing: 1,
    });
    const [px2, pz2] = F(mir * rowW * 0.26, d / 2 - 0.5 - rowD - yardD * 0.5);
    let props = AddStalkStack(sink, { x: px2, z: pz2, ry, seed: `${seed}:stack`, scale: 0.85 });
    const [qx, qz] = F(0, d / 2 - 0.5 - rowD - yardD * 0.55);
    props += AddYardWear(sink, { x: qx, z: qz, ry, seed: `${seed}:yardwear`, radius: 2.8 });
    return props;
  }
  return 0;
}

const DETAIL_BUILDERS = {
  OneEntry: BuildOneEntry,
  TwoEntry: BuildTwoEntry,
  AdobeYard: BuildAdobeYard,
  LCourtyard: BuildLCourtyard,
  WellYard: BuildWellYard,
  ShopRow: BuildShopRow,
};

/**
 * 近景一格。
 *
 * 院内那棵树是**这一轮反重复最管用的一件**：从空中看，二百个院子的屋脊
 * 再怎么换原型也还是一片瓦；一棵探出院墙的枯枝立刻把网格打散。
 * 三月的鲁南树是**无叶**的（AddTree 本来就是枯枝树），不是绿化带。
 * 位置取「大门那一侧的院角」——倒座、厢房、菜畦都不在那儿。
 *
 * @param {object} spec x,z,ry,w,d,seed,damage,burnt,kind
 * @returns {number} 生成的家什件数（喂 stats.householdProps）
 */
export function BuildCityBlockDetail(sink, spec) {
  // 两户的一格走 BuildDuplex；`kind` 仍然管材质味道（土坯 / 青砖）。
  const build = spec.duplex ? BuildDuplex : (DETAIL_BUILDERS[spec.kind] || BuildOneEntry);
  let props = build(sink, spec) || 0;
  props += YardTree(sink, spec, spec.duplex ? 30 : 42);
  return props;
}

/**
 * 院里那棵树。detail 与 mid 两档共用同一个判定与同一个位置 ——
 * 走近的过程里树不许换地方，也不许凭空长出来。
 * @returns {number} 0 或 1
 */
function YardTree(sink, { x, z, ry, w, d, seed, kind, duplex }, chance, near = true, baseY = 0) {
  if (kind === "ShopRow" || w <= 13 || d <= 11) return 0;
  if (((HashString(`${seed}:yardTree`) >>> 0) % 100) >= chance) return 0;
  const mir = MirrorOf(seed);
  // 两户的一格：东南角那块地已经被第二户的门与灶棚占了，树要另找地方 ——
  // 东西对分退到另一侧的院角；南北对分**必须离开夹道**（第一版把树种在
  // 2.8 m 的夹道正中，连人带碰撞盒把北户唯一的通路堵死了）。
  const [tx, tz] = duplex === "ns"
    ? Frame(x, z, ry)(mir * (w / 2 - 7.0), d / 2 - 3.0)
    : duplex
      ? Frame(x, z, ry)(-mir * (w / 2 - 2.6), d / 2 - 5.2)
      : Frame(x, z, ry)(mir * (w / 2 - 2.5), d / 2 - 2.7);
  const height = 4.6 + ((HashString(`${seed}:th`) >>> 0) % 100) / 100 * 1.8;
  if (near) AddTree(sink, { x: tx, z: tz, seed: `${seed}:tree`, material: "Willow", height });
  else SparseTree(sink, { x: tx, z: tz, seed: `${seed}:tree`, height, baseY });
  return 1;
}

/**
 * 中景档的枯树：主干 + 四根大枝 + 四根梢，**约 140 三角**。
 *
 * `AddTree` 一棵 1225 三角 —— 那是给近景准备的枝网，
 * 150 m 外一根椽子都看不清的距离上照搬它，一关就能多出两万三角
 * （实测一·北沙河那一关直接顶穿 +15% 红线）。这一档只要「一团探出墙头的
 * 深色枝杈」，四根大枝就够。三月无叶，所以没有树冠、只有枝。
 */
function SparseTree(sink, { x, z, seed, height = 5.2, baseY = 0 }) {
  const rnd = Mulberry32(HashString(`${seed}:sparse`));
  const r = height * 0.035;
  const trunk = new THREE.CylinderGeometry(r * 0.45, r, height * 0.62, 6);
  sink.Add("Willow", PlaceGeometry(trunk,
    { x, y: baseY + height * 0.31, z, rz: (rnd() - 0.5) * 0.10 }));
  const spin = rnd() * Math.PI * 2;
  for (let i = 0; i < 4; i += 1) {
    const a = spin + i * Math.PI / 2 + (rnd() - 0.5) * 0.5;
    const len = height * (0.34 + rnd() * 0.14);
    const limb = new THREE.CylinderGeometry(r * 0.16, r * 0.5, len, 4);
    const tilt = 0.62 + rnd() * 0.3;
    sink.Add("Willow", PlaceGeometry(limb, {
      x: x + Math.cos(a) * Math.sin(tilt) * len * 0.5,
      y: baseY + height * 0.62 + Math.cos(tilt) * len * 0.5,
      z: z + Math.sin(a) * Math.sin(tilt) * len * 0.5,
      ry: -a, rz: tilt,
    }));
  }
  sink.Solid(x, baseY + height * 0.35, z, r * 2.2, height * 0.35, r * 2.2, "prop");
}

// ---------------------------------------------------------------------------
// 中景档（mid）：一圈不切片的院墙 + 一到两座体量
//
// 原来这一档全城只有一种剖面（正房居中、脊永远东西向），俯瞰是一片同向的瓦楞。
// 这里按 kind 给三种脊线：单脊（东西）/ 双脊（倒座 + 正房）/ L（东西脊 + 南北脊），
// 外加土墙院那一档矮而无压顶的院墙。
// ---------------------------------------------------------------------------

const MID_PROFILE = {
  OneEntry: "single",
  TwoEntry: "double",
  AdobeYard: "adobe",
  LCourtyard: "ell",
  WellYard: "single",
  ShopRow: "row",
};

function MidBody(sink, {
  x, z, ry, width, depth, eave, seed, burnt, damage, baseY, rafters = false,
  chimney = false,
}) {
  const mat = burnt ? "BrickWallSooty" : "HouseBrick";
  sink.Add(mat, PlaceGeometry(
    MakeBox(width, eave, depth, TILE_METERS.brick, `${seed}:body`, BRICK_UV_GRID),
    { x, y: baseY + eave / 2, z, ry }));
  sink.Solid(x, baseY + eave / 2, z, width / 2, eave / 2, depth / 2, "wall", ry);
  const ruined = damage > 0.72;
  AddHardMountainRoof(sink, {
    x, z, width, depth, ry, eaveY: baseY + eave, ridgeY: baseY + eave + depth * 0.5 * PITCH,
    seed: `${seed}:roof`, ruined, burnt, rafters,
  });
  // AddHardMountainRoof 与 RoofSlopeLayout 是同一条剖面公式（脊高 = 檐 + 半进深×tan），
  // 所以烟囱按后者算落点不会浮在瓦面上方。
  if (chimney && !ruined) {
    AddRoofChimney(sink, {
      x, z, ry, depth, seed: `${seed}:roof`, mat, tile: TILE_METERS.brick,
      grid: BRICK_UV_GRID, overhang: 0.45,
      roof: RoofSlopeLayout(width, depth, baseY + eave, PITCH_RAD, 0.45),
      tileMat: burnt ? "BrickWallSooty" : "RoofTile",
    });
  }
}

/**
 * 中景一格。签名与原 AddSimpleCompound 一致（cell = {x,z,w,d,seed}）。
 */
export function BuildCityBlockMid(sink, cell, {
  damage = 0, burnt = false, baseY = 0, kind = "OneEntry", ry = 0, duplex = null,
} = {}) {
  const { x, z, w, d, seed } = cell;
  const profile = MID_PROFILE[kind] || "single";
  const adobe = profile === "adobe";
  const mat = burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "HouseBrick");
  const h = adobe ? 1.85 : 2.0 + ((HashString(seed) % 7) / 7) * 0.28;
  const mir = MirrorOf(seed);
  const F = Frame(x, z, ry);

  // 院墙一圈（不切片：中景不值得一段一段地做残墙）。
  // 门口与远景档共用同一件 SimpleYardWall：原来中景这一圈是**闭合的方框**，
  // 于是走近的过程是「远处有门 → 中景门没了 → 走到跟前门又回来」。
  const gateAt = mir * w * 0.26;
  if (profile !== "row") {
    SimpleYardWall(sink, { x, z, ry, w, d, h, baseY, seed, adobe, burnt, gateAt });
  }

  if (profile === "row") {
    // 铺面连排：沿街 2—3 段**参差**的浅进深脊，没有院墙 —— 俯瞰上是一条
    // 高低错开的房带。detail 档已经把长檐口打断成 2—3 间，中景不跟着断的话，
    // 从城墙上看是一条整的长脊、走近变三间，那就是 LOD 换形。
    const rowD = 6.0, rowW = Math.min(w - 1.2, 22);
    const units = rowW >= 15.5 && ((HashString(`${seed}:units`) >>> 0) % 10) < 6 ? 3 : 2;
    const spans = [];
    let acc = 0;
    for (let u = 0; u < units; u += 1) {
      const bias = 0.8 + ((HashString(`${seed}:span${u}`) >>> 0) % 100) / 100 * 0.45;
      spans.push(bias); acc += bias;
    }
    let cursor = -rowW / 2;
    for (let u = 0; u < units; u += 1) {
      const uw = rowW * spans[u] / acc;
      const unitD = Math.max(4.2, rowD - ((HashString(`${seed}:ud${u}`) >>> 0) % 100) / 100 * 0.9);
      const eave = 2.62 + ((HashString(`${seed}:ue${u}`) >>> 0) % 100) / 100 * 0.34;
      const [ux, uz] = F(cursor + uw / 2, d / 2 - 0.5 - unitD / 2);
      // 椽子与烟囱都只给临街的头一间：远景档按同一个 `${seed}:u${u}` 挑烟囱，
      // 两档要是各挑各的间，走近的过程就是「烟囱换了一间」。
      MidBody(sink, { x: ux, z: uz, ry, width: uw - 0.34, depth: unitD, eave,
        rafters: u === 0, seed: `${seed}:u${u}`, burnt, damage, baseY, chimney: u === 0 });
      cursor += uw;
    }
    const [yx, yz] = F(0, -d / 2 + 3.2);
    MidBody(sink, { x: yx, z: yz, ry, width: rowW * 0.5, depth: 4.0, eave: 2.3,
      seed: `${seed}:store`, burnt, damage, baseY });
    return;
  }
  // 这一档最值钱的一笔就是院里那棵树：150 m 外没人数得清椽子，
  // 但一片瓦楞里探出来的枯枝一眼就把网格打散（detail 档同一判定、同一位置）。
  // 影壁与麦秸垛同理，且与远景档同一处落点。院里那棵树的落点由 duplex 决定
  //（YardLife 内部转交 YardTree）：两户的一格里，东南角那块地已经被第二户占了。
  YardLife(sink, { x, z, ry, w, d, seed, kind, baseY, gateAt, damage, burnt, duplex });

  // 一格两户：中景必须同步出两条脊，否则从城墙上俯瞰是一户、走近变两户 ——
  // 那正是「房子在眼前变形」。这一档只交代脊线，门洞留给 detail 档。
  if (duplex === "ew") {
    const split = ((HashString(`${seed}:split`) >>> 0) % 100 - 50) / 100 * w * 0.12;
    const houseD = Math.min(4.8, d * 0.30);
    const hz = -d / 2 + 0.65 + houseD / 2;
    const eave = adobe ? 2.38 : 2.52;
    for (const s of [-1, 1]) {
      const edge = split + s * 0.62;
      const span = s < 0 ? (edge - (-w / 2 + 0.55)) : ((w / 2 - 0.55) - edge);
      if (span < 5.2) continue;
      const hw = Math.min(span - 0.6, 10.6);
      const [bx, bz] = F(mir * (edge + s * hw / 2), hz);
      MidBody(sink, { x: bx, z: bz, ry, width: hw, depth: houseD, rafters: s < 0,
        eave: eave + (s > 0 ? 0.12 : 0), seed: `${seed}:h${s}`, burnt, damage, baseY,
        chimney: s < 0 });
    }
    // 共山墙：中缝里那道高过檐口的墙，从空中把两条脊切成两段
    const [fx, fz] = F(mir * split, -d / 2 + (houseD + 0.55) / 2);
    sink.Add(mat, PlaceGeometry(
      MakeBox(0.4, eave + 0.95, houseD + 0.55, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
        `${seed}:fin`, adobe ? null : BRICK_UV_GRID),
      { x: fx, y: baseY + (eave + 0.95) / 2, z: fz, ry }));
    sink.Solid(fx, baseY + (eave + 0.95) / 2, fz, 0.2, (eave + 0.95) / 2, (houseD + 0.55) / 2, "wall", ry);
    const [mx2, mz2] = F(mir * split, -d / 2 + houseD + 0.55 + (d - houseD - 0.55) / 2);
    sink.Add(mat, PlaceGeometry(
      MakeBox(0.34, h, d - houseD - 0.55, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
        `${seed}:midw`, adobe ? null : BRICK_UV_GRID),
      { x: mx2, y: baseY + h / 2, z: mz2, ry }));
    sink.Solid(mx2, baseY + h / 2, mz2, 0.17, h / 2, (d - houseD - 0.55) / 2,
      adobe ? "villageCourtyard" : "wall", ry);
    return;
  }
  if (duplex === "ns") {
    const zSplit = -d / 2 + Math.max(9.2, d * 0.45);
    const houseD = Math.min(4.8, d * 0.30);
    const [nx2, nz2] = F(mir * w * 0.04, -d / 2 + 0.65 + houseD / 2);
    MidBody(sink, { x: nx2, z: nz2, ry, width: Math.min(w - 2.6, 10.4), depth: houseD,
      rafters: true, eave: adobe ? 2.4 : 2.54, seed: `${seed}:north`, burnt, damage, baseY,
      chimney: true });
    const sW = Math.min(w - 4.6, 9.6);
    const [sx2, sz2] = F(mir * (w / 2 - 0.55 - sW / 2), zSplit + 0.28 + houseD / 2);
    MidBody(sink, { x: sx2, z: sz2, ry, width: sW, depth: houseD, rafters: false,
      eave: adobe ? 2.36 : 2.46, seed: `${seed}:south`, burnt, damage, baseY });
    // 中间那道隔墙（两户共用）+ 夹道墙：俯瞰上把院子切成前后两块
    const [pwx, pwz] = F(0, zSplit);
    sink.Add(mat, PlaceGeometry(
      MakeBox(w, h + 0.1, 0.36, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
        `${seed}:party`, adobe ? null : BRICK_UV_GRID),
      { x: pwx, y: baseY + (h + 0.1) / 2, z: pwz, ry }));
    sink.Solid(pwx, baseY + (h + 0.1) / 2, pwz, w / 2, (h + 0.1) / 2, 0.18,
      adobe ? "villageCourtyard" : "wall", ry);
    return;
  }

  const mainW = w * (adobe ? 0.5 : 0.6);
  const mainD = d * (profile === "double" ? 0.32 : 0.40);
  const [nx, nz] = F(mir * w * 0.04, -d / 2 + 0.6 + mainD / 2);
  // 正房这一座留椽子（中景的近端 100 m 上，檐口那条锯齿阴影还看得见），
  // 配楼一律不留 —— 那是纯浪费。
  MidBody(sink, { x: nx, z: nz, ry, width: mainW, depth: mainD, rafters: true,
    eave: adobe ? 2.4 : 2.6, seed: `${seed}:main`, burnt, damage, baseY, chimney: true });

  if (profile === "double") {
    // 倒座：南边再来一条平行的脊
    const [fx, fz] = F(-mir * w * 0.16, d / 2 - 0.5 - 3.9 / 2);
    MidBody(sink, { x: fx, z: fz, ry, width: w * 0.44, depth: 3.9, eave: 2.38,
      seed: `${seed}:front`, burnt, damage, baseY });
  } else if (profile === "ell") {
    // 东厢：一条南北脊，与正房拼成 L
    const wingLen = d * 0.46;
    const [ex, ez] = F(-mir * (w / 2 - 0.6 - 3.8 / 2), -d / 2 + 0.6 + wingLen / 2);
    MidBody(sink, { x: ex, z: ez, ry: ry + Math.PI / 2, width: wingLen, depth: 3.8,
      eave: 2.32, seed: `${seed}:wing`, burnt, damage, baseY });
  } else if (adobe) {
    // 土墙院：后院一条矮隔墙（俯瞰上把院子切成两块，与砖院的整院拉开）
    const [lx, lz] = F(0, d * 0.16);
    sink.Add(mat, PlaceGeometry(
      MakeBox(w - 1.2, 1.1, 0.34, TILE_METERS.adobe, `${seed}:low`),
      { x: lx, y: baseY + 0.55, z: lz, ry }));
  }
}

// ---------------------------------------------------------------------------
// 远景档（far）：体块剪影
//
// 这一档与中景读**同一座房子**：同一个 kind、同一圈院墙、正房在同一个位置，
// 只是省掉椽子、门窗、家什与残墙切片。它不是「另一种建筑」，是同一座的低配版。
//
// 改前不是这样，而且错得很显眼（玩家实拍的那张俯瞰图就是它）：
//   · 一格院子 = **一块 21×16 m、高 2.5 m 的实心大饼**，没有院墙、没有进深比例，
//     俯瞰是一片摊开的砖色板，跟走近之后看见的四合院不是同一座房子；
//   · 板上那两片「坡顶」按 `rx: ±0.5` 写死、位移方向又与 rx 配反 ——
//     (一) 坡朝外翘、中间那条「正脊」反倒是最低点（倒 V）；
//     (二) 倾角与进深无关：16 m 进深的院子上，两片板一头扎进地里、一头翘到
//          脊上方两米多，于是整城俯瞰是一片悬空交叉的玻璃片。
// 坡顶剖面现在统一走 Script_Geo.RoofSlopeLayout（城外村屋踩过同一个坑，
// 那边的注释记着玩家原话「楼顶做反了」；两边共用一份剖面，不会再各错一次）。
//
// 预算：一格从 ~4 个盒子涨到 ~20 个（≈300 三角）。远景档不投阴影；材质桶只多出
// VillageStraw（麦秸垛）、Willow（院里的枯枝树）与 WoodBeam（塌顶的焦梁）三个，
// 都已在城内材质表里登记。所以涨的是三角形，不是 draw call
// （实测四·城墙关 calls 1110→1167、tris 3.54M→3.68M，红线是 5000 / 600 万）。
// ---------------------------------------------------------------------------

/** 远景剖面表：与 MID_PROFILE 一一对应，两档读同一座房子。 */
const FAR_PROFILE = {
  OneEntry: "single",
  TwoEntry: "double",
  AdobeYard: "adobe",
  LCourtyard: "ell",
  WellYard: "single",
  ShopRow: "row",
};

/**
 * 远景坡顶：两片坡 + 正脊 + 每坡两条瓦垄，正房另加两端山墙与偶尔一支烟囱。
 *
 * 瓦垄那两条窄带是**俯瞰这一档最值钱的一笔**：两百米外，一片纯色的板与一片
 * 有横向分缝的瓦，是「塑料」与「小青瓦」的区别，而它只要四个盒子。
 */
export function AddFarRoof(sink, {
  x, z, ry, width, depth, eaveY, seed, burnt, mat, adobe = false,
  gable = false, chimney = false, ruined = false, pitch = PITCH_RAD,
}) {
  const F = Frame(x, z, ry);
  if (ruined) {
    // 塌顶：三根横在山墙之间的焦梁。远景不必更多，但**必须有东西** ——
    // 什么都不摆的话，打烂的院子在俯瞰上是一个没有盖的空盒子。
    for (let i = 0; i < 3; i += 1) {
      const [bx, bz] = F(-width / 2 + width * (i + 0.5) / 3, 0);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.16, 0.14, depth * 0.86, TILE_METERS.wood, `${seed}:bm${i}`),
        { x: bx, y: eaveY - 0.16, z: bz, ry, rz: (i - 1) * 0.05 }));
    }
    return;
  }
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const roof = RoofSlopeLayout(width, depth, eaveY, pitch, 0.34);
  for (const half of roof.halves) {
    const [px, pz] = F(0, half.localZ);
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(half.width, 0.15, half.depth, TILE_METERS.roof, `${seed}:s${half.side}`),
      { x: px, y: half.centerY, z: pz, ry, rx: half.rotationX }));
    for (let i = 1; i <= 2; i += 1) {
      const slabZ = half.localRidgeZ
        + (half.localEaveZ - half.localRidgeZ) * (i / 3);
      const [cx, cz] = F(0, half.localZ + slabZ * Math.cos(half.rotationX));
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(half.width, 0.05, 0.085, TILE_METERS.roof, `${seed}:c${half.side}${i}`),
        { x: cx, y: RoofSlabY(half, slabZ) + 0.10, z: cz, ry, rx: half.rotationX }));
    }
  }
  sink.Add(tileMat, PlaceGeometry(
    MakeBox(roof.ridgeLength, 0.20, 0.26, TILE_METERS.roof, `${seed}:ridge`),
    { x, y: roof.ridgeY + 0.07, z, ry }));

  const tile = adobe ? TILE_METERS.adobe : TILE_METERS.brick;
  const grid = adobe ? null : BRICK_UV_GRID;
  if (gable) {
    // 硬山两端高出坡面的山墙 —— 「硬山」二字的由来，也是俯瞰上让屋面**收边**
    // 的那一笔：没有它，两片瓦在山墙处是两条悬空的板边。三段够读出三角。
    const rise = roof.ridgeY - eaveY;
    const steps = 3;
    for (const end of [-1, 1]) {
      const parts = [];
      for (let i = 0; i < steps; i += 1) {
        const segD = depth / steps;
        const lz = -depth / 2 + segD * (i + 0.5);
        const hh = Math.max(0.12, rise * (1 - Math.abs(lz) / (depth / 2)));
        parts.push(PlaceGeometry(
          MakeBox(0.26, hh, segD * 1.04, tile, `${seed}:gb${end}${i}`, grid),
          { x: 0, y: hh / 2, z: lz }));
      }
      const [gx, gz] = F(end * (width / 2 + 0.09), 0);
      sink.Add(mat, PlaceGeometry(MergeGeometries(parts), { x: gx, y: eaveY, z: gz, ry }));
    }
  }
  if (chimney) {
    AddRoofChimney(sink, {
      x, z, ry, depth, roof, seed, mat, tileMat, tile, grid, overhang: 0.34,
    });
  }
}

/**
 * 屋面上的一支烟囱。**刻意稀疏**：三家有一支就够说明「这城里还住着人」，
 * 家家都有反而像现代小区（城外村屋那一套是同一条规矩、同一个 %3）。
 * 中景与远景共用，落点只由 seed 决定 —— 走近时烟囱不许换坡面。
 */
export function AddRoofChimney(sink, {
  x, z, ry, depth, roof, seed, mat, tileMat = "RoofTile", tile, grid, overhang = 0.45,
}) {
  if ((HashString(`${seed}:chimney`) >>> 0) % 3 !== 0) return;
  const F = Frame(x, z, ry);
  const side = (HashString(`${seed}:chimSide`) >>> 0) % 2 ? -1 : 1;
  const lz = side * depth * 0.2;
  const [px, pz] = F(((HashString(`${seed}:chimX`) >>> 0) % 11 - 5) * 0.12, lz);
  const roofY = roof.ridgeY
    - Math.abs(lz) * (roof.ridgeY - roof.outerY) / (depth / 2 + overhang);
  sink.Add(mat, PlaceGeometry(
    MakeBox(0.46, 0.74, 0.46, tile, `${seed}:chim`, grid),
    { x: px, y: roofY + 0.37, z: pz, ry }));
  sink.Add(tileMat, PlaceGeometry(
    MakeBox(0.60, 0.09, 0.60, TILE_METERS.roof, `${seed}:chimCap`),
    { x: px, y: roofY + 0.78, z: pz, ry }));
}

/** 远景一座房：墙体 + 坡顶。参数与 MidBody 同名同义，方便两档对照着改。 */
function FarBody(sink, {
  x, z, ry, width, depth, eave, baseY, seed, burnt, damage = 0,
  adobe = false, gable = false, chimney = false,
}) {
  const mat = burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "HouseBrick");
  sink.Add(mat, PlaceGeometry(
    MakeBox(width, eave, depth, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
      `${seed}:body`, adobe ? null : BRICK_UV_GRID),
    { x, y: baseY + eave / 2, z, ry }));
  sink.Solid(x, baseY + eave / 2, z, width / 2, eave / 2, depth / 2, "wall", ry);
  // 屋顶那一层的种子必须与中景的 `${seed}:roof` 一模一样：烟囱是按种子 %3 挑的，
  // 两档要是各算各的哈希，走近的过程就是「远处有烟囱，近了没有」。
  AddFarRoof(sink, {
    x, z, ry, width, depth, eaveY: baseY + eave, seed: `${seed}:roof`,
    burnt, mat, adobe, gable, chimney, ruined: damage > 0.72,
  });
}

/**
 * 院墙一圈（**中景与远景共用**）。南面（局部 +z）留一个门口 + 两根门墩。
 *
 * 这个豁口是形制，不是装饰：「门多开在东南角」在俯瞰上就是这一个缺口。
 * 没有它，二百个院子是二百个闭合的方框 —— 那正是「大量重复村庄」的观感来源。
 * 用整段盒子，不走 AddWall 的切片：远景不值得为一段院墙切二十片。
 */
function SimpleYardWall(sink, { x, z, ry, w, d, h, baseY, seed, adobe, burnt, gateAt }) {
  const mat = burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "HouseBrick");
  const tile = adobe ? TILE_METERS.adobe : TILE_METERS.brick;
  const grid = adobe ? null : BRICK_UV_GRID;
  const F = Frame(x, z, ry);
  const openW = 1.7;
  const Seg = (lx, lz, len, rot, id) => {
    if (len < 0.4) return;
    const [px, pz] = F(lx, lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(len, h, 0.42, tile, `${seed}:yw${id}`, grid),
      { x: px, y: baseY + h / 2, z: pz, ry: ry + rot }));
    sink.Solid(px, baseY + h / 2, pz, len / 2, h / 2, 0.21,
      adobe ? "villageCourtyard" : "wall", ry + rot);
  };
  Seg(0, -d / 2, w, 0, "n");
  Seg(-w / 2, 0, d, Math.PI / 2, "w");
  Seg(w / 2, 0, d, Math.PI / 2, "e");
  // 南墙分两段让出门口
  const leftLen = gateAt - openW / 2 + w / 2;
  const rightLen = w / 2 - (gateAt + openW / 2);
  Seg(-w / 2 + leftLen / 2, d / 2, leftLen, 0, "s0");
  Seg(w / 2 - rightLen / 2, d / 2, rightLen, 0, "s1");
  for (const side of [-1, 1]) {
    const [px, pz] = F(gateAt + side * (openW / 2 + 0.22), d / 2);
    sink.Add(mat, PlaceGeometry(
      MakeBox(0.44, h + 0.5, 0.52, tile, `${seed}:pier${side}`, grid),
      { x: px, y: baseY + (h + 0.5) / 2, z: pz, ry }));
  }
}

/**
 * 院里那点活气（**中景与远景共用**，同一种子同一位置 —— 走近时不许挪窝）。
 * 只留**从空中读得出来**的三样：影壁（门内那一堵短墙）、麦秸垛、院角一棵枯枝树。
 *
 * 反重复最管用的仍然是树：二百个院子的屋脊再怎么换原型也还是一片瓦，
 * 一棵探出院墙的枯枝立刻把网格打散（中景/近景是同一处位置、同一个判定）。
 */
function YardLife(sink, {
  x, z, ry, w, d, seed, kind, baseY, gateAt, damage, burnt = false, duplex = null,
  // 两户的一格里院子小一半，树也就稀一档（落点由 YardTree 按 duplex 另算）。
  treeChance = duplex ? 24 : 34,
}) {
  const F = Frame(x, z, ry);
  if (damage < 0.72) {
    // 尺寸与落点抄近景档的 ScreenWall（2.4 × 1.9，门内 2 m），走近时不挪窝。
    // 材质走 HouseBrick 而不是 ScreenWall 那边的 BrickWall：远景 sink 里没有
    // BrickWall 这个桶，为一堵影壁多开一个桶就是每个扇区多一次 draw call。
    const [sx, sz] = F(gateAt, d / 2 - 2.0);
    sink.Add(burnt ? "BrickWallSooty" : "HouseBrick", PlaceGeometry(
      MakeBox(2.4, 1.9, 0.30, TILE_METERS.brick, `${seed}:screen`, BRICK_UV_GRID),
      { x: sx, y: baseY + 0.95, z: sz, ry }));
  }
  if ((HashString(`${seed}:stack`) >>> 0) % 100 < 46) {
    const mir = MirrorOf(seed);
    const [px, pz] = F(-mir * (w / 2 - 2.4), d * 0.12);
    const r = 1.15 + ((HashString(`${seed}:stackR`) >>> 0) % 100) / 100 * 0.4;
    sink.Add("VillageStraw", PlaceGeometry(
      new THREE.CylinderGeometry(r * 0.18, r, 1.75, 5),
      { x: px, y: baseY + 0.87, z: pz, ry }));
    sink.Solid(px, baseY + 0.6, pz, r * 0.8, 0.6, r * 0.8, "villageStraw", ry);
  }
  YardTree(sink, { x, z, ry, w, d, seed, kind, duplex }, treeChance, false, baseY);
}

/** 远景一格。cell = {x,z,w,d,seed}。 */
export function BuildCityBlockFar(farSink, cell, {
  damage = 0, burnt = false, baseY = 0, kind = "OneEntry", ry = 0, duplex = null,
} = {}) {
  const { x, z, w, d, seed } = cell;
  const profile = FAR_PROFILE[kind] || "single";
  const adobe = profile === "adobe";
  const mir = MirrorOf(seed);
  const F = Frame(x, z, ry);

  if (profile === "row") {
    // 铺面连排：沿街 2—3 段**参差**的浅进深脊 + 后院库房，没有院墙 ——
    // 断法、间宽、进深、檐高全部与中景同一条公式（三档同形：从城墙上看是
    // 高低错开的一条房带，走近仍是那 2—3 间，不许 LOD 换形）。
    //
    // 与中景只差一处：**各间贴着出，不留 0.34 m 的间缝**。远景档这些体块本身
    // 就是障碍物，凭空多出来的一条贯通的缝会被导航当成通路（第一版就是这么漏的）；
    // 参差靠檐口高差、进深差与两端山墙读出来，不靠中间那道缝。
    const rowD = 6.0, rowW = Math.min(w - 1.2, 22);
    const units = rowW >= 15.5 && ((HashString(`${seed}:units`) >>> 0) % 10) < 6 ? 3 : 2;
    const spans = [];
    let acc = 0;
    for (let u = 0; u < units; u += 1) {
      const bias = 0.8 + ((HashString(`${seed}:span${u}`) >>> 0) % 100) / 100 * 0.45;
      spans.push(bias); acc += bias;
    }
    let cursor = -rowW / 2;
    for (let u = 0; u < units; u += 1) {
      const uw = rowW * spans[u] / acc;
      const unitD = Math.max(4.2, rowD - ((HashString(`${seed}:ud${u}`) >>> 0) % 100) / 100 * 0.9);
      const eave = 2.62 + ((HashString(`${seed}:ue${u}`) >>> 0) % 100) / 100 * 0.34;
      const [ux, uz] = F(cursor + uw / 2, d / 2 - 0.5 - unitD / 2);
      FarBody(farSink, { x: ux, z: uz, ry, width: uw, depth: unitD, eave,
        baseY, seed: `${seed}:u${u}`, burnt, damage, gable: true, chimney: u === 0 });
      cursor += uw;
    }
    const [yx, yz] = F(0, -d / 2 + 3.2);
    FarBody(farSink, { x: yx, z: yz, ry, width: rowW * 0.5, depth: 4.0, eave: 2.3,
      baseY, seed: `${seed}:store`, burnt, damage });
    return;
  }

  // 院墙与中景同一条高度公式：走近时墙不许长高一截。
  const h = adobe ? 1.85 : 2.0 + ((HashString(seed) % 7) / 7) * 0.28;
  // 门开在东南角（巽位）；反格的院子整个平面镜像，门就落到西南角。
  const gateAt = mir * w * 0.26;
  SimpleYardWall(farSink, { x, z, ry, w, d, h, baseY, seed, adobe, burnt, gateAt });
  YardLife(farSink, { x, z, ry, w, d, seed, kind, baseY, gateAt, damage, burnt, duplex });

  // 一格两户：远景也得是两条脊。三档同一个答案 —— 二百米外看见两户，
  // 走到跟前才不会变成一户（LOD 之间换形是这套东西最容易穿帮的地方）。
  // 正房的落点、进深、檐高与中景逐项对齐，屋面种子也同名（烟囱不许换坡面）。
  if (duplex === "ew") {
    // 东西对分：两座正房同脊并排。**两块严丝合缝地顶在中缝上，不留缝** ——
    // 远景档这些体块本身就是障碍物，凭空多出来的一条贯通南北的缝会被导航当成通路
    //（第一版给两块各留了几十厘米，每格中间就多出一条一米宽的假巷子）。
    // 两户靠 0.15 m 的檐口高差 + 中缝上背靠背的两堵山墙读出来，不靠那道缝。
    const split = ((HashString(`${seed}:split`) >>> 0) % 100 - 50) / 100 * w * 0.12;
    const houseD = Math.min(4.8, d * 0.30);
    const hz = -d / 2 + 0.65 + houseD / 2;
    const eave = adobe ? 2.38 : 2.52;
    const leftIn = -w / 2 + 0.55, rightIn = w / 2 - 0.55;
    const cut = Clamp(split, leftIn + 5.2, rightIn - 5.2);
    for (const s of [-1, 1]) {
      // 与中景同一条量法：从中缝这条边往外量，所以两档的**外侧**山墙落在同一处，
      // 差的只是中缝里那 0.62 m（中景在那儿立一道共山墙，远景直接顶死）。
      const span = s < 0 ? (cut - leftIn) : (rightIn - cut);
      if (span < 5.2) continue;
      const hw = Math.min(span, 11.2);
      const [bx, bz] = F(mir * (cut + s * hw / 2), hz);
      FarBody(farSink, { x: bx, z: bz, ry, width: hw, depth: houseD,
        eave: eave + (s > 0 ? 0.15 : 0), baseY, seed: `${seed}:h${s}`, burnt, damage,
        adobe, gable: true, chimney: s < 0 });
    }
    // 中缝那道院墙：房带以南把院子分成两家（与中景 `${seed}:midw` 同一处）
    const yardLen = d - houseD - 0.55;
    const [mx2, mz2] = F(mir * split, -d / 2 + houseD + 0.55 + yardLen / 2);
    farSink.Add(burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "HouseBrick"), PlaceGeometry(
      MakeBox(0.34, h, yardLen, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
        `${seed}:midw`, adobe ? null : BRICK_UV_GRID),
      { x: mx2, y: baseY + h / 2, z: mz2, ry }));
    farSink.Solid(mx2, baseY + h / 2, mz2, 0.17, h / 2, yardLen / 2,
      adobe ? "villageCourtyard" : "wall", ry);
    return;
  }
  if (duplex === "ns") {
    // 南北对分：北户贴北墙，南户的后墙贴着中间那道隔墙 —— 前后两块，
    // 南块矮一档（檐口 −0.08）读出是两户；两块之间是两家的院子，不是缝。
    const zSplit = -d / 2 + Math.max(9.2, d * 0.45);
    const houseD = Math.min(4.8, d * 0.30);
    const [nx2, nz2] = F(mir * w * 0.04, -d / 2 + 0.65 + houseD / 2);
    FarBody(farSink, { x: nx2, z: nz2, ry, width: Math.min(w - 2.6, 10.4), depth: houseD,
      eave: adobe ? 2.4 : 2.54, baseY, seed: `${seed}:north`, burnt, damage,
      adobe, gable: true, chimney: true });
    const sW = Math.min(w - 4.6, 9.6);
    const [sx2, sz2] = F(mir * (w / 2 - 0.55 - sW / 2), zSplit + 0.28 + houseD / 2);
    FarBody(farSink, { x: sx2, z: sz2, ry, width: sW, depth: houseD,
      eave: adobe ? 2.36 : 2.46, baseY, seed: `${seed}:south`, burnt, damage,
      adobe, gable: true });
    // 中间那道隔墙（两户共用）：俯瞰上把院子切成前后两块
    const [pwx, pwz] = F(0, zSplit);
    farSink.Add(burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "HouseBrick"), PlaceGeometry(
      MakeBox(w, h + 0.1, 0.36, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
        `${seed}:party`, adobe ? null : BRICK_UV_GRID),
      { x: pwx, y: baseY + (h + 0.1) / 2, z: pwz, ry }));
    farSink.Solid(pwx, baseY + (h + 0.1) / 2, pwz, w / 2, (h + 0.1) / 2, 0.18,
      adobe ? "villageCourtyard" : "wall", ry);
    return;
  }

  const mainW = w * (adobe ? 0.5 : 0.6);
  const mainD = d * (profile === "double" ? 0.32 : 0.40);
  const [nx, nz] = F(mir * w * 0.04, -d / 2 + 0.6 + mainD / 2);
  FarBody(farSink, { x: nx, z: nz, ry, width: mainW, depth: mainD,
    eave: adobe ? 2.4 : 2.6, baseY, seed: `${seed}:main`, burnt, damage,
    adobe, gable: true, chimney: true });

  if (profile === "double") {
    const [fx, fz] = F(-mir * w * 0.16, d / 2 - 0.5 - 3.9 / 2);
    FarBody(farSink, { x: fx, z: fz, ry, width: w * 0.44, depth: 3.9, eave: 2.38,
      baseY, seed: `${seed}:front`, burnt, damage, adobe });
  } else if (profile === "ell") {
    const wingLen = d * 0.46;
    const [ex, ez] = F(-mir * (w / 2 - 0.6 - 3.8 / 2), -d / 2 + 0.6 + wingLen / 2);
    FarBody(farSink, { x: ex, z: ez, ry: ry + Math.PI / 2, width: wingLen, depth: 3.8,
      eave: 2.32, baseY, seed: `${seed}:wing`, burnt, damage, adobe });
  } else if (adobe) {
    // 土墙院：后院一条矮隔墙（俯瞰上把院子切成两块，与砖院的整院拉开）
    const [lx, lz] = F(0, d * 0.16);
    farSink.Add(burnt ? "BrickWallSooty" : "Adobe", PlaceGeometry(
      MakeBox(w - 1.2, 1.1, 0.34, TILE_METERS.adobe, `${seed}:low`),
      { x: lx, y: baseY + 0.55, z: lz, ry }));
  }
}
