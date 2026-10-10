// Offline companion to Script_OptimizeKi21.py. Run through that source-hash-checked
// Blender entry point; its output contains original material/image/node payloads.
// Meshoptimizer 1.3.0 only selects original vertices, never relocates a point.
// Components are exact-position connected within one primitive, never proximity
// welded across separate parts. Large skins, engines, glazing and cards stay intact.
// Coordinates below are original glTF mesh-local axes: X span, Y longitudinal,
// Z down. Protect both forward propeller hubs (|X| near 2.65, Y > 5.15) and small
// dorsal aerial parts (near X=0, Z < -2.3), where lower budgets distorted UVs.
// Formal relative per-part error is 0.05; this is not a whole-aircraft tolerance.
import fs from "node:fs";
import { MeshoptSimplifier as M } from "meshoptimizer";
await M.ready;
const input = process.argv[2],
  output = process.argv[3],
  error = Number(process.argv[4] || ".05");
const bytes = fs.readFileSync(input),
  n = bytes.readUInt32LE(12),
  g = JSON.parse(bytes.subarray(20, 20 + n)),
  bin = bytes.subarray(28 + n);
const View = (i) => {
  let v = g.bufferViews[i];
  return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
};
const chunks = g.bufferViews.map((_, i) => View(i));
function ReadAccessor(i) {
  let a = g.accessors[i],
    v = g.bufferViews[a.bufferView],
    w = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type],
    dt = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[
      a.componentType
    ],
    copy = Uint8Array.from(
      View(a.bufferView).subarray(
        a.byteOffset || 0,
        (a.byteOffset || 0) + a.count * w * dt.BYTES_PER_ELEMENT,
      ),
    );
  return new dt(copy.buffer);
}
const report = [];
for (const p of g.meshes[0].primitives) {
  let mat = g.materials[p.material];
  if ((mat.alphaMode || "OPAQUE") !== "OPAQUE" || p.material === 3) continue;
  let pos = ReadAccessor(p.attributes.POSITION),
    uv = ReadAccessor(p.attributes.TEXCOORD_0),
    norm = ReadAccessor(p.attributes.NORMAL),
    ix = Uint32Array.from(ReadAccessor(p.indices)),
    count = pos.length / 3;
  let posIds = new Map(),
    ids = new Uint32Array(count),
    parent = [];
  for (let i = 0; i < count; i++) {
    let k = pos.slice(i * 3, i * 3 + 3).join(",");
    if (!posIds.has(k)) {
      posIds.set(k, parent.length);
      parent.push(parent.length);
    }
    ids[i] = posIds.get(k);
  }
  function Root(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  for (let i = 0; i < ix.length; i += 3) {
    let r = Root(ids[ix[i]]);
    parent[Root(ids[ix[i + 1]])] = r;
    parent[Root(ids[ix[i + 2]])] = r;
  }
  let parts = new Map();
  for (let i = 0; i < ix.length; i += 3) {
    let r = Root(ids[ix[i]]);
    if (!parts.has(r)) parts.set(r, []);
    parts.get(r).push(ix[i], ix[i + 1], ix[i + 2]);
  }
  let final = [],
    partReport = [];
  for (let [id, index] of parts) {
    let uniques = [...new Set(index)],
      mins = [Infinity, Infinity, Infinity],
      maxs = [-Infinity, -Infinity, -Infinity];
    for (let i of uniques)
      for (let j = 0; j < 3; j++) {
        mins[j] = Math.min(mins[j], pos[i * 3 + j]);
        maxs[j] = Math.max(maxs[j], pos[i * 3 + j]);
      }
    let dims = maxs.map((v, i) => v - mins[i]);
    let centerX = (mins[0] + maxs[0]) / 2;
    let engineFront =
      p.material === 1 &&
      Math.abs(Math.abs(centerX) - 2.65) < 0.8 &&
      maxs[1] > 5.2 &&
      mins[1] > 5.15;
    let upperAerial =
      p.material === 1 &&
      Math.abs(centerX) < 0.5 &&
      mins[2] < -2.3 &&
      maxs[1] > 1.5 &&
      mins[1] > 0 &&
      Math.max(...dims) < 0.8;
    let preserve =
      engineFront ||
      upperAerial ||
      index.length / 3 >= 500 ||
      Math.max(...dims) > 2 ||
      index.length <= 36;
    if (preserve) {
      final.push(...index);
      partReport.push({
        id,
        triangles: index.length / 3,
        preserved: true,
        engineFront,
        upperAerial,
        dimensions: dims,
      });
      continue;
    }
    let map = new Map(uniques.map((v, i) => [v, i])),
      localPos = new Float32Array(uniques.length * 3),
      attrs = new Float32Array(uniques.length * 5),
      locks = new Uint8Array(uniques.length);
    for (let [v, i] of map) {
      localPos.set(pos.slice(v * 3, v * 3 + 3), i * 3);
      attrs.set(
        [uv[v * 2], uv[v * 2 + 1], ...norm.slice(v * 3, v * 3 + 3)],
        i * 5,
      );
      for (let j = 0; j < 3; j++)
        if (
          dims[j] > 1e-7 &&
          (pos[v * 3 + j] === mins[j] || pos[v * 3 + j] === maxs[j])
        )
          locks[i] = 1;
    }
    let [out, e] = M.simplifyWithAttributes(
      Uint32Array.from(index.map((i) => map.get(i))),
      localPos,
      3,
      attrs,
      5,
      [0.5, 0.5, 0.05, 0.05, 0.05],
      locks,
      Math.floor((index.length * 0.25) / 3) * 3,
      error,
      ["Permissive", "PreserveFolds"],
    );
    final.push(...out.map((i) => uniques[i]));
    partReport.push({
      id,
      sourceTriangles: index.length / 3,
      triangles: out.length / 3,
      error: e,
      preserved: false,
      dimensions: dims,
    });
  }
  let out = Uint32Array.from(final),
    [remap, size] = M.compactMesh(out);
  for (let [semantic, old, w] of [
    ["POSITION", pos, 3],
    ["NORMAL", norm, 3],
    ["TEXCOORD_0", uv, 2],
  ]) {
    let array = new Float32Array(size * w);
    for (let i = 0; i < remap.length; i++)
      if (remap[i] !== 0xffffffff)
        for (let j = 0; j < w; j++) array[remap[i] * w + j] = old[i * w + j];
    let a = g.accessors[p.attributes[semantic]];
    a.count = size;
    a.byteOffset = 0;
    chunks[a.bufferView] = Buffer.from(array.buffer);
    delete g.bufferViews[a.bufferView].byteStride;
  }
  let a = g.accessors[p.indices];
  a.componentType = size < 65536 ? 5123 : 5125;
  a.count = out.length;
  a.byteOffset = 0;
  chunks[a.bufferView] = Buffer.from(
    (size < 65536 ? Uint16Array.from(out) : out).buffer,
  );
  delete g.bufferViews[a.bufferView].byteStride;
  report.push({
    material: p.material,
    sourceTriangles: ix.length / 3,
    triangles: out.length / 3,
    sourceVertices: count,
    vertices: size,
    parts: partReport,
  });
}
let offset = 0;
const blocks = chunks.map((c, i) => {
  g.bufferViews[i].byteOffset = offset;
  g.bufferViews[i].byteLength = c.length;
  let b = Buffer.alloc(Math.ceil(c.length / 4) * 4);
  c.copy(b);
  offset += b.length;
  return b;
});
g.buffers[0].byteLength = offset;
let j = Buffer.from(JSON.stringify(g)),
  jp = Buffer.alloc(Math.ceil(j.length / 4) * 4, 32);
j.copy(jp);
let out = Buffer.alloc(28 + jp.length + offset);
out.writeUInt32LE(0x46546c67, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(out.length, 8);
out.writeUInt32LE(jp.length, 12);
out.writeUInt32LE(0x4e4f534a, 16);
jp.copy(out, 20);
out.writeUInt32LE(offset, 20 + jp.length);
out.writeUInt32LE(0x004e4942, 24 + jp.length);
Buffer.concat(blocks).copy(out, 28 + jp.length);
fs.writeFileSync(output, out);
fs.writeFileSync(output + ".json", JSON.stringify(report, null, 2));
console.log(
  report.map((r) => ({
    material: r.material,
    sourceTriangles: r.sourceTriangles,
    triangles: r.triangles,
    vertices: r.vertices,
    parts: r.parts.length,
  })),
);
