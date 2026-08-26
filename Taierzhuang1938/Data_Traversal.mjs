// 《滕县 一九三八》**通行高度阶梯** —— 纯数据，不许 import three。
//
// 这张表回答一句话：**眼前这个东西有多高，我能不能过去、怎么过去。**
// 玩家、AI、物理层的自动抬腿，三边必须读同一张表 —— 在这份文件之前它们各写各的
// （玩家 0.60/2.25、AI 0.56/2.25、物理 autostep 0.55），改一处另外两处不跟，
// 于是出现过「玩家翻得过去、追他的 AI 翻不过去」这种单方面作弊。
//
// ## 阶梯（人站立 1.78 m、眼高 1.62 m；高度一律相对**脚底**）
//
//   ≤ stepMax            自动跨过    没有动作，走过去就上去了（门槛、瓦砾、马道每级）
//   vaultMin … vaultMax  翻越 vault  腰高，一步跨过去，快（窗台、街垒、矮墙）
//   vaultMax … mantleMax 攀上 mantle 胸高到肩高，撑着上去，慢（院墙、垛口）
//   > mantleMax          **不可通过** 必须绕门洞、找梯子、上马道
//
// ## 数从哪来（3A 最常见的那一档）
//
// 这四档是主流 3A 的白盒标准，不是拍脑袋：以 1.8 m 的人为尺，
//   · 自动跨过 ≈ 膝高。虚幻默认 `MaxStepHeight = 45 cm`，业内白盒普遍取 0.4—0.5 m。
//     我们取 0.55 —— 城墙马道每级踏面高 0.46 m，卡在 0.45 会上不去（实测过）。
//   · 翻越 ≈ 腰高，1.2 m 封顶。使命召唤 / 战地那一档「一步跨过去」的窗台与矮墙。
//   · 攀上 ≈ 抬手够得着墙头，2.0 m 封顶。人举手指尖约 2.2 m，扒住墙头要 2.0 m 上下；
//     再高就不是"扒"，是撑杆跳。
//   · 2.0 m 以上一律不可通过 —— 这是**关卡设计的承诺**：设计师把墙砌到 2.0 m 以上，
//     就等于宣告"这条路封死"，玩家不该有任何办法从这儿过去。
//
// 上一版把攀爬上限放到 2.25 m，理由是这座城的院墙是 2.0—2.5 m（`Script_World` 的
// 形制注释），2.25 能让一半以上的院墙进得去。代价是玩家按一下空格就无重力地升起
// 2.5 m —— 用户的原话是「靠近墙壁跳跃的高度非常高，像是没有重力」。
// 按 3A 标准封回 2.0 m 之后：2.0 m 那一档院墙擦边能上，2.1—2.5 m 的院墙从"能翻"
// 变成"必须走门洞" —— 那是对的，墙高一点就该翻不过去。
//
// ## 跳跃在这张表里的位置
//
// 跳跃**不是**通行动词。它的净抬高（jumpRiseMax）压在 vaultMin 之下，
// 所以按空格永远是「能翻就翻、能爬就爬、都不行才跳」，跳跃本身跳不上任何
// 该走翻越/攀爬的东西。守着这一条的是 `Script_JumpTest`：
// 空地跳跃抬高 < jumpRiseMax，且贴墙跳不许比空地跳更高。

const Clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 通行高度阶梯。数只写在这里，文档只写常量名。
 * 单位：米 / 秒 / 体力（0—1 的一格）。
 */
export const TRAVERSAL = {
  /** 自动抬腿上限。比这矮的东西不是障碍，角色控制器自己跨过去。 */
  stepMax: 0.55,
  /** 翻越下限。与 stepMax 之间留 0.05 m 的死区，免得同一个坎两个动词抢。 */
  vaultMin: 0.60,
  /** 翻越上限 = 腰高。再高就不是"跨"，得用手撑。 */
  vaultMax: 1.20,
  /** 攀爬上限 = 抬手够得着的墙头。**全游戏的硬顶**：高过它一律不可通过。 */
  mantleMax: 2.00,

  /** 落点离起跳点多远。翻越是"跨过去"，攀爬是"上到墙头"，所以攀爬近一些。 */
  vaultReachM: 1.62,
  mantleReachM: 1.34,

  /** 动作时长：base + 超出下限的每米加成。攀爬慢得多 —— 那是撑上去，不是飘上去。 */
  vaultBaseS: 0.42,
  vaultPerMeterS: 0.14,
  mantleBaseS: 0.85,
  mantlePerMeterS: 0.40,

  /** 顶点比墙头再高多少。翻越是整个人荡过去，攀爬是贴着墙头蹭上去。 */
  vaultApexOverM: 0.30,
  mantleApexOverM: 0.06,

  /** 体力成本。攀爬贵三倍多 —— 连着扒三堵墙就该喘不上气。 */
  vaultStamina: 0.06,
  mantleStamina: 0.20,

  /** 相机下压幅度（弧度）：手撑上墙头那一下人是低着头的。 */
  vaultDipRad: 0.16,
  mantleDipRad: 0.24,

  /**
   * 跳跃净抬高的设计上限。不是跳跃的参数，是**给跳跃划的红线**：
   * 助跑满档也必须低于它，而它必须低于 vaultMin。
   */
  jumpRiseMax: 0.72,
};

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

export default TRAVERSAL;
