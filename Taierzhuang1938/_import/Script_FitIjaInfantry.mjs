// Refit the existing skeleton-only clips to the soles of each adopted IJA appearance.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { BuildSkin, LoadGlb, MinSkinnedY, PoseScene, SerializeGlb } from "./Script_LugouGlbPose.mjs";

const project = path.resolve(import.meta.dirname, "..");
const directory = path.join(project, "Model/Character");
const sourceRevision = "025a54b4a9e67b3c8bdc90a01a91b4257051cb67";
const manifestFile = path.join(directory, "Data_TengxianCharacterManifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile));
const catalogFile = path.join(directory, "Data_InfantryAnimations.json");
const catalog = JSON.parse(fs.readFileSync(catalogFile));
const fps = 60;

function AppendFloats(doc, chunks, data, type) {
  const values = Float32Array.from(data);
  const bytes = Buffer.from(values.buffer);
  const offset = doc.buffers[0].byteLength;
  const view = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }) - 1;
  chunks.push(bytes);
  doc.buffers[0].byteLength += bytes.length;
  const accessor = { bufferView: view, componentType: 5126, count: values.length / (type === "SCALAR" ? 1 : 3), type };
  if (type === "SCALAR") Object.assign(accessor, {min: [values[0]], max: [values.at(-1)]});
  return doc.accessors.push(accessor) - 1;
}
for (const record of manifest.models.filter(row => row.appearance)) {
  const sourceId = record.id === "TengxianIja06" ? "TengxianIja02" : record.id;
  const sourceFile = "Animation_" + sourceId + "Infantry.glb";
  const bytes = execFileSync("git", ["show", sourceRevision + ":Taierzhuang1938/Model/Character/" + sourceFile], {cwd: project, maxBuffer: 8e6});
  const library = LoadGlb(bytes);
  const scene = new PoseScene(library);
  const body = LoadGlb(path.join(project, record.url));
  const skin = BuildSkin(body);
  const bodyScene = new PoseScene(body);
  // Bind by node name. The Jia model and the A source clip share a skeleton, independently of their node numbering.
  for (const part of skin) part.joints = part.joints.map(i => scene.NodeIndex(body.json.nodes[i].name));
  const doc = library.json;
  const chunks = [library.bin];
  doc.buffers[0].byteLength = library.bin.length;
  for (const [index, clip] of scene.animations.entries()) {
    const animation = doc.animations[index];
    const count = Math.round(clip.duration*fps);
    const times = Array.from({length:count+1}, (_, i) => i*clip.duration/count);
    const nodes = ["GroundRoot","InfantryRifle","InfantryGrenade"].map(name=>scene.NodeIndex(name));
    const positions = nodes.map(()=>[]);
    for (const t of times) {
      scene.Apply(index,t);
      const lift = .003 - MinSkinnedY(scene,skin);
      for (const [i, node] of nodes.entries()) {
        const [x,y,z] = scene.t[node];
        positions[i].push(x,y+lift,z);
      }
    }
    const input = AppendFloats(doc,chunks,times,"SCALAR");
    for (const [i,node] of nodes.entries()) {
      const channel = animation.channels.find(c=>c.target.node === node && c.target.path === "translation");
      const output = AppendFloats(doc,chunks,positions[i],"VEC3");
      animation.samplers[channel.sampler] = {input,output,interpolation:"LINEAR"};
    }
  }
  const standing = doc.scenes[doc.scene || 0].extras?.infantryStandFloor;
  if (standing) {
    const baseSkin = BuildSkin(body);
    const stand = bodyScene.AnimationIndex("AdvanceFire");
    standing.values = standing.values.map((_,i)=>{
      bodyScene.Apply(stand,i/standing.fps);
      return MinSkinnedY(bodyScene,baseSkin);
    });
  }
  const outputName = record.id === sourceId ? sourceFile : "Animation_" + record.appearance + "Infantry.glb";
  const encoded = SerializeGlb(doc,Buffer.concat(chunks));
  fs.writeFileSync(path.join(directory,outputName),encoded);
  record.infantryVersion = createHash("sha256").update(encoded).digest("hex").slice(0,16);
  record.infantryUrl = "./Model/Character/" + outputName;
  const sourceRow = catalog.models.find(row => row.id === sourceId);
  const catalogRow = catalog.models.find(row => row.id === record.id) || {...sourceRow, id:record.id};
  catalogRow.file = outputName;
  if (!catalog.models.includes(catalogRow)) catalog.models.push(catalogRow);
  console.log(record.appearance, outputName);
}
fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+"\n");
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+"\n");
