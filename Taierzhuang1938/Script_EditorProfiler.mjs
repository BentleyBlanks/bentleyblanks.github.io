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
// 表格的分层与排版在 Script_ProfilerReport（与命令行 Script_ProfileCli 同一份口径）。
//
// ## 录制与回放（照 Unity Profiler）
// - 工具条：录制 / 暂停（空格）、清空、逐帧 ◀ ▶（←/→，Shift 一次十帧）、上/下一个尖峰（[ / ]）、
//   最新（End / Esc / 双击帧图：回到实时跟随）、缓冲帧数、保存 / 加载录制（JSON）。
// - 帧图：按根桶**堆叠**的主线程（AI / 物理 / 渲染提交…各一色）+ 顶上一截「浏览器侧」
//   + GPU 合计折线；点一帧 = 选中这一帧，拖动 = 选一段；滚轮缩放、Shift+滚轮平移，
//   下面的全缓冲缩略条可以直接拖。选中后视窗不再跟着新帧滚（录制照常进行），
//   「最新」回到跟随。
// - 选中一帧：两张表换成**这一帧**的数（ms / 占比 / 调用次数），下面出时间轴 ——
//   每一对 B/E 一条（同名多次各是各的，`ai/act` 一个兵一条），GPU 分段另占一行；
//   滚轮缩放、拖动平移、点一条（或点表格里的一行）高亮同名的所有实例。
// - 选中一段：表是这一段的 avg / p95 / max，取证栏是这一段里最差的那一帧。
//
// ## 自身开销
// 记在「编辑器叠加层（含本面板）」桶里：帧图有新数据时每 3 帧一画、实时表 0.5 s 一刷
//（暂停或看选区时不刷）、取证/事件/场景普查 1 s 一刷（用 buckets:false 的便宜汇总）——
// 用户实测过一次 max 10 ms 的自刷新突刺，节流与便宜路径就是冲它去的。
//
// **两张表都是数据驱动的**：汇总里出现什么 key 就显示什么行，不再有写死的名单。
// GPU 那一列显示的是**英文原名**，与 Script_Post 的 passes 数组一字不差；中文解释
// 进 title（鼠标停上去才出），免得译名和帧图对不上号。

import { CpuRows, GpuRows, CPU_LABELS, GPU_NOTES, SHADOW_NOTE, WorstLine, EventsLine, FormatSnapshot,
  FormatFrameTimeline, RootOf } from "./Script_ProfilerReport.mjs";
import { SAMPLE_STRIDE, GPU_SEG_STRIDE, IsLiveFrame } from "./Script_Profiler.mjs";

// 帧图按根桶堆叠的颜色与叠放次序（自下而上）。没登记的根桶按名字散列取色、叠在最上面。
const ROOT_COLORS = {
  input: "#2f7f96",
  player: "#46a3c0",
  viewmodel: "#5fc6d8",
  ai: "#4a7fd4",
  physics: "#e08a3c",
  combat: "#d25a4a",
  vfx: "#d9b44a",
  story: "#8a74e0",
  spawn: "#a48ee8",
  streamer: "#b58a5a",
  hud: "#c26fae",
  overlay: "#7d828c",
  gi: "#a3c95a",
  frameSetup: "#5aa870",
  matrix: "#6fbf73",
  firstPersonShadow: "#78b36e",
  actorBatch: "#8fd18a",
  post: "#3f9d5a",
  other: "#565b63",
};
const ROOT_ORDER = Object.keys(ROOT_COLORS);
const BROWSER_COLOR = "#2e333c";
const GPU_LINE = "#e05fd0";
const CAPACITY_CHOICES = [300, 900, 1800, 3600, 7200];

function ColorOf(root) {
  const known = ROOT_COLORS[root];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < root.length; i += 1) hash = (hash * 31 + root.charCodeAt(i)) | 0;
  return `hsl(${((hash % 360) + 360) % 360}, 45%, 58%)`;
}

function Tail(key) {
  const cut = key.lastIndexOf("/");
  return cut < 0 ? key : key.slice(cut + 1);
}

const POPUP_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px 18px; background: var(--ui-surface); color: var(--ui-text);
         font: 12px/1.55 var(--ui-font); }
  h1 { font-size: 21px; padding: 14px 18px; background: var(--ui-black); margin: -14px -18px 10px; color: var(--ui-bright); letter-spacing: 1px; }
  h2 { font-size: 12px; margin: 16px 0 4px; color: var(--ui-gold); letter-spacing: 1px; }
  .num, td, .big span { font-family: Consolas, "Cascadia Mono", monospace; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 8px;
             padding: 6px 8px; background: var(--ui-black); border: 1px solid var(--ui-line); }
  .toolbar .sep { width: 1px; align-self: stretch; background: var(--ui-line); margin: 0 4px; }
  .toolbar button { margin: 0; padding: 3px 10px; }
  .toolbar select { background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-line); font: inherit; padding: 2px 4px; }
  button.rec { color: #ff7a70; border-color: #7a3430; }
  button.paused { color: var(--ui-gold); border-color: var(--ui-gold); }
  button:disabled { opacity: 0.4; cursor: default; }
  #viewLabel { font-family: Consolas, monospace; color: var(--ui-bright); min-width: 220px; }
  #bufferLabel, #statusLabel { color: var(--ui-muted); font-size: 11px; }
  #statusLabel { margin-left: auto; }
  .head { display: flex; align-items: baseline; gap: 18px; margin: 4px 0 8px; }
  .big { font-size: 30px; color: var(--ui-bright); }
  .big em { font-size: 12px; font-style: normal; color: var(--ui-muted); margin-left: 4px; }
  .stats { color: var(--ui-muted); }
  .stats b { color: var(--ui-text); font-weight: normal; font-family: Consolas, monospace; }
  #badge { font-size: 11px; color: var(--ui-muted); margin-left: 8px; }
  canvas { display: block; background: var(--ui-black); border: 1px solid var(--ui-line); width: 100%; }
  canvas.chart { cursor: crosshair; }
  canvas.overview { cursor: ew-resize; border-top: none; }
  canvas.timeline { cursor: grab; }
  .legend { color: var(--ui-muted); font-size: 11px; margin: 3px 0 0; }
  .legend i { display: inline-block; width: 9px; height: 9px; margin: 0 4px 0 10px; vertical-align: -1px; }
  .hint { color: var(--ui-muted); font-size: 11px; margin: 2px 0 0; }
  .tip { position: fixed; z-index: 10; pointer-events: none; display: none; white-space: pre;
         background: rgba(7, 8, 11, 0.94); color: var(--ui-text); border: 1px solid var(--ui-line);
         padding: 5px 8px; font: 11px/1.5 Consolas, "Cascadia Mono", monospace; max-width: 520px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 1px 8px; border-bottom: 1px solid var(--ui-line); white-space: nowrap; }
  th { color: var(--ui-muted); font-weight: normal; }
  th:first-child, td:first-child { text-align: left; }
  table.single th:nth-child(4), table.single td:nth-child(4) { display: none; }
  tr.row { cursor: pointer; }
  tr.row:hover td { background: rgba(255, 255, 255, 0.03); }
  tr.focus td { background: rgba(201, 162, 39, 0.16); color: var(--ui-bright); }
  td.bar { width: 22%; padding: 0 0 0 8px; }
  td.bar i { display: block; height: 7px; background: #38607e; min-width: 1px; }
  tr.total td { border-top: 1px solid var(--ui-line); color: var(--ui-bright); }
  tr.self td { color: var(--ui-muted); }
  .note { color: var(--ui-muted); font-size: 11px; margin: 4px 0; }
  .warn { color: #c9a227; }
  .worst { border: 1px solid var(--ui-line); background: var(--ui-black); padding: 8px 10px; }
  .worst b { color: #d88b85; font-family: Consolas, monospace; font-weight: normal; }
  button { background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-line);
           padding: 4px 12px; cursor: pointer; font: inherit; margin: 10px 0 4px; }
  button:hover:not(:disabled) { border-color: var(--ui-gold); color: var(--ui-gold); background: var(--ui-selection); }
  textarea { width: 100%; height: 140px; background: var(--ui-black); color: var(--ui-muted);
             border: 1px solid var(--ui-line); display: none; font: 11px Consolas, monospace; }
`;

const CPU_HEADS = {
  live: ["系统", "avg", "p95", "max", "调用/帧", "矩阵访问", "分配KB", ""],
  frame: ["系统", "ms", "占主线程", "", "调用", "矩阵访问", "分配KB", ""],
};
const GPU_HEADS = {
  live: ["pass", "GPU avg", "GPU p95", "GPU max", "提交 CPU", "draw", "三角", ""],
  frame: ["pass", "GPU ms", "占 GPU", "", "提交 CPU", "draw", "三角", ""],
};

export class ProfilerEditor {
  static id = "profiler";
  static label = "Profiler";
  static hint = "独立窗口：录制/暂停、点帧回放单帧与时间轴、拖选一段看分位数；CPU 逐系统 / GPU 逐 pass；玩法照跑";
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

    // 帧图视窗：follow = 右端跟着最新帧；否则右端钉在 endId 这一帧。count = 视窗里几帧。
    this.view = { follow: true, count: 300, endId: 0 };
    this.sel = null;         // 选区 { first, last }（帧号，闭区间；一帧时两者相等）
    this._selSummary = null;
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
    this.host.profiler?.Disable();
    if (this.win && !this.win.closed) { try { this.win.close(); } catch (error) { /* 已被用户关了 */ } }
    this.win = null;
    this.doc = null;
    this.ui = null;
  }

  // -------------------------------------------------------------------------
  // 独立窗口
  // -------------------------------------------------------------------------

  OpenWindow() {
    let win = null;
    try {
      win = window.open("", "tzProfiler",
        "width=1120,height=1080,menubar=no,toolbar=no,location=no");
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
    // 从当前入口复制实际版本 URL，独立窗口与游戏共用同一套主题。
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
    const Button = (parent, text, title, onClick) => {
      const button = El("button", "", text);
      if (title) button.title = title;
      // 点完把焦点还给页面：否则空格（录制/暂停快捷键）会再「按」一次这颗按钮。
      button.addEventListener("click", () => { button.blur(); if (this.ui) onClick(); });
      parent.appendChild(button);
      return button;
    };
    const Sep = (parent) => parent.appendChild(El("span", "sep"));
    const body = doc.body;
    const title = El("h1", "", "台儿庄：血战滕县 · 性能剖析");
    const badge = El("span");
    badge.id = "badge";
    title.appendChild(badge);
    body.appendChild(title);

    // --- 工具条 ---
    const toolbar = El("div", "toolbar");
    const recBtn = Button(toolbar, "● 录制中", "空格：暂停 / 继续录制。暂停只停记录，钩子不拆，缓冲原样留着逐帧回看",
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
    const capacity = El("select");
    capacity.title = "缓冲帧数（环形，满了从最老的丢）";
    for (const frames of CAPACITY_CHOICES) {
      const option = El("option", "", `${frames} 帧`);
      option.value = String(frames);
      capacity.appendChild(option);
    }
    capacity.addEventListener("change", () => { if (this.ui) this.SetCapacity(Number(capacity.value)); });
    toolbar.appendChild(capacity);
    const bufferLabel = El("span", "", "");
    bufferLabel.id = "bufferLabel";
    toolbar.appendChild(bufferLabel);
    Sep(toolbar);
    Button(toolbar, "保存录制", "整条缓冲存成 JSON（命令行 --print=<文件> --frame=<帧号> 也能读）",
      () => this.SaveRecording());
    const fileInput = El("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (file && this.ui) this.LoadRecordingFile(file);
    });
    toolbar.appendChild(fileInput);
    Button(toolbar, "加载录制", "读回一份保存过的录制（会停掉当前录制）", () => fileInput.click());
    const statusLabel = El("span", "", "");
    statusLabel.id = "statusLabel";
    toolbar.appendChild(statusLabel);
    body.appendChild(toolbar);

    const head = El("div", "head");
    const big = El("div", "big");
    const fps = El("span", "", "—");
    big.appendChild(fps);
    big.appendChild(El("em", "", "fps"));
    head.appendChild(big);
    const headStats = El("div", "stats", "—");
    head.appendChild(headStats);
    body.appendChild(head);

    // --- 帧图 + 全缓冲缩略条 ---
    const chart = El("canvas", "chart");
    chart.style.height = "170px";
    body.appendChild(chart);
    const overview = El("canvas", "overview");
    overview.style.height = "26px";
    overview.title = "整条缓冲；框住的是帧图视窗，点/拖到哪里帧图就看哪里";
    body.appendChild(overview);
    const legend = El("div", "legend");
    body.appendChild(legend);
    body.appendChild(El("div", "hint",
      "点一帧选中 · 拖动选一段 · 滚轮缩放 · Shift+滚轮平移 · 双击回到最新 ｜ ← → 逐帧 · [ ] 尖峰 · 空格 录制/暂停"));

    // --- 时间轴（选中单帧时出现）---
    const tlTitle = El("h2", "", "时间轴");
    body.appendChild(tlTitle);
    const tlNote = El("div", "note", "");
    body.appendChild(tlNote);
    const timeline = El("canvas", "timeline");
    timeline.style.height = "120px";
    timeline.style.display = "none";
    body.appendChild(timeline);

    const MakeTable = (heads) => {
      const table = El("table");
      const tr = El("tr");
      const cells = [];
      for (const text of heads) {
        const th = El("th", "", text);
        cells.push(th);
        tr.appendChild(th);
      }
      table.appendChild(tr);
      return { table, heads: cells };
    };
    const cpuTitle = El("h2", "", "CPU · 主线程");
    body.appendChild(cpuTitle);
    const cpu = MakeTable(CPU_HEADS.live);
    body.appendChild(cpu.table);

    const gpuTitle = El("h2", "", "GPU · 逐 pass（ms/帧，名字是帧图里的英文原名）");
    body.appendChild(gpuTitle);
    const gpu = MakeTable(GPU_HEADS.live);
    body.appendChild(gpu.table);
    const gpuNote = El("div", "note", "");
    body.appendChild(gpuNote);
    body.appendChild(El("div", "note", SHADOW_NOTE));

    const worstTitle = El("h2", "", "掉帧取证（最近 10 秒最差一帧）");
    body.appendChild(worstTitle);
    const worst = El("div", "worst", "—");
    body.appendChild(worst);
    const worstJump = Button(body, "定位到这一帧", "在帧图上选中这一帧，看它的时间轴",
      () => { if (this._worstId != null) this.SelectFrame(this._worstId); });

    const eventsTitle = El("h2", "", "事件（最近 10 秒）");
    body.appendChild(eventsTitle);
    const events = El("div", "stats", "—");
    body.appendChild(events);

    body.appendChild(El("h2", "", "场景节点普查（scene 顶层子树，每秒一次，始终是实时的）"));
    const census = MakeTable(["子树", "节点", "骨骼", "网格", "蒙皮", "隐藏节点"]);
    body.appendChild(census.table);

    const copyBtn = El("button", "", "导出快照 JSON");
    body.appendChild(copyBtn);
    const textBtn = El("button", "", "导出文本表格");
    body.appendChild(textBtn);
    const copyBox = El("textarea");
    copyBox.readOnly = true;
    body.appendChild(copyBox);
    const Dump = (text) => {
      copyBox.style.display = "block";
      copyBox.value = text;
      copyBox.focus();
      copyBox.select();
    };
    copyBtn.addEventListener("click", () => { if (this.ui) Dump(this.SnapshotJson()); });
    textBtn.addEventListener("click", () => { if (this.ui) Dump(this.SnapshotText()); });

    const tip = El("div", "tip");
    body.appendChild(tip);

    this.ui = {
      badge, fps, headStats, chart, overview, legend, timeline, tlTitle, tlNote, tip,
      recBtn, firstBtn, prevBtn, nextBtn, latestBtn, viewLabel, capacity, bufferLabel, statusLabel,
      cpuTitle, cpuTable: cpu.table, cpuHeads: cpu.heads, gpuTitle, gpuTable: gpu.table, gpuHeads: gpu.heads, gpuNote,
      worstTitle, worst, worstJump, eventsTitle, events, censusTable: census.table,
      cpuRows: new Map(), gpuRows: new Map(), censusRows: new Map(),
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
      census: this._census,
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
      text += `\n\n${FormatFrameTimeline(profiler.FrameById(this.sel.first), profiler.names)}`;
    }
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

  SaveRecording() {
    const profiler = this.host.profiler;
    if (!profiler) return;
    const post = this.host.post;
    const data = profiler.ExportRecording({
      label: profiler.source?.label || "panel",
      userAgent: navigator.userAgent,
      canvas: this.host.canvas ? `${this.host.canvas.width}x${this.host.canvas.height}` : null,
      postTarget: post ? `${post.width}x${post.height} · ${post.quality}` : null,
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
      this.ui.dump(text);
      this._SetStatus(`下载失败，JSON 放在页面底部文本框（${size}）`);
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
    this._SetStatus(`已加载 ${label || data.label || "录制"}（${count} 帧，录于 ${data.when || "?"}）`);
    this._Invalidate();
    return count;
  }

  _SetStatus(text) {
    if (this.ui) this.ui.statusLabel.textContent = text;
  }

  /** 状态整体变了（暂停 / 清空 / 导入 / 取消选中）：立刻把所有视图重画一遍，不等下一帧节流。 */
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
    const summary = profiler.SummaryRange(first, last);
    if (summary.frames === 0) {
      this._SetStatus("选中的帧已经滚出缓冲区（缓冲调大一点，或先暂停再选）");
      this.sel = null;
      this.view.follow = true;
      this._Invalidate();
      return;
    }
    this._selSummary = summary;
    const mode = first === last ? "frame" : "range";
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

  DrawChart() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    if (!profiler || !ui) return;
    this._chartRev = profiler.revision;
    const { ctx, W, H } = this._Fit(ui.chart, 170);
    const history = profiler.history;
    const { start, end, slots, n } = this._ChartWindow();
    const barW = W / slots;
    const count = end - start;
    this._layout = { start, end, slots, barW, W, H };
    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, W, H);

    // 纵轴：视窗里 90 分位的间隔 × 1.25 往上取档，尖刺顶出去的帧在顶上打红点。
    const values = [];
    for (let i = start; i < end; i += 1) {
      const row = history[i];
      values.push(IsLiveFrame(row) ? row.interval : row.cpuMs);
    }
    values.sort((a, b) => a - b);
    const p90 = values.length ? values[Math.floor(values.length * 0.9)] : 16.7;
    const top = [33.3, 50, 66.7, 100, 200, 500, 1000].find((value) => value >= p90 * 1.25) || 1000;
    const plotTop = 12;
    const scale = (H - plotTop) / top;
    const Y = (ms) => H - ms * scale;
    ctx.font = "10px Consolas, monospace";
    for (const line of [16.7, 33.3, 66.7, 100, 200, 500]) {
      if (line >= top) break;
      ctx.fillStyle = "#23262d";
      ctx.fillRect(0, Math.round(Y(line)), W, 1);
      ctx.fillStyle = "#5d626c";
      ctx.fillText(`${line}`, 3, Y(line) - 2);
    }
    ctx.fillStyle = "#5d626c";
    ctx.fillText(`${top} ms`, 3, plotTop - 2);
    const X = (i) => W - (end - i) * barW;
    const bw = Math.max(1, barW - (barW > 3 ? 1 : 0));

    // 堆叠：根桶按固定次序自下而上，每种颜色一次 fill。
    const present = new Set();
    for (let i = start; i < end; i += 1) {
      const cpu = history[i].cpu;
      for (const key in cpu) if (key.indexOf("/") < 0) present.add(key);
    }
    const order = ROOT_ORDER.filter((key) => key === "other" || present.has(key));
    for (const key of [...present].sort()) if (!ROOT_COLORS[key]) order.splice(order.length - 1, 0, key);
    const base = new Float32Array(count);
    const limit = H - plotTop + 2;
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
        ctx.rect(X(i), H - to, bw, to - from);
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
      if (to > from) ctx.rect(X(i), H - to, bw, to - from);
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

    // 标记：顶出纵轴的尖刺（红）、GC（白）、新编译着色器（金）、暂停接缝（竖虚线）
    for (let i = start; i < end; i += 1) {
      const row = history[i];
      const x = X(i);
      if (IsLiveFrame(row) && row.interval > top) { ctx.fillStyle = "#e0453c"; ctx.fillRect(x, 0, bw, 4); }
      if (row.gcMb > 0) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x, 5, bw, 3); }
      if (row.newPrograms > 0) { ctx.fillStyle = "#c9a227"; ctx.fillRect(x, 9, bw, 3); }
      if (row.gap) {
        ctx.fillStyle = "#6a6f78";
        for (let y = 0; y < H; y += 6) ctx.fillRect(Math.round(x) - 1, y, 1, 3);
      }
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
        ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
        ctx.fillRect(x0, 0, x1 - x0, H);
        ctx.strokeStyle = "#e8c04a";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(x0) + 0.5, 0.5, Math.max(1, Math.ceil(x1 - x0) - 1), H - 1);
      }
    }
    if (this._hover >= start && this._hover < end) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(X(this._hover) + barW * 0.5, 0, 1, H);
    }
    if (n === 0) {
      ctx.fillStyle = "#5d626c";
      ctx.font = "12px sans-serif";
      ctx.fillText(profiler.recording ? "等待第一帧…" : "缓冲是空的：按「录制」开始记", 12, H / 2);
    }

    const legendKey = order.join(",");
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
      Swatch(BROWSER_COLOR, CPU_LABELS.browser);
      Swatch(GPU_LINE, "GPU 合计（折线）");
      ui.legend.appendChild(this.doc.createTextNode(" ｜ 顶上：红=顶出纵轴 白=GC 金=新编译着色器 ｜ 竖虚线=暂停接缝"));
    }
    this._DrawOverview();
  }

  _DrawOverview() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    const { ctx, W, H } = this._Fit(ui.overview, 26);
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0, 0, W, H);
    const history = profiler.history;
    const n = history.length;
    if (!n) return;
    const capacity = Math.max(n, profiler.historyMax);
    const perPx = capacity / W;
    const x0 = W - (n / capacity) * W;   // 缓冲没满时靠右
    const columns = Math.ceil(n / perPx);
    for (let c = 0; c < columns; c += 1) {
      const from = Math.floor(c * perPx);
      const to = Math.min(n, Math.max(from + 1, Math.floor((c + 1) * perPx)));
      let peak = 0;
      for (let i = from; i < to; i += 1) {
        const row = history[i];
        const value = IsLiveFrame(row) ? row.interval : row.cpuMs;
        if (value > peak) peak = value;
      }
      ctx.fillStyle = peak > 33.4 ? "#a33a33" : (peak > 17 ? "#8a7424" : "#2f6e45");
      const h = Math.min(H - 2, (peak / 50) * (H - 2));
      ctx.fillRect(x0 + c, H - h, 1, h);
    }
    const { start, end } = this._ChartWindow();
    const wx0 = x0 + start / perPx;
    const wx1 = x0 + end / perPx;
    ctx.fillStyle = "rgba(232, 192, 74, 0.12)";
    ctx.fillRect(wx0, 0, Math.max(2, wx1 - wx0), H);
    ctx.strokeStyle = "#e8c04a";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(wx0) + 0.5, 0.5, Math.max(2, Math.ceil(wx1 - wx0) - 1), H - 1);
    if (this.sel) {
      const index = profiler.IndexAtOrBefore(this.sel.last);
      if (index >= 0) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x0 + index / perPx, 0, 1, H); }
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
    lines.push(`第 #${row.id} 帧 · 整帧 ${F(row.interval)} ms${row.gap ? "（接缝帧：间隔是暂停时长）" : ""}`);
    lines.push(`主线程 ${F(row.cpuMs)} ｜ GPU ${F(row.gpuTotal)} ｜ 浏览器侧 ${IsLiveFrame(row) ? F(Math.max(0, row.interval - row.cpuMs)) : "—"}`);
    const roots = Object.entries(row.cpu).filter(([key]) => key.indexOf("/") < 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([key, value]) => `${CPU_LABELS[key] || key} ${value.toFixed(2)}`);
    if (roots.length) lines.push(roots.join(" · "));
    const marks = [`draw ${row.calls}`];
    if (row.gcMb > 0) marks.push(`GC ${row.gcMb.toFixed(1)} MB`);
    if (row.newPrograms > 0) marks.push(`新编译着色器 ${row.newPrograms}`);
    if (row.longtaskMs > 0) marks.push(`长任务 ${row.longtaskMs.toFixed(0)} ms`);
    lines.push(marks.join(" ｜ "));
    // 编的是谁：一个程序一行，悬停在金色标记那一帧上就能指名道姓。
    if (row.newProgramNames) for (const name of row.newProgramNames) lines.push(`  现编：${name}`);
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
        ? "选中的是一段帧：表格是这一段的 avg / p95 / max。点单独一帧才出时间轴。"
        : "在帧图上点一帧（或暂停后按 ←），看这一帧里每一次 B/E 调用的先后与长短（Unity 的 Timeline 视图）。";
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
      ? `主线程 B/E 实例 ${sampleCount} 条、GPU 分段 ${segs ? segs.length / GPU_SEG_STRIDE : 0} 段。`
        + "滚轮缩放 · 拖动平移 · 双击复位 · 点一条高亮同名的全部实例（表格同步）。"
        + "空白处 = 没打标记的主线程工作；主线程结束线之后到帧末是浏览器侧。"
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

    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER, 0, plotW, H);
    ctx.clip();
    // 主线程工作区间 / 浏览器侧 / 16.7 ms 预算线
    const cpuEnd = X(record.cpuMs);
    ctx.fillStyle = "#0e1015";
    ctx.fillRect(X(0), RULER, cpuEnd - X(0), H - RULER);
    if (IsLiveFrame(record) && record.interval > record.cpuMs) {
      const x1 = X(record.interval);
      ctx.fillStyle = "#131722";
      ctx.fillRect(cpuEnd, RULER, x1 - cpuEnd, H - RULER);
      ctx.fillStyle = "#4a5060";
      ctx.font = "10px sans-serif";
      if (x1 - cpuEnd > 90) ctx.fillText("浏览器侧 / 等 vsync", cpuEnd + 6, gpuY - 2);
    }
    ctx.fillStyle = "#7a808c";
    ctx.fillRect(Math.round(cpuEnd), RULER, 1, H - RULER);
    ctx.fillStyle = "#3a3f49";
    for (let y = RULER; y < H; y += 5) ctx.fillRect(Math.round(X(16.7)), y, 1, 2);

    // 标尺
    const niceSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const step = niceSteps.find((value) => (value / span) * plotW >= 64) || 1000;
    ctx.font = "10px Consolas, monospace";
    for (let t = Math.ceil(start / step) * step; t <= start + span; t += step) {
      const x = X(t);
      ctx.fillStyle = "#2a2d34";
      ctx.fillRect(Math.round(x), RULER - 4, 1, H - RULER + 4);
      ctx.fillStyle = "#6a707a";
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
        ctx.globalAlpha = focus && focus !== key ? 0.45 : 1;
        ctx.fillRect(x0, y + 1, w, ROW - 2);
        ctx.globalAlpha = 1;
        if (focus === key || (hover && hover.kind === "cpu" && hover.slot === slot)) {
          ctx.strokeStyle = "#ffffff";
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
        ctx.fillStyle = slot % 2 ? "#335f88" : "#3b6f9e";
        const focused = focus === key || focus === `post/${key}`;
        ctx.globalAlpha = focus && !focused ? 0.45 : 1;
        ctx.fillRect(x0, gpuY + 1, w, ROW - 2);
        ctx.globalAlpha = 1;
        if (focused || (hover && hover.kind === "gpu" && hover.slot === slot)) {
          ctx.strokeStyle = "#ffffff";
          ctx.strokeRect(Math.floor(x0) + 0.5, gpuY + 1.5, Math.max(1, Math.ceil(w) - 1), ROW - 3);
        }
        const gpuMs = record.gpuSegMs && slot < record.gpuSegMs.length ? record.gpuSegMs[slot] : null;
        this._BarLabel(ctx, gpuMs == null ? key : `${key} GPU ${gpuMs.toFixed(2)}`, key, x0, w, gpuY, ROW);
      }
    }
    ctx.restore();

    // 行名
    ctx.fillStyle = "#0b0c10";
    ctx.fillRect(0, 0, GUTTER, H);
    ctx.fillStyle = "#8a909a";
    ctx.font = "11px sans-serif";
    ctx.fillText("主线程", 6, RULER + 13);
    ctx.fillText("GPU 段", 6, gpuY + 13);
    ctx.fillStyle = "#2a2d34";
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
    ctx.fillStyle = "#0b0c10";
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

  _Row(table, cache, key, cols, { bar = true, clickable = false } = {}) {
    let row = cache.get(key);
    if (!row) {
      const doc = this.doc;
      const tr = doc.createElement("tr");
      const name = doc.createElement("td");
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
        barCell.className = "bar";
        barEl = doc.createElement("i");
        barCell.appendChild(barEl);
        tr.appendChild(barCell);
      }
      if (clickable) tr.addEventListener("click", () => { if (this.ui) this.FocusKey(key); });
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

  /** mode：live（实时最近 2 秒）/ range（选中一段）/ frame（选中一帧：列换成 ms、占比、调用次数）。 */
  RefreshTables(summary, mode = "live") {
    const ui = this.ui;
    const single = mode === "frame";
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
      ui.cpuTitle.textContent = `CPU · 主线程（${this.host.profiler?.recording ? "最近" : "缓冲末尾"} 2 秒逐系统，ms/帧；缩进行是子桶，点一行在时间轴上高亮）`;
      ui.gpuTitle.textContent = "GPU · 逐 pass（ms/帧，名字是帧图里的英文原名）";
    } else {
      ui.cpuTitle.textContent = `CPU · 主线程（${span}，${single ? "ms" : "ms/帧"}；缩进行是子桶，点一行在时间轴上高亮）`;
      ui.gpuTitle.textContent = `GPU · 逐 pass（${span}，名字是帧图里的英文原名）`;
    }

    // --- CPU 表 ---
    const cpuTotal = summary.cpuTotal.avg;
    const cpuMax = Math.max(0.001, cpuTotal);
    for (const item of CpuRows(summary)) {
      const row = this._Row(ui.cpuTable, ui.cpuRows, item.key, 6, { clickable: !item.selfRow });
      row.tr.className = `${item.selfRow ? "self" : ""} row${item.key === focus ? " focus" : ""}`;
      row.name.textContent = `${"　".repeat(item.depth)}${item.label}`;
      row.name.title = item.key;
      const avg = item.selfRow ? item.self : item.stat.avg;
      row.cells[0].textContent = F(avg);
      if (single) {
        row.cells[1].textContent = Pct(avg, cpuTotal);
        row.cells[2].textContent = "";
      } else {
        row.cells[1].textContent = item.selfRow ? "" : F(item.stat.p95);
        row.cells[2].textContent = item.selfRow ? "" : F(item.stat.max);
      }
      row.cells[3].textContent = item.selfRow || item.calls == null ? ""
        : (single ? Int(item.calls) : item.calls.toFixed(item.calls >= 10 ? 0 : 1));
      row.cells[4].textContent = item.selfRow ? "" : Int(item.visits);
      row.cells[5].textContent = item.selfRow || item.allocKb == null ? "" : item.allocKb.toFixed(1);
      row.bar.style.width = `${Math.min(100, (avg / cpuMax) * 100)}%`;
    }
    const TotalRow = (table, cache, key, label, stat, title = "") => {
      const row = this._Row(table, cache, key, 6);
      row.tr.className = "total";
      row.name.textContent = label;
      row.name.title = title;
      row.cells[0].textContent = F(stat.avg);
      row.cells[1].textContent = single ? "" : F(stat.p95);
      row.cells[2].textContent = single ? "" : F(stat.max);
      for (let i = 3; i < 6; i += 1) row.cells[i].textContent = "";
      row.bar.style.width = "0";
      return row;
    };
    TotalRow(ui.cpuTable, ui.cpuRows, "__total", "主线程合计", summary.cpuTotal);
    TotalRow(ui.cpuTable, ui.cpuRows, "__browser", CPU_LABELS.browser, summary.browser,
      summary.loafAvailable
        ? "整帧间隔 − 主线程工作；本浏览器支持 long-animation-frame，样式布局耗时见取证栏"
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
    }
    const gpuTotalRow = TotalRow(ui.gpuTable, ui.gpuRows, "__total", "GPU 合计", summary.gpuTotal);
    if (!summary.gpuFrames) for (let i = 0; i < 3; i += 1) gpuTotalRow.cells[i].textContent = "—";
    gpuTotalRow.cells[4].textContent = String(summary.calls);
    gpuTotalRow.cells[5].textContent = `${(summary.triangles / 1e6).toFixed(2)}M`;
    this._Sweep(ui.gpuRows);

    // --- 抬头 ---
    ui.fps.textContent = summary.fps ? summary.fps.toFixed(0) : "—";
    const source = this.host.profiler?.source;
    ui.badge.textContent = `${summary.timerAvailable ? "GPU 计时可用" : "GPU 计时不可用"}`
      + `${source ? ` · 回放加载的录制：${source.label || "(未命名)"}` : ""}`;
    const post = this.host.post;
    const frameWord = single ? "整帧" : "整帧 avg";
    ui.headStats.innerHTML = `${frameWord} <b>${F(summary.frame.avg)}</b>`
      + (single ? "" : ` / p95 <b>${F(summary.frame.p95)}</b> / max <b>${F(summary.frame.max)}</b>`)
      + ` ms ｜ 主线程 <b>${F(summary.cpuTotal.avg)}</b> ms`
      + ` ｜ GPU <b>${summary.gpuFrames ? F(summary.gpuTotal.avg) : "—"}</b> ms<br>`
      + `draw calls <b>${summary.calls}</b> ｜ 三角 <b>${(summary.triangles / 1e6).toFixed(2)}M</b>`
      + ` ｜ 合成靶 <b>${post ? `${post.width}×${post.height}` : "—"}</b>`
      + ` ｜ 画质 <b>${post ? post.quality : "—"}</b>`;
  }

  RefreshToolbar() {
    const profiler = this.host.profiler;
    const ui = this.ui;
    if (!profiler || !ui) return;
    const recording = profiler.recording;
    ui.recBtn.textContent = recording ? "● 录制中" : "▶ 继续录制";
    ui.recBtn.className = recording ? "rec" : "paused";
    const history = profiler.history;
    const n = history.length;
    const seconds = n > 1 ? (history[n - 1].t - history[0].t) / 1000 : 0;
    ui.bufferLabel.textContent = `缓冲 ${n} / ${profiler.historyMax} 帧 · ${seconds.toFixed(1)} s`;
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
    // 场景节点普查：走自己的栈（不用被包了计数的 traverse），一秒一次；始终是实时的。
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
  }

  _RefreshEvidence(summary, mode) {
    const ui = this.ui;
    ui.worstTitle.textContent = mode === "frame" ? "这一帧的归因"
      : (mode === "range" ? "掉帧取证（所选这一段里最差一帧）" : "掉帧取证（最近 10 秒最差一帧）");
    ui.eventsTitle.textContent = mode === "live" ? "事件（最近 10 秒）" : "事件（所选帧）";
    ui.worst.textContent = WorstLine(summary);
    this._worstId = summary.worst ? summary.worst.id : null;
    ui.worstJump.style.display = this._worstId != null && mode !== "frame" ? "" : "none";
    ui.events.textContent = EventsLine(summary)
      + (mode === "live"
        ? (performance.memory
          ? ` ｜ 堆 ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`
          : "（此浏览器无 performance.memory）")
        : "");
  }
}

export default ProfilerEditor;
