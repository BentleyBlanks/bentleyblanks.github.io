// 《滕县 一九三八》加载画面里的那件道具 —— **宿主**。展示台本体在
// Script_BootPropStage.mjs，这里只管把它接到页面上。
//
// 为什么加载画面上要有一个能转的东西：加载是这个游戏唯一一段"玩家什么都做不了"
// 的时间（首关建场十几秒）。Easy Red 2 的做法是拿装备展示台把这段时间填掉 ——
// 玩家在等的同时把这一仗要用的东西认了一遍。这里照办，展示的是真·游戏里的
// 那批 TZM 模型（Model/*.tzm.json），不是另做的一套宣传资产：
// 玩家转过的这把汉阳造，进城以后端在手里的就是同一份网格。
//
// **默认在 worker 里转**（Script_BootPropWorker）：画布过继成 OffscreenCanvas，
// 主线程建关卡堵成什么样都不影响它。理由见那个文件的头注 —— 主线程在首关那
// 九秒里只交得出二十几帧，留在主线程上它就是一张幻灯片。
//
// 退路：浏览器没有 OffscreenCanvas / Worker，或者 worker 起不来（模块加载失败、
// WebGL 在 worker 里拿不到上下文），就地退回主线程跑同一个 PropStage。
// 退回时**换一张新画布**：transferControlToOffscreen 过继掉的画布回不来了。

import { PropStage, PickShowcase, ShortNote } from "./Script_BootPropStage.mjs";

export { PickShowcase, ShortNote };

/** worker 起来多久还没吱声就当它废了，走退路。 */
const WORKER_READY_TIMEOUT_MS = 4000;

export class BootProp {
  constructor(canvas, labelEl = null, noteEl = null) {
    this.canvas = canvas;
    this.labelEl = labelEl;
    this.noteEl = noteEl;
    this.visible = false;
    this.disposed = false;
    this.worker = null;
    this.stage = null;          // 退路模式下才有
    this.frame = 0;
    this.lastTime = 0;
    this.currentId = null;
    this.pointerId = null;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.onResize = () => this.Resize();
    window.addEventListener("resize", this.onResize);
    this.BindPointer(canvas);

    if (!this.StartWorker()) this.StartInline();
  }

  // -------------------------------------------------------------------------
  // 两种宿主
  // -------------------------------------------------------------------------

  /** 试着把画布过继给 worker。返回 false 表示这条路走不通，交给退路。 */
  StartWorker() {
    const canvas = this.canvas;
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return false;
    if (typeof canvas.transferControlToOffscreen !== "function") return false;
    let worker = null;
    try {
      // 版本戳跟着宿主模块自己的 query 走：worker 的 URL 不经过 import map，
      // 这里不接的话它会吃到缓存里的旧 worker。**不许在源码里写死 ?v=**。
      const here = new URL(import.meta.url);
      worker = new Worker(new URL(`./Script_BootPropWorker.mjs${here.search}`, here), { type: "module" });
    } catch { return false; }

    const size = this.Size();
    let offscreen = null;
    try { offscreen = canvas.transferControlToOffscreen(); } catch { worker.terminate(); return false; }

    this.worker = worker;
    this.workerReady = false;
    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === "ready") { this.workerReady = true; return; }
      if (msg.type === "prop") {
        this.currentId = msg.id;
        if (this.labelEl) this.labelEl.textContent = msg.name;
        if (this.noteEl) this.noteEl.textContent = msg.note;
      }
    };
    // worker 挂了（模块 404、worker 里拿不到 WebGL）就换张画布退回主线程。
    worker.onerror = () => this.FallBackToInline();
    worker.postMessage({
      type: "init", canvas: offscreen,
      width: size.width, height: size.height,
      pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    }, [offscreen]);
    setTimeout(() => { if (!this.workerReady && !this.disposed) this.FallBackToInline(); },
      WORKER_READY_TIMEOUT_MS);
    return true;
  }

  /** 主线程模式：同一个 PropStage，rAF 驱动。 */
  StartInline() {
    this.stage = new PropStage(this.canvas, { pixelRatio: window.devicePixelRatio || 1 });
    this.Resize();
    if (this.visible) this.Show();
  }

  /** worker 那条路断了。换一张画布（过继出去的那张回不来），就地起主线程模式。 */
  FallBackToInline() {
    if (this.disposed || this.stage) return;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    const old = this.canvas;
    const fresh = old.cloneNode(false);
    old.parentNode?.replaceChild(fresh, old);
    this.canvas = fresh;
    this.BindPointer(fresh);
    console.warn("[BootProp] worker 起不来，展示台退回主线程（加载时会卡顿）");
    this.StartInline();
  }

  // -------------------------------------------------------------------------

  Size() {
    return {
      width: Math.max(1, this.canvas.clientWidth || window.innerWidth),
      height: Math.max(1, this.canvas.clientHeight || window.innerHeight),
    };
  }

  BindPointer(canvas) {
    // 拖拽只在主线程收：worker 里没有 DOM 事件。收到就把增量转发过去。
    const push = (msg) => {
      if (this.worker) this.worker.postMessage(msg);
      else if (this.stage) {
        if (msg.type === "drag") this.stage.Drag(msg.dx, msg.dy);
        else if (msg.type === "dragStart") this.stage.DragStart();
        else if (msg.type === "dragEnd") this.stage.DragEnd();
      }
    };
    this.onDown = (event) => {
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add("dragging");
      push({ type: "dragStart" });
    };
    this.onMove = (event) => {
      if (!this.dragging || event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      push({ type: "drag", dx, dy });
    };
    this.onUp = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = null;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove("dragging");
      push({ type: "dragEnd" });
    };
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
  }

  UnbindPointer(canvas) {
    canvas.removeEventListener("pointerdown", this.onDown);
    canvas.removeEventListener("pointermove", this.onMove);
    canvas.removeEventListener("pointerup", this.onUp);
    canvas.removeEventListener("pointercancel", this.onUp);
  }

  Resize() {
    const size = this.Size();
    if (this.worker) this.worker.postMessage({ type: "resize", ...size });
    else this.stage?.Resize(size.width, size.height);
  }

  /** 露面：换一件、起循环。 */
  Show() {
    if (this.disposed) return;
    this.visible = true;
    this.canvas.classList.add("on");
    this.Resize();
    if (this.worker) { this.worker.postMessage({ type: "show", exceptId: this.currentId }); return; }
    if (!this.stage) return;
    this.LoadInline();
    if (!this.frame) {
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(this.Tick);
    }
  }

  async LoadInline() {
    const card = await this.stage.Load(PickShowcase(this.currentId));
    if (!card) return;
    this.currentId = card.id;
    if (this.labelEl) this.labelEl.textContent = card.name;
    if (this.noteEl) this.noteEl.textContent = card.note;
  }

  Hide() {
    this.visible = false;
    this.canvas.classList.remove("on");
    if (this.worker) { this.worker.postMessage({ type: "hide" }); return; }
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
  }

  Tick = (now) => {
    this.frame = requestAnimationFrame(this.Tick);
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.stage?.Tick(dt);
  };

  Dispose() {
    this.disposed = true;
    this.Hide();
    window.removeEventListener("resize", this.onResize);
    this.UnbindPointer(this.canvas);
    if (this.worker) { this.worker.postMessage({ type: "dispose" }); this.worker = null; }
    this.stage?.Dispose();
    this.stage = null;
  }
}
