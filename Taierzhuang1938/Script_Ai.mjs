// 《血战台儿庄》士兵 AI 与战斗结算。
//
// 对标 Easy Red 2 的取向：**同屏几十个人**、会找掩体、会被压得抬不起头、
// 会因为班里死得太多而往后缩。不追求单个 AI 有多聪明 —— 战场感来自数量与行为的
// 层次，而不是某一个 AI 的战术天才。
//
// 性能预算（1600×900 / 55fps）：
//   · 同屏活人上限 56（中日各 28），超出的排队等位。
//   · AI 决策**分帧轮转**：每帧只更新 1/6 的人做"想"，所有人都做"动"。
//     全员每帧跑视线检测会直接掉到 20fps。
//   · 视线检测走 Battlefield.Raycast（AABB 空间散列），并带 0.25 s 的结果缓存。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp, Clamp01 } from "./Script_Noise.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { COMBAT, NAME_POOL } from "./Data_Battle.mjs";

const STATE = {
  IDLE: "idle", ADVANCE: "advance", COVER: "cover", FIRE: "fire",
  SUPPRESSED: "suppressed", RELOAD: "reload", DEAD: "dead", CHARGE: "charge",
};

let nextId = 1;

/** 按权重抽一个。 */
function Pick(list, rnd) {
  const total = list.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = rnd() * total;
  for (const item of list) { r -= (item.weight ?? 1); if (r <= 0) return item; }
  return list[list.length - 1];
}

/** 生成一个有名有姓有籍贯的兵。ER2 式「换一个人接着打」靠它。 */
export function MakeSoldierIdentity(seed) {
  const rnd = Mulberry32(seed);
  const surname = NAME_POOL.surnames[Math.floor(rnd() * NAME_POOL.surnames.length)];
  const given = NAME_POOL.given[Math.floor(rnd() * NAME_POOL.given.length)];
  const origin = Pick(NAME_POOL.origins, rnd);
  const weapon = Pick(NAME_POOL.weapons, rnd);
  return {
    name: surname + given,
    origin: origin.place,
    weapon: weapon.id,
    age: 17 + Math.floor(rnd() * 18),
  };
}

export class Soldier {
  constructor(side, options = {}) {
    this.id = nextId++;
    this.side = side;                       // "nra" | "ija"
    this.identity = options.identity || MakeSoldierIdentity(this.id * 7919 + (side === "nra" ? 11 : 97));
    this.weaponId = options.weapon || (side === "nra" ? this.identity.weapon : "Type38");
    this.weapon = WEAPONS[this.weaponId] || WEAPONS.Type38;
    this.position = new THREE.Vector3(options.x || 0, 0, options.z || 0);
    this.velocity = new THREE.Vector3();
    this.yaw = options.ry || 0;
    this.health = 100;
    this.state = STATE.IDLE;
    this.stateTime = 0;
    this.suppression = 0;
    this.stance = 0;                        // 0 站 1 蹲 2 卧
    this.target = null;
    this.targetLostTime = 0;
    this.aimTime = 0;
    this.ammo = this.weapon.magazine || 5;
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.cover = null;
    this.goal = new THREE.Vector3(options.x || 0, 0, options.z || 0);
    this.order = "advance";
    this.rnd = Mulberry32(this.id * 2654435761);
    this.actor = null;
    this.deadTime = 0;
    this.moveSpeed = 0;
    this.losCache = { time: -99, clear: false };
    this.morale = 1;
    this.towel = false;
    // 排队（Conga Line）是 ER2 被骂最狠的毛病之一：一个班沿同一条线走成一串。
    // 对策是每个人生成时就领一个固定的横向偏移，跟随目标时永远偏这么多。
    this.laneOffset = (this.rnd() - 0.5) * 11;
    // 守点纪律：ER2 的 AI 会在赶路途中就地对射、根本不进点，导致「只要防守方
    // 看得见攻方，这张图就极好打」。这里给防守单位一条硬规矩：
    // 一旦被派去守某个占领区，除非死亡，否则不许离开该区半径。
    this.holdZone = null;
    this.muzzle = new THREE.Vector3();
    this.lastFire = -99;
  }

  get alive() { return this.state !== STATE.DEAD; }

  Kill(direction) {
    if (this.state === STATE.DEAD) return false;
    this.state = STATE.DEAD;
    this.health = 0;
    this.deadTime = 0;
    if (this.actor) this.actor.Ragdoll(direction || new THREE.Vector3(0, 0, 1));
    return true;
  }

  TakeHit(damage, part, direction) {
    if (!this.alive) return false;
    const mult = part === "head" ? 3.2 : part === "torso" ? 1.0 : 0.6;
    this.health -= damage * mult;
    this.suppression = Clamp01(this.suppression + 0.45);
    if (this.health <= 0) return this.Kill(direction);
    return false;
  }
}

export class AiDirector {
  /**
   * @param {object} ctx { battlefield, actorFactory, scene, vfx, audio, player }
   */
  constructor(ctx, { maxAlive = 56, seed = 1938 } = {}) {
    this.ctx = ctx;
    this.soldiers = [];
    this.maxAlive = maxAlive;
    this.rnd = Mulberry32(seed);
    this.tickIndex = 0;
    this.time = 0;
    this.corpses = [];
    this.maxCorpses = 26;
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();
  }

  get aliveCount() { return this.soldiers.reduce((n, s) => n + (s.alive ? 1 : 0), 0); }
  CountSide(side) { return this.soldiers.filter((s) => s.side === side && s.alive).length; }

  Spawn(side, x, z, options = {}) {
    if (this.aliveCount >= this.maxAlive) return null;
    const soldier = new Soldier(side, { ...options, x, z });
    soldier.position.y = this.ctx.battlefield.GroundHeight(x, z);
    const kind = side === "nra" ? (options.towel ? "nraDare" : "nra") : "ija";
    soldier.actor = this.ctx.actorFactory.Create(kind, {
      seed: soldier.id * 131 + 7,
      weapon: soldier.weaponId,
    });
    if (options.towel) { soldier.towel = true; soldier.actor.SetTowel(true); }
    soldier.actor.root.position.copy(soldier.position);
    this.ctx.scene.add(soldier.actor.root);
    this.soldiers.push(soldier);
    return soldier;
  }

  Remove(soldier) {
    const i = this.soldiers.indexOf(soldier);
    if (i >= 0) this.soldiers.splice(i, 1);
    if (soldier.actor) {
      this.ctx.scene.remove(soldier.actor.root);
      soldier.actor.Dispose();
      soldier.actor = null;
    }
  }

  /** 给某一侧下达总目标（占领点）。带横向偏移，避免全班走成一条线。 */
  SetSideGoal(side, x, z) {
    for (const s of this.soldiers) {
      if (s.side !== side || !s.alive) continue;
      if (s.order === "hold" || s.holdZone) continue;
      s.goal.set(x + s.laneOffset, 0, z + s.laneOffset * 0.4);
    }
  }

  /** 派若干人去守一个占领区。进了区就不许再出去。 */
  AssignDefenders(side, objective, count) {
    let n = 0;
    const pool = this.soldiers
      .filter((s) => s.side === side && s.alive && !s.holdZone)
      .sort((a, b) => a.position.distanceTo(objective) - b.position.distanceTo(objective));
    for (const s of pool) {
      if (n >= count) break;
      s.holdZone = objective;
      const a = s.rnd() * Math.PI * 2;
      const r = objective.radius * (0.35 + s.rnd() * 0.55);
      s.goal.set(objective.x + Math.cos(a) * r, 0, objective.z + Math.sin(a) * r);
      n += 1;
    }
    return n;
  }

  /** 玩家给身边的弟兄下命令。 */
  IssueOrder(orderId, origin, aimPoint, radius = 26) {
    let n = 0;
    for (const s of this.soldiers) {
      if (s.side !== "nra" || !s.alive) continue;
      if (s.position.distanceTo(origin) > radius) continue;
      s.order = orderId;
      if (orderId === "follow") s.goal.copy(origin);
      else if (orderId === "advance" && aimPoint) s.goal.copy(aimPoint);
      else if (orderId === "hold") s.goal.copy(s.position);
      else if (orderId === "spread") {
        const a = s.rnd() * Math.PI * 2;
        s.goal.set(s.position.x + Math.cos(a) * 7, 0, s.position.z + Math.sin(a) * 7);
      }
      n += 1;
    }
    return n;
  }

  Update(dt, camera) {
    this.time += dt;
    this.tickIndex += 1;
    const slice = this.tickIndex % 6;
    const player = this.ctx.player;

    for (let i = 0; i < this.soldiers.length; i += 1) {
      const s = this.soldiers[i];
      if (!s.alive) {
        s.deadTime += dt;
        if (s.actor) s.actor.Update(dt, { dead: true, dying: Clamp01(s.deadTime / 0.9), elapsed: this.time });
        continue;
      }
      // 「想」分帧轮转：每帧只有六分之一的人重新决策
      if (i % 6 === slice) this.Think(s, dt * 6, player);
      this.Act(s, dt, player);
    }

    // 尸体上限：超了就把最早的移走（战场上得有尸体，但不能无限堆）
    const dead = this.soldiers.filter((s) => !s.alive).sort((a, b) => b.deadTime - a.deadTime);
    while (dead.length > this.maxCorpses) this.Remove(dead.shift());
  }

  // ---------------------------------------------------------------- 决策
  Think(s, dt, player) {
    s.suppression = Math.max(0, s.suppression - COMBAT.suppressDecayPerS * dt);

    // 找目标：优先最近的、看得见的敌人（玩家也算一个）
    const enemySide = s.side === "nra" ? "ija" : "nra";
    let best = null, bestDist = 1e9;
    if (enemySide === "nra" && player && player.Alive) {
      const d = s.position.distanceTo(player.position);
      if (d < 120) { best = { position: player.position, isPlayer: true, ref: player }; bestDist = d; }
    }
    for (const other of this.soldiers) {
      if (other.side !== enemySide || !other.alive) continue;
      const d = s.position.distanceTo(other.position);
      if (d < bestDist && d < 120) { best = { position: other.position, ref: other }; bestDist = d; }
    }

    if (best) {
      const clear = this.HasLineOfSight(s, best.position);
      if (clear) {
        s.target = best;
        s.targetLostTime = 0;
      } else if (s.target && s.targetLostTime > 2.5) {
        s.target = null;
      } else {
        s.targetLostTime += dt;
      }
    } else {
      s.target = null;
    }

    // 士气：同侧活人比例太低就往后缩
    const mates = this.soldiers.filter((o) => o.side === s.side && o.alive
      && o.position.distanceTo(s.position) < 34).length;
    s.morale = Clamp01(0.35 + mates / 8);

    // 状态机
    if (s.suppression > 0.72) {
      s.state = STATE.SUPPRESSED;
      s.stance = 2;
    } else if (s.ammo <= 0) {
      s.state = STATE.RELOAD;
      s.reloadTimer = s.weapon.reloadTimeS || 3.2;
    } else if (s.target && bestDist < 70) {
      // 近了就压上去打（尤其反攻阶段），远了就找掩体对射
      s.state = bestDist < 16 && s.morale > 0.5 ? STATE.CHARGE : STATE.FIRE;
      s.stance = bestDist < 20 ? 0 : 1;
    } else {
      s.state = STATE.ADVANCE;
      s.stance = s.suppression > 0.3 ? 1 : 0;
    }

    // 掩体：朝目标方向找一个 1 米内能挡住的点
    if (s.state === STATE.FIRE && (!s.cover || s.rnd() < 0.12)) {
      s.cover = this.FindCover(s, best ? best.position : null);
    }
  }

  FindCover(s, threatPos) {
    const covers = this.ctx.battlefield.covers;
    if (!covers || !covers.length) return null;
    let best = null, bestScore = -1e9;
    // 只在附近抽样看 24 个 —— 全场几千个掩体点，全扫会卡
    const start = Math.floor(s.rnd() * covers.length);
    for (let i = 0; i < 24; i += 1) {
      const c = covers[(start + i * 37) % covers.length];
      const d = Math.hypot(c.x - s.position.x, c.z - s.position.z);
      if (d > 22) continue;
      let score = -d * 0.5 + Math.min(c.height, 1.4) * 6;
      if (threatPos) {
        // 掩体要在自己与威胁之间
        const toThreat = Math.atan2(threatPos.x - s.position.x, threatPos.z - s.position.z);
        const toCover = Math.atan2(c.x - s.position.x, c.z - s.position.z);
        const diff = Math.abs(((toCover - toThreat + Math.PI) % (Math.PI * 2)) - Math.PI);
        score -= diff * 6;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  HasLineOfSight(s, targetPos) {
    if (this.time - s.losCache.time < 0.25) return s.losCache.clear;
    const from = this.tmpA.set(s.position.x, s.position.y + 1.5, s.position.z);
    const to = this.tmpB.set(targetPos.x, targetPos.y + 1.4, targetPos.z);
    const dir = this.tmpC.subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    const hit = this.ctx.battlefield.Raycast(from, dir, dist);
    const clear = !hit || hit.t >= dist - 0.4;
    s.losCache = { time: this.time, clear };
    return clear;
  }

  // ---------------------------------------------------------------- 执行
  Act(s, dt, player) {
    const bf = this.ctx.battlefield;
    let desired = null;
    let speed = 0;

    switch (s.state) {
      case STATE.SUPPRESSED:
        speed = 0;
        break;
      case STATE.RELOAD:
        s.reloadTimer -= dt;
        if (s.reloadTimer <= 0) { s.ammo = s.weapon.magazine || 5; s.state = STATE.IDLE; }
        break;
      case STATE.FIRE:
        if (s.cover) {
          const d = Math.hypot(s.cover.x - s.position.x, s.cover.z - s.position.z);
          if (d > 1.1) { desired = this.tmpA.set(s.cover.x, 0, s.cover.z); speed = 2.4; }
        }
        this.TryFire(s, dt, player);
        break;
      case STATE.CHARGE:
        // 守点的人不冲锋 —— 冲出去就是把点让出来
        if (s.target && !s.holdZone) { desired = this.tmpA.copy(s.target.position); speed = 3.6; }
        this.TryFire(s, dt, player);
        break;
      case STATE.ADVANCE:
      default:
        desired = this.tmpA.copy(s.goal);
        speed = s.order === "hold" ? 0 : 2.6;
        break;
    }

    // 移动：直奔目标 + 撞墙就沿墙滑。没有寻路网格 —— 街巷本来就是通的，
    // 真卡住 1.5 秒就随机换个方向绕，够用且比 A* 便宜两个数量级。
    if (desired && speed > 0) {
      const dx = desired.x - s.position.x, dz = desired.z - s.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.2) {
        const nx = dx / d, nz = dz / d;
        const step = speed * dt * (s.stance === 1 ? 0.6 : s.stance === 2 ? 0.3 : 1);
        const tryX = s.position.x + nx * step;
        const tryZ = s.position.z + nz * step;
        if (!this.Blocked(tryX, s.position.z, s.position.y)) s.position.x = tryX;
        if (!this.Blocked(s.position.x, tryZ, s.position.y)) s.position.z = tryZ;
        s.yaw = Math.atan2(-nx, -nz);
        s.moveSpeed = Clamp01(speed / 3.6);
      } else {
        s.moveSpeed = 0;
      }
    } else {
      s.moveSpeed = 0;
    }

    // 守点纪律：交战只允许在区内换位。追出去打 = 点丢了。
    if (s.holdZone) {
      const dx = s.position.x - s.holdZone.x, dz = s.position.z - s.holdZone.z;
      const d = Math.hypot(dx, dz);
      if (d > s.holdZone.radius) {
        s.position.x = s.holdZone.x + dx / d * s.holdZone.radius;
        s.position.z = s.holdZone.z + dz / d * s.holdZone.radius;
      }
    }

    if (s.target) {
      const dx = s.target.position.x - s.position.x, dz = s.target.position.z - s.position.z;
      s.yaw = Math.atan2(-dx, -dz);
    }
    s.position.y = bf.GroundHeight(s.position.x, s.position.z);

    if (s.actor) {
      s.actor.root.position.copy(s.position);
      s.actor.root.rotation.y = s.yaw;
      s.actor.Update(dt, {
        moveSpeed: s.moveSpeed,
        aim: s.state === STATE.FIRE ? 1 : 0,
        crouch: s.stance === 1 ? 1 : 0,
        prone: s.stance === 2 ? 1 : 0,
        firing: this.time - s.lastFire < 0.12,
        elapsed: this.time,
        lookYaw: 0, lookPitch: 0,
      });
    }
  }

  Blocked(x, z, y) {
    const list = this.ctx.battlefield.NearbyColliders(x, z, 1.2);
    for (const b of list) {
      if (x < b.min[0] - 0.35 || x > b.max[0] + 0.35) continue;
      if (z < b.min[2] - 0.35 || z > b.max[2] + 0.35) continue;
      if (y + 1.6 < b.min[1] || y > b.max[1]) continue;
      if (b.max[1] - y < 0.56) continue;             // 矮的东西能跨过去
      return true;
    }
    return false;
  }

  TryFire(s, dt, player) {
    s.fireTimer -= dt;
    if (s.fireTimer > 0 || !s.target || s.ammo <= 0) return;
    s.aimTime += dt;
    const aimNeeded = s.weapon.aiAimTimeS ?? 0.8;
    if (s.aimTime < aimNeeded * (1 + s.suppression)) return;

    const from = this.tmpA.set(s.position.x, s.position.y + (s.stance === 2 ? 0.5 : s.stance === 1 ? 1.1 : 1.5), s.position.z);
    const to = this.tmpB.copy(s.target.position);
    to.y += 1.1;
    const dir = this.tmpC.subVectors(to, from);
    const dist = dir.length();
    dir.divideScalar(dist || 1);

    s.ammo -= 1;
    s.fireTimer = s.weapon.fireIntervalS ?? 1.2;
    s.lastFire = this.time;
    s.aimTime = 0;

    // 命中判定：基础命中率按距离、压制、姿态修正。**AI 不许百发百中** ——
    // 那会让玩家觉得自己在被作弊，而不是在被压制。
    let acc = (s.weapon.aiAccuracy ?? COMBAT.aiAccuracyBase);
    acc *= Clamp(1.25 - dist / (s.weapon.effectiveRangeM || 400) * 1.6, 0.08, 1);
    acc *= s.suppression > 0.3 ? COMBAT.aiAccuracySuppressed / COMBAT.aiAccuracyBase : 1;
    if (s.target.isPlayer && player) acc *= player.stance === "prone" ? 0.45 : player.stance === "crouch" ? 0.72 : 1;

    const hit = s.rnd() < acc;
    const vfx = this.ctx.vfx;
    const audio = this.ctx.audio;
    if (vfx) {
      vfx.MuzzleFlash(from, dir, { scale: s.weapon.kind === "lmg" ? 1.25 : 1 });
      vfx.Tracer(from, this.tmpB.clone().copy(from).addScaledVector(dir, dist), {
        kind: s.side === "nra" ? "nra" : "ija",
      });
    }
    if (audio) {
      const name = s.side === "nra"
        ? (s.weaponId === "Zb26" ? "zb26" : "rifleNra")
        : (s.weaponId === "Type11" ? "type11" : s.weaponId === "Type92Hmg" ? "type92" : "rifleIja");
      audio.Play(name, { position: from.clone(), volume: 1 });
    }

    if (hit) {
      const part = s.rnd() < 0.08 ? "head" : s.rnd() < 0.6 ? "torso" : (s.rnd() < 0.5 ? "arm" : "leg");
      if (s.target.isPlayer && player) {
        player.TakeHit(s.weapon.damage * 0.55, part, dir);
      } else if (s.target.ref) {
        const died = s.target.ref.TakeHit(s.weapon.damage, part, dir);
        if (vfx) vfx.Blood(to, dir, died ? 1 : 0.5);
      }
    } else {
      // 打偏了：仍然要压制。近失弹从耳边过去，那声音本身就是武器。
      if (s.target.isPlayer && player) {
        const miss = 0.4 + s.rnd() * 1.4;
        if (miss < COMBAT.suppressRadius) player.Suppress(COMBAT.suppressPerNearMiss * (1 - miss / COMBAT.suppressRadius) * 3);
      } else if (s.target.ref) {
        s.target.ref.suppression = Clamp01(s.target.ref.suppression + COMBAT.suppressPerNearMiss);
      }
      if (vfx) {
        const missPoint = to.clone().add(new THREE.Vector3((s.rnd() - 0.5) * 2.2, (s.rnd() - 0.5) * 1.6, (s.rnd() - 0.5) * 2.2));
        const bf = this.ctx.battlefield;
        const h = bf.Raycast(from, missPoint.sub(from).normalize(), dist + 6);
        if (h) {
          const p = from.clone().addScaledVector(missPoint, h.t);
          vfx.Impact(p, new THREE.Vector3(h.normal[0], h.normal[1], h.normal[2]), "brick");
        }
      }
    }
  }

  Dispose() {
    for (const s of [...this.soldiers]) this.Remove(s);
    this.soldiers.length = 0;
  }
}

export { STATE };
