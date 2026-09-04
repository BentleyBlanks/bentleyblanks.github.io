// P012 白盒行为编排。纯规则，不 import three；复用正式交互、搬运、剧情信号与检查点。
// 动作驱动阶段；新战术压力常态40秒、快清最短30秒。侦察→同轴步枪增援是明确例外，不代表全部波次达标。
import { PickUpLoadInteraction, GiveSupplyInteraction } from "./Script_Interact.mjs";

const Distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const Clone = (value) => JSON.parse(JSON.stringify(value));

export const P012_BEATS = Object.freeze([
  ["B00", "跟随罗班长下车", "Z00", 0, "door"],
  ["B01", "领取子弹并检查枪栓", "Z00", 40, "weapon"],
  ["B02", "跟随小队穿过集结村路", "Z01", 85, "village"],
  ["B03", "在村口补给并观察铁路和南北方向", "Z02", 140, "orient"],
  ["B04", "冲刺到路沟，蹲伏后进入交通壕", "Z03", 185, "shelling"],
  ["B05", "把弹药送到机枪阵位", "Z04", 230, "ammo"],
  ["B06", "观察前方田地", "Z05", 285, "scouts"],
  ["B07", "阻止正面步兵接近阵地", "Z05", 330, "front"],
  ["B08", "低姿换枪眼，压制机枪", "Z05", 380, "machineGun"],
  ["B09", "听掷弹筒发射声，离开旧枪眼", "Z05", 425, "mortar"],
  ["B10", "封锁西侧铁路涵洞", "Z05", 465, "culvert"],
  ["B11", "换弹补给，查看伤员", "Z04", 510, "wounded"],
  ["B12", "到交通壕后送队集合点", "Z04", 565, "volunteer"],
  ["B13", "沿交通壕、村口原路向南护送", "Z06", 600, "escort"],
  ["B14", "侧绕残屋，压制道路机枪再回担架队", "Z07", 740, "ambush"],
  ["B15", "检查伤员，补充弹药后继续前进", "Z08", 910, "regroup"],
  ["B16", "观察铁路上方，护送队伍通过道路", "Z08", 980, "railPass"],
  ["B17", "看清飞机转向，寻找路沟", "Z08", 1030, "crowdTurn"],
  ["B18", "接住担架后端", "Z08", 1100, "stretcher"],
  ["B19", "扑入路沟", "Z08", 1140, "dive"],
  ["B20", "守住沟边，阻止日军接近伤员", "Z08", 1185, "closeFight"],
  ["B21", "清除近处敌人，尝试打开南路", "Z09", 1250, "southFight"],
  ["B22", "观察南侧截断线", "Z09", 1370, "southCut"],
  ["B23", "掩护后送队沿回撤沟道退回阵地", "Z10", 1395, "retreat"],
  ["B24", "把伤员抬入掩蔽部", "Z04", 1500, "regrip"],
  ["B25", "第一关结束", "Z04", 1550, "complete"],
].map(([id, objective, zone, targetStartS, action]) => Object.freeze({ id, objective, zone, targetStartS, action })));

/** 每波只引入一种主压力，数量有限；死亡不返还预算。 */
export const P012_WAVES = Object.freeze([
  { beat: 6, atS: 285, count: 2, kind: "scouts", lane: "centerEnemy" },
  { beat: 7, atS: 330, count: 5, kind: "rifles", lane: "centerEnemy" },
  { beat: 8, atS: 380, count: 2, kind: "machineGun", lane: "eastEnemy" },
  { beat: 9, atS: 425, count: 2, kind: "mortar", lane: "eastEnemy" },
  { beat: 10, atS: 465, count: 4, kind: "culvert", lane: "westEnemy" },
  { beat: 14, atS: 740, count: 6, kind: "ambush", lane: "ambush" },
  { beat: 20, atS: 1185, count: 6, kind: "closeFight", lane: "closeFight" },
  { beat: 21, atS: 1250, count: 6, kind: "southFight", lane: "southFight" },
].map(Object.freeze));

export class FirstLevelP012Director {
  constructor(host = {}, config = {}) {
    this.host = host;
    this.config = config;
    this.beat = 0;
    this.elapsed = 0;
    this.enteredAt = 0;
    this.facts = new Set();
    this.signals = new Set();
    this.visits = [];
    this.travelM = 0;
    this.sprintM = 0;
    this.airSprintM = 0;
    this.ambushEntryIndex = 0;
    this.closePressureReleased = false;
    this.lookRad = 0;
    this.last = null;
    this.gunports = new Set();
    this.unlockedWaves = [];
    this.enemyRoutes = [];
    this.pendingEnemies = [];
    this.spawnedTotal = 0;
    this.lastWaveAt = -1e9;
    this.pressureHistory = [];
    this.stageVisits = [];
    this.retreatPoint = 0;
    this.checkpoints = [];
    this.checkpointId = null;
    this.history = [];
    this.action = P012_BEATS[0].objective;
    this.lastSample = {};
    this.routeIndex = 0;
    this.orientationIndex = 0;
    this.observationTime = 0;
    this.mortarImpactStart = 0;
    this.shellObservationTime = 0;
    this.shellImpactStart = 0;
    this.shellTarget = null;
    this.cleanupWeaponStart = 0;
    this.frontlineAmmoRemaining = config.activities?.frontlineAmmo?.stockClips ?? 12;
    this.frontlineAmmoDispensed = 0;
    this.supplyReceipts = new Set();
    this.southGrenadesRemaining = config.activities?.southGrenadeStock ?? 2;
    this.grenadeStart = 0;
    this.completionReasons = {};
    this.mortarEscapeFrom = null;
    this.carryTravelM = 0;
    this.weaponActionStart = 0;
    this.guideStarted = false;
    this.retreatCovers = [];
    this.InstallInteractions();
  }

  Point(name, fallback) { return this.config.anchors?.[name] || fallback; }
  Mark(name) { this.facts.add(name); return true; }
  Emit(name) {
    if (this.signals.has(name)) return false;
    this.signals.add(name);
    this.host.Signal?.(name);
    return true;
  }
  Signalled(name) { return this.signals.has(name) || !!this.host.Signalled?.(name); }
  SupplyOnce(fact) {
    this.Mark(fact);
    if (this.supplyReceipts.has(fact)) return false;
    this.supplyReceipts.add(fact); this.host.CheckWeapon?.(); return true;
  }
  FrontlineAmmoLabel() {
    return this.frontlineAmmoRemaining > 0
      ? `领取桥夹 · 箱内剩 ${this.frontlineAmmoRemaining}/${this.config.activities?.frontlineAmmo?.stockClips ?? 12}`
      : "弹药箱已空";
  }
  ActivityRoute() {
    const a = this.config.activities || {};
    return ({ 0: a.trainRoute, 2: a.villageRoute, 4: a.shellCoverRoute,
      5: a.ammoRoute, 11: a.woundedDragRoute, 12: [a.woundedDragTo || this.config.anchors.shelter], 14: this.config.routes?.flank,
      16: a.airRoadRoute, 17: a.airCoverRoute,
      18: a.stretcherCarryRoute, 20: a.closeFightRoute, 21: a.southRoomRoute, 22: a.southAssemblyRoute })[this.beat] || [];
  }
  StartGuide() {
    this.guideStarted = true;
    this.host.Guide?.({ beat: this.beat, route: this.ActivityRoute(),
      ...(this.beat === 11 ? { route: this.config.activities.woundedGuideRoute, startIndex: 0 } : {}),
      ...([14, 16, 17, 20, 21, 22].includes(this.beat) ? { route: [] } : {}),
      ...(this.beat === 4 ? { startIndex: 0, WaitAt: (index) => this.routeIndex <= index } : {}),
      ...(this.beat === 12 ? { startIndex: 0, WaitAt: () => this.beat === 12 } : {}),
      speed: this.config.activities?.guideSpeedByBeat?.[this.beat] || this.config.activities?.guideSpeedMps || 1.3 });
  }

  InstallInteractions() {
    const Register = (spec) => this.host.Register?.(spec);
    Register({ id: "p012_weaponCheck", kind: "supply", label: "领取步枪，前往弹药分发点",
      gesture: "hold", seconds: 2.4, position: this.Point("weaponCheck", { x: -55, z: 44 }),
      Enabled: () => this.beat <= 3, once: false,
      OnComplete: () => { this.Mark("weapon"); this.Emit("P012WeaponReceived"); } });
    Register({ id: "p012_ammoIssue", kind: "supply", label: "领取子弹，再到旁边检查步枪",
      gesture: "hold", seconds: 1.8, position: this.config.activities?.weaponIssuePosition,
      Enabled: () => this.beat === 1 && this.facts.has("weapon") && !this.facts.has("issuedAmmo"), once: false,
      OnComplete: () => { this.Mark("issuedAmmo"); this.Emit("P012AmmoIssued"); this.weaponActionStart = this.lastSample.weaponActionCount || 0; this.host.CheckWeapon?.(); } });
    Register({ id: "p012_hubSupply", kind: "supply", label: "补充弹药，观察铁路方向",
      gesture: "hold", seconds: 1.8, position: this.Point("supplyPoint", { x: 5, z: 5 }),
      Enabled: () => this.beat === 3 && !this.supplyReceipts.has("supply"), once: false,
      OnComplete: () => this.SupplyOnce("supply") });
    Register({ id: "p012_woundedCheck", kind: "bandage", label: "查看伤员，整理弹药并补充1包绷带",
      gesture: "hold", seconds: 2.2, position: this.config.activities?.woundedDragFrom || this.Point("shelter", { x: -7, z: -52 }),
      Enabled: () => this.beat === 11 && !this.supplyReceipts.has("wounded"), once: false,
      OnComplete: () => { const issued = this.SupplyOnce("wounded"); if (issued) this.host.GiveBandages?.(1);
        this.Emit("P012WoundedChecked"); return issued; } });
    Register({ id: "p012_volunteer", kind: "supply", label: "向罗班长主动申请护送伤员",
      gesture: "hold", seconds: 1.5, position: this.config.activities.woundedDragTo,
      Enabled: () => this.beat === 12 && this.lastSample.guideAlive === true
        && Distance(this.lastSample.guidePosition, this.config.activities.woundedDragTo) < 3, once: false,
      OnComplete: () => { this.Mark("volunteer"); this.Emit("EscortCall"); } });
    Register({ id: "p012_roadSupply", kind: "supply", label: "检查担架并补充弹药",
      gesture: "hold", seconds: 2.2, position: this.Point("stretcher", { x: 45, z: 26 }),
      Enabled: () => this.beat === 15 && !this.supplyReceipts.has("regroup"), once: false,
      OnComplete: () => this.SupplyOnce("regroup") });
    Register({ id: "p012_frontlineAmmo", kind: "supply", label: this.FrontlineAmmoLabel(),
      gesture: "hold", seconds: this.config.activities?.frontlineAmmo?.takeSeconds ?? 2.4,
      position: this.Point("ammoDrop"), once: false,
      Enabled: () => this.beat >= 6 && this.beat <= 10 && this.facts.has("ammo"),
      OnBegin: (ctx) => { if (ctx?.point) ctx.point.label = this.FrontlineAmmoLabel(); },
      OnComplete: (ctx) => {
        const current = Math.max(0, Number(this.host.CurrentClips?.() ?? this.lastSample.clips) || 0);
        const request = Math.min(this.frontlineAmmoRemaining,
          Math.max(0, (this.config.activities?.frontlineAmmo?.carryCapClips ?? 4) - current));
        if (request <= 0) return false;
        const actual = Math.max(0, Math.min(request, Math.floor(Number(this.host.GiveClips?.(request)) || 0)));
        this.frontlineAmmoRemaining -= actual; this.frontlineAmmoDispensed += actual;
        if (ctx?.point) ctx.point.label = this.FrontlineAmmoLabel();
        return actual > 0;
      } });
    Register({ id: "p012_roadWounded", kind: "bandage", label: "检查前方担架伤员",
      gesture: "hold", seconds: 2.2, Anchor: () => this.lastSample.roadWoundedPosition,
      Enabled: () => this.beat === 15 && this.lastSample.roadWoundedAtInspection === true
        && !!this.lastSample.roadWoundedPosition && !this.facts.has("roadWounded"), once: false,
      OnComplete: () => {
        if (this.beat !== 15 || this.lastSample.roadWoundedAtInspection !== true || !this.lastSample.roadWoundedPosition) return false;
        this.Mark("roadWounded"); this.Emit("P012RoadWoundedChecked"); return true;
      } });
    Register({ id: "p012_southGrenades", kind: "supply", label: "领取手榴弹 · 备用2枚",
      gesture: "hold", seconds: 1.8, position: this.config.activities?.southGrenadeSupply,
      Enabled: () => this.beat === 21 && this.southGrenadesRemaining > 0 && !(this.lastSample.grenades > 0), once: false,
      OnComplete: (ctx) => {
        const actual = Math.max(0, Math.min(this.southGrenadesRemaining,
          Math.floor(Number(this.host.GiveGrenades?.(this.southGrenadesRemaining)) || 0)));
        this.southGrenadesRemaining -= actual;
        if (ctx?.point) ctx.point.label = `领取手榴弹 · 备用${this.southGrenadesRemaining}枚`;
        return actual > 0;
      } });
    Register({ id: "p012_retreatSmoke", kind: "supply", label: "点燃烟幕，遮断南路火线",
      gesture: "hold", seconds: 1.8, position: this.config.activities?.retreatSmokeUse,
      Enabled: () => this.beat === 23 && !this.facts.has("retreatSmokeDeployed"), once: false,
      OnComplete: () => {
        if (!this.host.DeployRetreatSmoke?.(this.config.activities?.retreatSmokeAt)) return false;
        this.Mark("retreatSmokeDeployed"); return true;
      } });
    const carry = this.host.Carry?.();
    Register({ ...PickUpLoadInteraction({ id: "p012_ammoPickup", kindId: "ammoCrate", carry,
      position: this.Point("ammoPickup", { x: -7, z: -52 }), label: "抬起机枪弹药箱",
      once: false,
      options: { label: "机枪弹药箱", payload: { to: "p012Mg" } } }),
      Enabled: () => this.beat === 5 && !carry?.Active });
    Register(GiveSupplyInteraction({ id: "p012_ammoDrop", item: "弹药箱",
      position: this.Point("ammoDrop", { x: 5, z: -65 }), label: "把弹药送到机枪阵位",
      Has: () => this.beat === 5 && carry?.KindId === "ammoCrate" && this.routeIndex >= this.ActivityRoute().length, once: false,
      OnComplete: () => {
        carry?.ForceRelease("delivered");
        if (!carry?.Active) this.Mark("ammo");
      } }));
  }

  RouteArrivalRadius() {
    const activity = this.config.activities || {};
    return this.beat === 14 ? (activity.ambushRouteRadiusM || 0.6) : (activity.routeRadiusM || 3);
  }

  RetreatRouteProjection(position) {
    const points = this.config.routes?.retreat || [];
    let nearest = null, along = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index], b = points[index + 1], dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (length * length)));
      const point = { x: a.x + dx * t, z: a.z + dz * t }, distance = Distance(position, point);
      if (!nearest || distance < nearest.distance) nearest = { point, distance, along: along + length * t };
      along += length;
    }
    return nearest;
  }

  RetreatRejoinTarget(column = this.lastSample.columnPosition) {
    const player = this.lastSample.position;
    if (!player || !column) return null;
    const from = this.RetreatRouteProjection(player), to = this.RetreatRouteProjection(column);
    if (!from || !to) return column;
    let along = 0;
    const vertices = (this.config.routes?.retreat || []).map((point, index, points) => {
      if (index) along += Distance(points[index - 1], point);
      return { point, along };
    });
    const forward = to.along >= from.along;
    const candidates = vertices.filter((vertex) => forward
      ? vertex.along > from.along + 0.6 && vertex.along < to.along
      : vertex.along < from.along - 0.6 && vertex.along > to.along);
    return (forward ? candidates[0] : candidates.at(-1))?.point || to.point;
  }

  RetreatLeadTarget(target) {
    if (this.lastSample.lastLitterArrived) return null;
    const column = this.lastSample.columnPosition;
    if (!column || !target) return null;
    const projection = this.RetreatRouteProjection(column), destination = this.RetreatRouteProjection(target);
    if (!projection || !destination || destination.along <= projection.along + 10) return null;
    const points = this.config.routes.retreat;
    let remaining = projection.along + 10;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1], b = points[index], length = Distance(a, b);
      if (remaining <= length) return { x: a.x + (b.x - a.x) * remaining / length,
        z: a.z + (b.z - a.z) * remaining / length };
      remaining -= length;
    }
    return points.at(-1);
  }

  AmbushThreat() {
    if (this.beat !== 14) return null;
    for (const [index, group] of (this.config.activities?.ambushGroups || []).entries()) {
      if (this.routeIndex < group.routeIndex) continue;
      const living = this.enemyRoutes.filter((entry) => entry.ambushGroup === index
        && this.host.EnemyPosition?.(entry.handle));
      const pending = this.pendingEnemies.some((entry) => entry.ambushGroup === index);
      if (living.length || pending) return { ...group, index, lookAt: living.length
        ? this.host.EnemyPosition(living[0].handle) : group.positions[0] };
    }
    return null;
  }

  LateThreat() {
    const groups = this.beat === 20 ? this.config.activities?.closeFightGroups
      : this.beat === 21 ? this.config.activities?.southFightGroups : null;
    for (const [index, group] of (groups || []).entries()) {
      if (this.routeIndex < group.routeIndex) continue;
      const living = this.enemyRoutes.filter((entry) => entry.encounterBeat === this.beat
        && entry.encounterGroup === index && this.host.EnemyPosition?.(entry.handle));
      const pending = this.pendingEnemies.some((entry) => entry.encounterBeat === this.beat && entry.encounterGroup === index);
      if (living.length || pending) return { ...group, index, lookAt: living.length
        ? this.host.EnemyPosition(living[0].handle) : group.positions[0] };
    }
    return null;
  }

  StepEnemyBound(route, player) {
    if (!route.relocation || route.index < route.points.length) return;
    const actor = this.host.EnemyPosition?.(route.handle);
    if (!actor) return;
    const partner = this.enemyRoutes.find((entry) => entry !== route && entry.encounterBeat === route.encounterBeat
      && entry.encounterGroup === route.encounterGroup);
    const partnerAlive = partner && this.host.EnemyPosition?.(partner.handle);
    const partnerCombat = partnerAlive ? this.host.EnemyCombatState?.(partner.handle) : null;
    if (!route.bound) route.bound = { phase: "cover", player: player ? { ...player } : null,
      partnerFire: partnerCombat?.lastFire ?? null };
    const bound = route.bound;
    if (bound.phase === "moving") {
      if (Distance(actor, route.relocation) <= 0.7) bound.phase = "settled";
      else this.host.EnemyGoal?.(route.handle, route.relocation, 0.6);
      return;
    }
    if (bound.phase === "settled") return;
    const combat = this.host.EnemyCombatState?.(route.handle);
    const partnerReady = partnerAlive && partner.index >= partner.points.length;
    const reason = !partnerAlive && partner ? "partnerLost"
      : combat?.suppression > 0.3 ? "suppressed"
      : player && bound.player && Distance(player, bound.player) >= 3 ? "playerRepositioned"
      : route.encounterSlot === 1 && partnerReady && Number.isFinite(partnerCombat?.lastFire)
        && partnerCombat.lastFire > (bound.partnerFire ?? partnerCombat.lastFire) ? "coverFire"
      : route.encounterSlot === 0 && partner?.bound?.phase === "settled" ? "partnerSettled" : null;
    if (!reason) return;
    bound.phase = "moving"; bound.reason = reason;
    this.host.EnemyGoal?.(route.handle, route.relocation, 0.6);
    this.Emit(`P012Bound${route.encounterBeat}_${route.encounterGroup}_${route.encounterSlot}`);
  }

  SaveCheckpoint(id) {
    if (this.checkpointId === id) return;
    this.checkpointId = id;
    this.checkpoints.push({ id, at: this.elapsed, beat: this.beat });
    this.host.Checkpoint?.(id, this.Snapshot());
  }

  Enter(next) {
    this.history.push({ beat: P012_BEATS[this.beat].id, at: this.elapsed,
      ...(this.completionReasons[this.beat] ? { reason: this.completionReasons[this.beat] } : {}) });
    this.beat = next;
    this.enteredAt = this.elapsed;
    this.stageVisits = [];
    this.routeIndex = 0;
    this.guideStarted = false;
    if (next === 24) this.carryTravelM = 0;
    if (next === 16) this.airSprintM = 0;
    if (next === 9) { this.mortarImpactStart = this.lastSample.mortarImpactCount || 0;
      this.mortarEscapeFrom = null; }
    if (next === 11) this.cleanupWeaponStart = this.lastSample.weaponActionCount || 0;
    if (next === 21) { this.grenadeStart = this.lastSample.grenadeThrows || 0; this.Emit("P012DitchClear"); }
    this.action = P012_BEATS[next].objective;
    this.host.Objective?.(this.action);
    if (next === 2) this.SaveCheckpoint("CP00");
    if (next === 5) this.SaveCheckpoint("CP01");
    if (next === 5) this.Emit("P012AmmoTask");
    if (next === 11) this.SaveCheckpoint("CP02");
    const contentEvents = { 11: "AtVillage", 13: "AtCulvert", 14: "AtSouthRoad", 16: "AtDitch", 23: "AtFallback" };
    if (contentEvents[next]) this.Emit(contentEvents[next]);
    if (next === 14) { this.Emit("P012AmbushStarted"); this.SaveCheckpoint("CP03"); }
    if (next === 15) this.Emit("P012AmbushClear");
    if (next === 17) { this.Emit("P012CrowdReady"); this.Emit("P012SeekAirCover"); }
    if (next === 20) this.SaveCheckpoint("CP05");
    if (next === 22) this.Emit("P012SouthVerified");
    if (next === 23) { this.SaveCheckpoint("CP06"); this.Emit("SouthCut"); }
    if (next === 24) { this.SaveCheckpoint("CP07"); this.Emit("P012RegripReady"); }
    if (next === 25) this.Emit("P012Complete");
  }

  Update(dt, sample = {}) {
    this.elapsed += Math.max(0, dt);
    this.lastSample = sample;
    const p = sample.position;
    const activity = this.config.activities || {};
    if (this.beat === 9 && this.unlockedWaves.includes(3) && sample.mortarWarningActive && sample.mortarWarningPosition)
      this.mortarEscapeFrom = { ...sample.mortarWarningPosition };
    if (this.beat === 0) this.Emit("P012Arrival");
    if (!this.guideStarted) this.StartGuide();
    if (this.last && p) {
      const moved = Math.min(3, Distance(p, this.last.position));
      this.travelM += moved;
      if (this.beat === 24 && sample.carryKind === "stretcher" && this.last.carryKind === "stretcher") this.carryTravelM += moved;
      if (sample.sprint > 0.5) this.sprintM += moved;
      if (this.beat === 16 && sample.sprint > 0.5) this.airSprintM += moved;
      const delta = Math.atan2(Math.sin((sample.yaw || 0) - this.last.yaw), Math.cos((sample.yaw || 0) - this.last.yaw));
      if (this.beat === 3) this.lookRad += Math.abs(delta);
    }
    if (p) this.last = { position: { x: p.x, z: p.z }, yaw: sample.yaw || 0, carryKind: sample.carryKind };
    const route = this.ActivityRoute();
    if (this.beat === 14 && Distance(p, activity.ambushEntryRoute?.[this.ambushEntryIndex]) <= this.RouteArrivalRadius())
      this.ambushEntryIndex += 1;
    const guideNear = Distance(p, sample.guidePosition) <= (activity.guideRangeM || 12);
    // Follow goals belong to the moving guide, not invisible circles left behind him.
    // The actor advances its target within 2m; a player following 1–2m behind can
    // legitimately never enter a 3m circle. Consume only guide-traversed segments
    // while physically accompanying him, and separately acknowledge his last stop.
    if ([0, 2].includes(this.beat) && Distance(p, sample.guidePosition) <= 4
      && Number.isInteger(sample.guideRouteIndex)) {
      const passed = Math.min(route.length - 1, Math.max(0, sample.guideRouteIndex));
      this.routeIndex = Math.max(this.routeIndex, passed);
      if (passed === route.length - 1 && Distance(sample.guidePosition, route.at(-1)) <= 2.5)
        this.routeIndex = route.length;
    }
    const routeAllowed = this.beat === 0 || this.beat === 2 ? guideNear
      : this.beat === 4 ? sample.stance === "crouch"
      : this.beat === 5 ? sample.carryKind === "ammoCrate" && sample.stance === "crouch"
      : this.beat === 11 ? sample.carryKind === "wounded"
      : this.beat === 14 ? !this.AmbushThreat()
      : this.beat === 16 ? Distance(p, sample.columnPosition) < 12
      : this.beat === 17 ? this.routeIndex < route.length - 1 || sample.stance !== "stand"
      : this.beat === 18 ? sample.carryKind === "stretcher"
      : this.beat === 20 ? !this.LateThreat()
      : this.beat === 21 ? this.routeIndex < (activity.southSupplyRouteIndex || 0)
        || (!this.LateThreat() && (this.facts.has("southGrenadeThrown") || (!(sample.grenades > 0) && this.southGrenadesRemaining === 0))) : true;
    if (routeAllowed && Distance(p, route[this.routeIndex]) <= this.RouteArrivalRadius()) {
      const reachedPoint = route[this.routeIndex];
      if (this.beat === 4) {
        if (!this.shellTarget) {
          this.shellTarget = { x: reachedPoint.x - 7, z: reachedPoint.z - 3 };
          this.shellImpactStart = sample.mortarImpactCount || 0;
          this.Emit("P012Shelling"); this.host.Shelling?.(this.shellTarget);
        }
        const desired = Math.atan2(-(this.shellTarget.x - p.x), -(this.shellTarget.z - p.z));
        const delta = Math.atan2(Math.sin((sample.yaw || 0) - desired), Math.cos((sample.yaw || 0) - desired));
        const observed = this.facts.has(`shellObserved${this.routeIndex}`);
        if (!observed && Math.abs(delta) < 0.65 && sample.mortarImpactCount > this.shellImpactStart)
          this.shellObservationTime += Math.max(0, dt);
        else if (!observed) this.shellObservationTime = 0;
        if (this.shellObservationTime >= (activity.shellObservationSeconds || 3)) this.Mark(`shellObserved${this.routeIndex}`);
        if (this.shellObservationTime >= (activity.shellObservationSeconds || 3)
          && Distance(sample.guidePosition, reachedPoint) < (activity.shellGuideRangeM || 6)) {
          this.Mark(`shellCover${this.routeIndex}`); this.routeIndex += 1;
          this.shellTarget = null; this.shellObservationTime = 0;
        }
      } else this.routeIndex += 1;
    } else if (this.beat === 4 && !this.facts.has(`shellObserved${this.routeIndex}`)) this.shellObservationTime = 0;
    if (this.beat === 0 && this.routeIndex >= 2 && guideNear) this.Emit("P012TrainDoor");
    if (this.beat === 3 && this.facts.has("supply")) {
      const observation = activity.orientations?.[this.orientationIndex];
      if (observation?.via && Distance(p, observation.via) <= (activity.routeRadiusM || 3)) this.Mark(`orientationVia${this.orientationIndex}`);
      const arrivedVia = !observation?.via || this.facts.has(`orientationVia${this.orientationIndex}`);
      if (observation && arrivedVia && Distance(p, observation.position) <= (activity.routeRadiusM || 3)) {
        const desired = Math.atan2(-(observation.lookAt.x - p.x), -(observation.lookAt.z - p.z));
        const delta = Math.atan2(Math.sin((sample.yaw || 0) - desired), Math.cos((sample.yaw || 0) - desired));
        if (Math.abs(delta) <= (activity.observationConeRad || 0.42)) {
          this.observationTime += Math.max(0, dt);
          if (this.observationTime >= (activity.observationSeconds || 2)) { this.orientationIndex += 1; this.observationTime = 0; }
        } else this.observationTime = 0;
      } else this.observationTime = 0;
    }
    if (this.beat === 23) {
      const returnRoute = this.config.routes?.retreat || [];
      const gap = Distance(p, sample.columnPosition);
      if (sample.lastLitterArrived) this.retreatRejoining = false;
      else if (sample.columnPosition && gap > (activity.retreatRejoinEnterM || 20)) this.retreatRejoining = true;
      else if (gap < (activity.retreatRejoinExitM || 10)) this.retreatRejoining = false;
      const needsCover = (activity.retreatCoverIndices || []).includes(this.retreatPoint);
      const coversColumn = Distance(p, sample.columnPosition) < 24 && sample.stance !== "stand";
      if (!this.retreatRejoining && Distance(p, returnRoute[this.retreatPoint]) < 6 && (!needsCover || coversColumn)) {
        if (needsCover && !this.retreatCovers.includes(this.retreatPoint)) {
          this.retreatCovers.push(this.retreatPoint);
          this.Emit(`P012RetreatCover${(activity.retreatCoverIndices || []).indexOf(this.retreatPoint)}`);
          if (Number(sample.clips) === 0 && Number(sample.ammo) === 0) this.Emit("P012RetreatAmmoLow");
        }
        if (Distance(returnRoute[this.retreatPoint], { x: 0, z: 0 }) < 1) this.Emit("P012HubRevisited");
        if (this.retreatPoint < returnRoute.length - 1) this.retreatPoint += 1;
      }
    }
    const zone = sample.zone;
    if (this.beat === 21 && sample.grenadeThrows > this.grenadeStart) this.Mark("southGrenadeThrown");
    if (this.beat === 21 && Distance(p, activity.southRoom) < 3) this.Mark("southRoomEntered");
    if (this.beat === 23 && this.facts.has("retreatSmokeDeployed") && sample.retreatSmokeActive) this.Mark("retreatSmokeObserved");
    if (this.beat === 23 && sample.lastLitterArrived) this.Emit("P012LastLitterArrived");
    if (zone && this.visits[this.visits.length - 1] !== zone) this.visits.push(zone);
    if (zone && this.stageVisits[this.stageVisits.length - 1] !== zone) this.stageVisits.push(zone);
    if (this.beat === 4 && sample.stance === "crouch") this.Mark("crouch");
    for (const [index, port] of (this.config.anchors?.gunports || []).entries()) {
      if (Distance(p, port) < 6) this.gunports.add(index);
    }
    // 最早首枪窗口 + 每波有限预算。门由 beat 和现场事实共同开，不按时间无限补兵。
    const closeWaveIndex = P012_WAVES.findIndex((wave) => wave.kind === "closeFight");
    if (this.beat >= 18 && this.beat < 20 && this.Signalled("P012StretcherLifted")
      && !this.unlockedWaves.includes(closeWaveIndex)) {
      this.unlockedWaves.push(closeWaveIndex);
      this.SpawnWave(P012_WAVES[closeWaveIndex], closeWaveIndex);
      this.Emit("P012CloseEnemiesStaged");
    }
    if (this.Signalled("P012CloseEnemiesStaged") && this.Signalled("P012DiveApproach") && !this.closePressureReleased) {
      this.closePressureReleased = true;
      this.pressureHistory.push({ kind: "closeFight", at: this.elapsed, interval: this.elapsed - this.lastWaveAt,
        mechanism: "groundReleaseOnDive", reason: "actualDiveApproach" });
      this.lastWaveAt = this.elapsed;
      this.host.Pressure?.(P012_WAVES[closeWaveIndex]);
    }
    for (const [index, wave] of P012_WAVES.entries()) {
      // Scouts may call same-axis rifle reinforcements immediately. New MG,
      // mortar and culvert pressure keeps a 30s floor; existing gunport movement
      // remains active during this transition, not a stationary wait objective.
      const previousGroupClear = this.pendingEnemies.length === 0
        && this.enemyRoutes.every((entry) => !this.host.EnemyPosition?.(entry.handle));
      const interval = this.elapsed - this.lastWaveAt;
      const newTacticalPressure = index >= 2 && index <= 4;
      const clearReady = previousGroupClear && (!newTacticalPressure || interval >= 30);
      if (this.beat >= wave.beat && (interval >= 40 || clearReady)
        && !this.unlockedWaves.includes(index)) {
        this.unlockedWaves.push(index);
        this.pressureHistory.push({ kind: wave.kind, at: this.elapsed,
          interval: Number.isFinite(this.lastWaveAt) && this.lastWaveAt > 0 ? this.elapsed - this.lastWaveAt : null,
          previousGroupClear,
          mechanism: index === 0 ? "initialContact" : index === 1 ? "sameAxisReinforcement"
            : newTacticalPressure ? "newTacticalPressure" : "lateEncounter",
          reason: interval >= 40 ? "normal40" : newTacticalPressure ? "clearMinimum30"
            : index === 1 ? "clearReinforcement" : "clearReady" });
        this.lastWaveAt = this.elapsed;
        if (wave.kind === "mortar") {
          this.mortarImpactStart = sample.mortarImpactCount || 0;
          this.mortarEscapeFrom = p ? { x: p.x, z: p.z } : null;
          this.Emit("P012MortarUnlocked");
        }
        this.host.Pressure?.(wave);
        this.SpawnWave(wave, index);
      }
    }
    for (const route of this.enemyRoutes) {
      const point = this.host.EnemyPosition?.(route.handle);
      if (!point) continue;
      if (route.staging && this.closePressureReleased) {
        route.staging = false; this.host.EnemyStaging?.(route.handle, false);
      }
      if (route.staging && route.index > route.stagingStopIndex) {
        this.host.EnemyGoal?.(route.handle, route.stagingStopIndex < 0 ? route.spawnPoint : route.points[route.stagingStopIndex], 0.6);
        continue;
      }
      if (route.index >= route.points.length) { this.StepEnemyBound(route, p); continue; }
      if (Distance(point, route.points[route.index]) < (route.relocation ? 0.6 : 2)) route.index += 1;
      if (route.staging && route.index > route.stagingStopIndex) continue;
      const goal = route.points[route.index];
      if (goal) this.host.EnemyGoal?.(route.handle, goal, route.relocation ? 0.6 : undefined);
      else this.StepEnemyBound(route, p);
    }
    this.SpawnPending();
    const dead = Number(sample.nearEnemyDeaths ?? sample.enemyDeaths) || 0;
    const Has = (fact) => this.facts.has(fact);
    const At = (id) => zone === id;
    const Followed = (ids) => {
      let cursor = 0;
      for (const visited of this.stageVisits) if (visited === ids[cursor]) cursor += 1;
      return cursor === ids.length;
    };
    let ready = false;
    switch (this.beat) {
      case 0: ready = this.routeIndex >= route.length && this.Signalled("P012TrainDoor"); break;
      case 1: ready = Has("weapon") && Has("issuedAmmo") && sample.weaponActionCount > this.weaponActionStart
        && Distance(p, activity.weaponInspectPosition) <= (activity.routeRadiusM || 3); break;
      case 2: ready = this.routeIndex >= route.length && sample.trafficReady; break;
      case 3: ready = Has("supply") && this.orientationIndex >= (activity.orientations?.length || 3); break;
      case 4: ready = At("Z04") && this.routeIndex >= route.length && Has("crouch") && this.sprintM >= 4; break;
      case 5: ready = Has("ammo") && this.gunports.size > 0; break;
      case 6: ready = dead >= 2 || (this.unlockedWaves.includes(0) && sample.scoutAlarm); break;
      case 7: ready = dead >= 7; break;
      case 8: {
        const cleared = sample.enemyMgDestroyed && this.pendingEnemies.length === 0
          && this.enemyRoutes.every((entry) => !this.host.EnemyPosition?.(entry.handle));
        ready = dead >= 9 && this.gunports.size >= 2 && (sample.friendlyMgFiredAfterSuppression || cleared);
        if (ready) this.completionReasons[8] = sample.friendlyMgFiredAfterSuppression ? "friendlyMgResumed" : "threatCleared";
        break;
      }
      case 9: ready = this.unlockedWaves.includes(3) && dead >= 11 && sample.stance !== "stand"
        && sample.mortarImpactCount > this.mortarImpactStart && Distance(p, sample.mortarImpactPosition) >= 6; break;
      case 10: ready = dead >= 15; break;
      case 11: ready = Has("wounded") && sample.woundedDragDelivered
        && sample.woundedDragDistance >= (activity.woundedDragMinM || 10)
        && this.routeIndex >= route.length && sample.weaponActionCount > this.cleanupWeaponStart; break;
      case 12: ready = Has("volunteer"); break;
      case 13: ready = At("Z06") && Followed(["Z04", "Z03", "Z02", "Z06"])
        && sample.columnAtEscortEnd && Distance(p, sample.columnPosition) < 18; break;
      case 14:
        {
          const roadActors = this.enemyRoutes.filter((entry) => entry.ambushGroup === 0);
          if (roadActors.length === 2 && roadActors.every((entry) => !this.host.EnemyPosition?.(entry.handle))
            && !this.pendingEnemies.some((entry) => entry.ambushGroup === 0)) this.Emit("P012RoadGunSilenced");
        }
        if (Distance(p, this.config.activities?.ambushGroups?.[2]?.cover || { x: 72, z: 43 }) < 7) this.Mark("flanked");
        ready = dead >= 21 && Has("flanked") && this.ambushEntryIndex >= (activity.ambushEntryRoute?.length || 0) && this.routeIndex >= route.length
          && Distance(p, sample.columnPosition) < 18; break;
      case 15: ready = Has("regroup") && Has("roadWounded") && Distance(p, sample.columnPosition) < 12; break;
      case 16:
        if (sample.airColumnEnteredRoad === true && this.airSprintM >= (activity.airRoadSprintMinM || 4)
          && Distance(p, sample.columnPosition) < 12 && !this.Signalled("P012AirReady")) {
          this.SaveCheckpoint("CP04"); this.Emit("P012AirReady");
        }
        ready = this.Signalled("P012AirReady") && this.Signalled("P012RailComplete"); break;
      case 17: ready = this.Signalled("P012CrowdFire") && this.routeIndex >= route.length
        && sample.stance !== "stand"; break;
      case 18: ready = sample.carryKind === "stretcher" && sample.carryDistance >= (activity.stretcherCarryMinM || 10)
        && this.routeIndex >= route.length && Distance(p, activity.stretcherCarryTo) < 3;
        if (ready) this.Emit("P012CarryReady"); break;
      case 19: ready = this.Signalled("P012Dived") && sample.stance !== "stand"; break;
      case 20: ready = dead >= 27; break;
      case 21: ready = dead >= 33 && At("Z09") && Has("southRoomEntered")
        && this.routeIndex >= route.length
        && (Has("southGrenadeThrown") || (!(sample.grenades > 0) && this.southGrenadesRemaining === 0)); break;
      case 22: {
        const cleared = sample.farSpawned === 4 && sample.farDeaths === 4;
        ready = At("Z09") && sample.columnAtSouthAssembly === true && this.routeIndex >= route.length
          && ((sample.blockadeVisible && sample.blockadePressure) || cleared);
        if (ready) this.completionReasons[22] = cleared ? "blockadeCleared" : "blockadeObservedFiring";
        break;
      }
      case 23: ready = At("Z04") && sample.columnArrived && sample.lastLitterArrived
        && Has("retreatSmokeObserved")
        && this.retreatPoint >= (this.config.routes?.retreat?.length || 1) - 1
        && this.retreatCovers.length >= (activity.retreatCoverIndices?.length || 0); break;
      case 24: ready = sample.carryKind === "stretcher" && this.carryTravelM >= (activity.finalCarryMinM || 10)
        && Distance(p, this.Point("shelter", { x: -7, z: -52 })) < 3; break;
      default: break;
    }
    if (ready && this.beat < 25) this.Enter(this.beat + 1);
    const currentText = this.CurrentObjective().text;
    if (currentText !== this.action) { this.action = currentText; this.host.Objective?.(currentText); }
    return this.State();
  }

  EnemyBudget() { return this.unlockedWaves.reduce((n, index) => n + P012_WAVES[index].count, 0); }
  SpawnWave(wave, waveIndex) {
    const name = wave.lane === "westEnemy" ? "west" : wave.lane === "eastEnemy" ? "east" : "center";
    const lane = this.config.enemyLanes?.[name];
    const late = wave.beat >= 14;
    const fallback = late ? (wave.beat >= 21 ? this.Point("southGunpoint", { x: 48, z: 107 })
      : this.Point("gunpoint", { x: 58, z: 39 })) : this.Point("scout", { x: 5, z: -113 });
    const source = late ? fallback : lane?.spawn || fallback;
    for (let index = 0; index < wave.count; index += 1) {
      const groups = wave.beat === 20 ? this.config.activities?.closeFightGroups
        : wave.beat === 21 ? this.config.activities?.southFightGroups : null;
      const encounterGroup = groups?.length ? Math.floor(index / 2) : null;
      const encounter = encounterGroup !== null ? groups[encounterGroup] : null;
      const encounterPosition = encounter?.positions[index % 2];
      const encounterSpawn = encounter?.spawns?.[index % 2] || encounterPosition;
      const ambushGroup = wave.kind === "ambush" && this.config.activities?.ambushGroups?.length ? Math.floor(index / 2) : null;
      const ambushPosition = encounterPosition || (ambushGroup !== null ? this.config.activities.ambushGroups[ambushGroup].positions[index % 2] : null);
      const weapon = index === 0 && ["machineGun", "ambush", "southFight"].includes(wave.kind)
        ? "Type11" : "Type38";
      const terminal = wave.kind === "culvert" ? lane?.terminalGoals?.[index] : null;
      const points = encounterPosition ? [...(encounter.approaches?.[index % 2] || encounter.approach || []), encounterPosition]
        : ambushPosition ? [ambushPosition] : late ? [fallback] : terminal ? [...(lane?.waypoints || []).slice(0, -1), terminal]
        : [...(lane?.waypoints || []), lane?.goal || fallback];
      this.pendingEnemies.push({ spec: { x: encounterSpawn?.x ?? ambushPosition?.x ?? source.x, z: encounterSpawn?.z ?? ambushPosition?.z ?? source.z + index * 0.7,
        weapon, p012Near: true, squadId: `P012_${waveIndex}`, order: wave.kind === "scouts" || ambushPosition ? "hold" : "attack" }, points, ambushGroup, encounterGroup, encounterBeat: wave.beat,
        encounterSlot: index % 2, relocation: encounter?.relocations?.[index % 2] || null,
        staging: wave.kind === "closeFight" && this.beat < 20 && !this.closePressureReleased,
        stagingStopIndex: encounter?.stagingStopIndices?.[index % 2] ?? -1 });
    }
    this.SpawnPending();
  }
  SpawnPending() {
    const waiting = [];
    for (const pending of this.pendingEnemies) {
      const handle = this.host.SpawnEnemy?.(pending.spec);
      if (!handle) { waiting.push(pending); continue; }
      this.spawnedTotal += 1;
      this.enemyRoutes.push({ handle, points: pending.points, index: 0, ambushGroup: pending.ambushGroup,
        encounterGroup: pending.encounterGroup, encounterBeat: pending.encounterBeat,
        encounterSlot: pending.encounterSlot, relocation: pending.relocation,
        staging: pending.staging && !this.closePressureReleased, stagingStopIndex: pending.stagingStopIndex,
        spawnPoint: { x: pending.spec.x, z: pending.spec.z } });
      const staged = pending.staging && !this.closePressureReleased;
      if (staged) this.host.EnemyStaging?.(handle, true);
      const initialGoal = staged && pending.stagingStopIndex < 0 ? pending.spec : pending.points[0];
      if (initialGoal) this.host.EnemyGoal?.(handle, initialGoal, pending.relocation ? 0.6 : undefined);
    }
    this.pendingEnemies = waiting;
  }
  CurrentObjective() {
    const beat = P012_BEATS[this.beat];
    const anchors = this.config.anchors || {};
    const activity = this.config.activities || {};
    const route = this.ActivityRoute();
    let target = null;
    let text = beat.objective;
    let lookAt = null;
    let interactionId = null;
    let requiredAction = "move";
    let requiredStance = null;
    let progress = null;
    if ([0, 2, 13].includes(this.beat)) requiredAction = "follow";
    if ([0, 2, 4, 14].includes(this.beat)) target = route[this.routeIndex] || route.at(-1);
    if ([0, 2].includes(this.beat) && this.lastSample.guidePosition) target = this.lastSample.guidePosition;
    if (this.beat === 1) { target = anchors.weaponCheck; interactionId = "p012_weaponCheck"; }
    if (this.beat === 1 && this.facts.has("weapon")) {
      target = this.facts.has("issuedAmmo") ? activity.weaponInspectPosition : activity.weaponIssuePosition;
      text = this.facts.has("issuedAmmo") ? "到检查位按 R 检查步枪并完成装填" : "到弹药桌领取子弹";
      interactionId = this.facts.has("issuedAmmo") ? null : "p012_ammoIssue";
      if (this.facts.has("issuedAmmo")) requiredAction = "reload";
    }
    if (this.beat === 3) {
      const observation = activity.orientations?.[this.orientationIndex];
      target = this.facts.has("supply") ? observation?.position : anchors.supplyPoint;
      interactionId = this.facts.has("supply") ? null : "p012_hubSupply";
      if (this.facts.has("supply") && observation) {
        text = `${observation.label} · 辨认 ${Math.min(activity.observationSeconds, Math.floor(this.observationTime))}/${activity.observationSeconds}秒`;
        lookAt = observation.lookAt; requiredAction = "observe";
        progress = { value: this.observationTime, total: activity.observationSeconds };
      }
      if (this.facts.has("supply") && observation?.via && !this.facts.has(`orientationVia${this.orientationIndex}`)) {
        target = observation.via; requiredAction = "move"; lookAt = null;
      }
    }
    if (this.beat === 4) { text = "冲刺到下一个路沟掩体，蹲下避炮"; if (this.routeIndex >= route.length) target = { x: 0, z: -52 }; }
    if (this.beat === 4 && this.shellTarget) {
      requiredStance = "crouch"; lookAt = this.shellTarget;
      const observed = Math.min(this.shellObservationTime, activity.shellObservationSeconds);
      text = observed >= activity.shellObservationSeconds ? "掩护罗班长通过，保持低姿观察落点"
        : `蹲伏辨认落点 · ${Math.floor(observed)}/${activity.shellObservationSeconds}秒`;
      progress = { value: observed, total: activity.shellObservationSeconds };
      if (observed >= activity.shellObservationSeconds && Distance(this.lastSample.guidePosition, route[this.routeIndex]) >= (activity.shellGuideRangeM || 6)) {
        target = this.lastSample.guidePosition; requiredAction = "follow"; lookAt = null;
        text = "回到小队侧后，掩护罗班长沿路沟前进";
      }
    }
    if (this.beat === 5) target = this.facts.has("ammo") ? anchors.gunports?.[1]
      : this.lastSample.carryKind === "ammoCrate" ? route[this.routeIndex] || anchors.ammoDrop : anchors.ammoPickup;
    if (this.beat === 5 && !this.facts.has("ammo")) interactionId = this.lastSample.carryKind !== "ammoCrate"
      ? "p012_ammoPickup" : this.routeIndex >= route.length ? "p012_ammoDrop" : null;
    if (this.beat === 5 && this.lastSample.carryKind === "ammoCrate") { requiredStance = "crouch"; text = "低姿沿交通壕搬运弹药，送到机枪阵位"; }
    if (this.beat === 8) { target = anchors.gunports?.[2]; text = "低姿移到东侧枪眼，压制村墙边的机枪"; }
    if (this.beat === 9) { target = anchors.gunports?.[1]; text = `${this.completionReasons[8] === "threatCleared" ? "机枪威胁已清除" : "友军机枪已恢复射击"}；听掷弹筒预警，低姿离开旧落点，转移到中央枪眼`; }
    if (this.beat === 10) { target = anchors.gunports?.[0]; text = "转向西侧枪眼，封锁铁路涵洞"; }
    if ([8, 10].includes(this.beat) && Distance(this.lastSample.position, target) > 3) {
      requiredStance = "prone";
      text = `卧倒沿连续胸墙横移，前往${this.beat === 8 ? "东侧" : "西侧"}枪眼`;
    }
    if (this.beat === 9 && this.mortarEscapeFrom) {
      const origin = this.mortarEscapeFrom;
      const mgStatus = this.completionReasons[8] === "threatCleared" ? "机枪威胁已清除；" : "友军机枪已恢复射击；";
      const safePort = [anchors.gunports?.[1], anchors.gunports?.[0], anchors.gunports?.[2]]
        .find((point) => point && Distance(point, origin) >= 8) || anchors.gunports?.[1];
      if (Distance(this.lastSample.position, origin) < 6 && safePort) {
        const length = Distance(origin, safePort) || 1;
        target = { x: origin.x + (safePort.x - origin.x) * Math.min(1, 8 / length),
          z: origin.z + (safePort.z - origin.z) * Math.min(1, 8 / length) };
        requiredAction = "sprint"; requiredStance = "stand";
        text = `${mgStatus}掷弹筒预警！先冲刺离开落点六米，再卧倒换位`;
      } else {
        target = safePort;
        if (Distance(this.lastSample.position, target) > 3
          || Number(this.lastSample.nearEnemyDeaths ?? this.lastSample.enemyDeaths) >= 11) requiredStance = "prone";
        text = `${mgStatus}已离开落点，卧倒沿连续胸墙转移到安全枪眼`;
      }
    }
    if (this.beat === 9 && !this.unlockedWaves.includes(3)) {
      target = anchors.gunports?.[1]; requiredStance = "prone"; requiredAction = "move";
      text = `${this.completionReasons[8] === "threatCleared" ? "机枪威胁已清除" : "友军机枪已恢复射击"}；沿胸墙低姿调整到中央枪眼，必要时装填并留意东侧动静`;
    }
    if (this.beat === 11) { target = activity.woundedDragFrom; interactionId = "p012_woundedCheck"; }
    if (this.beat === 11 && this.facts.has("wounded")) {
      if (!this.lastSample.woundedDragDelivered) {
        const dragging = this.lastSample.carryKind === "wounded";
        target = dragging ? route[this.routeIndex] || activity.woundedDragTo : activity.woundedDragFrom;
        interactionId = dragging ? null : "p012_woundedDrag"; text = "把伤员沿交通壕拖回掩蔽部";
      } else { target = activity.woundedDragTo; interactionId = null; requiredAction = "reload"; text = "安置伤员后重新装填步枪"; }
    }
    if (this.beat === 12) { target = activity.woundedDragTo || anchors.shelter; interactionId = "p012_volunteer"; }
    if (this.beat === 15 && !this.facts.has("regroup")) { target = anchors.stretcher; interactionId = "p012_roadSupply"; }
    if (this.beat === 15 && this.facts.has("regroup") && !this.facts.has("roadWounded")) {
      target = this.lastSample.roadWoundedPosition || this.lastSample.columnPosition;
      interactionId = this.lastSample.roadWoundedAtInspection ? "p012_roadWounded" : null;
      requiredAction = this.lastSample.roadWoundedAtInspection ? "move" : "follow";
      text = this.lastSample.roadWoundedAtInspection ? "检查停靠路旁的担架伤员" : "随担架到检查路段，留意伤员状况";
    }
    if (this.beat === 15 && this.facts.has("regroup") && this.facts.has("roadWounded")) {
      target = this.lastSample.columnPosition; interactionId = null; requiredAction = "follow";
      text = "随担架队推进到扫射道路，沿队伍侧后警戒";
    }
    if (this.beat === 13 || (this.beat === 14 && this.routeIndex >= route.length)) target = this.lastSample.columnPosition;
    if (this.beat === 14) {
      const threat = this.AmbushThreat();
      if (threat) { target = threat.cover; lookAt = threat.lookAt; requiredAction = "fight"; text = threat.label; }
      else { requiredAction = this.routeIndex >= route.length ? "follow" : "move"; }
      const alive = this.enemyRoutes.some((entry) => entry.ambushGroup !== null && entry.ambushGroup !== undefined && this.host.EnemyPosition?.(entry.handle));
      const p = this.lastSample.position;
      const protectedSegment = p && (activity.ambushProneSegments || []).some((segment) =>
        p.x >= segment.minX && p.x <= segment.maxX && p.z >= segment.minZ && p.z <= segment.maxZ
        && !this.enemyRoutes.some((entry) => entry.ambushGroup !== null && entry.ambushGroup !== undefined
          && entry.ambushGroup <= segment.afterGroup && this.host.EnemyPosition?.(entry.handle)));
      const prepareProne = p && (activity.ambushProneApproaches || []).some((segment) =>
        p.x >= segment.minX && p.x <= segment.maxX && p.z >= segment.minZ && p.z <= segment.maxZ);
      if (alive && (Distance(p, target) > 0.65 || !threat)) {
        requiredAction = protectedSegment || prepareProne ? "move" : "sprint";
        requiredStance = protectedSegment || prepareProne ? "prone" : "stand";
        text = prepareProne ? "前方胸墙很低，提前卧倒再贴墙进入" : protectedSegment ? "保持卧倒贴着胸墙进入射击窝" : "掩体之间有空档，短冲刺到下一个射击角";
      } else if (threat) text = `${text}；站起射击，装填时先卧倒`;
      if (this.Signalled("P012RoadGunSilenced")) text += this.Signalled("P012RoadCoverReached")
        ? "；前副担架已移入掩蔽" : "；道路火力已清，前副担架正从院墙后移出";
      const entryTarget = activity.ambushEntryRoute?.[this.ambushEntryIndex];
      if (entryTarget) {
        target = entryTarget; requiredAction = "move"; requiredStance = "prone";
        text = "先沿入口卧倒进入蓝色胸墙掩护，不要直冲残屋";
      } else if (threat?.index === 0) {
        target = threat.cover; requiredAction = "fight"; requiredStance = Distance(p,target) > 0.65 ? "prone" : null;
        text = this.lastSample.bleeding > 0 && this.lastSample.bandages > 0
          ? "卧倒在蓝色胸墙后，流血时按 B 包扎；装填后起身压制道路火力"
          : "在蓝色胸墙后卧倒装填，起身压制道路火力；随后继续侧绕残屋";
      }
    }
    if (this.beat === 16) {
      target = route[this.routeIndex] || route.at(-1); requiredAction = "sprint";
      lookAt = this.Signalled("P012AirReady") ? anchors.railPassFrom : null;
      text = this.Signalled("P012AirReady") ? "铁路方向有飞机！加速穿过开放道路，留意首轮攻击并照顾担架队"
        : "随担架加速通过开放道路，途中留意铁路方向";
      if (this.airSprintM >= (activity.airRoadSprintMinM || 4)) requiredAction = "follow";
      if (Distance(this.lastSample.position,this.lastSample.columnPosition)>10) {
        target = this.lastSample.airColumnTailPosition || this.lastSample.columnPosition;
        requiredAction = "follow"; text = "接应后面的担架，一起通过开放道路";
      } else if (this.routeIndex >= route.length && this.airSprintM < (activity.airRoadSprintMinM || 4)
        && Distance(this.lastSample.position,route.at(-1)) < 2) {
        target = route.at(-2); text = "加速沿已清道路接应担架，再通过弯口";
      }
    }
    if (this.beat === 17) {
      target = route[this.routeIndex] || route.at(-1); requiredAction = "move";
      requiredStance = this.routeIndex >= route.length - 1 ? "crouch" : null;
      text = "飞机正在转向道路；看清人群位置，低姿进入近旁路沟";
    }
    if (this.beat === 18) target = this.lastSample.columnPosition || anchors.stretcher;
    if (this.beat === 18) interactionId = "ch1_stretcher";
    if (this.beat === 18 && this.lastSample.carryKind === "stretcher") {
      target = route[this.routeIndex] || activity.stretcherCarryTo; interactionId = null; text = "抬稳担架，从沟口绕入，把伤员送向掩体";
    }
    if (this.beat === 19) {
      const slots = anchors.strafeSlots || [];
      target = slots.reduce((nearest, point) => Distance(this.lastSample.position, point) < Distance(this.lastSample.position, nearest) ? point : nearest, null);
      text = "飞机压下来时按 Z 并移动，扑进最近的路沟";
    }
    if (this.beat === 23) {
      const points = this.config.routes?.retreat || [];
      target = points[this.retreatPoint];
      if (!this.facts.has("retreatSmokeDeployed")) {
        target = activity.retreatSmokeUse; interactionId = "p012_retreatSmoke";
        text = "到撤退线点燃烟幕，掩护担架离开南路";
        if (this.completionReasons[22] === "blockadeCleared") text = "四名远哨已清除，但南路断障无法通行；点燃烟幕，护送伤员改走西沟";
      } else if (this.retreatRejoining) {
        target = this.RetreatRejoinTarget(); requiredAction = "follow";
        text = "担架队落在后面，沿原路拐点回接，再一起撤退";
      } else {
        const lead = this.RetreatLeadTarget(target);
        if (lead) { target = this.RetreatRejoinTarget(lead); requiredAction = "follow";
          text = "在担架前方近距离引路，保持队伍一起移动"; }
      }
    }
    if (this.beat === 21) {
      if (this.routeIndex < (activity.southSupplyRouteIndex || 0)) {
        target = route[this.routeIndex]; text = "掩护担架沿已清路沟向南推进"; requiredAction = "move";
      } else if (!this.facts.has("southGrenadeThrown") && !(this.lastSample.grenades > 0) && this.southGrenadesRemaining > 0) {
        target = activity.southGrenadeSupply; interactionId = "p012_southGrenades";
        text = "从路沟补给点领取有限手榴弹";
      } else if (!this.facts.has("southGrenadeThrown") && this.lastSample.grenades > 0) {
        target = activity.southGrenadeSupply; lookAt = activity.southGrenadeAim; requiredAction = "grenade";
        text = "向截路火力点投掷手榴弹，再进入民房清理";
      } else { target = route[this.routeIndex] || activity.southRoom; text = "沿沟口绕进南路民房，清除近处日军";
        const threat = this.LateThreat();
        if (threat) { target = threat.cover; lookAt = threat.lookAt; requiredAction = "fight"; text = threat.label; }
      }
    }
    if (this.beat === 20) {
      const threat = this.LateThreat(); target = threat?.cover || activity.closeFightRoute?.[0];
      lookAt = threat?.lookAt || null; requiredAction = "fight";
      text = threat?.label || "守住沟边伤员，确认接近的敌人已被清除";
    }
    if (this.beat === 22) {
      target = route[this.routeIndex] || activity.southGrenadeSupply;
      requiredAction = this.routeIndex < route.length ? "move" : "observe";
      lookAt = this.routeIndex < route.length ? null : anchors.blockadePositions?.[1] || this.Point("southGunpoint");
      text = this.routeIndex < route.length ? "沿原来的安全入口回到路沟，接应两副担架"
        : this.lastSample.columnAtSouthAssembly ? "观察南路断障与远处警戒线，确认后送道路" : "掩护两副担架到南路沟内集合，确认无人掉队";
    }
    if ([20, 21].includes(this.beat) && requiredAction === "fight") {
      const moving = this.enemyRoutes.find((entry) => entry.encounterBeat === this.beat
        && entry.bound?.phase === "moving" && this.host.EnemyPosition?.(entry.handle));
      if (moving) { text += "；敌人正转移到另一射击位，注意移动射手";
        lookAt = this.host.EnemyPosition(moving.handle); }
    }
    if (this.beat >= 24) target = this.lastSample.carryKind === "stretcher" ? anchors.shelter
      : this.lastSample.regripPosition || activity.regripPosition;
    if (this.beat === 24 && this.lastSample.carryKind !== "stretcher") interactionId = "ch1_regrip";
    if (this.beat === 4 || this.beat === 19 ||
      (this.beat === 23 && (activity.retreatCoverIndices || []).includes(this.retreatPoint))) {
      if (!([4, 23].includes(this.beat) && requiredAction === "follow")) requiredAction = "crouch";
    }
    if (this.beat >= 6 && this.beat <= 10 && this.frontlineAmmoRemaining > 0
      && Number(this.host.CurrentClips?.() ?? this.lastSample.clips) <= 0) {
      target = anchors.ammoDrop; interactionId = "p012_frontlineAmmo"; requiredAction = "move";
      text = `退到弹药箱补充桥夹 · 箱内剩 ${this.frontlineAmmoRemaining}`;
    }
    if ([14, 20, 21].includes(this.beat) && !this.lastSample.carryKind
      && Number(this.lastSample.ammo) === 0 && Number(this.lastSample.clips) === 0) {
      text += "；弹药耗尽：到已清掩体旁靠近地上枪械，按 F 缴获（会替换当前枪弹）";
    }
    return { text, zone: beat.zone, target, lookAt, interactionId, requiredAction, requiredStance, progress,
      routeTarget: route[this.routeIndex] || null, arrivalRadiusM: this.beat === 23 && requiredAction === "follow" ? 0.6 : this.RouteArrivalRadius() };
  }
  Snapshot() { return Clone({ beat: this.beat, elapsed: this.elapsed, enteredAt: this.enteredAt,
    facts: [...this.facts], signals: [...this.signals], visits: this.visits, travelM: this.travelM,
    sprintM: this.sprintM, airSprintM: this.airSprintM, ambushEntryIndex: this.ambushEntryIndex, lookRad: this.lookRad, gunports: [...this.gunports],
    unlockedWaves: this.unlockedWaves, spawnedTotal: this.spawnedTotal, lastWaveAt: this.lastWaveAt,
    pressureHistory: this.pressureHistory,
    stageVisits: this.stageVisits, retreatPoint: this.retreatPoint, retreatRejoining: !!this.retreatRejoining,
    routeIndex: this.routeIndex, orientationIndex: this.orientationIndex, carryTravelM: this.carryTravelM,
    observationTime: this.observationTime, mortarImpactStart: this.mortarImpactStart,
    shellObservationTime: this.shellObservationTime, shellImpactStart: this.shellImpactStart, shellTarget: this.shellTarget,
    cleanupWeaponStart: this.cleanupWeaponStart,
    frontlineAmmoRemaining: this.frontlineAmmoRemaining, frontlineAmmoDispensed: this.frontlineAmmoDispensed,
    supplyReceipts: [...this.supplyReceipts],
    southGrenadesRemaining: this.southGrenadesRemaining, grenadeStart: this.grenadeStart,
    completionReasons: this.completionReasons,
    mortarEscapeFrom: this.mortarEscapeFrom,
    weaponActionStart: this.weaponActionStart, retreatCovers: this.retreatCovers,
    checkpoints: this.checkpoints, checkpointId: this.checkpointId, history: this.history }); }
  Restore(snapshot) {
    if (!snapshot || !Number.isInteger(snapshot.beat) || snapshot.beat < 0 || snapshot.beat > 25) return false;
    const next = Clone(snapshot);
    // 现有检查点只倒带玩家与任务，不复活世界中的死者；波次账单保持已发放，防重复刷敌。
    next.unlockedWaves = [...new Set([...this.unlockedWaves, ...next.unlockedWaves])];
    next.spawnedTotal = Math.max(this.spawnedTotal, next.spawnedTotal || 0);
    next.frontlineAmmoRemaining = Math.min(this.frontlineAmmoRemaining, next.frontlineAmmoRemaining ?? this.frontlineAmmoRemaining);
    next.frontlineAmmoDispensed = Math.max(this.frontlineAmmoDispensed, next.frontlineAmmoDispensed || 0);
    next.supplyReceipts = [...new Set([...this.supplyReceipts, ...(next.supplyReceipts || [])])];
    next.southGrenadesRemaining = Math.min(this.southGrenadesRemaining, next.southGrenadesRemaining ?? this.southGrenadesRemaining);
    Object.assign(this, next);
    this.facts = new Set(next.facts); this.signals = new Set(next.signals); this.gunports = new Set(next.gunports);
    this.supplyReceipts = new Set(next.supplyReceipts);
    for (const receipt of this.supplyReceipts) this.facts.add(receipt);
    this.last = null;
    this.guideStarted = false;
    this.action = P012_BEATS[this.beat].objective;
    this.host.RestoreSignals?.([...this.signals]);
    this.host.Objective?.(this.action);
    return true;
  }
  State() { return { beat: P012_BEATS[this.beat].id, beatIndex: this.beat, action: this.action,
    objective: this.CurrentObjective(),
    frontlineAmmo: { remainingClips: this.frontlineAmmoRemaining, dispensedClips: this.frontlineAmmoDispensed,
      label: this.FrontlineAmmoLabel() },
    southGrenadesRemaining: this.southGrenadesRemaining,
    completionReasons: { ...this.completionReasons },
    elapsed: this.elapsed, airSprintM: this.airSprintM, ambushEntryIndex: this.ambushEntryIndex,
    closePressureReleased: this.closePressureReleased, stagedCloseEnemies: this.enemyRoutes.filter(entry=>entry.staging).length,
    enemyBudget: this.EnemyBudget(), spawnedTotal: this.spawnedTotal,
    pendingEnemies: this.pendingEnemies.length,
    totalEnemyBudget: P012_WAVES.reduce((n,w)=>n+w.count,0) + (this.config.activities?.farEnemyBudget || 0),
    routeIndex: this.routeIndex, orientationIndex: this.orientationIndex, carryTravelM: this.carryTravelM,
    retreatPoint: this.retreatPoint, retreatRejoining: !!this.retreatRejoining, retreatCovers: this.retreatCovers.slice(),
    waves: this.unlockedWaves.map((index)=>({ ...P012_WAVES[index] })), checkpointId: this.checkpointId,
    pressureHistory: this.pressureHistory.map((entry) => ({ ...entry })),
    enemyBounds: this.enemyRoutes.filter((entry) => entry.bound).map((entry) => ({ beat: entry.encounterBeat,
      group: entry.encounterGroup, slot: entry.encounterSlot, phase: entry.bound.phase, reason: entry.bound.reason || null })),
    signals: [...this.signals], facts: [...this.facts], visits: this.visits.slice(), complete: this.beat === 25 };
  }
}

export default FirstLevelP012Director;
