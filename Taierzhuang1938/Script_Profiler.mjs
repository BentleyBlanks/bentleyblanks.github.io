// 《台儿庄：血战滕县》运行时性能剖析器（内核，无 DOM）。
//
// 面板在 Script_EditorProfiler（编辑器「渲染调试（可叠加）」组，弹独立窗口），
// 命令行在 Script_ProfileCli（同一份汇总口径）；这里只管计时与取数。
// 构造是免费的，Enable() 才落钩子，关着时每帧只剩几十次 `if (!this.recording) return`
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
// 3. **线程**：玩法期间本作没有 worker（加载画面 2026-09-30 起是一张静图，也不再起 worker），
//    WebAudio 跑在浏览器自己的音频线程、页面测不到 —— 所以「CPU 分线程」诚实的
//    答案就是：主线程逐系统 + GPU 进程逐 pass + 长任务/GC 事件 + 浏览器侧那一段。
//    「浏览器侧」= 整帧间隔 − 主线程工作，里面是样式/布局/绘制/合成与等 vsync；
//    支持 long-animation-frame 的浏览器还能把其中的样式布局耗时单独报出来。
//
// ## 录制与回放（照 Unity Profiler 的做法）
// `on` = 钩子装着；`recording` = 这一帧记不记。Pause() 只停记录、**不拆钩子**，
// 历史环形缓冲原样冻住，面板可以逐帧往回翻；Resume() 接着记，接缝那一帧标
// `gap`（它的间隔是暂停时长，不进帧率统计）。GPU 查询在暂停期间照样收，
// 暂停前最后几帧的 GPU 数不会丢。
// 每帧除了按桶累计的数，还记两条**逐实例时间轴**（Unity 的 Timeline 视图）：
//   · `samples`：每一对 B/E 一条 [名字号, 深度, 起点, 时长]（ms，相对帧起点）——
//     同名多次（`ai/act` 一个兵一次）各是各的，桶表里只看得到合计；
//   · `gpuSegs`：每个 GPU 分段一条 [名字号, 起点, 提交 CPU, draw, 三角]，
//     GPU 耗时收回来后逐段填进 `gpuSegMs`。
// 名字号查 `names`（整个会话一张表）。样本先写进复用的 typed array，帧末一次
// slice 进记录 —— 不在 B/E 里分配，否则「分配KB」那一列会把剖析器自己算进业务桶。
// 整个缓冲可以 ExportRecording() 存成 JSON、ImportRecording() 读回来接着翻；
// 命令行 `--print=<录制文件> --frame=<id>` 走同一份 SummarizeFrames。
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
// 新编译的着色器程序（首见卡顿的来源）按**对象身份**逐个比对 renderer.info.programs，
// 不看数组长度的净增：同一帧里一个释放、一个新建，长度不变，净增会把那次编译吞掉。
// 有新程序的帧再按程序找一遍场景里谁在用它，记成 `newProgramNames`
// （「材质名（类型）@ 物体 < 带名字的父节点」），录制文件里直接写着是谁在现编。
// 找主人要走一遍场景树，只在出现新程序的那一帧走（本来就卡了几百毫秒的那一帧）。
//
// ## 第四版（2026-10-14，对标 UE 的 stat unit / Insights）
// 用户录了一段 20 fps 的战斗，结论要靠五个外部取证脚本才拿得到（哪一步慢、谁在占 draw、
// 机器是不是被别的程序占着、哪些帧是暂停空转）。这一版把这些搬进内核：
//   · **帧状态与阶段**：装配层每帧报 `SetFrameContext(状态, 阶段)`。暂停/菜单/加载帧照记，
//     但汇总默认只算「游戏中 + 过场」（那份录制前 495 帧是暂停空转，把 fps 抬成了 36.8）。
//   · **机器忙闲**（UE Insights 的 Context Switches 那一类问题）：Worker 里每半秒跑一段固定
//     整数运算，耗时 ÷ 本机最快记录 = 「比空闲时慢几倍」；另读浏览器的 Compute Pressure
//     （系统 CPU 压力四档）。那份录制同样的活单价是空闲时的 1.7–2.0 倍，旧版完全看不出来。
//   · **渲染统计**（stat scenerendering / stat rhi）：剖析期间包一层 renderer.renderBufferDirect，
//     按 GPU 分段记材质切换、程序切换、变体重算（同一材质换了 program）、实例数；
//     `RequestDrawCapture()` 抓下一帧的逐 draw 清单（GPU Visualizer 的逐 draw 事件）。
//   · **计数器**（Insights 的 Counters）：`AddCounter(名字, 取值)`，每 COUNTER_EVERY 帧取一次。
//   · **事件标记**（Insights 的 Bookmarks）：`Mark(类别, 文字)`，阶段切换、爆炸、阵亡、自动降档……
//   · 每帧记 `t0`（主线程开工的绝对时刻），JS 采样（Script_ProfilerSampler）按它把函数样本
//     归到桶里。
//
// 不 import three：拿的是 renderer 的裸 WebGL2 上下文与 info 表；要包的
// Object3D.prototype 由装配层从构造参数传进来。Node 也能 import 本文件
// （命令行读录制文件、纯 Node 回归），模块顶层不碰任何浏览器 API。

/** 录制文件的格式名（ExportRecording / ImportRecording / 命令行 --print 认它）。 */
export const RECORDING_FORMAT = "tengxian-profiler-recording";
/** 2 = 第四版（帧状态/阶段/忙闲/渲染统计/计数器/事件/draw 清单）；1 版文件照读，缺的字段当没有。 */
export const RECORDING_VERSION = 2;

/**
 * 帧状态（装配层 SetFrameContext 报上来的那个字）。只有「游戏中」与「过场」算活动帧，
 * 其余照记、照画在帧图上（灰底），但默认不进汇总。
 */
export const FRAME_STATES = {
  play: "游戏中",
  cutscene: "过场",
  menu: "菜单",
  paused: "暂停",
  editor: "编辑器接管",
  loading: "加载/预热",
  failure: "失败画面",
  hidden: "页面在后台",
};
const ACTIVE_STATES = new Set(["play", "cutscene"]);

/**
 * 算「渲染提交」（UE stat unit 的 Draw）的 CPU 桶：RenderScene 里打的那几个。
 * 其余根桶（AI、物理、剧情、玩家……）都是「逻辑」（Game）。`overlay` 是剖析面板自己，
 * 单列，不算进任何一边。
 */
export const RENDER_BUCKETS = ["post", "matrix", "shadowBatch", "actorBatch", "frameSetup", "firstPersonShadow", "gi"];
const RENDER_BUCKET_SET = new Set(RENDER_BUCKETS);

/** 卡顿三档的下限（ms）：≥50 轻、≥100 中、≥250 重。 */
export const HITCH_MINOR_MS = 50;
export const HITCH_MAJOR_MS = 100;
export const HITCH_SEVERE_MS = 250;

/** 计数器每隔几帧取一次值（取值函数可能要扫一遍演员表，不值得每帧跑）。 */
export const COUNTER_EVERY = 6;

/** 忙闲探针：Worker 里每次跑多少次整数迭代、多久跑一次。空闲的 5800X 上约 3–4 ms。 */
const BUSY_ITERATIONS = 4000000;
const BUSY_PERIOD_MS = 500;
/** 本机最快一次的探针耗时存在这里（跨会话），「慢几倍」就是相对它算的。 */
const BUSY_BASELINE_KEY = "tz.profiler.busyBaseline.v1";
/** Compute Pressure 的四档（-1 = 浏览器不支持或还没报）。 */
export const PRESSURE_LEVELS = ["nominal", "fair", "serious", "critical"];
export const PRESSURE_LABELS = ["空闲", "一般", "吃紧", "满载"];

/**
 * 帧是否算「活动帧」（进汇总）。旧版（1 版）录制没有 state：主线程几乎没干活、
 * 一个桶都没记的帧就是暂停/菜单空转（2026-10-14 那份录制前 495 帧都是这样），其余算活动。
 */
export function IsActiveFrame(row) {
  if (row.state) return ACTIVE_STATES.has(row.state);
  if (row.cpuMs < 0.2 && (!row.cpu || Object.keys(row.cpu).length === 0)) return false;
  return true;
}

/** 帧状态（旧录制推断）：给帧图上灰底、事件页分组用。 */
export function FrameStateOf(row) {
  if (row.state) return row.state;
  return IsActiveFrame(row) ? "play" : "paused";
}

/**
 * 从活帧间隔里猜显示器的刷新周期（ms）。rAF 时间戳贴着 vsync，间隔几乎是周期的整数倍
 * （那份录制全是 10.0 / 20.0 / 30.0 / 39.9 —— 100 Hz 屏）。从长周期往短周期试，
 * 第一个「所有间隔离整数倍都不远」的就是它；短周期总能套住长周期的倍数，所以不能反着试。
 */
export function EstimateVsyncMs(intervals) {
  const usable = intervals.filter((value) => value > 3 && value < 250);
  if (usable.length < 20) return 1000 / 60;
  const CANDIDATES = [1000 / 30, 1000 / 50, 1000 / 60, 1000 / 75, 1000 / 90, 1000 / 100, 1000 / 120,
    1000 / 144, 1000 / 165, 1000 / 240];
  for (const period of CANDIDATES) {
    let off = 0;
    let shorter = 0;
    for (const value of usable) {
      const ratio = value / period;
      if (ratio < 0.85) shorter += 1;
      off += Math.abs(ratio - Math.round(ratio));
    }
    // 有一成以上的帧比这个周期还短，说明屏幕比它刷得快，换下一个候选
    if (shorter > usable.length * 0.1) continue;
    if (off / usable.length < 0.07) return period;
  }
  // 都套不上（StepFrames、合成器不贴 vsync）：退回最短的那一档活帧间隔
  const sorted = [...usable].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.05)] || 1000 / 60;
}

/** 每条 CPU 样本占几格：[名字号, 深度, 起点 ms, 时长 ms]。 */
export const SAMPLE_STRIDE = 4;
/** 每条 GPU 分段占几格：[名字号, 起点 ms, 提交 CPU ms, draw, 三角]。 */
export const GPU_SEG_STRIDE = 5;

/** 历史缓冲帧数的上下限（面板的下拉框在这个范围里选）。 */
export const HISTORY_MIN = 60;
export const HISTORY_MAX = 7200;

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

/**
 * avg / 中位 / p95 / max / min（Insights Timers 表的那几列）。p99 只在帧时间那一行用得上，
 * 但算它不花什么钱，统一给。
 */
function Percentiles(values) {
  if (values.length === 0) return { avg: 0, med: 0, p95: 0, p99: 0, max: 0, min: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (const value of sorted) sum += value;
  const At = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    avg: sum / sorted.length,
    med: At(0.5),
    p95: At(0.95),
    p99: At(0.99),
    max: sorted[sorted.length - 1],
    min: sorted[0],
  };
}

/**
 * 新程序主人的一行字：「材质名（类型）@ 物体 < 最近一个带名字的父节点」。
 * 物体没名字就写类型；深度材质（customDepthMaterial）也照这个格式，类型会写成 MeshDepthMaterial。
 */
function ProgramOwnerLabel(material, object) {
  const materialText = material.name ? `${material.name}（${material.type}）` : material.type;
  let text = `${materialText} @ ${object.name || object.type}`;
  let parent = object.parent;
  while (parent && !parent.name) parent = parent.parent;
  if (parent && !parent.isScene) text += ` < ${parent.name}`;
  return text;
}

/** 帧间隔能不能进帧率统计：接缝帧（暂停后第一帧）、切后台/批间空档都不算。 */
export function IsLiveFrame(row) {
  return row.interval > 0 && row.interval < 250 && !row.gap;
}

/**
 * 一组帧记录的聚合：帧率、整帧/CPU/GPU 分项的 avg/p95/max、事件计数、
 * 以及这组帧里最差的那一帧（掉帧取证的主角）。
 *
 * 纯函数：面板的「实时最近 N 秒」「选中的一帧 / 一段」、命令行读录制文件，
 * 走的都是这一条，不会出现两处口径各算各的。只有一帧时 avg = p95 = max。
 * options.buckets = false 走便宜路径：跳过逐桶/逐 pass 的分位数统计。
 */
export function SummarizeFrames(allRows, {
  seconds = null, buckets = true, timerAvailable = false, loafAvailable = false,
  activeOnly = true, targetFps = 0, counterNames = null,
} = {}) {
  // 帧状态分布（全部帧），以及默认只算活动帧（游戏中 + 过场）。一帧活动帧都没有
  // （整段都在菜单里）就退回全部帧，别让表整张空掉。
  const states = {};
  for (const row of allRows) {
    const key = FrameStateOf(row);
    states[key] = (states[key] || 0) + 1;
  }
  const activeRows = activeOnly ? allRows.filter(IsActiveFrame) : allRows;
  const rows = activeRows.length ? activeRows : allRows;
  const excluded = allRows.length - rows.length;
  const live = rows.filter(IsLiveFrame);
  const frame = Percentiles(live.map((row) => row.interval));
  const cpuTotal = Percentiles(rows.map((row) => row.cpuMs));
  const CollectKeys = (field, source = rows) => {
    const keys = new Set();
    for (const row of source) {
      const bag = row[field];
      if (bag) for (const key in bag) keys.add(key);
    }
    return keys;
  };
  const BucketStats = (field) => {
    const out = {};
    if (!buckets) return out;
    for (const key of CollectKeys(field)) {
      out[key] = Percentiles(rows.map((row) => (row[field] && row[field][key]) || 0));
    }
    return out;
  };
  const gpuRows = rows.filter((row) => row.gpu);
  const gpu = {};
  if (buckets) {
    for (const key of CollectKeys("gpu", gpuRows)) {
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
  // 一帧都不「活」（单选了接缝帧、或 StepFrames 首帧）也要给个主角，别让取证栏空着。
  if (!worst && rows.length === 1) worst = rows[0];
  let gcCount = 0;
  let gcMb = 0;
  let longtaskMs = 0;
  let allocKb = 0;
  let newPrograms = 0;
  // 同一份材质在一段里现编多次（释放了又编）要看得出来，所以按名字计次，不去重成集合。
  const programNames = new Map();
  let loafCount = 0;
  let loafBlockingMs = 0;
  let loafStyleMs = 0;
  for (const row of rows) {
    if (row.gcMb > 0) { gcCount += 1; gcMb += row.gcMb; }
    longtaskMs += row.longtaskMs || 0;
    allocKb += row.allocKb || 0;
    newPrograms += row.newPrograms || 0;
    if (row.newProgramNames) {
      for (const name of row.newProgramNames) programNames.set(name, (programNames.get(name) || 0) + 1);
    }
    if (row.loaf) {
      loafCount += 1;
      loafBlockingMs += row.loaf.blockingMs;
      loafStyleMs += row.loaf.styleMs;
    }
  }
  const first = rows.length ? rows[0] : null;
  const last = rows.length ? rows[rows.length - 1] : null;
  const spanSeconds = first && last ? (last.t - first.t + (last.interval || 0)) / 1000 : 0;

  // --- stat unit：逻辑（Game）/ 渲染提交（Draw）/ GPU / 浏览器侧，以及每帧卡在哪一边 ---
  // 浏览器里主线程只有一条，逻辑和提交是串着跑的，所以 CPU 一侧的账是两者之和；
  // GPU 读数比整个主线程还长的帧才算「卡在 GPU」。
  const unitGame = [];
  const unitDraw = [];
  const unitOverlay = [];
  const bound = { game: 0, draw: 0, gpu: 0 };
  for (const row of rows) {
    let draw = 0;
    let overlay = 0;
    const cpu = row.cpu || {};
    for (const key in cpu) {
      if (key.indexOf("/") >= 0) continue;
      if (RENDER_BUCKET_SET.has(key)) draw += cpu[key];
      else if (key === "overlay") overlay += cpu[key];
    }
    const game = Math.max(0, row.cpuMs - draw - overlay);
    unitGame.push(game);
    unitDraw.push(draw);
    unitOverlay.push(overlay);
    if (!IsLiveFrame(row) || row.cpuMs < 0.2) continue;
    if (row.gpuTotal != null && row.gpuTotal > row.cpuMs) bound.gpu += 1;
    else if (draw > game) bound.draw += 1;
    else bound.game += 1;
  }
  const boundTotal = bound.game + bound.draw + bound.gpu;
  const bottleneck = boundTotal === 0 ? null
    : Object.keys(bound).reduce((best, key) => (bound[key] > bound[best] ? key : best), "game");

  // --- 卡顿与预算（UE stat unitgraph 的预算线 + CSV 报表的超预算比例 / 掉 vsync）---
  const intervals = live.map((row) => row.interval);
  const vsyncMs = EstimateVsyncMs(intervals);
  const budgetMs = targetFps > 0 ? 1000 / targetFps : vsyncMs;
  let overBudget = 0;
  let missedVsync = 0;
  let minor = 0;
  let major = 0;
  let severe = 0;
  for (const value of intervals) {
    if (value > budgetMs * 1.1) overBudget += 1;
    missedVsync += Math.max(0, Math.round(value / vsyncMs) - 1);
    if (value >= HITCH_SEVERE_MS) severe += 1;
    else if (value >= HITCH_MAJOR_MS) major += 1;
    // 卡顿分三档按绝对时长（与刷新率无关：100 Hz 屏上「两倍预算」才 20 ms，几乎每帧都算，没意义）
    else if (value >= HITCH_MINOR_MS) minor += 1;
  }
  const minutes = Math.max(spanSeconds / 60, 1e-6);
  const hitch = {
    vsyncMs,
    refreshHz: 1000 / vsyncMs,
    budgetMs,
    targetFps: 1000 / budgetMs,
    overBudget,
    overBudgetPct: intervals.length ? (overBudget / intervals.length) * 100 : 0,
    missedVsync,
    // 该显示的 vsync 里有多少没换上新画面（UE CSV 报表的 MVP 一类口径）
    missedVsyncPct: intervals.length ? (missedVsync / (missedVsync + intervals.length)) * 100 : 0,
    minor, major, severe,
    minorPerMin: minor / minutes, majorPerMin: major / minutes, severePerMin: severe / minutes,
    low1Fps: frame.p99 > 0 ? 1000 / frame.p99 : 0,
  };

  // --- 机器忙闲（Worker 探针「慢几倍」+ 系统 CPU 压力）---
  const busyValues = [];
  const pressure = [0, 0, 0, 0];
  let pressureFrames = 0;
  for (const row of rows) {
    if (row.busy > 0) busyValues.push(row.busy);
    if (row.pressure >= 0 && row.pressure <= 3) { pressure[row.pressure] += 1; pressureFrames += 1; }
  }
  const busy = busyValues.length ? { ...Percentiles(busyValues), frames: busyValues.length } : null;

  // --- 渲染统计（逐 pass 的材质/程序切换、变体重算、实例数）---
  const RenderTotals = (field) => Percentiles(rows.map((row) => {
    const bag = row[field];
    if (!bag) return 0;
    let sum = 0;
    for (const key in bag) if (key.indexOf("/") < 0) sum += bag[key];
    return sum;
  }));
  const render = {
    matSw: BucketStats("rsMat"),
    progSw: BucketStats("rsProg"),
    flips: BucketStats("rsFlip"),
    instances: BucketStats("rsInst"),
    totals: {
      matSw: RenderTotals("rsMat"),
      progSw: RenderTotals("rsProg"),
      flips: RenderTotals("rsFlip"),
      instances: RenderTotals("rsInst"),
      calls: Percentiles(rows.map((row) => row.calls || 0)),
      triangles: Percentiles(rows.map((row) => row.triangles || 0)),
    },
  };

  // --- 计数器（每 COUNTER_EVERY 帧一组值，按下标对齐 counterNames）---
  const counterRows = rows.filter((row) => row.ctr && row.ctr.length);
  const counterCount = counterRows.reduce((n, row) => Math.max(n, row.ctr.length), 0);
  const counters = [];
  for (let i = 0; i < counterCount; i += 1) {
    const values = [];
    for (const row of counterRows) {
      const value = row.ctr[i];
      if (Number.isFinite(value)) values.push(value);
    }
    if (!values.length) continue;
    const stat = Percentiles(values);
    counters.push({ index: i, name: counterNames && counterNames[i] ? counterNames[i] : `#${i}`,
      avg: stat.avg, min: stat.min, max: stat.max, last: values[values.length - 1] });
  }

  // --- 事件标记与阶段 ---
  const marks = [];
  const markCounts = {};
  const stages = [];
  for (const row of allRows) {
    if (row.stage && stages[stages.length - 1] !== row.stage) stages.push(row.stage);
    if (!row.marks) continue;
    for (const [kind, label] of row.marks) {
      marks.push({ id: row.id, kind, label });
      markCounts[kind] = (markCounts[kind] || 0) + 1;
    }
  }
  const drawCaptures = allRows.filter((row) => row.draws).map((row) => row.id);

  return {
    seconds: seconds === null ? Math.round(spanSeconds * 100) / 100 : seconds,
    frames: rows.length,
    framesAll: allRows.length,
    excluded,
    states,
    activeOnly: activeOnly && activeRows.length > 0,
    unit: {
      game: Percentiles(unitGame),
      draw: Percentiles(unitDraw),
      overlay: Percentiles(unitOverlay),
      bound,
      bottleneck,
    },
    hitch,
    busy,
    pressure: pressureFrames ? { frames: pressureFrames, levels: pressure } : null,
    render,
    counters,
    marks,
    markCounts,
    stages,
    drawCaptures,
    firstId: first ? first.id : null,
    lastId: last ? last.id : null,
    fps: frame.avg > 0 ? 1000 / frame.avg : 0,
    lowFps: frame.p95 > 0 ? 1000 / frame.p95 : 0,   // p95 间隔折成「低帧率」
    frame,
    cpuTotal,
    cpu: BucketStats("cpu"),
    cpuCalls: BucketStats("cpuCalls"),
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
      allocKbPerFrame: rows.length ? allocKb / rows.length : 0,
      // [{ name, count }]，次数多的在前；旧录制文件没有名字，这里就是空表
      newProgramNames: [...programNames].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) },
    worst,
    timerAvailable,
    loafAvailable,
  };
}

/** 一帧记录 → 可 JSON 的对象（typed array 转普通数组，小数留三位，文件小一半）。 */
function FrameToJson(record) {
  const Round = (array) => {
    if (!array) return null;
    const out = new Array(array.length);
    for (let i = 0; i < array.length; i += 1) out[i] = Math.round(array[i] * 1000) / 1000;
    return out;
  };
  return { ...record, samples: Round(record.samples), gpuSegs: Round(record.gpuSegs), gpuSegMs: Round(record.gpuSegMs),
    ctr: Round(record.ctr) };
}

function FrameFromJson(frame) {
  return {
    ...frame,
    samples: Array.isArray(frame.samples) ? Float32Array.from(frame.samples) : null,
    gpuSegs: Array.isArray(frame.gpuSegs) ? Float64Array.from(frame.gpuSegs) : null,
    gpuSegMs: Array.isArray(frame.gpuSegMs) ? Float32Array.from(frame.gpuSegMs) : null,
  };
}

/**
 * 读录制文件里的帧（命令行与 ImportRecording 共用）。格式不对直接抛错，
 * 别让一份快照 JSON 被当成零帧录制安静地排出一张空表。
 */
export function FramesFromRecording(data) {
  if (!data || data.format !== RECORDING_FORMAT || !Array.isArray(data.frames)) {
    throw new Error(`不是剖析录制文件（format 应为 ${RECORDING_FORMAT}）`);
  }
  return data.frames.map(FrameFromJson);
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
    this.on = false;               // 钩子装着
    this.recording = false;        // 这一帧记不记（Pause 只关它，不拆钩子）
    this.timerAvailable = false;

    this.frameId = 0;
    this.interval = 0;             // rAF 到 rAF 的真实间隔（ms）
    this.history = [];             // 每帧一条记录，环形上限 historyMax
    this.historyMax = 900;         // 60 fps 下约 15 秒
    this.revision = 0;             // 历史每变一次（新帧 / GPU 结果到 / 清空 / 导入）就 +1，面板靠它决定重画
    this.source = null;            // 导入的录制：{ label, when, timerAvailable, loafAvailable }；实时记录时为 null

    // 时间轴样本的名字表：整个会话一张（清空历史也不清，名字号保持稳定）。
    this.names = [];
    this._nameIds = new Map();
    this._samples = new Float32Array(SAMPLE_STRIDE * 1024);
    this._sampleCount = 0;
    this._gpuSegBuf = new Float64Array(GPU_SEG_STRIDE * 64);
    this._gpuSegCount = 0;
    this._gap = false;             // 下一条记录是暂停后的接缝帧

    this.cpu = Object.create(null);       // 本帧各桶累计（ms）
    this.cpuCalls = Object.create(null);  // 本帧各桶的 B/E 对数
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
    this._segs = [];               // 本帧已结束的段 [{name, query, slot}]
    this._stack = [];              // GpuPush 的名字栈
    this._segQuery = null;
    this._segName = null;
    this._segCpuStart = 0;
    this._segCalls = 0;
    this._segTris = 0;
    this._gpuActive = false;
    this._pending = [];            // 等结果的帧 [{id, segs, slots}]
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
    this._lastProgramTail = null;
    this._knownPrograms = new Set();
    this._memory = null;
    this._info = renderer ? renderer.info : null;

    // --- 第四版 ---
    // 帧状态与阶段（装配层每帧 SetFrameContext；阶段一变自动打一个 stage 标记）
    this._state = "play";
    this._stage = null;
    // 事件标记：本帧攒的 [类别, 文字]，帧末挂进记录（帧与帧之间打的挂到下一帧）
    this._marks = [];
    // 计数器：[{ name, label, unit, group, get }]，下标就是录制里 ctr 数组的下标，只追加不删
    this.counters = [];
    // 环境（装配层给一个取值函数：画质档、内部分辨率、开着的特效……）；导出录制时取一次
    this.environment = null;
    // 渲染统计：包 renderBufferDirect，按当前 GPU 分段记
    this._rbdOrig = null;
    this._rbdWrapper = null;
    this.rsMat = Object.create(null);    // 材质切换次数
    this.rsProg = Object.create(null);   // 程序切换次数（useProgram 换人）
    this.rsFlip = Object.create(null);   // 变体重算：同一材质这次画的 program 与上次不同
    this.rsInst = Object.create(null);   // 实例数（InstancedMesh.count / BatchedMesh 多绘 / 实例化几何）
    this._lastMaterialId = -1;
    this._lastProgram = null;
    // 抓一帧 draw 清单：RequestDrawCapture 置位，下一帧 BeginFrame 开始记、EndFrame 挂进记录
    this._captureNext = false;
    this._capturing = false;
    this._drawList = null;
    // 机器忙闲：Worker 探针最近一次「慢几倍」与系统 CPU 压力档（-1 = 不可用）
    this.busy = 0;
    this.busyMs = 0;
    this.busyBaselineMs = 0;
    this._busyWorker = null;
    this._busyTimer = null;
    this._busyUrl = null;
    this._busyWarm = 0;
    this.pressure = -1;
    this.pressureAvailable = false;
    this._pressureObserver = null;
    // 汇总口径（面板的「只看游戏帧」「目标帧率」；0 = 按估出来的刷新率）
    this.activeOnly = true;
    this.targetFps = 0;
  }

  // -------------------------------------------------------------------------
  // 第四版的装配接口（Script_Main 调）
  // -------------------------------------------------------------------------

  /**
   * 每帧开工前报一次：这一帧是什么状态（FRAME_STATES 的 key）、第一关的哪个阶段。
   * 关着时也记住最新值（便宜的两次赋值），打开剖析器的第一帧就有上下文。
   */
  SetFrameContext(state, stage = null) {
    this._state = state || "play";
    if (stage !== this._stage) {
      const previous = this._stage;
      this._stage = stage;
      if (this.recording && previous !== null && stage) this.Mark("stage", String(stage));
    }
  }

  /** 事件标记（帧图上的小旗、事件页的一行）。类别见 Script_ProfilerReport.MARK_KINDS。 */
  Mark(kind, label = "") {
    if (!this.recording) return;
    if (this._marks.length < 64) this._marks.push([kind, String(label).slice(0, 120)]);
  }

  /**
   * 登记一个计数器。`get()` 返回数字（取不到就返回 NaN / null）；同名重复登记只换取值函数
   * （换关会重建系统，下标不能变）。
   */
  AddCounter(name, get, { label = name, unit = "", group = "" } = {}) {
    const existing = this.counters.find((counter) => counter.name === name);
    if (existing) { existing.get = get; existing.label = label; existing.unit = unit; existing.group = group; return; }
    this.counters.push({ name, label, unit, group, get });
  }

  /** 计数器名表（与录制里每帧 ctr 的下标对齐）。 */
  CounterMeta() {
    return this.counters.map(({ name, label, unit, group }) => ({ name, label, unit, group }));
  }

  /** 抓下一帧的逐 draw 清单（帧末挂在那一帧记录的 `draws` 上）。 */
  RequestDrawCapture() {
    if (!this.on) return false;
    this._captureNext = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // 开关
  // -------------------------------------------------------------------------

  Enable() {
    if (this.on || !this.renderer) return;
    this.on = true;
    this.recording = true;
    this._gl = this.renderer.getContext();
    this._ext = this._gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.timerAvailable = !!this._ext;
    this.Clear();
    this.frameId = 0;
    this._lastRaf = 0;
    this._lastHeap = 0;
    this._ltMs = 0;
    this._cpuStack.length = 0;
    this._memory = (typeof performance !== "undefined" && performance.memory) || null;
    // renderer.info 默认每次 render 调用就清零，一帧二十几次 render 只能看到最后
    // 一次的数。剖析期间改成手动：BeginFrame 清一次，帧末读到的就是整帧总量。
    if (this._info) { this._info.autoReset = false; this._info.reset(); }
    this._RememberPrograms(this._info?.programs || null);
    if (this._post) this._post.profiler = this;
    this._WrapShadow();
    this._WrapMatrix();
    this._WrapDraws();
    try {
      this._observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this._ltMs += entry.duration;
      });
      this._observer.observe({ type: "longtask" });
    } catch (error) { this._observer = null; /* Firefox/Safari 没有 longtask */ }
    this._ObserveLongAnimationFrames();
    this._StartBusyMeter();
    this._ObservePressure();
  }

  Disable() {
    if (!this.on) return;
    this.on = false;
    this.recording = false;
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
    if (this._rbdOrig) {
      // 只在当前还是我们那一层时还原（Frame Debugger 抓帧期间会在外面再包一层，它收尾时也是同一条规矩）；
      // 被别人包在里面的话留着无妨：剖析关着时它只是一次布尔判断就直通
      if (this.renderer.renderBufferDirect === this._rbdWrapper) this.renderer.renderBufferDirect = this._rbdOrig;
      this._rbdOrig = null;
      this._rbdWrapper = null;
    }
    this._captureNext = false;
    this._capturing = false;
    this._drawList = null;
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._loafObserver) { this._loafObserver.disconnect(); this._loafObserver = null; }
    this._StopBusyMeter();
    if (this._pressureObserver) {
      try { this._pressureObserver.disconnect(); } catch (error) { /* 已断开 */ }
      this._pressureObserver = null;
    }
    this.pressure = -1;
  }

  // -------------------------------------------------------------------------
  // 录制控制（面板的录制键 / 清空 / 缓冲大小 / 存读）
  // -------------------------------------------------------------------------

  /**
   * 停记录、留钩子：历史冻住供逐帧回看。要在帧与帧之间调（面板按钮、测试里
   * StepFrames 的间隙）；帧中间调的话这一帧不入账，已经开着的 GPU 段照常收尾。
   */
  Pause() {
    if (!this.on || !this.recording) return;
    this.recording = false;
    this._cpuStack.length = 0;
    this.revision += 1;
  }

  /**
   * 接着记。导入过录制的话先清掉 —— 别让另一台机器的帧和这一台的混进同一条缓冲。
   * 接缝帧的间隔是暂停时长，标 gap，不进帧率与最差帧。
   */
  Resume() {
    if (!this.on || this.recording) return;
    if (this.source) this.Clear();
    this.recording = true;
    this._lastRaf = 0;
    this._lastHeap = 0;
    this._ltMs = 0;
    // 暂停期间编出来的程序不记在接缝帧头上：那一帧并没有为它们卡。
    this._RememberPrograms(this._info?.programs || null);
    this._gap = this.history.length > 0;
    this.revision += 1;
  }

  /** 清空历史（名字表保留，名字号稳定）。 */
  Clear() {
    this.history.length = 0;
    this.source = null;
    this._gap = false;
    this.revision += 1;
  }

  /** 改缓冲帧数；缩小时从最老的一头丢。 */
  SetHistoryMax(frames) {
    const next = Math.round(Math.min(HISTORY_MAX, Math.max(HISTORY_MIN, Number(frames) || 0)));
    this.historyMax = next;
    if (this.history.length > next) {
      this.history.splice(0, this.history.length - next);
      this.revision += 1;
    }
  }

  /** 整条缓冲存成可 JSON 的对象（面板「保存录制」、命令行 --record）。 */
  ExportRecording(meta = {}) {
    return {
      format: RECORDING_FORMAT,
      version: RECORDING_VERSION,
      when: new Date().toISOString(),
      timerAvailable: this.source ? this.source.timerAvailable : this.timerAvailable,
      loafAvailable: this.source ? this.source.loafAvailable : !!this._loafObserver,
      historyMax: this.historyMax,
      names: this.names.slice(),
      // 第四版：计数器名表（与每帧 ctr 下标对齐）、环境、忙闲基准
      counters: this.source ? (this.source.counters || []) : this.CounterMeta(),
      environment: this.source ? (this.source.environment || null) : this.Environment(),
      busyBaselineMs: this.source ? (this.source.busyBaselineMs || 0) : this.busyBaselineMs,
      ...meta,
      frames: this.history.map(FrameToJson),
    };
  }

  /**
   * 这台机器、这一局的环境（stat unit 旁边那一栏）：计时精度、刷新率、画质档、分辨率、
   * 开着的特效。画质部分由装配层的 `environment()` 提供；剖析器只补自己知道的。
   */
  Environment() {
    let extra = null;
    try { extra = typeof this.environment === "function" ? this.environment() : null; } catch (error) { extra = null; }
    const isolated = typeof crossOriginIsolated !== "undefined" ? !!crossOriginIsolated : false;
    return {
      ...extra,
      crossOriginIsolated: isolated,
      // 不隔离的页面 performance.now 只有 0.1 ms 粒度：单个 B/E 的 0.1 ms 不是真值，平均才可信
      timerResolutionMs: this._TimerResolution(),
      hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency || null : null,
      deviceMemoryGb: typeof navigator !== "undefined" ? navigator.deviceMemory || null : null,
      pressureAvailable: this.pressureAvailable,
      busyMeter: !!this._busyWorker,
      jsHeap: !!this._memory,
    };
  }

  _TimerResolution() {
    if (typeof performance === "undefined") return null;
    let best = Infinity;
    let last = performance.now();
    for (let i = 0; i < 2000 && best > 0.001; i += 1) {
      const now = performance.now();
      if (now > last) { best = Math.min(best, now - last); last = now; }
    }
    return Number.isFinite(best) ? Math.round(best * 10000) / 10000 : null;
  }

  /**
   * 读回一份录制：停记录、换掉历史与名字表。缓冲不够大就撑大到装得下。
   * 还在飞的 GPU 查询整批扔掉 —— 它们的帧号会撞上导入帧的帧号，挂错人。
   */
  ImportRecording(data, label = "") {
    const frames = FramesFromRecording(data);
    if (this.on) this.recording = false;
    for (const entry of this._pending) this._DropPending(entry);
    this._pending.length = 0;
    this.names = Array.isArray(data.names) ? data.names.slice() : [];
    this._nameIds = new Map(this.names.map((name, index) => [name, index]));
    this.historyMax = Math.min(HISTORY_MAX, Math.max(this.historyMax, frames.length));
    this.history = frames.slice(-this.historyMax);
    this.source = {
      label: label || data.label || "",
      when: data.when || "",
      timerAvailable: !!data.timerAvailable,
      loafAvailable: !!data.loafAvailable,
      // 第四版字段（1 版录制没有：计数器表空、环境未知）
      counters: Array.isArray(data.counters) ? data.counters : [],
      environment: data.environment || null,
      busyBaselineMs: data.busyBaselineMs || 0,
      version: data.version || 1,
    };
    this._gap = false;
    this.revision += 1;
    return this.history.length;
  }

  // -------------------------------------------------------------------------
  // 钩子
  // -------------------------------------------------------------------------

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
    if (!this.recording) return;
    const stack = this._cpuStack;
    const name = stack.length ? stack[stack.length - 1] : "other";
    this.cpuVisits[name] = (this.cpuVisits[name] || 0) + 1;
  }

  /**
   * 渲染统计（UE stat rhi / scenerendering 那一类）：包一层 renderBufferDirect。
   *
   * three 每次换材质（`material.id` 变了）都要把这只材质的 uniform 整套重传一遍 ——
   * 2026-10-14 那份 20 fps 录制里主画面 196 个 draw 用了 129 种材质，每个 draw 23 µs，
   * 而预通道一种 override 材质画 183 个只要 6 µs。所以「材质切换」是渲染提交最该看的数。
   * 「变体重算」= 同一只材质这一 draw 画出来用的 program 与上一次不同（蒙皮/实例/合批之间
   * 共用的深度材质会来回翻），每次都要走一遍 getParameters。
   *
   * 开销：每个 draw 一次 WeakMap 查找 + 几次自增（约 0.2–0.4 µs），记在渲染提交里。
   * renderBufferDirect 是 three 在构造函数里挂在实例上的，所以包实例、还实例。
   */
  _WrapDraws() {
    const renderer = this.renderer;
    if (!renderer || this._rbdOrig || typeof renderer.renderBufferDirect !== "function") return;
    const original = renderer.renderBufferDirect;
    const properties = renderer.properties;
    if (!properties) return;
    this._rbdOrig = original;
    const profiler = this;
    renderer.renderBufferDirect = this._rbdWrapper = function ProfiledRenderBufferDirect(camera, scene, geometry, material, object, group) {
      if (!profiler.recording || !material) return original.call(this, camera, scene, geometry, material, object, group);
      const props = properties.get(material);
      const before = props.currentProgram;
      const capture = profiler._capturing;
      const started = capture ? performance.now() : 0;
      const result = original.call(this, camera, scene, geometry, material, object, group);
      profiler._NoteDraw(material, props, before, object, geometry, group, capture ? performance.now() - started : 0);
      return result;
    };
  }

  _NoteDraw(material, props, before, object, geometry, group, ms) {
    const pass = this._segName || "misc";
    if (material.id !== this._lastMaterialId) {
      this._lastMaterialId = material.id;
      this.rsMat[pass] = (this.rsMat[pass] || 0) + 1;
    }
    const program = props.currentProgram;
    if (program !== this._lastProgram) {
      this._lastProgram = program;
      this.rsProg[pass] = (this.rsProg[pass] || 0) + 1;
    }
    if (before && program !== before) this.rsFlip[pass] = (this.rsFlip[pass] || 0) + 1;
    const instances = object?.isInstancedMesh ? object.count
      : object?.isBatchedMesh ? (object._multiDrawCount ?? 1)
        : geometry?.isInstancedBufferGeometry ? geometry.instanceCount : 1;
    this.rsInst[pass] = (this.rsInst[pass] || 0) + (instances || 0);
    if (!this._capturing || !this._drawList || this._drawList.length >= 4000) return;
    // 逐 draw 清单：只在被点名的那一帧记（要走父链找顶层子树，常态不做）
    let top = object;
    while (top && top.parent && top.parent !== this._scene) top = top.parent;
    const index = geometry?.index;
    const position = geometry?.attributes?.position;
    let count = index ? index.count : (position ? position.count : 0);
    if (group) count = Math.min(count, group.count);
    if (geometry?.drawRange && Number.isFinite(geometry.drawRange.count)) count = Math.min(count, geometry.drawRange.count);
    const kind = object?.isBatchedMesh ? "batch" : object?.isInstancedMesh ? "inst"
      : object?.isSkinnedMesh ? "skin" : object?.isPoints ? "pts" : object?.isLine ? "line"
        : geometry?.isInstancedBufferGeometry ? "instGeo" : "mesh";
    this._drawList.push({
      pass,
      object: String(object?.name || object?.type || "?"),
      top: top && top.parent === this._scene ? String(top.name || top.type) : "(不在场景树里)",
      material: String(material.name || material.type),
      materialType: material.type,
      materialId: material.id,
      kind,
      tris: Math.round((count / 3) * Math.max(1, instances || 0)),
      instances: instances || 0,
      us: Math.round(ms * 1000),   // 微秒（不隔离的页面量化到 100 µs：单个不可信，合计可信）
      matSwitch: this._drawList.length === 0 || this._drawList[this._drawList.length - 1].materialId !== material.id,
      flip: !!(before && program !== before),
    });
  }

  /**
   * 机器忙闲探针。Worker 里跑一段固定的整数运算（不碰内存、不分配），耗时 ÷ 本机最快一次
   * = 「比空闲时慢几倍」。放 Worker 而不是主线程：主线程跑 3 ms 会直接顶掉一帧；Worker 在别的
   * 核上跑，系统被别的进程占满时它一样抢不到核、一样变慢，量的正是这件事。
   * 最快记录存 localStorage（跨会话）：刚打开剖析器那一刻机器可能就已经很忙，只拿当次的最小值
   * 当基准会把「一直很忙」读成「正常」。前三次是 JIT 预热，不算。
   */
  _StartBusyMeter() {
    if (this._busyWorker || typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return;
    const source = `const N=${BUSY_ITERATIONS};onmessage=()=>{const t=performance.now();let x=1;`
      + "for(let i=0;i<N;i++){x=(Math.imul(x,1664525)+1013904223)|0;}"
      + "postMessage({ms:performance.now()-t,x});};";
    try {
      this._busyUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      this._busyWorker = new Worker(this._busyUrl);
    } catch (error) {
      this._busyWorker = null;
      return;
    }
    this._busyWarm = 0;
    this.busyBaselineMs = this._LoadBusyBaseline();
    this._busyWorker.onmessage = (event) => this._OnBusySample(event.data && event.data.ms);
    this._busyTimer = setInterval(() => { if (this._busyWorker) this._busyWorker.postMessage(0); }, BUSY_PERIOD_MS);
    this._busyWorker.postMessage(0);
  }

  _StopBusyMeter() {
    if (this._busyTimer) { clearInterval(this._busyTimer); this._busyTimer = null; }
    if (this._busyWorker) { this._busyWorker.terminate(); this._busyWorker = null; }
    if (this._busyUrl) { URL.revokeObjectURL(this._busyUrl); this._busyUrl = null; }
    this.busy = 0;
  }

  _OnBusySample(ms) {
    if (!(ms > 0)) return;
    this._busyWarm += 1;
    if (this._busyWarm <= 3) return;
    this.busyMs = ms;
    if (!(this.busyBaselineMs > 0) || ms < this.busyBaselineMs) {
      this.busyBaselineMs = ms;
      this._SaveBusyBaseline(ms);
    }
    this.busy = ms / this.busyBaselineMs;
  }

  _BusyKey() {
    const ua = typeof navigator !== "undefined" ? `${navigator.userAgent}|${navigator.hardwareConcurrency}` : "";
    return `${BUSY_BASELINE_KEY}|${ua}`;
  }

  _LoadBusyBaseline() {
    try {
      const value = Number(localStorage.getItem(this._BusyKey()));
      return value > 0 ? value : 0;
    } catch (error) { return 0; }
  }

  _SaveBusyBaseline(ms) {
    try { localStorage.setItem(this._BusyKey(), String(ms)); } catch (error) { /* 隐私模式：只在本次会话里记 */ }
  }

  /**
   * Compute Pressure（Chromium 125+）：系统整体 CPU 压力四档。它看的是整台机器，
   * 所以能直接回答「是不是别的程序在占 CPU」。不支持或拒绝就留 -1。
   */
  _ObservePressure() {
    this.pressure = -1;
    this.pressureAvailable = false;
    if (typeof PressureObserver !== "function") return;
    try {
      this._pressureObserver = new PressureObserver((records) => {
        const last = records[records.length - 1];
        const level = last ? PRESSURE_LEVELS.indexOf(last.state) : -1;
        if (level >= 0) this.pressure = level;
      });
      this.pressureAvailable = true;
      const pending = this._pressureObserver.observe("cpu", { sampleInterval: 1000 });
      if (pending && typeof pending.catch === "function") {
        pending.catch(() => { this.pressureAvailable = false; this.pressure = -1; });
      }
    } catch (error) {
      this._pressureObserver = null;
      this.pressureAvailable = false;
    }
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
    if (this.source) return;   // 导入的录制是别的时钟，别往上挂
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
        if (end - record.t < 250) { record.loaf = loaf; this.revision += 1; }
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // CPU 标记（装配层调）
  // -------------------------------------------------------------------------

  BeginFrame(now = performance.now()) {
    if (!this.on) return;
    // 暂停时 GPU 查询也照收：暂停前最后几帧的 GPU 数要落到它们自己的记录上。
    this._Poll();
    if (!this.recording) return;
    this.frameId += 1;
    this.interval = this._lastRaf ? now - this._lastRaf : 0;
    this._lastRaf = now;
    for (const key in this.cpu) this.cpu[key] = 0;
    for (const key in this.cpuCalls) this.cpuCalls[key] = 0;
    for (const key in this.cpuVisits) this.cpuVisits[key] = 0;
    for (const key in this.cpuAlloc) this.cpuAlloc[key] = 0;
    // gpuCpu / gpuCalls / gpuTris 在 GpuFrameStart 也会清，但没走渲染的帧
    //（建关中/停摆）不开 GPU 帧，不在这里清的话上一帧的数会被原样再记一遍。
    for (const key in this.gpuCpu) this.gpuCpu[key] = 0;
    for (const key in this.gpuCalls) this.gpuCalls[key] = 0;
    for (const key in this.gpuTris) this.gpuTris[key] = 0;
    for (const key in this.rsMat) this.rsMat[key] = 0;
    for (const key in this.rsProg) this.rsProg[key] = 0;
    for (const key in this.rsFlip) this.rsFlip[key] = 0;
    for (const key in this.rsInst) this.rsInst[key] = 0;
    this._lastMaterialId = -1;
    this._lastProgram = null;
    if (this._captureNext) {
      this._captureNext = false;
      this._capturing = true;
      this._drawList = [];
    }
    // 上一帧漏掉的 E()（提前 return 的分支）不许跨帧生效：留着的话下一次同名 E
    // 会把两帧之间的所有时间一口气记成一个几十毫秒的假桶。
    for (const key in this._open) this._open[key] = undefined;
    this._cpuStack.length = 0;
    this._sampleCount = 0;
    this._gpuSegCount = 0;
    this._frameStart = performance.now();
    if (this._info) this._info.reset();
  }

  B(name) {
    if (!this.recording) return;
    this._cpuStack.push(name);
    if (this._memory) this._openHeap[name] = this._memory.usedJSHeapSize;
    this._open[name] = performance.now();
  }

  E(name) {
    if (!this.recording) return;
    const started = this._open[name];
    if (started === undefined) return;
    const now = performance.now();
    this._open[name] = undefined;
    const duration = now - started;
    this.cpu[name] = (this.cpu[name] || 0) + duration;
    this.cpuCalls[name] = (this.cpuCalls[name] || 0) + 1;
    if (this._memory) {
      const delta = this._memory.usedJSHeapSize - this._openHeap[name];
      if (delta > 0) this.cpuAlloc[name] = (this.cpuAlloc[name] || 0) + delta / 1024;
    }
    // B/E 不成对时（早退分支）别把栈越堆越高：从栈顶找到这个名字，截到它下面。
    // 找到的位置就是 B 那一刻的嵌套深度（时间轴按它分行）。
    const at = this._cpuStack.lastIndexOf(name);
    const depth = at >= 0 ? at : this._cpuStack.length;
    if (at >= 0) this._cpuStack.length = at;
    this._PushSample(this._NameId(name), depth, started - this._frameStart, duration);
  }

  _NameId(name) {
    let id = this._nameIds.get(name);
    if (id === undefined) {
      id = this.names.length;
      this.names.push(name);
      this._nameIds.set(name, id);
    }
    return id;
  }

  _PushSample(nameId, depth, start, duration) {
    let buffer = this._samples;
    const at = this._sampleCount * SAMPLE_STRIDE;
    if (at + SAMPLE_STRIDE > buffer.length) {
      const grown = new Float32Array(buffer.length * 2);
      grown.set(buffer);
      this._samples = buffer = grown;
    }
    buffer[at] = nameId;
    buffer[at + 1] = depth;
    buffer[at + 2] = start;
    buffer[at + 3] = duration;
    this._sampleCount += 1;
  }

  EndFrame() {
    if (!this.recording) return;
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
    const bornPrograms = this._BornPrograms();
    const newPrograms = bornPrograms ? bornPrograms.length : 0;
    const newProgramNames = bornPrograms ? this._ProgramOwners(bornPrograms) : null;
    // 节点访问只记给栈顶那一个桶，所以要往上累一遍才是「这一支一共走了多少节点」。
    RollUpPaths(this.cpuVisits);
    RollUpPaths(this.gpuCpu);
    RollUpPaths(this.gpuCalls);
    RollUpPaths(this.gpuTris);
    RollUpPaths(this.rsMat);
    RollUpPaths(this.rsProg);
    RollUpPaths(this.rsFlip);
    RollUpPaths(this.rsInst);
    // 计数器每 COUNTER_EVERY 帧取一组（取值函数抛错/取不到记 NaN，不让一个坏计数器拖垮整帧）
    let ctr = null;
    if (this.counters.length && this.frameId % COUNTER_EVERY === 0) {
      ctr = new Float64Array(this.counters.length);
      for (let i = 0; i < this.counters.length; i += 1) {
        let value = NaN;
        try { value = Number(this.counters[i].get()); } catch (error) { value = NaN; }
        ctr[i] = Number.isFinite(value) ? value : NaN;
      }
    }
    const marks = this._marks.length ? this._marks.slice() : null;
    this._marks.length = 0;
    const draws = this._capturing ? this._drawList : null;
    this._capturing = false;
    this._drawList = null;
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
      t0: this._frameStart,   // 主线程开工的绝对时刻（JS 采样按它把函数样本归到桶）
      interval: this.interval,
      gap: this._gap,     // 暂停后的第一帧：间隔是暂停时长，不进帧率统计
      state: this._state,
      stage: this._stage,
      busy: this.busy > 0 ? Math.round(this.busy * 1000) / 1000 : null,
      pressure: this.pressure,
      rsMat: Pack(this.rsMat),
      rsProg: Pack(this.rsProg),
      rsFlip: Pack(this.rsFlip),
      rsInst: Pack(this.rsInst),
      ctr,
      marks,
      draws,
      cpuMs,
      cpu,
      cpuCalls: Pack(this.cpuCalls),
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
      newProgramNames,    // 与 newPrograms 逐个对应的「谁在用它」；没有新程序为 null
      loaf: null,         // LoAF 观察者稍后挂上（不支持的浏览器恒为 null）
      // 逐实例时间轴（帧末一次 slice，B/E 里不分配）
      samples: this._sampleCount ? this._samples.slice(0, this._sampleCount * SAMPLE_STRIDE) : null,
      gpuSegs: this._gpuSegCount ? this._gpuSegBuf.slice(0, this._gpuSegCount * GPU_SEG_STRIDE) : null,
      gpuSegMs: null,     // 与 gpuSegs 逐段对齐，_Poll 过几帧补上
    });
    this._gap = false;
    this._ltMs = 0;
    if (this.history.length > this.historyMax) {
      this.history.splice(0, this.history.length - this.historyMax);
    }
    this.revision += 1;
  }

  // -------------------------------------------------------------------------
  // GPU 分段（RenderScene 与 Post.Render 调）
  // -------------------------------------------------------------------------

  GpuFrameStart() {
    if (!this.recording || this._gpuActive) return;
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
      this._pending.push({ id: this.frameId, segs: this._segs.slice(), slots: this._gpuSegCount });
      this._segs.length = 0;
      // 结果迟迟不来（disjoint、上下文丢失）就丢最老的，别把查询对象攒成山
      while (this._pending.length > 8) this._DropPending(this._pending.shift());
    }
  }

  _StartSeg() {
    this._segName = this._stack.length ? this._stack[this._stack.length - 1] : "misc";
    this._segCpuStart = performance.now();
    // 每一趟 renderer.render 开头 three 都把「当前材质」清掉，所以每段的第一个 draw 必然换材质
    this._lastMaterialId = -1;
    this._lastProgram = null;
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
    const duration = performance.now() - this._segCpuStart;
    const calls = this._info ? this._info.render.calls - this._segCalls : 0;
    const tris = this._info ? this._info.render.triangles - this._segTris : 0;
    this.gpuCpu[name] = (this.gpuCpu[name] || 0) + duration;
    if (this._info) {
      this.gpuCalls[name] = (this.gpuCalls[name] || 0) + calls;
      this.gpuTris[name] = (this.gpuTris[name] || 0) + tris;
    }
    const slot = this._PushGpuSeg(this._NameId(name), this._segCpuStart - this._frameStart, duration, calls, tris);
    this._segName = null;
    if (!this._segQuery) return;
    this._gl.endQuery(this._ext.TIME_ELAPSED_EXT);
    this._segs.push({ name, query: this._segQuery, slot });
    this._segQuery = null;
  }

  _PushGpuSeg(nameId, start, duration, calls, tris) {
    let buffer = this._gpuSegBuf;
    const at = this._gpuSegCount * GPU_SEG_STRIDE;
    if (at + GPU_SEG_STRIDE > buffer.length) {
      const grown = new Float64Array(buffer.length * 2);
      grown.set(buffer);
      this._gpuSegBuf = buffer = grown;
    }
    buffer[at] = nameId;
    buffer[at + 1] = start;
    buffer[at + 2] = duration;
    buffer[at + 3] = calls;
    buffer[at + 4] = tris;
    this._gpuSegCount += 1;
    return this._gpuSegCount - 1;
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
      const perSeg = new Float32Array(entry.slots);
      let total = 0;
      for (const seg of entry.segs) {
        const ms = gl.getQueryParameter(seg.query, gl.QUERY_RESULT) / 1e6;
        sums[seg.name] = (sums[seg.name] || 0) + ms;
        if (seg.slot < perSeg.length) perSeg[seg.slot] = ms;
        total += ms;
        this._pool.push(seg.query);
      }
      // 分段互斥：父段只量到自己那一小截边界，把子段累上去父行才是整支合计。
      RollUpPaths(sums);
      this._AttachGpu(entry.id, sums, total, perSeg);
      this._pending.shift();
    }
  }

  _AttachGpu(id, sums, total, perSeg = null) {
    const index = this.IndexOfId(id);
    if (index < 0) return;   // 记录已被环形淘汰（或暂停在帧中间、这一帧没入账）
    const record = this.history[index];
    record.gpu = sums;
    record.gpuTotal = total;
    record.gpuSegMs = perSeg;
    this.revision += 1;
  }

  // -------------------------------------------------------------------------
  // 回放查询（面板逐帧翻、命令行按帧号取）
  // -------------------------------------------------------------------------

  /** 帧号 → 历史下标（帧号单调增，二分）；不在缓冲里返回 -1。 */
  IndexOfId(id) {
    const history = this.history;
    let lo = 0;
    let hi = history.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const value = history[mid].id;
      if (value === id) return mid;
      if (value < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /** 帧号 → 不晚于它的最近一帧的下标（帧号被淘汰或落在接缝里时也有个落脚点）。 */
  IndexAtOrBefore(id) {
    const history = this.history;
    let lo = 0;
    let hi = history.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (history[mid].id <= id) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }

  FrameById(id) {
    const index = this.IndexOfId(id);
    return index < 0 ? null : this.history[index];
  }

  /**
   * 从 index 往 direction（±1）方向找下一个尖峰帧：间隔超过缓冲里活帧中位数的
   * 1.5 倍、并且至少多 4 ms（60 fps 下一帧 16.7 → 25 ms 以上才算）。找不到返回 -1。
   */
  FindSpike(index, direction = 1) {
    const history = this.history;
    const intervals = [];
    for (const row of history) if (IsLiveFrame(row)) intervals.push(row.interval);
    if (intervals.length === 0) return -1;
    intervals.sort((a, b) => a - b);
    const median = intervals[intervals.length >> 1];
    const threshold = Math.max(median * 1.5, median + 4);
    const step = direction < 0 ? -1 : 1;
    for (let i = index + step; i >= 0 && i < history.length; i += step) {
      const row = history[i];
      if (IsLiveFrame(row) && row.interval >= threshold) return i;
    }
    return -1;
  }

  /**
   * 汇总口径的公共参数：GPU 计时与 LoAF 可不可用、计数器名表、只算活动帧、目标帧率
   * （面板可改；0 = 按估出来的刷新率）。
   */
  _SummaryFlags() {
    const base = this.source
      ? { timerAvailable: this.source.timerAvailable, loafAvailable: this.source.loafAvailable,
        counterNames: (this.source.counters || []).map((counter) => counter.label || counter.name) }
      : { timerAvailable: this.timerAvailable, loafAvailable: !!this._loafObserver,
        counterNames: this.counters.map((counter) => counter.label || counter.name) };
    return { ...base, activeOnly: this.activeOnly, targetFps: this.targetFps };
  }

  // -------------------------------------------------------------------------
  // 新编译的着色器程序
  // -------------------------------------------------------------------------

  /** 记下当前这批程序对象（Enable / Resume 时对齐，之后逐帧比身份）。 */
  _RememberPrograms(programs) {
    this._knownPrograms.clear();
    if (programs) for (const program of programs) this._knownPrograms.add(program);
    this._lastPrograms = programs ? programs.length : 0;
    this._lastProgramTail = programs && programs.length ? programs[programs.length - 1] : null;
  }

  /**
   * 这一帧新出现的程序对象；没有返回 null。
   * three 新建程序 push 在数组尾、释放时从中间 splice 掉，所以「长度与末尾那个都没变」
   * 就是没有变化 —— 绝大多数帧只做这两次比较。
   */
  _BornPrograms() {
    const programs = this._info && this._info.programs;
    if (!programs) return null;
    const count = programs.length;
    const tail = count ? programs[count - 1] : null;
    if (count === this._lastPrograms && tail === this._lastProgramTail) return null;
    let born = null;
    for (const program of programs) {
      if (this._knownPrograms.has(program)) continue;
      (born || (born = [])).push(program);
    }
    this._RememberPrograms(programs);
    return born;
  }

  /**
   * 每个新程序找一个在用它的物体，写成「材质名（类型）@ 物体 < 带名字的父节点」。
   * 按 renderer.properties 里材质记着的程序表反查；只查 has() 过的材质，不替从没画过的
   * 材质建属性表。后处理全屏片这类不在场景树里的材质找不到主人，退回程序自己的名字。
   * 与 Census 同理自己走栈，不借被包了计数的 traverse。
   */
  _ProgramOwners(programs) {
    const properties = this.renderer && this.renderer.properties;
    const labels = new Map();
    const scene = this._scene;
    if (properties && scene) {
      const want = new Set(programs);
      const Check = (material, object) => {
        if (!material) return;
        const list = Array.isArray(material) ? material : [material];
        for (const entry of list) {
          if (!entry || !properties.has(entry)) continue;
          const owned = properties.get(entry).programs;
          if (!owned) continue;
          for (const program of owned.values()) {
            if (!want.has(program) || labels.has(program)) continue;
            labels.set(program, ProgramOwnerLabel(entry, object));
          }
        }
      };
      const stack = [scene];
      while (stack.length && labels.size < want.size) {
        const node = stack.pop();
        Check(node.material, node);
        Check(node.customDepthMaterial, node);
        Check(node.customDistanceMaterial, node);
        const children = node.children;
        if (children) for (let i = 0; i < children.length; i += 1) stack.push(children[i]);
      }
    }
    return programs.map((program) => labels.get(program)
      || `${program.name || "(无名)"} @ (不在场景树里)`);
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
   * 缓冲里最后 seconds 秒的聚合（按最后一条记录的时刻往回截，暂停后读的是
   * 暂停前那一段，不会因为墙钟走远了就读成空表）。口径见 SummarizeFrames。
   * 间隔超过 250 ms 的帧与接缝帧不进帧率统计也不进 worst。
   */
  Summary(seconds = 2, { buckets = true } = {}) {
    const history = this.history;
    const lastT = history.length ? history[history.length - 1].t : 0;
    const cutoff = lastT - seconds * 1000;
    let first = history.length;
    while (first > 0 && history[first - 1].t >= cutoff) first -= 1;
    return SummarizeFrames(history.slice(first), { seconds, buckets, ...this._SummaryFlags() });
  }

  /** 帧号闭区间 [firstId, lastId] 的聚合（面板选中一帧或拖出一段）。 */
  SummaryRange(firstId, lastId = firstId, { buckets = true } = {}) {
    const lo = Math.min(firstId, lastId);
    const hi = Math.max(firstId, lastId);
    const rows = this.history.filter((row) => row.id >= lo && row.id <= hi);
    return SummarizeFrames(rows, { buckets, ...this._SummaryFlags() });
  }
}

export default FrameProfiler;
