// Canonical debug starts only. Normal gameplay never calls this reconstruction.
// 2026.09.19 重构：18 个公开阶段的起点按新 27 步重建（契约 §1）。
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
  // 03 起前沿那一场已经打响过（跳进去就该有敌人）。
  if (n > 3) facts.add("frontBattleStarted");
  // 05 起老周已经退出枪位，担架上那一个接手（zhouGunWounded 是 04 的过关条件）。
  if (n >= 5) { column.zhou.visible = true; column.zhou.health = 65; }
  // 07 起后送队真的起行了。
  if (n >= 7) column.Activate();
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
    // 12 的 CartRide 结束：装载推进完，老周已经上了车。
    Settle(column, () => column.TransferReady());
    column.BeginZhouBoarding();
    Settle(column, () => Math.hypot(column.zhou.x-column.zhouBoardingStart.x,column.zhou.z-column.zhouBoardingStart.z) >= R.boardingWitnessM);
    Object.assign(column.zhou, A.cartHalt, { state: "waiting", yaw: 0, health: 45 });
  }
  if (n >= 14) {
    // 13 空袭过后：路桥被炸、车列受损，老周卸回担架等着人抬。
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
    // 15 三步走完：收拢 → 院墙夹道 → 进接收院。
    column.StartRetreat();
    const pass = column.RetreatLimit(A.retreatC)-12;
    Settle(column, () => column.litters.filter(l => !l.loaded && !l.evacuated && l.health > 0).every(l => l.progress >= pass+1));
    column.zhou.health = 6;
    column.StartReception();
    Settle(column, () => column.litters.filter(l => !l.loaded && !l.evacuated && l.health > 0).every(l => l.received));
  }
  if (n >= 17) Object.assign(column.zhou, A.zhouDrop, {state:"placed",yaw:0});
  if (n >= 18) { column.zhou.health = 0; facts.add("deathMedicArrived"); }
  const result = {phase, index, facts:[...facts], column:column.Snapshot()};
  checkpoints.set(n, result);
  return structuredClone(result);
}
