// 炮击扬尘测试场的运行时（?impacts=1）：选弹种与落点、按真实弹道角度投送、时间控制、观察相机、落点标记。
//
// 纪律：爆炸一律走生产链 —— 炮弹 `combat.FireShell`（命中后它自己调 `Blast`，再调 `vfx.Explosion` 与地形形变挖坑），
// 手榴弹 / 航空炸弹 `combat.Blast(position, radius, damage, kind, null, false, null, explosiveId, null, options)`，
// explosiveId 一定传对（扬尘的装药量靠它）。这里不画任何爆炸。
// 非 FireShell 的两类（手榴弹 / 炸弹）没有弹道对象，命中速度写在 `options.incoming`（Vector3，米 / 秒，与 Combat.StepShells 对炮弹传的同一个字段）
// 与 `options.impactVelocity`（同一个值的数组）里，扬尘按它算来向与落角；Combat.Blast 不认识的字段一律忽略。
//
// 落角的算法（弹道与 Combat.FireShell 同一条：重力 19.6，抛物线）：
//   弹从落点水平 D 米外、高出落点 h 米的 from 起飞，飞行 T 秒，命中点弹道与水平面夹角 θ 满足
//   tanθ = (h + g·T²/2) / D，所以已知 D 与 θ，T = √(2·(D·tanθ − h) / g)。
//   平射（战车炮）反过来：给定射距与飞行时间，θ 自然很小。
//
// 玩家可见文字一律走 T("shellImpact.…")（表在 Data_Text_ShellImpact.mjs）；没有 Math.random（散布用 Mulberry32）。
import * as THREE from "three";
import { T } from "./Script_Text.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { AERIAL_BOMBS } from "./Data_AerialBombs.mjs";
import { ShellImpactLab } from "./Script_ShellImpactLab.mjs";
import {
  SHELL_IMPACT_TARGETS, SHELL_IMPACT_DEFAULT_TARGET, SHELL_IMPACT_MUNITIONS, SHELL_IMPACT_BARRAGE,
  SHELL_IMPACT_CAMERAS, SHELL_IMPACT_TANKS, SHELL_IMPACT_TIME_SCALES, SHELL_IMPACT_ORIGIN,
  BOMB_GRAVITY, ORIGIN_RISE_M, LobFlightS, ArrivalAngleDeg, DropPlan,
  ImpactWorldPoint,
} from "./Data_ShellImpactRange.mjs";
/** 手榴弹 / 炸弹的炸点离地面多高（米）。 */
const BLAST_LIFT_M = 0.12;
/** 单步一帧的仿真时长。 */
const STEP_DT = 1 / 60;
/** 暂停时给的微小仿真步长（不能给 0：别的系统会除以 dt）。 */
const PAUSED_DT = 1e-5;
const FREE_CAMERA = Object.freeze({ speedMps: 14, fastScale: 4, minAboveGroundM: 0.4, maxPitch: Math.PI / 2 - 0.01 });
const Deg = (value) => value * Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

export class ShellImpactRange {
  /**
   * host：装配层交进来的既有对象。
   *   battlefield / combat / player / camera / scene / library / vfx / audio / hud / canvas
   *   CanUse()            现在能不能动手（菜单 / 过场 / 编辑器捕获时为 false）
   *   Focus()             面板按钮点完把指针锁还给游戏
   *   SetViewmodelHidden  自由相机时藏起第一人称枪
   * options.embedded：被别的测试场（人物战场反应测试场 ?reactions=1）嵌进去只借投送链 ——
   *   不建面板、不挂键鼠监听、相机一直是玩家自己的；落点标记照样有（由宿主摆）。
   */
  constructor(host, { embedded = false } = {}) {
    this.host = host;
    this.embedded = !!embedded;
    this.random = Mulberry32(19381001);
    this.munitionId = SHELL_IMPACT_MUNITIONS[5].id;
    this.targetId = SHELL_IMPACT_DEFAULT_TARGET;
    this.pickedPoint = null;
    this.picking = false;
    this.markerShown = true;
    this.panelShown = true;
    this.timeScale = 1;
    this.paused = false;
    this.flightFast = true;
    this.stepFrames = 0;
    this.realDt = 1 / 60;
    this.clock = 0;
    this.serial = 0;
    this.records = [];
    this.queue = [];
    this.bombs = [];
    this.dustNew = true;
    this.craters = 0;
    this.cameraMode = "free";
    this.cameraPreset = null;
    this.cam = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, lastPlayerYaw: 0 };
    this.keys = new Set();
    this.viewmodelHidden = false;
    this.paintAccum = 0;
    this.BuildMarker();
    this.bombMaterial = host.library.Plain("ImpactBomb", { color: 0x4a4d3f, roughness: 0.55, metalness: 0.5 });
    this.OnKey = (event) => this.HandleKey(event, event.type === "keydown");
    this.OnMouseDown = (event) => this.HandlePick(event);
    // 窗口失焦时松开的键收不到 keyup：清掉，免得相机自己一直飞。
    this.OnBlur = () => this.keys.clear();
    if (!this.embedded) {
      window.addEventListener("keydown", this.OnKey, true);
      window.addEventListener("keyup", this.OnKey, true);
      window.addEventListener("mousedown", this.OnMouseDown, true);
      window.addEventListener("blur", this.OnBlur);
    }
    this.SetTarget(this.targetId, { quiet: true });
    this.Camera(this.embedded ? "player" : "reference");
    this.lab = this.embedded ? null : new ShellImpactLab(this);
    this.api = {
      Fire: (munitionId, target, options) => this.Fire(munitionId, target, options),
      Barrage: (munitionId, target, options) => this.Barrage(munitionId, target, options),
      Clear: () => this.Clear(),
      SetTimeScale: (scale) => this.SetTimeScale(scale),
      Pause: (on) => this.Pause(on),
      Step: (count) => this.Step(count),
      Camera: (presetId) => this.Camera(presetId),
      SetCameraPose: (pose) => this.SetCameraPose(pose),
      Targets: () => this.Targets(),
      Munitions: () => this.Munitions(),
      SetTarget: (target) => this.SetTarget(target),
      SetMunition: (id) => this.SelectMunition(id),
      SetDust: (on) => this.SetDust(on),
      ShowMarker: (on) => this.ShowMarker(on),
      ShowPanel: (on) => this.ShowPanel(on),
      Pick: (on) => this.TogglePick(on),
      PickGround: (x, y) => { const at = this.PickGround(x, y); return at ? at.toArray() : null; },
      SetFlightFast: (on) => this.SetFlightFast(on),
      State: () => this.State(),
    };
    this.PaintPanel();
  }

  // -------------------------------------------------------------------------
  // 数据口
  // -------------------------------------------------------------------------

  get field() { return this.host.battlefield; }
  Ground(x, z) { return this.field.GroundHeight(x, z); }

  Targets() {
    return SHELL_IMPACT_TARGETS.map((entry) => ({
      id: entry.id, kind: entry.kind, x: entry.x, z: entry.z, y: this.Ground(entry.x, entry.z),
      local: { ...entry.local },
    }));
  }

  Munitions() {
    return SHELL_IMPACT_MUNITIONS.map((spec) => ({ ...spec }));
  }

  Munition(id) { return SHELL_IMPACT_MUNITIONS.find((spec) => spec.id === id) || null; }

  /** 目标解析：id / {x,z}（世界坐标）/ 空（用当前落点）→ Vector3（y = 此刻的地面高度）。 */
  ResolveTarget(target) {
    if (target == null) return this.CurrentTarget().clone();
    if (typeof target === "string") {
      const entry = SHELL_IMPACT_TARGETS.find((candidate) => candidate.id === target);
      if (!entry) return this.CurrentTarget().clone();
      return new THREE.Vector3(entry.x, this.Ground(entry.x, entry.z), entry.z);
    }
    if (target.isVector3) return new THREE.Vector3(target.x, this.Ground(target.x, target.z), target.z);
    if (Number.isFinite(target.x) && Number.isFinite(target.z)) {
      return new THREE.Vector3(target.x, this.Ground(target.x, target.z), target.z);
    }
    return this.CurrentTarget().clone();
  }

  CurrentTarget() {
    if (this.pickedPoint) return new THREE.Vector3(this.pickedPoint.x, this.Ground(this.pickedPoint.x, this.pickedPoint.z), this.pickedPoint.z);
    const entry = SHELL_IMPACT_TARGETS.find((candidate) => candidate.id === this.targetId) || SHELL_IMPACT_TARGETS[0];
    return new THREE.Vector3(entry.x, this.Ground(entry.x, entry.z), entry.z);
  }

  SetTarget(target, { quiet = false } = {}) {
    if (typeof target === "string" && SHELL_IMPACT_TARGETS.some((entry) => entry.id === target)) {
      this.targetId = target; this.pickedPoint = null;
    } else if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
      this.pickedPoint = { x: target.x, z: target.z }; this.targetId = null;
    } else return null;
    this.PlaceMarker();
    if (!quiet) this.PaintPanel();
    return this.TargetSummary();
  }

  TargetSummary() {
    const at = this.CurrentTarget();
    return { id: this.targetId, picked: !!this.pickedPoint, x: at.x, y: at.y, z: at.z,
      local: { x: at.x - SHELL_IMPACT_ORIGIN.x, z: at.z - SHELL_IMPACT_ORIGIN.z } };
  }

  SelectMunition(id) {
    if (!this.Munition(id)) return null;
    this.munitionId = id;
    this.PlaceMarker();
    this.PaintPanel();
    return id;
  }

  // -------------------------------------------------------------------------
  // 投送
  // -------------------------------------------------------------------------

  /** 发射一发（或一次手榴弹起爆）。返回这一发的记录（落点 / 起飞点 / 飞行时间 / 落角，命中后补 impact）。 */
  Fire(munitionId = this.munitionId, target = null, options = {}) {
    const spec = this.Munition(munitionId);
    if (!spec) return null;
    const point = this.ResolveTarget(target);
    const record = {
      id: ++this.serial, munition: spec.id, explosiveId: spec.explosiveId, delivery: spec.delivery,
      targetId: typeof target === "string" ? target : (target == null && !this.pickedPoint ? this.targetId : null),
      target: point.toArray(), firedAt: this.clock, flightS: 0, angleDeg: spec.angleDeg ?? null,
      from: null, impact: null, impactedAt: null, fillingKg: spec.fillingKg,
    };
    switch (spec.delivery) {
      case "hand": this.DeliverHand(spec, point, record); break;
      case "lob": case "field": this.DeliverLob(spec, point, record); break;
      case "direct": this.DeliverDirect(spec, point, record); break;
      case "drop": this.DeliverDrop(spec, point, record); break;
      default: return null;
    }
    this.records.push(record);
    if (this.records.length > 80) this.records.shift();
    this.last = record;
    if (!options.quiet) this.host.hud?.Hint?.(T("shellImpact.hint.fired", { name: this.MunitionName(spec.id) }), 2);
    this.PaintPanel();
    return this.Plain(record);
  }

  /** 齐射：同一弹种在落点周围 count 发，间隔 intervalS（仿真秒），散布半径 spreadM。第一发立刻出。 */
  Barrage(munitionId = this.munitionId, target = null, options = {}) {
    const spec = this.Munition(munitionId);
    if (!spec) return null;
    const count = options.count ?? SHELL_IMPACT_BARRAGE.count;
    const interval = options.intervalS ?? SHELL_IMPACT_BARRAGE.intervalS;
    const spread = options.spreadM ?? SHELL_IMPACT_BARRAGE.spreadM;
    const center = this.ResolveTarget(target);
    const planned = [];
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2, radius = i === 0 ? 0 : Math.sqrt(this.random()) * spread;
      planned.push({ at: this.clock + i * interval, munitionId, x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
    }
    const first = planned.shift();
    const record = this.Fire(first.munitionId, { x: first.x, z: first.z }, { quiet: true });
    this.queue.push(...planned);
    this.PaintPanel();
    return { count, first: record, queued: planned.length };
  }

  /** 手榴弹 / 集束手榴弹：直接在落点起爆，附一个典型抛出落角的命中速度（取证用）。 */
  DeliverHand(spec, point, record) {
    const angle = Deg(spec.angleDeg ?? 55), speed = 14;
    // 从南侧（玩家一侧）往北扔：水平速度朝 -Z。
    const velocity = [0, -Math.sin(angle) * speed, -Math.cos(angle) * speed];
    record.flightS = 0;
    this.Detonate(spec, point, velocity);
    record.impact = [point.x, point.y + BLAST_LIFT_M, point.z]; record.impactedAt = this.clock;
  }

  /** 高抛 / 野炮：从落点北侧 rangeM 远的地方，按落角反推的弹道进来。 */
  DeliverLob(spec, point, record) {
    const range = spec.rangeM, flight = LobFlightS(range, spec.angleDeg);
    const from = new THREE.Vector3(point.x, point.y + ORIGIN_RISE_M, point.z - range);
    record.flightS = flight; record.from = from.toArray();
    this.LaunchShell(spec, from, point, flight, record);
  }

  /** 战车炮平射：从场地东侧阵地的炮口低伸飞来。 */
  DeliverDirect(spec, point, record) {
    const muzzle = this.field.TankMuzzle?.(spec.tankId);
    const place = SHELL_IMPACT_TANKS[spec.tankId];
    const from = muzzle || new THREE.Vector3(place.x, this.Ground(place.x, place.z) + 2, place.z);
    const horizontal = Math.hypot(point.x - from.x, point.z - from.z);
    record.flightS = spec.flightS; record.from = from.toArray();
    // 命中点弹道与水平面夹角：tanθ = (h + g·T²/2) / D（h = 炮口高出落点）。
    record.angleDeg = ArrivalAngleDeg(horizontal, from.y - point.y, spec.flightS);
    this.LaunchShell(spec, from, point, spec.flightS, record);
    const direction = point.clone().sub(from).setY(0).normalize();
    this.host.vfx?.MuzzleFlash?.(from, direction, { scale: 3.5 });
    this.host.audio?.Play?.("explosionNear", { position: from.clone(), volume: 0.6 });
  }

  LaunchShell(spec, from, point, flight, record) {
    const shell = this.host.combat.FireShell(from, point, {
      flight, kind: spec.explosiveId, radius: spec.radiusM, damage: spec.damage,
      incoming: flight >= 1.0,
      OnImpact: (at) => { record.impact = at.toArray(); record.impactedAt = this.clock; this.craters += 1; },
    });
    record.shellId = shell?.id ?? null;
    if (flight >= 1) this.host.vfx?.IncomingMarker?.(point, flight, { radius: spec.radiusM });
    return shell;
  }

  /** 航空炸弹：自由下落（真实重力），带一点水平速度让落角约 angleDeg；落地调 Blast（kind "bomb"）。 */
  DeliverDrop(spec, point, record) {
    const plan = DropPlan(spec.altitudeM, spec.angleDeg), fall = plan.fallS;
    const from = new THREE.Vector3(point.x, point.y + spec.altitudeM, point.z - plan.offsetM);
    const velocity = new THREE.Vector3(0, 0, plan.horizontalSpeed);
    record.flightS = fall; record.from = from.toArray();
    const mesh = this.BuildBombMesh(spec);
    mesh.position.copy(from);
    this.host.scene.add(mesh);
    this.bombs.push({ spec, record, position: from.clone(), velocity, mesh, age: 0 });
    this.host.audio?.Play?.("shellIncoming", { position: point.clone(), volume: 0.9, delay: Math.max(0, fall - 1.9) });
  }

  BuildBombMesh(spec) {
    const dims = AERIAL_BOMBS[spec.id] || { diameterM: 0.2, lengthM: 1.1 };
    const radius = dims.diameterM / 2, length = dims.lengthM;
    const group = new THREE.Group();
    group.name = `ImpactBomb_${spec.id}`;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length * 0.62, 14), this.bombMaterial);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(radius, length * 0.24, 14), this.bombMaterial);
    nose.position.y = length * 0.43; body.position.y = 0;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius, length * 0.14, 14), this.bombMaterial);
    tail.position.y = -length * 0.38;
    group.add(body, nose, tail);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.08, length * 0.2, radius * 1.9), this.bombMaterial);
      fin.position.y = -length * 0.46; fin.rotation.y = i * Math.PI / 4;
      group.add(fin);
    }
    group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = false; } });
    group.userData.impactDispose = true;
    return group;
  }

  /** 手榴弹 / 炸弹的起爆：走 Combat.Blast，explosiveId 传弹种自己的。 */
  Detonate(spec, point, velocity) {
    const at = point.clone(); at.y += BLAST_LIFT_M;
    // incoming = 命中速度向量（与 Combat.StepShells 对炮弹传的同一个字段：扬尘按它算来向与落角）；impactVelocity 是同一个值的数组形式，取证用。
    this.host.combat.Blast(at, spec.radiusM, spec.damage, spec.blastKind, null, false, null, spec.explosiveId, null,
      { incoming: new THREE.Vector3().fromArray(velocity), impactVelocity: velocity, impactSource: "shellImpactRange" });
    this.craters += 1;
  }

  // -------------------------------------------------------------------------
  // 清空
  // -------------------------------------------------------------------------

  Clear() {
    const { combat, vfx } = this.host;
    combat.ClearProjectiles();
    for (const bomb of this.bombs) this.RetireBomb(bomb);
    this.bombs.length = 0; this.queue.length = 0;
    this.field.deformation?.Reset();
    if (typeof vfx?.ClearParticles === "function") vfx.ClearParticles();
    else for (const pool of Object.values(vfx?.pools || {})) pool.Clear?.();
    vfx?.ClearGroundImpacts?.();
    // 恢复地面时脚下的人要被抬上来（站在坑里时）。
    const player = this.host.player, ground = this.Ground(player.position.x, player.position.z);
    if (player.position.y < ground) {
      player.position.y = ground; player.velocity.y = 0;
      player.body?.Teleport(player.position.x, ground, player.position.z);
    }
    this.craters = 0; this.records.length = 0; this.last = null;
    this.host.hud?.Hint?.(T("shellImpact.hint.cleared"), 2);
    this.PaintPanel();
    return this.State();
  }

  RetireBomb(bomb) {
    this.host.scene.remove(bomb.mesh);
    bomb.mesh.traverse((object) => object.geometry?.dispose());
  }

  // -------------------------------------------------------------------------
  // 时间
  // -------------------------------------------------------------------------

  SetTimeScale(scale) {
    if (!(scale > 0)) return this.timeScale;
    this.timeScale = scale;
    this.paused = false;
    this.PaintPanel();
    return this.timeScale;
  }

  Pause(on = !this.paused) {
    this.paused = !!on;
    this.PaintPanel();
    return this.paused;
  }

  Step(count = 1) {
    this.paused = true;
    this.stepFrames += Math.max(1, count | 0);
    this.PaintPanel();
    return this.stepFrames;
  }

  SetFlightFast(on = !this.flightFast) {
    this.flightFast = !!on;
    this.PaintPanel();
    return this.flightFast;
  }

  /** 有弹在空中或排队：飞行中的时间倍速另算（见 ScaleDt）。 */
  InFlight() {
    return this.host.combat.shells.length > 0 || this.bombs.length > 0 || this.queue.length > 0;
  }

  /**
   * Script_Main.Frame 的第一件事：把真实帧时长换成这一帧的仿真时长。
   * 暂停 → 一个极小值（别的系统会除以 dt，不能给 0）；单步 → 固定 1/60；否则按所选倍速，
   * 「飞行中用 1×」打开时弹在空中（含排队中的齐射）用 1×，落地后立刻回到所选倍速。
   */
  ScaleDt(realDt) {
    this.realDt = realDt;
    if (this.stepFrames > 0) { this.stepFrames -= 1; return STEP_DT; }
    if (this.paused) return PAUSED_DT;
    return realDt * (this.flightFast && this.InFlight() ? 1 : this.timeScale);
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /** 在 combat.Update 之后调；dt 是 ScaleDt 之后的仿真时长。 */
  Update(dt) {
    this.clock += dt;
    this.UpdateQueue();
    this.UpdateBombs(dt);
    this.UpdateMarkerPulse();
    // 面板按真实时间 10 Hz 重画（暂停 / 慢动作下仿真时间几乎不走，不能按它排）。
    this.paintAccum += this.realDt;
    if (this.paintAccum >= 0.1) { this.paintAccum = 0; this.PaintPanel(); }
  }

  UpdateQueue() {
    while (this.queue.length && this.queue[0].at <= this.clock) {
      const next = this.queue.shift();
      this.Fire(next.munitionId, { x: next.x, z: next.z }, { quiet: true });
    }
  }

  UpdateBombs(dt) {
    if (!this.bombs.length) return;
    const field = this.field, from = new THREE.Vector3(), delta = new THREE.Vector3(), direction = new THREE.Vector3();
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      const steps = Math.max(1, Math.ceil(dt * 60)), h = dt / steps;
      let impact = null;
      for (let step = 0; step < steps && !impact; step++) {
        from.copy(bomb.position);
        bomb.velocity.y -= BOMB_GRAVITY * h;
        bomb.position.addScaledVector(bomb.velocity, h);
        bomb.age += h;
        delta.subVectors(bomb.position, from);
        const distance = delta.length();
        if (distance > 1e-9) {
          direction.copy(delta).divideScalar(distance);
          const hit = field.Raycast(from, direction, distance, { terrain: true });
          if (hit) impact = from.clone().addScaledVector(direction, hit.t);
        }
        const ground = this.Ground(bomb.position.x, bomb.position.z);
        if (!impact && bomb.position.y <= ground) impact = bomb.position.clone().setY(ground);
      }
      if (!impact && bomb.age > bomb.record.flightS + 4) { this.RetireBomb(bomb); this.bombs.splice(i, 1); continue; }
      if (!impact) {
        bomb.mesh.position.copy(bomb.position);
        bomb.mesh.quaternion.setFromUnitVectors(UP, direction.copy(bomb.velocity).normalize());
        continue;
      }
      bomb.record.impact = impact.toArray(); bomb.record.impactedAt = this.clock;
      bomb.record.angleDeg = Math.atan2(-bomb.velocity.y, Math.hypot(bomb.velocity.x, bomb.velocity.z)) * 180 / Math.PI;
      this.Detonate(bomb.spec, impact, bomb.velocity.toArray());
      this.RetireBomb(bomb); this.bombs.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------------
  // 落点标记
  // -------------------------------------------------------------------------

  BuildMarker() {
    const material = new THREE.MeshBasicMaterial({ color: 0xedca83, toneMapped: false });
    this.marker = new THREE.Group();
    this.marker.name = "ShellImpactMarker";
    const ring = (inner, outer) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 56), material);
      mesh.rotation.x = -Math.PI / 2; mesh.userData.skipNormalDepth = true;
      return mesh;
    };
    this.markerInner = ring(0.55, 0.7);
    this.markerOuter = ring(0.97, 1.0);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 14, 6), material);
    beam.position.y = 7;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.06), material);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 2.2), material);
    this.marker.add(this.markerInner, this.markerOuter, beam, cross, cross2);
    this.marker.traverse((object) => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
    this.host.scene.add(this.marker);
    this.markerMaterial = material;
  }

  PlaceMarker() {
    const at = this.CurrentTarget(), spec = this.Munition(this.munitionId);
    this.marker.position.set(at.x, at.y + 0.12, at.z);
    // 外圈 = 这个弹种的杀伤半径（只是参照，不是判定）。
    const radius = Math.max(1.5, spec?.radiusM ?? 5);
    this.markerOuter.scale.setScalar(radius);
    this.marker.visible = this.markerShown;
  }

  UpdateMarkerPulse() {
    if (!this.marker.visible) return;
    // 地面被弹坑改了之后标记跟着地面走（一秒查一次）。
    if (Math.floor(this.clock) !== this.markerSecond) { this.markerSecond = Math.floor(this.clock); this.PlaceMarker(); }
  }

  /** 面板整个藏起来 / 放回来（截图要干净画面时用）。 */
  ShowPanel(on = !this.panelShown) {
    this.panelShown = !!on;
    this.PaintPanel();
    return this.panelShown;
  }

  ShowMarker(on = !this.markerShown) {
    this.markerShown = !!on;
    this.marker.visible = this.markerShown;
    this.PaintPanel();
    return this.markerShown;
  }

  // -------------------------------------------------------------------------
  // 选点（鼠标）
  // -------------------------------------------------------------------------

  TogglePick(on = !this.picking) {
    this.picking = !!on;
    this.PaintPanel();
    return this.picking;
  }

  /** 选点模式下按住 Alt 点画布：从相机穿过鼠标位置打一条射线到地形，取交点。 */
  HandlePick(event) {
    if (!this.picking || !event.altKey || event.button !== 0 || this.lab?.root.contains(event.target)) return;
    event.stopImmediatePropagation(); event.preventDefault();
    const at = this.PickGround(event.clientX, event.clientY);
    if (!at) { this.host.hud?.Hint?.(T("shellImpact.hint.pickMiss"), 2); return; }
    this.SetTarget({ x: at.x, z: at.z });
    this.host.hud?.Hint?.(T("shellImpact.hint.picked"), 2);
  }

  /** 屏幕坐标 → 地面交点（Vector3）；没打到返回 null。测试也直接调它。 */
  PickGround(clientX, clientY) {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const camera = this.host.camera;
    camera.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = this.field.Raycast(ray.ray.origin, ray.ray.direction, 900, { terrain: true });
    if (!hit) return null;
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, hit.t);
  }

  // -------------------------------------------------------------------------
  // 机位
  // -------------------------------------------------------------------------

  /** 预设机位 id（reference / trenchLow / overhead）或 "player"。 */
  Camera(presetId) {
    if (presetId === "player") {
      this.cameraMode = "player"; this.cameraPreset = "player";
      this.SetViewmodelHidden(false);
      this.PaintPanel();
      return this.CameraState();
    }
    const preset = SHELL_IMPACT_CAMERAS.find((entry) => entry.id === presetId);
    if (!preset) return null;
    const world = ImpactWorldPoint;
    const from = world(preset.from.x, preset.from.z), at = world(preset.at.x, preset.at.z);
    const pos = new THREE.Vector3(from.x, this.Ground(from.x, from.z) + preset.from.h, from.z);
    const look = new THREE.Vector3(at.x, this.Ground(at.x, at.z) + preset.at.h, at.z);
    this.SetCameraPose({ position: pos, lookAt: look });
    this.cameraPreset = preset.id;
    return this.CameraState();
  }

  /** 自由相机直接摆位：{ position:{x,y,z}, lookAt:{x,y,z} } 或 { position, yaw, pitch }（弧度）。 */
  SetCameraPose(pose) {
    const position = pose.position;
    this.cam.pos.set(position.x, position.y, position.z);
    if (pose.lookAt) {
      const dx = pose.lookAt.x - position.x, dy = pose.lookAt.y - position.y, dz = pose.lookAt.z - position.z;
      this.cam.yaw = Math.atan2(-dx, -dz);
      this.cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    } else { this.cam.yaw = pose.yaw ?? this.cam.yaw; this.cam.pitch = pose.pitch ?? this.cam.pitch; }
    this.cameraMode = "free"; this.cameraPreset = "custom";
    // 玩家的朝向读数归零：之后鼠标转头产生的增量才是新的转向。
    const player = this.host.player;
    this.cam.lastPlayerYaw = player.yaw; player.pitch = 0;
    this.SetViewmodelHidden(true);
    this.PaintPanel();
    return this.CameraState();
  }

  CameraState() {
    return { mode: this.cameraMode, preset: this.cameraPreset,
      position: this.cam.pos.toArray(), yaw: this.cam.yaw, pitch: this.cam.pitch };
  }

  SetViewmodelHidden(hidden) {
    if (this.viewmodelHidden === hidden) return;
    this.viewmodelHidden = hidden;
    this.host.SetViewmodelHidden?.(hidden);
  }

  /** 装配层：自由相机时不让玩家走动 / 开火（与白盒编辑器同一个口）。 */
  CapturesInput() { return this.cameraMode === "free" && !!this.host.CanUse?.(); }

  HandleKey(event, down) {
    const code = event.code;
    if (code !== "KeyW" && code !== "KeyA" && code !== "KeyS" && code !== "KeyD" && code !== "KeyQ" && code !== "KeyE"
      && code !== "ShiftLeft" && code !== "ShiftRight") return;
    if (down) this.keys.add(code); else this.keys.delete(code);
  }

  /**
   * 装配层在玩家相机写完之后调：自由相机时接管。返回是否接管了（接管时调用方同步阴影框）。
   * 转向读玩家的 yaw 增量（鼠标仍走游戏自己的输入链：指针锁 / 假后端），pitch 自己累积并放宽到几乎垂直。
   */
  ApplyCamera(camera) {
    if (this.cameraMode !== "free") return false;
    const player = this.host.player, dt = this.realDt;
    let dyaw = player.yaw - this.cam.lastPlayerYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2; else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.cam.yaw += dyaw; this.cam.lastPlayerYaw = player.yaw;
    this.cam.pitch = Math.max(-FREE_CAMERA.maxPitch, Math.min(FREE_CAMERA.maxPitch, this.cam.pitch + player.pitch));
    player.pitch = 0;
    if (this.CapturesInput() || this.keys.size) {
      const speed = FREE_CAMERA.speedMps * (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? FREE_CAMERA.fastScale : 1) * dt;
      const forward = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
      const strafe = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
      const rise = (this.keys.has("KeyE") ? 1 : 0) - (this.keys.has("KeyQ") ? 1 : 0);
      const cp = Math.cos(this.cam.pitch), sp = Math.sin(this.cam.pitch);
      const fx = -Math.sin(this.cam.yaw) * cp, fy = sp, fz = -Math.cos(this.cam.yaw) * cp;
      const rx = Math.cos(this.cam.yaw), rz = -Math.sin(this.cam.yaw);
      this.cam.pos.x += (fx * forward + rx * strafe) * speed;
      this.cam.pos.y += (fy * forward + rise) * speed;
      this.cam.pos.z += (fz * forward + rz * strafe) * speed;
    }
    const floor = this.Ground(this.cam.pos.x, this.cam.pos.z) + FREE_CAMERA.minAboveGroundM;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
    camera.position.copy(this.cam.pos);
    camera.rotation.order = "YXZ";
    camera.rotation.set(this.cam.pitch, this.cam.yaw, 0);
    camera.updateMatrixWorld(true);
    return true;
  }

  // -------------------------------------------------------------------------
  // 扬尘 A/B
  // -------------------------------------------------------------------------

  /** 「新 / 旧扬尘」开关：调 vfx.SetGroundImpactDust（主会话实现；还没有就只记状态，不报错）。 */
  SetDust(on = !this.dustNew) {
    this.dustNew = !!on;
    this.host.vfx?.SetGroundImpactDust?.(this.dustNew);
    this.PaintPanel();
    return this.dustNew;
  }

  // -------------------------------------------------------------------------
  // 读数
  // -------------------------------------------------------------------------

  MunitionName(id) { return T(`shellImpact.munition.${id}`); }

  Plain(record) {
    return { ...record, target: [...record.target], from: record.from ? [...record.from] : null, impact: record.impact ? [...record.impact] : null };
  }

  State() {
    const deformation = this.field.deformation?.State?.() || null;
    return {
      munition: this.munitionId, target: this.TargetSummary(), picking: this.picking,
      paused: this.paused, timeScale: this.timeScale, flightFast: this.flightFast, stepFrames: this.stepFrames,
      clock: this.clock, dust: this.dustNew, marker: this.markerShown, panel: this.panelShown,
      camera: this.CameraState(),
      shells: this.host.combat.shells.map((shell) => ({ id: shell.id, kind: shell.kind, position: shell.position.toArray(), target: shell.target.toArray(), age: shell.age, flight: shell.flight })),
      bombs: this.bombs.map((bomb) => ({ id: bomb.spec.id, position: bomb.position.toArray(), age: bomb.age })),
      queued: this.queue.length, shots: this.serial,
      last: this.last ? this.Plain(this.last) : null,
      records: this.records.map((record) => this.Plain(record)),
      craters: deformation?.impacts ?? this.craters, terrain: deformation,
      timeScales: [...SHELL_IMPACT_TIME_SCALES],
    };
  }

  PaintPanel() { this.lab?.Update(this.State()); }

  Dispose() {
    window.removeEventListener("keydown", this.OnKey, true);
    window.removeEventListener("keyup", this.OnKey, true);
    window.removeEventListener("mousedown", this.OnMouseDown, true);
    window.removeEventListener("blur", this.OnBlur);
    this.lab?.Dispose(); this.lab = null;
    for (const bomb of this.bombs) this.RetireBomb(bomb);
    this.bombs.length = 0; this.queue.length = 0;
    this.host.scene.remove(this.marker);
    this.marker.traverse((object) => object.geometry?.dispose());
    this.markerMaterial?.dispose();
    this.SetViewmodelHidden(false);
  }
}

export default ShellImpactRange;
