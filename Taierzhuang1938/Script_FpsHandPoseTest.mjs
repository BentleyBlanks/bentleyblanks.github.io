// CPU anatomical joint gate. Uses the production bind capture and finger solver;
// contact distances, skin weighting and visual quality remain separate checks.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { FPS_ARM_POSES, FPS_HAND_SHAPES } from "./Data_FpsArmPoses.mjs";
import { FPS_PACKET_RELOAD } from "./Data_Tuning_FpsReload.mjs";
import { CaptureAnatomy, ApplyAnatomicalFingers } from "./Script_FpsAnatomy.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const minimumFlexDeg = -5;
const maximumOffHingeDeg = 8;
const bytes = await fs.readFile(path.join(project, "Model", "Model_FpsHanYangHands.glb"));
assert.equal(bytes.readUInt32LE(0), 0x46546c67, "Actual FPS hand asset must be GLB");
let document = null;
for (let offset = 12; offset + 8 <= bytes.length;) {
  const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) document = JSON.parse(bytes.toString("utf8", offset + 8, offset + 8 + length));
  offset += length + 8;
}
assert(document?.nodes && document?.skins, "FPS hand GLB must retain its real skeleton");
const jointIds = new Set(document.skins.flatMap(skin => skin.joints));
const nodes = document.nodes.map((node, index) => {
  const object = jointIds.has(index) ? new THREE.Bone() : new THREE.Object3D();
  object.name = node.name || "";
  if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
  else {
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
  }
  return object;
});
document.nodes.forEach((node, index) => node.children?.forEach(child => nodes[index].add(nodes[child])));
const root = new THREE.Group();
for (const index of document.scenes[document.scene || 0].nodes) root.add(nodes[index]);
root.updateWorldMatrix(true, true);
const Normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const Find = suffix => {
  const object = nodes.find(node => Normalize(node.name).endsWith(suffix));
  assert(object?.isBone, "Missing real FPS bind bone: " + suffix);
  return object;
};
const rig = {
  root, bindPose: [], bones: {}, fingerBones: {},
  poseSpec: FPS_ARM_POSES.HanYang, poseState: { fire: 0, sprint: 0, reload: true },
  contactWeight: { r: 1, l: 1 }, operationPose: { r: null, l: null }, unarmed: false,
  _FingerRoot: (side, digit) => Find(side + "finger" + digit),
  _Restore(entries) {
    for (const entry of entries) {
      entry.object.position.copy(entry.position);
      entry.object.quaternion.copy(entry.quaternion);
      entry.object.scale.copy(entry.scale);
    }
  },
};
root.traverse(object => {
  if (object.isBone) rig.bindPose.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() });
});
for (const side of ["r", "l"]) {
  rig.bones[side] = { hand: Find(side + "hand"), forearm: Find(side + "forearm"), upperArm: Find(side + "upperarm") };
  rig.fingerBones[side] = [];
  for (let digit = 0; digit < 5; digit++) for (const segment of ["", "1", "2"])
    rig.fingerBones[side].push(Find(side + "finger" + digit + segment));
}
// Production captures this frame before Attach applies its .70 arm scale.
CaptureAnatomy(rig);
const ranges = new Map();
let sampledPoses = 0;
function Inspect(side, context) {
  for (const entry of rig.anatomy[side].curls) {
    const match = Normalize(entry.bone.name).match(/finger([0-4])([12]?)$/);
    assert(match, "Unrecognised finger bone: " + entry.bone.name);
    const digit = Number(match[1]), segment = Number(match[2] || 0), key = side + match[1] + (match[2] || "");
    const relative = entry.rest.clone().invert().multiply(entry.bone.quaternion).normalize();
    if (relative.w < 0) relative.set(-relative.x, -relative.y, -relative.z, -relative.w);
    const projection = new THREE.Vector3(relative.x, relative.y, relative.z).dot(entry.axis);
    const twist = new THREE.Quaternion(entry.axis.x * projection, entry.axis.y * projection, entry.axis.z * projection, relative.w);
    if (twist.lengthSq() < 1e-20) twist.identity(); else twist.normalize();
    const hingeFlexDeg = 2 * Math.atan2(new THREE.Vector3(twist.x, twist.y, twist.z).dot(entry.axis), twist.w) * 180 / Math.PI;
    const offHingeDeg = relative.clone().multiply(twist.clone().invert()).angleTo(new THREE.Quaternion()) * 180 / Math.PI;
    assert(Number.isFinite(hingeFlexDeg) && Number.isFinite(offHingeDeg), "Nonfinite joint rotation: " + key);
    assert(entry.bone.position.distanceTo(entry.position) < 1e-9, "Finger bone length changed: " + key);
    let range = ranges.get(key);
    if (!range) ranges.set(key, range = { side, digit, segment, checked: segment > 0, samples: 0,
      minFlexDeg: Infinity, maxFlexDeg: -Infinity, maxOffHingeDeg: 0, worstMinimum: null, worstOffHinge: null });
    range.samples++;
    if (hingeFlexDeg < range.minFlexDeg) { range.minFlexDeg = hingeFlexDeg; range.worstMinimum = context; }
    range.maxFlexDeg = Math.max(range.maxFlexDeg, hingeFlexDeg);
    if (offHingeDeg > range.maxOffHingeDeg) { range.maxOffHingeDeg = offHingeDeg; range.worstOffHinge = context; }
  }
}
ApplyAnatomicalFingers(rig);
Inspect("l", { kind: "leftHolding" });
Inspect("r", { kind: "rightHolding" });
sampledPoses++;

// Contact weight is a pose weight. Authored digits must make the same progress
// as their palm when entering a working pose; blending an already mixed target
// again makes a 50% release advance only 25% and rush at the end.
let authoredBlendComparisons = 0;
for (const side of ['r', 'l']) for (const name of Object.keys(FPS_HAND_SHAPES).filter(name => name.startsWith('packet'))) {
  rig.poseState.fire = 0;
  rig.operationPose[side] = { shape: name, nextShape: name, shapeMix: 0 };
  const selected = rig.anatomy[side].curls.filter(({bone}) => {
    const key = bone.name.match(/finger(\d)(\d)?$/i);
    return FPS_ARM_POSES.HanYang.contacts[side === 'r' ? 'right' : 'left'].fingerRotations?.[key[1] + (key[2] || '')];
  });
  rig.contactWeight[side] = 1; ApplyAnatomicalFingers(rig);
  const held = selected.map(({bone}) => bone.quaternion.clone());
  rig.contactWeight[side] = 0; ApplyAnatomicalFingers(rig);
  const working = selected.map(({bone}) => bone.quaternion.clone());
  for (const amount of [.1, .25, .5, .75, .9]) {
    rig.contactWeight[side] = 1 - amount; ApplyAnatomicalFingers(rig);
    for (const [i, {bone}] of selected.entries()) {
      const expected = held[i].clone().slerp(working[i], amount);
      assert(bone.quaternion.angleTo(expected) < 1e-6,
        `${side} ${bone.name} ${name}: authored release must advance ${(amount * 100).toFixed(0)}% exactly once`);
      authoredBlendComparisons++;
    }
  }
  rig.contactWeight[side] = 1; rig.operationPose[side] = null;
}

const aliases = { relax: "packetRelax", recover: "packetRecover", bolt: "packetBolt", latch: "packetLatch" };
const anchorShapes = {
  gripUnwrap: "packetClear", gripClear: "packetClear", boltClear: "packetBoltClear", bolt: "packetBolt",
  clip: "packetClip", clipClear: "packetClip", oldClip: "packetClip", oldClipClear: "packetClip",
  press: "packetPress", pressClear: "packetPress", clear: "packetPress", latch: "packetLatch", latchClear: "packetLatch",
};
const transitions = new Map();
function AddTransition(from, to, source) {
  assert(FPS_HAND_SHAPES[from] && FPS_HAND_SHAPES[to], "Missing production hand shape: " + from + " -> " + to);
  const key = from + ":" + to;
  if (!transitions.has(key)) transitions.set(key, { from, to, sources: [] });
  transitions.get(key).sources.push(source);
}
for (const name of Object.keys(FPS_HAND_SHAPES).filter(name => name.startsWith("packet"))) AddTransition(name, name, "shapeEndpoint");
for (const [name, frames] of [["emptyReload", FPS_PACKET_RELOAD.hand], ["partialReload", FPS_PACKET_RELOAD.tactical.hand]]) {
  const names = frames.map(frame => {
    const explicit = frame.shape ? aliases[frame.shape] || frame.shape : null;
    const shape = explicit || anchorShapes[frame.anchor];
    assert(shape, "Unknown Hanyang reload anchor: " + frame.anchor);
    return shape;
  });
  for (let i = 1; i < names.length; i++) AddTransition(names[i - 1], names[i], name);
}
// The ordinary bolt controller has these same released/contact endpoint shapes.
for (const [from, to] of [["packetClear", "packetBoltClear"], ["packetBoltClear", "packetBolt"],
  ["packetBolt", "packetBoltClear"], ["packetBoltClear", "packetClear"]]) AddTransition(from, to, "ordinaryBolt");
for (const { from, to } of transitions.values()) for (let step = 0; step <= 20; step++) for (const contactWeight of [0, .25, .5, .75, 1]) for(const thumbHoldingWeight of [0,.25,.5,.75,1]) {
  const mix = step / 20;
  rig.operationPose.r = { shape: from, nextShape: to, shapeMix: mix, thumbHoldingWeight };
  rig.contactWeight.r = contactWeight;
  ApplyAnatomicalFingers(rig);
  Inspect("r", { kind: "workingBlend", from, to, mix, contactWeight, thumbHoldingWeight });
  sampledPoses++;
}
const failures = [];
for (const [key, range] of ranges) {
  if (!range.checked) continue; // MCP/CMC roots have physiological abduction/opposition DOFs.
  if (range.minFlexDeg < minimumFlexDeg - 1e-6)
    failures.push(`${key}: hinge flex ${range.minFlexDeg.toFixed(3)}deg < ${minimumFlexDeg}deg at ${JSON.stringify(range.worstMinimum)}`);
  if (range.maxOffHingeDeg > maximumOffHingeDeg + 1e-6)
    failures.push(`${key}: off-hinge rotation ${range.maxOffHingeDeg.toFixed(3)}deg > ${maximumOffHingeDeg}deg at ${JSON.stringify(range.worstOffHinge)}`);
}
const report = {
  sourceAsset: "Model/Model_FpsHanYangHands.glb", skinSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  method: "Production CaptureAnatomy/ApplyAnatomicalFingers on actual GLB default bind nodes. Swing/twist decomposition of rest^-1 * localPose around each captured local hinge. All packet endpoints, production adjacent reload/bolt shapes, shape mix and holding-contact weights are swept without a renderer.",
  limits: { minimumFlexDeg, maximumOffHingeDeg }, sampledPoses, authoredBlendComparisons, transitions: [...transitions.values()], joints: Object.fromEntries(ranges), failures,
  limitations: ["CMC/MCP roots are recorded but exempt from hinge-only limits; their abduction/opposition needs separate physical/visual evaluation.",
    "This gate does not validate skin weights, mesh deformation, contact, collision or a natural-looking gesture. Those need actual skin geometry and rendered motion review."],
};
const output = path.join(project, "_shots", "FpsHandPose");
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "Data_HandPose.json"), JSON.stringify(report, null, 2) + "\n");
assert.deepEqual(failures, [], "FPS finger hinge anatomy; see _shots/FpsHandPose/Data_HandPose.json");
console.log(`ok FPS hand pose: ${sampledPoses} CPU poses; PIP/DIP flex >= ${minimumFlexDeg}deg and off-hinge <= ${maximumOffHingeDeg}deg`);
