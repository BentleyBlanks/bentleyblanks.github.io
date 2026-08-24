// 监狱 + 看守所（城防示意图东北隅）。工作包 A1 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注：Build<Kind>(host, f, ctx)，
// 只 import Script_World / Script_Geo / Script_Noise / Script_LivedInProps / three，
// 一切几何相对 f.x/f.z/f.w/f.d/ctx.ry 落位，尺寸不另起炉灶。
//
// ---------------------------------------------------------------------------
// 为什么它不能长成民居
// ---------------------------------------------------------------------------
// 城防示意图上「监狱」「看守所」只有图注和位置，形制、尺寸一概无资料（全部 PRESUMED）。
// 但羁押设施在俯瞰和街景里必须一眼与四合院分开，靠的是四条**几何**特征，不是贴图：
//
//   ① 围墙比民居院墙高一档：民居 2.0—2.5 m（成年人踮脚能扒，见 Data_HistoryMaterial），
//      监狱取 4.6 m、看守所 3.8 m —— 越过民居屋脊（4.0—4.8 m）的只有监狱那一道。
//   ② 外墙面连续无窗：四面墙是整段的、匀质的、带条石碱脚和瓦压顶的实墙，
//      没有民居那种被门楼/影壁/厢房打断的参差轮廓。
//   ③ 统一的窄开间铁窗节奏：牢房排屋开间 2.2 m（民居 3.0—3.6 m），
//      每间一樘 0.55×0.75 m 的高窗，窗台一律 1.55 m（够不着），三根竖铁栅。
//      一排十五樘同样大小、同样高度的小窗 = 羁押；参差的格子窗 = 住家。
//   ④ 转角岗楼高出围墙一倍（约 9 m 到顶），带枪眼，是天际线上唯一的竖向物。
//
// 另外两条是"过程"上的：单一重门（净宽 1.3 m，窄于民居院门 1.5 m）、
// 门内还有一道二门 —— 进出要过两次门，这是监狱与办公院落的分界。
//
// 铁栅一律用几何做（三根方料），不动 tzm 贴图管线。

import {
  AddLoopholes, AddDoorReveal, AddRoomBlock, AddWell,
} from "./Script_World.mjs";
import {
  MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
import { AddYardWear } from "./Script_LivedInProps.mjs";

// ---------------------------------------------------------------------------
// 推定尺寸（全部为 PRESUMED，依据见报告 WP_A1.md）
// ---------------------------------------------------------------------------
const JAIL = {
  wallHeight: 4.6,        // 监狱围墙高：民居院墙 2.0—2.5 的一倍强，仍低于城墙 10.3
  wallThick: 0.75,
  gateOpenW: 1.3,         // 重门净宽（AddGatehouse 的普通院门是 1.5）
  gateOpenH: 2.6,
  innerGateW: 1.1,        // 二门
  towerShaft: 5.2,        // 岗楼砖身高（顶到 ≈9.0 m）
};
const DETENTION = {
  wallHeight: 3.8,        // 看守所围墙：同族矮一档，仍明显高于民居院墙
  wallThick: 0.6,
  gateOpenW: 1.2,
  gateOpenH: 2.5,
  innerGateW: 1.0,
};
const CELL = {
  bay: 2.2,               // 牢房开间（民居单开间 3.0—3.6）
  eave: 2.9,              // 檐口（民居 2.4—2.8，牢房略高以便高窗）
  slope: 0.50,            // 硬山坡度 tan ≈ 26.6°
  winW: 0.55,
  winH: 0.75,
  sill: 1.55,             // 窗台高：站在牢里够不着的高度
  doorW: 0.92,
  doorH: 1.95,
};

/** 局部坐标 → 世界。+x 沿面阔，+z 指向大门那一面（与 PlaceGeometry 的 ry 同一套右手系）。 */
function Frame(x0, z0, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x0 + cos * lx + sin * lz, z: z0 - sin * lx + cos * lz });
}

/** 局部方向 → 世界方向（给 sink.Cover 的朝向用）。 */
function Dir(ry, nx, nz) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return [cos * nx + sin * nz, -sin * nx + cos * nz];
}

// ---------------------------------------------------------------------------
// 围墙：整段的、匀质的高墙
// ---------------------------------------------------------------------------
/**
 * 一道直墙。分段是为了让墙头随战损参差，不是为了贴图变化 ——
 * 段长取 9.5 m（民居 AddWall 是 0.85 m 一片），监狱墙就该读作"一整片"。
 *
 * @param {object} spec axis "x"=沿局部 x 展开，"z"=沿局部 z 展开；outward 局部外法线
 */
function AddSlabWall(sink, {
  L, ry, cx, cz, length, axis, height, thick, seed,
  ruin = 0, mat = "PrisonWall", tileMat = "RoofTile", outward = [0, 1], segLen = 9.5,
}) {
  if (length <= 0.05) return;
  const count = Math.max(1, Math.round(length / segLen));
  const step = length / count;
  const rnd = Mulberry32(HashString(seed));
  const [fx, fz] = Dir(ry, outward[0], outward[1]);
  for (let i = 0; i < count; i += 1) {
    const off = -length / 2 + step * (i + 0.5);
    const lx = axis === "x" ? cx + off : cx;
    const lz = axis === "x" ? cz : cz + off;
    const bite = ruin * (0.2 + 0.8 * rnd());
    const h = Math.max(1.3, height * (1 - bite));
    const p = L(lx, lz);
    const along = step * 1.01;
    const bw = axis === "x" ? along : thick;
    const bd = axis === "x" ? thick : along;
    sink.Add(mat, PlaceGeometry(
      MakeBox(bw, h, bd, TILE_METERS.brick, `${seed}:b${i}`, BRICK_UV_GRID),
      { x: p.x, y: h / 2, z: p.z, ry }));
    // 条石碱脚：旧砖墙下面那两三皮总是深色的条石，缺了这一笔墙就"浮"着
    sink.Add("Stone", PlaceGeometry(
      MakeBox(axis === "x" ? along : thick + 0.1, 0.55, axis === "x" ? thick + 0.1 : along,
        TILE_METERS.stone, `${seed}:p${i}`),
      { x: p.x, y: 0.275, z: p.z, ry }));
    // 瓦压顶：墙头一条连续的深色线，是"围墙"而不是"挡土墙"的读法
    if (bite < 0.06) {
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(axis === "x" ? along : thick + 0.28, 0.13, axis === "x" ? thick + 0.28 : along,
          TILE_METERS.roof, `${seed}:c${i}`),
        { x: p.x, y: h + 0.065, z: p.z, ry }));
    }
    sink.Solid(p.x, h / 2, p.z,
      axis === "x" ? step / 2 : thick / 2, h / 2, axis === "x" ? thick / 2 : step / 2, "prisonWall", ry);
    sink.Cover(p.x, p.z, h, fx, fz);
  }
}

// ---------------------------------------------------------------------------
// 岗楼
// ---------------------------------------------------------------------------
/**
 * 转角岗楼：条石台基 + 砖身 + 挑出的腰檐 + 四面开枪眼的瞭望间 + 四坡小顶。
 * 到顶约 9 m —— 围墙 4.6、民居脊高 4.0—4.8，所以它是这一片天际线上唯一的竖向物。
 * 内侧靠一架木梯（"可瞭望"的交代；不做可攀爬体，攀爬另有 Data_Ladder 一套）。
 */
function AddGuardTower(sink, {
  L, ry, lx, lz, seed, damage = 0, mat = "PrisonWall", tileMat = "RoofTile",
  inward = [1, 1], shaftH = JAIL.towerShaft,
}) {
  const p = L(lx, lz);
  const footH = 0.6, bandH = 0.34, cabH = 2.05;
  const shaftS = 2.9, cabS = 3.15;
  const shaftTop = footH + shaftH;
  const bandTop = shaftTop + bandH;
  const cabMid = bandTop + cabH / 2;
  const roofY = bandTop + cabH;

  sink.Add("Stone", PlaceGeometry(
    MakeBox(shaftS + 0.6, footH, shaftS + 0.6, TILE_METERS.stone, `${seed}:foot`),
    { x: p.x, y: footH / 2, z: p.z, ry }));
  sink.Add(mat, PlaceGeometry(
    MakeBox(shaftS, shaftH, shaftS, TILE_METERS.brick, `${seed}:shaft`, BRICK_UV_GRID),
    { x: p.x, y: footH + shaftH / 2, z: p.z, ry }));
  sink.Add("Stone", PlaceGeometry(
    MakeBox(cabS + 0.3, bandH, cabS + 0.3, TILE_METERS.stone, `${seed}:band`),
    { x: p.x, y: shaftTop + bandH / 2, z: p.z, ry }));
  sink.Add(mat, PlaceGeometry(
    MakeBox(cabS, cabH, cabS, TILE_METERS.brick, `${seed}:cab`, BRICK_UV_GRID),
    { x: p.x, y: cabMid, z: p.z, ry }));
  sink.Solid(p.x, (footH + shaftH) / 2, p.z, shaftS / 2 + 0.3, (footH + shaftH) / 2,
    shaftS / 2 + 0.3, "prisonWall", ry);
  sink.Solid(p.x, cabMid, p.z, cabS / 2, cabH / 2, cabS / 2, "prisonWall", ry);

  // 四坡小顶：四片斜瓦围一圈（同 AddAlarmTower 的做法，四块板读得出攒尖）
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2;
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(cabS * 1.45, 0.12, cabS * 0.72, TILE_METERS.roof, `${seed}:rf${k}`),
      {
        x: p.x + Math.sin(ry + a) * cabS * 0.30, y: roofY + 0.42,
        z: p.z + Math.cos(ry + a) * cabS * 0.30, ry: ry + a, rx: 0.62,
      }));
  }

  // 枪眼：瞭望间四面各两个，砖身朝外两面各一个
  for (let k = 0; k < 4; k += 1) {
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry: ry + (k * Math.PI) / 2, ys: [cabMid + 0.05], count: 2,
      spread: 1.6, seed: `${seed}:cl${k}`, wallFace: cabS / 2 + 0.04, size: 0.22,
    });
  }
  // 砖身朝外的两面各一个（局部方向 → AddLoopholes 的 ry 偏角：+z→0、+x→π/2、-z→π、-x→-π/2）
  const outAlpha = [
    inward[0] > 0 ? -Math.PI / 2 : Math.PI / 2,
    inward[1] > 0 ? Math.PI : 0,
  ];
  outAlpha.forEach((alpha, k) => {
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry: ry + alpha,
      ys: [footH + shaftH * 0.62], count: 1, spread: 0, seed: `${seed}:sl${k}`,
      wallFace: shaftS / 2 + 0.04, size: 0.22,
    });
  });

  // 内侧木梯：两根帮 + 七级横档（贴在朝院那一面）
  const ladderTop = shaftTop - 0.1;
  const lp = L(lx, lz + inward[1] * (shaftS / 2 + 0.16));
  for (const s of [-1, 1]) {
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.09, ladderTop, 0.09, TILE_METERS.wood, `${seed}:lr${s}`),
      { x: lp.x + s * 0.22 * Math.cos(ry), y: ladderTop / 2, z: lp.z - s * 0.22 * Math.sin(ry), ry }));
  }
  for (let i = 1; i <= 7; i += 1) {
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.52, 0.06, 0.06, TILE_METERS.wood, `${seed}:lg${i}`),
      { x: lp.x, y: (ladderTop * i) / 8, z: lp.z, ry }));
  }
  void damage;
}

// ---------------------------------------------------------------------------
// 重门
// ---------------------------------------------------------------------------
/**
 * 监狱大门：门洞净宽比民居院门更窄，两侧门墩比围墙高出一头，石过梁 + 门额，
 * 一扇门板半开（**必须留可走开口**：门板本身不登记碰撞，门洞两侧才是实体）。
 *
 * cabin=true 时门上加一间带枪眼的警戒室 —— 看守所不设转角岗楼，靠门楼加强。
 */
function AddHeavyGate(sink, {
  L, ry, lx, lz, openW, openH, wallH, thick, seed,
  damage = 0, mat = "PrisonWall", tileMat = "RoofTile", pierW = 1.6, cabin = false,
}) {
  const bodyH = wallH + 0.9;
  const jamb = thick + 0.55;
  for (const s of [-1, 1]) {
    const p = L(lx + s * (openW / 2 + pierW / 2), lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(pierW, bodyH, jamb, TILE_METERS.brick, `${seed}:pier${s}`, BRICK_UV_GRID),
      { x: p.x, y: bodyH / 2, z: p.z, ry }));
    sink.Solid(p.x, bodyH / 2, p.z, pierW / 2, bodyH / 2, jamb / 2, "wall", ry);
    const q = L(lx + s * (openW / 2 + 0.26), lz + jamb / 2 + 0.26);
    sink.Add("Stone", PlaceGeometry(
      MakeBox(0.46, 0.62, 0.46, TILE_METERS.stone, `${seed}:dun${s}`),
      { x: q.x, y: 0.31, z: q.z, ry }));
  }
  const c = L(lx, lz);
  // 石过梁：门洞上一条横贯的亮线
  sink.Add("Stone", PlaceGeometry(
    MakeBox(openW + pierW * 2, 0.46, jamb + 0.08, TILE_METERS.stone, `${seed}:lintel`),
    { x: c.x, y: openH + 0.23, z: c.z, ry }));
  // 洞上补墙：不登记碰撞，人从门洞底下走得过去
  const upH = bodyH - openH - 0.46;
  if (upH > 0.2) {
    sink.Add(mat, PlaceGeometry(
      MakeBox(openW, upH, jamb - 0.06, TILE_METERS.brick, `${seed}:up`, BRICK_UV_GRID),
      { x: c.x, y: openH + 0.46 + upH / 2, z: c.z, ry }));
  }
  // 门额匾
  const plaque = L(lx, lz + jamb / 2 + 0.04);
  sink.Add("Stone", PlaceGeometry(
    MakeBox(1.5, 0.44, 0.09, TILE_METERS.stone, `${seed}:plaque`),
    { x: plaque.x, y: openH + 0.94, z: plaque.z, ry }));

  // 门板：一扇闭一扇半开。两扇都不登记碰撞 —— 门洞必须能走人。
  const leafW = openW / 2 - 0.02;
  const leafH = openH - 0.12;
  for (const s of [-1, 1]) {
    const ang = s < 0 ? 0.0 : 1.22;           // 右扇半开约 70°
    const pivotX = lx + s * (openW / 2);
    const dx = -s * Math.cos(ang), dz = -Math.sin(ang);
    const cxL = pivotX + dx * (leafW / 2);
    const czL = lz + dz * (leafW / 2);
    const lp = L(cxL, czL);
    const leafRy = ry + (s < 0 ? 0 : Math.PI - ang);
    sink.Add("WoodDoor", PlaceGeometry(
      MakeBox(leafW, leafH, 0.13, TILE_METERS.wood, `${seed}:leaf${s}`),
      { x: lp.x, y: leafH / 2 + 0.08, z: lp.z, ry: leafRy }));
    // 铁箍：三条横带，把门板读成"包铁的重门"而不是一块木板
    for (let i = 0; i < 3; i += 1) {
      sink.Add("IronPlate", PlaceGeometry(
        MakeBox(leafW * 0.96, 0.12, 0.17, TILE_METERS.wood, `${seed}:band${s}${i}`),
        { x: lp.x, y: 0.42 + i * (leafH * 0.32), z: lp.z, ry: leafRy }));
    }
  }
  // 门槛石 + 门道墁地 + 木门框（局部 +z 指向"里"，故转 180°）
  AddDoorReveal(sink, {
    x: c.x, z: c.z, ry: ry + Math.PI, openW, openH, depth: jamb + 1.3,
    seed: `${seed}:rv`, paving: "Stone", sill: "Stone",
  });

  if (cabin) {
    // 门上警戒室：看守所不设转角岗楼，就靠这一间把"有人在上头看着"交代掉
    const cabH = 2.0, cabW = openW + pierW * 2 - 0.5, cabD = jamb + 0.5;
    sink.Add(mat, PlaceGeometry(
      MakeBox(cabW, cabH, cabD, TILE_METERS.brick, `${seed}:cab`, BRICK_UV_GRID),
      { x: c.x, y: bodyH + cabH / 2, z: c.z, ry }));
    sink.Solid(c.x, bodyH + cabH / 2, c.z, cabW / 2, cabH / 2, cabD / 2, "wall", ry);
    for (const k of [0, 2]) {
      AddLoopholes(sink, {
        x: c.x, z: c.z, ry: ry + (k * Math.PI) / 2, ys: [bodyH + cabH * 0.6], count: 2,
        spread: cabW * 0.5, seed: `${seed}:cl${k}`, wallFace: cabD / 2 + 0.04, size: 0.22,
      });
    }
    for (const s of [-1, 1]) {
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(cabW + 0.7, 0.12, cabD * 0.78, TILE_METERS.roof, `${seed}:crf${s}`),
        { x: c.x + Math.sin(ry) * s * cabD * 0.26, y: bodyH + cabH + 0.28,
          z: c.z + Math.cos(ry) * s * cabD * 0.26, ry, rx: s * 0.52 }));
    }
  } else {
    // 门楼小瓦顶：两坡 + 一条脊
    for (const s of [-1, 1]) {
      sink.Add(tileMat, PlaceGeometry(
        MakeBox(openW + pierW * 2 + 0.8, 0.12, (jamb + 0.9) * 0.62, TILE_METERS.roof, `${seed}:rf${s}`),
        { x: c.x + Math.sin(ry) * s * (jamb + 0.9) * 0.24, y: bodyH + 0.34,
          z: c.z + Math.cos(ry) * s * (jamb + 0.9) * 0.24, ry, rx: s * 0.55 }));
    }
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(openW + pierW * 2 + 0.9, 0.16, 0.3, TILE_METERS.roof, `${seed}:ridge`),
      { x: c.x, y: bodyH + 0.62, z: c.z, ry }));
  }
  void damage;
}

// ---------------------------------------------------------------------------
// 牢房排屋
// ---------------------------------------------------------------------------
/**
 * 窄开间牢房排屋。**三面完全无窗**，只有朝院的一面开一排等高等大的铁窗。
 *
 * @param {object} spec facing +1 = 铁窗那面朝局部 +z；-1 = 朝局部 -z
 */
function AddCellRow(sink, {
  L, ry, lx, lz, width, depth, seed, damage = 0, facing = 1,
  mat = "PrisonWall", tileMat = "RoofTile", doorEvery = 5,
}) {
  const bays = Math.max(3, Math.round(width / CELL.bay));
  const bayW = width / bays;
  const eave = CELL.eave;
  const ridge = eave + (depth / 2) * CELL.slope;
  const t = 0.42;
  const halfD = depth / 2;
  const frontZ = lz + facing * halfD;
  const backZ = lz - facing * halfD;
  const faceOut = Dir(ry, 0, facing);

  // --- 背立面与两山：连续实墙，一个洞都没有（这一条比铁窗更能说明是牢房）---
  sink.Add(mat, PlaceGeometry(
    MakeBox(width, eave, t, TILE_METERS.brick, `${seed}:back`, BRICK_UV_GRID),
    { x: L(lx, backZ).x, y: eave / 2, z: L(lx, backZ).z, ry }));
  sink.Add("Stone", PlaceGeometry(
    MakeBox(width + 0.06, 0.42, t + 0.1, TILE_METERS.stone, `${seed}:backpl`),
    { x: L(lx, backZ).x, y: 0.21, z: L(lx, backZ).z, ry }));
  for (const s of [-1, 1]) {
    const p = L(lx + s * (width / 2), lz);
    sink.Add(mat, PlaceGeometry(
      MakeBox(t, eave, depth, TILE_METERS.brick, `${seed}:end${s}`, BRICK_UV_GRID),
      { x: p.x, y: eave / 2, z: p.z, ry }));
  }

  // --- 朝院一面：等间距的窄铁窗 + 每五间一扇牢门 ---
  const pierW = (bayW - CELL.winW) / 2;
  const upperH = Math.max(0.2, eave - CELL.sill - CELL.winH);
  for (let b = 0; b < bays; b += 1) {
    const off = -width / 2 + bayW * (b + 0.5);
    const isDoor = b % doorEvery === 2;
    const p = L(lx + off, frontZ);
    if (isDoor) {
      // 牢门：两侧填墙 + 木过梁 + 门槛 + 一扇厚门板
      const fill = (bayW - CELL.doorW) / 2;
      for (const s of [-1, 1]) {
        const q = L(lx + off + s * (CELL.doorW / 2 + fill / 2), frontZ);
        sink.Add(mat, PlaceGeometry(
          MakeBox(fill, eave, t, TILE_METERS.brick, `${seed}:df${b}${s}`, BRICK_UV_GRID),
          { x: q.x, y: eave / 2, z: q.z, ry }));
      }
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(CELL.doorW + 0.3, 0.18, t + 0.06, TILE_METERS.wood, `${seed}:dl${b}`),
        { x: p.x, y: CELL.doorH + 0.09, z: p.z, ry }));
      const overH = Math.max(0.15, eave - CELL.doorH - 0.18);
      sink.Add(mat, PlaceGeometry(
        MakeBox(CELL.doorW, overH, t, TILE_METERS.brick, `${seed}:do${b}`, BRICK_UV_GRID),
        { x: p.x, y: CELL.doorH + 0.18 + overH / 2, z: p.z, ry }));
      const sillP = L(lx + off, frontZ + facing * (t / 2 + 0.12));
      sink.Add("Stone", PlaceGeometry(
        MakeBox(CELL.doorW + 0.34, 0.14, 0.42, TILE_METERS.stone, `${seed}:dsl${b}`),
        { x: sillP.x, y: 0.07, z: sillP.z, ry }));
      const leafP = L(lx + off, frontZ + facing * (t / 2 - 0.02));
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(CELL.doorW - 0.05, CELL.doorH - 0.06, 0.11, TILE_METERS.wood, `${seed}:dd${b}`),
        { x: leafP.x, y: (CELL.doorH - 0.06) / 2 + 0.05, z: leafP.z, ry }));
      for (let i = 0; i < 2; i += 1) {
        sink.Add("IronPlate", PlaceGeometry(
          MakeBox(CELL.doorW - 0.1, 0.11, 0.15, TILE_METERS.wood, `${seed}:db${b}${i}`),
          { x: leafP.x, y: 0.55 + i * 0.86, z: leafP.z, ry }));
      }
      continue;
    }
    // 窗下墙 + 窗上墙 + 两侧窗间墙
    sink.Add(mat, PlaceGeometry(
      MakeBox(bayW, CELL.sill, t, TILE_METERS.brick, `${seed}:lo${b}`, BRICK_UV_GRID),
      { x: p.x, y: CELL.sill / 2, z: p.z, ry }));
    sink.Add(mat, PlaceGeometry(
      MakeBox(bayW, upperH, t, TILE_METERS.brick, `${seed}:hi${b}`, BRICK_UV_GRID),
      { x: p.x, y: CELL.sill + CELL.winH + upperH / 2, z: p.z, ry }));
    for (const s of [-1, 1]) {
      const q = L(lx + off + s * (CELL.winW / 2 + pierW / 2), frontZ);
      sink.Add(mat, PlaceGeometry(
        MakeBox(pierW, CELL.winH, t, TILE_METERS.brick, `${seed}:pi${b}${s}`, BRICK_UV_GRID),
        { x: q.x, y: CELL.sill + CELL.winH / 2, z: q.z, ry }));
    }
    // 洞里的暗：一块深色挡板退到墙厚里侧（同 AddDugout 的做法，读作"里面是暗的"）
    const backP = L(lx + off, frontZ - facing * (t / 2 + 0.06));
    sink.Add("Charred", PlaceGeometry(
      MakeBox(CELL.winW + 0.06, CELL.winH + 0.04, 0.1, TILE_METERS.stone, `${seed}:wd${b}`),
      { x: backP.x, y: CELL.sill + CELL.winH / 2, z: backP.z, ry }));
    // 三根竖铁栅（几何做，不动 tzm 贴图管线）
    const barP = L(lx + off, frontZ + facing * (t / 2 + 0.01));
    for (let i = 0; i < 3; i += 1) {
      sink.Add("IronPlate", PlaceGeometry(
        MakeBox(0.045, CELL.winH + 0.06, 0.09, TILE_METERS.wood, `${seed}:bar${b}${i}`),
        { x: barP.x + Math.cos(ry) * (-0.17 + i * 0.17), y: CELL.sill + CELL.winH / 2,
          z: barP.z - Math.sin(ry) * (-0.17 + i * 0.17), ry }));
    }
    // 窗台石：一条挑出的亮线，是"窗"而不是"墙上的斑"的读法
    const sp = L(lx + off, frontZ + facing * (t / 2 + 0.06));
    sink.Add("Stone", PlaceGeometry(
      MakeBox(CELL.winW + 0.34, 0.1, 0.3, TILE_METERS.stone, `${seed}:sl${b}`),
      { x: sp.x, y: CELL.sill - 0.05, z: sp.z, ry }));
  }

  // --- 硬山瓦顶 ---
  const rise = ridge - eave;
  const slopeLen = Math.hypot(halfD, rise);
  const overhang = 0.34;
  for (const s of [-1, 1]) {
    const p = L(lx, lz + s * (halfD / 2));
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(width + overhang * 2, 0.12, slopeLen + overhang, TILE_METERS.roof, `${seed}:rs${s}`),
      { x: p.x, y: eave + rise / 2, z: p.z, ry, rx: s * Math.atan2(rise, halfD) }));
  }
  const rp = L(lx, lz);
  sink.Add(tileMat, PlaceGeometry(
    MakeBox(width + overhang * 2, 0.18, 0.34, TILE_METERS.roof, `${seed}:ridge`),
    { x: rp.x, y: ridge + 0.06, z: rp.z, ry }));
  // 硬山两端高出屋面的山墙
  for (const s of [-1, 1]) {
    const parts = [];
    const steps = 4;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const hh = eave + rise * (1 - Math.abs(t0 + t1 - 1));
      const segD = depth / steps;
      parts.push(PlaceGeometry(
        MakeBox(0.3, hh, segD, TILE_METERS.brick, `${seed}:g${s}${i}`),
        { x: 0, y: hh / 2, z: -depth / 2 + segD * (i + 0.5) }));
    }
    const p = L(lx + s * (width / 2 + 0.14), lz);
    sink.Add(mat, PlaceGeometry(MergeGeometries(parts), { x: p.x, y: 0, z: p.z, ry }));
  }

  const c = L(lx, lz);
  sink.Solid(c.x, eave / 2, c.z, width / 2 + 0.2, eave / 2, halfD, "wall", ry);
  const fc = L(lx, frontZ);
  sink.Cover(fc.x, fc.z, eave, faceOut[0], faceOut[1]);
  void damage;
}

/** 院内的一道矮隔墙 + 一扇窄门（二门／放风院的分格墙）。 */
function AddInnerGate(sink, {
  L, ry, lx, lz, length, axis, height, openW, seed, mat = "PrisonWall", tileMat = "RoofTile",
  thick = 0.42, ruin = 0,
}) {
  const segLen = (length - openW) / 2;
  for (const s of [-1, 1]) {
    const off = s * (openW / 2 + segLen / 2);
    AddSlabWall(sink, {
      L, ry, cx: axis === "x" ? lx + off : lx, cz: axis === "x" ? lz : lz + off,
      length: segLen, axis, height, thick, seed: `${seed}:w${s}`, ruin, mat, tileMat,
      outward: axis === "x" ? [0, 1] : [1, 0], segLen: 7,
    });
  }
  const c = L(lx, lz);
  const openH = Math.min(2.15, height - 0.5);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(openW + 0.5, 0.2, thick + 0.12, TILE_METERS.wood, `${seed}:lintel`),
    { x: c.x, y: openH + 0.1, z: c.z, ry: axis === "x" ? ry : ry + Math.PI / 2 }));
  const overH = Math.max(0.1, height - openH - 0.2);
  sink.Add(mat, PlaceGeometry(
    MakeBox(axis === "x" ? openW : thick, overH, axis === "x" ? thick : openW,
      TILE_METERS.brick, `${seed}:over`, BRICK_UV_GRID),
    { x: c.x, y: openH + 0.2 + overH / 2, z: c.z, ry }));
  AddDoorReveal(sink, {
    x: c.x, z: c.z, ry: ry + (axis === "x" ? Math.PI : -Math.PI / 2),
    openW, openH, depth: thick + 0.9, seed: `${seed}:rv`, paving: "Stone", sill: "Stone",
  });
}

// ---------------------------------------------------------------------------
// 监狱
// ---------------------------------------------------------------------------
export function BuildPrison(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const damage = ctx.damage ?? 0;
  const burnt = !!ctx.burnt;
  const mat = burnt ? "BrickWallSooty" : "PrisonWall";
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const seed = `map:${f.id}`;
  const L = Frame(f.x, f.z, ry);
  const hw = f.w / 2, hd = f.d / 2;
  const ruin = Clamp(damage * 0.5, 0, 0.5);
  const H = JAIL.wallHeight, T = JAIL.wallThick;

  // --- 围墙四面。大门在局部 +z 那一面，只此一处开口 ---
  const gateSpan = JAIL.gateOpenW + 3.2;
  const frontSeg = (f.w - gateSpan) / 2;
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * (gateSpan / 2 + frontSeg / 2), cz: hd, length: frontSeg, axis: "x",
      height: H, thick: T, seed: `${seed}:fw${s}`, ruin, mat, tileMat, outward: [0, 1],
    });
  }
  AddSlabWall(sink, {
    L, ry, cx: 0, cz: -hd, length: f.w, axis: "x", height: H, thick: T,
    seed: `${seed}:bw`, ruin, mat, tileMat, outward: [0, -1],
  });
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * hw, cz: 0, length: f.d, axis: "z", height: H, thick: T,
      seed: `${seed}:sw${s}`, ruin, mat, tileMat, outward: [s, 0],
    });
  }

  // --- 重门 ---
  AddHeavyGate(sink, {
    L, ry, lx: 0, lz: hd, openW: JAIL.gateOpenW, openH: JAIL.gateOpenH,
    wallH: H, thick: T, seed: `${seed}:gate`, damage, mat, tileMat,
  });
  // 门墩上的枪眼：巷战里这道门是要守的
  for (const s of [-1, 1]) {
    const p = L(s * 1.45, hd);
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry, ys: [3.3], count: 1, spread: 0,
      seed: `${seed}:gl${s}`, wallFace: (T + 0.55) / 2 + 0.04, size: 0.22,
    });
  }

  // --- 转角岗楼：门口一座、对角一座，两座就能看住四面墙 ---
  AddGuardTower(sink, {
    L, ry, lx: hw - 1.4, lz: hd - 1.4, seed: `${seed}:twA`, damage, mat, tileMat,
    inward: [-1, -1],
  });
  AddGuardTower(sink, {
    L, ry, lx: -hw + 1.4, lz: -hd + 1.4, seed: `${seed}:twB`, damage, mat, tileMat,
    inward: [1, 1],
  });

  // --- 一进：门房／值房两块 + 二门；两侧再用实墙接到围墙，一进二进真正隔开 ---
  const dutyZ = hd - 6.5;             // 前院进深 6.5 m
  const dutyD = 5.0;
  const dutyW = Math.min(11, Math.max(6, hw - 6));
  const septumZ = dutyZ - dutyD / 2;
  for (const s of [-1, 1]) {
    const p = L(s * (2.6 + dutyW / 2), septumZ);
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry, width: dutyW, depth: dutyD,
      eaveY: 2.75, ridgeY: 2.75 + dutyD * 0.5 * 0.5,
      seed: `${seed}:duty${s}`, damage, burnt, facing: -1,
      bays: Math.max(2, Math.round(dutyW / 3.4)),      // 值房是办公用房，开间照民居 3.0—3.6
    });
    const flankStart = 2.6 + dutyW;
    const flankLen = hw - flankStart;
    if (flankLen > 0.6) {
      AddSlabWall(sink, {
        L, ry, cx: s * (flankStart + flankLen / 2), cz: septumZ, length: flankLen, axis: "x",
        height: 3.6, thick: 0.42, seed: `${seed}:sep${s}`, ruin: ruin * 0.7,
        mat, tileMat, outward: [0, 1], segLen: 7,
      });
    }
  }
  AddInnerGate(sink, {
    L, ry, lx: 0, lz: septumZ, length: 5.2, axis: "x", height: 3.6,
    openW: JAIL.innerGateW, seed: `${seed}:inner`, mat, tileMat, ruin: ruin * 0.6,
  });

  // --- 二进：放风院（分两格）+ 两排牢房，中间一条甬道 ---
  const yardFront = dutyZ - dutyD;            // 放风院前沿
  const cellW = Math.min(f.w - 10, 33);
  const cellD = 5.6;
  const rowAZ = yardFront - 4.2 - cellD / 2;  // 放风院进深 4.2
  const corridor = 2.8;                       // 两排牢房之间的甬道
  const rowBZ = rowAZ - cellD - corridor;

  AddSlabWall(sink, {
    L, ry, cx: 0, cz: (yardFront + (rowAZ + cellD / 2)) / 2, length: yardFront - (rowAZ + cellD / 2),
    axis: "z", height: 2.4, thick: 0.36, seed: `${seed}:pen`, ruin: ruin * 0.8,
    mat, tileMat, outward: [1, 0], segLen: 6,
  });
  for (const s of [-1, 1]) {
    const p = L(s * (cellW / 4), yardFront - 2.4);
    AddYardWear(sink, { x: p.x, z: p.z, ry, baseY: 0, seed: `${seed}:yard${s}`, radius: 3.6 });
  }

  AddCellRow(sink, {
    L, ry, lx: 0, lz: rowAZ, width: cellW, depth: cellD,
    seed: `${seed}:rowA`, damage, facing: 1, mat, tileMat,
  });
  AddCellRow(sink, {
    L, ry, lx: 0, lz: rowBZ, width: cellW, depth: cellD,
    seed: `${seed}:rowB`, damage, facing: 1, mat, tileMat,
  });

  // --- 后院：伙房／杂房 + 一口井 ---
  const backZ = rowBZ - cellD / 2;            // 后排牢房的背墙
  const backRun = backZ + hd;                 // 背墙到围墙的净距
  if (backRun > 4.6) {
    const kitchenD = Math.min(4.2, backRun - 2.0);
    const kitchenZ = -hd + backRun / 2;
    const p = L(-hw + 8.0, kitchenZ);
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry, width: 11, depth: kitchenD,
      eaveY: 2.6, ridgeY: 2.6 + kitchenD * 0.5 * 0.5,
      seed: `${seed}:kitchen`, damage, burnt, facing: -1, bays: 2, roofRafters: false,
    });
    const w = L(hw - 6.0, kitchenZ);
    AddWell(sink, w.x, w.z);
  }
}

// ---------------------------------------------------------------------------
// 看守所：同族小一号
// ---------------------------------------------------------------------------
export function BuildDetention(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const damage = ctx.damage ?? 0;
  const burnt = !!ctx.burnt;
  const mat = burnt ? "BrickWallSooty" : "PrisonWall";
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const seed = `map:${f.id}`;
  const L = Frame(f.x, f.z, ry);
  const hw = f.w / 2, hd = f.d / 2;
  const ruin = Clamp(damage * 0.55, 0, 0.55);
  const H = DETENTION.wallHeight, T = DETENTION.wallThick;

  // --- 围墙：同样是连续无窗的实墙，只是矮一档 ---
  const gateSpan = DETENTION.gateOpenW + 3.0;
  const frontSeg = (f.w - gateSpan) / 2;
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * (gateSpan / 2 + frontSeg / 2), cz: hd, length: frontSeg, axis: "x",
      height: H, thick: T, seed: `${seed}:fw${s}`, ruin, mat, tileMat, outward: [0, 1], segLen: 8,
    });
  }
  AddSlabWall(sink, {
    L, ry, cx: 0, cz: -hd, length: f.w, axis: "x", height: H, thick: T,
    seed: `${seed}:bw`, ruin, mat, tileMat, outward: [0, -1], segLen: 8,
  });
  for (const s of [-1, 1]) {
    AddSlabWall(sink, {
      L, ry, cx: s * hw, cz: 0, length: f.d, axis: "z", height: H, thick: T,
      seed: `${seed}:sw${s}`, ruin, mat, tileMat, outward: [s, 0], segLen: 8,
    });
  }

  // --- 门楼加强（无转角岗楼，警戒室做在门上）---
  AddHeavyGate(sink, {
    L, ry, lx: 0, lz: hd, openW: DETENTION.gateOpenW, openH: DETENTION.gateOpenH,
    wallH: H, thick: T, seed: `${seed}:gate`, damage, mat, tileMat, pierW: 1.4, cabin: true,
  });

  // --- 一进：值房横排，东端留过道通后院 ---
  const dutyD = 4.6;
  const dutyZ = hd - 4.5 - dutyD / 2;
  const dutyW = Math.min(f.w - 8.0, 14);
  const dutyLx = -(hw - 1.0 - dutyW / 2);        // 值房贴一侧围墙，另一端让出过道
  const dutyP = L(dutyLx, dutyZ);
  AddRoomBlock(sink, {
    x: dutyP.x, z: dutyP.z, ry, width: dutyW, depth: dutyD,
    eaveY: 2.7, ridgeY: 2.7 + dutyD * 0.5 * 0.5,
    seed: `${seed}:duty`, damage, burnt, facing: -1,
    bays: Math.max(2, Math.round(dutyW / 3.4)),
  });
  // 值房东端到围墙之间的过道，横一道二门（窄门，同监狱的形制）——
  // 值房 + 这道墙合起来就是把前院与押房院隔开的那一进。
  const laneStart = dutyLx + dutyW / 2;
  const laneLen = hw - laneStart;
  if (laneLen > DETENTION.innerGateW + 1.2) {
    AddInnerGate(sink, {
      L, ry, lx: laneStart + laneLen / 2, lz: dutyZ + dutyD / 2, length: laneLen, axis: "x",
      height: 3.0, openW: DETENTION.innerGateW, seed: `${seed}:inner`, mat, tileMat,
      ruin: ruin * 0.6,
    });
  }

  // --- 二进：押房 ---
  const cellW = Math.min(f.w - 7.0, 22);
  const cellD = 5.6;
  const cellZ = -hd + 3.4 + cellD / 2;
  AddCellRow(sink, {
    L, ry, lx: 0, lz: cellZ, width: cellW, depth: cellD,
    seed: `${seed}:cells`, damage, facing: 1, mat, tileMat, doorEvery: 4,
  });
  const yp = L(0, cellZ + cellD / 2 + 2.2);
  AddYardWear(sink, { x: yp.x, z: yp.z, ry, baseY: 0, seed: `${seed}:yard`, radius: 3.2 });
}
