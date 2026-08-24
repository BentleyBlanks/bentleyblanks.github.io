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
} from "./Script_World.mjs";
import {
  MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import {
  AddCourtyardLife, AddYardWear, AddStalkStack, AddManureHeap,
  AddVegetableBeds, AddStoneRoller,
} from "./Script_LivedInProps.mjs";

const DEG = Math.PI / 180;
/** 硬山坡度 26°—29°：脊高 = 檐口 + 半进深 × tan(27.5°)。 */
const PITCH = Math.tan(27.5 * DEG);

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
 * 一段中间开豁口的墙。院门、二门、后院矮墙共用。
 * 豁口按**沿墙方向的局部偏移** at 定位；沿墙方向 = 本地 x 轴绕 ry+rot。
 */
function GapWall(sink, {
  x, z, ry, length, height, thickness, material, seed, ruin = 0,
  openW = 1.5, at = 0, plinth = null, cope = true, tag = "wall",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const segments = [
    { c: (-length / 2 + (at - openW / 2)) / 2, len: at - openW / 2 - (-length / 2) },
    { c: ((at + openW / 2) + length / 2) / 2, len: length / 2 - (at + openW / 2) },
  ];
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
 * 门楼由调用方决定（砖院上门楼，土墙院只有木门框）。
 */
function WallRing(sink, {
  x, z, ry, w, d, seed, damage = 0, material = "BrickWall", height = 2.1,
  thickness = 0.35, plinth = null, cope = true, gate = null, tag = "wall",
}) {
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
    if (gate && s.id === "s") {
      GapWall(sink, {
        x: wx, z: wz, ry, length: s.len, height, thickness, material,
        seed: `${seed}:ring${s.id}`, ruin: damage * 0.7,
        openW: gate.openW, at: gate.offset, plinth, cope, tag,
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
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(1.2, Math.max(0.12, eaveY - doorH - 0.18), 0.38, TILE_METERS.adobe, `${seed}:above`),
      { x: ox, y: doorH + 0.18 + Math.max(0.12, eaveY - doorH - 0.18) / 2, z: oz, ry }));
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
function BuildShopRow(sink, o) {
  const { x, z, ry, seed, damage, burnt } = o;
  const rnd = Mulberry32(HashString(`${seed}:shop`));
  const w = o.w, d = o.d;                          // w 沿街、d 垂直于街
  const F = Frame(x, z, ry);
  const mat = burnt ? "BrickWallSooty" : "BrickWall";
  const mir = MirrorOf(seed);
  const rowD = Math.min(6.0, d - 2.0);             // 进深 6 m：一间铺面 + 后柜
  const rowW = Math.min(w - 1.4, 22);
  const bays = Math.max(3, Math.round(rowW / 3.4));
  const bayW = rowW / bays;
  const eave = 2.72 + rnd() * 0.16;                // 铺面比住家高一档（挂幌子）
  const ridge = eave + rowD * 0.5 * PITCH;
  const [rx, rz] = F(0, d / 2 - 0.5 - rowD / 2);
  const RF = Frame(rx, rz, ry);
  const collapsed = damage > 0.66;

  // 台明：铺面地坪高出街面一档，散水与门槛都从这里起
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(rowW + 0.7, 0.28, rowD + 0.5, TILE_METERS.stone, `${seed}:podium`),
    { x: rx, y: 0.14, z: rz, ry }));

  // 后檐墙 + 两山墙（对外不开窗）
  const closed = [
    { lx: 0, lz: -rowD / 2, len: rowW, rot: 0 },
    { lx: -rowW / 2, lz: 0, len: rowD, rot: Math.PI / 2 },
    { lx: rowW / 2, lz: 0, len: rowD, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < closed.length; i += 1) {
    const c = closed[i];
    const [cx, cz] = RF(c.lx, c.lz);
    AddWall(sink, mat, {
      x: cx, z: cz, length: c.len, height: eave, thickness: 0.36, ry: ry + c.rot,
      ruin: damage * 0.85, seed: `${seed}:cw${i}`, plinth: "CrossStone",
    });
  }

  // 临街立面：柱 + 排门板。一间卸了板（能走进去，不摆碰撞）。
  const openBay = HashString(`${seed}:openbay`) % bays;
  for (let b = 0; b <= bays; b += 1) {
    const lx = -rowW / 2 + b * bayW;
    const [px, pz] = RF(lx, rowD / 2 - 0.12);
    sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.24, eave, 0.24, TILE_METERS.wood, `${seed}:col${b}`),
      { x: px, y: eave / 2, z: pz, ry }));
    sink.Solid(px, eave / 2, pz, 0.13, eave / 2, 0.13, "villagePost", ry);
  }
  const [fx, fz] = RF(0, rowD / 2 - 0.12);
  sink.Add("WoodBeam", PlaceGeometry(MakeBox(rowW + 0.3, 0.26, 0.3, TILE_METERS.wood, `${seed}:archi`),
    { x: fx, y: eave - 0.13, z: fz, ry }));
  for (let b = 0; b < bays; b += 1) {
    const lx = -rowW / 2 + (b + 0.5) * bayW;
    const [bx, bz] = RF(lx, rowD / 2 - 0.12);
    if (b === openBay && !collapsed) {
      // 卸了板的那一间：只剩门槛石与斜靠柱子的两扇板
      sink.Add("CrossStone", PlaceGeometry(
        MakeBox(bayW - 0.4, 0.16, 0.5, TILE_METERS.stone, `${seed}:sill${b}`),
        { x: bx, y: 0.30, z: bz, ry }));
      for (const s of [-1, 1]) {
        const ox = lx + s * (bayW / 2 - 0.36);
        const [dx, dz] = RF(ox, rowD / 2 - 0.34);
        sink.Add("WoodDoor", PlaceGeometry(
          MakeBox(0.44, eave - 0.5, 0.06, TILE_METERS.wood, `${seed}:leaned${b}${s}`),
          { x: dx, y: 0.28 + (eave - 0.5) / 2, z: dz, ry, rx: s * 0.12 }));
      }
      continue;
    }
    // 上了板的间：一排竖门板 + 上槛
    const panels = Math.max(4, Math.round((bayW - 0.3) / 0.42));
    const panelW = (bayW - 0.3) / panels;
    for (let p = 0; p < panels; p += 1) {
      if (damage > 0.45 && ((p + b) % 4 === 0)) continue;       // 打烂的铺子缺几块板
      const ox = lx - (bayW - 0.3) / 2 + (p + 0.5) * panelW;
      const [dx, dz] = RF(ox, rowD / 2 - 0.14);
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(panelW * 0.94, eave - 0.34, 0.07, TILE_METERS.wood, `${seed}:panel${b}${p}`),
        { x: dx, y: 0.28 + (eave - 0.34) / 2, z: dz, ry }));
    }
    sink.Solid(bx, eave / 2, bz, bayW / 2, eave / 2, 0.12, "door", ry);
  }

  AddHardMountainRoof(sink, {
    x: rx, z: rz, width: rowW, depth: rowD, eaveY: eave, ridgeY: ridge, ry,
    seed: `${seed}:roof`, ruined: collapsed, burnt, rafters: true,
  });

  // 枪眼掏在**两侧山墙**上，不在临街立面 —— 铺面临街那一面是木排门板，
  // 掏不了枪眼。「家家临街墙上有新掏的枪眼」是滕县巷战的第一视觉符号，
  // 换了原型也不许丢；调用方对 ShopRow 会跳过通用的 AddStreetLoopholes。
  if (damage < 0.8) {
    for (const s of [-1, 1]) {
      const [lpx, lpz] = RF(s * (rowW / 2 + 0.16), 0);
      AddLoopholes(sink, {
        x: lpx, z: lpz, ry: ry + s * Math.PI / 2, ys: [1.08, 1.45], count: 2,
        spread: rowD * 0.5, seed: `${seed}:lp${s}`, wallFace: 0.24,
      });
    }
  }

  // 幌子：檐下挑一根杆，杆头一块净几何木牌（不写字）
  if (!collapsed) {
    for (let k = 0; k < 2; k += 1) {
      const lx = (k === 0 ? -1 : 1) * rowW * (0.20 + rnd() * 0.1);
      const [hx, hz] = RF(lx, rowD / 2 + 0.34);
      sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.08, 0.08, 1.0, TILE_METERS.wood, `${seed}:pole${k}`),
        { x: hx, y: eave - 0.34, z: hz, ry }));
      const [sx2, sz2] = RF(lx, rowD / 2 + 0.78);
      sink.Add("WoodDoor", PlaceGeometry(MakeBox(0.42, 0.95, 0.05, TILE_METERS.wood, `${seed}:sign${k}`),
        { x: sx2, y: eave - 0.92, z: sz2, ry }));
    }
    // 檐下踩实的一条地：铺面门前是全城被踩得最实的地方
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
  const build = DETAIL_BUILDERS[spec.kind] || BuildOneEntry;
  let props = build(sink, spec) || 0;
  props += YardTree(sink, spec, 42);
  return props;
}

/**
 * 院里那棵树。detail 与 mid 两档共用同一个判定与同一个位置 ——
 * 走近的过程里树不许换地方，也不许凭空长出来。
 * @returns {number} 0 或 1
 */
function YardTree(sink, { x, z, ry, w, d, seed, kind }, chance, near = true, baseY = 0) {
  if (kind === "ShopRow" || w <= 13 || d <= 11) return 0;
  if (((HashString(`${seed}:yardTree`) >>> 0) % 100) >= chance) return 0;
  const mir = MirrorOf(seed);
  const [tx, tz] = Frame(x, z, ry)(mir * (w / 2 - 2.5), d / 2 - 2.7);
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
}) {
  const mat = burnt ? "BrickWallSooty" : "HouseBrick";
  sink.Add(mat, PlaceGeometry(
    MakeBox(width, eave, depth, TILE_METERS.brick, `${seed}:body`, BRICK_UV_GRID),
    { x, y: baseY + eave / 2, z, ry }));
  sink.Solid(x, baseY + eave / 2, z, width / 2, eave / 2, depth / 2, "wall", ry);
  AddHardMountainRoof(sink, {
    x, z, width, depth, ry, eaveY: baseY + eave, ridgeY: baseY + eave + depth * 0.5 * PITCH,
    seed: `${seed}:roof`, ruined: damage > 0.72, burnt, rafters,
  });
}

/**
 * 中景一格。签名与原 AddSimpleCompound 一致（cell = {x,z,w,d,seed}）。
 */
export function BuildCityBlockMid(sink, cell, {
  damage = 0, burnt = false, baseY = 0, kind = "OneEntry", ry = 0,
} = {}) {
  const { x, z, w, d, seed } = cell;
  const profile = MID_PROFILE[kind] || "single";
  const adobe = profile === "adobe";
  const mat = burnt ? "BrickWallSooty" : (adobe ? "Adobe" : "HouseBrick");
  const h = adobe ? 1.85 : 2.0 + ((HashString(seed) % 7) / 7) * 0.28;
  const mir = MirrorOf(seed);
  const F = Frame(x, z, ry);

  // 院墙一圈（不切片：中景不值得一段一段地做残墙）
  if (profile !== "row") {
    for (const [ox, oz, len, rot] of [
      [0, -d / 2, w, 0], [0, d / 2, w, 0],
      [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2],
    ]) {
      const [px, pz] = F(ox, oz);
      sink.Add(mat, PlaceGeometry(
        MakeBox(len, h, 0.42, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
          `${seed}:sw${ox}${oz}`, adobe ? null : BRICK_UV_GRID),
        { x: px, y: baseY + h / 2, z: pz, ry: ry + rot }));
      sink.Solid(px, baseY + h / 2, pz, len / 2, h / 2, 0.25,
        adobe ? "villageCourtyard" : "wall", ry + rot);
    }
  }

  if (profile === "row") {
    // 铺面排屋：一条沿街的浅进深长脊，没有院墙 —— 俯瞰上是一条连着的房带
    const rowD = 6.0, rowW = Math.min(w - 1.2, 22);
    const [rx, rz] = F(0, d / 2 - 0.5 - rowD / 2);
    MidBody(sink, { x: rx, z: rz, ry, width: rowW, depth: rowD, eave: 2.72, rafters: true,
      seed: `${seed}:row`, burnt, damage, baseY });
    const [yx, yz] = F(0, -d / 2 + 3.2);
    MidBody(sink, { x: yx, z: yz, ry, width: rowW * 0.5, depth: 4.0, eave: 2.3,
      seed: `${seed}:store`, burnt, damage, baseY });
    return;
  }
  // 中景这一档最值钱的一笔就是这棵树：150 m 外没人数得清椽子，
  // 但一片瓦楞里探出来的枯枝一眼就把网格打散（detail 档同一判定、同一位置）。
  YardTree(sink, { x, z, ry, w, d, seed, kind }, 34, false, baseY);

  const mainW = w * (adobe ? 0.5 : 0.6);
  const mainD = d * (profile === "double" ? 0.32 : 0.40);
  const [nx, nz] = F(mir * w * 0.04, -d / 2 + 0.6 + mainD / 2);
  // 正房这一座留椽子（中景的近端 100 m 上，檐口那条锯齿阴影还看得见），
  // 配楼一律不留 —— 那是纯浪费。
  MidBody(sink, { x: nx, z: nz, ry, width: mainW, depth: mainD, rafters: true,
    eave: adobe ? 2.4 : 2.6, seed: `${seed}:main`, burnt, damage, baseY });

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
// 够读出「灰砖小院的海」就行，但**海不能是同一块砖复印二百遍**：
// 按 kind 给四种平面 —— 单块 / 双平行 / L / 长排，脊向也跟着变。
// 每格 4—7 个盒子，整体开销与原来的 4 个盒子同一量级。
// ---------------------------------------------------------------------------

function FarBlock(farSink, { x, z, ry, w, d, h, y, seed, burnt, roof = true, mat = "HouseBrick" }) {
  const adobe = mat === "Adobe";
  farSink.Add(burnt ? "BrickWallSooty" : mat, PlaceGeometry(
    MakeBox(w, h, d, adobe ? TILE_METERS.adobe : TILE_METERS.brick,
      `${seed}:b`, adobe ? null : BRICK_UV_GRID),
    { x, y: y + h / 2, z, ry }));
  farSink.Solid(x, y + h / 2, z, w / 2, h / 2, d / 2, "wall", ry);
  if (!roof) return;
  for (const s of [-1, 1]) {
    farSink.Add("RoofTile", PlaceGeometry(
      MakeBox(w * 1.08, 0.14, d * 0.6, TILE_METERS.roof, `${seed}:r${s}`),
      { x: x + Math.sin(ry) * s * d * 0.24, y: y + h + 0.34,
        z: z + Math.cos(ry) * s * d * 0.24, ry, rx: -s * 0.5 }));
  }
  farSink.Add("RoofTile", PlaceGeometry(
    MakeBox(w * 1.08, 0.18, 0.32, TILE_METERS.roof, `${seed}:rdg`),
    { x, y: y + h + 0.72, z, ry }));
}

const FAR_PROFILE = {
  OneEntry: "single",
  TwoEntry: "double",
  AdobeYard: "flat",
  LCourtyard: "ell",
  WellYard: "single",
  ShopRow: "row",
};

/** 远景一格。cell = {x,z,w,d,seed}。 */
export function BuildCityBlockFar(farSink, cell, {
  damage = 0, burnt = false, baseY = 0, kind = "OneEntry", ry = 0,
} = {}) {
  const { x, z, w, d, seed } = cell;
  const rnd = Mulberry32(HashString(`${seed}:sil`));
  const profile = FAR_PROFILE[kind] || "single";
  const mir = MirrorOf(seed);
  const F = Frame(x, z, ry);
  const roof = damage < 0.75;
  const h = 2.5 + rnd() * 0.9;

  // 一格的**体量**要与改前那一块 w*0.86 × d*0.82 的实心块大致相当：
  // 远景这一档读的是「一片连着的灰砖小院」，块与块之间空出大片地皮就成了村落。
  // 所以多体量的剖面都按「合起来仍填满这一格」配，只是脊线走向不同。
  if (profile === "row") {
    const [rx, rz] = F(0, d * 0.22);
    FarBlock(farSink, { x: rx, z: rz, ry, w: w * 0.92, d: d * 0.44, h: h + 0.3,
      y: baseY, seed: `${seed}:row`, burnt, roof });
    const [sx, sz] = F(0, -d * 0.26);
    FarBlock(farSink, { x: sx, z: sz, ry, w: w * 0.6, d: d * 0.32, h: h - 0.35,
      y: baseY, seed: `${seed}:store`, burnt, roof });
    return;
  }
  if (profile === "flat") {
    // 土墙院：矮一档、进深浅一档 —— 远处一片发黄发暗的方块，与青砖院拉开
    const [mx, mz] = F(0, -d * 0.04);
    FarBlock(farSink, { x: mx, z: mz, ry, w: w * 0.8, d: d * 0.7, h: h - 0.5,
      y: baseY, seed: `${seed}:m`, burnt, roof, mat: "Adobe" });
    return;
  }
  if (profile === "double") {
    const [nx, nz] = F(0, -d * 0.22);
    FarBlock(farSink, { x: nx, z: nz, ry, w: w * 0.86, d: d * 0.38, h,
      y: baseY, seed: `${seed}:n`, burnt, roof });
    const [fx, fz] = F(-mir * w * 0.08, d * 0.26);
    FarBlock(farSink, { x: fx, z: fz, ry, w: w * 0.62, d: d * 0.3, h: h - 0.4,
      y: baseY, seed: `${seed}:s`, burnt, roof });
    return;
  }
  if (profile === "ell") {
    const [nx, nz] = F(mir * w * 0.2, -d * 0.02);
    FarBlock(farSink, { x: nx, z: nz, ry, w: w * 0.5, d: d * 0.78, h,
      y: baseY, seed: `${seed}:n`, burnt, roof });
    const [ex, ez] = F(-mir * w * 0.26, -d * 0.2);
    FarBlock(farSink, { x: ex, z: ez, ry: ry + Math.PI / 2, w: d * 0.42, d: w * 0.36,
      h: h - 0.3, y: baseY, seed: `${seed}:e`, burnt, roof });
    return;
  }
  const [mx, mz] = F(0, -d * 0.04);
  FarBlock(farSink, { x: mx, z: mz, ry, w: w * 0.86, d: d * 0.78, h,
    y: baseY, seed: `${seed}:m`, burnt, roof });
}
