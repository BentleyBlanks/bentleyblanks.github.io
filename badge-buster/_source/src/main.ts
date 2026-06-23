// main —— 装配所有模块、驱动主循环（Agent 0）
import './style.css';
import { createEventBus } from './bus';
import { createInitialState, createCoreModule } from './core';
import { createEconomyModule } from './economy';
import { createShopModule } from './shop';
import { createSkillsModule } from './skills';
import { createAutomationModule } from './automation';
import { createInputModule } from './input';
import { createRenderModule } from './render';
import { createUiModule } from './ui';
import { createAudioModule } from './audio';
import { ICONS, UPGRADES, SKILLS, CUSTOMERS, ASSET_MANIFEST } from './content';
import { LOGICAL_W, LOGICAL_H } from './types/layout';
import type { GameContext, GameModule } from './types/module.types';

// 让 DOM 覆盖层与画布共享同一逻辑坐标系 960×640：
// 把 #ui 固定为 960×640，再整体 scale 到舞台实际尺寸 —— UI 用逻辑像素布局，
// 永远与画布像素对齐，移动端等比缩放不漂移。
function setupViewport(canvas: HTMLCanvasElement, uiRoot: HTMLElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')!;
  uiRoot.style.left = '0';
  uiRoot.style.top = '0';
  uiRoot.style.right = 'auto';
  uiRoot.style.bottom = 'auto';
  uiRoot.style.width = LOGICAL_W + 'px';
  uiRoot.style.height = LOGICAL_H + 'px';
  uiRoot.style.transformOrigin = 'top left';
  const resize = () => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rect = canvas.getBoundingClientRect();
    const scale = (rect.width || LOGICAL_W) / LOGICAL_W;
    uiRoot.style.transform = `scale(${scale})`;
  };
  resize();
  window.addEventListener('resize', resize);
  return ctx;
}

function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const loading = document.getElementById('loading');

  const ctx2d = setupViewport(canvas, uiRoot);
  const bus = createEventBus();
  const now = () => performance.now();
  const state = createInitialState(now());

  const context: GameContext = {
    state,
    bus,
    content: { icons: ICONS, upgrades: UPGRADES, skills: SKILLS, customers: CUSTOMERS },
    assets: ASSET_MANIFEST,
    canvas,
    ctx2d,
    uiRoot,
    now,
  };

  // 初始化顺序：economy 先算 derived，shop 依赖之；render/ui 在模拟之后画。
  const modules: GameModule[] = [
    createCoreModule(),
    createEconomyModule(),
    createShopModule(),
    createSkillsModule(),
    createAutomationModule(),
    createInputModule(),
    createRenderModule(),
    createUiModule(),
    createAudioModule(),
  ];

  for (const m of modules) m.init(context);

  if (loading) loading.remove();

  let last = performance.now();
  let rafId = 0;
  function frame(t: number) {
    const dt = Math.min(100, t - last);
    last = t;
    bus.emit({ type: 'TICK', dt });
    for (const m of modules) m.update?.(dt);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  // 开发期 HMR：热替换前停掉循环并销毁模块，避免循环/监听器/AudioContext 叠加
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cancelAnimationFrame(rafId);
      for (const m of modules) m.destroy?.();
    });
  }
}

boot();
