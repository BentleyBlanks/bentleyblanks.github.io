// Notion《白刃战系统｜大刀与刺刀》融合版，2026-09-06 读取。纯数据。
export const MELEE_RULES = Object.freeze({
  parryWindowS: 0.25, parryRecoveryS: 0.34, parryFacingDot: 0.55,
  parryStaggerS: 0.8, pushStaggerS: 0.65, pushRecoveryS: 0.58,
  pushDistanceM: 0.65, pushCost: 18, parryCost: 9,
  chargeMinS: 0.38, chargeMaxS: 1.15, staminaRecovery: 19,
  engageM: 5.5, separationM: 0.62, bindReachM: 1.15,
  knockdownS: 0.65, riseS: 1.05, staggerS: 0.65,
  // 倒地时第一人称镜头：眼位落到地板上方 groundEyeM，镜头再抬 groundCameraPitchRad
  // （躺着看天花板）。Script_Player 画它，剧本编排（第一关屋内伏击）要按同一组数
  // 反算「让他看哪儿」，所以两边读同一条，别各写一个 0.78。
  groundEyeM: 0.28, groundCameraPitchRad: 0.78,
  poiseRecovery: 17, npcTurnRate: 3.8, npcSpeed: 1.5,
  maxStepS: 1 / 90,
  inputBufferS: 0.18, parrySuccessRecoveryS: 0.12, pushSuccessRecoveryS: 0.14,
  beatContactS: 0.07, beatStaggerS: 0.48, beatCooldownS: 1.1,
  npcTellS: 0.48, npcReactionS: 0.2, npcAimCommitLeadS: 0.16, attackCorrectionRad: 0.12,
  bodyRadiusM: 0.29, bladeRadiusM: 0.09, hitInterruptCooldownS: 0.85,
  pushImmunityS: 1.3, maxHeavyHoldS: 1.6,
  // 大刀接触窗口里刀刃扫过的 yaw 半幅（起手 +bladeSweepRad 扫到收势 −bladeSweepRad，
  // Alt 分镜左右镜像）。Script_MeleeCombat.ResolveContact 与断肢选段共用这一个数。
  bladeSweepRad: 0.64,
});
export const MELEE_WEAPONS = Object.freeze({
  Dadao: Object.freeze({ label: "大刀", pushReach: 0.95, minReach: 0.38, pushDistance: 0.16, beatReach: 1.72,
    light: Object.freeze({ clip: "Light", windup: 0.17, active: 0.13, recovery: 0.35, reach: 1.58, damage: 52, poise: 31, arcDot: 0.62, cost: 14, lunge: 0 }),
    heavy: Object.freeze({ clip: "Heavy", windup: 0.32, active: 0.18, recovery: 0.86, reach: 1.78, damage: 115, poise: 65, arcDot: 0.70, cost: 32, lunge: 0 }),
  }),
  Bayonet: Object.freeze({ label: "刺刀", pushReach: 1.08, minReach: 0.78, pushDistance: 0.56, beatReach: 1.96,
    light: Object.freeze({ clip: "Light", windup: 0.21, active: 0.12, recovery: 0.36, reach: 2.16, damage: 50, poise: 28, arcDot: 0.91, cost: 13, lunge: 0 }),
    heavy: Object.freeze({ clip: "Heavy", windup: 0.35, active: 0.16, recovery: 0.92, reach: 2.65, damage: 110, poise: 64, arcDot: 0.94, cost: 30, lunge: 0.42 }),
  }),
});
// 多打一的围攻分工。史料：日军 3～4 人拼刺小组互相掩护侧翼后方、佯攻骗刺；
// 平型关老兵王汝林忆几打一「一人佯攻牵制正面，其余从侧方突刺」。见 docs/Data_MeleeQte.md「多打一」。
export const MELEE_SQUAD = Object.freeze({
  roleRefreshS: 0.4, roleHysteresis: 0.22,
  flankSlotsDeg: Object.freeze([-85, 85, -135, 135, -45, 45]),
  flankRadiusInsetM: 0.30, flankStandoffM: 0.55, flankAttackDot: 0.5,
  flankAttackCooldownS: 1.55, circleSpeedScale: 0.9,
  feintS: 0.30, feintEvery: 3, feintRecoveryS: 0.55,
});
export const MELEE_QTE_RULES = Object.freeze({
  maxRate: 7, gainPerPress: 0.125, decayPerS: 0.38, windowS: 4.8,
  standingStart: 0.5, groundStart: 0.28, resolveS: 0.6,
  standingFailureDamage: 12, groundFailureDamage: 72,
  successStaggerS: 1.15,
  // Guarantee a completed get-up and a short actionable window; incoming damage still applies.
  controlRecoveryS: 1, recoveryPoise: 65,
  recoveryAdvantageS: 0.65, cooldownS: 14, perOpponentLimit: 1, contactHoldS: 0.14,
  // 一次性按键（input "press"，第一关 09 灶屋伏击）：辅助档「自动」在窗口开出来多久后替玩家按下。
  pressAutoS: 0.35,
});
export const MELEE_ANIMATION_ACTIONS = Object.freeze([
  "Guard", "Advance", "Retreat", "Light", "LightAlt", "Charge", "Heavy",
  "Parry", "Deflected", "Push", "Pushed", "Hit", "Bind", "BindWin", "BindLose",
  "Fall", "Ground", "GroundWin", "GroundLose", "Pressure", "Rise",
  "ParryLeft", "ParryRight", "Compact", "CompactAlt", "Obstructed", "WeaponClash",
]);
// 2026-11-23 用户：推架（F）与倒地抵抗两类项目撤了 —— 玩家不再有近身推架，倒地 QTE 只由剧本触发。
// 2026-11-23 用户：实验场只要一个对手。面板只列一对一的项目（enemies 1、没有友军）；
// 一对二 / 一对三 / 敌友对练留在表里只给取证口与回归测试（多打一分工是正片在用的规则）。
export const MELEE_SCENARIOS = Object.freeze([
  { id: "DadaoOne", name: "大刀 · 一对一", weapon: "Dadao", enemies: 1, kind: "duel", tip: "看清枪尖，右键拨开后主动向前斩击。" },
  { id: "DadaoTwo", name: "大刀 · 一对二", weapon: "Dadao", enemies: 2, kind: "duel", tip: "一人在正面牵制、另一人绕到侧面；把两人拉回视野内，每次拨挡只带开一支武器。" },
  { id: "DadaoThree", name: "大刀 · 一对三", weapon: "Dadao", enemies: 3, kind: "duel", tip: "正面一人佯攻牵制，两人绕到左右侧翼夹击；转向谁谁就变正面，用走位争取单独交锋。" },
  { id: "BayonetOne", name: "刺刀 · 对刺刀", weapon: "Bayonet", enemies: 1, kind: "duel", tip: "短刺试探，拨开后反刺；长刺有一步突进和较长收招。" },
  { id: "BayonetTwo", name: "刺刀 · 一对二", weapon: "Bayonet", enemies: 2, kind: "duel", tip: "正面佯刺骗你拨挡、侧翼趁机突刺；控制中线，注意长刺挥空后的恢复。" },
  { id: "BayonetThree", name: "刺刀 · 一对三", weapon: "Bayonet", enemies: 3, kind: "duel", tip: "让对手留在视野内，借身体和墙角挡住第二条攻击线路。" },
  { id: "DadaoBind", name: "大刀 · 站立僵持", weapon: "Dadao", enemies: 1, kind: "bind", tip: "贴近后与对手同时蓄力进攻，刀枪硬架触发僵持；连按 F 顶开。" },
  { id: "BayonetBind", name: "刺刀 · 交叉僵持", weapon: "Bayonet", enemies: 1, kind: "bind", tip: "两支枪在近距离同时向前发力会交叉锁住；成功后自行反刺。" },
  { id: "AlliedDadao", name: "友军大刀 · 敌友对练", weapon: "Dadao", enemies: 1, allies: 1, allyWeapon: "Dadao", kind: "observe", tip: "观察友军越过枪尖、斩击与推架；双方使用同一战斗规则。" },
  { id: "AlliedBayonet", name: "友军刺刀 · 敌友对练", weapon: "Bayonet", enemies: 1, allies: 1, allyWeapon: "Bayonet", kind: "observe", tip: "观察两方短刺、拨挡和长刺，或亲自加入战斗。" },
  { id: "ParryTiming", name: "拨挡 · 早／准／晚", weapon: "Dadao", enemies: 1, kind: "timing", tip: "对手重复可读的长刺；按住右键不会延长窗口，成功不会自动反杀。" },
].map(Object.freeze));
// ── 白刃实验场的玩法变体（2026-11-23～11-24 面板切换对照，正片不设变体，一律 classic）──────
//   control  classic  原版：按住左键蓄力，松开出轻／重击
//            drag     拖拽挥砍：按住左键，鼠标带着刀走；往哪个方向一甩，刀就顺着这一甩快速砍下去
//   impact   classic  原版：砍中即退（对方失衡）
//            lodge    卡刀：刀深砍进身体卡住 → 长按 F 拔刀 → 对方踉跄，F 补刀
//            cleave   吃肉顿刀 · 拖刃拉豁：砍进血肉瞬间刀身吃阻顿住、双向咬合，窗口内顺势甩鼠标或再按左键发力拉豁撕扯
//            slide    磕枪顺刃 · 压杆劈杀：右键或挥刀磕住日军刺刀锁在枪管上，按住 W／前推鼠标沿枪管擦出火星欺身，左键顺杆劈杀
//            crush    横枪硬接 · 震断破防：正面挥砍先硬磕日军横枪爆火星、削减护枪架势，重劈或连砍震断破防后 F／左键抢步处决（侧翼绕防直接砍肉）
//            pofeng   破锋全开 · 三合一：横枪硬接破防 ＋ 磕枪顺刃压杆 ＋ 吃肉顿刀拉豁 三套交互同场生效
export const MELEE_VARIANTS = Object.freeze({
  control: Object.freeze(["classic", "drag"]),
  impact: Object.freeze(["classic", "lodge", "cleave", "slide", "crush", "pofeng"]),
});
export const MELEE_CLEAVE = Object.freeze({
  weapons: Object.freeze(["Dadao"]),
  // 吃肉顿刀窗口：刀刃咬进躯干后在 windowS 秒内以 crawlN 极慢阻尼切入；满 minBiteS 秒后允许顺势甩鼠、再点左键或按 F 触发「拖刃拉豁」。
  windowS: 1.15, minBiteS: 0.055, crawlN: 0.11, exitS: 0.22,
  // 触发拉豁：咬合中鼠标累计拉拽 ≥ ripStrokePx（或瞬时速度 ≥ ripSpeedPxPerS），或新按一次左键／F。
  ripStrokePx: 26, ripSpeedPxPerS: 560,
  // 拉豁爆发：刀身高速撕出伤口，追加创伤与失衡，并沿刀刃扫掠切向把对手扯飞。
  ripS: 0.34, ripDamage: 48, ripPoise: 65, wrenchSideM: 0.62, wrenchBackM: 0.28,
  // 世界空间咬合锚点（锁住刀口与躯干，直到拉豁或自然滑出）。
  anchorShoulderM: 1.10, anchorTorsoM: 0.94, anchorSideM: 0.12, lockBlend: 0.82,
});
export const MELEE_SLIDE = Object.freeze({
  weapons: Object.freeze(["Dadao"]),
  // 磕枪锁刃：在 catchReachM 内右键拨接或挥刀迎击正在突刺／挺枪的刺刀，刀口架锁在三八式枪管上。
  catchReachM: 1.92, facingDot: 0.48, startProgress: 0.16, windowS: 1.45,
  // 按住 W（或鼠标前推）沿枪管向护手／咽喉前压推进；松开缓慢回滑；推进每 sparkEveryProgress 迸一次钢火。
  pushRatePerS: 1.85, mousePushPerPx: 0.0045, decayPerS: 0.26, sparkEvery: 0.22,
  // 压过 strikeMinProgress 即可点左键顺杆劈杀；推到底（1.0）自动顺势劈出。
  strikeMinProgress: 0.42, closeTargetDistM: 1.06, closeStepMps: 2.6,
  // 枪管两端世界锚点（相对日军位置沿双方连线）：0 = 刺刀尖端，1 = 前护木／咽喉近端。
  tipOffsetM: 1.18, hiltOffsetM: 0.40, tipHeightM: 1.18, hiltHeightM: 1.34, bindRollRad: -0.58,
  // 顺杆劈杀与超时挣脱参数。
  slashS: 0.24, slashDamage: 120, slashPoise: 85, slashRepelM: 0.36, breakS: 0.30, breakRepelM: 0.26,
});
export const MELEE_CRUSH = Object.freeze({
  weapons: Object.freeze(["Dadao"]),
  // 日军正面 ±35°（facingDot 0.82）端枪戒备时横枪硬接大刀，侧翼走位绕开或趁其收招破绽可直接砍进血肉。
  guardFacingDot: 0.82, maxPoise: 100, regenDelayS: 1.8, regenPerS: 16,
  // 每刀削减护枪架势：轻砍／普通拖刀 38（三刀必破），重劈／下劈 62（两重劈或一轻一重必破）。
  lightDrain: 38, heavyDrain: 62, chipDamage: 6,
  // 硬磕反弹：三拍完整呈现「咬铁相持 → 受力弹回 → 沉腕回架」，对手平滑滑退吃震而非瞬移闪烁。
  bounceS: 0.44, enemyBraceS: 0.62, lightRepelM: 0.26, heavyRepelM: 0.40,
  // 架势清零震断破防：对手门户大开 crushedS 秒，可按 F 抢步处决或任意一刀重创斩杀。
  crushRecoveryS: 0.34, crushedS: 2.40, crushRepelM: 0.52,
  finishReachM: 2.25, finishDamage: 125, finishWindupScale: 0.5,
});
export const MELEE_FEEL = Object.freeze({
  // 大刀挥空、磕铁、砍肉、拉豁／破防第一人称体感与顿帧（仅实验场新交互模式启用，不动正片 classic）。
  swingKickPitchRad: 0.015, swingKickRollRad: 0.024,
  clashKickPitchRad: -0.028, clashKickRollRad: 0.048, clashFovPunch: 0.72,
  fleshKickPitchRad: 0.034, fleshKickRollRad: 0.044, fleshFovPunch: 0.92,
  ripKickPitchRad: 0.046, ripKickRollRad: 0.068, ripFovPunch: 1.15,
  hitstopBlockS: 0.085, hitstopSlideS: 0.055, hitstopFleshS: 0.085,
  hitstopRipS: 0.105, hitstopCrushS: 0.135, hitstopScale: 0.08,
});
export const MELEE_LODGE = Object.freeze({
  weapons: Object.freeze(["Dadao"]),
  // 卡不卡：刀刃吃进身体的深度（刀够得着的长度 − 到对方体表的距离）至少 minDepthM，
  // 且对方在这一刀正中线 ±maxOffAxisRad 以内（砍在边上是擦过去）；轻击力道小，还要再深 lightExtraDepthM。
  minDepthM: 0.42, lightExtraDepthM: 0.06, maxOffAxisRad: 0.42,
  // 卡住之后刀停在接触那一刻再往里吃一点（攻击归一化时间 +pressInN）。
  pressInN: 0.03,
  // 拔刀（2026-11-23 第三轮，用户：「不是 QTE，屏幕上一个圈，长按 F 就拔出来」）：长按 F，holdS 秒把圈走满；
  // 中途松手按 decayPerS 往回退。没有时限 —— 对方挨了这一刀动不了，刀不拔就一直卡着。
  holdS: 0.8, decayPerS: 0.6,
  // 刀吃进去的那一点（2026-11-23 第四轮，用户：「固定在某一个点，例如肩膀，可以转视角，但刀砍的位置不动」）：
  // 对方脚下往上 anchorShoulderM（上撩的几刀落在腰腹 anchorTorsoM），朝刀来的那一侧偏 anchorSideM。
  // 第一人称整副手臂连刀锁在这一点上（世界空间），视角随便转，直到 F 拔出来。对方被钉在原地发抖。
  anchorShoulderM: 1.12, anchorTorsoM: 0.96, anchorSideM: 0.13, tremorRad: 0.05,
  // 拔刀动作时长；对方随即踉跄 reelS 秒：往后倒退、左右打晃。
  yankS: 0.46, yankRepelM: 0.22, reelS: 2.4, reelSpeedMps: 0.55, reelSwayRad: 0.34, reelCycleS: 0.8,
  // 补刀：F 对 finishReachM 内踉跄中的对手自动转身补一刀（起手按 finishWindupScale 缩短）。
  // 起手到接触段里自动转身、以 finishLungeMps 抢步跟进到离刀尖 finishStandoffM 的距离。
  finishReachM: 2.1, finishWindupScale: 0.55, finishTurnRate: 9, finishLungeMps: 4.5, finishStandoffM: 0.4,
});
export const MELEE_DRAG = Object.freeze({
  // 按住左键时鼠标带着刀走：刀架往鼠标那边偏（最多 aimOffsetM，aimRadiusPx 像素到头），松开鼠标 aimReturnS 秒回中。
  aimRadiusPx: 220, aimOffsetM: 0.14, aimReturnS: 0.35, aimRollRad: 0.5,
  // 视角跟着转：按着左键时视角只跟鼠标的 viewFollow 倍（刀走一整步、视角走一半）；实验场面板滑条可调 0–1。
  viewFollow: 0.5,
  // 出刀：最近 windowS 秒里鼠标走过的位移 ≥ minStrokePx，且速度 ≥ triggerPxPerS，就顺着这一甩的方向砍下去。
  windowS: 0.1, minStrokePx: 60, triggerPxPerS: 1200,
  // 点一下（按下到松开不到 tapS 秒、没甩出刀）也出一刀（2026-11-23 第四轮，用户：连点左键好几刀出不来）：
  // 刀架已经偏出去 tapAimPx 以上就顺着偏的方向砍，否则 tapDirection；力道按最轻那一档。
  // 出刀中再点会排进缓冲，这一刀收完马上接下一刀。
  tapS: 0.22, tapAimPx: 40, tapDirection: "upRight",
  // 甩得越快砍得越重：速度从 powerPxPerS[0] 到 [1]，伤害 × powerScale[0] → [1]。
  powerPxPerS: Object.freeze([1200, 3200]), powerScale: Object.freeze([0.85, 1.3]),
  // 一甩就出刀，起手只剩一小段（甩本身就是起手）；收招照常，砍完左键还按着就回到拖拽架势接着甩。
  attack: Object.freeze({ windup: 0.1, active: 0.16, recovery: 0.38, reach: 1.62, damage: 60, poise: 34, arcDot: 0.62, cost: 12, lunge: 0 }),
  // 往下劈（竖劈）更重、收招更长。
  overhead: Object.freeze({ damage: 74, poise: 46, recovery: 0.46 }),
  // 八个来向（刀从哪边来，angleDeg 是「来的那一边」，刀顺着 angleDeg+180° 走）。第一人称刀轨只有一条
  // 「右上 → 左下」的实拍劈砍，八个方向由三样组合：reverse = 倒放（左下 → 右上的上撩），
  // mirror = 左右镜像整副手臂与刀（从左边来的几刀），rollDeg = 绕视线滚转（逆时针为正，只用到 ±45°）。
  // sweep = 接触判定的水平扫向（× bladeSweepRad，正 = 从左往右扫），竖着的两刀扫幅小。
  directions: Object.freeze([
    { id: "upRight", angleDeg: 45, reverse: false, mirror: false, rollDeg: 0, sweep: -1 },
    { id: "right", angleDeg: 0, reverse: false, mirror: false, rollDeg: -45, sweep: -1 },
    { id: "downRight", angleDeg: -45, reverse: true, mirror: true, rollDeg: 0, sweep: -0.7 },
    { id: "down", angleDeg: -90, reverse: true, mirror: false, rollDeg: 45, sweep: 0.25 },
    { id: "downLeft", angleDeg: -135, reverse: true, mirror: false, rollDeg: 0, sweep: 0.7 },
    { id: "left", angleDeg: 180, reverse: false, mirror: true, rollDeg: 45, sweep: 1 },
    { id: "upLeft", angleDeg: 135, reverse: false, mirror: true, rollDeg: 0, sweep: 1 },
    { id: "up", angleDeg: 90, reverse: false, mirror: false, rollDeg: 45, sweep: -0.25 },
  ].map(Object.freeze)),
});
