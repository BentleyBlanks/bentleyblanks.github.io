// Script_HitReactionLayer.mjs — 受击物理反应的 three 侧：骨骼弹簧层 + 方向死亡选择 / 动作库加载。
//
// 规则与数值在 Script_HitReaction.mjs / Data_Tuning_HitReaction.mjs（纯 Node 可测）；口径 docs/Data_HitReaction.md。
// 这里只做三件事：
//   1. 世界系命中描述（HitDescriptor）→ 演员局部系，读活的关节位置，交给纯规则算冲量，打进状态；
//   2. 每帧推进弹簧，把 θ 作为「世界系旋转增量」叠在动画姿势之上（自父向子 FK，先记原值供倒序还原）、
//      骨盆平移、腿软（大腿/小腿）；同时给出躯干刚体增量，Actor 拿它让枪跟着上身走；
//   3. 致死时按冲量方向与部位从动作库里选一条倒地动作，剩余偏角在倒地前段转过去。
//
// 施加纪律（与 CharacterModel 的 hurtTilt 同一套）：先记原值、下一帧 mixer 之前**倒序还原**——
// three 的 PropertyMixer 对没变的常量轨道不重写，不还原就会一直残留（docs/Data_HitReaction.md §2.2）。
// 死亡进度 t ≥ DEATH.fadeEndT 时偏移严格为 0：DEATH_CONTACT.poseEnd（0.85）起按可见蒙皮做接地拟合。
import * as THREE from "three";
import {
  BuildBodyModel, ComputeHitReaction, HitReactionState, DeathEnvelope, DeathYawBlend, DesiredFall, ChooseDeathClip,
  FallbackCandidates, NormalizeKind, SPRING_BONE_IDS,
} from "./Script_HitReaction.mjs";
import { SOLVER, DEATH, DEATH_LIBRARY, FALLBACK_DEATH, AI_HOLD } from "./Data_Tuning_HitReaction.mjs";

// --- 总开关 -----------------------------------------------------------------------------------
// URL ?hitreact=0 关整层（弹簧层 + 方向死亡选择），A/B 对照用；也可运行时 SetHitReactionEnabled(false)。
const query = (typeof globalThis !== "undefined" && globalThis.location && typeof URLSearchParams === "function")
  ? new URLSearchParams(globalThis.location.search) : null;
let globalEnabled = query?.get("hitreact") !== "0";
export function HitReactionEnabled() { return globalEnabled; }
export function SetHitReactionEnabled(value) { globalEnabled = !!value; return globalEnabled; }

// --- 方向死亡动作库（懒加载，写法照 Script_LayeredGait.LoadBearers）--------------------------------
const FAMILIES = new Set(["back", "forward", "left", "right", "crumple"]);
let library = null, libraryLoading = null, libraryFailed = false;

/** 开机不下载：第一次有人挨打（或调用方主动 Preload）时才 fetch。没到 / 失败时方向死亡退回 Kimodo A–D，不断档。 */
export function PreloadDeathLibrary() {
  if (libraryFailed || typeof fetch !== "function") return Promise.resolve(null);
  libraryLoading ||= fetch(DEATH_LIBRARY.url).then((response) => {
    if (!response.ok) throw new Error(`DeathImpact HTTP ${response.status}`);
    return response.json();
  }).then((data) => {
    if (data.skeleton && data.skeleton !== DEATH_LIBRARY.skeleton) throw new Error(`skeleton ${data.skeleton}`);
    const clips = new Map(data.clips.map((json) => [json.name, THREE.AnimationClip.parse(json)]));
    const profiles = {};
    for (const [name, profile] of Object.entries(data.profiles || {})) {
      const fall = profile.fallLocal;
      if (!clips.has(name) || !FAMILIES.has(profile.family)) continue;
      if (profile.family !== "crumple" && !(Array.isArray(fall) && fall.length === 2 && fall.every(Number.isFinite))) continue;
      profiles[name] = profile;
    }
    library = { revision: data.revision || null, clips, profiles };
    return library;
  }).catch((error) => {
    libraryFailed = true;
    console.warn("[HitReaction] death impact library unavailable, falling back to Kimodo A-D:", String(error));
    return null;
  });
  return libraryLoading;
}
/** 已加载好的库（没有 = null）。 */
export function DeathLibrary() { return library; }
/** 测试 / 取证用：清掉库状态重新来。 */
export function ResetDeathLibrary() { library = null; libraryLoading = null; libraryFailed = false; }

/**
 * 候选 = 动作库里带倒向的全部 clip（BlenderMCP 物理仿真 + Kimodo 左右镜像）∪ 这个人自己的 Kimodo A–D（实测都往右倒）。
 * 库里没有 A–D 本身（只有它们的左镜像），并入 A–D 才有「右」；库整个缺失 / 还没加载到时只剩 A–D，方向死亡不断档。
 */
function Candidates(rig) {
  const list = FallbackCandidates().filter((c) => rig.deathClipById?.has(c.id))
    .map((c) => ({ ...c, playbackRate: FALLBACK_DEATH.playbackRate, clip: null, impactPart: null, startS: 0 }));
  if (library) {
    for (const [id, p] of Object.entries(library.profiles)) {
      list.push({
        id, family: p.family, fallLocal: p.fallLocal ?? null, source: p.source || "ragdoll-sim",
        playbackRate: p.playbackRate || 1, clip: library.clips.get(id),
        // impactPart：原地瘫按部位配对（爆头 / 躯干）；startS：跳过仿真里「还站着没反应」的前段（秒，clip 自己的时间）。
        impactPart: p.impact?.part ?? null, startS: Number.isFinite(p.startS) ? p.startS : 0,
      });
    }
  }
  return list;
}

// --- 世界系 → 演员局部系 -----------------------------------------------------------------------
const Q_ROOT = new THREE.Quaternion(), Q_INV = new THREE.Quaternion(), Q_A = new THREE.Quaternion(), Q_B = new THREE.Quaternion();
const V_A = new THREE.Vector3(), V_B = new THREE.Vector3(), V_AXIS = new THREE.Vector3();
const M_A = new THREE.Matrix4(), M_B = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);

function LocalDirection(root, vector) {
  if (!vector) return null;
  root.getWorldQuaternion(Q_INV).invert();
  V_A.set(vector.x, vector.y, vector.z).applyQuaternion(Q_INV);
  const l = V_A.length();
  return l > 1e-9 ? [V_A.x / l, V_A.y / l, V_A.z / l] : null;
}
function LocalPoint(root, point) {
  if (!point) return null;
  root.updateWorldMatrix(true, false);
  V_A.set(point.x, point.y, point.z);
  root.worldToLocal(V_A);
  return [V_A.x, V_A.y, V_A.z];
}
/** HitDescriptor（世界系）→ 纯规则要的演员局部描述。 */
function Localize(root, hit) {
  const dirLocal = LocalDirection(root, hit.direction) ?? [0, 0, 1];
  return {
    kind: hit.kind, part: hit.part, shapeId: hit.shapeId || null,
    pointLocal: LocalPoint(root, hit.point), pointExact: !!hit.pointExact,
    dirLocal, sweepLocal: LocalDirection(root, hit.sweep),
    rawDamage: hit.rawDamage, damage: hit.damage, lethal: !!hit.lethal, seed: hit.seed ?? 0,
  };
}

// --- 方向死亡选择（Actor.Ragdoll 调）------------------------------------------------------------
/**
 * 致死命中 → 该播哪条倒地动作与剩余偏角。全局关着 / 没有命中信息 / 没有蒙皮骨架返回 null（调用方走老路：按 seed 抽 A–D）。
 * @returns {{id:string, clip:THREE.AnimationClip|null, playbackRate:number, yawRad:number, residualDeg:number,
 *            family:string, source:string|null, why:string, desiredDeg:number|null, fromLibrary:boolean}|null}
 */
export function ChooseHitDeath(actor, hit) {
  const rig = actor?.characterRig;
  if (!globalEnabled || !hit || !rig) return null;
  PreloadDeathLibrary();
  const local = Localize(actor.root, hit);
  const desired = DesiredFall({ kind: local.kind, part: local.part, shapeId: local.shapeId, dirLocal: local.dirLocal, sweepLocal: local.sweepLocal, seed: hit.seed ?? 0 });
  const candidates = Candidates(rig);
  const chosen = ChooseDeathClip(desired, candidates, hit.seed ?? 0);
  if (!chosen) return null;
  const candidate = candidates.find((c) => c.id === chosen.id);
  return {
    id: chosen.id, clip: candidate.clip || null, playbackRate: candidate.playbackRate, startS: candidate.startS || 0,
    yawRad: chosen.yawRad, residualDeg: chosen.residualDeg, desiredDeg: chosen.desiredDeg,
    family: chosen.family, source: chosen.source, why: desired.why, fromLibrary: !!candidate.clip,
  };
}

// --- 骨骼弹簧层 -------------------------------------------------------------------------------
const NAME_KEYS = {
  spine: "bip001spine", spine1: "bip001spine1", clavicleL: "bip001lclavicle", clavicleR: "bip001rclavicle",
};
const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** 每个人一个：挂在 CharacterRig 上（rig.hitReaction），第一次挨打才建。 */
export class HitReactionLayer {
  constructor(rig, actor) {
    this.rig = rig;
    this.actor = actor;
    const height = actor?.dims?.height ?? 1.68;
    this.model = BuildBodyModel(height);
    this.state = new HitReactionState(this.model);
    this.nodes = this._ResolveBones();
    this.records = [];            // {node, q, p, hasQ, hasP}：本帧施加前的原值，倒序还原（对象池，活跃时每帧不分配）
    this.recordCount = 0;
    this.weaponRecord = null;
    this.torsoDelta = new THREE.Matrix4();
    this.torsoMoved = false;
    this.lastReaction = null;
    this.lastStepAt = -1;
    this.deathYaw = 0;
    this.deathChoice = null;
    this.dead = false;
    this.hits = 0;
  }

  _ResolveBones() {
    const b = this.rig.bones;
    const byName = (key) => {
      let found = null;
      this.rig.root.traverse((o) => { if (!found && o.isBone && norm(o.name) === key) found = o; });
      return found;
    };
    const nodes = {
      pelvis: b.pelvis, spine: byName(NAME_KEYS.spine), spine1: byName(NAME_KEYS.spine1), spine2: b.chest, neck: b.neck, head: b.head,
      upperArmL: b.upperArmL, upperArmR: b.upperArmR, forearmL: b.forearmL, forearmR: b.forearmR,
      thighL: b.thighL, thighR: b.thighR, calfL: b.calfL, calfR: b.calfR,
      // Biped 的锁骨是 Neck 的子节点：颈转的时候肩膀会跟着歪，施加颈的偏移后要给锁骨补一个反向旋转。
      clavicleL: byName(NAME_KEYS.clavicleL), clavicleR: byName(NAME_KEYS.clavicleR),
    };
    return nodes;
  }

  get enabled() { return globalEnabled; }
  get active() { return this.state.active; }

  /** 演员回收 / 复用 / 复活 / 换关：清零所有状态与死亡转向，把骨头还回去。 */
  Reset() {
    this.Restore();
    this.state.Reset();
    this.deathYaw = 0; this.deathChoice = null; this.dead = false;
    this.lastReaction = null; this.torsoMoved = false; this.lastStepAt = -1;
  }

  /** 倒序还原上一帧叠的偏移（必须在 mixer 采样之前）。 */
  Restore() {
    for (let i = this.recordCount - 1; i >= 0; i -= 1) {
      const r = this.records[i];
      if (r.hasQ) r.node.quaternion.copy(r.q);
      if (r.hasP) r.node.position.copy(r.p);
      r.node = null;
    }
    this.recordCount = 0;
    if (this.weaponRecord) {
      const w = this.weaponRecord;
      // 枪这一帧被断肢层改挂到肢块上了就不还原（局部位姿是相对旧父节点的，照写等于把枪瞬移）。
      if (w.group.parent && w.group.parent === w.parent) { w.group.position.copy(w.p); w.group.quaternion.copy(w.q); w.group.updateMatrix(); }
      this.weaponRecord = null;
    }
    this.torsoMoved = false;
  }

  /**
   * 接一记命中。返回 { severity, impulseNs, zone } 给 AI（推迟开火用）；层被关 / 没有骨架返回 null。
   * @param {object} hit  世界系 HitDescriptor（见 docs §2.1）
   * @param {{death?:boolean}} [options] 致死的一下切死亡档
   */
  Receive(hit, { death = false } = {}) {
    if (!globalEnabled || this.rig.disposed) return null;
    const actor = this.actor;
    const rig = this.rig;
    // 关节位置取活的：力臂按此刻真实姿势（蹲 / 卧 / 跑）算，惯量取站姿。
    rig.root.updateMatrixWorld(true);
    actor.root.updateWorldMatrix(true, false);
    const live = {};
    for (const id of SPRING_BONE_IDS) {
      const node = this.nodes[id];
      if (!node) continue;
      node.getWorldPosition(V_B);
      actor.root.worldToLocal(V_B);
      live[id] = [V_B.x, V_B.y, V_B.z];
    }
    const local = Localize(actor.root, hit);
    const reaction = ComputeHitReaction(local, this.model, { live });
    this.state.Apply(reaction, { death });
    this.lastReaction = { zone: reaction.zone, side: reaction.side, severity: reaction.severity, impulseNs: reaction.impulseNs, kind: reaction.kind, dirLocal: reaction.dir, pointLocal: reaction.point };
    this.hits += 1;
    this.dead = this.dead || death;
    return this.lastReaction;
  }

  /** 死亡选择的结果（转向剩余偏角、选中的 clip）。 */
  SetDeathChoice(choice) {
    this.deathChoice = choice;
    this.deathYaw = choice?.yawRad || 0;
  }

  /**
   * 死亡进度 t 上的可见朝向转角（弧度）：倒地开始后 DEATH.yawBlendS 秒内平滑转过去（人还站着时拧完），之后保持。
   * durationS = 这条倒地动作以实际速率播的秒数（Actor 的 ragdollState.duration）。
   */
  DeathYaw(t, durationS = null) {
    if (!this.deathYaw) return 0;
    return this.deathYaw * DeathYawBlend(t, undefined, durationS);
  }

  /**
   * 活人：每帧末尾（_ApplyRiggedAim 之后）调用。推进弹簧并把偏移叠在骨骼上。
   * 返回是否动过骨头（Actor 据此重跑挂点、带枪）。
   */
  ApplyLive(dt, elapsed = null) {
    if (!this.state.active || !globalEnabled) return false;
    const actor = this.actor;
    // 太久没被推进（被剔除 / 隐藏）→ 醒来时不带陈旧抖动。
    if (elapsed !== null) {
      if (this.lastStepAt >= 0 && elapsed - this.lastStepAt > SOLVER.staleS) { this.state.Reset(); this.lastStepAt = -1; return false; }
      this.lastStepAt = elapsed;
    }
    // 远处的人不叠反应，也不留着「活跃」（否则永远睡不着，每帧白走一遍 Actor 那一段）。
    if (actor.renderDistanceSq > SOLVER.maxDistanceM * SOLVER.maxDistanceM) { this.state.Reset(); this.lastStepAt = -1; return false; }
    this.state.Step(dt);
    if (!this.state.active) return false;
    return this._Apply(1);
  }

  /**
   * 死亡：Update 的 ragdoll 分支里 PoseRagdoll 之后调用；t = 死亡进度，durationS = 倒地动作实际时长（秒）。
   * t ≥ fadeEndT 偏移严格为 0；按秒的包络（fadeEndS）通常更早归零。
   */
  ApplyDeath(dt, t, durationS = null) {
    if (!this.state.active) return false;
    const envelope = DeathEnvelope(t, undefined, durationS);
    if (!(envelope > 0)) { this.state.Reset(); this.state.mode = "death"; return false; }
    this.state.Step(dt);
    if (!this.state.active) return false;
    return this._Apply(envelope);
  }

  _Apply(envelope) {
    if (!(envelope > 0)) return false;
    const rig = this.rig, actor = this.actor, nodes = this.nodes;
    const spine2 = nodes.spine2;
    let touched = false;
    actor.root.getWorldQuaternion(Q_ROOT);
    if (spine2) { spine2.updateWorldMatrix(true, false); M_A.copy(spine2.matrixWorld); }

    // 1. 骨盆：踉跄 + 腿软下沉（只有活档有）。
    const offset = this.state.PelvisOffset();
    const pelvis = nodes.pelvis;
    if (pelvis && pelvis.parent && (Math.abs(offset[0]) + Math.abs(offset[1]) + Math.abs(offset[2])) > 1e-5) {
      this._Record(pelvis, false, true);
      pelvis.parent.updateWorldMatrix(true, false);
      pelvis.getWorldPosition(V_A);
      V_B.set(offset[0] * envelope, offset[1] * envelope, offset[2] * envelope).applyQuaternion(Q_ROOT);
      V_A.add(V_B);
      pelvis.position.copy(pelvis.parent.worldToLocal(V_A));
      touched = true;
    }
    // 2. 骨头按自父向子的顺序施加（先脊柱再颈头再手臂；腿软的髋 / 膝放最后，它们不在弹簧链里）。
    for (const bone of this.state.bones) {
      const node = nodes[bone.id];
      if (!node) continue;
      const t = bone.theta;
      const raw = Math.hypot(t[0], t[1], t[2]), angle = raw * envelope;
      if (angle < 1e-4) continue;
      V_AXIS.set(t[0] / raw, t[1] / raw, t[2] / raw).applyQuaternion(Q_ROOT);
      this._Rotate(node, V_AXIS, angle);
      if (bone.id === "neck") {
        this._Rotate(nodes.clavicleL, V_AXIS, -angle);
        this._Rotate(nodes.clavicleR, V_AXIS, -angle);
      }
      touched = true;
    }
    const flex = this.state.LegFlex();
    for (const side of ["L", "R"]) {
      const f = flex[side];
      if (f.hip < 1e-4) continue;
      V_AXIS.copy(X_AXIS).applyQuaternion(Q_ROOT);
      // 髋前屈：大腿绕 +X 转正（膝盖朝 −Z 前方）；膝屈：小腿相对大腿绕 +X 转负（脚往后）。
      this._Rotate(nodes[`thigh${side}`], V_AXIS, f.hip * envelope);
      this._Rotate(nodes[`calf${side}`], V_AXIS, -f.knee * envelope);
      touched = true;
    }
    if (touched && spine2) {
      spine2.updateWorldMatrix(true, false);
      M_B.copy(spine2.matrixWorld);
      this.torsoDelta.multiplyMatrices(M_B, M_A.invert());
      this.torsoMoved = true;
    }
    return touched;
  }

  /** 绕世界轴旋转一根骨头：q' = (P⁻¹ R P) q，P 是父节点的世界旋转（含本帧已施加的祖先偏移）。记原值供还原。 */
  _Rotate(node, axisWorld, angle) {
    if (!node || !node.parent || !(Math.abs(angle) > 1e-6)) return;
    node.parent.getWorldQuaternion(Q_A);
    V_A.copy(axisWorld).applyQuaternion(Q_B.copy(Q_A).invert()).normalize();
    Q_B.setFromAxisAngle(V_A, angle);
    this._Record(node, true, false);
    node.quaternion.premultiply(Q_B);
  }

  /** 记下一根骨头施加前的原值（对象池里取一格）。 */
  _Record(node, rotation, position) {
    let r = this.records[this.recordCount];
    if (!r) { r = { node: null, q: new THREE.Quaternion(), p: new THREE.Vector3(), hasQ: false, hasP: false }; this.records.push(r); }
    this.recordCount += 1;
    r.node = node; r.hasQ = rotation; r.hasP = position;
    if (rotation) r.q.copy(node.quaternion);
    if (position) r.p.copy(node.position);
  }

  /** 记下枪的局部位姿（Actor 重摆挂点 / 带枪之前调），下一帧 Restore 还回去。 */
  RecordWeapon(group) {
    if (!group || this.weaponRecord) return;
    const w = this.weaponSlot ||= { group: null, parent: null, p: new THREE.Vector3(), q: new THREE.Quaternion() };
    w.group = group; w.parent = group.parent; w.p.copy(group.position); w.q.copy(group.quaternion);
    this.weaponRecord = w;
  }

  /** 取证：每根骨的 θ/ω 模长（度）、骨盆偏移、是否活跃、选中的死亡 clip 与剩余偏角。 */
  Describe() {
    const deg = 180 / Math.PI;
    const bones = {};
    for (const b of this.state.bones) {
      bones[b.id] = { thetaDeg: Math.hypot(...b.theta) * deg, omegaDegS: Math.hypot(...b.omega) * deg, theta: b.theta.map((v) => v * deg) };
    }
    const flex = this.state.LegFlex();
    return {
      active: this.state.active, mode: this.state.mode, enabled: globalEnabled, hits: this.hits,
      bones, pelvisOffset: this.state.PelvisOffset(), sinkM: [this.state.sink.L.x, this.state.sink.R.x],
      legFlexDeg: { L: [flex.L.hip * deg, flex.L.knee * deg], R: [flex.R.hip * deg, flex.R.knee * deg] },
      last: this.lastReaction,
      death: this.deathChoice ? { id: this.deathChoice.id, family: this.deathChoice.family, source: this.deathChoice.source,
        residualDeg: this.deathChoice.residualDeg, yawDeg: this.deathYaw * deg, why: this.deathChoice.why,
        fromLibrary: !!this.deathChoice.fromLibrary, desiredDeg: this.deathChoice.desiredDeg } : null,
    };
  }
}

/** rig 的受击层（没有就建；总开关关着返回 null，调用方走老路）。 */
export function HitReactionOf(actor) {
  const rig = actor?.characterRig;
  if (!rig || rig.disposed) return null;
  if (!rig.hitReaction) {
    if (!globalEnabled) return null;
    PreloadDeathLibrary();
    rig.hitReaction = new HitReactionLayer(rig, actor);
  }
  return rig.hitReaction;
}

/** 受击强度 → AI 推迟多久开下一发（秒；不到门槛 0）。数值在 Data_Tuning_HitReaction.AI_HOLD。 */
export function AiHoldSeconds(severity) {
  if (!(severity >= AI_HOLD.minSeverity)) return 0;
  return Math.min(AI_HOLD.maxS, AI_HOLD.holdS * severity);
}

export { NormalizeKind };
