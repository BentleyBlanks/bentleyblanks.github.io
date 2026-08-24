// 县公署（旧县衙，城内唯一有实物参照的建筑）。工作包 A3 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// 形制依据（docs/Data_TengxianCity.md §4.2，明万历《滕县志》转引）：
//   「正堂五间，堂后为琴堂；堂左幕厅、右銮驾库甲杖库；幕厅后、堂前为戒石亭；
//     东西两列六房、马科、承发司、架阁库等共三十间；前为仪门，再前为大门，门上有谯楼。」
// 大堂本体照**现存的旧县衙大堂**（明代原物、2006 年山东省级文保）做：
//   五开间、抬高的砖石台基 + 月台、前檐一排柱子、明间敞开、硬山布瓦顶。
//   **2007 年后复建的仪门 / 谯楼门 / 善国门是仿古新建，细部一律不照抄** ——
//   本文件里的仪门与谯楼只做「志书记有此物」的体量与开口，不做任何复建件的花活。
//
// 与旧 AddYamen 的关系：整套几何在本文件里重写，不再调 Script_World.AddYamen。
//   旧版有三处硬伤：① 它的局部原点是**大门**，而 LANDMARKS.Yamen 现在给的是**院子中心**
//   （w/d 被 BlockerRects / zone 守卫按矩形中心解释），照旧版摆会整院向北溢出一倍院深；
//   ② 所有殿宇 facing:1 = 门开在**背面**（AddRoomBlock 的局部 +z 在 ry=0 时指北），
//   院里看见的全是后墙；③ 大门/仪门用 AddRoomBlock 做 = 四面围死的盒子，
//   轴线根本走不通，而 Data_Battle 的 Yamen zone 就锚在这个院子中心。
//
// 玩法约束：大门 → 仪门 → 月台踏跺 → 大堂明间是一条连续可走的轴线；
//   仪门两侧另开东西角门，东院墙前院段再开一道侧门，巷战有三个进院口。
//
// 材质预算：BrickWall / Stone / RoofTile / WoodBeam / WoodDoor / PaintRed 六种
//   （burnt 档才会把砖换成 BrickWallSooty，本地标的 damage=0.22 落不到那一档）。

import {
  AddWall, AddRoomBlock, AddHardMountainRoof, AddDoorReveal,
} from "./Script_World.mjs";
import {
  MakeBox, PlaceGeometry, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Clamp } from "./Script_Noise.mjs";

/** 硬山坡度 27.5°（docs/Data_HistoryMaterial.md：26°—29°）。 */
const ROOF_SLOPE = 0.52;

export function BuildYamen(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const damage = Clamp(ctx.damage ?? 0.22, 0, 1);
  const burnt = !!ctx.burnt;
  const seed = `map:${f.id || "Yamen"}`;
  const brick = burnt ? "BrickWallSooty" : "BrickWall";
  const w = Math.max(30, f.w || 62);
  const d = Math.max(30, f.d || 54);
  const halfW = w / 2;
  const halfD = d / 2;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);

  // 局部坐标：+x 东、+z 北（往院里）。s = 自南院墙沿轴线往北的距离（0 = 南院墙，d = 北院墙）。
  const L = (lx, lz) => ({ x: f.x + cos * lx - sin * lz, z: f.z - sin * lx - cos * lz });
  const A = (lx, s) => L(lx, -halfD + s);

  /** 一只按局部坐标摆的盒子；tag 非空才登记碰撞。 */
  const Box = (mat, key, lx, s, y, bw, bh, bd, opt = {}) => {
    const { rot = 0, rx = 0, tile = TILE_METERS.brick, grid = null, tag = null } = opt;
    const p = A(lx, s);
    sink.Add(mat, PlaceGeometry(
      MakeBox(bw, bh, bd, tile, `${seed}:${key}`, grid),
      { x: p.x, y, z: p.z, ry: ry + rot, rx }));
    if (tag) sink.Solid(p.x, y, p.z, bw / 2, bh / 2, bd / 2, tag, ry + rot);
  };

  /** 一段院墙 / 隔墙（局部 x 区间 [lx0, lx1]，走向沿 x）。 */
  const WallRun = (key, lx0, lx1, s, height, { thickness = 0.5, cope = false, rot = 0 } = {}) => {
    const length = lx1 - lx0;
    if (length < 0.5) return;
    const p = A((lx0 + lx1) / 2, s);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length, height, thickness, ry: ry + rot,
      ruin: damage * 0.5, seed: `${seed}:${key}`, plinth: "Stone", cope,
      tile: TILE_METERS.brick,
    });
  };

  // ---------------------------------------------------------------------
  // 尺寸表：一律由 f.w / f.d 推出来，数据改了这一套还站得住。
  // ---------------------------------------------------------------------
  const wallH = 3.2;                                   // 官署院墙比民居（2.0—2.5）高一档
  const gateW = Clamp(w * 0.21, 11, 15);
  const gateD = Clamp(d * 0.12, 5.5, 8);
  const gateOpen = 4.0;
  const yiW = Clamp(w * 0.18, 9, 13);
  const yiD = Clamp(d * 0.085, 4, 5.5);
  const yiOpen = 3.4;
  const cornerOpen = 1.5;                              // 仪门两侧的东西角门
  const wingLen = Clamp(d * 0.24, 9, 15);              // 六房廊庑沿轴线的长度
  const wingD = 5.2;
  const platW = Clamp(w * 0.39, 20, 26);               // 大堂台基
  const platD = Clamp(d * 0.24, 10.5, 14);
  const platH = 1.0;
  const hallW = Clamp(w * 0.33, 16, 22);               // 正堂五间
  const hallD = platD - 3.0;                           // 台基前留 3 m 月台
  const hallWallH = 4.8;                               // 台基面 → 檐口
  const backW = Clamp(w * 0.25, 12, 17);               // 二堂（志称琴堂）
  const backD = Clamp(d * 0.11, 4.5, 6);
  const screenW = Clamp(w * 0.14, 7, 10);              // 照壁

  const sGate = gateD / 2;
  const sYi = d * 0.285;
  const sJie = d * 0.40;                               // 戒石亭
  const sWing = d * 0.46;
  const sPlat0 = d * 0.575;                            // 台基南沿
  const sPlat = sPlat0 + platD / 2;
  const sHall = sPlat0 + 3.0 + hallD / 2;
  const sBack = d - backD / 2 - 0.5;
  const sSideGate = (gateD + sYi) / 2;                 // 东院墙前院段的侧门

  // ---------------------------------------------------------------------
  // 院墙一圈：南墙被大门断开，东墙前院段开一道侧门
  // ---------------------------------------------------------------------
  WallRun("wS-", -halfW, -gateW / 2, 0, wallH, { cope: true });
  WallRun("wS+", gateW / 2, halfW, 0, wallH, { cope: true });
  WallRun("wN", -halfW, halfW, d, wallH);
  // 东西墙：沿 z 走，rot=+90° 让墙长对上 d
  {
    const pW = A(-halfW, d / 2);
    AddWall(sink, brick, {
      x: pW.x, z: pW.z, length: d, height: wallH, thickness: 0.5,
      ry: ry + Math.PI / 2, ruin: damage * 0.5, seed: `${seed}:wW`, plinth: "Stone",
    });
    const segS = sSideGate - 1.0;                      // 侧门净宽 2.0 m
    const segN = sSideGate + 1.0;
    for (const [key, s0, s1] of [["wE0", 0, segS], ["wE1", segN, d]]) {
      const p = A(halfW, (s0 + s1) / 2);
      AddWall(sink, brick, {
        x: p.x, z: p.z, length: s1 - s0, height: wallH, thickness: 0.5,
        ry: ry + Math.PI / 2, ruin: damage * 0.5, seed: `${seed}:${key}`, plinth: "Stone",
      });
    }
    // 侧门：过梁 + 门上一段墙（不登记碰撞，洞口留着走人）
    Box("WoodBeam", "sideLintel", halfW, sSideGate, 2.28, 0.55, 0.26, 2.6,
      { tile: TILE_METERS.wood });
    Box(brick, "sideUpper", halfW, sSideGate, 2.41 + (wallH - 2.41) / 2,
      0.5, wallH - 2.41, 2.0, { grid: BRICK_UV_GRID });
    const sideDoor = A(halfW, sSideGate);
    AddDoorReveal(sink, {
      x: sideDoor.x, z: sideDoor.z, ry: ry - Math.PI / 2,
      openW: 2.0, openH: 2.15, depth: 1.6, seed: `${seed}:sideRv`,
    });
  }

  // ---------------------------------------------------------------------
  // 照壁：大门之外的一堵独立砖墙。县衙照壁本在街对面，这里被地块进深压到
  // 门前 3.3 m —— 街对面是民居网格（BlockerRects 只让出 4 m），只能往里收。
  // ---------------------------------------------------------------------
  {
    const p = A(0, -3.3);
    AddWall(sink, brick, {
      x: p.x, z: p.z, length: screenW, height: 3.4, thickness: 0.5, ry,
      ruin: damage * 0.4, seed: `${seed}:screen`, plinth: "Stone", cope: true,
    });
  }
  // 上马石一对：门前唯一的官气小件
  for (const s2 of [-1, 1]) {
    Box("Stone", `mount${s2}`, s2 * (gateW / 2 + 1.4), -1.1, 0.5, 0.8, 1.0, 0.7,
      { tile: TILE_METERS.stone, tag: "prop" });
  }

  // ---------------------------------------------------------------------
  // 大门（门上有谯楼）。两座砖墩夹一个 4 m 门洞 —— 轴线从这里进院。
  // 谯楼只做两层体量 + 腰檐，形制细部无实据（复建的谯楼门不能照抄）。
  // ---------------------------------------------------------------------
  {
    const pierLen = (gateW - gateOpen) / 2;
    const gateEave = 4.2;
    for (const s2 of [-1, 1]) {
      Box(brick, `gatePier${s2}`, s2 * (gateOpen / 2 + pierLen / 2), sGate, gateEave / 2,
        pierLen, gateEave, gateD, { grid: BRICK_UV_GRID, tag: "wall" });
    }
    const doorH = 3.0;
    Box("WoodBeam", "gateLintel", 0, sGate, doorH + 0.19, gateOpen + 1.0, 0.38, gateD * 0.8,
      { tile: TILE_METERS.wood });
    Box(brick, "gateUpper", 0, sGate, doorH + 0.38 + (gateEave - doorH - 0.38) / 2,
      gateOpen + 0.7, gateEave - doorH - 0.38, gateD * 0.8, { grid: BRICK_UV_GRID });
    // 门匾（褪色朱漆）：街上认出这是县公署的唯一一件字牌
    Box("PaintRed", "gatePlaque", 0, -0.12, 3.72, 2.9, 0.9, 0.14, { tile: TILE_METERS.wood });
    const gateMouth = A(0, 0);
    AddDoorReveal(sink, {
      x: gateMouth.x, z: gateMouth.z, ry: ry + Math.PI,
      openW: gateOpen, openH: doorH, depth: gateD, seed: `${seed}:gateRv`,
    });
    for (const s2 of [-1, 1]) {                        // 门墩石
      Box("Stone", `gateDun${s2}`, s2 * (gateOpen / 2 + 0.3), 0.15, 0.33,
        0.56, 0.66, 0.56, { tile: TILE_METERS.stone });
    }
    if (damage < 0.7) {                                // 两扇大门朝里敞着，贴在门道两壁
      for (const s2 of [-1, 1]) {
        Box("WoodDoor", `gateLeaf${s2}`, s2 * (gateOpen / 2 - 0.12), gateD * 0.42, doorH / 2,
          gateD * 0.62, doorH - 0.1, 0.1, { rot: Math.PI / 2, tile: TILE_METERS.wood });
      }
    }
    const gateCenter = A(0, sGate);
    AddHardMountainRoof(sink, {                        // 腰檐
      x: gateCenter.x, z: gateCenter.z, width: gateW, depth: gateD,
      eaveY: gateEave, ridgeY: gateEave + 1.5, ry, seed: `${seed}:gateEave`, burnt,
      rafters: false,
    });
    // 谯楼：腰檐之上的一层小楼。比门身明显小一圈，才读作「门上有谯楼」而不是二层民房。
    const upperW = gateW - 4.0;
    const upperD = gateD - 2.6;
    const upperY0 = 5.1;
    Box(brick, "qiaoBody", 0, sGate, upperY0 + 1.15, upperW, 2.3, upperD, { grid: BRICK_UV_GRID });
    for (const s2 of [-1, 1]) {                        // 两扇板窗
      Box("WoodDoor", `qiaoWin${s2}`, s2 * 1.9, sGate - upperD / 2 - 0.05, upperY0 + 1.15,
        1.1, 0.95, 0.1, { tile: TILE_METERS.wood });
    }
    AddHardMountainRoof(sink, {
      x: gateCenter.x, z: gateCenter.z, width: gateW - 3.0, depth: gateD - 2.0,
      eaveY: upperY0 + 2.3, ridgeY: upperY0 + 3.5, ry, seed: `${seed}:qiaoRoof`,
      burnt, rafters: false,
    });
  }

  // ---------------------------------------------------------------------
  // 仪门 + 东西角门：一道横墙把前院和大堂院分开
  // ---------------------------------------------------------------------
  {
    const yiEave = 3.6;
    const cornerX = Math.min(halfW - 3.0, yiW / 2 + 4.0);
    const edges = [
      [-halfW, -cornerX - cornerOpen / 2],
      [-cornerX + cornerOpen / 2, -yiW / 2],
      [yiW / 2, cornerX - cornerOpen / 2],
      [cornerX + cornerOpen / 2, halfW],
    ];
    edges.forEach(([a, b], i) => WallRun(`yiWall${i}`, a, b, sYi, 3.0, { thickness: 0.45 }));
    for (const s2 of [-1, 1]) {                        // 角门过梁 + 门上墙
      Box("WoodBeam", `cornerLintel${s2}`, s2 * cornerX, sYi, 2.28,
        cornerOpen + 0.6, 0.24, 0.6, { tile: TILE_METERS.wood });
      Box(brick, `cornerUpper${s2}`, s2 * cornerX, sYi, 2.4 + (3.0 - 2.4) / 2,
        cornerOpen + 0.4, 3.0 - 2.4, 0.45, { grid: BRICK_UV_GRID });
      const cd = A(s2 * cornerX, sYi);
      AddDoorReveal(sink, {
        x: cd.x, z: cd.z, ry: ry + Math.PI, openW: cornerOpen, openH: 2.15,
        depth: 1.2, seed: `${seed}:cornerRv${s2}`,
      });
    }
    // 仪门本体：两墩夹一个 3.4 m 门洞
    const yiPier = (yiW - yiOpen) / 2;
    for (const s2 of [-1, 1]) {
      Box(brick, `yiPier${s2}`, s2 * (yiOpen / 2 + yiPier / 2), sYi, yiEave / 2,
        yiPier, yiEave, yiD, { grid: BRICK_UV_GRID, tag: "wall" });
    }
    Box("WoodBeam", "yiLintel", 0, sYi, 2.72, yiOpen + 0.9, 0.32, yiD * 0.8,
      { tile: TILE_METERS.wood });
    Box(brick, "yiUpper", 0, sYi, 2.88 + (yiEave - 2.88) / 2, yiOpen + 0.6,
      yiEave - 2.88, yiD * 0.8, { grid: BRICK_UV_GRID });
    const yiMouth = A(0, sYi - yiD / 2);
    AddDoorReveal(sink, {
      x: yiMouth.x, z: yiMouth.z, ry: ry + Math.PI,
      openW: yiOpen, openH: 2.56, depth: yiD, seed: `${seed}:yiRv`,
    });
    const yiCenter = A(0, sYi);
    AddHardMountainRoof(sink, {
      x: yiCenter.x, z: yiCenter.z, width: yiW, depth: yiD,
      eaveY: yiEave, ridgeY: yiEave + (yiD / 2) * ROOF_SLOPE, ry,
      seed: `${seed}:yiRoof`, burnt, rafters: false,
    });
  }

  // ---------------------------------------------------------------------
  // 东西六房廊庑：仪门与大堂之间的两列廊房（志称东西两列共三十间）
  // ---------------------------------------------------------------------
  for (const s2 of [-1, 1]) {
    const p = A(s2 * (halfW - 3.4), sWing);
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry: ry + s2 * Math.PI / 2,        // 局部 +z 朝院心，门窗开在朝院一面
      width: wingLen, depth: wingD,
      eaveY: 2.9, ridgeY: 2.9 + (wingD / 2) * ROOF_SLOPE,
      seed: `${seed}:liufang${s2}`, damage: Clamp(damage + 0.06, 0, 1), burnt,
      facing: 1, bays: 4, roofRafters: false,
    });
  }

  // ---------------------------------------------------------------------
  // 戒石亭：大堂之前的一座四柱小亭，中间立「尔俸尔禄，民膏民脂」的戒石
  // ---------------------------------------------------------------------
  {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        Box("WoodBeam", `jieCol${sx}${sz}`, sx * 1.75, sJie + sz * 1.75, 1.35,
          0.24, 2.7, 0.24, { tile: TILE_METERS.wood });
      }
    }
    Box("Stone", "jieStele", 0, sJie, 0.95, 1.15, 1.9, 0.32,
      { tile: TILE_METERS.stone, tag: "prop" });
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2;
      // 檐口朝外落：偏移方向必须是几何 +z 的反方向，否则四面里有两面朝天翻
      Box("RoofTile", `jieRoof${k}`, -Math.sin(a) * 1.0, sJie + Math.cos(a) * 1.0, 3.15,
        4.4, 0.12, 2.4, { rot: a, rx: -0.55, tile: TILE_METERS.roof });
    }
  }

  // ---------------------------------------------------------------------
  // 甬路：仪门到月台的一条石墁中线。它同时是「这条轴线可以走」的视觉交代。
  // ---------------------------------------------------------------------
  {
    const s0 = gateD;
    const s1 = sPlat0 - 1.9;
    Box("Stone", "yonglu", 0, (s0 + s1) / 2, 0.04, 2.6, 0.1, s1 - s0,
      { tile: TILE_METERS.stone });
  }

  // ---------------------------------------------------------------------
  // 正堂五间（大堂）：抬高的台基 + 月台 + 前檐柱列 + 明间敞开。
  // 这一座照现存明代大堂做，是整院体量最大、屋面最完整的一栋。
  // ---------------------------------------------------------------------
  {
    Box("Stone", "hallPlat", 0, sPlat, platH / 2, platW, platH, platD,
      { tile: TILE_METERS.stone, tag: "villageFoundation" });
    // 踏跺两级：0.33 / 0.66 → 1.0，每级都在引擎 0.55 m 自动抬腿之内
    Box("Stone", "hallStep0", 0, sPlat0 - 1.35, 0.165, 7.0, 0.33, 0.9,
      { tile: TILE_METERS.stone, tag: "villageFoundation" });
    Box("Stone", "hallStep1", 0, sPlat0 - 0.45, 0.33, 7.0, 0.66, 0.9,
      { tile: TILE_METERS.stone, tag: "villageFoundation" });

    const eaveY = platH + hallWallH;
    const ridgeY = eaveY + (hallD / 2) * ROOF_SLOPE;
    const wallMidY = platH + hallWallH / 2;
    const frontS = sHall - hallD / 2 + 0.3;
    // 后墙与两山
    Box(brick, "hallBack", 0, sHall + hallD / 2 - 0.25, wallMidY, hallW, hallWallH, 0.5,
      { grid: BRICK_UV_GRID, tag: "wall" });
    for (const s2 of [-1, 1]) {
      Box(brick, `hallSide${s2}`, s2 * (hallW / 2 - 0.25), sHall, wallMidY,
        0.5, hallWallH, hallD, { grid: BRICK_UV_GRID, tag: "wall" });
    }
    // 前檐六柱五间：明间（中间一间）敞开，其余四间槛墙 + 隔扇
    const bayW = hallW / 5;
    for (let i = 0; i <= 5; i += 1) {
      Box("PaintRed", `hallCol${i}`, -hallW / 2 + i * bayW, frontS, wallMidY,
        0.42, hallWallH, 0.42, { tile: TILE_METERS.wood, tag: "prop" });
    }
    for (let b = 0; b < 5; b += 1) {
      if (b === 2) continue;                           // 明间是入口，留空
      const lx = -hallW / 2 + (b + 0.5) * bayW;
      Box(brick, `hallSill${b}`, lx, frontS, platH + 0.45, bayW - 0.5, 0.9, 0.34,
        { grid: BRICK_UV_GRID, tag: "wall" });
      Box("WoodDoor", `hallLattice${b}`, lx, frontS, platH + 0.9 + 1.35,
        bayW - 0.5, 2.7, 0.1, { tile: TILE_METERS.wood });
    }
    Box("PaintRed", "hallArchitrave", 0, frontS, eaveY - 0.42, hallW, 0.5, 0.44,
      { tile: TILE_METERS.wood });
    Box("PaintRed", "hallPlaque", 0, frontS - 0.3, eaveY - 1.35, 3.0, 1.0, 0.14,
      { tile: TILE_METERS.wood });

    const hallCenter = A(0, sHall);
    AddHardMountainRoof(sink, {
      x: hallCenter.x, z: hallCenter.z, width: hallW, depth: hallD,
      eaveY, ridgeY, ry, seed: `${seed}:hallRoof`, burnt,
    });
    // AI 掩体：月台沿与前檐柱后各留一处
    const coverP = A(0, sPlat0 + 0.4);
    sink.Cover(coverP.x, coverP.z, platH, sin, cos);
  }

  // ---------------------------------------------------------------------
  // 二堂（志称琴堂，元代弦歌堂）：大堂之后的一进
  // ---------------------------------------------------------------------
  {
    const p = A(0, sBack);
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry, width: backW, depth: backD,
      eaveY: 3.9, ridgeY: 3.9 + (backD / 2) * ROOF_SLOPE,
      seed: `${seed}:erdang`, damage, burnt, facing: -1, bays: 3, roofRafters: false,
    });
  }

  // ---------------------------------------------------------------------
  // 堂左幕厅；堂右銮驾库、甲杖库（面南时左为东）
  // ---------------------------------------------------------------------
  {
    const flankX = halfW - 10;
    const pMu = A(flankX, d * 0.70);
    AddRoomBlock(sink, {
      x: pMu.x, z: pMu.z, ry: ry + Math.PI / 2, width: 12, depth: 6.0,
      eaveY: 3.2, ridgeY: 3.2 + 3.0 * ROOF_SLOPE,
      seed: `${seed}:muting`, damage: Clamp(damage + 0.04, 0, 1), burnt,
      facing: 1, bays: 3, roofRafters: false,
    });
    for (const [k, s] of [[0, d * 0.648], [1, d * 0.805]]) {
      const p = A(-flankX, s);
      AddRoomBlock(sink, {
        x: p.x, z: p.z, ry: ry - Math.PI / 2, width: 7.5, depth: 6.0,
        eaveY: 3.1, ridgeY: 3.1 + 3.0 * ROOF_SLOPE,
        seed: `${seed}:ku${k}`, damage: Clamp(damage + 0.04, 0, 1), burnt,
        facing: 1, bays: 2, roofRafters: false,
      });
    }
  }

  void host.OnStreet;
}
