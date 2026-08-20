// 《血战台儿庄》战斗规则：投掷物、白刃、日军间接火力、胜负判定。
//
// 为什么单独一层：这些规则既不属于 AI（Script_Ai 管的是「一个兵怎么想」），
// 也不属于装配层（Script_Main 只管启动顺序与每帧调度）。
//
// 史实底子（见 docs/Data_HistoryMaterial.md 一·四 与 五）：
//   · 手榴弹是台儿庄真正的主战兵器，第 31 师一役用掉三十万余枚。
//     仗打完地上的弹皮积了十厘米厚，满地都是木柄。所以它不该是"备用道具"，
//     而该是玩家最常按的那个键。
//   · 打战车靠集束手榴弹：五到七枚去柄捆在一枚带柄弹上。全战区的战防炮就那么几门。
//     八九式中战车装甲最厚 17 mm，巷子窄它转不了身、也抬不起炮打屋顶 ——
//     所以正确解法是**从高处砸下去**，这条是史实推出来的玩法。
//   · 大刀是近身补充兵器，不是万能主武器。配合手榴弹用于夜袭与巷战。
//   · 八九式重掷弹筒没有两脚架，弧形驻钣抵地约 45° 手持发射，能越过院墙打进院子 ——
//     它是玩家躲在院子里时的持续压力源，也是"原地不动就是靶子"这条规则的来源。

import * as THREE from "three";
import { WEAPONS } from "./Data_Weapons.mjs";
import { SUPPORT, COMBAT } from "./Data_Battle.mjs";
import { Mulberry32, Clamp, Clamp01 } from "./Script_Noise.mjs";

const GRAVITY = 19.6;

/** 一枚在飞的投掷物。 */
class Projectile {
  constructor(kind, position, velocity, weapon, owner) {
    this.kind = kind;                 // "Grenade" | "GrenadeBundle"
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.weapon = weapon;
    this.owner = owner;               // "player" | "ija"
    this.fuse = weapon.fuseS ?? 4.2;
    this.alive = true;
    this.spin = 0;
    this.mesh = null;
    /** 物理世界里的那颗刚体（有物理时才有；见 CombatSystem.Launch）。 */
    this.body = null;
  }
}

export class CombatSystem {
  /**
   * @param {object} host { battlefield, ai, vfx, audio, lights, player, library, scene, story }
   */
  constructor(host) {
    this.host = host;
    this.projectiles = [];
    this.incoming = [];               // 日军掷弹筒/重炮的在途弹
    this.rnd = Mulberry32(19380324);
    this.time = 0;
    this.launcherTimer = 8;
    this.artilleryTimer = 26;
    this.support = { mortar: SUPPORT.nra[0].uses, runner: SUPPORT.nra[1].uses };
    this.mortarCooldown = 0;
    this.runnerCooldown = 0;
    this.mortarInFlight = [];
    this.tmp = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();

    // 投掷物的视觉：一个木柄弹体。池化 —— 投弹是最常用的动作，
    // 每次 new Mesh 会在半个小时的战斗里攒出上千个几何体。
    this.pool = [];
    this.poolIndex = 0;
    const geometry = new THREE.CylinderGeometry(0.028, 0.030, 0.22, 6);
    geometry.rotateX(Math.PI / 2);
    const head = new THREE.CylinderGeometry(0.029, 0.029, 0.09, 8);
    head.rotateX(Math.PI / 2);
    head.translate(0, 0, -0.12);
    for (let i = 0; i < 12; i += 1) {
      const group = new THREE.Group();
      const stick = new THREE.Mesh(geometry, host.library.Get("WoodStock"));
      const body = new THREE.Mesh(head, host.library.Get("Steel"));
      group.add(stick, body);
      group.visible = false;
      group.castShadow = false;
      host.scene.add(group);
      this.pool.push(group);
    }
  }

  TakeMesh() {
    const m = this.pool[this.poolIndex % this.pool.length];
    this.poolIndex += 1;
    m.visible = true;
    return m;
  }

  /**
   * 玩家投弹。
   * @param {string} kind "Grenade" | "GrenadeBundle"
   * @param {number} power 0..1 蓄力
   */
  Throw(kind, power, fromPosition, direction, cookedFor = 0) {
    const weapon = WEAPONS[kind];
    if (!weapon) return null;
    const speed = weapon.throwSpeedMin
      + (weapon.throwSpeedMax - weapon.throwSpeedMin) * Clamp01(power);
    const velocity = direction.clone().normalize().multiplyScalar(speed);
    velocity.y += speed * 0.26;                     // 抛物线：手榴弹是抛出去的，不是打出去的
    const start = fromPosition.clone().addScaledVector(direction, 0.4);
    start.y += 0.1;
    const p = new Projectile(kind, start, velocity, weapon, "player");
    this.Attach(p);
    // 攥着数几秒再扔（cook）：老兵的做法，落地即炸不给对面时间踢回来
    p.fuse = Math.max(0.35, p.fuse - cookedFor);
    p.mesh = this.TakeMesh();
    p.mesh.position.copy(start);
    this.projectiles.push(p);
    if (this.host.audio) this.host.audio.Play("grenadeThrow", { position: start.clone(), volume: 0.8 });
    return p;
  }

  /**
   * 给一枚投掷物挂上刚体。
   *
   * 木柄手榴弹在地上是**滚**的，而原来那套「射线撞到就按法线反射 + 落地衰减」
   * 滚不起来：弹到墙角会原地抖，落地之后水平速度每帧乘 0.62，十几帧就钉死。
   * 换成真刚体之后墙角、台阶、坡面这些地方的行为都不用再各写一条规则。
   *
   * 半径给 0.055 m —— 木柄弹的弹体直径约 5 cm，滚起来的手感由它决定。
   */
  Attach(p) {
    const physics = this.host.physics;
    if (!physics) return p;
    p.body = physics.MakeSphere({
      position: p.position,
      velocity: p.velocity,
      radius: 0.055,
      mass: p.kind === "GrenadeBundle" ? 3.2 : 0.6,
      restitution: 0.24,
      friction: 0.68,
    });
    return p;
  }

  /** 拆刚体。爆炸、换关、超时都要走这一条，不然刚体会一直攒着。 */
  Detach(p) {
    if (p.body && this.host.physics) this.host.physics.RemoveBody(p.body);
    p.body = null;
  }

  /** 白刃：正前方一个扇形，够着谁算谁。大刀比刺刀短一点但伤害高。 */
  Melee(weaponId, fromPosition, direction) {
    const weapon = WEAPONS[weaponId] || WEAPONS.Dadao;
    const reach = weapon.reachM ?? 2.0;
    const ai = this.host.ai;
    let hit = null, best = 1e9;
    for (const s of ai.soldiers) {
      if (!s.alive || s.side === "nra") continue;
      const rel = this.tmp.subVectors(s.position, fromPosition);
      rel.y = 0;
      const dist = rel.length();
      if (dist > reach) continue;
      // 只砍身前 120° 那一片
      if (rel.normalize().dot(this.tmpB.set(direction.x, 0, direction.z).normalize()) < 0.5) continue;
      if (dist < best) { best = dist; hit = s; }
    }
    if (hit) {
      const died = hit.TakeHit(weapon.damage, "torso", direction);
      const at = hit.position.clone(); at.y += 1.0;
      if (this.host.vfx) this.host.vfx.Blood(at, direction, died ? 1 : 0.6);
      if (this.host.audio) {
        this.host.audio.Play(weaponId === "Dadao" ? "dadaoHit" : "bayonetHit",
          { position: at, volume: 0.9 });
      }
      return { hit, died };
    }
    if (this.host.audio) this.host.audio.Play("dadaoSwing", { volume: 0.6 });
    return null;
  }

  /**
   * 日军间接火力。掷弹筒能越过院墙打进院子 —— 这是"原地不动就是靶子"的物理来源。
   * 落点先给啸声与地面标记（warnLeadS），玩家有一秒半时间挪开。
   */
  CallIncoming(kind, targetPosition) {
    const spec = kind === "artillery"
      ? SUPPORT.ija.find((s) => s.id === "artillery")
      : SUPPORT.ija.find((s) => s.id === "launcher");
    const jitter = kind === "artillery" ? 7 : 3.2;
    const at = targetPosition.clone();
    at.x += (this.rnd() - 0.5) * jitter;
    at.z += (this.rnd() - 0.5) * jitter;
    at.y = this.host.battlefield.GroundHeight(at.x, at.z);
    const flight = kind === "artillery" ? 2.6 : 1.6;
    this.incoming.push({ at, t: 0, flight, spec, kind });
    if (this.host.vfx) this.host.vfx.IncomingMarker(at, flight);
    if (this.host.audio) {
      this.host.audio.Play("shellIncoming", { position: at.clone(), volume: kind === "artillery" ? 1 : 0.7 });
    }
    return at;
  }

  /** 中方支援：二十年式 82 mm 迫击炮，全集团军就那么几门，一局两发。 */
  CallMortar(targetPosition) {
    const spec = SUPPORT.nra.find((s) => s.id === "mortar");
    if (this.support.mortar <= 0 || this.mortarCooldown > 0) {
      return { ok: false, reason: this.support.mortar <= 0 ? "没有炮弹了" : "炮位还在装填" };
    }
    this.support.mortar -= 1;
    this.mortarCooldown = spec.cooldownS;
    const at = targetPosition.clone();
    at.x += (this.rnd() - 0.5) * 5;
    at.z += (this.rnd() - 0.5) * 5;
    at.y = this.host.battlefield.GroundHeight(at.x, at.z);
    this.mortarInFlight.push({ at, t: 0, flight: spec.delayS, spec });
    return { ok: true, at, left: this.support.mortar };
  }

  Update(dt, ctx) {
    this.time += dt;
    if (this.mortarCooldown > 0) this.mortarCooldown -= dt;
    if (this.runnerCooldown > 0) this.runnerCooldown -= dt;

    this.StepProjectiles(dt);
    this.StepIncoming(dt, ctx);
    this.StepIjaSupport(dt, ctx);
    return null;
  }

  StepProjectiles(dt) {
    const bf = this.host.battlefield;
    const physics = this.host.physics;
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.fuse -= dt;
      if (p.body) {
        // 刚体版：飞行、撞墙、弹跳、滚动全归引擎。这里只补一件引擎不知道的事 ——
        // 地表是解析式的（不在物理世界里），落到土地上那一下要手写。
        const t = p.body.translation();
        p.position.set(t.x, t.y, t.z);
        physics.ClampToGround(p.body, dt);
        const q = p.body.rotation();
        if (p.mesh) {
          p.mesh.position.copy(p.position);
          p.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        }
      } else {
        // 没有物理世界时的兜底（编辑器在切片重建的空档里也会跑这条路）
        p.velocity.y -= GRAVITY * dt;
        const step = this.tmp.copy(p.velocity).multiplyScalar(dt);
        const dist = step.length();
        if (dist > 1e-4) {
          const dir = this.tmpB.copy(step).divideScalar(dist);
          const hit = bf.Raycast(p.position, dir, dist, { terrain: true });
          if (hit) {
            p.position.addScaledVector(dir, Math.max(0, hit.t - 0.03));
            const n = new THREE.Vector3(hit.normal[0], hit.normal[1], hit.normal[2]);
            p.velocity.reflect(n).multiplyScalar(0.34);
          } else {
            p.position.add(step);
          }
        }
        const ground = bf.GroundHeight(p.position.x, p.position.z);
        if (p.position.y < ground + 0.03) {
          p.position.y = ground + 0.03;
          p.velocity.y = Math.abs(p.velocity.y) * 0.26;
          p.velocity.x *= 0.62;
          p.velocity.z *= 0.62;
        }
        if (p.mesh) {
          p.mesh.position.copy(p.position);
          p.spin += dt * 9;
          p.mesh.rotation.set(p.spin, p.spin * 0.7, 0);
        }
      }
      if (p.fuse <= 0) {
        this.Detonate(p);
        if (p.mesh) p.mesh.visible = false;
        this.Detach(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  StepIncoming(dt, ctx) {
    for (let i = this.incoming.length - 1; i >= 0; i -= 1) {
      const shell = this.incoming[i];
      shell.t += dt;
      if (shell.t < shell.flight) continue;
      this.Blast(shell.at, shell.spec.radius, shell.spec.damage,
        shell.kind === "artillery" ? "shell" : "launcher");
      if (this.host.story) this.host.story.Signal("shelling");
      this.incoming.splice(i, 1);
    }
    for (let i = this.mortarInFlight.length - 1; i >= 0; i -= 1) {
      const shell = this.mortarInFlight[i];
      shell.t += dt;
      if (shell.t < shell.flight) continue;
      this.Blast(shell.at, shell.spec.radius, shell.spec.damage, "shell");
      this.mortarInFlight.splice(i, 1);
    }
  }

  /**
   * 日军的火力优势是史实：掷弹筒、九二式重机、战车、野战重炮。
   * 中方这边只有两发迫击炮。这个不对称不是难度设计，是这场仗本来的样子。
   */
  StepIjaSupport(dt, ctx) {
    const phase = ctx.phase;
    if (!phase || !phase.ijaSupport) return;
    const player = this.host.player;
    if (!player || !player.Alive) return;

    if (phase.ijaSupport.includes("launcher")) {
      this.launcherTimer -= dt * (phase.ijaPressure ?? 1);
      if (this.launcherTimer <= 0) {
        const spec = SUPPORT.ija.find((s) => s.id === "launcher");
        this.launcherTimer = spec.intervalS * (0.7 + this.rnd() * 0.8);
        // 只在玩家不在开阔奔跑时才打过来：贴着掩体待久了才吃曲射，
        // 这样它是"逼你动起来"的压力，而不是随机惩罚
        const still = Math.hypot(player.velocity.x, player.velocity.z) < 1.4;
        if (still) this.CallIncoming("launcher", player.position);
      }
    }
    if (phase.ijaSupport.includes("artillery") || (phase.ijaPressure ?? 1) > 1.5) {
      this.artilleryTimer -= dt;
      if (this.artilleryTimer <= 0) {
        const spec = SUPPORT.ija.find((s) => s.id === "artillery");
        this.artilleryTimer = spec.intervalS * (0.8 + this.rnd() * 0.6);
        this.CallIncoming("artillery", player.position);
      }
    }
  }

  Detonate(p) {
    const isBundle = p.kind === "GrenadeBundle";
    this.Blast(p.position, p.weapon.radiusM, p.weapon.damage, isBundle ? "tank" : "grenade",
      p.owner === "player" ? "ija" : "nra");
  }

  /**
   * 一次爆炸的结算。
   * 伤害按距离平方衰减，并且**被墙挡住就不吃伤害** —— 隔一堵墙互相扔手榴弹是
   * 台儿庄巷战的标准打法，如果墙不挡弹片，那堵墙就白存在了。
   */
  Blast(position, radius, damage, kind, hurtSide = null) {
    if (this.host.vfx) this.host.vfx.Explosion(position, { radius, kind });
    if (this.host.audio) {
      this.host.audio.Play(radius > 8 ? "explosionNear" : "explosionNear",
        { position: position.clone(), volume: Clamp(radius / 8, 0.5, 1.2) });
    }
    if (this.host.lights) {
      this.host.lights.FlashMuzzle(position, Clamp(radius * 9, 40, 120));
    }
    const bf = this.host.battlefield;
    const ai = this.host.ai;
    const from = position.clone();
    from.y += 0.35;

    const affect = (targetPos, apply) => {
      const rel = this.tmp.subVectors(targetPos, from);
      const dist = rel.length();
      if (dist > radius * 1.9) return;
      const dir = this.tmpB.copy(rel).divideScalar(dist || 1);
      const hit = bf.Raycast(from, dir, dist);
      if (hit && hit.t < dist - 0.5) return;            // 有墙挡着
      const falloff = Clamp01(1 - dist / (radius * 1.9));
      apply(damage * falloff * falloff, dir, falloff);
    };

    for (const s of ai.soldiers) {
      if (!s.alive) continue;
      if (hurtSide && s.side !== hurtSide) {
        // 自己的弹也能伤自己人，但只在很近的时候（避免变成"友军免疫"的假物理）
        const d = s.position.distanceTo(from);
        if (d > radius * 0.75) continue;
      }
      const at = s.position.clone(); at.y += 0.9;
      affect(at, (dmg, dir) => {
        // 不在这里扣票。这条回调以前是 onKill(s) —— 不带 side，装配层写死扣日方池，
        // 于是**日军炮弹炸死中国兵扣的是日军的票**（实跑 ijaPool 700→696 / nraPool 600→600）。
        // 扣票统一由 Soldier.Kill() 发的阵亡事件负责，这里只管伤害与压制。
        s.TakeHit(dmg, "torso", dir);
        s.suppression = Clamp01(s.suppression + 0.8);
      });
    }
    const player = this.host.player;
    if (player && player.Alive) {
      const at = player.position.clone(); at.y += 1.0;
      affect(at, (dmg, dir, falloff) => {
        player.Suppress(0.9 * falloff);
        // 爆炸对玩家的口径也回数据层（COMBAT.player.blastScale）——
        // 这里原来写死 0.7，和 Script_Ai 的 0.55、Script_Player 的部位倍率
        // 各改各的，谁也算不出"一发掷弹筒到底打掉多少血"。
        // 传 from：屏幕边缘那个指向楔形要知道弹是从哪炸的。
        if (dmg > 4) {
          player.TakeHit(dmg * (COMBAT.player?.blastScale ?? 0.55), "torso", dir,
            { from: position.clone(), blast: true });
        }
      });
    }
  }

  get MortarLeft() { return this.support.mortar; }
  get MortarReady() { return this.support.mortar > 0 && this.mortarCooldown <= 0; }

  /** 把在途的投掷物连刚体一起清掉（换关、重开都要走）。 */
  ClearProjectiles() {
    for (const p of this.projectiles) {
      this.Detach(p);
      if (p.mesh) p.mesh.visible = false;
    }
    this.projectiles.length = 0;
  }

  Dispose() {
    this.ClearProjectiles();
    for (const m of this.pool) {
      this.host.scene.remove(m);
      for (const child of m.children) child.geometry.dispose();
    }
    this.pool.length = 0;
    this.incoming.length = 0;
  }
}
