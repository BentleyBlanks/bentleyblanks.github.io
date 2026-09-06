// Data_Flares.mjs — 照明弹的音效档案、默认值与两条预设。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。导演在 `Script_Flare.mjs`。
// 玩家可见的名字存**文本键**，句子在 Data_Text_Gameplay 的 `gameplay.flare.*`。

/**
 * 音效档案。每条两个名字：**先播 A2 批那条实录，播不响就退到现有最近的源**。
 *   flareLaunch ← launcherPop   掷弹筒那一记闷推力；照明弹也是从发射筒打上去的
 *   flareIgnite ← grenadeThrow  短促的一记气流「噗」（不是爆音，所以不拿 launcherPop 顶两遍）
 *   flareBurn   ← （无）        **没有可循环的合成嘶声，宁可没有**：
 *                               拿别的音顶一条持续声，听感上是「场里多了一台机器」
 *   flareOut    ← （无）        同上：熄灭是那条素材末尾真的烧完的两秒多，造不出来
 *
 * `loopEveryS` 是燃烧嘶声的重触发间隔：Script_Audio 的 `Play` 没有 loop 语义
 * （见它的 RECIPES 头注），所以按素材自己的长度重触发。素材接线以后这个数
 * 应当等于 `Data_SfxSources` 里那一段的 tail（6.00 s）减去一点点重叠。
 */
export const FLARE_SFX = Object.freeze({
  launch: { names: ["flareLaunch", "launcherPop"], volume: 0.92 },
  ignite: { names: ["flareIgnite", "grenadeThrow"], volume: 0.85 },
  burn: { names: ["flareBurn"], volume: 0.55, loopEveryS: 5.6 },
  out: { names: ["flareOut"], volume: 0.6 },
});

/**
 * 默认值。数值只在这里；文档写常量名不抄数（AGENTS 硬规矩 12）。
 *
 * ascendS      升空时长。**2.6 s 是照着素材定的**：`flareLaunch` 那一刀留了 2.60 s
 *              的上升尾巴（Data_SfxSources 的 FlareLaunch 头注），啸声正好停在顶空。
 * apexM        顶空高度（离发射点地面）。真物件在两三百米上，这里压到几十米 ——
 *              巷战里要的是「这条巷子亮了」，不是「全城亮了」；也让点光的照度算得住。
 * igniteS      点燃冲头：从零到满 0.35 s。再慢一点就成了渐亮的路灯，「突然」没了。
 * burnS        滞空燃烧。14 s 是照 Data_MissionCh4 那段 beats 排的
 *              （「照明弹！」到「照明弹落下去，街上重新变黑」之间六七条台词）。
 * fadeS        熄灭衰减，对应素材末尾 2.90 s 的自然衰减。
 * adaptS       暗适应：灯灭之后眼睛认不出人的那几秒。
 * descendMS    伞降下沉率（m/s）。
 * driftMS      风把伞往一边推的速率；driftDirRad 是罗盘角（dir = (sin, cos)）。
 * swayM        伞下摆幅；swayPeriodS 摆一个来回要多久。**摇曳感一半来自它**
 *              （光源在动，墙上的影子才会晃），不全靠光强抖。
 * flickerLow/High/Depth  光强抖动的两个频率与深度。单频率会听出规律的「呼吸」。
 * groundLux    正下方地面的目标照度。**点光强度由它反推**：
 *              intensity = groundLux × agl²（three 的 decay=2 就是平方反比）。
 *              写照度而不是写 intensity，是为了改了 apexM 之后亮度不用重调。
 * maxIntensity 灯池预算的硬顶（防止 apexM 被摆点写成三百米时算出个天文数字）。
 * lightRadiusM PointLight.distance：超过这个距离不再照。比 apexM 大得多是对的，
 *              照明弹要照的是**一条巷子**，不是脚下一个圆斑。
 * lightColor   冷白。照明弹烧的是镁，色温高得多 —— 与火光池里那些橙红的火
 *              （0xff7a2a）拉开，玩家一眼分得出「这不是着火了，是被照到了」。
 * exposeSight  燃烧最亮时的发现距离倍率（乘 SIGHT_BY_STANCE 三档）。
 * adaptSight   暗适应最深处的倍率（**小于 1**）。
 * smokeRate    微烟迹的粒子率。低得几乎看不见是对的：它的作用是让光球有个「拖尾」，
 *              不是在夜空里挂一根烟柱。
 * maxActive    同时在天上的枚数上限。灯池一共就四到六槽，两枚已经够读了。
 */
export const FLARE_DEFAULTS = Object.freeze({
  ascendS: 2.6,
  apexM: 62,
  igniteS: 0.35,
  burnS: 14.0,
  fadeS: 2.6,
  adaptS: 4.0,
  descendMS: 2.4,
  driftMS: 1.6,
  driftDirRad: 0,
  swayM: 2.2,
  swayPeriodS: 3.4,
  flickerLow: 7.3,
  flickerHigh: 19.7,
  flickerDepth: 0.13,
  groundLux: 0.42,
  maxIntensity: 5200,
  lightRadiusM: 165,
  lightColor: 0xE9F1FF,
  exposeSight: 2.4,
  adaptSight: 0.72,
  smokeRate: 3.5,
  maxActive: 2,
  /** HUD 与取证口上这枚弹的名字（文本键）。 */
  labelKey: "gameplay.flare.label",
});

/**
 * 两条预设 —— 就是 §5 里那两枚，**不是随机投放**。
 * 每条只写与默认值不同的字段（改一处默认值两枚一起变）。
 */
// `note` 是**开发者说明**：这条预设挂在哪个 zone、熄灭之后该发生什么。它活在纯数据
// 表里，玩家一个字都看不见，所以不进文本表（闸门也不扫 Data_*.mjs）。
export const FLARE_PRESETS = Object.freeze({
  // ── §5 阶段 5｜第一枚：横巷突然照亮 ──────────────────────────────────────
  // 「敌军翻墙、屋顶架枪、友军也暴露、掷弹筒打院落」——照得开、照得久，
  // 玩家要有时间读完整条巷子：谁在墙头、谁在自己这边。
  crossLane: Object.freeze({
    id: "crossLane",
    labelKey: "gameplay.flare.preset.crossLane",
    apexM: 66,
    burnS: 14.0,
    exposeSight: 2.4,
    signals: Object.freeze({ launch: "C4_FlareUp" }),
    note: "zone C4_FlareCross。熄灭后战场重新变暗，暗适应 adaptS 秒。",
  }),

  // ── §5 阶段 7｜第二枚：窄巷与白刃 ────────────────────────────────────────
  // 「窄巷敌我十余米……两边都愣了半秒」。压得更低、烧得更短、摆得更狠：
  // 十几米上的一盏灯在晃，两堵墙上的影子跟着晃 —— 那半秒的愣就是这么来的。
  narrowLane: Object.freeze({
    id: "narrowLane",
    labelKey: "gameplay.flare.preset.narrowLane",
    apexM: 54,
    burnS: 11.0,
    swayM: 2.8,
    swayPeriodS: 2.9,
    exposeSight: 2.6,
    adaptSight: 0.66,
    signals: Object.freeze({ launch: "C4_FlareUp" }),
    note: "zone C4_NarrowLane。熄灭后「谁是谁，只能靠喊」——暗适应压得比第一枚更深。",
  }),
});
