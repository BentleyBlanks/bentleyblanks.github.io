// 第一人称国军骨骼双臂的 GLB 二进制契约（纯 Node，不需要 WebGL / DOM）。
//
// 这条闸专门防止 2026-08-29 那种“为了修手位，把 skin 和 animation 全应用掉”
// 的回退：模型看起来还叫 arms，实际上已经只剩两块静态网格，运行时无骨可解 IK。

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

function Normalize(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function Names(doc) { return new Set((doc.nodes || []).map((node) => Normalize(node.name)).filter(Boolean)); }
function Animations(doc) { return new Set((doc.animations || []).map((clip) => clip.name).filter(Boolean)); }

const name = "Model_FpsArmsNraSkeletal01.glb";
const arms = ReadGlb(name);
const armNames = Names(arms);
const animations = Animations(arms);
const profileClips = ["AdvanceFire", "MachineGunFire", "PistolFire", "RifleIdle", "AttackCommand"];

assert.equal((arms.skins || []).length, 1, "FPS arms preserve one runtime skin");
assert.equal((arms.meshes || []).length >= 1, true, "FPS arms preserve skinned uniform/hand geometry");
assert.equal((arms.textures || []).length >= 1, true, "FPS arms keep their authored textures");
assert.equal((arms.animations || []).length >= profileClips.length, true, "FPS arms preserve source motion clips");
for (const clip of profileClips) assert.ok(animations.has(clip), `FPS grip profile keeps ${clip}`);

for (const side of ["r", "l"]) {
  for (const suffix of ["clavicle", "upperarm", "forearm", "hand"]) {
    const wanted = `${side}${suffix}`;
    assert.ok([...armNames].some((node) => node.endsWith(wanted)), `FPS arm bone ${wanted}`);
  }
  for (let finger = 0; finger <= 4; finger += 1) {
    for (const segment of ["", "1", "2"]) {
      const wanted = `${side}finger${finger}${segment}`;
      assert.ok([...armNames].some((node) => node.endsWith(wanted)), `FPS finger bone ${wanted}`);
    }
  }
}

const skinnedPrimitives = (arms.meshes || []).flatMap((mesh) => mesh.primitives || [])
  .filter((primitive) => primitive.attributes?.JOINTS_0 != null || primitive.attributes?.WEIGHTS_0 != null);
assert.equal(skinnedPrimitives.length >= 1, true, "FPS geometry exposes joint/weight attributes");
for (const primitive of skinnedPrimitives) {
  assert.notEqual(primitive.attributes.JOINTS_0, undefined, "skinned primitive has JOINTS_0");
  assert.notEqual(primitive.attributes.WEIGHTS_0, undefined, "skinned primitive has WEIGHTS_0");
  const position = arms.accessors?.[primitive.attributes.POSITION];
  assert.ok(position?.min && position?.max, "skinned primitive exposes authored bounds");
  assert.ok(position.min[1] >= 1.30 && position.max[1] <= 1.56,
    `FPS arm crop excludes torso remnants (${position.min[1]}..${position.max[1]} m high)`);
}

const armatureNode = (arms.nodes || []).find((node) => node.extras?.fpsArmSource === "Model_LugouNra01");
assert.ok(armatureNode, "FPS armature identifies its audited source");
assert.equal(armatureNode.extras.fpsArmInfluenceMinimum, 0.5,
  "FPS crop keeps only vertices owned at least 50% by arm chains");

const jointCount = new Set((arms.skins || []).flatMap((skin) => skin.joints || [])).size;
assert.equal(jointCount >= 45, true, `FPS arms keep a full upper-body/finger skeleton (${jointCount} joints)`);

const rigNode = (arms.nodes || []).find((node) => node.name === "Rig_FpsArmsNraSkeletal01");
assert.ok(rigNode, "FPS armature adapter node exists");
const adapterScale = rigNode.scale || [1, 1, 1];
assert.ok(adapterScale.every((value) => value > 0), "armature adapter has no negative scale");
assert.ok(Math.max(...adapterScale) - Math.min(...adapterScale) < 1e-5,
  `armature adapter is uniform (${adapterScale.join(", ")})`);
const jointIndices = new Set((arms.skins || []).flatMap((skin) => skin.joints || []));
for (const index of jointIndices) {
  const node = arms.nodes[index];
  const scale = node.scale || [1, 1, 1];
  assert.ok(scale.every((value) => Math.abs(value - 1) < 1e-5),
    `${node.name || index}: runtime joint node uses unit scale`);
  if (!node.matrix) continue;
  const x = [node.matrix[0], node.matrix[1], node.matrix[2]];
  const y = [node.matrix[4], node.matrix[5], node.matrix[6]];
  const z = [node.matrix[8], node.matrix[9], node.matrix[10]];
  const Dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const Length = (a) => Math.sqrt(Dot(a, a));
  assert.ok(Math.abs(Dot(x, y)) < 1e-5 && Math.abs(Dot(x, z)) < 1e-5 && Math.abs(Dot(y, z)) < 1e-5,
    `${node.name || index}: joint basis has no shear`);
  assert.ok(Length(x) > 0 && Length(y) > 0 && Length(z) > 0, `${node.name || index}: joint basis is non-degenerate`);
}

assert.equal(rigNode.extras?.fpsRigContract, "uniform-adapter-unit-joints-arm-only-anatomy-v4",
  "GLB records the reproducible anatomy transform contract");
assert.equal(rigNode.extras?.fpsArmOnlyWeights, true,
  "GLB records that hidden torso/spine influences were removed from the viewmodel skin");

console.log(`ok   NRA01 skeletal FPS arms: ${arms.meshes.length} mesh, ${jointCount} unit joints, ${animations.size} animations, adapter ×${adapterScale[0]}`);
