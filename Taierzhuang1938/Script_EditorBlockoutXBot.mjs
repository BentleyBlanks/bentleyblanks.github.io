// 白盒编辑器（预演 + 试玩）里的人物换成 Mixamo X Bot（2026-11-01，用户要求；对照表 Data_BlockoutXBotClips.mjs，
// 说明 docs/Data_EditorBlockout.md §18）。只在编辑器里用：正式关卡的 Actor / 人物模型 / AI 一行不动。
//
// 做法：原来的人物照常造、照常 Update（走位、朝向、片段层、步态、倒地、测躺姿、两人配合、被子与担架的抓点都还是它），
// 只是把它的蒙皮网格藏起来；同一个位置挂一个 X Bot（按阵营上色、按原身体的身高缩放），每帧照「原来那个人此刻在干什么」
// 播对应的动作：
//   · 预演片段（clip）→ XBOT_PREVIZ_CLIPS：Mixamo / 自制动作，或预先烘好的派生动作（士兵动作换算、左右镜像，Derived/）；
//   · 原生状态 → XBOT_NATIVE（姿势 × 动作 × 手里 × 据枪），倒地 → XBOT_DEATHS；
//   · 表里没有的、要精确贴位置的（顺着躺在被子 / 担架上、坐车）→ 当场把原身体的姿势换算到 X Bot（Script_XBotRetarget）。
// 原身体骨头上挂的东西（枪、背着的枪、手榴弹、刺刀这类道具）每帧挪到 X Bot 的同一根骨上：
// 播 Mixamo 端枪动作时枪按动作预览工具的标定放进右手（握把在右手掌心，枪管指向左手）；其余时候照原身体手和枪的相对位置。
import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as CloneSkinned } from "./vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { XBotRetarget, RestSkeleton, ToposortBones, BoneKey, XBOT_FROM_SOLDIER } from "./Script_XBotRetarget.mjs";
import { XBOT_PREVIZ_CLIPS, XBOT_NATIVE, XBOT_DEATHS, XBOT_LOOKS, XBOT_CHARACTER_LOOKS, XBOT_CHARACTER_UNITS, XBOT_MELEE } from "./Data_BlockoutXBotClips.mjs";

/** 这个人的配色：有名字的角色（castId，或没有 castId 的单位 id）各一种；其余按阵营的素色。 */
export function XBotLook({ faction = "nra", castId = null, unitId = null } = {}) {
  const key = (castId && XBOT_CHARACTER_LOOKS[castId] ? castId : null) || XBOT_CHARACTER_UNITS[unitId] || null;
  return key ? { key, ...XBOT_CHARACTER_LOOKS[key] } : { key: faction, ...(XBOT_LOOKS[faction] || XBOT_LOOKS.nra) };
}

export const XBOT = Object.freeze({
  base: "./Animation/Mixamo/",
  model: "Model_MixamoXBot.glb",
  /**
   * 换动作（2026-11-02 用户：好几个日军动作衔接不顺）：从上一帧看到的姿势淡到新动作，不用 mixer 的交叉淡入 ——
   * 那个只在两条 mixer 动作之间淡，进出「当场换算」、同一条动作里跳时间都是硬切。胯挪得越远淡得越久：
   * fadeS + 每米 fadePerM 秒，封顶 fadeMaxS（站 → 趴、站 → 蹲着扇耳光，0.2 s 一下子塌下去像掉帧）。
   */
  fadeS: 0.2,
  fadePerM: 0.4,
  fadeMaxS: 0.5,
  /**
   * 换动作的同一帧人被挪了这么远以内（片段自带位移，预演在片段交接时把根挪到片段末尾骨盆的位置）：胯从上一帧在世界里的
   * 位置接着淡，不跟着根跳一下再淡回来；更远的当真瞬移，胯照本地姿势淡（人跟着根走）。
   */
  rerootM: 3,
  /** 倒地那一刻头离地不到这么高（片段已经把人摔在地上了；跪着的头在 0.75 m 上下）：停在这个姿势，不再从站着放一遍倒地动作 */
  downHoldHeadM: 0.5,
  /** 枪在手里 ↔ 背上换了（不据枪就背枪的步态）：从上一帧看到的那支的位置挪过去，不一帧瞬移 */
  rifleSwapS: 0.3,
  /**
   * 走上 / 走下白盒的台阶块（站人的地面一帧高出 0.35 m，沟壁的坡也是一级级 0.6 m 往下掉的，§5.6）：这么高以内的高差按时间常数 stepS 秒跟过去，不一帧蹦上去；
   * 更高的照跟（换根、跳沟由换动作的过渡接住）
   */
  stepM: 0.8,
  stepS: 0.12,
  /** 跑和走的分界（m/s），同原生步态 */
  runMps: 2.2,
  /** 原地循环动作的播放速率夹在这个范围里（太慢像慢动作、太快像抽搐） */
  rate: [0.4, 2.2],
  /** 动作预览工具里标定步枪用的那条（第 0 帧两手都在枪上） */
  rifleCalibration: "Animation_Mixamo_RifleAimingIdle_V1.glb",
  /** 开一枪之后播开枪动作这么久（试玩里 AI 的 state.firing 只亮一帧） */
  fireHoldS: 0.35,
  /** 左手在枪管前方时把枪管转过去对准左手（同 Tool_MixamoAnimationPreview.html 的 AIM_AT_LEFT） */
  aimAtLeft: { near: 0.2, far: 0.75, maxAngle: THREE.MathUtils.degToRad(100) },
});

const SOLDIER_OF_XBOT = new Map(Object.entries(XBOT_FROM_SOLDIER).map(([s, x]) => [x, s]));
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s2 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/** 枪与手（_PlaceWeapon）：原身体掌心离枪身这么近算握着；X Bot 掌心离握点 near 内全拉、far 外不拉；淡入淡出时长。 */
const XBOT_GRIP = Object.freeze({ heldM: 0.2, near: 0.3, far: 0.5, blendS: 0.2, weightS: 0.12 });

/** 点到线段（[a, b]，b 为空时就是到点 a）的距离；点为空 → Infinity。 */
function SegmentDistance(p, [a, b]) {
  if (!p) return Infinity;
  if (!b) return p.distanceTo(a);
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/** 两个矩阵按 e 插值（位置线性、朝向球面、缩放线性）。 */
function BlendMatrix(from, to, e) {
  const p1 = new THREE.Vector3(), q1 = new THREE.Quaternion(), s1 = new THREE.Vector3(), p2 = new THREE.Vector3(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3();
  from.decompose(p1, q1, s1); to.decompose(p2, q2, s2);
  return new THREE.Matrix4().compose(p1.lerp(p2, e), q1.slerp(q2, e), s1.lerp(s2, e));
}

/** 朝 target 指数逼近（时间常数 tau 秒）。 */
function Approach(value, target, dt, tau) { return value + (target - value) * (1 - Math.exp(-Math.max(dt, 0) / tau)); }

/** 骨头在世界空间里再转 q（左乘），换回本地写进去。 */
function RotateBoneWorld(bone, q) {
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()), world = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.invert().multiply(q.multiply(world)));
  bone.updateWorldMatrix(false, true);
}

function SetBoneWorldQuaternion(bone, world) {
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(false, true);
}

function Palm(hand, middle, out) {
  hand.getWorldPosition(out);
  return middle ? out.lerp(middle.getWorldPosition(_p2), 0.55) : out;
}

/**
 * 一具蒙皮的初始姿势（模型空间 = rootSpace 的本地空间）：父在前排好，供 XBotRetarget 用。读的是骨头此刻的世界矩阵，
 * 所以 rootSpace 必须是没动过的原件（GLTFLoader 读进来的 scene，从没播过动作）。不用 boneInverses：
 * 人物克隆（CloneSkinnedRig）时按克隆那一刻的世界位置重绑过，boneInverses 与 bindMatrix 对不上原件的空间。
 */
function SkinRest(rootSpace, mesh) {
  rootSpace.updateMatrixWorld(true);
  const bones = mesh.skeleton.bones, rootInv = new THREE.Matrix4().copy(rootSpace.matrixWorld).invert();
  const parents = bones.map(b => bones.indexOf(b.parent));
  const order = ToposortBones(parents), position = new Map(order.map((i, k) => [i, k]));
  const list = order.map(i => ({
    name: bones[i].name, parent: parents[i] >= 0 ? position.get(parents[i]) : -1,
    world: new THREE.Matrix4().multiplyMatrices(rootInv, bones[i].matrixWorld),
    local: { p: bones[i].position.toArray(), q: bones[i].quaternion.toArray() },
  }));
  return { rest: new RestSkeleton(list), bones: order.map(i => bones[i]) };
}

function FirstSkinnedMesh(root) {
  let found = null;
  root.traverse(o => { if (!found && o.isSkinnedMesh) found = o; });
  return found;
}

/** 整套 X Bot 资源（一份）+ 每个人一份的 XBotSkin。 */
export class XBotSkins {
  constructor({ base = XBOT.base } = {}) {
    this.base = base;
    this.loader = new GLTFLoader();
    this.ready = false;
    this.failed = null;
    this.clips = new Map();       // file → Promise<AnimationClip>（已按播放方式处理过根位移）
    this.loaded = new Map();      // file → AnimationClip（读完的）
    this.sourceRests = new Map(); // 原身体模型号 → { rest, retarget, headY }
    this.materials = new Map();
    this.loading = null;
  }

  Load() {
    if (!this.loading) this.loading = this._Load().catch((error) => { this.failed = error; console.warn("[XBot] load failed", error); });
    return this.loading;
  }

  async _Load() {
    const [gltf, library, derived] = await Promise.all([
      this.loader.loadAsync(this.base + XBOT.model),
      fetch(this.base + "Data_MixamoLibrary.json").then(r => r.json()),
      fetch(this.base + "Derived/Data_XBotDerived.json").then(r => (r.ok ? r.json() : { clips: {} })),
    ]);
    this.source = gltf.scene;
    this.library = new Map(library.clips.map(c => [c.file, c]));
    this.derived = derived.clips || {};
    const mesh = FirstSkinnedMesh(this.source);
    const { rest, bones } = SkinRest(this.source, mesh);
    this.rest = rest;
    const hips = bones.find(b => b.name === "Hips");
    this.source.updateMatrixWorld(true);
    this.rootParent = new THREE.Matrix4().copy(this.source.matrixWorld).invert().multiply(hips.parent.matrixWorld);
    this.hipsParentInv = this.rootParent.clone().invert();
    this.headY = rest.worldP[rest.Find("Head")].y;
    await this._CalibrateRifle();
    this.ready = true;
  }

  /** 同动作预览工具：端枪瞄准待机第 0 帧，握把放进右手掌心、枪管指向左手掌心、准星朝上，记下枪相对右手的位置朝向。 */
  async _CalibrateRifle() {
    const model = CloneSkinned(this.source);
    const clip = await this.Clip(XBOT.rifleCalibration, { pin: true });
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play(); mixer.update(0);
    model.updateMatrixWorld(true);
    const B = (n) => model.getObjectByName(n);
    const right = Palm(B("RightHand"), B("RightHandMiddle1"), new THREE.Vector3());
    const left = Palm(B("LeftHand"), B("LeftHandMiddle1"), new THREE.Vector3());
    const z = right.clone().sub(left).normalize();
    const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const rifleQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    B("RightHand").matrixWorld.decompose(_p, _q, _s);
    const inv = _q.clone().invert();
    this.rifleOffset = { position: right.sub(_p).applyQuaternion(inv), quaternion: inv.multiply(rifleQ) };
    mixer.stopAllAction();
  }

  /**
   * 读一条动作（Animation/Mixamo 下的相对路径）。根位移：循环动作去掉匀速前进的那部分（左右晃留着），
   * 一次性动作 Hips 的水平位置钉在第 0 帧（人由编辑器搬，不让动作自己往前蹿）；派生动作原样（换算出来的位移就是原身体的位移）。
   */
  Clip(file, { pin = null } = {}) {
    if (!this.clips.has(file)) {
      this.clips.set(file, this.loader.loadAsync(this.base + file).then((gltf) => {
        const clip = gltf.animations[0];
        clip.name = file;
        const entry = this.library?.get(file);
        const derived = file.startsWith("Derived/");
        const loop = entry?.loop ?? false;
        if (!derived && !entry?.inPlace) this._FixRoot(clip, pin ?? !loop);
        this.loaded.set(file, clip);
        return clip;
      }));
    }
    return this.clips.get(file);
  }

  _FixRoot(clip, pinAll) {
    const track = clip.tracks.find(t => t.name === "Hips.position");
    if (!track || !this.rootParent) return;
    const v = track.values, n = v.length / 3, model = [];
    for (let i = 0; i < n; i++) model.push(new THREE.Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).applyMatrix4(this.rootParent));
    // 拷一份：下面的循环会把 model[0] 先换回本地空间，引用会被改掉
    const first = model[0].clone(), last = model[n - 1].clone();
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? i / (n - 1) : 0;
      if (pinAll) { model[i].x = first.x; model[i].z = first.z; }
      else { model[i].x -= (last.x - first.x) * a; model[i].z -= (last.z - first.z) * a; }
      model[i].applyMatrix4(this.hipsParentInv);
      v.set(model[i].toArray(), i * 3);
    }
  }

  /** 同一种配色的人共用材质（都是同一套蒙皮，不会来回换着色器）。 */
  Material(look, part) {
    const key = `${look.key}:${part}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshStandardMaterial({ color: part === "joints" ? look.joints : look.surface, roughness: 0.62, metalness: 0.05 }));
    }
    return this.materials.get(key);
  }

  /** 原身体那具模型的初始姿势与换算器（同一模型号共用）。 */
  SourceRest(rig) {
    const key = rig.modelId || "default";
    if (!this.sourceRests.has(key)) {
      // 初始姿势从这具模型读进来的原件量（rig.asset.gltf.scene，克隆的源，从不播动作）
      const original = rig.asset?.gltf?.scene;
      const mesh = original && FirstSkinnedMesh(original);
      if (!mesh) return null;
      const { rest } = SkinRest(original, mesh);
      this.sourceRests.set(key, { rest, retarget: new XBotRetarget(rest, this.rest, { targetParentOfRoot: this.rootParent }),
        headY: rest.worldP[rest.Find("Bip001_Head")]?.y || 1.55 });
    }
    return this.sourceRests.get(key);
  }

  /** 给一个人挂 X Bot；资源没读完或这个人没有骨骼身体（旧的体块 / tzm 百姓）返回 null。 */
  Attach(actor, { faction = "nra", castId = null, unitId = null } = {}) {
    if (!this.ready || !actor?.characterRig?.root) return null;
    return new XBotSkin(this, actor, faction, XBotLook({ faction, castId, unitId }));
  }
}

/** 一个人身上的 X Bot。 */
export class XBotSkin {
  constructor(skins, actor, faction, look) {
    this.skins = skins;
    this.actor = actor;
    this.rig = actor.characterRig;
    this.faction = faction;
    this.look = look;
    this.model = CloneSkinned(skins.source);
    this.model.name = "XBot";
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      // 蒙皮包围球冻在第一帧的姿势（趴下、倒地会被误剔），编辑器里人不多，不剔
      o.frustumCulled = false;
      o.material = skins.Material(look, /joint/i.test(o.material?.name || "") ? "joints" : "surface");
    });
    this.container = new THREE.Group();
    this.container.name = "XBotSkin";
    this.container.add(this.model);
    this.rig.root.parent?.add(this.container);
    this.bones = new Map();
    this.model.traverse(o => { if (o.isBone) this.bones.set(o.name, o); });
    this.boneList = skins.rest.bones.map(b => this.bones.get(b.name));
    this.mixer = new THREE.AnimationMixer(this.model);
    this.source = skins.SourceRest(this.rig);
    this.scaleK = this.source ? this.source.headY / skins.headY : 0.97;
    this.hidden = [];
    this.rig.root.traverse(o => { if (o.isSkinnedMesh) this.hidden.push(o); });
    this.srcBones = this.source ? this.source.rest.bones.map(b => this.rig.root.getObjectByName(b.name)) : [];
    this.srcQ = this.srcBones.map(() => new THREE.Quaternion());
    this.outQ = skins.rest.bones.map(() => new THREE.Quaternion());
    this.outHips = new THREE.Vector3();
    this.attachments = [];
    this.attachScan = -1;
    this.current = null;     // { file, action, clock, mode }
    this.pending = null;
    this.frame = 0;
    this.wasDown = null;
    this.rifleOnLeft = null;
    this.H = (n) => this.bones.get(n);
    // 换动作的过渡（XBOT.fadeS）：mixer 只在值变了的时候才写骨头（three PropertyMixer），过渡和握枪 IK 改过的骨头
    // 下一帧要先还原成 mixer 上一次写的值（base），不然停住的动作会把改过的值留着
    this.base = this.boneList.map(() => new THREE.Quaternion());
    this.baseHips = new THREE.Vector3();
    this.baseValid = false;
    // 上一帧最后看到的姿势（过渡、IK 之后）：本地朝向，胯另记世界 / 本地两份
    this.shownQ = this.boneList.map(() => new THREE.Quaternion());
    this.shownHips = new THREE.Vector3();
    this.shownHipsLocal = new THREE.Vector3();
    this.shownAt = new THREE.Vector3();
    this.shownContainer = new THREE.Matrix4();
    this.holdLocal = null;   // 停在倒地姿势时容器挂在人物根下的位姿
    this.shownHeadY = 0;
    this.shownValid = false;
    this.stepY = 0;          // 容器跟着根的高度（XBOT.stepM 以内的台阶平滑跟）
    this.rawY = 0;
    this.blend = null;       // { q, hips（本地）, t, dur }
    this.pickKey = null;
    this.jumped = false;
    this.downHold = false;
    this.prevDown = false;
    this.rifleShown = null;  // { which: "hand" | "back", local }
    this.rifleSwap = null;
  }

  get visible() { return this.container.visible; }

  /**
   * 每帧（原身体 Update 之后）调一次。intent：
   *   clip / clipSeconds / clipDuration / clipLoop  预演片段与它在原片段里的秒数
   *   throwSeconds   投弹片段的秒数（预演 throw 键）
   *   mps / stance / aim / carryRole / woundedWalk / talking   原生状态
   *   melee          白刃导演给的姿态（Script_MeleeCombat.Pose：weapon / action / animationNormalized …），没在拼刺刀为空
   *   down           倒地；exact  要精确贴位置（顺着躺、坐车）→ 当场换算原身体的姿势
   *   firing         这一帧开了枪（试玩的 AI）→ 播 fireHoldS 秒开枪动作
   *   shadow         投不投影
   */
  Sync(intent, dt) {
    const rig = this.rig, actor = this.actor;
    this.frame += 1;
    const visible = actor.root.visible !== false && rig.root.visible !== false;
    this.container.visible = visible;
    for (const mesh of this.hidden) mesh.visible = false;
    // 藏起来过：再出来时没人看见它之前的样子，直接摆当前姿势（不从藏起来那一刻的姿势淡）
    if (!visible) { this.shownValid = false; this.blend = null; this._EndRifleSwap(); this.rifleShown = null; return; }
    this.container.position.copy(rig.root.position);
    this.container.quaternion.copy(rig.root.quaternion);
    this.container.scale.copy(rig.root.scale).multiplyScalar(this.scaleK);
    this.container.updateMatrixWorld(true);
    // 台阶：地面高度在人物根（容器的上两层）上，按世界高度平滑，再把差值折回容器的本地 y
    // 按原始高度这一帧变了多少判断是台阶还是瞬移（顺着一级级的坡往下走，平滑出来的高度会越落越后，不能拿它比）
    const worldY = this.container.matrixWorld.elements[13], rawStep = worldY - this.rawY;
    this.rawY = worldY;
    if (this.shownValid && Math.abs(rawStep) < XBOT.stepM) this.stepY += (worldY - this.stepY) * (1 - Math.exp(-Math.max(dt, 0) / XBOT.stepS));
    else this.stepY = worldY;
    if (Math.abs(this.stepY - worldY) > 1e-5) {
      this.container.parent.matrixWorld.decompose(_p, _q, _s);
      this.container.position.y += (this.stepY - worldY) / (_s.y || 1);
      this.container.updateMatrixWorld(true);
    }
    if (intent.shadow !== undefined && !!intent.shadow !== this.shadow) {
      this.shadow = !!intent.shadow;
      this.model.traverse(o => { if (o.isMesh) o.castShadow = this.shadow; });
    }

    this.fireT = intent.firing ? XBOT.fireHoldS : Math.max(0, (this.fireT || 0) - dt);
    const pick = this._Pick(intent);
    this.jumped = false;
    // 停在倒地姿势时，藏起来的原身体还在放它自己的倒地、布娃娃（actor.body 一上一下、在坡上会滑）：X Bot 改挂到人物根
    // （actor.root：只有预演摆它 —— 位置、朝向、藏不藏），停住那一刻相对它在哪就一直在哪；预演挪人（下一段换位置）照样跟着走
    const root = this.actor.root;
    if (pick.mode === "hold") {
      if (!this.holdLocal) {
        root.updateWorldMatrix(true, false);
        this.holdLocal = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(this.shownContainer);
        if (this.container.parent !== root) root.add(this.container);
      }
      this.holdLocal.decompose(this.container.position, this.container.quaternion, this.container.scale);
      this.container.updateMatrixWorld(true);
      this.stepY = this.rawY = this.container.matrixWorld.elements[13];
    } else {
      this.holdLocal = null;
      // 站起来了（预演把倒地的人扶起来）：挂回原来的位置
      if (this.container.parent === root && rig.root.parent && rig.root.parent !== root) {
        rig.root.parent.add(this.container);
        this.container.position.copy(rig.root.position);
        this.container.quaternion.copy(rig.root.quaternion);
        this.container.scale.copy(rig.root.scale).multiplyScalar(this.scaleK);
        this.container.updateMatrixWorld(true);
      }
    }
    if (pick.mode === "hold") this._Hold();
    else if (pick.mode === "mirror" || !pick.file) this._Mirror(dt);
    else this._Play(pick, intent, dt);
    // 换了动作（或同一条动作跳了时间）：从上一帧看到的姿势淡过去
    // 按这一帧实际摆出来的算（动作还没读到时照原身体换算，读到那一帧也是换动作）
    const key = pick.mode === "hold" ? this.pickKey : !this.current || this.current.mirror ? "mirror" : pick.file + (pick.death ? "|death" : "");
    if (this.shownValid && (key !== this.pickKey || this.jumped)) this._BeginBlend();
    this.pickKey = key;
    this._ApplyBlend(dt);
    this.container.updateMatrixWorld(true);
    this._Reanchor(pick.mode === "hold" ? this.pick || pick : pick, dt);
    this._Remember(intent);
  }

  /** 这一帧最后看到的姿势（IK、枪都摆完之后）：下一次换动作从它淡过去。 */
  _Remember(intent) {
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.shownQ[i].copy(this.boneList[i].quaternion);
    const hips = this.H("Hips"), head = this.H("Head");
    if (hips) { hips.getWorldPosition(this.shownHips); this.shownHipsLocal.copy(hips.position); }
    this.shownHeadY = head ? head.getWorldPosition(_p).y : this.shownHips.y;
    this.container.getWorldPosition(this.shownAt);
    this.shownContainer.copy(this.container.matrixWorld);
    this.shownValid = !!hips;
    this.prevDown = !!intent.down;
  }

  /** 从上一帧看到的姿势起一段过渡。根这一帧挪了 rerootM 以内：胯照它在世界里的位置换到新的根下（片段换根不跳）。 */
  _BeginBlend() {
    const hips = this.H("Hips");
    const b = this.blend || (this.blend = { q: this.boneList.map(() => new THREE.Quaternion()), hips: new THREE.Vector3(), t: 0, dur: null });
    for (let i = 0; i < this.boneList.length; i++) b.q[i].copy(this.shownQ[i]);
    const moved = this.container.getWorldPosition(_p).distanceTo(this.shownAt);
    if (moved <= XBOT.rerootM) {
      hips.parent.updateWorldMatrix(true, false);
      b.hips.copy(this.shownHips).applyMatrix4(_m.copy(hips.parent.matrixWorld).invert());
    } else b.hips.copy(this.shownHipsLocal);
    b.t = 0;
    b.dur = null;
  }

  _ApplyBlend(dt) {
    const b = this.blend, hips = this.H("Hips");
    if (!b || !hips) return;
    if (b.dur === null) {
      // 胯要挪多远（世界米）定这段过渡多长
      hips.parent.updateWorldMatrix(true, false);
      const from = _p.copy(b.hips).applyMatrix4(hips.parent.matrixWorld), to = hips.getWorldPosition(_p2);
      b.dur = THREE.MathUtils.clamp(XBOT.fadeS + XBOT.fadePerM * from.distanceTo(to), XBOT.fadeS, XBOT.fadeMaxS);
    }
    b.t += Math.max(dt, 0);
    const k = Math.min(1, b.t / b.dur), e = k * k * (3 - 2 * k);
    for (let i = 0; i < this.boneList.length; i++) {
      const bone = this.boneList[i];
      if (!bone) continue;
      _q.copy(bone.quaternion);
      if (_q.dot(b.q[i]) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      bone.quaternion.slerpQuaternions(b.q[i], _q, e);
    }
    hips.position.lerpVectors(b.hips, _p.copy(hips.position), e);
    if (k >= 1) this.blend = null;
  }

  /** 停在倒地前最后那个姿势（XBOT.downHoldHeadM）：骨头还原成 mixer 上一次写的值，不推时间。 */
  _Hold() {
    // 倒下那一刻还在当场换算（动作文件还没读到）：没有 mixer 的值，就停在最后看到的那个姿势
    if (!this.baseValid) {
      for (let i = 0; i < this.boneList.length; i++) this.base[i].copy(this.shownQ[i]);
      this.baseHips.copy(this.shownHipsLocal);
      this.baseValid = true;
    }
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.boneList[i].quaternion.copy(this.base[i]);
    this.H("Hips")?.position.copy(this.baseHips);
  }

  /** 这一帧播什么：{ mode: "clip" | "mirror", file, time?, rate?, loop, once, hold, rifleHand } */
  _Pick(intent) {
    const skins = this.skins;
    if (!intent.down) this.downHold = false;
    if (intent.exact) return { mode: "mirror" };
    // 白刃战：刺刀的上步 / 退步 / 刺 / 挡 / 砸 / 推用「刺刀专项」（XBOT_MELEE）；戒备、僵持、倒地和大刀照原身体当场换算
    if (intent.melee) {
      const m = intent.melee, entry = m.weapon && m.weapon !== "Dadao" ? XBOT_MELEE[m.action] : null;
      if (!entry) return { mode: "mirror" };
      const lib = skins.library.get(entry.file);
      if (entry.loop) return { mode: "clip", file: entry.file, loop: true, hold: lib?.hold, key: "melee" + m.action };
      const n = Number.isFinite(m.animationNormalized) ? m.animationNormalized : Number.isFinite(m.normalized) ? m.normalized : 0;
      return { mode: "clip", file: entry.file, once: true, normalized: THREE.MathUtils.clamp(n, 0, 1), hold: lib?.hold, key: "melee" + m.action };
    }
    if (intent.down) {
      // 预演片段已经把人摔在地上了（中枪倒地、被砍倒放完、按住不动）：就停在这个姿势。原来在这里从站着放一遍倒地动作，
      // 等于死了的人站起来再死一次（11-02 取证：02-2 的七个日军和翻译全是这样）
      if (this.downHold || (!this.prevDown && this.shownValid && this.shownHeadY - this.shownAt.y < XBOT.downHoldHeadM)) {
        this.downHold = true;
        return { mode: "hold" };
      }
      const death = XBOT_DEATHS[this.rig.deathVariantId] || XBOT_DEATHS.DeathCollapseA;
      return { mode: "clip", file: death.file, once: true, death: true };
    }
    if (Number.isFinite(intent.throwSeconds)) {
      const entry = this.faction === "ija" ? XBOT_NATIVE.grenadeIja : XBOT_NATIVE.grenadeNra;
      const source = this.rig.clipById?.get?.("GrenadeThrow")?.duration || 2.5;
      return { mode: "clip", file: entry.file, sourceSeconds: intent.throwSeconds, sourceDuration: source, once: true };
    }
    if (intent.clip) {
      const entry = XBOT_PREVIZ_CLIPS[intent.clip];
      if (!entry) return { mode: "mirror" };
      const file = entry.retarget || entry.mirror ? (skins.derived[intent.clip] ? `Derived/${skins.derived[intent.clip].file}` : null) : entry.file;
      if (!file) return { mode: "mirror" };
      const lib = skins.library.get(file);
      return { mode: "clip", file, sourceSeconds: intent.clipSeconds || 0, sourceDuration: intent.clipDuration || null,
        loop: intent.clipLoop ?? lib?.loop ?? false, travel: entry.speedMps && intent.mps > 0.05 ? entry.speedMps : null,
        derived: !!(entry.retarget || entry.mirror), hold: entry.retarget ? null : lib?.hold, rifleHand: lib?.rifleHand };
    }
    const rifle = this._RifleInHands();
    if (this.fireT > 0 && rifle) {
      const fire = intent.stance === "prone" ? XBOT_NATIVE.fireProne : intent.stance === "crouch" ? XBOT_NATIVE.fireCrouch : XBOT_NATIVE.fireStand;
      return { mode: "clip", file: fire.file, once: true, hold: "端枪", key: "fire" };
    }
    const key = NativeKey(intent, rifle);
    const entry = XBOT_NATIVE[key];
    if (!entry) return { mode: "mirror" };
    const lib = skins.library.get(entry.file);
    return { mode: "clip", file: entry.file, loop: lib?.loop ?? true, speedMps: entry.speedMps || null, key, hold: lib?.hold, rifleHand: lib?.rifleHand };
  }

  _RifleInHands() {
    const w = this.actor.weaponGroup;
    if (!w || !this.actor.weaponId) return false;
    if (this.actor.weaponData?.kind === "melee") return false;
    for (let o = w; o; o = o.parent) if (o.visible === false) return false;
    return true;
  }

  _Play(pick, intent, dt) {
    const clip = this.skins.loaded.get(pick.file);
    if (!clip) {
      // 还没读到：先读着，这一帧照原身体换算（不站着发呆）
      this.skins.Clip(pick.file);
      this._Mirror(dt);
      return;
    }
    let cur = this.current;
    if (!cur || cur.file !== pick.file) {
      // 换动作：旧的停掉、绑定全扔（新绑定第一帧每根骨都写，不会留着上一条 / 当场换算的值），淡入交给 _BeginBlend
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.baseValid = false;
      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(pick.once || !pick.loop ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.timeScale = 0;              // 时间自己管（按原片段秒数 / 实际速度）
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.play();
      // 一进来就是倒着的人（造出来就倒在地上）：直接到最后一帧
      const startAtEnd = pick.death && this.wasDown === null;
      cur = this.current = { file: pick.file, action, clock: startAtEnd ? clip.duration : 0, mirror: false, lastT: null };
    } else if (this.baseValid) {
      // 同一条动作：先还原 mixer 上一次写的值（过渡、IK 改过的骨头 mixer 不会重写）
      for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.boneList[i].quaternion.copy(this.base[i]);
      this.H("Hips")?.position.copy(this.baseHips);
    }
    const D = clip.duration;
    let t;
    if (Number.isFinite(pick.normalized)) {
      // 白刃动作：按这一下的进度对齐（出刀、格挡的时刻跟游戏里判定的那一刻大致对上）
      t = pick.normalized * D;
    } else if (Number.isFinite(pick.sourceSeconds) && !pick.travel) {
      // 预演片段 / 投弹：按原片段里的秒数换算（循环按圈对齐，一次性按比例）
      const S = pick.sourceDuration || D;
      if (pick.derived) t = pick.loop ? pick.sourceSeconds % D : Math.min(D, pick.sourceSeconds);
      else if (pick.loop) t = ((pick.sourceSeconds % S) / S) * D;
      else t = Math.min(D, (pick.sourceSeconds / S) * D);
    } else {
      const k = this.container.scale.x || 1;
      const mps = intent.mps || 0;
      const nominal = pick.speedMps || pick.travel;
      let rate = 1;
      if (nominal) rate = mps > 0.05 ? THREE.MathUtils.clamp(mps / (nominal * k), XBOT.rate[0], XBOT.rate[1]) : 0;
      cur.clock += dt * rate;
      t = pick.loop && !pick.once ? cur.clock % D : Math.min(D, cur.clock);
    }
    // 同一条动作里时间跳了（预演换了一个片段却映到同一条 Mixamo 动作、重新从头放、Seek）：也要淡，不硬切
    if (cur.lastT !== null) {
      let d = Math.abs(t - cur.lastT);
      if (pick.loop && !pick.once) d = Math.min(d, D - d);
      if (d > 0.2 + 2.5 * Math.max(dt, 0)) this.jumped = true;
    }
    cur.lastT = t;
    cur.action.time = t;
    this.wasDown = !!pick.death;
    this.mixer.update(dt);
    for (let i = 0; i < this.boneList.length; i++) if (this.boneList[i]) this.base[i].copy(this.boneList[i].quaternion);
    this.H("Hips") && this.baseHips.copy(this.H("Hips").position);
    this.baseValid = true;
    this.pick = pick;
  }

  /** 当场把原身体的姿势换算到 X Bot（表里没有的、要精确贴位置的）。 */
  _Mirror(dt) {
    const source = this.source;
    if (!source) return;
    if (!this.current?.mirror) {
      this.mixer.stopAllAction();
      this.current = { mirror: true };
    }
    this.baseValid = false;
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    _inv.copy(rig.root.matrixWorld).invert();
    rig.root.matrixWorld.decompose(_p, _q, _s);
    const rootQinv = _q.clone().invert();
    for (let i = 0; i < this.srcBones.length; i++) {
      const bone = this.srcBones[i];
      if (!bone) continue;
      bone.matrixWorld.decompose(_p2, _q2, _s2);
      this.srcQ[i].copy(rootQinv).multiply(_q2);
    }
    const pelvis = this.srcBones[source.rest.Find("Bip001_Pelvis")];
    const pelvisPos = pelvis ? pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(_inv) : new THREE.Vector3();
    source.retarget.Solve(this.srcQ, pelvisPos, this.outQ, this.outHips);
    this.boneList.forEach((bone, i) => { if (bone) bone.quaternion.copy(this.outQ[i]); });
    this.H("Hips")?.position.copy(this.outHips);
    this.pick = { mode: "mirror" };
  }

  /**
   * 原身体骨头上挂的东西挪到 X Bot 身上（2026-11-01 第二版：枪单独处理 + 双手 IK）。游戏代码写的本地矩阵记作「本意」，
   * 写回去的本地矩阵记下来，下一帧发现被游戏改过（换枪、背枪、片段道具轨）就换成新的本意。
   *   · 手里的枪（_PlaceWeapon）：先定枪的位姿，再把 X Bot 的手 IK 到枪的握点上；
   *   · 其余挂件（背着的枪、钢盔、刀鞘、手里的道具）按原身体那根骨挪到 X Bot 同一根骨上（在 IK 之后，跟着手走）。
   */
  _Reanchor(pick, dt = 0) {
    if (this.frame - this.attachScan > 30 || this.attachWeapon !== this.actor.weaponGroup) this._ScanAttachments();
    this.rig.root.updateMatrixWorld(true);
    for (const a of this.attachments) {
      const object = a.object;
      object.updateMatrix();
      // 挂件本身就是枪（片段道具轨把枪直接挂在 rig.root 下）时，上一帧写的是枪（wWritten）
      const mine = a.written || (object === this.actor.weaponGroup ? a.wWritten : null);
      if (!mine || !object.matrix.equals(mine)) a.intended = object.matrix.clone();
    }
    const weapon = this._RifleInHands() ? this.attachments.find(a => a.holdsWeapon) : null;
    const placed = weapon ? this._PlaceWeapon(weapon, pick, dt) : false;
    if (!weapon) { this.lastMount = null; this.contact = null; }
    if (!placed) { this.ikR = 0; this.ikL = 0; }
    for (const a of this.attachments) {
      if (a === weapon && placed) continue;
      this._ReanchorOne(a, a === weapon);
    }
    this._RifleSwapStep(placed ? weapon : null, dt);
  }

  /**
   * 枪从手里换到背上（不据枪就背枪，Script_RelaxedGait）或反过来：背上那支是手里那支的克隆（原点一样），
   * 新露出来的那支从上一帧看到的位置（容器本地）XBOT.rifleSwapS 秒挪到它该在的地方。
   */
  _RifleSwapStep(weapon, dt) {
    const hand = weapon ? this.actor.weaponGroup : null;
    const backRifle = this.rig.relaxedGaitRifle;
    let back = null;
    if (!hand && backRifle) { back = backRifle; for (let o = backRifle; o; o = o.parent) if (o.visible === false) { back = null; break; } }
    const now = hand || back, which = hand ? "hand" : back ? "back" : null;
    if (this.rifleSwap && this.rifleSwap.object !== now) this._EndRifleSwap();
    if (now && this.rifleShown && this.rifleShown.which !== which) {
      this.rifleSwap = { object: now, from: this.rifleShown.local.clone(), t: 0, rest: now === back ? now.matrix.clone() : null, weapon };
    }
    const swap = this.rifleSwap;
    if (swap) {
      swap.t += Math.max(dt, 0);
      const k = Math.min(1, swap.t / XBOT.rifleSwapS), e = k * k * (3 - 2 * k);
      // 背上那支的本地位姿游戏只在造它时写一次：每帧从原值算目标，淡完还原
      if (swap.rest) swap.rest.decompose(now.position, now.quaternion, now.scale);
      now.updateMatrix();
      now.updateWorldMatrix(true, false);
      const target = new THREE.Matrix4().copy(this.container.matrixWorld).invert().multiply(now.matrixWorld);
      const world = new THREE.Matrix4().copy(this.container.matrixWorld).multiply(BlendMatrix(swap.from, target, e));
      new THREE.Matrix4().copy(now.parent.matrixWorld).invert().multiply(world).decompose(now.position, now.quaternion, now.scale);
      now.updateMatrix();
      // 手里那支：_PlaceWeapon 下一帧按 wWritten 认出这是自己写的，不当成游戏的本意
      if (swap.weapon && now === hand) swap.weapon.wWritten = now.matrix.clone();
      now.updateMatrixWorld(true);
      if (k >= 1) this._EndRifleSwap();
    }
    if (now) {
      now.updateWorldMatrix(true, false);
      const local = this.rifleShown?.local || new THREE.Matrix4();
      this.rifleShown = { which, local: local.copy(this.container.matrixWorld).invert().multiply(now.matrixWorld) };
    } else this.rifleShown = null;
  }

  _EndRifleSwap() {
    const s = this.rifleSwap;
    if (!s) return;
    if (s.rest) { s.rest.decompose(s.object.position, s.object.quaternion, s.object.scale); s.object.updateMatrix(); s.object.updateMatrixWorld(true); }
    this.rifleSwap = null;
  }

  _Write(a, world) {
    const object = a.object, parent = object.parent;
    object.matrix.copy(_inv.copy(parent.matrixWorld).invert().multiply(world));
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrix();
    a.written = object.matrix.clone();
    object.updateMatrixWorld(true);
  }

  /** 按原身体那根骨挪到 X Bot 同一根骨上（两套骨初始朝向差按换算的修正量补）。looseWeapon：没人握着的枪 —— 原地不动。 */
  _ReanchorOne(a, looseWeapon) {
    const object = a.object, parent = object.parent, bone = a.anchor || parent;
    if (!parent || !bone) return;
    const srcWorld = _m.multiplyMatrices(parent.matrixWorld, a.intended);
    // 没握在手里的枪（倒地后摆在身边、被炸飞、扔掉）：挂在手骨 / rig.root 下也照原身体的位置放，不跟 X Bot 的骨头飘
    // 贴在躯干上的（背着、斜挎在背后）跟 X Bot 的那节躯干走
    let xbotBone = a.xbotBone, ti = a.targetIndex, from = bone;
    if (looseWeapon && (!bone.isBone || this._HandBone(bone))) {
      const torso = this._NearTorso(srcWorld);
      if (!torso) { this._Write(a, srcWorld.clone()); this.lastMount = "world"; this.contact = null; return; }
      from = torso.bone; xbotBone = torso.xbot; ti = torso.ti;
    }
    const retarget = this.source?.retarget;
    if (!xbotBone) return;
    srcWorld.decompose(_p, _q, _s);
    const worldScale = _s.clone();
    from.matrixWorld.decompose(_p2, _q2, _s2);
    const relPos = _p.clone().sub(_p2).applyQuaternion(_q2.clone().invert());
    const relRot = _q2.clone().invert().multiply(_q);
    const C = ti >= 0 && retarget ? retarget.correction[ti] : null;
    if (C) { const Ci = C.clone().invert(); relPos.applyQuaternion(Ci); relRot.premultiply(Ci); }
    xbotBone.matrixWorld.decompose(_p2, _q2, _s2);
    this._Write(a, _m2.compose(relPos.applyQuaternion(_q2).add(_p2), _q2.clone().multiply(relRot), worldScale));
    if (looseWeapon) { this.lastMount = "body"; this.contact = null; }
  }

  /** 枪的中心离原身体躯干（骨盆、脊柱、胸、颈）0.35 m 内 → 那节骨与 X Bot 对应的骨；否则 null（在地上）。 */
  _NearTorso(world) {
    const at = new THREE.Vector3().setFromMatrixPosition(world);
    let best = null, bestD = 0.35;
    for (const name of ["Bip001_Pelvis", "Bip001_Spine", "Bip001_Spine1", "Bip001_Spine2", "Bip001_Neck"]) {
      const bone = this.rig.root.getObjectByName(name);
      if (!bone) continue;
      const d = bone.getWorldPosition(new THREE.Vector3()).distanceTo(at);
      if (d < bestD) { bestD = d; const xn = XBOT_FROM_SOLDIER[name]; best = { bone, xbot: this.bones.get(xn), ti: this.skins.rest.Find(xn) }; }
    }
    return best?.xbot ? best : null;
  }

  _HandBone(bone) { return bone === this.rig.bones?.handR || bone === this.rig.bones?.handL; }

  /**
   * 手里的枪。枪的位姿三选一：
   *   · 播 Mixamo 端枪动作：照动作预览工具的标定放进右手（rifleHand "L" 的钉在左手）；
   *   · 原身体手里握着枪（掌心离枪身 ≤ XBOT_GRIP.heldM）：照握着的那只手与枪的相对位置，挪到 X Bot 同一只手上；
   *   · 原身体没握着：返回 false，交给 _ReanchorOne（摆在身边的原地不动、挂在背上的跟背走）。
   * 然后把 X Bot 的两只手 IK 到枪上：Mixamo 动作的左手去这把枪自己的护木握点（weaponGripFront，汉阳造 / 中正式 / 三八式
   * 各按各的）；换算动作的另一只手去原动作握的那个位置（拉栓、托枪照原样）。手本来离握点远（在指路、在干别的）就不拉，
   * 远近之间渐变；挂法变了（换动作、松手）XBOT_GRIP.blendS 秒内淡过去。
   */
  _PlaceWeapon(a, pick, dt) {
    const actor = this.actor, w = actor.weaponGroup, object = a.object, parent = object.parent;
    if (!parent || !w.parent) return false;
    // 只挪枪本身，不挪游戏的挂点（RuntimeGrip_WeaponR 这类）：游戏每帧按挂点的位置重算枪在挂点里的位姿，
    // 挂点被挪过它就会把挪的量补回去，一帧帧越补越远（11-01 查到的步枪漂移，切到当场换算时一下甩出 20 m）。
    // 之前写过挂点的先还原成游戏的本意。
    if (a.written) {
      object.matrix.copy(a.intended); object.matrix.decompose(object.position, object.quaternion, object.scale);
      object.updateMatrix(); a.written = null; object.updateMatrixWorld(true);
    }
    w.updateMatrix();
    if (!a.wWritten || !w.matrix.equals(a.wWritten)) a.wIntended = w.matrix.clone();
    const srcW = new THREE.Matrix4().multiplyMatrices(w.parent.matrixWorld, a.wIntended);           // 原身体上枪此刻在哪
    const front = actor.weaponGripFront?.lengthSq() > 1e-8 ? actor.weaponGripFront : null;
    const muzzle = actor.weaponMuzzle?.lengthSq() > 1e-8 ? actor.weaponMuzzle : front;
    const Seg = (M) => [new THREE.Vector3().setFromMatrixPosition(M), muzzle ? muzzle.clone().applyMatrix4(M) : null];
    const srcSeg = Seg(srcW);
    const srcPalm = { R: this._SrcPalm("R"), L: this._SrcPalm("L") };
    const srcGap = { R: SegmentDistance(srcPalm.R, srcSeg), L: SegmentDistance(srcPalm.L, srcSeg) };
    const mixamo = pick?.mode === "clip" && pick.hold === "端枪" && this.skins.rifleOffset;
    let mode, W;
    if (mixamo) {
      if (pick.rifleHand === "L") { if (!this.rifleOnLeft || this.rifleOnLeft.file !== pick.file) this.rifleOnLeft = this._PinLeft(pick.file); }
      else this.rifleOnLeft = null;
      const R = this._RifleWorld();
      w.matrixWorld.decompose(_p2, _q2, _s2);
      W = new THREE.Matrix4().compose(R.position, R.quaternion, _s2);
      mode = this.rifleOnLeft ? "rifleL" : "rifle";
    } else {
      this.rifleOnLeft = null;
      const side = srcGap.R <= srcGap.L ? "R" : "L";
      if (!(srcGap[side] <= XBOT_GRIP.heldM)) {
        // 没人握着：枪还原成游戏的本意，挂点交给 _ReanchorOne（地上的原地不动、贴着躯干的跟躯干走）
        if (a.wWritten) { w.matrix.copy(a.wIntended); w.matrix.decompose(w.position, w.quaternion, w.scale); w.updateMatrix(); a.wWritten = null; w.updateMatrixWorld(true); }
        a.weaponBlend = null; a.weaponMode = null; return false;
      }
      W = this._HandRelative(side, srcW);
      mode = "hand" + side;
    }
    // 挂法变了：从上一帧放的位姿（容器本地，人走着也不拖）淡过去
    const local = new THREE.Matrix4().copy(this.container.matrixWorld).invert().multiply(W);
    if (a.weaponMode && a.weaponMode !== mode && a.weaponLocal) a.weaponBlend = { from: a.weaponLocal.clone(), t: 0 };
    a.weaponMode = mode;
    if (a.weaponBlend) {
      a.weaponBlend.t += dt;
      const k = Math.min(1, a.weaponBlend.t / XBOT_GRIP.blendS), e = k * k * (3 - 2 * k);
      local.copy(BlendMatrix(a.weaponBlend.from, local, e));
      if (k >= 1) a.weaponBlend = null;
    }
    a.weaponLocal = local.clone();
    W = new THREE.Matrix4().copy(this.container.matrixWorld).multiply(local);
    // 双手 IK
    const target = { R: null, L: null };
    if (mixamo) {
      if (this.rifleOnLeft) target.R = new THREE.Vector3().setFromMatrixPosition(W);
      else if (front) target.L = this._Reachable("L", new THREE.Vector3().setFromMatrixPosition(W), front.clone().applyMatrix4(W));
    } else {
      // 原动作里另一只手也握着枪：照它在枪上的位置（换到 X Bot 的枪上）
      const other = mode === "handR" ? "L" : "R";
      if (srcGap[other] <= XBOT_GRIP.heldM) target[other] = srcPalm[other].clone().applyMatrix4(srcW.clone().invert()).applyMatrix4(W);
    }
    for (const side of ["R", "L"]) {
      const key = "ik" + side;
      this[key] = Approach(this[key] || 0, target[side] ? this._GripWeight(side, target[side]) : 0, dt, XBOT_GRIP.weightS);
      if (this[key] > 0.002 && target[side]) this._SolveArm(side, target[side], this[key]);
    }
    // 取证：握着枪的手（IK 之后）掌心离它该握的那一点多远
    const n = { R: "Right", L: "Left" };
    this.contact = Object.fromEntries(["R", "L"].map(side => [side, target[side] && this['ik' + side] > 0.5
      ? +Palm(this.H(n[side] + "Hand"), this.H(n[side] + "HandMiddle1"), new THREE.Vector3()).distanceTo(target[side]).toFixed(3) : null]));
    this.container.updateMatrixWorld(true);
    // 枪的本地矩阵 = 挂点世界矩阵⁻¹ × 目标（整矩阵乘，不拆缩放：枪在挂点里有自己的缩放抵消身高缩放）
    w.matrix.copy(_inv.copy(w.parent.matrixWorld).invert().multiply(W));
    w.matrix.decompose(w.position, w.quaternion, w.scale);
    w.updateMatrix();
    a.wWritten = w.matrix.clone();
    w.updateMatrixWorld(true);
    this.lastMount = mode;
    return true;
  }

  /**
   * 护木握点够不着（Mixamo 端枪动作两手只隔 0.27 m、枪定得靠后，左臂伸直也差一截）就往枪托那头退，
   * 取够得着的最靠前一点（最多退到握点到护木的 45%），不硬把胳膊拉脱。
   */
  _Reachable(side, grip, front) {
    const n = side === "R" ? "Right" : "Left";
    const A = this.H(n + "Arm").getWorldPosition(new THREE.Vector3()), B = this.H(n + "ForeArm").getWorldPosition(new THREE.Vector3());
    const hand = this.H(n + "Hand"), Cw = hand.getWorldPosition(new THREE.Vector3());
    const reach = (A.distanceTo(B) + B.distanceTo(Cw)) * 0.97 + Palm(hand, this.H(n + "HandMiddle1"), new THREE.Vector3()).distanceTo(Cw);
    for (let t = 1; t >= 0.45; t -= 0.05) { const p = grip.clone().lerp(front, t); if (p.distanceTo(A) <= reach) return p; }
    return grip.clone().lerp(front, 0.45);
  }

  /** 原身体某只手与枪的相对位姿，搬到 X Bot 同一只手上（两套骨手的初始朝向差按换算的修正量补）。 */
  _HandRelative(side, srcW) {
    const srcHand = side === "R" ? this.rig.bones.handR : this.rig.bones.handL;
    const xName = side === "R" ? "RightHand" : "LeftHand", ti = this.skins.rest.Find(xName);
    srcW.decompose(_p, _q, _s);
    const worldScale = _s.clone();
    srcHand.matrixWorld.decompose(_p2, _q2, _s2);
    const relPos = _p.clone().sub(_p2).applyQuaternion(_q2.clone().invert());
    const relRot = _q2.clone().invert().multiply(_q);
    const C = ti >= 0 ? this.source?.retarget?.correction[ti] : null;
    if (C) { const Ci = C.clone().invert(); relPos.applyQuaternion(Ci); relRot.premultiply(Ci); }
    this.H(xName).matrixWorld.decompose(_p2, _q2, _s2);
    return new THREE.Matrix4().compose(relPos.applyQuaternion(_q2).add(_p2), _q2.clone().multiply(relRot), worldScale);
  }

  _SrcPalm(side) {
    const hand = side === "R" ? this.rig.bones?.handR : this.rig.bones?.handL;
    if (!hand) return null;
    const key = "srcMiddle" + side;
    if (this[key] === undefined) this[key] = this.rig.root.getObjectByName("Bip001_" + side + "_Finger2") || null;
    return Palm(hand, this[key], new THREE.Vector3());
  }

  /** 这只手要不要去握点：掌心离握点 ≤ near 全拉，≥ far 不拉，中间渐变（按 X Bot 原尺寸的米算）。 */
  _GripWeight(side, target) {
    const n = side === "R" ? "Right" : "Left";
    const scale = this.container.matrixWorld.getMaxScaleOnAxis() || 1;
    const d = Palm(this.H(n + "Hand"), this.H(n + "HandMiddle1"), new THREE.Vector3()).distanceTo(target) / scale;
    const { near, far } = XBOT_GRIP;
    return d <= near ? 1 : d >= far ? 0 : 1 - (d - near) / (far - near);
  }

  /** 两节骨 IK：肩—肘—腕，让掌心落到 target（按 weight 插值）；肘弯的平面沿用动作自己的，手腕的世界朝向不变。 */
  _SolveArm(side, targetPalm, weight) {
    const n = side === "R" ? "Right" : "Left";
    const upper = this.H(n + "Arm"), fore = this.H(n + "ForeArm"), hand = this.H(n + "Hand"), middle = this.H(n + "HandMiddle1");
    if (!upper || !fore || !hand) return;
    upper.updateWorldMatrix(true, true);
    const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
    const A = upper.getWorldPosition(new THREE.Vector3()), B = fore.getWorldPosition(new THREE.Vector3()), Cw = hand.getWorldPosition(new THREE.Vector3());
    const palmOff = Palm(hand, middle, new THREE.Vector3()).sub(Cw);
    const target = Cw.clone().lerp(targetPalm.clone().sub(palmOff), weight);
    const lab = A.distanceTo(B), lbc = B.distanceTo(Cw);
    const lat = THREE.MathUtils.clamp(A.distanceTo(target), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4);
    const ba = A.clone().sub(B), bc = Cw.clone().sub(B);
    let axis = ba.clone().cross(bc);
    if (axis.lengthSq() < 1e-10) axis = new THREE.Vector3(0, 1, 0).applyQuaternion(upper.getWorldQuaternion(new THREE.Quaternion())).cross(ba);
    axis.normalize();
    const cur = ba.angleTo(bc), des = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
    RotateBoneWorld(fore, new THREE.Quaternion().setFromAxisAngle(axis, des - cur));
    const C2 = hand.getWorldPosition(new THREE.Vector3());
    const ac = C2.sub(A).normalize(), at = target.clone().sub(A).normalize();
    RotateBoneWorld(upper, new THREE.Quaternion().setFromUnitVectors(ac, at));
    SetBoneWorldQuaternion(hand, handQ);
  }

  _ScanAttachments() {
    this.attachScan = this.frame;
    this.attachWeapon = this.actor.weaponGroup;
    const old = new Map(this.attachments.map(a => [a.object, a]));
    const list = [];
    this.rig.root.traverse((o) => {
      if (!o.isBone) return;
      for (const child of o.children) {
        if (child.isBone || child.isSkinnedMesh) continue;
        const prev = old.get(child);
        if (prev) { list.push(prev); continue; }
        let holdsWeapon = false;
        const w = this.actor.weaponGroup;
        for (let p = w; p; p = p.parent) if (p === child) { holdsWeapon = true; break; }
        list.push(this._Attachment(child, o, holdsWeapon));
      }
    });
    // 直接挂在 rig.root 下、带网格、里面没有骨头也没有蒙皮的东西：片段道具轨摆的枪、背着的枪这类。
    // 枪按右手挪；别的按扫到时离它最近的那根原身体骨挪（背着的枪 → 脊柱，手里的道具 → 手）。
    const weapon = this.actor.weaponGroup;
    for (const child of this.rig.root.children) {
      if (child.isBone) continue;
      let bone = false, skinned = false, mesh = false, holdsWeapon = false;
      child.traverse((o) => { if (o.isBone) bone = true; else if (o.isSkinnedMesh) skinned = true; else if (o.isMesh) mesh = true; if (o === weapon) holdsWeapon = true; });
      if (bone || skinned || !mesh) continue;
      const prev = old.get(child);
      if (prev) { list.push(prev); continue; }
      const anchor = holdsWeapon && this.rig.bones?.handR ? this.rig.bones.handR : this._NearestSourceBone(child);
      if (anchor) list.push(this._Attachment(child, anchor, holdsWeapon, anchor));
    }
    this.attachments = list;
  }

  _Attachment(object, sourceBone, holdsWeapon, anchor = null) {
    const xbotName = XBOT_FROM_SOLDIER[BoneKey(sourceBone.name)] || null;
    return { object, anchor, xbotBone: xbotName ? this.bones.get(xbotName) : this.H("Hips"),
      targetIndex: xbotName ? this.skins.rest.Find(xbotName) : -1, holdsWeapon, intended: null, written: null };
  }

  _NearestSourceBone(object) {
    const at = object.getWorldPosition(new THREE.Vector3());
    let best = null, bestD = Infinity;
    for (const bone of this.srcBones) {
      if (!bone || !XBOT_FROM_SOLDIER[BoneKey(bone.name)]) continue;
      const d = bone.getWorldPosition(_p2).distanceToSquared(at);
      if (d < bestD) { bestD = d; best = bone; }
    }
    return best;
  }

  /** 枪的世界位姿：右手照标定（左手在枪管前方时枪管对准左手），或开头钉在左手上的那份。 */
  _RifleWorld() {
    const off = this.skins.rifleOffset, k = this.container.matrixWorld.getMaxScaleOnAxis();
    const out = this._rifleOut || (this._rifleOut = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
    if (this.rifleOnLeft) {
      this.H("LeftHand").matrixWorld.decompose(_p2, _q2, _s2);
      out.position.copy(this.rifleOnLeft.position).multiplyScalar(k).applyQuaternion(_q2).add(_p2);
      out.quaternion.copy(_q2).multiply(this.rifleOnLeft.quaternion);
      return out;
    }
    this.H("RightHand").matrixWorld.decompose(_p2, _q2, _s2);
    out.position.copy(off.position).multiplyScalar(k).applyQuaternion(_q2).add(_p2);
    out.quaternion.copy(_q2).multiply(off.quaternion);
    const palmL = Palm(this.H("LeftHand"), this.H("LeftHandMiddle1"), new THREE.Vector3());
    const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const toLeft = palmL.sub(out.position), reach = toLeft.length() / Math.max(k, 1e-6);
    const A = XBOT.aimAtLeft;
    if (reach > A.near && reach < A.far && muzzle.angleTo(toLeft) < A.maxAngle) {
      out.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(muzzle, toLeft.normalize()));
    }
    return out;
  }

  /** 右手腾出来干别的、枪留在左手的动作（清单 rifleHand: "L"）：动作开头按右手标定放好枪，记下它相对左手的位姿。 */
  _PinLeft(file) {
    this.rifleOnLeft = null;
    const W = this._RifleWorld(), k = this.container.matrixWorld.getMaxScaleOnAxis();
    this.H("LeftHand").matrixWorld.decompose(_p2, _q2, _s2);
    const inv = _q2.clone().invert();
    return { file, position: W.position.clone().sub(_p2).applyQuaternion(inv).divideScalar(k), quaternion: inv.multiply(W.quaternion.clone()) };
  }

  /** 取证：X Bot 看不看得见、胯在哪（世界坐标）、原身体胯在哪、手里的枪离 X Bot 最近那只手多远、枪按哪种方式挂。 */
  Probe() {
    const R = (v) => (v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : null);
    const hips = this.H("Hips")?.getWorldPosition(new THREE.Vector3());
    const src = this.rig.bones?.pelvis?.getWorldPosition(new THREE.Vector3());
    let weaponGap = null, grip = null;
    if (this._RifleInHands()) {
      const w = this.actor.weaponGroup.getWorldPosition(new THREE.Vector3());
      weaponGap = +Math.min(...["RightHand", "LeftHand"].map(n => this.H(n).getWorldPosition(new THREE.Vector3()).distanceTo(w))).toFixed(3);
      grip = this._GripGaps();
    }
    return { visible: this.container.visible, hips: R(hips), srcPelvis: R(src), weaponGap, ...(grip || {}), contactR: this.contact?.R ?? null, contactL: this.contact?.L ?? null,
      mount: this.lastMount || null, attachments: this.attachments.length,
      pick: !this.pick ? null : this.pick.mode === "mirror" ? "mirror" : this.pick.key || this.pick.file };
  }

  /** 枪的两个握点（右手握把 = 枪的原点，左手护木 = weaponGripFront）各离 X Bot 那只手的掌心多远。 */
  _GripGaps() {
    const w = this.actor.weaponGroup;
    w.updateWorldMatrix(true, false);
    const right = new THREE.Vector3().setFromMatrixPosition(w.matrixWorld);
    const front = this.actor.weaponGripFront?.lengthSq() > 1e-8 ? this.actor.weaponGripFront.clone().applyMatrix4(w.matrixWorld) : null;
    const palmR = Palm(this.H("RightHand"), this.H("RightHandMiddle1"), new THREE.Vector3());
    const palmL = Palm(this.H("LeftHand"), this.H("LeftHandMiddle1"), new THREE.Vector3());
    return { gripR: +right.distanceTo(palmR).toFixed(3), gripL: front ? +front.distanceTo(palmL).toFixed(3) : null };
  }

  Dispose() {
    this._EndRifleSwap();
    this.mixer.stopAllAction();
    this.container.removeFromParent();
    for (const mesh of this.hidden) mesh.visible = true;
    for (const a of this.attachments) if (a.intended) { a.object.matrix.copy(a.intended); a.object.matrix.decompose(a.object.position, a.object.quaternion, a.object.scale); }
  }
}

/** 原生状态 → XBOT_NATIVE 的键。 */
export function NativeKey(intent, rifleInHands) {
  const mps = intent.mps || 0;
  if (intent.carryRole === "front") return "carryFront";
  if (intent.carryRole) return "carryRear";
  if (intent.woundedWalk && mps > 0.05) return "woundedWalk";
  const stance = intent.stance === "prone" ? "prone" : intent.stance === "crouch" ? "crouch" : "stand";
  if (intent.talking && mps < 0.05 && stance === "stand") return "talking";
  const move = mps < 0.05 ? "Idle" : stance === "prone" ? "Crawl" : mps < XBOT.runMps ? "Walk" : "Run";
  const hold = rifleInHands ? "Rifle" : "Empty";
  return `${stance}${move}${hold}${rifleInHands && intent.aim ? "Aim" : ""}`;
}
