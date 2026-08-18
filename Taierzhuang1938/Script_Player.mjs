// 《血战台儿庄》玩家控制器：移动、碰撞、姿态、自由瞄准、压制、伤口。
//
// 对标 Easy Red 2 的手感取向：**没有准星**，只有机械瞄具；自由瞄准（枪口可以
// 在视野里滑动，不是死钉在屏幕中心）；栓动枪一发一拉，节奏本身就是压力来源；
// 受伤是流血与失能，不是一格一格掉的血条。
//
// 碰撞用胶囊 vs AABB 表，不上物理引擎 —— 场景是静态的，AABB 表在建关时一次生成，
// 每帧只查玩家附近那一小格。

import * as THREE from "three";
import { Clamp, Clamp01, Mulberry32 } from "./Script_Noise.mjs";
import { DIFFICULTY } from "./Data_Battle.mjs";

const UP = new THREE.Vector3(0, 1, 0);

/** 姿态参数。眼高按真人来：站 1.62，蹲 1.05，卧 0.42（趴下之后视线只比枪高一点）。 */
export const STANCE = {
  stand: { eye: 1.62, speed: 3.05, radius: 0.34, sway: 1.0, spread: 1.0, label: "立" },
  crouch: { eye: 1.05, speed: 1.62, radius: 0.34, sway: 0.62, spread: 0.66, label: "蹲" },
  prone: { eye: 0.42, speed: 0.72, radius: 0.42, sway: 0.30, spread: 0.34, label: "卧" },
};

export class PlayerController {
  constructor(camera, world, { seed = 1 } = {})
  {
    this.camera = camera;
    this.world = world;                    // { colliders, GroundHeight(x,z), bounds }
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    // 自由瞄准：枪口方向可以偏离视线中心一小段，鼠标先推动枪、枪撞到边界才带动视线。
    // 这是 ER2「没有准星也打得准」的物理基础 —— 玩家看的是枪，不是屏幕中心。
    this.aimYaw = 0;
    this.aimPitch = 0;
    // ER2 其实**没有**自由瞄准（benchmark 把这条列为"查不到证据"级别的否定结论）。
    // 我们保留它，但从 5.0° 降到难度表里的默认 2.0° —— 5° 太大，玩家会觉得枪不听话；
    // 完全去掉又会退化成"枪很稳但打不中"。0 档要等弹道/视差/后坐三条落地才开放，
    // 这一批三条都落地了，所以 DIFFICULTY.freeAimDeg 的 0 档现在是合法的。
    this.freeAimLimitDeg = DIFFICULTY.freeAimDeg;

    // --- 后坐 ---------------------------------------------------------------
    // Data_Weapons 里每支枪都有 recoil:{pitch,yaw,kick,recoverS}，以前一次都没读过：
    // 开完枪视角纹丝不动，只有散布在变。现在开火时把枪口顶上去，然后**只回落 70%**，
    // 剩下 30% 要玩家自己压回来 —— 这是"栓动枪打完一发要重新找目标"的手感来源。
    this.recoilPending = { pitch: 0, yaw: 0 };   // 还没回落完的那部分（弧度）
    this.recoilRecoverS = 0.4;
    this.recoilTotal = 0;                       // 本轮累计顶了多少（弧度，取证用）

    // 两脚架。捷克式全班就一挺，架起来才有 800 m 有效射程；ER2 的规矩是**不架不能开镜**。
    this.bipod = false;
    this.fastCrawl = false;                     // 卧姿按住 Shift：更快也更响

    this.stance = "stand";
    this.stanceBlend = { crouch: 0, prone: 0 };
    this.grounded = true;
    this.sprint = 0;
    this.ads = 0;
    this.lean = 0;                          // -1 左, +1 右
    this.breath = 0;                        // 屏息剩余
    this.breathHold = false;

    this.health = 100;
    this.bleeding = 0;                      // 每秒失血
    this.wounds = [];                       // { part, bleed, since }
    this.bandages = 2;
    this.suppression = 0;                   // 0..1，被打压的程度
    this.stamina = 1;

    this.eyeHeight = STANCE.stand.eye;
    this.radius = STANCE.stand.radius;
    this.headBob = 0;
    this.stepDistance = 0;
    this.rnd = Mulberry32(seed);
    this.lastFootstep = 0;
    this.deadTime = 0;
    this.alive = true;

    this._tmp = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  Spawn(x, z, ry = 0) {
    this.position.set(x, this.world.GroundHeight(x, z), z);
    this.yaw = ry;
    this.pitch = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.velocity.set(0, 0, 0);
    this.health = 100;
    this.bleeding = 0;
    this.wounds.length = 0;
    this.suppression = 0;
    this.stamina = 1;
    this.stance = "stand";
    this.alive = true;
    this.deadTime = 0;
    this.recoilPending.pitch = 0;
    this.recoilPending.yaw = 0;
    this.recoilTotal = 0;
    this.bipod = false;
    this.fastCrawl = false;
    this.freeAimLimitDeg = DIFFICULTY.freeAimDeg;
  }

  get Alive() { return this.alive; }
  get EyePosition() {
    return this._tmp.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /** 视线方向（相机朝向）。 */
  ViewDirection(target = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp).normalize();
  }

  /** 枪口指向 —— 自由瞄准偏移之后的方向。命中判定用这个，不是视线。 */
  AimDirection(target = new THREE.Vector3()) {
    const y = this.yaw + this.aimYaw;
    const p = Clamp(this.pitch + this.aimPitch, -1.5, 1.5);
    const cp = Math.cos(p), sp = Math.sin(p);
    return target.set(-Math.sin(y) * cp, sp, -Math.cos(y) * cp).normalize();
  }

  /**
   * @param {object} input {forward,-1..1 strafe, sprint, crouchPressed, pronePressed,
   *   lookX, lookY, ads, lean, breathHold}
   */
  Update(dt, input, weapon) {
    if (!this.alive) { this.deadTime += dt; return; }

    // --- 视角与自由瞄准 -----------------------------------------------------
    const sens = (input.sensitivity ?? 1) * 0.0022;
    // 架起两脚架之后转向只剩三成：机枪压在垛口上，横过来要连人带枪挪。
    // 这是"机枪手必须先选好位置"这条战术决策的成本，不是手感黏滞。
    const adsScale = (1 - this.ads * 0.55) * (this.bipod ? 0.30 : 1);
    const dx = -input.lookX * sens * adsScale;
    const dy = -input.lookY * sens * adsScale;

    // 后坐回落。指数回落，但**只回 recoilPending 里存的那 70%**：
    // ApplyRecoil 顶上去 1.0，只往回记 0.7，剩下的 0.3 永久留在 pitch 上。
    if (this.recoilPending.pitch !== 0 || this.recoilPending.yaw !== 0) {
      const back = 1 - Math.exp(-dt / Math.max(0.05, this.recoilRecoverS));
      const bp = this.recoilPending.pitch * back;
      const by = this.recoilPending.yaw * back;
      this.pitch -= bp; this.recoilPending.pitch -= bp;
      this.yaw -= by; this.recoilPending.yaw -= by;
    }

    // 自由瞄准：先动枪，枪顶到边界才推动视线。开镜时收窄到 1.4°（贴脸瞄准没有余量）
    // 每帧从难度表取，滑条一拨就生效（缓存在字段里的话要重生一次才认）
    this.freeAimLimitDeg = DIFFICULTY.freeAimDeg;
    const limit = THREE.MathUtils.degToRad(this.freeAimLimitDeg * (1 - this.ads * 0.72));
    this.aimYaw += dx;
    this.aimPitch += dy;
    if (this.aimYaw > limit) { this.yaw += this.aimYaw - limit; this.aimYaw = limit; }
    if (this.aimYaw < -limit) { this.yaw += this.aimYaw + limit; this.aimYaw = -limit; }
    if (this.aimPitch > limit) { this.pitch += this.aimPitch - limit; this.aimPitch = limit; }
    if (this.aimPitch < -limit) { this.pitch += this.aimPitch + limit; this.aimPitch = -limit; }
    // 枪慢慢回到视线中心（松手之后自己归位，不然久了会一直歪着）
    const recentre = Math.exp(-dt * (2.2 + this.ads * 5));
    this.aimYaw *= recentre;
    this.aimPitch *= recentre;
    this.pitch = Clamp(this.pitch, -1.35, 1.35);

    // --- 姿态 ---------------------------------------------------------------
    if (input.pronePressed) this.stance = this.stance === "prone" ? "stand" : "prone";
    else if (input.crouchPressed) this.stance = this.stance === "crouch" ? "stand" : "crouch";
    // 压制到一定程度会被逼得趴下 —— 这是 ER2 式压制最有说服力的一笔
    if (this.suppression > 0.85 && this.stance === "stand") this.stance = "crouch";
    const target = STANCE[this.stance];
    const rate = 1 - Math.exp(-dt * 8.5);
    this.eyeHeight += (target.eye - this.eyeHeight) * rate;
    this.radius += (target.radius - this.radius) * rate;
    this.stanceBlend.crouch += ((this.stance === "crouch" ? 1 : 0) - this.stanceBlend.crouch) * rate;
    this.stanceBlend.prone += ((this.stance === "prone" ? 1 : 0) - this.stanceBlend.prone) * rate;

    // --- 开镜 / 冲刺 / 侧身 --------------------------------------------------
    // ER2 的规矩：架式武器不架起两脚架就不许开镜（MG42/白朗宁/反坦克枪都是）。
    // 捷克式套这条正好 —— 全班就这一挺，架起来才有 800 m 有效射程。
    const bipodBlocked = !!(weapon && weapon.bipod) && !this.bipod;
    const wantAds = input.ads && !bipodBlocked ? 1 : 0;
    const adsSpeed = 1 / Math.max(0.08, weapon?.adsTimeS ?? 0.3);
    this.ads += Clamp((wantAds - this.ads) * dt * adsSpeed * 3, -dt * 6, dt * 6);
    this.ads = Clamp01(this.ads);
    // 卧姿按住 Shift = 快速匍匐（ER2 有匍匐速度档）。它不是冲刺：不进 sprint 弹簧，
    // 只把速度从 0.72 提到 1.25，并把脚步声放大 —— 快就得响，这是一对取舍。
    this.fastCrawl = !!input.sprint && this.stance === "prone" && this.stamina > 0.05;
    const canSprint = input.sprint && this.stamina > 0.05 && this.ads < 0.25
      && this.stance === "stand" && input.forward > 0.3;
    this.sprint += ((canSprint ? 1 : 0) - this.sprint) * (1 - Math.exp(-dt * 6));
    // 冲刺时长挂难度：staminaSeconds 就是"从满到空能跑几秒"。
    const burn = 1 / Math.max(1, DIFFICULTY.staminaSeconds);
    this.stamina = Clamp01(this.stamina + ((canSprint || this.fastCrawl) ? -dt * burn : dt * 0.13));
    this.lean += ((input.lean || 0) - this.lean) * (1 - Math.exp(-dt * 9));

    // 屏息：只在开镜时有意义，能压住摇摆，但会很快耗尽
    this.breathHold = !!input.breathHold && this.ads > 0.6 && this.stamina > 0.1;
    if (this.breathHold) this.stamina = Clamp01(this.stamina - dt * 0.28);

    // --- 移动 ---------------------------------------------------------------
    let speed = target.speed;
    if (this.fastCrawl) speed = 1.25;              // 卧姿 0.72 -> 1.25
    speed *= 1 + this.sprint * 0.72;
    speed *= 1 - this.ads * 0.42;
    speed *= 1 - this.suppression * 0.18;
    // 腿部中弹会拖着走
    speed *= this.LegPenalty();
    speed *= Clamp(this.health / 60, 0.45, 1);

    const forward = this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = this._right.crossVectors(forward, UP).normalize().negate();
    const wish = this._tmp.set(0, 0, 0)
      .addScaledVector(forward, input.forward || 0)
      .addScaledVector(right, input.strafe || 0);
    if (wish.lengthSq() > 1) wish.normalize();
    // 后退与横移比前进慢
    if ((input.forward || 0) < 0) speed *= 0.72;

    const desired = wish.multiplyScalar(speed);
    const accel = this.grounded ? 14 : 3;
    this.velocity.x += (desired.x - this.velocity.x) * Clamp01(dt * accel);
    this.velocity.z += (desired.z - this.velocity.z) * Clamp01(dt * accel);
    this.velocity.y -= 19.6 * dt;

    this.MoveWithCollision(dt);

    // --- 脚步 / 晃动 --------------------------------------------------------
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    this.stepDistance += planar * dt;
    this.headBob = Math.sin(this.stepDistance * (this.stance === "prone" ? 5.5 : 3.4)) * 0.5 + 0.5;

    // --- 流血 ---------------------------------------------------------------
    if (this.bleeding > 0) {
      this.health -= this.bleeding * dt;
      // 伤口自己会慢慢收一点，但收不干净 —— 不包扎就是慢性死亡
      this.bleeding = Math.max(this.bleeding * Math.exp(-dt * 0.05), this.bleeding - dt * 0.02);
      if (this.health <= 0) this.Kill();
    }

    // --- 压制自然衰减 -------------------------------------------------------
    this.suppression = Math.max(0, this.suppression - dt * 0.55);

    this.SyncCamera(dt);
    return { planarSpeed: planar };
  }

  LegPenalty() {
    let p = 1;
    for (const w of this.wounds) if (w.part === "leg") p *= 0.72;
    return Math.max(0.42, p);
  }

  /** 手臂中弹：瞄准摇摆变大、拉栓变慢。 */
  ArmPenalty() {
    let p = 1;
    for (const w of this.wounds) if (w.part === "arm") p *= 1.7;
    return Math.min(3.2, p);
  }

  /** 胶囊 vs AABB：分轴推出。够用，而且绝不会被挤进墙里。 */
  MoveWithCollision(dt) {
    const r = this.radius;
    const height = Math.max(0.5, this.eyeHeight + 0.16);
    const step = this._tmp.copy(this.velocity).multiplyScalar(dt);
    const axes = ["x", "z", "y"];
    for (const axis of axes) {
      this.position[axis] += step[axis];
      const list = this.world.NearbyColliders
        ? this.world.NearbyColliders(this.position.x, this.position.z, r + 2)
        : this.world.colliders;
      for (const box of list) {
        // 玩家的包围盒：脚底 position.y 到 position.y+height
        const px = this.position.x, py = this.position.y, pz = this.position.z;
        if (px + r < box.min[0] || px - r > box.max[0]) continue;
        if (pz + r < box.min[2] || pz - r > box.max[2]) continue;
        if (py + height < box.min[1] || py > box.max[1]) continue;
        // 能踩上去的矮物（0.55 m 以下）直接抬腿，不当墙
        const topRel = box.max[1] - py;
        if (axis !== "y" && topRel > 0 && topRel < 0.56) {
          this.position.y = box.max[1];
          this.velocity.y = Math.max(0, this.velocity.y);
          this.grounded = true;
          continue;
        }
        if (axis === "x") {
          this.position.x = step.x > 0 ? box.min[0] - r : box.max[0] + r;
          this.velocity.x = 0;
        } else if (axis === "z") {
          this.position.z = step.z > 0 ? box.min[2] - r : box.max[2] + r;
          this.velocity.z = 0;
        } else {
          if (step.y < 0) {
            this.position.y = box.max[1];
            this.grounded = true;
          } else {
            this.position.y = box.min[1] - height;
          }
          this.velocity.y = 0;
        }
      }
    }
    const ground = this.world.GroundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground + 1e-3) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.velocity.y < -0.05) {
      this.grounded = false;
    }
    const b = this.world.bounds;
    if (b) {
      this.position.x = Clamp(this.position.x, b.minX + 1, b.maxX - 1);
      this.position.z = Clamp(this.position.z, b.minZ + 1, b.maxZ - 1);
    }
  }

  SyncCamera(dt) {
    const cam = this.camera;
    // 步伐晃动：走路上下 + 左右 8 字。开镜压到 20%，卧倒几乎没有。
    const damp = (1 - this.ads * 0.8) * (1 - this.stanceBlend.prone * 0.7);
    const bobAmp = 0.028 * damp * Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / 3);
    const bobY = Math.sin(this.stepDistance * 6.8) * bobAmp;
    const bobX = Math.sin(this.stepDistance * 3.4) * bobAmp * 1.3;
    // 侧身：身体横移 + 相机滚转，探头出去看的那一下必须有位移，不然只是画面歪了
    const leanOffset = this.lean * 0.42 * (1 - this.stanceBlend.prone);
    const rightVec = this._right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    cam.position.set(
      this.position.x + bobX + rightVec.x * leanOffset,
      this.position.y + this.eyeHeight + bobY,
      this.position.z + rightVec.z * leanOffset);
    cam.rotation.order = "YXZ";
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
    // 受压制时画面轻微抖动 —— 不是特效，是"被按在地上抬不起头"的触感
    const shake = this.suppression * 0.012;
    cam.rotation.z = -this.lean * 0.16
      + (shake > 0 ? Math.sin(this.stepDistance * 41 + this.suppression * 90) * shake : 0);
  }

  /** 被弹片/子弹擦过或命中。part: head/torso/arm/leg */
  TakeHit(damage, part = "torso", direction = null) {
    if (!this.alive) return;
    const mult = part === "head" ? 3.4 : part === "torso" ? 1.0 : 0.62;
    this.health -= damage * mult;
    const bleed = part === "head" ? 6 : part === "torso" ? 2.6 : 1.4;
    this.wounds.push({ part, bleed, since: 0 });
    this.bleeding += bleed;
    this.suppression = Clamp01(this.suppression + 0.5);
    if (direction) {
      this.velocity.addScaledVector(direction, 1.2);
      // 中弹把视线打偏 —— 被打中还能稳稳瞄准是最假的一件事
      this.aimYaw += (this.rnd() - 0.5) * 0.09;
      this.aimPitch += (this.rnd() - 0.5) * 0.07 + 0.03;
    }
    if (this.health <= 0) this.Kill();
  }

  /**
   * 开一枪的后坐。参数是**弧度**（调用方从 viewmodel.ConsumeCameraKick 取，
   * 那一份已经按 Data_Weapons 的 recoil 表与开镜量算好了）。
   *
   * 顶上去 100%，只往 recoilPending 里记 70% —— 于是回落结束后仍然有 30% 留在
   * pitch 上，玩家必须自己压回来。这就是"打一发要重新找目标"。
   */
  ApplyRecoil(pitchRad, yawRad, recoverS = 0.4) {
    this.pitch = Clamp(this.pitch + pitchRad, -1.35, 1.35);
    this.yaw += yawRad;
    this.recoilPending.pitch += pitchRad * 0.70;
    this.recoilPending.yaw += yawRad * 0.70;
    this.recoilRecoverS = recoverS;
    this.recoilTotal += pitchRad;
  }

  /** 架/收两脚架。返回是否真的改变了状态（给音效与提示用）。 */
  ToggleBipod(weapon, canDeploy) {
    if (!weapon || !weapon.bipod) return false;
    if (!this.bipod && !canDeploy) return false;
    this.bipod = !this.bipod;
    return true;
  }

  /** 子弹从身边飞过：不掉血，但压得抬不起头。 */
  Suppress(amount) {
    this.suppression = Clamp01(this.suppression + amount);
  }

  /** 包扎：止血，不回满血。伤口留着，跑不快。 */
  Bandage() {
    if (this.bandages <= 0 || this.bleeding <= 0) return false;
    this.bandages -= 1;
    this.bleeding = 0;
    this.health = Math.min(100, this.health + 14);
    for (const w of this.wounds) w.bleed = 0;
    return true;
  }

  Kill() {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deadTime = 0;
    this.velocity.set(0, 0, 0);
  }

  /** 当前的瞄准摇摆幅度（度）。给视图模型与散布计算共用。 */
  SwayAmount(weapon) {
    const stanceScale = STANCE[this.stance].sway;
    let sway = 1.0 * stanceScale * (weapon?.swayScale ?? 1);
    sway *= 1 - this.ads * 0.55;
    sway *= this.ArmPenalty();
    sway *= 1 + this.suppression * 0.9;
    sway *= 1 + (1 - this.stamina) * 0.6;
    if (this.breathHold) sway *= 0.28;
    if (this.bipod) sway *= 0.25;                  // 架上去之后枪自己稳住了
    return sway;
  }

  /** 当前散布（度）。没有准星，但散布仍然决定子弹落点。 */
  SpreadDeg(weapon) {
    if (!weapon) return 4;
    const base = this.ads > 0.5 ? (weapon.spreadAdsDeg ?? 0.2) : (weapon.spreadHipDeg ?? 3);
    let s = base * STANCE[this.stance].spread;
    s *= 1 + this.suppression * 1.3;
    s *= this.ArmPenalty() * 0.6 + 0.4;
    s *= 1 + Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / 3) * 1.8;
    if (this.breathHold) s *= 0.55;
    if (this.bipod) s *= 0.35;
    return s;
  }
}
