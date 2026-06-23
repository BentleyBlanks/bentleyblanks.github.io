import './style.css';
import { createAudioModule } from './audio/audioManager';
import { createAutomationModule } from './automation/automationModule';
import { assetManifest, content } from './content';
import { createCoreModule } from './core/coreModule';
import { createEventBus } from './core/eventBus';
import { createInitialState, loadState } from './core/persistence';
import { createEconomyModule } from './economy/economyModule';
import { createInputModule } from './input/inputModule';
import { createRenderModule } from './render/renderModule';
import { createRepairModule } from './repair/repairModule';
import { createShopModule } from './shop/shopModule';
import { createSkillsModule } from './skills/skillsModule';
import type { GameContext, GameModule } from './types/module.types';
import { createUiModule } from './ui/uiModule';

const canvasElement = document.getElementById('game-canvas');
if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error('找不到游戏画布');
}

const canvas = canvasElement;
const renderingContext = canvas.getContext('2d');
if (!renderingContext) {
  throw new Error('当前浏览器不支持二维画布');
}
const ctx2d = renderingContext;

function resizeCanvas(): void {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const state = loadState() ?? createInitialState();
const bus = createEventBus();
const gameContext: GameContext = {
  state,
  bus,
  content,
  assets: assetManifest,
  canvas,
  ctx2d,
};

const modules: GameModule[] = [
  createEconomyModule(),
  createSkillsModule(),
  createShopModule(),
  createRepairModule(), // 维修台抽屉盖在底部控制栏之上：须先于 ui/core 订阅，命中维修抽屉时优先吞掉点击
  createUiModule(), // 须先于 core 订阅 TAP/SWIPE：命中画布 UI 时吞掉事件
  createCoreModule(),
  createAutomationModule(),
  createInputModule(),
  createRenderModule(),
  createAudioModule(),
];

for (const module of modules) {
  module.init(gameContext);
}

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;
  bus.emit({ type: 'TICK', dt });
  for (const module of modules) {
    module.update?.(dt);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
