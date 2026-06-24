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
    // The world container is up-scaled to fit the viewport, which stretches
    // rasterized text. Render at >=2x (capped at 3) so text stays crisp even
    // when the world scale exceeds 1 on large displays.
    resolution: Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
    powerPreference: 'high-performance',
  });
  mount.appendChild(app.canvas);
  return app;
}
