// ===========================================================================
// Script_FirstLevelVillageBlock.mjs —— 第一关公开阶段 8/9/10 的演出与通过条件
//
// 需求原文：docs/Data_FirstLevelRebuildSource20260919.md 的 08—10；
// 接口契约：docs/Data_FirstLevelRebuild20260919Contract.md §2/§4/§5。
// 运行时（Script_FirstLevelMissionRuntime）只留薄钩子：Enter 的三个分支与 Update 的一段。
//
// 这一层负责四件在骨架里只有最小实现的事：
//   1. 主街那一头真的有人 —— 前队与退回守军站在障碍北侧喊话（StreetBlocked）；
//      东巷窗口真的有日军占住能打主街的射位。
//   2. 担架队**真的停进遮挡**（LitterHoldCover 后面的 litterWait 车位），
//      而不是「离 litterHold 三十六米以内」；停好了还要两条射线都被切断才算数。
//   3. 罗班长真的走去查看相邻房屋，回来才喊 KitchenDetour；何有田真的留在外头看着。
//   4. 09 连屋来敌由「玩家进了灶屋」放出；贴上身才走共用白刃（Script_MeleeCombat），
//      提前打掉就没有僵持。10 开院门之后担架**真的从等待点走过来**，穿院子接回主街。
//
// 玩家可见中文一律走文本表/台词表（Script_TextTest 的闸门模块清单里有这一份）。
// ===========================================================================
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_ENCOUNTER_ACTIVATION } from "./Data_FirstLevelMissionGates.mjs";
import { MID_TUNING as M, MidLitterHoldSlots, MidWalkerHoldSlots } from "./Data_Tuning_FirstLevelMid.mjs";
import { InstallMissionSentry } from "./Script_FirstLevelMissionPeople.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** 主街那一头站着的人：前队两个、刚从东巷退回来的守军两个。都不开枪，只站位与喊话。 */
export const VILLAGE_BYSTANDERS = Object.freeze([
  ...P.streetBlock.frontParty.map((point, i) => Object.freeze({ id: `StreetFrontParty${i}`, ...point })),
  ...P.streetBlock.withdrawnGuards.map((point, i) => Object.freeze({ id: `StreetWithdrawn${i}`, ...point })),
]);

/**
 * 「担架停在这个点上，是不是真的被遮挡切断了射线」。
 * 两条：东巷窗口射手（P.streetBlock.windowShooter）与主街缺口（P.streetBlock.gap）。
 * 纯几何，测试可以不起运行时直接调。
 */
export function VillageHoldCovered(point, BlocksSight, Point) {
  return [P.streetBlock.windowShooter, P.streetBlock.gap].every((from) =>
    BlocksSight(Point(from, M.holdSightFromM), Point(point, M.holdSightToM)));
}

export class FirstLevelVillageBlock {
  constructor(runtime) {
    this.r = runtime;
    this.bystanders = [];
    this.holding = false;
    this.released = false;
    this.breachAt = null;
  }

  // -------------------------------------------------------------------------
  // 进步骤
  // -------------------------------------------------------------------------
  Enter(stageId) {
    if (stageId === "Village") {
      this.SpawnBystanders();
      this.HoldColumn();
      this.WatchOutside();
    }
    if (stageId === "Melee") this.breachAt = null;
  }

  /** 前队与退回守军：真人、不参战、不会被当成普通阵亡拖累编排。 */
  SpawnBystanders() {
    if (this.bystanders.length) return;
    const r = this.r;
    for (const spec of VILLAGE_BYSTANDERS) {
      const actor = r.ai.Spawn("nra", spec.x, spec.z, { weapon: "HanYang", squadId: "MissionStreetBlock" });
      if (!actor) continue;
      actor.missionId = spec.id;
      actor.scriptEssential = true;
      actor.scriptedNoncombatant = true;
      InstallMissionSentry(actor);
      r.Defend(actor, spec, 0, 0);
      r.ai.SetStance(actor, 1, Infinity, true);
      actor.yaw = spec.yaw ?? 0;
      this.bystanders.push(actor);
    }
  }

  /** 担架队停进遮挡：每一副担架、每一个步行的人各领一个停车位。 */
  HoldColumn() {
    if (this.holding || this.released) return;
    const column = this.r.column;
    const litters = column.litters.filter((litter) => litter.health > 0 && !litter.evacuated);
    const walkers = column.walkers.filter((walker) => walker.health > 0 && !walker.assigned);
    const litterSlots = MidLitterHoldSlots(P.streetBlock.litterWait, litters.length);
    const walkerSlots = MidWalkerHoldSlots(P.streetBlock.litterWait, walkers.length);
    litters.forEach((litter, i) => { litter.holdSlot = litterSlots[i]; litter.held = false; });
    walkers.forEach((walker, i) => { walker.holdSlot = walkerSlots[i]; walker.held = false; });
    this.holding = true;
  }

  /** 何有田留在外头看着（KitchenDetour 的第二句）。 */
  WatchOutside() {
    const actor = this.r.companion.Handle("heyoutian");
    if (!actor) return;
    this.watchPost = {
      x: (P.streetBlock.litterWait[0].x + A.litterHold.x) / 2,
      z: A.litterHold.z + 2.4,
    };
    this.r.squadRoutes.set(actor.id, [{ ...this.watchPost }]);
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------
  Update(dt) {
    const stage = this.r.flow.stage.id;
    if (stage === "Village") this.UpdateVillage(dt);
    if (stage === "Melee") this.UpdateMeleeBeat();
    if (stage === "Courtyard") this.UpdateCourtyard();
  }

  UpdateVillage() {
    const r = this.r;
    if (!r.Has("streetBlockSeen")) return;
    this.HoldColumn();
    // 班长查看相邻房屋：看见街堵了，他就往右手那间灶屋走（门内侧的掩护位）。
    const luo = r.companion.Handle("luo");
    if (luo?.alive && !this.luoSent) {
      this.luoSent = true;
      // 先到门外、再穿门洞：只给门内一个点的话，从西边来会顶死在灶屋西墙上。
      r.squadRoutes.set(luo.id, [{ ...M.houseCheckDoorApproach }, { ...P.ambushSquadPosts[2] }]);
    }
    // 走到门口、或者人已经在灶屋里，就算查看过了；他阵亡就由别人接着喊。
    const kitchen = P.kitchenInterior;
    const inside = (point) => point.x > kitchen.minX && point.x < kitchen.maxX
      && point.z > kitchen.minZ && point.z < kitchen.maxZ;
    if (!r.Has("houseChecked") && (!luo?.alive
      || inside(luo.position)
      || Distance(luo.position, P.ambushSquadPosts[2]) < M.houseCheckArrivalM))
      r.Record("houseChecked", { x: luo?.position.x ?? null, z: luo?.position.z ?? null });
    const watcher = r.companion.Handle("heyoutian");
    if (watcher?.alive && this.watchPost && !r.Has("outsideWatched")
      && Distance(watcher.position, this.watchPost) < M.outsideWatchArrivalM) {
      r.Record("outsideWatched", { x: watcher.position.x, z: watcher.position.z });
      r.Defend(watcher, this.watchPost, 0, 0);
    }
    if (r.Has("houseChecked")) r.Say("KitchenDetour");
    if (this.LittersHeld()) r.Record("littersInCover", { held: this.HeldLitters().length });
  }

  HeldLitters() {
    return this.r.column.litters.filter((litter) => litter.health > 0 && !litter.evacuated);
  }

  /** 全部活着的担架都停到位、而且两条射线都被切断，才算「停进可靠遮挡」。 */
  LittersHeld() {
    const r = this.r, litters = this.HeldLitters();
    if (!litters.length) return false;
    return litters.every((litter) =>
      litter.held
      && Distance(litter, litter.holdSlot || litter) <= M.litterHoldArrivalM
      && VillageHoldCovered(litter, (from, to) => r.BlocksSight(from, to), (point, rise) => r.Point(point, rise)));
  }

  // -------------------------------------------------------------------------
  // 09：连屋来敌
  // -------------------------------------------------------------------------
  /** 连屋那一组：玩家进了灶屋、走到连屋这个半径里，他们才从东巷那扇门进来。 */
  UpdateMeleeBeat() {
    const r = this.r, wake = MISSION_ENCOUNTER_ACTIVATION.melee.wake;
    const ambushers = MISSION_ENCOUNTERS.melee.map((spec) => r.enemies.get(spec.id)).filter(Boolean);
    if (!r.Has("meleeBreachStarted")) {
      if (!r.Has("kitchenEntered") || Distance(r.player.position, A.melee) >= wake.radiusM) return;
      for (const actor of ambushers) { actor.missionDormant = false; actor.scriptedNoncombatant = false; }
      r.Record("meleeBreachStarted", { woke: ambushers.length });
      this.breachAt = r.time;
      return;
    }
    // 「右手！」是发现人影那一瞬吼的，所以压到破门之后、不在 Enter 里自动播。
    if (r.time - (this.breachAt ?? r.time) >= M.meleeBreachHoldS) r.Say("MeleeRight");
    // 真贴上白刃（共用 Script_MeleeCombat 的僵持/推架）才骂那一句；提前打掉就没有。
    const bound = r.meleeCombat?.Active
      || ambushers.some((actor) => actor.alive && Distance(actor.position, r.player.position) <= M.meleeCurseReachM);
    if (bound) r.Say("MeleeCurse");
    // 近战结束，窗口火力仍封锁院口。
    if (r.Has("meleeResolved") && this.WindowHoldsYard()) {
      r.Record("windowFireHolding", { gunner: "VillageGunner" });
      r.Say("WindowOrder");
    }
  }

  /** 窗口那挺机枪还活着、而且它到院门的射线是通的 —— 「窗口火力仍封锁院口」。 */
  WindowHoldsYard() {
    const gun = this.r.enemies.get("VillageGunner");
    if (!gun?.alive) return false;
    return !this.r.BlocksSight(this.r.Point(gun.position, M.holdSightFromM), this.r.Point(A.gate, M.windowCoverTargetM));
  }

  // -------------------------------------------------------------------------
  // 10：开院门，放行担架
  // -------------------------------------------------------------------------
  UpdateCourtyard() {
    const r = this.r;
    if (r.Has("courtyardGateOpen")) this.Release();
    // 队尾掩护脱离：队尾那个人（刘文财）走过院门以南这么远。
    const tail = r.companion.Handle("liuwencai");
    if (!r.Has("rearCoverDisengaged") && (!tail?.alive || tail.position.z > A.gate.z + M.rearCoverClearM))
      r.Record("rearCoverDisengaged", { z: tail?.position.z ?? null });
  }

  /** 08 等待点 → 主街后送线：给每个人一条从自己脚下接回 courtyardBypass 的路。 */
  Release() {
    if (this.released || !this.holding) return;
    const route = this.r.column.route;
    const index = route.findIndex((point) =>
      Math.abs(point.x - M.courtyardRejoinPoint.x) < 0.1 && Math.abs(point.z - M.courtyardRejoinPoint.z) < 0.1);
    this.r.column.ReleaseHold(index < 0 ? 0 : index);
    this.holding = false;
    this.released = true;
  }

  /** 「街堵了！」从前队那个回头喊话的人嘴里出来，不是贴在玩家脸上。 */
  VoicePosition(cue) {
    if (cue.id !== "StreetBlocked") return null;
    const actor = this.bystanders.find((a) => a.missionId === "StreetFrontParty0" && a.alive)
      || this.bystanders.find((a) => a.alive);
    return actor ? this.r.Point(actor.position, 1.3) : null;
  }

  /** 担架队还停着没有？工作台与测试用。 */
  State() {
    return {
      holding: this.holding, released: this.released,
      bystanders: this.bystanders.map((actor) => ({ id: actor.missionId, alive: actor.alive })),
      held: this.HeldLitters().map((litter) => ({ id: litter.id, held: !!litter.held, x: litter.x, z: litter.z })),
    };
  }
}

/** 10 的放行计数：还剩几副没过院门（TwoLitters / LastLitter 都按它喊）。 */
export function VillagePendingLitters(column) {
  return column.litters.filter((litter) => litter.health > 0 && !litter.passedGate && !litter.evacuated);
}

/** 通过条件：这批存活伤员全部通过院落出口，而且队尾掩护已经脱离。 */
export function VillageCourtyardCleared(column, rearDisengaged) {
  const living = column.litters.filter((litter) => litter.health > 0 && !litter.evacuated);
  return rearDisengaged && living.length > 0 && living.every((litter) => litter.passedGate);
}
