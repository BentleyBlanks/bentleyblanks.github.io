// Data_Traversal.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { TRAVERSAL } from "./Data_Traversal.mjs";

const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 这么高的东西，用哪个动词过去。
 * @param {number} riseM 顶面高出脚底多少米
 * @returns {"step"|"vault"|"mantle"|"blocked"}
 */
export function TraversalKind(riseM) {
  if (riseM < TRAVERSAL.vaultMin) return "step";        // 含负数：那不是障碍
  if (riseM <= TRAVERSAL.vaultMax) return "vault";
  if (riseM <= TRAVERSAL.mantleMax) return "mantle";
  return "blocked";
}

/**
 * 一次通行动作的全部参数。不可通过时返回 null —— 调用方据此拒绝。
 * @param {number} riseM 顶面高出脚底多少米
 */
export function TraversalPlan(riseM) {
  const kind = TraversalKind(riseM);
  if (kind === "step" || kind === "blocked") return null;
  const mantle = kind === "mantle";
  const over = Math.max(0, riseM - (mantle ? TRAVERSAL.vaultMax : TRAVERSAL.vaultMin));
  return {
    kind,
    duration: (mantle ? TRAVERSAL.mantleBaseS : TRAVERSAL.vaultBaseS)
      + over * (mantle ? TRAVERSAL.mantlePerMeterS : TRAVERSAL.vaultPerMeterS),
    reach: mantle ? TRAVERSAL.mantleReachM : TRAVERSAL.vaultReachM,
    apexOver: mantle ? TRAVERSAL.mantleApexOverM : TRAVERSAL.vaultApexOverM,
    stamina: mantle ? TRAVERSAL.mantleStamina : TRAVERSAL.vaultStamina,
    dip: mantle ? TRAVERSAL.mantleDipRad : TRAVERSAL.vaultDipRad,
  };
}

/**
 * 位移曲线。给 0—1 的进度，返回三个 0—1 的系数：
 *   h    水平走了几成（from → to）
 *   up   从起点爬到顶点走了几成
 *   down 从顶点落到落点走了几成
 * 位置由调用方合成：`y = from + (apex-from)*up - (apex-to)*down`，
 * 于是 k=0 在起点、k=1 精确落在落点，中间不会有半米的对不齐。
 *
 * 为什么不是一条正弦：正弦的上下是对称的，而且水平与竖直同时匀速推进 ——
 * 读出来就是"人沿着一条抛物线飘过去"，也就是用户说的**没有重力**。
 * 攀爬要的是另一件事：先原地长身子（前 58% 只上升几乎不前进），
 * 重心过了墙头再迈过去，落下的那一段是加速的。
 */
export function TraversalCurve(kind, k01) {
  const k = Clamp01(k01);
  const mantle = kind === "mantle";
  const kUp = mantle ? 0.58 : 0.5;
  const up = Clamp01(k / kUp);
  const down = k <= kUp ? 0 : Clamp01((k - kUp) / (1 - kUp));
  const h = mantle ? Clamp01((k - 0.32) / 0.68) : k;
  return {
    // 攀爬的水平位移走 smoothstep：起步慢（人还贴在墙上），末段慢（落稳）
    h: mantle ? h * h * (3 - 2 * h) : h,
    // 上行 ease-out：蹬地/引体那一下最快，越接近墙头越慢
    up: mantle ? 1 - (1 - up) * (1 - up) : Math.sin(up * Math.PI * 0.5),
    // 下行 ease-in：重心过去之后是**掉**下去的，不是飘下去
    down: down * down,
  };
}

/** 起点→落点这条线（横向留一点容差）到底有没有**穿过**这只盒。2D slab。 */
function SegmentCrossesBox(fromX, fromZ, toX, toZ, box, tol) {
  let t0 = 0, t1 = 1;
  for (const [d, lo, hi] of [
    [toX - fromX, box.min[0] - tol - fromX, box.max[0] + tol - fromX],
    [toZ - fromZ, box.min[2] - tol - fromZ, box.max[2] + tol - fromZ],
  ]) {
    if (Math.abs(d) < 1e-9) { if (lo > 0 || hi < 0) return false; continue; }
    const a = Math.min(lo / d, hi / d), b = Math.max(lo / d, hi / d);
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * **翻过去以后站得住吗。** 玩家（`Script_Player.TryVault`）与 AI（`Script_Ai.TryVault`）
 * 读同一份 —— 两边各写各的落点判据，就会出现"玩家过得去、AI 过不去"那类单方面作弊。
 *
 * 三问，一问也不能少（三条都是军列车厢那一批"起跳会飞起来"逼出来的）：
 *
 *   1. **脚底踩的是什么。** 只有**盖住落点**、而且**顶面容得下一个人**（两个方向都
 *      不窄于 2×半径）的顶面才算地面。旧判据是"半径蹭到就算"，于是车厢挡板那条
 *      0.2 m 厚的板沿成了脚下的地面 —— 人被放到板顶上，比车厢地板高 1.4 m。
 *   2. **落点这一格里还有没有支棱着的东西。** 半个身位内比落脚面还高出一级台阶的，
 *      落下去只会骑在它身上（车厢头尾按空格时，落点正好落在隔壁车厢的挡板边上）。
 *      刚翻过去的那件除外 —— 人正是从它上面过来的，厚墙的盒子伸进落点那一格是应当的。
 *   3. **人到底越过去了没有。** 要翻的那件东西必须真的被"起点→落点"这条线穿过。
 *      前方探测按半径 r 的光晕收东西，于是**贴着墙走**时旁边那堵墙也会被当成
 *      "前面有个能爬的东西"：按空格，人沿着墙腾空一米四再落回原地 —— 那不是翻越，
 *      是被墙抬了一下。车厢里贴着挡板按空格就是这样飞起来的。
 *
 * @param {Iterable<{min:number[],max:number[]}>} boxes 落点附近的碰撞盒
 * @param {{x:number,z:number}} from 起跳点
 * @param {{x:number,z:number}} to 落点
 * @param {number} groundY 落点的解析地面高度（碰撞盒之外的兜底）
 * @param {number} ceilingY 高到这儿以上就不是落脚面，是"墙那边还是墙"
 * @param {number} radius 人的半径
 * @param {Set|null} climbed 正在翻越的那几只盒
 * @returns {number|null} 落脚高度；站不住时 null
 */
export function TraversalLanding(boxes, from, to, groundY, ceilingY, radius, climbed = null) {
  const x = to.x, z = to.z;
  let y = groundY;
  const wide = radius * 2;
  for (const box of boxes) {
    if (x < box.min[0] || x > box.max[0] || z < box.min[2] || z > box.max[2]) continue;
    if (box.max[1] > ceilingY) return null;
    if (box.max[1] <= y) continue;
    if (box.max[0] - box.min[0] < wide || box.max[2] - box.min[2] < wide) continue;
    y = box.max[1];
  }
  for (const box of boxes) {
    if (climbed && climbed.has(box)) continue;
    if (x + radius < box.min[0] || x - radius > box.max[0]) continue;
    if (z + radius < box.min[2] || z - radius > box.max[2]) continue;
    if (box.max[1] > y + TRAVERSAL.stepMax) return null;
  }
  if (climbed) {
    let crossed = false;
    for (const box of climbed) {
      if (SegmentCrossesBox(from.x, from.z, x, z, box, TRAVERSAL.crossToleranceM)) { crossed = true; break; }
    }
    if (!crossed) return null;
  }
  return y;
}
