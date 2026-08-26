// 第一人称手臂的 GLB 桥。
//
// 动作时序仍然由 Script_Viewmodel 说了算，这里只把已经验过的手部变换重定向到
// 导入的骨架上。GLB 读不到就退回旧的程序化手，不挡启动、不改交火时序。
//
// **这个文件曾经还负责第三人称人物的 GLB 皮（SegmentedCharacterSkin）。已经删了。**
// 那套皮是「把 13 块刚体分段原样挂到关节上」：块与块之间没有交叠余量，肩肘腕胯
// 膝踝一转就开缝；而资产本身也是人偶——躯干一张薄板、没有脖子、**没有脚**
// （百姓那两个 glb 的腿到脚踝就断了，人站在地面下 11 cm）。
// 士兵 2026-08-25、百姓 2026-08-26 先后搬到程序化 tzm 模型
// （Model/SoldierNra|SoldierIja|CivilianMale|CivilianFemale.tzm.json，
// 建模脚本在 _blender/BuildSoldiers.py 与 BuildCivilians.py）。
// 想换回 GLB 之前先看那两个脚本的抬头，它们记着这条路为什么走不通。

import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkeleton } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { CCDIKSolver } from "./vendor/three/examples/jsm/animation/CCDIKSolver.js";

// 只剩第一人称的手。四个人物 glb（Ija / Nra / Civilian 男女，合计 4.3 MB）
// 曾经也在这里预读，现在一个都不读了 —— 文件还在 Model/ 下，但没有代码路径碰它们。
const URLS = Object.freeze({
  fpsArms: "./Model/Model_FpsArms.glb?v=2",
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
