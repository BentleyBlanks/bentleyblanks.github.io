// Geometry-only aircraft regression gate. The audit records the retained source
// and the independently reviewed candidate; update it only after a new visual review.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { LoadGlb, ReadAccessor, ReadAccessorInt } from "./_import/Script_LugouGlbPose.mjs";
import { AIRCRAFT_ASSETS, NoseYaw } from "./Data_AircraftAssets.mjs";
const project = import.meta.dirname;
const audit = JSON.parse(fs.readFileSync(path.join(project, "Model/Data_AircraftGeometryAudit.json")));
const Hash = value => crypto.createHash("sha256").update(value).digest("hex");
const Bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
for (const record of audit.models) {
  const glb = LoadGlb(path.join(project, record.file)), doc = glb.json;
  assert.equal(Hash(glb.buffer), record.optimized.sha256, `${record.id}: reviewed candidate hash`);
  assert.equal(glb.buffer.length, record.optimized.bytes);
  const metadata = Object.fromEntries(record.metadataKeys.map(key => [key, doc[key] ?? null]));
  assert.equal(Hash(JSON.stringify(metadata)), record.metadataSha256, `${record.id}: nodes/materials/samplers unchanged`);
  assert.equal(doc.materials.length, record.source.materials);
  assert.equal(doc.images.length, record.images.length);
  doc.images.forEach((image, i) => {
    const view = doc.bufferViews[image.bufferView];
    assert.equal(image.mimeType, record.images[i].mimeType);
    assert.equal(Hash(glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)), record.images[i].sha256, `${record.id}: image ${i} remains byte-identical`);
  });
  let triangles = 0, vertices = 0, primitiveIndex = 0;
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    const expected = record.primitives[primitiveIndex++];
    const positions = ReadAccessor(glb, primitive.attributes.POSITION).data;
    const normals = ReadAccessor(glb, primitive.attributes.NORMAL).data;
    const uv = ReadAccessor(glb, primitive.attributes.TEXCOORD_0).data;
    const indices = ReadAccessorInt(glb, primitive.indices).data;
    assert.equal(primitive.material, expected.material);
    assert.equal(indices.length % 3, 0);
    assert.equal(normals.length, positions.length);
    assert.equal(uv.length, positions.length / 3 * 2);
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      assert.ok(Number.isFinite(positions[i]) && Number.isFinite(normals[i]));
      mins[i % 3] = Math.min(mins[i % 3], positions[i]);
      maxs[i % 3] = Math.max(maxs[i % 3], positions[i]);
    }
    for (const value of uv) assert.ok(Number.isFinite(value));
    for (let i = 0; i < normals.length; i += 3) assert.ok(Math.abs(Math.hypot(...normals.subarray(i, i + 3)) - 1) < 0.0001);
    assert.deepEqual([mins, maxs], expected.sourceBounds, `${record.id}: primitive ${primitiveIndex - 1} exact source bounds`);
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.subarray(i, i + 3);
      assert.ok(a < positions.length / 3 && b < positions.length / 3 && c < positions.length / 3);
      const u = [0, 1, 2].map(k => positions[b * 3 + k] - positions[a * 3 + k]);
      const v = [0, 1, 2].map(k => positions[c * 3 + k] - positions[a * 3 + k]);
      assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) > 0, `${record.id}: no degenerate triangles`);
    }
    if (expected.protectedHashes) for (const [semantic, hash] of Object.entries(expected.protectedHashes)) {
      const values = semantic === "indices" ? indices : ReadAccessor(glb, primitive.attributes[semantic]).data;
      assert.equal(Hash(Bytes(values)), hash, `${record.id}: protected ${semantic}`);
    }
    triangles += indices.length / 3;
    vertices += positions.length / 3;
  }
  assert.equal(primitiveIndex, record.source.primitives);
  assert.equal(triangles, record.optimized.triangles);
  assert.equal(vertices, record.optimized.vertices);
  assert.ok(triangles < record.source.triangles * 0.9, `${record.id}: meaningful actual triangle reduction`);
  const spec = AIRCRAFT_ASSETS.find(model => model.id === record.id);
  assert.deepEqual(spec.noseDir, { x: 0, z: 1 });
  assert.equal(NoseYaw(spec.noseDir), Math.PI);
  if (record.id === "MitsubishiKi30") assert.equal(spec.wingspanM, 14.55);
  console.log(`PASS ${record.id}: ${triangles} triangles, ${vertices} vertices; exact source bounds/images/protected geometry`);
}
