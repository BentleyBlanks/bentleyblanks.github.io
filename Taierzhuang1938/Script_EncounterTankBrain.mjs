// ===========================================================================
// Script_EncounterTankBrain.mjs —— 遭遇试玩 / 第一关九四式轻装甲车纯规则战斗大脑
//
// 零 three、零 DOM、确定性可在 Node 直接单测（Script_EncounterTankTest.mjs）。
// 世界坐标约定与全仓一致：+X 东、+Z 南、+Y 上；局部 -Z 为车头与枪口前方；
// yaw 按 three rotation.y：朝向 yaw 的前向 = (-sin yaw, -cos yaw)。
//
// 核心能力：
//   1. 10 Hz 真实视线感知 + 目标记忆 + 威胁打分（玩家 / 西坎诱饵 / 机枪手 / 班组 / 战壕压制点）；
//   2. 手摇炮塔真实转向与枪管俯仰（含寻敌扫描、锁敌停顿预兆、受击/近爆紧急甩塔）；
//   3. 高压迫九一式车载机枪节奏：首次接触「走进来」零伤扫地警告 → 致命收敛长点射 →
//      掩体沿持续压制扫射（记 lastKnown）→ 留出呼吸窗口供反击或绕后放集束弹；
//   4. 受击与爆炸反应：子弹打装甲触发仇恨反压（带冷却）；近爆掀晃车身并甩塔还击；
//   5. 近身死角与西坎牵制：贴身 3.3 m 内俯角死角可借车体掩护放捆；06g/06h 幺娃牵制 tank2 炮塔。
// ===========================================================================
import { ENCOUNTER_TANK } from "./Data_Tuning_EncounterTank.mjs";

const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const Dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** 从 from 看向 to 的 three yaw（局部 -Z 为前）。 */
export const YawTo = (from, to) => Math.atan2(from.x - to.x, from.z - to.z);

/** 确定性小随机（测试与复现用）。 */
export function SeededRng(seed = 94) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** 根据车体位置/朝向和炮塔世界朝向，纯解析计算枪口世界坐标（模型未换装或纯 Node 测试时用）。 */
export function AnalyticTanketteMuzzle(x, groundY, z, hullYaw, turretYaw, gunPitch = 0, tuning = ENCOUNTER_TANK) {
  const H = tuning.hull;
  const ch = Math.cos(hullYaw), sh = Math.sin(hullYaw);
  const tx = x + H.turretOffset[0] * ch + H.turretOffset[2] * sh;
  const ty = groundY + H.turretOffset[1];
  const tz = z - H.turretOffset[0] * sh + H.turretOffset[2] * ch;
  const ct = Math.cos(turretYaw), st = Math.sin(turretYaw);
  const cp = Math.cos(gunPitch), sp = Math.sin(gunPitch);
  const mx = H.muzzleInTurret[0];
  const mz = H.muzzleInTurret[2];
  const my = H.muzzleInTurret[1] - mz * sp;
  const mzFlat = mz * cp;
  return {
    x: tx + mx * ct + mzFlat * st,
    y: ty + my,
    z: tz - mx * st + mzFlat * ct,
  };
}

/** 从 id 生成稳定种子。 */
function HashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h || 94;
}

export class EncounterTankBrain {
  constructor(id, { x = 0, z = 0, groundY = 0, hullYaw = Math.PI, turretYaw = null, destroyed = false, tuning = ENCOUNTER_TANK, rng = null } = {}) {
    this.id = id;
    this.T = tuning;
    this.rng = rng || SeededRng(HashId(id));
    this.time = 0;
    this.x = x;
    this.z = z;
    this.groundY = groundY;
    this.hullYaw = Wrap(hullYaw);
    this.turretYaw = Wrap(turretYaw ?? hullYaw);
    this.gunPitch = 0;
    this.turretRate = 0;
    this.cranking = false;
    this.speed = 0;
    this.pivotRate = 0;
    this.moving = false;
    this.wasMoving = false;
    this.wasPivoting = false;
    this.rpm = destroyed ? 0 : tuning.pressure.idleRpm;
    this.load = 0;
    this.hullRock = 0;
    this.hullRockVel = 0;
    this.destroyed = !!destroyed;
    this.disabledAt = destroyed ? 0 : -1;

    // 感知与瞄准状态
    this.phase = destroyed ? "disabled" : "idle"; // idle | traverse | aimHold | burst | rest | disabled
    this.nextPerceive = 0;
    this.visible = new Set();
    this.memory = new Map();
    this.targetId = null;
    this.targetKind = null;
    this.aimPoint = null;
    this.aimHoldUntil = 0;
    this.restUntil = 0;
    this.burst = null;
    this.shotsOnTarget = 0;
    this.lastAim = null;
    this.suppressCycle = 0;

    // 受击与爆炸仇恨
    this.aggro = null; // { point, targetId, until, kind }
    this.lastBulletAggroAt = -Infinity;
    this.lastBlastReactAt = -Infinity;
    this.decoyStimulus = null; // { targetId, point, until }
    this.queuedEvents = [];

    // 统计（用于测试与取证）
    this.stats = { bursts: 0, shots: 0, walkInShots: 0, lethalShots: 0, suppressShots: 0, bulletHits: 0, blastReacts: 0 };
  }

  Range(a, b) { return a + (b - a) * this.rng(); }

  /** 被玩家步枪/机枪子弹击中车体装甲。返回 { aggro: boolean }。 */
  OnBulletHit({ from = null, shooterId = "player" } = {}) {
    this.stats.bulletHits += 1;
    if (this.destroyed || !from) return { aggro: false };
    const R = this.T.react;
    if (this.time - this.lastBulletAggroAt < R.bulletAggroCooldownS) return { aggro: false };
    this.lastBulletAggroAt = this.time;
    const point = { x: from.x, y: from.y ?? this.groundY + 1.1, z: from.z };
    this.aggro = { point, targetId: shooterId, until: this.time + R.bulletAggroS, kind: "bullet" };
    // 正在歇息时提前唤醒准备回击
    if (this.phase === "rest") this.restUntil = Math.min(this.restUntil, this.time + 0.35);
    this.queuedEvents.push({ id: "aggro", kind: "bullet", targetId: shooterId });
    return { aggro: true };
  }

  /** 西坎诱饵（06g/06h 幺娃）向本车持续射击吸引炮塔注意。 */
  OnDecoyFire({ from = null, actorId = "yao", durationS = 3.2 } = {}) {
    if (this.destroyed || !from) return false;
    this.decoyStimulus = {
      targetId: actorId,
      point: { x: from.x, y: from.y ?? this.groundY + 1.1, z: from.z },
      until: this.time + durationS,
    };
    this.queuedEvents.push({ id: "decoyed", targetId: actorId });
    return true;
  }

  /** 附近发生爆炸（手榴弹/集束弹）：近爆晃动车身并甩塔压制。 */
  OnBlast({ position = null, thrower = null, throwerId = "player" } = {}) {
    if (this.destroyed || !position) return { reacted: false };
    const R = this.T.react;
    const dist = Dist2D(this, position);
    if (dist > R.blastRangeM) return { reacted: false };
    if (this.time - this.lastBlastReactAt < R.blastCooldownS) return { reacted: false };
    this.lastBlastReactAt = this.time;
    this.stats.blastReacts += 1;
    const strength = Clamp(1 - dist / R.blastRangeM, 0.25, 1);
    this.hullRockVel += R.blastRockRad * 10 * strength;
    const look = thrower || position;
    this.aggro = {
      point: { x: look.x, y: look.y ?? this.groundY + 1.0, z: look.z },
      targetId: throwerId,
      until: this.time + R.blastAggroS,
      kind: "blast",
    };
    this.burst = null;
    this.phase = "traverse";
    this.restUntil = 0;
    this.queuedEvents.push({ id: "blastReact", dist });
    return { reacted: true };
  }

  /** 标记车体被炸毁（06f / 06h 集束弹摧毁）。 */
  SetDestroyed(destroyed = true) {
    if (destroyed && !this.destroyed) {
      this.destroyed = true;
      this.disabledAt = this.time;
      this.phase = "disabled";
      this.burst = null;
      this.cranking = false;
      this.turretRate = 0;
      this.queuedEvents.push({ id: "destroyed" });
    }
  }

  /** 根据编排位置与朝向更新运动学（速度、原地转向、转速与负载）。 */
  UpdateMotion(dt, pose) {
    const P = this.T.pressure;
    const prevX = this.x, prevZ = this.z, prevYaw = this.hullYaw;
    const nextX = Number.isFinite(pose?.x) ? pose.x : this.x;
    const nextZ = Number.isFinite(pose?.z) ? pose.z : this.z;
    const nextYaw = Number.isFinite(pose?.hullYaw) ? Wrap(pose.hullYaw) : this.hullYaw;
    const nextGroundY = Number.isFinite(pose?.groundY) ? pose.groundY : this.groundY;

    const moved = Math.hypot(nextX - prevX, nextZ - prevZ);
    const teleported = moved > 5.0;
    if (dt > 1e-4 && !teleported) {
      this.speed = moved / dt;
      this.pivotRate = Wrap(nextYaw - prevYaw) / dt;
    } else {
      this.speed = 0;
      this.pivotRate = 0;
    }
    this.x = nextX;
    this.z = nextZ;
    this.groundY = nextGroundY;
    this.hullYaw = nextYaw;
    if (teleported && !this.destroyed) this.turretYaw = nextYaw;

    const events = [];
    if (this.destroyed) {
      this.speed = 0;
      this.pivotRate = 0;
      this.moving = false;
      const stallS = 1.8;
      const t = this.disabledAt >= 0 ? (this.time - this.disabledAt) / stallS : 1;
      const rpmTarget = t >= 1 ? 0 : P.idleRpm * (1 - t) * (0.6 + 0.4 * Math.abs(Math.sin(t * 19)));
      this.rpm += (rpmTarget - this.rpm) * (1 - Math.exp(-dt / 0.25));
      if (t >= 1) this.rpm = 0;
      this.load = 0;
    } else {
      this.moving = this.speed > 0.15;
      const pivoting = !this.moving && Math.abs(this.pivotRate) > 0.08;
      if (this.moving && !this.wasMoving) events.push({ id: "start" });
      if (!this.moving && this.wasMoving) events.push({ id: "halt" });
      if (pivoting && !this.wasPivoting) events.push({ id: "pivot" });
      this.wasMoving = this.moving;
      this.wasPivoting = pivoting;
      const speedNorm = Clamp(this.speed / P.cruiseMps, 0, 1);
      const pivotNorm = Clamp(Math.abs(this.pivotRate) / 0.45, 0, 1);
      this.load = Clamp(speedNorm * 0.65 + pivotNorm * 0.45 + (this.phase === "burst" ? 0.18 : 0), 0, 1);
      const rpmTarget = P.idleRpm + (P.maxRpm - P.idleRpm) * Clamp(this.load * 0.72 + speedNorm * 0.28, 0, 1);
      this.rpm += (rpmTarget - this.rpm) * (1 - Math.exp(-dt / P.rpmLagS));
    }

    // 车身晃动（近爆或急停的阻尼弹簧）
    if (dt > 0) {
      const k = 36, c = this.T.react.rockDecayRate;
      this.hullRockVel += (-k * this.hullRock - c * this.hullRockVel) * dt;
      this.hullRock = Clamp(this.hullRock + this.hullRockVel * dt, -0.1, 0.1);
      if (Math.abs(this.hullRock) < 1e-4 && Math.abs(this.hullRockVel) < 1e-4) {
        this.hullRock = 0;
        this.hullRockVel = 0;
      }
    }
    return events;
  }

  Prior(target, decoyRule) {
    const P = this.T.perceive;
    let weight = (target.weight ?? 1) * (P.weights[target.kind] ?? P.weights.squad);
    if (decoyRule && target.id === decoyRule.actorId) weight *= decoyRule.priorityBoost ?? 2.5;
    if (decoyRule && target.kind === "player" && Dist2D(this, target) > (decoyRule.playerOverrideRangeM ?? 12)) {
      weight *= 0.42;
    }
    const dist = Dist2D(this, target);
    return (weight / (1 + dist / P.distanceFalloffM)) * (target.id === this.targetId ? P.inertia : 1);
  }

  Perceive(world, muzzle) {
    const P = this.T.perceive;
    if (this.time < this.nextPerceive) return;
    this.nextPerceive = this.time + 1 / P.hz;

    const decoyRule = world.decoyRule || null;
    const candidates = (world.targets || [])
      .filter((t) => t.alive !== false && Dist2D(this, t) <= P.rangeM)
      .sort((a, b) => this.Prior(b, decoyRule) - this.Prior(a, decoyRule));

    const seen = new Set();
    let rays = 0;
    for (const t of candidates) {
      if (t.kind === "zone") continue;
      if (rays >= P.raysPerTick) break;
      rays += 1;
      const point = { x: t.x, y: t.y ?? (t.ground ?? this.groundY) + 1.15, z: t.z };
      if (!world.Los || world.Los(muzzle, point, t)) seen.add(t.id);
    }

    for (const t of candidates) {
      if (!seen.has(t.id) && t.kind !== "zone") continue;
      const prev = this.memory.get(t.id);
      const fresh = !prev || this.time - prev.seenAt > P.reexposeS;
      const dtSeen = prev ? Math.max(0.1, this.time - prev.seenAt) : 1;
      const vx = prev && this.time > prev.seenAt ? (t.x - prev.x) / dtSeen : 0;
      const vz = prev && this.time > prev.seenAt ? (t.z - prev.z) / dtSeen : 0;
      this.memory.set(t.id, {
        id: t.id,
        kind: t.kind,
        x: t.x,
        y: t.y ?? (t.ground ?? this.groundY) + (t.kind === "zone" ? 0.5 : 1.15),
        z: t.z,
        ground: t.ground ?? this.groundY,
        vx: t.vx ?? vx,
        vz: t.vz ?? vz,
        seenAt: this.time,
        exposedSince: fresh ? this.time : prev.exposedSince,
        contactAt: prev?.contactAt ?? -Infinity,
        zone: t.kind === "zone",
      });
    }
    this.visible = seen;
  }

  ChooseTarget(world) {
    const P = this.T.perceive;
    const decoyRule = world.decoyRule || null;
    const deadZone = this.T.turret.closeDeadZoneM;

    // 1. 强仇恨（手榴弹近爆或玩家主动打车体装甲）优先
    if (this.aggro && this.time < this.aggro.until) {
      const dist = Dist2D(this, this.aggro.point);
      if (dist >= deadZone && dist <= P.rangeM) {
        return {
          id: this.aggro.targetId || "aggro",
          kind: this.aggro.targetId === "player" ? "player" : "suppress",
          point: this.aggro.point,
          visible: this.visible.has(this.aggro.targetId),
          aggro: true,
          whip: true,
          memory: this.memory.get(this.aggro.targetId) || null,
        };
      }
    }

    // 2. 西坎幺娃诱饵主动开火牵制（06g / 06h）
    if (decoyRule && this.decoyStimulus && this.time < this.decoyStimulus.until) {
      const playerTarget = (world.targets || []).find((t) => t.kind === "player" && t.alive !== false);
      const playerCloseVisible = playerTarget && this.visible.has(playerTarget.id)
        && Dist2D(this, playerTarget) <= (decoyRule.playerOverrideRangeM ?? 12);
      if (!playerCloseVisible) {
        return {
          id: this.decoyStimulus.targetId,
          kind: "decoy",
          point: this.decoyStimulus.point,
          visible: true,
          decoy: true,
          whip: false,
          memory: this.memory.get(this.decoyStimulus.targetId) || null,
        };
      }
    }

    // 3. 常规目标打分（实时视线 > 新鲜记忆 > 战壕/凹路压制点）
    let best = null, bestScore = 0;
    for (const t of world.targets || []) {
      if (t.alive === false) continue;
      const dist = Dist2D(this, t);
      if (dist > P.rangeM) continue;
      if (t.kind !== "zone" && dist < deadZone) continue;
      const mem = this.memory.get(t.id);
      if (!mem) continue;
      const visible = this.visible.has(t.id);
      const age = this.time - mem.seenAt;
      if (!visible && !mem.zone && age > P.memoryS) continue;
      const score = this.Prior(t, decoyRule) * (visible ? 1 : mem.zone ? P.unseenZoneScale : P.unseenScale * (1 - age / P.memoryS));
      if (score > bestScore) {
        bestScore = score;
        best = {
          id: t.id,
          kind: decoyRule && t.id === decoyRule.actorId ? "decoy" : t.kind,
          point: { x: mem.x, y: mem.y, z: mem.z },
          visible,
          aggro: false,
          whip: false,
          memory: mem,
        };
      }
    }
    return best;
  }

  StartBurst(choice, world, muzzle) {
    const M = this.T.mg;
    let kind = "lethal";
    let damageScale = choice.kind === "player" ? M.playerDamageScale : M.allyDamageScale;
    let point = { ...choice.point };
    let from = null;
    let duration = this.Range(M.burstMinS, M.burstMaxS);

    if (choice.kind === "zone") {
      kind = "zone";
      damageScale = M.allyDamageScale;
      duration = M.suppressBurstS;
      const lip = world.Cover?.(point, muzzle);
      if (lip) point = { ...lip };
    } else if (!choice.visible && !choice.decoy) {
      kind = "suppress";
      damageScale = choice.kind === "player" ? M.playerDamageScale * 0.55 : M.allyDamageScale;
      duration = M.suppressBurstS;
      const lip = world.Cover?.(point, muzzle);
      if (lip) point = { ...lip };
      else point.y = (choice.memory?.ground ?? this.groundY) + 0.65;
    } else if (choice.kind === "player") {
      const mem = choice.memory;
      const freshContact = !mem || this.time - mem.contactAt > M.freshContactS;
      if (freshContact && !choice.aggro) {
        // 首次发现玩家：从身前 walkInStartM 处扫地走过来，零直接伤害但拉满压制、曳光与尘土警告！
        kind = "walkIn";
        damageScale = M.walkInDamageScale;
        duration = M.burstMinS;
        const d = Math.max(0.5, Dist2D(this, point));
        const k = Math.min(M.walkInStartM, d * 0.55) / d;
        from = {
          x: point.x + (this.x - point.x) * k,
          y: (mem?.ground ?? this.groundY) + 0.15,
          z: point.z + (this.z - point.z) * k,
        };
        point = { x: point.x, y: (mem?.ground ?? this.groundY) + 0.72, z: point.z };
      } else {
        if (this.lastAim && this.lastAim.targetId === choice.id && Dist2D(point, this.lastAim) > M.moveResetM) {
          this.shotsOnTarget = 0;
        }
        this.lastAim = { targetId: choice.id, x: point.x, z: point.z };
      }
      if (mem) mem.contactAt = this.time;
    }

    this.burst = {
      kind,
      targetId: choice.id,
      isPlayerTarget: choice.kind === "player",
      from,
      point,
      damageScale,
      start: this.time,
      until: this.time + duration,
      nextShot: this.time,
      shots: 0,
      burstStep: this.shotsOnTarget,
    };
    this.phase = "burst";
    this.stats.bursts += 1;
    if (kind === "lethal") this.shotsOnTarget += 1;
  }

  StepBurst(fireOut, muzzle) {
    const M = this.T.mg;
    const b = this.burst;
    if (!b) return;
    const duration = Math.max(0.1, b.until - b.start);
    while (this.time >= b.nextShot && b.nextShot < b.until) {
      const progress = Clamp((b.nextShot - b.start) / duration, 0, 1);
      b.shots += 1;
      const n = b.shots;
      let at;
      if (b.kind === "walkIn" && b.from) {
        const jitter = 0.25;
        at = {
          x: b.from.x + (b.point.x - b.from.x) * progress + Math.sin(n * 2.13) * jitter,
          y: b.from.y + (b.point.y - b.from.y) * progress,
          z: b.from.z + (b.point.z - b.from.z) * progress + Math.cos(n * 2.13) * jitter,
        };
      } else {
        const dist = Math.hypot(b.point.x - muzzle.x, b.point.z - muzzle.z);
        const baseSpread = b.kind === "zone"
          ? M.zoneSpreadM
          : b.kind === "suppress"
            ? M.suppressSpreadM
            : Math.max(M.spreadMinM, M.spreadFirstM * (M.spreadShrink ** b.burstStep));
        const spread = baseSpread + M.spreadPerM * dist;
        // 黄金角分布让连射在水平面上横扫一片压制带，既有真实散布又视觉极富压迫力
        const sweep = b.kind === "zone" || b.kind === "suppress" ? (progress - 0.5) * spread * 1.4 : 0;
        const perpX = -(b.point.z - muzzle.z) / Math.max(0.5, dist);
        const perpZ = (b.point.x - muzzle.x) / Math.max(0.5, dist);
        at = {
          x: b.point.x + perpX * sweep + Math.sin(n * 2.399) * spread * 0.65,
          y: b.point.y + Math.cos(n * 1.73) * spread * 0.22,
          z: b.point.z + perpZ * sweep + Math.cos(n * 2.399) * spread * 0.65,
        };
      }

      // 俯仰安全检：避免穿自己车顶/车底开火
      const hDist = Math.max(0.5, Math.hypot(at.x - muzzle.x, at.z - muzzle.z));
      const elev = Math.atan2(at.y - muzzle.y, hDist);
      if (elev >= -M.downRad && elev <= M.upRad) {
        fireOut.push({
          weapon: "mg",
          at,
          kind: b.kind,
          targetId: b.targetId,
          isPlayerTarget: b.isPlayerTarget,
          damageScale: b.damageScale,
        });
        this.stats.shots += 1;
        if (b.kind === "walkIn") this.stats.walkInShots += 1;
        else if (b.kind === "lethal") this.stats.lethalShots += 1;
        else this.stats.suppressShots += 1;
      }
      b.nextShot += M.shotIntervalS;
    }

    if (this.time >= b.until) {
      this.burst = null;
      this.phase = "rest";
      this.restUntil = this.time + this.Range(M.restMinS, M.restMaxS);
    }
  }

  /**
   * 推进一帧。
   * @param {number} dt
   * @param {object} world { pose: {x,z,groundY,hullYaw,destroyed}, weaponsFree, targets, Los, Cover, muzzle, decoyRule }
   */
  Update(dt, world = {}) {
    const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    this.time += step;
    const events = this.queuedEvents.splice(0);
    const fire = [];

    if (world.pose?.destroyed) this.SetDestroyed(true);
    events.push(...this.UpdateMotion(step, world.pose));

    if (this.destroyed) {
      return {
        id: this.id,
        destroyed: true,
        pose: { x: this.x, z: this.z, groundY: this.groundY, hullYaw: this.hullYaw, hullRock: this.hullRock },
        drive: { speed: 0, pivotRate: 0, moving: false, rpm: this.rpm, load: 0 },
        turret: { yaw: this.turretYaw, pitch: this.gunPitch, rate: 0, cranking: false, phase: "disabled" },
        targetId: null,
        fire,
        events,
      };
    }

    const muzzle = world.muzzle || AnalyticTanketteMuzzle(this.x, this.groundY, this.z, this.hullYaw, this.turretYaw, this.gunPitch, this.T);
    const weaponsFree = world.weaponsFree !== false;
    this.Perceive(world, muzzle);
    const choice = this.ChooseTarget(world);

    const TU = this.T.turret;
    const beforeYaw = this.turretYaw;

    // 决定炮塔期望朝向与转速
    let desiredYaw;
    let desiredPitch = 0;
    let rate = TU.scanRateRadS;

    if (choice) {
      if (choice.id !== this.targetId) {
        this.targetId = choice.id;
        this.targetKind = choice.kind;
        this.shotsOnTarget = 0;
        if (this.phase === "burst") {
          this.burst = null;
          this.phase = "traverse";
        }
      }
      this.aimPoint = choice.point;
      desiredYaw = YawTo(this, choice.point);
      const hDist = Math.max(1.0, Dist2D(muzzle, choice.point));
      desiredPitch = Clamp(Math.atan2((choice.point.y ?? this.groundY + 0.9) - muzzle.y, hDist), TU.pitchMinRad, TU.pitchMaxRad);
      rate = choice.whip ? TU.whipRateRadS : TU.trackRateRadS;
    } else {
      this.targetId = null;
      this.targetKind = null;
      this.aimPoint = null;
      if (this.phase === "burst") this.burst = null;
      if (this.phase !== "rest") this.phase = "idle";
      // 无目标时缓慢左右警戒扫描，而不是死板固定朝前
      const sweepPhase = (this.time / TU.idleSweepPeriodS) * Math.PI * 2 + (HashId(this.id) % 7);
      desiredYaw = Wrap(this.hullYaw + Math.sin(sweepPhase) * TU.idleSweepArcRad);
      desiredPitch = 0;
      rate = TU.scanRateRadS;
    }

    // 摇炮塔与枪管俯仰
    const yawErr = Wrap(desiredYaw - this.turretYaw);
    if (step > 0) {
      const maxStep = rate * step;
      if (Math.abs(yawErr) > 1e-4 && this.phase !== "aimHold") {
        this.turretYaw = Wrap(this.turretYaw + Clamp(yawErr, -maxStep, maxStep));
      }
      const pitchErr = desiredPitch - this.gunPitch;
      this.gunPitch = Clamp(this.gunPitch + Clamp(pitchErr, -TU.pitchRateRadS * step, TU.pitchRateRadS * step), TU.pitchMinRad, TU.pitchMaxRad);
    }
    this.turretRate = step > 1e-4 ? Wrap(this.turretYaw - beforeYaw) / step : 0;
    this.cranking = Math.abs(this.turretRate) > 0.03;

    // 火力状态机
    if (!weaponsFree) {
      this.burst = null;
      this.phase = choice ? "traverse" : "idle";
    } else if (choice) {
      const remainingErr = Math.abs(Wrap(desiredYaw - this.turretYaw));
      if (this.phase === "rest") {
        if (this.time >= this.restUntil) this.phase = "traverse";
      }
      if (this.phase === "idle" || this.phase === "traverse") {
        if (remainingErr <= TU.alignRad) {
          this.phase = "aimHold";
          // 紧急仇恨反击停顿略短，增强压迫响应
          const holdScale = choice.whip ? 0.55 : 1.0;
          this.aimHoldUntil = this.time + this.Range(TU.aimHoldMinS, TU.aimHoldMaxS) * holdScale;
        }
      } else if (this.phase === "aimHold") {
        if (remainingErr > TU.relayRad) {
          this.phase = "traverse";
        } else if (this.time >= this.aimHoldUntil) {
          this.StartBurst(choice, world, muzzle);
        }
      } else if (this.phase === "burst") {
        if (remainingErr > TU.relayRad * 1.45) {
          this.burst = null;
          this.phase = "traverse";
        } else {
          // 连射期间小幅追踪活目标位置，避免扫空气
          if (this.burst && choice.visible && this.burst.kind === "lethal") {
            this.burst.point = { ...choice.point };
          }
          this.StepBurst(fire, muzzle);
        }
      }
    }

    return {
      id: this.id,
      destroyed: false,
      pose: { x: this.x, z: this.z, groundY: this.groundY, hullYaw: this.hullYaw, hullRock: this.hullRock },
      drive: { speed: this.speed, pivotRate: this.pivotRate, moving: this.moving, rpm: this.rpm, load: this.load },
      turret: { yaw: this.turretYaw, pitch: this.gunPitch, rate: this.turretRate, cranking: this.cranking, phase: this.phase },
      targetId: this.targetId,
      fire,
      events,
    };
  }

  Snapshot() {
    return {
      id: this.id,
      x: Number(this.x.toFixed(2)),
      z: Number(this.z.toFixed(2)),
      hullYawDeg: Number((this.hullYaw * 180 / Math.PI).toFixed(1)),
      turretYawDeg: Number((this.turretYaw * 180 / Math.PI).toFixed(1)),
      gunPitchDeg: Number((this.gunPitch * 180 / Math.PI).toFixed(1)),
      phase: this.phase,
      targetId: this.targetId,
      destroyed: this.destroyed,
      moving: this.moving,
      rpm: Math.round(this.rpm),
      stats: { ...this.stats },
    };
  }
}
