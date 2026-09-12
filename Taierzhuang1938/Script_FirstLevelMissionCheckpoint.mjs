// Canonical debug starts only. Normal gameplay never calls this reconstruction.
import { MISSION_STAGES, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { ResolveFirstLevelStage } from "./Data_FirstLevelMissionStages.mjs";
import { FirstLevelMissionColumn } from "./Script_FirstLevelMissionColumn.mjs";
const checkpoints = new Map();
function Settle(column, ready, options = {}) {
  for (let i = 0; i < 18000 && !ready(); i++) column.Update(.1, options);
  if (!ready()) throw new Error("First-level checkpoint column did not settle");
}
export function BuildFirstLevelCheckpoint(value) {
  const phase = ResolveFirstLevelStage(value), n = phase.number;
  if (checkpoints.has(n)) return structuredClone(checkpoints.get(n));
  const column = new FirstLevelMissionColumn();
  const index = MISSION_STAGES.findIndex(step => step.id === phase.entry);
  const facts = new Set(MISSION_STAGES.slice(0, index).flatMap(step => step.requirements));
  if (n > 1) facts.add("trainFoodReceived");
  if (n > 2) {
    for (const id of ["trainIncomingFire","trainFirstShellLaunched","trainFirstShellImpact","trainNearShell","trainNearShellImpact","trainSoldierWounded","trainProneOrder","trainPlayerProne","trainLuoRecovering","trainLuoStanding"]) facts.add(id);
    column.stationBombed = true;
    column.zhou.visible = true; column.zhou.health = 65;
  }
  if (n > 3) facts.add("frontBattleStarted");
  if (n >= 6) column.Activate();
  if (n >= 8) Settle(column, () => column.litters.every(l => l.staging?.area === "courtyard" && l.staging.mode === "resting"));
  if (n >= 11) {
    column.gateOpen = true;
    Settle(column, () => column.litters.every(l => l.passedGate));
  }
  if (n >= 12) {
    column.loading = true;
    for (let i = 0; i < R.transferApproachSeconds * 10; i++) column.Update(.1);
  }
  if (n >= 13) {
    Settle(column, () => column.TransferReady());
    column.BeginZhouBoarding();
    Settle(column, () => Math.hypot(column.zhou.x-column.zhouBoardingStart.x,column.zhou.z-column.zhouBoardingStart.z) >= R.boardingWitnessM);
  }
  if (n >= 14) {
    column.AirDamage(); facts.add("loadedCartBombed");
    for (let i = 0; i < R.airPassSeconds * 10; i++) column.Update(.1, {moving:false});
    Object.assign(column.zhou, A.ditchMouth, {state:"carried",yaw:Math.PI/2});
  }
  if (n >= 15) {
    for (const id of ["diveOrderHeard","zhouStrafed","secondAirPassComplete"]) facts.add(id);
    Object.assign(column.zhou, {health:18,state:"waiting",bearers:[75,75]});
    for (const litter of column.litters) if (!litter.zhou && litter.state === "fallen") litter.state = "waiting";
  }
  if (n >= 16) {
    column.StartRetreat();
    const pass = column.RetreatLimit(A.retreatC)-12;
    Settle(column, () => column.litters.filter(l => !l.loaded && !l.evacuated && l.health > 0).every(l => l.progress >= pass+1));
    column.zhou.health = 6;
  }
  if (n >= 17) {
    column.StartReception();
    Settle(column, () => column.litters.filter(l => !l.loaded && !l.evacuated && l.health > 0).every(l => l.received));
    Object.assign(column.zhou, A.zhouDrop, {state:"placed",yaw:0});
  }
  if (n >= 18) { column.zhou.health = 0; facts.add("deathMedicArrived"); }
  const result = {phase, index, facts:[...facts], column:column.Snapshot()};
  checkpoints.set(n, result);
  return structuredClone(result);
}
