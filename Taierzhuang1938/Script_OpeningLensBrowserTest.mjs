// 01–02 storyboard lens in the real page (contract docs/Data_FirstLevelStoryboard0103Contract.md §4.4, §6;
// review 2026-09-25). The director's own events drive the looks — no Debug.OpeningLens.Force here:
//   - Blast: the radial blur reaches the composite (uRadialBlur > 0);
//   - Wake → Found: player mud and red corners, first person all through (2026-09-27: no cut-away camera);
//   - Ask: each slap swims the struck side of the frame (the composite's uSideDaze really gets it);
//   - loading phases: the world rifle stays hidden (one loading rifle on screen);
//   - no actor is taken out of the scene and put back within one frame (AI and director culling two frusta);
// and once the director lets go of the view (Released, the same frame RearTrench begins: Luo shoves the rifle into his
// hands, no pickup) the lens is off: Perception().lens null, the HUD mud / flash layers off, uRadialBlur 0, uBloodEdge.w 0,
// uSideDaze 0, the director's blood cap lifted; only the concussion residue and the cheek cut's streak stay and fade out
// over perception.releaseDecayS (2026-10-12). Also: no OpeningLens "has run … without" warning on the way.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { OpenCampaign, CloseCampaign, CaptureFailure } from "./Script_FirstLevelCampaignKit.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { LENS_CHEEK_RESIDUE } from "./Data_OpeningLens.mjs";

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
      return { radialBlur: U.uRadialBlur.value, bloodEdge: U.uBloodEdge.value.w, sideDaze: U.uSideDaze.value.y, sideDazeSide: U.uSideDaze.value.x,
        mudOn: hud.mud.on, mudOpacity: hud.mud.opacity,
        flashOn: hud.flash.on, flashOpacity: hud.flash.opacity, bloodCap: g.hud.storyBloodCap ?? 1 };
    };
    window.lensProbe = { phases: {}, drawn: {}, rifleShownInLoading: 0, order: [], Drawn, flapFrames: 0, flaps: [], slapDrawn: [] };
    // An actor taken out of the scene and put back (or the reverse) inside one frame: the AI culled against the
    // player's view and the director against its shot (2026-09-27, every frame through Incoming and the blast).
    const ai = g.ai, attach = ai._SetDetailedAttached.bind(ai), P = window.lensProbe;
    P.changed = new Map();
    ai._SetDetailedAttached = (actor, detailed) => {
      const was = !!actor?.root?.parent, out = attach(actor, detailed);
      if (actor?.root && was !== !!actor.root.parent) P.changed.set(actor.root, (P.changed.get(actor.root) || 0) + 1);
      return out;
    };
  });
  // 01–02 are watched: about 200 s of game time. Each round trip steps 600 frames and samples every one.
  let state = null;
  for (let round = 0; round < 40; round++) {
    state = await page.evaluate(() => {
      const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker, P = window.lensProbe;
      const RENDER = { Blast: 0.35, Interrogation: 1.0, Found: 0.5 };
      for (let i = 0; i < 600; i++) {
        const phase = s.phase, age = s.Age, render = RENDER[phase] != null && age >= RENDER[phase] && !P.drawn[phase];
        P.changed.clear();
        g.StepFrames(1, 1 / 60, render);
        const flapped = [...P.changed].filter(([, n]) => n > 1).map(([root]) => root.name);
        if (flapped.length) { P.flapFrames++; if (P.flaps.length < 8) P.flaps.push({ phase, age: +age.toFixed(2), flapped }); }
        // Each slap: the frame drawn 0.1 s after it lands.
        if (s.flags.slapAt != null && r.time - s.flags.slapAt >= .1 && !P.slapDrawn.some((d) => d.at === s.flags.slapAt)) {
          g.StepFrames(1, 1 / 60, true); P.slapDrawn.push({ at: s.flags.slapAt, side: s.flags.slapSide, ...P.Drawn() });
        }
        const lens = r.Perception().lens, row = P.phases[s.phase] ||= { frames: 0, lensFrames: 0, maxFlash: 0, maxMud: 0, maxSlap: 0, looks: [] };
        if (P.order.at(-1) !== s.phase) P.order.push(s.phase);
        row.frames++;
        if (lens) {
          row.lensFrames++; row.maxFlash = Math.max(row.maxFlash, lens.flash); row.maxMud = Math.max(row.maxMud, lens.mud); row.maxSlap = Math.max(row.maxSlap, lens.slap?.amount || 0);
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
  const probe = await page.evaluate(() => { const { Drawn, changed, ...rest } = window.lensProbe; return rest; });
  await fs.writeFile(path.join(output, "Data_OpeningLensProbe.json"), JSON.stringify({ state, probe, warnings }, null, 2));
  console.log("PHASES", probe.order.join(" "));
  console.log("DRAWN", JSON.stringify(probe.drawn));
  const P = probe.phases;
  // Inside 01–02 the lens is on every frame the director owns the view.
  for (const phase of ["Banter", "Blast", "Wake", "Interrogation", "Found", "Hold", "Ask", "Charge", "Lift"])
    assert.ok(P[phase]?.lensFrames > 0, `${phase}: a lens look is on (${JSON.stringify(P[phase])})`);
  for (const phase of ["Wake", "Interrogation", "Found"]) assert.ok(P[phase].maxMud > 0, `${phase}: mud on the lens (${P[phase].maxMud})`);
  assert.equal(P.Ask.maxMud, 0, "held up by the hair: the mud has cleared (the found look crossfades out over Hold)");
  assert.ok(P.Ask.maxSlap > 0.9, `Ask: the slaps swim the struck side (${P.Ask.maxSlap})`);
  // Each flap rescans the scene (bone pruning, prepass classes) and re-poses the actor in full: the 01 stutter.
  // One frame may still flap where the director first takes the view (the AI culled before it that frame).
  console.log("FLAPS", probe.flapFrames, JSON.stringify(probe.flaps));
  assert.ok(probe.flapFrames <= 2, `actors do not enter and leave the scene within one frame (${probe.flapFrames} frames: ${JSON.stringify(probe.flaps)})`);
  assert.equal(probe.rifleShownInLoading, 0, "the loading phases never show the world rifle next to the loading rifle");
  // The rendered side: the composite and the HUD really get the lens (so the residue checks below are not vacuous).
  assert.ok(probe.drawn.Blast?.radialBlur > 0.01, `Blast: radial blur in the composite (${JSON.stringify(probe.drawn.Blast)})`);
  // 2026-09-27: the interrogation is first person from the pinned eye (mud and red corners on).
  assert.ok(probe.drawn.Interrogation?.mudOn&&probe.drawn.Interrogation.bloodEdge>.05, `SB03: the pinned man's mud and red corners (${JSON.stringify(probe.drawn.Interrogation)})`);
  assert.ok(probe.drawn.Found?.mudOn, "Found: still muddy");
  console.log("SLAPS", JSON.stringify(probe.slapDrawn));
  assert.ok(probe.slapDrawn.length >= 2, `both slaps land (${probe.slapDrawn.length})`);
  for (const d of probe.slapDrawn) assert.ok(d.sideDaze > .8 && Math.sign(d.sideDazeSide) === Math.sign(d.side), `the composite swims the struck side (${JSON.stringify(d)})`);
  // 2026-10-12 R4-Gates: both blows are forehands on his left cheek since 2026-09-29 (a backhand is not seen from the pinned
  // eye; Data_OpeningStoryboards rescue.slap.blows side +1, +1). This still asked for one forehand and one backhand.
  const blowSides = C.rescue.slap.blows.map((blow) => Math.sign(blow.side));
  assert.deepEqual(probe.slapDrawn.slice(0, blowSides.length).map((d) => Math.sign(d.side)), blowSides,
    `the slaps land on the sides rescue.slap.blows gives (${JSON.stringify(blowSides)}: forehands on the left cheek)`);
  // ---- the hand-back ---------------------------------------------------------------------------------
  // 2026-10-12 R4-Gates, current hand-back (docs/Data_OpeningSelfRescue20260930.md, Data_OpeningRedraft20261011Contract.md):
  // Luo shoves the rifle into his hands, so Released hands the player control and RearTrench (Withdraw) begins in the same
  // frame -- no F pickup any more, and the Released phase is never on screen for a whole frame. The lens itself is off from
  // that frame (Perception().lens null, HUD mud / flash off, radial blur, side daze and blood edge 0, blood cap lifted); what
  // stays is the director's concussion residue and, from the cheek cut, its streak on the left cheek
  // (ReleasedPerception: LENS_CHEEK_RESIDUE x (1 - Smooth(t / releaseDecayS))), fading out over releaseDecayS.
  const handBack = await page.evaluate(() => {
    const s = window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker;
    return { released: s.beats.has("Released"), releaseAt: s.releaseAt, cut: s.flags["cut:cheek"] != null };
  });
  assert.ok(handBack.released && handBack.releaseAt != null && !["Trapped", "BunkerRescue"].includes(state.stage),
    `the director reaches the hand-back and 02's withdrawal begins (${JSON.stringify({ ...handBack, stage: state.stage, phase: state.phase })})`);
  assert.ok(handBack.cut, "the recruit's cheek cut happened (its streak is the residue checked below)");
  const decayS = C.perception.releaseDecayS;
  const Residue = (afterS) => page.evaluate(({ afterS }) => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.frontShow.bunker;
    // The withdrawal's pursuers are live; the lens is what is measured here, so the player is kept standing.
    for (let i = 0; i < 6000 && r.time - s.releaseAt < afterS; i++) { g.player.health = Math.max(g.player.health, 1e6); g.StepFrames(1, 1 / 60, false); }
    g.StepFrames(3, 1 / 60, true);
    const U = g.post.uniformsComposite;
    return { t: +(r.time - s.releaseAt).toFixed(2), stage: r.flow.stage.id, phase: s.phase, lens: r.Perception().lens,
      concussion: U.uConcussion.value.x, cheek: U.uCheekCut.value.toArray(), ...window.lensProbe.Drawn() };
  }, { afterS });
  const Clean = (x) => {
    const at = `${x.stage} +${x.t} s`;
    assert.equal(x.lens, null, `${at}: Perception().lens is null`);
    assert.ok(!x.mudOn && !x.flashOn && x.mudOpacity === 0 && x.flashOpacity === 0, `${at}: HUD mud / flash layers off (${JSON.stringify(x)})`);
    assert.equal(x.radialBlur, 0, `${at}: uRadialBlur 0`); assert.equal(x.bloodEdge, 0, `${at}: uBloodEdge.w 0`); assert.equal(x.sideDaze, 0, `${at}: uSideDaze.y 0`);
    assert.equal(x.bloodCap, 1, `${at}: the director's blood layer is uncapped`);
    assert.equal(x.cheek[0], 0, `${at}: no white sting after the hand-back`);
  };
  const residue = [];
  for (const afterS of [0, decayS * 0.25, decayS * 0.6, decayS + 0.5]) residue.push(await Residue(afterS));
  console.log("RESIDUE", JSON.stringify(residue.map(({ lens, ...x }) => ({ ...x, lens }))));
  for (const x of residue) Clean(x);
  const [first, ...later] = residue, last = residue.at(-1);
  assert.ok(first.concussion > 0 && first.cheek[1] === 1 && first.cheek[2] > LENS_CHEEK_RESIDUE * 0.9,
    `at the hand-back the concussion residue and the cheek streak (strength ${LENS_CHEEK_RESIDUE}) are there (${JSON.stringify(first)})`);
  for (let i = 1; i < residue.length - 1; i++)
    assert.ok(residue[i].concussion < residue[i - 1].concussion && residue[i].cheek[2] < residue[i - 1].cheek[2] && residue[i].cheek[2] > 0,
      `the residue fades over releaseDecayS (${decayS} s): ${JSON.stringify(residue.map((x) => [x.t, +x.concussion.toFixed(3), +x.cheek[2].toFixed(3)]))}`);
  assert.ok(last.concussion === 0 && last.cheek[2] === 0, `${decayS + 0.5} s after the hand-back nothing of 01–02 is left (${JSON.stringify(last)})`);
  assert.ok(later.every((x) => !["Trapped", "BunkerRescue"].includes(x.stage)), "the residue is sampled in the withdrawal, outside 01–02");
  assert.deepEqual(warnings, [], "no OpeningLens event warnings (every event the looks wait for arrived)");
  ok = true;
  console.log(`ok opening lens in the page: slaps ${probe.slapDrawn.map((d) => d.sideDaze.toFixed(2)).join("/")} on the struck side, first-person mud through Found, lens off at the hand-back, concussion and cheek streak gone ${decayS} s later`);
} catch (error) {
  await CaptureFailure(ctx).catch(() => {});
  throw error;
} finally {
  await CloseCampaign(ctx);
  if (!ok) process.exitCode = 1;
}
