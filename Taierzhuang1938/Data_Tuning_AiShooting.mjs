// Data_Tuning_AiShooting.mjs — 敌军射击模型的调参表：瞄准误差、暴露采样、射击走廊、
// 点射节奏、压制点与枪口兜底。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数（口径见 docs/Data_TextAndTuning.md §4）。
// 规则在 `Script_AiShooting.mjs`，它 import 这张表读值，**不复制到本地常量**
// —— 复制一份等于热改表不生效、测试读到两个真相。
//
// **不在这张表里的**（改这些去它们自己的家，别在这里存第二份）：
//   · 命中率基数、压制、部位倍率、玩家挨打的整块口径 → `Data_Battle.COMBAT`
//     （docs/Data_PlayerDamage.md 那本 TTK 账；`aiAccuracyBase` / `COMBAT.player`
//     一个数都不许在这里出现）；
//   · 难度档（aiAccuracy / suppressionScale / …）→ `Data_Battle.DIFFICULTY`；
//   · 每支枪的射击周期、点射上下限、瞄准时间 → `Data_Weapons.mjs`
//     （`fireIntervalS` / `aiBurstMin` / `aiBurstMax` / `aiAimTimeS`）。本表只给
//     **武器表没写时**的按 kind 兜底值；
//   · 发现距离 `SIGHT_BY_STANCE`、姿态胶囊 `CAPSULE` → `Data_Tuning_Ai.mjs` 与 `Script_Ai.mjs`。
//
// 这张表管的是「从决定开枪到这一发落在哪」中间那一段**几何与时间**，
// 它乘在 `Script_Ai` 算好的 `baseAccuracy` 上，而且两条曲线的上限都是 1
// —— 也就是说这一套只会让 AI 变得**没那么准**，绝不会凭空把 TTK 账缩短。

/**
 * 瞄准误差（弧度）。这是「越瞄越准 / 一动就散 / 换目标重来」那条收敛过程的全部参数。
 *
 * 为什么要有它：原来 `TryFire` 的命中率是一个与时间无关的常数，于是敌人从墙后
 * 探出头的第一发和趴了十秒的第五十发一样准 —— 玩家没有任何「抢在他瞄准之前
 * 缩回去」的操作空间，探头也就没有代价。
 *
 * 语义：`errorRad` 是**瞄准方向的角度 1σ**，乘上距离就是落点的横向散布（米）。
 * 每次 `UpdateAim` 先按 `convergePerS` 指数收敛到 `floorRad`，再加上这一帧的扰动量：
 *
 *     err ← floor + (err − floor) · e^(−convergePerS · dt) + 扰动/s · dt
 *
 * 指数而不是线性，两条理由（都不是"帧率无关"—— 匀速线性同样对 dt 分割不敏感）：
 *   1. **形状**：举枪的头半秒买走大半个准头，之后越来越慢。这正是据枪的样子，
 *      也让「抢在他瞄准之前缩回去」有一个真实的时间窗；匀速线性则是"再等一会儿
 *      永远能多准一点"，玩家读不出该在哪一刻缩头。
 *   2. **与扰动的合成有闭式稳态**：收敛与扰动打平的地方是 `扰动/收敛率`，
 *      于是"边走边打有多散"是一个能直接算出来、能直接调的数（见下面三个扰动项），
 *      不需要跑模拟去凑。线性形式的稳态是个分段函数，调一个数会牵动另一个。
 *
 * initialErrorRad  刚锁上目标 / 刚从掩体探头出来时的误差。
 *                  拉栓步枪 0.055 rad：25 m 上落点 1σ ≈ 1.4 m —— 第一发多半从人身边过去。
 *                  轻机枪更散（枪重、无依托），重机枪有座钣所以比轻机枪稳，
 *                  手枪最散（短瞄准基线，这是它 50 m 有效射程的原因）。
 * floorRad         瞄到底的误差。步枪 0.009 rad = 25 m 上 1σ 0.22 m（打得中一个人的胸口），
 *                  100 m 上 0.9 m（打一半），与 `Script_Ai` 里那条按绝对米数的距离衰减是一套说法。
 *                  重机枪 0.011、轻机枪 0.0165：自动武器的散布本来就大于单发精度。
 * convergePerS     指数收敛率（1/s）。1.7 表示每秒把「离底还差多少」压掉 82%。
 *                  拉栓步枪最快（一发一瞄），机枪最慢（连发中枪口在跳）。
 * stanceScale      姿态对误差的整体折让（站 / 蹲 / 卧）。卧姿有依托，初始与底噪一起降。
 *                  下标 0 站 / 1 蹲 / 2 卧，与 `CAPSULE`、`SIGHT_BY_STANCE` 同一套。
 * suppressedInitialScale
 *                  被压制时初始误差的额外倍率（乘的是 suppression∈[0,1] 的线性项）：
 *                  `initial × (1 + suppression × 1.6)`。压制值 1 的人初始误差 2.6 倍。
 * disturbMovingPerS / disturbSuppressionPerS / disturbTargetMovingPerS
 *                  三种扰动，单位是**弧度每秒**，加在收敛之后。稳态误差 = 扰动/收敛率，
 *                  例如边走边打的步枪手稳态 0.085/1.7 = 0.05 rad —— 基本等于没瞄。
 *                  「目标在动」那一项最小：它是打提前量的难度，不是自己手抖。
 * exposedConvergeBonus / exposedConvergeCapS
 *                  目标持续暴露越久，收敛越快（对上一个不躲的目标，老兵会越打越准）。
 *                  `rate × (1 + bonus × min(exposedS, cap) / cap)`：暴露满 3 s 时收敛快 55%。
 * maxRad           误差上限。0.26 rad 上封顶：再散下去曳光会飞到画面外，读起来像枪坏了。
 * snapRad          离底小于这个数就直接吸附到 floor。存在的理由是**契约**：
 *                  指数收敛永远到不了底，而「误差收敛到底 ⇒ AimErrorCurve == 1 ⇒
 *                  命中率 == baseAccuracy」是 DamageTest 那本账不许破的一条，
 *                  必须有一个能真正到达的底。
 * halfRad          `AimErrorCurve` 的半衰误差：超出 floor 这么多时命中率打对折。
 *                  0.030 rad 与 initial−floor 同量级 —— 刚探头那一发约为满值的 0.3 倍。
 */
export const AIM = Object.freeze({
  initialErrorRad: Object.freeze({
    boltRifle: 0.055, lmg: 0.070, hmg: 0.050, pistol: 0.095, default: 0.060,
  }),
  floorRad: Object.freeze({
    boltRifle: 0.0090, lmg: 0.0165, hmg: 0.0110, pistol: 0.0320, default: 0.0140,
  }),
  convergePerS: Object.freeze({
    boltRifle: 1.70, lmg: 1.35, hmg: 1.15, pistol: 2.20, default: 1.50,
  }),
  stanceScale: Object.freeze([1.0, 0.86, 0.74]),
  suppressedInitialScale: 1.6,
  disturbMovingPerS: 0.085,
  disturbSuppressionPerS: 0.070,
  disturbTargetMovingPerS: 0.030,
  exposedConvergeBonus: 0.55,
  exposedConvergeCapS: 3.0,
  maxRad: 0.26,
  snapRad: 2e-4,
  halfRad: 0.030,
});

/**
 * 暴露采样、射击走廊、压制点、枪口兜底与打偏散布。
 *
 * exposureSamples  一次暴露判定最多射几条线。3 = 头 / 胸 / 骨盆。
 *                  这是**性能预算**（方案 §7：暴露采样 ≤ exposureSamples 且只在准备开火时）：
 *                  110 人 1/6 分帧、同时开火的不到十个，一帧十几条线，可以承受。
 *                  采样点生成器会多给两个膝盖，预算调大时它们自动进来。
 * exposureCacheS   同一目标的暴露结果缓存多久。0.25 s 与 `HasLineOfSight` 的三格缓存同量级：
 *                  比一次射击周期短（最快的机枪 0.12 s 除外），所以人从掩体后探出来
 *                  最多晚 0.25 s 被发现，而不是「打完这一梭子才更新」。
 * exposureCacheMoveM
 *                  射手或目标头部移动超过这个距离就作废缓存 —— 时间没到但几何已经变了。
 * blockedMarginM   射线判"被挡"的余量：`hit.t < dist − 0.3` 才算挡住。
 *                  0.3 m 是给目标自己的身体半径留的（打到人身上的那一下不算墙），
 *                  与 `Script_Ai.HasLineOfSight` 的 0.4 同一个道理，取小一点是因为
 *                  这里瞄的是采样点（在身体表面附近）而不是眼睛。
 * exposureExponent `ExposureCurve(f) = f^exponent`。1.6 > 1：只露一个头（f = 1/3）时
 *                  命中率是满暴露的 0.18 倍，不是 0.33 倍。
 *                  为什么不是纯面积比：AI 瞄的是**看得见的那个点**，不是瞎打身体中心，
 *                  所以部分暴露没有「按面积成比例」那么惨；但只露头的目标同时更小、
 *                  更靠近掩体沿（打高一点就飞了），所以又比面积比更难打。
 *                  1.6 是「探头有代价、但躲在掩体后不是无敌」这两头之间取的。
 * friendlyCorridorM 射击走廊半径（米）：友军躯干中心离射击线比这更近就不开枪。
 *                  0.75 = 站姿胶囊半径 0.34 + 半个身位的余量。这条修的是
 *                  「一个班挤在一堵墙后面，后排隔着前排的后脑勺开枪」。
 * friendlyMinAlongM 枪口正前这么近的人不算进走廊 —— 那是自己的身体和枪管。
 * suppressAboveCoverM 压制射击打在掩体沿**上方**多少米。0.3 m：子弹擦着掩体顶过去，
 *                  砖屑落在缩着头的人脸上 —— 这就是"藏起来也会有子弹擦着掩体过"。
 *                  打在掩体上（0）只有一声闷响，打高了（1 m 以上）人根本不知道在挨打。
 * suppressOutsideM 沿掩体法线往外偏一点，免得弹着点全钉在掩体正上方一条线上。
 * suppressScatterM 压制点的横向散布半幅（米，均匀分布）。0.55 m 让一梭子扫出一条线，
 *                  而不是十发钉在同一个像素上。
 * suppressVerticalScatterM
 *                  竖向散布半幅。**必须小于 suppressAboveCoverM**，否则压制弹会掉到
 *                  掩体沿以下 —— 那看起来就是「AI 在打墙」。
 * suppressLkpChestM 没有掩体时向最后目击位置的什么高度打。1.10 m 与 `Script_Ai.TryFire`
 *                  对 AI 目标用的 `to.y += 1.1` 是同一个胸高。
 * muzzleDropM      枪口兜底高度 = 姿态眼高 − 0.15 m。据枪时瞄准线在枪膛上方约
 *                  15 cm（照门高度 + 贴腮），所以枪口比眼睛低这么多。
 *                  **只是兜底**：`soldier.muzzleWorld` 有值时一律用真枪口
 *                  （`Actor.MuzzleWorld`），曳光才会从枪管里出来而不是从胸口。
 * stanceEyeM       姿态眼高兜底（站 / 蹲 / 卧），与 `AiDirector.StanceEye` 同值。
 *                  宿主注入 `host.StanceEye` 时优先用宿主的（它带身高缩放）。
 * lookPitchMinRad / lookPitchMaxRad
 *                  `LookPitch` 的夹取范围，与 `Script_Actor` 里 `Clamp(s.lookPitch, -1.0, 0.9)`
 *                  逐字一致 —— 在这里先夹一次，是为了让 AI 的抬枪量与画面上真正呈现的
 *                  一致（超出范围的部分在 Actor 里会被无声吃掉）。
 * missSpreadScale / missMinOffsetM / missMaxOffsetM
 *                  打偏的落点：以瞄点为心、`tan(误差) × 距离 × scale` 为 1σ 的高斯散点。
 *                  最小 0.12 m 保证**打偏的弹着点绝不与瞄点重合**（重合的话曳光会直穿目标，
 *                  画面上像"打中了但没扣血"）；最大 6 m 免得压制弹飞到另一条街上。
 */
export const SHOOTING = Object.freeze({
  exposureSamples: 3,
  exposureCacheS: 0.25,
  exposureCacheMoveM: 0.5,
  blockedMarginM: 0.30,
  exposureExponent: 1.6,
  friendlyCorridorM: 0.75,
  friendlyMinAlongM: 0.50,
  suppressAboveCoverM: 0.30,
  suppressOutsideM: 0.22,
  suppressScatterM: 0.55,
  suppressVerticalScatterM: 0.10,
  suppressLkpChestM: 1.10,
  muzzleDropM: 0.15,
  stanceEyeM: Object.freeze([1.5, 1.0, 0.5]),
  lookPitchMinRad: -1.0,
  lookPitchMaxRad: 0.9,
  missSpreadScale: 1.0,
  missMinOffsetM: 0.12,
  missMaxOffsetM: 6.0,
});

/**
 * 点射计划。`aiBurstMin` / `aiBurstMax`（`Data_Weapons` 207 / 223 / 238）在这一轮之前
 * 是**死字段**：机枪按 `fireIntervalS` 匀速点射到过热为止，听起来像电锯不像十一年式。
 *
 * byKind           武器表没写 `aiBurstMin/Max` 时按 kind 兜底（中方几支枪都没写）。
 *                  pauseMinS / pauseMaxS 是**打完一梭子之后的停顿**（均匀抽），
 *                  轻机枪 0.6—1.4 s：换个瞄点、看一眼弹着、让枪管喘一口。
 * singleShotKinds  这些 kind 恒定 1 发，**忽略武器表的 aiBurstMax**。
 *                  三八式表里写着 `aiBurstMax: 2`，但拉栓枪两发之间必须拉一次栓，
 *                  而那一下已经是 `fireIntervalS`（1.35 s）本身 —— 再排一个"两连发"
 *                  只会让人在 0.24 s 内打出两发，读起来是半自动步枪。
 * maxShots         上限，防止有人往武器表里填一个 200。
 */
export const BURST = Object.freeze({
  byKind: Object.freeze({
    boltRifle: Object.freeze({ min: 1, max: 1, pauseMinS: 0.0, pauseMaxS: 0.0 }),
    pistol: Object.freeze({ min: 1, max: 2, pauseMinS: 0.35, pauseMaxS: 0.90 }),
    lmg: Object.freeze({ min: 4, max: 9, pauseMinS: 0.60, pauseMaxS: 1.40 }),
    hmg: Object.freeze({ min: 5, max: 14, pauseMinS: 0.90, pauseMaxS: 2.00 }),
    default: Object.freeze({ min: 1, max: 1, pauseMinS: 0.0, pauseMaxS: 0.0 }),
  }),
  singleShotKinds: Object.freeze(["boltRifle"]),
  maxShots: 20,
});

/**
 * 暴露采样点的几何。**这些点只用来问"看不看得见"，不用来判部位**
 * （打中哪儿仍然是 `AiDirector.PlayerHitPart` + `Script_PlayerHitbox` 的射线，
 * 那条 `COMBAT.player` 的账一个数没动）。
 *
 * soldier  AI 目标按姿态取的三个高度（米，离脚底）。来源：
 *          · 站：`CAPSULE[0].height = 1.78`（`Script_Ai.mjs` 约 95 行）。头心 1.62
 *            = 头顶减头半径一档；胸 1.25 ≈ 0.70 × 身高；盆 0.95 与
 *            `PLAYER_HITBOX.stand` 躯干下端 0.95 同值。
 *          · 蹲：`CAPSULE[1].height = 1.21`。头心 1.15；胸 0.85 贴着
 *            `PLAYER_HITBOX.crouch` 躯干上端 0.88；盆 0.60 在躯干下端 0.50 之上。
 *          · 卧：`CAPSULE[2].height = 0.58`。头心 0.45、胸 0.30
 *            （`PLAYER_HITBOX.prone` 躯干在 0.24—0.27）。**只有两个点** ——
 *            趴着的人骨盆藏在躯干后面，多射一条线问不出新东西。
 *          三档与 `AiDirector.StanceEye`（1.5 / 1.0 / 0.5）不是同一组数：那是**枪眼高**，
 *          这是**身体上的采样点**。别把两者合并。
 * playerChestT / playerPelvisT
 *          玩家的采样点从 `PLAYER_HITBOX` 的躯干胶囊上取：沿"胸端 → 盆端"插值，
 *          0.25 是胸、0.95 是骨盆（不取 1.0 是不想正好落在胶囊端帽的圆心上）。
 *          胸端 = 离头球更近的那一端 —— 站 / 蹲时它在上方，**卧姿时它在前方**，
 *          所以不能写死"y 大的那一端"。
 * playerKneeT
 *          膝盖取腿胶囊的中点。默认预算（3 条线）用不到它们，
 *          `SHOOTING.exposureSamples` 调到 5 时自动生效。
 */
export const SAMPLES = Object.freeze({
  soldier: Object.freeze([
    Object.freeze({ head: 1.62, chest: 1.25, pelvis: 0.95 }),
    Object.freeze({ head: 1.15, chest: 0.85, pelvis: 0.60 }),
    Object.freeze({ head: 0.45, chest: 0.30 }),
  ]),
  playerChestT: 0.25,
  playerPelvisT: 0.95,
  playerKneeT: 0.50,
});
