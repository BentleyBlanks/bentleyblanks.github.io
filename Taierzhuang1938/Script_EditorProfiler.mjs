// Profiler：编辑器「渲染调试（可叠加）」组的叠加工具，不接管相机、不暂停玩法。
//
// 设置面板里就是一颗开关，**没有页面内面板**（用户点名去掉的）：唯一的读数界面
// 是 window.open 的独立窗口 —— 游戏拿着指针锁的时候页面内面板既点不到也挡画面，
// 独立窗口可以拖到第二块屏上边玩边看，掉帧发生的那一刻图上就有现场。
// 窗口没有自己的脚本 —— 所有 DOM 更新由本 overlay 的 Update(dt) 从游戏侧推过去
//（editor.UpdateOverlays 在每一条帧路径上都会调它）。弹窗被拦截时 Enter 直接抛错，
// ToggleOverlay 会收掉这次开启（开关弹回），不留一个「开着却什么都看不见」的状态。
//
// 计时内核在 Script_Profiler（Enter 时 Enable、Exit 时 Disable，钩子全还原），
// 表格的分层与排版在 Script_ProfilerReport（与命令行 Script_ProfileCli 同一份口径）。
// 自身开销记在「编辑器叠加层」桶里（图上标了「含本面板」）：条图每 3 帧一画、
// 表格 0.5 s 一刷、取证/事件/场景普查 1 s 一刷（用 buckets:false 的便宜汇总）——
// 用户实测过一次 max 10 ms 的自刷新突刺，节流与便宜路径就是冲它去的。
//
// **两张表都是数据驱动的**：汇总里出现什么 key 就显示什么行，不再有写死的名单
//（旧版 GPU 表只列 11 个名字，帧图里新加的 pass 哪怕吃了 3.7 ms 也一行都看不到）。
// GPU 那一列显示的是**英文原名**，与 Script_Post 的 passes 数组一字不差；中文解释
// 进 title（鼠标停上去才出），免得译名和帧图对不上号。

import { CpuRows, GpuRows, CPU_LABELS, SHADOW_NOTE, WorstLine, EventsLine, FormatSnapshot }
  from "./Script_ProfilerReport.mjs";

const POPUP_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px 18px; background: var(--ui-surface); color: var(--ui-text);
         font: 12px/1.55 var(--ui-font); }
  h1 { font-size: 21px; padding: 14px 18px; background: var(--ui-black); margin: -14px -18px 18px; color: var(--ui-bright); letter-spacing: 1px; }
  h2 { font-size: 12px; margin: 16px 0 4px; color: var(--ui-gold); letter-spacing: 1px; }
  .num, td, .big span { font-family: Consolas, "Cascadia Mono", monospace; }
  .head { display: flex; align-items: baseline; gap: 18px; margin: 4px 0 8px; }
  .big { font-size: 30px; color: var(--ui-bright); }
  .big em { font-size: 12px; font-style: normal; color: var(--ui-muted); margin-left: 4px; }
  .stats { color: var(--ui-muted); }
  .stats b { color: var(--ui-text); font-weight: normal; font-family: Consolas, monospace; }
  #badge { font-size: 11px; color: var(--ui-muted); margin-left: 8px; }
  canvas { display: block; background: var(--ui-black); border: 1px solid var(--ui-line); width: 100%; }
  .legend { color: var(--ui-muted); font-size: 11px; margin: 3px 0 0; }
  .legend i { display: inline-block; width: 9px; height: 9px; margin: 0 4px 0 10px; vertical-align: -1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 1px 8px; border-bottom: 1px solid var(--ui-line); white-space: nowrap; }
  th { color: var(--ui-muted); font-weight: normal; }
  th:first-child, td:first-child { text-align: left; }
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
  button:hover { border-color: var(--ui-gold); color: var(--ui-gold); background: var(--ui-selection); }
  textarea { width: 100%; height: 140px; background: var(--ui-black); color: var(--ui-muted);
             border: 1px solid var(--ui-line); display: none; font: 11px Consolas, monospace; }
`;

export class ProfilerEditor {
  static id = "profiler";
  static label = "Profiler";
  static hint = "独立窗口：整帧 / CPU 逐系统（可展开子桶）/ GPU 逐 pass 耗时与提交量，掉帧现场取证；玩法照跑";
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
        "width=1080,height=1040,menubar=no,toolbar=no,location=no");
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
    const body = doc.body;
    const title = El("h1", "", "台儿庄：血战滕县 · 性能剖析");
    const badge = El("span");
    badge.id = "badge";
    title.appendChild(badge);
    body.appendChild(title);

    const head = El("div", "head");
    const big = El("div", "big");
    const fps = El("span", "", "—");
    big.appendChild(fps);
    big.appendChild(El("em", "", "fps"));
    head.appendChild(big);
    const headStats = El("div", "stats", "—");
    head.appendChild(headStats);
    body.appendChild(head);

    const graph = El("canvas");
    graph.width = 840;
    graph.height = 150;
    body.appendChild(graph);
    const legend = El("div", "legend");
    legend.innerHTML = "整帧间隔：<i style='background:#3f9d5a'></i>≤17ms"
      + "<i style='background:#c9a227'></i>≤25ms <i style='background:#c0453f'></i>&gt;25ms"
      + " ｜ <i style='background:#e8e2d2'></i>主线程工作 <i style='background:#4fb3d0'></i>GPU"
      + " ｜ 横线 16.7 / 33.3 ms";
    body.appendChild(legend);

    const MakeTable = (heads) => {
      const table = El("table");
      const tr = El("tr");
      for (const text of heads) tr.appendChild(El("th", "", text));
      table.appendChild(tr);
      return table;
    };
    body.appendChild(El("h2", "", "CPU · 主线程（逐系统，ms/帧；缩进行是子桶）"));
    const cpuTable = MakeTable(["系统", "avg", "p95", "max", "矩阵访问", "分配KB", ""]);
    body.appendChild(cpuTable);

    body.appendChild(El("h2", "", "GPU · 逐 pass（ms/帧，名字是帧图里的英文原名）"));
    const gpuTable = MakeTable(["pass", "GPU avg", "GPU p95", "GPU max", "提交 CPU", "draw", "三角", ""]);
    body.appendChild(gpuTable);
    const gpuNote = El("div", "note", "");
    body.appendChild(gpuNote);
    body.appendChild(El("div", "note", SHADOW_NOTE));

    body.appendChild(El("h2", "", "掉帧取证（最近 10 秒最差一帧）"));
    const worst = El("div", "worst", "—");
    body.appendChild(worst);

    body.appendChild(El("h2", "", "事件（最近 10 秒）"));
    const events = El("div", "stats", "—");
    body.appendChild(events);

    body.appendChild(El("h2", "", "场景节点普查（scene 顶层子树，每秒一次）"));
    const censusTable = MakeTable(["子树", "节点", "骨骼", "网格", "蒙皮", "隐藏节点"]);
    body.appendChild(censusTable);

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
    copyBtn.addEventListener("click", () => Dump(this.SnapshotJson()));
    textBtn.addEventListener("click", () => Dump(FormatSnapshot(this.Snapshot())));

    this.ui = {
      badge, fps, headStats, graph, ctx: graph.getContext("2d"),
      cpuTable, gpuTable, gpuNote, worst, events, censusTable,
      cpuRows: new Map(), gpuRows: new Map(), censusRows: new Map(),
    };
  }

  /** 与 CLI 输出同结构的快照（`Script_ProfileCli --print` 能直接读回来排表）。 */
  Snapshot() {
    const profiler = this.host.profiler;
    const post = this.host.post;
    return {
      label: "panel",
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      canvas: this.host.canvas ? `${this.host.canvas.width}x${this.host.canvas.height}` : null,
      postTarget: post ? `${post.width}x${post.height} · ${post.quality}` : null,
      census: this._census,
      summary: profiler ? profiler.Summary(10) : null,
    };
  }

  SnapshotJson() {
    return JSON.stringify(this.Snapshot(), (key, value) =>
      (typeof value === "number" ? Math.round(value * 1000) / 1000 : value), 2);
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
    if (this._frame % 3 === 0) this.DrawGraph(profiler);
    this._tableAcc += dt;
    if (this._tableAcc >= 0.5) {
      this._tableAcc = 0;
      this.RefreshTables(profiler.Summary(2));
    }
    this._slowAcc += dt;
    if (this._slowAcc >= 1.0) {
      this._slowAcc = 0;
      this.RefreshSlow(profiler);
    }
  }

  DrawGraph(profiler) {
    const { graph, ctx } = this.ui;
    const w = graph.width;
    const h = graph.height;
    const scale = h / 40;                        // 纵轴 0—40 ms
    const barW = 3;
    const count = Math.floor(w / barW);
    const history = profiler.history;
    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, w, h);
    // 预算线
    ctx.fillStyle = "#2a2d34";
    ctx.fillRect(0, h - 16.7 * scale, w, 1);
    ctx.fillRect(0, h - 33.3 * scale, w, 1);
    const start = Math.max(0, history.length - count);
    for (let i = start; i < history.length; i += 1) {
      const record = history[i];
      const x = (i - start) * barW;
      const interval = Math.min(40, record.interval);
      if (interval > 0) {
        ctx.fillStyle = record.interval <= 17 ? "#3f9d5a"
          : (record.interval <= 25 ? "#c9a227" : "#c0453f");
        ctx.fillRect(x, h - interval * scale, barW - 1, interval * scale);
      }
      const cpu = Math.min(40, record.cpuMs);
      ctx.fillStyle = "#e8e2d2";
      ctx.fillRect(x, h - cpu * scale, barW - 1, 1);
      if (record.gpuTotal != null) {
        const gpu = Math.min(40, record.gpuTotal);
        ctx.fillStyle = "#4fb3d0";
        ctx.fillRect(x, h - gpu * scale, barW - 1, 1);
      }
      if (record.gcMb > 0) {                     // GC 帧顶上打一个白点
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, 2, barW - 1, 3);
      }
      if (record.newPrograms > 0) {              // 新编译着色器的帧打一个金点
        ctx.fillStyle = "#c9a227";
        ctx.fillRect(x, 7, barW - 1, 3);
      }
    }
  }

  _Row(table, cache, key, cols, { bar = true } = {}) {
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

  RefreshTables(summary) {
    const ui = this.ui;
    const F = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(2));
    const Int = (value) => (value === null || value === undefined ? "" : String(Math.round(value)));

    // --- CPU 表 ---
    const cpuMax = Math.max(0.001, summary.cpuTotal.avg);
    for (const item of CpuRows(summary)) {
      const row = this._Row(ui.cpuTable, ui.cpuRows, item.key, 5);
      row.tr.className = item.selfRow ? "self" : "";
      row.name.textContent = `${"　".repeat(item.depth)}${item.label}`;
      row.name.title = item.key;
      const avg = item.selfRow ? item.self : item.stat.avg;
      row.cells[0].textContent = F(avg);
      row.cells[1].textContent = item.selfRow ? "" : F(item.stat.p95);
      row.cells[2].textContent = item.selfRow ? "" : F(item.stat.max);
      row.cells[3].textContent = item.selfRow ? "" : Int(item.visits);
      row.cells[4].textContent = item.selfRow || item.allocKb == null ? "" : item.allocKb.toFixed(1);
      row.bar.style.width = `${Math.min(100, (avg / cpuMax) * 100)}%`;
    }
    const totalRow = this._Row(ui.cpuTable, ui.cpuRows, "__total", 5);
    totalRow.tr.className = "total";
    totalRow.name.textContent = "主线程合计";
    totalRow.cells[0].textContent = F(summary.cpuTotal.avg);
    totalRow.cells[1].textContent = F(summary.cpuTotal.p95);
    totalRow.cells[2].textContent = F(summary.cpuTotal.max);
    totalRow.cells[3].textContent = "";
    totalRow.cells[4].textContent = "";
    totalRow.bar.style.width = "0";
    const browserRow = this._Row(ui.cpuTable, ui.cpuRows, "__browser", 5);
    browserRow.tr.className = "total";
    browserRow.name.textContent = CPU_LABELS.browser;
    browserRow.name.title = summary.loafAvailable
      ? "整帧间隔 − 主线程工作；本浏览器支持 long-animation-frame，样式布局耗时见取证栏"
      : "整帧间隔 − 主线程工作（本浏览器没有 long-animation-frame，只能做减法）";
    browserRow.cells[0].textContent = F(summary.browser.avg);
    browserRow.cells[1].textContent = F(summary.browser.p95);
    browserRow.cells[2].textContent = F(summary.browser.max);
    browserRow.cells[3].textContent = "";
    browserRow.cells[4].textContent = "";
    browserRow.bar.style.width = "0";
    this._Sweep(ui.cpuRows);

    // --- GPU 表 ---
    if (!summary.timerAvailable) {
      ui.gpuNote.textContent = "当前浏览器不支持 GPU 计时；提交 CPU、draw call 与三角数仍然可信。";
    } else if (summary.gpuFrames === 0) {
      ui.gpuNote.textContent = "等待 GPU 计时…";
    } else {
      ui.gpuNote.textContent = `GPU 合计 avg ${F(summary.gpuTotal.avg)} ms · `
        + `采样帧 ${summary.gpuFrames}。misc 是有名字的段之间剩下的零碎 GL 工作。`;
    }
    const gpuMax = Math.max(0.001, summary.gpuTotal.avg);
    for (const item of GpuRows(summary)) {
      const row = this._Row(ui.gpuTable, ui.gpuRows, item.key, 6);
      row.tr.className = item.selfRow ? "self" : "";
      row.name.textContent = `${"　".repeat(item.depth)}${item.label}`;
      row.name.title = item.note || item.key;
      const avg = item.selfRow ? item.self : item.stat.avg;
      row.cells[0].textContent = F(avg);
      row.cells[1].textContent = item.selfRow ? "" : F(item.stat.p95);
      row.cells[2].textContent = item.selfRow ? "" : F(item.stat.max);
      row.cells[3].textContent = item.selfRow || item.cpuMs == null ? "" : F(item.cpuMs);
      row.cells[4].textContent = item.selfRow ? "" : Int(item.calls);
      row.cells[5].textContent = item.selfRow || item.tris == null ? "" : `${(item.tris / 1e6).toFixed(2)}M`;
      row.bar.style.width = `${Math.min(100, (avg / gpuMax) * 100)}%`;
    }
    const gpuTotalRow = this._Row(ui.gpuTable, ui.gpuRows, "__total", 6);
    gpuTotalRow.tr.className = "total";
    gpuTotalRow.name.textContent = "GPU 合计";
    gpuTotalRow.cells[0].textContent = summary.gpuFrames ? F(summary.gpuTotal.avg) : "—";
    gpuTotalRow.cells[1].textContent = summary.gpuFrames ? F(summary.gpuTotal.p95) : "—";
    gpuTotalRow.cells[2].textContent = summary.gpuFrames ? F(summary.gpuTotal.max) : "—";
    gpuTotalRow.cells[3].textContent = "";
    gpuTotalRow.cells[4].textContent = String(summary.calls);
    gpuTotalRow.cells[5].textContent = `${(summary.triangles / 1e6).toFixed(2)}M`;
    gpuTotalRow.bar.style.width = "0";
    this._Sweep(ui.gpuRows);

    // --- 抬头 ---
    ui.fps.textContent = summary.fps ? summary.fps.toFixed(0) : "—";
    ui.badge.textContent = summary.timerAvailable ? "GPU 计时可用" : "GPU 计时不可用";
    const post = this.host.post;
    ui.headStats.innerHTML = `整帧 <b>${F(summary.frame.avg)}</b> / p95 <b>${F(summary.frame.p95)}</b>`
      + ` / max <b>${F(summary.frame.max)}</b> ms ｜ 主线程 <b>${F(summary.cpuTotal.avg)}</b> ms`
      + ` ｜ GPU <b>${summary.gpuFrames ? F(summary.gpuTotal.avg) : "—"}</b> ms<br>`
      + `draw calls <b>${summary.calls}</b> ｜ 三角 <b>${(summary.triangles / 1e6).toFixed(2)}M</b>`
      + ` ｜ 合成靶 <b>${post ? `${post.width}×${post.height}` : "—"}</b>`
      + ` ｜ 画质 <b>${post ? post.quality : "—"}</b>`;
  }

  RefreshSlow(profiler) {
    const ui = this.ui;
    // buckets:false —— 取证栏只要 worst 记录本体与事件计数，逐桶的分位数统计
    // 是这条便宜路径省掉的大头（10 秒窗口 × 几十个桶的排序，1 秒一次也嫌多）。
    const summary = profiler.Summary(10, { buckets: false });
    ui.worst.textContent = WorstLine(summary);
    ui.events.textContent = EventsLine(summary)
      + (performance.memory
        ? ` ｜ 堆 ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`
        : "（此浏览器无 performance.memory）");
    // 场景节点普查：走自己的栈（不用被包了计数的 traverse），一秒一次。
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

}

export default ProfilerEditor;
