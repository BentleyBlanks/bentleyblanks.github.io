// 把 Tripo 绑好 Mixamo 骨架的人物（骨名 mixamorig:*）改成和 Animation/Mixamo/Model_MixamoXBot.glb 同一副骨架，
// 白盒里能直接换掉 X Bot 播同一批 Mixamo / 自制 / 派生动作（2026-11-03 日兵甲，docs/Data_EditorBlockout.md §18「日兵甲」）。
//
// Tripo 出的骨架三处和 X Bot 不一样：整个人缩到 1 m 高、每根骨头的初始朝向不同（同一条动作的本地转角放上去会拧成麻花）、
// 少了 13 根末端骨（手指第 4 节、头顶、脚尖）。做法：
//   · 骨名、层级、节点顺序、每根骨头在初始姿势下的世界朝向全抄 X Bot；骨头的位置用这个人自己的关节（按原件身高放大）；
//     末端骨按 X Bot 的本地偏移接在这个人的父骨上（没有权重，只为骨名齐全）。
//   · 网格、权重原样，只把顶点换到新骨架的初始姿势下（初始姿势不变形），关节编号按 X Bot 的骨头顺序重排。
//   · 贴图 PNG → WebP（有损，分辨率不变；法线贴图品质更高）。
// 动作里除 Hips 以外的位移轨是 X Bot 的骨长，这个人用的时候要去掉、Hips 位移按胯高比例缩（Script_XBotCharacters.mjs 的
// ClipForCharacter；比例是 Data_XBotCharacters.mjs 的 hipsScale，本脚本写进报告，测试核两边一致）。
//
// 用法：node _import/Script_BuildXBotRigCharacter.mjs [源.glb] [--crown 1.8142] [--out Model/Character/Model_JapaneseSoldierJia.glb]
//   何有田：… 05_何有田/HeYoutian_Merged_V1_Bones_NeckFix.glb --crown 1.8263 --out Model/Character/Model_HeYoutian.glb
//   罗班长：… 02_罗班长/SquadLeaderLuo_Merged_V13_Bones.glb --crown 1.791 --out Model/Character/Model_SquadLeaderLuo.glb
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import * as THREE from "../vendor/three/build/three.module.js";

const PROJECT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const Flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const OUT = path.resolve(PROJECT, Flag("--out", "Model/Character/Model_JapaneseSoldierJia.glb"));
// 帽顶高度：合并时整体缩放到头顶 1.809 m（同 X Bot），帽顶 1.8142 m；Tripo 绑骨时又把整个人缩到 1 m，这里放回去
const CROWN = Number(Flag("--crown", "1.8142"));
const SOURCE = args[0] || "C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/14_日兵甲/JapaneseSoldierJia_Merged_V1_Bones.glb";
const XBOT = path.join(PROJECT, "Animation/Mixamo/Model_MixamoXBot.glb");
const Hash = (b) => createHash("sha256").update(b).digest("hex");

function ReadGlb(file) {
  const bytes = fs.readFileSync(file), n = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + n).toString());
  return { bytes, doc, bin: bytes.subarray(28 + n) };
}
function View(glb, i) { const v = glb.doc.bufferViews[i]; return glb.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); }
function Accessor(glb, i) {
  const a = glb.doc.accessors[i], v = glb.doc.bufferViews[a.bufferView];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  if (v.byteStride && v.byteStride !== width * T.BYTES_PER_ELEMENT) throw Error("interleaved accessor " + i);
  const raw = View(glb, a.bufferView).subarray(a.byteOffset || 0);
  const out = new T(a.count * width);
  new Uint8Array(out.buffer).set(raw.subarray(0, out.byteLength));
  return { data: out, width, accessor: a };
}
function NodeWorlds(doc) {
  const local = doc.nodes.map((nd) => nd.matrix ? new THREE.Matrix4().fromArray(nd.matrix)
    : new THREE.Matrix4().compose(new THREE.Vector3(...(nd.translation || [0, 0, 0])), new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(nd.scale || [1, 1, 1]))));
  const parent = doc.nodes.map(() => -1);
  doc.nodes.forEach((nd, i) => (nd.children || []).forEach((c) => (parent[c] = i)));
  const world = [];
  const W = (i) => world[i] || (world[i] = parent[i] < 0 ? local[i].clone() : W(parent[i]).clone().multiply(local[i]));
  doc.nodes.forEach((_, i) => W(i));
  return { local, parent, world };
}
const Strip = (name) => (name || "").replace(/^mixamorig:?/, "");

// ---------- 源：Tripo 绑骨的人物 ----------
const src = ReadGlb(SOURCE);
if (src.doc.meshes.length !== 1 || src.doc.meshes[0].primitives.length !== 1 || src.doc.skins?.length !== 1) throw Error("源要求 1 个网格 1 个图元 1 套骨架");
const srcW = NodeWorlds(src.doc);
const srcSkin = src.doc.skins[0];
const srcIbm = Accessor(src, srcSkin.inverseBindMatrices).data;
const srcJointNames = srcSkin.joints.map((i) => Strip(src.doc.nodes[i].name));
// 初始姿势下显示出来的样子 = 骨头世界矩阵 × 逆绑定矩阵 × 顶点；每根骨头这个乘积应当一样（初始姿势就是绑定姿势，只差整体朝向）
const display = srcW.world[srcSkin.joints[0]].clone().multiply(new THREE.Matrix4().fromArray(srcIbm, 0));
srcSkin.joints.forEach((ji, k) => {
  const m = srcW.world[ji].clone().multiply(new THREE.Matrix4().fromArray(srcIbm, k * 16));
  const d = m.elements.reduce((s, v, i) => Math.max(s, Math.abs(v - display.elements[i])), 0);
  if (d > 1e-4) throw Error(`源骨 ${srcJointNames[k]} 初始姿势不是绑定姿势（差 ${d}）`);
});
const prim = src.doc.meshes[0].primitives[0];
const pos = Accessor(src, prim.attributes.POSITION).data, nrm = Accessor(src, prim.attributes.NORMAL).data;
const uv = Accessor(src, prim.attributes.TEXCOORD_0).data, idx = Accessor(src, prim.indices).data;
const joints = Accessor(src, prim.attributes.JOINTS_0).data, weights = Accessor(src, prim.attributes.WEIGHTS_0).data;
const count = pos.length / 3;
const shown = new Float32Array(pos.length);
let maxY = -Infinity, minY = Infinity;
for (let i = 0; i < count; i++) {
  const v = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(display);
  shown.set(v.toArray(), i * 3); maxY = Math.max(maxY, v.y); minY = Math.min(minY, v.y);
}
const scale = CROWN / maxY;
const displayRot = new THREE.Matrix3().setFromMatrix4(display);   // 纯转动（Tripo 只转了 90°）

// ---------- 目标：X Bot 的骨架 ----------
const xb = ReadGlb(XBOT);
const xbW = NodeWorlds(xb.doc);
const xbSkin = xb.doc.skins[0];
const armature = xb.doc.nodes.findIndex((nd) => nd.name === "Armature");
const A = xbW.world[armature];
const Ainv = A.clone().invert();
const srcBoneWorld = new Map(srcSkin.joints.map((ji, k) => [srcJointNames[k], srcW.world[ji]]));
const xbBones = xbSkin.joints.map((ji) => xb.doc.nodes[ji].name);
const missing = xbBones.filter((n) => !srcBoneWorld.has(n));
const extra = srcJointNames.filter((n) => !xbBones.includes(n));
if (extra.length) throw Error("源里有 X Bot 没有的骨：" + extra.join(", "));
if (missing.some((n) => !/(4|_End)$/.test(n))) throw Error("缺的不只是末端骨：" + missing.join(", "));

// 每根骨的新世界矩阵：朝向 / 缩放 = X Bot 的，位置 = 这个人的关节（显示空间 × 放大）；末端骨按 X Bot 本地偏移接在父骨上
const target = new Map();
const T = (ni) => {
  const name = xb.doc.nodes[ni].name;
  if (target.has(name)) return target.get(name);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  xbW.world[ni].decompose(p, q, s);
  let m;
  if (srcBoneWorld.has(name)) {
    const jp = new THREE.Vector3().setFromMatrixPosition(srcBoneWorld.get(name)).multiplyScalar(scale);
    m = new THREE.Matrix4().compose(jp, q, s);
  } else {
    m = T(xbW.parent[ni]).clone().multiply(xbW.local[ni]);
  }
  target.set(name, m);
  return m;
};
xbSkin.joints.forEach((ji) => T(ji));

// ---------- 新 GLB ----------
const chunks = [];
let binLength = 0;
const views = [], accessors = [];
function AddView(bytes, target) {
  const pad = (4 - (binLength % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); binLength += pad; }
  views.push({ buffer: 0, byteOffset: binLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); binLength += bytes.byteLength;
  return views.length - 1;
}
function AddAccessor(typed, componentType, type, target, extra = {}) {
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
  accessors.push({ bufferView: AddView(typed, target), componentType, count: typed.length / width, type, ...extra });
  return accessors.length - 1;
}

// 顶点：新骨架初始姿势下显示 = A × 顶点，所以顶点 = A⁻¹ × 显示位置
const outPos = new Float32Array(pos.length), outNrm = new Float32Array(nrm.length);
const nMat = new THREE.Matrix3().setFromMatrix4(Ainv).multiply(displayRot);
const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
for (let i = 0; i < count; i++) {
  const v = new THREE.Vector3(shown[i * 3], shown[i * 3 + 1], shown[i * 3 + 2]).multiplyScalar(scale).applyMatrix4(Ainv);
  outPos.set(v.toArray(), i * 3); lo.min(v); hi.max(v);
  const n = new THREE.Vector3(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]).applyMatrix3(nMat).normalize();
  outNrm.set(n.toArray(), i * 3);
}
const remap = srcJointNames.map((n) => xbBones.indexOf(n));
const outJoints = new Uint8Array(joints.length);
for (let i = 0; i < joints.length; i++) outJoints[i] = weights[i] > 0 ? remap[joints[i]] : 0;
const ibm = new Float32Array(xbBones.length * 16);
xbBones.forEach((name, k) => ibm.set(target.get(name).clone().invert().multiply(A).toArray(), k * 16));

// 头顶和帽子只跟头骨：Tripo 自动权重把 Neck 一路漏到帽顶（日兵甲耳朵高度约 19%、帽子上还有 10%），转头时帽子跟着扭。
// 头骨关节以上 RIGID_HEAD[0] 起，Neck 的份额按 smoothstep 减到 RIGID_HEAD[1] 处为 0，减下来的给 Head。
const RIGID_HEAD = [0.015, 0.09];
const headIndex = xbBones.indexOf("Head"), neckIndex = xbBones.indexOf("Neck");
const headUp = new THREE.Vector3().setFromMatrixPosition(target.get("Head")).y;   // 模型空间
let rigidVerts = 0;
for (let i = 0; i < count; i++) {
  const y = shown[i * 3 + 1] * scale - headUp;
  if (y <= RIGID_HEAD[0]) continue;
  const t = Math.min(1, (y - RIGID_HEAD[0]) / (RIGID_HEAD[1] - RIGID_HEAD[0])), keep = 1 - t * t * (3 - 2 * t);
  let slotHead = -1, slotNeck = -1;
  for (let k = 0; k < 4; k++) { if (weights[i * 4 + k] <= 0) continue; if (outJoints[i * 4 + k] === headIndex) slotHead = k; if (outJoints[i * 4 + k] === neckIndex) slotNeck = k; }
  if (slotNeck < 0) continue;
  // 没有 Head 这一格：Neck 全减完就把这一格直接改成 Head；只减一部分就占一个空格
  if (slotHead < 0 && keep <= 0) { outJoints[i * 4 + slotNeck] = headIndex; rigidVerts++; continue; }
  if (slotHead < 0) { slotHead = weights.subarray(i * 4, i * 4 + 4).indexOf(0); if (slotHead < 0) continue; outJoints[i * 4 + slotHead] = headIndex; }
  const moved = weights[i * 4 + slotNeck] * (1 - keep);
  weights[i * 4 + slotNeck] -= moved; weights[i * 4 + slotHead] += moved;
  rigidVerts++;
}

// 合并完全相同的点（位置 / 法线 / UV / 骨头 / 权重逐字节一样）：何有田那次 Tripo 绑骨把每个面的角都存成单独的点
// （15.6 万点，去重后 4.87 万），文件大三倍、显卡也白算；日兵甲本来就没有重复，合并不改变它
const parts = [[outPos, 12], [outNrm, 12], [uv, 8], [outJoints, 4], [weights, 16]].map(([a, size]) => [Buffer.from(a.buffer, a.byteOffset, a.byteLength), size]);
const firstOf = new Map(), newIndex = new Uint32Array(count), keepVerts = [];
for (let i = 0; i < count; i++) {
  const key = parts.map(([b, size]) => b.toString("latin1", i * size, (i + 1) * size)).join("");
  if (!firstOf.has(key)) { firstOf.set(key, keepVerts.length); keepVerts.push(i); }
  newIndex[i] = firstOf.get(key);
}
const Pick = (a, w) => { const out = new a.constructor(keepVerts.length * w); keepVerts.forEach((v, j) => out.set(a.subarray(v * w, v * w + w), j * w)); return out; };
const outIdx = idx.map((i) => newIndex[i]);
const attrs = {
  POSITION: AddAccessor(Pick(outPos, 3), 5126, "VEC3", 34962, { min: lo.toArray(), max: hi.toArray() }),
  NORMAL: AddAccessor(Pick(outNrm, 3), 5126, "VEC3", 34962),
  TEXCOORD_0: AddAccessor(Pick(uv, 2), 5126, "VEC2", 34962),
  JOINTS_0: AddAccessor(Pick(outJoints, 4), 5121, "VEC4", 34962),
  WEIGHTS_0: AddAccessor(Pick(weights, 4), 5126, "VEC4", 34962),
};
const indices = AddAccessor(outIdx, 5125, "SCALAR", 34963);
const ibmAcc = AddAccessor(ibm, 5126, "MAT4");

// 贴图：底色 / 粗糙度有损 WebP 90，法线 96
const material = structuredClone(src.doc.materials[0]);
material.name = "M_" + path.basename(OUT, ".glb").replace(/^Model_/, "");
const normalImage = src.doc.textures[material.normalTexture?.index]?.source;
const images = [], imageReport = [];
for (const [i, image] of src.doc.images.entries()) {
  const raw = View(src, image.bufferView);
  const meta = await sharp(raw).metadata();
  const webp = await sharp(raw).webp({ quality: i === normalImage ? 96 : 90, effort: 6, smartSubsample: true }).toBuffer();
  images.push({ bufferView: AddView(webp), mimeType: "image/webp" });
  imageReport.push({ index: i, role: i === normalImage ? "normal" : i === src.doc.textures[material.pbrMetallicRoughness?.baseColorTexture?.index]?.source ? "baseColor" : "metallicRoughness",
    width: meta.width, height: meta.height, sourceBytes: raw.length, bytes: webp.length });
}
const textures = src.doc.textures.map((t) => ({ sampler: 0, extensions: { EXT_texture_webp: { source: t.source } } }));

// 节点：完全照 X Bot 的节点表（顺序、名字、层级），骨头换成新本地矩阵；两个 Beta 网格节点换成这个人
const nodes = xb.doc.nodes.map((nd, i) => {
  const out = { name: nd.name };
  if (nd.children) out.children = [...nd.children];
  if (xbBones.includes(nd.name)) {
    const parentM = xbW.parent[i] === armature ? A : target.get(xb.doc.nodes[xbW.parent[i]].name);
    const local = parentM.clone().invert().multiply(target.get(nd.name));
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    local.decompose(p, q, s);
    Object.assign(out, { translation: p.toArray(), rotation: q.normalize().toArray(), scale: s.toArray() });
  } else {
    for (const k of ["translation", "rotation", "scale", "matrix"]) if (nd[k]) out[k] = nd[k];
  }
  return out;
});
const meshNodes = xb.doc.nodes.map((nd, i) => (nd.mesh !== undefined ? i : -1)).filter((i) => i >= 0);
const keep = meshNodes[0];
nodes[keep] = { name: path.basename(OUT, ".glb").replace(/^Model_/, ""), mesh: 0, skin: 0 };
// 其余网格节点从层级里摘掉（下标后移会动骨头编号，所以留空节点，只从父节点的 children 去掉）
for (const i of meshNodes.slice(1)) { nodes[i] = { name: "_unused" }; for (const nd of nodes) if (nd.children) nd.children = nd.children.filter((c) => c !== i); }

const doc = {
  asset: { version: "2.0", generator: "Taierzhuang1938 Script_BuildXBotRigCharacter.mjs" },
  extensionsUsed: ["EXT_texture_webp"], extensionsRequired: ["EXT_texture_webp"],
  scene: 0, scenes: [{ nodes: [...xb.doc.scenes[0].nodes] }], nodes,
  meshes: [{ name: nodes[keep].name, primitives: [{ attributes: attrs, indices, material: 0, mode: 4 }] }],
  skins: [{ name: "Armature", joints: [...xbSkin.joints], inverseBindMatrices: ibmAcc }],
  materials: [material], textures, images, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  accessors, bufferViews: views, buffers: [{ byteLength: 0 }],
};
const bin = Buffer.concat(chunks, binLength);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
doc.buffers[0].byteLength = binPadded.length;
const json = Buffer.from(JSON.stringify(doc)), jsonPadded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const glb = Buffer.alloc(28 + jsonPadded.length + binPadded.length);
glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(jsonPadded.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); jsonPadded.copy(glb, 20);
glb.writeUInt32LE(binPadded.length, 20 + jsonPadded.length); glb.writeUInt32LE(0x004e4942, 24 + jsonPadded.length);
binPadded.copy(glb, 28 + jsonPadded.length);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, glb);

// 胯高比：动作里 Hips 的位移是 X Bot 的胯高，这个人播的时候按这个比例缩
const hipsY = (m) => new THREE.Vector3().setFromMatrixPosition(m).y;
const xbHips = xbW.world[xb.doc.nodes.findIndex((nd) => nd.name === "Hips")];
const report = {
  schema: 1, built: new Date().toISOString().slice(0, 10), script: "_import/Script_BuildXBotRigCharacter.mjs",
  source: { file: path.basename(SOURCE), bytes: src.bytes.length, sha256: Hash(src.bytes), heightM: +(maxY - minY).toFixed(4) },
  output: { file: path.relative(PROJECT, OUT).replace(/\\/g, "/"), bytes: glb.length, sha256: Hash(glb) },
  scale: +scale.toFixed(6), crownM: CROWN, triangles: idx.length / 3, vertices: keepVerts.length, sourceVertices: count,
  bones: xbBones.length, addedEndBones: missing, rigidHead: { aboveHeadJointM: RIGID_HEAD, vertices: rigidVerts },
  hipsY: +hipsY(target.get("Hips")).toFixed(4), xbotHipsY: +hipsY(xbHips).toFixed(4),
  hipsScale: +(hipsY(target.get("Hips")) / hipsY(xbHips)).toFixed(4),
  headY: +hipsY(target.get("Head")).toFixed(4), xbotHeadY: +hipsY(xbW.world[xb.doc.nodes.findIndex((nd) => nd.name === "Head")]).toFixed(4),
  images: imageReport,
};
fs.writeFileSync(OUT.replace(/\.glb$/, ".json").replace(/Model_/, "Data_"), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report, null, 1));
