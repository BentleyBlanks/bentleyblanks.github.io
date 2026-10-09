// Data_AerialBombs.mjs — 航空炸弹的物理口径（2026-09-28）：弹体、外弹道常数、落地尺度律、画面预算。
//
// 用户要求：「给飞机的轰炸做得更基于物理、场面更宏大一点」。
// 这张表只放数；外弹道积分、投弹解算与尺度律在 Script_BombBallistics（纯函数），
// 画面在 Script_Vfx.BombBlast。第一关 01–06 的轮番轰炸（Data_FirstLevelAirRaid）按 id 引用这里的弹型。
//
// 弹体数取同级通用爆弹的外形量级（日本陆军 50 kg / 250 kg 级），**装药量是按同级通用弹的装填比估的，
// 不是史料定值** —— 它只用来定落地尺度（火球、弹坑、抛射、冲击环按装药的立方根缩放）。
// 纯数据层：不得 import three。

/**
 * 弹型：
 *   massKg / diameterM / lengthM  弹体（外弹道与画面尺寸都从这三样来）
 *   cd                            带尾翼的亚声速阻力系数（按最大截面积算）
 *   chargeKg                      装药（TNT 当量，估值）
 *   clearM                        纯氛围层的避人距离：炸点离活人与战车至少这么远
 *   minListenerM                  炸点离听者至少这么远（中远处，不贴脸）
 */
export const AERIAL_BOMBS = Object.freeze({
  Bomb50kg: Object.freeze({
    id: "Bomb50kg", label: "50 kg 级通用爆弹",
    massKg: 50, diameterM: 0.2, lengthM: 1.1, cd: 0.25, chargeKg: 22,
    clearM: 28, minListenerM: 125,
  }),
  Bomb250kg: Object.freeze({
    id: "Bomb250kg", label: "250 kg 级通用爆弹",
    massKg: 250, diameterM: 0.36, lengthM: 1.85, cd: 0.22, chargeKg: 100,
    clearM: 46, minListenerM: 175,
  }),
});

export const BOMB_PHYSICS = Object.freeze({
  /** 重力（m/s²）。 */
  gravity: 9.81,
  /** 空气密度（kg/m³）：标准大气海平面；三月鲁南地面约 10 °C，两三百米高差带来的变化不到 3%。 */
  airDensity: 1.225,
  /** 声速（m/s）：音频引擎按 d/340 自动延迟爆炸声，这里只给震屏排时刻用。 */
  soundMps: 340,
  /** 地震波（m/s）：干黄土里的纵波约 300–800 m/s，取 600 —— 脚下那一抖比爆炸声先到。 */
  groundWaveMps: 600,
  /** 外弹道积分：RK4 定步长、每格存一次（仅在排一轮时算一次，不进每帧）。 */
  integrateStepS: 0.01,
  sampleS: 0.1,
  /**
   * 离机后的摆动：尾翼把弹头拉向来流方向，是一个带阻尼的风标振荡。
   * 初始扰动 amplitudeDeg，按 decayS 指数衰减，频率 hz（弹越长越慢，这里不细分）。
   */
  wobble: Object.freeze({ amplitudeDeg: 5, decayS: 1.1, hz: 1.2 }),
  /**
   * 落地尺度律（装药 W 千克的立方根 ∛W 缩放，Hopkinson–Cranz）：
   *   visualK    画面火球 / 尘环的「当量半径」≈ visualK·∛W（50 kg 级约 14 m，与旧版 12–15 m 衔接）
   *   craterK    视在弹坑半径 ≈ craterK·∛W（地面瞬发、黄土）
   *   ejecta     抛射速度按重力区弹坑的速度尺度 √(g·R弹坑) 的倍数给 [最慢, 最快]
   *              （R ∝ ∛W，所以抛射速度 ∝ W^(1/6)：250 kg 的土柱比 50 kg 高一截，但不是高五倍）
   *   shockZ     地面上看得见的冲击环最远到 shockZ·∛W（约 5 kPa，刚好掀得起浮土）
   *   surgeK     底涌尘浪的外沿 ≈ surgeK·∛W
   *   columnU    中心土柱的初速是最快抛射速度的 [最小, 最大] 倍
   */
  blast: Object.freeze({
    visualK: 5.0, craterK: 0.85,
    ejecta: Object.freeze([2.6, 6.0]),
    shockZ: 18, surgeK: 5.5,
    columnU: Object.freeze([0.5, 0.85]),
  }),
});

/**
 * 画面预算（Script_Vfx.BombBlast）。一颗弹的烟团数随 ∛W 增加；一轮落得多时由调用方给 budget < 1 摊薄。
 * 专用池 bombSmoke 的容量按画质档固定，不吃战斗烟池（低画质战斗烟池只有一两百格，
 * 一轮十几颗就能把手榴弹、炮击的烟全挤掉）。池里只画活着的格子，没轰炸时这个池不花钱。
 */
export const BOMB_BLAST_VFX = Object.freeze({
  poolCapacity: Object.freeze({ low: 520, medium: 900, high: 1400, ultra: 1600 }),
  /** 专用池的烟团从寿命的 fadeOutStart 起淡出（战斗烟池是 0.45；抛射土团要飞完大半程才看得出弧线）。 */
  fadeOutStart: 0.62,
  /** 抛射土柱：条数 = streamerBase + streamerPerCube·∛W；每条沿弧线拖 trailPuffs 团土，铺满飞行时间的 trailSpan。 */
  streamerBase: 3.5, streamerPerCube: 1.4, trailPuffs: 4, trailSpan: 0.85,
  /** 抛射土柱的仰角范围（度）：倒锥形的抛射幕。偏向弹着方向的程度（斜着砸进去，下游抛得多）。 */
  elevationDeg: Object.freeze([50, 80]), downrangeBias: 0.3,
  /**
   * 以下尺寸都是半宽（米），按 ∛W / 2.8 缩放（50 kg 级为 1）。
   * 细小抛射头和稀薄尾迹表现弹道；爆炸主体的体量由三维土尘承担。
   *   clodM        抛射土柱的头（一团暗土，沿弹道飞到落地），clodDrag 是它的线性阻尼（1/s，重土块几乎不减速）
   *   trailSizeM   尾巴那几团出生时 / 散开后的半宽，trailOpacity 起始不透明度
   */
  clodM: Object.freeze([0.15, 0.35]), clodDrag: 0.18,
  trailSizeM: Object.freeze([0.45, 2.1]), trailOpacity: 0.34,
  /** 久留烟体：一份冷却爆炸体积，持续二三十秒；保留原尺度和延迟形成阶段。 */
  capLifeS: Object.freeze([22, 32]), capSizeM: Object.freeze([18, 26]),
  capVolume: Object.freeze({boundsScale:Object.freeze([1.5,1,1.8]),density:1.8,delay:1,fadeIn:1.2,wind:0.7,rise:0.25}),
  /** 冷却烟体的起点相对抛射顶高。 */
  capHeightU: Object.freeze([0.35, 0.95]),
});
