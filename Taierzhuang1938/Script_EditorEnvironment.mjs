// 环境编辑器（docs/Data_Environment.md §8）：白盒编辑器（?editor=blockout）右侧的「环境」面板 + 底部昼夜时间轴 + 场景里的区域框。
//
// 层级「总览 — 区域 — 预设 — 组件 — 参数」：
//   时间条（一直在最上面）  拖动拨时间 · 白天 / 黄昏 / 晚上一键跳 · 播放 / 暂停 / 调速 · 设为场景默认时间
//   总览                    当前生效：每种组件此刻由谁提供（基础 / 区域 / 临时 + 过渡进度）；区域与覆盖按优先级排，
//                           点一行选中该区域并飞过去看；下面直接编辑选中区域引用的那份预设
//   区域                    区域列表 + 检查器（名字、形状、中心 / 尺寸 / 朝向、优先级、过渡时长、覆盖模式、引用的预设）+ 同一套预设视图；
//                           场景里画出区域框，选中的盒子 / 球可以拖手柄改范围（Script_EnvVolumeGizmo）
//   预设                    独立的预设资源检查器：选哪份预设、新建 / 复制，下面还是同一套预设视图
// 预设视图（分类筛选、搜索、组件卡片、添加组件菜单、参数控件）在 Script_EditorEnvironmentViews，三处共用。
//
// 改动：全部进撤销栈（Ctrl+Z / Ctrl+Y，拖滑条算一步），改完立刻交给环境系统（实时预览），存盘前文件不动。
// 存盘：本机预览走 POST /__environment/save（带读文件时那份原始字节的 sha1，对不上 409）；线上没有存盘口，退化成下载 JSON。
// 同步：每 2 s 查一次盘上的版本号；外面（人 / agent）改了、这边没改过就直接重读（时钟不动），改过就挂横幅让人选。
// 界面状态（开没开、哪一页、筛选、搜索、折叠、选中的区域 / 预设、各页滚动位置、时间轴）记在本机 localStorage。

import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { ENV_RUNTIME, ENV_EDITOR } from "./Data_Tuning_Environment.mjs";
import { CloneValue } from "./Script_EnvTrack.mjs";
import { DefaultValues } from "./Script_EnvSystem.mjs";
import {
  NewEnvPreset, NewSceneEnv, NewVolume, UniqueId, NumberedId, ValidateEnvPreset, ValidateSceneEnv, EnvPresetUrl, SceneEnvUrl, FormatEnvJson,
  ParamDecl, EnvPresetFromSkyPreset, VOLUME_SHAPES, ENV_ID_RE,
} from "./Script_EnvPreset.mjs";
import { SceneIdOfUrl } from "./Script_EnvLoader.mjs";
import {
  PresetView, El, IconButton, FormatHour, WriteParamValue, ToggleParamValue, ToggleKeyValue, GuardPanelEvents, IsTyping,
} from "./Script_EditorEnvironmentViews.mjs";
import { EnvTimelinePanel } from "./Script_EditorEnvironmentTimeline.mjs";
import { EnvVolumeGizmo } from "./Script_EnvVolumeGizmo.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";

const UI_KEY = "tengxian1938_env_editor_v1";
const TABS = Object.freeze([
  Object.freeze({ id: "overview", label: "总览" }),
  Object.freeze({ id: "volume", label: "区域" }),
  Object.freeze({ id: "preset", label: "预设" }),
]);
const SHAPE_LABELS = Object.freeze({ global: "全场", box: "盒子", sphere: "球" });
const MODE_LABELS = Object.freeze({ partial: "只覆盖包含的组件", full: "完全覆盖" });
const KIND_LABELS = Object.freeze({ volume: "区域", override: "临时" });
const DEG = Math.PI / 180;

function LoadUi() {
  const base = { open: false, tab: "overview", filter: "all", search: "", collapsed: {}, volume: null, preset: null, scroll: {}, timeline: false, timelineParam: null };
  try { return { ...base, ...(JSON.parse(globalThis.localStorage?.getItem(UI_KEY) || "null") || {}) }; } catch { return base; }
}

async function Sha1(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NumberField(value, step, onChange, { min = null, width = "" } = {}) {
  const input = El("input", `envNum ${width}`.trim());
  input.type = "number"; input.step = String(step);
  if (min !== null) input.min = String(min);
  input.value = String(value);
  input.addEventListener("change", () => { const v = Number(input.value); if (Number.isFinite(v)) onChange(v); else input.value = String(value); });
  return input;
}

function Field(parent, label, control) {
  const row = El("div", "envField");
  row.append(El("label", "envFieldLabel", label), control);
  parent.appendChild(row);
  return row;
}

export class EnvironmentEditor {
  /**
   * @param {import("./Script_EditorBlockout.mjs").EditorBlockout} editor
   * @param {{ system: import("./Script_EnvSystem.mjs").EnvironmentSystem, bridge }} environment
   */
  constructor(editor, environment) {
    this.editor = editor;
    this.system = environment?.system || null;
    this.bridge = environment?.bridge || null;
    this.ui = LoadUi();
    this.open = false;
    this.loadedScene = null;
    this.revisions = new Map();     // "scene" / "preset:<Id>" → 读文件时原始字节的 sha1（null = 盘上还没有）
    this.dirty = new Set();
    this.history = [];
    this.future = [];
    this.clipboard = null;
    this.status = { writable: null, reason: "", message: "", bad: false, conflict: null };
    this.diskPresets = [];
    this.saving = false;
    this.pollAt = 0;
    this.syncAt = 0;
    this.loading = null;
    this.views = new Map();
    this.gizmo = new EnvVolumeGizmo({
      post: editor.host.post, camera: editor.host.camera, canvas: editor.host.renderer?.domElement || null,
      groundAt: editor.groundAt, isLocked: () => editor.PointerLocked(),
      onEdit: (id, patch, { commit }) => this.SetVolume(id, patch, { merge: `gizmo:${id}`, commit }),
      onPick: (id) => this.SelectVolume(id),
    });
    this.timeline = new EnvTimelinePanel(this);
    this.BuildDom();
    this.api = this.BuildApi();
  }

  get sceneDoc() { return this.system?.sceneDoc || null; }
  get hour() { return this.system?.clock.hour ?? 12; }
  get sceneId() { return SceneIdOfUrl(this.editor.phase?.blockout?.SceneUrl?.()) || null; }
  PresetDoc(id) { return id ? this.system?.presets.get(id) || null : null; }
  PresetIds() { return [...new Set([...this.diskPresets, ...(this.system ? this.system.presets.keys() : [])])].sort(); }
  Volume(id) { return this.sceneDoc?.volumes.find((v) => v.id === id) || null; }
  SelectedVolume() {
    const volumes = this.sceneDoc?.volumes || [];
    return volumes.find((v) => v.id === this.ui.volume) || volumes.find((v) => v.shape === "global") || volumes[0] || null;
  }
  SelectedPresetId() {
    const ids = this.PresetIds();
    if (this.ui.preset && ids.includes(this.ui.preset)) return this.ui.preset;
    return this.SelectedVolume()?.preset || ids[0] || null;
  }
  SaveUi() { try { globalThis.localStorage?.setItem(UI_KEY, JSON.stringify(this.ui)); } catch { /* 无痕窗口 */ } }

  // -------------------------------------------------------------------------
  // DOM

  BuildDom() {
    const root = this.root = El("div", "envPanel");
    root.hidden = true;
    // 面板里的鼠标不往下传、打字不往下传：不让游戏把数值框里敲的数字当成换枪、点面板当成抢指针锁
    GuardPanelEvents(root, (e) => this.OnKey(e));
    const head = El("div", "envHead");
    this.elTitle = El("span", "envTitle", "环境");
    this.elScene = El("span", "envSceneName");
    this.elDirty = El("span", "envDirtyDot");
    this.btnUndo = IconButton("↶", "撤销（Ctrl+Z）", () => this.Undo());
    this.btnRedo = IconButton("↷", "重做（Ctrl+Y）", () => this.Redo());
    this.btnSave = El("button", "envBtn primary", "保存");
    this.btnSave.type = "button";
    this.btnSave.title = "保存改过的预设与区域（Ctrl+S）";
    this.btnSave.addEventListener("click", () => this.Save());
    this.btnTimeline = IconButton("⏱", "昼夜时间轴", () => this.timeline.Toggle());
    head.append(this.elTitle, this.elScene, this.elDirty, this.btnUndo, this.btnRedo, this.btnTimeline, this.btnSave,
      IconButton("×", "关闭环境面板", () => this.Close(), "envClose"));
    this.elStatus = El("div", "envStatus");
    this.elStatus.addEventListener("click", (e) => {
      const act = e.target.closest?.("[data-act]")?.dataset.act;
      if (act === "reload") this.Reload({ discard: true });
      if (act === "keep") { this.status.conflict = null; this.RenderStatus(); }
    });

    // 时间条
    const time = El("div", "envTime");
    this.elClock = El("span", "envClock", "12:00");
    this.timeRange = El("input", "envRange envTimeRange");
    this.timeRange.type = "range"; this.timeRange.min = "0"; this.timeRange.max = "24"; this.timeRange.step = String(1 / 60);
    this.timeRange.addEventListener("input", () => { this.system?.SetHour(Number(this.timeRange.value)); this.SyncTime(); });
    this.btnPlay = IconButton("▶", "播放 / 暂停昼夜", () => { if (!this.system) return; this.system.SetPaused(!this.system.clock.paused); this.SyncTime(); });
    this.speedSelect = El("select", "envSelect envSpeed");
    for (const s of ENV_RUNTIME.speedsHps) { const o = El("option", "", `${s} 时/秒`); o.value = String(s); this.speedSelect.appendChild(o); }
    this.speedSelect.title = "每秒走多少游戏小时";
    this.speedSelect.addEventListener("change", () => { this.system?.SetSpeed(Number(this.speedSelect.value)); });
    this.looksBar = El("span", "envLooks");
    const defaults = IconButton("⚑", "把现在的时间与速度设为这个场景的默认值（进场景时从这一刻开始）", () => this.SetDefaultTime());
    const row1 = El("div", "envTimeRow");
    row1.append(this.btnPlay, this.elClock, this.timeRange);
    const row2 = El("div", "envTimeRow");
    row2.append(this.looksBar, this.speedSelect, defaults);
    time.append(row1, row2);

    const tabs = El("div", "envTabs");
    this.tabButtons = new Map();
    for (const tab of TABS) {
      const b = El("button", "envTab", tab.label);
      b.type = "button";
      b.addEventListener("click", () => this.SetTab(tab.id));
      this.tabButtons.set(tab.id, b);
      tabs.appendChild(b);
    }
    this.body = El("div", "envBody");
    this.body.addEventListener("scroll", () => { this.ui.scroll[this.ui.tab] = this.body.scrollTop; this.scrollSaveAt = performance.now(); });
    this.pages = new Map(TABS.map((t) => [t.id, El("div", `envPage envPage-${t.id}`)]));
    for (const page of this.pages.values()) this.body.appendChild(page);
    root.append(head, this.elStatus, time, tabs, this.body);
    // 挂在白盒界面的 .boRoot 里：用它的 --bo-* 变量与 pointer-events 规矩
    this.editor.ui.root.appendChild(root);
    this.timeline.Mount(this.editor.ui.root);

    // 白盒编辑器顶栏的「环境」按钮
    this.topButton = El("button", "boBtn envTopBtn", "环境");
    this.topButton.type = "button";
    this.topButton.dataset.tip = "环境：区域 / 预设 / 昼夜";
    this.topButton.dataset.tipSide = "below";
    this.topButton.addEventListener("click", (e) => { e.stopPropagation(); this.Toggle(); });
    this.topButton.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.editor.ui.AddTopBarControl(this.topButton);
  }

  /** 预设视图的宿主：三处各一个，只差「看的是哪份预设」。 */
  MakeViewHost(getPresetId) {
    const ed = this;
    return {
      get preset() { return ed.PresetDoc(getPresetId()); },
      get presetId() { return getPresetId(); },
      get hour() { return ed.hour; },
      ui: ed.ui,
      SaveUi: () => ed.SaveUi(),
      SetParam: (type, key, value, { commit } = {}) => ed.SetParam(getPresetId(), type, key, value, { commit }),
      ToggleParamMode: (type, key) => ed.ToggleParamMode(getPresetId(), type, key),
      ToggleKeyAtCursor: (type, key) => ed.ToggleKeyAtCursor(getPresetId(), type, key),
      OpenTimeline: (type, key) => { ed.ui.preset = getPresetId(); ed.timeline.Open({ presetId: getPresetId(), type, key }); },
      SetComponentEnabled: (type, on) => ed.EditPreset(getPresetId(), on ? "启用组件" : "停用组件", (doc) => { doc.components[type].enabled = !!on; }),
      CopyComponent: (type) => { ed.clipboard = { type, comp: CloneValue(ed.PresetDoc(getPresetId())?.components?.[type]) }; ed.Flash(`已复制「${ENV_COMPONENTS.find((d) => d.type === type)?.label || type}」`); },
      PasteComponent: (type) => ed.PasteComponent(getPresetId(), type),
      ResetComponent: (type) => ed.EditPreset(getPresetId(), "重置组件", (doc) => { doc.components[type].params = DefaultValues(ENV_COMPONENTS.find((d) => d.type === type)); }),
      RemoveComponent: (type) => ed.RemoveComponent(getPresetId(), type),
      ToggleCollapsed: (type) => { ed.ui.collapsed[type] = !ed.ui.collapsed[type]; ed.SaveUi(); ed.SyncViews(); },
      IsCollapsed: (type) => !!ed.ui.collapsed[type],
      LiveSource: (type) => ed.system?.output?.components?.[type]?.source?.presetId === getPresetId(),
      AddComponent: (type) => ed.AddComponent(getPresetId(), type),
    };
  }

  View(page) {
    let view = this.views.get(page);
    if (!view) {
      const getter = page === "preset" ? () => this.SelectedPresetId() : () => this.SelectedVolume()?.preset || null;
      view = PresetView(this.MakeViewHost(getter));
      this.views.set(page, view);
    }
    return view;
  }

  // -------------------------------------------------------------------------
  // 开关

  async Open({ tab = null } = {}) {
    this.open = true;
    this.ui.open = true;
    if (tab) this.ui.tab = tab;
    this.SaveUi();
    this.root.hidden = false;
    this.topButton.classList.add("on");
    await this.EnsureLoaded();
    this.Render();
    if (this.ui.timeline) this.timeline.Open({});
    return this.State();
  }

  Close() {
    this.open = false;
    this.ui.open = false;
    this.SaveUi();
    this.root.hidden = true;
    this.topButton.classList.remove("on");
    this.timeline.Close({ remember: true });
    this.gizmo.SetVolumes([], null);
    return this.State();
  }

  Toggle() { return this.open ? this.Close() : this.Open(); }

  SetTab(tab) {
    if (!TABS.some((t) => t.id === tab)) return;
    this.ui.tab = tab;
    this.SaveUi();
    this.Render();
  }

  // -------------------------------------------------------------------------
  // 读文件

  /** 场景换了（换段、切到正式场景）就按新场景重读一遍，拿到版本号。 */
  async EnsureLoaded() {
    const sceneId = this.sceneId;
    if (sceneId === this.loadedScene && !this.loading) return;
    if (this.loading) return this.loading;
    this.loading = this.Reload({ discard: true }).finally(() => { this.loading = null; });
    return this.loading;
  }

  /** 重读区域文件与它引用的预设（discard：丢掉没存的改动）。时钟不动。 */
  async Reload({ discard = false } = {}) {
    const sceneId = this.sceneId;
    if (!discard && this.dirty.size) { this.Flash("有没保存的改动：先保存，或点状态条里的「重新读取」放弃改动", true); return false; }
    const dropped = sceneId !== this.loadedScene && this.dirty.size ? [...this.dirty].map((k) => (k === "scene" ? `${this.loadedScene} 的区域` : k.slice(7))) : null;
    await this.RefreshStatus();
    this.loadedScene = sceneId;
    this.dirty.clear();
    this.history = [];
    this.future = [];
    this.status.conflict = null;
    this.revisions.clear();
    if (!sceneId || !this.system) { this.Render(); return false; }
    let sceneText = null;
    try {
      const response = await fetch(`${SceneEnvUrl(sceneId)}?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) sceneText = await response.text();
      else if (response.status !== 404) throw new Error(`HTTP ${response.status}`);
    } catch (error) { this.Flash(`区域文件读不了：${error.message}`, true); this.Render(); return false; }
    if (sceneText === null) { this.revisions.set("scene", null); if (this.system.sceneId === sceneId) this.system.Clear(); this.Render(); return true; }
    const sceneDoc = JSON.parse(sceneText);
    const check = ValidateSceneEnv(sceneDoc);
    if (!check.ok) { this.Flash(`区域文件不合规：${check.errors.slice(0, 3).join("；")}`, true); this.Render(); return false; }
    this.revisions.set("scene", await Sha1(sceneText));
    const ids = new Set([...sceneDoc.volumes.map((v) => v.preset), ...this.diskPresets]);
    const presets = new Map();
    const errors = [];
    await Promise.all([...ids].map(async (id) => {
      try {
        const response = await fetch(`${EnvPresetUrl(id)}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) { errors.push(`预设 ${id} 读不到（HTTP ${response.status}）`); return; }
        const text = await response.text();
        const doc = JSON.parse(text);
        const presetCheck = ValidateEnvPreset(doc);
        if (!presetCheck.ok) { errors.push(`预设 ${id} 不合规：${presetCheck.errors.slice(0, 2).join("；")}`); return; }
        presets.set(id, doc);
        this.revisions.set(`preset:${id}`, await Sha1(text));
      } catch (error) { errors.push(`预设 ${id} 读不了：${error.message}`); }
    }));
    this.system.SetScene(sceneId, sceneDoc, presets, { keepClock: true, errors });
    if (errors.length) this.Flash(errors.join("；"), true);
    // 换场景（切到正式场景试玩、换段到别的场景）时手上还有没存的改动：环境系统已经换成新场景，那些改动丢了，明说
    if (dropped) this.Flash(`换到场景 ${sceneId}：之前没保存的环境改动已放弃（${dropped.join("、")}）。切场景前先保存`, true);
    this.Render();
    return true;
  }

  async RefreshStatus() {
    try {
      const response = await fetch("/__environment/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const status = await response.json();
      this.status.writable = !!status.writable;
      this.status.reason = status.reason || "";
      this.diskPresets = Object.keys(status.presets || {});
      return status;
    } catch {
      // 线上（Pages）没有存盘口：只能下载
      this.status.writable = false;
      this.status.reason = "这里没有存盘口（线上页面）：保存会下载 JSON，换掉仓库里的文件再提交";
      return null;
    }
  }

  /** 外面改了文件：这边没改过就重读（时钟不动），改过就挂横幅。 */
  async Poll() {
    if (!this.status.writable || this.saving || this.loading || document.hidden) return;
    const status = await this.RefreshStatus();
    if (!status || !this.loadedScene) return;
    const changed = [];
    const sceneRev = status.scenes?.[this.loadedScene] ?? null;
    if (this.revisions.has("scene") && sceneRev !== this.revisions.get("scene")) changed.push("scene");
    for (const [key, rev] of this.revisions) {
      if (!key.startsWith("preset:")) continue;
      const disk = status.presets?.[key.slice(7)] ?? null;
      if (rev !== disk && !(rev === null && disk === null)) changed.push(key);
    }
    if (!changed.length) return;
    if (changed.some((key) => this.dirty.has(key))) {
      if (!this.status.conflict) { this.status.conflict = changed; this.RenderStatus(); }
      return;
    }
    await this.Reload({ discard: true });
    this.Flash("盘上的环境文件被改过，已重新读取");
  }

  // -------------------------------------------------------------------------
  // 改动（撤销栈）

  DocFor(key) { return key === "scene" ? this.sceneDoc : this.PresetDoc(key.slice(7)); }

  /** 改一份文档：mutate(doc) 就地改；merge 相同且 1.5 s 内的连续改动并成一步。→ 改没改 */
  Edit(key, label, mutate, { merge = null } = {}) {
    const doc = this.DocFor(key);
    if (!doc) return false;
    const before = JSON.stringify(doc);
    mutate(doc);
    const after = JSON.stringify(doc);
    if (before === after) return false;
    const now = performance.now();
    const last = this.history[this.history.length - 1];
    if (merge && last && last.merge === merge && last.key === key && now - last.at < 1500) { last.after = after; last.at = now; }
    else {
      this.history.push({ key, label, before, after, merge, at: now });
      if (this.history.length > ENV_EDITOR.historyLimit) this.history.shift();
    }
    this.future = [];
    this.dirty.add(key);
    this.system.Touch();
    this.Changed(key);
    return true;
  }

  EditPreset(presetId, label, mutate, options) { return presetId ? this.Edit(`preset:${presetId}`, label, mutate, options) : false; }
  EditScene(label, mutate, options) { return this.Edit("scene", label, mutate, options); }

  ApplySnapshot(key, text) {
    const doc = text === "null" ? null : JSON.parse(text);
    if (key === "scene") this.system.SetScene(this.system.sceneId, doc, this.system.presets, { keepClock: true, errors: this.system.errors });
    else if (doc) this.system.SetPreset(doc);
    else { this.system.presets.delete(key.slice(7)); this.system.Touch(); }
    this.dirty.add(key);
    this.Changed(key, { structure: true });
  }

  Undo() {
    const step = this.history.pop();
    if (!step) return false;
    this.ApplySnapshot(step.key, step.before);
    this.future.push(step);
    this.Flash(`撤销：${step.label}`);
    return true;
  }

  Redo() {
    const step = this.future.pop();
    if (!step) return false;
    this.ApplySnapshot(step.key, step.after);
    this.history.push(step);
    this.Flash(`重做：${step.label}`);
    return true;
  }

  // --- 参数与组件 -------------------------------------------------------------

  SetParam(presetId, type, key, value, { commit = true } = {}) {
    const param = ParamDecl(type, key);
    if (!param) return false;
    return this.EditPreset(presetId, `改 ${type}.${key}`, (doc) => {
      const comp = doc.components[type];
      if (!comp) return;
      comp.params = comp.params || {};
      comp.params[key] = WriteParamValue(comp.params[key], value, this.hour);
    }, { merge: `${presetId}:${type}.${key}` });
  }

  ToggleParamMode(presetId, type, key) {
    const param = ParamDecl(type, key);
    const doc = this.PresetDoc(presetId);
    if (!param || !doc) return false;
    return this.EditPreset(presetId, `${type}.${key} 固定值 / 关键帧`, (d) => {
      const comp = d.components[type];
      comp.params = comp.params || {};
      comp.params[key] = ToggleParamValue(param, comp.params[key], this.hour, d.looks || []);
    });
  }

  ToggleKeyAtCursor(presetId, type, key) {
    const param = ParamDecl(type, key);
    if (!param) return false;
    return this.EditPreset(presetId, `${type}.${key} 关键帧`, (d) => {
      const comp = d.components[type];
      comp.params[key] = ToggleKeyValue(param, comp.params?.[key], this.hour);
    });
  }

  /** 加组件：以此刻实际的表现为初值（全写成固定值），没有就用默认值。同一种只留一份。 */
  AddComponent(presetId, type) {
    const decl = ENV_COMPONENTS.find((d) => d.type === type);
    const doc = this.PresetDoc(presetId);
    if (!decl || !doc || doc.components[type]) return false;
    const live = this.system?.CurrentValues(type);
    const params = live && this.system.output?.components?.[type]?.enabled ? live : DefaultValues(decl);
    const ok = this.EditPreset(presetId, `添加组件 ${decl.label}`, (d) => { d.components[type] = { enabled: true, params: CloneValue(params) }; });
    if (ok) { this.ui.collapsed[type] = false; this.SaveUi(); this.Changed(`preset:${presetId}`, { structure: true }); }
    return ok;
  }

  RemoveComponent(presetId, type) {
    const ok = this.EditPreset(presetId, `删除组件 ${type}`, (d) => { delete d.components[type]; });
    if (ok) this.Changed(`preset:${presetId}`, { structure: true });
    return ok;
  }

  PasteComponent(presetId, type) {
    const clip = this.clipboard;
    if (!clip?.comp) { this.Flash("剪贴板里没有组件", true); return false; }
    if (clip.type !== type) { this.Flash(`剪贴板里是 ${clip.type}，不能贴到 ${type}`, true); return false; }
    return this.EditPreset(presetId, `粘贴组件 ${type}`, (d) => { d.components[type] = CloneValue(clip.comp); });
  }

  // --- 区域 -------------------------------------------------------------------

  SelectVolume(id, { fly = false } = {}) {
    const volume = this.Volume(id);
    if (!volume) return false;
    this.ui.volume = id;
    this.SaveUi();
    if (fly) this.FlyTo(id);
    this.Changed("selection", { structure: true });
    return true;
  }

  /** 新建区域：放在相机前方的地面上，引用当前选中区域的预设（没有就新建一份空预设）。 */
  AddVolume(shape = "box", opts = {}) {
    if (!this.sceneDoc) return null;
    const taken = this.sceneDoc.volumes.map((v) => v.id);
    const id = opts.id ? UniqueId(opts.id, taken) : NumberedId(shape === "global" ? "Global" : "Volume", taken);
    const center = opts.center || this.PointAhead(18);
    let preset = opts.preset || null;
    if (!preset) {
      preset = UniqueId(`${this.loadedScene}${id}`, this.PresetIds());
      this.CreatePreset(preset, `${this.sceneDoc.scene} · ${id}`);
    }
    const volume = NewVolume(shape, { id, name: opts.name || `区域 ${id}`, preset, center, ...opts, id });
    if (shape === "box" && !opts.center) volume.center[1] += volume.size[1] / 2 - 1;
    const ok = this.EditScene(`新建区域 ${id}`, (doc) => { doc.volumes.push(volume); });
    if (!ok) return null;
    this.SelectVolume(id);
    return id;
  }

  SetVolume(id, patch, { merge = null } = {}) {
    return this.EditScene(`改区域 ${id}`, (doc) => {
      const v = doc.volumes.find((x) => x.id === id);
      if (!v) return;
      for (const [k, value] of Object.entries(patch)) {
        if (value === undefined) delete v[k]; else v[k] = CloneValue(value);
      }
      if (v.shape === "box") { v.center = v.center || this.PointAhead(18); v.size = v.size || [...ENV_RUNTIME.newBoxSize]; v.yawDeg = v.yawDeg ?? 0; delete v.radius; }
      else if (v.shape === "sphere") { v.center = v.center || this.PointAhead(18); v.radius = v.radius ?? 12; delete v.size; delete v.yawDeg; }
      else { delete v.center; delete v.size; delete v.yawDeg; delete v.radius; }
    }, { merge: merge || `volume:${id}:${Object.keys(patch).join(",")}` });
  }

  RemoveVolume(id) {
    const ok = this.EditScene(`删除区域 ${id}`, (doc) => { doc.volumes = doc.volumes.filter((v) => v.id !== id); });
    if (ok && this.ui.volume === id) { this.ui.volume = null; this.SaveUi(); }
    if (ok) this.Changed("scene", { structure: true });
    return ok;
  }

  DuplicateVolume(id) {
    const v = this.Volume(id);
    if (!v) return null;
    const copy = CloneValue(v);
    copy.id = UniqueId(v.id, this.sceneDoc.volumes.map((x) => x.id));
    copy.name = `${v.name || v.id} 副本`;
    if (copy.center) copy.center = [copy.center[0] + 4, copy.center[1], copy.center[2] + 4];
    if (!this.EditScene(`复制区域 ${id}`, (doc) => { doc.volumes.push(copy); })) return null;
    this.SelectVolume(copy.id);
    return copy.id;
  }

  /** 相机前方 distance 米的地面点。 */
  PointAhead(distance) {
    const cam = this.editor.host.camera;
    const dir = { x: 0, z: -1 };
    if (cam) {
      const e = cam.matrixWorld.elements;
      const fx = -e[8], fz = -e[10];
      const len = Math.hypot(fx, fz) || 1;
      dir.x = fx / len; dir.z = fz / len;
    }
    const x = (cam?.position.x ?? 0) + dir.x * distance, z = (cam?.position.z ?? 0) + dir.z * distance;
    const y = this.editor.groundAt?.(x, z) ?? 0;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(z * 10) / 10];
  }

  /** 飞到能看清这个区域的机位（飞行观察）。全场区域不飞。 */
  FlyTo(id) {
    const v = this.Volume(id);
    if (!v || v.shape === "global" || !v.center) return false;
    const span = v.shape === "sphere" ? v.radius * 2 : Math.max(v.size[0], v.size[2]);
    const [cx, cy, cz] = v.center;
    const pos = { x: cx, y: cy + Math.max(6, span * 0.55), z: cz + Math.max(10, span * 1.1) };
    const dx = cx - pos.x, dy = cy - pos.y, dz = cz - pos.z;
    const pose = { ...pos, yawDeg: Math.atan2(-dx, -dz) / DEG, pitchDeg: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
    if (this.editor.flying) this.editor.SetFlyPose(pose); else this.editor.EnterFly(pose, { quiet: true });
    return true;
  }

  // --- 预设 -------------------------------------------------------------------

  /** 新建一份预设（进撤销栈；盘上没有，存盘时按新文件写）。from：拷哪份预设的组件。 */
  CreatePreset(id, title = id, from = null) {
    if (!ENV_ID_RE.test(id) || this.PresetIds().includes(id) || !this.system) return null;
    const doc = NewEnvPreset(id, title, from ? CloneValue(from.components) : {});
    if (from?.looks) doc.looks = CloneValue(from.looks);
    this.system.SetPreset(doc);
    const key = `preset:${id}`;
    this.revisions.set(key, null);
    this.history.push({ key, label: `新建预设 ${id}`, before: "null", after: JSON.stringify(doc), merge: null, at: performance.now() });
    this.future = [];
    this.dirty.add(key);
    this.Changed(key, { structure: true });
    return id;
  }

  SelectPreset(id) {
    if (!this.PresetIds().includes(id)) return false;
    this.ui.preset = id;
    this.SaveUi();
    this.Changed("selection", { structure: true });
    return true;
  }

  /** 这个场景还没有环境：建兜底区域 + 一份按本关天空预设抄出来的预设（存盘后生效到文件）。 */
  CreateSceneEnvironment() {
    const sceneId = this.sceneId;
    if (!sceneId || !this.system || this.sceneDoc) return false;
    const presetId = UniqueId(sceneId, this.PresetIds());
    const skyName = this.editor.phase?.sky || "firstLevelBattleDay";
    const preset = EnvPresetFromSkyPreset(SKY_PRESETS[skyName] || SKY_PRESETS.firstLevelBattleDay, skyName, { id: presetId, title: `${sceneId} · 环境` });
    const sceneDoc = NewSceneEnv(sceneId, presetId);
    this.system.SetScene(sceneId, sceneDoc, new Map([[presetId, preset]]));
    this.loadedScene = sceneId;
    this.revisions.set("scene", null);
    this.revisions.set(`preset:${presetId}`, null);
    this.dirty.add("scene");
    this.dirty.add(`preset:${presetId}`);
    this.Changed("scene", { structure: true });
    return true;
  }

  SetDefaultTime() {
    const clock = this.system?.clock;
    if (!clock) return false;
    return this.EditScene("设为默认时间", (doc) => {
      doc.time = { hour: Math.round(clock.hour * 1000) / 1000, speed: clock.speed, paused: clock.paused };
    });
  }

  // -------------------------------------------------------------------------
  // 存盘

  async Save() {
    if (!this.dirty.size) { this.Flash("没有要保存的改动"); return { ok: true, saved: [] }; }
    for (const key of this.dirty) {
      const doc = this.DocFor(key);
      if (!doc) continue;
      const check = key === "scene" ? ValidateSceneEnv(doc, { presetIds: new Set(this.PresetIds()) }) : ValidateEnvPreset(doc);
      if (!check.ok) { this.Flash(`${key === "scene" ? "区域文件" : key.slice(7)} 不合规，没存：${check.errors.slice(0, 3).join("；")}`, true); return { ok: false, errors: check.errors }; }
    }
    if (!this.status.writable) {
      for (const key of this.dirty) {
        const doc = this.DocFor(key);
        if (doc) Download(key === "scene" ? `Environment_${this.loadedScene}.json` : `EnvPreset_${key.slice(7)}.json`, FormatEnvJson(doc));
      }
      this.Flash("线上没有存盘口：已下载改过的 JSON，换掉仓库里的文件再提交");
      return { ok: true, downloaded: [...this.dirty] };
    }
    this.saving = true;
    const saved = [];
    try {
      // 预设先存（区域文件校验时要认得它引用的新预设）
      const order = [...this.dirty].sort((a, b) => (a === "scene") - (b === "scene"));
      for (const key of order) {
        const doc = this.DocFor(key);
        if (!doc) { this.dirty.delete(key); continue; }
        const kind = key === "scene" ? "scene" : "preset";
        const id = kind === "scene" ? this.loadedScene : key.slice(7);
        const response = await fetch("/__environment/save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, doc, revision: this.revisions.get(key) ?? null }),
        });
        const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
        if (response.status === 409) {
          this.status.conflict = [key];
          this.Flash(`${kind === "scene" ? "区域文件" : `预设 ${id}`}在别处改过，没存（可以重新读取，或先下载自己的版本）`, true);
          return { ok: false, conflict: key, saved };
        }
        if (!result.ok) { this.Flash(`保存失败：${result.error}${result.details ? `（${result.details.slice(0, 2).join("；")}）` : ""}`, true); return { ok: false, error: result.error, saved }; }
        this.revisions.set(key, result.revision);
        this.dirty.delete(key);
        saved.push(result.file);
      }
      await this.RefreshStatus();
      this.Flash(`已保存：${saved.map((f) => f.split("/").pop()).join("、")}`);
      return { ok: true, saved };
    } finally {
      this.saving = false;
      this.Render();
    }
  }

  // -------------------------------------------------------------------------
  // 渲染

  Changed(key, { structure = false } = {}) {
    if (!this.open) return;
    if (structure) { this.Render(); return; }
    this.RenderHead();
    this.SyncViews();
    this.timeline.Changed();
    if (key === "scene") this.RenderPage({ keepViews: true });
  }

  Render() {
    if (!this.open) return;
    this.RenderHead();
    this.RenderStatus();
    this.RenderLooks();
    this.SyncTime(true);
    for (const [id, b] of this.tabButtons) b.classList.toggle("on", id === this.ui.tab);
    this.RenderPage();
    this.timeline.Changed({ structure: true });
  }

  RenderHead() {
    this.elScene.textContent = this.loadedScene ? `· ${this.loadedScene}` : "";
    this.elDirty.hidden = !this.dirty.size;
    this.elDirty.title = this.dirty.size ? `没保存：${[...this.dirty].map((k) => (k === "scene" ? "区域" : k.slice(7))).join("、")}` : "";
    this.btnSave.disabled = !this.dirty.size || this.saving;
    this.btnSave.textContent = this.status.writable === false ? "下载" : "保存";
    this.btnUndo.disabled = !this.history.length;
    this.btnRedo.disabled = !this.future.length;
  }

  RenderStatus() {
    const s = this.status;
    this.elStatus.textContent = "";
    this.elStatus.className = "envStatus";
    this.elStatus.hidden = false;
    if (s.conflict) {
      this.elStatus.classList.add("bad");
      this.elStatus.append(El("span", "", "盘上的环境文件被改过，这边也有没存的改动。"));
      const reload = El("button", "envBtn", "重新读取（放弃改动）"); reload.type = "button"; reload.dataset.act = "reload";
      const keep = El("button", "envBtn", "先不管"); keep.type = "button"; keep.dataset.act = "keep";
      this.elStatus.append(reload, keep);
      return;
    }
    const errors = this.system?.errors || [];
    if (s.message) { this.elStatus.textContent = s.message; this.elStatus.classList.toggle("bad", !!s.bad); return; }
    if (errors.length) { this.elStatus.textContent = errors.join("；"); this.elStatus.classList.add("bad"); return; }
    this.elStatus.hidden = false;
    this.elStatus.textContent = s.writable === false ? s.reason : "";
    this.elStatus.hidden = !this.elStatus.textContent;
  }

  Flash(message, bad = false) {
    this.status.message = message;
    this.status.bad = bad;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { this.status.message = ""; this.RenderStatus(); }, bad ? 7000 : 3500);
    this.RenderStatus();
    this.elStatus.hidden = false;
  }

  RenderLooks() {
    this.looksBar.textContent = "";
    for (const look of this.system?.Looks() || []) {
      const b = El("button", "envLook", look.label);
      b.type = "button";
      b.title = `跳到 ${FormatHour(look.hour)}`;
      b.dataset.look = look.id;
      b.addEventListener("click", () => { this.system.SetLook(look.id); this.SyncTime(); });
      this.looksBar.appendChild(b);
    }
  }

  SyncTime(force = false) {
    const clock = this.system?.clock;
    if (!clock) return;
    this.elClock.textContent = FormatHour(clock.hour);
    if (force || document.activeElement !== this.timeRange) this.timeRange.value = String(clock.hour);
    this.timeRange.style.setProperty("--fill", `${clock.hour / 24 * 100}%`);
    this.btnPlay.textContent = clock.paused ? "▶" : "❚❚";
    this.btnPlay.classList.toggle("on", !clock.paused);
    if (document.activeElement !== this.speedSelect) this.speedSelect.value = String(clock.speed);
    for (const b of this.looksBar.children) {
      const look = this.system.Looks().find((l) => l.id === b.dataset.look);
      b.classList.toggle("on", !!look && Math.abs(((clock.hour - look.hour + 36) % 24) - 12) > 11.95);
    }
  }

  SyncViews() {
    const view = this.views.get(this.ui.tab);
    view?.Sync();
    if (this.ui.tab === "overview") this.RenderEffective();
  }

  RenderPage({ keepViews = false } = {}) {
    const tab = this.ui.tab;
    for (const [id, page] of this.pages) page.hidden = id !== tab;
    const page = this.pages.get(tab);
    const scroll = this.ui.scroll[tab] || 0;
    if (!this.sceneDoc) { this.RenderEmpty(page); return; }
    if (tab === "overview") this.RenderOverview(page, keepViews);
    if (tab === "volume") this.RenderVolumePage(page, keepViews);
    if (tab === "preset") this.RenderPresetPage(page, keepViews);
    if (!keepViews) requestAnimationFrame(() => { this.body.scrollTop = scroll; });
  }

  RenderEmpty(page) {
    page.textContent = "";
    page.append(El("div", "envEmpty", this.sceneId ? `场景 ${this.sceneId} 还没有环境文件（Scenes/${this.sceneId}/Environment_${this.sceneId}.json），现在用的是本关的天空预设。` : "这一段不是场景关卡，没有环境区域。"));
    if (this.sceneId) {
      const b = El("button", "envBtn primary", "新建环境（兜底区域 + 按本关天空抄一份预设）");
      b.type = "button";
      b.addEventListener("click", () => this.CreateSceneEnvironment());
      page.appendChild(b);
    }
  }

  SectionHead(parent, text, extra = null) {
    const h = El("div", "envSection", text);
    if (extra) h.appendChild(extra);
    parent.appendChild(h);
    return h;
  }

  // --- 总览 -------------------------------------------------------------------

  RenderOverview(page, keepViews) {
    if (!keepViews || !this.ovBuilt) {
      page.textContent = "";
      this.SectionHead(page, "当前生效");
      this.elEffective = El("div", "envEffective");
      page.appendChild(this.elEffective);
      const observer = El("select", "envSelect");
      for (const [value, label] of [["camera", "观察点：相机"], ["player", "观察点：玩家"], ["pinned", "观察点：钉在此处"]]) {
        const o = El("option", "", label); o.value = value; observer.appendChild(o);
      }
      observer.value = this.system.observerMode;
      observer.addEventListener("change", () => {
        this.system.observerMode = observer.value;
        this.system.pinnedAt = observer.value === "pinned" ? { ...this.system.observer } : null;
        this.system.Touch();
      });
      this.SectionHead(page, "区域与覆盖（优先级从高到低）", observer);
      this.elSources = El("div", "envSources");
      page.appendChild(this.elSources);
      this.elOvPresetHead = this.SectionHead(page, "");
      const view = this.View("overview");
      page.appendChild(view.root);
      this.ovBuilt = true;
      view.Rebuild();
    }
    const vol = this.SelectedVolume();
    if (keepViews && this.ovPreset !== vol?.preset) this.View("overview").Rebuild();
    this.ovPreset = vol?.preset;
    this.elOvPresetHead.textContent = vol ? `编辑：${vol.name || vol.id} → 预设 ${vol.preset}` : "没有选中的区域";
    this.RenderEffective();
    this.RenderSources();
    this.View("overview").Sync();
  }

  RenderEffective() {
    if (!this.elEffective || this.ui.tab !== "overview") return;
    const out = this.system.output;
    this.elEffective.textContent = "";
    for (const decl of ENV_COMPONENTS) {
      const c = out?.components?.[decl.type];
      const row = El("div", "envEffRow");
      const src = c?.source;
      const tag = El("span", `envTag ${src ? src.kind : "none"}`, src ? (c.enabled ? (src.kind === "override" ? "临时" : (this.Volume(src.id)?.shape === "global" ? "基础" : "区域")) : "关闭") : "关闭");
      row.append(El("span", "envEffIcon", decl.icon), El("span", "envEffName", decl.label), tag,
        El("span", "envEffSrc", src ? `${src.name} · ${src.presetId || "—"}` : "没有来源"));
      if (c && c.transition < 1) {
        const bar = El("span", "envEffBar");
        bar.style.setProperty("--t", `${Math.round(c.transition * 100)}%`);
        row.appendChild(bar);
      }
      row.title = src ? `${decl.label}：${src.kind === "override" ? "临时覆盖" : "区域"} ${src.name}（优先级 ${src.priority}，${MODE_LABELS[src.mode] || ""}）` : "";
      if (src?.kind === "volume") row.addEventListener("click", () => { this.SelectVolume(src.id); });
      this.elEffective.appendChild(row);
    }
  }

  RenderSources() {
    this.elSources.textContent = "";
    const selected = this.SelectedVolume()?.id;
    for (const s of this.system.Sources()) {
      const row = El("div", "envSrcRow");
      row.classList.toggle("inside", s.inside);
      row.classList.toggle("selected", s.kind === "volume" && s.id === selected);
      row.classList.toggle("off", !s.enabled);
      const tag = El("span", `envTag ${s.kind}`, s.kind === "override" ? "临时" : (s.shape === "global" ? "基础" : "区域"));
      const name = El("span", "envSrcName", s.name);
      const preset = El("button", "envLink", s.presetId || "—");
      preset.type = "button";
      preset.title = s.presetMissing ? "引用的预设读不到" : "打开这份预设";
      preset.classList.toggle("bad", s.presetMissing);
      preset.addEventListener("click", (e) => { e.stopPropagation(); if (s.presetId) { this.SelectPreset(s.presetId); this.SetTab("preset"); } });
      const meta = El("span", "envSrcMeta", `${s.priority} · ${SHAPE_LABELS[s.shape] || s.shape} · ${s.mode === "full" ? "全覆盖" : "部分"}${s.providing.length ? ` · 提供 ${s.providing.length}` : ""}`);
      const dot = El("span", "envDot");
      dot.title = s.inside ? "观察点在里面" : "观察点不在里面";
      row.append(dot, tag, name, preset, meta);
      if (s.kind === "override") {
        const release = El("button", "envBtn", "撤掉");
        release.type = "button";
        release.addEventListener("click", (e) => { e.stopPropagation(); this.system.ReleaseOverride(s.id); this.Render(); });
        row.appendChild(release);
      } else {
        row.title = "选中这个区域（双击：飞过去看）";
        row.addEventListener("click", () => this.SelectVolume(s.id));
        row.addEventListener("dblclick", () => this.SelectVolume(s.id, { fly: true }));
      }
      this.elSources.appendChild(row);
    }
  }

  // --- 区域页 -----------------------------------------------------------------

  RenderVolumePage(page, keepViews) {
    const current = this.SelectedVolume();
    if (keepViews && current && this.volBuiltFor === current.id && this.volBuiltShape === current.shape && this.volBuiltPreset === current.preset) {
      this.RefreshVolumeFields();
      this.View("volume").Sync();
      return;
    }
    page.textContent = "";
    const tools = El("span", "envSectionTools");
    tools.append(
      IconButton("▢＋", "新建盒子区域（放在相机前方）", () => this.AddVolume("box")),
      IconButton("◯＋", "新建球形区域", () => this.AddVolume("sphere")),
      IconButton("⧉", "复制选中的区域", () => { const v = this.SelectedVolume(); if (v) this.DuplicateVolume(v.id); }),
      IconButton("✕", "删除选中的区域", () => { const v = this.SelectedVolume(); if (v) this.RemoveVolume(v.id); }, "danger"),
    );
    this.SectionHead(page, "区域", tools);
    const list = El("div", "envVolList");
    const selected = this.SelectedVolume();
    for (const v of [...this.sceneDoc.volumes].sort((a, b) => b.priority - a.priority)) {
      const row = El("div", "envSrcRow");
      row.classList.toggle("selected", v.id === selected?.id);
      row.classList.toggle("inside", this.system.inside.has(`volume:${v.id}`));
      row.classList.toggle("off", v.enabled === false);
      row.append(El("span", "envDot"), El("span", `envTag volume`, v.shape === "global" ? "基础" : "区域"), El("span", "envSrcName", v.name || v.id),
        El("span", "envSrcMeta", `${v.priority} · ${SHAPE_LABELS[v.shape]} · ${v.preset}`));
      row.addEventListener("click", () => this.SelectVolume(v.id));
      row.addEventListener("dblclick", () => this.SelectVolume(v.id, { fly: true }));
      list.appendChild(row);
    }
    page.appendChild(list);
    if (!selected) return;
    this.volBuiltFor = selected.id;
    this.volBuiltShape = selected.shape;
    this.volBuiltPreset = selected.preset;
    const insp = El("div", "envInspector");
    this.volFields = {};
    const name = El("input", "envText");
    name.value = selected.name || "";
    name.addEventListener("change", () => this.SetVolume(selected.id, { name: name.value }));
    Field(insp, "名称", name);
    const idRow = El("span", "envMono", selected.id);
    const enabled = El("input", "envCheck"); enabled.type = "checkbox"; enabled.checked = selected.enabled !== false;
    enabled.addEventListener("change", () => this.SetVolume(selected.id, { enabled: enabled.checked ? undefined : false }));
    const idWrap = El("span", "envInline"); idWrap.append(idRow, El("span", "envFieldHint", "启用"), enabled);
    Field(insp, "编号", idWrap);
    const shape = El("select", "envSelect");
    for (const s of VOLUME_SHAPES) { const o = El("option", "", SHAPE_LABELS[s]); o.value = s; shape.appendChild(o); }
    shape.value = selected.shape;
    shape.addEventListener("change", () => this.SetVolume(selected.id, { shape: shape.value }));
    Field(insp, "形状", shape);
    if (selected.shape !== "global") {
      const center = El("span", "envVec");
      this.volFields.center = [0, 1, 2].map((i) => NumberField(selected.center[i], 0.1, (v) => {
        const c = [...this.Volume(selected.id).center]; c[i] = v; this.SetVolume(selected.id, { center: c });
      }, { width: "narrow" }));
      center.append(...this.volFields.center);
      Field(insp, "中心 X / Y / Z", center);
      if (selected.shape === "box") {
        const size = El("span", "envVec");
        this.volFields.size = [0, 1, 2].map((i) => NumberField(selected.size[i], 0.5, (v) => {
          const s = [...this.Volume(selected.id).size]; s[i] = Math.max(0.1, v); this.SetVolume(selected.id, { size: s });
        }, { min: 0.1, width: "narrow" }));
        size.append(...this.volFields.size);
        Field(insp, "尺寸 宽 / 高 / 深", size);
        this.volFields.yaw = NumberField(selected.yawDeg || 0, 1, (v) => this.SetVolume(selected.id, { yawDeg: v }));
        Field(insp, "朝向（度）", this.volFields.yaw);
      } else {
        this.volFields.radius = NumberField(selected.radius, 0.5, (v) => this.SetVolume(selected.id, { radius: Math.max(0.1, v) }), { min: 0.1 });
        Field(insp, "半径", this.volFields.radius);
      }
      const place = El("span", "envInline");
      const ahead = El("button", "envBtn", "放到相机前"); ahead.type = "button";
      ahead.addEventListener("click", () => { const p = this.PointAhead(18); const v = this.Volume(selected.id); if (v.shape === "box") p[1] += v.size[1] / 2 - 1; this.SetVolume(selected.id, { center: p }); });
      const ground = El("button", "envBtn", "底面落地"); ground.type = "button";
      ground.addEventListener("click", () => {
        const v = this.Volume(selected.id); const g = this.editor.groundAt?.(v.center[0], v.center[2]) ?? 0;
        this.SetVolume(selected.id, { center: [v.center[0], g + (v.shape === "box" ? v.size[1] / 2 : 0), v.center[2]] });
      });
      const fly = El("button", "envBtn", "飞过去看"); fly.type = "button";
      fly.addEventListener("click", () => this.FlyTo(selected.id));
      place.append(ahead, ground, fly);
      Field(insp, "", place);
    }
    this.volFields.priority = NumberField(selected.priority, 1, (v) => this.SetVolume(selected.id, { priority: v }));
    Field(insp, "优先级", this.volFields.priority);
    this.volFields.blend = NumberField(selected.blendS, 0.1, (v) => this.SetVolume(selected.id, { blendS: Math.max(0, v) }), { min: 0 });
    Field(insp, "过渡时长（秒）", this.volFields.blend);
    const mode = El("select", "envSelect");
    for (const m of ["partial", "full"]) { const o = El("option", "", MODE_LABELS[m]); o.value = m; mode.appendChild(o); }
    mode.value = selected.mode;
    mode.title = "只覆盖包含的组件：没有的组件继承下层；完全覆盖：没有的组件取关闭值，下层一概不看";
    mode.addEventListener("change", () => this.SetVolume(selected.id, { mode: mode.value }));
    Field(insp, "覆盖模式", mode);
    const presetWrap = El("span", "envInline");
    const preset = El("select", "envSelect");
    for (const id of this.PresetIds()) { const o = El("option", "", id); o.value = id; preset.appendChild(o); }
    preset.value = selected.preset;
    preset.addEventListener("change", () => this.SetVolume(selected.id, { preset: preset.value }));
    const newPreset = IconButton("＋", "新建一份空预设并引用", () => {
      const id = this.CreatePreset(UniqueId(`${this.loadedScene}${selected.id}`, this.PresetIds()), `${this.loadedScene} · ${selected.id}`);
      if (id) this.SetVolume(selected.id, { preset: id });
    });
    const copyPreset = IconButton("⧉", "把引用的预设复制一份再引用（不影响别的区域）", () => {
      const from = this.PresetDoc(selected.preset);
      const id = this.CreatePreset(UniqueId(`${selected.preset}Copy`, this.PresetIds()), `${from?.title || selected.preset} 副本`, from);
      if (id) this.SetVolume(selected.id, { preset: id });
    });
    const openPreset = IconButton("↗", "在预设页打开", () => { this.SelectPreset(selected.preset); this.SetTab("preset"); });
    presetWrap.append(preset, newPreset, copyPreset, openPreset);
    Field(insp, "引用的预设", presetWrap);
    const users = this.sceneDoc.volumes.filter((v) => v.preset === selected.preset).length;
    if (users > 1) insp.appendChild(El("div", "envFieldHint", `这份预设被 ${users} 个区域引用：改它几处一起变`));
    page.appendChild(insp);
    this.SectionHead(page, `预设 ${selected.preset} 的组件`);
    const view = this.View("volume");
    page.appendChild(view.root);
    view.Rebuild();
  }

  RefreshVolumeFields() {
    const v = this.SelectedVolume();
    if (!v || !this.volFields) return;
    const set = (input, value) => { if (input && document.activeElement !== input) input.value = String(Math.round(value * 1000) / 1000); };
    this.volFields.center?.forEach((input, i) => set(input, v.center[i]));
    this.volFields.size?.forEach((input, i) => set(input, v.size[i]));
    set(this.volFields.yaw, v.yawDeg || 0);
    set(this.volFields.radius, v.radius || 0);
    set(this.volFields.priority, v.priority);
    set(this.volFields.blend, v.blendS);
  }

  // --- 预设页 -----------------------------------------------------------------

  RenderPresetPage(page, keepViews) {
    const id = this.SelectedPresetId();
    if (keepViews && this.presetBuiltFor === id) { this.View("preset").Sync(); return; }
    this.presetBuiltFor = id;
    page.textContent = "";
    const tools = El("span", "envSectionTools");
    tools.append(
      IconButton("＋", "新建空预设", () => {
        const newId = this.CreatePreset(UniqueId(`${this.loadedScene || "Env"}Preset`, this.PresetIds()), "新预设");
        if (newId) this.SelectPreset(newId);
      }),
      IconButton("⧉", "复制这份预设", () => {
        const from = this.PresetDoc(id);
        if (!from) return;
        const newId = this.CreatePreset(UniqueId(`${id}Copy`, this.PresetIds()), `${from.title || id} 副本`, from);
        if (newId) this.SelectPreset(newId);
      }),
    );
    this.SectionHead(page, "预设资源", tools);
    const insp = El("div", "envInspector");
    const select = El("select", "envSelect");
    for (const pid of this.PresetIds()) { const o = El("option", "", pid); o.value = pid; select.appendChild(o); }
    select.value = id || "";
    select.addEventListener("change", () => this.SelectPreset(select.value));
    Field(insp, "预设", select);
    const doc = this.PresetDoc(id);
    if (doc) {
      const title = El("input", "envText");
      title.value = doc.title || "";
      title.addEventListener("change", () => this.EditPreset(id, "改预设名", (d) => { d.title = title.value; }));
      Field(insp, "名称", title);
      const users = (this.sceneDoc?.volumes || []).filter((v) => v.preset === id).map((v) => v.name || v.id);
      Field(insp, "被引用", El("span", "envFieldHint", users.length ? users.join("、") : "这个场景里没有区域引用它"));
      if (doc.looks?.length) {
        const looks = El("span", "envInline");
        for (const look of doc.looks) {
          const b = El("button", "envLook", `${look.label} ${FormatHour(look.hour)}`);
          b.type = "button";
          b.addEventListener("click", () => { this.system.SetHour(look.hour); this.SyncTime(); });
          looks.appendChild(b);
        }
        Field(insp, "几套表现", looks);
      }
    } else if (id) {
      insp.appendChild(El("div", "envFieldHint", "这份预设在盘上，但这个场景没用到：引用它的区域保存后才会读进来"));
    }
    page.appendChild(insp);
    const view = this.View("preset");
    page.appendChild(view.root);
    view.Rebuild();
  }

  // -------------------------------------------------------------------------
  // 每帧 / 键盘

  /** 面板的快捷键。→ 处理了没有（处理了就不往游戏传）。 */
  OnKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === "KeyS") { e.preventDefault(); this.Save(); return true; }
    if (IsTyping(e.target)) return false;
    if (mod && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); this.Undo(); return true; }
    if (mod && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { e.preventDefault(); this.Redo(); return true; }
    return false;
  }

  /** 白盒编辑器每帧调。 */
  Update(dt) {
    if (!this.system) return;
    const now = performance.now();
    if (this.sceneId !== this.loadedScene && !this.loading && (this.open || this.loadedScene)) this.EnsureLoaded();
    if (now - this.pollAt > ENV_EDITOR.pollS * 1000) { this.pollAt = now; this.Poll(); }
    if (this.scrollSaveAt && now - this.scrollSaveAt > 400) { this.scrollSaveAt = 0; this.SaveUi(); }
    if (!this.open) return;
    // 时间在走 / 过渡进行中：面板上的数值就地刷新（不重建 DOM）
    if (now - this.syncAt > 100) {
      this.syncAt = now;
      this.SyncTime();
      const version = this.system.output?.version;
      if (version !== this.syncedVersion || !this.system.clock.paused) {
        this.syncedVersion = version;
        this.SyncViews();
        if (this.ui.tab === "overview" && this.elSources) this.RenderSources();
      }
      this.timeline.SyncCursor();
    }
    const selected = this.SelectedVolume();
    this.gizmo.SetVolumes(this.sceneDoc?.volumes || [], selected?.id || null, this.system.inside);
    this.gizmo.Update();
  }

  CapturesMouse() { return this.gizmo.dragging; }

  State() {
    return {
      open: this.open, tab: this.ui.tab, scene: this.loadedScene, dirty: [...this.dirty], history: this.history.length, future: this.future.length,
      writable: this.status.writable, conflict: this.status.conflict, message: this.status.message,
      selectedVolume: this.SelectedVolume()?.id || null, selectedPreset: this.SelectedPresetId(),
      presets: this.PresetIds(), timeline: this.timeline.State(), gizmo: this.gizmo.State(),
      ui: { filter: this.ui.filter, search: this.ui.search, collapsed: { ...this.ui.collapsed }, scroll: { ...this.ui.scroll } },
    };
  }

  BuildApi() {
    return {
      Open: (tab) => this.Open({ tab }),
      Close: () => this.Close(),
      State: () => this.State(),
      SetTab: (tab) => { this.SetTab(tab); return this.State(); },
      Reload: (discard = true) => this.Reload({ discard }),
      Save: () => this.Save(),
      Undo: () => this.Undo(),
      Redo: () => this.Redo(),
      SelectVolume: (id, fly = false) => this.SelectVolume(id, { fly }),
      SelectPreset: (id) => this.SelectPreset(id),
      AddVolume: (shape, opts) => this.AddVolume(shape, opts),
      SetVolume: (id, patch) => this.SetVolume(id, patch),
      RemoveVolume: (id) => this.RemoveVolume(id),
      FlyTo: (id) => this.FlyTo(id),
      CreatePreset: (id, title, fromId) => this.CreatePreset(id, title, fromId ? this.PresetDoc(fromId) : null),
      AddComponent: (presetId, type) => this.AddComponent(presetId, type),
      RemoveComponent: (presetId, type) => this.RemoveComponent(presetId, type),
      SetParam: (presetId, type, key, value) => this.SetParam(presetId, type, key, value),
      ToggleParamMode: (presetId, type, key) => this.ToggleParamMode(presetId, type, key),
      ToggleKey: (presetId, type, key) => this.ToggleKeyAtCursor(presetId, type, key),
      Preset: (id) => CloneValue(this.PresetDoc(id)),
      Scene: () => CloneValue(this.sceneDoc),
      SetHour: (hour) => { this.system?.SetHour(hour); this.SyncTime(); return this.hour; },
      SetDefaultTime: () => this.SetDefaultTime(),
      Filter: (filter, search = "") => { this.ui.filter = filter; this.ui.search = search; this.SaveUi(); this.Render(); return this.State().ui; },
      Collapse: (type, on) => { this.ui.collapsed[type] = !!on; this.SaveUi(); this.SyncViews(); return !!on; },
      CreateSceneEnvironment: () => this.CreateSceneEnvironment(),
      Timeline: this.timeline.api,
      Gizmo: this.gizmo.api,
    };
  }

  Dispose() {
    clearTimeout(this.flashTimer);
    this.gizmo.Dispose();
    this.timeline.Dispose();
    this.root.remove();
    this.topButton.remove();
  }
}
