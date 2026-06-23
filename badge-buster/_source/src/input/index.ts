// input —— 指针点/滑识别（Agent 3）
// 把 Pointer Events 转成逻辑坐标，识别 TAP / SWIPE 并通过 bus 发出。
// 只读 state（state.derived.swipeEnabled），从不改写 state。
import type { GameContext, GameModule } from '../types/module.types';
import { LOGICAL_W, LOGICAL_H } from '../types/layout';

interface Pt { x: number; y: number; }

// —— 手势识别阈值（逻辑像素）——
const MOVE_PUSH_DIST = 6;   // pointermove 距离节流：移动超过此距离才记一个新点
const SWIPE_TRAVEL_MIN = 24; // 累计行程超过此值（且允许滑动）才判定为 SWIPE

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createInputModule(): GameModule {
  let ctx!: GameContext;

  // 单一活跃指针：忽略其余指针，避免多点触控混乱
  let activeId: number | null = null;
  let pressed = false;
  let start: Pt = { x: 0, y: 0 };       // pointerdown 的逻辑坐标（TAP 用它最稳）
  let last: Pt = { x: 0, y: 0 };        // 上一个被记入 path 的点
  let path: Pt[] = [];                  // 累计逻辑路径
  let travel = 0;                       // 累计行程（各段长度之和）

  // 监听器引用（用于 destroy 时精确移除）
  let onDown: ((e: PointerEvent) => void) | null = null;
  let onMove: ((e: PointerEvent) => void) | null = null;
  let onUp: ((e: PointerEvent) => void) | null = null;
  let onCancel: ((e: PointerEvent) => void) | null = null;

  function toLogical(clientX: number, clientY: number): Pt {
    const rect = ctx.canvas.getBoundingClientRect();
    // 防止除零（画布尚未布局时 rect 可能为 0）
    const w = rect.width || 1;
    const h = rect.height || 1;
    const lx = ((clientX - rect.left) / w) * LOGICAL_W;
    const ly = ((clientY - rect.top) / h) * LOGICAL_H;
    return {
      x: clamp(lx, 0, LOGICAL_W),
      y: clamp(ly, 0, LOGICAL_H),
    };
  }

  function reset(): void {
    pressed = false;
    activeId = null;
    path = [];
    travel = 0;
  }

  function handleDown(e: PointerEvent): void {
    // 已有活跃指针时忽略后来者
    if (activeId !== null) return;
    activeId = e.pointerId;
    pressed = true;

    const p = toLogical(e.clientX, e.clientY);
    start = p;
    last = p;
    path = [p];
    travel = 0;

    // 捕获该指针：即使移出画布也能持续收到事件
    try {
      ctx.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 某些环境可能不支持，忽略即可
    }

    // 阻止滚动/选区/默认手势
    e.preventDefault();
  }

  function handleMove(e: PointerEvent): void {
    if (!pressed || e.pointerId !== activeId) return;
    e.preventDefault();

    const p = toLogical(e.clientX, e.clientY);
    const d = dist(p, last);
    if (d >= MOVE_PUSH_DIST) {
      travel += d;
      path.push(p);
      last = p;
    }
  }

  function handleUp(e: PointerEvent): void {
    if (!pressed || e.pointerId !== activeId) return;
    e.preventDefault();

    const up = toLogical(e.clientX, e.clientY);
    // 把抬起点纳入行程与路径（若与上一记录点有距离）
    const tail = dist(up, last);
    if (tail > 0) {
      travel += tail;
      path.push(up);
      last = up;
    }

    const swipeEnabled = ctx.state.derived.swipeEnabled;

    if (swipeEnabled && travel > SWIPE_TRAVEL_MIN) {
      // 复制路径，避免下游持有内部引用
      const out: { x: number; y: number }[] = path.map((q) => ({ x: q.x, y: q.y }));
      ctx.bus.emit({ type: 'SWIPE', path: out });
    } else {
      // 点击：用 pointerdown 起点（对轻点最可靠）
      ctx.bus.emit({ type: 'TAP', x: start.x, y: start.y });
    }

    try {
      ctx.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // 忽略
    }
    reset();
  }

  function handleCancel(e: PointerEvent): void {
    // pointercancel / pointerleave-like：放弃当前手势，不发出任何事件
    if (e.pointerId !== activeId) return;
    try {
      ctx.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // 忽略
    }
    reset();
  }

  return {
    name: 'input',
    init(c) {
      ctx = c;
      const canvas = ctx.canvas;

      onDown = handleDown;
      onMove = handleMove;
      onUp = handleUp;
      onCancel = handleCancel;

      // 需要 preventDefault 的监听器使用 { passive: false }
      canvas.addEventListener('pointerdown', onDown, { passive: false });
      canvas.addEventListener('pointermove', onMove, { passive: false });
      canvas.addEventListener('pointerup', onUp, { passive: false });
      canvas.addEventListener('pointercancel', onCancel, { passive: false });
      // 指针被捕获后通常不触发 leave，但保留兜底以防捕获失败
      canvas.addEventListener('pointerleave', onCancel, { passive: false });

      // 触摸设备上抑制默认手势（双击缩放、长按菜单等）
      canvas.style.touchAction = 'none';
    },
    destroy() {
      const canvas = ctx?.canvas;
      if (canvas) {
        if (onDown) canvas.removeEventListener('pointerdown', onDown);
        if (onMove) canvas.removeEventListener('pointermove', onMove);
        if (onUp) canvas.removeEventListener('pointerup', onUp);
        if (onCancel) {
          canvas.removeEventListener('pointercancel', onCancel);
          canvas.removeEventListener('pointerleave', onCancel);
        }
      }
      onDown = onMove = onUp = onCancel = null;
      reset();
    },
  };
}
