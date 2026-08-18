// 《血战台儿庄》输入层：一张键位数据表 + 一个路由器。
//
// 为什么要把键位从装配层拆出来：原来 keydown/keyup/mousedown 三个监听器散在
// Script_Main.mjs 里，键位要做「按住/切换」「重绑定」「同一个键在不同上下文里
// 干不同的事」这三件事的任何一件，都要在七处 if 里改 —— 而这一批恰好三件都要做：
//   · Shift 一个键要按 ads 分流成「冲刺」与「屏息」（ER2 就是同键复用）；
//   · Digit1-6 从「下令」腾给「武器槽」，下令收进 Tab 按住时的上下文；
//   · Space 从「屏息」腾出来给第 3 批的翻越，且必须 preventDefault（否则滚页面）。
//
// 上下文（context）是这一层的核心：同一个 code 可以登记多条，
// 路由器按 Context() 返回的当前上下文挑一条。"any" 表示任何上下文都吃。
//
// 这里**不含任何游戏规则** —— 路由器只把物理按键翻译成动作名，
// 动作干什么全在 Script_Main 的 OnAction 里。

/** 连续量（每帧读）与边沿量（按下那一刻派发一次）的分界写在 mode 上。 */
export const KEYMAP = [
  // --- 移动：连续量，Read() 里合成成轴 ---------------------------------------
  { code: "KeyW", action: "moveForward", mode: "hold", context: "any" },
  { code: "KeyS", action: "moveBack", mode: "hold", context: "any" },
  { code: "KeyA", action: "moveLeft", mode: "hold", context: "any" },
  { code: "KeyD", action: "moveRight", mode: "hold", context: "any" },
  // Shift 一个键两用：开镜（ads > 0.6）时是屏息，否则是冲刺。卧姿冲刺 = 快速匍匐。
  { code: "ShiftLeft", action: "sprintOrHold", mode: "hold", context: "any" },
  { code: "ShiftRight", action: "sprintOrHold", mode: "hold", context: "any" },
  { code: "KeyQ", action: "leanLeft", mode: "hold", context: "any" },
  { code: "KeyE", action: "leanRight", mode: "hold", context: "any" },

  // --- 姿态 -----------------------------------------------------------------
  { code: "KeyC", action: "crouch", mode: "press", context: "any" },
  { code: "KeyZ", action: "prone", mode: "press", context: "any" },

  // --- 武器槽：ER2 的 1/2/3/4 = 长枪 / 驳壳枪 / 大刀 / 投掷物 ------------------
  // 只在 world 上下文吃；Tab 按住时同样四个键是「下令」。
  { code: "Digit1", action: "slot:primary", mode: "press", context: "world" },
  { code: "Digit2", action: "slot:secondary", mode: "press", context: "world" },
  { code: "Digit3", action: "slot:melee", mode: "press", context: "world" },
  { code: "Digit4", action: "slot:throwable", mode: "press", context: "world" },
  { code: "Digit0", action: "fireMode", mode: "press", context: "world" },

  // --- 下令：收进 Tab 按住的上下文 -------------------------------------------
  { code: "Tab", action: "orders", mode: "holdAction", context: "any", prevent: true },
  { code: "Digit1", action: "order:1", mode: "press", context: "orders" },
  { code: "Digit2", action: "order:2", mode: "press", context: "orders" },
  { code: "Digit3", action: "order:3", mode: "press", context: "orders" },
  { code: "Digit4", action: "order:4", mode: "press", context: "orders" },
  { code: "Digit5", action: "order:5", mode: "press", context: "orders" },
  { code: "Digit6", action: "order:6", mode: "press", context: "orders" },

  // --- 动词 -----------------------------------------------------------------
  { code: "KeyR", action: "reload", mode: "press", context: "any" },
  { code: "KeyT", action: "bipod", mode: "press", context: "any" },
  { code: "KeyV", action: "melee", mode: "press", context: "any" },
  { code: "KeyB", action: "bandage", mode: "press", context: "any" },
  { code: "KeyF", action: "support", mode: "press", context: "any" },
  { code: "KeyG", action: "cook:Grenade", mode: "holdAction", context: "any" },
  { code: "KeyH", action: "cook:GrenadeBundle", mode: "holdAction", context: "any" },
  // Space 这一批只做两件事：从屏息手里腾出来、把浏览器的滚页面挡掉。
  // 真正的翻越在第 3 批（Script_Player.TryVault），现在按下去只是空转一次动作名。
  { code: "Space", action: "vault", mode: "press", context: "any", prevent: true },
];

/** 鼠标：左键开火、右键开镜，都是连续量。滚轮循环切武器槽。 */
export const MOUSEMAP = [
  { button: 0, action: "fire", mode: "hold" },
  { button: 2, action: "ads", mode: "hold" },
];

export class InputRouter {
  /**
   * @param {object} hooks
   *   Context() -> "world" | "orders"   当前上下文
   *   Guard(event) -> boolean            返回 false 表示这次输入被吞掉（例如没拿到指针锁）
   *   OnAction(action, detail)           边沿动作回调
   */
  constructor({ Context = () => "world", Guard = () => true, OnAction = () => {} } = {}) {
    this.Context = Context;
    this.Guard = Guard;
    this.OnAction = OnAction;
    this.held = new Set();          // 按下的键码
    this.mouse = new Set();         // 按下的鼠标键号
    this.bound = null;
  }

  /** 当前上下文下这个 code 命中的那一条（context 精确匹配优先于 "any"）。 */
  _Lookup(code) {
    const ctx = this.Context();
    let fallback = null;
    for (const entry of KEYMAP) {
      if (entry.code !== code) continue;
      if (entry.context === ctx) return entry;
      if (entry.context === "any") fallback = entry;
    }
    return fallback;
  }

  Bind(target) {
    if (this.bound) return this;
    const onKeyDown = (e) => {
      const entry = this._Lookup(e.code);
      if (entry && entry.prevent) e.preventDefault();
      // 长按的自动重复不算新的一次按下
      if (this.held.has(e.code)) return;
      this.held.add(e.code);
      if (!entry) return;
      if (entry.mode === "press") this.OnAction(entry.action, { code: e.code });
      else if (entry.mode === "holdAction") this.OnAction(entry.action, { code: e.code, down: true });
    };
    const onKeyUp = (e) => {
      this.held.delete(e.code);
      // 抬起时要按**当前**上下文重查：Tab 松开的那一刻上下文已经从 orders 变回 world，
      // 所以 orders 这条本身必须是 context:"any"，否则松不开（曾经就是这么卡住的）。
      const entry = this._Lookup(e.code);
      if (entry && entry.mode === "holdAction") this.OnAction(entry.action, { code: e.code, down: false });
    };
    const onMouseDown = (e) => {
      if (this.Guard(e) === false) return;
      this.mouse.add(e.button);
      const entry = MOUSEMAP.find((m) => m.button === e.button);
      if (entry && entry.mode === "press") this.OnAction(entry.action, { button: e.button });
    };
    const onMouseUp = (e) => { this.mouse.delete(e.button); };
    const onWheel = (e) => {
      if (this.Context() !== "world") return;
      this.OnAction("cycleSlot", { delta: e.deltaY > 0 ? 1 : -1 });
    };
    const onContextMenu = (e) => e.preventDefault();
    const onBlur = () => { this.held.clear(); this.mouse.clear(); };

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    target.addEventListener("mousedown", onMouseDown);
    target.addEventListener("mouseup", onMouseUp);
    target.addEventListener("wheel", onWheel, { passive: true });
    target.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onBlur);
    this.bound = { target, onKeyDown, onKeyUp, onMouseDown, onMouseUp, onWheel, onContextMenu, onBlur };
    return this;
  }

  Down(code) { return this.held.has(code); }

  /**
   * 把按住的键翻译成连续量，写进 input。
   * @param {object} input 装配层那个常驻的输入结构
   * @param {object} ctx { ads } —— Shift 分流要用开镜量，路由器自己不该知道玩家状态
   */
  Read(input, { ads = 0 } = {}) {
    const h = this.held;
    input.forward = (h.has("KeyW") ? 1 : 0) - (h.has("KeyS") ? 1 : 0);
    input.strafe = (h.has("KeyD") ? 1 : 0) - (h.has("KeyA") ? 1 : 0);
    input.lean = (h.has("KeyE") ? 1 : 0) - (h.has("KeyQ") ? 1 : 0);
    // ER2 就是同键复用：开镜时按住 Shift 是屏息，不开镜时是冲刺。
    // 分流点取 ads > 0.6 而不是 ads > 0：开镜过程中（0→1 要 0.3 s）按住 Shift
    // 应该还在跑，跑到贴脸了才转成屏息，否则会出现"想冲刺却在原地憋气"。
    const shift = h.has("ShiftLeft") || h.has("ShiftRight");
    input.breathHold = shift && ads > 0.6;
    input.sprint = shift && !input.breathHold;
    input.fire = this.mouse.has(0);
    input.ads = this.mouse.has(2);
    return input;
  }

  Dispose() {
    if (!this.bound) return;
    const b = this.bound;
    b.target.removeEventListener("keydown", b.onKeyDown);
    b.target.removeEventListener("keyup", b.onKeyUp);
    b.target.removeEventListener("mousedown", b.onMouseDown);
    b.target.removeEventListener("mouseup", b.onMouseUp);
    b.target.removeEventListener("wheel", b.onWheel);
    b.target.removeEventListener("contextmenu", b.onContextMenu);
    window.removeEventListener("blur", b.onBlur);
    this.bound = null;
  }
}
