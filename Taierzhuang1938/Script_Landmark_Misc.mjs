// 杂项占位升级包：区公所 / 王家祠堂 / 人民书店 / 空心炮台 / 龙泉塔战损态 / 弘道院剪影。
// 工作包 D6 专属文件。契约见 Script_LandmarkRegistry.mjs 头注。
//
// 本轮（第二轮批次 D）把六件白盒桩全部重做，重点是**内部空间**：
//   districtOffice 第二区公所 —— 机关院：大门门屋 + 门外告示墙 + 门岗 + 影壁 + 二门横墙 +
//                     **可进入的办公正房**（三门七间、桌案成列）+ 两列办公厢 + 后罩房 + 旗杆。
//                     门脸/影壁/旗杆的语言与 Script_Landmark_Commerce.BuildOffice 同源
//                     （SiteFrame / Slab / SolidSlab / Room 四个私有小工具是照那边抄的，
//                      不 import：那四个函数在 Commerce 里没导出，抄比改共享文件安全）。
//   shrine 王家祠堂 —— 祠堂形制：门屋 + 甬路 + **抬高台基的享堂（可进入）** +
//                     享堂内的龛位墙（三层神主牌位）与祭案（香炉／烛台／蒲团）+ 庭中一株柏 +
//                     东西两间耳房（祭器房／守祠人）。不是普通四合院。
//   shop 人民书店 —— 书铺门脸：排门板（明间已开板、次间只开一块）+ 柜台 + 三排书架，
//                     板壁后一间**门帘遮挡的暗间**（1931 年中共滕县特支驻地，叙事点不是玩法点）。
//   hollowFort 空心炮台 ×2 —— 1908 制式**圆形空心炮台**：16 分段环壁（外 r 6.0 / 内 r 4.4）+
//                     中心砖墩 r 2.2 ⇒ 中间是一圈 2.2 m 宽的**可走环廊**；两层射孔一圈；
//                     背面（朝城一侧）一个净宽 1.6 m 的门洞；环廊里一道 14 级螺旋砖阶
//                     上到露天顶台（楔形铺板，留一个上人口）+ 女儿墙一圈。
//                     环壁碰撞是**逐段**登记的，不是一个 11×11 的大盒 —— 人要能进去。
//   pagoda 龙泉塔 —— 1938 年 3 月战损态：**塔刹已倾毁、顶层塔室部分倾塌、挑檐斗拱脱落**
//                     （docs/Data_TengxianCity.md §4.4 + §7 一手/主流记载）。
//                     挑檐改成逐面独立的八块，缺角是**真的缺一块**而不是一整圈；
//                     顶层用八片独立墙板搭，塌掉的那几片直接不生成，露出楼面。
//                     完整塔形（含 1984 年新装的宝葫芦塔刹）不许再出现。
//   silhouetteCluster 弘道院 —— 仍**只做远景剪影**（farSink，不可进入），但给出层次：
//                     坡顶方向交错、两层与单层交替、一栋带小钟塔、外加一圈围墙与一座校门。
//
// 尺寸基准 docs/Data_HistoryMaterial.md：单开间 3.0—3.6 m、三开间正房 9—11 m、进深 4.5—6 m、
// 檐口 2.4—2.8 m、脊高 4.0—4.8 m、硬山坡度 26°—29°、院墙 2.0—2.5 m、门楼 3.5—4.5 m。
// 凡高出这几档的（机关院墙、门屋、享堂台基、炮台环壁、塔身分级）都是本包的 PRESUMED，已列进交付报告。
//
// 两条落地时踩到的坑（后来者注意）：
//   ① 本文件统一用 Commerce 的「场地坐标」：局部 +z = 门／临街那一侧。它与
//      PlaceGeometry(ry) 之后几何体自己的 +z **反向**；要往几何 +z 摆（AddDoorReveal 的
//      「朝里」、AddLoopholes 的 wallFace）直接把同一个 ry 传过去，两边约定就一致了。
//   ② `hollowFort` 是 BuildOutskirts 直接派发的，ctx 传的是**空对象** `{}` ——
//      ctx.damage / ctx.burnt / ctx.ry 全是 undefined，本文件必须自己兜默认值。
//      而且城外地面不是 y=0（CITY.outerY = -1.2 + 起伏），所有构件都要压 host.OuterHeight，
//      AddWall/AddRoomBlock 这类恒从 y=0 起砌的函数在城外**不能用**。

import * as THREE from "three";
import {
  AddWall, AddRoomBlock, AddHardMountainRoof, AddDoorReveal,
  AddLoopholes, AddCypress, AddSquareFort, SolidWithOpenings,
} from "./Script_World.mjs";
import {
  MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { AddYardWear } from "./Script_LivedInProps.mjs";
import { AddYardWallRing } from "./Script_YardWall.mjs";

const DEG = Math.PI / 180;
const SLOPE27 = Math.tan(27 * DEG);
const SLOPE275 = Math.tan(27.5 * DEG);

// ---------------------------------------------------------------------------
// 私有小工具（与 Script_Landmark_Commerce 同一套约定，见文件头注）
// ---------------------------------------------------------------------------

/** 地块局部坐标 → 世界坐标。局部 +x = 面阔方向，局部 **+z = 朝门/临街的那一侧**。 */
function SiteFrame(f, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return {
    cos, sin,
    At(lx, lz) { return { x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz }; },
  };
}

/** 一块摆好位置的方料。楼层、台基、过梁这些不落地的构件只能这么砌（AddWall 恒从 y=0 起）。 */
function Slab(sink, material, p, y, w, h, d, ry, seed, { rx = 0, rz = 0, tile = TILE_METERS.brick, grid = null } = {}) {
  sink.Add(material, PlaceGeometry(MakeBox(w, h, d, tile, seed, grid), { x: p.x, y, z: p.z, ry, rx, rz }));
}

/** 不落地构件的碰撞：AddWall/AddRoomBlock 自带 Solid，自砌的方料要自己登记。 */
function SolidSlab(sink, p, cy, hx, hy, hz, ry, tag = "wall") {
  sink.Solid(p.x, cy, p.z, hx, hy, hz, tag, ry);
}

/** 摆一栋附属房：位置在**父地块**的场地坐标里算，房子自己的朝向另给。侵街就整栋省掉。 */
function Room(host, f, ry, lx, lz, spec) {
  const p = SiteFrame(f, ry).At(lx, lz);
  if (host.OnStreet(p.x, p.z, spec.width / 2, spec.depth / 2)) return false;
  AddRoomBlock(host.sink, {
    x: p.x, z: p.z, ry: spec.ry ?? ry, width: spec.width, depth: spec.depth,
    eaveY: spec.eaveY, ridgeY: spec.ridgeY, seed: spec.seed,
    damage: spec.damage, burnt: spec.burnt, facing: spec.facing, bays: spec.bays,
    roofRafters: spec.roofRafters === true,
  });
  return true;
}

/**
 * 一圈院墙，临街那面（局部 +z）中间留 openW 的开口。走样条围墙 PCG
 * （Script_YardWall → Script_WallSpline），四角由管线互搭。
 *
 * cope 默认只给临街那一面：旧账是「瓦压顶按段生成，一圈 248 m 全给就是
 * +3.5k 三角」；转实例化之后压顶是**同一只几何摆 N 次**，那笔三角账没了，
 * 但读图账还在 —— 背面那两道墙十几米外读不出压顶，仍然不给。
 * 现在按 `copeSides` 逐面控制（默认只有临街 s 面）。
 */
function AddYardWall(sink, f, ry, o) {
  const S = SiteFrame(f, ry);
  const frame = (lx, lz) => S.At(lx, lz);
  const copeAll = o.cope === true;
  const copeNone = o.cope === false;
  const plinth = o.plinth
    ? { material: o.plinth, height: 0.42, grow: 0.06, out: 0.07 } : null;
  const cope = { material: "RoofTile", height: 0.09, grow: 0.05, out: 0.16, minH: 0.55 };
  const common = {
    frame, hw: f.w / 2, hd: f.d / 2,
    material: o.material, height: o.height, thickness: o.thickness,
    ruin: o.ruin, plinth,
    gates: o.openW > 0 ? [{ side: "s", offset: 0, openW: o.openW }] : [],
    ...(o.tune || {}),
  };
  if (copeAll || copeNone) {
    AddYardWallRing(sink, {
      ...common, preset: copeNone ? "landmarkYardPlain" : "landmarkYard",
      seed: o.seed, cope: copeNone ? null : cope,
    });
    return;
  }
  // 临街一面上压顶，另外三面不上：两趟建，各自只留自己那几面的模块。
  // 种子共用 o.seed —— 弧长哈希取种，两趟在同一条线上算出的是同一批模块，
  // 高度/姿态/tint 逐位一致，接缝处不会错开。
  AddYardWallRing(sink, {
    ...common, preset: "landmarkYard", seed: o.seed, cope,
    sides: { n: false, w: false, e: false, s: true },
  });
  AddYardWallRing(sink, {
    ...common, preset: "landmarkYardPlain", seed: o.seed, cope: null,
    plinth: plinth ? { ...plinth } : null,
    sides: { n: true, w: true, e: true, s: false },
  });
}

/**
 * 一座门屋：两墩夹一个门洞 + 过梁 + 门额墙 + 硬山小瓦顶。
 * 与 AddGatehouse（民居门楼，净宽 1.5、无山面）的区别是：它有**面阔与进深**，
 * 是一栋房子而不是一段加厚的墙 —— 官署与祠堂的门是这样的。
 */
function AddGateHall(sink, S, lz, ry, o) {
  const { width, depth, openW, openH, eaveY, seed, ruin = 0, mat = "BrickWall", tileMat = "RoofTile" } = o;
  const ridgeY = eaveY + (depth / 2) * SLOPE27;
  const segW = (width - openW) / 2;
  for (const side of [-1, 1]) {
    const p = S.At(side * (openW / 2 + segW / 2), lz);
    Slab(sink, mat, p, eaveY / 2, segW, eaveY, depth, ry, `${seed}:pier${side}`, { grid: BRICK_UV_GRID });
    SolidSlab(sink, p, eaveY / 2, segW / 2, eaveY / 2, depth / 2, ry);
    const dun = S.At(side * (openW / 2 + 0.28), lz + depth / 2 - 0.2);
    Slab(sink, "Stone", dun, 0.3, 0.55, 0.6, 0.55, ry, `${seed}:dun${side}`, { tile: TILE_METERS.stone });
  }
  const g = S.At(0, lz);
  Slab(sink, "WoodBeam", g, openH + 0.17, openW + 0.9, 0.34, depth * 0.62, ry, `${seed}:lin`, { tile: TILE_METERS.wood });
  Slab(sink, mat, g, (openH + 0.34 + eaveY) / 2, openW + 0.6, eaveY - openH - 0.34, depth, ry,
    `${seed}:up`, { grid: BRICK_UV_GRID });
  SolidSlab(sink, g, (openH + 0.34 + eaveY) / 2, openW / 2 + 0.3, (eaveY - openH - 0.34) / 2, depth / 2, ry);
  AddDoorReveal(sink, {
    x: g.x, z: g.z, ry, openW, openH, depth: depth + 0.5, seed: `${seed}:rv`,
  });
  // 门板：一扇敞着贴在门道壁上，一扇歪着 —— 打了半个月的城不会有齐整关着的门
  if (ruin < 0.6) {
    for (const s of [-1, 1]) {
      const dp = S.At(s * (openW / 2 - 0.09), lz - depth * 0.28);
      Slab(sink, "WoodDoor", dp, openH / 2, 0.16, openH - 0.06, openW / 2 - 0.05, ry,
        `${seed}:door${s}`, { tile: TILE_METERS.wood });
    }
  }
  const rp = S.At(0, lz);
  AddHardMountainRoof(sink, {
    x: rp.x, z: rp.z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`, rafters: false,
  });
  void tileMat;
  return ridgeY;
}

/**
 * 一张桌案：桌面 + 两侧板腿 + 牙板。三块方料 36 三角，屋里摆六张也只有 200 出头。
 * 家具一律走 sink（合批 + 破坏一致），不做单独的 prop mesh。
 */
function AddDesk(sink, p, ry, seed, { w = 1.35, d = 0.68, h = 0.78, mat = "WoodDoor" } = {}) {
  Slab(sink, mat, p, h, w, 0.07, d, ry, `${seed}:top`, { tile: TILE_METERS.wood });
  for (const s of [-1, 1]) {
    Slab(sink, mat, { x: p.x + Math.cos(ry) * s * (w / 2 - 0.08), z: p.z - Math.sin(ry) * s * (w / 2 - 0.08) },
      h / 2, 0.06, h, d - 0.08, ry, `${seed}:leg${s}`, { tile: TILE_METERS.wood });
  }
  Slab(sink, "WoodBeam", p, h - 0.19, w - 0.24, 0.11, 0.05, ry, `${seed}:apron`, { tile: TILE_METERS.wood });
  sink.Solid(p.x, h / 2, p.z, w / 2, h / 2, d / 2, "prop", ry);
}

/**
 * 抬高台基上的门槛与门道墁地。
 *
 * 不能直接用 `AddDoorReveal` —— 它把门槛石与墁地都写死在 y≈0.07，
 * 摆在 0.75 m 高的享堂台基上就整个埋进台基里（第一版实测：门口什么都看不见）。
 * 这里把同一套「门槛 + 墁地 + 木框」抬到 baseY 上重做。
 */
function AddRaisedThreshold(sink, S, lz, ry, seed, o) {
  // sill 默认走 "Stone"：这几个院子的院墙碱脚本来就用 Stone，门槛再开一个 CrossStone
  // 桶就是给这个 150 m 分区白添一个 draw call，而两者的调色只差一点点。
  const { openW, openH, baseY, depth = 1.4, jamb = true, sill = "Stone" } = o;
  const sp = S.At(0, lz);
  sink.Add(sill, PlaceGeometry(
    MakeBox(openW + 0.14, 0.16, 0.44, TILE_METERS.stone, `${seed}:sill`),
    { x: sp.x, y: baseY + 0.08, z: sp.z, ry }));
  const pp = S.At(0, lz - depth / 2 - 0.2);
  sink.Add(sill, PlaceGeometry(
    MakeBox(openW + 0.05, 0.1, depth, TILE_METERS.stone, `${seed}:pave`),
    { x: pp.x, y: baseY + 0.04, z: pp.z, ry }));
  if (!jamb) return;
  for (const s of [-1, 1]) {
    const q = S.At(s * (openW / 2 - 0.05), lz - 0.24);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.11, openH, 0.13, TILE_METERS.wood, `${seed}:jamb${s}`),
      { x: q.x, y: baseY + openH / 2 + 0.14, z: q.z, ry }));
  }
}

/** 一条板凳。 */
function AddStool(sink, p, ry, seed, { w = 0.9, d = 0.3, h = 0.45 } = {}) {
  Slab(sink, "WoodDoor", p, h, w, 0.06, d, ry, `${seed}:seat`, { tile: TILE_METERS.wood });
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", { x: p.x + Math.cos(ry) * s * (w / 2 - 0.09), z: p.z - Math.sin(ry) * s * (w / 2 - 0.09) },
      h / 2, 0.05, h, d - 0.05, ry, `${seed}:l${s}`, { tile: TILE_METERS.wood });
  }
  sink.Solid(p.x, h / 2, p.z, w / 2, h / 2, d / 2, "prop", ry);
}

/** 一架书架／柜：两根立框 + n 层搁板 + 每层一排书脊。书铺与机关档案房共用。 */
function AddShelf(sink, p, ry, seed, { w = 1.6, d = 0.36, h = 1.95, tiers = 4, books = true } = {}) {
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", { x: p.x + Math.cos(ry) * s * (w / 2 - 0.04), z: p.z - Math.sin(ry) * s * (w / 2 - 0.04) },
      h / 2, 0.08, h, d, ry, `${seed}:up${s}`, { tile: TILE_METERS.wood });
  }
  for (let i = 0; i <= tiers; i += 1) {
    const y = 0.14 + (h - 0.2) * (i / tiers);
    Slab(sink, "WoodDoor", p, y, w - 0.16, 0.05, d, ry, `${seed}:sh${i}`, { tile: TILE_METERS.wood });
    if (books && i < tiers) {
      // 一排书脊：线装书是浅蓝布面，压在 HouseholdCloth 上读作「一层书」而不是一块木板
      Slab(sink, "HouseholdCloth", { x: p.x + Math.sin(ry) * 0.05, z: p.z + Math.cos(ry) * 0.05 },
        y + 0.16, (w - 0.3) * (0.62 + (i % 3) * 0.16), 0.26, d * 0.72, ry,
        `${seed}:bk${i}`, { tile: TILE_METERS.cloth });
    }
  }
  sink.Solid(p.x, h / 2, p.z, w / 2, h / 2, d / 2, "prop", ry);
}

// ---------------------------------------------------------------------------
// ① 第二区公所 —— 机关院（50 × 74）
// ---------------------------------------------------------------------------

export function BuildDistrictOffice(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const S = SiteFrame(f, ry);
  const seed = `map:${f.id}`;
  const damage = ctx.damage ?? 0.24;
  const burnt = !!ctx.burnt;
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const hw = f.w / 2, hd = f.d / 2;                         // 25 / 37

  // --- 院墙 2.6 m（机关院比民居 2.0—2.5 高一档，但不到当铺 4.2 的防盗高度）---
  // ruin 只给 damage*0.5：AddWall 的 ruin 是**逐段**削墙头的，0.8 档下 2.6 m 的墙
  // 每段能差出 0.4 m，加上跟着落的瓦压顶，实拍里整道机关院墙读成了一排雉堞。
  // 机关院是有人天天扫的院子，墙头该是齐的。
  const gateOpen = 4.2;
  AddYardWall(sink, f, ry, {
    height: 2.6, thickness: 0.45, material: wallMat, ruin: damage * 0.5,
    plinth: "Stone", openW: gateOpen, seed: `${seed}:yard`,
  });

  // --- 大门：门屋一座，净宽 3.0。机关院与大户人家的第一处分别 ---
  AddGateHall(sink, S, hd, ry, {
    width: 11.0, depth: 5.0, openW: 3.0, openH: 2.9, eaveY: 4.3,
    seed: `${seed}:gate`, ruin: damage, mat: wallMat, tileMat,
  });
  // 门额匾（素板，无字：字牌要贴图/decal 管线，本包不做）
  Slab(sink, "PaintRedOfficial", S.At(0, hd + 2.55), 3.32, 3.0, 0.82, 0.14, ry,
    `${seed}:plaque`, { tile: TILE_METERS.wood });

  // --- 门外告示墙：机关的第二处分别。一段独立矮墙 + 瓦帽 + 贴满的布告 ---
  //   往里收到 hd + 1.6（不是形制上的街对面）：BlockerRects 只在地块外让 3 m，
  //   再远就插进邻院；OnStreet 再兜一道底，压街就整件不生成。
  const noticeLz = hd + 1.6, noticeLx = 8.6, noticeLen = 7.2, noticeH = 2.35;
  const notice = S.At(noticeLx, noticeLz);
  if (!host.OnStreet(notice.x, notice.z, noticeLen / 2, 0.9)) {
    Slab(sink, "Stone", notice, 0.2, noticeLen + 0.5, 0.4, 1.0, ry, `${seed}:ntbase`, { tile: TILE_METERS.stone });
    AddWall(sink, wallMat, {
      x: notice.x, z: notice.z, length: noticeLen, height: noticeH, thickness: 0.4, ry,
      ruin: damage * 0.5, seed: `${seed}:notice`, plinth: null, cope: false,
    });
    for (const s of [-1, 1]) {
      Slab(sink, tileMat, S.At(noticeLx, noticeLz + s * 0.24), noticeH + 0.1, noticeLen + 0.5, 0.1, 0.72, ry,
        `${seed}:ntcap${s}`, { rx: -s * 0.5, tile: TILE_METERS.roof });
    }
    // 布告：五张糊在墙上的纸，高低错落、有一张翘了角
    const rnd = Mulberry32(HashString(`${seed}:notices`));
    for (let i = 0; i < 5; i += 1) {
      const lx = noticeLx - noticeLen / 2 + 0.8 + i * 1.42;
      Slab(sink, "HouseholdCloth", S.At(lx, noticeLz + 0.22), 1.35 + (rnd() - 0.5) * 0.42,
        0.58 + rnd() * 0.2, 0.82 + rnd() * 0.24, 0.03, ry, `${seed}:nt${i}`,
        { rz: (rnd() - 0.5) * 0.12, tile: TILE_METERS.cloth });
    }
    SolidSlab(sink, notice, noticeH / 2, noticeLen / 2, noticeH / 2, 0.3, ry);
  }

  // --- 门岗：门内西侧一座三面砖砌的岗亭，朝门那面敞开。机关的第三处分别 ---
  const postLx = -(hw - 2.6), postLz = hd - 3.2, postW = 1.9, postD = 1.7, postH = 2.5;
  const post = S.At(postLx, postLz);
  for (const s of [-1, 1]) {
    const p = S.At(postLx + s * (postW / 2 - 0.14), postLz);
    Slab(sink, wallMat, p, postH / 2, 0.28, postH, postD, ry, `${seed}:pw${s}`, { grid: BRICK_UV_GRID });
    SolidSlab(sink, p, postH / 2, 0.14, postH / 2, postD / 2, ry);
  }
  const postBack = S.At(postLx, postLz - postD / 2 + 0.14);
  Slab(sink, wallMat, postBack, postH / 2, postW, postH, 0.28, ry, `${seed}:pb`, { grid: BRICK_UV_GRID });
  SolidSlab(sink, postBack, postH / 2, postW / 2, postH / 2, 0.14, ry);
  Slab(sink, "WoodBeam", S.At(postLx, postLz + postD / 2 - 0.1), postH - 0.14, postW + 0.2, 0.2, 0.24, ry,
    `${seed}:plin`, { tile: TILE_METERS.wood });
  for (const s of [-1, 1]) {
    Slab(sink, tileMat, S.At(postLx, postLz + s * 0.5), postH + 0.34, postW + 1.0, 0.11, 1.25, ry,
      `${seed}:prf${s}`, { rx: -s * 0.5, tile: TILE_METERS.roof });
  }
  Slab(sink, tileMat, post, postH + 0.62, postW + 1.05, 0.15, 0.24, ry, `${seed}:prdg`, { tile: TILE_METERS.roof });
  AddStool(sink, S.At(postLx, postLz - 0.3), ry, `${seed}:pstool`, { w: 0.75 });

  // --- 影壁：进门第一眼。机关院的影壁带石座与瓦帽，比民居的大一号 ---
  const screenLz = hd - 6.4;
  const screen = S.At(0, screenLz);
  Slab(sink, "Stone", screen, 0.22, 6.4, 0.44, 0.95, ry, `${seed}:scbase`, { tile: TILE_METERS.stone });
  AddWall(sink, wallMat, {
    x: screen.x, z: screen.z, length: 5.8, height: 3.0, thickness: 0.44, ry,
    ruin: damage * 0.5, seed: `${seed}:screen`, plinth: null, cope: false,
  });
  for (const s of [-1, 1]) {
    Slab(sink, tileMat, S.At(0, screenLz + s * 0.28), 3.12, 6.4, 0.11, 0.86, ry,
      `${seed}:sccap${s}`, { rx: -s * 0.5, tile: TILE_METERS.roof });
  }
  Slab(sink, tileMat, screen, 3.28, 6.5, 0.15, 0.26, ry, `${seed}:scrdg`, { tile: TILE_METERS.roof });

  // --- 二门横墙：把 74 m 的进深切成前院（传达）与办公院两进 ---
  const midLz = hd - 24.0, midOpen = 3.2;
  const midSeg = (f.w - midOpen) / 2;
  for (const side of [-1, 1]) {
    const p = S.At(side * (midOpen / 2 + midSeg / 2), midLz);
    AddWall(sink, wallMat, {
      x: p.x, z: p.z, length: midSeg, height: 2.9, thickness: 0.42, ry,
      ruin: damage * 0.7, seed: `${seed}:mid${side}`, plinth: "Stone", cope: false,
    });
  }
  AddGateHall(sink, S, midLz, ry, {
    width: 6.6, depth: 3.4, openW: midOpen, openH: 2.7, eaveY: 3.7,
    seed: `${seed}:mgate`, ruin: damage, mat: wallMat, tileMat,
  });

  // --- 甬路：门 → 二门 → 正房月台。这条石带同时是「这条轴线可以走」的视觉交代 ---
  Slab(sink, "Stone", S.At(0, 10.0), 0.05, 2.8, 0.1, 48.0, ry,
    `${seed}:path`, { tile: TILE_METERS.stone });

  // --- 办公正房（可进入）---
  BuildOfficeHall(host, f, ry, {
    seed: `${seed}:hall`, lz: -hd + 16.0, width: 26.0, depth: 11.0,
    eaveY: 3.6, platform: 0.45, damage, burnt, wallMat, tileMat,
  });

  // --- 两列办公厢房 ---
  const wingX = 6.4, wingZ = 16.0, wingEave = 2.95;
  for (const side of [-1, 1]) {
    Room(host, f, ry, side * (hw - wingX / 2 - 1.0), -hd + 29.0, {
      ry: ry + (Math.PI / 2) * side, width: wingZ, depth: wingX, eaveY: wingEave,
      ridgeY: wingEave + (wingX / 2) * SLOPE27, seed: `${seed}:wing${side}`,
      damage, burnt, facing: side, bays: 5,
    });
  }

  // --- 后罩房：三进的最后一排（伙房／杂役）---
  const backD = 6.6, backEave = 2.85;
  Room(host, f, ry, 0, -hd + backD / 2 + 1.6, {
    width: Math.min(f.w * 0.52, 22), depth: backD, eaveY: backEave,
    ridgeY: backEave + (backD / 2) * SLOPE27, seed: `${seed}:back`,
    damage, burnt, facing: 1, bays: 5,
  });

  // --- 旗杆：俯瞰里「机关」与「大户人家」唯一的分别 ---
  const pole = S.At(0, -hd + 32.0);
  Slab(sink, "Stone", pole, 0.19, 1.2, 0.38, 1.2, ry, `${seed}:polebase`, { tile: TILE_METERS.stone });
  Slab(sink, "WoodBeam", pole, 4.4, 0.2, 8.4, 0.2, ry, `${seed}:pole`, { tile: TILE_METERS.wood });
  SolidSlab(sink, pole, 1.6, 0.2, 1.6, 0.2, ry, "prop");

  const wear = S.At(0, hd - 11.0);
  AddYardWear(sink, { x: wear.x, z: wear.z, ry, baseY: 0, seed: `${seed}:wear`, radius: 4.6 });
  const wear2 = S.At(0, -hd + 22.0);
  AddYardWear(sink, { x: wear2.x, z: wear2.z, ry, baseY: 0, seed: `${seed}:wear2`, radius: 4.0 });
}

/**
 * 办公正房：**可进入**的一栋七开间长房。
 *
 * 手搭而不是 AddRoomBlock —— 后者是四面围死的实心体量，进不去。
 * 结构：台明 + 踏跺 → 后墙／两山（实）→ 前檐（三处门洞 + 四樘格子窗）→ 硬山顶
 *       → 屋里：方砖地、六张桌案、条凳、两架档案柜、一道半高板壁。
 * 采光：明间门洞净宽 1.7 m ×3 + 四樘窗全在前檐（南向）——
 *       屋里靠这一排洞采光，深处暗是效果不是 bug。
 */
function BuildOfficeHall(host, f, ry, o) {
  const sink = host.sink;
  const S = SiteFrame(f, ry);
  const { seed, lz, width, depth, eaveY, platform, damage, burnt, wallMat, tileMat } = o;
  const ridgeY = eaveY + (depth / 2) * SLOPE275;
  const hwid = width / 2, hdep = depth / 2;
  const front = lz + hdep, back = lz - hdep;
  const t = 0.44;                                          // 墙厚
  const floorY = platform;

  // 台明 + 两级踏跺（每级 0.225 ≤ 引擎 0.55 自动抬腿）
  Slab(sink, "Stone", S.At(0, lz), platform / 2, width + 1.8, platform, depth + 1.6, ry,
    `${seed}:terrace`, { tile: TILE_METERS.stone });
  sink.Solid(S.At(0, lz).x, platform / 2, S.At(0, lz).z, (width + 1.8) / 2, platform / 2,
    (depth + 1.6) / 2, "villageFoundation", ry);
  for (let i = 0; i < 2; i += 1) {
    const h = platform * (1 - (i + 1) / 3);
    Slab(sink, "Stone", S.At(0, front + 0.9 + i * 0.44), h / 2, 6.0, h, 0.44, ry,
      `${seed}:step${i}`, { tile: TILE_METERS.stone });
  }

  // 后墙 + 两山（实心，砌到檐口）
  const bp = S.At(0, back + t / 2);
  Slab(sink, wallMat, bp, floorY + eaveY / 2, width, eaveY, t, ry, `${seed}:back`, { grid: BRICK_UV_GRID });
  SolidSlab(sink, bp, floorY + eaveY / 2, width / 2, eaveY / 2, t / 2, ry);
  for (const s of [-1, 1]) {
    const p = S.At(s * (hwid - t / 2), lz);
    Slab(sink, wallMat, p, floorY + eaveY / 2, t, eaveY, depth, ry, `${seed}:side${s}`, { grid: BRICK_UV_GRID });
    SolidSlab(sink, p, floorY + eaveY / 2, t / 2, eaveY / 2, depth / 2, ry);
  }

  // 前檐：七开间 —— 明间与两次间开门（净宽 1.7），其余四间槛墙 + 格子窗
  const bays = 7, bayW = width / bays, doorW = 1.7, doorH = 2.45;
  const doorBays = new Set([1, 3, 5]);
  for (let b = 0; b < bays; b += 1) {
    const lx = -hwid + bayW * (b + 0.5);
    const p = S.At(lx, front - t / 2);
    if (doorBays.has(b)) {
      const seg = (bayW - doorW) / 2;
      for (const s of [-1, 1]) {
        const q = S.At(lx + s * (doorW / 2 + seg / 2), front - t / 2);
        Slab(sink, wallMat, q, floorY + eaveY / 2, seg, eaveY, t, ry, `${seed}:fd${b}${s}`, { grid: BRICK_UV_GRID });
        SolidSlab(sink, q, floorY + eaveY / 2, seg / 2, eaveY / 2, t / 2, ry);
      }
      Slab(sink, "WoodBeam", p, floorY + doorH + 0.11, doorW + 0.5, 0.22, t + 0.06, ry,
        `${seed}:dlin${b}`, { tile: TILE_METERS.wood });
      Slab(sink, wallMat, p, floorY + (doorH + 0.22 + eaveY) / 2, doorW, eaveY - doorH - 0.22, t, ry,
        `${seed}:dup${b}`, { grid: BRICK_UV_GRID });
      SolidSlab(sink, p, floorY + (doorH + 0.22 + eaveY) / 2, doorW / 2, (eaveY - doorH - 0.22) / 2, t / 2, ry);
      // 门扇：靠一边敞着（办公房白天开着门）
      Slab(sink, "WoodDoor", S.At(lx + doorW / 2 - 0.1, front - t - 0.2), floorY + doorH / 2,
        0.16, doorH - 0.05, doorW * 0.55, ry, `${seed}:dw${b}`, { tile: TILE_METERS.wood });
      continue;
    }
    // 槛墙 0.95 → 格子窗 0.95—2.25 → 檐下墙
    Slab(sink, wallMat, p, floorY + 0.475, bayW, 0.95, t, ry, `${seed}:sill${b}`, { grid: BRICK_UV_GRID });
    Slab(sink, wallMat, p, floorY + (2.25 + eaveY) / 2, bayW, eaveY - 2.25, t, ry,
      `${seed}:tran${b}`, { grid: BRICK_UV_GRID });
    for (const s of [-1, 1]) {
      Slab(sink, wallMat, S.At(lx + s * (bayW / 2 - 0.22), front - t / 2), floorY + 1.6, 0.44, 1.3, t, ry,
        `${seed}:pier${b}${s}`, { grid: BRICK_UV_GRID });
    }
    const winW = bayW - 1.0;
    for (let m = 0; m < 4; m += 1) {
      Slab(sink, "WoodBeam", S.At(lx + (-0.36 + m * 0.24) * winW, front - t + 0.03), floorY + 1.6,
        0.07, 1.3, 0.1, ry, `${seed}:wm${b}${m}`, { tile: TILE_METERS.wood });
    }
    for (const s of [-1, 1]) {
      Slab(sink, "WoodBeam", S.At(lx, front - t + 0.03), floorY + 1.6 + s * 0.62, winW, 0.08, 0.1, ry,
        `${seed}:wr${b}${s}`, { tile: TILE_METERS.wood });
    }
    // 碰撞让开格子窗那一段：槛墙（0—0.95）与檐下墙（2.25—檐口）各一条带，
    // 中间那一格是真洞 —— 手榴弹要能扔进办公厅去（旧版整开间通高一只盒）。
    SolidWithOpenings(sink, {
      x: p.x, z: p.z, ry, length: bayW, y0: floorY, y1: floorY + eaveY, thickness: t,
      openings: [{ c: 0, w: bayW - 0.88, y0: floorY + 0.95, y1: floorY + 2.25 }],
    });
    sink.Cover(p.x, p.z, floorY + eaveY, S.sin, S.cos);
  }
  // 三处门洞的门槛与门道墁地（台明抬高 0.45，不能用 AddDoorReveal）
  for (const b of doorBays) {
    const lx = -hwid + bayW * (b + 0.5);
    AddRaisedThreshold(sink, { At: (a, c) => S.At(lx + a, c), sin: S.sin, cos: S.cos },
      front - t / 2, ry, `${seed}:th${b}`, { openW: doorW, openH: doorH, baseY: floorY, depth: 1.3 });
  }

  const rp = S.At(0, lz);
  AddHardMountainRoof(sink, {
    x: rp.x, z: rp.z, width, depth, eaveY: floorY + eaveY, ridgeY: floorY + ridgeY,
    ry, seed: `${seed}:roof`, ruined: damage > 0.62, burnt, rafters: false,
  });

  // --- 屋里 ---
  // 方砖地：比台明浅一档，进了门脚下有东西
  // 方砖地走 WallPaving（灰）而不是 CrossStone —— CrossStone 是 0xfbfaf6，
  // 在门窗直射下整块地读成白大理石，把「屋里」看成了「露天铺装」（第一版实拍取证）。
  Slab(sink, "WallPaving", S.At(0, lz), floorY + 0.03, width - t * 2, 0.08, depth - t * 2, ry,
    `${seed}:floor`, { tile: TILE_METERS.stone });
  // 一道半高板壁把长房分成三间办公（不封死：两头各留 1.4 m 通道）
  for (const s of [-1, 1]) {
    const px = s * bayW * 1.5;
    for (const seg of [-1, 1]) {
      const zc = lz + seg * (hdep / 2 + 0.35);
      const q = S.At(px, zc);
      Slab(sink, "WoodDoor", q, floorY + 1.1, 0.1, 2.2, hdep - 1.4, ry, `${seed}:part${s}${seg}`,
        { tile: TILE_METERS.wood });
      sink.Solid(q.x, floorY + 1.1, q.z, 0.06, 1.1, (hdep - 1.4) / 2, "prop", ry);
    }
  }
  // 六张办公桌：三间各两张，一律面向前檐的窗（背对后墙）
  const rnd = Mulberry32(HashString(`${seed}:furn`));
  for (let i = 0; i < 6; i += 1) {
    const room = Math.floor(i / 2) - 1;                    // -1 / 0 / 1
    const px = room * 8.0 + (i % 2 === 0 ? -1.5 : 1.5);
    const pz = lz - 1.1 + (rnd() - 0.5) * 0.5;
    const dry = ry + (rnd() - 0.5) * 0.12;
    const dp = S.At(px, pz);
    AddDesk(sink, dp, dry, `${seed}:desk${i}`);
    AddStool(sink, S.At(px, pz - 0.95), dry, `${seed}:stool${i}`);
    // 桌上一摞卷宗
    Slab(sink, "HouseholdCloth", S.At(px + 0.4, pz + 0.1), floorY + 0.86, 0.34, 0.11, 0.26, dry,
      `${seed}:file${i}`, { tile: TILE_METERS.cloth });
  }
  // 两架档案柜靠后墙
  for (const s of [-1, 1]) {
    AddShelf(sink, S.At(s * bayW * 2.4, back + t + 0.24), ry + Math.PI, `${seed}:cab${s}`,
      { w: 1.8, h: 1.8, tiers: 3, books: true });
  }
}

// ---------------------------------------------------------------------------
// ② 王家祠堂 —— 祠堂形制（26 × 22）
// ---------------------------------------------------------------------------

export function BuildShrine(host, l, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const S = SiteFrame(l, ry);
  const seed = `map:${l.id}`;
  const damage = ctx.damage ?? 0.24;
  const burnt = !!ctx.burnt;
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const hw = l.w / 2, hd = l.d / 2;                          // 13 / 11

  // --- 院墙一圈（祠堂院墙比民居高半档：2.8）+ 门屋 ---
  const gateOpen = 2.2;
  AddYardWall(sink, l, ry, {
    height: 2.8, thickness: 0.42, material: wallMat, ruin: damage * 0.7,
    plinth: "Stone", openW: 6.8, seed: `${seed}:yard`,
  });
  AddGateHall(sink, S, hd, ry, {
    width: 6.8, depth: 3.6, openW: gateOpen, openH: 2.5, eaveY: 3.6,
    seed: `${seed}:gate`, ruin: damage, mat: wallMat, tileMat,
  });
  // 门额匾（素板）+ 门前一对抱鼓石
  Slab(sink, "PaintRedOfficial", S.At(0, hd + 1.9), 2.86, 2.2, 0.66, 0.12, ry,
    `${seed}:plaque`, { tile: TILE_METERS.wood });

  // --- 甬路：门 → 享堂踏跺 ---
  Slab(sink, "Stone", S.At(0, 4.0), 0.05, 2.0, 0.1, 13.0, ry, `${seed}:path`, { tile: TILE_METERS.stone });

  // --- 享堂（可进入）---
  const hallW = 11.4, hallD = 7.2, plat = 0.75, hallEave = 3.5;
  const hallLz = -hd + hallD / 2 + 1.6;
  BuildShrineHall(host, l, ry, {
    seed: `${seed}:hall`, lz: hallLz, width: hallW, depth: hallD,
    eaveY: hallEave, platform: plat, damage, burnt, wallMat, tileMat,
  });

  // --- 庭中一株柏：祠堂庭院的定式。三月无叶乔木满城，唯独侧柏是常绿的 ---
  const cyp = S.At(-5.0, 3.2);
  AddCypress(sink, { x: cyp.x, z: cyp.z, seed: `${seed}:cypress`, height: 7.6, baseY: 0 });

  // --- 庭中铁香炉 + 一通碑：祠堂的两件标配小品 ---
  const censerLz = 1.6;
  const censer = S.At(0, censerLz);
  Slab(sink, "Stone", censer, 0.16, 1.0, 0.32, 1.0, ry, `${seed}:cnbase`, { tile: TILE_METERS.stone });
  Slab(sink, "HouseholdCeramic", censer, 0.62, 0.72, 0.6, 0.72, ry, `${seed}:cnbody`, { tile: TILE_METERS.stone });
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", S.At(s * 0.42, censerLz), 1.0, 0.09, 0.34, 0.09, ry,
      `${seed}:cnear${s}`, { tile: TILE_METERS.steel });
  }
  sink.Solid(censer.x, 0.5, censer.z, 0.5, 0.5, 0.5, "prop", ry);
  const stele = S.At(-(hw - 3.4), 5.2);
  Slab(sink, "Stone", stele, 0.22, 1.2, 0.44, 0.9, ry, `${seed}:stbase`, { tile: TILE_METERS.stone });
  Slab(sink, "Stone", stele, 1.35, 0.86, 1.9, 0.22, ry, `${seed}:stele`, { tile: TILE_METERS.stone });
  sink.Solid(stele.x, 1.1, stele.z, 0.5, 1.1, 0.25, "prop", ry);

  // --- 东西耳房：祭器房与守祠人住处，各一间，矮一大截，衬出享堂 ---
  const earW = 4.2, earZ = 5.6, earEave = 2.45;
  for (const side of [-1, 1]) {
    Room(host, l, ry, side * (hw - earW / 2 - 0.7), -hd + hallD + 3.6, {
      ry: ry + (Math.PI / 2) * side, width: earZ, depth: earW, eaveY: earEave,
      ridgeY: earEave + (earW / 2) * SLOPE27, seed: `${seed}:ear${side}`,
      damage, burnt, facing: side, bays: 2,
    });
  }

  const wear = S.At(0, hd - 4.5);
  AddYardWear(sink, { x: wear.x, z: wear.z, ry, baseY: 0, seed: `${seed}:wear`, radius: 3.4 });
}

/**
 * 享堂（可进入）：抬高台基 + 三开间、明间敞开 + 龛位墙 + 祭案。
 *
 * 祠堂与普通正房的三处形制差别，全在这个函数里：
 *   ① 台基抬到 0.75 m（民居正房 0.15—0.3），三级踏跺；
 *   ② 明间**不装门扇**、整间敞开（净宽 3.4）—— 祠堂是开着的，进门就看见龛；
 *   ③ 后墙满做龛位墙：一道 0.9 m 高的须弥座 + 三层神主牌位 + 帷幔，前面一张祭案。
 * 采光：明间那 3.4 m 的敞口正对院子与庭中柏，屋里靠它采光。
 */
function BuildShrineHall(host, l, ry, o) {
  const sink = host.sink;
  const S = SiteFrame(l, ry);
  const { seed, lz, width, depth, eaveY, platform, damage, burnt, wallMat, tileMat } = o;
  const ridgeY = eaveY + (depth / 2) * SLOPE275;
  const hwid = width / 2, hdep = depth / 2;
  const front = lz + hdep, back = lz - hdep;
  const t = 0.42;
  const floorY = platform;
  const bayW = width / 3, openW = 3.4;

  // 台基 + 三级踏跺（每级 0.25）
  const tp = S.At(0, lz);
  Slab(sink, "Stone", tp, platform / 2, width + 1.6, platform, depth + 1.4, ry,
    `${seed}:platform`, { tile: TILE_METERS.stone });
  sink.Solid(tp.x, platform / 2, tp.z, (width + 1.6) / 2, platform / 2, (depth + 1.4) / 2,
    "villageFoundation", ry);
  for (let i = 0; i < 3; i += 1) {
    const h = platform * (1 - (i + 1) / 4);
    Slab(sink, "Stone", S.At(0, front + 0.8 + i * 0.4), h / 2, 4.4, h, 0.4, ry,
      `${seed}:step${i}`, { tile: TILE_METERS.stone });
  }

  // 后墙 + 两山
  const bp = S.At(0, back + t / 2);
  Slab(sink, wallMat, bp, floorY + eaveY / 2, width, eaveY, t, ry, `${seed}:back`, { grid: BRICK_UV_GRID });
  SolidSlab(sink, bp, floorY + eaveY / 2, width / 2, eaveY / 2, t / 2, ry);
  for (const s of [-1, 1]) {
    const p = S.At(s * (hwid - t / 2), lz);
    Slab(sink, wallMat, p, floorY + eaveY / 2, t, eaveY, depth, ry, `${seed}:side${s}`, { grid: BRICK_UV_GRID });
    SolidSlab(sink, p, floorY + eaveY / 2, t / 2, eaveY / 2, depth / 2, ry);
  }

  // 前檐：四根檐柱 + 明间敞开 + 两次间槛墙与隔扇
  for (let i = 0; i < 4; i += 1) {
    const lx = -hwid + bayW * i + (i === 0 ? 0.3 : i === 3 ? -0.3 : 0);
    const p = S.At(lx, front - 0.32);
    Slab(sink, "PaintRedOfficial", p, floorY + eaveY / 2, 0.34, eaveY, 0.34, ry,
      `${seed}:col${i}`, { tile: TILE_METERS.wood });
    Slab(sink, "Stone", p, floorY + 0.11, 0.56, 0.22, 0.56, ry, `${seed}:colb${i}`, { tile: TILE_METERS.stone });
    SolidSlab(sink, p, floorY + eaveY / 2, 0.2, eaveY / 2, 0.2, ry, "prop");
  }
  // 额枋走 WoodBeam 不走朱漆：PaintRedOfficial 蒙尘后偏粉（见交付报告的调色建议），
  // 一整条 10.8 m 的额枋刷成粉红，正面一半的面积就成了粉的。朱漆只留给柱、匾、牌位。
  Slab(sink, "WoodBeam", S.At(0, front - 0.32), floorY + eaveY - 0.34, width - 0.6, 0.42, 0.24, ry,
    `${seed}:arch`, { tile: TILE_METERS.wood });
  Slab(sink, "PaintRedOfficial", S.At(0, front - 0.14), floorY + eaveY - 1.05, 2.4, 0.78, 0.1, ry,
    `${seed}:tablet`, { tile: TILE_METERS.wood });
  for (const s of [-1, 1]) {
    // 次间：槛墙 0.9 + 一樘六抹隔扇
    const lx = s * bayW;
    const p = S.At(lx, front - t / 2);
    const segW = bayW - 0.34;
    Slab(sink, wallMat, p, floorY + 0.45, segW, 0.9, t, ry, `${seed}:sill${s}`, { grid: BRICK_UV_GRID });
    Slab(sink, "WoodDoor", S.At(lx, front - t + 0.04), floorY + (0.9 + eaveY - 0.55) / 2 + 0.1,
      segW - 0.2, eaveY - 1.55, 0.09, ry, `${seed}:leaf${s}`, { tile: TILE_METERS.wood });
    for (let m = -1; m <= 1; m += 1) {
      Slab(sink, "WoodBeam", S.At(lx + m * (segW - 0.3) / 3, front - t + 0.09), floorY + 1.75,
        0.08, eaveY - 1.6, 0.08, ry, `${seed}:mul${s}${m}`, { tile: TILE_METERS.wood });
    }
    SolidSlab(sink, p, floorY + eaveY / 2, segW / 2, eaveY / 2, t / 2, ry);
    sink.Cover(p.x, p.z, floorY + eaveY, S.sin, S.cos);
  }
  // 明间上方的横披（净高 openH 以上砌实），门洞净宽 openW 不设门扇
  const openH = 2.7;
  const mid = S.At(0, front - t / 2);
  Slab(sink, "WoodBeam", mid, floorY + openH + 0.13, openW + 0.6, 0.26, t + 0.08, ry,
    `${seed}:lin`, { tile: TILE_METERS.wood });
  SolidSlab(sink, mid, floorY + (openH + 0.26 + eaveY) / 2, openW / 2 + 0.3,
    (eaveY - openH - 0.26) / 2, t / 2, ry);
  AddRaisedThreshold(sink, S, front - t / 2, ry, `${seed}:th`,
    { openW, openH, baseY: floorY, depth: 1.6, jamb: false });

  const rp = S.At(0, lz);
  AddHardMountainRoof(sink, {
    x: rp.x, z: rp.z, width, depth, eaveY: floorY + eaveY, ridgeY: floorY + ridgeY,
    ry, seed: `${seed}:roof`, ruined: damage > 0.62, burnt, rafters: true,
  });

  // --- 屋里：地面 + 龛位墙 + 祭案 ---
  // 方砖地走 WallPaving（灰）而不是 CrossStone —— CrossStone 是 0xfbfaf6，
  // 在门窗直射下整块地读成白大理石，把「屋里」看成了「露天铺装」（第一版实拍取证）。
  Slab(sink, "WallPaving", S.At(0, lz), floorY + 0.03, width - t * 2, 0.08, depth - t * 2, ry,
    `${seed}:floor`, { tile: TILE_METERS.stone });

  // 龛位墙：须弥座 0.9 + 三层搁板 + 每层一排神主牌位 + 两根龛柱 + 顶板 + 帷幔
  const nicheZ = back + t + 0.46;
  const nicheW = width - t * 2 - 1.0;
  const np = S.At(0, nicheZ);
  Slab(sink, "Stone", np, floorY + 0.45, nicheW, 0.9, 0.86, ry, `${seed}:nbase`, { tile: TILE_METERS.stone });
  sink.Solid(np.x, floorY + 0.45, np.z, nicheW / 2, 0.45, 0.43, "prop", ry);
  for (let tier = 0; tier < 3; tier += 1) {
    const shelfY = floorY + 1.0 + tier * 0.52;
    Slab(sink, "WoodDoor", np, shelfY, nicheW, 0.06, 0.74, ry, `${seed}:nsh${tier}`, { tile: TILE_METERS.wood });
    const count = 8;
    for (let k = 0; k < count; k += 1) {
      const lx = -nicheW / 2 + (nicheW * (k + 0.5)) / count;
      Slab(sink, "PaintRedOfficial", S.At(lx, nicheZ - 0.06), shelfY + 0.21, 0.15, 0.36, 0.06, ry,
        `${seed}:tab${tier}${k}`, { tile: TILE_METERS.wood });
    }
  }
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", S.At(s * nicheW / 2, nicheZ + 0.3), floorY + 1.35, 0.14, 2.7, 0.14, ry,
      `${seed}:npost${s}`, { tile: TILE_METERS.wood });
  }
  Slab(sink, "WoodBeam", S.At(0, nicheZ + 0.3), floorY + 2.75, nicheW + 0.3, 0.2, 0.3, ry,
    `${seed}:ntop`, { tile: TILE_METERS.wood });
  Slab(sink, "HouseholdCloth", S.At(0, nicheZ + 0.34), floorY + 2.42, nicheW, 0.5, 0.05, ry,
    `${seed}:valance`, { tile: TILE_METERS.cloth });

  // 祭案：供桌 2.9 × 0.75 × 0.86 + 香炉 + 两只烛台 + 两只花觚
  const altarZ = nicheZ + 1.5;
  const ap = S.At(0, altarZ);
  Slab(sink, "WoodDoor", ap, floorY + 0.86, 2.9, 0.09, 0.75, ry, `${seed}:altar`, { tile: TILE_METERS.wood });
  for (const s of [-1, 1]) {
    Slab(sink, "WoodDoor", S.At(s * 1.3, altarZ), floorY + 0.43, 0.12, 0.86, 0.68, ry,
      `${seed}:aleg${s}`, { tile: TILE_METERS.wood });
    Slab(sink, "HouseholdCeramic", S.At(s * 0.95, altarZ), floorY + 1.06, 0.16, 0.32, 0.16, ry,
      `${seed}:cand${s}`, { tile: TILE_METERS.stone });
    Slab(sink, "HouseholdCeramic", S.At(s * 0.55, altarZ - 0.1), floorY + 1.02, 0.2, 0.24, 0.2, ry,
      `${seed}:vase${s}`, { tile: TILE_METERS.stone });
  }
  Slab(sink, "WoodBeam", ap, floorY + 0.79, 2.66, 0.14, 0.06, ry, `${seed}:aapron`, { tile: TILE_METERS.wood });
  Slab(sink, "HouseholdCeramic", ap, floorY + 1.05, 0.46, 0.3, 0.42, ry, `${seed}:censer`, { tile: TILE_METERS.stone });
  sink.Solid(ap.x, floorY + 0.45, ap.z, 1.45, 0.45, 0.38, "prop", ry);
  // 两只蒲团
  for (const s of [-1, 1]) {
    Slab(sink, "Wicker", S.At(s * 0.8, altarZ + 1.25), floorY + 0.07, 0.62, 0.14, 0.62, ry,
      `${seed}:mat${s}`, { tile: TILE_METERS.sandbag });
  }
  void tileMat;
}

// ---------------------------------------------------------------------------
// ③ 人民书店 —— 书铺门脸 + 后暗间（12 × 9）
// ---------------------------------------------------------------------------

export function BuildShop(host, l, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const S = SiteFrame(l, ry);
  const seed = `map:${l.id}`;
  const damage = ctx.damage ?? 0.24;
  const burnt = !!ctx.burnt;
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const hw = l.w / 2, hd = l.d / 2;                          // 6 / 4.5
  const t = 0.4;
  const eaveY = 2.9;
  const ridgeY = eaveY + hd * SLOPE275;                      // ~5.24
  const rnd = Mulberry32(HashString(`${seed}:shop`));

  // --- 台明：铺面比土路高两级砖 ---
  const plat = 0.22;
  const tp = S.At(0, 0);
  Slab(sink, "Stone", tp, plat / 2, l.w + 0.9, plat, l.d + 0.7, ry, `${seed}:terrace`, { tile: TILE_METERS.stone });
  sink.Solid(tp.x, plat / 2, tp.z, (l.w + 0.9) / 2, plat / 2, (l.d + 0.7) / 2, "villageFoundation", ry);
  Slab(sink, "Stone", S.At(0, hd + 0.62), plat / 2 - 0.05, 4.2, plat - 0.1, 0.5, ry,
    `${seed}:step`, { tile: TILE_METERS.stone });

  // --- 后墙 + 两山 ---
  const back = -hd, front = hd;
  const bp = S.At(0, back + t / 2);
  Slab(sink, wallMat, bp, plat + eaveY / 2, l.w, eaveY, t, ry, `${seed}:back`, { grid: BRICK_UV_GRID });
  SolidSlab(sink, bp, plat + eaveY / 2, l.w / 2, eaveY / 2, t / 2, ry);
  for (const s of [-1, 1]) {
    const p = S.At(s * (hw - t / 2), 0);
    Slab(sink, wallMat, p, plat + eaveY / 2, t, eaveY, l.d, ry, `${seed}:side${s}`, { grid: BRICK_UV_GRID });
    SolidSlab(sink, p, plat + eaveY / 2, t / 2, eaveY / 2, l.d / 2, ry);
  }
  // 后暗间的高窗：檐下一个 0.7 × 0.45 的小口，石套 + 两根铁栅。
  // 暗间靠它才不是纯黑 —— 「暗」是叙事，不是看不见东西。
  const ventLx = -2.2, ventLz = back + t / 2;
  const vp = S.At(ventLx, ventLz);
  Slab(sink, "Stone", vp, plat + eaveY - 0.72, 0.9, 0.62, t + 0.06, ry, `${seed}:vent`, { tile: TILE_METERS.stone });
  // 洞口的深色芯**贯穿墙厚**（t+0.12）：只贴外面那一片的话，屋里看这扇窗
  // 就是墙上一块受光的白石板，暗间读不出「这里有个洞」（第一版实拍取证）。
  Slab(sink, "Charred", vp, plat + eaveY - 0.72, 0.7, 0.45, t + 0.12, ry,
    `${seed}:venth`, { tile: TILE_METERS.stone });
  for (let m = -1; m <= 1; m += 1) {
    Slab(sink, "WoodBeam", S.At(ventLx + m * 0.22, back + 0.03), plat + eaveY - 0.72, 0.05, 0.45, 0.05, ry,
      `${seed}:ventb${m}`, { tile: TILE_METERS.steel });
  }

  // --- 铺面：三开间排门板。明间已开板（净宽 2.6），两次间各只开一块 ---
  const bays = 3, bayW = l.w / bays, openW = 2.6, openH = 2.5;
  const fz = front - t / 2;
  for (let b = 0; b < bays; b += 1) {
    const lx = -hw + bayW * (b + 0.5);
    if (b === 1) {
      const seg = (bayW - openW) / 2;
      for (const s of [-1, 1]) {
        const q = S.At(lx + s * (openW / 2 + seg / 2), fz);
        Slab(sink, wallMat, q, plat + eaveY / 2, seg, eaveY, t, ry, `${seed}:fm${s}`, { grid: BRICK_UV_GRID });
        SolidSlab(sink, q, plat + eaveY / 2, seg / 2, eaveY / 2, t / 2, ry);
      }
      const p = S.At(lx, fz);
      Slab(sink, "WoodBeam", p, plat + openH + 0.14, openW + 0.7, 0.28, t + 0.1, ry,
        `${seed}:flin`, { tile: TILE_METERS.wood });
      Slab(sink, wallMat, p, plat + (openH + 0.28 + eaveY) / 2, openW, eaveY - openH - 0.28, t, ry,
        `${seed}:fup`, { grid: BRICK_UV_GRID });
      SolidSlab(sink, p, plat + (openH + 0.28 + eaveY) / 2, openW / 2, (eaveY - openH - 0.28) / 2, t / 2, ry);
      AddRaisedThreshold(sink, S, fz, ry, `${seed}:th`,
        { openW, openH, baseY: plat, depth: 1.4, jamb: false });
      // 卸下来的排门板：五块靠在明间一侧的墙垛边（「开板」是书铺白天的样子）。
      // 摆在 front+0.34 会有一半悬在台明外沿；收进 front+0.10 才是靠着墙站的
      for (let k = 0; k < 5; k += 1) {
        Slab(sink, "WoodDoor", S.At(lx - openW / 2 + 0.20, front + 0.10 - k * 0.07), plat + 1.22,
          0.09, 2.35, 0.44, ry + 0.06 + k * 0.012, `${seed}:board${k}`,
          { rz: 0.05 + k * 0.008, tile: TILE_METERS.wood });
      }
      continue;
    }
    // 次间：槛墙 0.85 + 排门板一排（其中一块卸掉，露出后面的书架）
    const p = S.At(lx, fz);
    Slab(sink, wallMat, p, plat + 0.425, bayW, 0.85, t, ry, `${seed}:sill${b}`, { grid: BRICK_UV_GRID });
    Slab(sink, wallMat, p, plat + (2.6 + eaveY) / 2, bayW, eaveY - 2.6, t, ry, `${seed}:tran${b}`, { grid: BRICK_UV_GRID });
    const planks = 5, plankW = (bayW - 0.3) / planks;
    const gone = b === 0 ? 3 : 1;                            // 卸掉的那一块
    for (let k = 0; k < planks; k += 1) {
      if (k === gone) continue;
      Slab(sink, "WoodDoor", S.At(lx - (bayW - 0.3) / 2 + plankW * (k + 0.5), front + 0.03), plat + 1.72,
        plankW - 0.03, 1.75, 0.08, ry, `${seed}:pl${b}${k}`, { tile: TILE_METERS.wood });
    }
    // 门板槽的上下槛
    for (const s of [-1, 1]) {
      Slab(sink, "WoodBeam", S.At(lx, front + 0.06), plat + 1.72 + s * 0.92, bayW - 0.24, 0.1, 0.12, ry,
        `${seed}:trk${b}${s}`, { tile: TILE_METERS.wood });
    }
    // 缺板处不设碰撞（那是可以钻进去的口子）：碰撞按两侧分段登记
    for (const s of [-1, 1]) {
      const half = (bayW - plankW) / 2;
      const q = S.At(lx + s * (plankW / 2 + half / 2), fz);
      SolidSlab(sink, q, plat + eaveY / 2, half / 2, eaveY / 2, t / 2, ry);
    }
    sink.Cover(p.x, p.z, plat + eaveY, S.sin, S.cos);
  }

  // --- 招牌：明间上一块横匾 + 一面挑出街面的布幌 ---
  // 匾贴在过梁上（front+0.12），不是挑到 front+0.3 ——
  // 挑出去 0.3 就越过了 0.45 m 的出檐，出图上像一块粘在瓦口上的板子
  Slab(sink, "PaintRedOfficial", S.At(0, front + 0.12), plat + 2.74, 3.2, 0.66, 0.1, ry,
    `${seed}:sign`, { tile: TILE_METERS.wood });
  Slab(sink, "WoodBeam", S.At(hw - 1.1, front + 0.55), plat + 2.5, 0.12, 0.12, 1.1, ry,
    `${seed}:arm`, { tile: TILE_METERS.wood });
  Slab(sink, "HouseholdCloth", S.At(hw - 1.1, front + 1.0), plat + 1.85, 0.5, 1.5, 0.04, ry,
    `${seed}:banner`, { tile: TILE_METERS.cloth });

  const rp = S.At(0, 0);
  AddHardMountainRoof(sink, {
    x: rp.x, z: rp.z, width: l.w, depth: l.d, eaveY: plat + eaveY, ridgeY: plat + ridgeY,
    ry, seed: `${seed}:roof`, ruined: damage > 0.62, burnt, rafters: false,
  });

  // --- 屋里：前铺（书架 + 柜台）---
  Slab(sink, "WallPaving", S.At(0, 0), plat + 0.03, l.w - t * 2, 0.08, l.d - t * 2, ry,
    `${seed}:floor`, { tile: TILE_METERS.stone });
  // 板壁：把 9 m 进深切成前铺 5.9 + 后暗间 2.5，靠一侧留 0.9 m 门洞挂门帘
  const partLz = back + 2.5, doorLx = -hw + 1.7, doorW = 0.9;
  const partSegs = [
    { c: doorLx - doorW / 2 - (doorLx - doorW / 2 - (-hw)) / 2, len: doorLx - doorW / 2 + hw },
    { c: (doorLx + doorW / 2 + hw) / 2, len: hw - doorLx - doorW / 2 },
  ];
  for (let i = 0; i < partSegs.length; i += 1) {
    const s = partSegs[i];
    if (s.len <= 0.05) continue;
    const q = S.At(s.c, partLz);
    Slab(sink, "WoodDoor", q, plat + eaveY / 2, s.len, eaveY, 0.1, ry, `${seed}:part${i}`, { tile: TILE_METERS.wood });
    sink.Solid(q.x, plat + eaveY / 2, q.z, s.len / 2, eaveY / 2, 0.06, "prop", ry);
  }
  // 后暗间的地面单换一档夯土：书铺前面铺方砖，后头那间是踩出来的土地。
  // 这一笔同时把「暗间」在出图上和前铺分开 —— 屋里没有独立光源，只能靠材质分层。
  Slab(sink, "YardEarth", S.At(0, (back + t + partLz) / 2), plat + 0.05,
    l.w - t * 2, 0.06, partLz - back - t, ry, `${seed}:backFloor`, { tile: TILE_METERS.ground });
  // 门帘：一幅垂到 0.35 m 的旧布。它遮住的正是这间铺子真正的用处
  Slab(sink, "HouseholdCloth", S.At(doorLx, partLz + 0.09), plat + 1.28, doorW + 0.08, 1.85, 0.03, ry,
    `${seed}:curtain`, { tile: TILE_METERS.cloth });
  Slab(sink, "WoodBeam", S.At(doorLx, partLz), plat + 2.24, doorW + 0.24, 0.12, 0.14, ry,
    `${seed}:curtainRod`, { tile: TILE_METERS.wood });

  // 柜台：明间偏北一侧，L 形的一长一短
  const counter = S.At(-hw + 2.4, hd - 2.3);
  Slab(sink, "WoodDoor", counter, plat + 0.92, 1.0, 0.08, 3.0, ry, `${seed}:cnt`, { tile: TILE_METERS.wood });
  Slab(sink, wallMat, counter, plat + 0.46, 0.9, 0.92, 2.9, ry, `${seed}:cntBody`, { grid: BRICK_UV_GRID });
  sink.Solid(counter.x, plat + 0.46, counter.z, 0.5, 0.46, 1.5, "prop", ry);
  Slab(sink, "HouseholdCloth", S.At(-hw + 2.4, hd - 1.4), plat + 1.03, 0.5, 0.14, 0.38, ry + 0.2,
    `${seed}:ledger`, { tile: TILE_METERS.cloth });

  // 书架：南山墙靠着两架 + 板壁前一架，正对明间的开口，从街上能看见书脊
  AddShelf(sink, S.At(hw - 1.4, -0.5), ry + Math.PI / 2, `${seed}:sh0`, { w: 2.6, d: 0.4, h: 2.05, tiers: 5 });
  AddShelf(sink, S.At(hw - 1.4, 2.2), ry + Math.PI / 2, `${seed}:sh1`, { w: 2.2, d: 0.4, h: 2.05, tiers: 5 });
  AddShelf(sink, S.At(1.6, partLz + 0.45), ry, `${seed}:sh2`, { w: 3.2, d: 0.42, h: 1.9, tiers: 4 });
  // 地上一摞没上架的书
  for (let i = 0; i < 3; i += 1) {
    Slab(sink, "HouseholdCloth", S.At(0.4 + i * 0.5, hd - 3.4), plat + 0.16 + i * 0.02,
      0.34, 0.3 + rnd() * 0.14, 0.26, ry + rnd() * 0.4, `${seed}:pile${i}`, { tile: TILE_METERS.cloth });
  }

  // --- 后暗间：一张小桌、一条凳、一盏油灯、墙根一摞纸。1931 年中共滕县特支就在这后头 ---
  AddDesk(sink, S.At(-hw + 2.2, back + 1.2), ry, `${seed}:secDesk`, { w: 1.15, d: 0.6, h: 0.74 });
  AddStool(sink, S.At(-hw + 2.2, back + 2.0), ry, `${seed}:secStool`, { w: 0.7 });
  Slab(sink, "HouseholdCeramic", S.At(-hw + 2.5, back + 1.05), plat + 0.86, 0.12, 0.18, 0.12, ry,
    `${seed}:lamp`, { tile: TILE_METERS.stone });
  for (let i = 0; i < 3; i += 1) {
    Slab(sink, "HouseholdCloth", S.At(hw - 1.3, back + 0.7 + i * 0.42), plat + 0.11,
      0.4, 0.2, 0.34, ry + rnd() * 0.5, `${seed}:stack${i}`, { tile: TILE_METERS.cloth });
  }
  Slab(sink, "Wicker", S.At(hw - 1.4, back + 1.9), plat + 0.24, 0.52, 0.44, 0.52, ry,
    `${seed}:crate`, { tile: TILE_METERS.sandbag });
}

// ---------------------------------------------------------------------------
// ④ 空心炮台 ×2 —— 1908 制式圆形空心炮台
// ---------------------------------------------------------------------------

const FORT = Object.freeze({
  facets: 16,
  outerR: 6.0,
  innerR: 4.6,
  coreR: 2.0,
  wallH: 4.6,
  deckT: 0.34,
  parapetH: 1.15,
  doorW: 1.6,
  doorH: 2.25,
});

/**
 * 1908 年城墙外侧的空心炮台（志载两处，**位置、形制、尺寸一概无载**）。
 *
 * 做成圆形空心式而不是实心方墩，理由有三：
 *   ① 「空心炮台」四个字本身就是形制 —— 炮台里是空的，人在里头；
 *   ② 晚清各地新式炮台（含胶东、江阴一路的德式教习产物）多为圆／多边环形砖体，
 *      环壁开射孔、顶为露天炮位；
 *   ③ 玩法上：一个 11×11 的实心盒子在场景里只是障碍物，而一座能进的环廊
 *      是城外这一片唯一的据点。
 *
 * 关键工程点：环壁碰撞**逐段**登记（16 段），顶台按 16 块楔形板逐块登记并留一个上人口。
 * 全部构件都压 host.OuterHeight —— 城外地坪是 -1.2 + 起伏，不是 y=0。
 */
export function BuildHollowFort(host, f, ctx) {
  const sink = host.sink;
  const baseY = host.OuterHeight(f.x, f.z);
  const seed = `map:${f.id ?? `fort${Math.round(f.x)}`}`;
  const rnd = Mulberry32(HashString(seed));
  const damage = ctx && ctx.damage != null ? ctx.damage : 0.3;
  const N = FORT.facets;
  const step = (Math.PI * 2) / N;
  const midR = (FORT.outerR + FORT.innerR) / 2;
  const wallT = FORT.outerR - FORT.innerR;
  const chord = 2 * midR * Math.sin(step / 2) * 1.06;        // 1.06：相邻段稍稍咬合，不留缝
  const deckY = baseY + FORT.wallH;

  // 朝城一侧的那一面开门（炮台在城外，门必须背着旷野）
  const doorFacet = ((Math.round(Math.atan2(-f.x, -f.z) / step) % N) + N) % N;
  const At = (a, r) => ({ x: f.x + Math.sin(a) * r, z: f.z + Math.cos(a) * r });

  // --- 环形基座（外扩一圈条石）---
  const plinth = new THREE.CylinderGeometry(FORT.outerR + 0.35, FORT.outerR + 0.75, 0.6, N);
  ScaleRingUv(plinth, 3.0, 0.6);
  sink.Add("Ashlar", PlaceGeometry(plinth, { x: f.x, y: baseY + 0.3, z: f.z }));
  sink.Solid(f.x, baseY + 0.3, f.z, FORT.outerR + 0.75, 0.3, FORT.outerR + 0.75, "villageFoundation");

  // --- 16 段环壁 ---
  for (let k = 0; k < N; k += 1) {
    const a = k * step;
    const p = At(a, midR);
    // 战损：背野一侧随机压低一两段墙头（1938 年这两座早已废置，又挨了炮）
    const bite = rnd() < 0.18 ? 0.55 + rnd() * 0.9 : 0;
    const h = FORT.wallH - bite;
    if (k === doorFacet) {
      // 门洞：两侧砖垛 + 过梁 + 洞上砌实
      const jamb = (chord - FORT.doorW) / 2;
      for (const s of [-1, 1]) {
        const off = s * (FORT.doorW / 2 + jamb / 2);
        const q = { x: p.x + Math.cos(a) * off, z: p.z - Math.sin(a) * off };
        sink.Add("CityBrick", PlaceGeometry(
          MakeBox(jamb, h, wallT, TILE_METERS.brick, `${seed}:dj${s}`, BRICK_UV_GRID),
          { x: q.x, y: baseY + h / 2, z: q.z, ry: a }));
        sink.Solid(q.x, baseY + h / 2, q.z, jamb / 2, h / 2, wallT / 2, "wall", a);
      }
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(FORT.doorW + 0.7, 0.4, wallT + 0.1, TILE_METERS.stone, `${seed}:dlin`),
        { x: p.x, y: baseY + FORT.doorH + 0.2, z: p.z, ry: a }));
      const upH = h - FORT.doorH - 0.4;
      if (upH > 0.2) {
        sink.Add("CityBrick", PlaceGeometry(
          MakeBox(FORT.doorW, upH, wallT, TILE_METERS.brick, `${seed}:dup`, BRICK_UV_GRID),
          { x: p.x, y: baseY + FORT.doorH + 0.4 + upH / 2, z: p.z, ry: a }));
        sink.Solid(p.x, baseY + FORT.doorH + 0.4 + upH / 2, p.z, FORT.doorW / 2, upH / 2, wallT / 2, "wall", a);
      }
      // 门道墁地：从门槛铺进环廊，进门脚下有东西
      const pv = At(a, FORT.innerR - 0.4);
      sink.Add("WallPaving", PlaceGeometry(
        MakeBox(FORT.doorW + 0.2, 0.12, wallT + 1.0, TILE_METERS.stone, `${seed}:dpave`),
        { x: pv.x, y: baseY + 0.06, z: pv.z, ry: a }));
      continue;
    }
    sink.Add(k % 3 === 0 ? "CityBrickWorn" : "CityBrick", PlaceGeometry(
      MakeBox(chord, h, wallT, TILE_METERS.brick, `${seed}:w${k}`, BRICK_UV_GRID),
      { x: p.x, y: baseY + h / 2, z: p.z, ry: a }));
    sink.Solid(p.x, baseY + h / 2, p.z, chord / 2, h / 2, wallT / 2, "wall", a);
    sink.Cover(p.x, p.z, baseY + h, Math.sin(a), Math.cos(a));
    // 射孔两层：下层 1.45 m（立姿据枪）、上层 2.85 m（踏台）。门那一面与被削平的段不开
    if (bite < 0.4) {
      const op = At(a, FORT.outerR - 0.1);
      AddLoopholes(sink, {
        x: op.x, z: op.z, ry: a, ys: [baseY + 1.45], count: 1,
        seed: `${seed}:lp${k}`, wallFace: 0.06, size: 0.3,
      });
      if (k % 2 === 0) {
        AddLoopholes(sink, {
          x: op.x, z: op.z, ry: a, ys: [baseY + 2.85], count: 1,
          seed: `${seed}:lpu${k}`, wallFace: 0.06, size: 0.26,
        });
      }
    }
  }

  // --- 中心砖墩：环廊的内圈，同时是顶台的中柱 ---
  const core = new THREE.CylinderGeometry(FORT.coreR, FORT.coreR + 0.2, FORT.wallH, 12);
  ScaleRingUv(core, 2.4, FORT.wallH / 1.2);
  sink.Add("CityBrick", PlaceGeometry(core, { x: f.x, y: baseY + FORT.wallH / 2, z: f.z }));
  // 中心墩的碰撞用**三只轴对齐盒**近似八角，不用一只 2r×2r 的方盒：
  // Solid 的 min/max（AI 导航位图与掩体粗筛读的那一份）是轴对齐包围盒，
  // 一只 4×4 的方盒四个角会伸进 2.6 m 宽的环廊将近一米，把整条环廊判成不可走。
  const cq = FORT.coreR * 0.42, ch = baseY + FORT.wallH / 2, chy = FORT.wallH / 2;
  sink.Solid(f.x, ch, f.z, FORT.coreR, chy, cq, "wall");
  sink.Solid(f.x, ch, f.z, cq, chy, FORT.coreR, "wall");
  sink.Solid(f.x, ch, f.z, FORT.coreR * 0.76, chy, FORT.coreR * 0.76, "wall");

  // --- 环廊地面 ---
  const floor = new THREE.CylinderGeometry(FORT.innerR - 0.02, FORT.innerR - 0.02, 0.14, N);
  ScaleRingUv(floor, 3.2, 0.3);
  sink.Add("WallPaving", PlaceGeometry(floor, { x: f.x, y: baseY + 0.07, z: f.z }));

  // --- 环廊里的螺旋砖阶：14 级 × 0.33，绕 150° 上到顶台的上人口 ---
  const stairR = (FORT.coreR + FORT.innerR) / 2;
  const stairSpan = 0.62 / stairR;
  const stairStart = doorFacet * step + Math.PI * 0.55;
  const steps = Math.max(2, Math.round(FORT.wallH / 0.33));
  for (let i = 0; i < steps; i += 1) {
    const a = stairStart + i * stairSpan;
    const p = At(a, stairR);
    const h = (i + 1) * (FORT.wallH / steps);
    // ry: a —— 局部 +x 是切向（踏面宽 0.66），局部 +z 是径向（踏步横跨 2.1 m 的环廊）。
    // 第一版写成 a+π/2，两个轴对调，14 级台阶变成 14 道横在环廊里的挡墙。
    sink.Add("Ashlar", PlaceGeometry(
      MakeBox(0.66, h, FORT.innerR - FORT.coreR - 0.1, TILE_METERS.stone, `${seed}:st${i}`),
      { x: p.x, y: baseY + h / 2, z: p.z, ry: a }));
    sink.Solid(p.x, baseY + h / 2, p.z, 0.33, h / 2, (FORT.innerR - FORT.coreR - 0.1) / 2,
      "villageFoundation", a);
  }
  const hatchA = stairStart + steps * stairSpan;
  const hatchFacet = ((Math.round(hatchA / step) % N) + N) % N;

  // --- 顶台：16 块楔形铺板，上人口那两块不生成 ---
  const deckR = FORT.outerR - 0.05;
  const deckW = 2 * deckR * Math.sin(step / 2) * 1.08;
  const deckD = deckR - FORT.coreR + 0.2;
  for (let k = 0; k < N; k += 1) {
    if (k === hatchFacet || k === (hatchFacet + 1) % N) continue;
    const a = k * step;
    const p = At(a, (deckR + FORT.coreR) / 2);
    sink.Add("WallPaving", PlaceGeometry(
      MakeBox(deckW, FORT.deckT, deckD, TILE_METERS.stone, `${seed}:dk${k}`),
      { x: p.x, y: deckY + FORT.deckT / 2, z: p.z, ry: a }));
    sink.Solid(p.x, deckY + FORT.deckT / 2, p.z, deckW / 2, FORT.deckT / 2, deckD / 2,
      "villageFoundation", a);
  }
  // 中心墩顶盖
  const cap = new THREE.CylinderGeometry(FORT.coreR + 0.25, FORT.coreR + 0.25, FORT.deckT, 12);
  ScaleRingUv(cap, 2.2, 0.3);
  sink.Add("WallPaving", PlaceGeometry(cap, { x: f.x, y: deckY + FORT.deckT / 2, z: f.z }));
  sink.Solid(f.x, deckY + FORT.deckT / 2, f.z, FORT.coreR + 0.25, FORT.deckT / 2, FORT.coreR + 0.25,
    "villageFoundation");

  // --- 女儿墙一圈：垛口式，逐段有高有低；被打塌的一两段直接缺口 ---
  const parapetY = deckY + FORT.deckT;
  const parR = FORT.outerR - 0.32;
  const parW = 2 * parR * Math.sin(step / 2) * 1.07;
  for (let k = 0; k < N; k += 1) {
    if (k === hatchFacet) continue;
    const a = k * step;
    const p = At(a, parR);
    const gone = rnd() < 0.12 + damage * 0.18;
    const h = gone ? FORT.parapetH * (0.2 + rnd() * 0.3) : FORT.parapetH;
    sink.Add(gone ? "CityBrickWorn" : "CityBrick", PlaceGeometry(
      MakeBox(parW, h, 0.52, TILE_METERS.brick, `${seed}:pp${k}`, BRICK_UV_GRID),
      { x: p.x, y: parapetY + h / 2, z: p.z, ry: a }));
    sink.Solid(p.x, parapetY + h / 2, p.z, parW / 2, h / 2, 0.26, "wall", a);
    sink.Cover(p.x, p.z, parapetY + h, Math.sin(a), Math.cos(a));
    if (!gone && k % 2 === 1) {
      const op = At(a, parR + 0.2);
      AddLoopholes(sink, {
        x: op.x, z: op.z, ry: a, ys: [parapetY + 0.62], count: 1,
        seed: `${seed}:pplp${k}`, wallFace: 0.06, size: 0.26,
      });
    }
  }
  // 压顶石一圈（女儿墙外侧的一道挑檐线，远看是炮台顶那一圈亮边）
  const cope = new THREE.CylinderGeometry(FORT.outerR + 0.18, FORT.outerR + 0.05, 0.22, N);
  ScaleRingUv(cope, 3.2, 0.3);
  sink.Add("Ashlar", PlaceGeometry(cope, { x: f.x, y: parapetY - 0.11, z: f.z }));

  // --- 台外的碎砖：废置三十年 + 挨过炮，脚下总有一圈落砖 ---
  for (let i = 0; i < 14; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = FORT.outerR + 0.9 + rnd() * 3.4;
    const p = At(a, r);
    sink.Add("CityBrickWorn", PlaceGeometry(
      MakeBox(0.4 + rnd() * 0.55, 0.2 + rnd() * 0.22, 0.32 + rnd() * 0.3, TILE_METERS.brick, `${seed}:rb${i}`),
      { x: p.x, y: host.OuterHeight(p.x, p.z) + 0.11, z: p.z, ry: rnd() * 3.1, rz: (rnd() - 0.5) * 0.3 }));
  }
}

/** 圆柱面 UV 按世界米数重算（默认 0..1 的 UV 会把砖拉成竖条纹）。 */
function ScaleRingUv(geometry, uScale, vScale) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  uv.needsUpdate = true;
  return geometry;
}

// ---------------------------------------------------------------------------
// ⑤ 龙泉塔 —— 1938 年 3 月战损态
// ---------------------------------------------------------------------------

/**
 * 八角九级砖塔，**只做 1938 年 3 月那个残塔**。
 *
 * 史料（docs/Data_TengxianCity.md §4.4、§7 与 1984 年维修记录反推）：
 *   · 塔刹倾毁 —— 顶上什么都不装，留一圈参差断砖；
 *   · 顶层（第九级）塔室**部分**倾塌 —— 八面墙板里塌掉三四片，露出第九级楼面；
 *   · 挑檐斗拱脱落 —— 檐做成逐面独立的八块，缺角是真的缺一块；
 *   · 日军观测班登到 **30 m**（非全高）——第八级楼面标高按 30 m 配层高。
 *
 * 与 Script_World.AddPagoda 的差别（那支旧函数保留给台儿庄，本文件不再调用它）：
 *   旧版的挑檐是一整圈锥台 + 一圈可有可无的斗拱方料，塌与不塌只有顶层一个开关；
 *   本版把「檐、斗拱、塔壁」全拆成逐面构件，破坏是**几何缺失**而不是贴图差别，
 *   并补了塔身弹痕、塔基周围的落瓦落砖、以及压 OuterHeight 的地坪
 *  （旧调用写死 baseY: 0，而城东郊地坪是 -1.2 + 起伏，塔是飘着的）。
 */
export function BuildPagodaLandmark(host, l, ctx) {
  const sink = host.sink;
  const seed = `map:${l.id}`;
  const rnd = Mulberry32(HashString(seed));
  const baseY = host.OuterHeight(l.x, l.z);
  const tiers = l.tiers || 9;
  const baseR = 4.3, topR = 2.1;
  const x = l.x, z = l.z;

  // --- 台基（八角）+ 一圈散水 ---
  const plinth = new THREE.CylinderGeometry(baseR + 1.5, baseR + 1.95, 1.7, 8);
  ScaleRingUv(plinth, 3.0, 1.3);
  sink.Add("Ashlar", PlaceGeometry(plinth, { x, y: baseY + 0.85, z }));
  sink.Solid(x, baseY + 0.85, z, baseR + 1.95, 0.85, baseR + 1.95, "villageFoundation");
  const apron = new THREE.CylinderGeometry(baseR + 3.0, baseR + 3.2, 0.16, 8);
  ScaleRingUv(apron, 3.0, 0.2);
  sink.Add("WallPaving", PlaceGeometry(apron, { x, y: baseY + 0.08, z }));

  let y = baseY + 1.7;
  for (let t = 0; t < tiers; t += 1) {
    const f0 = t / tiers, f1 = (t + 1) / tiers;
    const r0 = baseR + (topR - baseR) * f0;
    const r1 = baseR + (topR - baseR) * f1;
    // 层高逐级递减：第八级楼面正落在 30 m 上下（日方观测班能登到的高度）
    const h = 4.7 - t * 0.30;
    const broken = t === tiers - 1;

    if (!broken) {
      const shaft = new THREE.CylinderGeometry(r1, r0, h, 8);
      ScaleRingUv(shaft, 3.2, h / 1.2);
      sink.Add(t < 2 ? "CityBrick" : "CityBrickWorn", PlaceGeometry(shaft, { x, y: y + h / 2, z }));
      if (t === 0) sink.Solid(x, y + h / 2, z, r0, h / 2, r0, "wall");
      // 券门：八面里的四面开门，逐层错开半角（楼阁式砖塔的常规做法）
      for (let k = 0; k < 4; k += 1) {
        const a = (k * Math.PI) / 2 + (t % 2) * (Math.PI / 4);
        const doorH = Math.min(2.2, h * 0.5);
        sink.Add("Charred", PlaceGeometry(
          MakeBox(0.92, doorH, 0.5, TILE_METERS.stone, `${seed}:d${t}${k}`),
          { x: x + Math.sin(a) * (r0 - 0.12), y: y + h * 0.32, z: z + Math.cos(a) * (r0 - 0.12), ry: a }));
        // 券顶那道砖旋
        sink.Add("Ashlar", PlaceGeometry(
          MakeBox(1.16, 0.22, 0.42, TILE_METERS.stone, `${seed}:da${t}${k}`),
          { x: x + Math.sin(a) * (r0 - 0.06), y: y + h * 0.32 + doorH / 2 + 0.11,
            z: z + Math.cos(a) * (r0 - 0.06), ry: a }));
      }
      // 炮弹擦痕：下面四级挨过流弹，砖面上留下几块崩口
      if (t < 4 && rnd() < 0.75) {
        const a = rnd() * Math.PI * 2;
        sink.Add("CityBrickPatch", PlaceGeometry(
          MakeBox(0.7 + rnd() * 0.9, 0.5 + rnd() * 0.6, 0.28, TILE_METERS.brick, `${seed}:scar${t}`),
          { x: x + Math.sin(a) * (r0 - 0.06), y: y + h * (0.3 + rnd() * 0.45),
            z: z + Math.cos(a) * (r0 - 0.06), ry: a, rz: (rnd() - 0.5) * 0.5 }));
      }
    } else {
      // 第九级：**部分**倾塌 —— 八片墙板里留四五片，其余处露出楼面与断茬
      const bodyH = h * 0.62;
      const panelW = 2 * r0 * Math.tan(Math.PI / 8) * 1.04;
      const floorG = new THREE.CylinderGeometry(r0 + 0.1, r0 + 0.1, 0.3, 8);
      ScaleRingUv(floorG, 2.4, 0.3);
      sink.Add("CityBrickWorn", PlaceGeometry(floorG, { x, y: y + 0.15, z }));
      for (let k = 0; k < 8; k += 1) {
        const a = (k * Math.PI) / 4;
        const fall = rnd();
        if (fall < 0.42) continue;                        // 塌掉的那几片
        const ph = fall < 0.62 ? bodyH * (0.28 + rnd() * 0.4) : bodyH;
        sink.Add("CityBrickWorn", PlaceGeometry(
          MakeBox(panelW, ph, 0.62, TILE_METERS.brick, `${seed}:tp${k}`, BRICK_UV_GRID),
          { x: x + Math.sin(a) * (r0 - 0.3), y: y + 0.3 + ph / 2, z: z + Math.cos(a) * (r0 - 0.3), ry: a }));
      }
      y += 0.3 + bodyH;
      break;
    }

    // 挑檐：逐面八块，缺角是真的缺一块（1938 年**挑檐斗拱脱落**）
    const eaveOut = 1.15;
    const eaveW = 2 * (r1 + eaveOut) * Math.tan(Math.PI / 8) * 1.04;
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      if (rnd() < 0.10 + t * 0.035) continue;              // 越往上掉得越多
      sink.Add("TubeTile", PlaceGeometry(
        MakeBox(eaveW, 0.26, eaveOut + 0.5, TILE_METERS.roof, `${seed}:ev${t}${k}`),
        { x: x + Math.sin(a) * (r1 + eaveOut / 2 - 0.1), y: y + h + 0.13,
          z: z + Math.cos(a) * (r1 + eaveOut / 2 - 0.1), ry: a, rx: 0.12 }));
      // 转角斗拱：还挂着的那几朵
      if (rnd() > 0.34) {
        const ca = a + Math.PI / 8;
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.24, 0.26, 0.86, TILE_METERS.wood, `${seed}:br${t}${k}`),
          { x: x + Math.sin(ca) * (r1 + 0.5), y: y + h - 0.2, z: z + Math.cos(ca) * (r1 + 0.5), ry: ca }));
      }
    }
    y += h + 0.3;
  }

  // --- 塔顶：**不装塔刹**。1938 年 3 月它已经倾毁，只留一圈参差断砖 ---
  for (let k = 0; k < 7; k += 1) {
    const a = rnd() * Math.PI * 2;
    const r = topR * (0.25 + rnd() * 0.7);
    sink.Add("CityBrickWorn", PlaceGeometry(
      MakeBox(0.55 + rnd() * 0.5, 0.32 + rnd() * 0.5, 0.48, TILE_METERS.brick, `${seed}:stub${k}`),
      { x: x + Math.sin(a) * r, y: y + 0.2, z: z + Math.cos(a) * r, ry: a, rz: (rnd() - 0.5) * 0.45 }));
  }

  // --- 塔下的落瓦落砖：掉下来的檐口与斗拱堆在台基边上，这是「战损」最直白的一笔 ---
  for (let i = 0; i < 18; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = baseR + 2.2 + rnd() * 4.5;
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    const gy = host.OuterHeight(px, pz);
    const tile = rnd() < 0.45;
    sink.Add(tile ? "TubeTile" : "CityBrickWorn", PlaceGeometry(
      MakeBox(tile ? 0.6 + rnd() * 0.5 : 0.38 + rnd() * 0.4, 0.16 + rnd() * 0.2, 0.34 + rnd() * 0.3,
        tile ? TILE_METERS.roof : TILE_METERS.brick, `${seed}:fall${i}`),
      { x: px, y: gy + 0.09, z: pz, ry: rnd() * 3.1, rz: (rnd() - 0.5) * 0.5 }));
  }
  // 几根摔下来的斗拱木料
  for (let i = 0; i < 4; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = baseR + 2.6 + rnd() * 3.0;
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.22, 0.2, 0.9 + rnd() * 0.5, TILE_METERS.wood, `${seed}:beam${i}`),
      { x: px, y: host.OuterHeight(px, pz) + 0.11, z: pz, ry: rnd() * 3.1, rz: (rnd() - 0.5) * 0.2 }));
  }
  void ctx;
}

// ---------------------------------------------------------------------------
// ⑥ 弘道院剪影群 —— 远景层次改良（不可进入）
// ---------------------------------------------------------------------------

/**
 * 北关的美北长老会教产（华北弘道院／华北神学院）一带。
 *
 * **位置、布局、形制、层数、材质一概无资料**（docs §未解 671 行），只知道「设于滕县北关」。
 * 所以这一片仍然只做**远景剪影**：farSink、无内部、无碰撞细节。
 * 但剪影本身要有层次 —— 旧版是 7 个平顶盒子随机撒，读起来是「一堆箱子」。
 * 本版给出四条读图信号：
 *   ① 坡顶：每栋都有两坡瓦面 + 正脊，脊向按位置交错（横排的脊沿东西，竖排的沿南北）；
 *   ② 层数：三栋两层（带腰线）+ 四栋单层，高度差是「学校」而不是「村子」的信号；
 *   ③ 一栋带小钟塔：教会学校在天际线上唯一的竖向构件；
 *   ④ 一圈围墙 + 一座校门：把散落的房子收成一所学校。
 */
export function BuildSilhouetteCluster(host, l, ctx) {
  const far = host.farSink;
  const rnd = Mulberry32(HashString(l.id));
  const seed = `map:${l.id}`;
  const hw = l.w / 2, hd = l.d / 2;

  // --- 围墙一圈（远景：连续矮体，不做砌块参差）---
  const wallH = 2.2;
  const sides = [
    { x: l.x, z: l.z - hd, w: l.w, d: 0.5 },
    { x: l.x, z: l.z + hd, w: l.w, d: 0.5 },
    { x: l.x - hw, z: l.z, w: 0.5, d: l.d },
    { x: l.x + hw, z: l.z, w: 0.5, d: l.d },
  ];
  for (let i = 0; i < sides.length; i += 1) {
    const s = sides[i];
    const gy = host.OuterHeight(s.x, s.z);
    far.Add("HouseBrick", PlaceGeometry(
      MakeBox(s.w, wallH, s.d, TILE_METERS.brick, `${seed}:cw${i}`, BRICK_UV_GRID),
      { x: s.x, y: gy + wallH / 2, z: s.z }));
    host.sink.Solid(s.x, gy + wallH / 2, s.z, s.w / 2, wallH / 2, s.d / 2, "wall");
  }
  // 校门：南墙正中一座门楼（朝城的一面）
  const gx = l.x, gz = l.z + hd;
  const gy = host.OuterHeight(gx, gz);
  far.Add("HouseBrick", PlaceGeometry(
    MakeBox(6.4, 4.4, 1.2, TILE_METERS.brick, `${seed}:gate`, BRICK_UV_GRID),
    { x: gx, y: gy + 2.2, z: gz }));
  far.Add("Charred", PlaceGeometry(
    MakeBox(2.4, 2.8, 1.34, TILE_METERS.stone, `${seed}:gatehole`),
    { x: gx, y: gy + 1.4, z: gz }));
  far.Add("RoofTile", PlaceGeometry(
    MakeBox(7.2, 0.4, 1.9, TILE_METERS.roof, `${seed}:gatecap`),
    { x: gx, y: gy + 4.6, z: gz }));

  // --- 七栋校舍：两排夹一个中庭，脊向交错 ---
  const plan = [
    { lx: -0.62, lz: -0.62, w: 24, d: 11, storeys: 2, ry: 0, tower: false },
    { lx: 0.00, lz: -0.66, w: 18, d: 10, storeys: 2, ry: 0, tower: true },
    { lx: 0.64, lz: -0.60, w: 20, d: 11, storeys: 1, ry: 0, tower: false },
    { lx: -0.70, lz: 0.28, w: 11, d: 20, storeys: 1, ry: Math.PI / 2, tower: false },
    { lx: 0.72, lz: 0.24, w: 11, d: 22, storeys: 2, ry: Math.PI / 2, tower: false },
    { lx: -0.14, lz: 0.52, w: 22, d: 10, storeys: 1, ry: 0, tower: false },
    { lx: 0.34, lz: 0.58, w: 14, d: 9, storeys: 1, ry: 0, tower: false },
  ];
  for (let i = 0; i < plan.length; i += 1) {
    const b = plan[i];
    const x = l.x + b.lx * (hw - 12) + (rnd() - 0.5) * 3.0;
    const z = l.z + b.lz * (hd - 8) + (rnd() - 0.5) * 2.4;
    const base = host.OuterHeight(x, z);
    const storeyH = 3.7;
    const eave = base + 0.4 + b.storeys * storeyH;
    const span = b.ry === 0 ? b.d : b.w;                    // 坡的进深方向
    const runW = b.ry === 0 ? b.w : b.d;                    // 脊的长度方向
    const rise = span * 0.5 * 0.52;

    // 台明
    far.Add("Stone", PlaceGeometry(
      MakeBox(b.w + 1.0, 0.8, b.d + 1.0, TILE_METERS.stone, `${seed}:pl${i}`),
      { x, y: base + 0.4, z }));
    // 楼身
    far.Add("HouseBrick", PlaceGeometry(
      MakeBox(b.w, eave - base - 0.4, b.d, TILE_METERS.brick, `${seed}:b${i}`, BRICK_UV_GRID),
      { x, y: (base + 0.8 + eave) / 2, z }));
    host.sink.Solid(x, (base + eave) / 2, z, b.w / 2, (eave - base) / 2, b.d / 2, "wall");
    // 两层的腰线：一条挑出的檐口带。远景里「两层」就靠这一条横线读出来
    if (b.storeys === 2) {
      far.Add("Stone", PlaceGeometry(
        MakeBox(b.w + 0.5, 0.26, b.d + 0.5, TILE_METERS.stone, `${seed}:bl${i}`),
        { x, y: base + 0.4 + storeyH, z }));
    }
    // 两坡瓦面 + 正脊（脊向由 b.ry 决定：横排沿东西，竖排沿南北）
    const slopeLen = Math.hypot(span / 2, rise) + 0.5;
    for (const s of [-1, 1]) {
      const off = s * (span / 4);
      far.Add("RoofTile", PlaceGeometry(
        MakeBox(runW + 0.9, 0.22, slopeLen, TILE_METERS.roof, `${seed}:rf${i}${s}`),
        {
          x: x - Math.sin(b.ry) * off, y: eave + rise / 2, z: z - Math.cos(b.ry) * off,
          ry: b.ry, rx: -s * Math.atan2(rise, span / 2),
        }));
    }
    far.Add("RoofTile", PlaceGeometry(
      MakeBox(runW + 0.9, 0.3, 0.5, TILE_METERS.roof, `${seed}:rd${i}`),
      { x, y: eave + rise + 0.12, z, ry: b.ry }));
    // 山墙（把两坡之间的三角补上，否则远景里屋顶像浮在墙上的两块板）
    for (const s of [-1, 1]) {
      const off = s * (runW / 2);
      for (let k = 0; k < 4; k += 1) {
        const tc = (k + 0.5) / 4;
        const hh = rise * (1 - Math.abs(tc * 2 - 1)) + 0.1;   // 中间高两端低：这才是山尖
        const segD = span / 4;
        far.Add("HouseBrick", PlaceGeometry(
          MakeBox(0.3, hh, segD, TILE_METERS.brick, `${seed}:gb${i}${s}${k}`),
          {
            x: x + Math.cos(b.ry) * off - Math.sin(b.ry) * (span / 2 - segD * (k + 0.5)),
            y: eave + hh / 2,
            z: z - Math.sin(b.ry) * off - Math.cos(b.ry) * (span / 2 - segD * (k + 0.5)),
            ry: b.ry,
          }));
      }
    }
    // 钟塔：整片剪影里唯一的竖向构件
    if (b.tower) {
      const tw = 3.4, th = 9.0;
      const tz = z + (b.ry === 0 ? b.d / 2 - tw / 2 + 0.4 : 0);
      const tx = x + (b.ry === 0 ? 0 : b.w / 2 - tw / 2 + 0.4);
      far.Add("HouseBrick", PlaceGeometry(
        MakeBox(tw, eave - base + th, tw, TILE_METERS.brick, `${seed}:tw${i}`, BRICK_UV_GRID),
        { x: tx, y: base + (eave - base + th) / 2, z: tz }));
      host.sink.Solid(tx, base + (eave - base + th) / 2, tz, tw / 2, (eave - base + th) / 2, tw / 2, "wall");
      // 钟层的四面券洞
      for (const s of [-1, 1]) {
        far.Add("Charred", PlaceGeometry(
          MakeBox(1.5, 1.9, tw + 0.06, TILE_METERS.stone, `${seed}:tb${i}${s}`),
          { x: tx, y: eave + th - 1.9, z: tz, ry: s > 0 ? 0 : Math.PI / 2 }));
      }
      const spire = new THREE.ConeGeometry(tw * 0.8, 3.4, 4);
      ScaleRingUv(spire, 2.4, 2.4);
      far.Add("TubeTile", PlaceGeometry(spire, { x: tx, y: eave + th + 1.7, z: tz, ry: Math.PI / 4 }));
    }
  }
  void ctx;
}

// ---------------------------------------------------------------------------
// 四方城 —— 本轮不在 D6 的六件清单里，维持既有实现
// ---------------------------------------------------------------------------

export function BuildSquareFortLandmark(host, l, ctx) {
  AddSquareFort(host.sink, {
    x: l.x, z: l.z, ry: ctx.ry ?? 0, w: l.w, d: l.d, seed: l.id,
    damage: ctx.damage ?? 0.3,
  });
}
