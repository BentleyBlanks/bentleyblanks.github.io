// 西关：通讯队（communications）+ 交易所（exchange）。工作包 B3 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。f 分别 = WEST_SUBURB.communications / .exchange。
//
// —— 史实纪律 ——
// 这两处在 docs/Data_TengxianCity.md 里**一个字都没有**：全城考据文里检索
// 「通信队 / 通讯 / 交易所」只在 Data_Tengxian.PRESUMED.westSuburbLayout 一条命中，
// 而那一条自己就写着「为 Notion 城防示意图可见信息；其坐标、尺度和站房形式均为推定」。
// 也就是说：**图上只有两个图注和两个方框**，位置与占地可读，形制、层数、
// 有没有天线、拍卖堂多大，一概无载。所以这里做的是「不加戏的最小可辨形」：
//
//   通讯队 —— 军用通信院。可辨特征只用两条：①院里立着四根 17—20 m 的格构天线杆，
//     顶上一副平顶（T 型）天线；②院内一条 7.5 m 的架空明线杆路出院沿西关大街东去。
//     房子本身是最普通的鲁南砖排屋，只把窗压高、加铁栅（机房不给人从窗口看进去）。
//     **不做电台内景、不做番号字样**：1938 年 3 月这支部队的番号、装备无资料。
//   交易所 —— 临街门脸（排门铺面）+ 后面一间脊高压过民居两米的单层大空间拍卖堂。
//     「大空间」全靠一条：18 m 通跨、无隔墙、两侧一整排 2.45 m 窗台的连续高窗。
//     不做匾字（字样无资料），匾只有一块空石板。
//
// —— 一条工程上的让步（必须记在报告里）——
// WEST_SUBURB.westStreet（z=0，宽 6，x -470..-328）**从通讯队院子里穿过去**：
// 院子 z 范围 [-64, +8]，街心在 z=0。host.OnStreet 只认城内 STREETS，切不到西关大街，
// 所以这里自己把院子的南墙退到街北沿（见 WEST_STREET_KEEP），院深由 72 变成 59.4，
// 南边让出来的一条正好当门前街面。数据一个字没改，退让在几何侧完成。

import * as THREE from "three";
import { AddWall, AddHardMountainRoof, AddDoorReveal } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

// ---------------------------------------------------------------------------
// 局部坐标系：与 PlaceGeometry(ry) / AddWall / AddHardMountainRoof / AddDoorReveal
// 同一套 —— 局部 +x → 世界 (cos ry, -sin ry)，局部 +z → 世界 (sin ry, cos ry)。
// ry=0 时局部 +z 就是世界 +z（南）。约定：**局部 +z 是正面**（坐北朝南）。
// 本文件一律不调 AddCompound / AddRoomBlock / AddFeatureRoom（那三个的门脸排在
// 局部 -z，两套混用房子会被镜像，批次A 头注坑①）。
// ---------------------------------------------------------------------------
function MakeFrame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

/**
 * 西关大街的退让带（**Data_Tengxian.WEST_SUBURB.westStreet 的镜像**）。
 *
 * 构建器契约禁止 import Data_Tengxian，而 host.OnStreet 只覆盖城内 STREETS，
 * 于是这条城外土路的让距只能在这里写死。数值来源：westStreet.z = 0、width = 6
 * ⇒ 路边 3.0 + OnStreet 同款退让 1.2 + 0.4 余量 = 4.6。
 * **若 westStreet 的 z / width 改动，这里必须同步**（已列进 WP_B3 报告的协调项）。
 */
const WEST_STREET_KEEP = { z: 0, half: 4.6 };

/** 把一个地块的南边界退到西关大街北沿；街不穿过这块地时原样返回 f.d/2。 */
function SouthEdge(f) {
  const edge = (WEST_STREET_KEEP.z - WEST_STREET_KEEP.half) - f.z;   // 局部 z
  if (edge <= -f.d / 2 || edge >= f.d / 2) return f.d / 2;
  return edge;
}

/**
 * 一根线：从 a 到 b 的细长条。
 *
 * 拉线、天线、明线全走这一个函数。方向解算要跟 PlaceGeometry 的 "YXZ" 欧拉序对上：
 * 先绕 z 抬头 rz，再绕 y 转 ry，局部 +x 最终指向 (cos·cos ry, sin, -cos·sin ry)。
 * 所以 ry = atan2(-dz, dx)、rz = atan2(dy, 水平长)。写错一个符号，全院的拉线
 * 会整齐地指向同一个错误方向 —— 而那看上去像"风把线吹歪了"，很难发现。
 */
function AddWire(sink, material, a, b, seed, thick = 0.055) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(flat, dy);
  if (len < 0.2) return;
  sink.Add(material, PlaceGeometry(
    MakeBox(len, thick, thick, TILE_METERS.steel, seed),
    {
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
      ry: Math.atan2(-dz, dx), rz: Math.atan2(dy, flat),
    }));
}

/**
 * 格构天线杆一根。
 *
 * 为什么不是 Script_World.AddPole 加高：一根 20 m 的光杆子在天上是一条线，
 * 出图上根本读不出「这是天线」——它得有格构（四根角钢 + 横撑 + 斜撑）和拉线，
 * 才在剪影上认得出是塔不是电线杆。三角面代价：一根约 420 面，四根 1.7 k。
 * 角钢按 0.9 m 见方立，不做收分（收分要每层重算四根腿的斜置，面数翻一倍不值）。
 */
function AddLatticeMast(sink, {
  x, z, ry = 0, height = 18, side = 0.9, baseY = 0, seed = "mast", guyRadius = 4.6,
}) {
  const L = MakeFrame(x, z, ry);
  const half = side / 2;
  const legs = [[-half, -half], [half, -half], [half, half], [-half, half]];
  // 混凝土杆基（四个墩）
  for (let i = 0; i < legs.length; i += 1) {
    const p = L(legs[i][0], legs[i][1]);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.42, 0.5, 0.42, TILE_METERS.stone, `${seed}:ft${i}`),
      { x: p.x, y: baseY + 0.25, z: p.z, ry }));
  }
  // 四根角钢
  for (let i = 0; i < legs.length; i += 1) {
    const p = L(legs[i][0], legs[i][1]);
    sink.Add("AntennaSteel", PlaceGeometry(
      MakeBox(0.11, height, 0.11, TILE_METERS.steel, `${seed}:lg${i}`),
      { x: p.x, y: baseY + 0.4 + height / 2, z: p.z, ry }));
  }
  // 横撑：每 3.6 m 一道四边框；外加一面斜撑，剪影上才有格子而不是四条竖线。
  // 间距从 3.0 放到 3.6 是纯预算决定：四根塔省下约 290 个三角，而在 30 m 开外
  // （玩家最近也在院墙外）少一道横撑看不出来。
  const levels = Math.max(3, Math.round(height / 3.6));
  for (let k = 1; k <= levels; k += 1) {
    const y = baseY + 0.4 + height * (k / levels) - 0.15;
    for (let s = 0; s < 4; s += 1) {
      const a = legs[s], b = legs[(s + 1) % 4];
      const pa = L(a[0], a[1]), pb = L(b[0], b[1]);
      AddWire(sink, "AntennaSteel",
        { x: pa.x, y, z: pa.z }, { x: pb.x, y, z: pb.z }, `${seed}:br${k}${s}`, 0.075);
    }
    if (k < levels) {
      const yNext = baseY + 0.4 + height * ((k + 1) / levels) - 0.15;
      const pa = L(legs[0][0], legs[0][1]), pb = L(legs[1][0], legs[1][1]);
      AddWire(sink, "AntennaSteel",
        { x: pa.x, y, z: pa.z }, { x: pb.x, y: yNext, z: pb.z }, `${seed}:dg${k}`, 0.065);
      const pc = L(legs[2][0], legs[2][1]), pd = L(legs[3][0], legs[3][1]);
      AddWire(sink, "AntennaSteel",
        { x: pc.x, y, z: pc.z }, { x: pd.x, y: yNext, z: pd.z }, `${seed}:dh${k}`, 0.065);
    }
  }
  // 顶上的横担（挂天线用）
  const top = L(0, 0);
  sink.Add("AntennaSteel", PlaceGeometry(
    MakeBox(2.6, 0.11, 0.11, TILE_METERS.steel, `${seed}:arm`),
    { x: top.x, y: baseY + 0.4 + height + 0.2, z: top.z, ry }));
  // 三向拉线：0.72H 处下到三个地锚。没有拉线的塔看着像插在土里的一根铁棍
  const anchorY = baseY + 0.35;
  const hitchY = baseY + 0.4 + height * 0.72;
  for (let i = 0; i < 3; i += 1) {
    const a = ry + i * (Math.PI * 2 / 3) + 0.4;
    const ax = x + Math.cos(a) * guyRadius, az = z - Math.sin(a) * guyRadius;
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.36, 0.34, 0.36, TILE_METERS.stone, `${seed}:an${i}`),
      { x: ax, y: anchorY, z: az, ry }));
    AddWire(sink, "AntennaSteel",
      { x: top.x, y: hitchY, z: top.z }, { x: ax, y: anchorY + 0.2, z: az }, `${seed}:gy${i}`, 0.05);
  }
  sink.Solid(x, baseY + height / 2, z, half + 0.12, height / 2, half + 0.12, "prop", ry);
  return { x, z, top: baseY + 0.4 + height, y: baseY + 0.4 + height };
}

/** 明线电杆一根：木杆 + 双横担 + 瓷瓶。院里的杆路与出院那一段共用。 */
function AddLinePole(sink, { x, z, ry = 0, height = 7.5, baseY = 0, seed = "lp", arms = 2 }) {
  sink.Add("WoodBeam", PlaceGeometry(
    new THREE.CylinderGeometry(0.10, 0.15, height, 7),
    { x, y: baseY + height / 2, z }));
  for (let k = 0; k < arms; k += 1) {
    const y = baseY + height - 0.45 - k * 0.85;
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(1.7, 0.10, 0.10, TILE_METERS.wood, `${seed}:arm${k}`),
      { x, y, z, ry }));
    for (const s of [-1, 1]) {
      const px = x + Math.cos(ry) * s * 0.62, pz = z - Math.sin(ry) * s * 0.62;
      sink.Add("Stone", PlaceGeometry(
        MakeBox(0.13, 0.17, 0.13, TILE_METERS.stone, `${seed}:in${k}${s}`),
        { x: px, y: y + 0.13, z: pz, ry }));
    }
  }
  sink.Solid(x, baseY + height / 2, z, 0.17, height / 2, 0.17, "prop");
  return { x, z, y: baseY + height - 0.32, ry };
}

/** 两根电杆之间的两条明线（横担两端各一条）。 */
function LinkPoles(sink, a, b, seed) {
  for (const s of [-1, 1]) {
    const ax = a.x + Math.cos(a.ry) * s * 0.62, az = a.z - Math.sin(a.ry) * s * 0.62;
    const bx = b.x + Math.cos(b.ry) * s * 0.62, bz = b.z - Math.sin(b.ry) * s * 0.62;
    AddWire(sink, "AntennaSteel",
      { x: ax, y: a.y, z: az }, { x: bx, y: b.y, z: bz }, `${seed}:${s}`, 0.045);
  }
}

/**
 * 一排砖房：背面与两山是实墙，**正面（局部 +z）**是砖墩 + 开口的节奏。
 *
 * 一个函数同时供三种排屋用，差别全在参数上：
 *   机房   openRatio 0.40 / sillY 1.55 / bars true  —— 窄高铁栅窗，看不进去
 *   值班房 openRatio 0.40 / sillY 1.05 / bars false —— 普通木棂窗
 *   铺面   openRatio 0.58 / doorH 2.6 / 多个 doorBay —— 宽排门，临街那一种
 * 硬山顶一律 rafters:false：西关这几栋离玩家最近也有二十几米，
 * 一排 0.07 m 的椽头在这个距离上分不出来，却是每栋一千多个三角。
 */
function AddBrickRow(sink, {
  x, z, ry, width, depth, eaveY, ridgeY, seed, damage = 0, burnt = false,
  bays = 7, openRatio = 0.40, doorBays = [], doorH = 2.3,
  sillY = 1.05, winH = 1.35, bars = false, plaque = false,
  mat = "BrickWall", thickness = 0.36,
}) {
  const L = MakeFrame(x, z, ry);
  const brick = burnt ? "BrickWallSooty" : mat;
  const cellX = width / bays;
  const openW = Math.min(2.6, cellX * openRatio);
  const pierW = cellX - openW;
  const headY = Math.min(eaveY - 0.3, sillY + winH);

  // 背面 + 两山：实墙（鲁南规矩，对外一面不开窗）
  const back = L(0, -depth / 2);
  AddWall(sink, brick, {
    x: back.x, z: back.z, length: width, height: eaveY, thickness, ry,
    ruin: damage * 0.8, seed: `${seed}:back`, plinth: "Stone",
  });
  for (const s of [-1, 1]) {
    const p = L(s * width / 2, 0);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length: depth, height: eaveY, thickness, ry: ry + Math.PI / 2,
      ruin: damage * 0.8, seed: `${seed}:end${s}`, plinth: "Stone",
    });
  }

  // 正面：砖墩
  for (let k = 0; k <= bays; k += 1) {
    const end = (k === 0 || k === bays);
    const pw = end ? pierW / 2 + 0.2 : pierW;
    const lx = -width / 2 + cellX * k + (k === 0 ? pw / 2 : (k === bays ? -pw / 2 : 0));
    const p = L(lx, depth / 2);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length: pw, height: eaveY, thickness, ry,
      ruin: damage * 0.7, seed: `${seed}:pr${k}`, plinth: "Stone",
    });
  }

  // 正面：开口
  for (let k = 0; k < bays; k += 1) {
    const lx = -width / 2 + cellX * (k + 0.5);
    const p = L(lx, depth / 2);
    if (doorBays.indexOf(k) >= 0) {
      const dback = L(lx, depth / 2 - 0.19);
      sink.Add("Charred", PlaceGeometry(
        MakeBox(openW - 0.14, doorH, 0.14, TILE_METERS.stone, `${seed}:dk${k}`),
        { x: dback.x, y: doorH / 2, z: dback.z, ry }));
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(openW + 0.3, 0.19, 0.48, TILE_METERS.wood, `${seed}:dl${k}`),
        { x: p.x, y: doorH + 0.10, z: p.z, ry }));
      sink.Add(brick, PlaceGeometry(
        MakeBox(openW, Math.max(0.2, eaveY - doorH - 0.2), thickness, TILE_METERS.brick,
          `${seed}:dh${k}`, BRICK_UV_GRID),
        { x: p.x, y: doorH + 0.2 + Math.max(0.2, eaveY - doorH - 0.2) / 2, z: p.z, ry }));
      const sp = L(lx, depth / 2 + 0.34);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(openW + 0.7, 0.15, 0.72, TILE_METERS.stone, `${seed}:ds${k}`),
        { x: sp.x, y: 0.075, z: sp.z, ry }));
      // 门楣以上那块砖的碰撞（底面高过 1.6 m 净空线，门口照旧走得通）
      const dupH = Math.max(0.2, eaveY - doorH - 0.2);
      sink.Solid(p.x, doorH + 0.2 + dupH / 2, p.z, openW / 2, dupH / 2, thickness / 2, "wall", ry);
      continue;
    }
    // 窗：窗下墙 + 窗上过梁带 + 洞里的暗 + 木过梁 + 窗台石。
    // 这两条砖带过去一只碰撞盒都没有（碰撞全在砖墩上），于是每一开间
    // 从地坪到檐口整整一格是空的 —— 人从排屋外墙直接走进去。窗洞照旧留空。
    sink.Add(brick, PlaceGeometry(
      MakeBox(openW, sillY, thickness, TILE_METERS.brick, `${seed}:sb${k}`, BRICK_UV_GRID),
      { x: p.x, y: sillY / 2, z: p.z, ry }));
    sink.Solid(p.x, sillY / 2, p.z, openW / 2, sillY / 2, thickness / 2, "wall", ry);
    const upH = Math.max(0.2, eaveY - headY - 0.16);
    sink.Add(brick, PlaceGeometry(
      MakeBox(openW, upH, thickness, TILE_METERS.brick, `${seed}:hb${k}`, BRICK_UV_GRID),
      { x: p.x, y: headY + 0.16 + upH / 2, z: p.z, ry }));
    sink.Solid(p.x, headY + 0.16 + upH / 2, p.z, openW / 2, upH / 2, thickness / 2, "wall", ry);
    // 暗盒退到墙内侧：摆在墙心会把 0.10 的窗棂整个吞掉（批次A 教室窗的教训）
    const wback = L(lx, depth / 2 - 0.17);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(openW - 0.1, headY - sillY, 0.14, TILE_METERS.stone, `${seed}:wd${k}`),
      { x: wback.x, y: (sillY + headY) / 2, z: wback.z, ry }));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(openW + 0.28, 0.16, 0.44, TILE_METERS.wood, `${seed}:wl${k}`),
      { x: p.x, y: headY + 0.08, z: p.z, ry }));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(openW + 0.24, 0.12, 0.5, TILE_METERS.stone, `${seed}:ws${k}`),
      { x: p.x, y: sillY - 0.06, z: p.z, ry }));
    if (damage < 0.55) {
      const face = L(lx, depth / 2 + 0.04);
      const barCount = bars ? 3 : 2;
      for (let m = 1; m <= barCount; m += 1) {
        const off = (-0.5 + m / (barCount + 1)) * (openW - 0.14);
        const q = L(lx + off, depth / 2 + 0.04);
        sink.Add(bars ? "AntennaSteel" : "WoodBeam", PlaceGeometry(
          MakeBox(bars ? 0.05 : 0.07, headY - sillY, 0.09, TILE_METERS.wood, `${seed}:wv${k}${m}`),
          { x: q.x, y: (sillY + headY) / 2, z: q.z, ry }));
      }
      if (!bars) {
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(openW - 0.14, 0.07, 0.09, TILE_METERS.wood, `${seed}:wh${k}`),
          { x: face.x, y: sillY + (headY - sillY) * 0.55, z: face.z, ry }));
      }
    }
  }

  // 挂匾：空石板一块（字样无资料，不刻字）
  if (plaque) {
    const c = L(0, depth / 2 + 0.30);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(2.3, 0.62, 0.14, TILE_METERS.stone, `${seed}:plq`),
      { x: c.x, y: Math.min(eaveY - 0.45, doorH + 0.62), z: c.z, ry }));
  }

  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`,
    ruined: damage > 0.62, burnt, rafters: false,
  });
}

/**
 * 西关大街南侧的一间低矮关厢铺院。
 *
 * 这不是另一个可探索地标：沿街的关厢该读成一条连续的生活/货运带，而不是
 * 车站、通信院和师部之间漂着几只互不相干的方盒。因它站在 OUTER_PADS 之外，
 * 不能调用从 y=0 起砌的 AddWall / AddHardMountainRoof；四角取高并把石台埋入
 * 地形，才不会在铁路西侧的起伏里悬空。前脸面对北边的西关大街，排门均关闭，
 * 明确它是撤退时上了门板的铺院，不承诺每一间都可进入。
 */
function AddXiguanBeltCompound(host, {
  x, z, width, depth = 5.4, seed, damage = 0.2, straw = false,
}) {
  const sink = host.sink;
  const ry = Math.PI; // 局部 +z 指向世界北方，正面朝西关大街。
  const L = MakeFrame(x, z, ry);
  let baseY = -Infinity;
  for (const lx of [-width / 2, width / 2]) {
    for (const lz of [-depth / 2, depth / 2]) {
      const p = L(lx, lz);
      baseY = Math.max(baseY, host.OuterHeight(p.x, p.z));
    }
  }

  const floorY = baseY + 0.26;
  const eaveY = 2.58;
  const rise = depth * 0.25;
  const wallT = 0.38;
  const bays = Math.max(3, Math.round(width / 3.3));
  const bayW = width / bays;
  const wallMat = damage > 0.62 ? "BrickWallSooty" : "BrickWall";

  // 低石台把建筑钉进自然地面；两侧/后墙形成一个明确的、有围护的店院体量。
  sink.Add("Stone", PlaceGeometry(
    MakeBox(width + 0.72, 0.74, depth + 0.82, TILE_METERS.stone, `${seed}:podium`),
    { x, y: floorY - 0.37, z, ry }));
  sink.Solid(x, floorY - 0.37, z, (width + 0.72) / 2, 0.37, (depth + 0.82) / 2,
    "villageFoundation", ry);

  const back = L(0, -depth / 2 + wallT / 2);
  sink.Add(wallMat, PlaceGeometry(
    MakeBox(width, eaveY, wallT, TILE_METERS.brick, `${seed}:back`, BRICK_UV_GRID),
    { x: back.x, y: floorY + eaveY / 2, z: back.z, ry }));
  sink.Solid(back.x, floorY + eaveY / 2, back.z, width / 2, eaveY / 2, wallT / 2, "wall", ry);
  for (const side of [-1, 1]) {
    const p = L(side * (width / 2 - wallT / 2), 0);
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(wallT, eaveY, depth, TILE_METERS.brick, `${seed}:end${side}`, BRICK_UV_GRID),
      { x: p.x, y: floorY + eaveY / 2, z: p.z, ry }));
    sink.Solid(p.x, floorY + eaveY / 2, p.z, wallT / 2, eaveY / 2, depth / 2, "wall", ry);
  }

  // 前檐是排门而不是普通住宅门窗：一眼能读出西关的关门铺子。
  const frontLz = depth / 2 - 0.12;
  for (let i = 0; i <= bays; i += 1) {
    const p = L(-width / 2 + i * bayW, frontLz);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.16, eaveY, 0.16, TILE_METERS.wood, `${seed}:post${i}`),
      { x: p.x, y: floorY + eaveY / 2, z: p.z, ry }));
    sink.Solid(p.x, floorY + eaveY / 2, p.z, 0.12, eaveY / 2, 0.12, "villagePost", ry);
  }
  const lintel = L(0, frontLz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(width + 0.22, 0.22, 0.20, TILE_METERS.wood, `${seed}:lintel`),
    { x: lintel.x, y: floorY + eaveY - 0.11, z: lintel.z, ry }));
  for (let b = 0; b < bays; b += 1) {
    const p = L(-width / 2 + (b + 0.5) * bayW, frontLz - 0.035);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(bayW - 0.24, eaveY - 0.30, 0.07, TILE_METERS.wood, `${seed}:shutter${b}`),
      { x: p.x, y: floorY + (eaveY - 0.30) / 2, z: p.z, ry }));
    sink.Solid(p.x, floorY + (eaveY - 0.30) / 2, p.z, (bayW - 0.24) / 2,
      (eaveY - 0.30) / 2, 0.08, "door", ry);
  }

  // 一块无字招牌与硬山小瓦顶：可读成店，不虚构店名或住户。
  const sign = L(width / 2 - 0.46, depth / 2 + 0.40);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(0.42, 1.02, 0.06, TILE_METERS.wood, `${seed}:sign`),
    { x: sign.x, y: floorY + eaveY - 0.82, z: sign.z, ry }));
  const roofMat = straw ? "VillageStraw" : "RoofTile";
  const slope = Math.hypot(depth / 2, rise);
  const angle = Math.atan2(rise, depth / 2);
  for (const side of [-1, 1]) {
    const p = L(0, side * depth / 4);
    sink.Add(roofMat, PlaceGeometry(
      MakeBox(width + 0.78, straw ? 0.20 : 0.12, slope + 0.42,
        straw ? TILE_METERS.ground : TILE_METERS.roof, `${seed}:roof${side}`),
      { x: p.x, y: floorY + eaveY + rise / 2, z: p.z, ry, rx: side * angle }));
  }
  sink.Add(roofMat, PlaceGeometry(
    MakeBox(width + 0.82, straw ? 0.23 : 0.17, 0.32,
      straw ? TILE_METERS.ground : TILE_METERS.roof, `${seed}:ridge`),
    { x, y: floorY + eaveY + rise + 0.06, z, ry }));

  // 后院只用矮围墙收口：俯瞰能看见连续院落，但不额外制造可进入的任务空间。
  const yardBack = L(0, -depth / 2 - 2.15);
  sink.Add(wallMat, PlaceGeometry(
    MakeBox(width + 0.3, 1.18, 0.28, TILE_METERS.brick, `${seed}:yardBack`, BRICK_UV_GRID),
    { x: yardBack.x, y: floorY + 0.59, z: yardBack.z, ry }));
  sink.Solid(yardBack.x, floorY + 0.59, yardBack.z, (width + 0.3) / 2, 0.59, 0.14, "wall", ry);
}

/** 连续的西关街带由通信院这一段统一生成，避免分散 landmark 彼此重复占地。 */
function AddXiguanStreetBelt(host, ctx) {
  const damage = ctx.damage ?? 0.2;
  const compounds = [
    { x: -458, z: 10.7, width: 13.0, straw: true },
    { x: -442, z: 10.7, width: 14.0, straw: false },
    { x: -424, z: 10.7, width: 15.0, straw: false },
    { x: -406, z: 10.7, width: 13.0, straw: true },
  ];
  compounds.forEach((spec, index) => AddXiguanBeltCompound(host, {
    ...spec, damage, seed: `west:belt:${index}`,
  }));
}

/**
 * 院墙；南面（局部 +z，正面）三种收法：
 *   "gate" 留净宽 gateW 的口子（门楼由 AddYardGate 另建）
 *   "wall" 一堵到底
 *   "none" **不砌** —— 南面已经被临街的房子自己封住了。
 * 第一版没有 "none"，交易所的门脸前面横着一道 2.15 m 的院墙，
 * 出图上三个排门洞的下半截全被挡住，铺子进不去也看不见（B3 自查抓到）。
 */
function AddYardWall(host, {
  L, hw, lzN, lzS, ry, height, seed, damage, gateW = 0, south = "wall", mat = "BrickWall",
}) {
  const sink = host.sink;
  const lzC = (lzN + lzS) / 2;
  const depth = lzS - lzN;
  const sides = [
    { lx: 0, lz: lzN, len: hw * 2, rot: ry, gate: false },
    ...(south === "none" ? [] : [{ lx: 0, lz: lzS, len: hw * 2, rot: ry, gate: south === "gate" }]),
    { lx: -hw, lz: lzC, len: depth, rot: ry + Math.PI / 2, gate: false },
    { lx: hw, lz: lzC, len: depth, rot: ry + Math.PI / 2, gate: false },
  ];
  sides.forEach((s, i) => {
    const p = L(s.lx, s.lz);
    const hx = s.rot === ry ? s.len / 2 : 0.3;
    const hz = s.rot === ry ? 0.3 : s.len / 2;
    if (host.OnStreet(p.x, p.z, hx, hz)) return;
    if (!s.gate) {
      AddWall(sink, mat, {
        x: p.x, z: p.z, length: s.len, height, thickness: 0.36, ry: s.rot,
        ruin: damage * 0.8, seed: `${seed}:yw${i}`, plinth: "Stone", cope: true,
      });
      return;
    }
    const segLen = (s.len - gateW - 2.4) / 2;
    for (const side of [-1, 1]) {
      const q = L(s.lx + side * (gateW / 2 + 1.2 + segLen / 2), s.lz);
      AddWall(sink, mat, {
        x: q.x, z: q.z, length: segLen, height, thickness: 0.36, ry: s.rot,
        ruin: damage * 0.8, seed: `${seed}:yw${i}${side}`, plinth: "Stone", cope: true,
      });
    }
  });
}

/** 门楼：两根门垛 + 石门额 + 一道小瓦顶 + 有进深的门道。 */
function AddYardGate(sink, { L, lz, ry, gateW, seed, mat = "BrickWall" }) {
  const gh = 3.9;
  for (const side of [-1, 1]) {
    const p = L(side * (gateW / 2 + 0.55), lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(1.1, gh, 1.05, TILE_METERS.brick, `${seed}:pier${side}`, BRICK_UV_GRID),
      { x: p.x, y: gh / 2, z: p.z, ry }));
    sink.Solid(p.x, gh / 2, p.z, 0.55, gh / 2, 0.53, "wall", ry);
  }
  const c = L(0, lz);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(gateW + 2.2, 0.34, 0.92, TILE_METERS.stone, `${seed}:lin`),
    { x: c.x, y: 3.05, z: c.z, ry }));
  sink.Add(mat, PlaceGeometry(
    MakeBox(gateW + 2.2, gh - 3.22, 0.86, TILE_METERS.brick, `${seed}:up`, BRICK_UV_GRID),
    { x: c.x, y: 3.22 + (gh - 3.22) / 2, z: c.z, ry }));
  for (const s of [-1, 1]) {
    const rp = L(0, lz + s * 0.52);
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(gateW + 3.2, 0.12, 1.32, TILE_METERS.roof, `${seed}:rf${s}`),
      { x: rp.x, y: gh + 0.34, z: rp.z, ry, rx: s * 0.44 }));
  }
  sink.Add("RoofTile", PlaceGeometry(
    MakeBox(gateW + 3.3, 0.17, 0.28, TILE_METERS.roof, `${seed}:rdg`),
    { x: c.x, y: gh + 0.58, z: c.z, ry }));
  AddDoorReveal(sink, {
    x: c.x, z: c.z, ry: ry + Math.PI, openW: gateW, openH: 2.85, depth: 2.4,
    seed: `${seed}:rv`, jamb: false,
  });
}

// ===========================================================================
// 通讯队（军用通信院）
// ===========================================================================

export function BuildCommunications(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry || 0;
  const seed = `west:${f.id || "communications"}`;
  const damage = ctx.damage ?? 0.2;
  const burnt = !!ctx.burnt;
  const rnd = Mulberry32(HashString(`${seed}:yard`));
  const L = MakeFrame(f.x, f.z, ry);

  const hw = f.w / 2;                 // 15
  const lzN = -f.d / 2;               // -36
  const lzS = SouthEdge(f);           // 23.4：西关大街北沿
  const gateW = 3.4;

  // --- 院墙 + 大门（临西关大街）---
  AddYardWall(host, {
    L, hw, lzN, lzS, ry, height: 2.2, seed, damage, gateW, south: "gate",
  });
  AddYardGate(sink, { L, lz: lzS, ry, gateW, seed: `${seed}:gate` });

  // --- 天线场：院子北头一半的地全给它。四根格构杆 + 一副平顶（T 型）天线 ---
  // 「通信队」这三个字在画面上只能靠这个读出来：二十米的铁塔在一片 4 m 高的
  // 关厢平房里是唯一一处**竖直的东西**，从铁路上、从城墙上都一眼看见。
  const mastX = 9.5;
  const mastNZ = -29, mastSZ = -18;
  const mastNH = 20, mastSH = 17;
  const tops = {};
  for (const s of [-1, 1]) {
    const pn = L(s * mastX, mastNZ);
    AddLatticeMast(sink, {
      x: pn.x, z: pn.z, ry, height: mastNH, seed: `${seed}:mn${s}`,
    });
    const ps = L(s * mastX, mastSZ);
    AddLatticeMast(sink, {
      x: ps.x, z: ps.z, ry, height: mastSH, seed: `${seed}:ms${s}`,
    });
    tops[`n${s}`] = { x: pn.x, z: pn.z, y: mastNH + 0.2 };
    tops[`s${s}`] = { x: ps.x, z: ps.z, y: mastSH + 0.2 };
  }
  // 两道横向吊线（挂在南北两对杆之间）
  AddWire(sink, "AntennaSteel", tops["n-1"], tops["n1"], `${seed}:spanN`, 0.05);
  AddWire(sink, "AntennaSteel", tops["s-1"], tops["s1"], `${seed}:spanS`, 0.05);
  // 平顶天线：四条沿南北向的水平振子
  const flatLx = [-6.5, -2.2, 2.2, 6.5];
  for (let i = 0; i < flatLx.length; i += 1) {
    const a = L(flatLx[i], mastNZ), b = L(flatLx[i], mastSZ);
    AddWire(sink, "AntennaSteel",
      { x: a.x, y: mastNH + 0.05, z: a.z }, { x: b.x, y: mastSH + 0.05, z: b.z },
      `${seed}:flat${i}`, 0.045);
  }

  // --- 机房排屋（主机房 / 电台房）---
  const shedAZ = -7.5, shedAW = 24, shedAD = 9.0;
  const shedAFront = shedAZ + shedAD / 2;
  {
    const p = L(0, shedAZ);
    if (!host.OnStreet(p.x, p.z, shedAW / 2, shedAD / 2)) {
      AddBrickRow(sink, {
        x: p.x, z: p.z, ry, width: shedAW, depth: shedAD, eaveY: 3.6, ridgeY: 5.4,
        seed: `${seed}:shedA`, damage, burnt, bays: 7, openRatio: 0.40,
        doorBays: [3], doorH: 2.35, sillY: 1.55, winH: 1.35, bars: true,
      });
      // 屋面两只气窗：机房里是发热的机器，屋顶必须出气 —— 也顺手把 24 m 的
      // 长屋脊切出两个凸起，俯瞰时不至于是一条光板
      for (const s of [-1, 1]) {
        const v = L(s * 6.2, shedAZ);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(1.5, 0.62, 1.1, TILE_METERS.wood, `${seed}:vt${s}`),
          { x: v.x, y: 5.35, z: v.z, ry }));
        sink.Add("RoofTile", PlaceGeometry(
          MakeBox(1.9, 0.11, 1.5, TILE_METERS.roof, `${seed}:vtr${s}`),
          { x: v.x, y: 5.72, z: v.z, ry }));
      }
    }
  }
  // 引入架：天线下引线进机房的那一道木架（两柱 + 横梁 + 三只瓷瓶）。
  // 有了它，天上那几根线才有个落点，不然天线是"飘在院子上空的装饰"。
  {
    const leadZ = shedAZ - shedAD / 2 - 1.4;
    const frameY = 4.5;
    for (const s of [-1, 1]) {
      const p = L(s * 1.8, leadZ);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.16, frameY, 0.16, TILE_METERS.wood, `${seed}:ldp${s}`),
        { x: p.x, y: frameY / 2, z: p.z, ry }));
      sink.Solid(p.x, frameY / 2, p.z, 0.12, frameY / 2, 0.12, "prop", ry);
    }
    const c = L(0, leadZ);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(4.1, 0.15, 0.15, TILE_METERS.wood, `${seed}:ldb`),
      { x: c.x, y: frameY, z: c.z, ry }));
    for (let i = -1; i <= 1; i += 1) {
      const p = L(i * 1.3, leadZ);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(0.14, 0.2, 0.14, TILE_METERS.stone, `${seed}:ldi${i}`),
        { x: p.x, y: frameY + 0.16, z: p.z, ry }));
      // 下引线：平顶天线 → 瓷瓶 → 机房北墙
      const a = L(flatLx[i + 1], mastSZ);
      AddWire(sink, "AntennaSteel",
        { x: a.x, y: mastSH + 0.05, z: a.z }, { x: p.x, y: frameY + 0.24, z: p.z },
        `${seed}:down${i}`, 0.045);
      const w = L(i * 1.3, shedAZ - shedAD / 2 - 0.1);
      AddWire(sink, "AntennaSteel",
        { x: p.x, y: frameY + 0.24, z: p.z }, { x: w.x, y: 3.3, z: w.z },
        `${seed}:in${i}`, 0.04);
    }
  }

  // --- 值班 / 电池房排屋 ---
  const shedBZ = 8.0, shedBW = 21, shedBD = 7.2;
  {
    const p = L(0, shedBZ);
    if (!host.OnStreet(p.x, p.z, shedBW / 2, shedBD / 2)) {
      AddBrickRow(sink, {
        x: p.x, z: p.z, ry, width: shedBW, depth: shedBD, eaveY: 3.0, ridgeY: 4.5,
        seed: `${seed}:shedB`, damage, burnt, bays: 7, openRatio: 0.40,
        doorBays: [1, 5], doorH: 2.2, sillY: 1.05, winH: 1.3, bars: false,
      });
    }
  }

  // --- 长框两端的附属房 ---
  // 城防图把通讯队画成一整块南北向长院。主机房和天线只占中段的话，俯视仍像
  // “大空框里放了两个点”；北端补器材库，南端补值班宿舍，使整块用地成立。
  if (f.d >= 100) {
    for (const spec of [
      { lz: -58, width: Math.min(34, f.w - 8), depth: 9.0, bays: 7, tag: "northStore" },
      { lz: 40, width: Math.min(31, f.w - 10), depth: 8.2, bays: 7, tag: "southBillet" },
    ]) {
      const p = L(0, spec.lz);
      if (host.OnStreet(p.x, p.z, spec.width / 2, spec.depth / 2)) continue;
      AddBrickRow(sink, {
        x: p.x, z: p.z, ry, width: spec.width, depth: spec.depth,
        eaveY: 2.9, ridgeY: 4.45, seed: `${seed}:${spec.tag}`,
        damage: damage * 0.8, burnt, bays: spec.bays, openRatio: 0.34,
        doorBays: [1, 5], doorH: 2.2, sillY: 1.1, winH: 1.25, bars: false,
      });
    }
  }

  // --- 院内杆路：沿东墙一列明线电杆，出院沿西关大街东去（向城门方向）---
  const poleLx = 13.2;
  const inYard = [-13, 3, 20];
  let prev = null;
  for (let i = 0; i < inYard.length; i += 1) {
    const p = L(poleLx, inYard[i]);
    const node = AddLinePole(sink, {
      x: p.x, z: p.z, ry, height: 7.5, seed: `${seed}:pl${i}`,
    });
    if (prev) LinkPoles(sink, prev, node, `${seed}:ln${i}`);
    prev = node;
  }
  // 出院两根：站在西关大街北侧路肩上（世界 z ≈ -5.4，让开 6 m 路面 + 退让带）。
  // 这两根**在院外**，脚下不是 OUTER_PADS 的平地，必须压 host.OuterHeight。
  for (let i = 0; i < 2; i += 1) {
    const px = f.x + 19 + i * 17;
    const pz = WEST_STREET_KEEP.z - 5.4;
    const node = AddLinePole(sink, {
      x: px, z: pz, ry, height: 7.5, baseY: host.OuterHeight(px, pz),
      seed: `${seed}:po${i}`,
    });
    if (prev) LinkPoles(sink, prev, node, `${seed}:lo${i}`);
    prev = node;
  }

  // --- 前院：岗亭 + 电缆盘 + 备用杆料。空院子读不出"这里有人当值" ---
  {
    // 岗亭：四柱 + 半高砖围 + 小瓦顶
    const bp = L(-5.6, lzS - 3.0);
    const bw = 1.8, bd = 1.6, bh = 2.5;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = L(-5.6 + sx * (bw / 2 - 0.09), lzS - 3.0 + sz * (bd / 2 - 0.09));
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.14, bh, 0.14, TILE_METERS.wood, `${seed}:bt${sx}${sz}`),
          { x: p.x, y: bh / 2, z: p.z, ry }));
      }
    }
    for (const side of [[0, -bd / 2, bw, 0.22], [-bw / 2, 0, 0.22, bd], [bw / 2, 0, 0.22, bd]]) {
      const p = L(-5.6 + side[0], lzS - 3.0 + side[1]);
      sink.Add("BrickWall", PlaceGeometry(
        MakeBox(side[2], 1.05, side[3], TILE_METERS.brick, `${seed}:bw${side[0]}${side[1]}`, BRICK_UV_GRID),
        { x: p.x, y: 0.52, z: p.z, ry }));
    }
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(bw + 0.6, 0.14, bd + 0.6, TILE_METERS.roof, `${seed}:brf`),
      { x: bp.x, y: bh + 0.07, z: bp.z, ry }));
    sink.Solid(bp.x, bh / 2, bp.z, bw / 2, bh / 2, bd / 2, "prop", ry);

    // 电缆盘两只（立着的木盘）
    for (let i = 0; i < 2; i += 1) {
      const p = L(5.4 + i * 2.6, lzS - 6.5 - i * 1.6);
      const r = 0.82;
      sink.Add("WoodBeam", PlaceGeometry(
        new THREE.CylinderGeometry(r, r, 0.5, 12),
        { x: p.x, y: r, z: p.z, rz: Math.PI / 2, ry: ry + rnd() * 0.6 }));
      sink.Solid(p.x, r, p.z, 0.3, r, r, "prop", ry);
    }
    // 备用杆料：四根躺着的木杆
    for (let i = 0; i < 4; i += 1) {
      const p = L(-9.4 + (i % 2) * 0.34, lzS - 9.5 - Math.floor(i / 2) * 0.34);
      sink.Add("WoodBeam", PlaceGeometry(
        new THREE.CylinderGeometry(0.15, 0.19, 7.4, 6),
        { x: p.x, y: 0.17 + Math.floor(i / 2) * 0.32, z: p.z, ry, rz: Math.PI / 2 }));
    }
    sink.Solid(L(-9.2, lzS - 9.7).x, 0.35, L(-9.2, lzS - 9.7).z, 3.7, 0.35, 0.6, "prop", ry);
  }

  // 南侧关厢铺院现由 Data_WestSuburbBlocks 的整框生成器统一覆盖。这里不再追加
  // 四间 5 m 深的点状小铺，避免和完整街坊重叠。
}

// ===========================================================================
// 交易所
// ===========================================================================

/**
 * 拍卖堂：一间 18 m 通跨的单层大空间。
 *
 * 「大空间」在这个引擎里只有三条能读出来，而且必须三条一起上：
 *   ① 檐口 3.9 / 脊 6.7 —— 民居是檐 2.4—2.8、脊 3.5—4.2，它整整高出一截，
 *      在西关那片平房里是唯一压过所有屋脊的东西（车站站房才 12 m 进深）；
 *   ② 两侧长墙**没有一根隔墙**、只有连续高窗（窗台 2.45 m，人站在里面看不见外面，
 *      光却从头顶洒下来）—— 这是拍卖场/交易大厅与"几间打通的铺子"的分野；
 *   ③ 山墙沿进深一路升到脊：硬山两端的三角是它体量的侧影。
 * 里面摆一座石台与几条长凳就够了：交易所在 1938 年 3 月是什么样，无一字记载。
 */
function AddAuctionHall(host, {
  L, lz, ry, width, depth, eaveY, ridgeY, seed, damage, burnt,
}) {
  const sink = host.sink;
  const c = L(0, lz);
  const brick = burnt ? "BrickWallSooty" : "BrickWall";
  const bays = 7;
  const cellX = width / bays;
  const openW = Math.min(1.7, cellX * 0.58);
  const pierW = cellX - openW;
  const sillY = 2.45;
  const headY = 3.72;
  const doorBay = 3;
  const doorH = 3.0;
  const thickness = 0.42;

  for (const face of [-1, 1]) {                   // -1 = 后墙（北），+1 = 前墙（南，朝天井）
    for (let k = 0; k <= bays; k += 1) {
      const end = (k === 0 || k === bays);
      const pw = end ? pierW / 2 + 0.25 : pierW;
      const lx = -width / 2 + cellX * k + (k === 0 ? pw / 2 : (k === bays ? -pw / 2 : 0));
      const p = L(lx, lz + face * depth / 2);
      AddWall(sink, brick, {
        x: p.x, z: p.z, length: pw, height: eaveY, thickness, ry,
        ruin: damage * 0.7, seed: `${seed}:pr${face}${k}`, plinth: "Stone",
      });
    }
    for (let k = 0; k < bays; k += 1) {
      const lx = -width / 2 + cellX * (k + 0.5);
      const p = L(lx, lz + face * depth / 2);
      const isDoor = (face === 1 && k === doorBay);
      if (isDoor) {
        const dback = L(lx, lz + face * (depth / 2 - 0.2));
        sink.Add("Charred", PlaceGeometry(
          MakeBox(openW - 0.12, doorH, 0.14, TILE_METERS.stone, `${seed}:dk`),
          { x: dback.x, y: doorH / 2, z: dback.z, ry }));
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(openW + 0.34, 0.22, 0.54, TILE_METERS.wood, `${seed}:dl`),
          { x: p.x, y: doorH + 0.11, z: p.z, ry }));
        sink.Add(brick, PlaceGeometry(
          MakeBox(openW, eaveY - doorH - 0.22, thickness, TILE_METERS.brick,
            `${seed}:dh`, BRICK_UV_GRID),
          { x: p.x, y: doorH + 0.22 + (eaveY - doorH - 0.22) / 2, z: p.z, ry }));
        const sp = L(lx, lz + face * (depth / 2 + 0.4));
        sink.Add("Stone", PlaceGeometry(
          MakeBox(openW + 0.9, 0.16, 0.84, TILE_METERS.stone, `${seed}:ds`),
          { x: sp.x, y: 0.08, z: sp.z, ry }));
        sink.Solid(p.x, doorH + 0.22 + (eaveY - doorH - 0.22) / 2, p.z,
          openW / 2, (eaveY - doorH - 0.22) / 2, thickness / 2, "wall", ry);
        continue;
      }
      // 连续高窗。窗台以下 2.45 m 是实砖，过去却没有碰撞盒（碰撞全在砖墩上），
      // 于是人从拍卖堂外墙直接走进去；窗带那一段才是真洞。
      sink.Add(brick, PlaceGeometry(
        MakeBox(openW, sillY, thickness, TILE_METERS.brick, `${seed}:sb${face}${k}`, BRICK_UV_GRID),
        { x: p.x, y: sillY / 2, z: p.z, ry }));
      sink.Solid(p.x, sillY / 2, p.z, openW / 2, sillY / 2, thickness / 2, "wall", ry);
      sink.Add(brick, PlaceGeometry(
        MakeBox(openW, eaveY - headY, thickness, TILE_METERS.brick, `${seed}:hb${face}${k}`, BRICK_UV_GRID),
        { x: p.x, y: headY + (eaveY - headY) / 2, z: p.z, ry }));
      sink.Solid(p.x, headY + (eaveY - headY) / 2, p.z,
        openW / 2, (eaveY - headY) / 2, thickness / 2, "wall", ry);
      // 高窗**不塞暗盒**：机房/铺面的窗塞一片暗是为了挡住"一眼看穿封闭盒子"，
      // 而拍卖堂是走得进去的大空间，两侧同高的窗本来就该对穿。第一版照抄了暗盒，
      // 站在堂里抬头看是一排黑板子，那间屋子唯一的光源被自己糊死了（B3 自查抓到）。
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(openW + 0.3, 0.17, 0.5, TILE_METERS.wood, `${seed}:wl${face}${k}`),
        { x: p.x, y: headY + 0.085, z: p.z, ry }));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(openW + 0.26, 0.13, 0.56, TILE_METERS.stone, `${seed}:ws${face}${k}`),
        { x: p.x, y: sillY - 0.065, z: p.z, ry }));
      if (damage < 0.55) {
        for (let m = 1; m <= 2; m += 1) {
          const off = (-0.5 + m / 3) * (openW - 0.14);
          const q = L(lx + off, lz + face * (depth / 2 + 0.04));
          sink.Add("WoodBeam", PlaceGeometry(
            MakeBox(0.07, headY - sillY, 0.09, TILE_METERS.wood, `${seed}:wv${face}${k}${m}`),
            { x: q.x, y: (sillY + headY) / 2, z: q.z, ry }));
        }
      }
    }
  }

  // 硬山屋面（山墙由 AddHardMountainRoof 一并砌到脊）+ 山墙碰撞
  AddHardMountainRoof(sink, {
    x: c.x, z: c.z, width, depth, eaveY, ridgeY, ry,
    seed: `${seed}:roof`, ruined: damage > 0.62, burnt, rafters: false,
  });
  const gableH = eaveY + (ridgeY - eaveY) * 0.55;
  for (const s of [-1, 1]) {
    const p = L(s * (width / 2 + 0.15), lz);
    sink.Solid(p.x, gableH / 2, p.z, 0.15, gableH / 2, depth / 2, "wall", ry);
  }

  // 堂里：拍卖台 + 两列长凳。空盒子进去一眼看穿是布景
  const stage = L(0, lz - depth / 2 + 2.2);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(3.6, 0.62, 1.7, TILE_METERS.stone, `${seed}:stage`),
    { x: stage.x, y: 0.31, z: stage.z, ry }));
  sink.Solid(stage.x, 0.31, stage.z, 1.8, 0.31, 0.85, "prop", ry);
  for (let r = 0; r < 3; r += 1) {
    for (const s of [-1, 1]) {
      const p = L(s * 4.0, lz - depth / 2 + 5.0 + r * 1.9);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(5.6, 0.10, 0.36, TILE_METERS.wood, `${seed}:bench${r}${s}`),
        { x: p.x, y: 0.46, z: p.z, ry }));
      for (const u of [-1, 1]) {
        const q = L(s * 4.0 + u * 2.4, lz - depth / 2 + 5.0 + r * 1.9);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.12, 0.46, 0.32, TILE_METERS.wood, `${seed}:bl${r}${s}${u}`),
          { x: q.x, y: 0.23, z: q.z, ry }));
      }
    }
  }
}

export function BuildExchange(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry || 0;
  const seed = `west:${f.id || "exchange"}`;
  const damage = ctx.damage ?? 0.24;
  const burnt = !!ctx.burnt;
  const L = MakeFrame(f.x, f.z, ry);

  const hw = f.w / 2;                 // 12
  const lzN = -f.d / 2;               // -14
  const lzS = SouthEdge(f);           // 14（西关大街离这里 100 m 开外，不裁）

  // --- 侧墙 + 后墙。南面**不砌墙**：那一面是临街的铺面自己 ---
  AddYardWall(host, {
    L, hw, lzN, lzS, ry, height: 2.15, seed, damage, south: "none",
  });

  // --- 临街门脸：宽排门的铺面一排（局部 +z 朝街）---
  const faceD = 6.2;
  const faceZ = lzS - faceD / 2 - 0.4;
  const faceW = Math.min(f.w - 3.0, 21);
  // 门脸比地块窄 1.5 m，两端各补一小段墙把院子封严（不封的话从铺子侧面直接走进后院）
  for (const s of [-1, 1]) {
    const segLen = hw - faceW / 2;
    if (segLen < 0.6) break;
    const q = L(s * (faceW / 2 + segLen / 2), lzS);
    AddWall(sink, "BrickWall", {
      x: q.x, z: q.z, length: segLen, height: 2.15, thickness: 0.36, ry,
      ruin: damage * 0.8, seed: `${seed}:stub${s}`, plinth: "Stone", cope: true,
    });
  }
  {
    const p = L(0, faceZ);
    if (!host.OnStreet(p.x, p.z, faceW / 2, faceD / 2)) {
      AddBrickRow(sink, {
        x: p.x, z: p.z, ry, width: faceW, depth: faceD, eaveY: 3.5, ridgeY: 5.2,
        seed: `${seed}:front`, damage, burnt, bays: 5, openRatio: 0.58,
        doorBays: [1, 2, 3], doorH: 2.65, sillY: 0.95, winH: 1.45, bars: false,
        plaque: true,
      });
    }
    // 门前两级石阶：铺面比街面高两级，这是"店"不是"棚"
    for (let i = 0; i < 2; i += 1) {
      const sp = L(0, faceZ + faceD / 2 + 0.75 + i * 0.42);
      const h = 0.32 - i * 0.13;
      sink.Add("Stone", PlaceGeometry(
        MakeBox(faceW * 0.62, h, 0.46, TILE_METERS.stone, `${seed}:step${i}`),
        { x: sp.x, y: h / 2, z: sp.z, ry }));
    }
  }

  // --- 拍卖堂：门脸后面的大空间 ---
  const hallD = 12.4;
  const hallZ = faceZ - faceD / 2 - 3.6 - hallD / 2;
  const hallW = 18;
  {
    const p = L(0, hallZ);
    if (!host.OnStreet(p.x, p.z, hallW / 2, hallD / 2)) {
      AddAuctionHall(host, {
        L, lz: hallZ, ry, width: hallW, depth: hallD,
        eaveY: 3.9, ridgeY: 6.7, seed: `${seed}:hall`, damage, burnt,
      });
    }
  }

  // --- 天井：门脸与堂之间那 3.6 m。一条石板路 + 两口石槽（过秤前的堆货位）---
  {
    const pathZ = (faceZ - faceD / 2 + hallZ + hallD / 2) / 2;
    const p = L(0, pathZ);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(2.8, 0.12, 3.6, TILE_METERS.stone, `${seed}:path`),
      { x: p.x, y: -0.01, z: p.z, ry }));
    for (const s of [-1, 1]) {
      const q = L(s * 6.4, pathZ);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(1.5, 0.48, 0.9, TILE_METERS.stone, `${seed}:trough${s}`),
        { x: q.x, y: 0.24, z: q.z, ry }));
      sink.Solid(q.x, 0.24, q.z, 0.75, 0.24, 0.45, "prop", ry);
    }
  }

  // --- 后院：一杆大秤（两根立柱 + 一根横梁）。粮行/交易所的招牌家什 ---
  {
    const backZ = (lzN + hallZ - hallD / 2) / 2;
    const ph = 3.4;
    for (const s of [-1, 1]) {
      const p = L(s * 1.9, backZ);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.18, ph, 0.18, TILE_METERS.wood, `${seed}:sc${s}`),
        { x: p.x, y: ph / 2, z: p.z, ry }));
      sink.Solid(p.x, ph / 2, p.z, 0.14, ph / 2, 0.14, "prop", ry);
    }
    const c = L(0, backZ);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(4.4, 0.17, 0.17, TILE_METERS.wood, `${seed}:scb`),
      { x: c.x, y: ph, z: c.z, ry }));
    const hook = L(0, backZ);
    AddWire(sink, "AntennaSteel",
      { x: hook.x, y: ph - 0.06, z: hook.z }, { x: hook.x, y: 1.55, z: hook.z },
      `${seed}:schook`, 0.05);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(1.25, 0.11, 1.25, TILE_METERS.wood, `${seed}:scpan`),
      { x: hook.x, y: 1.5, z: hook.z, ry: ry + 0.3 }));
  }
}
