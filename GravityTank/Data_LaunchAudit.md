# GravityTank v0.11 launch audit

Date: 2026-09-04. Baseline: `1d4ed03b` / v0.9.

## Why mobile startup appeared frozen

`Game.Init` previously awaited `LoadAssets`, then the entire `AudioBus.LoadAll`,
before binding the start button or drawing the first battlefield. The title was
already visible, so a tap on NEW CAMPAIGN appeared unresponsive.

- `LoadAssets` waited for fonts, then used **19 successive `await load(...)`**
  expressions inside an object literal. Each image added another request round trip.
- The preloaded Latin and simplified Chinese font files were 658,496 and 662,044
  bytes. Both were complete font packs, not small subsets. Google Fonts also added
  an external render-blocking stylesheet dependency.
- Audio's 13 requests were already parallel, but the whole pack (including BGM
  download and decoding) still blocked startup. A failed/stalled resource had no
  deadline or useful visible progress.
- Player tinting also read and rewrote sprite pixels on every render. This was a
  running-game cost, separate from the startup dependency chain.

## Changes

- Immediate inline loading screen: real completed preparation tasks, percentage,
  slower-network hint, timeout/failure feedback and reload action. Progress counts
  the program, five necessary images and the first battlefield; it is task progress,
  not a byte-download percentage. Controls become usable only when these finish.
- Five small core textures load in parallel. Optional artwork and the single local
  CJK/Latin font load after the title becomes usable, with readable system fonts
  meanwhile. No Google Fonts request or duplicate Latin font download.
- Existing audio downloads/decodes after starting the campaign, with three workers,
  bounded waits and the existing fallback sounds. Late BGM honors pause/resume.
  No audio was generated or replaced.
- Six cosmetic paints including pink, actual sprite preview, keyboard/touch buttons,
  persistent preference separate from campaign saves. Rendered tint frames are cached.
  The concurrent v0.10 easy/standard-mode and one-hit-life update is preserved; paint
  does not reintroduce hull HP, HP shades or HP pips.
- Generated arcade housing, live seven-wedge drawing, prize icons, readable result
  strip and charge percentage. Prize odds and physics are unchanged.

## Local cold-start measurement

Headless Edge, 390×844 touch viewport, cold browser context/cache disabled,
1.6 Mbps download (200,000 bytes/s), 150 ms network latency, 4× CPU slowdown.
Both versions served locally without compression. Baseline Google font CSS was
stubbed empty to exclude external network variability; this favors the baseline.

| Metric | Before | Optimized build |
|---|---:|---:|
| First contentful paint | 2.148 s | 0.840 s |
| First battlefield / interactive title prepared | 17.733 s | 4.110 s |
| Resource body bytes completed before readiness (HTML excluded) | 2,545,943 | 454,658 |

The measured preparation time fell **77%**. The new loader reveals the title after
two additional animation frames so its completed state can paint. These are local
simulated-network measurements, not physical iPhone/Android or live Pages guarantees.
An earlier measurement before deferring font fetching was 5.984 s for the new build.

## Verification

`node --check GravityTank/Script_Game.mjs`

`node --check GravityTank/Script_PlayerPaint.mjs`

Start the repository local preview, then:

`node GravityTank/Script_LaunchSmokeTest.mjs http://127.0.0.1:8080/GravityTank/`

Browser checks cover real intermediate progress, missing core image/module,
optional fonts/art/audio unavailable, six color choices, keyboard selection,
reload persistence, pink pixels at all four power tiers, checkpoint restoration,
unavailable localStorage, late BGM while paused, resume, exact 4/2/1 roulette tiers,
actual mouse and touch plunger input, and 320×568, 390×844, 844×390, 1440×1000 layouts.
Screenshots are saved to ignored `tmp/GravityTankQa/` for local inspection.

Also run `node GravityTank/Script_EasyModeTest.mjs` after integration with v0.10 to
verify easy/standard self-hit behavior, one-hit lives, armor, shields and legacy saves.

## Generated art provenance

Tool: **tier 1, Codex CLI `gpt-5.6-sol` using built-in `image_gen__imagegen`**.
Succeeded; no Lovart or Dreamina fallback. Output was resized and compressed to
768×768 WebP, preserving alpha, 111,376 bytes (~109 KiB).

Shipped asset: [`assets/Texture_RouletteArcadeRim.webp`](assets/Texture_RouletteArcadeRim.webp).
The original generated PNG is a local intermediate, not a runtime dependency.

Generation prompt:

```text
Use case stylized-concept. Asset: a centered perfectly circular arcade prize-wheel
metal rim, front orthographic view, square 1024x1024 canvas. Retro tank arcade
aesthetic, chunky machined gunmetal outer ring, warm brass bevels, small evenly
spaced amber bulb sockets, cyan enamel accents, crisp restrained pixel-inspired
industrial detail. Ring outer radius 480px and inner radius 405px centered at
512,512. Empty flat very dark center and outside. No wedges, no symbols, no words,
no letters, no numbers, no pointer, no perspective, no rectangular cabinet. This
image will be clipped into a circular ring around seven live game wedges.
```
