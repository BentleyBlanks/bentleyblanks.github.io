// ===========================================================================
// Script_EditorBlockoutTouch.mjs —— 白盒关卡编辑器的手机验收层（docs/Data_EditorBlockout.md §4.5，2026-10-23）
//
// 用户在外面拿 iPhone 打开线上（github.io）的白盒编辑器，验收 agent 做完的白盒：没有键盘鼠标、没有指针锁。
// 这一层只加触屏输入和按钮，**游戏画面一样不动**（枪、手、画质、阴影都照 PC，不为手机割舍）：
//   转视角  屏幕空处单指拖动：一块铺满全屏、垫在编辑器界面下面的透明层，位移交给宿主的 Look(dx, dy)，
//           与鼠标位移同一条链（飞行中 Script_Main 照旧转给飞行相机）
//   摇杆    左下常驻：走路（手指拖出圈外 = 冲刺）；飞行中推飞行相机（拖出圈外 = ×4 加速）
//   按钮    右下一列：预演（这一帧有预演才出现，播放中变「停」）/ 飞行 / 地图；
//           飞行中左边再一列：升 / 降（按住）/ 加速（开关）
//   右上    「图层」按钮：关卡下拉、图层开关、音量收成一块面板，点一下展开，点空处收起
// 卡片默认收成一行（点标题展开）、总图双指缩放、键盘提示与悬停提示收起，这些在界面 / 地图模块里（EnableTouch / 双指）。
//
// 只有 DOM，不碰 three，也不认识游戏：总控每帧 Sync 进状态，动作经 handlers 回调出去：
//   look(dx, dy)  转视角（已乘 lookScale，单位同鼠标 movementX/Y）
//   unlockAudio() 手指抬起时补解锁音频（iOS 只认 touchend / pointerup 这类抬起手势，按下那一下解不开）
//   fly() / previz() / map()  同卡片上的飞行、预演按钮与 M 键
// 总控每帧取 ApplyMove(input)（走路）与 FlyAxes()（飞行）两个输出。
//
// 开关：?touch=1 强制开、?touch=0 强制关；不写时按设备猜：主指针是粗的、不能悬停（手机 / 平板）就开。
// 界面文字是编辑器自用的中文（docs/Data_TextAndTuning.md：Script_Editor* 不进文本门禁）。
// ===========================================================================

export const BLOCKOUT_TOUCH = Object.freeze({
  // 手指 1 px 当鼠标几 px 用（鼠标 1 px = FREE_AIM.sensitivityScale 0.0022 rad × 灵敏度）：
  // 2.4 → 手指划 100 px 转约 30°，竖屏横划一整屏（375 px）约 110°
  lookScale: 2.4,
  // 摇杆：帽最远走这么多 px；推不到 deadZone（相对半径）不算；手指拖到半径的 overdrive 倍 = 冲刺 / 飞行加速
  stickRadiusPx: 48,
  deadZone: 0.12,
  overdrive: 1.3,
});

/** 要不要开触屏层。params 是 URLSearchParams；env 给测试换 matchMedia 用。 */
export function WantsTouch(params, env = globalThis) {
  const forced = params?.get?.("touch");
  if (forced === "1" || forced === "true") return true;
  if (forced === "0" || forced === "false") return false;
  try { return !!env.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches; } catch { return false; }
}

/**
 * 摇杆：手指相对圈心的位移（CSS px，屏幕 y 向下）→ { strafe, forward, mag, over }。
 * 死区里全 0；出了死区按 (距离 − 死区) / (1 − 死区) 重新从 0 爬到 1，方向不变；over = 拖到了圈外（冲刺 / 加速）。
 */
export function StickAxes(dx, dy, radius = BLOCKOUT_TOUCH.stickRadiusPx, dead = BLOCKOUT_TOUCH.deadZone, overdrive = BLOCKOUT_TOUCH.overdrive) {
  const r = Math.max(1, radius);
  const raw = Math.hypot(dx, dy) / r;
  if (!(raw > dead)) return { strafe: 0, forward: 0, mag: 0, over: false };
  const mag = Math.min(1, (raw - dead) / (1 - dead));
  const k = mag / raw;
  return { strafe: (dx / r) * k, forward: (-dy / r) * k, mag, over: raw >= overdrive };
}

const SVG = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = Object.freeze({
  play: SVG('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" fill-opacity=".85"/>'),
  stop: SVG('<rect x="6.5" y="6.5" width="11" height="11" fill="currentColor" fill-opacity=".85"/>'),
  fly: SVG('<path d="M3.3 11.1 20.7 3.6 14.4 20.4 11.6 12.8z" fill="currentColor" fill-opacity=".18"/><path d="M11.6 12.8 20.7 3.6"/>'),
  map: SVG('<path d="M3.5 6.2 9 4l6 2.2L20.5 4v13.8L15 20l-6-2.2-5.5 2.2z"/><path d="M9 4v13.8M15 6.2V20"/>'),
  up: SVG('<path d="M12 19V5.5M6.5 11 12 5.5 17.5 11"/>'),
  down: SVG('<path d="M12 5v13.5M6.5 13 12 18.5 17.5 13"/>'),
  boost: SVG('<path d="M5 17.5 12 10.5l7 7"/><path d="M5 11.5 12 4.5l7 7"/>'),
  layers: SVG('<path d="M12 3.5 21 8l-9 4.5L3 8z" fill="currentColor" fill-opacity=".18"/><path d="M3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>'),
});

function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function TouchButton(className, icon, text, label = text) {
  const b = El("button", `boBtn boTouchBtn ${className}`.trim());
  b.type = "button";
  b.setAttribute("aria-label", label);
  const i = El("i", "boTouchIcon");
  i.innerHTML = ICONS[icon];
  b.append(i, El("span", "boTouchLabel", text));
  return b;
}

export class BlockoutTouch {
  /**
   * @param {{ ui: import("./Script_EditorBlockoutUi.mjs").BlockoutUi, handlers?: object, doc?: Document }} options
   */
  constructor({ ui, handlers = {}, doc = globalThis.document } = {}) {
    this.ui = ui;
    this.handlers = handlers || {};
    this.doc = doc;
    this.off = [];
    this.disposed = false;
    // 摇杆：id = 按着它的那根手指；strafe / forward ∈ [−1, 1]；over = 拖出圈外
    this.stick = { id: null, cx: 0, cy: 0, strafe: 0, forward: 0, over: false };
    // 转视角：只认一根手指
    this.look = { id: null, x: 0, y: 0, moved: 0 };
    // 飞行的升降钮按住状态（手指 id → +1 / −1）与加速开关
    this.riseHeld = new Map();
    this.boost = false;
    this.state = { fly: false, previz: false, previzAvailable: false, map: false };
    this.stateKey = "";
    this.lookTotal = { dx: 0, dy: 0, events: 0 };

    doc.body.classList.add("blockoutTouch");
    ui.EnableTouch?.();
    this.root = ui.root;
    this.BuildLookPad();
    this.BuildStick();
    this.BuildActions();
    this.BuildMenu();
    this.WireDocument();
    this.Sync(this.state, true);
  }

  Call(name, ...args) {
    const fn = this.handlers[name];
    if (typeof fn === "function") {
      try { return fn(...args); } catch (error) { console.error(`[BlockoutTouch] ${name}`, error); }
    }
    return undefined;
  }

  Listen(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this.off.push(() => el.removeEventListener(type, fn, opts));
  }

  // -------------------------------------------------------------------------
  // 构建

  /**
   * 铺满全屏的透明层：z 1，在画布与 HUD 之上、编辑器界面（z 30）与开发工具（z 40）之下，
   * 所以手指落在空处是转视角、落在按钮上归按钮。加载画面（#boot，z 10）盖着时它也在下面。
   */
  BuildLookPad() {
    const pad = El("div", "boTouchLook");
    pad.id = "blockoutTouchLook";
    this.doc.body.appendChild(pad);
    this.lookPad = pad;
    this.Listen(pad, "pointerdown", (e) => {
      if (this.look.id !== null) return;
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch { /* 合成事件没有真指针 */ }
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    });
    this.Listen(pad, "pointermove", (e) => {
      if (e.pointerId !== this.look.id) return;
      const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
      this.look.x = e.clientX; this.look.y = e.clientY;
      this.look.moved += Math.abs(dx) + Math.abs(dy);
      // 预演播放中相机归预演、总图开着时手指归地图：都不转头
      if (this.state.previz || this.state.map || (!dx && !dy)) return;
      const k = BLOCKOUT_TOUCH.lookScale;
      this.lookTotal.dx += dx * k; this.lookTotal.dy += dy * k; this.lookTotal.events += 1;
      this.Call("look", dx * k, dy * k);
    });
    const end = (e) => {
      if (e.pointerId !== this.look.id) return;
      this.look.id = null;
      try { pad.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
    };
    this.Listen(pad, "pointerup", end);
    this.Listen(pad, "pointercancel", end);
    this.Listen(pad, "lostpointercapture", end);
    // 游戏的按键路由挂在 document 上（Script_Input）：触屏补发的兼容鼠标事件不能漏过去抢指针锁、开枪、换枪
    for (const type of ["mousedown", "mouseup", "click", "contextmenu", "wheel"]) {
      this.Listen(pad, type, (e) => { e.stopPropagation(); if (type === "contextmenu") e.preventDefault(); });
    }
    // 按下就 preventDefault：不补发兼容鼠标事件、不双击放大、不弹长按菜单 / 放大镜
    this.Listen(pad, "touchstart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

  BuildStick() {
    const base = El("div", "boStick");
    base.setAttribute("role", "application");
    base.setAttribute("aria-label", "摇杆：走路，飞行中推相机；拖出圈外加速");
    const ring = El("i", "boStickRing");
    this.knob = El("i", "boStickKnob");
    base.append(ring, this.knob);
    this.stickEl = base;
    this.root.appendChild(base);
    this.Listen(base, "pointerdown", (e) => {
      if (this.stick.id !== null) return;
      e.preventDefault();
      e.stopPropagation();
      try { base.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
      const r = base.getBoundingClientRect();
      this.stick.id = e.pointerId;
      this.stick.cx = r.left + r.width / 2;
      this.stick.cy = r.top + r.height / 2;
      base.classList.add("active");
      this.MoveStick(e.clientX, e.clientY);
    });
    this.Listen(base, "pointermove", (e) => {
      if (e.pointerId !== this.stick.id) return;
      e.preventDefault();
      this.MoveStick(e.clientX, e.clientY);
    });
    const end = (e) => { if (e.pointerId === this.stick.id) this.ReleaseStick(); };
    this.Listen(base, "pointerup", end);
    this.Listen(base, "pointercancel", end);
    this.Listen(base, "lostpointercapture", end);
  }

  MoveStick(clientX, clientY) {
    const s = this.stick;
    const dx = clientX - s.cx, dy = clientY - s.cy;
    const axes = StickAxes(dx, dy);
    s.strafe = axes.strafe; s.forward = axes.forward; s.over = axes.over;
    // 帽跟手，夹在半径上
    const R = BLOCKOUT_TOUCH.stickRadiusPx, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    this.knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
    this.stickEl.classList.toggle("over", axes.over);
  }

  ReleaseStick() {
    const s = this.stick;
    if (s.id !== null) { try { this.stickEl.releasePointerCapture(s.id); } catch { /* 已释放 */ } }
    s.id = null; s.strafe = 0; s.forward = 0; s.over = false;
    this.knob.style.transform = "";
    this.stickEl.classList.remove("active", "over");
  }

  BuildActions() {
    const col = El("div", "boTouchActions");
    this.btnPreviz = TouchButton("boTouchPreviz", "play", "预演");
    this.btnFly = TouchButton("boTouchFlyBtn", "fly", "飞行");
    this.btnMap = TouchButton("boTouchMap", "map", "地图");
    this.btnFly.setAttribute("aria-pressed", "false");
    this.Listen(this.btnPreviz, "click", () => this.Call("previz"));
    this.Listen(this.btnFly, "click", () => this.Call("fly"));
    this.Listen(this.btnMap, "click", () => this.Call("map"));
    col.append(this.btnPreviz, this.btnFly, this.btnMap);
    this.actionsEl = col;
    this.root.appendChild(col);

    // 飞行中的那一列：升 / 降按住（世界竖直，同 E / Q），加速是开关（同按住 Shift）
    const fly = El("div", "boTouchFly");
    this.btnUp = TouchButton("boTouchUp", "up", "升");
    this.btnDown = TouchButton("boTouchDown", "down", "降");
    this.btnBoost = TouchButton("boTouchBoost", "boost", "加速");
    this.btnBoost.setAttribute("aria-pressed", "false");
    for (const [btn, dir] of [[this.btnUp, 1], [this.btnDown, -1]]) {
      this.Listen(btn, "pointerdown", (e) => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
        this.riseHeld.set(e.pointerId, dir);
        btn.classList.add("held");
      });
      const end = (e) => {
        if (!this.riseHeld.delete(e.pointerId)) return;
        if (![...this.riseHeld.values()].includes(dir)) btn.classList.remove("held");
      };
      this.Listen(btn, "pointerup", end);
      this.Listen(btn, "pointercancel", end);
      this.Listen(btn, "lostpointercapture", end);
    }
    this.Listen(this.btnBoost, "click", () => this.SetBoost(!this.boost));
    fly.append(this.btnUp, this.btnDown, this.btnBoost);
    this.flyEl = fly;
    this.root.appendChild(fly);
  }

  SetBoost(on) {
    this.boost = !!on;
    this.btnBoost.classList.toggle("on", this.boost);
    this.btnBoost.setAttribute("aria-pressed", this.boost ? "true" : "false");
  }

  /** 右上「图层」按钮：展开 / 收起关卡下拉 + 图层开关 + 音量那块面板（界面模块的 topBarEl）。 */
  BuildMenu() {
    const btn = El("button", "boBtn boTouchMenuBtn");
    btn.type = "button";
    btn.setAttribute("aria-label", "关卡与图层");
    btn.setAttribute("aria-expanded", "false");
    const i = El("i", "boTouchIcon");
    i.innerHTML = ICONS.layers;
    btn.append(i, El("span", "boTouchLabel", "图层"));
    this.Listen(btn, "click", () => this.SetMenuOpen(!this.menuOpen));
    this.menuBtn = btn;
    this.root.appendChild(btn);
    // 点面板与按钮以外的地方收起（关卡下拉在面板里，算面板内）
    this.Listen(this.doc, "pointerdown", (e) => {
      if (!this.menuOpen) return;
      const t = e.target;
      if (btn.contains(t) || this.ui.topBarEl?.contains(t)) return;
      this.SetMenuOpen(false);
    }, true);
  }

  SetMenuOpen(open) {
    this.menuOpen = !!open;
    this.root.classList.toggle("touchMenu", this.menuOpen);
    this.menuBtn.classList.toggle("on", this.menuOpen);
    this.menuBtn.setAttribute("aria-expanded", this.menuOpen ? "true" : "false");
    if (!this.menuOpen) this.ui.CloseLevelMenu?.();
  }

  WireDocument() {
    // 音频：iOS 只把「手指抬起」算作能解锁音频的手势（按下那一下不算），开机挂的那次 pointerdown 解不开。
    // 宿主的 unlockAudio 自己判断已经在响就不再碰。
    const unlock = () => this.Call("unlockAudio");
    this.Listen(this.doc, "touchend", unlock, { capture: true, passive: true });
    this.Listen(this.doc, "pointerup", unlock, { capture: true, passive: true });
    // Safari 的双指缩放整页（无视 user-scalable）：编辑器里双指只给总图用
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      this.Listen(this.doc, type, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    }
    // 切走 / 锁屏：手指的抬起收不到，摇杆和升降钮别卡在按住
    this.Listen(this.doc, "visibilitychange", () => { if (this.doc.hidden) this.ReleaseAll(); });
    this.Listen(globalThis, "blur", () => this.ReleaseAll());
  }

  ReleaseAll() {
    this.ReleaseStick();
    this.riseHeld.clear();
    this.btnUp?.classList.remove("held");
    this.btnDown?.classList.remove("held");
    this.look.id = null;
  }

  // -------------------------------------------------------------------------
  // 总控接口

  /** 每帧：{ fly, previz, previzAvailable, map }，变了才碰 DOM。 */
  Sync(state = {}, force = false) {
    const next = {
      fly: !!state.fly, previz: !!state.previz, previzAvailable: !!state.previzAvailable, map: !!state.map,
    };
    const key = `${+next.fly}${+next.previz}${+next.previzAvailable}${+next.map}`;
    if (!force && key === this.stateKey) return;
    const was = this.state;
    this.stateKey = key;
    this.state = next;
    const root = this.root;
    root.classList.toggle("touchFly", next.fly);
    root.classList.toggle("touchPreviz", next.previz);
    root.classList.toggle("touchMap", next.map);
    this.btnPreviz.hidden = !(next.previzAvailable || next.previz);
    this.btnPreviz.classList.toggle("on", next.previz);
    this.btnPreviz.querySelector(".boTouchIcon").innerHTML = next.previz ? ICONS.stop : ICONS.play;
    this.btnPreviz.querySelector(".boTouchLabel").textContent = next.previz ? "停止" : "预演";
    this.btnPreviz.setAttribute("aria-label", next.previz ? "停止预演" : "预演这一段");
    this.btnFly.classList.toggle("on", next.fly);
    this.btnFly.setAttribute("aria-pressed", next.fly ? "true" : "false");
    this.btnFly.querySelector(".boTouchLabel").textContent = next.fly ? "退出" : "飞行";
    this.btnMap.classList.toggle("on", next.map);
    // 出了飞行：升降与加速归零（下次进来从常速起）
    if (was.fly && !next.fly) { this.riseHeld.clear(); this.btnUp.classList.remove("held"); this.btnDown.classList.remove("held"); this.SetBoost(false); }
    // 预演、总图接管时摇杆松开（手指还按着也不再推人）
    if (next.previz || next.map) this.ReleaseStick();
    if (next.map || next.previz) this.SetMenuOpen(false);
  }

  /**
   * 走路：没在飞行时把摇杆写进游戏的输入（Script_Main 读完键盘之后调）。键盘按着方向键就让键盘。
   * → true = 这一帧摇杆写了输入。
   */
  ApplyMove(input) {
    const s = this.stick;
    if (s.id === null || (!s.strafe && !s.forward) || !input) return false;
    if (input.forward || input.strafe) return false;
    input.forward = s.forward;
    input.strafe = s.strafe;
    if (s.over && !input.ads) input.sprint = true;
    return true;
  }

  /** 飞行：摇杆 + 升降钮 + 加速 → { forward, strafe, rise, boost }（各 ∈ [−1, 1]）。 */
  FlyAxes() {
    const s = this.stick;
    let rise = 0;
    for (const dir of this.riseHeld.values()) rise += dir;
    return { forward: s.forward, strafe: s.strafe, rise: Math.max(-1, Math.min(1, rise)), boost: this.boost || s.over };
  }

  /** 取证 / 测试用。 */
  State() {
    const s = this.stick;
    return {
      enabled: true,
      stick: { active: s.id !== null, strafe: s.strafe, forward: s.forward, over: s.over },
      fly: this.FlyAxes(), boost: this.boost, menuOpen: !!this.menuOpen,
      look: { active: this.look.id !== null, ...this.lookTotal },
      state: { ...this.state },
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ReleaseAll();
    for (const off of this.off) off();
    this.off = [];
    this.lookPad?.remove();
    this.stickEl?.remove();
    this.actionsEl?.remove();
    this.flyEl?.remove();
    this.menuBtn?.remove();
    this.root?.classList.remove("touchFly", "touchPreviz", "touchMap", "touchMenu");
    this.doc.body.classList.remove("blockoutTouch");
  }
}
