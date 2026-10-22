// 第一人称下半身规划器（Script_FirstPersonGait）的纯 node 闸门：
//   1. 站着转视角不超过死区：胯不转、脚一步不挪；超过死区：脚挪几步把胯转过去，上身拧角回到死区以内。
//   2. 走 / 跑 / 冲刺 / 蹲走 / 横移 / 后退：着地的脚在世界里零滑动；两脚轮流迈；每秒步数与表一致；
//      每一步跨的距离 ≈ 速度 ÷ 步频（距离匹配）。
//   3. 停步后脚收回脚位、不再挪；瞬移后脚直接落到新位置。
import assert from "node:assert/strict";
import { FirstPersonGait, WrapAngle, Interp } from "./Script_FirstPersonGait.mjs";
import { FIRST_PERSON_BODY as T } from "./Data_Tuning_FirstPersonBody.mjs";

const RIG = { feet: [{ x: 0.078, z: -0.057 }, { x: -0.078, z: -0.056 }] };
const DT = 1 / 60;
const DEG = Math.PI / 180;

function Sim({ yaw = 0, eyeLead = 0.18 } = {}) {
  const gait = new FirstPersonGait(T, RIG);
  const s = { x: 0, y: 0, z: 0, yaw, crouch: 0, prone: 0, grounded: true };
  const Input = () => ({
    playerX: s.x, playerY: s.y, playerZ: s.z,
    anchorX: s.x + Math.sin(s.yaw) * eyeLead, anchorZ: s.z + Math.cos(s.yaw) * eyeLead,
    aimYaw: s.yaw, grounded: s.grounded, crouch: s.crouch, prone: s.prone,
  });
  const Step = () => gait.Update(DT, Input());
  Step();
  return { gait, s, Step };
}

const results = [];
function Check(name, fn) {
  try { fn(); results.push(`ok   ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

Check("站着转视角 40°（死区内）：胯不转、脚不挪", () => {
  const { gait, s, Step } = Sim();
  for (let i = 0; i < 60; i++) Step();
  const feet = gait.feet.map((f) => [f.x, f.z]);
  const steps = gait.steps;
  for (let i = 0; i < 40; i++) { s.yaw += 1 * DEG; Step(); }
  for (let i = 0; i < 60; i++) Step();
  assert.equal(gait.steps, steps, "no step inside the deadzone");
  assert.ok(Math.abs(gait.lowerYaw) < 1e-9, `hips stay (${gait.lowerYaw})`);
  assert.ok(Math.abs(gait.twist - 40 * DEG) < 1e-6, "upper body twists onto the view");
  gait.feet.forEach((f, i) => assert.ok(Math.hypot(f.x - feet[i][0], f.z - feet[i][1]) < 1e-9, "planted feet never slide"));
});

Check("站着转视角 120°：超过死区后挪步转身，最后胯对上视线", () => {
  const { gait, s, Step } = Sim();
  for (let i = 0; i < 30; i++) Step();
  for (let i = 0; i < 30; i++) { s.yaw += 4 * DEG; Step(); }
  assert.ok(Math.abs(gait.twist) <= T.maxTwistDeg * DEG + 1e-6, "twist clamped");
  for (let i = 0; i < 120; i++) Step();
  assert.ok(gait.steps >= 2, `turning in place takes steps (${gait.steps})`);
  assert.ok(Math.abs(gait.twist) < T.idleSettleDeg * DEG + 1e-6, `hips caught up (${gait.twist / DEG}°)`);
  assert.ok(gait.feet.every((f) => f.planted), "feet settled");
});

function Walk(label, { speed, dirDeg = 0, crouch = 0, seconds = 4 }) {
  Check(`${label} ${speed} m/s：着地零滑动、两脚轮流、步频与步长按速度`, () => {
    const { gait, s, Step } = Sim();
    s.crouch = crouch;
    for (let i = 0; i < 20; i++) Step();
    const dir = s.yaw + dirDeg * DEG;
    const vx = -Math.sin(dir) * speed, vz = -Math.cos(dir) * speed;
    const lands = [];
    let maxSlip = 0, last = gait.feet.map((f) => ({ planted: f.planted, x: f.x, z: f.z }));
    const frames = Math.round(seconds / DT);
    for (let i = 0; i < frames; i++) {
      s.x += vx * DT; s.z += vz * DT; Step();
      gait.feet.forEach((f, k) => {
        if (f.planted && last[k].planted) maxSlip = Math.max(maxSlip, Math.hypot(f.x - last[k].x, f.z - last[k].z));
        if (f.planted && !last[k].planted && i > frames / 4) lands.push({ k, t: i * DT, x: f.x, z: f.z });
        last[k] = { planted: f.planted, x: f.x, z: f.z };
      });
    }
    assert.ok(maxSlip < 1e-9, `planted foot slid ${maxSlip} m`);
    assert.ok(lands.length >= 4, `enough steps (${lands.length})`);
    for (let i = 1; i < lands.length; i++) assert.notEqual(lands[i].k, lands[i - 1].k, "feet alternate");
    const span = lands[lands.length - 1].t - lands[0].t;
    const cadence = (lands.length - 1) / span;
    const expected = Interp(T.cadence, speed);
    assert.ok(Math.abs(cadence - expected) / expected < 0.08, `cadence ${cadence.toFixed(2)} vs ${expected}`);
    // 同一只脚相邻两次落点 = 一个周期走过的距离。
    const same = lands.filter((l) => l.k === lands[0].k);
    const stride = Math.hypot(same[same.length - 1].x - same[0].x, same[same.length - 1].z - same[0].z) / (same.length - 1);
    const strideWant = speed * 2 / expected;
    assert.ok(Math.abs(stride - strideWant) / strideWant < 0.08, `stride ${stride.toFixed(3)} vs ${strideWant.toFixed(3)}`);
    assert.ok(Math.abs(WrapAngle(gait.lowerYaw - s.yaw)) <= T.orientWarpDeg * DEG + 1e-6, "hips within the warp");
    // 停步：脚收回脚位、不再挪。
    for (let i = 0; i < 90; i++) Step();
    assert.ok(gait.feet.every((f) => f.planted), "stopped feet planted");
    const steps = gait.steps;
    for (let i = 0; i < 60; i++) Step();
    assert.equal(gait.steps, steps, "no fidgeting after stopping");
  });
}
Walk("慢走", { speed: 1.2 });
Walk("走（玩家站姿全速）", { speed: 3.05 });
Walk("冲刺", { speed: 5.25 });
Walk("蹲走", { speed: 1.62, crouch: 1 });
Walk("横移", { speed: 2.5, dirDeg: 90 });
Walk("后退", { speed: 2.2, dirDeg: 180 });
Walk("斜前", { speed: 3.05, dirDeg: 45 });

Check("从站定直接起步到 3.05 m/s（横移）：着地的脚始终在腿够得着的范围里", () => {
  const { gait, s, Step } = Sim();
  for (let i = 0; i < 30; i++) Step();
  let worst = 0;
  for (let i = 0; i < 120; i++) {
    s.x += 3.05 * DT; Step();
    const ax = s.x + Math.sin(s.yaw) * 0.18, az = s.z + Math.cos(s.yaw) * 0.18;
    for (const f of gait.feet) if (f.planted) worst = Math.max(worst, Math.hypot(f.x - ax, f.z - az));
  }
  assert.ok(worst < T.maxStanceStretchM + 0.12, `planted foot ${worst.toFixed(3)} m from the hips`);
});

Check("从坑底起步上陡坡（03-1 沟里实测的情形）：锁住的后脚始终在三维腿长以内", () => {
  const gait = new FirstPersonGait(T, RIG);
  const leg = { hipHeight: 0.873, legReach: 0.781 * T.reachFraction + T.maxHeelLiftM, ankleHeight: 0.092 };
  const s = { x: 0, y: -0.83, z: 0 };
  const Input = () => ({ playerX: s.x, playerY: s.y, playerZ: s.z, anchorX: s.x, anchorZ: s.z + 0.18, aimYaw: 0,
    grounded: true, crouch: 0, prone: 0, ...leg });
  for (let i = 0; i < 20; i++) gait.Update(DT, Input());
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    // 2.6 m/s 往前（-z）同时每帧升 2 cm：坡度约 25°
    s.z -= 2.6 * DT; s.y += 0.02; gait.Update(DT, Input());
    const hipY = s.y + leg.hipHeight - T.maxPelvisDropM;
    for (const f of gait.feet) if (f.planted) {
      worst = Math.max(worst, Math.hypot(f.x - s.x, f.z - (s.z + 0.18), hipY - (f.y + leg.ankleHeight)));
    }
  }
  assert.ok(worst < leg.legReach + 0.08, `planted foot ${worst.toFixed(3)} m from the lowered hips (reach ${leg.legReach.toFixed(3)})`);
});

Check("瞬移：脚直接落到新位置", () => {
  const { gait, s, Step } = Sim();
  for (let i = 0; i < 10; i++) Step();
  s.x += 30; Step();
  assert.ok(gait.feet.every((f) => Math.hypot(f.x - s.x, f.z - s.z) < 0.5 && f.planted));
});

Check("腾空收脚、落地站住", () => {
  const { gait, s, Step } = Sim();
  for (let i = 0; i < 10; i++) Step();
  s.grounded = false;
  for (let i = 0; i < 20; i++) Step();
  assert.ok(gait.feet.every((f) => !f.planted && f.lift > 0));
  s.grounded = true; Step();
  assert.ok(gait.feet.every((f) => f.planted && f.lift === 0));
});

console.log(results.join("\n"));
if (process.exitCode) console.log("FirstPersonGaitTest FAILED"); else console.log("FirstPersonGaitTest passed");
