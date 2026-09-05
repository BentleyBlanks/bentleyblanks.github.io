// Anatomical frames captured from the NRA01-derived FPS bind skeleton.
// All IK lives in the arm anchor, before viewmodel FOV/depth compression.
import * as THREE from "three";

export function FrameQuaternion(direction, normal) {
  const z = direction.clone().normalize();
  if (z.lengthSq() < 1e-10) z.set(0,0,-1);
  const y = normal.clone().addScaledVector(z, -normal.dot(z));
  if (y.lengthSq() < 1e-10) {
    y.set(Math.abs(z.y) > 0.85 ? 1 : 0, Math.abs(z.y) > 0.85 ? 0 : 1, 0);
    y.addScaledVector(z,-y.dot(z));
  }
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  y.crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).normalize();
}

export function CaptureAnatomy(rig) {
  rig._Restore(rig.bindPose);
  rig.root.updateWorldMatrix(true, true);
  rig.anatomy = {};
  for (const side of ["r", "l"]) {
    const chain = rig.bones[side];
    const point = (bone) => bone.getWorldPosition(new THREE.Vector3());
    const hand = point(chain.hand);
    const index = point(rig._FingerRoot(side, 1));
    const little = point(rig._FingerRoot(side, 4));
    const middle = point(rig._FingerRoot(side, 2));
    const forward = middle.clone().sub(hand).normalize();
    const across = side === "r" ? index.clone().sub(little) : little.clone().sub(index);
    const dorsal = new THREE.Vector3().crossVectors(forward, across).normalize();
    const handInverse = chain.hand.getWorldQuaternion(new THREE.Quaternion()).invert();
    const frameWorld = FrameQuaternion(forward, dorsal);
    // Contact is inside the palm, below the metacarpals; it does not move when
    // the trigger finger flexes, unlike the old curled-joint centroid.
    const center = index.clone().add(little).multiplyScalar(0.5)
      .addScaledVector(dorsal, -0.018).addScaledVector(forward, 0.009);
    const frame = {position: chain.hand.worldToLocal(center), quaternion: handInverse.clone().multiply(frameWorld)};
    const bones = {};
    for (const [role, child] of [["upperArm", chain.forearm], ["forearm", chain.hand]]) {
      const bone = chain[role];
      const inverse = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      bones[role] = FrameQuaternion(point(child).sub(point(bone)).normalize().applyQuaternion(inverse),
        dorsal.clone().applyQuaternion(inverse)).invert();
    }
    const curls = [];
    for (const bone of rig.fingerBones[side]) {
      const child = bone.children.find((item) => item.isBone);
      const direction = child ? point(child).sub(point(bone)).normalize()
        : point(bone).sub(point(bone.parent)).normalize();
      const axis = new THREE.Vector3().crossVectors(direction, dorsal.clone().negate()).normalize()
        .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
      curls.push({bone, axis, rest: bone.quaternion.clone(), direction: direction.clone().applyQuaternion(handInverse)});
    }
    rig.anatomy[side] = {frame, bones, curls};
  }
}

export function ApplyAnatomicalFingers(rig) {
  for (const side of ["r", "l"]) {
    const contact = rig.poseSpec?.contacts?.[side === "r" ? "right" : "left"];
    const firearm = !rig.unarmed && ["boltRifle","lmg","pistol"].includes(rig.poseSpec?.family);
    for (const {bone, axis, rest, direction} of rig.anatomy[side].curls) {
      const match = bone.name.match(/finger(\d)(\d)?$/i);
      if (!match) continue;
      const finger = Number(match[1]); const segment = Number(match[2] || 0);
      const curl = rig.unarmed ? [55, 76, 40].map((value,index)=>THREE.MathUtils.lerp([18,28,18][index],value,rig.poseState.sprint)) : side === "r" && finger === 1
        ? [14, 28, 20] : (contact?.curl || [56, 74, 46]);
      // Thumb opposition comes from its CMC joint, independently of the four
      // finger hinges. Keep it along the grip instead of crossing the slide.
      if ((firearm || rig.unarmed) && finger === 0 && segment === 0) {
        const target = new THREE.Vector3(0,rig.unarmed ? -0.50 : -0.28,1).normalize().applyQuaternion(rig.anatomy[side].frame.quaternion);
        bone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(direction,target).multiply(rest));
        continue;
      }
      const degrees = finger === 0 ? (rig.unarmed ? (segment === 1 ? 32 : 22) : firearm ? (segment === 1 ? 12 : 8) : 28) : curl[segment];
      bone.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, degrees * Math.PI / 180));
    }
  }
}

export function AimAnatomicalBone(rig, side, role, target, normal) {
  const bone = rig.bones[side][role];
  const origin = rig._InAnchor(bone, new THREE.Vector3());
  const desired = FrameQuaternion(target.clone().sub(origin), normal)
    .multiply(rig.anatomy[side].bones[role]);
  const parent = rig._InAnchorBasisQuaternion(bone.parent, new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(desired));
  bone.updateMatrixWorld(true);
}
