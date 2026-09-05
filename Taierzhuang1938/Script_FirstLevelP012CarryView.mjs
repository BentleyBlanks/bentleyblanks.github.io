// P012 first-person stretcher hands. This view reads the original litter and
// carry state only: gameplay owns the load, its serial and every release.
// The torso faces the original litter in world space. Looking around never
// tilts the prop or pulls the hands off its handles.

import * as THREE from "three";
import { FpsArmRig } from "./Script_RiggedModel.mjs";
import { MergeGeometries } from "./Script_Geo.mjs";

export const P012_STRETCHER_GRIPS = Object.freeze({
  // +Z points from the rear bearer toward the front bearer; the rear bearer's
  // right hand is therefore on the prop's -X rail.
  right: Object.freeze([-0.29, 0.12, -1.0]),
  left: Object.freeze([0.29, 0.12, -1.0]),
  railSpacingM: 0.58,
  railLengthM: 2.15,
  gripHeightAbovePropM: 0.12,
  gripFromRearM: 0.075,
});

const ARM_ANCHOR_HEIGHT_M = 1.68;
const LIFT_SECONDS = 0.24;
const RELEASE_SECONDS = 0.18;
const LOAD_CROUCH = 0.12;

const Clamp01 = value => Math.max(0, Math.min(1, value));
const Smooth = value => value * value * (3 - 2 * value);

/** One brown-material geometry for the original P012 litter prop. */
export function CreateP012StretcherGeometry() {
  const bed = new THREE.BoxGeometry(0.58, 0.14, 1.85);
  const railRight = new THREE.BoxGeometry(0.065, 0.065, P012_STRETCHER_GRIPS.railLengthM);
  const railLeft = railRight.clone();
  railRight.translate(P012_STRETCHER_GRIPS.railSpacingM / 2, P012_STRETCHER_GRIPS.gripHeightAbovePropM, 0);
  railLeft.translate(-P012_STRETCHER_GRIPS.railSpacingM / 2, P012_STRETCHER_GRIPS.gripHeightAbovePropM, 0);
  // Crosspieces connect the raised rails to the bed. The grip centres sit
  // beyond the bed end, so the fingers close on handles rather than its edge.
  const crosspieces = [-.68, .68].map(z => new THREE.BoxGeometry(.65, .06, .065).translate(0, .075, z));
  const geometry = MergeGeometries([bed, railRight, railLeft, ...crosspieces]);
  geometry.name = "P012OriginalStretcherWithHandles";
  geometry.computeBoundingBox();
  return geometry;
}

function CarryView(value) {
  return value?.load?.kindId ? value.load : value;
}

function CarryKind(value) {
  const view = CarryView(value);
  return view?.kindId ?? view?.kind ?? view?.KindId ?? null;
}

function CarrySerial(value, fallback) {
  const view = CarryView(value);
  const serial = view?.serial ?? view?.load?.serial ?? fallback;
  return Number.isFinite(serial) ? serial : null;
}

// Weapon shoulders are authored for a camera model. World-space carrying uses
// the existing owner's actual shoulder bones, keeping the same IK solver.
class P012CarryArmRig extends FpsArmRig {
  _CurrentBody() {
    const body = super._CurrentBody();
    return this.bodyShoulders ? { ...body, shoulders: this.bodyShoulders } : body;
  }
}

/**
   * @param {{scene:THREE.Object3D, sourceRig:FpsArmRig, bodyRoot?:THREE.Object3D, camera?:THREE.Camera}} options
 * sourceRig supplies the already-loaded GLTF and its material library. A new
 * skeleton is cloned; the weapon rig remains owned by Viewmodel.
 */
export class FirstLevelP012CarryView {
  constructor({ scene, sourceRig, bodyRoot = null, camera = null } = {}) {
    if (!scene?.add || !sourceRig?.gltf) throw new Error("P012 CarryView requires scene and loaded FpsArmRig");
    this.scene = scene;
    this.camera = camera;
    this.anchor = new THREE.Group();
    this.anchor.name = "P012CarryArmWorldAnchor";
    this.handRight = new THREE.Object3D();
    this.handLeft = new THREE.Object3D();
    this.contactRight = new THREE.Object3D();
    this.contactLeft = new THREE.Object3D();
    this.anchor.add(this.handRight, this.handLeft, this.contactRight, this.contactLeft);
    scene.add(this.anchor);

    this.bodyShoulders = {};
    bodyRoot?.traverse(bone => {
      if (!bone.isBone) return;
      if (/_R_UpperArm$/i.test(bone.name)) this.bodyShoulders.right = bone;
      if (/_L_UpperArm$/i.test(bone.name)) this.bodyShoulders.left = bone;
    });
    this.rig = new P012CarryArmRig(sourceRig.gltf, sourceRig.materialLibrary);
    this.rig.Attach(this.anchor, this.handRight, this.handLeft,
      this.contactRight, this.contactLeft, [], null);
    this.rig.root.visible = false;

    this.litter = null;
    this.serial = null;
    this.weight = 0;
    this.releasing = false;
    this.disposed = false;
    this.lastWorldGrip = { right: new THREE.Vector3(), left: new THREE.Vector3() };
    this.lastWorldRotation = { right: new THREE.Quaternion(), left: new THREE.Quaternion() };
    this._world = new THREE.Vector3();
    this._yawQuaternion = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this.gripQuaternion = Object.fromEntries(["right", "left"].map(side => {
      const sign = side === "right" ? 1 : -1;
      // Grip +X follows the rail, +Y is the back of the hand, +Z fingers down.
      return [side, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, 0, sign), new THREE.Vector3(-sign, 0, 0), new THREE.Vector3(0, -1, 0)))];
    }));
  }

  /**
   * dt plus narrow production data. `carry` may be Carry.View(), State(), or
   * the load snapshot; `litter` is the existing stretcher Object3D.
   */
  Update(dt, { litter = null, player = null, carry = null,
    serial = null, alive = true, camera = this.camera } = {}) {
    if (this.disposed) return;
    if (alive === false) {
      this.weight = 0; this.rig.root.visible = false;
      this.litter = null; this.serial = null; this.releasing = false;
      return;
    }
    const seconds = Math.max(0, Math.min(0.05, Number(dt) || 0));
    const carryView = CarryView(carry);
    const active = CarryKind(carryView) === "stretcher" && !!litter && litter.visible !== false && !!player;
    const nextSerial = CarrySerial(carry, serial);
    if (active && (this.serial !== nextSerial || this.litter !== litter)) {
      this.serial = nextSerial;
      this.litter = litter;
      this.weight = 0;
      this.releasing = false;
    } else if (!active && this.weight > 0) {
      this.releasing = true;
    }

    const desiredWeight = active ? Clamp01(Number.isFinite(carryView?.t) ? carryView.t : 1) : 0;
    const rate = desiredWeight > this.weight ? 1 / LIFT_SECONDS : 1 / RELEASE_SECONDS;
    this.weight = Clamp01(this.weight + Math.sign(desiredWeight - this.weight)
      * Math.min(Math.abs(desiredWeight - this.weight), seconds * rate));
    this.releasing = desiredWeight < this.weight || carryView?.phase === "release" || (!active && this.weight > 0);
    if (!active && this.weight <= 0) {
      this.rig.root.visible = false;
      this.litter = null;
      this.serial = null;
      this.releasing = false;
      return;
    }

    const position = player?.position || player;
    if (!position || !this.litter) return;
    if (active && carryView?.phase !== "release") this.bodyYaw = this.litter.rotation.y + Math.PI;
    this.anchor.position.set(position.x, position.y + ARM_ANCHOR_HEIGHT_M, position.z);
    this.anchor.position.x += Math.sin(this.bodyYaw) * .18;
    this.anchor.position.z += Math.cos(this.bodyYaw) * .18;
    this.anchor.rotation.set(0, this.bodyYaw, 0);
    this.anchor.updateWorldMatrix(true, false);
    this.litter.updateWorldMatrix?.(true, false);
    if (this.bodyShoulders.right && this.bodyShoulders.left) {
      this.rig.bodyShoulders ||= { right: [0, 0, 0], left: [0, 0, 0] };
      for (const side of ["right", "left"]) {
        this.bodyShoulders[side].getWorldPosition(this._world);
        this.anchor.worldToLocal(this._world).toArray(this.rig.bodyShoulders[side]);
      }
    }

    // The open pose stays close to the torso. Contact targets are exact points
    // on the original prop; FpsArmRig reports rather than hides overreach.
    const shoulders = this.rig._CurrentBody().shoulders;
    for (const [side, hand, sign] of [["right", this.handRight, 1], ["left", this.handLeft, -1]]) {
      // Withdraw with the body when diving; a standing-height rest target
      // would otherwise pull the released hands above the falling player.
      hand.position.fromArray(shoulders[side]).add(this._world.set(sign * .02, -.30, -.12));
    }
    this._SetGrip(this.contactRight, P012_STRETCHER_GRIPS.right, "right", active && carryView?.phase !== "release");
    this._SetGrip(this.contactLeft, P012_STRETCHER_GRIPS.left, "left", active && carryView?.phase !== "release");
    this.handRight.quaternion.copy(this.contactRight.quaternion);
    this.handLeft.quaternion.copy(this.contactLeft.quaternion);

    const grip = Smooth(this.weight);
    this.rig.root.visible = true;
    this.rig.SetContactWeight("right", grip);
    this.rig.SetContactWeight("left", grip);
    this.rig.poseState.sprint = grip; // Existing unarmed finger curl closes around the rails.
    this.rig.Update(seconds);
    this.camera = camera || this.camera;
  }

  _SetGrip(target, localPoint, side, attached) {
    if (attached) {
      this.litter.localToWorld(this._world.fromArray(localPoint));
      this.lastWorldGrip[side].copy(this._world);
      this.litter.getWorldQuaternion(this.lastWorldRotation[side]);
    } else this._world.copy(this.lastWorldGrip[side]);
    target.position.copy(this.anchor.worldToLocal(this._world));
    this._yawQuaternion.setFromAxisAngle(this._up, this.anchor.rotation.y).invert();
    target.quaternion.copy(this._yawQuaternion).multiply(this.lastWorldRotation[side]).multiply(this.gripQuaternion[side]);
  }

  // A small knee/hip flex supports the low handles. Blend the existing body
  // pose with the load, leaving camera clearance, feet and collision unchanged.
  get BodyCrouch() { return LOAD_CROUCH * Smooth(this.weight); }

  Debug() {
    return {
      visible: !!this.rig?.root.visible,
      serial: this.serial,
      litterId: this.litter?.name?.replace(/^Setpiece_/, "") ?? null,
      bodyYaw: this.bodyYaw ?? null,
      gripWeight: +this.weight.toFixed(4),
      releasing: this.releasing,
      reachable: { ...this.rig.reachable },
      reachRatio: { ...this.rig.reachRatio },
      gripError: { ...this.rig.gripError },
      handTranslation: { ...this.rig.handTranslation },
      worldGrip: {
        right: this.lastWorldGrip.right.toArray(),
        left: this.lastWorldGrip.left.toArray(),
      },
    };
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const skeletons = new Set();
    this.rig?.root.traverse(object => { if (object.isSkinnedMesh) skeletons.add(object.skeleton); });
    this.rig?.Dispose();
    // Skeletons belong to this clone; geometry, materials and image textures
    // remain shared with the already-loaded weapon arms.
    for (const skeleton of skeletons) skeleton.dispose();
    this.anchor?.removeFromParent();
    this.litter = null;
  }
}
