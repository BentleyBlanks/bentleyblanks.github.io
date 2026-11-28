// SOMA-X v0.3.3 (77 active joints) → Mixamo X Bot (65 joints) real mathematical retargeter.
// Uses Three.js from Taierzhuang1938/vendor/three (zero external deps) and writes a standard
// bone-only Mixamo X Bot animation GLB directly compatible with Script_XBotCharacters.ClipForCharacter().

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const THREE = await import(
  pathToFileURL(path.join(REPO_ROOT, "Taierzhuang1938", "vendor", "three", "build", "three.module.js")).href
);
const DEFAULT_XBOT_GLB = path.join(REPO_ROOT, "Taierzhuang1938", "Animation", "Mixamo", "Model_MixamoXBot.glb");

// SOMA-77 joint name → Mixamo X Bot bone name (52 active joints: 22 body + 30 finger phalanges).
// Note: In SOMA-X, Finger1 for Index/Middle/Ring/Pinky is the metacarpal inside the palm, while
// Finger2/3/4 are the 3 articulating phalanges (MCP/PIP/DIP) matching Mixamo HandFinger1/2/3.
export const SOMA_TO_MIXAMO = Object.freeze((() => {
  const map = {
    Hips: "Hips",
    Spine1: "Spine",
    Spine2: "Spine1",
    Chest: "Spine2",
    Neck1: "Neck",
    Head: "Head",
  };
  for (const side of ["Left", "Right"]) {
    Object.assign(map, {
      [`${side}Shoulder`]: `${side}Shoulder`,
      [`${side}Arm`]: `${side}Arm`,
      [`${side}ForeArm`]: `${side}ForeArm`,
      [`${side}Hand`]: `${side}Hand`,
      [`${side}Leg`]: `${side}UpLeg`,
      [`${side}Shin`]: `${side}Leg`,
      [`${side}Foot`]: `${side}Foot`,
      [`${side}ToeBase`]: `${side}ToeBase`,
      // Thumb (1:1)
      [`${side}HandThumb1`]: `${side}HandThumb1`,
      [`${side}HandThumb2`]: `${side}HandThumb2`,
      [`${side}HandThumb3`]: `${side}HandThumb3`,
    });
    for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
      map[`${side}Hand${f}2`] = `${side}Hand${f}1`;
      map[`${side}Hand${f}3`] = `${side}Hand${f}2`;
      map[`${side}Hand${f}4`] = `${side}Hand${f}3`;
    }
  }
  return map;
})());

// Child reference used for rest-pose 1D swing alignment when bone has a single anatomical axis.
// Note: Spine/Spine1/Spine2, LeftShoulder/RightShoulder, and Neck/Head are intentionally omitted:
// - Mixamo X Bot has an artificial -8.5°/-7° backward rest lordosis on Spine/Spine1/Spine2, while
//   SOMA-77 has a sternum-forward clavicle offset (-21° vs -12°) and dummy head leaf offsets.
//   Aligning those rest vectors injects +6~15° of forward torso hunch and clavicle retraction/shrug,
//   causing the neck/head to jut out of the collar on crouched characters (especially child rigs like Nier).
const SWING_CHILD_PAIR = Object.freeze((() => {
  const pairs = {};
  for (const side of ["Left", "Right"]) {
    pairs[`${side}Arm`] = [`${side}ForeArm`, `${side}ForeArm`];
    pairs[`${side}ForeArm`] = [`${side}Hand`, `${side}Hand`];
    pairs[`${side}UpLeg`] = [`${side}Shin`, `${side}Leg`];
    pairs[`${side}Leg`] = [`${side}Foot`, `${side}Foot`];
    pairs[`${side}Foot`] = [`${side}ToeBase`, `${side}ToeBase`];
    pairs[`${side}ToeBase`] = [`${side}ToeEnd`, `${side}Toe_End`];
    pairs[`${side}HandThumb1`] = [`${side}HandThumb2`, `${side}HandThumb2`];
    pairs[`${side}HandThumb2`] = [`${side}HandThumb3`, `${side}HandThumb3`];
    pairs[`${side}HandThumb3`] = [`${side}HandThumbEnd`, `${side}HandThumb4`];
    for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
      pairs[`${side}Hand${f}1`] = [`${side}Hand${f}3`, `${side}Hand${f}2`];
      pairs[`${side}Hand${f}2`] = [`${side}Hand${f}4`, `${side}Hand${f}3`];
      pairs[`${side}Hand${f}3`] = [`${side}Hand${f}End`, `${side}Hand${f}4`];
    }
  }
  return pairs;
})());

function readGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binHeader = 20 + jsonLen;
  const binLen = buf.length > binHeader + 8 ? buf.readUInt32LE(binHeader) : 0;
  const bin = binLen ? buf.subarray(binHeader + 8, binHeader + 8 + binLen) : Buffer.alloc(0);
  return { json, bin };
}

function readAccessor({ json, bin }, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const byteOffset = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || comps * 4;
  const out = new Float32Array(a.count * comps);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < comps; c++) {
      out[i * comps + c] = bin.readFloatLE(byteOffset + i * stride + c * 4);
    }
  }
  return { values: out, comps, count: a.count };
}

function nodeLocalMatrix(n) {
  const m = new THREE.Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  const t = n.translation || [0, 0, 0];
  const r = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  return m.compose(
    new THREE.Vector3(t[0], t[1], t[2]),
    new THREE.Quaternion(r[0], r[1], r[2], r[3]),
    new THREE.Vector3(s[0], s[1], s[2])
  );
}

function computeRestNodes(json) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const world = json.nodes.map(() => null);
  const getW = (i) => {
    if (world[i]) return world[i];
    const m = nodeLocalMatrix(json.nodes[i]);
    if (parent.has(i)) m.premultiply(getW(parent.get(i)));
    return (world[i] = m);
  };
  json.nodes.forEach((_, i) => getW(i));

  const byName = new Map();
  json.nodes.forEach((n, i) => {
    if (n.name && !byName.has(n.name)) byName.set(n.name, i);
  });

  const worldP = world.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const worldQ = world.map((m) =>
    new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m))
  );
  return { parent, world, worldP, worldQ, byName };
}

function basisQuat(primaryVec, secondaryVec) {
  const x = primaryVec.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, secondaryVec).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// Compute 3D alignment rotation S that maps source rest anatomical frame -> target rest anatomical frame.
// With R_target(t) = R_source(t) * (R_s0^-1 * S^-1 * R_t0), when R_source = R_s0 (A-pose),
// R_target = S^-1 * R_t0 (puts T-pose target into exact A-pose).
function computeRestAlign(targetBoneName, somaRest, xbotRest) {
  const sPos = (name) => {
    const idx = somaRest.byName.get(name);
    return idx !== undefined ? somaRest.worldP[idx] : null;
  };
  const tPos = (name) => {
    const idx = xbotRest.byName.get(name);
    return idx !== undefined ? xbotRest.worldP[idx] : null;
  };

  // Full 3D orthonormal frame alignment for Hips (zero torso twist)
  if (targetBoneName === "Hips") {
    const sUp = sPos("Chest").clone().sub(sPos("Hips"));
    const sLeft = sPos("LeftLeg").clone().sub(sPos("RightLeg"));
    const tUp = tPos("Spine2").clone().sub(tPos("Hips"));
    const tLeft = tPos("LeftUpLeg").clone().sub(tPos("RightUpLeg"));
    const qS = basisQuat(sUp, sLeft);
    const qT = basisQuat(tUp, tLeft);
    return qT.multiply(qS.invert());
  }

  // Full 3D orthonormal frame alignment for Hands (aligns both finger direction AND palm normal!)
  if (targetBoneName === "LeftHand" || targetBoneName === "RightHand") {
    const side = targetBoneName.startsWith("Left") ? "Left" : "Right";
    const sH = sPos(`${side}Hand`);
    const sMid = sPos(`${side}HandMiddle2`);
    const sIdx = sPos(`${side}HandIndex2`);
    const sPnk = sPos(`${side}HandPinky2`);
    const tH = tPos(`${side}Hand`);
    const tMid = tPos(`${side}HandMiddle1`);
    const tIdx = tPos(`${side}HandIndex1`);
    const tPnk = tPos(`${side}HandPinky1`);
    if (sH && sMid && sIdx && sPnk && tH && tMid && tIdx && tPnk) {
      const qS = basisQuat(sMid.clone().sub(sH), sIdx.clone().sub(sPnk));
      const qT = basisQuat(tMid.clone().sub(tH), tIdx.clone().sub(tPnk));
      return qT.multiply(qS.invert());
    }
  }

  // Full 3D alignment for Arms / ForeArms using shoulder-to-elbow + arm-to-world-up plane
  // so A-pose arms do not introduce axial twist when mapped to T-pose Mixamo arms.
  if (/^(Left|Right)(Arm|ForeArm)$/.test(targetBoneName)) {
    const side = targetBoneName.startsWith("Left") ? "Left" : "Right";
    const isUpper = targetBoneName.endsWith("Arm") && !targetBoneName.endsWith("ForeArm");
    const sA = sPos(isUpper ? `${side}Arm` : `${side}ForeArm`);
    const sB = sPos(isUpper ? `${side}ForeArm` : `${side}Hand`);
    const tA = tPos(isUpper ? `${side}Arm` : `${side}ForeArm`);
    const tB = tPos(isUpper ? `${side}ForeArm` : `${side}Hand`);
    if (sA && sB && tA && tB) {
      const sDir = sB.clone().sub(sA).normalize();
      const tDir = tB.clone().sub(tA).normalize();
      return new THREE.Quaternion().setFromUnitVectors(sDir, tDir);
    }
  }

  // Standard 1D anatomical axis swing alignment for remaining bones
  const pair = SWING_CHILD_PAIR[targetBoneName];
  if (pair) {
    const srcBoneName = Object.entries(SOMA_TO_MIXAMO).find(([, t]) => t === targetBoneName)?.[0];
    const sA = srcBoneName ? sPos(srcBoneName) : null;
    const sB = sPos(pair[0]);
    const tA = tPos(targetBoneName);
    const tB = tPos(pair[1]);
    if (sA && sB && tA && tB) {
      const dirS = sB.clone().sub(sA);
      const dirT = tB.clone().sub(tA);
      if (dirS.lengthSq() > 1e-10 && dirT.lengthSq() > 1e-10) {
        return new THREE.Quaternion().setFromUnitVectors(dirS.normalize(), dirT.normalize());
      }
    }
  }

  return new THREE.Quaternion();
}

function writeMixamoAnimationGlb(outPath, clipName, boneNames, times, rotationsByBone, hipsTranslations) {
  const chunks = [];
  const accessors = [];
  const views = [];
  let byteLength = 0;

  const pushFloats = (floats, type, includeMinMax = false) => {
    const bytes = Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
    views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length });
    chunks.push(bytes);
    byteLength += bytes.length;
    const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const acc = {
      bufferView: views.length - 1,
      componentType: 5126,
      count: floats.length / comps,
      type,
    };
    if (includeMinMax) {
      acc.min = [floats[0]];
      acc.max = [floats[floats.length - 1]];
    }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const timeAcc = pushFloats(Float32Array.from(times), "SCALAR", true);
  const samplers = [];
  const channels = [];

  boneNames.forEach((bName, i) => {
    const rotArr = rotationsByBone[i];
    if (!rotArr) return;
    samplers.push({ input: timeAcc, output: pushFloats(rotArr, "VEC4"), interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: i, path: "rotation" } });
  });

  if (hipsTranslations) {
    const hi = boneNames.indexOf("Hips");
    if (hi >= 0) {
      samplers.push({
        input: timeAcc,
        output: pushFloats(hipsTranslations, "VEC3"),
        interpolation: "LINEAR",
      });
      channels.push({ sampler: samplers.length - 1, target: { node: hi, path: "translation" } });
    }
  }

  const gltf = {
    asset: { version: "2.0", generator: "MotionWorkbench/Script_SomaToMixamo.mjs" },
    scene: 0,
    scenes: [{ nodes: boneNames.map((_, i) => i) }],
    nodes: boneNames.map((name) => ({ name })),
    animations: [{ name: clipName, samplers, channels }],
    buffers: [{ byteLength }],
    bufferViews: views,
    accessors,
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  let binBuf = Buffer.concat(chunks);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);

  const chunkHead = (len, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(len, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    Buffer.concat([
      header,
      chunkHead(jsonBuf.length, 0x4e4f534a),
      jsonBuf,
      chunkHead(binBuf.length, 0x004e4942),
      binBuf,
    ])
  );
}

/**
 * Convert a GEM-X SOMA-77 GLB animation file into a standard Mixamo X Bot 65-bone animation GLB.
 * Returns { outPath, sizeBytes, qa } with real measured retarget metrics.
 */
export function retargetSomaGlbToMixamo({
  somaGlbPath,
  outGlbPath,
  clipName = "MotionRetargeted",
  xbotGlbPath = DEFAULT_XBOT_GLB,
}) {
  const soma = readGlb(somaGlbPath);
  const xbot = readGlb(xbotGlbPath);

  const somaRest = computeRestNodes(soma.json);
  const xbotRest = computeRestNodes(xbot.json);

  // Extract Mixamo X Bot skeleton in strict parent-first order
  const xbotJoints = xbot.json.skins[0].joints;
  const xbotNodeToJoint = new Map(xbotJoints.map((nodeIdx, ji) => [nodeIdx, ji]));
  const xbotBones = xbotJoints.map((nodeIdx) => {
    const n = xbot.json.nodes[nodeIdx];
    const pNode = xbotRest.parent.get(nodeIdx);
    const parent = pNode !== undefined && xbotNodeToJoint.has(pNode) ? xbotNodeToJoint.get(pNode) : -1;
    return {
      name: n.name,
      nodeIdx,
      parent,
      worldQ: xbotRest.worldQ[nodeIdx].clone(),
      worldP: xbotRest.worldP[nodeIdx].clone(),
      localQ: new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      localP: new THREE.Vector3(...(n.translation || [0, 0, 0])),
    };
  });

  // Static parent above X Bot Hips (Armature node: 90° X, scale 0.01)
  const xbotHipsIdx = xbotBones.findIndex((b) => b.name === "Hips");
  const xbotRootNode = xbotBones[xbotHipsIdx].nodeIdx;
  const xbotAboveNode = xbotRest.parent.get(xbotRootNode);
  const rootParentM =
    xbotAboveNode !== undefined ? xbotRest.world[xbotAboveNode].clone() : new THREE.Matrix4();
  const rootParentQ = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().extractRotation(rootParentM)
  );
  const rootParentInv = rootParentM.clone().invert();

  // Reverse map: Mixamo bone name -> SOMA node index
  const mixamoToSomaIdx = new Map();
  for (const [sName, mName] of Object.entries(SOMA_TO_MIXAMO)) {
    const sIdx = somaRest.byName.get(sName);
    if (sIdx !== undefined) mixamoToSomaIdx.set(mName, sIdx);
  }
  const neck2Idx = somaRest.byName.get("Neck2");

  // Precompute rest-pose correction quaternion C_i = R_s0^-1 * S^-1 * R_t0 for each mapped bone
  const corrections = xbotBones.map((b) => {
    const sIdx = mixamoToSomaIdx.get(b.name);
    if (sIdx === undefined) return null;
    const alignS = computeRestAlign(b.name, somaRest, xbotRest);
    return somaRest.worldQ[sIdx].clone().invert().multiply(alignS.invert()).multiply(b.worldQ);
  });

  // Read SOMA animation channels (each channel may have its own keyframe count; e.g. static Root has 2 keys while animated joints have 300)
  const anim = soma.json.animations?.[0];
  if (!anim) throw new Error(`No animation found in ${somaGlbPath}`);

  const rotTracks = new Map();
  const transTracks = new Map();
  let times = null;

  for (const ch of anim.channels) {
    const sampler = anim.samplers[ch.sampler];
    const nodeIdx = ch.target.node;
    const chTimes = readAccessor(soma, sampler.input).values;
    const chVals = readAccessor(soma, sampler.output).values;
    if (!times || chTimes.length > times.length) {
      times = chTimes;
    }
    if (ch.target.path === "rotation") rotTracks.set(nodeIdx, { times: chTimes, values: chVals });
    else if (ch.target.path === "translation") transTracks.set(nodeIdx, { times: chTimes, values: chVals });
  }

  function sampleTrackVec3(track, t, fallback) {
    if (!track) return fallback;
    const ts = track.times;
    const vs = track.values;
    const n = ts.length;
    if (n === 0) return fallback;
    if (n === times.length) {
      // Fast path when lengths match
      return null;
    }
    if (t <= ts[0]) return [vs[0], vs[1], vs[2]];
    if (t >= ts[n - 1]) return [vs[(n - 1) * 3], vs[(n - 1) * 3 + 1], vs[(n - 1) * 3 + 2]];
    let hi = 1;
    while (hi < n - 1 && ts[hi] < t) hi++;
    const lo = hi - 1;
    const alpha = (t - ts[lo]) / Math.max(1e-9, ts[hi] - ts[lo]);
    return [
      vs[lo * 3] + (vs[hi * 3] - vs[lo * 3]) * alpha,
      vs[lo * 3 + 1] + (vs[hi * 3 + 1] - vs[lo * 3 + 1]) * alpha,
      vs[lo * 3 + 2] + (vs[hi * 3 + 2] - vs[lo * 3 + 2]) * alpha,
    ];
  }

  const _qa = new THREE.Quaternion();
  const _qb = new THREE.Quaternion();
  function sampleTrackQuat(track, f, t, fallback, outQ) {
    if (!track) return outQ.set(fallback[0], fallback[1], fallback[2], fallback[3]).normalize();
    const ts = track.times;
    const vs = track.values;
    const n = ts.length;
    if (n === times.length) {
      return outQ.set(vs[f * 4], vs[f * 4 + 1], vs[f * 4 + 2], vs[f * 4 + 3]).normalize();
    }
    if (t <= ts[0]) return outQ.set(vs[0], vs[1], vs[2], vs[3]).normalize();
    if (t >= ts[n - 1]) {
      const o = (n - 1) * 4;
      return outQ.set(vs[o], vs[o + 1], vs[o + 2], vs[o + 3]).normalize();
    }
    let hi = 1;
    while (hi < n - 1 && ts[hi] < t) hi++;
    const lo = hi - 1;
    const alpha = (t - ts[lo]) / Math.max(1e-9, ts[hi] - ts[lo]);
    _qa.set(vs[lo * 4], vs[lo * 4 + 1], vs[lo * 4 + 2], vs[lo * 4 + 3]).normalize();
    _qb.set(vs[hi * 4], vs[hi * 4 + 1], vs[hi * 4 + 2], vs[hi * 4 + 3]).normalize();
    return outQ.copy(_qa).slerp(_qb, alpha);
  }

  const frameCount = times.length;
  const duration = frameCount > 1 ? times[frameCount - 1] - times[0] : 0;
  const fps = frameCount > 1 && duration > 0 ? Math.round((frameCount - 1) / duration) : 30;

  // Topological order of SOMA nodes so parent world matrices compute before children
  const somaOrder = [];
  const visited = new Set();
  const visitSoma = (i) => {
    if (visited.has(i)) return;
    const p = somaRest.parent.get(i);
    if (p !== undefined) visitSoma(p);
    visited.add(i);
    somaOrder.push(i);
  };
  soma.json.nodes.forEach((_, i) => visitSoma(i));

  const somaHipsIdx = somaRest.byName.get("Hips");
  const somaLFootIdx = somaRest.byName.get("LeftFoot");
  const somaRFootIdx = somaRest.byName.get("RightFoot");
  const somaHipsY = somaRest.worldP[somaHipsIdx].y;
  const xbotHipsY = xbotBones[xbotHipsIdx].worldP.y;
  const legRatio = somaHipsY > 0.1 ? xbotHipsY / somaHipsY : 1;

  // Allocate output arrays
  const boneNames = xbotBones.map((b) => b.name);
  const outRotations = xbotBones.map(() => new Float32Array(frameCount * 4));
  const outHips = new Float32Array(frameCount * 3);

  const somaWorldM = soma.json.nodes.map(() => new THREE.Matrix4());
  const somaWorldQ = soma.json.nodes.map(() => new THREE.Quaternion());
  const xbotWorldQ = xbotBones.map(() => new THREE.Quaternion());
  const tmpM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3(1, 1, 1);
  const hipsWorldP = new THREE.Vector3();
  // GEM-X places the video camera along -Z so an actor facing the camera faces -Z in world space.
  // Rotate world root 180° around Y so exported Mixamo X Bot GLBs face Mixamo/Three.js standard +Z.
  const worldTurnY180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

  // QA measurements
  let minFootY = Infinity;
  let minHipsY = Infinity;
  let maxHipsY = -Infinity;
  let maxWristStepDeg = 0;
  const prevLWrist = new THREE.Quaternion();
  const prevRWrist = new THREE.Quaternion();
  const lwIdx = boneNames.indexOf("LeftHand");
  const rwIdx = boneNames.indexOf("RightHand");

  const spine2Idx = boneNames.indexOf("Spine2");
  const neckIdx = boneNames.indexOf("Neck");
  const headIdx = boneNames.indexOf("Head");
  const somaHipsMapIdx = mixamoToSomaIdx.get("Hips");
  const somaSpine2MapIdx = mixamoToSomaIdx.get("Spine2");
  const somaHeadIdx = mixamoToSomaIdx.get("Head");
  const neckRestInv = neckIdx >= 0 ? xbotBones[neckIdx].localQ.clone().invert() : new THREE.Quaternion();
  const headRestInv = headIdx >= 0 ? xbotBones[headIdx].localQ.clone().invert() : new THREE.Quaternion();
  const identityQ = new THREE.Quaternion();
  const headDesiredWorldQ = new THREE.Quaternion();
  const neckDeltaQ = new THREE.Quaternion();
  const totalHeadDeltaQ = new THREE.Quaternion();
  const clavicleDeltaQ = new THREE.Quaternion();
  const clavicleScaledQ = new THREE.Quaternion();
  const rawParentWorldQ = new THREE.Quaternion();
  const rawBoneWorldQ = new THREE.Quaternion();
  const rawHipsWorldQ = new THREE.Quaternion();
  const rawSpine2WorldQ = new THREE.Quaternion();
  const relSpine2Q = new THREE.Quaternion();
  const spineExtQ = new THREE.Quaternion();
  const spineFlexEuler = new THREE.Euler(0, 0, 0, "XYZ");
  const spineUpVec = new THREE.Vector3();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const restHipsToSpine2Inv =
    xbotHipsIdx >= 0 && spine2Idx >= 0
      ? xbotBones[xbotHipsIdx].worldQ.clone().invert().multiply(xbotBones[spine2Idx].worldQ).invert()
      : new THREE.Quaternion();
  const SPINE_RELIEF_WEIGHT = { Spine: 0.45, Spine1: 0.35, Spine2: 0.2 };
  const clavicleRestInv = new Map();
  for (const b of xbotBones) {
    if (b.name === "LeftShoulder" || b.name === "RightShoulder") {
      clavicleRestInv.set(b.name, b.localQ.clone().invert());
    }
  }
  const MAX_CLAVICLE_RAD = (18 * Math.PI) / 180;

  // Compute source frame-0 horizontal center so character starts centered at X=0, Z=0
  let originX = 0;
  let originZ = 0;

  for (let f = 0; f < frameCount; f++) {
    const tSec = times[f];
    // 1. Evaluate full SOMA world transforms for frame f
    for (const ni of somaOrder) {
      const n = soma.json.nodes[ni];
      const tTrack = transTracks.get(ni);
      const rTrack = rotTracks.get(ni);
      let tx, ty, tz;
      if (tTrack && tTrack.times.length === frameCount) {
        tx = tTrack.values[f * 3];
        ty = tTrack.values[f * 3 + 1];
        tz = tTrack.values[f * 3 + 2];
      } else {
        const tv = sampleTrackVec3(tTrack, tSec, n.translation || [0, 0, 0]);
        tx = tv[0];
        ty = tv[1];
        tz = tv[2];
      }
      sampleTrackQuat(rTrack, f, tSec, n.rotation || [0, 0, 0, 1], tmpQ);

      const s = n.scale || [1, 1, 1];
      tmpM.compose(tmpV.set(tx, ty, tz), tmpQ, tmpS.set(s[0], s[1], s[2]));
      const p = somaRest.parent.get(ni);
      if (p !== undefined) somaWorldM[ni].multiplyMatrices(somaWorldM[p], tmpM);
      else somaWorldM[ni].copy(tmpM);
      somaWorldQ[ni].setFromRotationMatrix(tmpM.extractRotation(somaWorldM[ni]));
    }

    hipsWorldP.setFromMatrixPosition(somaWorldM[somaHipsIdx]);
    if (f === 0) {
      originX = hipsWorldP.x;
      originZ = hipsWorldP.z;
    }

    // Track source foot heights (scaled to X Bot space)
    if (somaLFootIdx !== undefined) {
      const ly = new THREE.Vector3().setFromMatrixPosition(somaWorldM[somaLFootIdx]).y * legRatio;
      if (ly < minFootY) minFootY = ly;
    }
    if (somaRFootIdx !== undefined) {
      const ry = new THREE.Vector3().setFromMatrixPosition(somaWorldM[somaRFootIdx]).y * legRatio;
      if (ry < minFootY) minFootY = ry;
    }

    // Precompute anatomical crouch hunch relief for this frame:
    // Monocular 45°-down cameras cause GEM-X SOMA-77 to exaggerate lumbar/thoracic forward flexion during deep
    // crouches (pushing Spine2/collar to ~55-60° forward while Hips is only ~13°). We only relieve when BOTH
    // Hips->Spine2 local forward flexion > 20° AND Spine2 world tilt > 30°, so standing, upright sitting,
    // and prone dives (where Hips itself tilts 80-90° with straight spine) remain 100% untouched.
    let spineReliefRad = 0;
    const hasRawSpineRef =
      somaHipsMapIdx !== undefined &&
      somaSpine2MapIdx !== undefined &&
      xbotHipsIdx >= 0 &&
      spine2Idx >= 0 &&
      corrections[xbotHipsIdx] &&
      corrections[spine2Idx];
    if (hasRawSpineRef) {
      rawHipsWorldQ
        .copy(worldTurnY180)
        .multiply(somaWorldQ[somaHipsMapIdx])
        .multiply(corrections[xbotHipsIdx])
        .normalize();
      rawSpine2WorldQ
        .copy(worldTurnY180)
        .multiply(somaWorldQ[somaSpine2MapIdx])
        .multiply(corrections[spine2Idx])
        .normalize();
      relSpine2Q
        .copy(rawHipsWorldQ)
        .invert()
        .multiply(rawSpine2WorldQ)
        .premultiply(restHipsToSpine2Inv)
        .normalize();
      spineFlexEuler.setFromQuaternion(relSpine2Q, "XYZ");
      const localFlexDeg = (spineFlexEuler.x * 180) / Math.PI;
      spineUpVec.set(0, 1, 0).applyQuaternion(rawSpine2WorldQ);
      const worldTiltDeg = (Math.acos(Math.min(1, Math.max(-1, spineUpVec.y))) * 180) / Math.PI;
      if (localFlexDeg > 20 && worldTiltDeg > 30) {
        const reliefDeg = Math.min((localFlexDeg - 20) * 0.55, (worldTiltDeg - 30) * 0.55, 18);
        spineReliefRad = (reliefDeg * Math.PI) / 180;
      }
    }

    // 2. Retarget each X Bot bone in parent-first order
    for (let bi = 0; bi < xbotBones.length; bi++) {
      const b = xbotBones[bi];
      const sIdx = mixamoToSomaIdx.get(b.name);
      const parentQ = b.parent >= 0 ? xbotWorldQ[b.parent] : rootParentQ;

      if (
        (b.name === "Spine" || b.name === "Spine1" || b.name === "Spine2") &&
        sIdx !== undefined &&
        corrections[bi] &&
        b.parent >= 0
      ) {
        const pSIdx = mixamoToSomaIdx.get(xbotBones[b.parent].name);
        if (pSIdx !== undefined && corrections[b.parent]) {
          rawParentWorldQ
            .copy(worldTurnY180)
            .multiply(somaWorldQ[pSIdx])
            .multiply(corrections[b.parent])
            .normalize();
          rawBoneWorldQ
            .copy(worldTurnY180)
            .multiply(somaWorldQ[sIdx])
            .multiply(corrections[bi])
            .normalize();
          tmpQ.copy(rawParentWorldQ).invert().multiply(rawBoneWorldQ).normalize();
          if (spineReliefRad > 1e-5) {
            spineExtQ.setFromAxisAngle(xAxis, -spineReliefRad * SPINE_RELIEF_WEIGHT[b.name]);
            tmpQ.multiply(spineExtQ).normalize();
          }
          xbotWorldQ[bi].copy(parentQ).multiply(tmpQ).normalize();
        } else {
          xbotWorldQ[bi].copy(worldTurnY180).multiply(somaWorldQ[sIdx]).multiply(corrections[bi]).normalize();
          tmpQ.copy(parentQ).invert().multiply(xbotWorldQ[bi]).normalize();
        }
      } else if (
        b.name === "Neck" &&
        spine2Idx >= 0 &&
        headIdx >= 0 &&
        somaHeadIdx !== undefined &&
        corrections[headIdx]
      ) {
        // SOMA-77 uses a 2-segment neck (Neck1+Neck2) that can crane forward while Head counter-pitches.
        // Compute the exact desired world Head orientation and distribute the Spine2->Head delta smoothly
        // (72% Neck, 28% Head) in Neck local space so the neck rises naturally upright inside the collar
        // during deep crouches while keeping Head gaze 100% exact with zero chin/cheek distortion.
        headDesiredWorldQ
          .copy(worldTurnY180)
          .multiply(somaWorldQ[somaHeadIdx])
          .multiply(corrections[headIdx])
          .normalize();
        totalHeadDeltaQ
          .copy(parentQ)
          .invert()
          .multiply(headDesiredWorldQ)
          .premultiply(neckRestInv)
          .multiply(headRestInv)
          .normalize();
        if (totalHeadDeltaQ.w < 0) {
          totalHeadDeltaQ.set(-totalHeadDeltaQ.x, -totalHeadDeltaQ.y, -totalHeadDeltaQ.z, -totalHeadDeltaQ.w);
        }
        neckDeltaQ.copy(identityQ).slerp(totalHeadDeltaQ, 0.72).normalize();
        tmpQ.copy(b.localQ).multiply(neckDeltaQ).normalize();
        xbotWorldQ[bi].copy(parentQ).multiply(tmpQ).normalize();
      } else if (
        (b.name === "LeftShoulder" || b.name === "RightShoulder") &&
        sIdx !== undefined &&
        corrections[bi]
      ) {
        // Measure clavicle delta relative to raw SOMA Chest (independent of spine hunch relief),
        // then smoothly damp & clamp (65% weight, max 18° from Mixamo rest) so collars stay snug around the neck
        // while preserving exact LeftArm/RightArm world orientations downstream.
        rawBoneWorldQ.copy(worldTurnY180).multiply(somaWorldQ[sIdx]).multiply(corrections[bi]).normalize();
        const refParentQ = hasRawSpineRef ? rawSpine2WorldQ : parentQ;
        tmpQ.copy(refParentQ).invert().multiply(rawBoneWorldQ).normalize();
        clavicleDeltaQ.copy(clavicleRestInv.get(b.name)).multiply(tmpQ).normalize();
        if (clavicleDeltaQ.w < 0) {
          clavicleDeltaQ.set(-clavicleDeltaQ.x, -clavicleDeltaQ.y, -clavicleDeltaQ.z, -clavicleDeltaQ.w);
        }
        const halfAngle = Math.acos(Math.min(1, Math.max(-1, clavicleDeltaQ.w)));
        const angle = halfAngle * 2;
        const dampedAngle = Math.min(MAX_CLAVICLE_RAD, angle * 0.65);
        const factor = angle > 1e-5 ? dampedAngle / angle : 0;
        clavicleScaledQ.copy(identityQ).slerp(clavicleDeltaQ, factor).normalize();
        tmpQ.copy(b.localQ).multiply(clavicleScaledQ).normalize();
        xbotWorldQ[bi].copy(parentQ).multiply(tmpQ).normalize();
      } else if (sIdx !== undefined && corrections[bi]) {
        xbotWorldQ[bi].copy(worldTurnY180).multiply(somaWorldQ[sIdx]).multiply(corrections[bi]).normalize();
        tmpQ.copy(parentQ).invert().multiply(xbotWorldQ[bi]).normalize();
      } else {
        tmpQ.copy(b.localQ);
        xbotWorldQ[bi].copy(parentQ).multiply(tmpQ).normalize();
      }

      // Sign-continuity for smooth SLERP playback
      if (f > 0) {
        const prevOff = (f - 1) * 4;
        const dot =
          outRotations[bi][prevOff] * tmpQ.x +
          outRotations[bi][prevOff + 1] * tmpQ.y +
          outRotations[bi][prevOff + 2] * tmpQ.z +
          outRotations[bi][prevOff + 3] * tmpQ.w;
        if (dot < 0) tmpQ.set(-tmpQ.x, -tmpQ.y, -tmpQ.z, -tmpQ.w);
      }

      const o = f * 4;
      outRotations[bi][o] = tmpQ.x;
      outRotations[bi][o + 1] = tmpQ.y;
      outRotations[bi][o + 2] = tmpQ.z;
      outRotations[bi][o + 3] = tmpQ.w;
    }

    // Measure wrist frame-to-frame angular step
    if (lwIdx >= 0 && rwIdx >= 0) {
      if (f > 0) {
        const dl = (prevLWrist.angleTo(xbotWorldQ[lwIdx]) * 180) / Math.PI;
        const dr = (prevRWrist.angleTo(xbotWorldQ[rwIdx]) * 180) / Math.PI;
        maxWristStepDeg = Math.max(maxWristStepDeg, dl, dr);
      }
      prevLWrist.copy(xbotWorldQ[lwIdx]);
      prevRWrist.copy(xbotWorldQ[rwIdx]);
    }

    // 3. Hips position: recentered on XZ, rotated 180° around Y to match +Z forward, scaled by legRatio
    const wx = -(hipsWorldP.x - originX) * legRatio;
    const wy = hipsWorldP.y * legRatio;
    const wz = -(hipsWorldP.z - originZ) * legRatio;
    if (wy < minHipsY) minHipsY = wy;
    if (wy > maxHipsY) maxHipsY = wy;

    tmpV.set(wx, wy, wz).applyMatrix4(rootParentInv);
    outHips[f * 3] = tmpV.x;
    outHips[f * 3 + 1] = tmpV.y;
    outHips[f * 3 + 2] = tmpV.z;
  }

  writeMixamoAnimationGlb(outGlbPath, clipName, boneNames, times, outRotations, outHips);
  const stat = fs.statSync(outGlbPath);

  const mappedCount = corrections.filter(Boolean).length;
  const fingerCount = boneNames.filter((n, i) => /Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(n) && corrections[i]).length;

  return {
    outPath: outGlbPath,
    sizeBytes: stat.size,
    qa: {
      retargetVersion: 4,
      targetSkeleton: "Mixamo X Bot (65 骨)",
      mappedBones: mappedCount,
      totalTargetBones: boneNames.length,
      fingerChannels: fingerCount,
      frames: frameCount,
      fps,
      durationSec: Number(duration.toFixed(2)),
      somaHipsY: Number(somaHipsY.toFixed(3)),
      xbotHipsY: Number(xbotHipsY.toFixed(3)),
      legRatio: Number(legRatio.toFixed(4)),
      minFootY: Number((Number.isFinite(minFootY) ? minFootY : 0).toFixed(3)),
      hipsYRange: [Number(minHipsY.toFixed(3)), Number(maxHipsY.toFixed(3))],
      maxWristStepDeg: Number(maxWristStepDeg.toFixed(1)),
      groundStatus: minFootY < -0.04 ? "warn" : "ok",
      wristStatus: maxWristStepDeg > 25 ? "warn" : "ok",
    },
  };
}
