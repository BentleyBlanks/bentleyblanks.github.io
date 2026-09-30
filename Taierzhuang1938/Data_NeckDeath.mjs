// 敌军「喉咙里那一声」的数值表（纯数据，零 three）。规则在 Script_NeckDeath.mjs，口径见 docs/Data_NeckDeath.md。
//
// 什么时候放：日军被**刀砍/刺死**，或被子弹**打中脖子**致死，并且死在玩家近处，再按概率抽一下 ——
// 不是每个都有，「部分敌军」。放的时候顶替他倒下时原本那一声日语痛呼（喉咙被割开的人喊不出词）。

export const NECK_DEATH = Object.freeze({
  /** 只有这一方的兵会发这一声（玩家的对手）。 */
  side: "ija",
  /** 离玩家多近才放（米）。远处死人的喉音听不见，也不该抢近处的声音。 */
  nearM: 14,
  /** 逐类的概率。脖子中弹是「明确打在喉咙上」，比一般的刀伤更该有。 */
  chance: Object.freeze({ neckShot: 0.6, blade: 0.45 }),
  /** 算「刀」的击杀类型：大刀砍、刺刀刺/挥砍。枪托砸（butt）不算，那不伤喉咙。 */
  bladeKinds: Object.freeze(["blade", "slash", "cut", "thrust", "stab"]),
  /** 算「枪」的击杀类型（要带命中体 id 才判得出打在哪儿）。 */
  bulletKinds: Object.freeze(["bullet", "hmg"]),
  /**
   * 脖子的几何：
   * · upperTorso 胶囊（胸→颈两根骨头）从胸端往颈端走到这个比例以上，算打在脖子根上；
   * · head 球心以下这个比例的半径之外（下巴/喉结那一圈）也算。
   */
  neck: Object.freeze({ torsoFromT: 0.72, headBelowFraction: 0.55 }),
  /** 两次喉音之间至少隔多久（秒，导演时钟）。一梭子机枪扫倒一排人不该同时「咯」一片。 */
  minGapS: 0.9,
  /** 播放音量（SAMPLE_MIX 里另有一档采样混音）。 */
  volume: 0.9,
});
