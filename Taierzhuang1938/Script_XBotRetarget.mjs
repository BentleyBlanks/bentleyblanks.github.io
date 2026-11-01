// 士兵骨架（TengxianHumanoidV1，3ds Max Biped 的 53 根骨）→ Mixamo X Bot 骨架的动作换算。只用 three 的数学类，
// 浏览器（白盒编辑器里没有对照的动作当场换算）和 Node（_import/Script_XBotDeriveClips.mjs 预先烘成 X Bot 动作文件）共用。
//
// 两套骨架的初始姿势都是 T 姿势、脸朝 +Z、Y 朝上、米制，但比例不同（X Bot 胯高 1.04 m、士兵 0.95 m；士兵两臂往下约 10°）。
// 换算按「世界朝向的变化量」搬：目标骨的世界朝向 = 源骨此刻的世界朝向 × 源骨初始朝向⁻¹ × 对齐 × 目标骨初始朝向。
// 对齐 = 把源骨初始姿势里「这根骨指向子骨」的方向转到目标骨的同一方向（只转摆向、不转扭向），
// 这样士兵初始时两臂下垂的 10° 不会被当成动作、搬到 X Bot 上变成两臂上抬。
// 胯部位移按两边胯高之比放大（X Bot 腿长，同一个蹲姿胯要更高，脚才落在地上）。
// 没有对照的 X Bot 骨（HeadTop_End、各指第四节）保持初始姿势。
import * as THREE from "three";

/** 士兵骨名（空格换成下划线，同 three 的节点名）→ X Bot 骨名。 */
export const XBOT_FROM_SOLDIER = Object.freeze((() => {
  const map = {
    Bip001_Pelvis: "Hips", Bip001_Spine: "Spine", Bip001_Spine1: "Spine1", Bip001_Spine2: "Spine2",
    Bip001_Neck: "Neck", Bip001_Head: "Head",
  };
  const fingers = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
  for (const [s, side] of [["L", "Left"], ["R", "Right"]]) {
    Object.assign(map, {
      [`Bip001_${s}_Clavicle`]: `${side}Shoulder`, [`Bip001_${s}_UpperArm`]: `${side}Arm`,
      [`Bip001_${s}_Forearm`]: `${side}ForeArm`, [`Bip001_${s}_Hand`]: `${side}Hand`,
      [`Bip001_${s}_Thigh`]: `${side}UpLeg`, [`Bip001_${s}_Calf`]: `${side}Leg`,
      [`Bip001_${s}_Foot`]: `${side}Foot`, [`Bip001_${s}_Toe0`]: `${side}ToeBase`,
    });
    fingers.forEach((finger, i) => {
      map[`Bip001_${s}_Finger${i}`] = `${side}Hand${finger}1`;
      map[`Bip001_${s}_Finger${i}1`] = `${side}Hand${finger}2`;
      map[`Bip001_${s}_Finger${i}2`] = `${side}Hand${finger}3`;
    });
  }
  return map;
})());

export const SOLDIER_PELVIS = "Bip001_Pelvis";
export const XBOT_HIPS = "Hips";

/** 骨名统一成 three 节点名的写法（GLB 里的「Bip001 L Hand」在 three 里是「Bip001_L_Hand」）。 */
export function BoneKey(name) { return String(name).replace(/[\s.:]/g, "_"); }

/**
 * 一套骨架的初始姿势。bones: [{ name, parent (下标或 -1), world: Matrix4（模型空间的初始世界矩阵）, local?: {p, q} }]，
 * 父骨必须排在子骨前面（ToposortBones 可以排）。
 */
export class RestSkeleton {
  constructor(bones) {
    this.bones = bones.map(b => ({ ...b, key: BoneKey(b.name) }));
    this.index = new Map(this.bones.map((b, i) => [b.key, i]));
    this.worldQ = this.bones.map(b => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(b.world)));
    this.worldP = this.bones.map(b => new THREE.Vector3().setFromMatrixPosition(b.world));
  }
  Find(name) { return this.index.get(BoneKey(name)) ?? -1; }
}

/** 按父子关系排序：返回新顺序的下标数组（父在前）。parents[i] = 父下标或 -1。 */
export function ToposortBones(parents) {
  const order = [], seen = new Set();
  const Visit = (i) => { if (seen.has(i)) return; if (parents[i] >= 0) Visit(parents[i]); seen.add(i); order.push(i); };
  parents.forEach((_, i) => Visit(i));
  return order;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class XBotRetarget {
  /**
   * source / target: RestSkeleton。target 的父链之上的静态节点（X Bot 的 Armature：绕 X 转 90°、缩 0.01）用
   * targetParentOfRoot（Matrix4，模型空间）给出；target.bones[i].local 必须有（没对照的骨用它）。
   */
  constructor(source, target, { map = XBOT_FROM_SOLDIER, targetParentOfRoot = new THREE.Matrix4() } = {}) {
    this.source = source; this.target = target;
    const srcOf = new Map(Object.entries(map).map(([s, t]) => [BoneKey(t), BoneKey(s)]));
    this.srcIndex = target.bones.map(b => (srcOf.has(b.key) ? source.Find(srcOf.get(b.key)) : -1));
    this.rootParent = targetParentOfRoot.clone();
    this.rootParentQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(this.rootParent));
    this.rootParentInv = this.rootParent.clone().invert();
    // 每根有对照的目标骨：C = 源初始⁻¹ × 对齐⁻¹ × 目标初始（世界朝向），之后 目标世界 = 源世界 × C
    this.correction = target.bones.map((b, ti) => {
      const si = this.srcIndex[ti];
      if (si < 0) return null;
      const swing = this._RestSwing(si, ti);
      return source.worldQ[si].clone().invert().multiply(swing.invert()).multiply(target.worldQ[ti]);
    });
    const hipsT = target.Find(XBOT_HIPS), pelvisS = source.Find(SOLDIER_PELVIS);
    this.hipsIndex = hipsT;
    this.pelvisIndex = pelvisS;
    this.legRatio = hipsT >= 0 && pelvisS >= 0 ? target.worldP[hipsT].y / source.worldP[pelvisS].y : 1;
    this.worldQ = target.bones.map(() => new THREE.Quaternion());
  }

  /** 源骨初始方向（指向第一根有对照的子骨）转到目标骨同一方向的摆向旋转；末端骨（手、头、脚尖、指尖）不转。 */
  _RestSwing(si, ti) {
    const target = this.target, source = this.source;
    const childT = target.bones.findIndex((b, i) => b.parent === ti && this.srcIndex[i] >= 0);
    if (childT < 0) return new THREE.Quaternion();
    const childS = this.srcIndex[childT];
    const dirS = _v.copy(source.worldP[childS]).sub(source.worldP[si]);
    const dirT = _v2.copy(target.worldP[childT]).sub(target.worldP[ti]);
    if (dirS.lengthSq() < 1e-10 || dirT.lengthSq() < 1e-10) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(dirS.normalize(), dirT.normalize());
  }

  /**
   * 一帧：srcWorldQ[i] = 源骨 i 此刻的模型空间世界朝向（下标同 source.bones），pelvis = 源胯部此刻的模型空间位置。
   * 写 outLocalQ[i]（目标骨的本地朝向，下标同 target.bones）与 outHips（X Bot Hips 的本地位置）。
   */
  Solve(srcWorldQ, pelvis, outLocalQ, outHips) {
    const target = this.target;
    for (let ti = 0; ti < target.bones.length; ti++) {
      const b = target.bones[ti], si = this.srcIndex[ti];
      const parentQ = b.parent >= 0 ? this.worldQ[b.parent] : this.rootParentQ;
      if (si >= 0) {
        this.worldQ[ti].copy(srcWorldQ[si]).multiply(this.correction[ti]);
        outLocalQ[ti].copy(_q.copy(parentQ).invert()).multiply(this.worldQ[ti]);
      } else {
        outLocalQ[ti].fromArray(b.local.q);
        this.worldQ[ti].copy(parentQ).multiply(outLocalQ[ti]);
      }
    }
    if (outHips && this.hipsIndex >= 0) {
      outHips.copy(pelvis).multiplyScalar(this.legRatio);
      const parent = target.bones[this.hipsIndex].parent;
      if (parent >= 0) {
        // Hips 的父不是模型根：按父骨此刻的世界矩阵换（X Bot 里 Hips 直接挂在 Armature 下，走下面那支）
        const m = new THREE.Matrix4().compose(target.worldP[parent], this.worldQ[parent], _v2.set(1, 1, 1)).invert();
        outHips.applyMatrix4(m);
      } else outHips.applyMatrix4(this.rootParentInv);
    }
  }

  /** 源骨架一帧的本地值（values[i*7..]：p xyz、q xyzw，下标同 source.bones）→ 源骨世界朝向与胯部位置。 */
  static SourceWorld(source, values, stride, srcWorldQ, pelvisOut, staticRoot = null) {
    const worldM = _sourceWorldM;
    for (let i = 0; i < source.bones.length; i++) {
      const o = i * stride;
      const local = (worldM[i] || (worldM[i] = new THREE.Matrix4()))
        .compose(_v.set(values[o], values[o + 1], values[o + 2]), _q.set(values[o + 3], values[o + 4], values[o + 5], values[o + 6]), _v2.set(1, 1, 1));
      const p = source.bones[i].parent;
      if (p >= 0) local.premultiply(worldM[p]);
      else if (staticRoot) local.premultiply(staticRoot);
      srcWorldQ[i].setFromRotationMatrix(_m4.extractRotation(local));
    }
    const pi = source.Find(SOLDIER_PELVIS);
    if (pi >= 0) pelvisOut.setFromMatrixPosition(worldM[pi]);
  }
}
const _sourceWorldM = [], _m4 = new THREE.Matrix4();

/**
 * X Bot 的左右镜像（Mixamo 动作是右手比划、预演要左手时用）：一帧模型空间世界朝向按 YZ 平面反射
 * （q → (x, −y, −z, w)），左右骨对调。两边初始朝向本来就互为镜像（LeftHand (½,½,−½,½) ↔ RightHand (½,−½,½,½)），
 * 所以反射后的左骨朝向直接给右骨就对。胯部位置 x 取反。
 */
export function MirrorSide(name) {
  return name.startsWith("Left") ? "Right" + name.slice(4) : name.startsWith("Right") ? "Left" + name.slice(5) : name;
}
export function MirrorWorldQ(q, out = new THREE.Quaternion()) { return out.set(q.x, -q.y, -q.z, q.w); }
