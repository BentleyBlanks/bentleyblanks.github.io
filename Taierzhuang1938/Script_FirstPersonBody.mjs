// Owner-only jacket, legs and feet, authored in Animation_FirstPerson.blend.
// World-space body follows feet/yaw, never camera pitch or weapon FOV compression.
//
// 2026-10-22：下半身改成 3A 第一人称全身的做法（规划在 Script_FirstPersonGait，数值在
// Data_Tuning_FirstPersonBody）：根节点朝胯的朝向 lowerYaw，上身两节脊柱拧回视线（站着转视角腿不动），
// 两条腿每帧用两节骨骼 IK 接到规划器锁在世界里的脚上（走路脚不滑、蹲着走也迈步）。
// 片段只管上身和姿态高度：烘出来的 Walk / Run 腿是倒着迈的、一步 0.3 m，只够 0.6 m/s，腿部全被 IK 盖掉。
import * as THREE from "three";
import { ApplyNraUniform } from "./Script_UniformColors.mjs";
import { TagCharacterSurface } from "./Script_CharacterSurface.mjs";
import { CloneSkinnedRig } from "./Script_SkinnedClone.mjs";
import { FirstPersonGait } from "./Script_FirstPersonGait.mjs";
import { FIRST_PERSON_BODY } from "./Data_Tuning_FirstPersonBody.mjs";

const UP = new THREE.Vector3(0, 1, 0);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _vd = new THREE.Vector3();
const _hip = new THREE.Vector3(), _knee = new THREE.Vector3(), _ankle = new THREE.Vector3(), _target = new THREE.Vector3();
const _pole = new THREE.Vector3(), _axis = new THREE.Vector3();
const _delta = new THREE.Quaternion(), _footQ = new THREE.Quaternion();
const _targets = [new THREE.Vector3(), new THREE.Vector3()], _lengths = [0, 0];

function Frac(v) { return v - Math.floor(v); }

// 世界空间里给骨骼左乘一个旋转（delta 是世界系），并刷新它和子骨骼的世界矩阵。
function RotateBoneWorld(bone, delta) {
  bone.getWorldQuaternion(_qa);
  _qb.copy(delta).multiply(_qa);
  bone.parent.getWorldQuaternion(_qc).invert();
  bone.quaternion.copy(_qc.multiply(_qb));
  bone.updateWorldMatrix(false, true);
}

function SetBoneWorldQuaternion(bone, world, weight) {
  bone.parent.getWorldQuaternion(_qc).invert();
  _qd.copy(_qc).multiply(world);
  if (weight >= 1) bone.quaternion.copy(_qd);
  else bone.quaternion.slerp(_qd, weight);
  bone.updateWorldMatrix(false, true);
}

function FindBone(root, pattern) {
  let found = null;
  root.traverse((node) => { if (!found && node.isBone && pattern.test(node.name)) found = node; });
  return found;
}

export class FirstPersonBody {
  constructor(gltf, library) {
    this.root = CloneSkinnedRig(gltf.scene);
    this.root.name = "FirstPersonBody";
    this.root.userData.whiteboxCharacter = true;
    this.root.scale.setScalar(1.68 / 1.814391);
    this.root.visible = false;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip).play();
      action.setEffectiveWeight(0);
      this.actions[clip.name.replace(/^FirstPerson/, "")] = action;
    }
    // 人物表面部件（泥污 / 磨损，Script_CharacterSurface）：打在共用源材质上，下面逐件 clone 会带过去。
    TagCharacterSurface(this.root, "FirstPersonBody");
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      node.castShadow = false;
      node.receiveShadow = true;
      node.userData.firstPersonBody = true;
      node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
      library?.ConfigureExternalPbr?.(node.material, {metalness: 0, minRoughness: 0.78, mesh: node});
    });
    ApplyNraUniform(this.root);
    this._SetupLegs();
  }

  // 量一次站姿：两脚站位（模型系）、踝高、脚掌相对根节点的朝向，蹲姿里膝盖的铰链轴（骨骼局部）。
  _SetupLegs() {
    const bones = {
      pelvis: FindBone(this.root, /Pelvis$/),
      spine1: FindBone(this.root, /Spine1$/),
      spine2: FindBone(this.root, /Spine2$/),
      legs: ["L", "R"].map((side) => ({
        thigh: FindBone(this.root, new RegExp(`_${side}_Thigh$`)),
        calf: FindBone(this.root, new RegExp(`_${side}_Calf$`)),
        foot: FindBone(this.root, new RegExp(`_${side}_Foot$`)),
      })),
    };
    const ok = bones.pelvis && bones.spine1 && bones.spine2 && this.actions.Idle && this.actions.Crouch
      && bones.legs.every((l) => l.thigh && l.calf && l.foot);
    if (!ok) { this.legs = null; return; }
    const pose = (name) => {
      for (const [key, action] of Object.entries(this.actions)) action.setEffectiveWeight(key === name ? 1 : 0);
      this.mixer.setTime(0);
      this.root.updateWorldMatrix(true, true);
    };
    const savedScale = this.root.scale.x;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    pose("Idle");
    const feet = [], restQ = [];
    let ankleHeight = 0;
    for (const leg of bones.legs) {
      const p = leg.foot.getWorldPosition(new THREE.Vector3());
      feet.push({ x: p.x, z: p.z });
      ankleHeight += p.y / 2;
      restQ.push(leg.foot.getWorldQuaternion(new THREE.Quaternion()));
    }
    pose("Crouch");
    const hinge = bones.legs.map((leg) => {
      leg.thigh.getWorldPosition(_hip); leg.calf.getWorldPosition(_knee); leg.foot.getWorldPosition(_ankle);
      const n = _va.subVectors(_hip, _knee).cross(_vb.subVectors(_ankle, _knee)).normalize();
      return n.applyQuaternion(leg.calf.getWorldQuaternion(_qa).invert()).clone();
    });
    for (const action of Object.values(this.actions)) action.setEffectiveWeight(0);
    this.root.scale.setScalar(savedScale);
    this.legs = { bones, restQ, hinge, ankleHeight };
    this.gait = new FirstPersonGait(FIRST_PERSON_BODY, { feet });
    this.pelvisDrop = 0;
  }

  Update(dt, input, camera, visible) {
    if (!input.playerPosition || !camera?.parent) return;
    if (this.root.parent !== camera.parent) camera.parent.add(this.root);
    this.root.visible = visible && input.alive !== false;
    this.root.position.copy(input.playerPosition);
    const prone = THREE.MathUtils.clamp(input.prone || 0, 0, 1);
    const crouch = THREE.MathUtils.clamp(input.crouch || 0, 0, 1 - prone);
    // Looking down pivots around the eyes, so give the cropped jacket room
    // behind them instead of looking through its open collar. Crouching lowers
    // the camera farther than the baked torso and needs extra clearance even
    // before looking down. Move only the owner's visual body, not the camera
    // or collision capsule; keep the feet at their authored ground height.
    // The offset follows the view yaw: the torso is twisted back onto the view
    // below, so the collar sits where it always did; the legs reach the feet by IK.
    const aimYaw = input.playerYaw || 0;
    const lookDown = THREE.MathUtils.smoothstep(-camera.rotation.x, 0.55, 1.25);
    const eyeLead = 0.18 + crouch * 0.06 + prone * 0.65 + lookDown * 0.12 * (1 - prone);
    this.root.position.x += Math.sin(aimYaw) * eyeLead;
    this.root.position.z += Math.cos(aimYaw) * eyeLead;
    const gait = this.gait;
    if (gait) {
      gait.Update(dt, {
        playerX: input.playerPosition.x, playerY: input.playerPosition.y, playerZ: input.playerPosition.z,
        anchorX: this.root.position.x, anchorZ: this.root.position.z, aimYaw,
        grounded: input.grounded !== false, crouch, prone, groundAt: input.bodyGroundAt || null,
      });
    }
    this.root.rotation.set(0, (gait ? gait.lowerYaw : aimYaw) + Math.PI, 0);
    const movement = THREE.MathUtils.clamp(input.moveSpeed || 0, 0, 1) * (input.grounded === false ? 0 : 1);
    const stand = 1 - prone - crouch;
    const run = THREE.MathUtils.clamp(input.sprint || 0, 0, 1);
    const weights = {Idle:stand*(1-movement), Walk:stand*movement*(1-run), Run:stand*movement*run, Crouch:crouch, Prone:prone};
    for (const [name, action] of Object.entries(this.actions)) {
      action.setEffectiveWeight(weights[name] || 0);
      if (gait && (name === "Walk" || name === "Run")) {
        // 上身起伏跟着步子走（距离匹配）：片段在 0.25 / 0.75 处骨盆最低，对上两只脚各自落地的那一刻。
        action.setEffectiveTimeScale(0);
        action.time = Frac(gait.phase + 0.25) * action.getClip().duration;
      } else action.setEffectiveTimeScale(name === "Run" ? 1.6 : name === "Walk" ? 1.1 : 1);
    }
    this.mixer.update(dt);
    this.root.updateWorldMatrix(true, true);
    if (gait && this.legs) this._ApplyLowerBody(dt, prone);
  }

  _ApplyLowerBody(dt, prone) {
    const t = FIRST_PERSON_BODY, gait = this.gait, { bones, restQ, hinge, ankleHeight } = this.legs;
    const weight = 1 - THREE.MathUtils.smoothstep(prone, 0, 0.6);
    // 1) 上身拧回视线：只动 Spine1 / Spine2（两条腿挂在 Spine 下，动 Spine 会把胯一起拧走）。
    if (Math.abs(gait.twist) > 1e-4) {
      RotateBoneWorld(bones.spine1, _delta.setFromAxisAngle(UP, gait.twist * t.twistSpine1));
      RotateBoneWorld(bones.spine2, _delta.setFromAxisAngle(UP, gait.twist * t.twistSpine2));
    }
    if (weight <= 0) return;
    // 2) 每只脚的踝目标；够不着就先降胯（Pelvis IK），还不够就踮后脚跟。
    const targets = _targets, lengths = _lengths;
    let need = 0;
    for (let i = 0; i < 2; i++) {
      const leg = bones.legs[i], f = gait.feet[i];
      leg.thigh.getWorldPosition(_hip); leg.calf.getWorldPosition(_knee); leg.foot.getWorldPosition(_ankle);
      const length = (_hip.distanceTo(_knee) + _knee.distanceTo(_ankle)) * t.reachFraction;
      lengths[i] = length;
      const target = targets[i].set(f.x, f.y + ankleHeight + f.lift, f.z);
      const horiz = Math.hypot(target.x - _hip.x, target.z - _hip.z);
      const reachY = horiz < length ? Math.sqrt(length * length - horiz * horiz) : 0;
      need = Math.max(need, _hip.y - target.y - reachY);
    }
    need = THREE.MathUtils.clamp(need, 0, t.maxPelvisDropM) * weight;
    this.pelvisDrop = need >= this.pelvisDrop || !(dt > 0) ? need
      : this.pelvisDrop + (need - this.pelvisDrop) * (1 - Math.exp(-dt * t.pelvisRecoverRate));
    if (this.pelvisDrop > 1e-4) {
      const pelvis = bones.pelvis;
      pelvis.getWorldPosition(_va);
      _va.y -= this.pelvisDrop;
      pelvis.position.copy(pelvis.parent.worldToLocal(_va));
      pelvis.updateWorldMatrix(false, true);
    }
    // 3) 两节骨骼 IK：膝盖弯到够得着的角度 → 整条腿对准目标 → 绕腿轴把膝盖转向脚尖方向；最后摆脚掌。
    for (let i = 0; i < 2; i++) {
      const leg = bones.legs[i], f = gait.feet[i], length = lengths[i];
      leg.thigh.getWorldPosition(_hip);
      leg.foot.getWorldPosition(_ankle);
      _target.copy(targets[i]);
      const forward = _vd.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
      let pitch = 0;
      const horiz = Math.hypot(_target.x - _hip.x, _target.z - _hip.z);
      const reachY = horiz < length ? Math.sqrt(length * length - horiz * horiz) : 0;
      const short = _hip.y - _target.y - reachY;
      if (short > 0 && f.planted) {
        const lift = Math.min(short, t.maxHeelLiftM);
        _target.y += lift;
        const behind = (_target.x - _hip.x) * forward.x + (_target.z - _hip.z) * forward.z < 0;
        const angle = Math.asin(Math.min(1, lift / t.footLengthM));
        pitch = behind ? angle : -0.5 * angle;   // 后脚踮脚跟、前脚翘脚尖（脚跟先着地）
      }
      if (f.swing) {
        const u = Math.min(f.swing.u, 1);
        pitch += 0.32 * Math.sin(Math.PI * u) * (1 - 2 * u);   // 抬脚时脚尖朝下，落脚前脚尖翘起
      }
      _target.lerp(_ankle, 1 - weight);
      this._SolveLeg(leg, hinge[i], _target, forward, i);
      // 脚掌：站姿里的朝向绕竖轴转到这只脚的偏航，再绕脚的左右轴俯仰。
      _qb.setFromAxisAngle(UP, f.yaw + Math.PI).multiply(restQ[i]);
      _qa.setFromAxisAngle(_axis.set(-Math.cos(f.yaw), 0, Math.sin(f.yaw)), pitch);
      const parentQ = this.root.parent ? this.root.parent.getWorldQuaternion(_qc) : _qc.identity();
      _footQ.copy(parentQ).multiply(_qa.multiply(_qb));
      SetBoneWorldQuaternion(leg.foot, _footQ, weight);
    }
  }

  _SolveLeg(leg, hingeLocal, target, forward, side) {
    leg.thigh.getWorldPosition(_hip); leg.calf.getWorldPosition(_knee); leg.foot.getWorldPosition(_ankle);
    const l1 = _hip.distanceTo(_knee), l2 = _knee.distanceTo(_ankle);
    const d = THREE.MathUtils.clamp(_hip.distanceTo(target), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
    // 膝角：余弦定理求目标内角，绕蹲姿量出的铰链轴把小腿转过去。
    const now = _va.subVectors(_hip, _knee).angleTo(_vb.subVectors(_ankle, _knee));
    const want = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    _axis.copy(hingeLocal).applyQuaternion(leg.calf.getWorldQuaternion(_qa)).normalize();
    RotateBoneWorld(leg.calf, _delta.setFromAxisAngle(_axis, want - now));
    // 整条腿对准目标。
    leg.foot.getWorldPosition(_ankle);
    _va.subVectors(_ankle, _hip).normalize();
    _vb.subVectors(target, _hip).normalize();
    RotateBoneWorld(leg.thigh, _delta.setFromUnitVectors(_va, _vb));
    // 膝盖转向脚尖方向（略外撇）。
    _pole.copy(forward).applyAxisAngle(UP, (side === 0 ? 1 : -1) * FIRST_PERSON_BODY.kneeOutDeg * Math.PI / 180);
    leg.calf.getWorldPosition(_knee);
    const axis = _vb;
    const kv = _vc.subVectors(_knee, _hip); kv.addScaledVector(axis, -kv.dot(axis));
    _pole.addScaledVector(axis, -_pole.dot(axis));
    if (kv.lengthSq() < 1e-8 || _pole.lengthSq() < 1e-8) return;
    kv.normalize(); _pole.normalize();
    const angle = Math.atan2(_va.crossVectors(kv, _pole).dot(axis), kv.dot(_pole));
    RotateBoneWorld(leg.thigh, _delta.setFromAxisAngle(axis, angle));
  }

  /** 测试 / 探针用：下半身规划器此刻的状态。 */
  Probe() {
    const g = this.gait;
    if (!g) return null;
    return {
      lowerYaw: g.lowerYaw, twist: g.twist, moving: g.moving, turning: g.turning, speed: g.speed, phase: g.phase,
      steps: g.steps, pelvisDrop: this.pelvisDrop,
      feet: g.feet.map((f) => ({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, planted: f.planted, lift: f.lift })),
    };
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
