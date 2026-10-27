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

// 2026-10-28 用户：视角转快了会内八、撇脚，甚至两个腿转在一起。改前（同一组输入）：脚尖与胯差到 179°，两脚左右次序倒过来 0.3–1.1 m。
function FastTurn({ yawRate, speed = 0, seconds, osc = 0 }) {
  const gait = new FirstPersonGait(T, RIG);
  const s = { x: 0, z: 0, yaw: 0 };
  const Input = () => ({ playerX: s.x, playerY: 0, playerZ: s.z, anchorX: s.x + Math.sin(s.yaw) * 0.18, anchorZ: s.z + Math.cos(s.yaw) * 0.18,
    aimYaw: s.yaw, grounded: true, crouch: 0, prone: 0, hipHeight: 0.873, legReach: 0.86, ankleHeight: 0.092 });
  for (let i = 0; i < 30; i++) gait.Update(DT, Input());
  let toe = 0, gap = Infinity, t = 0;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames + 90; i++) {
    t += DT;
    if (i < frames) {
      s.yaw += (osc ? Math.cos(t * osc * 2 * Math.PI) : 1) * yawRate * DEG * DT;
      s.x += -Math.sin(s.yaw) * speed * DT; s.z += -Math.cos(s.yaw) * speed * DT;
    }
    gait.Update(DT, Input());
    // 左右次序沿「腿的朝向」量：站着 = 胯朝向，走动中 = 移动方向（见 FirstPersonGait._UpdateLegHeading）
    const lx = -Math.cos(gait.legHeading), lz = Math.sin(gait.legHeading);
    const [L, R] = gait.feet;
    gap = Math.min(gap, (L.x - R.x) * lx + (L.z - R.z) * lz);
    gait.feet.forEach((f, k) => {
      if (f.planted) toe = Math.max(toe, Math.abs(WrapAngle(f.yaw - gait.lowerYaw - (k === 0 ? 1 : -1) * T.toeOutDeg * DEG)));
    });
  }
  return { toe: toe / DEG, gap, settled: gait.feet.every((f) => f.planted) && Math.abs(gait.twist) < T.idleDeadzoneDeg * DEG };
}
for (const [label, spec] of [
  ["站着 720°/s 甩半圈", { yawRate: 720, seconds: 0.5 }],
  ["站着 360°/s 转一整圈", { yawRate: 360, seconds: 1 }],
  ["站着左右来回甩 ±400°/s", { yawRate: 400, seconds: 2, osc: 2 }],
  ["3.05 m/s 走着 300°/s 转", { yawRate: 300, speed: 3.05, seconds: 1.2 }],
  ["5.25 m/s 冲刺 400°/s 转", { yawRate: 400, speed: 5.25, seconds: 1 }],
  ["2.5 m/s 走着来回甩", { yawRate: 300, speed: 2.5, seconds: 2, osc: 1.5 }],
]) {
  Check(`快速转视角：${label}——着地脚尖与胯差 ≤ ${T.footTwistLimitDeg}°、两脚不交叉（左右至少隔 ${T.minFootGapM} m）、停下后站稳`, () => {
    const r = FastTurn(spec);
    assert.ok(r.toe <= T.footTwistLimitDeg + 0.5, `toe ${r.toe.toFixed(1)}°`);
    assert.ok(r.gap >= T.minFootGapM - 1e-3, `gap ${r.gap.toFixed(3)} m`);
    assert.ok(r.settled, "feet settle after the turn");
  });
}

// 2026-10-28 用户：低头看横移跑，大腿抽搐、像拌脚，前后走不会。改前（同一组输入）：后脚追上前脚被「左右至少隔 minFootGapM」
// 卡在半空 66–86 帧，前脚一抬两只脚一帧跳 0.43–0.52 m。现在横移时胯往移动方向打开、腿斜着迈，摆动的脚一帧挪多远与往前跑同一量级。
function SwingSmoothness({ speed, dirDeg }) {
  const gait = new FirstPersonGait(T, RIG);
  const s = { x: 0, z: 0, vx: 0, vz: 0 };
  const Input = () => ({ playerX: s.x, playerY: 0, playerZ: s.z, anchorX: s.x, anchorZ: s.z + 0.18, aimYaw: 0,
    grounded: true, crouch: 0, prone: 0, hipHeight: 0.873, legReach: 0.86, ankleHeight: 0.092 });
  for (let i = 0; i < 30; i++) gait.Update(DT, Input());
  let last = gait.feet.map((f) => ({ ...f })), worst = 0, frozen = 0;
  for (let i = 0; i < 300; i++) {
    const d = dirDeg * DEG, k = 1 - Math.exp(-DT * 12);   // 玩家速度按指数追到目标（起步有加速）
    s.vx += (-Math.sin(d) * speed - s.vx) * k; s.vz += (-Math.cos(d) * speed - s.vz) * k;
    s.x += s.vx * DT; s.z += s.vz * DT;
    gait.Update(DT, Input());
    gait.feet.forEach((f, j) => {
      const move = Math.hypot(f.x - last[j].x, f.z - last[j].z);
      if (f.swing && last[j].swing) { worst = Math.max(worst, move); if (gait.moving && move < 1e-4) frozen++; }
      last[j] = { ...f };
    });
  }
  return { worst, frozen };
}
for (const speed of [2.5, 3.05, 5.25]) {
  Check(`横移 ${speed} m/s：摆动的脚不卡在半空、不一帧跳一大截（与往前跑比）`, () => {
    const ahead = SwingSmoothness({ speed, dirDeg: 0 });
    for (const dirDeg of [90, -90]) {
      const r = SwingSmoothness({ speed, dirDeg });
      assert.equal(r.frozen, 0, `swing foot frozen ${r.frozen} frames (dir ${dirDeg})`);
      assert.ok(r.worst <= ahead.worst * 1.3 + 0.01, `swing moved ${r.worst.toFixed(3)} m in a frame vs ${ahead.worst.toFixed(3)} ahead (dir ${dirDeg})`);
    }
  });
}

Check("直走、慢转（死区内）时不触发脚跟着胯拧 / 推开", () => {
  const { gait, s, Step } = Sim();
  for (let i = 0; i < 20; i++) Step();
  for (let i = 0; i < 240; i++) { s.z -= 3.05 * DT; if (i < 40) s.yaw += 0.5 * DEG; Step(); }
  assert.equal(gait.pivots, 0, `pivots ${gait.pivots}`);
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
