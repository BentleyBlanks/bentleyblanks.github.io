// 01–02 storyboard lens in the real page (contract docs/Data_FirstLevelStoryboard0103Contract.md §4.4, §6;
// review 2026-09-25). The director's own events drive the looks — no Debug.OpeningLens.Force here:
//   - Blast: the radial blur reaches the composite (uRadialBlur > 0);
//   - Wake / Reach → Found: player mud and red corners; independent film coverage in between is clean;
//   - Butt: the rifle butt's white flash peaks ≥ 0.8 (the director's strikeAt really arrives);
//   - loading phases: the world rifle stays hidden (one loading rifle on screen);
// and once the director lets go of the view (Released, then the rifle pickup into RearTrench) nothing of the
// lens remains: Perception().lens null, the HUD mud / flash layers off, uRadialBlur 0, uBloodEdge.w 0, the
// director's blood cap lifted. Also: no OpeningLens "has run … without" warning on the way.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { OpenCampaign, CloseCampaign, CaptureFailure } from "./Script_FirstLevelCampaignKit.mjs";

const ctx = await OpenCampaign({ suite: "OpeningLensBrowser", quality: "low", stageFrom: 1, stageTo: 3 });
const { page, output } = ctx;
const warnings = [];
page.on("console", (m) => { if (/\[OpeningLens\]/.test(m.text())) warnings.push(m.text()); });
let ok = false;
try {
  await page.waitForFunction(() => window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker.ready, null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    // Rendered checks read what the last real frame drew: the composite's uniforms and the HUD layers.
    const Drawn = () => {
      const U = g.post.uniformsComposite, hud = g.hud.LensState();
      return { radialBlur: U.uRadialBlur.value, bloodEdge: U.uBloodEdge.value.w, mudOn: hud.mud.on, mudOpacity: hud.mud.opacity,
        flashOn: hud.flash.on, flashOpacity: hud.flash.opacity, bloodCap: g.hud.storyBloodCap ?? 1 };
    };
    window.lensProbe = { phases: {}, drawn: {}, rifleShownInLoading: 0, order: [], Drawn };
  });
  // 01–02 are watched: about 200 s of game time. Each round trip steps 600 frames and samples every one.
  let state = null;
  for (let round = 0; round < 40; round++) {
    state = await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker, P = window.lensProbe;
      const RENDER = { Blast: 0.35, Interrogation: 1.0, Reach: 0.5 };
      for (let i = 0; i < 600; i++) {
        const phase = s.phase, age = s.Age, render = RENDER[phase] != null && age >= RENDER[phase] && !P.drawn[phase];
        g.StepFrames(1, 1 / 60, render);
        const lens = r.Perception().lens, row = P.phases[s.phase] ||= { frames: 0, lensFrames: 0, maxFlash: 0, maxMud: 0, looks: [] };
        if (P.order.at(-1) !== s.phase) P.order.push(s.phase);
        row.frames++;
        if (lens) {
          row.lensFrames++; row.maxFlash = Math.max(row.maxFlash, lens.flash); row.maxMud = Math.max(row.maxMud, lens.mud);
          if (!row.looks.includes(lens.look)) row.looks.push(lens.look);
        }
        if (render) P.drawn[phase] = { age, ...P.Drawn() };
        if (["Banter", "Orders", "Incoming"].includes(s.phase) && r.bunkerRifle?.view?.visible) P.rifleShownInLoading++;
        if (s.phase === "Released" || !["Trapped", "BunkerRescue"].includes(r.flow.stage.id)) break;
      }
      return { phase: s.phase, stage: r.flow.stage.id, time: r.time, alive: g.player.Alive !== false };
    });
    if (state.phase === "Released" || !["Trapped", "BunkerRescue"].includes(state.stage)) break;
  }
  const probe = await page.evaluate(() => { const { Drawn, ...rest } = window.lensProbe; return rest; });
  await fs.writeFile(path.join(output, "Data_OpeningLensProbe.json"), JSON.stringify({ state, probe, warnings }, null, 2));
  console.log("PHASES", probe.order.join(" "));
  console.log("DRAWN", JSON.stringify(probe.drawn));
  assert.equal(state.phase, "Released", "the director reaches the hand-back");
  const P = probe.phases;
  // Inside 01–02 the lens is on every frame the director owns the view.
  for (const phase of ["Banter", "Blast", "Wake", "Interrogation", "Reach", "Found", "Butt", "Boots", "Hold"])
    assert.ok(P[phase]?.lensFrames > 0, `${phase}: a lens look is on (${JSON.stringify(P[phase])})`);
  assert.ok(P.Butt.maxFlash >= 0.8, `Butt: the butt strike's white flash peaks ≥ 0.8 (${P.Butt.maxFlash}) — the director's strikeAt arrives`);
  for (const phase of ["Wake", "Reach", "Found"]) assert.ok(P[phase].maxMud > 0, `${phase}: mud on the lens (${P[phase].maxMud})`);
  assert.equal(P.Hold.maxMud, 0, "SB05: the lens is clean again");
  assert.equal(P.Interrogation.maxMud, 0, "cinematic interrogation has no player mud overlay");
  assert.equal(probe.rifleShownInLoading, 0, "the loading phases never show the world rifle next to the loading rifle");
  // The rendered side: the composite and the HUD really get the lens (so the residue checks below are not vacuous).
  assert.ok(probe.drawn.Blast?.radialBlur > 0.01, `Blast: radial blur in the composite (${JSON.stringify(probe.drawn.Blast)})`);
  const cinema=probe.drawn.Interrogation;
  assert.ok(cinema&&cinema.bloodEdge===0&&cinema.radialBlur===0&&!cinema.mudOn&&cinema.mudOpacity===0&&!cinema.flashOn,
    `SB03: independent camera draws no player blood, mud or concussion (${JSON.stringify(cinema)})`);
  assert.ok(probe.drawn.Reach?.mudOn&&probe.drawn.Reach.bloodEdge>.05, "SB03A: player mud and red corners return");
  // ---- leaving 01–02: nothing remains --------------------------------------------------------------
  const Residue = () => page.evaluate(() => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
    g.StepFrames(3, 1 / 60, true);
    return { stage: r.flow.stage.id, phase: r.frontShow.bunker?.phase ?? null, lens: r.Perception().lens, ...window.lensProbe.Drawn() };
  });
  const Clean = (at, x) => {
    assert.equal(x.lens, null, `${at}: Perception().lens is null`);
    assert.ok(!x.mudOn && !x.flashOn && x.mudOpacity === 0 && x.flashOpacity === 0, `${at}: HUD mud / flash layers off (${JSON.stringify(x)})`);
    assert.equal(x.radialBlur, 0, `${at}: uRadialBlur 0`); assert.equal(x.bloodEdge, 0, `${at}: uBloodEdge.w 0`);
    assert.equal(x.bloodCap, 1, `${at}: the director's blood layer is uncapped`);
  };
  const released = await Residue();
  console.log("RELEASED", JSON.stringify(released));
  Clean("Released", released);
  // The real pickup (F on the rifle) starts RearTrench, outside the storyboard.
  await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyF", true); g.StepFrames(90, 1 / 60, false); g.Debug.Key("KeyF", false); g.StepFrames(10, 1 / 60, true); });
  let after = null;
  for (let i = 0; i < 20; i++) { after = await Residue(); if (after.stage !== "BunkerRescue" && after.stage !== "Trapped") break; }
  console.log("AFTER", JSON.stringify(after));
  assert.ok(!["Trapped", "BunkerRescue"].includes(after.stage), `the pickup leaves 01–02 (stage ${after.stage})`);
  Clean(after.stage, after);
  assert.deepEqual(warnings, [], "no OpeningLens event warnings (every event the looks wait for arrived)");
  ok = true;
  console.log(`ok opening lens in the page: flash ${P.Butt.maxFlash.toFixed(2)} in Butt, clean cinematic coverage, player mud returns at Reach, residue-free at Released and ${after.stage}`);
} catch (error) {
  await CaptureFailure(ctx).catch(() => {});
  throw error;
} finally {
  await CloseCampaign(ctx);
  if (!ok) process.exitCode = 1;
}
