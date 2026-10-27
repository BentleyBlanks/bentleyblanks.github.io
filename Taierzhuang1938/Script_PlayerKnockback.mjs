// Script_PlayerKnockback.mjs — 玩家被冲击波推一把 / 推倒 / 掀飞之后的身体（2026-10-28）。纯状态机，不 import three（契约 2）。
//
// 推力（Δv、方向、分档）由 Script_BlastKnockback.BlastPush 算好交进来；这里只管这一下之后人怎么动：
//   推一把 stagger  站得住：速度直接加上去，身子歪一下再回正，手上的控制 0.3–0.8 s 里慢慢回来（不占身体，Busy 为假）。
//   倒地 tumble     站不住：整个人当一根刚体杆绕脚翻倒（质心高 L、绕质心回转半径 k）：
//                     开始的转速 ω0 = Δv·L / (k² + L²)（冲量对脚的角动量守恒），之后 θ'' = g·L·sinθ / (k² + L²)，g 取真实的 9.81；
//                     脚往前蹭的那一点按摩擦减速。一开始就转得够快、脚撑不住（L·ω0² > g），或者本来就站不住又被往上掀的，
//                     就是「被掀飞」：质心走抛物线、身子在空中转。飞着时脚先碰地，按对脚的角动量守恒接着绕脚翻
//                     （ω = (k²·ω + L·(v水平·cosθ − v竖直·sinθ)) / (k² + L²)，脚蹭停）；身子已经转平了才碰地，就是身体着地（按着地速度算钝伤）。
//   滑 slide        身体着地以后带着水平速度在地上滑，按衣服对土的摩擦减速；撞墙按水平速度算钝伤。趴着被推的也走这一段。
//   躺 lie → 爬起来 rise
// 被这一下炸死的人照样被掀出去（dead）：飞、砸地、滑，最后躺着不再起来 —— 死亡镜头跟着身体走。
// 移动全部交给调用方的 mover(dx, dy, dz) → { x, y, z, grounded, blocked }（玩家的物理胶囊），这里不碰碰撞。
// 位置口径：调用方的「位置」是胶囊底 = 人质心的水平投影、身体最低点的高度。相机眼位由 CameraPose 给出（相对胶囊底）。
import { BLAST_KNOCKBACK } from "./Data_Tuning_BlastKnockback.mjs";
import { BalanceLimitMps, ImpactDamage, KnockRegime, ToppleSpinRadS } from "./Script_BlastKnockback.mjs";

const Clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const Clamp01 = (v) => Clamp(v, 0, 1);
const Smooth = (x) => { const t = Clamp01(x); return t * t * (3 - 2 * t); };
const StanceKey = (stance) => (stance === "crouch" || stance === "prone" ? stance : "stand");

export class PlayerKnockback {
  constructor(K = BLAST_KNOCKBACK) {
    this.K = K;
    this.impacts = [];
    this.Reset();
  }

  Reset() {
    this.phase = "none";          // none | tumble | slide | lie | rise
    this.contact = "pivot";       // tumble 里：pivot = 脚撑在地上绕脚翻；air = 离地飞着
    this.t = 0;                   // 本段计时
    this.time = 0;                // 总计时（撞击去重用）
    this.theta = 0; this.omega = 0;
    this.dirX = 1; this.dirZ = 0;  // 被推的水平方向（身体往这边倒）
    this.feetMps = 0;             // 绕脚翻时脚往前蹭的速度
    this.airMps = 0;              // 飞着时质心的水平速度（沿 dir）
    this.vy = 0; this.comY = 0;   // 飞着时质心的竖直速度、世界高度
    this.vx = 0; this.vz = 0;     // 滑的时候的水平速度（世界）
    this.baseY = 0;               // 胶囊底的世界高度（mover 回来的）
    this.camH = 1;                // 相机用的质心离胶囊底高度（着地后往实际高度靠）
    this.stance = "stand"; this.L = 1; this.k = 0.5; this.eye0 = 1.62;
    this.proneSlide = false;
    this.dead = false;            // 人已经死了：躺下以后不再爬起来
    this.lieS = 0; this.severity = 0; this.riseTheta = 0;
    this.grounded = true;
    this.lastImpact = { wall: -1e9, ground: -1e9 };
    this.stagger = { t: 0, dur: 0, tilt: 0, dirX: 1, dirZ: 0 };
    this.impacts.length = 0;
    this.pushes = 0;
    this.last = null;             // 最近一次推力（取证）
    this.peak = { airS: 0, airTop: 0, travel: 0, impact: 0 };
    this._startX = 0; this._startZ = 0; this._airS = 0;
  }

  /** 占着身体（倒地到爬起来）。推一把不算。 */
  get Active() { return this.phase !== "none"; }
  get Staggering() { return this.stagger.t < this.stagger.dur; }
  /** 躺着、爬起来时允许转头看（倒下、飞着、滑的时候人不由自己；死了不许）。 */
  get LookAllowed() { return !this.dead && (this.phase === "lie" || this.phase === "rise" || (this.phase === "slide" && this.proneSlide)); }

  /** 倒着的时候人没了（伤重、摔死、再挨一下）：躺下以后不再爬起来。 */
  Die() { if (this.Active) this.dead = true; }
  /** 推一把时移动输入还剩多少（0..1）。 */
  get ControlScale() {
    if (this.Active) return 0;
    const s = this.stagger;
    if (s.t >= s.dur) return 1;
    const m = this.K.stagger.controlMin;
    return m + (1 - m) * Smooth(s.t / s.dur);
  }
  /** 手上的枪放下去多少（0..1，交给视图模型的「贴墙收枪」那一层）。 */
  get GunLower() {
    if (this.phase === "none") return 0;
    if (this.phase === "rise") return 1 - Smooth((this.t / this.K.fall.riseS - 0.35) / 0.65);
    if (this.proneSlide) return 0.6;
    return 1;
  }
  /** 第一人称的腿和身子要不要藏（人横在地上时那套站姿身体对不上）。 */
  get BodyHidden() {
    if (this.phase === "none" || this.proneSlide) return false;
    if (this.phase === "rise") return this.t < this.K.fall.riseS * 0.6;
    return true;
  }

  /**
   * 交一次推力进来（BlastPush 的结果）。
   * @param {object} push   Script_BlastKnockback.BlastPush 的返回
   * @param {{stance:string, eyeM:number, baseY:number, x:number, z:number, allowKnockdown?:boolean}} body
   * @returns {{regime:string, addVx:number, addVz:number}}  推一把时调用方把 add 加到自己的速度上
   */
  Push(push, { stance = "stand", eyeM = 1.62, baseY = 0, x = 0, z = 0, allowKnockdown = true, dead = false } = {}) {
    const K = this.K, out = { regime: "none", addVx: 0, addVz: 0 };
    if (dead) this.dead = true;
    this.pushes += 1;
    this.last = { ...push, impulse: undefined, stance, at: this.time };
    const h = push.horizontalMps, up = Math.max(0, push.upMps);
    if (this.Active) {
      // 已经倒着：把新的这一下叠进现在的运动里（躺着 / 滑着时身体贴地，按趴姿的面积重算过分档才交进来）
      out.regime = "add";
      const along = h * (push.dirX * this.dirX + push.dirZ * this.dirZ);
      if (this.phase === "tumble") {
        if (this.contact === "air") { this.airMps += along; this.vy += up; } else this.feetMps = Math.max(0, this.feetMps + along);
      } else if (h >= K.regime.ignoreMps) {
        this.vx = (this.phase === "slide" ? this.vx : 0) + h * push.dirX;
        this.vz = (this.phase === "slide" ? this.vz : 0) + h * push.dirZ;
        this._Enter("slide");
      }
      return out;
    }
    let regime = push.regime || KnockRegime({ horizontalMps: h, upMps: up, stance }, K);
    if (!allowKnockdown && regime !== "none" && regime !== "stagger") regime = "stagger";
    // 死了的人站不住：推得动就倒，推不动（或趴着只滑一小段）就交给普通的死亡镜头
    if (this.dead && (regime === "stagger" || regime === "slide")) regime = "none";
    out.regime = regime;
    if (regime === "none") { if (this.dead && !this.Active) this.dead = false; return out; }
    const key = StanceKey(stance);
    if (regime === "stagger") {
      const limit = key === "prone" ? K.regime.proneSlideMps : BalanceLimitMps(key, K);
      const ratio = Clamp01(h / limit);
      const S = K.stagger, s = this.stagger;
      const dur = S.minS + (S.maxS - S.minS) * ratio;
      // 正在晃又挨一下：取更狠的那一下重新开始
      if (!this.Staggering || ratio * S.tiltRad >= s.tilt * (1 - Smooth(s.t / Math.max(1e-3, s.dur)))) {
        s.t = 0; s.dur = dur; s.tilt = key === "prone" ? 0 : ratio * S.tiltRad; s.dirX = push.dirX; s.dirZ = push.dirZ;
      }
      // 被挡住了还在晃（剧本 / 机枪位）时不加速度，只晃身子
      const vh = allowKnockdown || h <= limit ? Math.min(h, limit) : 0;
      out.addVx = vh * push.dirX; out.addVz = vh * push.dirZ;
      return out;
    }
    // 倒地 / 掀飞 / 趴着被推着滑
    const B = K.body;
    this.stance = key;
    this.L = B.comHeightM[key]; this.k = B.gyrationM[key]; this.eye0 = eyeM;
    this.dirX = push.dirX; this.dirZ = push.dirZ;
    this.baseY = baseY; this.severity = Math.max(h, up);
    this.theta = 0; this.omega = 0; this.feetMps = 0; this.airMps = 0; this.vy = 0;
    this.camH = this.L; this.proneSlide = false;
    this.stagger.dur = 0;
    this._startX = x; this._startZ = z; this._airS = 0;
    this.peak = { airS: 0, airTop: 0, travel: 0, impact: 0 };
    if (regime === "slide") {
      this.proneSlide = true; this.camH = 0;
      this.vx = h * push.dirX; this.vz = h * push.dirZ;
      this._Enter("slide");
      return out;
    }
    const L = this.L, k = this.k;
    const spin = ToppleSpinRadS(h, key, K);
    this._Enter("tumble");
    if (regime === "thrown") {
      // 脚撑不住（L·ω0² > g）或冲击往上掀：一开始就离地。质心带着整份 Δv 走，转速是脚蹭地带起来的那一部分。
      const F = K.fall;
      this.contact = "air";
      this.omega = Math.min(spin * F.spinScale, F.maxSpinRadS);
      this.airMps = h; this.vy = up;
      this.comY = baseY + L;
    } else {
      // 站不住：绕脚翻。冲量对脚的角动量全给了转动，剩下一点让脚往前蹭（ω0·L + 脚速 = Δv）
      this.contact = "pivot";
      this.omega = spin;
      this.feetMps = h * k * k / (k * k + L * L);
    }
    return out;
  }

  _Enter(phase) {
    this.phase = phase; this.t = 0;
    if (phase === "lie") {
      const F = this.K.fall;
      this.lieS = Clamp(F.lieMinS + F.liePerMps * Math.max(0, this.severity - BalanceLimitMps(this.stance, this.K)), F.lieMinS, F.lieMaxS);
    }
    if (phase === "rise") this.riseTheta = this.theta;
  }

  /** 身体最低点到质心的竖直距离（倾角 θ）：脚那头 L·cosθ，躺平了剩身体半厚。 */
  _Below(theta) { return Math.max(this.L * Math.cos(theta), this.K.body.halfThicknessM); }

  _Impact(surface, speed) {
    const D = this.K.damage;
    if (this.time - this.lastImpact[surface] < D.repeatS) return;
    this.lastImpact[surface] = this.time;
    const damage = ImpactDamage(speed, surface, this.K);
    this.severity = Math.max(this.severity, speed);
    this.peak.impact = Math.max(this.peak.impact, speed);
    this.impacts.push({ surface, speed, damage, phase: this.phase, contact: this.contact });
  }

  /** 取走这几帧的撞击（调用方按 damage 扣血、按 speed 震屏）。 */
  ConsumeImpacts() {
    if (!this.impacts.length) return null;
    const out = this.impacts.slice(); this.impacts.length = 0; return out;
  }

  /**
   * 推进一帧。
   * @param {number} dt
   * @param {(dx:number, dy:number, dz:number) => {x:number,y:number,z:number,grounded:boolean,blocked:boolean}} mover
   */
  Step(dt, mover) {
    if (!(dt > 0)) return;
    this.time += dt;
    const s = this.stagger;
    if (s.t < s.dur) s.t = Math.min(s.dur, s.t + dt);
    if (this.phase === "none") return;
    this.t += dt;
    const K = this.K, F = K.fall, g = K.body.gravityMps2, L = this.L, k = this.k;
    const settle = 1 - Math.exp(-dt * K.camera.settleRate);
    if (this.phase === "tumble" && this.contact === "pivot") {
      const inertia = k * k + L * L;
      const alpha = g * L * Math.sin(this.theta) / inertia;
      this.omega += alpha * dt;
      this.theta += this.omega * dt;
      this.feetMps = Math.max(0, this.feetMps - F.feetFriction * g * dt);
      const vh = this.feetMps + L * Math.cos(this.theta) * this.omega;
      const r = mover(vh * this.dirX * dt, -0.05, vh * this.dirZ * dt);
      this.baseY = r.y; this.grounded = true;
      if (r.blocked) { this._Impact("wall", vh); this.feetMps = 0; }
      this.camH += (this._Below(this.theta) - this.camH) * settle;
      if (this.theta >= F.bodyImpactRad) {
        const vx = this.feetMps + L * Math.cos(this.theta) * this.omega, vy = L * Math.sin(this.theta) * this.omega;
        this._Impact("ground", Math.hypot(r.blocked ? 0 : vx, vy));
        this.vx = (r.blocked ? 0 : vx) * this.dirX; this.vz = (r.blocked ? 0 : vx) * this.dirZ;
        this._Enter("slide");
      }
    } else if (this.phase === "tumble") {
      this._airS += dt;
      this.peak.airS = Math.max(this.peak.airS, this._airS);
      this.comY += this.vy * dt;
      this.vy -= g * dt;
      this.theta = Math.min(F.lieRad, this.theta + this.omega * dt);
      const lowY = this.comY - this._Below(this.theta);
      const wantDy = lowY - this.baseY;
      const r = mover(this.airMps * this.dirX * dt, wantDy, this.airMps * this.dirZ * dt);
      this.peak.airTop = Math.max(this.peak.airTop, r.y - this.baseY);
      this.baseY = r.y;
      if (r.blocked) { this._Impact("wall", Math.abs(this.airMps)); this.airMps = 0; }
      this.camH = this.comY - this.baseY;
      this.grounded = !!r.grounded;
      // 碰地：想往下却被托住（起飞那一两帧脚还在地上蹭，不算落地）
      if (r.grounded && wantDy < -1e-4 && this._airS > 0.03 && this.vy <= 0) {
        const speed = Math.hypot(this.airMps, this.vy);
        if (this.theta >= F.bodyImpactRad) {
          this._Impact("ground", speed);
          this.vx = this.airMps * this.dirX; this.vz = this.airMps * this.dirZ;
          this._Enter("slide");
        } else {
          // 脚先碰地、蹭住：对脚的角动量守恒（绕质心的自转 + 质心速度对脚的力矩），接着绕脚翻
          const c = Math.cos(this.theta), sn = Math.sin(this.theta);
          this.omega = Math.min(F.maxSpinRadS, Math.max(0, (k * k * this.omega + L * (this.airMps * c - this.vy * sn)) / (k * k + L * L)));
          this.feetMps = 0;
          this.contact = "pivot";
        }
      }
    } else if (this.phase === "slide") {
      if (!this.proneSlide) this.theta += (F.lieRad - this.theta) * Math.min(1, dt * 6);
      const speed = Math.hypot(this.vx, this.vz);
      const next = Math.max(0, speed - F.slideFriction * g * dt);
      const scale = speed > 1e-6 ? next / speed : 0;
      this.vx *= scale; this.vz *= scale;
      const r = mover(this.vx * dt, -0.05, this.vz * dt);
      this.baseY = r.y; this.grounded = true;
      if (r.blocked && next > F.stopMps) { this._Impact("wall", next); this.vx = 0; this.vz = 0; }
      if (!this.proneSlide) this.camH += (this._Below(this.theta) - this.camH) * settle;
      if (Math.hypot(this.vx, this.vz) < F.stopMps) {
        this.vx = 0; this.vz = 0;
        if (this.proneSlide) this._Finish(); else this._Enter("lie");
      }
    } else if (this.phase === "lie") {
      this.theta += (F.lieRad - this.theta) * Math.min(1, dt * 6);
      this.camH += (this._Below(this.theta) - this.camH) * settle;
      mover(0, -0.05, 0);
      if (this.t >= this.lieS && !this.dead) this._Enter("rise");
    } else if (this.phase === "rise") {
      const u = Smooth(this.t / F.riseS);
      this.theta = this.riseTheta * (1 - u);
      this.camH += (this._Below(this.theta) - this.camH) * settle;
      if (this.t >= F.riseS) { this.theta = 0; this.camH = this.L; this._Finish(); }
    }
  }

  _Finish() {
    this.phase = "none"; this.t = 0; this.contact = "pivot";
    this.theta = 0; this.omega = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.airMps = 0; this.feetMps = 0;
    this.proneSlide = false;
  }

  /** 记一下离起点多远（调用方每帧给当前位置；只用于取证）。 */
  Track(x, z) {
    if (this.phase === "none") return;
    this.peak.travel = Math.max(this.peak.travel, Math.hypot(x - this._startX, z - this._startZ));
  }

  /** 这一帧身体的水平 / 竖直速度（世界，交给脚步声、视图模型、AI 读的 player.velocity）。 */
  Velocity(out = { x: 0, y: 0, z: 0 }) {
    if (this.phase === "tumble") {
      const vh = this.contact === "air" ? this.airMps : this.feetMps + this.L * Math.cos(this.theta) * this.omega;
      out.x = vh * this.dirX; out.z = vh * this.dirZ;
      out.y = this.contact === "air" ? this.vy : -this.L * Math.sin(this.theta) * this.omega;
    } else if (this.phase === "slide") { out.x = this.vx; out.z = this.vz; out.y = 0; }
    else { out.x = 0; out.y = 0; out.z = 0; }
    return out;
  }

  /** 眼睛离胶囊底多高（倒着时胶囊跟着矮下去）。 */
  EyeHeight(standEye = this.eye0) {
    if (this.phase === "none") return standEye;
    if (this.proneSlide) return standEye;
    return Math.max(0.12, this.camH + (this.eye0 - this.L) * Math.cos(this.theta));
  }

  /**
   * 相机：相对胶囊底的眼位与要叠上去的俯仰 / 滚转（弧度）。yaw = 玩家朝向（前 = (−sin, 0, −cos)，右 = (cos, 0, −sin)）。
   * 没在倒、也没在晃时返回 null。
   */
  CameraPose(yaw, standEye) {
    const C = this.K.camera;
    let theta = 0, dirX = this.dirX, dirZ = this.dirZ, eyeY = standEye, ahead = 0;
    if (this.phase !== "none" && !this.proneSlide) {
      theta = this.theta;
      eyeY = this.EyeHeight();
      ahead = Math.min(C.headOffsetMaxM, (this.eye0 - this.L) * Math.sin(theta));
    } else if (this.Staggering && this.stagger.tilt > 0) {
      const s = this.stagger, S = this.K.stagger;
      const env = s.t < S.peakS ? Smooth(s.t / S.peakS) : 1 - Smooth((s.t - S.peakS) / Math.max(1e-3, s.dur - S.peakS));
      theta = s.tilt * env; dirX = s.dirX; dirZ = s.dirZ;
      // 站着被推歪：眼睛跟着身子往外甩一点、低一点（绕脚转 θ）
      eyeY = standEye * Math.cos(theta);
      ahead = standEye * Math.sin(theta) * 0.5;
    } else return null;
    const f = -Math.sin(yaw) * dirX - Math.cos(yaw) * dirZ;
    const r = Math.cos(yaw) * dirX - Math.sin(yaw) * dirZ;
    const tilt = theta * C.tiltScale;
    return { x: dirX * ahead, y: eyeY, z: dirZ * ahead, pitch: -tilt * f, roll: -tilt * r, theta };
  }

  Inspect() {
    return {
      phase: this.phase, contact: this.contact, t: +this.t.toFixed(3), theta: +this.theta.toFixed(3), omega: +this.omega.toFixed(3),
      stance: this.stance, staggering: this.Staggering, stagger: { ...this.stagger },
      eye: +this.EyeHeight().toFixed(3), lieS: +this.lieS.toFixed(2), severity: +this.severity.toFixed(2),
      pushes: this.pushes, peak: { ...this.peak },
      last: this.last && { regime: this.last.regime, dvMps: +this.last.dvMps.toFixed(3), horizontalMps: +this.last.horizontalMps.toFixed(3),
        upMps: +this.last.upMps.toFixed(3), distanceM: +this.last.distanceM.toFixed(2), stance: this.last.stance },
    };
  }
}

export default PlayerKnockback;
