// Owner-only jacket, legs and feet, authored in Animation_FirstPerson.blend.
// World-space body follows feet/yaw, never camera pitch or weapon FOV compression.
import * as THREE from "three";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";

export class FirstPersonBody {
  constructor(gltf, library) {
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "FirstPersonBody";
    this.root.scale.setScalar(1.68 / 1.814391);
    this.root.visible = false;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip).play();
      action.setEffectiveWeight(0);
      this.actions[clip.name.replace(/^FirstPerson/, "")] = action;
    }
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      node.castShadow = false;
      node.receiveShadow = true;
      node.userData.firstPersonBody = true;
      node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
      library?.ConfigureExternalPbr?.(node.material, {metalness: 0, minRoughness: 0.78});
    });
  }

  Update(dt, input, camera, visible) {
    if (!input.playerPosition || !camera?.parent) return;
    if (this.root.parent !== camera.parent) camera.parent.add(this.root);
    this.root.visible = visible && input.alive !== false;
    this.root.position.copy(input.playerPosition);
    // Eyes sit ahead of the collar: a cropped torso centered on the optical
    // origin exposes its hollow neckline instead of the jacket and boots.
    const eyeLead = 0.18 + THREE.MathUtils.clamp(input.prone || 0, 0, 1) * 0.65;
    this.root.position.x += Math.sin(input.playerYaw || 0) * eyeLead;
    this.root.position.z += Math.cos(input.playerYaw || 0) * eyeLead;
    this.root.rotation.set(0, (input.playerYaw || 0) + Math.PI, 0);
    const prone = THREE.MathUtils.clamp(input.prone || 0, 0, 1);
    const crouch = THREE.MathUtils.clamp(input.crouch || 0, 0, 1 - prone);
    const movement = THREE.MathUtils.clamp(input.moveSpeed || 0, 0, 1) * (input.grounded === false ? 0 : 1);
    const stand = 1 - prone - crouch;
    const run = THREE.MathUtils.clamp(input.sprint || 0, 0, 1);
    const weights = {Idle:stand*(1-movement), Walk:stand*movement*(1-run), Run:stand*movement*run, Crouch:crouch, Prone:prone};
    for (const [name, action] of Object.entries(this.actions)) {
      action.setEffectiveWeight(weights[name] || 0);
      action.setEffectiveTimeScale(name === "Run" ? 1.6 : name === "Walk" ? 1.1 : 1);
    }
    this.mixer.update(dt);
    this.root.updateWorldMatrix(true, true);
  }

  Dispose() {
    this.root.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    });
  }
}
