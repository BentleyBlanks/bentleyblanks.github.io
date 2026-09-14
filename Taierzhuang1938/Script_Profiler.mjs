// 《台儿庄：血战滕县》运行时性能剖析器（内核，无 DOM）。
//
// 面板在 Script_EditorProfiler（编辑器「渲染调试（可叠加）」组，弹独立窗口），
// 命令行在 Script_ProfileCli（同一份汇总口径）；这里只管计时与取数。
// 构造是免费的，Enable() 才落钩子，关着时每帧只剩几十次 `if (!this.on) return`
// 的布尔检查 —— 正式玩家路径零成本。
//
// ## 三条账
// 1. **CPU 分系统**：装配层（Script_Main 的 Frame / RenderScene、Script_Ai.Update、
//    Script_FirstLevelMissionRuntime.Update）在每个系统调用两侧打 B(name)/E(name)
//    标记，同名多次成对会累加。不用「包方法」那套 —— physics / battlefield 每换
//    一关都是新实例，包在旧实例上的计时器换关就聋了。
//    名字可以带斜杠（`ai/act/anim`）表示子桶：**存储仍是平的**，key 就是整条路径；
//    分层只发生在显示层（Script_ProfilerReport）。B/E 之间是真的嵌套调用，
//    所以父桶的数字**已经含子桶**，父行的「自身」= 父 − 子之和。
// 2. **GPU 逐 pass**：EXT_disjoint_timer_query_webgl2。TIME_ELAPSED 查询**不许嵌套**，
//    所以这里不是一段一个查询，而是「分段（segment）」：GpuPush/GpuPop 结束当前段、
//    开新段，段归属栈顶名字；帧末按名字求和。因为分段互斥，带斜杠的段在收结果时
//    会把自己累进每一级前缀（`shadow/c1` 累进 `shadow`），父行读到的才是整支合计。
//    阴影图烘在预通道 render 内部，靠包一层 renderer.shadowMap.render 把它拆出来；
//    级联多于一盏时逐盏调用，于是每一级都有自己的段（`shadow/c0`…）。
//    查询结果要**过几个 event-loop turn** 才可读（ANGLE/D3D11 连 gl.finish 都不算数，
//    见 Script_FrameProfileTest 的账），所以结果挂到几帧前的历史记录上，_Poll 每帧收。
//    每段还记 renderer.info 的 draw call / 三角形增量 —— GPU 读数接近提交 CPU 时，
//    说明这一趟 GPU 在等 CPU 喂 draw，那个 GPU 数字是提交时间的影子。
// 3. **线程**：玩法期间本作没有 worker（Script_BootPropWorker 只活在加载画面），
//    WebAudio 跑在浏览器自己的音频线程、页面测不到 —— 所以「CPU 分线程」诚实的
//    答案就是：主线程逐系统 + GPU 进程逐 pass + 长任务/GC 事件 + 浏览器侧那一段。
//    「浏览器侧」= 整帧间隔 − 主线程工作，里面是样式/布局/绘制/合成与等 vsync；
//    支持 long-animation-frame 的浏览器还能把其中的样式布局耗时单独报出来。
//
// ## 矩阵工作
// 剖析期间包一层 Object3D 的 updateMatrixWorld / updateWorldMatrix / traverse，
// 按当前栈顶 CPU 桶记「节点访问次数」。矩阵与遍历本来散在各桶里看不见，
// 而车厢机位实测一帧就有一万六千多次 —— 这一列是它唯一的出口。
// 原型必须在 Disable 时一件不剩地还回去（Script_ProfilerTest 盯着这一条）。
//
// ## GC / 长任务 / 着色器
// performance.memory（Chrome 系才有）逐帧采 usedJSHeapSize：一帧掉 1 MB 以上记一次
// GC（这正是「偶尔顿一下」的常见来源）；正增量折算成每帧分配速率，是 GC 压力的
// 先行指标，并且在每个 B/E 之间单独记一份，分配大户就能指名道姓。
// PerformanceObserver("longtask") 记录 >50 ms 的主线程占用。
// renderer.info.programs 的逐帧增量 = 这一帧新编译了几个着色器程序（首见卡顿的来源）。
//
// 不 import three：拿的是 renderer 的裸 WebGL2 上下文与 info 表；要包的
// Object3D.prototype 由装配层从构造参数传进来。

/**
 * 把带斜杠的 key 累进每一级前缀（`a/b/c` → 同时加到 `a/b` 与 `a`）。
 *
 * 只给**互斥**的计量用（GPU 分段、节点访问次数）：CPU 时间的 B/E 本来就套着，
 * 父桶已经含子桶，再累一次就是双计。
 * 先取快照再改：一边 for-in 一边往同一个对象上加 key，父桶会被按已经涨过的值
 * 再传一次，三层路径就会双计。
 */
function RollUpPaths(bag) {
  const entries = Object.entries(bag);
  for (const [key, value] of entries) {
    if (!value) continue;
    let cut = key.lastIndexOf("/");
    while (cut > 0) {
      const parent = key.slice(0, cut);
      bag[parent] = (bag[parent] || 0) + value;
      cut = parent.lastIndexOf("/");
    }
  }
}

export class FrameProfiler {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} options
   * @param {object} options.post       PostPipeline（Enable 时把自己挂上去，逐 pass 分段）
   * @param {object} options.scene      场景根（Census 普查用；不传就只能显式传参）
   * @param {object} options.object3D   THREE.Object3D.prototype（矩阵/遍历计数要包它）
   */
  constructor(renderer, { post = null, scene = null, object3D = null } = {}) {
    this.renderer = renderer;
    this._post = post;
    this._scene = scene;
    this._object3D = object3D;
    this.on = false;
    this.timerAvailable = false;

    this.frameId = 0;
    this.interval = 0;             // rAF 到 rAF 的真实间隔（ms）
    this.history = [];             // 每帧一条记录，环形上限 historyMax
    this.historyMax = 900;         // 60 fps 下约 15 秒

    this.cpu = Object.create(null);       // 本帧各桶累计（ms）
    this.cpuVisits = Object.create(null); // 本帧各桶的节点访问次数
    this.cpuAlloc = Object.create(null);  // 本帧各桶的堆分配（KB）
    this._open = Object.create(null);     // B() 留下的起点（ms）
    this._openHeap = Object.create(null); // B() 留下的堆水位（字节）
    this._cpuStack = [];                  // 打开中的桶，栈顶决定节点访问记给谁
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
    this._segCalls = 0;
    this._segTris = 0;
    this._gpuActive = false;
    this._pending = [];            // 等结果的帧 [{id, segs}]
    this.gpuCpu = Object.create(null);    // 本帧各段的 CPU 提交耗时（ms）
    this.gpuCalls = Object.create(null);  // 本帧各段的 draw call 数
    this.gpuTris = Object.create(null);   // 本帧各段的三角形数

    this._shadowOrig = null;
    this._shadowOne = [null];      // 逐盏调用时复用的一元素数组（别每帧新建）
    this._matrixOrig = null;
    this._observer = null;
    this._loafObserver = null;
    this._ltMs = 0;
    this._lastHeap = 0;
    this._lastPrograms = 0;
    this._memory = null;
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
    this._cpuStack.length = 0;
    this._memory = (typeof performance !== "undefined" && performance.memory) || null;
    // renderer.info 默认每次 render 调用就清零，一帧二十几次 render 只能看到最后
    // 一次的数。剖析期间改成手动：BeginFrame 清一次，帧末读到的就是整帧总量。
    if (this._info) { this._info.autoReset = false; this._info.reset(); }
    this._lastPrograms = this._info?.programs ? this._info.programs.length : 0;
    if (this._post) this._post.profiler = this;
    this._WrapShadow();
    this._WrapMatrix();
    try {
      this._observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this._ltMs += entry.duration;
      });
      this._observer.observe({ type: "longtask" });
    } catch (error) { this._observer = null; /* Firefox/Safari 没有 longtask */ }
    this._ObserveLongAnimationFrames();
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
    this._cpuStack.length = 0;
    if (this._info) { this._info.autoReset = true; this._info.reset(); }
    if (this._post && this._post.profiler === this) this._post.profiler = null;
    if (this._shadowOrig) {
      this.renderer.shadowMap.render = this._shadowOrig;
      this._shadowOrig = null;
    }
    if (this._matrixOrig) {
      const proto = this._object3D;
      proto.updateMatrixWorld = this._matrixOrig.updateMatrixWorld;
      proto.updateWorldMatrix = this._matrixOrig.updateWorldMatrix;
      proto.traverse = this._matrixOrig.traverse;
      this._matrixOrig = null;
    }
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._loafObserver) { this._loafObserver.disconnect(); this._loafObserver = null; }
  }

  /**
   * 阴影图是在预通道那次 renderer.render 里顺手烘的（autoUpdate=false、每帧一次
   * needsUpdate），Post 的 pass 标记够不到它。包一层 shadowMap.render，用分段
   * Push/Pop 把它从「预通道」里拆出来。守卫条件照抄 WebGLShadowMap 自己的
   * 早退：GI 的二十几趟全屏四边形（无灯）与烘完之后的每次 render 走原路，
   * 不产生多余查询。
   *
   * 级联多于一盏时**逐盏调用**，每一级一个段（`shadow/c0`、`shadow/c1`…）——
   * 排班表是逐级节流的（近级每帧、远级轮转），一个合计数看不出这一帧到底烘了谁。
   * 两个坑：
   *   · WebGLShadowMap.render 走完会把 `shadowMap.needsUpdate` 清成 false，
   *     第二盏起就会在开头早退（远级阴影再也不烘）—— 每盏之前顶回来，走完再清掉；
   *   · Script_Csm 的 BakeMeter 也包着同一个方法，它是**累加**三角数的
   *     （`meter.triangles += …`），逐盏调用只会分几次累，总数不变。
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
      if (lights.length === 1) {
        profiler.GpuPush("shadow");
        try { return original.call(this, lights, scene, camera); }
        finally { profiler.GpuPop(); }
      }
      const one = profiler._shadowOne;
      const needsUpdate = shadowMap.needsUpdate;
      try {
        for (let i = 0; i < lights.length; i += 1) {
          one[0] = lights[i];
          shadowMap.needsUpdate = needsUpdate;
          profiler.GpuPush(`shadow/c${i}`);
          try { original.call(this, one, scene, camera); }
          finally { profiler.GpuPop(); }
        }
      } finally {
        one[0] = null;
        shadowMap.needsUpdate = false;   // 与原路一趟走完之后的状态一致
      }
      return undefined;
    };
  }

  /**
   * 矩阵与遍历的节点访问计数。按当前栈顶 CPU 桶记账 —— 这三个方法是递归的
   * （updateMatrixWorld 逐个孩子再调一次自己），所以计到的就是「走过多少个节点」。
   * 剖析关着的时候原型是干净的；Disable 一件不剩地还回去。
   */
  _WrapMatrix() {
    const proto = this._object3D;
    if (!proto || this._matrixOrig) return;
    const profiler = this;
    const original = {
      updateMatrixWorld: proto.updateMatrixWorld,
      updateWorldMatrix: proto.updateWorldMatrix,
      traverse: proto.traverse,
    };
    this._matrixOrig = original;
    proto.updateMatrixWorld = function ProfiledUpdateMatrixWorld(force) {
      profiler._Visit();
      return original.updateMatrixWorld.call(this, force);
    };
    proto.updateWorldMatrix = function ProfiledUpdateWorldMatrix(updateParents, updateChildren) {
      profiler._Visit();
      return original.updateWorldMatrix.call(this, updateParents, updateChildren);
    };
    proto.traverse = function ProfiledTraverse(callback) {
      profiler._Visit();
      return original.traverse.call(this, callback);
    };
  }

  _Visit() {
    const stack = this._cpuStack;
    const name = stack.length ? stack[stack.length - 1] : "other";
    this.cpuVisits[name] = (this.cpuVisits[name] || 0) + 1;
  }

  /**
   * long-animation-frame：浏览器自己报的那一段（渲染开始、样式布局开始、阻塞时长）。
   * 它是「整帧 − 主线程」那一行的唯一具名来源；不支持的浏览器就只剩减法。
   */
  _ObserveLongAnimationFrames() {
    const supported = typeof PerformanceObserver !== "undefined"
      && Array.isArray(PerformanceObserver.supportedEntryTypes)
      && PerformanceObserver.supportedEntryTypes.includes("long-animation-frame");
    if (!supported) { this._loafObserver = null; return; }
    try {
      this._loafObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this._AttachLoaf(entry);
      });
      this._loafObserver.observe({ type: "long-animation-frame" });
    } catch (error) { this._loafObserver = null; }
  }

  _AttachLoaf(entry) {
    const end = entry.startTime + entry.duration;
    const loaf = {
      durationMs: entry.duration,
      // renderStart / styleAndLayoutStart 是时刻，不是时长；没上报时按 0 处理。
      renderMs: entry.renderStart > 0 ? end - entry.renderStart : 0,
      styleMs: entry.styleAndLayoutStart > 0 ? end - entry.styleAndLayoutStart : 0,
      blockingMs: entry.blockingDuration || 0,
    };
    // 挂到时间上最接近的那一帧（rAF 时间戳与 LoAF 的 startTime 同一条时钟）。
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      const record = this.history[i];
      if (record.t <= end) {
        if (end - record.t < 250) record.loaf = loaf;
        return;
      }
    }
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
    for (const key in this.cpuVisits) this.cpuVisits[key] = 0;
    for (const key in this.cpuAlloc) this.cpuAlloc[key] = 0;
    // gpuCpu / gpuCalls / gpuTris 在 GpuFrameStart 也会清，但没走渲染的帧
    //（建关中/停摆）不开 GPU 帧，不在这里清的话上一帧的数会被原样再记一遍。
    for (const key in this.gpuCpu) this.gpuCpu[key] = 0;
    for (const key in this.gpuCalls) this.gpuCalls[key] = 0;
    for (const key in this.gpuTris) this.gpuTris[key] = 0;
    // 上一帧漏掉的 E()（提前 return 的分支）不许跨帧生效：留着的话下一次同名 E
    // 会把两帧之间的所有时间一口气记成一个几十毫秒的假桶。
    for (const key in this._open) this._open[key] = undefined;
    this._cpuStack.length = 0;
    this._frameStart = performance.now();
    if (this._info) this._info.reset();
  }

  B(name) {
    if (!this.on) return;
    this._cpuStack.push(name);
    if (this._memory) this._openHeap[name] = this._memory.usedJSHeapSize;
    this._open[name] = performance.now();
  }

  E(name) {
    if (!this.on) return;
    const started = this._open[name];
    if (started === undefined) return;
    this._open[name] = undefined;
    this.cpu[name] = (this.cpu[name] || 0) + (performance.now() - started);
    if (this._memory) {
      const delta = this._memory.usedJSHeapSize - this._openHeap[name];
      if (delta > 0) this.cpuAlloc[name] = (this.cpuAlloc[name] || 0) + delta / 1024;
    }
    // B/E 不成对时（早退分支）别把栈越堆越高：从栈顶找到这个名字，截到它下面。
    const at = this._cpuStack.lastIndexOf(name);
    if (at >= 0) this._cpuStack.length = at;
  }

  EndFrame() {
    if (!this.on) return;
    const cpuMs = performance.now() - this._frameStart;
    // GC / 分配速率（Chrome 系；别的浏览器 performance.memory 不存在，两项恒 0）
    let gcMb = 0;
    let allocKb = 0;
    const memory = this._memory;
    if (memory) {
      const heap = memory.usedJSHeapSize;
      if (this._lastHeap) {
        const delta = heap - this._lastHeap;
        if (delta < -1048576) gcMb = -delta / 1048576;
        else if (delta > 0) allocKb = delta / 1024;
      }
      this._lastHeap = heap;
    }
    let newPrograms = 0;
    if (this._info && this._info.programs) {
      const count = this._info.programs.length;
      newPrograms = Math.max(0, count - this._lastPrograms);
      this._lastPrograms = count;
    }
    // 节点访问只记给栈顶那一个桶，所以要往上累一遍才是「这一支一共走了多少节点」。
    RollUpPaths(this.cpuVisits);
    RollUpPaths(this.gpuCpu);
    RollUpPaths(this.gpuCalls);
    RollUpPaths(this.gpuTris);
    const cpu = {};
    let bucketSum = 0;
    for (const key in this.cpu) {
      const value = this.cpu[key];
      if (value > 0) {
        cpu[key] = value;
        // 子桶已经含在父桶里，合计只数根桶，否则「其他（未标记）」会被减成 0。
        if (key.indexOf("/") < 0) bucketSum += value;
      }
    }
    const Pack = (bag) => {
      let out = null;
      for (const key in bag) {
        if (bag[key] > 0) {
          if (!out) out = {};
          out[key] = bag[key];
        }
      }
      return out;
    };
    this.history.push({
      id: this.frameId,
      t: this._lastRaf,
      interval: this.interval,
      cpuMs,
      cpu,
      cpuVisits: Pack(this.cpuVisits),
      cpuAlloc: Pack(this.cpuAlloc),
      other: Math.max(0, cpuMs - bucketSum),
      gpu: null,          // _Poll 过几帧补上
      gpuTotal: null,
      gpuCpu: Pack(this.gpuCpu),
      gpuCalls: Pack(this.gpuCalls),
      gpuTris: Pack(this.gpuTris),
      calls: this._info ? this._info.render.calls : 0,
      triangles: this._info ? this._info.render.triangles : 0,
      gcMb,
      allocKb,
      longtaskMs: this._ltMs,
      newPrograms,
      loaf: null,         // LoAF 观察者稍后挂上（不支持的浏览器恒为 null）
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
    for (const key in this.gpuCalls) this.gpuCalls[key] = 0;
    for (const key in this.gpuTris) this.gpuTris[key] = 0;
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
    // 剖析期间 info.autoReset 已经是 false，所以这两个数在整帧里单调增，
    // 段内增量就是这一趟真的提交了多少 draw / 多少三角。
    if (this._info) {
      this._segCalls = this._info.render.calls;
      this._segTris = this._info.render.triangles;
    }
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
    if (this._info) {
      this.gpuCalls[name] = (this.gpuCalls[name] || 0) + (this._info.render.calls - this._segCalls);
      this.gpuTris[name] = (this.gpuTris[name] || 0) + (this._info.render.triangles - this._segTris);
    }
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
      // 分段互斥：父段只量到自己那一小截边界，把子段累上去父行才是整支合计。
      RollUpPaths(sums);
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
  // 场景节点普查（面板/CLI 每秒一次，不进每帧路径）
  // -------------------------------------------------------------------------

  /**
   * 按 scene 的顶层子节点统计后代数 / 骨骼 / 网格 / 蒙皮网格 / 藏起来的子树节点数。
   *
   * 自己走栈而不是用 `scene.traverse`：剖析期间 traverse 被包了计数，用它普查
   * 等于把七千个节点算进面板自己的桶里，读数会被自己的诊断顶花。
   */
  Census(scene = this._scene) {
    if (!scene || !scene.children) return null;
    const roots = [];
    const total = { objects: 0, bones: 0, meshes: 0, skinned: 0, hidden: 0 };
    const stack = [];
    for (const child of scene.children) {
      const row = { name: String(child.name || child.type || "(无名)"),
        objects: 0, bones: 0, meshes: 0, skinned: 0, hidden: 0 };
      stack.length = 0;
      stack.push({ node: child, hidden: child.visible === false });
      while (stack.length) {
        const { node, hidden } = stack.pop();
        row.objects += 1;
        if (hidden) row.hidden += 1;
        if (node.isBone) row.bones += 1;
        if (node.isMesh) row.meshes += 1;
        if (node.isSkinnedMesh) row.skinned += 1;
        const children = node.children;
        if (!children) continue;
        for (let i = 0; i < children.length; i += 1) {
          stack.push({ node: children[i], hidden: hidden || children[i].visible === false });
        }
      }
      for (const key in total) total[key] += row[key];
      roots.push(row);
    }
    roots.sort((a, b) => b.objects - a.objects);
    return { total, roots: roots.slice(0, 12), rootCount: scene.children.length };
  }

  // -------------------------------------------------------------------------
  // 汇总（面板、CLI 与测试共用同一份口径）
  // -------------------------------------------------------------------------

  /**
   * 最近 seconds 秒的聚合：帧率、整帧/CPU/GPU 分项的 avg/p95/max、事件计数、
   * 以及窗口内最差的那一帧（掉帧取证的主角）。
   * 间隔超过 250 ms 的帧按「页面被切走/暂停」处理，不进帧率统计也不进 worst。
   * options.buckets = false 走便宜路径：跳过逐桶/逐 pass 的分位数统计
   * （面板的取证栏每秒刷一次，只要 worst 记录本体与事件计数）。
   */
  Summary(seconds = 2, { buckets = true } = {}) {
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
    const BucketStats = (field, source = rows) => {
      const out = {};
      if (!buckets) return out;
      for (const key of CollectKeys(field)) {
        out[key] = Percentiles(source.map((row) => (row[field] && row[field][key]) || 0));
      }
      return out;
    };
    const gpuRows = rows.filter((row) => row.gpu);
    const gpu = {};
    if (buckets) {
      for (const key of CollectKeys("gpu")) {
        gpu[key] = Percentiles(gpuRows.map((row) => row.gpu[key] || 0));
      }
    }
    let worst = null;
    for (const row of live) {
      // 只在「活着的帧」里挑（切后台/StepFrames 批间的空档不是掉帧），并且要挑
      // 有我们自己工作量的帧（cpuMs ≈ 0 的间隔大帧是浏览器没调度我们，没账可归）。
      if (row.cpuMs < 0.2) continue;
      if (!worst || row.interval > worst.interval) worst = row;
    }
    let gcCount = 0;
    let gcMb = 0;
    let longtaskMs = 0;
    let allocKb = 0;
    let newPrograms = 0;
    let loafCount = 0;
    let loafBlockingMs = 0;
    let loafStyleMs = 0;
    for (const row of rows) {
      if (row.gcMb > 0) { gcCount += 1; gcMb += row.gcMb; }
      longtaskMs += row.longtaskMs;
      allocKb += row.allocKb;
      newPrograms += row.newPrograms || 0;
      if (row.loaf) {
        loafCount += 1;
        loafBlockingMs += row.loaf.blockingMs;
        loafStyleMs += row.loaf.styleMs;
      }
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
      cpuVisits: BucketStats("cpuVisits"),
      cpuAlloc: BucketStats("cpuAlloc"),
      other: Percentiles(rows.map((row) => row.other)),
      // 整帧减主线程：样式 / 布局 / 绘制 / 合成 / 等 vsync 全在这一段里。
      browser: Percentiles(live.map((row) => Math.max(0, row.interval - row.cpuMs))),
      gpu,
      gpuFrames: gpuRows.length,
      gpuTotal: Percentiles(gpuRows.map((row) => row.gpuTotal || 0)),
      gpuCpu: BucketStats("gpuCpu"),
      gpuCalls: BucketStats("gpuCalls"),
      gpuTris: BucketStats("gpuTris"),
      calls: last ? last.calls : 0,
      triangles: last ? last.triangles : 0,
      events: { gcCount, gcMb, longtaskMs, allocKb, newPrograms, loafCount, loafBlockingMs, loafStyleMs,
        allocKbPerFrame: rows.length ? allocKb / rows.length : 0 },
      worst,
      timerAvailable: this.timerAvailable,
      loafAvailable: !!this._loafObserver,
    };
  }
}

export default FrameProfiler;
