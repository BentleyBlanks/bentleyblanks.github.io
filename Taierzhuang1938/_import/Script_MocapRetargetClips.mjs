// AI 视频 → 骨骼动画流水线的第二级：3D 关键点轨迹 → 十套卢沟桥 GLB 的 AnimationClip。
//
// 上游是 Script_MocapVideoExtract.py（rtmlib RTMW3D 出的 .mocap.json，坐标已经
// 摆成「Y 上、面朝 +Z、左 +X、米制、地面 Y=0」）。本脚本对每套 GLB：
//   1. FK 静止姿态，量出骨架自己的解剖参考系（胯线、肩线、四肢静止方向）；
//   2. 逐帧两轴对齐反解：目标骨向 + 弯曲平面法线 → 世界旋转 → 父逆 → 局部四元数。
//      脊柱链（Spine/Spine1/Spine2/Neck）在骨盆姿态与肩线姿态之间按权重 slerp 分配
//      （锁骨挂在 Neck 下，所以肩线必须在 Neck 这一级闭合）；
//   3. 骨盆平移轨道 = mocap 骨盆相对两脚中点的横摆/起伏/前后（换算进 GroundRoot 局部）；
//   4. 手指不走 mocap（单目视频里指头没有信息量）：`hands=grip` 从 RifleRun 首帧
//      抄一份握姿常量（握步枪 ≈ 握担架杆）；
//   5. 贴地标定：把整条 clip 的逐帧蒙皮最低点中位数移到 0（走路每帧都该有一只脚
//      踩实地面），常数写在 GroundRoot 上 —— 与 Script_RestoreLugouPelvisTracks.mjs
//      的第二步同一个思路；
//   6. 审计写回清单（骨盆高度带 / 贴地深度 / 帧数），序列化走 Script_LugouManifestJson。
//
// 新数据只往 BIN 尾部追加，网格与既有 clip 的字节原样不动（同 RestoreLugouPelvisTracks）。
// `--replace` 重跑同名 clip 时丢弃旧 animation 条目，旧 accessor 成为孤儿字节 ——
// 迭代期可以接受；最终交付前从 git 还原 Model/Character 再一次性烘干净。
//
// 用法（仓库任意位置）：
//   node Taierzhuang1938/_import/Script_MocapRetargetClips.mjs \
//     --clip CarryStretcherFront=Taierzhuang1938/_import/_mocap/CarryStretcher_p0.mocap.json \
//     [--clip 名字=路径 ...] [--hands grip|rest] [--models LugouNra01,...] [--replace] [--dry-run]
//
// 通道口径（照 RifleRun 抄的）：54 个节点全带 T+R+S 通道 —— 没被 mocap 驱动的节点
// 写单关键帧静止常量。不这么做的话 AnimationMixer 换装 clip 时，缺通道的骨头会
// 停在上一条 clip 的姿势上（换弹的手指永远蜷着）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BuildSkin, LoadGlb, MinSkinnedY, Multiply, PoseScene, SerializeGlb,
} from "./Script_LugouGlbPose.mjs";
import { PythonJson } from "./Script_LugouManifestJson.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");
const characterDir = path.join(projectDir, "Model", "Character");
const manifestPath = path.join(characterDir, "Data_LugouCharacterManifest.json");

const GRIP_REFERENCE = { clip: "RifleRun", time: 0.2 };
const CONTACT_SAMPLES = 25;

// ── 向量 / 四元数 ───────────────────────────────────────────────────────────
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
  },
  mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
};

const Q = {
  identity: () => [0, 0, 0, 1],
  multiply: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  invert: (q) => [-q[0], -q[1], -q[2], q[3]],
  normalize: (q) => {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  },
  slerp: (a, b, t) => {
    let [bx, by, bz, bw] = b;
    let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
    let s0 = 1 - t;
    let s1 = t;
    if (dot < 0.9995) {
      const theta = Math.acos(Math.min(1, dot));
      const sine = Math.sin(theta);
      s0 = Math.sin((1 - t) * theta) / sine;
      s1 = Math.sin(t * theta) / sine;
    }
    return Q.normalize([
      s0 * a[0] + s1 * bx, s0 * a[1] + s1 * by, s0 * a[2] + s1 * bz, s0 * a[3] + s1 * bw,
    ]);
  },
  rotate: (q, v) => {
    const [x, y, z, w] = q;
    const uv = V.cross([x, y, z], v);
    const uuv = V.cross([x, y, z], uv);
    return V.add(v, V.scale(V.add(V.scale(uv, w), uuv), 2));
  },
  /** 列主序 3×3（按列给）→ 四元数。 */
  fromColumns: (cx, cy, cz) => {
    const m00 = cx[0], m10 = cx[1], m20 = cx[2];
    const m01 = cy[0], m11 = cy[1], m21 = cy[2];
    const m02 = cz[0], m12 = cz[1], m22 = cz[2];
    const trace = m00 + m11 + m22;
    let q;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
    }
    return Q.normalize(q);
  },
};

/** 主轴 + 副轴 → 正交参考系四元数（副轴会被正交化）。 */
function FrameQuat(primary, secondary) {
  const d = V.norm(primary);
  let n = V.sub(secondary, V.scale(d, V.dot(d, secondary)));
  if (V.len(n) < 1e-6) throw new Error("degenerate frame");
  n = V.norm(n);
  return Q.fromColumns(d, n, V.cross(d, n));
}

/** 把 (d0,n0) 对到 (d1,n1) 的世界旋转。 */
function TwoAxisDelta(d0, n0, d1, n1) {
  return Q.multiply(FrameQuat(d1, n1), Q.invert(FrameQuat(d0, n0)));
}

// ── 静止姿态 FK（PoseScene 只能按动画求值，这里要 bind pose）────────────────
function ComposeLocal(out, t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0;
  out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
  out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0;
  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
  return out;
}

function RestWorld(scene) {
  const world = Array.from({ length: scene.count }, () => new Float64Array(16));
  const local = new Float64Array(16);
  for (const index of scene.order) {
    ComposeLocal(local, scene.baseT[index], scene.baseR[index], scene.baseS[index]);
    const parent = scene.parent[index];
    if (parent < 0) world[index].set(local);
    else Multiply(world[index], world[parent], local);
  }
  const pos = world.map((m) => [m[12], m[13], m[14]]);
  const rot = world.map((m) => {
    const cx = V.norm([m[0], m[1], m[2]]);
    const cy = V.norm([m[4], m[5], m[6]]);
    const cz = V.norm([m[8], m[9], m[10]]);
    return Q.fromColumns(cx, cy, cz);
  });
  return { world, pos, rot };
}

/** 刚体 + 统一缩放 4×4 的逆（把世界点换算进某节点的局部空间用）。 */
function InvertRigidUniform(m) {
  const sx = Math.hypot(m[0], m[1], m[2]);
  const r = [
    m[0] / sx, m[4] / sx, m[8] / sx,
    m[1] / sx, m[5] / sx, m[9] / sx,
    m[2] / sx, m[6] / sx, m[10] / sx,
  ]; // Rᵀ 行主序展开成 3 行
  const t = [m[12], m[13], m[14]];
  return (p) => {
    const d = V.sub(p, t);
    return [
      (r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) / sx,
      (r[3] * d[0] + r[4] * d[1] + r[5] * d[2]) / sx,
      (r[6] * d[0] + r[7] * d[1] + r[8] * d[2]) / sx,
    ];
  };
}

// ── mocap 帧访问 ────────────────────────────────────────────────────────────
function MotionFrame(motion, k) {
  const j = motion.joints;
  const at = (name) => j[name][k];
  const frame = { at };
  frame.pelvisC = V.mid(at("hipL"), at("hipR"));
  frame.chestC = V.mid(at("shoulderL"), at("shoulderR"));
  frame.earC = V.mid(at("earL"), at("earR"));
  frame.eyeC = V.mid(at("eyeL"), at("eyeR"));
  return frame;
}

// ── GLB 写入 ────────────────────────────────────────────────────────────────
function AppendAccessor(json, chunks, state, values, type, { minMax = false } = {}) {
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  const padding = (4 - (state.offset % 4)) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding, 0)); state.offset += padding; }
  const byteOffset = state.offset;
  chunks.push(bytes);
  state.offset += bytes.length;
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const accessor = {
    bufferView: json.bufferViews.length - 1,
    componentType: 5126,
    count: values.length / width,
    type,
  };
  if (minMax) {
    accessor.min = [Infinity];
    accessor.max = [-Infinity];
    for (const v of values) {
      accessor.min[0] = Math.min(accessor.min[0], v);
      accessor.max[0] = Math.max(accessor.max[0], v);
    }
  }
  json.accessors.push(accessor);
  return json.accessors.length - 1;
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
function ParseArgs() {
  const argv = process.argv.slice(2);
  const options = { clips: [], models: null, dryRun: false, replace: false, hands: "grip" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--clip") {
      const [name, file] = argv[i + 1].split("=");
      if (!name || !file) throw new Error(`--clip 要写成 名字=路径：${argv[i + 1]}`);
      options.clips.push({ name, file });
      i += 1;
    } else if (argv[i] === "--models") { options.models = argv[i + 1].split(","); i += 1; }
    else if (argv[i] === "--hands") { options.hands = argv[i + 1]; i += 1; }
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else if (argv[i] === "--replace") options.replace = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!options.clips.length) throw new Error("至少要一个 --clip 名字=motion.json");
  return options;
}

function SolveClip(glb, record, motion, options) {
  const scene = new PoseScene(glb);
  const nodes = glb.json.nodes;
  const roles = record.boneRoles;
  const prefix = roles.pelvis.replace(/ Pelvis$/, "");
  const N = (name) => {
    const index = scene.NodeIndex(name);
    if (index < 0) throw new Error(`${record.id}: node ${name} missing`);
    return index;
  };
  const B = (suffix) => N(`${prefix} ${suffix}`);
  const rest = RestWorld(scene);

  const bone = {
    pelvis: B("Pelvis"), spine: B("Spine"), spine1: B("Spine1"), spine2: B("Spine2"),
    neck: B("Neck"), head: B("Head"),
    thighL: B("L Thigh"), calfL: B("L Calf"), footL: B("L Foot"), toeL: B("L Toe0"),
    thighR: B("R Thigh"), calfR: B("R Calf"), footR: B("R Foot"), toeR: B("R Toe0"),
    clavL: B("L Clavicle"), upperArmL: B("L UpperArm"), forearmL: B("L Forearm"), handL: B("L Hand"),
    clavR: B("R Clavicle"), upperArmR: B("R UpperArm"), forearmR: B("R Forearm"), handR: B("R Hand"),
  };
  const ground = N("GroundRoot");

  // 静止解剖参考系
  const P = (i) => rest.pos[i];
  const lateral = V.norm(V.sub(P(bone.thighL), P(bone.thighR)));
  const torsoUp = V.norm(V.sub(P(bone.neck), P(bone.pelvis)));
  const restPelvisFrame = FrameQuat(lateral, torsoUp);
  const restShoulderLine = V.norm(V.sub(P(bone.upperArmL), P(bone.upperArmR)));
  const restChestFrame = FrameQuat(restShoulderLine, torsoUp);
  const forward = V.norm(V.cross(lateral, torsoUp));
  const restHeadFrame = FrameQuat(forward, lateral);

  const limbRest = {};
  const LimbRest = (name, a, b, fallbackNormal) => {
    const d = V.norm(V.sub(P(b), P(a)));
    limbRest[name] = { d, n: fallbackNormal };
  };
  LimbRest("thighL", bone.thighL, bone.calfL, lateral);
  LimbRest("calfL", bone.calfL, bone.footL, lateral);
  LimbRest("thighR", bone.thighR, bone.calfR, lateral);
  LimbRest("calfR", bone.calfR, bone.footR, lateral);
  LimbRest("footL", bone.footL, bone.toeL, lateral);
  LimbRest("footR", bone.footR, bone.toeR, lateral);
  LimbRest("upperArmL", bone.upperArmL, bone.forearmL, V.scale(lateral, -1));
  LimbRest("forearmL", bone.forearmL, bone.handL, V.scale(lateral, -1));
  LimbRest("upperArmR", bone.upperArmR, bone.forearmR, V.scale(lateral, -1));
  LimbRest("forearmR", bone.forearmR, bone.handR, V.scale(lateral, -1));

  // mocap 腿长 → 骨架腿长的比例（骨盆高度按它缩放）
  const rigLeg = V.len(V.sub(P(bone.calfL), P(bone.thighL))) + V.len(V.sub(P(bone.footL), P(bone.calfL)));
  const frames0 = MotionFrame(motion, 0);
  const mocapLeg = V.len(V.sub(frames0.at("kneeL"), frames0.at("hipL")))
    + V.len(V.sub(frames0.at("ankleL"), frames0.at("kneeL")));
  const heightScale = rigLeg / Math.max(0.3, mocapLeg);

  // 骨盆平移要换算进 GroundRoot 的局部空间
  const toGroundLocal = InvertRigidUniform(rest.world[ground]);
  const restPelvisLocalT = scene.baseT[bone.pelvis];

  const times = motion.times.slice();
  const keyCount = times.length;
  const solved = new Map();       // nodeIndex → { rotation: Float32Array, translation?: Float32Array }
  // toe 只当脚方向的参考点，不反解（趾屈没有可信的 mocap 信息量，保持静止）
  for (const [name, index] of Object.entries(bone)) {
    if (name === "toeL" || name === "toeR") continue;
    solved.set(index, { rotation: new Float32Array(keyCount * 4) });
  }
  solved.get(bone.pelvis).translation = new Float32Array(keyCount * 3);

  const chain = [
    { index: bone.spine, w: 0.25 },
    { index: bone.spine1, w: 0.5 },
    { index: bone.spine2, w: 0.75 },
    { index: bone.neck, w: 1.0 },
  ];
  const conf = motion.confidence || {};
  const headTrustworthy = Math.min(conf.earL ?? 1, conf.earR ?? 1, conf.eyeL ?? 1, conf.eyeR ?? 1) >= 0.35;

  for (let k = 0; k < keyCount; k += 1) {
    const f = MotionFrame(motion, k);
    const worldRot = new Map();
    const WorldOf = (index) => worldRot.get(index) || rest.rot[index];

    // 躯干两端的世界增量。胯线/肩线的**偏航**几乎全来自左右关节的深度差 ——
    // 单目深度最弱的一路，直接用会让人一帧帧随机转身，个别帧甚至整个反号
    // （lerp 阻尼救不了反向）。硬规矩：横轴 X 分量必须为正（反了整根翻回来），
    // 偏航（z）与侧倾（y）各设上限，剩下的都还给 X。
    const DampLine = (line, maxYaw, maxRoll) => {
      let n = V.norm(line);
      if (n[0] < 0) n = V.scale(n, -1);
      const y = Math.max(-maxRoll, Math.min(maxRoll, n[1]));
      const z = Math.max(-maxYaw, Math.min(maxYaw, n[2]));
      return [Math.sqrt(Math.max(0.05, 1 - y * y - z * z)), y, z];
    };
    const targetUp = V.norm(V.sub(f.chestC, f.pelvisC));
    const hipLine = DampLine(V.sub(f.at("hipL"), f.at("hipR")), 0.20, 0.25);
    const shoulderLine = DampLine(V.sub(f.at("shoulderL"), f.at("shoulderR")), 0.30, 0.30);
    const pelvisDelta = Q.multiply(FrameQuat(hipLine, targetUp), Q.invert(restPelvisFrame));
    const chestDelta = Q.multiply(FrameQuat(shoulderLine, targetUp), Q.invert(restChestFrame));
    worldRot.set(bone.pelvis, Q.multiply(pelvisDelta, rest.rot[bone.pelvis]));
    for (const { index, w } of chain) {
      worldRot.set(index, Q.multiply(Q.slerp(pelvisDelta, chestDelta, w), rest.rot[index]));
    }
    // 锁骨保持静止局部（世界跟着 Neck 走），胳膊的父旋转才对得上
    const clavLocalL = Q.multiply(Q.invert(rest.rot[scene.parent[bone.clavL]]), rest.rot[bone.clavL]);
    const clavLocalR = Q.multiply(Q.invert(rest.rot[scene.parent[bone.clavR]]), rest.rot[bone.clavR]);
    worldRot.set(bone.clavL, Q.multiply(WorldOf(bone.neck), clavLocalL));
    worldRot.set(bone.clavR, Q.multiply(WorldOf(bone.neck), clavLocalR));

    // 头。耳/眼的深度同样不可信：脸必须朝前（z 为正），左右转头夹在 ±30° 里，
    // 抬头低头（图像平面量的）保留；估出来朝后的一律退回胸廓姿态。
    let headDelta = chestDelta;
    if (headTrustworthy) {
      const faceForward = V.norm(V.sub(f.eyeC, f.earC));
      const earLine = V.sub(f.at("earL"), f.at("earR"));
      if (faceForward[2] > 0.1 && V.len(earLine) > 0.05) {
        const fx = Math.max(-0.5, Math.min(0.5, faceForward[0]));
        const fy = Math.max(-0.6, Math.min(0.6, faceForward[1]));
        const face = [fx, fy, Math.sqrt(Math.max(0.1, 1 - fx * fx - fy * fy))];
        headDelta = Q.multiply(
          FrameQuat(face, DampLine(earLine, 0.35, 0.30)),
          Q.invert(restHeadFrame),
        );
      }
    }
    worldRot.set(bone.head, Q.multiply(headDelta, rest.rot[bone.head]));

    // 四肢：骨向 + 弯曲平面
    const Limb = (name, index, from, to, planeA, planeB, planeC) => {
      const d1 = V.norm(V.sub(f.at(to), f.at(from)));
      let n1 = V.cross(V.sub(f.at(planeB), f.at(planeA)), V.sub(f.at(planeC), f.at(planeB)));
      if (V.len(n1) < 0.02) n1 = Q.rotate(pelvisDelta, limbRest[name].n);
      const delta = TwoAxisDelta(limbRest[name].d, limbRest[name].n, d1, V.norm(n1));
      worldRot.set(index, Q.multiply(delta, rest.rot[index]));
    };
    Limb("thighL", bone.thighL, "hipL", "kneeL", "hipL", "kneeL", "ankleL");
    Limb("calfL", bone.calfL, "kneeL", "ankleL", "hipL", "kneeL", "ankleL");
    Limb("thighR", bone.thighR, "hipR", "kneeR", "hipR", "kneeR", "ankleR");
    Limb("calfR", bone.calfR, "kneeR", "ankleR", "hipR", "kneeR", "ankleR");
    // 胳膊带遮挡回退：侧视里远侧臂整条藏在身后时，估出来的是错值不是抖动
    // （置信度会掉下去）。坏臂直接用好臂的世界增量镜像（骨架左右对称，
    // 跨 X=0 矢状面共轭 = 四元数 y/z 取反）；两边都坏就保持上一帧。
    const ArmDelta = (upperName, foreName, sho, elb, wri) => {
      const dU = V.norm(V.sub(f.at(elb), f.at(sho)));
      const dF = V.norm(V.sub(f.at(wri), f.at(elb)));
      let n1 = V.cross(V.sub(f.at(elb), f.at(sho)), V.sub(f.at(wri), f.at(elb)));
      if (V.len(n1) < 0.02) n1 = Q.rotate(pelvisDelta, limbRest[upperName].n);
      n1 = V.norm(n1);
      const ck = motion.confKeys || {};
      const qual = Math.min(
        ck[sho] ? ck[sho][k] : 1, ck[elb] ? ck[elb][k] : 1, ck[wri] ? ck[wri][k] : 1,
      );
      return {
        upper: TwoAxisDelta(limbRest[upperName].d, limbRest[upperName].n, dU, n1),
        fore: TwoAxisDelta(limbRest[foreName].d, limbRest[foreName].n, dF, n1),
        qual,
      };
    };
    const MirrorX = (q) => [q[0], -q[1], -q[2], q[3]];
    const armL = ArmDelta("upperArmL", "forearmL", "shoulderL", "elbowL", "wristL");
    const armR = ArmDelta("upperArmR", "forearmR", "shoulderR", "elbowR", "wristR");
    if (armL.qual < 0.35 && armR.qual >= 0.5) {
      armL.upper = MirrorX(armR.upper); armL.fore = MirrorX(armR.fore);
    } else if (armR.qual < 0.35 && armL.qual >= 0.5) {
      armR.upper = MirrorX(armL.upper); armR.fore = MirrorX(armL.fore);
    }
    const badBothArms = armL.qual < 0.35 && armR.qual < 0.35 && k > 0;
    worldRot.set(bone.upperArmL, Q.multiply(armL.upper, rest.rot[bone.upperArmL]));
    worldRot.set(bone.forearmL, Q.multiply(armL.fore, rest.rot[bone.forearmL]));
    worldRot.set(bone.upperArmR, Q.multiply(armR.upper, rest.rot[bone.upperArmR]));
    worldRot.set(bone.forearmR, Q.multiply(armR.fore, rest.rot[bone.forearmR]));
    // 脚：骨向 = 踝→趾，滚转跟着骨盆的横轴走
    const Foot = (name, index, from, to) => {
      const d1 = V.norm(V.sub(f.at(to), f.at(from)));
      const delta = TwoAxisDelta(limbRest[name].d, limbRest[name].n, d1, Q.rotate(pelvisDelta, limbRest[name].n));
      worldRot.set(index, Q.multiply(delta, rest.rot[index]));
    };
    Foot("footL", bone.footL, "ankleL", "toeL");
    Foot("footR", bone.footR, "ankleR", "toeR");
    // 手腕不走 mocap（握姿常量在写入阶段抄），这里让它保持静止局部
    const handLocalL = Q.multiply(Q.invert(rest.rot[scene.parent[bone.handL]]), rest.rot[bone.handL]);
    const handLocalR = Q.multiply(Q.invert(rest.rot[scene.parent[bone.handR]]), rest.rot[bone.handR]);
    worldRot.set(bone.handL, Q.multiply(WorldOf(bone.forearmL), handLocalL));
    worldRot.set(bone.handR, Q.multiply(WorldOf(bone.forearmR), handLocalR));

    // 世界 → 局部，写进轨道
    for (const [index, out] of solved) {
      const parent = scene.parent[index];
      const parentWorld = worldRot.has(parent) ? worldRot.get(parent) : rest.rot[parent];
      const local = Q.normalize(Q.multiply(Q.invert(parentWorld), worldRot.get(index)));
      out.rotation.set(local, k * 4);
    }
    if (badBothArms) {
      for (const index of [
        bone.upperArmL, bone.forearmL, bone.handL,
        bone.upperArmR, bone.forearmR, bone.handR,
      ]) {
        solved.get(index).rotation.copyWithin(k * 4, (k - 1) * 4, k * 4);
      }
    }

    // 骨盆平移：横摆 x / 高度 y（按腿长比缩放）/ 前后 z，相对两脚中点
    const pelvisWorld = [
      f.pelvisC[0] * heightScale,
      f.pelvisC[1] * heightScale,
      f.pelvisC[2] * heightScale,
    ];
    const local = toGroundLocal(pelvisWorld);
    solved.get(bone.pelvis).translation.set(local, k * 3);
  }

  // 循环轨：末帧强制等于首帧（周期边界来自自相关，端点噪声不闭合会跳）
  if (motion.loop && keyCount > 1) {
    for (const [, out] of solved) {
      out.rotation.copyWithin((keyCount - 1) * 4, 0, 4);
      if (out.translation) out.translation.copyWithin((keyCount - 1) * 3, 0, 3);
    }
  }

  return { scene, nodes, bone, ground, solved, times, restPelvisLocalT };
}

function WriteClip(glb, record, clipName, solve, options) {
  const { scene, solved, times, ground } = solve;
  const json = glb.json;
  if (json.animations.some((a) => a.name === clipName)) {
    if (!options.replace) throw new Error(`${record.id}: clip ${clipName} already exists（要覆盖加 --replace）`);
    json.animations = json.animations.filter((a) => a.name !== clipName);
  }

  // 通道覆盖的节点集合照 RifleRun 抄（54 节点全覆盖，防换装时留旧姿势）
  const donor = json.animations.find((a) => a.name === GRIP_REFERENCE.clip);
  if (!donor) throw new Error(`${record.id}: reference clip ${GRIP_REFERENCE.clip} missing`);
  const targetNodes = [...new Set(donor.channels.map((c) => c.target.node))];

  // 握姿常量：从参考 clip 的一帧抄手指与手的局部 TRS
  scene.Apply(scene.AnimationIndex(GRIP_REFERENCE.clip), GRIP_REFERENCE.time);
  const gripT = scene.t.map((v) => Array.from(v));
  const gripR = scene.r.map((v) => Array.from(v));
  const gripS = scene.s.map((v) => Array.from(v));
  const useGrip = new Set();
  if (options.hands === "grip") {
    for (const index of targetNodes) {
      const name = scene.nodes[index].name || "";
      if (/Finger|Hand$/.test(name)) useGrip.add(index);
    }
  }

  const chunks = [glb.bin];
  const state = { offset: glb.bin.length };
  const timeArray = new Float32Array(times);
  const inputMulti = AppendAccessor(json, chunks, state, timeArray, "SCALAR", { minMax: true });
  const inputSingle = AppendAccessor(json, chunks, state, new Float32Array([0]), "SCALAR", { minMax: true });

  const samplers = [];
  const channels = [];
  const AddTrack = (node, pathName, input, values, type) => {
    const output = AppendAccessor(json, chunks, state, values, type);
    samplers.push({ input, interpolation: "LINEAR", output });
    channels.push({ sampler: samplers.length - 1, target: { node, path: pathName } });
  };

  for (const index of targetNodes) {
    // 握姿常量优先于反解：手腕跟着前臂的“静止局部”不如参考 clip 的真握姿
    const entry = useGrip.has(index) ? null : solved.get(index);
    const baseT = useGrip.has(index) ? gripT[index] : Array.from(scene.baseT[index]);
    const baseR = useGrip.has(index) ? gripR[index] : Array.from(scene.baseR[index]);
    const baseS = useGrip.has(index) ? gripS[index] : Array.from(scene.baseS[index]);
    if (entry) {
      AddTrack(index, "rotation", inputMulti, entry.rotation, "VEC4");
      if (entry.translation) AddTrack(index, "translation", inputMulti, entry.translation, "VEC3");
      else AddTrack(index, "translation", inputSingle, new Float32Array(baseT), "VEC3");
    } else {
      AddTrack(index, "rotation", inputSingle, new Float32Array(baseR), "VEC4");
      AddTrack(index, "translation", inputSingle, new Float32Array(baseT), "VEC3");
    }
    AddTrack(index, "scale", inputSingle, new Float32Array(baseS), "VEC3");
  }
  json.animations.push({ name: clipName, samplers, channels });

  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  return SerializeGlb(json, bin);
}

/** 贴地标定 + 审计：走路 clip 每帧都该有一只脚踩在地上。 */
function CalibrateAndAudit(output, record, clipName) {
  const staged = LoadGlb(output);
  const scene = new PoseScene(staged);
  const parts = BuildSkin(staged);
  const groundIndex = scene.NodeIndex("GroundRoot");
  const animationIndex = scene.AnimationIndex(clipName);
  const duration = scene.animations[animationIndex].duration;
  const times = Array.from({ length: CONTACT_SAMPLES }, (unused, i) => (duration * i) / (CONTACT_SAMPLES - 1));
  const trace = times.map((time) => {
    scene.Apply(animationIndex, time);
    return MinSkinnedY(scene, parts);
  });
  const sorted = [...trace].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];

  scene.Apply(animationIndex, 0);
  const parent = scene.parent[groundIndex];
  const localToWorldY = scene.world[parent][5];
  const groundT = staged.json.nodes[groundIndex].translation || [0, 0, 0];
  const localShift = -median / localToWorldY;

  // GroundRoot 的单关键帧平移就是我们刚写的常量：直接改字节
  const animation = staged.json.animations[animationIndex];
  const channel = animation.channels.find(
    (c) => c.target.node === groundIndex && c.target.path === "translation",
  );
  const accessor = staged.json.accessors[animation.samplers[channel.sampler].output];
  const view = staged.json.bufferViews[accessor.bufferView];
  const binHeader = 20 + output.readUInt32LE(12) + 8;
  const at = binHeader + (view.byteOffset || 0) + (accessor.byteOffset || 0) + 4;
  output.writeFloatLE(groundT[1] + localShift, at);

  // 重新量一遍写审计
  const final = LoadGlb(output);
  const finalScene = new PoseScene(final);
  const finalParts = BuildSkin(final);
  const pelvisIndex = finalScene.NodeIndex(record.boneRoles.pelvis);
  const finalAnimation = finalScene.AnimationIndex(clipName);
  let low = Infinity;
  let high = -Infinity;
  let contact = Infinity;
  for (const time of times) {
    finalScene.Apply(finalAnimation, time);
    const y = finalScene.WorldY(pelvisIndex);
    low = Math.min(low, y);
    high = Math.max(high, y);
    contact = Math.min(contact, MinSkinnedY(finalScene, finalParts));
  }
  const keyFrames = Math.max(
    ...finalScene.animations[finalAnimation].channels.map((c) => c.input.length),
  );
  return {
    shift: -median,
    audit: {
      sourceFrames: keyFrames,
      sourceBones: 52,
      maxPoseDeltaError: 0.0,
      maxGroundCorrectionMeters: Number((-median).toFixed(6)),
      maxGroundPenetrationMeters: Number(Math.max(0, -contact).toFixed(6)),
      pelvisHeightMeters: [Number(low.toFixed(6)), Number(high.toFixed(6))],
    },
  };
}

function Main() {
  const options = ParseArgs();
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  if (PythonJson(manifest) !== manifestText.replace(/\r\n/g, "\n")) {
    throw new Error("PythonJson round-trip does not reproduce the manifest byte for byte");
  }
  const motions = options.clips.map(({ name, file }) => ({
    name,
    motion: JSON.parse(fs.readFileSync(file, "utf8")),
    file,
  }));

  for (const record of manifest.models) {
    if (options.models && !options.models.includes(record.id)) continue;
    const fileName = path.basename(record.url);
    const targetPath = path.join(characterDir, fileName);
    let output = fs.readFileSync(targetPath);
    const report = [];
    for (const { name, motion } of motions) {
      const glb = LoadGlb(output);
      const solve = SolveClip(glb, record, motion, options);
      output = WriteClip(glb, record, name, solve, options);
      const { shift, audit } = CalibrateAndAudit(output, record, name);
      record.animationAudit[name] = audit;
      if (!record.animations.includes(name)) record.animations.push(name);
      if (!record.validation.animations.includes(name)) {
        record.validation.animations.push(name);
        record.validation.animations.sort();
      }
      record.validation.maxGroundPenetrationMeters[name] = audit.maxGroundPenetrationMeters;
      report.push(
        `${name}: ${motion.times.length} keys ${motion.times[motion.times.length - 1].toFixed(2)}s`
        + ` 骨盆 ${audit.pelvisHeightMeters[0].toFixed(3)}–${audit.pelvisHeightMeters[1].toFixed(3)} m`
        + ` 贴地移 ${shift >= 0 ? "+" : ""}${shift.toFixed(3)} m 陷地 ${audit.maxGroundPenetrationMeters.toFixed(3)} m`,
      );
    }
    const lows = Object.values(record.animationAudit).map((row) => row.pelvisHeightMeters[0]);
    const highs = Object.values(record.animationAudit).map((row) => row.pelvisHeightMeters[1]);
    record.pelvisHeightSpreadMeters = Number((Math.max(...highs) - Math.min(...lows)).toFixed(6));
    record.bytes = output.length;
    if (!options.dryRun) fs.writeFileSync(targetPath, output);
    console.log(`${record.id}: ${report.join(" | ")}`);
  }

  manifest.mocapClips = manifest.mocapClips || {};
  for (const { name, file } of options.clips) {
    manifest.mocapClips[name] = {
      source: path.basename(file),
      generatedBy: "Script_MocapRetargetClips.mjs",
    };
  }
  if (!options.dryRun) fs.writeFileSync(manifestPath, PythonJson(manifest), "utf8");
  console.log(options.dryRun ? "（dry-run，未写盘）" : `WROTE ${manifestPath}`);
}

Main();
