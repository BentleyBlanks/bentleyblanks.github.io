// 第一人称国军蒙皮双臂桥。
//
// Model_FpsArmsNraSkeletal01.glb 从正式 Model_LugouNra01 派生：保留军装袖、双臂、
// 完整十指、53 骨蒙皮和动作轨。武器仍由 Script_Viewmodel 驱动；这里把每把武器的
// 右/左握持目标转换成真实 Hand 骨的世界目标，再用解析两骨 IK 解 UpperArm →
// Forearm → Hand。手指不再烘成一块死网格，而是按步枪/机枪/手枪/近战/投掷物
// 从源动画提取骨骼握姿。
//
// 坐标契约：握持目标局部 +X = 被握物轴，+Y = 手背，+Z = 指向。目标必须提供
// 位置和旋转；IK 只负责肩肘腕，十指由握姿负责。GLB 读取或骨链识别失败时才退回
// Script_Viewmodel 的程序化手，不能静默显示一支浮空的枪。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";

const URLS = Object.freeze({ fpsArms: "./Model/Model_FpsArmsNraSkeletal01.glb?v=2" });
const PROFILE_CLIPS = Object.freeze({
  rifle: "RifleIdle",
  lmg: "MachineGunFire",
  pistol: "PistolFire",
  melee: "RifleIdle",
  throwable: "AttackCommand",
});
const DEG = Math.PI / 180;
const CLOSED_FINGER_DEG = Object.freeze([58, 78, 48]);
const TRIGGER_FINGER_DEG = Object.freeze({
  rifle: CLOSED_FINGER_DEG,
  lmg: CLOSED_FINGER_DEG,
  pistol: [18, 24, 12],
  melee: CLOSED_FINGER_DEG,
  throwable: CLOSED_FINGER_DEG,
});

// 视图模型把真尺寸枪放在眼前展示，双臂跟着缩到同一套画面比例。肩锚留在视锥下沿
// 外：玩家只看见袖口和手从画面下沿伸进来，不会看见没有躯干的肩截面。
const ARM_SCALE = 0.66;
const HAND_SCALE = 0.84;
// 第一人称枪的位置不是世界里“从真人肩膀量过去”的位置：为窄 FOV 压缩过的步枪
// 护木在 z≈-0.85，而手枪/手榴弹的左手目标在 z≈-0.20。用一个固定、缩小后的左肩
// 覆盖两者必有一边要拉长十几厘米。肩本来就在视锥外，所以按握持族切换不可见的
// 肩锚；肘、腕和画面里看得见的袖手仍由同一副连续骨架解算。
const SHOULDER_ANCHORS = Object.freeze({
  rifle: Object.freeze({
    r: new THREE.Vector3(0.170, -0.300, -0.100),
    l: new THREE.Vector3(0.000, -0.340, -0.600),
  }),
  lmg: Object.freeze({
    r: new THREE.Vector3(0.170, -0.300, -0.100),
    l: new THREE.Vector3(0.000, -0.340, -0.600),
  }),
  pistol: Object.freeze({
    r: new THREE.Vector3(0.170, -0.300, -0.100),
    l: new THREE.Vector3(-0.120, -0.340, -0.400),
  }),
  throwable: Object.freeze({
    r: new THREE.Vector3(0.170, -0.300, -0.100),
    l: new THREE.Vector3(-0.120, -0.350, -0.320),
  }),
  melee: Object.freeze({
    r: new THREE.Vector3(0.180, -0.310, -0.160),
    l: new THREE.Vector3(-0.100, -0.360, -0.520),
  }),
});
const ELBOW_POLE = Object.freeze({
  r: new THREE.Vector3(0.250, -0.360, 0.230),
  l: new THREE.Vector3(-0.180, -0.330, 0.210),
});
const MAX_STRETCH = 1.22;

const LOADER = new GLTFLoader();
let loadPromise = null;

function NormalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function FindBySuffix(root, suffix) {
  const wanted = NormalizeName(suffix);
  let found = null;
  root.traverse((object) => {
    if (!found && NormalizeName(object.name).endsWith(wanted)) found = object;
  });
  return found;
}

function FindClip(gltf, id) {
  const wanted = NormalizeName(id);
  return (gltf.animations || []).find((clip) => NormalizeName(clip.name) === wanted) || null;
}

function FirstSkinnedMesh(root) {
  let mesh = null;
  root.traverse((object) => { if (!mesh && object.isSkinnedMesh) mesh = object; });
  return mesh;
}

function CaptureTransform(object) {
  return {
    object,
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

function ApplyTransform(entry) {
  entry.object.position.copy(entry.position);
  entry.object.quaternion.copy(entry.quaternion);
  entry.object.scale.copy(entry.scale);
}

function LoadOne(key) {
  return LOADER.loadAsync(URLS[key]).catch((error) => {
    console.warn(`[RiggedModel] ${key} 读取失败，退回程序化模型：${String(error).slice(0, 180)}`);
    return null;
  });
}

function Inspect(gltf) {
  if (!gltf) return { skinnedMeshes: 0, bones: 0, textures: 0, animations: [] };
  let skinnedMeshes = 0;
  let bones = 0;
  const textures = new Set();
  gltf.scene.traverse((object) => {
    if (object.isSkinnedMesh) skinnedMeshes += 1;
    if (object.isBone) bones += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material?.map) textures.add(material.map);
  });
  return {
    skinnedMeshes,
    bones,
    textures: textures.size,
    animations: gltf.animations.map((clip) => clip.name),
  };
}

export async function LoadRiggedAssets() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const fpsArms = await LoadOne("fpsArms");
    return { fpsArms, report: { fpsArms: Inspect(fpsArms) } };
  })();
  return loadPromise;
}

const AIM_A = new THREE.Vector3();
const AIM_B = new THREE.Vector3();
const AIM_C = new THREE.Vector3();
const AIM_Q0 = new THREE.Quaternion();
const AIM_Q1 = new THREE.Quaternion();
const AIM_Q2 = new THREE.Quaternion();

/** 把 bone→child 的当前方向转到 worldTarget，不假设 Biped 的局部骨轴。 */
function AimBone(bone, child, worldTarget) {
  if (!bone || !child || !bone.parent) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const origin = bone.getWorldPosition(AIM_A);
  const current = child.getWorldPosition(AIM_B).sub(origin);
  const wanted = AIM_C.copy(worldTarget).sub(origin);
  if (current.lengthSq() < 1e-10 || wanted.lengthSq() < 1e-10) return;
  const delta = AIM_Q0.setFromUnitVectors(current.normalize(), wanted.normalize());
  const world = bone.getWorldQuaternion(AIM_Q1);
  const parent = bone.parent.getWorldQuaternion(AIM_Q2).invert();
  bone.quaternion.copy(parent.multiply(delta.multiply(world)));
  bone.updateMatrixWorld(true);
}

/**
 * 正式国军 01 蒙皮双臂，由 Viewmodel 每把武器的两个完整握持目标驱动。
 */
export class FpsArmRig {
  constructor(gltf) {
    this.gltf = gltf;
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "RiggedFpsArmsNra01";
    this.root.userData.skipNormalDepth = true;
    this.mesh = FirstSkinnedMesh(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.anchor = null;
    this.targets = null;
    this.legacyMeshes = [];
    this.profile = "rifle";
    this.bones = {};
    this.fingerBones = {};
    this.bindPose = [];
    this.basePose = [];
    this.fingerPoseByProfile = new Map();
    this.gripFrames = new Map();
    this.gripNodes = {};
    this.armLength = {};
    this.shoulderOffset = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    this.stretch = { r: 1, l: 1 };
    this.gripError = { r: Infinity, l: Infinity };
    this.handGoalPosition = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    this.handGoalQuaternion = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._v4 = new THREE.Vector3();
    this._v5 = new THREE.Vector3();
    this._v6 = new THREE.Vector3();
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._m0 = new THREE.Matrix4();
    this._e0 = new THREE.Euler();

    this._CollectBones();
    this._CapturePoses();
    this._BuildGripFrames();

    this.report = {
      source: "LugouNra01Skeletal",
      skinnedMeshes: this.mesh ? 1 : 0,
      bones: this.mesh?.skeleton?.bones?.length || 0,
      chains: Object.keys(this.bones).length,
      profiles: [...this.fingerPoseByProfile.keys()],
      missing: [],
      stretch: this.stretch,
      gripError: this.gripError,
    };
    for (const side of ["r", "l"]) {
      if (!this.bones[side]) this.report.missing.push(`${side}:armChain`);
      if (!this.gripFrames.has(`${this.profile}:${side}`)) this.report.missing.push(`${side}:gripFrame`);
    }
    for (const profile of Object.keys(PROFILE_CLIPS)) {
      if (!this.fingerPoseByProfile.has(profile)) this.report.missing.push(`profile:${profile}`);
    }
    if (!this.mesh || this.report.missing.length) {
      throw new Error(`第一人称蒙皮双臂契约不完整：${this.report.missing.join(", ") || "no SkinnedMesh"}`);
    }

    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.frustumCulled = false;
      object.castShadow = false;
      object.receiveShadow = false;
      object.userData.skipNormalDepth = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        material.side = THREE.FrontSide;
        material.shadowSide = THREE.FrontSide;
        if (material.isMeshStandardMaterial) {
          material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.55);
          material.roughness = Math.max(material.roughness, 0.78);
        }
        material.needsUpdate = true;
      }
    });
  }

  _CollectBones() {
    this.root.traverse((object) => { if (object.isBone) this.bindPose.push(CaptureTransform(object)); });
    for (const side of ["r", "l"]) {
      const chain = {
        clavicle: FindBySuffix(this.root, `${side}clavicle`),
        upperArm: FindBySuffix(this.root, `${side}upperarm`),
        forearm: FindBySuffix(this.root, `${side}forearm`),
        hand: FindBySuffix(this.root, `${side}hand`),
      };
      if (Object.values(chain).some((bone) => !bone)) continue;
      this.bones[side] = chain;
      const fingers = [];
      for (let finger = 0; finger <= 4; finger += 1) {
        for (const suffix of ["", "1", "2"]) {
          const bone = FindBySuffix(this.root, `${side}finger${finger}${suffix}`);
          if (bone) fingers.push(bone);
        }
      }
      this.fingerBones[side] = fingers;
      const marker = new THREE.Object3D();
      marker.name = `RuntimeFpsGrip${side.toUpperCase()}`;
      chain.hand.add(marker);
      this.gripNodes[side] = marker;
    }
  }

  _Restore(entries) {
    for (const entry of entries) ApplyTransform(entry);
  }

  _SampleClip(clipId) {
    this._Restore(this.bindPose);
    this.mixer.stopAllAction();
    const clip = FindClip(this.gltf, clipId);
    if (!clip) return false;
    const action = this.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce, 1).play();
    // 首帧是动作间过渡用的开放手，直接拿会把拇指/食指烘成截图里的“OK 圈”。
    // 中段才是作者真正端稳武器的接触姿态；动作本身仍不播放，只抽这一帧做握姿。
    this.mixer.setTime(clip.duration * 0.5);
    this.mixer.update(0);
    this.root.updateWorldMatrix(true, true);
    return true;
  }

  _CapturePoses() {
    if (!this._SampleClip(PROFILE_CLIPS.rifle)) return;
    this.basePose = this.bindPose.map((entry) => CaptureTransform(entry.object));
    for (const [profile, clipId] of Object.entries(PROFILE_CLIPS)) {
      if (!this._SampleClip(clipId)) continue;
      const poses = {};
      for (const side of ["r", "l"]) {
        poses[side] = (this.fingerBones[side] || []).map(CaptureTransform);
      }
      this.fingerPoseByProfile.set(profile, poses);
    }
    this.mixer.stopAllAction();
    this._Restore(this.basePose);
  }

  _FingerRoot(side, index) {
    return FindBySuffix(this.root, `${side}finger${index}`);
  }

  _FingerNext(side, index) {
    return FindBySuffix(this.root, `${side}finger${index}1`);
  }

  _PointInHand(hand, object, out) {
    object.getWorldPosition(out);
    return hand.worldToLocal(out);
  }

  /**
   * 从真实指骨构造握持坐标系。四指根横线给 +X，近节平均方向给 +Z，+Y 自动落在
   * 手背；握点取四指根与近节关节的质心，落在手掌和卷曲手指包围的物体轴附近。
   */
  _GripFrame(side) {
    const hand = this.bones[side]?.hand;
    if (!hand) return null;
    this.root.updateWorldMatrix(true, true);
    const roots = [1, 2, 3, 4].map((index) => this._FingerRoot(side, index));
    const next = [1, 2, 3, 4].map((index) => this._FingerNext(side, index));
    if (roots.some((bone) => !bone) || next.some((bone) => !bone)) return null;
    const rootPoints = roots.map((bone) => this._PointInHand(hand, bone, new THREE.Vector3()));
    const nextPoints = next.map((bone) => this._PointInHand(hand, bone, new THREE.Vector3()));
    const position = new THREE.Vector3();
    for (const point of [...rootPoints, ...nextPoints]) position.add(point);
    position.multiplyScalar(1 / 8);
    const x = side === "r"
      ? rootPoints[3].clone().sub(rootPoints[0])
      : rootPoints[0].clone().sub(rootPoints[3]);
    const z = new THREE.Vector3();
    for (let i = 0; i < 4; i += 1) z.add(nextPoints[i].clone().sub(rootPoints[i]));
    x.normalize();
    z.addScaledVector(x, -z.dot(x)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    z.crossVectors(x, y).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(this._m0.makeBasis(x, y, z));
    return { position, quaternion };
  }

  _BuildGripFrames() {
    for (const profile of this.fingerPoseByProfile.keys()) {
      this._ApplyBase(profile);
      for (const side of ["r", "l"]) {
        const frame = this._GripFrame(side);
        if (frame) this.gripFrames.set(`${profile}:${side}`, frame);
      }
    }
    this._ApplyBase(this.profile);
  }

  _ApplyBase(profile = this.profile) {
    this._Restore(this.basePose);
    const poses = this.fingerPoseByProfile.get(profile) || this.fingerPoseByProfile.get("rifle");
    if (poses) for (const side of ["r", "l"]) this._Restore(poses[side] || []);
    this._ApplyFingerCurl(profile);
    for (const side of ["r", "l"]) {
      const hand = this.bones[side]?.hand;
      if (hand) hand.scale.multiplyScalar(HAND_SCALE);
      const clavicle = this.bones[side]?.clavicle;
      if (clavicle) clavicle.position.add(this.shoulderOffset[side]);
      const frame = this.gripFrames.get(`${profile}:${side}`)
        || this.gripFrames.get(`rifle:${side}`);
      const marker = this.gripNodes[side];
      if (frame && marker) {
        marker.position.copy(frame.position);
        marker.quaternion.copy(frame.quaternion);
      }
    }
  }

  _ApplyFingerCurl(profile) {
    // 源战斗动作提供拇指的对掌和四指的张开方向，但不是第一人称接触姿：食指经常
    // 在过渡帧与拇指围成一个圈。保留每根指根的 X/Y 外展，只统一三节的局部 Z
    // 屈曲；右食指按扳机族留开，其余指节包住握把/护木。
    for (const side of ["r", "l"]) {
      for (let finger = 1; finger <= 4; finger += 1) {
        const curl = side === "r" && finger === 1
          ? (TRIGGER_FINGER_DEG[profile] || TRIGGER_FINGER_DEG.rifle)
          : CLOSED_FINGER_DEG;
        for (let segment = 0; segment < 3; segment += 1) {
          const suffix = segment === 0 ? "" : String(segment);
          const bone = FindBySuffix(this.root, `${side}finger${finger}${suffix}`);
          if (!bone) continue;
          this._e0.setFromQuaternion(bone.quaternion, "XYZ");
          this._e0.z = curl[segment] * DEG;
          bone.quaternion.setFromEuler(this._e0);
        }
      }
    }
  }

  SetGripProfile(profile) {
    this.profile = PROFILE_CLIPS[profile] ? profile : "rifle";
    return this;
  }

  Attach(anchor, handRight, handLeft, legacyHands, profile = "rifle") {
    this.Detach();
    this.anchor = anchor;
    this.targets = { r: handRight, l: handLeft };
    this.legacyMeshes = legacyHands.flatMap((hand) => hand.meshes || []);
    for (const mesh of this.legacyMeshes) mesh.visible = false;
    this.SetGripProfile(profile);
    anchor.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(ARM_SCALE);
    this.shoulderOffset.r.set(0, 0, 0);
    this.shoulderOffset.l.set(0, 0, 0);
    this._ApplyBase();
    this._PlaceShoulders();
    this._MeasureArms();
    this.Update(0);
  }

  _InAnchor(object, out = new THREE.Vector3()) {
    object.getWorldPosition(out);
    return this.anchor.worldToLocal(out);
  }

  _PlaceShoulders() {
    if (!this.anchor || !this.bones.r) return;
    const shoulders = SHOULDER_ANCHORS[this.profile] || SHOULDER_ANCHORS.rifle;
    this.anchor.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    this.root.position.add(this._v0.copy(shoulders.r).sub(this._InAnchor(this.bones.r.upperArm, this._v1)));
    this.root.updateWorldMatrix(true, true);
    const left = this.bones.l;
    if (!left?.clavicle?.parent) return;
    const fromWorld = this.anchor.localToWorld(this._InAnchor(left.upperArm, this._v0));
    const toWorld = this.anchor.localToWorld(this._v1.copy(shoulders.l));
    const parent = left.clavicle.parent;
    this.shoulderOffset.l.copy(parent.worldToLocal(toWorld)).sub(parent.worldToLocal(fromWorld));
    this._ApplyBase();
    this.root.updateWorldMatrix(true, true);
  }

  _MeasureArms() {
    this.root.updateWorldMatrix(true, true);
    for (const side of ["r", "l"]) {
      const chain = this.bones[side];
      if (!chain) continue;
      const upper = this._InAnchor(chain.upperArm, this._v0);
      const elbow = this._InAnchor(chain.forearm, this._v1);
      const hand = this._InAnchor(chain.hand, this._v2);
      this.armLength[side] = { upper: upper.distanceTo(elbow), lower: elbow.distanceTo(hand) };
    }
  }

  _ComputeHandGoal(side) {
    const chain = this.bones[side];
    const target = this.targets?.[side];
    const frame = this.gripFrames.get(`${this.profile}:${side}`)
      || this.gripFrames.get(`rifle:${side}`);
    if (!chain || !target || !frame || !this.anchor) return false;
    const targetWorldQuaternion = this._WorldBasisQuaternion(target, this._q0);
    const desiredHandWorldQuaternion = this._q1.copy(targetWorldQuaternion)
      .multiply(this._q2.copy(frame.quaternion).invert());
    const handWorldScale = chain.hand.getWorldScale(this._v0);
    const offset = this._v1.copy(frame.position).multiply(handWorldScale)
      .applyQuaternion(desiredHandWorldQuaternion);
    const desiredHandWorldPosition = target.getWorldPosition(this._v2).sub(offset);
    this.handGoalPosition[side].copy(this.anchor.worldToLocal(desiredHandWorldPosition));
    const inverseAnchor = this._WorldBasisQuaternion(this.anchor, this._q2).invert();
    this.handGoalQuaternion[side].copy(inverseAnchor).multiply(desiredHandWorldQuaternion);
    return true;
  }

  _SolveArm(side) {
    const chain = this.bones[side];
    const lengths = this.armLength[side];
    if (!chain || !lengths || !this._ComputeHandGoal(side)) return;
    const shoulder = this._InAnchor(chain.upperArm, this._v0);
    const target = this.handGoalPosition[side];
    let upper = lengths.upper;
    let lower = lengths.lower;
    const distance = shoulder.distanceTo(target);
    const nominalReach = Math.max(1e-5, upper + lower);
    let stretch = 1;
    if (distance > nominalReach * 0.998) {
      stretch = Math.min(MAX_STRETCH, distance / (nominalReach * 0.998));
      chain.forearm.position.multiplyScalar(stretch);
      chain.hand.position.multiplyScalar(stretch);
      chain.upperArm.updateMatrixWorld(true);
      upper *= stretch;
      lower *= stretch;
    }
    this.stretch[side] = +stretch.toFixed(3);
    const low = Math.abs(upper - lower) + 1e-4;
    const high = (upper + lower) * 0.999;
    const solvedDistance = Math.min(high, Math.max(low, distance));
    const direction = this._v1.copy(target).sub(shoulder).normalize();
    const cosine = THREE.MathUtils.clamp(
      (upper * upper + solvedDistance * solvedDistance - lower * lower)
        / (2 * upper * solvedDistance),
      -1,
      1,
    );
    const angle = Math.acos(cosine);
    const pole = this._v2.copy(ELBOW_POLE[side]);
    pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(direction, -direction.y);
    pole.normalize();
    const elbow = this._v3.copy(shoulder)
      .addScaledVector(direction, upper * Math.cos(angle))
      .addScaledVector(pole, upper * Math.sin(angle));
    AimBone(chain.upperArm, chain.forearm, this.anchor.localToWorld(elbow));
    AimBone(chain.forearm, chain.hand, this.anchor.localToWorld(this._v4.copy(target)));
  }

  _OrientHand(side) {
    const hand = this.bones[side]?.hand;
    const marker = this.gripNodes[side];
    const target = this.targets?.[side];
    if (!hand?.parent || !marker || !target || !this.anchor) return;
    const desiredWorld = this._WorldBasisQuaternion(this.anchor, this._q0)
      .multiply(this.handGoalQuaternion[side]);
    const parentInverse = this._WorldBasisQuaternion(hand.parent, this._q1).invert();
    hand.quaternion.copy(parentInverse.multiply(desiredWorld));
    hand.updateMatrixWorld(true);
    // Biped 导出骨架的祖先节点带细小的非均匀 scale；矩阵分解后的 world quaternion
    // 不再严格满足 parentQ * localQ，单次反解在右腕会稳定残留 12°—24°。直接量 grip
    // marker 与目标的世界旋转，以世界 delta 回灌 Hand；最多八轮把矩阵三轴残差压到 6° 内。
    for (let iteration = 0; iteration < 8; iteration += 1) {
      this._WorldBasisQuaternion(marker, this._q0);
      this._WorldBasisQuaternion(target, this._q1);
      if (1 - Math.abs(this._q0.dot(this._q1)) < 1e-10) break;
      const delta = this._q2.copy(this._q1).multiply(this._q0.invert());
      const correctedWorld = delta.multiply(this._WorldBasisQuaternion(hand, this._q0));
      const correctedLocal = this._WorldBasisQuaternion(hand.parent, this._q1).invert()
        .multiply(correctedWorld);
      hand.quaternion.copy(correctedLocal);
      hand.updateMatrixWorld(true);
    }
  }

  /** 从真实 world matrix 的三根轴取正交基；比 getWorldQuaternion 更能抵抗 Biped 祖先 scale 的剪切。 */
  _WorldBasisQuaternion(object, out) {
    object.updateWorldMatrix(true, false);
    const elements = object.matrixWorld.elements;
    const x = this._v4.set(elements[0], elements[1], elements[2]).normalize();
    const y = this._v5.set(elements[4], elements[5], elements[6]);
    y.addScaledVector(x, -y.dot(x)).normalize();
    const z = this._v6.crossVectors(x, y).normalize();
    y.crossVectors(z, x).normalize();
    return out.setFromRotationMatrix(this._m0.makeBasis(x, y, z));
  }

  _UpdateGripError(side) {
    const marker = this.gripNodes[side];
    const target = this.targets?.[side];
    if (!marker || !target) return;
    marker.getWorldPosition(this._v0);
    target.getWorldPosition(this._v1);
    this.gripError[side] = +this._v0.distanceTo(this._v1).toFixed(5);
  }

  _AlignGripPosition(side) {
    const hand = this.bones[side]?.hand;
    const marker = this.gripNodes[side];
    const target = this.targets?.[side];
    if (!hand?.parent || !marker || !target) return;
    marker.getWorldPosition(this._v0);
    target.getWorldPosition(this._v1);
    const correction = this._v1.sub(this._v0);
    if (correction.lengthSq() < 1e-10) return;
    hand.getWorldPosition(this._v2).add(correction);
    hand.position.copy(hand.parent.worldToLocal(this._v2));
    hand.updateMatrixWorld(true);
  }

  Detach() {
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const mesh of this.legacyMeshes) mesh.visible = true;
    this.legacyMeshes.length = 0;
    this.targets = null;
    this.anchor = null;
    this.root.visible = true;
  }

  Update() {
    if (!this.root.parent || !this.targets || !this.anchor) return;
    this._ApplyBase();
    this.anchor.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    this._SolveArm("r");
    this._SolveArm("l");
    this._OrientHand("r");
    this._OrientHand("l");
    // 最后一毫米按真实 grip marker 收口。Biped 祖先的矩阵剪切会让解析 IK 算出的
    // Hand pivot 与渲染后的掌心有少量偏差；这里移动的是末端 Hand，不改肩肘平面。
    this._AlignGripPosition("r");
    this._AlignGripPosition("l");
    this.root.updateWorldMatrix(true, true);
    this._UpdateGripError("r");
    this._UpdateGripError("l");
  }

  Dispose() {
    this.Detach();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
