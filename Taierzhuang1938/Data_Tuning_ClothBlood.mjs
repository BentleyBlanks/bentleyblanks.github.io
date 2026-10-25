// Artistic two-layer absorbent-sheet model, NOT measured blood/cotton fluid physics.
// ml and seconds are authoring units; profiles describe relative retention and strike-through.
// Pigment is conserved, evaporation removes wetness only; the cloth solver is unchanged.
export const CLOTH_BLOOD_PROFILES = Object.freeze({
  thin: Object.freeze({ capacityMlM2: 240, diffusionM2S: 0.00020, penetrateS: 2.5, bindS: 65, dryingScale: 1 }),
  towel: Object.freeze({ capacityMlM2: 950, diffusionM2S: 0.00014, penetrateS: 28, bindS: 85, dryingScale: 1.3 }),
  quilt: Object.freeze({ capacityMlM2: 2200, diffusionM2S: 0.00010, penetrateS: 100, bindS: 100, dryingScale: 1.7 }),
});
export const CLOTH_BLOOD_DEFAULTS = Object.freeze({ amountMl: 40, feedMlS: 4, diffusion: 1, permeation: 1, wetReflect: 0.75, ageS: 0, drySeconds: 300 });
export const CLOTH_BLOOD_CONTROLS = Object.freeze([
  {key:'amountMl',min:1,max:500,step:1,unit:'ml'},
  {key:'feedMlS',min:0.1,max:30,step:0.1,unit:'ml/s'},
  {key:'diffusion',min:0,max:4,step:0.05},
  {key:'permeation',min:0,max:4,step:0.05},
  {key:'wetReflect',min:0,max:1,step:0.01},
  {key:'ageS',min:0,max:1800,step:5,unit:'s'},
  {key:'drySeconds',min:30,max:1800,step:10,unit:'s'},
]);
export const CLOTH_BLOOD_SIM = Object.freeze({ columns:64, maxRows:96, stepS:0.1, maxTimeS:3600, maxEvents:2048, checkpointSeconds:10, maxCheckpoints:24,
  sourceRadiusM:0.045, pigmentOpacity:0.96, visibleDensity:2, coverageScale:0.10, fiberAnisotropy:1.45 });
export function ClampClothBloodParameter(key,value) {
  const entry=CLOTH_BLOOD_CONTROLS.find(control=>control.key===key);
  return entry && Number.isFinite(value) ? Math.max(entry.min,Math.min(entry.max,value)) : null;
}
