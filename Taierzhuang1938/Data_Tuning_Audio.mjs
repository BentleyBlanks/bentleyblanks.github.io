// Data_Tuning_Audio.mjs — 音频**接线层**的距离、限频与配平数。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_AudioWiring.mjs`。
//
// **不在这张表里的**：
//   · 每个 cue 自己的配方、混音、混响 send、节点开销 → `Script_Audio.mjs` 的
//     RECIPES / MIX_GAIN / SAMPLE_MIX / SAMPLE_WET / NODE_COST（那是「这个声音本身
//     长什么样」，与「什么时候播它」是两件事，改一边不该动另一边）；
//   · 距离剔除、去重窗、节点预算 → 同样在 Script_Audio.mjs（它们是**听者**的账，
//     所有调用方共用一份）；
//   · 爆炸伤害半径、压制半径、手榴弹引信 → `Data_Tuning_Combat.mjs` / `Data_Battle.mjs`。
//
// 口径与取证入口写在 docs/Data_AudioWiring.md。

/**
 * 宿主探针（遮挡 / 空间档）。
 *
 * 每帧对每个声源打一条射线是**买不起**的：满场三四十个兵，一帧就是几十条。
 * 所以按 1 m 网格 + 0.5 s 有效期缓存 —— 玩家 0.5 s 走不出 3 m，听者与声源
 * 同处一格时遮挡关系不会翻转；真翻转的那一刻（拐过墙角）最多晚半秒到，
 * 而半秒的滞后在听感上远好过掉帧。
 */
export const PROBE = Object.freeze({
  gridM: 1.0,
  ttlS: 0.5,
  maxEntries: 512,          // 缓存条目上限，超了整表清空（比 LRU 便宜，且半秒后本来就全过期）

  /**
   * 【2026-09-09】声源抬高。**这一条是「爆炸没声音」的病根。**
   *
   * 宿主交给探针的坐标是事件的**几何原点**：迫击炮弹的爆心是 `GroundHeight()`
   * 本身（Script_Combat 那两行 `at.y = GroundHeight(...)`），兵的 position 是脚底。
   * 于是从听者眼睛（1.6 m）打到那个点的射线在整条路上都**贴着地皮走** ——
   * 六十米的射线全程只降 1.6 m，任何 30 cm 的路基、田埂、柴垛都拦得住它。
   *
   * 实测（phase=1，72 个采样点 × 6 档距离）：终点贴地时 29/72 判成挡住，
   * 把终点抬到 +2.0 m 只剩 18/72 —— 那 11 条全部是掠过 `embankment`（0.3—0.7 m 厚
   * 的路基板）与 `villageStraw` 的假阳性，**一条都不是真的墙**，也一条都不是地形
   *（撞到的全是碰撞盒）。
   *
   * 物理上也该抬：一次爆炸的发声体是几米高的火球与冲击波前，不是地面上那个点；
   * 一个人的嘴在 1.5 m 高，不在鞋底。1.2 m 是「胸口 / 火球下沿」这一档。
   */
  sourceRiseM: 1.2,
  /**
   * 第二条射线的抬高。第一条挡住时再问一次「从这个高度还挡得住吗」：
   * 挡不住 = 中间那东西是矮的（路基、院墙下段、柴垛），声音绕得过去，
   * 只算 partialOcc；两条都挡住才是一堵真墙。
   * 2.6 m ≈ 鲁南民房的檐口高度：比这矮的都不该把一声爆炸压成闷响。
   */
  clearRiseM: 2.6,
  /** 只被矮东西挡住时的遮挡度。0.45 折 −5.4 dB 干声 + 低通压到 4.7 kHz。 */
  partialOcc: 0.45,

  // 空间档：先向上打一条，撞到屋顶/楼板就是 interior。
  ceilingProbeM: 6.0,
  /**
   * 【2026-09-09】屋顶的**最低净空**。原来只要「头顶有块 2.5 m 见方的东西」就算屋顶，
   * 于是站在路基上（`embankment`，实测 9.3 × 15.2 m 的板、只有 0.34 m 厚）
   * 被判成在屋里：40 个开阔地采样点里贴地那一档 **12 个判成 interior**，
   * 抬到 1.35 m 只剩 4 个。后果是混响换成室内 IR，而且听者在 open、声源在 interior
   * 会触发 ZONE_BOUNDARY_OCC（−4.2 dB + 6.5 kHz 低通）——「人物讲话发闷发虚」就是它。
   * 屋顶总在头顶上方两米开外；贴着脚背的那块板是地面，不是天花板。
   */
  ceilingMinClearM: 2.0,
  // 否则数 6 m 内的立面。三面以上围着 = 院子，一两面 = 街巷，一面没有 = 开阔地。
  wallRadiusM: 6.0,
  wallMinHeightM: 1.2,      // 比这矮的东西挡不住声音（矮墙、田埂、柴垛）
  courtyardWalls: 3,
  streetWalls: 1,
});

/**
 * 逐弹弹啸（超音速弹头掠过听者）。
 *
 * 步枪与机枪弹初速 700—800 m/s，全部超音速：掠过耳边的是**弹头自己的锥形激波**，
 * 它比枪声先到，而且方向来自弹道不是来自枪口。这条是「有人在打我」与
 * 「远处在打仗」之间最强的一条区分线索，也是唯一按每一发结算的音。
 *
 * 限速是必须的：一挺机枪一梭子四发全落在近失半径里，四条 crack 叠在同一帧上
 * 只会得到削顶的噪声，而且吃掉半个节点预算。
 */
export const NEAR_MISS = Object.freeze({
  perFrame: 2,
  perWindow: 3,
  windowS: 0.1,
  whizzWithinM: 1.5,        // 比这更近再叠一条低沉的「咻」——擦着头皮过去的那一档
  // AI 打偏那一发的近失半径。与 `Data_Battle.COMBAT.suppressRadius`（2.6 m）**故意同值**：
  // 「听得见的近失」与「压得住的近失」本来就该是同一件事，两个数分开会让
  // 「明明被压制了却什么都没听见」这类穿帮回来。改一个要同时改另一个。
  crackWithinM: 2.6,
  crackVolume: 0.85,
  whizzVolume: 0.55,
});

/** 跳弹：打在硬面上有四分之一的概率削飞出去。软面（土、沙包、肉、木）不跳。 */
export const RICOCHET = Object.freeze({
  chance: 0.25,
  surfaces: Object.freeze(["brick", "stone", "metal"]),
  volume: 0.5,
  delayS: 0.02,             // 弹着之后一点点，两声要分得开
});

/**
 * AI 的手上动作声。全都是**低优先级**：预算紧张时先丢它们 ——
 * 丢一记别人的拉栓没人发现，丢一发枪声就穿帮。
 */
export const AI_FOLEY = Object.freeze({
  boltWithinM: 25,          // 再远听不见手上那点动静
  boltDelayS: 0.55,         // 枪响之后手真的去够枪机的时间（与玩家那条同一口径）
  boltVolume: 0.34,
  reloadWithinM: 30,
  reloadVolume: 0.5,
  stepWithinM: 30,
  stepStrideM: 1.9,         // 与玩家站姿同一步距
  stepMinIntervalS: 0.28,   // 每个兵自己的限频；跑起来也不许比这更密
  stepVolume: 0.3,
});

/** 玩家脚步：姿态与冲刺各自的音量与步距。dB 换算成倍率写在注释里。 */
export const PLAYER_STEP = Object.freeze({
  baseVolume: 0.45,
  crouchGain: 0.50,         // −6 dB
  proneGain: 0.32,          // −10 dB
  sprintGain: 1.26,         // +2 dB
  fastCrawlGain: 1.8,       // 快速匍匐那条「更快也更响」的取舍
  strideM: 1.9,
  crouchStrideM: 1.55,      // 蹲着步子迈不开
  proneStrideM: 1.0,
  // 冲刺步距**变短**（不是变长）：跑起来是小步高频，步距还按 2.4 m 算的话
  // 听感是「跑得越快脚步越稀」，正好反了。
  sprintStrideM: 1.5,
  sprintPitch: 1.06,
});

/** 身体 foley：姿态、翻越、装具、喘息、落地。 */
export const BODY_FOLEY = Object.freeze({
  stanceVolume: 0.42,       // 起身/趴下时的布料声
  vaultVolume: 0.6,
  gearIntervalS: 0.9,       // 冲刺中装具晃动的间隔
  gearVolume: 0.38,
  // 喘息：冲刺满三秒、或血量掉到 35% 以下开始，非空间化（那是自己的肺）。
  breathAfterSprintS: 3.0,
  breathHealthFrac: 0.35,
  breathLoopS: 2.4,         // 一条 breathHeavy 的时长，到点续一条
  breathVolume: 0.5,
  breathReleaseS: 1.2,      // 停下之后还喘这么久
  landMinImpact: 0.25,      // 比这轻的落地只有靴底那一下，不叠身体
  landVolume: 0.55,
});

/**
 * 手榴弹落地与滚动。
 *
 * 木柄弹在砖地上是**弹两下再滚**的，而这一层原来一声都没有 —— 玩家看得见弹在滚，
 * 听不见它在哪儿，于是「有一枚落在我脚边」这件事只能靠眼睛。
 */
export const GRENADE_FOLEY = Object.freeze({
  bounceMinSpeedMps: 1.6,   // 比这慢的接触算「贴地」，不算弹跳
  bounceIntervalS: 0.12,    // 同一枚弹两记弹跳之间的最短间隔（刚体在角落会连续接触）
  bounceVolume: 0.55,
  rollMinSpeedMps: 0.35,    // 还在动
  rollAfterS: 0.18,         // 连续低速接触这么久才算「滚起来了」
  rollVolume: 0.4,
  maxAudibleM: 45,
});

/**
 * 爆炸：三档 + 碎屑 + 耳鸣。
 *
 * 原来只有近/远两条录音、以 60 m 分界。40—120 m 这一段既不是「炸在身边」
 * 也不是「城外落弹」：它是**这条街那头**，有冲击没有碎片声、尾巴还带方位。
 */
export const BLAST_AUDIO = Object.freeze({
  nearM: 40,
  midM: 120,
  // 遮挡：隔着一堵墙的爆炸仍然听得见（低频绕射），但高频全没了。
  occludedGain: 0.5,
  occludedAirCutHz: 900,
  // 落屑：近炸之后半秒到一秒，砖屑与瓦片才落回地面。
  debrisWithinM: 40,
  debrisDelayMinS: 0.4,
  debrisDelayMaxS: 1.2,
  debrisCountMin: 2,
  debrisCountMax: 3,
  debrisRadiusMinM: 3,
  debrisRadiusMaxM: 8,
  debrisVolume: 0.45,
  // 耳鸣：十二米内那一发。引擎侧接上 Play 自动触发之后这条只是兜底。
  deafenWithinM: 12,
  deafenS: 0.45,
  // 开枪压环境：一枪之后 0.3 s 内环境床让出一半，枪声才「炸得开」。
  gunDuckS: 0.3,
  gunDuckAmount: 0.5,
});

/**
 * 火焰点声源。烧着的房子是**一直在响**的东西，与一次性事件是两套账：
 * 同时最多四条（最近的优先），再多就是一片糊的噪声床，而且吃满节点预算。
 */
export const FIRE_SPOT = Object.freeze({
  maxVoices: 4,
  audibleM: 55,
  loopS: 1.9,               // 一条 fireSpot 的续接周期（配方 2.2 s，留 0.3 s 交叠）
  volume: 0.55,
  minFire: 0.2,             // vfx 烟源的 fire 强度低于此当作只冒烟不着火
  rescanS: 0.5,             // 重新挑「最近四个」的间隔；每帧挑是白花的
});
