// 第一人称国军蒙皮双臂桥。
//
// Model_FpsArmsNraSkeletal01.glb 从正式 Model_LugouNra01 派生：保留军装袖、双臂、
// 完整十指、53 骨蒙皮和动作轨。武器仍由 Script_Viewmodel 驱动；这里把每把武器的
// 右/左握持目标转换成真实 Hand 骨的世界目标，再用解析两骨 IK 解 UpperArm →
// Forearm → Hand。手指不再烘成一块死网格，而是按步枪/机枪/手枪/近战/投掷物
// 从 Blender 检查过的 bind pose 构造解剖坐标系，手指绕真实屈曲轴弯曲。
//
// 坐标契约：握持目标局部 +X = 被握物轴，+Y = 手背，+Z = 指向。目标必须提供
// 位置和旋转；IK 只负责肩肘腕，十指由握姿负责。GLB 读取或骨链识别失败时才退回
// Script_Viewmodel 的程序化手，不能静默显示一支浮空的枪。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { FpsArmPose, FpsArmStateRotation, FPS_ARM_LIMITS, FPS_BAYONET_SUPPORT } from "./Data_FpsArmPoses.mjs";
import { CaptureAnatomy, ApplyAnatomicalFingers, AimAnatomicalBone } from "./Script_FpsAnatomy.mjs";

const URLS = Object.freeze({ fpsArms: "./Model/Model_FpsArmsNraSkeletal01.glb?v=4", fpsBody: "./Model/Model_FirstPersonBody.glb?v=1" });
const PROFILE_CLIPS = Object.freeze({
  rifle: "RifleIdle",
  lmg: "MachineGunFire",
  pistol: "PistolFire",
  melee: "RifleIdle",
  throwable: "AttackCommand",
});
const DEG = Math.PI / 180;

// 视图模型把真尺寸枪放在眼前展示，双臂跟着缩到同一套画面比例。肩锚留在视锥下沿
// 外：玩家只看见袖口和手从画面下沿伸进来，不会看见没有躯干的肩截面。
const ARM_SCALE = 0.70;
const PROFILE_BY_FAMILY = Object.freeze({
  boltRifle: "rifle", lmg: "lmg", pistol: "pistol", melee: "melee", throwable: "throwable",
});

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
    const [fpsArms, fpsBody] = await Promise.all([LoadOne("fpsArms"), LoadOne("fpsBody")]);
    return { fpsArms, fpsBody, report: { fpsArms: Inspect(fpsArms), fpsBody: Inspect(fpsBody) } };
  })();
  return loadPromise;
}

/**
 * 正式国军 01 蒙皮双臂，由 Viewmodel 每把武器的两个完整握持目标驱动。
 */
export class FpsArmRig {
  /**
   * @param {object} gltf            LoadRiggedAssets 拿到的 fpsArms
   * @param {MaterialLibrary} materialLibrary GLB 材质要经它接进统一 PBR/调试链
   */
  constructor(gltf, materialLibrary = null) {
    this.gltf = gltf;
    this.materialLibrary = materialLibrary;
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "RiggedFpsArmsNra01";
    this.mesh = FirstSkinnedMesh(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.anchor = null;
    this.targets = null;
    this.contactTargets = null;
    this.legacyMeshes = [];
    this.profile = "rifle";
    this.weaponId = null;
    this.poseSpec = null;
    this.poseState = { ads: 0, sprint: 0 };
    this.contactWeight = { r: 1, l: 1 };
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
    this.reachRatio = { r: 0, l: 0 };
    this.reachable = { r: true, l: true };
    this.gripError = { r: Infinity, l: Infinity };
    this.rotationError = { r: Infinity, l: Infinity };
    this.handTranslation = { r: 0, l: 0 };
    this.jointTwist = {
      r: { clavicle: 0, upperArm: 0, forearm: 0, hand: 0 },
      l: { clavicle: 0, upperArm: 0, forearm: 0, hand: 0 },
    };
    this.handGoalPosition = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    this.handGoalQuaternion = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
    this.gripGoalPosition = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    this.gripGoalQuaternion = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
    this.gripGoalAnchorPosition = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    this.gripGoalAnchorQuaternion = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
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
    this._q3 = new THREE.Quaternion();
    this._q4 = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._m0 = new THREE.Matrix4();
    this._m1 = new THREE.Matrix4();
    this._e0 = new THREE.Euler();

    this._CollectBones();
    CaptureAnatomy(this);
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
      reachRatio: this.reachRatio,
      reachable: this.reachable,
      gripError: this.gripError,
      rotationError: this.rotationError,
      handTranslation: this.handTranslation,
      jointTwist: this.jointTwist,
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
      // 双臂是第一人称表面：Debug Rendering 的审计按这个标记只数手，不数手里的枪。
      object.userData.firstPersonPbrSurface = true;
      // GLB 材质不能绕过主材质库 —— 与 Script_CharacterModel 里那段是同一条规矩。
      // glTF 的 metallicFactor 缺省是 1，这两份材质都没写该字段，于是一双手一直
      // 是**纯金属**在渲；而且没注入的材质在 Debug Rendering 的 BaseColor/粗糙度/
      // 金属度/阴影/四路光照视图里照画最终颜色 —— 假彩色一帧里的手是假的。
      // 粗糙度下限沿用原来手写的 0.78。
      this.materialLibrary?.ConfigureExternalPbr?.(object.material, {
        metalness: 0,
        minRoughness: 0.78,
      });
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        material.side = THREE.FrontSide;
        material.shadowSide = THREE.FrontSide;
        if (material.isMeshStandardMaterial) {
          material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.55);
          // 与上面 minRoughness 同一个数：材质库缺席时（离线单测）这一行独自兜底。
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

  _BuildGripFrames() {
    for (const profile of this.fingerPoseByProfile.keys()) {
      for (const side of ["r", "l"]) this.gripFrames.set(`${profile}:${side}`, this.anatomy[side].frame);
    }
    this._ApplyBase(this.profile);
  }

  _ApplyBase(profile = this.profile) {
    this._Restore(this.basePose);
    // Fixed viewmodel proportions, not reach-dependent stretching. Keep palm
    // size readable while shoulders remain below the near-camera silhouette.
    for (const side of ["r", "l"]) {
      this.bones[side].forearm.position.multiplyScalar(1.60);
      this.bones[side].hand.position.multiplyScalar(1.60);
    }
    const poses = this.fingerPoseByProfile.get(profile) || this.fingerPoseByProfile.get("rifle");
    if (poses) for (const side of ["r", "l"]) this._Restore(poses[side] || []);
    ApplyAnatomicalFingers(this);
    for (const side of ["r", "l"]) {
      const clavicle = this.bones[side]?.clavicle;
      if (clavicle) clavicle.position.add(this.shoulderOffset[side]);
      // Bind-pose palm contact stays fixed while individual fingers flex.
      // The trigger finger must never move the wrist's IK target.
      const frame = this.anatomy[side].frame;
      const marker = this.gripNodes[side];
      if (frame && marker) {
        if (this.weaponId) this.gripFrames.set(`${this.weaponId}:${side}`, frame);
        marker.position.copy(frame.position);
        marker.quaternion.copy(frame.quaternion);
      }
    }
  }

  SetGripProfile(profile) {
    this.profile = PROFILE_CLIPS[profile] ? profile : "rifle";
    return this;
  }

  SetWeaponPose(weaponId) {
    this.unarmed = !weaponId;
    const pose = FpsArmPose(weaponId || "ZhongZheng");
    if (!pose) throw new Error(`缺少逐枪第一人称双臂姿势：${weaponId}`);
    this.weaponId = weaponId;
    this.poseSpec = pose;
    this.SetGripProfile(PROFILE_BY_FAMILY[pose.family] || "rifle");
    return this;
  }

  SetPoseState({ ads = 0, sprint = 0, reload = false, reloadBlend = 0, melee = false } = {}) {
    this.poseState.melee = melee;
    this.poseState.reload = reload;
    this.poseState.ads = THREE.MathUtils.clamp(ads, 0, 1);
    this.poseState.sprint = THREE.MathUtils.clamp(sprint, 0, 1);
    if (this.poseSpec && this.contactTargets) {
      for (const side of ["r", "l"]) {
        const key = side === "r" ? "right" : "left";
        const Hip = this.poseSpec.hip.contacts[key].rotation;
        const Ads = FpsArmStateRotation(this.weaponId, "ads", key);
        const Sprint = FpsArmStateRotation(this.weaponId, "sprint", key);
        this._e0.set(Hip[0], Hip[1], Hip[2], "YXZ");
        this._q0.setFromEuler(this._e0);
        this._e0.set(Ads[0], Ads[1], Ads[2], "YXZ");
        this._q1.setFromEuler(this._e0);
        this._q0.slerp(this._q1, this.poseState.ads);
        this._e0.set(Sprint[0], Sprint[1], Sprint[2], "YXZ");
        this._q1.setFromEuler(this._e0);
        this.contactTargets[side].quaternion.copy(this._q0.slerp(this._q1, this.poseState.sprint));
        this.contactTargets[side].position.fromArray(this.poseSpec.contacts[key].position);
        if (melee && side === "l" && this.poseSpec.actions.bayonet) {
          this.contactTargets[side].position.y = FPS_BAYONET_SUPPORT.heightM;
          const r = FPS_BAYONET_SUPPORT.rotation;
          this._e0.set(r[0], r[1], r[2], "YXZ");
          this.contactTargets[side].quaternion.setFromEuler(this._e0);
        }
        const reloadRotation = reload && this.poseSpec.actions?.reload?.contacts?.[key];
        if (reloadRotation) {
          this._e0.set(reloadRotation[0], reloadRotation[1], reloadRotation[2], "YXZ");
          this._q1.setFromEuler(this._e0);
          this.contactTargets[side].quaternion.slerp(this._q1, THREE.MathUtils.clamp(reloadBlend, 0, 1));
        }

      }
    }
    return this;
  }

  SetContactWeight(side, weight) {
    const key = side === "right" ? "r" : side === "left" ? "l" : side;
    if (key === "r" || key === "l") this.contactWeight[key] = THREE.MathUtils.clamp(weight, 0, 1);
    return this;
  }

  Attach(anchor, handRight, handLeft, contactRight, contactLeft, legacyHands, weaponId) {
    this.Detach();
    this.elbowDirections = {r:null,l:null};
    this.anchor = anchor;
    this.targets = { r: handRight, l: handLeft };
    this.contactTargets = { r: contactRight, l: contactLeft };
    this.legacyMeshes = legacyHands.flatMap((hand) => hand.meshes || []);
    for (const mesh of this.legacyMeshes) mesh.visible = false;
    this.SetWeaponPose(weaponId);
    this.contactWeight.r = 1;
    this.contactWeight.l = 1;
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
    const body = this._CurrentBody();
    if (!body) return;
    const shoulders = body.shoulders;
    this.shoulderOffset.r.set(0, 0, 0);
    this.shoulderOffset.l.set(0, 0, 0);
    this._ApplyBase();
    this.anchor.updateWorldMatrix(true, false);
    this.root.position.set(0, 0, 0);
    this.root.updateWorldMatrix(true, true);
    this.root.position.add(this._v0.fromArray(shoulders.right).sub(this._InAnchor(this.bones.r.upperArm, this._v1)));
    this.root.updateWorldMatrix(true, true);
    const left = this.bones.l;
    if (!left?.clavicle?.parent) return;
    const fromWorld = this.anchor.localToWorld(this._InAnchor(left.upperArm, this._v0));
    const toWorld = this.anchor.localToWorld(this._v1.fromArray(shoulders.left));
    const parent = left.clavicle.parent;
    this.shoulderOffset.l.copy(parent.worldToLocal(toWorld)).sub(parent.worldToLocal(fromWorld));
    this._ApplyBase();
    this.root.updateWorldMatrix(true, true);
  }

  _CurrentBody() {
    if (this.unarmed) return { shoulders: { right:[0.19,-0.36,-0.07], left:[-0.19,-0.36,-0.07] },
      elbowPoles: {right:[0.3,-0.8,0.15], left:[-0.3,-0.8,0.15]} };
    if (!this.poseSpec) return null;
    // Two-handed blade work needs the support shoulder behind the grip. The
    // inspection pose's forward shoulder folds the new anatomical arm across
    // the camera and cannot accommodate the blade's diagonal follow-through.
    if (this.poseState.melee && this.poseSpec.family === "melee") {
      return {shoulders:{right:[0.19,-0.40,-0.15],left:[-0.19,-0.40,-0.10]},
        elbowPoles:{right:[0.30,-0.80,0.12],left:[-0.30,-0.80,0.12]}};
    }
    if (["boltRifle", "lmg", "pistol"].includes(this.poseSpec.family)) {
      const pistol = this.poseSpec.family === "pistol";
      const adsShoulder = this.poseSpec.ads.weapon.eyeDistance > 0.45 ? -0.41 : -0.26;
      const leftZ = THREE.MathUtils.lerp(-0.41, adsShoulder, this.poseState.ads);
      return {shoulders:{right:[0.19,-0.40,0.08],left:[-0.19,-0.40,pistol ? 0.04 : leftZ]},
        elbowPoles:{right:[0.30,-0.80,0.12],left:[-0.30,-0.80,0.12]}};
    }
    const hip = this.poseSpec.hip.body;
    const ads = this.poseSpec.ads.body;
    const sprint = this.poseSpec.sprint.body;
    const MixVector = (a, b, t) => [
      THREE.MathUtils.lerp(a[0], b[0], t),
      THREE.MathUtils.lerp(a[1], b[1], t),
      THREE.MathUtils.lerp(a[2], b[2], t),
    ];
    const MixBody = (a, b, t) => ({
      shoulders: {
        right: MixVector(a.shoulders.right, b.shoulders.right, t),
        left: MixVector(a.shoulders.left, b.shoulders.left, t),
      },
      elbowPoles: {
        right: MixVector(a.elbowPoles.right, b.elbowPoles.right, t),
        left: MixVector(a.elbowPoles.left, b.elbowPoles.left, t),
      },
    });
    return MixBody(MixBody(hip, ads, this.poseState.ads), sprint, this.poseState.sprint);
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
    const poseTarget = this.targets?.[side];
    const contactTarget = this.contactTargets?.[side] || poseTarget;
    const frame = this.gripFrames.get(`${this.weaponId}:${side}`)
      || this.gripFrames.get(`${this.profile}:${side}`)
      || this.gripFrames.get(`rifle:${side}`);
    if (!chain || !poseTarget || !contactTarget || !frame || !this.anchor) return false;
    const weight = this.contactWeight[side];
    // Solve in armAnchor coordinates.  Both target and arm are below the
    // viewmodel's non-uniform FOV compensation; multiplying complete matrices
    // by inverse(anchor.matrixWorld) cancels that render-only affine layer.
    this._InAnchorTransform(poseTarget, this._v2, this._q0, this._v4);
    this._InAnchorTransform(contactTarget, this._v3, this._q1, this._v5);
    // Operation targets author the palm path, not a free-form wrist rotation.
    // The legacy hidden hand Euler values were made for rigid hand meshes and
    // are not anatomical constraints.  Start a detached hand from its natural
    // post-pose palm frame, then blend back into the calibrated weapon contact.
    if (weight < 0.999) this._InAnchorBasisQuaternion(this.gripNodes[side], this._q0);
    const targetAnchorPosition = this._v2.lerp(this._v3, weight);
    const targetAnchorQuaternion = this._q2.copy(this._q0).slerp(this._q1, weight);
    this.gripGoalAnchorQuaternion[side].copy(targetAnchorQuaternion);
    this.gripGoalAnchorPosition[side].copy(targetAnchorPosition);
    this.handGoalPosition[side].copy(targetAnchorPosition);
    poseTarget.getWorldPosition(this._v2);
    contactTarget.getWorldPosition(this._v3);
    this.gripGoalPosition[side].copy(this._v2).lerp(this._v3, weight);
    this.gripGoalQuaternion[side].copy(this._WorldBasisQuaternion(contactTarget, this._q3));
    const desiredHandAnchorQuaternion = this.handGoalQuaternion[side]
      .copy(targetAnchorQuaternion).multiply(this._q1.copy(frame.quaternion).invert());
    this.anchor.updateWorldMatrix(true, false);
    chain.hand.updateWorldMatrix(true, false);
    this._m1.copy(this.anchor.matrixWorld).invert().multiply(chain.hand.matrixWorld)
      .decompose(this._v0, this._q0, this._v4);
    const offsetAnchor = this._v1.copy(frame.position).multiply(this._v4)
      .applyQuaternion(desiredHandAnchorQuaternion);
    this.handGoalPosition[side].sub(offsetAnchor);
    return true;
  }

  _InAnchorTransform(object, position, quaternion, scale) {
    this.anchor.updateWorldMatrix(true, false);
    object.updateWorldMatrix(true, false);
    this._m1.copy(this.anchor.matrixWorld).invert().multiply(object.matrixWorld)
      .decompose(position, quaternion, scale);
  }

  _InAnchorBasisQuaternion(object, out) {
    this.anchor.updateWorldMatrix(true, false);
    object.updateWorldMatrix(true, false);
    const elements = this._m1.copy(this.anchor.matrixWorld).invert()
      .multiply(object.matrixWorld).elements;
    const x = this._v4.set(elements[0], elements[1], elements[2]).normalize();
    const y = this._v5.set(elements[4], elements[5], elements[6]);
    y.addScaledVector(x, -y.dot(x)).normalize();
    const z = this._v6.crossVectors(x, y).normalize();
    y.crossVectors(z, x).normalize();
    return out.setFromRotationMatrix(this._m0.makeBasis(x, y, z));
  }

  _SolveArm(side, computeGoal = true) {
    const chain = this.bones[side];
    const lengths = this.armLength[side];
    if (!chain || !lengths || (computeGoal && !this._ComputeHandGoal(side))) return;
    const shoulder = this._InAnchor(chain.upperArm, new THREE.Vector3());
    const target = this.handGoalPosition[side];
    let upper = lengths.upper;
    let lower = lengths.lower;
    let distance = shoulder.distanceTo(target);
    const nominalReach = Math.max(1e-5, upper + lower);
    if (computeGoal && distance > nominalReach * FPS_ARM_LIMITS.maxReachRatio) {
      const correction = target.clone().sub(shoulder).normalize()
        .multiplyScalar(Math.min(0.075, distance - nominalReach * 0.97));
      const parent = chain.clavicle.parent;
      const from = parent.worldToLocal(this.anchor.localToWorld(shoulder.clone()));
      const to = parent.worldToLocal(this.anchor.localToWorld(shoulder.clone().add(correction)));
      chain.clavicle.position.add(to.sub(from));
      chain.clavicle.updateMatrixWorld(true);
      this._InAnchor(chain.upperArm, shoulder);
      distance = shoulder.distanceTo(target);
    }
    this.reachRatio[side] = +(distance / nominalReach).toFixed(4);
    this.reachable[side] = distance <= nominalReach * FPS_ARM_LIMITS.maxReachRatio;
    this.stretch[side] = 1;
    const low = Math.abs(upper - lower) + 1e-4;
    const high = (upper + lower) * FPS_ARM_LIMITS.maxReachRatio;
    const solvedDistance = Math.min(high, Math.max(low, distance));
    const direction = target.clone().sub(shoulder).normalize();
    const cosine = THREE.MathUtils.clamp(
      (upper * upper + solvedDistance * solvedDistance - lower * lower)
        / (2 * upper * solvedDistance),
      -1,
      1,
    );
    const angle = Math.acos(cosine);
    const body = this._CurrentBody();
    const poleValues = body?.elbowPoles?.[side === "r" ? "right" : "left"] || [side === "r" ? 0.3 : -0.3, -0.8, 0.15];
    // pole 是肩空间里的方向，不是世界原点里的某个点。旧实现把固定坐标直接投影，
    // 武器一换/肩一移肘平面就跟着翻面。
    const pole = new THREE.Vector3().fromArray(poleValues);
    pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(direction, -direction.y);
    pole.normalize();
    // The elbow lies on a circle. Its feasible arc comes from the wrist bend
    // limit; retain the previous bend plane inside that arc and gently return
    // toward the authored pole. Near a straight wrist the optimal pole is
    // undefined, so following it directly can flip the elbow by 180 degrees.
    const handDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(this.gripGoalAnchorQuaternion[side]);
    const preferred = target.clone().addScaledVector(handDirection, -lower).sub(shoulder);
    preferred.addScaledVector(direction, -preferred.dot(direction));
    const previous = this.elbowDirections?.[side];
    const chosen = previous ? previous.clone().addScaledVector(direction,-previous.dot(direction)) : pole.clone();
    if (chosen.lengthSq() < 1e-8) chosen.copy(pole);
    chosen.normalize();
    const previousPlane = chosen.clone();
    const SignedAngle = (from,to) => Math.atan2(direction.dot(new THREE.Vector3().crossVectors(from,to)),from.dot(to));
    if (computeGoal) chosen.applyAxisAngle(direction,THREE.MathUtils.clamp(SignedAngle(chosen,pole),
      -FPS_ARM_LIMITS.elbowReturnRadPerS*this.solveDt,FPS_ARM_LIMITS.elbowReturnRadPerS*this.solveDt));
    const axial = handDirection.dot(direction);
    const radius = upper*Math.sin(angle);
    const amplitude = radius/lower*Math.sqrt(Math.max(0,1-axial*axial));
    if (preferred.lengthSq() > 1e-8 && amplitude > 1e-8) {
      preferred.normalize();
      const baseCos = axial*(solvedDistance-upper*Math.cos(angle))/lower;
      const minimumBend = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(baseCos+amplitude,-1,1)));
      const desiredBend = Math.min(FPS_ARM_LIMITS.wristBendDeg-1,
        Math.max(FPS_ARM_LIMITS.wristRelaxedDeg,minimumBend+FPS_ARM_LIMITS.wristPoseSlackDeg));
      const threshold = Math.cos(desiredBend*DEG);
      const allowed = Math.acos(THREE.MathUtils.clamp((threshold-baseCos)/amplitude,-1,1));
      const offset = SignedAngle(preferred,chosen);
      if (Math.abs(offset)>allowed) chosen.copy(preferred).applyAxisAngle(direction,Math.sign(offset)*allowed);
      if (previous && computeGoal) {
        const delta = SignedAngle(previousPlane,chosen);
        const maximum = FPS_ARM_LIMITS.elbowSpeedRadPerS*this.solveDt;
        chosen.copy(previousPlane).applyAxisAngle(direction,THREE.MathUtils.clamp(delta,-maximum,maximum));
      }
      // The relaxed pose may lag during transitions; the anatomical hard
      // limit still takes priority over interpolation on the final bones.
      const hardAllowed = Math.acos(THREE.MathUtils.clamp((Math.cos((FPS_ARM_LIMITS.wristBendDeg-1)*DEG)-baseCos)/amplitude,-1,1));
      const hardOffset = SignedAngle(preferred,chosen);
      if (Math.abs(hardOffset)>hardAllowed) chosen.copy(preferred).applyAxisAngle(direction,Math.sign(hardOffset)*hardAllowed);
    }
    pole.copy(chosen);
    if (computeGoal) this.elbowDirections[side] = chosen.clone();
    const elbow = shoulder.clone()
      .addScaledVector(direction, upper * Math.cos(angle))
      .addScaledVector(pole, upper * Math.sin(angle));
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(this.gripGoalAnchorQuaternion[side]);
    AimAnatomicalBone(this, side, "upperArm", elbow, normal);
    AimAnatomicalBone(this, side, "forearm", target, normal);
  }

  _OrientHand(side) {
    const hand = this.bones[side].hand;
    const frame = this.anatomy[side].frame;
    if (this.contactWeight[side] < 0.999) {
      const natural = this._InAnchorBasisQuaternion(this.bones[side].forearm, new THREE.Quaternion())
        .multiply(this.anatomy[side].bones.forearm.clone().invert());
      this.gripGoalAnchorQuaternion[side].copy(natural.slerp(this.gripGoalAnchorQuaternion[side], this.contactWeight[side]));
      this.handGoalQuaternion[side].copy(this.gripGoalAnchorQuaternion[side]).multiply(frame.quaternion.clone().invert());
    }
    const Orient = () => {
      const parentInverse = this._InAnchorBasisQuaternion(hand.parent, new THREE.Quaternion()).invert();
      hand.quaternion.copy(parentInverse.multiply(this.handGoalQuaternion[side]));
      hand.updateMatrixWorld(true);
    };
    Orient();
    if (this.contactWeight[side] < 0.999) {
      const offset = this._InAnchor(this.gripNodes[side], new THREE.Vector3()).sub(this._InAnchor(hand,new THREE.Vector3()));
      this.handGoalPosition[side].copy(this.gripGoalAnchorPosition[side]).sub(offset);
      this._SolveArm(side, false);
      Orient();
    }
    const elbow = this._InAnchor(this.bones[side].forearm, new THREE.Vector3());
    const wrist = this._InAnchor(hand, new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(this.gripGoalAnchorQuaternion[side]);
    this.wristBend ||= {r: 0, l: 0};
    this.wristBend[side] = THREE.MathUtils.radToDeg(direction.angleTo(wrist.sub(elbow)));
    const axis = wrist.clone().normalize();
    const forearmBasis = this._InAnchorBasisQuaternion(this.bones[side].forearm, new THREE.Quaternion())
      .multiply(this.anatomy[side].bones.forearm.clone().invert());
    const forearmNormal = new THREE.Vector3(0,1,0).applyQuaternion(forearmBasis);
    const handNormal = new THREE.Vector3(0,1,0).applyQuaternion(this.gripGoalAnchorQuaternion[side]);
    handNormal.addScaledVector(axis,-handNormal.dot(axis)).normalize();
    const twist = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(forearmNormal,handNormal)),forearmNormal.dot(handNormal));
    this.jointTwist[side] = {clavicle: 0, upperArm: 0, forearm: 0, hand: THREE.MathUtils.radToDeg(twist)};
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
    if (!marker) return;
    this._InAnchor(marker, this._v0);
    this.anchor.worldToLocal(this._v1.copy(this.gripGoalPosition[side]));
    this.gripError[side] = +this._v0.distanceTo(this._v1).toFixed(5);
    const actual = this._InAnchorBasisQuaternion(marker, this._q0);
    this.rotationError[side] = +(2 * Math.acos(THREE.MathUtils.clamp(Math.abs(actual.dot(this.gripGoalAnchorQuaternion[side])), -1, 1)) / DEG).toFixed(3);
  }

  _AlignGripPosition(side) {
    const hand = this.bones[side]?.hand;
    const marker = this.gripNodes[side];
    if (!hand?.parent || !marker) return;
    this._InAnchor(marker, this._v0);
    this.anchor.worldToLocal(this._v1.copy(this.gripGoalPosition[side]));
    const correction = this._v1.sub(this._v0);
    const distance = correction.length();
    this.handTranslation[side] = +distance.toFixed(6);
    if (correction.lengthSq() < 1e-10) return;
    if (distance > FPS_ARM_LIMITS.handClosureM) {
      this.reachable[side] = false;
      return;
    }
    const handAnchor = this._InAnchor(hand, this._v2).add(correction);
    const handWorld = this.anchor.localToWorld(handAnchor);
    hand.position.copy(hand.parent.worldToLocal(handWorld));
    hand.updateMatrixWorld(true);
  }

  Detach() {
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const mesh of this.legacyMeshes) mesh.visible = true;
    this.legacyMeshes.length = 0;
    this.targets = null;
    this.contactTargets = null;
    this.anchor = null;
    this.root.visible = true;
  }

  Update(dt = 1 / 60) {
    if (!this.root.parent || !this.targets || !this.anchor) return;
    this.solveDt = THREE.MathUtils.clamp(dt,0,0.05);
    this._PlaceShoulders();
    this.anchor.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    this._SolveArm("r");
    this._SolveArm("l");
    this._OrientHand("r");
    this._OrientHand("l");
    // 只允许毫米级皮肤闭合。超过阈值说明肩锚/握点/姿势数据错了，保留残差并让
    // 测试失败；不能再平移 Hand 把断腕藏在 0 mm residual 后面。
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
