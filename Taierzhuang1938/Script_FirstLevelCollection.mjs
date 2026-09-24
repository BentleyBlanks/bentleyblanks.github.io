// ===========================================================================
// Script_FirstLevelCollection.mjs —— 背坡伤员集结处与 06 的借火戏（Front 玩法包）
//
// 需求原文：docs/Data_FirstLevelRebuildSource20260919.md 的 02 末段与 06。
// 接口冻结：docs/Data_FirstLevelRebuild20260919Contract.md §2 / §5。
//
//   · 02 途经集结处：玩家**第一次**看见已有担架、伤员和搬运人员
//     （摆位一律读 MISSION_PLACEMENT.collection，本模块不自己估坐标）。
//   · 06 回到同一处：传令兵下令后送；借火戏；担架员把老周抬上担架；后送队起行。
//
// 渲染口径：
//   · 担架（帆布 + 躺着的人）是常驻白盒体块，直接挂在场景上 —— 集结处一直在收伤员，
//     后送队开走之后它们不跟着走。
//   · 伤员与搬运人员走 `FirstLevelMissionView.Person` 那条实例化人群，
//     不占 AI 的 actorPool（那 40 个名额被守军、接防班与前沿防御排满了）。
//     它是立即模式，所以每帧要在 `view.Update` 之后补一次（runtime 的 Draw 钩子）。
// ===========================================================================
import * as THREE from "three";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_TUNING as F, BORROW_LIGHT_BEATS } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_ANCHORS as A, MISSION_ROUTES, MISSION_PLACEMENT as Place } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionRouteProjection, MissionCarryRoutePoint } from "./Script_FirstLevelMissionColumn.mjs";

/** 借火那一段的姿态顺序（State().borrow 按这个序列记，测试照它对账）。 */
export const BORROW_POSE_ORDER = Object.freeze(["ask", "pat", "pocket", "offer", "light", "share", "wince"]);

/**
 * 集结处摆的人：伤员（躺/坐）与搬运人员（半跪在担架旁）。
 * 纯函数，坐标全部来自 MISSION_PLACEMENT.collection —— 测试拿它对账摆位没漏。
 */
export function CollectionDressing(placement = Place.collection) {
  const people = [];
  for (const [i, spot] of placement.wounded.entries())
    people.push({ id: `CollectionWounded${i}`, kind: "wounded", x: spot.x, z: spot.z, yaw: spot.yaw ?? 0, crouch: true });
  for (const [i, spot] of placement.bearers.entries())
    people.push({ id: `CollectionBearer${i}`, kind: "bearer", x: spot.x, z: spot.z, yaw: spot.yaw ?? 0, crouch: i % 2 === 0 });
  return people;
}

/**
 * 「玩家现在够不够格开始借火」：走到老周跟前 borrowTriggerM 米以内、而且大致面向他。
 * 纯几何（不吃运行时），测试拿它对账触发口径。
 *
 * `yaw` 是**玩家**的朝向：Script_Player 的前向量是 (-sin yaw, -cos yaw)，
 * 所以「看着老周」那一档是 atan2(player.x − zhou.x, player.z − zhou.z)
 *（NPC 的 yaw 是反过来的另一套，别混用）。
 */
export function BorrowLightCued(player, zhou, yaw, tuning = F) {
  const distance = Math.hypot(zhou.x - player.x, zhou.z - player.z);
  if (distance > tuning.borrowTriggerM) return false;
  if (distance < 0.05) return true;
  const want = Math.atan2(player.x - zhou.x, player.z - zhou.z);
  const gap = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
  return Math.abs(gap) <= tuning.borrowFacingRad;
}

/** 给定收到的 Line 下标与已经到过的具名事件，返回这一刻应该摆出来的借火姿态。 */
export function BorrowPosesDue(lineIndex, events, beats = BORROW_LIGHT_BEATS) {
  const due = [];
  for (const beat of beats) {
    if (beat.event) { if (events?.has?.(beat.event)) due.push(beat.action); continue; }
    if (Number.isInteger(lineIndex) && lineIndex >= beat.line) due.push(beat.action);
  }
  return due;
}

export class FirstLevelCollection {
  constructor(runtime) {
    this.r = runtime;
    this.dressed = false;
    this.props = [];
    this.people = CollectionDressing();
    this.runner = null;
    this.borrowLine = null;
    this.borrowEvents = new Set();
    this.poses = new Set();
    this.shareAt = null;
    this.zhouParked = false;
    this.zhouLiftAt = null;
    this.zhouLiftFrom = null;
    this.zhouLiftComplete = false;
    // 抬老周那两个担架员：对白期间在 bearerWait 上等，ZhouLift 催的时候才走上来。
    this.liftBearers = Place.collection.bearerWait.map((spot, i) => ({
      // 沿用 column/view 里这副担架原有的两个人物身份；Orders 只是把同两个人
      // 从正式抬架位暂时摆到对白等待位，不能另造一对叠在他们身上。
      id: `${runtime.column.zhou.id}Bearer${i}`, x: spot.x, z: spot.z, yaw: spot.yaw ?? 0,
    }));
    this.bearerCloseAt = null;
    this.borrowSaid = false;
  }

  // --- 摆位 -----------------------------------------------------------------
  /** 担架：一块帆布板加一个躺着的人，常驻场景（02 路过时就已经在了）。 */
  Dress() {
    const r = this.r;
    if (this.dressed || !r.scene) return;
    this.dressed = true;
    const canvas = new THREE.MeshLambertMaterial({ color: 0xb6ae99 });
    const body = new THREE.MeshLambertMaterial({ color: 0xd0cec2 });
    for (const [i, spot] of Place.collection.litters.entries()) {
      const group = new THREE.Group();
      group.name = `MissionCollectionLitter${i}`;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.92), canvas);
      bed.position.y = 0.3;
      const patient = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.19, 1.55), body);
      patient.position.y = 0.43;
      group.add(bed, patient);
      group.position.set(spot.x, r.battlefield.GroundHeight(spot.x, spot.z), spot.z);
      group.rotation.y = spot.yaw ?? 0;
      for (const mesh of [bed, patient]) { mesh.castShadow = true; mesh.receiveShadow = true; }
      r.scene.add(group);
      this.props.push({ group, materials: [canvas, body], geometries: [bed.geometry, patient.geometry] });
    }
  }
  /** 立即模式的人群：每帧在 view.Update 之后补一次，不然 people.End() 会把他们藏起来。 */
  Draw(time) {
    const r = this.r;
    if (!this.dressed || !r.view?.Person) return;
    for (const person of this.people)
      r.view.Person(person.x, person.z, person.yaw, time,
        { id: person.id, kind: person.kind === "wounded" ? "medic" : "bearer", crouch: person.crouch });
    // 抬老周那两个：06 才出现（担架队在这儿等着接他），位置由 UpdateOrders 推。
    if (r.Has("ordersReached") && r.column.zhou.borrowBearersStaged)
      for (const bearer of this.liftBearers)
        r.view.Person(bearer.x, bearer.z, bearer.yaw, time,
          { id: bearer.id, kind: "bearer", moving: this.bearerCloseAt != null });
  }

  /**
   * 集结处那个喊话的人。02 是指路的撤回守军，06 是下令后送的传令兵 ——
   * 同一个人站在同一处（MISSION_PLACEMENT.collection.runner），只换台词。
   * `FirstLevelOpening.runner` 是运行时 `VoicePosition` 认的那个字段，接上它
   * SupportOrder 才会从他嘴里出来而不是贴在玩家脸上。
   */
  EnsureRunner() {
    const r = this.r;
    if (this.runner?.actor?.alive) return this.runner.actor;
    const spot = Place.collection.runner;
    const actor = r.ai.Spawn("nra", spot.x, spot.z,
      { weapon: "HanYang", scriptedNoncombatant: true, squadId: "MissionCollectionRunner" });
    if (!actor) return null;
    actor.missionId = "CollectionRunner";
    actor.scriptEssential = true;
    actor.yaw = spot.yaw ?? 0;
    r.MoveActor(actor, actor.position, 0);
    r.ai.SetStance(actor, 1, Infinity, true);
    this.runner = { actor, route: [spot], index: 1 };
    r.opening.runner = this.runner;
    return actor;
  }

  // --- 06 借火 ---------------------------------------------------------------
  OnLine(cueId, index) {
    if (cueId !== "BorrowLight") return;
    this.borrowLine = Math.max(this.borrowLine ?? -1, index);
  }
  OnEvent(id) {
    if (id === "BorrowLightMatchesPocketed" || id === "BorrowLightCigaretteOffered") this.borrowEvents.add(id);
  }
  Pose(action) {
    const r = this.r, zhou = r.column.zhou;
    if (this.poses.has(action)) return;
    this.poses.add(action);
    // 白盒里「姿态」只有朝向、高度与两件小道具：老周叼烟靠着土壁，顺子摸兜、划火。
    if (action === "ask") { zhou.yaw = Math.atan2(r.player.position.x - zhou.x, r.player.position.z - zhou.z); this.ShowSmoke(true); }
    if (action === "pat") r.audio?.Play?.("clothMove", { position: r.Point(zhou, 0.6), volume: 0.5 });
    if (action === "pocket") r.audio?.Play?.("gearRattle", { position: r.player.EyePosition.clone(), volume: 0.45 });
    if (action === "offer") r.audio?.Play?.("clothMove", { position: r.Point(zhou, 0.6), volume: 0.55 });
    if (action === "light") this.ShowMatch(true);
    if (action === "share") this.shareAt = r.time;
    if (action === "wince") r.audio?.Play?.("painGrunt", { position: r.Point(zhou, 0.6), volume: 0.5 });
  }
  /** 老周嘴上那根没点着的纸烟（一个小白盒）。 */
  ShowSmoke(on) {
    const r = this.r;
    if (on && !this.smoke && r.scene) {
      this.smoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.09),
        new THREE.MeshLambertMaterial({ color: 0xe4ddc8 }));
      this.smoke.name = "MissionZhouCigarette";
      r.scene.add(this.smoke);
    }
    if (this.smoke) this.smoke.visible = !!on;
  }
  /** 顺子手里那盒火柴（同样是一个小白盒，收进兜里就看不见了）。 */
  ShowMatch(on) {
    const r = this.r;
    if (on && !this.match && r.scene) {
      // 1930 年代常见小盒火柴约 3.5 × 1.2 × 5.5 cm。旧白盒 8 × 3 × 11 cm
      // 又钉在视线正中，近景会变成遮住老周脸胸的一整块黄板。
      this.match = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.055),
        new THREE.MeshLambertMaterial({ color: 0xc8a262 }));
      this.match.name = "MissionShunziMatchbox";
      r.scene.add(this.match);
    }
    if (this.match) this.match.visible = !!on;
  }

  /**
   * 借火那一段该不该开播。Notion 06：老周靠在土壁边摸兜找火，
   * 「**看见顺子经过**」才开口 —— 所以要玩家真的走到他跟前、脸朝着他。
   */
  UpdateBorrowCue() {
    const r = this.r;
    if (this.borrowSaid || !r.Has("volunteerHeard")) return;
    if (!BorrowLightCued(r.player.position, r.column.zhou, r.player.yaw)) return;
    this.borrowSaid = true;
    r.Say("BorrowLight");
  }
  /**
   * 抬老周那两个担架员：对白期间在 borrowClearRadiusM 外等着，不挤进两人中间；
   * 借火演完（lightShared，也就是担架员开口催的那一刻）才走上来。
   */
  UpdateLiftBearers(dt) {
    const r = this.r, zhou = r.column.zhou;
    const coming = r.Has("lightShared");
    if (coming) this.bearerCloseAt ??= r.time;
    const t = this.bearerCloseAt == null ? 0
      : Math.min(1, (r.time - this.bearerCloseAt) / F.bearerCloseMoveS);
    for (const [i, bearer] of this.liftBearers.entries()) {
      const from = Place.collection.bearerWait[i], to = Place.collection.bearerClose[i] || from;
      bearer.x = from.x + (to.x - from.x) * t;
      bearer.z = from.z + (to.z - from.z) * t;
      bearer.yaw = Math.atan2(bearer.x - zhou.x, bearer.z - zhou.z);
    }
    void dt;
  }

  /** 06 每帧：借火姿态推进、老周被抬上担架那一小段。 */
  UpdateOrders(dt) {
    const r = this.r, zhou = r.column.zhou;
    this.EnsureRunner();
    if (!this.zhouParked) {
      // 老周还没上担架：他靠在土壁边等（state "fallen" 不参与队列前进）。
      this.zhouParked = true;
      Object.assign(zhou, { ...Place.collection.zhouWall, state: "fallen", visible: true });
    }
    // View 平时会从 column.zhou 自动画出这一副担架自己的两名担架员；借火期间
    // 改由 Draw 用同一组 id 报告等待位，避免正式抬架位与等待位同时出现四个人。
    zhou.borrowBearersStaged = !r.Has("zhouOnLitter");
    // 贴着土壁、脸朝经过的玩家 —— 不许横在路当中（集成方 2026-09-20 的口径）。
    if (!r.Has("zhouOnLitter"))
      zhou.yaw = Math.atan2(r.player.position.x - zhou.x, r.player.position.z - zhou.z);
    this.UpdateBorrowCue();
    this.UpdateLiftBearers(dt);
    // 借火演完，担架员才开口催（ZhouLift 播完 → zhouOnLitter）。
    if (r.Has("lightShared")) r.Say("ZhouLift");
    for (const action of BorrowPosesDue(this.borrowLine, this.borrowEvents)) this.Pose(action);
    if (this.shareAt != null && r.time - this.shareAt >= F.borrowLightS + F.borrowWinceS) {
      this.Pose("wince");
      this.ShowMatch(false);
    }
    // 老周嘴上那根烟跟着担架走；火柴在顺子手里。
    if (this.smoke?.visible)
      this.smoke.position.set(zhou.x, r.battlefield.GroundHeight(zhou.x, zhou.z) + 0.72, zhou.z);
    if (this.match?.visible) {
      // 跟随俯仰放在右手侧、视线下方：递火时仍读得到，但不会盖住对面人物。
      const eye = r.player.EyePosition, yaw = r.player.yaw, pitch = r.player.pitch || 0;
      const forwardM = 0.62, sideM = 0.18, downM = 0.18, pitchCos = Math.cos(pitch);
      this.match.position.set(
        eye.x - Math.sin(yaw) * pitchCos * forwardM + Math.cos(yaw) * sideM,
        eye.y + Math.sin(pitch) * forwardM - downM,
        eye.z - Math.cos(yaw) * pitchCos * forwardM - Math.sin(yaw) * sideM,
      );
      this.match.rotation.y = yaw;
    }
    // 担架员来催（ZhouLift 播完 → zhouOnLitter）之后，老周从土壁挪回队列。
    if (r.Has("zhouOnLitter")) {
      zhou.borrowBearersStaged = false;
      if (this.zhouLiftAt == null) {
        this.zhouLiftAt = r.time;
        this.zhouLiftFrom = { x: zhou.x, z: zhou.z };
        zhou.progress = MissionRouteProjection(r.column.route, Place.collection.zhouWall).progress;
      }
      const t = Math.min(1, (r.time - this.zhouLiftAt) / F.zhouLiftMoveS);
      const target = MissionCarryRoutePoint(r.column.route, zhou.progress);
      zhou.x = this.zhouLiftFrom.x + (target.x - this.zhouLiftFrom.x) * t;
      zhou.z = this.zhouLiftFrom.z + (target.z - this.zhouLiftFrom.z) * t;
      zhou.yaw = target.yaw ?? zhou.yaw;
      if (t >= 1 && zhou.state === "fallen") {
        zhou.state = "waiting";
        this.zhouLiftComplete = true;
        this.ShowSmoke(false);
      }
    }
    void dt;
  }

  /** The lift actually placed Zhou on the column route; the voice fact alone cannot leave 06. */
  ZhouLiftComplete() { return this.zhouLiftComplete; }

  /** 07 起行之后集结处那一带的收尾：小道具收掉，摆位留着。 */
  Leave() {
    if (this.r.column?.zhou) this.r.column.zhou.borrowBearersStaged = false;
    this.ShowMatch(false);
    this.ShowSmoke(false);
  }

  VoicePosition(cue) {
    const r = this.r;
    if (["SupportOrder", "Volunteer"].includes(cue.id) && this.runner?.actor?.alive)
      return r.Point(this.runner.actor.position, 1.3);
    if (["BorrowLight", "ZhouLift"].includes(cue.id)) return r.Point(r.column.zhou, 0.9);
    return null;
  }

  State() {
    return {
      dressed: this.dressed,
      people: this.people.length,
      litters: this.props.length,
      runner: this.runner?.actor?.alive ? { x: this.runner.actor.position.x, z: this.runner.actor.position.z } : null,
      borrow: BORROW_POSE_ORDER.filter((action) => this.poses.has(action)),
      borrowSaid: this.borrowSaid,
      liftBearers: this.liftBearers.map((bearer) => ({ id: bearer.id, x: +bearer.x.toFixed(2), z: +bearer.z.toFixed(2) })),
      zhouParked: this.zhouParked,
      zhouLifted: this.zhouLiftAt != null,
      zhouLiftComplete: this.ZhouLiftComplete(),
    };
  }
  Dispose() {
    for (const prop of this.props) {
      prop.group.parent?.remove(prop.group);
      for (const geometry of prop.geometries) geometry.dispose();
    }
    if (this.props.length) for (const material of this.props[0].materials) material.dispose();
    this.props = [];
    for (const mesh of [this.smoke, this.match]) {
      if (!mesh) continue;
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.smoke = this.match = null;
  }
}

/** 06 的后送队起行：担架队真的走出集结处（`columnDeparted` 的判据仍在运行时）。 */
export function CollectionDepartureRoute() {
  return MISSION_ROUTES.southWalk;
}
/** 集结处锚点（工作台与测试用同一口径）。 */
export const COLLECTION_ANCHOR = Object.freeze({ ...A.collection });
void R;
