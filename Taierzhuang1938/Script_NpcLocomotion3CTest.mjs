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
  NPC_3C, XBOT_UPPER_BODY_TURN_MASK_BONES, WrapAngle,
  ComputeLocomotion2D, FootLockController, TurnInPlaceController, EvaluateSpineAimDistribution, EvaluateAimOffsetGridWeights, EvaluateAdditiveFireRecoil,
} from "./Script_NpcLocomotion3C.mjs";
import { XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE, XBOT_AIM_OFFSET } from "./Data_BlockoutXBotClips.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;
const results = [];

function Check(name, fn) {
  try { fn(); results.push(`ok   ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

// 1. UE5 Lyra Cardinal Orientation Warping (Zero Double-Rotation + 100% Full Stride)
Check("UE5 四向主干 + 精准朝向扭曲：任意方向脚步合成角误差 0°、步幅 100% 不缩水", () => {
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

  // 检验 360° 多个典型斜向角：主干基角 - pelvisWarpRad === moveAngle（零双倍偏转！）
  const baseDeg = { forward: 0, right: 90, backward: 180, left: -90 };
  for (const deg of [0, 30, 45, 70, 90, 120, 135, 180, -30, -45, -70, -90, -135]) {
    const r = deg * DEG;
    const res = ComputeLocomotion2D({ vx: Math.sin(r) * 2.5, vz: -Math.cos(r) * 2.5, yaw: 0, aimWeight: 1 });
    assert.equal(res.wPrimary, 1, `full unshrunk stride at ${deg}°`);
    const effectiveDeg = WrapAngle((baseDeg[res.primary] * DEG) - res.pelvisWarpRad) / DEG;
    const err = Math.abs(WrapAngle((effectiveDeg - deg) * DEG)) / DEG;
    assert.ok(err < 0.05, `zero double-rotation at ${deg}° (got effective ${effectiveDeg.toFixed(1)}°, err=${err.toFixed(3)}°)`);
  }

  // 角色转向 90°（yaw=+π/2，正面朝 -X，右侧朝 -Z）：往 -Z 移动应识别为向右横移
  const rotatedRight = ComputeLocomotion2D({ vx: 0, vz: -2.0, yaw: Math.PI / 2, aimWeight: 1 });
  assert.equal(rotatedRight.primary, "right");
});

Check("走 / 跑速度回差防边界抖动", () => {
  const walk = ComputeLocomotion2D({ vx: 0, vz: -1.5, yaw: 0, running: false });
  assert.equal(walk.running, false, "1.5 m/s from walk stays walk");
  const enterRun = ComputeLocomotion2D({ vx: 0, vz: -1.8, yaw: 0, running: false });
  assert.equal(enterRun.running, true, "1.8 m/s enters run");
  const stayRun = ComputeLocomotion2D({ vx: 0, vz: -1.5, yaw: 0, running: true });
  assert.equal(stayRun.running, true, "1.5 m/s from run stays run (hysteresis)");
  const exitRun = ComputeLocomotion2D({ vx: 0, vz: -1.2, yaw: 0, running: true });
  assert.equal(exitRun.running, false, "1.2 m/s exits run");
});

// 2. Orientation Warping & Foot Locking
Check("Orientation Warping：斜前右移骨盆负偏航（向右扭）、斜前左移正偏航（向左扭）", () => {
  const fr = ComputeLocomotion2D({ vx: 1.0, vz: -1.732, yaw: 0, aimWeight: 1 }); // +30° 右前
  assert.ok(Math.abs(fr.pelvisWarpRad / DEG - (-30)) < 0.5, `fr warp ${fr.pelvisWarpRad / DEG}°`);
  const fl = ComputeLocomotion2D({ vx: -1.0, vz: -1.732, yaw: 0, aimWeight: 1 }); // -30° 左前
  assert.ok(Math.abs(fl.pelvisWarpRad / DEG - 30) < 0.5, `fl warp ${fl.pelvisWarpRad / DEG}°`);
  assert.ok(Math.abs(fr.pelvisWarpRad + fl.pelvisWarpRad) < 1e-6, "symmetric warp");

  // 卧倒绝不做骨盆扭曲
  const prone = ComputeLocomotion2D({ vx: 0.5, vz: -0.5, yaw: 0, stance: "prone" });
  assert.equal(prone.pelvisWarpRad, 0);
});

Check("FootLockController：支撑期磁吸锁地零滑移，抬脚摆腿平滑释放", () => {
  const fl = new FootLockController();
  const dt = 1 / 60;
  // 模拟在跑步机上（地面以 vx=2.4 m/s 向 -X 滚）脚踩地，但原始动画脚慢了 30%（产生滑移）
  let lockX = 0.25, animX = 0.25;
  let last = null;
  for (let i = 0; i < 12; i++) {
    if (i > 0) {
      lockX -= 2.4 * dt;      // 真实砖缝位置
      animX -= 1.6 * dt;      // 未校速动画脚位置（每帧滑移！）
    }
    last = fl.UpdateFoot(0, {
      animX, animY: 0.095, animZ: 0, hipX: 0, hipY: 0.90, hipZ: 0,
      ankleRestY: 0.088, maxReachM: 0.88, dt, moving: true, driftX: -2.4 * dt, driftZ: 0,
    });
  }
  assert.equal(last.locked, true, "foot stays locked during stance");
  assert.ok(last.rawAnimSlipCm > 10, `raw anim had >10 cm slip (${last.rawAnimSlipCm} cm)`);
  assert.ok(Math.abs(last.targetX - lockX) < 0.005, `IK target pinned to ground nail within 5mm (err=${Math.abs(last.targetX - lockX) * 1000}mm)`);
  // 抬脚离地 10cm -> 自动释放回摆腿弧线
  const swing = fl.UpdateFoot(0, {
    animX: animX + 0.05, animY: 0.19, animZ: 0, hipX: 0, hipY: 0.90, hipZ: 0,
    ankleRestY: 0.088, maxReachM: 0.88, dt, moving: true, driftX: -2.4 * dt, driftZ: 0,
  });
  assert.equal(swing.locked, false, "foot releases lock on swing liftoff");
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

  // 真实 TurnYawCurve 同拍收敛 + 上半身分层遮罩骨单测
  const tipCurve = new TurnInPlaceController();
  tipCurve.Update(dt, { yaw: 0, mps: 0, stance: "stand", aimWeight: 1 });
  // 一次性转右 60° 触发 standAimRight90，用前重曲线 u^0.5 验证中点消耗 ~71% 而非对称 50%
  const frontLoaded = (_, u) => Math.sqrt(u);
  let cOut = tipCurve.Update(dt, { yaw: -60 * DEG, mps: 0, stance: "stand", aimWeight: 1, sampleTurnFrac: frontLoaded });
  assert.equal(cOut.turning, true);
  assert.equal(cOut.turnClipKey, "standAimRight90");
  // 推到进度 ~0.5
  let midSnap = null;
  for (let i = 0; i < 60; i++) {
    cOut = tipCurve.Update(dt, { yaw: -60 * DEG, mps: 0, stance: "stand", aimWeight: 1, sampleTurnFrac: frontLoaded });
    if (!midSnap && cOut.turnProgress >= 0.48) midSnap = cOut;
  }
  assert.ok(midSnap && Math.abs(midSnap.visualYawOffset) < 22 * DEG, `front-loaded curve consumes ~70% by mid-turn (rem=${(midSnap?.visualYawOffset / DEG)?.toFixed(1)}°)`);
  assert.equal(cOut.turning, false, "curve-driven turn finishes cleanly");
  assert.ok(Math.abs(cOut.visualYawOffset) < 0.5 * DEG);

  assert.ok(XBOT_UPPER_BODY_TURN_MASK_BONES.includes("Spine2") && XBOT_UPPER_BODY_TURN_MASK_BONES.includes("RightHand"));
  assert.ok(!XBOT_UPPER_BODY_TURN_MASK_BONES.includes("Hips") && !XBOT_UPPER_BODY_TURN_MASK_BONES.includes("LeftUpLeg"));
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

// 6. 9 帧精修端枪 Aim Offset 网格权重与 BlenderMCP 烘焙资产校验
Check("EvaluateAimOffsetGridWeights：四角、中心、半角双线性权重与蹲姿限位准确", () => {
  const ul = EvaluateAimOffsetGridWeights({ yawRad: 75 * DEG, pitchRad: 50 * DEG });
  assert.equal(ul.f00, 0);
  assert.ok(ul.u === 0 && ul.v === 0, "UpLeft hits frame 0 with u=0, v=0");

  const dr = EvaluateAimOffsetGridWeights({ yawRad: -75 * DEG, pitchRad: -45 * DEG });
  assert.equal(dr.f11, 8);
  assert.ok(dr.u === 1 && dr.v === 1, "DownRight hits frame 8 with u=1, v=1");

  const center = EvaluateAimOffsetGridWeights({ yawRad: 0, pitchRad: 0 });
  const centerWeight =
    (center.f00 === 4 ? (1 - center.u) * (1 - center.v) : 0) +
    (center.f01 === 4 ? center.u * (1 - center.v) : 0) +
    (center.f10 === 4 ? (1 - center.u) * center.v : 0) +
    (center.f11 === 4 ? center.u * center.v : 0);
  assert.ok(Math.abs(centerWeight - 1) < 1e-6, `Center (0,0) puts 100% weight on refFrame 4 (got ${centerWeight})`);

  const mid = EvaluateAimOffsetGridWeights({ yawRad: 37.5 * DEG, pitchRad: 25 * DEG });
  assert.deepEqual([mid.f00, mid.f01, mid.f10, mid.f11], [0, 1, 3, 4]);
  assert.ok(Math.abs(mid.u - 0.5) < 1e-6 && Math.abs(mid.v - 0.5) < 1e-6);

  const crouchClamp = EvaluateAimOffsetGridWeights({ yawRad: 0, pitchRad: -45 * DEG, stance: "crouch" });
  assert.ok(crouchClamp.pitchDeg >= -18.01, `crouch pitch clamped >= -18° (got ${crouchClamp.pitchDeg}°)`);
});

Check("Animation_RifleAimOffset9.glb：9 帧完整、下半身零漂移、含烘焙元数据且体积可控", () => {
  const glbPath = path.join(here, "Animation/Mixamo", XBOT_AIM_OFFSET.file);
  assert.ok(fs.existsSync(glbPath), `missing baked Aim Offset GLB: ${glbPath}`);
  const buf = fs.readFileSync(glbPath);
  assert.ok(buf.length > 10000 && buf.length < 256 * 1024, `compact GLB size (${buf.length} bytes)`);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "valid glTF magic header");
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  assert.ok(gltf.animations?.length >= 1, "contains animation");
  const anim = gltf.animations[0];
  for (const upperBone of ["Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm"]) {
    const ni = gltf.nodes.findIndex((n) => n.name === upperBone);
    assert.ok(ni >= 0, `node ${upperBone} exists`);
    const ch = anim.channels.find((c) => c.target.node === ni && c.target.path === "rotation");
    assert.ok(ch, `rotation channel for ${upperBone}`);
    const acc = gltf.accessors[anim.samplers[ch.sampler].input];
    assert.equal(acc.count, 9, `${upperBone} has 9 pose keyframes`);
  }
  // 校验 scene extras 里记录的 9 帧质检报告：每帧下半身零漂移且握距误差 < 5 mm
  const extrasStr = gltf.scenes?.[0]?.extras?.tz_aim_offset;
  assert.ok(extrasStr, "scene extras tz_aim_offset present");
  const meta = JSON.parse(extrasStr);
  assert.equal(meta.refFrame, 4);
  assert.equal(meta.poses.length, 9);
  for (const p of meta.poses) {
    assert.ok(p.maxLegDeltaDeg < 1e-3, `frame ${p.frame} leg delta ${p.maxLegDeltaDeg}°`);
    assert.ok(p.gripErrMm < 5.0, `frame ${p.frame} grip error ${p.gripErrMm} mm`);
  }
});

console.log(results.join("\n"));
if (process.exitCode) console.log("NpcLocomotion3CTest FAILED");
else console.log("NpcLocomotion3CTest passed");
