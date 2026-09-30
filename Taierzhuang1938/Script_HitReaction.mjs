// Script_HitReaction.mjs — 受击物理反应的**纯规则层**（不 import three，Node 可测；口径 docs/Data_HitReaction.md）。
//
// 三块：
//   1. 冲量模型   BuildBodyModel / ClassifyZone / ComputeHitReaction
//                 一次命中 → 有效冲量 J（方向 × N·s）、受力点、受力段 → 分到骨链上的角速度增量、
//                 骨盆平移速度增量、腿软（膝屈 + 骨盆下沉）的竖向速度增量。
//                 Δω_b = share × I_b⁻¹ · (r_b × J)，r_b = 受力点 − 该骨关节：方向和部位都是算出来的。
//   2. 弹簧状态   HitReactionState
//                 每根骨一个角位移 θ 与角速度 ω，「弹簧 + 阻尼 + 关节限位」半隐式欧拉、固定子步，
//                 确定性、休眠即零开销。活人肌张力下回弹；死亡档肌张力丢失（更软、不回弹）。
//   3. 方向死亡   DesiredFall / ChooseDeathClip
//                 致死命中 → 期望倒向（演员局部 XZ）→ 在动作库里选倒向最接近的一条，
//                 并给出要转的剩余偏角。
//
// 坐标：全部**演员局部系**（+X 右手、+Y 上、−Z 正面）；向量一律 [x, y, z] 数组；骨头 "L"/"R" 是人物自己的左右手。
// three 侧（Script_HitReactionLayer.mjs）负责世界系 ↔ 演员局部系、读关节、把 θ 写回骨骼。
import {
  IMPULSE, BODY, BONES, CHAINS, NECK_TRANSFER, STAGGER, LEG_BUCKLE, SOLVER, DEATH, DEATH_SELECT, FALLBACK_DEATH,
} from "./Data_Tuning_HitReaction.mjs";

export const DEFAULT_TUNING = Object.freeze({
  IMPULSE, BODY, BONES, CHAINS, NECK_TRANSFER, STAGGER, LEG_BUCKLE, SOLVER, DEATH, DEATH_SELECT, FALLBACK_DEATH,
});

/** 命中 kind 的规范化：不认识的当步枪。 */
export const HIT_KINDS = Object.freeze(["bullet", "hmg", "blade", "thrust", "blast", "melee"]);
export function NormalizeKind(kind) {
  if (HIT_KINDS.includes(kind)) return kind;
  if (kind === "slash" || kind === "cut") return "blade";
  if (kind === "stab") return "thrust";
  if (kind === "explosion") return "blast";
  return "bullet";
}

// --- 向量 / 矩阵（数组版，避免 three）-----------------------------------------------------------
const Sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const Add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const Mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const Cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const Len = (a) => Math.hypot(a[0], a[1], a[2]);
const Norm = (a) => { const l = Len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const Lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const Clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SmoothStep = (a, b, x) => { const t = Clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function Inverse3(m) {
  // m 行主序 [[a,b,c],[d,e,f],[g,h,i]]（对称），返回逆。
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const inv = 1 / det;
  return [
    [A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv],
    [B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv],
    [C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv],
  ];
}
const MulMV = (m, v) => [Dot(m[0], v), Dot(m[1], v), Dot(m[2], v)];

/** 稳定哈希（FNV-1a）→ [0,1)。同一个 seed + tag 永远同一个数：同一个人回放一致。 */
export function StableUnit(seed, tag) {
  let hash = 2166136261 >>> 0;
  const text = `${seed}|${tag}`;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  hash ^= hash >>> 15; hash = Math.imul(hash, 2246822519); hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

// --- 骨头 id ----------------------------------------------------------------------------------
export const SIDES = Object.freeze(["L", "R"]);
export const SPRING_BONE_IDS = Object.freeze([
  "spine", "spine1", "spine2", "neck", "head",
  "upperArmL", "upperArmR", "forearmL", "forearmR",
]);
/** 骨头 id → 弹簧参数表里的基名（upperArmL → upperArm）。 */
export function BoneBase(id) { return /[LR]$/.test(id) && !/^(spine|neck|head)/.test(id) ? id.slice(0, -1) : id; }
function ParentOf(id, tuning) {
  const spec = tuning.BONES[BoneBase(id)];
  if (!spec) return null;
  const side = id.slice(BoneBase(id).length);
  return spec.parent === "pelvis" ? "pelvis" : (tuning.BONES[spec.parent] && /^(upperArm|forearm)$/.test(spec.parent) ? spec.parent + side : spec.parent);
}
function IsDescendantOrSelf(ownerBone, ancestor, tuning) {
  for (let bone = ownerBone, guard = 0; bone && guard < 16; guard += 1) {
    if (bone === ancestor) return true;
    bone = ParentOf(bone, tuning);
  }
  return false;
}

// --- 1. 人体模型 ------------------------------------------------------------------------------
/**
 * 绑定时算一次（按演员身高等比缩放）：每根弹簧骨的关节位置、分布质量对它的惯量张量及其逆。
 * 惯量按站姿量：手臂受击时的力臂用**活的**关节位置（见 ComputeHitReaction 的 live），惯量用站姿的，
 * 这样蹲着 / 卧着也能算，且不必每次命中重算张量。
 */
export function BuildBodyModel(heightM = BODY.referenceHeightM, tuning = DEFAULT_TUNING) {
  const { BODY: B } = tuning;
  const scale = heightM / B.referenceHeightM;
  const joints = {};
  for (const [name, p] of Object.entries(B.joints)) joints[name] = Mul(p, scale);
  const segments = B.segments.map((seg) => {
    const a = joints[seg.from], b = joints[seg.to];
    return {
      id: seg.id, bone: seg.bone, mass: seg.mass * B.massKg,
      com: Lerp3(a, b, seg.ratio), len: Len(Sub(b, a)) * B.ownInertiaLengthScale,
    };
  });
  const bones = {};
  for (const id of SPRING_BONE_IDS) {
    const j = joints[id];
    const I = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const seg of segments) {
      if (!IsDescendantOrSelf(seg.bone, id, tuning)) continue;
      const d = Sub(seg.com, j), d2 = Dot(d, d);
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) {
        I[r][c] += seg.mass * ((r === c ? d2 : 0) - d[r] * d[c]);
      }
      const own = seg.mass * seg.len * seg.len / 12;
      I[0][0] += own; I[1][1] += own; I[2][2] += own;
    }
    let Iinv = Inverse3(I);
    if (tuning.BONES[BoneBase(id)].isotropic) {
      const perp = Math.max(I[0][0], I[2][2]);
      Iinv = [[1 / perp, 0, 0], [0, 1 / perp, 0], [0, 0, 1 / perp]];
    }
    bones[id] = { id, joint: j, parent: ParentOf(id, tuning), I, Iinv };
  }
  const headSeg = segments.find((seg) => seg.id === "head");
  const legs = {};
  for (const side of SIDES) {
    legs[side] = { thighM: Len(Sub(joints[`calf${side}`], joints[`thigh${side}`])), calfM: Len(Sub(joints[`foot${side}`], joints[`calf${side}`])) };
  }
  return { heightM, scale, joints, segments, bones, massKg: B.massKg, headCom: headSeg.com, legs };
}

// --- 冲量 -------------------------------------------------------------------------------------
/** 受击强度 severity：kind 的增益 × clamp(伤害 / 参考伤害)。伤害取未乘部位倍率的原始伤害（有则），没有退回 damage。 */
export function HitSeverity(hit, tuning = DEFAULT_TUNING) {
  const kind = NormalizeKind(hit.kind);
  const spec = tuning.IMPULSE.kinds[kind];
  const damage = Number.isFinite(hit.rawDamage) ? hit.rawDamage : (Number.isFinite(hit.damage) ? hit.damage : spec.refDamage);
  return spec.gain * Clamp(damage / spec.refDamage, spec.minRatio, spec.maxRatio);
}

/** 命中体 id → [zone, 侧]。 */
const SHAPE_ZONES = Object.freeze({
  head: ["head", null], upperTorso: ["chestUpper", null], lowerTorso: ["chestLower", null],
  upperArmL: ["upperArm", "L"], upperArmR: ["upperArm", "R"], forearmL: ["forearm", "L"], forearmR: ["forearm", "R"],
  thighL: ["thigh", "L"], thighR: ["thigh", "R"], calfL: ["calf", "L"], calfR: ["calf", "R"],
});

/**
 * 受力段。有命中体 id 就照它；没有（AI 打 AI 那条链不做几何）就按 part，肢体一侧取「离射手近的那一侧」
 * （射手在 −dirLocal 方向，所以 −dirLocal.x > 0 取右手侧；正对着打的平局按 seed 稳定抽）。
 * @returns {{zone:string, side:"L"|"R"|null}}
 */
export function ClassifyZone({ shapeId = null, part = "torso", dirLocal = [0, 0, 1], seed = 0 } = {}) {
  const known = shapeId && SHAPE_ZONES[shapeId];
  if (known) return { zone: known[0], side: known[1] };
  const shooterX = -dirLocal[0];
  const nearSide = Math.abs(shooterX) > 0.12 ? (shooterX > 0 ? "R" : "L") : (StableUnit(seed, "hit-side") < 0.5 ? "L" : "R");
  if (part === "head") return { zone: "head", side: null };
  if (part === "arm" || part === "limb" || part === "arms") return { zone: "upperArm", side: nearSide };
  if (part === "leg" || part === "legs") return { zone: "thigh", side: nearSide };
  return { zone: "chestUpper", side: null };
}

/** 受力点缺省：该段的质心，再往射手一侧退到体表（水平）。live 是活的关节位置（有就用，没有用站姿模型）。 */
function DefaultPoint(zone, side, model, live, dirLocal) {
  const J = (name) => live?.[name] ?? model.joints[name];
  let center;
  if (zone === "head") center = model.headCom;
  else if (zone === "chestUpper") center = Lerp3(J("spine2"), J("neck"), 0.5);
  else if (zone === "chestLower") center = Lerp3(J("spine"), J("spine1"), 0.5);
  else if (zone === "upperArm") center = Lerp3(J(`upperArm${side}`), J(`forearm${side}`), 0.45);
  else if (zone === "forearm") center = Lerp3(J(`forearm${side}`), J(`hand${side}`), 0.45);
  else if (zone === "thigh") center = Lerp3(J(`thigh${side}`), J(`calf${side}`), 0.45);
  else center = Lerp3(J(`calf${side}`), J(`foot${side}`), 0.45);
  const horizontal = Norm([dirLocal[0], 0, dirLocal[2]]);
  const depth = zone === "head" ? 0.09 : zone.startsWith("chest") ? 0.13 : 0.06;
  return Sub(center, Mul(horizontal, depth));
}

/**
 * 一次命中 → 反应量。
 * @param {object} hit   演员局部系的命中：{ kind, part, shapeId, pointLocal|null, pointExact?, dirLocal, sweepLocal|null,
 *                        rawDamage?, damage, lethal?, seed? }
 * @param {ReturnType<typeof BuildBodyModel>} model
 * @param {{tuning?:object, live?:Record<string,number[]>}} [options] live：活的关节位置（演员局部系，缺的用站姿）
 */
export function ComputeHitReaction(hit, model, options = {}) {
  const tuning = options.tuning ?? DEFAULT_TUNING;
  const live = options.live ?? null;
  const kind = NormalizeKind(hit.kind);
  const severity = HitSeverity(hit, tuning);
  const impulseNs = tuning.IMPULSE.referenceNs * severity;
  // 冲量方向：飞行 / 攻击方向；白刃有扫刀方向就与它合成。
  let dir = Norm(hit.dirLocal ?? [0, 0, 1]);
  if (kind === "blade" && hit.sweepLocal && Len(hit.sweepLocal) > 1e-6) {
    const w = tuning.IMPULSE.bladeSweepWeight;
    const mixed = Norm(Add(Mul(dir, 1 - w), Mul(Norm(hit.sweepLocal), w)));
    if (Len(mixed) > 0) dir = mixed;
  }
  const J = Mul(dir, impulseNs);
  const { zone, side } = ClassifyZone({ shapeId: hit.shapeId, part: hit.part, dirLocal: dir, seed: hit.seed ?? 0 });
  // 受力点：有命中体 id（几何命中）或调用方明说 pointExact 才信 pointLocal，否则按受力段取缺省点。
  const trustPoint = hit.pointLocal && (hit.shapeId || hit.pointExact);
  const point = trustPoint ? hit.pointLocal : DefaultPoint(zone, side, model, live, dir);
  const joint = (id) => live?.[id] ?? model.joints[id];

  const omega = {};
  const AddOmega = (id, w) => {
    const cur = omega[id];
    omega[id] = cur ? Add(cur, w) : w;
  };
  const chain = tuning.CHAINS[zone];
  if (chain) {
    for (const [template, share] of chain) {
      const id = template.replace("{S}", side ?? "");
      const bone = model.bones[id];
      if (!bone) continue;
      const r = Sub(point, joint(id));
      AddOmega(id, Mul(MulMV(bone.Iinv, Cross(r, J)), share));
    }
  }
  // 颈头传递：力的一部分经脖子作用在头质心上（头相对胸顺冲量方向甩一下）。
  const transferWeight = tuning.NECK_TRANSFER.zones[zone] ?? 0;
  if (transferWeight > 0) {
    const Jh = Mul(J, tuning.NECK_TRANSFER.ratio * transferWeight);
    const headCom = live?.head ? Add(live.head, Sub(model.headCom, model.joints.head)) : model.headCom;
    const neckShare = tuning.NECK_TRANSFER.neckShare;
    AddOmega("neck", Mul(MulMV(model.bones.neck.Iinv, Cross(Sub(headCom, joint("neck")), Jh)), neckShare));
    AddOmega("head", MulMV(model.bones.head.Iinv, Cross(Sub(headCom, joint("head")), Jh)));
  }
  // 骨盆踉跄：水平面上顺冲量走半步。
  const staggerScale = tuning.STAGGER.zoneScale[zone] ?? 1;
  const pelvisVel = [J[0] * tuning.STAGGER.velocityPerNs * staggerScale, 0, J[2] * tuning.STAGGER.velocityPerNs * staggerScale];
  // 腿软：打腿（受力那条腿全量、另一条按比例）；打上身也有一点。
  const sinkV = { L: 0, R: 0 };
  const legZone = zone === "thigh" || zone === "calf";
  const sinkBase = tuning.LEG_BUCKLE.sinkMpsPerNs * impulseNs;
  if (legZone) {
    sinkV[side] = sinkBase;
    sinkV[side === "L" ? "R" : "L"] = sinkBase * tuning.LEG_BUCKLE.otherLegShare;
  } else {
    sinkV.L = sinkV.R = sinkBase * tuning.LEG_BUCKLE.bodyHitShare;
  }
  return {
    kind, zone, side, severity, impulseNs, dir, J, point, omega, pelvisVel, sinkV,
    lethal: !!hit.lethal, seed: hit.seed ?? 0,
  };
}

// --- 2. 弹簧状态 ------------------------------------------------------------------------------
/**
 * 一个人的受击反应状态（每根骨 θ/ω + 骨盆偏移 + 两条腿的下沉）。纯数据、确定性；
 * Step(dt) 用固定子步积分，休眠时 O(1)。
 */
export class HitReactionState {
  constructor(model, tuning = DEFAULT_TUNING) {
    this.model = model;
    this.tuning = tuning;
    this.bones = SPRING_BONE_IDS.map((id) => ({ id, spec: tuning.BONES[BoneBase(id)], limit: tuning.BONES[BoneBase(id)].limitDeg * Math.PI / 180, theta: [0, 0, 0], omega: [0, 0, 0] }));
    this.byId = Object.fromEntries(this.bones.map((b) => [b.id, b]));
    this.pelvis = { p: [0, 0, 0], v: [0, 0, 0] };
    this.sink = { L: { x: 0, v: 0 }, R: { x: 0, v: 0 } };
    this.mode = "live";
    this.active = false;
    this.acc = 0;
    this.age = 0;
  }

  Reset() {
    for (const b of this.bones) { b.theta = [0, 0, 0]; b.omega = [0, 0, 0]; }
    this.pelvis.p = [0, 0, 0]; this.pelvis.v = [0, 0, 0];
    for (const side of SIDES) { this.sink[side].x = 0; this.sink[side].v = 0; }
    this.mode = "live"; this.active = false; this.acc = 0; this.age = 0;
  }

  /** 把 ComputeHitReaction 的结果打进状态。致死的一下切死亡档（肌张力丢失，冲量再乘 DEATH.impulseScale）。 */
  Apply(reaction, { death = false } = {}) {
    const { DEATH: D, STAGGER: S, LEG_BUCKLE: LB } = this.tuning;
    if (death) this.mode = "death";
    const gain = death ? D.impulseScale : 1;
    for (const [id, w] of Object.entries(reaction.omega)) {
      const bone = this.byId[id];
      if (!bone) continue;
      for (let k = 0; k < 3; k += 1) bone.omega[k] += w[k] * gain;
    }
    if (!death) {
      for (let k = 0; k < 3; k += 1) this.pelvis.v[k] += reaction.pelvisVel[k];
      for (const side of SIDES) this.sink[side].v += reaction.sinkV[side];
      // 连续中弹会叠速度，但不许叠到离谱：速度封顶在「弹簧最大位移 × ω × 3」（位移本身另有硬上限）。
      const speed = Math.hypot(this.pelvis.v[0], this.pelvis.v[2]);
      const cap = S.maxM * 2 * Math.PI * S.freqHz * 3;
      if (speed > cap) { const s = cap / speed; this.pelvis.v[0] *= s; this.pelvis.v[2] *= s; }
      for (const side of SIDES) this.sink[side].v = Math.min(this.sink[side].v, LB.maxSinkM * 2 * Math.PI * LB.freqHz * 3);
    }
    this.active = true;
    this.age = 0;
  }


  /** 推进 dt 秒（固定子步，一帧最多 maxSubsteps 步）。 */
  Step(dt) {
    if (!this.active) return;
    const { SOLVER: SV } = this.tuning;
    const h = SV.stepS;
    this.age += dt;
    this.acc = Math.min(this.acc + Math.max(0, dt), h * SV.maxSubsteps);
    while (this.acc >= h) {
      this.acc -= h;
      this._Substep(h);
    }
    this._TrySleep();
  }

  _Substep(h) {
    const { STAGGER: S, LEG_BUCKLE: LB } = this.tuning;
    const death = this.mode === "death", D = this.tuning.DEATH;
    for (const bone of this.bones) {
      // 死亡档：肌张力丢失（频率降、阻尼升）。不建临时数组——这里一帧要跑「子步 × 骨头 × 人」遍。
      const f = death ? bone.spec.freqHz * D.frequencyScale : bone.spec.freqHz;
      const zeta = death ? Math.max(bone.spec.zeta, D.dampingRatio) : bone.spec.zeta;
      const th = bone.theta, om = bone.omega;
      for (let a = 0; a < 3; a += 1) {
        const wn = 2 * Math.PI * f * (a === 1 ? (bone.spec.twistFreqScale ?? 1) : 1), k = wn * wn, c = 2 * zeta * wn;
        om[a] += (-k * th[a] - c * om[a]) * h;
        th[a] += om[a] * h;
      }
      const mag = Len(th);
      if (mag > bone.limit) {
        const s = bone.limit / mag;
        th[0] *= s; th[1] *= s; th[2] *= s;
        const nx = th[0] / bone.limit, ny = th[1] / bone.limit, nz = th[2] / bone.limit;
        const out = Math.max(0, om[0] * nx + om[1] * ny + om[2] * nz);
        om[0] -= out * nx; om[1] -= out * ny; om[2] -= out * nz;
      }
    }
    if (this.mode === "death") return;
    {
      const wn = 2 * Math.PI * S.freqHz, k = wn * wn, c = 2 * S.zeta * wn;
      for (const a of [0, 2]) {
        this.pelvis.v[a] += (-k * this.pelvis.p[a] - c * this.pelvis.v[a]) * h;
        this.pelvis.p[a] += this.pelvis.v[a] * h;
      }
      const m = Math.hypot(this.pelvis.p[0], this.pelvis.p[2]);
      if (m > S.maxM) { const s = S.maxM / m; this.pelvis.p[0] *= s; this.pelvis.p[2] *= s; }
    }
    {
      const wn = 2 * Math.PI * LB.freqHz, k = wn * wn, c = 2 * LB.zeta * wn;
      for (const side of SIDES) {
        const leg = this.sink[side];
        leg.v += (-k * leg.x - c * leg.v) * h;
        leg.x += leg.v * h;
        if (leg.x < 0) { leg.x = 0; if (leg.v < 0) leg.v = 0; }   // 腿软只会往下掉，不会把人顶起来
        if (leg.x > LB.maxSinkM) { leg.x = LB.maxSinkM; if (leg.v > 0) leg.v = 0; }
      }
    }
  }

  _TrySleep() {
    const sl = this.tuning.SOLVER.sleep;
    for (const bone of this.bones) {
      if (Len(bone.theta) > sl.angleRad || Len(bone.omega) > sl.omegaRadS) return;
    }
    if (Math.hypot(this.pelvis.p[0], this.pelvis.p[2]) > sl.offsetM || Math.hypot(this.pelvis.v[0], this.pelvis.v[2]) > sl.velocityMps) return;
    for (const side of SIDES) if (this.sink[side].x > sl.offsetM || Math.abs(this.sink[side].v) > sl.velocityMps) return;
    const mode = this.mode;
    this.Reset();
    this.mode = mode;   // 死后休眠不回活档（尸体再挨打不该重新「活」起来）
  }

  /** 当前每根骨的角位移（乘包络）。返回内部数组的拷贝，调用方随便写。 */
  Thetas(envelope = 1) {
    return this.bones.map((b) => ({ id: b.id, theta: [b.theta[0] * envelope, b.theta[1] * envelope, b.theta[2] * envelope] }));
  }

  /** 骨盆偏移（演员局部系）：水平踉跄 + 两腿下沉的平均（往下为负 y）。活档才有。 */
  PelvisOffset() {
    if (this.mode === "death") return [0, 0, 0];
    return [this.pelvis.p[0], 0 - (this.sink.L.x + this.sink.R.x) / 2, this.pelvis.p[2]];
  }

  /**
   * 每条腿的髋前屈 α 与膝屈 β：脚不离地时 β = 2α，α = acos(1 − d / (2L))（L = 大腿小腿平均长）。
   * 只画「腿在动」的结果，骨盆的 −d/… 由 PelvisOffset 给（两条腿平均，所以受力腿的脚会有几毫米出入）。
   */
  LegFlex() {
    const flex = { L: { hip: 0, knee: 0 }, R: { hip: 0, knee: 0 } };
    if (this.mode === "death") return flex;
    for (const side of SIDES) {
      const x = this.sink[side].x;
      if (x <= 1e-5) continue;
      const leg = this.model.legs[side];
      const L = (leg.thighM + leg.calfM) / 2;
      const alpha = Math.acos(Clamp(1 - x / (2 * L), -1, 1));
      flex[side] = { hip: alpha, knee: 2 * alpha };
    }
    return flex;
  }
}

/**
 * 死亡进度 t → 偏移包络：t ≤ fadeStartT 全幅，fadeEndT 之后**严格为 0**，中间平滑过渡。
 * 给了 durationS（这条倒地动作以实际速率播多少秒）时再按秒包一层（fadeStartS → fadeEndS），两者取小：
 * 长 clip 上冲击不许拖到人都躺平了以后。
 */
export function DeathEnvelope(t, tuning = DEFAULT_TUNING, durationS = null) {
  const { fadeStartT, fadeEndT, fadeStartS, fadeEndS } = tuning.DEATH;
  if (!(t < fadeEndT)) return 0;
  const byProgress = t <= fadeStartT ? 1 : 1 - SmoothStep(fadeStartT, fadeEndT, t);
  if (!(durationS > 0) || !(fadeEndS > fadeStartS)) return byProgress;
  const seconds = t * durationS;
  if (!(seconds < fadeEndS)) return 0;
  return Math.min(byProgress, seconds <= fadeStartS ? 1 : 1 - SmoothStep(fadeStartS, fadeEndS, seconds));
}

/**
 * 死亡转向的进度（0..1）：倒地开始后 yawBlendS 秒内平滑转完；进度 yawBlendEndT 是硬上限（接地拟合之前必须转完）。
 * durationS 不给就只按进度（老口径）。
 */
export function DeathYawBlend(t, tuning = DEFAULT_TUNING, durationS = null) {
  const { yawBlendS, yawBlendEndT } = tuning.DEATH;
  const byProgress = Clamp(t / yawBlendEndT, 0, 1);
  const u = durationS > 0 && yawBlendS > 0 ? Math.max(byProgress, Clamp(t * durationS / yawBlendS, 0, 1)) : byProgress;
  return u * u * (3 - 2 * u);
}

// --- 3. 方向死亡选择 --------------------------------------------------------------------------
const WrapPi = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const Phi = (v) => Math.atan2(v[1], v[0]);       // v = [x, z]
const Unit2 = (v) => { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0] / l, v[1] / l] : null; };

/**
 * 绕 +Y 转多少弧度能把 XZ 向量 a 转到 b。three 的 makeRotationY(ψ) 把 (x, z) 变成
 * (x cosψ + z sinψ, −x sinψ + z cosψ)，即 XZ 平面里的标准转角 −ψ，所以 ψ = −(φ_b − φ_a)。
 */
export function YawToTurn(a, b) { return -WrapPi(Phi(b) - Phi(a)); }
/** 绕 +Y 转 ψ 之后的 XZ 向量（与 three 的 makeRotationY 同一个约定，测试用它对拍）。 */
export function RotateYaw(v, psi) { return [v[0] * Math.cos(psi) + v[1] * Math.sin(psi), -v[0] * Math.sin(psi) + v[1] * Math.cos(psi)]; }

/**
 * 期望倒向（演员局部 XZ 单位向量；null + crumple=true 表示原地瘫）。
 * 规则见 docs/Data_HitReaction.md §5：子弹 / 机枪 / 爆炸顺冲量；爆头一半原地瘫；打腿往受力侧前方塌；
 * 大刀顺扫刀；刺刀捅往攻击者一侧折下去或原地瘫。
 * @param {{kind:string, part?:string, shapeId?:string, dirLocal:number[], sweepLocal?:number[]|null, seed?:number}} hit
 */
export function DesiredFall(hit, tuning = DEFAULT_TUNING) {
  const S = tuning.DEATH_SELECT;
  const kind = NormalizeKind(hit.kind);
  const seed = hit.seed ?? 0;
  const { zone, side } = ClassifyZone({ shapeId: hit.shapeId, part: hit.part, dirLocal: hit.dirLocal ?? [0, 0, 1], seed });
  const flight = Unit2([(hit.dirLocal ?? [0, 0, 1])[0], (hit.dirLocal ?? [0, 0, 1])[2]]);
  const crumple = (why) => ({ crumple: true, vec: null, zone, side, why });
  if (kind === "thrust") {
    if (!flight || StableUnit(seed, "thrust-fold") >= S.thrustFoldChance) return crumple("thrust-crumple");
    return { crumple: false, vec: [-flight[0], -flight[1]], zone, side, why: "thrust-fold" };
  }
  if (zone === "thigh" || zone === "calf") {
    const sign = side === "L" ? -1 : 1;
    const w = S.legSideWeight;
    return { crumple: false, vec: [sign * w, -Math.sqrt(1 - w * w)], zone, side, why: "leg-forward-side" };
  }
  if (kind === "blade") {
    const sweep = hit.sweepLocal ? Unit2([hit.sweepLocal[0], hit.sweepLocal[2]]) : null;
    const vec = sweep ?? flight;
    return vec ? { crumple: false, vec, zone, side, why: "blade-sweep" } : crumple("blade-vertical");
  }
  if (zone === "head" && kind !== "blast" && StableUnit(seed, "head-crumple") < S.crumpleChance) return crumple("head-crumple");
  if (!flight) return crumple("vertical");
  return { crumple: false, vec: flight, zone, side, why: "along-impulse" };
}

/**
 * 在候选里选一条。
 * @param {{crumple:boolean, vec:number[]|null}} desired
 * @param {Array<{id:string, family:string, fallLocal:number[], source?:string}>} candidates
 * @returns {{id:string, family:string, source:string|null, yawRad:number, residualDeg:number, desiredDeg:number|null, tied:number}|null}
 */
export function ChooseDeathClip(desired, candidates, seed = 0, tuning = DEFAULT_TUNING) {
  const S = tuning.DEATH_SELECT;
  if (!candidates?.length) return null;
  const sorted = [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = (list, tag) => list[Math.min(list.length - 1, Math.floor(StableUnit(seed, tag) * list.length))];
  if (desired.crumple) {
    // 按仿真时打的部位配对（DEATH_SELECT 头注）：爆头取打头烘的，其余取打躯干烘的；配不上才用整个池。
    const all = sorted.filter((c) => c.family === "crumple");
    const want = desired.zone === "head" ? "head" : "torso";
    const matched = all.filter((c) => !c.impactPart || c.impactPart === want);
    const pool = matched.length ? matched : all;
    if (pool.length) {
      const chosen = pick(pool, "crumple-pick");
      return { id: chosen.id, family: chosen.family, source: chosen.source ?? null, yawRad: 0, residualDeg: 0, desiredDeg: null, tied: pool.length };
    }
    // 库里没有原地瘫的：按 seed 抽一条，不转向（与没有命中信息的老路同一口径）。
    const chosen = pick(sorted, "crumple-fallback");
    return { id: chosen.id, family: chosen.family, source: chosen.source ?? null, yawRad: 0, residualDeg: 0, desiredDeg: null, tied: sorted.length };
  }
  const directional = sorted.filter((c) => c.family !== "crumple" && c.fallLocal);
  const pool = directional.length ? directional : sorted;
  const want = Phi(desired.vec);
  const scored = pool.map((c) => ({ c, diff: Math.abs(WrapPi(want - Phi(c.fallLocal))) }));
  const best = Math.min(...scored.map((s) => s.diff));
  const tieRad = S.tieDeg * Math.PI / 180;
  const tied = scored.filter((s) => s.diff <= best + tieRad).map((s) => s.c);
  const chosen = pick(tied, "dir-pick");
  const turnNeeded = YawToTurn(chosen.fallLocal, desired.vec);
  const limit = S.maxYawResidualDeg * Math.PI / 180;
  const yawRad = Clamp(turnNeeded, -limit, limit);
  return {
    id: chosen.id, family: chosen.family, source: chosen.source ?? null, yawRad,
    residualDeg: Math.abs(WrapPi(turnNeeded - yawRad)) * 180 / Math.PI,
    desiredDeg: want * 180 / Math.PI, tied: tied.length,
  };
}

/** 库缺失时的候选：Kimodo A–D（实测都往右倒）。 */
export function FallbackCandidates(tuning = DEFAULT_TUNING) {
  return Object.entries(tuning.FALLBACK_DEATH.clips).map(([id, c]) => ({ id, family: c.family, fallLocal: c.fallLocal, source: "kimodo" }));
}

/** 演员局部系的 XZ 倒向：终帧头 − 起点骨盆（地面投影）。库 profile 的 fallLocal 与它同一口径。 */
export function FallDirectionOf(pelvisStart, headEnd) {
  return Unit2([headEnd[0] - pelvisStart[0], headEnd[2] - pelvisStart[2]]);
}
