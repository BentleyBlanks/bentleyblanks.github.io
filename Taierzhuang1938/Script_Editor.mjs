// 高级工具（编辑器套件）的外壳：Unity 式的顶部菜单栏 + 右侧 Inspector + 调度。
//
// ## 开发工具，打包时整组剔除
// 运行时只经 Script_DevTools.mjs 建这个套件（剔除版返回 null）。玩家设置（画面 / 声音 /
// 操作）不在这里，归 Script_SettingsHost；「Debug工具」那几个叠加层的代码仍在这里，
// 但入口挪到了菜单 设置 → Debug工具（DebugToolStates / ToggleDebugTool），菜单栏里不再列。
//
// ## 一次只开一个
// 互斥编辑器里多数要**接管相机**（摄影棚 / 过场 / 自由飞行），
// 同时开两个的结果是两边每帧各写一次 camera.position，画面会抖。
// 所以菜单栏里的工具语义是「换到这一个」：开新的自动关旧的；再点一次当前那个就关掉它。
// 关掉当前工具（Inspector 上的 ×）只回到空 Inspector，不退出高级工具；
// 退出走菜单栏右端 ×、Esc 或 `。
//
// ## 打开高级工具 = 暂停玩法
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

import { El, Panel, Note } from "./Script_EditorUi.mjs";
import { DEBUG_TOOL_IDS } from "./Data_DevTools.mjs";
import { T } from "./Script_Text.mjs";
import { Studio, FlyCam, ViewportInput } from "./Script_EditorStage.mjs";
import { ActorEditor } from "./Script_EditorActor.mjs";
import { FacialEditor } from "./Script_EditorFacial.mjs";
import { WeaponEditor } from "./Script_EditorWeapon.mjs";
import { FirstPersonEditor } from "./Script_EditorFirstPerson.mjs";
import { FirstPersonMotionEditor } from "./Script_EditorFirstPersonMotion.mjs";
import { VfxEditor } from "./Script_EditorVfx.mjs";
import { TimelineEditor } from "./Script_EditorTimeline.mjs";
import { AudioEditor } from "./Script_EditorAudio.mjs";
import { PropLibraryEditor } from "./Script_EditorPropLibrary.mjs";
import { AssetStandardsEditor } from "./Script_EditorAssetStandards.mjs";
import { PropPcgEditor } from "./Script_EditorPropPcg.mjs";
import { SplineEditor } from "./Script_EditorSplines.mjs";
import { ShotCameraEditor } from "./Script_EditorShotCamera.mjs";
import { DebugRenderingEditor } from "./Script_EditorDebugRendering.mjs";
import { WorldInfoEditor } from "./Script_EditorWorldInfo.mjs";
import { PlayerStateEditor } from "./Script_EditorPlayerState.mjs";
import { ProfilerEditor } from "./Script_EditorProfiler.mjs";
import { FrameDebuggerEditor } from "./Script_EditorFrameDebugger.mjs";
import { AiEditor } from "./Script_EditorAi.mjs";
import { SquadMarchEditor } from "./Script_EditorSquadMarch.mjs";
import { TextureEditor } from "./Script_EditorTextures.mjs";
import { BlockoutEntry } from "./Script_EditorBlockoutEntry.mjs";
import { SceneEditorEntry } from "./Script_EditorSceneEntry.mjs";
import { ToolsHome } from "./Script_EditorHome.mjs";
import { LoadToolsVolume, ToolsVolumeControl, ToolsVolumeLevel } from "./Script_EditorVolume.mjs";

/** 互斥编辑器：接管画面（多数还接管相机），任何时候只有一个活着。 */
const EDITORS = [
  ActorEditor, FacialEditor, SquadMarchEditor, WeaponEditor, FirstPersonEditor, VfxEditor, AudioEditor,
  PropLibraryEditor, AssetStandardsEditor, PropPcgEditor, SplineEditor,
  // 出图脚本与测试用的定镜小工具（不在任何菜单里，见 Script_EditorShotCamera 文件头）
  ShotCameraEditor,
];
// 叠加层：不接管相机、不参与互斥，可以叠在任意一个编辑器上，也可以关掉菜单回去边打边看。
// 渲染调试只读地观察后处理靶；性能剖析甚至要求玩法照跑（量的就是战斗中的帧），读数在独立窗口里。
// 第一人称持枪移动检查（2026-10-23）也是叠加层：玩法照跑、外部机位边走边看，所以不能是暂停玩法的互斥编辑器；
// 它是在「武器」菜单里找的东西，不进 Debug工具 列表。
const OVERLAYS = [DebugRenderingEditor, ProfilerEditor, FrameDebuggerEditor, WorldInfoEditor, PlayerStateEditor, AiEditor,
  FirstPersonMotionEditor];
// 「Debug工具」= 除第一人称持枪移动检查外的叠加层，外加 FPS 显示（Data_DevTools.DEBUG_TOOL_IDS 定顺序）。两处入口开关同一份状态：
// 菜单 设置 → Debug工具，和高级工具菜单栏右侧、音量条旁边的「Debug工具」下拉（2026-10-22，用户：高级工具里也要能开
// Profiler / Debug Rendering / Frame Debugger）。
const DEBUG_OVERLAYS = OVERLAYS.filter((editor) => editor !== FirstPersonMotionEditor);
// Debug工具里弹独立浏览器窗口的几项，下拉条目后缀 ↗（同 WINDOW_TOOLS）
const DEBUG_WINDOW_TOOLS = new Set([ProfilerEditor.id, FrameDebuggerEditor.id, WorldInfoEditor.id, PlayerStateEditor.id]);

/**
 * 菜单栏。顺序就是栏上的顺序；每个工具只登记一次（同一项画两遍就有两处开关）。
 * 「游戏」菜单（退出、回主菜单）不在这张表里，由 BuildDom 单独画。
 * 带 window 标记的项打开的是独立窗口，条目后缀 ↗。
 */
const TOOL_MENUS = [
  // 场景编辑器打开独立窗口 SceneEditor.html（摆 Scenes/ 场景文件，docs/Data_Scene.md §6），同贴图管理不进互斥表。
  { id: "scene", label: "场景", items: [SceneEditorEntry, SplineEditor, PropPcgEditor] },
  // 白盒关卡编辑器只是一个跳转入口（整页换成 ?editor=blockout），同贴图管理一样不进互斥表。
  { id: "level", label: "关卡", items: [BlockoutEntry, TimelineEditor, SquadMarchEditor] },
  { id: "character", label: "角色", items: [ActorEditor, FacialEditor] },
  { id: "weapon", label: "武器", items: [WeaponEditor, FirstPersonEditor, FirstPersonMotionEditor] },
  { id: "media", label: "特效与声音", items: [VfxEditor, AudioEditor] },
  { id: "assets", label: "资产", items: [PropLibraryEditor, AssetStandardsEditor, TextureEditor] },
];
const WINDOW_TOOLS = new Set([TextureEditor.id, SceneEditorEntry.id]);

export class EditorSuite {
  /**
   * @param {object} host
   *   renderer / scene / camera / canvas / library / lights / vfx —— 渲染侧
   *   actorFactory / viewmodel / audio / cutscene             —— 各编辑器要用的系统
   *   game        { state, player, PHASES, JumpToLevel, get battlefield, get currentWeapon }
   *   ReturnToMainMenu  从高级工具退出当前战局并打开主菜单；无主菜单的测试模式不传
   *   SettingsOpen      玩家设置页开着时返回 true（那时 ` 不开高级工具）
   *   shot        出图模式（整棵 DOM 藏起来）
   */
  constructor(host) {
    this.host = host;
    this.shot = !!host.shot;
    this.active = null;
    this.activeId = null;
    this.overlays = new Map();
    this.panelOpen = false;
    this.inspectorCollapsed = false;
    this.entries = new Map();
    this.debugEntries = new Map();
    this.menus = new Map();
    this.openMenuId = null;
    this.hidden = false;
    // 高级工具自己的音量（Script_EditorVolume）：开着高级工具时盖过玩家的总音量，退出就还回去
    this.toolsVolume = LoadToolsVolume(host.audio?.masterVolume ?? 1);

    // actorFactory 传给摄影棚不是为了造人（造人的是各编辑器自己），
    // 是为了在藏世界的同时把人物合批关掉 —— 见 Studio.SetActorBatch 那段事故账。
    this.studio = new Studio({
      scene: host.scene, camera: host.camera, library: host.library,
      actorFactory: host.actorFactory,
    });
    this.flycam = new FlyCam(host.camera);
    this.viewport = new ViewportInput(host.canvas);

    this.BuildDom();
    this.BindInput();
    this.RefreshStatus();
  }

  // -------------------------------------------------------------------------
  // 状态
  // -------------------------------------------------------------------------

  /** 玩法要不要停。高级工具开着也算 —— 空 Inspector 时也是暂停。 */
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
      // 物理走取值器：换关会整个重建 PhysicsWorld，Debug Rendering 的碰撞体层每帧要认的是当前那个
      get physics() { return host.game.physics ?? null; },
      // 机队同理走取值器（白盒预演的飞机借它的模型克隆）
      get aircraft() { return host.game.aircraft ?? null; },
      actorFactory: host.actorFactory, viewmodel: host.viewmodel,
      audio: host.audio,
      game: host.game,
      studio: suite.studio, flycam: suite.flycam, viewport: suite.viewport,
      // 摄影棚要额外藏的东西：视图模型挂在相机上，而相机是豁免的
      hideInStudio: host.viewmodel ? [host.viewmodel.root] : [],
      get playerWeaponId() { return host.game.currentWeapon; },
      get playerWeaponVariant() { return host.game.currentWeaponVariant ?? 0; },
      SetViewmodelVisible: (on) => { if (host.viewmodel) host.viewmodel.root.visible = !!on; },
      SetHint: (text) => suite.SetHint(text),
      SetCrosshair: (on, mode = "") => suite.SetCrosshair(on, mode),
      // 工作窗自己的 ×：只关这个工具，回到空 Inspector，不退出高级工具
      Close: () => suite.CloseTool(),
      CloseDebugRendering: () => suite.CloseOverlay(DebugRenderingEditor.id),
      CloseProfiler: () => suite.CloseOverlay(ProfilerEditor.id),
      CloseFrameDebugger: () => suite.CloseOverlay(FrameDebuggerEditor.id),
      CloseWorldInfo: () => suite.CloseOverlay(WorldInfoEditor.id),
      ClosePlayerState: () => suite.CloseOverlay(PlayerStateEditor.id),
      CloseAi: () => suite.CloseOverlay(AiEditor.id),
      CloseFirstPersonMotion: () => suite.CloseOverlay(FirstPersonMotionEditor.id),
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
    // 原生按钮的 Space / Enter 留给浏览器，不能被世界键位表吞掉。
    const NativeActivation = event => {
      if ((event.key === " " || event.key === "Enter") && event.target.closest?.("button, input, select, textarea")) event.stopPropagation();
    };
    root.addEventListener("keydown", NativeActivation);

    const gear = El("button", "edGear");
    gear.type = "button";
    gear.title = "高级工具（`）";
    gear.setAttribute("aria-label", "高级工具");
    gear.addEventListener("click", () => this.TogglePanel());
    root.appendChild(gear);
    this.gear = gear;

    this.hint = El("div", "edHint");
    root.appendChild(this.hint);
    this.cross = El("div", "edCross");
    this.cross.appendChild(El("span", "", "真实弹道"));
    root.appendChild(this.cross);

    // --- 顶部菜单栏 ---------------------------------------------------------
    const bar = El("div", "edMenuBar");
    bar.setAttribute("role", "menubar");
    bar.setAttribute("aria-label", "高级工具");
    bar.appendChild(El("div", "edMenuBrand", "高级工具"));
    const menus = El("div", "edMenus");
    bar.appendChild(menus);
    this.status = El("div", "edMenuStatus");
    bar.appendChild(this.status);
    // Debug工具下拉跟音量条挨着放在右边：这两样不属于哪个工具，开着哪个工具都可能要用
    const debugSlot = El("div", "edMenus edMenusRight");
    bar.appendChild(debugSlot);
    if (this.host.audio?.SetToolsVolume) {
      this.volumeControl = ToolsVolumeControl(this.toolsVolume, () => this.SyncToolsVolume());
      bar.appendChild(this.volumeControl.root);
    }
    // 最右两颗分开管（2026-10-22，用户：一个 × 既像关工具又是退出，看不懂）：
    // × 只关当前工具、留在高级工具里，没开工具时藏起来；⏻ 才是退出高级工具。
    const closeTool = El("button", "edMenuCloseTool", "×");
    closeTool.type = "button";
    closeTool.title = "关闭当前工具（留在高级工具里）";
    closeTool.setAttribute("aria-label", "关闭当前工具");
    closeTool.addEventListener("click", () => this.CloseTool());
    bar.appendChild(closeTool);
    this.closeToolButton = closeTool;
    const exit = El("button", "edMenuExit");
    exit.type = "button";
    exit.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.3 5.6a6.2 6.2 0 1 0 7.4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
      + '<path d="M10 2.6v7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    exit.title = "退出高级工具（Esc / `）";
    exit.setAttribute("aria-label", "退出高级工具");
    exit.addEventListener("click", () => this.TogglePanel(false));
    bar.appendChild(exit);
    root.appendChild(bar);
    this.menuBar = bar;

    const Menu = (id, label, parent = menus) => {
      const wrap = El("div", "edMenu");
      wrap.dataset.menu = id;
      const title = El("button", "edMenuTitle", label);
      title.type = "button";
      title.setAttribute("aria-haspopup", "menu");
      title.setAttribute("aria-expanded", "false");
      title.addEventListener("click", () => this.OpenMenu(this.openMenuId === id ? null : id));
      // 菜单栏惯例：已经展开一个的时候，鼠标滑到隔壁标题就换过去，不用再点
      title.addEventListener("pointerenter", () => { if (this.openMenuId && this.openMenuId !== id) this.OpenMenu(id); });
      const drop = El("div", "edMenuDrop");
      drop.setAttribute("role", "menu");
      wrap.append(title, drop);
      parent.appendChild(wrap);
      this.menus.set(id, { wrap, title, drop });
      return drop;
    };
    const Item = (drop, label, onClick, { hint = "", window = false, role = "menuitem" } = {}) => {
      const button = El("button", "edMenuItem");
      button.type = "button";
      button.setAttribute("role", role);
      button.appendChild(El("span", "edMenuCheck"));
      button.appendChild(El("span", "edMenuLabel", label));
      if (window) button.appendChild(El("span", "edMenuTail", "↗"));
      if (hint) button.title = hint;
      button.addEventListener("click", () => { this.OpenMenu(null); onClick(); });
      drop.appendChild(button);
      return button;
    };

    const game = Menu("game", "游戏");
    this.closeToolItem = Item(game, "关闭当前工具", () => this.CloseTool(), { hint: "关掉 Inspector 里的工具，留在高级工具里" });
    this.closeToolItem.dataset.action = "close-tool";
    if (this.host.ReturnToMainMenu) {
      const mainMenu = Item(game, "返回主菜单", () => {
        // 先让编辑器归还相机、HUD 与声音，再由游戏装配层切换菜单状态。
        // 顺序反过来会让退出时在主菜单已经打开后又改一次暂停状态。
        this.TogglePanel(false);
        this.host.ReturnToMainMenu();
      }, { hint: "放弃当前战局，回到主菜单" });
      mainMenu.dataset.action = "main-menu";
    }
    const quit = Item(game, "退出高级工具", () => this.TogglePanel(false), { hint: "Esc / `" });
    quit.dataset.action = "exit-tools";

    for (const menu of TOOL_MENUS) {
      const drop = Menu(menu.id, menu.label);
      for (const Editor of menu.items) {
        const button = Item(drop, Editor.label, () => this.Toggle(Editor.id),
          { hint: Editor.hint, window: WINDOW_TOOLS.has(Editor.id), role: "menuitemcheckbox" });
        // 冒烟测试按这个属性找条目：按 nth-child 找的话，菜单一调整顺序就全错位了
        button.dataset.editor = Editor.id;
        button.dataset.group = menu.id;
        this.entries.set(Editor.id, button);
      }
    }

    // Debug工具：与 设置 → Debug工具 同一套条目、同一份文案（Data_Text_Menu 的 menu.debugTools.*）
    if (DEBUG_TOOL_IDS.length) {
      const debugDrop = Menu("debug", "Debug工具", debugSlot);
      for (const id of DEBUG_TOOL_IDS) {
        const button = Item(debugDrop, T(`menu.debugTools.${id}.label`), () => this.ToggleDebugToolFromMenu(id),
          { hint: T(`menu.debugTools.${id}.note`), window: DEBUG_WINDOW_TOOLS.has(id), role: "menuitemcheckbox" });
        button.dataset.debugTool = id;
        this.debugEntries.set(id, button);
      }
    }

    // 点菜单栏以外的地方收起下拉（捕获阶段：画布上的拖拽 / 笔刷也要先收菜单）
    this._onPointerDown = (event) => {
      if (this.openMenuId && !this.menuBar.contains(event.target)) this.OpenMenu(null);
    };
    document.addEventListener("pointerdown", this._onPointerDown, true);

    // --- Inspector 空态 ------------------------------------------------------
    // 选了工具之后，各编辑器自己的工作窗（.edPanel.work）停在同一个位置，样式见 Style_Editor.css。
    // 不带 .work：测试与出图脚本按 .edPanel.work 找「当前工具的工作窗」，空态不该被数进去。
    const empty = Panel({ title: "未选择工具", variant: "edInspectorEmpty" });
    const art = El("div", "edEmptyArt");
    art.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 8.5h18M14.5 8.5V20"/><path d="M17 12h1.5M17 15h1.5"/></svg>';
    empty.body.appendChild(art);
    empty.body.appendChild(El("div", "edEmptyTitle", "未选择工具"));
    Note(empty.body, "从顶部菜单栏选一个工具，它的参数会显示在这里。再点一次菜单里打勾的那项、或点右上的 × 就关掉它。");
    Note(empty.body, "Debug Rendering、Profiler、Frame Debugger、WorldInfo、玩家状态、敌军 AI 与 FPS 显示在菜单栏右边的「Debug工具」里（设置 → Debug工具 是同一套开关）。");
    const keys = El("div", "edEmptyKeys");
    for (const [key, text] of [["`", "打开 / 退出"], ["Esc", "退出"]]) {
      const item = El("span");
      item.append(El("kbd", "", key), text);
      keys.appendChild(item);
    }
    empty.body.appendChild(keys);
    root.appendChild(empty.root);
    this.emptyInspector = empty.root;

    // --- 工具首页（?editor=tools 不带关卡）：整页代替空 Inspector ----------------
    this.home = this.host.home ? new ToolsHome({
      menus: TOOL_MENUS, windowTools: WINDOW_TOOLS, onOpen: (id) => this.Open(id),
    }) : null;
    if (this.home) root.appendChild(this.home.root);

    this.workHost = El("div");
    root.appendChild(this.workHost);

    // 展开时与关闭按钮并排，收起后留在画面右上角；不退出或重建当前工具。
    this.inspectorToggle = El("button", "edInspectorToggle");
    this.inspectorToggle.type = "button";
    this.inspectorToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
    this.inspectorToggle.addEventListener("click", () => {
      this.OpenMenu(null);
      this.SetInspectorCollapsed(!this.inspectorCollapsed);
    });
    root.appendChild(this.inspectorToggle);
  }

  SetInspectorCollapsed(collapsed) {
    const keepFocus = document.activeElement === this.inspectorToggle;
    this.inspectorCollapsed = !!collapsed;
    const target = this.inspectorCollapsed ? this.menuBar
      : this.active ? this.inspectorElement?.querySelector(".edHead") : this.root;
    if (target && this.inspectorToggle.parentElement !== target) {
      target.insertBefore(this.inspectorToggle, target === this.menuBar ? this.menuBar.querySelector(".edMenuCloseTool") : null);
    }
    this.root.classList.toggle("inspectorCollapsed", this.inspectorCollapsed);
    const label = this.inspectorCollapsed ? "展开 Inspector" : "收起 Inspector";
    this.inspectorToggle.title = label;
    this.inspectorToggle.setAttribute("aria-label", label);
    this.inspectorToggle.setAttribute("aria-expanded", String(!this.inspectorCollapsed));
    if (keepFocus) this.inspectorToggle.focus({ preventScroll: !this.inspectorCollapsed });
  }

  /** Debug工具下拉的勾选与置灰。FPS 显示也能从设置页改，所以每次展开下拉再对一遍。 */
  RefreshDebugMenu() {
    if (!this.debugEntries.size) return;
    for (const tool of this.DebugToolStates()) {
      const button = this.debugEntries.get(tool.id);
      if (!button) continue;
      button.classList.toggle("on", !!tool.on);
      button.setAttribute("aria-checked", String(!!tool.on));
      button.disabled = !tool.available;
    }
  }

  /** 展开一个下拉菜单；null = 全部收起。 */
  OpenMenu(id) {
    this.openMenuId = id && this.menus.has(id) ? id : null;
    if (this.openMenuId === "debug") this.RefreshDebugMenu();
    for (const [menuId, menu] of this.menus) {
      const open = menuId === this.openMenuId;
      menu.wrap.classList.toggle("open", open);
      menu.title.setAttribute("aria-expanded", String(open));
      if (!open) continue;
      // 下拉用 fixed 定位：窄屏菜单栏要横向滚动，absolute 的下拉会被裁掉
      const rect = menu.title.getBoundingClientRect();
      menu.drop.style.left = "0px";
      const width = menu.drop.offsetWidth;
      menu.drop.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - width - 4))}px`;
      menu.drop.style.top = `${this.menuBar.getBoundingClientRect().bottom}px`;
    }
  }

  /** 藏起整个开发工具层（主菜单 / 暂停菜单开着时）。出图模式恒藏。 */
  SetHidden(hidden) {
    this.hidden = !!hidden;
    if (this.hidden) this.OpenMenu(null);
    this.root.classList.toggle("off", this.hidden || this.shot);
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
    document.body.classList.toggle("edToolsOpen", this.panelOpen);
    this.root.classList.toggle("toolsOpen", this.panelOpen);
    for (const [id, button] of this.entries) {
      const on = id === this.activeId || this.overlays.has(id) || (id === BlockoutEntry.id && BlockoutEntry.Active());
      button.classList.toggle("on", on);
      button.setAttribute("aria-checked", String(on));
    }
    this.RefreshDebugMenu();
    if (this.closeToolItem) this.closeToolItem.disabled = !this.active;
    if (this.closeToolButton) this.closeToolButton.hidden = !this.active;
    if (this.gear) this.gear.classList.toggle("on", this.Capturing);
    const homeShown = !!this.home && this.panelOpen && !this.active;
    this.home?.Show(homeShown);
    this.root.classList.toggle("homeShown", homeShown);
    if (this.emptyInspector) this.emptyInspector.hidden = !this.panelOpen || !!this.active || !!this.home;
    this.inspectorToggle.hidden = !this.panelOpen || homeShown || this.activeId === AssetStandardsEditor.id;
    const inspector = this.workHost.querySelector(".edPanel.work:not(.debugRendering):not(.ai):not(.assetStandards)") || this.emptyInspector;
    this.inspectorElement = inspector;
    if (!inspector.id) inspector.id = inspector === this.emptyInspector ? "edInspectorEmpty" : "edInspectorPanel";
    this.inspectorToggle.setAttribute("aria-controls", inspector.id);
    this.SetInspectorCollapsed(this.inspectorCollapsed);
    if (!this.panelOpen) this.OpenMenu(null);
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
      const label = this.active ? (EDITORS.find((editor) => editor.id === this.activeId)?.label || this.activeId) : "未选择工具";
      const overlayNote = this.overlays.size ? ` · 叠加 ${this.overlays.size} 个` : "";
      this.status.textContent = `${label} · 玩法已暂停${this.activeId === AudioEditor.id ? " · 背景试听已启用" : ""}${overlayNote}`;
    }
    // 高级工具是一整张工作台：开着就收 HUD（空 Inspector 时也收）。
    document.body.classList.toggle("edHideHud", this.panelOpen || !!this.active);
    this.SyncToolsVolume();
  }

  /**
   * 高级工具开着（或有工具在跑）、或者就在白盒编辑器页面里：总线用工具自己的音量；否则还给玩家的总音量。
   * 白盒编辑器右上角也有一条（同一份存档），这里先读回存档再推，两条显示一致。
   */
  SyncToolsVolume() {
    const audio = this.host.audio;
    if (!audio?.SetToolsVolume) return;
    const toolsPage = this.Capturing || BlockoutEntry.Active();
    if (toolsPage) { Object.assign(this.toolsVolume, LoadToolsVolume(this.toolsVolume.volume)); this.volumeControl?.Refresh(); }
    audio.SetToolsVolume(toolsPage ? ToolsVolumeLevel(this.toolsVolume) : null);
  }

  // -------------------------------------------------------------------------
  // 开关
  // -------------------------------------------------------------------------

  /** 打开 / 退出高级工具。退出 = 关掉当前工具 + 收起非常驻叠加层 + 回到来的那一层菜单。 */
  TogglePanel(force) {
    const next = force === undefined ? !this.panelOpen : !!force;
    if (next) {
      // 工作台接管整张画面：从主菜单 / 暂停菜单进来时先把菜单交接掉（返回层由装配层记着）。
      if (!this.panelOpen) {
        this.host.game.PrepareEditor?.();
        this.inspectorCollapsed = false;
      }
      this.panelOpen = true;
      this.host.ReleasePointerLock();
      this.RefreshStatus();
      return;
    }
    this.Exit();
  }

  /** 菜单栏里点一项。当前开着的那项再点一次 = 关掉它。 */
  Toggle(id) {
    if (id === TextureEditor.id || id === SceneEditorEntry.id || id === BlockoutEntry.id || id === TimelineEditor.id) return this.Open(id);
    // 工具首页没有关卡：场景类工具先回首页问「载入哪一关」
    if (this.home?.NeedsLevel(id)) {
      if (this.active) this.CloseTool();
      this.home.PickById(id);
      return null;
    }
    if (OVERLAYS.some((editor) => editor.id === id)) return this.ToggleOverlay(id);
    if (this.activeId === id) { this.CloseTool(); return null; }
    return this.Open(id);
  }

  /** 叠加工具不参与 active 的互斥规则；切换场景/地形等工具时必须留下它。 */
  ToggleOverlay(id) {
    if (id !== FrameDebuggerEditor.id && this.host.game.FrameDebugger?.frozen) this.host.game.FrameDebugger.Resume();
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
      this.overlayError = error?.message || String(error);
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

  // -------------------------------------------------------------------------
  // Debug工具（菜单 设置 → Debug工具 那一页用）
  // -------------------------------------------------------------------------

  /** 每项的开关状态。available=false 的项在菜单里置灰。 */
  DebugToolStates() {
    return DEBUG_TOOL_IDS.map((id) => {
      if (id === "fps") {
        return { id, on: this.host.game.GetFpsVisible?.() ?? true, available: !!this.host.game.SetFpsVisible };
      }
      return { id, on: this.overlays.has(id), available: DEBUG_OVERLAYS.some((editor) => editor.id === id) };
    });
  }

  /** 开关一项，返回开关之后的全表（浮窗被浏览器拦下时那一项仍是关）。 */
  ToggleDebugTool(id) {
    if (id === "fps") {
      const current = this.host.game.GetFpsVisible?.() ?? true;
      this.host.game.SetFpsVisible?.(!current);
    } else if (DEBUG_OVERLAYS.some((editor) => editor.id === id)) {
      this.ToggleOverlay(id);
    }
    return this.DebugToolStates();
  }

  /**
   * 菜单栏「Debug工具」下拉里点一项。独立窗口被浏览器拦下时 ToggleOverlay 只在控制台报错，
   * 人在菜单里点了却什么都没出来 —— 这里把原因写到画面顶上的提示行，几秒后自己收掉。
   */
  ToggleDebugToolFromMenu(id) {
    const wasOn = this.overlays.has(id);
    this.overlayError = "";
    this.ToggleDebugTool(id);
    this.RefreshStatus();
    if (wasOn || this.overlays.has(id) || !this.overlayError) return;
    const text = this.overlayError; // 各工具自己的报错已经带名字（「Profiler 独立窗口被浏览器弹窗拦截……」）
    this.SetHint(text);
    clearTimeout(this.overlayErrorTimer);
    this.overlayErrorTimer = setTimeout(() => { if (this.hint?.textContent === text) this.SetHint(""); }, 5000);
  }

  // -------------------------------------------------------------------------
  // 互斥编辑器
  // -------------------------------------------------------------------------

  /** 打开一个编辑器。**任何时候都只有一个活着。** */
  Open(id) {
    if (id === TextureEditor.id) {
      try { return TextureEditor.Open(); }
      catch (error) { this.SetHint(error.message); return null; }
    }
    if (id === SceneEditorEntry.id) {
      try { return SceneEditorEntry.Open(); }
      catch (error) { this.SetHint(error.message); return null; }
    }
    // 白盒关卡编辑器：整页跳到 ?editor=blockout；已经在里面就什么也不做（按钮亮着表示当前项）。
    if (id === BlockoutEntry.id) {
      try { return BlockoutEntry.Open(); }
      catch (error) { this.SetHint(error.message); return null; }
    }
    // Timeline 过场：同上是跳转入口（白盒编辑器 + 底部 Timeline 面板）；已经在白盒编辑器里就只开面板。
    if (id === TimelineEditor.id) {
      try { return TimelineEditor.Open(); }
      catch (error) { this.SetHint(error.message); return null; }
    }
    if (OVERLAYS.some((editor) => editor.id === id)) return this.ToggleOverlay(id);
    const Editor = EDITORS.find((e) => e.id === id);
    if (!Editor) return null;
    if (this.host.game.FrameDebugger?.frozen) this.host.game.FrameDebugger.Resume();
    // 换编辑器不算结束会话，不能半路把之前的菜单重新盖回来。
    if (this.active) this.CloseTool({ refresh: false });
    // 真正的编辑器必须接管整张画面：主菜单本身有运镜，暂停菜单有「继续 / 设置 / 调试选项」，
    // 都不该和编辑器叠在同一张画面上。以前只有旧的场景关卡编辑器自己做这一步，构件库等摄影棚工具
    // 就会把暂停菜单留在背后。交接放在公共入口，不能漏工具。
    this.host.game.PrepareEditor?.();
    this.panelOpen = true;
    this.host.ReleasePointerLock();
    this.active = new Editor(this.editorHost);
    this.activeId = id;
    this.inspectorCollapsed = false;
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

  /** 关掉当前工具（Inspector 回到空态），高级工具本身还开着。 */
  CloseTool({ refresh = true } = {}) {
    if (this.active && this.host.game.FrameDebugger?.frozen) this.host.game.FrameDebugger.Resume();
    if (this.active) {
      try { this.active.Exit(); } catch (error) { console.error("[Editor] 关闭出错：", error); }
    }
    this.active = null;
    this.activeId = null;
    this.viewport.enabled = false;
    this.SetHint("");
    this.SetCrosshair(false);
    if (refresh) this.RefreshStatus();
  }

  /**
   * 退出高级工具。keepOnClose 的叠加层（Debug工具那几个、第一人称持枪移动检查）不收：
   * 它们看的、量的就是战斗中的帧，「关掉回去打」正是主用例 —— 运行时才复现的
   * 渲染 bug（第一人称手上的黑块）只能开着调试视图边打边看。要停：设置 → Debug工具
   * 里再点一次、叉掉浮窗，或 all=true（套件销毁时）。
   */
  Exit({ all = false } = {}) {
    this.CloseTool({ refresh: false });
    for (const id of [...this.overlays.keys()]) {
      const Editor = OVERLAYS.find((entry) => entry.id === id);
      if (all || !Editor || !Editor.keepOnClose) this.CloseOverlay(id);
    }
    this.panelOpen = false;
    this.RefreshStatus();
    this.host.game.FinishEditorSession?.();
  }

  /** 旧接口：switching=true 只换掉当前工具；否则等于退出高级工具。 */
  Close({ switching = false, all = false } = {}) {
    if (switching) this.CloseTool();
    else this.Exit({ all });
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
      if (event.code === "Backquote") {
        // 玩家设置页开着时不开高级工具：那一页归菜单管，两层叠在一起谁也关不干净。
        if (this.host.SettingsOpen?.()) return;
        this.TogglePanel(); event.preventDefault(); return;
      }
      // 工具首页的「载入哪一关」单子开着时 Esc 只收单子
      if (event.code === "Escape" && this.home?.SheetOpen) {
        this.home.CloseSheet();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // 下拉菜单开着时 Esc 只收菜单，不退出高级工具
      if (event.code === "Escape" && this.openMenuId) {
        this.OpenMenu(null);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.code === "Escape" && this.Capturing) {
        // 工具首页上开着某个工具：Esc 先回首页，首页上再按才回主菜单
        if (this.home && this.active) this.CloseTool();
        else this.TogglePanel(false);
        event.preventDefault();
        // 暂停菜单也监听 Esc；设置关掉后不能让同一次按键继续穿透成「恢复战斗」。
        event.stopImmediatePropagation();
        return;
      }
      if (this.active && this.active.cameraMode === "fly") this.flycam.keys.add(event.code);
    };
    this._onKeyUp = (event) => {
      if (this.active && this.active.cameraMode === "fly") this.flycam.keys.delete(event.code);
      else this.flycam.keys.delete(event.code);
    };
    // Tab 在玩法里打开指挥轮盘，在可见工具窗里则保留原生焦点导航。
    this._onTab = event => {
      if (event.key === "Tab" && this.panelOpen && !this.root.classList.contains("off")) event.stopPropagation();
    };
    document.addEventListener("keydown", this._onTab, true);
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

  // -------------------------------------------------------------------------
  // 第一人称持枪移动检查的三处主循环接线（Script_Main 只经这里碰它；没开这个工具时全是空操作）
  // -------------------------------------------------------------------------

  /** 玩家相机与 FOV 写完、Viewmodel.Update 之前调：替身眼睛抄玩家眼睛。 */
  SyncOverlayEye(camera) {
    this.overlays.get(FirstPersonMotionEditor.id)?.SyncEye(camera);
  }

  /**
   * 剧本 / 白盒预演 / 测试场相机都没接管时调：主相机挪到外部观察机位。fresh = 这一帧玩法照跑、
   * 玩家相机是新写的；玩法停着（高级工具开着）时传 false。有互斥编辑器在用相机时不接管。→ true = 接管了。
   */
  ApplyOverlayCamera(camera, fresh = true) {
    if (this.active) return false;
    const overlay = this.overlays.get(FirstPersonMotionEditor.id);
    if (!overlay) return false;
    try { return overlay.ApplyCamera(camera, fresh); } catch (error) {
      console.error(`[Editor] ${FirstPersonMotionEditor.id} 接管相机出错，已关掉：`, error);
      this.CloseOverlay(FirstPersonMotionEditor.id);
      return false;
    }
  }

  /** 慢放：dt 乘上它（没开工具 = 原样）。 */
  ScaleDt(dt) {
    const overlay = this.overlays.get(FirstPersonMotionEditor.id);
    return overlay ? dt * overlay.TimeScale : dt;
  }

  Update(dt) {
    if (!this.active) return;
    try {
      this.active.Update(dt);
    } catch (error) {
      console.error(`[Editor] ${this.activeId} 每帧出错，已关掉：`, error);
      this.CloseTool();
    }
  }

  Dispose() {
    this.Exit({ all: true });
    document.removeEventListener("pointerdown", this._onPointerDown, true);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keydown", this._onTab, true);
    document.removeEventListener("keyup", this._onKeyUp);
    this.viewport.Dispose();
    this.studio.Dispose();
    if (this.root) this.root.remove();
    document.body.classList.remove("edToolsOpen", "edHideHud");
  }
}

export default EditorSuite;
