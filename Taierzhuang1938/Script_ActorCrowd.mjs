// 《台儿庄：血战滕县》远景人群：把「看得见的人」和「画得起的人」拆成两层。
//
// 为什么非有不可（这是"看不到日军"那条 bug 的后一半）：
// 一个 Actor 是十几二十个网格、四十几个 draw call，所以 Script_Ai 只给最近的
// 13 个发名额。第一轮把名额从"按距离"改成"先过视锥、敌人优先"之后，日军终于
// 画出来了，但**最远的一个也只到 69—86 m** —— 玩家的原话是"起码要翻五倍"。
// 十字街那一关的机制本身就是一条 305 m 的通视走廊，八十米的人墙等于把机制砍了。
//
// 当前硬红线已提高到 5000 draw calls / 600 万三角面，但远景合批仍是必需的等价 LOD；
// 它在保持全部人物与尸体可见时使用，不能重新引入人数名额。这里的做法：
//
//   1) 每个 kind 烘一**组**静态姿势（站 / 跪 / 卧 / 跑步翻页 N 帧 / 倒地），
//      按材质桶合并成几块几何；军人是蒙皮 GLB，那一份必须走 BakeSkinnedPose ——
//      **别按 matrixWorld 去变换蒙皮网格**，那条路会把人缩成 1.7 cm 的一粒，
//      画面上只剩一支飘在半空的步枪（2026-09-02 的那张实拍就是它），
//      账记在 BakeSkinnedPose 的头注上；
//   2) 每块几何配一个 InstancedMesh，容量给到全场兵力；
//   3) 每帧把"在视锥里、投影尺寸已经读不出关节动作"的人按**他此刻的姿态**
//      写进对应姿势桶的实例矩阵。
//
// 【2026-09-09：为什么从一个姿势变成一组】实拍取证：前沿开战 20 s，46—74 m 那一档
// 31 个日军里 **20 个其实在跪射**，画面上却全是站着的 —— 因为这一层只烘了「端着枪
// 站着」一个姿势，卧倒是把那尊雕像绕 X 倒 80°，跑动的人是雕像在滑行。玩家看到的
// 「远处的敌人不会动、干站着」有一半根本不是 AI 的问题，是这一层的表现力。
// 姿势桶把它补上：跪的人矮一截、卧的人是真趴着、跑的人腿在翻页。
//
// 代价是远景的人**只有 N 档姿势**（姿势 + 朝向；跑步是 N 帧翻页不是连续插值）。
// 这一条能成立的前提是距离门槛：60 m 上一个人在 900 px 高的屏幕上只有 26 px，
// 200 m 上 8 px，400 m 上 4 px —— 那个尺寸下**关节动作**看不出来，但「这个人是站是跪
// 是趴、腿在不在动」是剪影级的差别，看得出来。门槛以内一律走精细 Actor。
//
// 开销：本帧真的用到的姿势桶才算 draw call（three 在 primcount===0 时早退，
// 空桶既不提交也不计数）。一个 kind 的一档姿势是「材质桶数」个 draw call ——
// 实测军人 GLB 是 7 个，所以站+倒地两档 = 14 / kind。姿势档从 2 加到 8 之后，
// 最坏情况（八档同时有人）是 56 / kind。三角形不变：一个人只画在一个桶里。
// 逐桶的账与实测见 docs/Data_ActorCrowdLod.md。

import * as THREE from "three";
import { ACTOR_LOCOMOTION } from './Data_Tuning_ActorLocomotion.mjs';
import { MergeGeometries } from "./Script_Geo.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ACTOR_DETAIL } from "./Data_Tuning_Ai.mjs";
import { ClusterDistantGeometry } from "./Script_DistantGeometry.mjs";

/**
 * 单一姿势桶的实例上限。尸体现在保留到本关结束，最大日军票池是 480；
 * 512 覆盖整关活人 + 尸体，避免长局里第 129 个远景尸体又消失。
 *
 * 【为什么每个桶都给满 512 而不按姿势分摊】哪一档姿势会挤满是内容决定的：
 * 一次冲锋能把整条战线塞进 run 桶，一次压制能把整条战线塞进 prone 桶。
 * 实例矩阵是 CPU 侧 Float32Array + 一块 GPU buffer，512×64 B = 32 KB / 网格，
 * 八档 × 7 材质 × 2 阵营 ≈ 3.6 MB —— 换「任何一档都不会截断」值得。
 * 每帧只上传 [0, count) 那一段（见 End），空桶一个字节都不传。
 */
const CROWD_CAPACITY = 512;

/**
 * 换一档姿势之后推几帧再烘。**这个数不是随手给的**，一档一个值，理由如下。
 *
 * 【原来的 6 帧为什么不够】6 帧（0.1 s）只够程序化分件那套弹簧收敛；军人是蒙皮
 * GLB，姿势来自 `Script_CharacterModel` 的 clip，换 clip 走的是 **0.12 s 的
 * crossFade**（`CharacterModel.Play` 的默认值），而蹲下还要先播一整条**过渡** clip。
 * 2026-09-09 第一版实测：跪姿桶量出来 1.61 m，比站姿的 1.53 m 还**高** ——
 * 烘到的是 `StandToKneel` 刚起手那一帧，人还站着。
 *
 * standing 0.4 s：只有 crossFade 要等。
 * kneel 2.5 s：`Script_InfantryAnimation.Select` 是一台状态机 —— 蹲 = 先播完
 *   `StandToKneel`（实测 1.7 s 左右）才切 `KneelHold`。实测 2.0 s 起稳定在
 *   1.18 m（站姿 1.52 m），2.5 s 留半秒余量。
 * prone 1.5 s：`POSE_CLIPS.proneFire`（clip 名 `StandFireCrouch`，名实不符，
 *   见 Script_CharacterModel 的注释）由完整比例的参考骨架构建静态卧姿；
 *   保留 1.5 s 收敛窗口，让上一个姿势的混合和程序化权重归稳。
 * dead 1.0 s：倒地 0.8 s + 淡入 0.12 s，推满一秒是完全定格帧。
 *
 * 【要等两秒半的那两档改用大步长】烘焙不出画，中间帧一帧都不要，只要终点。
 * 蹲/卧用 1/20 s 一步走完同样的秒数：mixer 与状态机照样按时间推进（`Finished()`
 * 比的是 action.time 与 clip 时长），但 `Actor.Update` 少跑一百多趟。
 * 实测两个 kind 合计省掉约 30 ms。
 */
const POSE_BAKE = {
  standing: { seconds: 0.4, dt: 1 / 60 },
  kneel: { seconds: 2.5, dt: 1 / 20 },
  prone: { seconds: 1.5, dt: 1 / 20 },
  run: { seconds: 0.4, dt: 1 / 60 },
  dead: { seconds: 1.0, dt: 1 / 60 },
};

/**
 * 各档姿势喂给 `Actor.Update` 的状态。
 *
 * Static armed poses use full aim so the baked barrel points along local -Z,
 * the same axis used by distant AI ballistics. Partial aim kept the source
 * animation's sideways barrel even after the close-up rig was corrected.
 * 跑动把 aim 压到 0.25：`PoseWeapon` 在 moveSpeed>0.55 时自己走"端着枪跑"的一路，
 * 再叠满 aim 会把肩线拧成据枪，腿在跑上身在瞄。
 */
const STANDING_STATE = { aim: 1, moveSpeed: 0, crouch: 0, prone: 0 };
const KNEEL_STATE = { aim: 1, moveSpeed: 0, crouch: 1, prone: 0 };
const PRONE_STATE = { aim: 1, moveSpeed: 0, crouch: 0, prone: 1 };
const RUN_STATE = { aim: 0.25, moveSpeed: 1, crouch: 0, prone: 0 };
const DEAD_BAKE_STATE = { dead: true, dying: 1 };

/** 姿势 id → 桶名（进 mesh.name，测试与取证按它认桶）。 */
function PoseMeshName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * 蒙皮网格的静态化：按**当前骨骼姿势**把顶点烘进网格自己的局部空间。
 *
 * 【这是"远景日军只剩一支飘着的枪"的病根，改这个文件之前先读完这一段】
 * SkinnedMesh 的顶点**不走自己的 matrixWorld**：three 在 updateMatrixWorld 里把
 * bindMatrixInverse 设成 inverse(matrixWorld)，着色器里再乘回 matrixWorld，两下
 * 正好抵消 —— 画出来的位置完全由骨骼给。军人 GLB 是 Max Biped 出的，网格节点上
 * 挂着一层 0.01 的物体缩放，运行时被这条抵消规则吃掉，所以看起来一切正常。
 *
 * 可远景层原来是 `geometry.clone().applyMatrix4(inverse(root)·mesh.matrixWorld)` ——
 * 它把那层 0.01 当了真：1.76 m 的人被缩成 1.7 cm 的一粒，四十六米外一个像素都不到。
 * 而挂在手部插槽上的步枪是普通 Mesh（插槽里已经补偿过缩放，世界缩放是 1），
 * 照常画出来。于是 46 m 外的每个人都只剩一支悬在半空的三八式。
 *
 * applyBoneTransform 的返回值末尾乘过 bindMatrixInverse，已经落在**网格自己的
 * 局部空间**，所以外面那条 inverse(root)·matrixWorld 原样保留即可，别再补偿一次。
 * 法线用 w=0 的 Vector4 走同一条链路（平移项被 w 吃掉，只剩线性部分），
 * 不必另外拼一遍混合矩阵，也不能改用 computeVertexNormals —— 那会把 GLB 里
 * 烘死的硬边全抹平。
 */
function BakeSkinnedPose(mesh) {
  const geometry = mesh.geometry.clone();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!geometry.attributes.skinIndex || !geometry.attributes.skinWeight) return geometry;
  const vector = new THREE.Vector4();
  for (let i = 0; i < position.count; i += 1) {
    vector.set(position.getX(i), position.getY(i), position.getZ(i), 1);
    mesh.applyBoneTransform(i, vector);
    position.setXYZ(i, vector.x, vector.y, vector.z);
    if (!normal) continue;
    vector.set(normal.getX(i), normal.getY(i), normal.getZ(i), 0);
    mesh.applyBoneTransform(i, vector);
    const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    normal.setXYZ(i, vector.x / length, vector.y / length, vector.z / length);
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
  // 姿势已经烘死，蒙皮属性只是白占显存（远景层是 InstancedMesh，不会再蒙皮）。
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  return geometry;
}

export class ActorCrowd {
  /**
   * @param {THREE.Scene} scene
   * @param {import("./Script_Actor.mjs").ActorFactory} factory 已经 PreloadMeshes 过的工厂
   */
  constructor(scene, factory, { capacity = CROWD_CAPACITY, cellM = 0 } = {}) {
    this.scene = scene;
    this.factory = factory;
    this.capacity = Math.max(8, capacity | 0);
    this.cellM=cellM;
    // `${kind}:${poseId}` -> { meshes, count, dead, pose, skinnedParts, bounds, bodyBounds, triangles }
    this.kinds = new Map();
    // 每个 kind 的材质克隆（全部姿势桶共用一份，见 _Harvest 的注释）；Dispose 从这里收。
    this.materials = [];
    this.disposed = false;
    // 翻页参数在构造时取一次：Push 选桶与 _Poses 烘桶必须用同一个 N，
    // 半路改表会让 `run3` 指到一个没烘过的桶。
    this.runFrames = Math.max(0, Math.min(8, ACTOR_DETAIL.crowdRunFrames | 0));
    this.runFps = Math.max(0.2, ACTOR_DETAIL.crowdRunFps || 2.7);
    this.runSignal = Math.max(0, ACTOR_DETAIL.crowdRunSignal ?? 0.25);
    // 一个跑步循环多少秒。**烘焙时从资产量出来**（见 RunCycleSeconds）；量到之前
    // 用调参表的翻页帧率反推。翻页速度必须跟着资产走：RifleRun 实测 1.47 s，
    // 照 9 Hz 翻会把跑步放快三倍多。
    this.runCycleS = this.runFrames > 0 ? this.runFrames / this.runFps : 0.44;
    this.poses = this._Poses();
    /** 烘焙耗时取证：`{ totalMs, kinds: { ija: ms, ... }, poses: 桶数/kind }`。 */
    this.bakeStats = { totalMs: 0, kinds: {}, poses: this.poses.length };
    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this._scale = new THREE.Vector3(1, 1, 1);
  }

  /**
   * 姿势表。顺序即烘焙顺序，**倒地必须排最后**：`Actor.Ragdoll` 一进去就回不来了
   * （`ragdollState` 一置位，`Update` 直接走 PoseRagdoll 并 return），
   * 而这一整组姿势共用同一个 Actor（见 _BakeKind：造 Actor 是烘焙里最贵的一笔）。
   *
   * 跑步翻页：N 帧把**一个跑步循环**等分。循环时长在烘焙时从资产量出来
   * （`RunCycleSeconds`），不是猜的。N 由 `ACTOR_DETAIL.crowdRunFrames` 定，
   * 给 0 就整个关掉跑步桶（远景跑动的人退回站姿滑行，也就是这一轮之前的样子）。
   */
  _Poses() {
    const list = [
      { id: "standing", state: STANDING_STATE, ...POSE_BAKE.standing },
      { id: "kneel", state: KNEEL_STATE, ...POSE_BAKE.kneel },
      { id: "prone", state: PRONE_STATE, ...POSE_BAKE.prone },
    ];
    for (let i = 0; i < this.runFrames; i += 1) {
      list.push({ id: `run${i}`, state: RUN_STATE, ...POSE_BAKE.run, run: i });
    }
    list.push({ id: "dead", state: DEAD_BAKE_STATE, ...POSE_BAKE.dead, dead: true });
    return list;
  }

  /** 把 Actor 推到这一档姿势的稳态（seconds 秒，每步 dt）。 */
  _Settle(actor, pose) {
    const steps = Math.max(1, Math.round(pose.seconds / pose.dt));
    for (let i = 0; i < steps; i += 1) actor.Update(pose.dt, pose.state);
  }

  /**
   * 烘一个 kind 的整组远景姿势：造**一个** Actor，逐档摆好姿势、各收一份几何。
   *
   * 【为什么一个 kind 只造一个 Actor】造 Actor 要克隆整棵 GLB 骨骼与网格，是这条
   * 链路里最贵的一笔（实测 20 ms 里的一大半）。八档姿势各造一个的话光 clone 就要
   * 八遍；共用一个之后，每一档只多付「推到稳态 + 逐顶点烘骨骼 + 合并」。
   * 姿势本身没有跨档的残留：喂什么 state 就摆什么姿势，等够 `_Settle` 那段时间，
   * clip 的 crossFade 与蹲下的过渡状态机都已经走完。
   *
   * 几何一律 **clone 之后**再交给 MergeGeometries —— 它会 dispose 掉入参，
   * 而这些几何是 ActorFactory 按 kind 缓存、全场 Actor 共用的一份。
   */
  _BakeKind(kind) {
    const started = Now();
    const actor = this.factory.Create(kind, { seed: 4213 });
    // 烘焙不做贴地 IK。探针量的是「烘这一刻 root 恰好落在世界哪一点」的地面高度，
    // 与将来这批实例站的地方毫无关系，却会被整批人一起继承（六帧收敛一半的那个偏移）。
    // 关掉它，烘出来的姿势才是确定的、可复现的。
    actor.allowFootIk = false;
    const materials = new Map();
    let cycleS = 0;
    for (const pose of this.poses) {
      if (pose.run === undefined) {
        actor.characterRig?.ForceClip(null);
        this._Settle(actor, pose);
      } else if (pose.run === 0) {
        // Bake source phases at rate 1. Runtime travel speed belongs to the
        // instance's distance clock, not to these shared immutable meshes.
        actor.characterRig?.ForceClip('RifleRun');
        // 第一帧：淡入跑步 clip、把步态推到稳态，顺手量一个循环有多长。
        this._Settle(actor, pose);
        if(actor.characterRig?.currentAction){actor.characterRig.currentAction.time=0;actor.Update(0,pose.state);}
        cycleS = RunCycleSeconds(actor);
        if (cycleS > 0.05) this.runCycleS = cycleS;
      } else {
        // 后面每一帧：把循环等分推进。分成四小步而不是一大步 —— 蒙皮走 mixer
        // 时间、程序化走 gaitPhase，两条都是线性累积，但 Actor.Update 里还有几项
        // 按 dt 收敛的（后坐、拉栓），一大步会把它们推过头。
        const step = cycleS / this.runFrames / 4;
        for (let i = 0; i < 4; i += 1) actor.Update(step, pose.state);
      }
      this.kinds.set(`${kind}:${pose.id}`, this._Harvest(actor, kind, pose, materials));
    }
    actor.Dispose();
    if (cycleS > 0) this.bakeStats.runCycleS = Math.round(cycleS * 1000) / 1000;
    const ms = Now() - started;
    this.bakeStats.kinds[kind] = Math.round(ms * 10) / 10;
    this.bakeStats.totalMs = Math.round((this.bakeStats.totalMs + ms) * 10) / 10;
  }

  /**
   * 把 Actor 此刻的姿势收成一个姿势桶：逐网格变换到 root 局部空间、按材质合并、
   * 各配一个 InstancedMesh。
   *
   * @param {Map} materials 本 kind 的材质克隆表（源材质 -> 克隆）
   */
  _Harvest(actor, kind, pose, materials) {
    actor.root.updateMatrixWorld(true);
    // root 的 matrixWorld 里带着 ±4% 的身高随机缩放，求逆把它一并除掉：
    // 烘出来的是"标准身高"的模型，个体差交给实例矩阵。
    const inverse = new THREE.Matrix4().copy(actor.root.matrixWorld).invert();
    const local = new THREE.Matrix4();
    const byMaterial = new Map();
    // 取证用：整具与「人体那一部分」各自的包围盒。远景层退化成一支枪的时候，
    // 整具包围盒仍有枪撑着（0.6 m 见方）看不出问题，人体那一份会塌成一粒。
    const bounds = new THREE.Box3();
    const bodyBounds = new THREE.Box3();
    let skinnedParts = 0;
    actor.root.traverse((object) => {
      if (!object.isMesh || !object.geometry || !object.material || !object.visible) return;
      const skinned = object.isSkinnedMesh === true;
      const geometry = skinned ? BakeSkinnedPose(object) : object.geometry.clone();
      local.multiplyMatrices(inverse, object.matrixWorld);
      geometry.applyMatrix4(local);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
      if (skinned) { skinnedParts += 1; bodyBounds.union(geometry.boundingBox); }
      let list = byMaterial.get(object.material);
      if (!list) { list = []; byMaterial.set(object.material, list); }
      list.push(geometry);
    });

    const meshes = [];
    let triangles = 0;
    for (const [material, list] of byMaterial) {
      // 实例表拿自己的一份材质：与蒙皮人物共用同一个对象时，three 每次在 skinning 与
      // instancing 之间切换都要重新 getProgram（参数对象 + 缓存键拼串），一帧几百次。
      //
      // 但**同一个 kind 的各档姿势共用这一份克隆**：它们全是 InstancedMesh，
      // program 缓存键完全相同，共用只有好处 —— three 的渲染列表按材质排序，
      // 连着几只桶用同一个材质时 setProgram 里的 uniform 刷新会整段跳过；
      // 顺带省下 7 × 8 × kind 份材质对象与它们各自的 uniform 组。
      let clone = materials.get(material);
      if (!clone) {
        clone = CloneShadedMaterial(material);
        materials.set(material, clone);
        this.materials.push(clone);
      }
      let geometry = MergeGeometries(list);
      if(this.cellM>0){const detailed=geometry;geometry=ClusterDistantGeometry(detailed,this.cellM);detailed.dispose();}
      const mesh = new THREE.InstancedMesh(geometry, clone, this.capacity);
      mesh.name = `Crowd_${kind}_${PoseMeshName(pose.id)}`;
      // 自己做视锥剔除（Script_Ai 那边逐人判），而且实例散布在全场，
      // 用一个包围球去剔整批人只会在转身时整批闪掉
      mesh.frustumCulled = false;
      // 远景的人不投影：四百米外的影子一个像素都看不见，而阴影 pass 要多花一遍
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      // 空桶要**整只退出渲染列表**，不能只靠 three 的 primcount===0 早退。
      //
      // 【为什么】那条早退在 `renderInstances` 里，而 `renderBufferDirect` 已经先跑完
      // `setProgram`（材质状态、uniform 刷新、属性绑定）了 —— 一次不画一个像素的
      // 完整提交。姿势档从 2 涨到 8 之后，实测第一关前沿机位每帧的提交次数
      // 597 → 771（+174），其中约 114 次是空桶白跑的。`visible = false` 让
      // `projectObject` 直接不收它，那 114 次就不存在。
      //
      // 【为什么站姿档例外】着色器预热（`Script_Main.WarmupShaders`）是对整棵 scene
      // 挑代表件、真画一帧把 program 逼出来的；藏起来的件挑不到也画不出。
      // 但**同一个 kind 的八档共用一份材质**（见上面），program 缓存键完全相同，
      // 所以只要站姿档一直在场，其余七档的 program 就已经热着了。
      mesh.visible = pose.id === "standing";
      this.scene.add(mesh);
      meshes.push(mesh);
      triangles += geometry.index
        ? geometry.index.count / 3
        : geometry.attributes.position.count / 3;
    }
    return {
      meshes, count: 0, dead: !!pose.dead, pose: pose.id,
      // 空的时候可以整只退出渲染列表的桶（站姿档不行，见上面 mesh.visible 那一段）。
      optional: pose.id !== "standing",
      skinnedParts, bounds, bodyBounds, triangles,
      // 烘的是哪一条 clip（取证用）。卢沟桥 GLB 的 clip **名实不符**
      //（ProneFire 其实是站姿甩臂、StandFireCrouch 才是真匍匐），
      // 语义映射在 Script_CharacterModel.POSE_CLIPS，别按名字反推姿势。
      clip: typeof actor.characterRig?.currentAction?.getClip === "function"
        ? actor.characterRig.currentAction.getClip().name : null,
    };
  }

  /** 取一个姿势桶；这个 kind 还没烘过就整组烘出来。找不到的姿势退回站姿。 */
  _Bucket(kind, poseId = "standing") {
    if (!this.kinds.has(`${kind}:standing`)) this._BakeKind(kind);
    return this.kinds.get(`${kind}:${poseId}`) || this.kinds.get(`${kind}:standing`);
  }

  /** 旧口径（站/倒地两档）的取桶口，`BakeReport` 与外部调用仍用它。 */
  _Kind(kind, dead = false) {
    return this._Bucket(kind, dead ? "dead" : "standing");
  }

  /**
   * 进关时把这些 kind 的远景层先烘出来（整组姿势）。
   *
   * 远景层原本是「第一个走远的人」那一帧才烘：造 Actor、合并几何、建 InstancedMesh，
   * 然后那只 InstancedMesh 的 program 还要在同一帧现编（缓存键带 instancing，
   * 与蒙皮人物不是同一个 program）。装配层的着色器预热（Script_Main.WarmActorShaders）
   * 要把这一笔连同人物材质一起在加载画面后面付掉，所以先烘、再出画。
   * 已经烘过的 kind 直接跳过。耗时记在 `bakeStats`。
   */
  Prepare(kinds = []) {
    for (const kind of kinds) if (kind) this._Bucket(kind, "standing");
    return this;
  }

  /** 每帧开始：把计数清零。 */
  Begin() {
    for (const entry of this.kinds.values()) entry.count = 0;
  }

  /**
   * 放一个远景的人。
   *
   * @param {string} kind    nra / nraDare / ija
   * @param {THREE.Vector3} position 脚底位置
   * @param {number} yaw     朝向（弧度）
   * @param {number} scale   身高比例（1 = 标准）
   * @param {number} prone   活人姿态：0 站 / 1 卧（**旧签名的兼容参数**）
   * @param {boolean} dead   使用预烘焙的倒地姿态
   * @param {{stance?: number, moveSpeed?: number, crouch?: number,
   *          elapsed?: number, jitter?: number, phase?: number}|null} pose
   *        姿态信号。`stance` 0 站 / 1 蹲跪 / 2 卧；`moveSpeed` 0—1 的速度信号；
   *        跑步翻页的相位取 `elapsed`（秒）+ `jitter`，或直接给 `phase`（0—1），
   *        都不给就按位置网格 + 墙钟自己抖（见 _RunFrame）。
   *        **不传 pose 就是旧行为**：站姿桶 + 整体翻转当卧倒，一个像素都不变。
   */
  Push(kind, position, yaw, scale = 1, prone = 0, dead = false, pose = null) {
    if (this.disposed) return;
    const lie = dead ? 0 : Math.min(1, Math.max(0, prone));
    let poseId = "standing";
    // 卧倒的老做法：绕 X 转 −80° 再把身子放到接近地面。只在两种情况下还用它 ——
    // 旧签名的调用方，以及站→卧过渡的**半程**（真卧姿桶是定格的，半程只能靠翻转补）。
    let tilt = 0;
    if (dead) {
      poseId = "dead";
    } else if (pose) {
      const stance = pose.stance | 0;
      const moveSpeed = pose.moveSpeed ?? 0;
      if (stance === 2 || lie >= 0.5) {
        // 真卧姿：`Actor.PoseProne` 解出来的那一档，身子本来就贴着地，不再翻不再抬。
        poseId = "prone";
      } else if (this.runFrames > 0 && (Number.isFinite(pose.moveSpeedMps)
        ? pose.moveSpeedMps > ACTOR_LOCOMOTION.movingMps : moveSpeed > this.runSignal)) {
        poseId = `run${this._RunFrame(pose, position)}`;
      } else if (lie > 0.001) {
        tilt = lie;                       // 站→卧还在半路：翻转过渡，别在半程跳桶
      } else if (stance === 1 || (pose.crouch ?? 0) >= 0.5) {
        poseId = "kneel";
      }
    } else {
      tilt = lie;                          // 旧签名（六参数）：行为一字不改
    }
    const entry = this._Bucket(kind, poseId);
    const index = entry.count;
    if (index >= this.capacity) return;
    this._euler.set(-tilt * 1.4, yaw, 0);
    this._quat.setFromEuler(this._euler);
    this._pos.set(position.x, position.y + tilt * 0.28 * scale, position.z);
    this._scale.setScalar(scale);
    this._matrix.compose(this._pos, this._quat, this._scale);
    for (const mesh of entry.meshes) mesh.setMatrixAt(index, this._matrix);
    entry.count = index + 1;
  }

  /**
   * 跑步翻页取第几帧。三条取相位的路，从准到糙：
   *
   *   1) `pose.phase`（0—1）—— 正式 AI 的共享位移时钟；停步、变速仍连续。
   *   2) `pose.elapsed`（秒）+ `pose.jitter` —— 原速演示与旧调用方退路。
   *      `runCycleS` 是按 1 倍速烘焙的源循环，不混入某个演员的运行时步频。
   *   3) 都没有 —— 按 4 m 网格哈希 + 墙钟自己抖。只是别让全场同步，同一格里的人
   *      会一起翻；真要错开就把 elapsed 传进来。
   */
  _RunFrame(pose, position) {
    const n = this.runFrames;
    let phase = pose.phase;
    if (!Number.isFinite(phase)) {
      const cycle = this.runCycleS > 0.05 ? this.runCycleS : 0.44;
      if (Number.isFinite(pose.elapsed)) {
        phase = pose.elapsed / cycle + (pose.jitter || 0);
      } else {
        const cell = Math.floor(position.x / 4) * 0.37 + Math.floor(position.z / 4) * 0.11;
        phase = Now() / 1000 / cycle + cell;
      }
    }
    phase -= Math.floor(phase);
    const frame = Math.floor(phase * n);
    return frame < 0 ? 0 : (frame >= n ? n - 1 : frame);
  }

  /**
   * 每帧结束：把计数与脏标记交给渲染器。
   *
   * 两件事，都是为了「八档桶不能按八倍收钱」：
   *
   *   1) 空桶整只退出渲染列表（`visible = false`）—— 省掉一次不画像素的完整提交，
   *      理由与例外见 `_Harvest` 里 `mesh.visible` 那一段；
   *   2) 只上传 `[0, count)` 那一段实例矩阵。桶数从 2 涨到 8 之后，「无脑整块传」
   *      会从 28 × 32 KB/帧涨到 112 × 32 KB/帧（3.6 MB/帧、60 Hz 下 216 MB/s），
   *      而实际写进去的常常只有几十个人。空桶连脏标记都不设。
   */
  End() {
    for (const entry of this.kinds.values()) {
      const active = entry.count > 0;
      for (const mesh of entry.meshes) {
        mesh.count = entry.count;
        if (entry.optional) mesh.visible = active;
        if (!active) continue;
        mesh.instanceMatrix.addUpdateRange(0, entry.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** 本帧一共放了多少个远景的人（取证用）。 */
  get Count() {
    let n = 0;
    for (const entry of this.kinds.values()) n += entry.count;
    return n;
  }

  /** 本帧使用预烘焙倒地姿态的实例数（性能／可见性回归取证用）。 */
  get DeadCount() {
    let n = 0;
    for (const entry of this.kinds.values()) if (entry.dead) n += entry.count;
    return n;
  }

  /**
   * 本帧逐姿势桶的账：谁在用、用了几个人、要花几个 draw call。
   * `drawCalls` 只数**本帧真的会提交**的网格（空桶在 three 里早退，不算）。
   */
  PoseReport() {
    const poses = {};
    let drawCalls = 0;
    let instances = 0;
    for (const [key, entry] of this.kinds) {
      poses[key] = { count: entry.count, meshes: entry.meshes.length, triangles: entry.triangles };
      instances += entry.count;
      if (entry.count > 0) drawCalls += entry.meshes.length;
    }
    return {
      poses, drawCalls, instances, buckets: this.kinds.size,
      runFrames: this.runFrames, runCycleS: this.runCycleS, bake: this.bakeStats,
    };
  }

  /**
   * 烘焙尺寸取证口。**这是"46 m 外只剩一支枪"那条回归的闸门** ——
   * 逐人 renderLod 计数、实例数、可见性标记全都拦不住它：人照样被推进实例表，
   * 只是那具身体被缩成一粒。所以断言必须落在 body 的实际尺寸上（米）。
   *
   * @param {string[]} kinds 要现场烘出来量的身份；不传就只报已经烘过的。
   */
  BakeReport(kinds = []) {
    for (const kind of kinds) this._Bucket(kind, "standing");
    const out = {};
    for (const [key, entry] of this.kinds) {
      const size = new THREE.Vector3();
      const bodySize = new THREE.Vector3();
      if (!entry.bounds.isEmpty()) entry.bounds.getSize(size);
      if (!entry.bodyBounds.isEmpty()) entry.bodyBounds.getSize(bodySize);
      out[key] = {
        dead: entry.dead,
        pose: entry.pose,
        meshes: entry.meshes.length,
        triangles: entry.triangles,
        skinnedParts: entry.skinnedParts,
        size: [size.x, size.y, size.z],
        bodySize: [bodySize.x, bodySize.y, bodySize.z],
        // 站姿看高度、倒地看长度，统一取最长边，一条阈值同时管住所有姿势。
        bodySpan: Math.max(bodySize.x, bodySize.y, bodySize.z),
        // 人体的净高（跪比站矮、卧最矮）。像素级验收之外的一条数值旁证。
        bodyHeight: bodySize.y,
      };
    }
    return out;
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.kinds.values()) {
      for (const mesh of entry.meshes) {
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    // 材质是**按 kind 共用**的（一份挂在八档桶上），只能在这里统一收；
    // 跟着 mesh 逐件 dispose 会把同一份材质 dispose 七八遍。
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
    this.kinds.clear();
    this.bakeStats = { totalMs: 0, kinds: {}, poses: this.poses.length };
  }
}

/** 墙钟。纯 Node 的逻辑测试里没有 performance。 */
function Now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/**
 * 一个跑步循环有多长（秒）。翻页帧要按它等分，翻页帧率也该照它定
 * （`ACTOR_DETAIL.crowdRunFps` ≈ crowdRunFrames ÷ 这个数）。
 *
 * 蒙皮军人的姿势来自 `Script_CharacterModel` 的 clip，循环长度就是当前 action 的
 * clip 时长除以时间缩放（`RifleCrouchAdvance` 那一条会按实际移速改 timeScale）。
 * 百姓／兜底是程序化分件，步态在 `Actor.Update` 里按 `gaitPhase` 走：
 * 一个 gaitPhase 周期是两步，步频 = 1.6 + moveSpeed×2.9，满速就是 4.5 步/秒。
 */
function RunCycleSeconds(actor) {
  const action = actor?.characterRig?.currentAction;
  const clip = typeof action?.getClip === "function" ? action.getClip() : null;
  if (clip && clip.duration > 0.05) {
    const scale = Math.abs(action.getEffectiveTimeScale?.() ?? 1) || 1;
    return clip.duration / scale;
  }
  return 2 / (1.6 + 2.9);
}
