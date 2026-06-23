// Browser-environment smoke test: boots ALL 9 modules under jsdom with stubbed
// Canvas2D + AudioContext, runs frames + interactions, asserts nothing throws.
import { JSDOM } from 'jsdom';
import { createEventBus } from './src/bus';
import { createInitialState, createCoreModule } from './src/core';
import { createEconomyModule } from './src/economy';
import { createShopModule } from './src/shop';
import { createSkillsModule } from './src/skills';
import { createAutomationModule } from './src/automation';
import { createInputModule } from './src/input';
import { createRenderModule } from './src/render';
import { createUiModule } from './src/ui';
import { createAudioModule } from './src/audio';
import { ICONS, UPGRADES, SKILLS, CUSTOMERS, ASSET_MANIFEST } from './src/content';
import { computeLayout } from './src/types/layout';
import type { GameContext, GameModule } from './src/types/module.types';
import type { GameEvent } from './src/types/events.types';

/* ---- jsdom env ---- */
const dom = new JSDOM('<!DOCTYPE html><body><canvas id="game"></canvas><div id="ui"></div></body>', { url: 'http://localhost/' });
const { window } = dom;
const g = globalThis as unknown as Record<string, unknown>;
g.window = window; g.document = window.document;
g.HTMLElement = window.HTMLElement; g.Image = window.Image; g.localStorage = window.localStorage;
(window as unknown as { devicePixelRatio: number }).devicePixelRatio = 2;

/* ---- fake Canvas2D (Proxy: known data props + everything else no-op) ---- */
let drawCalls = 0;
function fakeCtx(canvas: unknown): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const base: Record<string, unknown> = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: 'transparent', shadowBlur: 0, lineCap: 'butt', lineJoin: 'miter',
    measureText: (t: string) => ({ width: (t ? String(t).length : 0) * 6, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad,
    createPattern: () => ({}), getImageData: () => ({ data: [] }), getLineDash: () => [],
    clearRect: () => { drawCalls++; }, fillRect: () => { drawCalls++; },
  };
  return new Proxy(base, {
    get(t, p) { return p in t ? (t as Record<string | symbol, unknown>)[p] : () => {}; },
    set(t, p, v) { (t as Record<string | symbol, unknown>)[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

/* ---- fake Web Audio (generic no-op graph) ---- */
function audioNode(): unknown {
  return new Proxy({}, {
    get(_t, p) {
      if (p === 'gain' || p === 'frequency' || p === 'Q' || p === 'detune' || p === 'playbackRate')
        return new Proxy({ value: 0 }, { get: (tt, pp) => (pp in tt ? (tt as Record<string | symbol, unknown>)[pp] : () => {}), set: () => true });
      if (p === 'getChannelData') return () => new Float32Array(8);
      if (p === 'buffer' || p === 'type' || p === 'onended') return null;
      return () => {};
    },
    set: () => true,
  });
}
class FakeAudioContext {
  currentTime = 0; sampleRate = 44100; state = 'running'; destination = audioNode();
  createGain() { return audioNode(); }
  createOscillator() { return audioNode(); }
  createBiquadFilter() { return audioNode(); }
  createBufferSource() { return audioNode(); }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
g.AudioContext = FakeAudioContext;

/* ---- canvas wiring ---- */
const canvas = window.document.getElementById('game') as unknown as HTMLCanvasElement;
const fctx = fakeCtx(canvas);
(canvas as unknown as { getContext: () => unknown }).getContext = () => fctx;
(canvas as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 640, right: 960, bottom: 640, x: 0, y: 0, toJSON() {} } as DOMRect);

let handlerErrors = 0;
const realErr = console.error;
console.error = (...a: unknown[]) => { handlerErrors++; realErr('[handler-error]', ...a); };

let clock = 1000;
const now = () => clock;
const bus = createEventBus();
const state = createInitialState(now());
const ctx: GameContext = {
  state, bus,
  content: { icons: ICONS, upgrades: UPGRADES, skills: SKILLS, customers: CUSTOMERS },
  assets: ASSET_MANIFEST, canvas, ctx2d: fctx,
  uiRoot: window.document.getElementById('ui') as unknown as HTMLElement, now,
};

let failures = 0;
const assert = (c: boolean, m: string) => { console.log((c ? '  ok  - ' : '  FAIL- ') + m); if (!c) failures++; };

const modules: GameModule[] = [
  createCoreModule(), createEconomyModule(), createShopModule(), createSkillsModule(),
  createAutomationModule(), createInputModule(), createRenderModule(), createUiModule(), createAudioModule(),
];

let threw: unknown = null;
try {
  for (const m of modules) m.init(ctx);

  const tick = (ms: number) => { clock += ms; bus.emit({ type: 'TICK', dt: ms }); for (const m of modules) m.update?.(ms); };

  // 120 frames; tap occasionally, buy + use skills mid-run
  for (let f = 0; f < 120; f++) {
    if (f % 3 === 0) {
      const lay = computeLayout(state);
      const c = state.activeCustomers[0];
      const icon = c?.phone.icons.find((i) => i.badge > 0);
      if (c && icon) {
        const cell = lay.stations[0]?.cells.find((cc) => cc.col === icon.col && cc.row === icon.row);
        if (cell) bus.emit({ type: 'TAP', x: cell.rect.x + cell.rect.w / 2, y: cell.rect.y + cell.rect.h / 2 });
      }
    }
    if (f === 40) { state.points = 1e6; bus.emit({ type: 'BUY_UPGRADE', id: 'up_clear' }); bus.emit({ type: 'BUY_UPGRADE', id: 'up_swipe' }); }
    if (f === 50) bus.emit({ type: 'BADGE_CLEARED', customerId: 'syn', iconId: 'none', amount: 30000, x: 0, y: 0 }); // level burst → unlock skills
    if (f === 60) bus.emit({ type: 'USE_SKILL', id: 'skill_clearphone' });
    if (f === 70) bus.emit({ type: 'SWIPE', path: [{ x: 480, y: 300 }, { x: 500, y: 320 }, { x: 520, y: 340 }] });
    tick(16);
  }
} catch (e) { threw = e; }

console.log('# DOM boot + frames');
assert(threw === null, 'no exception during init/frames' + (threw ? ': ' + (threw as Error).stack : ''));
assert(handlerErrors === 0, `zero handler errors (${handlerErrors})`);
assert(drawCalls > 100, `render drew frames (${drawCalls} clear/fillRect calls)`);
const uiRoot = ctx.uiRoot;
assert(uiRoot.querySelectorAll('button').length > 0, `UI created buttons (${uiRoot.querySelectorAll('button').length})`);
assert(!!uiRoot.querySelector('.bb-audio-mute'), 'audio mute button mounted');
assert(uiRoot.textContent!.length > 0, 'UI rendered text');
assert(state.level >= 18, `leveled via burst (lvl ${state.level})`);

console.log('\n==== ' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES') + ' ====');
process.exit(failures === 0 ? 0 : 1);
