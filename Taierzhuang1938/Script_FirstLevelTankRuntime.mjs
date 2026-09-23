// ===========================================================================
// Script_FirstLevelTankRuntime.mjs —— 第一关战车大脑与游戏世界之间的接线层
//
// 纯规则在 Script_FirstLevelTankBrain（不认 three）；这里把运行时的世界翻成大脑吃的数据
// （目标、视线、掩体沿、车体挂点、事实、这一步许不许开火、护兵名单），再把大脑的输出落到
// 世界里（车的位姿、主炮 / 机枪开火、护兵走位、事实、震屏、可破坏掩体）。
// Runtime.UpdateTank / OnBlast 与 Main 的车体中弹只各留一行钩子（开关 Data_Tuning_Tank.brainEnabled）。
//
// 事实口径（契约 §5.7）：tankImmobilized = 进入 MobilityKill 或 Disabled；tankFireDisabled = Disabled。
// 路点：Data_Tuning_Tank.FRONT_TANK_BRAIN_PATH（Space 包 FRONT_TANK_PATH + 节奏字段，Front 包 09-24 接上）；
// 可破坏掩体：Space 包 Data_FirstLevelFrontBreakables（SpaceBreakableSpecs 换格式）。
//
// 2026-09-24 审查修复：
//   · 打不死的剧情人物（scriptEssential）进目标表时带 essential，大脑按 essentialScale 压权重；
//   · 05 攻击支路做成区域目标（路点表 lanes[]，LanePoint 取点）；
//   · 04 剧本撤离窗口（阵位被压住 → 回到阵位后墙以前）玩家带伤害上限；
//   · MobilityKill 以后玩家手里没集束弹僵 luoFinishS 秒 → 罗班长补刀（ForceDisable("luoHatch")）；
//   · 进场闸：起点不在玩家视野里才开进图；
//   · Disabled 以后不再每帧拼世界（World / Targets）；护兵锚点挪 1.5 m 才重下命令、停车时推到 AiCover 掩体点；
//   · 大脑喊话按 TANK.barkCues 接 Say（节流）。
// ===========================================================================
import * as THREE from "three";
import { CreateTankBrain, LuoFinishDue, LanePoint, TankClearFact } from "./Script_FirstLevelTankBrain.mjs";
import { TANK, FRONT_TANK_BRAIN_PATH, TANK_BARK_CUES } from "./Data_Tuning_Tank.mjs";
import { FRONT_BREAKABLES } from "./Data_FirstLevelFrontBreakables.mjs";
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { FirstLevelFrontBreakables, SpaceBreakableSpecs } from "./Script_FirstLevelFrontBreakables.mjs";
import { TankAudio } from "./Script_TankAudio.mjs";

const TANK_STAGES = Object.freeze(["Support", "MachineGun", "Tank", "Orders"]);
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Plain = (v) => ({ x: v.x, y: v.y, z: v.z });
const Wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class FirstLevelTankRuntime {
  constructor(runtime, { path = FRONT_TANK_BRAIN_PATH, tuning = TANK, breakables = FRONT_BREAKABLES } = {}) {
    this.r = runtime;
    this.path = path;
    this.T = tuning;
    this.breakableSpecs = breakables;
    this.brain = null;
    this.breakables = null;
    this.lastState = "Intact";
    this.lastYaw = null;
    this.escortAnchors = new Map();
    this.escortsReleased = false;
    this.blockIndex = path.waypoints.findIndex((w) => w.kind === "block");
    this.previewIndex = path.waypoints.findIndex((w) => w.preview);
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.entryWaitSince = null;
    this.noBundleSince = null;
    this.barkSaidAt = new Map();
    this.log = { shots: [], bursts: 0, walkInShots: 0, mgShots: 0, barks: [], events: [], blasts: [], hits: [], states: [], breaks: [],
      appearedAt: null, entry: null, luoFinish: null, frames: { full: 0, idle: 0 } };
    this.sound = null;
  }

  /** 声音（Script_TankAudio）：第一次用到时建；没有音频引擎（node 测试）就一直是 null。 */
  get Sound() {
    if (!this.sound && this.r.audio) this.sound = new TankAudio(this.r.audio, this.T.audio, this.T.drive);
    return this.sound;
  }
  /** 03「先闻其声」：车还没开进图时，引擎在路线起点怠速。 */
  OffstagePoint() {
    const w = this.path.waypoints[0];
    return { x: w.x, y: this.Ground(w.x, w.z), z: w.z };
  }

  /** 第一次用到时建大脑；读档 / 跳关时摆到这一步开头该在的停车点。 */
  EnsureBrain(stage) {
    if (this.brain) return this.brain;
    const r = this.r, t = r.tank;
    this.brain = CreateTankBrain(this.path, this.T, { seed: 0x89 });
    if (stage !== "Support") this.brain.PlaceForStage(stage);
    if (t.immobilized) {
      // 跳到 06 以后：车早就哑了（与旧口径一样：断履带 + 后甲板炸穿）。
      this.brain.trackSide = t.damageSide === -1 ? -1 : 1;
      this.brain.SetDamage("Disabled", { zone: "engineDeck" });
      t.damageAt ??= r.time - 60; t.engineAt ??= t.damageAt;
    }
    t.brain = true;
    this.lastState = this.brain.damageState;
    this.ApplyState(this.brain.damageState, false);
    return this.brain;
  }
  EnsureBreakables() {
    const r = this.r;
    if (this.breakables || !r.scene || !r.battlefield) return;
    const { specs, skipped } = SpaceBreakableSpecs(this.breakableSpecs, MISSION_LAYOUT, (x, z) => this.Ground(x, z));
    this.breakables = new FirstLevelFrontBreakables({ scene: r.scene, battlefield: r.battlefield, physics: r.physics,
      vfx: r.vfx, audio: r.audio, layout: MISSION_LAYOUT }, specs);
    this.breakables.skipped = skipped;
  }
  /**
   * 进场闸（TANK.entry）：起点对玩家没有视线、或在玩家朝向 ±offViewRad 以外（屏幕外）才开进图；
   * 等了 maxWaitS 还不行就照样进（不卡流程）。
   */
  EntryClear() {
    const r = this.r, E = this.T.entry, p = r.player;
    this.entryWaitSince ??= r.time;
    const waited = r.time - this.entryWaitSince;
    let reason = null;
    if (!E || !p?.Alive) reason = "noPlayer";
    else if (waited >= E.maxWaitS) reason = "timeout";
    else {
      const w = this.path.waypoints[0], eye = p.EyePosition, at = r.Point(w, E.lookY);
      if (r.BlocksSight(eye, at)) reason = "noSight";
      else if (Math.abs(Wrap((p.yaw ?? 0) - Math.atan2(eye.x - at.x, eye.z - at.z))) > E.offViewRad) reason = "offScreen";
    }
    if (reason) this.log.entry = { t: r.time, waitedS: waited, reason };
    return !!reason;
  }

  // --- 世界 → 大脑 ---------------------------------------------------------------
  Ground(x, z) { return this.r.battlefield.GroundHeight(x, z); }
  Targets(stage) {
    const r = this.r, out = [], G = this.T.gunner;
    const Push = (actor, id, kind, extra = {}) => {
      if (!actor) return;
      const p = actor.position, alive = actor.Alive ?? actor.alive;
      if (!alive) return;
      out.push({ id, kind, x: p.x, z: p.z, y: extra.y ?? p.y + (actor.stance === 2 ? 0.35 : 1.2), ground: this.Ground(p.x, p.z),
        untargetable: !!actor.missionUntargetable, essential: !!actor.scriptEssential, ...extra });
    };
    const player = r.player;
    if (player?.Alive) {
      const mounted = !!r.emplacement?.Mounted;
      // 04 剧本撤离窗口：阵位被压住（「退后墙！」）到回到阵位后墙以前，对玩家只砸土、不要命。
      const retreat = stage === "MachineGun" && r.Has("tankPositionPressured") && !r.Has("rightRearReached");
      Push(player, "player", mounted ? "mannedMg" : "player", { y: player.EyePosition.y - 0.15,
        ...(retreat ? { damageCap: G.retreatDamageScale, weightScale: G.retreatWeightScale } : {}) });
    }
    const rightNpc = r.emplacement?.guns?.get?.(r.gunId)?.npc, leftNpc = r.emplacement?.guns?.get?.(r.leftGunId)?.npc;
    const luo = r.companion?.Handle?.("luo");
    for (const actor of r.squad || []) {
      const kind = actor === rightNpc ? "mannedMg" : actor === leftNpc ? "leftGun" : actor === luo ? "luo" : "squad";
      Push(actor, actor.castId || actor.missionId || `squad${actor.id}`, kind);
    }
    for (const actor of r.frontDefenders || []) Push(actor, actor.missionId || `def${actor.id}`, actor === leftNpc ? "leftGun" : "squad");
    for (const g of r.guards || []) Push(g.actor, `guard${g.actor?.id}`, "guard");
    for (const e of r.relief || []) Push(e.actor, `relief${e.actor?.id}`, "squad");
    // 区域目标：04 先压阵位（保证 tankPositionPressured 有真炮弹兑现），压住以后封缺口。
    if (stage === "MachineGun" && !r.Has("tankPositionPressured")) {
      const g = this.Ground(S.nest.x, S.nest.z);
      // 权重 6：玩家离开阵位（躲雷、乱跑）时也要先压阵位 —— 否则炮手一直追着人打、这一拍永远兑现不了
      // （2026-09-24 探针实测：玩家跑到阵位东边 15 m，100 s 里 13 发全打人、tankPositionPressured 没记，04 卡住）。
      out.push({ id: "nestZone", kind: "zone", weight: this.T.nestZoneWeight, x: S.nest.x, z: S.nest.z, y: g + 1.1, ground: g, scatterM: [1.2, 2.6] });
    }
    if (r.Has("tankPositionPressured") && !r.Has("lastGuardsWithdrawn")) {
      const g = this.Ground(S.gap.x, S.gap.z);
      out.push({ id: "gapZone", kind: "zone", weight: 1, x: S.gap.x, z: S.gap.z, y: g + 1.2, ground: g, scatterM: [3, 5] });
    }
    // 区域火力（05 攻击支路）：玩家进了沟线 radiusM 以内，沿线离他最近的取整点就是区域目标（id 不变，只挪点）。
    // 盯沟口（lane.watch）：领了集束弹、人还在沟外 watch.rangeM 以内（取弹沟 / 回程），车长先把炮塔摆向他要来的那段沟，
    // 按节奏轰沟口的沟沿（看不见 → 打掩体沿，墙挡弹片只剩压制）；权重低一档。车已解决（TankClearFact）就不再盯。
    if (player?.Alive) for (const lane of this.path.lanes || []) {
      if (lane.stage !== stage || (lane.requireFact && !r.Has(lane.requireFact))) continue;
      let at = LanePoint(lane, player.position), weight = lane.weight;
      if (!at && lane.watch && !r.Has(TankClearFact(r.tank))) { at = LanePoint(lane, player.position, lane.watch.rangeM); weight = lane.watch.weight; }
      if (!at) continue;
      const g = this.Ground(at.x, at.z);
      out.push({ id: lane.id, kind: "zone", weight, x: at.x, z: at.z, y: g + 1.1, ground: g, scatterM: lane.scatterM });
    }
    return out;
  }
  World(stage) {
    const r = this.r, view = r.view, t = r.tank;
    const muzzle = view.TankMuzzle(t), mg = view.TankMuzzle(t, "mgMuzzle"), rearMg = view.TankMuzzle(t, "rearMgMuzzle");
    return {
      stage,
      facts: r.flow.facts,
      targets: this.Targets(stage),
      Los: (a, b) => !r.BlocksSight(this.from.set(a.x, a.y, a.z), this.to.set(b.x, b.y, b.z), view.tankCollider),
      Cover: (at, from) => this.CoverLip(at, from),
      tankPose: { groundY: view.tank.position.y, muzzle: Plain(muzzle), mg: Plain(mg), rearMg: Plain(rearMg) },
      // 03 只露面、只转炮塔，不开火（Notion 03：先看见它，04 才挨炮）。
      weaponsFree: { main: stage !== "Support", mg: stage !== "Support" },
      escortIds: MISSION_ENCOUNTERS.tank.map((s) => s.id).filter((id) => r.enemies.get(id)?.alive),
    };
  }
  /** 掩体沿：从目标胸口朝车方向，6 m 内第一处实体的顶沿（打这里 = 土砸下来、人不死）。 */
  CoverLip(at, from) {
    const r = this.r;
    if (!from) return null;
    const ground = this.Ground(at.x, at.z);
    const origin = new THREE.Vector3(at.x, Math.max(ground + 0.9, (at.y ?? ground + 1.2) - 0.35), at.z);
    const dir = new THREE.Vector3(from.x - origin.x, (from.y ?? origin.y) - origin.y, from.z - origin.z);
    const length = dir.length();
    if (length < 0.5) return null;
    dir.divideScalar(length);
    const hit = r.battlefield.Raycast(origin, dir, Math.min(length, 6), { terrain: true, excludeCollider: r.view.tankCollider });
    if (!hit) return null;
    const p = origin.addScaledVector(dir, hit.t);
    return { x: p.x, y: p.y + 0.15, z: p.z };
  }

  // --- 一帧 ------------------------------------------------------------------
  Update(dt) {
    const r = this.r, t = r.tank, stage = r.flow.stage.id;
    if (!TANK_STAGES.includes(stage)) { if (this.sound) this.sound.Stop(); return; }
    // 03：阵位夺下以前车还没开进图（北面路线起点）—— 看不见，但引擎已经在那儿怠速了。
    // 夺下以后还要过进场闸：起点在玩家视野里就再等等，别凭空冒出来。
    const entryFact = this.T.entry?.fact || "rightNestCaptured";
    if (stage === "Support" && !this.brain && (!r.Has("rightNestCaptured") || !r.Has(entryFact) || !this.EntryClear())) {
      t.active = false; t.present = false;
      this.Sound?.Offstage(dt, this.OffstagePoint());
      return;
    }
    t.active = true; t.present = true;
    const brain = this.EnsureBrain(stage);
    this.EnsureBreakables();
    // 彻底哑火、熄火也熄完了：不再每帧拼世界（三次炮口取点、目标表、视线），只让大脑走完它的时钟。
    if (brain.damageState === "Disabled" && brain.time - brain.disabledAt > this.T.damage.stallS + 0.5) {
      this.log.frames.idle++;
      this.Apply(brain.Update(dt, { stage, facts: r.flow.facts, weaponsFree: { main: false, mg: false } }), dt);
      return;
    }
    this.log.frames.full++;
    const out = brain.Update(dt, this.World(stage));
    this.Apply(out, dt);
    this.CheckLuoFinish();
    this.CheckWindow();
  }
  /** MobilityKill 以后玩家手里一捆也没有、僵了 luoFinishS 秒：罗班长往舱盖里塞一颗。 */
  CheckLuoFinish() {
    const r = this.r, b = this.brain;
    if (!b || b.damageState !== "MobilityKill") { this.noBundleSince = null; return; }
    const bundles = r.Inventory?.()?.bundles ?? 0;
    if (bundles > 0 || !r.player?.Alive) this.noBundleSince = null;
    else this.noBundleSince ??= r.time;
    if (!LuoFinishDue({ state: b.damageState, noBundleSince: this.noBundleSince, now: r.time }, this.T)) return;
    const t = r.tank, yaw = t.hullYaw ?? Math.PI, c = Math.cos(yaw), s = Math.sin(yaw), lz = 1.2;
    const groundY = r.view?.tank?.position.y ?? this.Ground(t.x, t.z);
    const at = new THREE.Vector3(t.x + s * lz, groundY + 2.6, t.z + c * lz);
    // 看得见的那一下：舱盖上一团火、一声闷响（零伤害，只为读得出「有人往里塞了一颗」）。
    r.combat?.Blast?.(at, 1.2, 0, "grenade", "ija", false, null, "Grenade");
    b.ForceDisable("luoHatch");
    this.log.luoFinish = { t: r.time, waitedS: r.time - this.noBundleSince };
    this.noBundleSince = null;
    if (b.damageState !== this.lastState) { this.lastState = b.damageState; this.ApplyState(b.damageState, true); }
  }
  Apply(out, dt) {
    const r = this.r, t = r.tank, V = this.T.view;
    const d = out.drive;
    t.x = d.x; t.z = d.z;
    t.pivotRate = this.lastYaw == null || dt <= 0 ? 0 : Math.atan2(Math.sin(d.yaw - this.lastYaw), Math.cos(d.yaw - this.lastYaw)) / dt;
    this.lastYaw = d.yaw;
    t.hullYaw = d.yaw; t.hullPitch = d.pitch; t.speed = d.speed; t.moving = d.moving; t.pivoting = d.pivoting;
    t.load = d.load; t.rpm = d.rpm; t.roadProgress = d.progress; t.waypoint = d.waypoint?.kind || null;
    t.turretYaw = out.turret.yaw; t.gunPitch = out.turret.pitch; t.turretRate = out.turret.rate;
    t.cranking = out.turret.cranking; t.gunPhase = out.turret.phase; t.hatchOpen = out.turret.hatchOpen;
    t.target = out.target;
    t.recoil = Number.isFinite(t.firedAt) ? V.recoilM * Math.max(0, 1 - (r.time - t.firedAt) / V.recoilReturnS) ** 2 : 0;
    t.atBlock = this.blockIndex >= 0 && this.brain.reached >= this.blockIndex;
    // 露面：玩家第一次真的看得见它的那一刻（探针用）。
    if (this.log.appearedAt == null && r.player?.Alive && !r.BlocksSight(r.player.EyePosition, r.Point(t, 2.2), r.view.tankCollider))
      this.log.appearedAt = { t: r.time, stage: r.flow.stage.id, x: t.x, z: t.z, distance: Distance(t, r.player.position) };
    if (r.flow.stage.id === "Support" && this.previewIndex >= 0 && this.brain.holdIndex === this.previewIndex) r.Record("tankPreviewed");
    if (out.state !== this.lastState) { this.lastState = out.state; this.ApplyState(out.state, true); }
    r.view.SyncTank(t);
    const sound = this.Sound, groundY = r.view.tank.position.y;
    sound?.Update(dt, { x: t.x, z: t.z, groundY, rpm: t.rpm, load: t.load, speed: t.speed, pivotRate: t.pivotRate,
      turretRate: t.turretRate, cranking: t.cranking, damageState: t.damageState });
    if (sound) {
      const at = { x: t.x, y: groundY + 0.4, z: t.z }, turretAt = { x: t.x, y: groundY + this.T.audio.turretY, z: t.z };
      for (const e of out.events) sound.OnEvent(e.id, at);
      for (const b of out.barks) sound.OnBark(b.id, turretAt);
    }
    for (const f of out.fire) this.Fire(f);
    this.Escorts(out);
    for (const b of out.barks) { this.log.barks.push({ t: r.time, ...b }); this.SayBark(b.id); }
    for (const e of out.events) this.log.events.push({ t: r.time, id: e.id });
    if (this.log.barks.length > 64) this.log.barks.splice(0, this.log.barks.length - 64);
    if (this.log.events.length > 128) this.log.events.splice(0, this.log.events.length - 128);
    // 震屏：25 m 内隆隆（按负载）。
    if (r.player?.shake && t.rpm > 1) {
      const distance = Distance(r.player.position, t);
      if (distance < V.rumbleRangeM) r.player.shake.Rumble?.(distance, t.load);
    }
  }
  /**
   * 大脑喊话 → 战斗喊话（TANK.barkCues；null 的只记日志）。同一个 key 至少隔 barkCooldownS。
   * 中方点名班组某人（who）从他的位置喊、用他的本人版本；日方从炮塔喊。走 Audio.Bark：剧情对白在说时让路。
   * （旧格式：字符串 = 剧情 cue id，照旧 r.Say。）
   */
  SayBark(id) {
    const r = this.r, spec = TANK_BARK_CUES?.[id];
    if (!spec) return false;
    const key = typeof spec === "string" ? spec : spec.key;
    if (r.time - (this.barkSaidAt.get(key) ?? -Infinity) < this.T.barkCooldownS) return false;
    if (typeof spec === "string") { this.barkSaidAt.set(key, r.time); r.Say(spec); return true; }
    let position = null;
    if (spec.who) {
      const actor = r.companion?.Handle?.(spec.who);
      if (!actor || !(actor.alive ?? actor.Alive)) return false;
      position = actor.position;
    } else {
      const t = r.tank, groundY = r.view?.tank?.position.y ?? this.Ground(t.x, t.z);
      position = { x: t.x, y: groundY + (this.T.audio?.turretY ?? 2.2) - 1.5, z: t.z };
    }
    const played = r.audio?.Bark?.(spec.kind, { key, who: spec.who ?? null, side: spec.side || "nra", position, priority: false,
      seed: key.length }) ?? null;
    if (!played) return false;
    this.barkSaidAt.set(key, r.time);
    this.log.barks.push({ t: r.time, id, key, said: true });
    return true;
  }
  /**
   * 05 的空当（TANK.window）：领了集束弹、车还没解决、玩家在攻击支路沟线上，大脑正瞄着缺口、炮塔偏开玩家方位 ——
   * 罗班长喊「它在打口子！就现在！」。
   */
  CheckWindow() {
    const r = this.r, b = this.brain, W = this.T.window, p = r.player;
    if (!W || !b || r.flow.stage.id !== "Tank" || !r.Has("bundleTaken") || r.Has(TankClearFact(r.tank)) || !p?.Alive) return;
    if (b.targetId !== "gapZone") return;
    const lane = (this.path.lanes || []).find((l) => l.id === "attackLane");
    if (!lane || !LanePoint(lane, p.position, W.laneRadiusM)) return;
    const t = r.tank, bearing = Math.atan2(t.x - p.position.x, t.z - p.position.z);
    if (Math.abs(Wrap(b.turretYaw - bearing)) < W.angleRad) return;
    if (r.time - (this.windowAt ?? -Infinity) < W.cooldownS) return;
    if (this.SayBark("tankWindow")) this.windowAt = r.time;
  }
  ApplyState(state, record) {
    const r = this.r, t = r.tank, b = this.brain, last = b.damageLog.at(-1);
    t.damageState = state;
    t.immobilized = state !== "Intact";
    t.fireDisabled = state === "Disabled";
    t.trackCut = b.trackSide !== 0;
    t.engineKilled = b.engineKilled;
    if (b.trackSide) t.damageSide = b.trackSide;
    if (state !== "Intact") { t.moving = false; t.damageAt ??= r.time; }
    if (t.engineKilled) t.engineAt ??= r.time;
    if (state === "Disabled") t.disabledAt ??= r.time;
    this.log.states.push({ t: r.time, state, zone: last?.zone || null });
    // 声音：真打出来的才熄火 / 卡死 / 冷却滴答；读档跳到 06 的（record=false）只记下状态，不补放。
    const sound = this.Sound;
    if (sound && record) sound.OnState(state, { x: t.x, y: r.view.tank?.position.y ?? this.Ground(t.x, t.z), z: t.z });
    else if (sound) sound.state = state;
    if (!record) return;
    if (state !== "Intact") r.Record("tankImmobilized", { state, zone: last?.zone || null });
    if (state === "Disabled") r.Record("tankFireDisabled", { zone: last?.zone || null });
  }
  Fire(f) {
    const r = this.r, t = r.tank, view = r.view, V = this.T.view, G = this.T.gunner, M = this.T.mg;
    if (f.weapon === "main") {
      const from = view.TankMuzzle(t);
      const at = new THREE.Vector3(f.at.x, f.at.y, f.at.z), dir = at.clone().sub(from).normalize();
      r.vfx.MuzzleFlash(from, dir, { scale: V.cannonMuzzleScale, kind: "cannon" });
      const R = V.groundRing;
      r.vfx.GroundDustRing?.(new THREE.Vector3(from.x, this.Ground(from.x, from.z), from.z), dir,
        { radius: R.radiusM, life: R.lifeS, count: R.count, minCount: R.minCount, opacity: R.opacity, sizeStart: R.sizeStart,
          sizeEnd: R.sizeEnd, rise: R.rise, rings: R.rings });
      t.firedAt = r.time; t.lastShell = r.time; t.shots = (t.shots || 0) + 1;
      if (r.player?.shake) {
        const distance = Distance(r.player.position, t);
        if (distance < V.fireKickRangeM) r.player.shake.Impulse({ pitch: V.fireKickPitchRad * (1 - distance / V.fireKickRangeM) });
      }
      const shot = { t: r.time, kind: f.kind, target: f.target, warning: !!f.warning, layS: f.layS, damage: f.damage, at: { ...f.at },
        from: Plain(from), impact: null };
      this.log.shots.push(shot);
      const flight = Math.max(0.06, from.distanceTo(at) / G.shellSpeedMps);
      // 炮口声：有 TankAudio 就走它的近 / 中 / 远三层（Combat 的 report 是借来的 explosionMid，不再叠）。
      const sound = this.Sound;
      if (sound) sound.OnCannon(Plain(from), { ...f.at }, flight);
      r.combat.FireShell(from, at, {
        flight,
        kind: "Shell57",
        report: !sound,
        sourceCollider: view.tankCollider,
        radius: f.radius,
        damage: f.damage,
        // 墙后近炸只给压制（Data_Tuning_Combat.BLAST.occludedSuppression*）：只有这门炮带这个开关。
        occludedSuppression: true,
        OnImpact: (position) => this.OnImpact(position, f, shot),
      });
      return;
    }
    const from = view.TankMuzzle(t, f.weapon === "rear" ? "rearMgMuzzle" : "mgMuzzle");
    const dir = new THREE.Vector3(f.at.x - from.x, f.at.y - from.y, f.at.z - from.z).normalize();
    const elevation = Math.asin(dir.y);
    if (elevation < -M.downRad || elevation > M.upRad) return;
    this.log.mgShots++;
    if (f.kind === "walkIn") this.log.walkInShots++;
    // 车载机枪：机枪类 cue、逐发一声（burst 1）、隔着钢板的车内低通。
    const A = this.T.audio;
    t.lastMgShot = r.FireVehicleBullet(from, dir, { weaponId: "Type11", damageScale: f.damageScale, sourceCollider: view.tankCollider,
      gunCue: A.mgCue, gunOpts: { volume: A.mgVolume, burst: 1, airCut: A.mgAirCutHz, weaponClass: "mg" } });
  }
  OnImpact(position, f, shot) {
    const r = this.r, t = r.tank;
    const crater = r.battlefield.deformation?.State?.().lastImpact;
    (t.impacts ||= []).push({ x: position.x, y: position.y, z: position.z, kind: f.kind, target: f.target,
      crater: !!crater && crater.id === "Shell57" && Math.hypot(crater.x - position.x, crater.z - position.z) < 0.01,
      revision: crater?.revision || 0 });
    if (t.impacts.length > 8) t.impacts.shift();
    shot.impact = Plain(position);
    shot.playerDistance = r.player ? Distance(position, r.player.position) : null;
    for (const actor of r.squad || []) if (Distance(actor.position, position) < 12) r.ai.SetStance(actor, 2, 2, true);
    if (!r.Has("tankPositionPressured") && Distance(position, S.nest) < this.T.pressureRadiusM) {
      r.Record("tankPositionPressured", { x: position.x, z: position.z });
      r.Say("TankTerror");
    }
    // 掩体吃整发炮弹的力道（警告弹只是不要人命，墙沿照样打掉一截）。
    const broken = this.breakables?.OnBlast(position, { damage: f.coverDamage ?? f.damage, time: r.time }) || [];
    for (const b of broken) this.log.breaks.push({ t: r.time, stage: r.flow.stage.id, ...b });
  }
  /** 路边掩体点（AiCover）：离大脑给的锚点 escortCoverSearchM 以内、没被别人占的最近一个。 */
  CoverNear(anchor, actor) {
    const r = this.r, P = this.T.perf, covers = r.ai?.covers;
    if (!covers?.Nearby) return null;
    let best = null, bestD = Infinity;
    for (const c of covers.Nearby(anchor.x, anchor.z, P.escortCoverSearchM)) {
      if (!Number.isFinite(c?.x) || !Number.isFinite(c?.z)) continue;
      const owner = covers.OccupantOf?.(c.id);
      if (owner != null && owner !== actor.id) continue;
      const d = Math.hypot(c.x - anchor.x, c.z - anchor.z);
      if (d < bestD) { bestD = d; best = { x: c.x, z: c.z }; }
    }
    return best;
  }
  /** 护兵只管走位（单一所有权：开火交普通 AI，Data_EnemyAi §19）。模式变了、或锚点挪了 escortRecommandM 才重下命令。 */
  Escorts(out) {
    const r = this.r, P = this.T.perf;
    if (out.releaseEscorts) {
      // 车彻底哑火：护兵沿来路往回撤（倒着走战车路点，到路线起点再交还普通 AI 就地防守）。
      // 2026-09-24 实测：就地交还（Defend 在原地）时，喊人收过来的护兵停在阵位边 (27.7,−136.8)，
      // 看得见缺口、没被压制 → FrontBattle.InfantryBlockade 一直成立，最后一批守军等 240 s 也撤不出去（03→06 两次红）；
      // 关掉大脑的旧路径护兵在车后路上，同一流程通过。车没了，步兵护兵退回出发线是常态，不是剧本特例。
      const E = this.T.escorts;
      if (!this.escortsReleased) {
        this.escortsReleased = true;
        this.escortRetreat = new Map();
        const W = this.path.waypoints;
        for (const id of MISSION_ENCOUNTERS.tank.map((s) => s.id)) {
          const actor = r.enemies.get(id);
          if (!actor?.alive) continue;
          let near = 0;
          for (let i = 1; i < W.length; i++) if (Distance(W[i], actor.position) < Distance(W[near], actor.position)) near = i;
          this.escortRetreat.set(id, W.slice(0, near + 1).reverse().map((w) => ({ x: w.x, z: w.z })));
        }
      }
      for (const [id, route] of this.escortRetreat) {
        const actor = r.enemies.get(id);
        if (!actor?.alive || !route.length) continue;
        while (route.length > 1 && Distance(actor.position, route[0]) < E.retreatArrivalM) route.shift();
        if (route.length === 1 && Distance(actor.position, route[0]) < E.retreatArrivalM) {
          r.Defend(actor, route[0], E.holdRadiusM); route.length = 0; continue;
        }
        r.ai.SetStance(actor, 0, 0.5, true);
        r.MoveActor(actor, route[0], E.retreatSpeedMps);
      }
      return;
    }
    for (const e of out.escorts) {
      const actor = r.enemies.get(e.id);
      if (!actor?.alive) continue;
      const previous = this.escortAnchors.get(e.id);
      // 还没接过来的护兵：车离他远就不管（03 车在图外时他们留在原处打仗）。
      if (!previous && Distance(actor.position, e.anchor) > this.T.escorts.joinRangeM) continue;
      if (previous && previous.mode === e.mode && Distance(previous.anchor, e.anchor) < P.escortRecommandM) continue;
      let anchor = e.anchor, radius = e.radius;
      // 停车（firePoint / hullDown / block / squeeze）：推到路边真有的掩体点上（AiCover）。
      if (e.mode === "hold") {
        const cover = this.CoverNear(e.anchor, actor);
        if (cover) { anchor = cover; radius = P.escortCoverRadiusM; }
      }
      this.escortAnchors.set(e.id, { anchor: { ...e.anchor }, mode: e.mode, cover: anchor !== e.anchor });
      r.Defend(actor, anchor, radius, e.slack);
      if (e.mode === "move" || e.mode === "rally") r.ai.SetStance(actor, e.mode === "rally" ? 0 : 1, 0.5, true);
      else if (e.mode === "slot") r.ai.SetStance(actor, 1, 0.5, true);
    }
  }

  // --- 两帧之间的事件 ------------------------------------------------------------
  /** Combat.Blast 的 onBlast（经 Runtime.OnBlast）。只认中方（玩家 / 班里人）的爆炸。 */
  OnBlast(event) {
    const r = this.r, t = r.tank;
    if (!this.brain || !t.active) return null;
    const { position, radius, damage, byPlayer, explosiveId, ownerId, hurtSide } = event;
    if (!byPlayer && hurtSide !== "ija") return null;
    let thrower = null;
    if (byPlayer && r.player) thrower = { x: r.player.position.x, z: r.player.position.z };
    else if (ownerId != null) {
      const soldier = r.ai.soldiers.find((s) => s.id === ownerId);
      if (soldier) thrower = { x: soldier.position.x, z: soldier.position.z };
    }
    const groundY = r.view.tank.position.y, yaw = t.hullYaw ?? Math.PI, c = Math.cos(yaw), s = Math.sin(yaw);
    // 这一部位与爆点之间有没有别的实体挡着（车体自己不算）。
    const occluded = (zone) => {
      const lx = (zone.min[0] + zone.max[0]) / 2, ly = (zone.min[1] + zone.max[1]) / 2, lz = (zone.min[2] + zone.max[2]) / 2;
      const target = new THREE.Vector3(t.x + c * lx + s * lz, groundY + ly, t.z - s * lx + c * lz);
      const from = position.clone().add(new THREE.Vector3(0, 0.2, 0)), delta = target.sub(from), distance = delta.length();
      if (distance < 0.3) return false;
      const hit = r.battlefield.Raycast(from, delta.normalize(), distance, { terrain: true });
      return !!hit && hit.box?.tag !== "missionTank" && hit.t < distance - 0.25;
    };
    const result = this.brain.OnBlast({ x: position.x, y: position.y, z: position.z, explosiveId, damage, radius, thrower, byPlayer, occluded },
      { tankPose: { groundY } });
    this.log.blasts.push({ t: r.time, explosiveId, byPlayer, x: position.x, y: position.y, z: position.z, zone: result.zone, state: result.state,
      reaction: result.reaction, local: result.local });
    if (result.state !== this.lastState) { this.lastState = result.state; this.ApplyState(result.state, true); }
    return result;
  }
  /** 枪弹打在车体上（Main 的玩家 / 架设机枪弹道命中 missionTank 碰撞盒）。 */
  OnBulletHit(point, from) {
    if (!this.brain) return null;
    const result = this.brain.OnBulletHit({ from: from ? Plain(from) : null, shooterId: "player" });
    if (point) this.Sound?.OnBulletHit(Plain(point));
    this.log.hits.push({ t: this.r.time, decoy: result.decoy, x: point?.x, z: point?.z });
    if (this.log.hits.length > 32) this.log.hits.shift();
    return result;
  }
  Debug() {
    return { brain: this.brain?.Debug() || null, breakables: this.breakables?.State() || [], breakablesSkipped: this.breakables?.skipped || [],
      log: this.log, audio: this.sound?.State() ?? null,
      telemetry: this.brain ? { shots: this.brain.telemetry.shots.slice(-24), bursts: this.brain.telemetry.bursts.slice(-48),
        reactions: this.brain.telemetry.reactions.slice(), states: this.brain.telemetry.states.slice() } : null };
  }
  Dispose() { this.breakables?.Dispose(); this.breakables = null; this.sound?.Stop(); this.sound = null; }
}
