// NPC 第三人称 3C 动作核心数学层与 Mixamo 四向 / 原地转身清单门禁（纯 Node，毫秒级）。
//
// 覆盖四大机制：
//   1. 2D Blend Space：前/后/左/右及 45° 斜向权重归一化、走/跑速度回差不抖动；
//   2. Orientation Warping：斜走与无横移动作时骨盆正确朝行进方向扭曲且符号与世界坐标系一致；
//   3. Turn-in-Place：死区内双脚钉死、上身反向补偿等于目标偏航；超死区触发正确方向迈步转身片段，
//      播放结束平滑吃掉偏移；开始移动或瞬移时立刻收拢/归零；
//   4. Mesh-Space Spine Aim Offset + Additive Fire：XBot/Biped 骨架总和正确、蹲姿限制下压绝不折进膝盖、
//      卧姿不动下腰、开火后坐脉冲边界干净；
//   5. 清单核对：XBOT_LOCOMOTION_4WAY 与 XBOT_TURN_IN_PLACE 指向的每个 GLB 均真实存在且已登记。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NPC_3C, WrapAngle,
  ComputeLocomotion2D, TurnInPlaceController, EvaluateSpineAimDistribution, EvaluateAdditiveFireRecoil,
} from "./Script_NpcLocomotion3C.mjs";
import { XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE } from "./Data_BlockoutXBotClips.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;
const results = [];

function Check(name, fn) {
  try { fn(); results.push(`ok   ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

// 1. 2D Blend Space
Check("2D Blend Space：四向基向量与 45° 斜向平滑混合", () => {
  // 朝 -Z（yaw=0）：前 = (0,-2)，右 = (+2,0)，左 = (-2,0)，后 = (0,+2)
  const fwd = ComputeLocomotion2D({ vx: 0, vz: -2.0, yaw: 0, aimWeight: 1 });
  assert.equal(fwd.primary, "forward");
  assert.equal(fwd.secondary, null);
  assert.ok(Math.abs(fwd.wPrimary - 1) < 1e-6);

  const right = ComputeLocomotion2D({ vx: 2.0, vz: 0, yaw: 0, aimWeight: 1 });
  assert.equal(right.primary, "right");
  assert.equal(right.secondary, null);

  const left = ComputeLocomotion2D({ vx: -2.0, vz: 0, yaw: 0, aimWeight: 1 });
  assert.equal(left.primary, "left");

  const back = ComputeLocomotion2D({ vx: 0, vz: 2.0, yaw: 0, aimWeight: 1 });
  assert.equal(back.primary, "backward");

  const diagFR = ComputeLocomotion2D({ vx: 1.5, vz: -1.5, yaw: 0, aimWeight: 1 });
  assert.ok(new Set([diagFR.primary, diagFR.secondary]).has("forward"));
  assert.ok(new Set([diagFR.primary, diagFR.secondary]).has("right"));
  assert.ok(Math.abs(diagFR.wPrimary - 0.5) < 1e-6 && Math.abs(diagFR.wSecondary - 0.5) < 1e-6);
  assert.ok(Math.abs(diagFR.wPrimary + diagFR.wSecondary - 1) < 1e-6);

  // 角色转向 90°（yaw=+π/2，正面朝 -X，右侧朝 -Z）：往 -Z 移动应识别为向右横移
  const rotatedRight = ComputeLocomotion2D({ vx: 0, vz: -2.0, yaw: Math.PI / 2, aimWeight: 1 });
  assert.equal(rotatedRight.primary, "right");
});

Check("2D Blend Space：走 / 跑速度回差防边界抖动", () => {
  const walk = ComputeLocomotion2D({ vx: 0, vz: -2.1, yaw: 0, running: false });
  assert.equal(walk.running, false, "2.1 m/s from walk stays walk");
  const enterRun = ComputeLocomotion2D({ vx: 0, vz: -2.5, yaw: 0, running: false });
  assert.equal(enterRun.running, true, "2.5 m/s enters run");
  const stayRun = ComputeLocomotion2D({ vx: 0, vz: -2.1, yaw: 0, running: true });
  assert.equal(stayRun.running, true, "2.1 m/s from run stays run (hysteresis)");
  const exitRun = ComputeLocomotion2D({ vx: 0, vz: -1.8, yaw: 0, running: true });
  assert.equal(exitRun.running, false, "1.8 m/s exits run");
});

// 2. Orientation Warping
Check("Orientation Warping：斜前右移骨盆负偏航（向右扭）、斜前左移正偏航（向左扭）", () => {
  const fr = ComputeLocomotion2D({ vx: 1.0, vz: -1.732, yaw: 0, aimWeight: 1 }); // +30° 右前
  assert.ok(fr.pelvisWarpRad < -10 * DEG && fr.pelvisWarpRad > -36 * DEG, `fr warp ${fr.pelvisWarpRad / DEG}°`);
  const fl = ComputeLocomotion2D({ vx: -1.0, vz: -1.732, yaw: 0, aimWeight: 1 }); // -30° 左前
  assert.ok(fl.pelvisWarpRad > 10 * DEG && fl.pelvisWarpRad < 36 * DEG, `fl warp ${fl.pelvisWarpRad / DEG}°`);
  assert.ok(Math.abs(fr.pelvisWarpRad + fl.pelvisWarpRad) < 1e-6, "symmetric warp");

  // 卧倒绝不做骨盆扭曲
  const prone = ComputeLocomotion2D({ vx: 0.5, vz: -0.5, yaw: 0, stance: "prone" });
  assert.equal(prone.pelvisWarpRad, 0);
});

// 3. Turn-in-Place
Check("Turn-in-Place：死区内双脚不动、上身补偿精确抵消；超死区触发迈步转身并收敛", () => {
  const tip = new TurnInPlaceController();
  const dt = 1 / 60;
  let yaw = 0;
  let out = tip.Update(dt, { yaw, mps: 0, stance: "stand", aimWeight: 1 });
  assert.equal(out.turning, false);
  assert.equal(out.visualYawOffset, 0);

  // 左转 30°（死区 44° 内）：脚在世界里不动（visualYawOffset = -30°），上身补偿 +30°
  for (let i = 0; i < 30; i++) {
    yaw += 1 * DEG;
    out = tip.Update(dt, { yaw, mps: 0, stance: "stand", aimWeight: 1 });
  }
  assert.equal(out.turning, false, "no turn inside 44° deadzone");
  assert.ok(Math.abs(out.visualYawOffset - (-30 * DEG)) < 1e-5, `feet planted (${out.visualYawOffset / DEG}°)`);
  assert.ok(Math.abs(out.aimYawCompensation - 30 * DEG) < 1e-5, "upper spine compensates +30°");

  // 继续左转到 60°（超 44° 死区）：触发向左 90° 迈步转身片段
  for (let i = 0; i < 30; i++) {
    yaw += 1 * DEG;
    out = tip.Update(dt, { yaw, mps: 0, stance: "stand", aimWeight: 1 });
  }
  assert.equal(out.turning, true, "turn-in-place triggered beyond 44°");
  assert.equal(out.turnDir, 1, "left turn direction");
  assert.equal(out.turnClipKey, "standAimLeft90");

  // 保持目标朝向不动 1.2 秒：迈步转完，偏移清零回正
  for (let i = 0; i < 72; i++) out = tip.Update(dt, { yaw, mps: 0, stance: "stand", aimWeight: 1 });
  assert.equal(out.turning, false, "turn finished");
  assert.ok(Math.abs(out.visualYawOffset) < 2 * DEG, `offset settled (${out.visualYawOffset / DEG}°)`);

  // 开始移动：未消化完的偏移快速回零
  yaw -= 35 * DEG;
  out = tip.Update(dt, { yaw, mps: 0, stance: "stand", aimWeight: 1 });
  assert.ok(Math.abs(out.visualYawOffset) > 30 * DEG);
  for (let i = 0; i < 40; i++) out = tip.Update(dt, { yaw, mps: 2.0, stance: "stand", aimWeight: 1 });
  assert.ok(Math.abs(out.visualYawOffset) < 1 * DEG, "moving decays visualYawOffset to 0");
});

// 4. Mesh-Space Spine Aim Offset & Additive Fire
Check("Spine Aim Offset：XBot 胸肩承担 ~94% 偏航、蹲姿防前俯折腿、卧姿不动下腰", () => {
  const xAim = EvaluateSpineAimDistribution({ yawRad: 40 * DEG, pitchRad: 20 * DEG, stance: "stand", aimWeight: 1, rigKind: "xbot" });
  const chestYaw = xAim.spine.yaw + xAim.spine1.yaw + xAim.spine2.yaw;
  const totalYaw = chestYaw + xAim.neck.yaw + xAim.head.yaw;
  assert.ok(Math.abs(totalYaw - 40 * DEG) < 1e-5, "total yaw conserved");
  assert.ok(chestYaw / totalYaw > 0.90, `chest+rifle carries >90% yaw when aiming (${(chestYaw / totalYaw * 100).toFixed(1)}%)`);

  const crouchDown = EvaluateSpineAimDistribution({ yawRad: 0, pitchRad: -45 * DEG, stance: "crouch", aimWeight: 1, rigKind: "biped" });
  const spineDown = crouchDown.spine.pitch + crouchDown.spine1.pitch + crouchDown.spine2.pitch;
  assert.ok(Math.abs(spineDown) < 8 * DEG, `crouch downward spine bend strictly clamped (${spineDown / DEG}°)`);

  const prone = EvaluateSpineAimDistribution({ yawRad: 50 * DEG, pitchRad: -30 * DEG, stance: "prone", aimWeight: 1, rigKind: "xbot" });
  assert.equal(prone.spine.yaw, 0);
  assert.equal(prone.spine1.yaw, 0);
  assert.equal(prone.spine.pitch, 0);
  assert.equal(prone.spine1.pitch, 0);
});

Check("Additive Fire Recoil：起跳快、峰值有限、超时归零", () => {
  const peak = EvaluateAdditiveFireRecoil(NPC_3C.fireDurationS * 0.14);
  assert.equal(peak.active, true);
  assert.ok(peak.weight > 0.95 && peak.kickPitchRad > 0.05);
  const done = EvaluateAdditiveFireRecoil(NPC_3C.fireDurationS + 0.01);
  assert.equal(done.active, false);
  assert.equal(done.weight, 0);
  assert.equal(done.kickPitchRad, 0);
});

// 5. Mixamo 资产引用核验
Check("XBOT_NATIVE / 4WAY / TURN_IN_PLACE 引用的每个 Mixamo GLB 文件均真实存在且已登记", () => {
  const lib = JSON.parse(fs.readFileSync(path.join(here, "Animation/Mixamo/Data_MixamoLibrary.json"), "utf8"));
  const libFiles = new Set(lib.clips.map((c) => c.file));
  const checkFile = (label, file) => {
    assert.ok(fs.existsSync(path.join(here, "Animation/Mixamo", file)), `${label}: missing file ${file}`);
    assert.ok(libFiles.has(file), `${label}: unregistered in Data_MixamoLibrary.json: ${file}`);
  };
  for (const [k, v] of Object.entries(XBOT_NATIVE)) checkFile(`XBOT_NATIVE.${k}`, v.file);
  for (const [g, dirs] of Object.entries(XBOT_LOCOMOTION_4WAY)) {
    for (const [d, v] of Object.entries(dirs)) checkFile(`XBOT_LOCOMOTION_4WAY.${g}.${d}`, v.file);
  }
  for (const [k, v] of Object.entries(XBOT_TURN_IN_PLACE)) checkFile(`XBOT_TURN_IN_PLACE.${k}`, v.file);
});

console.log(results.join("\n"));
if (process.exitCode) console.log("NpcLocomotion3CTest FAILED");
else console.log("NpcLocomotion3CTest passed");
