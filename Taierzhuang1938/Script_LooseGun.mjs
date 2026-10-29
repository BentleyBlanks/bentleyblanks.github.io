// Script_LooseGun.mjs — 主角被冲击波推倒时枪脱手、飞出去、落地，以及捡起来那一下（2026-10-29）。纯规则，零 three（契约 2）。
//
// 用户原话：「我还想试试你做一个主角的枪也被震掉，再从地上捡起来的效果」。
//   LooseGunLaunch  出手：出手点、初速（跟着身体 + 手甩出去那一下）、翻滚与绕枪管的转速。序号定随机（出图可复现）。
//   LooseGunRod     飞：枪当一根两头带质量的杆（两端是半径 r 的小球、中间是刚性杆），重力、落地弹跳与摩擦、撞墙、
//                   贴地时绕枪管的转动被磨掉、慢慢侧躺（枪的横截面是竖着的扁条，只能侧着躺），两头都慢下来就停住。
//                   地面是解析地表（world.Ground），墙与实体走射线（world.Sweep）—— 与手榴弹同一个道理：地表不在物理世界里。
//   GunReachPose    捡：低头看向枪、弯腰、手伸过去 → 抓到 → 直起身（时间曲线，相机怎么偏、手伸多少由装配层套上去）。
// 槽位、弹仓、地上那一条交互、模型与声音都在装配层（Script_Main 的 LooseGun* 一组）。数在 Data_Tuning_BlastKnockback.BLAST_LOOSE_GUN。
import { BLAST_LOOSE_GUN } from "./Data_Tuning_BlastKnockback.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

const Clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const Clamp01 = (v) => Clamp(v, 0, 1);
const Smooth = (x) => { const t = Clamp01(x); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const Add = (a, b, s = 1) => V(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
const Sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const Scale = (a, s) => V(a.x * s, a.y * s, a.z * s);
const Dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const Cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const Len = (a) => Math.hypot(a.x, a.y, a.z);
const Norm = (a, fallback = V(0, 1, 0)) => { const l = Len(a); return l > 1e-9 ? Scale(a, 1 / l) : { ...fallback }; };
/** 绕单位轴 k 转 angle（Rodrigues）。 */
function Rotate(v, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), kv = Cross(k, v), d = Dot(k, v) * (1 - c);
  return V(v.x * c + kv.x * s + k.x * d, v.y * c + kv.y * s + k.y * d, v.z * c + kv.z * s + k.z * d);
}
/** 把 v 从 from 方向「平行搬到」to 方向（只转两者之间那一下，不额外绕轴转）。 */
function Transport(v, from, to) {
  const axis = Cross(from, to), s = Len(axis);
  if (s < 1e-9) return v;
  return Rotate(v, Scale(axis, 1 / s), Math.atan2(s, Dot(from, to)));
}
/** v 去掉沿单位向量 k 的分量再归一。 */
const Perp = (v, k, fallback) => Norm(Sub(v, Scale(k, Dot(v, k))), fallback);

/**
 * 枪脱手那一刻的初始状态。
 * @param {object} p
 *   hand      出手点（世界，米）—— 装配层按相机与 BLAST_LOOSE_GUN.hand 算好
 *   facing    人朝向的水平单位向量 {x, z}
 *   body      身体此刻的速度（世界）
 *   push      推力：{ dirX, dirZ, horizontalMps }
 *   serial    第几次脱手（定随机）
 * @returns {{ center, axis, up, velocity, spin, roll }}  spin 是角速度向量（rad/s），roll 是绕枪管的转速
 */
export function LooseGunLaunch({ hand, facing, body = V(), push = {}, serial = 1 }, T = BLAST_LOOSE_GUN) {
  const rnd = Mulberry32(0x9e3779b1 ^ (serial * 2654435761));
  const K = T.kick, S = T.spin;
  const fwd = Norm(V(facing?.x ?? 0, 0, facing?.z ?? -1), V(0, 0, -1));
  const right = V(-fwd.z, 0, fwd.x);
  const dir = Norm(V(push.dirX ?? 0, 0, push.dirZ ?? 0), fwd);
  const h = Math.max(0, Number(push.horizontalMps) || 0);
  const side = (rnd() * 2 - 1) * K.sideMps;
  let velocity = Scale(body, K.bodyScale);
  velocity = Add(velocity, dir, h * K.alongShare);
  velocity = Add(velocity, fwd, K.forwardMps);
  velocity = Add(velocity, right, side);
  velocity.y += K.upMinMps + rnd() * K.upSpanMps;
  // 枪口朝人前方、略抬，枪的「上」大致朝天
  const axis = Norm(V(fwd.x * 0.94, 0.34, fwd.z * 0.94));
  const up = Perp(V(0, 1, 0), axis, V(0, 0, 1));
  // 翻滚：绕「飞的方向 × 天」那根横轴，正反按序号；再绕枪管滚一点
  const flight = Norm(V(velocity.x, 0, velocity.z), fwd);
  const tumbleAxis = Norm(Cross(V(0, 1, 0), flight), right);
  const spinRate = (S.minRadS + rnd() * S.spanRadS) * (rnd() < 0.5 ? -1 : 1);
  const roll = (S.rollMinRadS + rnd() * S.rollSpanRadS) * (rnd() < 0.5 ? -1 : 1);
  // 再带一点绕竖轴的打转，落地时枪不总是顺着飞的方向躺
  const yawRate = (rnd() * 2 - 1) * S.yawRadS;
  return { center: { ...hand }, axis, up, velocity, spin: Add(Scale(tumbleAxis, spinRate), V(0, yawRate, 0)), roll };
}

/** 飞出去的枪：一根两头带质量的杆。端点 a 在枪口那头、b 在枪托那头。 */
export class LooseGunRod {
  constructor(T = BLAST_LOOSE_GUN) {
    this.T = T;
    this.a = V(); this.b = V(); this.va = V(); this.vb = V();
    this.up = V(0, 1, 0); this.roll = 0;
    this.h = 0.5; this.r = 0.03;
    this.asleep = true; this.age = 0; this.still = 0; this.touching = false;
    this.impacts = [];
    this.stats = { substeps: 0, bounces: 0, walls: 0 };
  }

  /**
   * 放出去。halfLengthM = 枪长一半，radiusM = 侧躺时的半厚（两端小球的半径）。
   * @param {{center, axis, up, velocity, spin, roll}} launch  LooseGunLaunch 的结果
   */
  Launch(launch, { halfLengthM = 0.6, radiusM = 0.03 } = {}) {
    this.r = Math.max(0.01, radiusM);
    this.h = Math.max(0.1, halfLengthM - this.r);
    const axis = Norm(launch.axis, V(0, 0, -1));
    const arm = Scale(axis, this.h);
    this.a = Add(launch.center, arm); this.b = Add(launch.center, arm, -1);
    const w = launch.spin || V();
    this.va = Add(launch.velocity, Cross(w, arm)); this.vb = Sub(launch.velocity, Cross(w, arm));
    this.up = Perp(launch.up || V(0, 1, 0), axis, V(0, 1, 0));
    this.roll = Number(launch.roll) || 0;
    this.asleep = false; this.age = 0; this.still = 0; this.touching = false; this.impacts.length = 0;
  }

  get Center() { return Scale(Add(this.a, this.b), 0.5); }
  get Axis() { return Norm(Sub(this.a, this.b), V(0, 0, -1)); }
  get Speed() { return Math.max(Len(this.va), Len(this.vb)); }

  /** 此刻的姿态：中心、枪口方向、枪的「上」（世界单位向量）。 */
  Pose() { return { center: this.Center, axis: this.Axis, up: { ...this.up } }; }

  /** 取走这几帧的落地 / 撞墙（调用方按 speed 放声音）。 */
  ConsumeImpacts() {
    if (!this.impacts.length) return null;
    const out = this.impacts.slice(); this.impacts.length = 0; return out;
  }

  /**
   * 推进一帧。world：
   *   Ground(x, z) → 地表高度
   *   Sweep(from, to) → { dist, normal: {x,y,z} } | null   从 from 到 to 的射线打到的第一个实体（墙、沙袋、箱子顶面）
   */
  Step(dt, world) {
    if (this.asleep || !(dt > 0)) return;
    const n = Math.max(1, Math.ceil(dt / this.T.maxSubstepS));
    for (let i = 0; i < n; i++) this._Substep(dt / n, world);
    this.age += dt;
    const S = this.T.sleep;
    if (this.touching && this.Speed < S.mps && Math.abs(this.roll) < 1.5) this.still += dt; else this.still = 0;
    if (this.still >= S.s || this.age >= S.maxFlightS) this._Sleep(world);
  }

  _GroundNormal(world, x, z) {
    const e = 0.25;
    const dx = world.Ground(x + e, z) - world.Ground(x - e, z), dz = world.Ground(x, z + e) - world.Ground(x, z - e);
    return Norm(V(-dx / (2 * e), 1, -dz / (2 * e)));
  }

  /** 一个端点从 from 走到 p：先挡墙（射线），再托地。返回 { p, n }，n = 碰到的面的法线（没碰到为 null）。 */
  _Collide(from, p, world) {
    let n = null;
    const d = Sub(p, from), len = Len(d);
    if (len > 1e-6 && world.Sweep) {
      const hit = world.Sweep(from, p);
      if (hit && hit.dist < len + this.r) {
        const dir = Scale(d, 1 / len);
        p = Add(from, dir, Math.max(0, hit.dist - this.r));
        n = Norm(hit.normal || Scale(dir, -1));
        if (n.y < 0.6) this.stats.walls += 1;
      }
    }
    const gy = world.Ground(p.x, p.z) + this.r;
    if (p.y < gy) { p = V(p.x, gy, p.z); n = this._GroundNormal(world, p.x, p.z); }
    return { p, n };
  }

  /** 杆长约束：两端各挪一半（两头一样重）。 */
  _Length(pa, pb) {
    const d = Sub(pa, pb), len = Len(d);
    if (len < 1e-9) return;
    const k = (len - 2 * this.h) / len * 0.5;
    pa.x -= d.x * k; pa.y -= d.y * k; pa.z -= d.z * k;
    pb.x += d.x * k; pb.y += d.y * k; pb.z += d.z * k;
  }

  /** 碰撞之后的速度：法向按反弹系数弹回（太慢就不弹），切向按库仑摩擦扣、贴地再按滑动阻力衰减。 */
  _Respond(vNew, vPre, n, dt, which) {
    const C = this.T.contact;
    const vnPre = Dot(vPre, n);
    const vt = Sub(vNew, Scale(n, Dot(vNew, n)));
    const bounce = vnPre < -C.bounceMps;
    const vn = bounce ? -C.restitution * vnPre : 0;
    const dvn = Math.max(0, vn - vnPre);
    const t = Len(vt);
    let k = t > 1e-6 ? Math.max(0, 1 - C.friction * dvn / t) : 0;
    if (!bounce) k *= Math.max(0, 1 - C.slideDragPerS * dt);
    if (bounce) {
      this.stats.bounces += 1;
      this.impacts.push({ speed: -vnPre, end: which, wall: n.y < 0.6, x: 0, y: 0, z: 0 });
    }
    return Add(Scale(vt, k), n, vn);
  }

  _Substep(dt, world) {
    const T = this.T, C = T.contact, g = T.gravityMps2;
    this.stats.substeps += 1;
    const axisOld = this.Axis;
    const preA = V(this.va.x, this.va.y - g * dt, this.va.z), preB = V(this.vb.x, this.vb.y - g * dt, this.vb.z);
    let pa = Add(this.a, preA, dt), pb = Add(this.b, preB, dt);
    this._Length(pa, pb);
    let ca = this._Collide(this.a, pa, world), cb = this._Collide(this.b, pb, world);
    pa = ca.p; pb = cb.p;
    // 再收一次杆长、再托一次地（只托地，不再打射线）
    this._Length(pa, pb);
    for (const [p, c] of [[pa, ca], [pb, cb]]) {
      const gy = world.Ground(p.x, p.z) + this.r;
      if (p.y < gy) { p.y = gy; c.n ||= this._GroundNormal(world, p.x, p.z); }
    }
    // 杆中间也不许钻进土里（横在一个小土包上）：两头一起抬
    const mid = Scale(Add(pa, pb), 0.5), my = world.Ground(mid.x, mid.z) + this.r;
    if (mid.y < my) {
      const lift = my - mid.y;
      pa.y += lift; pb.y += lift;
      const n = this._GroundNormal(world, mid.x, mid.z);
      ca.n ||= n; cb.n ||= n;
    }
    let va = Scale(Sub(pa, this.a), 1 / dt), vb = Scale(Sub(pb, this.b), 1 / dt);
    if (ca.n) va = this._Respond(va, preA, ca.n, dt, "a");
    if (cb.n) vb = this._Respond(vb, preB, cb.n, dt, "b");
    const center = Scale(Add(pa, pb), 0.5);
    for (const e of this.impacts) if (e.x === 0 && e.y === 0 && e.z === 0) { e.x = center.x; e.y = center.y; e.z = center.z; }
    this.a = pa; this.b = pb; this.va = va; this.vb = vb;
    this.touching = !!(ca.n || cb.n);
    // 枪的「上」：跟着杆转过去，再绕枪管滚
    const axis = this.Axis;
    let up = Transport(this.up, axisOld, axis);
    up = Rotate(up, axis, this.roll * dt);
    if (this.touching) {
      this.roll *= Math.exp(-C.rollDampPerS * dt);
      // 贴地慢慢侧躺：枪的「上」转到与地面法线垂直的那一侧（近的那一侧）
      const n = ca.n || cb.n;
      const nPerp = Sub(n, Scale(axis, Dot(n, axis)));
      if (Len(nPerp) > 0.2) {
        const np = Norm(nPerp);
        const phi = Math.atan2(Dot(Cross(np, up), axis), Dot(np, up));
        const target = phi >= 0 ? Math.PI / 2 : -Math.PI / 2;
        up = Rotate(up, axis, (target - phi) * (1 - Math.exp(-C.settleRate * dt)));
      }
    } else this.roll *= Math.exp(-0.3 * dt);
    this.up = Perp(up, axis, V(0, 1, 0));
  }

  /** 停住：速度清零、两头落到地上（搁在实体上的那头不动）、侧躺摆正。 */
  _Sleep(world) {
    this.va = V(); this.vb = V(); this.roll = 0;
    for (const p of [this.a, this.b]) {
      const gy = world.Ground(p.x, p.z) + this.r;
      if (p.y < gy || p.y - gy < 0.05) p.y = gy;
    }
    const axis = this.Axis, n = this._GroundNormal(world, (this.a.x + this.b.x) / 2, (this.a.z + this.b.z) / 2);
    const nPerp = Sub(n, Scale(axis, Dot(n, axis)));
    if (Len(nPerp) > 0.2) {
      const np = Norm(nPerp);
      const phi = Math.atan2(Dot(Cross(np, this.up), axis), Dot(np, this.up));
      this.up = Perp(Rotate(this.up, axis, (phi >= 0 ? Math.PI / 2 : -Math.PI / 2) - phi), axis, V(0, 1, 0));
    }
    this.asleep = true;
  }

  Inspect() {
    const c = this.Center;
    return { asleep: this.asleep, age: +this.age.toFixed(2), touching: this.touching, speed: +this.Speed.toFixed(3),
      center: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], axis: Object.values(this.Axis).map((v) => +v.toFixed(2)),
      up: Object.values(this.up).map((v) => +v.toFixed(2)), roll: +this.roll.toFixed(2), stats: { ...this.stats } };
  }
}

/**
 * 捡起来那一下的时间曲线（t 从按下 F 起算）。
 * @returns {{ dip: number, reach: number, grabbed: boolean, done: boolean }}
 *   dip    低头 + 弯腰的程度 0..1（装配层乘上眼位下降与看向枪的角度）
 *   reach  右手伸向枪的程度 0..1（抓到以后手里已经是枪，不再伸）
 */
export function GunReachPose(t, T = BLAST_LOOSE_GUN) {
  const P = T.pickup, grabAt = P.reachS, upAt = P.reachS + P.holdS, end = upAt + P.returnS;
  const dip = t < grabAt ? Smooth(t / grabAt) : t < upAt ? 1 : 1 - Smooth((t - upAt) / P.returnS);
  const reach = t < grabAt ? Smooth((t - grabAt * 0.25) / (grabAt * 0.75)) : 0;
  return { dip: t >= end ? 0 : dip, reach, grabbed: t >= grabAt, done: t >= end };
}

export default LooseGunRod;
