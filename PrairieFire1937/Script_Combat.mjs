// 《燎原 · 敌后1937》 —— 战斗系统（纯逻辑模块）。
//
// 本模块承担全部交战结算：伏击、破袭、攻坚、围困、反扫荡、撤退与战后恢复。
// 设计取向不是"回合制拼血条"，而是敌后游击战的节奏：
//   隐蔽 → 选择有利地形与时机 → 突然打击 → 立刻转移 → 依靠群众基础重新隐蔽。
// 因此：
//   1. 我方单位有"隐蔽/暴露"双态，隐蔽时不可被攻击；一旦开火即暴露。
//   2. 伏击（我在林地山地地道、敌在道路平原开阔地）的期望收益远高于正面强攻。
//   3. 打完不转移，暴露度按 4 倍计，直接把扫荡引到自己头上。
//   4. 群众基础 massBase 决定"看得清不清"：低群众基础地区打仗是睁眼瞎。
//   5. 缴获是"械"的主要来源，也是扩军的主路径；打辎重队、伪军的缴获远高于硬碰日军正规队。
//   6. 保存有生力量在数值上优于战至最后一人：低血量自动撤退，撤退成功率受地形/地道/群众基础影响。
//   7. 平民伤亡、被焚村庄、粮食被夺、骨干损失只进 ledgerDelta 代价账本，
//      绝不转化为任何资源、分数或奖励。战报文案克制、具体，不渲染血腥、不歌颂杀戮。
//
// 纯函数约束：不引用 window / document / three / Math.random。
// 随机数一律从 state.rngState 经 Script_Hex.mjs 的 StepRng 派生并写回新状态，同种子必然复现。
// 所有返回 nextState 的函数都做不可变更新（浅拷贝 + 路径上的对象一并拷贝），绝不原地改传入的 state。
//
// 数值表依赖：Data_Units.mjs / Data_Terrain.mjs 由并行 agent 编写。
// 本模块采用"尝试导入 + 字段缺失回退"的健壮取值方式（见 ResolveUnitStats / ResolveTerrainStats），
// 即便那两个文件尚未到位或字段命名有出入，本模块也能独立跑通。
//
// report 统一形状：
//   { lines:[中文战报], effects:[{kind,key,payload}], captures:{ordnance,grain,medicine},
//     casualties:{ours,theirs}, ledgerDelta:{...}, exposureDelta, moved }
// effects.kind ∈ 'Ambush'|'Sabotage'|'Capture'|'Retreat'|'Siege'|'Smoke'|'FloatingText'

import {
  Clamp,
  Clamp01,
  Lerp,
  HexDistanceKeys,
  HexNeighborKeys,
  HexToWorld,
  ParseHexKey,
  StepRng,
  HashString,
} from "./Script_Hex.mjs";

// ---------------------------------------------------------------------------
// 一、外部数值表的健壮接入
// ---------------------------------------------------------------------------

let externalUnitDefinitions = null;
let externalTerrainDefinitions = null;

try {
  const unitsModule = await import("./Data_Units.mjs");
  externalUnitDefinitions = (unitsModule && unitsModule.unitDefinitions) || null;
} catch (error) {
  externalUnitDefinitions = null;
}

let externalWorkDefinitions = null;

try {
  const terrainModule = await import("./Data_Terrain.mjs");
  externalTerrainDefinitions = (terrainModule && terrainModule.terrainDefinitions) || null;
  externalWorkDefinitions = (terrainModule && terrainModule.workDefinitions) || null;
} catch (error) {
  externalTerrainDefinitions = null;
  externalWorkDefinitions = null;
}

const unitStatsCache = new Map();
const terrainStatsCache = new Map();

/** 允许上层（或测试）显式注入数值表，注入后清空缓存。 */
export function RegisterCombatData(tables = {}) {
  if (tables.unitDefinitions) externalUnitDefinitions = tables.unitDefinitions;
  if (tables.terrainDefinitions) externalTerrainDefinitions = tables.terrainDefinitions;
  unitStatsCache.clear();
  terrainStatsCache.clear();
}

// ---------------------------------------------------------------------------
// 二、可调参数：全部平衡旋钮集中在此
// ---------------------------------------------------------------------------

export const combatConstants = Object.freeze({
  // —— 战力构成 ——
  strengthHpFloor: 0.45, // 兵员残缺时仍保留的战力下限系数
  strengthLevelBonus: 0.09, // 每级经验加成
  strengthXpBonus: 0.12, // 熟练度（xp/100）加成上限
  strengthFatiguePenalty: 0.35, // 疲劳 100 时的战力折损
  strengthMassBonus: 0.22, // 群众基础对我方战力的加成上限
  strengthTunnelBonus: 0.2, // 地道网防御加成
  strengthTrenchBonus: 0.25, // 战壕防御加成
  strengthCacheBonus: 0.08, // 隐蔽物资点的小加成
  strengthBaseControlBonus: 0.12, // 在自己根据地内作战
  strengthEnemyControlPenalty: 0.09, // 深入敌占区作战
  strengthSupportPerNeighbour: 0.07, // 攻方每个可作战友邻的支援
  strengthSupportCap: 0.21, // 攻方支援加成上限
  strengthSupportPerNeighbourDefence: 0.05, // 守方每个可作战友邻的支援
  strengthSupportCapDefence: 0.15, // 守方支援加成上限
  supportMinAttack: 2, // 支援门槛：attack 低于此值的（担架队、辎重队）帮不上火力
  supportMinHpRatio: 0.3, // 支援门槛：残破部队自顾不暇
  flankWinBonus: 0.06, // 合击（支援者与攻击者分居目标两侧）的胜率加成
  flankDamageMultiplier: 1.12, // 合击杀伤倍率
  flankLossMultiplier: 0.92, // 合击时我方减员折损
  flankAngleThreshold: 119.5, // 自目标看两路夹角达到此度数即算合击（两侧 ≥120°）
  strengthScorchPenalty: 0.15, // 焦土（三光后）对我方后勤支撑的削弱
  enemyTerrainUseFactor: 0.65, // 敌军利用地形的效率低于我方（不熟地形）
  strengthFloor: 0.25, // 战力下限，避免除零

  // —— 夜战 ——
  nightPlayerAttackBonus: 0.18, // 夜间我方攻击加成
  nightPlayerDefenceBonus: 0.08,
  nightEnemyPenalty: 0.16, // 夜间敌军普遍削弱
  nightArmourPenalty: 0.45, // 夜间装甲/机械化的额外削弱
  nightArtilleryPenalty: 0.5, // 夜间炮兵观测困难
  nightWinBonus: 0.06, // 夜战对胜负判定的直接加成
  nightLossMultiplier: 0.82, // 夜战我方伤亡系数
  nightRetreatBonus: 0.18, // 夜战撤退成功率加成
  nightExposureRelief: 1.5, // 夜战减少的暴露度

  // —— 伏击（核心机制）——
  // 阈值按 Data_Terrain 的真实隐蔽度标定：高山0.55 林地0.70 峡谷0.60 山脊0.50 沼泽0.48 可设伏；
  // 丘陵0.35 黄土0.40 河川0.14 平原0.06 不可（除非有地道/战壕）。
  ambushCoverThreshold: 0.45, // 我方所在地形隐蔽度达到此值可设伏
  ambushOpenThreshold: 0.6, // 敌方所在地形开阔度达到此值可被伏
  ambushAttackMultiplier: 1.85, // 伏击时有效攻击力倍率
  ambushWinBonus: 0.18, // 伏击对胜负判定的直接加成
  ambushDamageMultiplier: 1.45, // 伏击的杀伤倍率
  ambushLossMultiplier: 0.4, // 伏击时我方伤亡倍率（大幅降低）
  ambushCaptureMultiplier: 1.65, // 伏击的缴获倍率
  ambushExposureRelief: 1.5, // 伏击后更容易脱离接触
  ambushAlertPenalty: 0.5, // 敌军警备度高时伏击效果打折的幅度

  // —— 胜负判定 ——
  oddsSlope: 1.45, // 兵力比 → 胜率的斜率
  oddsFloor: 0.05,
  oddsCeiling: 0.95,
  massOddsBonus: 0.08, // 群众基础带来的判定优势（预警、向导、掩护）
  fortifyOddsPenalty: 0.12, // 打有工事的目标
  decisiveMargin: 0.55, // roll < winChance * 该值 → 干净利落的胜利

  // —— 杀伤与减员 ——
  damageScale: 0.55, // 攻击力 → 杀伤的换算
  damageSoak: 0.02, // 防御力对杀伤的吸收
  damageFailFactor: 0.35, // 未得手时仍能造成的杀伤比例
  damageVarianceSpread: 0.22, // 杀伤浮动 ±22%（均值 1.0）
  lossScale: 0.2, // 我方基础减员 = maxHp * 该值
  lossWinFactor: 0.7, // 得手时的减员系数
  lossFailFactor: 1.5, // 未得手时的减员系数
  lossVarianceSpread: 0.25,
  medicineLossRelief: 0.22, // 药品充足时减员折损
  coverLossRelief: 0.3, // 己方地形隐蔽带来的减员折损上限

  // —— 缴获（械的主来源）——
  // 0.7（单次入账口径）：一次像样的伏击缴获 4~6 械，高于同期任何种田渠道——
  // 「械主要靠缴获」必须是数值现实而不是设计口号。改此值必过冒烟的
  // 「缴获入账与战报严格等值」闸门（曾经双重入账让它实跑在声明值的 2 倍）。
  captureScale: 0.7, // 杀伤 → 缴获械的换算
  // 0.85：缴获的重心是粮——枪养的是仗，粮养的是根据地。打赢一仗能让全县
  // 少饿一季，这是"打仗保民"传导链上最粗的一根管子。
  captureGrainRatio: 0.85, // 缴获中粮的比例
  captureMedicineRatio: 0.16, // 缴获中药的比例
  captureMassBonus: 0.4, // 群众基础带来的搬运/清理战场效率
  captureWithdrawPenalty: 0.85, // 打完立即转移，来不及全部搬走
  captureNoWithdrawBonus: 1.0, // 留在原地清理战场（但暴露度是 4 倍代价）
  captureVarianceSpread: 0.2,

  // —— 暴露度：打完必须转移 ——
  exposureAttackBase: 6, // 一次交火的基础暴露
  exposureDamageFactor: 0.05, // 战果越大越显眼
  exposureStrongholdBonus: 4, // 打据点动静更大
  exposureMassRelief: 2.5, // 群众基础掩护
  exposureWithdrawFactor: 0.5, // 打完转移
  exposureStayFactor: 2, // 打完赖着不走（= 转移的 4 倍）
  exposureFloor: 1.5,
  exposureSabotageBase: 4,
  exposureSweepRelief: 12, // 反扫荡后跳出合围可显著降低暴露

  // —— 撤退优先于死拼 ——
  retreatHpThreshold: 0.34, // 低于此血量比自动尝试撤退
  retreatBaseChance: 0.52,
  retreatTerrainBonus: 0.3, // 地形隐蔽度对撤退的加成上限
  retreatTunnelBonus: 0.22,
  retreatMassBonus: 0.24,
  retreatHiddenBonus: 0.12,
  retreatFailLoss: 0.16, // 撤退失败追加的减员比例
  retreatFatigue: 14,
  lastStandLossMultiplier: 2.4, // 不撤退硬顶的减员放大（数值上必须比撤退亏）

  // —— 掩护（Screen 能力：侦察员 / 担架卫生队 / 骑兵通信）——
  screenRetreatBonus: 0.15, // 同格或相邻有掩护友军时的撤退成功率加成
  screenFailLossFactor: 0.5, // 掩护在侧时撤退失败的追加减员折半
  screenExposureFactor: 0.8, // 掩护在侧时打完转移的暴露度增量折扣

  // —— 救护（Heal 能力：担架卫生队）——
  healBaseAmount: 6, // 每回合为同格/相邻友军补充的兵员基数
  healSuppliedAmount: 9, // 药品库存充足（≥ healMedicineThreshold）时的救护量
  healMedicineThreshold: 10, // 药品充足线
  healMedicineCost: 0.5, // 每救护一支部队消耗的药
  healNoMedicineFactor: 0.5, // 无药时救护量减半

  // —— 隐蔽恢复 ——
  hiddenRecoverBase: 0.2,
  hiddenRecoverMass: 0.45, // 群众基础掩护
  hiddenRecoverTerrain: 0.3,
  hiddenRecoverTunnel: 0.15,
  hiddenRecoverMovedBonus: 0.18, // 转移过的更容易重新隐蔽
  hiddenRecoverFatiguePenalty: 0.2,

  // —— 攻坚 ——
  siegeOrdnanceCost: 12, // 一次强攻消耗的械
  siegeBlockadeGrainCost: 3, // 围困每回合的口粮开销
  siegeLossScale: 0.28,
  siegeCapabilityLossReduction: 0.45, // 具备攻坚能力的减员折损
  siegeNoCapabilityLossMultiplier: 3.4, // 无爆破组硬打炮楼的伤亡放大
  siegeNoCapabilityOddsPenalty: 0.3,
  siegeNoOrdnanceOddsPenalty: 0.22,
  siegeNoOrdnanceLossMultiplier: 1.6,
  siegeCapabilityAttackBonus: 0.6, // 爆破/工兵的破墙加成
  siegeNoCapabilityAttackPenalty: 0.45, // 无攻坚能力的攻击折损
  siegeGarrisonDamageScale: 0.42,
  siegeCaptureOrdnance: 26, // 拔掉据点的缴获基准
  siegeCaptureGrain: 40,
  siegeCaptureMedicine: 8,
  blockadeSupplyDrain: 2, // 围困每回合削减的补给
  blockadeGarrisonDrain: 0.06, // 断粮后守备每回合的自然减员比例
  blockadeSurrenderBase: 0.18, // 断粮后每回合的瓦解概率
  blockadeMassBonus: 0.35, // 群众基础越好，围困越严（送不进给养）

  // —— 破袭 ——
  sabotageOrdnanceCost: 4,
  sabotageBaseChance: 0.62,
  sabotageMassBonus: 0.26,
  sabotageNightBonus: 0.12,
  sabotageSkillBonus: 0.2, // 爆破组/工兵加成
  sabotageRailTurns: 3, // 铁路被破坏后需抢修的回合
  sabotageRoadTurns: 2,
  sabotageAlertGain: 5,
  sabotageCaptureOrdnance: 8,
  sabotageCaptureGrain: 8,

  // —— 反扫荡 ——
  sweepRadius: 2,
  sweepStanceProfiles: Object.freeze({
    Disperse: Object.freeze({
      name: "分散转移·坚壁清野",
      ourLossFactor: 0.28,
      theirLossFactor: 0.35,
      civilianFactor: 0.22,
      villageFactor: 0.14,
      grainFactor: 0.15,
      cadreFactor: 0.12,
      displacedFactor: 0.8,
      exposureFactor: -1,
      captureFactor: 0.15,
    }),
    Decisive: Object.freeze({
      name: "正面决战",
      ourLossFactor: 1.6,
      theirLossFactor: 1.05,
      civilianFactor: 1,
      villageFactor: 1,
      grainFactor: 0.85,
      cadreFactor: 1,
      displacedFactor: 1.2,
      exposureFactor: 0.6,
      captureFactor: 0.55,
    }),
    // 敌进我进：外线出击换敌早撤，但留在里面的百姓比坚壁清野时暴露——
    // 民损系数必须高于 Disperse，否则它成为全维度支配的默认项（第二轮评审 P1）。
    CounterRaid: Object.freeze({
      name: "敌进我进",
      ourLossFactor: 0.5,
      theirLossFactor: 0.85,
      civilianFactor: 0.52,
      villageFactor: 0.34,
      grainFactor: 0.4,
      cadreFactor: 0.3,
      displacedFactor: 1.05,
      exposureFactor: -0.4,
      captureFactor: 1.4,
    }),
    // 依托工事：文案承诺"掩护群众转移"，民损系数必须兑现这句话——
    // 它的真实代价是部队顶在工事里挨打，而不是百姓遭殃。
    Fortify: Object.freeze({
      name: "依托工事节节抗击",
      ourLossFactor: 0.95,
      theirLossFactor: 0.7,
      civilianFactor: 0.34,
      villageFactor: 0.4,
      grainFactor: 0.38,
      cadreFactor: 0.42,
      displacedFactor: 0.65,
      exposureFactor: 0.1,
      captureFactor: 0.35,
    }),
    // 没来得及定下方针：机关与部队仓促疏散，处处被动——
    // 各维度都比四个主动方针里最差的那个再差一档（"不表态"不许是白拿的最优）。
    Unprepared: Object.freeze({
      name: "仓促应变",
      ourLossFactor: 0.9,
      theirLossFactor: 0.3,
      civilianFactor: 0.75,
      villageFactor: 0.7,
      grainFactor: 0.7,
      cadreFactor: 0.7,
      displacedFactor: 1.15,
      exposureFactor: 0.2,
      captureFactor: 0.1,
    }),
  }),
  sweepCivilianBase: 6, // 每个受扫荡村庄的平民伤亡基数（只进账本）
  sweepVillageBase: 0.9,
  sweepGrainBase: 14,
  sweepDisplacedBase: 40,
  sweepCadreBase: 0.7,
  sweepTunnelRelief: 0.45, // 地道网对平民损失的削减
  sweepMassRelief: 0.4, // 群众基础（坚壁清野执行得好）对损失的削减

  // —— 情报迷雾：低群众基础地区的预览误差 ——
  previewFogFloor: 0.15, // 情报质量高于此值时预览完全准确
  previewFogSpread: 0.35,

  // —— 恢复 ——
  recoverHpBase: 0.05, // 每回合基础恢复（maxHp 比例）
  recoverHpMass: 0.05,
  recoverHpBase2: 0.04, // 在根据地控制区的额外恢复
  recoverHpMedicine: 0.06, // 药品支持的额外恢复
  recoverMedicineCostPerHp: 0.08,
  recoverFatigue: 14,
  recoverFatigueMass: 10,
  enemyRecoverHp: 0.06,

  // —— 其它 ——
  spotHiddenThreshold: 0.85, // 敌搜索能力 × 暴露程度 超过此值才能发现隐蔽单位
  minTargetHp: 0,
  attackRangeDefault: 1,
  xpPerEngagement: 6,
  xpPerLevel: 100,
});

// ---------------------------------------------------------------------------
// 三、内置回退数值表
// ---------------------------------------------------------------------------

const defaultUnitStats = Object.freeze({
  // —— 我方 ——
  Guerrilla: { name: "游击队", side: "Player", attack: 9, defence: 7, hp: 60, moves: 4, concealment: 0.85, siege: 0, captureBonus: 1.15, retreatBonus: 1.2, range: 1 },
  Militia: { name: "民兵", side: "Player", attack: 6, defence: 6, hp: 50, moves: 3, concealment: 0.7, siege: 0, captureBonus: 1, retreatBonus: 1.15, range: 1 },
  DistrictSquad: { name: "区小队", side: "Player", attack: 7, defence: 7, hp: 55, moves: 3, concealment: 0.75, siege: 0, captureBonus: 1.1, retreatBonus: 1.18, range: 1 },
  RegularCompany: { name: "主力连", side: "Player", attack: 14, defence: 12, hp: 90, moves: 3, concealment: 0.5, siege: 0.2, captureBonus: 1, retreatBonus: 0.95, range: 1 },
  Scout: { name: "侦察班", side: "Player", attack: 5, defence: 5, hp: 40, moves: 5, concealment: 0.95, siege: 0, captureBonus: 1, retreatBonus: 1.4, range: 1, intel: 2, screen: 1 },
  DemolitionTeam: { name: "爆破组", side: "Player", attack: 8, defence: 5, hp: 45, moves: 3, concealment: 0.8, siege: 1, captureBonus: 1.2, retreatBonus: 1.1, range: 1, sabotage: 1 },
  Engineer: { name: "工兵排", side: "Player", attack: 7, defence: 8, hp: 55, moves: 3, concealment: 0.6, siege: 0.8, captureBonus: 1, retreatBonus: 1, range: 1, sabotage: 0.8 },
  ArmedWorkTeam: { name: "武工队", side: "Player", attack: 8, defence: 6, hp: 45, moves: 4, concealment: 0.9, siege: 0.15, captureBonus: 1.35, retreatBonus: 1.3, range: 1, sabotage: 0.5, intel: 1.5 },
  Cavalry: { name: "骑兵班", side: "Player", attack: 10, defence: 6, hp: 55, moves: 6, concealment: 0.45, siege: 0, captureBonus: 1.05, retreatBonus: 1.35, range: 1, screen: 1 },
  StretcherTeam: { name: "担架队", side: "Player", attack: 1, defence: 3, hp: 35, moves: 3, concealment: 0.75, siege: 0, captureBonus: 0.6, retreatBonus: 1.25, range: 1, medic: 1, screen: 1 },
  MortarTeam: { name: "迫击炮班", side: "Player", attack: 12, defence: 5, hp: 45, moves: 2, concealment: 0.5, siege: 0.6, captureBonus: 0.9, retreatBonus: 0.9, range: 2 },

  // —— 敌方 ——
  JapaneseInfantry: { name: "日军步兵中队", side: "Enemy", attack: 16, defence: 15, hp: 100, moves: 3, concealment: 0.2, lootValue: 0.28, armour: 0.15, range: 1 },
  GarrisonTroop: { name: "日军守备队", side: "Enemy", attack: 12, defence: 17, hp: 90, moves: 2, concealment: 0.25, lootValue: 0.3, armour: 0.1, range: 1 },
  PuppetInfantry: { name: "伪军", side: "Enemy", attack: 8, defence: 8, hp: 70, moves: 3, concealment: 0.3, lootValue: 0.62, armour: 0, range: 1, morale: 0.55 },
  SupplyColumn: { name: "辎重队", side: "Enemy", attack: 4, defence: 5, hp: 60, moves: 3, concealment: 0.15, lootValue: 1, armour: 0, range: 1, morale: 0.5 },
  ArmoredCar: { name: "装甲车", side: "Enemy", attack: 18, defence: 20, hp: 80, moves: 5, concealment: 0.1, lootValue: 0.18, armour: 0.6, range: 1, mechanised: 1 },
  ArtilleryTeam: { name: "炮兵小队", side: "Enemy", attack: 20, defence: 8, hp: 60, moves: 2, concealment: 0.2, lootValue: 0.45, armour: 0.05, range: 2, artillery: 1 },
  SecretPolice: { name: "特务队", side: "Enemy", attack: 9, defence: 9, hp: 55, moves: 4, concealment: 0.55, lootValue: 0.4, armour: 0, range: 1, detection: 1.6 },
  CavalryPatrol: { name: "骑兵搜索队", side: "Enemy", attack: 11, defence: 9, hp: 65, moves: 6, concealment: 0.2, lootValue: 0.5, armour: 0, range: 1, detection: 1.2 },
});

// Data_Units.mjs 使用自己的一套单位 key（GuerrillaSquad / JapaneseInfantryCompany …），
// 且只提供 attack/defence/maxHp/moves/concealment/ambush/abilities/role，
// 不提供缴获率、装甲、搜索力等"战斗经济"字段。下面两张表负责把它们桥接过来：
// 先按 key 找同型样板，再按 role 兜底，最后才落到通用默认。
const unitKeyAliases = Object.freeze({
  GuerrillaSquad: "Guerrilla",
  MilitiaSelfDefence: "Militia",
  CountyCompany: "DistrictSquad",
  MainForceCompany: "RegularCompany",
  StretcherMedicTeam: "StretcherTeam",
  CavalryCourier: "Cavalry",
  JapaneseInfantryCompany: "JapaneseInfantry",
  PunitiveColumn: "JapaneseInfantry",
  PuppetGarrison: "PuppetInfantry",
  KempeitaiAgents: "SecretPolice",
  CavalryScouts: "CavalryPatrol",
  EngineerDetachment: "GarrisonTroop",
  ArtillerySection: "ArtilleryTeam",
});

// 按 role 兜底的"战斗经济"字段。lootValue 是缴获率，直接决定"打谁最划算"：
// 打伪军守备、辎重、工兵队缴获丰厚；硬碰日军正规队与装甲车缴获极少。
const roleCombatProfiles = Object.freeze({
  Guerrilla: { side: "Player", captureBonus: 1.15, retreatBonus: 1.2 },
  Militia: { side: "Player", captureBonus: 1, retreatBonus: 1.15 },
  Local: { side: "Player", captureBonus: 1.1, retreatBonus: 1.15 },
  Regular: { side: "Player", captureBonus: 1, retreatBonus: 0.95 },
  Recon: { side: "Player", captureBonus: 1, retreatBonus: 1.4, intel: 2, detection: 1.4 },
  Engineer: { side: "Player", captureBonus: 1.2, retreatBonus: 1.1 },
  Support: { side: "Player", captureBonus: 0.6, retreatBonus: 1.25, medic: 1 },
  Courier: { side: "Player", captureBonus: 1.05, retreatBonus: 1.35 },
  Special: { side: "Player", captureBonus: 1.35, retreatBonus: 1.3, intel: 1.5 },
  Line: { side: "Enemy", lootValue: 0.28, armour: 0.12 },
  Sweep: { side: "Enemy", lootValue: 0.34, armour: 0.08, detection: 1.3 },
  Garrison: { side: "Enemy", lootValue: 0.62 },
  Security: { side: "Enemy", lootValue: 0.4, detection: 1.6 },
  Motor: { side: "Enemy", lootValue: 0.18, armour: 0.6, mechanised: 1 },
  Artillery: { side: "Enemy", lootValue: 0.45, artillery: 1, range: 2 },
  Supply: { side: "Enemy", lootValue: 1, morale: 0.5 },
});

const defaultTerrainStats = Object.freeze({
  Mountain: { name: "高山", moveCost: 3, defenceBonus: 0.45, concealment: 0.7, openness: 0.1 },
  Ridge: { name: "山脊", moveCost: 3, defenceBonus: 0.4, concealment: 0.65, openness: 0.15 },
  Hill: { name: "丘陵", moveCost: 2, defenceBonus: 0.28, concealment: 0.5, openness: 0.35 },
  Forest: { name: "林地", moveCost: 2, defenceBonus: 0.3, concealment: 0.9, openness: 0.1 },
  Plain: { name: "平原", moveCost: 1, defenceBonus: 0, concealment: 0.12, openness: 1 },
  Loess: { name: "黄土塬", moveCost: 1, defenceBonus: 0.12, concealment: 0.35, openness: 0.75 },
  Marsh: { name: "沼泽", moveCost: 3, defenceBonus: 0.18, concealment: 0.6, openness: 0.3 },
  River: { name: "河川", moveCost: 2, defenceBonus: 0.1, concealment: 0.3, openness: 0.7 },
  Gorge: { name: "峡谷", moveCost: 2, defenceBonus: 0.35, concealment: 0.75, openness: 0.2 },
});

const defaultStrongholdStats = Object.freeze({
  Blockhouse: { name: "炮楼", defence: 22, garrison: 30, siegeResistance: 1, supply: 6, ordnance: 1 },
  Garrison: { name: "据点", defence: 28, garrison: 55, siegeResistance: 1.25, supply: 8, ordnance: 1.5 },
  CountySeat: { name: "县城", defence: 36, garrison: 90, siegeResistance: 1.6, supply: 12, ordnance: 2.4 },
  RailStation: { name: "火车站", defence: 24, garrison: 45, siegeResistance: 1.1, supply: 9, ordnance: 1.8 },
});

// ---------------------------------------------------------------------------
// 四、健壮取值：外部表缺字段时逐项回落到内置默认
// ---------------------------------------------------------------------------

function PickNumber(source, names, fallback) {
  if (!source) return fallback;
  for (const name of names) {
    const value = source[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  // 部分数值表把战斗数值收在子对象里
  const nested = source.combat || source.stats || source.values;
  if (nested) {
    for (const name of names) {
      const value = nested[name];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

function PickText(source, names, fallback) {
  if (!source) return fallback;
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.length) return value;
  }
  return fallback;
}

/** 外部单位若带 abilities 数组，则能力表就是权威来源：有该能力返回 1，无则返回 0。 */
function AbilityLevel(external, name) {
  if (!external || !Array.isArray(external.abilities)) return null;
  return external.abilities.includes(name) ? 1 : 0;
}

/** 选出该单位的回退样板：先按 key 找同型，再按 role 兜底。 */
function ResolveFallbackUnit(key, external) {
  const archetype = defaultUnitStats[key] || defaultUnitStats[unitKeyAliases[key]] || null;
  const role = external && typeof external.role === "string" ? external.role : null;
  const roleProfile = role ? roleCombatProfiles[role] : null;
  if (archetype && roleProfile) return { ...archetype, ...roleProfile };
  return archetype || roleProfile || defaultUnitStats.Guerrilla;
}

/** 单位数值解析：外部 Data_Units.mjs 优先，字段缺失时逐项回落内置表 / role 兜底。 */
export function ResolveUnitStats(type) {
  const key = String(type || "Guerrilla");
  const cached = unitStatsCache.get(key);
  if (cached) return cached;
  const external = externalUnitDefinitions ? externalUnitDefinitions[key] : null;
  const fallback = ResolveFallbackUnit(key, external);
  const sideText = PickText(external, ["side", "faction", "owner"], fallback.side || "Player");
  const stats = Object.freeze({
    key,
    name: PickText(external, ["name", "label", "title"], fallback.name || key),
    side: sideText === "Enemy" || sideText === "enemy" ? "Enemy" : "Player",
    attack: PickNumber(external, ["attack", "atk", "offence", "power", "strength"], fallback.attack ?? 8),
    defence: PickNumber(external, ["defence", "defense", "def", "toughness"], fallback.defence ?? 7),
    hp: PickNumber(external, ["hp", "maxHp", "health"], fallback.hp ?? 55),
    moves: PickNumber(external, ["moves", "maxMoves", "movement"], fallback.moves ?? 3),
    concealment: Clamp01(PickNumber(external, ["concealment", "stealth", "hide"], fallback.concealment ?? 0.6)),
    // 攻坚 / 爆破能力：外部表若给了 abilities 数组，就以能力表为准
    siege: Clamp(PickNumber(external, ["siege", "breach", "engineering"], AbilityLevel(external, "Siege") ?? fallback.siege ?? 0), 0, 2),
    sabotage: Clamp(PickNumber(external, ["sabotage", "demolition"], AbilityLevel(external, "Sabotage") ?? fallback.sabotage ?? 0), 0, 2),
    tunnel: Clamp(PickNumber(external, ["tunnel"], AbilityLevel(external, "Tunnel") ?? 0), 0, 1),
    // 设伏天赋：Data_Units 的 ambush 字段（0..0.4），缺失时由隐蔽度推算
    ambushAptitude: Clamp(PickNumber(external, ["ambush", "ambushBonus"], fallback.ambush ?? (fallback.concealment ?? 0.6) * 0.4), 0, 0.6),
    captureBonus: PickNumber(external, ["captureBonus", "loot", "salvage"], fallback.captureBonus ?? 1),
    retreatBonus: PickNumber(external, ["retreatBonus", "evasion", "agility"], fallback.retreatBonus ?? 1),
    range: Math.max(1, Math.round(PickNumber(external, ["range", "reach"], fallback.range ?? 1))),
    intel: PickNumber(external, ["intel", "scouting"], (AbilityLevel(external, "Recon") ? 1.5 : null) ?? fallback.intel ?? 0),
    medic: PickNumber(external, ["medic", "medical"], AbilityLevel(external, "Heal") ?? fallback.medic ?? 0),
    screen: Clamp(PickNumber(external, ["screen", "cover"], AbilityLevel(external, "Screen") ?? fallback.screen ?? 0), 0, 1),
    lootValue: Clamp01(PickNumber(external, ["lootValue", "captureRate", "salvageValue"], fallback.lootValue ?? 0.35)),
    armour: Clamp01(PickNumber(external, ["armour", "armor", "plating"], fallback.armour ?? 0)),
    mechanised: PickNumber(external, ["mechanised", "mechanized", "motorised"], fallback.mechanised ?? 0),
    artillery: PickNumber(external, ["artillery", "gunnery"], fallback.artillery ?? 0),
    detection: PickNumber(external, ["detection", "search"], fallback.detection ?? (AbilityLevel(external, "Recon") ? 1.3 : 1)),
    morale: Clamp01(PickNumber(external, ["morale", "resolve"], fallback.morale ?? 0.85)),
  });
  unitStatsCache.set(key, stats);
  return stats;
}

/** 地形数值解析：外部 Data_Terrain.mjs 优先，缺失回落。openness 缺失时由隐蔽度反推。 */
export function ResolveTerrainStats(terrain) {
  const key = String(terrain || "Plain");
  const cached = terrainStatsCache.get(key);
  if (cached) return cached;
  const fallback = defaultTerrainStats[key] || defaultTerrainStats.Plain;
  const external = externalTerrainDefinitions ? externalTerrainDefinitions[key] : null;
  const concealment = Clamp01(PickNumber(external, ["concealment", "cover", "stealth"], fallback.concealment ?? 0.3));
  const stats = Object.freeze({
    key,
    name: PickText(external, ["name", "label"], fallback.name || key),
    moveCost: PickNumber(external, ["moveCost", "movementCost", "cost"], fallback.moveCost ?? 1),
    defenceBonus: PickNumber(external, ["defenceBonus", "defenseBonus", "defence", "defenceModifier"], fallback.defenceBonus ?? 0),
    concealment,
    openness: Clamp01(PickNumber(external, ["openness", "exposure", "open"], fallback.openness ?? 1 - concealment)),
  });
  terrainStatsCache.set(key, stats);
  return stats;
}

/**
 * 地块的实际战斗数值 = 地形数值 + 该格已建工事的叠加。
 *
 * 工事的 concealmentDelta / defenceBonus 此前从未被任何模块读取，
 * 玩家修的交通壕、地道、坚壁窖在战斗里完全不起作用。这里把这条链路接上：
 * 战斗层一律用本函数取值，不要再直接调 ResolveHexStats(hex)。
 */
export function ResolveHexStats(hex) {
  const base = ResolveTerrainStats(hex && hex.terrain);
  const works = Array.isArray(hex && hex.works) ? hex.works : [];
  if (!works.length || !externalWorkDefinitions) return base;

  let concealment = base.concealment;
  let defenceBonus = base.defenceBonus;
  let moveCost = base.moveCost;
  for (const work of works) {
    const effects = externalWorkDefinitions[work] && externalWorkDefinitions[work].effects;
    if (!effects) continue;
    concealment += Number(effects.concealmentDelta) || 0;
    defenceBonus += Number(effects.defenceBonus) || 0;
    moveCost += Number(effects.moveCostDelta) || 0;
  }
  concealment = Clamp01(concealment);
  return Object.freeze({
    key: base.key,
    name: base.name,
    moveCost: Math.max(0.5, moveCost),
    defenceBonus,
    concealment,
    openness: Clamp01(1 - concealment),
  });
}

/** 该格工事提供的破袭加成（破路、隐蔽接近路线等）。 */
export function WorkSabotageBonus(hex) {
  const works = Array.isArray(hex && hex.works) ? hex.works : [];
  if (!works.length || !externalWorkDefinitions) return 0;
  let bonus = 0;
  for (const work of works) {
    bonus += Number(externalWorkDefinitions[work]?.effects?.sabotageBonus) || 0;
  }
  return Clamp(bonus, 0, 0.4);
}

/** 该格工事给敌方增加的移动消耗（破路、路障）。供 AI 的机动评估使用。 */
export function WorkEnemyMoveCost(hex) {
  const works = Array.isArray(hex && hex.works) ? hex.works : [];
  if (!works.length || !externalWorkDefinitions) return 0;
  let extra = 0;
  for (const work of works) {
    extra += Number(externalWorkDefinitions[work]?.effects?.enemyMoveCostDelta) || 0;
  }
  return Math.max(0, extra);
}

function ResolveStrongholdStats(type) {
  return defaultStrongholdStats[String(type)] || defaultStrongholdStats.Blockhouse;
}

// ---------------------------------------------------------------------------
// 五、状态读取与不可变更新工具
// ---------------------------------------------------------------------------

function GetHex(state, key) {
  if (!state || !state.map || !state.map.hexes) return null;
  return state.map.hexes[key] || null;
}

function FindUnit(state, unitId) {
  const units = (state && state.units) || [];
  for (const unit of units) if (unit && unit.id === unitId) return unit;
  return null;
}

function FindEnemyAt(state, key) {
  const enemies = (state && state.enemies) || [];
  for (const enemy of enemies) if (enemy && enemy.key === key && (enemy.hp ?? 1) > 0) return enemy;
  return null;
}

function FindStrongholdAt(state, key) {
  const strongholds = (state && state.strongholds) || [];
  for (const item of strongholds) if (item && item.key === key) return item;
  return null;
}

function FindStronghold(state, strongholdId) {
  const strongholds = (state && state.strongholds) || [];
  for (const item of strongholds) if (item && item.id === strongholdId) return item;
  return null;
}

/**
 * 统计能实际参战的支援友军，并判定合击态势。
 * 支援门槛：attack ≥ supportMinAttack 且兵员高于 supportMinHpRatio——
 * 担架队、辎重队站在旁边帮不上火力，残破部队自顾不暇。
 *
 * options:
 *   targetKey       攻击场合传入。支援者可在攻击者身旁，也可在目标另一侧压上（合击）；
 *                   若存在与攻击者分居目标两侧（自目标看夹角 ≥120°）的支援者，flank 为真。
 *   includeSameHex  反扫荡等防御场合传入：同格友军一并计入。
 *
 * 我方单位从 state.units 找同伴，敌方单位从 state.enemies 找同伴。
 * 返回 { count, flank, flankDirection }。
 */
function CountFriendlySupport(state, unit, options = {}) {
  const result = { count: 0, flank: false, flankDirection: null };
  if (!unit) return result;
  const constants = combatConstants;
  const isEnemy = (unit.side || ResolveUnitStats(unit.type).side) === "Enemy";
  const pool = isEnemy ? (state && state.enemies) || [] : (state && state.units) || [];
  const neighbours = new Set(HexNeighborKeys(unit.key));
  const targetKey = options.targetKey || null;
  const targetNeighbours = targetKey ? new Set(HexNeighborKeys(targetKey)) : null;
  for (const other of pool) {
    if (!other || other.id === unit.id) continue;
    if ((other.hp ?? 0) <= 0) continue;
    const stats = ResolveUnitStats(other.type);
    if ((stats.attack ?? 0) < constants.supportMinAttack) continue;
    const maxHp = other.maxHp || stats.hp || 1;
    if ((other.hp ?? maxHp) <= maxHp * constants.supportMinHpRatio) continue;
    const besideUs = neighbours.has(other.key) || (options.includeSameHex && other.key === unit.key);
    const besideTarget = Boolean(targetNeighbours && targetNeighbours.has(other.key) && other.key !== unit.key);
    if (!besideUs && !besideTarget) continue;
    result.count += 1;
    if (targetKey && !result.flank && SupportAngle(targetKey, unit.key, other.key) >= constants.flankAngleThreshold) {
      result.flank = true;
      result.flankDirection = CompassLabel(targetKey, other.key);
    }
  }
  return result;
}

/** 自目标看，攻击者与支援者两个来向的夹角（度）。 */
function SupportAngle(targetKey, attackerKey, supporterKey) {
  const target = ParseHexKey(targetKey);
  const attacker = ParseHexKey(attackerKey);
  const supporter = ParseHexKey(supporterKey);
  const origin = HexToWorld(target.q, target.r);
  const a = HexToWorld(attacker.q, attacker.r);
  const b = HexToWorld(supporter.q, supporter.r);
  const ax = a.x - origin.x;
  const az = a.z - origin.z;
  const bx = b.x - origin.x;
  const bz = b.z - origin.z;
  const magnitude = Math.sqrt(ax * ax + az * az) * Math.sqrt(bx * bx + bz * bz);
  if (magnitude < 1e-9) return 0;
  const cosine = Clamp((ax * bx + az * bz) / magnitude, -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** 自 fromKey 看 toKey 的大致方位（战报叙事用；世界坐标 +z 朝屏幕下方）。 */
function CompassLabel(fromKey, toKey) {
  const from = ParseHexKey(fromKey);
  const to = ParseHexKey(toKey);
  const a = HexToWorld(from.q, from.r);
  const b = HexToWorld(to.q, to.r);
  const east = b.x - a.x;
  const north = a.z - b.z;
  const angle = (Math.atan2(north, east) * 180) / Math.PI;
  const names = ["东", "东北", "北", "西北", "西", "西南", "南", "东南"];
  const index = Math.round(((angle + 360) % 360) / 45) % 8;
  return names[index];
}

/** 同格或相邻是否有具备「掩护」能力的可用友军（侦察员、担架卫生队、骑兵通信）。 */
function HasScreenSupport(state, unit) {
  if (!unit) return false;
  const units = (state && state.units) || [];
  for (const other of units) {
    if (!other || other.id === unit.id) continue;
    if ((other.hp ?? 0) <= 0) continue;
    if (other.key !== unit.key && HexDistanceKeys(other.key, unit.key) > 1) continue;
    if (ResolveUnitStats(other.type).screen > 0) return true;
  }
  return false;
}

function Round1(value) {
  return Math.round(value * 10) / 10;
}

function RoundInt(value) {
  return Math.max(0, Math.round(value));
}

function EmptyLedger() {
  return { civilianDeaths: 0, displaced: 0, villagesBurned: 0, cadreLost: 0, grainSeized: 0 };
}

function EmptyCaptures() {
  return { ordnance: 0, grain: 0, medicine: 0 };
}

/** 建立一份"草稿"：所有写操作都落在拷贝上，原 state 保持不变。 */
function CreateDraft(state) {
  return {
    source: state,
    next: { ...state },
    mapCopied: false,
    unitsCopied: false,
    enemiesCopied: false,
    strongholdsCopied: false,
    stockCopied: false,
    ledgerCopied: false,
    logCopied: false,
    rngState: (Number(state && state.rngState) >>> 0) || 0x9e3779b9,
  };
}

function DraftDraw(draft) {
  const stepped = StepRng(draft.rngState);
  draft.rngState = stepped.state;
  return stepped.value;
}

function DraftHex(draft, key) {
  if (!draft.next.map || !draft.next.map.hexes) return null;
  if (!draft.mapCopied) {
    draft.next.map = { ...draft.next.map, hexes: { ...draft.next.map.hexes } };
    draft.mapCopied = true;
  }
  const original = draft.next.map.hexes[key];
  if (!original) return null;
  const copy = { ...original, works: Array.isArray(original.works) ? original.works.slice() : [] };
  draft.next.map.hexes[key] = copy;
  return copy;
}

function DraftUnit(draft, unitId) {
  if (!Array.isArray(draft.next.units)) return null;
  if (!draft.unitsCopied) {
    draft.next.units = draft.next.units.slice();
    draft.unitsCopied = true;
  }
  const index = draft.next.units.findIndex((unit) => unit && unit.id === unitId);
  if (index < 0) return null;
  const original = draft.next.units[index];
  const copy = {
    ...original,
    orders: original.orders && typeof original.orders === "object" ? { ...original.orders } : original.orders,
    combat: original.combat && typeof original.combat === "object" ? { ...original.combat } : {},
  };
  draft.next.units[index] = copy;
  return copy;
}

function DraftEnemy(draft, enemyId) {
  if (!Array.isArray(draft.next.enemies)) return null;
  if (!draft.enemiesCopied) {
    draft.next.enemies = draft.next.enemies.slice();
    draft.enemiesCopied = true;
  }
  const index = draft.next.enemies.findIndex((enemy) => enemy && enemy.id === enemyId);
  if (index < 0) return null;
  const copy = { ...draft.next.enemies[index] };
  draft.next.enemies[index] = copy;
  return copy;
}

function DraftRemoveEnemy(draft, enemyId) {
  if (!Array.isArray(draft.next.enemies)) return;
  if (!draft.enemiesCopied) {
    draft.next.enemies = draft.next.enemies.slice();
    draft.enemiesCopied = true;
  }
  draft.next.enemies = draft.next.enemies.filter((enemy) => enemy && enemy.id !== enemyId);
}

function DraftStronghold(draft, strongholdId) {
  if (!Array.isArray(draft.next.strongholds)) return null;
  if (!draft.strongholdsCopied) {
    draft.next.strongholds = draft.next.strongholds.slice();
    draft.strongholdsCopied = true;
  }
  const index = draft.next.strongholds.findIndex((item) => item && item.id === strongholdId);
  if (index < 0) return null;
  const copy = { ...draft.next.strongholds[index] };
  draft.next.strongholds[index] = copy;
  return copy;
}

function DraftStock(draft) {
  if (!draft.stockCopied) {
    draft.next.stock = { ...(draft.next.stock || {}) };
    draft.stockCopied = true;
  }
  return draft.next.stock;
}

function DraftBase(draft, baseId) {
  if (!Array.isArray(draft.next.bases)) return null;
  if (!draft.basesCopied) {
    draft.next.bases = draft.next.bases.slice();
    draft.basesCopied = true;
  }
  const index = draft.next.bases.findIndex((item) => item && item.id === baseId);
  if (index < 0) return null;
  const copy = {
    ...draft.next.bases[index],
    districts: Array.isArray(draft.next.bases[index].districts) ? draft.next.bases[index].districts.slice() : [],
    queue: Array.isArray(draft.next.bases[index].queue) ? draft.next.bases[index].queue.slice() : [],
  };
  draft.next.bases[index] = copy;
  return copy;
}

/** 代价账本逐条记录（只呈现、不折算——账本红线）。与 Script_Rules.PushLedgerLog 同一契约。 */
function DraftLedgerLog(draft, entry) {
  if (!entry || !entry.text) return;
  if (!draft.ledgerLogCopied) {
    draft.next.ledgerLog = Array.isArray(draft.next.ledgerLog) ? draft.next.ledgerLog.slice() : [];
    draft.ledgerLogCopied = true;
  }
  draft.next.ledgerLog.push({
    turn: draft.next.turn || 0,
    kind: entry.kind || "General",
    key: entry.key ?? null,
    text: entry.text,
    delta: entry.delta || {},
  });
  if (draft.next.ledgerLog.length > 200) draft.next.ledgerLog.splice(0, draft.next.ledgerLog.length - 200);
}

function DraftLedger(draft) {
  if (!draft.ledgerCopied) {
    draft.next.ledger = { ...EmptyLedger(), ...(draft.next.ledger || {}) };
    draft.ledgerCopied = true;
  }
  return draft.next.ledger;
}

function DraftLog(draft, entry) {
  if (!draft.logCopied) {
    draft.next.log = Array.isArray(draft.next.log) ? draft.next.log.slice() : [];
    draft.logCopied = true;
  }
  draft.next.log.push(entry);
}

function ApplyLedgerDelta(draft, ledgerDelta) {
  let touched = false;
  for (const key of Object.keys(ledgerDelta)) {
    if (ledgerDelta[key]) {
      touched = true;
      break;
    }
  }
  if (!touched) return;
  const ledger = DraftLedger(draft);
  for (const key of Object.keys(ledgerDelta)) {
    ledger[key] = (ledger[key] || 0) + ledgerDelta[key];
  }
}

function ApplyCaptures(draft, captures) {
  if (!captures.ordnance && !captures.grain && !captures.medicine) return;
  const stock = DraftStock(draft);
  stock.ordnance = (stock.ordnance || 0) + captures.ordnance;
  stock.grain = (stock.grain || 0) + captures.grain;
  stock.medicine = (stock.medicine || 0) + captures.medicine;
}

function CommitDraft(draft) {
  draft.next.rngState = draft.rngState;
  return draft.next;
}

function EmptyReport(extra = {}) {
  return {
    lines: [],
    effects: [],
    captures: EmptyCaptures(),
    casualties: { ours: 0, theirs: 0 },
    ledgerDelta: EmptyLedger(),
    exposureDelta: 0,
    moved: false,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 六、战力计算
// ---------------------------------------------------------------------------

/**
 * 计算单位在给定地块与情境下的有效战力。
 * context: { role:'Attack'|'Defence', night, ambush, siege, siegeCapable, supportCount, weather }
 */
export function ComputeStrength(state, unit, hex, context = {}) {
  if (!unit) return combatConstants.strengthFloor;
  const stats = ResolveUnitStats(unit.type);
  const isPlayer = (unit.side || stats.side) !== "Enemy";
  const role = context.role === "Defence" ? "Defence" : "Attack";
  const terrain = ResolveHexStats(hex);
  const constants = combatConstants;

  let value = role === "Attack" ? stats.attack : stats.defence;

  // 兵员完整度：减员直接削弱战力，但保留下限（还有骨干在）
  const maxHp = unit.maxHp || stats.hp || 1;
  const hpRatio = Clamp01((unit.hp ?? maxHp) / maxHp);
  value *= constants.strengthHpFloor + (1 - constants.strengthHpFloor) * hpRatio;

  // 经验与熟练度
  const level = Math.max(0, unit.level || 0);
  const xpRatio = Clamp01((unit.xp || 0) / constants.xpPerLevel);
  value *= 1 + level * constants.strengthLevelBonus + xpRatio * constants.strengthXpBonus;

  // 疲劳
  const fatigue = Clamp01((unit.fatigue || 0) / 100);
  value *= 1 - fatigue * constants.strengthFatiguePenalty;

  if (hex) {
    const terrainUse = isPlayer ? 1 : constants.enemyTerrainUseFactor;
    if (role === "Defence") {
      value *= 1 + terrain.defenceBonus * terrainUse;
      const works = Array.isArray(hex.works) ? hex.works : [];
      if (works.includes("Trench")) value *= 1 + constants.strengthTrenchBonus * terrainUse;
      if (hex.tunnel || works.includes("Tunnel")) value *= 1 + constants.strengthTunnelBonus * terrainUse;
      if (works.includes("Cache") && isPlayer) value *= 1 + constants.strengthCacheBonus;
    } else if (isPlayer && (hex.tunnel || terrain.concealment >= constants.ambushCoverThreshold)) {
      // 进攻方从隐蔽地形出击，接敌过程损耗小、突然性高
      value *= 1 + terrain.concealment * 0.12;
    }

    if (isPlayer) {
      value *= 1 + Clamp01((hex.massBase || 0) / 100) * constants.strengthMassBonus;
      if (hex.control === "Base") value *= 1 + constants.strengthBaseControlBonus;
      else if (hex.control === "Enemy") value *= 1 - constants.strengthEnemyControlPenalty;
      const scorch = Clamp01((hex.scorch || 0) / 100);
      value *= 1 - scorch * constants.strengthScorchPenalty;
    } else if (hex.control === "Base" || hex.control === "Guerrilla") {
      // 敌军进入根据地：情报不通、处处挨打
      value *= 1 - Clamp01((hex.massBase || 0) / 100) * 0.12;
    }
  }

  // 友邻支援：攻方每人 +7% 封顶 21%，守方每人 +5% 封顶 15%
  const support = Math.max(0, context.supportCount || 0);
  const supportPer = role === "Defence" ? constants.strengthSupportPerNeighbourDefence : constants.strengthSupportPerNeighbour;
  const supportCap = role === "Defence" ? constants.strengthSupportCapDefence : constants.strengthSupportCap;
  value *= 1 + Math.min(supportCap, support * supportPer);

  // 夜战
  if (context.night) {
    if (isPlayer) {
      value *= 1 + (role === "Attack" ? constants.nightPlayerAttackBonus : constants.nightPlayerDefenceBonus);
    } else {
      value *= 1 - constants.nightEnemyPenalty;
      if (stats.mechanised > 0 || stats.armour >= 0.4) value *= 1 - constants.nightArmourPenalty;
      if (stats.artillery > 0) value *= 1 - constants.nightArtilleryPenalty;
    }
  }

  // 科技/政策/事件的战斗效果（Rules 每次经济重算时缓存到 state.playerEffects）。
  // 曾经整棵军事树的 combatAttack/Defence/Ambush 无任何消费点——是评审揪出的假选择根源之一。
  const playerEffects = (state && state.playerEffects) || null;
  if (playerEffects && isPlayer) {
    if (role === "Attack") value *= 1 + Clamp(playerEffects.combatAttack || 0, 0, 0.6);
    else value *= 1 + Clamp(playerEffects.combatDefence || 0, 0, 0.6);
  }

  // 伏击：只有我方在有掩护的位置对开阔地之敌才成立
  if (context.ambush && role === "Attack" && isPlayer) {
    const intensity = Clamp01(context.ambushScore ?? 1);
    const ambushMultiplier = constants.ambushAttackMultiplier + Clamp((playerEffects && playerEffects.combatAmbush) || 0, 0, 0.7);
    value *= Lerp(1, ambushMultiplier, intensity);
  }

  // 攻坚：没有爆破/工兵能力，血肉之躯撞砖墙
  if (context.siege && role === "Attack" && isPlayer) {
    if (stats.siege > 0) value *= 1 + constants.siegeCapabilityAttackBonus * Clamp01(stats.siege);
    else value *= 1 - constants.siegeNoCapabilityAttackPenalty;
    if (context.noOrdnance) value *= 0.8;
  }

  return Math.max(constants.strengthFloor, value);
}

// ---------------------------------------------------------------------------
// 七、交战建模（Preview 与 Resolve 共用同一套核心，保证预览与结算口径一致）
// ---------------------------------------------------------------------------

function ResolveNightFlag(state, options, attacker = null) {
  if (options && typeof options.night === "boolean") return options.night;
  // 隐蔽状态出击即夜行动：摸黑接敌、打完在拂晓前脱离，是敌后部队的常态战法。
  if (attacker && attacker.hidden) return true;
  if (state && state.phaseKey === "Night") return true;
  return false;
}

function ComputeAmbushScore(state, attacker, attackerHex, defender, defenderHex, night) {
  if (!attacker || !attacker.hidden) return 0;
  const attackerTerrain = ResolveHexStats(attackerHex);
  const defenderTerrain = ResolveHexStats(defenderHex);
  const works = Array.isArray(attackerHex && attackerHex.works) ? attackerHex.works : [];
  const hasCover =
    attackerTerrain.concealment >= combatConstants.ambushCoverThreshold ||
    (attackerHex && attackerHex.tunnel) ||
    works.includes("Tunnel") ||
    works.includes("Trench");
  if (!hasCover) return 0;

  const roadOpen = defenderHex ? (defenderHex.road || 0) > 0 || defenderHex.railway === true : false;
  const openEnough = defenderTerrain.openness >= combatConstants.ambushOpenThreshold || roadOpen;
  if (!openEnough) return 0;

  let score = 0.55;
  score += (attackerTerrain.concealment - combatConstants.ambushCoverThreshold) * 0.6;
  score += Math.max(0, defenderTerrain.openness - combatConstants.ambushOpenThreshold) * 0.5;
  if (roadOpen) score += 0.18;
  if (attackerHex && attackerHex.tunnel) score += 0.12;
  if (night) score += 0.12;
  score += Clamp01((attackerHex && attackerHex.massBase ? attackerHex.massBase : 0) / 100) * 0.2;

  // 设伏天赋：游击队/武工队最擅长，主力连与担架队差得多
  const aptitude = Clamp(0.55 + ResolveUnitStats(attacker.type).ambushAptitude * 1.15, 0.55, 1.15);
  score *= aptitude;

  // 敌军警备度高时，伏击不容易奏效
  const alert = Clamp01(((state && state.alert) || 0) / 100);
  const detection = defender ? ResolveUnitStats(defender.type).detection : 1;
  score *= 1 - alert * combatConstants.ambushAlertPenalty * Clamp(detection, 0.5, 2) * 0.5;

  return Clamp01(score);
}

function ComputeIntelQuality(state, attacker, hex) {
  const massBase = Clamp01((hex && hex.massBase ? hex.massBase : 0) / 100);
  const hexIntel = Clamp01((hex && hex.intel ? hex.intel : 0) / 100);
  const scoutBonus = attacker ? Clamp01(ResolveUnitStats(attacker.type).intel / 4) : 0;
  const netIntel = Clamp01(((state && state.stock && state.stock.intel) || 0) / 200) * 0.1;
  return Clamp01(0.35 + massBase * 0.5 + hexIntel * 0.3 + scoutBonus * 0.1 + netIntel);
}

/**
 * 组织一次交战的全部静态参数（不消耗随机数）。
 * 返回的 model 同时供 PreviewAttack 与 ResolveAttack 使用。
 */
function BuildEngagement(state, attacker, defender, options = {}) {
  const constants = combatConstants;
  const attackerHex = GetHex(state, attacker.key);
  const defenderHex = GetHex(state, defender.key);
  const night = ResolveNightFlag(state, options, attacker);
  const ambushScore = ComputeAmbushScore(state, attacker, attackerHex, defender, defenderHex, night);
  const ambush = ambushScore > 0;
  const support = CountFriendlySupport(state, attacker, { targetKey: defender.key });
  const defenderSupport = CountFriendlySupport(state, defender);
  const screenSupport = HasScreenSupport(state, attacker);
  const attackerStats = ResolveUnitStats(attacker.type);
  const defenderStats = ResolveUnitStats(defender.type);
  const attackerTerrain = ResolveHexStats(attackerHex);
  const massBase = Clamp01((attackerHex && attackerHex.massBase ? attackerHex.massBase : 0) / 100);
  const targetMass = Clamp01((defenderHex && defenderHex.massBase ? defenderHex.massBase : 0) / 100);

  const attackStrength = ComputeStrength(state, attacker, attackerHex, {
    role: "Attack",
    night,
    ambush,
    ambushScore,
    supportCount: support.count,
  });
  const defenceStrength = ComputeStrength(state, defender, defenderHex, {
    role: "Defence",
    night,
    supportCount: defenderSupport.count,
  });

  const modifiers = [];
  const risks = [];

  const power = attackStrength / Math.max(0.001, attackStrength + defenceStrength);
  let winChance = 0.5 + (power - 0.5) * constants.oddsSlope;
  modifiers.push({ label: `兵力对比 ${attackStrength.toFixed(1)} : ${defenceStrength.toFixed(1)}`, value: Round1((power - 0.5) * constants.oddsSlope * 100) / 100 });

  if (ambush) {
    const bonus = constants.ambushWinBonus * ambushScore;
    winChance += bonus;
    modifiers.push({ label: `${attackerTerrain.name}设伏`, value: Round1(bonus * 100) / 100 });
  }
  if (night) {
    winChance += constants.nightWinBonus;
    modifiers.push({ label: "夜袭", value: constants.nightWinBonus });
  }
  if (support.flank) {
    winChance += constants.flankWinBonus;
    modifiers.push({ label: "两翼合击", value: constants.flankWinBonus });
  }
  const massBonus = massBase * constants.massOddsBonus;
  if (massBonus > 0.001) {
    winChance += massBonus;
    modifiers.push({ label: "群众带路与预警", value: Round1(massBonus * 100) / 100 });
  }
  const defenderWorks = Array.isArray(defenderHex && defenderHex.works) ? defenderHex.works : [];
  if (defenderWorks.includes("Trench") || (defenderHex && defenderHex.tunnel)) {
    winChance -= constants.fortifyOddsPenalty;
    modifiers.push({ label: "敌据工事", value: -constants.fortifyOddsPenalty });
  }
  if (!attacker.hidden) {
    winChance -= 0.05;
    modifiers.push({ label: "已暴露，失去突然性", value: -0.05 });
  }
  winChance = Clamp(winChance, constants.oddsFloor, constants.oddsCeiling);

  // 杀伤模型
  const soak = 1 / (1 + defenceStrength * constants.damageSoak);
  let damageOnWin = attackStrength * constants.damageScale * soak;
  if (ambush) damageOnWin *= Lerp(1, constants.ambushDamageMultiplier, ambushScore);
  if (support.flank) damageOnWin *= constants.flankDamageMultiplier;
  const damageOnFail = damageOnWin * constants.damageFailFactor;

  // 我方减员模型
  const attackerMaxHp = attacker.maxHp || attackerStats.hp || 50;
  const lossPressure = (defenceStrength / Math.max(0.001, attackStrength + defenceStrength)) * 2;
  let lossBase = attackerMaxHp * constants.lossScale * lossPressure;
  lossBase *= 1 - Math.min(constants.coverLossRelief, attackerTerrain.concealment * constants.coverLossRelief);
  if (ambush) lossBase *= Lerp(1, constants.ambushLossMultiplier, ambushScore);
  if (night) lossBase *= constants.nightLossMultiplier;
  if (support.flank) lossBase *= constants.flankLossMultiplier;
  const medicineSupply = Clamp01(((state && state.stock && state.stock.medicine) || 0) / 60);
  lossBase *= 1 - medicineSupply * constants.medicineLossRelief;
  const lossOnWin = lossBase * constants.lossWinFactor;
  const lossOnFail = lossBase * constants.lossFailFactor;

  // 缴获模型：械的主来源
  const lootValue = defenderStats.lootValue;
  const captureFactor =
    lootValue *
    constants.captureScale *
    attackerStats.captureBonus *
    (1 + Clamp01((state && state.playerEffects && state.playerEffects.captureRate) || 0)) *
    (1 + targetMass * constants.captureMassBonus) *
    (ambush ? Lerp(1, constants.ambushCaptureMultiplier, ambushScore) : 1);

  // 暴露度基数
  let exposureBase = constants.exposureAttackBase;
  exposureBase += damageOnWin * constants.exposureDamageFactor;
  if (night) exposureBase -= constants.nightExposureRelief;
  exposureBase -= ambush ? constants.ambushExposureRelief : -1.5;
  exposureBase -= massBase * constants.exposureMassRelief;
  exposureBase = Math.max(constants.exposureFloor, exposureBase);

  // 风险提示
  if (!ambush) {
    risks.push({ key: "NoAmbush", label: "非伏击条件，正面接火伤亡显著上升", severity: 0.6 });
  }
  if (defenceStrength > attackStrength * 1.2) {
    risks.push({ key: "Outgunned", label: "敌火力占优，建议先破交通、再打援", severity: 0.8 });
  }
  if (massBase < 0.3) {
    risks.push({ key: "ThinMass", label: "该地群众基础薄弱，敌情判断可能有误", severity: 0.7 });
  }
  if (defenderStats.armour >= 0.4 && !night) {
    risks.push({ key: "Armour", label: "白天硬碰装甲，缺乏反装甲手段", severity: 0.75 });
  }
  if (defenderHex && defenderHex.feature === "Village") {
    risks.push({ key: "Village", label: "战场紧邻村庄，事后可能遭报复", severity: 0.65 });
  }

  // 协同态势的一句话概括（预览与战报共用口径）
  const supportLabel = support.flank ? "两翼有接应" : support.count > 0 ? "有友邻接应" : "孤军出击";

  return {
    attacker,
    defender,
    attackerHex,
    defenderHex,
    attackerStats,
    defenderStats,
    attackerTerrain,
    night,
    ambush,
    ambushScore,
    supportCount: support.count,
    flank: support.flank,
    flankDirection: support.flankDirection,
    supportLabel,
    defenderSupportCount: defenderSupport.count,
    screenSupport,
    massBase,
    targetMass,
    attackStrength,
    defenceStrength,
    winChance,
    damageOnWin,
    damageOnFail,
    lossOnWin,
    lossOnFail,
    captureFactor,
    exposureBase,
    modifiers,
    risks,
  };
}

/** 情报迷雾：群众基础/情报覆盖越差，预览的胜率越不准（但同一局面下稳定，不随点击变化）。 */
function ApplyIntelFog(state, attacker, hex, targetKey, trueOdds) {
  const quality = ComputeIntelQuality(state, attacker, hex);
  const fog = Math.max(0, 1 - quality - combatConstants.previewFogFloor);
  if (fog <= 0) return { odds: trueOdds, quality, fog: 0 };
  const seedText = `${attacker.id}|${targetKey}|${state.turn || 0}|${state.seed || 0}`;
  const noise = HashString(seedText) / 4294967296;
  const bias = (noise - 0.5) * 2 * fog * combatConstants.previewFogSpread;
  return { odds: Clamp(trueOdds + bias, 0.02, 0.98), quality, fog };
}

// ---------------------------------------------------------------------------
// 八、目标选择
// ---------------------------------------------------------------------------

export function CanAttack(state, unitId, targetKey) {
  const unit = FindUnit(state, unitId);
  if (!unit) return { ok: false, reason: "找不到该部队" };
  if ((unit.hp ?? 0) <= 0) return { ok: false, reason: "该部队已失去战斗力" };
  const stats = ResolveUnitStats(unit.type);
  if (stats.side === "Enemy") return { ok: false, reason: "不能指挥敌方部队" };
  if (stats.attack <= 1) return { ok: false, reason: `${stats.name}不承担战斗任务` };
  if ((unit.moves ?? 0) <= 0) return { ok: false, reason: "本回合行动力已用尽" };
  if (unit.combat && unit.combat.lastActionTurn === (state.turn || 0)) {
    return { ok: false, reason: "本回合已经打过一仗，需要转移隐蔽" };
  }
  const targetHex = GetHex(state, targetKey);
  if (!targetHex) return { ok: false, reason: "目标不在地图上" };
  const distance = HexDistanceKeys(unit.key, targetKey);
  if (distance > stats.range) return { ok: false, reason: "目标不在打击距离内" };
  if (distance === 0) return { ok: false, reason: "不能攻击自己所在的位置" };

  const enemy = FindEnemyAt(state, targetKey);
  const stronghold = FindStrongholdAt(state, targetKey);
  if (!enemy && !stronghold) return { ok: false, reason: "该处没有可打击的目标" };
  if (!enemy && stronghold && (stronghold.garrison ?? 0) <= 0) {
    return { ok: false, reason: "该据点守敌已不存在" };
  }
  return { ok: true, reason: "", targetKind: enemy ? "Unit" : "Stronghold" };
}

/**
 * 我方单位是否可被敌方打击/拦截。隐蔽是本作最重要的防护手段：
 * 隐蔽单位原则上不可被攻击、移动也不触发拦截；
 * 但在开阔地被特务队/骑兵搜索队一类高搜索力的敌人贴近时，行迹会被发现。
 * 纯函数、不消耗随机数，供 Script_Ai.mjs 直接查询。
 */
export function IsUnitTargetable(state, unit, attackerType) {
  if (!unit || (unit.hp ?? 0) <= 0) return { targetable: false, reason: "目标不存在" };
  if (!unit.hidden) return { targetable: true, reason: "目标已暴露" };
  const hex = GetHex(state, unit.key);
  const terrain = ResolveHexStats(hex);
  const detection = attackerType ? ResolveUnitStats(attackerType).detection : 1;
  const works = Array.isArray(hex && hex.works) ? hex.works : [];
  let cover = terrain.concealment;
  if (hex && (hex.tunnel || works.includes("Tunnel"))) cover += 0.3;
  cover += Clamp01((hex && hex.massBase ? hex.massBase : 0) / 100) * 0.25;
  cover += ResolveUnitStats(unit.type).concealment * 0.2;
  const exposure = detection * (1 - Clamp01(cover));
  const spotted = exposure >= combatConstants.spotHiddenThreshold;
  return {
    targetable: spotted,
    reason: spotted ? "在开阔地留下行迹，被敌搜索队发现" : "部队处于隐蔽状态，敌无法捕捉",
    exposure: Round1(exposure * 100) / 100,
  };
}

export function ListAttackTargets(state, unitId) {
  const unit = FindUnit(state, unitId);
  if (!unit) return [];
  const stats = ResolveUnitStats(unit.type);
  const origin = ParseHexKey(unit.key);
  const results = [];
  const seen = new Set();
  const candidates = [];
  for (let dq = -stats.range; dq <= stats.range; dq += 1) {
    for (let dr = -stats.range; dr <= stats.range; dr += 1) {
      const q = origin.q + dq;
      const r = origin.r + dr;
      candidates.push(`${q},${r}`);
    }
  }
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);
    const check = CanAttack(state, unitId, key);
    if (check.ok) results.push(key);
  }
  results.sort();
  return results;
}

// ---------------------------------------------------------------------------
// 九、攻击预览
// ---------------------------------------------------------------------------

export function PreviewAttack(state, attackerId, targetKey, options = {}) {
  const check = CanAttack(state, attackerId, targetKey);
  const empty = {
    valid: false,
    reason: check.reason,
    odds: 0,
    expectedDamage: 0,
    expectedLoss: 0,
    capture: EmptyCaptures(),
    exposureDelta: 0,
    risks: [],
    modifiers: [],
  };
  if (!check.ok) return empty;

  const attacker = FindUnit(state, attackerId);
  const enemy = FindEnemyAt(state, targetKey);
  if (!enemy) {
    const stronghold = FindStrongholdAt(state, targetKey);
    return PreviewSiege(state, attackerId, stronghold ? stronghold.id : null, options);
  }

  const model = BuildEngagement(state, attacker, enemy, options);
  const withdraw = Boolean(options.withdrawKey);
  const fog = ApplyIntelFog(state, attacker, model.attackerHex, targetKey, model.winChance);

  const expectedDamageRaw = model.winChance * model.damageOnWin + (1 - model.winChance) * model.damageOnFail;
  const expectedDamage = Math.min(enemy.hp ?? model.defenderStats.hp, expectedDamageRaw);
  const expectedLossRaw = model.winChance * model.lossOnWin + (1 - model.winChance) * model.lossOnFail;
  const expectedLoss = Math.min(attacker.hp ?? model.attackerStats.hp, expectedLossRaw);
  const captureScale = withdraw ? combatConstants.captureWithdrawPenalty : combatConstants.captureNoWithdrawBonus;
  const capturedOrdnance = expectedDamage * model.captureFactor * captureScale;
  const capture = {
    ordnance: Round1(capturedOrdnance),
    grain: Round1(capturedOrdnance * combatConstants.captureGrainRatio),
    medicine: Round1(capturedOrdnance * combatConstants.captureMedicineRatio),
  };

  const exposureDelta = Round1(
    model.exposureBase *
      (withdraw ? combatConstants.exposureWithdrawFactor : combatConstants.exposureStayFactor) *
      (withdraw && model.screenSupport ? combatConstants.screenExposureFactor : 1)
  );

  const risks = model.risks.slice();
  if (!withdraw) {
    risks.push({ key: "NoWithdraw", label: "打完不转移：暴露度按四倍计，极易招来扫荡", severity: 0.9 });
  }
  if (fog.fog > 0.05) {
    risks.push({ key: "Fog", label: `敌情判断误差约 ±${Math.round(fog.fog * combatConstants.previewFogSpread * 100)}%`, severity: 0.5 + fog.fog });
  }
  if ((attacker.hp ?? 0) / (attacker.maxHp || 1) < 0.5) {
    risks.push({ key: "Worn", label: "部队减员较大，宜先休整补充", severity: 0.6 });
  }

  const modifiers = model.modifiers.slice();
  modifiers.push({
    label: withdraw ? "打完即转移" : "打完滞留原地",
    value: withdraw ? -Round1(model.exposureBase * 0.5) : Round1(model.exposureBase * 2),
  });

  return {
    valid: true,
    reason: "",
    odds: Round1(fog.odds * 100) / 100,
    trueOdds: Round1(model.winChance * 100) / 100,
    intelQuality: Round1(fog.quality * 100) / 100,
    ambush: model.ambush,
    night: model.night,
    supportCount: model.supportCount,
    flank: model.flank,
    supportLabel: model.supportLabel,
    screenSupport: model.screenSupport,
    expectedDamage: Round1(expectedDamage),
    expectedLoss: Round1(expectedLoss),
    capture,
    exposureDelta,
    risks,
    modifiers,
  };
}

// ---------------------------------------------------------------------------
// 十、攻击结算
// ---------------------------------------------------------------------------

export function ResolveAttack(state, attackerId, targetKey, options = {}) {
  const check = CanAttack(state, attackerId, targetKey);
  if (!check.ok) {
    return { nextState: state, report: EmptyReport({ lines: [check.reason], valid: false }) };
  }
  const enemy = FindEnemyAt(state, targetKey);
  if (!enemy) {
    const stronghold = FindStrongholdAt(state, targetKey);
    return ResolveSiege(state, attackerId, stronghold ? stronghold.id : null, options);
  }

  const attacker = FindUnit(state, attackerId);
  const model = BuildEngagement(state, attacker, enemy, options);
  const constants = combatConstants;
  const draft = CreateDraft(state);
  const report = EmptyReport();
  const withdrawKey = options.withdrawKey || null;

  const winRoll = DrawRoll(draft);
  const damageRoll = DrawRoll(draft);
  const lossRoll = DrawRoll(draft);
  const captureRoll = DrawRoll(draft);

  const victory = winRoll < model.winChance;
  const decisive = victory && winRoll < model.winChance * constants.decisiveMargin;

  const damageVariance = 1 + (damageRoll - 0.5) * 2 * constants.damageVarianceSpread;
  const lossVariance = 1 + (lossRoll - 0.5) * 2 * constants.lossVarianceSpread;
  const captureVariance = 1 + (captureRoll - 0.5) * 2 * constants.captureVarianceSpread;

  let damageDealt = (victory ? model.damageOnWin : model.damageOnFail) * damageVariance;
  if (decisive) damageDealt *= 1.25;
  damageDealt = Math.max(0, Math.min(enemy.hp ?? 0, damageDealt));

  let ourLoss = (victory ? model.lossOnWin : model.lossOnFail) * lossVariance;
  ourLoss = Math.max(0, ourLoss);

  // 敌方处置
  const enemyDraft = DraftEnemy(draft, enemy.id);
  const enemyRemainingHp = Math.max(0, (enemy.hp ?? 0) - damageDealt);
  const destroyed = enemyRemainingHp <= 0.5;
  if (enemyDraft) {
    enemyDraft.hp = Round1(enemyRemainingHp);
    enemyDraft.visibleToPlayer = true;
  }
  if (destroyed) DraftRemoveEnemy(draft, enemy.id);

  // 缴获：只有得手才有；歼灭辎重队/伪军收获远高于硬碰日军正规队
  const captureScale = withdrawKey ? constants.captureWithdrawPenalty : constants.captureNoWithdrawBonus;
  let capturedOrdnance = 0;
  if (victory) {
    capturedOrdnance = damageDealt * model.captureFactor * captureScale * captureVariance;
    if (destroyed) capturedOrdnance *= 1.35;
  }
  const captures = {
    ordnance: RoundInt(capturedOrdnance),
    grain: RoundInt(capturedOrdnance * constants.captureGrainRatio),
    medicine: RoundInt(capturedOrdnance * constants.captureMedicineRatio),
  };

  // 我方处置：撤退优先于死拼
  const attackerDraft = DraftUnit(draft, attacker.id);
  const maxHp = attacker.maxHp || model.attackerStats.hp || 50;
  let retreated = false;
  let retreatSucceeded = false;
  const hpAfterFight = (attacker.hp ?? maxHp) - ourLoss;
  if (hpAfterFight / maxHp < constants.retreatHpThreshold && !options.holdGround) {
    retreated = true;
    const retreatChance = ComputeRetreatChance(state, attacker, model.attackerHex, model.night);
    const retreatRoll = DrawRoll(draft);
    retreatSucceeded = retreatRoll < retreatChance;
    // 掩护分队在侧：撤退失败的追加减员折半（有人断后收容）
    if (!retreatSucceeded) {
      ourLoss += maxHp * constants.retreatFailLoss * (model.screenSupport ? constants.screenFailLossFactor : 1);
    }
  } else if (options.holdGround && hpAfterFight / maxHp < constants.retreatHpThreshold) {
    // 硬顶到底：数值上明确劣于保存力量
    ourLoss *= constants.lastStandLossMultiplier;
  }
  ourLoss = Math.min(attacker.hp ?? maxHp, Math.max(0, ourLoss));

  if (attackerDraft) {
    attackerDraft.hp = Round1(Math.max(0, (attacker.hp ?? maxHp) - ourLoss));
    attackerDraft.hidden = false; // 开火即暴露
    attackerDraft.fatigue = Clamp((attacker.fatigue || 0) + (model.ambush ? 8 : 14), 0, 100);
    attackerDraft.xp = (attacker.xp || 0) + constants.xpPerEngagement + (victory ? 4 : 0);
    if (attackerDraft.xp >= constants.xpPerLevel) {
      attackerDraft.level = (attacker.level || 0) + 1;
      attackerDraft.xp -= constants.xpPerLevel;
    }
    attackerDraft.moves = Math.max(0, (attacker.moves || 0) - 1);
    attackerDraft.combat = {
      ...(attacker.combat || {}),
      lastActionTurn: state.turn || 0,
      lastAmbush: model.ambush,
      withdrew: false,
    };
  }

  // 转移：打完就走
  let moved = false;
  if (withdrawKey && attackerDraft && attackerDraft.hp > 0) {
    const destination = GetHex(state, withdrawKey);
    const reachable = destination && HexDistanceKeys(attacker.key, withdrawKey) === 1;
    if (reachable && !FindEnemyAt(state, withdrawKey)) {
      attackerDraft.key = withdrawKey;
      attackerDraft.moves = Math.max(0, attackerDraft.moves - 1);
      attackerDraft.combat.withdrew = true;
      moved = true;
    }
  }
  if (retreated && retreatSucceeded && !moved && attackerDraft && attackerDraft.hp > 0) {
    const fallback = ChooseRetreatHex(state, attacker);
    if (fallback) {
      attackerDraft.key = fallback;
      attackerDraft.combat.withdrew = true;
      moved = true;
    }
  }
  if (attackerDraft) {
    attackerDraft.fatigue = Clamp(attackerDraft.fatigue + (moved ? 6 : 0), 0, 100);
  }

  // 暴露度：打完不转移是四倍；掩护分队接应的转移痕迹更少
  const exposureDelta = Round1(
    model.exposureBase *
      (moved ? constants.exposureWithdrawFactor : constants.exposureStayFactor) *
      (moved && model.screenSupport ? constants.screenExposureFactor : 1)
  );
  draft.next.exposure = Clamp((state.exposure || 0) + exposureDelta, 0, 100);
  draft.next.alert = Clamp((state.alert || 0) + (victory ? 3 : 1.5) + (model.ambush ? 1 : 2), 0, 100);

  // 代价账本：只记代价，不产生任何收益（文案统一放在战报末尾）
  const ledgerDelta = EmptyLedger();
  const costLines = [];
  const defenderHexRef = model.defenderHex;
  if (defenderHexRef && defenderHexRef.feature === "Village" && !moved) {
    const retaliationRoll = DrawRoll(draft);
    const shield = Clamp01((defenderHexRef.massBase || 0) / 100) * 0.5 + (defenderHexRef.tunnel ? 0.25 : 0);
    if (retaliationRoll > shield + 0.35) {
      const civilianHit = RoundInt(2 + retaliationRoll * 5);
      const displacedHit = RoundInt(8 + retaliationRoll * 24);
      ledgerDelta.civilianDeaths += civilianHit;
      ledgerDelta.displaced += displacedHit;
      costLines.push("战斗未及远离村庄，敌军事后到村上寻仇，乡亲有伤亡，部分人家投亲避难。");
      DraftLedgerLog(draft, {
        kind: "Retaliation",
        key: targetKey,
        text: `村边交火后敌回村寻仇：${civilianHit} 名乡亲遇害，${displacedHit} 人投亲避难。`,
        delta: { civilianDeaths: civilianHit, displaced: displacedHit },
      });
    }
  }
  if (ourLoss > maxHp * 0.55) {
    ledgerDelta.cadreLost += 1;
    costLines.push("此战减员较重，一名班排骨干未能归队。");
    DraftLedgerLog(draft, {
      kind: "UnitLoss",
      key: targetKey,
      text: "一次硬仗减员过半，一名班排骨干未能归队。",
      delta: { cadreLost: 1 },
    });
  }

  // 战报文案：克制、具体
  const attackerName = model.attackerStats.name;
  const defenderName = model.defenderStats.name;
  const terrainName = model.attackerTerrain.name;
  if (model.ambush) {
    report.lines.unshift(
      `${model.night ? "夜色掩护下，" : ""}${attackerName}在${terrainName}设伏，待${defenderName}进入开阔地段后突然开火。`
    );
  } else {
    report.lines.unshift(`${attackerName}向${defenderName}发起正面攻击，缺少突然性。`);
  }
  if (victory) {
    if (model.flank) {
      report.lines.push(`${model.flankDirection ?? "侧"}面枪声一起，${defenderName}腹背受击，阵脚自乱。`);
    } else if (model.supportCount > 0) {
      report.lines.push("友邻分队在侧翼开火牵制，敌不敢恋战。");
    }
    report.lines.push(
      destroyed
        ? `${defenderName}被打散，残部溃退。`
        : `${defenderName}被压制退却，估计减员 ${RoundInt(damageDealt)}。`
    );
    if (captures.ordnance > 0) {
      report.lines.push(
        `打扫战场：缴获枪支弹药折合械 ${captures.ordnance}，粮 ${captures.grain}，药品 ${captures.medicine}。`
      );
    }
  } else {
    report.lines.push(`敌火力组织较快，部队未能得手，主动脱离接触。`);
    if (model.flank) {
      report.lines.push("两翼虽有接应，敌抢先占住地埂，合击未能奏效。");
    }
  }
  if (ourLoss > 0) {
    report.lines.push(`我方减员 ${RoundInt(ourLoss)}，伤员由担架队后送。`);
  }
  if (retreated) {
    report.lines.push(
      retreatSucceeded
        ? "部队按预案交替掩护撤出战斗，保存了骨干。"
        : "撤离路线被敌切断，突围时又有伤亡。"
    );
  }
  if (moved) {
    report.lines.push("打完即转移，未在原地停留。");
    if (model.screenSupport) report.lines.push("掩护分队沿沟坎接应转移，追兵扑了空。");
  } else {
    report.lines.push("部队仍滞留原地，行踪已被敌方掌握，此处将成为下一次扫荡的重点。");
  }
  for (const line of costLines) report.lines.push(line);

  // 特效派发
  if (model.ambush) report.effects.push({ kind: "Ambush", key: attacker.key, payload: { targetKey, night: model.night, intensity: model.ambushScore } });
  if (victory && captures.ordnance > 0) report.effects.push({ kind: "Capture", key: targetKey, payload: { ...captures } });
  if (moved) report.effects.push({ kind: "Retreat", key: attackerDraft ? attackerDraft.key : attacker.key, payload: { fromKey: attacker.key, planned: Boolean(withdrawKey) } });
  report.effects.push({ kind: "Smoke", key: targetKey, payload: { level: victory ? 2 : 1 } });
  report.effects.push({
    kind: "FloatingText",
    key: targetKey,
    payload: { text: victory ? `-${RoundInt(damageDealt)}` : "未得手", tone: victory ? "good" : "warn" },
  });

  ApplyCaptures(draft, captures);
  ApplyLedgerDelta(draft, ledgerDelta);
  DraftLog(draft, {
    turn: state.turn || 0,
    kind: model.ambush ? "Ambush" : "Attack",
    key: targetKey,
    text: report.lines[0],
  });

  report.captures = captures;
  report.casualties = { ours: RoundInt(ourLoss), theirs: RoundInt(damageDealt) };
  report.ledgerDelta = ledgerDelta;
  report.exposureDelta = exposureDelta;
  report.moved = moved;
  report.valid = true;
  report.victory = victory;
  report.ambush = model.ambush;
  report.night = model.night;
  report.supportCount = model.supportCount;
  report.flank = model.flank;
  report.supportLabel = model.supportLabel;
  report.odds = Round1(model.winChance * 100) / 100;

  return { nextState: CommitDraft(draft), report };
}

function DrawRoll(draft) {
  return DraftDraw(draft);
}

// ---------------------------------------------------------------------------
// 十一、撤退
// ---------------------------------------------------------------------------

function ComputeRetreatChance(state, unit, hex, night) {
  const constants = combatConstants;
  const stats = ResolveUnitStats(unit.type);
  const terrain = ResolveHexStats(hex);
  let chance = constants.retreatBaseChance * stats.retreatBonus;
  chance += terrain.concealment * constants.retreatTerrainBonus;
  if (hex && (hex.tunnel || (Array.isArray(hex.works) && hex.works.includes("Tunnel")))) {
    chance += constants.retreatTunnelBonus;
  }
  chance += Clamp01((hex && hex.massBase ? hex.massBase : 0) / 100) * constants.retreatMassBonus;
  if (unit.hidden) chance += constants.retreatHiddenBonus;
  if (night) chance += constants.nightRetreatBonus;
  // 掩护分队（侦察员、担架队、骑兵通信）在同格或相邻：有人带路、有人断后
  if (HasScreenSupport(state, unit)) chance += constants.screenRetreatBonus;
  chance -= Clamp01((unit.fatigue || 0) / 100) * 0.2;
  return Clamp(chance, 0.1, 0.97);
}

function ChooseRetreatHex(state, unit) {
  const neighbours = HexNeighborKeys(unit.key);
  let best = null;
  let bestScore = -Infinity;
  for (const key of neighbours) {
    const hex = GetHex(state, key);
    if (!hex) continue;
    if (FindEnemyAt(state, key)) continue;
    if (FindStrongholdAt(state, key)) continue;
    const terrain = ResolveHexStats(hex);
    let score = terrain.concealment * 2 + Clamp01((hex.massBase || 0) / 100) * 1.5;
    if (hex.tunnel) score += 1.2;
    if (hex.control === "Base") score += 0.9;
    else if (hex.control === "Guerrilla") score += 0.5;
    else if (hex.control === "Enemy") score -= 0.8;
    if ((hex.road || 0) > 0) score -= 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

export function ApplyRetreat(state, unitId, toKey) {
  const unit = FindUnit(state, unitId);
  const report = EmptyReport();
  if (!unit) {
    report.lines.push("找不到该部队");
    report.valid = false;
    return { nextState: state, report };
  }
  const destinationKey = toKey || ChooseRetreatHex(state, unit);
  const destination = GetHex(state, destinationKey);
  if (!destination) {
    report.lines.push("没有可供转移的方向，部队被迫就地隐蔽。");
    report.valid = false;
    return { nextState: state, report };
  }

  const draft = CreateDraft(state);
  const night = ResolveNightFlag(state, {});
  const screened = HasScreenSupport(state, unit);
  const chance = ComputeRetreatChance(state, unit, GetHex(state, unit.key), night);
  const roll = DrawRoll(draft);
  const succeeded = roll < chance;

  const unitDraft = DraftUnit(draft, unitId);
  const maxHp = unit.maxHp || ResolveUnitStats(unit.type).hp || 50;
  let loss = 0;
  if (unitDraft) {
    if (succeeded) {
      unitDraft.key = destinationKey;
      unitDraft.fatigue = Clamp((unit.fatigue || 0) + combatConstants.retreatFatigue, 0, 100);
      unitDraft.moves = 0;
      unitDraft.combat = { ...(unit.combat || {}), withdrew: true, lastRetreatTurn: state.turn || 0 };
    } else {
      loss = maxHp * combatConstants.retreatFailLoss * (screened ? combatConstants.screenFailLossFactor : 1);
      unitDraft.hp = Round1(Math.max(0, (unit.hp ?? maxHp) - loss));
      unitDraft.fatigue = Clamp((unit.fatigue || 0) + combatConstants.retreatFatigue + 8, 0, 100);
      unitDraft.hidden = false;
      unitDraft.moves = 0;
    }
  }

  const terrain = ResolveHexStats(destination);
  report.lines.push(
    succeeded
      ? `部队沿${terrain.name}小路转移，甩开了追兵。保存力量比拼光更重要。`
      : "转移途中与敌搜索队遭遇，付出了代价才脱离接触。"
  );
  if (screened) {
    report.lines.push(succeeded ? "掩护分队占住路口接应，追兵扑了空。" : "幸有掩护分队断后收容，伤亡未再扩大。");
  }
  report.effects.push({ kind: "Retreat", key: destinationKey, payload: { fromKey: unit.key, succeeded } });
  report.casualties = { ours: RoundInt(loss), theirs: 0 };
  report.moved = succeeded;
  report.valid = true;
  report.exposureDelta = succeeded ? -1.5 : 2;
  draft.next.exposure = Clamp((state.exposure || 0) + report.exposureDelta, 0, 100);
  DraftLog(draft, { turn: state.turn || 0, kind: "Retreat", key: destinationKey, text: report.lines[0] });

  return { nextState: CommitDraft(draft), report };
}

// ---------------------------------------------------------------------------
// 十二、破袭（铁路/公路/电话线）
// ---------------------------------------------------------------------------

export function ResolveSabotage(state, unitId, targetKey, options = {}) {
  const constants = combatConstants;
  const unit = FindUnit(state, unitId);
  const report = EmptyReport();
  if (!unit) {
    report.lines.push("找不到该部队");
    report.valid = false;
    return { nextState: state, report };
  }
  const hex = GetHex(state, targetKey);
  if (!hex) {
    report.lines.push("目标不在地图上");
    report.valid = false;
    return { nextState: state, report };
  }
  const hasRail = hex.railway === true;
  const hasRoad = (hex.road || 0) > 0;
  if (!hasRail && !hasRoad) {
    report.lines.push("该处没有铁路或公路可供破袭");
    report.valid = false;
    return { nextState: state, report };
  }
  if (HexDistanceKeys(unit.key, targetKey) > 1) {
    report.lines.push("需要先接近目标路段");
    report.valid = false;
    return { nextState: state, report };
  }
  const stock = state.stock || {};
  const cost = Math.round(constants.sabotageOrdnanceCost * (hasRail ? 1 : 0.6));
  if ((stock.ordnance || 0) < cost) {
    report.lines.push(`炸药与器材不足，破袭需要械 ${cost}`);
    report.valid = false;
    return { nextState: state, report };
  }

  const draft = CreateDraft(state);
  const stats = ResolveUnitStats(unit.type);
  const night = ResolveNightFlag(state, options, unit);
  const massBase = Clamp01((hex.massBase || 0) / 100);

  let chance = constants.sabotageBaseChance;
  chance += massBase * constants.sabotageMassBonus;
  if (night) chance += constants.sabotageNightBonus;
  chance += Clamp01(stats.sabotage) * constants.sabotageSkillBonus;
  chance -= Clamp01(((state.alert || 0) / 100)) * 0.2;
  // 事先破路、挖好隐蔽接近路线的地段，破袭更容易得手（工事的 sabotageBonus）。
  chance += WorkSabotageBonus(hex) + WorkSabotageBonus(GetHex(state, unit.key));
  const nearStronghold = HexNeighborKeys(targetKey).some((key) => FindStrongholdAt(state, key));
  if (nearStronghold) chance -= 0.15;
  chance = Clamp(chance, 0.1, 0.96);

  const roll = DrawRoll(draft);
  const succeeded = roll < chance;
  const gradeRoll = DrawRoll(draft);

  const ledgerDelta = EmptyLedger();
  const captures = EmptyCaptures();
  let ourLoss = 0;

  const hexDraft = DraftHex(draft, targetKey);
  if (succeeded && hexDraft) {
    const turns = hasRail ? constants.sabotageRailTurns : constants.sabotageRoadTurns;
    const extra = gradeRoll > 0.75 ? 1 : 0;
    hexDraft.railBroken = Math.max(hexDraft.railBroken || 0, turns + extra);
    if (hasRoad && !hasRail && gradeRoll > 0.6) hexDraft.road = Math.max(0, (hexDraft.road || 0) - 1);
    captures.ordnance = RoundInt(constants.sabotageCaptureOrdnance * (0.6 + gradeRoll * 0.8) * (hasRail ? 1 : 0.5));
    captures.grain = RoundInt(constants.sabotageCaptureGrain * gradeRoll * (hasRail ? 1 : 0.4));
    report.lines.push(
      hasRail
        ? `${stats.name}在${night ? "夜间" : "拂晓前"}破坏路轨与枕木，起出鱼尾板与道钉，此段需 ${hexDraft.railBroken} 个季度才能抢修通车。`
        : `${stats.name}挖断公路路基、破坏涵洞，敌汽车队暂时无法通过。`
    );
    if (captures.ordnance > 0) {
      report.lines.push(`沿线群众连夜搬走器材，折合械 ${captures.ordnance}，粮 ${captures.grain}。`);
    }
  } else {
    ourLoss = (unit.maxHp || stats.hp || 50) * 0.1 * (1 + gradeRoll);
    report.lines.push("护路队巡查提前，爆破未能完成，部队按预案撤离。");
  }

  const unitDraft = DraftUnit(draft, unitId);
  if (unitDraft) {
    unitDraft.hp = Round1(Math.max(0, (unit.hp ?? 0) - ourLoss));
    unitDraft.hidden = false;
    unitDraft.moves = Math.max(0, (unit.moves || 0) - 1);
    unitDraft.fatigue = Clamp((unit.fatigue || 0) + 10, 0, 100);
    // 破袭得手是技术活，长经验（+4）
    unitDraft.xp = (unit.xp || 0) + (succeeded ? 4 : 0);
    if (unitDraft.xp >= constants.xpPerLevel) {
      unitDraft.level = (unit.level || 0) + 1;
      unitDraft.xp -= constants.xpPerLevel;
    }
    unitDraft.combat = { ...(unit.combat || {}), lastActionTurn: state.turn || 0, withdrew: false };
  }

  let moved = false;
  const withdrawKey = options.withdrawKey || null;
  if (withdrawKey && unitDraft && unitDraft.hp > 0 && HexDistanceKeys(unit.key, withdrawKey) === 1 && GetHex(state, withdrawKey)) {
    unitDraft.key = withdrawKey;
    unitDraft.moves = Math.max(0, unitDraft.moves - 1);
    unitDraft.combat.withdrew = true;
    moved = true;
    report.lines.push("破袭分队随即转移，天亮前已进入山地。");
  } else {
    report.lines.push("部队未及转移，敌护路队会顺着痕迹搜索这一带。");
  }

  let exposureBase = constants.exposureSabotageBase + (hasRail ? 2 : 0) - (night ? constants.nightExposureRelief : 0);
  exposureBase -= massBase * constants.exposureMassRelief;
  exposureBase = Math.max(constants.exposureFloor, exposureBase);
  const exposureDelta = Round1(exposureBase * (moved ? constants.exposureWithdrawFactor : constants.exposureStayFactor));

  const stockDraft = DraftStock(draft);
  stockDraft.ordnance = Math.max(0, (stockDraft.ordnance || 0) - cost);
  ApplyCaptures(draft, captures);

  // 破路会波及沿线百姓的行路与运输，记入代价账本（不产生任何收益）
  if (succeeded && hex.feature === "Village") {
    const displacedGain = RoundInt(4 + gradeRoll * 8);
    ledgerDelta.displaced += displacedGain;
    report.lines.push(`破袭殃及村旁道路，${displacedGain} 户乡亲暂避他村。`);
    DraftLedgerLog(draft, {
      kind: "Sabotage",
      key: targetKey,
      text: `破袭波及村庄交通，${displacedGain} 人暂时流离。`,
      delta: { displaced: displacedGain },
    });
  }
  if (!succeeded && massBase < 0.35) {
    const civilianHit = RoundInt(gradeRoll * 3);
    ledgerDelta.civilianDeaths += civilianHit;
    report.lines.push("敌人在附近村庄抓人盘问，有乡亲遇害。");
    if (civilianHit > 0) {
      DraftLedgerLog(draft, {
        kind: "Retaliation",
        key: targetKey,
        text: `破袭未遂，敌在附近村庄抓人盘问，${civilianHit} 名乡亲遇害。`,
        delta: { civilianDeaths: civilianHit },
      });
    }
  }
  ApplyLedgerDelta(draft, ledgerDelta);

  draft.next.exposure = Clamp((state.exposure || 0) + exposureDelta, 0, 100);
  draft.next.alert = Clamp((state.alert || 0) + constants.sabotageAlertGain * (succeeded ? 1 : 0.5), 0, 100);

  report.effects.push({ kind: "Sabotage", key: targetKey, payload: { succeeded, rail: hasRail, night } });
  if (succeeded) report.effects.push({ kind: "Smoke", key: targetKey, payload: { level: 2 } });
  if (moved) report.effects.push({ kind: "Retreat", key: unitDraft ? unitDraft.key : unit.key, payload: { fromKey: unit.key, planned: true } });
  report.effects.push({
    kind: "FloatingText",
    key: targetKey,
    payload: { text: succeeded ? "交通中断" : "未成功", tone: succeeded ? "good" : "warn" },
  });

  report.captures = captures;
  report.casualties = { ours: RoundInt(ourLoss), theirs: 0 };
  report.ledgerDelta = ledgerDelta;
  report.exposureDelta = exposureDelta;
  report.moved = moved;
  report.valid = true;
  report.succeeded = succeeded;
  DraftLog(draft, { turn: state.turn || 0, kind: "Sabotage", key: targetKey, text: report.lines[0] });

  return { nextState: CommitDraft(draft), report };
}

// ---------------------------------------------------------------------------
// 十三、攻坚与围困
// ---------------------------------------------------------------------------

function BuildSiegeModel(state, unit, stronghold, options = {}) {
  const constants = combatConstants;
  const strongholdStats = ResolveStrongholdStats(stronghold.type);
  const unitStats = ResolveUnitStats(unit.type);
  const unitHex = GetHex(state, unit.key);
  const strongholdHex = GetHex(state, stronghold.key);
  const night = ResolveNightFlag(state, options, unit);
  const hasCapability = unitStats.siege > 0;
  // 反攻期敌军械弹与士气双衰，攻坚的弹药门槛减半（史实：成建制攻坚从 1944 年秋展开）。
  const eraSiegeScale = state.eraKey === "Counter" ? 0.5 : 1;
  const ordnanceCost = Math.round(constants.siegeOrdnanceCost * strongholdStats.siegeResistance * eraSiegeScale);
  const hasOrdnance = ((state.stock && state.stock.ordnance) || 0) >= ordnanceCost;
  const massBase = Clamp01((strongholdHex && strongholdHex.massBase ? strongholdHex.massBase : 0) / 100);

  const attackStrength = ComputeStrength(state, unit, unitHex, {
    role: "Attack",
    night,
    siege: true,
    noOrdnance: !hasOrdnance,
    supportCount: CountFriendlySupport(state, unit, { targetKey: stronghold.key }).count,
  });

  const garrison = Math.max(0, stronghold.garrison ?? strongholdStats.garrison);
  const supplyRatio = Clamp01((stronghold.supply ?? strongholdStats.supply) / Math.max(1, strongholdStats.supply));
  let defenceStrength = strongholdStats.defence * (0.45 + 0.55 * Clamp01(garrison / Math.max(1, strongholdStats.garrison)));
  defenceStrength *= 0.6 + 0.4 * supplyRatio;
  if (night) defenceStrength *= 0.85;
  // 坑道作业的积累：每级 undermined 削弱工事防御——先围后攻是普通部队的攻坚之路。
  const undermined = Clamp(Number(stronghold.undermined) || 0, 0, 4);
  defenceStrength *= 1 - undermined * 0.12;
  defenceStrength = Math.max(1, defenceStrength);

  const power = attackStrength / Math.max(0.001, attackStrength + defenceStrength);
  let winChance = 0.5 + (power - 0.5) * constants.oddsSlope;
  if (!hasCapability) winChance -= constants.siegeNoCapabilityOddsPenalty * (1 - undermined * 0.18);
  if (!hasOrdnance) winChance -= constants.siegeNoOrdnanceOddsPenalty;
  if (night) winChance += constants.nightWinBonus;
  winChance += massBase * constants.massOddsBonus;
  winChance += undermined * 0.05;
  winChance = Clamp(winChance, constants.oddsFloor, constants.oddsCeiling);

  const maxHp = unit.maxHp || unitStats.hp || 50;
  const lossPressure = (defenceStrength / Math.max(0.001, attackStrength + defenceStrength)) * 2;
  let lossBase = maxHp * constants.siegeLossScale * lossPressure;
  if (hasCapability) lossBase *= 1 - constants.siegeCapabilityLossReduction * Clamp01(unitStats.siege);
  else lossBase *= constants.siegeNoCapabilityLossMultiplier;
  if (!hasOrdnance) lossBase *= constants.siegeNoOrdnanceLossMultiplier;
  if (night) lossBase *= constants.nightLossMultiplier;

  const damageOnWin = attackStrength * constants.siegeGarrisonDamageScale * (hasOrdnance ? 1 : 0.55);
  const damageOnFail = damageOnWin * 0.3;

  return {
    strongholdStats,
    unitStats,
    unitHex,
    strongholdHex,
    night,
    hasCapability,
    hasOrdnance,
    ordnanceCost,
    attackStrength,
    defenceStrength,
    winChance,
    lossOnWin: lossBase * constants.lossWinFactor,
    lossOnFail: lossBase * constants.lossFailFactor,
    damageOnWin,
    damageOnFail,
    garrison,
    supplyRatio,
    massBase,
  };
}

function PreviewSiege(state, unitId, strongholdId, options = {}) {
  const unit = FindUnit(state, unitId);
  const stronghold = strongholdId ? FindStronghold(state, strongholdId) : null;
  if (!unit || !stronghold) {
    return {
      valid: false,
      reason: "没有可攻击的据点",
      odds: 0,
      expectedDamage: 0,
      expectedLoss: 0,
      capture: EmptyCaptures(),
      exposureDelta: 0,
      risks: [],
      modifiers: [],
    };
  }
  const mode = options.mode === "Blockade" ? "Blockade" : "Assault";
  const model = BuildSiegeModel(state, unit, stronghold, options);
  const constants = combatConstants;

  if (mode === "Blockade") {
    const tightness = 0.45 + model.massBase * constants.blockadeMassBonus;
    return {
      valid: true,
      reason: "",
      mode,
      odds: Round1(Clamp01(tightness) * 100) / 100,
      expectedDamage: Round1(model.garrison * constants.blockadeGarrisonDrain),
      expectedLoss: Round1((unit.maxHp || 50) * 0.02),
      capture: EmptyCaptures(),
      exposureDelta: Round1(constants.exposureFloor + 1),
      risks: [
        { key: "Slow", label: "围困见效慢，需持续封锁数个季度", severity: 0.4 },
        { key: "Relief", label: "敌可能出动增援解围", severity: 0.55 },
      ],
      modifiers: [
        { label: "群众封锁（不给敌人一粒粮）", value: Round1(model.massBase * constants.blockadeMassBonus * 100) / 100 },
        { label: "无需强攻，伤亡极低", value: -Round1((unit.maxHp || 50) * 0.2) },
      ],
    };
  }

  const expectedDamage = model.winChance * model.damageOnWin + (1 - model.winChance) * model.damageOnFail;
  const expectedLoss = Math.min(
    unit.hp ?? model.unitStats.hp,
    model.winChance * model.lossOnWin + (1 - model.winChance) * model.lossOnFail
  );
  const capturedOrdnance = model.winChance * constants.siegeCaptureOrdnance * model.strongholdStats.ordnance;
  const risks = [];
  if (!model.hasCapability) {
    risks.push({ key: "NoSiege", label: "没有爆破组/工兵，硬攻炮楼伤亡极高，建议改用围困", severity: 0.95 });
  }
  if (!model.hasOrdnance) {
    risks.push({ key: "NoOrdnance", label: `弹药不足（需械 ${model.ordnanceCost}）`, severity: 0.85 });
  }
  risks.push({ key: "Relief", label: "邻近据点可能出兵增援", severity: 0.6 });

  const modifiers = [
    { label: `据点火力 ${model.defenceStrength.toFixed(1)}`, value: -Round1(model.defenceStrength / 100) },
    { label: model.hasCapability ? "爆破作业" : "无攻坚器材", value: model.hasCapability ? 0.2 : -constants.siegeNoCapabilityOddsPenalty },
  ];
  if (model.night) modifiers.push({ label: "夜袭据点", value: constants.nightWinBonus });

  return {
    valid: true,
    reason: "",
    mode,
    odds: Round1(model.winChance * 100) / 100,
    expectedDamage: Round1(expectedDamage),
    expectedLoss: Round1(expectedLoss),
    capture: {
      ordnance: Round1(capturedOrdnance),
      grain: Round1(model.winChance * constants.siegeCaptureGrain * model.strongholdStats.ordnance),
      medicine: Round1(model.winChance * constants.siegeCaptureMedicine),
    },
    exposureDelta: Round1((constants.exposureAttackBase + constants.exposureStrongholdBonus) * constants.exposureStayFactor),
    risks,
    modifiers,
  };
}

export function ResolveSiege(state, unitId, strongholdId, options = {}) {
  const constants = combatConstants;
  const unit = FindUnit(state, unitId);
  const stronghold = strongholdId ? FindStronghold(state, strongholdId) : null;
  const report = EmptyReport();
  if (!unit || !stronghold) {
    report.lines.push("找不到部队或据点");
    report.valid = false;
    return { nextState: state, report };
  }
  if (HexDistanceKeys(unit.key, stronghold.key) > 1) {
    report.lines.push("需要先抵近据点");
    report.valid = false;
    return { nextState: state, report };
  }

  const mode = options.mode === "Blockade" ? "Blockade" : "Assault";
  const model = BuildSiegeModel(state, unit, stronghold, options);
  const underminedLevel = Clamp(Number(stronghold.undermined) || 0, 0, 4);
  const draft = CreateDraft(state);
  const ledgerDelta = EmptyLedger();
  const captures = EmptyCaptures();
  const strongholdStats = model.strongholdStats;

  if (mode === "Blockade") {
    // 围困：断水断粮，是最省人的解法——但不是零风险的解法。
    const roll = DrawRoll(draft);
    const tightness = Clamp01(0.45 + model.massBase * constants.blockadeMassBonus);
    const drain = constants.blockadeSupplyDrain * (0.6 + tightness);
    const strongholdDraft = DraftStronghold(draft, stronghold.id);
    let surrendered = false;
    if (strongholdDraft) {
      strongholdDraft.supply = Round1(Math.max(0, (stronghold.supply ?? strongholdStats.supply) - drain));
      strongholdDraft.alarm = Clamp((stronghold.alarm || 0) + 6, 0, 100);
      // 坑道作业：围得越久，墙根下的药室越深——之后强攻的胜算随之上升。
      // 没有爆破组的部队也因此有一条"有代价但可行"的攻坚路径。
      strongholdDraft.undermined = Clamp((stronghold.undermined || 0) + 1, 0, 4);
      if (strongholdDraft.supply <= 0) {
        const attrition = model.garrison * constants.blockadeGarrisonDrain * (1 + tightness);
        strongholdDraft.garrison = Round1(Math.max(0, model.garrison - attrition));
        // 伪军工作（puppetDefection）在围困里兑现：里应外合，促其反正/瓦解。
        const defectionBonus = Clamp01((state.playerEffects && state.playerEffects.puppetDefection) || 0) * 0.5;
        const surrenderChance = constants.blockadeSurrenderBase + tightness * 0.25 + defectionBonus;
        surrendered = roll < surrenderChance || strongholdDraft.garrison <= 0;
        report.casualties = { ours: 0, theirs: RoundInt(attrition) };
      }
    }
    if (surrendered) {
      captures.ordnance = RoundInt(constants.siegeCaptureOrdnance * strongholdStats.ordnance * 0.8);
      captures.grain = RoundInt(constants.siegeCaptureGrain * strongholdStats.ordnance * 0.5);
      captures.medicine = RoundInt(constants.siegeCaptureMedicine * 0.6);
      ApplyCaptureStronghold(draft, stronghold, report);
      report.lines.push("据点断粮多日，守敌撤走/放下武器，炮楼被拆除，砖石归还各村。");
    } else {
      report.lines.push(
        `封锁沟与民兵哨卡把${strongholdStats.name}围住，粮秣断绝，敌不敢出。围困不流血，但需要耐心。`
      );
    }
    const unitDraft = DraftUnit(draft, unitId);
    if (unitDraft) {
      unitDraft.moves = 0;
      unitDraft.fatigue = Clamp((unit.fatigue || 0) + 6, 0, 100);
      unitDraft.combat = { ...(unit.combat || {}), lastActionTurn: state.turn || 0, blockading: stronghold.id };
      // 守敌不是待宰的：补给未断时随时可能乘夜出击袭扰围困阵地。
      // 围困从"零风险最优解"回到"省人但要蹲得住"的定位（第二轮评审 P1）。
      if (!surrendered) {
        const sortieRoll = DrawRoll(draft);
        const supplyRatio = Clamp01((strongholdDraft ? strongholdDraft.supply : 0) / Math.max(1, strongholdStats.supply));
        const sortieChance = (0.14 + Clamp01(model.garrison / 6) * 0.18) * (0.35 + supplyRatio * 0.65);
        if (sortieRoll < sortieChance) {
          const sortieDamage = Round1(Math.max(2, model.garrison * (0.8 + DrawRoll(draft) * 0.9)));
          unitDraft.hp = Round1(Math.max(0, (unit.hp ?? 0) - sortieDamage));
          unitDraft.hidden = false;
          report.casualties = { ours: RoundInt(sortieDamage), theirs: report.casualties?.theirs ?? 0 };
          report.lines.push(`守敌乘夜出击袭扰围困阵地，我减员 ${RoundInt(sortieDamage)}。`);
          report.effects.push({ kind: "Smoke", key: unit.key, payload: { level: 1 } });
        }
      }
    }
    const grainCost = constants.siegeBlockadeGrainCost;
    const stockDraft = DraftStock(draft);
    stockDraft.grain = Math.max(0, (stockDraft.grain || 0) - grainCost);
    ApplyCaptures(draft, captures);

    const exposureDelta = Round1(constants.exposureFloor + 1);
    draft.next.exposure = Clamp((state.exposure || 0) + exposureDelta, 0, 100);
    report.effects.push({ kind: "Siege", key: stronghold.key, payload: { mode, surrendered } });
    report.effects.push({ kind: "FloatingText", key: stronghold.key, payload: { text: "围困", tone: "info" } });
    if (surrendered) report.effects.push({ kind: "Capture", key: stronghold.key, payload: { ...captures } });
    report.captures = captures;
    report.ledgerDelta = ledgerDelta;
    report.exposureDelta = exposureDelta;
    report.moved = false;
    report.valid = true;
    report.mode = mode;
    report.captured = surrendered;
    DraftLog(draft, { turn: state.turn || 0, kind: "Blockade", key: stronghold.key, text: report.lines[0] });
    return { nextState: CommitDraft(draft), report };
  }

  // 强攻
  const winRoll = DrawRoll(draft);
  const damageRoll = DrawRoll(draft);
  const lossRoll = DrawRoll(draft);
  const victory = winRoll < model.winChance;
  const damageVariance = 1 + (damageRoll - 0.5) * 2 * constants.damageVarianceSpread;
  const lossVariance = 1 + (lossRoll - 0.5) * 2 * constants.lossVarianceSpread;

  // 坑道作业的兑现：药室越深，爆破的杀伤越大、破防线越宽——
  // 普通部队"围三攻一"由此成为可行路径（第三轮复核 P1）。
  let garrisonLoss = (victory ? model.damageOnWin : model.damageOnFail) * damageVariance * (1 + underminedLevel * 0.3);
  garrisonLoss = Math.max(0, Math.min(model.garrison, garrisonLoss));
  let ourLoss = (victory ? model.lossOnWin : model.lossOnFail) * lossVariance * (1 - underminedLevel * 0.1);
  ourLoss = Math.min(unit.hp ?? model.unitStats.hp, Math.max(0, ourLoss));

  const strongholdDraft = DraftStronghold(draft, stronghold.id);
  const remainingGarrison = Math.max(0, model.garrison - garrisonLoss);
  const captured = victory && remainingGarrison <= 0.5 + underminedLevel * 0.35;
  if (strongholdDraft) {
    strongholdDraft.garrison = Round1(remainingGarrison);
    strongholdDraft.alarm = Clamp((stronghold.alarm || 0) + 18, 0, 100);
  }
  if (captured) {
    captures.ordnance = RoundInt(constants.siegeCaptureOrdnance * strongholdStats.ordnance);
    captures.grain = RoundInt(constants.siegeCaptureGrain * strongholdStats.ordnance);
    captures.medicine = RoundInt(constants.siegeCaptureMedicine);
    ApplyCaptureStronghold(draft, stronghold, report);
  }

  const unitDraft = DraftUnit(draft, unitId);
  if (unitDraft) {
    unitDraft.hp = Round1(Math.max(0, (unit.hp ?? 0) - ourLoss));
    unitDraft.hidden = false;
    unitDraft.moves = 0;
    unitDraft.fatigue = Clamp((unit.fatigue || 0) + 18, 0, 100);
    unitDraft.xp = (unit.xp || 0) + constants.xpPerEngagement + (captured ? 10 : 0);
    unitDraft.combat = { ...(unit.combat || {}), lastActionTurn: state.turn || 0, withdrew: false };
  }

  const stockDraft = DraftStock(draft);
  if (model.hasOrdnance) stockDraft.ordnance = Math.max(0, (stockDraft.ordnance || 0) - model.ordnanceCost);
  ApplyCaptures(draft, captures);

  if (ourLoss > (unit.maxHp || 50) * 0.5) {
    ledgerDelta.cadreLost += model.hasCapability ? 1 : 2;
  }
  ApplyLedgerDelta(draft, ledgerDelta);

  const exposureDelta = Round1(
    (constants.exposureAttackBase + constants.exposureStrongholdBonus - (model.night ? constants.nightExposureRelief : 0)) *
      constants.exposureStayFactor
  );
  draft.next.exposure = Clamp((state.exposure || 0) + exposureDelta, 0, 100);
  draft.next.alert = Clamp((state.alert || 0) + 8, 0, 100);

  report.lines.push(
    model.hasCapability
      ? `${model.unitStats.name}掘进至墙根装药，${model.night ? "夜间" : ""}爆破${strongholdStats.name}。`
      : `没有爆破器材，只能用梯子与土枪强攻${strongholdStats.name}，这是最不划算的打法。`
  );
  if (!model.hasOrdnance) report.lines.push("弹药不足，火力准备不充分。");
  if (captured) {
    report.lines.push(`${strongholdStats.name}被拔除，缴获械 ${captures.ordnance}、粮 ${captures.grain}、药 ${captures.medicine}。`);
    report.lines.push("附近各村连夜出工平毁工事，封锁沟被填平。");
  } else if (victory) {
    report.lines.push(`打掉了外壕与一部分火力点，守敌减员 ${RoundInt(garrisonLoss)}，但据点仍在敌手。`);
  } else {
    report.lines.push("敌居高临下，强攻受挫，部队按预案撤出。");
  }
  report.lines.push(`我方减员 ${RoundInt(ourLoss)}。`);
  if (!model.hasCapability) {
    report.lines.push("经验教训：攻坚要靠爆破与坑道，或者干脆围困断粮，不要拿人去填。");
  }

  report.effects.push({ kind: "Siege", key: stronghold.key, payload: { mode, victory, captured, night: model.night } });
  report.effects.push({ kind: "Smoke", key: stronghold.key, payload: { level: victory ? 3 : 2 } });
  if (captured) report.effects.push({ kind: "Capture", key: stronghold.key, payload: { ...captures } });
  report.effects.push({
    kind: "FloatingText",
    key: stronghold.key,
    payload: { text: captured ? "据点拔除" : `-${RoundInt(garrisonLoss)}`, tone: victory ? "good" : "warn" },
  });

  report.captures = captures;
  report.casualties = { ours: RoundInt(ourLoss), theirs: RoundInt(garrisonLoss) };
  report.ledgerDelta = ledgerDelta;
  report.exposureDelta = exposureDelta;
  report.moved = false;
  report.valid = true;
  report.mode = mode;
  report.victory = victory;
  report.captured = captured;
  DraftLog(draft, { turn: state.turn || 0, kind: "Siege", key: stronghold.key, text: report.lines[0] });

  return { nextState: CommitDraft(draft), report };
}

function ApplyCaptureStronghold(draft, stronghold, report) {
  const strongholdDraft = DraftStronghold(draft, stronghold.id);
  if (strongholdDraft) {
    strongholdDraft.garrison = 0;
    strongholdDraft.supply = 0;
    strongholdDraft.alarm = 0;
    strongholdDraft.destroyed = true;
  }
  const hexDraft = DraftHex(draft, stronghold.key);
  if (hexDraft) {
    hexDraft.control = "Guerrilla";
    hexDraft.intel = Math.min(100, (hexDraft.intel || 0) + 25);
  }
  // 拔点的群众红利：压在炮楼阴影下的村子敢喘气了——躲出去的人回来、
  // 白天也敢下地。这是"打仗保护百姓"最直接的兑现（一次性开花 + 压制场解除）。
  for (const key of [stronghold.key, ...HexNeighborKeys(stronghold.key)]) {
    const nearby = DraftHex(draft, key);
    if (!nearby) continue;
    const bloom = key === stronghold.key ? 14 : 10;
    nearby.massBase = Clamp((nearby.massBase || 0) + bloom, 0, 100);
    nearby.scorch = Math.max(0, (nearby.scorch || 0) - 20);
  }
  report.lines.push("据点周边各村当夜点起灯火：躲反的人陆续回庄，群众基础显著回升。");
  report.effects.push({ kind: "Capture", key: stronghold.key, payload: { stronghold: true } });
}

// ---------------------------------------------------------------------------
// 十四、反扫荡
// ---------------------------------------------------------------------------

export function ResolveSweepBattle(state, sweep) {
  const constants = combatConstants;
  const report = EmptyReport();
  if (!sweep || !sweep.targetKey) {
    report.lines.push("没有正在进行的扫荡");
    report.valid = false;
    return { nextState: state, report };
  }
  // 不定方针不是白拿最优：没表态就是仓促应变，比任何一个主动选择都差。
  const stanceKey = sweep.stance || state.sweepStance || "Unprepared";
  const profile = constants.sweepStanceProfiles[stanceKey] || constants.sweepStanceProfiles.Unprepared;
  const draft = CreateDraft(state);

  const radius = sweep.radius || constants.sweepRadius;
  const axis = new Set(Array.isArray(sweep.axisKeys) ? sweep.axisKeys : []);
  const affectedKeys = [];
  const hexes = (state.map && state.map.hexes) || {};
  for (const key of Object.keys(hexes)) {
    if (axis.has(key) || HexDistanceKeys(key, sweep.targetKey) <= radius) affectedKeys.push(key);
  }
  affectedKeys.sort();

  const sweepStrength = Math.max(1, sweep.strength || 40);
  const ledgerDelta = EmptyLedger();
  const captures = EmptyCaptures();
  let ourLoss = 0;
  let theirLoss = 0;
  let unitsMoved = 0;

  // 区域的群众基础与地道网决定坚壁清野做得多彻底
  let massSum = 0;
  let tunnelCount = 0;
  let villageCount = 0;
  for (const key of affectedKeys) {
    const hex = hexes[key];
    if (!hex) continue;
    massSum += hex.massBase || 0;
    if (hex.tunnel) tunnelCount += 1;
    if (hex.feature === "Village" || hex.feature === "Town" || hex.feature === "CountySeat") villageCount += 1;
  }
  const massAverage = affectedKeys.length ? Clamp01(massSum / affectedKeys.length / 100) : 0;
  const tunnelRatio = affectedKeys.length ? tunnelCount / affectedKeys.length : 0;
  const shelter = Clamp01(massAverage * constants.sweepMassRelief + tunnelRatio * constants.sweepTunnelRelief);

  // 我方部队：先合计圈内防御战力（决战判定要用），再按方针逐一处置。
  const units = state.units || [];
  const defenceByUnit = new Map();
  let totalDefence = 0;
  for (const unit of units) {
    if (!unit || (unit.hp ?? 0) <= 0) continue;
    if (!affectedKeys.includes(unit.key)) continue;
    const unitStats = ResolveUnitStats(unit.type);
    if (unitStats.side === "Enemy") continue;
    const hex = GetHex(state, unit.key);
    // 反扫荡不是各打各的：同格与相邻的可战友军互为依托（守方支援每人 +5%，封顶 15%）
    const support = CountFriendlySupport(state, unit, { includeSameHex: true });
    const defence = ComputeStrength(state, unit, hex, { role: "Defence", night: false, supportCount: support.count });
    defenceByUnit.set(unit.id, defence);
    totalDefence += defence;
  }

  // 正面决战是一次真赌博：兵力与掩护足够就把敌顶回去，村庄工事全保；
  // 顶不住就是灾难。ledgerScale 把"这一仗打得怎么样"传导进百姓的代价。
  let repelled = false;
  let ledgerScale = 1;
  if (stanceKey === "Decisive") {
    const repelRoll = DrawRoll(draft);
    const repelChance = Clamp01(
      (totalDefence * 1.7) / Math.max(1, sweepStrength + totalDefence * 1.7) - 0.22 + shelter * 0.2,
    );
    repelled = repelRoll < repelChance;
    if (repelled) {
      ledgerScale = 0.25;
      theirLoss += sweepStrength * 0.3;
    }
  }

  for (const unit of units) {
    if (!defenceByUnit.has(unit.id)) continue;
    const unitStats = ResolveUnitStats(unit.type);
    const hex = GetHex(state, unit.key);
    const maxHp = unit.maxHp || unitStats.hp || 50;
    const defence = defenceByUnit.get(unit.id);

    const pressure = sweepStrength / Math.max(1, sweepStrength + defence * 2);
    let loss = maxHp * 0.3 * pressure * profile.ourLossFactor;
    if (stanceKey === "Decisive" && repelled) loss *= 0.55;
    if (stanceKey === "Disperse" || stanceKey === "CounterRaid") {
      const escapeRoll = DrawRoll(draft);
      const escapeChance = ComputeRetreatChance(state, unit, hex, false);
      const escaped = escapeRoll < escapeChance;
      const unitDraft = DraftUnit(draft, unit.id);
      if (escaped) {
        loss *= 0.45;
        const destination =
          stanceKey === "CounterRaid" ? ChooseCounterRaidHex(state, unit, affectedKeys) : ChooseDisperseHex(state, unit, affectedKeys);
        if (unitDraft && destination) {
          unitDraft.key = destination;
          unitsMoved += 1;
        }
      }
      if (unitDraft) {
        unitDraft.hp = Round1(Math.max(0, (unit.hp ?? maxHp) - loss));
        unitDraft.fatigue = Clamp((unit.fatigue || 0) + 22, 0, 100);
        unitDraft.hidden = stanceKey === "Disperse" ? true : unitDraft.hidden;
        unitDraft.moves = 0;
        unitDraft.combat = { ...(unit.combat || {}), sweptTurn: state.turn || 0 };
      }
    } else {
      const unitDraft = DraftUnit(draft, unit.id);
      if (unitDraft) {
        unitDraft.hp = Round1(Math.max(0, (unit.hp ?? maxHp) - loss));
        unitDraft.fatigue = Clamp((unit.fatigue || 0) + 26, 0, 100);
        unitDraft.hidden = false;
        unitDraft.moves = 0;
        unitDraft.combat = { ...(unit.combat || {}), sweptTurn: state.turn || 0 };
      }
    }
    ourLoss += loss;
    theirLoss += defence * 0.5 * profile.theirLossFactor;
  }

  // 敌进我进：趁守备空虚打其后方据点
  if (stanceKey === "CounterRaid") {
    const raidRoll = DrawRoll(draft);
    const strongholds = state.strongholds || [];
    let target = null;
    for (const item of strongholds) {
      if (!item || (item.garrison ?? 0) <= 0) continue;
      if (HexDistanceKeys(item.key, sweep.targetKey) <= radius) continue; // 打的是后方，不是合围圈内
      if (!target || (item.garrison || 0) < (target.garrison || 0)) target = item;
    }
    if (target) {
      const raidDamage = (target.garrison || 0) * (0.18 + raidRoll * 0.2);
      const strongholdDraft = DraftStronghold(draft, target.id);
      if (strongholdDraft) {
        strongholdDraft.garrison = Round1(Math.max(0, (target.garrison || 0) - raidDamage));
        strongholdDraft.alarm = Clamp((target.alarm || 0) + 20, 0, 100);
      }
      theirLoss += raidDamage;
      // 敌后起火，合围被迫提前收兵——这一次扫荡对地方的破坏有所减轻
      //（幅度收在 0.85：外线打得再好，圈里的村庄也已经在挨烧）。
      ledgerScale = Math.min(ledgerScale, 0.85);
      captures.ordnance += RoundInt(raidDamage * 2.2 * profile.captureFactor);
      captures.grain += RoundInt(raidDamage * 1.4 * profile.captureFactor);
      report.lines.push(
        `敌主力西进扫荡，后方空虚。武工队反向出击，袭击了${ResolveStrongholdStats(target.type).name}，敌被迫提前回兵。`
      );
      report.effects.push({ kind: "Ambush", key: target.key, payload: { counterRaid: true } });
    }
  }

  // 代价账本：扫荡对人民的损害只记账，绝不产生任何收益。
  // ledgerScale 是唯一的调节口：把敌顶回去（决战得手）或迫其早撤（敌进我进得手）
  // 才能真正减轻百姓的代价——这就是"打仗换平安"的传导链。
  const civilianBase = constants.sweepCivilianBase * villageCount * (sweepStrength / 40);
  ledgerDelta.civilianDeaths = RoundInt(civilianBase * profile.civilianFactor * (1 - shelter) * ledgerScale);
  ledgerDelta.villagesBurned = RoundInt(
    constants.sweepVillageBase * villageCount * profile.villageFactor * (1 - shelter * 0.6) * ledgerScale,
  );
  ledgerDelta.grainSeized = RoundInt(constants.sweepGrainBase * villageCount * profile.grainFactor * (1 - shelter) * ledgerScale);
  ledgerDelta.displaced = RoundInt(
    constants.sweepDisplacedBase * villageCount * profile.displacedFactor * (1 - shelter * 0.4) * ledgerScale,
  );
  ledgerDelta.cadreLost = RoundInt(constants.sweepCadreBase * villageCount * profile.cadreFactor * (1 - shelter * 0.5) * ledgerScale);

  // 被夺走的粮食从库存中扣除（这是损失，不是收益）
  if (ledgerDelta.grainSeized > 0) {
    const stockDraft = DraftStock(draft);
    stockDraft.grain = Math.max(0, (stockDraft.grain || 0) - ledgerDelta.grainSeized);
  }
  if (ledgerDelta.cadreLost > 0) {
    const stockDraft = DraftStock(draft);
    stockDraft.cadre = Math.max(0, (stockDraft.cadre || 0) - ledgerDelta.cadreLost);
  }

  // 地块状态：焦土、控制权动摇、群众基础受创、沿线工事被平毁
  const protectWorks = stanceKey === "Fortify" || repelled;
  let worksLost = 0;
  for (const key of affectedKeys) {
    const source = hexes[key];
    if (!source) continue;
    const isSettlement = source.feature === "Village" || source.feature === "Town" || source.feature === "CountySeat";
    if (!isSettlement && (source.massBase || 0) < 20) continue;
    const hexDraft = DraftHex(draft, key);
    if (!hexDraft) continue;
    const onAxis = axis.has(key);
    const scorchGain = (isSettlement ? 16 : 6) * profile.villageFactor * (1 - shelter * 0.6) * ledgerScale;
    hexDraft.scorch = Clamp((hexDraft.scorch || 0) + scorchGain, 0, 100);
    // 群众基础：扫荡会打掉一些，但坚壁清野与地道能保住人心。
    // 化整为零让开正面（Disperse/CounterRaid）意味着敌沿轴线通行无阻——保人失地。
    let massHit = (isSettlement ? 6 : 2) * profile.civilianFactor * (1 - shelter) * ledgerScale;
    if (onAxis && (stanceKey === "Disperse" || stanceKey === "CounterRaid")) massHit += 2.5;
    const massGain = stanceKey === "Disperse" || stanceKey === "CounterRaid" ? 2 * massAverage : 0;
    hexDraft.massBase = Clamp((hexDraft.massBase || 0) - massHit + massGain, 0, 100);
    // 扫荡沿途平毁工事：只有依托工事死守（Fortify）或把敌顶回去（决战得手）才保得住。
    if (!protectWorks && hexDraft.works.length && (onAxis || isSettlement) && (1 - shelter) * sweepStrength >= 18) {
      const razed = hexDraft.works.pop();
      if (razed === "Tunnel") hexDraft.tunnel = false;
      worksLost += 1;
    }
    if (hexDraft.control === "Base" && profile.villageFactor >= 1 && !repelled) hexDraft.control = "Contested";
  }
  if (worksLost > 0) report.lines.push(`敌沿途平毁工事 ${worksLost} 处：地道口被灌，壕沟被填。`);

  // 根据地受创：合围圈里的基地顶不住时降级/停摆——政权转入地下，人口疏散。
  for (const base of state.bases || []) {
    if (!affectedKeys.includes(base.key)) continue;
    const shelterHere = Clamp01(shelter + (stanceKey === "Fortify" ? 0.2 : 0));
    if (repelled || sweepStrength * (1 - shelterHere) < 26) continue;
    const baseDraft = DraftBase(draft, base.id);
    if (!baseDraft) continue;
    const popBefore = baseDraft.population || 0;
    if ((baseDraft.tier || 1) > 1) {
      baseDraft.tier -= 1;
      baseDraft.population = Math.max(60, Math.round(popBefore * 0.72));
      report.lines.push(`${baseDraft.name}遭合围重创：区署与仓库转入地下，政权降级坚持。`);
    } else {
      baseDraft.disrupted = Math.max(baseDraft.disrupted || 0, 2);
      baseDraft.population = Math.max(60, Math.round(popBefore * 0.85));
      report.lines.push(`${baseDraft.name}被敌反复清剿，机关分散隐蔽，生产停顿。`);
    }
    const fled = Math.max(0, popBefore - baseDraft.population);
    if (fled > 0) ledgerDelta.displaced += RoundInt(fled * 0.4);
    report.effects.push({ kind: "Smoke", key: base.key, payload: { level: 2 } });
  }

  ApplyLedgerDelta(draft, ledgerDelta);
  ApplyCaptures(draft, captures);

  const exposureDelta = Round1(-constants.exposureSweepRelief * (1 - profile.exposureFactor));
  draft.next.exposure = Clamp((state.exposure || 0) + exposureDelta, 0, 100);
  draft.next.alert = Clamp((state.alert || 0) + (stanceKey === "Decisive" ? 10 : 4), 0, 100);
  draft.next.sweep = null;
  // 方针只对本次扫荡有效：扫荡结束即清空，下一次要重新定下来
  draft.next.sweepStance = null;

  // 战报（不泄漏裸坐标：用地形名指代地域）
  const targetHexRef = GetHex(state, sweep.targetKey);
  const targetLabel = targetHexRef ? `${ResolveTerrainStats(targetHexRef.terrain).name}一带` : "根据地一带";
  report.lines.unshift(`敌以${RoundInt(sweepStrength)}兵力合围${targetLabel}，我采取「${profile.name}」。`);
  if (stanceKey === "Disperse") {
    report.lines.push("各村提前坚壁清野，粮食入窖、碾磨拆散，部队化整为零跳出合围。");
    report.lines.push(`${unitsMoved} 支分队转移到外线，未与敌主力硬碰；敌沿合围轴线如入无人之境。`);
  } else if (stanceKey === "Decisive") {
    if (repelled) {
      report.lines.push("主力依托预设阵地顶住了合围正面。敌攻势受挫，天黑前脱离接触。");
      report.lines.push("村庄、工事与在建工程大部保全——这一仗赌赢了。");
    } else {
      report.lines.push("部队在预设阵地与敌主力正面对抗。敌火力与兵力均占优，阵地反复易手。");
      report.lines.push("这一仗把家底打进去了，村庄也没能保住。");
    }
  } else if (stanceKey === "CounterRaid") {
    report.lines.push("主力跳到外线，反向袭击敌后方交通与据点，迫敌回援。");
  } else {
    report.lines.push("依托地道与工事节节抗击，掩护群众转移，保住了地上的工程。");
  }
  report.lines.push(
    `代价账本：乡亲遇害 ${ledgerDelta.civilianDeaths} 人，被焚村庄 ${ledgerDelta.villagesBurned} 个，` +
      `被抢粮 ${ledgerDelta.grainSeized}，流离失所 ${ledgerDelta.displaced} 人，骨干损失 ${ledgerDelta.cadreLost} 人。`
  );
  report.lines.push("这些数字只记在账上，不换任何东西。");
  DraftLedgerLog(draft, {
    kind: "Sweep",
    key: sweep.targetKey,
    text:
      `敌${RoundInt(sweepStrength)}兵力合围${targetLabel}（我采取${profile.name}）：` +
      `乡亲遇害 ${ledgerDelta.civilianDeaths}，焚村 ${ledgerDelta.villagesBurned}，被抢粮 ${ledgerDelta.grainSeized}，` +
      `流离 ${ledgerDelta.displaced}，骨干损失 ${ledgerDelta.cadreLost}。`,
    delta: { ...ledgerDelta },
  });

  report.effects.push({ kind: "Smoke", key: sweep.targetKey, payload: { level: 3, wide: true } });
  if (stanceKey === "Disperse" || stanceKey === "CounterRaid") {
    report.effects.push({ kind: "Retreat", key: sweep.targetKey, payload: { dispersed: true, count: unitsMoved } });
  }
  report.effects.push({
    kind: "FloatingText",
    key: sweep.targetKey,
    payload: { text: profile.name, tone: stanceKey === "Decisive" ? "bad" : "info" },
  });

  report.captures = captures;
  report.casualties = { ours: RoundInt(ourLoss), theirs: RoundInt(theirLoss) };
  report.ledgerDelta = ledgerDelta;
  report.exposureDelta = exposureDelta;
  report.moved = unitsMoved > 0;
  report.valid = true;
  report.stance = stanceKey;
  report.ledgerCost =
    ledgerDelta.civilianDeaths * 3 +
    ledgerDelta.villagesBurned * 8 +
    ledgerDelta.grainSeized * 0.5 +
    ledgerDelta.displaced * 0.4 +
    ledgerDelta.cadreLost * 12;
  DraftLog(draft, { turn: state.turn || 0, kind: "Sweep", key: sweep.targetKey, text: report.lines[0] });

  return { nextState: CommitDraft(draft), report };
}

function ChooseDisperseHex(state, unit, affectedKeys) {
  const affected = new Set(affectedKeys);
  const neighbours = HexNeighborKeys(unit.key);
  let best = null;
  let bestScore = -Infinity;
  for (const key of neighbours) {
    const hex = GetHex(state, key);
    if (!hex) continue;
    if (FindEnemyAt(state, key)) continue;
    const terrain = ResolveHexStats(hex);
    let score = terrain.concealment * 2.2 + Clamp01((hex.massBase || 0) / 100) * 1.4;
    if (!affected.has(key)) score += 2.5; // 跳出合围圈是首要目标
    if (hex.tunnel) score += 1;
    if ((hex.road || 0) > 0) score -= 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

function ChooseCounterRaidHex(state, unit, affectedKeys) {
  const affected = new Set(affectedKeys);
  const neighbours = HexNeighborKeys(unit.key);
  let best = null;
  let bestScore = -Infinity;
  const strongholds = state.strongholds || [];
  for (const key of neighbours) {
    const hex = GetHex(state, key);
    if (!hex) continue;
    if (FindEnemyAt(state, key)) continue;
    let score = affected.has(key) ? 0 : 2;
    let nearest = 99;
    for (const item of strongholds) {
      if (!item || (item.garrison ?? 0) <= 0) continue;
      if (affected.has(item.key)) continue;
      nearest = Math.min(nearest, HexDistanceKeys(key, item.key));
    }
    score += Math.max(0, 6 - nearest); // 向敌后方据点靠近
    score += ResolveHexStats(hex).concealment;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 十五、回合结算：减员恢复 / 疲劳 / 隐蔽恢复
// ---------------------------------------------------------------------------

export function TickCombatRecovery(state) {
  const constants = combatConstants;
  const draft = CreateDraft(state);
  const turn = state.turn || 0;
  const stock = state.stock || {};
  let medicineBudget = stock.medicine || 0;
  let medicineSpent = 0;

  const units = state.units || [];
  for (const unit of units) {
    if (!unit) continue;
    // hp 归零的部队已经被打散，不参与恢复——由回合结算的打散/归队管线接手。
    if ((unit.hp ?? 0) <= 0) continue;
    const stats = ResolveUnitStats(unit.type);
    if (stats.side === "Enemy") continue;
    const hex = GetHex(state, unit.key);
    const terrain = ResolveHexStats(hex);
    const massBase = Clamp01((hex && hex.massBase ? hex.massBase : 0) / 100);
    const maxHp = unit.maxHp || stats.hp || 50;
    const unitDraft = DraftUnit(draft, unit.id);
    if (!unitDraft) continue;

    // 减员恢复：靠根据地、群众基础与药品。药品实际消耗，绝不凭空生人。
    // 刚被扫荡打击过的部队当回合不恢复——扫荡的伤必须真的痛一回合，
    // 否则全游戏最大的威胁对部队的净伤害是 0（评审实测翻过的车）。
    const sweptThisTurn = (unit.combat || {}).sweptTurn === turn;
    if ((unit.hp ?? maxHp) < maxHp && !sweptThisTurn) {
      let rate = constants.recoverHpBase + massBase * constants.recoverHpMass;
      if (hex && hex.control === "Base") rate += constants.recoverHpBase2;
      const wantMedicine = medicineBudget > 0;
      if (wantMedicine) rate += constants.recoverHpMedicine;
      const healRateBonus = (state.playerEffects && state.playerEffects.healRate) || 0;
      rate = Math.max(0.01, rate + healRateBonus);
      const healed = Math.min(maxHp - (unit.hp ?? maxHp), maxHp * rate);
      unitDraft.hp = Round1((unit.hp ?? maxHp) + healed);
      if (wantMedicine) {
        const efficiency = Clamp01((state.playerEffects && state.playerEffects.medicineEfficiency) || 0);
        const cost = healed * constants.recoverMedicineCostPerHp * (1 - efficiency);
        const paid = Math.min(medicineBudget, cost);
        medicineBudget -= paid;
        medicineSpent += paid;
      }
    }

    // 疲劳恢复
    const fatigueRelief = constants.recoverFatigue + massBase * constants.recoverFatigueMass;
    unitDraft.fatigue = Clamp((unit.fatigue || 0) - fatigueRelief, 0, 100);

    // 隐蔽恢复：必须"转移 + 群众基础掩护"。
    // 本回合刚打过又赖在原地的，藏不住；打完就转移的，当回合即可重新隐蔽。
    // （用 withdrew 而非单纯的回合号判断，避免依赖 Script_Rules 调用本函数的先后次序。）
    if (!unit.hidden) {
      const combat = unit.combat || {};
      const pinnedDown = combat.lastActionTurn === turn && !combat.withdrew;
      if (!pinnedDown) {
        let chance = constants.hiddenRecoverBase;
        chance += massBase * constants.hiddenRecoverMass;
        chance += terrain.concealment * constants.hiddenRecoverTerrain;
        if (hex && (hex.tunnel || (Array.isArray(hex.works) && hex.works.includes("Tunnel")))) {
          chance += constants.hiddenRecoverTunnel;
        }
        if (combat.withdrew) chance += constants.hiddenRecoverMovedBonus;
        chance += Clamp01((state.playerEffects && state.playerEffects.concealment) || 0) * 0.4;
        chance -= Clamp01((unitDraft.fatigue || 0) / 100) * constants.hiddenRecoverFatiguePenalty;
        if (hex && hex.control === "Enemy") chance -= 0.15;
        chance = Clamp(chance, 0.02, 0.95);
        const roll = DrawRoll(draft);
        if (roll < chance) {
          unitDraft.hidden = true;
          unitDraft.combat = { ...(unit.combat || {}), hiddenSinceTurn: turn };
        }
      }
    }

    // 行动力刷新；本回合行军里程清零（隐蔽规则按回合累计）
    unitDraft.moves = unit.maxMoves || stats.moves || 3;
    unitDraft.movedThisTurn = 0;
  }

  // 救护：具备 Heal 能力的单位（担架卫生队）每回合为同格与相邻友军补充兵员。
  // 药品实际消耗（0.5/次），无药时救护量减半；救护者自身不在此列。
  for (const healer of units) {
    if (!healer || (healer.hp ?? 0) <= 0) continue;
    const healerStats = ResolveUnitStats(healer.type);
    if (healerStats.side === "Enemy" || !(healerStats.medic > 0)) continue;
    for (const patient of units) {
      if (!patient || patient.id === healer.id) continue;
      if ((patient.hp ?? 0) <= 0) continue;
      const patientStats = ResolveUnitStats(patient.type);
      if (patientStats.side === "Enemy") continue;
      if (patient.key !== healer.key && HexDistanceKeys(patient.key, healer.key) > 1) continue;
      const patientDraft = DraftUnit(draft, patient.id);
      if (!patientDraft) continue;
      const patientMaxHp = patient.maxHp || patientStats.hp || 50;
      if ((patientDraft.hp ?? patientMaxHp) >= patientMaxHp) continue;
      let amount;
      if (medicineBudget >= constants.healMedicineCost) {
        amount = medicineBudget >= constants.healMedicineThreshold ? constants.healSuppliedAmount : constants.healBaseAmount;
        medicineBudget -= constants.healMedicineCost;
        medicineSpent += constants.healMedicineCost;
      } else {
        amount = constants.healBaseAmount * constants.healNoMedicineFactor;
      }
      patientDraft.hp = Round1(Math.min(patientMaxHp, (patientDraft.hp ?? 0) + amount));
    }
  }

  // 药品消耗写回
  if (medicineSpent > 0) {
    const stockDraft = DraftStock(draft);
    stockDraft.medicine = Round1(Math.max(0, (stockDraft.medicine || 0) - medicineSpent));
  }

  // 敌军自然恢复：靠据点补给，被围困的恢复不了
  const enemies = state.enemies || [];
  for (const enemy of enemies) {
    if (!enemy) continue;
    const stats = ResolveUnitStats(enemy.type);
    const maxHp = enemy.maxHp || stats.hp || 60;
    if ((enemy.hp ?? maxHp) >= maxHp) continue;
    const home = enemy.homeStrongholdId ? FindStronghold(state, enemy.homeStrongholdId) : null;
    const supplied = !home || (home.supply ?? 1) > 0;
    if (!supplied) continue;
    const enemyDraft = DraftEnemy(draft, enemy.id);
    if (enemyDraft) {
      enemyDraft.hp = Round1(Math.min(maxHp, (enemy.hp ?? maxHp) + maxHp * constants.enemyRecoverHp));
    }
  }

  // 据点：未被围困则恢复补给，警戒逐步松弛。
  // 围困标记必须以"部队真的还贴在据点旁"为准——tap-and-run（围一下就走）
  // 曾把补给永久冻结（第二轮评审 P1），所以这里做邻接校验。
  const strongholds = state.strongholds || [];
  const blockading = new Set();
  for (const unit of units) {
    const blockadeId = unit && unit.combat && unit.combat.blockading;
    if (!blockadeId || (unit.hp ?? 0) <= 0) continue;
    // 围困要每回合真花行动维持：本回合没执行围困（原地歇着也一样）就算撤围
    //（Rest-park 白嫖维持曾是第三轮复核点名的漏洞）。
    if ((unit.combat.lastActionTurn ?? -1) !== turn) continue;
    const target = strongholds.find((item) => item && item.id === blockadeId);
    if (target && HexDistanceKeys(unit.key, target.key) <= 1) blockading.add(blockadeId);
  }
  for (const item of strongholds) {
    if (!item || item.destroyed) continue;
    const stats = ResolveStrongholdStats(item.type);
    const needsSupply = (item.supply ?? stats.supply) < stats.supply;
    const needsAlarm = (item.alarm || 0) > 0;
    const needsRepair = (item.undermined || 0) > 0;
    if (!needsSupply && !needsAlarm && !needsRepair) continue;
    if (blockading.has(item.id)) continue;
    const strongholdDraft = DraftStronghold(draft, item.id);
    if (strongholdDraft) {
      strongholdDraft.supply = Round1(Math.min(stats.supply, (item.supply ?? stats.supply) + 1.5));
      strongholdDraft.alarm = Clamp((item.alarm || 0) - 6, 0, 100);
      // 围困一撤，守敌就回填坑道——坑道作业的成果不围就守不住。
      strongholdDraft.undermined = Math.max(0, (item.undermined || 0) - 1);
    }
  }

  // 破袭抢修：敌方逐季抢修被破坏的路段
  const hexes = (state.map && state.map.hexes) || {};
  for (const key of Object.keys(hexes)) {
    const hex = hexes[key];
    if (!hex || !(hex.railBroken > 0)) continue;
    const hexDraft = DraftHex(draft, key);
    if (hexDraft) hexDraft.railBroken = Math.max(0, (hexDraft.railBroken || 0) - 1);
  }

  return CommitDraft(draft);
}
