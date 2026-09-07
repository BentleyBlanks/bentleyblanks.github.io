// Population mirrors the accepted P012 train: 40 recruits (8 / 24 / 8), plus Luo and the player.
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { trainColumn } from "./Data_FirstLevelP012TrainColumn.mjs";
const Point = (x, z) => ({ x, z });
export const MISSION_TRAIN = Object.freeze({
  total: trainColumn.total,
  extraCount: trainColumn.extraCount,
  mainCar: 1,
  life: { seatTopM: 0.48, pelvisAboveSeatM: 0.12, standSeconds: 1.25, sideSeatM: 1.65, gesturePeriodS: 7.5 },
  centerX: -77,
  approachEndZ: R.trainTravelM + 140,
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

// Constant approach followed by constant deceleration, with continuous speed and an exact station stop.
export function MissionTrainMotion(time, impactAt = null, impactOffset = null) {
  if (impactAt == null) return { offsetM: Math.max(0, R.trainTravelM - time * R.trainCruiseSpeedMps), speedMps: R.trainCruiseSpeedMps, stopped: false };
  const distance = Math.max(0, impactOffset ?? R.trainTravelM - impactAt * R.trainCruiseSpeedMps);
  const brakeSeconds = 2 * distance / R.trainCruiseSpeedMps;
  const ratio = brakeSeconds > 0 ? Math.max(0, Math.min(1, (time - impactAt) / brakeSeconds)) : 1;
  return { offsetM: distance * (1 - ratio) ** 2, speedMps: R.trainCruiseSpeedMps * (1 - ratio), stopped: ratio === 1, brakeSeconds };
}
