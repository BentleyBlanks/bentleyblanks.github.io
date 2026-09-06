// Data_AircraftStrafe.mjs — 日机扫射航线的音效档案、默认值与四条预设。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。导演在 `Script_AircraftStrafe.mjs`。
// 玩家可见的名字与【扑入路沟】那条提示存**文本键**，句子在 Data_Text_Gameplay 的 `gameplay.strafe.*`。

/**
 * 音效档案。每条两个名字：**先播 A2 批那条实录，播不响就退到现有最近的源**。
 *   planeDive  ← amb.planeFar   同一架飞机的远场盘旋（环境包里那条）
 *   strafeNear ← type92         九二式重机的近射；航空机枪没有单独的合成配方
 *   strafeFar  ← type11         十一年式，机械噪声重、远场糊得开
 *   strafeDirt ← impactDirt     单发打土，连着触发就是一串
 */
export const STRAFE_SFX = Object.freeze({
  engine: { names: ["planeDive", "amb.planeFar"], volume: 0.95 },
  gunNear: { names: ["strafeNear", "type92"], volume: 0.95, burst: 3 },
  gunFar: { names: ["strafeFar", "type11"], volume: 0.8, burst: 3 },
  dirt: { names: ["strafeDirt", "impactDirt"], volume: 0.85 },
  flesh: { names: ["impactFlesh"], volume: 0.9 },
});

/** 近/远两条机枪录音的分界（米）。与 Script_Audio 的 GUN_NEAR_M 不是同一本账：
 *  这挺枪在**天上**，一百米外就只剩尾巴了。 */
export const GUN_NEAR_M = 110;

/**
 * 航线默认值。数值只在这里，文档里只写常量名（AGENTS 硬规矩 12）。
 *
 * speed        通场速度（m/s）。96 ≈ 345 km/h，九七式轻轰的巡航量级。
 * altitudeM    扫射段离地高度。低到能看清机腹，高到不至于撞树。
 * entryAltM    远方接近时的高度；approachM 这一段一路降到 altitudeM。
 * exitAltM     拉起离场爬到的高度（与 Data_AircraftAssets 的盘旋高度同量级，
 *              这样航线走完那一架归队时不至于凭空掉两百米）。
 * approachM    进入航线的前置直线距离；除以 speed 就是「远方接近」那几秒。
 * exitM        离场直线距离。
 * leadM        弹着点比机身**超前**多少。俯角 = atan(altitudeM / leadM)：
 *              60 / 95 ≈ 32°，正是低空扫射的角度。给反了（弹着落在机身后面）
 *              的话，画面上就成了「飞机在追自己的弹」。
 * burstS/gapS  连发与停顿。航空机枪 ~900 rpm，逐发排会被音频预算闸吃掉一半，
 *              所以声音走**成段**的三连发，画面走 impactHz 的弹着点。
 * impactHz     每秒落几个弹着尘土点（连发段内）。
 * tracerHz     每秒画几条曳光。曳光比弹着稀是对的：不是每发都是曳光弹。
 * spreadM      弹着点在弹线两侧的横向散布半宽。
 * lethalRadiusM  `damage.npc:"line"` 时弹线两侧多宽算打着。
 * chase        弹线追不追（第二轮追人群那一条）。
 * chaseTurnRateRad  弹线每秒最多拐多少 —— 它是一梭子子弹，不是遥控导弹。
 */
export const STRAFE_DEFAULTS = Object.freeze({
  aircraftId: "NakajimaKi43",
  speed: 96,
  altitudeM: 60,
  entryAltM: 190,
  exitAltM: 215,
  approachM: 430,
  exitM: 540,
  leadM: 95,
  entryBankRad: 0,
  exitBankRad: 0.55,
  burstS: 0.55,
  gapS: 0.28,
  impactHz: 15,
  tracerHz: 5,
  spreadM: 1.6,
  lethalRadiusM: 5.5,
  chase: false,
  chaseTurnRateRad: 0.55,
  /** 航线名与「不躲就挨打」那条提示的文本键；预设各自覆盖。 */
  labelKey: "gameplay.strafe.label",
  cueTextKey: null,
});

/**
 * 玩家那一段的默认窗口。
 *
 * **窗口是 [atS − windowS, atS]，不是 [提示, 提示 + 时长]。**
 * `atS` 是**弹线扫到玩家脚下**的那一刻（不给就落在扫射窗口的 55%），
 * 窗口在它之前 windowS 秒打开并给出提示。这样两件事同时成立：
 *   · 提示出现在飞机压下来的时候（玩家还看得见它拐过来），不是子弹已经过去之后；
 *   · 没躲的那一下**正好落在弹线到达的那一帧**，不是拖到扫射结束以后再补一枪。
 * 「调窗口时长」就是调 windowS：调大 = 提示更早、给的反应时间更长，落点不变。
 */
export const STRAFE_PLAYER_DEFAULTS = Object.freeze({
  enabled: false,
  damage: 96,          // 一发够把满血的人打到重伤边缘；真正的「击倒」由 lethal 决定
  lethal: true,        // §2 原文「不躲则被击倒」——不是擦伤
  windowS: 2.2,        // 提示提前多久出来 = 有多久可以躲
  part: "torso",
});

/**
 * 三条预设（docs/Data_MissionRemake.md §2 阶段五 / 六 / 八）。
 * 每条只写与默认值不同的字段；`signals` 里的名字与 Data_MissionCh1.EVENTS 逐条对应。
 */
// `note` 是**开发者说明**：这条预设打谁、开关在哪。它活在纯数据表里，玩家一个字
// 都看不见，所以不进文本表（闸门也不扫 Data_*.mjs）。
export const STRAFE_PRESETS = Object.freeze({
  // ── 阶段五｜第一次掠过 ─────────────────────────────────────────────────────
  // 沿铁路/大车路打**车辆**，不针对队列。玩家可以开枪，步枪威胁不到它
  // （Ping() 有回执但永远打不下来）。这一条一个人都不许伤到。
  railPass: Object.freeze({
    id: "railPass",
    labelKey: "gameplay.strafe.preset.railPass",
    aircraftId: "MitsubishiKi30",   // 九七式轻轰：打车辆的是它，不是战斗机
    speed: 104,
    altitudeM: 78,
    approachM: 520,
    exitM: 620,
    leadM: 118,
    burstS: 0.7, gapS: 0.45,
    impactHz: 13, tracerHz: 4,
    spreadM: 2.4,
    chase: false,
    damage: Object.freeze({ npc: "none", player: false }),
    signals: Object.freeze({ enter: "AircraftFirstPass" }),
    note: "不打人：damage.npc = none。压迫感全在引擎声与弹着线离队列多远。",
  }),

  // ── 阶段六｜转向伤员与百姓 ─────────────────────────────────────────────────
  // 拉起、转弯、降高，重新对准大车路上的人群；**弹线沿道路追赶队列**。
  // 转向那一刻起飞机必须在玩家的自由视角里看得见 —— 所以进入段慢、压得低、
  // 带一个大坡度的转弯（entryBankRad）。
  crowdTurn: Object.freeze({
    id: "crowdTurn",
    labelKey: "gameplay.strafe.preset.crowdTurn",
    aircraftId: "NakajimaKi43",
    speed: 82,
    altitudeM: 46,
    entryAltM: 150,
    approachM: 400,
    exitM: 520,
    leadM: 72,
    entryBankRad: 0.85,             // 转弯：这一下是玩家「看见它拐回来」的全部
    burstS: 0.85, gapS: 0.22,
    impactHz: 18, tracerHz: 6,
    spreadM: 1.4,
    chase: true,
    chaseTurnRateRad: 0.7,
    damage: Object.freeze({ npc: "whitelist", player: false }),
    signals: Object.freeze({ enter: "AircraftTurnCrowd" }),
    note: "victims 由集成批点名（担架员/百姓）；伤员、幺娃、罗班长一律进 immune。",
  }),

  // ── 阶段八｜配合松手 ───────────────────────────────────────────────────────
  // 第三次进入攻击航线，弹线**逼近玩家**。提示【扑入路沟】，不躲则被击倒。
  // 躲开之后由集成批接 OnDodge → CarrySystem.ForceRelease("dive")：
  // 「你的手是先松开的」是剧情要求，不是玩家操作失误。
  divePress: Object.freeze({
    id: "divePress",
    labelKey: "gameplay.strafe.preset.divePress",
    aircraftId: "NakajimaKi43",
    speed: 88,
    altitudeM: 38,
    entryAltM: 130,
    approachM: 330,
    exitM: 500,
    leadM: 58,
    entryBankRad: 0.35,
    burstS: 1.0, gapS: 0.18,
    impactHz: 20, tracerHz: 7,
    spreadM: 1.1,
    chase: true,
    chaseTurnRateRad: 0.5,
    cueTextKey: "gameplay.strafe.cue.dive",
    damage: Object.freeze({ npc: "whitelist", player: true }),
    player: Object.freeze({ enabled: true, windowS: 2.2 }),
    signals: Object.freeze({ enter: "DiveCue" }),
    note: "玩家伤害的总开关在 SetPlayerDamage()，窗口时长在 SetPlayerWindow()。",
  }),

  // ── 第二关阶段一｜只有飞越声 ───────────────────────────────────────────────
  // §3 阶段一：「空中再现飞机声时幺娃下意识抬头骂『妈卖批，又来了？』
  // （心理残留，即使飞机不攻击）」。所以这一条 `guns:false` —— 高空过一趟，
  // 一发不打、一处弹着都不落，只有引擎声与一个从头顶掠过的黑影。
  // 那句台词的分量全在「它这次没打」上，落一颗弹就把这一拍毁了。
  flybyOnly: Object.freeze({
    id: "flybyOnly",
    labelKey: "gameplay.strafe.preset.flybyOnly",
    aircraftId: "MitsubishiKi21Ia",   // 高空重轰：只是路过，不是来找你的
    speed: 118,
    altitudeM: 150,
    entryAltM: 205,
    exitAltM: 235,
    approachM: 700,
    exitM: 820,
    leadM: 0,                         // 不开枪，就没有「弹着超前」这回事
    exitBankRad: 0.2,
    guns: false,
    chase: false,
    damage: Object.freeze({ npc: "none", player: false }),
    note: "二关到终章的氛围过场都可以用它；不给 signals，章节自己接 OnPhase。",
  }),
});
