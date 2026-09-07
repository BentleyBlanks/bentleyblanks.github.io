// Script_CameraShakeTest.mjs — 相机震动的纯 Node 回归：创伤会漏、弹簧会回、幅度有顶、
// 距离与遮挡会衰减、扑沟是一记向下的栽、同种子同画面。
import assert from "node:assert/strict";
import { CameraShake } from "./Script_CameraShake.mjs";
import { CAMERA_SHAKE } from "./Data_Tuning_Player.mjs";

function Run(shake, seconds, dt = 1 / 60) {
  let peak = 0;
  for (let t = 0; t < seconds; t += dt) {
    shake.Update(dt);
    peak = Math.max(peak, Math.abs(shake.pitch), Math.abs(shake.yaw), Math.abs(shake.roll));
  }
  return peak;
}

// 什么都没发生：五个偏移全零，不算 Active。
{
  const s = new CameraShake();
  Run(s, 1);
  assert.equal(s.pitch, 0); assert.equal(s.yaw, 0); assert.equal(s.roll, 0); assert.equal(s.rise, 0);
  assert.equal(s.Active, false, "空闲时不该在动");
}

// 爆炸：贴脸最重、按距离衰减、超出触及范围完全没有；隔墙打折。
{
  const reach = 6 * 1.9;
  const s = new CameraShake();
  const near = s.Explosion(1, reach); s.Reset();
  const mid = s.Explosion(reach * 1.5, reach); s.Reset();
  const far = s.Explosion(reach * CAMERA_SHAKE.explosion.reachScale + 1, reach); s.Reset();
  const walled = s.Explosion(1, reach, true);
  assert.ok(near > mid && mid > 0, `震感随距离衰减 near=${near} mid=${mid}`);
  assert.equal(far, 0, "触及范围之外没有感觉");
  assert.ok(walled < near && walled > 0, "隔墙打折但还有");
}

// 创伤会漏、幅度封顶、最终回零。
{
  const s = new CameraShake();
  s.AddTrauma(5);
  assert.equal(s.trauma, 1, "创伤钳在 1");
  const peak = Run(s, 0.25);
  const cap = Math.max(CAMERA_SHAKE.maxPitchRad, CAMERA_SHAKE.maxYawRad, CAMERA_SHAKE.maxRollRad) + 1e-6;
  assert.ok(peak > 0.004, `满创伤时画面确实在抖 peak=${peak}`);
  assert.ok(peak <= cap, `幅度不超过表里的顶 peak=${peak} cap=${cap}`);
  Run(s, 3);
  assert.equal(s.trauma, 0, "三秒后创伤漏光");
  assert.equal(s.Active, false, "漏光后不再 Active");
}

// 近失弹连扫封顶：一百发也抖不成糊。
{
  const s = new CameraShake();
  for (let i = 0; i < 100; i += 1) s.NearMiss(0.5);
  assert.ok(s.trauma <= CAMERA_SHAKE.nearMiss.maxTrauma + 1e-9, `近失弹创伤封顶 ${s.trauma}`);
}

// 日机弹着：触及范围内才有，封顶。
{
  const s = new CameraShake();
  assert.equal(s.Strafe(CAMERA_SHAKE.strafe.reachM + 1), 0, "弹着太远没感觉");
  for (let i = 0; i < 40; i += 1) s.Strafe(1);
  assert.ok(s.trauma <= CAMERA_SHAKE.strafe.maxTrauma + 1e-9, "扫射创伤封顶");
}

// 落地与中弹是一记冲击：先偏出去，再自己回零，不会越振越大。
{
  const s = new CameraShake();
  s.Landing(1);
  s.Update(1 / 60);
  assert.ok(s.pitch < 0, `落地头一沉（pitch 向下）${s.pitch}`);
  const first = Math.abs(s.pitch);
  Run(s, 0.5);
  const later = Math.abs(s.springs.pitch.x);
  assert.ok(later < first * 0.2, `弹簧半秒内基本回位 ${later} < ${first}`);
  Run(s, 3);
  assert.equal(s.Active, false, "冲击最终停下来");

  const h = new CameraShake();
  h.Hit(1, -1); h.Update(1 / 60);
  assert.ok(h.roll < 0, "从左边挨的一枪往左歪");
}

// 扑沟：向下一栽 + 眼位下沉 + 侧滚左右交替。
{
  const s = new CameraShake();
  s.Dive(); s.Update(1 / 60);
  const firstRoll = s.roll;
  assert.ok(s.pitch < -0.1, `扑沟是一记明显向下的栽 ${s.pitch}`);
  assert.ok(s.rise < -0.02, `眼位跟着沉 ${s.rise}`);
  assert.ok(Math.abs(s.springs.pitch.x) <= CAMERA_SHAKE.maxImpulseRad, "冲击位移不超过顶");
  Run(s, 3);
  s.Dive(); s.Update(1 / 60);
  assert.ok(Math.sign(s.roll) !== Math.sign(firstRoll), "第二次扑沟往另一边滚");
}

// 确定性：同种子同事件序列，逐帧同值。
{
  const a = new CameraShake(CAMERA_SHAKE, 3), b = new CameraShake(CAMERA_SHAKE, 3);
  a.Explosion(2, 10); b.Explosion(2, 10);
  for (let i = 0; i < 30; i += 1) {
    a.Update(1 / 60); b.Update(1 / 60);
    assert.equal(a.pitch, b.pitch); assert.equal(a.roll, b.roll);
  }
  const c = new CameraShake(CAMERA_SHAKE, 4);
  c.Explosion(2, 10); c.Update(1 / 60);
  assert.notEqual(c.pitch, a.springs.pitch.x + (a.pitch - a.springs.pitch.x), "换种子换画面");
}

// 大 dt（切后台回来）不炸：偏移仍有限。
{
  const s = new CameraShake();
  s.Dive(); s.AddTrauma(1);
  s.Update(5);
  assert.ok(Number.isFinite(s.pitch) && Math.abs(s.pitch) < 1, "大步长不发散");
}

console.log("CameraShakeTest OK — 创伤漏光/弹簧回位/幅度封顶/距离与遮挡衰减/扑沟栽向下/确定性");
