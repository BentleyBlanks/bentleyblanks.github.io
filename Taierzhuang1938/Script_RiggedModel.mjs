// 第一人称国军模型 01 手臂桥。
//
// Model_FpsArmsNra01.glb 已在国军 01 自己的 RifleIdle 姿态上应用原蒙皮，只留下
// 左右手掌和完整十指，再把两只手分别转到 Viewmodel 既有的握持坐标系
// （+X 握持轴、−Y 掌心、+Z 指向）。运行时把两个模型节点贴到 handRight / handLeft
// 动画靶：拉栓、换弹、冲刺和近战沿用既有时序，不再把另一套骨架强塞进旧 IK。
// GLB 读取失败时才退回程序化手，保证启动不被美术资产卡死。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";

const URLS = Object.freeze({ fpsArms: "./Model/Model_FpsArmsNra01.glb" });
const MODEL_SCALE = 0.58;
const GRIP_CENTER_Z = 0.075;
const LOADER = new GLTFLoader();
let loadPromise = null;

function LoadOne(key) {
  return LOADER.loadAsync(URLS[key]).catch((error) => {
    console.warn(`[RiggedModel] ${key} 读取失败，退回程序化模型：${String(error).slice(0, 180)}`);
    return null;
  });
}

function Inspect(gltf) {
  if (!gltf) return { meshes: 0, textures: 0, animations: [] };
  let meshes = 0;
  const textures = new Set();
  gltf.scene.traverse((object) => {
    if (object.isMesh) meshes += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material?.map) textures.add(material.map);
  });
  return { meshes, textures: textures.size, animations: gltf.animations.map((clip) => clip.name) };
}

export async function LoadRiggedAssets() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const fpsArms = await LoadOne("fpsArms");
    return { fpsArms, report: { fpsArms: Inspect(fpsArms) } };
  })();
  return loadPromise;
}

function FindByName(root, name) {
  let found = null;
  root.traverse((object) => { if (!found && object.name === name) found = object; });
  return found;
}

/** NRA model 01 hand meshes driven by the existing weapon-specific hand targets. */
export class FpsArmRig {
  constructor(gltf) {
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "Nra01FpsHands";
    this.root.userData.skipNormalDepth = true;
    this.modelHands = {
      r: FindByName(this.root, "HandRight"),
      l: FindByName(this.root, "HandLeft"),
    };
    this.report = {
      chains: Number(!!this.modelHands.r) + Number(!!this.modelHands.l),
      missing: Object.entries(this.modelHands).filter(([, hand]) => !hand).map(([side]) => `Hand${side}`),
      source: "LugouNra01",
    };
    if (this.report.missing.length) {
      throw new Error(`国军 01 第一人称手节点缺失：${this.report.missing.join(", ")}`);
    }
    this.targets = null;
    this.legacyMeshes = [];
    this.anchor = null;
    this.tmpPosition = new THREE.Vector3();
    this.tmpQuaternion = new THREE.Quaternion();
    this.tmpQuaternion2 = new THREE.Quaternion();
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
          material.envMapIntensity = 0.4;
          material.roughness = Math.max(material.roughness, 0.85);
        }
        material.needsUpdate = true;
      }
    });
  }

  Attach(anchor, handRight, handLeft, legacyHands) {
    this.Detach();
    this.anchor = anchor;
    this.targets = { r: handRight, l: handLeft };
    this.legacyMeshes = legacyHands.flatMap((hand) => hand.meshes || []);
    // 只替换旧手；它那两条按肘点对准腕点的军装袖继续负责接入画面下沿。
    // 国军 01 成品里 Hand 权重覆盖手掌/十指与腕口，正好盖住程序化袖的末端。
    for (const mesh of this.legacyMeshes) mesh.visible = mesh.name.startsWith("Sleeve");
    anchor.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.root.visible = true;
    this.Update();
  }

  _Place(side) {
    const model = this.modelHands[side];
    const target = this.targets?.[side];
    if (!model || !target || !this.anchor) return;
    this.root.updateWorldMatrix(true, false);
    model.position.copy(this.root.worldToLocal(target.getWorldPosition(this.tmpPosition)));
    const inverseRoot = this.root.getWorldQuaternion(this.tmpQuaternion).invert();
    model.quaternion.copy(inverseRoot.multiply(target.getWorldQuaternion(this.tmpQuaternion2)));
    model.scale.setScalar(MODEL_SCALE);
    model.position.add(this.tmpPosition.set(0, 0, GRIP_CENTER_Z * MODEL_SCALE)
      .applyQuaternion(model.quaternion));
    model.updateMatrixWorld(true);
  }

  SetSprintFallback() {
    // 冲刺也只画国军 01；绝不闪回旧的程序化木头手。
    this.root.visible = true;
    for (const mesh of this.legacyMeshes) mesh.visible = mesh.name.startsWith("Sleeve");
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
    this.anchor.updateWorldMatrix(true, true);
    this._Place("r");
    this._Place("l");
  }

  Dispose() {
    this.Detach();
  }
}
