// ===========================================================================
// Script_FirstLevelTankRuntime.mjs —— 第一关战车大脑与游戏世界之间的接线层
//
// 纯规则在 Script_FirstLevelTankBrain（不认 three）；这里把运行时的世界翻成大脑吃的数据
// （目标、视线、掩体沿、车体挂点、事实、这一步许不许开火、护兵名单），再把大脑的输出落到
// 世界里（车的位姿、主炮 / 机枪开火、护兵走位、事实、震屏、可破坏掩体）。
// Runtime.UpdateTank / OnBlast 与 Main 的车体中弹只各留一行钩子（开关 Data_Tuning_Tank.brainEnabled）。
//
// 事实口径（契约 §5.7）：tankImmobilized = 进入 MobilityKill 或 Disabled；tankFireDisabled = Disabled。
// 路点：临时路线 Data_Tuning_Tank.TANK_TEMP_PATH（现布局）；第二波 Front 包换成 Space 的新路。
// ===========================================================================
import * as THREE from "three";
import { CreateTankBrain } from "./Script_FirstLevelTankBrain.mjs";
import { TANK, TANK_TEMP_PATH } from "./Data_Tuning_Tank.mjs";
import { FRONT_SORTIE as S } from "./Data_FirstLevelFrontRoute.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { FirstLevelFrontBreakables, FRONT_BREAKABLES_TEMP } from "./Script_FirstLevelFrontBreakables.mjs";
import { TankAudio } from "./Script_TankAudio.mjs";

const TANK_STAGES = Object.freeze(["Support", "MachineGun", "Tank", "Orders"]);
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const Plain = (v) => ({ x: v.x, y: v.y, z: v.z });

export class FirstLevelTankRuntime {
  constructor(runtime, { path = TANK_TEMP_PATH, tuning = TANK, breakables = FRONT_BREAKABLES_TEMP } = {}) {
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
    this.log = { shots: [], bursts: 0, walkInShots: 0, mgShots: 0, barks: [], events: [], blasts: [], hits: [], states: [], breaks: [], appearedAt: null };
    this.sound = null;
  }

  /** 声音（Script_TankAudio）：第一次用到时建；没有音频引擎（node 测试）就一直是 null。 */
  get Sound() {
    if (!this.sound && this.r.audio) this.sound = new TankAudio(this.r.audio, this.T.audio, this.T.drive);
    return this.sound;
  }
  /** 03「先闻其声」：车还没开进图时，引擎在路线起点（北面高地后面）怠速。 */
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
    this.breakables = new FirstLevelFrontBreakables({ scene: r.scene, battlefield: r.battlefield, physics: r.physics,
      vfx: r.vfx, audio: r.audio, layout: MISSION_LAYOUT }, this.breakableSpecs);
  }

  // --- 世界 → 大脑 ---------------------------------------------------------------
  Ground(x, z) { return this.r.battlefield.GroundHeight(x, z); }
  Targets(stage) {
    const r = this.r, out = [];
    const Push = (actor, id, kind, extra = {}) => {
      if (!actor) return;
      const p = actor.position, alive = actor.Alive ?? actor.alive;
      if (!alive) return;
      out.push({ id, kind, x: p.x, z: p.z, y: extra.y ?? p.y + (actor.stance === 2 ? 0.35 : 1.2), ground: this.Ground(p.x, p.z),
        untargetable: !!actor.missionUntargetable, ...extra });
    };
    const player = r.player;
    if (player?.Alive) {
      const mounted = !!r.emplacement?.Mounted;
      Push(player, "player", mounted ? "mannedMg" : "player", { y: player.EyePosition.y - 0.15 });
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
      out.push({ id: "nestZone", kind: "zone", weight: 3, x: S.nest.x, z: S.nest.z, y: g + 1.1, ground: g, scatterM: [1.2, 2.6] });
    }
    if (r.Has("tankPositionPressured") && !r.Has("lastGuardsWithdrawn")) {
      const g = this.Ground(S.gap.x, S.gap.z);
      out.push({ id: "gapZone", kind: "zone", weight: 1, x: S.gap.x, z: S.gap.z, y: g + 1.2, ground: g, scatterM: [3, 5] });
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
    // 03：阵位夺下以前车还没开进图（北面高地后面）—— 看不见，但引擎已经在那儿怠速了。
    if (stage === "Support" && !r.Has("rightNestCaptured")) {
      t.active = false; t.present = false;
      this.Sound?.Offstage(dt, this.OffstagePoint());
      return;
    }
    t.active = true; t.present = true;
    const brain = this.EnsureBrain(stage);
    this.EnsureBreakables();
    const out = brain.Update(dt, this.World(stage));
    this.Apply(out, dt);
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
    for (const b of out.barks) this.log.barks.push({ t: r.time, ...b });
    for (const e of out.events) this.log.events.push({ t: r.time, id: e.id });
    if (this.log.barks.length > 64) this.log.barks.splice(0, this.log.barks.length - 64);
    if (this.log.events.length > 128) this.log.events.splice(0, this.log.events.length - 128);
    // 震屏：25 m 内隆隆（按负载）。
    if (r.player?.shake && t.rpm > 1) {
      const distance = Distance(r.player.position, t);
      if (distance < V.rumbleRangeM) r.player.shake.Rumble?.(distance, t.load);
    }
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
      r.vfx.GroundDustRing?.(new THREE.Vector3(from.x, this.Ground(from.x, from.z), from.z), dir,
        { radius: V.groundRing.radiusM, life: V.groundRing.lifeS });
      t.firedAt = r.time; t.lastShell = r.time; t.shots = (t.shots || 0) + 1;
      if (r.player?.shake) {
        const distance = Distance(r.player.position, t);
        if (distance < V.fireKickRangeM) r.player.shake.Impulse({ pitch: V.fireKickPitchRad * (1 - distance / V.fireKickRangeM) });
      }
      const shot = { t: r.time, kind: f.kind, target: f.target, warning: !!f.warning, layS: f.layS, at: { ...f.at }, from: Plain(from), impact: null };
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
    const broken = this.breakables?.OnBlast(position, { damage: f.damage, time: r.time }) || [];
    for (const b of broken) this.log.breaks.push({ t: r.time, ...b });
  }
  /** 护兵只管走位（单一所有权：开火交普通 AI，Data_EnemyAi §19）。锚点动了才重下命令。 */
  Escorts(out) {
    const r = this.r;
    if (out.releaseEscorts) {
      if (!this.escortsReleased) {
        this.escortsReleased = true;
        for (const id of MISSION_ENCOUNTERS.tank.map((s) => s.id)) {
          const actor = r.enemies.get(id);
          if (actor?.alive) r.Defend(actor, actor.position);
        }
      }
      return;
    }
    for (const e of out.escorts) {
      const actor = r.enemies.get(e.id);
      if (!actor?.alive) continue;
      const previous = this.escortAnchors.get(e.id);
      // 还没接过来的护兵：车离他远就不管（03 车在图外时他们留在原处打仗）。
      if (!previous && Distance(actor.position, e.anchor) > this.T.escorts.joinRangeM) continue;
      if (previous && previous.mode === e.mode && Distance(previous.anchor, e.anchor) < 0.4) continue;
      this.escortAnchors.set(e.id, { anchor: { ...e.anchor }, mode: e.mode });
      r.Defend(actor, e.anchor, e.radius, e.slack);
      if (e.mode === "move" || e.mode === "rally") r.ai.SetStance(actor, e.mode === "rally" ? 0 : 1, 0.5, true);
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
    this.log.blasts.push({ t: r.time, explosiveId, byPlayer, x: position.x, z: position.z, zone: result.zone, state: result.state,
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
    return { brain: this.brain?.Debug() || null, breakables: this.breakables?.State() || [], log: this.log, audio: this.sound?.State() ?? null,
      telemetry: this.brain ? { shots: this.brain.telemetry.shots.slice(-24), bursts: this.brain.telemetry.bursts.slice(-48),
        reactions: this.brain.telemetry.reactions.slice(), states: this.brain.telemetry.states.slice() } : null };
  }
  Dispose() { this.breakables?.Dispose(); this.breakables = null; this.sound?.Stop(); this.sound = null; }
}
