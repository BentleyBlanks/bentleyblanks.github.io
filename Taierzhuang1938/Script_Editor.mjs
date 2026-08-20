// 编辑器套件的外壳：右上角那个齿轮 + 一张「各编辑器入口开关」的面板 + 调度。
//
// ## 一次只开一个
// 五个编辑器里有四个要**接管相机**（摄影棚 / 过场 / 自由飞行），
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
import { TimelineEditor } from "./Script_EditorTimeline.mjs";
import { AudioEditor } from "./Script_EditorAudio.mjs";
import { SceneEditor } from "./Script_EditorScene.mjs";
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
const EDITORS = [ActorEditor, WeaponEditor, AudioEditor, TimelineEditor, SceneEditor];
const ALL = [...SETTINGS, ...EDITORS];

export class EditorSuite {
  /**
   * @param {object} host
   *   renderer / scene / camera / canvas / library / lights   —— 渲染侧
   *   actorFactory / viewmodel / audio / cutscene             —— 各编辑器要用的系统
   *   game        { state, player, PHASES, JumpToLevel, get battlefield, get currentWeapon }
   *   shot        出图模式（整棵 DOM 藏起来）
   */
  constructor(host) {
    this.host = host;
    this.shot = !!host.shot;
    this.active = null;
    this.activeId = null;
    this.panelOpen = false;
    this.entries = new Map();

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
      library: host.library, lights: host.lights, post: host.post,
      actorFactory: host.actorFactory, viewmodel: host.viewmodel,
      audio: host.audio, cutscene: host.cutscene,
      game: host.game,
      studio: suite.studio, flycam: suite.flycam, viewport: suite.viewport,
      // 摄影棚要额外藏的东西：视图模型挂在相机上，而相机是豁免的
      hideInStudio: host.viewmodel ? [host.viewmodel.root] : [],
      get playerWeaponId() { return host.game.currentWeapon; },
      SetViewmodelVisible: (on) => { if (host.viewmodel) host.viewmodel.root.visible = !!on; },
      SetHint: (text) => suite.SetHint(text),
      SetCrosshair: (on) => suite.SetCrosshair(on),
      Close: () => suite.Close(),
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
    Group("设置", SETTINGS);
    Group("编辑器", EDITORS);

    const off = El("div", "edBtn wide danger", "全部关掉");
    off.dataset.editor = "";
    off.addEventListener("click", () => this.Close());
    body.appendChild(off);

    this.status = El("div", "edNote warn", "");
    body.appendChild(this.status);
    body.appendChild(El("div", "edNote",
      "一次只开一个：四个编辑器都要接管相机，同时开会打架。"
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

  SetCrosshair(on) {
    if (this.cross) this.cross.classList.toggle("on", !!on);
  }

  RefreshStatus() {
    for (const [id, button] of this.entries) button.classList.toggle("on", id === this.activeId);
    if (this.gear) this.gear.classList.toggle("on", this.Capturing);
    // 暂停 = 背景层也得停。玩法停了声音不停是两条独立的通道：
    // 环境床是一张自己在跑的 WebAudio 图 + 一个 400 ms 的调度器，
    // Frame() 提前返回一点也拦不住它（见 Script_Audio.SetPaused 的账）。
    const capturing = this.Capturing;
    if (capturing !== this._audioPaused) {
      this._audioPaused = capturing;
      if (this.host.audio && this.host.audio.SetPaused) this.host.audio.SetPaused(capturing);
    }
    if (this.status) {
      this.status.textContent = this.active
        ? `${this.activeId} 接管中 · 玩法已暂停`
        : "玩法已暂停（面板开着）";
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
    if (this.activeId === id) this.Close();
    else this.Open(id);
  }

  /** 打开一个编辑器。**任何时候都只有一个活着。** */
  Open(id) {
    const Editor = ALL.find((e) => e.id === id);
    if (!Editor) return null;
    if (this.active) this.Close();
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

  Close() {
    if (this.active) {
      try { this.active.Exit(); } catch (error) { console.error("[Editor] 关闭出错：", error); }
    }
    this.active = null;
    this.activeId = null;
    this.viewport.enabled = false;
    this.SetHint("");
    this.SetCrosshair(false);
    this.RefreshStatus();
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
      // 输入框里打字不许被当成快捷键（TextArea 自己也 stopPropagation 了，这是双保险）
      const tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.code === "Backquote") { this.TogglePanel(); event.preventDefault(); return; }
      if (event.code === "Escape" && this.Capturing) {
        // 过场正在播的时候 Esc 归过场（跳过），别顺手把编辑器也关了
        const playing = this.host.cutscene && this.host.cutscene.Playing;
        if (!playing) { this.TogglePanel(false); event.preventDefault(); }
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
