import { FLOW_RENDERING, FLOW_DUSK, FLOW_NIGHT } from "../Data_Tuning_LevelFlow.mjs";

const day = {
  sky: {...FLOW_RENDERING.sky, sunDirection: [...FLOW_RENDERING.sky.sunDirection]},
  lighting: {ambient: FLOW_RENDERING.lighting.ambient, direct: FLOW_RENDERING.lighting.direct},
};

function Channels(hex) { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)); }
function MixHex(a, b, t) {
  const from = Channels(a), to = Channels(b);
  return "#" + from.map((value, axis) => Math.round(value + (to[axis] - value) * t).toString(16).padStart(2, "0")).join("");
}
function MixDirection(a, b, t) {
  const unit = vector => { const length = Math.hypot(...vector); return vector.map(value => value / length); };
  const from = unit(a), to = unit(b), mixed = from.map((value, axis) => value + (to[axis] - value) * t);
  const length = Math.hypot(...mixed) || 1;
  return mixed.map(value => value / length);
}

/** 0 = day, 1 = dusk; stepped so cached colors and static layers do not churn while the camera drifts. */
export function EncounterDuskBlend(focusZ) {
  if (!Number.isFinite(focusZ)) return 0;
  const t = Math.max(0, Math.min(1, (focusZ - FLOW_DUSK.fromZ) / (FLOW_DUSK.toZ - FLOW_DUSK.fromZ)));
  return Math.round(t * t * (3 - 2 * t) * FLOW_DUSK.steps) / FLOW_DUSK.steps;
}

/** Writes the blended sky and light balance into FLOW_RENDERING (shared by the software and WebGL rasters). */
export function ApplyEncounterSky(focusZ, night = 0) {
  const blend = EncounterDuskBlend(focusZ), sky = FLOW_RENDERING.sky, lighting = FLOW_RENDERING.lighting;
  for (const key of ["zenith", "horizon", "below", "sun"]) sky[key] = blend ? MixHex(day.sky[key], FLOW_DUSK.sky[key], blend) : day.sky[key];
  sky.sunDirection = blend ? MixDirection(day.sky.sunDirection, FLOW_DUSK.sky.sunDirection, blend) : [...day.sky.sunDirection];
  lighting.ambient = day.lighting.ambient + (FLOW_DUSK.lighting.ambient - day.lighting.ambient) * blend;
  lighting.direct = day.lighting.direct + (FLOW_DUSK.lighting.direct - day.lighting.direct) * blend;
  const nightBlend = Math.round(Math.max(0,Math.min(1,night)) * FLOW_DUSK.steps) / FLOW_DUSK.steps;
  if(nightBlend>0) {
    for (const key of ["zenith","horizon","below","sun"]) sky[key] = MixHex(sky[key],FLOW_NIGHT.sky[key],nightBlend);
    sky.sunDirection = MixDirection(sky.sunDirection,FLOW_NIGHT.sky.sunDirection,nightBlend);
    lighting.ambient += (FLOW_NIGHT.lighting.ambient - lighting.ambient) * nightBlend;
    lighting.direct += (FLOW_NIGHT.lighting.direct - lighting.direct) * nightBlend;
  }
  FLOW_RENDERING.skyBlend = blend + nightBlend * (FLOW_DUSK.steps+1);
  return blend;
}
