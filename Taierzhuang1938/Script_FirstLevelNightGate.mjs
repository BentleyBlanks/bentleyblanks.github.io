// ===========================================================================
// Script_FirstLevelNightGate.mjs —— 18 关尾时间转场：夜入滕县北门
//
// Notion（docs/Data_FirstLevelRebuildSource20260919.md 的「关尾时间转场」）：
//   北沙河并不紧贴县城，**不让玩家从桥边跑几步就到城门**。爆破后的行军脚步持续，
//   画面淡出 → 字幕「1938年3月15日 夜｜滕县」→ 淡入北门外，玩家仍在行军队列中。
//   前方有人进门、有人搬武器弹药、有人在分配防区 —— 不是胜利庆典，是连夜准备迎敌。
//   带路军人喊「补东边阵位的，跟我来！」，小队从回援队列中分出，进入北门。
//
// 这一步分两段：
//   A. **随队走 marchOut**（真走，不是站着等）→ 到了 marchOut 锚点才起黑屏转场；
//   B. 黑屏里瞬移 + 换夜间天空（运行时的 PlaceNightArrival）→ 淡入之后夜景这一片
//      才存在（scenario 信号 NightGateShown ← nightArrivalPlaced）。
//
// 夜景的光：night 预设曝光低，白盒没有点光读不出来。火盆与门洞各挂一盏**不投影**的
// 点光（Script_FirstLevelNightLights）。退出 / 重试 / 回跳时一盏不留。
//
// 零 three：node 里可以直接 import。
// ===========================================================================
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { EndFacing, EndProjectOnto, EndRouteLength, EndRoutePoint } from "./Script_FirstLevelEndCast.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const NIGHT_ROUTE = MISSION_STAGE_ROUTES.nightMarch;
const NIGHT_LENGTH = EndRouteLength(NIGHT_ROUTE);

/** 夜景要挂的点光（纯数据，Script_FirstLevelNightLights 照它建 three 的灯）。 */
export function NightLightSpecs(groundAt) {
  const specs = P.night.braziers.map((point, index) => ({
    id: `Brazier${index}`, x: point.x, z: point.z, y: groundAt(point.x, point.z) + E.brazierLight.riseM,
    color: E.brazierLight.color, intensity: E.brazierLight.intensity,
    distanceM: E.brazierLight.distanceM, decay: E.brazierLight.decay,
  }));
  const gate = E.gateLight;
  specs.push({
    id: "GateArch", x: gate.x, z: gate.z, y: groundAt(gate.x, gate.z) + gate.riseM,
    color: gate.color, intensity: gate.intensity, distanceM: gate.distanceM, decay: gate.decay,
  });
  return specs;
}

export class FirstLevelNightGate {
  constructor(runtime) {
    this.runtime = runtime;
    this.Reset();
  }
  Reset() {
    this.state = null;
    this.runtime.nightLights?.Sync([]);
  }
  Enter(step) {
    if (step !== "NightMarch") return;
    const r = this.runtime;
    this.state = { marched: false, transitionStarted: false, guided: false, ushered: false, carriers: [], time: 0 };
    // A 段：随队沿 marchOut 走，脚步不停。夜景这时候还不存在（白天那一片是空地）。
    r.Guide(MISSION_STAGE_ROUTES.marchOut);
  }

  UpdateMarchOut() {
    const r = this.runtime, state = this.state;
    if (state.transitionStarted) return;
    if (!r.GateNear("marchOutReached")) return;
    state.marched = true;
    state.transitionStarted = true;
    r.Record("marchOutReached", { x: A.marchOut.x, z: A.marchOut.z });
    r.BeginNightTransition();
  }

  UpdateNight(dt) {
    const r = this.runtime, state = this.state;
    state.time += dt;
    // 夜景的灯：淡入之后才点上（nightArrivalPlaced 就是 NightGateShown 那个信号）。
    r.nightLights?.Sync(NightLightSpecs((x, z) => r.battlefield.GroundHeight(x, z)));
    // 队伍继续往北门走（玩家仍在行军队列里）。
    if (!state.guided) {
      state.guided = true;
      r.Guide(NIGHT_ROUTE);
      r.extras.Spawn("NightUsher", P.night.usher, { weapon: "HanYang", squadId: "MissionNightUsher" });
    }
    // 带路军人：先在门外招呼，喊完带着队伍往门洞里走。
    const called = r.voice.played.has("NorthGate");
    if (!called && Distance(r.player.position, A.northGate) <= E.northGateCueM) r.Say("NorthGate");
    if (!called) r.extras.Hold("NightUsher", P.night.usher, { yaw: P.night.usher.yaw });
    else {
      r.extras.WalkTo("NightUsher", A.gateInside, R.nightMarchSpeedMps, { arriveM: 1.2, yaw: EndFacing(A.gateInside, A.northGate) });
      if (!state.ushered) { state.ushered = true; r.Record("nightUsherLeading", { x: A.northGate.x, z: A.northGate.z }); }
    }
  }

  /** 夜景布景：进门的队列、搬弹药的人、分配防区的两个人。 */
  DressNight(dt) {
    const r = this.runtime, dressing = r.dressing, state = this.state;
    // 1. 回援队列：沿夜行路线一路往门里走（走到门里就循环回起点，队列不会断）。
    const walked = (state.time * E.nightColumnMps) % Math.max(1, NIGHT_LENGTH);
    for (const [index, point] of P.night.column.entries()) {
      const start = EndProjectOnto(NIGHT_ROUTE, point).progress;
      const progress = (start + walked) % NIGHT_LENGTH;
      const at = EndRoutePoint(NIGHT_ROUTE, progress);
      const lane = (index % 2 ? 1 : -1) * (1.2 + (index % 3) * 0.35);
      dressing.Person(`NightColumn${index}`, at.x + Math.cos(at.yaw) * lane, at.z - Math.sin(at.yaw) * lane, at.yaw,
        { moving: true });
    }
    // 2. 搬武器弹药的人：在自己那一小段上来回走，手里一只箱子。
    for (const [index, post] of P.night.carriers.entries()) {
      const phase = Math.sin(state.time * E.nightCarrierMps / E.nightCarrierLegM + index * 1.7);
      const z = post.z + phase * E.nightCarrierLegM;
      const yaw = phase > 0 ? 0 : Math.PI;
      dressing.Person(`NightCarrier${index}`, post.x, z, yaw, { moving: true });
      dressing.Prop("medical", post.x + 0.35, r.battlefield.GroundHeight(post.x, z) + 1.05, z, yaw, [2.4, 1.8, 2.2]);
    }
    // 3. 分配防区的两个人：站着说话，互相转过去。
    for (const [index, post] of P.night.sectorAssigners.entries()) {
      const other = P.night.sectorAssigners[1 - index] || post;
      dressing.Person(`NightSector${index}`, post.x, post.z, EndFacing(post, other), { moving: false });
    }
    void dt;
  }

  Update(dt, step) {
    if (step !== "NightMarch" || !this.state) return;
    const r = this.runtime;
    if (!r.Has("nightArrivalPlaced")) { this.UpdateMarchOut(); return; }
    this.UpdateNight(dt);
    this.DressNight(dt);
  }
  State() {
    return this.state && {
      marched: this.state.marched, guided: this.state.guided, ushered: this.state.ushered,
      lights: this.runtime.nightLights?.count ?? 0,
    };
  }
}

export const NIGHT_MARCH_LENGTH = NIGHT_LENGTH;
