// 直接读 GLB 量姿态：解析 glTF、走一遍 FK、必要时按蒙皮权重算最低顶点。
//
// 【为什么要有这个】卢沟桥十套角色的贴地/姿态审计原来只信清单里那几个数，
// 而那些数是**同一次烘焙自己写的**。2026-08-29 的事故就是这么漏过去的：
// 重烘把骨盆位移轨道烘丢了，十六条 clip 的人全钉在站立高度飘在空中，
// 于是「有没有陷进地里」这条审计**轻松通过**——它量的不是姿势对不对。
// 从此姿态审计一律拿资产本身量（Script_CharacterModelTest 直接调这里），
// 不许再拿烘焙脚本自报的数当证据。
//
// 只依赖 Node 标准库；矩阵按 glTF 的列主序（column-major）存。

import fs from "node:fs";

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** 拆开 GLB 的两个 chunk；`bin` 是指向原 Buffer 的视图，不复制。 */
export function LoadGlb(source) {
  const buffer = Buffer.isBuffer(source) ? source : fs.readFileSync(source);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const kind = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === JSON_CHUNK) json = JSON.parse(body.toString("utf8").replace(/\0+$/, ""));
    else if (kind === BIN_CHUNK) bin = body;
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { buffer, json, bin };
}

/** 重新拼一份 GLB；JSON 用空格补到 4 字节对齐，BIN 用 0 补。 */
export function SerializeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonPadded.length, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonPadded.copy(out, 20);
  const binHeader = 20 + jsonPadded.length;
  out.writeUInt32LE(binPadded.length, binHeader);
  out.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  binPadded.copy(out, binHeader + 8);
  return out;
}

function ReadTyped(glb, index, Target) {
  const accessor = glb.json.accessors[index];
  const width = COMPONENT_COUNT[accessor.type];
  const out = new Target(accessor.count * width);
  if (accessor.bufferView === undefined) return { data: out, count: accessor.count, width };
  const Component = COMPONENT[accessor.componentType];
  const view = glb.json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || Component.BYTES_PER_ELEMENT * width;
  for (let i = 0; i < accessor.count; i += 1) {
    const at = glb.bin.byteOffset + base + i * stride;
    for (let c = 0; c < width; c += 1) {
      out[i * width + c] = new Component(glb.bin.buffer, at + c * Component.BYTES_PER_ELEMENT, 1)[0];
    }
  }
  return { data: out, count: accessor.count, width };
}

export function ReadAccessor(glb, index) {
  return ReadTyped(glb, index, Float32Array);
}

export function ReadAccessorInt(glb, index) {
  return ReadTyped(glb, index, Uint32Array);
}

function Identity() {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function Compose(out, t, r, s) {
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

export function Multiply(out, a, b) {
  for (let column = 0; column < 4; column += 1) {
    const b0 = b[column * 4], b1 = b[column * 4 + 1], b2 = b[column * 4 + 2], b3 = b[column * 4 + 3];
    out[column * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[column * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[column * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[column * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/** 一份可按时间求值的 glTF 场景：节点 TRS、动画采样、世界矩阵。 */
export class PoseScene {
  constructor(glb) {
    this.glb = glb;
    const nodes = glb.json.nodes || [];
    this.nodes = nodes;
    this.count = nodes.length;
    this.parent = new Int32Array(this.count).fill(-1);
    nodes.forEach((node, index) => (node.children || []).forEach((child) => { this.parent[child] = index; }));
    this.order = [];
    const scene = glb.json.scenes[glb.json.scene || 0];
    const stack = (scene.nodes || []).slice().reverse();
    while (stack.length) {
      const index = stack.pop();
      this.order.push(index);
      const children = nodes[index].children || [];
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    this.baseT = nodes.map((node) => Float64Array.from(node.translation || [0, 0, 0]));
    this.baseR = nodes.map((node) => Float64Array.from(node.rotation || [0, 0, 0, 1]));
    this.baseS = nodes.map((node) => Float64Array.from(node.scale || [1, 1, 1]));
    if (nodes.some((node) => node.matrix)) throw new Error("node.matrix form is not supported");
    this.t = this.baseT.map((v) => Float64Array.from(v));
    this.r = this.baseR.map((v) => Float64Array.from(v));
    this.s = this.baseS.map((v) => Float64Array.from(v));
    this.local = Array.from({ length: this.count }, Identity);
    this.world = Array.from({ length: this.count }, Identity);
    this.animations = (glb.json.animations || []).map((animation) => {
      const channels = animation.channels.map((channel) => {
        const sampler = animation.samplers[channel.sampler];
        return {
          node: channel.target.node,
          path: channel.target.path,
          interpolation: sampler.interpolation || "LINEAR",
          input: ReadAccessor(glb, sampler.input).data,
          output: ReadAccessor(glb, sampler.output).data,
          width: channel.target.path === "rotation" ? 4 : 3,
        };
      });
      return {
        name: animation.name,
        channels,
        duration: channels.reduce((best, channel) => Math.max(best, channel.input[channel.input.length - 1]), 0),
      };
    });
  }

  NodeIndex(name) {
    return this.nodes.findIndex((node) => node.name === name);
  }

  FindNode(pattern) {
    return this.nodes.findIndex((node) => pattern.test(node.name || ""));
  }

  AnimationIndex(name) {
    return this.animations.findIndex((animation) => animation.name === name);
  }

  Apply(animationIndex, time) {
    for (let i = 0; i < this.count; i += 1) {
      this.t[i].set(this.baseT[i]); this.r[i].set(this.baseR[i]); this.s[i].set(this.baseS[i]);
    }
    for (const channel of this.animations[animationIndex].channels) {
      const { input, output, width } = channel;
      let i = 0;
      while (i < input.length - 1 && input[i + 1] < time) i += 1;
      const j = Math.min(i + 1, input.length - 1);
      const span = input[j] - input[i];
      const alpha = span > 0 ? Math.min(1, Math.max(0, (time - input[i]) / span)) : 0;
      const target = channel.path === "translation" ? this.t[channel.node]
        : channel.path === "rotation" ? this.r[channel.node] : this.s[channel.node];
      if (channel.interpolation === "STEP") {
        for (let c = 0; c < width; c += 1) target[c] = output[i * width + c];
      } else if (channel.path === "rotation") {
        let ax = output[i * 4], ay = output[i * 4 + 1], az = output[i * 4 + 2], aw = output[i * 4 + 3];
        let bx = output[j * 4], by = output[j * 4 + 1], bz = output[j * 4 + 2], bw = output[j * 4 + 3];
        let dot = ax * bx + ay * by + az * bz + aw * bw;
        if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
        let s0 = 1 - alpha;
        let s1 = alpha;
        if (dot < 0.9995) {
          const theta = Math.acos(Math.min(1, dot));
          const sine = Math.sin(theta);
          s0 = Math.sin((1 - alpha) * theta) / sine;
          s1 = Math.sin(alpha * theta) / sine;
        }
        const x = s0 * ax + s1 * bx, y = s0 * ay + s1 * by, z = s0 * az + s1 * bz, w = s0 * aw + s1 * bw;
        const length = Math.hypot(x, y, z, w) || 1;
        target[0] = x / length; target[1] = y / length; target[2] = z / length; target[3] = w / length;
      } else {
        for (let c = 0; c < width; c += 1) {
          target[c] = output[i * width + c] * (1 - alpha) + output[j * width + c] * alpha;
        }
      }
    }
    for (const index of this.order) {
      Compose(this.local[index], this.t[index], this.r[index], this.s[index]);
      const parent = this.parent[index];
      if (parent < 0) this.world[index].set(this.local[index]);
      else Multiply(this.world[index], this.world[parent], this.local[index]);
    }
  }

  WorldY(nodeIndex) {
    return this.world[nodeIndex][13];
  }
}

/** 蒙皮顶点表：joints / weights / 逆绑定矩阵，只读一次。 */
export function BuildSkin(glb) {
  const parts = [];
  for (const node of glb.json.nodes || []) {
    if (node.mesh === undefined || node.skin === undefined) continue;
    const skin = glb.json.skins[node.skin];
    const inverseBind = ReadAccessor(glb, skin.inverseBindMatrices).data;
    for (const primitive of glb.json.meshes[node.mesh].primitives) {
      const position = ReadAccessor(glb, primitive.attributes.POSITION);
      parts.push({
        joints: skin.joints,
        inverseBind,
        position: position.data,
        jointIndex: ReadAccessorInt(glb, primitive.attributes.JOINTS_0).data,
        weight: ReadAccessor(glb, primitive.attributes.WEIGHTS_0).data,
        count: position.count,
      });
    }
  }
  return parts;
}

/** 当前姿势下变形网格的最低世界 Y —— 负数就是陷进地里。 */
export function MinSkinnedY(scene, parts) {
  let lowest = Infinity;
  const scratch = new Float64Array(16);
  for (const part of parts) {
    const matrices = new Float64Array(part.joints.length * 16);
    for (let j = 0; j < part.joints.length; j += 1) {
      const bind = new Float64Array(16);
      for (let k = 0; k < 16; k += 1) bind[k] = part.inverseBind[j * 16 + k];
      Multiply(scratch, scene.world[part.joints[j]], bind);
      matrices.set(scratch, j * 16);
    }
    const { position, jointIndex, weight, count } = part;
    for (let v = 0; v < count; v += 1) {
      const x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
      let sum = 0;
      let total = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = weight[v * 4 + k];
        if (w === 0) continue;
        const o = jointIndex[v * 4 + k] * 16;
        sum += w * (matrices[o + 1] * x + matrices[o + 5] * y + matrices[o + 9] * z + matrices[o + 13]);
        total += w;
      }
      if (total > 0) {
        const yy = sum / total;
        if (yy < lowest) lowest = yy;
      }
    }
  }
  return lowest;
}

/**
 * 一套 GLB 的姿态账：逐 clip 量骨盆/头的世界高度，以及（可选）贴地余量。
 * `samples` 是每条 clip 均匀取的帧数，含首尾。
 */
export function MeasurePose(glb, { pelvisName, headName, samples = 9, ground = false } = {}) {
  const scene = new PoseScene(glb);
  const parts = ground ? BuildSkin(glb) : null;
  const pelvis = pelvisName ? scene.NodeIndex(pelvisName) : scene.FindNode(/pelvis$/i);
  const head = headName ? scene.NodeIndex(headName) : scene.FindNode(/head$/i);
  if (pelvis < 0) throw new Error("pelvis node not found");
  const byClip = {};
  for (let a = 0; a < scene.animations.length; a += 1) {
    const animation = scene.animations[a];
    const row = {
      pelvis: [Infinity, -Infinity],
      head: [Infinity, -Infinity],
      minSkinnedY: Infinity,
    };
    for (let i = 0; i < samples; i += 1) {
      scene.Apply(a, (animation.duration * i) / Math.max(1, samples - 1));
      const py = scene.WorldY(pelvis);
      row.pelvis[0] = Math.min(row.pelvis[0], py);
      row.pelvis[1] = Math.max(row.pelvis[1], py);
      if (head >= 0) {
        const hy = scene.WorldY(head);
        row.head[0] = Math.min(row.head[0], hy);
        row.head[1] = Math.max(row.head[1], hy);
      }
      if (parts) row.minSkinnedY = Math.min(row.minSkinnedY, MinSkinnedY(scene, parts));
    }
    byClip[animation.name] = row;
  }
  const lows = Object.values(byClip).map((row) => row.pelvis[0]);
  const highs = Object.values(byClip).map((row) => row.pelvis[1]);
  return {
    byClip,
    pelvisLow: Math.min(...lows),
    pelvisHigh: Math.max(...highs),
    pelvisSpread: Math.max(...highs) - Math.min(...lows),
  };
}

/**
 * 这套模型的**正面朝哪**（弧度，0 = 引擎契约的正面「局部 −Z」，π = 背对）。
 *
 * 【为什么要量而不是看导出脚本】朝向是资产与引擎之间唯一一条没人写下来的约定：
 * glTF 的资产约定是正面 +Z，本项目的 Actor 契约是正面 −Z（ry = atan2(−dx,−dz)，
 * 见 Script_Ai / Data_Cutscene* / Data_Range）。两条差 180°，而差 180° 的模型在
 * 静止截图上一眼看不出来 —— 它照样站得笔直、贴着地、比例正常，只是背对着自己
 * 的朝向。2026-08-25 蒙皮模型接进来时就是这么漏过去的，直到有人问「日军怎么
 * 背对着我开枪」。这个函数把它变成一个可断言的数。
 *
 * 【怎么量】拿解剖轴反推，不看任何节点名里的方位词：
 *   right = 右大腿 − 左大腿（指向人物右侧）
 *   up    = 头 − 骨盆（沿脊柱向上）
 *   forward = up × right（右手系：面朝 −Z、+Y 朝上的人，right 正是 +X）
 * 再取水平分量的偏角。躺/蹲的 clip 的 up 是斜的，所以默认只量站姿参考 clip。
 */
export function MeasureForwardYaw(glb, {
  clip = "AdvanceFire", time = 0, thighLName, thighRName, pelvisName, headName,
} = {}) {
  const scene = new PoseScene(glb);
  const pick = (name, pattern) => (name ? scene.NodeIndex(name) : scene.FindNode(pattern));
  const thighL = pick(thighLName, /L Thigh$/i);
  const thighR = pick(thighRName, /R Thigh$/i);
  const pelvis = pick(pelvisName, /Pelvis$/i);
  const head = pick(headName, / Head$/i);
  if (thighL < 0 || thighR < 0 || pelvis < 0 || head < 0) throw new Error("facing bones not found");
  const index = scene.AnimationIndex(clip);
  if (index < 0) throw new Error(`clip not found: ${clip}`);
  scene.Apply(index, time);
  const at = (node) => [scene.world[node][12], scene.world[node][13], scene.world[node][14]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const right = unit(sub(at(thighR), at(thighL)));
  const up = unit(sub(at(head), at(pelvis)));
  const forward = [
    up[1] * right[2] - up[2] * right[1],
    up[2] * right[0] - up[0] * right[2],
    up[0] * right[1] - up[1] * right[0],
  ];
  return Math.atan2(-forward[0], -forward[2]);
}
