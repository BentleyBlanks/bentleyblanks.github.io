// 剖析汇总的**显示层**：面板（Script_EditorProfiler）与命令行（Script_ProfileCli）
// 共用同一份排版口径，免得两处各写一套、读出两个数。
//
// 纯函数、零依赖（不 import three、不碰 DOM），所以 Node 也能直接拿 JSON 排表。
//
// ## 分层
// 桶名带斜杠就是子桶（`ai/act/anim`）。存储是平的，这里按前缀排成树：
//   · CPU 的 B/E 是真的套着调的，父桶的数字**已经含子桶** —— 父行显示整支合计，
//     后面跟一条「自身」= 父 − 子之和；
//   · GPU 分段本来互斥，Script_Profiler 在收结果时已经把子段累进了父段，
//     所以这里两张表是同一个读法。
//
// ## 逐 pass 的提交 CPU 为什么出现在 CPU 表里
// `gpuCpu[pass]` 是「提交这一趟花了多少主线程时间」。它是 CPU 账不是 GPU 账，
// 所以挂在 `post` 底下当子行；已经有自己 CPU 桶的段（gi / matrix / actorBatch /
// frameSetup / firstPersonShadow）不重复挂一遍。

/** CPU 桶的中文说明。没登记的 key 照原样显示（表是数据驱动的，不靠这张表决定显示什么）。 */
export const CPU_LABELS = {
  post: "渲染提交（整条链）",
  ai: "AI",
  "ai/think": "决策（Think，每帧六分之一的人）",
  "ai/act": "执行（Act：移动、贴地、开火）",
  "ai/act/anim": "人物动画与蒙皮解算",
  "ai/corpse": "尸体（倒地收尾与刚体同步）",
  "ai/cull": "可见性剔除",
  "ai/front": "战线重算（每秒一次）",
  "ai/grenade": "在飞手榴弹的威胁扫描",
  "ai/nav": "寻路帧预算复位",
  physics: "物理（Rapier）",
  player: "玩家",
  viewmodel: "视图模型",
  vfx: "特效",
  combat: "战斗结算/破坏",
  actorBatch: "人物合批",
  matrix: "场景矩阵（updateMatrixWorld）",
  frameSetup: "出画前接线（雾/水面/听者/簇表）",
  firstPersonShadow: "视模自阴影",
  gi: "GI 探针（CPU）",
  hud: "HUD",
  story: "剧情与目标",
  "story/mission": "第一关任务运行时",
  "story/mission/train": "军列推进",
  "story/mission/voice": "对白、音乐与战场声",
  "story/mission/spawns": "遭遇放置",
  "story/mission/director": "调度（小队/战线/战术/空袭/担架）",
  "story/mission/other": "其余任务判定",
  "story/p012": "白盒流程",
  "story/objectives": "目标推进",
  "story/narrative": "叙事层",
  "story/setpieces": "章节摆点",
  "story/carry": "担架视图",
  "story/scenario": "情境闸门与导航刷新",
  spawn: "补兵",
  streamer: "道具流送",
  input: "输入",
  overlay: "编辑器叠加层（含本面板）",
  other: "其他（未标记）",
  browser: "浏览器侧（布局/绘制/合成/等 vsync）",
};

/**
 * GPU pass 的中文说明。**显示的一律是英文 key**（帧图里写的就是这个名字），
 * 这张表只进 title / 备注，别拿它当显示名 —— 译名会让人对不上 Script_Post 的 passes。
 */
export const GPU_NOTES = {
  shadow: "太阳级联阴影图烘焙",
  prepass: "深度法线预通道（含速度）",
  hzb: "层级深度金字塔",
  ssr: "屏幕空间反射追踪",
  gtao: "地平线环境光遮蔽 + SSIL",
  contactShadows: "屏幕空间接触阴影",
  main: "主场景不透明与透明",
  wireframe: "线框调试",
  debugOverlay: "调试叠加",
  volumetricInject: "体积雾注入",
  volumetricIntegrate: "体积雾积分",
  volumetricApply: "体积雾合入",
  taa: "时域抗锯齿解算 / TAAU",
  exposure: "自动曝光测光",
  ssilHistory: "SSIL 反弹源留档",
  ssrColor: "SSR 颜色历史留档",
  motionBlur: "运动模糊",
  dof: "景深",
  bloom: "泛光",
  god: "屏幕空间体积光",
  lensFlare: "镜头光晕",
  composite: "合成（色调映射/雾/暗角）",
  fxaa: "FXAA 与锐化",
  atmosphere: "物理大气 LUT",
  gi: "GI 探针体",
  firstPersonShadow: "视模自阴影深度",
  matrix: "场景矩阵（这一段不画东西，只是占着 GPU 帧的时间轴）",
  actorBatch: "人物合批实例矩阵上传",
  frameSetup: "出画前接线",
  misc: "其他 GL（状态切换、纹理/缓冲上传）",
};

/** 表尾固定说明：GPU 读数什么时候只是提交时间的影子。 */
export const SHADOW_NOTE =
  "读法：某个 pass 的 GPU 读数接近它的「提交 CPU」时，说明 GPU 在等 CPU 喂 draw，"
  + "那个 GPU 数字是提交时间的影子，不是它真的在算。";

const ZERO = { avg: 0, p95: 0, max: 0 };

/**
 * CPU 表的原始袋：真实 CPU 桶 + 逐 pass 提交 CPU（挂到 post 底下）。
 * 已经有自己 CPU 桶的段不重复挂（否则父桶的「自身」会被减成负数）。
 */
export function CpuBag(summary) {
  const bag = Object.create(null);
  for (const key in summary.cpu || {}) bag[key] = summary.cpu[key];
  for (const key in summary.gpuCpu || {}) {
    if (bag[key]) continue;
    bag[`post/${key}`] = summary.gpuCpu[key];
  }
  return bag;
}

/**
 * 把平的 key 排成分层的行。
 * @returns {Array<{key, depth, stat, selfRow, self}>} 父行在前、子行缩进跟随，同层按 avg 降序。
 */
export function TreeRows(bag, { keys = null } = {}) {
  const wanted = keys || Object.keys(bag).filter((key) => {
    const stat = bag[key];
    return stat && (stat.avg > 0 || stat.max > 0);
  });
  const present = new Set(wanted);
  const children = new Map();
  const roots = [];
  for (const key of wanted) {
    const cut = key.lastIndexOf("/");
    // 父桶没接线（或被过滤掉了）就把它当根行显示，别整条不见
    if (cut < 0 || !present.has(key.slice(0, cut))) { roots.push(key); continue; }
    const parent = key.slice(0, cut);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(key);
  }
  const Avg = (key) => (bag[key] ? bag[key].avg : 0);
  const ByAvg = (a, b) => Avg(b) - Avg(a);
  const rows = [];
  const Emit = (key, depth) => {
    rows.push({ key, depth, stat: bag[key], selfRow: false, self: 0 });
    const kids = (children.get(key) || []).sort(ByAvg);
    for (const kid of kids) Emit(kid, depth + 1);
    if (!kids.length) return;
    let sum = 0;
    for (const kid of kids) sum += Avg(kid);
    const self = Avg(key) - sum;
    if (self > 0.01) rows.push({ key: `${key}|self`, depth: depth + 1, stat: null, selfRow: true, self });
  };
  roots.sort(ByAvg);
  for (const key of roots) Emit(key, 0);
  return rows;
}

/** 行的显示名：根 key 查中文表，子 key 只显示最后一段（前缀已经由缩进表达）。 */
export function CpuLabel(row) {
  if (row.selfRow) return "自身（父 − 子之和）";
  const known = CPU_LABELS[row.key];
  if (known) return row.depth ? `${Tail(row.key)} · ${known}` : known;
  return row.depth ? Tail(row.key) : row.key;
}

function Tail(key) {
  const cut = key.lastIndexOf("/");
  return cut < 0 ? key : key.slice(cut + 1);
}

/** CPU 表的完整行（含调用次数、矩阵访问与堆分配三列，以及尾部的合计/浏览器侧两行）。 */
export function CpuRows(summary) {
  const bag = CpuBag(summary);
  if (summary.other && (summary.other.avg > 0 || summary.other.max > 0)) bag.other = summary.other;
  const rows = TreeRows(bag);
  const visits = summary.cpuVisits || {};
  const alloc = summary.cpuAlloc || {};
  const calls = summary.cpuCalls || {};
  return rows.map((row) => ({
    ...row,
    label: CpuLabel(row),
    // B/E 对数（Unity 的 Calls 列）：`ai/act` 一个兵一次，桶的毫秒数除以它就是单次成本。
    calls: row.selfRow ? null : (calls[row.key] ? calls[row.key].avg : null),
    visits: row.selfRow ? null : (visits[row.key] ? visits[row.key].avg : null),
    allocKb: row.selfRow ? null : (alloc[row.key] ? alloc[row.key].avg : null),
  }));
}

/** GPU 表的完整行（逐 pass 的 GPU 耗时、提交 CPU、draw call、三角形）。 */
export function GpuRows(summary) {
  const bag = Object.create(null);
  const cpu = summary.gpuCpu || {};
  const keys = [];
  for (const key in summary.gpu || {}) bag[key] = summary.gpu[key];
  // GPU 计时不可用时也要有表：拿提交 CPU 的 key 把行摆出来，GPU 列显示 0。
  for (const key in cpu) if (!bag[key]) bag[key] = ZERO;
  for (const key in bag) {
    const gpuStat = bag[key];
    const cpuStat = cpu[key];
    if (gpuStat.avg > 0 || gpuStat.max > 0 || (cpuStat && cpuStat.avg > 0)) keys.push(key);
  }
  const rows = TreeRows(bag, { keys });
  const calls = summary.gpuCalls || {};
  const tris = summary.gpuTris || {};
  return rows.map((row) => ({
    ...row,
    label: row.selfRow ? "自身（父 − 子之和）" : (row.depth ? Tail(row.key) : row.key),
    note: GPU_NOTES[row.key] || "",
    cpuMs: row.selfRow ? null : (cpu[row.key] ? cpu[row.key].avg : null),
    calls: row.selfRow ? null : (calls[row.key] ? calls[row.key].avg : null),
    tris: row.selfRow ? null : (tris[row.key] ? tris[row.key].avg : null),
  }));
}

// ---------------------------------------------------------------------------
// 纯文本排版（CLI 与「导出快照」共用）
// ---------------------------------------------------------------------------

export function F(value, digits = 2) {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? value.toFixed(0) : value.toFixed(digits);
}

function Int(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}

function Millions(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value / 1e6).toFixed(2)}M`;
}

/** 等宽表：columns = [{ head, width, align }]，rows 是已经格式化好的字符串数组。 */
function Table(columns, rows) {
  const Pad = (text, width, align) => {
    const value = String(text);
    // 中文按两个字宽算，否则第一列的中文说明会把后面的列顶歪。
    let wide = 0;
    for (const ch of value) wide += /[⺀-鿿＀-￯　-〿]/.test(ch) ? 2 : 1;
    const pad = " ".repeat(Math.max(0, width - wide));
    return align === "left" ? value + pad : pad + value;
  };
  const lines = [columns.map((c) => Pad(c.head, c.width, c.align)).join("  ")];
  for (const row of rows) lines.push(row.map((cell, i) => Pad(cell, columns[i].width, columns[i].align)).join("  "));
  return lines;
}

/**
 * 把一份快照（{ label, canvas, postTarget, rendererName, summary }）排成文本。
 * CLI 的 `--print` 与面板的导出走的都是这一条。
 */
export function FormatSnapshot(snapshot) {
  const summary = snapshot.summary || snapshot.summary10s;
  const out = [];
  if (!summary) return "（快照里没有 summary）";
  out.push(`=== 性能剖析 · ${snapshot.label || "(未命名)"} ===`);
  const head = [];
  if (snapshot.rendererName) head.push(`GPU ${snapshot.rendererName}`);
  if (snapshot.canvas) head.push(`画布 ${snapshot.canvas}`);
  if (snapshot.postTarget) head.push(`合成靶 ${snapshot.postTarget}`);
  if (snapshot.when) head.push(snapshot.when);
  if (head.length) out.push(head.join(" ｜ "));
  const range = summary.firstId != null && summary.lastId != null
    ? ` ｜ 帧号 #${summary.firstId}${summary.lastId !== summary.firstId ? `–#${summary.lastId}` : ""}` : "";
  out.push(`采样 ${summary.frames} 帧 / ${summary.seconds} s${range} ｜ fps ${F(summary.fps)} ｜ 低帧率 ${F(summary.lowFps)}`);
  out.push(`整帧 avg ${F(summary.frame.avg)} / p95 ${F(summary.frame.p95)} / max ${F(summary.frame.max)} ms`
    + ` ｜ 主线程 avg ${F(summary.cpuTotal.avg)} ms`
    + ` ｜ GPU avg ${summary.gpuFrames ? F(summary.gpuTotal.avg) : "—"} ms`
    + ` ｜ draw ${summary.calls} ｜ 三角 ${Millions(summary.triangles)}`);

  out.push("");
  out.push("CPU · 主线程（ms/帧）");
  const cpuColumns = [
    { head: "系统", width: 42, align: "left" },
    { head: "avg", width: 8, align: "right" },
    { head: "p95", width: 8, align: "right" },
    { head: "max", width: 8, align: "right" },
    { head: "调用/帧", width: 8, align: "right" },
    { head: "矩阵访问", width: 10, align: "right" },
    { head: "分配KB", width: 8, align: "right" },
  ];
  const cpuRows = CpuRows(summary).map((row) => [
    `${"  ".repeat(row.depth)}${row.label}`,
    row.selfRow ? F(row.self) : F(row.stat.avg),
    row.selfRow ? "" : F(row.stat.p95),
    row.selfRow ? "" : F(row.stat.max),
    row.selfRow || row.calls == null ? "" : F(row.calls, 1),
    row.selfRow ? "" : Int(row.visits),
    row.selfRow ? "" : F(row.allocKb, 1),
  ]);
  cpuRows.push(["主线程合计", F(summary.cpuTotal.avg), F(summary.cpuTotal.p95), F(summary.cpuTotal.max), "", "", ""]);
  if (summary.browser) {
    cpuRows.push([CPU_LABELS.browser, F(summary.browser.avg), F(summary.browser.p95), F(summary.browser.max), "", "", ""]);
  }
  out.push(...Table(cpuColumns, cpuRows));
  if (Object.keys(summary.cpuAlloc || {}).length === 0) {
    out.push("（「分配KB」整列空 = 这台浏览器的 performance.memory 不可用或被量化到读不出逐帧差；"
      + "Chrome 系加 --enable-precise-memory-info 才逐帧有数。）");
  }

  out.push("");
  out.push("GPU · 逐 pass（ms/帧）");
  if (!summary.timerAvailable) out.push("（此浏览器/驱动没有 GPU 计时扩展，只有提交 CPU 与提交量可信）");
  const gpuColumns = [
    { head: "pass", width: 26, align: "left" },
    { head: "GPU avg", width: 9, align: "right" },
    { head: "p95", width: 8, align: "right" },
    { head: "max", width: 8, align: "right" },
    { head: "提交CPU", width: 9, align: "right" },
    { head: "draw", width: 8, align: "right" },
    { head: "三角", width: 9, align: "right" },
    { head: "说明", width: 28, align: "left" },
  ];
  const gpuRows = GpuRows(summary).map((row) => [
    `${"  ".repeat(row.depth)}${row.label}`,
    row.selfRow ? F(row.self) : F(row.stat.avg),
    row.selfRow ? "" : F(row.stat.p95),
    row.selfRow ? "" : F(row.stat.max),
    row.selfRow ? "" : F(row.cpuMs),
    row.selfRow ? "" : Int(row.calls),
    row.selfRow ? "" : Millions(row.tris),
    row.selfRow ? "" : row.note,
  ]);
  gpuRows.push(["GPU 合计", summary.gpuFrames ? F(summary.gpuTotal.avg) : "—",
    summary.gpuFrames ? F(summary.gpuTotal.p95) : "—",
    summary.gpuFrames ? F(summary.gpuTotal.max) : "—", "", "", "", `采样帧 ${summary.gpuFrames}`]);
  out.push(...Table(gpuColumns, gpuRows));

  out.push("");
  out.push("掉帧取证（窗口内最差一帧）");
  out.push(`  ${WorstLine(summary)}`);

  out.push("");
  out.push("事件");
  out.push(`  ${EventsLine(summary)}`);

  if (snapshot.census) {
    out.push("");
    out.push("场景节点普查（scene 顶层子树，前 12 名）");
    const columns = [
      { head: "子树", width: 34, align: "left" },
      { head: "节点", width: 8, align: "right" },
      { head: "骨骼", width: 8, align: "right" },
      { head: "网格", width: 8, align: "right" },
      { head: "蒙皮", width: 8, align: "right" },
      { head: "隐藏节点", width: 10, align: "right" },
    ];
    const rows = snapshot.census.roots.map((row) => [row.name, row.objects, row.bones, row.meshes, row.skinned, row.hidden]);
    const total = snapshot.census.total;
    rows.push([`合计（顶层 ${snapshot.census.rootCount} 支）`, total.objects, total.bones, total.meshes, total.skinned, total.hidden]);
    out.push(...Table(columns, rows));
  }

  out.push("");
  out.push(SHADOW_NOTE);
  return out.join("\n");
}

/** 最差一帧的一行归因（面板与 CLI 同一句话）。 */
export function WorstLine(summary) {
  const worst = summary.worst;
  if (!worst) return "—";
  const parts = [`${worst.id != null ? `#${worst.id} · ` : ""}${F(worst.interval)} ms · 主线程 ${F(worst.cpuMs)} ms · draw ${worst.calls}`];
  const buckets = Object.entries(worst.cpu)
    .filter(([key]) => key.indexOf("/") < 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([key, value]) => `${CPU_LABELS[key] || key} ${F(value)}`);
  parts.push(buckets.length ? `CPU：${buckets.join("，")}，其他 ${F(worst.other)}` : `CPU：没有打标记的工作，其他 ${F(worst.other)}`);
  if (worst.gpu) {
    const gpu = Object.entries(worst.gpu)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([key, value]) => `${key} ${F(value)}`).join("，");
    parts.push(`GPU：${gpu}（合计 ${F(worst.gpuTotal)}）`);
  }
  const marks = [];
  if (worst.gcMb > 0) marks.push(`GC 释放 ${worst.gcMb.toFixed(1)} MB`);
  if (worst.longtaskMs > 0) marks.push(`长任务 ${F(worst.longtaskMs)} ms`);
  if (worst.newPrograms > 0) {
    marks.push(`这一帧新编译了 ${worst.newPrograms} 个着色器程序`
      + (worst.newProgramNames?.length ? `：${worst.newProgramNames.join("；")}` : ""));
  }
  if (worst.loaf) {
    marks.push(`浏览器侧 ${F(worst.loaf.durationMs)} ms（样式布局 ${F(worst.loaf.styleMs)} ms，`
      + `阻塞 ${F(worst.loaf.blockingMs)} ms）`);
  }
  if (marks.length) parts.push(marks.join("，"));
  return parts.join(" ｜ ");
}

/** 事件栏里新编译程序的主人（最多列 6 个，同名多次写 ×N）。 */
function ProgramNamesText(names) {
  if (!names || !names.length) return "";
  const shown = names.slice(0, 6).map(({ name, count }) => (count > 1 ? `${name} ×${count}` : name));
  const rest = names.length > 6 ? `；另 ${names.length - 6} 种` : "";
  return `（${shown.join("；")}${rest}）`;
}

/** 事件栏的一行（GC / 长任务 / 分配速率 / 新编译程序 / 浏览器侧长帧）。 */
export function EventsLine(summary) {
  const events = summary.events;
  const parts = [
    `GC ${events.gcCount} 次（共释放 ${events.gcMb.toFixed(1)} MB）`,
    `长任务 ${events.longtaskMs.toFixed(0)} ms`,
    `堆分配 ≈ ${events.allocKbPerFrame.toFixed(0)} KB/帧`,
    `新编译着色器程序 ${events.newPrograms} 个${ProgramNamesText(events.newProgramNames)}`,
  ];
  if (events.loafCount > 0) {
    parts.push(`浏览器侧长帧 ${events.loafCount} 次（样式布局共 ${events.loafStyleMs.toFixed(0)} ms，`
      + `阻塞 ${events.loafBlockingMs.toFixed(0)} ms）`);
  }
  return parts.join(" ｜ ");
}

// ---------------------------------------------------------------------------
// 单帧时间轴（Unity 的 Timeline 视图的文本版：命令行 --frame 与面板「导出文本表格」）
// ---------------------------------------------------------------------------

/** 桶名的根（`ai/act/anim` → `ai`），时间轴按根上色、帧图按根堆叠。 */
export function RootOf(key) {
  const cut = key.indexOf("/");
  return cut < 0 ? key : key.slice(0, cut);
}

/**
 * 把一帧记录里的逐实例样本解成对象数组（Script_Profiler 的 SAMPLE_STRIDE / GPU_SEG_STRIDE 布局）。
 * 名字号查 names；查不到（录制文件被手改过）就显示 `#号`。
 */
export function DecodeSamples(record, names) {
  const out = [];
  const samples = record && record.samples;
  if (!samples) return out;
  for (let i = 0; i + 3 < samples.length; i += 4) {
    const id = samples[i];
    out.push({ key: names[id] ?? `#${id}`, depth: samples[i + 1], start: samples[i + 2], duration: samples[i + 3] });
  }
  return out;
}

export function DecodeGpuSegments(record, names) {
  const out = [];
  const segs = record && record.gpuSegs;
  if (!segs) return out;
  for (let i = 0, slot = 0; i + 4 < segs.length; i += 5, slot += 1) {
    const id = segs[i];
    out.push({
      key: names[id] ?? `#${id}`, start: segs[i + 1], cpuMs: segs[i + 2], calls: segs[i + 3], tris: segs[i + 4],
      gpuMs: record.gpuSegMs && slot < record.gpuSegMs.length ? record.gpuSegMs[slot] : null,
    });
  }
  return out;
}

/**
 * 一帧的时间轴文本：最长的 top 条 B/E 实例（带起点，看得出是哪一个兵、第几次调用）
 * + 按 GPU 耗时排的分段。表是「单帧汇总」的补充，不重复打桶合计。
 */
export function FormatFrameTimeline(record, names, { top = 25 } = {}) {
  if (!record) return "（这一帧不在录制里）";
  const out = [];
  out.push(`时间轴 · 第 #${record.id} 帧 ｜ 整帧 ${F(record.interval)} ms${record.gap ? "（接缝帧：间隔是暂停时长）" : ""}`
    + ` ｜ 主线程 ${F(record.cpuMs)} ms ｜ GPU ${record.gpuTotal == null ? "—" : F(record.gpuTotal)} ms`);
  const samples = DecodeSamples(record, names).sort((a, b) => b.duration - a.duration);
  if (!samples.length) {
    out.push("（这一帧没有逐实例样本：旧版录制或建关帧）");
  } else {
    out.push(`主线程 B/E 实例 ${samples.length} 条，最长的 ${Math.min(top, samples.length)} 条（ms，起点相对帧起点）：`);
    const columns = [
      { head: "桶", width: 44, align: "left" },
      { head: "时长", width: 8, align: "right" },
      { head: "起点", width: 8, align: "right" },
      { head: "深度", width: 4, align: "right" },
    ];
    out.push(...Table(columns, samples.slice(0, top).map((row) => [
      CPU_LABELS[row.key] ? `${row.key} · ${CPU_LABELS[row.key]}` : row.key,
      F(row.duration, 3), F(row.start, 2), String(row.depth),
    ])));
  }
  const segs = DecodeGpuSegments(record, names);
  if (segs.length) {
    const sorted = segs.filter((row) => row.cpuMs > 0.005 || (row.gpuMs || 0) > 0.005 || row.calls > 0)
      .sort((a, b) => ((b.gpuMs ?? b.cpuMs) - (a.gpuMs ?? a.cpuMs)));
    out.push("");
    out.push(`GPU 分段 ${segs.length} 段（按提交顺序记录，这里按 GPU 耗时排，前 ${Math.min(top, sorted.length)} 段）：`);
    const columns = [
      { head: "pass", width: 26, align: "left" },
      { head: "GPU", width: 8, align: "right" },
      { head: "提交CPU", width: 8, align: "right" },
      { head: "起点", width: 8, align: "right" },
      { head: "draw", width: 6, align: "right" },
      { head: "三角", width: 8, align: "right" },
    ];
    out.push(...Table(columns, sorted.slice(0, top).map((row) => [
      row.key, row.gpuMs == null ? "—" : F(row.gpuMs, 3), F(row.cpuMs, 3), F(row.start, 2),
      Int(row.calls), Millions(row.tris),
    ])));
  }
  return out.join("\n");
}

export default { CpuRows, GpuRows, FormatSnapshot, FormatFrameTimeline, WorstLine, EventsLine, RootOf,
  DecodeSamples, DecodeGpuSegments, CPU_LABELS, GPU_NOTES, SHADOW_NOTE };
