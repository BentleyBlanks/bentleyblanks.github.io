// Reuse Yaowa's contact bake for Azuma Shiro's grounded motions.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "../vendor/three/build/three.module.js";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { LoadGlb, SerializeGlb } from "./Script_LugouGlbPose.mjs";
import { ClipForCharacter } from "../Script_XBotCharacters.mjs";

const project = path.resolve(import.meta.dirname, "..");
const modelFile = path.join(project, "Model/Character/Model_AzumaShiro.glb");
const modelReport = JSON.parse(fs.readFileSync(path.join(project, "Model/Character/Data_AzumaShiro.json")));
const outputDir = path.join(project, "Animation/AzumaShiro");
const Hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
async function ReadSkeleton(file) {
  const glb = LoadGlb(file), doc = structuredClone(glb.json);
  for (const mesh of doc.meshes || []) for (const primitive of mesh.primitives) delete primitive.material;
  for (const key of ["materials", "textures", "images", "samplers"]) delete doc[key];
  doc.extensionsRequired = (doc.extensionsRequired || []).filter(name => name !== "EXT_texture_webp");
  const bytes = SerializeGlb(doc, glb.bin);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
}
const { scene } = await ReadSkeleton(modelFile);
const mesh = scene.getObjectByProperty("isSkinnedMesh", true);
const hips = scene.getObjectByName("Hips");
const point = new THREE.Vector3();
const report = {
  schema: 1, script: "_import/Script_BakeAzumaShiroContacts.mjs", character: "azumaShiro",
  model: { file: "Model/Character/Model_AzumaShiro.glb", sha256: Hash(modelFile) }, clips: [],
};
fs.mkdirSync(outputDir, { recursive: true });
for (const name of ["WalkWithRifle_V3", "IdleCrouchingAiming_V1", "ProneFiringRifle_V2", "Dying_V3", "SittingIdle_V2"]) {
  const sourceFile = path.join(project, `Animation/Mixamo/Animation_Mixamo_${name}.glb`);
  const source = LoadGlb(sourceFile), animation = (await ReadSkeleton(sourceFile)).animations[0];
  const clip = ClipForCharacter(animation, modelReport);
  const mixer = new THREE.AnimationMixer(scene), action = mixer.clipAction(clip);
  action.play(); action.paused = true;
  const frames = Math.ceil(clip.duration * 60 - 1e-5), times = [], positions = [];
  let minBefore = Infinity, minAfter = Infinity, maxLiftM = 0;
  for (let frame = 0; frame <= frames; frame++) {
    const time = Math.min(frame / 60, clip.duration);
    action.time = Math.min(time, clip.duration - 1e-5); mixer.update(0); scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    let minY = Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      minY = Math.min(minY, point.y);
    }
    const liftM = Math.max(0, .002 - minY);
    minBefore = Math.min(minBefore, minY);
    minAfter = Math.min(minAfter, minY + liftM);
    maxLiftM = Math.max(maxLiftM, liftM);
    hips.getWorldPosition(point); point.y += liftM;
    hips.position.copy(hips.parent.worldToLocal(point));
    times.push(time);
    // ClipForCharacter applies hipsScale when this character's override is played.
    positions.push(...hips.position.toArray().map(value => value / modelReport.hipsScale));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  assert.ok(times.slice(1).every((time, index) => Math.fround(time) > Math.fround(times[index])),
    `${name}: strictly increasing float32 key times`);
  assert.ok(maxLiftM < .15, `${name}: excessive contact correction`);
  assert.ok(minAfter >= .0019, `${name}: floor clearance`);
  const doc = structuredClone(source.json), chunks = [source.bin];
  let byteLength = source.bin.length;
  function Append(values, type, width) {
    const data = new Float32Array(values), bytes = Buffer.from(data.buffer);
    doc.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length });
    chunks.push(bytes); byteLength += bytes.length;
    doc.accessors.push({ bufferView: doc.bufferViews.length - 1, componentType: 5126, count: values.length / width, type,
      ...(type === "SCALAR" ? { min: [values[0]], max: [values.at(-1)] } : {}) });
    return doc.accessors.length - 1;
  }
  const channel = doc.animations[0].channels.find(channel =>
    channel.target.path === "translation" && doc.nodes[channel.target.node].name === "Hips");
  assert.ok(channel, `${name}: hip translation track`);
  doc.animations[0].samplers[channel.sampler] = {
    input: Append(times, "SCALAR", 1), output: Append(positions, "VEC3", 3), interpolation: "LINEAR",
  };
  doc.buffers[0].byteLength = byteLength;
  doc.asset.generator = "Script_BakeAzumaShiroContacts.mjs";
  const outputFile = path.join(outputDir, `Animation_AzumaShiro_${name}.glb`);
  fs.writeFileSync(outputFile, SerializeGlb(doc, Buffer.concat(chunks)));
  report.clips.push({
    source: { file: path.relative(project, sourceFile).replaceAll("\\", "/"), sha256: Hash(sourceFile) },
    output: { file: path.relative(project, outputFile).replaceAll("\\", "/"), sha256: Hash(outputFile) },
    frames: times.length, duration: clip.duration, minBefore, minAfter, maxLiftM,
  });
}
fs.writeFileSync(path.join(outputDir, "Data_AzumaShiroContacts.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
