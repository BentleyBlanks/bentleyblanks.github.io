# StPageFlip 2.0.7

Source: https://github.com/Nodlik/StPageFlip
Package: https://registry.npmjs.org/page-flip/-/page-flip-2.0.7.tgz
License: MIT (see LICENSE).
Upstream module SHA-256: b718faafca6856bff51629baedeff601e2cc59482e951105bdbd6e46978cca38

Local change: replace the unconditional animation loop with Render.request() and Render.stop(). The archive requests a frame after state/size/page changes; active folds continue to animate, while a resting book makes no frame requests. Closing the archive calls stop before destroy to cancel the pending frame. The page geometry, clipping and shadow algorithms are unchanged.

The animation frame index is clamped to zero: a newly scheduled RAF timestamp may precede performance.now() sampled during the same display frame. This prevents a negative frame index on waking from idle.

Flip.stopMove(forceTurn=false) accepts a commit decision for a portrait touch swipe, continuing the existing curved sheet from its current position. Ordinary mouse release and cancellation keep the upstream default.
