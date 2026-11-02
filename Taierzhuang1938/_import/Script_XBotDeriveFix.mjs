// 派生动作（_import/Script_XBotDeriveClips.mjs 换算出来的 X Bot 动作）的后处理，2026-11-02 全库审查之后加的。
//
// 换算只搬骨头朝向（Script_XBotRetarget）。X Bot 胳膊比士兵长（按身高算长 9%）、胯高 6%、肩低，所以：
//   · 原动作里手贴着自己身体（抱头、捂伤、扶膝、两手握枪于身前），换过来手就扎进身体；
//   · 手抓着别的东西（被角、担架杆、衣领、地面），换过来离那东西差 5–14 cm。
// 这里逐帧给每只手一个目标掌心，再两节骨 IK 去够（ArmFixer）：
//   · 起点 = 换算结果的掌心；派生脚本列为「攥着别的东西」的手（ANCHORED_HANDS）改用原身体掌心 ÷ 运行时缩放
//     （白盒里 X Bot 按两边头高之比缩到原身体的个头，这一点在世界里正好落在原来那只手的位置上，攥着的东西不跑）；
//   · 贴身体：原身体掌心离自己身体表面多远（椭圆截面胶囊，拟合法同 Script_MixamoLibraryAudit.mjs），X Bot 掌心就沿最近那段
//     的表面法向挪到同样远（按缩放），原来贴着的还贴着（不按骨名对应段：两套骨同名骨管的肉不是同一块）；
//   · 推出：手掌指节 / 前臂仍扎进 X Bot 身体的，目标沿表面外推，逐帧推的量前后平滑几轮。
//   手腕的世界朝向保持换算结果，肘弯平面沿用换算结果。
// 抽搐（某帧离前后两帧中间姿势远，原片段数据里就有、换算原样搬过来）：Despike 只动那几帧。
//
// 量法与 Script_MixamoLibraryAudit.mjs 同（手掌指节点、前臂三点、胶囊深度；对过数，逐条一致），Measure 供烘焙时写调整记录。
import fs from "node:fs";
import * as THREE from "three";

// ---------------------------------------------------------------- GLB

export function ReadGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.length > binStart ? buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen)) : null;
  return { json, bin };
}

const COMPONENT = { 5126: [4, "readFloatLE", 1], 5121: [1, "readUInt8", 255], 5123: [2, "readUInt16LE", 65535], 5125: [4, "readUInt32LE", 4294967295] };
export function ReadAccessor({ json, bin }, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const [size, read, max] = COMPONENT[a.componentType];
  const offset = (view.byteOffset || 0) + (a.byteOffset || 0), stride = view.byteStride || comps * size;
  const out = new Float32Array(a.count * comps);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < comps; c++) {
    const v = bin[read](offset + i * stride + c * size);
    out[i * comps + c] = a.normalized ? v / max : v;
  }
  return { values: out, comps, count: a.count };
}


const Key = (name) => String(name).replace(/[\s.:]/g, "_");

/**
 * 按骨拟合椭圆截面胶囊（同审查脚本）：蒙皮顶点按 glTF 的绑定（inverseBindMatrix × v；three 的 GLTFLoader 绑定时网格还没挂上父节点，bindMatrix 是单位阵）换到主权重骨（≥ 0.6）的本地，
 * 截面中心取中位数、半轴取第 85 百分位、两端取第 5 / 95 百分位。align(key) 给一个四元数 A 时，胶囊坐标系 = 骨 × A
 * （士兵骨按换算的修正量对齐到 X Bot 骨的轴向）。返回 Map key → { cx, cz, rx, rz, y0, y1, A, unit }，
 * 长度单位是骨本地的（unit = 骨初始世界矩阵的缩放，乘上去是米）。
 */
export function FitVolumes(file, keys, align = null) {
  const glb = ReadGlb(file), { json } = glb;
  const skin = json.skins[0], ibm = ReadAccessor(glb, skin.inverseBindMatrices).values;
  const jointKey = skin.joints.map(j => Key(json.nodes[j].name));
  const want = new Map(keys.map(k => [Key(k), []]));
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined || node.skin === undefined) return;
    for (const prim of json.meshes[node.mesh].primitives) {
      const pos = ReadAccessor(glb, prim.attributes.POSITION), J = ReadAccessor(glb, prim.attributes.JOINTS_0), W = ReadAccessor(glb, prim.attributes.WEIGHTS_0);
      for (let i = 0; i < pos.count; i++) {
        let best = -1, bw = 0;
        for (let k = 0; k < 4; k++) { const w = W.values[i * 4 + k]; if (w > bw) { bw = w; best = J.values[i * 4 + k]; } }
        if (bw < 0.6) continue;
        const list = want.get(jointKey[best]);
        if (!list) continue;
        v.set(pos.values[i * 3], pos.values[i * 3 + 1], pos.values[i * 3 + 2]).applyMatrix4(m.fromArray(ibm, best * 16));
        list.push([v.x, v.y, v.z]);
      }
    }
  });
  const Pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const out = new Map();
  for (const [key, pts] of want) {
    if (pts.length < 20) continue;
    const ji = jointKey.indexOf(key);
    const unit = new THREE.Vector3().setFromMatrixScale(new THREE.Matrix4().fromArray(ibm, ji * 16).invert()).x;
    const A = align ? align(key) : null;
    if (A) { const Ai = A.clone().invert(); for (const p of pts) { v.fromArray(p).applyQuaternion(Ai); p[0] = v.x; p[1] = v.y; p[2] = v.z; } }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), zs = pts.map(p => p[2]);
    const cx = Pct(xs, 0.5), cz = Pct(zs, 0.5);
    out.set(key, { key, cx, cz, rx: Pct(xs.map(x => Math.abs(x - cx)), 0.85), rz: Pct(zs.map(z => Math.abs(z - cz)), 0.85),
      y0: Pct(ys, 0.05), y1: Pct(ys, 0.95), A, unit });
  }
  return out;
}

// ---------------------------------------------------------------- 骨架

/** bones: [{ parent, local: { p } }]（父在前）。按本地朝向 + 本地位置（hips 另给）算模型空间世界矩阵。 */
export function ForwardKinematics(bones, localQ, rootParent, out, hipsIndex = -1, hipsP = null) {
  const p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    if (i === hipsIndex && hipsP) p.copy(hipsP); else p.fromArray(b.local.p);
    (out[i] || (out[i] = new THREE.Matrix4())).compose(p, localQ[i], one);
    out[i].premultiply(b.parent >= 0 ? out[b.parent] : rootParent);
  }
  return out;
}

/** 源（士兵）一帧：values[i*stride..]（p xyz、q xyzw）→ 模型空间世界矩阵。 */
export function SourceKinematics(rest, values, stride, above, out) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < rest.bones.length; i++) {
    const o = i * stride;
    (out[i] || (out[i] = new THREE.Matrix4())).compose(p.set(values[o], values[o + 1], values[o + 2]), q.set(values[o + 3], values[o + 4], values[o + 5], values[o + 6]), one);
    const par = rest.bones[i].parent;
    if (par >= 0) out[i].premultiply(out[par]); else if (above) out[i].premultiply(above);
  }
  return out;
}

// ---------------------------------------------------------------- 胶囊

const HAND_TARGETS = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"];
const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
export const AUDIT_BODY = HAND_TARGETS;

/** 一段胶囊此刻的坐标系：frame（世界，含对齐与缩放）、inv、scale（米 / 本地单位）。 */
function Place(vol, boneWorld, slot) {
  const s = slot || { frame: new THREE.Matrix4(), inv: new THREE.Matrix4(), rot: new THREE.Quaternion(), scale: 1, vol };
  s.frame.copy(boneWorld);
  if (vol.A) s.frame.multiply(_m.makeRotationFromQuaternion(vol.A));
  s.inv.copy(s.frame).invert();
  s.frame.decompose(_v, s.rot, _v2);
  s.scale = _v2.x;
  return s;
}
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

/** 点（世界，半径 r）进胶囊多深（米，> 0 在里面），同审查脚本。grad 给了就写世界里的外推方向（单位向量）。 */
function Depth(slot, world, r, grad = null) {
  const vol = slot.vol, t = _v.copy(world).applyMatrix4(slot.inv);
  const k = Math.min(vol.rx, vol.rz);
  const dy = t.y < vol.y0 ? t.y - vol.y0 : t.y > vol.y1 ? t.y - vol.y1 : 0;
  const ex = (t.x - vol.cx) / vol.rx, ez = (t.z - vol.cz) / vol.rz, ey = dy / k;
  const e = Math.hypot(ex, ez, ey);
  if (grad) {
    grad.set(ex / vol.rx, ey / k, ez / vol.rz);
    if (grad.lengthSq() < 1e-12) grad.set(1, 0, 0);
    grad.applyQuaternion(slot.rot).normalize();
  }
  return (1 - e) * k * slot.scale + r;
}

// ---------------------------------------------------------------- 量（同审查脚本）

/**
 * X Bot 一套骨（RestSkeleton）+ 拟合好的胶囊 → 量手 / 前臂进身体多深的工具。
 * Measure(worlds) 给这一帧每只手 { hand: {depth, part, bone}, fore: {depth, bone} }。
 */
export class XBotBody {
  constructor(rest, volumes) {
    this.rest = rest;
    this.vols = HAND_TARGETS.filter(k => volumes.has(k)).map(k => ({ vol: volumes.get(k), bone: rest.Find(k) }));
    this.slots = this.vols.map(x => ({ frame: new THREE.Matrix4(), inv: new THREE.Matrix4(), rot: new THREE.Quaternion(), scale: 1, vol: x.vol }));
    this.side = {};
    for (const s of ["Right", "Left"]) {
      this.side[s] = {
        arm: rest.Find(`${s}Arm`), fore: rest.Find(`${s}ForeArm`), hand: rest.Find(`${s}Hand`), middle: rest.Find(`${s}HandMiddle1`),
        shoulder: rest.Find(`${s}Shoulder`),
        points: [{ b: rest.Find(`${s}Hand`), r: 0.025, part: "腕" },
          ...FINGERS.flatMap(f => [1, 2, 3, 4].map(k => ({ b: rest.Find(`${s}Hand${f}${k}`), r: k === 4 ? 0.006 : 0.01, part: `${f}${k}` }))).filter(x => x.b >= 0)],
      };
    }
  }
  Update(worlds) { this.vols.forEach((x, i) => Place(x.vol, worlds[x.bone], this.slots[i])); }
  /** 一个世界点（半径 r）进身体最深的那段：{ depth, bone, grad }。 */
  Deepest(p, r, wantGrad = false) {
    let best = { depth: -1, bone: null, grad: null };
    const g = new THREE.Vector3();
    for (const slot of this.slots) {
      const d = Depth(slot, p, r, wantGrad ? g : null);
      if (d > best.depth) best = { depth: d, bone: slot.vol.key, grad: wantGrad ? g.clone() : null };
    }
    return best;
  }
  /** 这一帧这只手：手掌指节最深、前臂三点最深（世界矩阵 worlds 已 Update 过）。 */
  MeasureSide(worlds, s, wantGrad = false) {
    const sd = this.side[s], p = new THREE.Vector3();
    let hand = { depth: -1 }, fore = { depth: -1 };
    for (const hp of sd.points) {
      p.setFromMatrixPosition(worlds[hp.b]);
      const d = this.Deepest(p, hp.r, wantGrad);
      if (d.depth > hand.depth) hand = { ...d, part: hp.part, point: p.clone() };
    }
    const F = new THREE.Vector3().setFromMatrixPosition(worlds[sd.fore]), H = new THREE.Vector3().setFromMatrixPosition(worlds[sd.hand]);
    for (const t of [0.35, 0.6, 0.85]) {
      p.copy(F).lerp(H, t);
      const d = this.Deepest(p, 0.03, wantGrad);
      if (d.depth > fore.depth) fore = { ...d, along: t, point: p.clone() };
    }
    return { hand, fore };
  }
}

/** 抽搐（同审查脚本）：每根骨每帧离前后两帧中间姿势的角度，取最大的几条。 */
export function Glitches(tracks, names, min = 12) {
  const out = [], mid = new THREE.Quaternion(), a = new THREE.Quaternion(), b = new THREE.Quaternion(), c = new THREE.Quaternion();
  tracks.forEach((tr, bi) => {
    if (!tr) return;
    const n = tr.length / 4;
    for (let i = 1; i < n - 1; i++) {
      a.fromArray(tr, (i - 1) * 4); b.fromArray(tr, i * 4); c.fromArray(tr, (i + 1) * 4);
      mid.copy(a).slerp(c, 0.5);
      const d = Angle(b, mid);
      if (d > min) out.push({ bone: names[bi], frame: i, deg: +d.toFixed(1) });
    }
  });
  return out.sort((x, y) => y.deg - x.deg);
}
export const Angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;

// ---------------------------------------------------------------- 去抽搐

/**
 * 本地朝向轨（Float32Array，xyzw 逐帧）去一帧的抽搐：某帧离前后两帧中间姿势 > hi 度的拉向中间姿势（lo..hi 渐变），
 * 反复几遍直到都 ≤ hi；只动超标的那几帧，其它帧原样。返回 [{ frame, deg（改前） }]。
 */
export function Despike(track, { lo = 7, hi = 11, rounds = 24 } = {}) {
  const n = track.length / 4, touched = new Map();
  if (n < 3) return [];
  const a = new THREE.Quaternion(), b = new THREE.Quaternion(), c = new THREE.Quaternion(), mid = new THREE.Quaternion();
  for (let round = 0; round < rounds; round++) {
    let worst = 0;
    const moves = [];
    for (let i = 1; i < n - 1; i++) {
      a.fromArray(track, (i - 1) * 4); b.fromArray(track, i * 4); c.fromArray(track, (i + 1) * 4);
      mid.copy(a).slerp(c, 0.5);
      const d = Angle(b, mid);
      worst = Math.max(worst, d);
      if (d <= lo) continue;
      const w = Math.min(1, (d - lo) / (hi - lo)) * 0.85;
      moves.push([i, b.clone().slerp(mid, w), d]);
    }
    if (worst <= hi) break;
    // 隔帧改（同一遍里相邻两帧都改会互相追）
    const taken = new Set();
    moves.sort((x, y) => y[2] - x[2]);
    for (const [i, q, d] of moves) {
      if (taken.has(i - 1) || taken.has(i + 1)) continue;
      taken.add(i);
      if (!touched.has(i)) touched.set(i, d);
      const prev = new THREE.Quaternion().fromArray(track, i * 4);
      if (prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      track.set([q.x, q.y, q.z, q.w], i * 4);
    }
  }
  return [...touched].map(([frame, deg]) => ({ frame, deg: +deg.toFixed(1) })).sort((x, y) => x.frame - y.frame);
}

// ---------------------------------------------------------------- 手：从原身体换目标 + 两节骨 IK + 推出

/** 原身体（士兵骨）量「手离自己身体多远」用的段，同审查脚本那几段（X Bot 名 → 士兵骨）。 */
export const BODY_PAIRS = Object.freeze({
  Hips: "Bip001_Pelvis", Spine: "Bip001_Spine", Spine1: "Bip001_Spine1", Spine2: "Bip001_Spine2", Neck: "Bip001_Neck", Head: "Bip001_Head",
  LeftUpLeg: "Bip001_L_Thigh", RightUpLeg: "Bip001_R_Thigh", LeftLeg: "Bip001_L_Calf", RightLeg: "Bip001_R_Calf",
});
/**
 * 调参（米）：原手离自己身体 contactNear 内全按「同样近」贴、contactFar 外不管（contact: "hand" 按手上各点量、"palm" 只按掌心量）；
 * 推出后留的余量（审查量法：手 ≤ handGoal、前臂 ≤ foreGoal，审查门槛手 1.5 cm、前臂 2 cm）；推出每帧梯度最多迭代几次；
 * 推的方向按 dirSmooth（帧）平滑，推的远近先取前后 dilate 帧里最大的再按 smoothFrames 平滑；最多推 maxPush；
 * swivel：推不干净时允许肘绕肩—腕连线外转（±20…80°，逐帧挑、同样先扩后平滑）。
 */
export const ARM_FIX = Object.freeze({ contactNear: 0.03, contactFar: 0.1, handGoal: 0.006, foreGoal: 0.012, iterations: 10, smoothFrames: 1.5, dilate: 2, dirSmooth: 3, maxPush: 0.25, contact: "hand", swivel: false });

const Smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SEARCH_DIRS = (() => {
  const out = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    const n = Math.abs(x) + Math.abs(y) + Math.abs(z);
    if (n === 1 || n === 2) out.push(new THREE.Vector3(x, y, z).normalize());
  }
  return out;
})();
const NewSlot = (vol) => ({ frame: new THREE.Matrix4(), inv: new THREE.Matrix4(), rot: new THREE.Quaternion(), scale: 1, vol });

export class ArmFixer {
  /**
   * xbot: { rest, above, volumes }；source（换算的有，镜像的没有）: { rest, volumes（按 C 对齐过的）, scaleK（原身体头高 / X Bot 头高） }。
   */
  constructor(xbot, source = null, options = {}) {
    this.o = { ...ARM_FIX, ...options };
    this.x = xbot; this.src = source;
    this.body = new XBotBody(xbot.rest, xbot.volumes);
    this.hips = xbot.rest.Find("Hips");
    if (source) {
      const R = source.rest;
      this.srcSlots = Object.values(BODY_PAIRS).map(k => ({ bone: R.Find(k), vol: source.volumes.get(k) })).filter(x => x.bone >= 0 && x.vol)
        .map(x => ({ ...x, slot: NewSlot(x.vol) }));
      this.srcPalm = { Right: [R.Find("Bip001_R_Hand"), R.Find("Bip001_R_Finger2")], Left: [R.Find("Bip001_L_Hand"), R.Find("Bip001_L_Finger2")] };
      // 原身体手上的点（同 X Bot 那套：腕 2.5 cm、各指关节 1 cm），量「这只手离自己身体多近」
      this.srcHandPoints = Object.fromEntries(["R", "L"].map(c => [c === "R" ? "Right" : "Left", [{ b: R.Find(`Bip001_${c}_Hand`), r: 0.025 },
        ...[0, 1, 2, 3, 4].flatMap(i => ["", "1", "2"].map(j => ({ b: R.Find(`Bip001_${c}_Finger${i}${j}`), r: 0.01 })))].filter(x => x.b >= 0)]));
    }
  }

  Palm(worlds, s, out = new THREE.Vector3()) {
    const sd = this.body.side[s];
    return out.setFromMatrixPosition(worlds[sd.hand]).lerp(_v3.setFromMatrixPosition(worlds[sd.middle]), 0.55);
  }

  /** 原身体这一帧的掌心（模型空间）与这只手离自己身体多近（米，手上各点里最近的那个；负 = 扎进去了）。 */
  SourcePalm(srcW, s) {
    const [hi, mi] = this.srcPalm[s];
    const P = new THREE.Vector3().setFromMatrixPosition(srcW[hi]).lerp(_v3.setFromMatrixPosition(srcW[mi]), 0.55);
    for (const x of this.srcSlots) Place(x.vol, srcW[x.bone], x.slot);
    let ds = Infinity, dp = Infinity;
    const p = new THREE.Vector3();
    for (const hp of this.srcHandPoints[s]) {
      p.setFromMatrixPosition(srcW[hp.b]);
      for (const x of this.srcSlots) ds = Math.min(ds, -Depth(x.slot, p, hp.r));
    }
    for (const x of this.srcSlots) dp = Math.min(dp, -Depth(x.slot, P, 0));
    return { P, ds: this.o.contact === "palm" ? dp : ds };
  }

  /**
   * 贴身体：原手离自己身体 ds（米，按手上各点量），X Bot 这只手（worlds 此刻的姿势，掌心在 T）沿离身体最近那一点的
   * 表面法向挪到同样近（× k），权重 w。手整体平移多少，最近那一点离表面就差不多变多少。this.body 已 Update 到这一帧。
   */
  KeepContact(T, ds, k, w, worlds, s) {
    if (w <= 0) return T;
    if (this.o.contact === "palm") {
      // 只按掌心量（手指弯着贴身体时会把掌心拉得太近，所以有「按手上各点」那一种；两种都烘，挑好的）
      for (let it = 0; it < 3; it++) {
        const near = this.body.Deepest(T, 0, true);
        const step = (Math.max(0, ds) * k + near.depth) * w;
        if (Math.abs(step) < 0.002) break;
        T.addScaledVector(near.grad, step);
      }
      return T;
    }
    const m = this.body.MeasureSide(worlds, s, true);
    const step = (Math.max(0, ds) * k + m.hand.depth) * w;   // m.hand.depth = −离表面最近的距离
    if (step < 0 && m.hand.grad) T.addScaledVector(m.hand.grad, Math.max(step, -0.1));   // 只往里贴（扎进去的交给推出），一次最多 10 cm
    return T;
  }

  /**
   * 两节骨 IK：让掌心到 palmT；肘弯平面沿用此刻的（swivel 弧度 = 再绕肩—腕连线转多少，缺省取 this.swivel），手腕世界朝向不变。
   * 改 localQ（Arm / ForeArm / Hand），重算 worlds。
   */
  SolveArm(localQ, hipsP, worlds, s, palmT, swivel = this.swivel || 0) {
    const sd = this.body.side[s], rest = this.x.rest;
    const A = new THREE.Vector3().setFromMatrixPosition(worlds[sd.arm]), B = new THREE.Vector3().setFromMatrixPosition(worlds[sd.fore]);
    const C = new THREE.Vector3().setFromMatrixPosition(worlds[sd.hand]);
    const qU = new THREE.Quaternion(), qF = new THREE.Quaternion(), qH = new THREE.Quaternion(), qP = new THREE.Quaternion();
    worlds[sd.arm].decompose(_v, qU, _v2); worlds[sd.fore].decompose(_v, qF, _v2); worlds[sd.hand].decompose(_v, qH, _v2);
    worlds[rest.bones[sd.arm].parent].decompose(_v, qP, _v2);
    const palm = this.Palm(worlds, s);
    const wristT = palmT.clone().sub(palm).add(C);
    const L1 = A.distanceTo(B), L2 = B.distanceTo(C);
    const toT = wristT.clone().sub(A), far = toT.length();
    const d = Math.min(Math.max(far, Math.abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9995);
    const u = toT.normalize();
    // 肘往哪边弯：保持换算结果那条胳膊所在平面的法向（目标挪得再远肘也不翻面）；胳膊伸直、平面不定时退回肘的投影
    const AB = B.clone().sub(A), AC = C.clone().sub(A), n = AB.clone().cross(AC);
    const sinElbow = n.length() / Math.max(1e-9, AB.length() * AC.length());
    const proj = AB.clone().addScaledVector(u, -AB.dot(u));
    if (proj.lengthSq() > 1e-12) proj.normalize();
    const bend = sinElbow > 1e-6 ? u.clone().cross(n).normalize().lerp(proj, 1 - Smooth(0.05, 0.25, sinElbow)) : proj;   // 快伸直时平面不定，退回肘的投影
    if (bend.lengthSq() < 1e-10) bend.set(0, -1, 0).addScaledVector(u, u.y);
    bend.normalize();
    if (swivel) bend.applyAxisAngle(u, swivel);            // 肘绕肩—腕连线转（手的位置不变，只挪肘）
    const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const B2 = A.clone().addScaledVector(u, L1 * cosA).addScaledVector(bend, L1 * Math.sqrt(1 - cosA * cosA));
    const C2 = A.clone().addScaledVector(u, d);
    const rU = new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(), B2.clone().sub(A).normalize());
    const qU2 = rU.clone().multiply(qU);
    const foreOld = C.clone().sub(B).applyQuaternion(rU).normalize();
    const rF = new THREE.Quaternion().setFromUnitVectors(foreOld, C2.clone().sub(B2).normalize());
    const qF2 = rF.multiply(rU).multiply(qF);
    localQ[sd.arm].copy(qP.clone().invert().multiply(qU2));
    localQ[sd.fore].copy(qU2.clone().invert().multiply(qF2));
    localQ[sd.hand].copy(qF2.clone().invert().multiply(qH));
    ForwardKinematics(rest.bones, localQ, this.x.above, worlds, this.hips, hipsP);
    return far > (L1 + L2) * 0.9995;
  }

  /** 掌心放到 T（IK）后这只手还扎进身体多少：{ over（超出余量的最大值，米）, m（MeasureSide，带外推方向） }；T 改成实际够到的掌心。 */
  Overlap(q0, hipsP, worlds, s, T, localQ) {
    localQ.forEach((q, i) => q.copy(q0[i]));
    ForwardKinematics(this.x.rest.bones, localQ, this.x.above, worlds, this.hips, hipsP);
    this.SolveArm(localQ, hipsP, worlds, s, T);
    this.body.Update(worlds);
    const m = this.body.MeasureSide(worlds, s, true);
    const nh = m.hand.depth - this.o.handGoal, nf = m.fore.depth - this.o.foreGoal;
    T.copy(this.Palm(worlds, s));                         // 够不着的目标收回到伸直能到的那一点
    return { over: Math.max(nh, nf, 0), nh, nf, m };
  }

  /**
   * 推出：手掌指节 / 前臂仍扎进身体就把目标掌心沿表面外推，反复几遍；几段身体夹着推不出来时，
   * 按挪动从小到大（1–16 cm）往 18 个方向和往肩收试，取挪得最少就推干净的那个（都推不干净取扎得最浅的）。返回推过的目标。
   */
  PushOut(localQ, hipsP, worlds, s, palmT) {
    if (!this.o.swivel) return this.PushOutAt(localQ, hipsP, worlds, s, palmT, 0).T;
    // 带肘外转：先不转推一遍；推不干净（多半是前臂压着大腿 / 夹在两腿间）再试几个转角，取超标最少、其次挪得最少的
    let best = null;
    for (const deg of [0, 20, -20, 40, -40, 60, -60, 80, -80]) {
      const r = this.PushOutAt(localQ, hipsP, worlds, s, palmT, deg * Math.PI / 180);
      const key = r.over * 10 + r.T.distanceTo(palmT) + Math.abs(deg) * 0.0005;
      if (!best || key < best.key) best = { ...r, key, swivel: deg * Math.PI / 180 };
      if (deg === 0 && r.over <= 0.002) break;
    }
    this.lastSwivel = best.swivel;
    return best.T;
  }

  /** PushOut 的一个固定肘转角版本：返回 { T, over }。 */
  PushOutAt(localQ, hipsP, worlds, s, palmT, swivel) {
    const keep = this.swivel;
    this.swivel = swivel;
    const T = palmT.clone(), q0 = localQ.map(q => q.clone());
    let r = null;
    for (let it = 0; it < this.o.iterations; it++) {
      r = this.Overlap(q0, hipsP, worlds, s, T, localQ);
      if (r.over <= 0) break;
      if (r.nh >= r.nf) T.addScaledVector(r.m.hand.grad, r.nh * 1.1);
      else T.addScaledVector(r.m.fore.grad, r.nf * 1.1 / Math.max(0.5, r.m.fore.along));
    }
    r = this.Overlap(q0, hipsP, worlds, s, T, localQ);
    // 梯度推法在几段身体夹着时会绕远（或推不干净）：按挪动从小到大试 18 个方向和往肩收，挪得更少就推干净的换它
    const moved = T.distanceTo(palmT), clean = r.over <= 0.002;
    if (moved > 0.015 || !clean) {
      const dirs = SEARCH_DIRS.map(d => d.clone());
      if (r.m.hand.grad) dirs.push(r.m.hand.grad.clone());
      if (r.m.fore.grad) dirs.push(r.m.fore.grad.clone());
      ForwardKinematics(this.x.rest.bones, q0, this.x.above, worlds, this.hips, hipsP);
      dirs.push(new THREE.Vector3().setFromMatrixPosition(worlds[this.body.side[s].arm]).sub(palmT).normalize());   // 往肩收
      let best = { over: clean ? 0 : r.over, T: T.clone(), d: clean ? moved : Infinity };
      for (let d = 0.01; d <= Math.min(clean ? moved - 0.005 : 0.16, 0.16) + 1e-9; d += 0.01) {
        for (const dir of dirs) {
          const C = palmT.clone().addScaledVector(dir, d);
          const c = this.Overlap(q0, hipsP, worlds, s, C, localQ);
          const dd = C.distanceTo(palmT);
          if (c.over <= 0.002 ? best.over > 0.002 || dd < best.d : c.over + 0.1 * dd < best.over + 0.1 * best.d - 1e-4) best = { over: c.over, T: C.clone(), d: dd };
        }
        if (best.over <= 0.002) break;
      }
      T.copy(best.T);
    }
    const over = this.Overlap(q0, hipsP, worlds, s, T, localQ).over;
    localQ.forEach((q, i) => q.copy(q0[i]));
    this.swivel = keep;
    return { T, over };
  }

  /**
   * 整条动作：frames[f] = { localQ: Quaternion[]（X Bot 本地，改这里）, hips: Vector3, srcW?: Matrix4[]（原身体世界矩阵） }。
   * anchors: { Right, Left } = 0..1 或 (帧) => 0..1，按原身体掌心位置的权重（攥着别的东西的手）。
   * 返回每只手逐帧 { moved（米，掌心比换算结果挪了多少）, pushed（其中推出的）, alpha（贴身体的权重）, reach（够不着） }。
   */
  Run(frames, anchors = {}) {
    const n = frames.length, o = this.o, worlds = [], log = {};
    const FK = (f) => ForwardKinematics(this.x.rest.bones, frames[f].localQ, this.x.above, worlds, this.hips, frames[f].hips);
    const k = this.src ? 1 / this.src.scaleK : 1;
    for (const s of ["Right", "Left"]) {
      const base = [], mapped = [], alpha = [], src = [], reachT = [];
      const anchorOf = (f) => (typeof anchors[s] === "function" ? anchors[s](f) : (anchors[s] || 0));
      // 攥着东西的手：从换算结果往原手位置挪，挪到掌心碰到 X Bot 身体为止（两套身体比例不同，原手的位置可能在 X Bot 大腿里）
      for (let f = 0; f < n; f++) {
        FK(f);
        base.push(this.Palm(worlds, s));
        this.body.Update(worlds);
        const sp = this.src && frames[f].srcW ? this.SourcePalm(frames[f].srcW, s) : null;
        src.push(sp);
        let t = 0;
        if (sp && anchorOf(f) > 0) {
          const world = sp.P.clone().multiplyScalar(k);
          for (t = 1; t > 0; t -= 0.05) if (this.body.Deepest(base[f].clone().lerp(world, t), 0.035).depth <= 0) break;
          t = Math.max(0, t);
        }
        reachT.push(t);
      }
      const reachS = Erode(reachT, 4);
      const tSmooth = GaussianScalars(reachS, o.smoothFrames).map((t, f) => Math.min(t, reachS[f] + 0.15));
      for (let f = 0; f < n; f++) {
        const sp = src[f];
        if (!sp) { mapped.push(base[f].clone()); alpha.push(0); continue; }
        FK(f); this.body.Update(worlds);
        const a = anchorOf(f) * tSmooth[f];
        const T = base[f].clone().lerp(sp.P.clone().multiplyScalar(k), a);
        const contact = (1 - Smooth(o.contactNear, o.contactFar, sp.ds)) * (1 - a);
        mapped.push(this.KeepContact(T, sp.ds, k, contact, worlds, s)); alpha.push(contact);
      }
      // 推出：方向与大小分开平滑，推出来的轨迹才顺（逐帧各推各的会一帧一个方向，IK 跟着急拐）：
      //   1. 逐帧算推干净最少要往哪挪（从头推，取挪得最少的）；
      //   2. 方向前后平滑（按挪的多少加权）；
      //   3. 沿平滑后的方向逐帧找推干净要挪多远，取前后几帧里最大的再平滑（提前起、慢慢落），且不少于这一帧要的。
      const q0s = [], swivels = [];
      const OverAt = (f, T) => { this.swivel = swivelS[f]; const o2 = this.Overlap(q0s[f], frames[f].hips, worlds, s, T, frames[f].localQ).over; this.swivel = 0; return o2; };
      const raw = mapped.map((m, f) => {
        FK(f); q0s[f] = frames[f].localQ.map(q => q.clone());
        this.lastSwivel = 0;
        const v = this.PushOut(frames[f].localQ, frames[f].hips, worlds, s, m).sub(m);
        swivels.push(this.lastSwivel || 0);
        frames[f].localQ.forEach((q, i) => q.copy(q0s[f][i]));
        return v;
      });
      // 肘转角同样先取前后几帧里转得最多的再平滑（不一帧一跳）
      const swivelS = GaussianScalars(swivels.map((_, f) => { let b = swivels[f]; for (let i = Math.max(0, f - o.dilate); i <= Math.min(n - 1, f + o.dilate); i++) if (Math.abs(swivels[i]) > Math.abs(b)) b = swivels[i]; return b; }), o.smoothFrames);
      const dirs = GaussianVectors(raw, o.dirSmooth).map((v, f) => (v.lengthSq() > 1e-8 ? v.normalize() : raw[f].clone().normalize()));
      const need = raw.map((v, f) => {
        if (v.lengthSq() < 1e-8) return 0;
        let best = { m: v.length(), over: Infinity };
        for (let m = 0.005; m <= o.maxPush + 1e-9; m += 0.005) {
          const over = OverAt(f, mapped[f].clone().addScaledVector(dirs[f], m));
          if (over <= 0) { best = { m, over: 0 }; break; }
          if (over + 0.1 * m < best.over) best = { m, over: over + 0.1 * m };   // 推不干净时不为一点点少扎往远里推
        }
        frames[f].localQ.forEach((q, i) => q.copy(q0s[f][i]));
        return best.m;
      });
      const smoothNeed = GaussianScalars(Dilate(need, o.dilate), o.smoothFrames);
      const push = dirs.map((d, f) => d.clone().multiplyScalar(Math.max(need[f], smoothNeed[f])));
      const moved = [], pushed = [], reach = [];
      for (let f = 0; f < n; f++) {
        FK(f);
        const T = mapped[f].clone().add(push[f]);
        reach.push(this.SolveArm(frames[f].localQ, frames[f].hips, worlds, s, T, swivelS[f]));
        moved.push(T.distanceTo(base[f])); pushed.push(push[f].length());
      }
      log[s] = { moved, pushed, alpha, reach, swivelDeg: swivelS.map(a => +(a * 180 / Math.PI).toFixed(1)) };
    }
    return log;
  }

  /** 量一整条：每只手 { hand: {depth, frame, part, bone}, fore: {depth, frame, bone} }（同审查脚本）。 */
  Measure(frames) {
    const worlds = [], res = {};
    for (const s of ["Right", "Left"]) res[s] = { hand: { depth: -1 }, fore: { depth: -1 } };
    frames.forEach((fr, f) => {
      ForwardKinematics(this.x.rest.bones, fr.localQ, this.x.above, worlds, this.hips, fr.hips);
      this.body.Update(worlds);
      for (const s of ["Right", "Left"]) {
        const m = this.body.MeasureSide(worlds, s);
        if (m.hand.depth > res[s].hand.depth) res[s].hand = { depth: m.hand.depth, frame: f, part: m.hand.part, bone: m.hand.bone };
        if (m.fore.depth > res[s].fore.depth) res[s].fore = { depth: m.fore.depth, frame: f, bone: m.fore.bone };
      }
    });
    return res;
  }
}

/** 一串数取前后 r 帧里最大的。 */
export function Dilate(list, r) { return list.map((_, f) => Math.max(...list.slice(Math.max(0, f - r), f + r + 1))); }
/** 一串数取前后 r 帧里最小的。 */
export function Erode(list, r) { return list.map((_, f) => Math.min(...list.slice(Math.max(0, f - r), f + r + 1))); }
/** 一串数按高斯核（σ 帧）平滑。 */
export function GaussianScalars(list, sigma) {
  const r = Math.ceil(sigma * 2.5);
  return list.map((_, f) => { let a = 0, sum = 0; for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); a += list[Math.min(list.length - 1, Math.max(0, f + i))] * w; sum += w; } return a / sum; });
}

/** 一串向量按高斯核（σ 帧）平滑，两头按边缘值延伸。 */
export function GaussianVectors(list, sigma) {
  if (!(sigma > 0)) return list.map(v => v.clone());
  const r = Math.ceil(sigma * 2.5), w = [];
  for (let i = -r; i <= r; i++) w.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  return list.map((_, f) => {
    const out = new THREE.Vector3(); let sum = 0;
    for (let i = -r; i <= r; i++) { const j = Math.min(list.length - 1, Math.max(0, f + i)); out.addScaledVector(list[j], w[i + r]); sum += w[i + r]; }
    return out.multiplyScalar(1 / sum);
  });
}
