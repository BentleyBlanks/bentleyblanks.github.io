// 输入抽象：把鼠标 / 触屏 / 键盘 / 陀螺仪统一成每帧可读的一份状态。
//
// 这个模块决定「手感」，所以设计上说三句：
// ① 位移一律换算成**归一化单位**（屏幕短边的比例），而不是像素——否则同一份
//    灵敏度代码在手机和桌面上会是两种游戏。
// ② 双指不只做缩放：两指夹角的变化做「转工具」（耳镊要转向、棉签要打圈），
//    两指中点位移做「微调进深」。采耳这种精细活，一个手势只干一件事是不够的。
// ③ 「精修档」把一切位移除以 3。这是给强迫症玩家的：最后 1mm 的活儿要能用
//    手指稳稳地做完。
//
// 顶层零副作用：事件监听在 CreateInput 里挂，Dispose 里摘干净。

import { Clamp, AngleDelta } from "./Script_Util.js";

const FINE_DIVISOR = 3;

export function CreateInput({ dom, on = {} } = {}) {
  const state = {
    // 本帧累计量，读完由 Consume() 清零
    dragX: 0, dragY: 0,          // 单指/鼠标拖拽，归一化（短边比例）
    pinch: 0,                    // 双指缩放增量（比例的对数，正=放大）
    twist: 0,                    // 双指夹角变化（弧度）
    panX: 0, panY: 0,            // 双指中点位移（归一化）
    wheel: 0,                    // 滚轮增量
    // 持续状态
    pointerActive: false,
    actionHeld: false,
    fine: false,                 // 精修档
    pressedCount: 0,
    lastX: 0, lastY: 0,          // 当前指针（归一化，左上为原点）
    // 陀螺仪（可选，仅在 enableGyro 后有效）
    gyro: { x: 0, y: 0, active: false },
    _gyroRaw: null,
    keyboard: { x: 0, y: 0, spin: 0 },
  };

  const pointers = new Map();
  let pinchPrevDist = 0;
  let twistPrevAngle = 0;
  let tapStart = 0;
  let tapStartX = 0;
  let tapStartY = 0;
  let longPressTimer = 0;
  let longPressFired = false;
  let lastTapTime = 0;
  let disposed = false;

  function ShortSide() {
    const rect = dom.getBoundingClientRect();
    return Math.max(1, Math.min(rect.width, rect.height));
  }

  function Normalize(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function ScaleSensitivity(v) {
    return state.fine ? v / FINE_DIVISOR : v;
  }

  function UpdatePinchTwist() {
    if (pointers.size < 2) {
      pinchPrevDist = 0;
      twistPrevAngle = 0;
      return;
    }
    const list = Array.from(pointers.values()).slice(0, 2);
    const dx = list[1].x - list[0].x;
    const dy = list[1].y - list[0].y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const angle = Math.atan2(dy, dx);
    if (pinchPrevDist > 0) {
      state.pinch += Math.log(dist / pinchPrevDist);
      state.twist += AngleDelta(twistPrevAngle, angle);
      const mx = (list[0].mx + list[1].mx) / 2;
      const my = (list[0].my + list[1].my) / 2;
      state.panX += (mx - (list[0].pmx + list[1].pmx) / 2) / ShortSide();
      state.panY += (my - (list[0].pmy + list[1].pmy) / 2) / ShortSide();
      for (const p of list) { p.pmx = p.mx; p.pmy = p.my; }
    }
    pinchPrevDist = dist;
    twistPrevAngle = angle;
  }

  function OnPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dom.setPointerCapture?.(event.pointerId);
    const n = Normalize(event.clientX, event.clientY);
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, mx: n.x, my: n.y, pmx: n.x, pmy: n.y,
    });
    state.pressedCount = pointers.size;
    state.pointerActive = true;
    longPressFired = false;
    if (pointers.size === 1) {
      tapStart = performance.now();
      tapStartX = event.clientX;
      tapStartY = event.clientY;
      ClearLongPress();
      longPressTimer = window.setTimeout(() => {
        longPressFired = true;
        on.longPress?.();
      }, 420);
    } else {
      ClearLongPress();
      pinchPrevDist = 0;
      twistPrevAngle = 0;
    }
    event.preventDefault();
  }

  function OnPointerMove(event) {
    const prev = pointers.get(event.pointerId);
    if (!prev) return;
    const n = Normalize(event.clientX, event.clientY);
    const rect = dom.getBoundingClientRect();
    const ndx = (event.clientX - prev.x) / rect.width;
    const ndy = (event.clientY - prev.y) / rect.height;
    prev.x = event.clientX;
    prev.y = event.clientY;
    prev.mx = n.x;
    prev.my = n.y;
    if (pointers.size === 1) {
      state.dragX += ScaleSensitivity(ndx);
      state.dragY += ScaleSensitivity(ndy);
      // 拖拽即视为取消长按：手指移动超过 8px 就不该再算长按
      if (Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY) > 8) ClearLongPress();
    } else {
      UpdatePinchTwist();
    }
    state.lastX = n.x;
    state.lastY = n.y;
    event.preventDefault();
  }

  function OnPointerUp(event) {
    const prev = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    state.pressedCount = pointers.size;
    state.pointerActive = pointers.size > 0;
    ClearLongPress();
    if (prev && !longPressFired && pointers.size === 0) {
      const moved = Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY);
      const held = performance.now() - tapStart;
      if (moved < 12 && held < 320) {
        const now = performance.now();
        if (now - lastTapTime < 300) on.doubleTap?.();
        else on.tap?.(Normalize(event.clientX, event.clientY));
        lastTapTime = now;
      }
    }
    if (pointers.size < 2) { pinchPrevDist = 0; twistPrevAngle = 0; }
    event.preventDefault?.();
  }

  function ClearLongPress() {
    if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = 0; }
  }

  function OnWheel(event) {
    state.wheel += Clamp(-event.deltaY / 400, -0.6, 0.6);
    event.preventDefault();
  }

  const KEY_MAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
  };
  const keys = new Set();

  function OnKeyDown(event) {
    if (event.code === "Space") {
      if (!state.actionHeld) { state.actionHeld = true; on.actionStart?.(); }
      event.preventDefault();
      return;
    }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") { SetFine(true); return; }
    if (event.code === "KeyQ") { keys.add("spinL"); return; }
    if (event.code === "KeyE") { keys.add("spinR"); return; }
    const mapped = KEY_MAP[event.code];
    if (mapped) { keys.add(mapped); event.preventDefault(); }
  }

  function OnKeyUp(event) {
    if (event.code === "Space") {
      state.actionHeld = false;
      on.actionEnd?.();
      return;
    }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") { SetFine(false); return; }
    if (event.code === "KeyQ") keys.delete("spinL");
    if (event.code === "KeyE") keys.delete("spinR");
    const mapped = KEY_MAP[event.code];
    if (mapped) keys.delete(mapped);
  }

  function OnBlur() {
    keys.clear();
    pointers.clear();
    state.pressedCount = 0;
    state.pointerActive = false;
    if (state.actionHeld) { state.actionHeld = false; on.actionEnd?.(); }
  }

  function OnOrientation(event) {
    if (event.beta === null && event.gamma === null) return;
    const beta = event.beta || 0;
    const gamma = event.gamma || 0;
    if (!state._gyroRaw) state._gyroRaw = { beta, gamma };
    // 相对首次读数取差：玩家怎么拿着手机都行，只要之后能微调就够了
    state.gyro.x = Clamp((gamma - state._gyroRaw.gamma) / 30, -1, 1);
    state.gyro.y = Clamp((beta - state._gyroRaw.beta) / 30, -1, 1);
    state.gyro.active = true;
  }

  function SetFine(on_) {
    if (state.fine === on_) return;
    state.fine = on_;
    on.fineMode?.(on_);
  }

  /** iOS 13+ 需要在用户手势里申请权限；没有权限就安静地失败。 */
  async function EnableGyro() {
    if (typeof DeviceOrientationEvent === "undefined") return false;
    try {
      const req = DeviceOrientationEvent.requestPermission;
      if (typeof req === "function") {
        const res = await req.call(DeviceOrientationEvent);
        if (res !== "granted") return false;
      }
      state._gyroRaw = null;
      window.addEventListener("deviceorientation", OnOrientation, true);
      return true;
    } catch (error) {
      console.warn("陀螺仪不可用：", error?.message || error);
      return false;
    }
  }

  function DisableGyro() {
    window.removeEventListener("deviceorientation", OnOrientation, true);
    state.gyro.active = false;
    state.gyro.x = 0;
    state.gyro.y = 0;
  }

  /** 键盘方向键折成和拖拽同一套语义，Consume 里一起结算。 */
  function CollectKeyboard(dt) {
    let kx = 0;
    let ky = 0;
    if (keys.has("left")) kx -= 1;
    if (keys.has("right")) kx += 1;
    if (keys.has("up")) ky -= 1;
    if (keys.has("down")) ky += 1;
    let spin = 0;
    if (keys.has("spinL")) spin -= 1;
    if (keys.has("spinR")) spin += 1;
    const speed = (state.fine ? 0.12 : 0.38) * dt;
    state.keyboard.x = kx * speed;
    state.keyboard.y = ky * speed;
    state.keyboard.spin = spin * (state.fine ? 1.2 : 3.0) * dt;
  }

  /**
   * 取走本帧的输入并清零。返回的这一份是「已经过精修档缩放」的结果，
   * 调用方不用再关心灵敏度。
   */
  function Consume(dt = 0.016) {
    CollectKeyboard(dt);
    const out = {
      dragX: state.dragX + state.keyboard.x,
      dragY: state.dragY + state.keyboard.y,
      pinch: state.pinch,
      twist: state.twist + state.keyboard.spin,
      panX: state.panX,
      panY: state.panY,
      wheel: state.wheel,
      gyroX: state.gyro.active ? state.gyro.x : 0,
      gyroY: state.gyro.active ? state.gyro.y : 0,
      actionHeld: state.actionHeld,
      fine: state.fine,
      pointerActive: state.pointerActive,
      pointerX: state.lastX,
      pointerY: state.lastY,
    };
    state.dragX = 0; state.dragY = 0;
    state.pinch = 0; state.twist = 0;
    state.panX = 0; state.panY = 0;
    state.wheel = 0;
    return out;
  }

  // touch-action / 选择 / 缩放都要在 CSS 之外再挡一道，否则 iOS 上会有橡皮筋滚动
  dom.style.touchAction = "none";
  dom.addEventListener("pointerdown", OnPointerDown, { passive: false });
  dom.addEventListener("pointermove", OnPointerMove, { passive: false });
  dom.addEventListener("pointerup", OnPointerUp, { passive: false });
  dom.addEventListener("pointercancel", OnPointerUp, { passive: false });
  dom.addEventListener("wheel", OnWheel, { passive: false });
  dom.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", OnKeyDown);
  window.addEventListener("keyup", OnKeyUp);
  window.addEventListener("blur", OnBlur);

  // 页面被藏起来时把按住的键/动作全部松开：否则切回来会「自己一直往前刮」
  function OnVisibility() { if (document.hidden) OnBlur(); }
  document.addEventListener("visibilitychange", OnVisibility);

  function Dispose() {
    if (disposed) return;
    disposed = true;
    ClearLongPress();
    dom.removeEventListener("pointerdown", OnPointerDown);
    dom.removeEventListener("pointermove", OnPointerMove);
    dom.removeEventListener("pointerup", OnPointerUp);
    dom.removeEventListener("pointercancel", OnPointerUp);
    dom.removeEventListener("wheel", OnWheel);
    window.removeEventListener("keydown", OnKeyDown);
    window.removeEventListener("keyup", OnKeyUp);
    window.removeEventListener("blur", OnBlur);
    document.removeEventListener("visibilitychange", OnVisibility);
    DisableGyro();
  }

  return {
    state, Consume, SetFine, EnableGyro, DisableGyro, Dispose,
    get fine() { return state.fine; },
    get gyroActive() { return state.gyro.active; },
  };
}
