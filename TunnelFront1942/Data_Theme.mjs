// 《地下长城 · 冀中1942》 —— 视觉编码唯一常量源（颜色 / 形状 / 图标字符 / 层混合参数）。
// 契约（AGENTS.md §六.8）：全项目除本文件与 Style_Game.css 外不得出现字面量色值；
// Style_Game.css 的语义色必须与此处一致（Script_Ui 启动时会把 CssVars() 打到 :root，
// CSS 一律 var(--tf-*, 同值兜底) 引用）。
// 红线（§一.3）：代价账本与结算评级只用中性灰白——ui.ledger 一组内禁止绿色/金色。
// 纯常量模块：无 DOM / 无 three 依赖，可在 node 中导入做 grep 与一致性检查。

export const theme = Object.freeze({
  // ---------------------------------------------------------------- 场景与光照
  scene: Object.freeze({
    background: "#101216",       // 画布底色（近黑蓝灰）
    ambient: "#9aa0ae",
    ambientIntensity: 1.55,      // 白盒要平亮可读，接近平涂
    sun: "#fff2dc",
    sunIntensity: 1.7,
    hemiSky: "#c3cad4",
    hemiGround: "#5a5246",
    hemiIntensity: 0.8,
  }),

  // ---------------------------------------------------------------- 地表层
  surface: Object.freeze({
    // 地形：color 顶面色；height 挤出高度（世界单位）
    terrains: Object.freeze({
      village: Object.freeze({ color: "#b3906d", height: 0.5, label: "村庄" }),
      field:   Object.freeze({ color: "#7a9455", height: 0.4, label: "农田（青纱帐）" }),
      woods:   Object.freeze({ color: "#49664a", height: 0.44, label: "树林" }),
      grave:   Object.freeze({ color: "#8d8698", height: 0.4, label: "坟地" }),
      river:   Object.freeze({ color: "#4f7391", height: 0.16, label: "河沟" }),
      open:    Object.freeze({ color: "#c2b48f", height: 0.34, label: "开阔地" }),
      road:    Object.freeze({ color: "#c2b48f", height: 0.34, label: "开阔地" }), // 兜底：road 应是旗标而非地形
    }),
    sideShade: 0.52,             // 侧壁 = 顶面色 × 该系数（顶点色实现）
    grid: "#15171b",             // 六角网格线
    roofWire: "#d8d5cc",         // 地下态的屋顶线框
    road: "#6b5d4c",             // 路面条带
    roadBroken: "#b6423a",       // 断路标记（红）
    bridge: "#8a6f4d",           // 桥面
    burnt: "#3a3330",            // 被焚房屋
    props: Object.freeze({
      house: Object.freeze({ color: "#cfc5b2", roof: "#7d7268" }),
      tree:  Object.freeze({ color: "#3b543c", trunk: "#5c4a37" }),
      grave: Object.freeze({ color: "#9c95a8" }),
      crop:  Object.freeze({ color: "#8aa35f" }),
      hqBanner: Object.freeze({ color: "#a63c2e" }),
    }),
  }),

  // ---------------------------------------------------------------- 地下层
  under: Object.freeze({
    depthY: -6,                  // 地下层世界高度（§六.2）
    floor: "#1a1c21",            // 地下底板
    cellPad: "#2b2e35",          // 地道格衬板
    cellEdge: "#3d4149",         // 衬板描边
    edgeTube: "#e09a3e",         // 段=发光管线（灯笼暖橙）
    edgeLine: "#a8853f",         // 地上态 15% 亮度拓扑线的基色
    shaft: "#e09a3e",            // 入口竖井指示线
    doorOpen: "#79b6a8",         // 隔断门（开）
    doorClosed: "#c25b4a",       // 隔断门（关）
    smoke: "#b8b08e",            // 烟（黄灰）
    ventPole: "#e6e6e2",         // 通风口白色竖杆（两层可见）
    facilities: Object.freeze({
      storage:   Object.freeze({ color: "#b9995e", label: "储", name: "储粮洞" }),
      shelter:   Object.freeze({ color: "#7f9bb5", label: "藏", name: "藏人室" }),
      vent:      Object.freeze({ color: "#d8d8d2", label: "风", name: "通气孔（通风口）" }),
      fightpost: Object.freeze({ color: "#a05656", label: "枪", name: "射击孔" }),
      door:      Object.freeze({ color: "#8a7f6a", label: "门", name: "隔断门" }),
    }),
  }),

  // ---------------------------------------------------------------- 入口色环（暴露三档）
  entrance: Object.freeze({
    ringSafe: "#57a35f",         // 绿：暴露比 < tiers.safeBelow
    ringWarn: "#d4b13f",         // 黄：介于两者
    ringDanger: "#c04938",       // 红：known（达到阈值）
    ringSealed: "#66686c",       // 灰：被封堵/自毁
    tiers: Object.freeze({ safeBelow: 1 / 3 }),   // 显示分档规则（展示层映射，非规则运算）
  }),

  // ---------------------------------------------------------------- 单位（形状+色+字符）
  units: Object.freeze({
    militia:   Object.freeze({ side: "ally", shape: "box",       color: "#a63c2e", label: "民", name: "民兵组" }),
    guerrilla: Object.freeze({ side: "ally", shape: "cylinder",  color: "#c14b2f", label: "游", name: "游击班" }),
    runner:    Object.freeze({ side: "ally", shape: "sphere",    color: "#d3764a", label: "联", name: "联络员" }),
    inf:       Object.freeze({ side: "enemy", shape: "cone",     color: "#6a6f52", label: "日", name: "日军班" }),
    puppet:    Object.freeze({ side: "enemy", shape: "coneShort", color: "#8a8a7a", label: "伪", name: "伪军队" }),
    spy:       Object.freeze({ side: "enemy", shape: "disc",     color: "#5d5546", label: "特", name: "特务",
                               civilianColor: "#9a938a", civilianLabel: "众" }),
    sapper:    Object.freeze({ side: "enemy", shape: "coneBox",  color: "#55604f", label: "工", name: "工兵班" }),
    civilian:  Object.freeze({ side: "enemy", shape: "disc",     color: "#9a938a", label: "众", name: "行人（身份不明）" }),  // 未识破特务的示人形态（DeriveView 给出）
    ghost: "#7d7f83",            // 虚影（最后已知位置）
    hiddenOpacity: 0.55,
    actedShade: 0.55,            // 已行动单位颜色乘数
    labelText: "#f2efe6",
    labelStroke: "#17181c",
  }),

  // ---------------------------------------------------------------- 格上徽记（§六.3）
  badges: Object.freeze({
    atlasBase: "#ffffff",        // 字形图集基色（白绘、经顶点色乘染，勿改）
    beadHollow: "#8f8f8f",       // 暴露豆（空心灰）
    beadFilled: "#c04938",       // 暴露豆（红实心）
    traceDot: "#b3874a",         // 挖掘痕迹（土黄小点）
    digRing: "#d8d2c0",          // 挖掘进度环
    ambush: "#8f6fc0",           // 伏击紫环
    smoke: "#b8b08e",            // 烟徽记
    searched: "#77716a",         // 已搜过
    attackSite: "#a34a3e",       // 曾发生袭击
    hq: "#e3ddcf",               // 区队部「部」
    intent: "#d0812f",           // 意图箭头（橙虚线）
    intentUnknown: "#d0812f",    // 机动队响应首回合「?」
  }),

  // ---------------------------------------------------------------- 交互高亮
  // 可达/路径必须在麦田米色（#c2b48f）、青纱帐绿（#7a9455）、树林深绿（#49664a）、
  // 坟地灰紫（#8d8698）、村庄土褐（#b3906d）与地下近黑（#1a1c21）上都一眼可辨——
  // 故一律走「冷青蓝」这条地形里不存在的色相，并且每格都描粗边（不靠低透明度覆膜）。
  highlight: Object.freeze({
    selection: "#e8e4d8",        // 选中脉冲环
    hover: "#f4efe2",            // 悬停轮廓（提亮到近白，配 hoverWidth 带宽）
    hoverWidth: 0.055,           // 悬停轮廓带宽（世界单位；不再用 1px LineBasicMaterial）

    // 可达一档：走到该格仍有剩余 MP（还能接着走）——亮青覆膜「提亮」地形
    reachable: "#5fdcef",
    reachableEdge: "#aef4fd",    // 描边（青白，六边形轮廓）
    reachableOpacity: 0.24,      // 覆膜压低靠描边立信息：地形本色仍要读得出
    // 可达二档：走到该格正好走满 MP（本回合到此为止）——深青覆膜「压暗」地形，与一档反向
    reachableSpent: "#123c4e",
    reachableSpentEdge: "#59a0b8",
    // 目标模式（挖掘等）：琥珀色另一套视觉语言，与「能走到」区分
    target: "#c88a34",
    targetEdge: "#f0c274",
    edgeWidth: 0.075,            // 可达格描边带宽（世界单位）
    edgeOpacity: 0.95,
    edgePulse: 0.22,             // 描边呼吸幅度（0=不呼吸）

    path: "#f4efe0",             // 路径预览主色（暖白管线）
    pathRisk: "#d08030",         // 风险段（橙）
    pathRadius: 0.075,           // 路径管半径（世界单位）
    pathArrow: "#fffaf0",        // 路径方向箭头
    dest: "#ffe4a3",             // 目的地落点环（暖黄，与青色可达膜互补）
    destRisk: "#e08a3c",         // 目的地落点环（该路线带风险时）
    costText: "#f6f2e6",         // 代价牌文字
    costBg: "rgba(17, 19, 23, 0.90)",   // 代价牌底
    focus: "#d0812f",            // 播报聚焦脉冲
  }),

  // ---------------------------------------------------------------- 层混合（§六.1/2）
  layerMix: Object.freeze({
    switchMs: 200,               // Q 切层补间
    peekMs: 120,                 // Space 窥视补间
    surfaceOpacityUnder: 0.25,   // 地下态：地上 25% 透明屋顶线框
    underBrightnessSurface: 0.15,// 地上态：地下 15% 亮度拓扑线
    peekSurfaceOpacity: 0.45,    // 窥视：地上压暗
    peekUnderBrightness: 0.9,    // 窥视：地下提亮
    surfaceUnitsUnderOpacity: 0.35,
  }),

  // ---------------------------------------------------------------- HUD（CSS 同步用）
  ui: Object.freeze({
    bg: "#14161a",
    panel: "rgba(24, 26, 31, 0.92)",
    panelBorder: "#3a3f47",
    text: "#d8d5cc",
    textDim: "#8f8c84",
    textFaint: "#5f5c55",
    line: "#2a2d33",
    danger: "#c04938",
    warn: "#c77b3f",
    ally: "#b8442f",
    enemy: "#8a8a7a",
    toastBg: "rgba(20, 22, 26, 0.94)",
    hintBorder: "#6f87a0",
    buttonReady: "#4a5a6a",      // 结束回合可用态
    buttonHold: "#6a5636",       // 有待办（琥珀但非金：低饱和土棕）
    buttonBusy: "#33363c",       // 敌军行动中
    // 代价账本：中性灰白，禁绿/金/加号（红线 §一.3）
    ledger: Object.freeze({
      bg: "rgba(28, 30, 34, 0.92)",
      border: "#4a4c50",
      title: "#b9b6ae",
      text: "#cfcdc6",
      value: "#e4e2da",
    }),
  }),
});

/** 供 Script_Ui 打到 :root 的 CSS 变量表（Style_Game.css 以 var(--tf-*, 兜底) 引用）。 */
export function CssVars() {
  const ui = theme.ui;
  return {
    "--tf-reach-edge": theme.highlight.reachableEdge,
    "--tf-path-risk": theme.highlight.pathRisk,
    "--tf-bg": ui.bg,
    "--tf-panel": ui.panel,
    "--tf-panel-border": ui.panelBorder,
    "--tf-text": ui.text,
    "--tf-text-dim": ui.textDim,
    "--tf-text-faint": ui.textFaint,
    "--tf-line": ui.line,
    "--tf-danger": ui.danger,
    "--tf-warn": ui.warn,
    "--tf-ally": ui.ally,
    "--tf-enemy": ui.enemy,
    "--tf-toast-bg": ui.toastBg,
    "--tf-hint-border": ui.hintBorder,
    "--tf-btn-ready": ui.buttonReady,
    "--tf-btn-hold": ui.buttonHold,
    "--tf-btn-busy": ui.buttonBusy,
    "--tf-ledger-bg": ui.ledger.bg,
    "--tf-ledger-border": ui.ledger.border,
    "--tf-ledger-title": ui.ledger.title,
    "--tf-ledger-text": ui.ledger.text,
    "--tf-ledger-value": ui.ledger.value,
  };
}

/** 入口/通风口暴露三档：展示层映射（数据本身由 DeriveView 明牌给出）。 */
export function EntranceTier(entry) {
  if (!entry) return "safe";
  if (entry.sealed) return "sealed";
  if (entry.known) return "danger";
  const threshold = Math.max(1, (entry.conceal ?? 2) * 3);
  const ratio = (entry.expose ?? 0) / threshold;
  return ratio < theme.entrance.tiers.safeBelow ? "safe" : "warn";
}

/** 三档 → 色。 */
export function EntranceTierColor(tier) {
  if (tier === "danger") return theme.entrance.ringDanger;
  if (tier === "warn") return theme.entrance.ringWarn;
  if (tier === "sealed") return theme.entrance.ringSealed;
  return theme.entrance.ringSafe;
}
