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
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function createInputModule(): GameModule {
  let ctx: GameContext;
  let trace: PointerTrace | null = null;
  const threshold = 12;
  const swipeEmitIntervalMs = 28;

  function down(event: PointerEvent): void {
    const point = canvasPoint(ctx.canvas, event);
    trace = { id: event.pointerId, start: point, path: [point], moved: false, lastEmitAt: performance.now() };
    ctx.canvas.setPointerCapture(event.pointerId);
    ctx.bus.emit({ type: 'TAP', x: point.x, y: point.y });
  }

  function move(event: PointerEvent): void {
    if (!trace || trace.id !== event.pointerId) {
      return;
    }
    const point = canvasPoint(ctx.canvas, event);
    trace.path.push(point);
    if (Math.hypot(point.x - trace.start.x, point.y - trace.start.y) > threshold) {
      trace.moved = true;
    }

    const now = performance.now();
    if (trace.moved && ctx.state.derived.swipeEnabled && now - trace.lastEmitAt >= swipeEmitIntervalMs) {
      const segment = trace.path.slice(Math.max(0, trace.path.length - 5));
      ctx.bus.emit({ type: 'SWIPE', path: segment });
      trace.lastEmitAt = now;
    }
  }

  function up(event: PointerEvent): void {
    if (!trace || trace.id !== event.pointerId) {
      return;
    }
    const current = canvasPoint(ctx.canvas, event);
    trace.path.push(current);
    if (trace.moved && ctx.state.derived.swipeEnabled) {
      ctx.bus.emit({ type: 'SWIPE', path: trace.path.slice(Math.max(0, trace.path.length - 10)) });
    } else if (!trace.moved) {
      ctx.bus.emit({ type: 'TAP', x: current.x, y: current.y });
    }
    trace = null;
  }

  return {
    name: 'input',
    init(context) {
      ctx = context;
      ctx.canvas.style.touchAction = 'none';
      ctx.canvas.addEventListener('pointerdown', down);
      ctx.canvas.addEventListener('pointermove', move);
      ctx.canvas.addEventListener('pointerup', up);
      ctx.canvas.addEventListener('pointercancel', () => {
        trace = null;
      });
      ctx.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    },
    destroy() {
      ctx.canvas.removeEventListener('pointerdown', down);
      ctx.canvas.removeEventListener('pointermove', move);
      ctx.canvas.removeEventListener('pointerup', up);
    },
  };
}
