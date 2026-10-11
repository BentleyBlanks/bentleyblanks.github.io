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
//         "slap"    — seconds since the last slap landed (events.slapAt; the side struck is events.slapSide).
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

// 2026-10-11 the recruit's cut on the left cheek (clock "cheek": seconds since the cut, events.cheekAt). Script_OpeningLens
// hands lens.cheek = { flash, blood, opacity, daze } to the composite (uCheekCut: flash = the white sting on the left, blood =
// how far the streak has seeped in from the lower-left edge, opacity = how strong it is) and the daze to SideDaze on the left
// (with the slap's, the larger wins). All 0 = the composite untouched (Script_PostTest).
const CHEEK_CUT = Freeze({
  flash: K("cheek", [[0, 0], [0.02, 1], [0.15, 0]], { before: 0 }),
  blood: K("cheek", [[0, 0], [0.12, 0.18], [0.6, 0.62], [1.5, 1]], { before: 0 }),
  opacity: K("cheek", [[0, 0], [0.08, 0.85], [2.4, 0.75], [6, 0.5]], { before: 0 }),
  daze: K("cheek", [[0, 0], [0.04, 0.35], [1.2, 0.2], [2.4, 0]], { before: 0 }),
});
// The streak's strength at the hand-back, faded over Data_OpeningStoryboards.perception.releaseDecayS after it (the last
// value of CHEEK_CUT.opacity).
export const LENS_CHEEK_RESIDUE = 0.5;

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
  // SB03 lying in the mud watching the group (Wake → Wipe): blood-red corners ~0.3 fading in with the
  // concussion, near depth of field 0.5 focused ~3.8 m (foreground 0.3–1 m soft), mud on the lens.
  // 2026-09-27: the group is 2.3-4.2 m off the pinned eye now (focus 2.8), and the throat cut must read: mud 0.6.
  witness: Freeze({
    blendInS: 2.2,
    aberration: 0.0035,
    vignette: 0.52,
    bloodEdge: Freeze({ strength: Freeze({ clock: "phase", keys: Freeze([Freeze([0, 0.3])]), byConcussion: 0.5 }),
      tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    dofNear: Freeze({ strength: 0.45, focusM: 2.8, rangeM: 2.4, maxPx: 9 }),
    mud: 0.6,
  }),
  // 2026-09-27 rework (docs/Data_OpeningPinnedRescue20260927.md): the find and the questioning where he lies.
  // Found: ijaA's boots come up the trench at the eye, still dazed and muddy.
  found: Freeze({
    blendInS: 0.8,
    aberration: 0.003,
    vignette: 0.56,
    darken: 0.12,
    desaturate: 0.08,
    bloodEdge: Freeze({ strength: 0.2, tint: BLOOD_TINT, corners: WITNESS_CORNERS }),
    dofNear: Freeze({ strength: 0.3, focusM: 1.4, rangeM: 1.6, maxPx: 7 }),
    mud: 0.6,
  }),
  // Held up by the hair (Hold / Ask): nearly clean; each slap swims the struck side of the frame (`slap`: the amount
  // on the slap clock; Script_OpeningLens hands the side over with it, Script_PostComposite SideDaze) and kicks the
  // aberration. 「被扇的单边的屏幕有眩晕效果」.
  // 2026-09-30 「扇巴掌不需要出现血雾 Mask，应该是个眩晕的状态」: no blood here at all — the red corners fade out
  // with the blend from `found`, the slap leaves no HUD blood layer (strikeBlood is gone) and SideDaze washes the
  // struck side out instead of tinting it red; the blow itself is a short white flash (「眼冒金星」).
  held: Freeze({
    blendInS: 1.0,
    vignette: 0.5,
    desaturate: 0.12,
    slap: K("slap", [[0, 0], [0.04, 1], [0.5, 0.8], [1.4, 0.45], [2.4, 0]], { before: 0 }),
    aberration: K("slap", [[0, 0.0022], [0.04, 0.012], [0.9, 0.0022]], { before: 0.0022 }),
    flash: K("slap", [[0, 0], [0.03, 0.2], [0.3, 0]], { before: 0 }),
  }),
  // 2026-10-11 Blade (docs/Data_OpeningRedraft20261011Contract.md §1.10, N21): held as above, and the recruit's cut on the
  // LEFT cheek (`cheek`, on the cut's clock): a white sting on the left of the frame for 0.15 s, a streak of blood seeping in
  // from the lower-left edge, formed within 1.5 s, the left side dazed at 0.35 easing off over 2.4 s. No blood mist / red wash.
  blade: Freeze({
    blendInS: 0.6,
    vignette: 0.5,
    desaturate: 0.12,
    slap: K("slap", [[0, 0], [0.04, 1], [0.5, 0.8], [1.4, 0.45], [2.4, 0]], { before: 0 }),
    flash: K("slap", [[0, 0], [0.03, 0.2], [0.3, 0]], { before: 0 }),
    cheek: CHEEK_CUT,
  }),
  // The charge and the cuts (Charge / Melee): the last slap's daze wears off, then clean; the cheek's streak stays.
  charge: Freeze({
    blendInS: 0.4,
    vignette: 0.46,
    slap: K("slap", [[0, 0], [0.04, 1], [0.5, 0.8], [1.4, 0.45], [2.4, 0]], { before: 0 }),
    cheek: CHEEK_CUT,
  }),
  // The heave and the hand-over (Lift / Check): clean but for the streak on the cheek (it fades after the hand-back with the
  // concussion residue, Script_OpeningStoryboards.ReleasedPerception, LENS_CHEEK_RESIDUE).
  rescued: Freeze({
    blendInS: 0.6,
    cheek: CHEEK_CUT,
  }),
});

// The director's phases (Data_OpeningStoryboards.phases, contract §5.3 of the 01–06 round) → look.
// A phase not listed here is outside 01–02: Evaluate returns null.
export const PHASE_LOOKS = Freeze({
  Banter: "clean", Orders: "clean", Incoming: "clean",
  Blast: "nearMiss", Black: "nearMiss",
  Wake: "witness", FrontPass: "witness", CaptiveDragged: "witness", CaptiveWall: "witness",
  Interrogation: "witness", Slash: "witness", Taunt: "witness",
  Found: "found", Hold: "held", Ask: "held", Blade: "blade",
  Charge: "charge", Melee: "charge", Lift: "rescued",
  Check: "rescued", Released: "clean",
  // 2026-10-11 redraft (contract §2): Dir01's new 01 phases -- the black count, the drop-in, the sweep and the practice seen
  // from the pinned eye (witness), ijaA's walk up the trench finishing the bodies (found).
  Count: "clean", DropIn: "witness", Sweep: "witness", Practice: "witness", Finish: "found",
});

// Reduced motion (prefers-reduced-motion): the white flash is capped, the radial blur is off.
export const REDUCED_MOTION = Freeze({ flashMax: 0.35 });

// The mud overlay (Script_Hud lens layer): Lovart luminance mask baked to RGBA
// (alpha = luminance, never the generator's alpha; colour a dark wet-mud brown); see Texture/Hud/Data_HudDamageArtwork.md.
export const LENS_MUD_TEXTURE = "./Texture/Hud/Texture_LensMudSpatter.webp?v=20260925a";
