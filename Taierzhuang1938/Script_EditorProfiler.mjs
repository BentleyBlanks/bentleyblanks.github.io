// Profiler：编辑器「渲染调试（可叠加）」组的叠加工具，不接管相机、不暂停玩法。
//
// 设置面板里就是一颗开关，**没有页面内面板**（用户点名去掉的）：唯一的读数界面
// 是 window.open 的独立窗口 —— 游戏拿着指针锁的时候页面内面板既点不到也挡画面，
// 独立窗口可以拖到第二块屏上边玩边看，掉帧发生的那一刻图上就有现场。
// 窗口没有自己的脚本 —— 每帧的 DOM 更新由本 overlay 的 Update(dt) 从游戏侧推过去
//（editor.UpdateOverlays 在每一条帧路径上都会调它），点击/滚轮/按键的处理函数
// 也挂在这边、直接重画。弹窗被拦截时 Enter 直接抛错，ToggleOverlay 会收掉这次开启
//（开关弹回），不留一个「开着却什么都看不见」的状态。
//
// 计时内核在 Script_Profiler（Enter 时 Enable、Exit 时 Disable，钩子全还原），
// 表格的分层与排版在 Script_ProfilerReport（与命令行 Script_ProfileCli 同一份口径），
// 函数级采样在 Script_ProfilerSampler。
//
// ## 第四版界面（2026-10-14，用户：「看起来很全其实不够细，也不够美观；对标 UE 的 Profiler」）
// 旧版是一张 3300 像素高的长页：表一张接一张往下堆，看不出这一帧卡在哪边。现在照 Unreal
// Insights 的分区排：
//   · **读数条**（stat unit）：fps / 整帧 / 逻辑 / 渲染提交 / GPU / 浏览器侧 / 机器忙闲，
//     最后一格直接写结论「卡在 CPU · 渲染提交」；下面一行预算、超预算比例、掉 vsync、卡顿次数。
//   · **帧图**：按根桶堆叠 + 浏览器侧 + GPU 折线 + **预算线**；顶上一条事件道（阶段、爆炸、
//     阵亡、补兵、降档、现编、GC、顶出纵轴），底下一条机器忙闲道；非游戏帧（暂停/菜单/加载）
//     灰底，默认不进汇总。计数器可以叠画在帧图上（计数器页点一行）。
//   · **时间轴**：选中一帧时出现在帧图下面（Insights 的 Timing 视图）。
//   · **页签**：计时（CPU 树表，可折叠）/ GPU / 渲染统计 / 计数器 / 事件 / Draw 清单 / 函数采样 /
//     场景普查 / 取证与导出。只刷新正在看的那一页 —— 面板自己的开销记在 overlay 桶里，
//     每多刷一张看不见的表都是白花的。
// 外观跟游戏的设置页同一套（Style_Menu.css 的声音页）：暗色渐变底、象牙白字、橄榄灰细线、
// 左侧金边选中条、宽字距的分组标题、衬线大标题、直角控件、金色 5 px 小方块开关。
// **不要**换成通用的现代编辑器皮（用户 10-13 否过一次）。
//
// ## 录制与回放（照 Unity Profiler）
// - 工具条：录制 / 暂停（空格）、清空、逐帧 ◀ ▶（←/→，Shift 一次十帧）、上/下一个尖峰（[ / ]）、
//   最新（End / Esc / 双击帧图：回到实时跟随）、缓冲帧数、只看游戏帧、目标帧率、保存 / 加载录制（JSON）。
// - 帧图：点一帧 = 选中这一帧，拖动 = 选一段；滚轮缩放、Shift+滚轮平移，下面的全缓冲缩略条可以直接拖。
//   选中后视窗不再跟着新帧滚（录制照常进行），「最新」回到跟随。
// - 选中一帧：表换成**这一帧**的数（ms / 占比 / 调用次数），帧图下出时间轴 ——
//   每一对 B/E 一条（`ai/act` 一个兵一条），GPU 分段另占一行；滚轮缩放、拖动平移、点一条
//  （或点表格里的一行）高亮同名的所有实例。
// - 选中一段：表是这一段的 avg / 中位 / p95 / max，取证页是这一段里最差的那一帧。
//
// ## 自身开销
// 记在「编辑器叠加层（含本面板）」桶里：帧图有新数据时每 3 帧一画、读数条与当前页 0.5 s 一刷
//（暂停或看选区时不刷）、取证/普查/计数器曲线 1 s 一刷（用 buckets:false 的便宜汇总）。

import { CpuRows, GpuRows, CPU_LABELS, GPU_NOTES, SHADOW_NOTE, WorstLine, EventsLine, FormatSnapshot,
  FormatFrameTimeline, FormatDrawCapture, FormatSampler, RootOf, MARK_KINDS, STATE_LABELS, Bottleneck,
  BusyLine, StateLine, RenderStatRows, GroupDraws, MarkLabel } from "./Script_ProfilerReport.mjs";
import { SAMPLE_STRIDE, GPU_SEG_STRIDE, IsLiveFrame, IsActiveFrame, FrameStateOf, PRESSURE_LABELS,
  HITCH_MINOR_MS, COUNTER_EVERY } from "./Script_Profiler.mjs";
import { SamplerSupport, JsSampler, FoldTrace, SAMPLE_SECONDS } from "./Script_ProfilerSampler.mjs";

// 帧图按根桶堆叠的颜色与叠放次序（自下而上）。没登记的根桶按名字散列取色、叠在最上面。
// 数据色不跟界面色走（界面是金/象牙/橄榄），要的是相邻两层一眼分得开。
const ROOT_COLORS = {
  input: "#3f7f8f",
  player: "#4f9cb0",
  viewmodel: "#69bac6",
  ai: "#5a82c4",
  physics: "#c98a4a",
  combat: "#c2654f",
  vfx: "#cfb05a",
  story: "#8b7cc8",
  spawn: "#a191d2",
  streamer: "#a88b63",
  hud: "#b5759f",
  overlay: "#6f7268",
  gi: "#9bbf62",
  frameSetup: "#5f9f72",
  matrix: "#73b578",
  firstPersonShadow: "#7aa96e",
  actorBatch: "#8cc788",
  post: "#4c9361",
  other: "#4d5048",
};
const ROOT_ORDER = Object.keys(ROOT_COLORS);
const BROWSER_COLOR = "#26282a";
const GPU_LINE = "#e3a4d6";
const BUDGET_COLOR = "#edca83";
const CAPACITY_CHOICES = [300, 900, 1800, 3600, 7200];
const TARGET_CHOICES = [0, 30, 60, 100, 120, 144];

const TABS = [
  { id: "cpu", label: "计时", title: "CPU 主线程逐系统（Insights 的 Timers）：树表，点三角折叠，点一行在时间轴上高亮" },
  { id: "gpu", label: "GPU", title: "GPU 逐 pass（stat gpu）：GPU 耗时、提交 CPU、draw、三角" },
  { id: "render", label: "渲染统计", title: "逐 pass 的材质切换、程序切换、变体重算、实例、每个 draw 多少微秒（stat scenerendering / rhi）" },
  { id: "counters", label: "计数器", title: "人物、粒子、刚体、着色器、内存……随时间变化（Insights 的 Counters）；点一行叠画到帧图上" },
  { id: "events", label: "事件", title: "阶段切换、爆炸、阵亡、补兵、自动降档、现编着色器、GC（Insights 的 Bookmarks / Log）" },
  { id: "draws", label: "Draw 清单", title: "抓一帧逐 draw 的清单，按 pass / 子树 / 材质分组（GPU Visualizer 的逐 draw 事件）" },
  { id: "sampler", label: "函数采样", title: "JS 函数级采样：哪个函数最费时、按桶归属（Insights 的 CPU 采样）" },
  { id: "census", label: "场景普查", title: "scene 顶层子树的节点、骨骼、网格、蒙皮、隐藏节点" },
  { id: "export", label: "取证与导出", title: "最差一帧的归因、事件统计、环境、导出快照" },
];

function ColorOf(root) {
  const known = ROOT_COLORS[root];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < root.length; i += 1) hash = (hash * 31 + root.charCodeAt(i)) | 0;
  return `hsl(${((hash % 360) + 360) % 360}, 32%, 56%)`;
}

function Tail(key) {
  const cut = key.lastIndexOf("/");
  return cut < 0 ? key : key.slice(cut + 1);
}

function BusyColor(factor) {
  if (!(factor > 0)) return null;
  if (factor >= 1.6) return "#c4574c";
  if (factor >= 1.25) return "#c9a24f";
  return "#5f7a5a";
}

const POPUP_CSS = `
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; overflow: hidden;
         background: radial-gradient(120% 70% at 0% 0%, #1b1d18 0%, #0c0e0d 55%, #070808 100%);
         color: #deddd2; font: 12px/1.55 var(--ui-font); letter-spacing: .02em; }
  .mono, td, .num { font-family: var(--ui-mono); font-variant-numeric: tabular-nums; letter-spacing: 0; }
  button, select, input { font: inherit; }

  /* --- 抬头 --- */
  .top { flex: 0 0 auto; display: flex; align-items: flex-end; gap: 18px; padding: 16px 22px 10px;
         border-bottom: 1px solid #c1bdab55; }
  .top .eyebrow { color: #aaa99b; font-size: 11px; letter-spacing: .24em; margin-bottom: 2px; }
  .top h1 { margin: 0; font: 700 23px/1.2 var(--ui-story-font); letter-spacing: .14em; color: #eeeee7; }
  .badges { margin-left: auto; display: flex; gap: 14px; color: #8f9083; font-size: 11px; letter-spacing: .08em; }
  .badges span::before { content: ""; display: inline-block; width: 5px; height: 5px; margin: 0 7px 2px 0; background: #5f6157; }
  .badges span.on::before { background: #e6cb91; }
  .badges span.on { color: #c9c6b2; }

  /* --- 工具条 --- */
  .toolbar { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 22px;
             border-bottom: 1px solid #c1bdab30; background: #0a0b0a8c; }
  .toolbar .sep { width: 1px; height: 22px; background: #c1bdab30; margin: 0 6px; }
  .btn { min-height: 28px; padding: 2px 12px; border: 1px solid #c1bdab40; background: #13140b44; color: #b8b7aa;
         letter-spacing: .08em; cursor: pointer; border-radius: 0; }
  .btn:hover:not(:disabled) { border-color: #cdb77b88; color: #ecd39c; background: linear-gradient(90deg, #d8d4c31c, #bbb7a906); }
  .btn:disabled { opacity: .35; cursor: default; }
  .btn.rec { color: #e98b80; border-color: #8a3f3866; }
  .btn.rec::before { content: ""; display: inline-block; width: 7px; height: 7px; margin: 0 8px 1px 0; background: #e05a4c; border-radius: 50%; }
  .btn.paused { color: #e6cb91; border-color: #cdb77b88; }
  .btn.switch::before { content: ""; display: inline-block; width: 5px; height: 5px; margin: 0 8px 2px 0; background: #6a6c61; }
  .btn.switch[aria-checked="true"] { color: #e6cb91; border-color: #cdb77b88; }
  .btn.switch[aria-checked="true"]::before { background: #e6cb91; }
  .btn.primary { color: #edca83; border-color: #cdb77b88; }
  select.btn { padding-right: 6px; }
  select.btn option { background: #101211; color: #deddd2; }
  #viewLabel { min-width: 230px; color: #eeeee7; text-align: center; font-family: var(--ui-mono); }
  .muted { color: #8f9083; }
  #statusLabel { margin-left: auto; color: #b9a46e; font-size: 11px; letter-spacing: .06em; }

  /* --- 读数条（stat unit）--- */
  .unit { flex: 0 0 auto; display: grid; grid-template-columns: 1.15fr repeat(6, 1fr) 1.9fr; border-bottom: 1px solid #c1bdab30; }
  .card { padding: 9px 14px 8px; border-left: 1px solid #c1bdab22; min-width: 0; }
  .card:first-child { border-left: 0; padding-left: 22px; }
  .card .k { color: #9d9c8f; font-size: 11px; letter-spacing: .18em; white-space: nowrap; }
  .card .v { color: #eeeee7; font: 500 22px/1.25 var(--ui-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .card .v small { font-size: 11px; color: #8f9083; margin-left: 3px; }
  .card .s { color: #8f9083; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card i.sw { display: inline-block; width: 7px; height: 7px; margin: 0 6px 1px 0; }
  .card.hot { border-left: 3px solid #edca83; background: linear-gradient(90deg, #d8d4c324, #bbb7a906); }
  .card.hot .v { color: #edca83; }
  .card.verdict .v { font: 600 17px/1.5 var(--ui-font); letter-spacing: .06em; color: #eeeee7; }
  .card.verdict.warn .v { color: #edca83; }
  .hitch { flex: 0 0 auto; padding: 5px 22px; color: #a9a89b; font-size: 11px; border-bottom: 1px solid #c1bdab22;
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hitch b { color: #deddd2; font-weight: normal; font-family: var(--ui-mono); }
  .hitch b.bad { color: #e2958b; }

  /* --- 帧图 --- */
  .graph { flex: 0 0 auto; padding: 8px 22px 4px; }
  canvas { display: block; width: 100%; background: #060707; }
  canvas.chart { cursor: crosshair; border: 1px solid #c1bdab30; }
  canvas.overview { cursor: ew-resize; border: 1px solid #c1bdab30; border-top: 0; }
  canvas.timeline { cursor: grab; border: 1px solid #c1bdab30; }
  .legend { color: #8f9083; font-size: 11px; margin: 5px 0 0; line-height: 1.8; }
  .legend i { display: inline-block; width: 8px; height: 8px; margin: 0 5px 0 12px; vertical-align: -1px; }
  .legend i:first-child { margin-left: 0; }
  .hint { color: #6f7064; font-size: 11px; letter-spacing: .04em; }
  .tlWrap { flex: 0 0 auto; padding: 4px 22px 6px; }
  .tlHead { display: flex; align-items: baseline; gap: 12px; margin: 2px 0 4px; }
  .tlHead .title { color: #e6cb91; letter-spacing: .14em; }

  /* --- 页签 --- */
  .tabs { flex: 0 0 auto; display: flex; gap: 2px; padding: 0 22px; border-bottom: 1px solid #c1bdab55; }
  .tab { padding: 9px 14px 7px; border: 0; border-bottom: 2px solid transparent; background: none; color: #a5a497;
         letter-spacing: .16em; cursor: pointer; }
  .tab:hover { color: #e3d3a8; }
  .tab.on { color: #edca83; border-bottom-color: #edca83; background: linear-gradient(0deg, #d8d4c31c, transparent); }
  .tab em { font-style: normal; color: #77786c; margin-left: 5px; letter-spacing: 0; font-family: var(--ui-mono); }
  .body { flex: 1 1 auto; overflow: auto; padding: 10px 22px 24px; min-height: 0; }
  .page { display: none; }
  .page.on { display: block; }
  h2 { margin: 14px 0 6px; padding: 0 0 5px; border-bottom: 1px solid #c1bdab30; color: #aaa99b; font-size: 11px;
       font-weight: 400; letter-spacing: .2em; }
  h2:first-child { margin-top: 2px; }
  .note { color: #8f9083; font-size: 11px; margin: 6px 0; line-height: 1.7; }
  .note b { color: #deddd2; font-weight: normal; }

  /* --- 表 --- */
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 3px 10px; white-space: nowrap; }
  th { color: #8f9083; font-weight: normal; font-size: 11px; letter-spacing: .1em; border-bottom: 1px solid #c1bdab30; }
  td { border-bottom: 1px solid #c1bdab14; color: #d9d8cc; }
  th:first-child, td:first-child { text-align: left; font-family: var(--ui-font); letter-spacing: .03em; }
  td.name { max-width: 520px; overflow: hidden; text-overflow: ellipsis; }
  td.name .tw { display: inline-block; width: 14px; color: #8f9083; cursor: pointer; }
  td.dim, tr.self td { color: #7f8075; }
  table.single th:nth-child(4), table.single td:nth-child(4) { display: none; }
  tr.row { cursor: pointer; border-left: 3px solid transparent; }
  tr.row:hover td { background: linear-gradient(90deg, #d8d4c312, transparent); }
  tr.focus td { background: linear-gradient(90deg, #d8d4c324, #bbb7a906); color: #edca83; }
  tr.focus td:first-child { box-shadow: inset 3px 0 0 #edca83; }
  tr.total td { border-top: 1px solid #c1bdab40; color: #eeeee7; }
  td.bar { width: 18%; min-width: 90px; padding-right: 0; }
  td.bar i { display: block; height: 3px; min-width: 1px; background: #d9bb7b; }
  td.bar.track { background: linear-gradient(#a4a59430, #a4a59430) center / 100% 3px no-repeat; }
  td canvas { display: inline-block; width: 160px; height: 22px; background: none; vertical-align: middle; }
  .chip { display: inline-block; margin: 0 6px 6px 0; padding: 2px 10px; border: 1px solid #c1bdab40; color: #a7a89e;
          cursor: pointer; letter-spacing: .06em; }
  .chip i { display: inline-block; width: 6px; height: 6px; margin: 0 7px 1px 0; }
  .chip.on { color: #e6cb91; border-color: #cdb77b88; background: linear-gradient(90deg, #d8d4c31c, transparent); }
  .kind { display: inline-block; min-width: 64px; }
  table.events th, table.events td { text-align: left; }
  table.events td:nth-child(1), table.events th:nth-child(1) { width: 80px; }
  table.events td:nth-child(2), table.events th:nth-child(2) { width: 90px; text-align: right; padding-right: 22px; }
  table.events td:nth-child(3), table.events th:nth-child(3) { width: 130px; }
  table.events td:nth-child(4) { font-family: var(--ui-font); white-space: normal; }
  table.draws td:last-child { max-width: 360px; overflow: hidden; text-overflow: ellipsis; text-align: left; }
  table.draws th:last-child { text-align: left; }
  .topActions { display: flex; gap: 4px; margin-left: 18px; }
  .topActions .act { background: none; border: 0; padding: 4px 8px; color: #d5d4ca; letter-spacing: .12em; cursor: pointer; }
  .topActions .act:hover { color: #ffe0a1; }
  .top #statusLabel ~ .badges { margin-left: 18px; }
  .top #statusLabel { margin-left: auto; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kind i { display: inline-block; width: 6px; height: 6px; margin: 0 7px 1px 0; }
  .worst { border-left: 3px solid #c4574c; background: linear-gradient(90deg, #c4574c1a, transparent); padding: 8px 12px;
           font-family: var(--ui-mono); font-size: 11px; line-height: 1.8; color: #deddd2; white-space: pre-wrap; }
  .kv { display: grid; grid-template-columns: 160px 1fr; gap: 2px 16px; font-size: 12px; }
  .kv div:nth-child(odd) { color: #8f9083; letter-spacing: .08em; }
  .kv div:nth-child(even) { font-family: var(--ui-mono); color: #deddd2; word-break: break-all; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
  textarea { width: 100%; height: 180px; margin-top: 8px; background: #060707; color: #a9a89b; border: 1px solid #c1bdab30;
             display: none; font: 11px var(--ui-mono); }
  .empty { color: #77786c; padding: 18px 0; letter-spacing: .06em; }
  .tip { position: fixed; z-index: 10; pointer-events: none; display: none; white-space: pre;
         background: rgba(8, 9, 8, .96); color: #deddd2; border: 1px solid #c1bdab55; border-left: 3px solid #edca83;
         padding: 6px 10px; font: 11px/1.6 var(--ui-mono); max-width: 560px; }
`;

const CPU_HEADS = {
  live: ["系统", "avg", "中位", "p95", "max", "调用/帧", "单次", "矩阵访问", "分配KB", ""],
  frame: ["系统", "ms", "占主线程", "", "", "调用", "单次", "矩阵访问", "分配KB", ""],
};
const GPU_HEADS = {
  live: ["pass", "GPU avg", "GPU p95", "GPU max", "提交 CPU", "draw", "三角", ""],
  frame: ["pass", "GPU ms", "占 GPU", "", "提交 CPU", "draw", "三角", ""],
};

export class ProfilerEditor {
  static id = "profiler";
  static label = "Profiler";
  static hint = "独立窗口：卡在哪（逻辑/提交/GPU）、预算与卡顿、机器忙闲；录制回放、时间轴、渲染统计、计数器、事件、Draw 清单、函数采样；玩法照跑";
  // 关掉设置面板（回去打仗）不收这个叠加层 —— 量的就是战斗中的帧。
  // 停它：面板里再点一次开关，或直接关它的独立窗口（Update 会跟着自我关闭）。
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.win = null;
    this.doc = null;
    this.ui = null;          // 独立窗口里的节点引用
    this._frame = 0;
    this._tableAcc = 0;
    this._slowAcc = 0;
    this._census = null;
    this.tab = "cpu";

    // 帧图视窗：follow = 右端跟着最新帧；否则右端钉在 endId 这一帧。count = 视窗里几帧。
    this.view = { follow: true, count: 300, endId: 0 };
    this.sel = null;         // 选区 { first, last }（帧号，闭区间；一帧时两者相等）
    this._selSummary = null;
    this._liveSummary = null;
    this._chartRev = -1;     // 帧图按哪个 profiler.revision 画的
    this._layout = null;     // 帧图最近一次的几何（命中测试用）
    this._hover = -1;
    this._drag = null;
    this._overviewDrag = false;
    this._legendKey = "";
    this._liveStale = true;  // 实时表需要重算（暂停时只算一次）
    this._slowStale = true;
    this._worstId = null;
    this._focusKey = null;   // 表格与时间轴共同高亮的桶
    this._collapsed = new Set();   // CPU 树表里折起来的父桶
    this._plotCounter = -1;  // 叠画到帧图上的计数器下标
    this._eventKinds = null; // 事件页筛选（null = 全部）
    this._drawGroup = "top"; // Draw 清单按什么分组
    this._sampler = null;    // 进行中的采样 { sampler, endsAt, seconds }
    this._samplerResult = null;
    this._samplerSeconds = 10;
    // 时间轴视图：当前显示的帧号与缩放窗口（ms）
    this.tl = { id: null, start: 0, span: 1, layout: null, hover: null, drag: null };
  }

  Enter() {
    this.host.profiler?.Enable();
    this.OpenWindow();
    if (!this.win) {
      // 抛出去让 ToggleOverlay 收掉这次开启（开关弹回），别留一个瞎的 Profiler
      this.host.profiler?.Disable();
      throw new Error("Profiler 独立窗口被浏览器弹窗拦截，放行后再开");
    }
    return this;
  }

  Exit() {
    this._StopSampler(true);
    this.host.profiler?.Disable();
    if (this.win && !this.win.closed) { try { this.win.close(); } catch (error) { /* 已被用户关了 */ } }
    this.win = null;
    this.doc = null;
    this.ui = null;
  }

  // -------------------------------------------------------------------------
  // 独立窗口的骨架
  // -------------------------------------------------------------------------

  OpenWindow() {
    let win = null;
    try {
      win = window.open("", "tzProfiler",
        "width=1360,height=1080,menubar=no,toolbar=no,location=no");
    } catch (error) { win = null; }
    if (!win) { this.win = null; return; }
    this.win = win;
    const doc = win.document;
    this.doc = doc;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset='utf-8'>"
      + "<title>台儿庄：血战滕县 · 性能剖析</title></head><body></body></html>");
    doc.close();
    doc.body.className = "uiProfiler";
    // 从当前入口复制实际版本 URL，独立窗口与游戏共用同一套主题（字体与 --ui-* 变量）。
    const theme = document.querySelector("link[data-interface-theme]");
    if (theme) {
      const link = doc.createElement("link");
      link.rel = "stylesheet"; link.href = theme.href;
      doc.head.appendChild(link);
    }
    const style = doc.createElement("style");
    style.textContent = POPUP_CSS;
    doc.head.appendChild(style);

    const El = (tag, className, text) => {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      if (text) el.textContent = text;
      return el;
    };
    const Button = (parent, text, title, onClick, className = "btn") => {
      const button = El("button", className, text);
      if (title) button.title = title;
      // 点完把焦点还给页面：否则空格（录制/暂停快捷键）会再「按」一次这颗按钮。
      button.addEventListener("click", () => { button.blur(); if (this.ui) onClick(button); });
      parent.appendChild(button);
      return button;
    };
    const Sep = (parent) => parent.appendChild(El("span", "sep"));
    const body = doc.body;

    // --- 抬头 ---
    const top = El("div", "top");
    const titles = El("div");
    titles.appendChild(El("div", "eyebrow", "PROFILER · 台儿庄：血战滕县"));
    titles.appendChild(El("h1", "", "性能剖析"));
    top.appendChild(titles);
    const badges = El("div", "badges");
    const badgeGpu = El("span", "", "GPU 计时");
    const badgeSampler = El("span", "", "函数采样");
    const badgeBusy = El("span", "", "忙闲探针");
    const badgeSource = El("span", "", "实时");
    for (const badge of [badgeGpu, badgeSampler, badgeBusy, badgeSource]) badges.appendChild(badge);
    top.appendChild(badges);
    body.appendChild(top);

    // --- 工具条 ---
    const toolbar = El("div", "toolbar");
    const recBtn = Button(toolbar, "录制中", "空格：暂停 / 继续录制。暂停只停记录，钩子不拆，缓冲原样留着逐帧回看",
      () => this.TogglePause());
    Button(toolbar, "清空", "清掉缓冲里的全部帧", () => this.ClearHistory());
    Sep(toolbar);
    const firstBtn = Button(toolbar, "⏮", "Home：缓冲里最老的一帧", () => this.SelectIndex(0));
    const prevBtn = Button(toolbar, "◀", "←：上一帧（Shift 一次十帧）", () => this.Step(-1));
    const viewLabel = El("span", "", "实时");
    viewLabel.id = "viewLabel";
    toolbar.appendChild(viewLabel);
    const nextBtn = Button(toolbar, "▶", "→：下一帧（Shift 一次十帧）", () => this.Step(1));
    const latestBtn = Button(toolbar, "最新", "End / Esc / 双击帧图：取消选中，帧图回到跟随最新帧", () => this.GoLatest());
    Sep(toolbar);
    Button(toolbar, "◀ 尖峰", "[：往前找下一个尖峰帧（间隔 ≥ 中位数×1.5 且多 4 ms 以上）", () => this.JumpSpike(-1));
    Button(toolbar, "尖峰 ▶", "]：往后找下一个尖峰帧", () => this.JumpSpike(1));
    Sep(toolbar);
    const capacity = El("select", "btn");
    capacity.title = "缓冲帧数（环形，满了从最老的丢）";
    for (const frames of CAPACITY_CHOICES) {
      const option = El("option", "", `${frames} 帧`);
      option.value = String(frames);
      capacity.appendChild(option);
    }
    capacity.addEventListener("change", () => { if (this.ui) this.SetCapacity(Number(capacity.value)); });
    toolbar.appendChild(capacity);
    const bufferLabel = El("span", "muted", "");
    toolbar.appendChild(bufferLabel);
    Sep(toolbar);
    const activeBtn = Button(toolbar, "只看游戏帧",
      "开着：汇总只算「游戏中 + 过场」帧，暂停/菜单/加载帧在帧图上灰底、不进统计（那份 20 fps 录制前 495 帧都是暂停空转）",
      () => this.SetActiveOnly(!this.host.profiler?.activeOnly), "btn switch");
    const target = El("select", "btn");
    target.title = "预算线与「超预算」按这个帧率算；「按屏幕」= 从帧间隔估出来的刷新率";
    for (const fps of TARGET_CHOICES) {
      const option = El("option", "", fps ? `目标 ${fps} fps` : "目标：按屏幕");
      option.value = String(fps);
      target.appendChild(option);
    }
    target.addEventListener("change", () => { if (this.ui) this.SetTargetFps(Number(target.value)); });
    toolbar.appendChild(target);
    const topActions = El("div", "topActions");
    Button(topActions, "保存录制", "整条缓冲存成 JSON（命令行 --print=<文件> --frame=<帧号> 也能读）",
      () => this.SaveRecording(), "act");
    const fileInput = El("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (file && this.ui) this.LoadRecordingFile(file);
    });
    topActions.appendChild(fileInput);
    Button(topActions, "加载录制", "读回一份保存过的录制（会停掉当前录制）", () => fileInput.click(), "act");
    const statusLabel = El("span", "", "");
    statusLabel.id = "statusLabel";
    top.insertBefore(statusLabel, badges);
    top.appendChild(topActions);
    body.appendChild(toolbar);

    // --- 读数条（stat unit）---
    const unit = El("div", "unit");
    const Card = (key, label, title) => {
      const card = El("div", `card ${key}`);
      card.title = title;
      const k = El("div", "k", label);
      const v = El("div", "v", "—");
      const s = El("div", "s", "");
      card.appendChild(k); card.appendChild(v); card.appendChild(s);
      unit.appendChild(card);
      return { card, k, v, s };
    };
    const cards = {
      fps: Card("fps", "帧率", "活动帧的平均帧率；下面是 1% low（最慢 1% 帧折成的帧率）"),
      frame: Card("frame", "整帧", "rAF 到 rAF 的间隔：avg，下面是 p95 / max"),
      game: Card("game", "逻辑", "主线程上不属于渲染提交的部分（AI、物理、剧情、玩家、特效……）—— UE stat unit 的 Game"),
      draw: Card("draw", "渲染提交", "RenderScene 里的 CPU：three 遍历场景、换材质、传 uniform、发 draw（post/matrix/阴影合批…）—— UE 的 Draw"),
      gpu: Card("gpu", "GPU", "GPU 计时合计（EXT_disjoint_timer_query）。读数接近提交 CPU 时只是提交时间的影子"),
      browser: Card("browser", "浏览器侧", "整帧间隔 − 主线程：样式/布局/合成与等 vsync"),
      busy: Card("busy", "机器忙闲", "Worker 里每半秒跑一段固定运算，比本机最快一次慢几倍；下面是系统 CPU 压力（Compute Pressure）"),
      verdict: Card("verdict", "结论", "每帧比一次：GPU 比整个主线程还长 = 卡在 GPU；否则看主线程里逻辑和提交谁大"),
    };
    body.appendChild(unit);
    const hitch = El("div", "hitch", "—");
    body.appendChild(hitch);

    // --- 帧图 + 全缓冲缩略条 ---
    const graph = El("div", "graph");
    const chart = El("canvas", "chart");
    chart.style.height = "196px";
    graph.appendChild(chart);
    const overview = El("canvas", "overview");
    overview.style.height = "24px";
    overview.title = "整条缓冲；框住的是帧图视窗，点/拖到哪里帧图就看哪里";
    graph.appendChild(overview);
    const legend = El("div", "legend");
    graph.appendChild(legend);
    graph.appendChild(El("div", "hint",
      "点一帧选中 · 拖动选一段 · 滚轮缩放 · Shift+滚轮平移 · 双击回到最新 ｜ ← → 逐帧 · [ ] 尖峰 · 空格 录制/暂停"));
    body.appendChild(graph);

    // --- 时间轴（选中单帧时出现）---
    const tlWrap = El("div", "tlWrap");
    const tlHead = El("div", "tlHead");
    const tlTitle = El("span", "title", "时间轴");
    const tlNote = El("span", "hint", "");
    tlHead.appendChild(tlTitle);
    tlHead.appendChild(tlNote);
    tlWrap.appendChild(tlHead);
    const timeline = El("canvas", "timeline");
    timeline.style.height = "120px";
    timeline.style.display = "none";
    tlWrap.appendChild(timeline);
    body.appendChild(tlWrap);

    // --- 页签 ---
    const tabsBar = El("div", "tabs");
    const tabButtons = new Map();
    const pages = new Map();
    const pageBody = El("div", "body");
    for (const tab of TABS) {
      const button = El("button", "tab", tab.label);
      button.title = tab.title;
      const count = El("em", "", "");
      button.appendChild(count);
      button.addEventListener("click", () => { button.blur(); if (this.ui) this.SetTab(tab.id); });
      tabsBar.appendChild(button);
      tabButtons.set(tab.id, { button, count });
      const page = El("div", "page");
      pages.set(tab.id, page);
      pageBody.appendChild(page);
    }
    body.appendChild(tabsBar);
    body.appendChild(pageBody);

    const MakeTable = (parent, heads) => {
      const table = El("table");
      const tr = El("tr");
      const cells = [];
      for (const text of heads) {
        const th = El("th", "", text);
        cells.push(th);
        tr.appendChild(th);
      }
      table.appendChild(tr);
      parent.appendChild(table);
      return { table, heads: cells };
    };

    // 计时（CPU）
    const cpuPage = pages.get("cpu");
    const cpuTitle = El("h2", "", "CPU · 主线程");
    cpuPage.appendChild(cpuTitle);
    const cpu = MakeTable(cpuPage, CPU_HEADS.live);
    cpuPage.appendChild(El("div", "note",
      "父行已含子行，缩进的「自身」= 父 − 子之和。「单次」= 桶耗时 ÷ 调用次数（ai/act 一个兵一次）。"
      + "「矩阵访问」是剖析期间包 Object3D 数出来的节点访问，开着剖析会让矩阵那一桶略慢。"));

    // GPU
    const gpuPage = pages.get("gpu");
    const gpuTitle = El("h2", "", "GPU · 逐 pass");
    gpuPage.appendChild(gpuTitle);
    const gpu = MakeTable(gpuPage, GPU_HEADS.live);
    const gpuNote = El("div", "note", "");
    gpuPage.appendChild(gpuNote);
    gpuPage.appendChild(El("div", "note", SHADOW_NOTE));

    // 渲染统计
    const renderPage = pages.get("render");
    renderPage.appendChild(El("h2", "", "渲染统计 · 逐 pass（每帧）"));
    const renderTable = MakeTable(renderPage, ["pass", "draw", "材质切换", "程序切换", "变体重算", "实例", "提交 CPU", "µs/draw", "三角", ""]);
    const renderTotals = El("div", "note", "");
    renderPage.appendChild(renderTotals);
    const renderNote = El("div", "note");
    renderPage.appendChild(renderNote);
    renderNote.innerHTML = (
      "<b>材质切换</b>：three 每换一只材质就把它的 uniform 整套重传一遍（灯光、阴影矩阵、AO……40–70 个），"
      + "这是主画面每个 draw 比预通道贵三四倍的原因。<b>程序切换</b>：useProgram 换人。"
      + "<b>变体重算</b>：同一只材质这次画用的 program 跟上次不一样（蒙皮/实例/合批之间共用的深度材质会来回翻），"
      + "每次都要重走一遍 getParameters。<b>µs/draw</b> = 提交 CPU ÷ draw。");

    // 计数器
    const counterPage = pages.get("counters");
    counterPage.appendChild(El("h2", "", `计数器（每 ${COUNTER_EVERY} 帧取一次；点一行叠画到帧图上，再点取消）`));
    const counterTable = MakeTable(counterPage, ["计数器", "分组", "当前", "avg", "min", "max", "曲线（缓冲内）"]);

    // 事件
    const eventPage = pages.get("events");
    eventPage.appendChild(El("h2", "", "事件（缓冲内；点一行定位到那一帧）"));
    const eventChips = El("div");
    eventPage.appendChild(eventChips);
    const eventTable = MakeTable(eventPage, ["帧", "时刻", "类别", "内容"]);
    eventTable.table.classList.add("events");

    // Draw 清单
    const drawPage = pages.get("draws");
    drawPage.appendChild(El("h2", "", "Draw 清单（抓一帧里的每一个 draw）"));
    const drawActions = El("div", "actions");
    Button(drawActions, "抓下一帧", "下一帧把每个 draw 的 pass / 物体 / 顶层子树 / 材质 / 三角 / 实例记下来（只记这一帧）",
      () => this.CaptureDraws(), "btn primary");
    const drawGroupBtns = new Map();
    for (const [key, label] of [["pass", "按 pass"], ["top", "按顶层子树"], ["material", "按材质"], ["object", "按物体"]]) {
      const chip = El("span", "chip", label);
      chip.addEventListener("click", () => { if (!this.ui) return; this._drawGroup = key; this.RefreshPage(true); });
      drawActions.appendChild(chip);
      drawGroupBtns.set(key, chip);
    }
    const drawStatus = El("span", "muted", "");
    drawActions.appendChild(drawStatus);
    drawPage.appendChild(drawActions);
    const drawTable = MakeTable(drawPage, ["", "draw", "材质", "换材质", "三角", "实例", "CPU µs", "pass"]);
    drawTable.table.classList.add("draws");
    drawPage.appendChild(El("div", "note",
      "「换材质」= 这一组里有几个 draw 跟前一个 draw 不是同一只材质（每次都要整套重传 uniform）。"
      + "「CPU µs」是逐 draw 前后读表的和；页面不隔离时计时精度只有 0.1 ms，单个 draw 读数不可信、合计可信。"));

    // 函数采样
    const samplerPage = pages.get("sampler");
    samplerPage.appendChild(El("h2", "", "函数采样（浏览器 JS Self-Profiling）"));
    const samplerSupport = El("div", "note", "");
    samplerPage.appendChild(samplerSupport);
    const samplerActions = El("div", "actions");
    const samplerSeconds = El("select", "btn");
    for (const seconds of SAMPLE_SECONDS) {
      const option = El("option", "", `${seconds} 秒`);
      option.value = String(seconds);
      samplerSeconds.appendChild(option);
    }
    samplerSeconds.value = String(this._samplerSeconds);
    samplerSeconds.addEventListener("change", () => { this._samplerSeconds = Number(samplerSeconds.value) || 10; });
    samplerActions.appendChild(samplerSeconds);
    const samplerBtn = Button(samplerActions, "开始采样", "采这么多秒的 JS 调用栈（玩法照跑；采样本身有一点开销）",
      () => (this._sampler ? this._StopSampler(false) : this.StartSampler()), "btn primary");
    const samplerStatus = El("span", "muted", "");
    samplerActions.appendChild(samplerStatus);
    samplerPage.appendChild(samplerActions);
    const samplerResults = El("div");
    samplerPage.appendChild(samplerResults);

    // 场景普查
    const censusPage = pages.get("census");
    censusPage.appendChild(El("h2", "", "场景节点普查（scene 顶层子树，每秒一次，始终是实时的）"));
    const census = MakeTable(censusPage, ["子树", "节点", "骨骼", "网格", "蒙皮", "隐藏节点"]);

    // 取证与导出
    const exportPage = pages.get("export");
    const worstTitle = El("h2", "", "掉帧取证");
    exportPage.appendChild(worstTitle);
    const worst = El("div", "worst", "—");
    exportPage.appendChild(worst);
    const worstActions = El("div", "actions");
    const worstJump = Button(worstActions, "定位到这一帧", "在帧图上选中这一帧，看它的时间轴",
      () => { if (this._worstId != null) this.SelectFrame(this._worstId); });
    exportPage.appendChild(worstActions);
    const eventsTitle = El("h2", "", "事件统计");
    exportPage.appendChild(eventsTitle);
    const events = El("div", "note", "—");
    exportPage.appendChild(events);
    exportPage.appendChild(El("h2", "", "环境（录制文件里也存这一份）"));
    const envBox = El("div", "kv");
    exportPage.appendChild(envBox);
    exportPage.appendChild(El("h2", "", "导出"));
    const exportActions = El("div", "actions");
    const copyBox = El("textarea");
    copyBox.readOnly = true;
    const Dump = (text) => {
      copyBox.style.display = "block";
      copyBox.value = text;
      copyBox.focus();
      copyBox.select();
    };
    Button(exportActions, "导出快照 JSON", "与命令行同结构，Script_ProfileCli --print=<文件> 能读", () => Dump(this.SnapshotJson()));
    Button(exportActions, "导出文本表格", "与命令行同一份排版；选中单帧另附时间轴与 draw 清单", () => Dump(this.SnapshotText()));
    exportPage.appendChild(exportActions);
    exportPage.appendChild(copyBox);

    const tip = El("div", "tip");
    body.appendChild(tip);

    this.ui = {
      badgeGpu, badgeSampler, badgeBusy, badgeSource, cards, hitch,
      chart, overview, legend, timeline, tlWrap, tlTitle, tlNote, tip,
      recBtn, firstBtn, prevBtn, nextBtn, latestBtn, viewLabel, capacity, bufferLabel, statusLabel, activeBtn, target,
      tabButtons, pages,
      cpuTitle, cpuTable: cpu.table, cpuHeads: cpu.heads, gpuTitle, gpuTable: gpu.table, gpuHeads: gpu.heads, gpuNote,
      renderTable: renderTable.table, renderTotals, counterTable: counterTable.table, eventChips, eventTable: eventTable.table,
      drawTable: drawTable.table, drawHeads: drawTable.heads, drawStatus, drawGroupBtns,
      samplerSupport, samplerBtn, samplerStatus, samplerResults,
      worstTitle, worst, worstJump, eventsTitle, events, envBox, censusTable: census.table,
      cpuRows: new Map(), gpuRows: new Map(), censusRows: new Map(), renderRows: new Map(), counterRows: new Map(),
      dump: Dump,
    };
    this._BindChart();
    this._BindTimeline();
    doc.addEventListener("keydown", (event) => this._OnKey(event));
    win.addEventListener("resize", () => {
      if (!this.ui) return;
      this.DrawChart();
      this.DrawTimeline();
    });
    this.SetTab(this.tab);
    this._Invalidate();
  }

  /** 与 CLI 输出同结构的快照（`Script_ProfileCli --print` 能直接读回来排表）。选中了就是选区的数。 */
  Snapshot() {
    const profiler = this.host.profiler;
    const post = this.host.post;
    const sel = this.sel;
    return {
      label: sel ? `panel #${sel.first}${sel.last !== sel.first ? `-#${sel.last}` : ""}` : "panel",
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      canvas: this.host.canvas ? `${this.host.canvas.width}x${this.host.canvas.height}` : null,
      postTarget: post ? `${post.width}x${post.height} · ${post.quality}` : null,
      environment: profiler ? (profiler.source ? profiler.source.environment : profiler.Environment()) : null,
      counterEvery: COUNTER_EVERY,
      census: this._census,
      sampler: this._samplerResult,
      summary: profiler ? (sel ? profiler.SummaryRange(sel.first, sel.last) : profiler.Summary(10)) : null,
    };
  }

  SnapshotJson() {
    return JSON.stringify(this.Snapshot(), (key, value) =>
      (typeof value === "number" ? Math.round(value * 1000) / 1000 : value), 2);
  }

  SnapshotText() {
    const profiler = this.host.profiler;
    let text = FormatSnapshot(this.Snapshot());
    if (profiler && this.sel && this.sel.first === this.sel.last) {
      const record = profiler.FrameById(this.sel.first);
      text += `\n\n${FormatFrameTimeline(record, profiler.names)}`;
      if (record && record.draws) text += `\n\n${FormatDrawCapture(record)}`;
    }
    if (this._samplerResult) text += `\n\n${FormatSampler(this._samplerResult)}`;
    return text;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    const profiler = this.host.profiler;
    if (!profiler || !profiler.on) return;
    // 用户直接把独立窗口叉掉 = 「不剖析了」：跟着把叠加层整个关掉，钩子全还原。
    if (this.win && this.win.closed) { this.host.CloseProfiler(); return; }
    if (!this.ui) return;
    this._frame += 1;
    if (profiler.revision !== this._chartRev && this._frame % 3 === 0) this.DrawChart();
    this._tableAcc += dt;
    if (this._tableAcc >= 0.5) {
      this._tableAcc = 0;
      if (this.sel) this._RefreshSelection(false);
      else if (profiler.recording || this._liveStale) {
        this._liveStale = false;
        this.RefreshTables(profiler.Summary(2), "live");
      }
      this.RefreshToolbar();
      this._TickSampler();
    }
    this._slowAcc += dt;
    if (this._slowAcc >= 1.0) {
      this._slowAcc = 0;
      this.RefreshSlow(profiler);
    }
  }

  // -------------------------------------------------------------------------
  // 录制控制与选区
  // -------------------------------------------------------------------------

  TogglePause() {
    const profiler = this.host.profiler;
    if (!profiler || !profiler.on) return;
    if (profiler.recording) {
      profiler.Pause();
      this._SetStatus("已暂停：缓冲冻住，点帧图逐帧看");
    } else {
      if (profiler.source) {
        const ok = this.win.confirm("继续录制会清掉加载进来的录制，继续吗？");
        if (!ok) return;
        this.sel = null;
        this.view.follow = true;
      }
      profiler.Resume();
      this._SetStatus("");
    }
    this._Invalidate();
  }

  ClearHistory() {
    const profiler = this.host.profiler;
    if (!profiler) return;
    profiler.Clear();
    this.sel = null;
    this.view.follow = true;
    this._SetStatus("已清空");
    this._Invalidate();
  }

  SetCapacity(frames) {
    const profiler = this.host.profiler;
    if (!profiler) return;
    profiler.SetHistoryMax(frames);
    this.view.count = Math.min(this.view.count, profiler.historyMax);
    if (this.sel && profiler.IndexOfId(this.sel.last) < 0) this.sel = null;
    this._Invalidate();
  }

  /** 「只看游戏帧」：汇总只算游戏中 + 过场（关掉 = 连暂停/菜单/加载帧一起算）。 */
  SetActiveOnly(on) {
    const profiler = this.host.profiler;
    if (!profiler) return;
    profiler.activeOnly = !!on;
    this._Invalidate();
  }

  /** 目标帧率（预算线与超预算比例）；0 = 按估出来的屏幕刷新率。 */
  SetTargetFps(fps) {
    const profiler = this.host.profiler;
    if (!profiler) return;
    profiler.targetFps = Math.max(0, Number(fps) || 0);
    this._Invalidate();
  }

  SetTab(id) {
    if (!this.ui || !this.ui.pages.has(id)) return;
    this.tab = id;
    for (const [key, { button }] of this.ui.tabButtons) button.classList.toggle("on", key === id);
    for (const [key, page] of this.ui.pages) page.classList.toggle("on", key === id);
    this.RefreshPage(true);
  }

  SelectFrame(id) { this.SelectRange(id, id); }

  SelectIndex(index) {
    const history = this.host.profiler?.history;
    if (!history || !history.length) return;
    const clamped = Math.max(0, Math.min(history.length - 1, index));
    this.SelectFrame(history[clamped].id);
  }

  SelectRange(firstId, lastId) {
    const profiler = this.host.profiler;
    if (!profiler) return;
    const first = Math.min(firstId, lastId);
    const last = Math.max(firstId, lastId);
    this.sel = { first, last };
    this._Unpin();
    this._EnsureVisible(profiler.IndexAtOrBefore(last));
    this._RefreshSelection(true);
    this.DrawChart();
    this.RefreshToolbar();
  }

  Step(delta) {
    const profiler = this.host.profiler;
    if (!profiler || !profiler.history.length) return;
    if (!this.sel) { this.SelectIndex(profiler.history.length - 1); return; }
    const anchor = delta < 0 ? this.sel.first : this.sel.last;
    this.SelectIndex(profiler.IndexAtOrBefore(anchor) + delta);
  }

  JumpSpike(direction) {
    const profiler = this.host.profiler;
    if (!profiler) return;
    const history = profiler.history;
    let from;
    if (this.sel) from = profiler.IndexAtOrBefore(direction < 0 ? this.sel.first : this.sel.last);
    else from = direction < 0 ? history.length : -1;
    const index = profiler.FindSpike(from, direction);
    if (index < 0) { this._SetStatus(direction < 0 ? "往前没有尖峰帧了" : "往后没有尖峰帧了"); return; }
    this._SetStatus("");
    this.SelectIndex(index);
  }

  GoLatest() {
    this.sel = null;
    this.view.follow = true;
    this.tl.id = null;
    this._Invalidate();
  }

  /** 表格行或时间轴条目被点：两边一起高亮同一个桶（再点一次取消）。 */
  FocusKey(key) {
    this._focusKey = this._focusKey === key ? null : key;
    for (const cache of [this.ui.cpuRows, this.ui.gpuRows]) {
      for (const [rowKey, row] of cache) row.tr.classList.toggle("focus", rowKey === this._focusKey);
    }
    this.DrawTimeline();
  }

  /** 抓下一帧的 draw 清单；抓到之后 Draw 清单页自动显示它。 */
  CaptureDraws() {
    const profiler = this.host.profiler;
    if (!profiler || !profiler.on) return;
    if (!profiler.recording) { this._SetStatus("先继续录制再抓（暂停时没有新帧）"); return; }
    profiler.RequestDrawCapture();
    this._drawPending = true;
    this.ui.drawStatus.textContent = "等下一帧…";
    if (this.tab !== "draws") this.SetTab("draws");
  }

  SaveRecording() {
    const profiler = this.host.profiler;
    if (!profiler) return;
    const post = this.host.post;
    const data = profiler.ExportRecording({
      label: profiler.source?.label || "panel",
      userAgent: navigator.userAgent,
      canvas: this.host.canvas ? `${this.host.canvas.width}x${this.host.canvas.height}` : null,
      postTarget: post ? `${post.width}x${post.height} · ${post.quality}` : null,
      ...(this._samplerResult ? { sampler: this._samplerResult } : {}),
    });
    const text = JSON.stringify(data);
    const now = new Date();
    const Pad = (value) => String(value).padStart(2, "0");
    const name = `Profiler_${now.getFullYear()}${Pad(now.getMonth() + 1)}${Pad(now.getDate())}`
      + `_${Pad(now.getHours())}${Pad(now.getMinutes())}${Pad(now.getSeconds())}.json`;
    const size = `${(text.length / 1048576).toFixed(1)} MB`;
    try {
      const win = this.win;
      const blob = new win.Blob([text], { type: "application/json" });
      const url = win.URL.createObjectURL(blob);
      const link = this.doc.createElement("a");
      link.href = url;
      link.download = name;
      this.doc.body.appendChild(link);
      link.click();
      link.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 10000);
      this._SetStatus(`已保存 ${name}（${data.frames.length} 帧，${size}）`);
    } catch (error) {
      // 下载被拦就退回文本框，至少能手动复制走
      this.SetTab("export");
      this.ui.dump(text);
      this._SetStatus(`下载失败，JSON 放在「取证与导出」页底部文本框（${size}）`);
    }
  }

  async LoadRecordingFile(file) {
    try {
      const text = await file.text();
      this.LoadRecording(JSON.parse(text), file.name);
    } catch (error) {
      this._SetStatus(`加载失败：${error.message || error}`);
    }
  }

  LoadRecording(data, label = "") {
    const profiler = this.host.profiler;
    if (!profiler || !this.ui) return 0;
    const count = profiler.ImportRecording(data, label);
    this.sel = null;
    this.view.follow = true;
    this.tl.id = null;
    this._samplerResult = data.sampler || null;
    this._SetStatus(`已加载 ${label || data.label || "录制"}（${count} 帧，录于 ${data.when || "?"}）`);
    this._Invalidate();
    return count;
  }

  _SetStatus(text) {
    if (this.ui) this.ui.statusLabel.textContent = text;
  }

  /** 状态整体变了（暂停 / 清空 / 导入 / 取消选中 / 改口径）：立刻把所有视图重画一遍，不等下一帧节流。 */
  _Invalidate() {
    const profiler = this.host.profiler;
    if (!profiler || !this.ui) return;
    this._liveStale = true;
    this._slowStale = true;
    this.DrawChart();
    if (this.sel) this._RefreshSelection(true);
    else {
      this._liveStale = false;
      this.RefreshTables(profiler.Summary(2), "live");
      this.DrawTimeline();
    }
    this.RefreshToolbar();
    this.RefreshSlow(profiler);
  }

  /**
   * 选区的表重算。force=false 是每 0.5 s 的巡检：只有选区里有帧的 GPU 结果刚到
   *（选的是最新几帧、查询还在飞），或选区已经滚出缓冲，才需要再动，否则选区的数不会变。
   */
  _RefreshSelection(force) {
    const profiler = this.host.profiler;
    if (!profiler || !this.sel) return;
    const { first, last } = this.sel;
    if (!force && profiler.FrameById(last)) {
      if (!this._selSummary || profiler.source || !profiler.timerAvailable) return;
      if (this._selSummary.gpuFrames === this._CountGpu(first, last)) return;
    }
    // 选一帧时不按「只看游戏帧」过滤：点到的就是要看的那一帧，哪怕它是暂停帧
    const single = first === last;
    const saved = profiler.activeOnly;
    if (single) profiler.activeOnly = false;
    const summary = profiler.SummaryRange(first, last);
    profiler.activeOnly = saved;
    if (summary.framesAll === 0) {
      this._SetStatus("选中的帧已经滚出缓冲区（缓冲调大一点，或先暂停再选）");
      this.sel = null;
      this.view.follow = true;
      this._Invalidate();
      return;
    }
    this._selSummary = summary;
    const mode = single ? "frame" : "range";
    this.RefreshTables(summary, mode);
    this._RefreshEvidence(summary, mode);
    this.DrawTimeline();
  }

  _CountGpu(first, last) {
    let count = 0;
    for (const row of this.host.profiler.history) if (row.id >= first && row.id <= last && row.gpu) count += 1;
    return count;
  }

  _OnKey(event) {
    if (!this.ui) return;
    const tag = event.target && event.target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || tag === "INPUT") return;
    switch (event.key) {
      case "ArrowLeft": this.Step(event.shiftKey ? -10 : -1); break;
      case "ArrowRight": this.Step(event.shiftKey ? 10 : 1); break;
      case "Home": this.SelectIndex(0); break;
      case "End":
      case "Escape": this.GoLatest(); break;
      case " ": this.TogglePause(); break;
      case "[": this.JumpSpike(-1); break;
      case "]": this.JumpSpike(1); break;
      default: return;
    }
    event.preventDefault();
  }

  // -------------------------------------------------------------------------
  // 帧图
  // -------------------------------------------------------------------------

  /** canvas 按 CSS 尺寸 × 设备像素比开缓冲，之后一律用 CSS 像素画。 */
  _Fit(canvas, cssHeight) {
    const dpr = (this.win && this.win.devicePixelRatio) || 1;
    const cssWidth = Math.max(200, canvas.clientWidth || 840);
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: cssWidth, H: cssHeight };
  }

  /** 帧图视窗在历史里的下标区间 [start, end)。 */
  _ChartWindow() {
    const profiler = this.host.profiler;
    const n = profiler.history.length;
    const slots = Math.max(30, Math.min(this.view.count, profiler.historyMax));
    let end = n;
    if (!this.view.follow) {
      const at = profiler.IndexAtOrBefore(this.view.endId);
      end = at < 0 ? 0 : at + 1;
    }
    // 右端往左挪到头时不留空：视窗至少装满 slots 帧（缓冲不够就全装）
    end = Math.max(Math.min(end, n), Math.min(n, slots));
    return { start: Math.max(0, end - slots), end, slots, n };
  }

  _Unpin() {
    if (!this.view.follow) return;
    const history = this.host.profiler.history;
    if (!history.length) return;
    this.view.follow = false;
    this.view.endId = history[history.length - 1].id;
  }

  _EnsureVisible(index) {
    if (index < 0) return;
    const { start, end, slots } = this._ChartWindow();
    if (index >= start && index < end) return;
    const target = index < start ? index + Math.floor(slots * 0.8) : index + Math.floor(slots * 0.2);
    this._SetViewEnd(target + 1);
  }

  /** 把视窗右端设到下标 end（不含）；到了最新帧就恢复跟随。 */
  _SetViewEnd(end) {
    const history = this.host.profiler.history;
    const n = history.length;
    if (!n) { this.view.follow = true; return; }
    if (end >= n) {
      // 有选区时仍钉住（钉在最新一帧上），免得新帧把选中的那一帧挤出视窗
      if (this.sel) { this.view.follow = false; this.view.endId = history[n - 1].id; } else this.view.follow = true;
      return;
    }
    this.view.follow = false;
    this.view.endId = history[Math.max(0, end - 1)].id;
  }

  /**
   * 帧图：顶上一条事件道（MARKS 高）、中间堆叠图、底下一条机器忙闲道（BUSY 高）。
   * 预算线按汇总里估出来的刷新率（或面板选的目标帧率）画，金色虚线。
   */
  DrawChart() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    if (!profiler || !ui) return;
    this._chartRev = profiler.revision;
    const { ctx, W, H } = this._Fit(ui.chart, 196);
    const history = profiler.history;
    const { start, end, slots, n } = this._ChartWindow();
    const barW = W / slots;
    const count = end - start;
    this._layout = { start, end, slots, barW, W, H };
    const MARKS = 16;
    const BUSY = 6;
    const plotTop = MARKS + 10;
    const plotBottom = H - BUSY - 2;
    ctx.fillStyle = "#060707";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#0b0c0b";
    ctx.fillRect(0, 0, W, MARKS);
    ctx.fillRect(0, H - BUSY, W, BUSY);

    // 纵轴：视窗里 90 分位的间隔 × 1.25 往上取档，尖刺顶出去的帧在顶上打红点。
    const values = [];
    for (let i = start; i < end; i += 1) {
      const row = history[i];
      values.push(IsLiveFrame(row) ? row.interval : row.cpuMs);
    }
    values.sort((a, b) => a - b);
    const p90 = values.length ? values[Math.floor(values.length * 0.9)] : 16.7;
    const top = [16.7, 33.3, 50, 66.7, 100, 200, 500, 1000].find((value) => value >= p90 * 1.25) || 1000;
    const scale = (plotBottom - plotTop) / top;
    const Y = (ms) => plotBottom - ms * scale;
    ctx.font = "10px Consolas, monospace";
    for (const line of [10, 16.7, 33.3, 50, 66.7, 100, 200, 500]) {
      if (line >= top) break;
      ctx.fillStyle = "#1b1d1a";
      ctx.fillRect(0, Math.round(Y(line)), W, 1);
      ctx.fillStyle = "#56584f";
      ctx.fillText(`${line}`, 4, Y(line) - 2);
    }
    ctx.fillStyle = "#56584f";
    ctx.fillText(`${top} ms`, 4, plotTop + 9);
    const X = (i) => W - (end - i) * barW;
    const bw = Math.max(1, barW - (barW > 3 ? 1 : 0));

    // 非游戏帧（暂停/菜单/加载）灰底：它们照记，但默认不进汇总
    ctx.fillStyle = "#16171a";
    for (let i = start; i < end; i += 1) {
      if (!IsActiveFrame(history[i])) ctx.fillRect(X(i), plotTop, Math.max(1, barW), plotBottom - plotTop);
    }

    // 堆叠：根桶按固定次序自下而上，每种颜色一次 fill。
    const present = new Set();
    for (let i = start; i < end; i += 1) {
      const cpu = history[i].cpu;
      for (const key in cpu) if (key.indexOf("/") < 0) present.add(key);
    }
    const order = ROOT_ORDER.filter((key) => key === "other" || present.has(key));
    for (const key of [...present].sort()) if (!ROOT_COLORS[key]) order.splice(order.length - 1, 0, key);
    const base = new Float32Array(count);
    const limit = plotBottom - plotTop + 2;
    for (const root of order) {
      ctx.fillStyle = ColorOf(root);
      ctx.beginPath();
      for (let i = start; i < end; i += 1) {
        const row = history[i];
        const value = root === "other" ? row.other : (row.cpu[root] || 0);
        if (!(value > 0)) continue;
        const k = i - start;
        const from = base[k];
        const to = Math.min(limit, from + value * scale);
        if (to <= from) continue;
        ctx.rect(X(i), plotBottom - to, bw, to - from);
        base[k] = to;
      }
      ctx.fill();
    }
    ctx.fillStyle = BROWSER_COLOR;
    ctx.beginPath();
    for (let i = start; i < end; i += 1) {
      const row = history[i];
      if (!IsLiveFrame(row)) continue;
      const k = i - start;
      const from = base[k];
      const to = Math.min(limit, row.interval * scale);
      if (to > from) ctx.rect(X(i), plotBottom - to, bw, to - from);
    }
    ctx.fill();

    // GPU 合计折线（结果没回来的帧断开）
    ctx.strokeStyle = GPU_LINE;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    let pen = false;
    for (let i = start; i < end; i += 1) {
      const row = history[i];
      if (row.gpuTotal == null) { pen = false; continue; }
      const x = X(i) + barW * 0.5;
      const y = Math.max(plotTop, Y(row.gpuTotal));
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();

    // 叠画一条计数器（自己的纵轴：视窗内最大值顶到绘图区 85%）
    if (this._plotCounter >= 0) this._DrawCounterLine(ctx, history, start, end, X, barW, plotTop, plotBottom, W);

    // 预算线（金色虚线）
    const summary = this.sel ? this._selSummary : this._liveSummary;
    const budget = summary?.hitch?.budgetMs || 0;
    if (budget > 0 && budget < top) {
      const y = Math.round(Y(budget)) + 0.5;
      ctx.strokeStyle = BUDGET_COLOR;
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const label = `预算 ${budget.toFixed(1)} ms · ${Math.round(1000 / budget)} fps`;
      const labelW = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(6, 7, 7, 0.88)";
      ctx.fillRect(W - labelW - 4, y - 14, labelW, 13);
      ctx.fillStyle = BUDGET_COLOR;
      ctx.fillText(label, W - labelW + 1, y - 4);
    }

    // 事件道：红=顶出纵轴、白=GC、金=现编着色器、彩色=事件标记；阶段切换另画一条贯穿的细线
    for (let i = start; i < end; i += 1) {
      const row = history[i];
      const x = X(i);
      if (IsLiveFrame(row) && row.interval > top) { ctx.fillStyle = "#d4554a"; ctx.fillRect(x, 1, bw, 4); }
      if (row.gcMb > 0) { ctx.fillStyle = "#f2f0e6"; ctx.fillRect(x, 6, bw, 3); }
      if (row.newPrograms > 0) { ctx.fillStyle = "#dfbd68"; ctx.fillRect(x, 10, bw, 4); }
      if (row.marks) {
        for (const [kind] of row.marks) {
          const color = MARK_KINDS[kind]?.color || "#9a9b90";
          ctx.fillStyle = color;
          if (kind === "stage" || kind === "quality") {
            ctx.globalAlpha = 0.5;
            ctx.fillRect(Math.round(x), MARKS, 1, plotBottom - MARKS);
            ctx.globalAlpha = 1;
            ctx.fillRect(x - 1, 0, Math.max(3, bw + 2), MARKS);
          } else {
            ctx.fillRect(x, kind === "death" ? 1 : 6, Math.max(2, bw), 8);
          }
        }
      }
      if (row.gap) {
        ctx.fillStyle = "#5d5f57";
        for (let y = MARKS; y < plotBottom; y += 6) ctx.fillRect(Math.round(x) - 1, y, 1, 3);
      }
      // 机器忙闲道：慢 1.25 倍以上琥珀、1.6 倍以上红；没有探针读数时按系统 CPU 压力档上色
      const busyColor = BusyColor(row.busy)
        || (row.pressure >= 2 ? (row.pressure >= 3 ? "#c4574c" : "#c9a24f") : (row.pressure >= 0 ? "#5f7a5a" : null));
      if (busyColor) { ctx.fillStyle = busyColor; ctx.fillRect(x, H - BUSY + 1, Math.max(1, barW), BUSY - 2); }
    }

    // 选区与悬停
    if (this.sel) {
      const a = profiler.IndexAtOrBefore(this.sel.first);
      const b = profiler.IndexAtOrBefore(this.sel.last);
      const lo = Math.max(start, profiler.IndexOfId(this.sel.first) < 0 ? a + 1 : a);
      const hi = Math.min(end - 1, b);
      if (hi >= lo) {
        const x0 = X(lo);
        const x1 = X(hi) + barW;
        ctx.fillStyle = "rgba(237, 202, 131, 0.10)";
        ctx.fillRect(x0, 0, x1 - x0, H);
        ctx.strokeStyle = "#edca83";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(x0) + 0.5, 0.5, Math.max(1, Math.ceil(x1 - x0) - 1), H - 1);
      }
    }
    if (this._hover >= start && this._hover < end) {
      ctx.fillStyle = "rgba(238, 238, 231, 0.35)";
      ctx.fillRect(X(this._hover) + barW * 0.5, 0, 1, H);
    }
    if (n === 0) {
      ctx.fillStyle = "#6f7064";
      ctx.font = "12px sans-serif";
      ctx.fillText(profiler.recording ? "等待第一帧…" : "缓冲是空的：按「录制」开始记", 12, H / 2);
    }

    const legendKey = `${order.join(",")}|${this._plotCounter}`;
    if (legendKey !== this._legendKey) {
      this._legendKey = legendKey;
      ui.legend.textContent = "";
      const Swatch = (color, text) => {
        const i = this.doc.createElement("i");
        i.style.background = color;
        ui.legend.appendChild(i);
        ui.legend.appendChild(this.doc.createTextNode(text));
      };
      for (const root of order) Swatch(ColorOf(root), CPU_LABELS[root] || root);
      Swatch(BROWSER_COLOR, "浏览器侧");
      Swatch(GPU_LINE, "GPU 合计");
      Swatch(BUDGET_COLOR, "预算线");
      if (this._plotCounter >= 0) Swatch("#9fd3c7", this._CounterLabel(this._plotCounter));
      ui.legend.appendChild(this.doc.createTextNode(
        " ｜ 顶道：红=顶出纵轴 白=GC 金=现编着色器 竖线=阶段/降档 ｜ 底道：机器忙闲 ｜ 灰底=非游戏帧"));
    }
    this._DrawOverview();
  }

  _CounterLabel(index) {
    const profiler = this.host.profiler;
    const meta = profiler.source ? profiler.source.counters : profiler.CounterMeta();
    const entry = meta && meta[index];
    return entry ? `${entry.label || entry.name}${entry.unit ? `（${entry.unit}）` : ""}` : `计数器 #${index}`;
  }

  _DrawCounterLine(ctx, history, start, end, X, barW, plotTop, plotBottom, W) {
    const index = this._plotCounter;
    let max = 0;
    for (let i = start; i < end; i += 1) {
      const value = history[i].ctr ? history[i].ctr[index] : NaN;
      if (Number.isFinite(value) && value > max) max = value;
    }
    if (!(max > 0)) return;
    const Y = (value) => plotBottom - (value / max) * (plotBottom - plotTop) * 0.85;
    ctx.strokeStyle = "#9fd3c7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let pen = false;
    for (let i = start; i < end; i += 1) {
      const value = history[i].ctr ? history[i].ctr[index] : NaN;
      if (!Number.isFinite(value)) continue;
      const x = X(i) + barW * 0.5;
      if (pen) ctx.lineTo(x, Y(value)); else ctx.moveTo(x, Y(value));
      pen = true;
    }
    ctx.stroke();
    ctx.fillStyle = "#9fd3c7";
    const label = `${this._CounterLabel(index)} 峰值 ${Number(max.toFixed(1))}`;
    ctx.fillText(label, W - ctx.measureText(label).width - 6, plotTop + 9);
  }

  _DrawOverview() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    const { ctx, W, H } = this._Fit(ui.overview, 24);
    ctx.fillStyle = "#090a09";
    ctx.fillRect(0, 0, W, H);
    const history = profiler.history;
    const n = history.length;
    if (!n) return;
    const capacity = Math.max(n, profiler.historyMax);
    const perPx = capacity / W;
    const x0 = W - (n / capacity) * W;   // 缓冲没满时靠右
    const columns = Math.ceil(n / perPx);
    const budget = this._liveSummary?.hitch?.budgetMs || 16.7;
    for (let c = 0; c < columns; c += 1) {
      const from = Math.floor(c * perPx);
      const to = Math.min(n, Math.max(from + 1, Math.floor((c + 1) * perPx)));
      let peak = 0;
      let active = false;
      for (let i = from; i < to; i += 1) {
        const row = history[i];
        if (IsActiveFrame(row)) active = true;
        const value = IsLiveFrame(row) ? row.interval : row.cpuMs;
        if (value > peak) peak = value;
      }
      ctx.fillStyle = !active ? "#34352f" : (peak > Math.max(33.4, budget * 3) ? "#a34038" : (peak > budget * 1.5 ? "#8f7a3c" : "#4f7752"));
      const h = Math.min(H - 2, (peak / 66.7) * (H - 2));
      ctx.fillRect(x0 + c, H - h, 1, h);
    }
    const { start, end } = this._ChartWindow();
    const wx0 = x0 + start / perPx;
    const wx1 = x0 + end / perPx;
    ctx.fillStyle = "rgba(237, 202, 131, 0.10)";
    ctx.fillRect(wx0, 0, Math.max(2, wx1 - wx0), H);
    ctx.strokeStyle = "#edca83";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(wx0) + 0.5, 0.5, Math.max(2, Math.ceil(wx1 - wx0) - 1), H - 1);
    if (this.sel) {
      const index = profiler.IndexAtOrBefore(this.sel.last);
      if (index >= 0) { ctx.fillStyle = "#eeeee7"; ctx.fillRect(x0 + index / perPx, 0, 1, H); }
    }
    this._overviewLayout = { x0, perPx, W };
  }

  _HitChart(event, clamp = false) {
    const L = this._layout;
    if (!L || L.end <= L.start) return -1;
    const rect = this.ui.chart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const index = L.end - Math.ceil((L.W - x) / L.barW);
    if (clamp) return Math.max(L.start, Math.min(L.end - 1, index));
    return index >= L.start && index < L.end ? index : -1;
  }

  _BindChart() {
    const ui = this.ui;
    const chart = ui.chart;
    const doc = this.doc;
    chart.addEventListener("mousedown", (event) => {
      if (!this.ui || event.button !== 0) return;
      const index = this._HitChart(event);
      if (index < 0) return;
      this._drag = { index, x: event.clientX, moved: false };
      event.preventDefault();
    });
    chart.addEventListener("mousemove", (event) => {
      if (!this.ui || this._drag) return;
      const index = this._HitChart(event);
      if (index !== this._hover) { this._hover = index; this.DrawChart(); }
      if (index < 0) { this._HideTip(); return; }
      this._ShowTip(this._FrameTip(this.host.profiler.history[index]), event);
    });
    chart.addEventListener("mouseleave", () => {
      if (!this.ui) return;
      this._hover = -1;
      this._HideTip();
      this.DrawChart();
    });
    doc.addEventListener("mousemove", (event) => {
      if (!this.ui) return;
      if (this._overviewDrag) { this._OverviewSeek(event); return; }
      const drag = this._drag;
      if (!drag) return;
      if (Math.abs(event.clientX - drag.x) > 4) drag.moved = true;
      if (!drag.moved) return;
      const history = this.host.profiler.history;
      const index = this._HitChart(event, true);
      if (index < 0 || !history[drag.index]) return;
      this.sel = { first: Math.min(history[drag.index].id, history[index].id),
        last: Math.max(history[drag.index].id, history[index].id) };
      this.DrawChart();
    });
    doc.addEventListener("mouseup", () => {
      if (!this.ui) return;
      this._overviewDrag = false;
      const drag = this._drag;
      this._drag = null;
      if (!drag) return;
      const history = this.host.profiler.history;
      if (!drag.moved) { if (history[drag.index]) this.SelectFrame(history[drag.index].id); return; }
      if (this.sel) this.SelectRange(this.sel.first, this.sel.last);
    });
    chart.addEventListener("dblclick", () => { if (this.ui) this.GoLatest(); });
    chart.addEventListener("wheel", (event) => {
      if (!this.ui) return;
      event.preventDefault();
      const L = this._layout;
      if (!L) return;
      const pan = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (pan) {
        const delta = event.shiftKey ? event.deltaY : event.deltaX;
        const frames = Math.sign(delta) * Math.max(1, Math.round(L.slots * 0.1));
        this._SetViewEnd(L.end + frames);
      } else {
        // 以鼠标下那一帧为锚缩放：它在视窗里离右端的比例不变
        const profiler = this.host.profiler;
        const rect = this.ui.chart.getBoundingClientRect();
        const fromRight = Math.max(0, Math.min(1, (L.W - (event.clientX - rect.left)) / L.W));
        const anchor = L.end - fromRight * L.slots;
        const next = Math.round(L.slots * (event.deltaY > 0 ? 1.25 : 0.8));
        this.view.count = Math.max(30, Math.min(profiler.historyMax, next));
        this._SetViewEnd(Math.round(anchor + fromRight * this.view.count));
      }
      this.DrawChart();
    }, { passive: false });

    ui.overview.addEventListener("mousedown", (event) => {
      if (!this.ui || event.button !== 0) return;
      this._overviewDrag = true;
      this._OverviewSeek(event);
      event.preventDefault();
    });
  }

  _OverviewSeek(event) {
    const O = this._overviewLayout;
    if (!O) return;
    const rect = this.ui.overview.getBoundingClientRect();
    const center = ((event.clientX - rect.left) - O.x0) * O.perPx;
    const { slots } = this._ChartWindow();
    this._SetViewEnd(Math.round(center + slots / 2));
    this.DrawChart();
  }

  _FrameTip(row) {
    if (!row) return "";
    const F = (value) => (value == null ? "—" : value.toFixed(2));
    const lines = [];
    const state = FrameStateOf(row);
    lines.push(`第 #${row.id} 帧 · 整帧 ${F(row.interval)} ms${row.gap ? "（接缝帧：间隔是暂停时长）" : ""}`
      + ` · ${STATE_LABELS[state] || state}${row.stage ? ` · ${row.stage}` : ""}`);
    lines.push(`主线程 ${F(row.cpuMs)} ｜ GPU ${F(row.gpuTotal)} ｜ 浏览器侧 ${IsLiveFrame(row) ? F(Math.max(0, row.interval - row.cpuMs)) : "—"}`);
    const roots = Object.entries(row.cpu).filter(([key]) => key.indexOf("/") < 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([key, value]) => `${CPU_LABELS[key] || key} ${value.toFixed(2)}`);
    if (roots.length) lines.push(roots.join(" · "));
    const marks = [`draw ${row.calls}`];
    if (row.busy > 0) marks.push(`机器慢 ${row.busy.toFixed(2)} 倍`);
    if (row.pressure >= 0) marks.push(`CPU 压力 ${PRESSURE_LABELS[row.pressure]}`);
    if (row.gcMb > 0) marks.push(`GC ${row.gcMb.toFixed(1)} MB`);
    if (row.newPrograms > 0) marks.push(`新编译着色器 ${row.newPrograms}`);
    if (row.longtaskMs > 0) marks.push(`长任务 ${row.longtaskMs.toFixed(0)} ms`);
    lines.push(marks.join(" ｜ "));
    if (row.marks) for (const [kind, label] of row.marks) lines.push(`  ${MarkLabel(kind)}：${label}`);
    // 编的是谁：一个程序一行，悬停在金色标记那一帧上就能指名道姓。
    if (row.newProgramNames) for (const name of row.newProgramNames) lines.push(`  现编：${name}`);
    if (row.draws) lines.push(`  （这一帧抓了 draw 清单：${row.draws.length} 个 draw）`);
    return lines.join("\n");
  }

  _ShowTip(text, event) {
    const tip = this.ui.tip;
    if (!text) { this._HideTip(); return; }
    tip.textContent = text;
    tip.style.display = "block";
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const maxX = this.win.innerWidth - width - 8;
    const x = Math.min(maxX, event.clientX + 14);
    const y = event.clientY + 16 + height > this.win.innerHeight ? event.clientY - height - 10 : event.clientY + 16;
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${Math.max(4, y)}px`;
  }

  _HideTip() {
    if (this.ui) this.ui.tip.style.display = "none";
  }

  // -------------------------------------------------------------------------
  // 时间轴（选中单帧时）
  // -------------------------------------------------------------------------

  DrawTimeline() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    if (!profiler || !ui) return;
    const single = this.sel && this.sel.first === this.sel.last;
    const record = single ? profiler.FrameById(this.sel.first) : null;
    if (!record) {
      ui.timeline.style.display = "none";
      ui.tlTitle.textContent = "时间轴";
      ui.tlNote.textContent = this.sel
        ? "选中的是一段帧：表格是这一段的 avg / 中位 / p95 / max。点单独一帧才出时间轴。"
        : "在帧图上点一帧（或暂停后按 ←），看这一帧里每一次 B/E 调用的先后与长短（Insights 的 Timing 视图）。";
      this.tl.layout = null;
      return;
    }
    ui.timeline.style.display = "block";
    const samples = record.samples;
    const segs = record.gpuSegs;
    let maxDepth = 0;
    let lastEnd = 0;
    if (samples) {
      for (let i = 0; i < samples.length; i += SAMPLE_STRIDE) {
        if (samples[i + 1] > maxDepth) maxDepth = samples[i + 1];
        lastEnd = Math.max(lastEnd, samples[i + 2] + samples[i + 3]);
      }
    }
    const frameSpan = Math.max(IsLiveFrame(record) ? record.interval : 0, record.cpuMs, lastEnd, 0.5);
    if (this.tl.id !== record.id) {
      this.tl.id = record.id;
      this.tl.start = 0;
      this.tl.span = frameSpan * 1.02;
    }
    ui.tlTitle.textContent = `时间轴 · 第 #${record.id} 帧`;
    const sampleCount = samples ? samples.length / SAMPLE_STRIDE : 0;
    ui.tlNote.textContent = samples
      ? `主线程 B/E 实例 ${sampleCount} 条、GPU 分段 ${segs ? segs.length / GPU_SEG_STRIDE : 0} 段 ｜ `
        + "滚轮缩放 · 拖动平移 · 双击复位 · 点一条高亮同名实例（表格同步）· 空白 = 没打标记的主线程工作"
      : "这一帧没有逐实例样本（旧版录制，或建关期间的帧）。";

    const GUTTER = 58;
    const RULER = 18;
    const ROW = 18;
    const GAP = 8;
    const mainRows = maxDepth + 1;
    const gpuY = RULER + mainRows * ROW + GAP;
    const height = gpuY + ROW + 6;
    const { ctx, W, H } = this._Fit(ui.timeline, height);
    const { start, span } = this.tl;
    const plotW = W - GUTTER;
    const X = (ms) => GUTTER + ((ms - start) / span) * plotW;
    this.tl.layout = { GUTTER, RULER, ROW, mainRows, gpuY, W, plotW, record };

    ctx.fillStyle = "#060707";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, 0, plotW, H);
    ctx.clip();
    // 主线程工作区间 / 浏览器侧 / 预算线
    const cpuEnd = X(record.cpuMs);
    ctx.fillStyle = "#0e0f0d";
    ctx.fillRect(X(0), RULER, cpuEnd - X(0), H - RULER);
    if (IsLiveFrame(record) && record.interval > record.cpuMs) {
      const x1 = X(record.interval);
      ctx.fillStyle = "#121311";
      ctx.fillRect(cpuEnd, RULER, x1 - cpuEnd, H - RULER);
      ctx.fillStyle = "#56584f";
      ctx.font = "10px sans-serif";
      if (x1 - cpuEnd > 90) ctx.fillText("浏览器侧 / 等 vsync", cpuEnd + 6, gpuY - 2);
    }
    ctx.fillStyle = "#8a8b80";
    ctx.fillRect(Math.round(cpuEnd), RULER, 1, H - RULER);
    const budget = this._selSummary?.hitch?.budgetMs || this._liveSummary?.hitch?.budgetMs || 16.7;
    ctx.fillStyle = BUDGET_COLOR;
    ctx.globalAlpha = 0.6;
    for (let y = RULER; y < H; y += 5) ctx.fillRect(Math.round(X(budget)), y, 1, 2);
    ctx.globalAlpha = 1;

    // 标尺
    const niceSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const step = niceSteps.find((value) => (value / span) * plotW >= 64) || 1000;
    ctx.font = "10px Consolas, monospace";
    for (let t = Math.ceil(start / step) * step; t <= start + span; t += step) {
      const x = X(t);
      ctx.fillStyle = "#1f201d";
      ctx.fillRect(Math.round(x), RULER - 4, 1, H - RULER + 4);
      ctx.fillStyle = "#6f7064";
      ctx.fillText(`${Number(t.toFixed(3))} ms`, x + 3, RULER - 6);
    }

    // CPU 样本
    const names = profiler.names;
    const focus = this._focusKey;
    const hover = this.tl.hover;
    ctx.font = "11px Consolas, monospace";
    if (samples) {
      for (let i = 0, slot = 0; i < samples.length; i += SAMPLE_STRIDE, slot += 1) {
        const x0 = X(samples[i + 2]);
        const x1 = X(samples[i + 2] + samples[i + 3]);
        if (x1 < GUTTER || x0 > W) continue;
        const key = names[samples[i]] ?? `#${samples[i]}`;
        const y = RULER + samples[i + 1] * ROW;
        const w = Math.max(1, x1 - x0);
        ctx.fillStyle = ColorOf(RootOf(key));
        ctx.globalAlpha = focus && focus !== key ? 0.4 : 1;
        ctx.fillRect(x0, y + 1, w, ROW - 2);
        ctx.globalAlpha = 1;
        if (focus === key || (hover && hover.kind === "cpu" && hover.slot === slot)) {
          ctx.strokeStyle = "#eeeee7";
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.floor(x0) + 0.5, y + 1.5, Math.max(1, Math.ceil(w) - 1), ROW - 3);
        }
        this._BarLabel(ctx, `${Tail(key)} ${samples[i + 3].toFixed(2)}`, Tail(key), x0, w, y, ROW);
      }
    }
    // GPU 分段（提交 CPU 的区间；GPU 耗时在标签与悬停里）
    if (segs) {
      for (let i = 0, slot = 0; i < segs.length; i += GPU_SEG_STRIDE, slot += 1) {
        const x0 = X(segs[i + 1]);
        const x1 = X(segs[i + 1] + segs[i + 2]);
        if (x1 < GUTTER || x0 > W) continue;
        const key = names[segs[i]] ?? `#${segs[i]}`;
        const w = Math.max(1, x1 - x0);
        ctx.fillStyle = slot % 2 ? "#8a6e9a" : "#9a7daa";
        const focused = focus === key || focus === `post/${key}`;
        ctx.globalAlpha = focus && !focused ? 0.4 : 1;
        ctx.fillRect(x0, gpuY + 1, w, ROW - 2);
        ctx.globalAlpha = 1;
        if (focused || (hover && hover.kind === "gpu" && hover.slot === slot)) {
          ctx.strokeStyle = "#eeeee7";
          ctx.strokeRect(Math.floor(x0) + 0.5, gpuY + 1.5, Math.max(1, Math.ceil(w) - 1), ROW - 3);
        }
        const gpuMs = record.gpuSegMs && slot < record.gpuSegMs.length ? record.gpuSegMs[slot] : null;
        this._BarLabel(ctx, gpuMs == null ? key : `${key} GPU ${gpuMs.toFixed(2)}`, key, x0, w, gpuY, ROW);
      }
    }
    ctx.restore();

    // 行名
    ctx.fillStyle = "#0b0c0b";
    ctx.fillRect(0, 0, GUTTER, H);
    ctx.fillStyle = "#a9a89b";
    ctx.font = "11px sans-serif";
    ctx.fillText("主线程", 6, RULER + 13);
    ctx.fillText("GPU 段", 6, gpuY + 13);
    ctx.fillStyle = "#c1bdab30";
    ctx.fillRect(GUTTER - 1, 0, 1, H);
  }

  /** 条上写字：放得下长标签写长的，放不下写短的，再放不下不写（不越界糊到邻居上）。 */
  _BarLabel(ctx, long, short, x0, w, y, rowHeight) {
    if (w < 24) return;
    const left = Math.max(x0, this.tl.layout.GUTTER);
    const room = x0 + w - left - 6;
    let text = long;
    if (ctx.measureText(text).width > room) text = short;
    if (ctx.measureText(text).width > room) return;
    ctx.fillStyle = "#0a0b0a";
    ctx.fillText(text, left + 3, y + rowHeight - 5);
  }

  _HitTimeline(event) {
    const L = this.tl.layout;
    if (!L) return null;
    const rect = this.ui.timeline.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < L.GUTTER) return null;
    const t = this.tl.start + ((x - L.GUTTER) / L.plotW) * this.tl.span;
    const tolerance = (2 / L.plotW) * this.tl.span;
    const record = L.record;
    const names = this.host.profiler.names;
    if (y >= L.RULER && y < L.RULER + L.mainRows * L.ROW && record.samples) {
      const depth = Math.floor((y - L.RULER) / L.ROW);
      const samples = record.samples;
      let best = null;
      for (let i = 0, slot = 0; i < samples.length; i += SAMPLE_STRIDE, slot += 1) {
        if (samples[i + 1] !== depth) continue;
        const from = samples[i + 2] - tolerance;
        const to = samples[i + 2] + samples[i + 3] + tolerance;
        if (t < from || t > to) continue;
        if (!best || samples[i + 3] < best.duration) {
          best = { kind: "cpu", slot, key: names[samples[i]] ?? `#${samples[i]}`,
            depth, start: samples[i + 2], duration: samples[i + 3] };
        }
      }
      return best;
    }
    if (y >= L.gpuY && y < L.gpuY + L.ROW && record.gpuSegs) {
      const segs = record.gpuSegs;
      let best = null;
      for (let i = 0, slot = 0; i < segs.length; i += GPU_SEG_STRIDE, slot += 1) {
        const from = segs[i + 1] - tolerance;
        const to = segs[i + 1] + segs[i + 2] + tolerance;
        if (t < from || t > to) continue;
        if (!best || segs[i + 2] < best.cpuMs) {
          best = { kind: "gpu", slot, key: names[segs[i]] ?? `#${segs[i]}`, start: segs[i + 1], cpuMs: segs[i + 2],
            calls: segs[i + 3], tris: segs[i + 4],
            gpuMs: record.gpuSegMs && slot < record.gpuSegMs.length ? record.gpuSegMs[slot] : null };
        }
      }
      return best;
    }
    return null;
  }

  _TimelineTip(hit) {
    const record = this.tl.layout.record;
    if (hit.kind === "cpu") {
      const lines = [hit.key];
      if (CPU_LABELS[hit.key]) lines.push(CPU_LABELS[hit.key]);
      const share = record.cpuMs > 0 ? ` · 占主线程 ${((hit.duration / record.cpuMs) * 100).toFixed(1)}%` : "";
      lines.push(`这一次 ${hit.duration.toFixed(3)} ms${share}`);
      lines.push(`起点 +${hit.start.toFixed(2)} ms ｜ 嵌套深度 ${hit.depth}`);
      const calls = record.cpuCalls ? record.cpuCalls[hit.key] : null;
      const total = record.cpu ? record.cpu[hit.key] : null;
      if (calls > 1 && total != null) lines.push(`这一帧同名 ${calls} 次，合计 ${total.toFixed(3)} ms`);
      return lines.join("\n");
    }
    const lines = [`${hit.key}${GPU_NOTES[hit.key] ? ` · ${GPU_NOTES[hit.key]}` : ""}`];
    lines.push(`提交 CPU ${hit.cpuMs.toFixed(3)} ms ｜ GPU ${hit.gpuMs == null ? "—（未回来或不可用）" : `${hit.gpuMs.toFixed(3)} ms`}`);
    lines.push(`draw ${Math.round(hit.calls)} ｜ 三角 ${(hit.tris / 1e6).toFixed(3)}M ｜ 起点 +${hit.start.toFixed(2)} ms`);
    if (hit.calls > 0) lines.push(`每个 draw ${((hit.cpuMs * 1000) / hit.calls).toFixed(1)} µs 提交 CPU`);
    return lines.join("\n");
  }

  _BindTimeline() {
    const canvas = this.ui.timeline;
    const doc = this.doc;
    canvas.addEventListener("mousemove", (event) => {
      if (!this.ui || this.tl.drag) return;
      const hit = this._HitTimeline(event);
      const before = this.tl.hover;
      this.tl.hover = hit;
      if ((before && before.slot) !== (hit && hit.slot) || (before && before.kind) !== (hit && hit.kind)) this.DrawTimeline();
      if (hit) this._ShowTip(this._TimelineTip(hit), event); else this._HideTip();
    });
    canvas.addEventListener("mouseleave", () => {
      if (!this.ui) return;
      this.tl.hover = null;
      this._HideTip();
      this.DrawTimeline();
    });
    canvas.addEventListener("mousedown", (event) => {
      if (!this.ui || event.button !== 0 || !this.tl.layout) return;
      this.tl.drag = { x: event.clientX, start: this.tl.start, moved: false };
      event.preventDefault();
    });
    doc.addEventListener("mousemove", (event) => {
      const drag = this.tl.drag;
      if (!this.ui || !drag || !this.tl.layout) return;
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      if (!drag.moved) return;
      this.tl.start = drag.start - (dx / this.tl.layout.plotW) * this.tl.span;
      this._HideTip();
      this.DrawTimeline();
    });
    doc.addEventListener("mouseup", (event) => {
      const drag = this.tl.drag;
      this.tl.drag = null;
      if (!this.ui || !drag || drag.moved) return;
      const hit = this._HitTimeline(event);
      if (hit) this.FocusKey(hit.kind === "gpu" && !this.ui.gpuRows.has(hit.key) ? `post/${hit.key}` : hit.key);
    });
    canvas.addEventListener("dblclick", () => {
      if (!this.ui) return;
      this.tl.id = null;
      this.DrawTimeline();
    });
    canvas.addEventListener("wheel", (event) => {
      const L = this.tl.layout;
      if (!this.ui || !L) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - L.GUTTER) / L.plotW));
      const anchor = this.tl.start + fraction * this.tl.span;
      const next = this.tl.span * (event.deltaY > 0 ? 1.25 : 0.8);
      this.tl.span = Math.max(0.02, Math.min(2000, next));
      this.tl.start = anchor - fraction * this.tl.span;
      this.DrawTimeline();
    }, { passive: false });
  }

  // -------------------------------------------------------------------------
  // 表格
  // -------------------------------------------------------------------------

  _Row(table, cache, key, cols, { bar = true, clickable = false, onClick = null } = {}) {
    let row = cache.get(key);
    if (!row) {
      const doc = this.doc;
      const tr = doc.createElement("tr");
      const name = doc.createElement("td");
      name.className = "name";
      tr.appendChild(name);
      const cells = [];
      for (let i = 0; i < cols; i += 1) {
        const td = doc.createElement("td");
        cells.push(td);
        tr.appendChild(td);
      }
      let barEl = null;
      if (bar) {
        const barCell = doc.createElement("td");
        barCell.className = "bar track";
        barEl = doc.createElement("i");
        barCell.appendChild(barEl);
        tr.appendChild(barCell);
      }
      if (clickable) tr.addEventListener("click", (event) => { if (this.ui) (onClick || ((k) => this.FocusKey(k)))(key, event); });
      row = { tr, name, cells, bar: barEl, live: false };
      cache.set(key, row);
    }
    // appendChild 会把已有节点**移动**到末尾 —— 按顺序重挂一遍就是重排序。
    table.appendChild(row.tr);
    row.tr.style.display = "";
    row.live = true;
    return row;
  }

  /** 这一轮没出现的行收起来（桶会随场景与关卡出现/消失，别留一排幽灵的 0）。 */
  _Sweep(cache) {
    for (const row of cache.values()) {
      if (!row.live) row.tr.style.display = "none";
      row.live = false;
    }
  }

  /** 父桶有没有被折起来（自己或任何一级祖先在 _collapsed 里）。 */
  _Hidden(key) {
    const self = key.endsWith("|self");
    const base = self ? key.slice(0, -5) : key;
    // 「自身」行属于父行本身：父行折起来它也藏
    if (self && this._collapsed.has(base)) return true;
    let cut = base.lastIndexOf("/");
    while (cut > 0) {
      const prefix = base.slice(0, cut);
      if (this._collapsed.has(prefix)) return true;
      cut = prefix.lastIndexOf("/");
    }
    return false;
  }

  /** mode：live（实时最近 2 秒）/ range（选中一段）/ frame（选中一帧：列换成 ms、占比、调用次数）。 */
  RefreshTables(summary, mode = "live") {
    const ui = this.ui;
    if (mode === "live") this._liveSummary = summary;
    const single = mode === "frame";
    this._mode = mode;
    this._RefreshUnit(summary, mode);
    const F = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(2));
    const Int = (value) => (value === null || value === undefined ? "" : String(Math.round(value)));
    const Pct = (value, total) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "");
    const focus = this._focusKey;
    const heads = single ? CPU_HEADS.frame : CPU_HEADS.live;
    ui.cpuHeads.forEach((th, i) => { th.textContent = heads[i]; });
    const gpuHeads = single ? GPU_HEADS.frame : GPU_HEADS.live;
    ui.gpuHeads.forEach((th, i) => { th.textContent = gpuHeads[i]; });
    ui.cpuTable.classList.toggle("single", single);
    ui.gpuTable.classList.toggle("single", single);
    const span = summary.firstId === summary.lastId ? `第 #${summary.firstId} 帧`
      : `第 #${summary.firstId}–#${summary.lastId} 帧，共 ${summary.frames} 帧`;
    if (mode === "live") {
      ui.cpuTitle.textContent = `CPU · 主线程 ｜ ${this.host.profiler?.recording ? "最近" : "缓冲末尾"} 2 秒，ms/帧`;
      ui.gpuTitle.textContent = "GPU · 逐 pass ｜ ms/帧，名字是帧图里的英文原名";
    } else {
      ui.cpuTitle.textContent = `CPU · 主线程 ｜ ${span}，${single ? "ms" : "ms/帧"}`;
      ui.gpuTitle.textContent = `GPU · 逐 pass ｜ ${span}`;
    }
    ui.tabButtons.get("cpu").count.textContent = F(summary.cpuTotal.avg);
    ui.tabButtons.get("gpu").count.textContent = summary.gpuFrames ? F(summary.gpuTotal.avg) : "—";

    // --- CPU 表（只在计时页可见时排；导出与测试不读 DOM）---
    const cpuTotal = summary.cpuTotal.avg;
    const cpuMax = Math.max(0.001, cpuTotal);
    const items = CpuRows(summary);
    const parents = new Set(items.filter((item) => !item.selfRow).map((item) => item.key)
      .filter((key) => items.some((other) => other.key.startsWith(`${key}/`))));
    for (const item of items) {
      if (this._Hidden(item.key)) continue;
      const row = this._Row(ui.cpuTable, ui.cpuRows, item.key, 8, {
        clickable: !item.selfRow,
        onClick: (key, event) => {
          if (event.target && event.target.classList && event.target.classList.contains("tw")) this._ToggleCollapse(key);
          else this.FocusKey(key);
        },
      });
      row.tr.className = `${item.selfRow ? "self" : ""} row${item.key === focus ? " focus" : ""}`;
      const twisty = parents.has(item.key) ? (this._collapsed.has(item.key) ? "▸" : "▾") : "";
      row.name.innerHTML = "";
      row.name.appendChild(this.doc.createTextNode("　".repeat(item.depth)));
      const tw = this.doc.createElement("span");
      tw.className = "tw";
      tw.textContent = twisty;
      row.name.appendChild(tw);
      row.name.appendChild(this.doc.createTextNode(item.label));
      row.name.title = item.key;
      const avg = item.selfRow ? item.self : item.stat.avg;
      row.cells[0].textContent = F(avg);
      if (single) {
        row.cells[1].textContent = Pct(avg, cpuTotal);
        row.cells[2].textContent = "";
        row.cells[3].textContent = "";
      } else {
        row.cells[1].textContent = item.selfRow ? "" : F(item.stat.med ?? item.stat.avg);
        row.cells[2].textContent = item.selfRow ? "" : F(item.stat.p95);
        row.cells[3].textContent = item.selfRow ? "" : F(item.stat.max);
      }
      row.cells[4].textContent = item.selfRow || item.calls == null ? ""
        : (single ? Int(item.calls) : item.calls.toFixed(item.calls >= 10 ? 0 : 1));
      row.cells[5].textContent = item.selfRow || !(item.calls > 1) ? "" : (avg / item.calls).toFixed(3);
      row.cells[6].textContent = item.selfRow ? "" : Int(item.visits);
      row.cells[7].textContent = item.selfRow || item.allocKb == null ? "" : item.allocKb.toFixed(1);
      row.bar.style.width = `${Math.min(100, (avg / cpuMax) * 100)}%`;
      row.bar.style.background = ColorOf(RootOf(item.key.split("|")[0]));
    }
    const TotalRow = (table, cache, key, label, stat, cols, title = "") => {
      const row = this._Row(table, cache, key, cols);
      row.tr.className = "total";
      row.name.textContent = label;
      row.name.title = title;
      for (let i = 0; i < cols; i += 1) row.cells[i].textContent = "";
      row.cells[0].textContent = F(stat.avg);
      if (!single) {
        if (cols === 8) {
          row.cells[1].textContent = F(stat.med ?? stat.avg);
          row.cells[2].textContent = F(stat.p95);
          row.cells[3].textContent = F(stat.max);
        } else {
          row.cells[1].textContent = F(stat.p95);
          row.cells[2].textContent = F(stat.max);
        }
      }
      row.bar.style.width = "0";
      return row;
    };
    TotalRow(ui.cpuTable, ui.cpuRows, "__total", "主线程合计", summary.cpuTotal, 8);
    TotalRow(ui.cpuTable, ui.cpuRows, "__browser", CPU_LABELS.browser, summary.browser, 8,
      summary.loafAvailable
        ? "整帧间隔 − 主线程工作；本浏览器支持 long-animation-frame，样式布局耗时见取证页"
        : "整帧间隔 − 主线程工作（本浏览器没有 long-animation-frame，只能做减法）");
    this._Sweep(ui.cpuRows);

    // --- GPU 表 ---
    if (!summary.timerAvailable) {
      ui.gpuNote.textContent = "当前浏览器不支持 GPU 计时；提交 CPU、draw call 与三角数仍然可信。";
    } else if (summary.gpuFrames === 0) {
      ui.gpuNote.textContent = single ? "这一帧的 GPU 计时还没回来（或被 disjoint 丢弃）。" : "等待 GPU 计时…";
    } else {
      ui.gpuNote.textContent = `GPU 合计 ${single ? "" : "avg "}${F(summary.gpuTotal.avg)} ms · `
        + `采样帧 ${summary.gpuFrames}。misc 是有名字的段之间剩下的零碎 GL 工作。`;
    }
    const gpuTotal = summary.gpuTotal.avg;
    const gpuMax = Math.max(0.001, gpuTotal);
    for (const item of GpuRows(summary)) {
      const row = this._Row(ui.gpuTable, ui.gpuRows, item.key, 6, { clickable: !item.selfRow });
      row.tr.className = `${item.selfRow ? "self" : ""} row${item.key === focus ? " focus" : ""}`;
      row.name.textContent = `${"　".repeat(item.depth)}${item.label}`;
      row.name.title = item.note || item.key;
      const avg = item.selfRow ? item.self : item.stat.avg;
      row.cells[0].textContent = F(avg);
      if (single) {
        row.cells[1].textContent = Pct(avg, gpuTotal);
        row.cells[2].textContent = "";
      } else {
        row.cells[1].textContent = item.selfRow ? "" : F(item.stat.p95);
        row.cells[2].textContent = item.selfRow ? "" : F(item.stat.max);
      }
      row.cells[3].textContent = item.selfRow || item.cpuMs == null ? "" : F(item.cpuMs);
      row.cells[4].textContent = item.selfRow ? "" : Int(item.calls);
      row.cells[5].textContent = item.selfRow || item.tris == null ? "" : `${(item.tris / 1e6).toFixed(2)}M`;
      row.bar.style.width = `${Math.min(100, (avg / gpuMax) * 100)}%`;
      row.bar.style.background = GPU_LINE;
    }
    const gpuTotalRow = TotalRow(ui.gpuTable, ui.gpuRows, "__total", "GPU 合计", summary.gpuTotal, 6);
    if (!summary.gpuFrames) for (let i = 0; i < 3; i += 1) gpuTotalRow.cells[i].textContent = "—";
    gpuTotalRow.cells[4].textContent = String(summary.calls);
    gpuTotalRow.cells[5].textContent = `${(summary.triangles / 1e6).toFixed(2)}M`;
    this._Sweep(ui.gpuRows);

    this._summaryForPages = summary;
    this.RefreshPage(false);
  }

  _ToggleCollapse(key) {
    if (this._collapsed.has(key)) this._collapsed.delete(key); else this._collapsed.add(key);
    const summary = this.sel ? this._selSummary : this._liveSummary;
    if (summary) this.RefreshTables(summary, this.sel ? (this.sel.first === this.sel.last ? "frame" : "range") : "live");
  }

  /** 读数条（stat unit）与它下面那一行预算/卡顿。 */
  _RefreshUnit(summary, mode) {
    const ui = this.ui;
    const c = ui.cards;
    const F = (value, digits = 1) => (value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits));
    const single = mode === "frame";
    const b = Bottleneck(summary);
    c.fps.v.innerHTML = `${summary.fps ? summary.fps.toFixed(0) : "—"}<small>fps</small>`;
    c.fps.s.textContent = single ? "单帧" : `1% low ${F(summary.hitch?.low1Fps)} fps`;
    c.frame.v.innerHTML = `${F(summary.frame.avg)}<small>ms</small>`;
    c.frame.s.textContent = single ? "" : `p95 ${F(summary.frame.p95)} · max ${F(summary.frame.max, 0)}`;
    const Unit = (card, value, sub, color = null, hot = false) => {
      card.v.innerHTML = `${F(value)}<small>ms</small>`;
      card.s.innerHTML = "";
      if (color) {
        const sw = this.doc.createElement("i");
        sw.className = "sw";
        sw.style.background = color;
        card.s.appendChild(sw);
      }
      card.s.appendChild(this.doc.createTextNode(sub));
      card.card.classList.toggle("hot", hot);
    };
    const mainMs = summary.cpuTotal.avg;
    Unit(c.game, b?.game, `占主线程 ${mainMs > 0 && b ? Math.round((b.game / mainMs) * 100) : 0}%`, "#5a82c4", b?.key === "game");
    Unit(c.draw, b?.draw, `占主线程 ${mainMs > 0 && b ? Math.round((b.draw / mainMs) * 100) : 0}%`, ROOT_COLORS.post, b?.key === "draw");
    Unit(c.gpu, b?.gpu, summary.timerAvailable ? `${summary.gpuFrames} 帧有读数` : "不可用", GPU_LINE, b?.key === "gpu");
    Unit(c.browser, b?.browser, b?.overlay ? `面板自身 ${F(b.overlay, 2)} ms` : "");
    // 机器忙闲：选区/实时窗口里的中位「慢几倍」+ 最近一次系统压力档
    const profiler = this.host.profiler;
    if (summary.busy) {
      c.busy.v.innerHTML = `×${summary.busy.med.toFixed(2)}`;
      c.busy.card.classList.toggle("hot", summary.busy.med >= 1.25);
    } else {
      c.busy.v.textContent = "—";
      c.busy.card.classList.remove("hot");
    }
    const pressure = summary.pressure
      ? summary.pressure.levels.map((n, i) => (n ? `${PRESSURE_LABELS[i]}` : null)).filter(Boolean).join("/")
      : (profiler && profiler.pressure >= 0 && !profiler.source ? PRESSURE_LABELS[profiler.pressure] : "");
    c.busy.s.textContent = summary.busy
      ? `${summary.busy.med >= 1.6 ? "很忙，毫秒数被放大" : summary.busy.med >= 1.25 ? "偏忙" : "正常"}${pressure ? ` · CPU 压力 ${pressure}` : ""}`
      : (pressure ? `CPU 压力 ${pressure}` : "无读数");
    // 结论
    const warn = b && b.key && (summary.hitch?.overBudgetPct || 0) > 20;
    c.verdict.card.classList.toggle("warn", !!warn);
    c.verdict.v.textContent = b && b.key ? `卡在 ${b.label}` : "—";
    c.verdict.s.textContent = b && b.key
      ? `${Math.round(b.share * 100)}% 的帧（${b.votes[b.key]}/${b.frames}）${summary.busy && summary.busy.med >= 1.6 ? " · 先排除机器被占" : ""}`
      : "";
    // 预算 / 卡顿一行
    const h = summary.hitch;
    if (h && !single) {
      const Bad = (value, bad) => `<b${bad ? " class=\"bad\"" : ""}>${value}</b>`;
      ui.hitch.innerHTML = `${Bad(`${Math.round(h.refreshHz)} Hz`, false)} 屏 · 预算 ${Bad(`${h.budgetMs.toFixed(1)} ms`, false)}`
        + ` ｜ 超预算 ${Bad(`${h.overBudgetPct.toFixed(1)}%`, h.overBudgetPct > 20)} 帧`
        + ` ｜ 掉 vsync ${Bad(h.missedVsync, h.missedVsyncPct > 20)} 次（${h.missedVsyncPct.toFixed(0)}%）`
        + ` ｜ 卡顿 ≥${HITCH_MINOR_MS}ms ${Bad(h.minor, h.minor > 0)} · ≥100ms ${Bad(h.major, h.major > 0)} · ≥250ms ${Bad(h.severe, h.severe > 0)}`
        + ` ｜ ${StateLine(summary)}`
        + (summary.stages?.length ? ` ｜ 阶段 ${summary.stages.join(" → ")}` : "");
    } else if (single) {
      const record = this.host.profiler?.FrameById(summary.firstId);
      const state = record ? FrameStateOf(record) : "";
      ui.hitch.textContent = record
        ? `第 #${record.id} 帧 · ${STATE_LABELS[state] || state}${record.stage ? ` · 阶段 ${record.stage}` : ""}`
          + ` · draw ${record.calls} · 三角 ${(record.triangles / 1e6).toFixed(2)}M`
          + (record.busy > 0 ? ` · 机器慢 ${record.busy.toFixed(2)} 倍` : "")
        : "";
    }
  }

  /** 当前页签的内容（非计时/GPU 页）。force=true：切页或改口径时立刻重排。 */
  RefreshPage(force) {
    if (!this.ui) return;
    const summary = this._summaryForPages;
    switch (this.tab) {
      case "render": if (summary) this._RefreshRender(summary); break;
      case "counters": if (summary) this._RefreshCounters(summary); break;
      case "events": this._RefreshEventsPage(force); break;
      case "draws": this._RefreshDraws(force); break;
      case "sampler": this._RefreshSampler(); break;
      case "export": this._RefreshEnvironment(); break;
      default: break;
    }
  }

  _RefreshRender(summary) {
    const ui = this.ui;
    const F = (value, digits = 1) => (value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits));
    const rows = RenderStatRows(summary);
    const maxCpu = Math.max(0.001, ...rows.map((row) => row.cpuMs));
    for (const item of rows) {
      const row = this._Row(ui.renderTable, ui.renderRows, item.key, 8);
      row.tr.className = "";
      row.name.textContent = `${"　".repeat(item.depth)}${item.depth ? Tail(item.key) : item.key}`;
      row.name.title = GPU_NOTES[item.key] || item.key;
      row.cells[0].textContent = F(item.draws, 0);
      row.cells[1].textContent = F(item.matSw, 0);
      row.cells[2].textContent = F(item.progSw, 0);
      row.cells[3].textContent = F(item.flips, 1);
      row.cells[4].textContent = F(item.instances, 0);
      row.cells[5].textContent = F(item.cpuMs, 2);
      row.cells[6].textContent = F(item.usPerDraw, 1);
      row.cells[7].textContent = item.tris == null ? "—" : `${(item.tris / 1e6).toFixed(2)}M`;
      row.bar.style.width = `${Math.min(100, (item.cpuMs / maxCpu) * 100)}%`;
    }
    this._Sweep(ui.renderRows);
    const totals = summary.render?.totals;
    ui.renderTotals.textContent = totals
      ? `整帧：draw ${F(totals.calls.avg, 0)} ｜ 材质切换 ${F(totals.matSw.avg, 0)} ｜ 程序切换 ${F(totals.progSw.avg, 0)}`
        + ` ｜ 变体重算 ${F(totals.flips.avg, 1)} ｜ 实例 ${F(totals.instances.avg, 0)} ｜ 三角 ${(totals.triangles.avg / 1e6).toFixed(2)}M`
      : "（旧版录制没有渲染统计）";
    ui.tabButtons.get("render").count.textContent = totals ? F(totals.matSw.avg, 0) : "";
  }

  _RefreshCounters(summary) {
    const ui = this.ui;
    const profiler = this.host.profiler;
    const meta = profiler.source ? (profiler.source.counters || []) : profiler.CounterMeta();
    const F = (value) => (value == null || !Number.isFinite(value) ? "—"
      : (Number.isInteger(value) || Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(2)));
    // 当前值：缓冲里最后一组
    const history = profiler.history;
    let lastCtr = null;
    for (let i = history.length - 1; i >= 0 && !lastCtr; i -= 1) if (history[i].ctr) lastCtr = history[i].ctr;
    const byIndex = new Map((summary.counters || []).map((row) => [row.index, row]));
    for (let index = 0; index < meta.length; index += 1) {
      const info = meta[index];
      const stat = byIndex.get(index);
      const row = this._Row(ui.counterTable, ui.counterRows, String(index), 6, {
        bar: false, clickable: true,
        onClick: () => { this._plotCounter = this._plotCounter === index ? -1 : index; this._legendKey = ""; this.DrawChart(); this.RefreshPage(true); },
      });
      row.tr.className = `row${this._plotCounter === index ? " focus" : ""}`;
      row.name.textContent = `${info.label || info.name}${info.unit ? `（${info.unit}）` : ""}`;
      row.name.title = info.name;
      row.cells[0].textContent = info.group || "";
      row.cells[0].className = "dim";
      row.cells[1].textContent = lastCtr ? F(lastCtr[index]) : "—";
      row.cells[2].textContent = stat ? F(stat.avg) : "—";
      row.cells[3].textContent = stat ? F(stat.min) : "—";
      row.cells[4].textContent = stat ? F(stat.max) : "—";
      let canvas = row.cells[5].firstChild;
      if (!canvas) { canvas = this.doc.createElement("canvas"); row.cells[5].appendChild(canvas); }
      this._Sparkline(canvas, history, index);
    }
    this._Sweep(ui.counterRows);
    ui.tabButtons.get("counters").count.textContent = String(meta.length);
  }

  _Sparkline(canvas, history, index) {
    const { ctx, W, H } = this._Fit(canvas, 22);
    ctx.clearRect(0, 0, W, H);
    const points = [];
    for (const row of history) if (row.ctr && Number.isFinite(row.ctr[index])) points.push(row.ctr[index]);
    if (points.length < 2) return;
    let min = Infinity;
    let max = -Infinity;
    for (const value of points) { if (value < min) min = value; if (value > max) max = value; }
    const range = max - min || 1;
    ctx.strokeStyle = this._plotCounter === index ? "#9fd3c7" : "#b7ae8c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const x = (i / (points.length - 1)) * (W - 2) + 1;
      const y = H - 2 - ((points[i] - min) / range) * (H - 4);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  /** 事件页：缓冲里所有事件标记 + 现编着色器 + GC，最新的在上；类别小片可筛。 */
  _RefreshEventsPage(force) {
    const ui = this.ui;
    const profiler = this.host.profiler;
    const history = profiler.history;
    const events = [];
    const counts = {};
    for (const row of history) {
      if (row.marks) for (const [kind, label] of row.marks) { events.push({ row, kind, label }); counts[kind] = (counts[kind] || 0) + 1; }
      if (row.newProgramNames) {
        for (const name of row.newProgramNames) { events.push({ row, kind: "compile", label: name }); counts.compile = (counts.compile || 0) + 1; }
      } else if (row.newPrograms > 0) {
        events.push({ row, kind: "compile", label: `${row.newPrograms} 个` });
        counts.compile = (counts.compile || 0) + 1;
      }
      if (row.gcMb > 0) { events.push({ row, kind: "gc", label: `释放 ${row.gcMb.toFixed(1)} MB` }); counts.gc = (counts.gc || 0) + 1; }
      if (IsLiveFrame(row) && row.interval >= HITCH_MINOR_MS && IsActiveFrame(row)) {
        events.push({ row, kind: "hitch", label: `整帧 ${row.interval.toFixed(0)} ms（主线程 ${row.cpuMs.toFixed(1)}）` });
        counts.hitch = (counts.hitch || 0) + 1;
      }
    }
    ui.tabButtons.get("events").count.textContent = String(events.length);
    // 类别小片（只在类别集合变了时重建）
    const kinds = Object.keys(counts).sort();
    const chipKey = kinds.map((kind) => `${kind}:${counts[kind]}`).join(",") + `|${this._eventKinds ? [...this._eventKinds].join(",") : "*"}`;
    if (force || chipKey !== this._chipKey) {
      this._chipKey = chipKey;
      ui.eventChips.textContent = "";
      const Chip = (kind, label, color) => {
        const chip = this.doc.createElement("span");
        const on = !this._eventKinds || this._eventKinds.has(kind);
        chip.className = `chip${on && this._eventKinds ? " on" : ""}`;
        const sw = this.doc.createElement("i");
        sw.style.background = color;
        chip.appendChild(sw);
        chip.appendChild(this.doc.createTextNode(`${label} ${counts[kind] ?? ""}`));
        chip.addEventListener("click", () => {
          if (!this._eventKinds) this._eventKinds = new Set([kind]);
          else if (this._eventKinds.has(kind)) { this._eventKinds.delete(kind); if (!this._eventKinds.size) this._eventKinds = null; }
          else this._eventKinds.add(kind);
          this._RefreshEventsPage(true);
        });
        ui.eventChips.appendChild(chip);
      };
      for (const kind of kinds) {
        const known = { gc: { label: "GC", color: "#f2f0e6" }, hitch: { label: `卡顿 ≥${HITCH_MINOR_MS}ms`, color: "#d4554a" } }[kind];
        Chip(kind, known ? known.label : MarkLabel(kind), known ? known.color : (MARK_KINDS[kind]?.color || "#9a9b90"));
      }
    }
    // 表：最新 300 条
    const table = ui.eventTable;
    while (table.rows.length > 1) table.deleteRow(1);
    const filtered = events.filter((event) => !this._eventKinds || this._eventKinds.has(event.kind));
    const firstT = history.length ? history[0].t : 0;
    for (const event of filtered.slice(-300).reverse()) {
      const tr = table.insertRow();
      tr.className = "row";
      const cells = [tr.insertCell(), tr.insertCell(), tr.insertCell(), tr.insertCell()];
      cells[0].textContent = `#${event.row.id}`;
      cells[1].textContent = `${((event.row.t - firstT) / 1000).toFixed(2)} s`;
      const kind = this.doc.createElement("span");
      kind.className = "kind";
      const sw = this.doc.createElement("i");
      sw.style.background = event.kind === "gc" ? "#f2f0e6" : event.kind === "hitch" ? "#d4554a" : (MARK_KINDS[event.kind]?.color || "#9a9b90");
      kind.appendChild(sw);
      kind.appendChild(this.doc.createTextNode(event.kind === "gc" ? "GC" : event.kind === "hitch" ? "卡顿" : MarkLabel(event.kind)));
      cells[2].appendChild(kind);
      cells[2].style.textAlign = "left";
      cells[3].textContent = event.label;
      cells[3].style.textAlign = "left";
      cells[3].style.fontFamily = "var(--ui-font)";
      const id = event.row.id;
      tr.addEventListener("click", () => { if (this.ui) this.SelectFrame(id); });
    }
    if (!filtered.length) {
      const tr = table.insertRow();
      const td = tr.insertCell();
      td.colSpan = 4;
      td.className = "empty";
      td.textContent = "缓冲里还没有事件。阶段切换、爆炸、阵亡、补兵、自动降档、现编着色器、GC、≥50 ms 的卡顿都会记在这里。";
    }
  }

  /** Draw 清单页：选中的单帧有清单就用它，否则用缓冲里最近抓的一帧。 */
  _RefreshDraws(force) {
    const ui = this.ui;
    const profiler = this.host.profiler;
    let record = null;
    if (this.sel && this.sel.first === this.sel.last) {
      const picked = profiler.FrameById(this.sel.first);
      if (picked && picked.draws) record = picked;
    }
    if (!record) {
      for (let i = profiler.history.length - 1; i >= 0; i -= 1) if (profiler.history[i].draws) { record = profiler.history[i]; break; }
    }
    if (this._drawPending && record && record.id !== this._drawShownId) this._drawPending = false;
    for (const [key, chip] of ui.drawGroupBtns) chip.classList.toggle("on", key === this._drawGroup);
    if (!force && record && record.id === this._drawShownId && this._drawShownGroup === this._drawGroup) return;
    this._drawShownId = record ? record.id : null;
    this._drawShownGroup = this._drawGroup;
    const table = ui.drawTable;
    while (table.rows.length > 1) table.deleteRow(1);
    const heads = { pass: "pass", top: "顶层子树", material: "材质（类型）", object: "物体" };
    ui.drawHeads[0].textContent = heads[this._drawGroup] || "";
    if (!record) {
      ui.drawStatus.textContent = this._drawPending ? "等下一帧…" : "还没抓过。点「抓下一帧」。";
      return;
    }
    const draws = record.draws;
    const materials = new Set(draws.map((draw) => draw.materialId)).size;
    const switches = draws.filter((draw) => draw.matSwitch).length;
    ui.drawStatus.textContent = `第 #${record.id} 帧 · ${draws.length} 个 draw · ${materials} 种材质 · 换材质 ${switches} 次`;
    ui.tabButtons.get("draws").count.textContent = String(draws.length);
    const groups = GroupDraws(draws, this._drawGroup);
    const maxDraws = Math.max(1, ...groups.map((group) => group.draws));
    for (const group of groups.slice(0, 200)) {
      const tr = table.insertRow();
      const name = tr.insertCell();
      name.textContent = group.key;
      name.className = "name";
      for (const value of [group.draws, group.materials, group.matSwitches,
        `${(group.tris / 1e6).toFixed(3)}M`, group.instances, group.us.toFixed(0), group.passes]) {
        tr.insertCell().textContent = String(value);
      }
      tr.cells[7].style.textAlign = "left";
      tr.cells[7].className = "dim";
      tr.title = `${group.draws} 个 draw，占这一帧 ${((group.draws / draws.length) * 100).toFixed(1)}%`;
      tr.style.backgroundImage = `linear-gradient(90deg, #d9bb7b1c ${(group.draws / maxDraws) * 100}%, transparent 0)`;
    }
  }

  // -------------------------------------------------------------------------
  // 函数采样
  // -------------------------------------------------------------------------

  StartSampler() {
    if (this._sampler) return;
    const support = this._SamplerSupport();
    if (!support.ok) { this._SetStatus(support.reason); this._RefreshSampler(); return; }
    const profiler = this.host.profiler;
    if (profiler && !profiler.recording) { this._SetStatus("先继续录制再采样：按帧归属要用录下来的帧"); return; }
    const sampler = new JsSampler({ scope: window });
    try { sampler.Start(); } catch (error) { this._SetStatus(`采样没能开始：${error.message || error}`); return; }
    const seconds = this._samplerSeconds;
    this._sampler = { sampler, seconds, endsAt: performance.now() + seconds * 1000 };
    this._samplerResult = null;
    this._RefreshSampler();
  }

  /** 到点收（Update 每 0.5 s 看一眼）。 */
  _TickSampler() {
    if (this._sampler && performance.now() >= this._sampler.endsAt) this._StopSampler(false);
    else if (this._sampler && this.tab === "sampler") this._RefreshSampler();
  }

  async _StopSampler(discard) {
    const running = this._sampler;
    if (!running) return;
    this._sampler = null;
    let result = null;
    try {
      const stopped = await running.sampler.Stop();
      if (!discard && stopped) {
        const profiler = this.host.profiler;
        result = FoldTrace(stopped.trace, { frames: profiler ? profiler.history : null, names: profiler ? profiler.names : null });
        result.seconds = running.seconds;
        result.when = new Date().toISOString();
      }
    } catch (error) {
      if (!discard) this._SetStatus(`采样结束时出错：${error.message || error}`);
    }
    if (discard || !this.ui) return;
    this._samplerResult = result;
    this._SetStatus(result ? `采样完成：${result.samples} 个样本` : "采样没有结果");
    this._RefreshSampler();
  }

  /** 采样接口可不可用：真 new 一次 Profiler 才知道响应头给没给，所以只探一次、记住结果。 */
  _SamplerSupport() {
    if (!this._samplerSupport) this._samplerSupport = SamplerSupport(window);
    return this._samplerSupport;
  }

  _RefreshSampler() {
    const ui = this.ui;
    if (!ui) return;
    const support = this._SamplerSupport();
    ui.samplerSupport.textContent = support.ok
      ? "可用。采样间隔由浏览器决定（Chromium 约 10–16 ms），所以要采够秒数；结果按帧时间把每个样本归到 B/E 桶里，能看到「渲染提交里最热的是 three 的哪个函数」「没打标记的工作是谁」。"
      : `不可用：${support.reason}`;
    ui.badgeSampler.classList.toggle("on", support.ok);
    ui.samplerBtn.disabled = !support.ok;
    if (this._sampler) {
      const left = Math.max(0, (this._sampler.endsAt - performance.now()) / 1000);
      ui.samplerBtn.textContent = "提前结束";
      ui.samplerStatus.textContent = `采样中… 还剩 ${left.toFixed(0)} 秒（玩法照跑，去打一会儿）`;
    } else {
      ui.samplerBtn.textContent = "开始采样";
      ui.samplerStatus.textContent = this._samplerResult
        ? `上一次：${this._samplerResult.samples} 个样本 / ${(this._samplerResult.durationMs / 1000).toFixed(1)} s，间隔 ≈ ${this._samplerResult.intervalMs.toFixed(1)} ms`
        : "";
    }
    const result = this._samplerResult;
    const box = ui.samplerResults;
    if (box._shown === result) return;
    box._shown = result;
    box.textContent = "";
    if (!result) return;
    const perFrame = result.frames > 0;
    const Section = (title, heads, rows) => {
      const h2 = this.doc.createElement("h2");
      h2.textContent = title;
      box.appendChild(h2);
      const table = this.doc.createElement("table");
      const head = table.insertRow();
      for (const text of heads) { const th = this.doc.createElement("th"); th.textContent = text; head.appendChild(th); }
      for (const cells of rows) {
        const tr = table.insertRow();
        for (const value of cells) tr.insertCell().textContent = String(value);
      }
      box.appendChild(table);
    };
    const Ms = (ms) => (perFrame ? (ms / result.frames).toFixed(3) : ms.toFixed(1));
    const unitHead = perFrame ? "ms/帧" : "ms";
    Section("自身耗时（这个函数自己，不含它调用的）", ["函数 @ 文件:行", "占比", unitHead, "样本"],
      result.self.slice(0, 30).map((row) => [row.key, `${row.pct.toFixed(1)}%`, Ms(row.ms), row.samples]));
    Section("含子调用（这个函数和它调用的一切）", ["函数 @ 文件:行", "占比", unitHead, "样本"],
      result.total.slice(0, 30).map((row) => [row.key, `${row.pct.toFixed(1)}%`, Ms(row.ms), row.samples]));
    if (result.buckets?.length) {
      Section("按桶归属（样本落在哪一条 B/E 里；每桶列最热的 4 个函数）", ["桶", "占比", unitHead, "最热的函数"],
        result.buckets.slice(0, 16).map((bucket) => [
          CPU_LABELS[bucket.key] ? `${bucket.key} · ${CPU_LABELS[bucket.key]}` : bucket.key,
          `${bucket.pct.toFixed(1)}%`, Ms(bucket.ms),
          bucket.top.slice(0, 4).map((fn) => `${fn.fn.split(" @ ")[0]} ${fn.pct.toFixed(0)}%`).join(" · "),
        ]));
    }
    Section("按文件", ["文件", "占比", unitHead, "样本"],
      result.files.slice(0, 15).map((row) => [row.file, `${row.pct.toFixed(1)}%`, Ms(row.ms), row.samples]));
    for (const table of box.querySelectorAll("table")) {
      for (const row of table.rows) {
        if (row.cells[0]) row.cells[0].className = "name";
        if (row.cells[3] && table.rows[0].cells[3]?.textContent === "最热的函数") { row.cells[3].style.textAlign = "left"; row.cells[3].className = "dim"; }
      }
    }
  }

  _RefreshEnvironment() {
    const ui = this.ui;
    const profiler = this.host.profiler;
    if (!profiler) return;
    const env = profiler.source ? (profiler.source.environment || {}) : profiler.Environment();
    const rows = [];
    if (env.gpu) rows.push(["显卡", env.gpu]);
    if (env.quality) rows.push(["画质档", env.quality]);
    if (env.internal) rows.push(["内部分辨率", env.internal]);
    if (env.output) rows.push(["输出分辨率", env.output]);
    if (env.window) rows.push(["窗口", `${env.window} · DPR ${env.dpr}`]);
    if (env.autoQuality) rows.push(["自动降档", env.autoQuality.enabled ? `开 · 第 ${env.autoQuality.step} 级 · 分辨率 ×${env.autoQuality.scale}` : "关"]);
    rows.push(["计时精度", `${env.timerResolutionMs ?? "?"} ms${env.crossOriginIsolated ? "（跨源隔离，精确）" : "（未隔离：单个 B/E 的 0.1 ms 只是量化，平均可信）"}`]);
    if (env.hardwareConcurrency) rows.push(["CPU 线程", `${env.hardwareConcurrency}${env.deviceMemoryGb ? ` · 内存 ≥${env.deviceMemoryGb} GB` : ""}`]);
    rows.push(["忙闲探针", env.busyMeter ? `开（本机最快 ${profiler.busyBaselineMs ? profiler.busyBaselineMs.toFixed(2) : "?"} ms）` : "无"]);
    rows.push(["CPU 压力接口", env.pressureAvailable ? "有（Compute Pressure）" : "无"]);
    rows.push(["JS 堆读数", env.jsHeap ? "有（performance.memory）" : "无"]);
    if (env.graphics) {
      const flags = Object.entries(env.graphics).filter(([, value]) => typeof value === "boolean")
        .map(([key, value]) => `${key}${value ? "" : "✕"}`).join(" ");
      if (flags) rows.push(["画质开关", flags]);
      if (env.graphics.renderScale != null) rows.push(["渲染分辨率滑杆", String(env.graphics.renderScale)]);
    }
    const key = JSON.stringify(rows);
    if (key === this._envKey) return;
    this._envKey = key;
    ui.envBox.textContent = "";
    for (const [k, v] of rows) {
      const a = this.doc.createElement("div"); a.textContent = k;
      const b = this.doc.createElement("div"); b.textContent = v;
      ui.envBox.appendChild(a); ui.envBox.appendChild(b);
    }
  }

  RefreshToolbar() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    if (!profiler || !ui) return;
    const recording = profiler.recording;
    ui.recBtn.textContent = recording ? "录制中" : "▶ 继续录制";
    ui.recBtn.className = recording ? "btn rec" : "btn paused";
    ui.activeBtn.setAttribute("aria-checked", profiler.activeOnly ? "true" : "false");
    if (ui.target.value !== String(profiler.targetFps)) ui.target.value = String(profiler.targetFps);
    const history = profiler.history;
    const n = history.length;
    const seconds = n > 1 ? (history[n - 1].t - history[0].t) / 1000 : 0;
    ui.bufferLabel.textContent = `${n} / ${profiler.historyMax} 帧 · ${seconds.toFixed(1)} s`;
    if (ui.capacity.value !== String(profiler.historyMax)) {
      if (!CAPACITY_CHOICES.includes(profiler.historyMax)) {
        const option = this.doc.createElement("option");
        option.value = String(profiler.historyMax);
        option.textContent = `${profiler.historyMax} 帧`;
        ui.capacity.appendChild(option);
      }
      ui.capacity.value = String(profiler.historyMax);
    }
    const sel = this.sel;
    if (!sel) {
      ui.viewLabel.textContent = recording ? "实时 · 最近 2 秒" : "已暂停 · 缓冲末尾 2 秒";
    } else {
      const index = profiler.IndexOfId(sel.last);
      if (sel.first === sel.last) {
        const record = index >= 0 ? history[index] : null;
        ui.viewLabel.textContent = record
          ? `第 #${record.id} 帧（${index + 1}/${n}）· ${IsLiveFrame(record) ? record.interval.toFixed(1) : "—"} ms`
          : `第 #${sel.first} 帧（已滚出缓冲）`;
      } else {
        ui.viewLabel.textContent = `第 #${sel.first}–#${sel.last} 帧（${sel.last - sel.first + 1} 帧）`;
      }
    }
    const firstIndex = sel ? profiler.IndexAtOrBefore(sel.first) : -1;
    const lastIndex = sel ? profiler.IndexAtOrBefore(sel.last) : -1;
    ui.firstBtn.disabled = n === 0 || firstIndex === 0;
    ui.prevBtn.disabled = n === 0 || firstIndex === 0;
    ui.nextBtn.disabled = n === 0 || (sel && lastIndex >= n - 1);
    ui.latestBtn.disabled = !sel && this.view.follow;
    // 抬头的状态小方块
    const source = profiler.source;
    ui.badgeGpu.classList.toggle("on", source ? !!source.timerAvailable : profiler.timerAvailable);
    ui.badgeBusy.classList.toggle("on", source ? !!source.busyBaselineMs : !!profiler.busyBaselineMs);
    ui.badgeSource.textContent = source ? `回放：${source.label || "(未命名)"}` : (recording ? "实时录制" : "已暂停");
    ui.badgeSource.classList.toggle("on", !source && recording);
  }

  RefreshSlow(profiler) {
    const ui = this.ui;
    if (!ui) return;
    if (this.sel) {
      if (this._selSummary) this._RefreshEvidence(this._selSummary, this.sel.first === this.sel.last ? "frame" : "range");
    } else if (profiler.recording || this._slowStale) {
      this._slowStale = false;
      // buckets:false —— 取证栏只要 worst 记录本体与事件计数，逐桶的分位数统计
      // 是这条便宜路径省掉的大头（10 秒窗口 × 几十个桶的排序，1 秒一次也嫌多）。
      this._RefreshEvidence(profiler.Summary(10, { buckets: false }), "live");
    }
    if (this.tab === "events" || this.tab === "draws" || this.tab === "counters") this.RefreshPage(false);
    if (this._drawPending && this.tab === "draws") this._RefreshDraws(false);
    // 场景节点普查：走自己的栈（不用被包了计数的 traverse），一秒一次；只在普查页或取证页需要时走。
    if (this.tab !== "census" && this._census) return;
    const census = profiler.Census(this.host.scene);
    this._census = census;
    if (!census) return;
    for (const row of census.roots) {
      const target = this._Row(ui.censusTable, ui.censusRows, row.name, 5, { bar: false });
      target.tr.className = "";
      target.name.textContent = row.name;
      target.cells[0].textContent = String(row.objects);
      target.cells[1].textContent = String(row.bones);
      target.cells[2].textContent = String(row.meshes);
      target.cells[3].textContent = String(row.skinned);
      target.cells[4].textContent = String(row.hidden);
    }
    const total = this._Row(ui.censusTable, ui.censusRows, "__total", 5, { bar: false });
    total.tr.className = "total";
    total.name.textContent = `合计（顶层 ${census.rootCount} 支）`;
    total.cells[0].textContent = String(census.total.objects);
    total.cells[1].textContent = String(census.total.bones);
    total.cells[2].textContent = String(census.total.meshes);
    total.cells[3].textContent = String(census.total.skinned);
    total.cells[4].textContent = String(census.total.hidden);
    this._Sweep(ui.censusRows);
    ui.tabButtons.get("census").count.textContent = String(census.total.objects);
  }

  _RefreshEvidence(summary, mode) {
    const ui = this.ui;
    ui.worstTitle.textContent = mode === "frame" ? "这一帧的归因"
      : (mode === "range" ? "掉帧取证 · 所选这一段里最差一帧" : "掉帧取证 · 最近 10 秒最差一帧");
    ui.eventsTitle.textContent = mode === "live" ? "事件统计 · 最近 10 秒" : "事件统计 · 所选帧";
    ui.worst.textContent = WorstLine(summary).split(" ｜ ").join("\n");
    this._worstId = summary.worst ? summary.worst.id : null;
    ui.worstJump.style.display = this._worstId != null && mode !== "frame" ? "" : "none";
    ui.events.textContent = EventsLine(summary)
      + ` ｜ 机器：${BusyLine(summary)}`
      + (mode === "live"
        ? (performance.memory
          ? ` ｜ 堆 ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`
          : "（此浏览器无 performance.memory）")
        : "");
  }
}

export default ProfilerEditor;
