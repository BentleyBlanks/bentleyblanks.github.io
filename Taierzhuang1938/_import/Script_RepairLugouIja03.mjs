// Repair the Ija03 FBX bridge metadata without re-exporting geometry or animation.
// Usage: node Taierzhuang1938/_import/Script_RepairLugouIja03.mjs [character-directory]
// Run after a fresh Lugou bake as well; the operation is idempotent.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";
import { PythonJson } from "./Script_LugouManifestJson.mjs";
import { LoadGlb, SerializeGlb } from "./Script_LugouGlbPose.mjs";

export function RepairLugouIja03(glb) {
  const { json } = glb;
  const headMesh = json.meshes[json.nodes.find(node => node.name === "Sphere002")?.mesh];
  assert.ok(headMesh, "expected Ija03 body mesh");
  const face = json.materials.find(material => material.name === "Material #26");
  assert.ok(face && headMesh.primitives.some(primitive => json.materials[primitive.material] === face),
    "expected Ija03 face material on the body");
  // The source diffuse image has a non-opacity alpha channel (0..185).
  // BLEND made the whole head translucent and disabled GLTFLoader depthWrite.
  // Keep the image RGB, normal map and UVs, but render skin as an opaque surface.
  face.alphaMode = "OPAQUE";

  const nodes = json.nodes;
  const helmetIndex = nodes.findIndex(node => node.name === "Object005");
  const chestIndex = nodes.findIndex(node => String(node.name || "").replaceAll("_", " ") === "Bip001 Spine2");
  assert.ok(helmetIndex >= 0 && chestIndex >= 0, "expected carried helmet and chest bone");
  const helmet = nodes[helmetIndex];
  assert.ok(helmet.mesh !== undefined && helmet.skin === undefined, "carried helmet is a rigid mesh");
  assert.ok(!json.animations.some(animation => animation.channels.some(channel => channel.target.node === helmetIndex)),
    "helmet has no independent animation to retarget");
  const parents = new Map();
  nodes.forEach((node, index) => (node.children || []).forEach(child => parents.set(child, index)));
  if (parents.get(helmetIndex) !== chestIndex) {
    const World = index => {
      const node = nodes[index];
      const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
        new Vector3().fromArray(node.translation || [0, 0, 0]),
        new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
        new Vector3().fromArray(node.scale || [1, 1, 1]));
      return parents.has(index) ? World(parents.get(index)).multiply(local) : local;
    };
    const restWorld = World(helmetIndex);
    const chestWorld = World(chestIndex);
    const local = chestWorld.clone().invert().multiply(restWorld);
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    local.decompose(position, rotation, scale);
    const restored = chestWorld.clone().multiply(new Matrix4().compose(position, rotation, scale));
    assert.ok(restored.elements.every((value, index) => Math.abs(value - restWorld.elements[index]) < 1e-6),
      "TRS reparent preserves the authored backpack location without shear");
    // The field cap is already skinned to Head. Object005 is the spare steel helmet
    // on the backpack: measured rest centre (-.009, 1.344, -.261) metres.
    // The nearest backpack vertices are weighted to Spine2 / Spine1, not Head.
    for (const node of nodes) if (node.children) node.children = node.children.filter(child => child !== helmetIndex);
    for (const scene of json.scenes) scene.nodes = scene.nodes.filter(index => index !== helmetIndex);
    (nodes[chestIndex].children ||= []).push(helmetIndex);
    delete helmet.matrix;
    helmet.translation = position.toArray();
    helmet.rotation = rotation.toArray();
    helmet.scale = scale.toArray();
  }
  return SerializeGlb(json, glb.bin);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "../Model/Character"));
  const modelPath = path.join(directory, "Model_LugouIja03.glb");
  const before = LoadGlb(modelPath);
  const repaired = RepairLugouIja03(before);
  assert.deepEqual(LoadGlb(repaired).bin, before.bin, "geometry, textures, skin weights and all animation bytes are unchanged");
  if (!repaired.equals(before.buffer)) fs.writeFileSync(modelPath, repaired);
  const manifestPath = path.join(directory, "Data_LugouCharacterManifest.json");
  if (fs.existsSync(manifestPath)) {
    const original = fs.readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n");
    const manifest = JSON.parse(original);
    assert.ok(PythonJson(manifest) === original.trimEnd(), "manifest serializer round-trip");
    manifest.models.find(model => model.id === "LugouIja03").bytes = repaired.length;
    fs.writeFileSync(manifestPath, PythonJson(manifest) + original.slice(original.trimEnd().length));
  }
  console.log("LugouIja03 repaired: opaque face, backpack helmet follows Spine2; binary payload preserved");
}
