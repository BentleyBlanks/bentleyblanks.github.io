// ===========================================================================
// Script_FirstLevelReception.mjs —— 15C 桥南临时接收处 + 16 完成交接 + 17 确认死亡
//
// Notion（docs/Data_FirstLevelRebuildSource20260919.md 的 15C / 16 / 17）：
//   · 前方是**普通院落**承担临时接收，不是大型医院；院门守军先拦、确认身份才放行。
//   · 老周进有屋顶、避开外侧直射的厢房；过门槛担架一歪，「脚……慢点」是他最后一句话。
//   · 17 保持第一人称、不切尸体特写；院外的搬运照常继续，老周死亡不判全关失败。
//
// 顺序是硬的：拦 → 确认身份 → 接收人员指位置 → 伤员真的往里走；
// 军医先指位置，玩家与前抬手才把担架放下；放下之后才恢复持枪。
// 一处都不许用「进这一步就记事实」或者「等几秒」替过去。
//
// 零 three：node 里可以直接 import。
// ===========================================================================
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { EndRouteLength, EndRoutePoint } from "./Script_FirstLevelEndCast.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const NEXT_LITTER_LENGTH = EndRouteLength(E.nextLitterRoute);
/** 15C–17 常驻的三个人：院门守军两名、接收人员、军医。 */
export const RECEPTION_CAST = Object.freeze(["GateGuardNorth", "GateGuardSouth", "YardReceiver", "WardSurgeon"]);

export class FirstLevelReception {
  constructor(runtime) {
    this.runtime = runtime;
    this.Reset();
  }
  Reset() {
    this.gate = null;
    this.handover = null;
    this.death = null;
    this.walks = new Map();
  }

  // -------------------------------------------------------------------------
  // 进入步骤
  // -------------------------------------------------------------------------
  Enter(step) {
    const r = this.runtime, yard = P.receptionYard;
    if (step === "ReceptionGate") {
      this.gate = { challenged: false, accepted: false, receptionStarted: false, guided: false };
      r.extras.Spawn("GateGuardNorth", yard.gateGuard[0], { weapon: "HanYang", squadId: "MissionYardGate", stance: 0 });
      r.extras.Spawn("GateGuardSouth", yard.gateGuard[1], { weapon: "HanYang", squadId: "MissionYardGate", stance: 0 });
      r.extras.Spawn("YardReceiver", yard.receiver, { weapon: null, unarmed: true, squadId: "MissionYardReceiver" });
      r.extras.Spawn("WardSurgeon", yard.surgeon, { weapon: null, unarmed: true, squadId: "MissionWardSurgeon" });
    }
    if (step === "Handover") {
      this.handover = { tilt: 0, tilted: false, placeAsked: false, examineAsked: false, assignAsked: false, assigned: false };
      // 15C 的四个人留着（16/17 都在同一个院子里）。
      r.extras.Keep(RECEPTION_CAST);
    }
    if (step === "Death") {
      this.death = { confirmed: false, nextProgress: 0, nextSaid: false, coverS: 0, resumed: false };
      r.extras.Keep(RECEPTION_CAST);
    }
  }

  // -------------------------------------------------------------------------
  // 15C 院门
  // -------------------------------------------------------------------------
  /** 院门没放行以前担架队压在门外排队：返回给 column.Update 的 maxProgress。 */
  GateLimit() {
    const r = this.runtime;
    if (r.flow.stage.id !== "ReceptionGate" || this.gate?.accepted) return Infinity;
    return Math.max(0, r.ColumnProgressAt(A.receptionGate) - E.gateQueuePadM);
  }
  UpdateGate(dt) {
    const r = this.runtime, state = this.gate, yard = P.receptionYard;
    if (!state) return;
    const surgeon = r.extras.Actor("WardSurgeon");
    if (surgeon) r.extras.Hold("WardSurgeon", yard.surgeon, { yaw: yard.surgeon.yaw });

    // 1. 一个守军横到门洞中线上拦住；放行之后才回自己的门垛。
    if (!r.Has("gateChallenged")) {
      r.extras.WalkTo("GateGuardNorth", E.gateBlock, E.gateGuardMps, { arriveM: 0.5, yaw: E.gateBlock.yaw });
      r.extras.Hold("GateGuardSouth", yard.gateGuard[1], { yaw: yard.gateGuard[1].yaw });
      const guard = r.extras.Actor("GateGuardNorth");
      // 静默段是取证，不是硬门：即使末段被合法对白打断，到院门后仍必须能盘问放行。
      if (!state.challenged && guard && Distance(r.player.position, A.receptionGate) <= E.gateChallengeReachM) {
        state.challenged = true;
        r.Say("GateChallenge");
      }
      if (guard) r.extras.Face("GateGuardNorth", r.player.position, dt, 2.4);
    } else {
      r.extras.WalkTo("GateGuardNorth", yard.gateGuard[0], E.gateGuardMps, { arriveM: 0.5, yaw: yard.gateGuard[0].yaw });
      r.extras.Hold("GateGuardSouth", yard.gateGuard[1], { yaw: yard.gateGuard[1].yaw });
    }

    // 2. 接收人员从院里出来迎，到了才说「先抬进来……」。
    if (r.Has("gateChallenged") && !r.Has("receptionAccepted")) {
      const met = r.extras.WalkTo("YardReceiver", E.receiverMeet, E.receiverMps, { arriveM: 0.6, yaw: E.receiverMeet.yaw });
      if (met && !state.accepted && Distance(r.player.position, E.receiverMeet) <= E.receiverReachM) {
        state.accepted = true;
        r.Say("ReceptionAccept");
      }
      if (met) r.extras.Face("YardReceiver", r.player.position, dt, 2.4);
    }

    // 3. 位置说清楚了，伤员才真的往里走。
    if (r.Has("receptionAccepted")) {
      state.accepted = true;
      if (!state.receptionStarted) {
        state.receptionStarted = true;
        r.column.StartReception();
      }
      r.extras.WalkTo("YardReceiver", yard.receiver, E.receiverMps, { arriveM: 0.6, yaw: yard.receiver.yaw });
      if (!state.guided) { state.guided = true; r.Say("WardGuide"); }
      const entries = r.column.litters.filter(entry => entry.visible && entry.health > 0 && !entry.evacuated && !entry.loaded);
      const moving = entries.filter(entry => entry.received || (entry.receiveProgress || 0) > 0);
      if (entries.length && moving.length === entries.length
        && entries.filter(entry => entry.received).length >= E.woundedEnteringLitters)
        r.Record("woundedEntering", { entering: moving.length, received: entries.filter(entry => entry.received).length });
    }
  }

  // -------------------------------------------------------------------------
  // 16 完成交接
  // -------------------------------------------------------------------------
  UpdateHandover(dt) {
    const r = this.runtime, state = this.handover, zhou = r.column.zhou;
    if (!state) return;
    // 门槛：担架稍微一歪（纯演出，View 读 litter.roll）。只歪这一次。
    if (r.Has("thresholdCrossed") && !state.tilted) { state.tilted = true; state.tilt = E.thresholdTiltS; }
    if (state.tilt > 0) {
      state.tilt = Math.max(0, state.tilt - dt);
      zhou.roll = Math.sin((1 - state.tilt / E.thresholdTiltS) * Math.PI) * E.thresholdTiltRad;
    } else zhou.roll = 0;

    // 军医站到放置点旁边指位置。
    const placed = r.Has("zhouPlaced");
    const goal = placed ? E.surgeonExamine : E.surgeonPoint;
    const ready = r.extras.WalkTo("WardSurgeon", goal, E.surgeonMps, { arriveM: 0.5, yaw: goal.yaw });
    if (ready) r.extras.Face("WardSurgeon", placed ? zhou : A.zhouDrop, dt, 2.2);

    // 「这副放这里」：抬着人走到位置边上、军医到位，才喊；喊出口才允许按 F 放下。
    if (!placed && ready && !state.placeAsked && r.carry?.KindId === "stretcher"
      // 采用稿顺序是先过门槛轻歪、老周说完最后一句，再由军医指位置。
      // 只看离放置点的距离会在门外 5 m 范围内提前喊 PlaceLitter，反把
      // Threshold 排到队尾；这里等真实门槛事实与该句实际播完。
      && r.Has("thresholdCrossed") && r.voice.played.has("Threshold")
      && Distance(r.player.position, A.zhouDrop) <= E.placeOrderReachM) {
      state.placeAsked = true;
      r.Say("PlaceLitter");
    }
    if (state.placeAsked && !r.Has("placeOrderHeard") && r.voice.played.has("PlaceLitter"))
      r.Record("placeOrderHeard");

    // 放下之后军医真的开始看伤。
    if (placed && ready && !state.examineAsked && Distance(r.extras.Actor("WardSurgeon")?.position || goal, zhou) <= E.surgeonReachM) {
      state.examineAsked = true;
      r.ai.SetStance(r.extras.Actor("WardSurgeon"), 1, 4, true);
      r.Say("MedicAsk");
    }
    if (r.extras.Actor("WardSurgeon") && state.examineAsked)
      r.ai.SetStance(r.extras.Actor("WardSurgeon"), 1, 1.5, true);

    // 其余幸存伤员也进了接收流程，班长才分派人手。
    if (r.Has("medicExamining") && !state.assignAsked && this.OthersInReception()) {
      state.assignAsked = true;
      r.Say("SquadAssign");
    }
    // 分派完，三个人真的按吩咐走开；幺娃留下（bedGuide 管他）。
    if (r.Has("squadAssigned") && !state.assigned) {
      state.assigned = true;
      for (const [castId, route] of Object.entries(E.squadAssign)) {
        const actor = r.companion.Handle(castId);
        if (actor?.alive) this.walks.set(actor.id, { actor, route: route.map(point => ({ ...point })), speed: E.squadAssignMps });
      }
      r.Record("squadDispersed", { sent: this.walks.size });
    }
  }
  OthersInReception() {
    const others = this.runtime.column.litters.filter(entry =>
      entry.visible && entry.health > 0 && !entry.zhou && !entry.evacuated && !entry.loaded);
    return others.every(entry => entry.received || (entry.receiveProgress || 0) > 0);
  }

  // -------------------------------------------------------------------------
  // 17 确认老周死亡
  // -------------------------------------------------------------------------
  UpdateDeath(dt) {
    const r = this.runtime, state = this.death, zhou = r.column.zhou;
    if (!state) return;
    zhou.roll = 0;
    // 军医再次确认：他真的走到担架边上，那一刻才接管镜头并起 ZhouDeath。
    if (!r.Has("deathMedicArrived")) {
      const arrived = r.extras.WalkTo("WardSurgeon", E.surgeonExamine, E.surgeonMps, { arriveM: 0.5, yaw: E.surgeonExamine.yaw });
      const surgeon = r.extras.Actor("WardSurgeon");
      if (arrived && surgeon && Distance(surgeon.position, zhou) <= E.surgeonReachM) {
        r.ai.SetStance(surgeon, 1, 6, true);
        r.Record("deathMedicArrived", { surgeon: surgeon.id });
        r.BeginControl("death", R.deathSeconds);
        r.Say("ZhouDeath", { urgent: true });
      }
    }
    const yaowa = r.companion.Handle("yaowa");
    if (yaowa?.alive && Distance(yaowa.position, zhou) < 2) r.ai.SetStance(yaowa, 1, 2, true);

    if (!state.confirmed) return;
    // 门外又抬来伤员：一副真的担架走进院子，军医转过去救下一个。
    state.nextProgress = Math.min(NEXT_LITTER_LENGTH, state.nextProgress + dt * E.nextLitterMps);
    const at = EndRoutePoint(E.nextLitterRoute, state.nextProgress);
    state.next = at;
    if (!state.nextSaid && state.nextProgress > NEXT_LITTER_LENGTH * 0.45) { state.nextSaid = true; r.Say("NextLitter"); }
    const surgeon = r.extras.Actor("WardSurgeon");
    if (state.nextProgress >= NEXT_LITTER_LENGTH - 0.05 && surgeon) {
      const side = { x: at.x + 1.1, z: at.z };
      const there = r.extras.WalkTo("WardSurgeon", side, E.surgeonMps, { arriveM: 0.6 });
      if (there) {
        r.ai.SetStance(surgeon, 1, 2, true);
        r.extras.Face("WardSurgeon", at, dt, 2.2);
        if (Distance(surgeon.position, at) <= E.nextLitterReachM) state.treating = true;
      }
    }
    // 幺娃把老周身上滑下来的覆盖物拉正。
    if (yaowa?.alive && Distance(yaowa.position, zhou) < 2.4) state.coverS += dt;
    // 何有田经过门边看一眼，没说话，又转向外面。
    r.extras.Actor("WardSurgeon");
    const he = r.companion.Handle("heyoutian");
    if (he?.alive && !this.walks.has(he.id) && !state.heSent) {
      state.heSent = true;
      this.walks.set(he.id, { actor: he, route: E.heDoorLook.map(point => ({ ...point })), speed: E.squadAssignMps });
    }
    // 接收处确实继续在工作了，17 才算走完。
    if (!state.resumed && state.treating && state.coverS >= E.coverStraightenS && r.voice.finished.has("NextLitter")) {
      state.resumed = true;
      r.Record("deathSceneComplete", { nextLitter: true, surgeonTreating: true });
    }
  }
  /** 受控演出（death）放完：这一刻只是「确认了」，接收处还得继续工作。 */
  OnDeathSceneEnd() {
    if (this.death) this.death.confirmed = true;
  }

  // -------------------------------------------------------------------------
  // 剧情走位（16 的分派、17 的何有田）：UpdateSquad 里让开这几个人。
  // -------------------------------------------------------------------------
  HasWalk(actorId) { return this.walks.has(actorId); }
  UpdateWalks() {
    const r = this.runtime;
    for (const [id, walk] of this.walks) {
      const actor = walk.actor;
      if (!actor?.alive) { this.walks.delete(id); continue; }
      while (walk.route.length && Distance(actor.position, walk.route[0]) < 0.9) walk.route.shift();
      if (walk.route.length) r.MoveActor(actor, walk.route[0], walk.speed);
      else { r.MoveActor(actor, actor.position, 0); r.ai.SetStance(actor, 0, 1, true); }
    }
  }

  // -------------------------------------------------------------------------
  Dress(step) {
    const r = this.runtime;
    if (step === "Death" && this.death?.confirmed && this.death.next)
      r.dressing.Litter("WardNextLitter", this.death.next.x, this.death.next.z, this.death.next.yaw,
        { moving: this.death.nextProgress < NEXT_LITTER_LENGTH - 0.05 });
  }
  Update(dt, step) {
    if (step === "ReceptionGate") this.UpdateGate(dt);
    if (step === "Handover") this.UpdateHandover(dt);
    if (step === "Death") this.UpdateDeath(dt);
    if (["Handover", "Death", "BridgeOrders"].includes(step)) this.UpdateWalks();
    this.Dress(step);
  }
  State() {
    return {
      gate: this.gate && { challenged: this.gate.challenged, accepted: this.gate.accepted, guided: this.gate.guided },
      handover: this.handover && { placeAsked: this.handover.placeAsked, examineAsked: this.handover.examineAsked, assigned: this.handover.assigned },
      death: this.death && {
        confirmed: this.death.confirmed, nextSaid: this.death.nextSaid,
        nextProgress: Number(this.death.nextProgress.toFixed(2)),
        treating: !!this.death.treating, resumed: this.death.resumed,
      },
      walks: [...this.walks.values()].map(walk => ({ cast: walk.actor.castId, remaining: walk.route.length })),
    };
  }
}

export const RECEPTION_NEXT_LITTER_LENGTH = NEXT_LITTER_LENGTH;
