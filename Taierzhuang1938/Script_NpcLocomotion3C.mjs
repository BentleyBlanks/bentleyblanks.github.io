// NPC 第三人称 3C 动作核心数学层（纯数学、零 three 依赖，Node 可直接单测）。
//
// 统一服务于 XBotSkin（白盒 / EncounterPlay 敌我角色）与 LugouCharacterRig（正片战役角色），
// 实现 3A 射击游戏（UE5 Lyra / COD）动作系统的四大核心机制：
//   1. 2D 混合空间（2D Blend Space）：按世界速度相对朝向的分解，计算前后左右四向混合权重与走/跑回差；
//   2. 朝向扭曲（Orientation Warping）：斜向移动时将骨盆顺向扭转到行进方向，同时让上身反向补偿保持枪口稳定；
//   3. 原地转身（Turn-in-Place）：站立/蹲姿时把下盘朝向与逻辑朝向解耦，死区内脚钉死、超死区触发真实迈步转身片段；
//   4. 脊柱瞄准偏移（Mesh-Space Spine Aim Offset）与开火叠加（Additive Recoil）：按人体脊柱解剖学比例
//      把偏航/俯仰平滑分摊到 Spine→Spine1→Spine2→Neck→Head，并叠加上半身开火差值而不打断双腿步态。
//
// 坐标约定（与全仓一致）：世界 +Y 朝上，正面 forward(yaw) = (-sin yaw, 0, -cos yaw)，+yaw 往左转。

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export function WrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function Clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function Smooth01(t) { t = Clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export const NPC_3C = Object.freeze({
  moveThresholdMps: 0.12,
  runEnterMps: 1.65,
  runExitMps: 1.35,
  maxPelvisWarpDeg: 45,
  maxNoStrafeWarpDeg: 48,
  cardinalHysteresisDeg: 7,
  turnDeadzoneStandDeg: 44,
  turnDeadzoneCrouchDeg: 48,
  turnMaxLagDeg: 82,
  turnReturnRate: 10,
  turnMinDurationS: 0.58,
  turnMaxDurationS: 0.84,
  fireDurationS: 0.28,
  fireKickPitchDeg: 4.8,
  fireKickRollDeg: 1.4,
});

/**
 * 原地转身（Turn-in-Place）上半身分层遮罩骨骼清单（Spine1 以下由 Mesh-Space 衔接，Spine2 以上锁定在据枪待机姿态）：
 * 保证据枪转身时枪口全程抵肩锁靶、绝不垂枪到腰间再重新抬起，同时让 Hips + 双腿自然迈步、Spine 柔顺吸收 22% 重心切换。
 */
export const XBOT_UPPER_BODY_TURN_MASK_BONES = Object.freeze([
  "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3",
  "LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3",
  "LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3",
  "LeftHandRing1", "LeftHandRing2", "LeftHandRing3",
  "LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3",
  "RightHandRing1", "RightHandRing2", "RightHandRing3",
  "RightHandPinky1", "RightHandPinky2", "RightHandPinky3",
]);

const CARDINAL_ANGLES = Object.freeze({
  forward: 0,
  right: Math.PI / 2,
  backward: Math.PI,
  left: -Math.PI / 2,
});

/**
 * 1) UE5 Lyra 四向主干 + 2) 精准朝向扭曲（Cardinal Orientation Warping，纯函数）。
 *
 * 为什么用「四向主干 100% 满步幅 + 精准朝向扭曲」替代「正交 50/50 混合再叠加扭曲」：
 *   · 50/50 混合前跑与右跑会让垂直步幅向量缩短为 0.707 倍（丢 29% 步长），若再叠加扭胯还会双倍偏转；
 *   · 四向主干模式在 ±45° 扇区内播放 100% 满步幅主片段，并由骨盆精准吸收全部残余角度（-residual），
 *     保证「脚步蹬地方向 === 真实地面位移方向（0° 偏差）」且「步幅 100% 不缩水」，
 *     同时用 ±7° 扇区回差防止斜向边界反复抖动，扇区切换平滑度由下游权重阻尼接住。
 */
export function ComputeLocomotion2D({
  vx = 0, vz = 0, yaw = 0, stance = "stand", aimWeight = 0,
  rifleInHands = true, speedMps = null, running = false, hasStrafe = null, prevPrimary = null,
} = {}) {
  const spd = Number.isFinite(speedMps) ? speedMps : Math.hypot(vx, vz);
  const moving = spd > NPC_3C.moveThresholdMps;
  const nextRunning = stance === "stand"
    ? (running ? spd > NPC_3C.runExitMps : spd > NPC_3C.runEnterMps)
    : false;
  const strafeCapable = hasStrafe !== null
    ? !!hasStrafe
    : (rifleInHands && stance !== "prone" && (stance === "crouch" || aimWeight >= 0.35));

  if (!moving) {
    return {
      moving: false, running: false, speedMps: spd,
      localFwd: 0, localRight: 0, moveAngle: 0,
      weights: { forward: 1, backward: 0, left: 0, right: 0 },
      primary: "forward", secondary: null, wPrimary: 1, wSecondary: 0,
      pelvisWarpRad: 0,
    };
  }

  // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const localFwd = -sy * vx - cy * vz;
  const localRight = cy * vx - sy * vz;
  const vLen = Math.hypot(localFwd, localRight);
  const moveAngle = vLen > 1e-4 ? Math.atan2(localRight, localFwd) : 0; // 0=前, +π/2=右, -π/2=左, ±π=后

  let primary = "forward";
  if (strafeCapable) {
    const hyst = NPC_3C.cardinalHysteresisDeg * DEG;
    const candidates = ["forward", "right", "backward", "left"];
    let bestDir = "forward", bestErr = Infinity;
    for (const dir of candidates) {
      let err = Math.abs(WrapAngle(moveAngle - CARDINAL_ANGLES[dir]));
      if (dir === prevPrimary) err -= hyst;
      if (err < bestErr) { bestErr = err; bestDir = dir; }
    }
    primary = bestDir;
  } else {
    const cosA = Math.cos(moveAngle);
    primary = prevPrimary === "backward" ? (cosA > 0.15 ? "forward" : "backward") : (cosA >= -0.15 ? "forward" : "backward");
  }

  // Orientation Warping：把骨盆精准扭向真实行进方向（+yaw 为左转，+residual 为向右，故取负号）
  let pelvisWarpRad = 0;
  const speedRamp = Smooth01((spd - NPC_3C.moveThresholdMps) / 0.35);
  const cardinalAngle = CARDINAL_ANGLES[primary];
  const residual = WrapAngle(moveAngle - cardinalAngle);
  if (stance !== "prone" && vLen > 1e-4) {
    const maxWarp = (strafeCapable ? NPC_3C.maxPelvisWarpDeg : NPC_3C.maxNoStrafeWarpDeg) * DEG;
    pelvisWarpRad = Clamp(-residual, -maxWarp, maxWarp) * speedRamp;
  }

  // 若骨盆扭曲已完全吃掉残角（±45° 内且全速），主干 100% 满步幅播放，彻底杜绝双倍偏转与步幅缩水；
  // 仅当起步未满速或超 ±45° 存在未吸收残角时，才把剩余残角少量混给相邻主干方向。
  let secondary = null, wPrimary = 1, wSecondary = 0;
  const unwarpedResidual = WrapAngle(moveAngle + pelvisWarpRad - cardinalAngle);
  if (strafeCapable && Math.abs(unwarpedResidual) > 2 * DEG) {
    const order = ["forward", "right", "backward", "left"];
    const idx = order.indexOf(primary);
    const adjIdx = (idx + (unwarpedResidual > 0 ? 1 : 3)) % 4;
    const blendFrac = Clamp(Math.abs(unwarpedResidual) / (Math.PI / 2), 0, 0.5);
    if (blendFrac > 0.03) {
      secondary = order[adjIdx];
      wSecondary = blendFrac;
      wPrimary = 1 - blendFrac;
    }
  }

  const weights = { forward: 0, backward: 0, left: 0, right: 0 };
  weights[primary] = wPrimary;
  if (secondary) weights[secondary] = wSecondary;

  return {
    moving: true, running: nextRunning, speedMps: spd,
    localFwd, localRight, moveAngle,
    weights, primary, secondary, wPrimary, wSecondary,
    pelvisWarpRad,
  };
}

/**
 * 2b) 实时支撑脚锁地控制器（Foot Locking State Machine，纯数学、零 three 依赖）。
 *
 * 在动画播放、Aim Offset 之后驱动左右腿 2-Bone IK：
 *   · 支撑期（脚踝贴近站立高度且未抬升）锁住着地点的世界 (x, z)；
 *   · 在跑步机预览模式下随地面滚动 (driftX = -vx*dt, driftZ = -vz*dt)，在真实世界模式下 drift = 0；
 *   · 抬脚或超安全腿长时平滑释放回原始动捕弧线，彻底消除肉眼可见的脚底搓地与平移感。
 */
export class FootLockController {
  constructor() {
    this.feet = [0, 1].map(() => ({
      locked: false,
      weight: 0,
      lockX: 0,
      lockZ: 0,
      floorOffY: null,
      prevAnimY: null,
      slipAccumM: 0,
      maxSlipM: 0,
    }));
  }

  Reset() {
    for (const f of this.feet) {
      f.locked = false;
      f.weight = 0;
      f.lockX = 0;
      f.lockZ = 0;
      f.floorOffY = null;
      f.prevAnimY = null;
      f.slipAccumM = 0;
      f.maxSlipM = 0;
    }
  }

  /**
   * 更新单只脚的锁地目标。
   * 支持不同角色靴底高度自适应（通过 floorOffY 追踪实际最低触地踝高），
   * 触地瞬间从当前求解位置连续上锁（零跳变 + 零弹性回滑），抬脚摆腿时平滑交还动画。
   */
  UpdateFoot(index, {
    animX, animY, animZ,
    hipX, hipY, hipZ,
    ankleRestY,
    groundY = 0,
    maxReachM,
    dt,
    moving = true,
    driftX = 0,
    driftZ = 0,
    teleported = false,
  }) {
    const f = this.feet[index];
    const restOff = ankleRestY - groundY;
    if (teleported || !moving || !(dt > 0)) {
      f.locked = false;
      if (teleported) {
        f.weight = 0;
        f.floorOffY = null;
      } else if (f.weight > 0) {
        f.lockX += driftX;
        f.lockZ += driftZ;
        f.weight *= Math.exp(-Math.max(dt, 0) / 0.06);
        if (f.weight < 1e-3) f.weight = 0;
      }
      f.prevAnimY = animY;
      const targetX = animX + (f.lockX - animX) * f.weight;
      const targetZ = animZ + (f.lockZ - animZ) * f.weight;
      return {
        active: f.weight > 1e-3,
        weight: f.weight,
        targetX,
        targetY: animY,
        targetZ,
        lockX: f.lockX,
        lockZ: f.lockZ,
        locked: false,
        rawAnimSlipCm: 0,
        solvedSlipCm: 0,
      };
    }

    const footLocalY = animY - groundY;
    if (f.floorOffY === null) f.floorOffY = restOff;
    if (footLocalY < f.floorOffY) {
      const k = 1 - Math.exp(-dt / 0.04);
      f.floorOffY = Math.max(restOff - 0.045, f.floorOffY + (footLocalY - f.floorOffY) * k);
    } else if (!f.locked && footLocalY > f.floorOffY + 0.012) {
      f.floorOffY = Math.min(restOff + 0.045, f.floorOffY + 0.025 * dt);
    }
    const floorY = groundY + f.floorOffY;
    const lift = animY - floorY;
    const vy = f.prevAnimY !== null ? (animY - f.prevAnimY) / Math.max(dt, 1e-4) : 0;
    f.prevAnimY = animY;

    // 无论是锁地期还是松锁淡出期，地钉点都随地面同步漂移（世界模式 drift=0，跑步机模式 drift=-v*dt）
    if (f.locked || f.weight > 1e-3) {
      f.lockX += driftX;
      f.lockZ += driftZ;
    }

    if (f.locked) {
      const distFromAnim = Math.hypot(f.lockX - animX, f.lockZ - animZ);
      const distFromHip = Math.hypot(f.lockX - hipX, floorY - hipY, f.lockZ - hipZ);
      // 抬脚离地超过滞回阈值（兼容蹲走小步幅）、明显上蹬、拉扯超安全帽、或超出 98.5% 腿长时自动松锁进入摆腿期
      if (lift > 0.044 || (lift > 0.022 && vy > 0.28) || distFromAnim > 0.30 || distFromHip > maxReachM * 0.985) {
        f.locked = false;
      }
    } else if (lift < 0.032 && vy < 0.25) {
      // C0 连续瞬时上锁：从当前脚部求解坐标起钉并立刻将 weight 置 1，杜绝落脚跳变与前几帧弹性回滑
      const curX = animX + (f.lockX - animX) * f.weight;
      const curZ = animZ + (f.lockZ - animZ) * f.weight;
      f.locked = true;
      f.lockX = curX;
      f.lockZ = curZ;
      f.weight = 1;
      f.slipAccumM = 0;
    }

    if (!f.locked && f.weight > 0) {
      f.weight *= Math.exp(-dt / 0.070);
      if (f.weight < 1e-3) f.weight = 0;
    }

    // 锁定时脚底沿地钉 (lockX, lockZ) 吸住，高度不陷入地面；释放时平滑回到 animPos
    const targetX = animX + (f.lockX - animX) * f.weight;
    const targetZ = animZ + (f.lockZ - animZ) * f.weight;
    const targetY = f.locked ? Math.max(floorY, animY) : animY;
    const rawSlipM = f.locked ? Math.hypot(animX - f.lockX, animZ - f.lockZ) : 0;
    if (rawSlipM > f.maxSlipM) f.maxSlipM = rawSlipM;

    return {
      active: f.weight > 1e-3,
      weight: f.weight,
      targetX,
      targetY,
      targetZ,
      lockX: f.lockX,
      lockZ: f.lockZ,
      locked: f.locked,
      rawAnimSlipCm: +(rawSlipM * 100).toFixed(1),
      solvedSlipCm: f.locked ? +(Math.hypot(targetX - f.lockX, targetZ - f.lockZ) * 100).toFixed(1) : 0,
    };
  }
}

/**
 * 3) Turn-in-Place 原地转身控制器（每个角色独立持有一份实例）。
 *
 * 站立或蹲姿静止时，逻辑 yaw 变化先被 visualYawOffset 反向吸收（双脚钉死在地不打滑），
 * 同时输出 aimYawCompensation = -visualYawOffset 给脊柱 Aim Offset 让上身和枪口实时指向目标。
 * 当积攒的角度超过死区（站 44° / 蹲 48°）时，触发真实迈步转身片段并按 S 曲线平滑吃掉偏移。
 */
export class TurnInPlaceController {
  constructor() {
    this.ready = false;
    this.prevYaw = 0;
    this.visualYawOffset = 0;
    this.activeTurn = null; // { dir: +1|-1, clipKey, elapsed, duration, startOffset, prevE }
  }

  Reset(yaw = 0) {
    this.ready = true;
    this.prevYaw = yaw;
    this.visualYawOffset = 0;
    this.activeTurn = null;
  }

  Update(dt, {
    yaw = 0, mps = 0, stance = "stand", aimWeight = 0, rifleInHands = true,
    active = true, teleported = false, sampleTurnFrac = null,
  } = {}) {
    if (!active || teleported || stance === "prone" || !Number.isFinite(yaw)) {
      this.Reset(Number.isFinite(yaw) ? yaw : 0);
      return this._Snapshot();
    }
    if (!this.ready) {
      this.Reset(yaw);
      return this._Snapshot();
    }
    const stepDt = Math.max(0, Math.min(dt || 0, 0.1));
    const dYaw = WrapAngle(yaw - this.prevYaw);
    this.prevYaw = yaw;

    // 移动中：下盘顺滑追回逻辑朝向，取消原地转身片段
    if (mps > NPC_3C.moveThresholdMps) {
      this.activeTurn = null;
      this.visualYawOffset *= Math.exp(-stepDt * NPC_3C.turnReturnRate);
      if (Math.abs(this.visualYawOffset) < 1e-4) this.visualYawOffset = 0;
      return this._Snapshot();
    }

    // 静止中：逻辑朝向变化先由 visualYawOffset 反向吃掉，脚在世界里保持原地不动
    this.visualYawOffset = WrapAngle(this.visualYawOffset - dYaw);

    // 若正在播原地转身片段：优先按片段真实 TurnYawCurve 进度同步消化 visualYawOffset（缺曲线时退回 Smooth01），
    // 让下盘旋转角速度与真实抬脚落脚节奏严格同拍，消除支撑脚反扭与衔接顿挫
    if (this.activeTurn) {
      const turn = this.activeTurn;
      turn.elapsed += stepDt;
      const u = Clamp(turn.elapsed / turn.duration, 0, 1);
      const sampled = typeof sampleTurnFrac === "function" && turn.clipKey
        ? sampleTurnFrac(turn.clipKey, u)
        : null;
      const e = Number.isFinite(sampled)
        ? Clamp(sampled, turn.prevE, 1)
        : Smooth01(u);
      const remainE = Math.max(1 - turn.prevE, 1e-4);
      const frac = u >= 1 ? 1 : Clamp((e - turn.prevE) / remainE, 0, 1);
      turn.prevE = e;
      this.visualYawOffset = WrapAngle(this.visualYawOffset * (1 - frac));
      if (u >= 1) this.activeTurn = null;
    }

    // 超过生理上限（±82°）时直接拖着下盘跟上，防止脊柱拧断
    const maxLag = NPC_3C.turnMaxLagDeg * DEG;
    if (Math.abs(this.visualYawOffset) > maxLag) {
      this.visualYawOffset = Math.sign(this.visualYawOffset) * maxLag;
    }

    // 超过死区且当前无转身片段：触发一次迈步转身
    const deadzone = (stance === "crouch" ? NPC_3C.turnDeadzoneCrouchDeg : NPC_3C.turnDeadzoneStandDeg) * DEG;
    if (!this.activeTurn && Math.abs(this.visualYawOffset) >= deadzone) {
      const dir = this.visualYawOffset < 0 ? 1 : -1; // visualYawOffset < 0 表示逻辑往左转了，需要左转身片段
      const absDeg = Math.abs(this.visualYawOffset) / DEG;
      let clipKey = null;
      if (rifleInHands) {
        if (stance === "crouch") {
          clipKey = dir > 0 ? "crouchLeft90" : null; // 蹲姿右转走平滑下盘追随，蹲姿左转用 RifleCrouchTurn_V2
        } else if (aimWeight >= 0.35 || absDeg >= 65) {
          clipKey = dir > 0 ? "standAimLeft90" : "standAimRight90";
        } else {
          clipKey = dir > 0 ? "standHipLeft45" : "standHipRight45";
        }
      }
      const duration = Clamp(
        NPC_3C.turnMinDurationS + ((absDeg - 40) / 50) * (NPC_3C.turnMaxDurationS - NPC_3C.turnMinDurationS),
        NPC_3C.turnMinDurationS,
        NPC_3C.turnMaxDurationS,
      );
      this.activeTurn = {
        dir, clipKey, elapsed: 0, duration,
        startOffset: this.visualYawOffset, prevE: 0,
      };
    }

    return this._Snapshot();
  }

  _Snapshot() {
    const t = this.activeTurn;
    return {
      visualYawOffset: this.visualYawOffset,
      aimYawCompensation: -this.visualYawOffset,
      turning: !!t,
      turnDir: t ? t.dir : 0,
      turnClipKey: t ? t.clipKey : null,
      turnProgress: t ? Clamp(t.elapsed / t.duration, 0, 1) : 0,
    };
  }
}

/**
 * 4) Mesh-Space 脊柱瞄准偏移（4~5 节解剖学权重分摊 + 9 向姿态微调）。
 *
 * 为什么区分 rigKind（"xbot" vs "biped"）：
 *   · Mixamo/XBot 骨架里左右肩挂在 Spine2 下，因此 Spine + Spine1 + Spine2 承担绝大部分 Yaw/Pitch，
 *     让双肩、双臂、步枪与头部一起自然转过去；Neck/Head 补齐最后一点贴腮微调。
 *   · 3ds Max Biped（LugouCharacterRig）里锁骨挂在 Neck 下，因此 Neck 也带着肩臂和步枪转，
 *     Spine/Spine1/Chest/Neck 共同分摊后，再交给 _ApplyRiggedAim 吸收剩余几度残差把枪口锁死到目标射线。
 */
export function EvaluateSpineAimDistribution({
  yawRad = 0, pitchRad = 0, stance = "stand", aimWeight = 1, rigKind = "xbot",
} = {}) {
  const w = Clamp(aimWeight, 0, 1);
  if (w < 1e-4) {
    return {
      spine: { yaw: 0, pitch: 0, roll: 0 },
      spine1: { yaw: 0, pitch: 0, roll: 0 },
      spine2: { yaw: 0, pitch: 0, roll: 0 },
      neck: { yaw: 0, pitch: 0, roll: 0 },
      head: { yaw: 0, pitch: 0, roll: 0 },
    };
  }

  // 按姿态限制脊柱安全转动幅度，避免蹲姿前俯折进膝盖、卧姿拧断腰椎
  const yawLim = stance === "prone" ? 18 * DEG : stance === "crouch" ? 68 * DEG : 78 * DEG;
  const pitchMin = stance === "prone" ? 0 : stance === "crouch" ? -12 * DEG : -38 * DEG;
  const pitchMax = stance === "prone" ? 14 * DEG : stance === "crouch" ? 34 * DEG : 48 * DEG;

  const y = Clamp(yawRad, -yawLim, yawLim) * w;
  const p = Clamp(pitchRad, pitchMin, pitchMax) * w;

  // 轻微的 9 向贴腮肩窝倾角（侧向摆枪时胸腔自然微倾，比纯刚体绕 Y 轴更像真人）
  const shoulderRoll = stance === "prone" ? 0 : Clamp(-y * 0.08, -6 * DEG, 6 * DEG);

  if (stance === "prone") {
    return {
      spine: { yaw: 0, pitch: 0, roll: 0 },
      spine1: { yaw: 0, pitch: 0, roll: 0 },
      spine2: { yaw: y * 0.35, pitch: p * 0.25, roll: 0 },
      neck: { yaw: y * 0.35, pitch: p * 0.40, roll: 0 },
      head: { yaw: y * 0.30, pitch: p * 0.35, roll: 0 },
    };
  }

  if (rigKind === "biped") {
    // Biped：Spine → Spine1 → Chest(Spine2) → Neck(带锁骨与双臂) → Head
    // 蹲姿压低腰椎前俯权重，绝不把上身折进蹲腿
    const crouchPitchScale = stance === "crouch" && p < 0 ? 0.35 : 1;
    const pSpine = p * crouchPitchScale;
    return {
      spine: { yaw: y * 0.14, pitch: pSpine * 0.08, roll: 0 },
      spine1: { yaw: y * 0.24, pitch: pSpine * 0.16, roll: 0 },
      spine2: { yaw: y * 0.34, pitch: pSpine * 0.30, roll: shoulderRoll },
      neck: { yaw: y * 0.16, pitch: p * 0.14, roll: 0 },
      head: { yaw: y * 0.12, pitch: p * 0.12, roll: 0 },
    };
  }

  // Mixamo / XBot：双肩挂在 Spine2 下
  // 据枪（aimWeight 高）时 Spine+Spine1+Spine2 承担 94% Yaw，确保枪口直接对准目标、头贴腮随动；
  // 非据枪自然观望时头颈先转（head lead）。
  const aimFocus = Smooth01((w - 0.2) / 0.6);
  const wSpineY = 0.12 + 0.06 * aimFocus;    // 0.12 → 0.18
  const wSpine1Y = 0.20 + 0.12 * aimFocus;   // 0.20 → 0.32
  const wSpine2Y = 0.28 + 0.16 * aimFocus;   // 0.28 → 0.44  (三节和 0.60 → 0.94)
  const wNeckY = 0.22 - 0.18 * aimFocus;     // 0.22 → 0.04
  const wHeadY = 0.18 - 0.16 * aimFocus;     // 0.18 → 0.02

  const crouchDown = stance === "crouch" && p < 0 ? 0.3 : 1;
  return {
    spine: { yaw: y * wSpineY, pitch: p * 0.12 * crouchDown, roll: 0 },
    spine1: { yaw: y * wSpine1Y, pitch: p * 0.26 * crouchDown, roll: 0 },
    spine2: { yaw: y * wSpine2Y, pitch: p * 0.48 * crouchDown, roll: shoulderRoll },
    neck: { yaw: y * wNeckY, pitch: p * 0.09, roll: 0 },
    head: { yaw: y * wHeadY, pitch: p * 0.05, roll: 0 },
  };
}

/**
 * 4b) 9 帧 3×3 Aim Offset 网格的双线性采样权重计算：
 * 将 (yawRad, pitchRad) 映射到 3×3 网格中包围当前方向的 4 个角帧索引与插值因子 (u, v)。
 * 约定：+yaw = 向左，-yaw = 向右；+pitch = 向上，-pitch = 向下；
 * 行 0..2 为 [Up, Mid, Down]，列 0..2 为 [Left, Center, Right]，帧 4 为 (0, 0) 基准帧。
 */
export function EvaluateAimOffsetGridWeights({
  yawRad = 0,
  pitchRad = 0,
  stance = "stand",
  yawColsDeg = [75, 0, -75],
  pitchRowsDeg = [50, 0, -45],
} = {}) {
  const maxYawL = yawColsDeg[0];   // +75
  const midYaw = yawColsDeg[1];    // 0
  const maxYawR = yawColsDeg[2];   // -75
  const maxPitchU = pitchRowsDeg[0]; // +50
  const midPitch = pitchRowsDeg[1];  // 0
  const minPitchD = pitchRowsDeg[2]; // -45

  // 蹲姿收缩向下俯角和极限偏航，防止上身折进膝盖
  const yawLimit = stance === "crouch" ? 68 : Math.max(Math.abs(maxYawL), Math.abs(maxYawR));
  const pitchMinLim = stance === "crouch" ? Math.max(minPitchD, -18) : minPitchD;
  const pitchMaxLim = stance === "crouch" ? Math.min(maxPitchU, 38) : maxPitchU;

  const yawDeg = Clamp(yawRad / DEG, Math.max(maxYawR, -yawLimit), Math.min(maxYawL, yawLimit));
  const pitchDeg = Clamp(pitchRad / DEG, pitchMinLim, pitchMaxLim);

  let c0 = 1, c1 = 1, u = 0;
  if (yawDeg >= midYaw) {
    c0 = 0; c1 = 1;
    const span = maxYawL - midYaw;
    u = span > 1e-4 ? Clamp((maxYawL - yawDeg) / span, 0, 1) : 1;
  } else {
    c0 = 1; c1 = 2;
    const span = midYaw - maxYawR;
    u = span > 1e-4 ? Clamp((midYaw - yawDeg) / span, 0, 1) : 0;
  }

  let r0 = 1, r1 = 1, v = 0;
  if (pitchDeg >= midPitch) {
    r0 = 0; r1 = 1;
    const span = maxPitchU - midPitch;
    v = span > 1e-4 ? Clamp((maxPitchU - pitchDeg) / span, 0, 1) : 1;
  } else {
    r0 = 1; r1 = 2;
    const span = midPitch - minPitchD;
    v = span > 1e-4 ? Clamp((midPitch - pitchDeg) / span, 0, 1) : 0;
  }

  return {
    f00: r0 * 3 + c0,
    f01: r0 * 3 + c1,
    f10: r1 * 3 + c0,
    f11: r1 * 3 + c1,
    u,
    v,
    yawDeg,
    pitchDeg,
  };
}

/**
 * 5) 开火 Additive 后坐包络：返回叠加动画进度（0..1）与上身阻尼后坐俯仰/滚转角。
 * 彻底替代旧版「开火 0.35 秒强切站立开火动作导致跑步腿冻住滑步」的做法。
 */
export function EvaluateAdditiveFireRecoil(ageS, durationS = NPC_3C.fireDurationS) {
  if (!(ageS >= 0) || ageS >= durationS) {
    return { active: false, u: 1, weight: 0, kickPitchRad: 0, kickRollRad: 0 };
  }
  const u = Clamp(ageS / durationS, 0, 1);
  // 极快起跳（前 14% 达峰），后段指数阻尼回肩
  const env = u < 0.14 ? Smooth01(u / 0.14) : Math.pow(1 - (u - 0.14) / 0.86, 2.2);
  return {
    active: true,
    u,
    weight: env,
    kickPitchRad: NPC_3C.fireKickPitchDeg * DEG * env,
    kickRollRad: NPC_3C.fireKickRollDeg * DEG * env,
  };
}
