// 编辑器套件的外壳：右上角那个齿轮 + 一张「各编辑器入口开关」的面板 + 调度。
//
// ## 一次只开一个
// 十个编辑器里有九个要**接管相机**（摄影棚 / 过场 / 自由飞行），
// 同时开两个的结果是两边每帧各写一次 camera.position，画面会抖。
// 所以入口面板是一排开关，但语义是「换到这一个」：开新的自动关旧的。
// 这条写在面板上，不让人猜。
//
// ## 打开编辑器 = 暂停玩法
// 与过场同一条通道：Script_Main 的 Frame() 看到 editor.Capturing 就只走
// editor.Update + 渲染，玩法（玩家、AI、特效、剧本）全停。
// 不停的话你在摄影棚里看模型的时候会被外面的日军打死 —— 这不是玩笑，
// 是把世界藏起来之后 AI 照样在算的必然结果。
//
// 同时要做三件善后：
//   1. 交还指针锁（不交的话鼠标点不到面板）；
//   2. 收起 HUD（过场自己的字幕层 .csRoot 必须留着，Timeline 要看它）；
//   3. 把键位路由闸掉（不闸的话在编辑器里按 R 会真的去装填）。
// 第 3 条在 Script_Main 的 OnAction / Guard 里判 editor.Capturing。
//
// ## 出图模式
// ?shot=1 下整棵 DOM 加 .off（display:none）——出图脚本与开机冒烟的截图里
// 不许出现任何编辑器痕迹。API 仍然在，测试可以直接调 Open()。

import { El } from "./Script_EditorUi.mjs";
import { Studio, FlyCam, ViewportInput } from "./Script_EditorStage.mjs";
import { ActorEditor } from "./Script_EditorActor.mjs";
import { WeaponEditor } from "./Script_EditorWeapon.mjs";
import { VfxEditor } from "./Script_EditorVfx.mjs";
import { TimelineEditor } from "./Script_EditorTimeline.mjs";
import { AudioEditor } from "./Script_EditorAudio.mjs";
import { SceneEditor } from "./Script_EditorScene.mjs";
import { PropLibraryEditor } from "./Script_EditorPropLibrary.mjs";
import { TerrainEditor } from "./Script_EditorTerrain.mjs";
import { SplineEditor } from "./Script_EditorSplines.mjs";
import { SamplePointEditor } from "./Script_EditorSamplePoints.mjs";
import { DestructionEditor } from "./Script_EditorDestruction.mjs";
import { DebugRenderingEditor } from "./Script_EditorDebugRendering.mjs";
import { ProfilerEditor } from "./Script_EditorProfiler.mjs";
import {
  GraphicsSettings, AudioSettings, ControlsSettings, ApplySavedSettings,
} from "./Script_EditorSettings.mjs";

/**
 * 入口表。顺序就是面板上的顺序。
 *
 * 设置与编辑器分两组：**它们不是一回事**。设置改的是玩家自己的偏好、要落盘、
 * 与这一局无关；编辑器改的是这一局的运行时状态、退出时必须还干净。
 * 摆在同一排会让人以为「画质」也是个要小心退出的东西。
 */
const SETTINGS = [ControlsSettings, GraphicsSettings, AudioSettings];
const EDITORS = [
  ActorEditor, WeaponEditor, VfxEditor, AudioEditor, TimelineEditor,
  SceneEditor, PropLibraryEditor, TerrainEditor, SplineEditor, DestructionEditor,
  SamplePointEditor,
];
const ALL = [...SETTINGS, ...EDITORS];
// 渲染调试只读地观察后处理靶，不接管相机，因此允许叠在任意一个互斥编辑器上。
// 性能剖析同理：它甚至要求玩法照跑（量的就是战斗中的帧），读数在独立窗口里。
const OVERLAYS = [DebugRenderingEditor, ProfilerEditor];

export class EditorSuite {
  /**
   * @param {object} host
   *   renderer / scene / camera / canvas / library / lights / vfx —— 渲染侧
   *   actorFactory / viewmodel / audio / cutscene             —— 各编辑器要用的系统
   *   game        { state, player, PHASES, JumpToLevel, get battlefield, get currentWeapon }
   *   ReturnToMainMenu  从暂停面板退出当前战局并打开主菜单；无主菜单的测试模式不传
   *   shot        出图模式（整棵 DOM 藏起来）
   */
  constructor(host) {
    this.host = host;
    this.shot = !!host.shot;
    this.active = null;
    this.activeId = null;
    this.overlays = new Map();
    this.panelOpen = false;
    this.entries = new Map();
    // 场景关卡与地形是两个入口，但编辑的是同一份叠加文档。只放在本 EditorSuite
    // 会话内：切换工具不丢未保存改动，真正退出工具后运行时场景仍会清干净。
    this.worldEditDocument = null;

    this.studio = new Studio({ scene: host.scene, camera: host.camera, library: host.library });
    this.flycam = new FlyCam(host.camera);
    this.viewport = new ViewportInput(host.canvas);

    this.BuildDom();
    this.BindInput();
    // 存下来的画质/音量在这一刻装回去。只在打开面板时才生效的设置不叫设置。
    try {
      ApplySavedSettings(this.editorHost);
    } catch (error) {
      console.warn("[Editor] 设置装不回去：", error);
    }
  }

  // -------------------------------------------------------------------------
  // 状态
  // -------------------------------------------------------------------------

  /** 玩法要不要停。面板开着也算 —— 它就是暂停菜单。 */
  get Capturing() { return this.panelOpen || !!this.active; }

  get ActiveId() { return this.activeId; }

  /** 各编辑器共用的宿主接口（它们只认这个对象，不认 Script_Main）。 */
  get editorHost() {
    const host = this.host;
    const suite = this;
    return {
      renderer: host.renderer, scene: host.scene, camera: host.camera, canvas: host.canvas,
      library: host.library, lights: host.lights, post: host.post, vfx: host.vfx,
      gi: host.game.gi, profiler: host.profiler,
      actorFactory: host.actorFactory, viewmodel: host.viewmodel,
      audio: host.audio, cutscene: host.cutscene, destruction: host.destruction,
      game: host.game,
      studio: suite.studio, flycam: suite.flycam, viewport: suite.viewport,
      // 摄影棚要额外藏的东西：视图模型挂在相机上，而相机是豁免的
      hideInStudio: host.viewmodel ? [host.viewmodel.root] : [],
      get playerWeaponId() { return host.game.currentWeapon; },
      get playerWeaponVariant() { return host.game.currentWeaponVariant ?? 0; },
      SetViewmodelVisible: (on) => { if (host.viewmodel) host.viewmodel.root.visible = !!on; },
      SetHint: (text) => suite.SetHint(text),
      SetCrosshair: (on, mode = "") => suite.SetCrosshair(on, mode),
      GetWorldEditDocument: () => (suite.worldEditDocument
        ? JSON.parse(JSON.stringify(suite.worldEditDocument)) : null),
      SetWorldEditDocument: (data) => {
        suite.worldEditDocument = data ? JSON.parse(JSON.stringify(data)) : null;
      },
      Close: () => suite.Close(),
      CloseDebugRendering: () => suite.CloseOverlay(DebugRenderingEditor.id),
      CloseProfiler: () => suite.CloseOverlay(ProfilerEditor.id),
      // 性能剖析在面板关着（玩法进行中）时要把自己的页面内小面板收起来
      get launcherOpen() { return suite.panelOpen; },
    };
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  BuildDom() {
    const root = El("div");
    root.id = "edRoot";
    if (this.shot) root.classList.add("off");
    document.body.appendChild(root);
    this.root = root;

    const gear = El("div", "edGear", "⚙");
    gear.title = "设置与工具（`）";
    gear.addEventListener("click", () => this.TogglePanel());
    root.appendChild(gear);
    this.gear = gear;

    this.hint = El("div", "edHint");
    root.appendChild(this.hint);
    this.cross = El("div", "edCross");
    this.cross.appendChild(El("span", "", "真实弹道"));
    root.appendChild(this.cross);

    // 入口面板
    const panel = El("div", "edPanel launcher");
    panel.style.display = "none";
    const head = El("div", "edHead");
    head.appendChild(El("div", "edTitle", "设置与工具"));
    const x = El("div", "edX", "×");
    x.addEventListener("click", () => this.TogglePanel(false));
    head.appendChild(x);
    panel.appendChild(head);
    const body = El("div", "edBody");
    panel.appendChild(body);
    root.appendChild(panel);
    this.launcher = panel;

    const Group = (title, list) => {
      const section = El("div", "edSection");
      section.appendChild(El("div", "h", title));
      const box = El("div", "b");
      for (const Editor of list) {
        const button = El("div", "edBtn wide", Editor.label);
        button.title = Editor.hint;
        // 冒烟测试按这个属性找按钮：按 nth-child 找的话，面板一分组就全错位了
        button.dataset.editor = Editor.id;
        button.addEventListener("click", () => this.Toggle(Editor.id));
        box.appendChild(button);
        this.entries.set(Editor.id, button);
      }
      section.appendChild(box);
      body.appendChild(section);
    };
    if (this.host.ReturnToMainMenu) {
      const section = El("div", "edSection");
      section.appendChild(El("div", "h", "游戏"));
      const button = El("button", "edBtn wide", "返回主菜单");
      button.type = "button";
      button.dataset.action = "main-menu";
      button.title = "放弃当前战局，回到主菜单";
      button.addEventListener("click", () => {
        // 先让编辑器归还相机、HUD 与声音，再由游戏装配层切换菜单状态。
        // 顺序反过来会让 Close() 在主菜单已经打开后又改一次暂停状态。
        this.TogglePanel(false);
        this.host.ReturnToMainMenu();
      });
      section.appendChild(button);
      body.appendChild(section);
    }
    Group("设置", SETTINGS);
    Group("渲染调试（可叠加）", OVERLAYS);
    Group("编辑器", EDITORS);

    const off = El("div", "edBtn wide danger", "全部关掉");
    off.dataset.editor = "";
    off.addEventListener("click", () => this.Close());
    body.appendChild(off);

    this.status = El("div", "edNote warn", "");
    body.appendChild(this.status);
    body.appendChild(El("div", "edNote",
      "一次只开一个：预览与编辑工具会接管相机，同时开会打架。"
      + "开着任意一个时玩法暂停（与过场同一条通道）。"));

    this.workHost = El("div");
    root.appendChild(this.workHost);
  }

  SetHint(text) {
    if (!this.hint) return;
    // 每帧都会有人来设同一句（落点提示是逐帧算的）。不比一下就写的话，
    // 每帧都在动 textContent —— 白白触发一次布局。
    const next = text || "";
    if (this.hint.textContent === next) return;
    this.hint.textContent = next;
    this.hint.classList.toggle("on", !!next);
  }

  SetCrosshair(on, mode = "") {
    if (!this.cross) return;
    this.cross.classList.toggle("on", !!on);
    this.cross.classList.toggle("calibration", !!on && mode === "calibration");
  }

  RefreshStatus() {
    for (const [id, button] of this.entries) {
      button.classList.toggle("on", id === this.activeId || this.overlays.has(id));
    }
    if (this.gear) this.gear.classList.toggle("on", this.Capturing);
    // 暂停 = 背景层也得停。玩法停了声音不停是两条独立的通道：
    // 环境床是一张自己在跑的 WebAudio 图 + 一个 400 ms 的调度器，
    // Frame() 提前返回一点也拦不住它（见 Script_Audio.SetPaused 的账）。
    // 音效音乐编辑器是唯一例外：它的工作就是在玩法暂停时试听环境床与音乐。
    // 以前这里只看 Capturing，结果一次性音效能响、两个背景层却永远被 SetPaused(true)
    // 掐掉，界面上的环境 / 音乐按钮因此只是改了名字，实际没有播放节点。
    const silenceBackground = this.Capturing && this.activeId !== AudioEditor.id;
    if (silenceBackground !== this._audioPaused) {
      this._audioPaused = silenceBackground;
      if (this.host.audio && this.host.audio.SetPaused) this.host.audio.SetPaused(silenceBackground);
    }
    if (this.status) {
      const overlayNote = this.overlays.size ? " · 渲染调试叠加中" : "";
      this.status.textContent = this.active
        ? `${this.activeId} 接管中 · 玩法已暂停${this.activeId === AudioEditor.id ? " · 背景试听已启用" : ""}${overlayNote}`
        : `玩法已暂停（面板开着）${overlayNote}`;
    }
    document.body.classList.toggle("edHideHud", !!this.active);
  }

  // -------------------------------------------------------------------------
  // 开关
  // -------------------------------------------------------------------------

  TogglePanel(force) {
    const next = force === undefined ? !this.panelOpen : !!force;
    this.panelOpen = next;
    this.launcher.style.display = next ? "flex" : "none";
    if (!next) this.Close();
    else this.host.ReleasePointerLock();
    this.RefreshStatus();
  }

  Toggle(id) {
    if (OVERLAYS.some((editor) => editor.id === id)) return this.ToggleOverlay(id);
    if (this.activeId === id) this.Close();
    else this.Open(id);
  }

  /** 叠加工具不参与 active 的互斥规则；切换场景/地形等工具时必须留下它。 */
  ToggleOverlay(id) {
    if (this.overlays.has(id)) {
      this.CloseOverlay(id);
      return null;
    }
    const Editor = OVERLAYS.find((editor) => editor.id === id);
    if (!Editor) return null;
    const overlay = new Editor(this.editorHost);
    this.overlays.set(id, overlay);
    try {
      overlay.Enter(this.workHost);
    } catch (error) {
      console.error(`[Editor] ${id} 打不开：`, error);
      this.overlays.delete(id);
      return null;
    }
    this.RefreshStatus();
    return overlay;
  }

  CloseOverlay(id) {
    const overlay = this.overlays.get(id);
    if (!overlay) return;
    try { overlay.Exit(); } catch (error) { console.error(`[Editor] 关闭 ${id} 出错：`, error); }
    this.overlays.delete(id);
    this.RefreshStatus();
  }

  /** 打开一个编辑器。**任何时候都只有一个活着。** */
  Open(id) {
    if (OVERLAYS.some((editor) => editor.id === id)) return this.ToggleOverlay(id);
    const Editor = ALL.find((e) => e.id === id);
    if (!Editor) return null;
    // 换编辑器不算结束会话，不能半路把之前的菜单重新盖回来。
    if (this.active) this.Close({ switching: true });
    // 设置可以留在暂停菜单上调；真正的编辑器必须接管整张画面。
    // 以前只有 SceneEditor 自己做这一步，构件库等摄影棚工具就会把
    // 「继续 / 设置 / 调试选项」留在背后，既像 UI 叠层又容易误以为
    // 还在游戏流程里。把交接放在所有 EDITORS 的公共入口，不能漏工具。
    if (EDITORS.includes(Editor)) this.host.game.PrepareEditor?.();
    this.panelOpen = true;
    this.launcher.style.display = "flex";
    this.host.ReleasePointerLock();
    this.active = new Editor(this.editorHost);
    this.activeId = id;
    this.viewport.enabled = true;
    try {
      this.active.Enter(this.workHost);
    } catch (error) {
      // 一个编辑器建不起来不该把游戏一起带走
      console.error(`[Editor] ${id} 打不开：`, error);
      this.active = null;
      this.activeId = null;
    }
    this.RefreshStatus();
    return this.active;
  }

  Close({ switching = false } = {}) {
    if (this.active) {
      try { this.active.Exit(); } catch (error) { console.error("[Editor] 关闭出错：", error); }
    }
    this.active = null;
    this.activeId = null;
    this.viewport.enabled = false;
    this.SetHint("");
    this.SetCrosshair(false);
    // 只有「完全关闭」才收叠加窗。编辑器之间的切换要保留 Debug Rendering。
    // keepOnClose 的叠加层（性能剖析）连完全关闭也不收：它量的就是战斗中的帧，
    // 「关面板回去打」正是它的主用例；要停就在面板里再点一次，或直接关它的窗口。
    if (!switching) {
      for (const id of [...this.overlays.keys()]) {
        const Editor = OVERLAYS.find((entry) => entry.id === id);
        if (!Editor || !Editor.keepOnClose) this.CloseOverlay(id);
      }
    }
    this.RefreshStatus();
    if (!switching) this.host.game.FinishEditorSession?.();
  }

  // -------------------------------------------------------------------------
  // 输入
  // -------------------------------------------------------------------------

  BindInput() {
    const CameraMode = () => (this.active && this.active.cameraMode) || "none";

    this.viewport.OnDrag = (dx, dy, button) => {
      if (!this.active) return;
      if (this.active.OnDrag) { this.active.OnDrag(dx, dy, button); return; }
      const mode = CameraMode();
      if (mode === "studio" && this.studio.Active) this.studio.Drag(dx, dy, button);
      // 自由飞行：左键与右键都转头（右键在场景编辑器里同时是「不放置」的那个键）
      else if (mode === "fly") this.flycam.Look(dx, dy);
    };
    this.viewport.OnWheel = (delta) => {
      if (!this.active) return;
      if (this.active.OnWheel) { this.active.OnWheel(delta); return; }
      const mode = CameraMode();
      if (mode === "studio" && this.studio.Active) this.studio.Zoom(delta);
      else if (mode === "fly") {
        this.flycam.speed = Math.max(1, Math.min(120, this.flycam.speed * (delta > 0 ? 0.85 : 1.18)));
      }
    };
    this.viewport.OnClick = (event, button) => {
      if (this.active && this.active.OnClick) this.active.OnClick(event, button);
    };
    this.viewport.OnPaint = (event, button) => {
      if (this.active && this.active.OnPaint) this.active.OnPaint(event, button);
    };
    // 按下那一刻。笔刷靠它划出「一笔」的起点 —— 只有 OnPaint 的话，
    // 按下去不动（不产生 mousemove）就什么也不会发生。
    this.viewport.OnPress = (event, button) => {
      if (this.active && this.active.OnPress) this.active.OnPress(event, button);
    };

    this._onKeyDown = (event) => {
      // 文本控件里打字不许被当成快捷键（TextArea 自己也 stopPropagation 了，
      // 这是双保险）。range 例外：滑杆点过以后会一直拿着焦点；若连它也
      // 一概拦住，场景编辑器的 WASD+QE 飞行就会在调过任一滑杆后失效。
      const tag = event.target && event.target.tagName;
      const isRange = tag === "INPUT" && event.target.type === "range";
      if (!isRange && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;
      if (event.code === "Backquote") { this.TogglePanel(); event.preventDefault(); return; }
      if (event.code === "Escape" && this.Capturing) {
        // 过场正在播的时候 Esc 归过场（跳过），别顺手把编辑器也关了
        const playing = this.host.cutscene && this.host.cutscene.Playing;
        if (!playing) {
          this.TogglePanel(false);
          event.preventDefault();
          // 暂停菜单也监听 Esc；设置关掉后不能让同一次按键继续穿透成「恢复战斗」。
          event.stopImmediatePropagation();
        }
        return;
      }
      if (this.active && this.active.cameraMode === "fly") this.flycam.keys.add(event.code);
    };
    this._onKeyUp = (event) => {
      if (this.active && this.active.cameraMode === "fly") this.flycam.keys.delete(event.code);
      else this.flycam.keys.delete(event.code);
    };
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /**
   * 叠加层的每帧。**与 Update 分开，因为它们的调用条件不一样**：
   * Update 只在 editor.Capturing 那条分支上跑（玩法停摆时），而叠加层的存在
   * 意义恰恰是"玩法照跑时也开着"。合在一起的后果是：只开 Debug Rendering、
   * 不开任何互斥编辑器时，面板里的「当前靶」一行永远是空的 —— 靶在换、
   * 屏幕在变，读数一个字都不出。所以装配层要在每一条帧路径上调它。
   */
  UpdateOverlays(dt) {
    for (const [id, overlay] of this.overlays) {
      try { overlay.Update(dt); } catch (error) {
        console.error(`[Editor] ${id} 每帧出错，已关掉：`, error);
        this.CloseOverlay(id);
      }
    }
  }

  Update(dt) {
    if (!this.active) return;
    try {
      this.active.Update(dt);
    } catch (error) {
      console.error(`[Editor] ${this.activeId} 每帧出错，已关掉：`, error);
      this.Close();
    }
  }

  Dispose() {
    this.Close();
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    this.viewport.Dispose();
    this.studio.Dispose();
    if (this.root) this.root.remove();
  }
}

export default EditorSuite;
