// 性能剖析面板：编辑器「渲染调试（可叠加）」组的叠加工具，不接管相机、不暂停玩法。
//
// 真正的读数界面是一个 **window.open 的独立窗口**：游戏拿着指针锁的时候页面内
// 面板既点不到也挡画面，独立窗口可以拖到第二块屏上边玩边看，掉帧发生的那一刻
// 图上就有现场。窗口没有自己的脚本 —— 所有 DOM 更新由本 overlay 的 Update(dt)
// 从游戏侧推过去（editor.UpdateOverlays 在每一条帧路径上都会调它）。
//
// 计时内核在 Script_Profiler（Enter 时 Enable、Exit 时 Disable，钩子全还原）。
// 页面内留一块小面板：开关窗口、显示 FPS 摘要 —— 弹窗被拦截时它是唯一读数。

import { Panel, Section, Facts, Note, ButtonRow } from "./Script_EditorUi.mjs";

/** CPU 桶的显示名与顺序（B/E 标记在 Script_Main 的 Frame / RenderScene）。 */
const CPU_LABELS = [
  ["post", "渲染提交（整条链）"],
  ["ai", "AI"],
  ["physics", "物理（Rapier）"],
  ["player", "玩家"],
  ["viewmodel", "视图模型"],
  ["vfx", "特效"],
  ["combat", "战斗结算/破坏"],
  ["actorBatch", "人物合批"],
  ["matrix", "场景矩阵"],
  ["gi", "GI 探针（CPU）"],
  ["hud", "HUD"],
  ["story", "剧情与目标"],
  ["spawn", "补兵"],
  ["streamer", "道具流送"],
  ["input", "输入"],
  ["overlay", "编辑器叠加层（含本面板）"],
  ["other", "其他（未标记）"],
];

/** GPU 段的显示名与顺序（Push/Pop 在 Script_Post.Render 与阴影包装层）。 */
const GPU_LABELS = [
  ["shadow", "阴影图"],
  ["prepass", "深度法线预通道"],
  ["ssao", "SSAO + 双边模糊"],
  ["main", "主场景"],
  ["bloom", "泛光"],
  ["god", "体积光"],
  ["composite", "合成"],
  ["fxaa", "FXAA / 锐化"],
  ["gi", "GI 探针"],
  ["misc", "其他 GL（状态/上传）"],
];

const POPUP_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 14px 18px; background: #0b0c10; color: #cfd3da;
         font: 12px/1.55 "Segoe UI", "Microsoft YaHei", sans-serif; }
  h1 { font-size: 14px; margin: 0 0 8px; color: #e8e2d2; letter-spacing: 1px; }
  h2 { font-size: 12px; margin: 16px 0 4px; color: #b8a86a; letter-spacing: 1px; }
  .num, td, .big span { font-family: Consolas, "Cascadia Mono", monospace; }
  .head { display: flex; align-items: baseline; gap: 18px; margin: 4px 0 8px; }
  .big { font-size: 30px; color: #e8e2d2; }
  .big em { font-size: 12px; font-style: normal; color: #7c828d; margin-left: 4px; }
  .stats { color: #9aa0ab; }
  .stats b { color: #cfd3da; font-weight: normal; font-family: Consolas, monospace; }
  #badge { font-size: 11px; color: #6f7681; margin-left: 8px; }
  canvas { display: block; background: #07080b; border: 1px solid #1d2026; width: 100%; }
  .legend { color: #6f7681; font-size: 11px; margin: 3px 0 0; }
  .legend i { display: inline-block; width: 9px; height: 9px; margin: 0 4px 0 10px; vertical-align: -1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 1px 8px; border-bottom: 1px solid #16181d; white-space: nowrap; }
  th { color: #7c828d; font-weight: normal; }
  th:first-child, td:first-child { text-align: left; }
  td.bar { width: 34%; padding: 0 0 0 8px; }
  td.bar i { display: block; height: 7px; background: #38607e; min-width: 1px; }
  tr.total td { border-top: 1px solid #2a2d34; color: #e8e2d2; }
  .note { color: #6f7681; font-size: 11px; margin: 4px 0; }
  .warn { color: #c9a227; }
  .worst { border: 1px solid #1d2026; background: #0d0f13; padding: 8px 10px; }
  .worst b { color: #d88b85; font-family: Consolas, monospace; font-weight: normal; }
  button { background: #1a1d23; color: #cfd3da; border: 1px solid #2a2d34;
           padding: 4px 12px; cursor: pointer; font: inherit; margin: 10px 0 4px; }
  button:hover { border-color: #b8a86a; }
  textarea { width: 100%; height: 140px; background: #07080b; color: #9aa0ab;
             border: 1px solid #1d2026; display: none; font: 11px Consolas, monospace; }
`;

export class ProfilerEditor {
  static id = "profiler";
  static label = "性能剖析（独立窗口）";
  static hint = "整帧 / CPU 逐系统 / GPU 逐 pass 耗时，掉帧现场取证；玩法照跑";
  // 关掉设置面板（回去打仗）不收这个叠加层 —— 量的就是战斗中的帧。
  // 停它：面板里再点一次，或直接关它的独立窗口（Update 会跟着自我关闭）。
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.facts = null;
    this.win = null;
    this.doc = null;
    this.ui = null;          // 独立窗口里的节点引用
    this._frame = 0;
    this._tableAcc = 0;
    this._slowAcc = 0;
  }

  Enter(root) {
    this.host.profiler?.Enable();
    this.panel = Panel({
      title: "性能剖析", sub: "Script_Profiler",
      variant: "work", onClose: () => this.host.CloseProfiler(),
    });
    root.appendChild(this.panel.root);
    const body = this.panel.body;
    const section = Section(body, "独立窗口");
    ButtonRow(section, [
      { label: "打开 / 重开窗口", onClick: () => this.OpenWindow() },
    ]);
    Note(section, "读数在独立窗口里（可拖到第二块屏、进游戏拿着指针锁也在刷新）。"
      + "被弹窗拦截就点上面那颗按钮重开。关掉本面板即停止计时并还原全部钩子。");
    const stat = Section(body, "摘要");
    this.facts = Facts(stat);
    this.OpenWindow();
    return this;
  }

  Exit() {
    this.host.profiler?.Disable();
    if (this.win && !this.win.closed) { try { this.win.close(); } catch (error) { /* 已被用户关了 */ } }
    this.win = null;
    this.doc = null;
    this.ui = null;
    this.panel?.root.remove();
    this.panel = null;
    this.facts = null;
  }

  // -------------------------------------------------------------------------
  // 独立窗口
  // -------------------------------------------------------------------------

  OpenWindow() {
    let win = null;
    try {
      win = window.open("", "tzProfiler",
        "width=880,height=980,menubar=no,toolbar=no,location=no");
    } catch (error) { win = null; }
    if (!win) { this.win = null; return; }
    this.win = win;
    const doc = win.document;
    this.doc = doc;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset='utf-8'>"
      + "<title>滕县 一九三八 · 性能剖析</title></head><body></body></html>");
    doc.close();
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
    const title = El("h1", "", "滕县 一九三八 · 性能剖析");
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
    body.appendChild(El("h2", "", "CPU · 主线程（逐系统，ms/帧）"));
    const cpuTable = MakeTable(["系统", "avg", "p95", "max", ""]);
    body.appendChild(cpuTable);
    body.appendChild(El("div", "note",
      "「渲染提交」是主线程把整条链交给驱动的时间（预通道+阴影+主场景+全屏 pass 的"
      + " draw call 提交），不是后处理本身贵 —— 逐 pass 的提交与 GPU 实耗看下表。"));
    body.appendChild(El("div", "note",
      "线程说明：玩法期间本作没有 worker（加载台的旋转 worker 只活在加载画面），"
      + "游戏逻辑与渲染提交全在主线程；GPU 进程的实耗见下表；WebAudio 在浏览器的"
      + "音频线程，页面测不到。"));

    body.appendChild(El("h2", "", "GPU · 逐 pass（ms/帧）"));
    const gpuTable = MakeTable(["pass", "GPU avg", "GPU p95", "GPU max", "提交 CPU", ""]);
    body.appendChild(gpuTable);
    const gpuNote = El("div", "note", "");
    body.appendChild(gpuNote);

    body.appendChild(El("h2", "", "掉帧取证（最近 10 秒最差一帧）"));
    const worst = El("div", "worst", "—");
    body.appendChild(worst);

    body.appendChild(El("h2", "", "事件（最近 10 秒）"));
    const events = El("div", "stats", "—");
    body.appendChild(events);

    const copyBtn = El("button", "", "导出快照 JSON（发给排查的人）");
    body.appendChild(copyBtn);
    const copyBox = El("textarea");
    copyBox.readOnly = true;
    body.appendChild(copyBox);
    copyBtn.addEventListener("click", () => {
      copyBox.style.display = "block";
      copyBox.value = this.SnapshotJson();
      copyBox.focus();
      copyBox.select();
    });

    this.ui = {
      badge, fps, headStats, graph, ctx: graph.getContext("2d"),
      cpuTable, gpuTable, gpuNote, worst, events,
      cpuRows: new Map(), gpuRows: new Map(),
    };
  }

  SnapshotJson() {
    const profiler = this.host.profiler;
    const post = this.host.post;
    const snapshot = {
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      canvas: this.host.canvas ? `${this.host.canvas.width}x${this.host.canvas.height}` : null,
      postTarget: post ? `${post.width}x${post.height} · ${post.quality}` : null,
      summary10s: profiler ? profiler.Summary(10) : null,
    };
    return JSON.stringify(snapshot, (key, value) =>
      (typeof value === "number" ? Math.round(value * 1000) / 1000 : value), 2);
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    const profiler = this.host.profiler;
    if (!profiler || !profiler.on) return;
    // 用户直接把独立窗口叉掉 = 「不剖析了」：跟着把叠加层整个关掉，钩子全还原。
    // （窗口从没开起来过 —— 被弹窗拦截 —— 不算：那时页面内面板是唯一读数。）
    if (this.win && this.win.closed) { this.host.CloseProfiler(); return; }
    // 玩法进行中（设置面板收着）把页面内小面板也收掉，别挡准星；读数在独立窗口。
    if (this.panel) {
      const show = this.host.launcherOpen !== false;
      this.panel.root.style.display = show ? "" : "none";
    }
    this._frame += 1;
    const winAlive = this.win && !this.win.closed && this.ui;
    if (winAlive && this._frame % 3 === 0) this.DrawGraph(profiler);
    this._tableAcc += dt;
    if (this._tableAcc >= 0.25) {
      this._tableAcc = 0;
      const summary = profiler.Summary(2);
      if (winAlive) this.RefreshTables(summary);
      this.RefreshFacts(summary, winAlive);
    }
    this._slowAcc += dt;
    if (winAlive && this._slowAcc >= 0.5) {
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
    }
  }

  _Row(doc, table, cache, key, label, cols) {
    let row = cache.get(key);
    if (!row) {
      const tr = doc.createElement("tr");
      const name = doc.createElement("td");
      name.textContent = label;
      tr.appendChild(name);
      const cells = [];
      for (let i = 0; i < cols; i += 1) {
        const td = doc.createElement("td");
        cells.push(td);
        tr.appendChild(td);
      }
      const barCell = doc.createElement("td");
      barCell.className = "bar";
      const bar = doc.createElement("i");
      barCell.appendChild(bar);
      tr.appendChild(barCell);
      row = { tr, cells, bar };
      table.appendChild(tr);
      cache.set(key, row);
    }
    return row;
  }

  RefreshTables(summary) {
    const doc = this.doc;
    const ui = this.ui;
    const F = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(2));

    // --- CPU 表 ---
    const cpuMax = Math.max(0.001, summary.cpuTotal.avg);
    for (const [key, label] of CPU_LABELS) {
      const stat = key === "other" ? summary.other : summary.cpu[key];
      const row = this._Row(doc, ui.cpuTable, ui.cpuRows, key, label, 3);
      if (!stat || (stat.avg === 0 && stat.max === 0)) {
        row.tr.style.display = "none";
        continue;
      }
      row.tr.style.display = "";
      row.cells[0].textContent = F(stat.avg);
      row.cells[1].textContent = F(stat.p95);
      row.cells[2].textContent = F(stat.max);
      row.bar.style.width = `${Math.min(100, (stat.avg / cpuMax) * 100)}%`;
    }
    const totalRow = this._Row(doc, ui.cpuTable, ui.cpuRows, "__total", "主线程合计", 3);
    totalRow.tr.className = "total";
    totalRow.cells[0].textContent = F(summary.cpuTotal.avg);
    totalRow.cells[1].textContent = F(summary.cpuTotal.p95);
    totalRow.cells[2].textContent = F(summary.cpuTotal.max);
    totalRow.bar.style.width = "0";

    // --- GPU 表 ---
    if (!summary.timerAvailable) {
      ui.gpuNote.textContent = "这个浏览器没有 EXT_disjoint_timer_query_webgl2，"
        + "量不到 GPU 实耗（Chrome/Edge 有；表里只有提交 CPU 一列有数）。";
    } else if (summary.gpuFrames === 0) {
      ui.gpuNote.textContent = "等待查询结果……（结果比提交晚几帧回来）";
    } else {
      ui.gpuNote.textContent = `GPU 合计 avg ${F(summary.gpuTotal.avg)} ms · `
        + `采样帧 ${summary.gpuFrames}。misc 是有名字的 pass 之间的零碎 GL 工作`
        + "（状态切换、纹理/缓冲上传）。";
    }
    const gpuMax = Math.max(0.001, summary.gpuTotal.avg);
    for (const [key, label] of GPU_LABELS) {
      const stat = summary.gpu[key];
      const cpuStat = summary.gpuCpu[key];
      const row = this._Row(doc, ui.gpuTable, ui.gpuRows, key, label, 4);
      if (!stat && !cpuStat) { row.tr.style.display = "none"; continue; }
      row.tr.style.display = "";
      row.cells[0].textContent = stat ? F(stat.avg) : "—";
      row.cells[1].textContent = stat ? F(stat.p95) : "—";
      row.cells[2].textContent = stat ? F(stat.max) : "—";
      row.cells[3].textContent = cpuStat ? F(cpuStat.avg) : "—";
      row.bar.style.width = stat ? `${Math.min(100, (stat.avg / gpuMax) * 100)}%` : "0";
    }
    const gpuTotalRow = this._Row(doc, ui.gpuTable, ui.gpuRows, "__total", "GPU 合计", 4);
    gpuTotalRow.tr.className = "total";
    gpuTotalRow.cells[0].textContent = summary.gpuFrames ? F(summary.gpuTotal.avg) : "—";
    gpuTotalRow.cells[1].textContent = summary.gpuFrames ? F(summary.gpuTotal.p95) : "—";
    gpuTotalRow.cells[2].textContent = summary.gpuFrames ? F(summary.gpuTotal.max) : "—";
    gpuTotalRow.cells[3].textContent = "";
    gpuTotalRow.bar.style.width = "0";

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
    const summary = profiler.Summary(10);
    const F = (value) => value.toFixed(2);
    const worst = summary.worst;
    if (worst) {
      const ago = ((profiler.history.length ? profiler.history[profiler.history.length - 1].t : 0)
        - worst.t) / 1000;
      const buckets = Object.entries(worst.cpu)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([key, value]) => {
          const label = CPU_LABELS.find((item) => item[0] === key)?.[1] || key;
          return `${label} ${F(value)}`;
        });
      const gpuPart = worst.gpu
        ? " ｜ GPU " + Object.entries(worst.gpu).sort((a, b) => b[1] - a[1]).slice(0, 4)
          .map(([key, value]) => {
            const label = GPU_LABELS.find((item) => item[0] === key)?.[1] || key;
            return `${label} ${F(value)}`;
          }).join("，") + `（合计 ${F(worst.gpuTotal)}）`
        : "";
      const marks = [];
      if (worst.gcMb > 0) marks.push(`GC 释放 ${worst.gcMb.toFixed(1)} MB`);
      if (worst.longtaskMs > 0) marks.push(`长任务 ${F(worst.longtaskMs)} ms`);
      ui.worst.innerHTML = `<b>${F(worst.interval)} ms</b>（${ago.toFixed(1)} 秒前）`
        + ` · 主线程 ${F(worst.cpuMs)} ms · calls ${worst.calls}`
        + (marks.length ? ` · <span class="warn">${marks.join("，")}</span>` : "")
        + `<br>CPU：${buckets.join("，")}，其他 ${F(worst.other)}${gpuPart}`;
    } else {
      ui.worst.textContent = "—";
    }
    const events = summary.events;
    ui.events.innerHTML = `GC <b>${events.gcCount}</b> 次（共释放 <b>${events.gcMb.toFixed(1)}</b> MB）`
      + ` ｜ 长任务 <b>${events.longtaskMs.toFixed(0)}</b> ms`
      + ` ｜ 堆分配 ≈ <b>${events.allocKbPerFrame.toFixed(0)}</b> KB/帧`
      + (performance.memory
        ? ` ｜ 堆 <b>${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}</b> MB`
        : "（此浏览器无 performance.memory）");
  }

  RefreshFacts(summary, winAlive) {
    if (!this.facts) return;
    const F = (value) => value.toFixed(2);
    this.facts.Set("独立窗口", winAlive ? "已打开" : "没开着（被拦截或被关了）",
      winAlive ? "good" : "warn");
    this.facts.Set("帧率", summary.fps ? `${summary.fps.toFixed(0)} fps` : "—");
    this.facts.Set("整帧", `${F(summary.frame.avg)} / p95 ${F(summary.frame.p95)} ms`);
    this.facts.Set("主线程", `${F(summary.cpuTotal.avg)} ms`);
    this.facts.Set("GPU", summary.gpuFrames ? `${F(summary.gpuTotal.avg)} ms`
      : (summary.timerAvailable ? "等待查询…" : "计时不可用"), summary.timerAvailable ? "" : "warn");
  }
}

export default ProfilerEditor;
