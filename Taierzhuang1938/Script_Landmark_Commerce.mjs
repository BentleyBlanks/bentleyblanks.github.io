// 商会 + 当典（当铺）+ 办事处 —— 商用公建三件。工作包 A4 / D5 专属文件。
//
// 【第二轮 D5】三件事，都在下面各自的位置有详注：
//   ① 商会穿堂门道旁那一间开成**能进去的铺面**（排门板卸两块当门 + 柜台/货架/算盘案/幌子杆内头）；
//   ② 腰檐挑出 1.6 → 1.0 m，把门匾从檐影里放出来（A4 遗留 4 的二选一）；
//   ③ 当典墙头碎瓷第三版：压扁 + 斜置 + 抽签间距，顺手减 22% 面（A4 遗留 3）。
// 当典库楼与办事处**一个字没动**。
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
  SolidWithOpenings,
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
function Slab(sink, material, p, y, w, h, d, ry, seed, { rx = 0, rz = 0, tile = TILE_METERS.brick } = {}) {
  sink.Add(material, PlaceGeometry(MakeBox(w, h, d, tile, seed), { x: p.x, y, z: p.z, ry, rx, rz }));
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
// 商会临街铺面（第二轮 WP-D5）——「穿堂门道旁的一间能走进去」
//
// 白天的铺面就是把排门板卸下几块：本包做成一间七块板的铺子，**卸中间两块当门**，
// 里头是柜台（L 形）+ 两组货架 + 算盘案，幌子杆从门洞上沿穿出去挑到街面上。
//
// 三条硬约束（WP_Common「内部空间契约」）：
//   · **门洞必可走**：前檐的碰撞不再是"一开间一整条"，而是按卸板留出的净宽
//     切成左右两段，中间那 1.12 m 真的空着（探针沿轴线 0—1.8 m 采样零阻挡）；
//   · **家具全走 sink**：合批 + 可破坏 + 只用本包已有的材质名，不新起几何通道；
//   · **内部没有独立光源**：所以门头那一段不砌砖，改成透光的木棂亮子 ——
//     店堂靠"门洞 + 亮子"两个口采光，暗是效果，全黑是 bug。
//
// 尺寸推定（无史料，列进交付报告的 PRESUMED 表）：排门板七块／块宽 0.56 m、
// 板高 2.75 m；店堂进深 5.6 m；柜台高 0.95 m；货架四层／层距 0.5 m。
// ---------------------------------------------------------------------------

const SHOP = Object.freeze({
  depth: 5.6,        // 店堂进深（前檐墙心 → 后板壁心）
  boards: 7,         // 一开间排门板的块数
  openAt: 2,         // 从局部 -x 数起卸下第 3、4 块
  openCount: 2,
  partT: 0.12,       // 板壁厚
  boardTop: 2.75,    // 排门板顶（= 其它开间门头板的底）
  counterH: 0.95,
});

/** 卸板口在开间局部坐标里的左右端点。前脸与内部两处都要用同一份，别各算各的。 */
function ShopOpening(panelW) {
  const bw = panelW / SHOP.boards;
  const a = -panelW / 2 + bw * SHOP.openAt;
  return { bw, a, b: a + bw * SHOP.openCount, cx: a + (bw * SHOP.openCount) / 2 };
}

/** 一组木货架：两根立柱 + 若干层隔板 + 层上的货。背靠板壁摆，along 说的是"长边顺哪个轴"。 */
function AddShopShelf(sink, At, ry, seed, o) {
  const wood = { tile: TILE_METERS.wood };
  const rnd = Mulberry32(HashString(seed));
  const alongU = o.along === "u";
  const half = o.len / 2;
  const dx = alongU ? o.len : o.depth;
  const dz = alongU ? o.depth : o.len;
  for (const s of [-1, 1]) {
    const p = alongU ? At(o.u + s * (half - 0.05), o.lz) : At(o.u, o.lz + s * (half - 0.05));
    Slab(sink, "WoodBeam", p, 1.07, alongU ? 0.1 : o.depth, 2.14, alongU ? o.depth : 0.1, ry,
      `${seed}:up${s}`, wood);
  }
  for (let i = 0; i < o.tiers; i += 1) {
    const y = 0.44 + i * 0.5;
    Slab(sink, "WoodDoor", At(o.u, o.lz), y, dx - 0.03, 0.05, dz - 0.03, ry, `${seed}:tier${i}`, wood);
    if (!o.goods) continue;
    for (let k = 0; k < 3; k += 1) {
      const off = (-0.3 + k * 0.3) * o.len;
      const p = alongU ? At(o.u + off, o.lz) : At(o.u, o.lz + off);
      const pick = Math.floor(rnd() * 3);
      const h = 0.16 + rnd() * 0.12;
      const w = 0.22 + rnd() * 0.1;
      // 绸布卷 / 木匣 / 荆条篓：三样都是商会铺子该有的，材质全是院里已经在用的
      const mat = pick === 0 ? "HouseholdCloth" : (pick === 1 ? "WoodDoor" : "Wicker");
      Slab(sink, mat, p, y + 0.025 + h / 2, alongU ? w : o.depth * 0.62,
        h, alongU ? o.depth * 0.62 : w, ry, `${seed}:g${i}${k}`,
        { tile: pick === 0 ? TILE_METERS.cloth : TILE_METERS.wood });
    }
  }
  const p = At(o.u, o.lz);
  sink.Solid(p.x, 1.07, p.z, dx / 2, 1.07, dz / 2, "furniture", ry);
}

/**
 * 临街那一间的前脸：石门槛槽 + 五块排门板 + 卸掉的两块留出的门洞 + 门头亮子。
 * 碰撞在这里分段，是"能不能进去"的唯一决定点。
 */
function AddShopFront(sink, S, ry, seed, ctx, g) {
  const { lx, panelW, floor1, hd } = g;
  const { bw, a, b, cx } = ShopOpening(panelW);
  const top = SHOP.boardTop;
  const face = hd - 0.22;
  const wallMat = ctx.burnt ? "BrickWallSooty" : "BrickWall";
  const wood = { tile: TILE_METERS.wood };

  // 上下槽：排门板卡在石槛与木上槛之间。门洞那一段不铺石槛（门槛石由 AddDoorReveal 出）
  for (const [x0, x1, tag] of [[-panelW / 2 - 0.11, a, "L"], [b, panelW / 2 + 0.11, "R"]]) {
    Slab(sink, "Stone", S.At(lx + (x0 + x1) / 2, hd + 0.02), 0.06, x1 - x0, 0.12, 0.38, ry,
      `${seed}:shopSill${tag}`, { tile: TILE_METERS.stone });
  }
  Slab(sink, "WoodBeam", S.At(lx, hd + 0.02), top + 0.1, panelW + 0.22, 0.18, 0.34, ry,
    `${seed}:shopHead`, wood);

  // 排门板：卸掉中间两块，剩下五块连缝立楞
  for (let i = 0; i < SHOP.boards; i += 1) {
    if (i >= SHOP.openAt && i < SHOP.openAt + SHOP.openCount) continue;
    const bx = lx - panelW / 2 + bw * (i + 0.5);
    Slab(sink, "WoodDoor", S.At(bx, hd + 0.02), (top + 0.12) / 2, bw - 0.025, top - 0.12, 0.1, ry,
      `${seed}:board${i}`, wood);
    Slab(sink, "WoodBeam", S.At(bx + bw / 2 - 0.01, hd + 0.08), (top + 0.12) / 2, 0.05, top - 0.12, 0.06, ry,
      `${seed}:boardJ${i}`, wood);
  }

  // 门头：卸板口上方**不砌砖**，改一樘木棂亮子 —— 店堂唯一的第二个采光口
  for (const [x0, x1, tag] of [[-panelW / 2, a, "L"], [b, panelW / 2, "R"]]) {
    if (x1 - x0 < 0.06) continue;
    Slab(sink, wallMat, S.At(lx + (x0 + x1) / 2, face), (top + floor1) / 2, x1 - x0, floor1 - top, 0.44, ry,
      `${seed}:shopTran${tag}`);
  }
  const lightW = b - a;
  for (const [y, h, d] of [[top + 0.07, 0.1, 0.22], [floor1 - 0.07, 0.1, 0.22]]) {
    Slab(sink, "WoodBeam", S.At(lx + cx, face), y, lightW, h, d, ry, `${seed}:shopLt${y}`, wood);
  }
  for (let m = 0; m < 5; m += 1) {
    Slab(sink, "WoodBeam", S.At(lx + cx + (-0.36 + m * 0.18) * lightW, face), (top + floor1) / 2,
      0.055, floor1 - top, 0.16, ry, `${seed}:shopLtM${m}`, wood);
  }

  // 碰撞：左右两段实心，中间那 1.12 m 真的空着。这一行就是"门洞可走"的全部
  for (const [x0, x1] of [[-panelW / 2 - 0.26, a], [b, panelW / 2 + 0.26]]) {
    const p = S.At(lx + (x0 + x1) / 2, face);
    sink.Solid(p.x, floor1 / 2, p.z, (x1 - x0) / 2, floor1 / 2, 0.24, "wall", ry);
    sink.Cover(p.x, p.z, floor1, S.sin, S.cos);
  }

  const doorAt = S.At(lx + cx, hd);
  AddDoorReveal(sink, {
    x: doorAt.x, z: doorAt.z, ry, openW: lightW, openH: top,
    depth: SHOP.depth - 0.9, seed: `${seed}:shopRv`, paving: "HouseholdCeramic",
  });
}

/** 店堂内部：板壁围出一间、楼板压顶，柜台 + 两组货架 + 算盘案 + 幌子杆内头。 */
function AddShopRoom(sink, S, ry, seed, ctx, g) {
  const { lx, bayW, panelW, floor1, hd } = g;
  const wood = { tile: TILE_METERS.wood };
  const stone = { tile: TILE_METERS.stone };
  const t = SHOP.partT;
  const innerFace = hd - 0.44;                    // 前檐墙内皮（墙心 hd-0.22、厚 0.44）
  const backLz = hd - SHOP.depth;
  const midLz = (innerFace + backLz) / 2;
  const len = innerFace - backLz;
  const uHalf = bayW / 2;
  const At = (u, lz) => S.At(lx + u, lz);
  const intact = ctx.damage < 0.55;

  // --- 壳：墁地 + 两道板壁 + 后板壁 + 楼板（楼板底 3.31 m，悬在头顶不进导航图）---
  // 地面用 HouseholdCeramic（Stone 配方 + 砖色）而不是 Stone：第一版拿 Stone 铺地，
  // 白得发光的一块地板把"进了屋"的暗对比整个吃掉 —— 屋里比街上还亮就不叫屋里。
  Slab(sink, "HouseholdCeramic", At(0, midLz), 0, bayW - t, 0.12, len, ry, `${seed}:shopFloor`, stone);
  for (const side of [-1, 1]) {
    const p = At(side * uHalf, midLz);
    Slab(sink, "WoodDoor", p, floor1 / 2, t, floor1, len, ry, `${seed}:shopPart${side}`, wood);
    sink.Solid(p.x, floor1 / 2, p.z, t / 2, floor1 / 2, len / 2, "wall", ry);
  }
  const back = At(0, backLz);
  Slab(sink, "WoodDoor", back, floor1 / 2, bayW, floor1, t, ry, `${seed}:shopBack`, wood);
  sink.Solid(back.x, floor1 / 2, back.z, bayW / 2, floor1 / 2, t / 2, "wall", ry);
  const ceil = At(0, midLz);
  Slab(sink, "WoodDoor", ceil, floor1 - 0.07, bayW - t, 0.14, len, ry, `${seed}:shopCeil`, wood);
  sink.Solid(ceil.x, floor1 - 0.07, ceil.z, (bayW - t) / 2, 0.07, len / 2, "wall", ry);
  for (let i = 0; i < 3; i += 1) {
    Slab(sink, "WoodBeam", At(0, backLz + len * (0.22 + i * 0.28)), floor1 - 0.25, bayW - t, 0.18, 0.14, ry,
      `${seed}:shopJoist${i}`, wood);
  }

  // --- 柜台：L 形，长边平行街面、回头段贴东板壁。掌柜站里头，客人只到台外 ---
  const cLz = innerFace - 2.4;
  const cu0 = -0.2, cu1 = uHalf - 0.06;
  const cCx = (cu0 + cu1) / 2, cLen = cu1 - cu0;
  Slab(sink, "WoodDoor", At(cCx, cLz), SHOP.counterH, cLen, 0.1, 0.66, ry, `${seed}:cntTop`, wood);
  Slab(sink, "WoodDoor", At(cCx, cLz - 0.03), (SHOP.counterH + 0.06) / 2, cLen - 0.08, SHOP.counterH - 0.2, 0.5, ry,
    `${seed}:cntBody`, wood);
  Slab(sink, "Stone", At(cCx, cLz), 0.11, cLen, 0.2, 0.58, ry, `${seed}:cntPlinth`, stone);
  const cp = At(cCx, cLz);
  sink.Solid(cp.x, SHOP.counterH / 2, cp.z, cLen / 2, SHOP.counterH / 2, 0.33, "furniture", ry);

  const rU = uHalf - 0.39;
  const rLz0 = backLz + 0.55, rLz1 = cLz;
  const rCz = (rLz0 + rLz1) / 2, rLen = rLz1 - rLz0;
  Slab(sink, "WoodDoor", At(rU, rCz), SHOP.counterH, 0.66, 0.1, rLen, ry, `${seed}:cntTopR`, wood);
  Slab(sink, "WoodDoor", At(rU - 0.03, rCz), (SHOP.counterH + 0.06) / 2, 0.5, SHOP.counterH - 0.2, rLen - 0.08, ry,
    `${seed}:cntBodyR`, wood);
  const rp = At(rU, rCz);
  sink.Solid(rp.x, SHOP.counterH / 2, rp.z, 0.33, SHOP.counterH / 2, rLen / 2, "furniture", ry);

  // --- 货架两组：一组贴西板壁（顺进深），一组贴后板壁（顺面阔）---
  AddShopShelf(sink, At, ry, `${seed}:shelfW`, {
    u: -(uHalf - 0.22), lz: backLz + 2.9, len: 2.2, depth: 0.42,
    along: "z", tiers: 4, goods: intact,
  });
  AddShopShelf(sink, At, ry, `${seed}:shelfN`, {
    u: -uHalf * 0.4, lz: backLz + 0.28, len: 2.4, depth: 0.42,
    along: "u", tiers: 4, goods: intact,
  });

  // --- 算盘案：柜台里头一张小条案，案上一把算盘 + 一摞账簿，旁边一只矮凳 ---
  const dU = 0.85, dLz = backLz + 1.45;
  Slab(sink, "WoodDoor", At(dU, dLz), 0.72, 1.15, 0.1, 0.66, ry, `${seed}:deskTop`, wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    Slab(sink, "WoodBeam", At(dU + sx * 0.5, dLz + sz * 0.26), 0.34, 0.08, 0.68, 0.08, ry,
      `${seed}:deskLeg${sx}${sz}`, wood);
  }
  const dp = At(dU, dLz);
  sink.Solid(dp.x, 0.39, dp.z, 0.6, 0.39, 0.36, "furniture", ry);
  if (intact) {
    const ab = At(dU - 0.2, dLz + 0.02);
    Slab(sink, "WoodBeam", ab, 0.795, 0.44, 0.045, 0.27, ry, `${seed}:abFrame`, wood);
    Slab(sink, "WoodDoor", At(dU - 0.2, dLz + 0.07), 0.805, 0.4, 0.055, 0.07, ry, `${seed}:abBeadUp`, wood);
    Slab(sink, "WoodDoor", At(dU - 0.2, dLz - 0.04), 0.805, 0.4, 0.055, 0.12, ry, `${seed}:abBeadLo`, wood);
    Slab(sink, "WoodDoor", At(dU + 0.34, dLz - 0.05), 0.79, 0.27, 0.06, 0.34, ry, `${seed}:ledger`, wood);
  }
  const sU = dU, sLz = backLz + 0.8;
  Slab(sink, "WoodDoor", At(sU, sLz), 0.47, 0.5, 0.09, 0.34, ry, `${seed}:stoolTop`, wood);
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", At(sU + s * 0.18, sLz), 0.22, 0.08, 0.44, 0.26, ry, `${seed}:stoolLeg${s}`, wood);
  }
  const sp = At(sU, sLz);
  sink.Solid(sp.x, 0.235, sp.z, 0.27, 0.235, 0.19, "furniture", ry);

  // --- 门内的两件小东西：卸下来的两块门板靠在墙根，门边一条候客的板凳 ---
  if (intact) {
    for (let i = 0; i < 2; i += 1) {
      Slab(sink, "WoodDoor", At(0.62 + i * 0.42, innerFace - 0.16 - i * 0.07), 1.36,
        panelW / SHOP.boards - 0.03, 2.6, 0.09, ry, `${seed}:offBoard${i}`,
        { tile: TILE_METERS.wood, rz: (i === 0 ? 1 : -1) * 0.045 });
    }
  }
  const bU = -(uHalf - 0.28), bLz = innerFace - 0.55;
  Slab(sink, "WoodDoor", At(bU, bLz), 0.48, 0.34, 0.1, 0.75, ry, `${seed}:benchTop`, wood);
  for (const s of [-1, 1]) {
    Slab(sink, "WoodBeam", At(bU, bLz + s * 0.28), 0.23, 0.24, 0.46, 0.09, ry, `${seed}:benchLeg${s}`, wood);
  }
  const bp = At(bU, bLz);
  sink.Solid(bp.x, 0.24, bp.z, 0.18, 0.24, 0.4, "furniture", ry);

  // --- 幌子杆：内头在店堂里挑在楼栅下，杆身从门洞上沿穿出去 1.9 m 挑到街上。
  // 幌面吊在挑杆**外端的横挑上、偏出门洞一侧** —— 当典那边踩过的坑：
  // 一整幅幌吊在门正中，招牌把它要标的那扇门盖死了。
  const { cx } = ShopOpening(panelW);
  const poleIn = innerFace - 2.2, poleOut = hd + 1.9;
  const poleY = 2.6;
  Slab(sink, "WoodBeam", At(cx, (poleIn + poleOut) / 2), poleY, 0.1, 0.1, poleOut - poleIn, ry,
    `${seed}:hzPole`, wood);
  Slab(sink, "WoodBeam", At(cx, poleIn + 0.12), poleY + 0.36, 0.07, 0.62, 0.07, ry, `${seed}:hzTie`, wood);
  Slab(sink, "WoodBeam", At(cx, innerFace - 0.2), poleY - 0.14, 0.24, 0.14, 0.32, ry, `${seed}:hzBracket`, wood);
  if (ctx.damage < 0.62) {
    Slab(sink, "WoodBeam", At(cx - 0.53, poleOut - 0.06), poleY, 1.06, 0.07, 0.07, ry, `${seed}:hzArm`, wood);
    Slab(sink, "HouseholdCloth", At(cx - 0.99, poleOut - 0.06), 1.98, 0.52, 1.15, 0.05, ry,
      `${seed}:hzBanner`, { tile: TILE_METERS.cloth });
  }
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
  const shopBay = passBay + 1;                                // 门道旁的这一间开成铺面（D5）

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
      // 门匾（D5 改）：**石匾** + 一圈木匾框，位置不动（匾的形制位置就是门额上）。
      //
      // 为什么不是"外移"也不是"靠收檐"：A4 遗留 4 说匾"被腰檐整块挡在阴影里"，
      // 拿同一机位量了两版（scratchpad/D5_FreeCam.mjs 的 D5_Guild_Plaque 探针）——
      // 腰檐挑出 1.6 与 1.0，匾面平均亮度**都是 88.9**：这面墙这一档太阳根本不投挑檐影，
      // 那条诊断不成立。匾读不出来是**对比度**：木匾 88.9，同高度旁边的青砖 119.4，
      // 而门道那一圈（木柱、排门板、木过梁）全是同一族木色，匾就陷在里头。
      // 会馆/公所的门额本来就常嵌石匾 —— 换石头 + 深色匾框之后匾面 185.1，
      // 比青砖亮出一档，从街上一眼跳出来。（数与机位见 WP_D5 报告第二节。）
      const plaqueW = panelW * 1.35, plaqueH = 0.86;
      Slab(sink, "Stone", S.At(lx, hd + 0.12), 3.02, plaqueW, plaqueH, 0.14, ry,
        `${seed}:plaque`, { tile: TILE_METERS.stone });
      for (const s of [-1, 1]) {
        Slab(sink, "WoodBeam", S.At(lx, hd + 0.17), 3.02 + s * (plaqueH / 2 + 0.05),
          plaqueW + 0.2, 0.1, 0.1, ry, `${seed}:plqH${s}`, { tile: TILE_METERS.wood });
        Slab(sink, "WoodBeam", S.At(lx + s * (plaqueW / 2 + 0.05), hd + 0.17), 3.02,
          0.1, plaqueH + 0.2, 0.1, ry, `${seed}:plqV${s}`, { tile: TILE_METERS.wood });
      }
      AddDoorReveal(sink, {
        x: lintel.x, z: lintel.z, ry, openW: passHalf * 2, openH: 3.0,
        depth: frontD + 0.6, seed: `${seed}:passRv`,
      });
      continue;
    }
    if (b === shopBay) {
      // 门道旁的这一间是"卸了两块板的铺面"：前脸自己一套（无槛墙、门头改亮子），
      // 碰撞分段留门洞，内部另由 AddShopRoom 砌
      const g = { lx, bayW, panelW, floor1, hd };
      AddShopFront(sink, S, ry, seed, ctx, g);
      AddShopRoom(sink, S, ry, seed, ctx, g);
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
  //
  // 【D5 改】挑出 1.6 → **1.0 m**（A4 遗留 4 的二选一，选的是"收檐"不是"外移匾"）。
  // 理由：门匾的形制位置就是门额上、檐子底下，把匾外移到檐口线就从"匾"变成了
  // "挑出来的招牌"，那是另一种构件（当典门口那两根幌杆才是招牌）；而 1.0 m 出檐
  // 仍是民居出檐 0.45 的两倍多，腰檐那条横线该读得出来的照旧读得出来，
  // 门口那一档进深阴影也不再把整个铺面口糊死。
  // **但要说清楚：收檐并没有让匾变亮**（两版实测都是 88.9）——
  // 匾真正的毛病与它无关，见下面 plaque 那一段的注。
  for (let i = 0; i <= 4; i += 1) {
    const lx = -hw + (f.w / 4) * i;
    Slab(sink, "WoodBeam", S.At(lx, hd + 0.16), floor1 + 0.12, 0.16, 0.16, 0.82, ry,
      `${seed}:brk${i}`, { tile: TILE_METERS.wood });
  }
  Slab(sink, tileMat, S.At(0, hd + 0.32), floor1 + 0.42, f.w + 0.5, 0.12, 1.0, ry,
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
  // 二层整墙横跨门道上方：碰撞盒抬到 3.45 m 以上，人从楼下穿堂走过去。
  // 4.45—5.75 那一条是**真的没砌砖**（槛墙与檐下墙之间只有几根木棂），
  // 所以碰撞也要在墩子之间让开 —— 不然从街上朝二层窗扔手榴弹会弹回来。
  {
    const winY0 = 4.45, winY1 = 5.75, pierW = 0.85;
    const wins = [];
    let cur = -hw;
    for (let i = 1; i < bays; i += 1) {
      const a = -hw + bayW * i - pierW / 2;
      if (a > cur) wins.push({ c: (cur + a) / 2, w: a - cur, y0: winY0, y1: winY1 });
      cur = -hw + bayW * i + pierW / 2;
    }
    if (hw > cur) wins.push({ c: (cur + hw) / 2, w: hw - cur, y0: winY0, y1: winY1 });
    const up = S.At(0, face);
    SolidWithOpenings(sink, {
      x: up.x, z: up.z, ry, length: f.w,
      y0: floor1, y1: eave2, thickness: 0.48, openings: wins,
    });
  }

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
  //
  // 三版了，记一下每一版死在哪，别再回头：
  //   v1  0.13×0.24 / 0.75 m 一片 —— 十几米外读成城墙垛口（当铺墙上长出雉堞，完全另一种建筑）；
  //   v2  0.09×0.18×0.34 / 0.5 m 一片 —— 不再是垛口，但 12 m 内仍读成一排"小方块"：
  //       毛病在**厚**（0.09 的方棱在近处就是块砖）和**齐**（全部竖直、全部同向、等距）；
  //   v3（本版）压扁 0.09→0.045、放矮 0.17—0.24→0.10—0.20、明显斜置（|rz| 0.35—0.85 而不是
  //       ±0.45 的小抖动）、再给每片一个 ±0.35 rad 的偏航，让它不与压顶平行；
  //       间距从等距 0.5 改成 0.44—0.66 抽签 + 12% 空位。
  //       "碎瓷"的读图信号是**参差的薄片反光**，不是密排的小体块。
  // 减面：片数 92 → 72（-22%，1104 → 864 三角，scratchpad/D5_Shards.mjs 实测）。
  // 不上 instancing（这一面墙就一处，
  // 一只 InstancedMesh 反而多一个 draw call），也不动共享的 MakeBox / 材质表。
  const Shard = (p, w, h, d, s, opts) => {
    sink.Add("Stone", PlaceGeometry(MakeBox(w, h, d, TILE_METERS.stone, s),
      { x: p.x, y: wallH + 0.05 + h / 2, z: p.z, ry: ry + (rnd() - 0.5) * 0.7, ...opts }));
  };
  if (ctx.damage < 0.4) {
    for (let lx = -hw + 0.4; lx <= hw - 0.4; lx += 0.44 + rnd() * 0.22) {
      if (Math.abs(lx) < gateOpen / 2 + 0.4) continue;
      if (rnd() < 0.12) continue;                       // 空位：压顶上的碎瓷本来就不连续
      const lean = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.5);
      Shard(S.At(lx, hd), 0.045, 0.10 + rnd() * 0.10, 0.26, `${seed}:shard${lx.toFixed(2)}`,
        { rz: lean });
    }
    for (const side of [-1, 1]) {
      for (let lz = hd - 0.5; lz > hd - 8.4; lz -= 0.44 + rnd() * 0.22) {
        if (rnd() < 0.12) continue;
        const lean = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.5);
        Shard(S.At(side * hw, lz), 0.26, 0.10 + rnd() * 0.10, 0.045,
          `${seed}:shard${side}${lz.toFixed(2)}`, { rx: lean });
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
