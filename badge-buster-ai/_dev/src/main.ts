import { createPixiApp } from './app/createPixiApp';
import { GameRoot } from './game/GameRoot';

// Entry: boot Pixi, hand off to GameRoot, fade out the HTML loader (§A.13).
async function boot() {
  const root = document.getElementById('stage-root')!;
  const app = await createPixiApp(root);
  const game = new GameRoot(app);
  await game.start();

  const loader = document.getElementById('boot');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 500);
  }
}

boot().catch((err) => {
  console.error('[badge-buster-ai] boot failed', err);
  const loader = document.getElementById('boot');
  if (loader) loader.innerHTML = '<div style="color:#ff6b6b">启动失败，请刷新重试</div>';
});
