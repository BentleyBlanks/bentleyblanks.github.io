// ===========================================================================
// Script_EncounterTankRuntime.mjs —— 遭遇试玩与正式第一关九四式战车运行时桥接层
//
// 连接纯规则大脑（Script_EncounterTankBrain）与游戏世界：
//   · 物理：为每辆在场九四式注册真实金属旋转碰撞盒（tag: "encounterTank", surface: "metal"），
//     玩家步枪/机枪弹命中溅硬质火星、跳弹、响叮当声并触发仇恨反应；
//   · 索敌与火力：10 Hz 真实视线 + 掩体沿压制，经 host.FireVehicleBullet 打出真实曳光光束、
//     枪口火光、弹着土石火星、有效伤害与近失强压制；
//   · 表现与声音：驱动 BlockoutPuppets 的 TurretYaw / MachineGunPitch 俯仰与车身近爆晃动，
//     挂接 TankAudio（引擎轰鸣 / 履带咔嗒 / 手摇棘轮 / 跳弹叮当 / 炸毁熄火卡死）、
//     履带扬尘 / 尾气烟柱与 28 m 引擎低频震屏；
//   · 战术联动：06g/06h 幺娃在西坎向后车持续点射牵制炮塔，玩家可借掩体与死角接近放捆；
//     08c/08d 沟口阻击时沟北九四式交叉横扫战壕沿，迫使玩家借点射间隙清除垫沟兵与撤桥。
// ===========================================================================
import * as THREE from "three";
import { ENCOUNTER_TANK } from "./Data_Tuning_EncounterTank.mjs";
import { TANK } from "./Data_Tuning_Tank.mjs";
import { EncounterTankBrain, AnalyticTanketteMuzzle } from "./Script_EncounterTankBrain.mjs";
import { TankAudio } from "./Script_TankAudio.mjs";

const RAD_TO_DEG = 180 / Math.PI;
const EXHAUST_SMOKE = Object.freeze({ kind: "smoke", rate: 2.2, radius: 0.22, rise: 0.7, sizeStart: 0.22, sizeEnd: 1.0, life: 1.8, opacity: 0.22 });
const TRACK_DUST = Object.freeze({ kind: "dust", rate: 3.5, radius: 0.35, rise: 0.45, sizeStart: 0.35, sizeEnd: 1.6, life: 2.0, opacity: 0.28 });

export class EncounterTankRuntime {
  constructor(host, puppets, { groundAt = null, tuning = ENCOUNTER_TANK } = {}) {
    this.host = host;
    this.puppets = puppets;
    this.groundAt = groundAt;
    this.T = tuning;
    this.tanks = new Map(); // id -> { id, brain, collider, registered, fx, muzzleWorld, gunPitchNode, lastColliderKey }
    this.sound = null;
    this.nearestCollider = null;
    this.decoyBurst = { nextAt: 0, remaining: 0, nextShotAt: 0, tankId: null };
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpDir = new THREE.Vector3();
    this.tmpPt = new THREE.Vector3();
  }

  get Sound() {
    if (!this.sound && this.host.audio) {
      this.sound = new TankAudio(this.host.audio, TANK.audio, TANK.drive, { occluder: () => this.nearestCollider });
    }
    return this.sound;
  }

  Ground(x, z) {
    return this.groundAt ? this.groundAt(x, z) : this.host.battlefield.GroundHeight(x, z);
  }

  EnsureTank(actor) {
    let entry = this.tanks.get(actor.id);
    if (entry) return entry;
    const x = actor.p[0], z = actor.p[1], groundY = this.Ground(x, z);
    const hullYaw = -(actor.heading || 0);
    const turretYaw = Number.isFinite(actor.turret) ? -actor.turret : hullYaw;
    const destroyed = actor.pose === "burn" || !!actor.disabled;
    const brain = new EncounterTankBrain(actor.id, { x, z, groundY, hullYaw, turretYaw, destroyed, tuning: this.T });
    const H = this.T.hull;
    const collider = {
      min: [x - H.half[0], groundY, z - H.half[2]],
      max: [x + H.half[0], groundY + H.half[1] * 2, z + H.half[2]],
      c: [x, groundY + H.centerY, z],
      h: [...H.half],
      tag: "encounterTank",
      tankId: actor.id,
      ry: hullYaw,
      surface: "metal",
    };
    entry = {
      id: actor.id,
      brain,
      collider,
      registered: false,
      initializedPose: false,
      lastColliderKey: "",
      muzzleWorld: null,
      gunPitchNode: null,
      fx: { dust: [null, null], exhaust: null },
    };
    this.tanks.set(actor.id, entry);
    return entry;
  }

  SyncCollider(entry, x, groundY, z, hullYaw) {
    const physics = this.host.ctx?.physics;
    if (!physics) return false;
    const c = entry.collider;
    const key = `${x.toFixed(3)}|${groundY.toFixed(3)}|${z.toFixed(3)}|${hullYaw.toFixed(3)}`;
    if (entry.registered && key === entry.lastColliderKey) return false;
    entry.lastColliderKey = key;
    const cy = groundY + this.T.hull.centerY;
    c.ry = hullYaw;
    c.c[0] = x; c.c[1] = cy; c.c[2] = z;
    c.min[0] = x - c.h[0]; c.min[1] = cy - c.h[1]; c.min[2] = z - c.h[2];
    c.max[0] = x + c.h[0]; c.max[1] = cy + c.h[1]; c.max[2] = z + c.h[2];
    if (!entry.registered) {
      physics.AddSolid(c);
      entry.registered = true;
      return true;
    }
    physics.MoveSolid(c);
    return true;
  }

  ReleaseTank(entry) {
    const physics = this.host.ctx?.physics;
    if (entry.registered && physics && entry.collider._physicsHandle != null) {
      physics.RemoveSolid(entry.collider._physicsHandle);
    }
    entry.registered = false;
    this.StopFx(entry);
  }

  StopFx(entry) {
    const vfx = this.host.vfx;
    if (!vfx) return;
    for (let i = 0; i < 2; i++) {
      if (entry.fx.dust[i] != null) { vfx.RemoveSmokeSource(entry.fx.dust[i]); entry.fx.dust[i] = null; }
    }
    if (entry.fx.exhaust != null) { vfx.RemoveSmokeSource(entry.fx.exhaust); entry.fx.exhaust = null; }
  }

  HasLos(from, to, excludeCollider) {
    const bf = this.host.battlefield;
    if (!bf?.Raycast) return true;
    this.tmpA.set(from.x, from.y, from.z);
    this.tmpB.set(to.x, to.y, to.z);
    this.tmpDir.subVectors(this.tmpB, this.tmpA);
    const dist = this.tmpDir.length();
    if (dist < 0.2) return true;
    this.tmpDir.divideScalar(dist);
    const hit = bf.Raycast(this.tmpA, this.tmpDir, dist, { terrain: true, excludeCollider });
    return !hit || (hit.t ?? hit.distance ?? Infinity) >= dist - 0.18;
  }

  CoverLip(at, from, excludeCollider) {
    const bf = this.host.battlefield;
    if (!bf?.Raycast || !from) return null;
    const ground = this.Ground(at.x, at.z);
    const origin = this.tmpA.set(at.x, Math.max(ground + 0.85, (at.y ?? ground + 1.15) - 0.35), at.z);
    const dir = this.tmpDir.set(from.x - origin.x, (from.y ?? origin.y) - origin.y, from.z - origin.z);
    const len = dir.length();
    if (len < 0.6) return null;
    dir.divideScalar(len);
    const hit = bf.Raycast(origin, dir, Math.min(len, 6.0), { terrain: true, excludeCollider });
    if (!hit) return null;
    const t = hit.t ?? hit.distance ?? 0;
    return { x: origin.x + dir.x * t, y: origin.y + dir.y * t + 0.14, z: origin.z + dir.z * t };
  }

  BuildTargets(frame, soldierEntries, tankId) {
    const targets = [];
    const aiTime = this.host.ai?.time ?? 0;
    const fireWindow = this.T.perceive.recentFireWindowS ?? 3.0;
    const player = this.host.player;
    if (player?.Alive) {
      const p = player.position;
      const playerFiring = player.lastShotAt != null && (aiTime - player.lastShotAt) <= fireWindow;
      targets.push({
        id: "player",
        kind: "player",
        x: p.x,
        y: Math.max(p.y + 0.45, player.EyePosition.y - 0.18),
        z: p.z,
        ground: this.Ground(p.x, p.z),
        vx: player.velocity?.x || 0,
        vz: player.velocity?.z || 0,
        firingRecently: playerFiring,
        exposed: player.stance === "stand" || playerFiring,
        hasBundle: (this.host.state?.bundles || 0) > 0,
        alive: true,
      });
    }
    for (const [id, sEntry] of soldierEntries) {
      if (sEntry.spec.side !== "nra" || !sEntry.soldier.alive) continue;
      const p = sEntry.soldier.position;
      const stance = sEntry.soldier.stance || 0;
      const isHeavy = sEntry.spec.weapon === "Zb26" || id === "yao";
      const firingRecently = sEntry.soldier.lastShotAt != null && (aiTime - sEntry.soldier.lastShotAt) <= fireWindow;
      const aimHeight = stance === 2 ? (firingRecently ? 0.58 : 0.38) : (firingRecently || stance === 0 ? 1.25 : 0.92);
      targets.push({
        id,
        kind: isHeavy ? "heavyAlly" : "squad",
        x: p.x,
        y: p.y + aimHeight,
        z: p.z,
        ground: this.Ground(p.x, p.z),
        firingRecently,
        exposed: stance === 0 || firingRecently,
        alive: true,
      });
    }
    const E = this.T.engagement;
    const beatId = frame.beat?.id || "";
    const trenchZones = E.trenchZonesByTank?.[tankId];
    if (trenchZones && (beatId === "08c" || beatId === "08d")) {
      for (const zSpec of trenchZones) {
        const g = this.Ground(zSpec.x, zSpec.z);
        targets.push({ id: zSpec.id, kind: "zone", x: zSpec.x, y: g + 0.65, z: zSpec.z, ground: g, weight: zSpec.weight, alive: true });
      }
    }
    const roadZones = E.roadZonesByTank?.[tankId];
    if (roadZones && beatId >= "06a" && beatId <= "06h") {
      for (const zSpec of roadZones) {
        const g = this.Ground(zSpec.x, zSpec.z);
        targets.push({ id: zSpec.id, kind: "zone", x: zSpec.x, y: g + 0.65, z: zSpec.z, ground: g, weight: zSpec.weight, alive: true });
      }
    }
    return targets;
  }

  WeaponsFreeFor(frame, tankId) {
    const beatId = frame.beat?.id || "";
    const E = this.T.engagement;
    if (frame.stealth?.active || frame.stealth?.noFire) return false;
    // 09a 进入村内潜行后，沟北的 tank3 停止主动扫射，保留关帝庙屏息静默
    if (tankId === "tank3" && beatId >= "09a" && beatId < "11a") return false;
    if (E.holdFireBeats.includes(beatId)) return false;
    return true;
  }

  /** 06g / 06h：幺娃在西坎用捷克式向后车 tank2 持续点射牵制炮塔。 */
  UpdateDecoyFire(frame, dt, soldierEntries) {
    const beatId = frame.beat?.id || "";
    const decoyRule = this.T.engagement.decoyBeats?.[beatId];
    if (!decoyRule || !(dt > 0)) return;
    const tankEntry = this.tanks.get(decoyRule.tankId);
    const yaoEntry = soldierEntries.get(decoyRule.actorId);
    if (!tankEntry || tankEntry.brain.destroyed || !yaoEntry?.soldier?.alive) return;

    const yaoPos = yaoEntry.soldier.position;
    const dist = Math.hypot(tankEntry.brain.x - yaoPos.x, tankEntry.brain.z - yaoPos.z);
    if (dist > this.T.decoyFire.maxRangeM) return;

    const now = tankEntry.brain.time;
    const D = this.T.decoyFire;
    if (this.decoyBurst.remaining <= 0 && now >= this.decoyBurst.nextAt) {
      this.decoyBurst.remaining = D.shotsPerBurst;
      this.decoyBurst.nextShotAt = now;
      this.decoyBurst.tankId = decoyRule.tankId;
      this.decoyBurst.nextAt = now + D.burstIntervalMinS + (D.burstIntervalMaxS - D.burstIntervalMinS) * tankEntry.brain.rng();
      tankEntry.brain.OnDecoyFire({ from: { x: yaoPos.x, y: yaoPos.y + 1.1, z: yaoPos.z }, actorId: decoyRule.actorId, durationS: 3.6 });
    }
    if (this.decoyBurst.remaining > 0 && now >= this.decoyBurst.nextShotAt) {
      this.decoyBurst.remaining -= 1;
      this.decoyBurst.nextShotAt = now + D.shotSpacingS;
      const from = new THREE.Vector3(yaoPos.x, yaoPos.y + 1.25, yaoPos.z);
      const jitter = (tankEntry.brain.rng() - 0.5) * 0.5;
      const to = new THREE.Vector3(tankEntry.brain.x + jitter, tankEntry.brain.groundY + 1.1 + jitter * 0.3, tankEntry.brain.z + jitter * 0.5);
      const dir = to.clone().sub(from).normalize();
      this.host.vfx?.MuzzleFlash?.(from, dir, { scale: 0.6, kind: "mg" });
      this.host.vfx?.Tracer?.(from, to, { kind: "nra" });
      this.host.vfx?.Impact?.(to, dir.clone().negate(), "metal", { weaponKind: "mg", hardSparks: true });
      this.host.audio?.PlayGunshot?.("zb26", { position: from, volume: 0.68, weaponClass: "mg", burst: 1 });
      this.Sound?.OnBulletHit({ x: to.x, y: to.y, z: to.z });
    }
  }

  /**
   * 帧前更新（在 puppets.SyncFrame 之前调用）：
   * 推进每辆在场战车的 AI 大脑、同步碰撞盒、执行实弹开火、声音与震屏，
   * 返回 Map<id, { turretYawDeg, gunPitch, hullRock }> 给 EncounterPlay 覆写木偶朝向。
   */
  Update(frame, dt, soldierEntries) {
    const activeActors = (frame.actors || []).filter((a) => a.kind === "tank");
    const activeIds = new Set(activeActors.map((a) => a.id));

    // 清理离开当前片段的战车
    for (const [id, entry] of this.tanks) {
      if (!activeIds.has(id)) {
        this.ReleaseTank(entry);
        this.tanks.delete(id);
      }
    }

    const overrides = new Map();
    if (!activeActors.length) {
      this.sound?.Stop();
      this.nearestCollider = null;
      return overrides;
    }

    let colliderTouched = false;
    const playerPos = this.host.player?.position;
    let nearest = null;
    let nearestDist = Infinity;
    const beatId = frame.beat?.id || "";
    const decoyBeatRule = this.T.engagement.decoyBeats?.[beatId] || null;
    const stealthSilent = !!(frame.stealth?.active || frame.stealth?.noFire || (beatId >= "09a" && beatId < "11a"));

    for (const actor of activeActors) {
      const entry = this.EnsureTank(actor);
      let x = actor.p[0], z = actor.p[1];
      let hullYaw = -(actor.heading || 0);
      const destroyed = actor.pose === "burn" || !!actor.disabled;

      // 切拍跳时间时按道路时速平滑行驶追赶，避免 05A–06A 快进时战车在视野里瞬间瞬移
      if (dt > 0 && entry.initializedPose && !destroyed) {
        const dx = x - entry.brain.x;
        const dz = z - entry.brain.z;
        const dist = Math.hypot(dx, dz);
        const snapM = this.T.motion?.teleportSnapM ?? 65;
        const maxStep = (this.T.motion?.maxCatchupMps ?? 6.0) * dt;
        if (dist > maxStep && dist < snapM) {
          x = entry.brain.x + (dx / dist) * maxStep;
          z = entry.brain.z + (dz / dist) * maxStep;
          hullYaw = Math.atan2(-dx, -dz);
        }
      }
      entry.initializedPose = true;
      const groundY = this.Ground(x, z);

      if (this.SyncCollider(entry, x, groundY, z, hullYaw)) colliderTouched = true;

      const muzzle = entry.muzzleWorld
        ? { x: entry.muzzleWorld.x, y: entry.muzzleWorld.y, z: entry.muzzleWorld.z }
        : AnalyticTanketteMuzzle(x, groundY, z, hullYaw, entry.brain.turretYaw, entry.brain.gunPitch, this.T);

      const otherTankTargets = new Set();
      for (const [otherId, otherEntry] of this.tanks) {
        if (otherId !== actor.id && !otherEntry.brain.destroyed && otherEntry.brain.targetId) {
          otherTankTargets.add(otherEntry.brain.targetId);
        }
      }

      const decoyRule = decoyBeatRule && decoyBeatRule.tankId === actor.id ? decoyBeatRule : null;
      const out = entry.brain.Update(dt, {
        pose: { x, z, groundY, hullYaw, destroyed },
        weaponsFree: this.WeaponsFreeFor(frame, actor.id),
        targets: this.BuildTargets(frame, soldierEntries, actor.id),
        otherTankTargets,
        Los: (a, b) => this.HasLos(a, b, entry.collider),
        Cover: (at, from) => this.CoverLip(at, from, entry.collider),
        muzzle,
        decoyRule,
      });

      overrides.set(actor.id, {
        x: out.pose.x,
        z: out.pose.z,
        hullYawDeg: out.pose.hullYaw * RAD_TO_DEG,
        turretYawDeg: out.turret.yaw * RAD_TO_DEG,
        gunPitch: out.turret.pitch,
        hullRock: out.pose.hullRock,
        destroyed: out.destroyed,
      });

      // 处理声音一次性事件与炸毁熄火
      for (const ev of out.events) {
        if (ev.id === "destroyed") {
          this.Sound?.OnState("Disabled", { x, y: groundY, z });
        } else if (["start", "halt", "pivot"].includes(ev.id) && !stealthSilent) {
          this.Sound?.OnEvent(ev.id, { x, y: groundY + 0.4, z });
        }
      }

      // 执行实弹开火
      for (const shot of out.fire) this.FireShot(entry, muzzle, shot, soldierEntries);

      // 挑最近的一辆驱动 TankAudio 三条循环 + 低频震屏
      if (playerPos) {
        const d = Math.hypot(x - playerPos.x, z - playerPos.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = { entry, out, dist: d };
        }
      }
    }

    if (colliderTouched && dt <= 0) {
      this.host.ctx?.physics?.RefreshStaticQueries?.();
    }

    // 幺娃 06g/06h 西坎吸引炮塔实景射击
    this.UpdateDecoyFire(frame, dt, soldierEntries);

    // 声音循环 & 距离低频震屏
    if (nearest && !stealthSilent && dt > 0) {
      const { entry, out, dist } = nearest;
      this.nearestCollider = entry.collider;
      const sound = this.Sound;
      if (sound) {
        sound.Update(dt, {
          x: out.pose.x,
          z: out.pose.z,
          groundY: out.pose.groundY,
          rpm: out.drive.rpm,
          load: out.drive.load,
          speed: out.drive.speed,
          pivotRate: out.drive.pivotRate,
          turretRate: out.turret.rate,
          cranking: out.turret.cranking,
          damageState: out.destroyed ? "Disabled" : "Intact",
        });
      }
      if (!out.destroyed && out.drive.rpm > 60 && dist < this.T.pressure.rumbleRangeM) {
        this.host.player?.shake?.Rumble?.(dist, Math.max(0.22, out.drive.load));
      }
    } else if (stealthSilent) {
      this.sound?.Stop();
      this.nearestCollider = null;
    }

    return overrides;
  }

  /** 发射一发九一式 6.5mm 车载机枪实弹（含曳光光束、枪口火光、弹着泥土火星与人/友军双压制）。 */
  FireShot(entry, muzzle, shot, soldierEntries = null) {
    const fireFn = this.host.FireVehicleBullet;
    if (typeof fireFn !== "function") return;
    const from = new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z);
    const dir = new THREE.Vector3(shot.at.x - from.x, shot.at.y - from.y, shot.at.z - from.z);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const A = this.T.audio;
    const result = fireFn(from, dir, {
      weaponId: "Type11",
      severityKind: "mg",
      damageScale: shot.damageScale,
      sourceCollider: entry.collider,
      gunCue: A.mgCue,
      gunOpts: {
        volume: A.mgVolume,
        burst: 1,
        weaponClass: "mg",
        occlusionExclude: entry.collider,
        ...(A.mgAirCutHz ? { airCut: A.mgAirCutHz } : {}),
      },
    });

    // 弹着砸在玩家或友军周围掩体沿/沙包上时补充强压制与来火方向弧，营造真正的被机枪按在沟底的压迫感
    if (result?.end) {
      const M = this.T.mg;
      const ex = result.end[0], ey = result.end[1], ez = result.end[2];
      const player = this.host.player;
      if (player?.Alive) {
        const pPos = player.position;
        const hitDist = Math.hypot(ex - pPos.x, ey - (pPos.y + 1.0), ez - pPos.z);
        if (hitDist <= M.suppressRadiusM) {
          const falloff = Math.max(0.25, 1 - hitDist / M.suppressRadiusM);
          player.Suppress(M.suppressPlayerPerShot * falloff, "bullet", from);
        }
        const tankDist = Math.hypot(from.x - pPos.x, from.z - pPos.z);
        if (tankDist < this.T.pressure.fireShakeRangeM) {
          const k = 1 - tankDist / this.T.pressure.fireShakeRangeM;
          player.shake?.Impulse?.({ pitch: this.T.pressure.fireShakePitchRad * k });
        }
      }
      if (soldierEntries && this.host.ai?.SuppressSoldier) {
        const allyRad = M.allySuppressRadiusM ?? 6.0;
        const allyPer = M.allySuppressPerShot ?? 0.16;
        for (const sEntry of soldierEntries.values()) {
          if (sEntry.spec.side !== "nra" || !sEntry.soldier.alive) continue;
          const sp = sEntry.soldier.position;
          const d = Math.hypot(ex - sp.x, ey - (sp.y + 1.0), ez - sp.z);
          if (d <= allyRad) {
            const falloff = Math.max(0.25, 1 - d / allyRad);
            this.host.ai.SuppressSoldier(sEntry.soldier, allyPer * falloff);
          }
        }
      }
    }
  }

  /**
   * 帧后同步（在 puppets.SyncFrame 之后调用）：
   * 施加枪管俯仰角与近爆晃动，读取真实 3D 枪口世界坐标，并更新尾气与履带扬尘粒子。
   */
  PostSync(dt) {
    const vfx = this.host.vfx;
    const H = this.T.hull;
    const P = this.T.pressure;

    for (const [id, entry] of this.tanks) {
      const puppet = this.puppets?.puppets?.get(id);
      const body = puppet?.body;
      const model = body?.userData?.model;
      if (body && model?.tankette) {
        // 枪管俯仰
        if (!entry.gunPitchNode) entry.gunPitchNode = model.tankette.getObjectByName("MachineGunPitch") || null;
        if (entry.gunPitchNode) entry.gunPitchNode.rotation.x = entry.brain.gunPitch;
        // 近爆车身晃动
        body.rotation.x = entry.brain.hullRock;
        body.updateMatrixWorld(true);
        // 实测枪口尖在 MachineGunPitch 本地坐标 [0, -0.02, -0.44]
        if (entry.gunPitchNode) {
          this.tmpPt.set(0, -0.02, -0.44);
          entry.gunPitchNode.localToWorld(this.tmpPt);
          (entry.muzzleWorld ||= new THREE.Vector3()).copy(this.tmpPt);
        } else if (model.turret) {
          this.tmpPt.fromArray(H.muzzleInTurret);
          model.turret.localToWorld(this.tmpPt);
          (entry.muzzleWorld ||= new THREE.Vector3()).copy(this.tmpPt);
        }
        // 履带扬尘 & 引擎尾气
        if (vfx && dt >= 0) {
          const running = !entry.brain.destroyed && entry.brain.rpm > 60 && puppet.visible;
          const dusty = running && (entry.brain.speed >= P.minDustSpeedMps || Math.abs(entry.brain.pivotRate) > 0.08);
          for (let i = 0; i < 2; i++) {
            if (dusty) {
              this.tmpPt.fromArray(H.trackDustOffsets[i]);
              body.localToWorld(this.tmpPt);
              if (entry.fx.dust[i] == null) entry.fx.dust[i] = vfx.SmokeSource(this.tmpPt.clone(), TRACK_DUST);
              else vfx.MoveSmokeSource(entry.fx.dust[i], this.tmpPt);
            } else if (entry.fx.dust[i] != null) {
              vfx.RemoveSmokeSource(entry.fx.dust[i]);
              entry.fx.dust[i] = null;
            }
          }
          if (running) {
            this.tmpPt.fromArray(H.exhaustOffset);
            body.localToWorld(this.tmpPt);
            if (entry.fx.exhaust == null) entry.fx.exhaust = vfx.SmokeSource(this.tmpPt.clone(), EXHAUST_SMOKE);
            else vfx.MoveSmokeSource(entry.fx.exhaust, this.tmpPt);
          } else if (entry.fx.exhaust != null) {
            vfx.RemoveSmokeSource(entry.fx.exhaust);
            entry.fx.exhaust = null;
          }
        }
      } else {
        entry.muzzleWorld = null;
      }
    }
  }

  /** 玩家子弹击中九四式装甲：清脆金属叮当声 + 触发炮塔甩转仇恨压制。 */
  OnBulletHit(tankId, point, from) {
    const entry = tankId ? this.tanks.get(tankId) : null;
    if (point) this.Sound?.OnBulletHit({ x: point.x, y: point.y, z: point.z });
    if (!entry) return null;
    return entry.brain.OnBulletHit({ from: from ? { x: from.x, y: from.y, z: from.z } : null, shooterId: "player" });
  }

  /** 附近手榴弹或集束弹爆炸：晃动车身并甩塔反压投掷者。 */
  OnBlast(event) {
    if (!event?.position) return;
    const pos = { x: event.position.x, y: event.position.y, z: event.position.z };
    const thrower = event.byPlayer && this.host.player?.Alive
      ? { x: this.host.player.position.x, y: this.host.player.position.y + 1.1, z: this.host.player.position.z }
      : null;
    for (const entry of this.tanks.values()) {
      entry.brain.OnBlast({ position: pos, thrower, throwerId: event.byPlayer ? "player" : "blast" });
    }
  }

  State() {
    return [...this.tanks.values()].map((e) => e.brain.Snapshot());
  }

  Reset() {
    for (const entry of this.tanks.values()) this.ReleaseTank(entry);
    this.tanks.clear();
    this.sound?.Stop();
    this.nearestCollider = null;
    this.decoyBurst = { nextAt: 0, remaining: 0, nextShotAt: 0, tankId: null };
  }

  Dispose() {
    this.Reset();
    this.sound?.StopLoops?.(0.2);
    this.sound = null;
  }
}
