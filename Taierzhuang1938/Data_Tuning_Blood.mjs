// Shared blood rendering, in metres and seconds. Visual calibration: BloodEffectsTest.
// Decal approach: Unity URP decal documentation; source texture: ExileGL, CC0.
export const BLOOD_TEXTURE = "./Texture/Texture_BloodSplatterCc0.png";
// Drops doubled 2026-09-13: a pumping stump keeps 15–25 drops in flight, and a close
// grenade opens up to four stumps at once (docs/Data_Dismemberment.md §11.8).
export const BLOOD_QUALITY = Object.freeze({
  low: { mist: 64, drops: 72, decals: 96, sources: 16 },
  medium: { mist: 112, drops: 128, decals: 160, sources: 24 },
  high: { mist: 192, drops: 192, decals: 256, sources: 32 },
  ultra: { mist: 256, drops: 256, decals: 320, sources: 40 },
});
export const BLOOD_MOTION = Object.freeze({ gravity: 9.81, drag: .65, dropLife: 1.8,
  mistLife: [.30, .76], mistRadius: [.045, .34], mistOpacity: .42,
  mistCount: 10, burstMistCount: 14, dropCount: 9, burstDropCount: 14,
  farStart: 28, farScaleMax: 1.65, maxDistance: 100,
  corpseSeconds: 9, corpseRate: 3.5, corpseSpeed: [.12, .4], corpseDropRadius: .22,
});
// Arterial source (source option `arterial:true`): a severed stump pumps in heartbeats rather
// than leaking at a constant rate. Each beat opens a short systolic jet — a tight cone of
// long drops dense enough to read as one arcing stream — and falls back to a weak dribble
// that pools under the stump. Pressure decays exponentially (blood loss) and the heart slows,
// so the jets shorten over the source's `seconds`. Old constant-rate spurts (2.4 s, tiny
// drops) were unreadable beyond two metres: 2026-09-13 player feedback, Dismemberment §11.8.
//   beatHz        heart rate at the start → end of the window (138 → 66 bpm)
//   systole       fraction of each beat that jets
//   pressureTauS  e-folding time of jet pressure; tailS fades the last seconds to zero
//   diastoleFlow  flow between jets as a fraction of the peak
//   dropHalfWidth / stretchPerSpeed / stretch  stream drop shape in metres (length follows speed)
//   farStartM / farScaleMax  widen the stream with distance so it keeps ~2 px out to ~25 m
//   upBias / minUp  lift the jet axis: a prone body's shoulder stump faces the ground, and a
//                   jet fired into the dirt is invisible (first capture, 2026-09-13)
//   speedJitter / jetSpread / beatWobble  a coherent jet: tiny per-drop scatter inside one beat
//                   (a wide cone reads as a fan of dashes), a small aim change between beats
//   beatSpeedDip   exit speed only sags this much at the edges of a beat; pressure sets the reach.
//                   A speed that follows the full beat curve makes late fast drops overtake early
//                   slow ones, and each beat collapses into a clump instead of a line
//   color          arterial blood is brighter than the fresh-spatter tone while it flies
export const BLOOD_ARTERIAL = Object.freeze({
  beatHz: [2.3, 1.1], systole: .36, pressureTauS: 2.6, tailS: 1.6, diastoleFlow: .1,
  upBias: .55, minUp: .3, speedJitter: .04, jetSpread: .03, beatWobble: .1, maxDropsPerFrame: 10,
  beatSpeedDip: .22,
  color: 0xb3261c,
  dribbleSpread: .3, dribbleSpeed: [.12, .55], poolDropRadius: .13,
  splashRadius: [.06, .13], splashDepositChance: .4, poolDeposits: 18,
  dropHalfWidth: [.014, .022], stretchPerSpeed: .04, stretch: [.05, .24],
  farStartM: 6, farScaleMax: 3,
  mistPerBeat: 3, mistMinPressure: .22, mistSpeed: [.9, 2.1], mistRadius: [.03, .15], mistLife: [.22, .5],
});
export const BLOOD_SURFACE = Object.freeze({
  // Planar limits reception around the hit tangent plane; cosine .8 caps stretch at 1.25x.
  projection: "planar", planarDepth: .035, planarNormalReject: .8, planarNormalFade: .95,
  depthFadeStart: .65, volumeNormalFade: .85,
  depth: .12, normalReject: .55, drySeconds: 85, lifeSeconds: 240,
  growSeconds: 1.8, minRadius: .035, maxRadius: .9, mergeDistance: .14,
  mergeMaxRadius: .62, mergeAreaScale: .35,
  fresh: 0x7d201a, dry: 0x3b1713, roughnessWet: .23, roughnessDry: .87,
});
export const BLOOD_DRESSING = Object.freeze({offset:[.24,0,-.22],minRadius:.32,radiusScale:.72,
  age:65,ageStep:7,aspect:.7,opacity:.82,normalSampleM:.15});

// Same damped ballistic solution as the particle vertex shader, with no Three dependency.
export function BloodPosition(origin, velocity, age, out) {
  const k = BLOOD_MOTION.drag, g = BLOOD_MOTION.gravity;
  const travel = -Math.expm1(-k * age) / k;
  out.x = origin.x + velocity.x * travel;
  out.y = origin.y + (velocity.y + g / k) * travel - g * age / k;
  out.z = origin.z + velocity.z * travel;
  return out;
}
