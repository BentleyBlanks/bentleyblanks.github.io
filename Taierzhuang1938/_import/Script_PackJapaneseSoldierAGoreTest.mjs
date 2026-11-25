/**
 * Pack Blender-bisected JapaneseSoldierA geometry into a 100% XBot-exact GLB copy
 * (`Model/GoreTest/Model_JapaneseSoldierAGoreTest.glb`) + metadata JSON
 * (`Model/GoreTest/Data_JapaneseSoldierAGoreTest.json`).
 *
 * Keeps the original Model_JapaneseSoldierA.glb 100% untouched.
 * Copies its exact 65-bone XBot node hierarchy, inverseBindMatrices, PBR material, and
 * 4K WebP textures bit-for-bit, swapping ONLY the bisected zero-seam mesh buffers and
 * writing bone-local elliptical cut-plane metadata + per-vertex region IDs.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as THREE from "../vendor/three/build/three.module.js";

const PROJECT = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(PROJECT, "..");
const SRC_GLB = path.join(PROJECT, "Model/Character/Model_JapaneseSoldierA.glb");
const RAW_BIN = path.join(REPO, "tmp/GoreTestBuild/JapaneseSoldierAGoreTest_Raw.bin");
const RAW_JSON = path.join(REPO, "tmp/GoreTestBuild/JapaneseSoldierAGoreTest_Raw.json");
const OUT_DIR = path.join(PROJECT, "Model/GoreTest");
const OUT_GLB = path.join(OUT_DIR, "Model_JapaneseSoldierAGoreTest.glb");
const OUT_JSON = path.join(OUT_DIR, "Data_JapaneseSoldierAGoreTest.json");

const Hash = (b) => createHash("sha256").update(b).digest("hex");

function ReadGlb(file) {
  const bytes = fs.readFileSync(file);
  const n = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + n).toString("utf8"));
  const binLen = bytes.readUInt32LE(20 + n);
  const bin = bytes.subarray(28 + n, 28 + n + binLen);
  return { bytes, doc, bin };
}

function NodeWorlds(doc) {
  const local = doc.nodes.map((nd) => nd.matrix ? new THREE.Matrix4().fromArray(nd.matrix)
    : new THREE.Matrix4().compose(
      new THREE.Vector3(...(nd.translation || [0, 0, 0])),
      new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(nd.scale || [1, 1, 1])),
    ));
  const parent = doc.nodes.map(() => -1);
  doc.nodes.forEach((nd, i) => (nd.children || []).forEach((c) => (parent[c] = i)));
  const world = [];
  const W = (i) => world[i] || (world[i] = parent[i] < 0 ? local[i].clone() : W(parent[i]).clone().multiply(local[i]));
  doc.nodes.forEach((_, i) => W(i));
  return { local, parent, world };
}

const src = ReadGlb(SRC_GLB);
const rawMeta = JSON.parse(fs.readFileSync(RAW_JSON, "utf8"));
const rawBin = fs.readFileSync(RAW_BIN);

const sw = NodeWorlds(src.doc);
const skin = src.doc.skins[0];
const jointNames = skin.joints.map((ni) => src.doc.nodes[ni].name);
const jointIndexByName = new Map(jointNames.map((n, i) => [n, i]));
const jointWorldByName = new Map(skin.joints.map((ni, i) => [jointNames[i], sw.world[ni]]));

// Armature transform A (same as Script_BuildXBotRigCharacter.mjs):
// display = A * localPos => localPos = A^-1 * display
const armatureIdx = src.doc.nodes.findIndex((nd) => nd.name === "Armature");
const A = sw.world[armatureIdx];
const Ainv = A.clone().invert();
const nMat = new THREE.Matrix3().setFromMatrix4(Ainv);

const vcount = rawMeta.vertexCount;
const tcount = rawMeta.triangleCount;
const off = rawMeta.offsets;

const readF32 = (byteOff, len) => new Float32Array(rawBin.buffer, rawBin.byteOffset + byteOff, len);
const readU16 = (byteOff, len) => new Uint16Array(rawBin.buffer, rawBin.byteOffset + byteOff, len);
const readU32 = (byteOff, len) => new Uint32Array(rawBin.buffer, rawBin.byteOffset + byteOff, len);

const rawPos = readF32(off.position, vcount * 3);
const rawNrm = readF32(off.normal, vcount * 3);
const rawUv  = readF32(off.uv, vcount * 2);
const rawJnt = readU16(off.joints, vcount * 4);
const rawWgt = readF32(off.weights, vcount * 4);
const rawReg = new Uint8Array(rawBin.buffer, rawBin.byteOffset + off.region, vcount);
const rawIdx = readU32(off.indices, tcount * 3);

// Remap Blender vertex group indices -> exact XBot skin joint indices
const vgRemap = rawMeta.vertexGroupNames.map((name) => {
  const idx = jointIndexByName.get(name);
  if (idx === undefined) throw new Error(`Unknown vertex group ${name} not in XBot skin`);
  return idx;
});

// Transform display-world positions/normals into exact Armature-local mesh space
const outPos = new Float32Array(vcount * 3);
const outNrm = new Float32Array(vcount * 3);
const outUv  = new Float32Array(vcount * 2);
const outJnt = new Uint8Array(vcount * 4);
const outWgt = new Float32Array(vcount * 4);
outUv.set(rawUv);
outWgt.set(rawWgt);

const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
let maxWorldY = -Infinity, minWorldY = Infinity;
const v3 = new THREE.Vector3();

for (let i = 0; i < vcount; i++) {
  v3.set(rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2]);
  if (v3.y > maxWorldY) maxWorldY = v3.y;
  if (v3.y < minWorldY) minWorldY = v3.y;
  v3.applyMatrix4(Ainv);
  outPos[i * 3] = v3.x; outPos[i * 3 + 1] = v3.y; outPos[i * 3 + 2] = v3.z;
  lo.min(v3); hi.max(v3);

  v3.set(rawNrm[i * 3], rawNrm[i * 3 + 1], rawNrm[i * 3 + 2]).applyMatrix3(nMat).normalize();
  outNrm[i * 3] = v3.x; outNrm[i * 3 + 1] = v3.y; outNrm[i * 3 + 2] = v3.z;

  for (let k = 0; k < 4; k++) {
    outJnt[i * 4 + k] = outWgt[i * 4 + k] > 0 ? vgRemap[rawJnt[i * 4 + k]] : 0;
  }
}

console.log(`Height sanity: minY=${minWorldY.toFixed(5)}m, maxY=${maxWorldY.toFixed(5)}m (expected ~1.8376m)`);
if (Math.abs(maxWorldY - 1.8376) > 0.005 || Math.abs(minWorldY) > 0.005) {
  throw new Error(`Unexpected packed height bounds [${minWorldY}, ${maxWorldY}]`);
}

// Compute bone-local cut-plane metadata in the EXACT XBot bone local coordinates!
// Note: XBot bone world matrices have scale ~0.01 (cm), so dividing by bone world matrix puts
// offset in bone-local units (cm), while normal/tangent are pure unit vectors in bone-local frame,
// and radiusU / radiusV stay in clean world METERS!
function worldFrameToBoneLocal(boneName, centerW, normalW, tangentUW, tangentVW) {
  const m = jointWorldByName.get(boneName);
  if (!m) throw new Error(`Missing bone ${boneName}`);
  const inv = m.clone().invert();
  const rot = new THREE.Matrix3().setFromMatrix4(inv);
  const p = new THREE.Vector3(...centerW).applyMatrix4(inv);
  const n = new THREE.Vector3(...normalW).applyMatrix3(rot).normalize();
  const u = new THREE.Vector3(...tangentUW).applyMatrix3(rot).normalize();
  const v = new THREE.Vector3(...tangentVW).applyMatrix3(rot).normalize();
  return {
    offsetLocal: p.toArray().map((x) => +x.toFixed(5)),
    normalLocal: n.toArray().map((x) => +x.toFixed(5)),
    tangentULocal: u.toArray().map((x) => +x.toFixed(5)),
    tangentVLocal: v.toArray().map((x) => +x.toFixed(5)),
  };
}

const cuts = {};
for (const [limbId, c] of Object.entries(rawMeta.cuts)) {
  cuts[limbId] = {
    stumpBone: c.stumpBone,
    partBone: c.partBone,
    ringVerts: c.ringVerts,
    radiusU: c.radiusU,
    radiusV: c.radiusV,
    maxRadiusU: c.maxRadiusU,
    maxRadiusV: c.maxRadiusV,
    stump: worldFrameToBoneLocal(c.stumpBone, c.centerWorld, c.normalWorld, c.tangentUWorld, c.tangentVWorld),
    part: worldFrameToBoneLocal(c.partBone, c.centerWorld, c.normalWorld.map((x) => -x), c.tangentUWorld, c.tangentVWorld),
  };
}

const headMInv = jointWorldByName.get("Head").clone().invert();
const helmetLocalCenter = new THREE.Vector3(...rawMeta.helmet.centerWorld).applyMatrix4(headMInv);
const helmetMeta = {
  bone: "Head",
  offsetLocal: helmetLocalCenter.toArray().map((x) => +x.toFixed(5)),
  radius: rawMeta.helmet.radius,
};

// Verify zero cross-region triangles!
let crossTris = 0;
for (let t = 0; t < tcount; t++) {
  const r0 = rawReg[rawIdx[t * 3]], r1 = rawReg[rawIdx[t * 3 + 1]], r2 = rawReg[rawIdx[t * 3 + 2]];
  if (r0 !== r1 || r1 !== r2) crossTris++;
}
console.log(`Zero-seam triangle verification: crossRegionTris=${crossTris} (must be 0)`);
if (crossTris !== 0) throw new Error(`Expected 0 cross-region triangles, got ${crossTris}`);

// Build clean output GLB copying exact skeleton, IBM, materials, and embedded WebP images from SRC_GLB
const chunks = [];
let binLength = 0;
const views = [], accessors = [];
function AddView(bytes, target) {
  const pad = (4 - (binLength % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); binLength += pad; }
  views.push({ buffer: 0, byteOffset: binLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  binLength += bytes.byteLength;
  return views.length - 1;
}
function AddAccessor(typed, componentType, type, target, extra = {}) {
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
  accessors.push({ bufferView: AddView(typed, target), componentType, count: typed.length / width, type, ...extra });
  return accessors.length - 1;
}

const attrs = {
  POSITION: AddAccessor(outPos, 5126, "VEC3", 34962, { min: lo.toArray(), max: hi.toArray() }),
  NORMAL: AddAccessor(outNrm, 5126, "VEC3", 34962),
  TEXCOORD_0: AddAccessor(outUv, 5126, "VEC2", 34962),
  JOINTS_0: AddAccessor(outJnt, 5121, "VEC4", 34962),
  WEIGHTS_0: AddAccessor(outWgt, 5126, "VEC4", 34962),
};
const idxAcc = AddAccessor(rawIdx, 5125, "SCALAR", 34963);

// Copy exact inverseBindMatrices bytes from SRC_GLB
const srcIbmAcc = src.doc.accessors[skin.inverseBindMatrices];
const srcIbmBv = src.doc.bufferViews[srcIbmAcc.bufferView];
const srcIbmBytes = src.bin.subarray(
  (srcIbmBv.byteOffset || 0) + (srcIbmAcc.byteOffset || 0),
  (srcIbmBv.byteOffset || 0) + (srcIbmAcc.byteOffset || 0) + srcIbmAcc.count * 64,
);
const ibmAcc = accessors.length;
accessors.push({ bufferView: AddView(srcIbmBytes), componentType: 5126, count: srcIbmAcc.count, type: "MAT4" });

// Copy exact embedded WebP images from SRC_GLB
const images = [];
for (const img of src.doc.images || []) {
  const bv = src.doc.bufferViews[img.bufferView];
  const bytes = src.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  images.push({ bufferView: AddView(bytes), mimeType: img.mimeType });
}

const goreMeta = {
  schema: 1,
  regions: rawMeta.regions,
  regionTriangles: rawMeta.regionTriangles,
  vertexCount: vcount,
  triangleCount: tcount,
  regionsBase64: Buffer.from(rawReg).toString("base64"),
  cuts,
  helmet: helmetMeta,
};

const outDoc = {
  asset: {
    version: "2.0",
    generator: "Script_PackJapaneseSoldierAGoreTest",
    extras: { tengxianGore: goreMeta },
  },
  extensionsUsed: src.doc.extensionsUsed || ["EXT_texture_webp"],
  scene: src.doc.scene ?? 0,
  scenes: structuredClone(src.doc.scenes),
  nodes: structuredClone(src.doc.nodes),
  skins: [{ ...structuredClone(skin), inverseBindMatrices: ibmAcc }],
  meshes: [{ name: "JapaneseSoldierA_GoreTest", primitives: [{ attributes: attrs, indices: idxAcc, material: 0 }] }],
  materials: structuredClone(src.doc.materials),
  textures: structuredClone(src.doc.textures),
  samplers: structuredClone(src.doc.samplers),
  images,
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: binLength }],
};
// Keep material name distinct for clear debugging/caching
if (outDoc.materials[0]) outDoc.materials[0].name = "M_JapaneseSoldierA_GoreTest";

const jsonBuf = Buffer.from(JSON.stringify(outDoc));
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
const binPad = (4 - (binLength % 4)) % 4;
const binChunk = Buffer.concat([...chunks, Buffer.alloc(binPad)]);
const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
const header = Buffer.alloc(12);
header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.write("JSON", 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binChunk.length, 0); bh.write("BIN\0", 4);
const glbOut = Buffer.concat([header, jh, jsonChunk, bh, binChunk]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_GLB, glbOut);

// Also write readable metadata JSON (without duplicating base64 blob)
const srcReport = JSON.parse(fs.readFileSync(path.join(PROJECT, "Model/Character/Data_JapaneseSoldierA.json"), "utf8"));
const report = {
  schema: 1,
  built: "2026-11-25",
  source: { file: "Model/Character/Model_JapaneseSoldierA.glb", sha256: Hash(src.bytes) },
  output: { file: "Model/GoreTest/Model_JapaneseSoldierAGoreTest.glb", bytes: glbOut.length, sha256: Hash(glbOut) },
  hipsScale: srcReport.hipsScale,
  crownM: +maxWorldY.toFixed(4),
  headY: srcReport.headY,
  vertices: vcount,
  triangles: tcount,
  crossRegionTriangles: crossTris,
  regionTriangles: rawMeta.regionTriangles,
  cuts,
  helmet: helmetMeta,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

console.log(`Wrote ${OUT_GLB} (${(glbOut.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Wrote ${OUT_JSON}`);
