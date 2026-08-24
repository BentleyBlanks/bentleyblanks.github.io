// 庙宇套件：龙王庙 / 火神庙（temple）+ 文庙（confucianTemple）。工作包 A6 专属文件。
// 契约见 Script_LandmarkRegistry.mjs 头注。
//
// 为什么值得为三座庙单独做一套 kit：
// 城里有三个地名直接来自庙 ——「龙王庙街」「火神庙东街」「文庙」。图上只有一个方框，
// 而玩家在街上找路靠的是**看得见的东西**。如果这三处只是「院墙 + 抬高半档的民居正房」
// （旧白盒桩就是这样），那三个地名在场景里等于不存在：俯瞰是一样的灰瓦方格，
// 街上是一样的连续实墙。庙之所以在县城里是路标，靠的是四条与民居互斥的形制差别：
//   ① 中轴对称、院心空着 —— 民居院心堆满柴垛磨盘水缸，庙院是一条石甬路直通大殿；
//   ② 台基 —— 殿抬在石台上，檐口比民居高一档，屋脊再高一档；
//   ③ 筒瓦 + 起翘的正脊 + 两端鸱吻 —— 民居是小青瓦硬山，脊是平的一条；
//   ④ 红柱红枋 —— 全城唯一成片的高饱和色（褪色蒙尘版），眼睛必然先落在它上面。
// 这四条都做进去了，所以这一套的三角面主要花在「脊」和「檐」上，不花在内部。
//
// 三庙同族不同规格：
//   龙王庙 42×30 / 火神庙 34×26 —— 街庙一档：山门 + 前殿 + 大殿，单檐，脊高约 6.4 m；
//   文庙   40×34            —— 高一档：棂星门（牌坊门）+ 大成门 + 重檐大成殿，
//                              脊高约 10 m，是城西北这一片唯一压过民居两倍高的屋顶。
//
// 局部坐标系：本文件统一用 **PlaceGeometry(ry) 的那一套** ——
//   局部 +x → 世界 (cos ry, −sin ry)，局部 +z → 世界 (sin ry, cos ry)。
//   ry=0 时局部 +z = 世界 +z = 南，于是「山门开在 +z 面」就等于坐北朝南，
//   三座庙的山门也就正好冲着龙王庙街 / 火神庙东街（都在各自院子的南边）。
//   注意这与 AddCompound / AddRoomBlock 的内部局部系差 180°（那边局部 +z 指北），
//   所以本文件不复用它们的房屋构件，前檐面自己排。
//
// 形制尺寸全为 PRESUMED（见交付报告）：滕县城内这三座庙 1938 年的形制无任何图纸或
// 照片资料，只有街名与「城内有庙」的记载。这里按 docs/Data_HistoryMaterial.md 的
// 鲁南民间木构尺寸段（开间 3.0—3.6 m、进深 4.5—6 m、檐口 2.4—2.8 m）往上放一档，
// 不照抄任何现存复建物的细部。

import { AddWall, AddDoorReveal, AddCypress, AddPaifang } from "./Script_World.mjs";
import { MakeBox, MergeGeometries, PlaceGeometry, TILE_METERS } from "./Script_Geo.mjs";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";

const WALL_TILE = TILE_METERS.brick;
/** 庙墙 2.7 m：比民居院墙（2.0—2.5）高一档 —— 庙院对街封闭得更死。PRESUMED。 */
const YARD_WALL_H = 2.7;
/** 文庙墙 3.0 m：县学一级的围墙再高一档。PRESUMED。 */
const CONFUCIAN_WALL_H = 3.0;

/** 与 PlaceGeometry(ry) 同一套局部系的落位函数。 */
function MakeFrame(f, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => [f.x + cos * lx + sin * lz, f.z - sin * lx + cos * lz];
}

/** 一块方料。size = [w,h,d]，pose 直接透给 PlaceGeometry。 */
function Put(sink, material, size, tile, seed, pose) {
  sink.Add(material, PlaceGeometry(MakeBox(size[0], size[1], size[2], tile, seed), pose));
}

/** 奇数开间：面阔按 3.0—3.6 m 一间分，取最近的奇数（庙宇明间必须在中轴上）。 */
function BayCount(width) {
  let n = Math.round(width / 3.35);
  if (n % 2 === 0) n += 1;
  return Clamp(n, 3, 9);
}

// ---------------------------------------------------------------------------
// 屋面
// ---------------------------------------------------------------------------

/**
 * 庙宇硬山屋面：筒瓦两坡 + 正脊 + **两端起翘** + 鸱吻（几何近似，不建 tzm 件）+
 * 硬山山墙。与 AddHardMountainRoof 的差别就是「起翘 + 鸱吻 + 垂脊兽 + 筒瓦」这四笔
 * —— 民居屋脊是平直的一条，庙宇的脊两端翘起来，远处只看剪影也分得开。
 *
 * eaveY / ridgeY 都是**绝对高度**（已含台基）。
 */
function AddTempleRoof(sink, L, ry, o) {
  const {
    lx, lz, width, depth, eaveY, ridgeY, seed,
    overhang = 0.72, rafterStep = 0.8, wallMat = "TemplePlaster", tileMat = "TubeTile",
    beasts = false, ruined = false, burnt = false, gable = true,
  } = o;
  const mat = burnt ? "BrickWallSooty" : tileMat;
  const rise = Math.max(0.4, ridgeY - eaveY);
  const half = depth / 2;
  const slopeLen = Math.hypot(half, rise);
  const angle = Math.atan2(rise, half);

  if (!ruined) {
    for (const s of [-1, 1]) {
      const [sx, sz] = L(lx, lz + s * (half / 2));
      // 局部 +z 端在 rx>0 时下沉，所以 rx = s*angle 让两坡各自朝外倒
      Put(sink, mat, [width + overhang * 2, 0.14, slopeLen + overhang], TILE_METERS.roof,
        `${seed}:s${s}`, { x: sx, y: eaveY + rise / 2, z: sz, ry, rx: s * angle });
      const n = Math.max(4, Math.round(width / rafterStep));
      for (let i = 0; i < n; i += 1) {
        const [px, pz] = L(lx - width / 2 + (i + 0.5) * (width / n), lz + s * (half + 0.06));
        Put(sink, "WoodBeam", [0.09, 0.11, overhang * 1.2], TILE_METERS.wood,
          `${seed}:rf${s}${i}`, { x: px, y: eaveY - 0.09, z: pz, ry, rx: s * angle * 0.85 });
      }
    }
    // 正脊
    const [rx0, rz0] = L(lx, lz);
    Put(sink, mat, [width + overhang * 2, 0.26, 0.44], TILE_METERS.roof,
      `${seed}:ridge`, { x: rx0, y: ridgeY + 0.09, z: rz0, ry });
    // 两端起翘 + 鸱吻：庙宇屋脊在县城天际线里的签名。
    // 翘段的**内端必须落在正脊端点上**：第一版按中心点摆，rz 一转内端就掉到脊面以下，
    // 出图上成了两根挂在屋角外的细棍（"牛角"），读不出"脊自己翘起来"。
    const flareLen = 1.15, flareRz = 0.46;
    const ridgeEnd = width / 2 + overhang;
    const flareCx = ridgeEnd + Math.cos(flareRz) * flareLen / 2;
    const flareCy = ridgeY + 0.13 + Math.sin(flareRz) * flareLen / 2;
    const tipCx = ridgeEnd + Math.cos(flareRz) * flareLen;
    const tipCy = ridgeY + 0.13 + Math.sin(flareRz) * flareLen;
    for (const e of [-1, 1]) {
      const [fx, fz] = L(lx + e * flareCx, lz);
      Put(sink, mat, [flareLen, 0.26, 0.44], TILE_METERS.roof,
        `${seed}:flare${e}`, { x: fx, y: flareCy, z: fz, ry, rz: e * flareRz });
      const [wx, wz] = L(lx + e * tipCx, lz);
      Put(sink, mat, [0.40, 0.82, 0.40], TILE_METERS.roof,
        `${seed}:wen${e}`, { x: wx, y: tipCy + 0.30, z: wz, ry, rz: -e * 0.16 });
    }
    // 垂脊 + 脊兽（只给大殿一级用：小殿挂满脊兽反而假）
    if (beasts) {
      for (const e of [-1, 1]) {
        for (const s of [-1, 1]) {
          const hipLx = lx + e * (width / 2 + overhang * 0.55);
          const [cx, cz] = L(hipLx, lz + s * (half / 2));
          Put(sink, mat, [0.34, 0.17, slopeLen], TILE_METERS.roof,
            `${seed}:hip${e}${s}`, { x: cx, y: eaveY + rise / 2 + 0.15, z: cz, ry, rx: s * angle });
          for (let i = 0; i < 3; i += 1) {
            const t = 0.32 + i * 0.20;
            const [gx, gz] = L(hipLx, lz + s * (half * t));
            Put(sink, mat, [0.20, 0.28, 0.20], TILE_METERS.roof,
              `${seed}:bs${e}${s}${i}`, { x: gx, y: ridgeY - rise * t + 0.26, z: gz, ry });
          }
        }
      }
    }
  } else {
    // 塌掉的屋面：只剩几根焦梁横在山墙之间
    const rnd = Mulberry32(HashString(`${seed}:col`));
    for (let i = 0; i < 5; i += 1) {
      const [px, pz] = L(lx - width / 2 + (i + 0.5) * (width / 5), lz);
      Put(sink, "WoodBeam", [0.18, 0.15, depth * (0.5 + rnd() * 0.5)], TILE_METERS.wood,
        `${seed}:bm${i}`, {
          x: px, y: ridgeY - 0.3 - rnd() * 0.8, z: pz, ry,
          rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.35,
        });
    }
  }

  // 硬山山墙：两端墙体高出屋面（"硬山"二字的由来）
  if (gable) {
    for (const e of [-1, 1]) {
      const parts = [];
      // 民居山墙 6 段够用；庙宇的殿身进深大、又常被隔街看见，6 段在剪影上读成楼梯。
      const steps = 9;
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const hh = eaveY + rise * (1 - Math.abs(t0 + t1 - 1));
        const segD = depth / steps;
        parts.push(PlaceGeometry(MakeBox(0.34, hh, segD, WALL_TILE, `${seed}:g${e}${i}`),
          { y: hh / 2, z: -depth / 2 + segD * (i + 0.5) }));
      }
      const [gx, gz] = L(lx + e * (width / 2 + 0.17), lz);
      sink.Add(burnt ? "BrickWallSooty" : wallMat,
        PlaceGeometry(MergeGeometries(parts), { x: gx, y: 0, z: gz, ry }));
    }
  }
}

/** 腰檐：重檐大殿在半腰上围一圈下垂的筒瓦裙檐 —— 重檐的全部识别信号就在这一圈。 */
function AddSkirtRoof(sink, L, ry, { lx, lz, width, depth, y, out = 1.7, seed, tileMat = "TubeTile" }) {
  const drop = 0.44;
  for (const s of [-1, 1]) {
    const [ax, az] = L(lx, lz + s * (depth / 2 + out / 2));
    Put(sink, tileMat, [width + out * 2, 0.13, out + 0.5], TILE_METERS.roof,
      `${seed}:z${s}`, { x: ax, y, z: az, ry, rx: s * drop });
    // ±x 两侧：把板子在 Y 上再转 90°，它的局部 +z 就指向局部 +x
    const [bx, bz] = L(lx + s * (width / 2 + out / 2), lz);
    Put(sink, tileMat, [depth + out * 2, 0.13, out + 0.5], TILE_METERS.roof,
      `${seed}:x${s}`, { x: bx, y, z: bz, ry: ry + Math.PI / 2, rx: s * drop });
  }
}

/** 檐下一道通长红额枋 + 一排斗拱。庙宇「檐下有东西」的那条横向阴影带。 */
function AddEaveBand(sink, L, ry, { lx, lz, width, depth, y, seed }) {
  const [ax, az] = L(lx, lz + depth / 2 + 0.06);
  Put(sink, "PaintRed", [width + 0.5, 0.44, 0.34], TILE_METERS.wood,
    `${seed}:arch`, { x: ax, y: y - 0.56, z: az, ry });
  // 斗拱：密一点、小一点、往檐下缩。第一版是 1.25 m 一朵的大方块，出图上读成
  // 「墙头戳出一排搁板」而不是一条檐下密排的横向阴影带。
  const count = Math.max(6, Math.round(width / 0.9));
  for (let i = 0; i < count; i += 1) {
    const kLx = lx - width / 2 + (i + 0.5) * (width / count);
    const [kx, kz] = L(kLx, lz + depth / 2 + 0.13);
    Put(sink, "PaintRed", [0.24, 0.30, 0.54], TILE_METERS.wood,
      `${seed}:dg${i}`, { x: kx, y: y - 0.26, z: kz, ry });
    // 拱：斗上横着的一小根，密排之后檐下才有"层"
    const [hx, hz] = L(kLx, lz + depth / 2 + 0.24);
    Put(sink, "PaintRed", [width / count - 0.10, 0.14, 0.22], TILE_METERS.wood,
      `${seed}:gong${i}`, { x: hx, y: y - 0.07, z: hz, ry });
  }
}

// ---------------------------------------------------------------------------
// 殿
// ---------------------------------------------------------------------------

/**
 * 一座殿：石台基（带阶条石与踏跺）+ 三面实墙 + 前檐红柱与板门直棂窗 + 筒瓦硬山。
 *
 * eaveY / ridgeY 是**从台基顶面量起**的高度；墙体从 y=0 起砌，下半截埋在台基里
 * （AddWall 没有 baseY 参数，与其给全仓库的构件加参数，不如让台基把墙脚盖住 ——
 * 台基本来也比殿身大出一圈，露出来的就是石台边线）。
 *
 * @returns {number} 台基进深（含出沿），供院内甬路对接
 */
function AddTempleHall(sink, L, ry, o) {
  const {
    lx, lz, width, depth, baseH, eaveY, ridgeY, seed,
    damage = 0, burnt = false, beasts = false, skirtY = 0,
    wallMat = "TemplePlaster", plaque = false,
  } = o;
  const ruin = Clamp(damage * 0.55, 0, 0.5);
  const collapsed = damage > 0.62;
  const wallH = baseH + eaveY;
  const half = depth / 2;
  const bays = BayCount(width);
  const bayW = width / bays;
  const doorBay = (bays - 1) / 2;

  // --- 台基 ---
  const podW = width + 1.9, podD = depth + 1.7;
  const [pcx, pcz] = L(lx, lz);
  Put(sink, "Stone", [podW, baseH, podD], TILE_METERS.stone, `${seed}:pod`,
    { x: pcx, y: baseH / 2, z: pcz, ry });
  sink.Solid(pcx, baseH / 2, pcz, podW / 2, baseH / 2, podD / 2, "wall", ry);
  // 阶条石：台基顶面外沿一圈略高的石边。台基的「抬起」全靠这条边线读出来
  for (const s of [-1, 1]) {
    const [ax, az] = L(lx, lz + s * (podD / 2 - 0.22));
    Put(sink, "Stone", [podW, 0.16, 0.44], TILE_METERS.stone, `${seed}:cap${s}`,
      { x: ax, y: baseH + 0.06, z: az, ry });
    const [bx, bz] = L(lx + s * (podW / 2 - 0.22), lz);
    Put(sink, "Stone", [0.44, 0.16, podD], TILE_METERS.stone, `${seed}:capx${s}`,
      { x: bx, y: baseH + 0.06, z: bz, ry });
  }
  // 踏跺（朝南）：一级 0.25—0.3 m，人能上得去，不然殿门就是个看得见进不去的洞
  const runs = Math.max(2, Math.round(baseH / 0.28));
  const treadW = Math.min(width * 0.44, 5.4);
  for (let i = 0; i < runs; i += 1) {
    const th = baseH * (i + 1) / runs;
    const [sx, sz] = L(lx, lz + podD / 2 + 0.44 * (runs - 0.5 - i));
    Put(sink, "Stone", [treadW, th, 0.46], TILE_METERS.stone, `${seed}:st${i}`,
      { x: sx, y: th / 2, z: sz, ry });
    sink.Solid(sx, th / 2, sz, treadW / 2, th / 2, 0.23, "prop", ry);
  }

  // --- 后墙 + 两山墙 ---
  const [bkx, bkz] = L(lx, lz - half);
  AddWall(sink, wallMat, {
    x: bkx, z: bkz, length: width, height: wallH, thickness: 0.42,
    ry, ruin, seed: `${seed}:back`, tile: WALL_TILE,
  });
  for (const s of [-1, 1]) {
    const [gx, gz] = L(lx + s * (width / 2), lz);
    AddWall(sink, wallMat, {
      x: gx, z: gz, length: depth, height: wallH, thickness: 0.42,
      ry: ry + Math.PI / 2, ruin, seed: `${seed}:side${s}`, tile: WALL_TILE,
    });
  }

  // --- 前檐面：红檐柱 + 明间板门 + 次间槛墙直棂窗 ---
  const frontLz = lz + half;
  for (let i = 0; i <= bays; i += 1) {
    const [cx, cz] = L(lx - width / 2 + i * bayW, frontLz);
    Put(sink, "PaintRed", [0.38, wallH - 0.08, 0.44], TILE_METERS.wood,
      `${seed}:col${i}`, { x: cx, y: (wallH - 0.08) / 2, z: cz, ry });
    sink.Solid(cx, baseH + eaveY / 2, cz, 0.22, eaveY / 2, 0.24, "prop", ry);
  }
  const openH = Clamp(eaveY - 0.55, 1.9, 3.1);
  for (let b = 0; b < bays; b += 1) {
    const bLx = lx - width / 2 + bayW * (b + 0.5);
    const [bx, bz] = L(bLx, frontLz);
    if (b === doorBay) {
      // 板门关着。庙门开着在出图上就是一块纯黑（殿内没有内景），关着才有一片受光的木面
      if (damage < 0.7) {
        for (const s of [-1, 1]) {
          const [dx, dz] = L(bLx + s * (bayW * 0.235), frontLz - 0.17);
          Put(sink, "WoodBeam", [bayW * 0.45, openH, 0.09], TILE_METERS.wood,
            `${seed}:leaf${s}`, { x: dx, y: baseH + openH / 2, z: dz, ry });
        }
      }
      const overH = Math.max(0.24, wallH - baseH - openH);
      Put(sink, wallMat, [bayW - 0.42, overH, 0.40], WALL_TILE,
        `${seed}:over`, { x: bx, y: baseH + openH + overH / 2, z: bz, ry });
      for (const s of [-1, 1]) {
        const [jx, jz] = L(bLx + s * (bayW / 2 - 0.21), frontLz);
        Put(sink, "PaintRed", [0.28, openH + 0.22, 0.46], TILE_METERS.wood,
          `${seed}:jamb${s}`, { x: jx, y: baseH + (openH + 0.22) / 2, z: jz, ry });
        const [kx, kz] = L(bLx + s * (bayW / 2 - 0.21), frontLz + 0.30);
        Put(sink, "Stone", [0.46, 0.40, 0.52], TILE_METERS.stone,
          `${seed}:dun${s}`, { x: kx, y: baseH + 0.20, z: kz, ry });
      }
      // 匾额：门额上一方石匾。庙门口那块横匾是「这是庙不是宅」最短的一句话
      if (plaque) {
        const [qx, qz] = L(bLx, frontLz + 0.30);
        Put(sink, "Stone", [Math.min(bayW * 0.66, 2.4), 0.72, 0.14], TILE_METERS.stone,
          `${seed}:plq`, { x: qx, y: baseH + openH + 0.48, z: qz, ry });
      }
    } else {
      const sillH = 1.05;
      Put(sink, wallMat, [bayW - 0.44, baseH + sillH, 0.40], WALL_TILE,
        `${seed}:sill${b}`, { x: bx, y: (baseH + sillH) / 2, z: bz, ry });
      Put(sink, wallMat, [bayW - 0.44, 0.5, 0.40], WALL_TILE,
        `${seed}:head${b}`, { x: bx, y: wallH - 0.25, z: bz, ry });
      const winH = Math.max(0.6, wallH - baseH - sillH - 0.5);
      // 窗背板：直棂窗后面必须有一片东西。第一版没有，出图上每一樘窗都是**纯黑方块**
      // ——殿内没有内景，光棂条挡不住那个洞，读起来像墙上开了个虚空。
      // 一块退在棂条后 0.22 m 的木板既是形制（庙窗后本来就糊纸／装板），
      // 也把黑洞换成一片吃得到天光的暗木面。
      if (damage < 0.75) {
        const [nx, nz] = L(bLx, frontLz - 0.22);
        Put(sink, "WoodBeam", [bayW - 0.44, winH + 0.16, 0.07], TILE_METERS.wood,
          `${seed}:pane${b}`, { x: nx, y: baseH + sillH + winH / 2, z: nz, ry });
      }
      if (damage < 0.6) {
        const bars = [];
        const span = bayW - 0.70;
        const n = Math.max(4, Math.round(span / 0.24));
        for (let m = 0; m < n; m += 1) {
          bars.push(PlaceGeometry(MakeBox(0.07, winH, 0.09, TILE_METERS.wood, `${seed}:bar${b}${m}`),
            { x: -span / 2 + (m * span) / (n - 1) }));
        }
        for (const s of [-1, 1]) {
          bars.push(PlaceGeometry(
            MakeBox(span + 0.2, 0.09, 0.11, TILE_METERS.wood, `${seed}:wr${b}${s}`),
            { y: s * winH / 2 }));
        }
        sink.Add("WoodBeam", PlaceGeometry(MergeGeometries(bars),
          { x: bx, y: baseH + sillH + winH / 2, z: bz, ry }));
      }
      sink.Solid(bx, baseH + (wallH - baseH) / 2, bz,
        (bayW - 0.44) / 2, (wallH - baseH) / 2, 0.22, "wall", ry);
    }
  }

  // --- 檐下带 + 腰檐 + 屋面 ---
  AddEaveBand(sink, L, ry, { lx, lz, width, depth, y: wallH, seed: `${seed}:band` });
  if (skirtY > 0) {
    AddSkirtRoof(sink, L, ry, {
      lx, lz, width, depth, y: baseH + skirtY, out: 1.7, seed: `${seed}:skirt`,
    });
    AddEaveBand(sink, L, ry, {
      lx, lz, width, depth, y: baseH + skirtY, seed: `${seed}:band2`,
    });
  }
  AddTempleRoof(sink, L, ry, {
    lx, lz, width, depth, eaveY: wallH, ridgeY: baseH + ridgeY,
    seed: `${seed}:roof`, beasts, ruined: collapsed, burnt, wallMat,
  });
  if (collapsed) {
    const [rx0, rz0] = L(lx, lz);
    sink.props.push({
      kind: "rubblePile", x: rx0, z: rz0,
      radius: Math.max(width, depth) * 0.45, seed: `${seed}:rp`,
    });
  }
  return podD;
}

// ---------------------------------------------------------------------------
// 山门 / 院墙 / 院内
// ---------------------------------------------------------------------------

/**
 * 山门：门洞 + 两侧墙垛 + 红抱框 + 门枕石 + 石匾 + 挑檐（起翘的小筒瓦顶）。
 *
 * 门洞上方的过梁**不登记碰撞**：这一处必须是能走过去的（院门留可走开口是硬要求），
 * 而 min/max 包围盒会被导航位图当成整块实体。两侧墙垛照常登记。
 */
function AddTempleGate(sink, L, ry, o) {
  const {
    lx, lz, seed, damage = 0, burnt = false,
    openW = 2.4, wing = 2.3, height = 4.3, depth = 2.0, wallMat = "TemplePlaster",
  } = o;
  const mat = burnt ? "BrickWallSooty" : wallMat;
  const openH = 2.85;

  for (const s of [-1, 1]) {
    const [px, pz] = L(lx + s * (openW / 2 + wing / 2), lz);
    Put(sink, mat, [wing, height, depth], WALL_TILE, `${seed}:pier${s}`,
      { x: px, y: height / 2, z: pz, ry });
    sink.Solid(px, height / 2, pz, wing / 2, height / 2, depth / 2, "wall", ry);
    sink.Cover(px, pz, height, Math.sin(ry), Math.cos(ry));
    // 门枕石
    const [kx, kz] = L(lx + s * (openW / 2 + 0.26), lz + depth / 2 + 0.16);
    Put(sink, "Stone", [0.52, 0.46, 0.56], TILE_METERS.stone, `${seed}:dun${s}`,
      { x: kx, y: 0.23, z: kz, ry });
    // 红抱框
    const [jx, jz] = L(lx + s * (openW / 2 - 0.12), lz + depth / 2 - 0.10);
    Put(sink, "PaintRed", [0.30, openH + 0.24, 0.34], TILE_METERS.wood,
      `${seed}:jamb${s}`, { x: jx, y: (openH + 0.24) / 2, z: jz, ry });
  }
  // 门洞上的过梁段（无碰撞）
  const [ltx, ltz] = L(lx, lz);
  Put(sink, mat, [openW + 0.5, height - openH, depth], WALL_TILE, `${seed}:lintel`,
    { x: ltx, y: openH + (height - openH) / 2, z: ltz, ry });
  // 石匾
  const [qx, qz] = L(lx, lz + depth / 2 + 0.07);
  Put(sink, "Stone", [Math.min(openW + 0.6, 2.9), 0.78, 0.14], TILE_METERS.stone,
    `${seed}:plq`, { x: qx, y: openH + 0.62, z: qz, ry });
  // 额枋 + 斗拱
  AddEaveBand(sink, L, ry, {
    lx, lz, width: openW + wing * 2, depth, y: height, seed: `${seed}:band`,
  });
  // 挑檐
  AddTempleRoof(sink, L, ry, {
    lx, lz, width: openW + wing * 2 + 0.6, depth: depth + 0.7,
    eaveY: height + 0.42, ridgeY: height + 1.55, overhang: 0.85, rafterStep: 0.6,
    seed: `${seed}:roof`, burnt, wallMat,
  });
  // 门洞的里子：门槛 + 门道墁地 + 木框。"里"在院子那一侧（局部 −z），故 ry+π
  const [rvx, rvz] = L(lx, lz + depth / 2);
  AddDoorReveal(sink, {
    x: rvx, z: rvz, ry: ry + Math.PI, openW, openH, depth: depth + 1.4, seed: `${seed}:rv`,
  });
  // 门板：一扇歪着，一扇掉了
  if (damage < 0.75) {
    const [d0x, d0z] = L(lx - openW / 4, lz + depth / 2 - 0.12);
    Put(sink, "WoodBeam", [openW / 2 - 0.05, openH - 0.1, 0.09], TILE_METERS.wood,
      `${seed}:d0`, { x: d0x, y: (openH - 0.1) / 2, z: d0z, ry });
    if (damage < 0.4) {
      const [d1x, d1z] = L(lx + openW / 4, lz + depth / 2 - 0.12);
      Put(sink, "WoodBeam", [openW / 2 - 0.05, openH - 0.1, 0.09], TILE_METERS.wood,
        `${seed}:d1`, { x: d1x, y: (openH - 0.1) / 2, z: d1z, ry: ry - 0.5 });
    }
  }
}

/**
 * 庙墙一圈：南面在中央留出 gateSpan 的口子给山门/棂星门，其余三面连续实墙。
 *
 * 墙身是**青砖**（HouseBrick）不是粉墙：粉刷（TemplePlaster）只上山门与殿身。
 * 第一版把整圈院墙也刷成 TemplePlaster，出图上一座庙就是一大片高饱和红色 ——
 * 在一座灰青色的县城里读成「新盖的红砖房」而不是「庙」。
 * 县级街庙的围墙本来也就是普通青砖，红只出现在门脸和殿身上，
 * 那一点红才有分量。
 */
function AddTempleYard(sink, L, ry, o) {
  const { w, d, seed, damage = 0, burnt = false, height = YARD_WALL_H, gateSpan, wallMat = "HouseBrick" } = o;
  const mat = burnt ? "BrickWallSooty" : wallMat;
  const ruin = Clamp(damage * 0.7, 0, 0.55);
  const runs = [
    { lx: 0, lz: -d / 2, len: w, rot: 0, id: "n" },
    { lx: -w / 2, lz: 0, len: d, rot: Math.PI / 2, id: "wl" },
    { lx: w / 2, lz: 0, len: d, rot: Math.PI / 2, id: "e" },
  ];
  for (const run of runs) {
    const [x, z] = L(run.lx, run.lz);
    AddWall(sink, mat, {
      x, z, length: run.len, height, thickness: 0.44,
      ry: ry + run.rot, ruin, seed: `${seed}:w${run.id}`,
      tile: WALL_TILE, plinth: "Stone", cope: true,
    });
  }
  // 南面（开门那面）：两段墙夹一个 gateSpan 的口子
  const segLen = Math.max(1.0, (w - gateSpan) / 2);
  for (const s of [-1, 1]) {
    const [x, z] = L(s * (gateSpan / 2 + segLen / 2), d / 2);
    AddWall(sink, mat, {
      x, z, length: segLen, height, thickness: 0.44,
      ry, ruin, seed: `${seed}:ws${s}`, tile: WALL_TILE, plinth: "Stone", cope: true,
    });
  }
}

/** 石甬路：中轴上一条铺石的路。俯瞰时这条亮线把庙院从灰瓦民居网格里拉出来。 */
function AddSpiritPath(sink, L, ry, { fromLz, toLz, seed, width = 2.4 }) {
  const len = Math.abs(fromLz - toLz);
  if (len < 0.6) return;
  const [x, z] = L(0, (fromLz + toLz) / 2);
  Put(sink, "Stone", [width, 0.14, len], TILE_METERS.stone, seed,
    { x, y: 0.02, z, ry });
}

/** 石香炉：方座 + 炉身 + 筒瓦炉盖。庙院中轴上唯一的"家什"。 */
function AddCenser(sink, L, ry, { lx, lz, seed }) {
  const [x, z] = L(lx, lz);
  Put(sink, "Stone", [1.60, 0.34, 1.60], TILE_METERS.stone, `${seed}:base`, { x, y: 0.17, z, ry });
  Put(sink, "Stone", [1.05, 0.90, 1.05], TILE_METERS.stone, `${seed}:body`, { x, y: 0.79, z, ry });
  Put(sink, "TubeTile", [1.30, 0.22, 1.30], TILE_METERS.roof, `${seed}:lid`, { x, y: 1.35, z, ry });
  sink.Solid(x, 0.73, z, 0.82, 0.73, 0.82, "prop", ry);
  sink.Cover(x, z, 1.46, Math.sin(ry), Math.cos(ry));
}

/** 幡杆一对：山门内两侧的高木杆，给庙院一组竖向剪影。 */
function AddBannerPoles(sink, L, ry, { lx, lz, seed, height = 7.6 }) {
  for (const s of [-1, 1]) {
    const [x, z] = L(s * lx, lz);
    Put(sink, "Stone", [0.72, 0.52, 0.72], TILE_METERS.stone, `${seed}:foot${s}`,
      { x, y: 0.26, z, ry });
    Put(sink, "WoodBeam", [0.22, height, 0.22], TILE_METERS.wood, `${seed}:pole${s}`,
      { x, y: 0.52 + height / 2, z, ry });
    sink.Solid(x, 0.52 + height / 2, z, 0.24, height / 2, 0.24, "prop", ry);
  }
}

/**
 * 照壁：山门外正对门口的一堵矮墙。撞街就不建（街面净宽不许侵）。
 * 高度压在 2.6 m、宽度收到 5 m 以内：它要挡住门洞（形制如此），
 * 但不许把山门那一整套挑檐起翘从街上遮掉 —— 那是这三座庙唯一的路标价值。
 */
function AddScreenWall(host, L, ry, { lz, seed, damage = 0, wallMat = "TemplePlaster", length = 5.0 }) {
  const [x, z] = L(0, lz);
  if (host.OnStreet(x, z, length / 2 + 0.6, 0.8)) return;
  AddWall(host.sink, wallMat, {
    x, z, length, height: 2.6, thickness: 0.46, ry,
    ruin: Clamp(damage * 0.5, 0, 0.4), seed, tile: WALL_TILE, plinth: "Stone", cope: true,
  });
}

// ---------------------------------------------------------------------------
// 构建器
// ---------------------------------------------------------------------------

/**
 * 街庙（龙王庙 42×30 / 火神庙 34×26）：庙墙 + 山门 + 前殿 + 大殿 + 甬路 + 香炉 +
 * 幡杆 + 院内侧柏。单檐，大殿脊高约 6.4 m —— 比民居脊（4.0—4.8）高出一档半，
 * 但还压在县衙与城楼之下。
 */
export function BuildTemple(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const L = MakeFrame(f, ry);
  const damage = ctx.damage ?? 0;
  const burnt = !!ctx.burnt;
  const w = f.w, d = f.d;
  const seed = `map:${f.id}`;
  const rnd = Mulberry32(HashString(`${seed}:temple`));

  const openW = 2.4, wing = 2.3, gateDepth = 2.0;
  const gateSpan = openW + wing * 2 + 0.5;
  AddTempleYard(sink, L, ry, { w, d, seed: `${seed}:yard`, damage, burnt, gateSpan });

  const gateLz = d / 2 - gateDepth / 2 - 0.22;
  AddTempleGate(sink, L, ry, {
    lx: 0, lz: gateLz, seed: `${seed}:gate`, damage, burnt, openW, wing, depth: gateDepth,
  });

  // 大殿（北，抬高 0.8 m 的台基，脊两端起翘 + 垂脊兽）
  const mainW = Math.min(w * 0.46, 15.0);
  const mainD = Math.min(d * 0.28, 8.4);
  const mainLz = -d / 2 + mainD / 2 + 1.8;
  const mainPodD = AddTempleHall(sink, L, ry, {
    lx: 0, lz: mainLz, width: mainW, depth: mainD,
    baseH: 0.80, eaveY: 3.9, ridgeY: 5.6, seed: `${seed}:hall`,
    damage, burnt, beasts: true, plaque: true,
  });

  // 前殿（矮一档，无脊兽）
  const frontW = Math.min(w * 0.34, 11.0);
  const frontD = Math.min(d * 0.17, 5.2);
  const frontLz = d * 0.08;
  const frontPodD = AddTempleHall(sink, L, ry, {
    lx: 0, lz: frontLz, width: frontW, depth: frontD,
    baseH: 0.42, eaveY: 3.1, ridgeY: 4.5, seed: `${seed}:front`,
    damage: Clamp(damage + rnd() * 0.14, 0, 1), burnt,
  });

  // 甬路两段（前院：山门→前殿；后院：前殿→大殿）
  AddSpiritPath(sink, L, ry, {
    fromLz: gateLz - gateDepth / 2 - 0.4, toLz: frontLz + frontPodD / 2,
    seed: `${seed}:path0`,
  });
  AddSpiritPath(sink, L, ry, {
    fromLz: frontLz - frontPodD / 2, toLz: mainLz + mainPodD / 2, seed: `${seed}:path1`,
  });

  AddCenser(sink, L, ry, { lx: 0, lz: d * 0.24, seed: `${seed}:censer` });
  AddBannerPoles(sink, L, ry, {
    lx: openW / 2 + wing + 1.7, lz: d / 2 - 4.2, seed: `${seed}:pole`, height: 7.4,
  });

  // 院内侧柏一对：三月唯一成片不透光的墨绿竖影，庙院的第二个识别信号
  for (const s of [-1, 1]) {
    const [cx, cz] = L(s * (w * 0.30), d * 0.24 + (rnd() - 0.5) * 1.6);
    AddCypress(sink, { x: cx, z: cz, seed: `${seed}:cyp${s}`, height: 6.6 + rnd() * 1.8 });
  }
  AddScreenWall(host, L, ry, {
    lz: d / 2 + 5.6, seed: `${seed}:screen`, damage, length: Math.min(w * 0.16, 5.0),
  });
}

/**
 * 文庙（40×34）：棂星门（牌坊门）+ 大成门 + **重檐**大成殿 + 甬路碑列 + 四株侧柏。
 * 大成殿台基 1.25 m、腰檐 3.4 m、上檐 6.0 m、正脊 8.8 m（自台基顶算）
 * → 世界脊高约 10 m，鸱吻到 11 m。城西北这一片没有别的东西够这个高度。
 * 泮池（半月池）省掉：没有水面材质的成本预算，且它在俯瞰里被大成殿完全遮住。
 */
export function BuildConfucianTemple(host, f, ctx) {
  const sink = host.sink;
  const ry = ctx.ry ?? 0;
  const L = MakeFrame(f, ry);
  const damage = ctx.damage ?? 0;
  const burnt = !!ctx.burnt;
  const w = f.w, d = f.d;
  const seed = `map:${f.id}`;
  const rnd = Mulberry32(HashString(`${seed}:confucian`));

  // 棂星门：文庙的门不是门楼而是一座跨在中轴上的石牌坊。柱间可以走过去
  const span = Math.min(w * 0.30, 12.0);
  AddTempleYard(sink, L, ry, {
    w, d, seed: `${seed}:yard`, damage, burnt,
    height: CONFUCIAN_WALL_H, gateSpan: span + 2.0,
  });
  const gateLz = d / 2 - 0.9;
  const [gx, gz] = L(0, gateLz);
  AddPaifang(sink, { x: gx, z: gz, ry, span, seed: `${seed}:lingxing`, height: 7.6 });

  // 大成殿：重檐 —— 腰檐那一圈是「这不是又一座正房」的唯一硬信号
  const mainW = Math.min(w * 0.55, 21.0);
  const mainD = Math.min(d * 0.32, 11.0);
  const mainLz = -d / 2 + mainD / 2 + 1.6;
  const mainPodD = AddTempleHall(sink, L, ry, {
    lx: 0, lz: mainLz, width: mainW, depth: mainD,
    baseH: 1.25, eaveY: 6.0, ridgeY: 8.8, skirtY: 3.4,
    seed: `${seed}:dacheng`, damage, burnt, beasts: true, plaque: true,
  });

  // 大成门（二门）：一座三开间的过殿，把院子隔成前后两进
  const gateHallW = Math.min(w * 0.38, 15.0);
  const gateHallD = Math.min(d * 0.16, 5.4);
  const gateHallLz = d * 0.10;
  const gateHallPodD = AddTempleHall(sink, L, ry, {
    lx: 0, lz: gateHallLz, width: gateHallW, depth: gateHallD,
    baseH: 0.55, eaveY: 3.5, ridgeY: 5.1, seed: `${seed}:dachengmen`,
    damage: Clamp(damage + rnd() * 0.12, 0, 1), burnt, plaque: true,
  });

  AddSpiritPath(sink, L, ry, {
    fromLz: gateLz - 1.0, toLz: gateHallLz + gateHallPodD / 2,
    seed: `${seed}:path0`, width: 2.8,
  });
  AddSpiritPath(sink, L, ry, {
    fromLz: gateHallLz - gateHallPodD / 2, toLz: mainLz + mainPodD / 2,
    seed: `${seed}:path1`, width: 2.8,
  });

  AddCenser(sink, L, ry, { lx: 0, lz: mainLz + mainPodD / 2 + 2.2, seed: `${seed}:censer` });

  // 碑：甬路两侧的四通石碑（县学的进士题名碑一类）。形制无资料，做素碑不刻字
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      const [bx, bz] = L(s * 3.4, d * 0.26 + i * 4.6);
      Put(sink, "Stone", [1.05, 0.32, 0.80], TILE_METERS.stone, `${seed}:stelebase${s}${i}`,
        { x: bx, y: 0.16, z: bz, ry });
      Put(sink, "Stone", [0.78, 2.05, 0.24], TILE_METERS.stone, `${seed}:stele${s}${i}`,
        { x: bx, y: 1.34, z: bz, ry: ry + (rnd() - 0.5) * 0.10 });
      sink.Solid(bx, 1.18, bz, 0.42, 1.18, 0.28, "prop", ry);
    }
  }

  // 四株侧柏：文庙的柏树成对栽在两进院里
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      const [cx, cz] = L(s * (w * 0.34), d * (0.20 - i * 0.30) + (rnd() - 0.5) * 1.4);
      AddCypress(sink, { x: cx, z: cz, seed: `${seed}:cyp${s}${i}`, height: 7.4 + rnd() * 2.2 });
    }
  }
  AddScreenWall(host, L, ry, {
    lz: d / 2 + 6.2, seed: `${seed}:screen`, damage, length: Math.min(w * 0.18, 6.0),
  });
}
