// Binary-contract test for the two imported GLBs. No WebGL or DOM required.

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
assert.ok((soldier.skins || []).length >= 1, "IJA source skin remains in GLB");
assert.ok((soldier.textures || []).length >= 1, "IJA uniform texture remains in GLB");
for (const bone of ["Hips", "Spine2", "Head", "LeftHand", "RightFoot"])
  assert.ok(soldierNames.has(bone), `IJA Humanoid bone ${bone}`);
for (const clip of ["Idle", "Walk", "AimRifle", "Death"])
  assert.ok(soldierAnimations.has(clip), `IJA animation ${clip}`);
for (const segment of ["Segment_chest", "Segment_neck", "Segment_armL", "Segment_foreR",
  "Segment_thighL", "Segment_shinR", "Segment_footL"])
  assert.ok(soldierNames.has(segment), `IJA compatibility segment ${segment}`);

console.log(`ok   FPS arms: ${arms.skins.length} skin, ${armNames.size} nodes, ${arms.animations.length} animation`);
console.log(`ok   IJA soldier: ${soldier.skins.length} skin, ${soldierNames.size} nodes, ${soldier.animations.length} animations`);
