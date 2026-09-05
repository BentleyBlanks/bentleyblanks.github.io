// Notion《白刃战系统｜大刀与刺刀》融合版，2026-09-06 读取。纯数据。
export const MELEE_RULES = Object.freeze({
  parryWindowS: 0.25, parryRecoveryS: 0.34, parryFacingDot: 0.55,
  parryStaggerS: 0.8, pushStaggerS: 0.65, pushRecoveryS: 0.58,
  pushDistanceM: 0.65, pushCost: 18, parryCost: 9,
  chargeMinS: 0.38, chargeMaxS: 1.15, staminaRecovery: 19,
  engageM: 5.5, separationM: 0.62, bindReachM: 1.15,
  knockdownS: 0.65, riseS: 1.05, staggerS: 0.65,
  poiseRecovery: 17, npcTurnRate: 3.8, npcSpeed: 1.5,
  maxStepS: 1 / 90,
  inputBufferS: 0.18, parrySuccessRecoveryS: 0.12, pushSuccessRecoveryS: 0.14,
  beatContactS: 0.07, beatStaggerS: 0.48, beatCooldownS: 1.1,
  npcTellS: 0.48, npcReactionS: 0.2, npcAimCommitLeadS: 0.16, attackCorrectionRad: 0.12,
  bodyRadiusM: 0.29, bladeRadiusM: 0.09, hitInterruptCooldownS: 0.85,
  pushImmunityS: 1.3, maxHeavyHoldS: 1.6,
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
  recoveryAdvantageS: 0.65, cooldownS: 14, perOpponentLimit: 1, contactHoldS: 0.14,
});
export const MELEE_ANIMATION_ACTIONS = Object.freeze([
  "Guard", "Advance", "Retreat", "Light", "LightAlt", "Charge", "Heavy",
  "Parry", "Deflected", "Push", "Pushed", "Hit", "Bind", "BindWin", "BindLose",
  "Fall", "Ground", "GroundWin", "GroundLose", "Pressure", "Rise",
  "ParryLeft", "ParryRight", "Compact", "CompactAlt", "Obstructed", "WeaponClash",
]);
export const MELEE_ENCOUNTERS = Object.freeze([
  {id:'AutoOne',name:'一对一 · 靠近开始',enemies:1,x:1392,z:1450,trigger:'auto'},
  {id:'AutoTwo',name:'一对二 · 靠近开始',enemies:2,x:1400,z:1450,trigger:'auto'},
  {id:'AutoThree',name:'一对三 · 靠近开始',enemies:3,x:1408,z:1450,trigger:'auto'},
  {id:'UseOne',name:'一对一 · F 开始',enemies:1,x:1392,z:1462,trigger:'interact'},
  {id:'UseTwo',name:'一对二 · F 开始',enemies:2,x:1400,z:1462,trigger:'interact'},
  {id:'UseThree',name:'一对三 · F 开始',enemies:3,x:1408,z:1462,trigger:'interact'},
].map(Object.freeze));
export const MELEE_SCENARIOS = Object.freeze([
  {id:'EncounterField',name:'自由测试场 · 六组遭遇',weapon:'Dadao',enemies:0,kind:'field',tip:'前排 F 开始，后排靠近开始；每排分别为 1／2／3 名对手。1 切刺刀步枪，3 切大刀，V 切换步枪架势。'},
  { id: "DadaoOne", name: "大刀 · 一对一", weapon: "Dadao", enemies: 1, kind: "duel", tip: "看清枪尖，右键拨开后主动向前斩击。" },
  { id: "DadaoTwo", name: "大刀 · 一对二", weapon: "Dadao", enemies: 2, kind: "duel", tip: "一人在正面牵制、另一人绕到侧面；把两人拉回视野内，每次拨挡只带开一支武器。" },
  { id: "DadaoThree", name: "大刀 · 一对三", weapon: "Dadao", enemies: 3, kind: "duel", tip: "正面一人佯攻牵制，两人绕到左右侧翼夹击；转向谁谁就变正面，用走位争取单独交锋。" },
  { id: "BayonetOne", name: "刺刀 · 对刺刀", weapon: "Bayonet", enemies: 1, kind: "duel", tip: "短刺试探，拨开后反刺；长刺有一步突进和较长收招。" },
  { id: "BayonetTwo", name: "刺刀 · 一对二", weapon: "Bayonet", enemies: 2, kind: "duel", tip: "正面佯刺骗你拨挡、侧翼趁机突刺；控制中线，注意长刺挥空后的恢复。" },
  { id: "BayonetThree", name: "刺刀 · 一对三", weapon: "Bayonet", enemies: 3, kind: "duel", tip: "让对手留在视野内，借身体和墙角挡住第二条攻击线路。" },
  { id: "DadaoPush", name: "大刀 · F 推架", weapon: "Dadao", enemies: 1, kind: "push", tip: "进入刀身无法展开的极近距离，F 压枪顶开；推架不造成伤害。" },
  { id: "BayonetPush", name: "刺刀 · F 推枪", weapon: "Bayonet", enemies: 1, kind: "push", tip: "贴身时枪尖够不到人，F 横推枪身制造短刺空间。" },
  { id: "DadaoBind", name: "大刀 · 站立僵持", weapon: "Dadao", enemies: 1, kind: "bind", tip: "贴近后与对手同时蓄力进攻，刀枪硬架触发僵持；连按 F 顶开。" },
  { id: "BayonetBind", name: "刺刀 · 交叉僵持", weapon: "Bayonet", enemies: 1, kind: "bind", tip: "两支枪在近距离同时向前发力会交叉锁住；成功后自行反刺。" },
  { id: "DadaoGround", name: "大刀 · 倒地抵抗", weapon: "Dadao", enemies: 1, kind: "ground", tip: "本项目以低平衡起步，近身遭撞击后对手上前压制；连按 F 推开起身。" },
  { id: "BayonetGround", name: "刺刀 · 倒地抵抗", weapon: "Bayonet", enemies: 1, kind: "ground", tip: "倒地后枪尖随失势逼近；抵抗成功起身，停止输入可验证失败伤害。" },
  { id: "AlliedDadao", name: "友军大刀 · 敌友对练", weapon: "Dadao", enemies: 1, allies: 1, allyWeapon: "Dadao", kind: "observe", tip: "观察友军越过枪尖、斩击与推架；双方使用同一战斗规则。" },
  { id: "AlliedBayonet", name: "友军刺刀 · 敌友对练", weapon: "Bayonet", enemies: 1, allies: 1, allyWeapon: "Bayonet", kind: "observe", tip: "观察两方短刺、拨挡和长刺，或亲自加入战斗。" },
  { id: "ParryTiming", name: "拨挡 · 早／准／晚", weapon: "Dadao", enemies: 1, kind: "timing", tip: "对手重复可读的长刺；按住右键不会延长窗口，成功不会自动反杀。" },
].map(Object.freeze));
