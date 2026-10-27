// 第一人称玩家的影子（2026-10-28，用户：地上只有枪的阴影没有角色的）。
//
// 对标 3A 第一人称全身的老做法：画面里看到的是第一人称身体（腿 + 裁掉的上衣）和贴在眼前的枪手，
// 地上的影子由一个**只进阴影图**的整身替身投出来（UE 的 Hidden In Game + Cast Hidden Shadow，COD 的 world model 投影）。
//   · 替身 = 一具国军人物模型（与 NPC 同一套 Bip001 骨架、骨骼数与第一人称身体的 Bip002 一一对应）的独立克隆，
//     平时不可见，只在烘阴影那一刻露面（Script_ShadowSkip.SetShadowOnly）：主画面、预通道、SSR 都看不到它。
//   · 腿、胯、脊柱、头逐骨照抄第一人称身体（同一套踩步 / 原地转身 / 腿 IK 的结果），所以影子的脚就是你看到的脚。
//   · 枪：Viewmodel 自己永远不投世界影子（它为窄 FOV 做过非等比压缩，投出去是一支被放大的假枪，
//     见 Script_FirstPersonSelfShadow 头注）。这里克隆一份枪的网格，按**真实尺寸**（fovRig 深度压缩压回 1）摆在
//     玩家眼前它实际该在的地方，只进阴影图；替身的两只手用两节骨骼 IK 握到第一人称双手的真实位置上。
//   · 第一人称身体不显示（死亡、过场、菜单、编辑器镜头）时影子一起停。

import * as THREE from "three";
import { CloneSkinnedRig } from "./Script_SkinnedClone.mjs";
import { SetShadowOnly } from "./Script_ShadowSkip.mjs";

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _delta = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3();
const _s = new THREE.Vector3();
const ARM_BONES = /_(L|R)_(Clavicle|UpperArm|Forearm|Hand|Finger\d+)$/;

function RotateBoneWorld(bone, delta) {
  bone.getWorldQuaternion(_qa);
  _qb.copy(delta).multiply(_qa);
  bone.parent.getWorldQuaternion(_qc).invert();
  bone.quaternion.copy(_qc.multiply(_qb));
  bone.updateWorldMatrix(false, true);
}

function FindBone(root, pattern) {
  let found = null;
  root.traverse((node) => { if (!found && node.isBone && pattern.test(node.name)) found = node; });
  return found;
}

export class FirstPersonShadow {
  /**
   * @param {{gltf: object}} asset 已载入的国军人物（actorFactory.characterAssets.byFaction.nra[i]）
   * @param {FirstPersonBody} body 第一人称身体（姿势来源）
   */
  constructor(asset, body) {
    this.body = body;
    this.root = CloneSkinnedRig(asset.gltf.scene);
    this.root.name = "FirstPersonShadowProxy";
    this.meshes = [];
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = false;
      node.frustumCulled = false;   // 蒙皮包围球冻在首帧姿势（memory skinnedmesh-cull-sphere-frozen）
      node.userData.skipNormalDepth = true;
      this.meshes.push(node);
    });
    // 骨骼对照：替身 Bip001_X ← 第一人称身体 Bip002_X（手臂另走 IK，不抄）
    const source = new Map();
    body.root.traverse((node) => { if (node.isBone) source.set(node.name.replace(/^Bip00\d_?/, ""), node); });
    this.pairs = [];
    this.root.traverse((node) => {
      if (!node.isBone || ARM_BONES.test(node.name)) return;
      const from = source.get(node.name.replace(/^Bip00\d_?/, ""));
      if (from) this.pairs.push({ to: node, from });
    });
    this.pelvis = this.pairs.find((p) => /Pelvis$/.test(p.to.name)) || null;
    this.legs = ["L", "R"].map((side) => ({
      upper: FindBone(this.root, new RegExp(`_${side}_Thigh$`)), fore: FindBone(this.root, new RegExp(`_${side}_Calf$`)),
      hand: FindBone(this.root, new RegExp(`_${side}_Foot$`)),
      srcKnee: FindBone(body.root, new RegExp(`_${side}_Calf$`)), srcFoot: FindBone(body.root, new RegExp(`_${side}_Foot$`)),
    }));
    this.arms = ["L", "R"].map((side) => ({
      upper: FindBone(this.root, new RegExp(`_${side}_UpperArm$`)),
      fore: FindBone(this.root, new RegExp(`_${side}_Forearm$`)),
      hand: FindBone(this.root, new RegExp(`_${side}_Hand$`)),
    }));
    // 身高对齐到第一人称身体（两边都量头骨在绑定姿势下的高度）
    this.root.updateWorldMatrix(true, true);
    const head = FindBone(this.root, /Head$/), bodyHead = FindBone(body.root, /Head$/);
    const savedBody = { p: body.root.position.clone(), r: body.root.rotation.clone() };
    body.root.position.set(0, 0, 0); body.root.rotation.set(0, 0, 0); body.root.updateWorldMatrix(true, true);
    const want = bodyHead ? bodyHead.getWorldPosition(_va).y : 1.42;
    const have = head ? head.getWorldPosition(_vb).y / this.root.scale.y : 1.42;
    body.root.position.copy(savedBody.p); body.root.rotation.copy(savedBody.r); body.root.updateWorldMatrix(true, true);
    this.root.scale.setScalar(have > 0.5 ? want / have : 1);
    this.gun = new THREE.Group();
    this.gun.name = "FirstPersonShadowGun";
    this.gunSource = null;
    this.gunMeshes = [];
    this.active = false;
  }

  /** 每帧，Viewmodel.Update（含第一人称身体）之后。visible = 第一人称身体这帧画不画。 */
  Update(viewmodel, visible) {
    const body = this.body;
    const on = !!visible && !!body.root.parent;
    if (on !== this.active) {
      this.active = on;
      SetShadowOnly(this.root, on);
      SetShadowOnly(this.gun, on);
    }
    if (!on) return;
    if (this.root.parent !== body.root.parent) body.root.parent.add(this.root);
    if (this.gun.parent !== body.root.parent) body.root.parent.add(this.gun);
    // 根节点、腿、胯、脊柱、头照抄
    this.root.position.copy(body.root.position);
    this.root.quaternion.copy(body.root.quaternion);
    for (const { to, from } of this.pairs) to.quaternion.copy(from.quaternion);
    this.root.updateMatrixWorld(true);
    // 骨盆按世界位置对齐（两套模型骨盆的父节点单位、朝向都不一样，局部位移不能照抄；旋转约定一致，可以照抄）
    if (this.pelvis) {
      const target = this.pelvis.from.getWorldPosition(_va);
      this.pelvis.to.position.copy(this.pelvis.to.parent.worldToLocal(target));
      this.pelvis.to.updateWorldMatrix(false, true);
    }
    // 两脚落到第一人称身体的脚上（两套模型腿长略有差，照抄旋转脚会差十几厘米），膝盖朝第一人称的膝盖
    for (const leg of this.legs) {
      if (!leg.srcFoot || !leg.srcKnee) continue;
      const footQ = leg.hand?.getWorldQuaternion(new THREE.Quaternion());
      const target = leg.srcFoot.getWorldPosition(new THREE.Vector3());
      const pole = leg.srcKnee.getWorldPosition(new THREE.Vector3()).sub(leg.upper.getWorldPosition(new THREE.Vector3()));
      this._Reach(leg, target, pole);
      if (footQ) { leg.hand.parent.getWorldQuaternion(_qc).invert(); leg.hand.quaternion.copy(_qc.multiply(footQ)); leg.hand.updateWorldMatrix(false, true); }
    }
    // 枪与双手：按真实尺寸取第一人称枪手的世界位姿
    const hands = this._TrueSizeGunAndHands(viewmodel);
    if (hands) for (let i = 0; i < 2; i++) {
      if (!hands[i]) continue;
      // 肘尖朝下、略朝外（根节点局部 +x 是人物的左方：左臂往左撇、右臂往右撇）
      const outward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion).multiplyScalar(i === 0 ? 1 : -1);
      this._Reach(this.arms[i], hands[i], new THREE.Vector3(0, -1, 0).addScaledVector(outward, 0.5));
    }
    this.root.updateMatrixWorld(true);
    for (const mesh of this.meshes) if (mesh.isSkinnedMesh) mesh.skeleton.update();
  }

  /** fovRig 的深度压缩临时压回 1，读双手与枪网格的世界位姿，再还原。→ [左手, 右手] 世界坐标（缺的为 null） */
  _TrueSizeGunAndHands(viewmodel) {
    const rig = viewmodel?.fovRig, mount = viewmodel?.weaponMount;
    if (!rig || !mount || !viewmodel.root.visible) { this.gun.visible = false; return null; }
    const saved = _s.copy(rig.scale);
    rig.scale.set(1, 1, 1);
    viewmodel.root.updateMatrixWorld(true);
    this._SyncGun(mount);
    const arms = viewmodel.riggedArms?.bones;
    const out = [arms?.l?.hand, arms?.r?.hand].map((bone) => (bone ? bone.getWorldPosition(new THREE.Vector3()) : null));
    rig.scale.copy(saved);
    viewmodel.root.updateMatrixWorld(true);
    return out;
  }

  /** 枪的影子：换枪时按 weaponMount 下的不透明网格重建克隆（几何共用），每帧抄世界矩阵。 */
  _SyncGun(mount) {
    const sources = [];
    mount.traverse((node) => {
      if (!node.isMesh || node.isSkinnedMesh || !node.geometry) return;
      let shown = true; for (let o = node; o && o !== mount; o = o.parent) if (!o.visible) { shown = false; break; }
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (!shown || materials.some((m) => m?.transparent || m?.depthWrite === false)) return;
      sources.push(node);
    });
    const key = sources.map((n) => n.geometry.uuid).join("|");
    if (key !== this.gunSource) {
      for (const clone of this.gunMeshes) this.gun.remove(clone);
      this.gunMeshes = sources.map((src) => {
        const clone = new THREE.Mesh(src.geometry, src.material);
        clone.matrixAutoUpdate = false;
        clone.castShadow = true; clone.receiveShadow = false; clone.frustumCulled = false;
        clone.userData.skipNormalDepth = true;
        this.gun.add(clone);
        return clone;
      });
      this.gunSource = key;
    }
    this.gun.visible = true;
    for (let i = 0; i < sources.length; i++) {
      this.gunMeshes[i].matrix.copy(sources[i].matrixWorld);
      this.gunMeshes[i].matrixWorld.copy(sources[i].matrixWorld);
    }
  }

  /** 两节骨骼 IK：中间关节先弯到够得着的角度，再整条对准目标，最后绕根→目标的轴把中间关节转向 pole。 */
  _Reach(limb, target, pole) {
    if (!limb.upper || !limb.fore || !limb.hand) return;
    const root = limb.upper.getWorldPosition(new THREE.Vector3()), mid = limb.fore.getWorldPosition(new THREE.Vector3());
    const end = limb.hand.getWorldPosition(new THREE.Vector3());
    const l1 = root.distanceTo(mid), l2 = mid.distanceTo(end);
    const d = THREE.MathUtils.clamp(root.distanceTo(target), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    const now = root.clone().sub(mid).angleTo(end.clone().sub(mid));
    const want = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    let axis = root.clone().sub(mid).cross(end.clone().sub(mid));
    if (axis.lengthSq() < 1e-10) axis = pole.clone().cross(end.clone().sub(root));
    if (axis.lengthSq() < 1e-10) return;
    RotateBoneWorld(limb.fore, _delta.setFromAxisAngle(axis.normalize(), want - now));
    const from = limb.hand.getWorldPosition(new THREE.Vector3()).sub(root).normalize();
    const to = target.clone().sub(root).normalize();
    RotateBoneWorld(limb.upper, _delta.setFromUnitVectors(from, to));
    const kv = limb.fore.getWorldPosition(new THREE.Vector3()).sub(root); kv.addScaledVector(to, -kv.dot(to));
    const p = pole.clone(); p.addScaledVector(to, -p.dot(to));
    if (kv.lengthSq() < 1e-10 || p.lengthSq() < 1e-10) return;
    kv.normalize(); p.normalize();
    RotateBoneWorld(limb.upper, _delta.setFromAxisAngle(to, Math.atan2(new THREE.Vector3().crossVectors(kv, p).dot(to), kv.dot(p))));
  }

  Dispose() {
    SetShadowOnly(this.root, false);
    SetShadowOnly(this.gun, false);
    this.root.removeFromParent();
    this.gun.removeFromParent();
  }
}
