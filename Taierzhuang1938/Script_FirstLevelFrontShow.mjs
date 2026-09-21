// ===========================================================================
// Script_FirstLevelFrontShow.mjs —— 公开阶段 1–7 的演出总线（Front 玩法包）
//
// 需求原文：docs/Data_FirstLevelRebuildSource20260919.md 的 01–07。
// 接口冻结：docs/Data_FirstLevelRebuild20260919Contract.md §2 / §5。
// 编排说明：docs/Data_FirstLevelFront20260919.md
//
// 运行时只留四个薄钩子（构造、Enter、Update、Draw）加两条事件转发，
// 这一段的所有演出逻辑都在这里与它拥有的两个子模块里：
//   · FirstLevelBunkerShow      01 门外行刑 / 02 掀木架
//   · FirstLevelCollection      背坡伤员集结处 / 06 借火 / 老周上担架
//
// 本模块里没有一条「到点就记事实」的计时器：计时器只在对白事件迟到时兜底，
// 通过条件仍然由真实发生的事（人走到、车停住、守军撤回）记。
// ===========================================================================
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_TUNING as F } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_ANCHORS as A, MISSION_ROUTES, MISSION_PLACEMENT as Place } from "./Data_FirstLevelMissionLayout.mjs";
import { MissionRouteProjection, MissionCarryRoutePoint } from "./Script_FirstLevelMissionColumn.mjs";
import { FirstLevelBunkerShow } from "./Script_OpeningStoryboards.mjs";
import { OPENING_STORYBOARDS } from "./Data_OpeningStoryboards.mjs";
import { FirstLevelCollection } from "./Script_FirstLevelCollection.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** 本包接上触发点的四条 cue（`Script_FirstLevelVoiceTest` 的未触发名单里删掉的那四条）。 */
export const FRONT_WIRED_CUES = Object.freeze(["RescueOut", "TrenchCurse", "BundleProne", "BundleReturnCall"]);

/** 07 路边指路的人站哪儿：村口以北 southPointerBackM 米、偏出路面 southPointerSideM 米。 */
export function SouthPointerSpot(route = MISSION_ROUTES.southWalk, anchor = A.village) {
  const at = MissionRouteProjection(route, anchor);
  const back = MissionCarryRoutePoint(route, Math.max(0, at.progress - F.southPointerBackM));
  const yaw = back.yaw ?? 0;
  return { x: back.x + Math.cos(yaw) * F.southPointerSideM, z: back.z - Math.sin(yaw) * F.southPointerSideM, yaw: yaw + Math.PI };
}

export class FirstLevelFrontShow {
  constructor(runtime) {
    this.r = runtime;
    this.bunker = new FirstLevelBunkerShow(runtime);
    this.collection = new FirstLevelCollection(runtime);
    this.pointer = SouthPointerSpot();
    this.stageAt = 0;
    this.peekSince = null;
    this.trenchAt = null;
    this.rescueOutAt = null;
    this.bundleTakenTankZ = null;
    this.bundleTakenAt = null;
    this.tankStoppedAt = null;
    this.southAt = null;
    this.whisperDone = false;
    this.bundleOrderGuard = null;
    this.fovDeg = null;
  }

  /**
   * 受困段把视野收窄（Notion 01「只能小幅转头」——「卡着只能盯着看」）。
   * Script_Main 每帧拿基准 FOV 来问一次，平滑归这里：`trapped` 接管期间追向
   * min(基准, trappedFovDeg)，还权之后平滑还原。玩家把 FOV 调得比它还窄的不动。
   */
  NarrowFovDeg(baseFov, dt) {
    const trapped = this.r.controls?.kind === "trapped";
    const want = trapped ? OPENING_STORYBOARDS.fov : baseFov;
    if (this.fovDeg == null) this.fovDeg = want;
    const step = Math.min(1, Math.max(0, dt) * F.trappedFovLerpRate);
    this.fovDeg += (want - this.fovDeg) * step;
    if (Math.abs(this.fovDeg - want) < 0.01) this.fovDeg = want;
    return this.fovDeg;
  }

  // --- 步骤进入 -------------------------------------------------------------
  Enter(stageId) {
    const r = this.r;
    this.bunker.Enter(stageId);
    this.stageAt = r.time;
    // 02 途经背坡集结处：摆位在玩家第一次路过之前就得在那儿。
    if (stageId === F.collectionDressStep) { this.collection.Dress(); this.trenchAt = r.time; }
    if (stageId === "Support" || stageId === "MachineGun" || stageId === "Tank") this.collection.Dress();
    if (stageId === "Orders") this.collection.Dress();
    if (stageId === "South") { this.southAt = r.time; this.collection.Leave(); }
  }

  // --- 对白事件 -------------------------------------------------------------
  OnLine(cueId, detail) {
    this.bunker.OnLine(cueId, detail?.index);
    this.collection.OnLine(cueId, detail?.index);
  }
  OnEvent(id) { this.collection.OnEvent(id); }
  OnVoiceDone(cueId) { this.bunker.OnVoiceDone(cueId); }
  VoicePosition(cue, line) {
    const r = this.r;
    if (cue.id === "VillagePointer") return r.Point(this.pointer, 1.5);
    if (cue.id === "BundleOrder" && this.bundleOrderGuard?.alive) return r.Point(this.bundleOrderGuard.position, 1.3);
    return this.bunker.VoicePosition(cue, line) || this.collection.VoicePosition(cue, line);
  }

  // --- 每帧 -----------------------------------------------------------------
  /** 在 `UpdateSquad` 之后调：这里下的走位命令要压过接触反应与行军层。 */
  Update(dt) {
    const stage = this.r.flow.stage.id;
    this.bunker.Update(dt);
    if (stage === "RearTrench") this.UpdateRearTrench();
    if (stage === "MachineGun") this.UpdateMachineGun();
    if (stage === "Tank") this.UpdateTank();
    if (stage === "Orders") this.collection.UpdateOrders(dt);
    if (stage === "South") this.UpdateSouth();
  }
  /** 立即模式的人群在 `view.Update` 之后补一次（见 FirstLevelCollection.Draw）。 */
  Draw(time) {
    this.collection.Draw(time);
    const r = this.r;
    if (this.southAt != null && r.view?.Person)
      r.view.Person(this.pointer.x, this.pointer.z, this.pointer.yaw, time, { id: "SouthRoadPointer", kind: "bearer" });
  }

  // --- 02 后交通壕 -----------------------------------------------------------
  UpdateRearTrench() {
    const r = this.r;
    this.trenchAt ??= r.time;
    if (!r.Has("rearTrenchEntered") || r.voice?.played?.has?.("TrenchCurse")) return;
    // 探头挨骂：人在沟里站直够久，何有田就骂回来。一直趴着走的也补一次。
    const standing = r.player.stance === "stand";
    if (standing) this.peekSince ??= r.time; else this.peekSince = null;
    const peeked = this.peekSince != null && r.time - this.peekSince >= F.trenchPeekS;
    if (peeked || r.time - this.trenchAt >= F.trenchCurseFallbackS) r.Say("TrenchCurse");
  }

  // --- 04 接替火力 -----------------------------------------------------------
  UpdateMachineGun() {
    const r = this.r;
    if (!r.Has("frontAttackRepelled")) return;
    // 指出北头弹药屋的那个守军：还活着的撤退守军里离玩家最近的一个，朝弹药屋指。
    if (!this.bundleOrderGuard?.alive)
      this.bundleOrderGuard = r.guards.map((guard) => guard.actor)
        .filter((actor) => actor?.alive)
        .sort((a, b) => Distance(a.position, r.player.position) - Distance(b.position, r.player.position))[0] || null;
    if (this.bundleOrderGuard?.alive) {
      this.bundleOrderGuard.watchYaw = Math.atan2(this.bundleOrderGuard.position.x - A.bundle.x,
        this.bundleOrderGuard.position.z - A.bundle.z);
      this.bundleOrderGuard.watchUntil = r.ai.time + F.bundleOrderPointS;
    }
    if (!r.Has("bundleOrderHeard")) return;
    // 「何有田接枪！文财看沟口！」—— 两个人真的换位置。
    this.PostHandover();
  }
  /** 何有田守机枪位、刘文财看前沿交通壕口（04 命令下达之后，一路保持到 05 结束）。 */
  PostHandover() {
    const r = this.r;
    const he = r.companion.Handle("heyoutian"), wen = r.companion.Handle("liuwencai");
    if (he?.alive && !he.missionSortie) {
      r.Defend(he, A.gun, R.contactRadiusM, R.companionCoverSlackM);
      if (Distance(he.position, A.gun) > R.contactRadiusM) r.MoveActor(he, A.gun, R.squadSpeedMps);
    }
    if (wen?.alive && !wen.missionSortie) {
      r.Defend(wen, F.trenchMouthWatch, R.contactRadiusM, R.companionCoverSlackM);
      if (Distance(wen.position, F.trenchMouthWatch) > R.contactRadiusM)
        r.MoveActor(wen, F.trenchMouthWatch, R.squadSpeedMps);
    }
  }

  // --- 05 取弹炸车 -----------------------------------------------------------
  UpdateTank() {
    const r = this.r, tank = r.tank;
    this.PostHandover();
    // 「趴下！它转过来了！」：战车真的在往玩家这边转炮塔。
    if (!r.Has("bundleTaken") && tank.present && !tank.immobilized) {
      const toPlayer = Math.atan2(tank.x - r.player.position.x, tank.z - r.player.position.z);
      const gap = Math.abs(Math.atan2(Math.sin(toPlayer - tank.turretYaw), Math.cos(toPlayer - tank.turretYaw)));
      if (Distance(tank, r.player.position) <= F.bundleProneRangeM && gap <= F.bundleProneArcRad) r.Say("BundleProne");
    }
    // 返程：「班长！它往沟口挤了！」—— 战车比取弹那一刻又往南压了一段。
    if (r.Has("bundleTaken")) {
      if (this.bundleTakenTankZ == null) { this.bundleTakenTankZ = tank.z; this.bundleTakenAt = r.time; }
      if (!tank.immobilized &&
        (tank.z - this.bundleTakenTankZ >= F.bundleReturnTankGainM || r.time - this.bundleTakenAt >= F.bundleReturnFallbackS))
        r.Say("BundleReturnCall");
    }
    // 「停了！」—— 履带真的断了之后。
    if (r.Has("tankImmobilized")) {
      this.tankStoppedAt ??= r.time;
      if (r.time - this.tankStoppedAt >= F.tankStoppedAfterS) r.Say("TankStopped");
    }
  }

  // --- 07 沿沟南行 -----------------------------------------------------------
  UpdateSouth() {
    const r = this.r;
    this.southAt ??= r.time;
    if (this.whisperDone) return;
    const yaowa = r.companion.Handle("yaowa");
    const near = yaowa?.alive && Distance(yaowa.position, r.player.position) <= F.southWhisperRangeM;
    if (yaowa?.alive && !near) {
      // 幺娃短暂靠近顺子：贴着他侧后方并排走一段（班长不参加，他在前头带路）。
      const yaw = r.player.yaw;
      r.MoveActor(yaowa, {
        x: r.player.position.x + Math.cos(yaw) * F.southWhisperSideM,
        z: r.player.position.z - Math.sin(yaw) * F.southWhisperSideM,
      }, R.squadCatchupMps);
    }
    if (near || r.time - this.southAt >= F.southWhisperFallbackS) {
      this.whisperDone = true;
      r.Say("SouthWhisper");
    }
  }

  State() {
    return {
      bunker: this.bunker.State(),
      collection: this.collection.State(),
      pointer: { ...this.pointer },
      rescueOutAt: this.rescueOutAt,
      whisperDone: this.whisperDone,
      southAt: this.southAt,
      tankStoppedAt: this.tankStoppedAt,
      fovDeg: this.fovDeg == null ? null : +this.fovDeg.toFixed(2),
      bundleOrderGuard: this.bundleOrderGuard?.missionId ?? this.bundleOrderGuard?.id ?? null,
    };
  }
  Dispose() {
    this.bunker.Dispose();
    this.collection.Dispose();
  }
}
void Place;
