// The 2026-09-22 topology retires the artificial crawl ceilings and former
// scripted track-only tank fixture. Preserve this registered entry point with
// normal controls: capture, optional gun, both batches through one breach,
// the same supply branch both ways, real bundle throw, relief and 06 departure.
// Only initial load reconstructs 03; no phase jumps or checkpoint retries.
process.argv = [process.execPath, 'Script_FirstLevelMissionBrowserTest.mjs',
  '--campaign', '--stage-from=3', '--stage-to=6', '--probe-front-gun'];
await import('./Script_FirstLevelMissionBrowserTest.mjs');
