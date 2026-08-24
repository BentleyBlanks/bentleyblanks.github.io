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
// 预算取向：外圈院墙沿用 AddWall（街上平视看得见的那一圈，细节不能省），
// 院内隔墙走本文件的 PartitionWall（4.2 m 一段而不是 0.85 m 一段，便宜十几倍）。
// 除旗面 PaintRed（hq）与草料 VillageStraw（billet）外，不往分区里引入新材质。

import * as THREE from "three";
import {
  AddWall, AddGatehouse, AddRoomBlock, AddHardMountainRoof,
  AddSandbagEmplacement, AddPole, AddWell,
} from "./Script_World.mjs";
import {
  MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
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
  const tile = o.wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick;
  const closed = [
    { lx: 0, lz: -f.d / 2, len: f.w, rot: 0 },
    { lx: -f.w / 2, lz: 0, len: f.d, rot: Math.PI / 2 },
    { lx: f.w / 2, lz: 0, len: f.d, rot: Math.PI / 2 },
  ];
  closed.forEach((s, i) => {
    const p = Local(f, ry, s.lx, s.lz);
    AddWall(sink, o.wallMat, {
      x: p.x, z: p.z, length: s.len, height: o.wallH, thickness: 0.38,
      ry: ry + s.rot, ruin: ctx.damage * 0.75, seed: `${o.seed}:w${i}`,
      tile, plinth: o.plinth, cope: true,
    });
  });
  // 前墙：门洞两侧各一段
  const segLen = (f.w - o.gateOpenW) / 2;
  for (const side of [-1, 1]) {
    const p = Local(f, ry, side * (o.gateOpenW / 2 + segLen / 2), f.d / 2);
    AddWall(sink, o.wallMat, {
      x: p.x, z: p.z, length: segLen, height: o.wallH, thickness: 0.38,
      ry, ruin: ctx.damage * 0.7, seed: `${o.seed}:wf${side}`,
      tile, plinth: o.plinth, cope: true,
    });
  }
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
  Room(host, f, ctx, {
    lx: 0, lz: opsZ, ry, width: opsW, depth: opsD,
    eaveY: kit.opsEave, ridgeY: kit.opsEave + opsD * 0.5 * 0.52,
    seed: `${seed}:ops`, damage: ctx.damage, burnt: ctx.burnt,
    facing: 1, bays: Math.max(3, Math.round(opsW / 3.4)),
  });
  // 电话线从杆顶跨过二门落到作战室屋脊 —— 「这院子里有一部电话」的唯一可见证据
  if (poleTop) {
    const ops = Local(f, ry, 0, opsZ + opsD / 2);
    AddStrut(sink, "WoodBeam", poleTop,
      { x: ops.x, y: kit.opsEave + 0.55, z: ops.z }, 0.045, `${seed}:line`);
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
