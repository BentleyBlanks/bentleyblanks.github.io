// JS 函数级采样（Profiler 面板「采样」页；对标 Unreal Insights 的 CPU 采样 / DevTools 的 Performance）。
//
// 桶（B/E 标记）只回答「哪个系统慢」，回答不了「系统里哪一步慢」。2026-10-14 那份 20 fps
// 录制，渲染提交 19 ms 里到底是 three 的 projectObject（遍历场景）、setProgram（换材质）还是
// uniform 上传，只能靠外部 CDP 采样才看得出来。这里用浏览器自带的 JS Self-Profiling API
// （`new Profiler(...)`）在游戏里直接采：
//   · 自身耗时 / 含子调用耗时前 N 名（函数名 @ 文件:行）；
//   · 按文件汇总；
//   · **按桶归属**：每个样本的时刻落在哪一帧、那一帧的哪一条 B/E 实例里（剖析器每帧记了
//     `t0` 与逐实例样本），就记给那个桶 —— 「post 桶里最热的函数」「没打标记的 other 是谁」。
//
// ## 能不能用
// 这个 API 要求页面响应头带 `Document-Policy: js-profiling`。本地预览
// （scripts/Script_LocalPreview.mjs）与测试服（Script_DevServer.mjs）都发；GitHub Pages
// 发不了自定义头，线上这一页显示「不可用」。采样间隔由浏览器决定（Chromium 约 10 ms，
// Windows 上 16 ms 左右），所以要采够秒数：10 秒约六七百个样本，排前二十足够，细到 0.1 ms 不行。
//
// 纯函数部分（FoldTrace）不碰浏览器 API，Node 能直接喂假 trace 回归。

/** 采样页的秒数选项。 */
export const SAMPLE_SECONDS = [5, 10, 20, 30];

/**
 * 这个页面能不能采样。不能的话 reason 是给人看的一句话。
 * 只有真 new 一次才知道响应头给没给（API 存在但没有 Document-Policy 时构造会抛错）。
 */
export function SamplerSupport(scope = globalThis) {
  if (typeof scope.Profiler !== "function") {
    return { ok: false, reason: "这个浏览器没有 JS 采样接口（Chromium 94+ 才有）" };
  }
  try {
    const probe = new scope.Profiler({ sampleInterval: 10, maxBufferSize: 1 });
    probe.stop().catch(() => {});
    return { ok: true, reason: "" };
  } catch (error) {
    return { ok: false, reason: "页面没有 Document-Policy: js-profiling 响应头（线上 Pages 加不了；用本地预览 scripts/Script_LocalPreview.mjs 打开）" };
  }
}

/** 一次采样会话：Start() 开始，Stop() 返回原始 trace。 */
export class JsSampler {
  constructor({ intervalMs = 1, maxSamples = 100000, scope = globalThis } = {}) {
    this.intervalMs = intervalMs;
    this.maxSamples = maxSamples;
    this.scope = scope;
    this._profiler = null;
    this.startedAt = 0;
  }

  get running() { return !!this._profiler; }

  Start() {
    if (this._profiler) return;
    // 浏览器会把间隔向上取整到自己支持的粒度；要的是「尽量密」，所以请求 1 ms
    this._profiler = new this.scope.Profiler({ sampleInterval: this.intervalMs, maxBufferSize: this.maxSamples });
    this.startedAt = performance.now();
  }

  async Stop() {
    const profiler = this._profiler;
    this._profiler = null;
    if (!profiler) return null;
    const trace = await profiler.stop();
    return { trace, startedAt: this.startedAt, stoppedAt: performance.now() };
  }
}

function BaseName(url) {
  if (!url) return "";
  const clean = String(url).split("?")[0].split("#")[0];
  const cut = clean.lastIndexOf("/");
  return cut < 0 ? clean : clean.slice(cut + 1);
}

/**
 * 原始 trace → 排好序的表。
 * @param {object} trace       Profiler.stop() 的结果（frames / resources / stacks / samples）
 * @param {object} [options]
 * @param {Array}  [options.frames]  剖析器的帧记录（要 t0 / cpuMs / samples），给了才做按桶归属
 * @param {Array}  [options.names]   剖析器的名字表（帧记录里 samples 的名字号查它）
 * @param {number} [options.top]     每张表留几行
 */
export function FoldTrace(trace, { frames = null, names = null, top = 40 } = {}) {
  const samples = (trace && trace.samples) || [];
  const stacks = (trace && trace.stacks) || [];
  const traceFrames = (trace && trace.frames) || [];
  const resources = (trace && trace.resources) || [];
  // 实际采样间隔：相邻样本时刻差的中位数（浏览器不保证按请求的间隔采）
  const deltas = [];
  for (let i = 1; i < samples.length; i += 1) deltas.push(samples[i].timestamp - samples[i - 1].timestamp);
  deltas.sort((a, b) => a - b);
  const intervalMs = deltas.length ? deltas[deltas.length >> 1] : 0;
  const durationMs = samples.length > 1 ? samples[samples.length - 1].timestamp - samples[0].timestamp + intervalMs : 0;

  const FrameKey = (frameId) => {
    const frame = traceFrames[frameId];
    if (!frame) return { key: "?", name: "?", file: "", line: 0 };
    const file = frame.resourceId !== undefined ? BaseName(resources[frame.resourceId]) : "";
    const name = frame.name || "(匿名)";
    const line = frame.line || 0;
    return { key: `${name} @ ${file}:${line}`, name, file, line };
  };
  const keyCache = new Map();
  const KeyOf = (frameId) => {
    let entry = keyCache.get(frameId);
    if (!entry) { entry = FrameKey(frameId); keyCache.set(frameId, entry); }
    return entry;
  };

  // 帧记录按 t0 排好（录制本来就是按时间的），二分找样本落在哪一帧
  const frameRows = frames ? frames.filter((row) => Number.isFinite(row.t0) && row.cpuMs > 0) : [];
  const FindFrame = (time) => {
    let lo = 0;
    let hi = frameRows.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frameRows[mid].t0 <= time) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) return null;
    const row = frameRows[best];
    return time < row.t0 + row.cpuMs ? row : null;
  };
  // 一帧里覆盖 offset 的最深 B/E 实例 → 桶名
  const BucketAt = (row, offset) => {
    const data = row.samples;
    if (!data) return "other";
    let bestDepth = -1;
    let bestName = "other";
    for (let i = 0; i + 3 < data.length; i += 4) {
      const start = data[i + 2];
      if (offset < start || offset >= start + data[i + 3]) continue;
      const depth = data[i + 1];
      if (depth > bestDepth) { bestDepth = depth; bestName = names ? (names[data[i]] ?? `#${data[i]}`) : `#${data[i]}`; }
    }
    return bestName;
  };

  const self = new Map();
  const total = new Map();
  const files = new Map();
  const buckets = new Map();
  let idle = 0;
  let inFrames = 0;
  const seen = new Set();
  for (const sample of samples) {
    let bucket = null;
    if (frameRows.length) {
      const row = FindFrame(sample.timestamp);
      if (row) { bucket = BucketAt(row, sample.timestamp - row.t0); inFrames += 1; }
      else bucket = "(帧外：计时器、事件、GC、浏览器)";
    }
    if (sample.stackId === undefined || sample.stackId === null) {
      idle += 1;
      if (bucket) {
        const b = buckets.get(bucket) || { samples: 0, fns: new Map() };
        b.samples += 1;
        b.fns.set("(非 JS：原生/空闲)", (b.fns.get("(非 JS：原生/空闲)") || 0) + 1);
        buckets.set(bucket, b);
      }
      continue;
    }
    const leaf = KeyOf(stacks[sample.stackId]?.frameId);
    self.set(leaf.key, (self.get(leaf.key) || { ...leaf, samples: 0 }));
    self.get(leaf.key).samples += 1;
    files.set(leaf.file || "(无文件)", (files.get(leaf.file || "(无文件)") || 0) + 1);
    seen.clear();
    for (let stackId = sample.stackId, guard = 0; stackId !== undefined && stackId !== null && guard < 512; guard += 1) {
      const stack = stacks[stackId];
      if (!stack) break;
      const entry = KeyOf(stack.frameId);
      if (!seen.has(entry.key)) {
        seen.add(entry.key);
        if (!total.has(entry.key)) total.set(entry.key, { ...entry, samples: 0 });
        total.get(entry.key).samples += 1;
      }
      stackId = stack.parentId;
    }
    if (bucket) {
      const b = buckets.get(bucket) || { samples: 0, fns: new Map() };
      b.samples += 1;
      b.fns.set(leaf.key, (b.fns.get(leaf.key) || 0) + 1);
      buckets.set(bucket, b);
    }
  }
  const count = samples.length || 1;
  const Rows = (map) => [...map.values()].sort((a, b) => b.samples - a.samples).slice(0, top)
    .map((row) => ({ ...row, pct: (row.samples / count) * 100, ms: row.samples * intervalMs }));
  const frameCount = frameRows.length
    ? frameRows.filter((row) => samples.length && row.t0 >= samples[0].timestamp && row.t0 <= samples[samples.length - 1].timestamp).length
    : 0;
  return {
    samples: samples.length,
    idleSamples: idle,
    inFrames,
    intervalMs,
    durationMs,
    frames: frameCount,
    self: Rows(self),
    total: Rows(total),
    files: [...files].sort((a, b) => b[1] - a[1]).slice(0, top)
      .map(([file, n]) => ({ file, samples: n, pct: (n / count) * 100, ms: n * intervalMs })),
    buckets: [...buckets].sort((a, b) => b[1].samples - a[1].samples).map(([key, b]) => ({
      key, samples: b.samples, pct: (b.samples / count) * 100, ms: b.samples * intervalMs,
      top: [...b.fns].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([fn, n]) => ({ fn, samples: n, pct: (n / b.samples) * 100 })),
    })),
  };
}

export default { SamplerSupport, JsSampler, FoldTrace, SAMPLE_SECONDS };
