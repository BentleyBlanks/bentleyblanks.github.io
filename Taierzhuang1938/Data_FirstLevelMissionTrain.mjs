// Population mirrors the accepted P012 train: 40 recruits (8 / 24 / 8), plus Luo and the player.
import { trainColumn } from "./Data_FirstLevelP012TrainColumn.mjs";
const Point = (x, z) => ({ x, z });
export const MISSION_TRAIN = Object.freeze({
  total: trainColumn.total,
  extraCount: trainColumn.extraCount,
  mainCar: 1,
  life: { seatTopM: 0.48, pelvisAboveSeatM: 0.12, standSeconds: 1.25, sideSeatM: 1.65, gesturePeriodS: 7.5 },
  centerX: -77,
  doorClearX: -73.1,
  stairFootX: -71.7,
  apronLaneX: -69,
  guideMuster: Point(-64.5, 76),
  bodySpacingM: trainColumn.bodySpacingM,
  arrivalRadiusM: 0.22,
  routeArrivalRadiusM: 0.42,
  speedMps: trainColumn.speedMps,
  player: Point(-77, 88),
  guide: Point(-75.95, 88),
  cars: trainColumn.cars.map((source, carIndex) => {
    const z = 74 + carIndex * 14;
    const seats = source.seats.map((_, i) => carIndex === 1
      ? Point(-77 + [0, -1.65, 1.65][i % 3], z + [-1.2, 1.2, -2.4, 2.4, -3.6, 3.6, -4.8, 4.8][Math.floor(i / 3)])
      : Point(-77 + (i % 2 ? 1.65 : -1.65), z + [-4.8, -1.6, 1.6, 4.8][Math.floor(i / 2)]));
    seats.sort((a, b) => Math.abs(a.z-z)-Math.abs(b.z-z) || Math.abs(a.x+77)-Math.abs(b.x+77) || a.z-b.z);
    return { carIndex, z, seats,
      exit: [Point(-77,z), Point(-74.2,z), Point(-72,z), Point(-70.4,z)],
      // Separate lanes keep background bodies out of the player's supply point and northbound route.
      muster: seats.map((_, i) => Point(-64.5 - (i % 2) * 1.5, (carIndex === 1 ? 80.5 : carIndex === 0 ? 68 : 102) + Math.floor(i / 2) * 1.4)),
    };
  }),
});
