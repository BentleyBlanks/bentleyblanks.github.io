// 《血战台儿庄》玩家控制器：移动、碰撞、姿态、自由瞄准、压制、伤口。
//
// 对标 Easy Red 2 的手感取向：**没有准星**，只有机械瞄具；自由瞄准（枪口可以
// 在视野里滑动，不是死钉在屏幕中心）；栓动枪一发一拉，节奏本身就是压力来源；
// 受伤是流血与失能，不是一格一格掉的血条。
//
// 碰撞走 Rapier 的运动学角色控制器（Script_Physics）。
//
// 这里原本是一套自己写的「胶囊 vs AABB 表 + 分轴推出」。它每修一条就压出另一条：
// 贴着墙站着会被重力顺着侧面吸上墙顶（实测 32/32 次上房顶）、陷进房子里朝哪边走
// 就被甩到哪一面（一秒横移 20 m）、把判据收紧之后整片碎石变成隐形墙。
// 三条补丁的长注释都还留在 git 历史里，那不是写得不好，是这套解法本身给不出
// 「贴墙滑、上台阶、不卡角」这三件事的一致解。
//
// 现在这三件事交给引擎：胶囊 + autostep 0.55 m + 贴地吸附 + 52° 坡度上限。
// 玩家这边只负责算**想走多远**，走不走得动是引擎的事。

import * as THREE from "three";
import { Clamp, Clamp01, Mulberry32 } from "./Script_Noise.mjs";
import { DIFFICULTY } from "./Data_Battle.mjs";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 翻越的尺寸。
 *
 * 上限**不是**方案里写的 1.9 m，是 2.25 m，这一条是照着场景实测改的：
 * 这座城里 0.6—1.9 m 之间的碰撞盒基本只有街垒和影壁，而真正把巷战堵死的
 * 是四合院的院墙 —— `AddCompound` 建的是 2.0—2.5 m（`Script_World` 顶上那条
 * 形制注释原话：「院墙 2.0—2.5 m（成年人踮脚能扒）」）。
 * 卡在 1.9 就等于这个动词只对装饰物生效，"翻窗进院、翻墙抄后路"照样不存在。
 * 取 2.25 之后一半以上的院墙进得去，剩下的高墙仍然要走门洞 —— 那是对的：
 * 墙高一点就该翻不过去，这是"扒墙头"不是撑杆跳。
 */
const VAULT_MIN_M = 0.60;          // 比这矮的引擎自己抬腿就过去了（autostep 0.55 m）
const VAULT_MAX_M = 2.25;
const VAULT_REACH_M = 1.62;        // 落点离起跳点多远：院墙厚 0.35，这个距离能落到墙另一面
const VAULT_BASE_S = 0.45;         // 方案给的位移曲线时长（矮物）；越高翻得越慢

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
    /**
     * 物理世界里的那具胶囊。**换关会换一份**（切片重建 = 物理世界重建），
     * 所以它由装配层通过 AttachPhysics 交进来，而不是在这里 new。
     */
    this.physics = null;
    this.body = null;
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
    this.recoilTotal = 0;                       // 尚未收回的净后坐（弧度，取证用；收干净即 0）
    this.recoilSince = 999;                     // 距上一发多久（回落曲线的 TimeSinceLastShot）
    this.recoilPeak = 0;                        // 上一发顶到的峰值，回落曲线按它归一化

    // 两脚架。捷克式全班就一挺，架起来才有 800 m 有效射程；ER2 的规矩是**不架不能开镜**。
    this.bipod = false;
    this.fastCrawl = false;                     // 卧姿按住 Shift：更快也更响

    // --- 翻越 ---------------------------------------------------------------
    // 这座城是一进一进的四合院，院墙 2 m、窗台 0.9 m，而自动抬腿只到 0.56 m ——
    // 也就是说在这一批之前，所有院墙、所有窗台都是死墙，玩家只能走门洞。
    // 「室战墙战」这四个字要成立，先得能翻进院子。
    this.vault = { active: false, t: 0, duration: VAULT_BASE_S, apex: 0 };
    this._vaultFrom = new THREE.Vector3();
    this._vaultTo = new THREE.Vector3();
    this.vaultCount = 0;                        // 翻过几次（运行时取证用）

    // --- 下水 ---------------------------------------------------------------
    // 运河不做游泳系统，做一条软墙：慢、不许开火、一直掉体力。
    // 浮桥是全城唯一的退路与补给线，玩家要是能游过去，浮桥的史实分量就没了。
    this.waterDepth = 0;

    this.stance = "stand";
    this.stanceBlend = { crouch: 0, prone: 0 };
    this.grounded = true;
    this.sprint = 0;
    this.ads = 0;
    this.wantAds = false;      // 开镜意图（相机侧的 FOV 过渡读它）
    this.lean = 0;                          // -1 左, +1 右
    this.breath = 0;                        // 屏息剩余
    this.breathHold = false;

    this.health = 100;
    this.bleeding = 0;                      // 每秒失血
    this.wounds = [];                       // { part, bleed, since }
    this.bandages = 2;
    this.suppression = 0;                   // 0..1，被打压的程度
    this.suppressedUpright = false;         // 压得很狠但还站着（只用于提示，不改姿态）
    this.stamina = 1;

    this.eyeHeight = STANCE.stand.eye;
    this.radius = STANCE.stand.radius;
    this.headBob = 0;
    this.stepDistance = 0;
    this.rnd = Mulberry32(seed);
    this.lastFootstep = 0;
    this.deadTime = 0;
    this.alive = true;
    /**
     * 出生保护（秒）。ER2 的做法：重生后几秒无敌，防出生点秒杀。
     * 这不是"照顾玩家"，是修一个结构性问题：接替者必然出生在还在打的地方，
     * 没有这几秒，他睁眼那一刻就已经在九支枪的射界里了。
     */
    this.spawnGrace = 0;

    this._tmp = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  /**
   * 换一份物理世界（开机一次、每换一关一次）。
   * 旧的那具胶囊跟着旧世界一起没了，这里只管建新的。
   */
  AttachPhysics(physics) {
    this.physics = physics;
    this.body = physics
      ? physics.MakeCharacter({
        radius: this.radius,
        height: Math.max(0.62, this.eyeHeight + 0.16),
        position: this.position,
      })
      : null;
  }

  Spawn(x, z, ry = 0) {
    // 出生点先问一句「这儿站得下人吗」。
    // 撒兵点与重生点来自关卡数据与随机数，它们并不知道那儿正好是一堵院墙；
    // 而运动学角色控制器**没有脱困能力** —— 埋进墙里就再也出不来了
    //（老解算靠「推到最近的外面」硬挤，挤得动是运气）。
    const free = this.physics
      ? this.physics.FindFreeSpot(x, z, STANCE.stand.radius, STANCE.stand.eye + 0.16)
      : { x, y: this.world.GroundHeight(x, z), z };
    this.position.set(free.x, free.y, free.z);
    if (this.body) this.body.Teleport(this.position.x, this.position.y, this.position.z);
    this.yaw = ry;
    this.pitch = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.velocity.set(0, 0, 0);
    this.health = 100;
    this.bleeding = 0;
    this.wounds.length = 0;
    this.suppression = 0;
    this.suppressedUpright = false;
    this.stamina = 1;
    this.stance = "stand";
    this.alive = true;
    this.deadTime = 0;
    // 出生保护。ER2 有这条（重生后几秒无敌），我写进了对齐文档却一直没实现 ——
    // 而接替者必然出生在还在打的地方，没有这几秒，他睁眼那一刻就在九支枪的射界里。
    this.spawnGrace = 3.2;
    this.recoilPending.pitch = 0;
    this.recoilPending.yaw = 0;
    this.recoilTotal = 0;
    this.recoilSince = 999;
    this.recoilPeak = 0;
    this.bipod = false;
    this.fastCrawl = false;
    this.freeAimLimitDeg = DIFFICULTY.freeAimDeg;
    this.vault.active = false;
    this.waterDepth = 0;
  }

  get Alive() { return this.alive; }
  get Protected() { return this.spawnGrace > 0; }
  /** 翻越/下水期间不许开火。装配层的 TryFire 读这一条。 */
  get Busy() { return this.vault.active; }
  get InWater() { return this.waterDepth > 0.35; }
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
  /**
   * 翻越。朝前探一次：前方 0.6 m 有个顶面在 0.6—2.25 m 之间的东西，
   * 而且顶面往前落得下脚，就播一段位移曲线翻过去。
   *
   * 空地按 Space **什么也不发生** —— 这不是跳跃键。ER2 的掩体之所以是"可穿越
   * 地形"而不是墙，靠的就是这个动词只在贴到东西时响应。
   *
   * @returns {boolean} 真的起跳了没有
   */
  TryVault() {
    if (!this.alive || this.vault.active) return false;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const feet = this.position.y;
    const probeX = this.position.x + fx * 0.6;
    const probeZ = this.position.z + fz * 0.6;
    const r = this.radius;

    // 1) 前面有没有能翻的东西
    let top = -Infinity;
    const near = this.world.NearbyColliders
      ? this.world.NearbyColliders(probeX, probeZ, r + 1.2)
      : this.world.colliders;
    for (const box of near) {
      if (probeX + r < box.min[0] || probeX - r > box.max[0]) continue;
      if (probeZ + r < box.min[2] || probeZ - r > box.max[2]) continue;
      const rel = box.max[1] - feet;
      if (rel < VAULT_MIN_M || rel > VAULT_MAX_M) continue;
      if (box.min[1] > feet + 1.0) continue;                 // 悬在头顶的檐口不是墙头
      if (box.max[1] > top) top = box.max[1];
    }
    if (!Number.isFinite(top)) return false;

    // 2) 顶面往前落得下脚吗（方案的"顶面往前 0.7 m 无遮挡"，这里按落点整体查）
    const landX = this.position.x + fx * VAULT_REACH_M;
    const landZ = this.position.z + fz * VAULT_REACH_M;
    let landY = this.world.GroundHeight(landX, landZ);
    const landNear = this.world.NearbyColliders
      ? this.world.NearbyColliders(landX, landZ, r + 0.6)
      : this.world.colliders;
    for (const box of landNear) {
      if (landX + r < box.min[0] || landX - r > box.max[0]) continue;
      if (landZ + r < box.min[2] || landZ - r > box.max[2]) continue;
      if (box.max[1] <= top + 0.05) {                        // 落在另一个台面上也行
        if (box.max[1] > landY) landY = box.max[1];
        continue;
      }
      return false;                                          // 墙那边还是墙：翻过去没地方站
    }
    if (landY > top + 0.05) return false;

    this._vaultFrom.copy(this.position);
    this._vaultTo.set(landX, landY, landZ);
    const rise = top - feet;
    this.vault.active = true;
    this.vault.t = 0;
    // 越高翻得越慢：0.6 m 是 0.45 s（方案给的数），2.25 m 要 0.75 s
    this.vault.duration = VAULT_BASE_S + Math.max(0, rise - VAULT_MIN_M) * 0.18;
    this.vault.apex = top + 0.30;
    this.velocity.set(0, 0, 0);
    this.stance = "stand";                                   // 蹲着趴着翻不过去，先站起来
    this.vaultCount += 1;
    return true;
  }

  /** 翻越途中的一帧：位移曲线走完就落地。期间禁开火、禁转身（视角只轻微下压）。 */
  _StepVault(dt) {
    const v = this.vault;
    v.t += dt;
    const k = Clamp01(v.t / v.duration);
    const arc = Math.sin(Math.PI * k);
    const from = this._vaultFrom, to = this._vaultTo;
    this.position.x = from.x + (to.x - from.x) * k;
    this.position.z = from.z + (to.z - from.z) * k;
    const base = from.y + (to.y - from.y) * k;
    this.position.y = base + Math.max(0, v.apex - Math.max(from.y, to.y)) * arc;
    this.grounded = false;
    // 眼高照常收敛，不然翻越途中视线会僵在起跳那一刻
    const target = STANCE[this.stance];
    const rate = 1 - Math.exp(-dt * 8.5);
    this.eyeHeight += (target.eye - this.eyeHeight) * rate;
    if (k >= 1) {
      v.active = false;
      this.position.copy(to);
      this.grounded = true;
    }
    // 翻越是一段**写死的位移曲线**，不走碰撞解算（人要从墙里穿过去）。
    // 但胶囊得跟着走，不然落地那一帧引擎按起跳点算，人会被弹回墙这边。
    if (this.body) this.body.Teleport(this.position.x, this.position.y, this.position.z);
    this.SyncCamera(dt);
    return { planarSpeed: 0 };
  }

  Update(dt, input, weapon) {
    if (!this.alive) { this.deadTime += dt; return; }
    // 翻越期间接管整帧：不读输入、不走碰撞、不开火（Busy 为真）
    if (this.vault.active) return this._StepVault(dt);

    // --- 视角与自由瞄准 -----------------------------------------------------
    const sens = (input.sensitivity ?? 1) * 0.0022;
    // 架起两脚架之后转向只剩三成：机枪压在垛口上，横过来要连人带枪挪。
    // 这是"机枪手必须先选好位置"这条战术决策的成本，不是手感黏滞。
    const adsScale = (1 - this.ads * 0.55) * (this.bipod ? 0.30 : 1);
    const dx = -input.lookX * sens * adsScale;
    const dy = -input.lookY * sens * adsScale;

    // 后坐回落 —— 照战地的曲线，不是指数衰减。出处见 docs/Data_BattlefieldNumbers.md。
    //
    //   Decrease ∝ (|R| / R0)^0.6 · (R0 / T) · K · **TimeSinceLastShot^0.5** · dt
    //
    // 两个要点，缺一个手感就不对：
    //   · **回到零，不留残留。** 我按"留 28% 让玩家自己压"做过一版 —— 那是 CS /
    //     Valorant 的喷射弹道逻辑。战地的栓动步枪 0.25—0.5 s 收干净，而两发间隔
    //     1.0—2.4 s，**每一发都从同一个瞄准点开始**。
    //   · **重量感在 TimeSinceLastShot^0.5 上。** t=0 时该因子为 0，回落**从零速率
    //     起步再加速** —— 踢上去、悬住、加速归位。那一"悬"就是枪的重量。
    //     指数回落是反过来的（起步最快、尾巴最长），所以它永远像"画面在往下淌"。
    //
    // 指数 0.6 < 1 还有一个好处：dR/dt ∝ R^0.6 是**有限时间收敛到精确的零**的，
    // 不像指数回落拖一条永远抹不掉的微小尾巴。
    // K = 1.432 / sqrt(T) 是解出来的：让回稳时间恒等于 1.9×T，与后坐大小无关。
    this.recoilSince += dt;
    const pend = Math.hypot(this.recoilPending.pitch, this.recoilPending.yaw);
    if (pend > 1e-7) {
      const T = Math.max(0.05, this.recoilRecoverS);
      const peak = Math.max(pend, this.recoilPeak || pend);
      const K = 1.432 / Math.sqrt(T);
      const dec = Math.pow(pend / peak, 0.6) * (peak / T) * K * Math.sqrt(this.recoilSince) * dt;
      const scale = Math.max(0, 1 - dec / pend);
      const bp = this.recoilPending.pitch * (1 - scale);
      const by = this.recoilPending.yaw * (1 - scale);
      this.pitch -= bp; this.recoilPending.pitch -= bp;
      this.yaw -= by; this.recoilPending.yaw -= by;
      this.recoilTotal -= bp;                 // 取证字段跟着回，归零即"已收干净"
      if (scale <= 0) this.recoilPeak = 0;
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
    // 压制**不再偷偷改玩家的姿态**。
    // 原来是 suppression > 0.85 就把 stance 直接改成 crouch：玩家没按任何键，
    // HUD 上姿态从「立」自己跳到「蹲」，移动速度从 3.05 掉到 1.62 ——
    // 体感就是「WASD 时灵时不灵」，而且找不到原因（唯一的反馈是一圈很淡的暗角）。
    // 改成只在**玩家自己按下过蹲/卧**之后才由压制维持；纯站着挨打就只是走得慢一点，
    // 是不是趴下由玩家自己决定。这也更接近 ER2：压制影响的是精度与视野，不是替你操作。
    if (this.suppression > 0.85 && this.stance === "stand") {
      this.suppressedUpright = true;          // 只做提示，不改姿态
    } else if (this.suppression < 0.5) {
      this.suppressedUpright = false;
    }
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
    // 存下来给相机用。相机侧的 FOV 过渡（固定 150 ms）要跟玩家读同一个"意图"，
    // 而不是自己再去看一遍 input.ads —— 那样会漏掉两脚架未架起时的封锁。
    this.wantAds = wantAds === 1;
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

    // --- 下水（软墙，不是游泳系统）-------------------------------------------
    // 运河是全城唯一的退路与补给线，而那条退路是 5.5 m 宽的浮桥。
    // 玩家要是能游过去，浮桥的史实分量就没了。所以下水不封路，只让它明显不划算：
    // 速度四分之一、开不了枪（枪泡水里）、体力一直掉。**不设溺死判定** ——
    // 被一条自己走进去的水淹死，比"走不过去"更像 bug。
    this.waterDepth = this.world.WaterDepth
      ? this.world.WaterDepth(this.position.x, this.position.z, this.position.y)
      : 0;
    if (this.InWater) {
      this.stamina = Clamp01(this.stamina - dt * 0.5);
      this.ads = 0;
      this.breathHold = false;
    }

    // --- 移动 ---------------------------------------------------------------
    let speed = target.speed;
    if (this.fastCrawl) speed = 1.25;              // 卧姿 0.72 -> 1.25
    speed *= 1 + this.sprint * 0.72;
    speed *= 1 - this.ads * 0.42;
    // 被压制时腿会软，但这是个温和的惩罚（最多 -25%），不是把人按到蹲姿的 -47%
    speed *= 1 - this.suppression * 0.25;
    if (this.InWater) speed *= 0.25;               // 齐腰的水里迈不开腿
    // 腿部中弹会拖着走
    speed *= this.LegPenalty();
    speed *= Clamp(this.health / 60, 0.45, 1);

    const forward = this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // 右向量**不能再取反**。朝向 -Z、上方 +Y 时 cross(forward, up) 出来的已经是 +X，
    // 也就是正确的右手边；多一个 negate 就成了左边，按 D 往左横移。
    // 实测（yaw=0）：修之前按 D 走 dx=-2.54、按 A 走 dx=+2.67，整个反的。
    const right = this._right.crossVectors(forward, UP).normalize();
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

    if (this.spawnGrace > 0) this.spawnGrace -= dt;

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

  /**
   * 走一步。位移交给 Rapier 的角色控制器：贴墙滑、上台阶、卡坡都是它的事。
   *
   * 这里只剩三件玩家侧的事：
   *   1. 姿态变了就换胶囊尺寸（站 1.78 / 蹲 1.21 / 卧 0.58，卧姿还更粗）；
   *   2. 落地了就把下落速度清零（不清的话重力会一直累加，走下坡时会突然"吸"下去）；
   *   3. 把人夹在本关切片里。
   */
  MoveWithCollision(dt) {
    const body = this.body;
    const height = Math.max(0.62, this.eyeHeight + 0.16);
    if (!body) {
      // 物理世界还没接上（开机的头几帧、或者出图模式直接摆相机）。
      // 退回"只贴地"，别把人留在半空。
      this.position.addScaledVector(this.velocity, dt);
      const g0 = this.world.GroundHeight(this.position.x, this.position.z);
      if (this.position.y <= g0) { this.position.y = g0; this.velocity.y = 0; this.grounded = true; }
      return;
    }
    // 有人绕过物理直接改了 position（过场摆位、冒烟脚本摆人）就认外面那份
    body.ReconcileTo(this.position.x, this.position.y, this.position.z);
    body.SetSize(this.radius, height);
    const step = this._tmp.copy(this.velocity).multiplyScalar(dt);
    const moved = body.Move(step.x, step.y, step.z);
    this.position.set(moved.x, moved.y, moved.z);
    this.grounded = moved.grounded;
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    // 撞上东西就把那一轴的速度吃掉，不然贴着墙走会一直攒速度，
    // 松开墙的那一帧人会"弹"出去。
    if (moved.blocked) {
      this.velocity.x *= 0.2;
      this.velocity.z *= 0.2;
    }
    const b = this.world.bounds;
    if (b) {
      const cx = Clamp(this.position.x, b.minX + 1, b.maxX - 1);
      const cz = Clamp(this.position.z, b.minZ + 1, b.maxZ - 1);
      if (cx !== this.position.x || cz !== this.position.z) {
        this.position.x = cx;
        this.position.z = cz;
        body.Teleport(cx, this.position.y, cz);
      }
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
    // 翻越途中视角轻微下压：手撑上墙头的那一下人是低着头的。
    // 只改相机不改 this.pitch —— 动 pitch 的话翻完枪口会歪着，玩家得自己抬回来
    const vaultDip = this.vault.active
      ? Math.sin(Math.PI * Clamp01(this.vault.t / this.vault.duration)) * 0.16 : 0;
    cam.rotation.x = this.pitch - vaultDip;
    // 受压制时画面轻微抖动 —— 不是特效，是"被按在地上抬不起头"的触感
    const shake = this.suppression * 0.012;
    cam.rotation.z = -this.lean * 0.16
      + (shake > 0 ? Math.sin(this.stepDistance * 41 + this.suppression * 90) * shake : 0);
  }

  /** 被弹片/子弹擦过或命中。part: head/torso/arm/leg */
  TakeHit(damage, part = "torso", direction = null) {
    if (!this.alive) return;
    // 出生保护期内只吃压制不吃伤 —— 让接替者有几秒找到掩体，
    // 而不是睁眼就躺回去。子弹照样从耳边过，压制照样上。
    if (this.spawnGrace > 0) {
      this.suppression = Clamp01(this.suppression + 0.35);
      return;
    }
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
   * 顶上去多少就往 recoilPending 里记多少（recoverFrac = 1.0）——
   * **战地的后坐是回到零的，没有残留**，见 docs/Data_BattlefieldNumbers.md。
   * 参数留着是为了将来真有哪支枪要破例，默认值不许再动。
   */
  ApplyRecoil(pitchRad, yawRad, recoverS = 0.4, recoverFrac = 1.0) {
    const keep = Number.isFinite(recoverFrac) ? recoverFrac : 1.0;
    this.pitch = Clamp(this.pitch + pitchRad, -1.35, 1.35);
    this.yaw += yawRad;
    this.recoilPending.pitch += pitchRad * keep;
    this.recoilPending.yaw += yawRad * keep;
    this.recoilRecoverS = recoverS;
    this.recoilTotal += pitchRad;
    // 重新起表：回落速率里的 TimeSinceLastShot 从这一发算起，
    // 所以连发时后一发会把前一发"已经跑起来"的回落打回零速率 —— 连打就压得住。
    this.recoilSince = 0;
    this.recoilPeak = Math.hypot(this.recoilPending.pitch, this.recoilPending.yaw);
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
