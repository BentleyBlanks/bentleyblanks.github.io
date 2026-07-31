# Three.js runtime subset

This directory contains the minimal runtime subset used by `taihang/render3d.mjs`, vendored from `three@0.160.0` under the included MIT license.

The module files use the `.mjs` suffix so Windows Python static servers return a JavaScript MIME type. This keeps the 3D view available without a CDN connection and avoids the `text/plain` module rejection seen with `.js` files on that server.
