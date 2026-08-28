// 《滕县 一九三八》照明弹 —— 第四关「东关之夜」的招牌机制。
//
// **纯规则，不许 import three。** 「这一秒它在哪儿、有多亮、谁被照出来了」
// 三件事与画面无关，所以整条时间线在纯 Node 里跑得完（回归口 `Script_FlareTest.mjs`）。
// 画面那一半由 `MakeFlareHost` 翻给 `Script_Light` 的火光池与 `Script_Vfx` 的烟源 ——
// 那个适配器同样不 import three（灯与烟只读 position.x/y/z，给纯对象就行）。
//
// ── 为什么它是一条独立的时间线，而不是「一盏会亮的灯」────────────────────────
// docs/Data_MissionRemake.md §0 保留的三项创作性还原第 3 条：
// **「东关夜战中日军用照明弹照亮街巷，敌我突然暴露并爆发近距离交火」**。
// 这句话里有分量的不是「亮」，是「**突然**」与「**敌我**」：
//   · 突然 —— 亮起是一记冲头（0.35 s 从零到满），不是渐亮的路灯；
//   · 敌我 —— 照亮期间**双方**的发现距离一起放大，不是只把日军照出来。
// 所以这一层的产物有两样：一条光强包络（给灯与烟）与一个**发现距离倍率**
// （给 Script_Ai）。少了后者，照明弹就只是一盏漂亮的灯，玩法上什么也没发生。
//
// ── 五个相位（§5 阶段 5 / 7 的原文顺序）─────────────────────────────────────
//   ascend  升空：发射筒一记闷响 + 上升的啸声；灯只有一点点余烬亮度。
//   ignite  顶空点燃：「噗」的一下，光强 0.35 s 冲到满并带一点点过冲。
//   burn    伞降缓落燃烧：持续嘶声；光强按两个频率抖，伞在风里横着摆。
//   fade    熄灭：平方衰减，夜色回落。
//   adapt   暗适应：**灯已经没了，但眼睛还没回来** —— 发现距离压到 1 以下再慢慢还原。
//           这一条是 Data_MissionCh4 头注 ENGINE_REQUEST 2 明写的
//           「熄灭后有数秒的暗适应（玩家与 AI 都认不出人）」。
//
// ── 发现距离倍率怎么加，才不会把姿态那条机制打掉 ────────────────────────────
// Script_Ai 的 `SIGHT_BY_STANCE = [120, 80, 45]`（站/蹲/卧）是「被发现的距离」，
// 玩家与 AI 共读同一张表。照明弹**乘一个全局倍率**，不改这张表本身：
//   站 120×2.4 = 288 ／ 蹲 80×2.4 = 192 ／ 卧 45×2.4 = 108
// 三档的**次序与比例一个都没变** —— 照明弹底下趴着仍然比站着难被看见，
// 「姿态决定被发现的距离」这条既有机制原样成立。倍率写在这一层、
// 由 `host.SetSpotting(scale)` 交给 `AiDirector.SetSightScale()`，
// 熄灭并过完暗适应之后**一定要还原成 1**（Reset / Abort 两条路也要还）。
//
// ── 性能：一盏灯，零新增 draw call ──────────────────────────────────────────
// 灯走 `LightRig` 现有的**固定预算火光池**（AddFire/UpdateFire/RemoveFire）：
// 灯槽数量不变、castShadow 恒 false、不新建任何阴影管线。烟走 `VfxSystem` 现有的
// 烟源池。所以 BootTest 的 drawCalls ≤ 5000 / triangles ≤ 600 万两条红线一动不动。
//
// ── 音效 ────────────────────────────────────────────────────────────────────
// 四条 key（flareLaunch / flareIgnite / flareBurn / flareOut）由 A2 批登记在
// `Data_SfxSources`，**2026-08-29 集成批 INT3a 已经接线完毕**：合成配方补齐、
// 素材从 `manifest.pendingCues` 毕业进 `cues`，`audio.Play` 现在会真的出声。
// 备胎那条路（FLARE_SFX）保留不动 —— 它不是给「还没接线」用的，是给
// 「这一台机器上采样没载到 / 音频关掉了」用的：第一次播不响就换备胎并记住，
// 与 Script_AircraftStrafe 同一条写法。
//
// ── 给集成批的 CH4 摆点示例（坐标照 Data_MissionCh4.CHAPTER.zones）──────────
// 两枚都是**剧情节拍，不是随机**：日方 `ija_gunso` 喊完
// 「しょうめいだんをあげろ！」那一拍升空，所以用 `LaunchSequence` 排时刻表，
// 或者由 story 的 zone 回调直接 `LaunchFlare`。
//
//   import { FlareDirector, MakeFlareHost } from "./Script_Flare.mjs";
//
//   // 第一枚 · §5 阶段 5「照明弹横巷」zone C4_FlareCross (449, -22)
//   // 发射点在日军那一侧（东，+X），顶空压在横巷正中：亮的是巷子，不是发射筒。
//   flare.LaunchFlare({ preset: "crossLane",
//     from: { x: 496, z: -18 }, at: { x: 449, z: -22 },
//     OnPhase: (beat) => { if (beat === "out") story.Signal("C4_FlareDown"); } });
//
//   // 第二枚 · §5 阶段 7「窄巷 · 白刃」zone C4_NarrowLane (443, 121)
//   // 窄巷压低一点（apexM 由预设给 54）：十几米外照得清人脸，才有「两边都愣了半秒」。
//   flare.LaunchFlare({ preset: "narrowLane",
//     from: { x: 486, z: 128 }, at: { x: 443, z: 121 } });
//
//   // 定时序列（一段夜战里连投几枚）：atS 是相对**现在**的秒数。
//   flare.LaunchSequence([
//     { atS: 0.0, preset: "crossLane", from: { x: 496, z: -18 }, at: { x: 449, z: -22 } },
//     { atS: 34.0, preset: "narrowLane", from: { x: 486, z: 128 }, at: { x: 443, z: 121 } },
//   ]);

import { Mulberry32, Clamp, Clamp01, SmoothStep } from "./Script_Noise.mjs";

/** 五个相位 + 两个端点。`idle` 是没有照明弹时的取值。 */
export const FLARE_PHASES = Object.freeze(["idle", "ascend", "ignite", "burn", "fade", "adapt", "done"]);

/**
 * 四个节拍（`OnPhase(beat, view)` 的第一个参数，也是 `signals` 表的键）。
 *   launch  发射（升空那一下）—— CH4 的 `C4_FlareUp` 挂在这里
 *   ignite  顶空点燃（亮起）
 *   out     熄灭（夜色回落）
 *   clear   暗适应结束，发现距离还原成 1
 */
export const FLARE_BEATS = Object.freeze(["launch", "ignite", "out", "clear"]);

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
  label: "照明弹",
});

/**
 * 两条预设 —— 就是 §5 里那两枚，**不是随机投放**。
 * 每条只写与默认值不同的字段（改一处默认值两枚一起变）。
 */
export const FLARE_PRESETS = Object.freeze({
  // ── §5 阶段 5｜第一枚：横巷突然照亮 ──────────────────────────────────────
  // 「敌军翻墙、屋顶架枪、友军也暴露、掷弹筒打院落」——照得开、照得久，
  // 玩家要有时间读完整条巷子：谁在墙头、谁在自己这边。
  crossLane: Object.freeze({
    id: "crossLane",
    label: "第一枚照明弹 · 横巷",
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
    label: "第二枚照明弹 · 窄巷白刃",
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

// ---------------------------------------------------------------------------
// 小工具（全是纯算术；本层一个 three 类型都不碰）
// ---------------------------------------------------------------------------

function Num(value, fallback) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

/** 只取 x/z 的点；y 由 GroundHeight 补。 */
function Flat(point) {
  if (!point) return null;
  return { x: Num(point.x, 0), z: Num(point.z, 0) };
}

// ---------------------------------------------------------------------------
// 导演
// ---------------------------------------------------------------------------

/**
 * host 是装配层注入的窄接口（同 CarrySystem / EmplacementSystem / 扫射航线的约定）。
 * 每一条都是可选的：全不给也跑得完整条时间线（纯规则测试就是这么跑的）。
 *
 *   Time() -> number                     关内秒表（取证用）
 *   Play(name, opts) -> voice|null       放一条音效；返回假值 = 这条没响
 *   Signal(name)                         推一条 story 事件
 *   Hint(text, seconds)                  HUD 一次性提示
 *   Say(who, text, seconds)              让人喊一句
 *   GroundHeight(x, z) -> number         地面高度；不给按 0
 *   AddLight(spec) -> handle             要一盏灯（火光池）
 *   MoveLight(handle, spec)              每帧改位置/强度/半径
 *   RemoveLight(handle)                  收灯
 *   AddSmoke(spec) -> handle             要一条烟迹
 *   MoveSmoke(handle, position)          烟迹跟着走（不跟就不是「迹」）
 *   RemoveSmoke(handle)                  收烟
 *   SetSpotting(scale)                   发现距离倍率 → AiDirector.SetSightScale
 *   PlayerPos() -> {x,y,z}               音效定位用
 */
export class FlareDirector {
  constructor(host = {}, opts = {}) {
    this.host = host;
    /** 天上现在有几枚。空数组 = 夜里就是黑的。 */
    this.flares = [];
    /** 定时发射序列（LaunchSequence）。剧情节拍排的时刻表，不是随机。 */
    this.queue = [];
    this.serial = 0;
    /** 自己的秒表：序列的 atS 相对它算。**不依赖 host.Time** —— 那是关内秒表，
     *  换关会跳，而序列要的是「从现在起第几秒」。 */
    this.clock = 0;
    /** 摇曳相位的随机源。**只用来给每枚一个不同的起相**，一个玩法判定都不许读它。 */
    this.rnd = Mulberry32(Num(opts.seed, 19380316) >>> 0);
    /** 集成批的总开关：关掉之后照明弹只有画面，不动发现距离。 */
    this.exposure = opts.exposure !== false;
    this.maxActive = Math.max(1, Num(opts.maxActive, FLARE_DEFAULTS.maxActive));
    /** 当前发现距离倍率，以及上一次真正推给 host 的那个值。 */
    this.sightScale = 1;
    this.pushedScale = 1;
    /** 音效解析结果：哪条 key 真的响过。一条只解析一次。 */
    this.sfxPick = new Map();
    this.stats = {
      launched: 0, ignited: 0, burnedOut: 0, cleared: 0, aborted: 0,
      queued: 0, refused: 0, sightPushes: 0,
    };
    /** 最后一枚走完的取证记录。 */
    this.lastFlare = null;
  }

  get Active() { return this.flares.length > 0; }
  get Count() { return this.flares.length; }
  get Pending() { return this.queue.length; }
  /** 全场最亮那一枚的亮度（0..1+）。HUD / 后处理想读夜视暗适应时用它。 */
  get Brightness() {
    let best = 0;
    for (const f of this.flares) if (f.brightness > best) best = f.brightness;
    return best;
  }
  /** 现在的发现距离倍率。1 = 夜里原样。 */
  get SightScale() { return this.sightScale; }

  Time() { return Num(this.host.Time?.(), 0); }

  // -------------------------------------------------------------------------
  // 主 API
  // -------------------------------------------------------------------------

  /**
   * 打一枚照明弹。
   *
   * @param {object} spec
   *   preset      FLARE_PRESETS 的键；给了就先铺预设再让 spec 覆盖
   *   from        发射点 {x, z}（发射筒在哪儿）
   *   at          顶空水平位置 {x, z}；不给就等于 from（垂直打上去）
   *   apexM       顶空高度（离发射点地面）
   *   ascendS / igniteS / burnS / fadeS / adaptS      五段时长
   *   descendMS / driftMS / driftDirRad / swayM / swayPeriodS   伞降与摆动
   *   groundLux / lightRadiusM / lightColor           光照
   *   exposeSight / adaptSight                        暴露与暗适应倍率
   *   signals     { launch, ignite, out, clear } → host.Signal(name)
   *   OnPhase(beat, view)                             四个节拍
   *   OnEnd(summary)                                  收尾（走完 / Abort 都回）
   * @returns {string|null} 这一枚的 id；打不出来返回 null
   */
  LaunchFlare(spec = {}) {
    const preset = spec.preset ? FLARE_PRESETS[spec.preset] : null;
    if (spec.preset && !preset) { this.stats.refused += 1; return null; }
    if (this.flares.length >= this.maxActive) { this.stats.refused += 1; return null; }
    const cfg = { ...FLARE_DEFAULTS, ...(preset || {}), ...spec };
    const from = Flat(cfg.from);
    if (!from) { this.stats.refused += 1; return null; }
    const at = Flat(cfg.at) || { x: from.x, z: from.z };

    this.serial += 1;
    const ascendS = Math.max(0.05, Num(cfg.ascendS, FLARE_DEFAULTS.ascendS));
    const igniteS = Math.max(0.05, Num(cfg.igniteS, FLARE_DEFAULTS.igniteS));
    const burnS = Math.max(0.1, Num(cfg.burnS, FLARE_DEFAULTS.burnS));
    const fadeS = Math.max(0.05, Num(cfg.fadeS, FLARE_DEFAULTS.fadeS));
    const adaptS = Math.max(0, Num(cfg.adaptS, FLARE_DEFAULTS.adaptS));
    const groundY = this.Ground(from.x, from.z);
    const flare = {
      id: `flare${this.serial}`,
      presetId: preset ? preset.id : (spec.preset || null),
      label: String(cfg.label || FLARE_DEFAULTS.label),
      from, at, groundY,
      apexM: Math.max(4, Num(cfg.apexM, FLARE_DEFAULTS.apexM)),
      ascendS, igniteS, burnS, fadeS, adaptS,
      // 四个相位的累计边界。算一次存起来：每帧现算四个加法没错，但边界是
      // 判等用的（`t >= ignitedAt` 那一类），存起来才不会因为浮点重排差一帧。
      ignitedAt: ascendS,
      burnAt: ascendS + igniteS,
      fadeAt: ascendS + igniteS + burnS,
      outAt: ascendS + igniteS + burnS + fadeS,
      endAt: ascendS + igniteS + burnS + fadeS + adaptS,
      descendMS: Math.max(0, Num(cfg.descendMS, FLARE_DEFAULTS.descendMS)),
      driftMS: Math.max(0, Num(cfg.driftMS, FLARE_DEFAULTS.driftMS)),
      driftDirRad: Num(cfg.driftDirRad, FLARE_DEFAULTS.driftDirRad),
      swayM: Math.max(0, Num(cfg.swayM, FLARE_DEFAULTS.swayM)),
      swayPeriodS: Math.max(0.2, Num(cfg.swayPeriodS, FLARE_DEFAULTS.swayPeriodS)),
      flickerLow: Num(cfg.flickerLow, FLARE_DEFAULTS.flickerLow),
      flickerHigh: Num(cfg.flickerHigh, FLARE_DEFAULTS.flickerHigh),
      flickerDepth: Clamp01(Num(cfg.flickerDepth, FLARE_DEFAULTS.flickerDepth)),
      groundLux: Math.max(0, Num(cfg.groundLux, FLARE_DEFAULTS.groundLux)),
      maxIntensity: Math.max(1, Num(cfg.maxIntensity, FLARE_DEFAULTS.maxIntensity)),
      lightRadiusM: Math.max(4, Num(cfg.lightRadiusM, FLARE_DEFAULTS.lightRadiusM)),
      lightColor: Num(cfg.lightColor, FLARE_DEFAULTS.lightColor),
      smokeRate: Math.max(0, Num(cfg.smokeRate, FLARE_DEFAULTS.smokeRate)),
      exposeSight: Math.max(1, Num(cfg.exposeSight, FLARE_DEFAULTS.exposeSight)),
      adaptSight: Clamp(Num(cfg.adaptSight, FLARE_DEFAULTS.adaptSight), 0.1, 1),
      signals: { ...(preset?.signals || {}), ...(spec.signals || {}) },
      OnPhase: typeof cfg.OnPhase === "function" ? cfg.OnPhase : null,
      OnEnd: typeof cfg.OnEnd === "function" ? cfg.OnEnd : null,
      // 运行态
      t: 0, phase: "ascend",
      level: 0, brightness: 0,
      swayPhase: this.rnd() * Math.PI * 2,
      flickerPhase: this.rnd() * Math.PI * 2,
      pos: { x: from.x, y: groundY, z: from.z },
      agl: 0,
      intensity: 0,
      lightHandle: null, smokeHandle: null,
      burnLoopLeft: 0,
      beats: [],
      beganAt: this.Time(),
    };
    this.flares.push(flare);
    this.stats.launched += 1;
    this.Place(flare, 0);
    // 灯在**升空那一刻**就要，不是等点燃：发射筒那一下与上升的余烬本来就有光，
    // 而且先要到灯槽，点燃那一帧才不会因为抢不到槽而「亮了但墙没亮」。
    flare.lightHandle = this.host.AddLight?.({
      position: { ...flare.pos },
      intensity: 0, radius: flare.lightRadiusM, color: flare.lightColor,
      flicker: false, priority: 1.6, label: flare.label,
    }) ?? null;
    flare.smokeHandle = flare.smokeRate > 0
      ? (this.host.AddSmoke?.({ position: { ...flare.pos }, rate: flare.smokeRate }) ?? null)
      : null;
    this.Beat(flare, "launch");
    this.Sfx("launch", { position: { ...flare.pos }, volume: 0.95 });
    return flare.id;
  }

  /**
   * 排一串定时发射。**剧情节拍，不是随机**：`atS` 是相对**现在**的秒数，
   * 由集成批按台词排（「しょうめいだんをあげろ！」那一拍之后）。
   * @returns {string[]} 每条的排队号（`CancelSequence(ticket)` 用得着）
   */
  LaunchSequence(items = []) {
    const tickets = [];
    for (const item of items || []) {
      if (!item) continue;
      this.serial += 1;
      const ticket = `q${this.serial}`;
      this.queue.push({ ticket, atS: this.clock + Math.max(0, Num(item.atS, 0)), spec: { ...item } });
      tickets.push(ticket);
      this.stats.queued += 1;
    }
    this.queue.sort((a, b) => a.atS - b.atS);
    return tickets;
  }

  /** 撤掉还没打出去的：给排队号就撤那一条，不给就整条序列清掉。 */
  CancelSequence(ticket = null) {
    const before = this.queue.length;
    this.queue = ticket === null ? [] : this.queue.filter((q) => q.ticket !== String(ticket));
    return before - this.queue.length;
  }

  /** 暴露机制的总开关（集成批用）。关掉之后照明弹只有画面。 */
  SetExposure(on) {
    this.exposure = on !== false;
    return this.exposure;
  }

  /** 提前掐掉一枚（或全部）。收灯收烟并把发现距离还回去。 */
  Abort(id = null, reason = "abort") {
    let killed = 0;
    for (const flare of [...this.flares]) {
      if (id !== null && flare.id !== String(id)) continue;
      this.stats.aborted += 1;
      this.Finish(flare, reason, false);
      killed += 1;
    }
    return killed;
  }

  /**
   * 换关 / 复活 / 出错时的兜底：不记 aborted，也不回调。
   * **发现距离一定要还原成 1** —— 换关时留着 2.4 倍，下一关一进去满场就互相看得见。
   */
  Reset(reason = "reset") {
    for (const flare of [...this.flares]) {
      flare.OnEnd = null;
      flare.OnPhase = null;
      this.Finish(flare, reason, false);
    }
    this.flares.length = 0;
    this.queue.length = 0;
    this.clock = 0;
    this.sfxPick.clear();
    this.sightScale = 1;
    this.PushSight(true);
    return true;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /**
   * 推一帧。**排在 ai.Update 之前**：这一帧的发现距离倍率要在 AI 做 Think 之前
   * 写进去，写晚一帧就会出现「亮了但这一帧还没人看见」。排在过场/暂停分支**之后**
   * （照明弹是玩法，不是天上的环境）。
   */
  Update(dt) {
    const step = Clamp(Num(dt, 0), 0, 0.1);
    this.clock += step;

    // 定时序列：到点就打。**一帧里可能到点两条**，所以是 while 不是 if。
    while (this.queue.length && this.queue[0].atS <= this.clock) {
      const item = this.queue.shift();
      const { atS, ...spec } = item.spec;
      this.LaunchFlare(spec);
    }

    for (let i = this.flares.length - 1; i >= 0; i -= 1) {
      const flare = this.flares[i];
      flare.t += step;
      this.StepPhase(flare);
      this.Place(flare, step);
      this.StepLight(flare);
      this.StepBurnLoop(flare, step);
      if (flare.phase === "done") this.Finish(flare, "done", true);
    }

    this.StepSight();
    return this.View();
  }

  /** 相位机：四条边界一次不多一次不少，节拍在跨过边界的那一帧推。 */
  StepPhase(flare) {
    if (flare.phase === "ascend" && flare.t >= flare.ignitedAt) {
      flare.phase = "ignite";
      this.stats.ignited += 1;
      this.Beat(flare, "ignite");
      // 「噗」的一下在**顶空**响，不在发射筒那儿 —— 定位取这一帧的光球位置。
      this.Place(flare, 0);
      this.Sfx("ignite", { position: { ...flare.pos }, volume: 0.9 });
      flare.burnLoopLeft = 0;                       // 点燃那一帧就起嘶声
    }
    if (flare.phase === "ignite" && flare.t >= flare.burnAt) flare.phase = "burn";
    if (flare.phase === "burn" && flare.t >= flare.fadeAt) flare.phase = "fade";
    if (flare.phase === "fade" && flare.t >= flare.outAt) {
      flare.phase = "adapt";
      this.stats.burnedOut += 1;
      this.Beat(flare, "out");
      this.Sfx("out", { position: { ...flare.pos }, volume: 0.7 });
      // 灯与烟在这一刻就收：暗适应那几秒是**眼睛**的事，天上已经什么都没有了。
      this.DropVisuals(flare);
    }
    if (flare.phase === "adapt" && flare.t >= flare.endAt) {
      flare.phase = "done";
      this.stats.cleared += 1;
      this.Beat(flare, "clear");
    }
  }

  /**
   * 这一秒它在哪儿。
   *   ascend  从发射点沿抛物线减速升到顶空；水平位置同时从 from 滑到 at
   *   之后    以 descendMS 匀速下沉；风把它往 driftDir 推；伞在下面横着摆
   */
  Place(flare, step) {
    const p = flare.pos;
    if (flare.phase === "ascend") {
      const u = Clamp01(flare.t / flare.ascendS);
      // 1-(1-u)² 是「起手快、到顶慢」：发射筒把它推出去，之后一路减速到顶点。
      flare.agl = flare.apexM * (1 - (1 - u) * (1 - u));
      const s = SmoothStep(0, 1, u);
      p.x = flare.from.x + (flare.at.x - flare.from.x) * s;
      p.z = flare.from.z + (flare.at.z - flare.from.z) * s;
    } else {
      const sinceApex = Math.max(0, flare.t - flare.ignitedAt);
      flare.agl = Math.max(1.5, flare.apexM - flare.descendMS * sinceApex);
      const dx = Math.sin(flare.driftDirRad) * flare.driftMS * sinceApex;
      const dz = Math.cos(flare.driftDirRad) * flare.driftMS * sinceApex;
      // 摆动方向取漂移的**法向**：伞在风里是横着荡的，不是顺着风前后串。
      const swing = Math.sin(flare.swayPhase + sinceApex * Math.PI * 2 / flare.swayPeriodS) * flare.swayM;
      p.x = flare.at.x + dx + Math.cos(flare.driftDirRad) * swing;
      p.z = flare.at.z + dz - Math.sin(flare.driftDirRad) * swing;
    }
    p.y = this.Ground(p.x, p.z) + flare.agl;
    if (step > 0 && flare.smokeHandle !== null) this.host.MoveSmoke?.(flare.smokeHandle, { ...p });
  }

  /**
   * 光强包络 → 火光池。
   * intensity = groundLux × agl² × brightness，也就是「正下方地面被照到多少」
   * 乘回平方反比；这样改 apexM 不用重调亮度，改 groundLux 才是在调亮度。
   *
   * **包络与抖动分成两个数**：
   *   `level`      —— 相位包络（升空余烬 / 点燃冲头 / 稳定 1.0 / 平方衰减），平滑；
   *   `brightness` —— level × 摇曳抖动，给灯用。
   * 分开是因为**暴露机制只能读包络**：一个人能不能看见对面，不该跟着照明弹
   * 7 Hz 的抖动一起闪 —— 那会让发现距离每帧变一次，既没有玩法意义，
   * 又把 `SetSpotting` 变成每帧一次的无谓写入。
   */
  StepLight(flare) {
    const t = flare.t;
    let level = 0;
    let flicker = 1;
    if (flare.phase === "ascend") {
      // 升空的余烬：一点点就够，只为让玩家看见「有个东西在往上走」。
      level = 0.05 * Clamp01(t / flare.ascendS);
    } else if (flare.phase === "ignite") {
      const u = Clamp01((t - flare.ignitedAt) / flare.igniteS);
      // 冲头带一点过冲：镁一点着的头半秒比稳定燃烧还亮。
      level = SmoothStep(0, 1, u) * (1 + 0.22 * Math.sin(Math.PI * u));
    } else if (flare.phase === "burn") {
      level = 1;
      flicker = this.Flicker(flare, t);
    } else if (flare.phase === "fade") {
      const u = Clamp01((t - flare.fadeAt) / flare.fadeS);
      level = (1 - u) * (1 - u);
      flicker = this.Flicker(flare, t);
    }
    flare.level = level;
    flare.brightness = level * flicker;
    flare.intensity = Math.min(flare.maxIntensity,
      flare.groundLux * flare.agl * flare.agl * flare.brightness);
    if (flare.lightHandle === null) return;
    this.host.MoveLight?.(flare.lightHandle, {
      position: { ...flare.pos },
      intensity: flare.intensity,
      radius: flare.lightRadiusM,
      color: flare.lightColor,
    });
  }

  /** 两个频率叠出来的抖动。单频率是「呼吸」，两个才像在烧。 */
  Flicker(flare, t) {
    const d = flare.flickerDepth;
    const a = Math.sin(t * flare.flickerLow + flare.flickerPhase);
    const c = Math.sin(t * flare.flickerHigh + flare.flickerPhase * 1.7);
    return 1 - d * 0.5 + d * (0.62 * a + 0.38 * c) * 0.5;
  }

  /** 燃烧嘶声：Play 没有 loop 语义，所以按素材长度重触发。 */
  StepBurnLoop(flare, step) {
    if (flare.phase !== "burn" && flare.phase !== "ignite") return;
    flare.burnLoopLeft -= step;
    if (flare.burnLoopLeft > 0) return;
    flare.burnLoopLeft = FLARE_SFX.burn.loopEveryS ?? 5.6;
    this.Sfx("burn", { position: { ...flare.pos } });
  }

  /**
   * 发现距离倍率。
   *
   * 燃烧期取全场最亮那一枚：`1 + (exposeSight − 1) × brightness`。
   * 熄灭之后走暗适应：从 adaptSight（小于 1）线性回到 1。
   * **两段不能相加**：一枚在烧、另一枚在暗适应时，烧着的那一枚说了算 ——
   * 天亮着的时候眼睛不会因为上一枚灭了而看不见。
   *
   * **升空段不算暴露**：那点余烬照不亮任何东西，算进去只会让发现距离在
   * 「还没亮」的那两秒半里一路爬 —— 玩家会莫名其妙先挨枪，再看见照明弹。
   */
  StepSight() {
    let scale = 1;
    for (const flare of this.flares) {
      if (flare.phase === "ascend" || flare.phase === "adapt") continue;
      // 读的是**包络**不是 brightness：发现距离不跟着摇曳抖（见 StepLight）。
      // 点燃冲头那一下 level 会过冲到 1 以上；暴露倍率封顶在 exposeSight，
      // 不许因为一记过冲把发现距离顶到预设以外。
      const s = 1 + (flare.exposeSight - 1) * Clamp01(flare.level);
      if (s > scale) scale = s;
    }
    if (scale === 1) {
      // 没有任何一枚在放亮 —— 这时候暗适应（<1）才轮得到说话。
      let dim = 1;
      for (const flare of this.flares) {
        if (flare.phase !== "adapt") continue;
        const u = flare.adaptS > 1e-3
          ? Clamp01((flare.t - flare.outAt) / flare.adaptS) : 1;
        const s = flare.adaptSight + (1 - flare.adaptSight) * u;
        if (s < dim) dim = s;
      }
      scale = dim;
    }
    this.sightScale = this.exposure ? scale : 1;
    this.PushSight(false);
  }

  /**
   * 值真的变了才推给宿主。门槛 0.02 是**发现距离的分辨率**：
   * 站姿 120 m 上的 2% 是 2.4 m，比任何一个人的身位都小 —— 再细就是白写。
   * 还原成 1 那一下走 force，一个浮点尾巴都不许留（换关最怕这个）。
   */
  PushSight(force) {
    if (!force && Math.abs(this.sightScale - this.pushedScale) < 0.02
      && !(this.sightScale === 1 && this.pushedScale !== 1)) return;
    this.pushedScale = this.sightScale;
    this.stats.sightPushes += 1;
    this.host.SetSpotting?.(this.sightScale);
  }

  // -------------------------------------------------------------------------
  // 收尾、节拍、音效
  // -------------------------------------------------------------------------

  DropVisuals(flare) {
    if (flare.lightHandle !== null) {
      this.host.RemoveLight?.(flare.lightHandle);
      flare.lightHandle = null;
    }
    if (flare.smokeHandle !== null) {
      this.host.RemoveSmoke?.(flare.smokeHandle);
      flare.smokeHandle = null;
    }
  }

  /** 三条收尾路径（走完 / Abort / Reset）的共同出口。 */
  Finish(flare, reason, completed) {
    this.DropVisuals(flare);
    const index = this.flares.indexOf(flare);
    if (index >= 0) this.flares.splice(index, 1);
    const summary = {
      id: flare.id, presetId: flare.presetId, reason, completed,
      seconds: flare.t,
      beats: flare.beats.map((b) => b.name),
      apexM: flare.apexM,
      peakIntensity: flare.groundLux * flare.apexM * flare.apexM,
    };
    this.lastFlare = summary;
    flare.phase = "done";
    flare.level = 0;
    flare.brightness = 0;
    flare.intensity = 0;
    flare.OnEnd?.(summary);
    // 最后一枚收掉之后一定要把发现距离还回去（Abort / Reset 也走这里）。
    if (!this.flares.length) {
      this.sightScale = 1;
      this.PushSight(false);
    }
    return summary;
  }

  /** 一个节拍：记进取证、推 story 信号、回调章节侧。三件事的顺序是固定的。 */
  Beat(flare, name) {
    flare.beats.push({ name, t: flare.t, at: this.Time() });
    const signal = flare.signals[name];
    if (signal) this.host.Signal?.(signal);
    flare.OnPhase?.(name, this.ViewOf(flare));
  }

  /**
   * 放一条本层的音效。A2 批那四条实录的同名配方合上之前 `Play` 会返回假值 ——
   * 那时退到备胎，并**把结果记下来**：一条 key 只解析一次，不会每次都白试一遍。
   */
  Sfx(key, opts = {}) {
    const spec = FLARE_SFX[key];
    if (!spec || typeof this.host.Play !== "function") return null;
    const picked = this.sfxPick.get(key);
    const names = picked ? [picked] : spec.names;
    for (const name of names) {
      const played = this.host.Play(name, { volume: spec.volume, ...opts });
      if (played) { this.sfxPick.set(key, name); return name; }
    }
    return null;
  }

  Ground(x, z) { return Num(this.host.GroundHeight?.(x, z), 0); }

  // -------------------------------------------------------------------------
  // 取证
  // -------------------------------------------------------------------------

  /** 一枚的脱敏快照。回调与句柄一律不外泄。 */
  ViewOf(flare) {
    return {
      id: flare.id,
      presetId: flare.presetId,
      label: flare.label,
      phase: flare.phase,
      t: flare.t,
      x: flare.pos.x, y: flare.pos.y, z: flare.pos.z,
      agl: flare.agl,
      level: flare.level,
      brightness: flare.brightness,
      intensity: flare.intensity,
      radius: flare.lightRadiusM,
      color: flare.lightColor,
      beats: flare.beats.map((b) => b.name),
    };
  }

  /** 给渲染层与 HUD 的脱敏快照。天上没有东西时返回 null。 */
  View() {
    if (!this.flares.length) return null;
    return {
      active: true,
      count: this.flares.length,
      brightness: this.Brightness,
      sightScale: this.sightScale,
      flares: this.flares.map((f) => this.ViewOf(f)),
    };
  }

  /** 取证口（Debug.Flare / 冒烟断言读它）。 */
  State() {
    return {
      view: this.View(),
      sightScale: this.sightScale,
      exposure: this.exposure,
      pending: this.queue.map((q) => ({ ticket: q.ticket, atS: q.atS, preset: q.spec.preset ?? null })),
      clock: this.clock,
      stats: { ...this.stats },
      lastFlare: this.lastFlare ? { ...this.lastFlare } : null,
      sfx: Object.fromEntries(this.sfxPick),
      presets: Object.keys(FLARE_PRESETS),
    };
  }
}

// ===========================================================================
// 宿主适配器
//
// 把本层的纯数字翻给 `Script_Light` 的火光池、`Script_Vfx` 的烟源、
// `Script_Audio`、`Script_Ai`。**这里也不 import three** —— 那三个消费者
// 都只读 `position.x/y/z`，给纯对象就行（Script_Main 给 emplacement 包
// THREE.Vector3 是历史写法，不是接口要求）。
//
// 取的全是取值器：`ai` 每关重建、`story` 每关换一份，拷值出去会指到上一关。
// ===========================================================================

/**
 * @param {object} deps
 *   lights          LightRig（AddFire / UpdateFire / RemoveFire）
 *   vfx             VfxSystem（SmokeSource / MoveSmokeSource / RemoveSmokeSource）
 *   audio / hud     照旧
 *   Time()          关内秒表
 *   Ai()            AiDirector（SetSightScale）
 *   Story()         StoryDirector（Signal）
 *   Battlefield()   战场（GroundHeight）
 *   Player()        玩家（音效定位）
 */
export function MakeFlareHost(deps = {}) {
  return {
    Time: () => deps.Time?.() ?? 0,
    Play: (name, opts = {}) => deps.audio?.Play(name, opts) ?? null,
    Hint: (text, seconds) => deps.hud?.Hint(text, seconds),
    Say: (who, text, seconds) => deps.hud?.Say(who, text, seconds),
    Signal: (name) => deps.Story?.()?.Signal(name),
    GroundHeight: (x, z) => deps.Battlefield?.()?.GroundHeight(x, z) ?? 0,
    // 灯：走火光池现有的固定预算，castShadow 恒 false，不新建阴影管线。
    AddLight: (spec) => deps.lights?.AddFire(spec.position, {
      intensity: spec.intensity, radius: spec.radius, color: spec.color,
      flicker: false, priority: spec.priority ?? 1.6,
    }) ?? null,
    MoveLight: (handle, spec) => deps.lights?.UpdateFire(handle, spec),
    RemoveLight: (handle) => deps.lights?.RemoveFire(handle),
    // 烟：一条**很淡**的微烟迹。照明弹的烟在夜里几乎看不见，它的作用是给光球
    // 一条拖尾，让「它在往下飘」这件事读得出来 —— 所以 opacity 压得很低。
    AddSmoke: (spec) => deps.vfx?.SmokeSource(spec.position, {
      kind: "dust", rate: spec.rate, radius: 0.22, rise: 0.6,
      sizeStart: 0.28, sizeEnd: 1.9, life: 3.4, opacity: 0.11, fire: 0,
    }) ?? null,
    MoveSmoke: (handle, position) => deps.vfx?.MoveSmokeSource(handle, position),
    RemoveSmoke: (handle) => deps.vfx?.RemoveSmokeSource(handle),
    // 暴露：**只乘一个全局倍率**，不动 SIGHT_BY_STANCE 那张表 ——
    // 站/蹲/卧三档的比例原样保住（见文件头）。
    SetSpotting: (scale) => deps.Ai?.()?.SetSightScale(scale),
    PlayerPos: () => {
      const player = deps.Player?.();
      return player ? { x: player.position.x, y: player.position.y, z: player.position.z } : null;
    },
  };
}

export default FlareDirector;
