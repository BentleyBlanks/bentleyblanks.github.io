// Data_Tuning_BlastKnockback.mjs — 爆炸冲击波把人推一把、推倒、掀飞（2026-10-28，用户：「小的手榴弹我可能就是受伤，
// 但一个巨大的爆炸我可能就被震飞了，要符合物理设定」）。
//
// 纯数据、零 three（契约 2、12）。消费方：Script_BlastKnockback（冲击波 → 人身上的冲量、分档、撞击伤害）、
// Script_PlayerKnockback（推一把 / 倒地 / 飞出去 / 滑 / 躺 / 爬起来的状态机）。口径与验收：docs/Data_BlastKnockback.md。
//
// 一发爆炸给人的水平速度增量 Δv（站姿，地面爆炸，人站在离爆点这么远的地上）：
//   手榴弹  2 m 0.43 · 4 m 0.17 m/s         → 推一下、晃一步 / 没感觉（伤是弹片的事）
//   75 野炮 3 m 1.05 · 2 m 2.5 m/s          → 晃一下 / 掀飞
//   150 榴弹 5 m 1.45 · 3 m 5.1 m/s          → 倒地 / 掀飞
//   250 kg 炸弹 20 m 0.76 · 12 m 3.1 · 8 m 9.2 m/s → 晃 / 倒地 / 掀飞
// 「站得住」的上限按平衡的外推质心（Hof 2005）：迈一步能接住的速度 = 迈步距离 × √(g / 质心高)。

/** 冲击波 → 人身上的冲量。 */
export const BLAST_KNOCKBACK_IMPULSE = Object.freeze({
  /** 空气声速（m/s）：Rankine–Hugoniot 的激波速度 U 与波后风速 u 都按它。超压、大气压、当量折算与 BLAST_EXPOSURE 同一份。 */
  soundSpeedMps: 340,
  /** 人连装具的质量（kg）：70 kg 的人 + 10 kg 步枪、弹药、水壶、背包。 */
  massKg: 80,
  /** 迎着冲击波的投影面积（m²）：站着约 1.7 m × 0.35 m；蹲着约六成；趴着只剩头肩和背的一条。 */
  areaM2: Object.freeze({ stand: 0.6, crouch: 0.38, prone: 0.12 }),
  /**
   * 绕射段（冲击波刚撞上身体那几毫秒）：迎波面先吃反射压 pr，等波从身体两侧绕过去（清除时间 ≈ 3S / U，
   * S = 身体厚度的一半，TM 5-1300 / UFC 3-340-02 的清除时间口径）才降到侧压 ps；这一段前后压差按三角形积分。
   */
  clearingM: 0.25,
  /** 拖曳段：波后风的动压 q 按阻力系数推人（人体 Cd 约 1.0–1.3）；动压衰减得比超压快，整段积分只有 q·td 的 0.19。 */
  dragCoefficient: 1.2,
  dynamicImpulseShape: 0.19,
  /** 隔着墙 / 沟壁 / 土坎：绕射过来的超压掉一半上下（BLAST_EXPOSURE.occludedDb −8 dB ≈ ×0.4），冲量按同一个比例扣。 */
  occludedScale: 0.4,
  /** Δv 上限：不会比波后风本身还快（取风速的一半），也不超过 18 m/s（再往上人早就没了，数没有意义）。 */
  windFractionCap: 0.5,
  maxDeltaVMps: 18,
});

/** 人的身体：质心高、回转半径（绕质心）、平衡能接住的迈步距离。g 用真实重力，不是跳跃手感用的 19.6。 */
export const BLAST_KNOCKBACK_BODY = Object.freeze({
  gravityMps2: 9.81,
  /** 质心离地高（m）。 */
  comHeightM: Object.freeze({ stand: 1.0, crouch: 0.62, prone: 0.18 }),
  /** 绕质心的回转半径（m）：站姿按一根 1.75 m 的杆 ≈ 0.5；蹲着团起来 0.35。 */
  gyrationM: Object.freeze({ stand: 0.5, crouch: 0.35, prone: 0.3 }),
  /**
   * 迈一步能接住的距离（m）：外推质心 x + v/√(g/L) 落在这一步之内就站得住（Hof, Gazendam & Sinke 2005）。
   * 站 0.38 m → 1.2 m/s；蹲着两脚分得开、重心低，0.5 m → 2.0 m/s。趴着不会被推倒，只会被推着滑。
   */
  stepReachM: Object.freeze({ stand: 0.38, crouch: 0.5 }),
  /** 躺平时身体半厚（m）：最低点 = 质心 − (L·cosθ + 这个·sinθ)。 */
  halfThicknessM: 0.15,
});

/** 分档：多小算没事、多大推得动趴着的人、什么时候脚离地。 */
export const BLAST_KNOCKBACK_REGIME = Object.freeze({
  /** 低于它什么都不发生（只剩震屏与身体反应那一层）。 */
  ignoreMps: 0.25,
  /** 趴着的人：低于它只是被推一下，高于它整个人被推着在地上滑。 */
  proneSlideMps: 1.5,
  /** 本来就站不住、冲击方向的竖直分量又超过它，就算整个人被掀离地面（近距离、爆点比人低时才会有）。 */
  liftVerticalMps: 0.35,
});

/** 推一把（站得住的那一档）：人被推着走一两步、身子晃，手上的控制慢慢回来。 */
export const BLAST_KNOCKBACK_STAGGER = Object.freeze({
  /** 持续（秒）：按 Δv / 站得住的上限 从 minS 涨到 maxS。 */
  minS: 0.3, maxS: 0.8,
  /** 身子被推得最歪（弧度，满档约 11°）、最歪的时刻（秒）。 */
  tiltRad: 0.2, peakS: 0.12,
  /** 刚挨那一下移动输入只剩这么多，到结束涨回 1。 */
  controlMin: 0.15,
});

/** 倒地（站不住）：绕脚翻倒 → 身体着地 → 在地上滑 → 躺一会 → 爬起来。脚离地就先飞一段。 */
export const BLAST_KNOCKBACK_FALL = Object.freeze({
  /** 脚底与地面的滑动摩擦（翻倒初段脚往前蹭的那一点）。 */
  feetFriction: 0.6,
  /** 身体转到这个角度（弧度，约 77°）再碰地算身体着地；没转到时碰地的是脚，接着绕脚翻。 */
  bodyImpactRad: 1.35,
  /** 脚离地以后带着的转速 = 绕脚翻倒的转速 × 这个（脚蹭着地才转起来，离地那一刻还没转满），封顶 rad/s。 */
  spinScale: 0.7, maxSpinRadS: 6,
  /** 躺平的角度（弧度，约 86°）：着地以后往这里靠。 */
  lieRad: 1.5,
  /** 身体在地上滑的摩擦（衣服、装具对土）；低于停住速度算停下。 */
  slideFriction: 0.65, stopMps: 0.15,
  /** 躺多久（秒）：按这一下有多狠（Δv 与着地速度取大）从 minS 涨到 maxS。 */
  lieMinS: 0.8, lieMaxS: 3.2, liePerMps: 0.35,
  /** 爬起来（秒）。 */
  riseS: 0.9,
});

/** 相机：身体歪多少相机跟着歪多少、躺着时眼睛离身体中心多远。 */
export const BLAST_KNOCKBACK_CAMERA = Object.freeze({
  /** 相机俯仰 / 滚转 = 身体倾角 × 这个（人倒下时脖子会本能地把头往回收一点）。 */
  tiltScale: 0.85,
  /** 叠完以后的俯仰上限（弧度），过 ±90° 画面会翻过去。 */
  pitchLimitRad: 1.45,
  /** 眼睛相对身体中心的水平偏移上限（m）：不能比胶囊半径（0.34）伸得更远，不然贴墙躺着时眼睛穿进墙里。 */
  headOffsetMaxM: 0.3,
  /** 着地以后相机从飞行轨迹落到「躺在地上」的高度用的速率（1/秒），给着地那一下一点「砸」的感觉。 */
  settleRate: 12,
});

/**
 * 撞击伤害（钝伤，不流血），出处：Glasstone & Dolan《The Effects of Nuclear Weapons》(1977) 表 12.49
 *「人体被抛出后撞击的伤害判据」。[速度 m/s, 伤害 HP]，分段线性，最后一段往外延。
 *   撞墙（整个人撞上硬物）：10 ft/s（3.05 m/s）以下基本安全；21 ft/s（6.4 m/s）开始出人命；54 ft/s（16.5 m/s）一半死亡。
 *   在空地上翻滚减速：30 ft/s（9.1 m/s）百分之一受伤；75 ft/s（22.9 m/s）一半。普通摔倒（≤4 m/s）不伤人。
 * 玩家满血 100：伤害按「开始出人命 ≈ 半条命、一半死亡 ≈ 一条命」对上去。
 */
export const BLAST_KNOCKBACK_DAMAGE = Object.freeze({
  wall: Object.freeze([[3.05, 0], [6.4, 45], [16.5, 100]]),
  ground: Object.freeze([[4.0, 0], [9.1, 12], [22.9, 100]]),
  /** 同一个面连着撞，间隔短于它只算一次（滑着蹭墙不是连着撞十下）。 */
  repeatS: 0.35,
});

/**
 * 被推倒时枪脱手（Script_LooseGun，2026-10-29 用户：「试试主角的枪也被震掉，再从地上捡起来」）。
 * 只在倒地 / 掀飞（regimes）时有，推一把不脱手；手里是枪才脱（大刀、手榴弹、架着的机枪不算）。
 * 人往后倒、往前扑时手会本能地伸出去撑地，枪就是这时候甩出去的：
 *   releaseDelayS   被推倒后多久撒手（身子开始转、手伸出去）
 *   hand            出手点：相对相机，前 / 下 / 右（米）
 *   kick            甩出去那一下：身体速度 × bodyScale（手离脚比质心远，转起来比质心快）+ 沿推的方向 alongShare × Δv
 *                   + 往人前方 forwardMps + 往上 upMinMps..+upSpanMps + 左右 ±sideMps（按序号确定，不用 Math.random）
 *   spin            翻滚（绕横轴，rad/s）、绕枪管滚（roll）的转速范围，外加 ±yawRadS 绕竖轴打转（落地不总顺着飞的方向）
 * 飞出去以后当一根两头带质量的杆（枪长取模型的包围盒，半径 = 侧躺时的半厚）：
 *   contact         落地反弹系数、低于 bounceMps 不弹、库仑摩擦、贴地滑的阻力、贴地时绕枪管转的阻尼、侧躺回正的速率
 *   sleep           两头都慢于 mps 持续 s 秒就停住（最多飞 maxFlightS 秒，到点直接放平）
 * 汉阳造全长约 1.25 m、重约 4 kg；摩擦按木头 / 钢对干土取 0.5 上下。
 * pickup：捡起来那一下 —— 低头看向枪（俯仰补 lookShare、左右补 yawShare 且不超过 maxTurnRad）、弯腰（站姿眼位降 dipM，
 *         蹲 crouchDipM，趴着不弯）、右手伸过去，reachS 时抓到（地上那把 liftS 秒内收到身前 liftForwardM、右 liftRightM、眼睛以下 liftDownM 的胸口处，跟手里那把从下面端上来接上），
 *         holdS 后开始直起身，returnS 回到原样；抓到那一刻地上那把消失、手里那把端上来。
 */
export const BLAST_LOOSE_GUN = Object.freeze({
  regimes: Object.freeze(["fall", "thrown"]),
  releaseDelayS: 0.12,
  hand: Object.freeze({ forwardM: 0.42, downM: 0.34, rightM: 0.1 }),
  kick: Object.freeze({ bodyScale: 1.15, alongShare: 0.3, forwardMps: 0.7, upMinMps: 1.5, upSpanMps: 1.1, sideMps: 1.3 }),
  spin: Object.freeze({ minRadS: 4, spanRadS: 6, rollMinRadS: 2, rollSpanRadS: 5, yawRadS: 3 }),
  gravityMps2: 9.81,
  maxSubstepS: 1 / 120,
  contact: Object.freeze({ restitution: 0.3, bounceMps: 0.7, friction: 0.5, slideDragPerS: 3.5, rollDampPerS: 7, settleRate: 8 }),
  sleep: Object.freeze({ mps: 0.12, s: 0.25, maxFlightS: 6 }),
  pickup: Object.freeze({ reachS: 0.32, holdS: 0.06, returnS: 0.42, dipM: 0.5, crouchDipM: 0.2, proneDipM: 0,
    lookShare: 0.85, yawShare: 0.6, maxTurnRad: 0.8, maxLookDownRad: 1.1, liftS: 0.18, liftForwardM: 0.3, liftRightM: 0.18, liftDownM: 0.55 }),
});

export const BLAST_KNOCKBACK = Object.freeze({
  impulse: BLAST_KNOCKBACK_IMPULSE,
  body: BLAST_KNOCKBACK_BODY,
  regime: BLAST_KNOCKBACK_REGIME,
  stagger: BLAST_KNOCKBACK_STAGGER,
  fall: BLAST_KNOCKBACK_FALL,
  camera: BLAST_KNOCKBACK_CAMERA,
  damage: BLAST_KNOCKBACK_DAMAGE,
  looseGun: BLAST_LOOSE_GUN,
});

export default BLAST_KNOCKBACK;
