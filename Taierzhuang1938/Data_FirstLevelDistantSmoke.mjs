// Notion 游戏概念参考图 04–06: connected burning districts, not isolated wisps.
// Fixed random scatter keeps the same fires on the return trip and at checkpoints.
import { Mulberry32 } from "./Script_Noise.mjs";

export const DISTANT_SMOKE_SEED = 19380406;
export const DISTANT_SMOKE_REGIONS = Object.freeze([
  { id: "RoadBeyondBend", x: 112, z: -218, spread: 9, height: 44, reference: "04/04B road depth" },
  { id: "NorthRoofline", x: 5, z: -218, spread: 12, height: 39, reference: "04B/05 roofline" },
  { id: "NorthwestRidge", x: -64, z: -215, spread: 15, height: 49, reference: "05 left of tank" },
  { id: "WestFarSlope", x: -144, z: -153, spread: 14, height: 39, reference: "05B beyond withdrawal" },
  { id: "EastBurningDistrict", x: 127, z: -178, spread: 5, height: 43, reference: "04/05 eastern roofline" },
  { id: "CollectionWestRidge", x: -118, z: -28, spread: 14, height: 43, reference: "06 right ridge" },
  { id: "CollectionFarRoof", x: 48, z: -58, spread: 8, height: 39, dustHeight: 10, reference: "06B beyond collection ridge" },
  { id: "CollectionEastRidge", x: 129, z: -57, spread: 4, height: 46, dustHeight: 12, reference: "06 background haze" },
].map(Object.freeze));

export const DISTANT_SMOKE_TYPES = Object.freeze({
  sootColumn: Object.freeze({ frame: 0, height: 1, baseWidth: 10, crownWidth: 29, aspect: 1.14, opacity: 0.44, life: 30, drift: 21 }),
  billowColumn: Object.freeze({ frame: 1, height: 0.78, baseWidth: 12, crownWidth: 36, aspect: 0.94, opacity: 0.38, life: 37, drift: 28 }),
  dustBank: Object.freeze({ frame: 2, height: 0.20, baseWidth: 18, crownWidth: 37, aspect: 0.45, opacity: 0.30, life: 44, drift: 23 }),
  windShear: Object.freeze({ frame: 3, height: 0.40, baseWidth: 22, crownWidth: 48, aspect: 0.34, opacity: 0.26, life: 52, drift: 39 }),
});

export function BuildDistantSmoke(seed = DISTANT_SMOKE_SEED) {
  const random = Mulberry32(seed);
  const Between = (a, b) => a + (b - a) * random();
  return DISTANT_SMOKE_REGIONS.flatMap(region => Object.entries(DISTANT_SMOKE_TYPES).map(([type, profile], index) => {
    const scale = Between(0.88, 1.13), windAngle = Between(-0.28, 0.08);
    const backdrop = Object.freeze({
      type, frame: profile.frame, seed: Math.floor(random() * 0xffffffff),
      height: region.height * profile.height * scale,
      baseWidth: profile.baseWidth * scale, crownWidth: profile.crownWidth * scale,
      aspect: profile.aspect, opacity: profile.opacity * Between(0.93, 1.08),
      life: profile.life * Between(0.92, 1.12), spread: type === "dustBank" ? 6 : 2.6,
      driftX: -Math.cos(windAngle) * profile.drift, driftZ: Math.sin(windAngle) * profile.drift,
    });
    return Object.freeze({
      id: region.id + "_" + type, region: region.id, reference: region.reference,
      x: region.x + (index === 0 ? -0.85 : index === 1 ? 1.15 : 0) * region.spread + Between(-3, 3),
      z: region.z + Between(-5, 5),
      heightOffset: type === "windShear" ? 4 : type === "dustBank" ? region.dustHeight || 0.25 : 0.25,
      // Dedicated instances preserve low-quality density without taking combat slots.
      options: Object.freeze({ kind: "black", rate: 0, fire: 0, backdrop }),
    });
  }));
}

export const FIRST_LEVEL_DISTANT_SMOKE = Object.freeze(BuildDistantSmoke());
