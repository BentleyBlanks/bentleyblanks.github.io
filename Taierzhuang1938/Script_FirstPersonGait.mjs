// 第一人称自己身体的下半身规划器：胯朝哪、两只脚踩在世界里的哪儿。纯数学、零 three 依赖（node 可测）。
//
// 对标 3A 第一人称全身（UE5 Lyra 那一套）的四件事，数值在 Data_Tuning_FirstPersonBody：
//   1. 原地转身（Turn In Place）：胯的朝向 lowerYaw 与视线分开。站着转视角时胯不动，上身拧过去
//      （twist 交给身体去分到两节脊柱上）；偏差超过死区才转胯，脚跟着一步一步挪。
//   2. 朝向扭曲（Orientation Warping）：斜走、横移时胯往移动方向偏一点，后退时偏向镜像的那一侧。
//   3. 距离匹配（Distance Matching）：步态相位按「每秒步数」推进，步数由实际速度查表，
//      所以一步跨多远永远等于这段时间实际走了多远。
//   4. 脚锁地（Foot Locking）：着地的脚记下世界坐标，整个着地期一动不动；摆动的脚从抬脚处
//      弧线落到预测的落点（落地那一刻胯会在哪儿 + 往前留半个着地距离）。腿由身体用 IK 接上。
//
// 坐标：世界 y 朝上；游戏偏航口径 forward(yaw) = (-sin yaw, 0, -cos yaw)，+yaw 往左转。
// 模型系：+z 朝前、+x 朝左（与 FirstPersonBody 根节点 rotation.y = yaw + π 一致）。

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export function WrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

function Clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function Smooth01(t) { t = Clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function Frac(v) { return v - Math.floor(v); }

/** 折线表插值：table = [[x, y], ...]，x 升序；两端外夹。 */
export function Interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/** 模型系偏移（mx 左、mz 前）→ 世界系水平偏移，胯朝 yaw。 */
export function ModelToWorld(mx, mz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [-mx * c - mz * s, mx * s - mz * c];
}

export class FirstPersonGait {
  /**
   * @param {object} tuning FIRST_PERSON_BODY
   * @param {object} rig { feet: [{x, z}, {x, z}]（左、右脚在模型系里的站位，米）}
   */
  constructor(tuning, rig) {
    this.t = tuning;
    this.homes = rig.feet.map((f) => ({ x: f.x, z: f.z }));
    this.feet = [0, 1].map(() => ({
      x: 0, y: 0, z: 0, yaw: 0, planted: true, lift: 0,
      swing: null, // { u, fromX, fromY, fromZ, fromYaw, settle, rate, lift }
      plantedS: 0,
    }));
    this.ready = false;
    this.lowerYaw = 0;
    this.twist = 0;
    this.phase = 0;
    this.moving = false;
    this.turning = false;
    this.airborne = false;
    this.airS = 0;
    this.vx = 0; this.vz = 0; this.speed = 0;
    this.lastX = 0; this.lastY = 0; this.lastZ = 0;
    this.lastSwingRate = 3;
    this.steps = 0;
    this.pivots = 0;   // 脚被「跟着胯拧」或「推开」的帧数（探针用）
  }

  _Ground(x, z, input) {
    const fn = input.groundAt;
    if (!fn) return input.playerY;
    const here = fn(input.playerX, input.playerZ), there = fn(x, z);
    if (!Number.isFinite(here) || !Number.isFinite(there)) return input.playerY;
    const lim = this.t.groundFollowM;
    return input.playerY + Clamp(there - here, -lim, lim);
  }

  /** 第 i 只脚的脚位（胯在 ax, az、朝 yaw 时它该站的地方），写进 out = [x, z]。 */
  _Home(i, ax, az, yaw, out) {
    const h = this.homes[i];
    const [dx, dz] = ModelToWorld(h.x, h.z, yaw);
    out[0] = ax + dx; out[1] = az + dz;
    return out;
  }

  _ToeYaw(i) { return this.lowerYaw + (i === 0 ? 1 : -1) * this.t.toeOutDeg * DEG; }

  /** 两只脚直接落回脚位（初次、瞬移、卧倒起来、腾空落地）。 */
  Reset(input) {
    const tmp = [0, 0];
    if (!this.ready || !this.moving) this.lowerYaw = input.aimYaw;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this._Home(i, input.anchorX, input.anchorZ, this.lowerYaw, tmp);
      f.x = tmp[0]; f.z = tmp[1]; f.y = this._Ground(f.x, f.z, input);
      f.yaw = this._ToeYaw(i); f.planted = true; f.swing = null; f.lift = 0; f.plantedS = 1;
    }
    this.lastX = input.playerX; this.lastY = input.playerY; this.lastZ = input.playerZ;
    this.twist = WrapAngle(input.aimYaw - this.lowerYaw);
    this.turning = false;
    this.ready = true;
  }

  /**
   * @param {number} dt 秒；≤ 0 时不推进（只用现有状态出姿势）。
   * @param {object} input { playerX, playerY, playerZ（玩家脚下）, anchorX, anchorZ（胯在地面的投影）,
   *   aimYaw（视线偏航）, grounded, crouch, prone, groundAt(x, z) 可选,
   *   hipHeight（胯离玩家脚底多高）/ legReach（胯到踝最远够多远）/ ankleHeight（踝离地）可选：给了就按三维腿长判「够不着就提前迈」 }
   */
  Update(dt, input) {
    const t = this.t;
    if (!this.ready) this.Reset(input);
    if (!(dt > 0)) return this;
    // ---- 速度：玩家脚下位置差分（锁脚要的是世界里真实挪了多少） ----
    const dx = input.playerX - this.lastX, dz = input.playerZ - this.lastZ;
    if (Math.hypot(dx, dz, input.playerY - this.lastY) > t.teleportM) { this.Reset(input); return this; }
    this.lastX = input.playerX; this.lastY = input.playerY; this.lastZ = input.playerZ;
    const k = 1 - Math.exp(-dt * t.velocityRate);
    this.vx += (dx / dt - this.vx) * k;
    this.vz += (dz / dt - this.vz) * k;
    this.speed = Math.hypot(this.vx, this.vz);

    // ---- 卧倒：交给卧姿片段，起来时脚重新落位 ----
    if ((input.prone || 0) >= 0.6) {
      this.lowerYaw = input.aimYaw; this.twist = 0; this.moving = false;
      this.proneReset = true;
      return this;
    }
    if (this.proneReset) { this.proneReset = false; this.Reset(input); }

    // ---- 腾空：脚收在脚位上方跟着身体走，落地时就地站住 ----
    this.airS = input.grounded === false ? this.airS + dt : 0;
    if (this.airS > t.airborneDelayS) {
      this.airborne = true;
      this.lowerYaw += WrapAngle(input.aimYaw - this.lowerYaw) * (1 - Math.exp(-dt * t.movingTurnRate));
      this.twist = WrapAngle(input.aimYaw - this.lowerYaw);
      const tmp = [0, 0];
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        this._Home(i, input.anchorX, input.anchorZ, this.lowerYaw, tmp);
        f.x = tmp[0]; f.z = tmp[1]; f.y = input.playerY; f.lift = t.airTuckM;
        f.yaw = this._ToeYaw(i); f.planted = false; f.swing = null;
      }
      return this;
    }
    if (this.airborne) { this.airborne = false; this.moving = false; this.Reset(input); return this; }

    // ---- 走 / 停（回差） ----
    const wasMoving = this.moving;
    if (!this.moving && this.speed > t.startMps) this.moving = true;
    else if (this.moving && this.speed < t.stopMps) this.moving = false;

    // ---- 胯朝向 ----
    if (this.moving) {
      this.turning = false;
      const velYaw = Math.atan2(-this.vx, -this.vz);
      const rel = WrapAngle(velYaw - input.aimYaw);
      // sin(2·rel)：前斜 / 后斜各偏向「让胯的正前或正后对着移动方向」那一侧，正横移与正前后为 0，处处连续。
      const target = input.aimYaw + t.orientWarpDeg * DEG * Math.sin(2 * rel);
      this.lowerYaw += WrapAngle(target - this.lowerYaw) * (1 - Math.exp(-dt * t.movingTurnRate));
    } else {
      const off = WrapAngle(input.aimYaw - this.lowerYaw);
      if (Math.abs(off) > t.idleDeadzoneDeg * DEG) this.turning = true;
      if (this.turning) {
        const step = Math.min(Math.max(Math.abs(off) * (1 - Math.exp(-dt * t.idleTurnRate)), t.idleTurnMinDegS * DEG * dt),
          t.idleTurnMaxDegS * DEG * dt);
        this.lowerYaw += Math.sign(off) * Math.min(step, Math.abs(off));
        if (Math.abs(WrapAngle(input.aimYaw - this.lowerYaw)) < t.idleSettleDeg * DEG) this.turning = false;
      }
    }
    const over = WrapAngle(input.aimYaw - this.lowerYaw);
    const maxTwist = t.maxTwistDeg * DEG;
    if (Math.abs(over) > maxTwist) this.lowerYaw = input.aimYaw - Math.sign(over) * maxTwist;
    this.lowerYaw = WrapAngle(this.lowerYaw);
    this.twist = WrapAngle(input.aimYaw - this.lowerYaw);
    this._UpdateLegHeading();
    this._KeepFeetUnderHips(input);

    // ---- 步态参数 ----
    const speed = Math.min(this.speed, 7);
    const cycleRate = Interp(t.cadence, speed) / 2;          // 每秒几个整周期（两步）
    const beta = Interp(t.stanceFraction, speed);            // 着地占比
    const runK = Smooth01((speed - 2) / 2.5);
    const crouch = Clamp(input.crouch || 0, 0, 1);
    const gaitLift = (t.liftWalkM + (t.liftRunM - t.liftWalkM) * runK) * (1 - crouch) + t.liftCrouchM * crouch;
    const stanceS = beta / cycleRate;
    let lead = 0;
    if (this.speed > 1e-3) lead = Math.min(this.speed * stanceS * 0.5 * t.leadScale, t.maxLeadM);
    const vdx = this.speed > 1e-3 ? this.vx / this.speed : 0, vdz = this.speed > 1e-3 ? this.vz / this.speed : 0;

    for (const f of this.feet) if (f.planted) f.plantedS += dt;
    const tmp = [0, 0];

    // ---- 距离匹配的相位 ----
    let dPhase = 0;
    if (this.moving) {
      if (!wasMoving) {
        // 起步：有脚正在挪就对齐到它；否则让离落点更远的那只脚这一帧起步。
        const k = this.feet.findIndex((f) => f.swing);
        if (k >= 0) this.phase = Frac(beta + this.feet[k].swing.u * (1 - beta) - 0.5 * k);
        else {
          let j = 0, best = -1;
          for (let i = 0; i < 2; i++) {
            const f = this.feet[i];
            this._Home(i, input.anchorX + this.vx * stanceS, input.anchorZ + this.vz * stanceS, this.lowerYaw, tmp);
            const d = Math.hypot(tmp[0] + vdx * lead - f.x, tmp[1] + vdz * lead - f.z);
            if (d > best) { best = d; j = i; }
          }
          this.phase = Frac(beta - 0.5 * j);
        }
      }
      dPhase = dt * cycleRate;
    }

    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const localBefore = Frac(this.phase + 0.5 * i);
      if (this.moving && f.planted) {
        // 急加速 / 急转弯：锁住的脚被拉得太远就提前迈，相位跟过去。
        this._Home(i, input.anchorX, input.anchorZ, this.lowerYaw, tmp);
        const horiz = Math.hypot(tmp[0] - f.x, tmp[1] - f.z);
        let stretched = horiz > t.maxStanceStretchM;
        // 竖直方向也算（2026-10-23，沟里坡上实测）：上坡时后脚锁在胯下 0.8–0.9 m，降胯到底也够不着，
        // IK 只能把脚往上拽 —— 那就是「脚在地上滑」。腿长由身体按骨骼量好传进来。
        if (!stretched && input.legReach > 0 && Number.isFinite(input.hipHeight)) {
          const hipY = input.playerY + input.hipHeight - t.maxPelvisDropM;
          stretched = Math.hypot(horiz, hipY - (f.y + (input.ankleHeight || 0))) > input.legReach - t.reachMarginM;
        }
        if (stretched && localBefore < beta) this.phase = Frac(beta - 0.5 * i);
        if (Frac(this.phase + 0.5 * i) >= beta && f.plantedS > 0.05) this._StartSwing(f, gaitLift, false, 0);
      }
    }
    this.phase = Frac(this.phase + dPhase);

    // ---- 摆动的脚 ----
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const s = f.swing;
      if (!s) continue;
      const local = Frac(this.phase + 0.5 * i);
      const before = Frac(this.phase - dPhase + 0.5 * i);
      if (this.moving && !s.settle && before >= beta - 1e-6) {
        // 剩下的进度按剩下的相位走完：相位到 1 时恰好落地（相位绕回 0 也算到了）。
        const remain = Math.max(1 - before, 1e-3);
        const du = local < before ? 1 : Math.min(1, dPhase / remain);
        s.u += (1 - s.u) * du;
        s.rate = cycleRate / Math.max(1 - beta, 0.05);
        this.lastSwingRate = s.rate;
      } else {
        s.u += dt * Math.max(s.rate || this.lastSwingRate, t.finishMinRate);
      }
      // 落点：落地那一刻胯在哪儿 + 往移动方向留半个着地距离；停着就是脚位。
      let tx, tz;
      if (this.moving && !s.settle) {
        const tau = Math.max(0, 1 - s.u) / Math.max(s.rate, 1e-3);
        this._Home(i, input.anchorX + this.vx * tau, input.anchorZ + this.vz * tau, this.lowerYaw, tmp);
        tx = tmp[0] + vdx * lead; tz = tmp[1] + vdz * lead;
      } else {
        this._Home(i, input.anchorX, input.anchorZ, this.lowerYaw, tmp);
        tx = tmp[0]; tz = tmp[1];
      }
      const ty = this._Ground(tx, tz, input);
      const u = Math.min(s.u, 1), e = Smooth01(u);
      f.x = s.fromX + (tx - s.fromX) * e;
      f.z = s.fromZ + (tz - s.fromZ) * e;
      f.y = s.fromY + (ty - s.fromY) * u;
      f.lift = s.lift * Math.sin(Math.PI * u);
      f.yaw = s.fromYaw + WrapAngle(this._ToeYaw(i) - s.fromYaw) * e;
      // 空中的脚尖同样不许比胯朝向偏出 footTwistLimitDeg（胯在这一步里甩过去时脚在空中就跟着拧）
      const swingRel = WrapAngle(f.yaw - this._ToeYaw(i)), lim = t.footTwistLimitDeg * DEG;
      if (Math.abs(swingRel) > lim) f.yaw = WrapAngle(this._ToeYaw(i) + Math.sign(swingRel) * lim);
      if (s.u >= 1) {
        f.x = tx; f.z = tz; f.y = ty; f.lift = 0; f.yaw = this._ToeYaw(i);
        f.swing = null; f.planted = true; f.plantedS = 0;
      }
    }

    this._SeparateFeet();

    // ---- 停着：脚离脚位太远、脚尖偏太多就挪一步（转身时门槛更低，一步接一步） ----
    if (!this.moving && !this.feet[0].swing && !this.feet[1].swing
      && Math.min(this.feet[0].plantedS, this.feet[1].plantedS) >= (this.turning ? t.turningMinPlantS : t.settleMinPlantS)) {
      const distM = this.turning ? t.turningDistM : t.settleDistM;
      const yawM = (this.turning ? t.turningYawDeg : t.settleYawDeg) * DEG;
      let pick = -1, best = 1;
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        this._Home(i, input.anchorX, input.anchorZ, this.lowerYaw, tmp);
        const score = Math.max(Math.hypot(tmp[0] - f.x, tmp[1] - f.z) / distM,
          Math.abs(WrapAngle(this._ToeYaw(i) - f.yaw)) / yawM);
        if (score > best) { best = score; pick = i; }
      }
      if (pick >= 0) this._StartSwing(this.feet[pick], t.settleLiftM, true, 1 / (this.turning ? t.turningSwingS : t.settleSwingS));
    }
    return this;
  }

  /**
   * 着地的脚守两条规矩（每帧、胯朝向算完之后）：
   *   1) 脚尖与胯朝向最多差 footTwistLimitDeg：超出的角度让这只脚绕胯中心（anchor）跟着转过去 —— 位置和脚尖一起转，
   *      两只脚之间的相对摆放不变，所以不会因为胯甩过去而变成一只脚在另一只脚的外侧；
   *   2) 两只脚都着地时，左右方向上至少隔 minFootGapM：挤近了沿胯的左右轴各推开一半。
   */
  _KeepFeetUnderHips(input) {
    const t = this.t, limit = t.footTwistLimitDeg * DEG;
    const ax = input.anchorX, az = input.anchorZ;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (!f.planted) continue;
      const rel = WrapAngle(f.yaw - this._ToeYaw(i));
      if (Math.abs(rel) <= limit) continue;
      const turn = -(rel - Math.sign(rel) * limit);
      const c = Math.cos(turn), sn = Math.sin(turn), dx = f.x - ax, dz = f.z - az;
      f.x = ax + dx * c + dz * sn;
      f.z = az - dx * sn + dz * c;
      f.yaw = WrapAngle(f.yaw + turn);
      f.y = this._Ground(f.x, f.z, input);
      this.pivots++;
    }
    this._SeparateFeet();
  }

  /**
   * 两只脚的左右次序（胯的左右轴上，左脚在左、右脚在右，至少隔 minFootGapM）。挤近了就推开：
   * 一只着地一只在空中 —— 只推空中那只（摆动腿绕着支撑腿走，着地的不动）；都着地或都在空中 —— 各推一半。
   * 每帧摆动与落地之后再做一遍：落地那一帧落点按脚位算，胯刚甩过去时可能正好落在另一只脚的外侧。
   */
  /**
   * 判「两只脚左右次序」用的朝向。站着 = 胯朝向；走动中 = 移动方向（后退取反向，挑离胯朝向近的那一头）：
   * 小跑时前后两脚沿移动方向相距近 0.9 m，胯与移动方向差几度，沿胯的左右轴量就会「挤近」好几厘米，其实没交叉。
   * 横移（移动方向与胯差到 90°）时脚沿胯的左右轴迈，回到胯朝向；50°–90° 之间连续过渡，起步 / 停步按速度过渡。
   */
  _UpdateLegHeading() {
    let heading = this.lowerYaw;
    if (this.speed > 0.05) {
      let velYaw = Math.atan2(-this.vx, -this.vz);
      if (Math.abs(WrapAngle(velYaw - this.lowerYaw)) > Math.PI / 2) velYaw = WrapAngle(velYaw + Math.PI);
      const diff = WrapAngle(velYaw - this.lowerYaw);
      const w = Clamp((Math.PI / 2 - Math.abs(diff)) / (40 * DEG), 0, 1) * Smooth01((this.speed - 0.3) / 0.7);
      heading = WrapAngle(this.lowerYaw + diff * w);
    }
    this.legHeading = heading;
  }

  _SeparateFeet() {
    const [L, R] = this.feet;
    const yaw = this.legHeading ?? this.lowerYaw;
    const lx = -Math.cos(yaw), lz = Math.sin(yaw);   // 腿的左方
    const gap = (L.x - R.x) * lx + (L.z - R.z) * lz;
    if (gap >= this.t.minFootGapM) return;
    const push = this.t.minFootGapM - gap;
    const kL = L.planted === R.planted ? 0.5 : L.planted ? 0 : 1;
    L.x += lx * push * kL; L.z += lz * push * kL;
    R.x -= lx * push * (1 - kL); R.z -= lz * push * (1 - kL);
    this.pivots++;
  }

  _StartSwing(f, lift, settle, rate) {
    f.swing = { u: 0, fromX: f.x, fromY: f.y, fromZ: f.z, fromYaw: f.yaw, settle, rate: rate || this.lastSwingRate, lift };
    f.planted = false;
    this.steps++;
  }
}
