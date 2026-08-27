// 围墙规划层：把一条中心线变成「一串实例化墙段模块」的摆位计划。**纯数学，
// 不 import three** —— 与 Script_RoadPath 同一条纪律，纯 Node 回归
// （Script_WallPlanTest）不起浏览器逐数验它。几何与实例化在 Script_WallSpline。
//
// ## 为什么围墙也走样条
// 此前全项目「沿线布墙」是四份互抄的一次性循环（AddZhaiWall / NorthSuburb
// 私有 Stockade / outfield 干垒石墙内联 / AddVillageCourtyard），三种贴地写法
// （标量 baseY / 逐段 OuterHeight / 逐段 groundAt）、三套缺口坐标系（局部 at /
// 沿线区间 / 边键名）。收拢成：中心线（Script_RoadPath，围墙默认**折线**不平滑
// —— 院墙要的是直角，不是圆角）→ 缺口先挖后分段（Station 的账）→ 逐模块贴地
// → 输出矩阵表交给 InstancedMesh。
//
// ## 贴地口径
// 每模块三点采地（两端 + 中心）：模块顶 = 中心地高 + 本模块高，模块底 =
// 三点最低 - embed（北关坝墙的账：相邻两段各自采地高，不多埋半米就在墙脚
// 漏缝）。碰撞盒照旧从中心地高起 —— 埋进土里的部分只是画面。
//
// ## 随机参数（减少重复感的六路，全部确定性）
//   1. 低频高度包络（heightCell 一档线性混合）+ 逐模块小抖 —— 土墙顶参差
//   2. 逐模块变体挑选（variants 份预烘几何，顶檐各不一样）
//   3. 逐模块侧倾 lean / 偏航 yaw / 横向错位 side —— 老墙不站直
//   4. 随机塌段 collapse（压扁 + 摊宽，碰撞跟着矮）与随机破口 randomBreaches
//      （高度按 0.10+0.90·t^1.5 剖面塌下去，与旧寨墙同一条曲线）
//   5. 逐实例色调 tint（InstancedMesh.instanceColor，亮度 ± 冷暖微差）
//   6. 模块随机性按「沿线弧长哈希」取种 —— 改缺口/改参数不重掷整条墙
//
// ## 拼接口径（moduleLen / moduleOverlap）
// 一条 run 先按 `round(runLen / moduleLen)` 等分成 n 段，**实际步距 = runLen/n**
// （所以 moduleLen 是"标称间隔"，不是硬步距 —— 端头不许留半截）。每个模块再按
// `1 + moduleOverlap` 拉长，让相邻两块**互相压进去一点**：不叠这一点，模块之间
// 在斜光下会读出一道道竖缝（旧 AddWall 里那个写死的 1.03 是同一笔账）。
// 编辑器「场景样条PCG → 拼接资产」把这两个数连同拼缝一起画出来。
//
// ## 缺口坐标系（唯一口径）
// gaps / breaches 一律世界坐标 `{ at:[x,z], width }`（内部用 ClosestS 换算弧长；
// 也认 `{ s, width }` 与 `[s0,s1]`）。三套旧写法到此为止。

import { MakeRoadPath, GapsToRuns } from "./Script_RoadPath.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";

/** gaps/breaches 的三种写法统一成 { s, width }。 */
function NormalizeAt(path, item) {
  if (Array.isArray(item)) {
    const [a, b] = item;
    return { s: (a + b) / 2, width: Math.abs(b - a) };
  }
  const s = item.s ?? (item.at ? path.ClosestS(item.at[0], item.at[1]) : 0);
  return { s, width: item.width ?? 0 };
}

/**
 * 规划一条围墙。
 *
 * @param {object} opts
 *   points        中心线控制点 [[x,z],...]（世界坐标）
 *   closed        闭环（院墙一圈）。闭环在每个控制点处按直角断开分段，
 *                 端模块各向角点加长半个墙厚 —— 两面墙在角上互搭，外角不留豁口
 *   smooth        true 走向心 Catmull-Rom（蜿蜒土圩用），默认折线（直角院墙）
 *   height        墙高（米，地面以上）
 *   topWidth / baseWidth  顶宽 / 底宽（米）
 *   moduleLen     模块标称长（米，默认 3.0）；实际按整除弦长缩放
 *   moduleOverlap 相邻模块互相压进去的比例（默认 0.02）——拼缝不许露
 *   groundAt      (x,z) => 地面标高。**必须传宿主那一份**
 *   seed          随机种子
 *   gaps          穿墙缺口（寨门/圩门等，模块整个跳过）
 *   breaches      破口（高度剖面塌下去，留残根）
 *   randomBreaches  { count, widthMin, widthMax, margin=24, avoidGapMargin=14 }
 *                 按种子撒的破口，避开 gaps —— 北关坝墙的三处塌口
 *   collapseChance  逐模块塌段概率（压扁摊宽，不开洞）—— 石墙村的 18%
 *   edgeCollapseChance  闭环专用：整边塌成瓦砾线的概率（模块不生成，
 *                 记进 fallenRuns 由调用方摆瓦砾）—— 村院墙的 16%
 *   damage        战损档（压低整体高度，北关坝墙 ctx.damage）
 *   ruin          残破度 0—1：逐模块从墙头咬掉一口，**一段的两端咬得最狠**，
 *                 旧 AddWall 逐切片 bite 的原样搬运（城内院墙那一路的"残墙"）
 *   colliderMerge 把相邻等高模块并成一只碰撞盒的高差容差（米，0 = 不并）。
 *                 城内几百圈院墙逐模块登记会把碰撞表翻十倍
 *   inRegion      (x,z)=>bool 切片过滤（模块级）
 *   embed         往地里埋多深（默认 0.5，坝墙的账）
 *   heightJitter / heightCell   高度抖动比例 / 低频档长
 *   leanJitter / yawJitter / sideJitter   侧倾（rad）/ 偏航（rad）/ 横向错位（米）
 *   thickJitter   厚度抖动比例
 *   tintJitter    逐实例亮度抖动比例（另叠 1/3 强度的冷暖差）
 *   variants      几何变体数（Script_WallSpline 按同一个数烘几何）
 *   coverEvery    每几个模块插一个掩体点（坝墙的账：逐段插会灌满掩体表）
 *   coverMinH     低于 height×此比例的残段不给碰撞/掩体（人直接跨过去）
 *   coverSign     掩体朝向：+1 = 路径法向 n=(tz,-tx)，-1 = 反向
 *   tag           碰撞 tag（决定破坏 profile，见 Data_Destruction.TAG_PROFILE）
 *
 * @returns {{ path, modules, colliders, covers, fallenRuns, stats }}
 *   modules   [{ s, x, z, y, yaw, roll, sx, sy, sz, variant, tint:[r,g,b],
 *               topY, visH, collapsed }]（y/sx… 已按标称几何算好，直接 compose）
 *   colliders [{ x, y, z, hx, hy, hz, ry }]
 *   covers    [{ x, z, h, fx, fz }]（h = 离地掩体高）
 *   fallenRuns [{ x, z, ry, len }]（塌成瓦砾线的整边）
 */
export function PlanWallRoute({
  points, closed = false, smooth = false,
  height, topWidth = 0.4, baseWidth = 0.9,
  moduleLen = 3.0, moduleOverlap = 0.02, groundAt, seed = "wall",
  gaps = [], breaches = [], randomBreaches = null,
  collapseChance = 0, edgeCollapseChance = 0, damage = 0, ruin = 0,
  colliderMerge = 0,
  inRegion = null, embed = 0.5,
  heightJitter = 0.10, heightCell = 18,
  leanJitter = 0.020, yawJitter = 0.010, sideJitter = 0.06,
  thickJitter = 0.08, tintJitter = 0.06,
  variants = 4, coverEvery = 3, coverMinH = 0.55, coverSign = 1,
}) {
  const pts = closed ? [...points, points[0]] : points;
  const path = MakeRoadPath(pts, { subdivisions: smooth ? 16 : 1 });

  // 闭环的角点弧长（折线下控制点正好落在弧长表上）：分段边界 + 端模块加长
  const cornerS = [];
  if (closed && !smooth) {
    let s = 0;
    for (let i = 1; i < pts.length - 1; i += 1) {
      s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cornerS.push(s);
    }
  }

  const gapRuns = gaps.map((g) => {
    const { s, width } = NormalizeAt(path, g);
    return [s - width / 2, s + width / 2];
  });
  const allBreaches = breaches.map((b) => NormalizeAt(path, b));
  if (randomBreaches) {
    const rb = randomBreaches;
    const rnd = Mulberry32(HashString(`${seed}:breach`));
    const margin = rb.margin ?? 24;
    const avoid = rb.avoidGapMargin ?? 14;
    for (let i = 0; i < (rb.count ?? 3); i += 1) {
      for (let tries = 0; tries < 12; tries += 1) {
        const s = margin + rnd() * Math.max(1, path.length - margin * 2);
        const width = (rb.widthMin ?? 9) + rnd() * ((rb.widthMax ?? 16) - (rb.widthMin ?? 9));
        if (gapRuns.some(([a, b]) => s > a - avoid && s < b + avoid)) continue;
        allBreaches.push({ s, width });
        break;
      }
    }
  }

  // 缺口先挖后分段（Station 的账），闭环再按角点切边
  let runs = GapsToRuns(path.length, gapRuns);
  if (cornerS.length) {
    const split = [];
    for (const [a, b] of runs) {
      let cursor = a;
      for (const c of cornerS) {
        if (c > cursor + 0.3 && c < b - 0.3) { split.push([cursor, c]); cursor = c; }
      }
      split.push([cursor, b]);
    }
    runs = split;
  }
  const IsCorner = (s) => (closed && !smooth)
    && (s < 0.01 || s > path.length - 0.01 || cornerS.some((c) => Math.abs(c - s) < 0.01));

  // 低频高度包络：heightCell 一档线性混合（逐模块独立抖会变成锯齿顶）
  const envJitters = [];
  const envRnd = Mulberry32(HashString(`${seed}:env`));
  const EnvAt = (s) => {
    const cell = Math.floor(s / heightCell);
    while (envJitters.length <= cell + 1) envJitters.push((envRnd() - 0.5) * 2);
    const w = s / heightCell - cell;
    return envJitters[cell] * (1 - w) + envJitters[cell + 1] * w;
  };

  const nominalH = height + embed;
  const thickness = (topWidth + baseWidth) / 2;
  const modules = [];
  const colliders = [];
  const covers = [];
  const fallenRuns = [];
  let coverTick = 0;
  let edgeIndex = 0;

  for (const [a, b] of runs) {
    edgeIndex += 1;
    const runLen = b - a;
    if (runLen < 0.4) continue;
    // 整边塌成瓦砾线（村院墙）：模块不生成，位置交还调用方摆瓦砾
    if (edgeCollapseChance > 0) {
      const edgeRnd = Mulberry32(HashString(`${seed}:edge${edgeIndex}:${Math.round(a * 4)}`));
      if (edgeRnd() < edgeCollapseChance) {
        const pm = path.At((a + b) / 2);
        fallenRuns.push({
          x: pm.x, z: pm.z, ry: Math.atan2(-pm.tz, pm.tx), len: runLen,
        });
        continue;
      }
    }
    const n = Math.max(1, Math.round(runLen / moduleLen));
    const mlen = runLen / n;
    // 本条 run 的碰撞候选：colliderMerge > 0 时在 run 结束后并成长盒
    const runSolids = [];
    for (let i = 0; i < n; i += 1) {
      const s0 = a + mlen * i;
      const s1 = s0 + mlen;
      const sc = (s0 + s1) / 2;
      const pc = path.At(sc);
      if (inRegion && !inRegion(pc.x, pc.z)) continue;
      // 模块随机性按弧长哈希取种：改缺口/改参数不重掷整条墙
      const rnd = Mulberry32(HashString(`${seed}:m${Math.round(sc * 4)}`));

      let visH = height * Math.max(0.4,
        1 + EnvAt(sc) * heightJitter + (rnd() - 0.5) * heightJitter * 0.6 - damage * 0.06);
      // 残破：从墙头咬掉一口。**一段 run 的两端咬得最狠、中段留得最高**
      // （edge 在两端为 0、中段为 1，bite ×(1-0.4·edge)）—— 这是旧 AddWall
      // 逐切片 bite 的原样搬运，城内那几百圈院墙的"残墙"读感就是这么来的：
      // 塌的是墙角与门口那一带，中间那截还立着。别按直觉把它反过来。
      // 光靠 damage 压高度只会整条一起矮，读成"矮墙"而不是"残墙"。
      if (ruin > 0) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const edge = Math.min(t, 1 - t) * 2;
        const bite = ruin * (0.3 + 0.7 * rnd()) * (1 - edge * 0.4);
        visH = Math.max(0.18, visH * (1 - bite));
      }
      for (const br of allBreaches) {
        const d = Math.abs(sc - br.s);
        if (d < br.width / 2) {
          visH = Math.min(visH, height * (0.10 + 0.90 * Math.pow(d / (br.width / 2), 1.5)));
        }
      }
      const collapsed = collapseChance > 0 && rnd() < collapseChance;
      let sxSpread = 1, szSpread = 1 + (rnd() - 0.5) * thickJitter * 2;
      if (collapsed) {
        visH = Math.min(visH, height * (0.30 + rnd() * 0.22));
        sxSpread = 1.06;
        szSpread *= 1.45 + rnd() * 0.5;
      }

      // 三点采地：顶从中心地高起，底压到三点最低再埋 embed
      const p0 = path.At(s0);
      const p1 = path.At(s1);
      const g0 = groundAt(p0.x, p0.z);
      const g1 = groundAt(p1.x, p1.z);
      const gc = groundAt(pc.x, pc.z);
      const topY = gc + visH;
      const bottomY = Math.min(g0, g1, gc) - embed;
      const hh = topY - bottomY;

      // 闭环角点：端模块向角点加长半个墙厚，两面墙在角上互搭
      let ext0 = 0, ext1 = 0;
      if (i === 0 && IsCorner(s0)) ext0 = baseWidth / 2;
      if (i === n - 1 && IsCorner(s1)) ext1 = baseWidth / 2;
      const drawLen = mlen + ext0 + ext1;
      const shift = (ext1 - ext0) / 2;

      const nx = pc.tz, nz = -pc.tx;
      const side = (rnd() - 0.5) * sideJitter * 2;
      const yaw = Math.atan2(-pc.tz, pc.tx) + (rnd() - 0.5) * yawJitter * 2;
      const roll = (rnd() - 0.5) * leanJitter * 2;
      const tintBase = 1 + (rnd() - 0.5) * tintJitter * 2;
      const warm = (rnd() - 0.5) * tintJitter * 0.66;

      // 长度缩放拆成两笔：lenS 是「弦长 + 拼接重叠」，sxSpread 是塌段摊开。
      // 压顶/碱脚的实例只吃 lenS —— 它们不跟着塌段摊宽（那是墙身的事）。
      const lenS = (drawLen * (1 + moduleOverlap)) / moduleLen;
      modules.push({
        s: sc,
        x: pc.x + pc.tx * shift + nx * side,
        z: pc.z + pc.tz * shift + nz * side,
        y: bottomY + hh / 2,
        yaw, roll,
        sx: lenS * sxSpread, sy: hh / nominalH, sz: szSpread,
        lenS, drawLen,
        variant: Math.floor(rnd() * variants) % variants,
        tint: [tintBase * (1 + warm), tintBase, tintBase * (1 - warm)],
        gy: gc, topY, visH, collapsed,
      });

      if (visH > height * coverMinH) {
        runSolids.push({
          s0, s1, x: pc.x, z: pc.z, y: gc + visH / 2, visH,
          hx: mlen / 2, hz: (baseWidth / 2) * (collapsed ? szSpread : 1),
          ry: Math.atan2(-pc.tz, pc.tx),
        });
        if (coverTick % coverEvery === 0) {
          // h 是离地掩体高（AI 的 FindCover 按 min(height,1.4) 打分），不是绝对高程
          covers.push({ x: pc.x, z: pc.z, h: visH, fx: nx * coverSign, fz: nz * coverSign });
        }
        coverTick += 1;
      }
    }
    // 碰撞并段：折线 run 是直的，相邻等高模块并成一只长盒。
    // 城内几百圈院墙逐模块登记会把碰撞表从千位翻到万位（Rapier 建体 + 导航位图
    // + AI 粗筛都按盒数走），并段后与旧 AddWall「一面墙一只盒」同量级。
    if (colliderMerge > 0 && !smooth) {
      let group = null;
      const FlushGroup = () => {
        if (!group) return;
        const sm = (group.sA + group.sB) / 2;
        const pm = path.At(sm);
        colliders.push({
          x: pm.x, y: group.gy + group.visH / 2, z: pm.z,
          hx: (group.sB - group.sA) / 2, hy: group.visH / 2, hz: group.hz,
          ry: Math.atan2(-pm.tz, pm.tx),
        });
        group = null;
      };
      for (const c of runSolids) {
        if (group && Math.abs(c.visH - group.visH) <= colliderMerge
          && Math.abs(c.s0 - group.sB) < 0.05) {
          group.sB = c.s1;
          group.visH = Math.min(group.visH, c.visH);   // 并段取矮的：不许凭空长出挡墙
          group.hz = Math.max(group.hz, c.hz);
          group.gy = Math.min(group.gy, c.y - c.visH / 2);
          continue;
        }
        FlushGroup();
        group = {
          sA: c.s0, sB: c.s1, visH: c.visH, hz: c.hz, gy: c.y - c.visH / 2,
        };
      }
      FlushGroup();
    } else {
      for (const c of runSolids) {
        colliders.push({
          x: c.x, y: c.y, z: c.z, hx: c.hx, hy: c.visH / 2, hz: c.hz, ry: c.ry,
        });
      }
    }
  }

  return {
    path, modules, colliders, covers, fallenRuns,
    stats: {
      length: path.length,
      modules: modules.length,
      colliders: colliders.length,
      covers: covers.length,
      collapsed: modules.filter((m) => m.collapsed).length,
      fallen: fallenRuns.length,
      breaches: allBreaches.length,
    },
    nominal: {
      moduleLen, moduleOverlap, height: nominalH, thickness,
      topWidth, baseWidth, embed,
    },
  };
}

export default PlanWallRoute;
