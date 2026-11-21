// 动作衔接对比工具（Tool_MotionCompare.html，2026-11-21）。
//
// 左右同步分屏实机对照 3C 动作系统优化前后（左：优化前旧方案；右：新 3C 体系 + BlenderMCP 9 帧精修 Aim Offset）：
//   01 · 持枪横移与斜向跑动     — 2D Blend Space 相位同步 + Orientation Warping vs 单向播片硬漂
//   02 · 静止持枪原地转身       — Turn-in-Place（±44° 死区锁脚 + 迈步转身 + Hips 偏航剥离）vs 脚底抹油原地自转
//   03 · 9 向精修 Aim Offset   — BlenderMCP 9 帧（Mesh-Space 脊柱 + Local-Space 锁骨/双臂贴腮）vs 无/纯数学脊柱
//   04 · 跑动与横移中开火       — 上半身 Masked Additive 后坐（双腿 0° 透明）vs 切站立开火 0.35 s 冻腿滑冰
//   05 · 综合实战机动           — 掩体警戒 → 扫视 → 迈步转向 → 斜前突击 → 跑动点射 → 停步蹲姿瞄准
//   06 · 第一人称侧向双腿防穿插 — 真 FirstPersonGait 求解器对照（旧 11.8 cm 穿插 vs 新 15.6 cm 净距 + 0 mm 滑步）
//   07 · 自由操控沙盒           — WASD 移动 + Shift 疾跑 + Q/E 转向 + C 蹲站 + F 点射 + 9 宫格瞄准

import * as THREE from "three";
import { clone as CloneSkinned } from "../vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { ManagedGLTFLoader as GLTFLoader } from "../Script_ModelImports.mjs";
import { SetTextureImportRenderer } from "../Script_TextureImports.mjs";
import { LoadModel } from "../Script_MeshLoad.mjs";
import { AimAt } from "../Script_MixamoProps.mjs";
import { XBOT_CHARACTERS } from "../Data_XBotCharacters.mjs";
import { ClipForCharacter } from "../Script_XBotCharacters.mjs";
import { LoadHairGroom, LoadHairAtlas, HairGroom } from "../Script_HairGroom.mjs";
import { XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE, XBOT_AIM_OFFSET } from "../Data_BlockoutXBotClips.mjs";
import {
  NPC_3C, WrapAngle, Clamp, Smooth01,
  ComputeLocomotion2D, TurnInPlaceController, EvaluateSpineAimDistribution,
  EvaluateAimOffsetGridWeights, EvaluateAdditiveFireRecoil,
} from "../Script_NpcLocomotion3C.mjs";
import { FirstPersonGait, ModelToWorld } from "../Script_FirstPersonGait.mjs";
import { FIRST_PERSON_BODY } from "../Data_Tuning_FirstPersonBody.mjs";

const BASE = "./Animation/Mixamo/";
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

const CHAR_KEYS = ["ijaJia", "xbot", "heYouTian", "oldGeng", "ijaYi", "ijaBing"].filter((k) => XBOT_CHARACTERS[k]);

const XBOT_SPINE_CHAIN = [
  ["Spine", "spine"], ["Spine1", "spine1"], ["Spine2", "spine2"], ["Neck", "neck"], ["Head", "head"],
];
const XBOT_AIM_SPINE_BONES = ["Spine", "Spine1", "Spine2", "Neck", "Head"];
const XBOT_AIM_ARM_BONES = [
  ["LeftShoulder", 1.0], ["RightShoulder", 1.0],
  ["LeftArm", 0.85], ["LeftForeArm", 0.85], ["LeftHand", 0.75],
  ["RightArm", 0.85], ["RightForeArm", 0.85], ["RightHand", 0.75],
];
const XBOT_ADDITIVE_FIRE_BONES = new Set([
  "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3",
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandIndex1", "LeftHandIndex2",
]);

const OLD_FP_TUNING = Object.freeze({
  ...FIRST_PERSON_BODY,
  orientWarpDeg: 40,
  strafeWideM: 0,
  strafeLeadBiasM: 0,
  strafeSwingArcM: 0,
});
const FP_RIG = Object.freeze({ feet: [{ x: 0.078, z: -0.057 }, { x: -0.078, z: -0.056 }] });

const RIFLE_MATERIALS = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.45, metalness: 0.6 }),
};

const AIM_GRID_CELLS = [
  { label: "↖ 左上", yaw: 65, pitch: 42 },
  { label: "↑ 正上", yaw: 0, pitch: 42 },
  { label: "↗ 右上", yaw: -65, pitch: 42 },
  { label: "← 正左", yaw: 65, pitch: 0 },
  { label: "· 正中", yaw: 0, pitch: 0 },
  { label: "→ 正右", yaw: -65, pitch: 0 },
  { label: "↙ 左下", yaw: 65, pitch: -36 },
  { label: "↓ 正下", yaw: 0, pitch: -36 },
  { label: "↘ 右下", yaw: -65, pitch: -36 },
];

const CAM_PRESETS = {
  front34: { yaw: 0.56, pitch: 0.20, dist: 4.55, targetY: 0.88 },
  side:    { yaw: 1.50, pitch: 0.14, dist: 4.65, targetY: 0.88 },
  top:     { yaw: 0.15, pitch: 1.24, dist: 4.10, targetY: 0.35 },
  fpDown:  { yaw: 0.38, pitch: 0.76, dist: 2.65, targetY: 0.44 },
};

const SCENARIOS = [
  {
    id: "strafe2d",
    index: "01",
    name: "持枪横移与斜向跑动",
    tag: "2D 混合 + 扭曲",
    hint: "枪口锁定前方靶标，身体斜前/纯侧/斜后连续换向机动",
    defaultCam: "front34",
    captionTitle: "对比要点：脚方向与移动方向是否贴合 · 下盘扭曲与上身反补",
    captionDesc: "左（旧）：只能硬播单条前走/前跑动作横向硬漂，看地面网格就能看出双脚斜着滑步。右（新）：2D Blend Space 四向相位同步 + Orientation Warping 顺势扭胯 ±45° + 上身 9 帧 Aim Offset 反补锁靶。",
    checklist: "观察步骤：注意地面移动网格与脚底的相对方向；也可切「俯视步法」机位，对比青色下盘箭头如何随绿色速度箭头顺势扭转，而黄色枪口箭头纹丝不动。",
  },
  {
    id: "turnInPlace",
    index: "02",
    name: "静止持枪原地转身",
    tag: "Turn-in-Place",
    hint: "目标先在 ±35° 死区内微移，再大角度甩到 ±85° 观察脚步衔接",
    defaultCam: "front34",
    captionTitle: "对比要点：±44° 死区双脚是否纹丝不动 · 超阈值是否真实迈步换脚",
    captionDesc: "左（旧）：目标每动 1° 整个人就像立在电动转盘上的木偶脚底打转。右（新）：±44° 内双脚钉死、只转腰肩头与步枪；超过 44° 触发 Turn90Left/Right 迈步转身并剥离 Hips 偏航角无跳变收敛。",
    checklist: "观察步骤：把慢放切到 0.5x，紧盯双脚和地面网格——左侧一直在地上蹭着转圈，右侧死区内纹丝不动，越过 44° 后清晰迈出左右步把下盘带正。",
  },
  {
    id: "aimOffset9",
    index: "03",
    name: "9 向精修 Aim Offset 对照",
    tag: "Blender 9 帧",
    hint: "自动循环九宫格瞄准，也可点击右侧九宫格或切换「左侧=纯数学脊柱」细品差异",
    defaultCam: "front34",
    captionTitle: "对比要点：右撇子探肩/耸肩/贴腮手肘雕刻 · 双脚 0° 零漂移",
    captionDesc: "左（旧）：无脊柱偏移时枪口根本跟不上靶；切为「纯数学 5 节脊柱」时双肩与肘部仍僵硬死板。右（新）：BlenderMCP 烘焙的 9 帧资产在右瞄时左肩自然前探、抬枪时双锁骨上提、下瞄时抬头保准星。",
    checklist: "建议玩法：在右侧把「左侧 Aim」切到「纯数学 5 节脊柱」，再点九宫格的「→ 正右」和「↑ 正上」，一眼看出 Blender 9 帧在锁骨、肘部和贴腮上的肉眼级提升。",
  },
  {
    id: "moveAndFire",
    index: "04",
    name: "跑动与横移中开火",
    tag: "Additive 开火",
    hint: "斜向冲刺时每 0.8 秒点射一次，重点看开火瞬间双腿是否被冻住滑步",
    defaultCam: "side",
    captionTitle: "对比要点：开火后坐是否打断下半身步态（冻腿滑冰 vs 0° 透明叠加）",
    captionDesc: "左（旧）：每开一枪强制切进站立 FiringRifle 持续 0.35 秒，双腿瞬间急刹冻住，在移动网格上滑出一大截！右（新）：离线提纯上半身 Additive 差值 + 阻尼后坐，双腿步态 100% 不断。",
    checklist: "观察步骤：已默认切到正侧面机位，盯住开火提示亮起的 0.35 秒——左侧双腿僵硬卡住跟着地面打滑，右侧下盘照常大步迈进、只有肩胸和枪向上弹跳回肩。",
  },
  {
    id: "combatSequence",
    index: "05",
    name: "综合实战机动衔接",
    tag: "全链路串联",
    hint: "12 秒完整战斗循环：警戒扫视 → 迈步转向 → 斜前突击 → 跑动点射 → 蹲姿急停瞄准",
    defaultCam: "front34",
    captionTitle: "对比要点：多状态高频切换时的连续流畅度与持枪稳定性",
    captionDesc: "左（旧）：站→转→跑→开火→蹲每一步都有生硬断层、脚底滑移和枪口脱靶。右（新）：五大模块协同工作，从头到尾像同一名受过训练的士兵一气呵成。",
    checklist: "观察步骤：直接完整看一遍 12 秒循环，再切 0.5x 慢放看「斜向突击→开火→急停蹲瞄」那三段交界处。",
  },
  {
    id: "fpStrafeLegs",
    index: "06",
    name: "第一人称侧向走路双腿防穿插",
    tag: "FP 腿距求解",
    hint: "真实 FirstPersonGait 求解器对照：旧参数 11.8 cm 穿插 vs 新参数 15.6 cm 净距",
    defaultCam: "fpDown",
    captionTitle: "对比要点：低头侧向横移时双腿 3D 轴线最小净距与支撑脚 0 滑移",
    captionDesc: "左（旧参数）：骨盆扭曲仅 40° 且无横移步宽与外摆弧，侧移时双腿交错处最小净距跌到 ~11.8 cm（标红警告），低头看脚肉眼可见穿插。右（新参数）：扭曲 54° + 步宽 7.5 cm + 外摆弧 5.5 cm，全程保持 ≥ 15.5 cm 净距且着地 0 mm 滑步。",
    checklist: "观察步骤：注意两腿之间那条实时连线（红 = 过近穿插风险，绿 = 安全净距）；可切换「3/4 前视」或「低头看脚」机位，从玩家本人视角直接验收。",
  },
  {
    id: "sandbox",
    index: "07",
    name: "自由操控沙盒",
    tag: "WASD + F 实操",
    hint: "键盘 WASD 任意走位、Shift 疾跑、Q/E 转向、C 蹲站、F 开火，左右同步响应",
    defaultCam: "front34",
    captionTitle: "自由操控模式：同一份玩家输入同时驱动左右两个角色",
    captionDesc: "按 W/A/S/D 横移或斜跑、Shift 加速、Q/E 旋转朝向、C 切换站蹲、F 点射，也可勾选右侧「手动锁定瞄准角」拖滑杆，亲自用最刁钻的操作测试衔接破绽。",
    checklist: "推荐连招：按住 W+D 斜前跑同时连按 F 点射，再松开方向键按住 Q 缓慢旋转，对比两边脚底、骨盆与枪口表现。",
  },
];

// ---------- Shared Scratch Math ----------
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s2 = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _yawQ = new THREE.Quaternion(), _aimQ = new THREE.Quaternion(), _aimQ2 = new THREE.Quaternion();
const _aimRight = new THREE.Vector3(), _aimFwd = new THREE.Vector3();
const _aoTop = new THREE.Quaternion(), _aoBot = new THREE.Quaternion();
const _aoModelQ = new THREE.Quaternion(), _aoModelQInv = new THREE.Quaternion();
const _addQ0 = new THREE.Quaternion(), _addQ1 = new THREE.Quaternion(), _addDelta = new THREE.Quaternion();
const _idQuat = new THREE.Quaternion();

function Approach(cur, target, dt, tau) {
  if (tau <= 1e-4) return target;
  return cur + (target - cur) * (1 - Math.exp(-Math.max(dt, 0) / tau));
}

function FreshPosition(o, out = new THREE.Vector3()) {
  o.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(o.matrixWorld);
}
function FreshQuaternion(o, out = new THREE.Quaternion()) {
  o.updateWorldMatrix(true, false);
  return o.getWorldQuaternion(out);
}
function Palm(hand, middle, out) {
  const a = FreshPosition(hand, out);
  if (!middle) return a;
  const b = FreshPosition(middle, _v3);
  return a.lerp(b, 0.55);
}
function RotateBoneWorld(bone, deltaWorldQ) {
  bone.parent.updateWorldMatrix(true, false);
  const pQ = bone.parent.getWorldQuaternion(_q2);
  const curW = pQ.clone().multiply(bone.quaternion);
  bone.quaternion.copy(pQ.clone().invert().multiply(deltaWorldQ).multiply(curW)).normalize();
  bone.updateMatrixWorld(true);
}
function SetBoneWorldQuaternion(bone, targetWorldQ) {
  bone.parent.updateWorldMatrix(true, false);
  const pQ = bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(pQ.invert().multiply(targetWorldQ)).normalize();
  bone.updateMatrixWorld(true);
}
function SampleBilinearQuat(arr, w, out) {
  _aoTop.slerpQuaternions(arr[w.f00], arr[w.f01], w.u);
  _aoBot.slerpQuaternions(arr[w.f10], arr[w.f11], w.u);
  return out.slerpQuaternions(_aoTop, _aoBot, w.v).normalize();
}
function SampleAdditiveTrack(track, t, out) {
  const times = track.times, deltas = track.deltas, n = times.length;
  if (n === 0) return out.identity();
  if (t <= times[0] || n === 1) return out.fromArray(deltas, 0);
  if (t >= times[n - 1]) return out.fromArray(deltas, (n - 1) * 4);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 1e-6 ? (t - times[lo]) / span : 0;
  _addQ0.fromArray(deltas, lo * 4);
  _addQ1.fromArray(deltas, hi * 4);
  return out.slerpQuaternions(_addQ0, _addQ1, f);
}
function SampleScalarCurve(curve, t) {
  const times = curve.times, values = curve.values, n = times.length;
  if (n === 0) return 0;
  if (t <= times[0] || n === 1) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 1e-6 ? (t - times[lo]) / span : 0;
  return values[lo] + (values[hi] - values[lo]) * f;
}

/** 两条 3D 线段最近点与距离（用于场景 06 精确测量左右腿三维轴线净距）。 */
function ClosestPointsSegments(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-10 && e <= 1e-10) {
    return { dist: p1.distanceTo(p2), a: p1.clone(), b: p2.clone() };
  }
  if (a <= 1e-10) {
    t = Clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-10) {
      s = Clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = Clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return { dist: c1.distanceTo(c2), a: c1, b: c2 };
}

// ---------- Asset Manager (Shared across Old & New Rigs) ----------
class CompareAssetBank {
  constructor(renderer) {
    this.loader = new GLTFLoader();
    SetTextureImportRenderer(renderer);
    this.xbotSource = null;
    this.rootParent = null;
    this.hipsParentInv = null;
    this.rifleOffset = null;
    this.aimOffsetGrid = null;
    this.rawClips = new Map();
    this.charClips = new Map();
    this.additiveFireCache = new Map();
    this.turnYawCache = new Map();
    this.charSources = new Map();
    this.groomCache = new Map();
    this.hairAtlas = null;
    this.rifles = new Map();
    this.library = new Map();
  }

  async Init(onProgress) {
    onProgress(15, "读取 Mixamo 动作清单与 X Bot 基准骨架…");
    const [xbotGltf, libJson] = await Promise.all([
      this.loader.loadAsync(BASE + "Model_MixamoXBot.glb"),
      fetch(BASE + "Data_MixamoLibrary.json").then((r) => r.json()),
    ]);
    this.xbotSource = xbotGltf.scene;
    for (const c of libJson.clips) this.library.set(c.file, c);
    this.xbotSource.updateMatrixWorld(true);
    const hips = this.xbotSource.getObjectByName("Hips");
    this.rootParent = new THREE.Matrix4().copy(this.xbotSource.matrixWorld).invert().multiply(hips.parent.matrixWorld);
    this.hipsParentInv = this.rootParent.clone().invert();

    onProgress(40, "预载全部四向步态、转身、开火与 9 帧精修 Aim Offset…");
    const requiredClips = new Set([
      XBOT_NATIVE.standIdleRifleAim.file,
      XBOT_NATIVE.standWalkRifle.file,
      XBOT_NATIVE.standWalkRifleAim.file,
      XBOT_NATIVE.standRunRifle.file,
      XBOT_NATIVE.standRunRifleAim.file,
      XBOT_NATIVE.crouchIdleRifleAim.file,
      XBOT_NATIVE.crouchWalkRifle.file,
      XBOT_NATIVE.crouchWalkRifleAim.file,
      XBOT_NATIVE.fireStand.file,
      XBOT_NATIVE.fireCrouch.file,
      ...Object.values(XBOT_LOCOMOTION_4WAY).flatMap((g) => Object.values(g).map((e) => e.file)),
      ...Object.values(XBOT_TURN_IN_PLACE).map((e) => e.file),
    ]);
    await Promise.all([
      ...[...requiredClips].map((f) => this.LoadRawClip(f)),
      this._LoadAimOffsetGrid(),
    ]);
    onProgress(70, "标定步枪握持基准与开火/转身曲线…");
    this._CalibrateRifle();
  }

  async LoadRawClip(file) {
    if (this.rawClips.has(file)) return this.rawClips.get(file);
    const gltf = await this.loader.loadAsync(BASE + file);
    const clip = gltf.animations[0];
    clip.name = file;
    const entry = this.library.get(file);
    const loop = entry?.loop ?? false;
    if (!entry?.inPlace) this._FixRoot(clip, !loop);
    this.rawClips.set(file, clip);
    return clip;
  }

  _FixRoot(clip, pinAll) {
    const track = clip.tracks.find((t) => t.name === "Hips.position");
    if (!track || !this.rootParent) return;
    const v = track.values, n = v.length / 3, model = [];
    for (let i = 0; i < n; i++) model.push(new THREE.Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).applyMatrix4(this.rootParent));
    const first = model[0].clone(), last = model[n - 1].clone();
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? i / (n - 1) : 0;
      if (pinAll) { model[i].x = first.x; model[i].z = first.z; }
      else { model[i].x -= (last.x - first.x) * a; model[i].z -= (last.z - first.z) * a; }
      model[i].applyMatrix4(this.hipsParentInv);
      v.set(model[i].toArray(), i * 3);
    }
  }

  GetClipFor(charKey, file) {
    const key = `${charKey}|${file}`;
    if (this.charClips.has(key)) return this.charClips.get(key);
    const raw = this.rawClips.get(file);
    if (!raw) return null;
    const def = XBOT_CHARACTERS[charKey] || XBOT_CHARACTERS.xbot;
    const adapted = ClipForCharacter(raw, def);
    this.charClips.set(key, adapted);
    return adapted;
  }

  _CalibrateRifle() {
    const model = CloneSkinned(this.xbotSource);
    const clip = this.rawClips.get(XBOT_NATIVE.standIdleRifleAim.file);
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play();
    mixer.update(0);
    model.updateMatrixWorld(true);
    const B = (n) => model.getObjectByName(n);
    const right = Palm(B("RightHand"), B("RightHandMiddle1"), new THREE.Vector3());
    const left = Palm(B("LeftHand"), B("LeftHandMiddle1"), new THREE.Vector3());
    const z = right.clone().sub(left).normalize();
    const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const rifleQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    B("RightHand").matrixWorld.decompose(_p, _q, _s);
    const inv = _q.clone().invert();
    this.rifleOffset = { position: right.sub(_p).applyQuaternion(inv), quaternion: inv.multiply(rifleQ) };
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
  }

  async _LoadAimOffsetGrid() {
    const cfg = XBOT_AIM_OFFSET;
    const gltf = await this.loader.loadAsync(BASE + cfg.file);
    const clip = gltf?.animations?.[0];
    if (!clip) return;
    const model = CloneSkinned(this.xbotSource);
    const bones = new Map();
    model.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    const total = cfg.cols * cfg.rows;
    const worldQ = Array.from({ length: total }, () => new Map());
    const localQ = Array.from({ length: total }, () => new Map());
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    for (let f = 0; f < total; f++) {
      action.time = Math.min(clip.duration, f / cfg.fps);
      mixer.update(0);
      model.updateMatrixWorld(true);
      for (const name of XBOT_AIM_SPINE_BONES) {
        const b = bones.get(name);
        if (!b) continue;
        b.matrixWorld.decompose(wp, wq, ws);
        worldQ[f].set(name, wq.clone().normalize());
      }
      for (const [name] of XBOT_AIM_ARM_BONES) {
        const b = bones.get(name);
        if (b) localQ[f].set(name, b.quaternion.clone().normalize());
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(model);

    const ref = cfg.refFrame;
    const totalDelta = Array.from({ length: total }, () => new Map());
    const meshDelta = new Map();
    for (let i = 0; i < XBOT_AIM_SPINE_BONES.length; i++) {
      const name = XBOT_AIM_SPINE_BONES[i];
      const parentName = i > 0 ? XBOT_AIM_SPINE_BONES[i - 1] : null;
      const qRefInv = worldQ[ref].get(name).clone().invert();
      const arr = [];
      for (let f = 0; f < total; f++) {
        const dw = worldQ[f].get(name).clone().multiply(qRefInv).normalize();
        totalDelta[f].set(name, dw);
        const dParent = parentName ? totalDelta[f].get(parentName) : null;
        const inc = dParent ? dw.clone().multiply(dParent.clone().invert()).normalize() : dw.clone();
        if (inc.w < 0) inc.set(-inc.x, -inc.y, -inc.z, -inc.w);
        arr.push(inc);
      }
      meshDelta.set(name, arr);
    }
    const localDelta = new Map();
    for (const [name] of XBOT_AIM_ARM_BONES) {
      const qRefInv = localQ[ref].get(name).clone().invert();
      const arr = [];
      for (let f = 0; f < total; f++) {
        const dl = qRefInv.clone().multiply(localQ[f].get(name)).normalize();
        if (dl.w < 0) dl.set(-dl.x, -dl.y, -dl.z, -dl.w);
        arr.push(dl);
      }
      localDelta.set(name, arr);
    }
    this.aimOffsetGrid = { cfg, meshDelta, localDelta };
  }

  AdditiveFireTracks(file) {
    if (this.additiveFireCache.has(file)) return this.additiveFireCache.get(file);
    const clip = this.rawClips.get(file);
    if (!clip) return null;
    const tracks = [];
    const q0 = new THREE.Quaternion(), q0Inv = new THREE.Quaternion(), qk = new THREE.Quaternion(), dq = new THREE.Quaternion();
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) continue;
      const boneName = track.name.slice(0, -11);
      if (!XBOT_ADDITIVE_FIRE_BONES.has(boneName)) continue;
      const vals = track.values, count = track.times.length;
      if (count < 1 || vals.length < 4) continue;
      q0.set(vals[0], vals[1], vals[2], vals[3]).normalize();
      q0Inv.copy(q0).invert();
      const deltas = new Float32Array(count * 4);
      let maxAng = 0;
      for (let i = 0; i < count; i++) {
        qk.set(vals[i * 4], vals[i * 4 + 1], vals[i * 4 + 2], vals[i * 4 + 3]).normalize();
        dq.copy(q0Inv).multiply(qk).normalize();
        if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
        const ang = 2 * Math.acos(Clamp(dq.w, -1, 1));
        if (ang > maxAng) maxAng = ang;
        deltas[i * 4] = dq.x; deltas[i * 4 + 1] = dq.y; deltas[i * 4 + 2] = dq.z; deltas[i * 4 + 3] = dq.w;
      }
      if (maxAng > 0.005) tracks.push({ boneName, times: track.times, deltas });
    }
    const entry = { duration: clip.duration || 0.25, tracks };
    this.additiveFireCache.set(file, entry);
    return entry;
  }

  TurnYawCurve(file) {
    if (this.turnYawCache.has(file)) return this.turnYawCache.get(file);
    const clip = this.rawClips.get(file);
    if (!clip || !this.rootParent) return null;
    const track = clip.tracks.find((tr) => tr.name === "Hips.quaternion");
    if (!track) return null;
    const pQ = new THREE.Quaternion(), pPos = new THREE.Vector3(), pSc = new THREE.Vector3();
    this.rootParent.decompose(pPos, pQ, pSc);
    const pQInv = pQ.clone().invert();
    const vals = track.values, count = track.times.length;
    const q0 = new THREE.Quaternion(vals[0], vals[1], vals[2], vals[3]).normalize();
    const q0Inv = q0.clone().invert();
    const qk = new THREE.Quaternion(), dm = new THREE.Quaternion();
    const values = new Float32Array(count);
    let accum = 0, prev = 0;
    for (let i = 0; i < count; i++) {
      qk.set(vals[i * 4], vals[i * 4 + 1], vals[i * 4 + 2], vals[i * 4 + 3]).normalize();
      dm.copy(qk).multiply(q0Inv).premultiply(pQ).multiply(pQInv).normalize();
      const raw = 2 * Math.atan2(dm.y, dm.w);
      if (i > 0) accum += WrapAngle(raw - prev);
      prev = raw;
      values[i] = accum;
    }
    const curve = { duration: clip.duration || 1, times: track.times, values };
    this.turnYawCache.set(file, curve);
    return curve;
  }

  async LoadCharacterSource(key) {
    if (!this.charSources.has(key)) {
      const def = XBOT_CHARACTERS[key];
      const url = key === "xbot" ? BASE + "Model_MixamoXBot.glb" : def.file;
      this.charSources.set(key, this.loader.loadAsync(url).then((g) => g.scene));
    }
    return this.charSources.get(key);
  }

  async LoadGroom(def) {
    if (!def?.groom) return null;
    try {
      this.hairAtlas ||= LoadHairAtlas("./Hair/Textures/Texture_HairCardAtlas.png");
      if (!this.groomCache.has(def.groom)) this.groomCache.set(def.groom, LoadHairGroom(def.groom));
      const [g, a] = await Promise.all([this.groomCache.get(def.groom), this.hairAtlas]);
      return { groom: g, atlas: a };
    } catch {
      return null;
    }
  }

  async LoadRifle(id) {
    if (!this.rifles.has(id)) {
      this.rifles.set(id, LoadModel(`./Model/Model_${id}.tzm.json`, { materials: RIFLE_MATERIALS }).then((built) => {
        if (!built) return null;
        built.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        return built;
      }));
    }
    return this.rifles.get(id);
  }
}

// ---------- Single Character Runner (Old Legacy Mode vs New 3C + Baked 9-Pose Mode) ----------
class CharacterCompareUnit {
  constructor(bank, scene, { mode = "new" }) {
    this.bank = bank;
    this.scene = scene;
    this.mode = mode; // "old" | "new"
    this.container = new THREE.Group();
    this.scene.add(this.container);
    this.model = null;
    this.mixer = null;
    this.bones = new Map();
    this.boneList = [];
    this.base = [];
    this.baseHips = new THREE.Vector3();
    this.baseValid = false;
    this.hair = null;
    this.rifleObj = null;
    this.rifleGripL = new THREE.Vector3(0, -0.012, -0.443);
    this.rifleMuzzle = new THREE.Vector3(0, 0.035, -0.95);
    this.muzzleFlash = null;
    this.charKey = "ijaJia";
    this.hipsScale = 1;

    // 3C & legacy state
    this.tip = new TurnInPlaceController();
    this.locoRunning = false;
    this.locoPhase = 0;
    this.pelvisWarp = 0;
    this.blendActions = new Map();
    this.activeAction = null;
    this.activeFile = null;
    this.activeClock = 0;
    this.addFireAge = Infinity;
    this.oldFireHold = 0;
    this.lastFireSeq = 0;
    this.flashAge = Infinity;
    this.oldAimBaseline = "none"; // "none" | "procedural"

    // Smooth cross-fade state (matching XBotSkin._BeginBlend)
    this.shownQ = [];
    this.shownHips = new THREE.Vector3();
    this.shownValid = false;
    this.pickKey = null;
    this.blend = null;

    // Live telemetry
    this.telemetry = {
      stateLabel: "待机",
      pelvisWarpDeg: 0,
      tipOffsetDeg: 0,
      tipTurning: false,
      aimMode: "none",
      fireLabel: "未开火",
      fireBad: false,
      gripRMm: 0,
      gripLMm: 0,
      muzzleErrDeg: 0,
    };

    // Visual diagnostic overlays (arrows + aim ray + target post)
    this.visGroup = new THREE.Group();
    this.scene.add(this.visGroup);
    this.arrowAim = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.06, 0), 0.95, 0xdfbd68, 0.18, 0.12);
    this.arrowHips = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.04, 0), 0.78, 0x67c5d8, 0.16, 0.10);
    this.arrowVel = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.08, 0), 0.85, 0x7fd486, 0.16, 0.11);
    this.visGroup.add(this.arrowAim, this.arrowHips, this.arrowVel);

    // Aim target marker & muzzle ray
    this.targetGroup = new THREE.Group();
    this.scene.add(this.targetGroup);
    const ringGeo = new THREE.RingGeometry(0.11, 0.15, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: mode === "new" ? 0xdfbd68 : 0xd6604a, side: THREE.DoubleSide });
    this.targetRing = new THREE.Mesh(ringGeo, ringMat);
    const coreGeo = new THREE.SphereGeometry(0.045, 12, 10);
    const coreMat = new THREE.MeshBasicMaterial({ color: mode === "new" ? 0xf5df9c : 0xef8a75 });
    this.targetCore = new THREE.Mesh(coreGeo, coreMat);
    this.targetMarker = new THREE.Group();
    this.targetMarker.add(this.targetRing, this.targetCore);
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2)]);
    const rayMat = new THREE.LineBasicMaterial({ color: mode === "new" ? 0xdfbd68 : 0xd6604a, transparent: true, opacity: 0.75 });
    this.muzzleRay = new THREE.Line(rayGeo, rayMat);
    this.targetGroup.add(this.targetMarker, this.muzzleRay);
  }

  H(name) { return this.bones.get(name) || null; }

  async SetCharacter(charKey) {
    this.charKey = charKey;
    const def = XBOT_CHARACTERS[charKey] || XBOT_CHARACTERS.xbot;
    this.hipsScale = def.hipsScale || 1;
    const [src, groomPack] = await Promise.all([
      this.bank.LoadCharacterSource(charKey),
      this.bank.LoadGroom(def),
    ]);
    if (this.model) {
      this.mixer?.stopAllAction();
      this.mixer?.uncacheRoot(this.model);
      this.container.remove(this.model);
    }
    this.hair?.Dispose();
    this.hair = null;

    this.model = CloneSkinned(src);
    // Mixamo 模型面朝 +Z，游戏世界逻辑 yaw=0 面朝 -Z，故模型绕 Y 转 π 与游戏坐标系对齐
    this.model.rotation.y = Math.PI;
    this.model.traverse((o) => {
      if (o.isMesh) {
        if (!o.userData.hairGroom) o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    this.container.add(this.model);

    this.bones.clear();
    this.boneList = [];
    this.model.traverse((o) => {
      if (o.isBone) {
        this.bones.set(o.name, o);
        this.boneList.push(o);
      }
    });
    this.base = this.boneList.map(() => new THREE.Quaternion());
    this.shownQ = this.boneList.map(() => new THREE.Quaternion());
    this.baseValid = false;
    this.shownValid = false;
    this.blend = null;
    this.pickKey = null;

    if (groomPack && this.H("Head")) {
      this.hair = new HairGroom(groomPack.groom, { atlas: groomPack.atlas, name: charKey, boneRoot: this.model });
      this.H("Head").add(this.hair.root);
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    this.blendActions.clear();
    this.activeAction = null;
    this.activeFile = null;
  }

  async SetRifle(id) {
    const built = await this.bank.LoadRifle(id);
    if (this.rifleObj) this.scene.remove(this.rifleObj);
    if (!built) return;
    this.rifleObj = built.root.clone(true);
    this.scene.add(this.rifleObj);
    this.rifleGripL.copy(built.mounts?.gripL?.position || new THREE.Vector3(0, -0.012, -0.443));
    this.rifleMuzzle.copy(built.mounts?.muzzle?.position || new THREE.Vector3(0, 0.035, -0.95));

    // Subtle muzzle flash star mesh for crisp fire cue
    const flashGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.92 });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.copy(this.rifleMuzzle);
    this.muzzleFlash.visible = false;
    this.rifleObj.add(this.muzzleFlash);
  }

  Reset(yaw = 0) {
    this.tip.Reset(yaw);
    this.locoRunning = false;
    this.locoPhase = 0;
    this.pelvisWarp = 0;
    this.addFireAge = Infinity;
    this.oldFireHold = 0;
    this.flashAge = Infinity;
    this.lastFireSeq = 0;
    this.shownValid = false;
    this.blend = null;
    this.pickKey = null;
    this.activeClock = 0;
  }

  SetVisible(v) {
    this.container.visible = v;
    if (this.rifleObj) this.rifleObj.visible = v;
    this.visGroup.visible = v;
    this.targetGroup.visible = v;
  }

  Update(cmd, dt, visOpts) {
    if (!this.model || !this.mixer) return;
    const yaw = cmd.yaw || 0;
    const vx = cmd.vx || 0;
    const vz = cmd.vz || 0;
    const mps = Math.hypot(vx, vz);
    const stance = cmd.stance === "crouch" ? "crouch" : "stand";
    const lookYaw = cmd.lookYaw || 0;
    const lookPitch = cmd.lookPitch || 0;

    if (cmd.fireSeq !== this.lastFireSeq) {
      this.lastFireSeq = cmd.fireSeq;
      this.addFireAge = 0;
      this.oldFireHold = 0.35;
      this.flashAge = 0;
    }
    if (this.addFireAge < NPC_3C.fireDurationS) this.addFireAge += dt;
    if (this.oldFireHold > 0) this.oldFireHold = Math.max(0, this.oldFireHold - dt);
    if (this.flashAge < 0.09) this.flashAge += dt;
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = this.flashAge < 0.08;
      if (this.muzzleFlash.visible) {
        const s = 1 + (1 - this.flashAge / 0.08) * 0.9;
        this.muzzleFlash.scale.set(s, s, s * 1.8);
      }
    }

    if (this.mode === "old") this._UpdateOld(yaw, vx, vz, mps, stance, lookYaw, lookPitch, dt);
    else this._UpdateNew(yaw, vx, vz, mps, stance, lookYaw, lookPitch, dt);

    // Place rifle + 2-Bone Left Arm IK
    this._PlaceRifleAndIk();

    // Remember final shown pose for smooth state cross-fade
    for (let i = 0; i < this.boneList.length; i++) this.shownQ[i].copy(this.boneList[i].quaternion);
    const hips = this.H("Hips");
    if (hips) this.shownHips.copy(hips.position);
    this.shownValid = true;

    // Update 3D diagnostic overlays
    this._UpdateVisuals(yaw, vx, vz, mps, lookYaw, lookPitch, visOpts);
  }

  _UpdateOld(yaw, vx, vz, mps, stance, lookYaw, lookPitch, dt) {
    // 旧方案：整个人直接硬转到 yaw，无下盘扭曲、无原地转身、无四向混合、开火强制切站立开火 0.35s 冻腿
    this.container.position.set(0, 0, 0);
    this.container.rotation.set(0, yaw, 0);
    this.container.updateMatrixWorld(true);

    let file, label, rate = 1, loop = true, isFireLock = false;
    if (this.oldFireHold > 0) {
      file = stance === "crouch" ? XBOT_NATIVE.fireCrouch.file : XBOT_NATIVE.fireStand.file;
      label = mps > 0.15 ? "开火锁腿滑步！" : "站立开火";
      loop = false;
      isFireLock = mps > 0.15;
    } else if (mps < 0.08) {
      file = stance === "crouch" ? XBOT_NATIVE.crouchIdleRifleAim.file : XBOT_NATIVE.standIdleRifleAim.file;
      label = "静止（转角脚底自转）";
    } else if (stance === "crouch") {
      file = XBOT_NATIVE.crouchWalkRifle.file;
      rate = Clamp(mps / 0.95, 0.45, 2.0);
      label = "单条蹲走（横漂）";
    } else if (mps < 2.2) {
      file = XBOT_NATIVE.standWalkRifle.file;
      rate = Clamp(mps / 1.3, 0.45, 2.0);
      label = "单条前走（横漂）";
    } else {
      file = XBOT_NATIVE.standRunRifle.file;
      rate = Clamp(mps / 3.4, 0.5, 2.0);
      label = "单条前跑（横漂）";
    }

    const key = "old:" + file + (this.oldFireHold > 0 ? ":fire" : "");
    const changed = this.shownValid && key !== this.pickKey;
    if (changed) this._BeginBlend(0.16);
    this.pickKey = key;

    this._PlaySingleClip(file, dt, rate, loop, this.oldFireHold > 0 ? 0.35 - this.oldFireHold : null);
    this._ApplyBlend(dt);
    this.container.updateMatrixWorld(true);

    // 可选对比基线：纯数学 5 节脊柱（用于专门对比 BlenderMCP 9 帧精修 vs 纯数学）
    let aimMode = "无（僵直）";
    if (this.oldAimBaseline === "procedural" && (Math.abs(lookYaw) > 1e-3 || Math.abs(lookPitch) > 1e-3)) {
      this._ApplyProceduralSpineAim(yaw, lookYaw, lookPitch, stance, 1);
      aimMode = "纯数学 5 节脊柱";
    }

    this.telemetry.stateLabel = label;
    this.telemetry.pelvisWarpDeg = 0;
    this.telemetry.tipOffsetDeg = 0;
    this.telemetry.tipTurning = false;
    this.telemetry.aimMode = aimMode;
    this.telemetry.fireLabel = this.oldFireHold > 0 ? (isFireLock ? "冻腿滑步 (0.35s)" : "全覆盖开火") : "未开火";
    this.telemetry.fireBad = isFireLock;
  }

  _UpdateNew(yaw, vx, vz, mps, stance, lookYaw, lookPitch, dt) {
    const loco = ComputeLocomotion2D({
      vx, vz, yaw, stance, aimWeight: 1, rifleInHands: true, speedMps: mps, running: this.locoRunning,
    });
    this.locoRunning = loco.running;
    const tip = this.tip.Update(dt, {
      yaw, mps, stance, aimWeight: 1, rifleInHands: true, active: true, teleported: false,
    });
    this.pelvisWarp = Approach(this.pelvisWarp, loco.pelvisWarpRad, dt, 0.11);
    const lowerYawOff = WrapAngle(tip.visualYawOffset + this.pelvisWarp);

    this.container.position.set(0, 0, 0);
    this.container.rotation.set(0, yaw + lowerYawOff, 0);
    this.container.updateMatrixWorld(true);

    let key = "", label = "";
    let turnFile = null, turnTime = 0;
    if (tip.turning && tip.turnClipKey && XBOT_TURN_IN_PLACE[tip.turnClipKey]) {
      const entry = XBOT_TURN_IN_PLACE[tip.turnClipKey];
      turnFile = entry.file;
      const clip = this.bank.GetClipFor(this.charKey, turnFile);
      turnTime = tip.turnProgress * (clip?.duration || 0.7);
      key = "tip:" + turnFile;
      label = tip.turnDir > 0 ? "原地左迈步转身" : "原地右迈步转身";
      if (this.shownValid && key !== this.pickKey) this._BeginBlend(0.14);
      this.pickKey = key;
      this._PlaySingleClip(turnFile, dt, 1, false, turnTime);
      // Root Yaw Extraction：抵消片段自带的 Hips 转向
      const hips = this.H("Hips");
      const curve = hips ? this.bank.TurnYawCurve(turnFile) : null;
      if (curve) {
        const yawDelta = SampleScalarCurve(curve, turnTime);
        if (Math.abs(yawDelta) > 1e-4) {
          this.container.updateMatrixWorld(true);
          RotateBoneWorld(hips, _yawQ.setFromAxisAngle(_up, -yawDelta));
        }
      }
    } else if (loco.moving) {
      const groupKey = stance === "crouch"
        ? "crouchWalkRifleAim"
        : (loco.running ? "standRunRifleAim" : "standWalkRifleAim");
      const group = XBOT_LOCOMOTION_4WAY[groupKey];
      const entries = [];
      if (loco.primary && group[loco.primary]) entries.push({ ...group[loco.primary], weight: loco.wPrimary, dir: loco.primary });
      if (loco.secondary && loco.wSecondary > 0.01 && group[loco.secondary]) entries.push({ ...group[loco.secondary], weight: loco.wSecondary, dir: loco.secondary });
      key = "blend2d:" + groupKey;
      const dirZh = { forward: "前", backward: "后", left: "左", right: "右" };
      label = entries.length > 1
        ? `2D 混合 (${dirZh[entries[0].dir]}${Math.round(entries[0].weight * 100)}/${dirZh[entries[1].dir]}${Math.round(entries[1].weight * 100)})`
        : `2D 步态 (${dirZh[entries[0]?.dir || "forward"]})`;
      if (this.shownValid && key !== this.pickKey) this._BeginBlend(0.18);
      this.pickKey = key;
      this._PlayBlendSpace(entries, mps, dt);
    } else {
      const file = stance === "crouch" ? XBOT_NATIVE.crouchIdleRifleAim.file : XBOT_NATIVE.standIdleRifleAim.file;
      key = "idle:" + file;
      label = Math.abs(tip.visualYawOffset) > 0.03 ? "死区锁脚 + 腰肩瞄准" : "持枪瞄准待机";
      if (this.shownValid && key !== this.pickKey) this._BeginBlend(0.18);
      this.pickKey = key;
      this._PlaySingleClip(file, dt, 1, true, null);
    }

    this._ApplyBlend(dt);
    this.container.updateMatrixWorld(true);

    // 9 帧 BlenderMCP 精修 Aim Offset（Mesh-Space 脊柱 + Local-Space 锁骨/双臂）
    const residualYaw = WrapAngle(lookYaw - lowerYawOff);
    let aimMode = "基准 (0°)";
    if (Math.abs(residualYaw) > 1e-3 || Math.abs(lookPitch) > 1e-3) {
      if (this.bank.aimOffsetGrid) {
        this._ApplyBaked9AimOffset(residualYaw, lookPitch, stance, 1);
        aimMode = "9 帧精修 baked9";
      } else {
        this._ApplyProceduralSpineAim(yaw, residualYaw, lookPitch, stance, 1);
        aimMode = "程序化回退";
      }
    }

    // 上半身 Masked Additive 开火后坐（双腿与 Hips 严格 0° 透明）
    const rec = EvaluateAdditiveFireRecoil(this.addFireAge);
    if (rec.active) {
      const fireFile = stance === "crouch" ? XBOT_NATIVE.fireCrouch.file : XBOT_NATIVE.fireStand.file;
      const additive = this.bank.AdditiveFireTracks(fireFile);
      if (additive) {
        const t = rec.u * additive.duration;
        const tailFade = 1 - Smooth01((rec.u - 0.72) / 0.28);
        for (const tr of additive.tracks) {
          const bone = this.H(tr.boneName);
          if (!bone) continue;
          SampleAdditiveTrack(tr, t, _addDelta);
          if (tailFade < 0.999) _addDelta.slerpQuaternions(_idQuat, _addDelta, tailFade);
          bone.quaternion.multiply(_addDelta);
        }
        this.container.updateMatrixWorld(true);
      }
      _aimRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
      _aimFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const s1 = this.H("Spine1"), s2 = this.H("Spine2");
      if (s1 && Math.abs(rec.kickPitchRad) > 1e-4) RotateBoneWorld(s1, _aimQ.setFromAxisAngle(_aimRight, rec.kickPitchRad * 0.4));
      if (s2 && Math.abs(rec.kickPitchRad) > 1e-4) {
        _aimQ.setFromAxisAngle(_aimRight, rec.kickPitchRad * 0.6);
        if (Math.abs(rec.kickRollRad) > 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimFwd, rec.kickRollRad));
        RotateBoneWorld(s2, _aimQ);
      }
    }

    this.telemetry.stateLabel = label;
    this.telemetry.pelvisWarpDeg = +(this.pelvisWarp / DEG).toFixed(1);
    this.telemetry.tipOffsetDeg = +(tip.visualYawOffset / DEG).toFixed(1);
    this.telemetry.tipTurning = tip.turning;
    this.telemetry.aimMode = aimMode;
    this.telemetry.fireLabel = rec.active ? "上半身叠加（腿不断）" : "未开火";
    this.telemetry.fireBad = false;
  }

  _PlaySingleClip(file, dt, rate, loop, explicitTime) {
    const clip = this.bank.GetClipFor(this.charKey, file);
    if (!clip) return;
    if (this.activeFile !== file || this.blendActions.size > 0) {
      this.mixer.stopAllAction();
      this.blendActions.clear();
      this.activeFile = file;
      this.activeAction = this.mixer.clipAction(clip);
      this.activeAction.reset();
      this.activeAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      this.activeAction.clampWhenFinished = !loop;
      this.activeAction.timeScale = 0;
      this.activeAction.enabled = true;
      this.activeAction.setEffectiveWeight(1);
      this.activeAction.play();
      this.activeClock = 0;
    } else if (this.baseValid) {
      for (let i = 0; i < this.boneList.length; i++) this.boneList[i].quaternion.copy(this.base[i]);
      this.H("Hips")?.position.copy(this.baseHips);
    }
    const dur = clip.duration || 1;
    let t;
    if (explicitTime !== null) {
      t = Clamp(explicitTime, 0, dur);
    } else {
      this.activeClock += dt * rate;
      t = loop ? (this.activeClock % dur) : Math.min(dur, this.activeClock);
    }
    this.activeAction.time = t;
    this.mixer.update(0);
    for (let i = 0; i < this.boneList.length; i++) this.base[i].copy(this.boneList[i].quaternion);
    if (this.H("Hips")) this.baseHips.copy(this.H("Hips").position);
    this.baseValid = true;
  }

  _PlayBlendSpace(entries, mps, dt) {
    const resolved = [];
    for (const item of entries) {
      const clip = this.bank.GetClipFor(this.charKey, item.file);
      if (clip) resolved.push({ ...item, clip });
    }
    if (!resolved.length) return;
    let wSum = 0;
    for (const r of resolved) wSum += r.weight;
    for (const r of resolved) r.weight = wSum > 1e-6 ? r.weight / wSum : 1 / resolved.length;

    if (this.activeFile !== "__blend2d__") {
      this.mixer.stopAllAction();
      this.blendActions.clear();
      this.activeFile = "__blend2d__";
      this.activeAction = null;
      this.baseValid = false;
    } else if (this.baseValid) {
      for (let i = 0; i < this.boneList.length; i++) this.boneList[i].quaternion.copy(this.base[i]);
      this.H("Hips")?.position.copy(this.baseHips);
    }

    let nominal = 0, effDur = 0;
    for (const r of resolved) {
      nominal += (r.speedMps || 1.3) * r.weight;
      effDur += (r.clip.duration || 1) * r.weight;
    }
    const rate = mps > 0.05 ? Clamp(mps / Math.max(nominal * this.hipsScale, 0.2), 0.4, 2.2) : 0;
    this.locoPhase = (this.locoPhase + (dt * rate) / Math.max(effDur, 0.2)) % 1;
    if (this.locoPhase < 0) this.locoPhase += 1;

    const activeFiles = new Set();
    for (const r of resolved) {
      activeFiles.add(r.file);
      let action = this.blendActions.get(r.file);
      if (!action) {
        action = this.mixer.clipAction(r.clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = 0;
        action.enabled = true;
        action.play();
        this.blendActions.set(r.file, action);
      }
      action.enabled = true;
      action.setEffectiveWeight(r.weight);
      action.time = this.locoPhase * (r.clip.duration || 1);
    }
    for (const [f, action] of this.blendActions) {
      if (!activeFiles.has(f)) action.setEffectiveWeight(0);
    }

    this.mixer.update(0);
    for (let i = 0; i < this.boneList.length; i++) this.base[i].copy(this.boneList[i].quaternion);
    if (this.H("Hips")) this.baseHips.copy(this.H("Hips").position);
    this.baseValid = true;
  }

  _BeginBlend(dur = 0.18) {
    if (!this.shownValid) return;
    const b = this.blend || (this.blend = { q: this.boneList.map(() => new THREE.Quaternion()), hips: new THREE.Vector3(), t: 0, dur });
    for (let i = 0; i < this.boneList.length; i++) b.q[i].copy(this.shownQ[i]);
    b.hips.copy(this.shownHips);
    b.t = 0;
    b.dur = dur;
  }

  _ApplyBlend(dt) {
    const b = this.blend, hips = this.H("Hips");
    if (!b || !hips) return;
    b.t += Math.max(dt, 0);
    const k = Math.min(1, b.t / b.dur), e = k * k * (3 - 2 * k);
    for (let i = 0; i < this.boneList.length; i++) {
      _q.copy(this.boneList[i].quaternion);
      if (_q.dot(b.q[i]) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      this.boneList[i].quaternion.slerpQuaternions(b.q[i], _q, e);
    }
    hips.position.lerpVectors(b.hips, _p.copy(hips.position), e);
    if (k >= 1) this.blend = null;
  }

  _ApplyBaked9AimOffset(yawRad, pitchRad, stance, activeW) {
    const grid = this.bank.aimOffsetGrid;
    const w = EvaluateAimOffsetGridWeights({
      yawRad, pitchRad, stance, yawColsDeg: grid.cfg.yawColsDeg, pitchRowsDeg: grid.cfg.pitchRowsDeg,
    });
    this.model.matrixWorld.decompose(_p, _aoModelQ, _s);
    _aoModelQ.normalize();
    _aoModelQInv.copy(_aoModelQ).invert();

    for (const boneName of XBOT_AIM_SPINE_BONES) {
      const bone = this.H(boneName);
      const arr = grid.meshDelta.get(boneName);
      if (!bone || !arr) continue;
      SampleBilinearQuat(arr, w, _aimQ);
      if (activeW < 0.999) _aimQ.slerpQuaternions(_idQuat, _aimQ, activeW);
      if (Math.abs(1 - Math.abs(_aimQ.w)) < 1e-7) continue;
      _aimQ.premultiply(_aoModelQ).multiply(_aoModelQInv).normalize();
      RotateBoneWorld(bone, _aimQ);
    }
    for (const [boneName, scaleW] of XBOT_AIM_ARM_BONES) {
      const bone = this.H(boneName);
      const arr = grid.localDelta.get(boneName);
      if (!bone || !arr) continue;
      const effW = activeW * scaleW;
      SampleBilinearQuat(arr, w, _aimQ);
      if (effW < 0.999) _aimQ.slerpQuaternions(_idQuat, _aimQ, effW);
      if (Math.abs(1 - Math.abs(_aimQ.w)) < 1e-7) continue;
      bone.quaternion.multiply(_aimQ);
    }
    this.container.updateMatrixWorld(true);
  }

  _ApplyProceduralSpineAim(yaw, yawRad, pitchRad, stance, activeW) {
    const dist = EvaluateSpineAimDistribution({ yawRad, pitchRad, stance, aimWeight: activeW, rigKind: "xbot" });
    _aimRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _aimFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    for (const [boneName, key] of XBOT_SPINE_CHAIN) {
      const bone = this.H(boneName);
      const d = dist[key];
      if (!bone || !d) continue;
      _aimQ.identity();
      if (Math.abs(d.yaw) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_up, d.yaw));
      if (Math.abs(d.pitch) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimRight, d.pitch));
      if (Math.abs(d.roll) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimFwd, d.roll));
      RotateBoneWorld(bone, _aimQ);
    }
    this.container.updateMatrixWorld(true);
  }

  _PlaceRifleAndIk() {
    if (!this.rifleObj || !this.bank.rifleOffset) return;
    const rh = this.H("RightHand"), lh = this.H("LeftHand");
    if (!rh || !lh) return;
    this.container.updateMatrixWorld(true);
    rh.matrixWorld.decompose(_p, _q, _s);
    const off = this.bank.rifleOffset;
    const rPos = off.position.clone().applyQuaternion(_q).add(_p);
    const rQuat = _q.clone().multiply(off.quaternion);

    // Aim rifle smoothly toward left palm using exact game AimAt(quaternion, axis, to, reach)
    const palmL = Palm(lh, this.H("LeftHandMiddle1"), new THREE.Vector3());
    const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(rQuat);
    const toLeft = palmL.clone().sub(rPos);
    const reach = toLeft.length();
    if (reach > 1e-4) AimAt(rQuat, muzzle, toLeft, reach);

    this.rifleObj.position.copy(rPos);
    this.rifleObj.quaternion.copy(rQuat);
    this.rifleObj.updateMatrixWorld(true);

    // 2-Bone IK locking LeftHand palm onto rifle's front handguard gripL
    const targetL = this.rifleGripL.clone().applyMatrix4(this.rifleObj.matrixWorld);
    this._SolveArm("L", targetL, 1.0);
    this.container.updateMatrixWorld(true);

    const palmR = Palm(rh, this.H("RightHandMiddle1"), new THREE.Vector3());
    const palmLAfter = Palm(lh, this.H("LeftHandMiddle1"), new THREE.Vector3());
    this.telemetry.gripRMm = +(rPos.distanceTo(palmR) * 1000).toFixed(1);
    this.telemetry.gripLMm = +(targetL.distanceTo(palmLAfter) * 1000).toFixed(1);
  }

  _SolveArm(side, targetPalm, weight) {
    const n = side === "R" ? "Right" : "Left";
    const upper = this.H(n + "Arm"), fore = this.H(n + "ForeArm"), hand = this.H(n + "Hand"), middle = this.H(n + "HandMiddle1");
    if (!upper || !fore || !hand) return;
    const handQ = FreshQuaternion(hand);
    const A = FreshPosition(upper), B = FreshPosition(fore), Cw = FreshPosition(hand);
    const palmOff = Palm(hand, middle, new THREE.Vector3()).sub(Cw);
    const target = Cw.clone().lerp(targetPalm.clone().sub(palmOff), weight);
    const lab = A.distanceTo(B), lbc = B.distanceTo(Cw);
    const lat = Clamp(A.distanceTo(target), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4);
    const ba = A.clone().sub(B), bc = Cw.clone().sub(B);
    let axis = ba.clone().cross(bc);
    if (axis.lengthSq() < 1e-10) axis = new THREE.Vector3(0, 1, 0).applyQuaternion(FreshQuaternion(upper)).cross(ba);
    axis.normalize();
    const cur = ba.angleTo(bc);
    const des = Math.acos(Clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    RotateBoneWorld(fore, new THREE.Quaternion().setFromAxisAngle(axis, des - cur));
    const C2 = FreshPosition(hand);
    const ac = C2.sub(A).normalize(), at = target.clone().sub(A).normalize();
    RotateBoneWorld(upper, new THREE.Quaternion().setFromUnitVectors(ac, at));
    SetBoneWorldQuaternion(hand, handQ);
  }

  _UpdateVisuals(yaw, vx, vz, mps, lookYaw, lookPitch, visOpts) {
    this.visGroup.visible = !!visOpts.arrows;
    this.targetGroup.visible = !!visOpts.target;

    const aimYaw = yaw + lookYaw;
    const aimDir = new THREE.Vector3(-Math.sin(aimYaw) * Math.cos(lookPitch), Math.sin(lookPitch), -Math.cos(aimYaw) * Math.cos(lookPitch)).normalize();
    const aimFlat = new THREE.Vector3(-Math.sin(aimYaw), 0, -Math.cos(aimYaw)).normalize();
    this.arrowAim.setDirection(aimFlat);

    const hipsYaw = this.container.rotation.y;
    this.arrowHips.setDirection(new THREE.Vector3(-Math.sin(hipsYaw), 0, -Math.cos(hipsYaw)).normalize());

    if (mps > 0.1) {
      this.arrowVel.visible = true;
      this.arrowVel.setDirection(new THREE.Vector3(vx / mps, 0, vz / mps));
      this.arrowVel.setLength(Clamp(mps * 0.36, 0.45, 1.25), 0.16, 0.11);
    } else {
      this.arrowVel.visible = false;
    }

    // Place target marker 2.6m along intended aim line from shoulder height
    const originY = this.H("Spine2") ? FreshPosition(this.H("Spine2"), _v1).y + 0.04 : 1.32;
    const targetPos = new THREE.Vector3(0, originY, 0).addScaledVector(aimDir, 2.55);
    this.targetMarker.position.copy(targetPos);
    this.targetMarker.lookAt(0, originY, 0);

    if (this.rifleObj) {
      const mStart = this.rifleMuzzle.clone().applyMatrix4(this.rifleObj.matrixWorld);
      const mDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rifleObj.quaternion).normalize();
      const mEnd = mStart.clone().addScaledVector(mDir, 2.4);
      const posAttr = this.muzzleRay.geometry.attributes.position;
      posAttr.setXYZ(0, mStart.x, mStart.y, mStart.z);
      posAttr.setXYZ(1, mEnd.x, mEnd.y, mEnd.z);
      posAttr.needsUpdate = true;
      this.telemetry.muzzleErrDeg = +(mDir.angleTo(aimDir) / DEG).toFixed(1);
    }
  }
}

// ---------- Scenario 06: Live FirstPersonGait Leg-Clearance Visualizer ----------
class FirstPersonLegRig {
  constructor(scene, tuning, { accentColor }) {
    this.scene = scene;
    this.tuning = tuning;
    this.gait = new FirstPersonGait(tuning, FP_RIG);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.yaw = 0; this.elapsed = 0;
    this.minClearCm = 999;
    this.curClearCm = 18;
    this.maxSlipMm = 0;
    this.lastFeet = [{ planted: true, x: 0, z: 0 }, { planted: true, x: 0, z: 0 }];

    const boneMat = new THREE.MeshStandardMaterial({ color: 0x8d7f57, roughness: 0.72 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.82 });
    const jointMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.45 });

    // Sleek anatomical pelvis bar + hip/velocity arrows
    this.pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.045, 0.075), jointMat);
    this.group.add(this.pelvisMesh);
    this.hipArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.03, 0), 0.72, 0x67c5d8, 0.14, 0.09);
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), 0.78, 0x7fd486, 0.14, 0.09);
    this.group.add(this.hipArrow, this.velArrow);

    // Articulated 3D thighs, shins, knees, boots (matching Script_FirstPersonGaitTest: hipY=0.873, ankleY=0.092)
    this.thighLen = 0.41;
    this.shinLen = 0.40;
    this.hipY = 0.873;
    this.legs = [0, 1].map(() => {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, this.thighLen - 0.11, 6, 12), boneMat);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, this.shinLen - 0.09, 6, 12), boneMat);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), jointMat);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.075, 0.23), bootMat);
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 18), new THREE.MeshBasicMaterial({ color: accentColor, side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.008;
      thigh.castShadow = shin.castShadow = boot.castShadow = true;
      this.group.add(thigh, shin, knee, boot, pad);
      return { thigh, shin, knee, boot, pad };
    });

    // High-visibility 3D caliper cylinder + endpoint spheres measuring closest leg-axis distance
    this.clearMat = new THREE.MeshBasicMaterial({ color: 0x7fd486 });
    this.clearBar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 8), this.clearMat);
    this.dotA = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), this.clearMat);
    this.dotB = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), this.clearMat);
    this.group.add(this.clearBar, this.dotA, this.dotB);

    this.Reset();
  }

  Reset() {
    this.gait = new FirstPersonGait(this.tuning, FP_RIG);
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.yaw = 0; this.elapsed = 0;
    this.minClearCm = 999;
    this.curClearCm = 18;
    this.maxSlipMm = 0;
    for (let k = 0; k < 20; k++) {
      this.gait.Update(1 / 60, {
        playerX: 0, playerY: 0, playerZ: 0, anchorX: 0, anchorZ: 0.18, aimYaw: 0,
        grounded: true, crouch: 0, prone: 0, hipHeight: 0.873, legReach: 0.86, ankleHeight: 0.092,
      });
    }
    for (let i = 0; i < 2; i++) {
      this.lastFeet[i] = { planted: this.gait.feet[i].planted, x: this.gait.feet[i].x, z: this.gait.feet[i].z };
    }
  }

  SetVisible(v) { this.group.visible = v; }

  Update(targetVx, targetVz, dt) {
    // Smooth acceleration matching real player movement & Script_FirstPersonGaitTest
    const k = 1 - Math.exp(-dt * 12);
    this.vx += (targetVx - this.vx) * k;
    this.vz += (targetVz - this.vz) * k;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.elapsed += dt;
    this.gait.Update(dt, {
      playerX: this.x, playerY: 0, playerZ: this.z,
      anchorX: this.x + Math.sin(this.yaw) * 0.18,
      anchorZ: this.z + Math.cos(this.yaw) * 0.18,
      aimYaw: this.yaw, grounded: true, crouch: 0, prone: 0,
      hipHeight: 0.873, legReach: 0.86, ankleHeight: 0.092,
    });

    // Measure planted-foot slip
    for (let i = 0; i < 2; i++) {
      const f = this.gait.feet[i];
      if (f.planted && this.lastFeet[i].planted) {
        const slipMm = Math.hypot(f.x - this.lastFeet[i].x, f.z - this.lastFeet[i].z) * 1000;
        if (slipMm > this.maxSlipMm) this.maxSlipMm = slipMm;
      }
      this.lastFeet[i] = { planted: f.planted, x: f.x, z: f.z };
    }

    const lowerYaw = this.gait.lowerYaw;
    const anchorX = this.x + Math.sin(this.yaw) * 0.18;
    const anchorZ = this.z + Math.cos(this.yaw) * 0.18;
    this.pelvisMesh.position.set(0, this.hipY, 0);
    this.pelvisMesh.rotation.set(0, lowerYaw, 0);
    this.hipArrow.setDirection(new THREE.Vector3(-Math.sin(lowerYaw), 0, -Math.cos(lowerYaw)).normalize());
    const spd = Math.hypot(this.vx, this.vz);
    if (spd > 0.05) {
      this.velArrow.visible = true;
      this.velArrow.setDirection(new THREE.Vector3(this.vx / spd, 0, this.vz / spd));
    } else this.velArrow.visible = false;

    const fwd = new THREE.Vector3(-Math.sin(lowerYaw), 0, -Math.cos(lowerYaw));
    const hipPts = [], anklePts = [];
    for (let i = 0; i < 2; i++) {
      const f = this.gait.feet[i];
      const sideX = i === 0 ? 0.09 : -0.09;
      const [hx, hz] = ModelToWorld(sideX, 0, lowerYaw);
      const hip = new THREE.Vector3(hx, this.hipY, hz);
      const ankle = new THREE.Vector3(f.x - anchorX, 0.092 + f.lift, f.z - anchorZ);
      hipPts.push(hip);
      anklePts.push(ankle);

      // Analytical 2-bone leg IK with forward knee bend
      const toAnkle = ankle.clone().sub(hip);
      const dist = Clamp(toAnkle.length(), 0.12, this.thighLen + this.shinLen - 0.005);
      const dir = toAnkle.clone().normalize();
      const cosA = Clamp((this.thighLen * this.thighLen + dist * dist - this.shinLen * this.shinLen) / (2 * this.thighLen * dist), -1, 1);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const pole = fwd.clone().addScaledVector(dir, -fwd.dot(dir)).normalize();
      const knee = hip.clone().addScaledVector(dir, this.thighLen * cosA).addScaledVector(pole, this.thighLen * sinA);

      this._PlaceBone(this.legs[i].thigh, hip, knee);
      this._PlaceBone(this.legs[i].shin, knee, ankle);
      this.legs[i].knee.position.copy(knee);
      this.legs[i].boot.position.set(ankle.x, ankle.y - 0.048, ankle.z);
      this.legs[i].boot.rotation.set(0, f.yaw, 0);
      this.legs[i].pad.position.set(ankle.x, 0.008, ankle.z);
      this.legs[i].pad.visible = f.planted;
    }

    // Exact same 3D leg-axis clearance measurement as Script_FirstPersonGaitTest (hip->ankle centerline)
    const best = ClosestPointsSegments(hipPts[0], anklePts[0], hipPts[1], anklePts[1]);
    this.curClearCm = +(best.dist * 100).toFixed(1);
    if (this.elapsed > 0.65 && this.curClearCm < this.minClearCm) this.minClearCm = this.curClearCm;

    this.clearBar.position.copy(best.a).add(best.b).multiplyScalar(0.5);
    const barDir = best.b.clone().sub(best.a);
    const barLen = Math.max(barDir.length(), 1e-4);
    this.clearBar.scale.set(1, barLen, 1);
    this.clearBar.quaternion.setFromUnitVectors(_up, barDir.divideScalar(barLen));
    const col = this.curClearCm < 13.5 ? 0xef6c57 : this.curClearCm < 14.5 ? 0xdfbd68 : 0x7fd486;
    this.clearMat.color.setHex(col);
    this.dotA.position.copy(best.a);
    this.dotB.position.copy(best.b);
  }

  _PlaceBone(mesh, a, b) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    mesh.quaternion.setFromUnitVectors(_up, dir);
  }
}

// ---------- Treadmill Scene Factory ----------
function MakeStageScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1e21);
  scene.fog = new THREE.Fog(0x1b1e21, 12, 34);
  scene.add(new THREE.HemisphereLight(0xf3ebd9, 0x35322c, 1.25));
  const sun = new THREE.DirectionalLight(0xfff5e4, 2.0);
  sun.position.set(2.8, 5.5, -3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.5, far: 16 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88a8cc, 0.65);
  rim.position.set(-3.2, 2.4, 3.0);
  scene.add(rim);

  // Subtle environment reflections so steel rifle barrels gleam nicely
  const sky = new THREE.SphereGeometry(8, 24, 12), colors = [];
  const top = new THREE.Color(0xd8cfbd), bottom = new THREE.Color(0x22201c), c = new THREE.Color();
  for (let i = 0; i < sky.attributes.position.count; i++) {
    c.lerpColors(bottom, top, THREE.MathUtils.smoothstep(sky.attributes.position.getY(i), -3, 5)).toArray(colors, i * 3);
  }
  sky.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x2a2926, roughness: 0.96 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Scrolling treadmill grid (cell = 0.5 m) so foot slip vs planted-foot locking is unmistakable!
  const gridGroup = new THREE.Group();
  const grid = new THREE.GridHelper(32, 64, 0x6f5f3b, 0x3b3e42);
  grid.position.y = 0.002;
  gridGroup.add(grid);
  scene.add(gridGroup);

  return { scene, gridGroup };
}

// ---------- Deterministic Scenario Script Generators ----------
function EvaluateScenarioCommand(scenarioId, t, state) {
  // Base values (may be overridden by manual aim or sandbox keyboard)
  let yaw = 0, vx = 0, vz = 0, stance = state.stance, lookYaw = 0, lookPitch = 0, fireSeq = state.manualFireSeq;
  let phaseHint = "";

  if (scenarioId === "strafe2d") {
    const cycle = t % 12;
    if (cycle < 2.4) { vx = 1.65; vz = -1.65; phaseHint = "斜前右突击 (+45°)"; }
    else if (cycle < 4.8) { vx = 2.15; vz = 0; phaseHint = "纯右侧向横移 (+90°)"; }
    else if (cycle < 7.2) { vx = 1.35; vz = 1.35; phaseHint = "斜后右撤退 (+135°)"; }
    else if (cycle < 9.6) { vx = -1.65; vz = -1.65; phaseHint = "斜前左突击 (-45°)"; }
    else { vx = -2.15; vz = 0; phaseHint = "纯左侧向横移 (-90°)"; }
  } else if (scenarioId === "turnInPlace") {
    const cycle = t % 11.5;
    if (cycle < 1.2) { yaw = 0; phaseHint = "静止正前瞄准 (0°)"; }
    else if (cycle < 3.0) { yaw = 34 * DEG * Smooth01((cycle - 1.2) / 1.4); phaseHint = "死区内左转 (+34°，双脚应钉死)"; }
    else if (cycle < 5.5) { yaw = (34 + 54 * Smooth01((cycle - 3.0) / 0.8)) * DEG; phaseHint = "超死区左转 (+88°，触发迈步转身)"; }
    else if (cycle < 6.8) { yaw = 88 * DEG; phaseHint = "转身收敛停稳"; }
    else if (cycle < 9.6) { yaw = (88 - 176 * Smooth01((cycle - 6.8) / 1.4)) * DEG; phaseHint = "大幅右转 (-88°，触发右迈步转身)"; }
    else { yaw = -88 * DEG * (1 - Smooth01((cycle - 9.6) / 1.2)); phaseHint = "回正 (0°)"; }
  } else if (scenarioId === "aimOffset9") {
    const idx = Math.floor((t / 1.35) % AIM_GRID_CELLS.length);
    const nextIdx = (idx + 1) % AIM_GRID_CELLS.length;
    const u = Smooth01(((t % 1.35) - 0.85) / 0.5);
    const a = AIM_GRID_CELLS[idx], b = AIM_GRID_CELLS[nextIdx];
    lookYaw = (a.yaw + (b.yaw - a.yaw) * u) * DEG;
    lookPitch = (a.pitch + (b.pitch - a.pitch) * u) * DEG;
    phaseHint = `九宫格巡检：${a.label} (${a.yaw > 0 ? "+" : ""}${a.yaw}°y / ${a.pitch > 0 ? "+" : ""}${a.pitch}°p)`;
  } else if (scenarioId === "moveAndFire") {
    const cycle = t % 6.4;
    if (cycle < 3.2) { vx = 1.75; vz = -1.75; lookYaw = 16 * DEG; lookPitch = 8 * DEG; phaseHint = "斜前右冲刺中连射"; }
    else { vx = -1.75; vz = -1.75; lookYaw = -16 * DEG; lookPitch = 10 * DEG; phaseHint = "斜前左冲刺中连射"; }
    const autoShot = Math.floor(t / 0.85);
    fireSeq = state.manualFireSeq + autoShot;
  } else if (scenarioId === "combatSequence") {
    const cycle = t % 12;
    if (cycle < 2.0) {
      yaw = 28 * DEG * Math.sin((cycle / 2.0) * Math.PI);
      lookPitch = 12 * DEG;
      phaseHint = "① 静止警戒扫视（死区锁脚）";
    } else if (cycle < 4.4) {
      yaw = 78 * DEG * Smooth01((cycle - 2.0) / 0.9);
      phaseHint = "② 大角敌情迈步转身 (+78°)";
    } else if (cycle < 7.6) {
      yaw = 78 * DEG;
      // Local forward-right relative to yaw=78°
      const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
      const rgtX = Math.cos(yaw), rgtZ = -Math.sin(yaw);
      vx = fwdX * 1.9 + rgtX * 1.7;
      vz = fwdZ * 1.9 + rgtZ * 1.7;
      lookPitch = 14 * DEG;
      fireSeq = state.manualFireSeq + Math.floor((cycle - 4.4) / 0.85) + 1;
      phaseHint = "③ 斜前突击 + 移动开火（2D 混合 + 扭曲 + 开火叠加）";
    } else if (cycle < 10.2) {
      yaw = 78 * DEG * (1 - Smooth01((cycle - 7.6) / 1.1));
      stance = "crouch";
      lookYaw = -26 * DEG;
      lookPitch = 16 * DEG;
      phaseHint = "④ 急停下蹲 + 9 帧右仰瞄准";
    } else {
      yaw = 0; stance = "stand";
      phaseHint = "⑤ 起身复位";
    }
  } else if (scenarioId === "fpStrafeLegs") {
    const cycle = t % 7.0;
    if (cycle < 3.5) { vx = 2.55; vz = 0; phaseHint = "右横移 2.55 m/s（注意双腿交错净距连线）"; }
    else { vx = -2.55; vz = 0; phaseHint = "左横移 2.55 m/s（注意双腿交错净距连线）"; }
  } else if (scenarioId === "sandbox") {
    yaw = state.sandboxYaw;
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rgtX = Math.cos(yaw), rgtZ = -Math.sin(yaw);
    let inF = (state.keys.has("KeyW") ? 1 : 0) - (state.keys.has("KeyS") ? 1 : 0);
    let inR = (state.keys.has("KeyD") ? 1 : 0) - (state.keys.has("KeyA") ? 1 : 0);
    const mag = Math.hypot(inF, inR);
    if (mag > 1e-4) {
      inF /= mag; inR /= mag;
      const spd = state.stance === "crouch" ? 1.15 : (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight") ? 3.2 : 1.85);
      vx = (fwdX * inF + rgtX * inR) * spd;
      vz = (fwdZ * inF + rgtZ * inR) * spd;
    }
    phaseHint = mag > 0 ? `沙盒移动 ${Math.hypot(vx, vz).toFixed(1)} m/s` : "沙盒待机（WASD 移动 · Q/E 转向 · F 开火）";
  }

  if (state.manualAim) {
    lookYaw = state.manualYawDeg * DEG;
    lookPitch = state.manualPitchDeg * DEG;
  }
  return { yaw, vx, vz, stance, lookYaw, lookPitch, fireSeq, phaseHint };
}

// ---------- Main Application ----------
async function Main() {
  const bootBar = $("bootBar"), bootStep = $("bootStep"), bootOverlay = $("bootOverlay");
  const setBoot = (pct, msg) => { bootBar.style.width = `${pct}%`; bootStep.textContent = msg; };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  $("view").appendChild(renderer.domElement);

  const oldStage = MakeStageScene(renderer);
  const newStage = MakeStageScene(renderer);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);

  const orbit = { yaw: 0.56, pitch: 0.20, dist: 4.55, targetY: 0.88, pan: new THREE.Vector3() };
  const ApplyCamPreset = (name) => {
    const p = CAM_PRESETS[name] || CAM_PRESETS.front34;
    orbit.yaw = p.yaw; orbit.pitch = p.pitch; orbit.dist = p.dist; orbit.targetY = p.targetY;
    orbit.pan.set(0, 0, 0);
    document.querySelectorAll("#camBtns .edBtn").forEach((b) => b.classList.toggle("on", b.dataset.cam === name));
  };

  // Synced orbit controls on canvas
  let drag = null;
  const dom = renderer.domElement;
  dom.addEventListener("contextmenu", (e) => e.preventDefault());
  dom.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, button: e.button }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener("pointerup", () => { drag = null; });
  dom.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.button === 2) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      orbit.pan.addScaledVector(right, -dx * orbit.dist * 0.0014).addScaledVector(up, dy * orbit.dist * 0.0014);
    } else {
      orbit.yaw -= dx * 0.008;
      orbit.pitch = Clamp(orbit.pitch + dy * 0.006, -0.2, 1.45);
    }
  });
  dom.addEventListener("wheel", (e) => {
    e.preventDefault();
    orbit.dist = Clamp(orbit.dist * Math.exp(e.deltaY * 0.001), 1.1, 12);
  }, { passive: false });
  dom.addEventListener("dblclick", () => ApplyCamPreset(activeScenario.defaultCam));

  // Load shared asset bank
  const bank = new CompareAssetBank(renderer);
  await bank.Init(setBoot);
  setBoot(82, "装配左右实机角色与第一人称步态求解器…");

  const oldUnit = new CharacterCompareUnit(bank, oldStage.scene, { mode: "old" });
  const newUnit = new CharacterCompareUnit(bank, newStage.scene, { mode: "new" });
  const oldFp = new FirstPersonLegRig(oldStage.scene, OLD_FP_TUNING, { accentColor: 0xd6604a });
  const newFp = new FirstPersonLegRig(newStage.scene, FIRST_PERSON_BODY, { accentColor: 0xdfbd68 });
  oldFp.SetVisible(false);
  newFp.SetVisible(false);

  const initialChar = CHAR_KEYS.includes("ijaJia") ? "ijaJia" : CHAR_KEYS[0];
  await Promise.all([
    oldUnit.SetCharacter(initialChar),
    newUnit.SetCharacter(initialChar),
    oldUnit.SetRifle("Type38"),
    newUnit.SetRifle("Type38"),
  ]);

  const state = {
    playing: true,
    rate: 1.0,
    time: 0,
    stance: "stand",
    manualAim: false,
    manualYawDeg: 0,
    manualPitchDeg: 0,
    manualFireSeq: 0,
    sandboxYaw: 0,
    keys: new Set(),
    treadX: 0,
    treadZ: 0,
    vis: { arrows: true, target: true, treadmill: true },
  };
  let activeScenario = SCENARIOS[0];

  // Populate character dropdown
  const selChar = $("selChar");
  for (const k of CHAR_KEYS) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = XBOT_CHARACTERS[k].name || k;
    if (k === initialChar) opt.selected = true;
    selChar.appendChild(opt);
  }
  selChar.addEventListener("change", async () => {
    $("topStatus").textContent = "切换测试人物…";
    await Promise.all([oldUnit.SetCharacter(selChar.value), newUnit.SetCharacter(selChar.value)]);
    oldUnit.Reset(0); newUnit.Reset(0);
    UpdateTopStatus();
  });

  $("selRifle").addEventListener("change", async () => {
    const id = $("selRifle").value;
    await Promise.all([oldUnit.SetRifle(id), newUnit.SetRifle(id)]);
    UpdateTopStatus();
  });

  $("selOldAim").addEventListener("change", () => {
    oldUnit.oldAimBaseline = $("selOldAim").value;
    $("leftBadgeSub").textContent = oldUnit.oldAimBaseline === "procedural"
      ? "左侧已切为「纯数学 5 节脊柱」· 专门对比右侧 BlenderMCP 9 帧精修"
      : "单向播片 / 无朝向扭曲 / 无原地转身 / 开火锁腿";
  });

  // Build left scenario list
  const scListEl = $("scenarioList");
  for (const sc of SCENARIOS) {
    const item = document.createElement("div");
    item.className = "scItem";
    item.dataset.scenario = sc.id;
    item.innerHTML = `<div class="scTop"><span class="scIdx">${sc.index}</span><span class="scName">${sc.name}</span><span class="scTag">${sc.tag}</span></div><div class="scHint">${sc.hint}</div>`;
    item.addEventListener("click", () => SelectScenario(sc.id));
    scListEl.appendChild(item);
  }

  // Build 3x3 Aim Offset quick grid
  const aoGridEl = $("aoGrid");
  AIM_GRID_CELLS.forEach((cell, idx) => {
    const btn = document.createElement("button");
    btn.className = "aoCell";
    btn.dataset.idx = String(idx);
    btn.textContent = cell.label;
    btn.addEventListener("click", () => {
      state.manualAim = true;
      $("chkManualAim").checked = true;
      $("chipManualAim").classList.add("on");
      SetManualAim(cell.yaw, cell.pitch);
      aoGridEl.querySelectorAll(".aoCell").forEach((c) => c.classList.toggle("on", c === btn));
    });
    aoGridEl.appendChild(btn);
  });

  function SetManualAim(yawDeg, pitchDeg) {
    state.manualYawDeg = Clamp(Math.round(yawDeg), -75, 75);
    state.manualPitchDeg = Clamp(Math.round(pitchDeg), -45, 50);
    $("rngYaw").value = String(state.manualYawDeg);
    $("rngPitch").value = String(state.manualPitchDeg);
    $("valYaw").textContent = `${state.manualYawDeg > 0 ? "+" : ""}${state.manualYawDeg}°`;
    $("valPitch").textContent = `${state.manualPitchDeg > 0 ? "+" : ""}${state.manualPitchDeg}°`;
  }

  $("chkManualAim").addEventListener("change", () => {
    state.manualAim = $("chkManualAim").checked;
    $("chipManualAim").classList.toggle("on", state.manualAim);
    if (!state.manualAim) aoGridEl.querySelectorAll(".aoCell").forEach((c) => c.classList.remove("on"));
  });
  $("rngYaw").addEventListener("input", () => {
    state.manualAim = true;
    $("chkManualAim").checked = true;
    $("chipManualAim").classList.add("on");
    SetManualAim(Number($("rngYaw").value), state.manualPitchDeg);
  });
  $("rngPitch").addEventListener("input", () => {
    state.manualAim = true;
    $("chkManualAim").checked = true;
    $("chipManualAim").classList.add("on");
    SetManualAim(state.manualYawDeg, Number($("rngPitch").value));
  });

  // Playback / Speed / Camera / Stance buttons
  $("btnPlay").addEventListener("click", () => {
    state.playing = !state.playing;
    $("btnPlay").textContent = state.playing ? "暂停" : "播放";
    $("btnPlay").classList.toggle("on", state.playing);
  });
  $("btnRestart").addEventListener("click", () => ResetScenario());
  $("btnFire").addEventListener("click", () => { state.manualFireSeq += 1; });

  document.querySelectorAll("#speedBtns .edBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.rate = Number(btn.dataset.rate) || 1;
      document.querySelectorAll("#speedBtns .edBtn").forEach((b) => b.classList.toggle("on", b === btn));
    });
  });
  document.querySelectorAll("#camBtns .edBtn").forEach((btn) => {
    btn.addEventListener("click", () => ApplyCamPreset(btn.dataset.cam));
  });
  document.querySelectorAll("#stanceBtns .edBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.stance = btn.dataset.stance;
      document.querySelectorAll("#stanceBtns .edBtn").forEach((b) => b.classList.toggle("on", b === btn));
    });
  });

  for (const [id, key] of [["visArrows", "arrows"], ["visTarget", "target"], ["visTreadmill", "treadmill"]]) {
    const input = $(id);
    input.addEventListener("change", () => {
      state.vis[key] = input.checked;
      input.parentElement.classList.toggle("on", input.checked);
    });
  }

  // Keyboard shortcuts (Space pause, F fire, WASD/Q/E/C in sandbox)
  window.addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    state.keys.add(e.code);
    if (e.code === "Space") { e.preventDefault(); $("btnPlay").click(); }
    else if (e.code === "KeyF") { state.manualFireSeq += 1; }
    else if (e.code === "KeyC" && activeScenario.id === "sandbox") {
      state.stance = state.stance === "crouch" ? "stand" : "crouch";
      document.querySelectorAll("#stanceBtns .edBtn").forEach((b) => b.classList.toggle("on", b.dataset.stance === state.stance));
    }
  });
  window.addEventListener("keyup", (e) => state.keys.delete(e.code));

  function ResetScenario() {
    state.time = 0;
    state.treadX = 0; state.treadZ = 0;
    state.sandboxYaw = 0;
    oldUnit.Reset(0);
    newUnit.Reset(0);
    oldFp.Reset();
    newFp.Reset();
  }

  function SelectScenario(id) {
    const sc = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    activeScenario = sc;
    scListEl.querySelectorAll(".scItem").forEach((el) => el.classList.toggle("on", el.dataset.scenario === sc.id));
    $("captionTitle").textContent = `${sc.index} · ${sc.name} — ${sc.captionTitle}`;
    $("captionDesc").textContent = sc.captionDesc;
    $("scenarioChecklist").textContent = sc.checklist;
    $("sandboxKeys").hidden = sc.id !== "sandbox";

    const isFp = sc.id === "fpStrafeLegs";
    oldUnit.SetVisible(!isFp);
    newUnit.SetVisible(!isFp);
    oldFp.SetVisible(isFp);
    newFp.SetVisible(isFp);
    $("leftBadgeTitle").textContent = isFp ? "优化前 · 旧步态参数" : "优化前 · 旧方案";
    $("leftBadgeSub").textContent = isFp
      ? "orientWarp 40° / 无横移步宽 / 无摆腿外绕弧"
      : (oldUnit.oldAimBaseline === "procedural"
        ? "左侧已切为「纯数学 5 节脊柱」· 专门对比右侧 BlenderMCP 9 帧精修"
        : "单向播片 / 无朝向扭曲 / 无原地转身 / 开火锁腿");
    $("rightBadgeTitle").textContent = isFp ? "优化后 · 防穿插步态参数" : "优化后 · 3C + 9 帧精修";
    $("rightBadgeSub").textContent = isFp
      ? "orientWarp 54° / 横移步宽 7.5 cm / 摆腿弧 5.5 cm"
      : "2D 混合 / 朝向扭曲 / 原地转身 / Blender 9 帧 Aim Offset / 开火叠加";

    // Auto-clear manual aim lock when switching away from Aim Offset scenario
    if (sc.id !== "aimOffset9" && sc.id !== "sandbox") {
      state.manualAim = false;
      $("chkManualAim").checked = false;
      $("chipManualAim").classList.remove("on");
      aoGridEl.querySelectorAll(".aoCell").forEach((c) => c.classList.remove("on"));
    }
    ApplyCamPreset(sc.defaultCam);
    ResetScenario();
    UpdateTopStatus();
  }

  function UpdateTopStatus() {
    const charName = XBOT_CHARACTERS[selChar.value]?.name || selChar.value;
    const rifleName = $("selRifle").value === "Type38" ? "三八式" : "中正式";
    const aoStatus = bank.aimOffsetGrid ? "9 帧 Aim Offset 已就绪" : "程序化回退";
    $("topStatus").textContent = `${charName} · ${rifleName} · ${aoStatus} · 场景 ${activeScenario.index}`;
  }

  function RenderDiffTable(cmd) {
    const tbody = $("diffBody");
    if (activeScenario.id === "fpStrafeLegs") {
      const oldBad = oldFp.minClearCm < 13.5;
      const newGood = newFp.minClearCm >= 14.5;
      tbody.innerHTML = `
        <tr><td class="metric">当前双腿净距</td><td class="oldVal ${oldFp.curClearCm < 13.5 ? "bad" : ""}">${oldFp.curClearCm.toFixed(1)} cm</td><td class="newVal ${newFp.curClearCm >= 14.5 ? "good" : ""}">${newFp.curClearCm.toFixed(1)} cm</td></tr>
        <tr><td class="metric">历史最小净距</td><td class="oldVal ${oldBad ? "bad" : ""}">${oldFp.minClearCm < 900 ? oldFp.minClearCm.toFixed(1) + " cm" : "—"}</td><td class="newVal ${newGood ? "good" : ""}">${newFp.minClearCm < 900 ? newFp.minClearCm.toFixed(1) + " cm" : "—"}</td></tr>
        <tr><td class="metric">骨盆扭曲角</td><td class="oldVal">${(oldFp.gait.lowerYaw / DEG).toFixed(1)}°</td><td class="newVal good">${(newFp.gait.lowerYaw / DEG).toFixed(1)}°</td></tr>
        <tr><td class="metric">着地脚滑移</td><td class="oldVal">${oldFp.maxSlipMm.toFixed(2)} mm</td><td class="newVal good">${newFp.maxSlipMm.toFixed(2)} mm</td></tr>
        <tr><td class="metric">横移步宽</td><td class="oldVal">0.0 cm</td><td class="newVal good">7.5 cm</td></tr>
      `;
      $("leftAlert").className = `vpAlert ${oldFp.curClearCm < 13.5 ? "warn" : ""}`;
      $("leftAlert").textContent = oldFp.curClearCm < 13.5 ? `⚠ 双腿过近穿插风险：${oldFp.curClearCm.toFixed(1)} cm` : `当前净距 ${oldFp.curClearCm.toFixed(1)} cm（最小 ${oldFp.minClearCm.toFixed(1)} cm）`;
      $("rightAlert").className = "vpAlert good";
      $("rightAlert").textContent = `✓ 安全净距 ${newFp.curClearCm.toFixed(1)} cm（最小 ${newFp.minClearCm.toFixed(1)} cm · 滑移 ${newFp.maxSlipMm.toFixed(2)} mm）`;
      return;
    }

    const o = oldUnit.telemetry, n = newUnit.telemetry;
    tbody.innerHTML = `
      <tr><td class="metric">当前阶段</td><td class="oldVal" colspan="2" style="color:var(--ui-gold)">${cmd.phaseHint || "—"}</td></tr>
      <tr><td class="metric">步态状态</td><td class="oldVal ${o.fireBad ? "bad" : ""}">${o.stateLabel}</td><td class="newVal good">${n.stateLabel}</td></tr>
      <tr><td class="metric">骨盆扭曲</td><td class="oldVal">${o.pelvisWarpDeg.toFixed(1)}°</td><td class="newVal">${n.pelvisWarpDeg > 0 ? "+" : ""}${n.pelvisWarpDeg.toFixed(1)}°</td></tr>
      <tr><td class="metric">原地脚偏角</td><td class="oldVal">0.0° (直转)</td><td class="newVal">${n.tipOffsetDeg > 0 ? "+" : ""}${n.tipOffsetDeg.toFixed(1)}°${n.tipTurning ? " 迈步" : ""}</td></tr>
      <tr><td class="metric">Aim Offset</td><td class="oldVal">${o.aimMode}</td><td class="newVal good">${n.aimMode}</td></tr>
      <tr><td class="metric">开火处理</td><td class="oldVal ${o.fireBad ? "bad" : ""}">${o.fireLabel}</td><td class="newVal ${n.fireLabel !== "未开火" ? "good" : ""}">${n.fireLabel}</td></tr>
      <tr><td class="metric">双掌握距差</td><td class="oldVal">R ${o.gripRMm} / L ${o.gripLMm} mm</td><td class="newVal">R ${n.gripRMm} / L ${n.gripLMm} mm</td></tr>
    `;

    $("leftAlert").className = `vpAlert ${o.fireBad || (activeScenario.id === "turnInPlace" && Math.abs(cmd.yaw) > 0.05) || (activeScenario.id === "strafe2d") ? "warn" : ""}`;
    $("leftAlert").textContent = o.fireBad
      ? "⚠ 跑步开火切全动画 → 双腿冻住滑冰 0.35 s"
      : `${o.stateLabel} · 枪口偏靶 ${o.muzzleErrDeg}°`;
    $("rightAlert").className = "vpAlert good";
    $("rightAlert").textContent = `✓ ${n.stateLabel} · ${n.aimMode} · 扭胯 ${n.pelvisWarpDeg > 0 ? "+" : ""}${n.pelvisWarpDeg}°`;
  }

  // Resize & dual-viewport render loop
  let viewW = 1, viewH = 1;
  function Resize() {
    const r = $("view").getBoundingClientRect();
    viewW = Math.max(1, Math.floor(r.width));
    viewH = Math.max(1, Math.floor(r.height));
    renderer.setSize(viewW, viewH, false);
  }
  new ResizeObserver(Resize).observe($("view"));
  Resize();

  // Read initial scenario from URL ?scenario=...
  const urlSc = new URLSearchParams(location.search).get("scenario");
  SelectScenario(urlSc || "strafe2d");
  setBoot(100, "就绪");
  bootOverlay.classList.add("gone");

  let lastTs = performance.now();
  let uiAccum = 0;

  function StepFrame(rawDt) {
    const dt = Math.min(rawDt, 0.05) * (state.playing ? state.rate : 0);
    if (activeScenario.id === "sandbox" && dt > 0) {
      const turn = (state.keys.has("KeyQ") ? 1 : 0) - (state.keys.has("KeyE") ? 1 : 0);
      state.sandboxYaw = WrapAngle(state.sandboxYaw + turn * 1.9 * dt);
    }
    state.time += dt;
    const cmd = EvaluateScenarioCommand(activeScenario.id, state.time, state);

    // Scroll ground treadmill opposite to velocity (0.5 m grid cell wrap)
    if (state.vis.treadmill && dt > 0) {
      state.treadX = (state.treadX - cmd.vx * dt) % 0.5;
      state.treadZ = (state.treadZ - cmd.vz * dt) % 0.5;
    }
    oldStage.gridGroup.visible = state.vis.treadmill;
    newStage.gridGroup.visible = state.vis.treadmill;
    oldStage.gridGroup.position.set(state.treadX, 0, state.treadZ);
    newStage.gridGroup.position.set(state.treadX, 0, state.treadZ);

    const stepDt = dt > 0 ? dt : 1e-5;
    if (activeScenario.id === "fpStrafeLegs") {
      if (dt > 0) {
        oldFp.Update(cmd.vx, cmd.vz, dt);
        newFp.Update(cmd.vx, cmd.vz, dt);
      }
    } else {
      oldUnit.Update(cmd, stepDt, state.vis);
      newUnit.Update(cmd, stepDt, state.vis);
    }

    // Update synced camera
    const target = new THREE.Vector3(0, orbit.targetY, 0).add(orbit.pan);
    const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    camera.position.set(
      target.x - Math.sin(orbit.yaw) * cp * orbit.dist,
      target.y + sp * orbit.dist,
      target.z - Math.cos(orbit.yaw) * cp * orbit.dist,
    );
    camera.lookAt(target);

    // Split center region between left (#side 330px) and right (#inspector 358px) panels
    const stageRect = $("stageHud").getBoundingClientRect();
    const leftPx = Math.max(0, Math.floor(stageRect.left));
    const widthPx = Math.max(2, Math.floor(stageRect.width));
    const halfW = Math.floor(widthPx / 2);
    const bottomY = Math.max(0, viewH - Math.floor(stageRect.bottom));
    const heightPx = Math.max(2, Math.floor(stageRect.height));

    // Clear full canvas background
    renderer.setScissorTest(false);
    renderer.setClearColor(0x0b0c0a, 1);
    renderer.clear();
    renderer.setScissorTest(true);

    // Left viewport: Old (Before)
    camera.aspect = halfW / heightPx;
    camera.updateProjectionMatrix();
    renderer.setViewport(leftPx, bottomY, halfW, heightPx);
    renderer.setScissor(leftPx, bottomY, halfW, heightPx);
    renderer.render(oldStage.scene, camera);

    // Right viewport: New (After)
    const rightW = widthPx - halfW;
    camera.aspect = rightW / heightPx;
    camera.updateProjectionMatrix();
    renderer.setViewport(leftPx + halfW, bottomY, rightW, heightPx);
    renderer.setScissor(leftPx + halfW, bottomY, rightW, heightPx);
    renderer.render(newStage.scene, camera);

    uiAccum += rawDt;
    if (uiAccum >= 0.08) {
      uiAccum = 0;
      RenderDiffTable(cmd);
    }
  }

  function Loop(now) {
    const rawDt = Math.min((now - lastTs) / 1000, 0.1);
    lastTs = now;
    StepFrame(rawDt);
    requestAnimationFrame(Loop);
  }
  requestAnimationFrame(Loop);

  // Expose automation / inspection handle
  window.MotionCompare = {
    ready: true,
    scenarios: SCENARIOS.map((s) => s.id),
    setScenario: (id) => SelectScenario(id),
    setOldAim: (mode) => { $("selOldAim").value = mode; $("selOldAim").dispatchEvent(new Event("change")); },
    setAim: (yawDeg, pitchDeg) => {
      state.manualAim = true;
      $("chkManualAim").checked = true;
      $("chipManualAim").classList.add("on");
      SetManualAim(yawDeg, pitchDeg);
    },
    setSlowMo: (rate) => { state.rate = rate; },
    fire: () => { state.manualFireSeq += 1; },
    step: (dt = 1 / 60, count = 1) => { for (let i = 0; i < count; i++) StepFrame(dt); },
    state: () => ({
      scenario: activeScenario.id,
      aimOffsetLoaded: !!bank.aimOffsetGrid,
      old: { ...oldUnit.telemetry },
      new: { ...newUnit.telemetry },
      fpOld: { curClearCm: oldFp.curClearCm, minClearCm: oldFp.minClearCm, maxSlipMm: +oldFp.maxSlipMm.toFixed(2) },
      fpNew: { curClearCm: newFp.curClearCm, minClearCm: newFp.minClearCm, maxSlipMm: +newFp.maxSlipMm.toFixed(2) },
    }),
  };
}

Main().catch((error) => {
  console.error("[MotionCompare] boot failed:", error);
  const step = $("bootStep");
  if (step) step.textContent = `启动失败：${error?.message || error}`;
});
