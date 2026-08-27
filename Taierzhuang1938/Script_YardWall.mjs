// 院墙一圈 —— 城内街坊 / 机关 / 学校 / 庙 / 当铺 / 村落 LOD 档共用的**唯一**入口。
//
// ## 为什么要有这一层
// 「一圈矩形院墙，临街那面留个门」这件事在本仓库曾经有 **十一份** 近重复实现：
// Script_CityBlockKit.WallRing / SimpleYardWall、Script_Landmark_Commerce.AddYardWall、
// Script_Landmark_Misc.AddYardWall、Script_Landmark_WestSuburb.AddYardWall、
// Script_Landmark_Garrison.AddRunX+AddRunZ、Script_Landmark_Headquarters.Enclosure、
// Script_Landmark_ChurchSchool ×2、Script_Landmark_Temple.AddTempleYard、
// Script_Landmark_Yamen.WallRun。每一份都自己排四条边、自己算门洞两段、
// 自己判撞街、自己登记碰撞与掩体 —— 于是同一个错（门洞两侧段长算错、
// 压顶悬在残墙上方、四角漏一道墙厚的缝）在十一处各犯一次。
//
// 现在它们全部收拢到本文件的 `AddYardWallRing`，几何走
// Script_WallSpline（实例化的样条围墙管线），布设参数走 Script_WallSpline.WALL_PRESETS
// —— 与寨墙/坝墙/石墙村/村院墙同一条管线、同一个编辑器（设置 →「场景样条PCG」）。
//
// ## 局部坐标约定（**唯一**，各调用方按此换算）
//   矩形横跨 lx ∈ [-hw, hw]、lz ∈ [-hd, hd]；**+lz = 临街 / 开门那一面**。
//   边名：`n` = lz=-hd（背街）、`s` = lz=+hd（临街）、`w` = lx=-hw、`e` = lx=+hw。
//   调用方传一个 `frame(lx, lz) -> {x, z}`（或 `[x, z]`）把局部映射到世界，
//   本文件不猜任何人的坐标系 —— 那正是旧版十一份实现最容易错的地方。
//
// ## 与旧 AddWall 版的差别（都是刻意的）
//   · 墙身从「逐 0.85 m 切片合并成静态网格」变成**按分区实例化**：
//     城内 395 格院子 ≈ 三万五千只盒子 → 每分区每变体一次 draw。
//   · 撞街判定从「整面墙一起丢」细到**逐模块**：半条边压街时只丢压街的那几块。
//   · 碱脚 / 压顶各自一只实例网格，压顶跟着**每一块**自己的墙头落。
//   · 碰撞按 `colliderMerge` 并成长盒 —— 逐模块登记会把碰撞表翻十倍。
//   · 实例化材质不吃破口 OBB 裁切（管线级让步，见 docs/Data_WallSpline.md）。

import { BuildWallSpline } from "./Script_WallSpline.mjs";

/**
 * 本文件的局部系 → 世界：ry=0 时 +lx = 世界东、+lz = 世界南（坐北朝南，
 * 门开在 +lz）。与 Script_CityBlockKit.Frame 逐位一致。
 */
export function MakeYardFrame(x, z, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
}

function AsPoint(p) {
  return Array.isArray(p) ? { x: p[0], z: p[1] } : p;
}

/**
 * 世界 → 局部，**从 frame 本身反解**（拿 (0,0)/(1,0)/(0,1) 三点量出两条轴）。
 * 不去猜 ry 的符号：本仓库并存两套局部系（+lz 指南的 MakeFrame 一族、
 * +lz 指北的 SiteFrame 一族），照 ry 硬算会在其中一套上把南北判反。
 */
function MakeInverse(frame) {
  const o = AsPoint(frame(0, 0));
  const ax = AsPoint(frame(1, 0));
  const az = AsPoint(frame(0, 1));
  const ex = { x: ax.x - o.x, z: ax.z - o.z };
  const ez = { x: az.x - o.x, z: az.z - o.z };
  return (wx, wz) => {
    const dx = wx - o.x, dz = wz - o.z;
    return { lx: dx * ex.x + dz * ex.z, lz: dx * ez.x + dz * ez.z };
  };
}

/**
 * 砌一圈院墙。
 *
 * @param sink BuildSink
 * @param {object} o
 *   frame      (lx,lz) => {x,z} | [x,z]，局部→世界。**必传**（见头注坐标约定）。
 *              两条局部轴由本文件从 frame 反解，`+lz` 指南还是指北都认
 *   hw / hd    墙心线的半面宽 / 半进深
 *   preset     Script_WallSpline.WALL_PRESETS 键（cityYardBrick / landmarkYard …）
 *   material   墙身材质名（BrickWall / BrickWallSooty / Adobe / HouseBrick …）
 *   height     墙高（地面以上）
 *   thickness  墙厚（顶底同宽）
 *   seed       随机种子
 *   damage     战损档 0—1（整体压低）
 *   ruin       残破度 0—1（逐模块咬墙头；不给就取 damage×0.8，与旧版同口径）
 *   sides      要砌哪几面，默认四面：{ n, s, w, e }（false = 不砌）
 *   sideRange  某一面只砌一段：{ e:[lz0,lz1] } —— n/s 按 lx 截，w/e 按 lz 截
 *   gates      [{ side="s", offset=0, openW }] —— 门洞按**局部偏移**给
 *   gaps       额外的世界坐标缺口 [{ at:[x,z], width }]
 *   baseY      地面标高（城内是平地，直接给标量）；或
 *   groundAt   (x,z)=>y（城外/坡地）
 *   onStreet   (x,z,hx,hz)=>bool：压街的模块不砌（逐模块判，不是整面丢）
 *   inRegion   (x,z)=>bool：切片过滤
 *   sector     实例桶分区键；不传就沿用 `sink.sector`（与同院其它构件同区）
 *   plinth / cope  覆盖预设的碱脚 / 压顶（null = 不要）
 *   tag        碰撞 tag（默认 wall）
 *   coverSign  掩体朝向 +1/-1（默认 -1 = 朝院外，与旧版临街那面同向）
 *
 * @returns BuildWallSpline 的返回（stats / fallenRuns）
 */
export function AddYardWallRing(sink, o) {
  const {
    frame, hw, hd,
    preset = "cityYardBrick", material = "BrickWall", tag = "wall",
    height = 2.1, thickness = 0.35, seed = "yard",
    damage = 0, ruin = null, sides = null, sideRange = null, gates = [], gaps = [],
    baseY = 0, groundAt = null, onStreet = null, inRegion = null,
    sector = null, name = null, coverSign = -1,
    ...rest
  } = o;
  if (typeof frame !== "function") throw new Error("AddYardWallRing 要一个 frame(lx,lz)");
  const C = (lx, lz) => {
    const p = AsPoint(frame(lx, lz));
    return [p.x, p.z];
  };
  const points = [C(-hw, -hd), C(hw, -hd), C(hw, hd), C(-hw, hd)];
  const Inv = MakeInverse(frame);

  // 门洞：局部偏移 → 世界坐标缺口（缺口口径全项目只有世界坐标这一种）
  const allGaps = [...gaps];
  for (const g of gates) {
    if (!g || !(g.openW > 0)) continue;
    const side = g.side || "s";
    const off = g.offset ?? 0;
    const p = side === "n" ? C(off, -hd)
      : side === "w" ? C(-hw, off)
        : side === "e" ? C(hw, off)
          : C(off, hd);
    allGaps.push({ at: p, width: g.openW });
  }

  // 逐模块过滤：不砌的边 / 压街的段 / 切片外
  const half = thickness / 2;
  const Keep = (x, z) => {
    if (inRegion && !inRegion(x, z)) return false;
    if (sides || sideRange) {
      const { lx, lz } = Inv(x, z);
      // 模块中心离哪条边最近，就算哪条边（角上两条都行，取近的那条）
      const dN = Math.abs(lz + hd), dS = Math.abs(lz - hd);
      const dW = Math.abs(lx + hw), dE = Math.abs(lx - hw);
      const best = Math.min(dN, dS, dW, dE);
      const side = best === dS ? "s" : best === dN ? "n" : best === dW ? "w" : "e";
      if (sides && sides[side] === false) return false;
      const range = sideRange && sideRange[side];
      if (range) {
        // n/s 沿 lx 跑，w/e 沿 lz 跑
        const along = (side === "n" || side === "s") ? lx : lz;
        if (along < range[0] - 0.01 || along > range[1] + 0.01) return false;
      }
    }
    if (onStreet && onStreet(x, z, half, half)) return false;
    return true;
  };

  const Ground = groundAt || (() => baseY);
  return BuildWallSpline(sink, {
    preset,
    name: name || `Yard_${seed}`,
    material, tag,
    points, closed: true,
    height, topWidth: thickness, baseWidth: thickness,
    seed, damage,
    ruin: ruin === null ? damage * 0.8 : ruin,
    gaps: allGaps,
    groundAt: Ground,
    inRegion: Keep,
    coverSign,
    sectorKey: () => (sector !== null ? sector : String(sink.sector || "").replace(/\|$/, "")),
    ...rest,
  });
}

export default AddYardWallRing;
