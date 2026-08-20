// Rigged GLB bridge.
//
// Gameplay animation remains authoritative in Script_Viewmodel / Script_Actor.
// This module only retargets those proven hand and body transforms onto imported
// skeletons. A failed GLB therefore degrades to the old procedural geometry
// instead of blocking boot or changing combat timing.

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { CCDIKSolver } from "./vendor/three/examples/jsm/animation/CCDIKSolver.js";

const URLS = Object.freeze({
  fpsArms: "./Model/Model_FpsArms.glb?v=1",
  ijaSoldier: "./Model/Model_IjaSoldier.glb?v=5",
  nraSoldier: "./Model/Model_NraSoldier.glb?v=3",
  civilianMale: "./Model/Model_CivilianMale.glb?v=3",
  civilianFemale: "./Model/Model_CivilianFemale.glb?v=3",
});

const LOADER = new GLTFLoader();
let loadPromise = null;

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
    for (const material of materials) {
      if (material && material.map) textures.add(material.map);
    }
  });
  return { skinnedMeshes, bones, textures: textures.size, animations: gltf.animations.map((clip) => clip.name) };
}

export async function LoadRiggedAssets() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const [fpsArms, ijaSoldier, nraSoldier, civilianMale, civilianFemale] = await Promise.all([
      LoadOne("fpsArms"), LoadOne("ijaSoldier"), LoadOne("nraSoldier"),
      LoadOne("civilianMale"), LoadOne("civilianFemale"),
    ]);
    const report = {
      fpsArms: Inspect(fpsArms), ijaSoldier: Inspect(ijaSoldier), nraSoldier: Inspect(nraSoldier),
      civilianMale: Inspect(civilianMale), civilianFemale: Inspect(civilianFemale),
    };
    return { fpsArms, ijaSoldier, nraSoldier, civilianMale, civilianFemale, report };
  })();
  return loadPromise;
}

function FindByName(root, name) {
  let found = null;
  root.traverse((object) => { if (!found && object.name === name) found = object; });
  return found;
}

function FirstSkinnedMesh(root) {
  let mesh = null;
  root.traverse((object) => { if (!mesh && object.isSkinnedMesh) mesh = object; });
  return mesh;
}

function WorldQuaternion(object, target) {
  object.updateWorldMatrix(true, false);
  return object.getWorldQuaternion(target);
}

/** Imported WRAD arms driven to the existing weapon-specific hand targets. */
export class FpsArmRig {
  constructor(gltf) {
    this.gltf = gltf;
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "RiggedFpsArms";
    this.root.userData.skipNormalDepth = true;
    this.root.position.set(0, -0.075, 0.34);
    this.mesh = FirstSkinnedMesh(this.root);
    this.mixer = gltf.animations.length ? new THREE.AnimationMixer(this.root) : null;
    if (this.mixer) this.mixer.clipAction(gltf.animations[0]).play();
    this.hands = null;
    this.legacyMeshes = [];
    this.solver = null;
    this.wrists = {};
    this.targets = {};
    this.calibration = {};
    this.sprintFallback = false;
    this.tmpPosition = new THREE.Vector3();
    this.tmpQuaternion = new THREE.Quaternion();
    this.tmpQuaternion2 = new THREE.Quaternion();
    this._BuildSolver();
    this.root.traverse((object) => {
      if (object.isMesh) {
        // 这副 WRAD 手臂的源材质标了 doubleSided。腰射时肩膀在相机后方问题不明显，
        // 但冲刺姿态会把整套 weaponMount 下压并外旋，粗模上臂便从近平面横扫过去；
        // 双面渲染会把人站在袖筒内部看到的背面也画出来，于是一个粉色三角面铺满
        // 半个屏幕。第一人称手臂只该从皮肤/袖筒外侧观看，强制正面渲染既消掉
        // 这块“粉色遮屏”，也不改变 IK、枪位或冲刺动作本身。
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.side = THREE.FrontSide;
          material.shadowSide = THREE.FrontSide;
          material.needsUpdate = true;
        }
        object.frustumCulled = false;
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
  }

  _BuildSolver() {
    if (!this.mesh || !this.mesh.skeleton) return;
    const bones = this.mesh.skeleton.bones;
    const index = (name) => bones.findIndex((bone) => bone.name === name);
    const iks = [];
    for (const side of ["r", "l"]) {
      const target = index(`wrist_ik.${side}`);
      const effector = index(`wrist.${side}`);
      const forearm = index(`forearm.${side}`);
      const bicep = index(`bicep.${side}`);
      this.targets[side] = bones[target] || FindByName(this.root, `wrist_ik.${side}`);
      this.wrists[side] = bones[effector] || FindByName(this.root, `wrist.${side}`);
      if ([target, effector, forearm, bicep].every((value) => value >= 0)) {
        iks.push({ target, effector, links: [{ index: forearm }, { index: bicep }], iteration: 5 });
      }
    }
    if (iks.length) this.solver = new CCDIKSolver(this.mesh, iks);
  }

  Attach(rigGroup, handRight, handLeft, legacyHands) {
    this.Detach();
    this.hands = { r: handRight, l: handLeft };
    this.legacyMeshes = legacyHands.flatMap((hand) => hand.meshes || []);
    for (const mesh of this.legacyMeshes) mesh.visible = false;
    this.sprintFallback = false;
    this.root.visible = true;
    rigGroup.add(this.root);
    this.root.position.set(0, -0.075, 0.34);
    this.root.rotation.set(0, 0, 0);
    this.root.updateWorldMatrix(true, true);
    for (const side of ["r", "l"]) {
      const wrist = this.wrists[side];
      const hand = this.hands[side];
      if (!wrist || !hand) continue;
      const handQ = WorldQuaternion(hand, new THREE.Quaternion());
      const wristQ = WorldQuaternion(wrist, new THREE.Quaternion());
      this.calibration[side] = handQ.invert().multiply(wristQ);
    }
    this.Update(0);
  }

  /**
   * 冲刺姿态绕相机原点转整套 weaponMount。下载来的 WRAD 是“从肩到手”的完整手臂，
   * 肩在相机后方；跟着这层旋转时上臂必然扫过近平面，形成铺屏三角面。旧手模只有
   * 握把附近的手和短袖口，原本就是按这套相机姿态制作的，因此冲刺期间切回它。
   */
  SetSprintFallback(enabled) {
    const next = !!enabled;
    if (next === this.sprintFallback) return;
    this.sprintFallback = next;
    this.root.visible = !next;
    for (const mesh of this.legacyMeshes) mesh.visible = next;
  }

  Detach() {
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const mesh of this.legacyMeshes) mesh.visible = true;
    this.legacyMeshes.length = 0;
    this.hands = null;
    this.sprintFallback = false;
    this.root.visible = true;
  }

  _PlaceTarget(side) {
    const target = this.targets[side];
    const hand = this.hands && this.hands[side];
    if (!target || !target.parent || !hand) return;
    hand.getWorldPosition(this.tmpPosition);
    target.parent.worldToLocal(this.tmpPosition);
    target.position.copy(this.tmpPosition);
    target.updateMatrixWorld(true);
  }

  _OrientWrist(side) {
    const wrist = this.wrists[side];
    const hand = this.hands && this.hands[side];
    const calibration = this.calibration[side];
    if (!wrist || !wrist.parent || !hand || !calibration) return;
    hand.getWorldQuaternion(this.tmpQuaternion);
    this.tmpQuaternion.multiply(calibration);
    wrist.parent.getWorldQuaternion(this.tmpQuaternion2).invert();
    wrist.quaternion.copy(this.tmpQuaternion2.multiply(this.tmpQuaternion));
    wrist.updateMatrixWorld(true);
  }

  Update(dt) {
    if (!this.root.parent || !this.hands) return;
    if (this.mixer) this.mixer.update(Math.max(0, dt));
    this.root.updateWorldMatrix(true, true);
    this._PlaceTarget("r");
    this._PlaceTarget("l");
    if (this.solver) this.solver.update();
    this._OrientWrist("r");
    this._OrientWrist("l");
  }

  Dispose() {
    this.Detach();
    if (this.mixer) this.mixer.stopAllAction();
  }
}

const IJA_MAP = Object.freeze([
  ["Hips", "hips"],
  ["Torso", "chest"],
  ["Spine2", "chest"],
  ["Neck", "neck"],
  ["Head", "neck"],
  ["UpperArm.L", "armL"],
  ["LowerArm.L", "foreL"],
  ["UpperArm.R", "armR"],
  ["LowerArm.R", "foreR"],
  ["UpperLeg.L", "thighL"],
  ["LowerLeg.L", "shinL"],
  ["Foot.L", "footL"],
  ["UpperLeg.R", "thighR"],
  ["LowerLeg.R", "shinR"],
  ["Foot.R", "footR"],
  ["LeftArm", "armL"],
  ["LeftForeArm", "foreL"],
  ["RightArm", "armR"],
  ["RightForeArm", "foreR"],
  ["LeftUpLeg", "thighL"],
  ["LeftLeg", "shinL"],
  ["LeftFoot", "footL"],
  ["RightUpLeg", "thighR"],
  ["RightLeg", "shinR"],
  ["RightFoot", "footR"],
]);

function ActorSources(actor) {
  return {
    hips: actor.hips,
    chest: actor.chest,
    neck: actor.neck,
    armL: actor.arms.L.shoulder,
    foreL: actor.arms.L.elbow,
    armR: actor.arms.R.shoulder,
    foreR: actor.arms.R.elbow,
    thighL: actor.legs.L.thigh,
    shinL: actor.legs.L.knee,
    footL: actor.legs.L.ankle,
    thighR: actor.legs.R.thigh,
    shinR: actor.legs.R.knee,
    footR: actor.legs.R.ankle,
  };
}

/** Downloaded character mesh driven by the game's authoritative 13-joint rig. */
export class SegmentedCharacterSkin {
  constructor(gltf, actor) {
    this.actor = actor;
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "RiggedCharacter";
    this.root.userData.skipNormalDepth = true;
    this.sources = ActorSources(actor);
    this.links = [];
    this.directionLinks = [];
    this.legacyMeshes = [];
    this.tmpQ0 = new THREE.Quaternion();
    this.tmpQ1 = new THREE.Quaternion();
    this.tmpQ2 = new THREE.Quaternion();
    this.tmpPosition = new THREE.Vector3();
    this.segmentMeshes = [];
    this.mixer = null;
    this.sourceClip = null;
    this.sourceHand = null;
    this.attachedWeapon = null;

    const segmentTargets = {
      hips: actor.hips, chest: actor.chest, neck: actor.neck,
      armL: actor.arms.L.shoulder, foreL: actor.arms.L.elbow,
      armR: actor.arms.R.shoulder, foreR: actor.arms.R.elbow,
      thighL: actor.legs.L.thigh, shinL: actor.legs.L.knee, footL: actor.legs.L.ankle,
      thighR: actor.legs.R.thigh, shinR: actor.legs.R.knee, footR: actor.legs.R.ankle,
    };
    // 运行时仍使用 13 个刚体关节，兼容现有 normal-depth 预通道；关键区别是
    // 新分段由源 FBX 蒙皮权重和真实 rest bone 枢轴生成，不再按 XYZ 猜身体部位。
    const segments = [];
    const useRigidSegments = true;
    this.root.traverse((object) => {
      // 一个分段有多个源材质时，GLTFLoader 会把该节点实例化成 Group，再把每个
      // primitive 放成子 Mesh。只认 isMesh 会漏掉国军/百姓的全部 13 个根节点，
      // 随后误走 Humanoid 回退链，画面只剩一块黑网格。
      if (!object.name.startsWith("Segment_")) return;
      if (object.parent && object.parent.name.startsWith("Segment_")) return;
      if (useRigidSegments && (object.isMesh || object.isGroup)) segments.push(object);
    });
    if (segments.length) {
      this.segmentMode = true;
      for (const node of [actor.hips, actor.chest, actor.neck,
        actor.arms.L.shoulder, actor.arms.L.elbow, actor.arms.R.shoulder, actor.arms.R.elbow,
        actor.legs.L.thigh, actor.legs.L.knee, actor.legs.L.ankle,
        actor.legs.R.thigh, actor.legs.R.knee, actor.legs.R.ankle]) {
        for (const child of node.children) {
          if (child.isMesh) { child.visible = false; this.legacyMeshes.push(child); }
        }
      }
      this.root.updateMatrixWorld(true);
      actor.root.updateMatrixWorld(true);
      for (const mesh of segments) {
        const key = mesh.name.split("_")[1];
        const target = segmentTargets[key];
        if (!target) continue;
        // 构建脚本已把几何烘到目标关节枢轴；attach 保留 GLB 场景根的
        // Blender Z-up → Three.js Y-up 换轴。不能 add 后清零，否则换轴丢失，
        // 整个人会只剩一块落在地上的网格。旧版散架的根因是离线阶段按 XYZ
        // 猜分段与包围盒猜枢轴，本版已经改成源蒙皮权重 + 源 rest bone。
        target.attach(mesh);
        mesh.traverse((part) => {
          // These compatibility segments are ordinary rigid Meshes, not the
          // source SkinnedMesh that motivated the prepass exclusion. Let them
          // write normal/depth so fog, SSAO and soft particles use the soldier
          // surface instead of the terrain behind it.
          part.userData.skipNormalDepth = false;
          if (part.isMesh) {
            part.castShadow = true;
            part.receiveShadow = true;
            const materials = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of materials) {
              if (!material) continue;
              // All character atlases are fully opaque. Defend the runtime
              // contract even if a future GLB exporter reintroduces BLEND.
              material.transparent = false;
              material.opacity = 1;
              material.alphaTest = 0;
              material.depthTest = true;
              material.depthWrite = true;
              material.needsUpdate = true;
            }
          }
        });
        this.segmentMeshes.push(mesh);
      }
      return;
    }
    this.segmentMode = false;

    // 无兼容分段的旧资产才走原生 SkinnedMesh 回退。
    this.root.traverse((object) => {
      if (object.name.startsWith("Segment_")) object.visible = false;
    });

    actor.root.add(this.root);
    this.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.root);
    const height = Math.max(0.01, box.max.y - box.min.y);
    const scale = actor.dims.height / height;
    const centerX = (box.min.x + box.max.x) * 0.5;
    const centerZ = (box.min.z + box.max.z) * 0.5;
    this.root.scale.setScalar(scale);
    this.root.position.set(-centerX * scale, -box.min.y * scale, -centerZ * scale);
    // The FBX source looks toward glTF +Z; Taierzhuang actors look toward -Z.
    this.root.rotation.y = Math.PI;
    this.basePosition = this.root.position.clone();
    this.baseQuaternion = this.root.quaternion.clone();
    this.bodyRestPosition = actor.body.position.clone();
    this.bodyRestQuaternion = actor.body.quaternion.clone();
    this.hipsRestPosition = actor.hips.position.clone();

    const wantedClip = actor.kind === "civilian" ? "Idle"
      : (actor.kind.startsWith("ija") ? "AimRifle" : "Walk_Carry");
    this.sourceClip = gltf.animations.find((clip) => clip.name === wantedClip || clip.name.endsWith(`|${wantedClip}`))
      || gltf.animations.find((clip) => clip.name === "Idle" || clip.name.endsWith("|Idle")) || null;
    if (this.sourceClip) {
      this.mixer = new THREE.AnimationMixer(this.root);
      this.mixer.clipAction(this.sourceClip).play();
    }
    this.sourceHand = FindByName(this.root, "Fist.R") || FindByName(this.root, "RightHand");

    for (const node of [actor.hips, actor.chest, actor.neck,
      actor.arms.L.shoulder, actor.arms.L.elbow, actor.arms.R.shoulder, actor.arms.R.elbow,
      actor.legs.L.thigh, actor.legs.L.knee, actor.legs.L.ankle,
      actor.legs.R.thigh, actor.legs.R.knee, actor.legs.R.ankle]) {
      for (const child of node.children) {
        if (child.isMesh) { child.visible = false; this.legacyMeshes.push(child); }
      }
    }
    this.root.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = false;
      }
    });
    actor.root.updateWorldMatrix(true, true);
    for (const [targetName, sourceName] of IJA_MAP) {
      const target = FindByName(this.root, targetName);
      const source = this.sources[sourceName];
      if (!target || !source) continue;
      const directionTarget = {
        "UpperArm.L": "LowerArm.L", "LowerArm.L": "Fist.L",
        "UpperArm.R": "LowerArm.R", "LowerArm.R": "Fist.R",
        "UpperLeg.L": "LowerLeg.L", "LowerLeg.L": "Foot.L",
        "UpperLeg.R": "LowerLeg.R", "LowerLeg.R": "Foot.R",
        LeftArm: "LeftForeArm", LeftForeArm: "LeftHand",
        RightArm: "RightForeArm", RightForeArm: "RightHand",
        LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot",
        RightUpLeg: "RightLeg", RightLeg: "RightFoot",
      }[targetName];
      if (directionTarget) {
        const sourceChild = {
          "UpperArm.L": actor.arms.L.elbow, "UpperArm.R": actor.arms.R.elbow,
          "UpperLeg.L": actor.legs.L.knee, "UpperLeg.R": actor.legs.R.knee,
          "LowerLeg.L": actor.legs.L.ankle, "LowerLeg.R": actor.legs.R.ankle,
          LeftArm: actor.arms.L.elbow, RightArm: actor.arms.R.elbow,
          LeftUpLeg: actor.legs.L.knee, RightUpLeg: actor.legs.R.knee,
          LeftLeg: actor.legs.L.ankle, RightLeg: actor.legs.R.ankle,
        }[targetName] || null;
        const targetChild = FindByName(this.root, directionTarget);
        if (targetChild) this.directionLinks.push({ target, targetChild, source, sourceChild });
        continue;
      }
      const sourceRest = this._RelativeQuaternion(source, new THREE.Quaternion());
      const targetRest = this._RelativeQuaternion(target, new THREE.Quaternion());
      this.links.push({
        target,
        source,
        sourceRest,
        targetRest,
        targetRestPosition: target.position.clone(),
      });
    }
  }

  _RelativeQuaternion(object, target) {
    object.getWorldQuaternion(target);
    this.actor.root.getWorldQuaternion(this.tmpQ2).invert();
    return target.premultiply(this.tmpQ2);
  }

  _AlignDirection(link) {
    const sourceStart = link.source.getWorldPosition(new THREE.Vector3());
    let desired;
    if (link.sourceChild) {
      desired = link.sourceChild.getWorldPosition(new THREE.Vector3()).sub(sourceStart).normalize();
    } else {
      link.source.getWorldQuaternion(this.tmpQ0);
      desired = new THREE.Vector3(0, -1, 0).applyQuaternion(this.tmpQ0).normalize();
    }
    const targetStart = link.target.getWorldPosition(new THREE.Vector3());
    const current = link.targetChild.getWorldPosition(new THREE.Vector3()).sub(targetStart).normalize();
    if (current.lengthSq() < 1e-8 || desired.lengthSq() < 1e-8) return;
    const correction = new THREE.Quaternion().setFromUnitVectors(current, desired);
    link.target.getWorldQuaternion(this.tmpQ0);
    const desiredWorld = correction.multiply(this.tmpQ0);
    link.target.parent.getWorldQuaternion(this.tmpQ1).invert();
    link.target.quaternion.copy(this.tmpQ1.multiply(desiredWorld));
    link.target.updateWorldMatrix(true, true);
  }

  Update() {
    if (this.segmentMode) return;
    const actor = this.actor;
    this.root.position.copy(this.basePosition)
      .add(this.tmpPosition.copy(actor.body.position).sub(this.bodyRestPosition));
    this.root.quaternion.copy(actor.body.quaternion)
      .multiply(this.tmpQ0.copy(this.bodyRestQuaternion).invert())
      .multiply(this.baseQuaternion);
    if (this.mixer && this.sourceClip) {
      this.mixer.setTime(actor.time % Math.max(0.01, this.sourceClip.duration));
      this._UpdateWeapon();
      return;
    }
    actor.root.updateWorldMatrix(true, true);
    for (const link of this.links) {
      const current = this._RelativeQuaternion(link.source, this.tmpQ0);
      const delta = current.multiply(this.tmpQ1.copy(link.sourceRest).invert());
      const desired = this.tmpQ1.copy(delta).multiply(link.targetRest);
      if (link.target.parent) {
        const parent = this._RelativeQuaternion(link.target.parent, this.tmpQ0).invert();
        link.target.quaternion.copy(parent.multiply(desired));
      }
      if (link.target.name === "Hips") {
        link.target.position.copy(link.targetRestPosition)
          .add(this.tmpPosition.copy(actor.hips.position).sub(this.hipsRestPosition));
      }
      link.target.updateWorldMatrix(true, true);
    }
    for (const link of this.directionLinks) this._AlignDirection(link);
    this._UpdateWeapon();
  }

  _UpdateWeapon() {
    const weapon = this.actor.weaponGroup;
    if (!weapon || !this.sourceHand) return;
    if (weapon !== this.attachedWeapon) {
      this.actor.root.add(weapon);
      this.attachedWeapon = weapon;
    }
    this.root.updateWorldMatrix(true, true);
    this.sourceHand.getWorldPosition(this.tmpPosition);
    this.actor.root.worldToLocal(this.tmpPosition);
    weapon.position.copy(this.tmpPosition);
    // 枪械规范统一以 -Z 为枪口方向；人物 root 也以 -Z 为前方。
    // 不继承不同来源手骨的 roll，避免枪随 FBX 骨轴竖起来。
    weapon.quaternion.identity();
  }

  Dispose() {
    if (this.mixer) this.mixer.stopAllAction();
    for (const mesh of this.legacyMeshes) mesh.visible = true;
    for (const mesh of this.segmentMeshes) if (mesh.parent) mesh.parent.remove(mesh);
    this.segmentMeshes.length = 0;
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// 兼容旧调用名；新代码统一使用 SegmentedCharacterSkin。
export const IjaSoldierSkin = SegmentedCharacterSkin;
