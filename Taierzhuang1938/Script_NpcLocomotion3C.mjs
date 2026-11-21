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
  runEnterMps: 2.35,
  runExitMps: 1.95,
  maxPelvisWarpDeg: 36,
  maxNoStrafeWarpDeg: 42,
  turnDeadzoneStandDeg: 44,
  turnDeadzoneCrouchDeg: 48,
  turnMaxLagDeg: 82,
  turnReturnRate: 10,
  turnMinDurationS: 0.48,
  turnMaxDurationS: 0.78,
  fireDurationS: 0.28,
  fireKickPitchDeg: 4.8,
  fireKickRollDeg: 1.4,
});

/**
 * 1) 2D Blend Space + 2) Orientation Warping（纯函数）。
 *
 * @param {object} input
 *   vx, vz        世界水平速度（m/s）
 *   yaw           角色当前朝向（弧度，forward = (-sin yaw, -cos yaw)）
 *   stance        "stand" | "crouch" | "prone"
 *   aimWeight     据枪权重（0..1）
 *   rifleInHands  是否手里端枪
 *   speedMps      标量速度（可省略，默认 hypot(vx, vz)）
 *   running       上一帧是否处于跑步态（用于走/跑速度回差）
 *   hasStrafe     当前姿态是否有专属左右横移动作（站/蹲端枪有，空手/卧倒无）
 */
export function ComputeLocomotion2D({
  vx = 0, vz = 0, yaw = 0, stance = "stand", aimWeight = 0,
  rifleInHands = true, speedMps = null, running = false, hasStrafe = null,
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

  // 象限平滑双余弦权重（保证四向权重恒非负、和严格为 1，且 45° 处各占 0.5）
  let wF = 0, wB = 0, wL = 0, wR = 0;
  if (strafeCapable) {
    if (moveAngle >= 0 && moveAngle <= Math.PI / 2) {
      const c = Math.cos(moveAngle), s = Math.sin(moveAngle);
      wF = c * c; wR = s * s;
    } else if (moveAngle > Math.PI / 2) {
      const a = moveAngle - Math.PI / 2;
      const c = Math.cos(a), s = Math.sin(a);
      wR = c * c; wB = s * s;
    } else if (moveAngle < 0 && moveAngle >= -Math.PI / 2) {
      const a = -moveAngle;
      const c = Math.cos(a), s = Math.sin(a);
      wF = c * c; wL = s * s;
    } else {
      const a = -moveAngle - Math.PI / 2;
      const c = Math.cos(a), s = Math.sin(a);
      wL = c * c; wB = s * s;
    }
  } else {
    // 无专属左右横移动作（如低姿奔跑/空手）：仅按前后半球切前/后，侧向分量完全交给 Orientation Warping
    const cosA = Math.cos(moveAngle);
    if (cosA >= -0.15) { wF = 1; } else { wB = 1; }
  }

  const entries = [
    ["forward", wF], ["right", wR], ["backward", wB], ["left", wL],
  ].sort((a, b) => b[1] - a[1]);

  const primary = entries[0][0];
  let secondary = entries[1][1] > 0.03 ? entries[1][0] : null;
  let wPrimary = entries[0][1];
  let wSecondary = secondary ? entries[1][1] : 0;
  const sum = wPrimary + wSecondary || 1;
  wPrimary /= sum; wSecondary /= sum;

  // Orientation Warping：把骨盆往真实行进方向微扭，消除斜走滑步（+yaw 为左转，+moveAngle 为向右，故取负号）。
  let pelvisWarpRad = 0;
  const speedRamp = Smooth01((spd - NPC_3C.moveThresholdMps) / 0.45);
  if (stance !== "prone" && vLen > 1e-4) {
    if (strafeCapable) {
      // 主片段已覆盖 0° / ±90° / 180°，只把主片段朝向到实际行进角的残差扭 65%（上限 ±36°）
      const cardinalAngle = primary === "forward" ? 0
        : primary === "right" ? Math.PI / 2
          : primary === "left" ? -Math.PI / 2 : Math.PI;
      const residual = WrapAngle(moveAngle - cardinalAngle);
      pelvisWarpRad = Clamp(-residual * 0.65, -NPC_3C.maxPelvisWarpDeg * DEG, NPC_3C.maxPelvisWarpDeg * DEG) * speedRamp;
    } else {
      // 无左右片段时：往前走对准 moveAngle，往后走对准 (moveAngle - π)
      const refAngle = wB > 0.5 ? WrapAngle(moveAngle - Math.PI) : moveAngle;
      pelvisWarpRad = Clamp(-refAngle, -NPC_3C.maxNoStrafeWarpDeg * DEG, NPC_3C.maxNoStrafeWarpDeg * DEG) * speedRamp;
    }
  }

  return {
    moving: true, running: nextRunning, speedMps: spd,
    localFwd, localRight, moveAngle,
    weights: { forward: wF, backward: wB, left: wL, right: wR },
    primary, secondary, wPrimary, wSecondary,
    pelvisWarpRad,
  };
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
    active = true, teleported = false,
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

    // 若正在播原地转身片段：按剩余 S 曲线比例动态消化当前全部 visualYawOffset（转身途中目标继续小幅偏移时，迈步顺势一步到位）
    if (this.activeTurn) {
      const turn = this.activeTurn;
      turn.elapsed += stepDt;
      const u = Clamp(turn.elapsed / turn.duration, 0, 1);
      const e = Smooth01(u);
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
