// ===========================================================================
// Script_FirstLevelBunker.mjs —— 01 受困与 02 获救的门外演出（Front 玩法包）
//
// 需求原文：docs/Data_FirstLevelRebuildSource20260919.md 的 01 / 02。
// 接口冻结：docs/Data_FirstLevelRebuild20260919Contract.md §2 / §5。
//
// 这个模块只管「门外那一拍怎么演」：
//   · 日军边推进边清理入口 → 枪托砸倒扶人川军 → 腿伤者本能后缩 →
//     挺刺刀 → 抓枪身 → 被踹开 → 刺杀 → 侧面补刺（动作短、粗暴、连续）
//   · 踢开尸体旁的步枪、枪口转向门内 → BunkerSearch → ShunziCurse →
//     木架轻响 → 日兵真的走向门内（doorSearchStarted）
//   · 后侧同伴清理坍塌物的声音
//   · 02 掀木架那一拍里幺娃拉背包、何有田从后侧交通壕开火逼日兵转身
//
// 每一拍由 `BunkerKilling` 的逐句 `Line` 事件驱动（契约 §8），没有音频时按
// FRONT_TUNING.bunkerKillFallbackS 兜底 —— 编排不靠计时器，计时器只兜底。
// 血腥不做特写：只推位置、姿态与一次 TakeHit，创口由门框与身体遮挡。
// ===========================================================================
import * as THREE from "three";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";
import { FRONT_TUNING as F, BUNKER_KILL_BEATS } from "./Data_Tuning_FirstLevelFront.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as Place } from "./Data_FirstLevelMissionLayout.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** 行刑那一拍的动作顺序（`State().beats` 按这个序列记，测试照它对账）。 */
export const BUNKER_BEAT_ORDER = Object.freeze(["butt", "recoil", "rise", "stab", "flank", "kick", "creak"]);

/**
 * 给定「已经收到的 Line 下标」与「距 killAt 的秒数」，返回这一刻应该已经演完的动作。
 * 纯函数：`Line` 事件优先，迟到就按兜底偏移补上。运行时与测试共用同一口径。
 */
export function BunkerBeatsDue(lineIndex, elapsed, beats = BUNKER_KILL_BEATS) {
  const due = [];
  for (const beat of beats)
    if ((Number.isInteger(lineIndex) && lineIndex >= beat.line) || elapsed >= beat.at) due.push(beat.action);
  return due;
}

/** 两名搜索兵都实际走到门口（阵亡者不再构成搜索阻塞）才允许记录 doorSearchStarted。 */
export function BunkerDoorSearchReady(actors, targets, arriveM) {
  return actors.every((actor, slot) => !!actor && (!actor.alive || Distance(actor.position, targets[slot]) <= arriveM));
}

export class FirstLevelBunkerShow {
  constructor(runtime) {
    this.r = runtime;
    this.captives = [];
    this.rifleProps = [];
    this.beats = new Set();
    this.killRequested = false;
    this.killAt = null;
    this.killLine = null;
    this.stabAt = null;
    this.kickAt = null;
    this.creakAt = null;
    this.approachStarted = false;
    this.postKillHold = null;
    this.digAt = null;
    this.nextDigAt = 0;
  }

  // --- 01 门外的两名川军 ----------------------------------------------------
  /** 门外那两名失去抵抗能力的川军（无武器、不还手），以及落在几米外的两支步枪。 */
  Begin() {
    const r = this.r;
    if (this.captives.length) return;
    for (const spot of Place.bunker.captives) {
      const actor = r.ai.Spawn("nra", spot.x, spot.z,
        { weapon: "HanYang", scriptedNoncombatant: true, squadId: "MissionBunkerCaptives" });
      if (!actor) continue;
      actor.missionId = spot.id === "captiveWounded" ? "BunkerCaptiveWounded" : "BunkerCaptiveHelper";
      actor.unarmed = true;
      actor.health = R.bunkerCaptiveHealth;
      actor.yaw = spot.yaw ?? 0;
      r.MoveActor(actor, actor.position, 0);
      // 腿断的那个躺着，扶人的那个半跪。
      r.ai.SetStance(actor, spot.id === "captiveWounded" ? 2 : 1, Infinity, true);
      this.captives.push(actor);
    }
    this.MakeRifleProps();
  }
  /** 缴下来的两支步枪：白盒细长盒子，躺在 MISSION_PLACEMENT.bunker.captiveRifles。 */
  MakeRifleProps() {
    const r = this.r;
    if (this.rifleProps.length || !r.scene) return;
    for (const [i, spot] of Place.bunker.captiveRifles.entries()) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.24, 0.07, 0.09),
        new THREE.MeshLambertMaterial({ color: 0x5b4a33 }),
      );
      mesh.name = `MissionBunkerCaptiveRifle${i}`;
      mesh.castShadow = true;
      mesh.rotation.y = i ? 0.8 : -0.5;
      mesh.position.set(spot.x, r.battlefield.GroundHeight(spot.x, spot.z) + 0.05, spot.z);
      r.scene.add(mesh);
      this.rifleProps.push(mesh);
    }
  }
  /** 检查点重试落在 01：整拍重来（Opening.ResetBunker 调）。 */
  Reset() {
    for (const actor of this.captives) if (actor?.alive) actor.health = R.bunkerCaptiveHealth;
    for (const [i, mesh] of this.rifleProps.entries()) {
      const spot = Place.bunker.captiveRifles[i];
      if (spot) mesh.position.x = spot.x, mesh.position.z = spot.z;
    }
    this.beats.clear();
    this.killRequested = false;
    this.killAt = this.killLine = this.stabAt = this.kickAt = this.creakAt = this.digAt = null;
    this.approachStarted = false;
    this.postKillHold = null;
    this.nextDigAt = 0;
  }
  Executioner(slot) {
    return this.r.enemies.get(slot ? "BunkerExecutionerB" : "BunkerExecutionerA");
  }
  /** 扶人的那个（日兵甲下手）与腿伤的那个（日兵乙侧面补刺）。 */
  get Helper() { return this.captives.find((actor) => actor.missionId === "BunkerCaptiveHelper"); }
  get Wounded() { return this.captives.find((actor) => actor.missionId === "BunkerCaptiveWounded"); }

  /** 近爆黑视期间先让两名行刑兵走到人跟前；第一拍不能隔着六米把人“远程砸倒”。 */
  ApproachExecutioners() {
    if (this.approachStarted) return;
    this.approachStarted = true;
    for (const [slot, killer] of [[1, this.Executioner(0)], [0, this.Executioner(1)]]) {
      if (!killer?.alive) continue;
      killer.missionDormant = false;
      killer.scriptedNoncombatant = true;
      killer.bayonetFixed = true;
      this.r.MoveActor(killer, Place.bunker.ijaKill[slot] || A.bunkerKilling, R.walkSpeedMps);
    }
  }

  /** 木架响后持续把两名搜索兵送向各自门口；剧情非战斗态避免接触反应改写目标。 */
  DriveDoorSearch() {
    const r = this.r;
    for (const [slot, actor] of [this.Executioner(0), this.Executioner(1)].entries()) {
      if (!actor?.alive) continue;
      const target = Place.bunker.ijaDoor[slot] || A.bunkerDoor;
      actor.missionDormant = false;
      // 到门前仍由剧情走位接管；提前放回战斗 AI 会让接触反应把人推去西侧。
      actor.scriptedNoncombatant = true;
      actor.watchYaw = Math.atan2(actor.position.x - target.x, actor.position.z - target.z);
      actor.watchUntil = r.ai.time + 0.25;
      actor.yaw = actor.watchYaw;
      r.MoveActor(actor, target, R.walkSpeedMps);
    }
  }

  /** 补刺后让两人自然退到尸体胶囊之外，等木架声；否则接触分离会把他们一路推出破口画面。 */
  HoldAfterKill() {
    if (!this.postKillHold) return;
    for (const [slot, actor] of [this.Executioner(0), this.Executioner(1)].entries()) {
      if (!actor?.alive) continue;
      actor.missionDormant = false;
      actor.scriptedNoncombatant = true;
      this.r.MoveActor(actor, this.postKillHold[slot], R.walkSpeedMps);
    }
  }

  /** 沿 from→to 方向把人推开 metres 米（被砸倒、往后缩、被踹开都走这一条）。 */
  Shove(actor, from, metres) {
    if (!actor?.alive) return;
    const dx = actor.position.x - from.x, dz = actor.position.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const point = { x: actor.position.x + (dx / d) * metres, z: actor.position.z + (dz / d) * metres };
    this.r.PlaceActor(actor, point);
    actor.yaw = Math.atan2(from.x - point.x, from.z - point.z);
  }

  Beat(action) {
    const r = this.r;
    if (this.beats.has(action)) return;
    this.beats.add(action);
    const killerA = this.Executioner(0), killerB = this.Executioner(1);
    const helper = this.Helper, wounded = this.Wounded;
    // 下刀的两个站位取 MISSION_PLACEMENT.bunker.ijaKill：[1] 在扶人川军北侧，
    // [0] 在腿伤者北侧，都不挡玩家从破口看过去的那条线。
    if (action === "butt") {
      // 行刑那一段两个人只演不打（编排表：bunkerAssault 整段装睡，doorSearchStarted 才醒）。
      // 放开 scriptedNoncombatant 的话通用 AI 会抢在补刺那一拍之前把腿伤者打死，
      // 「另一名日兵从侧面补刺」就整拍消失。
      this.ApproachExecutioners();
      for (const [slot, killer] of [[1, killerA], [0, killerB]]) {
        if (!killer?.alive) continue;
        killer.missionDormant = false;
        killer.bayonetFixed = true;
        r.MoveActor(killer, Place.bunker.ijaKill[slot] || A.bunkerKilling, R.walkSpeedMps);
      }
      // 枪托猛砸：扶人川军被打倒（没死，只是趴下去了）。
      if (helper?.alive) {
        helper.TakeHit?.(Math.round(R.bunkerCaptiveHealth * 0.4), "torso", null, { melee: true });
        r.ai.SetStance(helper, 2, Infinity, true);
        if (killerA) this.Shove(helper, killerA.position, F.bunkerRecoilM);
      }
      r.audio?.Play?.("bodyLand", { position: r.Point(A.bunkerKilling, 0.3), volume: 0.8 });
      return;
    }
    if (action === "recoil") {
      // 腿伤士兵本能往后缩（离日兵远一点，仍躺着）。
      if (wounded?.alive && killerB) this.Shove(wounded, killerB.position, F.bunkerRecoilM);
      return;
    }
    if (action === "rise") {
      // 扶人川军挣扎着要起身。
      if (helper?.alive) r.ai.SetStance(helper, 1, Infinity, true);
      return;
    }
    if (action === "stab") {
      this.stabAt = r.time;
      // 第二名日兵趁第一刀落下时绕到腿伤者侧面；1.4 秒后补刺时他已经站到位。
      if (killerB?.alive && wounded)
        r.MoveActor(killerB, { x: wounded.position.x + F.bunkerFlankOffsetM, z: wounded.position.z }, R.walkSpeedMps);
      // 挺刺刀逼上去 → 伸手去抓枪身 → 被踹开 → 遭刺杀。
      if (helper?.alive && killerA) {
        const to = killerA.position;
        const dx = to.x - helper.position.x, dz = to.z - helper.position.z, d = Math.hypot(dx, dz) || 1;
        r.PlaceActor(helper, { x: helper.position.x + (dx / d) * F.bunkerGrabM, z: helper.position.z + (dz / d) * F.bunkerGrabM });
        this.Shove(helper, to, F.bunkerKickBackM);
        helper.TakeHit?.(200, "torso", null, { melee: true });
      }
      r.audio?.Play?.("bayonetHit", { position: r.Point(A.bunkerKilling, 0.7), volume: 0.9 });
      return;
    }
    if (action === "flank") {
      // 另一名日兵从侧面补刺（绕到腿伤者旁边，不站在玩家与创口之间）。
      if (killerB?.alive && wounded)
        r.MoveActor(killerB, { x: wounded.position.x + F.bunkerFlankOffsetM, z: wounded.position.z }, R.walkSpeedMps);
      if (wounded?.alive) wounded.TakeHit?.(200, "torso", null, { melee: true });
      // A 从扶人伤兵的倒地胶囊旁退回右侧下刀位；B 留在腿伤者东侧 1.1 m。
      // 两个点彼此约 2.4 m，且都在破口射影内，后续只靠普通 MoveActor 到位。
      this.postKillHold = [
        Place.bunker.ijaKill[1] || A.bunkerKilling,
        wounded ? { x: wounded.position.x + F.bunkerFlankOffsetM, z: wounded.position.z } : Place.bunker.ijaKill[0],
      ];
      r.audio?.Play?.("bayonetHit", { position: r.Point(A.bunkerKilling, 0.4), volume: 0.9 });
      return;
    }
    if (action === "kick") {
      // 一名日兵用靴子踢开尸体旁的步枪；另一人已经把枪口转向门内。
      const mesh = this.rifleProps[0];
      if (mesh) {
        // 往门口这边踢（+x 偏东、+z 朝门）：往西南踢会把它滑到门垛的射影里，
        // 玩家从破口看过去这一拍就没了。
        mesh.position.x += F.bunkerRifleSlideM * 0.4;
        mesh.position.z += F.bunkerRifleSlideM * 0.8;
        r.audio?.Play?.("impactWood", { position: mesh.position.clone(), volume: 0.7 });
      }
      if (killerB?.alive) {
        killerB.watchYaw = Math.atan2(killerB.position.x - A.bunkerDoor.x, killerB.position.z - A.bunkerDoor.z);
        killerB.watchUntil = r.ai.time + 6;
      }
      this.kickAt = r.time;
      this.digAt = r.time;
      r.Say("BunkerSearch");
      return;
    }
    if (action === "creak") {
      // 木架轻响 → 日兵真的转向门内走。
      r.audio?.Play?.("impactWood", { position: r.Point(Place.bunker.player, 0.35), volume: 0.5 });
      this.DriveDoorSearch();
      return;
    }
  }

  /** 逐句事件：`BunkerKilling` 驱动行刑，`ShunziCurse` 末句之后是木架轻响。 */
  OnLine(cueId, index) {
    if (cueId !== "BunkerKilling") return;
    this.killAt ??= this.r.time;
    this.killLine = Math.max(this.killLine ?? -1, index);
  }
  OnVoiceDone(cueId) {
    const r = this.r;
    if (cueId === "BunkerSearch") { r.Say("ShunziCurse"); return; }
    if (cueId === "ShunziCurse") this.creakAt ??= r.time;
  }

  /** 受困段每帧（FirstLevelOpening.UpdateBunker 在近爆之后调）。 */
  UpdateBunker(bunker) {
    const r = this.r;
    if (!bunker || bunker.blastAt == null) return;
    const since = r.time - bunker.blastAt;
    this.ApproachExecutioners();
    if (since >= R.bunkerKillingAtS && !this.beats.has("flank")) {
      // Say 只负责入队。前一条对白若仍在播，不能拿「已经请求」冒充「已经开口」
      // 去跑 0/2.1/4.2/6.3 秒动作；真正的起点由 OnLine(BunkerKilling, 0) 写。
      if (!this.killRequested) { this.killRequested = true; r.Say("BunkerKilling"); }
      if (this.killAt != null) {
        const elapsed = r.time - this.killAt;
        for (const action of BunkerBeatsDue(this.killLine, elapsed)) this.Beat(action);
      }
      // 侧面补刺紧跟着头一刀（两刀之间 bunkerCaptiveStabGapS）。
      if (this.stabAt != null && r.time - this.stabAt >= R.bunkerCaptiveStabGapS) this.Beat("flank");
    }
    // 「两名已经失去有效抵抗能力的伤兵仍被迅速杀害」：两刀都下了才算这一拍演完。
    if (this.beats.has("flank") && this.captives.length && this.captives.every((actor) => !actor.alive))
      r.Record("captivesKilled", { count: this.captives.length });
    if (r.Has("captivesKilled") && this.stabAt != null && r.time - this.stabAt >= F.bunkerRifleKickAtS)
      this.Beat("kick");
    // 只有三条后续对白都没有处于可推进的 current/queue 时才走整段兜底。真实录音和
    // 缺录音估时字幕都必须先把 ShunziCurse 播完，不能在他说到一半提前响木架。
    const bunkerVoiceIds = ["BunkerKilling", "BunkerSearch", "ShunziCurse"];
    const bunkerVoiceActive = bunkerVoiceIds.includes(r.voice.current?.cue?.id)
      || r.voice.queue?.some?.((id) => bunkerVoiceIds.includes(id));
    if (this.killAt != null && r.time - this.killAt >= F.bunkerShowFallbackS
      && !r.Has("doorSearchStarted") && !bunkerVoiceActive) {
      this.Beat("flank");
      r.Record("captivesKilled", { count: this.captives.length, fallback: true });
      this.Beat("kick");
      this.creakAt ??= r.time;
    }
    if (this.creakAt != null && r.time - this.creakAt >= F.bunkerCreakAfterS) this.Beat("creak");
    if (this.beats.has("flank") && !this.beats.has("creak")) this.HoldAfterKill();
    if (this.beats.has("creak") && !r.Has("doorSearchStarted")) {
      this.DriveDoorSearch();
      const actors = [this.Executioner(0), this.Executioner(1)];
      const targets = actors.map((_, slot) => Place.bunker.ijaDoor[slot] || A.bunkerDoor);
      if (BunkerDoorSearchReady(actors, targets, F.bunkerDoorArriveM)) {
        for (const actor of actors) if (actor?.alive) actor.scriptedNoncombatant = false;
        r.Record("doorSearchStarted", { x: A.bunkerDoor.x, z: A.bunkerDoor.z });
      }
    }
    this.UpdateRearDigging();
  }
  /** 后侧同伴清理坍塌物的声音（一记一记的碎砖土块，不是连续床）。 */
  UpdateRearDigging() {
    const r = this.r;
    if (this.digAt == null || r.Has("luoRescueComplete")) return;
    if (r.time < this.nextDigAt) return;
    this.nextDigAt = r.time + F.bunkerRearDigIntervalS;
    r.audio?.Play?.("debrisFall", { position: r.Point(A.bunkerRear, 0.4), volume: F.bunkerRearDigVolume });
  }

  // --- 02 掀木架那一拍 ------------------------------------------------------
  /**
   * 罗班长掀木架、幺娃拉背包：两个人都到位（或等满 rescueGatherMaxS）才起接管。
   * 何有田同时从后侧交通壕开火逼日兵转身还击 —— 这一段不许被接触反应盖掉。
   * 返回 true 表示两个人已经就位，可以起 `rescue` 接管了。
   */
  RescueGatherReady(startedAt) {
    const r = this.r;
    const luo = r.companion.Handle("luo"), yaowa = r.companion.Handle("yaowa");
    const luoAt = !luo?.alive || Distance(luo.position, Place.bunker.luoLift) <= R.contactRadiusM;
    const yaowaAt = !yaowa?.alive || Distance(yaowa.position, Place.bunker.yaowaLift) <= R.contactRadiusM;
    if (yaowa?.alive && !yaowaAt) {
      // 幺娃拉背包那一头：和罗班长一样放行，不然接触反应每帧把他推回掩体。
      r.ai.ReleaseCover(yaowa);
      r.MoveActor(yaowa, Place.bunker.yaowaLift, R.walkSpeedMps);
      r.ai.SetStance(yaowa, 1, 0.5, true);
    }
    return (luoAt && yaowaAt) || (startedAt != null && r.time - startedAt >= F.rescueGatherMaxS);
  }
  /** 何有田在后侧交通壕开火压住门外那一片。 */
  UpdateSuppression() {
    const r = this.r;
    const he = r.companion.Handle("heyoutian");
    if (!he?.alive) return;
    he.scriptedNoncombatant = false;
    r.Defend(he, Place.bunker.heyoutianFire, 0, R.companionCoverSlackM);
    he.watchYaw = Math.atan2(he.position.x - A.bunkerKilling.x, he.position.z - A.bunkerKilling.z);
    he.watchUntil = r.ai.time + 2;
  }

  State() {
    return {
      beats: BUNKER_BEAT_ORDER.filter((action) => this.beats.has(action)),
      killAt: this.killAt, killLine: this.killLine,
      captives: this.captives.map((actor) => ({
        id: actor.missionId, alive: actor.alive, health: actor.health,
        x: actor.position.x, z: actor.position.z,
      })),
      rifles: this.rifleProps.map((mesh) => ({ x: mesh.position.x, z: mesh.position.z })),
    };
  }
  Dispose() {
    for (const mesh of this.rifleProps) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.rifleProps = [];
  }
}
