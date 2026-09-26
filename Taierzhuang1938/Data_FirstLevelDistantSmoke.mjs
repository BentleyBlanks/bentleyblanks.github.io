// Notion 游戏概念参考图 04–06 (including the B views), 2026-09-26.
// World-space backdrop: roof/ridge silhouettes behind the fight, never attached
// to a mission marker. A fixed seed preserves the same fires on the return trip.
import { Mulberry32 } from "./Script_Noise.mjs";

export const DISTANT_SMOKE_SEED = 19380406;
export const DISTANT_SMOKE_REGIONS = Object.freeze([
  { id: "RoadBeyondBend", x: 117, z: -218, jitterX: 7, jitterZ: 5, height: 32, width: 8.6, reference: "04/04B road depth" },
  { id: "NorthRoofline", x: 8, z: -221, jitterX: 7, jitterZ: 4, height: 28, width: 7.6, reference: "04B/05 roofline" },
  { id: "NorthwestRidge", x: -65, z: -212, jitterX: 8, jitterZ: 6, height: 38, width: 10.2, reference: "05 left of tank" },
  { id: "WestFarSlope", x: -139, z: -154, jitterX: 10, jitterZ: 9, height: 30, width: 8.7, reference: "05B beyond withdrawal" },
  { id: "CollectionWestRidge", x: -105, z: -27, jitterX: 9, jitterZ: 8, height: 31, width: 9.4, reference: "06 right ridge" },
  { id: "CollectionFarRoof", x: 46, z: -60, jitterX: 3, jitterZ: 4, height: 28, width: 8.4, reference: "06B beyond the collection ridge" },
  { id: "CollectionEastRidge", x: 128, z: -67, jitterX: 5, jitterZ: 8, height: 34, width: 9.2, reference: "06 background haze" },
].map(Object.freeze));

export function BuildDistantSmoke(seed = DISTANT_SMOKE_SEED) {
  const random = Mulberry32(seed);
  const Between = (a, b) => a + (b - a) * random();
  return DISTANT_SMOKE_REGIONS.map(region => {
    const life = Between(9.2, 10.6);
    // Shared westward drift, small local variation. It projects differently as
    // the player turns between the captured nest, tank and collection hollow.
    const windAngle = Between(-0.30, 0.04), windSpeed = Between(0.95, 1.55);
    return Object.freeze({
      id: region.id, reference: region.reference,
      x: region.x + Between(-region.jitterX, region.jitterX),
      z: region.z + Between(-region.jitterZ, region.jitterZ),
      heightOffset: 0.2,
      options: Object.freeze({
        kind: "black", rate: Between(0.9, 1.0), life,
        radius: Between(0.65, 1.25), rise: region.height / life,
        sizeStart: Between(2.5, 3.2), sizeEnd: region.width * Between(1.28, 1.45),
        opacity: Between(0.55, 0.66), growthPower: Between(0.75, 0.9),
        turbulence: Between(0.3, 0.5), fire: 0, prewarm: true,
        wind: Object.freeze({ x: -Math.cos(windAngle) * windSpeed, z: Math.sin(windAngle) * windSpeed }),
      }),
    });
  });
}

export const FIRST_LEVEL_DISTANT_SMOKE = Object.freeze(BuildDistantSmoke());
