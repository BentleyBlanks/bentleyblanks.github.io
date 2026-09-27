import { FIRST_LEVEL_DISTANT_SMOKE } from "./Data_FirstLevelDistantSmoke.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

// A stable physical origin for every authored smoke column, including checkpoints.
let tankIndex = 0;
export const FIRST_LEVEL_SMOKE_ORIGINS = Object.freeze(FIRST_LEVEL_DISTANT_SMOKE.map(column => {
  const random = Mulberry32(column.options.backdrop.seed ^ 0x1940);
  const frame = column.options.backdrop.frame;
  // The rear rail-road tree added in the shared scenery occupies the old outlet.
  // Move this whole fire five metres east, farther from the railway corridor.
  return Object.freeze({ id: column.id, x: column.x + (column.id === "RailBridgeApproach_0" ? 5 : 0), z: column.z,
    kind: frame === 0 ? (tankIndex++ % 2 === 0 ? "tank" : "barrels") : frame === 1 ? "truck" : frame === 3 ? "barrels" : "timber",
    yaw: random() * Math.PI * 2, seed: column.options.backdrop.seed,
    scale: column.tier === "far" ? 1.05 + random() * .2 : .95 + random() * .1,
    fire: frame === 0 ? 1.6 : frame === 1 ? 1.8 : 1.25,
  });
}));
