// 商会 + 当典（当铺）+ 办事处 —— 商用公建三件。工作包 A4 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注：Build<Kind>(host, f, ctx)，尺寸一律从 f 读。
//
// 三件东西各自要在 Z8 俯瞰里**一眼跟民居网格分开**，靠的是三种不同的读图信号：
//   · 商会  —— 县城里罕见的**两层**临街门脸楼（脊高 ~8.8 m，民居脊高 4.0—4.8 m）。
//              整条街只有它高出一头，后面才是会所院。楼下正中留一条穿堂门道通后院。
//   · 当典  —— 一圈**明显高过民居**的防盗高墙（4.2 m，民居院墙 2.0—2.5 m）+ 墙头碎瓷，
//              院里一座近乎不开窗的两层实心库楼（脊高 ~9.1 m），门口两根 6.8 m 高杆布幌。
//              没有影壁以外的花活：当铺的形制语言就是"厚、高、闭"。
//   · 办事处 —— 机关化院落：门房 + 大影壁 + 台明上的长条办公正房 + 两列办公厢房 + 旗杆，
//              轴线整齐、构件规整，但比师部朴素一档（不设二进院、不设岗楼）。
//
// 形制尺寸依据 docs/Data_HistoryMaterial.md §4.2：单开间 3.0—3.6 m、三开间正房 9—11 m、
// 进深 4.5—6 m、檐口 2.4—2.8 m、脊高 4.0—4.8 m、硬山坡度 26°—29°、院墙 2.0—2.5 m、
// 门楼 3.5—4.5 m。凡高出这几档的（两层楼、当铺高墙、库楼）都是本包的 PRESUMED，已列进交付报告。

import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MakeBox, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import {
  AddWall, AddRoomBlock, AddHardMountainRoof, AddDoorReveal, AddGatehouse, AddWell,
} from "./Script_World.mjs";
import { AddCourtyardLife, AddYardWear } from "./Script_LivedInProps.mjs";

const DEG = Math.PI / 180;
const SLOPE27 = Math.tan(27 * DEG);
const SLOPE275 = Math.tan(27.5 * DEG);

/**
 * 地块局部坐标 → 世界坐标。
 *
 * 采用与 AddCompound / AddRoomBlock 完全相同的一套「场地约定」：
 *   局部 +x = 面阔方向，局部 **+z = 朝门/临街的那一侧**（与 ctx.ry 一起算出来）。
 * 注意它和 PlaceGeometry(ry) 之后几何体自己的 +z 是**反向**的 —— 上游那两个函数
 * 就是这么写的，跟着走才不会出现"东西造在街对面"。要往几何 +z 指的地方摆
 * （比如 AddDoorReveal 的"朝里"），直接把同一个 ry 传过去即可，两边约定一致。
 */
function SiteFrame(f, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return {
    cos, sin,
    At(lx, lz) { return { x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz }; },
  };
}

/** 一块摆好位置的方料。楼层、腰檐、门额这些不落地的构件只能这么砌（AddWall 恒从 y=0 起）。 */
function Slab(sink, material, p, y, w, h, d, ry, seed, { rx = 0, tile = TILE_METERS.brick } = {}) {
  sink.Add(material, PlaceGeometry(MakeBox(w, h, d, tile, seed), { x: p.x, y, z: p.z, ry, rx }));
}

/** 不落地构件的碰撞：AddWall/AddRoomBlock 自带 Solid，自砌的方料要自己登记。 */
function SolidSlab(sink, p, cy, hx, hy, hz, ry, tag = "wall") {
  sink.Solid(p.x, cy, p.z, hx, hy, hz, tag, ry);
}

/**
 * 一圈院墙，临街那面（局部 +z）中间留 openW 的开口。
 * 南北两面故意做成 f.w + thickness 长，把四角的缺口盖住（AddCompound 那边留了角缝）。
 */
function AddYardWall(sink, f, ry, o) {
  const S = SiteFrame(f, ry);
  const hw = f.w / 2, hd = f.d / 2, t = o.thickness;
  const sides = [
    { lx: 0, lz: -hd, len: f.w + t, rot: 0, gate: false, tag: "n" },
    { lx: -hw, lz: 0, len: f.d, rot: Math.PI / 2, gate: false, tag: "w" },
    { lx: hw, lz: 0, len: f.d, rot: Math.PI / 2, gate: false, tag: "e" },
    { lx: 0, lz: hd, len: f.w + t, rot: 0, gate: true, tag: "s" },
  ];
  for (const s of sides) {
    const common = {
      height: o.height, thickness: t, ry: ry + s.rot, ruin: o.ruin,
      plinth: o.plinth, cope: o.cope, tile: o.tile || TILE_METERS.brick,
    };
    if (s.gate && o.openW > 0) {
      const segLen = (s.len - o.openW) / 2;
      for (const side of [-1, 1]) {
        const p = S.At(s.lx + side * (o.openW / 2 + segLen / 2), s.lz);
        AddWall(sink, o.material, {
          ...common, x: p.x, z: p.z, length: segLen, seed: `${o.seed}:${s.tag}${side}`,
        });
      }
    } else {
      const p = S.At(s.lx, s.lz);
      AddWall(sink, o.material, { ...common, x: p.x, z: p.z, length: s.len, seed: `${o.seed}:${s.tag}` });
    }
  }
}

/**
 * 摆一栋附属房：位置在**父地块**的场地坐标里算，房子自己的朝向另给。侵街就整栋省掉。
 *
 * roofRafters 默认关：一排椽头是 AddHardMountainRoof 里最贵的一笔（每 0.42 m 一根，
 * 一栋 26 m 的正房光椽子就 1.5k 三角），而它只在十几米内读得出来。
 * 主体建筑显式打开，退在后面的厢房/门房一律不给 —— 三个院子省下 ~3k 三角。
 */
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

// ---------------------------------------------------------------------------
// 商会 —— 临街两层门脸楼 + 后进会所院
// ---------------------------------------------------------------------------

export function BuildGuild(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry;
  const S = SiteFrame(f, ry);
  const seed = `map:${f.id}`;
  const wallMat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const tileMat = ctx.burnt ? "BrickWallSooty" : "RoofTile";
  const hw = f.w / 2, hd = f.d / 2;

  // --- 门脸楼的体量 ---
  const frontD = Math.max(6.5, Math.min(9.0, f.d * 0.32));   // 临街楼进深
  const frontLz = hd - frontD / 2;                            // 楼身中心
  const rearLz = hd - frontD;                                 // 楼的后墙面
  const floor1 = 3.45;                                        // 一层层高（下檐/腰檐）
  const eave2 = 6.6;                                          // 二层檐口
  const ridge2 = eave2 + (frontD / 2) * SLOPE275;             // 脊 ~8.8 m
  const face = hd - 0.22;                                     // 临街墙心（墙厚 0.44）

  let bays = Math.max(5, Math.round(f.w / 4.4));
  if (bays % 2 === 0) bays += 1;
  const bayW = f.w / bays;
  const passBay = (bays - 1) / 2;
  const passHalf = 1.55;                                      // 穿堂门道净宽 3.1 m

  // --- 一层：木柱 + 排门板铺面，正中一条穿堂门道 ---
  for (let i = 1; i < bays; i += 1) {
    const lx = -hw + bayW * i;
    const p = S.At(lx, face);
    Slab(sink, "WoodBeam", p, floor1 / 2, 0.42, floor1, 0.5, ry, `${seed}:col${i}`, { tile: TILE_METERS.wood });
    Slab(sink, "Stone", S.At(lx, face), 0.22, 0.62, 0.44, 0.7, ry, `${seed}:colb${i}`, { tile: TILE_METERS.stone });
    SolidSlab(sink, p, floor1 / 2, 0.24, floor1 / 2, 0.28, ry);
  }
  for (let b = 0; b < bays; b += 1) {
    const lx = -hw + bayW * (b + 0.5);
    const panelW = bayW - 0.52;
    if (b === passBay) {
      // 门道：0—3.0 m 全空，上头一根过梁 + 一块商会门匾
      const lintel = S.At(lx, face);
      Slab(sink, "WoodBeam", lintel, 3.16, passHalf * 2 + 0.9, 0.32, 0.62, ry,
        `${seed}:passLin`, { tile: TILE_METERS.wood });
      Slab(sink, "WoodDoor", S.At(lx, hd + 0.12), 3.02, panelW * 1.35, 0.86, 0.14, ry,
        `${seed}:plaque`, { tile: TILE_METERS.wood });
      AddDoorReveal(sink, {
        x: lintel.x, z: lintel.z, ry, openW: passHalf * 2, openH: 3.0,
        depth: frontD + 0.6, seed: `${seed}:passRv`,
      });
      continue;
    }
    // 槛墙 0.85 → 排门板 0.85—2.75 → 门头板 2.75—3.45
    const wall = S.At(lx, face);
    Slab(sink, wallMat, wall, 0.425, panelW, 0.85, 0.44, ry, `${seed}:sill${b}`);
    Slab(sink, wallMat, wall, (2.75 + floor1) / 2, panelW, floor1 - 2.75, 0.44, ry, `${seed}:tran${b}`);
    const boards = S.At(lx, hd + 0.02);
    Slab(sink, "WoodDoor", boards, 1.8, panelW, 1.9, 0.1, ry, `${seed}:shut${b}`, { tile: TILE_METERS.wood });
    for (let m = -1; m <= 1; m += 1) {
      Slab(sink, "WoodBeam", S.At(lx + m * panelW * 0.3, hd + 0.09), 1.8, 0.08, 1.9, 0.09, ry,
        `${seed}:mul${b}${m}`, { tile: TILE_METERS.wood });
    }
    SolidSlab(sink, wall, floor1 / 2, panelW / 2 + 0.26, floor1 / 2, 0.24, ry);
    sink.Cover(wall.x, wall.z, floor1, S.sin, S.cos);
  }

  // --- 腰檐：一层与二层之间挑出街面的一道瓦檐。两层楼的读图信号有一半在这条线上 ---
  for (let i = 0; i <= 4; i += 1) {
    const lx = -hw + (f.w / 4) * i;
    Slab(sink, "WoodBeam", S.At(lx, hd + 0.35), floor1 + 0.12, 0.16, 0.16, 1.3, ry,
      `${seed}:brk${i}`, { tile: TILE_METERS.wood });
  }
  Slab(sink, tileMat, S.At(0, hd + 0.62), floor1 + 0.42, f.w + 0.5, 0.12, 1.6, ry,
    `${seed}:waist`, { rx: -0.42, tile: TILE_METERS.roof });

  // --- 二层：槛墙 + 一排格子窗 + 檐下墙 ---
  Slab(sink, wallMat, S.At(0, face), (floor1 + 4.45) / 2, f.w, 4.45 - floor1, 0.44, ry, `${seed}:up1`);
  Slab(sink, wallMat, S.At(0, face), (5.75 + eave2) / 2, f.w, eave2 - 5.75, 0.44, ry, `${seed}:up3`);
  for (let i = 1; i < bays; i += 1) {
    Slab(sink, wallMat, S.At(-hw + bayW * i, face), 5.1, 0.85, 1.3, 0.44, ry, `${seed}:pier${i}`);
  }
  for (let b = 0; b < bays; b += 1) {
    const lx = -hw + bayW * (b + 0.5);
    const winW = bayW - 0.95;
    for (const s of [-1, 1]) {
      Slab(sink, "WoodDoor", S.At(lx, hd - 0.03), 5.1 + s * 0.65, winW, 0.09, 0.14, ry,
        `${seed}:wr${b}${s}`, { tile: TILE_METERS.wood });
    }
    for (let m = 0; m < 4; m += 1) {
      Slab(sink, "WoodDoor", S.At(lx + (-0.375 + m * 0.25) * winW, hd - 0.03), 5.1, 0.07, 1.3, 0.14, ry,
        `${seed}:wm${b}${m}`, { tile: TILE_METERS.wood });
    }
  }
  // 二层整墙横跨门道上方：碰撞盒抬到 3.45 m 以上，人从楼下穿堂走过去
  SolidSlab(sink, S.At(0, face), (floor1 + eave2) / 2, hw, (eave2 - floor1) / 2, 0.24, ry);

  // --- 楼的后墙（门道在这里也要留口）+ 两山（由硬山山墙兼作，另补碰撞） ---
  const backSeg = (f.w - passHalf * 2) / 2;
  for (const side of [-1, 1]) {
    const p = S.At(side * (passHalf + backSeg / 2), rearLz + 0.2);
    Slab(sink, wallMat, p, eave2 / 2, backSeg, eave2, 0.4, ry, `${seed}:back${side}`);
    SolidSlab(sink, p, eave2 / 2, backSeg / 2, eave2 / 2, 0.22, ry);
  }
  const backTop = S.At(0, rearLz + 0.2);
  Slab(sink, wallMat, backTop, (3.0 + eave2) / 2, passHalf * 2, eave2 - 3.0, 0.4, ry, `${seed}:backTop`);
  SolidSlab(sink, backTop, (3.0 + eave2) / 2, passHalf, (eave2 - 3.0) / 2, 0.22, ry);
  for (const side of [-1, 1]) {
    SolidSlab(sink, S.At(side * (hw + 0.15), frontLz), ridge2 / 2, 0.2, ridge2 / 2, frontD / 2, ry);
  }

  const roofAt = S.At(0, frontLz);
  AddHardMountainRoof(sink, {
    x: roofAt.x, z: roofAt.z, width: f.w, depth: frontD, eaveY: eave2, ridgeY: ridge2,
    ry, seed: `${seed}:roof`, ruined: ctx.damage > 0.62, burnt: ctx.burnt,
  });

  // --- 后进会所院：三面院墙（临街那面就是楼身）+ 会所正房 + 东西厢 ---
  const yardLz = (rearLz - hd) / 2;
  const yardLen = rearLz + hd;
  for (const side of [-1, 1]) {
    const p = S.At(side * hw, yardLz);
    AddWall(sink, wallMat, {
      x: p.x, z: p.z, length: yardLen, height: 2.6, thickness: 0.4, ry: ry + Math.PI / 2,
      ruin: ctx.damage * 0.8, seed: `${seed}:yw${side}`, plinth: "Stone", cope: true,
    });
  }
  const backWall = S.At(0, -hd);
  AddWall(sink, wallMat, {
    x: backWall.x, z: backWall.z, length: f.w + 0.4, height: 2.6, thickness: 0.4, ry,
    ruin: ctx.damage * 0.8, seed: `${seed}:ywn`, plinth: "Stone", cope: true,
  });

  const hallD = 6.2;
  const hallEave = 3.15;
  Room(host, f, ry, 0, -hd + hallD / 2 + 0.7, {
    width: Math.min(f.w * 0.46, 18), depth: hallD, eaveY: hallEave,
    ridgeY: hallEave + (hallD / 2) * SLOPE275, seed: `${seed}:hall`,
    damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 5, roofRafters: true,
  });
  const wingX = 5.0, wingZ = 8.4, wingEave = 2.55;
  for (const side of [-1, 1]) {
    Room(host, f, ry, side * (hw - wingX / 2 - 0.7), -1.0, {
      ry: ry + Math.PI / 2 * side, width: wingZ, depth: wingX, eaveY: wingEave,
      ridgeY: wingEave + (wingX / 2) * SLOPE27, seed: `${seed}:wing${side}`,
      damage: ctx.damage, burnt: ctx.burnt, facing: side, bays: 3,
    });
  }

  const well = S.At(-hw * 0.42, -1.5);
  AddWell(sink, well.x, well.z);
  const life = S.At(hw * 0.22, -1.0);
  AddCourtyardLife(sink, {
    x: life.x, z: life.z, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, f.w * 0.4), depth: Math.max(4.5, f.d * 0.3), damage: ctx.damage,
  });
}

// ---------------------------------------------------------------------------
// 当典 —— 防盗高墙 + 库楼 + 高杆布幌
// ---------------------------------------------------------------------------

export function BuildPawnshop(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry;
  const S = SiteFrame(f, ry);
  const seed = `map:${f.id}`;
  const rnd = Mulberry32(HashString(`${seed}:pawn`));
  const wallMat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const tileMat = ctx.burnt ? "BrickWallSooty" : "RoofTile";
  const hw = f.w / 2, hd = f.d / 2;

  // --- 一圈 4.2 m 高墙：当铺的第一符号。民居院墙 2.0—2.5，这里翻一倍还多 ---
  const wallH = 4.2, wallT = 0.6;
  const gateOpen = 3.4;                       // 墙上留给门楼的口，门楼自己再收到净宽 1.6
  AddYardWall(sink, f, ry, {
    height: wallH, thickness: wallT, material: wallMat, ruin: ctx.damage * 0.55,
    plinth: "Stone", cope: true, openW: gateOpen, seed: `${seed}:hi`,
  });

  // 墙头碎瓷：临街一面与两山靠街的一段插满碎瓷片。远看是压顶上一条毛边，近看才知道是防爬的。
  // 尺寸必须**小而密**（0.09×0.18×0.34 / 0.5 m 一片）：第一版做成 0.13×0.24 / 0.75 m 一片，
  // 十几米外直接读成城墙垛口 —— 当铺墙上长出一排雉堞，那是完全另一种建筑。
  if (ctx.damage < 0.4) {
    for (let i = 0; ; i += 1) {
      const lx = -hw + 0.4 + i * 0.5;
      if (lx > hw - 0.4) break;
      if (Math.abs(lx) < gateOpen / 2 + 0.4) continue;
      const p = S.At(lx, hd);
      sink.Add("Stone", PlaceGeometry(
        MakeBox(0.09, 0.17 + rnd() * 0.07, 0.34, TILE_METERS.stone, `${seed}:shard${i}`),
        { x: p.x, y: wallH + 0.16, z: p.z, ry, rz: (rnd() - 0.5) * 0.9 }));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 17; i += 1) {
        const p = S.At(side * hw, hd - 0.5 - i * 0.5);
        sink.Add("Stone", PlaceGeometry(
          MakeBox(0.34, 0.17 + rnd() * 0.07, 0.09, TILE_METERS.stone, `${seed}:shard${side}${i}`),
          { x: p.x, y: wallH + 0.16, z: p.z, ry, rx: (rnd() - 0.5) * 0.9 }));
      }
    }
  }

  // --- 门楼：比墙还高一档（4.9 m），门洞净宽只有 1.6 ---
  const gateH = 4.9, openW = 1.6, openH = 2.3;
  for (const side of [-1, 1]) {
    const p = S.At(side * 1.25, hd);
    Slab(sink, wallMat, p, gateH / 2, 0.9, gateH, 1.3, ry, `${seed}:gp${side}`);
    SolidSlab(sink, p, gateH / 2, 0.45, gateH / 2, 0.65, ry);
    const dun = S.At(side * 1.42, hd + 0.2);
    Slab(sink, "Stone", dun, 0.3, 0.5, 0.6, 0.5, ry, `${seed}:dun${side}`, { tile: TILE_METERS.stone });
  }
  const gateAt = S.At(0, hd);
  Slab(sink, "WoodBeam", gateAt, openH + 0.16, 3.5, 0.32, 1.05, ry, `${seed}:glin`, { tile: TILE_METERS.wood });
  Slab(sink, wallMat, gateAt, (openH + 0.32 + gateH) / 2, 3.4, gateH - openH - 0.32, 1.05, ry, `${seed}:gup`);
  SolidSlab(sink, gateAt, (openH + gateH) / 2, 1.75, (gateH - openH) / 2, 0.55, ry);
  Slab(sink, "WoodDoor", S.At(0, hd + 0.58), 3.55, 2.0, 0.8, 0.12, ry, `${seed}:gsign`, { tile: TILE_METERS.wood });
  if (ctx.damage < 0.6) {
    for (const s of [-1, 1]) {
      Slab(sink, tileMat, S.At(0, hd + s * 0.3), gateH + 0.3, 4.6, 0.12, 1.05, ry,
        `${seed}:grf${s}`, { rx: -s * 0.46, tile: TILE_METERS.roof });
    }
    Slab(sink, tileMat, S.At(0, hd), gateH + 0.54, 4.75, 0.16, 0.26, ry,
      `${seed}:grdg`, { tile: TILE_METERS.roof });
  }
  AddDoorReveal(sink, {
    x: gateAt.x, z: gateAt.z, ry, openW, openH, depth: 2.8, seed: `${seed}:grv`,
  });
  if (ctx.damage < 0.7) {
    for (const s of [-1, 1]) {
      Slab(sink, "WoodDoor", S.At(s * 0.41, hd), openH / 2, 0.78, openH - 0.06, 0.09, ry,
        `${seed}:gd${s}`, { tile: TILE_METERS.wood });
    }
  }

  // --- 门口高杆布幌：门两侧各一根 7.2 m 木杆，各挑一面长幌。当铺在街上的招牌就是这两根杆子。
  // 幌面挂在挑杆的**内端而不是门轴线上**：第一版把一整幅 2.4 m 宽的幌吊在门正中，
  // 把门楼连瓦顶一起遮死了 —— 招牌盖住了它要标的那扇门。
  const flagLz = hd + 1.5;
  for (const side of [-1, 1]) {
    const p = S.At(side * 4.0, flagLz);
    Slab(sink, "WoodBeam", p, 3.6, 0.24, 7.2, 0.24, ry, `${seed}:pole${side}`, { tile: TILE_METERS.wood });
    Slab(sink, "Stone", p, 0.2, 0.62, 0.4, 0.62, ry, `${seed}:poleb${side}`, { tile: TILE_METERS.stone });
    SolidSlab(sink, p, 1.6, 0.16, 1.6, 0.16, ry, "prop");
    Slab(sink, "WoodBeam", S.At(side * 2.9, flagLz), 6.5, 2.2, 0.16, 0.16, ry,
      `${seed}:parm${side}`, { tile: TILE_METERS.wood });
    Slab(sink, "HouseholdCloth", S.At(side * 3.0, flagLz - 0.06), 4.62, 1.15, 3.6, 0.05, ry,
      `${seed}:banner${side}`, { tile: TILE_METERS.cloth });
  }

  // --- 影壁：门内 3.6 m，把门洞填满，从街上看进去是一片受光的砖面而不是纯黑 ---
  const screen = S.At(0, hd - 3.6);
  AddWall(sink, wallMat, {
    x: screen.x, z: screen.z, length: 3.6, height: 2.7, thickness: 0.36, ry,
    ruin: ctx.damage * 0.5, seed: `${seed}:screen`, plinth: "Stone", cope: true,
  });

  // --- 库楼：两层实心量体，极少开窗，只在檐下留一排气窗 ---
  const towerW = Math.max(9, Math.min(14, f.w * 0.42));
  const towerD = Math.max(7.5, Math.min(11, f.d * 0.34));
  const towerLz = -hd + towerD / 2 + 1.2;
  const towerEave = 6.5;
  const towerRidge = towerEave + (towerD / 2) * SLOPE275;
  const towerRuin = ctx.damage * 0.3;                       // 库楼比民居结实：同样的战损，塌得少
  const tFront = towerLz + towerD / 2;
  const tBack = towerLz - towerD / 2;
  const doorW = 1.4, doorH = 2.25;

  for (const side of [-1, 1]) {
    const p = S.At(side * towerW / 2, towerLz);
    AddWall(sink, wallMat, {
      x: p.x, z: p.z, length: towerD, height: towerEave, thickness: 0.7, ry: ry + Math.PI / 2,
      ruin: towerRuin, seed: `${seed}:tw${side}`, plinth: "Stone",
    });
  }
  const tb = S.At(0, tBack);
  AddWall(sink, wallMat, {
    x: tb.x, z: tb.z, length: towerW + 0.7, height: towerEave, thickness: 0.7, ry,
    ruin: towerRuin, seed: `${seed}:twn`, plinth: "Stone",
  });
  const doorSeg = (towerW - doorW) / 2;
  for (const side of [-1, 1]) {
    const p = S.At(side * (doorW / 2 + doorSeg / 2), tFront);
    AddWall(sink, wallMat, {
      x: p.x, z: p.z, length: doorSeg, height: towerEave, thickness: 0.7, ry,
      ruin: towerRuin, seed: `${seed}:twf${side}`, plinth: "Stone",
    });
  }
  const tDoor = S.At(0, tFront);
  Slab(sink, wallMat, tDoor, (doorH + 0.35 + towerEave) / 2, doorW, towerEave - doorH - 0.35, 0.7, ry,
    `${seed}:tdup`);
  SolidSlab(sink, tDoor, (doorH + towerEave) / 2, doorW / 2, (towerEave - doorH) / 2, 0.35, ry);
  // 石门框：当铺库房的门口一定是条石的，砖口太容易撬
  for (const side of [-1, 1]) {
    Slab(sink, "Stone", S.At(side * (doorW / 2 + 0.17), tFront + 0.06), doorH / 2, 0.34, doorH, 0.82, ry,
      `${seed}:tjamb${side}`, { tile: TILE_METERS.stone });
  }
  Slab(sink, "Stone", S.At(0, tFront + 0.06), doorH + 0.17, doorW + 0.68, 0.34, 0.82, ry,
    `${seed}:tlin`, { tile: TILE_METERS.stone });
  AddDoorReveal(sink, {
    x: tDoor.x, z: tDoor.z, ry, openW: doorW, openH: doorH, depth: 2.0, seed: `${seed}:trv`, jamb: false,
  });
  if (ctx.damage < 0.7) {
    for (const s of [-1, 1]) {
      Slab(sink, "WoodDoor", S.At(s * 0.35, tFront), doorH / 2, 0.68, doorH - 0.05, 0.1, ry,
        `${seed}:td${s}`, { tile: TILE_METERS.wood });
    }
  }
  // 气窗：檐下 1.2 m 处一排小方口，石框铁栅。整栋楼就这么几个洞
  const ventY = towerEave - 1.2;
  for (const side of [-1, 1]) {
    for (const zo of [-2.4, 2.4]) {
      const p = S.At(side * (towerW / 2), towerLz + zo);
      Slab(sink, "Stone", p, ventY, 0.88, 0.62, 0.5, ry, `${seed}:v${side}${zo}`, { tile: TILE_METERS.stone });
      for (let m = -1; m <= 1; m += 1) {
        Slab(sink, "WoodBeam", p, ventY + m * 0.18, 0.92, 0.05, 0.42, ry,
          `${seed}:vb${side}${zo}${m}`, { tile: TILE_METERS.steel });
      }
    }
  }
  for (const xo of [-3.2, 3.2]) {
    const p = S.At(xo, tBack);
    Slab(sink, "Stone", p, ventY, 0.5, 0.62, 0.88, ry, `${seed}:vn${xo}`, { tile: TILE_METERS.stone });
    for (let m = -1; m <= 1; m += 1) {
      Slab(sink, "WoodBeam", p, ventY + m * 0.18, 0.42, 0.05, 0.92, ry,
        `${seed}:vnb${xo}${m}`, { tile: TILE_METERS.steel });
    }
  }
  const tRoof = S.At(0, towerLz);
  AddHardMountainRoof(sink, {
    x: tRoof.x, z: tRoof.z, width: towerW, depth: towerD, eaveY: towerEave, ridgeY: towerRidge,
    ry, seed: `${seed}:troof`, ruined: ctx.damage > 0.62, burnt: ctx.burnt,
  });

  // --- 账房：西侧一列，比库楼矮一大截，衬出库楼的高 ---
  const acctX = 5.8, acctZ = 10.0, acctEave = 2.8;
  Room(host, f, ry, -(hw - acctX / 2 - 0.9), 1.5, {
    ry: ry - Math.PI / 2, width: acctZ, depth: acctX, eaveY: acctEave,
    ridgeY: acctEave + (acctX / 2) * SLOPE27, seed: `${seed}:acct`,
    damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 3,
  });

  // 当铺的院子是空的：能搬的都锁进库楼了，只留被反复踩实的地面
  const wear = S.At(1.5, 4.0);
  AddYardWear(sink, { x: wear.x, z: wear.z, ry, baseY: 0, seed: `${seed}:wear`, radius: 4.2 });
}

// ---------------------------------------------------------------------------
// 办事处 —— 门房 + 影壁 + 办公正房，比师部朴素一档
// ---------------------------------------------------------------------------

export function BuildOffice(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry;
  const S = SiteFrame(f, ry);
  const seed = `map:${f.id}`;
  const wallMat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const tileMat = ctx.burnt ? "BrickWallSooty" : "RoofTile";
  const hw = f.w / 2, hd = f.d / 2;

  // --- 院墙 + 门楼。机关院墙比民居略高一档（2.5），但不到当铺那种防盗高度 ---
  AddYardWall(sink, f, ry, {
    height: 2.5, thickness: 0.42, material: wallMat, ruin: ctx.damage * 0.8,
    plinth: "Stone", cope: true, openW: 2.0, seed: `${seed}:yard`,
  });
  const gateAt = S.At(0, hd);
  AddGatehouse(sink, {
    x: gateAt.x, z: gateAt.z, ry, seed: `${seed}:gh`,
    damage: ctx.damage, burnt: ctx.burnt, openW: 2.0,
  });

  // --- 影壁：机关院的影壁比民居的大一号，带石座与瓦帽 ---
  const screen = S.At(0, hd - 4.6);
  Slab(sink, "Stone", screen, 0.21, 5.6, 0.42, 0.9, ry, `${seed}:scbase`, { tile: TILE_METERS.stone });
  AddWall(sink, wallMat, {
    x: screen.x, z: screen.z, length: 5.0, height: 2.8, thickness: 0.42, ry,
    ruin: ctx.damage * 0.5, seed: `${seed}:screen`, plinth: null, cope: false,
  });
  if (ctx.damage < 0.5) {
    for (const s of [-1, 1]) {
      Slab(sink, tileMat, S.At(0, hd - 4.6 + s * 0.26), 2.92, 5.6, 0.11, 0.8, ry,
        `${seed}:sccap${s}`, { rx: -s * 0.5, tile: TILE_METERS.roof });
    }
    Slab(sink, tileMat, screen, 3.06, 5.7, 0.15, 0.24, ry, `${seed}:scrdg`, { tile: TILE_METERS.roof });
  }

  // --- 门房：门内东侧一间，值班用。机关院与民居院最直接的区别之一 ---
  const lodgeD = 4.8, lodgeEave = 2.75;
  Room(host, f, ry, hw * 0.34, hd - lodgeD / 2 - 0.7, {
    width: 7.4, depth: lodgeD, eaveY: lodgeEave, ridgeY: lodgeEave + (lodgeD / 2) * SLOPE27,
    seed: `${seed}:lodge`, damage: ctx.damage, burnt: ctx.burnt, facing: -1, bays: 3,
  });

  // --- 办公正房：一长条七开间，坐在一层薄台明上。比师部矮一档、不设二进 ---
  const hallW = Math.min(f.w * 0.54, 27);
  const hallD = Math.max(7.0, Math.min(9.0, f.d * 0.2));
  const hallLz = -hd + hallD / 2 + 1.0;
  const hallEave = 3.45;
  Slab(sink, "Stone", S.At(0, hallLz), 0.18, hallW + 2.0, 0.36, hallD + 2.0, ry,
    `${seed}:terrace`, { tile: TILE_METERS.stone });
  for (let i = 0; i < 2; i += 1) {
    Slab(sink, "Stone", S.At(0, hallLz + hallD / 2 + 1.1 + i * 0.42), 0.24 - i * 0.12, 5.0, 0.24 - i * 0.12, 0.42, ry,
      `${seed}:step${i}`, { tile: TILE_METERS.stone });
  }
  Room(host, f, ry, 0, hallLz, {
    width: hallW, depth: hallD, eaveY: hallEave, ridgeY: hallEave + (hallD / 2) * SLOPE275,
    seed: `${seed}:hall`, damage: ctx.damage, burnt: ctx.burnt, facing: 1, bays: 7, roofRafters: true,
  });

  // --- 两列办公厢房 ---
  const wingX = 6.2, wingZ = 15.0, wingEave = 2.9;
  for (const side of [-1, 1]) {
    Room(host, f, ry, side * (hw - wingX / 2 - 0.9), -1.5, {
      ry: ry + Math.PI / 2 * side, width: wingZ, depth: wingX, eaveY: wingEave,
      ridgeY: wingEave + (wingX / 2) * SLOPE27, seed: `${seed}:wing${side}`,
      damage: ctx.damage, burnt: ctx.burnt, facing: side, bays: 5,
    });
  }

  // --- 旗杆：院心轴线上的一根杆。俯瞰里这是"机关"和"大户人家"唯一的分别 ---
  const pole = S.At(0, 5.0);
  Slab(sink, "Stone", pole, 0.18, 1.1, 0.36, 1.1, ry, `${seed}:polebase`, { tile: TILE_METERS.stone });
  Slab(sink, "WoodBeam", pole, 4.2, 0.2, 8.0, 0.2, ry, `${seed}:pole`, { tile: TILE_METERS.wood });
  SolidSlab(sink, pole, 1.6, 0.2, 1.6, 0.2, ry, "prop");

  // --- 门外公告牌 ---
  const board = S.At(5.2, hd + 1.5);
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", S.At(5.2 + s * 1.3, hd + 1.5), 1.15, 0.14, 2.3, 0.14, ry,
      `${seed}:bp${s}`, { tile: TILE_METERS.wood });
  }
  Slab(sink, "WoodDoor", board, 1.78, 2.9, 1.35, 0.1, ry, `${seed}:board`, { tile: TILE_METERS.wood });
  SolidSlab(sink, board, 1.15, 1.5, 1.15, 0.12, ry, "prop");

  const life = S.At(-hw * 0.4, 6.0);
  AddCourtyardLife(sink, {
    x: life.x, z: life.z, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, f.w * 0.34), depth: Math.max(4.5, f.d * 0.26), damage: ctx.damage,
  });
  const wear = S.At(0, hd - 8.0);
  AddYardWear(sink, { x: wear.x, z: wear.z, ry, baseY: 0, seed: `${seed}:wear`, radius: 4.0 });
}
