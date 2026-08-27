// 师部 / 团部（hq）与 营连驻地（billet）指挥部套件。工作包 A5 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// 「同族套件、换牌不换骨」——两个 kind 共用一条装配线 CommandCompound()：
//   院墙 + 门楼 + 影壁 → 门口沙袋哨位 + 旗杆 + 门侧番号木牌 + 电话杆入院 → 院内分区。
// 换的是牌（材质档次、门宽、墙高、旗杆高、有没有旗）与院内那一档「用途翼」：
//   hq     二门把院子切成前院（集散/旗杆/门房）与后院（作战室 + 两厢办公）；
//          94 m 的师部另有一座两层实心库楼（机要库）——129 师部原址是大当铺，
//          当铺库楼是这条街上唯一的两层砖体，它同时是俯瞰图里辨认师部的那个高点。
//   billet 没有二门、没有库楼，正房矮一档，两侧是长条库房翼，
//          外加马棚 / 草料垛 / 粪堆 / 碌碡这些「借住民宅的营连」痕迹。
//
// notPermanentGarrison：这里只做设施不摆兵。番号木牌是**净几何牌面**（不写字），
// 谁挂在门口由战斗时段数据决定，不由场景写死。
//
// 预算取向：外圈院墙走样条围墙 PCG（Script_YardWall，街上平视看得见的那一圈，
// 院内隔墙走本文件的 PartitionWall（4.2 m 一段而不是 0.85 m 一段，便宜十几倍）。
// 除旗面 PaintRed（hq）与草料 VillageStraw（billet）外，不往分区里引入新材质。
//
// —— 第二轮 WP-D1 增补：作战室（正房）可进入 ——
// hq 的正房本来就是 AddRoomBlock，明间那一间是**没有碰撞的门洞**（过木以上那段
// AddWall 传的是 solid:false），也就是说人早就走得进去，只是进去以后是一只空盒子。
// D1 只做屋里那点东西：墁地 + 梁架 + 地图桌（斜置图板）+ 野战电话与线盘 +
// 文件柜/木箱 + 油灯 + 墙上挂图位（净板无字）。三处 hq 共用一条装配线，
// 94/94/38 m 三种面宽按 opsW<12 分「全套 / 一桌一柜」两档。
// 三条硬约束：① 门轴与横向通道留空（探针 0—1.8 m 采样零阻挡）；
// ② 家具全走 sink（合批 + 破坏一致，tag 一律 furniture）；③ 屋里不加任何光源 ——
// 采光只有明间门洞与两侧格子窗，暗是效果不是 bug。

import * as THREE from "three";
import {
  AddGatehouse, AddRoomBlock, AddHardMountainRoof,
  AddSandbagEmplacement, AddPole, AddWell,
} from "./Script_World.mjs";
import {
  MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
import { AddYardWallRing } from "./Script_YardWall.mjs";
import {
  AddCourtyardLife, AddYardWear, AddStalkStack, AddManureHeap, AddStoneRoller,
} from "./Script_LivedInProps.mjs";

// ---------------------------------------------------------------------------
// 局部坐标：与 AddCompound / host.AddFeatureRoom 用同一套
//   局部 +x 沿院子的面宽，局部 +z 指向**大门那一面**（外）。
//   世界方向：+x → (cos, -sin)；+z → (-sin, -cos)。
// ---------------------------------------------------------------------------
function Local(f, ry, lx, lz) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return { x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz };
}

/** 大门朝外的单位向量（= 局部 +z 在世界里的指向）。 */
function Outward(ry) {
  return { x: -Math.sin(ry), z: -Math.cos(ry) };
}

/**
 * 院内隔墙。跟 AddWall 长得像，但一段 4.2 m 而不是 0.85 m。
 *
 * 这不是偷懒：AddWall 的 0.85 m 分段是为了让**街上平视**的墙面有逐段错开的砖纹
 * 与被削平的墙头；一堵 94 m 的院内二门墙按那个密度要 110 段 × 两只盒子，
 * 光它一堵就吃掉整个地标的三角预算，而玩家绝大多数时候是从院子这头看它一条线。
 */
function PartitionWall(sink, material, {
  x, z, ry = 0, length, height, thickness = 0.34, seed = "pw",
  ruin = 0, cope = true, tag = "wall", segMeters = 4.2,
}) {
  const rnd = Mulberry32(HashString(seed));
  const segs = Math.max(1, Math.round(length / segMeters));
  const segLen = length / segs;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const isBrick = String(material).startsWith("BrickWall");
  const tile = material === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick;
  for (let i = 0; i < segs; i += 1) {
    const h = Math.max(0.35, height * (1 - ruin * (0.25 + 0.7 * rnd())));
    const lx = -length / 2 + segLen * (i + 0.5);
    const px = x + cos * lx, pz = z - sin * lx;
    sink.Add(material, PlaceGeometry(
      MakeBox(segLen * 1.02, h, thickness, tile, `${seed}:s${i}`, isBrick ? BRICK_UV_GRID : null),
      { x: px, y: h / 2, z: pz, ry }));
    if (cope && ruin < 0.4) {
      sink.Add("RoofTile", PlaceGeometry(
        MakeBox(segLen * 1.04, 0.09, thickness + 0.16, TILE_METERS.roof, `${seed}:c${i}`),
        { x: px, y: h + 0.045, z: pz, ry }));
    }
    sink.Solid(px, h / 2, pz, segLen / 2, h / 2, thickness / 2, tag, ry);
  }
  sink.Cover(x, z, height, sin, cos);
}

/**
 * 摆一栋房：位置按院子的局部坐标给，朝向可以与院子成 90°（厢房/库房翼）。
 *
 * 不走 host.AddFeatureRoom 的原因只有一条：那个方法拿同一个 ry 既算位置又算朝向，
 * 想要「站在院子局部 (lx,lz)、但自己转 90°」的厢房就表达不出来
 *（照它的写法把 ry+90° 传进去，连位置一起转了，厢房会飞到院子外面）。
 * 侵街判定照抄它的语义，但用**旋转后的包围盒**，不是拿宽深当轴对齐半长。
 */
function Room(host, f, ctx, { lx, lz, ry, width, depth, ...spec }) {
  const p = Local(f, ctx.ry, lx, lz);
  const hx = Math.abs(Math.cos(ry)) * width / 2 + Math.abs(Math.sin(ry)) * depth / 2;
  const hz = Math.abs(Math.sin(ry)) * width / 2 + Math.abs(Math.cos(ry)) * depth / 2;
  if (host.OnStreet(p.x, p.z, hx, hz)) return false;
  AddRoomBlock(host.sink, { x: p.x, z: p.z, ry, width, depth, ...spec });
  return true;
}

/** 两点之间的一根细杆（拉线、电话线、斜撑）。走矩阵，不用欧拉角凑。 */
function AddStrut(sink, material, a, b, thickness, seed) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.2) return;
  const g = MakeBox(thickness, thickness, len, TILE_METERS.wood, seed);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx, dy, dz).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2),
    quat, new THREE.Vector3(1, 1, 1)));
  sink.Add(material, g);
}

// ---------------------------------------------------------------------------
// 套件构件
// ---------------------------------------------------------------------------

/** 院墙一圈 + 门楼 + 影壁。前墙（局部 +z）留门洞。 */
function Enclosure(host, f, ctx, o) {
  const sink = host.sink;
  const ry = ctx.ry;
  // 一圈院墙走样条围墙 PCG（Script_YardWall → Script_WallSpline）：
  // 四角由管线互搭，压顶跟着每一块自己的墙头落，墙身按分区实例化。
  AddYardWallRing(sink, {
    frame: (lx, lz) => Local(f, ry, lx, lz),
    hw: f.w / 2, hd: f.d / 2,
    preset: o.wallMat === "Adobe" ? "cityYardAdobe" : "landmarkYard",
    material: o.wallMat, height: o.wallH, thickness: 0.38,
    seed: `${o.seed}:yard`, ruin: ctx.damage * 0.75,
    gates: [{ side: "s", offset: 0, openW: o.gateOpenW }],
    plinth: o.plinth
      ? { material: o.plinth, height: 0.42, grow: 0.06, out: 0.07 } : null,
    cope: { material: "RoofTile", height: 0.09, grow: 0.05, out: 0.16, minH: 0.55 },
  });
  const g = Local(f, ry, 0, f.d / 2);
  AddGatehouse(sink, {
    x: g.x, z: g.z, ry, seed: `${o.seed}:gh`,
    damage: ctx.damage, burnt: ctx.burnt, openW: o.gateOpenW,
  });
  // 影壁：进门第一眼那片受光墙面，也是从街上透过门洞唯一看得见的亮面
  const sc = Local(f, ry, 0, f.d / 2 - 2.5);
  PartitionWall(sink, ctx.burnt ? "BrickWallSooty" : "BrickWall", {
    x: sc.x, z: sc.z, ry, length: o.gateOpenW + 1.4, height: 2.05, thickness: 0.3,
    seed: `${o.seed}:screen`, ruin: ctx.damage * 0.6, segMeters: 2.2,
  });
}

/**
 * 门侧番号木牌位：竖挂长条木牌 + 木框。**净几何，不写字**——
 * 挂谁的番号是战斗时段的事，场景只交代「这门口是挂牌子的门」。
 */
function UnitBoard(sink, f, ry, side, o) {
  const p = Local(f, ry, side * (o.gateOpenW / 2 + 0.95), f.d / 2);
  const out = Outward(ry);
  const bx = p.x + out.x * 0.30, bz = p.z + out.z * 0.30;
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(0.44, 1.62, 0.07, TILE_METERS.wood, `${o.seed}:bf${side}`),
    { x: bx, y: 1.62, z: bz, ry }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(0.34, 1.44, 0.05, TILE_METERS.wood, `${o.seed}:bp${side}`),
    { x: bx + out.x * 0.06, y: 1.62, z: bz + out.z * 0.06, ry }));
}

/** 旗杆：石座 + 杆；hq 挂旗（满地红），billet 只有杆。 */
function Flagpole(sink, x, z, ry, o) {
  const h = o.height;
  sink.Add("Stone", PlaceGeometry(
    MakeBox(1.20, 0.34, 1.20, TILE_METERS.stone, `${o.seed}:fb`),
    { x, y: 0.17, z, ry }));
  sink.Add("WoodBeam", PlaceGeometry(
    new THREE.CylinderGeometry(0.07, 0.12, h, 8), { x, y: 0.34 + h / 2, z }));
  sink.Solid(x, 0.17, z, 0.62, 0.17, 0.62, "prop", ry);
  sink.Solid(x, 0.34 + h / 2, z, 0.13, h / 2, 0.13, "prop", ry);
  if (!o.flag) return;
  // 旗面：顺着院子的面宽垂下来，略带一点垂坠。俯瞰图里这一小片红是「师部」二字。
  // FlagCloth 是主会话集成时加的旗布材质（PaintRed 蒙尘后偏粉，语义也是彩画不是旗）。
  sink.Add("FlagCloth", PlaceGeometry(
    MakeBox(2.30, 1.55, 0.05, TILE_METERS.wood, `${o.seed}:flag`),
    {
      x: x + Math.cos(ry) * 1.18, y: 0.34 + h - 1.05, z: z - Math.sin(ry) * 1.18,
      ry, rz: -0.06,
    }));
}

/** 电话杆入院：杆 + 地锚斜拉线（一根细木代钢索，不为一条线多开一种材质）。 */
function TelephonePole(host, f, ctx, o) {
  const sink = host.sink;
  const ry = ctx.ry;
  const p = Local(f, ry, o.lx, o.lz);
  if (host.OnStreet(p.x, p.z, 1.4, 1.4)) return null;
  AddPole(sink, { x: p.x, z: p.z, seed: `${o.seed}:pole`, height: o.height });
  const anchor = Local(f, ry, o.lx + o.anchor, o.lz);
  AddStrut(sink, "WoodBeam",
    { x: p.x, y: o.height - 0.75, z: p.z },
    { x: anchor.x, y: 0.16, z: anchor.z }, 0.055, `${o.seed}:guy`);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(0.34, 0.28, 0.34, TILE_METERS.stone, `${o.seed}:anch`),
    { x: anchor.x, y: 0.14, z: anchor.z, ry }));
  return { x: p.x, y: o.height - 0.5, z: p.z };
}

/**
 * 机要库：两层实心库楼。129 师部旧址是大当铺，当铺的库楼是这一带唯一的
 * 两层砖体 —— 这里把它留成**不可进入的实心块**（一层无窗、二层小方窗、腰檐分层），
 * 既是史实的一笔，也是俯瞰图上把师部从民居网格里挑出来的那个高点。
 */
function StrongRoom(host, f, ctx, o) {
  const sink = host.sink;
  const ry = ctx.ry;
  const p = Local(f, ry, o.lx, o.lz);
  const w = o.width, d = o.depth;
  if (host.OnStreet(p.x, p.z, w / 2 + 1.0, d / 2 + 1.0)) return;
  const mat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (lx, lz) => ({ x: p.x + cos * lx - sin * lz, z: p.z - sin * lx - cos * lz });
  const eave = o.eaveY;
  const ruin = ctx.damage > 0.6 ? 0.35 : 0;
  // 四面厚墙（0.55 m，库楼的墙比住人的房子厚一档）
  for (const [lx, lz, len, rot, key] of [
    [0, -d / 2, w, 0, "n"], [0, d / 2, w, 0, "s"],
    [-w / 2, 0, d, Math.PI / 2, "e"], [w / 2, 0, d, Math.PI / 2, "w"],
  ]) {
    const q = At(lx, lz);
    const h = eave * (1 - ruin * 0.5);
    sink.Add(mat, PlaceGeometry(
      MakeBox(len, h, 0.55, TILE_METERS.brick, `${o.seed}:sw${key}`, BRICK_UV_GRID),
      { x: q.x, y: h / 2, z: q.z, ry: ry + rot }));
  }
  sink.Add("Stone", PlaceGeometry(
    MakeBox(w + 0.5, 0.46, d + 0.5, TILE_METERS.stone, `${o.seed}:plinth`),
    { x: p.x, y: 0.23, z: p.z, ry }));
  // 腰檐：一圈挑出的瓦带，把立面读成「两层」而不是一堵高墙
  for (const [lx, lz, len, rot, key] of [
    [0, -d / 2, w + 0.7, 0, "n"], [0, d / 2, w + 0.7, 0, "s"],
    [-w / 2, 0, d + 0.7, Math.PI / 2, "e"], [w / 2, 0, d + 0.7, Math.PI / 2, "w"],
  ]) {
    const q = At(lx, lz);
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(len, 0.11, 0.78, TILE_METERS.roof, `${o.seed}:belt${key}`),
      { x: q.x, y: 3.35, z: q.z, ry: ry + rot }));
  }
  // 二层小方窗：库楼开高窗、开小窗，这是「里面锁着东西」的形制交代
  for (const face of [1, -1]) {
    for (let i = -1; i <= 1; i += 1) {
      const q = At(i * (w * 0.29), face * (d / 2 + 0.04));
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.62, 0.68, 0.14, TILE_METERS.wood, `${o.seed}:win${face}${i}`),
        { x: q.x, y: 4.75, z: q.z, ry }));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(0.80, 0.12, 0.20, TILE_METERS.stone, `${o.seed}:sill${face}${i}`),
        { x: q.x, y: 4.35, z: q.z, ry }));
    }
  }
  // 朝院一面的石框铁门（面朝局部 +z 的那一侧）
  const door = At(0, d / 2 + 0.05);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(1.85, 2.55, 0.22, TILE_METERS.stone, `${o.seed}:df`),
    { x: door.x, y: 1.30, z: door.z, ry }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(1.42, 2.16, 0.09, TILE_METERS.wood, `${o.seed}:dp`),
    { x: door.x, y: 1.14, z: door.z, ry }));
  AddHardMountainRoof(sink, {
    x: p.x, z: p.z, width: w, depth: d,
    eaveY: eave, ridgeY: eave + d * 0.5 * 0.52, ry,
    seed: `${o.seed}:roof`, ruined: ruin > 0, burnt: ctx.burnt, rafters: false,
  });
  // 实心块：库楼不可进入
  sink.Solid(p.x, eave / 2, p.z, w / 2, eave / 2, d / 2, "wall", ry);
  sink.Cover(p.x, p.z, eave, Math.sin(ry), Math.cos(ry));
}

/** 马棚：六根柱子 + 一面单坡瓦顶，三面敞开。借住民宅的营连都得给骡马搭一个。 */
function LeanTo(host, f, ctx, o) {
  const sink = host.sink;
  const ry = ctx.ry;
  const p = Local(f, ry, o.lx, o.lz);
  const w = o.width, d = o.depth;
  if (host.OnStreet(p.x, p.z, w / 2 + 0.8, d / 2 + 0.8)) return;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (lx, lz) => ({ x: p.x + cos * lx - sin * lz, z: p.z - sin * lx - cos * lz });
  const high = 2.95, low = 2.15;
  for (let i = 0; i < 3; i += 1) {
    const lx = (i - 1) * (w / 2);
    for (const side of [-1, 1]) {
      const q = At(lx, side * d / 2);
      const h = side < 0 ? high : low;
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.15, h, 0.15, TILE_METERS.wood, `${o.seed}:post${i}${side}`),
        { x: q.x, y: h / 2, z: q.z, ry }));
      sink.Solid(q.x, h / 2, q.z, 0.11, h / 2, 0.11, "villagePost", ry);
    }
  }
  // 后墙（靠院墙那一侧做实，牲口才挡得住风）
  const back = At(0, -d / 2);
  PartitionWall(sink, "Adobe", {
    x: back.x, z: back.z, ry, length: w, height: high - 0.35, thickness: 0.28,
    seed: `${o.seed}:back`, ruin: ctx.damage * 0.6, cope: false, segMeters: 3.4,
  });
  // 单坡顶
  const slope = Math.atan2(high - low, d);
  sink.Add("RoofTile", PlaceGeometry(
    MakeBox(w + 0.7, 0.12, Math.hypot(d, high - low) + 0.6, TILE_METERS.roof, `${o.seed}:roof`),
    { x: p.x, y: (high + low) / 2 + 0.12, z: p.z, ry, rx: slope }));
  // 拴马桩与食槽
  for (const side of [-1, 1]) {
    const q = At(side * w * 0.26, d * 0.18);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(1.55, 0.34, 0.40, TILE_METERS.wood, `${o.seed}:trough${side}`),
      { x: q.x, y: 0.30, z: q.z, ry }));
    sink.Solid(q.x, 0.30, q.z, 0.80, 0.30, 0.22, "furniture", ry);
  }
}

/**
 * 门口的沙袋哨位。
 *
 * 街是通路不是战位，所以压街就不摆；但**第一版直接 return 的写法是错的** ——
 * 街面净宽两侧各留 1.2 m 余量，门前 2.8 m 的哨位差 0.1 m 压进那条余量，
 * 于是六座院子的哨位一个都没生成（出图上门口空空如也，查了一轮才找到）。
 * 正确的做法是**往门口收**：贴着门脸摆得下就摆得下，收到贴墙还压街才真的放弃。
 */
function GatePost(host, f, ctx, o) {
  const ry = ctx.ry;
  const hx = o.length / 2 + 0.4, hz = o.depth / 2 + 0.4;
  for (const out of [o.out, o.out - 0.9, o.out - 1.7]) {
    if (out < 0.8) break;
    const p = Local(f, ry, o.lx, f.d / 2 + out);
    if (host.OnStreet(p.x, p.z, hx, hz)) continue;
    AddSandbagEmplacement(host.sink, {
      x: p.x, z: p.z, ry: ry + Math.PI, baseY: 0, seed: `${o.seed}:post`,
      length: o.length, depth: o.depth, height: 0.72,
    });
    return;
  }
}

// ---------------------------------------------------------------------------
// 作战室内部（WP-D1）
//
// 屋内局部坐标：原点＝正房中心，+x 沿面宽，+z 指向院子（＝开门那一面，facing:1）。
// 与院子的局部坐标同一套，所以一律经 Local(f, ry, o.lx + rx, o.lz + rz) 换算，
// 不自己叠第二套三角函数。注意 PlaceGeometry(ry) 的几何局部 +z 指向的是
// 屋内 -z（registry 头注坑①），所以对称件随便摆，**带 rx 倾角的件要反号**。
// ---------------------------------------------------------------------------

// （ClearDoorway 补丁已随 Script_World.AddRoomBlock 门洞残墙修复一并删除，WP-D1 §5-1。）
/** 敞开的一扇门板：合页在门垛上，往屋里推开 135°。 */
function OpenLeaf(sink, R, seed, o) {
  const a = 2.35;
  const hx = -0.62, hz = o.depth / 2 - 0.09;
  const p = R.At(hx + Math.cos(a) * 0.31, hz - Math.sin(a) * 0.31);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(0.62, 2.10, 0.055, TILE_METERS.wood, `${seed}:leaf`),
    { x: p.x, y: 1.06, z: p.z, ry: R.ry - a }));
}

/** 屋内坐标框：ix/iz 是净空半宽半深（墙厚 0.36，再留 0.18 抹角余量）。 */
function RoomFrame(f, ctx, o) {
  const ry = ctx.ry;
  return {
    ry,
    ix: o.width / 2 - 0.36,
    iz: o.depth / 2 - 0.36,
    At: (rx, rz) => Local(f, ry, o.lx + rx, o.lz + rz),
  };
}

/** 四腿一面的桌案。地图桌与靠墙条案是同一件，换的只是长宽比。 */
function PlainTable(sink, R, seed, { rx, rz, w, d, topY = 0.78 }) {
  const th = 0.075;
  const p = R.At(rx, rz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(w, th, d, TILE_METERS.wood, `${seed}:top`),
    { x: p.x, y: topY + th / 2, z: p.z, ry: R.ry }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const q = R.At(rx + sx * (w / 2 - 0.17), rz + sz * (d / 2 - 0.15));
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.10, topY, 0.10, TILE_METERS.wood, `${seed}:lg${sx}${sz}`),
        { x: q.x, y: topY / 2, z: q.z, ry: R.ry }));
    }
    const s = R.At(rx + sx * (w / 2 - 0.17), rz);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.07, 0.07, Math.max(0.2, d - 0.42), TILE_METERS.wood, `${seed}:rail${sx}`),
      { x: s.x, y: 0.26, z: s.z, ry: R.ry }));
  }
  sink.Solid(p.x, (topY + th) / 2, p.z, w / 2, (topY + th) / 2, d / 2, "furniture", R.ry);
  return topY + th;
}

/**
 * 地图桌：桌案 + 斜置的大图板。
 *
 * 图板不平铺而是后缘垫高 0.26 m —— 平铺的图板从门口平视只剩一条缝，
 * 立起来一档，进门第一眼就能读到「这是摊着图的桌子」。图面是**净纸面**，
 * 不画任何图形：滕县城防图长什么样没有可靠依据，画上去就是编。
 */
function MapTable(sink, R, seed, { rx, rz, w, d, boardF, paper = true }) {
  const topY = PlainTable(sink, R, seed, { rx, rz, w, d });
  const bw = w * boardF, bd = d * 0.84, rise = 0.26;
  const tilt = Math.atan2(rise, bd);
  const by = topY + 0.05 + rise * 0.5;
  // rx 取负号：几何局部 +z 是屋内 -z，负号才把**后缘**抬起来
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(bw, 0.05, bd, TILE_METERS.wood, `${seed}:board`),
    { x: R.At(rx, rz).x, y: by, z: R.At(rx, rz).z, ry: R.ry, rx: -tilt }));
  if (paper) {
    // 两张错开的图纸而不是一张满板：一张满铺的净纸面在出图上读作「一块板」，
    // 压着半张小的、再横一把压尺，才读作「摊在图板上的图」
    const sheets = [
      { w: bw - 0.13, d: bd - 0.11, dx: 0, off: 0.040 },
      { w: bw * 0.46, d: bd * 0.62, dx: bw * 0.22, off: 0.062 },
    ];
    for (let i = 0; i < sheets.length; i += 1) {
      const s = sheets[i];
      const sp = R.At(rx + s.dx, rz + Math.sin(tilt) * s.off);
      sink.Add("HouseholdCloth", PlaceGeometry(
        MakeBox(s.w, 0.02, s.d, TILE_METERS.wood, `${seed}:sheet${i}`),
        { x: sp.x, y: by + Math.cos(tilt) * s.off, z: sp.z, ry: R.ry, rx: -tilt }));
    }
    const rp = R.At(rx - bw * 0.22, rz + Math.sin(tilt) * 0.075);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.035, 0.018, bd * 0.64, TILE_METERS.wood, `${seed}:rule`),
      { x: rp.x, y: by + Math.cos(tilt) * 0.075, z: rp.z, ry: R.ry, rx: -tilt }));
    // 压角的两块镇石：图纸在过堂风里不许卷边
    for (const s of [-1, 1]) {
      const w8 = R.At(rx + s * (bw / 2 - 0.10), rz + Math.sin(tilt) * 0.075 + s * 0.0);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(0.10, 0.045, 0.16, TILE_METERS.stone, `${seed}:weight${s}`),
        { x: w8.x, y: by + Math.cos(tilt) * 0.075, z: w8.z, ry: R.ry, rx: -tilt }));
    }
  }
  return topY;
}

/** 卷起来的图纸：横躺的两卷。 */
function PaperRolls(sink, R, seed, { rx, rz, y, len = 0.62 }) {
  for (let i = 0; i < 2; i += 1) {
    const p = R.At(rx, rz + i * 0.10);
    sink.Add("HouseholdCloth", PlaceGeometry(
      new THREE.CylinderGeometry(0.042, 0.042, len, 8),
      { x: p.x, y: y + 0.045 + i * 0.075, z: p.z, ry: R.ry, rz: Math.PI / 2 }));
  }
}

/**
 * 油灯。屋里不许加光源，所以「点着灯」这件事全靠玻璃罩那一小片亮材质
 *（Stone 是本套里最亮的登记材质）——它在暗屋子里是唯一读得出的高光点。
 */
function OilLamp(sink, R, seed, { rx, rz, y }) {
  const p = R.At(rx, rz);
  sink.Add("IronPlate", PlaceGeometry(
    new THREE.CylinderGeometry(0.055, 0.085, 0.05, 8), { x: p.x, y: y + 0.025, z: p.z }));
  sink.Add("IronPlate", PlaceGeometry(
    MakeBox(0.05, 0.10, 0.05, TILE_METERS.wood, `${seed}:stem`),
    { x: p.x, y: y + 0.10, z: p.z, ry: R.ry }));
  sink.Add("Stone", PlaceGeometry(
    new THREE.CylinderGeometry(0.045, 0.062, 0.17, 8), { x: p.x, y: y + 0.24, z: p.z }));
  sink.Add("IronPlate", PlaceGeometry(
    new THREE.CylinderGeometry(0.038, 0.038, 0.03, 8), { x: p.x, y: y + 0.34, z: p.z }));
}

/** 野战电话：木壳 + 侧面摇把 + 横搁在机盖上的听筒。返回接线柱的世界坐标。 */
function FieldPhone(sink, R, seed, { rx, rz, y }) {
  const w = 0.30, h = 0.22, d = 0.17;
  const p = R.At(rx, rz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(w, h, d, TILE_METERS.wood, `${seed}:box`),
    { x: p.x, y: y + h / 2, z: p.z, ry: R.ry }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(w + 0.03, 0.03, d + 0.03, TILE_METERS.wood, `${seed}:lid`),
    { x: p.x, y: y + h + 0.015, z: p.z, ry: R.ry }));
  const c = R.At(rx + w * 0.56, rz);
  sink.Add("IronPlate", PlaceGeometry(
    MakeBox(0.07, 0.035, 0.035, TILE_METERS.wood, `${seed}:crank`),
    { x: c.x, y: y + h * 0.55, z: c.z, ry: R.ry }));
  const c2 = R.At(rx + w * 0.56 + 0.03, rz + 0.07);
  sink.Add("IronPlate", PlaceGeometry(
    MakeBox(0.03, 0.03, 0.10, TILE_METERS.wood, `${seed}:handle`),
    { x: c2.x, y: y + h * 0.55, z: c2.z, ry: R.ry }));
  sink.Add("IronPlate", PlaceGeometry(
    MakeBox(0.235, 0.05, 0.05, TILE_METERS.wood, `${seed}:hs`),
    { x: p.x, y: y + h + 0.055, z: p.z, ry: R.ry }));
  for (const s of [-1, 1]) {
    const e = R.At(rx + s * 0.115, rz);
    sink.Add("IronPlate", PlaceGeometry(
      new THREE.CylinderGeometry(0.045, 0.045, 0.035, 8),
      { x: e.x, y: y + h + 0.055, z: e.z, ry: R.ry, rz: Math.PI / 2 }));
  }
  sink.Solid(p.x, y + h / 2, p.z, w / 2, h / 2, d / 2, "furniture", R.ry);
  return { x: p.x, y: y + h + 0.09, z: p.z };
}

/** 线盘：两片木辐板夹一卷线，外加一副提架。有线电话的另一半在这儿。 */
function CableDrum(sink, R, seed, { rx, rz }) {
  const r = 0.26, y = r + 0.05;
  const p = R.At(rx, rz);
  for (const s of [-1, 1]) {
    const q = R.At(rx + s * 0.12, rz);
    sink.Add("WoodBeam", PlaceGeometry(
      new THREE.CylinderGeometry(r, r, 0.035, 10),
      { x: q.x, y, z: q.z, ry: R.ry, rz: Math.PI / 2 }));
  }
  sink.Add("IronPlate", PlaceGeometry(
    new THREE.CylinderGeometry(r - 0.09, r - 0.09, 0.20, 10),
    { x: p.x, y, z: p.z, ry: R.ry, rz: Math.PI / 2 }));
  const barY = y + 0.17;
  for (const s of [-1, 1]) {
    const q = R.At(rx + s * 0.18, rz);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.05, barY, 0.05, TILE_METERS.wood, `${seed}:frame${s}`),
      { x: q.x, y: barY / 2, z: q.z, ry: R.ry }));
  }
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(0.44, 0.05, 0.05, TILE_METERS.wood, `${seed}:bar`),
    { x: p.x, y: barY, z: p.z, ry: R.ry }));
  sink.Solid(p.x, barY / 2, p.z, 0.24, barY / 2, r, "furniture", R.ry);
}

/** 文件柜：木柜身 + 双开门 + 柜顶线脚。face 是开门朝向（屋内 z 的符号）。 */
function FileCabinet(sink, R, seed, { rx, rz, w, h, d, face = 1 }) {
  const p = R.At(rx, rz);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(w + 0.04, 0.12, d + 0.04, TILE_METERS.wood, `${seed}:plinth`),
    { x: p.x, y: 0.06, z: p.z, ry: R.ry }));
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(w, h - 0.22, d, TILE_METERS.wood, `${seed}:body`),
    { x: p.x, y: 0.12 + (h - 0.22) / 2, z: p.z, ry: R.ry }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(w + 0.06, 0.10, d + 0.06, TILE_METERS.wood, `${seed}:cap`),
    { x: p.x, y: h - 0.05, z: p.z, ry: R.ry }));
  for (const s of [-1, 1]) {
    const q = R.At(rx + s * (w / 4), rz + face * (d / 2 + 0.02));
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(w / 2 - 0.05, h - 0.52, 0.03, TILE_METERS.wood, `${seed}:door${s}`),
      { x: q.x, y: 0.16 + (h - 0.52) / 2, z: q.z, ry: R.ry }));
    const k = R.At(rx + s * 0.07, rz + face * (d / 2 + 0.05));
    sink.Add("IronPlate", PlaceGeometry(
      MakeBox(0.045, 0.11, 0.03, TILE_METERS.wood, `${seed}:pull${s}`),
      { x: k.x, y: h * 0.55, z: k.z, ry: R.ry }));
  }
  sink.Solid(p.x, h / 2, p.z, w / 2, h / 2, d / 2, "furniture", R.ry);
}

/** 木箱：装文卷与器材的方箱，箱盖压边 + 两道箍条。 */
function WoodCrate(sink, R, seed, { rx, rz, y = 0, s = 1, spin = 0 }) {
  const w = 0.78 * s, h = 0.46 * s, d = 0.54 * s;
  const rot = R.ry + spin;
  const p = R.At(rx, rz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(w, h, d, TILE_METERS.wood, `${seed}:body`),
    { x: p.x, y: y + h / 2, z: p.z, ry: rot }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(w + 0.03, 0.05, d + 0.03, TILE_METERS.wood, `${seed}:lid`),
    { x: p.x, y: y + h + 0.02, z: p.z, ry: rot }));
  for (const s2 of [-1, 1]) {
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(0.06, h - 0.06, d + 0.02, TILE_METERS.wood, `${seed}:hoop${s2}`),
      {
        x: p.x + Math.cos(rot) * s2 * (w * 0.32),
        y: y + h / 2, z: p.z - Math.sin(rot) * s2 * (w * 0.32), ry: rot,
      }));
  }
  sink.Solid(p.x, y + h / 2, p.z, w / 2, h / 2 + y / 2, d / 2, "furniture", rot);
}

/**
 * 墙上的挂图位：上下木轴 + 净纸面。
 * **不写字、不画线** —— 挂的是哪张图由战斗时段决定，场景只交代「这面墙是挂图的墙」，
 * 和门口那两块番号木牌是同一条口径。
 */
function WallChart(sink, R, seed, { rx, rz, w, h, yc, face = 1 }) {
  const p = R.At(rx, rz);
  sink.Add("HouseholdCloth", PlaceGeometry(
    MakeBox(w, h, 0.02, TILE_METERS.wood, `${seed}:sheet`),
    { x: p.x, y: yc, z: p.z, ry: R.ry }));
  const q = R.At(rx, rz + face * 0.02);
  for (const s of [-1, 1]) {
    sink.Add("WoodBeam", PlaceGeometry(
      new THREE.CylinderGeometry(0.028, 0.028, w + 0.14, 8),
      { x: q.x, y: yc + s * (h / 2 + 0.02), z: q.z, ry: R.ry, rz: Math.PI / 2 }));
  }
  for (const s of [-1, 1]) {
    const e = R.At(rx + s * (w / 2 + 0.03), rz + face * 0.015);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.04, h, 0.025, TILE_METERS.wood, `${seed}:edge${s}`),
      { x: e.x, y: yc, z: e.z, ry: R.ry }));
  }
}

/**
 * 屋里那根电话线：机身 → 贴着山墙拉到墙根 → 顺墙爬到檐下 → 走到明间上方。
 *
 * 走三折而不是从桌面斜拉一根到檐口：斜拉那根会横穿屋子中间，
 * 既不像有线电话的走法，也正好挂在人眼高度上。三折全程贴墙贴檐，
 * 落点在明间正上方，和院里那根从电话杆落到檐口的线接得上。
 */
function PhoneLine(sink, R, seed, o, from, wallX, wallZ) {
  const top = o.eaveY - 0.30;
  const a = R.At(wallX, wallZ);
  AddStrut(sink, "IronPlate", from, { x: a.x, y: from.y, z: a.z }, 0.03, `${seed}:a`);
  AddStrut(sink, "IronPlate", { x: a.x, y: from.y, z: a.z }, { x: a.x, y: top, z: a.z },
    0.03, `${seed}:b`);
  const b = R.At(0, R.iz + 0.08);
  AddStrut(sink, "IronPlate", { x: a.x, y: top, z: a.z }, { x: b.x, y: top, z: b.z },
    0.03, `${seed}:c`);
}

/**
 * 条凳。围着地图桌的人得有地方坐，但不摆在门轴与横向通道上。
 *
 * 做成两块板腿的长条凳而不是四条腿的方凳：出图取证过一版方凳 —— 三张凳子
 * 十二根细腿从桌子底下透出来，读成一片脚手架。板腿一眼就是凳子。
 */
function Bench(sink, R, seed, { rx, rz, len = 1.10 }) {
  const sy = 0.46, d = 0.30;
  const p = R.At(rx, rz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(len, 0.06, d, TILE_METERS.wood, `${seed}:seat`),
    { x: p.x, y: sy, z: p.z, ry: R.ry }));
  for (const s of [-1, 1]) {
    const q = R.At(rx + s * (len / 2 - 0.11), rz);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.06, sy - 0.03, d - 0.05, TILE_METERS.wood, `${seed}:leg${s}`),
      { x: q.x, y: (sy - 0.03) / 2, z: q.z, ry: R.ry }));
  }
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(len - 0.30, 0.05, 0.05, TILE_METERS.wood, `${seed}:rail`),
    { x: p.x, y: 0.20, z: p.z, ry: R.ry }));
  sink.Solid(p.x, sy / 2, p.z, len / 2, sy / 2, d / 2, "furniture", R.ry);
}

/** 粗陶水缸 + 一只搪瓷缸子：屋里有人待着的最便宜一笔。 */
function WaterCrock(sink, R, seed, { rx, rz }) {
  const p = R.At(rx, rz);
  sink.Add("HouseholdCeramic", PlaceGeometry(
    new THREE.CylinderGeometry(0.30, 0.24, 0.62, 10), { x: p.x, y: 0.31, z: p.z }));
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(0.56, 0.03, 0.56, TILE_METERS.wood, `${seed}:lid`),
    { x: p.x, y: 0.635, z: p.z, ry: R.ry }));
  sink.Solid(p.x, 0.31, p.z, 0.30, 0.31, 0.30, "householdCrock", R.ry);
}

/** 桌上的搪瓷缸子。 */
function TinMug(sink, R, seed, { rx, rz, y }) {
  const p = R.At(rx, rz);
  sink.Add("HouseholdCeramic", PlaceGeometry(
    new THREE.CylinderGeometry(0.045, 0.042, 0.11, 8), { x: p.x, y: y + 0.055, z: p.z }));
  sink.Add("HouseholdCeramic", PlaceGeometry(
    MakeBox(0.03, 0.05, 0.02, TILE_METERS.wood, `${seed}:ear`),
    { x: p.x + Math.cos(R.ry) * 0.055, y: y + 0.06, z: p.z - Math.sin(R.ry) * 0.055, ry: R.ry }));
}

/**
 * 屋架：几根横梁 + 三道檩。
 *
 * 硬山房从屋里抬头看见的是梁架而不是瓦背；没有这几根，正房内部就是
 * 一只五米高的空砖盒子，比不做还假。全是无碰撞的装饰件（人打不到、也撞不到）。
 */
function RoofFrame(sink, R, seed, o) {
  const spans = Math.max(2, Math.round(o.width / 3.6));
  for (let i = 0; i <= spans; i += 1) {
    const rx = -o.width / 2 + (o.width / spans) * i;
    if (Math.abs(rx) > o.width / 2 - 0.35) continue;
    const p = R.At(rx, 0);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.16, 0.20, o.depth - 0.30, TILE_METERS.wood, `${seed}:tie${i}`),
      { x: p.x, y: o.eaveY - 0.14, z: p.z, ry: R.ry }));
  }
  // 前后两道檐檩：形制上是硬山搁檩的檩条，功能上顺手封住墙头。
  // AddWall 的 ruin 会把墙头逐段削低（damage 0.14 也有 0.4 m 的起伏），
  // 屋面又是从 eaveY 起坡，于是墙头与瓦面之间漏出一排刺眼的天光条 —— 这道檩挡住它。
  for (const s of [-1, 1]) {
    const p = R.At(0, s * (o.depth / 2 - 0.15));
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(o.width - 0.24, 0.46, 0.19, TILE_METERS.wood, `${seed}:eave${s}`),
      { x: p.x, y: o.eaveY - 0.20, z: p.z, ry: R.ry }));
  }
  const rise = o.ridgeY - o.eaveY;
  // 两道下金檩压在坡面之下 0.12 m —— 正好贴着屋面而不刺穿瓦背
  const purlins = [
    { rz: 0, y: o.ridgeY - 0.18 },
    { rz: -o.depth * 0.25, y: o.eaveY + rise * 0.5 - 0.12 },
    { rz: o.depth * 0.25, y: o.eaveY + rise * 0.5 - 0.12 },
  ];
  for (let i = 0; i < purlins.length; i += 1) {
    const p = R.At(0, purlins[i].rz);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(o.width - 0.24, 0.15, 0.15, TILE_METERS.wood, `${seed}:pur${i}`),
      { x: p.x, y: purlins[i].y, z: p.z, ry: R.ry }));
  }
}

/**
 * 作战室内部装配线。三处 hq 共用，按面宽分两档：
 *   full（opsW ≥ 12，94 m 的两座师部）—— 地图桌 + 靠墙条案（电话/图卷）+ 两只文件柜
 *                                      + 三只木箱 + 线盘 + 四张方凳 + 挂图位；
 *   lean（38 m 的团部）              —— 一桌一柜：地图桌（电话与油灯并排搁在桌面）
 *                                      + 一只文件柜 + 两只木箱 + 线盘 + 两张凳。
 *
 * 摆位的唯一硬规矩：门轴（rx=0，从门口进来那条）与屋内一条横向通道全程留空。
 * 家具一律靠后墙 / 靠山墙 / 压在桌子后侧，前半间是空的 —— 这既是通行需要，
 * 也符合作战室的实情（要站得下一圈人围着图看）。
 */
function OpsRoomInterior(host, f, ctx, o) {
  const sink = host.sink;
  // （门洞残墙的根因已在 Script_World.AddRoomBlock 修掉，无需再清理门洞。）
  if (ctx.damage > 0.62) return;      // 屋顶已塌，屋里是瓦砾堆，摆家具反而假
  const R = RoomFrame(f, ctx, o);
  OpenLeaf(sink, R, o.seed, o);
  const seed = o.seed;
  const lean = o.width < 12;
  const worn = ctx.damage > 0.42;     // 打得厉害就没人再挂图点灯了

  // 墁地：一层青砖。缺了它，从门口看进去是屋外的土地贴图直穿进来
  const fl = R.At(0, 0);
  sink.Add(ctx.burnt ? "BrickWallSooty" : "BrickWall", PlaceGeometry(
    MakeBox(o.width - 0.5, 0.12, o.depth - 0.5, TILE_METERS.brick, `${seed}:floor`, BRICK_UV_GRID),
    { x: fl.x, y: -0.04, z: fl.z, ry: R.ry }));

  RoofFrame(sink, R, `${seed}:rf`, o);

  // —— 地图桌：屋子的中心，但压在后半间，前半间留给通行 ——
  const tw = lean ? 1.90 : 3.50;
  const td = lean ? 1.05 : 1.70;
  const trz = -R.iz * 0.42;
  const topY = MapTable(sink, R, `${seed}:mt`, {
    rx: 0, rz: trz, w: tw, d: td, boardF: lean ? 0.50 : 0.62, paper: !worn,
  });
  // —— 墙上挂图位：正对着门的那面后墙，进门第一眼 ——
  if (!worn) {
    WallChart(sink, R, `${seed}:chart`, {
      rx: 0, rz: -(R.iz + 0.15), w: lean ? 1.75 : 2.90, h: lean ? 1.35 : 1.75,
      yc: lean ? 1.62 : 1.84, face: 1,
    });
  }

  if (lean) {
    // 团部：一桌一柜。电话与油灯并排搁在图板两侧的桌面上
    if (!worn) OilLamp(sink, R, `${seed}:lamp`, { rx: 0.70, rz: trz + 0.28, y: topY });
    const wire = FieldPhone(sink, R, `${seed}:tel`, { rx: -0.70, rz: trz + 0.26, y: topY });
    PhoneLine(sink, R, `${seed}:wire`, o, wire, -(R.ix - 0.10), trz + 0.26);
    // 线盘塞进 +x 后角：绕桌那条通道（rx≈±1.6）与横向通道都不许压
    CableDrum(sink, R, `${seed}:drum`, { rx: R.ix - 0.50, rz: -1.55 });
    FileCabinet(sink, R, `${seed}:cab`, {
      rx: 2.55, rz: -(R.iz - 0.26), w: 0.95, h: 1.60, d: 0.44, face: 1,
    });
    for (let i = 0; i < 2; i += 1) {
      WoodCrate(sink, R, `${seed}:crate${i}`, {
        rx: -(R.ix - 0.52), rz: -1.60 + i * 0.92, s: 0.85, spin: i * 0.14,
      });
    }
    Bench(sink, R, `${seed}:bench`, { rx: 0, rz: trz - td / 2 - 0.44, len: 1.30 });
    WaterCrock(sink, R, `${seed}:crock`, { rx: R.ix - 0.55, rz: R.iz - 0.50 });
    TinMug(sink, R, `${seed}:mug`, { rx: 0.70, rz: trz - 0.30, y: topY });
    return;
  }

  // 师部：全套
  if (!worn) OilLamp(sink, R, `${seed}:lamp`, { rx: 1.30, rz: trz + 0.48, y: topY });
  // 靠山墙的条案：电话、线盘、图卷都在这一侧，桌面留给图板
  const sideX = R.ix - 0.34;
  const boardTop = PlainTable(sink, R, `${seed}:side`, {
    rx: sideX, rz: -0.95, w: 0.55, d: 1.90, topY: 0.80,
  });
  const wire = FieldPhone(sink, R, `${seed}:tel`, { rx: sideX, rz: -1.35, y: boardTop });
  PhoneLine(sink, R, `${seed}:wire`, o, wire, R.ix - 0.10, -1.35);
  PaperRolls(sink, R, `${seed}:rolls`, { rx: sideX, rz: -0.35, y: boardTop });
  CableDrum(sink, R, `${seed}:drum`, { rx: R.ix - 0.42, rz: 0.40 });
  // 文件柜靠后墙、拉到挂图两外侧：绕桌那条通道（rx≈±2.4）从它们里侧过
  for (const s of [-1, 1]) {
    FileCabinet(sink, R, `${seed}:cab${s}`, {
      rx: s * 3.90, rz: -(R.iz - 0.26), w: 1.05, h: 1.85, d: 0.48, face: 1,
    });
  }
  for (let i = 0; i < 3; i += 1) {
    WoodCrate(sink, R, `${seed}:crate${i}`, {
      rx: -(R.ix - 0.55) + (i === 2 ? 0.06 : 0), rz: -1.90 + (i === 1 ? 0.95 : 0),
      y: i === 2 ? 0.51 : 0, s: 1, spin: i * 0.11,
    });
  }
  // 桌后两条长凳 + 条案边一条：坐的人背对后墙，围着图
  const benchZ = trz - td / 2 - 0.48;
  for (const s of [-1, 1]) {
    Bench(sink, R, `${seed}:bench${s}`, { rx: s * 1.00, rz: benchZ, len: 1.40 });
  }
  Bench(sink, R, `${seed}:benchS`, { rx: R.ix - 1.30, rz: -1.60, len: 1.00 });
  TinMug(sink, R, `${seed}:mug`, { rx: -1.42, rz: trz + 0.52, y: topY });

  // —— 两端不能空成仓库：-x 头是参谋的写字桌 + 水缸，+x 头是条案那一套 ——
  const deskTop = PlainTable(sink, R, `${seed}:desk`, {
    rx: -(R.ix - 1.35), rz: 0.35, w: 1.45, d: 0.72, topY: 0.76,
  });
  TinMug(sink, R, `${seed}:mug2`, { rx: -(R.ix - 1.35) + 0.45, rz: 0.35, y: deskTop });
  PaperRolls(sink, R, `${seed}:rolls2`, { rx: -(R.ix - 1.35) - 0.30, rz: 0.35, y: deskTop, len: 0.44 });
  Bench(sink, R, `${seed}:benchD`, { rx: -(R.ix - 1.35), rz: -0.50, len: 0.90 });
  WaterCrock(sink, R, `${seed}:crock`, { rx: -(R.ix - 0.60), rz: R.iz - 0.62 });
}

// ---------------------------------------------------------------------------
// 装配线
// ---------------------------------------------------------------------------

function CommandCompound(host, f, ctx, kit) {
  const sink = host.sink;
  const ry = ctx.ry;
  const seed = `map:${f.id}`;
  const rnd = Mulberry32(HashString(`${seed}:hq`));
  const wallMat = ctx.burnt ? "BrickWallSooty" : kit.wallMat;
  const o = {
    seed, wallMat, wallH: kit.wallH, gateOpenW: kit.gateOpenW,
    plinth: kit.plinth,
  };

  Enclosure(host, f, ctx, o);
  for (const side of kit.boardSides) UnitBoard(sink, f, ry, side, o);
  for (const post of kit.gatePosts) {
    GatePost(host, f, ctx, {
      lx: post * (kit.gateOpenW / 2 + 3.1), out: 2.6,
      length: 4.6, depth: 2.0, seed: `${seed}:gp${post}`,
    });
  }

  // —— 前院：集散场 ——
  const frontDepth = Clamp(f.d * kit.frontFraction, 9.5, 22);
  const frontMid = f.d / 2 - frontDepth * 0.55;
  const flag = Local(f, ry, -f.w * 0.145, frontMid);
  Flagpole(sink, flag.x, flag.z, ry, {
    seed: `${seed}:flag`, height: kit.flagHeight,
    flag: kit.flag && ctx.damage < 0.34,
  });
  // 集合场：被踩实扫过的几片地。三片叠出一块不规则的硬土，而不是一张同色板
  for (let i = 0; i < 3; i += 1) {
    const q = Local(f, ry, (i - 1) * f.w * 0.17, frontMid + (rnd() - 0.5) * 2.4);
    AddYardWear(sink, {
      x: q.x, z: q.z, ry, baseY: 0, seed: `${seed}:muster${i}`,
      radius: Math.min(f.w * 0.17, frontDepth * 0.42),
    });
  }
  // 门房 / 传达室：进门右手第一间
  const lodgeW = Clamp(f.w * 0.11, 5.0, 8.5);
  Room(host, f, ctx, {
    lx: f.w * 0.31, lz: f.d / 2 - 6.9, ry, width: lodgeW, depth: 4.6,
    eaveY: 2.55, ridgeY: 3.85, seed: `${seed}:lodge`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 2,
  });
  // 电话杆：前院靠门一侧入院 + 地锚斜拉线
  const poleTop = TelephonePole(host, f, ctx, {
    seed: `${seed}:tel`, lx: f.w * 0.40, lz: f.d / 2 - 3.4,
    height: 7.2, anchor: -3.6,
  });

  // —— 二门（hq）/ 草料隔墙（大 billet）——
  const innerZ = f.d / 2 - frontDepth;
  if (kit.innerGate) {
    const gap = 2.6;
    const seg = (f.w - gap) / 2;
    for (const side of [-1, 1]) {
      const q = Local(f, ry, side * (gap / 2 + seg / 2), innerZ);
      PartitionWall(sink, wallMat, {
        x: q.x, z: q.z, ry, length: seg, height: kit.innerGateH, thickness: 0.34,
        seed: `${seed}:inner${side}`, ruin: ctx.damage * 0.7,
      });
    }
    // 二门门垛 + 过木：一眼看出这是「门」而不是墙缺了一块
    for (const side of [-1, 1]) {
      const q = Local(f, ry, side * (gap / 2 + 0.28), innerZ);
      sink.Add(wallMat, PlaceGeometry(
        MakeBox(0.56, kit.innerGateH + 0.5, 0.72, TILE_METERS.brick, `${seed}:ip${side}`,
          wallMat === "Adobe" ? null : BRICK_UV_GRID),
        { x: q.x, y: (kit.innerGateH + 0.5) / 2, z: q.z, ry }));
      sink.Solid(q.x, (kit.innerGateH + 0.5) / 2, q.z, 0.32, (kit.innerGateH + 0.5) / 2,
        0.4, "wall", ry);
    }
    const lintel = Local(f, ry, 0, innerZ);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(gap + 1.1, 0.24, 0.62, TILE_METERS.wood, `${seed}:ilin`),
      { x: lintel.x, y: 2.42, z: lintel.z, ry }));
    if (ctx.damage < 0.5) {
      sink.Add(ctx.burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
        MakeBox(gap + 2.0, 0.13, 1.30, TILE_METERS.roof, `${seed}:irf`),
        { x: lintel.x, y: kit.innerGateH + 0.72, z: lintel.z, ry }));
    }
  }

  // —— 后院：办公 ——
  const opsW = Clamp(f.w * 0.20, 9, 18);
  const opsD = Clamp(f.d * 0.16, 5.4, 8.5);
  const opsZ = -f.d / 2 + opsD / 2 + 1.5;
  const opsRidge = kit.opsEave + opsD * 0.5 * 0.52;
  const opsBuilt = Room(host, f, ctx, {
    lx: 0, lz: opsZ, ry, width: opsW, depth: opsD,
    eaveY: kit.opsEave, ridgeY: opsRidge,
    seed: `${seed}:ops`, damage: ctx.damage, burnt: ctx.burnt,
    facing: 1, bays: Math.max(3, Math.round(opsW / 3.4)),
  });
  // 作战室内部（WP-D1）：明间门洞本来就没有碰撞，进得去，只是里面是空的
  if (opsBuilt && kit.opsInterior) {
    OpsRoomInterior(host, f, ctx, {
      lx: 0, lz: opsZ, width: opsW, depth: opsD,
      eaveY: kit.opsEave, ridgeY: opsRidge, seed: `${seed}:in`,
    });
  }
  // 电话线从杆顶跨过二门落到作战室檐口 —— 「这院子里有一部电话」的唯一可见证据。
  // 中段那根短杆是 A5 的遗留：55 m 一档无支撑，物理上说不过去，出图上也读成一条飘着的线。
  if (poleTop) {
    const ops = Local(f, ry, 0, opsZ + opsD / 2);
    const eaveEnd = { x: ops.x, y: kit.opsEave + 0.55, z: ops.z };
    const span = Math.hypot(eaveEnd.x - poleTop.x, eaveEnd.z - poleTop.z);
    let relay = null;
    if (span > 30) {
      const mid = Local(f, ry, f.w * 0.20, (f.d / 2 - 3.4 + opsZ + opsD / 2) * 0.5);
      if (!host.OnStreet(mid.x, mid.z, 1.0, 1.0)) {
        AddPole(sink, { x: mid.x, z: mid.z, seed: `${seed}:relay`, height: 5.2 });
        relay = { x: mid.x, y: 4.7, z: mid.z };
      }
    }
    if (relay) {
      AddStrut(sink, "WoodBeam", poleTop, relay, 0.045, `${seed}:line0`);
      AddStrut(sink, "WoodBeam", relay, eaveEnd, 0.045, `${seed}:line1`);
    } else {
      AddStrut(sink, "WoodBeam", poleTop, eaveEnd, 0.045, `${seed}:line`);
    }
  }
  // 两厢（hq 是办公厢房，billet 是长条库房翼 —— 同一处骨架，换的是长宽比与檐高）。
  // 长度按后院剩下的进深封顶：宁可短一截，也不许厢房的山墙捅进前院/二门里。
  const wingBack = -f.d / 2 + opsD + 2.4;
  const wingRoom = Math.max(6.0, innerZ - wingBack - 0.8);
  const wingLong = Clamp(f.d * kit.wingLongF, 6.0, wingRoom);
  const wingShort = Clamp(f.w * kit.wingShortF, 4.2, 6.4);
  for (const side of [-1, 1]) {
    // facing 恒为 +1：厢房转了 ±90° 之后，它自己的 +z 面**两侧都指向院心**。
    //（AddCompound 里那句 facing: side 会让西厢开向院墙，这里不照抄。）
    Room(host, f, ctx, {
      lx: side * (f.w / 2 - wingShort / 2 - 1.3), lz: wingBack + wingLong / 2,
      ry: ry + side * Math.PI / 2, width: wingLong, depth: wingShort,
      eaveY: kit.wingEave, ridgeY: kit.wingEave + wingShort * 0.5 * 0.52,
      seed: `${seed}:wing${side}`, damage: Clamp(ctx.damage + rnd() * 0.12, 0, 1),
      burnt: ctx.burnt, facing: 1, bays: Math.max(2, Math.round(wingLong / 3.8)),
      roofRafters: false,
    });
  }
  // 机要库（只有 94 m 的师部才有这一座）
  if (kit.strongRoom && f.w >= 60) {
    StrongRoom(host, f, ctx, {
      seed: `${seed}:vault`, lx: -(f.w / 2 - 7.0), lz: -f.d / 2 + 4.8,
      width: 11.0, depth: 8.0, eaveY: 6.3,
    });
  }
  // 后院家什 + 井
  const well = Local(f, ry, f.w * 0.24, opsZ + opsD / 2 + 3.2);
  if (!host.OnStreet(well.x, well.z, 1.0, 1.0)) AddWell(sink, well.x, well.z);
  const life = Local(f, ry, -f.w * 0.20, (innerZ + opsZ) * 0.5);
  AddCourtyardLife(sink, {
    x: life.x, z: life.z, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, f.w * 0.24), depth: Math.max(5, f.d * 0.22), damage: ctx.damage,
  });

  return { rnd, innerZ, frontDepth };
}

// ---------------------------------------------------------------------------
// kind 入口
// ---------------------------------------------------------------------------

/**
 * 师部 / 团部。青砖院墙 + 条石碱脚，宽门（过得了马车与担架），
 * 二门分前后院，后院是作战室 + 两厢办公，师部另加一座两层机要库。
 */
export function BuildHq(host, f, ctx) {
  const big = f.w >= 60;
  CommandCompound(host, f, ctx, {
    wallMat: "BrickWall",
    plinth: "Stone",
    wallH: 2.35,
    gateOpenW: big ? 2.6 : 2.0,
    boardSides: [-1, 1],
    gatePosts: big ? [-1, 1] : [-1],
    frontFraction: 0.36,
    flagHeight: big ? 9.0 : 7.4,
    flag: true,
    innerGate: true,
    innerGateH: 2.6,
    opsEave: 3.35,
    wingEave: 2.85,
    wingLongF: 0.32,
    wingShortF: 0.072,
    strongRoom: true,
    opsInterior: true,
  });
}

/**
 * 营连驻地。借住的民宅院：土坯院墙、窄门、没有二门与库楼，
 * 正房矮一档，两侧长条库房翼，院角是马棚 / 草料垛 / 粪堆 / 碌碡。
 */
export function BuildBillet(host, f, ctx) {
  const seed = `map:${f.id}`;
  const ry = ctx.ry;
  const sink = host.sink;
  const { rnd, innerZ } = CommandCompound(host, f, ctx, {
    wallMat: "Adobe",
    plinth: null,
    wallH: 2.05,
    gateOpenW: 2.2,
    boardSides: [-1],
    gatePosts: [-1],
    frontFraction: 0.34,
    flagHeight: 6.2,
    flag: false,
    innerGate: false,
    innerGateH: 2.2,
    opsEave: 2.9,
    wingEave: 2.55,
    wingLongF: 0.46,
    wingShortF: 0.095,
    strongRoom: false,
    // 营连驻地的正房是借住的民宅，屋里是打地铺不是作战室；D1 只开三处 hq 的正房。
    opsInterior: false,
  });

  // 马棚 + 草料区：靠前院一侧的院角，那里才卸得下料、进得来牲口
  LeanTo(host, f, ctx, {
    seed: `${seed}:stable`, lx: -(f.w / 2 - 5.6), lz: innerZ + 4.0,
    width: Clamp(f.w * 0.14, 6.0, 10.0), depth: 4.4,
  });
  for (let i = 0; i < 2; i += 1) {
    const p = Local(f, ry, -(f.w / 2 - 5.2) + i * 3.4, innerZ + 9.0);
    if (host.OnStreet(p.x, p.z, 1.6, 1.6)) continue;
    AddStalkStack(sink, {
      x: p.x, z: p.z, ry: ry + rnd() * 0.7, y: 0,
      seed: `${seed}:stalk${i}`, scale: 0.9 + rnd() * 0.2,
    });
  }
  const heap = Local(f, ry, -(f.w / 2 - 10.5), innerZ + 8.0);
  if (!host.OnStreet(heap.x, heap.z, 1.6, 1.6)) {
    AddManureHeap(sink, { x: heap.x, z: heap.z, seed: `${seed}:heap`, scale: 0.95 });
  }
  const roller = Local(f, ry, f.w * 0.30, innerZ - 2.2);
  if (!host.OnStreet(roller.x, roller.z, 1.0, 1.0)) {
    AddStoneRoller(sink, {
      x: roller.x, z: roller.z, ry: ry + rnd() * Math.PI, y: 0,
      seed: `${seed}:roller`, framed: rnd() < 0.6,
    });
  }
}
