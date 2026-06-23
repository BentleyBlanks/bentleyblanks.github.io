import type { GameContext, GameModule } from '../types/module.types';

interface PointerTrace {
  id: number;
  start: { x: number; y: number };
  path: { x: number; y: number }[];
  moved: boolean;
  lastEmitAt: number;
}

function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function createInputModule(): GameModule {
  let ctx: GameContext;
  let trace: PointerTrace | null = null;
  const threshold = 12;
  const swipeEmitIntervalMs = 28;

  function setCursor(x: number, y: number, pressed: boolean): void {
    const cur = ctx.state.ui.cursor;
    cur.x = x;
    cur.y = y;
    cur.pressed = pressed;
    cur.visible = true;
  }

  function down(event: PointerEvent): void {
    const point = canvasPoint(ctx.canvas, event);
    trace = { id: event.pointerId, start: point, path: [point], moved: false, lastEmitAt: performance.now() };
    ctx.canvas.setPointerCapture(event.pointerId);
    setCursor(point.x, point.y, true);
    // 仅在抬手且未移动时发 TAP（避免双发，且防止点 ✕ 后穿透）
  }

  function move(event: PointerEvent): void {
    const point = canvasPoint(ctx.canvas, event);
    setCursor(point.x, point.y, trace !== null); // 手指光标始终跟随，即使未按下
    if (!trace || trace.id !== event.pointerId) return;
    trace.path.push(point);
    if (Math.hypot(point.x - trace.start.x, point.y - trace.start.y) > threshold) trace.moved = true;
    const now = performance.now();
    if (trace.moved && now - trace.lastEmitAt >= swipeEmitIntervalMs) {
      ctx.bus.emit({ type: 'SWIPE', path: trace.path.slice(Math.max(0, trace.path.length - 5)), start: trace.start });
      trace.lastEmitAt = now;
    }
  }

  function up(event: PointerEvent): void {
    const point = canvasPoint(ctx.canvas, event);
    setCursor(point.x, point.y, false);
    if (!trace || trace.id !== event.pointerId) return;
    trace.path.push(point);
    if (trace.moved) {
      ctx.bus.emit({ type: 'SWIPE', path: trace.path.slice(Math.max(0, trace.path.length - 10)), start: trace.start, final: true });
    } else {
      ctx.bus.emit({ type: 'TAP', x: point.x, y: point.y });
    }
    trace = null;
  }

  function cancel(): void {
    trace = null;
    ctx.state.ui.cursor.pressed = false;
  }

  function leave(): void {
    if (!trace) ctx.state.ui.cursor.visible = false;
  }

  return {
    name: 'input',
    init(context) {
      ctx = context;
      ctx.canvas.style.touchAction = 'none';
      ctx.canvas.addEventListener('pointerdown', down);
      ctx.canvas.addEventListener('pointermove', move);
      ctx.canvas.addEventListener('pointerup', up);
      ctx.canvas.addEventListener('pointercancel', cancel);
      ctx.canvas.addEventListener('pointerleave', leave);
      ctx.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    },
    destroy() {
      ctx.canvas.removeEventListener('pointerdown', down);
      ctx.canvas.removeEventListener('pointermove', move);
      ctx.canvas.removeEventListener('pointerup', up);
      ctx.canvas.removeEventListener('pointercancel', cancel);
      ctx.canvas.removeEventListener('pointerleave', leave);
    },
  };
}
