// Adapt supported low poses to Liu Wencai's limb lengths and actual skin surface.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "../vendor/three/build/three.module.js";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { LoadGlb, SerializeGlb } from "./Script_LugouGlbPose.mjs";
import { ClipForCharacter } from "../Script_XBotCharacters.mjs";
import { XBOT_CHARACTERS } from "../Data_XBotCharacters.mjs";

const project = path.resolve(import.meta.dirname, "..");
const modelFile = path.join(project, "Model/Character/Model_LiuWencai.glb");
const outputDir = path.join(project, "Animation/LiuWencai");
const character = XBOT_CHARACTERS.liuWencai;
const floor = 0.002;
const policies = [
  { id: "Crawling", file: "Animation_Mixamo_Crawling_V1.glb", feet: true, hands: true, kneeFloor: .075 },
  { id: "ProneFiringRifle", file: "Animation_Mixamo_ProneFiringRifle_V2.glb", feet: true },
  { id: "SittingIdle", file: "Animation_Mixamo_SittingIdle_V2.glb", feet: true },
  { id: "Dying", file: "Animation_Mixamo_Dying_V3.glb" },
  { id: "CrouchingAiming", file: "Animation_Mixamo_IdleCrouchingAiming_V1.glb" },
];
const Hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
async function ReadSkeleton(file) {
  const glb = LoadGlb(file), doc = glb.json;
  for (const mesh of doc.meshes || []) for (const primitive of mesh.primitives) delete primitive.material;
  for (const key of ["materials", "textures", "images", "samplers"]) delete doc[key];
  doc.extensionsRequired = (doc.extensionsRequired || []).filter(name => name !== "EXT_texture_webp");
  const bytes = SerializeGlb(doc, glb.bin);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
}
const { scene } = await ReadSkeleton(modelFile);
let mesh;
scene.traverse(object => { if (object.isSkinnedMesh) mesh = object; });
scene.updateMatrixWorld(true);
const bones = mesh.skeleton.bones;
const byName = new Map(bones.map(bone => [bone.name, bone]));
const rest = bones.map(bone => ({ position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));
const Point = bone => bone.getWorldPosition(new THREE.Vector3());
const groups = { LeftFoot: [], RightFoot: [], LeftHand: [], RightHand: [] };
const point = new THREE.Vector3();
for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
  point.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld);
  const side = point.x >= 0 ? "Left" : "Right";
  if (point.y < .105) groups[side + "Foot"].push(i);
  if (Math.abs(point.x) > .710) groups[side + "Hand"].push(i);
}
const allVertices = Array.from({ length: mesh.geometry.attributes.position.count }, (_, index) => index);
function MinY(indices) {
  let min = Infinity;
  for (const index of indices) {
    mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
    min = Math.min(min, point.y);
  }
  return min;
}
function SetWorldQuaternion(bone, world) {
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(world));
  scene.updateMatrixWorld(true);
}
function AimBone(bone, child, target) {
  const origin = Point(bone);
  const from = Point(child).sub(origin).normalize(), to = target.clone().sub(origin).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  SetWorldQuaternion(bone, delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}
function SolveChain(names, target, minimumMiddleY = -Infinity) {
  const [root, middle, end] = names.map(name => byName.get(name));
  const a = Point(root), b = Point(middle), c = Point(end);
  const endQuaternion = end.getWorldQuaternion(new THREE.Quaternion());
  const firstLength = a.distanceTo(b), secondLength = b.distanceTo(c);
  const direction = target.clone().sub(a);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(firstLength - secondLength) + 1e-5, firstLength + secondLength - 1e-5);
  direction.normalize();
  const reachable = a.clone().addScaledVector(direction, distance);
  const pole = b.clone().sub(a).addScaledVector(direction, -b.clone().sub(a).dot(direction));
  if (pole.lengthSq() < 1e-9) pole.set(1, 0, 0).addScaledVector(direction, -direction.x);
  pole.normalize();
  const along = (firstLength ** 2 - secondLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, firstLength ** 2 - along ** 2));
  const center = a.clone().addScaledVector(direction, along);
  if (center.y + pole.y * height < minimumMiddleY) {
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(direction, -direction.y).normalize();
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 16; iteration++) {
      const t = (low + high) / 2;
      const candidate = pole.clone().lerp(up, t).normalize();
      if (center.y + candidate.y * height < minimumMiddleY) low = t;
      else high = t;
    }
    pole.lerp(up, high).normalize();
  }
  AimBone(root, middle, center.addScaledVector(pole, height));
  AimBone(middle, end, reachable);
  SetWorldQuaternion(end, endQuaternion);
}
function LiftPelvis(amount) {
  const hip = byName.get("Hips"), world = Point(hip);
  world.y += amount;
  hip.position.copy(hip.parent.worldToLocal(world));
  scene.updateMatrixWorld(true);
}
function WriteClip(source, times, rotations, hips, outputFile) {
  const xbot = LoadGlb(path.join(project, "Animation/Mixamo/Model_MixamoXBot.glb")).json;
  const nodes = structuredClone(xbot.nodes);
  for (const node of nodes) { delete node.mesh; delete node.skin; }
  const views = [], accessors = [], chunks = [];
  let length = 0;
  function Add(values, type, width) {
    const data = new Float32Array(values), bytes = Buffer.from(data.buffer);
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(bytes); length += bytes.length;
    accessors.push({ bufferView: views.length - 1, componentType: 5126, count: values.length / width, type,
      ...(type === "SCALAR" ? { min: [values[0]], max: [values.at(-1)] } : {}) });
    return accessors.length - 1;
  }
  const timeAccessor = Add(times, "SCALAR", 1), samplers = [], channels = [];
  for (const [name, values] of rotations) {
    samplers.push({ input: timeAccessor, output: Add(values, "VEC4", 4), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: nodes.findIndex(node => node.name === name), path: "rotation" } });
  }
  samplers.push({ input: timeAccessor, output: Add(hips, "VEC3", 3), interpolation: "LINEAR" });
  channels.push({ sampler: samplers.length - 1, target: { node: nodes.findIndex(node => node.name === "Hips"), path: "translation" } });
  const doc = { asset: { version: "2.0", generator: "Script_BakeLiuWencaiContacts.mjs" }, scene: 0, scenes: structuredClone(xbot.scenes), nodes,
    animations: [{ name: source.animations[0].name, samplers, channels }], accessors, bufferViews: views, buffers: [{ byteLength: length }] };
  fs.writeFileSync(outputFile, SerializeGlb(doc, Buffer.concat(chunks)));
}
fs.mkdirSync(outputDir, { recursive: true });
const results = [];
for (const policy of policies) {
  bones.forEach((bone, index) => { bone.position.copy(rest[index].position); bone.quaternion.copy(rest[index].quaternion); bone.scale.copy(rest[index].scale); });
  scene.updateMatrixWorld(true);
  const sourceFile = path.join(project, "Animation/Mixamo", policy.file);
  const source = await ReadSkeleton(sourceFile);
  const clip = ClipForCharacter(source.animations[0], character);
  const mixer = new THREE.AnimationMixer(scene), action = mixer.clipAction(clip);
  action.play(); action.paused = true;
  const frames = Math.ceil(clip.duration * 30), times = [], hips = [];
  const rotations = new Map(bones.map(bone => [bone.name, []]));
  let minSkin = Infinity, maxLift = 0, maxLengthError = 0;
  for (let frame = 0; frame <= frames; frame++) {
    const time = Math.min(frame / 30, clip.duration - 1e-5);
    times.push(frame === frames ? clip.duration : time);
    action.time = time; mixer.update(0); scene.updateMatrixWorld(true);
    const targets = {};
    for (const name of Object.keys(groups)) {
      const target = Point(byName.get(name));
      target.y += Math.max(0, floor - MinY(groups[name]));
      targets[name] = target;
    }
    let lift = 0;
    if (policy.kneeFloor) {
      const kneeMin = Math.min(Point(byName.get("LeftLeg")).y, Point(byName.get("RightLeg")).y);
      const amount = Math.max(0, policy.kneeFloor - kneeMin);
      LiftPelvis(amount); lift += amount;
    }
    for (let iteration = 0; iteration < 5; iteration++) {
      const amount = Math.max(0, floor - MinY(allVertices));
      LiftPelvis(amount); lift += amount;
      for (const side of ["Left", "Right"]) {
        if (policy.feet) SolveChain([side + "UpLeg", side + "Leg", side + "Foot"], targets[side + "Foot"], policy.kneeFloor);
        if (policy.hands) SolveChain([side + "Arm", side + "ForeArm", side + "Hand"], targets[side + "Hand"], policy.elbowFloor);
      }
      if (MinY(allVertices) >= -.001) break;
    }
    const minimum = MinY(allVertices);
    minSkin = Math.min(minSkin, minimum); maxLift = Math.max(maxLift, lift);
    for (let index = 0; index < bones.length; index++) {
      const bone = bones[index];
      rotations.get(bone.name).push(...bone.quaternion.toArray());
      if (bone.parent?.isBone) maxLengthError = Math.max(maxLengthError, bone.position.distanceTo(rest[index].position) * .01);
    }
    hips.push(...byName.get("Hips").position.toArray().map(value => value / character.hipsScale));
  }
  assert.ok(minSkin > -.012, `${policy.id}: skin below floor ${minSkin}`);
  assert.ok(maxLift < .25 && maxLengthError < 1e-6, `${policy.id}: proportion invariant`);
  const output = path.join(outputDir, `Animation_LiuWencai_${policy.id}.glb`);
  WriteClip(source, times, rotations, hips, output);
  results.push({ id: policy.id, source: { file: path.relative(project, sourceFile).replaceAll("\\", "/"), sha256: Hash(sourceFile) },
    output: { file: path.relative(project, output).replaceAll("\\", "/"), sha256: Hash(output) }, frames: times.length, minSkinnedY: minSkin, maxPelvisLiftM: maxLift, maxBodyBoneLengthErrorM: maxLengthError });
  mixer.stopAllAction();
  console.log(`${policy.id}: ${times.length} frames, min skin ${minSkin.toFixed(4)}m`);
}
fs.writeFileSync(path.join(outputDir, "Data_LiuWencaiContacts.json"), JSON.stringify({ schema: 1, script: "_import/Script_BakeLiuWencaiContacts.mjs", character: "liuWencai", model: { file: "Model/Character/Model_LiuWencai.glb", sha256: Hash(modelFile) }, results }, null, 2) + "\n");
