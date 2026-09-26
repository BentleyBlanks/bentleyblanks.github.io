// Data_FirstLevelAirRaid.mjs — 第一关 01–06 中远处的日机轮番轰炸（2026-09-26）。
//
// 用户要求：「从日军先头兵开始，中远处安排多轮次的飞机炸弹轰炸，增加战场氛围」。
// 起点 = 01 的 FrontPass 相位（先头兵沿交通壕经过洞口，Data_OpeningStoryboards.phases.Trapped）；
// 02 以后的步骤（阶段跳转 / 检查点直接进来）一律算已经开始。终点 = 06 Orders 结束，07 以后不起新的一轮。
//
// **纯氛围层**：不伤人、不改地形、不进压制账与 TTK、不记任务事实。炸点离听者 minM–maxM、
// 离任何活人与战车 bombClearM 以外（运行时逐发查）。导演在 Script_FirstLevelAirRaid（纯规则），
// 挂在 Script_FirstLevelMissionBattleSound 下与前线床、场外炮击共用一本声部账
//（MISSION_BATTLE_SOUND.front.sharedMaxVoices）；飞机与炸弹的画面在 Script_Aircraft 的编队克隆层。
//
// 坐标是世界系（X 东、Z 南、米）。落区都在 P012 外圈地面（Data_FirstLevelP012Horizon）上，
// 避开外圈的土丘体块（炸点落进土丘里只剩一根烟柱）。日机从北、东北（日军一侧）进场，
// 炸的是我方两翼阵地与后方 —— 一轮一个落区、一条直线航路、每架一串炸弹。

/** 编队：机型（Data_AircraftAssets 的 id）、高度、速度、每架几颗、队形（side 右正、back 向后、up 向上，米）。 */
const V_SHAPE = Object.freeze([
  Object.freeze({ side: 0, back: 0, up: 0 }),
  Object.freeze({ side: -38, back: 30, up: 6 }),
  Object.freeze({ side: 38, back: 34, up: -5 }),
]);
const PAIR = Object.freeze([
  Object.freeze({ side: 0, back: 0, up: 0 }),
  Object.freeze({ side: 32, back: 24, up: 4 }),
]);

export const FIRST_LEVEL_AIR_RAID = Object.freeze({
  version: "20260926-airRaid",
  /** 从哪一刻起：Trapped 这一步要等导演走到这个相位；其余步骤进来就算开始。 */
  start: Object.freeze({ stage: "Trapped", phase: "FrontPass" }),
  /**
   * 哪几步起新的一轮，及各步的附加口径：
   *   airCut        这一步每一声再压一道高频（01 整段躺在洞里，隔着土只剩闷响）；
   *   listenerZone  这一步听者一定在哪个空间档（洞里震得重、洞顶掉土）；
   *   holdS         进这一步后多少秒内不起新的一轮（03 开头有两架日机横飞，Data_OpeningSet0103.FLYOVER）。
   */
  stages: Object.freeze({
    Trapped: Object.freeze({ airCut: 700, listenerZone: "dugout" }),
    BunkerRescue: Object.freeze({}),
    RearTrench: Object.freeze({}),
    Support: Object.freeze({ holdS: 38 }),
    MachineGun: Object.freeze({}),
    Tank: Object.freeze({}),
    Orders: Object.freeze({}),
  }),
  /** 开始之后第一轮多久进场（进场到落弹另有 approachM / speed 秒，约二十多秒）。 */
  firstAfterS: 3,
  /** 上一轮飞机离场之后隔多久起下一轮（秒，[最小, 最大]）。一轮从进场到离场约四十五秒。 */
  gapS: Object.freeze([14, 32]),
  /** 到点时正有对白：往后推，每次 speechStepS，累计最多 speechDeferS 秒就不再等。 */
  speechDeferS: 8,
  speechStepS: 1,
  /** 航路：落区中心前 approachM 米进场、过落区后 exitM 米离场。 */
  approachM: 2000,
  exitM: 1700,
  /** 航向在落区给的来向上左右随机偏多少度。 */
  headingJitterDeg: 22,
  formations: Object.freeze({
    // 九七式轻轰（Ki-30）三机楔形：华北战场近距支援轰炸的主力。
    lightVic: Object.freeze({ aircraft: "MitsubishiKi30", altitudeM: 230, speedMps: 88, bombs: 4, slots: V_SHAPE }),
    // 九七式重轰（Ki-21）三机楔形：高一些、慢一些、每架一串更长。
    heavyVic: Object.freeze({ aircraft: "MitsubishiKi21Ia", altitudeM: 320, speedMps: 80, bombs: 6, slots: V_SHAPE }),
    lightPair: Object.freeze({ aircraft: "MitsubishiKi30", altitudeM: 200, speedMps: 92, bombs: 4, slots: PAIR }),
  }),
  /** 轮换顺序（循环）。 */
  order: Object.freeze(["lightVic", "heavyVic", "lightPair", "lightVic", "heavyVic", "lightPair"]),
  /**
   * 落区：矩形 + 日机的来向（from：从落区指向飞机来的方向，单位向量，北 = (0, −1)）。
   * 按 01–06 玩家活动范围（x −40…70、z −220…−30）量过：每块中心离那一片 200–300 m。
   */
  zones: Object.freeze([
    // 西翼阵地：土坎西端再往西，外圈 WestNorth 土丘（z ≤ −242）以南。
    Object.freeze({ id: "WestLine", xMin: -250, xMax: -150, zMin: -235, zMax: -140, from: Object.freeze({ x: 0.2, z: -1 }) }),
    // 东翼阵地：日军突破的东头再往东，EastNorth 土丘（x ≥ 364）以西。
    Object.freeze({ id: "EastLine", xMin: 190, xMax: 340, zMin: -250, zMax: -110, from: Object.freeze({ x: 0.45, z: -1 }) }),
    // 东南后方：村子东边的田与东庄（East 农舍 z ≥ 86 以北）。
    Object.freeze({ id: "EastRear", xMin: 170, xMax: 320, zMin: -60, zMax: 50, from: Object.freeze({ x: 0.6, z: -1 }) }),
    // 西南后方：西庄（West 农舍 −218, 38）一带，WestMiddle 土丘（z ≤ −63）以南。
    Object.freeze({ id: "WestRear", xMin: -290, xMax: -160, zMin: -30, zMax: 110, from: Object.freeze({ x: -0.15, z: -1 }) }),
  ]),
  /** 落区中心离听者的距离（中远处）。 */
  minM: 170,
  maxM: 470,
  /** 每一颗炸点离活人、战车至少多远（米）。 */
  bombClearM: 28,
  /** 挑落区最多试几次，挑不到这一轮推后 retryS 秒。 */
  pickTries: 12,
  retryS: 4,
  /**
   * 投弹：每架一串，相邻两颗间隔 intervalS；炸弹带着飞机的前进速度下落（落地时正在机腹下方），
   * 只是比飞机落后 trailM 米（空气阻力）。g 用 9.8。
   */
  bomb: Object.freeze({ intervalS: 0.34, trailM: 45, gravity: 9.8, jitterM: 6,
    // 画面上的炸弹：三百米外一颗 1 m 长的炸弹不到一个像素，放大到 visualScale 倍才看得出一串黑点往下掉。
    lengthM: 1.1, radiusM: 0.17, visualScale: 2.6 }),
  /**
   * 落地画面：vfx.Explosion 的半径（远一些略放大，封顶）+ 土柱。
   * 土柱每 columnEvery 颗给一根（一串挨得近，相邻两根本来就连成一片）：烟源粒子池在低画质只有六十来格
   *（Script_Vfx POOL_SHARE.sourceSmoke），一颗一根会把别处的烟挤掉。2026-09-26 实拍（04，300 m 外）：
   * 旧的 1.6 s × 6 / 8 s 只剩一道二十米高的淡黄土，改成更粗、更高、活得更久的一根。
   */
  impact: Object.freeze({ radiusM: 12, radiusPerM: 0.012, radiusFromM: 200, radiusMaxM: 15, columnEvery: 2,
    column: Object.freeze({ emitS: 2.2, rate: 5, radius: 6, rise: 6.5, sizeStart: 7, sizeEnd: 30, life: 11, opacity: 0.62 }) }),
  /**
   * 声音。爆炸走 soundField（参考距离 64 m、1000 m 内不剔除），引擎按距离自动延迟 d/340；
   * 一串十几颗只给其中几颗出声（相邻两声至少隔 minGapS），滚成一片闷雷。
   * 低频层：一轮的第一颗再叠一条压到 thumpAirCutHz 以下的远爆（胸口那一下）；每架一条太挤，声部让给爆炸本体。
   * 引擎声：整轮一条合成持续音挂在长机上，逐帧搬位置 + 多普勒（与扫射航线同一条 cue）。
   */
  audio: Object.freeze({
    cue: "explosionFar", volume: 1.5, minGapS: 0.4,
    thumpCue: "explosionFar", thumpVolume: 1.1, thumpAirCutHz: 320, thumpDelayS: 0.03,
    droneCue: "planeDrone", droneVolume: 1.0, droneSizeM: 70, droneStopFadeS: 1.5, droneRetryS: 0.5,
    /** 长机离听者多近才起引擎声（米）：1400 m 上约 −25 dB，之后一路涨到头顶。 */
    droneStartM: 1400,
    /** 对白播放时炸弹声的倍率（电平再交给对白侧链；这里只压一道）。 */
    speechGain: 0.6,
    /** 本层同时在响的声部上限（引擎声也算一条）；与前线、场外炮击合计另有 sharedMaxVoices。 */
    maxVoices: 5,
    /**
     * 落弹留位：第一颗落地前 reserveLeadS 秒起、到最后一颗落地后 reserveTailS 秒，在共享账里按 reserveVoices 条占着
     *（低频层 + 三声爆炸），前线床这几秒不起新声（它的声部 2.6 s 里自己走完），一串落地时有位置响。
     */
    reserveVoices: 4, reserveLeadS: 3, reserveTailS: 0.5,
    /**
     * 长机头一颗的爆炸与低频层走引擎的 priority（预算闸偷不到就超额照播，约 18 个节点、一轮一次）。
     * 其余几声有位才响。04 激战时节点账面 100–125 / 120，不保这两条一轮就一声不响（2026-09-26 实机取证）。
     */
    leadPriority: true,
    /** 一条爆炸声部「还在响」算多久（秒）：本体长度，不含混响尾巴。 */
    voiceActiveS: 2.6,
    /** 听者在洞里 / 沟里：离得不远的那一串之后，耳边掉一阵土（每架一串最多一次）。 */
    dirtWithinM: 300, dirtDelayS: Object.freeze([0.3, 0.8]), debrisActiveS: 2.2,
    dugoutDirtVolume: 0.26, dugoutDirtAirCutHz: 2600, trenchDirtVolume: 0.14, trenchDirtAirCutHz: 1900,
  }),
  /**
   * 震屏：跟着声音到的一记轻震，直接往创伤桶里加（与场外炮击同一条路，BATTLE_ARTILLERY 的头注）。
   * near–far 之间线性插值；一串十几颗连着到，windowS 秒里合计不超过 windowMax（幅度 = 创伤²）。
   */
  shake: Object.freeze({ nearM: 170, farM: 470, traumaNear: 0.22, traumaFar: 0.08, dugoutScale: 1.35,
    windowS: 1.2, windowMax: 0.34 }),
});
