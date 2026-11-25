import {IsMenuStartup, LocalControlCenterUrl} from './Data_StartupRouting.mjs';

try {
  const params = new URLSearchParams(location.search);
  const controlCenter = LocalControlCenterUrl(location.href, params);
  if (controlCenter) {
    location.replace(controlCenter);
  } else if (IsMenuStartup(params)) {
    await import('./Script_MenuStartup.mjs');
  } else {
    // Preserve the flat development preload graph only for a real game/developer entry.
    // Production skips this loop and loads the separately stamped game bundle.
    const map = JSON.parse(document.querySelector('script[type="importmap"]').textContent);
    if (!document.querySelector('meta[name="tengxian-bundle"]')) {
      for (const href of new Set(Object.values(map.imports))) {
        if (href.includes('KTX2Loader')) continue;
        const link = document.createElement('link'); link.rel = 'modulepreload'; link.href = href;
        document.head.appendChild(link);
      }
    }
    await import('./Script_Main.mjs');
  }
} catch (error) {
  console.error('[Entry] Startup failed', error);
  window.__bootGuardFail?.(error.message, false);
}
