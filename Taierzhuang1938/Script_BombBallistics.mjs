// Script_BombBallistics.mjs — 航空炸弹的外弹道、投弹解算与落地尺度律（2026-09-28，纯函数，不 import three）。
//
// 外弹道：平飞离机的炸弹只受重力与二次空气阻力
//     dv/dt = (0, −g) − k·|v|·v，   k = ρ·Cd·A / (2m)
// 没有闭式解，用 RK4 定步长积分一次，存成等时距的采样（位置 + 速度），画面与落点都从这一条航迹取：
// 同一轮里每架飞机速度、航向相同，所以一轮只积分一次；各颗弹只是离机点不同、截在不同的地面高度上。
// 50 kg 级弹的终速三百多米每秒，从两三百米高扔下，落地时比「真空里」少飞十几二十米 ——
// 这就是「炸弹落在机身后面」的真正来由（旧版写死了 45 m）。
//
// 投弹解算（投弹手的活）：先在平地上算出这一高度、这一速度下的「前冲距离」，
// 长机在离瞄准点还差这段距离时投下一串的中间那颗，僚机跟长机一起投（有零点几秒的反应迟差）。
// 落点是从离机那一刻积出来的，不是先定落点再倒推。
//
// 落地尺度（Hopkinson–Cranz 立方根缩放）：火球、弹坑、冲击环按 ∛W 放大；
// 抛射速度按重力区弹坑的速度尺度 √(g·R) ∝ W^(1/6)。数全在 Data_AerialBombs。

import { AERIAL_BOMBS, BOMB_PHYSICS } from "./Data_AerialBombs.mjs";

export function BombSpec(id) { return AERIAL_BOMBS[id] || null; }

/** 二次阻力系数 k（1/m）：阻力加速度 = k·|v|·v。 */
export function DragK(spec, rho = BOMB_PHYSICS.airDensity) {
  const area = Math.PI * spec.diameterM * spec.diameterM / 4;
  return rho * spec.cd * area / (2 * spec.massKg);
}

/** 终速（m/s）：重力与阻力平衡。 */
export function TerminalVelocity(spec, g = BOMB_PHYSICS.gravity, rho = BOMB_PHYSICS.airDensity) {
  return Math.sqrt(g / DragK(spec, rho));
}

/**
 * 平飞离机的一条相对航迹：离机点为原点，s 沿航向、y 向上。
 * 离机时带着飞机的速度 speed（再加向下的弹射速度 vDown），积到落下 dropM 米为止。
 * @returns {{ speed, k, sampleS, t: number[], s: number[], y: number[], vs: number[], vy: number[] }}
 */
export function DropTrajectory(speed, k, dropM, {
  g = BOMB_PHYSICS.gravity, stepS = BOMB_PHYSICS.integrateStepS, sampleS = BOMB_PHYSICS.sampleS, vDown = 0, maxS = 90,
} = {}) {
  const per = Math.max(1, Math.round(sampleS / stepS));
  const h = sampleS / per;
  const out = { speed, k, sampleS, t: [0], s: [0], y: [0], vs: [speed], vy: [-vDown] };
  let s = 0, y = 0, vs = speed, vy = -vDown, n = 0;
  // RK4（二阶系统）：位置 += h·v + h²/6·(a1 + a2 + a3)；速度 += h/6·(a1 + 2a2 + 2a3 + a4)。
  const ax = (u, w) => -k * Math.hypot(u, w) * u;
  const ay = (u, w) => -g - k * Math.hypot(u, w) * w;
  while (y > -dropM && n * h < maxS) {
    for (let i = 0; i < per; i += 1) {
      const a1s = ax(vs, vy), a1y = ay(vs, vy);
      const v2s = vs + a1s * h / 2, v2y = vy + a1y * h / 2;
      const a2s = ax(v2s, v2y), a2y = ay(v2s, v2y);
      const v3s = vs + a2s * h / 2, v3y = vy + a2y * h / 2;
      const a3s = ax(v3s, v3y), a3y = ay(v3s, v3y);
      const v4s = vs + a3s * h, v4y = vy + a3y * h;
      const a4s = ax(v4s, v4y), a4y = ay(v4s, v4y);
      s += h * vs + h * h / 6 * (a1s + a2s + a3s);
      y += h * vy + h * h / 6 * (a1y + a2y + a3y);
      vs += h / 6 * (a1s + 2 * a2s + 2 * a3s + a4s);
      vy += h / 6 * (a1y + 2 * a2y + 2 * a3y + a4y);
      n += 1;
    }
    out.t.push(n * h); out.s.push(s); out.y.push(y); out.vs.push(vs); out.vy.push(vy);
  }
  return out;
}

/** 航迹上 t 秒（离机起算）处：位置用三次 Hermite（切线就是速度），速度线性插值。 */
export function TrajectoryAt(traj, t, out = {}) {
  const last = traj.t.length - 1;
  const u = Math.max(0, t) / traj.sampleS;
  const i = Math.min(last - 1, Math.floor(u));
  const f = Math.min(1, u - i), dt = traj.sampleS;
  const f2 = f * f, f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
  out.s = h00 * traj.s[i] + h10 * dt * traj.vs[i] + h01 * traj.s[i + 1] + h11 * dt * traj.vs[i + 1];
  out.y = h00 * traj.y[i] + h10 * dt * traj.vy[i] + h01 * traj.y[i + 1] + h11 * dt * traj.vy[i + 1];
  out.vs = traj.vs[i] + (traj.vs[i + 1] - traj.vs[i]) * f;
  out.vy = traj.vy[i] + (traj.vy[i + 1] - traj.vy[i]) * f;
  return out;
}

/** 落下 dropM 米用多久、这期间沿航向前冲多远（平地上的「投弹前冲距离」）。 */
export function FlatDrop(traj, dropM) {
  const n = traj.y.length;
  let i = 1;
  while (i < n - 1 && traj.y[i] > -dropM) i += 1;
  let lo = traj.t[i - 1], hi = traj.t[i];
  const p = {};
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (TrajectoryAt(traj, mid, p).y > -dropM) lo = mid; else hi = mid;
  }
  TrajectoryAt(traj, hi, p);
  return { fallS: hi, rangeM: p.s, vs: p.vs, vy: p.vy };
}

/**
 * 这颗弹在哪一刻、哪一点落地。Place(t) → 离机 t 秒时的世界坐标 {x, y, z}（调用方把相对航迹、
 * 离机点、航向与散布套好）；Ground(x, z) → 地面高。先按平地估一次，再割线逼近
 * f(t) = y(t) − ground(x(t), z(t)) = 0（地面起伏平缓，四五次地面查询就收敛到厘米）。
 */
export function GroundImpact(traj, Place, Ground, { originY, guessGround, maxIter = 6, tolM = 0.01 } = {}) {
  const tEnd = traj.t[traj.t.length - 1];
  const Gap = (t) => { const p = Place(Math.min(t, tEnd)); return p.y - Ground(p.x, p.z); };
  let t1 = FlatDrop(traj, Math.max(1, originY - guessGround)).fallS;
  let f1 = Gap(t1);
  let t0 = Math.max(0.05, t1 - 0.25), f0 = Gap(t0);
  for (let i = 0; i < maxIter && Math.abs(f1) > tolM; i += 1) {
    const slope = (f1 - f0) / Math.max(1e-6, t1 - t0);
    const next = slope < -1e-6 ? t1 - f1 / slope : t1 + 0.1;
    t0 = t1; f0 = f1;
    t1 = Math.max(0.05, Math.min(tEnd, next));
    f1 = Gap(t1);
  }
  return t1;
}

/**
 * 弹体姿态：尾翼把弹头拉向来流（相对气流）方向，离机那一刻的扰动按带阻尼的风标振荡衰减。
 * pathPitch = 航迹倾角（机头朝下为正）；pitch / yaw 在它上面各叠一条衰减振荡（相位按 seed 错开）。
 */
export function BombAttitude(vs, vy, sinceS, seed = 0, W = BOMB_PHYSICS.wobble) {
  const pathPitch = Math.atan2(-vy, Math.max(1e-6, vs));
  const amp = W.amplitudeDeg * Math.PI / 180 * Math.exp(-Math.max(0, sinceS) / W.decayS);
  const w = 2 * Math.PI * W.hz * sinceS;
  return {
    pathPitch,
    pitch: pathPitch + amp * Math.sin(w + seed * 6.283),
    yaw: amp * 0.7 * Math.sin(w * 1.13 + seed * 11.7),
  };
}

/**
 * 装药 chargeKg 的落地尺度（米、米每秒）。立方根缩放：两颗弹的装药差五倍，尺寸差 ∛5 ≈ 1.7 倍。
 */
export function BlastScale(chargeKg, P = BOMB_PHYSICS) {
  const B = P.blast;
  const w = Math.max(0.1, Number(chargeKg) || 0);
  const cube = Math.cbrt(w);
  const craterR = B.craterK * cube;
  const ejectaRef = Math.sqrt(P.gravity * craterR);
  const ejectaV = [B.ejecta[0] * ejectaRef, B.ejecta[1] * ejectaRef];
  return {
    chargeKg: w, cube,
    visualRadius: B.visualK * cube,
    craterR,
    ejectaV,
    /** 最快的抛射土竖直上去能到多高（真空上限；土团有阻尼，画面上低一些）。 */
    ejectaTopM: ejectaV[1] * ejectaV[1] / (2 * P.gravity),
    columnV: [B.columnU[0] * ejectaV[1], B.columnU[1] * ejectaV[1]],
    shockR: B.shockZ * cube,
    surgeR: B.surgeK * cube,
  };
}

/** 线性阻尼 + 恒加速度的闭式弹道（与 Script_Vfx 粒子着色器同一个式子）：p(t)、v(t)。 */
export function LinearDragAt(p0, v0, a, k, t, out = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }) {
  const kk = Math.max(0.05, k);
  const e = Math.exp(-kk * t), f = (1 - e) / kk;
  out.x = p0.x + (v0.x - a.x / kk) * f + a.x * t / kk;
  out.y = p0.y + (v0.y - a.y / kk) * f + a.y * t / kk;
  out.z = p0.z + (v0.z - a.z / kk) * f + a.z * t / kk;
  out.vx = a.x / kk + (v0.x - a.x / kk) * e;
  out.vy = a.y / kk + (v0.y - a.y / kk) * e;
  out.vz = a.z / kk + (v0.z - a.z / kk) * e;
  return out;
}
