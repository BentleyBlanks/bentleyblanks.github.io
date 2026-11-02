// 组件式环境系统的框架（docs/Data_Environment.md §1、§5）。零 three 依赖，纯 Node 能测。
//
// 框架统一管四件事，组件只管自己的参数与效果（Data_EnvComponents 声明 + Script_EnvComponents 执行）：
//   1. 发现组件：按声明表遍历，新加一种组件不用改这里；
//   2. 时间求值：一个昼夜时钟（推进 / 暂停 / 调速 / 手动拨），所有组件在同一时刻求值；
//   3. 选来源 + 过渡：区域（兜底 / 局部）与临时覆盖按优先级排，**每种组件各自**取「观察点所在、且提供了它」的最高一层；
//      「完全覆盖」的区域把下面整个截断（它没有的组件取关闭值）。某种组件的来源变了，就从**这一刻实际的表现**
//      过渡到新来源（时长取两者里优先级高的那个区域的 blendS）。过渡按真实秒数走、目标照常按时钟求值 ——
//      昼夜在走的同时进出区域，两件事互不干扰；
//   4. 调度：Update(dt, 观察点) 一帧一次，拼出这一帧的环境参数（与 SKY_PRESETS 同形）交给 Script_EnvApply。
//
// 运行时状态（每种组件一份）：来源、过渡起点、进度、此刻的实际参数 —— 只在这里，不写回预设。

import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { ENV_RUNTIME } from "./Data_Tuning_Environment.mjs";
import { CloneValue, Ease, EvalParamValue, LerpParamValue, SameValue, WrapHour } from "./Script_EnvTrack.mjs";
import { ComposeEnvironment, ENV_COMPONENT_LOGIC } from "./Script_EnvComponents.mjs";
import { VolumeContains } from "./Script_EnvPreset.mjs";
export { BeatTime } from "./Script_EnvPreset.mjs";

/** 组件全部参数的默认值。 */
export function DefaultValues(decl) {
  const values = {};
  for (const param of decl.params) values[param.key] = CloneValue(param.default);
  return values;
}

/** 关闭值：默认值上再盖 off。 */
export function OffValues(decl) {
  const values = DefaultValues(decl);
  for (const [key, value] of Object.entries(decl.off || {})) values[key] = CloneValue(value);
  return values;
}

/** 预设里一个组件在 hour 时的全部参数（没写的取默认值）。 */
export function EvaluateComponent(decl, comp, hour) {
  const values = {};
  const params = comp?.params || {};
  for (const param of decl.params) values[param.key] = EvalParamValue(param, params[param.key], hour);
  return values;
}

/** 一份预设在 hour 时各组件的参数（编辑器画曲线、测试用）。没有的组件不出现。 */
export function EvaluatePreset(preset, hour, decls = ENV_COMPONENTS) {
  const out = {};
  for (const decl of decls) {
    const comp = preset?.components?.[decl.type];
    if (comp) out[decl.type] = EvaluateComponent(decl, comp, hour);
  }
  return out;
}

export function LerpValues(decl, from, to, t) {
  const out = {};
  for (const param of decl.params) out[param.key] = LerpParamValue(param, from[param.key], to[param.key], t);
  return out;
}

function SameValues(decl, a, b) {
  return decl.params.every((p) => SameValue(a[p.key], b[p.key]));
}

/** 来源排序：优先级高的在前；同优先级后加的在前（临时覆盖压过区域、后建的区域压过先建的）。 */
export function SortSources(list) {
  return [...list].sort((a, b) => (b.priority - a.priority) || (b.order - a.order));
}

/**
 * 按观察点给每种组件挑来源。
 * @returns {{ picks: Map<type, { source, comp }>, inside: Set<sourceKey> }}  comp 为 null = 取关闭值
 */
export function ResolveSources(sources, observer, decls = ENV_COMPONENTS) {
  const sorted = SortSources(sources).filter((s) => s.enabled !== false && s.preset && VolumeContains(s, observer));
  const inside = new Set(sorted.map((s) => s.key));
  const picks = new Map();
  for (const decl of decls) {
    let pick = { source: null, comp: null };
    for (const source of sorted) {
      const comp = source.preset.components?.[decl.type];
      if (comp && comp.enabled !== false) { pick = { source, comp }; break; }
      if (source.mode === "full") { pick = { source, comp: null }; break; }
    }
    picks.set(decl.type, pick);
  }
  return { picks, inside };
}

function SourceInfo(source) {
  if (!source) return null;
  return { key: source.key, kind: source.kind, id: source.id, name: source.name, presetId: source.presetId, priority: source.priority, mode: source.mode };
}

export class EnvironmentSystem {
  constructor({ decls = ENV_COMPONENTS, logic = ENV_COMPONENT_LOGIC } = {}) {
    this.decls = decls;
    this.logic = logic;
    this.sceneId = null;
    /** 区域文件归谁：scene（场景文件建的关）/ level（正片关卡，Data_EnvLevels） */
    this.targetKind = null;
    this.sceneDoc = null;
    /** 往前拨时间的过渡（TweenHour）：{ from, delta, t, duration } */
    this.tween = null;
    /** id → 预设文档（编辑器改的就是这里的那一份对象，改完调 Touch()） */
    this.presets = new Map();
    this.overrides = [];
    this.clock = { hour: 12, speed: ENV_RUNTIME.defaultSpeedHps, paused: true };
    /** 观察点：camera（缺省，出画相机）/ player / pinned（钉在 pinnedAt） */
    this.observerMode = "camera";
    this.pinnedAt = null;
    this.observer = { x: 0, y: 0, z: 0 };
    this.states = new Map();
    this.sources = [];
    this.inside = new Set();
    this.order = 0;
    this.nextOverride = 1;
    this.dirty = true;
    this.snapNext = true;
    this.version = 0;
    this.output = null;
    this.errors = [];
  }

  get active() { return !!this.sceneDoc; }

  // -------------------------------------------------------------------------
  // 数据

  /** 换场景：区域文件 + 它引用的预设。keepClock：同一场景重读（外面改了文件）时时钟不动。 */
  SetScene(sceneId, sceneDoc, presets, { keepClock = false, errors = [], kind = "scene" } = {}) {
    const same = sceneId === this.sceneId && kind === this.targetKind;
    this.sceneId = sceneId;
    this.targetKind = kind;
    this.sceneDoc = sceneDoc;
    this.presets = new Map(presets);
    this.errors = [...errors];
    if (!(keepClock && same) && sceneDoc?.time) {
      this.clock.hour = WrapHour(sceneDoc.time.hour);
      this.clock.speed = sceneDoc.time.speed ?? ENV_RUNTIME.defaultSpeedHps;
      this.clock.paused = sceneDoc.time.paused !== false;
    }
    if (!same) { this.states.clear(); this.snapNext = true; }
    this.Touch();
  }

  Clear() {
    this.sceneId = null;
    this.targetKind = null;
    this.tween = null;
    this.sceneDoc = null;
    this.presets = new Map();
    this.overrides = [];
    this.states.clear();
    this.output = null;
    this.snapNext = true;
    this.Touch();
  }

  /** 放进 / 换掉一份预设（编辑器新建、外面改了文件）。 */
  SetPreset(doc) { this.presets.set(doc.id, doc); this.Touch(); }

  /** 数据就地改过（编辑器）：下一帧重新挑来源、重新求值。 */
  Touch() { this.dirty = true; this.RebuildSources(); }

  RebuildSources() {
    const list = [];
    const volumes = this.sceneDoc?.volumes || [];
    volumes.forEach((v, i) => list.push({
      key: `volume:${v.id}`, kind: "volume", id: v.id, name: v.name || v.id, shape: v.shape,
      center: v.center, size: v.size, yawDeg: v.yawDeg, radius: v.radius,
      priority: v.priority, blendS: v.blendS, mode: v.mode, enabled: v.enabled,
      presetId: v.preset, preset: this.presets.get(v.preset) || null, order: i,
      label: v.shape === "global" ? "基础" : "区域",
    }));
    for (const o of this.overrides) list.push({ ...o, preset: typeof o.preset === "string" ? (this.presets.get(o.preset) || null) : o.preset });
    this.sources = list;
  }

  // -------------------------------------------------------------------------
  // 时钟

  SetHour(hour) { this.tween = null; const h = WrapHour(hour); if (h !== this.clock.hour) { this.clock.hour = h; this.dirty = true; } }

  /** 用 seconds 真实秒数往前拨到 target 点（只往前走：18 → 22 走 4 小时，22 → 4 走 6 小时）。 */
  TweenHour(target, seconds) {
    const delta = WrapHour(target - this.clock.hour);
    if (!(seconds > 0) || delta < 1e-6) { this.SetHour(target); return; }
    this.tween = { from: this.clock.hour, delta, t: 0, duration: seconds };
    this.dirty = true;
  }

  /** 一拍的时间（{ hour } / { look }）→ 小时；look 在兜底预设里查不到 → null。 */
  ResolveTime(spec) {
    if (!spec) return null;
    if (Number.isFinite(spec.hour)) return WrapHour(spec.hour);
    const look = this.Looks().find((l) => l.id === spec.look);
    return look ? look.hour : null;
  }

  /** 拨到这一拍的时间。blendS（参数优先，其次 spec.blendS）> 0 就往前走过去，否则立刻。→ 目标小时 / null */
  ApplyTime(spec, { blendS } = {}) {
    const hour = this.ResolveTime(spec);
    if (hour === null) return null;
    const seconds = blendS ?? spec.blendS ?? 0;
    if (seconds > 0) this.TweenHour(hour, seconds); else this.SetHour(hour);
    return hour;
  }

  /** 区域文件的默认时刻（进场景时的那一刻）。 */
  DefaultHour() { return WrapHour(this.sceneDoc?.time?.hour ?? 12); }
  SetPaused(paused) { this.clock.paused = !!paused; }
  SetSpeed(speed) { this.clock.speed = Math.max(0, Number(speed) || 0); }
  /** 按预设里的 look（白天 / 黄昏 / 晚上）拨时间：找兜底区域那份预设的 looks。→ 拨到的小时，没有这个 look → null */
  SetLook(lookId) {
    const look = this.Looks().find((l) => l.id === lookId);
    if (!look) return null;
    this.SetHour(look.hour);
    return look.hour;
  }

  /** 这个场景的几套表现（取兜底区域的预设；没有兜底就取第一个区域的）。 */
  Looks() {
    const volumes = this.sceneDoc?.volumes || [];
    const base = volumes.find((v) => v.shape === "global") || volumes[0];
    return CloneValue(this.presets.get(base?.preset)?.looks || []);
  }

  // -------------------------------------------------------------------------
  // 临时覆盖（过场换天、剧情事件、编辑器试看）：句柄释放后重新挑来源，从当时的实际表现过渡回去

  /**
   * @param {object} spec { id?, label?, preset: 预设文档或已载入的预设 id, priority?, blendS?, mode? }
   * @returns {{ id, Release(blendS?): boolean, readonly active: boolean }}
   */
  PushOverride(spec) {
    const id = spec.id || `Override${this.nextOverride++}`;
    this.overrides = this.overrides.filter((o) => o.id !== id);
    const preset = spec.preset;
    this.overrides.push({
      key: `override:${id}`, kind: "override", id, name: spec.label || id, shape: "global",
      priority: spec.priority ?? ENV_RUNTIME.defaultOverridePriority,
      blendS: spec.blendS ?? ENV_RUNTIME.defaultBlendS,
      mode: spec.mode || "partial", enabled: true,
      presetId: typeof preset === "string" ? preset : (preset?.id || null),
      preset, order: 100000 + this.order++, label: "临时",
    });
    this.Touch();
    const system = this;
    return {
      id,
      Release: (blendS) => system.ReleaseOverride(id, blendS),
      get active() { return system.overrides.some((o) => o.id === id); },
    };
  }

  /** 撤掉一个临时覆盖。blendS 给了就按它过渡回去（缺省用覆盖自己的）。→ 撤没撤 */
  ReleaseOverride(id, blendS) {
    const target = this.overrides.find((o) => o.id === id);
    if (!target) return false;
    if (Number.isFinite(blendS)) for (const st of this.states.values()) if (st.sourceKey === target.key) st.blendS = blendS;
    this.overrides = this.overrides.filter((o) => o.id !== id);
    this.Touch();
    return true;
  }

  // -------------------------------------------------------------------------
  // 每帧

  /** 观察点：camera / player 由调用方给位置；pinned 用钉住的那一点。 */
  ObserverFrom(camera, player) {
    if (this.observerMode === "pinned" && this.pinnedAt) return this.pinnedAt;
    if (this.observerMode === "player" && player) return player;
    return camera || player || this.observer;
  }

  /**
   * @param {number} dt 真实秒数（过渡按它走；时钟按 dt × speed 走）
   * @param {{x,y,z}} observer
   * @returns 这一帧的输出（没变化时是同一个对象）
   */
  Update(dt, observer) {
    if (!this.active) return null;
    const step = Math.max(0, Number(dt) || 0);
    if (this.tween && step > 0) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + step / tw.duration);
      this.clock.hour = WrapHour(tw.from + tw.delta * Ease("smooth", tw.t));
      if (tw.t >= 1) this.tween = null;
      this.dirty = true;
    } else if (!this.clock.paused && this.clock.speed > 0 && step > 0) { this.clock.hour = WrapHour(this.clock.hour + this.clock.speed * step); this.dirty = true; }
    if (observer) {
      const moved = observer.x !== this.observer.x || observer.y !== this.observer.y || observer.z !== this.observer.z;
      if (moved) { this.observer = { x: observer.x, y: observer.y, z: observer.z }; this.dirty = true; }
    }
    const transitioning = [...this.states.values()].some((st) => st.t < 1);
    if (!this.dirty && !transitioning && this.output) return this.output;

    const { picks, inside } = ResolveSources(this.sources, this.observer, this.decls);
    this.inside = inside;
    const snap = this.snapNext;
    this.snapNext = false;
    const composed = [];
    const components = {};
    for (const decl of this.decls) {
      const pick = picks.get(decl.type);
      const target = pick.comp ? EvaluateComponent(decl, pick.comp, this.clock.hour) : OffValues(decl);
      const key = pick.source ? `${pick.source.key}|${pick.source.presetId}|${pick.comp ? "on" : "off"}` : "none";
      let st = this.states.get(decl.type);
      if (!st || snap) {
        st = { key, sourceKey: pick.source?.key || null, priority: pick.source?.priority ?? -Infinity, blendS: pick.source?.blendS ?? 0, from: null, t: 1, duration: 0, display: target };
        this.states.set(decl.type, st);
      } else if (st.key !== key) {
        const incoming = pick.source?.priority ?? -Infinity;
        const duration = incoming >= st.priority ? (pick.source?.blendS ?? 0) : st.blendS;
        st.from = st.display;
        st.t = duration > 0 ? 0 : 1;
        st.duration = duration;
        st.key = key;
        st.sourceKey = pick.source?.key || null;
        st.priority = incoming;
        st.blendS = pick.source?.blendS ?? 0;
      } else if (pick.source) {
        st.blendS = pick.source.blendS;
      }
      if (st.t < 1) st.t = Math.min(1, st.t + step / Math.max(1e-6, st.duration));
      const display = st.t < 1 && st.from ? LerpValues(decl, st.from, target, Ease("smooth", st.t)) : target;
      if (st.t >= 1) st.from = null;
      st.display = display;
      composed.push({ decl, values: display, enabled: !!pick.comp });
      components[decl.type] = { enabled: !!pick.comp, source: SourceInfo(pick.source), transition: st.t, values: display };
    }
    const preset = ComposeEnvironment(composed, this.logic);
    const prev = this.output;
    const changed = !prev || this.decls.some((d) => !SameValues(d, prev.components[d.type].values, components[d.type].values))
      || this.decls.some((d) => prev.components[d.type].source?.key !== components[d.type].source?.key);
    this.version += changed ? 1 : 0;
    this.output = { version: this.version, hour: this.clock.hour, profile: preset.profile || null, preset, components };
    this.dirty = false;
    return this.output;
  }

  /** 此刻实际在用的某个组件参数（编辑器「添加组件时以当前表现为初值」用）。 */
  CurrentValues(type) { return CloneValue(this.states.get(type)?.display || null); }

  /** 总览用：全部来源（区域 + 临时覆盖）按优先级排好，带「观察点在不在里面」「此刻给哪些组件当来源」。 */
  Sources() {
    const providing = new Map();
    for (const [type, st] of this.states) if (st.sourceKey) providing.set(st.sourceKey, [...(providing.get(st.sourceKey) || []), type]);
    return SortSources(this.sources).map((s) => ({
      key: s.key, kind: s.kind, label: s.label, id: s.id, name: s.name, shape: s.shape,
      priority: s.priority, blendS: s.blendS, mode: s.mode, enabled: s.enabled !== false,
      presetId: s.presetId, presetMissing: !s.preset, inside: this.inside.has(s.key),
      providing: providing.get(s.key) || [],
    }));
  }

  State() {
    return {
      active: this.active, sceneId: this.sceneId, kind: this.targetKind, clock: { ...this.clock }, tween: this.tween ? { ...this.tween } : null, observerMode: this.observerMode,
      observer: { ...this.observer }, looks: this.Looks(), errors: [...this.errors],
      presets: [...this.presets.keys()], overrides: this.overrides.map((o) => o.id),
      components: this.output ? Object.fromEntries(Object.entries(this.output.components).map(([type, c]) => [type, {
        enabled: c.enabled, source: c.source, transition: c.transition,
      }])) : {},
      profile: this.output?.profile ?? null, version: this.version,
    };
  }
}
