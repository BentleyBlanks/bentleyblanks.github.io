// Data_Tuning_AiPerception.mjs — 敌军感知模型（`Script_AiPerception.mjs`）的全部数值。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_AiPerception.mjs`，
// 它 `import { PERCEPTION }` 读表，**不把这些数复制成本地常量**（否则热改表不生效、
// 测试读到两个真相 —— docs/Data_TextAndTuning.md §4）。
//
// ── 不在这张表里的 ─────────────────────────────────────────────────────────
//   · 被发现的距离 `SIGHT_BY_STANCE = [120, 80, 45]`（站/蹲/卧）与照明弹倍率
//     `SIGHT_SCALE_RANGE` → `Data_Tuning_Ai.mjs`。感知层**只通过 `host.SightRange(stance)`
//     读它**，照明弹的倍率已经乘在里面了，这一层再乘一次就等于把照明弹调了两遍
//     （`Script_Flare.mjs` 头注写明「倍率由 AiDirector.SetSightScale 统一加」）。
//   · 命中率、压制、部位倍率 → `Data_Battle.COMBAT`；难度档 → `Data_Battle.DIFFICULTY`。
//   · 真正的「露出多少」由射线量，在 `Data_Tuning_AiShooting` / `Script_AiShooting.Exposure`。
//
// ── 这张表回答的三个问题 ───────────────────────────────────────────────────
//   1. 我朝哪儿看、看得见多宽（`fov`）；
//   2. 从「那边好像有人」到「就是他」要多久（`awareness`）；
//   3. 看不见之后我还记得多久、听见的动静算几分（`hearing` / `memory`）；
//   外加一组把 `Script_Ai.Think` 里那段目标锁迟滞原样搬过来的数（`lock`）。

/**
 * 视锥。**警戒级别越高看得越宽**是这一层最值钱的一条：没打起来的时候，
 * 从背后摸过去是真的摸得过去；打起来之后，敌人不会因为你绕到他 100° 就凭空瞎掉。
 *
 * 半角单位是**度**（代码里乘 π/180 转弧度）—— 表里写度是因为「60° 视锥」这句话
 * 人能直接判断对不对，写成 1.047 就只能靠算。
 *
 * halfAngleDeg
 *   unaware    60°：巡逻状态的有效辨认锥。人眼水平视野接近 100°，但「认出那是个敌人」
 *              比「察觉有东西在动」窄得多，取双眼中央视野的量级。
 *   suspicious 78°：已经觉得不对劲的人会转着头找，等效锥放宽。
 *   alert     100°：交火中扫视，接近人眼水平视野极限。
 *   engaged   115°：已经在打了，余光都在用；对**当前目标**另有 `engagedTargetOmni`。
 * stanceScale  站 1.0 / 蹲 0.95 / 卧 0.70。趴着脸贴地，左右余光被自己的肩膀和地面挡掉一大块；
 *              这也是「卧倒是有收益的姿势」在感知侧的另一半（另一半是 SIGHT_BY_STANCE）。
 * muzzleFlashBonusDeg 25°：枪口焰是**主动暴露**。正在开枪的目标即使偏出视锥 25° 以内，
 *              也算被余光抓到 —— 现实里被侧后方的枪焰吸引转头是一瞬间的事。
 * omniRadiusM  6 m：贴脸不看视锥。六米内还要判夹角，会出现「敌人贴着你背后站着你不知道」
 *              这种谁看了都觉得蠢的画面；这个距离上听觉、余光、身体感一起生效。
 * engagedTargetOmni  已经 ENGAGED 的人对**当前目标**全向感知（他一直盯着那个人，
 *              背对着也知道对方在哪）。**对新目标仍然走视锥** —— 不然又变回旧的 360° 全知。
 */
export const FOV = Object.freeze({
  halfAngleDeg: Object.freeze({ unaware: 60, suspicious: 78, alert: 100, engaged: 115 }),
  stanceScale: Object.freeze([1.0, 0.95, 0.70]),
  muzzleFlashBonusDeg: 25,
  omniRadiusM: 6,
  engagedTargetOmni: true,
});

/**
 * 觉察累积。`awareness` 是 0..1 的一个数，**每个目标各有一份**；士兵的警戒级别取
 * 所有目标里最高的那一份。
 *
 * 速率公式（代码里的 `_RiseRate`）：
 *   r    = 距离 / host.SightRange(目标姿态)          ← 姿态与照明弹都从这里进来
 *   gain = nearGain − (nearGain − edgeGain) × r^curveExp
 *   rate = riseBasePerS × gain × (目标在动 ? movingMul : stillMul)
 *
 * 两个标定点（docs/Data_EnemyAi.md §4.1 的验收口径，`Script_AiPerceptionTest` 会量）：
 *   · 40 m 上站着**开火**的目标 < 0.3 s 拉满 —— 走 `firingFillsTo`，一次 Think 就满；
 *     同一个人只是走动不开枪约 0.30 s（rate ≈ 3.4/s），仍然是「一眼就认出来」；
 *   · 80 m 上**静止蹲着**的目标 2–4 s 才拉满 —— r = 80/80 = 1.0，
 *     rate = 1.5 × 0.55 × 0.45 ≈ 0.37/s → ≈ 2.7 s。这就是「潜行接近」这件事成立的地方。
 *
 * riseBasePerS 1.5：满增益参考速率。改它等于整体调「敌人反应有多快」。
 * nearGain 2.6 / edgeGain 0.55 / curveExp 1.6
 *   贴脸（r→0）比极限距离（r→1）快约 4.7 倍；指数 1.6 让曲线在中段（r≈0.5）还剩
 *   六成增益 —— 线性（1.0）会让 60 m 上的人慢得不像话，平方（2.0）又让 100 m 外
 *   几乎发现不了人，两头都试过。
 * movingMul 1.0 / stillMul 0.45
 *   **不动的人难被发现**是这一层唯一让玩家「学会一件事」的机制。0.45 不是随手写的：
 *   它正好让上面第二个标定点落进 2–4 s 这个窗口（动着的话 1.2 s）。
 * firingFillsTo 1：枪口焰瞬间拉满。这条比任何曲线都重要 —— 玩家开了枪还没被发现，
 *   会让人觉得 AI 是坏的。
 * decayDelayS 0.8：看不见之后**先不衰减**的宽限。墙角、烟尘、队友身体会让通视闪断
 *   零点几秒（`Script_Ai.HasLineOfSight` 的三格缓存也有 0.25 s 粒度），
 *   没有这条宽限，敌人会在掩体边缘一亮一灭地「重新发现」你。
 * decayPerS 0.30：满觉察掉到零约 3.3 s。比 `lock.forgetS`（5 s）短一点：
 *   先降警戒，再丢目标，顺序对得上「他好像跑了 → 算了」。
 * thresholds / release：升级阈值与**回落**阈值不同 = 迟滞带。带宽 0.10–0.15，
 *   配合 `minDwellS` 保证不会一帧内来回（验收：AiPerceptionTest 的「迟滞不抖」）。
 *   engaged 0.85 特意压在 `hearing.awarenessCap` 之上：**光靠听永远进不了 ENGAGED**，
 *   要交火必须真的看见人。
 * minDwellS 0.5：两次级别变化的最小间隔。级别可以**跨级跳**（贴脸枪焰 unaware→engaged
 *   一步到位），所以这条不会拖慢反应，只挡抖动。
 */
export const AWARENESS = Object.freeze({
  riseBasePerS: 1.5,
  nearGain: 2.6,
  edgeGain: 0.55,
  curveExp: 1.6,
  movingMul: 1.0,
  stillMul: 0.45,
  firingFillsTo: 1,
  decayDelayS: 0.8,
  decayPerS: 0.30,
  thresholds: Object.freeze({ suspicious: 0.25, alert: 0.55, engaged: 0.85 }),
  release: Object.freeze({ suspicious: 0.15, alert: 0.42, engaged: 0.70 }),
  minDwellS: 0.5,
});

/**
 * 听觉。刺激由 `Script_Main` 上报（玩家开枪 → MarchBullet、爆炸 → Blast、AI 开火），
 * 感知层只负责「谁听见了、记成多可靠的一条情报」。
 *
 * loudnessM 是**可闻半径的兜底**：刺激自带 `loudnessM` 时以刺激为准（同一支枪在巷子里
 * 和在开阔地不是一个数，上报方比这张表知道得多）。
 *   gunshot    150 m  三八式步枪的枪声在开阔地能传几公里，但「能分辨出方向、值得转头去看」
 *                     的量级是一百多米；再远就是背景音，人不会为它改变行为。
 *   machinegun 200 m  连发更响也更持久，方向更容易辨。
 *   explosion  260 m  手榴弹 / 迫击炮：全场都听得见，但只有这个半径内的人会去查看。
 *   footstep     9 m  脚步只在贴近时有意义；这个数同时决定「潜行绕后」能不能成立。
 *   bark        35 m  喊话（发现敌情 / 换弹 / 集合）的传播距离，比枪声近得多。
 *   impact      60 m  子弹打在墙上、金属上的动静。
 * minLoudnessM 1：防御性下限，避免上报方写 0 造成除零。
 * confidenceNear 0.85 / confidenceEdge 0.20 / curveExp 1.35
 *   置信度按 `edge + (near − edge) × (1 − d/loudness)^curveExp` 折算。
 *   贴脸听见不给 1.0 —— **听见不等于看见**，声音永远定不准人在哪；
 *   0.85 是「基本可以直接往那儿打」，0.20 是「知道那边有事，值得去看一眼」。
 * awarenessCap 0.72：听觉最多把人推到 ALERT（0.55），**永远到不了 ENGAGED**（0.85）。
 *   这一条是设计红线：背后一枪把整条街的人变成全知全能的射手，比听不见还糟。
 * localizationErrorM near 0.4 / edge 7.0
 *   听觉写入的 LKP 带定位误差，随距离比线性放大。这就是玩家能感觉到的
 *   「他们朝我刚才那边打，但没打准地方」；误差用 `host.Rnd()` 出（确定性）。
 */
export const HEARING = Object.freeze({
  loudnessM: Object.freeze({
    gunshot: 150, machinegun: 200, explosion: 260, footstep: 9, bark: 35, impact: 60,
  }),
  minLoudnessM: 1,
  confidenceNear: 0.85,
  confidenceEdge: 0.20,
  curveExp: 1.35,
  awarenessCap: 0.72,
  localizationErrorM: Object.freeze({ near: 0.4, edge: 7.0 }),
});

/**
 * 记忆：最后目击位置（LKP）活多久。
 *
 * memoryS 12：一条情报的硬寿命。选 12 s 的依据是玩法节奏 —— 敌人从「你缩回掩体」
 *   到「他放弃朝那儿打 / 过来查看」应当在十几秒内有结论，再久玩家会觉得他们在发呆。
 *   比 `lock.forgetS`（5 s）长一倍多：**丢目标 ≠ 忘掉敌情**，这正是「向最后目击位置
 *   压制射击」与「过去查看」两种行为的存在空间。
 * confidenceDecayPerS 0.075：置信度从写入值线性掉。亲眼看见的一条（1.0）在 12 s 时
 *   还剩 0.10（刚好被 memoryS 收走）；远处听见的一条（0.25）不到 3 s 就掉到 minConfidence ——
 *   模糊的情报本来就该先烂掉。
 * minConfidence 0.05：低于它当作没有这条情报。
 * maxTracks 6：每个兵最多记 6 个目标。同屏上百人，记忆是**每人一份**的常驻内存；
 *   6 条足够覆盖「最近三个候选 + 几条听来的动静」，超了淘汰置信度最低的那条
 *   （当前锁定的目标永不被淘汰）。
 * seenConfidence 1：亲眼看见时写入的置信度上限。
 */
export const MEMORY = Object.freeze({
  memoryS: 12,
  confidenceDecayPerS: 0.075,
  minConfidence: 0.05,
  maxTracks: 6,
  seenConfidence: 1,
});

/**
 * 目标锁迟滞。**这四个数是从 `Script_Ai.Think` 原样搬过来的**（1.2 / 5 / 0.50 / 3.0+0.8），
 * 搬家不改数：第二波大脑重排要能用「行为没变」来验证这次拆分是无损的。
 *
 * keepBlindS 1.2：通视闪断多久内仍然保持当前目标。墙角、烟尘、队友身体会让射线
 *   短暂被挡，1.2 s 之内不许把枪口甩给别人（原注释：这是集体抽搐的一条源头）。
 * forgetS 5：看不见超过 5 s 才彻底丢锁。丢锁之后 LKP 还在（memoryS 12 s）。
 * switchDistanceRatio 0.50：锁定期过后，新目标要近到当前目标的一半才允许换人。
 *   「交火中略近一米的人不该让枪口立刻甩过去。」
 * lockS 3.0 / lockJitterS 0.8：换目标之后的锁定期，带抖动 —— 不抖的话全班会在
 *   同一秒集体换目标。
 * visibleRangeSlack 1.12：复核**旧目标**时的距离余量，与 Script_Ai 的 `* 1.12` 同源：
 *   已经锁上的人不该因为退后一米跨出发现距离就凭空消失。
 */
export const LOCK = Object.freeze({
  keepBlindS: 1.2,
  forgetS: 5.0,
  switchDistanceRatio: 0.50,
  lockS: 3.0,
  lockJitterS: 0.8,
  visibleRangeSlack: 1.12,
});

/**
 * 暴露度**先验**。感知层不射线（射线预算在 docs/Data_EnemyAi.md §7 里分给了
 * 掩体验证与射击采样），所以这里只按目标姿态给一个粗估：
 * 站着整个人在外面 1.0 / 蹲着躯干缩掉三分之一 0.62 / 趴着只剩头肩 0.34。
 *
 * 真正决定这一发打不打得中的是 `Script_AiShooting.Exposure()` 的射线采样；
 * 这个先验只用来让「要不要现在开火 / 要不要先换个位置」这类**决策**有个便宜的输入。
 * 看不见时恒为 0 —— 对应 §4.3 的「fraction = 0 不许结算命中，只能压制射击」。
 */
export const EXPOSURE = Object.freeze({
  byStance: Object.freeze([1.0, 0.62, 0.34]),
});

/**
 * 宿主回调缺席时的兜底。纯 Node 测试与早期集成会出现 host 没接全的情况；
 * 静默用站姿的发现距离比抛异常好 —— 感知层坏掉不该让整场仗停下来。
 */
export const FALLBACK = Object.freeze({
  sightRangeM: 120,
  eyeM: 1.5,
  rnd: 0.5,
});

/** 一张表一个入口：规则层 `import { PERCEPTION }` 读这一个对象。 */
export const PERCEPTION = Object.freeze({
  fov: FOV,
  awareness: AWARENESS,
  hearing: HEARING,
  memory: MEMORY,
  lock: LOCK,
  exposure: EXPOSURE,
  fallback: FALLBACK,
});
