// Data_Tuning_Hud.mjs — HUD 的节奏与阈值。纯数据，不 import three、不 import 规则代码。
//
// 什么进这里：**换一个策划改数就该改的量** —— 一条提示挂多久、暗角从哪一档血开始渗、
// 近弹图标最多摆几个、帧率读数多久平均一次。
// 什么不进：绘制布局（准心几何 CROSSHAIR、路标避让的像素间距 MARKER_SEP_*、
// 小地图画布尺寸与配色）—— 那些是「画成什么样」，不是「玩起来什么手感」，
// 与 CSS 是同一层东西，抽出来只会多一处要同步的地方（口径见 docs/Data_TextAndTuning.md §4）。
//
// 注释跟着数走：原来写在 Script_Hud 常量旁的账整段搬到了这里，代码里不留孤儿注释。

/** 开场三层字的排序。 */
export const TITLE_CARD = Object.freeze({
  /**
   * 章节卡排在简报之后要等多久（秒）。0.55 s 让简报那 0.6 s 的淡出先走完，
   * 不然两张卡会在低透明度上擦一下（见 Script_Hud.Title 的整段账）。
   */
  afterBriefS: 0.55,
  /** 章节卡自己挂多久（秒）。 */
  holdS: 4.2,
});

/** 一次性文字层各自挂多久（秒）。都由 Hud.Update 逐帧倒数。 */
export const TIMING = Object.freeze({
  /** Say() 不传秒数时的默认字幕时长。 */
  subtitleS: 3.6,
  /** Hint() 不传秒数时的默认提示时长。 */
  hintS: 4.5,
  /** 关卡简报（ShowBrief）挂多久。章节卡按 TITLE_CARD.afterBriefS 排在它后面。 */
  briefS: 4.0,
  /** 史实注记卡片一张挂多久。它比别的都长 —— 那是要读的一段字，不是一句提示。 */
  noteS: 9.5,
  /** 右上角兵员池闪现之后多久收掉。 */
  forceStatusS: 3.5,
});

/**
 * 近弹提示（Easy Red 2 式的手榴弹图标）。
 * 上限是**读得过来几个**，不是场上有几颗弹：四个以上同时钉在屏幕上，
 * 玩家一个都读不出来，还会把准心那一块糊掉。
 */
export const GRENADE_WARNING = Object.freeze({
  maxIcons: 4,
  /** 引信短于这么多秒转「急」。 */
  urgentFuseS: 1.35,
  /** 距离进到致死半径的这个比例转「致命」。 */
  lethalRadiusFrac: 0.58,
});

/**
 * 命中记号。
 *
 * 旧值（命中 0.26 s / 击杀 0.42 s）在 60 Hz 下只亮 16 帧，第一帧又常被枪口焰和
 * 后坐遮掉；高分屏上的 1.5 px 细线更容易被抗锯齿吃掉。稍微延长，仍然短到不能
 * 被当成常驻准星，但玩家确实能读到这一枪有没有打中。
 */
export const HITMARK = Object.freeze({
  hitS: 0.34,
  killS: 0.50,
});

/** 来弹指示器（外圈那一段弧）的淡出。 */
export const HITDIR = Object.freeze({
  /** Built-in Imagegen: distressed crescent; local alpha PNG shared by every bearing. */
  texture: "./Texture/Hud/Texture_HudDamageArc.png?v=20260911a",
  /** Registration in the -100..100 HUD viewBox; keep the sight center clear. */
  textureBox: Object.freeze({ x: -70, y: -85, size: 140 }),
  /** Near fire keeps a split thin red crest; injury uses the solid blood arc. */
  nearPath: "M-43,-55 Q-27,-70 -9,-73 M9,-73 Q27,-70 43,-55",
  nearOpacity: 0.86,
  /** 剩余寿命乘这个数再夹到 1：前四分之一寿命满亮，之后才开始淡。 */
  fullBrightGain: 1.35,
  /** 满亮时的不透明度上限。指示器不许亮到抢准心。 */
  maxOpacity: 0.92,
});

/**
 * 受伤的画面反馈（暗角）。三层叠在同一张暗角上，前两层取 max 而不是相加 ——
 * 相加会让「低血 + 连中」直接糊成纯红看不见路。
 */
export const VIGNETTE = Object.freeze({
  /**
   * 失血即开始提示；2026-09-11 玩家反馈要求范围与深度同时随剩余生命变化。
   */
  bleedFromHealth: 100,
  /** 曲线幂次。越低涨得越快。 */
  curvePower: 0.85,
  /** 底噪的最大不透明度。 */
  baseMax: 0.94,
  /** 这一发的红闪（player.hitFlash）折算成不透明度的系数。 */
  flashGain: 0.85,
  /** 三层叠完之后的总上限：留一条缝，任何时候都还看得见路。 */
  totalMax: 0.92,
  /** 血量低于这一档整块暗角开始搏动（CSS 动画）。 */
  pulseBelowHealth: 40,
  warningBelowHealth: 30,
  /** Clear central ellipse shrinks as blood spreads inward; aiming stays unobscured. */
  clearHealthyPct: 82,
  clearCriticalPct: 32,
  textureHealthyPct: 148,
  textureCriticalPct: 100,
  pulseSlowS: 1.10,
  pulseFastS: 0.60,
});

/** 压制暗角。压制值指数衰减永远到不了 0，所以另有千分位截断（在代码里）。 */
export const SUPPRESSION = Object.freeze({ gain: 1.15 });

/**
 * 常驻信息的「闲置自隐」（对标 COD《战争世界》单人战役）。
 *
 * COD4 / WaW 引擎里这一族叫 `hud_fade_ammodisplay` / `hud_fade_offhand` /
 * `hud_fade_stance` / `hud_fade_sprint`（单位秒，0＝永不淡出；`hud_fadeout_speed`
 * 管淡出快慢）。单人战役实机：弹药与手榴弹数只在开枪、装填、换枪、拿弹时亮起，
 * 几秒不碰就整块淡掉，屏幕上只剩准心、路标与真正紧急的反馈。多人模式把这几个
 * 数归零让它常驻 —— 我们是线性战役，照单人那一档。
 *
 * 数是我们自己的：WaW 出厂 archive 值里 stance/sprint 是 1.7 s，弹药那一档由关卡
 * 脚本另设。1.7 s 对读一次「05 | 30」偏紧（中文玩家还要读一行武器名），放宽到 3 s；
 * 淡出本身的时长是画法，在 Style_Game.css 的 transition 里。
 */
export const IDLE_FADE = Object.freeze({
  /** 弹药 / 手榴弹 / 武器名那一块：最后一次交互之后挂多久（秒）。 */
  combatS: 3.0,
  /** 伤情 / 屏息 / 命令那一行：状态变化之后挂多久（秒）。 */
  stateS: 3.0,
});

/** 情境操作提示条。 */
export const PROMPTS = Object.freeze({
  /** 最多同时挂几条。三条以上就没人读了 —— 提示条不是操作说明书。 */
  maxRows: 3,
});

/** 小地图（按 M 开合，收起时连 Canvas 都不重绘）。 */
export const MINIMAP = Object.freeze({
  /** 多久重画一次（秒）。200 ms 够了，不必每帧。 */
  refreshS: 0.2,
  /** 地图边长对应多少米。 */
  spanM: 260,
  /** 敌人只按班组画一个圈；这么多米之内的敌人算进同一个几何中心。 */
  enemyClusterM: 90,
});

/** 左上角那个小帧率读数。 */
export const FPS = Object.freeze({
  /** 累计这么久再平均一次，免得数字每帧乱跳（秒）。 */
  sampleS: 0.25,
  /** 低于这个帧率把读数标红。 */
  lowFps: 30,
});
