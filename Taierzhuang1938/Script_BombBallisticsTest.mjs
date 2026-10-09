// Script_BombBallisticsTest.mjs — 航空炸弹外弹道、落地尺度律与 BombBlast 画面排程的纯 Node 门禁（2026-09-28）。
//
// 覆盖：
//   · 外弹道：二次阻力系数与终速、k = 0 时与真空解析解逐位一致、RK4 步长减半收敛到毫米、
//     有阻力时比真空多落一点时间、少飞十几二十米、越落越竖；Hermite 采样在格点上精确；
//   · 地面交点：斜坡地形上割线收敛到厘米；
//   · 尾翼风标摆动逐渐衰减到航迹倾角；
//   · 落地尺度：立方根缩放（装药 ×5 → 尺寸 ×∛5）、抛射速度 ∝ W^(1/6)；
//   · Script_Vfx.BombBlast（真 VfxSystem，不开 WebGL）：只写 bombSmoke 专用池、不碰战斗烟池与碎块池；
//     抛射土团沿「重力 + 线性阻尼」闭式解飞、尾巴按头那一刻的位置延时出生；按 budget 摊薄；
//     一轮最多的那一种（九机 × 四颗 50 kg）装得下专用池；
//   · Script_Aircraft.SetBombs：一组一次绘制、逐颗真尺寸、不够就扩容、预热代理是实例化的。
import assert from "node:assert/strict";
import * as THREE from "three";
import { AERIAL_BOMBS, BOMB_PHYSICS, BOMB_BLAST_VFX } from "./Data_AerialBombs.mjs";
import { FIRST_LEVEL_AIR_RAID as R } from "./Data_FirstLevelAirRaid.mjs";
import { DragK, TerminalVelocity, DropTrajectory, TrajectoryAt, FlatDrop, GroundImpact, BombAttitude, BlastScale, LinearDragAt }
  from "./Script_BombBallistics.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AircraftFlight } from "./Script_Aircraft.mjs";

let passed = 0;
function Ok(name) { passed += 1; console.log(`ok  ${name}`); }
const g = BOMB_PHYSICS.gravity;

// ---------------------------------------------------------------------------
// 1) 外弹道
// ---------------------------------------------------------------------------
{
  const b50 = AERIAL_BOMBS.Bomb50kg, b250 = AERIAL_BOMBS.Bomb250kg;
  const k50 = DragK(b50);
  assert.ok(Math.abs(k50 - 1.225 * 0.25 * Math.PI * 0.01 / 100) < 1e-12, "k = ρ·Cd·A / (2m)");
  const vt50 = TerminalVelocity(b50), vt250 = TerminalVelocity(b250);
  assert.ok(vt50 > 250 && vt50 < 400 && vt250 > vt50, `终速 50 kg ${vt50.toFixed(0)} m/s、250 kg ${vt250.toFixed(0)} m/s（重弹更快）`);
  // k = 0：与真空解析解一致。
  const vac = FlatDrop(DropTrajectory(88, 0, 400), 300);
  assert.ok(Math.abs(vac.fallS - Math.sqrt(2 * 300 / g)) < 1e-6 && Math.abs(vac.rangeM - 88 * vac.fallS) < 1e-6, "k = 0 与真空解一致");
  // 步长减半：前冲距离差不到 1 mm。
  const a = FlatDrop(DropTrajectory(82, DragK(b250), 500, { stepS: 0.01 }), 380);
  const b = FlatDrop(DropTrajectory(82, DragK(b250), 500, { stepS: 0.0025 }), 380);
  assert.ok(Math.abs(a.rangeM - b.rangeM) < 1e-3 && Math.abs(a.fallS - b.fallS) < 1e-4, "RK4 收敛");
  // 有阻力：多落一点时间、少飞十几二十米、落地时比 45° 陡不了多少（平飞投弹是斜着砸进去的）。
  for (const [spec, h, v] of [[b50, 230, 88], [b50, 260, 90], [b250, 380, 82]]) {
    const d = FlatDrop(DropTrajectory(v, DragK(spec), h + 50), h);
    const tv = Math.sqrt(2 * h / g), lag = v * d.fallS - d.rangeM;
    assert.ok(d.fallS > tv && d.fallS < tv * 1.03, `${spec.id} ${h} m：下落 ${d.fallS.toFixed(2)} s（真空 ${tv.toFixed(2)} s）`);
    assert.ok(lag > 8 && lag < 35, `${spec.id} ${h} m：落后机身 ${lag.toFixed(1)} m`);
    const deg = Math.atan2(-d.vy, d.vs) * 180 / Math.PI;
    assert.ok(deg > 30 && deg < 55, `${spec.id} ${h} m：落地角 ${deg.toFixed(0)}°`);
  }
  // Hermite 采样：格点上就是积分值；格点之间连续。
  const traj = DropTrajectory(90, k50, 300);
  const p = TrajectoryAt(traj, traj.t[17], {});
  assert.ok(Math.abs(p.s - traj.s[17]) < 1e-9 && Math.abs(p.y - traj.y[17]) < 1e-9, "Hermite 过格点");
  Ok(`外弹道：终速 ${vt50.toFixed(0)} / ${vt250.toFixed(0)} m/s，250 kg 从 380 m 前冲 ${a.rangeM.toFixed(0)} m`);
}

// ---------------------------------------------------------------------------
// 2) 地面交点（斜坡）、尾翼摆动
// ---------------------------------------------------------------------------
{
  const traj = DropTrajectory(88, DragK(AERIAL_BOMBS.Bomb50kg), 400);
  const Ground = (x, z) => 0.08 * x + 3 * Math.sin(z * 0.05);
  const origin = { x: 0, y: 240, z: 10 };
  const Place = (u) => { const r = TrajectoryAt(traj, u, {}); return { x: origin.x + r.s, y: origin.y + r.y, z: origin.z }; };
  const t = GroundImpact(traj, Place, Ground, { originY: origin.y, guessGround: 0 });
  const at = Place(t);
  assert.ok(Math.abs(at.y - Ground(at.x, at.z)) < 0.02, `斜坡上交点误差 ${(at.y - Ground(at.x, at.z)).toFixed(4)} m`);
  const early = BombAttitude(88, -1, 0.3, 0.2), late = BombAttitude(88, -60, 6, 0.2);
  assert.ok(Math.abs(early.pitch - early.pathPitch) > 0.01, "刚离机摆得明显");
  assert.ok(Math.abs(late.pitch - late.pathPitch) < 0.01 && Math.abs(late.yaw) < 0.01, "几秒后摆动衰减，弹头对准来流");
  Ok(`地面交点：斜坡上 ${t.toFixed(2)} s 落地，误差厘米级；尾翼摆动衰减`);
}

// ---------------------------------------------------------------------------
// 3) 落地尺度：立方根缩放
// ---------------------------------------------------------------------------
{
  const s1 = BlastScale(20), s5 = BlastScale(100);
  const k = Math.cbrt(5);
  for (const key of ["visualRadius", "craterR", "shockR", "surgeR"]) {
    assert.ok(Math.abs(s5[key] / s1[key] - k) < 1e-9, `${key} ×∛5`);
  }
  assert.ok(Math.abs(s5.ejectaV[1] / s1.ejectaV[1] - Math.sqrt(k)) < 1e-9, "抛射速度 ×5^(1/6)");
  const s22 = BlastScale(AERIAL_BOMBS.Bomb50kg.chargeKg);
  assert.ok(s22.visualRadius >= 12 && s22.visualRadius <= 15, `50 kg 级画面半径 ${s22.visualRadius.toFixed(1)} m 与旧版 12–15 m 衔接`);
  assert.ok(s5.ejectaTopM > 50 && s22.ejectaTopM > 30, `抛射顶高 ${s22.ejectaTopM.toFixed(0)} / ${s5.ejectaTopM.toFixed(0)} m`);
  Ok(`落地尺度：50 kg 级 ${s22.visualRadius.toFixed(1)} m / 冲击环 ${s22.shockR.toFixed(0)} m，250 kg 级 ${BlastScale(100).visualRadius.toFixed(1)} m / ${BlastScale(100).shockR.toFixed(0)} m`);
}

// ---------------------------------------------------------------------------
// 4) Script_Vfx.BombBlast：专用池、闭式解、延时出生、摊薄、一轮装得下
// ---------------------------------------------------------------------------
{
  const textureLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
  // 粒子池的 ShaderMaterial 把没用到的混合参数写成 undefined，three 会逐池报一行警告：建池这一下静音。
  const warn = console.warn; console.warn = () => {};
  const scene = new THREE.Scene();
  const vfx = new VfxSystem(scene, null, { quality: "high", maxParticles: 2200 });
  THREE.TextureLoader.prototype.load = textureLoad; console.warn = warn;
  vfx.Update(0.016, null, 10);
  const used = (name) => vfx.pools[name].cursor;
  const before = { smoke: used("smoke"), bomb: used("bombSmoke"), ring: used("ring"), debris: vfx.debris.cursor, streak: used("streak") };
  const info = vfx.BombBlast({ x: 100, y: 5, z: -40 }, { chargeKg: 100, groundY: 5, budget: 1, dirX: 0, dirZ: 1 });
  assert.equal(used("smoke"), before.smoke, "不碰战斗烟池");
  assert.equal(vfx.debris.cursor, before.debris, "不碰碎块池");
  assert.equal(used("streak"), before.streak, "远处的炸弹不撒火星");
  assert.equal(used("ring"), before.ring + 2, "尘环一圈 + 冲击环一圈");
  const n = used("bombSmoke") - before.bomb;
  assert.equal(n, info.streamers * (1 + info.trail) + info.column + info.surge, `弹道专用池写了 ${n} 团`);
  assert.equal(info.cap,1,'aftermath uses one complete 3D explosion field');
  const capSystem=vfx.particles.Get(vfx.particles.volumeBursts.get('GroundExplosion')).system;
  assert.equal(capSystem.particles.length,1);const capParticle=capSystem.particles[0];
  assert.ok(capParticle.birth>capSystem.time&&capParticle.volume.fadeIn>0,'aftermath starts after the impulse and fades in');
  assert.ok(capParticle.life>=BOMB_BLAST_VFX.capLifeS[0]&&capParticle.life<=BOMB_BLAST_VFX.capLifeS[1]);
  assert.equal(capParticle.velocity[0],vfx.wind.x*.7,'aftermath drifts with the wind');
  // 冲击环：外沿按 shockR（可见半径约半宽的 0.72 倍）。
  const ring = vfx.pools.ring.arrays, ri = before.ring + 1;
  assert.ok(Math.abs(ring.iSize[ri * 2 + 1] * 0.72 - info.shockR) < 1e-3, "冲击环外沿到 shockR");
  // 第一条土柱：头在 now 出生、沿闭式解飞；尾巴按头那一刻的位置延时出生。
  const A = vfx.pools.bombSmoke.arrays, h = before.bomb;
  const born = A.iSpawnLife[h * 2], o = { x: A.iOrigin[h * 3], y: A.iOrigin[h * 3 + 1], z: A.iOrigin[h * 3 + 2] };
  const v = { x: A.iVelocity[h * 3], y: A.iVelocity[h * 3 + 1], z: A.iVelocity[h * 3 + 2] };
  const k = A.iParams[h * 4 + 2];
  assert.equal(born, Math.fround(vfx.pools.bombSmoke.system.time), "头在所属粒子系统当前时刻出生");
  assert.ok(A.iAccel[h * 3 + 1] < -9.7, "头吃重力");
  const headLife = A.iSpawnLife[h * 2 + 1];
  const land = LinearDragAt(o, v, { x: 0, y: -g, z: 0 }, k, headLife, {});
  assert.ok(Math.abs(land.y - 5) < 0.2, `头寿命 ${headLife.toFixed(2)} s 正好落回地面（${land.y.toFixed(2)}）`);
  for (let m = 1; m <= info.trail; m += 1) {
    const i = h + m;
    const tau = A.iSpawnLife[i * 2] - born;
    assert.ok(tau > 0 && tau < headLife, `尾巴 ${m} 延时 ${tau.toFixed(2)} s 出生`);
    const at = LinearDragAt(o, v, { x: 0, y: -g, z: 0 }, k, tau, {});
    const d = Math.hypot(A.iOrigin[i * 3] - at.x, A.iOrigin[i * 3 + 1] - at.y, A.iOrigin[i * 3 + 2] - at.z);
    assert.ok(d < 1e-2, `尾巴 ${m} 出生在头那一刻的位置（差 ${d.toFixed(4)} m）`);
  }
  // 斜着砸进去（弹着方向 +Z）：土柱的水平初速平均偏向下游。
  let sumZ = 0;
  for (let s = 0; s < info.streamers; s += 1) sumZ += A.iVelocity[(h + s * (1 + info.trail)) * 3 + 2];
  assert.ok(sumZ > 0, "下游一侧抛得多");
  // 摊薄：budget 0.4 时团数明显少。
  const c0 = used("bombSmoke");
  const thin = vfx.BombBlast({ x: 0, y: 0, z: 0 }, { chargeKg: 100, groundY: 0, budget: 0.4 });
  const nThin = used("bombSmoke") - c0;
  assert.ok(nThin < n * 0.6 && thin.streamers < info.streamers, `摊薄到 ${nThin} 团（满额 ${n}）`);
  // 一轮最多的那几种：按 Script_FirstLevelAirRaid 给的 budget，一轮的团数装得下专用池（高、低画质）。
  for (const quality of ["high", "low"]) {
    const scaleQ = quality === "low" ? 0.45 : 1;
    const cap = BOMB_BLAST_VFX.poolCapacity[quality];
    for (const F of Object.values(R.formations)) {
      const spec = AERIAL_BOMBS[F.load.bomb], bombs = F.slots.length * F.load.count;
      const budget = Math.min(1, R.impact.detailBombs / bombs), s = BlastScale(spec.chargeKg), V = BOMB_BLAST_VFX;
      const c = (base) => Math.max(1, Math.round(base * scaleQ * budget));
      const trail = Math.max(1, Math.round(V.trailPuffs * Math.min(1, scaleQ * budget + 0.3)));
      const per = c(V.streamerBase + V.streamerPerCube * s.cube) * (1 + trail);
      assert.ok(per * bombs <= cap * 1.05, `${quality} ${F.aircraft}×${F.slots.length}：一轮 ${per * bombs} 团 ≤ 池 ${cap}`);
      assert.ok(bombs<=96,'the complete aftermath volley fits its shared particle system');
    }
  }
  vfx.Update(0.016, null, 11);
  assert.ok(vfx.pools.bombSmoke.geometry.instanceCount > 0, "专用池在画");
  vfx.ClearParticles();
  assert.equal(vfx.pools.bombSmoke.geometry.instanceCount, 0, "清粒子时专用池一起清");
  // 与 smoke 池同一个着色器程序（同 defines、同源码）：不多编一个 program。
  assert.equal(vfx.pools.bombSmoke.material.vertexShader, vfx.pools.smoke.material.vertexShader);
  assert.deepEqual(vfx.pools.bombSmoke.material.defines, vfx.pools.smoke.material.defines);
  vfx.Dispose();
  Ok(`BombBlast：250 kg 级一颗 ${n} 团（${info.streamers} 条抛射土柱 × ${1 + info.trail}、中心 ${info.column}、底涌 ${info.surge}、久留 ${info.cap}），摊薄到 ${nThin}`);
}

// ---------------------------------------------------------------------------
// 5) Script_Aircraft.SetBombs：一组一次绘制、逐颗真尺寸、扩容、预热代理
// ---------------------------------------------------------------------------
{
  const air = Object.create(AircraftFlight.prototype);
  air.group = new THREE.Group(); air.forms = [];
  const spec = AERIAL_BOMBS.Bomb250kg;
  air.SetBombs("k", [{ x: 1, y: 200, z: 3, dirX: 0, dirZ: 1, pitch: 0.6, lengthM: spec.lengthM, radiusM: spec.diameterM / 2, scale: 2 }]);
  const set = air.bombSets.get("k");
  assert.ok(set.mesh.isInstancedMesh && set.mesh.count === 1 && set.mesh.parent === air.group, "一只 InstancedMesh");
  const m = new THREE.Matrix4(); set.mesh.getMatrixAt(0, m);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); m.decompose(pos, q, sc);
  assert.ok(Math.abs(sc.z - spec.lengthM * 2) < 1e-6 && Math.abs(sc.x - spec.diameterM) < 1e-6, "真尺寸 × 像素补足倍率");
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  assert.ok(nose.z > 0.5 && nose.y < -0.4, "弹头朝航向、往下扎（pitch 0.6）");
  const g0 = air.BombGeometry(); g0.computeBoundingBox();
  assert.ok(Math.abs(g0.boundingBox.min.z + 0.5) < 1e-6 && Math.abs(g0.boundingBox.max.z - 0.5) < 1e-6, "单位弹体全长 1");
  air.SetBombs("k", Array.from({ length: 36 }, (_, i) => ({ x: i, y: 100, z: 0, dirX: 1, dirZ: 0, pitch: 0.2, lengthM: 1.1, radiusM: 0.1 })));
  assert.ok(air.bombSets.get("k").capacity >= 36 && air.bombSets.get("k").mesh.count === 36, "一轮三十六颗扩容后一次画完");
  air.SetBombs("k", []);
  assert.equal(air.bombSets.get("k").mesh.parent, null, "空 list 收起");
  const warm = air.WarmProxy();
  assert.ok(warm.children.some((c) => c.isInstancedMesh && c.material === air.BombMaterial()), "预热代理是实例化的炸弹");
  Ok("SetBombs：一组一次绘制、真尺寸、按需扩容、实例化预热");
}

console.log(`BombBallisticsTest：${passed} 组通过`);
