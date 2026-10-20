// ===========================================================================
// Script_EditorBlockoutUi.mjs —— 白盒关卡编辑器的界面（docs/Data_EditorBlockout.md §4）
//
// 只有 DOM，不碰 three，也不认识游戏：所有动作经 handlers 回调交给总控。
//   左上  关键帧卡片：阶段号 + 阶段标题 + 站位名；此时；下一步（随视角转的小箭头 + 距离）；
//         靠什么让玩家知道（小标签）；备注一行；推测位置计数；「记下当前机位」按钮
//   右上  关卡下拉 + 6 个图层开关（射界三档 / 去向 / 标签三档 / 穿墙显示 / 地标 / 站位，后两个 2026-10-20 加）+ 配置状态点（悬停看原因）
//   左下  小地图画布（地图模块往里画）+ 「M 展开」
//   底部  导航栏：按阶段分段、每个关键帧一个刻度、金色滑块、悬停提示、点击 / 拖动松手跳转、
//         左右箭头、计数、过渡中的「快进 ×n」、极小的按键提示
//   全屏  全关总图外框（地图模块往 fullCanvas 里画；关闭按钮、M / Esc 关闭）
//   中上  提示条（2.5 s 淡出）
//   预演（§14.2，2026-10-18）：当前关键帧挂了预演时卡片右上多一个「预演」按钮（N）；播放中卡片换成
//         「预演 · 标题 · 进度条 · 秒数」，导航栏不响应（.locked），按键只认 N / Esc（中断）。
//
// 输入约定：
// - 本界面 DOM 上的 mousedown / wheel / keydown 一律 stopPropagation —— 游戏的按键路由挂在
//   document 上，不拦会触发抢指针锁、滚轮换枪、空格跳（pointerdown 放行：开机那下解锁音频要它）。按钮与状态点在 mousedown 时就
//   preventDefault，不留焦点（焦点留在按钮上，回到游戏按空格会「点」它；留在界面里任何地方，WASD 都被上面的拦截吞掉）。
//   状态点能 Tab 到（键盘看说明），鼠标移开时交还焦点。
// - 焦点在本界面里时，. , M Y Esc 由这里直接转给 handlers（随后被拦住，不会再到总控的 window 监听上
//   重复触发；按住不连发）。总控请在冒泡阶段监听这些键。
// - SetInteractive(false)（指针锁定中）：整层 pointer-events:none，仍然可见。
// - 全关总图上点关键帧：地图模块在 fullCanvas 上派发 "blockoutmappick"（detail.index），这里接住转 onMapPick。
//
// 界面文字是编辑器自用的中文（docs/Data_TextAndTuning.md：Script_Editor* 不进文本门禁）。
// 不用 ◀▶▲▼✕ 之类字体里没有的字符：箭头、关闭、图标一律内联 SVG。
// ===========================================================================

const MAP_PICK_EVENT = "blockoutmappick";   // 与 Script_EditorBlockoutMap.MAP_PICK_EVENT 同名
const TOAST_MS = 2500;

const SVG = (body, view = "0 0 16 16") => `<svg viewBox="${view}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = Object.freeze({
  prev: SVG('<path d="M10 3.5 5.5 8l4.5 4.5"/>'),
  next: SVG('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  replay: SVG('<path d="M3.4 8.2a4.6 4.6 0 1 0 1.5-3.6"/><path d="M3.2 2.7v2.6h2.6"/>'),
  close: SVG('<path d="M4 4l8 8M12 4l-8 8"/>'),
  chevron: SVG('<path d="M4.5 6.5 8 10l3.5-3.5"/>'),
  camera: SVG('<path d="M2.5 5.5h2.2l1.2-1.8h4.2l1.2 1.8h2.2v7h-11z"/><circle cx="8" cy="8.9" r="2.2"/>'),
  copy: SVG('<rect x="5.5" y="5.5" width="7.5" height="8" rx=".6"/><path d="M3 10.5V3.6c0-.3.3-.6.6-.6h6.9"/>'),
  arcs: SVG('<path d="M3 13 13 6.2A8.5 8.5 0 0 0 9.4 2.6Z" fill="currentColor" fill-opacity=".22"/><path d="M3 13 13 6.2M3 13 9.4 2.6"/>'),
  intents: SVG('<path d="M2.5 12.5 4 11M5.6 9.4l1.4-1.4M8.6 6.4 10 5" /><path d="M9.2 3h3.8v3.8"/>'),
  labels: SVG('<path d="M2.5 3.5h6.2l4.8 4.5-4.8 4.5H2.5z"/><circle cx="5.3" cy="8" r=".9" fill="currentColor" stroke="none"/>'),
  xray: SVG('<path d="M1.8 8s2.3-4 6.2-4 6.2 4 6.2 4-2.3 4-6.2 4-6.2-4-6.2-4z"/><circle cx="8" cy="8" r="1.9"/>'),
  arrow: SVG('<path d="M8 13V3.4M4.4 6.8 8 3.2l3.6 3.6"/>'),
  guess: SVG('<circle cx="8" cy="8" r="5.2" stroke-dasharray="2.2 2"/>'),
  play: SVG('<path d="M5.2 3.6v8.8L12.4 8z" fill="currentColor" fill-opacity=".85"/>'),
  stop: SVG('<rect x="4.4" y="4.4" width="7.2" height="7.2" fill="currentColor" fill-opacity=".85"/>'),
  // 地标：杆上一面小旗（2026-10-20）
  landmarks: SVG('<path d="M4.2 13.5V2.6"/><path d="M4.2 3.2h7.6l-2.1 2.7 2.1 2.7H4.2z" fill="currentColor" fill-opacity=".25"/>'),
  // 站位：一条虚线路，尽头一个朝前的小三角（2026-10-20）
  stations: SVG('<path d="M2.6 12.8c3.2-.6 4.6-3.4 6.6-5.2" stroke-dasharray="2 1.7"/><path d="M9.6 2.9 13.6 6.6 8.3 7.4z" fill="currentColor" fill-opacity=".85"/>'),
});

const LAYER_DEFS = Object.freeze([
  { name: "arcs", icon: "arcs", label: "射界" },
  { name: "intents", icon: "intents", label: "去向" },
  { name: "labels", icon: "labels", label: "标签" },
  { name: "xray", icon: "xray", label: "穿墙显示" },
  // 2026-10-20：地标（场景文件 landmarks）与站位（所有关键帧的玩家站位）
  { name: "landmarks", icon: "landmarks", label: "地标" },
  { name: "stations", icon: "stations", label: "站位" },
]);
const ARC_CYCLE = Object.freeze({ default: "all", all: "off", off: "default" });
const ARC_TIPS = Object.freeze({
  default: "射界：数据给的与机枪、战车（再点：全部）",
  all: "射界：全部，含举枪的步枪（再点：关）",
  off: "射界：关（再点：打开）",
});
// 「标签」三档（2026-10-20）：有名字的 → 全部（无名的人按身份写「国军」「日军」「担架」…）→ 关
const LABEL_CYCLE = Object.freeze({ named: "all", all: "off", off: "named" });
const LABEL_TIPS = Object.freeze({
  named: "标签：有名字的人（再点：所有人）",
  all: "标签：所有人，无名的按身份写（再点：关）",
  off: "标签：关（再点：有名字的）",
});
const LAYER_TIPS = Object.freeze({
  landmarks: { on: "地标：狗洞、门、窖、片区这些特殊地方（再点：关）", off: "地标：关（再点：打开）" },
  stations: { on: "站位：这一关所有关键帧的玩家站位与路线（再点：关）", off: "站位：关（再点：打开）" },
});
const STATUS_TEXT = Object.freeze({ ok: "配置已载入", synced: "配置在外部改过，已同步", error: "配置有错", loading: "正在读配置" });

const KEY_ACTIONS = Object.freeze({ Period: "next", NumpadDecimal: "next", Comma: "prev", KeyM: "map", KeyY: "replay", KeyP: "copy", KeyN: "previz", Escape: "escape" });

function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function Button(className, { icon = "", text = "", tip = "", label = "" } = {}) {
  const b = El("button", `boBtn ${className}`.trim());
  b.type = "button";
  if (icon) b.innerHTML = ICONS[icon];
  if (text) b.appendChild(El("span", "boBtnText", text));
  if (tip) b.dataset.tip = tip;
  if (label || tip) b.setAttribute("aria-label", label || tip);
  return b;
}

function Pad2(n) { return Number.isFinite(n) ? String(Math.trunc(n)).padStart(2, "0") : "--"; }
/** 拍号：有 stageLabel（如「02末」）用它，否则两位阶段号。 */
function StageText(kf) { return kf && typeof kf.stageLabel === "string" && kf.stageLabel ? kf.stageLabel : Pad2(kf?.stage); }
function Kbd(text) { return El("kbd", "boKbd", text); }

export class BlockoutUi {
  /**
   * @param {HTMLElement} root  挂载点（一般是 document.body）
   * @param {{onPrev?, onNext?, onSeek?, onLevel?, onLayer?, onSavePose?, onCopy?, onReplay?, onOpenMap?, onCloseMap?, onMapPick?}} handlers
   */
  constructor(root, handlers = {}) {
    this.handlers = handlers || {};
    this.levels = [];
    this.levelKey = "";
    this.keyframes = [];
    this.index = -1;
    this.segments = [];
    this.layers = { arcs: "default", intents: true, labels: "named", xray: true, landmarks: true, stations: true };
    this.status = { state: "loading", message: "", writable: false, saveReason: "" };
    this.interactive = true;
    this.mapOpen = false;
    this.card = {};
    this.drag = null;
    this.toastTimers = new Set();
    this.off = [];
    this.disposed = false;

    this.root = El("div", "boRoot");
    this.root.setAttribute("data-blockout-ui", "");
    this.BuildCard();
    this.BuildTopBar();
    this.BuildMini();
    this.BuildNav();
    this.toasts = El("div", "boToasts");
    this.toasts.setAttribute("role", "status");
    this.toasts.setAttribute("aria-live", "polite");
    this.root.appendChild(this.toasts);
    this.BuildMap();
    this.WireRoot();
    (root || document.body).appendChild(this.root);
    this.SetLayers(this.layers);
    this.SetStatus(this.status);
    this.SetCard(null);
    this.SetKeyframes([], -1);
  }

  Call(name, ...args) {
    const fn = this.handlers[name];
    if (typeof fn === "function") {
      try { return fn(...args); } catch (error) { console.error(`[BlockoutUi] ${name}`, error); }
    }
    return undefined;
  }

  Listen(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this.off.push(() => el.removeEventListener(type, fn, opts));
  }

  // -------------------------------------------------------------------------
  // 构建

  WireRoot() {
    // 只拦游戏按键路由（Script_Input）认的那几种：mousedown 会抢指针锁、wheel 会换枪、keydown 会走路开火。
    // pointerdown / click 照常冒泡 —— Script_Main 在 document 上挂了一次性的 pointerdown 解锁音频，
    // 第一下点在编辑器界面上也得算数。
    const stop = (e) => e.stopPropagation();
    for (const type of ["mousedown", "wheel", "keydown", "keypress", "contextmenu"]) {
      this.Listen(this.root, type, (e) => {
        if (type === "contextmenu") e.preventDefault();
        if (type === "keydown") this.OnKey(e);
        stop(e);
      });
    }
    // 按钮和状态点不抢焦点（见文件头）：焦点一旦留在界面里，根上的 keydown 拦截会把 WASD / R / 空格全吞掉。
    // 状态点的说明靠悬停就能看；键盘 Tab 过去照样能看（:focus），鼠标移开就交还焦点。
    this.Listen(this.root, "mousedown", (e) => { const t = e.target; if (t.closest?.("button") || (t.closest?.(".boStatus") && !t.closest?.(".boStatusTip"))) e.preventDefault(); }, true);
    this.Listen(this.fullCanvas, MAP_PICK_EVENT, (e) => {
      const index = e.detail?.index;
      if (Number.isInteger(index) && index >= 0) this.Call("onMapPick", index);
    });
  }

  OnKey(e) {
    // 按住不连发（与总控在 document 上的按键一致）：按住 . 不会一口气翻过好几个关键帧。
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // 「复制当前位置」的备用文字框里：除了 Esc 关框，键都留给文字框（不翻关键帧）
    if (e.target?.closest?.(".boCopyBox") && e.code !== "Escape") return;
    const action = KEY_ACTIONS[e.code];
    if (!action) return;
    e.preventDefault();
    // 预演播放中只认 N / Esc（中断）
    if (this.previzActive) { if (action === "previz" || action === "escape") this.Call("onPreviz"); return; }
    if (action === "previz") { if (this.previzAvailable) this.Call("onPreviz"); return; }
    if (action === "next") this.Call("onNext");
    else if (action === "prev") this.Call("onPrev");
    else if (action === "replay") this.Call("onReplay");
    else if (action === "copy") this.Call("onCopy");
    else if (action === "map") this.Call(this.mapOpen ? "onCloseMap" : "onOpenMap");
    else if (action === "escape") {
      if (this.copyBox && !this.copyBox.hidden) this.HideCopyText();
      else if (this.levelMenuOpen) this.CloseLevelMenu();
      else if (this.mapOpen) this.Call("onCloseMap");
    }
  }

  BuildCard() {
    const card = El("section", "boCard boPanel");
    card.setAttribute("aria-label", "当前关键帧");
    const head = El("div", "boCardHead");
    const titleWrap = El("div", "boCardTitle");
    this.elStage = El("span", "boStageNo");
    this.elStageTitle = El("span", "boStageTitle");
    this.elPlace = El("span", "boPlace");
    titleWrap.append(this.elStage, this.elStageTitle, this.elPlace);
    this.btnSave = Button("boIconBtn boSave", { icon: "camera", tip: "记下当前机位" });
    this.btnSave.dataset.tipSide = "left";
    this.Listen(this.btnSave, "click", () => this.Call("onSavePose"));
    this.btnCopy = Button("boIconBtn boCopy", { icon: "copy", tip: "复制当前位置，贴给 agent（P）" });
    this.btnCopy.dataset.tipSide = "left";
    this.Listen(this.btnCopy, "click", () => this.Call("onCopy"));
    this.btnPreviz = Button("boIconBtn boPrevizBtn", { icon: "play", tip: "预演这一段（N）" });
    this.btnPreviz.dataset.tipSide = "left";
    this.btnPreviz.hidden = true;
    this.Listen(this.btnPreviz, "click", () => this.Call("onPreviz"));
    head.append(titleWrap, this.btnPreviz, this.btnCopy, this.btnSave);

    // 预演播放中的那一行：「预演 · 标题」+ 进度条 + 秒数 + 中断按钮
    const bar = El("div", "boPrevizBar");
    const top = El("div", "boPrevizTop");
    top.append(El("span", "boPrevizTag", "预演"));
    this.elPrevizTitle = El("span", "boPrevizTitle");
    this.elPrevizTime = El("span", "boPrevizTime");
    this.btnPrevizStop = Button("boIconBtn boPrevizStop", { icon: "stop", tip: "中断（N / Esc）" });
    this.btnPrevizStop.dataset.tipSide = "left";
    this.Listen(this.btnPrevizStop, "click", () => this.Call("onPreviz"));
    top.append(this.elPrevizTitle, this.elPrevizTime, this.btnPrevizStop);
    const track = El("div", "boPrevizTrack");
    this.elPrevizFill = El("i", "boPrevizFill");
    track.append(this.elPrevizFill);
    const hint = El("div", "boPrevizHint");
    hint.append(Kbd("N"), El("span", "", "或"), Kbd("Esc"), El("span", "", "中断，播完跳到下一个关键帧"));
    bar.append(top, track, hint);
    this.previzBar = bar;

    const what = El("div", "boLine boWhat");
    what.append(El("span", "boKey", "此时"));
    this.elWhat = El("span", "boVal");
    what.append(this.elWhat);

    const next = El("div", "boLine boNext");
    next.append(El("span", "boKey", "下一步"));
    const nv = El("span", "boVal boNextVal");
    this.elArrow = El("i", "boArrow");
    this.elArrow.innerHTML = ICONS.arrow;
    this.elNextText = El("span", "boNextText");
    this.elDist = El("span", "boDist");
    nv.append(this.elArrow, this.elNextText, this.elDist);
    next.append(nv);
    this.elNextLine = next;

    this.elHow = El("div", "boHow");
    this.elNotes = El("div", "boNotes");
    this.elGuess = El("div", "boGuess");
    const gi = El("i", "boGuessIcon");
    gi.innerHTML = ICONS.guess;
    this.elGuessText = El("span");
    this.elGuess.append(gi, this.elGuessText);
    this.elEmpty = El("div", "boEmpty", "没有关键帧");

    card.append(head, what, next, this.elHow, this.elNotes, this.elGuess, this.elEmpty, this.previzBar);
    this.cardEl = card;
    this.root.appendChild(card);
  }

  BuildTopBar() {
    const bar = El("div", "boTopBar");
    // 关卡下拉
    const level = El("div", "boLevel");
    this.btnLevel = Button("boLevelBtn", { tip: "切换关卡", label: "切换关卡" });
    this.btnLevel.dataset.tipSide = "below";
    this.elLevelBadge = El("span", "boLevelBadge");
    this.elLevelName = El("span", "boLevelName", "—");
    const chev = El("i", "boChevron");
    chev.innerHTML = ICONS.chevron;
    this.btnLevel.append(this.elLevelBadge, this.elLevelName, chev);
    this.btnLevel.setAttribute("aria-haspopup", "listbox");
    this.btnLevel.setAttribute("aria-expanded", "false");
    this.levelMenu = El("div", "boLevelMenu boPanel");
    this.levelMenu.setAttribute("role", "listbox");
    this.Listen(this.btnLevel, "click", () => (this.levelMenuOpen ? this.CloseLevelMenu() : this.OpenLevelMenu()));
    level.append(this.btnLevel, this.levelMenu);
    this.levelEl = level;

    // 图层
    const layers = El("div", "boLayers");
    this.layerBtns = {};
    for (const def of LAYER_DEFS) {
      const b = Button("boIconBtn boLayer", { icon: def.icon, tip: def.label });
      b.dataset.layer = def.name;
      b.dataset.tipSide = "below";
      this.Listen(b, "click", () => this.ToggleLayer(def.name));
      this.layerBtns[def.name] = b;
      layers.append(b);
    }

    // 状态点
    const status = El("div", "boStatus");
    status.tabIndex = 0;
    this.elStatusDot = El("i", "boDot");
    this.elStatusTip = El("div", "boStatusTip boPanel");
    status.append(this.elStatusDot, this.elStatusTip);
    this.Listen(status, "mouseleave", () => { if (status.contains(document.activeElement)) document.activeElement.blur(); });
    this.statusEl = status;

    bar.append(level, layers, status);
    this.root.appendChild(bar);

    // 旧版提示条（2026-10-19）：打开的是游戏现行的旧版关卡时，在关卡下拉下面挂一条，直接跳新剧本各段
    this.eraBanner = El("div", "boEraBanner boPanel");
    this.eraBanner.setAttribute("role", "note");
    this.Listen(this.eraBanner, "click", (e) => {
      const go = e.target.closest?.("[data-level]");
      if (go) { this.Call("onLevel", go.dataset.level); return; }
      if (e.target.closest?.(".boEraClose")) { this.eraDismissed = this.levelKey; this.eraBanner.classList.remove("show"); }
    });
    this.root.appendChild(this.eraBanner);
  }

  /** 右上角工具条里、状态点左边再挂一个控件（高级工具音量，2026-10-20）。 */
  AddTopBarControl(el) { this.statusEl.parentNode.insertBefore(el, this.statusEl); }

  /** 旧版提示条：当前关是 legacy 时显示，列出新剧本各段的跳转按钮；关掉后只在这一关内不再出现。 */
  UpdateEraBanner() {
    const current = this.levels.find(l => l.key === this.levelKey);
    const rewrites = this.levels.filter(l => l.era === "rewrite");
    const show = current?.era === "legacy" && this.eraDismissed !== this.levelKey;
    this.eraBanner.replaceChildren();
    if (current?.era === "legacy") {
      const head = El("div", "boEraHead");
      head.append(El("span", "boLevelBadge", current.badge || "旧版"), El("span", "", "这关是游戏里现行的旧版，不是新剧本"));
      const close = Button("boIconBtn boEraClose", { icon: "close", tip: "关掉提示" });
      close.dataset.tipSide = "below";
      head.append(close);
      const body = El("div", "boEraBody");
      body.append(El("span", "boEraLead", rewrites.length ? "新剧本在这里：" : "还没有新剧本的关卡"));
      for (const l of rewrites) {
        const b = Button("boEraGo", { text: l.short || l.label, label: l.label });
        b.dataset.level = l.key;
        b.title = l.note || l.label;
        body.append(b);
      }
      this.eraBanner.append(head, body);
    }
    this.eraBanner.classList.toggle("show", show);
  }

  BuildMini() {
    const mini = El("div", "boMini");
    this.miniCanvasEl = El("canvas", "boMiniCanvas");
    const hint = El("span", "boMiniHint");
    hint.append(Kbd("M"), El("span", "", "展开"));
    mini.append(this.miniCanvasEl, hint);
    mini.setAttribute("role", "button");
    mini.setAttribute("aria-label", "打开全关总图");
    this.Listen(mini, "click", () => this.Call("onOpenMap"));
    this.miniEl = mini;
    this.root.appendChild(mini);
  }

  BuildNav() {
    const nav = El("nav", "boNav boPanel");
    nav.setAttribute("aria-label", "关键帧");
    this.btnPrev = Button("boNavBtn boPrev", { icon: "prev", tip: "上一个（,）" });
    this.btnNext = Button("boNavBtn boNextBtn", { icon: "next", tip: "下一个（.）" });
    this.Listen(this.btnPrev, "click", () => this.Call("onPrev"));
    this.Listen(this.btnNext, "click", () => this.Call("onNext"));
    this.btnReplay = Button("boNavBtn boReplay", { icon: "replay", tip: "重播这一段：人从上一个关键帧走过来（Y）" });
    this.Listen(this.btnReplay, "click", () => this.Call("onReplay"));

    const wrap = El("div", "boTrackWrap");
    wrap.setAttribute("role", "slider");
    wrap.setAttribute("aria-label", "关键帧进度");
    this.track = El("div", "boTrack");
    this.stageNums = El("div", "boStageNums");
    this.knob = El("i", "boKnob");
    this.ghost = El("i", "boKnob boGhost");
    this.navTip = El("div", "boNavTip");
    wrap.append(this.track, this.stageNums, this.navTip);
    this.trackWrap = wrap;
    this.Listen(wrap, "pointerdown", (e) => this.OnTrackDown(e));
    this.Listen(wrap, "pointermove", (e) => this.OnTrackMove(e));
    this.Listen(wrap, "pointerup", (e) => this.OnTrackUp(e));
    this.Listen(wrap, "pointercancel", (e) => this.OnTrackUp(e, true));
    this.Listen(wrap, "pointerleave", () => { if (!this.drag) this.HideNavTip(); });

    const side = El("div", "boNavSide");
    const counter = El("div", "boCounter");
    this.elCount = El("span", "boCount", "—");
    this.elFast = El("span", "boFast");
    counter.append(this.elFast, this.elCount);
    const keys = El("div", "boKeys");
    keys.append(Kbd(","), Kbd("."), El("span", "", "切换"), Kbd("Y"), El("span", "", "重播"), Kbd("P"), El("span", "", "复制位置"), Kbd("M"), El("span", "", "地图"), Kbd("Esc"), El("span", "", "鼠标"));
    this.elKeysPreviz = El("span", "boKeysPreviz");
    this.elKeysPreviz.append(Kbd("N"), El("span", "", "预演"));
    this.elKeysPreviz.hidden = true;
    keys.prepend(this.elKeysPreviz);
    side.append(counter, keys);

    nav.append(this.btnPrev, wrap, this.btnNext, this.btnReplay, side);
    this.navEl = nav;
    this.root.appendChild(nav);
  }

  BuildMap() {
    const overlay = El("div", "boMapOverlay");
    overlay.setAttribute("aria-hidden", "true");
    const frame = El("div", "boMapFrame boPanel");
    frame.setAttribute("role", "dialog");
    frame.setAttribute("aria-label", "全关总图");
    const head = El("div", "boMapHead");
    const title = El("div", "boMapTitle");
    title.append(El("span", "boMapName", "全关总图"));
    this.elMapLevel = El("span", "boMapLevel");
    title.append(this.elMapLevel);
    const legend = El("div", "boLegend");
    const Item = (cls, text) => { const it = El("span", "boLegendItem"); it.append(El("i", `boGlyph ${cls}`), El("span", "", text)); return it; };
    legend.append(Item("enemy", "敌"), Item("friend", "友"), Item("civ", "百姓"), Item("poi", "要点"), Item("next", "下一步"), Item("player", "你"), Item("kf", "关键帧"), Item("landmark", "地标"));
    const hint = El("div", "boMapHint", "滚轮缩放 · 拖动平移 · 双击看全图 · 点关键帧跳转");
    this.btnCloseMap = Button("boIconBtn boClose", { icon: "close", tip: "关闭（M / Esc）" });
    this.btnCloseMap.dataset.tipSide = "left";
    this.Listen(this.btnCloseMap, "click", () => this.Call("onCloseMap"));
    head.append(title, legend, hint, this.btnCloseMap);
    const body = El("div", "boMapBody");
    this.fullCanvasEl = El("canvas", "boMapCanvas");
    body.append(this.fullCanvasEl);
    frame.append(head, body);
    overlay.append(frame);
    this.Listen(overlay, "pointerdown", (e) => { if (e.target === overlay) this.Call("onCloseMap"); });
    this.mapEl = overlay;
    this.root.appendChild(overlay);
  }

  // -------------------------------------------------------------------------
  // 公共接口（§4）

  get miniCanvas() { return this.miniCanvasEl; }
  get fullCanvas() { return this.fullCanvasEl; }

  /** @param {Array<{key,label,era?,badge?,note?,short?}>} levels  era: "rewrite" 新剧本 / "legacy" 游戏现行旧版 / "draft" 草稿 */
  SetLevels(levels, currentKey) {
    const Opt = (v) => (typeof v === "string" && v ? v : "");
    this.levels = (Array.isArray(levels) ? levels : []).map(l => ({
      key: String(l.key), label: String(l.label ?? l.key),
      era: Opt(l.era), badge: Opt(l.badge), note: Opt(l.note), short: Opt(l.short),
    }));
    this.levelKey = currentKey ?? this.levels[0]?.key ?? "";
    const current = this.levels.find(l => l.key === this.levelKey);
    this.elLevelName.textContent = current ? current.label : "—";
    this.elLevelBadge.textContent = current?.badge || "";
    this.elLevelBadge.dataset.era = current?.era || "";
    this.elLevelBadge.hidden = !current?.badge;
    this.btnLevel.title = current?.note ? `切换关卡 · ${current.note}` : "切换关卡";   // 这颗按钮的自绘提示被样式关掉了，用原生 title
    this.elMapLevel.textContent = current ? (current.badge ? `${current.badge}｜${current.label}` : current.label) : "";
    this.levelMenu.replaceChildren();
    // 分组：新剧本在上，旧版 / 草稿在下；没写 era 的（老调用方）归到最后一组，不加组头
    const GROUPS = [["rewrite", "新剧本"], ["legacy", "旧版 · 游戏现行"], ["draft", "草稿"], ["", ""]];
    const tagged = this.levels.some(l => l.era);
    for (const [era, title] of GROUPS) {
      const members = this.levels.filter(l => (GROUPS.some(([e]) => e && e === l.era) ? l.era : "") === era);
      if (!members.length) continue;
      if (tagged && title) this.levelMenu.append(El("div", "boLevelGroup", title));
      for (const level of members) {
        const item = El("button", "boLevelItem");
        item.type = "button";
        item.setAttribute("role", "option");
        item.dataset.era = level.era;
        const on = level.key === this.levelKey;
        item.classList.toggle("on", on);
        item.setAttribute("aria-selected", on ? "true" : "false");
        const text = El("span", "boLevelText");
        text.append(El("span", "boLevelLabel", level.label));
        if (level.note) text.append(El("span", "boLevelNote", level.note));
        item.append(El("i", "boLevelMark"), text);
        item.addEventListener("click", () => {
          this.CloseLevelMenu();
          if (level.key !== this.levelKey) this.Call("onLevel", level.key);
        });
        this.levelMenu.append(item);
      }
    }
    this.btnLevel.disabled = this.levels.length < 2;
    this.UpdateEraBanner();
  }

  OpenLevelMenu() {
    if (this.levelMenuOpen || this.levels.length < 2) return;
    this.levelMenuOpen = true;
    this.levelEl.classList.add("open");
    this.btnLevel.setAttribute("aria-expanded", "true");
    this.outsideClose = (e) => { if (!this.levelEl.contains(e.target)) this.CloseLevelMenu(); };
    document.addEventListener("pointerdown", this.outsideClose, true);
  }

  CloseLevelMenu() {
    if (!this.levelMenuOpen) return;
    this.levelMenuOpen = false;
    this.levelEl.classList.remove("open");
    this.btnLevel.setAttribute("aria-expanded", "false");
    if (this.outsideClose) document.removeEventListener("pointerdown", this.outsideClose, true);
    this.outsideClose = null;
  }

  /** @param {Array<{id,stage,stageTitle,name}>} list */
  SetKeyframes(list, index) {
    const next = (Array.isArray(list) ? list : []).map((kf, i) => ({
      i, id: String(kf?.id ?? i), stage: Number.isFinite(kf?.stage) ? kf.stage : null,
      stageTitle: kf?.stageTitle || "", stageLabel: kf?.stageLabel || "", name: kf?.name || "",
    }));
    const sig = next.map(k => `${k.id}|${k.stage}|${k.stageLabel}|${k.name}|${k.stageTitle}`).join("\n");
    let rebuilt = false;
    if (sig !== this.kfSig) {
      this.kfSig = sig;
      this.keyframes = next;
      this.BuildTrack();
      rebuilt = true;
    }
    const nextIndex = Number.isInteger(index) && index >= 0 && index < this.keyframes.length ? index : (this.keyframes.length ? 0 : -1);
    if (!rebuilt && nextIndex === this.index) return;   // 总控每帧调也不动 DOM
    this.index = nextIndex;
    this.UpdateTrack();
  }

  BuildTrack() {
    // 连续同阶段的关键帧合成一段；段宽按关键帧数
    const segs = [];
    for (const kf of this.keyframes) {
      const last = segs[segs.length - 1];
      if (last && last.stage === kf.stage && last.stageLabel === kf.stageLabel) last.items.push(kf);
      else segs.push({ stage: kf.stage, stageLabel: kf.stageLabel, start: kf.i, items: [kf] });
    }
    this.track.replaceChildren();
    this.stageNums.replaceChildren();
    this.segments = segs.map((seg) => {
      const el = El("div", "boSeg");
      el.style.flexGrow = String(seg.items.length);
      el.append(El("i", "boSegLine"), El("i", "boSegFill"));
      seg.ticks = seg.items.map((kf, k) => {
        const t = El("i", "boTick");
        t.style.left = `${((k + 0.5) / seg.items.length) * 100}%`;
        t.dataset.index = String(kf.i);
        el.append(t);
        return t;
      });
      this.track.append(el);
      const num = El("span", "boStageNum", StageText(seg));
      num.style.flexGrow = String(seg.items.length);
      this.stageNums.append(num);
      return { ...seg, el, num };
    });
    this.navEl.classList.toggle("empty", !this.keyframes.length);
  }

  UpdateTrack() {
    const idx = this.index;
    const n = this.keyframes.length;
    for (const seg of this.segments) {
      const end = seg.start + seg.items.length - 1;
      const inSeg = idx >= seg.start && idx <= end;
      seg.el.classList.toggle("passed", idx > end);
      seg.el.classList.toggle("current", inSeg);
      seg.num.classList.toggle("current", inSeg);
      const fill = seg.el.querySelector(".boSegFill");
      fill.style.width = inSeg ? `${((idx - seg.start + 0.5) / seg.items.length) * 100}%` : idx > end ? "100%" : "0%";
      seg.ticks.forEach((t, k) => {
        const i = seg.start + k;
        t.classList.toggle("passed", i < idx);
        t.classList.toggle("current", i === idx);
      });
      if (inSeg) {
        this.knob.style.left = `${((idx - seg.start + 0.5) / seg.items.length) * 100}%`;
        if (this.knob.parentElement !== seg.el) seg.el.append(this.knob);
      }
    }
    if (idx < 0) this.knob.remove();
    this.btnPrev.disabled = idx <= 0;
    this.btnNext.disabled = idx < 0 || idx >= n - 1;
    this.btnReplay.disabled = idx <= 0;
    const kf = this.keyframes[idx];
    if (kf) {
      const seg = this.segments.find(s => idx >= s.start && idx < s.start + s.items.length);
      this.elCount.textContent = `${StageText(kf)} · ${idx - seg.start + 1}/${seg.items.length}`;
      this.trackWrap.setAttribute("aria-valuemin", "1");
      this.trackWrap.setAttribute("aria-valuemax", String(n));
      this.trackWrap.setAttribute("aria-valuenow", String(idx + 1));
      this.trackWrap.setAttribute("aria-valuetext", `${StageText(kf)} · ${kf.name}`);
    } else {
      this.elCount.textContent = "—";
    }
  }

  IndexAtX(clientX) {
    if (!this.segments.length) return -1;
    let best = null, bestD = Infinity;
    for (const seg of this.segments) {
      const r = seg.el.getBoundingClientRect();
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < bestD) { bestD = d; best = { seg, r }; }
    }
    const { seg, r } = best;
    const k = Math.max(0, Math.min(seg.items.length - 1, Math.floor(((clientX - r.left) / Math.max(1, r.width)) * seg.items.length)));
    return seg.start + k;
  }

  TickX(index) {
    const seg = this.segments.find(s => index >= s.start && index < s.start + s.items.length);
    if (!seg) return null;
    const r = seg.el.getBoundingClientRect();
    const w = this.trackWrap.getBoundingClientRect();
    return r.left - w.left + ((index - seg.start + 0.5) / seg.items.length) * r.width;
  }

  ShowNavTip(index) {
    const kf = this.keyframes[index];
    const x = this.TickX(index);
    if (!kf || x === null) { this.HideNavTip(); return; }
    this.navTip.textContent = kf.name ? `${StageText(kf)} · ${kf.name}` : `${StageText(kf)} · ${kf.id}`;
    this.navTip.style.left = `${x}px`;
    this.navTip.classList.add("on");
    for (const seg of this.segments) for (const t of seg.ticks) t.classList.toggle("hover", Number(t.dataset.index) === index);
  }

  HideNavTip() {
    this.navTip.classList.remove("on");
    for (const seg of this.segments) for (const t of seg.ticks) t.classList.remove("hover");
  }

  OnTrackDown(e) {
    if (e.button !== 0 || !this.keyframes.length) return;
    e.preventDefault();
    try { this.trackWrap.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    const index = this.IndexAtX(e.clientX);
    this.drag = { id: e.pointerId, index };
    this.SetGhost(index);
    this.ShowNavTip(index);
  }

  OnTrackMove(e) {
    const index = this.IndexAtX(e.clientX);
    if (index < 0) return;
    if (this.drag && this.drag.id === e.pointerId) {
      if (index !== this.drag.index) { this.drag.index = index; this.SetGhost(index); }
    }
    this.ShowNavTip(index);
  }

  OnTrackUp(e, cancelled = false) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const index = this.drag.index;
    this.drag = null;
    try { this.trackWrap.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
    this.ghost.remove();
    if (!cancelled && index >= 0 && index !== this.index) this.Call("onSeek", index);
  }

  SetGhost(index) {
    const seg = this.segments.find(s => index >= s.start && index < s.start + s.items.length);
    if (!seg || index === this.index) { this.ghost.remove(); return; }
    this.ghost.style.left = `${((index - seg.start + 0.5) / seg.items.length) * 100}%`;
    seg.el.append(this.ghost);
  }

  /**
   * @param {{stage, stageTitle, name, what, next:{text,distanceM,relYawDeg}|null, how, notes, guessCount}|null} card
   */
  SetCard(card) {
    const c = card || null;
    this.cardEl.classList.toggle("empty", !c);
    if (!c) return;
    const prev = this.card || {};
    const Text = (el, value, key) => { if (prev[key] !== value) el.textContent = value; };
    const stage = StageText(c);
    Text(this.elStage, stage, "_stage");
    Text(this.elStageTitle, c.stageTitle || "", "stageTitle");
    Text(this.elPlace, c.name ? `· ${c.name}` : "", "_place");
    this.elPlace.hidden = !c.name;
    Text(this.elWhat, c.what || "—", "_what");
    this.elWhat.classList.toggle("muted", !c.what);
    const next = c.next && typeof c.next.text === "string" ? c.next : null;
    this.elNextLine.hidden = !next;
    if (next) {
      Text(this.elNextText, next.text || "—", "_nextText");
      const hasDir = Number.isFinite(next.relYawDeg);
      this.elArrow.hidden = !hasDir;
      if (hasDir) this.elArrow.style.transform = `rotate(${(-next.relYawDeg).toFixed(1)}deg)`;
      const dist = Number.isFinite(next.distanceM) ? `${Math.round(next.distanceM)} m` : "";
      Text(this.elDist, dist, "_dist");
      this.elDist.hidden = !dist;
    }
    const howSig = Array.isArray(c.how) ? c.how.join("\u0001") : "";
    if (howSig !== prev._how) {
      this.elHow.replaceChildren(...(Array.isArray(c.how) ? c.how : []).filter(Boolean).map(h => El("span", "boChip", h)));
    }
    this.elHow.hidden = !howSig;
    Text(this.elNotes, c.notes || "", "notes");
    this.elNotes.hidden = !c.notes;
    if (c.notes !== prev.notes) this.elNotes.title = c.notes || "";
    const guess = Number.isFinite(c.guessCount) ? Math.max(0, Math.trunc(c.guessCount)) : 0;
    Text(this.elGuessText, guess ? `${guess} 个位置是推测的` : "", "_guess");
    this.elGuess.hidden = !guess;
    this.card = {
      _stage: stage, stageTitle: c.stageTitle || "", _place: c.name ? `· ${c.name}` : "", _what: c.what || "—",
      _nextText: next ? next.text || "—" : prev._nextText, _dist: next ? (Number.isFinite(next.distanceM) ? `${Math.round(next.distanceM)} m` : "") : prev._dist,
      _how: howSig, notes: c.notes || "", _guess: guess ? `${guess} 个位置是推测的` : "",
    };
  }

  /** arcs: true | false | "default" | "all" | "off"；labels: true | false | "named" | "all" | "off"（2026-10-20 三档）；其余布尔 */
  SetLayers(layers = {}) {
    if ("arcs" in layers) {
      const a = layers.arcs;
      this.layers.arcs = a === true ? "default" : a === false ? "off" : ARC_CYCLE[a] ? a : this.layers.arcs;
    }
    if ("labels" in layers) {
      const l = layers.labels;
      this.layers.labels = l === true ? "named" : l === false ? "off" : LABEL_CYCLE[l] ? l : this.layers.labels;
    }
    for (const k of ["intents", "xray", "landmarks", "stations"]) if (k in layers) this.layers[k] = !!layers[k];
    for (const def of LAYER_DEFS) {
      const b = this.layerBtns[def.name];
      const v = this.layers[def.name];
      const on = def.name === "arcs" || def.name === "labels" ? v !== "off" : !!v;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (def.name === "arcs") {
        b.classList.toggle("all", v === "all");
        b.dataset.tip = ARC_TIPS[v];
        b.setAttribute("aria-label", ARC_TIPS[v]);
      } else if (def.name === "labels") {
        b.classList.toggle("all", v === "all");
        b.dataset.tip = LABEL_TIPS[v];
        b.setAttribute("aria-label", LABEL_TIPS[v]);
      } else if (LAYER_TIPS[def.name]) {
        b.dataset.tip = LAYER_TIPS[def.name][on ? "on" : "off"];
        b.setAttribute("aria-label", b.dataset.tip);
      } else {
        b.dataset.tip = `${def.label}：${on ? "开" : "关"}`;
      }
    }
  }

  ToggleLayer(name) {
    let value;
    if (name === "arcs") value = ARC_CYCLE[this.layers.arcs] || "default";
    else if (name === "labels") value = LABEL_CYCLE[this.layers.labels] || "named";
    else value = !this.layers[name];
    this.SetLayers({ [name]: value });
    this.Call("onLayer", name, value);
  }

  /** @param {{state:"ok"|"synced"|"error"|"loading", message?, writable?, saveReason?}} s */
  SetStatus(s = {}) {
    const state = STATUS_TEXT[s.state] ? s.state : "loading";
    this.status = { state, message: s.message || "", writable: !!s.writable, saveReason: s.saveReason || "" };
    this.elStatusDot.dataset.state = state;
    this.statusEl.dataset.state = state;
    this.statusEl.setAttribute("aria-label", `${STATUS_TEXT[state]}${s.message ? "：" + s.message : ""}`);
    const tip = this.elStatusTip;
    tip.replaceChildren();
    tip.append(El("div", "boTipHead", STATUS_TEXT[state]));
    const lines = String(s.message || "").split(/\n+/).map(t => t.trim()).filter(Boolean);
    for (const line of lines.slice(0, 8)) tip.append(El("div", "boTipLine", line));
    if (lines.length > 8) tip.append(El("div", "boTipLine muted", `还有 ${lines.length - 8} 条`));
    const save = this.status.writable ? "记下机位：直接写回配置文件" : `记下机位：只存本机草稿${this.status.saveReason ? `（${this.status.saveReason}）` : ""}`;
    tip.append(El("div", "boTipLine muted", save));
    this.btnSave.dataset.tip = this.status.writable ? "记下当前机位" : "记下当前机位（存本机草稿）";
    this.btnSave.classList.toggle("draft", !this.status.writable);
    // 蓝闪：每次进入 synced 都重新播一遍
    if (state === "synced") {
      this.elStatusDot.classList.remove("flash");
      void this.elStatusDot.offsetWidth;
      this.elStatusDot.classList.add("flash");
    }
  }

  /** 当前关键帧有没有预演（§14.2）：有才显示「预演」按钮与按键提示。 */
  SetPreviz({ available = false, title = "" } = {}) {
    this.previzAvailable = !!available;
    this.btnPreviz.hidden = !available || !!this.previzActive;
    this.btnPreviz.dataset.tip = available ? (title ? "预演：" + title + "（N）" : "预演这一段（N）") : "";
    this.btnPreviz.setAttribute("aria-label", this.btnPreviz.dataset.tip || "预演");
    this.elKeysPreviz.hidden = !available;
  }

  /** 预演播放中：卡片换成「预演 · 标题 · 进度」，导航栏不响应。active:false 收回。 */
  SetPrevizPlaying({ active = false, title = "", t = 0, durationS = 0, paused = false, loading = false, rate = 1 } = {}) {
    const was = !!this.previzActive;
    this.previzActive = !!active;
    this.cardEl.classList.toggle("previz", this.previzActive);
    this.navEl.classList.toggle("locked", this.previzActive);
    this.root.classList.toggle("previzOn", this.previzActive);
    this.btnPreviz.hidden = !this.previzAvailable || this.previzActive;
    if (!this.previzActive) { if (was) this.HideNavTip(); return; }
    if (this.elPrevizTitle.textContent !== title) this.elPrevizTitle.textContent = title;
    // 慢动作（2026-10-19）：倍率 < 1 时在秒数前写「慢 ×0.3」；秒数是预演时间（墙上时间更长）
    const slow = rate < 0.995 ? "慢 ×" + rate.toFixed(2).replace(/0$/, "") + " " : "";
    const time = loading ? "准备中" : (paused ? "暂停 " : "") + slow + t.toFixed(1) + " / " + durationS.toFixed(1) + " s";
    if (this.elPrevizTime.textContent !== time) this.elPrevizTime.textContent = time;
    const k = durationS > 0 ? Math.max(0, Math.min(1, t / durationS)) : 0;
    this.elPrevizFill.style.width = (k * 100).toFixed(2) + "%";
    if (!was) { this.CloseLevelMenu(); this.HideNavTip(); }
  }

  /** 过渡中：rate > 1 时显示「快进 ×n」（§5.2）。本方法是对 §4 接口的补充。 */
  SetTransition({ active = false, rate = 1 } = {}) {
    const fast = active && Number.isFinite(rate) && rate > 1.01;
    this.navEl.classList.toggle("playing", !!active);
    this.elFast.textContent = fast ? `快进 ×${rate.toFixed(1)}` : "";
    this.elFast.hidden = !fast;
  }

  Toast(text, kind = "info") {
    if (!text || this.disposed) return;
    const el = El("div", `boToast ${["info", "ok", "warn", "error"].includes(kind) ? kind : "info"}`);
    el.append(El("i", "boToastMark"), El("span", "", String(text)));
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild.remove();
    // 不靠 rAF（窗口不可见时 rAF 不跑）：先读一次布局把起始样式定下来，再加类走过渡
    void el.offsetWidth;
    el.classList.add("on");
    const t1 = setTimeout(() => { el.classList.remove("on"); el.classList.add("out"); }, TOAST_MS);
    const t2 = setTimeout(() => { el.remove(); this.toastTimers.delete(t1); this.toastTimers.delete(t2); }, TOAST_MS + 400);
    this.toastTimers.add(t1); this.toastTimers.add(t2);
  }

  /** false = 指针锁定中：仍然可见，但整层不吃鼠标。 */
  SetInteractive(on) {
    this.interactive = !!on;
    this.root.classList.toggle("inert", !this.interactive);
    if (!this.interactive) {
      this.CloseLevelMenu();
      this.HideNavTip();
      if (this.root.contains(document.activeElement)) document.activeElement.blur();
    }
  }

  /** 「复制当前位置」写不进剪贴板时的备用框：文字已全选，用户按 Ctrl+C；Esc / 关闭按钮收起。 */
  ShowCopyText(text) {
    if (this.disposed) return;
    if (!this.copyBox) {
      const box = El("div", "boCopyBox boPanel");
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "复制当前位置");
      const head = El("div", "boCopyHead");
      head.append(El("span", "boCopyTitle", "复制当前位置"), El("span", "boCopyHint", "按 Ctrl+C 复制，整段贴给 agent"));
      const close = Button("boIconBtn boClose", { icon: "close", tip: "关闭（Esc）" });
      close.dataset.tipSide = "left";
      this.Listen(close, "click", () => this.HideCopyText());
      head.append(close);
      this.copyArea = El("textarea", "boCopyText");
      this.copyArea.readOnly = true;
      this.copyArea.spellcheck = false;
      box.append(head, this.copyArea);
      this.copyBox = box;
      this.root.appendChild(box);
    }
    this.copyArea.value = String(text || "");
    this.copyBox.hidden = false;
    this.copyArea.focus({ preventScroll: true });
    this.copyArea.select();
  }

  HideCopyText() {
    if (!this.copyBox) return;
    this.copyBox.hidden = true;
    if (this.copyBox.contains(document.activeElement)) document.activeElement.blur();
  }

  SetMapOpen(on) {
    this.mapOpen = !!on;
    this.mapEl.classList.toggle("open", this.mapOpen);
    this.mapEl.setAttribute("aria-hidden", this.mapOpen ? "false" : "true");
    this.root.classList.toggle("mapOpen", this.mapOpen);
    if (this.mapOpen) this.CloseLevelMenu();
  }

  Dispose() {
    this.disposed = true;
    this.CloseLevelMenu();
    for (const t of this.toastTimers) clearTimeout(t);
    this.toastTimers.clear();
    for (const off of this.off) off();
    this.off = [];
    this.root.remove();
  }
}
