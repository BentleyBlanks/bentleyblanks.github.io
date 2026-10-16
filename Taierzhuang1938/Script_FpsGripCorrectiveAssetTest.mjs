// Inspect the shipped asset, independently of Blender's append/mapping code.
// The reviewed pre-corrective GLB remains recoverable through the manifest's Git object.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LoadGlb, ReadAccessor, ReadAccessorInt } from "./_import/Script_LugouGlbPose.mjs";
import { UndoFpsHandSkinWeightRepair } from "./Script_FpsHandSkinWeightsTest.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const Hash = value => createHash("sha256").update(value).digest("hex");
const Normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const Canonical = value => value && typeof value === "object"
  ? Array.isArray(value) ? value.map(Canonical)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, Canonical(value[key])]))
  : value;

export function ProtectedDocumentHash(document, manifest) {
  const doc = structuredClone(document), basis = manifest.basis;
  const materials = new Set(manifest.correctives.map(item => item.material));
  const allowed = new Set();
  doc.meshes.forEach((mesh, index) => {
    if (!mesh.primitives.some(p => materials.has(doc.materials[p.material]?.name))) return;
    allowed.add(index);
    delete mesh.weights;
    if (mesh.extras) {
      delete mesh.extras.targetNames;
      if (!Object.keys(mesh.extras).length) delete mesh.extras;
    }
    for (const primitive of mesh.primitives) delete primitive.targets;
  });
  for (const node of doc.nodes) if (allowed.has(node.mesh)) delete node.weights;
  doc.accessors = doc.accessors.slice(0, basis.accessors);
  doc.bufferViews = doc.bufferViews.slice(0, basis.bufferViews);
  doc.buffers[0].byteLength = basis.binaryBytes;
  return Hash(JSON.stringify(Canonical(doc)));
}

function ArchivedBasis(manifest) {
  const explicit = process.argv.find(arg => arg.startsWith("--basis="))?.slice(8);
  if (explicit) return fs.readFileSync(path.resolve(explicit));
  const { commit, path: assetPath } = manifest.basis.git;
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.ok(!assetPath.startsWith("-") && !assetPath.includes(".."));
  const result = spawnSync("git", ["show", `${commit}:${assetPath}`], {
    cwd: path.resolve(project, ".."), windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  });
  // Shallow CI checkouts may omit this historical object. The frozen prefix and
  // protected-document hashes still verify every original byte/interpretation.
  return result.status === 0 ? result.stdout : null;
}

export function AuditAsset(bytes, manifest, archivedBytes = null) {
  // Weight repair is a separate reviewed layer. It must reverse to the exact
  // original asset before the retained-prefix/morph audit is allowed to run.
  if(manifest.skinWeightRepair)bytes=UndoFpsHandSkinWeightRepair(bytes,
    JSON.parse(fs.readFileSync(path.join(project,manifest.skinWeightRepair))));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, "FPS asset is GLB");
  assert.equal(bytes.readUInt32LE(4), 2, "FPS asset is glTF 2");
  assert.equal(bytes.readUInt32LE(8), bytes.length, "GLB declared length");
  const glb = LoadGlb(bytes), doc = glb.json, basis = manifest.basis;
  assert.ok(glb.bin && doc.buffers.length === 1 && !doc.buffers[0].uri, "one embedded binary buffer");
  assert.equal(doc.buffers[0].byteLength, glb.bin.length, "complete embedded buffer");
  assert.ok(glb.bin.length > basis.binaryBytes, "morph data follows the retained basis");
  assert.equal(Hash(glb.bin.subarray(0, basis.binaryBytes)), basis.binarySha256,
    "every original geometry, skin, clothing, animation and image byte is retained");
  assert.equal(ProtectedDocumentHash(doc, manifest), basis.protectedDocumentSha256,
    "all original descriptors stay unchanged apart from explicit morph additions");
  for (let i = 0; i < basis.bufferViews; i++) {
    const view = doc.bufferViews[i];
    assert.equal(view.buffer, 0);
    assert.ok((view.byteOffset || 0) + view.byteLength <= basis.binaryBytes, `basis view ${i} remains in original prefix`);
  }
  if (archivedBytes) {
    assert.equal(Hash(archivedBytes), basis.sha256, "reviewed pre-corrective GLB archive");
    const archived = LoadGlb(archivedBytes);
    assert.equal(archived.bin.length, basis.binaryBytes);
    assert.ok(archived.bin.equals(glb.bin.subarray(0, basis.binaryBytes)), "original binary prefix compares byte for byte");
    assert.equal(ProtectedDocumentHash(archived.json, manifest), basis.protectedDocumentSha256);
  }

  const observed = [], results = [];
  for (const [meshIndex, mesh] of doc.meshes.entries()) {
    const names = mesh.extras?.targetNames || [];
    const hasTargets = mesh.primitives.some(p => p.targets?.length);
    if (!hasTargets) {
      assert.equal(names.length, 0, `${mesh.name}: no unregistered morph names`);
      continue;
    }
    assert.equal(mesh.primitives.length, 1, "reviewed corrective mesh has one primitive");
    const primitive = mesh.primitives[0], targets = primitive.targets;
    assert.equal(names.length, targets.length, "target names/count match");
    assert.deepEqual(mesh.weights, targets.map(() => 0), "all asset morph defaults are disabled");
    const nodes = doc.nodes.filter(node => node.mesh === meshIndex);
    assert.ok(nodes.length && nodes.every(node => node.skin !== undefined), "correctives remain on the actual skinned mesh");
    for (const node of nodes) if (node.weights) assert.deepEqual(node.weights, targets.map(() => 0), "instance morph defaults are disabled");
    const joints = ReadAccessorInt(glb, primitive.attributes.JOINTS_0);
    const weights = ReadAccessor(glb, primitive.attributes.WEIGHTS_0);
    const vertexCount = doc.accessors[primitive.attributes.POSITION].count;
    assert.equal(joints.width, 4); assert.equal(weights.width, 4);
    assert.equal(joints.count, vertexCount); assert.equal(weights.count, vertexCount);
    const skin = doc.skins[nodes[0].skin];
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      const name = names[targetIndex], spec = manifest.correctives.find(row => row.name === name);
      assert.ok(spec, `unreviewed morph target ${name}`);
      assert.equal(doc.materials[primitive.material]?.name, spec.material);
      assert.equal(vertexCount, spec.vertexCount);
      assert.equal(targetIndex, spec.targetIndex);
      assert.deepEqual(Object.keys(targets[targetIndex]).sort(), ["NORMAL", "POSITION", "TANGENT"], `${name}: complete Blender morph channels`);
      const channels = {};
      for (const semantic of ["POSITION", "NORMAL", "TANGENT"]) {
        const accessorIndex = targets[targetIndex][semantic], accessor = doc.accessors[accessorIndex];
        assert.ok(accessorIndex >= basis.accessors && accessor, `${name}/${semantic}: appended accessor`);
        assert.equal(accessor.componentType, 5126); assert.equal(accessor.type, "VEC3");
        assert.equal(accessor.count, vertexCount); assert.ok(!accessor.sparse && !accessor.normalized);
        const view = doc.bufferViews[accessor.bufferView];
        assert.ok(accessor.bufferView >= basis.bufferViews && (view.byteOffset || 0) >= basis.binaryBytes,
          `${name}/${semantic}: appended buffer view`);
        assert.equal(view.buffer, 0); assert.equal(view.byteStride || 12, 12);
        assert.equal((accessor.byteOffset || 0) + vertexCount * 12, view.byteLength);
        assert.ok((view.byteOffset || 0) + view.byteLength <= glb.bin.length);
        const values = ReadAccessor(glb, accessorIndex).data;
        assert.equal(values.length, vertexCount * 3);
        for (const value of values) assert.ok(Number.isFinite(value), `${name}/${semantic}: finite components`);
        const begin = (view.byteOffset || 0) + (accessor.byteOffset || 0);
        assert.equal(Hash(glb.bin.subarray(begin, begin + vertexCount * 12)), spec.targetSha256[semantic], `${name}/${semantic}: reviewed Blender output`);
        channels[semantic] = values;
      }
      let changed = 0, maximum = 0;
      for (let i = 0; i < vertexCount; i++) {
        const length = Math.hypot(...channels.POSITION.subarray(i * 3, i * 3 + 3));
        maximum = Math.max(maximum, length);
        assert.ok(length <= spec.maxBindDelta, `${name}: bounded bind-space displacement at ${i}`);
        if (length <= spec.positionZeroTolerance) continue;
        changed++;
        let sideWeight = 0, total = 0;
        for (let k = 0; k < 4; k++) {
          const weight = weights.data[i * 4 + k], joint = joints.data[i * 4 + k];
          assert.ok(Number.isFinite(weight) && weight >= 0 && joint < skin.joints.length);
          total += weight;
          const bone = Normalize(doc.nodes[skin.joints[joint]]?.name);
          if (bone.endsWith(`${spec.side}hand`) || new RegExp(`${spec.side}finger\\d[12]?$`).test(bone)) sideWeight += weight;
        }
        assert.ok(total > 0 && sideWeight / total >= spec.minimumHandWeight,
          `${name}: POSITION delta ${i} belongs only to the authored ${spec.side} hand/fingers`);
      }
      assert.ok(changed > 0 && changed <= spec.maximumChangedVertices, `${name}: meaningful, localized POSITION correction`);
      observed.push(name); results.push({ name, changed, maximumBindDelta: maximum });
    }
  }
  assert.deepEqual(observed, manifest.correctives.map(row => row.name), "only registered corrective shapes are present");
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(project, "Model/Data_FpsGripCorrectives.json")));
  const results = AuditAsset(fs.readFileSync(path.join(project, manifest.asset)), manifest, ArchivedBasis(manifest));
  console.log(`PASS FpsGripCorrectiveAsset: ${manifest.basis.binaryBytes} original bytes ${manifest.skinWeightRepair?'verified after exact weight-repair restoration':'retained'}; ${results.map(r => `${r.name}: ${r.changed} localized vertices, bind max ${r.maximumBindDelta.toFixed(6)}`).join("; ")}`);
}
