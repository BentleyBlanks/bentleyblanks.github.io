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

// 两条胳膊在**相机空间**里的落点（原点＝眼睛，−Z＝视线，单位米）。
//
// 这两个数是"第一人称有没有手"的总开关，来历值得写清楚：
//
// 这副 WRAD 手臂是**从肩到指尖的整条胳膊**（bicep→forearm→wrist 量得 0.58 m），
// 而上一版把整副手臂挂在**枪**下面、肩点写成枪局部的 (0, −0.075, +0.34)。
// 挂在枪下面有两个后果，实测两个都致命：
//   · 肩跟着枪的姿态转。步枪的腰射姿态几乎不转（rx 0.045），看不出来；大刀的
//     腰射姿态是 rx 0.72 / ry −0.62 / **rz 1.54**（绕刀身自转 88°），整副手臂
//     跟着甩到画面正中并侧翻过来 —— 玩家看到的"持刀的手完全坏了"就是这个：
//     一条糊满半屏的肉色管子，那是大臂在近裁面上的截面。
//   · 肩落在眼睛前后 2 cm 处。大臂从眼睛旁边横着伸出去，必然扫过近裁面
//     （near = 0.05）—— 步枪那张出图上左右两坨"肉棍"就是左右大臂。
//     上一版还要再把左肩往枪口"前送"最多 0.40 m 去够护木，等于把大臂直接
//     推到脸前面，于是画面左边缘那片"鱼鳍"。
//
// 这一版按人体站姿摆：肩在眼睛**下方 30 cm 上下**、右肩略后、左肩大幅前送
// （端枪的人本来就是斜身站、左肩在前；而且第一人称的枪是举在身前给玩家看的，
// 左手的握点在眼前 0.80 m，肩不前送就只能靠拉长骨头去够）。
// 两个肩点都落在视锥下沿之外 —— 视场 52°，在前方 d 米处画面下沿是 y = −0.49 d，
// 左肩 z = −0.62 那一点的下沿是 −0.304，而肩在 −0.38，**永远不进画面**。
// 于是画面里只剩小臂与手从下沿伸进来，这正是第一人称该有的样子。
//
// 改这两个数之前先跑 `node Script_WeaponShot.mjs --fp --only=Dadao,ZhongZheng`：
// 肩一旦抬到视锥下沿以上，大臂立刻从画面下沿露头糊住半屏。
const BICEP_ANCHOR = {
  r: new THREE.Vector3(0.17, -0.29, -0.10),
  l: new THREE.Vector3(-0.18, -0.38, -0.62),
};
// 整副手臂的缩放。**不是 1.0 是有原因的**：这个视图模型的枪是真实尺寸
// （中正式 1.11 m），却举在眼前 0.3—0.8 m 处给玩家看 —— 比真人端枪近得多。
// 一只真实尺寸的手（腕到中指尖 0.176 m）摆到右手握点（离眼 0.31 m）上，
// 在 52° 视场里要占掉大半个屏幕，正是玩家看到的那只"糊住半屏的巨手"。
// 这套视图模型一直是按小手做的：旧的程序化手实测约 0.106 m，六成上下。
// 导入手臂照这个比例缩，手的大小才和枪的握把、护木对得上。
const ARM_SCALE = 0.62;
// 肘尖往哪边落（相对同侧大臂根，相机空间）。这是解析 IK 的极向量：
// 两条胳膊的肘都往**下、往后**垂，端枪的人就是这么夹着肘的。
// 上一版用 CCDIK（五次迭代、无极向量、无角度限位），起手姿势又是大字张开的
// 绑定姿势，于是解出来的肘一律留在身体两侧、大臂横着扫过镜头。
const ELBOW_POLE = {
  r: new THREE.Vector3(0.30, -0.44, 0.26),
  l: new THREE.Vector3(-0.26, -0.44, 0.26),
};
// 够不着时允许把骨头拉长多少倍。第一人称视图模型的枪是**举在身前**给玩家看的
// （腰射时护木离眼睛 0.80 m），比真人端枪远出一截，胳膊按人体尺寸永远差一点。
// 差的这一点要么让手够不到枪（手悬空、枪自己飘着，就是上一版的样子），
// 要么把骨头拉长一点点。选后者：拉到 1.35 倍以内肉眼看不出，手一定扣在枪上。
const MAX_STRETCH = 1.35;

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

// 让一根骨头指向世界里的某一点：算出"当前指向 → 目标指向"的差量四元数，
// 乘到它的世界朝向上，再换算回父节点的局部空间。
// （比"重建整套局部朝向"稳：不需要知道这根骨头在绑定姿势里朝哪，
// 导出管线换个轴向也不会把胳膊拧过来。）
const _aimA = new THREE.Vector3();
const _aimB = new THREE.Vector3();
const _aimC = new THREE.Vector3();
const _aimQ0 = new THREE.Quaternion();
const _aimQ1 = new THREE.Quaternion();
const _aimQ2 = new THREE.Quaternion();

function AimBone(bone, child, worldTarget) {
  if (!bone || !child || !bone.parent) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const origin = bone.getWorldPosition(_aimA);
  const current = child.getWorldPosition(_aimB).sub(origin);
  const wanted = _aimC.copy(worldTarget).sub(origin);
  if (current.lengthSq() < 1e-10 || wanted.lengthSq() < 1e-10) return;
  const delta = _aimQ0.setFromUnitVectors(current.normalize(), wanted.normalize());
  const world = bone.getWorldQuaternion(_aimQ1);
  const parent = bone.parent.getWorldQuaternion(_aimQ2).invert();
  bone.quaternion.copy(parent.multiply(delta.multiply(world)));
  bone.updateMatrixWorld(true);
}

/** Imported WRAD arms driven to the existing weapon-specific hand targets. */
export class FpsArmRig {
  constructor(gltf) {
    this.gltf = gltf;
    this.root = CloneSkeleton(gltf.scene);
    this.root.name = "RiggedFpsArms";
    this.root.userData.skipNormalDepth = true;
    this.mesh = FirstSkinnedMesh(this.root);
    this.mixer = gltf.animations.length ? new THREE.AnimationMixer(this.root) : null;
    // GripIdle 留着，但它只剩**手指**的份：肩/大臂/小臂/腕每帧都会被下面的
    // IK 重写回去。这条 clip 自带 root 与 shoulder 的位移轨，不每帧压掉的话
    // 摆好的肩点会被混合器第一帧就抹掉（上一版就栽在这儿）。
    if (this.mixer) this.mixer.clipAction(gltf.animations[0]).play();
    this.anchor = null;             // 相机稳定的挂点，由 Viewmodel 给（见 Attach）
    this.hands = null;
    this.legacyMeshes = [];
    this.root.scale.setScalar(ARM_SCALE);
    this.bones = {};                // side -> { shoulder, bicep, forearm, wrist }
    this.bind = [];                 // 每帧要复位的骨头的绑定局部变换
    this.arm = {};                  // side -> { l1, l2 }（锚点空间量的骨长）
    this.grip = {};                 // side -> { rotation, palmCenter }，见 _GripFrame
    this.wristGoal = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
    this.shoulderOffset = { r: new THREE.Vector3(), l: new THREE.Vector3() };
    this.sprintFallback = false;
    this.stretch = { r: 1, l: 1 };  // 实际用掉的拉伸倍率，取证/回归用
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._v4 = new THREE.Vector3();
    this._v5 = new THREE.Vector3();
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this.tmpQuaternion = new THREE.Quaternion();
    this.tmpQuaternion2 = new THREE.Quaternion();
    this._CollectBones();
    this.root.traverse((object) => {
      if (object.isMesh) {
        // 这副 WRAD 手臂的源材质标了 doubleSided。肩现在稳定落在视锥下沿之外，
        // 但小臂仍会擦着画面下沿进出；双面渲染会把人站在袖筒内部看到的背面也
        // 画出来，于是一个粉色三角面铺满半个屏幕。第一人称手臂只该从皮肤/袖筒
        // 外侧观看，强制正面渲染既消掉这块"粉色遮屏"，也不改变 IK 或姿态本身。
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.side = THREE.FrontSide;
          material.shadowSide = THREE.FrontSide;
          // 这副手臂的皮肤贴图本来就偏亮（albedo 近乎白），照进滕县这片阴天的
          // 天光里直接过曝成一块死白。压两处：反射率乘一层晒过的肤色，
          // 环境反射收到四成（皮肤不是抛光金属）。
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

  /**
   * 认骨头 + 记绑定姿势 + 量骨长。
   *
   * 名字一律走 NormalizeBoneName（见它的抬头：`wrist.l` 在 three 里叫 `wristl`，
   * 按原名查一律落空且**不报错**）。缺骨头 = 那条胳膊不会动，喊一声。
   */
  _CollectBones() {
    this.report = { bones: 0, chains: 0, missing: [] };
    if (!this.mesh || !this.mesh.skeleton) return;
    this.report.bones = this.mesh.skeleton.bones.length;
    this.root.updateWorldMatrix(true, true);
    const Local = (object) => this.root.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
    const rootBone = FindByName(this.root, "root");
    if (rootBone) this.bind.push(rootBone);
    for (const side of ["r", "l"]) {
      const names = {
        shoulder: `shoulder.${side}`, bicep: `bicep.${side}`,
        forearm: `forearm.${side}`, wrist: `wrist.${side}`,
      };
      const found = {};
      for (const [key, name] of Object.entries(names)) {
        found[key] = FindByName(this.root, name);
        if (!found[key]) this.report.missing.push(name);
      }
      if (Object.values(found).some((bone) => !bone)) continue;
      this.bones[side] = found;
      this.bind.push(found.shoulder, found.bicep, found.forearm, found.wrist);
      const bicep = Local(found.bicep);
      const forearm = Local(found.forearm);
      const wrist = Local(found.wrist);
      // 骨长量在**锚点空间**（= 缩放之后），因为 IK 的目标距离也在那个空间里算
      this.arm[side] = {
        l1: bicep.distanceTo(forearm) * ARM_SCALE,
        l2: forearm.distanceTo(wrist) * ARM_SCALE,
      };
      this.grip[side] = this._GripFrame(side, found.wrist);
      if (!this.grip[side]) this.report.missing.push(`finger_*.${side}`);
      this.report.chains += 1;
    }
    this.bind = this.bind.map((bone) => ({
      bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
    }));
    if (this.report.missing.length) {
      console.warn(`[RiggedModel] 手臂骨骼没对上，IK 不会跑：${this.report.missing.join(", ")}`);
    }
    this.report.armLen = this.arm.r ? +(this.arm.r.l1 + this.arm.r.l2).toFixed(3) : 0;
  }

  /**
   * 一只手"怎么算是握住了"：直接问骨架里的 **socket** 骨头。
   *
   * 上一版是在 Attach 那一刻记下"导入的腕"与"旧手模的手"之间的朝向差，然后每帧
   * 维持这个差。问题是那个差是**绑定姿势里碰巧的那个** —— 出图上看得很清楚：
   * 手指压根没绕着护木，是一只张开的手悬在枪边上。中间还试过按指骨几何反推握持
   * 坐标系（食指根→小指根当掌横轴、中指根→中指尖当指向），也不行：这副手的
   * 绑定姿势本来就半握着，中指那条线偏了三十几度，解出来的手转过头。
   *
   * socket 是绑这副手臂的人**专门为"武器扣在这儿"留的骨头**，位置就在掌心前方
   * 9 cm，实测它的局部三轴正好是：x = 指关节连线（握把这根圆柱的轴），
   * y = 指尖方向，z = 手背方向。旧手模的约定写在 BuildHandGeometry 抬头：
   * **握持轴 = 手局部 X、掌心朝 −Y、指根在 +Z**。两边对上就是这只手该怎么转。
   *
   * 顺带量出握点离腕多远：IK 要送到武器握点的是**掌心**，不是腕关节，差着 9 cm ——
   * 按腕去够，手就整只越过握把伸到镜头这边来（那只"糊住半屏的巨手"就有这一份）。
   */
  _GripFrame(side, wrist) {
    const socket = FindByName(this.root, `socket.${side}`);
    if (!socket) return null;
    const toWrist = wrist.getWorldQuaternion(new THREE.Quaternion()).invert();
    const socketQuaternion = socket.getWorldQuaternion(new THREE.Quaternion());
    const Axis = (x, y, z) => new THREE.Vector3(x, y, z)
      .applyQuaternion(socketQuaternion).applyQuaternion(toWrist).normalize();
    const grip = Axis(1, 0, 0);          // 握把圆柱的轴
    const palm = Axis(0, 0, -1);         // 掌心朝外的法向（socket 的 +z 是手背）
    const fingers = Axis(0, 1, 0);       // 指尖方向
    // 必须是**旋转**不是镜像：目标基 (X, −Y, Z) 的行列式是 −1，源基对不上就把
    // 握持轴翻个向（圆柱两头对称，翻了不改变"握住"这件事）。左右手互为镜像，
    // 这一步正好把两只手各自该翻的翻掉，不用给左右各写一份。
    if (grip.dot(new THREE.Vector3().crossVectors(palm, fingers)) > 0) grip.negate();
    const source = new THREE.Matrix4().makeBasis(grip, palm, fingers);
    const wanted = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
    const rotation = new THREE.Quaternion()
      .setFromRotationMatrix(wanted.multiply(source.transpose()));
    // 握点离腕多远，**要用米量**：骨头局部空间不是米（这副骨架腕以下带着自己的
    // 缩放，实测 1 局部单位 ≈ 0.12 m），拿局部坐标直接当长度用，手会被推出去
    // 二十几厘米。方向照旧在腕局部量（方向无量纲），长度另外在 root 空间（米）量。
    const palmDir = wrist.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
    if (palmDir.lengthSq() < 1e-10) return null;
    palmDir.normalize();
    const wristRoot = this.root.worldToLocal(wrist.getWorldPosition(new THREE.Vector3()));
    const socketRoot = this.root.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
    return { rotation, palmDir, palmLength: wristRoot.distanceTo(socketRoot) };
  }

  /**
   * @param {THREE.Object3D} anchor **相机稳定**的挂点。这里不能再传枪的 rig.group：
   *   肩一旦跟着武器姿态转，大刀那组 rz 1.54 会把整副手臂侧翻到画面正中
   *   （见 BICEP_ANCHOR 的抬头）。
   * @param {THREE.Object3D} handRight 旧程序化右手的握点（IK 靶）
   * @param {THREE.Object3D} handLeft 旧程序化左手的握点
   * @param {Array} legacyHands 旧手模，Attach 期间藏起来只当动画靶用
   */
  Attach(anchor, handRight, handLeft, legacyHands) {
    this.Detach();
    this.anchor = anchor;
    this.hands = { r: handRight, l: handLeft };
    this.legacyMeshes = legacyHands.flatMap((hand) => hand.meshes || []);
    for (const mesh of this.legacyMeshes) mesh.visible = false;
    this.sprintFallback = false;
    this.root.visible = true;
    anchor.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(ARM_SCALE);
    this.shoulderOffset.r.set(0, 0, 0);
    this.shoulderOffset.l.set(0, 0, 0);
    this._ResetBones();
    this._PlaceShoulders();
    this.Update(0);
  }

  /**
   * 把两个大臂根摆到 BICEP_ANCHOR 上：右边靠整副手臂平移，左边只挪左肩
   * （右臂已经就位，不能再动整副）。一次标定，之后每帧照抄，见 _ResetBones。
   */
  _PlaceShoulders() {
    if (!this.anchor || !this.bones.r) return;
    this.anchor.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    const InAnchor = (object) => this.anchor.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
    this.root.position.add(BICEP_ANCHOR.r.clone().sub(InAnchor(this.bones.r.bicep)));
    this.root.updateWorldMatrix(true, true);
    if (!this.bones.l) return;
    const shoulder = this.bones.l.shoulder;
    const parent = shoulder.parent;
    if (!parent) return;
    // 锚点空间的位移换算成左肩父节点的局部位移：挪肩多少，肩下面的整条胳膊
    // 就跟着挪多少（肩自己的朝向不影响它自己的位置）。
    const from = this.anchor.localToWorld(InAnchor(this.bones.l.bicep));
    const to = this.anchor.localToWorld(BICEP_ANCHOR.l.clone());
    this.shoulderOffset.l.copy(parent.worldToLocal(to)).sub(parent.worldToLocal(from));
    this._ResetBones();
    this.root.updateWorldMatrix(true, true);
  }

  /** 每帧先把混合器写脏的骨头复位到绑定姿势（外加标定好的肩位移）。 */
  _ResetBones() {
    for (const entry of this.bind) {
      entry.bone.position.copy(entry.position);
      entry.bone.quaternion.copy(entry.quaternion);
    }
    for (const side of ["r", "l"]) {
      const shoulder = this.bones[side] && this.bones[side].shoulder;
      if (shoulder) shoulder.position.add(this.shoulderOffset[side]);
    }
  }

  /**
   * 解析两骨 IK（大臂 + 小臂），带极向量与"够不着就拉长"。
   *
   * 为什么不用 three 自带的 CCDIKSolver（上一版用的就是它）：CCD 没有极向量、
   * 没有角度限位，解出来的肘停在哪全看起手姿势 —— 而这副手臂的绑定姿势是
   * 大字张开的，于是肘一律留在身体两侧、大臂横着扫过镜头。两骨链本来就有闭式解，
   * 余弦定理三行就够，肘往哪垂由 ELBOW_POLE 说了算，永远不会翻面。
   */
  _SolveArm(side) {
    const bones = this.bones[side];
    const hand = this.hands && this.hands[side];
    if (!bones || !hand || !this.anchor) return;
    const { bicep, forearm, wrist } = bones;
    const grip = this.grip[side];
    const shoulderPoint = this.anchor.worldToLocal(bicep.getWorldPosition(this._v0));
    // 腕该朝哪：由握持坐标系解出来（见 _GripFrame），不是"维持绑定姿势那个差"。
    // 目标点也跟着走：送到握点的是**掌心**，所以从握点沿掌心偏移倒推回腕关节。
    const inverse = this._q0.copy(this.anchor.getWorldQuaternion(this._q1)).invert();
    const goal = this.wristGoal[side].copy(inverse).multiply(hand.getWorldQuaternion(this._q2));
    if (grip) goal.multiply(grip.rotation);
    const target = this.anchor.worldToLocal(hand.getWorldPosition(this._v1));
    if (grip) {
      target.sub(this._v5.copy(grip.palmDir).applyQuaternion(goal)
        .multiplyScalar(grip.palmLength * ARM_SCALE));
    }
    let { l1, l2 } = this.arm[side];
    const distance = shoulderPoint.distanceTo(target);
    const reach = (l1 + l2) * 0.999;
    // 够不着：把两根骨头等比拉长（上限 MAX_STRETCH）。宁可胳膊长一点点，
    // 也不能让手停在半空、枪自己飘着 —— 后者正是玩家看到的"没有手"。
    let stretch = 1;
    if (distance > reach) {
      stretch = Math.min(MAX_STRETCH, distance / reach);
      forearm.position.multiplyScalar(stretch);
      wrist.position.multiplyScalar(stretch);
      bicep.updateMatrixWorld(true);
      l1 *= stretch;
      l2 *= stretch;
    }
    this.stretch[side] = +stretch.toFixed(3);
    const d = Math.min(Math.max(distance, 1e-4), (l1 + l2) * 0.999);
    const direction = this._v2.copy(target).sub(shoulderPoint).normalize();
    // 肘的落点：肩处张角由余弦定理给，张开的方向由极向量给
    const cosine = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const angle = Math.acos(cosine);
    const pole = this._v3.copy(BICEP_ANCHOR[side]).add(ELBOW_POLE[side]).sub(shoulderPoint);
    pole.addScaledVector(direction, -pole.dot(direction));
    if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(direction, -direction.y);
    pole.normalize();
    const elbow = this._v4.copy(shoulderPoint)
      .addScaledVector(direction, l1 * Math.cos(angle))
      .addScaledVector(pole, l1 * Math.sin(angle));
    AimBone(bicep, forearm, this.anchor.localToWorld(elbow));
    AimBone(forearm, wrist, this.anchor.localToWorld(this._v5.copy(target)));
  }

  /**
   * 冲刺姿态整套 weaponMount 绕相机原点转，手会被甩到画面外侧很远的地方；
   * 旧手模只有握把附近的手和短袖口，原本就是按这套相机姿态制作的，
   * 因此冲刺期间切回它。
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
    this.anchor = null;
    this.sprintFallback = false;
    this.root.visible = true;
  }

  /** 把腕拧到 _SolveArm 解出来的那个朝向（锚点空间 -> 世界 -> 父节点局部）。 */
  _OrientWrist(side) {
    const wrist = this.bones[side] && this.bones[side].wrist;
    if (!wrist || !wrist.parent || !this.hands || !this.hands[side]) return;
    this.tmpQuaternion.copy(this.anchor.getWorldQuaternion(this.tmpQuaternion2))
      .multiply(this.wristGoal[side]);
    wrist.parent.getWorldQuaternion(this.tmpQuaternion2).invert();
    wrist.quaternion.copy(this.tmpQuaternion2.multiply(this.tmpQuaternion));
    wrist.updateMatrixWorld(true);
  }

  Update(dt) {
    if (!this.root.parent || !this.hands || !this.anchor) return;
    if (this.mixer) this.mixer.update(Math.max(0, dt));
    this._ResetBones();
    this.anchor.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    this._SolveArm("r");
    this._SolveArm("l");
    this._OrientWrist("r");
    this._OrientWrist("l");
  }

  Dispose() {
    this.Detach();
    if (this.mixer) this.mixer.stopAllAction();
  }
}
