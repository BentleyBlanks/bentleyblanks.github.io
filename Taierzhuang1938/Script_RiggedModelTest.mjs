// Binary-contract test for the imported character GLBs. No WebGL or DOM required.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function ReadGlb(name) {
  const bytes = fs.readFileSync(path.join(root, "Model", name));
  assert.equal(bytes.toString("ascii", 0, 4), "glTF", `${name}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${name}: glTF 2`);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4E4F534A) {
      return JSON.parse(bytes.toString("utf8", offset + 8, offset + 8 + length).trimEnd());
    }
    offset += 8 + length;
  }
  throw new Error(`${name}: missing JSON chunk`);
}

function Names(doc) { return new Set((doc.nodes || []).map((node) => node.name).filter(Boolean)); }
function Animations(doc) { return new Set((doc.animations || []).map((clip) => clip.name).filter(Boolean)); }

function AssertOpaqueMaterials(doc, label) {
  for (const material of doc.materials || []) {
    const alpha = material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1;
    assert.equal(alpha, 1, `${label} material ${material.name} has translucent base color`);
    assert.equal(material.alphaMode ?? "OPAQUE", "OPAQUE",
      `${label} material ${material.name} must not use ${material.alphaMode}`);
  }
}

function SegmentBounds(doc, name) {
  const node = (doc.nodes || []).find((candidate) => candidate.name === name);
  assert.ok(node, `missing ${name}`);
  const meshNodes = [node, ...(node.children || []).map((index) => doc.nodes[index])]
    .filter((candidate) => candidate && candidate.mesh !== undefined);
  const bounds = meshNodes.flatMap((meshNode) => doc.meshes[meshNode.mesh].primitives)
    .map((primitive) => doc.accessors[primitive.attributes.POSITION]);
  return {
    min: [0, 1, 2].map((axis) => Math.min(...bounds.map((bound) => bound.min[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...bounds.map((bound) => bound.max[axis]))),
  };
}

function AssertHumanHead(doc, label, height) {
  const bounds = SegmentBounds(doc, "Segment_neck");
  const halfWidth = Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0]));
  const halfDepth = Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]));
  assert.ok(halfWidth <= height * 0.055, `${label} head is too wide: ${(halfWidth * 2).toFixed(3)} m`);
  assert.ok(bounds.max[1] <= height * 0.146, `${label} head is too tall above neck: ${bounds.max[1].toFixed(3)} m`);
  assert.ok(halfDepth <= height * 0.071, `${label} head is too deep: ${(halfDepth * 2).toFixed(3)} m`);
}

const arms = ReadGlb("Model_FpsArms.glb");
const armNames = Names(arms);
assert.ok((arms.skins || []).length >= 1, "FPS arms keep a skin");
assert.ok((arms.textures || []).length >= 1, "FPS arms keep an albedo texture");
for (const bone of ["shoulder.r", "bicep.r", "forearm.r", "wrist.r", "finger_index3.r",
  "shoulder.l", "wrist.l", "finger_thumb3.l"]) assert.ok(armNames.has(bone), `FPS arm bone ${bone}`);
assert.ok(Animations(arms).has("GripIdle"), "FPS arms include GripIdle");

const soldier = ReadGlb("Model_IjaSoldier.glb");
const soldierNames = Names(soldier);
const soldierAnimations = Animations(soldier);
AssertOpaqueMaterials(soldier, "IJA soldier");
assert.ok((soldier.skins || []).length >= 1, "IJA source skin remains in GLB");
assert.ok((soldier.textures || []).length >= 1, "IJA uniform texture remains in GLB");
for (const bone of ["Hips", "Spine2", "Head", "LeftHand", "RightFoot"])
  assert.ok(soldierNames.has(bone), `IJA Humanoid bone ${bone}`);
for (const clip of ["Idle", "Walk", "AimRifle", "Death"])
  assert.ok(soldierAnimations.has(clip), `IJA animation ${clip}`);
// Each compatibility segment is independently parented to the old gameplay
// rig. Keep this exhaustive: a missing limb silently falls back to a detached
// or invisible procedural piece at runtime.
for (const segment of ["Segment_hips", "Segment_chest", "Segment_neck",
  "Segment_armL", "Segment_foreL", "Segment_armR", "Segment_foreR",
  "Segment_thighL", "Segment_shinL", "Segment_footL",
  "Segment_thighR", "Segment_shinR", "Segment_footR"])
  assert.ok(soldierNames.has(segment), `IJA compatibility segment ${segment}`);
AssertHumanHead(soldier, "IJA soldier", 1.62);
const helmet = SegmentBounds(soldier, "Segment_neck_HelmetBrim");
assert.ok(helmet.max[0] - helmet.min[0] <= 1.62 * 0.135,
  `IJA helmet is too wide: ${(helmet.max[0] - helmet.min[0]).toFixed(3)} m`);
assert.ok(helmet.min[1] >= 1.62 * 0.055,
  `IJA helmet brim is too low over the face: ${helmet.min[1].toFixed(3)} m above neck`);
const ijaChest = SegmentBounds(soldier, "Segment_chest");
assert.ok(ijaChest.max[0] - ijaChest.min[0] <= 0.60,
  `IJA chest includes detached outliers: ${(ijaChest.max[0] - ijaChest.min[0]).toFixed(3)} m wide`);
for (const moustache of ["Segment_neck_MoustacheL", "Segment_neck_MoustacheR"])
  assert.ok(soldierNames.has(moustache), `IJA optional moustache ${moustache}`);

console.log(`ok   FPS arms: ${arms.skins.length} skin, ${armNames.size} nodes, ${arms.animations.length} animation`);
console.log(`ok   IJA soldier: ${soldier.skins.length} skin, ${soldierNames.size} nodes, ${soldier.animations.length} animations`);

for (const [file, label] of [
  ["Model_NraSoldier.glb", "NRA soldier"],
  ["Model_CivilianMale.glb", "civilian male"],
  ["Model_CivilianFemale.glb", "civilian female"],
]) {
  const character = ReadGlb(file);
  const names = Names(character);
  AssertOpaqueMaterials(character, label);
  assert.ok((character.meshes || []).length >= 13, `${label} keeps visible meshes`);
  for (const segment of ["Segment_hips", "Segment_chest", "Segment_neck", "Segment_armL",
    "Segment_foreR", "Segment_thighL", "Segment_shinR", "Segment_footL"])
    assert.ok(names.has(segment), `${label} compatibility segment ${segment}`);
  const height = file === "Model_NraSoldier.glb" ? 1.66 : 1.60;
  AssertHumanHead(character, label, height);
  console.log(`ok   ${label}: ${character.meshes.length} meshes, ${names.size} nodes`);
}
