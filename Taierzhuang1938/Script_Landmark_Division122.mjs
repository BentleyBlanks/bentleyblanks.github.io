// 第122师师部（西关，濠外、西关大街北侧）+ 西关大街。工作包 B4 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// 这个文件里住着两样东西，它们其实是一件事的两半：
//   ① 师部院 —— 直接调 A5 的 BuildHq。「同族换牌，不换骨」：城内 124/127 师部
//      与这座濠外的 122 师部是同一条装配线上的院子，换的只是门口那块番号牌
//      （BuildHq 的牌面本来就是净几何、不写字），不该有第二套指挥部几何。
//      院子只有 40×32，够不上 BuildHq 里 94 m 师部才有的机要库 —— 这正是
//      「城外临时设的师部」与「城内那两座」在俯瞰图上应有的差别，不去补它。
//   ② 西关大街 —— 城外那条 6 m 宽的土路、沿街四间土坯铺面与一座敞棚。
//      L1 的路线是「铁路道口 → 车站 → 电灯厂 → 西门」，这条街是那一段唯一的
//      人造纵深：没有它，师部院就是荒野里孤零零的一个方框，玩家也读不出
//      自己正走在关厢街上。西关是关厢街区的**残响**，所以比城内稀疏得多 ——
//      四间铺子分成两簇（道口一簇、师部门口一簇），中间是空地，不是连排店面。
//
// 三条坐标/高程上的坑（本包踩到的，写在这儿省得下一个人再踩一遍）：
//   ① 本文件的局部坐标一律用 **PlaceGeometry 那一套**：ry=0 时局部 +z = 世界 +z
//      （南）、局部 +x = 世界 +x（东）。BuildHq 走的是 AddCompound 那一套
//      （门脸排在局部 -z），两套差 180°。所以调 BuildHq 时把 ry 转了半圈，
//      门才开在南边对着街 —— 数据里 division122 没有 ry，照直传 0 的话
//      师部大门开在北面、背对西关大街。
//   ② 濠外原野压在 y=-1.2，而 AddWall / AddRoomBlock / AddHardMountainRoof
//      **全部以 y=0 起砌、没有 baseY 参数**。所以街上的铺面不能用它们（用了
//      就是悬空 1.2 m 的房子），本文件自己砌，每一件都吃 baseY。
//      院子那一块脚下已由 OUTER_PADS 垫平到 y=0，所以院子照旧交给 BuildHq。
//   ③ 西门前护城河外凸 16 m（GATE_BULGE），**濠外岸在 x≈-344.5 而不是 -328.5**。
//      街的东端必须停在濠外岸，再往东是桥与马道（城模块自己建的）。
//      数据里 westStreet.toX=-328 落在濠内的马道上，照抄会把土路铺过护城河。

import * as THREE from "three";
import { MakeBox, PlaceGeometry, TILE_METERS, MergeGeometries } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { AddRoadWear, AddYardWear, AddStreetLife, AddStalkStack } from "./Script_LivedInProps.mjs";
import { BuildHq } from "./Script_Landmark_Headquarters.mjs";

// ---------------------------------------------------------------------------
// 兜底常量
//
// 契约禁止本文件 import Data_Tengxian，而 BuildOutskirts 现在只把 division122
// 那一条喂进来 —— 西关大街的数据（WEST_SUBURB.westStreet）根本到不了这里。
// 主会话把它挂到 f.street 上之后（见交付报告的「需主会话改共享文件」一节），
// 下面这份镜像就可以删；在那之前它是这条街唯一的尺寸来源。
// ---------------------------------------------------------------------------

/** = Data_Tengxian.WEST_SUBURB.westStreet */
const WEST_STREET_FALLBACK = Object.freeze({ z: 0, fromX: -470, toX: -328, width: 6 });

/** 西门前的濠外岸 x = -(CITY.platformEdge 318 + GATE_BULGE 16 + MOAT.width 10.5)。 */
const MOAT_OUTER_AT_WEST_GATE = -344.5;
/** 濠上木桥（BuildMoat 建）：桥面顶标高 -0.16，西端 x = -(334 + 10.5/2 + 13.5/2)。 */
const BRIDGE_DECK_Y = -0.16;
const BRIDGE_WEST_X = -346.0;

/**
 * 沿街的铺面。lx = 世界 x；side = -1 街北 / +1 街南；
 * open = 卸了门板的那一间（-1 表示整排上板）；straw = 草顶（最穷的一间）。
 *
 * x 位置刻意避开 x∈[-419,-385]：通信队（WEST_SUBURB.communications，
 * z=-28 d=72）的院子一直伸到 z=+8，正压在西关大街上 —— 那是数据层的冲突，
 * 已写进交付报告，这里先不往那堆冲突上再加自己的房子。
 */
const SHOPS = Object.freeze([
  { lx: -449, side: -1, w: 13.0, d: 6.4, open: 1, straw: false },
  { lx: -431, side: -1, w: 10.5, d: 5.8, open: -1, straw: true },
  { lx: -379, side: 1, w: 12.0, d: 6.2, open: 2, straw: false },
  { lx: -357, side: 1, w: 10.0, d: 5.8, open: 0, straw: false },
]);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 局部 → 世界（PlaceGeometry 那一套：+x=(cos,-sin)，+z=(sin,cos)）。 */
function Frame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

/**
 * 一片四边形。土路铺成**贴着地形的带子**而不是一块块方板：
 * 濠外原野有 ±0.55 m 的起伏，加上电灯厂/通信队/师部脚下那几块垫地的过渡带
 * （1.2 m 的高差摊在 14—16 m 上），一段一段的平板会在过渡带里读成台阶。
 * vertical=true 的那几片是路肩的裙边（UV 按「沿线 × 高度」投，免得被拉成条）。
 */
function Quad(a, b, c, d, tile = TILE_METERS.ground, vertical = false) {
  const g = new THREE.BufferGeometry();
  const pts = [a, b, c, a, c, d];
  const pos = new Float32Array(18);
  const uv = new Float32Array(12);
  for (let i = 0; i < 6; i += 1) {
    pos[i * 3] = pts[i][0]; pos[i * 3 + 1] = pts[i][1]; pos[i * 3 + 2] = pts[i][2];
    uv[i * 2] = pts[i][0] / tile;
    uv[i * 2 + 1] = (vertical ? pts[i][1] : pts[i][2]) / tile;
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 西关大街
// ---------------------------------------------------------------------------

/**
 * 土路本体：一条贴地的带子 + 两侧的裙边。
 *
 * 路面比田面高 ROAD_CROWN —— 这不是为了好看：城内的街也是压在台地上的一层薄板
 * （BuildStreets 用 0.12 厚的板），关厢土路本来也是垫起来的。裙边负责在
 * 地形比采样点高的地方把路边缘盖住，不然过渡带里会出现「路陷进土里」。
 *
 * 0.22 这个数是被逼出来的：城外的返青麦垄（Script_TengxianOutfield 的
 * TerrainSlab topOffset=0.18）不认识这条街，照样种在路面上 —— 路按常规的
 * 0.045—0.12 铺就整段埋在麦垄底下（实拍取证：道口往东四十米读成一片绿地）。
 * 正解是给 outfield 的 Blocked() 加上西关大街这条走廊（已写进交付报告），
 * **那条改完之后这里应当降回 0.10 左右**。
 */
const ROAD_CROWN = 0.22;

function RoadRibbon(host, { fromX, toX, z, width, seed }) {
  const half = width / 2;
  const span = toX - fromX;
  const steps = Math.max(2, Math.round(span / 4));
  const top = [], skirt = [];
  let prev = null;
  for (let i = 0; i <= steps; i += 1) {
    const x = fromX + (span * i) / steps;
    const y = host.OuterHeight(x, z) + ROAD_CROWN;
    const node = { x, y };
    if (prev) {
      // 顶点顺序决定法线朝向 —— **写反了整条路是隐形的**（背面剔除掉，
      // 出图上只剩车辙浮在田里，第一版就是这么丢了一条街）。
      // 这一圈按 +z→-z 排，叉积朝上；裙边按左右换向，法线一律朝路外。
      top.push(Quad(
        [prev.x, prev.y, z + half], [x, node.y, z + half],
        [x, node.y, z - half], [prev.x, prev.y, z - half]));
      for (const s of [-1, 1]) {
        const zs = z + s * half;
        const corners = s < 0
          ? [[prev.x, prev.y, zs], [x, node.y, zs],
            [x, node.y - 0.65, zs], [prev.x, prev.y - 0.65, zs]]
          : [[x, node.y, zs], [prev.x, prev.y, zs],
            [prev.x, prev.y - 0.65, zs], [x, node.y - 0.65, zs]];
        skirt.push(Quad(corners[0], corners[1], corners[2], corners[3],
          TILE_METERS.ground, true));
      }
    }
    prev = node;
  }
  host.sink.Add("DirtRoad", MergeGeometries(top));
  host.sink.Add("DirtRoad", MergeGeometries(skirt));
  // 路基的碰撞：贴地的地面板本来都不登记碰撞（走的是解析地形），但这条路
  // 垫了 0.22 m，不登记的话人是**踩在路面以下**走的，车辙比脚面还高。
  // 每 10 m 一个盒子（盒顶 = 路面），0.22 < 0.56 的自动抬腿档，
  // 既不绊人也不会在导航图上刷出一条死带。
  const solidEvery = 10.5;
  const solids = Math.max(1, Math.round(span / solidEvery));
  for (let i = 0; i < solids; i += 1) {
    const cx = fromX + (span * (i + 0.5)) / solids;
    const cy = host.OuterHeight(cx, z) + ROAD_CROWN;
    host.sink.Solid(cx, cy - 0.24, z, (span / solids) / 2, 0.24, half, "embankment");
  }
  // 车辙、脚迹与修补斑：分四段各按本段的地高摆，一段一个 baseY
  const chunks = 4;
  for (let c = 0; c < chunks; c += 1) {
    const cx = fromX + (span * (c + 0.5)) / chunks;
    AddRoadWear(host.sink, {
      x: cx, z, ry: 0, length: span / chunks, width,
      baseY: host.OuterHeight(cx, z) + ROAD_CROWN + 0.015, seed: `${seed}:wear${c}`,
    });
  }
}

/**
 * 桥头引道。
 *
 * 濠上木桥的桥面顶在 y=-0.16，而濠外原野在 -1.2 —— 中间是一道 1 m 的直坎，
 * 而 L1 的终点（西门）就在桥那一头，玩家非过不可。Rapier 的 autostep 上限
 * 0.55 m，一步迈不上去。所以这里砌一段夯土引道：四级踏步，每级 ≤0.30 m，
 * 面宽从街宽收到桥宽 —— 既是能走的，也是「桥头」这件事的形制交代。
 */
function BridgeApproach(host, { z, width, seed }) {
  const groundY = host.OuterHeight(BRIDGE_WEST_X - 3, z);
  const rise = (BRIDGE_DECK_Y - 0.05) - groundY;
  if (rise < 0.3) return BRIDGE_WEST_X;            // 编辑器平地替身：没有濠，也没有坎
  const steps = Math.max(3, Math.ceil(rise / 0.30));
  const run = 1.55;
  const startX = BRIDGE_WEST_X - steps * run;
  for (let i = 0; i < steps; i += 1) {
    const topY = groundY + (rise * (i + 1)) / steps;
    const w = width - (width - 4.6) * ((i + 1) / steps);
    const h = topY - (groundY - 0.6);
    const cx = startX + run * (i + 0.5);
    host.sink.Add("DirtRoad", PlaceGeometry(
      MakeBox(run * 1.04, h, w, TILE_METERS.ground, `${seed}:step${i}`),
      { x: cx, y: topY - h / 2, z }));
    host.sink.Solid(cx, topY - h / 2, z, run * 0.52, h / 2, w / 2, "embankment");
  }
  // 桥头两侧的护坡石：一对条石，把引道的边收住
  for (const s of [-1, 1]) {
    host.sink.Add("Stone", PlaceGeometry(
      MakeBox(2.4, 0.5, 0.44, TILE_METERS.stone, `${seed}:kerb${s}`),
      { x: BRIDGE_WEST_X - 1.3, y: BRIDGE_DECK_Y - 0.32, z: z + s * 2.7 }));
  }
  return startX;
}

/**
 * 一间临街铺面：土坯檐墙 + 硬山（山墙高出屋面）+ 一排铺板门。
 *
 * 「铺面」在街上的识别语言只有两条：**门脸整间是可拆的排门板**（不是民居那种
 * 一门两窗），以及檐下挑出来的那块幌子板。所以这两样做足，其余从简。
 * 卸了门板的那一间是店在做生意的证据，也是玩家能走进去的那个洞（不摆碰撞）。
 *
 * 不走 AddRoomBlock/AddHardMountainRoof：那两个都从 y=0 起砌，
 * 而这几间站在 y≈-1.2 的濠外原野上（见文件头注②）。
 */
function Shopfront(host, {
  x, z, ry, width, depth, seed, damage = 0.2, straw = false, openBay = -1,
}) {
  const sink = host.sink;
  const rnd = Mulberry32(HashString(seed));
  const At = Frame(x, z, ry);
  const sin = Math.sin(ry), cos = Math.cos(ry);
  // 四角取最高的一处起砌，剩下的高差由台明的裙边吃掉（濠外地面并不平）
  let baseY = -1e9;
  for (const lx of [-width / 2, width / 2]) {
    for (const lz of [-depth / 2, depth / 2]) {
      const p = At(lx, lz);
      baseY = Math.max(baseY, host.OuterHeight(p.x, p.z));
    }
  }
  // 台明比路面再高一档（铺面的地坪从来不低于街）：路冠 0.22，这里 0.28
  const floorY = baseY + 0.28;
  const eave = 2.46 + rnd() * 0.24;                 // 檐口 2.4—2.8（Data_HistoryMaterial）
  const rise = depth * 0.5 * 0.52;                  // 硬山坡 ~27.5°
  const bays = Math.max(2, Math.round(width / 3.3));// 开间 3.0—3.6
  const bayW = width / bays;
  const wallMat = "Adobe";

  // --- 台明：条石一圈，往地里埋 0.46 m，把四角的高差与散水一起吃掉 ---
  sink.Add("Stone", PlaceGeometry(
    MakeBox(width + 0.8, 0.78, depth + 1.2, TILE_METERS.stone, `${seed}:podium`),
    { x, y: floorY - 0.39, z, ry }));
  sink.Solid(x, floorY - 0.39, z, (width + 0.8) / 2, 0.39, (depth + 1.2) / 2,
    "villageFoundation", ry);

  // --- 后檐墙 ---
  const back = At(0, -depth / 2 + 0.2);
  sink.Add(wallMat, PlaceGeometry(
    MakeBox(width, eave, 0.40, TILE_METERS.adobe, `${seed}:back`),
    { x: back.x, y: floorY + eave / 2, z: back.z, ry }));
  sink.Solid(back.x, floorY + eave / 2, back.z, width / 2, eave / 2, 0.20, "wall", ry);
  sink.Cover(back.x, back.z, eave * (1 - damage * 0.3), -sin, -cos);

  // --- 两山墙：墙身 + 高出屋面的五级硬山 ---
  for (const s of [-1, 1]) {
    const p = At(s * (width / 2 - 0.2), 0);
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(0.40, eave, depth, TILE_METERS.adobe, `${seed}:gw${s}`),
      { x: p.x, y: floorY + eave / 2, z: p.z, ry }));
    sink.Solid(p.x, floorY + eave / 2, p.z, 0.20, eave / 2, depth / 2, "wall", ry);
    const steps = 5, segD = depth / steps, parts = [];
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const h = rise * (1 - Math.abs(t * 2 - 1)) + 0.14;
      parts.push(PlaceGeometry(
        MakeBox(0.34, h, segD * 1.02, TILE_METERS.adobe, `${seed}:gb${s}${i}`),
        { x: 0, y: h / 2, z: -depth / 2 + segD * (i + 0.5) }));
    }
    sink.Add(wallMat, PlaceGeometry(MergeGeometries(parts),
      { x: p.x, y: floorY + eave, z: p.z, ry }));
  }

  // --- 前檐：柱础 + 檐柱 + 檐枋 ---
  const postLz = depth / 2 - 0.14;
  for (let i = 0; i <= bays; i += 1) {
    const p = At(-width / 2 + bayW * i, postLz);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.34, 0.24, 0.34, TILE_METERS.stone, `${seed}:pb${i}`),
      { x: p.x, y: floorY + 0.12, z: p.z, ry }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.17, eave - 0.24, 0.17, TILE_METERS.wood, `${seed}:po${i}`),
      { x: p.x, y: floorY + 0.24 + (eave - 0.24) / 2, z: p.z, ry }));
    sink.Solid(p.x, floorY + eave / 2, p.z, 0.13, eave / 2, 0.13, "villagePost", ry);
  }
  const lintel = At(0, postLz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(width + 0.3, 0.26, 0.22, TILE_METERS.wood, `${seed}:lintel`),
    { x: lintel.x, y: floorY + eave - 0.13, z: lintel.z, ry }));

  // --- 排门板：上板的间是一排竖木板，卸板的那间是能走进去的洞 ---
  for (let b = 0; b < bays; b += 1) {
    const lx = -width / 2 + bayW * (b + 0.5);
    if (b === openBay) {
      const sill = At(lx, depth / 2 - 0.06);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(bayW - 0.5, 0.15, 0.44, TILE_METERS.stone, `${seed}:sill${b}`),
        { x: sill.x, y: floorY + 0.075, z: sill.z, ry }));
      // 卸下来的门板斜靠在柱子上 —— 「今天开着门」这件事最便宜的证据
      const lean = At(lx + bayW * 0.34, depth / 2 + 0.34);
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(0.36, 1.92, 0.06, TILE_METERS.wood, `${seed}:lean${b}`),
        { x: lean.x, y: floorY + 0.96, z: lean.z, ry, rx: 0.13 }));
      continue;
    }
    // 板宽 ~0.52 m：一间三米多的门脸排六七块板。再密一档看不出来，只涨三角
    const planks = Math.max(4, Math.round(bayW / 0.52));
    const inner = bayW - 0.36;
    const pw = inner / planks;
    const stack = [];
    for (let k = 0; k < planks; k += 1) {
      stack.push(PlaceGeometry(
        MakeBox(pw * 0.94, eave - 0.28, 0.055, TILE_METERS.wood, `${seed}:pk${b}${k}`),
        { x: -inner / 2 + pw * (k + 0.5), y: 0 }));
    }
    const p = At(lx, depth / 2 - 0.07);
    sink.Add("WoodDoor", PlaceGeometry(MergeGeometries(stack),
      { x: p.x, y: floorY + 0.06 + (eave - 0.28) / 2, z: p.z, ry }));
    sink.Solid(p.x, floorY + eave / 2, p.z, bayW / 2, eave / 2, 0.09, "door", ry);
  }

  // --- 幌子：檐下挑出一根杆，垂一块净几何木牌（写什么字是别人的事）---
  const arm = At(width / 2 - 0.45, depth / 2 + 0.40);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(0.09, 0.09, 1.05, TILE_METERS.wood, `${seed}:arm`),
    { x: arm.x, y: floorY + eave - 0.28, z: arm.z, ry }));
  const sign = At(width / 2 - 0.45, depth / 2 + 0.86);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(0.42, 1.18, 0.05, TILE_METERS.wood, `${seed}:sign`),
    { x: sign.x, y: floorY + eave - 0.92, z: sign.z, ry }));

  // --- 屋面 ---
  const slopeLen = Math.hypot(depth / 2, rise);
  const angle = Math.atan2(rise, depth / 2);
  const roofMat = straw ? "VillageStraw" : "RoofTile";
  for (const s of [-1, 1]) {
    const p = At(0, s * (depth / 4));
    sink.Add(roofMat, PlaceGeometry(
      MakeBox(width + 0.9, straw ? 0.22 : 0.12, slopeLen + 0.5,
        straw ? TILE_METERS.ground : TILE_METERS.roof, `${seed}:rs${s}`),
      { x: p.x, y: floorY + eave + rise / 2, z: p.z, ry, rx: s * angle }));
  }
  sink.Add(roofMat, PlaceGeometry(
    MakeBox(width + 0.9, straw ? 0.26 : 0.20, 0.36,
      straw ? TILE_METERS.ground : TILE_METERS.roof, `${seed}:ridge`),
    { x, y: floorY + eave + rise + 0.07, z, ry }));

  // --- 门前被踩实的一片地 ---
  const apron = At(0, depth / 2 + 1.5);
  AddYardWear(sink, {
    x: apron.x, z: apron.z, ry, baseY: host.OuterHeight(apron.x, apron.z) + 0.02,
    seed: `${seed}:apron`, radius: Math.min(width * 0.42, 3.2),
  });

  // --- 店堂：卸了板的那一间进得去，里头得有东西（B4 遗留 3）---
  if (openBay >= 0) {
    ShopRoom(sink, {
      At, ry, floorY, eave, width, depth, bayW, openBay, seed, damage, rnd,
    });
  }
}

/**
 * 店堂内部：砖墁地 + 两道梁 + 柜台（L 形）+ 后墙货架 + 货 + 一只水缸。
 *
 * 这一间原来是「玩家能走进去、里面除了地面和土坯后墙什么都没有」（WP-B4 遗留 3）。
 * 关厢铺面的店堂只需要三样东西就成立：**齐胸的柜台**（把客与掌柜分开）、
 * **后墙一排货架**（把「铺子」与「屋子」分开）、以及一条**进得去的道**。
 *
 * 三条硬约束：
 *   ① 柜台一律排在门口净宽之外 ——「卸板口 ±0.95 m」是进门那条道，不许摆东西；
 *      柜台与山墙之间再留 0.85 m，掌柜得从那头绕进柜台里。
 *   ② 材质只用这条街已经有的桶（HouseholdCeramic / Wicker / HouseholdCloth 都是
 *      AddStreetLife 已经在这个分区里开过的）—— 内部再漂亮也不值一个新 draw call。
 *   ③ 内部没有独立光源：光从卸板口那 ~2.8 m 宽、到檐口通高的洞进来。
 *      地面用 HouseholdCeramic 而不是 Stone —— 白得发光的地板会把「进了屋」
 *      那一档暗对比整个吃掉（WP-D5 实拍取证）。
 */
function ShopRoom(sink, {
  At, ry, floorY, eave, width, depth, bayW, openBay, seed, damage, rnd,
}) {
  const inHalfX = width / 2 - 0.40;          // 山墙内皮
  const backLz = -depth / 2 + 0.40;          // 后檐墙内皮
  const frontLz = depth / 2 - 0.30;          // 排门板内皮
  const openLx = -width / 2 + bayW * (openBay + 0.5);

  // --- 砖墁地 ---
  {
    const p = At(0, (backLz + frontLz) / 2);
    sink.Add("HouseholdCeramic", PlaceGeometry(
      MakeBox(inHalfX * 2, 0.07, frontLz - backLz, TILE_METERS.brick, `${seed}:floor`),
      { x: p.x, y: floorY + 0.035, z: p.z, ry }));
  }
  // --- 两道梁：抬头看见的是梁不是屋面板底 ---
  for (const s of [-1, 1]) {
    const p = At(0, s * depth * 0.17);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(width - 0.5, 0.20, 0.18, TILE_METERS.wood, `${seed}:tie${s}`),
      { x: p.x, y: floorY + eave - 0.18, z: p.z, ry }));
  }

  // --- 柜台：挑门口那一侧空间大的那边摆，另一头留 0.85 m 让掌柜绕进去 ---
  const LANE = 0.95, WALL_GAP = 0.85;
  const leftEnd = openLx - LANE, rightStart = openLx + LANE;
  const useLeft = (leftEnd - (-inHalfX + WALL_GAP)) >= ((inHalfX - WALL_GAP) - rightStart);
  const cA = useLeft ? -inHalfX + WALL_GAP : rightStart;
  const cB = useLeft ? leftEnd : inHalfX - WALL_GAP;
  const cLen = Math.min(cB - cA, 3.4);
  const cCx = useLeft ? cB - cLen / 2 : cA + cLen / 2;
  const cLz = frontLz - 1.95;
  const HALF_D = 0.31;
  if (cLen > 1.2) {
    const p = At(cCx, cLz);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(cLen + 0.1, 0.16, 0.64, TILE_METERS.stone, `${seed}:cplinth`),
      { x: p.x, y: floorY + 0.08, z: p.z, ry }));
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(cLen, 0.72, 0.56, TILE_METERS.wood, `${seed}:cbody`),
      { x: p.x, y: floorY + 0.52, z: p.z, ry }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(cLen + 0.16, 0.08, 0.72, TILE_METERS.wood, `${seed}:ctop`),
      { x: p.x, y: floorY + 0.92, z: p.z, ry }));
    sink.Solid(p.x, floorY + 0.48, p.z, (cLen + 0.16) / 2, 0.48, HALF_D, "furniture", ry);
    // 回头段：贴门口那一头往里折，围出掌柜位
    const retX = useLeft ? cB - 0.28 : cA + 0.28;
    const retLz = cLz - 0.28 - 0.62;
    const q = At(retX, retLz);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(0.56, 0.72, 1.24, TILE_METERS.wood, `${seed}:cret`),
      { x: q.x, y: floorY + 0.52, z: q.z, ry }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.72, 0.08, 1.24, TILE_METERS.wood, `${seed}:crettop`),
      { x: q.x, y: floorY + 0.92, z: q.z, ry }));
    sink.Solid(q.x, floorY + 0.48, q.z, 0.36, 0.48, 0.62, "furniture", ry);
    // 台面上一杆秤与一只钱笸箩
    if (damage < 0.55) {
      const s1 = At(cCx + cLen * 0.28, cLz + 0.02);
      sink.Add("Wicker", PlaceGeometry(
        MakeBox(0.34, 0.13, 0.34, TILE_METERS.wood, `${seed}:tray`),
        { x: s1.x, y: floorY + 1.03, z: s1.z, ry: ry + 0.3 }));
      const s2 = At(cCx - cLen * 0.30, cLz - 0.04);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(1.05, 0.045, 0.045, TILE_METERS.wood, `${seed}:steel`),
        { x: s2.x, y: floorY + 0.99, z: s2.z, ry: ry + 0.14 }));
    }
  }

  // --- 后墙货架：四层，架在柜台正对面 ---
  const shLen = Math.min(cLen + 0.8, inHalfX * 2 - 0.9);
  const shLz = backLz + 0.23;
  const shTop = Math.min(eave - 0.42, 2.18);
  if (shLen > 1.2) {
    for (const s of [-1, 1]) {
      const p = At(cCx + s * (shLen / 2 - 0.05), shLz);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.09, shTop, 0.44, TILE_METERS.wood, `${seed}:shup${s}`),
        { x: p.x, y: floorY + shTop / 2, z: p.z, ry }));
    }
    const tiers = 4;
    for (let i = 0; i < tiers; i += 1) {
      const y = floorY + 0.34 + i * ((shTop - 0.42) / (tiers - 1));
      const p = At(cCx, shLz);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(shLen, 0.05, 0.44, TILE_METERS.wood, `${seed}:sh${i}`),
        { x: p.x, y, z: p.z, ry }));
      if (damage > 0.55) continue;                 // 抢空了的铺子只剩空架子
      // 货：陶罐 / 荆条篓 / 木匣 / 布卷各一族，一层摆两三件
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k += 1) {
        const lx = cCx + (-shLen / 2 + shLen * ((k + 0.5) / n)) + (rnd() - 0.5) * 0.22;
        const g = At(lx, shLz - 0.02);
        const pick = Math.floor(rnd() * 4);
        if (pick === 0) {
          sink.Add("HouseholdCeramic", PlaceGeometry(
            MakeBox(0.26, 0.30, 0.26, TILE_METERS.stone, `${seed}:g${i}${k}`),
            { x: g.x, y: y + 0.175, z: g.z, ry: ry + rnd() }));
        } else if (pick === 1) {
          sink.Add("Wicker", PlaceGeometry(
            MakeBox(0.36, 0.26, 0.34, TILE_METERS.wood, `${seed}:g${i}${k}`),
            { x: g.x, y: y + 0.155, z: g.z, ry: ry + rnd() * 0.6 }));
        } else if (pick === 2) {
          sink.Add("WoodDoor", PlaceGeometry(
            MakeBox(0.42, 0.22, 0.30, TILE_METERS.wood, `${seed}:g${i}${k}`),
            { x: g.x, y: y + 0.135, z: g.z, ry: ry + (rnd() - 0.5) * 0.3 }));
        } else {
          sink.Add("HouseholdCloth", PlaceGeometry(
            MakeBox(0.50, 0.17, 0.17, TILE_METERS.wood, `${seed}:g${i}${k}`),
            { x: g.x, y: y + 0.11, z: g.z, ry: ry + (rnd() - 0.5) * 0.2 }));
        }
      }
    }
    const sc = At(cCx, shLz);
    sink.Solid(sc.x, floorY + shTop / 2, sc.z, shLen / 2, shTop / 2, 0.22, "furniture", ry);
  }

  // --- 墙角一只水缸 + 卸下来的两块门板靠在山墙内侧 ---
  {
    const cornerX = (useLeft ? 1 : -1) * (inHalfX - 0.55);
    const v = At(cornerX, backLz + 0.62);
    sink.Add("HouseholdCeramic", PlaceGeometry(
      MakeBox(0.68, 0.82, 0.68, TILE_METERS.stone, `${seed}:vat`),
      { x: v.x, y: floorY + 0.41, z: v.z, ry: ry + 0.4 }));
    sink.Solid(v.x, floorY + 0.41, v.z, 0.36, 0.41, 0.36, "prop", ry);
    for (let i = 0; i < 2; i += 1) {
      const b = At(cornerX + (useLeft ? -0.28 : 0.28) - (useLeft ? 1 : -1) * i * 0.09,
        backLz + 2.1 + i * 0.35);
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(0.06, eave - 0.42, 0.52, TILE_METERS.wood, `${seed}:lean${i}`),
        { x: b.x, y: floorY + (eave - 0.42) / 2, z: b.z, ry, rz: (useLeft ? 1 : -1) * 0.12 }));
    }
    // 门里一条候客板凳，**贴山墙顺进深摆**（横着摆会伸进卸板口那条道，
    // 而门口净宽是这一间唯一的入口 —— 不摆碰撞也不该在视觉上把门堵上）
    const benchX = cornerX + (useLeft ? 0.27 : -0.27);
    const bench = At(benchX, frontLz - 1.25);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.34, 0.07, 1.35, TILE_METERS.wood, `${seed}:bench`),
      { x: bench.x, y: floorY + 0.42, z: bench.z, ry }));
    for (const s of [-1, 1]) {
      const q = At(benchX, frontLz - 1.25 + s * 0.52);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.28, 0.40, 0.08, TILE_METERS.wood, `${seed}:bl${s}`),
        { x: q.x, y: floorY + 0.20, z: q.z, ry }));
    }
  }
}

/**
 * 敞棚（大车店门口那种席棚）：六根柱 + 一面单坡草顶，三面不封。
 * 关厢街上不全是铺子 —— 有铺子，就得有停车卸货的地方。
 */
function OpenShed(host, { x, z, ry, width, depth, seed }) {
  const sink = host.sink;
  const At = Frame(x, z, ry);
  let baseY = -1e9;
  for (const lx of [-width / 2, width / 2]) {
    for (const lz of [-depth / 2, depth / 2]) {
      const p = At(lx, lz);
      baseY = Math.max(baseY, host.OuterHeight(p.x, p.z));
    }
  }
  const high = 2.75, low = 2.05;
  for (let i = 0; i < 3; i += 1) {
    const lx = (i - 1) * (width / 2);
    for (const s of [-1, 1]) {
      const p = At(lx, s * depth / 2);
      const h = s < 0 ? high : low;
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.16, h, 0.16, TILE_METERS.wood, `${seed}:p${i}${s}`),
        { x: p.x, y: baseY + h / 2, z: p.z, ry }));
      sink.Solid(p.x, baseY + h / 2, p.z, 0.12, h / 2, 0.12, "villagePost", ry);
    }
  }
  const slope = Math.atan2(high - low, depth);
  sink.Add("VillageStraw", PlaceGeometry(
    MakeBox(width + 0.7, 0.24, Math.hypot(depth, high - low) + 0.5,
      TILE_METERS.ground, `${seed}:roof`),
    { x, y: baseY + (high + low) / 2 + 0.16, z, ry, rx: -slope }));
  // 棚下的秸秆：草顶的来处就在脚边
  const stalk = At(-width * 0.28, -depth * 0.16);
  AddStalkStack(sink, {
    x: stalk.x, z: stalk.z, ry, y: baseY, seed: `${seed}:stalk`, scale: 0.86,
  });
}

/**
 * 师部门口的拴马桩与石槽。
 * 师部是骡马与传令兵的集散地；门口空着一片，读起来就不像有人办公的地方。
 */
function HitchingRail(host, { x, z, ry, seed }) {
  const sink = host.sink;
  const At = Frame(x, z, ry);
  const y = host.OuterHeight(x, z);
  for (let i = 0; i < 3; i += 1) {
    const p = At((i - 1) * 1.5, 0);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.26, 1.05, 0.26, TILE_METERS.stone, `${seed}:post${i}`),
      { x: p.x, y: y + 0.52, z: p.z, ry }));
    sink.Solid(p.x, y + 0.52, p.z, 0.2, 0.52, 0.2, "prop", ry);
  }
  const trough = At(0, 1.15);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(2.3, 0.42, 0.52, TILE_METERS.stone, `${seed}:trough`),
    { x: trough.x, y: y + 0.21, z: trough.z, ry }));
  sink.Solid(trough.x, y + 0.21, trough.z, 1.15, 0.21, 0.26, "prop", ry);
}

/** 西关大街整条：土路 + 桥头引道 + 沿街铺面 + 敞棚 + 街边家什。 */
function WestStreet(host, ctx, street) {
  const z0 = street.z;
  const half = street.width / 2;
  const seed = "west:street";
  const roadEast = Math.min(street.toX, MOAT_OUTER_AT_WEST_GATE,
    BridgeApproach(host, { z: z0, width: street.width, seed: `${seed}:appr` }));
  RoadRibbon(host, {
    fromX: street.fromX, toX: roadEast, z: z0, width: street.width, seed,
  });

  // 沿街四个矩形现在由 Data_WestSuburbBlocks 生成完整铺院；这里只保留道路和
  // 街边生活件，避免旧版四间点状小铺与新街坊重复穿插。

  // 街边家什：两处，一处在道口一簇铺子中间，一处在师部门口对面
  for (const [lx, side, commerce] of [[-440, -1, true], [-368, 1, true]]) {
    const z = z0 + side * (half + 1.1);
    AddStreetLife(host.sink, {
      x: lx, z, ry: side < 0 ? 0 : Math.PI, baseY: host.OuterHeight(lx, z),
      seed: `${seed}:life${lx}`, commerce,
    });
  }
  // 电线杆沿街这一路是 B3（通信队架空线出院向城门方向）的活，本包不摆，
  // 免得两包在同一条街肩上各插一排杆。见交付报告的衔接清单。
}

// ---------------------------------------------------------------------------
// kind 入口
// ---------------------------------------------------------------------------

/**
 * 第122师师部（西关）。院子交给 BuildHq，街是这里自己的。
 *
 * ry 语义：BuildHq 走 AddCompound 那一套局部坐标（门脸排在局部 -z），
 * 数据里 division122.ry = π（主会话集成时补）就是「门朝南对西关大街」——
 * 这里直接用 ctx.ry，不再自己加半圈。见文件头注①。
 */
export function BuildDivision122(host, f, ctx) {
  const ry = ctx.ry ?? Math.PI;
  BuildHq(host, f, { ...ctx, ry });

  // 门口（院子南墙外）的拴马桩：避开 GatePost 的沙袋哨位（在门轴东侧）
  HitchingRail(host, {
    x: f.x - 8.5, z: f.z + f.d / 2 + 4.2, ry: 0, seed: `map:${f.id}:hitch`,
  });

  const street = f.street ?? ctx.street ?? WEST_STREET_FALLBACK;
  WestStreet(host, ctx, street);
}
