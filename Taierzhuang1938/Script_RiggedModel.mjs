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

// 标定左肩前送时给胳膊留的余量：目标是"肩到左手握点 = 臂长 × 这个系数"。
// 留三成弯量而不是一成：CCDIK 五次迭代并不会把胳膊真的拉直，
// 实测 0.94 那一版残差 0.076 m（手看着还是虚握的），0.70 压到 0.015 m。
const ARM_SLACK = 0.70;
// 前送上限。再多蒙皮就在画面左边缘拉出一片鱼鳍（这副手臂没有躯干可参照）。
const MAX_LEAD = 0.40;

/**
 * 骨骼名归一化。
 *
 * **这是"第一人称没有手"的病根。** GLB 里的骨头叫 `wrist_ik.l`（Blender 的
 * 左右后缀），而 three 的 GLTFLoader 读进来会走 `PropertyBinding.sanitizeNodeName`
 * ——点号是动画轨道名的分隔符，于是被**删掉**：场景里那根骨头叫 `wrist_ikl`。
 * 按原名 `wrist_ik.l` 查一律落空，而落空**不报错**：IK 求解器根本没建起来
 * （`iks` 空数组），`wrists/targets` 也是 null，`_PlaceTarget`/`_OrientWrist`
 * 第一行就 return。整副手臂于是停在绑定姿势、挂在视野下沿之外一动不动；
 * 而 `Attach()` 已经把旧的程序化手藏了 —— 画面上就是"一支枪浮在半空，没有手"，
 * 任何动作（拉栓、装填、上刺刀）都只有枪在动。
 *
 * 所以认人一律按"小写 + 去掉所有非字母数字"来：`wrist_ik.l` 与 `wrist_ikl`
 * 归一化后都是 `wristikl`，导出管线怎么改名都还认得出。
 */
function NormalizeBoneName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function FindByName(root, name) {
  const wanted = NormalizeBoneName(name);
  let found = null;
  root.traverse((object) => {
    if (!found && NormalizeBoneName(object.name) === wanted) found = object;
  });
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
    // 肩根在枪局部坐标里的落点。整副手臂挂在 rig.group 下面，所以肩膀是跟着枪走的，
    // 手能摸到枪身上多远就由这个数（加 _CalibrateLeftLead 现算的左肩前送）决定。
    // 想临时把它往枪口再挪一截的念头别起：蒙皮会在画面边缘拉出一片鱼鳍，
    // 账记在 Script_Viewmodel 的 BAYONET_SLIDE_Z 抬头里。
    this.baseOffset = new THREE.Vector3(0, -0.075, 0.34);
    this.root.position.copy(this.baseOffset);
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
    this.leftLead = 0;              // 左肩前送量，逐枪现算，见 _CalibrateLeftLead
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
          // 这副手臂的皮肤贴图本来就偏亮（albedo 近乎白），照进滕县这片阴天的
          // 天光里直接过曝成一块死白 —— 手臂一旦真的显示出来（IK 修好之前它压根
          // 没画在屏幕上），第一眼看到的就是两条发光的胳膊。压两处：
          // 反射率乘一层晒过的肤色，环境反射收到四成（皮肤不是抛光金属）。
          if (material.isMeshStandardMaterial) {
            material.color.multiplyScalar(0.62);
            material.envMapIntensity = 0.40;
            material.roughness = Math.max(material.roughness, 0.85);
          }
          material.needsUpdate = true;
        }
        object.frustumCulled = false;
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
  }

  _BuildSolver() {
    this.report = { bones: 0, chains: 0, missing: [] };
    if (!this.mesh || !this.mesh.skeleton) return;
    const bones = this.mesh.skeleton.bones;
    // 归一化名 -> 序号。见 NormalizeBoneName 的抬头：直接按 `wrist.l` 查是查不到的。
    const byName = new Map();
    bones.forEach((bone, i) => {
      const key = NormalizeBoneName(bone.name);
      if (!byName.has(key)) byName.set(key, i);
    });
    const index = (name) => (byName.has(NormalizeBoneName(name)) ? byName.get(NormalizeBoneName(name)) : -1);
    this.report.bones = bones.length;
    const iks = [];
    for (const side of ["r", "l"]) {
      const names = {
        target: `wrist_ik.${side}`, effector: `wrist.${side}`,
        forearm: `forearm.${side}`, bicep: `bicep.${side}`,
      };
      const target = index(names.target);
      const effector = index(names.effector);
      const forearm = index(names.forearm);
      const bicep = index(names.bicep);
      this.targets[side] = bones[target] || FindByName(this.root, names.target);
      this.wrists[side] = bones[effector] || FindByName(this.root, names.effector);
      for (const [key, value] of Object.entries({ target, effector, forearm, bicep })) {
        if (value < 0) this.report.missing.push(names[key]);
      }
      if ([target, effector, forearm, bicep].every((value) => value >= 0)) {
        iks.push({ target, effector, links: [{ index: forearm }, { index: bicep }], iteration: 5 });
      }
    }
    this.report.chains = iks.length;
    // 缺骨头 = 那条胳膊不会动。以前这里静默降级，于是"没有手"这件事在画面上
    // 摆了很久也没人看见 —— 现在它至少要在控制台喊一声。
    if (this.report.missing.length) {
      console.warn(`[RiggedModel] 手臂骨骼没对上，IK 不会跑：${this.report.missing.join(", ")}`);
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
    this.root.position.copy(this.baseOffset);
    this.root.rotation.set(0, 0, 0);
    this.root.updateWorldMatrix(true, true);
    this.shoulderLeft = FindByName(this.root, "shoulder.l");
    this.shoulderHome = this.shoulderLeft ? this.shoulderLeft.position.clone() : null;
    this._CalibrateLeftLead(rigGroup, handLeft);
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
   * 左肩要往枪口送多远：**每支枪现算**，不写死。
   *
   * 左手的握点是逐枪给的（`rig.hands.left`，护木上），三八式比汉阳造还长 —— 写死
   * 一个数就会顾此失彼：按汉阳造调好的 0.34 m 拿到三八式上仍然差一截，左臂又绷成
   * 一根直棍、在画面左边缘拉出一片鱼鳍。所以这里量着算：
   *   送的量 = 肩到左手握点的距离 − 这条胳膊长度 × ARM_SLACK（留两成弯，别绷直）
   * 迭代三次收敛（送了肩之后距离会变），上限 MAX_LEAD —— 再多蒙皮就露馅。
   */
  _CalibrateLeftLead(rigGroup, handLeft) {
    this.leftLead = 0;
    const shoulder = this.shoulderLeft;
    if (!shoulder || !handLeft) return;
    const bones = ["bicep.l", "forearm.l", "wrist.l"].map((n) => FindByName(this.root, n));
    if (bones.some((b) => !b)) return;
    rigGroup.updateMatrixWorld(true);
    const at = (obj) => obj.getWorldPosition(new THREE.Vector3());
    const armLen = at(bones[0]).distanceTo(at(bones[1])) + at(bones[1]).distanceTo(at(bones[2]));
    const target = at(handLeft);
    for (let i = 0; i < 3; i += 1) {
      this._LeadLeftShoulder();
      const need = at(shoulder).distanceTo(target) - armLen * ARM_SLACK;
      if (need <= 0.002) break;
      this.leftLead = Math.min(MAX_LEAD, this.leftLead + need);
    }
    this._LeadLeftShoulder();
    this.report.leftLead = +this.leftLead.toFixed(3);
    this.report.armLen = +armLen.toFixed(3);
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

  /**
   * 左肩前送（一次性标定，跟着 Attach 走）。
   *
   * 量出来的事实：这副手臂 bicep→forearm→wrist 一共 0.624 m，而左手的握点在
   * 护木上、离左肩 **0.795 m** —— 差 0.17 m，IK 永远够不着。够不着不会报错，
   * 只会把胳膊绷成一根指着护木的直棍、手停在半空张着五指（"手不握枪"就是这么来的）。
   * 右手没这问题：握把离右肩 0.417 m，正好。
   *
   * 解法不是把左手往枪托挪（那样左手就不在护木上了，握法就错了），而是把**左肩**
   * 往前送 —— 端枪的人本来就是斜着站、左肩在前的。肩在画面外，送多少没人看得见，
   * 看得见的是左手实实在在扣在护木上。
   */
  _LeadLeftShoulder() {
    const shoulder = this.shoulderLeft;
    const rigGroup = this.root.parent;
    if (!shoulder || !shoulder.parent || !rigGroup || !this.shoulderHome) return;
    // 每帧都从"动画给的那个位置"重新算：GripIdle 这条 clip 自带 shoulder 的位移轨，
    // 只在 Attach 时改一次会被混合器第一帧就抹掉（这一版返工就是从这儿开始的）。
    shoulder.position.copy(this.shoulderHome);
    shoulder.updateWorldMatrix(true, false);
    const world = shoulder.getWorldPosition(this.tmpPosition);
    const local = rigGroup.worldToLocal(world.clone());
    local.z -= this.leftLead || 0;
    rigGroup.localToWorld(local);
    shoulder.position.copy(shoulder.parent.worldToLocal(local));
    shoulder.updateMatrixWorld(true);
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
    this._LeadLeftShoulder();
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
