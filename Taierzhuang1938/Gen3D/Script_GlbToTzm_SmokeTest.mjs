import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH = process.argv[2] || join(__dirname, "GeneratedSoldier_20260819_223107.tzm.json");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

function decodeBase64(text) {
  const buf = Buffer.from(text, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function typedFrom(text, Ctor) {
  const bytes = decodeBase64(text);
  return new Ctor(bytes.buffer, bytes.byteOffset, bytes.byteLength / Ctor.BYTES_PER_ELEMENT);
}

function decodeMesh(block) {
  const count = block.count | 0;
  const qpos = typedFrom(block.pos, Uint16Array);
  const qnrm = typedFrom(block.nrm, Int8Array);
  const quv = typedFrom(block.uv, Uint16Array);
  const index = typedFrom(block.idx, block.idxBits === 32 ? Uint32Array : Uint16Array);

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const [pmx, pmy, pmz] = block.posMin;
  const [psx, psy, psz] = block.posScale;
  const [umx, umy] = block.uvMin;
  const [usx, usy] = block.uvScale;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = pmx + qpos[i * 3] * psx;
    positions[i * 3 + 1] = pmy + qpos[i * 3 + 1] * psy;
    positions[i * 3 + 2] = pmz + qpos[i * 3 + 2] * psz;
    let nx = qnrm[i * 3] / 127, ny = qnrm[i * 3 + 1] / 127, nz = qnrm[i * 3 + 2] / 127;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
    uvs[i * 2] = umx + quv[i * 2] * usx;
    uvs[i * 2 + 1] = umy + quv[i * 2 + 1] * usy;
  }
  return { positions, normals, uvs, index: Array.from(index), material: block.material };
}

function main() {
  if (!existsSync(PATH)) fail(`TZM file not found: ${PATH}`);
  const doc = JSON.parse(readFileSync(PATH, "utf-8"));

  if (doc.format !== "tzm") fail("format field != tzm");
  if (!Array.isArray(doc.nodes)) fail("missing nodes array");
  if (!Array.isArray(doc.meshes)) fail("missing meshes array");

  // 节点顺序：父索引必须小于子索引
  for (let i = 0; i < doc.nodes.length; i += 1) {
    const p = doc.nodes[i].parent;
    if (p < -1 || p >= i) fail(`node ${i} parent ${p} out of order`);
    if (!doc.nodes[i].name) fail(`node ${i} missing name`);
  }

  // 关键关节必须存在
  const names = new Set(doc.nodes.map((n) => n.name));
  const required = ["root", "body", "hips", "chest", "neck", "head", "shoulderL", "elbowL", "handL", "shoulderR", "elbowR", "handR", "thighL", "calfL", "footL", "thighR", "calfR", "footR"];
  for (const n of required) {
    if (!names.has(n)) fail(`missing required joint/mount: ${n}`);
  }

  // 网格解码 + NaN/Infinity 检查
  let totalTris = 0;
  for (const block of doc.meshes) {
    const decoded = decodeMesh(block);
    for (const arr of [decoded.positions, decoded.normals]) {
      for (let i = 0; i < arr.length; i += 1) {
        const v = arr[i];
        if (!Number.isFinite(v)) fail(`mesh ${block.material} contains non-finite value at index ${i}: ${v}`);
      }
    }
    totalTris += decoded.index.length / 3;
  }

  if (totalTris > 1800) fail(`triangle budget exceeded: ${totalTris} > 1800`);

  // bounds sanity
  const b = doc.bounds;
  for (let i = 0; i < 3; i += 1) {
    if (!Number.isFinite(b.min[i]) || !Number.isFinite(b.max[i])) fail("bounds contain non-finite");
    if (b.min[i] >= b.max[i]) fail("min >= max in bounds");
  }

  console.log(`PASS nodes=${doc.nodes.length} meshes=${doc.meshes.length} triangles=${totalTris} bytes=${readFileSync(PATH).length}`);
}

main();
