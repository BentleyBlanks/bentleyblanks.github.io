// Population mirrors the accepted P012 train: 40 recruits (12 / 16 / 12), plus Luo and the player.
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { trainColumn } from "./Data_FirstLevelP012TrainColumn.mjs";
const Point = (x, z) => ({ x, z });
export const MISSION_TRAIN = Object.freeze({
  total: trainColumn.total,
  extraCount: trainColumn.extraCount,
  mainCar: 1,
  life: { seatTopM: 0.48, pelvisAboveSeatM: 0.12, standSeconds: 1.25, sideSeatM: 1.65, gesturePeriodS: 7.5,
    braceDelayS:.14,braceSpreadS:.6,braceRate:5 },
  // Two deliberate aisle movements, with seated passengers leaving a clear lane.
  activities: {
    yaowa: [
      {at:.5,x:-77,z:87,speed:.65,face:{x:-77,z:88}},
      {at:10,x:-77,z:84.8,speed:.65,face:{x:-78.65,z:85.2}},
      {at:19,x:-77,z:86.6,speed:.65,face:{x:-77,z:88}},
    ],
    luo: [
      {at:12,x:-76.5,z:88.95,speed:.7},
      {at:14,x:-77,z:88.95,speed:.7},
      {at:16,x:-77,z:90.7,speed:.7,face:{x:-78.65,z:90}},
      {at:21,x:-76.5,z:90.7,speed:.7},
      {at:23,x:-76.15,z:88.4,speed:.7,face:{x:-77,z:88}},
    ],
  },
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
    const seats = carIndex===1
      ? [Point(-77,86.6),...[-4,-2.8,-1.6,-.4,.8,2,3.2,4.4].map(d=>Point(-78.65,z+d)),
          ...[-4,-2.8,-1.6,1.6,2.8,4].map(d=>Point(-75.35,z+d)),Point(-78.65,83)]
      : Array.from({length:12},(_,i)=>Point(-77+(i%2?1.65:-1.65),z+[-4.9,-3.7,-2.5,2.5,3.7,4.9][Math.floor(i/2)]));
    const giver=carIndex===1?seats.shift():null;
    seats.sort((a,b)=>Math.abs(a.z-z)-Math.abs(b.z-z)||Math.abs(a.x+77)-Math.abs(b.x+77)||a.z-b.z);
    if(giver)seats.unshift(giver);
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
