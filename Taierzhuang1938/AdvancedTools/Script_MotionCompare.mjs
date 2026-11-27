// 动作衔接对比工具（Tool_MotionCompare.html，2026-11-21）。
//
// 左右同步分屏实机对照 3C 动作系统优化前后（左：优化前旧方案；右：新 3C 体系 + BlenderMCP 9 帧精修 Aim Offset）：
//   01 · 持枪横移与斜向跑动     — 2D Blend Space 相位对齐（Sync Marker）+ 权重阻尼 + Orientation Warping vs 单向硬漂
//   02 · 静止持枪原地转身       — Turn-in-Place（±44° 死区锁脚 + 迈步转身 + Hips 偏航剥离）vs 脚底抹油原地自转
//   03 · 9 向精修 Aim Offset   — BlenderMCP 9 帧（Mesh-Space 脊柱 + Local-Space 锁骨/双臂贴腮）vs 无/纯数学脊柱
//   04 · 跑动与横移中开火       — 上半身 Masked Additive 后坐（双腿 0° 透明）vs 切站立开火 0.35 s 冻腿滑冰
//   05 · 综合实战机动           — 掩体警戒 → 扫视 → 迈步转向 → 斜前突击 → 跑动点射 → 停步蹲姿瞄准
//   06 · 第一人称侧向双腿防穿插 — 真 FirstPersonGait 求解器对照（旧 11.8 cm 穿插 vs 新 15.5 cm 净距 + 0 mm 滑步）
//   07 · 自由操控沙盒           — WASD 移动 + Shift 疾跑 + Q/E 转向 + C 蹲站 + F 点射 + 9 宫格瞄准

import * as THREE from "three";
import { clone as CloneSkinned } from "../vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { ManagedGLTFLoader as GLTFLoader } from "../Script_ModelImports.mjs";
import { SetTextureImportRenderer } from "../Script_TextureImports.mjs";
import { LoadModel } from "../Script_MeshLoad.mjs";
import { ConfigureHanYang173R, LoadHanYang173R, InstantiateHanYang173R } from "../Script_HanYang173R.mjs";
import { AimAt } from "../Script_MixamoProps.mjs";
import { XBOT_CHARACTERS } from "../Data_XBotCharacters.mjs";
import { ClipForCharacter } from "../Script_XBotCharacters.mjs";
import { LoadHairGroom, LoadHairAtlas, HairGroom } from "../Script_HairGroom.mjs";
import { XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE, XBOT_AIM_OFFSET } from "../Data_BlockoutXBotClips.mjs";
import {
  NPC_3C, XBOT_UPPER_BODY_TURN_MASK_BONES, WrapAngle, Clamp, Smooth01,
  ComputeLocomotion2D, FootLockController, TurnInPlaceController, EvaluateSpineAimDistribution,
  EvaluateAimOffsetGridWeights, EvaluateAdditiveFireRecoil,
} from "../Script_NpcLocomotion3C.mjs";
import { FirstPersonGait, ModelToWorld } from "../Script_FirstPersonGait.mjs";
import { FIRST_PERSON_BODY } from "../Data_Tuning_FirstPersonBody.mjs";
import { ApplyEditorLiteCameraProfile } from "../Script_CameraProfile.mjs";

const BASE = "./Animation/Mixamo/";
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

// 全部线上已配置角色（保留优先展示顺序：主角团 → 友军/百姓 → 日军 → X Bot）
const PREFERRED_CHAR_ORDER = [
  "heYoutian", "luo", "shunzi", "donggua", "yaowa", "oldGeng", "liuWencai",
  "ijaJia", "ijaA", "ijaYi", "ijaC", "taniHisao", "azumaShiro",
  "interpreter", "tianSao", "nier", "erya", "xbot",
];
const CHAR_KEYS = [
  ...PREFERRED_CHAR_ORDER.filter((k) => XBOT_CHARACTERS[k]),
  ...Object.keys(XBOT_CHARACTERS).filter((k) => !PREFERRED_CHAR_ORDER.includes(k)),
];

const RIFLE_LABELS = { HanYang: "汉阳造", Type38: "三八式", ZhongZheng: "中正式" };

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
    tag: "锁地 IK + 扭曲",
    hint: "枪口锁定前方靶标，身体斜前/纯侧/斜后平滑换向机动，观察靴底与地钉圆环",
    defaultCam: "front34",
    captionTitle: "实测步速标定 · 主干朝向扭曲 · 支撑脚锁地 2-Bone IK",
    captionDesc: "左（旧）：单条前跑硬漂，落地红环会瞬间甩开靴底形成 15~40 cm 脚滑。右（新）：主干片段 100% 满步幅 + ±45° 无重叠加扭胯 + 支撑脚锁地 IK，靴底牢牢钉在绿环上直到抬腿。",
    checklist: "观察要点：开 0.5x 慢放或切「俯视步法」看靴底与地面圆环——左脚踩下即被红环甩开，右脚踩下即锁死绿环随地砖同步后退。",
  },
  {
    id: "turnInPlace",
    index: "02",
    name: "静止持枪原地转身",
    tag: "Turn-in-Place",
    hint: "目标先在 ±35° 死区内微移，再大角度甩到 ±88° 观察迈步衔接",
    defaultCam: "front34",
    captionTitle: "±44° 死区双脚锁死 · 分层锁枪迈步转身（不垂枪）",
    captionDesc: "左（旧）：目标微动即整个人像电动转盘原地蹭脚自转。右（新）：±44° 内双脚纹丝不动仅转上身；超 44° 后下半身播 Turn90 迈步并按真实偏航曲线同拍收敛，上半身分层锁死在抵肩瞄准姿，全程绝不放低步枪。",
    checklist: "观察要点：切 0.5x 慢放盯住靴底与地面砖缝——左侧全程原地打滑，右侧死区内钉死、过 44° 后清晰迈步把下盘带正。",
  },
  {
    id: "aimOffset9",
    index: "03",
    name: "9 向精修 Aim Offset 对照",
    tag: "Blender 9 帧",
    hint: "自动循环九宫格瞄准，也可切换「左侧=纯数学脊柱」细品锁骨与贴腮差异",
    defaultCam: "front34",
    captionTitle: "右撇子探肩 / 耸肩 / 贴腮手肘雕刻 · 双脚 0° 零漂移",
    captionDesc: "左（旧）：无偏移时脱靶；切「纯数学 5 节脊柱」时双肩与肘部仍僵硬。右（新）：BlenderMCP 9 帧资产右瞄左肩前探、抬枪锁骨上提、下瞄抬头保准星。",
    checklist: "推荐对比：把「左侧 Aim」切到「纯数学 5 节脊柱」，点上方九宫格的「→ 正右」「↗ 右上」，直观对比肩肘与贴腮差异。",
  },
  {
    id: "moveAndFire",
    index: "04",
    name: "跑动与横移中开火",
    tag: "Additive 开火",
    hint: "斜向冲刺时每 0.85 秒点射一次，重点看开火瞬间双腿是否被冻住滑步",
    defaultCam: "side",
    captionTitle: "开火后坐不打断下半身步态（冻腿滑冰 vs 0° 透明叠加）",
    captionDesc: "左（旧）：每次开火强切站立开火 0.35 秒，双腿瞬间急刹冻住向前打滑。右（新）：上半身 Additive 后坐叠加 + 阻尼回肩，双腿步态 100% 连贯。",
    checklist: "观察要点：正侧面机位盯住枪口闪光后的 0.35 秒——左侧双腿僵直打滑，右侧照常大步跨进、仅肩胸和枪弹跳回肩。",
  },
  {
    id: "combatSequence",
    index: "05",
    name: "综合实战机动衔接",
    tag: "全链路串联",
    hint: "12 秒战斗循环：警戒扫视 → 迈步转身 → 斜前突击 → 跑动点射 → 蹲姿急停瞄准",
    defaultCam: "front34",
    captionTitle: "多状态高频切换连续流畅度与持枪稳定性",
    captionDesc: "左（旧）：站→转→跑→开火→蹲每步衔接生硬断层、脚底滑移。右（新）：五大模块协同工作，停步不抖枪，全程自然连贯。",
    checklist: "观察要点：先 1.0x 看完整 12 秒，再切 0.5x 细看「斜前突击→移动开火→急停下蹲瞄准」三段交界处。",
  },
  {
    id: "fpStrafeLegs",
    index: "06",
    name: "第一人称侧向双腿防穿插",
    tag: "FP 腿距求解",
    hint: "真实 FirstPersonGait 求解器对照：旧参数 11.7 cm 穿插 vs 新参数 15.5 cm 净距",
    defaultCam: "fpDown",
    captionTitle: "低头侧向横移双腿 3D 轴线净距与着地 0 mm 滑移",
    captionDesc: "左（旧参数）：扭曲 40° 且无步宽/外摆弧，交错时净距跌至 ~11.7 cm 标红穿插。右（新参数）：扭曲 54° + 步宽 7.5 cm + 外摆弧 5.5 cm，保持 ≥ 15.5 cm 且 0 mm 滑步。",
    checklist: "观察要点：看两腿间那根实时测距标尺（红 = 穿插风险，绿 = 安全净距），可切「3/4 前视」与「低头看脚」双角度复核。",
  },
  {
    id: "sandbox",
    index: "07",
    name: "自由操控沙盒",
    tag: "WASD + F",
    hint: "键盘 WASD 任意走位、Shift 疾跑、Q/E 转向、C 蹲站、F 开火，左右同步响应",
    defaultCam: "front34",
    captionTitle: "自由操控：同一份输入同步驱动左右两套动作系统",
    captionDesc: "支持随意启停、斜跑点射、原地缓转与手动九宫格瞄准，可直接检验启停瞬间的步枪与脚步衔接。",
    checklist: "推荐连招：按住 W+D 斜前跑同时连按 F 点射 → 突然松手急停检查步枪是否稳如磐石 → 原地按 Q/E 缓转检验 44° 死区迈步。",
  },
];

// ---------- Shared Scratch Math ----------
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v3 = new THREE.Vector3();
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
function ClosestPointsSegments(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-10 && e <= 1e-10) return { dist: p1.distanceTo(p2), a: p1.clone(), b: p2.clone() };
  if (a <= 1e-10) t = Clamp(f / e, 0, 1);
  else {
    const c = d1.dot(r);
    if (e <= 1e-10) s = Clamp(-c / a, 0, 1);
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
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

// ---------- Seamless Anti-Aliased Tiled Ground Texture (Zero Flashing Center Cross!) ----------
function CreateTiledFloorTexture(renderer) {
  const size = 512;
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const ctx = cv.getContext("2d");
  const half = size / 2;

  // 2×2 subtle matte checker (represents 2m × 2m world area -> 1m per tile!)
  ctx.fillStyle = "#2b2c2a";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#31322f";
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);

  // Subtle 0.25m sub-grid hairlines
  ctx.strokeStyle = "rgba(214, 217, 209, 0.045)";
  ctx.lineWidth = 1;
  const step = size / 8;
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const p = Math.round(i * step) + 0.5;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  // Crisp 1.0m primary tile seams
  ctx.strokeStyle = "rgba(214, 217, 209, 0.14)";
  ctx.lineWidth = 2;
  for (const p of [0, half]) {
    ctx.beginPath(); ctx.moveTo(p + 1, 0); ctx.lineTo(p + 1, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p + 1); ctx.lineTo(size, p + 1); ctx.stroke();
  }

  // Muted corner registration ticks on every 1m intersection (steady visual velocity reference, zero flicker!)
  ctx.strokeStyle = "rgba(212, 184, 114, 0.28)";
  ctx.lineWidth = 2;
  const tick = 10;
  for (const x of [0, half]) {
    for (const y of [0, half]) {
      ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + tick, y + 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + tick); ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30); // 60m plane / 2m per repeat = exact 1.0m tiles!
  tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

// ---------- Asset Manager (Shared across Old & New Rigs) ----------
class CompareAssetBank {
  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new GLTFLoader();
    SetTextureImportRenderer(renderer);
    this.xbotSource = null;
    this.rootParent = null;
    this.hipsParentInv = null;
    this.rifleOffset = null;
    this.aimOffsetGrid = null;
    this.rawClips = new Map();
    this.overrideClips = new Map();
    this.charClips = new Map();
    this.additiveFireCache = new Map();
    this.turnYawCache = new Map();
    this.upperPoseCache = new Map();
    this.charSources = new Map();
    this.groomCache = new Map();
    this.hairAtlas = null;
    this.rifles = new Map();
    this.library = new Map();
  }

  async Init(onProgress) {
    onProgress(15, "读取 Mixamo 动作清单与基准骨架…");
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

    onProgress(40, "预载四向步态、原地转身、开火与 9 帧精修 Aim Offset…");
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
    onProgress(70, "标定步枪握持基准与循环接缝闭合…");
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
    if (loop) this._CloseLoopSeam(clip);
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

  /** 对循环片段末两帧向首帧做平滑闭合，消除 RifleRun_V1 等 Mixamo 原始片段回绕瞬间的局部抽搐。 */
  _CloseLoopSeam(clip) {
    const q0 = new THREE.Quaternion(), qn = new THREE.Quaternion(), qi = new THREE.Quaternion();
    for (const tr of clip.tracks) {
      if (!tr.name.endsWith(".quaternion")) continue;
      const n = tr.times.length;
      if (n < 6) continue;
      const v = tr.values;
      q0.set(v[0], v[1], v[2], v[3]).normalize();
      qn.set(v[(n - 1) * 4], v[(n - 1) * 4 + 1], v[(n - 1) * 4 + 2], v[(n - 1) * 4 + 3]).normalize();
      if (q0.dot(qn) < 0) qn.set(-qn.x, -qn.y, -qn.z, -qn.w);
      if (q0.angleTo(qn) < 0.015) continue;
      v[(n - 1) * 4] = q0.x; v[(n - 1) * 4 + 1] = q0.y; v[(n - 1) * 4 + 2] = q0.z; v[(n - 1) * 4 + 3] = q0.w;
      const prevOff = (n - 2) * 4;
      qi.set(v[prevOff], v[prevOff + 1], v[prevOff + 2], v[prevOff + 3]).normalize();
      if (qi.dot(q0) < 0) qi.set(-qi.x, -qi.y, -qi.z, -qi.w);
      qi.slerp(q0, 0.5).normalize();
      v[prevOff] = qi.x; v[prevOff + 1] = qi.y; v[prevOff + 2] = qi.z; v[prevOff + 3] = qi.w;
    }
  }

  async PreloadCharacterOverrides(charKey) {
    const def = XBOT_CHARACTERS[charKey];
    if (!def?.clipOverrides) return;
    await Promise.all(Object.entries(def.clipOverrides).map(async ([file, url]) => {
      const k = `${charKey}|${file}`;
      if (this.overrideClips.has(k)) return;
      try {
        const g = await this.loader.loadAsync(url);
        if (g.animations?.[0]) this.overrideClips.set(k, g.animations[0]);
      } catch {
        // Fallback silently to shared Mixamo clip
      }
    }));
  }

  GetClipFor(charKey, file) {
    const key = `${charKey}|${file}`;
    if (this.charClips.has(key)) return this.charClips.get(key);
    const raw = this.overrideClips.get(key) || this.rawClips.get(file);
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

  SampleTurnCurveFrac(file, u) {
    const curve = file ? this.TurnYawCurve(file) : null;
    if (!curve || !curve.values.length) return null;
    const total = curve.values[curve.values.length - 1];
    if (Math.abs(total) < 0.05) return null;
    return Clamp(SampleScalarCurve(curve, Clamp(u, 0, 1) * curve.duration) / total, 0, 1);
  }

  IdleUpperPose(file) {
    if (this.upperPoseCache.has(file)) return this.upperPoseCache.get(file);
    const clip = this.rawClips.get(file);
    if (!clip || !this.xbotSource) return null;
    const model = CloneSkinned(this.xbotSource);
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.time = 0;
    mixer.update(0);
    model.updateMatrixWorld(true);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    const sp = model.getObjectByName("Spine"), sp1 = model.getObjectByName("Spine1");
    let spineModelQ = null, spine1ModelQ = null;
    if (sp) { sp.matrixWorld.decompose(wp, wq, ws); spineModelQ = wq.clone().normalize(); }
    if (sp1) { sp1.matrixWorld.decompose(wp, wq, ws); spine1ModelQ = wq.clone().normalize(); }
    const localQ = new Map();
    for (const name of XBOT_UPPER_BODY_TURN_MASK_BONES) {
      const b = model.getObjectByName(name);
      if (b) localQ.set(name, b.quaternion.clone().normalize());
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    const entry = { spineModelQ, spine1ModelQ, localQ };
    this.upperPoseCache.set(file, entry);
    return entry;
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
    if (this.rifles.has(id)) return this.rifles.get(id);
    if (id === "HanYang") {
      const p = LoadHanYang173R().then((asset) => {
        ConfigureHanYang173R(asset, null, this.renderer.capabilities.getMaxAnisotropy());
        const inst = InstantiateHanYang173R(asset);
        return {
          root: inst.root,
          mounts: {
            gripL: inst.nodes.get("gripL"),
            muzzle: inst.nodes.get("muzzle"),
          },
        };
      });
      this.rifles.set(id, p);
      return p;
    }
    const p = LoadModel(`./Model/Model_${id}.tzm.json`, { materials: RIFLE_MATERIALS }).then((built) => {
      if (!built) return null;
      built.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return built;
    });
    this.rifles.set(id, p);
    return p;
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
    this.rifleGripL = new THREE.Vector3(0, -0.012, -0.418);
    this.rifleMuzzle = new THREE.Vector3(0, 0.038, -0.995);
    this.muzzleFlash = null;
    this.charKey = "heYoutian";
    this.hipsScale = 1;
    this.ankleRestOffY = 0.095;
    this.lastFootProbe = [
      { locked: false, lockX: 0, lockZ: 0, animX: 0, animY: 0, animZ: 0, rawSlipCm: 0, solvedSlipCm: 0 },
      { locked: false, lockX: 0, lockZ: 0, animX: 0, animY: 0, animZ: 0, rawSlipCm: 0, solvedSlipCm: 0 },
    ];

    // 3C & legacy state
    this.tip = new TurnInPlaceController();
    this.footLock = new FootLockController();
    this.slipProbe = new FootLockController(); // 仅用于测量优化前旧方案的支撑脚真实滑移量
    this.locoRunning = false;
    this.locoPrimary = null;
    this.locoPhase = 0;
    this.pelvisWarp = 0;
    this.blendActions = new Map();
    this.blendWeights = new Map();
    this.activeAction = null;
    this.activeFile = null;
    this.activeClock = 0;
    this.addFireAge = Infinity;
    this.oldFireHold = 0;
    this.lastFireSeq = 0;
    this.flashAge = Infinity;
    this.oldAimBaseline = "none";

    // Pre-overlay pose capture for clean, jitter-free state cross-fading (NO double AimOffset / NO T-pose flash!)
    this.preOverlayQ = [];
    this.preOverlayHips = new THREE.Vector3();
    this.preOverlayValid = false;
    this.pickKey = null;
    this.blend = null;

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
      footSlipCm: 0,
      footLocked: false,
    };

    // Visual diagnostic overlays (arrows + aim ray + target post + foot-lock ground contact rings)
    this.visGroup = new THREE.Group();
    this.scene.add(this.visGroup);
    this.arrowAim = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.05, 0), 0.92, 0xdfbd68, 0.16, 0.11);
    this.arrowHips = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.035, 0), 0.76, 0x67c5d8, 0.14, 0.09);
    this.arrowVel = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.065, 0), 0.85, 0x7fd486, 0.15, 0.10);
    const padGeo = new THREE.RingGeometry(0.055, 0.085, 18);
    padGeo.rotateX(-Math.PI / 2);
    this.footPads = [0, 1].map(() => {
      const m = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ color: mode === "new" ? 0x7fd486 : 0xe86f58, side: THREE.DoubleSide }));
      m.position.y = 0.008;
      m.visible = false;
      this.visGroup.add(m);
      return m;
    });
    this.visGroup.add(this.arrowAim, this.arrowHips, this.arrowVel);

    // Aim target marker & muzzle ray
    this.targetGroup = new THREE.Group();
    this.scene.add(this.targetGroup);
    const ringGeo = new THREE.RingGeometry(0.11, 0.15, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: mode === "new" ? 0xdfbd68 : 0xd6604a, side: THREE.DoubleSide });
    this.targetRing = new THREE.Mesh(ringGeo, ringMat);
    const coreGeo = new THREE.SphereGeometry(0.042, 12, 10);
    const coreMat = new THREE.MeshBasicMaterial({ color: mode === "new" ? 0xf5df9c : 0xef8a75 });
    this.targetCore = new THREE.Mesh(coreGeo, coreMat);
    this.targetMarker = new THREE.Group();
    this.targetMarker.add(this.targetRing, this.targetCore);
    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2)]);
    const rayMat = new THREE.LineBasicMaterial({ color: mode === "new" ? 0xdfbd68 : 0xd6604a, transparent: true, opacity: 0.7 });
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
      this.bank.PreloadCharacterOverrides(charKey),
    ]);
    if (this.model) {
      this.mixer?.stopAllAction();
      this.mixer?.uncacheRoot(this.model);
      this.container.remove(this.model);
    }
    this.hair?.Dispose();
    this.hair = null;

    this.model = CloneSkinned(src);
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
    this.preOverlayQ = this.boneList.map(() => new THREE.Quaternion());
    this.baseValid = false;
    this.preOverlayValid = false;
    this.blend = null;
    this.pickKey = null;

    if (groomPack && this.H("Head")) {
      this.hair = new HairGroom(groomPack.groom, { atlas: groomPack.atlas, name: charKey, boneRoot: this.model });
      this.H("Head").add(this.hair.root);
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    this.blendActions.clear();
    this.blendWeights.clear();
    this.activeAction = null;
    this.activeFile = null;

    this.container.updateMatrixWorld(true);
    const lfBind = this.H("LeftFoot"), rfBind = this.H("RightFoot");
    const bindLy = lfBind ? lfBind.getWorldPosition(_p).y : 0.095;
    const bindRy = rfBind ? rfBind.getWorldPosition(_p).y : bindLy;
    this.ankleRestOffY = Clamp((bindLy + bindRy) * 0.5, 0.06, 0.18);
    this.footLock.Reset();
    this.slipProbe.Reset();
    this.locoPrimary = null;
  }

  async SetRifle(id) {
    const built = await this.bank.LoadRifle(id);
    if (this.rifleObj) this.scene.remove(this.rifleObj);
    if (!built) return;
    this.rifleObj = built.root.clone(true);
    this.scene.add(this.rifleObj);
    this.rifleGripL.copy(built.mounts?.gripL?.position || new THREE.Vector3(0, -0.012, -0.418));
    this.rifleMuzzle.copy(built.mounts?.muzzle?.position || new THREE.Vector3(0, 0.038, -0.995));

    const flashGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.92 });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.copy(this.rifleMuzzle);
    this.muzzleFlash.visible = false;
    this.rifleObj.add(this.muzzleFlash);
  }

  Reset(yaw = 0) {
    this.tip.Reset(yaw);
    this.footLock.Reset();
    this.slipProbe.Reset();
    this.locoRunning = false;
    this.locoPrimary = null;
    this.locoPhase = 0;
    this.pelvisWarp = 0;
    this.addFireAge = Infinity;
    this.oldFireHold = 0;
    this.flashAge = Infinity;
    this.lastFireSeq = 0;
    this.preOverlayValid = false;
    this.blend = null;
    this.pickKey = null;
    this.activeClock = 0;
    this.blendWeights.clear();
    this.telemetry.footSlipCm = 0;
    this.telemetry.footLocked = false;
    for (const p of this.footPads) p.visible = false;
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

    // Mount rifle + 2-Bone Left Arm IK cleanly AFTER single-pass Aim Offset & Recoil
    this._PlaceRifleAndIk();

    // Update 3D diagnostic overlays
    this._UpdateVisuals(yaw, vx, vz, mps, lookYaw, lookPitch, visOpts);
  }

  _CapturePreOverlay() {
    for (let i = 0; i < this.boneList.length; i++) this.preOverlayQ[i].copy(this.boneList[i].quaternion);
    const hips = this.H("Hips");
    if (hips) this.preOverlayHips.copy(hips.position);
    this.preOverlayValid = true;
  }

  _UpdateOld(yaw, vx, vz, mps, stance, lookYaw, lookPitch, dt) {
    this.container.position.set(0, 0, 0);
    this.container.rotation.set(0, yaw, 0);
    this.container.updateMatrixWorld(true);

    let file, label, rate = 1, loop = true, isFireLock = false;
    if (this.oldFireHold > 0) {
      file = stance === "crouch" ? XBOT_NATIVE.fireCrouch.file : XBOT_NATIVE.fireStand.file;
      label = mps > 0.15 ? "开火锁腿滑步" : "站立开火";
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
    if (this.preOverlayValid && key !== this.pickKey) this._BeginBlend(0.18);
    this.pickKey = key;

    this._PlaySingleClip(file, dt, rate, loop, this.oldFireHold > 0 ? 0.35 - this.oldFireHold : null);
    this._ApplyBlend(dt);
    this._CapturePreOverlay();
    this.container.updateMatrixWorld(true);
    this._ProbeOldFootSlip(vx, vz, dt, mps > 0.12);

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
      vx, vz, yaw, stance, aimWeight: 1, rifleInHands: true, speedMps: mps,
      running: this.locoRunning, prevPrimary: this.locoPrimary,
    });
    this.locoRunning = loco.running;
    this.locoPrimary = loco.moving ? loco.primary : null;
    const tip = this.tip.Update(dt, {
      yaw, mps, stance, aimWeight: 1, rifleInHands: true, active: true, teleported: false,
      sampleTurnFrac: (clipKey, u) => this.bank.SampleTurnCurveFrac(XBOT_TURN_IN_PLACE[clipKey]?.file, u),
    });
    this.pelvisWarp = Approach(this.pelvisWarp, loco.pelvisWarpRad, dt, 0.11);
    const lowerYawOff = WrapAngle(tip.visualYawOffset + this.pelvisWarp);

    this.container.position.set(0, 0, 0);
    this.container.rotation.set(0, yaw + lowerYawOff, 0);
    this.container.updateMatrixWorld(true);

    let key = "", label = "";
    if (tip.turning && tip.turnClipKey && XBOT_TURN_IN_PLACE[tip.turnClipKey]) {
      const entry = XBOT_TURN_IN_PLACE[tip.turnClipKey];
      const turnFile = entry.file;
      const clip = this.bank.GetClipFor(this.charKey, turnFile);
      const turnTime = tip.turnProgress * (clip?.duration || 0.7);
      key = "tip:" + turnFile;
      label = tip.turnDir > 0 ? "原地左迈步转身（锁枪）" : "原地右迈步转身（锁枪）";
      if (this.preOverlayValid && key !== this.pickKey) this._BeginBlend(0.12);
      this.pickKey = key;
      this._PlaySingleClip(turnFile, dt, 1, false, turnTime);
      const hips = this.H("Hips");
      const curve = hips ? this.bank.TurnYawCurve(turnFile) : null;
      if (curve) {
        const yawDelta = SampleScalarCurve(curve, turnTime);
        if (Math.abs(yawDelta) > 1e-4) {
          this.container.updateMatrixWorld(true);
          RotateBoneWorld(hips, _yawQ.setFromAxisAngle(_up, -yawDelta));
        }
      }
      // 分层遮罩（Mesh-Space Layered Blend）：下盘迈步转身，上半身全程锁在抵肩瞄准姿绝不垂枪
      const idleFile = stance === "crouch" ? XBOT_NATIVE.crouchIdleRifleAim.file : XBOT_NATIVE.standIdleRifleAim.file;
      this._ApplyTurnUpperBodyMask(idleFile, 1.0);
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
      const gaitZh = stance === "crouch" ? "蹲走" : (loco.running ? "跑" : "走");
      const wDeg = Math.round(this.pelvisWarp / DEG);
      label = entries.length > 1
        ? `主干${dirZh[entries[0].dir]}/${dirZh[entries[1].dir]}${gaitZh} + 扭胯`
        : (Math.abs(wDeg) >= 2
          ? `主干${dirZh[entries[0]?.dir || "forward"]}${gaitZh} + 扭胯 ${wDeg > 0 ? "+" : ""}${wDeg}°`
          : `主干${dirZh[entries[0]?.dir || "forward"]}${gaitZh}`);
      if (this.preOverlayValid && key !== this.pickKey) this._BeginBlend(0.18);
      this.pickKey = key;
      this._PlayBlendSpace(entries, mps, dt);
    } else {
      const file = stance === "crouch" ? XBOT_NATIVE.crouchIdleRifleAim.file : XBOT_NATIVE.standIdleRifleAim.file;
      key = "idle:" + file;
      label = Math.abs(tip.visualYawOffset) > 0.03 ? "死区锁脚 + 腰肩瞄准" : "持枪瞄准待机";
      if (this.preOverlayValid && key !== this.pickKey) this._BeginBlend(0.16);
      this.pickKey = key;
      this._PlaySingleClip(file, dt, 1, true, null);
    }

    this._ApplyBlend(dt);
    // 严格在 AimOffset / 开火叠加 / 锁地 IK / 左手 IK 之前保存纯净底层姿态，停步过渡绝不重复叠 AimOffset！
    this._CapturePreOverlay();
    this.container.updateMatrixWorld(true);

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

    // 三态支撑脚锁地与停步收步 2-Bone Leg IK（move / turn / idle 全覆盖）：
    // 行进零搓地、转身轴脚 0 漂移、急停切静止由一脚钉死 + 另一脚抬腿弧线收齐，对上身/枪线零干扰
    const footMode = tip.turning ? "turn" : (loco.moving ? "move" : "idle");
    this._ApplyFootLock(vx, vz, dt, footMode);

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
      // 关键：清除 Three.js PropertyMixer 残留累积缓冲，杜绝从 blend2d 切回 idle 时闪一帧 T-Pose / 原点！
      this.mixer.uncacheRoot(this.model);
      this.blendActions.clear();
      this.blendWeights.clear();
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
      this.baseValid = false;
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
    this.mixer.update(Math.max(dt, 1e-5));
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
      this.mixer.uncacheRoot(this.model);
      this.blendActions.clear();
      this.blendWeights.clear();
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
    const rate = mps > 0.05 ? Clamp(mps / Math.max(nominal * this.hipsScale, 0.2), 0.12, 2.4) : 0;
    this.locoPhase = (this.locoPhase + (dt * rate) / Math.max(effDur, 0.2)) % 1;
    if (this.locoPhase < 0) this.locoPhase += 1;

    const targetMap = new Map();
    const entryMeta = new Map();
    const isFresh = this.blendActions.size === 0;
    for (const r of resolved) {
      targetMap.set(r.file, r.weight);
      entryMeta.set(r.file, r);
      if (!this.blendActions.has(r.file)) {
        const action = this.mixer.clipAction(r.clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = 0;
        action.enabled = true;
        action.play();
        this.blendActions.set(r.file, action);
        this.blendWeights.set(r.file, isFresh ? r.weight : 0);
      }
    }

    // 平滑阻尼四向混合权重 + 归一化，消除跨 45° / 90° 方向界时的单帧脚步抽搐
    const damp = 1 - Math.exp(-Math.max(dt, 0) / 0.085);
    let smoothSum = 0;
    for (const [file] of this.blendActions) {
      const tgt = targetMap.get(file) || 0;
      const cur = this.blendWeights.get(file) ?? tgt;
      const next = Math.abs(tgt - cur) < 1e-4 ? tgt : cur + (tgt - cur) * damp;
      this.blendWeights.set(file, next);
      smoothSum += next;
    }
    for (const [file, action] of this.blendActions) {
      const rawW = this.blendWeights.get(file) || 0;
      const effW = smoothSum > 1e-5 ? rawW / smoothSum : 0;
      action.enabled = effW > 1e-4;
      action.setEffectiveWeight(effW);
      if (effW > 1e-4) {
        const meta = entryMeta.get(file);
        const phaseOff = meta?.phaseOffset ?? action._phaseOffset ?? 0;
        action._phaseOffset = phaseOff;
        const dur = action.getClip().duration || 1;
        action.time = ((this.locoPhase + phaseOff) % 1) * dur;
      }
    }

    this.mixer.update(Math.max(dt, 1e-5));
    for (let i = 0; i < this.boneList.length; i++) this.base[i].copy(this.boneList[i].quaternion);
    if (this.H("Hips")) this.baseHips.copy(this.H("Hips").position);
    this.baseValid = true;
  }

  _BeginBlend(dur = 0.18) {
    if (!this.preOverlayValid) return;
    const b = this.blend || (this.blend = { q: this.boneList.map(() => new THREE.Quaternion()), hips: new THREE.Vector3(), t: 0, dur });
    for (let i = 0; i < this.boneList.length; i++) b.q[i].copy(this.preOverlayQ[i]);
    b.hips.copy(this.preOverlayHips);
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

  _ApplyTurnUpperBodyMask(idleFile, maskW) {
    if (maskW <= 1e-3) return;
    const pose = this.bank.IdleUpperPose(idleFile);
    if (!pose) return;
    this.container.updateMatrixWorld(true);
    this.model.matrixWorld.decompose(_p, _aoModelQ, _s);
    _aoModelQ.normalize();

    const spine = this.H("Spine");
    if (spine && pose.spineModelQ) {
      _aimQ.copy(_aoModelQ).multiply(pose.spineModelQ).normalize();
      _aimQ2.copy(FreshQuaternion(spine));
      if (_aimQ2.dot(_aimQ) < 0) _aimQ.set(-_aimQ.x, -_aimQ.y, -_aimQ.z, -_aimQ.w);
      _aimQ2.slerp(_aimQ, 0.78 * maskW).normalize();
      SetBoneWorldQuaternion(spine, _aimQ2);
    }

    const spine1 = this.H("Spine1");
    if (spine1 && pose.spine1ModelQ) {
      _aimQ.copy(_aoModelQ).multiply(pose.spine1ModelQ).normalize();
      if (maskW >= 0.999) {
        SetBoneWorldQuaternion(spine1, _aimQ);
      } else {
        _aimQ2.copy(FreshQuaternion(spine1));
        if (_aimQ2.dot(_aimQ) < 0) _aimQ.set(-_aimQ.x, -_aimQ.y, -_aimQ.z, -_aimQ.w);
        _aimQ2.slerp(_aimQ, maskW).normalize();
        SetBoneWorldQuaternion(spine1, _aimQ2);
      }
    }

    for (const [name, qTarget] of pose.localQ) {
      const bone = this.H(name);
      if (!bone) continue;
      if (maskW >= 0.999) {
        bone.quaternion.copy(qTarget);
      } else {
        _aimQ.copy(qTarget);
        if (bone.quaternion.dot(_aimQ) < 0) _aimQ.set(-_aimQ.x, -_aimQ.y, -_aimQ.z, -_aimQ.w);
        bone.quaternion.slerp(_aimQ, maskW).normalize();
      }
    }
    this.container.updateMatrixWorld(true);
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

    const palmL = Palm(lh, this.H("LeftHandMiddle1"), new THREE.Vector3());
    const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(rQuat);
    const toLeft = palmL.clone().sub(rPos);
    const reach = toLeft.length();
    if (reach > 1e-4) AimAt(rQuat, muzzle, toLeft, reach);

    this.rifleObj.position.copy(rPos);
    this.rifleObj.quaternion.copy(rQuat);
    this.rifleObj.updateMatrixWorld(true);

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

  /** 仅探测优化前旧方案的真实着地滑移量，并把红色落地点圆环留在地面上供肉眼对照，不修改旧方案任何骨骼。 */
  _ProbeOldFootSlip(vx, vz, dt, moving) {
    const driftX = -vx * dt, driftZ = -vz * dt;
    let maxSlip = 0, anyLocked = false;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? "Left" : "Right";
      const up = this.H(side + "UpLeg"), lo = this.H(side + "Leg"), ft = this.H(side + "Foot");
      if (!up || !lo || !ft) { this.footPads[i].visible = false; continue; }
      const A = FreshPosition(up), B = FreshPosition(lo), Cw = FreshPosition(ft);
      const maxReachM = A.distanceTo(B) + B.distanceTo(Cw);
      const res = this.slipProbe.UpdateFoot(i, {
        animX: Cw.x, animY: Cw.y, animZ: Cw.z,
        hipX: A.x, hipY: A.y, hipZ: A.z,
        ankleRestY: this.ankleRestOffY, groundY: 0, maxReachM, dt, moving, driftX, driftZ,
      });
      this.footPads[i].visible = res.locked;
      if (res.locked) {
        this.footPads[i].position.set(res.lockX, 0.008, res.lockZ);
        anyLocked = true;
        if (res.rawAnimSlipCm > maxSlip) maxSlip = res.rawAnimSlipCm;
      }
      this.lastFootProbe[i] = {
        locked: res.locked, lockX: res.lockX, lockZ: res.lockZ,
        animX: Cw.x, animY: Cw.y, animZ: Cw.z,
        solvedX: Cw.x, solvedY: Cw.y, solvedZ: Cw.z,
        rawSlipCm: res.rawAnimSlipCm, solvedSlipCm: res.rawAnimSlipCm,
      };
    }
    this.telemetry.footSlipCm = +maxSlip.toFixed(1);
    this.telemetry.footLocked = anyLocked;
  }

  /** 优化后方案的实时三态支撑脚锁地与收步 2-Bone Leg IK，仅改写左右大腿/小腿/踝，绝不影响脊柱与瞄准。 */
  _ApplyFootLock(vx, vz, dt, footMode) {
    const driftX = -vx * dt, driftZ = -vz * dt;
    const rigs = [];
    const inputs = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? "Left" : "Right";
      const up = this.H(side + "UpLeg"), lo = this.H(side + "Leg"), ft = this.H(side + "Foot");
      if (!up || !lo || !ft) { this.footPads[i].visible = false; return; }
      const A = FreshPosition(up), B = FreshPosition(lo), Cw = FreshPosition(ft);
      rigs.push({ up, lo, ft, anim: Cw });
      inputs.push({
        animX: Cw.x, animY: Cw.y, animZ: Cw.z,
        hipX: A.x, hipY: A.y, hipZ: A.z,
        maxReachM: A.distanceTo(B) + B.distanceTo(Cw),
      });
    }
    const results = this.footLock.UpdatePair({
      mode: footMode,
      feet: inputs,
      ankleRestY: this.ankleRestOffY,
      groundY: 0,
      dt,
      driftX,
      driftZ,
    });
    let maxSolvedSlip = 0, anyLocked = false, solvedAny = false;
    for (let i = 0; i < 2; i++) {
      const res = results[i];
      if (res.active) {
        this._SolveLeg(rigs[i].up, rigs[i].lo, rigs[i].ft, _p.set(res.targetX, res.targetY, res.targetZ));
        solvedAny = true;
      }
      const after = FreshPosition(rigs[i].ft);
      const actualSlipCm = res.locked ? +(Math.hypot(after.x - res.lockX, after.z - res.lockZ) * 100).toFixed(1) : 0;
      this.footPads[i].visible = res.locked;
      if (res.locked) {
        this.footPads[i].position.set(res.lockX, 0.008, res.lockZ);
        anyLocked = true;
        if (actualSlipCm > maxSolvedSlip) maxSolvedSlip = actualSlipCm;
      }
      this.lastFootProbe[i] = {
        locked: res.locked, stepping: !!res.stepping, lockX: res.lockX, lockZ: res.lockZ,
        animX: rigs[i].anim.x, animY: rigs[i].anim.y, animZ: rigs[i].anim.z,
        solvedX: after.x, solvedY: after.y, solvedZ: after.z,
        rawSlipCm: res.rawAnimSlipCm, solvedSlipCm: actualSlipCm,
      };
    }
    if (solvedAny) this.container.updateMatrixWorld(true);
    this.telemetry.footSlipCm = +maxSolvedSlip.toFixed(1);
    this.telemetry.footLocked = anyLocked;
  }

  _SolveLeg(upper, lower, foot, target) {
    const footQ = FreshQuaternion(foot);
    const A = FreshPosition(upper), B = FreshPosition(lower), Cw = FreshPosition(foot);
    const lab = A.distanceTo(B), lbc = B.distanceTo(Cw);
    const lat = Clamp(A.distanceTo(target), Math.abs(lab - lbc) + 0.02, (lab + lbc) * 0.985);
    const ba = A.clone().sub(B), bc = Cw.clone().sub(B);
    let axis = ba.clone().cross(bc);
    if (axis.lengthSq() < 1e-10) {
      const e = this.container.matrixWorld.elements;
      axis.set(e[0], e[1], e[2]);
    }
    axis.normalize();
    const cur = ba.angleTo(bc);
    const des = Math.acos(Clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    RotateBoneWorld(lower, new THREE.Quaternion().setFromAxisAngle(axis, des - cur));
    const C2 = FreshPosition(foot);
    const ac = C2.sub(A).normalize(), at = target.clone().sub(A).normalize();
    RotateBoneWorld(upper, new THREE.Quaternion().setFromUnitVectors(ac, at));
    SetBoneWorldQuaternion(foot, footQ);
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
      this.arrowVel.setLength(Clamp(mps * 0.34, 0.45, 1.2), 0.15, 0.10);
    } else {
      this.arrowVel.visible = false;
    }

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

    this.pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.045, 0.075), jointMat);
    this.group.add(this.pelvisMesh);
    this.hipArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.03, 0), 0.72, 0x67c5d8, 0.14, 0.09);
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), 0.78, 0x7fd486, 0.14, 0.09);
    this.group.add(this.hipArrow, this.velArrow);

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
    mesh.quaternion.setFromUnitVectors(_up, b.clone().sub(a).normalize());
  }
}

// ---------- Stage Scene Factory (Smooth Anti-Aliased Tiled Floor + Real Displacement Trail Dots) ----------
function MakeStageScene(renderer, floorTex) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1e21);
  scene.fog = new THREE.Fog(0x1b1e21, 12, 34);
  scene.add(new THREE.HemisphereLight(0xf3ebd9, 0x35322c, 2.1));
  const sun = new THREE.DirectionalLight(0xfff5e4, 3.4);
  sun.position.set(2.8, 5.5, -3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 0.5, far: 16 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88a8cc, 1.1);
  rim.position.set(-3.2, 2.4, 3.0);
  scene.add(rim);

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
  scene.environmentIntensity = 0.95;
  pmrem.dispose();

  // Tiled floor (zero flickering yellow cross; UV offset scrolls continuously with velocity)
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.94,
    metalness: 0.02,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Subtle ground displacement trail markers (pips drift backward at -v*dt so real motion & speed read immediately)
  const trailGroup = new THREE.Group();
  const pipGeo = new THREE.CircleGeometry(0.042, 12);
  pipGeo.rotateX(-Math.PI / 2);
  const pips = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xdfbd68, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(pipGeo, mat);
    mesh.position.y = 0.006;
    trailGroup.add(mesh);
    pips.push({ mesh, mat, age: 99 });
  }
  scene.add(trailGroup);

  return { scene, floor, floorMat, trailGroup, pips, nextPip: 0, pipDist: 0 };
}

function UpdateStageDisplacement(stage, vx, vz, dt, enabled) {
  stage.trailGroup.visible = enabled;
  if (!enabled || dt <= 0) return;
  const spd = Math.hypot(vx, vz);
  if (spd > 0.08) {
    stage.pipDist += spd * dt;
    if (stage.pipDist >= 0.45) {
      stage.pipDist = 0;
      const p = stage.pips[stage.nextPip];
      stage.nextPip = (stage.nextPip + 1) % stage.pips.length;
      p.mesh.position.set(0, 0.006, 0);
      p.age = 0;
    }
  }
  for (const p of stage.pips) {
    if (p.age > 3.5) { p.mat.opacity = 0; continue; }
    p.age += dt;
    p.mesh.position.x -= vx * dt;
    p.mesh.position.z -= vz * dt;
    const dist = Math.hypot(p.mesh.position.x, p.mesh.position.z);
    p.mat.opacity = Clamp((1 - p.age / 3.0) * (1 - dist / 4.2) * 0.55, 0, 0.55);
  }
}

function ResetStageTrail(stage) {
  stage.pipDist = 0;
  for (const p of stage.pips) { p.age = 99; p.mat.opacity = 0; }
}

// ---------- Deterministic Scenario Script Generators ----------
function EvaluateScenarioCommand(scenarioId, t, dt, state) {
  let yaw = 0, targetVx = 0, targetVz = 0, stance = state.stance, lookYaw = 0, lookPitch = 0, fireSeq = state.manualFireSeq;
  let phaseHint = "";
  let useSmoothVel = false;

  if (scenarioId === "strafe2d") {
    // 稳态 2.60 m/s 慢跑段（所有四向片段步频匹配 0.53–0.77s）+ 平滑加减速曲线，杜绝步态边界抖动
    useSmoothVel = true;
    const cycle = t % 13.0;
    if (cycle < 2.6) { targetVx = 1.84; targetVz = -1.84; phaseHint = "斜前右突击 (+45°)"; }
    else if (cycle < 5.2) { targetVx = 2.60; targetVz = 0; phaseHint = "纯右侧向横移 (+90°)"; }
    else if (cycle < 7.8) { targetVx = 1.84; targetVz = 1.84; phaseHint = "斜后右撤退 (+135°)"; }
    else if (cycle < 10.4) { targetVx = -1.84; targetVz = -1.84; phaseHint = "斜前左突击 (-45°)"; }
    else { targetVx = -2.60; targetVz = 0; phaseHint = "纯左侧向横移 (-90°)"; }
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
    useSmoothVel = true;
    const cycle = t % 6.4;
    if (cycle < 3.2) { targetVx = 1.85; targetVz = -1.85; lookYaw = 16 * DEG; lookPitch = 8 * DEG; phaseHint = "斜前右冲刺中连射"; }
    else { targetVx = -1.85; targetVz = -1.85; lookYaw = -16 * DEG; lookPitch = 10 * DEG; phaseHint = "斜前左冲刺中连射"; }
    fireSeq = state.manualFireSeq + Math.floor(t / 0.85);
  } else if (scenarioId === "combatSequence") {
    useSmoothVel = true;
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
      const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
      const rgtX = Math.cos(yaw), rgtZ = -Math.sin(yaw);
      targetVx = fwdX * 1.9 + rgtX * 1.7;
      targetVz = fwdZ * 1.9 + rgtZ * 1.7;
      lookPitch = 14 * DEG;
      fireSeq = state.manualFireSeq + Math.floor((cycle - 4.4) / 0.85) + 1;
      phaseHint = "③ 斜前突击 + 移动开火";
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
    if (cycle < 3.5) { targetVx = 2.55; targetVz = 0; phaseHint = "右横移 2.55 m/s"; }
    else { targetVx = -2.55; targetVz = 0; phaseHint = "左横移 2.55 m/s"; }
  } else if (scenarioId === "sandbox") {
    useSmoothVel = true;
    yaw = state.sandboxYaw;
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rgtX = Math.cos(yaw), rgtZ = -Math.sin(yaw);
    let inF = (state.keys.has("KeyW") ? 1 : 0) - (state.keys.has("KeyS") ? 1 : 0);
    let inR = (state.keys.has("KeyD") ? 1 : 0) - (state.keys.has("KeyA") ? 1 : 0);
    const mag = Math.hypot(inF, inR);
    if (mag > 1e-4) {
      inF /= mag; inR /= mag;
      const spd = state.stance === "crouch" ? 1.15 : (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight") ? 3.2 : 1.85);
      targetVx = (fwdX * inF + rgtX * inR) * spd;
      targetVz = (fwdZ * inF + rgtZ * inR) * spd;
    }
    phaseHint = mag > 0 ? `沙盒移动 ${Math.hypot(targetVx, targetVz).toFixed(1)} m/s` : "沙盒待机（WASD / Q E / F）";
  }

  let vx = targetVx, vz = targetVz;
  if (useSmoothVel) {
    const tau = scenarioId === "sandbox" ? 0.08 : 0.16;
    if (dt > 0) {
      state.smoothVx = Approach(state.smoothVx, targetVx, dt, tau);
      state.smoothVz = Approach(state.smoothVz, targetVz, dt, tau);
      if (Math.hypot(targetVx, targetVz) < 1e-4 && Math.hypot(state.smoothVx, state.smoothVz) < 0.11) {
        state.smoothVx = 0; state.smoothVz = 0;
      }
    }
    vx = state.smoothVx;
    vz = state.smoothVz;
  } else {
    state.smoothVx = targetVx;
    state.smoothVz = targetVz;
  }

  if (state.manualAim) {
    lookYaw = state.manualYawDeg * DEG;
    lookPitch = state.manualPitchDeg * DEG;
  }
  return { yaw, vx, vz, stance, lookYaw, lookPitch, fireSeq, phaseHint };
}

// ---------- Resizable Sidebars Setup ----------
function SetupResizableSidebars() {
  const KEY = "tengxian_motion_compare_layout_v1";
  const rootStyle = document.documentElement.style;
  let sideW = 288, inspW = 344;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved?.sideW) sideW = Clamp(saved.sideW, 210, 480);
    if (saved?.inspW) inspW = Clamp(saved.inspW, 240, 480);
  } catch {}
  const apply = () => {
    const maxW = Math.max(240, Math.floor((window.innerWidth - 360) / 2));
    sideW = Clamp(sideW, 210, Math.min(480, maxW));
    inspW = Clamp(inspW, 240, Math.min(480, maxW));
    rootStyle.setProperty("--side-w", `${sideW}px`);
    rootStyle.setProperty("--insp-w", `${inspW}px`);
  };
  apply();
  window.addEventListener("resize", apply);

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ sideW, inspW })); } catch {}
  };

  const bindHandle = (el, which) => {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("dragging");
      document.body.classList.add("resizing");
      const startX = e.clientX;
      const startW = which === "left" ? sideW : inspW;
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (which === "left") sideW = startW + dx;
        else inspW = startW - dx;
        apply();
      };
      const onUp = () => {
        el.classList.remove("dragging");
        document.body.classList.remove("resizing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        save();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  };
  bindHandle($("resizeLeft"), "left");
  bindHandle($("resizeRight"), "right");
}

// ---------- Main Application ----------
async function Main() {
  SetupResizableSidebars();
  const bootBar = $("bootBar"), bootStep = $("bootStep"), bootOverlay = $("bootOverlay");
  const setBoot = (pct, msg) => { bootBar.style.width = `${pct}%`; bootStep.textContent = msg; };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  ApplyEditorLiteCameraProfile(renderer);
  renderer.setScissorTest(true);
  $("view").appendChild(renderer.domElement);

  const floorTex = CreateTiledFloorTexture(renderer);
  const oldStage = MakeStageScene(renderer, floorTex);
  const newStage = MakeStageScene(renderer, floorTex);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);

  const orbit = { yaw: 0.56, pitch: 0.20, dist: 4.55, targetY: 0.88, pan: new THREE.Vector3() };
  const ApplyCamPreset = (name) => {
    const p = CAM_PRESETS[name] || CAM_PRESETS.front34;
    orbit.yaw = p.yaw; orbit.pitch = p.pitch; orbit.dist = p.dist; orbit.targetY = p.targetY;
    orbit.pan.set(0, 0, 0);
    document.querySelectorAll("#camBtns .edBtn").forEach((b) => b.classList.toggle("on", b.dataset.cam === name));
  };

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

  const bank = new CompareAssetBank(renderer);
  await bank.Init(setBoot);
  setBoot(80, "装配人物、汉阳造 173R 与步态求解器…");

  const oldUnit = new CharacterCompareUnit(bank, oldStage.scene, { mode: "old" });
  const newUnit = new CharacterCompareUnit(bank, newStage.scene, { mode: "new" });
  const oldFp = new FirstPersonLegRig(oldStage.scene, OLD_FP_TUNING, { accentColor: 0xd6604a });
  const newFp = new FirstPersonLegRig(newStage.scene, FIRST_PERSON_BODY, { accentColor: 0xdfbd68 });
  oldFp.SetVisible(false);
  newFp.SetVisible(false);

  const initialChar = CHAR_KEYS.includes("heYoutian") ? "heYoutian" : CHAR_KEYS[0];
  await Promise.all([
    oldUnit.SetCharacter(initialChar),
    newUnit.SetCharacter(initialChar),
    oldUnit.SetRifle("HanYang"),
    newUnit.SetRifle("HanYang"),
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
    smoothVx: 0,
    smoothVz: 0,
    keys: new Set(),
    vis: { arrows: true, target: true, treadmill: true },
  };
  let activeScenario = SCENARIOS[0];

  // Populate ALL 18 online characters
  const selChar = $("selChar");
  for (const k of CHAR_KEYS) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = XBOT_CHARACTERS[k].name || k;
    if (k === initialChar) opt.selected = true;
    selChar.appendChild(opt);
  }
  selChar.addEventListener("change", async () => {
    $("topStatus").textContent = "切换人物…";
    await Promise.all([oldUnit.SetCharacter(selChar.value), newUnit.SetCharacter(selChar.value)]);
    oldUnit.Reset(0); newUnit.Reset(0);
    UpdateTopStatus();
  });

  $("selRifle").addEventListener("change", async () => {
    const id = $("selRifle").value;
    $("topStatus").textContent = "切换武器…";
    await Promise.all([oldUnit.SetRifle(id), newUnit.SetRifle(id)]);
    UpdateTopStatus();
  });

  $("selOldAim").addEventListener("change", () => {
    oldUnit.oldAimBaseline = $("selOldAim").value;
    $("leftBadgeSub").textContent = oldUnit.oldAimBaseline === "procedural"
      ? "纯数学 5 节脊柱（对照 9 帧精修）"
      : "单向播片 / 无扭曲 / 开火锁腿";
  });

  // Left scenario list
  const scListEl = $("scenarioList");
  for (const sc of SCENARIOS) {
    const item = document.createElement("div");
    item.className = "scItem";
    item.dataset.scenario = sc.id;
    item.innerHTML = `<div class="scTop"><span class="scIdx">${sc.index}</span><span class="scName">${sc.name}</span><span class="scTag">${sc.tag}</span></div><div class="scHint">${sc.hint}</div>`;
    item.addEventListener("click", () => SelectScenario(sc.id));
    scListEl.appendChild(item);
  }

  // 3x3 Aim Offset quick grid
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
    state.manualAim = true; $("chkManualAim").checked = true; $("chipManualAim").classList.add("on");
    SetManualAim(Number($("rngYaw").value), state.manualPitchDeg);
  });
  $("rngPitch").addEventListener("input", () => {
    state.manualAim = true; $("chkManualAim").checked = true; $("chipManualAim").classList.add("on");
    SetManualAim(state.manualYawDeg, Number($("rngPitch").value));
  });

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
      document.querySelectorAll("#stanceBtns .edBtn").forEach((b) => b.classList.toggle("on", b.dataset.stance === state.stance));
    });
  });

  for (const [id, key] of [["visArrows", "arrows"], ["visTarget", "target"], ["visTreadmill", "treadmill"]]) {
    const input = $(id);
    input.addEventListener("change", () => {
      state.vis[key] = input.checked;
      input.parentElement.classList.toggle("on", input.checked);
    });
  }

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
    state.sandboxYaw = 0;
    state.smoothVx = 0;
    state.smoothVz = 0;
    floorTex.offset.set(0, 0);
    ResetStageTrail(oldStage);
    ResetStageTrail(newStage);
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
    $("leftBadgeTitle").textContent = isFp ? "优化前 · 旧步态" : "优化前";
    $("leftBadgeSub").textContent = isFp
      ? "扭曲 40° / 无横移步宽"
      : (oldUnit.oldAimBaseline === "procedural"
        ? "纯数学 5 节脊柱（对照 9 帧精修）"
        : "单向播片 / 无扭曲 / 开火锁腿");
    $("rightBadgeTitle").textContent = isFp ? "优化后 · 防穿插" : "优化后";
    $("rightBadgeSub").textContent = isFp
      ? "扭曲 54° / 步宽 7.5 cm / 外摆弧"
      : "主干扭曲 / 锁地 IK / 原地转身 / 9 帧精修";

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
    const rifleName = RIFLE_LABELS[$("selRifle").value] || $("selRifle").value;
    $("topStatus").textContent = `${charName} · ${rifleName} · 场景 ${activeScenario.index}`;
  }

  function RenderTelemetry(cmd) {
    const isFp = activeScenario.id === "fpStrafeLegs";
    if (isFp) {
      const oldLow = oldFp.curClearCm < 13.5;
      $("leftPill").className = `vpPill ${oldLow ? "warn" : ""}`;
      $("leftPill").textContent = `净距 ${oldFp.curClearCm.toFixed(1)} cm（最低 ${oldFp.minClearCm < 900 ? oldFp.minClearCm.toFixed(1) : "—"}）`;
      $("rightPill").className = "vpPill good";
      $("rightPill").textContent = `净距 ${newFp.curClearCm.toFixed(1)} cm（最低 ${newFp.minClearCm < 900 ? newFp.minClearCm.toFixed(1) : "—"}）`;
    } else {
      const o = oldUnit.telemetry, n = newUnit.telemetry;
      $("leftPill").className = `vpPill ${o.fireBad ? "warn" : ""}`;
      $("leftPill").textContent = o.fireBad ? "开火冻腿 0.35s" : o.stateLabel;
      $("rightPill").className = "vpPill good";
      $("rightPill").textContent = n.fireLabel !== "未开火" ? n.fireLabel : n.stateLabel;
    }

    // 仅当用户展开 Debug 折叠区时才重绘详细表，节省 DOM 开销
    if (!$("debugFold").open) return;
    const tbody = $("diffBody");
    if (isFp) {
      tbody.innerHTML = `
        <tr><td class="metric">当前净距</td><td class="oldVal ${oldFp.curClearCm < 13.5 ? "bad" : ""}">${oldFp.curClearCm.toFixed(1)} cm</td><td class="newVal ${newFp.curClearCm >= 14.5 ? "good" : ""}">${newFp.curClearCm.toFixed(1)} cm</td></tr>
        <tr><td class="metric">历史最低</td><td class="oldVal ${oldFp.minClearCm < 13.5 ? "bad" : ""}">${oldFp.minClearCm < 900 ? oldFp.minClearCm.toFixed(1) + " cm" : "—"}</td><td class="newVal good">${newFp.minClearCm < 900 ? newFp.minClearCm.toFixed(1) + " cm" : "—"}</td></tr>
        <tr><td class="metric">骨盆扭曲</td><td class="oldVal">${(oldFp.gait.lowerYaw / DEG).toFixed(1)}°</td><td class="newVal good">${(newFp.gait.lowerYaw / DEG).toFixed(1)}°</td></tr>
        <tr><td class="metric">着地滑移</td><td class="oldVal">${oldFp.maxSlipMm.toFixed(2)} mm</td><td class="newVal good">${newFp.maxSlipMm.toFixed(2)} mm</td></tr>
        <tr><td class="metric">横移步宽</td><td class="oldVal">0.0 cm</td><td class="newVal good">7.5 cm</td></tr>
      `;
      return;
    }
    const o = oldUnit.telemetry, n = newUnit.telemetry;
    tbody.innerHTML = `
      <tr><td class="metric">阶段</td><td class="oldVal" colspan="2" style="color:var(--ui-gold)">${cmd.phaseHint || "—"}</td></tr>
      <tr><td class="metric">步态</td><td class="oldVal ${o.fireBad ? "bad" : ""}">${o.stateLabel}</td><td class="newVal good">${n.stateLabel}</td></tr>
      <tr><td class="metric">支撑脚滑移</td><td class="oldVal ${o.footSlipCm > 4 ? "bad" : ""}">${o.footSlipCm.toFixed(1)} cm</td><td class="newVal ${n.footSlipCm <= 1.5 ? "good" : ""}">${n.footSlipCm.toFixed(1)} cm${n.footLocked ? " 锁地" : ""}</td></tr>
      <tr><td class="metric">骨盆扭曲</td><td class="oldVal">${o.pelvisWarpDeg.toFixed(1)}°</td><td class="newVal">${n.pelvisWarpDeg > 0 ? "+" : ""}${n.pelvisWarpDeg.toFixed(1)}°</td></tr>
      <tr><td class="metric">脚偏角</td><td class="oldVal">0.0°</td><td class="newVal">${n.tipOffsetDeg > 0 ? "+" : ""}${n.tipOffsetDeg.toFixed(1)}°${n.tipTurning ? " 迈步" : ""}</td></tr>
      <tr><td class="metric">Aim</td><td class="oldVal">${o.aimMode}</td><td class="newVal good">${n.aimMode}</td></tr>
      <tr><td class="metric">开火</td><td class="oldVal ${o.fireBad ? "bad" : ""}">${o.fireLabel}</td><td class="newVal ${n.fireLabel !== "未开火" ? "good" : ""}">${n.fireLabel}</td></tr>
      <tr><td class="metric">握距差</td><td class="oldVal">R${o.gripRMm}/L${o.gripLMm}mm</td><td class="newVal">R${n.gripRMm}/L${n.gripLMm}mm</td></tr>
    `;
  }

  let viewW = 1, viewH = 1;
  function Resize() {
    const r = $("view").getBoundingClientRect();
    viewW = Math.max(1, Math.floor(r.width));
    viewH = Math.max(1, Math.floor(r.height));
    renderer.setSize(viewW, viewH, false);
  }
  new ResizeObserver(Resize).observe($("view"));
  Resize();

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
    const cmd = EvaluateScenarioCommand(activeScenario.id, state.time, dt, state);

    // 2.0 m per texture repeat -> UV offset scrolls smoothly opposite to world velocity (zero flicker!)
    if (state.vis.treadmill && dt > 0) {
      floorTex.offset.x = (floorTex.offset.x + (cmd.vx * dt) / 2.0) % 1;
      floorTex.offset.y = (floorTex.offset.y - (cmd.vz * dt) / 2.0) % 1;
    }
    UpdateStageDisplacement(oldStage, cmd.vx, cmd.vz, dt, state.vis.treadmill);
    UpdateStageDisplacement(newStage, cmd.vx, cmd.vz, dt, state.vis.treadmill);

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

    const target = new THREE.Vector3(0, orbit.targetY, 0).add(orbit.pan);
    const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    camera.position.set(
      target.x - Math.sin(orbit.yaw) * cp * orbit.dist,
      target.y + sp * orbit.dist,
      target.z - Math.cos(orbit.yaw) * cp * orbit.dist,
    );
    camera.lookAt(target);

    const stageRect = $("stageHud").getBoundingClientRect();
    const leftPx = Math.max(0, Math.floor(stageRect.left));
    const widthPx = Math.max(2, Math.floor(stageRect.width));
    const halfW = Math.floor(widthPx / 2);
    const bottomY = Math.max(0, viewH - Math.floor(stageRect.bottom));
    const heightPx = Math.max(2, Math.floor(stageRect.height));

    renderer.setScissorTest(false);
    renderer.setClearColor(0x0b0c0a, 1);
    renderer.clear();
    renderer.setScissorTest(true);

    camera.aspect = halfW / heightPx;
    camera.updateProjectionMatrix();
    renderer.setViewport(leftPx, bottomY, halfW, heightPx);
    renderer.setScissor(leftPx, bottomY, halfW, heightPx);
    renderer.render(oldStage.scene, camera);

    const rightW = widthPx - halfW;
    camera.aspect = rightW / heightPx;
    camera.updateProjectionMatrix();
    renderer.setViewport(leftPx + halfW, bottomY, rightW, heightPx);
    renderer.setScissor(leftPx + halfW, bottomY, rightW, heightPx);
    renderer.render(newStage.scene, camera);

    uiAccum += rawDt;
    if (uiAccum >= 0.08) {
      uiAccum = 0;
      RenderTelemetry(cmd);
    }
  }

  function Loop(now) {
    const rawDt = Math.min((now - lastTs) / 1000, 0.1);
    lastTs = now;
    StepFrame(rawDt);
    requestAnimationFrame(Loop);
  }
  requestAnimationFrame(Loop);

  window.MotionCompare = {
    ready: true,
    scenarios: SCENARIOS.map((s) => s.id),
    characters: CHAR_KEYS,
    setScenario: (id) => SelectScenario(id),
    setOldAim: (mode) => { $("selOldAim").value = mode; $("selOldAim").dispatchEvent(new Event("change")); },
    setAim: (yawDeg, pitchDeg) => {
      state.manualAim = true;
      $("chkManualAim").checked = true;
      $("chipManualAim").classList.add("on");
      SetManualAim(yawDeg, pitchDeg);
    },
    setKey: (code, down) => { if (down) state.keys.add(code); else state.keys.delete(code); },
    setSlowMo: (rate) => { state.rate = rate; },
    fire: () => { state.manualFireSeq += 1; },
    step: (dt = 1 / 60, count = 1) => { for (let i = 0; i < count; i++) StepFrame(dt); },
    footMetrics: () => ({
      old: oldUnit.lastFootProbe.map((p) => ({ ...p })),
      new: newUnit.lastFootProbe.map((p) => ({ ...p })),
      vel: { vx: state.smoothVx, vz: state.smoothVz },
    }),
    riflePose: () => ({
      oldPos: oldUnit.rifleObj ? oldUnit.rifleObj.position.toArray() : null,
      newPos: newUnit.rifleObj ? newUnit.rifleObj.position.toArray() : null,
      oldQ: oldUnit.rifleObj ? oldUnit.rifleObj.quaternion.toArray() : null,
      newQ: newUnit.rifleObj ? newUnit.rifleObj.quaternion.toArray() : null,
    }),
    state: () => ({
      scenario: activeScenario.id,
      character: selChar.value,
      rifle: $("selRifle").value,
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
