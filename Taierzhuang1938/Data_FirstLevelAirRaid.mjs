// Data_FirstLevelAirRaid.mjs — 第一关 01–06 中远处的日机轮番轰炸（2026-09-26；2026-09-28 物理化 + 中队规模）。
//
// 用户要求：「从日军先头兵开始，中远处安排多轮次的飞机炸弹轰炸，增加战场氛围」（09-26）；
// 「给飞机的轰炸做得更基于物理、场面更宏大一点」（09-28）。
// 起点 = 01 的 FrontPass 相位（先头兵沿交通壕经过洞口，Data_OpeningStoryboards.phases.Trapped）；
// 02 以后的步骤（阶段跳转 / 检查点直接进来）一律算已经开始。终点 = 06 Orders 结束，07 以后不起新的一轮。
//
// **纯氛围层**：不伤人、不改地形、不进压制账与 TTK、不记任务事实。炸点离听者、离任何活人与战车
// 都有下限（按弹型，Data_AerialBombs；运行时逐发查）。导演在 Script_FirstLevelAirRaid（纯规则），
// 挂在 Script_FirstLevelMissionBattleSound 下与前线床、场外炮击共用一本声部账
//（MISSION_BATTLE_SOUND.front.sharedMaxVoices）；飞机与炸弹的画面在 Script_Aircraft 的编队克隆层，
// 落地画面在 Script_Vfx.BombBlast。
//
// 09-28 物理化：炸弹带着飞机的速度离机，外弹道按二次空气阻力积分（Script_BombBallistics）；
// 投弹手按这条航迹的「前冲距离」提前投弹，落点是积出来的；落地尺度按装药立方根缩放；
// 投完弹飞机变轻上浮几米，再压坡度协调转弯离场（转弯半径 v²/(g·tanφ)）。
//
// 坐标是世界系（X 东、Z 南、米）。落区都在 P012 外圈地面（Data_FirstLevelP012Horizon）上，
// 避开外圈的土丘体块（炸点落进土丘里只剩一根烟柱）。日机从北、东北（日军一侧）进场，
// 炸的是我方两翼阵地与后方 —— 一轮一个落区、一条直线航路、每架一串炸弹。

/** 编队：机型（Data_AircraftAssets 的 id）、高度、速度、载弹、队形（side 右正、back 向后、up 向上，米）。 */
const V_SHAPE = Object.freeze([
  Object.freeze({ side: 0, back: 0, up: 0 }),
  Object.freeze({ side: -38, back: 30, up: 6 }),
  Object.freeze({ side: 38, back: 34, up: -5 }),
]);
const PAIR = Object.freeze([
  Object.freeze({ side: 0, back: 0, up: 0 }),
  Object.freeze({ side: 32, back: 24, up: 4 }),
]);
/** 一个三机楔形整体挪到 (side, back, up)：拼中队队形用。 */
function Vic(side, back, up) {
  return V_SHAPE.map((s) => Object.freeze({ side: s.side + side, back: s.back + back, up: s.up + up }));
}
// 九机「品」字（中队基本队形）：长机楔形在前，左右两个楔形各退后七八十米、一高一低错开尾流。
const VIC_OF_VICS = Object.freeze([...V_SHAPE, ...Vic(-104, 74, 14), ...Vic(104, 80, -9)]);
// 六机两个楔形梯次：后一个楔形在左后、高一些（重轰拉得更开）。
const TWO_VICS = Object.freeze([...V_SHAPE, ...Vic(-92, 104, 18)]);

export const FIRST_LEVEL_AIR_RAID = Object.freeze({
  version: "20260928-airRaidPhysics",
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
  /**
   * 过顶：有 chance 的机会把航向对准「听者 → 瞄准点」，让编队从头顶偏 missM 以内压过去 ——
   * 只在这样飞仍是从北边来（航向与正南的夹角不超过 maxFromNorthDeg，日军一侧）时才这么做，
   * 实际上就是瞄后方两块落区的那几轮。投弹点在瞄准点前六七百米，炸弹是从头顶往前飞着落下去的。
   */
  overhead: Object.freeze({ chance: 0.5, maxFromNorthDeg: 65, missM: 90 }),
  /**
   * 编队。载弹 load = { bomb（Data_AerialBombs 的 id）, count（每架一串几颗） }；
   *   intervalS   一串里相邻两颗的投放间隔（地面上 ≈ intervalS·speed 米一颗）
   *   dropLagS    僚机跟长机投弹的反应迟差 [最小, 最大]（看见长机投弹才按电门）
   *   balloonM    投完弹变轻、上浮多少米（按载弹占全重的比例估），balloonS 是它的时间常数
   *   bankDeg     离场转弯的坡度（协调转弯：转弯角速度 = g·tanφ / v）
   *   droneGain   引擎声的音量倍率（一条声部代表整队；机多、声厚）
   */
  formations: Object.freeze({
    // 九七式轻轰（Ki-30）三机楔形：正常载弹 300 kg，六颗 50 kg 级。
    lightVic: Object.freeze({ aircraft: "MitsubishiKi30", altitudeM: 230, speedMps: 88,
      load: Object.freeze({ bomb: "Bomb50kg", count: 6 }), slots: V_SHAPE,
      intervalS: 0.26, dropLagS: Object.freeze([0.12, 0.45]), balloonM: 3.5, balloonS: 1.8, bankDeg: 24, droneGain: 1 }),
    // 九七式重轰（Ki-21）六机两个楔形：每架三颗 250 kg 级，高、慢、一串拉得开。
    heavySquadron: Object.freeze({ aircraft: "MitsubishiKi21Ia", altitudeM: 380, speedMps: 82,
      load: Object.freeze({ bomb: "Bomb250kg", count: 3 }), slots: TWO_VICS,
      intervalS: 0.5, dropLagS: Object.freeze([0.15, 0.5]), balloonM: 5, balloonS: 2.4, bankDeg: 20, droneGain: 1.3 }),
    // Ki-30 双机：低一点、快一点。
    lightPair: Object.freeze({ aircraft: "MitsubishiKi30", altitudeM: 200, speedMps: 92,
      load: Object.freeze({ bomb: "Bomb50kg", count: 6 }), slots: PAIR,
      intervalS: 0.26, dropLagS: Object.freeze([0.12, 0.4]), balloonM: 3.5, balloonS: 1.8, bankDeg: 26, droneGain: 0.9 }),
    // Ki-30 九机「品」字：远程出击每架只挂四颗，整队铺出一片。
    lightSquadron: Object.freeze({ aircraft: "MitsubishiKi30", altitudeM: 260, speedMps: 90,
      load: Object.freeze({ bomb: "Bomb50kg", count: 4 }), slots: VIC_OF_VICS,
      intervalS: 0.24, dropLagS: Object.freeze([0.12, 0.5]), balloonM: 2.5, balloonS: 1.8, bankDeg: 22, droneGain: 1.4 }),
  }),
  /** 轮换顺序（循环）：小队与中队交替，一分多钟一轮。 */
  order: Object.freeze(["lightVic", "heavySquadron", "lightPair", "lightSquadron", "heavySquadron", "lightVic"]),
  /**
   * 落区：矩形 + 日机的来向（from：从落区指向飞机来的方向，单位向量，北 = (0, −1)）。
   * 按 01–06 玩家活动范围（x −40…70、z −220…−30）量过：每块中心离那一片 200–300 m。
   * 矩形只管瞄准点（落区中心）；中队一片落弹铺得比矩形大，每一颗另查避人、离听者与土丘。
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
  /** 炸点离外圈土丘体块至少多远（米，按体块外沿算）。 */
  hillClearM: 4,
  /** 挑落区最多试几次，挑不到这一轮推后 retryS 秒（中队一片铺得大，要多试几次）。 */
  pickTries: 24,
  retryS: 4,
  /**
   * 投弹：弹从机腹弹舱（机身中心下 bayDropM 米）离开，带飞机的速度 + 向下 ejectMps 的弹射速度；
   * 外弹道按 Data_AerialBombs 的弹体积分。dispersionM：一颗弹落地时相对理想航迹的散布（米，横 / 纵，
   * 来自离机扰动与尾翼公差），按 (t/T)² 从零长起。
   */
  bomb: Object.freeze({ bayDropM: 1.4, ejectMps: 0.8, dispersionM: Object.freeze([5, 7]),
    // 画面上的炸弹：真实尺寸；远到不足 minAngularRad（约 1.5 个像素宽）时按距离放大补上，最多 maxScale 倍。
    minAngularRad: 0.0026, maxScale: 4.5 }),
  /**
   * 落地画面（Script_Vfx.BombBlast，尺度全按装药立方根，Data_AerialBombs）。
   *   detailBombs  一轮落得多于这么多颗时按比例摊薄每颗的烟团（专用池一轮装得下）
   *   maxColumns   一轮最多几根常驻土柱烟源（每架那一串的头一颗给一根；烟源池在低画质只有六十来格）
   *   column       那根土柱（SmokeSource）的参数，按 ∛W / columnRefCube 放大
   */
  impact: Object.freeze({ detailBombs: 14, maxColumns: 6, columnRefCube: 2.8,
    column: Object.freeze({ emitS: 2.2, rate: 5, radius: 6, rise: 6.5, sizeStart: 7, sizeEnd: 30, life: 11, opacity: 0.62 }) }),
  /**
   * 声音。爆炸走 soundField（参考距离 64 m、1000 m 内不剔除），引擎按距离自动延迟 d/340；
   * 一串十几颗只给其中几颗出声（相邻两声至少隔 minGapS），滚成一片闷雷。
   * 音量按装药 (W / chargeRefKg)^(1/6) 放大、封顶 volumeMaxGain（250 kg 级约大 1.3 倍）。
   * 低频层：一轮的第一颗再叠一条压到 thumpAirCutHz 以下的远爆（胸口那一下）；每架一条太挤，声部让给爆炸本体。
   * 引擎声：整轮一条合成持续音挂在长机上，逐帧搬位置 + 多普勒（与扫射航线同一条 cue）。
   */
  audio: Object.freeze({
    cue: "explosionFar", volume: 1.5, minGapS: 0.4, chargeRefKg: 22, volumeMaxGain: 1.35,
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
   * 震屏：往创伤桶里加（与场外炮击同一条路，BATTLE_ARTILLERY 的头注）。强弱按**比例距离** Z = d / ∛W
   * 在 zNear–zFar 之间线性插值（50 kg 级在 170 m / 470 m 上与旧版 0.22 / 0.08 一致；250 kg 级同样距离上重一截）。
   * 两记：先是地震波（d / groundWaveMps，seismicFraction 那么重），再是跟着声音到的气浪（d / 340）。
   * 一串十几颗连着到，windowS 秒里合计不超过 windowMax（幅度 = 创伤²）。
   */
  shake: Object.freeze({ zNear: 61, zFar: 168, traumaNear: 0.22, traumaFar: 0.08, dugoutScale: 1.35,
    seismicFraction: 0.35, windowS: 1.2, windowMax: 0.34 }),
});
