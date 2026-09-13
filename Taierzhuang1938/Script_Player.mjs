// 《台儿庄：血战滕县》玩家控制器：移动、碰撞、姿态、自由瞄准、压制、伤口。
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
import { Clamp, Clamp01, Mulberry32, SmoothStep } from "./Script_Noise.mjs";
import { DIFFICULTY, COMBAT } from "./Data_Battle.mjs";
import { TRAVERSAL, TraversalPlan, TraversalCurve, TraversalLanding } from "./Data_Traversal.mjs";
import { T } from "./Script_Text.mjs";
import {
  STANCE as STANCE_TUNING, JUMP, MOVE, STAMINA, FREE_AIM, RECOIL,
  SUPPRESSION, WOUNDS, SPAWN, HIT_FEEDBACK, HIT_DISORIENTATION, SWAY, SPREAD, CAMERA, COVER_LEAN,
} from "./Data_Tuning_Player.mjs";
import { CoverLean, LeanClearance } from "./Script_CoverLean.mjs";
import { CameraShake } from "./Script_CameraShake.mjs";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 翻越 / 攀爬的尺寸**不在这个文件里** —— 在 `Data_Traversal.TRAVERSAL`。
 *
 * 那张表是玩家、AI、物理层自动抬腿三边共用的通行高度阶梯（膝高自动跨过、
 * 腰高翻越、肩高攀爬、2 m 以上一律不可通过），改判据一律去改那一张表。
 * 为什么是这四档、上一版 2.25 m 的账怎么算的，全在那个文件的头注里。
 */

/**
 * 跳跃、姿态、体力、自由瞄准、后坐、压制、伤口、受击反馈的数**全在
 * `Data_Tuning_Player.mjs`**（每一组的出处与账都跟着数搬过去了）。
 * 这里只 import 读，不复制成本地常量 —— 复制一份的后果是热改表不生效、
 * 而且测试与代码会读到两个真相。
 */

/** 姿态表。数在 `Data_Tuning_Player.STANCE`；姿态名用 `StanceLabel(id)` 取（表里只有 labelKey）。 */
export const STANCE = STANCE_TUNING;

/** 姿态名（「立 / 蹲 / 卧」）。HUD 与白盒面板都该走这一条。 */
export function StanceLabel(stance) {
  const spec = STANCE_TUNING[stance];
  return spec ? T(spec.labelKey) : "";
}

/** Read-only measuring references; movement continues to use the tuning table above. */
export function PlayerMovementReference() {
  return { standingRiseM: JUMP.speedMps ** 2 / (2 * JUMP.gravityMps2),
    runningRiseM: (JUMP.speedMps * (1 + JUMP.runRise)) ** 2 / (2 * JUMP.gravityMps2),
    runFullMps: JUMP.runFullMps, stances: structuredClone(STANCE) };
}

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
    this.lookIdle = 0;                     // 鼠标停了多久（归位只在停下之后发生）
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
    this.recoilRecoverS = RECOIL.defaultRecoverS;
    this.recoilTotal = 0;                       // 尚未收回的净后坐（弧度，取证用；收干净即 0）
    this.recoilSince = 999;                     // 距上一发多久（回落曲线的 TimeSinceLastShot）
    this.recoilPeak = 0;                        // 上一发顶到的峰值，回落曲线按它归一化

    // 两脚架。捷克式全班就一挺，架起来才有 800 m 有效射程；ER2 的规矩是**不架不能开镜**。
    this.bipod = false;
    this.fastCrawl = false;                     // 卧姿按住 Shift：更快也更响

    /**
     * 负重乘数。1 = 空手；抬着担架/药箱/门板时由 `Script_Carry` 每帧写进来。
     *
     * **移动的账只有这一本**：负重不自己算一套速度，只往这条乘法链上加一个数。
     * 三处读它 —— 乘进移速、封掉冲刺、封掉开镜（两只手都占着，枪端不起来）。
     * 「能不能开枪」不在这里判，那条在装配层的 TryFire 里读 `carry.Blocking`。
     */
    this.carrySpeedScale = 1;

    // --- 翻越 / 攀爬 ---------------------------------------------------------
    // 这座城是一进一进的四合院，院墙 2 m、窗台 0.9 m，而自动抬腿只到 stepMax ——
    // 也就是说在这一批之前，所有院墙、所有窗台都是死墙，玩家只能走门洞。
    // 「室战墙战」这四个字要成立，先得能翻进院子。
    // 两个动词共用一套状态：kind 决定时长、曲线、体力与相机下压（Data_Traversal）。
    this.vault = {
      active: false, t: 0, duration: TRAVERSAL.vaultBaseS, kind: "vault",
      apexY: 0, dip: TRAVERSAL.vaultDipRad, rise: 0,
    };
    this._vaultFrom = new THREE.Vector3();
    this._vaultTo = new THREE.Vector3();
    this.vaultCount = 0;                        // 翻过几次（运行时取证用）
    this.mantleCount = 0;                       // 其中"撑上去"的那一档有几次

    // --- 跳跃 ---------------------------------------------------------------
    // coyote / buffer 都很短，只用来消掉 60 Hz 输入与落地帧之间的偶然误差；
    // cooldown + 体力成本负责挡住兔子跳。landSerial 是装配层的落地音效边沿。
    this.jump = {
      count: 0, coyote: JUMP.coyoteS, buffer: 0, cooldown: 0,
      airTime: 0, landSerial: 0, landImpact: 0,
      runK: 0,                                  // 上一次起跳吃到的助跑加成（取证用）
    };

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
    this.coverLean = new CoverLean();
    this.autoLean = 0;
    this.lean = 0;                          // -1 左, +1 右
    this.breath = 0;                        // 屏息剩余
    this.breathHold = false;

    this.health = 100;
    this.bleeding = 0;                      // 每秒失血
    this.wounds = [];                       // { part, bleed, since }
    this.bandages = WOUNDS.bandages;
    this.suppression = 0;                   // 0..1，被打压的程度
    this.suppressedUpright = false;         // 压得很狠但还站着（只用于提示，不改姿态）
    // 通用震屏（爆炸 / 近失弹 / 落地 / 中弹 / 日机弹着 / 扑沟）。数在 CAMERA_SHAKE，
    // 偏移在 SyncCamera 最后一步叠上去，不改 yaw/pitch 本体。
    this.shake = new CameraShake();
    this.stamina = 1;
    this.sprintSpent = false;               // 冲刺跑空、还没回到 STAMINA.sprintResume
    // 只由 Script_DebugOptions 经装配层写入。默认全关，保持正式玩法完全不变。
    this.debug = { noCollision: false, fastMove: false, invincible: false };

    // --- 受击反馈 -----------------------------------------------------------
    // 以前**一件都没有**：暗角只是 health 的函数（health<70 才开始亮，
    // 而 70 到 0 只隔两发），挨枪那一下屏幕上没有任何事件、也没有任何声音
    //（Audio/Sfx 里 Hurt 与 Heartbeat 两个素材烘好了从来没人播过）。
    // 结果就是"没有提醒、直接就死"。这三个量是给 HUD/音频读的一次性事件：
    //   hitFlash   一次中弹的红闪（按伤害定强度，自己衰减，与剩余血量无关）
    //   hitMarks   来弹方位（屏幕边缘的指向楔形；世界方向，HUD 自己转成屏幕角）
    //   hitEvents  这一帧新挨的伤（装配层取走后播闷哼）
    this.hitFlash = 0;
    this.hitDisorientationTime = 0;
    this.hitDisorientationStrength = 0;
    this.hitMarks = [];
    this.hitEvents = [];
    this.heartbeatTimer = 0;

    this.eyeHeight = STANCE.stand.eye;
    this.radius = STANCE.stand.radius;
    this.headBob = 0;
    this.stepDistance = 0;
    this.rnd = Mulberry32(seed);
    this.lastFootstep = 0;
    this.deadTime = 0;
    this.alive = true;
    // 第一人称阵亡镜头。Kill() 记下中弹那一帧的真实机位，死亡 Update 再从那里
    // 落到贴地侧卧；直接用站姿眼高重算会在开镜、侧身或卧姿死亡时先瞬移一下。
    this.deathCameraStart = new THREE.Vector3();
    this.deathStartYaw = 0;
    this.deathStartPitch = 0;
    this.deathStartRoll = 0;
    this.deathFallSide = 1;
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
    this.ResetLean();
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
    this.lookIdle = 0;
    this.ResetLean();
    this.velocity.set(0, 0, 0);
    this.health = 100;
    this.bleeding = 0;
    this.wounds.length = 0;
    this.suppression = 0;
    this.suppressedUpright = false;
    this.stamina = 1;
    this.sprintSpent = false;
    this.hitFlash = 0;
    this.hitDisorientationTime = 0;
    this.hitDisorientationStrength = 0;
    this.hitMarks.length = 0;
    this.hitEvents.length = 0;
    this.heartbeatTimer = 0;
    this.stance = "stand";
    this.grounded = true;
    this.alive = true;
    this.deadTime = 0;
    // 出生保护。ER2 有这条（重生后几秒无敌），我写进了对齐文档却一直没实现 ——
    // 而接替者必然出生在还在打的地方，没有这几秒，他睁眼那一刻就在九支枪的射界里。
    this.spawnGrace = SPAWN.graceS;
    this.recoilPending.pitch = 0;
    this.recoilPending.yaw = 0;
    this.recoilTotal = 0;
    this.recoilSince = 999;
    this.recoilPeak = 0;
    this.bipod = false;
    this.fastCrawl = false;
    this.freeAimLimitDeg = DIFFICULTY.freeAimDeg;
    this.vault.active = false;
    this.jump.coyote = JUMP.coyoteS;
    this.jump.buffer = 0;
    this.jump.cooldown = 0;
    this.jump.airTime = 0;
    this.jump.landImpact = 0;
    this.jump.runK = 0;
    this.shake.Reset();
    this.waterDepth = 0;
  }

  get Alive() { return this.alive; }
  get Protected() { return this.spawnGrace > 0; }
  /** 翻越/下水期间不许开火。装配层的 TryFire 读这一条。 */
  get Busy() { return this.vault.active; }
  get InWater() { return this.waterDepth > 0.35; }

  SetDebugOptions(options = {}) {
    this.debug.noCollision = options.noCollision === true;
    this.debug.fastMove = options.fastMove === true;
    this.debug.invincible = options.invincible === true;
    if (this.debug.invincible && this.alive) {
      this.health = 100;
      this.bleeding = 0;
      this.wounds.length = 0;
      this.hitFlash = 0;
      this.hitDisorientationTime = 0;
      this.hitDisorientationStrength = 0;
      this.hitMarks.length = 0;
      this.hitEvents.length = 0;
      this.heartbeatTimer = 0;
    }
  }
  get EyePosition() {
    const offset = this.LeanOffsetM;
    return this._tmp.set(this.position.x + Math.cos(this.yaw) * offset,
      this.position.y + this.eyeHeight, this.position.z - Math.sin(this.yaw) * offset);
  }

  get LeanOffsetM() { return this.lean * CAMERA.leanOffsetM * (1 - this.stanceBlend.prone); }

  ResetLean() { this.lean = 0; this.autoLean = 0; this.coverLean?.Reset(); }

  UpdateLean(dt, input, weapon, aiming) {
    const eye = { x: this.position.x, y: this.position.y + this.eyeHeight, z: this.position.z };
    const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
    const queries = this.physics || this.world;
    const raycast = queries.Raycast?.bind(queries);
    const overlaps = this.physics?.Overlaps.bind(this.physics);
    const clearance = (at, axis, offset) => LeanClearance(at, axis, offset, overlaps, raycast);
    const allowed = this.alive && this.grounded && this.stance !== "prone" && !this.Busy
      && !this.InWater && this.carrySpeedScale >= 1 && !this.bipod && !aiming?.blockLean
      && this.sprint < COVER_LEAN.maxSprint;
    const manual = allowed ? Clamp(input.lean || 0, -1, 1) : 0;
    this.autoLean = this.coverLean.Update(dt, {
      enabled: allowed && !manual && this.wantAds && !!weapon?.magazine && weapon.kind !== "throwable"
        && Math.abs(this.pitch) <= COVER_LEAN.maxPitchRad
        && Math.hypot(this.velocity.x, this.velocity.z) <= COVER_LEAN.maxSpeedMps,
      eye, right, forward: this.AimDirection(this._forward), raycast, clearance,
    });
    const target = manual || this.autoLean;
    this.lean += (target - this.lean) * (1 - Math.exp(-dt * MOVE.leanRate));
    if (Math.abs(this.lean) < COVER_LEAN.stopEpsilon) this.lean = 0;
    // A newly reached wall clips even an outgoing transition immediately.
    const offset = this.LeanOffsetM;
    if (offset && raycast) this.lean *= Math.min(1, clearance(eye, right, offset) / Math.abs(offset));
  }

  /** The gun cannot start a bullet beyond a wall crossed by its barrel. */
  MuzzleObstruction(muzzle) {
    const eye = this.EyePosition.clone();
    const direction = muzzle.clone().sub(eye), distance = direction.length();
    const queries = this.physics || this.world;
    if (distance <= COVER_LEAN.skinM || !queries.Raycast) return null;
    direction.divideScalar(distance);
    const wall = queries.Raycast(eye, direction, distance, { terrain: true });
    return wall ? { wall, point: eye.addScaledVector(direction, wall.t), dist: wall.t, dir: direction } : null;
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

  /** 键盘与 HUD 共用的姿态入口；换姿态收起两脚架，不能在翻越中途改身体。 */
  SetStance(stance) {
    if (!Object.hasOwn(STANCE, stance) || !this.alive || this.vault.active) return false;
    if (this.stance !== stance) this.bipod = false;
    this.stance = stance;
    return true;
  }

  /**
   * 翻越 / 攀爬。朝前探一次：前方 0.6 m 有个顶面落在通行阶梯里的东西
   *（`TRAVERSAL.vaultMin` 到 `mantleMax`），而且顶面往前落得下脚，
   * 就按那一档播位移曲线过去。腰高走"翻越"（快、荡过去），
   * 肩高走"攀爬"（慢、撑上去），高过 `mantleMax` 一律不许过 —— 那是墙，去找门洞。
   *
   * 这条只负责探测；同一个 Space 在探测失败后会由装配层转入受限跳跃。
   * 必须先探翻越再跳，否则人会先离地，院墙动作反而永远触发不了。
   *
   * @returns {false|"vault"|"mantle"} 进了哪一档动作；没进就是 false
   */
  TryVault() {
    if (!this.alive || this.vault.active || !this.grounded) return false;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const feet = this.position.y;
    const probeX = this.position.x + fx * 0.6;
    const probeZ = this.position.z + fz * 0.6;
    const r = this.radius;

    // 1) 前面有没有过得去的东西。同一次扫描顺手认一件事：正前方那堵墙**高过上限**
    //    的话直接判死 —— 通行阶梯的硬顶是关卡设计的承诺，不许用别处的矮台阶绕开。
    let top = -Infinity;
    let wall = false;
    const obstacles = new Set();
    const near = this.world.NearbyColliders
      ? this.world.NearbyColliders(probeX, probeZ, r + 1.2)
      : this.world.colliders;
    for (const box of near) {
      if (probeX + r < box.min[0] || probeX - r > box.max[0]) continue;
      if (probeZ + r < box.min[2] || probeZ - r > box.max[2]) continue;
      if (box.min[1] > feet + 1.0) continue;                 // 悬在头顶的檐口不是墙头
      const rel = box.max[1] - feet;
      if (rel > TRAVERSAL.mantleMax) {
        // 从脚下一直长到上限之上 = 一堵真墙。两条限定，免得误伤：
        //   · 半空里的横梁不算（min 要低到腰以下）；
        //   · **必须挡在正前方**——判死用的是探针点本身（±0.15 m），不是那圈
        //     半径 r 的光晕。否则"巷子里正对着一堵齐腰街垒、旁边贴着一栋房"
        //     会因为房子蹭到光晕而连翻越都不给。斜着切进来的高墙仍由落点检查兜住。
        if (box.min[1] <= feet + TRAVERSAL.vaultMin
          && probeX > box.min[0] - 0.15 && probeX < box.max[0] + 0.15
          && probeZ > box.min[2] - 0.15 && probeZ < box.max[2] + 0.15) wall = true;
        continue;
      }
      if (rel < TRAVERSAL.vaultMin) continue;
      // 记下"正在翻的是哪几只盒"。落点检查要把它们摘出去 —— 人正是从它们上面
      // 过来的，厚墙的盒子伸进落点那一格是应当的，不能反过来判自己落不下去。
      obstacles.add(box);
      if (box.max[1] > top) top = box.max[1];
    }
    if (wall || !Number.isFinite(top)) return false;
    const plan = TraversalPlan(top - feet);
    if (!plan) return false;
    if (this.stamina < plan.stamina) return false;           // 喘不上气就扒不动墙头

    // 2) 顶面往前落得下脚吗。判据在 `Data_Traversal.TraversalLanding`，与 AI 共用：
    //    盖住落点、顶面容得下人的才算地面，落点这一格里不许有支棱着的东西。
    //    这里原来是"半径 r 的光晕蹭到就算脚下的地面"，于是车厢头尾那块 0.2 m 的
    //    挡板成了落脚面，人被放到板顶上——那就是"车厢边缘起跳会飞起来"。
    const landX = this.position.x + fx * plan.reach;
    const landZ = this.position.z + fz * plan.reach;
    const landNear = this.world.NearbyColliders
      ? this.world.NearbyColliders(landX, landZ, r + 0.6)
      : this.world.colliders;
    const landY = TraversalLanding(landNear, this.position, { x: landX, z: landZ },
      this.world.GroundHeight(landX, landZ), top + 0.05, r, obstacles);
    if (landY === null) return false;                        // 墙那边还是墙：翻过去没地方站

    this._vaultFrom.copy(this.position);
    this._vaultTo.set(landX, landY, landZ);
    this.vault.active = true;
    this.vault.t = 0;
    this.vault.kind = plan.kind;
    this.vault.rise = top - feet;
    this.vault.duration = plan.duration;
    this.vault.dip = plan.dip;
    // 顶点：翻越荡到墙头之上一点，攀爬只贴着墙头蹭过去。
    // 起点/落点比它还高时以高者为准，免得曲线往回倒。
    this.vault.apexY = Math.max(top + plan.apexOver, feet, landY);
    this.velocity.set(0, 0, 0);
    this.stance = "stand";                                   // 蹲着趴着翻不过去，先站起来
    this.stamina = Clamp01(this.stamina - plan.stamina);
    this.vaultCount += 1;
    if (plan.kind === "mantle") this.mantleCount += 1;
    return plan.kind;
  }

  /**
   * 空地跳跃。翻越探测由调用方先做；这里只有「现在能不能离地」这一条规则。
   * 已经在半空、或者刚落地还在落地硬直里时，会留下 120 ms 的输入缓冲，
   * 落地前后略早按下也不会丢键（硬直期间缓冲不走表，见 Update 开头）。
   * @returns {boolean} 这一刻是否真的起跳
   */
  TryJump() {
    if (!this.alive || this.vault.active || this.InWater || this.stance === "prone") return false;
    if (this.stamina < JUMP.stamina) return false;
    // 冷却也要进缓冲：原来冷却里按下直接 return，边跑边连跳时落地后那 0.16 s
    // 里按的空格整个被吞掉。
    if ((!this.grounded && this.jump.coyote <= 0) || this.jump.cooldown > 0) {
      this.jump.buffer = JUMP.bufferS;
      return false;
    }
    this.stance = "stand";
    // 助跑加成：0（站着/慢步）→ 1（站姿冲刺）。fastMove 之类的超速一律按满档，
    // 不再往上叠 —— 调试速度不该顺手变成一个能上房的跳。
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    const runK = Clamp01((planar - JUMP.runMinMps) / (JUMP.runFullMps - JUMP.runMinMps));
    this.velocity.y = JUMP.speedMps * (1 + JUMP.runRise * runK);
    if (runK > 0 && planar > 1e-3) {
      const push = 1 + JUMP.runPush * runK;
      this.velocity.x *= push;
      this.velocity.z *= push;
    }
    this.jump.runK = runK;
    this.grounded = false;
    this.jump.coyote = 0;
    this.jump.buffer = 0;
    this.jump.cooldown = JUMP.cooldownS;
    this.jump.airTime = 0;
    this.jump.count += 1;
    this.stamina = Clamp01(this.stamina - JUMP.stamina * (1 + JUMP.runStamina * runK));
    this.ads = Math.min(this.ads, JUMP.adsOnJump);   // 起跳先把枪从照门上摘下来
    this.wantAds = false;
    return true;
  }

  /**
   * 翻越途中的一帧：位移曲线走完就落地。期间禁开火、身体走写死的曲线，
   * **但视线照转** —— 一按空格人贴着矮墙就进翻越，画面会僵住半秒；玩家那半秒
   * 里推鼠标什么都不发生，读出来就是"起跳的时候镜头转不动"。翻的是身体不是脖子。
   */
  _StepVault(dt, input) {
    const v = this.vault;
    v.t += dt;
    // 只有相机直跟这一条：自由瞄准/后坐回落都跟着 Update 一起跳过了，
    // 翻墙那半秒本来也不该有据枪微调。
    if (input) {
      const sens = (input.sensitivity ?? 1) * FREE_AIM.sensitivityScale;
      this.yaw += -(input.lookX || 0) * sens;
      this.pitch = Clamp(this.pitch + -(input.lookY || 0) * sens,
        -FREE_AIM.pitchLimitRad, FREE_AIM.pitchLimitRad);
    }
    const k = Clamp01(v.t / v.duration);
    const c = TraversalCurve(v.kind, k);
    const from = this._vaultFrom, to = this._vaultTo;
    this.position.x = from.x + (to.x - from.x) * c.h;
    this.position.z = from.z + (to.z - from.z) * c.h;
    // 起点 →（爬）→ 顶点 →（掉）→ 落点。两段分开走，k=1 才会**精确**落在落点上；
    // 老写法是"线性基线 + 一条正弦驼峰"，上下对称、水平匀速 —— 那条曲线读出来
    // 就是用户说的「像是没有重力」。
    this.position.y = from.y + (v.apexY - from.y) * c.up - (v.apexY - to.y) * c.down;
    this.grounded = false;
    // 眼高照常收敛，不然翻越途中视线会僵在起跳那一刻
    const target = STANCE[this.stance];
    const rate = 1 - Math.exp(-dt * MOVE.stanceLerpRate);
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

  Update(dt, input, weapon, aiming = null) {
    if (!this.alive) {
      this.deadTime += dt;
      this.SyncDeathCamera();
      return;
    }
    // 翻越期间接管整帧：不读输入、不走碰撞、不开火（Busy 为真）
    if (this.vault.active) { this.ResetLean(); return this._StepVault(dt, input); }

    this.jump.cooldown = Math.max(0, this.jump.cooldown - dt);
    if (this.jump.buffer > 0) {
      if (this.grounded && this.jump.cooldown <= 0) {
        this.jump.buffer = 0;                 // 先清：体力不够时 TryJump 不会再挂回缓冲
        this.TryJump();
      } else if (!this.grounded) {
        // 已经落地、只在等落地硬直（landCooldownS 0.16 s）时缓冲不走表。
        // 硬直比缓冲（0.12 s）长，走表的话落地前按下的那一下必然在硬直里过期。
        this.jump.buffer = Math.max(0, this.jump.buffer - dt);
      }
    }

    // --- 视角与自由瞄准 -----------------------------------------------------
    const sens = (input.sensitivity ?? 1) * FREE_AIM.sensitivityScale;
    // 架起两脚架之后转向只剩三成：机枪压在垛口上，横过来要连人带枪挪。
    // 这是"机枪手必须先选好位置"这条战术决策的成本，不是手感黏滞。
    const adsScale = (1 - this.ads * FREE_AIM.adsLookScale)
      * (this.bipod ? FREE_AIM.bipodLookScale : 1);
    const dx = -input.lookX * sens * adsScale;
    const dy = -input.lookY * sens * adsScale;

    // 后坐回落 —— 照战地的曲线，不是指数衰减。曲线的形状与出处见
    // `Data_Tuning_Player.RECOIL` 的头注与 docs/Data_BattlefieldNumbers.md。
    this.recoilSince += dt;
    const pend = Math.hypot(this.recoilPending.pitch, this.recoilPending.yaw);
    if (pend > RECOIL.epsilon) {
      const T = Math.max(RECOIL.minRecoverS, this.recoilRecoverS);
      const peak = Math.max(pend, this.recoilPeak || pend);
      const K = RECOIL.gain / Math.sqrt(T);
      const dec = Math.pow(pend / peak, RECOIL.exponent) * (peak / T) * K * Math.sqrt(this.recoilSince) * dt;
      const scale = Math.max(0, 1 - dec / pend);
      const bp = this.recoilPending.pitch * (1 - scale);
      const by = this.recoilPending.yaw * (1 - scale);
      this.pitch -= bp; this.recoilPending.pitch -= bp;
      this.yaw -= by; this.recoilPending.yaw -= by;
      this.recoilTotal -= bp;                 // 取证字段跟着回，归零即"已收干净"
      if (scale <= 0) this.recoilPeak = 0;
    }

    // 自由瞄准：静止时先动枪，枪顶到边界才推动视线。开镜时收窄到 1.4°。
    // 走路时必须改成相机直跟鼠标：步伐摆枪会遮住 2° 锥内的枪口反馈，继续让枪先动
    // 就会表现成「鼠标已经动了，相机却黏在原处」。移动输入一出现，新的鼠标增量全额
    // 交给 yaw/pitch；原有的枪口偏移快速收回，同时等量补给相机以保持世界瞄准点不跳。
    // 每帧从难度表取，滑条一拨就生效（缓存在字段里的话要重生一次才认）。
    this.freeAimLimitDeg = DIFFICULTY.freeAimDeg;
    const limit = THREE.MathUtils.degToRad(this.freeAimLimitDeg * (1 - this.ads * FREE_AIM.adsNarrow));
    const walking = Math.hypot(input.forward || 0, input.strafe || 0) > FREE_AIM.walkThreshold;
    // 腾空时同样按「相机直跟」走。原来只看 forward/strafe：原地按空格跳起来时两者
    // 都是 0，鼠标位移就全落进那 2° 的自由瞄准锥里 —— 屏幕上就是「一跳起来镜头
    // 转不动了」，落地才突然接上。人在半空本来也谈不上据枪微调，这一段没有存在意义。
    const directLook = walking || !this.grounded;
    if (directLook) {
      this.yaw += dx;
      this.pitch += dy;
      const recentre = 1 - Math.exp(-dt * FREE_AIM.directRecentreRate);
      const backYaw = this.aimYaw * recentre;
      const backPitch = this.aimPitch * recentre;
      this.aimYaw -= backYaw; this.yaw += backYaw;
      this.aimPitch -= backPitch; this.pitch += backPitch;
    } else {
      this.aimYaw += dx;
      this.aimPitch += dy;
      if (this.aimYaw > limit) { this.yaw += this.aimYaw - limit; this.aimYaw = limit; }
      if (this.aimYaw < -limit) { this.yaw += this.aimYaw + limit; this.aimYaw = -limit; }
      if (this.aimPitch > limit) { this.pitch += this.aimPitch - limit; this.aimPitch = limit; }
      if (this.aimPitch < -limit) { this.pitch += this.aimPitch + limit; this.aimPitch = -limit; }
    }
    // 枪慢慢回到视线中心（松手之后自己归位，不然久了会一直歪着）——
    // **但只在手停下来之后归位。**
    //
    // 原来是每帧无条件乘一个 exp(-dt·2.2)，那等于给自由瞄准装了一个漏斗：
    // 持续推鼠标时偏移会停在稳态 aimYaw* = 鼠标角速度 / 2.2，
    // 慢推（< 0.077 rad/s，也就是约 35 count/s）时枪口永远顶不到 2° 的边界，
    // 于是**视线一步都不转**，而自由瞄准那一段当时又没画出来（见 Script_Viewmodel
    // 的 freeAim 层）—— 屏幕上就是"鼠标动了，什么都没动"。小幅微调整个失灵。
    //
    // 归位延后 0.10 s 起、再用 0.12 s 拉满。手在动的时候不归位，
    // 于是鼠标位移 1:1 全额落在枪口方向（yaw + aimYaw）上：
    // 边界以内动的是枪、边界以外动的是视线，但**总瞄准角与鼠标永远是 1:1**。
    const looking = directLook || Math.abs(dx) + Math.abs(dy) > 1e-6;
    this.lookIdle = looking ? 0 : this.lookIdle + dt;
    const settle = Clamp01((this.lookIdle - FREE_AIM.settleDelayS) / FREE_AIM.settleSpanS);
    if (settle > 0) {
      const recentre = Math.exp(-dt * (FREE_AIM.recentreRate + this.ads * FREE_AIM.adsRecentreBoost) * settle);
      // 归位收回来的这一段**交给视线**，不是凭空丢掉：
      // 枪回到画面中间的同时相机自己转过同样的角度，枪口在世界里指着的那个点不动。
      // 不补的话，玩家把枪停在目标上、手一松，瞄准点会在 1.5 s 里自己漂掉 2°
      // （一百米上 3.5 m），而画面上什么提示都没有 —— 那才是真正没法瞄。
      const backYaw = this.aimYaw * (1 - recentre);
      const backPitch = this.aimPitch * (1 - recentre);
      this.aimYaw -= backYaw; this.yaw += backYaw;
      this.aimPitch -= backPitch; this.pitch += backPitch;
    }
    this.pitch = Clamp(this.pitch, -FREE_AIM.pitchLimitRad, FREE_AIM.pitchLimitRad);

    // --- 姿态 ---------------------------------------------------------------
    if (input.stanceRequested) this.SetStance(input.stanceRequested);
    else if (input.pronePressed) this.SetStance(this.stance === "prone" ? "stand" : "prone");
    else if (input.crouchPressed) this.SetStance(this.stance === "crouch" ? "stand" : "crouch");
    // 压制到一定程度会被逼得趴下 —— 这是 ER2 式压制最有说服力的一笔
    // 压制**不再偷偷改玩家的姿态**。
    // 原来是 suppression > 0.85 就把 stance 直接改成 crouch：玩家没按任何键，
    // HUD 上姿态从「立」自己跳到「蹲」，移动速度从 3.05 掉到 1.62 ——
    // 体感就是「WASD 时灵时不灵」，而且找不到原因（唯一的反馈是一圈很淡的暗角）。
    // 改成只在**玩家自己按下过蹲/卧**之后才由压制维持；纯站着挨打就只是走得慢一点，
    // 是不是趴下由玩家自己决定。这也更接近 ER2：压制影响的是精度与视野，不是替你操作。
    if (this.suppression > SUPPRESSION.uprightEnter && this.stance === "stand") {
      this.suppressedUpright = true;          // 只做提示，不改姿态
    } else if (this.suppression < SUPPRESSION.uprightExit) {
      this.suppressedUpright = false;
    }
    const target = STANCE[this.stance];
    const rate = 1 - Math.exp(-dt * MOVE.stanceLerpRate);
    this.eyeHeight += (target.eye - this.eyeHeight) * rate;
    this.radius += (target.radius - this.radius) * rate;
    this.stanceBlend.crouch += ((this.stance === "crouch" ? 1 : 0) - this.stanceBlend.crouch) * rate;
    this.stanceBlend.prone += ((this.stance === "prone" ? 1 : 0) - this.stanceBlend.prone) * rate;

    // --- 开镜 / 冲刺 / 侧身 --------------------------------------------------
    // ER2 的规矩：架式武器不架起两脚架就不许开镜（MG42/白朗宁/反坦克枪都是）。
    // 捷克式套这条正好 —— 全班就这一挺，架起来才有 800 m 有效射程。
    const bipodBlocked = !!(weapon && weapon.bipod) && !this.bipod && !aiming?.allowUndeployedAds;
    // 抬着东西时枪根本不在手上（视图模型也收了），开镜与冲刺一并封掉。
    const loaded = this.carrySpeedScale < 1;
    const wantAds = input.ads && !bipodBlocked && this.grounded && !loaded ? 1 : 0;
    // 存下来给相机用。相机侧的 FOV 过渡（固定 150 ms）要跟玩家读同一个"意图"，
    // 而不是自己再去看一遍 input.ads —— 那样会漏掉两脚架未架起时的封锁。
    this.wantAds = wantAds === 1;
    const adsSpeed = 1 / Math.max(0.08, weapon?.adsTimeS ?? 0.3);
    this.ads += Clamp((wantAds - this.ads) * dt * adsSpeed * 3, -dt * 6, dt * 6);
    this.ads = Clamp01(this.ads);
    // 卧姿按住 Shift = 快速匍匐（ER2 有匍匐速度档）。它不是冲刺：不进 sprint 弹簧，
    // 只把速度从 0.72 提到 1.25，并把脚步声放大 —— 快就得响，这是一对取舍。
    // 冲刺下限至少留够一次满助跑起跳；跑空之后要回到 sprintResume 才重新让跑（回差）。
    // 两条的账在 Data_Tuning_Player.STAMINA 的注释里。每帧从表取，热改表才生效。
    const sprintFloor = Math.max(STAMINA.sprintMin, JUMP.stamina * (1 + JUMP.runStamina));
    if (this.stamina <= sprintFloor) this.sprintSpent = true;
    else if (this.stamina >= STAMINA.sprintResume) this.sprintSpent = false;
    this.fastCrawl = !!input.sprint && this.stance === "prone" && !this.sprintSpent;
    const canSprint = input.sprint && !this.sprintSpent && this.ads < 0.25
      && this.stance === "stand" && input.forward > 0.3 && !loaded;
    this.sprint += ((canSprint ? 1 : 0) - this.sprint) * (1 - Math.exp(-dt * MOVE.sprintRate));
    // 冲刺时长挂难度：staminaSeconds 就是"从满到空能跑几秒"。
    const burn = 1 / Math.max(1, DIFFICULTY.staminaSeconds);
    // 恢复的上限受 staminaCeiling 夹（五关终局的章节作用域旋钮，常态 1；消耗不受它管）。
    this.stamina = Math.max(0, Math.min(this.staminaCeiling ?? 1,
      this.stamina + ((canSprint || this.fastCrawl) ? -dt * burn : dt * STAMINA.regenPerS)));

    // 屏息：只在开镜时有意义，能压住摇摆，但会很快耗尽
    this.breathHold = !!input.breathHold && this.ads > STAMINA.breathHoldAds
      && this.stamina > STAMINA.breathHoldMin;
    if (this.breathHold) this.stamina = Clamp01(this.stamina - dt * STAMINA.breathHoldDrainPerS);

    // --- 下水（软墙，不是游泳系统）-------------------------------------------
    // 运河是全城唯一的退路与补给线，而那条退路是 5.5 m 宽的浮桥。
    // 玩家要是能游过去，浮桥的史实分量就没了。所以下水不封路，只让它明显不划算：
    // 速度四分之一、开不了枪（枪泡水里）、体力一直掉。**不设溺死判定** ——
    // 被一条自己走进去的水淹死，比"走不过去"更像 bug。
    this.waterDepth = this.world.WaterDepth
      ? this.world.WaterDepth(this.position.x, this.position.z, this.position.y)
      : 0;
    if (this.InWater) {
      this.stamina = Clamp01(this.stamina - dt * STAMINA.waterDrainPerS);
      this.ads = 0;
      this.breathHold = false;
    }

    // --- 移动 ---------------------------------------------------------------
    // 这条乘法链就是「移动的账只有一本」那条纪律；每个系数的账在 MOVE 里。
    let speed = target.speed;
    if (this.fastCrawl) speed = MOVE.fastCrawlMps;  // 卧姿 0.72 -> 1.25
    speed *= 1 + this.sprint * MOVE.sprintBoost;
    speed *= 1 - this.ads * MOVE.adsSlow;
    speed *= 1 - this.suppression * MOVE.suppressionSlow;
    if (this.InWater) speed *= MOVE.waterSlow;
    // 腿部中弹会拖着走
    speed *= this.LegPenalty();
    speed *= Clamp(this.health / MOVE.healthSlowDiv, MOVE.healthSlowMin, 1);
    // 负重（担架 / 弹药箱 / 门板…各自一档，数在 Data_Carry.CARRY_KINDS）
    speed *= Clamp(this.carrySpeedScale, MOVE.carryScaleMin, 1);
    if (this.debug.fastMove) speed *= MOVE.debugFastMoveScale;

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
    if ((input.forward || 0) < 0) speed *= MOVE.backwardScale;
    // Explicit scenario dive impulse: still requires directional input and uses normal collision.
    // Absent in normal play; the host only enables it during a live, intentional ditch dive.
    if (this.stance !== "stand" && !this.InWater && Number.isFinite(input.diveSpeedMps)) speed = Math.max(speed, Math.min(MOVE.diveSpeedCapMps, input.diveSpeedMps));

    const desired = wish.multiplyScalar(speed);
    // 空中不许**加速**到助跑之上（accel 3 只够小幅修正方向），但也不能把蹬地那一下
    // 的动量当阻力擦掉 —— 半空里比目标速度快的时候收敛慢一档，否则 0.5 s 的滞空
    // 会把 16% 的助跑加成磨掉近八成，加了等于没加。
    const overRun = !this.grounded
      && Math.hypot(this.velocity.x, this.velocity.z)
        > Math.hypot(desired.x, desired.z) + MOVE.overrunMarginMps;
    const accel = this.grounded ? MOVE.accelGround
      : (overRun ? MOVE.accelAirOverrun : MOVE.accelAir);
    this.velocity.x += (desired.x - this.velocity.x) * Clamp01(dt * accel);
    this.velocity.z += (desired.z - this.velocity.z) * Clamp01(dt * accel);
    const wasGrounded = this.grounded;
    const fallSpeed = Math.max(0, -this.velocity.y);
    this.velocity.y -= JUMP.gravityMps2 * dt;

    this.MoveWithCollision(dt);
    this.UpdateLean(dt, input, weapon, aiming);

    if (!this.grounded) {
      this.jump.airTime += dt;
      this.jump.coyote = Math.max(0, this.jump.coyote - dt);
    } else {
      this.jump.coyote = JUMP.coyoteS;
      if (!wasGrounded) {
        this.jump.landImpact = Clamp01((fallSpeed - JUMP.landImpactBaseMps) / JUMP.landImpactSpanMps);
        this.shake.Landing(this.jump.landImpact);
        this.jump.landSerial += 1;
        this.jump.airTime = 0;
        // 落地以后要把重心重新接住，不能在同一帧把缓冲输入变成下一跳。
        this.jump.cooldown = Math.max(this.jump.cooldown, JUMP.landCooldownS);
      }
    }

    // --- 脚步 / 晃动 --------------------------------------------------------
    this.shake.Update(dt);
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    this.stepDistance += planar * dt;
    this.headBob = Math.sin(this.stepDistance
      * (this.stance === "prone" ? CAMERA.strideProne : CAMERA.strideStand)) * 0.5 + 0.5;

    // --- 流血 ---------------------------------------------------------------
    if (this.debug.invincible) {
      this.health = 100;
      this.bleeding = 0;
      this.wounds.length = 0;
    } else if (this.bleeding > 0) {
      // 封顶。伤口是叠加的，四个躯干伤口 = 10.4 HP/s，而衰减是 5%/s ——
      // 那不是"慢性死亡"，那是一块十秒的秒表，包扎只有两卷也追不上。
      // 上限之下它仍然逼你去包扎，上限之上它只是替敌人把你打完。
      const cap = COMBAT.player?.maxBleedPerS ?? WOUNDS.maxBleedPerSFallback;
      if (this.bleeding > cap) this.bleeding = cap;
      this.health -= this.bleeding * dt;
      // 伤口自己会慢慢收一点，但收不干净 —— 不包扎就是慢性死亡
      this.bleeding = Math.max(this.bleeding * Math.exp(-dt * WOUNDS.bleedDecayPerS),
        this.bleeding - dt * WOUNDS.bleedDecayFlatPerS);
      if (this.health <= 0) this.Kill();
    }

    this.hitDisorientationTime = Math.max(0, this.hitDisorientationTime - dt);

    // --- 受击反馈的寿命 ------------------------------------------------------
    // 红闪衰减比暗角快：它要读起来像"挨了一下"，不是"我现在很虚"。
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * HIT_FEEDBACK.flashDecayPerS);
    for (let i = this.hitMarks.length - 1; i >= 0; i -= 1) {
      const m = this.hitMarks[i];
      m.life -= dt;
      if (m.life <= 0) this.hitMarks.splice(i, 1);
    }
    // 濒死心跳：血越少跳得越快（Audio/Sfx 的 Heartbeat 素材烘好了一直没人播）。
    // 只在 45 以下开始 —— 再高就成了背景噪音，那条线也就不再是信号了。
    if (this.alive && this.health < HIT_FEEDBACK.heartbeatBelowHp) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = Clamp(
          HIT_FEEDBACK.heartbeatMinS + this.health * HIT_FEEDBACK.heartbeatPerHp,
          HIT_FEEDBACK.heartbeatMinS, HIT_FEEDBACK.heartbeatMaxS);
        this.PushHitEvent({
          kind: "heartbeat",
          severity: 1 - this.health / HIT_FEEDBACK.heartbeatBelowHp,
        });
      }
    } else {
      this.heartbeatTimer = 0;
    }

    if (this.spawnGrace > 0) this.spawnGrace -= dt;

    // --- 压制自然衰减 -------------------------------------------------------
    this.suppression = Math.max(0, this.suppression - dt * SUPPRESSION.decayPerS);

    this.SyncCamera(dt);
    return { planarSpeed: planar };
  }

  LegPenalty() {
    let p = 1;
    for (const w of this.wounds) if (w.part === "leg") p *= WOUNDS.legPenalty;
    return Math.max(WOUNDS.legFloor, p);
  }

  /** 手臂中弹：瞄准摇摆变大、拉栓变慢。 */
  ArmPenalty() {
    let p = 1;
    for (const w of this.wounds) if (w.part === "arm") p *= WOUNDS.armPenalty;
    return Math.min(WOUNDS.armCap, p);
  }

  /**
   * 章节可选的二级可玩区约束。矩形 bounds 负责防止走出已生成切片；这一层负责把
   * 大场景收成设计好的路线形状。回调只返回 x/z，不把关卡数据泄漏进玩家控制器。
   */
  ApplyWorldConstraint(body = null) {
    const constrain = this.world && this.world.ConstrainPosition;
    if (typeof constrain !== "function") return false;
    const result = constrain(this.position.x, this.position.z);
    if (!result || !Number.isFinite(result.x) || !Number.isFinite(result.z)) return false;
    if (Math.abs(result.x - this.position.x) < 1e-5
      && Math.abs(result.z - this.position.z) < 1e-5) return false;
    this.position.x = result.x;
    this.position.z = result.z;
    // 空气墙只做水平裁回；脚底重新贴当前地形，避免斜坡边缘裁回后悬空或入地。
    const ground = this.world.GroundHeight(this.position.x, this.position.z);
    if (this.position.y < ground) this.position.y = ground;
    if (body) body.Teleport(this.position.x, this.position.y, this.position.z);
    return true;
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
      this.ApplyWorldConstraint();
      return;
    }
    // 有人绕过物理直接改了 position（过场摆位、冒烟脚本摆人）就认外面那份
    body.ReconcileTo(this.position.x, this.position.y, this.position.z);
    body.SetSize(this.radius, height);
    const step = this._tmp.copy(this.velocity).multiplyScalar(dt);
    // 调试无碰撞仍然**不允许穿地**：实体/角色碰撞跳过，但脚底继续被程序化
    // 地形托住。这里不改 CharacterBody，AI 及其他物理角色始终走正常解算。
    if (this.debug.noCollision) {
      this.position.add(step);
      const ground = this.world.GroundHeight(this.position.x, this.position.z);
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.velocity.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
      const bounds = this.world.bounds;
      if (bounds) {
        this.position.x = Clamp(this.position.x, bounds.minX + 1, bounds.maxX - 1);
        this.position.z = Clamp(this.position.z, bounds.minZ + 1, bounds.maxZ - 1);
      }
      this.ApplyWorldConstraint();
      body.Teleport(this.position.x, this.position.y, this.position.z);
      return;
    }
    const yBefore = this.position.y;
    const moved = body.Move(step.x, step.y, step.z);
    this.position.set(moved.x, moved.y, moved.z);
    // **半空里不许白拿高度。**
    //
    // 这是"靠近墙壁跳跃高度非常高、像是没有重力"的直接病根：上升途中贴着墙，
    // 角色控制器会把碰撞解算里那点自动抬腿/沿棱角上蹭的竖直分量一并给你，
    // 实测同一次起跳：空地抬高 0.513 m，贴着院墙 0.78 m —— 高出五成。
    // 抬腿是**脚踩在地上**才有的动作；人在上升段，能给的高度只有速度乘 dt。
    // 下落段不钳：那时候被台面接住正是落地，钳了就穿地。
    if (this.velocity.y > 0 && this.position.y > yBefore + step.y + 1e-4) {
      // 但地面永远优先：解析地表把人从地里顶出来那一下不算"白拿"，
      // 钳过头会把上坡起跳的人按回地面以下。
      const ground = this.world.GroundHeight(this.position.x, this.position.z);
      const capped = Math.max(ground, yBefore + step.y);
      if (this.position.y > capped) {
        this.position.y = capped;
        body.Teleport(this.position.x, this.position.y, this.position.z);
      }
    }
    // Rapier 在离地首帧仍可能把脚底旧接触报成 grounded（实测会把 4.65 m/s 的
    // 起跳在第一帧清零，只抬高 7 cm）。明确向上运动时，脚底接触不能算落地；
    // 只有到达顶点开始下落以后，控制器的 grounded 才重新有裁决权。
    this.grounded = this.velocity.y > 0.01 ? false : moved.grounded;
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
    this.ApplyWorldConstraint(body);
  }

  SyncCamera(dt) {
    const cam = this.camera;
    // 步伐晃动：走路上下 + 左右 8 字。开镜压到 20%，卧倒几乎没有。
    const damp = (1 - this.ads * CAMERA.bobAdsDamp) * (1 - this.stanceBlend.prone * CAMERA.bobProneDamp);
    const bobAmp = CAMERA.bobAmp * damp
      * Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / CAMERA.bobRefMps)
      * (this.grounded ? 1 : 0);
    const bobY = Math.sin(this.stepDistance * CAMERA.bobYFreq) * bobAmp;
    const bobX = Math.sin(this.stepDistance * CAMERA.bobXFreq) * bobAmp * CAMERA.bobXScale;
    // 侧身：身体横移 + 相机滚转，探头出去看的那一下必须有位移，不然只是画面歪了
    const leanOffset = this.LeanOffsetM;
    const rightVec = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    cam.position.set(
      this.position.x + bobX + rightVec.x * leanOffset,
      this.position.y + this.eyeHeight + bobY,
      this.position.z + rightVec.z * leanOffset);
    cam.rotation.order = "YXZ";
    cam.rotation.y = this.yaw;
    // 翻越途中视角轻微下压：手撑上墙头的那一下人是低着头的。
    // 只改相机不改 this.pitch —— 动 pitch 的话翻完枪口会歪着，玩家得自己抬回来
    const vaultDip = this.vault.active
      ? Math.sin(Math.PI * Clamp01(this.vault.t / this.vault.duration)) * this.vault.dip : 0;
    cam.rotation.x = this.pitch - vaultDip;
    const melee = this.meleePose;
    const floorTarget = melee?.state === "fall" ? SmoothStep(0, 1, melee.normalized)
      : melee?.state === "rise" ? 1 - SmoothStep(0, 1, melee.normalized)
      : melee?.state === "down" || (melee?.state === "qte" && melee.qteKind === "ground") ? 1 : 0;
    this.meleeCameraDrop = (this.meleeCameraDrop || 0) + (floorTarget - (this.meleeCameraDrop || 0)) * Math.min(1, dt * 16);
    cam.position.y -= this.meleeCameraDrop * (this.eyeHeight - 0.28);
    cam.rotation.x += this.meleeCameraDrop * 0.78;
    const focusing = melee?.state === "qte" && Number.isFinite(melee.focusYaw);
    this.meleeCameraFocus = (this.meleeCameraFocus || 0) + ((focusing ? 1 : 0) - (this.meleeCameraFocus || 0)) * Math.min(1, dt * 12);
    if (focusing) {
      this.meleeFocusYaw = melee.focusYaw; this.meleeFocusPitch = melee.focusPitch;
      const turn = Math.atan2(Math.sin(melee.focusYaw-this.yaw),Math.cos(melee.focusYaw-this.yaw));
      this.yaw += turn * Math.min(1, dt * 12); cam.rotation.y = this.yaw;
    }
    cam.rotation.x += ((this.meleeFocusPitch || 0) - cam.rotation.x) * this.meleeCameraFocus;

    // 受压制时画面轻微抖动 —— 不是特效，是"被按在地上抬不起头"的触感
    const shake = this.suppression * SUPPRESSION.shakeScale;
    cam.rotation.z = -this.lean * CAMERA.leanRollRad
      + (shake > 0 ? Math.sin(this.stepDistance * 41 + this.suppression * 90) * shake : 0)
      + (focusing ? Math.sin(melee.t * 39) * (1 - melee.progress) * .013 : 0);

    // 通用震屏（Script_CameraShake）：叠在最后，不改 yaw/pitch 本体 —— 枪口不会被震歪，
    // 玩家松手后画面自己回来。
    const sh = this.shake;
    cam.position.y += sh.rise;
    cam.rotation.x += sh.pitch;
    cam.rotation.y += sh.yaw;
    cam.rotation.z += sh.roll;
  }

  /**
   * 第一人称倒地：视点留在刚才那个人身上，而不是切黑或升到尸体上方。
   * 1.05 秒内眼位贴到地面、身体向一侧倒下，末段只留很轻的落地回弹。
   * 战场是否压暗属于 HUD；这里仅负责真实机位，方便画面与自动化分别验收。
   */
  SyncDeathCamera() {
    const cam = this.camera;
    const t = Clamp01(this.deadTime / 1.05);
    const fall = t * t * (3 - 2 * t);
    const side = this.deathFallSide;
    const yaw = this.deathStartYaw;
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const lateral = side * 0.18 * fall;
    const forward = 0.08 * fall;
    // 撞地后的一点点回弹；归零时严格落在目标眼位，不留下持续抖动。
    const impactT = Clamp01((t - 0.72) / 0.28);
    const impact = Math.sin(impactT * Math.PI * 2) * (1 - impactT) * 0.025;
    const targetY = this.position.y + 0.22;

    cam.position.set(
      this.deathCameraStart.x
        + (this.position.x + rightX * lateral + forwardX * forward - this.deathCameraStart.x) * fall,
      Math.max(this.position.y + 0.16,
        this.deathCameraStart.y + (targetY - this.deathCameraStart.y) * fall + impact),
      this.deathCameraStart.z
        + (this.position.z + rightZ * lateral + forwardZ * forward - this.deathCameraStart.z) * fall);
    cam.rotation.order = "YXZ";
    cam.rotation.y = this.deathStartYaw + side * 0.10 * fall;
    cam.rotation.x = this.deathStartPitch
      + (Clamp(this.deathStartPitch - 0.18, -1.1, 0.45) - this.deathStartPitch) * fall;
    cam.rotation.z = this.deathStartRoll
      + (side * 1.22 - this.deathStartRoll) * fall;
  }

  /** Bounded injury envelope shared by rendering and audio; never derived from low HP. */
  get HitDisorientation() {
    if (!this.alive || this.debug.invincible) return 0;
    const remaining = Clamp01(this.hitDisorientationTime
      / (HIT_DISORIENTATION.durationS - HIT_DISORIENTATION.holdS));
    return this.hitDisorientationStrength * remaining * remaining * (3 - 2 * remaining);
  }

  /**
   * 被弹片/子弹擦过或命中。part: head/torso/arm/leg
   *
   * 部位倍率与单发上限一律读 COMBAT.player —— **不再在这里写死**。
   * 原来的 head ×3.4 配上 AI 那边 ×0.55 的枪伤，等于三八式爆头 134 点：
   * 满血一枪毙，而爆头有 8% 概率，也就是每次交火都可能在第一发结束。
   * 现在爆头仍然是最重的一发（还会当场把视线打飞），但打不死一个满血的人。
   *
   * @param {object} [info] { from: THREE.Vector3 来弹位置, bullet, projectile (feedback only; no bullet damage cap), melee, blast }
   */
  TakeHit(damage, part = "torso", direction = null, info = null) {
    if (!this.alive) return;
    if (!Number.isFinite(damage) || damage <= 0) return;
    if (this.debug.invincible) return;
    // 出生保护期内只吃压制不吃伤 —— 让接替者有几秒找到掩体，
    // 而不是睁眼就躺回去。子弹照样从耳边过，压制照样上。
    if (this.spawnGrace > 0) {
      this.suppression = Clamp01(this.suppression + SUPPRESSION.onGraceHit);
      if (info?.bullet) this.RecordIncomingFire(info.from, "near");
      return;
    }
    const P = COMBAT.player || {};
    const mult = part === "head" ? (P.headMultiplier ?? 2.0)
      : part === "torso" ? (P.torsoMultiplier ?? 1.0)
        : (P.limbMultiplier ?? 0.5);
    // 难度档的「玩家受伤倍率」（体验 0.80 / 标准 1.00 / 写实 1.25）。
    // 这三个数在 DIFFICULTY_PRESETS 里立了很久，**一处都没被读过** ——
    // 换档只改得动弹道重力、自由瞄准、铁瞄偏心和过热四件事，挨打的强度纹丝不动。
    let applied = damage * mult * (DIFFICULTY.playerDamage ?? 1);
    // 单发硬上限只管小口径。炮弹与集束照样能一下要命 —— 那是它们应得的，
    // 而且它们有啸声、有落点标记、有一秒半的预警，玩家是"没躲开"，不是"没看见"。
    if (info && info.bullet) applied = Math.min(applied, P.maxBulletDamage ?? 62);
    if (info?.bullet || info?.projectile) {
      this.hitDisorientationStrength = Math.max(this.HitDisorientation,
        Clamp(HIT_DISORIENTATION.minStrength + applied / HIT_DISORIENTATION.damageDiv,
          0, 1));
      this.hitDisorientationTime = HIT_DISORIENTATION.durationS;
    }
    this.health -= applied;
    const bleed = (part === "head" ? WOUNDS.bleedHead
      : part === "torso" ? WOUNDS.bleedTorso : WOUNDS.bleedLimb) * (P.bleedScale ?? 0.6);
    this.wounds.push({ part, bleed, since: 0 });
    this.bleeding += bleed;
    this.suppression = Clamp01(this.suppression + SUPPRESSION.onHit);

    // --- 让"我中弹了"这件事看得见、听得见 -----------------------------------
    // 红闪按这一发的实际伤害定强度，与剩余血量无关：擦一下腿是一闪，
    // 挨一发胸口是满屏。这是玩家判断"要不要现在退"的唯一即时信号。
    this.hitFlash = Clamp01(Math.max(this.hitFlash,
      HIT_FEEDBACK.flashBase + applied / HIT_FEEDBACK.flashDamageDiv));
    const from = info && info.from ? info.from : null;
    this.RecordIncomingFire(from, "hit");
    this.PushHitEvent({
      kind: "hurt", part, damage: applied,
      severity: Clamp01(applied / HIT_FEEDBACK.severityDiv), blast: !!info?.blast,
    });
    // 中弹的一歪：往来弹那一侧滚（右手 = (cos yaw, 0, -sin yaw)）。
    const hitSide = from
      ? Math.sign((from.x - this.position.x) * Math.cos(this.yaw) - (from.z - this.position.z) * Math.sin(this.yaw)) || 1
      : 1;
    this.shake.Hit(Clamp01(applied / HIT_FEEDBACK.severityDiv), hitSide);

    if (direction) {
      this.velocity.addScaledVector(direction, HIT_FEEDBACK.knockbackMps);
      // 中弹把视线打偏 —— 被打中还能稳稳瞄准是最假的一件事
      this.aimYaw += (this.rnd() - 0.5) * HIT_FEEDBACK.aimKickYaw;
      this.aimPitch += (this.rnd() - 0.5) * HIT_FEEDBACK.aimKickPitch + HIT_FEEDBACK.aimKickPitchBias;
    }
    if (this.health <= 0) this.Kill();
  }

  /**
   * 排一条受击事件。**带上限**：过场、编辑器、暂停这些路径不走装配层那一帧的
   * ConsumeHitEvents，没有上限的话队列会一直攒，回到游戏那一帧一口气全播出来。
   */
  PushHitEvent(event) {
    this.hitEvents.push(event);
    if (this.hitEvents.length > HIT_FEEDBACK.eventQueueMax) this.hitEvents.shift();
  }

  /** 取走这一帧攒下的受击事件（装配层拿去播音效）。取完即清。 */
  ConsumeHitEvents() {
    if (this.hitEvents.length === 0) return null;
    const out = this.hitEvents.slice();
    this.hitEvents.length = 0;
    return out;
  }

  /**
   * 开一枪的后坐。参数是**弧度**（调用方从 viewmodel.ConsumeCameraKick 取，
   * 那一份已经按 Data_Weapons 的 recoil 表与开镜量算好了）。
   *
   * 顶上去多少就往 recoilPending 里记多少（recoverFrac = 1.0）——
   * **战地的后坐是回到零的，没有残留**，见 docs/Data_BattlefieldNumbers.md。
   * 参数留着是为了将来真有哪支枪要破例，默认值不许再动。
   */
  ApplyRecoil(pitchRad, yawRad, recoverS = RECOIL.defaultRecoverS, recoverFrac = RECOIL.keepFrac) {
    const keep = Number.isFinite(recoverFrac) ? recoverFrac : RECOIL.keepFrac;
    this.pitch = Clamp(this.pitch + pitchRad, -FREE_AIM.pitchLimitRad, FREE_AIM.pitchLimitRad);
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

  /**
   * 子弹从身边飞过：不掉血，但压得抬不起头。难度档的 suppressionScale 在这里生效。
   * source = "bullet"（默认）时顺手震一下画面 —— 那一声破空本来就该在头上炸开；
   * 爆炸传 "blast"：它的震屏在 Combat.Blast 里按距离与遮挡单独算，不在这儿叠第二遍。
   */
  Suppress(amount, source = "bullet", from = null) {
    const scaled = amount * (DIFFICULTY.suppressionScale ?? 1);
    this.suppression = Clamp01(this.suppression + scaled);
    if (source === "bullet") this.shake.NearMiss(scaled);
    if (source === "bullet" && scaled > 0) this.RecordIncomingFire(from, "near");
  }

  /** Remember a firing bearing, not a tracked enemy. Merge automatic fire by sector. */
  RecordIncomingFire(from, kind = "near") {
    if (!this.alive || !Number.isFinite(from?.x) || !Number.isFinite(from?.z)) return;
    const dx = from.x - this.position.x, dz = from.z - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return;
    const x = dx / len, z = dz / len;
    const life = kind === "hit" ? HIT_FEEDBACK.markLifeS : HIT_FEEDBACK.nearMarkLifeS;
    let mark = this.hitMarks.find(m => m.x * x + m.z * z >= HIT_FEEDBACK.markMergeDot);
    // A subsequent miss must not downgrade or keep an old injury glowing forever.
    if (mark?.kind === "hit" && kind === "near") return;
    if (!mark) {
      if (this.hitMarks.length >= HIT_FEEDBACK.markMax) {
        let replace = -1;
        for (let i = 0; i < this.hitMarks.length; i++) {
          const m = this.hitMarks[i];
          if (kind === "near" && m.kind === "hit") continue;
          if (replace < 0 || (m.kind === "near" && this.hitMarks[replace].kind !== "near")
            || (m.kind === this.hitMarks[replace].kind && m.life < this.hitMarks[replace].life)) replace = i;
        }
        if (replace < 0) return;
        this.hitMarks.splice(replace, 1);
      }
      mark = {};
      this.hitMarks.push(mark);
    }
    Object.assign(mark, { x, z, kind, life, max: life });
  }

  /** 包扎：止血，不回满血。伤口留着，跑不快。 */
  Bandage() {
    if (this.bandages <= 0 || this.bleeding <= 0) return false;
    this.bandages -= 1;
    this.bleeding = 0;
    this.health = Math.min(100, this.health + WOUNDS.bandageHeal);
    for (const w of this.wounds) w.bleed = 0;
    return true;
  }

  Kill() {
    // Direct lethal callers must obey the same debug protection as TakeHit/bleeding.
    if (!this.alive || this.debug.invincible) return;
    this.deathCameraStart.copy(this.camera.position);
    this.deathStartYaw = this.camera.rotation.y;
    this.deathStartPitch = this.camera.rotation.x;
    this.deathStartRoll = this.camera.rotation.z;
    this.deathFallSide = this.rnd() < 0.5 ? -1 : 1;
    this.alive = false;
    this.health = 0;
    this.deadTime = 0;
    this.velocity.set(0, 0, 0);
  }

  /** 当前的瞄准摇摆幅度（度）。给视图模型与散布计算共用。 */
  SwayAmount(weapon) {
    const stanceScale = STANCE[this.stance].sway;
    let sway = SWAY.base * stanceScale * (weapon?.swayScale ?? 1);
    sway *= 1 - this.ads * SWAY.adsDamp;
    sway *= this.ArmPenalty();
    sway *= 1 + this.suppression * SWAY.suppressionGain;
    sway *= 1 + (1 - this.stamina) * SWAY.staminaGain;
    if (this.breathHold) sway *= SWAY.breathHold;
    if (this.bipod) sway *= SWAY.bipod;            // 架上去之后枪自己稳住了
    return sway;
  }

  /**
   * 当前散布（度）。**准心画的就是它**（Script_Hud.CrosshairGeometry），
   * 所以这里每改一个系数，屏幕上那个圈就跟着变 —— 两者不许再分家。
   *
   * 【2026-08-25 调走动那一项】原来是 ×2.8（`1 + min(1,v/3)×1.8`），
   * 而站姿速度就是 3.05 m/s，等于**一迈步就直接吃满**：汉阳造 3.0° → 8.4°，
   * 25 m 上落点散在 ±1.8 m，画到 900p 上是 63 px 的一个大框。
   * 用户实跑的判断是"跑动的时候准心还是大了点"，这条成立：战地/COD 的腰射
   * 跑动惩罚大约是 +50%~90%，不是 +180%。现在收到 ×1.85（汉阳造 5.6° / 42 px），
   * 跑起来仍然明显打不准，但不再是"整个屏幕都是准心"。
   * **这一改同时改的是真实落点**，不是只把 HUD 画小 —— 准心不许再骗人。
   */
  SpreadDeg(weapon) {
    if (!weapon) return SPREAD.noWeaponDeg;
    const base = this.ads > SPREAD.adsThreshold
      ? (weapon.spreadAdsDeg ?? SPREAD.adsFallbackDeg)
      : (weapon.spreadHipDeg ?? SPREAD.hipFallbackDeg);
    let s = base * STANCE[this.stance].spread;
    s *= 1 + this.suppression * SPREAD.suppressionGain;
    s *= this.ArmPenalty() * SPREAD.armMix + SPREAD.armBias;
    s *= 1 + Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / SPREAD.moveRefMps) * SPREAD.moveGain;
    if (!this.grounded) s *= SPREAD.airborne;        // 半空开火可以，但绝不是稳定射击姿态
    if (this.breathHold) s *= SPREAD.breathHold;
    if (this.bipod) s *= SPREAD.bipod;
    return s;
  }
}
