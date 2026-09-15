// Canonical debug starts only. Normal gameplay never calls this reconstruction.
import { MISSION_STAGES, MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { SOUTH_TRANSITION } from "./Data_FirstLevelFrontRoute.mjs";
import { ResolveFirstLevelStage } from "./Data_FirstLevelMissionStages.mjs";
import { FirstLevelMissionColumn, MissionRouteProjection, MissionCarryRoutePoint } from "./Script_FirstLevelMissionColumn.mjs";
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
  if (n >= 8) {
    // 南行转场把整队搬到村口（运行时的 PlaceSouthArrival 在黑屏里做同一件事），
    // 再把老周这一副提到队首前一个车距：罗班长的命令是「担架从里头过」。
    const lead = MissionRouteProjection(column.route, SOUTH_TRANSITION.arrival).progress - SOUTH_TRANSITION.columnLeadM;
    const delta = lead - Math.max(...column.litters.map(entry => entry.progress));
    for (const entry of [...column.litters, ...column.walkers]) {
      entry.progress = Math.max(0, entry.progress + delta);
      Object.assign(entry, MissionCarryRoutePoint(column.route, entry.progress));
      delete entry.staging;
    }
    column.PromoteZhouLead(R.ambushLitterLeadM);
  }
  if (n >= 9) {
    // 屋内伏击：老周这一副已经跟到屋子北门口，其余九副还在村口。
    const door = MissionRouteProjection(column.route, { x: A.melee.x, z: R.ambushLitterDoorZ }).progress;
    for (let i = 0; i < 6000 && column.zhou.progress < door - .05; i++)
      column.UpdateLead(.1, { limit: door, speed: R.ambushLitterRushMps });
    if (column.zhou.progress < door - .05) throw new Error("First-level ambush checkpoint litter never reached the room door");
  }
  if (n >= 10) {
    // 伏击已经打完：两个抬担架的死了（尸体留在握杆位置），老周挨了一刀但活着，
    // 替补正从后队上来。
    // 记的顺序就是实机里发生的顺序：老周那一刀落在控制锁里面，挣脱排在它后面。
    for (const id of ["ambushTriggered", "ambushStabbed", "zhouStabbed", "ambushBroken", "ambushSquadArrived"]) facts.add(id);
    for (const victim of ["frontBearer", "rearBearer", "zhou"])
      column.AmbushCasualty(victim, { zhouHealth: R.ambushZhouHealthAfter });
    column.AmbushRecover();
  }
  if (n >= 11) {
    Settle(column, () => column.litters.every(l => l.staging?.area === "courtyard" && l.staging.mode === "resting"));
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
    column.AirDamage(); facts.add("loadedCartBombed"); facts.add("MissionBridgeDestroyed");
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
