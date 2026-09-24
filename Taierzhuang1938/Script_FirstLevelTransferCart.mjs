// ===========================================================================
// Script_FirstLevelTransferCart.mjs —— 第一关公开阶段 11/12/13/14 的演出与通过条件
//
// 需求原文：docs/Data_FirstLevelRebuildSource20260919.md 的 11—14；
// 接口契约：docs/Data_FirstLevelRebuild20260919Contract.md §2/§4/§5；
// 编排口径：docs/Data_FirstLevelMid20260919.md。
//
// 骨架里这一段只有最小实现：装载按 column 自己的节奏走、老周的「车」其实是让担架
// 沿一条折线飘、卸人是一帧完成的。这一层把它们换成真的：
//   11 四类人流（牛车 / 马车 / 人力担架 / 能走的伤员）各自分流；
//      辨认接运区、村路威胁、桥头方向三样用**朝向/到位门**，不是计时。
//   12 每解除一处威胁才放开一批装载额度：威胁还在时装载与出发被压住；
//      何有田真的走过来接住射位才放顺子走；老周真的被装上一辆牛/马车，车真的开走。
//   13 车列与人群被迫停止、散开；玩家那辆车停在 cartHalt 还权；
//      搬运人员**有过程地**把老周卸回担架。
//   14 扑沟之后按「进沟内遮挡 / 离开主车道」判，不看秒表。
//
// 玩家可见中文一律走文本表/台词表。
// ===========================================================================
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ENCOUNTERS, MISSION_TRANSFER_THREATS } from "./Data_FirstLevelMission.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as M, MidWalkingWounded } from "./Data_Tuning_FirstLevelMid.mjs";
import { MissionRouteLength, MissionCarryRoutePoint } from "./Script_FirstLevelMissionColumn.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Wrap = (radians) => Math.atan2(Math.sin(radians), Math.cos(radians));

/**
 * 车体局部偏移 → 世界坐标。局部 -z 是车头（与 Script_FirstLevelMissionView.CartInstance
 * 的 Euler(0,yaw,0) 一致：牲口挂在 (0,-4.8)）。
 */
export function CartSeatPoint(cart, offset) {
  const cos = Math.cos(cart.yaw), sin = Math.sin(cart.yaw);
  return {
    x: cart.x + offset.dx * cos + offset.dz * sin,
    z: cart.z - offset.dx * sin + offset.dz * cos,
  };
}

/**
 * 朝向门：人站在 `near` 这一带（rangeM 以内），而且正脸对着 `point` 的 cone 锥角里。
 * yaw 的口径与射击一致：朝向 t 的偏航是 atan2(eye.x - t.x, eye.z - t.z)。
 */
export function FacingPoint(player, point, { cone = M.identifyConeRad, near = null, rangeM = Infinity } = {}) {
  if (near && Distance(player.position, near) > rangeM) return false;
  const bearing = Math.atan2(player.position.x - point.x, player.position.z - point.z);
  return Math.abs(Wrap(bearing - player.yaw)) <= cone;
}

export class FirstLevelTransferCart {
  constructor(runtime) {
    this.r = runtime;
    this.walkers = [];
    this.postsTaken = false;
    this.ride = null;
    this.unload = null;
    this.scattered = false;
  }

  // -------------------------------------------------------------------------
  // 进步骤
  // -------------------------------------------------------------------------
  Enter(stageId) {
    if (stageId === "TransferApproach") this.SpawnWalkingWounded();
    if (stageId === "Transfer") this.TakePosts();
    if (stageId === "AirFirst") this.Scatter();
  }

  /**
   * 11 的第四类人流：接运点现场能自己走 / 互相搀扶的伤员。
   * 后送队本身 walkingWoundedCount=0（用户 2026-09-16 砍的是随队护送编制），
   * 这一批是这一片本来就有的人，挂在 column 上由 View 画出来。
   */
  SpawnWalkingWounded() {
    if (this.walkers.length) return;
    this.walkers = MidWalkingWounded();
    for (const walker of this.walkers) walker.visible = true;
    this.r.column.transferWalkers = this.walkers;
  }

  /** 12：班里人上低墙 / 墙角射位，朝村路，不站在伤员中间。 */
  TakePosts() {
    for (const post of M.defencePosts) {
      const actor = this.r.companion.Handle(post.cast);
      if (!actor?.alive) continue;
      this.r.squadRoutes.set(actor.id, [{ x: post.x, z: post.z }]);
    }
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------
  Update(dt) {
    const stage = this.r.flow.stage.id;
    if (["TransferApproach", "Transfer", "CartRide", "AirFirst"].includes(stage)) this.UpdateWalkingWounded(dt);
    if (stage === "TransferApproach") this.UpdateApproach();
    if (stage === "Transfer") this.UpdateTransfer();
    if (stage === "AirFirst") this.UpdateAirGround(dt);
    if (["Carry", "Dive", "Rescue"].includes(stage)) this.UpdateDitch();
    this.UpdateUnload(dt);
  }

  // --- 11 -------------------------------------------------------------------
  /** 分流：接运兵喊完之后，能走的那一批真的往前头走。 */
  UpdateWalkingWounded(dt) {
    if (!this.walkers.length) return;
    const sorted = this.r.Has("transferSortingHeard");
    for (const walker of this.walkers) {
      if (!sorted) continue;
      const goal = M.walkingWoundedExit;
      const distance = Distance(walker, goal);
      if (distance <= M.walkingWoundedArrivalM) { walker.sorted = true; walker.moving = false; continue; }
      const step = Math.min(1, (dt * M.walkingWoundedMps) / (distance || 1));
      walker.x += (goal.x - walker.x) * step;
      walker.z += (goal.z - walker.z) * step;
      walker.yaw = Math.atan2(walker.x - goal.x, walker.z - goal.z);
      walker.moving = true;
    }
  }

  /** 躺着的先上车：装载区集结口袋里真有这么多副担架，才算分流真的开始。 */
  LittersSorted() {
    const staged = this.r.column.litters.filter((litter) =>
      litter.health > 0 && !litter.evacuated && (litter.loaded || litter.staging?.area === "transfer" || litter.passedGate));
    return staged.length >= M.sortedLitterCount;
  }

  UpdateApproach() {
    const r = this.r;
    if (!r.Has("transferApproachReached")) return;
    r.Say("TransferSorting");
    if (!r.Has("transferSorted") && this.LittersSorted() && this.walkers.some((walker) => walker.sorted))
      r.Record("transferSorted", { walkers: this.walkers.filter((w) => w.sorted).length });
    // 桥头方向：对准路桥，或者人已经走到车位那一排以南（那就已经看见那条路了）。
    if (!r.Has("bridgeHeadSeen")
      && (r.player.position.z >= M.bridgeHeadSouthZ
        || FacingPoint(r.player, M.bridgeHeadPoint)))
      r.Record("bridgeHeadSeen", { z: r.player.position.z });
    // 村路威胁：站在接运区一带回头看村路来路，或者追兵已经露头。
    const pursuers = [...r.enemies.values()].filter((actor) =>
      actor.alive && ["village", "courtyard", "melee"].includes(actor.missionEncounter));
    const visible = pursuers.some((actor) => Distance(actor.position, r.player.position) < R.passageRangeM);
    if (!r.Has("villageRoadWatched")
      && (visible || FacingPoint(r.player, M.villageRoadMouth, { near: A.transfer, rangeM: M.identifyRangeM })))
      r.Record("villageRoadWatched", { pursuers: pursuers.length });
    // 三样都辨认过了，何有田才喊「后头追出来了」，班长才把村路压给顺子。
    if (r.Has("transferSorted") && r.Has("bridgeHeadSeen") && r.Has("villageRoadWatched"))
      r.Say("VillageRoadThreat");
  }

  // --- 12 -------------------------------------------------------------------
  /**
   * 装载额度：每解除一处威胁放开一批。威胁还在的时候额度是 0 ——
   * 装载与出发被**压住**，不是慢一点。
   */
  LoadAllowance() {
    const cleared = this.r.transferBeats?.cleared.length || 0;
    // 两处都解除之后「接运继续」（Notion 12 末段）：不再设额度，
    // 否则最后一副担架永远装不上，老周也就永远轮不到。
    if (cleared >= MISSION_TRANSFER_THREATS.length) return Infinity;
    return cleared * M.loadAllowancePerThreat;
  }

  UpdateTransfer() {
    const r = this.r, column = r.column;
    column.loadAllowance = this.LoadAllowance();
    if (!this.postsTaken && M.defencePosts.every((post) => {
      const actor = r.companion.Handle(post.cast);
      return !actor?.alive || Distance(actor.position, post) < M.defencePostArrivalM;
    })) {
      this.postsTaken = true;
      r.Record("transferPostsManned");
    }
    // 第一批真的装完并离开（不是「装了两个」）。
    if (r.Has("loadingThreatResolved") && column.loadEvents.length >= R.transferBatchLoads && column.departed >= 1)
      r.Record("firstBatchLoaded", { loaded: column.loadEvents.length, departed: column.departed });
    if (!r.Has("alleyThreatResolved")) return;
    if (column.QueueAhead() !== 0) return;
    // 轮到老周：给他叫一辆车过来停到上车位旁边，他被抬过去装车。
    column.BeginZhouBoarding();
    column.ReserveBoardingCart(P.cartBays[0]);
    if (Distance(column.zhou, column.zhouBoardingStart) >= R.boardingWitnessM) r.Record("zhouNext");
    // 何有田真的走过来接住射位，才轮到「这边我看着！去搭把手！」
    const he = r.companion.Handle("heyoutian");
    if (he?.alive) r.squadRoutes.set(he.id, [{ x: A.transfer.x, z: A.transfer.z }]);
    const relieved = !he?.alive || Distance(he.position, A.transfer) <= M.escortReliefM;
    if (relieved) {
      r.Record("escortRelieved", { x: he?.position.x ?? null, z: he?.position.z ?? null });
      r.Say("EscortZhou");
    }
  }

  // --- 12 CartRide ----------------------------------------------------------
  /** 顺子上车：老周那辆牛/马车真的载着两个人沿桥头路走。 */
  Board() {
    const column = this.r.column;
    const cart = column.BoardZhouOnCart();
    if (!cart) return false;
    this.ride = {
      cart,
      route: [{ x: cart.x, z: cart.z }, ...MISSION_STAGE_ROUTES.cartRide.slice(1).map((point) => ({ ...point }))],
      progress: 0,
      from: { x: cart.x, z: cart.z },
      halted: false,
      unloaded: false,
    };
    this.ride.length = MissionRouteLength(this.ride.route);
    cart.riding = true;
    return true;
  }

  /** 车沿路线真走；13 在这里停车、还权。 */
  UpdateRide(dt) {
    const ride = this.ride;
    if (!ride) return;
    const r = this.r, stage = r.flow.stage.id, cart = ride.cart;
    const moving = !ride.halted && ["CartRide", "AirFirst"].includes(stage);
    if (moving) ride.progress = Math.min(ride.length, ride.progress + dt * R.cartRideSpeedMps);
    const at = MissionCarryRoutePoint(ride.route, ride.progress);
    cart.x = at.x; cart.z = at.z; cart.yaw = at.yaw ?? Math.PI;
    if (r.controls?.kind === "cartRide") {
      const seat = CartSeatPoint(cart, P.cartRide.playerSeat);
      const y = r.battlefield.GroundHeight(seat.x, seat.z) + M.cartSeatRiseM;
      r.player.position.set(seat.x, y, seat.z);
      r.player.body?.Teleport(seat.x, y, seat.z);
      r.player.velocity.set(0, 0, 0);
    }
    const travelled = Distance(cart, ride.from);
    if (travelled >= M.cartTalkAfterM) r.Say("CartTalk");
    if (travelled >= R.cartDepartedM) r.Record("zhouCartDeparted", { x: cart.x, z: cart.z });
    if (stage !== "AirFirst") return;
    if (!ride.halted && (ride.progress >= ride.length - 0.05 || r.Has("firstAirPassComplete"))) {
      ride.halted = true;
      cart.halted = true;
      r.Record("cartHalted", { x: cart.x, z: cart.z });
      if (r.controls?.kind === "cartRide") { const kind = r.controls.kind; r.controls = null; r.Control?.(false, kind); }
      this.BeginUnload();
    }
  }

  // --- 13 -------------------------------------------------------------------
  /** 车辆与人群被迫停止、散开。 */
  Scatter() {
    if (this.scattered) return;
    this.scattered = true;
    const column = this.r.column;
    column.loading = false;
    column.ScatterFromRoad(M.scatterFromRoadM);
    for (const walker of this.walkers) {
      walker.scatterTo = { x: walker.x - M.scatterFromRoadM, z: walker.z + 2 };
      walker.sorted = true;
    }
  }

  UpdateAirGround(dt) {
    const r = this.r;
    r.Say("AircraftFirst");
    for (const walker of this.walkers) {
      if (!walker.scatterTo) continue;
      const distance = Distance(walker, walker.scatterTo);
      if (distance <= M.scatterArrivalM) { walker.moving = false; walker.crouch = true; continue; }
      const step = Math.min(1, (dt * M.scatterMps) / (distance || 1));
      walker.x += (walker.scatterTo.x - walker.x) * step;
      walker.z += (walker.scatterTo.z - walker.z) * step;
      walker.yaw = Math.atan2(walker.x - walker.scatterTo.x, walker.z - walker.scatterTo.z);
      walker.moving = true;
    }
    // 罗班长从后方赶到：他真的跑到停车处才喊「莫挤路上！能下沟的下沟！」
    const luo = r.companion.Handle("luo");
    if (luo?.alive && !r.Has("luoAtHalt")) {
      r.MoveActor(luo, A.cartHalt, M.luoArriveMps);
      if (Distance(luo.position, A.cartHalt) < M.luoArriveM) r.Record("luoAtHalt");
    }
  }

  /** 卸人有过程：两个搬运的人先走到车边，再把担架从车板放到地面。 */
  BeginUnload() {
    if (this.unload) return;
    const column = this.r.column, cart = this.ride?.cart;
    if (!cart) return;
    const target = { x: cart.x - M.unloadOffsetM, z: cart.z };
    const bearers = column.walkers
      .filter((walker) => walker.health > 0 && !walker.assigned && !walker.rescueTarget)
      .sort((a, b) => Distance(a, cart) - Distance(b, cart))
      .slice(0, 2);
    // 这两个人这段时间归卸车用：让 column 的行进循环别再按队列把他们拖走。
    for (const bearer of bearers) bearer.treating = true;
    // A reserved cart may already carry another wounded man. Unload those
    // passengers first, then Zhou: his existing fact cannot strand anyone aboard.
    const passengers = column.litters.filter(litter => cart.load.includes(litter.id)
      && litter.health > 0 && !litter.evacuated && !litter.zhou);
    passengers.push(column.zhou);
    const queue = passengers.map((litter, index) => ({ litter,
      // Keep additional litters north of Zhou, away from the river-bank descent.
      target: { x: target.x, z: target.z - (passengers.length - 1 - index) * 2 * R.litterSpacingM } }));
    this.unload = { cart, target: queue[0].target, queue, index: 0, bearers, seconds: 0, lowered: false };
  }

  UpdateUnload(dt) {
    const unload = this.unload;
    if (!unload || unload.lowered) return;
    const r = this.r, litter = unload.queue[unload.index].litter;
    let ready = true;
    for (const [i, bearer] of unload.bearers.entries()) {
      const slot = { x: unload.target.x + (i ? 0.9 : -0.9), z: unload.target.z };
      const distance = Distance(bearer, slot);
      if (distance > M.unloadBearerReachM) {
        const step = Math.min(1, (dt * M.unloadBearerMps) / (distance || 1));
        bearer.x += (slot.x - bearer.x) * step;
        bearer.z += (slot.z - bearer.z) * step;
        bearer.yaw = Math.atan2(bearer.x - slot.x, bearer.z - slot.z);
        ready = false;
      }
    }
    if (!ready) return;
    if (!unload.started) {
      unload.started = true;
      unload.from = { x: litter.x, z: litter.z };
      r.column.BeginLitterUnload(litter, unload.target);
    }
    unload.seconds += dt;
    const fraction = Math.min(1, unload.seconds / M.unloadSeconds);
    litter.liftFraction = 1 - fraction;
    litter.x = unload.from.x + (unload.target.x - unload.from.x) * fraction;
    litter.z = unload.from.z + (unload.target.z - unload.from.z) * fraction;
    if (fraction < 1) return;
    litter.liftFraction = 0;
    litter.state = "waiting";
    if (!litter.zhou) {
      unload.index++;
      unload.target = unload.queue[unload.index].target;
      unload.started = false;
      unload.seconds = 0;
      return;
    }
    unload.lowered = true;
    for (const bearer of unload.bearers) bearer.treating = false;
    litter.health = Math.min(litter.health, 45);
    litter.bearers = [Math.max(1, litter.bearers[0]), Math.max(1, litter.bearers[1])];
    r.Record("zhouUnloaded", { x: litter.x, z: litter.z });
    r.Say("WestDitchOrder");
  }

  // --- 14 -------------------------------------------------------------------
  /**
   * 队伍进沟、离开主车道：位置判定，不看秒表。
   * 「沟内遮挡」量的是**下沟口** `ditchMouth`（53,114）—— 扑沟就扑在那儿；
   * `ditch`（39,116）是抬进去之后的落点，那是 15A 的事。
   * 「离开主车道」在 14 能观察到的只有老周那一副担架和玩家自己：整队重新成形
   * 是 15A（Regroup）的 `columnMoving`。
   */
  UpdateDitch() {
    const r = this.r, zhou = r.column.zhou, road = M.bridgeHeadPoint.x;
    if (!zhou) return;
    if (!r.Has("ditchSheltered") && Distance(zhou, A.ditchMouth) <= M.ditchShelterM)
      r.Record("ditchSheltered", { x: zhou.x, z: zhou.z });
    if (!r.Has("columnOffRoad")
      && Math.abs(zhou.x - road) >= M.offRoadM && Math.abs(r.player.position.x - road) >= M.offRoadM)
      r.Record("columnOffRoad", { zhou: zhou.x, player: r.player.position.x });
  }

  State() {
    return {
      walkers: this.walkers.map((walker) => ({ id: walker.id, x: walker.x, z: walker.z, sorted: !!walker.sorted })),
      postsTaken: this.postsTaken,
      allowance: this.r.column.loadAllowance ?? 0,
      ride: this.ride ? { cart: this.ride.cart.id, progress: this.ride.progress, halted: this.ride.halted } : null,
      unload: this.unload ? { started: !!this.unload.started, seconds: this.unload.seconds, lowered: this.unload.lowered } : null,
    };
  }
}

/** 两处威胁与装载批次的对账（测试与工作台共用）。 */
export function TransferBatchPlan(clearedThreats) {
  return MISSION_TRANSFER_THREATS.map((threat, index) => ({
    id: threat.id,
    resolved: threat.resolved,
    cleared: index < clearedThreats,
    allowance: index < clearedThreats ? (index + 1) * M.loadAllowancePerThreat : 0,
    members: MISSION_ENCOUNTERS[threat.id].map((spec) => spec.id),
  }));
}
