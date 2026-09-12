// Shared blood rendering, in metres and seconds. Visual calibration: BloodEffectsTest.
// Decal approach: Unity URP decal documentation; source texture: ExileGL, CC0.
export const BLOOD_TEXTURE = "./Texture/Texture_BloodSplatterCc0.png";
export const BLOOD_QUALITY = Object.freeze({
  low: { mist: 64, drops: 40, decals: 96, sources: 16 },
  medium: { mist: 112, drops: 64, decals: 160, sources: 24 },
  high: { mist: 192, drops: 96, decals: 256, sources: 32 },
  ultra: { mist: 256, drops: 128, decals: 320, sources: 40 },
});
export const BLOOD_MOTION = Object.freeze({ gravity: 9.81, drag: .65, dropLife: 1.8,
  mistLife: [.30, .76], mistRadius: [.045, .34], mistOpacity: .42,
  mistCount: 10, burstMistCount: 14, dropCount: 9, burstDropCount: 14,
  farStart: 28, farScaleMax: 1.65, maxDistance: 100,
  corpseSeconds: 9, corpseRate: 3.5, corpseSpeed: [.12, .4], corpseDropRadius: .22,
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
