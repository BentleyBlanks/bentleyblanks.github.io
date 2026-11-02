// 白盒编辑器 X Bot 用的派生动作：把对照表（Data_BlockoutXBotClips.mjs）里要「换算」「镜像」的条目烘成 X Bot 动作文件。
//
//   node Taierzhuang1938/_import/Script_XBotDeriveClips.mjs [片段名…] [--no-prune]   # 不给名字 = 全部重烘；--no-prune 不刷新动作库清单
//
// 换算（retarget）：预演片段库里士兵骨架的逐骨数据（Animation/<库>/…json，24 fps，见 Data_BlockoutPrevizClips.mjs）
//   按 Script_XBotRetarget 搬到 X Bot 骨架。源身体取片段库里那具模型（modelId）的 GLB 初始姿势。
// 镜像（mirror）：Mixamo 动作左右对调（右手指路 → 左手指路），30 fps。
// 输出 Animation/Mixamo/Derived/Animation_XBot_<片段名>.glb（只有骨节点与一条动作，同 Mixamo 动作文件的写法，
// X Bot 克隆上的 AnimationMixer 按骨名绑），清单 Animation/Mixamo/Derived/Data_XBotDerived.json。
// 枪不烘进动作：运行时（Script_EditorBlockoutXBot._PlaceWeapon）照原身体握枪那只手与枪的相对位姿把枪挂到 X Bot 同一只手上。
//
// 后处理（2026-11-02 全库审查之后，_import/Script_XBotDeriveFix.mjs）：
//   · 输出改 30 fps（同 Mixamo、同审查脚本的取样），源片段 24 fps 先按时间重采样；
//   · 去抽搐：源片段逐骨本地朝向里「去了又回来」的一帧（原片段数据里就有，换算原样搬过来）拉回前后中间，只动那几帧；
//     手修完再在 X Bot 输出上补一遍；
//   · 手：换算只搬朝向，X Bot 胳膊长、躯干大腿比例不同，手会扎进身体 / 离攥着的东西差几厘米 —— 逐帧给掌心一个目标，
//     两节骨 IK 去够：攥着别的东西的手（ANCHORED_HANDS）对准原手位置 ÷ 运行时缩放，原手贴着自己身体的贴着 X Bot 身体，
//     仍扎进去的推出来（推的方向、远近分开前后平滑）；
//   · 几种做法（换目标 + 推出 / 只推出 / 手不动 / 最多推 6 cm）各烘一遍，按审查口径的超标量加「原手贴着身体、修完离开」的分
//     挑最少的（POSE_GUARD：不为了不进身体把手甩走）；可循环的首尾接回去；
//   · 镜像的只推出、去抽搐。
//   每条改过的写调整记录 _import/MixamoFixes/Animation_XBot_<名>.Derive.fix.json（改前改后按审查脚本同一套量法）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, "..");
const THREE = await import("three");
const { XBotRetarget, RestSkeleton, BoneKey, MirrorSide, MirrorWorldQ, XBOT_FROM_SOLDIER } = await import(pathToFileURL(path.join(PROJECT, "Script_XBotRetarget.mjs")).href);
const Fix = await import(pathToFileURL(path.join(HERE, "Script_XBotDeriveFix.mjs")).href);
const { XBOT_PREVIZ_CLIPS } = await import(pathToFileURL(path.join(PROJECT, "Data_BlockoutXBotClips.mjs")).href);
const { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } = await import(pathToFileURL(path.join(PROJECT, "Data_BlockoutPrevizClips.mjs")).href);

const LIBRARY = path.join(PROJECT, "Animation", "Mixamo");
const OUT = path.join(LIBRARY, "Derived");
const XBOT = path.join(LIBRARY, "Model_MixamoXBot.glb");
const FIXES = path.join(HERE, "MixamoFixes");
const MIXAMO_FPS = 30;
/** 去抽搐：源片段（重采样到 30 fps 后）与 X Bot 输出的门槛（度，同审查脚本的「离前后两帧中间姿势」；审查报 > 15°）。 */
const DESPIKE_SOURCE = Object.freeze({ lo: 8, hi: 12 });
const DESPIKE_OUTPUT = Object.freeze({ lo: 8, hi: 11 });
/**
 * 挑做法时护住原动作（11-02 复查加）：只按「进身体多少」挑，会挑中把手推走一大截的做法 —— PvCaptiveButtHit 挨枪托捂脸，
 * 手指进 X Bot 的大脑袋 8.5 cm，推干净要推 25 cm，右臂被甩到头顶上（02-1 冬瓜）；CaptiveStabbedCurl 蜷着、手夹在两腿间，
 * 推出来胳膊竖到半空（只限推的距离时肘又翘起来）。所以每条胳膊：手推出（不含攥着东西的换目标）超过 freePushM 的部分、
 * 肘比手不动那种挪开超过 freeElbowM 的部分、「原手贴着自己身体（≤ touchM）、修完离 X Bot 身体超过 keepM」比手不动那种
 * 多出来的部分，每厘米记 perCm 分（肘 perElbowCm：整条胳膊挪开比夹在腿间、贴着脸的几厘米显眼），跟超标量加在一起挑；
 * 另烘「最多推 capM」的几种给它挑（宁可手指留一点在身体里，也不把手甩走）。
 */
const POSE_GUARD = Object.freeze({ touchM: 0.03, keepM: 0.04, freePushM: 0.08, freeElbowM: 0.08, perCm: 0.5, perElbowCm: 0.6, capM: 0.06 });
/**
 * 「手里攥着别的东西」的手（R / L）：这些手的目标掌心取原身体掌心位置 ÷ 运行时缩放（白盒里正好落在原来那只手的位置，
 * 被角、担架杆、衣领、伤员、墙头、地面都不跑；挪到碰到 X Bot 身体为止）。没列的手保持换算结果，只做贴身体与推出：
 * 比划、扶自己的；握枪 / 拿道具的也不列 —— 枪和片段道具轨上的东西运行时挂到 X Bot 同一只手 / 同一根骨上，跟着手走，
 * 另一只手运行时再 IK 到枪上原来握的那一点。按片段说明（Data_<库>Animation.json 的 notes）逐条列的。
 */
const ANCHORED_HANDS = Object.freeze({
  // 两个人一直接触 / 拖拽（被拖的人、伤员、衣领、头发、腰带都是另一个人身上的）
  PvBlanketDragL: "L", PvBlanketDragR: "R", PvCrouchGripLitter: "RL", PvSupportedHop: "RL", PvSupportWalkL: "RL", PvSupportWalkR: "RL",
  VilNraCarryOnBack: "RL", VilRideOnBack: "RL", CareMedicPress: "RL", PullComrade: "RL", VilIjaDragByArm: "RL", VilDraggedByArm: "R",
  IjaDragCollarFromDirt: "R", CaptiveDraggedFromDirt: "R", InterpreterGrabCollar: "R", PvKneelHaulBody: "RL", PvLieGrabSleeve: "R",
  PvSitGrabHand: "R", VilClingHem: "RL", VilHugLegs: "RL", VilNraYankBack: "RL", PvCrouchRunPullBehind: "L", LuoKneelCheck: "L",
  IjaCrouchHairHold: "L", PvIjaCrouchHairLift: "L", IjaSlapForehand: "L", IjaSlapBackhand: "L",
  // 场景里的东西：墙头、沟沿、窖口、门闩、车尾、塌下来的房梁、地面
  VilIjaClimbWall: "RL", PvClimbOutTrench: "RL", VilHandsUpClimbOut: "RL", VilUnboltDoor: "R", VilSitEdge: "RL", HeLiftTimber: "RL",
  VilCrawlHole: "RL", VilKneelCrawlToPit: "RL", PvCrawlCarryBundle: "RL", VilReachPinned: "L",
});


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
xbot.volumes = Fix.FitVolumes(XBOT, Fix.AUDIT_BODY);
const xbotHeadY = xbot.rest.worldP[xbot.rest.Find("Head")].y;
const targetNames = xbot.rest.bones.map(b => b.key);
const sourceRests = new Map();
const XBOT_OF = new Map(Object.entries(XBOT_FROM_SOLDIER).map(([s, x]) => [BoneKey(s), x]));

function SourceRest(modelId, bones) {
  const key = `${modelId}:${bones.join(",")}`;
  if (!sourceRests.has(key)) {
    const file = path.join(PROJECT, "Model", "Character", `Model_${modelId}.glb`);
    const { rest, above } = SkinRest(file, bones);
    const retarget = new XBotRetarget(rest, xbot.rest, { targetParentOfRoot: xbot.above });
    // 原身体的胶囊按换算的修正量对齐到 X Bot 骨的轴向（目标世界 = 源世界 × C → 胶囊坐标系 = 源骨 × C）
    const pairOf = new Map(Object.entries(Fix.BODY_PAIRS).map(([t, s]) => [s, t]));
    const volumes = Fix.FitVolumes(file, [...pairOf.keys()], (k) => {
      const ti = xbot.rest.Find(pairOf.get(k));
      return ti >= 0 ? retarget.correction[ti] : null;
    });
    const scaleK = rest.worldP[rest.Find("Bip001_Head")].y / xbotHeadY;   // 同运行时 XBotSkin.scaleK（两边头高之比）
    sourceRests.set(key, { rest, above, retarget, volumes, scaleK });
  }
  return sourceRests.get(key);
}

/** 源片段一帧（可以是小数帧）的本地值：位置线性、朝向球面插值。 */
function SampleSource(values, perFrame, stride, frames, at, out) {
  const i0 = Math.min(frames - 1, Math.floor(at)), i1 = Math.min(frames - 1, i0 + 1), a = at - i0;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  for (let o = 0; o < perFrame; o += stride) {
    const A = i0 * perFrame + o, B = i1 * perFrame + o;
    for (let c = 0; c < 3; c++) out[o + c] = values[A + c] + (values[B + c] - values[A + c]) * a;
    qa.set(values[A + 3], values[A + 4], values[A + 5], values[A + 6]); qb.set(values[B + 3], values[B + 4], values[B + 5], values[B + 6]);
    qa.slerp(qb, a);
    out[o + 3] = qa.x; out[o + 4] = qa.y; out[o + 5] = qa.z; out[o + 6] = qa.w;
  }
  return out;
}

/** 本地朝向（Quaternion[帧][骨]）→ 每骨一条 Float32Array 轨（跟上一帧同半球，线性插值不绕远路）。 */
function ToTracks(frames, count) {
  const tracks = Array.from({ length: count }, () => new Float32Array(frames.length * 4));
  frames.forEach((qs, f) => qs.forEach((q, i) => {
    const prev = f > 0 ? frames[f - 1][i] : null;
    if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    tracks[i].set([q.x, q.y, q.z, q.w], f * 4);
  }));
  return tracks;
}
function FromTracks(tracks, frames) { frames.forEach((qs, f) => qs.forEach((q, i) => q.fromArray(tracks[i], f * 4))); }

/** 一串帧号写成「3–7、12」。 */
function Ranges(list) {
  const out = [];
  for (const f of [...new Set(list)].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && f === last[1] + 1) last[1] = f; else out.push([f, f]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join("、");
}

function Retarget(id, spec, sources) {
  const src = sources.get(spec.retarget === true ? id : spec.retarget);
  if (!src) throw new Error(`${id}: source clip ${spec.retarget === true ? id : spec.retarget} not found in the previz libraries`);
  const S = SourceRest(src.modelId, src.bones);
  const { rest, above, retarget } = S;
  const srcFrames = src.clip.frameCount, stride = src.stride, perFrame = src.bones.length * stride;
  const duration = src.clip.duration, frames = Math.max(2, Math.round(duration * MIXAMO_FPS) + 1);
  const times = Array.from({ length: frames }, (_, f) => Math.min(duration, f / MIXAMO_FPS));
  // 1. 源片段重采样到 30 fps，逐骨去抽搐（原片段里就有的一帧突变）
  const srcValues = times.map(t => SampleSource(src.clip.values, perFrame, stride, srcFrames, Math.min(srcFrames - 1, t * src.fps), new Float32Array(perFrame)));
  const srcTracks = ToTracks(srcValues.map(v => rest.bones.map((_, i) => new THREE.Quaternion().fromArray(v, i * stride + 3))), rest.bones.length);
  const despiked = [];
  srcTracks.forEach((tr, i) => {
    const hits = Fix.Despike(tr, DESPIKE_SOURCE);
    if (hits.length) despiked.push({ bone: XBOT_OF.get(rest.bones[i].key) || rest.bones[i].name, where: "源片段", hits });
  });
  srcTracks.forEach((tr, i) => srcValues.forEach((v, f) => v.set(tr.subarray(f * 4, f * 4 + 4), i * stride + 3)));
  // 2. 换算
  const srcQ = rest.bones.map(() => new THREE.Quaternion()), pelvis = new THREE.Vector3();
  const plain = [];
  for (let f = 0; f < frames; f++) {
    XBotRetarget.SourceWorld(rest, srcValues[f], stride, srcQ, pelvis, above);
    const localQ = xbot.rest.bones.map(() => new THREE.Quaternion()), hips = new THREE.Vector3();
    retarget.Solve(srcQ, pelvis, localQ, hips);
    plain.push({ localQ, hips, srcW: Fix.SourceKinematics(rest, srcValues[f], stride, above, []) });
  }
  if (spec.framesOnly) return { plain, S, src, times };   // 取证脚本拿换算后、修之前的帧
  // 改前 = 原来那份（24 fps 原样换算），按 30 fps 量（审查脚本看到的就是这个）
  const before = MeasureClip(BeforeFrames(src, S, times));
  // 3–4. 手与输出去抽搐，几种做法各做一遍，按审查口径挑超标最少的（保证不比只去抽搐差）：
  //   full  手从原身体换目标（攥着东西的按原手位置、贴身体的贴着）+ IK + 推出；
  //   push  不换目标，只把扎进身体的推出来；
  //   plain 手不动，只去抽搐。
  const hands = ANCHORED_HANDS[id] || "";
  // 护住原动作（POSE_GUARD）：原手贴着自己身体的帧修完离 X Bot 身体多远、手推出去多远
  const srcGap = new Fix.ArmFixer(xbot, { rest, volumes: S.volumes, scaleK: S.scaleK }).SourceGaps(plain);
  const ContactLoss = (fr) => {
    const depth = new Fix.ArmFixer(xbot).HandDepths(fr), loss = {};
    for (const s of ["Right", "Left"]) {
      let worst = 0;
      // 攥着别的东西的手（ANCHORED_HANDS）目标是那样东西，不是自己身体：不算
      if (!hands.includes(s[0])) depth[s].forEach((d, f) => { if (srcGap[s][f] <= POSE_GUARD.touchM) worst = Math.max(worst, -d - POSE_GUARD.keepM); });
      loss[s] = +(worst * 100).toFixed(1);
    }
    return loss;
  };
  const Variant = (mode) => {
    const fr = plain.map(x => ({ localQ: x.localQ.map(q => q.clone()), hips: x.hips, srcW: x.srcW }));
    const swivel = mode.endsWith("Swivel"), opts = { swivel, ...(mode.endsWith("Soft") ? { smoothFrames: 3, dirSmooth: 5, dilate: 3 } : {}),
      ...(mode.includes("Cap") ? { maxPush: POSE_GUARD.capM } : {}) };
    let armLog = null;
    if (mode.startsWith("full")) armLog = new Fix.ArmFixer(xbot, { rest, volumes: S.volumes, scaleK: S.scaleK }, { ...opts, contact: mode.startsWith("fullPalm") ? "palm" : "hand" })
      .Run(fr, { Right: hands.includes("R") ? 1 : 0, Left: hands.includes("L") ? 1 : 0 });
    if (mode.startsWith("push")) armLog = new Fix.ArmFixer(xbot, null, opts).Run(fr);
    const post = PostDespike(fr, retarget, mode !== "plain", opts);
    const after = MeasureClip(fr, post.tracks);
    const pushedCm = {};
    for (const s of ["Right", "Left"]) pushedCm[s] = Math.max(0, ...(armLog?.[s]?.pushed || []).map(d => d * 100)) + Math.max(0, ...(post.touchups?.[s] || []).map(t => t.cm));
    return { mode, fr, armLog, ...post, after, score: Excess(after), lost: ContactLoss(fr), pushedCm, elbows: new Fix.ArmFixer(xbot).Elbows(fr) };
  };
  let untouched = null;   // 「手不动、只去抽搐」那种：肘挪多少、手离身体多出多少都跟它比
  const ElbowCm = (v, s) => (untouched ? Math.max(0, ...v.elbows[s].map((e, f) => e.distanceTo(untouched.elbows[s][f]) * 100)) : 0);
  const Guard = (v) => ["Right", "Left"].reduce((t, s) => t + (Math.max(0, v.lost[s] - (untouched?.lost[s] ?? 0)) + Math.max(0, v.pushedCm[s] - POSE_GUARD.freePushM * 100)) * POSE_GUARD.perCm
    + (hands.includes(s[0]) ? 0 : Math.max(0, ElbowCm(v, s) - POSE_GUARD.freeElbowM * 100) * POSE_GUARD.perElbowCm), 0);   // 攥着东西的手肘本来就要跟着挪
  const Total = (v) => v.score + Guard(v);
  const variants = ["full", "fullPalm", "push", "plain", "fullCap", "fullCapSwivel", "pushCap"].map(Variant);
  untouched = variants.find(v => v.mode === "plain");
  // 还超标的再加带肘外转的几种（已达标的不动）
  if (Math.min(...variants.map(Total)) > 0) variants.push(...["fullSwivel", "fullPalmSwivel", "pushSwivel"].map(Variant));
  // 还超标的（多半是快动作里推出来的手一帧一拐）：推的轨迹平滑得更狠再试
  if (Math.min(...variants.map(Total)) > 0) variants.push(...["fullSoft", "fullPalmSoft", "pushSoft"].map(Variant));
  const pick = variants.reduce((a, b) => (Total(b) < Total(a) - 1e-6 ? b : a));
  const { tracks, fr: outFrames } = pick;
  let after = pick.after;
  // 可循环的：修手 / 去抽搐让首尾两帧不再一样，把差在最后几帧里慢慢补上（原片段首尾本来接得上）
  if (src.clip.loop) { CloseLoop(tracks, retarget); FromTracks(tracks, outFrames.map(fr => fr.localQ)); after = MeasureClip(outFrames, tracks); }
  const armLog = pick.armLog || { Right: Untouched(outFrames), Left: Untouched(outFrames) };
  armLog.anchored = pick.mode.startsWith("full") ? hands : "";
  armLog.touchups = pick.touchups;
  armLog.mode = pick.mode;
  armLog.scores = Object.fromEntries(variants.map(v => [v.mode, +v.score.toFixed(2)]));
  armLog.guard = Object.fromEntries(variants.map(v => [v.mode, +Guard(v).toFixed(1)]));
  despiked.push(...pick.despiked);
  const rotations = targetNames.map((_, i) => (retarget.srcIndex[i] >= 0 ? tracks[i] : null));
  const hipsTrack = new Float32Array(frames * 3);
  outFrames.forEach((fr, f) => hipsTrack.set(fr.hips.toArray(), f * 3));
  return { times, rotations, hips: hipsTrack, duration, loop: !!src.clip.loop, source: `${src.library}/${id}`, sourceModel: src.modelId,
    report: { before, after, armLog, despiked, scaleK: S.scaleK } };
}

/**
 * X Bot 输出去抽搐（手推出来的那几帧 IK 会急拐、原片段里父子关系不同的骨），去完又扎进身体的用同一套推法补推，来回几遍。
 * 改 frames 的 localQ；返回 { tracks, despiked, touchups }。
 */
function PostDespike(frames, retarget, touchup, fixOptions = {}) {
  const outQ = frames.map(fr => fr.localQ), despiked = [], touchups = { Right: [], Left: [] };
  // 每一步（去抽搐 / 补推）之后都按审查口径量一次，留超标最少的那一步（去抽搐和补推会互相拉扯，最后一步不一定最好）
  let best = null;
  const Keep = () => {
    const tracks = ToTracks(outQ, targetNames.length), score = Excess(MeasureClip(frames, tracks));
    if (!best || score < best.score - 1e-6) best = { score, q: outQ.map(qs => qs.map(q => q.clone())), despiked: despiked.length, touchups: { Right: touchups.Right.length, Left: touchups.Left.length } };
    return score;
  };
  for (let pass = 0; pass < 4; pass++) {
    const tracks = ToTracks(outQ, targetNames.length);
    let hit = 0;
    tracks.forEach((tr, i) => {
      if (retarget && retarget.srcIndex[i] < 0) return;
      const hits = Fix.Despike(tr, DESPIKE_OUTPUT);
      if (hits.length) { hit += 1; despiked.push({ bone: targetNames[i], where: "X Bot 输出", hits }); }
    });
    FromTracks(tracks, outQ);
    if (Keep() <= 0 || !touchup) break;
    const t = new Fix.ArmFixer(xbot, null, fixOptions).Run(frames);
    let any = false;
    for (const s of ["Right", "Left"]) t[s].moved.forEach((d, f) => { if (d > 0.003) { any = true; touchups[s].push({ frame: f, cm: +(d * 100).toFixed(1) }); } });
    if (Keep() <= 0 || (!any && !hit)) break;
  }
  outQ.forEach((qs, f) => qs.forEach((q, i) => q.copy(best.q[f][i])));
  despiked.length = best.despiked;
  if (best.score > 0) despiked.push(...GuardedDespike(frames, retarget));
  return { tracks: ToTracks(outQ, targetNames.length), despiked: MergeDespiked(despiked),
    touchups: { Right: touchups.Right.slice(0, best.touchups.Right), Left: touchups.Left.slice(0, best.touchups.Left) } };
}

/**
 * 还剩的抽搐逐个试着拉回：这一帧这根骨（胳膊上的连同同侧整条胳膊）拉向前后两帧的中间姿势，
 * 只在这一帧的手 / 前臂不因此超标（或不比原来更深）时才留下；胳膊上的还试「整条拉回后这只手就地推出」。返回去抽搐记录。
 */
const ARM_CHAIN = { Right: ["RightArm", "RightForeArm", "RightHand"], Left: ["LeftArm", "LeftForeArm", "LeftHand"] };
function GuardedDespike(frames, retarget) {
  const fixer = new Fix.ArmFixer(xbot), hits = new Map(), skip = new Set();
  const FrameExcess = (f) => {
    const m = fixer.Measure([frames[f]]);
    let e = 0;
    for (const s of ["Right", "Left"]) e += Math.max(0, m[s].hand.depth * 100 - 1.5) + Math.max(0, m[s].fore.depth * 100 - 2);
    return e;
  };
  const mid = new THREE.Quaternion();
  for (let it = 0; it < 60; it++) {
    const tracks = ToTracks(frames.map(fr => fr.localQ), targetNames.length);
    const g = Fix.Glitches(tracks, targetNames, 13).filter(x => !skip.has(`${x.bone}@${x.frame}`) && (!retarget || retarget.srcIndex[targetNames.indexOf(x.bone)] >= 0));
    if (!g.length) break;
    const { bone, frame: f, deg } = g[0];
    const side = bone.startsWith("Right") ? "Right" : bone.startsWith("Left") ? "Left" : null;
    const groups = [[bone], ...(side && ARM_CHAIN[side].includes(bone) ? [ARM_CHAIN[side]] : [])];
    const before = FrameExcess(f), saved = frames[f].localQ.map(q => q.clone());
    let done = false;
    for (const group of groups) for (const w of [1, 0.75, 0.5]) {
      if (done) break;
      for (const name of group) {
        const i = targetNames.indexOf(name);
        mid.copy(frames[f - 1].localQ[i]).slerp(frames[f + 1].localQ[i], 0.5);
        frames[f].localQ[i].copy(saved[i]).slerp(mid, w);
      }
      if (FrameExcess(f) <= before + 0.05) { done = true; break; }
      frames[f].localQ.forEach((q, i) => q.copy(saved[i]));
    }
    if (!done && side) {
      // 拉回之后手扎进去了：这一帧这只手就地推出（不平滑），抽得仍 ≤ 13° 才留下
      for (const name of ARM_CHAIN[side]) {
        const i = targetNames.indexOf(name);
        mid.copy(frames[f - 1].localQ[i]).slerp(frames[f + 1].localQ[i], 0.5);
        frames[f].localQ[i].copy(mid);
      }
      const worlds = [];
      Fix.ForwardKinematics(xbot.rest.bones, frames[f].localQ, xbot.above, worlds, fixer.hips, frames[f].hips);
      const T = fixer.PushOut(frames[f].localQ, frames[f].hips, worlds, side, fixer.Palm(worlds, side));
      Fix.ForwardKinematics(xbot.rest.bones, frames[f].localQ, xbot.above, worlds, fixer.hips, frames[f].hips);
      fixer.SolveArm(frames[f].localQ, frames[f].hips, worlds, side, T);
      const i = targetNames.indexOf(bone), q = frames[f].localQ[i];
      const local = Fix.Angle(q, mid.copy(frames[f - 1].localQ[i]).slerp(frames[f + 1].localQ[i], 0.5));
      if (FrameExcess(f) <= before + 0.05 && local <= 13) done = true;
      else frames[f].localQ.forEach((q2, j) => q2.copy(saved[j]));
    }
    if (!done) {
      // 快动作里急拐（一帧转 30° 上下又换方向）：拉一帧只会把抽搐挪到隔壁帧 —— 前后 3 帧一起磨平（这根骨，胳膊上的连同整条胳膊），
      // 磨平后扎进身体的再推出
      const group = side && ARM_CHAIN[side].includes(bone) ? ARM_CHAIN[side] : [bone];
      const lo = Math.max(1, f - 3), hi = Math.min(frames.length - 2, f + 3);
      const win = []; for (let k = lo; k <= hi; k++) win.push(k);
      const keep = win.map(k => frames[k].localQ.map(q => q.clone()));
      const exBefore = win.reduce((a2, k) => a2 + FrameExcess(k), 0);
      for (let round = 0; round < 4; round++) {
        const next = win.map(k => group.map(name => { const i = targetNames.indexOf(name); return frames[k].localQ[i].clone().slerp(mid.copy(frames[k - 1].localQ[i]).slerp(frames[k + 1].localQ[i], 0.5), 0.5); }));
        win.forEach((k, wi) => group.forEach((name, gi) => frames[k].localQ[targetNames.indexOf(name)].copy(next[wi][gi])));
      }
      // 磨平后手扎进去的帧就地推出（推的量前后平滑过的同一套推法），再看抽搐
      if (side && win.reduce((a2, k) => a2 + FrameExcess(k), 0) > exBefore + 0.05) {
        const sub = win.map(k => frames[k]);
        new Fix.ArmFixer(xbot).Run(sub);
      }
      const tr2 = ToTracks(frames.map(fr => fr.localQ.map(q => q.clone())), targetNames.length);
      const worst = Math.max(0, ...Fix.Glitches(tr2, targetNames, 0).filter(x => group.includes(x.bone) && x.frame >= lo - 1 && x.frame <= hi + 1).map(x => x.deg));
      const exAfter = win.reduce((a2, k) => a2 + FrameExcess(k), 0);
      if (worst <= 13 && exAfter <= exBefore + 0.05) done = true;
      else win.forEach((k, wi) => frames[k].localQ.forEach((q2, j) => q2.copy(keep[wi][j])));
    }
    if (done) { const k = `X Bot 输出|${bone}`; (hits.get(k) || hits.set(k, []).get(k)).push({ frame: f, deg }); }
    else skip.add(`${bone}@${f}`);
  }
  return [...hits].map(([k, h]) => ({ bone: k.split("|")[1], where: "X Bot 输出（不让手扎回去）", hits: h }));
}

/** 可循环动作：每根骨最后 LOOP_BLEND 帧逐渐乘上「末帧 → 首帧」的差，末帧落回首帧。 */
const LOOP_BLEND = 8;
function CloseLoop(tracks, retarget) {
  const a = new THREE.Quaternion(), b = new THREE.Quaternion(), d = new THREE.Quaternion(), q = new THREE.Quaternion(), I = new THREE.Quaternion();
  tracks.forEach((tr, i) => {
    if (retarget && retarget.srcIndex[i] < 0) return;
    const n = tr.length / 4, k = Math.min(LOOP_BLEND, n - 1);
    a.fromArray(tr, (n - 1) * 4); b.fromArray(tr, 0);
    d.copy(a).invert().multiply(b);                       // 末帧 × d = 首帧（本地右乘）
    for (let j = 1; j <= k; j++) {
      const f = n - 1 - k + j, w = j / k, e = w * w * (3 - 2 * w);
      q.fromArray(tr, f * 4).multiply(I.identity().slerp(d, e));
      const prev = new THREE.Quaternion().fromArray(tr, (f - 1) * 4);
      if (prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      tr.set([q.x, q.y, q.z, q.w], f * 4);
    }
  });
}

/** 同一根骨几遍去抽搐的记录并成一条（帧取并集、度数取第一次量到的）。 */
function MergeDespiked(list) {
  const by = new Map();
  for (const d of list) {
    const key = `${d.where}|${d.bone}`, m = by.get(key) || { ...d, hits: [] };
    for (const h of d.hits) if (!m.hits.some(x => x.frame === h.frame)) m.hits.push(h);
    by.set(key, m);
  }
  return [...by.values()].map(d => ({ ...d, hits: d.hits.sort((a, b) => a.frame - b.frame) }));
}

/** 审查口径的超标量：手 > 1.5 cm、前臂 > 2 cm 的厘米数，加抽搐 > 15° 的度数 ÷ 4。 */
function Excess(m) {
  let e = 0;
  for (const s of ["Right", "Left"]) e += Math.max(0, m.handCm[s] - 1.5) + Math.max(0, m.forearmCm[s] - 2);
  return e + Math.max(0, m.glitchDeg - 15) / 4;
}
const Untouched = (frames) => ({ moved: frames.map(() => 0), pushed: frames.map(() => 0), alpha: frames.map(() => 0), reach: frames.map(() => false) });

/** 原来的做法（24 fps 逐帧换算、不修）按 30 fps 取样的帧，量改前用。 */
function BeforeFrames(src, S, times) {
  const { rest, above, retarget } = S, stride = src.stride, perFrame = src.bones.length * stride, n = src.clip.frameCount;
  const srcQ = rest.bones.map(() => new THREE.Quaternion()), pelvis = new THREE.Vector3();
  const keys = [];
  for (let f = 0; f < n; f++) {
    XBotRetarget.SourceWorld(rest, src.clip.values.slice(f * perFrame, (f + 1) * perFrame), stride, srcQ, pelvis, above);
    const localQ = xbot.rest.bones.map(() => new THREE.Quaternion()), hips = new THREE.Vector3();
    retarget.Solve(srcQ, pelvis, localQ, hips);
    keys.push({ localQ, hips });
  }
  return times.map(t => {
    const at = Math.min(n - 1, t * src.fps), i0 = Math.floor(at), i1 = Math.min(n - 1, i0 + 1), a = at - i0;
    return { localQ: keys[i0].localQ.map((q, i) => q.clone().slerp(keys[i1].localQ[i], a)), hips: keys[i0].hips.clone().lerp(keys[i1].hips, a) };
  });
}

const FINGER_OR_TOE = /Hand.+\d$|Toe/;
/** 按审查脚本的量法量一条：手 / 前臂进身体最深（cm）、抽搐最大（度；手指脚趾另记）。 */
function MeasureClip(frames, tracks = null) {
  const m = new Fix.ArmFixer(xbot).Measure(frames);
  const t = tracks || ToTracks(frames.map(fr => fr.localQ.map(q => q.clone())), targetNames.length);
  const glitches = Fix.Glitches(t, targetNames, 12);
  const body = glitches.filter(g => !FINGER_OR_TOE.test(g.bone)), finger = glitches.filter(g => FINGER_OR_TOE.test(g.bone));
  const cm = (d) => +(Math.max(0, d) * 100).toFixed(1);
  const Where = (h) => (h.depth > 0 ? `${h.part ? h.part + "→" : "→"}${h.bone}@${h.frame}` : null);
  return {
    handCm: { Right: cm(m.Right.hand.depth), Left: cm(m.Left.hand.depth) },
    forearmCm: { Right: cm(m.Right.fore.depth), Left: cm(m.Left.fore.depth) },
    glitchDeg: body[0]?.deg || 0, glitchAt: body[0] ? `${body[0].bone}@${body[0].frame}` : null,
    fingerGlitchDeg: finger[0]?.deg || 0,
    at: { handRight: Where(m.Right.hand), handLeft: Where(m.Left.hand), foreRight: Where(m.Right.fore), foreLeft: Where(m.Left.fore) },
  };
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
  // 后处理：没有原身体可换，只按 X Bot 身体表面把扎进去的手推出来，再去抽搐（左右对调前 Mixamo 原件就有的问题）；
  // 推与不推各做一遍，挑审查口径超标少的
  const plain = times.map((_, f) => ({ localQ: targetNames.map((__, i) => new THREE.Quaternion().fromArray(rotations[i], f * 4)), hips: new THREE.Vector3().fromArray(hipsTrack, f * 3) }));
  const before = MeasureClip(plain.map(fr => ({ localQ: fr.localQ.map(q => q.clone()), hips: fr.hips })));
  const variants = ["push", "plain"].map(mode => {
    const fr = plain.map(x => ({ localQ: x.localQ.map(q => q.clone()), hips: x.hips }));
    const armLog = mode === "push" ? new Fix.ArmFixer(xbot).Run(fr) : null;
    const post = PostDespike(fr, null, mode === "push");
    const after = MeasureClip(fr, post.tracks);
    return { mode, fr, armLog, ...post, after, score: Excess(after) };
  });
  const pick = variants.reduce((a, b) => (b.score < a.score - 1e-6 ? b : a));
  const armLog = pick.armLog || { Right: Untouched(pick.fr), Left: Untouched(pick.fr) };
  Object.assign(armLog, { touchups: pick.touchups, mode: pick.mode, scores: Object.fromEntries(variants.map(v => [v.mode, +v.score.toFixed(2)])) });
  return { times, rotations: pick.tracks, hips: hipsTrack, duration, loop: !!spec.loop, source: `Mixamo/${spec.file} (mirrored)`,
    report: { before, after: pick.after, armLog, despiked: pick.despiked, mirror: true } };
}

/** 调整记录（_import/MixamoFixes/README.md 的格式）：改了什么、改前改后（审查脚本同一套量法，帧号按 30 fps）。没改动返回 null。 */
function FixRecord(id, file, baked) {
  const r = baked.report;
  if (!r) return null;
  const cm = (d) => +(d * 100).toFixed(1), changes = [], SIDE = { Right: "右", Left: "左" };
  for (const s of ["Right", "Left"]) {
    const L = r.armLog[s];
    const moved = L.moved.map((d, f) => [d, f]).filter(([d]) => d > 0.01);
    if (!moved.length) continue;
    const peak = moved.reduce((a, b) => (b[0] > a[0] ? b : a));
    const body = moved.filter(([, f]) => L.alpha[f] > 0.5).map(([, f]) => f);
    const pushed = L.pushed.map((d, f) => [d, f]).filter(([d]) => d > 0.005);
    const reach = L.reach.filter(Boolean).length;
    const anchored = (L.anchored ?? r.armLog.anchored ?? "").includes(s[0]);
    let line = r.mirror
      ? `第 ${Ranges(moved.map(x => x[1]))} 帧 ${SIDE[s]}臂两节骨 IK：手掌 / 前臂扎进身体，掌心沿身体表面外推（最多 ${cm(peak[0])} cm，第 ${peak[1]} 帧），前后平滑，手腕朝向不变`
      : `第 ${Ranges(moved.map(x => x[1]))} 帧 ${SIDE[s]}臂两节骨 IK 换手的位置：掌心比原换算挪了最多 ${cm(peak[0])} cm（第 ${peak[1]} 帧），手腕朝向、肘弯平面不变`;
    if (!r.mirror) {
      if (anchored) line += `；这只手攥着东西，目标取原身体掌心位置 ÷ 头高比 ${(1 / r.scaleK).toFixed(3)}（运行时缩放后落在原来那只手的位置）`;
      line += body.length ? `；第 ${Ranges(body)} 帧原手贴着自己身体，X Bot 掌心沿最近那段身体的表面法向挪到同样远` : "";
      if (pushed.length) line += `；第 ${Ranges(pushed.map(x => x[1]))} 帧再沿 X Bot 身体表面外推（最多 ${cm(Math.max(...pushed.map(x => x[0])))} cm，前后平滑）`;
    }
    if (reach) line += `；${reach} 帧伸直也够不着，手停在伸直处`;
    const sw = (L.swivelDeg || []).map((d, f) => [d, f]).filter(([d]) => Math.abs(d) > 1);
    if (sw.length) line += `；第 ${Ranges(sw.map(x => x[1]))} 帧肘绕肩—腕连线外转（最多 ${Math.max(...sw.map(x => Math.abs(x[0])))}°，手的位置不变，前后平滑）`;
    changes.push(line);
  }
  for (const s of ["Right", "Left"]) {
    const t = r.armLog.touchups?.[s] || [];
    if (t.length) changes.push(`去抽搐后第 ${Ranges(t.map(x => x.frame))} 帧${SIDE[s]}手 / 前臂又扎进身体，同一套推法补推（最多 ${Math.max(...t.map(x => x.cm))} cm）`);
  }
  for (const d of r.despiked) {
    const max = Math.max(...d.hits.map(h => h.deg));
    changes.push(`去抽搐（${d.where}）：${d.bone} 第 ${Ranges(d.hits.map(h => h.frame))} 帧拉回前后两帧的中间姿势（原来离中间最多 ${max}°）`);
  }
  if (!changes.length) return null;
  const MODE = { full: "手从原身体换目标（贴身体按手上各点量）+ 推出", fullPalm: "手从原身体换目标（贴身体按掌心量）+ 推出",
    fullSoft: "手从原身体换目标（按手上各点）+ 推出（轨迹平滑加倍）", fullPalmSoft: "手从原身体换目标（按掌心）+ 推出（轨迹平滑加倍）", pushSoft: "只推出（轨迹平滑加倍）",
    fullSwivel: "手从原身体换目标（按手上各点）+ 推出 + 肘外转", fullPalmSwivel: "手从原身体换目标（按掌心）+ 推出 + 肘外转", pushSwivel: "只推出 + 肘外转", push: "只推出（不换目标）", plain: "手不动、只去抽搐",
    fullCap: "手从原身体换目标（按手上各点）+ 推出（最多推 6 cm）", fullCapSwivel: "手从原身体换目标（按手上各点）+ 推出（最多推 6 cm）+ 肘外转", pushCap: "只推出（最多推 6 cm）" };
  if (r.armLog.mode) changes.push(`几种做法按审查口径的超标量（手 > 1.5 cm、前臂 > 2 cm 的厘米数 + 抽搐 > 15° 的度数 ÷ 4），加上护住原动作的分（手推出去超过 8 cm、原手贴着身体修完离开 4 cm 以上每厘米 0.5 分，肘挪开超过 8 cm 每厘米 0.6 分），挑了「${MODE[r.armLog.mode]}」：${Object.entries(r.armLog.scores).map(([k, v]) => `${MODE[k]} ${v}${r.armLog.guard?.[k] ? ` + ${r.armLog.guard[k]}` : ""}`).join("，")}`);
  const B = r.before, A = r.after, bits = [];
  for (const [k, label] of [["handCm", "手"], ["forearmCm", "前臂"]]) for (const s of ["Right", "Left"]) if (B[k][s] > 1.5) bits.push(`${SIDE[s]}${label}进身体 ${B[k][s]} cm`);
  if (B.glitchDeg > 15) bits.push(`${B.glitchAt.split("@")[0]} 一帧抽 ${B.glitchDeg}°`);
  const HOW = { full: "手按原身体换目标位置两节骨 IK（攥着东西的对准原手位置、贴身体的贴着）、仍扎进去的推出", push: "扎进去的手沿身体表面推出", plain: null };
  const baseHow = HOW[(r.armLog.mode || "push").replace("Palm", "").replace("Swivel", "").replace("Soft", "").replace("Cap", "")];
  const how = [baseHow && baseHow + (/Swivel/.test(r.armLog.mode || "") ? "（推不干净的帧肘绕肩—腕连线外转）" : ""), r.despiked.length ? "抽搐的帧拉回前后中间" : null].filter(Boolean).join("，") || "没改";
  return {
    file: `Derived/${file}`, topic: "Derive", kind: "anim", date: "2026-11-02", author: "Claude Opus 5.5",
    summary: `${bits.length ? "换算后" + bits.join("、") : "换算后手与原身体对不上"}：${how}`,
    changes,
    before: { handCm: B.handCm, forearmCm: B.forearmCm, glitchDeg: B.glitchDeg, ...(B.glitchAt ? { glitchAt: B.glitchAt } : {}), at: B.at },
    after: { handCm: A.handCm, forearmCm: A.forearmCm, glitchDeg: A.glitchDeg, ...(A.glitchAt ? { glitchAt: A.glitchAt } : {}), at: A.at },
    sources: ["Taierzhuang1938/_import/Script_XBotDeriveClips.mjs", "Taierzhuang1938/_import/Script_XBotDeriveFix.mjs"],
  };
}

// 调试 / 取证脚本可以 import 本文件拿内部函数（不烘）
export { xbot, targetNames, ANCHORED_HANDS, SourceRest, SourceClips, Retarget, Mirror, MeasureClip, FixRecord };
if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await Main();

async function Main() {
  const only = new Set(process.argv.slice(2).filter(a => !a.startsWith("--")));
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(FIXES, { recursive: true });
  const summary = [];
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
    const record = FixRecord(id, file, baked), recordPath = path.join(FIXES, file.replace(/\.glb$/, ".Derive.fix.json"));
    if (record) fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
    else if (fs.existsSync(recordPath)) fs.rmSync(recordPath);
    const B = baked.report.before, A = baked.report.after, f1 = (x) => x.toFixed(1).padStart(5);
    summary.push(`${id.padEnd(28)} 手 R${f1(B.handCm.Right)}→${f1(A.handCm.Right)} L${f1(B.handCm.Left)}→${f1(A.handCm.Left)} | 前臂 R${f1(B.forearmCm.Right)}→${f1(A.forearmCm.Right)} L${f1(B.forearmCm.Left)}→${f1(A.forearmCm.Left)} | 抽 ${f1(B.glitchDeg)}→${f1(A.glitchDeg)}`);
    made += 1;
  }
  console.log(summary.join("\n"));
  manifest.clips = Object.fromEntries(Object.entries(manifest.clips).filter(([id]) => XBOT_PREVIZ_CLIPS[id]?.retarget || XBOT_PREVIZ_CLIPS[id]?.mirror).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[XBotDerive] baked ${made}, manifest ${Object.keys(manifest.clips).length} clips → ${path.relative(PROJECT, OUT)}`);
  // 动作库清单（预览工具读）跟着刷新：派生动作归「白盒预演派生」
  const { execFileSync } = await import("node:child_process");
  if (!process.argv.includes("--no-prune")) execFileSync(process.execPath, [path.join(HERE, "Script_MixamoLibraryFetch.mjs"), "--prune"], { stdio: "inherit" });
}
