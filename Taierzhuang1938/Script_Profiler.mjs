// 《滕县 一九三八》运行时性能剖析器（内核，无 DOM）。
//
// 面板在 Script_EditorProfiler（编辑器「渲染调试（可叠加）」组，弹独立窗口）；
// 这里只管计时与取数。构造是免费的，Enable() 才落钩子，关着时每帧只剩
// 几十次 `if (!this.on) return` 的布尔检查 —— 正式玩家路径零成本。
//
// ## 三条账
// 1. **CPU 分系统**：装配层（Script_Main 的 Frame / RenderScene）在每个系统调用
//    两侧打 B(name)/E(name) 标记，同名多次成对会累加。不用「包方法」那套 ——
//    physics / battlefield 每换一关都是新实例，包在旧实例上的计时器换关就聋了。
// 2. **GPU 逐 pass**：EXT_disjoint_timer_query_webgl2。TIME_ELAPSED 查询**不许嵌套**，
//    所以这里不是一段一个查询，而是「分段（segment）」：GpuPush/GpuPop 结束当前段、
//    开新段，段归属栈顶名字；帧末按名字求和。阴影图烘在预通道 render 内部，
//    靠包一层 renderer.shadowMap.render 用同一套 Push/Pop 把它拆出来。
//    查询结果要**过几个 event-loop turn** 才可读（ANGLE/D3D11 连 gl.finish 都不算数，
//    见 Script_FrameProfileTest 的账），所以结果挂到几帧前的历史记录上，_Poll 每帧收。
// 3. **线程**：玩法期间本作没有 worker（Script_BootPropWorker 只活在加载画面），
//    WebAudio 跑在浏览器自己的音频线程、页面测不到 —— 所以「CPU 分线程」诚实的
//    答案就是：主线程逐系统 + GPU 进程逐 pass + 长任务/GC 事件。面板照这么标。
//
// ## GC / 长任务
// performance.memory（Chrome 系才有）逐帧采 usedJSHeapSize：一帧掉 1 MB 以上记一次
// GC（这正是「偶尔顿一下」的常见来源）；正增量折算成每帧分配速率，是 GC 压力的
// 先行指标。PerformanceObserver("longtask") 记录 >50 ms 的主线程占用。
//
// 不 import three：拿的是 renderer 的裸 WebGL2 上下文与 info 表。

export class FrameProfiler {
  constructor(renderer, { post = null } = {}) {
    this.renderer = renderer;
    this._post = post;
    this.on = false;
    this.timerAvailable = false;

    this.frameId = 0;
    this.interval = 0;             // rAF 到 rAF 的真实间隔（ms）
    this.history = [];             // 每帧一条记录，环形上限 historyMax
    this.historyMax = 900;         // 60 fps 下约 15 秒

    this.cpu = Object.create(null);     // 本帧各桶累计（ms）
    this._open = Object.create(null);   // B() 留下的起点
    this._frameStart = 0;
    this._lastRaf = 0;

    // --- GPU 分段计时 ---
    this._gl = null;
    this._ext = null;
    this._pool = [];               // 可复用的 WebGLQuery
    this._segs = [];               // 本帧已结束的段 [{name, query}]
    this._stack = [];              // GpuPush 的名字栈
    this._segQuery = null;
    this._segName = null;
    this._segCpuStart = 0;
    this._gpuActive = false;
    this._pending = [];            // 等结果的帧 [{id, segs}]
    this.gpuCpu = Object.create(null);  // 本帧各段的 CPU 提交耗时（ms）

    this._shadowOrig = null;
    this._observer = null;
    this._ltMs = 0;
    this._lastHeap = 0;
    this._info = renderer ? renderer.info : null;
  }

  // -------------------------------------------------------------------------
  // 开关
  // -------------------------------------------------------------------------

  Enable() {
    if (this.on || !this.renderer) return;
    this.on = true;
    this._gl = this.renderer.getContext();
    this._ext = this._gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.timerAvailable = !!this._ext;
    this.history.length = 0;
    this.frameId = 0;
    this._lastRaf = 0;
    this._lastHeap = 0;
    this._ltMs = 0;
    // renderer.info 默认每次 render 调用就清零，一帧二十几次 render 只能看到最后
    // 一次的数。剖析期间改成手动：BeginFrame 清一次，帧末读到的就是整帧总量。
    if (this._info) { this._info.autoReset = false; this._info.reset(); }
    if (this._post) this._post.profiler = this;
    this._WrapShadow();
    try {
      this._observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this._ltMs += entry.duration;
      });
      this._observer.observe({ type: "longtask" });
    } catch (error) { this._observer = null; /* Firefox/Safari 没有 longtask */ }
  }

  Disable() {
    if (!this.on) return;
    this.on = false;
    for (const entry of this._pending) this._DropPending(entry);
    this._pending.length = 0;
    for (const query of this._pool) this._gl.deleteQuery(query);
    this._pool.length = 0;
    this._gpuActive = false;
    this._segQuery = null;
    this._segName = null;
    if (this._info) { this._info.autoReset = true; this._info.reset(); }
    if (this._post && this._post.profiler === this) this._post.profiler = null;
    if (this._shadowOrig) {
      this.renderer.shadowMap.render = this._shadowOrig;
      this._shadowOrig = null;
    }
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
  }

  /**
   * 阴影图是在预通道那次 renderer.render 里顺手烘的（autoUpdate=false、每帧一次
   * needsUpdate），Post 的 pass 标记够不到它。包一层 shadowMap.render，用分段
   * Push/Pop 把它从「预通道」里拆出来。守卫条件照抄 WebGLShadowMap 自己的
   * 早退：GI 的二十几趟全屏四边形（无灯）与烘完之后的每次 render 走原路，
   * 不产生多余查询。
   */
  _WrapShadow() {
    const shadowMap = this.renderer.shadowMap;
    if (!shadowMap || this._shadowOrig) return;
    const original = shadowMap.render;
    this._shadowOrig = original;
    const profiler = this;
    shadowMap.render = function ProfiledShadowRender(lights, scene, camera) {
      if (!profiler._gpuActive || !shadowMap.enabled || !lights || lights.length === 0
        || (shadowMap.autoUpdate === false && shadowMap.needsUpdate === false)) {
        return original.call(this, lights, scene, camera);
      }
      profiler.GpuPush("shadow");
      try { return original.call(this, lights, scene, camera); }
      finally { profiler.GpuPop(); }
    };
  }

  // -------------------------------------------------------------------------
  // CPU 标记（装配层调）
  // -------------------------------------------------------------------------

  BeginFrame(now = performance.now()) {
    if (!this.on) return;
    this._Poll();
    this.frameId += 1;
    this.interval = this._lastRaf ? now - this._lastRaf : 0;
    this._lastRaf = now;
    for (const key in this.cpu) this.cpu[key] = 0;
    // gpuCpu 在 GpuFrameStart 也会清，但没走渲染的帧（建关中/停摆）不开 GPU 帧，
    // 不在这里清的话上一帧的提交耗时会被原样再记一遍。
    for (const key in this.gpuCpu) this.gpuCpu[key] = 0;
    this._frameStart = performance.now();
    if (this._info) this._info.reset();
  }

  B(name) {
    if (this.on) this._open[name] = performance.now();
  }

  E(name) {
    if (!this.on) return;
    const started = this._open[name];
    if (started === undefined) return;
    this._open[name] = undefined;
    this.cpu[name] = (this.cpu[name] || 0) + (performance.now() - started);
  }

  EndFrame() {
    if (!this.on) return;
    const cpuMs = performance.now() - this._frameStart;
    // GC / 分配速率（Chrome 系；别的浏览器 performance.memory 不存在，两项恒 0）
    let gcMb = 0;
    let allocKb = 0;
    const memory = performance.memory;
    if (memory) {
      const heap = memory.usedJSHeapSize;
      if (this._lastHeap) {
        const delta = heap - this._lastHeap;
        if (delta < -1048576) gcMb = -delta / 1048576;
        else if (delta > 0) allocKb = delta / 1024;
      }
      this._lastHeap = heap;
    }
    const cpu = {};
    let bucketSum = 0;
    for (const key in this.cpu) {
      const value = this.cpu[key];
      if (value > 0) { cpu[key] = value; bucketSum += value; }
    }
    let gpuCpu = null;
    for (const key in this.gpuCpu) {
      if (this.gpuCpu[key] > 0) {
        if (!gpuCpu) gpuCpu = {};
        gpuCpu[key] = this.gpuCpu[key];
      }
    }
    this.history.push({
      id: this.frameId,
      t: this._lastRaf,
      interval: this.interval,
      cpuMs,
      cpu,
      other: Math.max(0, cpuMs - bucketSum),
      gpu: null,          // _Poll 过几帧补上
      gpuTotal: null,
      gpuCpu,
      calls: this._info ? this._info.render.calls : 0,
      triangles: this._info ? this._info.render.triangles : 0,
      gcMb,
      allocKb,
      longtaskMs: this._ltMs,
    });
    this._ltMs = 0;
    if (this.history.length > this.historyMax) {
      this.history.splice(0, this.history.length - this.historyMax);
    }
  }

  // -------------------------------------------------------------------------
  // GPU 分段（RenderScene 与 Post.Render 调）
  // -------------------------------------------------------------------------

  GpuFrameStart() {
    if (!this.on || this._gpuActive) return;
    this._gpuActive = true;
    this._stack.length = 0;
    this._segs.length = 0;
    for (const key in this.gpuCpu) this.gpuCpu[key] = 0;
    this._StartSeg();
  }

  GpuPush(name) {
    if (!this._gpuActive) return;
    this._EndSeg();
    this._stack.push(name);
    this._StartSeg();
  }

  GpuPop() {
    if (!this._gpuActive || this._stack.length === 0) return;
    this._EndSeg();
    this._stack.pop();
    this._StartSeg();
  }

  GpuFrameEnd() {
    if (!this._gpuActive) return;
    this._EndSeg();
    this._gpuActive = false;
    if (this._segs.length) {
      this._pending.push({ id: this.frameId, segs: this._segs.slice() });
      this._segs.length = 0;
      // 结果迟迟不来（disjoint、上下文丢失）就丢最老的，别把查询对象攒成山
      while (this._pending.length > 8) this._DropPending(this._pending.shift());
    }
  }

  _StartSeg() {
    this._segName = this._stack.length ? this._stack[this._stack.length - 1] : "misc";
    this._segCpuStart = performance.now();
    if (!this._ext) return;
    const gl = this._gl;
    const query = this._pool.pop() || gl.createQuery();
    gl.beginQuery(this._ext.TIME_ELAPSED_EXT, query);
    this._segQuery = query;
  }

  _EndSeg() {
    const name = this._segName;
    if (name === null) return;
    this.gpuCpu[name] = (this.gpuCpu[name] || 0) + (performance.now() - this._segCpuStart);
    this._segName = null;
    if (!this._segQuery) return;
    this._gl.endQuery(this._ext.TIME_ELAPSED_EXT);
    this._segs.push({ name, query: this._segQuery });
    this._segQuery = null;
  }

  _DropPending(entry) {
    for (const seg of entry.segs) this._gl.deleteQuery(seg.query);
  }

  _Poll() {
    if (!this._ext || this._pending.length === 0) return;
    const gl = this._gl;
    // disjoint（降频、切上下文）期间的计时不可信，整批扔掉。读这个参数本身会清标志。
    if (gl.getParameter(this._ext.GPU_DISJOINT_EXT)) {
      for (const entry of this._pending) this._DropPending(entry);
      this._pending.length = 0;
      return;
    }
    while (this._pending.length) {
      const entry = this._pending[0];
      // 查询按提交顺序完成：最后一段可读 = 整帧可读
      const lastSeg = entry.segs[entry.segs.length - 1];
      if (!gl.getQueryParameter(lastSeg.query, gl.QUERY_RESULT_AVAILABLE)) break;
      const sums = Object.create(null);
      let total = 0;
      for (const seg of entry.segs) {
        const ms = gl.getQueryParameter(seg.query, gl.QUERY_RESULT) / 1e6;
        sums[seg.name] = (sums[seg.name] || 0) + ms;
        total += ms;
        this._pool.push(seg.query);
      }
      this._AttachGpu(entry.id, sums, total);
      this._pending.shift();
    }
  }

  _AttachGpu(id, sums, total) {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const record = this.history[i];
      if (record.id === id) { record.gpu = sums; record.gpuTotal = total; return; }
      if (record.id < id) return;   // 记录已被环形淘汰
    }
  }

  // -------------------------------------------------------------------------
  // 汇总（面板与测试共用同一份口径）
  // -------------------------------------------------------------------------

  /**
   * 最近 seconds 秒的聚合：帧率、整帧/CPU/GPU 分项的 avg/p95/max、事件计数、
   * 以及窗口内间隔最长的那一帧（掉帧取证的主角）。
   * 间隔超过 250 ms 的帧按「页面被切走/暂停」处理，不进帧率统计但保留在 worst 里。
   */
  Summary(seconds = 2) {
    const cutoff = this._lastRaf - seconds * 1000;
    const rows = [];
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const record = this.history[i];
      if (record.t < cutoff) break;
      rows.push(record);
    }
    rows.reverse();
    const Percentiles = (values) => {
      if (values.length === 0) return { avg: 0, p95: 0, max: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      let sum = 0;
      for (const value of sorted) sum += value;
      return {
        avg: sum / sorted.length,
        p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        max: sorted[sorted.length - 1],
      };
    };
    const live = rows.filter((row) => row.interval > 0 && row.interval < 250);
    const frame = Percentiles(live.map((row) => row.interval));
    const cpuTotal = Percentiles(rows.map((row) => row.cpuMs));
    const CollectKeys = (field) => {
      const keys = new Set();
      for (const row of rows) {
        const bag = row[field];
        if (bag) for (const key in bag) keys.add(key);
      }
      return keys;
    };
    const BucketStats = (field) => {
      const out = {};
      for (const key of CollectKeys(field)) {
        out[key] = Percentiles(rows.map((row) => (row[field] && row[field][key]) || 0));
      }
      return out;
    };
    const gpuRows = rows.filter((row) => row.gpu);
    const gpu = {};
    for (const key of CollectKeys("gpu")) {
      gpu[key] = Percentiles(gpuRows.map((row) => row.gpu[key] || 0));
    }
    let worst = null;
    for (const row of live) {
      // 只在「活着的帧」里挑：切后台/StepFrames 批间的几秒空档不是掉帧，
      // 让它霸占取证栏会把真正的坏帧全挡住。
      if (!worst || row.interval > worst.interval) worst = row;
    }
    let gcCount = 0;
    let gcMb = 0;
    let longtaskMs = 0;
    let allocKb = 0;
    for (const row of rows) {
      if (row.gcMb > 0) { gcCount += 1; gcMb += row.gcMb; }
      longtaskMs += row.longtaskMs;
      allocKb += row.allocKb;
    }
    const last = rows.length ? rows[rows.length - 1] : null;
    return {
      seconds,
      frames: rows.length,
      fps: frame.avg > 0 ? 1000 / frame.avg : 0,
      lowFps: frame.p95 > 0 ? 1000 / frame.p95 : 0,   // p95 间隔折成「低帧率」
      frame,
      cpuTotal,
      cpu: BucketStats("cpu"),
      other: Percentiles(rows.map((row) => row.other)),
      gpu,
      gpuFrames: gpuRows.length,
      gpuTotal: Percentiles(gpuRows.map((row) => row.gpuTotal || 0)),
      gpuCpu: BucketStats("gpuCpu"),
      calls: last ? last.calls : 0,
      triangles: last ? last.triangles : 0,
      events: { gcCount, gcMb, longtaskMs, allocKb, allocKbPerFrame: rows.length ? allocKb / rows.length : 0 },
      worst,
      timerAvailable: this.timerAvailable,
    };
  }
}

export default FrameProfiler;
