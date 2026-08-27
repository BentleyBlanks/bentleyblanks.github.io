// 警备队 + 警察所（城防示意图北城）。工作包 A2 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// 这两处是同一个 family：**制式机关院**。它们和民居院、和师团部指挥院都不一样，
// 一眼可辨的四件套是：
//   ① 门垛高出院墙一截、门额上挂一方石匾的**大门**（民居门楼没有匾，也没有台阶）；
//   ② 门里两侧的**门岗亭**（立柱 + 矮砖围 + 坡顶小亭）；
//   ③ 院心一根**旗杆**（石台座 + 高杆），旗杆脚下一片被踩实的**操练小场**——
//      俯瞰图上这一片浅色空地就是「这不是住家」最强的读图信号；
//   ④ 临街墙面上的**告示墙**（砖框 + 一排刷白的布告 + 一道小檐）。
// 警备队军事化更重：门外加沙袋哨位，院内多一座无窗**械房**；
// 警察所沿旧版保留**临街正房 + 后翼**的骨架，只把门脸升级成门罩 + 台阶 + 告示墙。
//
// 尺寸依据 docs/Data_HistoryMaterial.md（檐口 2.4—2.8 / 脊高 3.5—4.2 / 院墙 1.8—2.2，
// 机关院比民居高一档）；平面一律从 f.x/f.z/f.w/f.d 推导，绝对高度是推定值，
// 已列进交付报告的 PRESUMED 候选表。

import * as THREE from "three";
import {
  AddWall, AddRoomBlock, AddDoorReveal, AddSandbagEmplacement,
} from "./Script_World.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID } from "./Script_Geo.mjs";
import { AddYardWear } from "./Script_LivedInProps.mjs";
import { AddYardWallRing } from "./Script_YardWall.mjs";

// 制式机关院的一套推定尺寸。都是「比民居高一档」，不是凭空拍的：
// 民居院墙 1.8—2.2、檐口 2.4—2.8，机关院各加 0.4—0.6 m。
const OFFICE = {
  yardWallH: 2.65,        // 机关院墙（民居 1.8—2.2 之上一档）
  yardWallT: 0.42,
  gateOpenW: 3.0,         // 大门净宽：要过大车与马，比民居门楼的 1.5 宽一倍
  gateRise: 1.15,         // 门垛高出院墙
  boothW: 1.80, boothD: 1.60, boothRailH: 1.02, boothPostH: 2.30,
  flagH: 8.6,             // 旗杆（含台座 0.34）
  noticeH: 2.05,          // 告示墙砖框高
};

/** 院落局部坐标 → 世界坐标。与 TengxianCity.FeaturePoint / AddCompound 同一套约定：
 *  +lz 是「门脸/临街」方向，-lz 是院子深处，+lx 在朝外站着时的左手边。 */
function LocalTo(f, ry, lx, lz) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return { x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz };
}

/**
 * 一圈机关院墙（走样条围墙 PCG：Script_YardWall → Script_WallSpline）。
 * 旧版的 AddRunX / AddRunZ 各自砌一条边，四角靠"正好停在角上"对接 ——
 * 外角上留一道墙厚的缝。现在闭环由管线在角上互搭。
 *
 * @param o.sides / o.sideRange  哪几面砌、某一面只砌一段（警察所的院子
 *   临街那面已被正房封住，两山墙只砌到正房后檐）
 */
function AddOfficeYardWall(sink, f, ry, o) {
  AddYardWallRing(sink, {
    frame: (lx, lz) => LocalTo(f, ry, lx, lz),
    hw: f.w / 2, hd: f.d / 2,
    preset: "landmarkYard",
    material: o.mat, height: o.height, thickness: o.thickness,
    seed: o.seed, ruin: o.ruin,
    sides: o.sides || null, sideRange: o.sideRange || null,
    gates: o.gates || [],
  });
}

/**
 * 机关大门：门垛高出院墙 + 木过梁 + 门额 + **挂匾** + 两坡门罩 + 台阶 + 门道。
 * 匾走 Stone（石额）不走漆牌：1938 年的县级机关门额多是砖框嵌石，
 * 而且不额外拉一种材质进这一分区。
 */
function AddOfficeGate(sink, f, ry, o) {
  const mat = o.burnt ? "BrickWallSooty" : "BrickWall";
  const pierH = o.wallH + OFFICE.gateRise;
  const pierHalf = 0.36;
  const lintelY = 2.62;

  for (const s of [-1, 1]) {
    const plx = o.lx + s * (o.openW / 2 + pierHalf);
    const p = LocalTo(f, ry, plx, o.lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(pierHalf * 2, pierH, 0.90, TILE_METERS.brick, `${o.seed}:pier${s}`, BRICK_UV_GRID),
      { x: p.x, y: pierH / 2, z: p.z, ry }));
    sink.Solid(p.x, pierH / 2, p.z, pierHalf, pierH / 2, 0.45, "wall", ry);
    // 门墩石：大门两侧各一方，机关院用素面方墩不用抱鼓
    const d = LocalTo(f, ry, plx + s * 0.10, o.lz + 0.52);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.52, 0.60, 0.52, TILE_METERS.stone, `${o.seed}:dun${s}`),
      { x: d.x, y: 0.30, z: d.z, ry }));
  }

  const c = LocalTo(f, ry, o.lx, o.lz);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(o.openW + 1.5, 0.30, 1.00, TILE_METERS.wood, `${o.seed}:lintel`),
    { x: c.x, y: lintelY - 0.15, z: c.z, ry }));
  const headH = Math.max(0.5, pierH - lintelY);
  sink.Add(mat, PlaceGeometry(
    MakeBox(o.openW + 1.5, headH, 0.76, TILE_METERS.brick, `${o.seed}:head`, BRICK_UV_GRID),
    { x: c.x, y: lintelY + headH / 2, z: c.z, ry }));

  // 挂匾：探出门额 0.10 m，正面受光，是「这是衙门口」唯一的一块亮面
  // 匾走木漆板不走石额：民国县级机关门额上挂的是黑漆金字的木匾，做成刷白的石片
  // 会读成一块现代招牌（第一版实拍就是这个毛病）。深色木板 + 一圈浅石边框才对。
  const plaqueW = Math.min(o.openW * 0.72, 2.1);
  const pl = LocalTo(f, ry, o.lx, o.lz + 0.44);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(plaqueW + 0.16, 0.74, 0.10, TILE_METERS.stone * 3, `${o.seed}:plaqueFrame`),
    { x: pl.x, y: lintelY + headH * 0.52, z: pl.z, ry }));
  const pw = LocalTo(f, ry, o.lx, o.lz + 0.52);
  sink.Add("WoodDoor", PlaceGeometry(
    MakeBox(plaqueW, 0.58, 0.07, TILE_METERS.wood * 2, `${o.seed}:plaque`),
    { x: pw.x, y: lintelY + headH * 0.52, z: pw.z, ry }));

  // 门罩：两坡小瓦檐，把匾罩在阴影里。
  // roofSpan 可收窄：门道夹在临街正房的山墙边上时，宽出去的檐会捅进人家屋面。
  const roofSpan = o.roofSpan ?? (o.openW + 2.6);
  if (o.damage < 0.62) {
    for (const s of [-1, 1]) {
      const r = LocalTo(f, ry, o.lx, o.lz + s * 0.30);
      sink.Add(o.burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
        MakeBox(roofSpan, 0.12, 0.80, TILE_METERS.roof, `${o.seed}:rf${s}`),
        { x: r.x, y: pierH + 0.30, z: r.z, ry, rx: -s * 0.48 }));
    }
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(roofSpan + 0.10, 0.17, 0.26, TILE_METERS.roof, `${o.seed}:rdg`),
      { x: c.x, y: pierH + 0.54, z: c.z, ry }));
  }

  // 门道的里子（门槛 + 墁地 + 木框）。AddDoorReveal 的 +z 局部轴 = 院落局部 -lz，
  // 直接传 ry 就是「往院里走」。
  AddDoorReveal(sink, {
    x: c.x, z: c.z, ry, openW: o.openW, openH: 2.46, depth: 2.3, seed: `${o.seed}:rv`,
  });
  // 台阶：机关院的门前踏跺。不登记碰撞——总高 0.22 m，让人直接走上去
  for (let i = 0; i < 2; i += 1) {
    const h = (2 - i) * 0.11;
    const p = LocalTo(f, ry, o.lx, o.lz + 0.72 + 0.36 * i);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(o.openW + 1.5 - i * 0.34, h, 0.40, TILE_METERS.stone, `${o.seed}:step${i}`),
      { x: p.x, y: h / 2, z: p.z, ry }));
  }
  // 门板：一扇半掩（机关院是双扇板门，打了半个月不会齐整）
  if (o.damage < 0.7) {
    const dp = LocalTo(f, ry, o.lx - o.openW / 4, o.lz);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(o.openW / 2 - 0.05, 2.42, 0.08, TILE_METERS.wood, `${o.seed}:leaf`),
      { x: dp.x, y: 1.21, z: dp.z, ry }));
  }
}

/** 门岗亭：四根木立柱 + 三面矮砖围 + 坡顶。开口朝 facing（+1 朝街、-1 朝院）。 */
function AddSentryBooth(sink, f, ry, o) {
  const mat = o.burnt ? "BrickWallSooty" : "BrickWall";
  const { boothW: W, boothD: D, boothRailH: railH, boothPostH: postH } = OFFICE;
  const facing = o.facing ?? 1;

  const rails = [
    { dlx: 0, dlz: -facing * D / 2, len: W, rot: 0 },
    { dlx: -W / 2, dlz: 0, len: D, rot: Math.PI / 2 },
    { dlx: W / 2, dlz: 0, len: D, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < rails.length; i += 1) {
    const r = rails[i];
    const p = LocalTo(f, ry, o.lx + r.dlx, o.lz + r.dlz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(r.len, railH, 0.22, TILE_METERS.brick, `${o.seed}:rail${i}`, BRICK_UV_GRID),
      { x: p.x, y: railH / 2, z: p.z, ry: ry + r.rot }));
    sink.Solid(p.x, railH / 2, p.z, r.len / 2, railH / 2, 0.11, "wall", ry + r.rot);
    sink.Cover(p.x, p.z, railH, Math.sin(ry + r.rot), Math.cos(ry + r.rot));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = LocalTo(f, ry, o.lx + sx * (W / 2 - 0.08), o.lz + sz * (D / 2 - 0.08));
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.12, postH, 0.12, TILE_METERS.wood, `${o.seed}:post${sx}${sz}`),
        { x: p.x, y: postH / 2, z: p.z, ry }));
    }
  }
  // 坡顶小亭：两坡瓦面 + 一条脊，出檐 0.3 m
  for (const s of [-1, 1]) {
    const p = LocalTo(f, ry, o.lx, o.lz + s * (D * 0.27));
    sink.Add(o.burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
      MakeBox(W + 0.60, 0.10, D * 0.62 + 0.30, TILE_METERS.roof, `${o.seed}:rf${s}`),
      { x: p.x, y: postH + 0.20, z: p.z, ry, rx: -s * 0.44 }));
  }
  const c = LocalTo(f, ry, o.lx, o.lz);
  sink.Add("RoofTile", PlaceGeometry(
    MakeBox(W + 0.66, 0.14, 0.24, TILE_METERS.roof, `${o.seed}:rdg`),
    { x: c.x, y: postH + 0.40, z: c.z, ry }));
}

/** 院心旗杆：石台座 + 高杆 + 顶球。俯瞰图上靠它那条长影子认院子。 */
function AddFlagPole(sink, f, ry, o) {
  const p = LocalTo(f, ry, o.lx, o.lz);
  const h = o.height ?? OFFICE.flagH;
  sink.Add("Stone", PlaceGeometry(
    MakeBox(1.56, 0.34, 1.56, TILE_METERS.stone, `${o.seed}:base`),
    { x: p.x, y: 0.17, z: p.z, ry }));
  sink.Add("WoodBeam", PlaceGeometry(
    new THREE.CylinderGeometry(0.055, 0.105, h, 8),
    { x: p.x, y: 0.34 + h / 2, z: p.z }));
  sink.Add("Stone", PlaceGeometry(
    new THREE.SphereGeometry(0.115, 8, 6),
    { x: p.x, y: 0.34 + h + 0.08, z: p.z }));
  sink.Solid(p.x, 0.17, p.z, 0.80, 0.17, 0.80, "prop", ry);
  sink.Solid(p.x, 0.34 + h / 2, p.z, 0.14, h / 2, 0.14, "prop");
}

/** 临街告示墙：砖框贴在墙面上 + 一排刷白的布告 + 一道小檐挡雨。 */
function AddNoticeBoards(sink, f, ry, o) {
  const mat = o.burnt ? "BrickWallSooty" : "BrickWall";
  const count = o.count ?? 3;
  const width = count * 1.16 + 0.52;
  const face = o.face ?? 0.24;
  const fr = LocalTo(f, ry, o.lx, o.lz + face);
  sink.Add(mat, PlaceGeometry(
    MakeBox(width, OFFICE.noticeH, 0.16, TILE_METERS.brick, `${o.seed}:frame`, BRICK_UV_GRID),
    { x: fr.x, y: OFFICE.noticeH / 2 + 0.10, z: fr.z, ry }));
  for (let i = 0; i < count; i += 1) {
    const p = LocalTo(f, ry, o.lx - (count - 1) * 0.58 + i * 1.16, o.lz + face + 0.10);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.94, 1.26, 0.05, TILE_METERS.stone * 2.4, `${o.seed}:sheet${i}`),
      { x: p.x, y: 1.46, z: p.z, ry }));
  }
  const cp = LocalTo(f, ry, o.lx, o.lz + face + 0.14);
  sink.Add("RoofTile", PlaceGeometry(
    MakeBox(width + 0.36, 0.10, 0.52, TILE_METERS.roof, `${o.seed}:cope`),
    { x: cp.x, y: OFFICE.noticeH + 0.26, z: cp.z, ry, rx: -0.34 }));
}

/** 操练小场：被队列反复踩实的一片浅色硬土。俯瞰图上认院子就靠它。 */
function AddDrillGround(sink, f, ry, o) {
  for (let i = -1; i <= 1; i += 1) {
    const p = LocalTo(f, ry, o.lx + i * o.radius * 0.62, o.lz);
    AddYardWear(sink, {
      x: p.x, z: p.z, ry, baseY: 0, seed: `${o.seed}:${i}`,
      radius: o.radius * 0.86, material: "RoadWear",
    });
  }
}

/**
 * 机关院的队列场边线。原来只有三团浅色磨损，从高空看会和普通院心混在一起；
 * 这里补一圈条石边与三道列队线，仍是院内实际铺地，不改变院落占地或通行。
 */
function AddInspectionCourt(sink, f, ry, o) {
  const width = Math.min(o.width, f.w - 8);
  const depth = Math.min(o.depth, f.d - 10);
  const strip = 0.24;
  const Put = (lx, lz, w, d, tag) => {
    const p = LocalTo(f, ry, lx, lz);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(w, 0.07, d, TILE_METERS.stone, `${o.seed}:${tag}`),
      { x: p.x, y: 0.025, z: p.z, ry }));
  };
  Put(o.lx, o.lz - depth / 2, width, strip, "n");
  Put(o.lx, o.lz + depth / 2, width, strip, "s");
  Put(o.lx - width / 2, o.lz, strip, depth, "w");
  Put(o.lx + width / 2, o.lz, strip, depth, "e");
  // 三道短横线是整队站位，不是现代球场标线；间距按一步半取 1.35 m。
  for (let i = -1; i <= 1; i += 1) Put(o.lx, o.lz + i * 1.35, width * 0.58, 0.16, `rank${i}`);
}

// ---------------------------------------------------------------------------
// 警备队（GarrisonHQ 46×30，北城根，南邻监狱）
// ---------------------------------------------------------------------------

export function BuildGarrison(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry;
  const mat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const ruin = ctx.damage * 0.7;
  const seed = `map:${f.id}`;
  const hw = f.w / 2, hd = f.d / 2;
  const gateW = OFFICE.gateOpenW;
  const gateHalf = gateW / 2 + 0.72;              // 门垛外沿

  // --- 一圈院墙。大门开在临街那一面（+lz）正中 ---
  const wallArgs = { mat, height: OFFICE.yardWallH, thickness: OFFICE.yardWallT, ruin };
  AddOfficeYardWall(sink, f, ry, {
    ...wallArgs, seed: `${seed}:yard`,
    gates: [{ side: "s", offset: 0, openW: gateHalf * 2 }],
  });

  AddOfficeGate(sink, f, ry, {
    lx: 0, lz: hd, openW: gateW, wallH: OFFICE.yardWallH,
    seed: `${seed}:gate`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 门内影壁：从街上透过门洞唯一能看见的一片受光面
  const screen = LocalTo(f, ry, 0, hd - 3.4);
  AddWall(sink, mat, {
    x: screen.x, z: screen.z, length: gateW + 1.8, height: 2.2, thickness: 0.32,
    ry, ruin: ctx.damage * 0.5, seed: `${seed}:screen`, plinth: "Stone", cope: true,
  });

  // --- 临街告示墙（大门左手边的那一段墙面）---
  AddNoticeBoards(sink, f, ry, {
    lx: -(gateHalf + 3.4), lz: hd, count: 3, seed: `${seed}:notice`, burnt: ctx.burnt,
  });

  // --- 门内两座门岗亭（开口朝大门）---
  for (const s of [-1, 1]) {
    AddSentryBooth(sink, f, ry, {
      lx: s * (gateHalf + 1.5), lz: hd - 1.9, facing: 1,
      seed: `${seed}:booth${s}`, burnt: ctx.burnt,
    });
  }

  // --- 门外沙袋哨位：警备队是武装机关，门口有工事 ---
  // AddSandbagEmplacement 的 +z 局部轴与院落 +lz 反向，所以 ry+PI 才是「胸墙朝街」。
  for (const s of [-1, 1]) {
    const p = LocalTo(f, ry, s * (gateHalf + 3.5), hd + 1.3);
    if (host.OnStreet(p.x, p.z, 2.6, 1.2)) continue;
    AddSandbagEmplacement(sink, {
      x: p.x, z: p.z, ry: ry + Math.PI, baseY: 0, seed: `${seed}:bag${s}`,
      length: 5.0, depth: 2.0, height: 0.72,
    });
  }

  // --- 院内：旗杆 + 操练小场 ---
  AddFlagPole(sink, f, ry, { lx: 0, lz: hd - 9.2, seed: `${seed}:flag` });
  AddDrillGround(sink, f, ry, { lx: 0, lz: hd - 12.4, radius: 5.6, seed: `${seed}:drill` });
  AddInspectionCourt(sink, f, ry, {
    lx: 0, lz: hd - 12.2, width: 13.2, depth: 7.8, seed: `${seed}:court`,
  });

  // --- 值房（后排大房，警备队的营房兼办公）---
  host.AddFeatureRoom(f, ry, 0, -f.d * 0.28, f.w * 0.62, f.d * 0.26, {
    eaveY: 3.2, ridgeY: 5.0, seed: `${seed}:duty`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1,
    // 单开间 3.0—3.6 m；取奇数开间，明间（门）才在正中
    bays: Math.max(3, Math.round(f.w * 0.62 / 3.5) | 1),
  });
  // --- 械房：无窗小屋（bays=1 时 AddRoomBlock 只开门不开窗）---
  host.AddFeatureRoom(f, ry, -f.w * 0.32, -f.d * 0.02, f.w * 0.20, f.d * 0.20, {
    eaveY: 2.8, ridgeY: 4.1, seed: `${seed}:armory`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 1,
  });
}

// ---------------------------------------------------------------------------
// 警察所（PoliceStation 34×28，临街正房 + 后翼，沿旧版骨架）
// ---------------------------------------------------------------------------

export function BuildPolice(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry;
  const mat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const ruin = ctx.damage * 0.7;
  const seed = `map:${f.id}`;
  const hw = f.w / 2, hd = f.d / 2;

  // 临街正房：仍然占满大半个街面（旧版的连续街墙），但让出一道 3 m 门道，
  // 否则院子进不去 —— 机关院必须留可走开口。
  const gateW = OFFICE.gateOpenW;
  const gateLx = hw - (gateW / 2 + 0.72);
  const frontLx1 = gateLx - (gateW / 2 + 0.72);    // 正房右端顶到门垛
  const frontW = frontLx1 + hw;
  const frontD = f.d * 0.30;
  const frontLz = hd - 0.6 - frontD / 2;
  const frontCx = LocalTo(f, ry, (-hw + frontLx1) / 2, frontLz);
  AddRoomBlock(sink, {
    x: frontCx.x, z: frontCx.z, ry, width: frontW, depth: frontD,
    eaveY: 3.2, ridgeY: 5.0, seed: `${seed}:front`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1,
    bays: Math.max(3, Math.round(frontW / 3.5) | 1),
  });

  // 门脸：门罩 + 挂匾 + 台阶（升级旧版那个光秃秃的街面）
  AddOfficeGate(sink, f, ry, {
    lx: gateLx, lz: hd, openW: gateW, wallH: OFFICE.yardWallH,
    roofSpan: gateW + 1.4,      // 门道紧贴正房山墙，檐不许宽出去捅进屋面
    seed: `${seed}:gate`, damage: ctx.damage, burnt: ctx.burnt,
  });
  // 临街告示墙：贴在正房的街面上，不占街
  AddNoticeBoards(sink, f, ry, {
    lx: (-hw + frontLx1) / 2 - frontW * 0.22, lz: hd - 0.6, count: 3,
    seed: `${seed}:notice`, burnt: ctx.burnt,
  });

  // 院子的三面墙（正房已经封住临街那一面）
  const wallArgs = { mat, height: OFFICE.yardWallH, thickness: OFFICE.yardWallT, ruin };
  AddOfficeYardWall(sink, f, ry, {
    ...wallArgs, seed: `${seed}:yard`,
    sides: { n: true, w: true, e: true, s: false },
    sideRange: { w: [-hd, hd - frontD - 0.6], e: [-hd, hd - frontD - 0.6] },
  });

  // 门内一座岗亭（警察所只设一岗）
  AddSentryBooth(sink, f, ry, {
    lx: gateLx - 0.2, lz: hd - frontD - 2.2, facing: 1,
    seed: `${seed}:booth`, burnt: ctx.burnt,
  });

  // 院心：旗杆 + 操练小场
  AddFlagPole(sink, f, ry, { lx: -1.2, lz: hd - frontD - 3.6, height: 7.6, seed: `${seed}:flag` });
  AddDrillGround(sink, f, ry, { lx: -1.2, lz: hd - frontD - 6.4, radius: 4.4, seed: `${seed}:drill` });
  AddInspectionCourt(sink, f, ry, {
    lx: -1.2, lz: hd - frontD - 6.3, width: 9.4, depth: 6.2, seed: `${seed}:court`,
  });

  // 后翼：沿旧版保留的那一条较矮的后排房，改为朝院子开门窗
  host.AddFeatureRoom(f, ry, 0, -f.d * 0.30, f.w * 0.52, f.d * 0.20, {
    eaveY: 2.6, ridgeY: 3.9, seed: `${seed}:rearWing`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 3,
  });
}
