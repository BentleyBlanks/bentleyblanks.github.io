// 白盒编辑器（预演 + 试玩）里的人物换成 Mixamo X Bot（2026-11-01，用户要求；对照表 Data_BlockoutXBotClips.mjs，
// 说明 docs/Data_EditorBlockout.md §18）。只在编辑器里用：正式关卡的 Actor / 人物模型 / AI 一行不动。
//
// 做法：原来的人物照常造、照常 Update（走位、朝向、片段层、步态、倒地、测躺姿、两人配合、被子与担架的抓点都还是它），
// 只是把它的蒙皮网格藏起来；同一个位置挂一个 X Bot（按阵营上色、按原身体的身高缩放），每帧照「原来那个人此刻在干什么」
// 播对应的动作：
//   · 预演片段（clip）→ XBOT_PREVIZ_CLIPS：Mixamo / 自制动作，或预先烘好的派生动作（士兵动作换算、左右镜像，Derived/）；
//   · 原生状态 → XBOT_NATIVE（姿势 × 动作 × 手里 × 据枪），倒地 → XBOT_DEATHS；
//   · 表里没有的、要精确贴位置的（顺着躺在被子 / 担架上、坐车）→ 当场把原身体的姿势换算到 X Bot（Script_XBotRetarget）。
// 原身体骨头上挂的东西（枪、背着的枪、手榴弹、刺刀这类道具）每帧挪到 X Bot 的同一根骨上：
// 播 Mixamo 端枪动作时枪按动作预览工具的标定放进右手（握把在右手掌心，枪管按权重转向左手；清单 rifleTrack 的背上 / 掉地，
// 同预览工具，共用 Script_MixamoProps.mjs）；其余时候照原身体手和枪的相对位置。贴躯干的挂件（背着的枪）按 X Bot 体型推开。
// 运行时取证：_import/Script_XBotAttachmentProbe.mjs。
// 2026-11-03 起普通日军换成日兵甲（Data_XBotCharacters.mjs 的 XBOT_FACTION_CHARACTERS），11-04 起何有田换成他自己的模型（XBOT_CAST_CHARACTERS），
// 11-04 起普通日军日兵甲、日军士兵A、日兵乙按兵的编号固定分配：
// 同一副骨架、自己的贴图，动作去掉 X Bot 的骨长、胯高按比例缩；别的有专属配色的人、别的阵营照用 X Bot。读不到就退回 X Bot。
import * as THREE from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { clone as CloneSkinned } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { XBotRetarget, RestSkeleton, ToposortBones, BoneKey, XBOT_FROM_SOLDIER } from "./Script_XBotRetarget.mjs";
import { ApplyPatches } from "./Script_MaterialPatches.mjs";
import { CHARACTER_LIGHT_PATCH } from "./Script_CharacterLight.mjs";
import { XBOT_PREVIZ_CLIPS, XBOT_NATIVE, XBOT_LOCOMOTION_4WAY, XBOT_TURN_IN_PLACE, XBOT_AIM_OFFSET, XBOT_DEATHS, XBOT_DEATH_FALLS, XBOT_LOOKS, XBOT_CHARACTER_LOOKS, XBOT_CHARACTER_UNITS, XBOT_MELEE } from "./Data_BlockoutXBotClips.mjs";
import { AimAt, AimBandFor, PrepareRifleTrack, RifleTrackPose, DropPose, MeasureWeaponVisualOrigin } from "./Script_MixamoProps.mjs";
import { XBOT_CHARACTERS, XBOT_FACTION_CHARACTERS, XBOT_CAST_CHARACTERS } from "./Data_XBotCharacters.mjs";
import { ClipForCharacter, FactionCharacterKeys } from "./Script_XBotCharacters.mjs";
import { CharacterScaleHeight } from "./Script_CharacterModel.mjs";
import { LoadHairGroom, LoadHairAtlas, HairGroom, DisposeHairGroomAsset } from "./Script_HairGroom.mjs";
import { CharacterWounds } from "./Script_CharacterWounds.mjs";
import { HAIR_QUALITY } from "./Data_Tuning_Hair.mjs";
import { CHARACTER_HITBOX_PROFILE } from "./Data_CharacterHitbox.mjs";
import { RaycastShapes } from "./Script_CharacterHitboxMath.mjs";
import { SetRifleSlingAnchors } from "./Script_RifleSlingCloth.mjs";
import { DeathFallLocal } from "./Script_HitReactionLayer.mjs";
import { YawToTurn } from "./Script_HitReaction.mjs";
import { DEATH } from "./Data_Tuning_HitReaction.mjs";
import {
  NPC_3C, XBOT_UPPER_BODY_TURN_MASK_BONES, WrapAngle, Clamp, Smooth01,
  ComputeLocomotion2D, FootLockController, TurnInPlaceController, EvaluateSpineAimDistribution, EvaluateAimOffsetGridWeights, EvaluateAdditiveFireRecoil,
} from "./Script_NpcLocomotion3C.mjs";

/** 这个人的配色：有名字的角色（castId，或没有 castId 的单位 id）各一种；其余按阵营的素色。 */
export function XBotLook({ faction = "nra", castId = null, unitId = null } = {}) {
  const key = (castId && XBOT_CHARACTER_LOOKS[castId] ? castId : null) || XBOT_CHARACTER_UNITS[unitId] || null;
  return key ? { key, ...XBOT_CHARACTER_LOOKS[key] } : { key: faction, ...(XBOT_LOOKS[faction] || XBOT_LOOKS.nra) };
}

export const XBOT = Object.freeze({
  base: "./Animation/Mixamo/",
  model: "Model_MixamoXBot.glb",
  /**
   * 换动作（2026-11-02 用户：好几个日军动作衔接不顺）：从上一帧看到的姿势淡到新动作，不用 mixer 的交叉淡入 ——
   * 那个只在两条 mixer 动作之间淡，进出「当场换算」、同一条动作里跳时间都是硬切。胯挪得越远淡得越久：
   * fadeS + 每米 fadePerM 秒，封顶 fadeMaxS（站 → 趴、站 → 蹲着扇耳光，0.2 s 一下子塌下去像掉帧）。
   */
  fadeS: 0.2,
  fadePerM: 0.4,
  fadeMaxS: 0.5,
  /**
   * 换动作的同一帧人被挪了这么远以内（片段自带位移，预演在片段交接时把根挪到片段末尾骨盆的位置）：胯从上一帧在世界里的
   * 位置接着淡，不跟着根跳一下再淡回来；更远的当真瞬移，胯照本地姿势淡（人跟着根走）。
   */
  rerootM: 3,
  /** 倒地那一刻头离地不到这么高（片段已经把人摔在地上了；跪着的头在 0.75 m 上下）：停在这个姿势，不再从站着放一遍倒地动作 */
  downHoldHeadM: 0.5,
  /** 枪在手里 ↔ 背上换了（不据枪就背枪的步态）：从上一帧看到的那支的位置挪过去，不一帧瞬移 */
  rifleSwapS: 0.3,
  /**
   * 走上 / 走下白盒的台阶块（站人的地面一帧高出 0.35 m，沟壁的坡也是一级级 0.6 m 往下掉的，§5.6）：这么高以内的高差按时间常数 stepS 秒跟过去，不一帧蹦上去；
   * 更高的照跟（换根、跳沟由换动作的过渡接住）
   */
  stepM: 0.8,
  stepS: 0.12,
  /** 跑和走的分界（m/s），同原生步态 */
  runMps: 2.2,
  /** 原地循环动作的播放速率夹在这个范围里（覆盖实测 STANCE_MPS 0.22..3.82 m/s 与减速刹停，防低速快脚滑步） */
  rate: [0.12, 2.4],
  /** 动作预览工具里标定步枪用的那条（第 0 帧两手都在枪上） */
  rifleCalibration: "Animation_Mixamo_RifleAimingIdle_V1.glb",
  /** 开一枪之后播开枪动作这么久（试玩里 AI 的 state.firing 只亮一帧） */
  fireHoldS: 0.35,
  // 枪管对准左手、动作里枪换地方（rifleTrack：背上 / 掉地）：同动作预览工具，共用 Script_MixamoProps.mjs
});

const SOLDIER_OF_XBOT = new Map(Object.entries(XBOT_FROM_SOLDIER).map(([s, x]) => [x, s]));
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s2 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _yawQ = new THREE.Quaternion(), _aimQ = new THREE.Quaternion(), _aimQ2 = new THREE.Quaternion();
const _aimRight = new THREE.Vector3(), _aimFwd = new THREE.Vector3();
const _addQ0 = new THREE.Quaternion(), _addQ1 = new THREE.Quaternion(), _addDelta = new THREE.Quaternion();
const _idQuat = new THREE.Quaternion();
const _aoTop = new THREE.Quaternion(), _aoBot = new THREE.Quaternion();
const _aoModelQ = new THREE.Quaternion(), _aoModelQInv = new THREE.Quaternion();
const _aimEuler = new THREE.Euler(0, 0, 0, "YXZ");
const _curBarrel = new THREE.Vector3(), _wantBarrel = new THREE.Vector3();

/** 开火 Additive 叠加仅作用上半身骨骼（双腿与 Hips 严格 0° 透明，跑动开火绝不锁腿滑步）。 */
const XBOT_ADDITIVE_FIRE_BONES = new Set([
  "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "RightHandThumb1", "RightHandThumb2", "RightHandThumb3",
  "RightHandIndex1", "RightHandIndex2", "RightHandIndex3",
  "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3",
  "LeftHandThumb1", "LeftHandThumb2", "LeftHandIndex1", "LeftHandIndex2",
]);
const XBOT_SPINE_CHAIN = [
  ["Spine", "spine"], ["Spine1", "spine1"], ["Spine2", "spine2"], ["Neck", "neck"], ["Head", "head"],
];
/** 9 帧 Aim Offset：脊柱/头用增量 Mesh-Space Delta（不随跑步前倾歪轴），锁骨与双臂用 Local-Space Delta。 */
const XBOT_AIM_SPINE_BONES = ["Spine", "Spine1", "Spine2", "Neck", "Head"];
const XBOT_AIM_ARM_BONES = [
  ["LeftShoulder", 1.0], ["RightShoulder", 1.0],
  ["LeftArm", 0.85], ["LeftForeArm", 0.85], ["LeftHand", 0.75],
  ["RightArm", 0.85], ["RightForeArm", 0.85], ["RightHand", 0.75],
];

/** 对 9 帧网格的 4 个角四元数做双线性 Slerp（保证最短弧并归一化）。 */
function SampleBilinearQuat(arr, w, out) {
  const q00 = arr[w.f00], q01 = arr[w.f01], q10 = arr[w.f10], q11 = arr[w.f11];
  _aoTop.slerpQuaternions(q00, q01, w.u);
  _aoBot.slerpQuaternions(q10, q11, w.u);
  return out.slerpQuaternions(_aoTop, _aoBot, w.v).normalize();
}

/** 从一条旋转关键帧轨道采样 t 秒处的四元数差值（相对第 0 帧已预减）。 */
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

/** 从预提取的标量曲线采样 t 秒处的数值（用于 Turn-in-Place 的 Hips 偏航剥离）。 */
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

/**
 * 枪与手（_PlaceWeapon）：原身体掌心离枪身这么近算握着；X Bot 掌心离握点 near 内全拉、far 外不拉；淡入淡出时长。
 * 照原身体手与枪的相对位置放枪时（handR / handL），这个相对位置按时间常数 relTauS 跟、每秒最多转 relDegPerS 度、挪 relMps 米：
 * 藏起来的原身体有时一帧一个样（11-02 取证：02-1 丁兵说话时原身体左手握点在 0.41 / 0.81 m 之间来回跳，枪跟着原身体左手转，
 * 一帧转 80–170°），X Bot 手里的枪不跟着抽。原身体松手不到 releaseS 秒（没倒地）还当握着、照最后的相对位置拿在 X Bot 手里：
 * 片段交接换根那一下原身体的手和枪会分开零点几秒（11-02 取证：01-4 丁兵跳进沟，原身体掌心离枪 2.4 m → 0.25 m 用了 0.3 s），
 * 原来枪就在这几帧改照「贴躯干」挂，一帧跳 3.15 m。
 */
const XBOT_GRIP = Object.freeze({ heldM: 0.2, near: 0.3, far: 0.5, blendS: 0.2, weightS: 0.12, relTauS: 0.05, relDegPerS: 360, relMps: 1.5, releaseS: 0.5 });

/** 点到线段（[a, b]，b 为空时就是到点 a）的距离；点为空 → Infinity。 */
function SegmentDistance(p, [a, b]) {
  if (!p) return Infinity;
  if (!b) return p.distanceTo(a);
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/**
 * 挂件的过渡（换挂法、手里 ↔ 背上）：开始那一帧记下起点相对目标的偏移，之后每帧「此刻的目标 × 偏移」，偏移按 e 衰减成单位。
 * 不直接在起点与目标之间插值：目标跟着身体动，两头朝向差近 180° 时最短的那条弧会走着走着换一边（11-02 取证：
 * 背枪 0.3 s 挪动中途一帧翻 122°）；偏移只在开始时定一次，绕哪边就定了。
 */
function OffsetFrom(from, target) {
  const off = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
  new THREE.Matrix4().copy(target).invert().multiply(from).decompose(off.p, off.q, off.s);
  return off;
}
const _one = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3(), _idq = new THREE.Quaternion();
function ApplyOffset(target, off, e) {
  return new THREE.Matrix4().copy(target).multiply(new THREE.Matrix4().compose(off.p.clone().lerp(_zero, e), off.q.clone().slerp(_idq, e), off.s.clone().lerp(_one, e)));
}

/** 朝 target 指数逼近（时间常数 tau 秒）。 */
function Approach(value, target, dt, tau) { return value + (target - value) * (1 - Math.exp(-Math.max(dt, 0) / tau)); }

/** 骨头在世界空间里再转 q（左乘），换回本地写进去。 */
function RotateBoneWorld(bone, q) {
  const parentQ = FreshQuaternion(bone.parent), world = FreshQuaternion(bone);
  bone.quaternion.copy(parentQ.invert().multiply(q.multiply(world)));
  bone.updateWorldMatrix(false, true);
}

function SetBoneWorldQuaternion(bone, world) {
  bone.quaternion.copy(FreshQuaternion(bone.parent).invert().multiply(world));
  bone.updateWorldMatrix(false, true);
}

function Palm(hand, middle, out) {
  hand.getWorldPosition(out);
  return middle ? out.lerp(middle.getWorldPosition(_p2), 0.55) : out;
}

// Sync has refreshed both skeletons before attachment/IK solving. Reading their
// matrices avoids repeatedly recomposing the same ancestor chain for every palm,
// elbow and quaternion. IK writes still refresh the affected subtree immediately.
const _freshPosition=new THREE.Vector3(),_freshScale=new THREE.Vector3();
function FreshQuaternion(bone) {
  const result=new THREE.Quaternion();bone.matrixWorld.decompose(_freshPosition,result,_freshScale);return result;
}
function FreshPosition(bone) {return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);}
function FreshPalm(hand,middle,out) {
  out.setFromMatrixPosition(hand.matrixWorld);
  return middle?out.lerp(_freshPosition.setFromMatrixPosition(middle.matrixWorld),.55):out;
}

/**
 * 端枪动作里枪的世界位姿（同动作预览工具）：握把照标定放进右手掌心，左手在枪管前方时按 AimAt 的权重把枪管转过去对准左手掌心
 * （11-02 前是「够得着就整个转过去」的开关，左手一跨线枪一帧拧过去最多 100°）。B(name) 取骨，k = 人物缩放，band = AimBandFor(清单条目)。
 */
function CalibratedRifle(B, off, k, band, out) {
  B("RightHand").matrixWorld.decompose(_p2, _q2, _s2);
  out.position.copy(off.position).multiplyScalar(k).applyQuaternion(_q2).add(_p2);
  out.quaternion.copy(_q2).multiply(off.quaternion);
  const palmL = Palm(B("LeftHand"), B("LeftHandMiddle1"), new THREE.Vector3());
  const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(out.quaternion);
  const toLeft = palmL.sub(out.position);
  out.aimWeight = AimAt(out.quaternion, muzzle, toLeft, toLeft.length() / Math.max(k, 1e-6), band);
  return out;
}

/** 给 PrepareRifleTrack 的一刻：枪（照标定）、右手骨、Spine2 的世界矩阵，人物右方 / 上方，掌心。 */
function RifleTrackSample(B, off, k, band) {
  const R = CalibratedRifle(B, off, k, band, { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
  const P = (n) => B(n).getWorldPosition(new THREE.Vector3());
  const spine = P("Spine2");
  return {
    rifle: new THREE.Matrix4().compose(R.position, R.quaternion, new THREE.Vector3(k, k, k)),
    hand: B("RightHand").matrixWorld.clone(), spine: B("Spine2").matrixWorld.clone(),
    body: { right: P("RightArm").sub(P("LeftArm")).normalize(), up: P("Neck").sub(spine).normalize(), spine },
    palm: Palm(B("RightHand"), B("RightHandMiddle1"), new THREE.Vector3()),
  };
}

/**
 * 一具蒙皮的初始姿势（模型空间 = rootSpace 的本地空间）：父在前排好，供 XBotRetarget 用。读的是骨头此刻的世界矩阵，
 * 所以 rootSpace 必须是没动过的原件（GLTFLoader 读进来的 scene，从没播过动作）。不用 boneInverses：
 * 人物克隆（CloneSkinnedRig）时按克隆那一刻的世界位置重绑过，boneInverses 与 bindMatrix 对不上原件的空间。
 */
function SkinRest(rootSpace, mesh) {
  rootSpace.updateMatrixWorld(true);
  const bones = mesh.skeleton.bones, rootInv = new THREE.Matrix4().copy(rootSpace.matrixWorld).invert();
  const parents = bones.map(b => bones.indexOf(b.parent));
  const order = ToposortBones(parents), position = new Map(order.map((i, k) => [i, k]));
  const list = order.map(i => ({
    name: bones[i].name, parent: parents[i] >= 0 ? position.get(parents[i]) : -1,
    world: new THREE.Matrix4().multiplyMatrices(rootInv, bones[i].matrixWorld),
    local: { p: bones[i].position.toArray(), q: bones[i].quaternion.toArray() },
  }));
  return { rest: new RestSkeleton(list), bones: order.map(i => bones[i]) };
}

function FirstSkinnedMesh(root) {
  let found = null;
  root.traverse(o => { if (!found && o.isSkinnedMesh) found = o; });
  return found;
}

/**
 * X Bot 的身体按骨头拟合成椭圆截面胶囊（同 _import/Script_MixamoLibraryAudit.mjs：骨头本地 +Y 指向子骨，截面半轴取挂在这根骨上的
 * 蒙皮顶点的第 85 百分位，偏瘦）。贴躯干的挂件（背着的枪）按它推开，取证脚本也按它量。→ [{ name, cx, cz, rx, rz, y0, y1 }]（骨头本地单位）
 */
export const XBOT_BODY_BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
  "LeftForeArm", "RightForeArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"];
export function FitBodyVolumes(model, names = XBOT_BODY_BONES) {
  const samples = new Map(names.map((n) => [n, []])), v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bones = o.skeleton.bones;
    for (let i = 0; i < pos.count; i += 1) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k += 1) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      if (bw < 0.6 || !samples.has(bones[best].name)) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[best]);
      samples.get(bones[best].name).push([v.x, v.y, v.z]);
    }
  });
  const Pct = (arr, q) => { const t = [...arr].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(q * t.length))]; };
  const out = [];
  for (const [name, pts] of samples) {
    if (pts.length < 20) continue;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), zs = pts.map((p) => p[2]);
    const cx = Pct(xs, 0.5), cz = Pct(zs, 0.5);
    out.push({ name, cx, cz, rx: Pct(xs.map((x) => Math.abs(x - cx)), 0.85), rz: Pct(zs.map((z) => Math.abs(z - cz)), 0.85), y0: Pct(ys, 0.05), y1: Pct(ys, 0.95) });
  }
  return out;
}

/** 点（骨头本地）离这段胶囊表面的有符号距离（骨头本地单位，> 0 在里面）；椭圆归一化后按短半轴折算，近表面准。 */
export function VolumeSigned(vol, local) {
  const k = Math.min(vol.rx, vol.rz);
  const dy = local.y < vol.y0 ? vol.y0 - local.y : local.y > vol.y1 ? local.y - vol.y1 : 0;
  return (1 - Math.hypot((local.x - vol.cx) / vol.rx, (local.z - vol.cz) / vol.rz, dy / k)) * k;
}

/** 挂件上看得见的网格的点（挂件自己的坐标），按 voxel 抽稀；skip(mesh) 为真的网格不算。 */
function PropPoints(root, voxel, skip = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), seen = new Map(), v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position || skip?.(o)) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.visible === false) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      const key = Math.round(v.x / voxel) + "," + Math.round(v.y / voxel) + "," + Math.round(v.z / voxel);
      if (!seen.has(key)) seen.set(key, v.clone());
    }
  });
  return [...seen.values()];
}

/**
 * 贴在躯干上的挂件（背着的枪……）对 X Bot 体型（11-02 取证：照原身体搬过来，三八式背在 X Bot 背上，枪托一截插进屁股
 * 9–10 cm、上段进背 4–5 cm —— X Bot 的背和屁股比士兵厚；挂在背后的钢盔（Spine2 下的 Object005）反过来离 X Bot 背 10–23 cm 悬着）。
 * 在 X Bot 初始姿势里（站直，模型空间）找最省的「前后挪 d + 绕挂件最高点倾 θ」，让挂件上最深的点在躯干胶囊表面外 marginM、
 * 最近的点离表面不超过 maxGapM；背带（名字带 Sling）本来就绕着胸口，不算（_KeepSling）。
 */
/**
 * 换了身材的人背带往外撑多少（XBotSkins._SlingFit）：在 bone 的本地（初始姿势，cm）里取胸口那一段网格（y 在 yCm 内、|x| < xCm 不算胳膊），
 * 宽、厚取第 pct 百分位。按网格量、不按权重：日兵甲的 Tripo 权重把胸口大多分给了 Spine1，按挂在 Spine2 上的顶点拟合，中心偏 10 cm。
 */
const XBOT_SLING_FIT = Object.freeze({ bone: "Spine2", yCm: [-25, 12], xCm: 17, pct: 0.95 });

/** 胸口截面（XBOT_SLING_FIT）：{ cx, cz, hx, hz }（骨头本地 cm，中心与半宽、半厚）。 */
function TorsoSection(model, fit = XBOT_SLING_FIT) {
  const xs = [], zs = [], v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const bi = o.skeleton.bones.findIndex(b => b.name === fit.bone);
    if (bi < 0) return;
    const pos = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(o.skeleton.boneInverses[bi], o.bindMatrix);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      if (v.y < fit.yCm[0] || v.y > fit.yCm[1] || Math.abs(v.x) > fit.xCm) continue;
      xs.push(v.x); zs.push(v.z);
    }
  });
  if (xs.length < 50) return null;
  const Pct = (arr, q) => { const t = [...arr].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(q * t.length))]; };
  const x0 = Pct(xs, 1 - fit.pct), x1 = Pct(xs, fit.pct), z0 = Pct(zs, 1 - fit.pct), z1 = Pct(zs, fit.pct);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 };
}

const XBOT_TORSO_FIT = Object.freeze({
  bones: ["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"],
  marginM: 0.01, maxGapM: 0.03, maxPushM: 0.16, maxPullM: 0.25, pushStepM: 0.01, maxTiltDeg: 24, tiltStepDeg: 2, tiltCostPerDeg: 0.004,
});

/** 整套 X Bot 资源（一份）+ 每个人一份的 XBotSkin。 */
export class XBotSkins {
  constructor({ base = XBOT.base, characterKeys = null, loadCast = null, customCharacters = null } = {}) {
    this.loadCast = loadCast;
    this.characterKeys=characterKeys;
    this.customCharacters = customCharacters || null;
    this.base = base;
    this.loader = new GLTFLoader();
    this.ready = false;
    this.failed = null;
    this.clips = new Map();       // file → Promise<AnimationClip>（已按播放方式处理过根位移）
    this.loaded = new Map();      // file → AnimationClip（读完的）
    this.sourceRests = new Map(); // 原身体模型号 → { rest, retarget, headY }
    this.materials = new Map();
    this.rifleTracks = new Map(); // file → PrepareRifleTrack 的结果（X Bot 模型空间、缩放 1）| null
    this.additiveFireCache = new Map(); // file → { duration, tracks: [{ boneName, times, deltas }] }
    this.turnYawCache = new Map();      // file → { duration, times, values }（Hips 相对第 0 帧的水平偏航增量）
    this.upperPoseCache = new Map();    // file → { spineModelQ, spine1ModelQ, localQ }（原地转身据枪上半身分层遮罩姿态）
    this.aimOffsetGrid = null;          // 9 帧端枪 Aim Offset 网格（meshDelta + localDelta）
    this.loading = null;
  }

  Load({ preloadClips = [] } = {}) {
    if (!this.loading) this.loading = this._Load(preloadClips).catch((error) => { this.failed = error; console.warn("[XBot] load failed", error); });
    return this.loading;
  }

  async _Load(preloadClips = []) {
    const [gltf, library, derived] = await Promise.all([
      this.loader.loadAsync(this.base + XBOT.model),
      fetch(this.base + "Data_MixamoLibrary.json").then(r => r.json()),
      fetch(this.base + "Derived/Data_XBotDerived.json").then(r => (r.ok ? r.json() : { clips: {} })),
    ]);
    this.source = gltf.scene;
    this.library = new Map(library.clips.map(c => [c.file, c]));
    this.derived = derived.clips || {};
    const mesh = FirstSkinnedMesh(this.source);
    const { rest, bones } = SkinRest(this.source, mesh);
    this.rest = rest;
    const hips = bones.find(b => b.name === "Hips");
    this.source.updateMatrixWorld(true);
    this.rootParent = new THREE.Matrix4().copy(this.source.matrixWorld).invert().multiply(hips.parent.matrixWorld);
    this.hipsParentInv = this.rootParent.clone().invert();
    this.headY = rest.worldP[rest.Find("Head")].y;
    // 身体胶囊（初始姿势、模型空间）：贴躯干的挂件按它推开（XBOT_TORSO_FIT）
    this.bodyVolumes = FitBodyVolumes(this.source);
    this.torsoSection = TorsoSection(this.source);
    this.restBones = new Map();
    this.source.traverse(o => { if (o.isBone) this.restBones.set(o.name, o); });
    // 每种人物一套（模型、头高、身体胶囊、初始骨头）；X Bot 之外的按阵营表读，读不到不影响 X Bot
    this.kits = new Map([["xbot", { key: "xbot", def: XBOT_CHARACTERS.xbot, source: this.source, headY: this.headY, bodyVolumes: this.bodyVolumes, restBones: this.restBones }]]);
    const keys=this.characterKeys||[...new Set([...Object.keys(XBOT_FACTION_CHARACTERS).flatMap(FactionCharacterKeys), ...Object.values(XBOT_CAST_CHARACTERS)])];
    // Start combat/death clip preloads in parallel with the 15 character GLBs once XBot rest pose & manifest are ready.
    const clipTasks = preloadClips.length ? preloadClips.map((file) => this.Clip(file).catch((reason) => {
      console.warn("[XBot] Preload clip failed; retaining fallback pose", file, reason);
    })) : [];
    await Promise.all([this._CalibrateRifle(), this._LoadAimOffsetGrid(), ...keys.map(key => this._LoadKit(key)), ...clipTasks]);
    this.ready = true;
  }

  async _LoadKit(key) {
    const def = this.customCharacters?.[key] || XBOT_CHARACTERS[key];
    if (!def) return;
    try {
      const gltf = await (this.loadCast && def.ownMaterial ? this.loadCast(this.loader,def.file) : this.loader.loadAsync(def.file));
      const source = gltf.scene, mesh = FirstSkinnedMesh(source);
      const goreMeta = gltf.asset?.extras?.tengxianGore || gltf.parser?.json?.asset?.extras?.tengxianGore || null;
      const { rest } = SkinRest(source, mesh);
      const restBones = new Map();
      source.traverse(o => {
        if (o.isBone) restBones.set(o.name, o);
        // 自己的贴图材质，补上角色光照（同 X Bot 的素色材质）；克隆出来的人共用这份
        if (o.isMesh && def.ownMaterial && !o.material.userData.characterLight) { ApplyPatches(o.material, [CHARACTER_LIGHT_PATCH]); o.material.userData.characterLight = true; }
      });
      const bodyVolumes = FitBodyVolumes(source);
      const clips = new Map(await Promise.all(Object.entries(def.clipOverrides || {}).map(async ([file, url]) =>
        [file, (await this.loader.loadAsync(url)).animations[0]])));
      // 头发胡子（有就挂，读不到照样用这个人物，只是光头）
      let groom = null;
      if (def.groom) {
        try {
          this.hairAtlas ||= LoadHairAtlas("./Hair/Textures/Texture_HairCardAtlas.png");
          const [g, a] = await Promise.allSettled([LoadHairGroom(def.groom), this.hairAtlas]);
          if (g.status === "fulfilled") groom = g.value;
          if (a.status === "fulfilled") this.hairAtlasTexture = a.value;
          if (g.status === "rejected" || a.status === "rejected" || this.hairDisposed) {
            DisposeHairGroomAsset(groom); groom = null;
            if (this.hairDisposed) this.hairAtlasTexture?.dispose();
            if (g.status === "rejected") throw g.reason;
            if (a.status === "rejected") throw a.reason;
          }
        } catch (error) { console.warn(`[XBot] ${def.name} hair load failed`, error); }
      }
      this.kits.set(key, { key, def, source, clips, headY: rest.worldP[rest.Find("Head")].y, bodyVolumes, restBones, slingFit: this._SlingFit(TorsoSection(source)), groom, goreMeta });
    } catch (error) { console.warn(`[XBot] ${def.name} load failed, using X Bot`, error); }
  }

  /** Instances are removed by BlockoutPuppets first; shared hair belongs to this cache. */
  DisposeHair() {
    if (this.hairDisposed) return;
    this.hairDisposed = true;
    for (const kit of this.kits?.values() || []) { DisposeHairGroomAsset(kit.groom); kit.groom = null; }
    this.hairAtlas?.then((atlas) => atlas.dispose()).catch(() => {});
    this.hairAtlasTexture = null;
  }

  /**
   * 背带（_KeepSling）是照 X Bot 的胸口摆的：别的身材按胸口截面（TorsoSection）之比，在 XBOT_SLING_FIT.bone 的本地横截面里
   * 从 X Bot 的胸口中心挪到这个人的、宽厚按比例放大（日兵甲胸口比 X Bot 厚，11-03 取证：不撑时背带进身体 > 3 cm 的帧 92%，
   * 正面看不到斜挎的带子）。→ { from, to, k } | null
   */
  _SlingFit(b) {
    const a = this.torsoSection;
    if (!a || !b) return null;
    return { from: [a.cx, a.cz], to: [b.cx, b.cz], k: [Math.max(1, b.hx / a.hx), Math.max(1, b.hz / a.hz)] };
  }

  /**
   * 这个配色的人用哪套人物：有名字的人（look.key 是角色键）按 XBOT_CAST_CHARACTERS，阵营素色（look.key 就是阵营）按
   * XBOT_FACTION_CHARACTERS（写了几个人就按 seed —— 兵的编号 —— 的字符串哈希固定挑一个，读不到的跳过），其余 X Bot。
   */
  KitFor(look, seed = "", faction = null) {
    const cast = this.kits.get(XBOT_CAST_CHARACTERS[look.key]);
    if (cast) return cast;
    let kits = FactionCharacterKeys(look.key).map(key => this.kits.get(key)).filter(Boolean);
    if (!kits.length && faction && faction !== look.key) kits = FactionCharacterKeys(faction).map(key => this.kits.get(key)).filter(Boolean);
    if (!kits.length) return this.kits.get("xbot");
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return kits[h % kits.length];
  }

  /** 同动作预览工具：端枪瞄准待机第 0 帧，握把放进右手掌心、枪管指向左手掌心、准星朝上，记下枪相对右手的位置朝向。 */
  async _CalibrateRifle() {
    const model = CloneSkinned(this.source);
    const clip = await this.Clip(XBOT.rifleCalibration, { pin: true });
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play(); mixer.update(0);
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
  }

  /**
   * 载入 BlenderMCP 烘焙的 9 帧端枪 Aim Offset（Animation_RifleAimOffset9.glb）并离线预减基准帧（帧 4）：
   *   · Spine..Head 计算模型空间增量 Delta（ΔM[b] = D_w[b] · D_w[parent]⁻¹），在跑步前倾时依然沿竖直平面抬/压枪；
   *   · Left/RightShoulder、Arm、ForeArm、Hand 计算本地空间 Additive Delta（Q_ref⁻¹ · Q_pose），保留锁骨耸肩/贴腮/手肘微调；
   *   · 双腿与 Hips 不入表（0° 透明）。加载失败时静默退回程序化脊柱分摊，不影响主流程。
   */
  async _LoadAimOffsetGrid() {
    try {
      const cfg = XBOT_AIM_OFFSET;
      const gltf = await this.loader.loadAsync(this.base + cfg.file);
      const clip = gltf?.animations?.[0];
      if (!clip) return;
      const model = CloneSkinned(this.source);
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

      for (let f = 0; f < total; f += 1) {
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
      // 1) Spine..Head 增量 Mesh-Space Delta：D_w[k][b] = Q_w[k][b] · Q_w[ref][b]⁻¹, ΔM[k][b] = D_w[k][b] · D_w[k][parent]⁻¹
      const totalDelta = Array.from({ length: total }, () => new Map());
      const meshDelta = new Map();
      for (let i = 0; i < XBOT_AIM_SPINE_BONES.length; i += 1) {
        const name = XBOT_AIM_SPINE_BONES[i];
        const parentName = i > 0 ? XBOT_AIM_SPINE_BONES[i - 1] : null;
        const qRef = worldQ[ref].get(name);
        if (!qRef) continue;
        const qRefInv = qRef.clone().invert();
        const arr = [];
        for (let f = 0; f < total; f += 1) {
          const dw = worldQ[f].get(name).clone().multiply(qRefInv).normalize();
          totalDelta[f].set(name, dw);
          const dParent = parentName ? totalDelta[f].get(parentName) : null;
          const inc = dParent ? dw.clone().multiply(dParent.clone().invert()).normalize() : dw.clone();
          if (inc.w < 0) inc.set(-inc.x, -inc.y, -inc.z, -inc.w);
          arr.push(inc);
        }
        meshDelta.set(name, arr);
      }

      // 2) Clavicle & Arm 本地空间 Additive Delta：ΔL[k][b] = Q_local[ref][b]⁻¹ · Q_local[k][b]
      const localDelta = new Map();
      for (const [name] of XBOT_AIM_ARM_BONES) {
        const qRef = localQ[ref].get(name);
        if (!qRef) continue;
        const qRefInv = qRef.clone().invert();
        const arr = [];
        for (let f = 0; f < total; f += 1) {
          const dl = qRefInv.clone().multiply(localQ[f].get(name)).normalize();
          if (dl.w < 0) dl.set(-dl.x, -dl.y, -dl.z, -dl.w);
          arr.push(dl);
        }
        localDelta.set(name, arr);
      }

      this.aimOffsetGrid = { cfg, meshDelta, localDelta };
    } catch (error) {
      console.warn("[XBot] 9-pose Aim Offset load skipped, falling back to procedural spine aim:", error?.message || error);
    }
  }

  /**
   * 清单条目写了 rifleTrack 的端枪动作（枪在动作里背到背上 / 掉地，Script_MixamoProps.mjs）：在一具不显示的 X Bot 上把动作
   * 摆到交接那几刻，交给 PrepareRifleTrack（模型空间、缩放 1）。动作还没读到返回 null（不缓存，下次再来）。
   */
  RifleTrack(file) {
    if (this.rifleTracks.has(file)) return this.rifleTracks.get(file);
    const lib = this.library?.get(file), clip = this.loaded.get(file);
    if (!lib?.rifleTrack || !this.rifleOffset) { this.rifleTracks.set(file, null); return null; }
    if (!clip) return null;
    const model = this.scratch || (this.scratch = CloneSkinned(this.source));
    const bones = new Map(); model.traverse(o => { if (o.isBone) bones.set(o.name, o); });
    const B = (n) => bones.get(n);
    const mixer = new THREE.AnimationMixer(model), action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const band = AimBandFor(lib);
    const info = PrepareRifleTrack(lib.rifleTrack, (t) => {
      action.time = THREE.MathUtils.clamp(t, 0, clip.duration); mixer.update(0); model.updateMatrixWorld(true);
      return RifleTrackSample(B, this.rifleOffset, 1, band);
    }, 30);
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    this.rifleTracks.set(file, info);
    return info;
  }

  /**
   * 读一条动作（Animation/Mixamo 下的相对路径）。根位移：循环动作去掉匀速前进的那部分（左右晃留着），
   * 一次性动作 Hips 的水平位置钉在第 0 帧（人由编辑器搬，不让动作自己往前蹿）；派生动作原样（换算出来的位移就是原身体的位移）。
   */
  Clip(file, { pin = null } = {}) {
    if (!this.clips.has(file)) {
      this.clips.set(file, this.loader.loadAsync(this.base + file).then((gltf) => {
        const clip = gltf.animations[0];
        clip.name = file;
        const entry = this.library?.get(file);
        const derived = file.startsWith("Derived/");
        const loop = entry?.loop ?? false;
        if (!derived && !entry?.inPlace) this._FixRoot(clip, pin ?? !loop);
        if (!derived && loop) this._CloseLoopSeam(clip);
        this.loaded.set(file, clip);
        return clip;
      }));
    }
    return this.clips.get(file);
  }

  /** 对循环片段末尾 2 帧向首帧做平滑闭合，消除 Mixamo 原始片段（如 RifleRun_V1 6.6° 接缝）循环回绕瞬间的局部抽搐。 */
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
      // 末帧对齐首帧，倒数第 2 帧半程平滑过渡
      v[(n - 1) * 4] = q0.x; v[(n - 1) * 4 + 1] = q0.y; v[(n - 1) * 4 + 2] = q0.z; v[(n - 1) * 4 + 3] = q0.w;
      const prevOff = (n - 2) * 4;
      qi.set(v[prevOff], v[prevOff + 1], v[prevOff + 2], v[prevOff + 3]).normalize();
      if (qi.dot(q0) < 0) qi.set(-qi.x, -qi.y, -qi.z, -qi.w);
      qi.slerp(q0, 0.5).normalize();
      v[prevOff] = qi.x; v[prevOff + 1] = qi.y; v[prevOff + 2] = qi.z; v[prevOff + 3] = qi.w;
    }
  }

  _FixRoot(clip, pinAll) {
    const track = clip.tracks.find(t => t.name === "Hips.position");
    if (!track || !this.rootParent) return;
    const v = track.values, n = v.length / 3, model = [];
    for (let i = 0; i < n; i++) model.push(new THREE.Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).applyMatrix4(this.rootParent));
    // 拷一份：下面的循环会把 model[0] 先换回本地空间，引用会被改掉
    const first = model[0].clone(), last = model[n - 1].clone();
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? i / (n - 1) : 0;
      if (pinAll) { model[i].x = first.x; model[i].z = first.z; }
      else { model[i].x -= (last.x - first.x) * a; model[i].z -= (last.z - first.z) * a; }
      model[i].applyMatrix4(this.hipsParentInv);
      v.set(model[i].toArray(), i * 3);
    }
  }

  /**
   * 提纯开火动画的上半身 Additive 差值轨道（离线减法：每根上半身骨 Q_delta(t) = Q(0)⁻¹ · Q(t)）。
   * 下半身与 Hips 不入表（等于 0° 透明），运行时直接叠在走路 / 跑步 / 横移之上，彻底消除开火滑步。
   */
  AdditiveFireTracks(file) {
    if (this.additiveFireCache.has(file)) return this.additiveFireCache.get(file);
    const clip = this.loaded.get(file);
    if (!clip) { this.Clip(file); return null; }
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

  /**
   * 提纯 Turn-in-Place 片段里 Hips 相对第 0 帧的水平偏航曲线（模型空间 Y 轴分量，连续解缠）。
   * 播放原地转身片段时按此曲线反向抵消 Hips 旋转（Root Yaw Extraction），避免与下盘控制器双重旋转或在切回 Idle 时跳帧。
   */
  TurnYawCurve(file) {
    if (this.turnYawCache.has(file)) return this.turnYawCache.get(file);
    const clip = this.loaded.get(file);
    if (!clip) { this.Clip(file); return null; }
    const track = clip.tracks.find((tr) => tr.name === "Hips.quaternion");
    if (!track || !this.rootParent) { this.turnYawCache.set(file, null); return null; }
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
      // 模型空间里相对第 0 帧的旋转：dm = pQ * (qk * q0⁻¹) * pQ⁻¹
      dm.copy(qk).multiply(q0Inv).premultiply(pQ).multiply(pQInv).normalize();
      // 绕 Y 轴的 Swing-Twist 偏航分量
      const raw = 2 * Math.atan2(dm.y, dm.w);
      if (i > 0) accum += WrapAngle(raw - prev);
      prev = raw;
      values[i] = accum;
    }
    const curve = { duration: clip.duration || 1, times: track.times, values };
    this.turnYawCache.set(file, curve);
    return curve;
  }

  /** 返回原地转身片段在归一化进度 u ∈ [0,1] 处已完成的总偏航比例，用于驱动下盘与真实迈步同拍收敛。 */
  SampleTurnCurveFrac(file, u) {
    const curve = file ? this.TurnYawCurve(file) : null;
    if (!curve || !curve.values.length) return null;
    const total = curve.values[curve.values.length - 1];
    if (Math.abs(total) < 0.05) return null;
    return Clamp(SampleScalarCurve(curve, Clamp(u, 0, 1) * curve.duration) / total, 0, 1);
  }

  /**
   * 采样待机据枪片段（如 RifleAimingIdle_V1）第 0 帧的上半身姿态（Spine/Spine1 模型空间 + Spine2 以上本地空间），
   * 供原地转身（Turn-in-Place）做 Layered Blend per Bone：下半身用 Turn90 迈步、上半身全程保持抵肩锁靶绝不垂枪。
   */
  IdleUpperPose(file) {
    if (this.upperPoseCache.has(file)) return this.upperPoseCache.get(file);
    const clip = this.loaded.get(file);
    if (!clip || !this.source) { if (file) this.Clip(file); return null; }
    const model = CloneSkinned(this.source);
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

  /** 同一种配色的人共用材质（都是同一套蒙皮，不会来回换着色器）。 */
  Material(look, part) {
    const key = `${look.key}:${part}`;
    if (!this.materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color: part === "joints" ? look.joints : look.surface, roughness: 0.62, metalness: 0.05 });
      // 角色光照（环境系统 CharacterLight 组件）：替身也吃同一份补光 / 轮廓光，白盒里调人物光照看得到
      ApplyPatches(material, [CHARACTER_LIGHT_PATCH]);
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  /** 原身体那具模型的初始姿势与换算器（同一模型号共用）。 */
  SourceRest(rig) {
    const key = rig.modelId || "default";
    if (!this.sourceRests.has(key)) {
      // 初始姿势从这具模型读进来的原件量（rig.asset.gltf.scene，克隆的源，从不播动作）
      const original = rig.asset?.gltf?.scene;
      const mesh = original && FirstSkinnedMesh(original);
      if (!mesh) return null;
      const { rest } = SkinRest(original, mesh);
      this.sourceRests.set(key, { rest, retarget: new XBotRetarget(rest, this.rest, { targetParentOfRoot: this.rootParent }),
        headY: rest.worldP[rest.Find("Bip001_Head")]?.y || 1.55 });
    }
    return this.sourceRests.get(key);
  }

  /** 给一个人挂 X Bot；资源没读完或这个人没有骨骼身体（旧的体块 / tzm 百姓）返回 null。 */
  Attach(actor, { faction = "nra", castId = null, unitId = null, seed = unitId || "", kitKey = null, goreEnabled = false } = {}) {
    if (!this.ready || !actor?.characterRig?.root) return null;
    return new XBotSkin(this, actor, faction, XBotLook({ faction, castId, unitId }), seed, { kitKey, goreEnabled });
  }
}

const XBOT_GORE_BONE_MAP = Object.freeze({
  pelvis: "Hips", chest: "Spine2", neck: "Neck", head: "Head", headCenter: "Head",
  upperArmL: "LeftArm", forearmL: "LeftForeArm", handL: "LeftHand",
  upperArmR: "RightArm", forearmR: "RightForeArm", handR: "RightHand",
  thighL: "LeftUpLeg", calfL: "LeftLeg", footL: "LeftFoot",
  thighR: "RightUpLeg", calfR: "RightLeg", footR: "RightFoot",
});

/** 一个人身上的 X Bot。 */
export class XBotSkin {
  constructor(skins, actor, faction, look, seed = "", options = {}) {
    this.skins = skins;
    this.actor = actor;
    this.rig = actor.characterRig;
    this.faction = faction;
    this.look = look;
    this.kit = (options.kitKey && skins.kits.get(options.kitKey)) || skins.KitFor(look, seed, faction);
    this.goreMeta = this.kit.goreMeta || null;
    this.goreEnabled = !!(options.goreEnabled || this.kit.def?.goreEnabled);
    this.severedHitboxes = null;
    this.hitboxCache = null;
    this.model = CloneSkinned(this.kit.source);
    this.model.name = "XBot";
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      // 蒙皮包围球冻在第一帧的姿势（趴下、倒地会被误剔），编辑器里人不多，不剔
      o.frustumCulled = false;
      if (!this.kit.def.ownMaterial) o.material = skins.Material(look, /joint/i.test(o.material?.name || "") ? "joints" : "surface");
    });
    this.container = new THREE.Group();
    this.container.name = "XBotSkin";
    // 取证脚本（_import/Script_XBotAttachmentProbe.mjs）从场景里找回这个人
    this.container.userData.xbotSkin = this;
    this.container.add(this.model);
    this.rig.root.parent?.add(this.container);
    // 头发挂在 Head 骨下（docs/Data_HairSystem.md §7）；切档要相机，由 skins.view 给（白盒编辑器装）
    this.hair = null;
    const headBone = this.model.getObjectByName("Head");
    if (this.kit.groom && headBone) {
      this.hair = new HairGroom(this.kit.groom, { atlas: skins.hairAtlasTexture, lightRig: skins.view?.lightRig || null,
        name: this.kit.key, boneRoot: this.model });
      headBone.add(this.hair.root);
    }
    this.bones = new Map();
    this.model.traverse(o => { if (o.isBone) this.bones.set(o.name, o); });
    this.boneList = skins.rest.bones.map(b => this.bones.get(b.name));
    this.mixer = new THREE.AnimationMixer(this.model);
    this.source = skins.SourceRest(this.rig);
    this.scaleK = this.kit.def.heightM
      ? CharacterScaleHeight(this.rig.asset.record) / this.kit.def.heightM
      : this.source ? this.source.headY / this.kit.headY : 0.97;
    this.hidden = [];
    this.rig.root.traverse(o => { if (o.isSkinnedMesh) { o.visible = false; this.hidden.push(o); } });
    this.srcBones = this.source ? this.source.rest.bones.map(b => this.rig.root.getObjectByName(b.name)) : [];
    this.srcQ = this.srcBones.map(() => new THREE.Quaternion());
    this.outQ = skins.rest.bones.map(() => new THREE.Quaternion());
    this.outHips = new THREE.Vector3();
    this.attachments = [];
    this.attachScan = -1;
    this.current = null;     // { file, action, clock, mode }
    this.pending = null;
    this.frame = 0;
    this.wasDown = null;
    this.rifleOnLeft = null;
    this.H = (n) => this.bones.get(n);
    this.model.updateMatrixWorld(true);
    const lfBind = this.H("LeftFoot"), rfBind = this.H("RightFoot");
    const bindLy = lfBind ? lfBind.getWorldPosition(_p).y : 0.095;
    const bindRy = rfBind ? rfBind.getWorldPosition(_p).y : bindLy;
    this.ankleRestOffY = THREE.MathUtils.clamp((bindLy + bindRy) * 0.5, 0.06, 0.18);
    // 换动作的过渡（XBOT.fadeS）：mixer 只在值变了的时候才写骨头（three PropertyMixer），过渡和握枪 IK 改过的骨头
    // 下一帧要先还原成 mixer 上一次写的值（base），不然停住的动作会把改过的值留着
    this.base = this.boneList.map(() => new THREE.Quaternion());
    this.baseHips = new THREE.Vector3();
    this.baseValid = false;
    // 上一帧最后看到的姿势（过渡、IK 之后）：本地朝向，胯另记世界 / 本地两份
    this.shownQ = this.boneList.map(() => new THREE.Quaternion());
    this.shownHips = new THREE.Vector3();
    this.shownHipsLocal = new THREE.Vector3();
    this.shownAt = new THREE.Vector3();
    this.shownContainer = new THREE.Matrix4();
    this.holdLocal = null;   // 停在倒地姿势时容器挂在人物根下的位姿
    this.shownHeadY = 0;
    this.shownValid = false;
    this.stepY = 0;          // 容器跟着根的高度（XBOT.stepM 以内的台阶平滑跟）
    this.rawY = 0;
    this.blend = null;       // { q, hips（本地）, t, dur }
    this.pickKey = null;
    this.jumped = false;
    this.downHold = false;
    this.prevDown = false;
    this.rifleShown = null;  // { which: "hand" | "back", local }
    this.rifleSwap = null;
    this.weaponVisualFit = null;
    this.weaponVisualOffset = new THREE.Vector3();
    // 3C 动作系统状态（四向主干朝向扭曲 / 支撑脚锁地 IK / 原地转身 / Additive 开火）
    this.tip = new TurnInPlaceController();
    this.footLock = new FootLockController();
    this.locoRunning = false;
    this.locoPrimary = null;
    this.locoPhase = 0;
    this.pelvisWarp = 0;
    this.blendActions = new Map();
    this.blendWeights = new Map();
    this.preOverlayQ = this.boneList.map(() => new THREE.Quaternion());
    this.preOverlayValid = false;
    this.addFireAge = Infinity;
    this.lastFireSeq = null;
    this.prevFiring = false;
    this.last3C = null;
    this.meleeFlinch = null;
    this.inMelee = false;
    this.wounds = new CharacterWounds(this.model);
    this.goreBones = {};
    for (const [role, name] of Object.entries(XBOT_GORE_BONE_MAP)) {
      const b = this.bones.get(name);
      if (b) this.goreBones[role] = b;
    }
    if (this.actor) {
      this.actor.skinWounds = this.wounds;
      if (this.goreEnabled) this.actor.goreSkin = this;
    }
  }

  /** 按真实 65 骨 XBot 骨架生成与 CHARACTER_HITBOX_PROFILE 同口径的命中体（断肢测试场精确射线 / 刀劈 / 爆炸用）。 */
  GetHitboxes() {
    this.container.updateWorldMatrix(true, true);
    if (!this.hitboxCache) {
      this.hitboxCache = CHARACTER_HITBOX_PROFILE.map((spec) => ({
        ...spec,
        center: new THREE.Vector3(),
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        worldRadius: spec.radius,
      }));
    }
    const scale = this.container.getWorldScale(_s).y || 1;
    const out = [];
    for (const shape of this.hitboxCache) {
      if (this.severedHitboxes?.has(shape.id)) continue;
      shape.worldRadius = shape.radius * scale;
      if (shape.type === "sphere") {
        const bone = this.goreBones[shape.role] || this.goreBones.head;
        if (!bone) continue;
        bone.matrixWorld.decompose(_p, _q, _s2);
        // XBot Head 骨原点在枕骨/颈顶交界，沿头部 +Y 上移 9 cm 才对准颅心。
        shape.center.set(0, 0.09 * scale, 0.015 * scale).applyQuaternion(_q).add(_p);
        out.push(shape);
      } else {
        const ba = this.goreBones[shape.a], bb = this.goreBones[shape.b];
        if (!ba || !bb) continue;
        ba.getWorldPosition(shape.start);
        bb.getWorldPosition(shape.end);
        out.push(shape);
      }
    }
    return out;
  }

  Raycast(origin, direction, maxDistance) {
    return RaycastShapes(this.GetHitboxes(), origin, direction, maxDistance);
  }

  /** Trigger a short physical recoil on upper body/head/arms so hits read clearly even during Mixamo clips. */
  ApplyMeleeFlinch(dirX = 0, dirZ = 1, strength = 1, kind = "flesh") {
    const len = Math.hypot(dirX, dirZ) || 1;
    this.meleeFlinch = {
      dx: dirX / len,
      dz: dirZ / len,
      strength: THREE.MathUtils.clamp(strength, 0.35, 2.2),
      kind,
      t: 0,
      dur: kind === "crush" ? 0.56 : kind === "rip" ? 0.48 : kind === "block" ? 0.46 : 0.32,
    };
  }

  /** Instant state reset for in-place actor reuse (avoids tearing down XBotSkin / HairGroom shaders). */
  ResetState() {
    this.mixer.stopAllAction();
    this.blendActions.clear();
    this.blendWeights.clear();
    this.current = null;
    this.pick = null;
    this.pickKey = null;
    this.blend = null;
    this.shownValid = false;
    this.baseValid = false;
    this.preOverlayValid = false;
    this.downHold = false;
    this.prevDown = false;
    this.corpseSettled = false;
    this.deathFall = null;
    this.holdLocal = null;
    this.meleeFlinch = null;
    this.wounds?.Clear();
    this.rifleOnLeft = null;
    this._EndRifleSwap();
    this.rifleShown = null;
    this.ikR = 0;
    this.ikL = 0;
    this.lastMount = null;
    this.contact = null;
    this.attachScan = -1;
    for (const a of this.attachments) {
      a.written = null; a.wWritten = null; a.intended = null; a.wIntended = null;
      a.weaponBlend = null; a.weaponMode = null; a.weaponLocal = null;
      a.looseDrop = null; a.handRel = null; a.unheldT = 0;
    }
  }

  get visible() { return this.container.visible; }

  /**
   * 每帧（原身体 Update 之后）调一次。intent：
   *   clip / clipSeconds / clipDuration / clipLoop  预演片段与它在原片段里的秒数
   *   throwSeconds   投弹片段的秒数（预演 throw 键）
   *   mps / stance / aim / carryRole / woundedWalk / talking   原生状态
   *   melee          白刃导演给的姿态（Script_MeleeCombat.Pose：weapon / action / animationNormalized …），没在拼刺刀为空
   *   down           倒地；exact  要精确贴位置（顺着躺、坐车）→ 当场换算原身体的姿势
   *   firing         这一帧开了枪（试玩的 AI）→ 播 fireHoldS 秒开枪动作
   *   shadow         投不投影
   */
  Sync(intent, dt) {
    const rig = this.rig, actor = this.actor;
    this.sourceMatricesReady = false;
    this.frame += 1;
    if (!intent.down) { this.corpseSettled = false; this.deathFall = null; }
    const visible = actor.root.visible !== false && rig.root.visible !== false;
    this.container.visible = visible;
    for (const mesh of this.hidden) mesh.visible = false;
    // 藏起来过：再出来时没人看见它之前的样子，直接摆当前姿势（不从藏起来那一刻的姿势淡）
    if (!visible) {
      this.shownValid = false; this.blend = null; this._EndRifleSwap(); this.rifleShown = null;
      this.tip.Reset(Number.isFinite(intent.yaw) ? intent.yaw : 0);
      this.footLock.Reset();
      this.pelvisWarp = 0;
      this.locoPrimary = null;
      return;
    }
    this.container.position.copy(rig.root.position);
    this.container.quaternion.copy(rig.root.quaternion);
    this.container.scale.copy(rig.root.scale).multiplyScalar(this.scaleK);
    // Placement only needs the container transform. Bone descendants are
    // refreshed after the new pose/blend, before IK and rendering read them.
    this.container.updateWorldMatrix(true, false);
    // 台阶：地面高度在人物根（容器的上两层）上，按世界高度平滑，再把差值折回容器的本地 y
    // 按原始高度这一帧变了多少判断是台阶还是瞬移（顺着一级级的坡往下走，平滑出来的高度会越落越后，不能拿它比）
    const worldY = this.container.matrixWorld.elements[13], rawStep = worldY - this.rawY;
    this.rawY = worldY;
    if (this.shownValid && Math.abs(rawStep) < XBOT.stepM) this.stepY += (worldY - this.stepY) * (1 - Math.exp(-Math.max(dt, 0) / XBOT.stepS));
    else this.stepY = worldY;
    if (Math.abs(this.stepY - worldY) > 1e-5) {
      this.container.parent.matrixWorld.decompose(_p, _q, _s);
      this.container.position.y += (this.stepY - worldY) / (_s.y || 1);
      this.container.updateWorldMatrix(true, false);
    }
    if (intent.shadow !== undefined && !!intent.shadow !== this.shadow) {
      this.shadow = !!intent.shadow;
      this.model.traverse(o => { if (o.isMesh && !o.userData.hairGroom) o.castShadow = this.shadow; });
    }

    // 实时战斗/AI 角色启用 3C 动作系统（预演片段 / 精确换算 / 白刃 / 倒地 / 投弹走原路不动）
    const rifle = this._RifleInHands();
    const stance = intent.stance === "prone" ? "prone" : intent.stance === "crouch" ? "crouch" : "stand";
    const aimWeight = Number.isFinite(intent.aimWeight) ? Clamp(intent.aimWeight, 0, 1) : (intent.aim ? 1 : 0);
    const live3C = !intent.down && !intent.exact && !intent.melee && !intent.clip
      && !Number.isFinite(intent.throwSeconds) && Number.isFinite(intent.yaw)
      && !intent.carryRole && !intent.woundedWalk;
    const teleported = this.shownValid && this.container.getWorldPosition(_p).distanceTo(this.shownAt) > 1.5;

    // Additive 开火脉冲边沿检测（逐发触发，不锁死双腿）
    const fireSeq = Number.isFinite(intent.fireSequence) ? intent.fireSequence : null;
    if (fireSeq !== null) {
      if (this.lastFireSeq !== null && fireSeq !== this.lastFireSeq) this.addFireAge = 0;
      this.lastFireSeq = fireSeq;
    } else if (intent.firing && !this.prevFiring) {
      this.addFireAge = 0;
    }
    this.prevFiring = !!intent.firing;
    if (this.addFireAge < NPC_3C.fireDurationS) this.addFireAge += Math.max(dt, 0);

    let loco3c = null, tip3c = null, lowerYawOff = 0;
    if (live3C) {
      loco3c = ComputeLocomotion2D({
        vx: intent.vx || 0, vz: intent.vz || 0, yaw: intent.yaw,
        stance, aimWeight, rifleInHands: rifle, speedMps: intent.mps,
        running: this.locoRunning, prevPrimary: this.locoPrimary,
      });
      this.locoRunning = loco3c.running;
      this.locoPrimary = loco3c.moving ? loco3c.primary : null;
      tip3c = this.tip.Update(dt, {
        yaw: intent.yaw, mps: intent.mps || 0, stance, aimWeight, rifleInHands: rifle,
        active: true, teleported,
        sampleTurnFrac: (clipKey, u) => this.skins.SampleTurnCurveFrac(XBOT_TURN_IN_PLACE[clipKey]?.file, u),
      });
      this.pelvisWarp = teleported ? 0 : Approach(this.pelvisWarp, loco3c.pelvisWarpRad, dt, 0.11);
      lowerYawOff = WrapAngle(tip3c.visualYawOffset + this.pelvisWarp);
      if (Math.abs(lowerYawOff) > 1e-5) {
        this.container.quaternion.premultiply(_yawQ.setFromAxisAngle(_up, lowerYawOff));
        this.container.updateWorldMatrix(true, false);
      }
      this.last3C = { loco: loco3c, tip: tip3c, pelvisWarp: this.pelvisWarp, lowerYawOff };
    } else {
      this.tip.Reset(Number.isFinite(intent.yaw) ? intent.yaw : 0);
      this.footLock.Reset();
      this.pelvisWarp = 0;
      this.locoRunning = false;
      this.locoPrimary = null;
      this.last3C = null;
    }

    // 仅保留卧倒/无 3C 上下文时的旧开火保持；站/蹲实机走上半身 Additive 后坐，绝不锁腿
    this.fireT = (!live3C || stance === "prone")
      ? (intent.firing ? XBOT.fireHoldS : Math.max(0, (this.fireT || 0) - dt))
      : 0;
    this.down = !!intent.down;
    const pick = this._Pick(intent, live3C ? { loco: loco3c, tip: tip3c, rifle, stance, aimWeight } : null);
    this.jumped = false;
    // 试玩 AI 的尸体：倒地片段和原身体倒向差的那点偏角，倒地开始后同原身体的转向一样快地转过去（DEATH.yawBlendS）
    if (pick.death && pick.deathYaw) {
      this.container.quaternion.premultiply(_yawQ.setFromAxisAngle(_up, pick.deathYaw * Smooth01(intent.downAge / DEATH.yawBlendS)));
      this.container.updateWorldMatrix(true, false);
    }
    // 停在倒地姿势时，藏起来的原身体还在放它自己的倒地、布娃娃（actor.body 一上一下、在坡上会滑）：X Bot 改挂到人物根
    // （actor.root：只有预演摆它 —— 位置、朝向、藏不藏），停住那一刻相对它在哪就一直在哪；预演挪人（下一段换位置）照样跟着走
    const root = this.actor.root;
    if (pick.mode === "hold") {
      if (!this.holdLocal) {
        root.updateWorldMatrix(true, false);
        this.holdLocal = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(this.shownContainer);
        if (this.container.parent !== root) root.add(this.container);
      }
      this.holdLocal.decompose(this.container.position, this.container.quaternion, this.container.scale);
      this.container.updateWorldMatrix(true, false);
      this.stepY = this.rawY = this.container.matrixWorld.elements[13];
    } else {
      this.holdLocal = null;
      // 站起来了（预演把倒地的人扶起来）：挂回原来的位置
      if (this.container.parent === root && rig.root.parent && rig.root.parent !== root) {
        rig.root.parent.add(this.container);
        this.container.position.copy(rig.root.position);
        this.container.quaternion.copy(rig.root.quaternion);
        if (Math.abs(lowerYawOff) > 1e-5) this.container.quaternion.premultiply(_yawQ.setFromAxisAngle(_up, lowerYawOff));
        this.container.scale.copy(rig.root.scale).multiplyScalar(this.scaleK);
        this.container.updateWorldMatrix(true, false);
      }
    }
    if (pick.mode === "hold") this._Hold();
    else if (pick.mode === "blend2d") this._PlayBlendSpace(pick, intent, dt);
    else if (pick.mode === "mirror" || !pick.file) this._Mirror(dt);
    else this._Play(pick, intent, dt);
    // Turn-in-Place Root Yaw Extraction：剔除片段自带的 Hips 转向，由下盘控制器统一驱动；
    // 据枪瞄准态同步叠加上半身分层遮罩（Mesh-Space Layered Blend），只取 Turn90 的迈步、上半身全程保持抵肩锁靶不垂枪
    if (pick.turnInPlace && this.current && !this.current.mirror && this.current.lastT !== null) {
      this._CancelTurnHipsYaw(pick.file, this.current.lastT);
      if (rifle && aimWeight >= 0.2 && stance !== "prone") {
        const idleFile = stance === "crouch" ? XBOT_NATIVE.crouchIdleRifleAim.file : XBOT_NATIVE.standIdleRifleAim.file;
        this._ApplyTurnUpperBodyMask(idleFile, Smooth01((aimWeight - 0.15) / 0.4));
      }
    }
    // 换了动作（或同一条动作跳了时间）：从上一帧看到的姿势淡过去
    // 按这一帧实际摆出来的算（动作还没读到时照原身体换算，读到那一帧也是换动作）
    const key = pick.mode === "hold" ? this.pickKey
      : !this.current || this.current.mirror ? "mirror"
        : pick.mode === "blend2d" ? "blend2d:" + pick.groupKey
          : pick.file + (pick.death ? "|death" : "");
    if (this.shownValid && (key !== this.pickKey || this.jumped)) this._BeginBlend(live3C);
    this.pickKey = key;
    this._ApplyBlend(dt);
    // 记录叠加 Aim Offset / 开火后坐 / 手部 IK 之前的纯净底层姿态，避免换状态时把 Aim Offset 叠加两次导致步枪抖动
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.preOverlayQ[i].copy(this.boneList[i].quaternion);
    this.preOverlayValid = true;
    if (pick.death && Number.isFinite(intent.downAge)) this._FollowRigPelvis();
    this.container.updateMatrixWorld(true);
    // 脊柱 Aim Offset（优先用 BlenderMCP 9 帧精修网格）+ 开火上半身 Additive 叠加 + 三态支撑脚锁地/收步 2-Bone Leg IK
    if (live3C) {
      this._ApplySpineAimOffset(intent, lowerYawOff, aimWeight, stance, rifle);
      this._ApplyAdditiveFire(intent, rifle, stance);
      const footMode = tip3c?.turning ? "turn" : (loco3c?.moving ? "move" : "idle");
      this._ApplyFootLock(dt, footMode, stance, teleported);
      this.container.updateMatrixWorld(true);
    }
    this.inMelee = !!intent.melee;
    if (this.meleeFlinch && !intent.down) {
      this._ApplyMeleeFlinch(dt);
      this.container.updateMatrixWorld(true);
    }
    // Always pass the actual pose mode into _Reanchor: when _Play falls back to _Mirror while a
    // Mixamo clip is still loading, this.current.mirror is true and this.pick is { mode: "mirror" }.
    const reanchorPick = this.current?.mirror ? this.pick : (pick.mode === "hold" ? this.pick || pick : pick);
    const aimCtx = live3C ? { aimWeight, lookYaw: intent.lookYaw || 0, lookPitch: intent.lookPitch || 0 } : null;
    this._Reanchor(reanchorPick, dt, aimCtx);
    this._Remember(intent);
    // 倒地动作在画面里放到最后一帧、过渡也淡完：尸体定住了，SoldierView 之后不再推它。
    // 倒地动作没读到、照原身体换算（mirror）的：原身体倒完了，这一帧换算的就是最后的姿势
    const cur = this.current;
    this.corpseSettled = !!intent.down && !this.blend && (pick.mode === "hold"
      || (!!pick.death && !!cur && !cur.mirror && cur.file === pick.file && cur.lastT >= cur.action.getClip().duration - 1e-4)
      || (!!cur?.mirror && actor.ragdollState?.t >= 1));
    const view = this.skins.view;
    if (this.hair && view?.camera) {
      this.hair.maxLod = HAIR_QUALITY[view.post?.quality || 'high'];
      this.hair.Update(dt, view.camera, view.renderer);
    }
    this.wounds?.Update(dt);
  }

  /** 这一帧最后看到的姿势（IK、枪都摆完之后）：下一次换动作从它淡过去。 */
  _Remember(intent) {
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.shownQ[i].copy(this.boneList[i].quaternion);
    const hips = this.H("Hips"), head = this.H("Head");
    if (hips) { hips.getWorldPosition(this.shownHips); this.shownHipsLocal.copy(hips.position); }
    this.shownHeadY = head ? head.getWorldPosition(_p).y : this.shownHips.y;
    this.container.getWorldPosition(this.shownAt);
    this.shownContainer.copy(this.container.matrixWorld);
    this.shownValid = !!hips;
    this.prevDown = !!intent.down;
  }

  /** 从上一帧看到的姿势起一段过渡。3C 态用叠加 AimOffset/IK 前的底层姿态起淡，杜绝切停时双倍 AimOffset 引起枪口抖动。 */
  _BeginBlend(usePreOverlay = false) {
    const hips = this.H("Hips");
    const b = this.blend || (this.blend = { q: this.boneList.map(() => new THREE.Quaternion()), hips: new THREE.Vector3(), t: 0, dur: null });
    const srcQ = usePreOverlay && this.preOverlayValid ? this.preOverlayQ : this.shownQ;
    for (let i = 0; i < this.boneList.length; i++) b.q[i].copy(srcQ[i]);
    const moved = this.container.getWorldPosition(_p).distanceTo(this.shownAt);
    if (moved <= XBOT.rerootM) {
      hips.parent.updateWorldMatrix(true, false);
      b.hips.copy(this.shownHips).applyMatrix4(_m.copy(hips.parent.matrixWorld).invert());
    } else b.hips.copy(this.shownHipsLocal);
    b.t = 0;
    b.dur = null;
  }

  _ApplyBlend(dt) {
    const b = this.blend, hips = this.H("Hips");
    if (!b || !hips) return;
    if (b.dur === null) {
      // 胯要挪多远（世界米）定这段过渡多长
      hips.parent.updateWorldMatrix(true, false);
      const from = _p.copy(b.hips).applyMatrix4(hips.parent.matrixWorld), to = hips.getWorldPosition(_p2);
      b.dur = THREE.MathUtils.clamp(XBOT.fadeS + XBOT.fadePerM * from.distanceTo(to), XBOT.fadeS, XBOT.fadeMaxS);
    }
    b.t += Math.max(dt, 0);
    const k = Math.min(1, b.t / b.dur), e = k * k * (3 - 2 * k);
    for (let i = 0; i < this.boneList.length; i++) {
      const bone = this.boneList[i];
      if (!bone) continue;
      _q.copy(bone.quaternion);
      if (_q.dot(b.q[i]) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      bone.quaternion.slerpQuaternions(b.q[i], _q, e);
    }
    hips.position.lerpVectors(b.hips, _p.copy(hips.position), e);
    if (k >= 1) this.blend = null;
  }

  /** 停在倒地前最后那个姿势（XBOT.downHoldHeadM）：骨头还原成 mixer 上一次写的值，不推时间。 */
  _Hold() {
    // 倒下那一刻还在当场换算（动作文件还没读到）：没有 mixer 的值，就停在最后看到的那个姿势
    if (!this.baseValid) {
      for (let i = 0; i < this.boneList.length; i++) this.base[i].copy(this.shownQ[i]);
      this.baseHips.copy(this.shownHipsLocal);
      this.baseValid = true;
    }
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.boneList[i].quaternion.copy(this.base[i]);
    this.H("Hips")?.position.copy(this.baseHips);
  }

  /** 这一帧播什么：{ mode: "clip" | "blend2d" | "mirror" | "hold", file, time?, rate?, loop, once, hold, rifleHand } */
  _Pick(intent, ctx3c = null) {
    const skins = this.skins;
    if (!intent.down) this.downHold = false;
    if (intent.exact) return { mode: "mirror" };
    // 白刃战：刺刀的上步 / 退步 / 刺 / 挡 / 砸 / 推用「刺刀专项」（XBOT_MELEE）；戒备、僵持、倒地和大刀照原身体当场换算
    if (intent.melee) {
      const m = intent.melee, entry = m.weapon && m.weapon !== "Dadao" ? XBOT_MELEE[m.action] : null;
      if (!entry) return { mode: "mirror" };
      const lib = skins.library.get(entry.file);
      if (entry.loop) return { mode: "clip", file: entry.file, loop: true, hold: lib?.hold, key: "melee" + m.action };
      const n = Number.isFinite(m.animationNormalized) ? m.animationNormalized : Number.isFinite(m.normalized) ? m.normalized : 0;
      return { mode: "clip", file: entry.file, once: true, normalized: THREE.MathUtils.clamp(n, 0, 1), hold: lib?.hold, key: "melee" + m.action };
    }
    if (intent.down) {
      // 预演片段已经把人摔在地上了（中枪倒地、被砍倒放完、按住不动）：就停在这个姿势。原来在这里从站着放一遍倒地动作，
      // 等于死了的人站起来再死一次（11-02 取证：02-2 的七个日军和翻译全是这样）
      if (this.downHold || (!this.prevDown && this.shownValid && this.shownHeadY - this.shownAt.y < XBOT.downHoldHeadM)) {
        this.downHold = true;
        return { mode: "hold" };
      }
      // 试玩 AI 的尸体（SoldierView 给了 downAge）：按原身体这一次的倒向挑，见 XBOT_DEATH_FALLS
      const fall = Number.isFinite(intent.downAge) ? this._DeathFall() : null;
      if (fall) {
        const lib = skins.library.get(fall.file);
        return { mode: "clip", file: fall.file, once: true, death: true, deathYaw: fall.yaw, hold: lib?.rifleTrack ? lib.hold : undefined, rifleHand: lib?.rifleHand };
      }
      const death = XBOT_DEATHS[this.rig.deathVariantId] || XBOT_DEATHS.DeathCollapseA;
      const lib = skins.library.get(death.file);
      // 清单给这条倒地动作写了 rifleTrack（枪什么时候脱手）：枪照端枪动作的挂法放，脱手后掉地；没写的照原身体手里的位置
      return { mode: "clip", file: death.file, once: true, death: true, hold: lib?.rifleTrack ? lib.hold : undefined, rifleHand: lib?.rifleHand };
    }
    if (Number.isFinite(intent.throwSeconds)) {
      const entry = this.faction === "ija" ? XBOT_NATIVE.grenadeIja : XBOT_NATIVE.grenadeNra;
      const source = this.rig.clipById?.get?.("GrenadeThrow")?.duration || 2.5;
      return { mode: "clip", file: entry.file, sourceSeconds: intent.throwSeconds, sourceDuration: source, once: true };
    }
    if (intent.clip) {
      const entry = XBOT_PREVIZ_CLIPS[intent.clip];
      if (!entry) return { mode: "mirror" };
      const file = entry.retarget || entry.mirror ? (skins.derived[intent.clip] ? `Derived/${skins.derived[intent.clip].file}` : null) : entry.file;
      if (!file) return { mode: "mirror" };
      const lib = skins.library.get(file);
      return { mode: "clip", file, sourceSeconds: intent.clipSeconds || 0, sourceDuration: intent.clipDuration || null,
        loop: intent.clipLoop ?? lib?.loop ?? false, travel: entry.speedMps && intent.mps > 0.05 ? entry.speedMps : null,
        derived: !!(entry.retarget || entry.mirror), hold: entry.retarget ? null : lib?.hold, rifleHand: lib?.rifleHand };
    }
    const rifle = ctx3c ? ctx3c.rifle : this._RifleInHands();
    if (this.fireT > 0 && rifle) {
      const fire = intent.stance === "prone" ? XBOT_NATIVE.fireProne : intent.stance === "crouch" ? XBOT_NATIVE.fireCrouch : XBOT_NATIVE.fireStand;
      return { mode: "clip", file: fire.file, once: true, hold: "端枪", key: "fire" };
    }
    // 3C 原地转身（Turn-in-Place）：静止超死区时播真实迈步转身片段，剔除 Hips 偏航由下盘控制器统一驱动
    if (ctx3c?.tip?.turning && ctx3c.tip.turnClipKey) {
      const turnEntry = XBOT_TURN_IN_PLACE[ctx3c.tip.turnClipKey];
      if (turnEntry) {
        const lib = skins.library.get(turnEntry.file);
        return {
          mode: "clip", file: turnEntry.file, once: true, turnInPlace: true,
          normalized: ctx3c.tip.turnProgress, key: "tip:" + ctx3c.tip.turnClipKey,
          hold: lib?.hold || "端枪", rifleHand: lib?.rifleHand,
        };
      }
    }
    // 3C 四向 2D Blend Space：端枪站/蹲移动时同步混合主/副方向片段
    if (ctx3c?.loco?.moving && rifle && ctx3c.stance !== "prone") {
      const move = ctx3c.stance === "crouch" ? "Walk" : (ctx3c.loco.running ? "Run" : "Walk");
      const groupKey = `${ctx3c.stance}${move}Rifle${ctx3c.aimWeight >= 0.35 ? "Aim" : ""}`;
      const group = XBOT_LOCOMOTION_4WAY[groupKey];
      if (group) {
        const pEntry = group[ctx3c.loco.primary] || group.forward;
        const sEntry = ctx3c.loco.secondary && group[ctx3c.loco.secondary] && group[ctx3c.loco.secondary].file !== pEntry.file
          ? group[ctx3c.loco.secondary] : null;
        const lib = skins.library.get(pEntry.file);
        return {
          mode: "blend2d", groupKey, file: pEntry.file,
          entries: sEntry
            ? [{ ...pEntry, weight: ctx3c.loco.wPrimary }, { ...sEntry, weight: ctx3c.loco.wSecondary }]
            : [{ ...pEntry, weight: 1 }],
          key: groupKey, hold: lib?.hold || "端枪", rifleHand: lib?.rifleHand,
        };
      }
    }
    const key = NativeKey(intent, rifle);
    const entry = XBOT_NATIVE[key];
    if (!entry) return { mode: "mirror" };
    const lib = skins.library.get(entry.file);
    return { mode: "clip", file: entry.file, loop: lib?.loop ?? true, speedMps: entry.speedMps || null, key, hold: lib?.hold, rifleHand: lib?.rifleHand };
  }

  /** 原身体这一次倒地片段的倒向 → 倒向最近的 X Bot 倒地动作与剩下的偏角（绕竖轴，弧度）；不认识的片段返回 null（走 XBOT_DEATHS 老路）。 */
  _DeathFall() {
    const id = this.rig.deathVariantId;
    if (this.deathFall?.id === id) return this.deathFall.pick;
    const want = DeathFallLocal(id);
    let pick = null, best = Infinity;
    if (want) for (const entry of XBOT_DEATH_FALLS) {
      const yaw = YawToTurn(entry.fallLocal, want);
      if (Math.abs(yaw) < best) { best = Math.abs(yaw); pick = { file: entry.file, yaw }; }
    }
    this.deathFall = { id, pick };
    return pick;
  }

  /** 试玩 AI 的尸体：胯在地面上跟着原身体的胯走（倒地片段库带位移，Mixamo 的倒地钉在原地），高度照 X Bot 自己的。 */
  _FollowRigPelvis() {
    const pelvis = this.rig.bones?.pelvis, hips = this.H("Hips"), parent = this.container.parent;
    if (!pelvis || !hips || !parent) return;
    this.container.updateMatrixWorld(true);
    pelvis.updateWorldMatrix(true, false);
    const now = hips.getWorldPosition(_p), want = pelvis.getWorldPosition(_p2);
    want.y = now.y;
    parent.worldToLocal(now); parent.worldToLocal(want);
    this.container.position.add(want.sub(now));
  }

  _RifleInHands() {
    const w = this.actor.weaponGroup;
    if (!w || !this.actor.weaponId) return false;
    if (this.actor.weaponData?.kind === "melee") return false;
    for (let o = w; o; o = o.parent) if (o.visible === false) return false;
    return true;
  }

  _Play(pick, intent, dt) {
    const clip = ClipForCharacter(this.kit.clips?.get(pick.file) || this.skins.loaded.get(pick.file), this.kit.def);
    if (!clip) {
      // 还没读到：先读着，这一帧照原身体换算（不站着发呆）
      this.skins.Clip(pick.file);
      this._Mirror(dt);
      return;
    }
    let cur = this.current;
    if (!cur || cur.mode === "blend2d" || cur.file !== pick.file) {
      // 换动作：旧的停掉、绑定全扔（新绑定第一帧每根骨都写，不会留着上一条 / 当场换算的值），淡入交给 _BeginBlend
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.blendActions.clear();
      this.baseValid = false;
      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(pick.once || !pick.loop ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.timeScale = 0;              // 时间自己管（按原片段秒数 / 实际速度）
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.play();
      // 一进来就是倒着的人（造出来就倒在地上）：直接到最后一帧
      const startAtEnd = pick.death && this.wasDown === null;
      cur = this.current = { file: pick.file, action, clock: startAtEnd ? clip.duration : 0, mirror: false, lastT: null };
    } else if (this.baseValid) {
      // 同一条动作：先还原 mixer 上一次写的值（过渡、IK 改过的骨头 mixer 不会重写）
      for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.boneList[i].quaternion.copy(this.base[i]);
      this.H("Hips")?.position.copy(this.baseHips);
    }
    const D = clip.duration;
    let t;
    if (Number.isFinite(pick.normalized)) {
      // 白刃动作：按这一下的进度对齐（出刀、格挡的时刻跟游戏里判定的那一刻大致对上）
      t = pick.normalized * D;
    } else if (Number.isFinite(pick.sourceSeconds) && !pick.travel) {
      // 预演片段 / 投弹：按原片段里的秒数换算（循环按圈对齐，一次性按比例）
      const S = pick.sourceDuration || D;
      if (pick.derived) t = pick.loop ? pick.sourceSeconds % D : Math.min(D, pick.sourceSeconds);
      else if (pick.loop) t = ((pick.sourceSeconds % S) / S) * D;
      else t = Math.min(D, (pick.sourceSeconds / S) * D);
    } else if (pick.death && Number.isFinite(intent.downAge)) {
      // 试玩 AI 的尸体：按死了多久定这一帧。原身体的倒地比这条短、倒完就不再推，倒地时在屏外也不推 ——
      // 按帧累加会冻在半跪（2026-11-24 实拍），回到画面时也不会从头再死一遍
      cur.clock = Math.max(0, intent.downAge);
      t = Math.min(D, cur.clock);
    } else {
      const k = this.kit.def.heightM
        ? this.container.getWorldScale(_s2).x * this.kit.def.hipsScale
        : this.container.scale.x || 1;
      const mps = intent.mps || 0;
      const nominal = pick.speedMps || pick.travel;
      let rate = 1;
      if (nominal) rate = mps > 0.05 ? THREE.MathUtils.clamp(mps / (nominal * k), XBOT.rate[0], XBOT.rate[1]) : 0;
      cur.clock += dt * rate;
      t = pick.loop && !pick.once ? cur.clock % D : Math.min(D, cur.clock);
    }
    // 同一条动作里时间跳了（预演换了一个片段却映到同一条 Mixamo 动作、重新从头放、Seek）：也要淡，不硬切
    if (cur.lastT !== null) {
      let d = Math.abs(t - cur.lastT);
      if (pick.loop && !pick.once) d = Math.min(d, D - d);
      if (d > 0.2 + 2.5 * Math.max(dt, 0)) this.jumped = true;
    }
    cur.lastT = t;
    cur.action.time = t;
    this.wasDown = !!pick.death;
    this.mixer.update(dt);
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.base[i].copy(this.boneList[i].quaternion);
    this.H("Hips") && this.baseHips.copy(this.H("Hips").position);
    this.baseValid = true;
    this.pick = pick;
  }

  /**
   * 2D 混合空间同步播放：最多同时混合相邻两个方向片段（如前走 + 右侧移），
   * 共用归一化步态相位 locoPhase（UE5 Sync Group 原理），避免双腿步频错拍打架。
   */
  _PlayBlendSpace(pick, intent, dt) {
    const resolved = [];
    for (const item of pick.entries) {
      const raw = this.kit.clips?.get(item.file) || this.skins.loaded.get(item.file);
      const clip = ClipForCharacter(raw, this.kit.def);
      if (clip) resolved.push({ ...item, clip });
      else this.skins.Clip(item.file);
    }
    if (!resolved.length) {
      this._Mirror(dt);
      return;
    }
    // 归一化已就绪片段的权重
    let wSum = 0;
    for (const r of resolved) wSum += r.weight;
    for (const r of resolved) r.weight = wSum > 1e-6 ? r.weight / wSum : 1 / resolved.length;

    if (!this.current || this.current.mode !== "blend2d") {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.blendActions.clear();
      this.blendWeights.clear();
      this.baseValid = false;
      this.current = { mode: "blend2d", file: pick.file, mirror: false, lastT: null };
    } else if (this.baseValid) {
      for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.boneList[i].quaternion.copy(this.base[i]);
      this.H("Hips")?.position.copy(this.baseHips);
    }

    // 距离匹配相位推进：按加权标称速度与加权周期时长计算每秒圈数
    const k = this.kit.def.heightM
      ? this.container.getWorldScale(_s2).x * this.kit.def.hipsScale
      : this.container.scale.x || 1;
    let nominal = 0, effDur = 0;
    for (const r of resolved) {
      nominal += (r.speedMps || 1.3) * r.weight;
      effDur += (r.clip.duration || 1) * r.weight;
    }
    const mps = intent.mps || 0;
    const rate = mps > 0.05 ? THREE.MathUtils.clamp(mps / Math.max(nominal * k, 0.2), XBOT.rate[0], XBOT.rate[1]) : 0;
    this.locoPhase = (this.locoPhase + (dt * rate) / Math.max(effDur, 0.2)) % 1;
    if (this.locoPhase < 0) this.locoPhase += 1;

    const targetMap = new Map();
    const entryMeta = new Map();
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
        // 首次进入 2D 混合直接赋初始权重，后续换向按时间常数平滑过渡避免腿部抽搐
        this.blendWeights.set(r.file, this.blendActions.size === 1 ? r.weight : 0);
      }
    }
    // 平滑阻尼四向混合权重并重新归一化，消除跨 45° / 90° 象限时的单帧脚步跳变
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

    this.wasDown = false;
    this.mixer.update(dt);
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.base[i].copy(this.boneList[i].quaternion);
    this.H("Hips") && this.baseHips.copy(this.H("Hips").position);
    this.baseValid = true;
    this.pick = { ...pick, mode: "clip", file: resolved[0].file };
  }

  /** Turn-in-Place Root Yaw Extraction：抵消片段自带的 Hips 偏航角，让脚步转体与下盘控制器严丝合缝。 */
  _CancelTurnHipsYaw(file, t) {
    const hips = this.H("Hips");
    const curve = hips ? this.skins.TurnYawCurve(file) : null;
    if (!curve) return;
    const yawDelta = SampleScalarCurve(curve, t);
    if (Math.abs(yawDelta) < 1e-4) return;
    this.container.updateMatrixWorld(true);
    RotateBoneWorld(hips, _yawQ.setFromAxisAngle(_up, -yawDelta));
  }

  /**
   * 原地转身（Turn-in-Place）上半身分层遮罩（Mesh-Space Layered Blend per Bone）：
   * Spine 按 78% 向据枪待机过渡（保留 22% 迈步扭腰重心感），Spine1 与其上所有胸/颈/头/肩/双臂/手指 100% 锁定在
   * RifleAimingIdle 模型空间姿态，消除 Turn90 低姿持枪导致的「先垂枪 28 cm 再抬枪」断层。
   */
  _ApplyTurnUpperBodyMask(idleFile, maskW) {
    if (maskW <= 1e-3) return;
    const pose = this.skins.IdleUpperPose(idleFile);
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

  /**
   * Mesh-Space 脊柱瞄准偏移（Aim Offset）：
   *   · 站/蹲端枪且 9 帧 BlenderMCP 精修资产（Animation_RifleAimOffset9.glb）已就绪时，
   *     对 3×3 网格做双线性 Slerp：脊柱/头用模型空间增量 Delta（绝不因跑步前倾歪轴），
   *     锁骨/上臂/前臂/手腕用本地空间 Additive Delta（还原右撇子不对称探肩、贴腮、肘部下沉），
   *     双腿严格 0° 透明；
   *   · 卧倒、空手或资产加载中无缝退回程序化五节脊柱分摊。
   */
  _ApplySpineAimOffset(intent, lowerYawOff, aimWeight, stance, rifle = false) {
    const yawRad = WrapAngle((intent.lookYaw || 0) - lowerYawOff);
    const pitchRad = intent.lookPitch || 0;
    const activeW = Math.max(aimWeight, Math.abs(lowerYawOff) > 0.01 ? 1 : (Math.abs(yawRad) > 0.015 ? 0.85 : 0));
    if (this.last3C) this.last3C.aimOffsetMode = "none";
    if (activeW < 1e-3 || (Math.abs(yawRad) < 1e-3 && Math.abs(pitchRad) < 1e-3)) return;

    // 非据枪、非原地转身的行进/警戒左顾右盼（PCG Procedural Gaze）：
    // 只旋转 Head(62%) / Neck(28%) / Spine2(10%)，不碰锁骨与双臂，保证端枪/携枪行进时枪口稳定不乱甩。
    if (aimWeight < 0.15 && Math.abs(lowerYawOff) <= 0.01 && stance !== "prone") {
      const yaw = intent.yaw || 0;
      const clampedYaw = THREE.MathUtils.clamp(yawRad, -1.05, 1.05);
      const clampedPitch = THREE.MathUtils.clamp(pitchRad, -0.28, 0.35);
      _aimRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const gazeWeights = [
        ["Spine2", 0.10, 0.0],
        ["Neck", 0.28, 0.35],
        ["Head", 0.62, 0.65],
      ];
      for (const [boneName, yw, pw] of gazeWeights) {
        const bone = this.H(boneName);
        if (!bone) continue;
        const dy = clampedYaw * yw;
        const dp = clampedPitch * pw;
        if (Math.abs(dy) < 1e-4 && Math.abs(dp) < 1e-4) continue;
        _aimQ.identity();
        if (Math.abs(dy) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_up, dy));
        if (Math.abs(dp) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimRight, dp));
        RotateBoneWorld(bone, _aimQ);
      }
      this.container.updateMatrixWorld(true);
      if (this.last3C) this.last3C.aimOffsetMode = "gaze";
      return;
    }

    const grid = rifle && stance !== "prone" ? this.skins.aimOffsetGrid : null;
    if (grid) {
      const w = EvaluateAimOffsetGridWeights({
        yawRad,
        pitchRad,
        stance,
        yawColsDeg: grid.cfg.yawColsDeg,
        pitchRowsDeg: grid.cfg.pitchRowsDeg,
      });
      // 将模型空间增量 Delta 共轭到世界系：ΔM_world = Q_model · ΔM_model · Q_model⁻¹
      this.model.matrixWorld.decompose(_p, _aoModelQ, _s);
      _aoModelQ.normalize();
      _aoModelQInv.copy(_aoModelQ).invert();

      for (const boneName of XBOT_AIM_SPINE_BONES) {
        const bone = this.H(boneName);
        const arr = grid.meshDelta.get(boneName);
        if (!bone || !arr) continue;
        SampleBilinearQuat(arr, w, _aimQ);
        if (activeW < 0.999) _aimQ.slerpQuaternions(_idQuat, _aimQ, activeW);
        // 几乎单位四元数直接跳过
        if (Math.abs(1 - Math.abs(_aimQ.w)) < 1e-7) continue;
        _aimQ.premultiply(_aoModelQ).multiply(_aoModelQInv).normalize();
        RotateBoneWorld(bone, _aimQ);
      }

      // 锁骨与双臂叠加本地 Additive Delta（贴腮、右撇子左肩前探、高仰角耸肩、下瞄肘部放松）
      for (const [boneName, scaleW] of XBOT_AIM_ARM_BONES) {
        const bone = this.H(boneName);
        const arr = grid.localDelta.get(boneName);
        if (!bone || !arr) continue;
        const effW = activeW * scaleW;
        if (effW < 1e-3) continue;
        SampleBilinearQuat(arr, w, _aimQ);
        if (effW < 0.999) _aimQ.slerpQuaternions(_idQuat, _aimQ, effW);
        if (Math.abs(1 - Math.abs(_aimQ.w)) < 1e-7) continue;
        bone.quaternion.multiply(_aimQ);
      }
      this.container.updateMatrixWorld(true);
      if (this.last3C) this.last3C.aimOffsetMode = "baked9";
      return;
    }

    const dist = EvaluateSpineAimDistribution({ yawRad, pitchRad, stance, aimWeight: activeW, rigKind: "xbot" });
    // 取逻辑朝向的水平右轴与前轴作为 Mesh-Space 俯仰/滚转参考轴
    const yaw = intent.yaw || 0;
    _aimRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _aimFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    for (const [boneName, key] of XBOT_SPINE_CHAIN) {
      const bone = this.H(boneName);
      const d = dist[key];
      if (!bone || !d) continue;
      if (Math.abs(d.yaw) < 1e-4 && Math.abs(d.pitch) < 1e-4 && Math.abs(d.roll) < 1e-4) continue;
      _aimQ.identity();
      if (Math.abs(d.yaw) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_up, d.yaw));
      if (Math.abs(d.pitch) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimRight, d.pitch));
      if (Math.abs(d.roll) >= 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimFwd, d.roll));
      RotateBoneWorld(bone, _aimQ);
    }
    if (this.last3C) this.last3C.aimOffsetMode = "procedural";
  }

  /**
   * 开火上半身 Additive 叠加层：
   * 1) 叠加离线提纯的 Mixamo 开火差值（FiringRifle_V1 / FireRifle_V1 相对第 0 帧的上半身骨骼增量）；
   * 2) 叠一记阻尼上跳后坐（Spine1/Spine2 绕水平右轴后仰回弹）；
   * 双腿与 Hips 零介入，跑动 / 横移开枪彻底告别滑步。
   */
  _ApplyAdditiveFire(intent, rifle, stance) {
    if (!rifle || stance === "prone") return;
    const rec = EvaluateAdditiveFireRecoil(this.addFireAge);
    if (!rec.active) return;
    const fireFile = stance === "crouch" ? XBOT_NATIVE.fireCrouch.file : XBOT_NATIVE.fireStand.file;
    const additive = this.skins.AdditiveFireTracks(fireFile);
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
    // 叠加阻尼枪口上跳与右肩滚转后坐
    const yaw = intent.yaw || 0;
    _aimRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _aimFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const spine1 = this.H("Spine1"), spine2 = this.H("Spine2");
    if (spine1 && Math.abs(rec.kickPitchRad) > 1e-4) {
      RotateBoneWorld(spine1, _aimQ.setFromAxisAngle(_aimRight, rec.kickPitchRad * 0.4));
    }
    if (spine2 && Math.abs(rec.kickPitchRad) > 1e-4) {
      _aimQ.setFromAxisAngle(_aimRight, rec.kickPitchRad * 0.6);
      if (Math.abs(rec.kickRollRad) > 1e-4) _aimQ.premultiply(_aimQ2.setFromAxisAngle(_aimFwd, rec.kickRollRad));
      RotateBoneWorld(spine2, _aimQ);
    }
  }

  /**
   * 支撑脚锁地与停步收脚 2-Bone Leg IK（Foot Locking + Stop-Settle）：
   *   · move：支撑脚钉死世界落点，零搓地；
   *   · turn：原地转身时轴脚钉死 0 漂移，迈步脚按相对抬升释放；
   *   · idle：切静止时保持一脚钉死，另一脚抬起 5~8 cm 弧线收步落稳，杜绝刹停滑冰。
   * 仅作用于 UpLeg / Leg / Foot，对 Hips、脊柱与步枪瞄线 0° 零干扰。
   */
  _ApplyFootLock(dt, footMode, stance, teleported) {
    if (stance === "prone") { this.footLock.Reset(); return; }
    const groundY = this.container.matrixWorld.elements[13];
    const scaleY = this.container.matrixWorld.getMaxScaleOnAxis() || 1;
    const ankleRestY = groundY + this.ankleRestOffY * scaleY;
    const rigs = [];
    const inputs = [];
    for (let i = 0; i < 2; i += 1) {
      const side = i === 0 ? "Left" : "Right";
      const up = this.H(side + "UpLeg"), lo = this.H(side + "Leg"), ft = this.H(side + "Foot");
      if (!up || !lo || !ft) return;
      const A = FreshPosition(up), B = FreshPosition(lo), Cw = FreshPosition(ft);
      rigs.push({ up, lo, ft });
      inputs.push({
        animX: Cw.x, animY: Cw.y, animZ: Cw.z,
        hipX: A.x, hipY: A.y, hipZ: A.z,
        maxReachM: A.distanceTo(B) + B.distanceTo(Cw),
      });
    }
    const results = this.footLock.UpdatePair({
      mode: footMode,
      feet: inputs,
      ankleRestY,
      groundY,
      dt,
      teleported,
    });
    for (let i = 0; i < 2; i += 1) {
      const res = results[i];
      if (res.active) this._SolveLeg(rigs[i].up, rigs[i].lo, rigs[i].ft, _p.set(res.targetX, res.targetY, res.targetZ));
    }
  }

  _SolveLeg(upper, lower, foot, target) {
    const footQ = FreshQuaternion(foot);
    const A = FreshPosition(upper), B = FreshPosition(lower), Cw = FreshPosition(foot);
    const lab = A.distanceTo(B), lbc = B.distanceTo(Cw);
    const lat = THREE.MathUtils.clamp(A.distanceTo(target), Math.abs(lab - lbc) + 0.02, (lab + lbc) * 0.985);
    const ba = A.clone().sub(B), bc = Cw.clone().sub(B);
    let axis = ba.clone().cross(bc);
    if (axis.lengthSq() < 1e-10) {
      const e = this.container.matrixWorld.elements;
      axis.set(e[0], e[1], e[2]);
    }
    axis.normalize();
    const cur = ba.angleTo(bc);
    const des = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    RotateBoneWorld(lower, new THREE.Quaternion().setFromAxisAngle(axis, des - cur));
    const C2 = FreshPosition(foot);
    const ac = C2.sub(A).normalize(), at = target.clone().sub(A).normalize();
    RotateBoneWorld(upper, new THREE.Quaternion().setFromUnitVectors(ac, at));
    SetBoneWorldQuaternion(foot, footQ);
  }

  /** 3C 动作系统诊断探针（用于单测与实机验证）。 */
  Probe3C() {
    const c = this.last3C;
    if (!c) return null;
    return {
      mode: this.current?.mode || (this.current?.mirror ? "mirror" : "clip"),
      primary: c.loco?.primary || null,
      secondary: c.loco?.secondary || null,
      wPrimary: c.loco?.wPrimary ?? 1,
      wSecondary: c.loco?.wSecondary ?? 0,
      pelvisWarpDeg: +(c.pelvisWarp * 180 / Math.PI).toFixed(1),
      tipOffsetDeg: +(c.tip.visualYawOffset * 180 / Math.PI).toFixed(1),
      tipTurning: c.tip.turning,
      tipClip: c.tip.turnClipKey,
      aimOffsetMode: c.aimOffsetMode || "none",
      addFireActive: this.addFireAge < NPC_3C.fireDurationS,
    };
  }

  /** 当场把原身体的姿势换算到 X Bot（表里没有的、要精确贴位置的）。 */
  _Mirror(dt) {
    const source = this.source;
    if (!source) return;
    if (!this.current?.mirror) {
      this.mixer.stopAllAction();
      this.blendActions.clear();
      this.current = { mirror: true };
    }
    this.baseValid = false;
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    this.sourceMatricesReady = true;
    _inv.copy(rig.root.matrixWorld).invert();
    rig.root.matrixWorld.decompose(_p, _q, _s);
    const rootQinv = _q.clone().invert();
    for (let i = 0; i < this.srcBones.length; i++) {
      const bone = this.srcBones[i];
      if (!bone) continue;
      bone.matrixWorld.decompose(_p2, _q2, _s2);
      this.srcQ[i].copy(rootQinv).multiply(_q2);
    }
    const pelvis = this.srcBones[source.rest.Find("Bip001_Pelvis")];
    const pelvisPos = pelvis ? pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(_inv) : new THREE.Vector3();
    source.retarget.Solve(this.srcQ, pelvisPos, this.outQ, this.outHips);
    this.boneList.forEach((bone, i) => { if (bone) bone.quaternion.copy(this.outQ[i]); });
    this.H("Hips")?.position.copy(this.outHips).multiplyScalar(this.kit.def.hipsScale);
    this.pick = { mode: "mirror" };
  }

  /**
   * 原身体骨头上挂的东西挪到 X Bot 身上（2026-11-01 第二版：枪单独处理 + 双手 IK）。游戏代码写的本地矩阵记作「本意」，
   * 写回去的本地矩阵记下来，下一帧发现被游戏改过（换枪、背枪、片段道具轨）就换成新的本意。
   *   · 手里的枪（_PlaceWeapon）：先定枪的位姿，再把 X Bot 的手 IK 到枪的握点上；
   *   · 其余挂件（背着的枪、钢盔、刀鞘、手里的道具）按原身体那根骨挪到 X Bot 同一根骨上（在 IK 之后，跟着手走）。
   */
  _Reanchor(pick, dt = 0, aimCtx = null) {
    if (this.frame - this.attachScan > 30 || this.attachWeapon !== this.actor.weaponGroup) this._ScanAttachments();
    if (!this.sourceMatricesReady) this.rig.root.updateMatrixWorld(true);
    this.sourceMatricesReady = false;
    for (const a of this.attachments) {
      const object = a.object;
      object.updateMatrix();
      // 挂件本身就是枪（片段道具轨把枪直接挂在 rig.root 下）时，上一帧写的是枪（wWritten）
      const mine = a.written || (object === this.actor.weaponGroup ? a.wWritten : null);
      if (!mine || !object.matrix.equals(mine)) a.intended = object.matrix.clone();
    }
    const weapon = this._RifleInHands() ? this.attachments.find(a => a.holdsWeapon) : null;
    const weaponHeldByGore = !!this.actor.goreWeaponHold;
    const placed = weapon && !weaponHeldByGore ? this._PlaceWeapon(weapon, pick, dt, aimCtx) : false;
    if (!weapon) { this.lastMount = null; this.contact = null; for (const a of this.attachments) if (a.holdsWeapon) { a.looseDrop = null; a.handRel = null; } }
    if (!placed) { this.ikR = 0; this.ikL = 0; }
    for (const a of this.attachments) {
      if (a.holdsWeapon && weaponHeldByGore) continue;
      if (a === weapon && placed) continue;
      this._ReanchorOne(a, a === weapon);
    }
    this._RifleSwapStep(placed ? weapon : null, dt);
  }

  /**
   * 枪从手里换到背上（不据枪就背枪，Script_RelaxedGait）或反过来：背上那支是手里那支的克隆（原点一样），
   * 新露出来的那支从上一帧看到的位置（X Bot 胯的坐标系，同 _PlaceWeapon 的换挂法）XBOT.rifleSwapS 秒挪到它该在的地方。
   */
  _RifleSwapStep(weapon, dt) {
    const hand = weapon ? this.actor.weaponGroup : null;
    const backRifle = this.rig.relaxedGaitRifle;
    let back = null;
    if (!hand && backRifle) { back = backRifle; for (let o = backRifle; o; o = o.parent) if (o.visible === false) { back = null; break; } }
    const now = hand || back, which = hand ? "hand" : back ? "back" : null;
    if (this.rifleSwap && this.rifleSwap.object !== now) this._EndRifleSwap();
    if (now && this.rifleShown && this.rifleShown.which !== which) {
      this.rifleSwap = { object: now, from: this.rifleShown.local.clone(), t: 0, rest: now === back ? now.matrix.clone() : null, weapon };
    }
    const swap = this.rifleSwap;
    if (swap) {
      swap.t += Math.max(dt, 0);
      const k = Math.min(1, swap.t / XBOT.rifleSwapS), e = k * k * (3 - 2 * k);
      // 背上那支的本地位姿游戏只在造它时写一次：每帧从原值算目标，淡完还原
      if (swap.rest) swap.rest.decompose(now.position, now.quaternion, now.scale);
      now.updateMatrix();
      now.updateWorldMatrix(true, false);
      const frame = this.H("Hips").matrixWorld;
      const target = new THREE.Matrix4().copy(frame).invert().multiply(now.matrixWorld);
      if (!swap.off) swap.off = OffsetFrom(swap.from, target);
      const world = new THREE.Matrix4().copy(frame).multiply(ApplyOffset(target, swap.off, e));
      new THREE.Matrix4().copy(now.parent.matrixWorld).invert().multiply(world).decompose(now.position, now.quaternion, now.scale);
      now.updateMatrix();
      // 手里那支：_PlaceWeapon 下一帧按 wWritten 认出这是自己写的，不当成游戏的本意
      if (swap.weapon && now === hand) swap.weapon.wWritten = now.matrix.clone();
      now.updateMatrixWorld(true);
      if (k >= 1) this._EndRifleSwap();
    }
    if (now) {
      now.updateWorldMatrix(true, false);
      const local = this.rifleShown?.local || new THREE.Matrix4();
      this.rifleShown = { which, local: local.copy(this.H("Hips").matrixWorld).invert().multiply(now.matrixWorld) };
    } else this.rifleShown = null;
  }

  _EndRifleSwap() {
    const s = this.rifleSwap;
    if (!s) return;
    if (s.rest) { s.rest.decompose(s.object.position, s.object.quaternion, s.object.scale); s.object.updateMatrix(); s.object.updateMatrixWorld(true); }
    this.rifleSwap = null;
  }

  _Write(a, world) {
    const object = a.object, parent = object.parent;
    object.matrix.copy(_inv.copy(parent.matrixWorld).invert().multiply(world));
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrix();
    a.written = object.matrix.clone();
    object.updateMatrixWorld(true);
  }

  /** 按原身体那根骨挪到 X Bot 同一根骨上（两套骨初始朝向差按换算的修正量补）。looseWeapon：没人握着的枪 —— 原地不动。 */
  _ReanchorOne(a, looseWeapon) {
    const object = a.object, parent = object.parent, bone = a.anchor || parent;
    if (!parent || !bone) return;
    const srcWorld = _m.multiplyMatrices(parent.matrixWorld, a.intended);
    // 没握在手里的枪（倒地后摆在身边、被炸飞、扔掉）：挂在手骨 / rig.root 下也照原身体的位置放，不跟 X Bot 的骨头飘
    // 贴在躯干上的（背着、斜挎在背后）跟 X Bot 的那节躯干走
    let xbotBone = a.xbotBone, ti = a.targetIndex, from = bone;
    if (looseWeapon && (!bone.isBone || this._HandBone(bone))) {
      const torso = this._NearTorso(srcWorld);
      if (!torso) { this._Write(a, srcWorld.clone()); this.lastMount = "world"; this.contact = null; return; }
      from = torso.bone; xbotBone = torso.xbot; ti = torso.ti;
    }
    const retarget = this.source?.retarget;
    if (!xbotBone) return;
    srcWorld.decompose(_p, _q, _s);
    const worldScale = _s.clone();
    from.matrixWorld.decompose(_p2, _q2, _s2);
    const relPos = _p.clone().sub(_p2).applyQuaternion(_q2.clone().invert());
    const relRot = _q2.clone().invert().multiply(_q);
    const C = ti >= 0 && retarget ? retarget.correction[ti] : null;
    if (C) { const Ci = C.clone().invert(); relPos.applyQuaternion(Ci); relRot.premultiply(Ci); }
    xbotBone.matrixWorld.decompose(_p2, _q2, _s2);
    const world = _m2.compose(relPos.applyQuaternion(_q2).add(_p2), _q2.clone().multiply(relRot), worldScale);
    // 贴躯干的挂件按 X Bot 体型推开（XBOT_TORSO_FIT；没握在手里的枪不推）
    let unfitted = null;
    if (!looseWeapon && xbotBone === a.xbotBone && XBOT_TORSO_FIT.bones.includes(xbotBone.name)) {
      const fit = this._TorsoFit(a, xbotBone, world);
      if (fit) { unfitted = world.clone(); world.premultiply(_m.copy(xbotBone.matrixWorld).invert()).premultiply(fit).premultiply(xbotBone.matrixWorld); }
    }
    this._Write(a, world);
    this._KeepSling(a, unfitted);
    if (looseWeapon) { this.lastMount = "body"; this.contact = null; }
  }

  /**
   * 背带（挂件下直接挂着、名字带 Sling 的网格，Script_RelaxedGait 的 Model_BackRifleSling）不跟着 XBOT_TORSO_FIT 往后推：
   * 它绕在胸前，跟着推会切进胸口（11-02 取证：推了之后背带进身体 > 3 cm 的帧从 3% 涨到 99%）。留在推之前的位置。
   * unfitted = 推之前挂件的世界矩阵（null = 没推，背带还原成游戏的本地位姿）。
   */
  _KeepSling(a, unfitted) {
    for (const c of a.object.children) {
      if (!c.isMesh || !/Sling/i.test(c.name)) continue;
      SetRifleSlingAnchors(c, a.object);
      const rests = a.slingRest || (a.slingRest = new Map());
      if (!rests.has(c)) rests.set(c, c.matrix.clone());
      const rest = rests.get(c);
      if (unfitted) c.matrix.copy(_m.copy(a.object.matrixWorld).invert().multiply(unfitted).multiply(rest));
      else c.matrix.copy(rest);
      const fit = this.kit.slingFit, torso = fit && this.H(XBOT_SLING_FIT.bone);
      if (torso) {
        // 骨头本地：挪到 X Bot 胶囊中心 → 横截面放大 → 挪回这个人的胶囊中心；再换回挂件本地
        const S = new THREE.Matrix4().makeTranslation(fit.to[0], 0, fit.to[1])
          .multiply(new THREE.Matrix4().makeScale(fit.k[0], 1, fit.k[1]))
          .multiply(new THREE.Matrix4().makeTranslation(-fit.from[0], 0, -fit.from[1]));
        const B = torso.matrixWorld, world = new THREE.Matrix4().copy(a.object.matrixWorld).multiply(c.matrix);
        world.premultiply(new THREE.Matrix4().copy(B).invert()).premultiply(S).premultiply(B);
        c.matrix.copy(_m.copy(a.object.matrixWorld).invert().multiply(world));
      }
      c.matrix.decompose(c.position, c.quaternion, c.scale);
      c.updateMatrixWorld(true);
    }
  }

  /**
   * XBOT_TORSO_FIT：这个挂件相对 X Bot 那节躯干骨要再挪多少（骨头本地的矩阵，null = 不用挪）。挂件的本意变了（换枪）、
   * 看得见的网格变了（背上那支露出来了）才重算；手里 ↔ 背上正在挪的那 0.3 s 不算（点的位置不对）。
   */
  _TorsoFit(a, bone, world) {
    let sig = 0;
    a.object.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o.visible) sig += 1 + (o.id % 997) * 1e-3; });
    const f = a.torsoFit;
    if (f && f.sig === sig && f.intended && a.intended && f.intended.equals(a.intended)) return f.G;
    if (!sig || this.rifleSwap) return f?.G || null;
    // 同一种挂件挂在同一节骨上的相对位置各人差不多（只差身高缩放）：按相对矩阵（取两位小数）共用一份，几十个人不各搜一遍
    const rel = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(world);
    const key = this.kit.key + "|" + bone.name + "|" + a.object.name + "|" + sig.toFixed(3) + "|" + rel.elements.map(x => x.toFixed(2)).join(",");
    const cache = this.skins.torsoFits || (this.skins.torsoFits = new Map());
    if (!cache.has(key)) cache.set(key, this._SolveTorsoFit(a, bone, world));
    a.torsoFit = { sig, intended: a.intended?.clone() || null, G: cache.get(key) };
    return a.torsoFit.G;
  }

  _SolveTorsoFit(a, bone, world) {
    const kit = this.kit, rest = kit.restBones, B = rest?.get(bone.name);
    if (!B || !kit.bodyVolumes?.length) return null;
    kit.source.updateMatrixWorld(true);
    // 挂件在初始姿势（模型空间）里的位姿：同样的「相对这节骨」搬过去
    const Wm = new THREE.Matrix4().copy(B.matrixWorld).multiply(new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(world));
    const pts = PropPoints(a.object, 0.025, o => /Sling/i.test(o.name)).map(p => p.applyMatrix4(Wm));
    if (!pts.length) return null;
    const vols = kit.bodyVolumes.filter(v => XBOT_TORSO_FIT.bones.includes(v.name)).map(v => {
      const b = rest.get(v.name);
      return { ...v, inv: new THREE.Matrix4().copy(b.matrixWorld).invert(), scale: b.matrixWorld.getMaxScaleOnAxis() };
    });
    const P = (n) => rest.get(n).getWorldPosition(new THREE.Vector3());
    const right = P("RightArm").sub(P("LeftArm")).setY(0).normalize(), up = new THREE.Vector3(0, 1, 0);
    const back = new THREE.Vector3().crossVectors(right, up).normalize();   // 人朝 up × right，背后取反（right × up）
    let pivot = pts[0];
    for (const q of pts) if (q.y > pivot.y) pivot = q;
    const tmp = new THREE.Vector3(), loc = new THREE.Vector3();
    const Depth = (M) => {
      let worst = -Infinity;
      for (const q of pts) {
        tmp.copy(q).applyMatrix4(M);
        for (const v of vols) { const d = VolumeSigned(v, loc.copy(tmp).applyMatrix4(v.inv)) * v.scale; if (d > worst) worst = d; }
      }
      return worst;
    };
    const Fit = (d, deg) => new THREE.Matrix4().makeTranslation(back.x * d, back.y * d, back.z * d)
      .multiply(new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
      .multiply(new THREE.Matrix4().makeRotationAxis(right, THREE.MathUtils.degToRad(deg)))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    const C = XBOT_TORSO_FIT;
    // 合格：最深的点在表面外 marginM，最近的点离表面不超过 maxGapM（不嵌进去，也不悬空）
    const Miss = (w) => Math.max(0, w + C.marginM, -C.maxGapM - w);
    const depth0 = Depth(new THREE.Matrix4()), miss0 = Miss(depth0);
    if (miss0 === 0) return null;
    const ds = [];
    for (let d = -C.maxPullM; d <= C.maxPushM + 1e-6; d += C.pushStepM) ds.push(Math.round(d * 1000) / 1000);
    ds.sort((x, y) => Math.abs(x) - Math.abs(y));
    let best = null, bestCost = Infinity, fallback = null, fallbackMiss = miss0;
    // 倾角两个方向都试（绕「右」转正角是下端往前还是往后，看挂件在哪边）
    for (const sign of [1, -1]) {
      for (let deg = 0; deg <= C.maxTiltDeg + 1e-6; deg += C.tiltStepDeg) {
        for (const d of ds) {
          const cost = Math.abs(d) + deg * C.tiltCostPerDeg;
          if (cost >= bestCost) break;
          const M = Fit(d, sign * deg), miss = Miss(Depth(M));
          if (miss === 0) { best = M; bestCost = cost; break; }
          if (miss < fallbackMiss) { fallbackMiss = miss; fallback = M; }
        }
      }
    }
    // 找不到合格的：差得少了 1 cm 以上才挪（挂件不在背后、往前后挪帮不上忙的不动）
    if (!best && !(fallbackMiss < miss0 - 0.01)) fallback = null;
    const F = best || fallback;
    if (!F) return null;
    // 模型空间的挪法换成这节骨本地的：G = B⁻¹ F B
    return new THREE.Matrix4().copy(B.matrixWorld).invert().multiply(F).multiply(B.matrixWorld);
  }

  /** 枪的中心离原身体躯干（骨盆、脊柱、胸、颈）0.35 m 内 → 那节骨与 X Bot 对应的骨；否则 null（在地上）。 */
  _NearTorso(world) {
    const at = new THREE.Vector3().setFromMatrixPosition(world);
    let best = null, bestD = 0.35;
    for (const name of ["Bip001_Pelvis", "Bip001_Spine", "Bip001_Spine1", "Bip001_Spine2", "Bip001_Neck"]) {
      const bone = this.rig.root.getObjectByName(name);
      if (!bone) continue;
      const d = bone.getWorldPosition(new THREE.Vector3()).distanceTo(at);
      if (d < bestD) { bestD = d; const xn = XBOT_FROM_SOLDIER[name]; best = { bone, xbot: this.bones.get(xn), ti: this.skins.rest.Find(xn) }; }
    }
    return best?.xbot ? best : null;
  }

  _HandBone(bone) { return bone === this.rig.bones?.handR || bone === this.rig.bones?.handL; }

  /**
   * 手里的枪。枪的位姿三选一：
   *   · 播 Mixamo 端枪动作：照动作预览工具的标定放进右手（rifleHand "L" 的钉在左手）；
   *   · 原身体手里握着枪（掌心离枪身 ≤ XBOT_GRIP.heldM）：照握着的那只手与枪的相对位置，挪到 X Bot 同一只手上；
   *   · 原身体没握着：返回 false，交给 _ReanchorOne（摆在身边的原地不动、挂在背上的跟背走）。
   * 然后把 X Bot 的两只手 IK 到枪上：Mixamo 动作的左手去这把枪自己的护木握点（weaponGripFront，汉阳造 / 中正式 / 三八式
   * 各按各的）；换算动作的另一只手去原动作握的那个位置（拉栓、托枪照原样）。手本来离握点远（在指路、在干别的）就不拉，
   * 远近之间渐变；挂法变了（换动作、松手）XBOT_GRIP.blendS 秒内淡过去。
   */
  _PlaceWeapon(a, pick, dt, aimCtx = null) {
    const actor = this.actor, w = actor.weaponGroup, object = a.object, parent = object.parent;
    if (!parent || !w.parent) return false;
    // 只挪枪本身，不挪游戏的挂点（RuntimeGrip_WeaponR 这类）：游戏每帧按挂点的位置重算枪在挂点里的位姿，
    // 挂点被挪过它就会把挪的量补回去，一帧帧越补越远（11-01 查到的步枪漂移，切到当场换算时一下甩出 20 m）。
    // 之前写过挂点的先还原成游戏的本意。
    if (a.written) {
      object.matrix.copy(a.intended); object.matrix.decompose(object.position, object.quaternion, object.scale);
      object.updateMatrix(); a.written = null; object.updateMatrixWorld(true);
    }
    w.updateMatrix();
    if (!a.wWritten || !w.matrix.equals(a.wWritten)) a.wIntended = w.matrix.clone();
    const srcW = new THREE.Matrix4().multiplyMatrices(w.parent.matrixWorld, a.wIntended);           // 原身体上枪此刻在哪
    const front = actor.weaponGripFront?.lengthSq() > 1e-8 ? actor.weaponGripFront : null;
    const muzzle = actor.weaponMuzzle?.lengthSq() > 1e-8 ? actor.weaponMuzzle : front;
    const Seg = (M) => [new THREE.Vector3().setFromMatrixPosition(M), muzzle ? muzzle.clone().applyMatrix4(M) : null];
    const srcSeg = Seg(srcW);
    const srcPalm = { R: this._SrcPalm("R"), L: this._SrcPalm("L") };
    const srcGap = { R: SegmentDistance(srcPalm.R, srcSeg), L: SegmentDistance(srcPalm.L, srcSeg) };
    const mixamo = (pick?.mode === "clip" || pick?.mode === "blend2d") && pick.hold === "端枪" && this.skins.rifleOffset;
    let mode, W, trackMode = "hand";
    if (mixamo) {
      if (pick.rifleHand === "L") { if (!this.rifleOnLeft || this.rifleOnLeft.file !== pick.file) this.rifleOnLeft = this._PinLeft(pick.file); }
      else this.rifleOnLeft = null;
      const lib = this.skins.library.get(pick.file);
      const R = this._RifleWorld(AimBandFor(lib));
      w.matrixWorld.decompose(_p2, _q2, _s2);
      const weaponScale = _s2.clone();
      W = new THREE.Matrix4().compose(R.position, R.quaternion, weaponScale);
      mode = this.rifleOnLeft ? "rifleL" : "rifle";
      // 动作里枪换地方（清单 rifleTrack）：背上 / 换握 / 掉地，左手不拉
      const track = !this.rifleOnLeft && lib?.rifleTrack ? this._RifleTrack(a, pick, W, weaponScale, dt) : null;
      if (track) { W = track.W; trackMode = track.mode; }
      else if (!lib?.rifleTrack) { a.rifleDrop = null; a.rifleTrackLast = null; }
      a.looseDrop = null; a.unheldT = 0;
      // 记下枪相对右手的位姿：原身体刚松手时按它拿着（换成照原身体握法时不从它平滑，那一下交给换挂法的 0.2 s 淡）
      if (trackMode === "hand" && !this.rifleOnLeft) {
        const rel = new THREE.Matrix4().copy(this.H("RightHand").matrixWorld).invert().multiply(W), h = { side: "R", p: new THREE.Vector3(), q: new THREE.Quaternion(), sc: new THREE.Vector3(), fromMixamo: true };
        rel.decompose(h.p, h.q, h.sc); a.handRel = h;
      } else a.handRel = null;
    } else {
      this.rifleOnLeft = null;
      a.rifleDrop = null; a.rifleTrackLast = null;
      // 两只手都握着时哪只算主手：上一帧那只还握着就不换（两边离枪差不多远时一帧左一帧右，枪在两只手之间来回淡）
      const prevSide = a.weaponMode === "handR" ? "R" : a.weaponMode === "handL" ? "L" : null;
      // When the rifle is mounted on the right-hand socket and right palm is holding it,
      // anchor on RightHand (0.04 m lever arm) rather than flipping to LeftHand (0.36 m away).
      const preferRight = w.parent === actor.riggedWeaponMount && srcGap.R <= XBOT_GRIP.heldM;
      const side = preferRight ? "R"
        : (prevSide && srcGap[prevSide] <= XBOT_GRIP.heldM ? prevSide : srcGap.R <= srcGap.L ? "R" : "L");
      const held = srcGap[side] <= XBOT_GRIP.heldM;
      if (!held && !this.down && a.handRel && (a.unheldT = (a.unheldT || 0) + Math.max(dt, 0)) < XBOT_GRIP.releaseS) {
        // 原身体刚松手（没倒地）：先当还握着（XBOT_GRIP.releaseS）
        const hand = this.H(a.handRel.side === "R" ? "RightHand" : "LeftHand");
        W = new THREE.Matrix4().copy(hand.matrixWorld).multiply(new THREE.Matrix4().compose(a.handRel.p, a.handRel.q, a.handRel.sc));
        mode = "hand" + a.handRel.side;
      } else if (!held && (a.looseDrop || (a.weaponMode && a.weaponLocal)) && (this.down || a.looseDrop || !this._NearTorso(srcW))) {
        // 原身体松手、枪不贴着它的躯干（倒地扔枪、扔投弹前把枪放下、被炸飞）：原身体藏着、跟 X Bot 不在一处，照它的枪会一下跳到
        // 别处（11-02 取证：02-2 丁兵倒地一帧跳 0.95 m、转 103°；09-7 投弹前放枪一帧跳 1.9 m）。改成从上一帧看到的位置自己落到
        // X Bot 脚下的地面（DropPose），直到又握回手里
        if (!a.looseDrop) {
          new THREE.Matrix4().copy(this.H("Hips").matrixWorld).multiply(a.weaponLocal).decompose(_p, _q, _s);
          a.looseDrop = { release: { position: _p.clone(), quaternion: _q.clone(), velocity: new THREE.Vector3() }, since: 0, groundY: this.container.matrixWorld.elements[13] };
        } else a.looseDrop.since += Math.max(dt, 0);
        const out = DropPose(a.looseDrop.release, a.looseDrop.since, a.looseDrop.groundY, { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
        w.matrixWorld.decompose(_p2, _q2, _s2);
        W = new THREE.Matrix4().compose(out.position, out.quaternion, _s2.clone());
        mode = "drop"; trackMode = "drop"; a.handRel = null;
      } else if (!held) {
        // 没人握着：枪还原成游戏的本意，挂点交给 _ReanchorOne（地上的原地不动、贴着躯干的跟躯干走）
        if (a.wWritten) { w.matrix.copy(a.wIntended); w.matrix.decompose(w.position, w.quaternion, w.scale); w.updateMatrix(); a.wWritten = null; w.updateMatrixWorld(true); }
        a.weaponBlend = null; a.weaponMode = null; a.looseDrop = null; a.handRel = null; return false;
      } else {
        a.looseDrop = null; a.unheldT = 0;
        W = this._SmoothHandRelative(a, side, this._HandRelative(side, srcW), dt);
        mode = "hand" + side;
      }
    }
    if (aimCtx && aimCtx.aimWeight > 0.15 && trackMode === "hand" && !this.rifleOnLeft && !this.down && !this.inMelee) {
      this._AlignAimedRifle(W, aimCtx);
    }
    // 挂法变了：从上一帧放的位姿淡过去。位姿记在 X Bot 胯的坐标系里：人走着不拖；片段交接换根时容器一帧挪几米、胯是接着淡的，
    // 记在容器里会跟着容器跳（11-02 取证：01-4 丁兵跳进沟那帧枪落到 2 m 以下）
    const frame = this.H("Hips").matrixWorld;
    const local = new THREE.Matrix4().copy(frame).invert().multiply(W);
    if (a.weaponMode && a.weaponMode !== mode && a.weaponLocal) {
      // 差得越多淡得越久：0.2 s + 每 180° 0.35 s + 每米 0.4 s（照标定 → 照原身体握法常差一百多度，0.2 s 转完一帧要拧四十多度）
      const off = OffsetFrom(a.weaponLocal, local);
      const deg = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(off.q.w))));
      const metres = new THREE.Vector3().setFromMatrixPosition(a.weaponLocal).distanceTo(new THREE.Vector3().setFromMatrixPosition(local)) * frame.getMaxScaleOnAxis();
      const dur = XBOT_GRIP.blendS + 0.35 * deg / 180 + 0.4 * Math.min(metres, 1);
      a.weaponBlend = { off, t: 0, dur: this.inMelee ? Math.min(dur, 0.08) : dur };
    }
    a.weaponMode = mode;
    if (a.weaponBlend) {
      a.weaponBlend.t += dt;
      const k = Math.min(1, a.weaponBlend.t / (a.weaponBlend.dur || XBOT_GRIP.blendS)), e = k * k * (3 - 2 * k);
      local.copy(ApplyOffset(local, a.weaponBlend.off, e));
      if (k >= 1) a.weaponBlend = null;
    }
    a.weaponLocal = local.clone();
    W = new THREE.Matrix4().copy(frame).multiply(local);
    // 双手 IK
    const target = { R: null, L: null };
    if (mixamo) {
      if (trackMode !== "hand") { /* 枪在背上 / 换握 / 掉地：两只手都不拉 */ }
      else if (this.rifleOnLeft) target.R = new THREE.Vector3().setFromMatrixPosition(W);
      else if (front) target.L = this._Reachable("L", new THREE.Vector3().setFromMatrixPosition(W), front.clone().applyMatrix4(W));
    } else if (trackMode === "hand") {
      // 原动作里另一只手也握着枪：照它在枪上的位置（换到 X Bot 的枪上）
      const other = mode === "handR" ? "L" : "R";
      if (srcGap[other] <= XBOT_GRIP.heldM) target[other] = srcPalm[other].clone().applyMatrix4(srcW.clone().invert()).applyMatrix4(W);
    }
    for (const side of ["R", "L"]) {
      const key = "ik" + side;
      this[key] = Approach(this[key] || 0, target[side] ? this._GripWeight(side, target[side]) : 0, dt, XBOT_GRIP.weightS);
      if (this[key] > 0.002 && target[side]) this._SolveArm(side, target[side], this[key]);
    }
    // 取证：握着枪的手（IK 之后）掌心离它该握的那一点多远
    const n = { R: "Right", L: "Left" };
    this.contact = Object.fromEntries(["R", "L"].map(side => [side, target[side] && this['ik' + side] > 0.5
      ? +FreshPalm(this.H(n[side] + "Hand"), this.H(n[side] + "HandMiddle1"), new THREE.Vector3()).distanceTo(target[side]).toFixed(3) : null]));
    // 枪的本地矩阵 = 挂点世界矩阵⁻¹ × 目标（整矩阵乘，不拆缩放：枪在挂点里有自己的缩放抵消身高缩放）
    this._WeaponVisualOrigin();
    w.matrix.copy(_inv.copy(w.parent.matrixWorld).invert().multiply(W));
    w.matrix.decompose(w.position, w.quaternion, w.scale);
    w.updateMatrix();
    a.wWritten = w.matrix.clone();
    w.updateMatrixWorld(true);
    this.lastMount = trackMode !== "hand" ? "rifle-" + trackMode : mode;
    return true;
  }

  /**
   * 实机据枪瞄准时把正式外观（Mixamo / 日兵甲等不同骨比与蹲瞄片段）的枪管轴对准 AI 逻辑瞄向（yaw + lookYaw, lookPitch）：
   * 仅绕右手握把旋转步枪并交给紧随其后的左手 IK 托护木，消除蹲瞄 / 不同体型带来的 18°–29° 枪管静态偏角，
   * 既让枪口视觉真指向目标，又让 TryFire 的 6.88° 枪管朝向闸门可靠通过。
   */
  _AlignAimedRifle(W, aimCtx) {
    const corrW = Smooth01((aimCtx.aimWeight - 0.15) / 0.65) * (this.addFireAge < 0.05 ? 0.35 : 1);
    if (corrW <= 1e-4) return;
    this.actor.root.updateWorldMatrix(true, false);
    this.actor.root.getWorldQuaternion(_aoModelQ);
    _aimEuler.set(Clamp(aimCtx.lookPitch || 0, -1.0, 0.9), Clamp(aimCtx.lookYaw || 0, -1.4, 1.4), 0, "YXZ");
    _aimQ.setFromEuler(_aimEuler);
    _wantBarrel.set(0, 0, -1).applyQuaternion(_aimQ).applyQuaternion(_aoModelQ).normalize();
    W.decompose(_p, _q, _s);
    _curBarrel.set(0, 0, -1).applyQuaternion(_q).normalize();
    const dot = Clamp(_curBarrel.dot(_wantBarrel), -1, 1);
    if (dot > 0.999995) return;
    _aimQ2.setFromUnitVectors(_curBarrel, _wantBarrel);
    const angle = Math.acos(dot);
    const maxCorrRad = 0.95;
    const t = angle > maxCorrRad ? corrW * (maxCorrRad / angle) : corrW;
    _aimQ.identity().slerp(_aimQ2, t);
    _q.premultiply(_aimQ).normalize();
    W.compose(_p, _q, _s);
  }

  /** Cache a model-backed origin fit for the opted-in character, never mutate
   * shared weapon geometry or another character's mount configuration. */
  _WeaponVisualOrigin() {
    const w=this.actor.weaponGroup,settings=this.kit.def.weaponVisualOriginFit;
    if (this.weaponVisualFit?.weapon===w) return this.weaponVisualOffset;
    this._RestoreWeaponVisualOrigin();
    this.weaponVisualFit={weapon:w,buckets:[]};this.weaponVisualOffset.set(0,0,0);
    if (!w||!settings?.kinds.includes(this.actor.weaponData?.kind)) return this.weaponVisualOffset;
    w.updateWorldMatrix(true,true);
    const inverse=new THREE.Matrix4().copy(w.matrixWorld).invert(),point=new THREE.Vector3(),points=[];
    w.traverse(o=>{
      const position=o.geometry?.attributes?.position;
      if (!o.isMesh||!position||o.isInstancedMesh||o.isBatchedMesh) return;
      const local=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);
      for(let i=0;i<position.count;i++)points.push(point.fromBufferAttribute(position,i).applyMatrix4(local).clone());
    });
    this.weaponVisualOffset.copy(MeasureWeaponVisualOrigin(points,this.actor.weaponMuzzle,settings));
    // Actor's weapon group is its logical socket frame (also used by muzzle
    // effects and firing). Correct only this instance's rendered bucket meshes;
    // keep that group and every grip/muzzle marker in the established frame.
    for (const child of w.children) if (child.isMesh) {
      const original=child.position.clone();
      child.position.sub(this.weaponVisualOffset);child.updateMatrix();
      this.weaponVisualFit.buckets.push({object:child,original,written:child.position.clone()});
    }
    w.updateMatrixWorld(true);
    return this.weaponVisualOffset;
  }

  _RestoreWeaponVisualOrigin() {
    for (const entry of this.weaponVisualFit?.buckets||[]) if (entry.object.position.equals(entry.written)) {
      entry.object.position.copy(entry.original);entry.object.updateMatrix();
    }
    this.weaponVisualFit=null;this.weaponVisualOffset.set(0,0,0);
  }

  /**
   * 清单 rifleTrack 的这一刻（Script_MixamoProps.RifleTrackPose）。在「人物参考系」里算：容器的世界位姿去掉缩放（F，
   * 原点在脚下地面、y 朝上，米制不变），所以掉地按真重力、地面高度 0；算完换回世界。
   * 掉地：脱手那一帧用这一帧之前实际看到的枪（位置、速度），不用预算的那一刻（换动作的过渡还在淡时两者不一样，会跳一下）；
   * 脱手之后按真实时间往下落（倒地停住 _Hold 时动作时间不走，枪照样落地）。→ { W, mode } | null（"hand" 照常）
   */
  _RifleTrack(a, pick, W, weaponScale, dt) {
    const info0 = this.skins.RifleTrack(pick.file);
    const cur = this.current;
    if (!info0 || !cur || cur.mirror || cur.lastT === null) { a.rifleDrop = null; a.rifleTrackLast = null; return null; }
    const k = this.container.matrixWorld.getMaxScaleOnAxis() || 1;
    this.container.matrixWorld.decompose(_p, _q, _s);
    const F = new THREE.Matrix4().compose(_p, _q, new THREE.Vector3(1, 1, 1)), Finv = F.clone().invert();
    const toF = (m) => new THREE.Matrix4().multiplyMatrices(Finv, m);
    const P = (n) => this.H(n).getWorldPosition(new THREE.Vector3()).applyMatrix4(Finv);
    const spine = P("Spine2");
    const now = { rifle: toF(W), hand: toF(this.H("RightHand").matrixWorld), spine: toF(this.H("Spine2").matrixWorld),
      body: { right: P("RightArm").sub(P("LeftArm")).normalize(), up: P("Neck").sub(spine).normalize(), spine },
      palm: Palm(this.H("RightHand"), this.H("RightHandMiddle1"), new THREE.Vector3()).applyMatrix4(Finv) };
    // 模型空间的脱手位姿按人物缩放换到 F（模型挂在容器原点，容器 = F × 缩放 k）
    const info = { ...info0 };
    if (info0.release) info.release = { position: info0.release.position.clone().multiplyScalar(k), quaternion: info0.release.quaternion.clone(), velocity: info0.release.velocity.clone().multiplyScalar(k) };
    let t = cur.lastT;
    const dropAt = info0.track.dropAt;
    if (info.release && t >= dropAt) {
      let d = a.rifleDrop;
      if (!d || d.file !== pick.file) {
        d = a.rifleDrop = { file: pick.file, since: t - dropAt, release: null };
        // 上一帧还在手里（同一条动作）：从实际看到的位姿落下（速度照预算的，含往外甩的那一份）
        const last = a.rifleTrackLast;
        if (last && last.file === pick.file) d.release = { position: last.p.clone(), quaternion: last.q.clone(), velocity: info.release.velocity.clone() };
      } else d.since += Math.max(dt, 0);
      if (d.release) info.release = d.release;
      t = dropAt + d.since;
    } else a.rifleDrop = null;
    const out = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const mode = RifleTrackPose(info, t, now, 0, out);
    if (mode !== "drop") a.rifleTrackLast = { file: pick.file, p: out.position.clone(), q: out.quaternion.clone() };
    if (mode === "hand") return null;
    return { mode, W: new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().compose(out.position, out.quaternion, weaponScale)) };
  }

  /**
   * 护木握点够不着（Mixamo 端枪动作两手只隔 0.27 m、枪定得靠后，左臂伸直也差一截）就往枪托那头退，
   * 取够得着的最靠前一点（最多退到握点到护木的 45%），不硬把胳膊拉脱。
   */
  _Reachable(side, grip, front) {
    const n = side === "R" ? "Right" : "Left";
    const A = FreshPosition(this.H(n + "Arm")), B = FreshPosition(this.H(n + "ForeArm"));
    const hand = this.H(n + "Hand"), Cw = FreshPosition(hand);
    const reach = (A.distanceTo(B) + B.distanceTo(Cw)) * 0.97 + FreshPalm(hand, this.H(n + "HandMiddle1"), new THREE.Vector3()).distanceTo(Cw);
    for (let t = 1; t >= 0.45; t -= 0.05) { const p = grip.clone().lerp(front, t); if (p.distanceTo(A) <= reach) return p; }
    return grip.clone().lerp(front, 0.45);
  }

  /** X Bot 手里的枪相对那只手的位姿（XBOT_GRIP.relTauS / relDegPerS / relMps）跟着原身体走，但不跟着它一帧一个样地抽。 */
  _SmoothHandRelative(a, side, W, dt) {
    const hand = this.H(side === "R" ? "RightHand" : "LeftHand");
    const rel = new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(W);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    rel.decompose(p, q, sc);
    const s = a.handRel;
    if (!s || s.side !== side || s.fromMixamo) { a.handRel = { side, p, q, sc }; return W; }
    const step = Math.max(dt, 0), k = 1 - Math.exp(-step / XBOT_GRIP.relTauS);
    const ang = s.q.angleTo(q), maxA = THREE.MathUtils.degToRad(XBOT_GRIP.relDegPerS) * step;
    if (ang > 1e-6) s.q.slerp(q, Math.min(ang * k, maxA) / ang);
    const d = s.p.distanceTo(p);
    // hand.matrixWorld is in Mixamo cm scale (~0.01), so convert world m/s into hand-local units.
    const handScale = hand.matrixWorld.getMaxScaleOnAxis() || 1;
    const maxLocalStep = (XBOT_GRIP.relMps * step) / handScale;
    if (d > 1e-6) s.p.lerp(p, Math.min(1, Math.min(d * k, maxLocalStep) / d));
    s.sc.copy(sc);
    return new THREE.Matrix4().copy(hand.matrixWorld).multiply(new THREE.Matrix4().compose(s.p, s.q, s.sc));
  }

  /** Upper-body physical flinch impulse for melee hits/blocks/crushes on XBotSkin. */
  _ApplyMeleeFlinch(dt) {
    const f = this.meleeFlinch;
    if (!f) return;
    f.t += Math.max(dt, 0);
    if (f.t >= f.dur) { this.meleeFlinch = null; return; }
    const u = f.t / f.dur;
    // Fast snap-back (peaks at u ≈ 0.16) followed by damped spring recovery with subtle overshoot.
    const env = Math.sin(Math.min(1, u / 0.16) * Math.PI * 0.5) * Math.exp(-3.4 * Math.max(0, u - 0.12)) * (1 - u);
    const amp = env * f.strength;
    if (amp < 1e-4) return;
    // Pitch back around horizontal axis perpendicular to hit direction + twist torso around Y.
    const pitchAxis = _aimRight.set(f.dz, 0, -f.dx).normalize();
    const twistSign = f.kind === "block" ? -1 : 1;
    const bones = [
      ["Spine1", 0.22, 0.14],
      ["Spine2", 0.30, 0.22],
      ["Head", 0.36, 0.18],
      ["RightShoulder", 0.18, 0.12],
      ["LeftShoulder", 0.18, -0.10],
    ];
    for (const [name, pScale, yScale] of bones) {
      const bone = this.H(name);
      if (!bone) continue;
      _aimQ.setFromAxisAngle(pitchAxis, -pScale * amp);
      _aimQ.premultiply(_aimQ2.setFromAxisAngle(_up, twistSign * yScale * amp));
      RotateBoneWorld(bone, _aimQ);
    }
  }

  /** 原身体某只手与枪的相对位姿，搬到 X Bot 同一只手上（两套骨手的初始朝向差按换算的修正量补）。 */
  _HandRelative(side, srcW) {
    const srcHand = side === "R" ? this.rig.bones.handR : this.rig.bones.handL;
    const xName = side === "R" ? "RightHand" : "LeftHand", ti = this.skins.rest.Find(xName);
    srcW.decompose(_p, _q, _s);
    const worldScale = _s.clone();
    srcHand.matrixWorld.decompose(_p2, _q2, _s2);
    const relPos = _p.clone().sub(_p2).applyQuaternion(_q2.clone().invert());
    const relRot = _q2.clone().invert().multiply(_q);
    const C = ti >= 0 ? this.source?.retarget?.correction[ti] : null;
    if (C) { const Ci = C.clone().invert(); relPos.applyQuaternion(Ci); relRot.premultiply(Ci); }
    this.H(xName).matrixWorld.decompose(_p2, _q2, _s2);
    return new THREE.Matrix4().compose(relPos.applyQuaternion(_q2).add(_p2), _q2.clone().multiply(relRot), worldScale);
  }

  _SrcPalm(side) {
    const hand = side === "R" ? this.rig.bones?.handR : this.rig.bones?.handL;
    if (!hand) return null;
    const key = "srcMiddle" + side;
    if (this[key] === undefined) this[key] = this.rig.root.getObjectByName("Bip001_" + side + "_Finger2") || null;
    return FreshPalm(hand, this[key], new THREE.Vector3());
  }

  /** 这只手要不要去握点：掌心离握点 ≤ near 全拉，≥ far 不拉，中间渐变（按 X Bot 原尺寸的米算）。 */
  _GripWeight(side, target) {
    const n = side === "R" ? "Right" : "Left";
    const scale = this.container.matrixWorld.getMaxScaleOnAxis() || 1;
    const d = FreshPalm(this.H(n + "Hand"), this.H(n + "HandMiddle1"), new THREE.Vector3()).distanceTo(target) / scale;
    const { near, far } = XBOT_GRIP;
    return d <= near ? 1 : d >= far ? 0 : 1 - (d - near) / (far - near);
  }

  /** 两节骨 IK：肩—肘—腕，让掌心落到 target（按 weight 插值）；肘弯的平面沿用动作自己的，手腕的世界朝向不变。 */
  _SolveArm(side, targetPalm, weight) {
    const n = side === "R" ? "Right" : "Left";
    const upper = this.H(n + "Arm"), fore = this.H(n + "ForeArm"), hand = this.H(n + "Hand"), middle = this.H(n + "HandMiddle1");
    if (!upper || !fore || !hand) return;
    const handQ = FreshQuaternion(hand);
    const A = FreshPosition(upper), B = FreshPosition(fore), Cw = FreshPosition(hand);
    const palmOff = FreshPalm(hand, middle, new THREE.Vector3()).sub(Cw);
    const target = Cw.clone().lerp(targetPalm.clone().sub(palmOff), weight);
    const lab = A.distanceTo(B), lbc = B.distanceTo(Cw);
    const lat = THREE.MathUtils.clamp(A.distanceTo(target), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4);
    const ba = A.clone().sub(B), bc = Cw.clone().sub(B);
    let axis = ba.clone().cross(bc);
    if (axis.lengthSq() < 1e-10) axis = new THREE.Vector3(0, 1, 0).applyQuaternion(FreshQuaternion(upper)).cross(ba);
    axis.normalize();
    const cur = ba.angleTo(bc), des = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    RotateBoneWorld(fore, new THREE.Quaternion().setFromAxisAngle(axis, des - cur));
    const C2 = FreshPosition(hand);
    const ac = C2.sub(A).normalize(), at = target.clone().sub(A).normalize();
    RotateBoneWorld(upper, new THREE.Quaternion().setFromUnitVectors(ac, at));
    SetBoneWorldQuaternion(hand, handQ);
  }

  _ScanAttachments() {
    this.attachScan = this.frame;
    this.attachWeapon = this.actor.weaponGroup;
    const old = new Map(this.attachments.map(a => [a.object, a]));
    const list = [];
    this.rig.root.traverse((o) => {
      if (!o.isBone) return;
      for (const child of o.children) {
        if (child.isBone || child.isSkinnedMesh) continue;
        const prev = old.get(child);
        if (prev) { list.push(prev); continue; }
        let holdsWeapon = false;
        const w = this.actor.weaponGroup;
        for (let p = w; p; p = p.parent) if (p === child) { holdsWeapon = true; break; }
        list.push(this._Attachment(child, o, holdsWeapon));
      }
    });
    // 直接挂在 rig.root 下、带网格、里面没有骨头也没有蒙皮的东西：片段道具轨摆的枪、背着的枪这类。
    // 枪按右手挪；别的按扫到时离它最近的那根原身体骨挪（背着的枪 → 脊柱，手里的道具 → 手）。
    const weapon = this.actor.weaponGroup;
    for (const child of this.rig.root.children) {
      if (child.isBone) continue;
      let bone = false, skinned = false, mesh = false, holdsWeapon = false;
      child.traverse((o) => { if (o.isBone) bone = true; else if (o.isSkinnedMesh) skinned = true; else if (o.isMesh) mesh = true; if (o === weapon) holdsWeapon = true; });
      if (bone || skinned || !mesh) continue;
      const prev = old.get(child);
      if (prev) { list.push(prev); continue; }
      const anchor = holdsWeapon && this.rig.bones?.handR ? this.rig.bones.handR : this._NearestSourceBone(child);
      if (anchor) list.push(this._Attachment(child, anchor, holdsWeapon, anchor));
    }
    this.attachments = list;
  }

  _Attachment(object, sourceBone, holdsWeapon, anchor = null) {
    const xbotName = XBOT_FROM_SOLDIER[BoneKey(sourceBone.name)] || null;
    return { object, anchor, xbotBone: xbotName ? this.bones.get(xbotName) : this.H("Hips"),
      targetIndex: xbotName ? this.skins.rest.Find(xbotName) : -1, holdsWeapon, intended: null, written: null };
  }

  _NearestSourceBone(object) {
    const at = object.getWorldPosition(new THREE.Vector3());
    let best = null, bestD = Infinity;
    for (const bone of this.srcBones) {
      if (!bone || !XBOT_FROM_SOLDIER[BoneKey(bone.name)]) continue;
      const d = bone.getWorldPosition(_p2).distanceToSquared(at);
      if (d < bestD) { bestD = d; best = bone; }
    }
    return best;
  }

  /** 枪的世界位姿：右手照标定（左手在枪管前方时按权重把枪管转过去对准左手，CalibratedRifle），或开头钉在左手上的那份。 */
  _RifleWorld(band) {
    const off = this.skins.rifleOffset, k = this.container.matrixWorld.getMaxScaleOnAxis();
    const out = this._rifleOut || (this._rifleOut = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
    if (this.rifleOnLeft) {
      this.H("LeftHand").matrixWorld.decompose(_p2, _q2, _s2);
      out.position.copy(this.rifleOnLeft.position).multiplyScalar(k).applyQuaternion(_q2).add(_p2);
      out.quaternion.copy(_q2).multiply(this.rifleOnLeft.quaternion);
      return out;
    }
    return CalibratedRifle(this.H, off, k, band, out);
  }

  /** 右手腾出来干别的、枪留在左手的动作（清单 rifleHand: "L"）：动作开头按右手标定放好枪，记下它相对左手的位姿。 */
  _PinLeft(file) {
    this.rifleOnLeft = null;
    const W = this._RifleWorld(AimBandFor(this.skins.library.get(file))), k = this.container.matrixWorld.getMaxScaleOnAxis();
    this.H("LeftHand").matrixWorld.decompose(_p2, _q2, _s2);
    const inv = _q2.clone().invert();
    return { file, position: W.position.clone().sub(_p2).applyQuaternion(inv).divideScalar(k), quaternion: inv.multiply(W.quaternion.clone()) };
  }

  /** 取证：X Bot 看不看得见、胯在哪（世界坐标）、原身体胯在哪、手里的枪离 X Bot 最近那只手多远、枪按哪种方式挂。 */
  Probe() {
    const R = (v) => (v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : null);
    const hips = this.H("Hips")?.getWorldPosition(new THREE.Vector3());
    const src = this.rig.bones?.pelvis?.getWorldPosition(new THREE.Vector3());
    let weaponGap = null, grip = null;
    if (this._RifleInHands()) {
      const w = this.actor.weaponGroup.getWorldPosition(new THREE.Vector3());
      weaponGap = +Math.min(...["RightHand", "LeftHand"].map(n => this.H(n).getWorldPosition(new THREE.Vector3()).distanceTo(w))).toFixed(3);
      grip = this._GripGaps();
    }
    return { visible: this.container.visible, hips: R(hips), srcPelvis: R(src), weaponGap, ...(grip || {}), contactR: this.contact?.R ?? null, contactL: this.contact?.L ?? null,
      mount: this.lastMount || null, attachments: this.attachments.length,
      pick: !this.pick ? null : this.pick.mode === "mirror" ? "mirror" : this.pick.key || this.pick.file };
  }

  /** 枪的两个握点（右手握把 = 枪的原点，左手护木 = weaponGripFront）各离 X Bot 那只手的掌心多远。 */
  _GripGaps() {
    const w = this.actor.weaponGroup;
    w.updateWorldMatrix(true, false);
    const right = new THREE.Vector3().setFromMatrixPosition(w.matrixWorld);
    const front = this.actor.weaponGripFront?.lengthSq() > 1e-8 ? this.actor.weaponGripFront.clone().applyMatrix4(w.matrixWorld) : null;
    const palmR = Palm(this.H("RightHand"), this.H("RightHandMiddle1"), new THREE.Vector3());
    const palmL = Palm(this.H("LeftHand"), this.H("LeftHandMiddle1"), new THREE.Vector3());
    return { gripR: +right.distanceTo(palmR).toFixed(3), gripL: front ? +front.distanceTo(palmL).toFixed(3) : null };
  }

  Dispose() {
    this._RestoreWeaponVisualOrigin();
    this._EndRifleSwap();
    this.mixer.stopAllAction();
    this.wounds?.Clear();
    if (this.actor?.skinWounds === this.wounds) this.actor.skinWounds = null;
    if (this.actor?.goreSkin === this) this.actor.goreSkin = null;
    this.hair?.Dispose();
    this.container.removeFromParent();
    for (const mesh of this.hidden) mesh.visible = true;
    for (const a of this.attachments) {
      if (a.intended) { a.object.matrix.copy(a.intended); a.object.matrix.decompose(a.object.position, a.object.quaternion, a.object.scale); }
      if (a.slingRest) for (const [c, m] of a.slingRest) { c.matrix.copy(m); c.matrix.decompose(c.position, c.quaternion, c.scale); }
    }
  }
}

/** 原生状态 → XBOT_NATIVE 的键。 */
export function NativeKey(intent, rifleInHands) {
  const mps = intent.mps || 0;
  if (intent.carryRole === "front") return "carryFront";
  if (intent.carryRole) return "carryRear";
  if (intent.woundedWalk && mps > 0.05) return "woundedWalk";
  const stance = intent.stance === "prone" ? "prone" : intent.stance === "crouch" ? "crouch" : "stand";
  if (intent.talking && mps < 0.05 && stance === "stand") return "talking";
  const move = mps < 0.05 ? "Idle" : stance === "prone" ? "Crawl" : mps < XBOT.runMps ? "Walk" : "Run";
  const hold = rifleInHands ? "Rifle" : "Empty";
  return `${stance}${move}${hold}${rifleInHands && intent.aim ? "Aim" : ""}`;
}
