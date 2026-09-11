// User-approved appearances, 2026-09-11. Indices are zero-based source numbers.
// Retain source assets for animation provenance; only these appearances may spawn.
const nra = Object.freeze([1, 4]);
const ija = Object.freeze([0, 1, 2]);
export const CHARACTER_MODEL_VARIANTS_BY_KIND = Object.freeze({
  nra, nraDare: nra, nraOfficer: Object.freeze([4]),
  ija, ijaOfficer: Object.freeze([0]),
});
export const CHARACTER_PROTAGONIST_VARIANT = 1;
export const CHARACTER_INFANTRY_SOURCE_BY_MODEL = Object.freeze({ LugouNra05: "LugouNra02" });

// Favor the lighter approved skins in anonymous crowds; retain every soldier.
// NRA05: 8,683 triangles; IJA01: 11,106 (other approved IJA skins: 14,703/15,573).
const nraRandom = Object.freeze([1, 4, 4, 4]);
export const CHARACTER_RANDOM_VARIANTS_BY_KIND = Object.freeze({
  nra: nraRandom, nraDare: nraRandom, ija: Object.freeze([0, 0, 0, 1, 2]),
});
