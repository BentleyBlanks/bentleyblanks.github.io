// 独立工具宿主（Tool_Studio.html?tool=<id>）：九个摄影棚类高级工具不靠游戏主程序、单独一页就能开。
//
// 渲染底座在 Script_ToolStudioRenderBase（自己装配，不改 Script_Main）；这里是外壳：顶部菜单栏 + 右侧 Inspector
// + 一次只开一个工具，布局、样式与 EditorSuite 同一套（Style_Interface / Style_Editor、Script_EditorUi、
// Script_EditorStage、Script_EditorVolume）。给编辑器的 host 对象字段与 EditorSuite.editorHost 一致，
// 唯一差别：game 是最小桩（没有战局），playerWeaponId 是游戏开局的默认武器（Data_Weapons.DEFAULT_PLAYER_WEAPON）。
// 口径见 docs/Data_EditorSuite.md「AdvancedTool ControlCenter 与独立工具宿主」。

import { El, Panel, Note } from "../Script_EditorUi.mjs";
import { Studio, FlyCam, ViewportInput } from "../Script_EditorStage.mjs";
import { LoadToolsVolume, ToolsVolumeControl, ToolsVolumeLevel } from "../Script_EditorVolume.mjs";
import { TOOL_INFO, TOOL_MENUS } from "../Data_DevTools.mjs";
import { CreateStudioBase, MAX_FRAME_DT } from "./Script_ToolStudioRenderBase.mjs";
import { ActorEditor } from "./Script_EditorActor.mjs";
import { FacialEditor } from "./Script_EditorFacial.mjs";
import { SquadMarchEditor } from "./Script_EditorSquadMarch.mjs";
import { WeaponEditor } from "./Script_EditorWeapon.mjs";
import { FirstPersonEditor } from "./Script_EditorFirstPerson.mjs";
import { VfxEditor } from "./Script_EditorVfx.mjs";
import { AudioEditor } from "./Script_EditorAudio.mjs";
import { PropLibraryEditor } from "./Script_EditorPropLibrary.mjs";
import { AssetStandardsEditor } from "./Script_EditorAssetStandards.mjs";
import { CONTROL_CENTER_URL } from "./Data_AdvancedTools.mjs";

/** 在这一页里跑的工具（Data_DevTools 里的 id）。其余拆出去的是独立窗口页，不在这里。 */
export const STUDIO_EDITORS = Object.freeze([
  ActorEditor, FacialEditor, SquadMarchEditor, WeaponEditor, FirstPersonEditor, VfxEditor, AudioEditor,
  PropLibraryEditor, AssetStandardsEditor,
]);
const EDITOR_BY_ID = new Map(STUDIO_EDITORS.map((Editor) => [Editor.id, Editor]));

/** 菜单分组：Data_DevTools.TOOL_MENUS 里挑出这九个，空组不列。 */
export function StudioMenus() {
  return TOOL_MENUS
    .map((menu) => ({ id: menu.id, label: menu.label, items: menu.items.filter((id) => EDITOR_BY_ID.has(id)).map((id) => EDITOR_BY_ID.get(id)) }))
    .filter((menu) => menu.items.length);
}

export class ToolStudio {
  /** base 是 CreateStudioBase 的返回值。 */
  constructor(base, { returnUrl = CONTROL_CENTER_URL } = {}) {
    this.base = base;
    this.returnUrl = returnUrl;
    this.active = null;
    this.activeId = null;
    this.menus = new Map();
    this.entries = new Map();
    this.openMenuId = null;
    this.weaponId = base.defaultWeaponId;
    this.toolsVolume = LoadToolsVolume(base.audio?.masterVolume ?? 1);
    this._audioPaused = null;

    this.studio = new Studio({ scene: base.scene, camera: base.camera, library: base.library, actorFactory: base.actorFactory });
    this.flycam = new FlyCam(base.camera);
    this.viewport = new ViewportInput(base.canvas);

    this.BuildDom();
    this.BindInput();
    this.RefreshStatus();
  }

  get ActiveId() { return this.activeId; }

  /** 各编辑器共用的宿主接口（字段同 EditorSuite.editorHost）。 */
  get editorHost() {
    const base = this.base;
    const suite = this;
    const game = {
      state: base.state, PHASES: [], graphics: base.graphics, ApplyGraphics: base.ApplyGraphics, FrameDebugger: null,
      get gi() { return base.gi; }, get firstPersonSelfShadow() { return base.firstPersonSelfShadow; },
      materialShading: base.shadingUniforms,
      get physics() { return null; }, get aircraft() { return null; }, get battlefield() { return null; }, get player() { return null; },
      get currentWeapon() { return suite.weaponId; }, set currentWeapon(id) { suite.weaponId = id; },
      currentWeaponVariant: 0,
      ApplyEnvironment: (name) => base.ApplySkyPreset(name),
      GetEnvironmentState: () => base.GetEnvironmentState(),
      RestoreEnvironmentState: (snapshot) => base.RestoreEnvironmentState(snapshot),
      GetFpsVisible: () => false, SetFpsVisible: null,
      PrepareEditor() {}, FinishEditorSession() {}, JumpToLevel() {},
    };
    return {
      renderer: base.renderer, scene: base.scene, camera: base.camera, canvas: base.canvas,
      library: base.library, lights: base.lights, post: base.post, vfx: base.vfx,
      get gi() { return base.gi; }, profiler: null,
      get physics() { return null; },
      get aircraft() { return null; },
      actorFactory: base.actorFactory, viewmodel: base.viewmodel,
      audio: base.audio,
      game,
      environment: null,
      studio: suite.studio, flycam: suite.flycam, viewport: suite.viewport,
      hideInStudio: base.viewmodel ? [base.viewmodel.root] : [],
      get playerWeaponId() { return suite.weaponId; },
      get playerWeaponVariant() { return 0; },
      SetViewmodelVisible: (on) => { if (base.viewmodel) base.viewmodel.root.visible = !!on; },
      SetHint: (text) => suite.SetHint(text),
      SetCrosshair: (on, mode = "") => suite.SetCrosshair(on, mode),
      Close: () => suite.CloseTool(),
    };
  }

  BuildDom() {
    const root = El("div");
    root.id = "edRoot";
    document.body.appendChild(root);
    this.root = root;
    const NativeActivation = (event) => {
      if ((event.key === " " || event.key === "Enter") && event.target.closest?.("button, input, select, textarea")) event.stopPropagation();
    };
    root.addEventListener("keydown", NativeActivation);

    this.hint = El("div", "edHint");
    root.appendChild(this.hint);
    this.cross = El("div", "edCross");
    this.cross.appendChild(El("span", "", "真实弹道"));
    root.appendChild(this.cross);

    const bar = El("div", "edMenuBar");
    bar.setAttribute("role", "menubar");
    bar.setAttribute("aria-label", "高级工具");
    bar.appendChild(El("div", "edMenuBrand", "高级工具"));
    const menus = El("div", "edMenus");
    bar.appendChild(menus);
    this.status = El("div", "edMenuStatus");
    bar.appendChild(this.status);
    if (this.base.audio?.SetToolsVolume) {
      this.volumeControl = ToolsVolumeControl(this.toolsVolume, () => this.SyncToolsVolume());
      bar.appendChild(this.volumeControl.root);
    }
    const back = El("button", "edMenuMainMenu", "返回控制中心");
    back.type = "button";
    back.title = "返回 AdvancedTool ControlCenter";
    back.setAttribute("aria-label", "返回控制中心");
    back.dataset.action = "control-center";
    back.addEventListener("click", () => { this.OpenMenu(null); this.Exit(); window.location.assign(new URL(this.returnUrl, document.baseURI)); });
    bar.appendChild(back);
    root.appendChild(bar);
    this.menuBar = bar;

    for (const menu of StudioMenus()) {
      const wrap = El("div", "edMenu");
      wrap.dataset.menu = menu.id;
      const title = El("button", "edMenuTitle", menu.label);
      title.type = "button";
      title.setAttribute("aria-haspopup", "menu");
      title.setAttribute("aria-expanded", "false");
      title.addEventListener("click", () => this.OpenMenu(this.openMenuId === menu.id ? null : menu.id));
      title.addEventListener("pointerenter", () => { if (this.openMenuId && this.openMenuId !== menu.id) this.OpenMenu(menu.id); });
      const drop = El("div", "edMenuDrop");
      drop.setAttribute("role", "menu");
      wrap.append(title, drop);
      menus.appendChild(wrap);
      this.menus.set(menu.id, { wrap, title, drop });
      for (const Editor of menu.items) {
        const button = El("button", "edMenuItem");
        button.type = "button";
        button.setAttribute("role", "menuitemcheckbox");
        button.appendChild(El("span", "edMenuCheck"));
        button.appendChild(El("span", "edMenuLabel", TOOL_INFO[Editor.id].label));
        button.title = TOOL_INFO[Editor.id].hint;
        button.dataset.editor = Editor.id;
        button.dataset.group = menu.id;
        button.addEventListener("click", () => { this.OpenMenu(null); this.Toggle(Editor.id); });
        drop.appendChild(button);
        this.entries.set(Editor.id, button);
      }
    }

    this._onPointerDown = (event) => {
      if (this.openMenuId && !this.menuBar.contains(event.target)) this.OpenMenu(null);
    };
    document.addEventListener("pointerdown", this._onPointerDown, true);

    const empty = Panel({ title: "未选择工具", variant: "edInspectorEmpty" });
    const art = El("div", "edEmptyArt");
    art.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 8.5h18M14.5 8.5V20"/><path d="M17 12h1.5M17 15h1.5"/></svg>';
    empty.body.appendChild(art);
    empty.body.appendChild(El("div", "edEmptyTitle", "未选择工具"));
    Note(empty.body, "从顶部菜单栏选一个工具，它的参数会显示在这里。再点一次菜单里打勾的那项、或点工作窗右上的 × 就关掉它。");
    const keys = El("div", "edEmptyKeys");
    const item = El("span");
    item.append(El("kbd", "", "Esc"), "关闭工具");
    keys.appendChild(item);
    empty.body.appendChild(keys);
    root.appendChild(empty.root);
    this.emptyInspector = empty.root;

    this.workHost = El("div");
    root.appendChild(this.workHost);

    this.inspectorToggle = El("button", "edInspectorToggle");
    this.inspectorToggle.type = "button";
    this.inspectorToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
    this.inspectorToggle.addEventListener("click", () => {
      this.OpenMenu(null);
      this.SetInspectorCollapsed(!this.inspectorCollapsed);
    });
    root.appendChild(this.inspectorToggle);
    this.inspectorCollapsed = false;
  }

  SetInspectorCollapsed(collapsed) {
    const keepFocus = document.activeElement === this.inspectorToggle;
    this.inspectorCollapsed = !!collapsed;
    const target = this.inspectorCollapsed ? this.menuBar
      : this.active ? this.inspectorElement?.querySelector(".edHead") : this.root;
    if (target && this.inspectorToggle.parentElement !== target) {
      target.insertBefore(this.inspectorToggle, target === this.menuBar ? this.menuBar.querySelector(".edMenuMainMenu") : null);
    }
    this.root.classList.toggle("inspectorCollapsed", this.inspectorCollapsed);
    const label = this.inspectorCollapsed ? "展开 Inspector" : "收起 Inspector";
    this.inspectorToggle.title = label;
    this.inspectorToggle.setAttribute("aria-label", label);
    this.inspectorToggle.setAttribute("aria-expanded", String(!this.inspectorCollapsed));
    if (keepFocus) this.inspectorToggle.focus({ preventScroll: !this.inspectorCollapsed });
  }

  OpenMenu(id) {
    this.openMenuId = id && this.menus.has(id) ? id : null;
    for (const [menuId, menu] of this.menus) {
      const open = menuId === this.openMenuId;
      menu.wrap.classList.toggle("open", open);
      menu.title.setAttribute("aria-expanded", String(open));
      if (!open) continue;
      const rect = menu.title.getBoundingClientRect();
      menu.drop.style.left = "0px";
      const width = menu.drop.offsetWidth;
      menu.drop.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - width - 4))}px`;
      menu.drop.style.top = `${this.menuBar.getBoundingClientRect().bottom}px`;
    }
  }

  SetHint(text) {
    const next = text || "";
    if (this.hint.textContent === next) return;
    this.hint.textContent = next;
    this.hint.classList.toggle("on", !!next);
  }

  SetCrosshair(on, mode = "") {
    this.cross.classList.toggle("on", !!on);
    this.cross.classList.toggle("calibration", !!on && mode === "calibration");
  }

  RefreshStatus() {
    document.body.classList.add("edToolsOpen", "edHideHud");
    this.root.classList.add("toolsOpen");
    for (const [id, button] of this.entries) {
      const on = id === this.activeId;
      button.classList.toggle("on", on);
      button.setAttribute("aria-checked", String(on));
    }
    if (this.emptyInspector) this.emptyInspector.hidden = !!this.active;
    this.inspectorToggle.hidden = this.activeId === AssetStandardsEditor.id;
    const inspector = this.workHost.querySelector(".edPanel.work:not(.assetStandards)") || this.emptyInspector;
    this.inspectorElement = inspector;
    if (!inspector.id) inspector.id = inspector === this.emptyInspector ? "edInspectorEmpty" : "edInspectorPanel";
    this.inspectorToggle.setAttribute("aria-controls", inspector.id);
    this.SetInspectorCollapsed(this.inspectorCollapsed);
    // 音效音乐编辑器要试听环境床与音乐，其余工具里背景层静音（同 EditorSuite）
    const silenceBackground = this.activeId !== AudioEditor.id;
    if (silenceBackground !== this._audioPaused) {
      this._audioPaused = silenceBackground;
      this.base.audio?.SetPaused?.(silenceBackground);
    }
    if (this.status) {
      const label = this.active ? (TOOL_INFO[this.activeId]?.label || this.activeId) : "未选择工具";
      this.status.textContent = `${label} · 独立工具宿主${this.activeId === AudioEditor.id ? " · 背景试听已启用" : ""}`;
    }
    this.SyncToolsVolume();
  }

  SyncToolsVolume() {
    const audio = this.base.audio;
    if (!audio?.SetToolsVolume) return;
    Object.assign(this.toolsVolume, LoadToolsVolume(this.toolsVolume.volume));
    this.volumeControl?.Refresh();
    audio.SetToolsVolume(ToolsVolumeLevel(this.toolsVolume));
  }

  /** 菜单里点一项：当前开着的再点一次 = 关掉。 */
  Toggle(id) {
    if (this.activeId === id) { this.CloseTool(); return null; }
    return this.Open(id);
  }

  /** 打开一个工具。任何时候只有一个活着。 */
  Open(id) {
    const Editor = EDITOR_BY_ID.get(id);
    if (!Editor) return null;
    if (this.active) this.CloseTool({ refresh: false });
    this.active = new Editor(this.editorHost);
    this.activeId = id;
    this.inspectorCollapsed = false;
    this.viewport.enabled = true;
    try {
      this.active.Enter(this.workHost);
    } catch (error) {
      console.error(`[ToolStudio] ${id} 打不开：`, error);
      this.active = null;
      this.activeId = null;
    }
    this.RefreshStatus();
    return this.active;
  }

  CloseTool({ refresh = true } = {}) {
    if (this.active) {
      try { this.active.Exit(); } catch (error) { console.error("[ToolStudio] 关闭出错：", error); }
    }
    this.active = null;
    this.activeId = null;
    this.viewport.enabled = false;
    this.SetHint("");
    this.SetCrosshair(false);
    if (refresh) this.RefreshStatus();
  }

  Exit() { this.CloseTool(); }

  BindInput() {
    const CameraMode = () => (this.active && this.active.cameraMode) || "none";
    this.viewport.OnDrag = (dx, dy, button) => {
      if (!this.active) return;
      if (this.active.OnDrag) { this.active.OnDrag(dx, dy, button); return; }
      const mode = CameraMode();
      if (mode === "studio" && this.studio.Active) this.studio.Drag(dx, dy, button);
      else if (mode === "fly") this.flycam.Look(dx, dy);
    };
    this.viewport.OnWheel = (delta) => {
      if (!this.active) return;
      if (this.active.OnWheel) { this.active.OnWheel(delta); return; }
      const mode = CameraMode();
      if (mode === "studio" && this.studio.Active) this.studio.Zoom(delta);
      else if (mode === "fly") this.flycam.speed = Math.max(1, Math.min(120, this.flycam.speed * (delta > 0 ? 0.85 : 1.18)));
    };
    this.viewport.OnClick = (event, button) => { if (this.active && this.active.OnClick) this.active.OnClick(event, button); };
    this.viewport.OnPaint = (event, button) => { if (this.active && this.active.OnPaint) this.active.OnPaint(event, button); };
    this.viewport.OnPress = (event, button) => { if (this.active && this.active.OnPress) this.active.OnPress(event, button); };

    this._onKeyDown = (event) => {
      const tag = event.target && event.target.tagName;
      const isRange = tag === "INPUT" && event.target.type === "range";
      if (!isRange && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;
      if (event.code === "Escape" && this.openMenuId) {
        this.OpenMenu(null);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.code === "Escape" && this.active) {
        this.CloseTool();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (this.active && this.active.cameraMode === "fly") this.flycam.keys.add(event.code);
    };
    this._onKeyUp = (event) => {
      if (this.active && this.active.cameraMode === "fly") this.flycam.keys.delete(event.code);
      else this.flycam.keys.delete(event.code);
    };
    this._onTab = (event) => {
      if (event.key === "Tab" && !this.root.classList.contains("off")) event.stopPropagation();
    };
    document.addEventListener("keydown", this._onTab, true);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
  }

  Update(dt) {
    if (!this.active) return;
    try {
      this.active.Update(dt);
    } catch (error) {
      console.error(`[ToolStudio] ${this.activeId} 每帧出错，已关掉：`, error);
      this.CloseTool();
    }
  }

  Dispose() {
    this.Exit();
    document.removeEventListener("pointerdown", this._onPointerDown, true);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keydown", this._onTab, true);
    document.removeEventListener("keyup", this._onKeyUp);
    this.viewport.Dispose();
    this.studio.Dispose();
    this.root.remove();
  }
}

// ---------------------------------------------------------------------------
// 页面入口
// ---------------------------------------------------------------------------

/** 一步：编辑器 → 灯光与阴影框 → 出画（同 FrameModeEditor；特效编辑器的灯光时间由它自己的预览时间定）。 */
function StepFrame(base, studio, dt) {
  studio.Update(dt);
  const vfx = studio.activeId === VfxEditor.id;
  base.Frame(dt, vfx ? { vfxPreview: true, previewTime: studio.active?.previewTime } : undefined);
}

async function Main() {
  const params = new URLSearchParams(location.search);
  const bootEl = document.getElementById("tsBoot");
  const stepEl = document.getElementById("tsBootStep");
  const barEl = document.getElementById("tsBootBar");
  const SetStep = (label, progress) => {
    if (stepEl) stepEl.textContent = label;
    if (barEl) barEl.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
  };
  const canvas = document.getElementById("view");
  try {
    const base = await CreateStudioBase({ canvas, onStep: SetStep });
    const studio = new ToolStudio(base);
    document.addEventListener("pointerdown", () => base.audio.Unlock(), { once: true, capture: true });
    const manual = params.get("manual") === "1";
    let last = performance.now();
    const Loop = (now) => {
      requestAnimationFrame(Loop);
      const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
      last = now;
      if (manual) return;
      StepFrame(base, studio, dt);
    };
    requestAnimationFrame(Loop);
    const api = {
      base, studio, ready: true,
      Open: (id) => studio.Open(id),
      Close: () => studio.CloseTool(),
      get activeId() { return studio.activeId; },
      get editor() { return studio.active; },
      StepFrames(count = 1, dt = 1 / 60) { for (let i = 0; i < count; i += 1) StepFrame(base, studio, dt); },
    };
    window.ToolStudio = api;
    bootEl?.classList.add("gone");
    const tool = params.get("tool");
    if (tool) studio.Open(tool);
  } catch (error) {
    SetStep(`启动失败：${error.message}`, 0);
    console.error(error);
    throw error;
  }
}

if (typeof document !== "undefined" && document.getElementById("tsBoot")) Main();
