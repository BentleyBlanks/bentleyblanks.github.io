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
import { XBOT_PREVIZ_CLIPS, XBOT_NATIVE, XBOT_DEATHS, XBOT_LOOKS, XBOT_CHARACTER_LOOKS, XBOT_CHARACTER_UNITS } from "./Data_BlockoutXBotClips.mjs";

/** 这个人的配色：有名字的角色（castId，或没有 castId 的单位 id）各一种；其余按阵营的素色。 */
export function XBotLook({ faction = "nra", castId = null, unitId = null } = {}) {
  const key = (castId && XBOT_CHARACTER_LOOKS[castId] ? castId : null) || XBOT_CHARACTER_UNITS[unitId] || null;
  return key ? { key, ...XBOT_CHARACTER_LOOKS[key] } : { key: faction, ...(XBOT_LOOKS[faction] || XBOT_LOOKS.nra) };
}

export const XBOT = Object.freeze({
  base: "./Animation/Mixamo/",
  model: "Model_MixamoXBot.glb",
  fadeS: 0.2,
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
  }

  get visible() { return this.container.visible; }

  /**
   * 每帧（原身体 Update 之后）调一次。intent：
   *   clip / clipSeconds / clipDuration / clipLoop  预演片段与它在原片段里的秒数
   *   throwSeconds   投弹片段的秒数（预演 throw 键）
   *   mps / stance / aim / carryRole / woundedWalk / talking / melee   原生状态
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
    if (!visible) return;
    this.container.position.copy(rig.root.position);
    this.container.quaternion.copy(rig.root.quaternion);
    this.container.scale.copy(rig.root.scale).multiplyScalar(this.scaleK);
    if (intent.shadow !== undefined && !!intent.shadow !== this.shadow) {
      this.shadow = !!intent.shadow;
      this.model.traverse(o => { if (o.isMesh) o.castShadow = this.shadow; });
    }

    this.fireT = intent.firing ? XBOT.fireHoldS : Math.max(0, (this.fireT || 0) - dt);
    const pick = this._Pick(intent);
    if (pick.mode === "mirror" || !pick.file) this._Mirror(dt);
    else this._Play(pick, intent, dt);
    this.container.updateMatrixWorld(true);
    this._Reanchor(pick);
  }

  /** 这一帧播什么：{ mode: "clip" | "mirror", file, time?, rate?, loop, once, hold, rifleHand } */
  _Pick(intent) {
    const skins = this.skins;
    if (intent.exact) return { mode: "mirror" };
    if (intent.down) {
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
      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(pick.once || !pick.loop ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.timeScale = 0;              // 时间自己管（按原片段秒数 / 实际速度），mixer 只推淡入淡出
      action.enabled = true;
      action.setEffectiveWeight(1);
      // 从上一条动作淡过来；从「当场换算」或第一次进来就直接切（只有一条动作时淡入会混进 T 姿势）
      if (cur?.action && !cur.mirror) action.crossFadeFrom(cur.action, XBOT.fadeS, false);
      action.play();
      // 一进来就是倒着的人（造出来就倒在地上）：直接到最后一帧
      const startAtEnd = pick.death && this.wasDown === null;
      cur = this.current = { file: pick.file, action, clock: startAtEnd ? clip.duration : 0, mirror: false };
    }
    const D = clip.duration;
    let t;
    if (Number.isFinite(pick.sourceSeconds) && !pick.travel) {
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
    cur.action.time = t;
    this.wasDown = !!pick.death;
    this.mixer.update(dt);
    this.pick = pick;
  }

  /** 当场把原身体的姿势换算到 X Bot（表里没有的、要精确贴位置的）。 */
  _Mirror(dt) {
    const source = this.source;
    if (!source) return;
    if (this.current && !this.current.mirror) {
      this.mixer.stopAllAction();
      this.current = { mirror: true };
    }
    this.mixer.update(dt);
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
   * 原身体骨头上挂的东西（挂点 Socket_*、道具根）挪到 X Bot 的同一根骨上。游戏代码写的本地矩阵记作「本意」，
   * 每帧按本意算它在原身体上的世界位姿，再按两套骨的初始朝向差换到 X Bot 那根骨上；写回去的本地矩阵记下来，
   * 下一帧发现被游戏改过（换枪、背枪）就换成新的本意。
   */
  _Reanchor(pick) {
    if (this.frame - this.attachScan > 30 || this.attachWeapon !== this.actor.weaponGroup) this._ScanAttachments();
    const rig = this.rig, retarget = this.source?.retarget;
    rig.root.updateMatrixWorld(true);
    const rifleMount = pick?.mode === "clip" && pick.hold === "端枪" && this.skins.rifleOffset;
    this.lastMount = rifleMount ? "rifle" : "anchor";
    if (rifleMount && pick.rifleHand === "L") { if (!this.rifleOnLeft || this.rifleOnLeft.file !== pick.file) this.rifleOnLeft = this._PinLeft(pick.file); }
    else this.rifleOnLeft = null;
    for (const a of this.attachments) {
      // parent：它实际挂在谁下面（骨头，或 rig.root —— 片段的道具轨把枪摆在模型空间里）；anchor：按哪根骨挪
      const object = a.object, parent = object.parent, bone = a.anchor || parent;
      if (!parent || !bone) continue;
      object.updateMatrix();
      if (!a.written || !object.matrix.equals(a.written)) a.intended = object.matrix.clone();
      // 原身体上它此刻在哪
      const srcWorld = _m.multiplyMatrices(parent.matrixWorld, a.intended);
      srcWorld.decompose(_p, _q, _s);
      const worldScale = _s.clone();
      let P, Q;
      if (rifleMount && a.holdsWeapon) {
        // Mixamo 端枪动作：枪照标定放进 X Bot 右手（或左手钉住），挂点按枪的相对位置倒推（整矩阵乘，不拆缩放：
        // 枪在挂点里有自己的缩放抵消身高缩放，拆开再按挂点的缩放拼回去会把枪挪开）
        const W = this._RifleWorld();
        this.actor.weaponGroup.matrixWorld.decompose(_p2, _q2, _s2);
        const rel = _rel.copy(this.actor.weaponGroup.matrixWorld).invert().multiply(object.matrixWorld);
        _m2.compose(W.position, W.quaternion, _s2).multiply(rel);
        object.matrix.copy(_inv.copy(parent.matrixWorld).invert().multiply(_m2));
        object.matrix.decompose(object.position, object.quaternion, object.scale);
        object.updateMatrix();
        a.written = object.matrix.clone();
        object.updateMatrixWorld(true);
        continue;
      } else {
        const xbotBone = a.xbotBone, ti = a.targetIndex;
        if (!xbotBone) continue;
        bone.matrixWorld.decompose(_p2, _q2, _s2);
        const relPos = _p.clone().sub(_p2).applyQuaternion(_q2.clone().invert());
        const relRot = _q2.clone().invert().multiply(_q);
        const C = ti >= 0 && retarget ? retarget.correction[ti] : null;
        if (C) { const Ci = C.clone().invert(); relPos.applyQuaternion(Ci); relRot.premultiply(Ci); }
        xbotBone.matrixWorld.decompose(_p2, _q2, _s2);
        P = relPos.applyQuaternion(_q2).add(_p2);
        Q = _q2.clone().multiply(relRot);
      }
      object.matrix.copy(_inv.copy(parent.matrixWorld).invert().multiply(_m2.compose(P, Q, worldScale)));
      object.matrix.decompose(object.position, object.quaternion, object.scale);
      object.updateMatrix();
      a.written = object.matrix.clone();
      object.updateMatrixWorld(true);
    }
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
    let weaponGap = null;
    if (this._RifleInHands()) {
      const w = this.actor.weaponGroup.getWorldPosition(new THREE.Vector3());
      weaponGap = +Math.min(...["RightHand", "LeftHand"].map(n => this.H(n).getWorldPosition(new THREE.Vector3()).distanceTo(w))).toFixed(3);
    }
    return { visible: this.container.visible, hips: R(hips), srcPelvis: R(src), weaponGap, mount: this.lastMount || null, attachments: this.attachments.length };
  }

  Dispose() {
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
  if (intent.melee) return "meleeGuard";
  const stance = intent.stance === "prone" ? "prone" : intent.stance === "crouch" ? "crouch" : "stand";
  if (intent.talking && mps < 0.05 && stance === "stand") return "talking";
  const move = mps < 0.05 ? "Idle" : stance === "prone" ? "Crawl" : mps < XBOT.runMps ? "Walk" : "Run";
  const hold = rifleInHands ? "Rifle" : "Empty";
  return `${stance}${move}${hold}${rifleInHands && intent.aim ? "Aim" : ""}`;
}
