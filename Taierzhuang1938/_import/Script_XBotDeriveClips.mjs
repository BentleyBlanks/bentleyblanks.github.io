// 白盒编辑器 X Bot 用的派生动作：把对照表（Data_BlockoutXBotClips.mjs）里要「换算」「镜像」的条目烘成 X Bot 动作文件。
//
//   node Taierzhuang1938/_import/Script_XBotDeriveClips.mjs [片段名…]     # 不给名字 = 全部重烘
//
// 换算（retarget）：预演片段库里士兵骨架的逐骨数据（Animation/<库>/…json，24 fps，见 Data_BlockoutPrevizClips.mjs）
//   按 Script_XBotRetarget 搬到 X Bot 骨架。源身体取片段库里那具模型（modelId）的 GLB 初始姿势。
// 镜像（mirror）：Mixamo 动作左右对调（右手指路 → 左手指路），30 fps。
// 输出 Animation/Mixamo/Derived/Animation_XBot_<片段名>.glb（只有骨节点与一条动作，同 Mixamo 动作文件的写法，
// X Bot 克隆上的 AnimationMixer 按骨名绑），清单 Animation/Mixamo/Derived/Data_XBotDerived.json。
// 换算的片段带枪道具轨（weapon）时，枪相对源右手的位置逐帧记进清单旁的 <名>.weapon.json，编辑器照它把枪放进 X Bot 右手。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, "..");
const THREE = await import("three");
const { XBotRetarget, RestSkeleton, BoneKey, MirrorSide, MirrorWorldQ } = await import(pathToFileURL(path.join(PROJECT, "Script_XBotRetarget.mjs")).href);
const { XBOT_PREVIZ_CLIPS } = await import(pathToFileURL(path.join(PROJECT, "Data_BlockoutXBotClips.mjs")).href);
const { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } = await import(pathToFileURL(path.join(PROJECT, "Data_BlockoutPrevizClips.mjs")).href);

const LIBRARY = path.join(PROJECT, "Animation", "Mixamo");
const OUT = path.join(LIBRARY, "Derived");
const XBOT = path.join(LIBRARY, "Model_MixamoXBot.glb");
const MIXAMO_FPS = 30;

// ---------------------------------------------------------------- GLB 读写

function ReadGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.length > binStart ? buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen)) : null;
  return { json, bin };
}

function Accessor({ json, bin }, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  if (a.componentType !== 5126) throw new Error(`accessor ${index}: only float32 supported`);
  const offset = (view.byteOffset || 0) + (a.byteOffset || 0), stride = view.byteStride || comps * 4;
  const out = new Float32Array(a.count * comps);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < comps; c++) out[i * comps + c] = bin.readFloatLE(offset + i * stride + c * 4);
  return { values: out, comps, count: a.count };
}

function NodeLocal(n) {
  const m = new THREE.Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  return m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
}

function NodeWorlds(json) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i)));
  const world = json.nodes.map(() => null);
  const Get = (i) => {
    if (world[i]) return world[i];
    const m = NodeLocal(json.nodes[i]);
    if (parent.has(i)) m.premultiply(Get(parent.get(i)));
    return (world[i] = m);
  };
  json.nodes.forEach((_, i) => Get(i));
  return { world, parent };
}

/** 一个 GLB 里第一套蒙皮的骨架初始姿势（父在前），外加根骨之上那个静态节点的世界矩阵。 */
function SkinRest(file, order = null) {
  const glb = ReadGlb(file), { json } = glb;
  const { world, parent } = NodeWorlds(json);
  const joints = json.skins[0].joints;
  const byName = new Map(joints.map(j => [BoneKey(json.nodes[j].name), j]));
  const names = order ? order.map(BoneKey) : joints.map(j => BoneKey(json.nodes[j].name));
  const nodes = names.map(n => { const j = byName.get(n); if (j === undefined) throw new Error(`${path.basename(file)}: no bone ${n}`); return j; });
  const nodeIndex = new Map(nodes.map((j, i) => [j, i]));
  const bones = nodes.map((j) => {
    const n = json.nodes[j];
    return { name: n.name, parent: nodeIndex.get(parent.get(j)) ?? -1, world: world[j].clone(),
      local: { p: n.translation || [0, 0, 0], q: n.rotation || [0, 0, 0, 1] } };
  });
  bones.forEach((b, i) => { if (b.parent > i) throw new Error(`${path.basename(file)}: bone order is not parent-first at ${b.name}`); });
  const rootNode = nodes[bones.findIndex(b => b.parent < 0)];
  const above = parent.has(rootNode) ? world[parent.get(rootNode)].clone() : new THREE.Matrix4();
  return { rest: new RestSkeleton(bones), above, glb };
}

/** 只有骨节点（平铺）+ 一条动作的 GLB：rotation 轨每根骨一条，Hips 另有 translation。 */
function WriteAnimationGlb(file, name, boneNames, times, rotations, hips) {
  const chunks = [], accessors = [], views = [];
  let byteLength = 0;
  const Push = (floats, type, minmax = false) => {
    const bytes = Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
    views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length });
    chunks.push(bytes); byteLength += bytes.length;
    const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const a = { bufferView: views.length - 1, componentType: 5126, count: floats.length / comps, type };
    if (minmax) { a.min = [floats[0]]; a.max = [floats[floats.length - 1]]; }
    accessors.push(a);
    return accessors.length - 1;
  };
  const input = Push(Float32Array.from(times), "SCALAR", true);
  const samplers = [], channels = [];
  boneNames.forEach((bone, i) => {
    if (!rotations[i]) return;
    samplers.push({ input, output: Push(rotations[i], "VEC4"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: i, path: "rotation" } });
  });
  if (hips) {
    const hi = boneNames.indexOf("Hips");
    samplers.push({ input, output: Push(hips, "VEC3"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: hi, path: "translation" } });
  }
  const json = {
    asset: { version: "2.0", generator: "Taierzhuang1938/_import/Script_XBotDeriveClips.mjs" },
    scene: 0, scenes: [{ nodes: boneNames.map((_, i) => i) }],
    nodes: boneNames.map(n => ({ name: n })),
    animations: [{ name, samplers, channels }],
    buffers: [{ byteLength }], bufferViews: views, accessors,
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - jsonBuf.length % 4) % 4, 0x20)]);
  let binBuf = Buffer.concat(chunks);
  binBuf = Buffer.concat([binBuf, Buffer.alloc((4 - binBuf.length % 4) % 4)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const ChunkHead = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  fs.writeFileSync(file, Buffer.concat([header, ChunkHead(jsonBuf.length, 0x4e4f534a), jsonBuf, ChunkHead(binBuf.length, 0x004e4942), binBuf]));
}

// ---------------------------------------------------------------- 源片段

/** 片段名 → { library, file, clip, bones, fps, stride, modelId }：先开场库，再按预演库表的顺序（同名靠前的赢，同运行时）。 */
function SourceClips() {
  const found = new Map();
  const Scan = (base, manifestFile) => {
    const dir = path.join(PROJECT, base.replace(/^\.\//, ""));
    const manifestPath = path.join(dir, manifestFile);
    if (!fs.existsSync(manifestPath)) return;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    // 参考身体 NRA02 优先；日军专用的片段（开场库的 IJA 那几具）只烘在日军身体上，再往后找
    const models = [...manifest.models].sort((a, b) => (b.id === "TengxianNra02") - (a.id === "TengxianNra02"));
    for (const model of models) {
      const file = path.join(dir, model.file);
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const [id, clip] of Object.entries(data.clips)) {
        if (found.has(id)) continue;
        found.set(id, { library: path.basename(dir), clip, meta: manifest.clips?.[id] || {}, bones: data.bones, fps: data.fps, stride: data.stride, modelId: data.modelId || model.id });
      }
    }
  };
  Scan("./Animation/OpeningStoryboards/", "Data_OpeningStoryboardsAnimation.json");
  for (const lib of BLOCKOUT_PREVIZ_CLIP_LIBRARIES) Scan(lib.base, lib.manifest);
  return found;
}

// ---------------------------------------------------------------- 烘

const xbot = SkinRest(XBOT);
const targetNames = xbot.rest.bones.map(b => b.key);
const sourceRests = new Map();

function SourceRest(modelId, bones) {
  const key = `${modelId}:${bones.join(",")}`;
  if (!sourceRests.has(key)) {
    const file = path.join(PROJECT, "Model", "Character", `Model_${modelId}.glb`);
    const { rest, above } = SkinRest(file, bones);
    sourceRests.set(key, { rest, above, retarget: new XBotRetarget(rest, xbot.rest, { targetParentOfRoot: xbot.above }) });
  }
  return sourceRests.get(key);
}

function Retarget(id, spec, sources) {
  const src = sources.get(spec.retarget === true ? id : spec.retarget);
  if (!src) throw new Error(`${id}: source clip ${spec.retarget === true ? id : spec.retarget} not found in the previz libraries`);
  const { rest, above, retarget } = SourceRest(src.modelId, src.bones);
  const frames = src.clip.frameCount, stride = src.stride, perFrame = src.bones.length * stride;
  const srcQ = rest.bones.map(() => new THREE.Quaternion()), pelvis = new THREE.Vector3();
  const outQ = xbot.rest.bones.map(() => new THREE.Quaternion()), hips = new THREE.Vector3();
  const rotations = targetNames.map((_, i) => (retarget.srcIndex[i] >= 0 ? new Float32Array(frames * 4) : null));
  const hipsTrack = new Float32Array(frames * 3), times = [];
  const prev = targetNames.map(() => null);
  for (let f = 0; f < frames; f++) {
    XBotRetarget.SourceWorld(rest, src.clip.values.slice(f * perFrame, (f + 1) * perFrame), stride, srcQ, pelvis, above);
    retarget.Solve(srcQ, pelvis, outQ, hips);
    rotations.forEach((track, i) => {
      if (!track) return;
      // 四元数取跟上一帧同半球的那一个，线性插值不绕远路
      if (prev[i] && prev[i].dot(outQ[i]) < 0) outQ[i].set(-outQ[i].x, -outQ[i].y, -outQ[i].z, -outQ[i].w);
      prev[i] = (prev[i] || new THREE.Quaternion()).copy(outQ[i]);
      track.set(outQ[i].toArray(), f * 4);
    });
    hipsTrack.set(hips.toArray(), f * 3);
    times.push(f / src.fps);
  }
  return { times, rotations, hips: hipsTrack, duration: src.clip.duration, loop: !!src.clip.loop, source: `${src.library}/${id}`, sourceModel: src.modelId };
}

function Mirror(id, spec) {
  const glb = ReadGlb(path.join(LIBRARY, spec.file)), anim = glb.json.animations[0];
  const tracks = new Map();
  let duration = 0;
  for (const ch of anim.channels) {
    const s = anim.samplers[ch.sampler];
    const input = Accessor(glb, s.input), output = Accessor(glb, s.output);
    duration = Math.max(duration, input.values[input.count - 1]);
    tracks.set(`${BoneKey(glb.json.nodes[ch.target.node].name)}.${ch.target.path}`, { input, output });
  }
  const Sample = (track, t, comps) => {
    const { input, output } = track, n = input.count;
    let i = 0; while (i < n - 1 && input.values[i + 1] <= t) i++;
    const j = Math.min(i + 1, n - 1), span = input.values[j] - input.values[i];
    const a = span > 0 ? Math.min(1, Math.max(0, (t - input.values[i]) / span)) : 0;
    const A = Array.from(output.values.slice(i * comps, i * comps + comps)), B = Array.from(output.values.slice(j * comps, j * comps + comps));
    if (comps === 4) return new THREE.Quaternion(...A).slerp(new THREE.Quaternion(...B), a);
    return new THREE.Vector3(...A).lerp(new THREE.Vector3(...B), a);
  };
  const bones = xbot.rest.bones, frames = Math.round(duration * MIXAMO_FPS) + 1;
  const rotations = targetNames.map(() => new Float32Array(frames * 4)), hipsTrack = new Float32Array(frames * 3), times = [];
  const world = bones.map(() => new THREE.Quaternion()), mirrored = bones.map(() => new THREE.Quaternion());
  const rootQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(xbot.above));
  const prev = targetNames.map(() => null);
  for (let f = 0; f < frames; f++) {
    const t = Math.min(duration, f / MIXAMO_FPS);
    bones.forEach((b, i) => {
      const track = tracks.get(`${b.key}.rotation`);
      const local = track ? Sample(track, t, 4) : new THREE.Quaternion(...b.local.q);
      world[i].copy(b.parent >= 0 ? world[b.parent] : rootQ).multiply(local);
    });
    bones.forEach((b, i) => { const other = xbot.rest.Find(MirrorSide(b.key)); MirrorWorldQ(world[other >= 0 ? other : i], mirrored[i]); });
    bones.forEach((b, i) => {
      const parentQ = b.parent >= 0 ? mirrored[b.parent] : rootQ;
      const local = parentQ.clone().invert().multiply(mirrored[i]);
      if (prev[i] && prev[i].dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
      prev[i] = local;
      rotations[i].set(local.toArray(), f * 4);
    });
    // Hips 的本地位置在 Armature（绕 X 转 90°）下：先换到模型空间，x 取反，再换回去
    const hipsTrackSrc = tracks.get("Hips.translation");
    const p = hipsTrackSrc ? Sample(hipsTrackSrc, t, 3) : new THREE.Vector3(...bones[xbot.rest.Find("Hips")].local.p);
    p.applyMatrix4(xbot.above); p.x = -p.x; p.applyMatrix4(xbot.above.clone().invert());
    hipsTrack.set(p.toArray(), f * 3);
    times.push(t);
  }
  return { times, rotations, hips: hipsTrack, duration, loop: !!spec.loop, source: `Mixamo/${spec.file} (mirrored)` };
}

const only = new Set(process.argv.slice(2));
fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, "Data_XBotDerived.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { schema: 1, clips: {} };
const sources = SourceClips();
let made = 0;
for (const [id, spec] of Object.entries(XBOT_PREVIZ_CLIPS)) {
  if (!spec.retarget && !spec.mirror) continue;
  if (only.size && !only.has(id)) continue;
  const baked = spec.retarget ? Retarget(id, spec, sources) : Mirror(id, spec);
  const file = `Animation_XBot_${id}.glb`;
  WriteAnimationGlb(path.join(OUT, file), id, targetNames, baked.times, baked.rotations, baked.hips);
  manifest.clips[id] = { file, method: spec.retarget ? "retarget" : "mirror", source: baked.source,
    ...(baked.sourceModel ? { sourceModel: baked.sourceModel } : {}), duration: +baked.duration.toFixed(4), loop: baked.loop,
    frames: baked.times.length };
  made += 1;
}
manifest.clips = Object.fromEntries(Object.entries(manifest.clips).filter(([id]) => XBOT_PREVIZ_CLIPS[id]?.retarget || XBOT_PREVIZ_CLIPS[id]?.mirror).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`[XBotDerive] baked ${made}, manifest ${Object.keys(manifest.clips).length} clips → ${path.relative(PROJECT, OUT)}`);
// 动作库清单（预览工具读）跟着刷新：派生动作归「白盒预演派生」
const { execFileSync } = await import("node:child_process");
execFileSync(process.execPath, [path.join(HERE, "Script_MixamoLibraryFetch.mjs"), "--prune"], { stdio: "inherit" });
