// 远距日军机群：纯渲染层，不登记碰撞体、不参与索敌或伤害。
// 资源在后台载入；任何一个模型失败都只略过该机，不得卡住关卡启动。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { AIRCRAFT_ASSETS } from "./Data_AircraftAssets.mjs";

const LOADER = new GLTFLoader();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

function PrepareAircraft(gltf, spec) {
  const root = new THREE.Group();
  root.name = `Aircraft_${spec.id}`;
  const model = gltf.scene;
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = true;
  });

  // 源模型的原点各不相同；把模型重心收回编队根节点，航迹的高度才稳定。
  _box.setFromObject(model);
  _box.getCenter(_center);
  _box.getSize(_size);
  model.position.sub(_center);
  model.scale.setScalar(spec.scale);
  root.add(model);
  root.userData.wingspan = _size.x * spec.scale;
  return root;
}

function DisposeObject(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material ?? {})) {
        if (value?.isTexture) value.dispose();
      }
      material?.dispose();
    }
  });
}

/**
 * 天空中的机队。路径围绕当前关卡中心，故换关后不可能遗留在上关两公里外。
 */
export class AircraftFlight {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = "AircraftFlight";
    scene.add(this.group);
    this.forms = [];
    this.phase = null;
    this.anchor = new THREE.Vector2();
  }

  async Load() {
    const settled = await Promise.allSettled(AIRCRAFT_ASSETS.map(async (spec) => {
      const gltf = await LOADER.loadAsync(spec.url);
      const root = PrepareAircraft(gltf, spec);
      this.group.add(root);
      this.forms.push({ spec, root });
    }));
    return settled.filter((entry) => entry.status === "fulfilled").length;
  }

  SetPhase(phase) {
    this.phase = phase;
    this.anchor.set(
      (phase.bounds.minX + phase.bounds.maxX) * 0.5,
      (phase.bounds.minZ + phase.bounds.maxZ) * 0.5,
    );
  }

  Update(elapsed) {
    if (!this.phase) return;
    for (const { spec, root } of this.forms) {
      const angle = elapsed * spec.speed + spec.phaseOffset;
      const radiusX = spec.orbitRadius;
      const radiusZ = spec.orbitRadius * 0.62;
      const x = this.anchor.x + Math.cos(angle) * radiusX;
      const z = this.anchor.y + Math.sin(angle) * radiusZ;
      const dx = -Math.sin(angle) * radiusX;
      const dz = Math.cos(angle) * radiusZ;
      root.position.set(x, spec.altitude + Math.sin(angle * 2.0) * 7, z);
      // glTF 飞机的机首朝 -Z；依路径切线转向，再给一点克制的滚转。
      root.rotation.set(0, Math.atan2(-dx, -dz), Math.cos(angle) * spec.bank, "YXZ");
    }
  }

  Dispose() {
    for (const { root } of this.forms) DisposeObject(root);
    this.group.removeFromParent();
    this.forms.length = 0;
  }
}
