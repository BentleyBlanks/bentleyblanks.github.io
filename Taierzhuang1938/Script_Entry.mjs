import {IsMenuStartup, LocalControlCenterUrl} from './Data_StartupRouting.mjs';

try {
  const params = new URLSearchParams(location.search);
  const controlCenter = LocalControlCenterUrl(location.href, params);
  if (controlCenter) {
    location.replace(controlCenter);
  } else if (IsMenuStartup(params)) {
    await import('./Script_MenuStartup.mjs');
  } else {
    // Development loads only the real imported module graph on demand (with ETag/304 caching
    // from LocalPreview), avoiding flooding HTTP/1.1 with 900+ unused editor/test modules.
    // Production skips this block and loads the separately stamped game bundle.
    if (!document.querySelector('meta[name="tengxian-bundle"]')) {
      const map = JSON.parse(document.querySelector('script[type="importmap"]').textContent);
      for (const href of [map.imports?.three, './Script_Main.mjs'].filter(Boolean)) {
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
