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
  ijaSoldier: "./Model/Model_IjaSoldier.glb?v=1",
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
    const [fpsArms, ijaSoldier] = await Promise.all([LoadOne("fpsArms"), LoadOne("ijaSoldier")]);
    const report = { fpsArms: Inspect(fpsArms), ijaSoldier: Inspect(ijaSoldier) };
    return { fpsArms, ijaSoldier, report };
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
    this.tmpPosition = new THREE.Vector3();
    this.tmpQuaternion = new THREE.Quaternion();
    this.tmpQuaternion2 = new THREE.Quaternion();
    this._BuildSolver();
    this.root.traverse((object) => {
      if (object.isMesh) {
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

  Detach() {
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const mesh of this.legacyMeshes) mesh.visible = true;
    this.legacyMeshes.length = 0;
    this.hands = null;
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

/** Imported IJA skin driven by world-space deltas from the old 13-joint rig. */
export class IjaSoldierSkin {
  constructor(gltf, actor) {
    this.actor = actor;
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "RiggedIjaSoldier";
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

    const segmentTargets = {
      hips: actor.hips, chest: actor.chest, neck: actor.neck,
      armL: actor.arms.L.shoulder, foreL: actor.arms.L.elbow,
      armR: actor.arms.R.shoulder, foreR: actor.arms.R.elbow,
      thighL: actor.legs.L.thigh, shinL: actor.legs.L.knee, footL: actor.legs.L.ankle,
      thighR: actor.legs.R.thigh, shinR: actor.legs.R.knee, footR: actor.legs.R.ankle,
    };
    const segments = [];
    this.root.traverse((object) => {
      if (object.isMesh && object.name.startsWith("Segment_")) segments.push(object);
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
        // attach 保留 GLB 的世界位姿；离线脚本把每个 node 的原点就烘在旧关节
        // 枢轴上，所以换父节点后它的局部位姿应接近恒等。直接 add+清零会丢掉
        // glTF 的 Z-up→Y-up 根变换，整个人会像拆开的玩具一样散在地上。
        target.attach(mesh);
        mesh.userData.skipNormalDepth = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.segmentMeshes.push(mesh);
      }
      return;
    }
    this.segmentMode = false;

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
      }[targetName];
      if (directionTarget) {
        const sourceChild = {
          "UpperArm.L": actor.arms.L.elbow, "UpperArm.R": actor.arms.R.elbow,
          "UpperLeg.L": actor.legs.L.knee, "UpperLeg.R": actor.legs.R.knee,
          "LowerLeg.L": actor.legs.L.ankle, "LowerLeg.R": actor.legs.R.ankle,
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
  }

  Dispose() {
    for (const mesh of this.legacyMeshes) mesh.visible = true;
    for (const mesh of this.segmentMeshes) if (mesh.parent) mesh.parent.remove(mesh);
    this.segmentMeshes.length = 0;
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
