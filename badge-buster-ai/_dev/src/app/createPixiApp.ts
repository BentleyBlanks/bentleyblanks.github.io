import { Application } from 'pixi.js';
import { COLORS } from '../config/theme';

// PixiJS v8 Application bootstrap (§A.1). Async init is required in v8.
export async function createPixiApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    background: COLORS.bg0,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    powerPreference: 'high-performance',
  });
  mount.appendChild(app.canvas);
  return app;
}
