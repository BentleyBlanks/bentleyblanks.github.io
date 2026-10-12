// ===========================================================================
// Script_FirstLevelGengFamily.mjs —— 耿家四个角色：老耿、妮儿、黑子（驴）、驴车（2026-10-12 03–11 重构 B 包）
//
// 口径：docs/Data_FirstLevel0311Refactor20261012Contract.md §1.6 / §1.9 / §3.4 / §3.5 / §5.6。
//   · 妮儿十一岁上下，聋哑，爱捡弹壳攒钱换驴，犟，笑起来又粗又响，听不见所以一直在看。06–11 只能让玩家觉得她
//     「犟 / 喊不应」，听不见这件事 12 车上才说破。不进对白表：叫声 / 笑声走音效 cue（NIER_SHOUT_CUE，现为占位素材）。
//   · 老耿六十出头，嘴硬抠门，帮人从不说是帮，赶驴车；驴叫黑子。08–11 的村子就是耿家庄（C 包消费本模块的方法）。
//   · 占位模型（契约 §1.9）：妮儿 = CivilianFemale 整体缩放 R.geng.nierScale（分身 girl，Script_Actor.KIND_SPEC）；
//     老耿 = CivilianMale；黑子 = WorkingHorse 缩 0.75 深色；驴车 = WoodenEvacCart + 白盒被褥 / 铁锅 / 粮袋。
//   · 整段 scriptEssential + missionUntargetable（Protect(true) 默认）；敌我 AI 都不打他们、不瞄他们。
//
// 06（Orders）：妮儿在洼地东北沟沿（R.geng.nierRim，沟顶比洼地高 1.8 m）蹲着捡 02 打下来的弹壳；玩家进洼地走到她
//   seenRangeM 内记 nierSeen、担架员喊 NierShells（庄稼人搭话）；玩家 ≤ lookGunM 她只看枪口不看脸；玩家在 shellRangeM 内
//   开枪她走过去把落点（枪口右侧随机点）的弹壳捡走。起行后（South）远远跟在队尾、走沟沿不下沟（Follow）。
// 07（South）：沟里幺娃丢弹壳逗她（NierFollow，她去捡）；SouthWhisper 第 5→6 句之间顺子抬头看沟沿上的她（轻微转头，
//   不接管）；沟口机枪一响（OnMouthContact）她撒腾先跑进村北巷（RunTo，不受伤）。
// 08–11：老耿与驴车按 R.geng.gengHouse / cartYard 占位出场；GengGoTo / GengPose / CartTo / PointAt 给 C 包用。
//
// 接口冻结在契约 §5.6：C 包只可加方法，不改这里的签名。状态全部进 runtime.Debug.FirstLevelMission().gengFamily（State()）。
// 玩家可见中文一律走台词表 / 文本表（Script_TextTest 闸门模块）。
// ===========================================================================
import * as THREE from "three";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as MID } from "./Data_Tuning_FirstLevelMid.mjs";
import { MISSION_ANCHORS as A, MISSION_ROUTES, MISSION_PLACEMENT as Place } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionCarryRoutePoint, MissionRouteProjection } from "./Script_FirstLevelMissionColumn.mjs";
import { InstallMissionSentry } from "./Script_FirstLevelMissionPeople.mjs";
import { DraftCartModels } from "./Script_DraftCartModel.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** NPC（Soldier）面朝某点的 yaw（与 Script_Ai 的 watchYaw 同一套：atan2(自己 − 目标)）。 */
export const FaceYaw = (self, target) => Math.atan2(self.x - target.x, self.z - target.z);
/** 玩家（Script_Player，前向量 (−sin yaw, −cos yaw)）面朝某点的 yaw。 */
export const PlayerYawTo = (player, target) => Math.atan2(player.x - target.x, player.z - target.z);
const WrapRad = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * 妮儿的叫声 / 笑声：没有录音前用现有素材占位（短促的人声 hitGrunt，音高抬 R.geng.shoutPitch），集成 / Voice 包换成她自己的
 * `nier_shout` 素材时只改这一处。cue 名 nier_shout 留给素材侧登记。
 */
export const NIER_SHOUT_CUE = "hitGrunt";
export const NIER_SHOUT_ID = "nier_shout";
/** 妮儿 / 老耿 / 庄稼人在 AI 里的 missionId。 */
export const GENG_IDS = Object.freeze({ nier: "GengNier", geng: "GengLaoGeng", peasant: "GengPeasant", cart: "GengCart" });

/**
 * 沟沿在路线的哪一侧：路线点两侧各 offsetM 取地面高的那一侧（妮儿走沟沿不下沟）；两边一样高取右侧（东）。
 * 纯函数（groundAt 注入），Script_FirstLevelGengFamilyTest 对账。
 */
export function RimSide(at, offsetM, groundAt, { preferRight = true, tieM = 0.2 } = {}) {
  const yaw = at.yaw ?? 0;
  const right = { x: at.x + Math.cos(yaw) * offsetM, z: at.z - Math.sin(yaw) * offsetM };
  const left = { x: at.x - Math.cos(yaw) * offsetM, z: at.z + Math.sin(yaw) * offsetM };
  const hr = groundAt(right.x, right.z), hl = groundAt(left.x, left.z);
  if (Math.abs(hr - hl) <= tieM) return preferRight ? { ...right, side: "right" } : { ...left, side: "left" };
  return hr > hl ? { ...right, side: "right" } : { ...left, side: "left" };
}

/** 玩家开枪后弹壳落在枪口右侧 shellEjectM 米的随机点（玩家右手 = (cos yaw, −sin yaw)）。纯函数。 */
export function ShellLandingPoint(player, yaw, rnd = Math.random, tuning = R.geng) {
  const [near, far] = tuning.shellEjectM;
  const side = near + (far - near) * rnd();
  const ahead = 0.3 + 0.5 * rnd();
  return { x: player.x + Math.cos(yaw) * side - Math.sin(yaw) * ahead, z: player.z - Math.sin(yaw) * side - Math.cos(yaw) * ahead };
}

/** 玩家枪口大致在哪（眼位沿前向 0.8 m）：妮儿 ≤ lookGunM 时看的是它，不是脸。纯函数。 */
export function MuzzlePoint(player, yaw) {
  return { x: player.x - Math.sin(yaw) * 0.8, z: player.z - Math.cos(yaw) * 0.8 };
}

export class FirstLevelGengFamily {
  constructor(runtime) {
    this.r = runtime;
    this.T = R.geng;
    this.actors = { nier: null, geng: null, peasant: null };
    this.protected = true;
    this.nierState = "idle";            // idle | picking | following | running | pointing
    this.nierPick = null;               // { target, arrivedAt, done }
    this.nierRoute = null;              // RunTo：剩下的路点
    this.nierRouteDone = null;
    this.follow = null;                 // { route, gapM }
    this.pointing = null;               // { target, until }
    this.gaze = null;                   // { until, target }
    this.shells = 0;                    // 捡到的弹壳
    this.lastShots = null;
    this.nextIdlePickAt = 0;
    this.gengGoal = null;               // { point, cb }
    this.gengPose = null;               // { kind, since }
    this.cartState = null;                   // { id, x, z, yaw, draft, overturned, travel, moving, blocking, target, cb }
    this.cartModels = null;
    this.cartLoad = null;
    this.cartStyled = false;
    this.events = [];
    this.nierFollowSaid = false;
    this.spawnedSteps = new Set();
  }

  // --- 装配 -----------------------------------------------------------------
  Log(name, detail) {
    this.events.push({ name, t: +(this.r.time ?? 0).toFixed(2), ...(detail || {}) });
    if (this.events.length > 48) this.events.shift();
  }
  SpawnCivilian(key, spot, variant) {
    const r = this.r;
    if (this.actors[key]?.alive) return this.actors[key];
    const Spawn = () => {
      const actor = r.ai.Spawn("nra", spot.x, spot.z, {
        actorKind: "civilian", actorVariant: variant, scriptedNoncombatant: true, squadId: `MissionGeng${key}`,
      });
      if (!actor) { r.spawnQueue?.push(Spawn); return null; }
      actor.missionId = GENG_IDS[key];
      actor.missionGeng = key;
      actor.scriptEssential = this.protected;
      actor.missionUntargetable = this.protected;
      actor.yaw = spot.yaw ?? 0;
      InstallMissionSentry(actor);
      r.MoveActor(actor, actor.position, 0);
      r.ai.SetStance(actor, 0, 0.5, true);
      this.actors[key] = actor;
      this.Log("spawn", { who: key, x: +actor.position.x.toFixed(1), z: +actor.position.z.toFixed(1) });
      return actor;
    };
    return Spawn();
  }
  RemoveCivilian(key) {
    const actor = this.actors[key];
    if (actor) { this.r.ai.Remove(actor); this.actors[key] = null; this.Log("remove", { who: key }); }
  }
  Enter(stepId) {
    const r = this.r;
    if (stepId === "Orders") {
      // 06：妮儿蹲在洼地东北沟沿捡弹壳，庄稼人站她身后的坡上。
      this.SpawnCivilian("nier", this.T.nierRim, "girl");
      this.SpawnCivilian("peasant", this.T.peasantSpot, "male");
      this.nierState = "idle";
      this.nextIdlePickAt = r.time + 1.5;
    }
    if (stepId === "South") {
      // 跳到 07 冷启动时她也得在：从沟沿起步跟队。
      if (!this.actors.nier?.alive) this.SpawnCivilian("nier", this.T.nierRim, "girl");
      this.RemoveCivilian("peasant");
      this.Follow(MISSION_ROUTES.southWalk, this.T.followGapM);
    }
    if (["Village", "Melee", "Courtyard", "TransferApproach"].includes(stepId)) {
      // 08 起老耿与驴车在耿家（占位点，C 包按村子的锚点改）；妮儿跳进来时在村北巷。
      if (!this.actors.nier?.alive) this.SpawnCivilian("nier", { ...this.T.villageRefuge, yaw: Math.PI }, "girl");
      if (!this.actors.geng?.alive) this.SpawnCivilian("geng", this.T.gengHouse, "male");
      if (!this.cartState) this.SpawnCart(this.T.cartYard);
      if (this.nierState === "following") { this.follow = null; this.nierState = "idle"; }
    }
    this.spawnedSteps.add(stepId);
  }

  // --- §5.6 读口 ------------------------------------------------------------
  Handle(key) {
    const actor = this.actors[key];
    return { position: actor?.alive ? actor.position : null, actor: actor?.alive ? actor : null,
      state: key === "nier" ? this.nierState : key === "geng" ? (this.gengPose?.kind ?? (this.gengGoal ? "walking" : "idle")) : "idle" };
  }
  get geng() { return this.Handle("geng"); }
  get nier() { return this.Handle("nier"); }
  get peasant() { return this.Handle("peasant"); }
  get heizi() {
    const cart = this.cartState;
    if (!cart) return { position: null, actor: null, state: "absent" };
    return { position: new THREE.Vector3(cart.animal.x, cart.animal.y, cart.animal.z), actor: this.cartModels?.instances?.get(cart.id)?.animalRoot ?? null,
      state: cart.moving ? "pulling" : cart.spooked ? "spooked" : "standing" };
  }
  /** 驴车：{ position, actor, state, blocking, yaw }（契约 §5.6：cart.blocking 读得到）；裸数据在 cartState。 */
  get cart() {
    const cart = this.cartState;
    if (!cart) return { position: null, actor: null, state: "absent", blocking: false, yaw: 0 };
    return { position: new THREE.Vector3(cart.x, cart.y, cart.z), actor: this.cartModels?.instances?.get(cart.id)?.root ?? null,
      state: cart.moving ? "moving" : "parked", blocking: cart.blocking, yaw: cart.yaw };
  }

  // --- §5.6 动作 ------------------------------------------------------------
  /** 妮儿远远跟在队尾（沟沿）。route = southWalk 这种主线；gapM 落后队尾的里程。 */
  Follow(route, gapM = this.T.followGapM) {
    this.follow = { route, gapM };
    this.nierRoute = null; this.nierPick = null; this.pointing = null;
    this.nierState = "following";
    this.Log("follow", { gapM });
  }
  /** 妮儿撒腿跑：point 或一串路点；到了调 cb。 */
  RunTo(point, cb = null) {
    this.nierRoute = (Array.isArray(point) ? point : [point]).map((p) => ({ x: p.x, z: p.z }));
    this.nierRouteDone = cb;
    this.follow = null; this.nierPick = null; this.pointing = null;
    this.nierState = "running";
    this.Log("runTo", { x: +this.nierRoute.at(-1).x.toFixed(1), z: +this.nierRoute.at(-1).z.toFixed(1) });
  }
  /** 妮儿拍车板 + 指向（10 屋顶）：面朝目标、叫一声（nier_shout）。 */
  PointAt(target, seconds = 3) {
    const r = this.r;
    this.pointing = { target: { x: target.x, z: target.z }, until: r.time + seconds };
    if (this.nierState !== "running") this.nierState = "pointing";
    if (this.cartState) r.audio?.Play?.("impactWood", { position: r.Point(this.cartState, 0.9), volume: 0.5 });
    this.Shout("point");
    this.Log("pointAt", { x: +target.x.toFixed(1), z: +target.z.toFixed(1) });
  }
  /** 06：走过去把 point 附近的弹壳捡走（弯腰蹲下，口袋响一声）。 */
  PickShellNear(point) {
    this.nierPick = { target: { x: point.x, z: point.z }, arrivedAt: null, done: false };
    if (this.nierState === "idle" || this.nierState === "following") this.nierState = "picking";
    this.Log("pickShell", { x: +point.x.toFixed(1), z: +point.z.toFixed(1) });
  }
  GengGoTo(point, cb = null) {
    const actor = this.actors.geng;
    if (!actor?.alive) return false;
    this.gengGoal = { point: { x: point.x, z: point.z }, cb };
    this.gengPose = null;
    this.r.ai.SetStance(actor, 0, 0.5, true);
    this.r.MoveActor(actor, this.gengGoal.point, this.T.walkMps);
    this.Log("gengGoTo", { x: +point.x.toFixed(1), z: +point.z.toFixed(1) });
    return true;
  }
  /** 'slap' 'vat' 'table' 'unbar' 'lead-donkey' 'load'：占位姿态（蹲 / 站 + 朝向 + 一声音效），C 包按概念图再换动作。 */
  GengPose(kind) {
    const r = this.r, actor = this.actors.geng;
    if (!actor?.alive) return false;
    this.gengGoal = null;
    this.gengPose = { kind, since: r.time };
    r.MoveActor(actor, actor.position, 0);
    const crouch = ["vat", "table", "load"].includes(kind);
    r.ai.SetStance(actor, crouch ? 1 : 0, 6, true);
    if (kind === "slap" && this.actors.nier?.alive) {
      this.FaceNpc(actor, this.actors.nier.position, 3);
      r.audio?.Play?.("slap", { position: r.Point(this.actors.nier.position, 1.1), volume: 0.6 });
      this.Shout("slapped");
    }
    if ((kind === "lead-donkey" || kind === "unbar") && this.cartState) this.FaceNpc(actor, kind === "unbar" ? A.gate : this.cartState.animal, 3);
    if (kind === "vat" || kind === "table") r.audio?.Play?.("impactWood", { position: r.Point(actor.position, 0.6), volume: 0.4 });
    this.Log("gengPose", { kind });
    return true;
  }
  /** 驴车移动（10 出门、11 到接运点）：直线挪到 point，到了调 cb；cart.blocking 由 SetCartBlocking 管。 */
  CartTo(point, cb = null) {
    if (!this.cartState) this.SpawnCart({ x: point.x, z: point.z, yaw: 0 });
    this.cartState.target = { x: point.x, z: point.z };
    this.cartState.cb = cb;
    this.Log("cartTo", { x: +point.x.toFixed(1), z: +point.z.toFixed(1) });
  }
  SetCartBlocking(blocking) { if (this.cartState) this.cartState.blocking = !!blocking; }
  /** scriptEssential / missionUntargetable 开关（整段默认 true）。 */
  Protect(on = true) {
    this.protected = !!on;
    for (const actor of Object.values(this.actors)) if (actor) { actor.scriptEssential = this.protected; actor.missionUntargetable = this.protected; }
    this.Log("protect", { on: this.protected });
  }

  // --- 小工具 ---------------------------------------------------------------
  FaceNpc(actor, target, seconds = 0.6) {
    actor.watchYaw = FaceYaw(actor.position, target);
    actor.watchUntil = (this.r.ai?.time ?? this.r.time) + seconds;
    actor.yaw = actor.watchYaw;
  }
  Shout(why) {
    const r = this.r, actor = this.actors.nier;
    if (!actor?.alive) return;
    r.audio?.Play?.(NIER_SHOUT_CUE, { position: r.Point(actor.position, 0.9), volume: 0.55, pitch: this.T.shoutPitch });
    this.Log(NIER_SHOUT_ID, { why });
  }
  Stop(actor) { this.r.MoveActor(actor, actor.position, 0); }

  // --- 每帧 -----------------------------------------------------------------
  Update(dt) {
    const r = this.r, stage = r.flow?.stage?.id;
    if (stage === "Orders") this.UpdateOrders(dt);
    this.UpdateNier(dt);
    this.UpdateGeng(dt);
    this.UpdateCart(dt);
    this.UpdateGaze(dt);
  }
  /** 06：nierSeen → NierShells；看枪口；玩家 8 m 内开枪她去捡弹壳；闲着时在沟沿上一颗一颗捡。 */
  UpdateOrders() {
    const r = this.r, T = this.T, nier = this.actors.nier;
    if (!nier?.alive) return;
    const player = r.player.position, dist = Distance(player, nier.position);
    if (!r.Has("nierSeen") && r.Has("ordersReached") && dist <= T.seenRangeM) {
      r.Record("nierSeen", { distM: +dist.toFixed(1) });
      r.Say("NierShells");
    }
    // 玩家开枪：枪口附近的弹壳她要（8 m 内）。
    const shots = r.Inventory?.()?.shots;
    if (Number.isFinite(shots)) {
      if (this.lastShots != null && shots > this.lastShots && dist <= T.shellRangeM && this.nierState !== "running")
        this.PickShellNear(ShellLandingPoint(player, r.player.yaw));
      this.lastShots = shots;
    }
    // 闲着：沟沿上一颗一颗捡（离起点 1.5 m 内的随机点）。
    if (this.nierState === "idle" && r.time >= this.nextIdlePickAt) {
      const a = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 1.1;
      this.PickShellNear({ x: T.nierRim.x + Math.sin(a) * d, z: T.nierRim.z + Math.cos(a) * d });
      this.nextIdlePickAt = r.time + 4 + Math.random() * 3;
    }
  }
  UpdateNier(dt) {
    const r = this.r, T = this.T, nier = this.actors.nier;
    if (!nier?.alive) return;
    const player = r.player.position, dist = Distance(player, nier.position);
    // 指向：面朝目标到期为止。
    if (this.pointing) {
      if (r.time >= this.pointing.until) { this.pointing = null; if (this.nierState === "pointing") this.nierState = "idle"; }
      else this.FaceNpc(nier, this.pointing.target, 0.5);
    }
    // 撒腿跑（优先级最高）。
    if (this.nierState === "running" && this.nierRoute) {
      while (this.nierRoute.length && Distance(nier.position, this.nierRoute[0]) < 0.9) this.nierRoute.shift();
      if (this.nierRoute.length) { r.ai.SetStance(nier, 0, 0.5, true); r.MoveActor(nier, this.nierRoute[0], T.runMps); }
      else { this.Stop(nier); this.nierRoute = null; this.nierState = "idle"; const cb = this.nierRouteDone; this.nierRouteDone = null; this.Log("arrived"); cb?.(); }
      return;
    }
    // 捡弹壳：走过去、蹲下 pickS 秒、口袋响一声。
    if (this.nierPick && !this.nierPick.done) {
      const pick = this.nierPick;
      if (Distance(nier.position, pick.target) > 0.7 && pick.arrivedAt == null) {
        r.ai.SetStance(nier, 0, 0.5, true); r.MoveActor(nier, pick.target, T.walkMps);
      } else {
        pick.arrivedAt ??= r.time;
        this.Stop(nier);
        r.ai.SetStance(nier, 1, T.pickS + 0.5, true);
        if (r.time - pick.arrivedAt >= T.pickS) {
          pick.done = true; this.shells++;
          r.audio?.Play?.("shellDrop", { position: r.Point(nier.position, 0.7), volume: 0.35, pitch: 1.2 });
          this.Log("shellPocketed", { shells: this.shells });
          this.nierPick = null;
          this.nierState = this.follow ? "following" : "idle";
          if (!this.follow) r.ai.SetStance(nier, 1, 2.5, true);
        }
      }
      // 蹲着捡时玩家到 6 m 内：头朝枪口。
      if (dist <= T.lookGunM) this.FaceNpc(nier, MuzzlePoint(player, r.player.yaw), 0.4);
      return;
    }
    // 跟队：队尾后 gapM，沟里走沟沿。
    if (this.nierState === "following" && this.follow) {
      const { route, gapM } = this.follow;
      const tail = r.column?.TailProgress?.() ?? 0;
      const progress = Math.max(0, tail - gapM);
      const at = MissionCarryRoutePoint(route, progress);
      const inTrench = progress >= T.trenchProgressM[0] && progress <= T.trenchProgressM[1];
      const target = RimSide(at, inTrench ? T.rimOffsetM : T.openOffsetM, (x, z) => r.battlefield.GroundHeight(x, z));
      if (Distance(nier.position, target) > 1.2) { r.ai.SetStance(nier, 0, 0.5, true); r.MoveActor(nier, target, T.walkMps); }
      else { this.Stop(nier); this.FaceNpc(nier, player, 0.4); }
      // 沟里：幺娃丢弹壳逗她（NierFollow），一次。
      if (!this.nierFollowSaid && r.flow?.stage?.id === "South" && r.companion?.Handle?.("yaowa")?.alive
        && MissionRouteProjection(route, player).progress >= T.followCueProgressM && dist <= T.followRangeM) {
        this.nierFollowSaid = true;
        r.Say("NierFollow");
      }
      return;
    }
    // 闲着：玩家 ≤ 6 m 只看枪口不看脸。
    if (dist <= T.lookGunM) this.FaceNpc(nier, MuzzlePoint(player, r.player.yaw), 0.4);
  }
  UpdateGeng() {
    const r = this.r, geng = this.actors.geng;
    if (!geng?.alive || !this.gengGoal) return;
    if (Distance(geng.position, this.gengGoal.point) <= 0.8) {
      this.Stop(geng);
      const cb = this.gengGoal.cb; this.gengGoal = null; this.Log("gengArrived"); cb?.();
    } else r.MoveActor(geng, this.gengGoal.point, this.T.walkMps);
  }
  /** 顺子抬头看沟沿上的妮儿：gazeS 秒内把视线往她那边轻轻带 gazeRad（玩家随时能转回来，不是接管）。 */
  UpdateGaze(dt) {
    const r = this.r, nier = this.actors.nier;
    if (!this.gaze) return;
    if (r.time >= this.gaze.until || r.controls || !nier?.alive) { this.gaze = null; return; }
    const eye = r.player.EyePosition ?? r.player.position, head = r.Point(nier.position, 1.3);
    const k = this.T.gazeRad * Math.max(0, dt) / this.T.gazeS;
    const wantYaw = PlayerYawTo(r.player.position, head);
    const gapYaw = WrapRad(wantYaw - r.player.yaw);
    r.player.yaw += Math.max(-k, Math.min(k, gapYaw));
    const wantPitch = Math.atan2(head.y - eye.y, Math.hypot(head.x - eye.x, head.z - eye.z));
    const gapPitch = wantPitch - (r.player.pitch || 0);
    r.player.pitch = (r.player.pitch || 0) + Math.max(-k, Math.min(k, gapPitch));
  }

  // --- 对白事件 -------------------------------------------------------------
  OnLine(cueId, index) {
    const r = this.r, nier = this.actors.nier;
    // 幺娃「嘿，还赖上了。」—— 顺手把一颗弹壳丢上沟沿，她去捡。
    if (cueId === "NierFollow" && index === 2 && nier?.alive && this.nierState === "following") {
      const yaowa = r.companion?.Handle?.("yaowa");
      const from = yaowa?.alive ? yaowa.position : r.player.position;
      const toward = { x: nier.position.x - from.x, z: nier.position.z - from.z }, len = Math.hypot(toward.x, toward.z) || 1;
      const land = { x: nier.position.x - toward.x / len * 1.6, z: nier.position.z - toward.z / len * 1.6 };
      r.audio?.Play?.("shellDrop", { position: r.Point(land, 0.1), volume: 0.4 });
      this.PickShellNear(land);
      this.Shout("tease");
    }
    // SouthWhisper 第 5→6 句：顺子抬头看沟沿上的她；她也正看着他，笑一声（又粗又响）。
    if (cueId === "SouthWhisper" && index === 5 && nier?.alive) {
      this.gaze = { until: r.time + this.T.gazeS, target: nier.position };
      this.FaceNpc(nier, r.player.position, 2);
      this.Shout("laugh");
      this.Log("gaze");
    }
  }
  /** 07 沟口机枪一响（Script_FirstLevelSouthMouth）：撒腿先跑进村北巷，不受伤。 */
  OnMouthContact() {
    const nier = this.actors.nier;
    if (!nier?.alive) return;
    const route = MISSION_ROUTES.southWalk, from = MissionRouteProjection(route, nier.position).progress;
    const points = route.filter((_, i) => i >= 4 && MissionRouteProjection(route, route[i]).progress > from + 2)
      .map((p) => ({ x: p.x, z: p.z }));
    points.pop();
    this.RunTo([...points, { ...this.T.villageRefuge }], () => this.Shout("refuge"));
  }
  VoicePosition(cue, line) {
    const r = this.r;
    if (cue?.id !== "NierShells") return null;
    if (line?.who === "peasant") return this.actors.peasant?.alive ? r.Point(this.actors.peasant.position, 1.5) : r.Point(this.T.peasantSpot, 1.5);
    // 担架员：集结处东侧那个搬运人员（MissionPeople 画的，没有身体）。
    const bearer = Place.collection.bearers.at(-1);
    return r.Point(bearer, 1.5);
  }

  // --- 驴车（黑子 + 车 + 白盒行李）--------------------------------------------
  SpawnCart(spot) {
    const r = this.r;
    const ground = r.battlefield.GroundHeight(spot.x, spot.z);
    this.cartState = { id: GENG_IDS.cart, x: spot.x, y: ground, z: spot.z, yaw: spot.yaw ?? 0, draft: "horse", overturned: false,
      travel: 0, moving: false, blocking: false, spooked: false, target: null, cb: null,
      animal: { x: spot.x, y: ground, z: spot.z, yaw: spot.yaw ?? 0 } };
    if (r.scene && !this.cartModels) this.cartModels = new DraftCartModels(r.scene);
    this.Log("cart", { x: +spot.x.toFixed(1), z: +spot.z.toFixed(1) });
    return this.cartState;
  }
  UpdateCart(dt) {
    const r = this.r, cart = this.cartState, T = this.T;
    if (!cart) return;
    if (cart.target) {
      const d = Distance(cart, cart.target);
      if (d <= 0.3) { cart.target = null; cart.moving = false; const cb = cart.cb; cart.cb = null; this.Log("cartArrived"); cb?.(); }
      else {
        const step = Math.min(d, T.cartMps * Math.max(0, dt));
        cart.yaw = Math.atan2(cart.x - cart.target.x, cart.z - cart.target.z);
        cart.x += (cart.target.x - cart.x) / d * step; cart.z += (cart.target.z - cart.z) / d * step;
        cart.travel += step; cart.moving = true;
      }
    } else cart.moving = false;
    cart.y = r.battlefield.GroundHeight(cart.x, cart.z);
    const c = Math.cos(cart.yaw), s = Math.sin(cart.yaw), offset = MID.draft.teamOffsetM;
    cart.animal.x = cart.x - s * offset; cart.animal.z = cart.z - c * offset; cart.animal.yaw = cart.yaw;
    cart.animal.y = r.battlefield.GroundHeight(cart.animal.x, cart.animal.z);
    if (!this.cartModels?.ready) return;
    this.cartModels.Sync(cart, cart.y, { x: cart.animal.x, z: cart.animal.z, ground: cart.animal.y, yaw: cart.yaw,
      visible: true, moving: cart.moving, travel: cart.travel }, null);
    if (!this.cartStyled) this.StyleCart();
  }
  /** 黑子缩 0.75 压暗毛色；车板上摆白盒被褥 / 铁锅 / 粮袋（占位）。 */
  StyleCart() {
    const instance = this.cartModels?.instances?.get(this.cartState.id);
    if (!instance) return;
    this.cartStyled = true;
    instance.animalRoot.scale.setScalar(this.T.heiziScale);
    const coat = instance.parts.draftBody;
    if (coat?.material) {
      coat.material = CloneShadedMaterial(coat.material);
      coat.material.color?.multiplyScalar?.(this.T.heiziCoat);
      coat.material.name = "HeiziCoat";
    }
    const load = new THREE.Group();
    load.name = "GengCartLoad";
    for (const [dx, dy, dz, w, h, d, color] of this.T.cartLoad) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: color === 0x2b2b2b ? 0.3 : 0 }));
      mesh.position.set(dx, this.T.cartDeckM - 1 + dy + h / 2, dz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      load.add(mesh);
    }
    instance.cartRoot.add(load);
    this.cartLoad = load;
  }

  // --- 收尾 -----------------------------------------------------------------
  /** 07 起行之后集结处那一带的收尾（庄稼人收走）。 */
  Leave() { this.RemoveCivilian("peasant"); }
  State() {
    const Pos = (actor) => actor?.alive ? { x: +actor.position.x.toFixed(2), z: +actor.position.z.toFixed(2), stance: actor.stance } : null;
    return {
      protected: this.protected,
      nier: { state: this.nierState, ...Pos(this.actors.nier), shells: this.shells, picking: !!this.nierPick && !this.nierPick.done,
        following: !!this.follow, running: !!this.nierRoute, pointing: !!this.pointing, model: this.actors.nier?.actor?.characterRig?.modelId ?? null,
        scale: this.actors.nier?.actor?.sizeScale ?? null, variant: this.actors.nier?.actor?.variant ?? null },
      geng: { ...Pos(this.actors.geng), pose: this.gengPose?.kind ?? null, walking: !!this.gengGoal },
      peasant: Pos(this.actors.peasant),
      heizi: this.cartState ? { x: +this.cartState.animal.x.toFixed(2), z: +this.cartState.animal.z.toFixed(2), scale: this.T.heiziScale, styled: this.cartStyled } : null,
      cart: this.cartState ? { x: +this.cartState.x.toFixed(2), z: +this.cartState.z.toFixed(2), yaw: +this.cartState.yaw.toFixed(2), moving: this.cartState.moving,
        blocking: this.cartState.blocking, travel: +this.cartState.travel.toFixed(1), drawn: !!this.cartModels?.instances?.get(this.cartState.id) } : null,
      nierFollowSaid: this.nierFollowSaid, gaze: !!this.gaze, events: this.events.slice(-24),
    };
  }
  Dispose() {
    for (const key of Object.keys(this.actors)) this.RemoveCivilian(key);
    this.cartLoad?.parent?.remove(this.cartLoad);
    this.cartLoad = null;
    this.cartModels?.Dispose();
    this.cartModels = null;
    this.cartState = null;
  }
}
