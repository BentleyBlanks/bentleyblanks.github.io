// 01–02 lens looks, storyboard round (contract docs/Data_FirstLevelStoryboard0103Contract.md §4.4,
// Notion 《过场动画分镜图》 SB02–SB06, survey Survey_A.md 「特效」 rows, Survey_Assets.md §6).
// Pure data (no three). Script_OpeningLens evaluates these into one `lens` per frame:
//   lens = { aberration, vignette, bloodEdge:{strength, tint, corners}, radialBlur,
//            dofNear:{strength, focusM, rangeM, maxPx}, dofFar:{strength, focusM, rangeM, maxPx},
//            flash, mud, desaturate, darken, storyBloodCap }
// and Script_Main maps it onto the post parameters (null outside 01–02: every parameter back to default).
// desaturate / darken / storyBloodCap are additions to the contract's field list (SB04A 「去色」 and 「血层淡到约
// 0.3」 — the cap applies to the director's HUD blood layer, Script_Hud.SetStoryBlood —, SB03A 「更暗」).
//
// A channel is either a number, or { clock, keys:[[t, v], ...], before?, byConcussion? }:
//   clock "phase"   — seconds since the director's phase began (the `age` argument);
//         "blast"   — seconds since the near miss (events.blastAt: FirstLevelOpening.BunkerBlast, the start of Blast);
//         "impact"  — seconds since the shell lands (events.impactAt when the director hands it; otherwise
//                     blastAt + SHELL_FLIGHT_S);
//         "buttHit" — seconds since the rifle butt lands (events.buttHit: the director's strikeAt, clip contact "strike");
//         "clearAt" — seconds since ijaA stops over the trap (events.clearAt: the director's flags.clearAt, Found).
//   keys are linear between points and held past both ends. `before` is used while that event has not
//   happened yet (default: the first key's value). `byConcussion` scales the value by
//   min(1, events.concussion / byConcussion) — 「随震荡量渐入」; no concussion given = full value.
// A look may set blendInS: the crossfade from whatever was shown before (default LOOK_BLEND_S).

const Freeze = (value) => Object.freeze(value);
const K = (clock, keys, extra = {}) => Freeze({ clock, keys: Freeze(keys.map(k => Freeze(k))), ...extra });

// Script_Main / Script_PostComposite defaults (aberration 0.0022 = uAberration, vignette 0.42 = the
// unsuppressed base, DOF focus/range/maxPx = the composite's own defaults). A look lists only what it changes.
export const LENS_DEFAULT = Freeze({
  aberration: 0.0022,
  vignette: 0.42,
  bloodEdge: Freeze({ strength: 0, tint: Freeze([0.55, 0.06, 0.05]), corners: Freeze([1, 1, 1, 1]) }),
  radialBlur: 0,
  dofNear: Freeze({ strength: 0, focusM: 1.6, rangeM: 0.85, maxPx: 4.5 }),
  dofFar: Freeze({ strength: 0, focusM: 1.5, rangeM: 2.8, maxPx: 11 }),
  flash: 0,
  mud: 0,
  desaturate: 0,
  darken: 0,
  storyBloodCap: 1,
});

// Crossfade between looks when the phase changes (s).
export const LOOK_BLEND_S = 0.6;

// The shell's flight after Blast begins (Script_OpeningStoryboards.Blast: FireShell {flight:.22}) — the optical
// hit starts when it lands, not when the phase starts. Used only while the director does not hand
// events.impactAt; Script_OpeningLensTest reads the director's FireShell flight and fails if they drift apart.
export const SHELL_FLIGHT_S = 0.22;

// Blood edge corners [top-left, top-right, bottom-left, bottom-right] (SB03: 「右上与左侧偏重」).
const WITNESS_CORNERS = Freeze([0.85, 1.0, 0.8, 0.3]);
const BLOOD_TINT = Freeze([0.55, 0.06, 0.05]);

export const LOOKS = Freeze({
  // SB01 and the shots the storyboard leaves clean (SB05A, SB06): the defaults.
  clean: Freeze({}),
  // SB02 near miss (Blast, carried through Black): aberration peaks ~0.02 (9× the default) and decays over
  // 1.5 s; edges dragged outward (radial blur); heavier vignette.
  nearMiss: Freeze({
    blendInS: 0.05,
    aberration: K("impact", [[0, 0.0022], [0.06, 0.02], [1.5, 0.0022]]),
    radialBlur: K("impact", [[0, 0], [0.06, 0.055], [0.75, 0.032], [1.6, 0]]),
    vignette: K("impact", [[0, 0.42], [0.1, 0.8], [2.4, 0.55]]),
  }),
  cinematic: Freeze({ blendInS: 0, vignette: 0.38, aberration: 0, mud: 0 }),
  // SB03 lying in the mud watching the group (Wake → Wipe): blood-red corners ~0.3 fading in with the
  // concussion, near depth of field 0.5 focused ~3.8 m (foreground 0.3–1 m soft), mud on the lens.
  witness: Freeze({
    blendInS: 2.2,
    aberration: 0.0035,
    vignette: 0.52,
    bloodEdge: Freeze({ strength: Freeze({ clock: "phase", keys: Freeze([Freeze([0, 0.3])]), byConcussion: 0.5 }),
      tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    dofNear: Freeze({ strength: 0.5, focusM: 3.8, rangeM: 2.8, maxPx: 9 }),
    mud: 0.85,
  }),
  // SB03A reaching for the rifle (Reach): darker, lower contrast, red edge weaker than SB03, mud.
  reach: Freeze({
    blendInS: 0.8,
    aberration: 0.003,
    vignette: 0.64,
    darken: 0.3,
    desaturate: 0.12,
    bloodEdge: Freeze({ strength: Freeze({ clock: "phase", keys: Freeze([Freeze([0, 0.17])]), byConcussion: 0.5 }),
      tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    dofNear: Freeze({ strength: 0.4, focusM: 3.8, rangeM: 2.8, maxPx: 9 }),
    mud: 0.85,
  }),
  // Found: as Reach until the blink (「泥土落下来。顺子闭了一下眼」, clearAt + 0.95–1.25 s); the mud goes
  // with the blink, so SB04 starts with a clean lens.
  found: Freeze({
    blendInS: 0.6,
    aberration: 0.003,
    vignette: 0.6,
    darken: K("clearAt", [[0.95, 0.3], [1.25, 0.08]]),
    desaturate: 0.1,
    bloodEdge: Freeze({ strength: K("clearAt", [[0.95, 0.17], [1.25, 0]]), tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    dofNear: Freeze({ strength: K("clearAt", [[0.95, 0.4], [1.25, 0]]), focusM: 3.8, rangeM: 2.8, maxPx: 9 }),
    mud: K("clearAt", [[0.95, 0.85], [1.25, 0]]),
  }),
  // Dragged out to the butt position (Drag → DragOut): SB04 has no red edge before the strike.
  dragged: Freeze({ blendInS: 0.8, aberration: 0.003, vignette: 0.5, desaturate: 0.05 }),
  // SB04 butt strike (Butt): white flash 0.08 s when the butt lands and a short aberration kick. The
  // storyboard frame is otherwise clean: no red edge of the lens's own, and the director's HUD blood layer
  // (0.92 after the strike) is capped to 0.5 once the flash has gone (review 09-25: the frame read all red).
  butt: Freeze({
    blendInS: 0.4,
    vignette: 0.48,
    flash: K("buttHit", [[0, 0.92], [0.08, 0.92], [0.2, 0]], { before: 0 }),
    aberration: K("buttHit", [[0, 0.014], [0.9, 0.0022]], { before: 0.0022 }),
    storyBloodCap: K("buttHit", [[0.1, 1], [0.4, 0.5]], { before: 1 }),
  }),
  // SB04A dragged into the SSW sap (Boots): blood layer down to ~0.3, desaturated.
  boots: Freeze({
    blendInS: 0.8,
    aberration: 0.004,
    vignette: 0.55,
    desaturate: 0.45,
    bloodEdge: Freeze({ strength: 0.3, tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    storyBloodCap: 0.3,
  }),
  // SB05 held by the collar (Hold → Collar): nearly clean (Glimpse keeps its light ghosting, which is the
  // director's concussion curve, not a lens look).
  held: Freeze({
    blendInS: 1.2,
    vignette: 0.46,
    desaturate: 0.15,
    bloodEdge: Freeze({ strength: 0.08, tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    storyBloodCap: 0.15,
  }),
});

// The director's phases (Data_OpeningStoryboards.phases, contract §5.3 of the 01–06 round) → look.
// A phase not listed here is outside 01–02: Evaluate returns null.
export const PHASE_LOOKS = Freeze({
  Banter: "clean", Orders: "clean", Incoming: "clean",
  Blast: "nearMiss", Black: "nearMiss",
  Wake: "witness", FrontPass: "witness", CaptiveDragged: "cinematic", CaptiveWall: "cinematic",
  Interrogation: "cinematic", Slash: "cinematic", Taunt: "cinematic", Wipe: "cinematic",
  Reach: "reach", Found: "found",
  Drag: "dragged", Snag: "dragged", KickBeam: "dragged", DragOut: "dragged",
  Butt: "butt", Boots: "boots",
  Hold: "held", Ask: "held", KickShunzi: "held", Glimpse: "held", Collar: "held",
  Chop: "clean", Parry: "clean", Flee: "clean", DragCover: "clean", LongShot: "clean",
  Check: "clean", KickRifle: "clean", Released: "clean",
});

// Reduced motion (prefers-reduced-motion): the white flash is capped, the radial blur is off.
export const REDUCED_MOTION = Freeze({ flashMax: 0.35 });

// The mud overlay (Script_Hud lens layer): Lovart luminance mask baked to RGBA
// (alpha = luminance, never the generator's alpha; colour a dark wet-mud brown); see Texture/Hud/Data_HudDamageArtwork.md.
export const LENS_MUD_TEXTURE = "./Texture/Hud/Texture_LensMudSpatter.webp?v=20260925a";
