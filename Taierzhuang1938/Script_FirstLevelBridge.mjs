// ===========================================================================
// Script_FirstLevelBridge.mjs —— 18 接应回援尾队，奉令毁桥
//
// Notion（docs/Data_FirstLevelRebuildSource20260919.md 的 18）：
//   · 传令兵**跑到接收处**：外围部队奉命抽一部回援滕县，小队去接住桥上后队。
//   · 回援尾队携带步枪、机枪或迫击炮部件从北岸过铁路桥；北岸土坎的火力妨碍他们
//     离桥，玩家与何有田协助打断。**不做多波守点**，敌人来自北侧外围战场。
//     玩家不承担「杀光所有敌军」—— 压不住桥头的火力就算解除。
//   · 桥头军官喊撤，玩家退到南岸掩护区；爆破由**此前就在场的人员**完成，
//     顺子不临时变成爆破手。爆破**不造成己方剧情伤亡**：爆破区里还有人就一直等，
//     绝不是「到点就炸」的计时器。
//   · 台词不许出现「所有人都过来了」（BridgeWithdraw 的三句里没有这句）。
//
// 零 three：node 里可以直接 import。
// ===========================================================================
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { EndFacing, EndProjectOnto, EndRouteLength, EndRoutePoint } from "./Script_FirstLevelEndCast.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const CROSSING = MISSION_STAGE_ROUTES.bridgeCrossing;
const CROSSING_LENGTH = EndRouteLength(CROSSING);
export const BRIDGE_NORTH_IDS = Object.freeze(MISSION_ENCOUNTERS.bridgeNorth.map(spec => spec.id));
export const BRIDGE_GUNNER_ID = MISSION_ENCOUNTERS.bridgeNorth[0].id;
export const BRIDGE_CAST = Object.freeze(["BridgeOfficer", "BridgeDemolitionWest", "BridgeDemolitionEast"]);
export const REAR_COLUMN_IDS = Object.freeze(
  Array.from({ length: R.bridgeColumnCount }, (_, i) => `RearColumn${i}`));

export class FirstLevelBridge {
  constructor(runtime) {
    this.runtime = runtime;
    this.Reset();
  }
  Reset() {
    this.column = null;
    this.runner = null;
    this.blast = null;
  }

  // -------------------------------------------------------------------------
  Enter(step) {
    const r = this.runtime, bridge = P.bridge;
    if (step === "BridgeOrders") {
      this.runner = { arrived: false, said: false };
      r.extras.Spawn("BridgeRunner", E.runnerSpawn, { weapon: "HanYang", squadId: "MissionBridgeRunner", stance: 0 });
      r.extras.Spawn("BridgeOfficer", bridge.officer, { weapon: "HanYang", squadId: "MissionBridgeOfficer" });
      for (const [index, post] of bridge.demolition.entries())
        r.extras.Spawn(BRIDGE_CAST[index + 1], post, { weapon: null, unarmed: true, squadId: "MissionBridgeDemolition" });
    }
    if (step === "BridgeCover") {
      // 传令兵回他自己的队伍去了：接收处那四个人也不跟着上桥。
      r.extras.Keep([...BRIDGE_CAST, ...REAR_COLUMN_IDS]);
    }
    if (step === "BridgeWithdraw") {
      this.blast = { set: 0, ready: false, fired: false, waitedS: 0, stuckS: 0, overdue: false, lastInside: null };
    }
  }
  /**
   * 回援尾队：六个真人，从北岸沿 bridgeCrossing 过来。
   *
   * **玩家到了南岸射位才放他们出来**（`southBankReached`）。早放不行：他们要在
   * 北引道上顶着一挺机枪 + 三支步枪等，玩家从接收处走过来要一分多钟 ——
   * 实拍那一版六个人死了五个，「接应尾队」这件事整个没了。
   * 扛机枪与抬炮管的三个人走 scriptEssential（打不死，会趴下），
   * 三个步枪兵照常会阵亡 —— Notion 要的「有人可能中弹」留在他们身上。
   */
  StartColumn() {
    const r = this.runtime;
    if (this.column) return;
    this.column = REAR_COLUMN_IDS.map((id, index) => {
      const progress = -index * R.bridgeColumnSpacingM;
      const at = EndRoutePoint(CROSSING, Math.max(0, progress));
      const lane = (index % 2 ? 1 : -1) * 0.7;
      const point = { x: at.x + Math.cos(at.yaw) * lane, z: at.z - Math.sin(at.yaw) * lane, yaw: at.yaw };
      const load = E.rearColumnLoads[index] || "rifle";
      r.extras.Spawn(id, point, {
        weapon: load === "mg" ? "Zb26" : "HanYang",
        squadId: "MissionRearColumn", stance: 0, essential: load !== "rifle",
      });
      return { id, index, progress, load, lane, crossed: false, pinned: false, x: point.x, z: point.z, yaw: at.yaw };
    });
  }

  // -------------------------------------------------------------------------
  // 北岸火力：不要求杀光。机枪哑了、而且活着的人谁也够不到桥头，就算打断。
  // -------------------------------------------------------------------------
  FireBroken() {
    const r = this.runtime;
    const actors = BRIDGE_NORTH_IDS.map(id => r.enemies.get(id));
    if (actors.some(actor => !actor)) return false;          // 还没生成齐
    const gunner = r.enemies.get(BRIDGE_GUNNER_ID);
    if (gunner?.alive) return false;                          // 架在土坎上的那挺必须哑
    if (actors.every(actor => !actor.alive)) return true;
    return !r.Threatens(A.bridgeNorthEnd, BRIDGE_NORTH_IDS) && !r.Threatens(A.railBridge, BRIDGE_NORTH_IDS);
  }

  UpdateColumn(dt, step) {
    const r = this.runtime;
    if (!this.column && (step === "BridgeWithdraw" || r.Has("southBankReached"))) this.StartColumn();
    if (!this.column) return;
    const broken = r.Has("bridgeFireBroken");
    const limit = broken ? CROSSING_LENGTH : E.rearColumnHoldM;
    let ahead = Infinity, stalled = 0, living = 0, crossed = 0;
    for (const entry of this.column) {
      const actor = r.extras.Actor(entry.id);
      if (!actor) { entry.pinned = false; continue; }
      living += 1;
      const own = EndProjectOnto(CROSSING, actor.position).progress;
      const cap = Math.min(limit, ahead - R.bridgeColumnSpacingM);
      entry.progress = Math.min(cap, Math.max(entry.progress, own) + dt * R.bridgeColumnSpeedMps);
      // 前面那个人一旦下了桥就不再占位子：后面的人跟到南桥头，不许被间距钉在桥上。
      ahead = entry.crossed || entry.progress >= CROSSING_LENGTH - 0.01 ? Infinity : entry.progress;
      const at = EndRoutePoint(CROSSING, Math.min(CROSSING_LENGTH, entry.progress + 1.2));
      entry.x = actor.position.x; entry.z = actor.position.z; entry.yaw = actor.yaw;
      // 压制下真的停/伏：北岸土坎看得见他就趴下还击，不继续往桥上走。
      const exposed = !broken && r.Threatens(actor.position, BRIDGE_NORTH_IDS);
      entry.pinned = exposed;
      if (exposed) {
        stalled += 1;
        r.Defend(actor, actor.position, 0, 0);
        r.ai.SetStance(actor, 2, E.rearColumnProneHoldS, true);
      } else if (own >= CROSSING_LENGTH - E.rearColumnClearM) {
        // 下了桥就散开一点，六个人不许叠在末点那一格上。
        entry.crossed = true;
        const end = EndRoutePoint(CROSSING, CROSSING_LENGTH);
        r.extras.Hold(entry.id, { x: end.x + entry.lane * 2.4, z: end.z + entry.index * 1.6 },
          { yaw: at.yaw, stance: 0 });
      } else {
        const lane = { x: at.x + Math.cos(at.yaw) * entry.lane, z: at.z - Math.sin(at.yaw) * entry.lane };
        actor.scriptedNoncombatant = true;
        r.MoveActor(actor, lane, R.bridgeColumnSpeedMps);
        r.ai.SetStance(actor, 0, 1, true);
      }
      if (entry.crossed) crossed += 1;
    }
    // 尾队被顶在北引道上不动了 —— 这时候才喊「别堵桥口」「北边土坎」。
    if (step === "BridgeCover" && !broken && (stalled > 0 || this.column.some(entry => entry.progress >= limit - 0.4)))
      r.Say("BridgeCover");
    if (!broken && this.FireBroken()) r.Record("bridgeFireBroken", { gunner: BRIDGE_GUNNER_ID });
    // 「威胁解除后尾队实际通过」：还活着的每一个都下了桥。中弹倒下的不拦着这一条
    //（Notion 明说有人可能中弹，玩家也不承担杀光所有敌军）。
    if (broken && living > 0 && crossed === living && !r.Has("rearColumnCrossed"))
      r.Record("rearColumnCrossed", { crossed, lost: this.column.length - living });
  }

  // -------------------------------------------------------------------------
  UpdateOrders(dt) {
    const r = this.runtime, state = this.runner;
    if (!state) return;
    const arrived = r.extras.Walk("BridgeRunner", E.runnerRoute, E.runnerMps, { arriveM: 1.1 });
    const actor = r.extras.Actor("BridgeRunner");
    if (actor) r.extras.Face("BridgeRunner", r.player.position, dt, 3);
    if (!state.said && actor && (arrived || Distance(actor.position, r.player.position) <= E.runnerArriveM)) {
      state.said = true; state.arrived = true;
      r.Record("bridgeRunnerArrived", { x: actor.position.x, z: actor.position.z });
      r.Say("BridgeOrders");
    }
    // 军官与爆破人员在桥头各就各位（玩家赶到之前他们就在那儿了）。
    this.HoldBridgeCrew();
  }
  HoldBridgeCrew() {
    const r = this.runtime, bridge = P.bridge;
    r.extras.Hold("BridgeOfficer", bridge.officer, { yaw: bridge.officer.yaw, stance: 0 });
    for (const [index, post] of bridge.demolition.entries())
      r.extras.Hold(BRIDGE_CAST[index + 1], post, { yaw: post.yaw, stance: 0 });
  }

  // -------------------------------------------------------------------------
  // BridgeWithdraw：爆破准备 → 清场 → 才炸
  // -------------------------------------------------------------------------
  UpdateWithdraw(dt) {
    const r = this.runtime, state = this.blast;
    if (!state || state.fired) { if (state?.fired) this.PullBack(dt); return; }
    // 1. 在场的爆破人员装药（蹲在桥台上），顺子不参与。
    if (!state.ready) {
      let set = true;
      for (const [index, post] of P.bridge.demolition.entries()) {
        const id = BRIDGE_CAST[index + 1], actor = r.extras.Actor(id);
        if (!actor) continue;
        const there = r.extras.WalkTo(id, post, E.demolitionMps, { arriveM: 0.6, yaw: post.yaw });
        if (!there) { set = false; continue; }
        r.ai.SetStance(actor, 1, 1.5, true);
      }
      if (set) state.set += dt;
      if (state.set >= E.demolitionSetS) {
        state.ready = true;
        r.Record("demolitionCharged", { crew: P.bridge.demolition.length });
      }
    }
    // 2. 装好了就全员撤出爆破区（军官、爆破手、尾队都往南走）。
    if (state.ready) this.PullBack(dt);
    // 3. 玩家退到安全距离、爆破区里一个自己人都没有 —— 才炸。赖着不走就一直等。
    const inside = this.BlastZoneOccupant();
    state.waitedS += dt;
    if (!state.ready || !r.Has("blastZoneCleared") || inside) {
      if (inside) {
        r.Record("blastHeldForFriendly", { who: inside.who, distanceM: Number(inside.distance.toFixed(1)) });
        // **药装好之前不许清场。** 爆破人员的岗位就在爆破区里：这会儿把区里的人往南赶，
        // 赶的就是他们自己 —— 他们再也走不回桥台，装药进度停在半路，桥永远炸不了。
        // 实拍 2026-09-20（玩家按编排干脆地退到安全区，比爆破手装完药还早到）：
        // BridgeDemolitionEast 被推离炸点 1.3 m，state.set 钉在 3 s / 6 s，等满 240 s 也不炸。
        // 装好之后 PullBack 会沿各自的折线把他们送出去，那时候再谈清场。
        if (state.ready) this.ClearBlastZone(inside, dt); else state.stuckS = 0;
      } else state.stuckS = 0;
      if (!state.overdue) return;
    }
    this.Fire();
  }
  /**
   * 把还赖在爆破区里的自己人往南岸赶（「桥头撤！」就是这个意思），并盯着他到底
   * 动没动。**玩家永远等**；但一个被卡住不动的 NPC 不许把整关钉死 —— 他连着
   * `blastStuckS` 秒一步没挪、而玩家早已退到安全区，就记一条 `blastFriendlyStuck`
   * 取证并放行。这不是「到点就炸」：玩家在区里的每一秒都照样等。
   */
  ClearBlastZone(inside, dt) {
    const r = this.runtime, state = this.blast;
    if (inside.who === "player") { state.stuckS = 0; state.lastInside = null; return; }
    const actor = inside.actor || (r.squad || []).find(entry => (entry.castId || entry.id) === inside.who);
    // 桥头那三个人（军官 + 两名爆破手）有自己的撤出折线，`PullBack` 每帧都在走。
    // 再塞一个「去 blastSafe」的目标只会把折线顶掉 —— 两条指令互相拉扯，人留在区里打转。
    const scripted = BRIDGE_CAST.includes(inside.who);
    if (actor?.alive && !scripted) {
      actor.scriptedNoncombatant = true;
      r.MoveActor(actor, A.blastSafe, E.demolitionMps);
      r.ai.SetStance(actor, 0, 1, true);
    }
    const at = actor ? { x: actor.position.x, z: actor.position.z } : null;
    const moved = !state.lastInside || !at || state.lastInside.who !== inside.who
      || Distance(state.lastInside, at) > 0.25;
    state.lastInside = at ? { ...at, who: inside.who } : null;
    state.stuckS = moved ? 0 : (state.stuckS || 0) + dt;
    if (state.stuckS >= E.blastStuckS && r.Has("blastZoneCleared") && !state.overdue) {
      state.overdue = true;
      r.Record("blastFriendlyStuck", { who: inside.who, distanceM: Number(inside.distance.toFixed(1)),
        stuckS: Number(state.stuckS.toFixed(1)) });
    }
  }
  /** 爆破区里此刻还有谁（玩家 / 班里人 / 桥头人员 / 尾队）。没有就返回 null。 */
  BlastZoneOccupant() {
    const r = this.runtime, centre = A.railBridge, radius = E.blastClearRadiusM;
    if (Distance(r.player.position, centre) <= radius) return { who: "player", distance: Distance(r.player.position, centre) };
    for (const actor of r.squad || [])
      if (actor.alive && Distance(actor.position, centre) <= radius)
        return { who: actor.castId || actor.id, distance: Distance(actor.position, centre), actor };
    const nearest = r.extras.Nearest(centre);
    if (nearest && nearest.distance <= radius) return { who: nearest.id, distance: nearest.distance, actor: nearest.actor };
    return null;
  }
  PullBack(dt) {
    const r = this.runtime;
    void dt;
    r.extras.Walk("BridgeOfficer", E.officerPullback, E.demolitionMps, { arriveM: 1 });
    for (const [index, route] of E.demolitionPullback.entries())
      r.extras.Walk(BRIDGE_CAST[index + 1], route, E.demolitionMps, { arriveM: 1 });
    // 过了桥的尾队继续南下，不堵在南桥头。
    for (const entry of this.column || []) {
      const actor = r.extras.Actor(entry.id);
      if (!actor) continue;
      const at = EndRoutePoint(CROSSING, CROSSING_LENGTH);
      if (Distance(actor.position, at) > 3) continue;
      actor.scriptedNoncombatant = true;
      r.MoveActor(actor, { x: at.x + 4 + entry.index * 1.4, z: at.z + 14 + entry.index * 2.2 }, R.bridgeColumnSpeedMps);
    }
  }
  Fire() {
    const r = this.runtime, state = this.blast;
    state.fired = true;
    const at = r.Point(A.railBridge, 1.2);
    r.vfx.Explosion?.(at, { radius: R.bridgeBlastRadiusM });
    r.combat.BlastFeedback(at, R.bridgeBlastRadiusM);
    // 桥面 / 桁架 / 钢轨的 5 个完好件与 3 个残骸件都挂在 RailBridgeDestroyed 这个信号上
    //（MISSION_SCENARIO_SIGNALS：信号 → bridgeDestroyed 这条事实）。一次翻完，不可逆。
    r.Record("bridgeDestroyed", { x: A.railBridge.x, z: A.railBridge.z, waitedS: Number(state.waitedS.toFixed(1)) });
    r.Say("MarchToTengxian");
  }

  // -------------------------------------------------------------------------
  Dress(step) {
    const r = this.runtime;
    if (!this.column || !["BridgeOrders", "BridgeCover", "BridgeWithdraw"].includes(step)) return;
    // 白盒小件：机枪手背上那一管、两人抬的迫击炮身管。
    const carriers = this.column.filter(entry => entry.load === "mortar" && r.extras.Actor(entry.id));
    if (carriers.length === 2) {
      const a = r.extras.Actor(carriers[0].id).position, b = r.extras.Actor(carriers[1].id).position;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      r.dressing.Prop("limb", mid.x, r.battlefield.GroundHeight(mid.x, mid.z) + 1.28, mid.z,
        EndFacing(a, b), [0.9, Math.max(1.4, Distance(a, b) / 0.64), 0.9], Math.PI / 2, 0);
    }
    for (const entry of this.column) {
      if (entry.load !== "rifle") continue;
      const actor = r.extras.Actor(entry.id);
      if (!actor) continue;
      r.dressing.Prop("medical", actor.position.x, r.battlefield.GroundHeight(actor.position.x, actor.position.z) + 1.18,
        actor.position.z, actor.yaw, [1.9, 1.5, 1.2]);
    }
  }
  Update(dt, step) {
    if (step === "BridgeOrders") this.UpdateOrders(dt);
    // BridgeWithdraw 不再按住他们：那一步他们要装药、然后自己撤出爆破区。
    if (step === "BridgeCover") this.HoldBridgeCrew();
    if (["BridgeOrders", "BridgeCover", "BridgeWithdraw"].includes(step)) this.UpdateColumn(dt, step);
    if (step === "BridgeWithdraw") this.UpdateWithdraw(dt);
    this.Dress(step);
  }
  State() {
    return {
      runner: this.runner && { ...this.runner },
      blast: this.blast && { set: Number(this.blast.set.toFixed(1)), ready: this.blast.ready,
        fired: this.blast.fired, stuckS: Number((this.blast.stuckS || 0).toFixed(1)), overdue: !!this.blast.overdue },
      rearColumn: (this.column || []).map(entry => ({
        id: entry.id, load: entry.load, progress: Number(entry.progress.toFixed(1)),
        crossed: entry.crossed, pinned: entry.pinned, alive: !!this.runtime.extras.Actor(entry.id),
      })),
      crossingLengthM: Number(CROSSING_LENGTH.toFixed(1)),
    };
  }
}

export const BRIDGE_CROSSING_LENGTH = CROSSING_LENGTH;
