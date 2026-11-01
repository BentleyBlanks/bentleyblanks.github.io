// 白盒 X Bot 换算动作的复查（docs/Data_EditorBlockout.md §18）：
//   node Taierzhuang1938/_import/Script_XBotRetargetCheck.mjs [片段名…]
// 对照表里每条换算的预演片段，逐帧比士兵原动作与换算后 X Bot 的肢体方向（模型空间）：上臂→手、大腿→脚、骨盆→头、手腕→中指根。
// 换算按世界朝向变化量搬，方向应基本一致；某条偏得多说明骨头对照或初始姿势对齐有问题，再去预览工具里看那条。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THREE = await import("three");
const { XBotRetarget, RestSkeleton, BoneKey } = await import(pathToFileURL(path.join(PROJECT, "Script_XBotRetarget.mjs")).href);
const { XBOT_PREVIZ_CLIPS } = await import(pathToFileURL(path.join(PROJECT, "Data_BlockoutXBotClips.mjs")).href);
const { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } = await import(pathToFileURL(path.join(PROJECT, "Data_BlockoutPrevizClips.mjs")).href);

function ReadGlbJson(file) { const b = fs.readFileSync(file); const l = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + l).toString("utf8")); }
function NodeLocal(n) { const m = new THREE.Matrix4(); if (n.matrix) return m.fromArray(n.matrix); return m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1]))); }
function SkinRest(file, order = null) {
  const json = ReadGlbJson(file), parent = new Map();
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i)));
  const world = []; const W = (i) => world[i] || (world[i] = (() => { const m = NodeLocal(json.nodes[i]); if (parent.has(i)) m.premultiply(W(parent.get(i))); return m; })());
  const joints = json.skins[0].joints, byName = new Map(joints.map(j => [BoneKey(json.nodes[j].name), j]));
  const names = order ? order.map(BoneKey) : joints.map(j => BoneKey(json.nodes[j].name));
  const nodes = names.map(n => byName.get(n)), idx = new Map(nodes.map((j, i) => [j, i]));
  const bones = nodes.map(j => ({ name: json.nodes[j].name, parent: idx.get(parent.get(j)) ?? -1, world: W(j).clone(), local: { p: json.nodes[j].translation || [0, 0, 0], q: json.nodes[j].rotation || [0, 0, 0, 1] } }));
  const root = nodes[bones.findIndex(b => b.parent < 0)];
  return { rest: new RestSkeleton(bones), above: parent.has(root) ? W(parent.get(root)).clone() : new THREE.Matrix4() };
}
function Sources() {
  const found = new Map();
  const Scan = (base, mf) => {
    const dir = path.join(PROJECT, base.replace(/^\.\//, "")), p = path.join(dir, mf);
    if (!fs.existsSync(p)) return;
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const model of [...m.models].sort((a, b) => (b.id === "TengxianNra02") - (a.id === "TengxianNra02"))) {
      const f = path.join(dir, model.file); if (!fs.existsSync(f)) continue;
      const d = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const [id, clip] of Object.entries(d.clips)) if (!found.has(id)) found.set(id, { clip, bones: d.bones, stride: d.stride, modelId: d.modelId || model.id });
    }
  };
  Scan("./Animation/OpeningStoryboards/", "Data_OpeningStoryboardsAnimation.json");
  for (const l of BLOCKOUT_PREVIZ_CLIP_LIBRARIES) Scan(l.base, l.manifest);
  return found;
}
// FK positions from world rotations: P_child = P_parent + Q_parent * (Q0_parent^-1 * (P0_child - P0_parent))
function Offsets(rest) { return rest.bones.map((b, i) => b.parent < 0 ? null : rest.worldP[i].clone().sub(rest.worldP[b.parent]).applyQuaternion(rest.worldQ[b.parent].clone().invert())); }
function FK(rest, offsets, worldQ, rootPos, out) {
  rest.bones.forEach((b, i) => { if (b.parent < 0) out[i].copy(rootPos ?? rest.worldP[i]); else out[i].copy(offsets[i]).applyQuaternion(worldQ[b.parent]).add(out[b.parent]); });
}
const xbot = SkinRest(path.join(PROJECT, "Animation/Mixamo/Model_MixamoXBot.glb"));
const xOff = Offsets(xbot.rest);
// 上臂、前臂分开比（肩→手整条的方向会因为两套骨架上臂 / 前臂长度比例不同而在屈肘时偏开，那不是换算的错）
const LIMBS = [["L upper", "Bip001_L_UpperArm", "Bip001_L_Forearm", "LeftArm", "LeftForeArm"], ["L fore", "Bip001_L_Forearm", "Bip001_L_Hand", "LeftForeArm", "LeftHand"],
  ["R upper", "Bip001_R_UpperArm", "Bip001_R_Forearm", "RightArm", "RightForeArm"], ["R fore", "Bip001_R_Forearm", "Bip001_R_Hand", "RightForeArm", "RightHand"],
  ["L leg", "Bip001_L_Thigh", "Bip001_L_Foot", "LeftUpLeg", "LeftFoot"], ["R leg", "Bip001_R_Thigh", "Bip001_R_Foot", "RightUpLeg", "RightFoot"],
  ["spine", "Bip001_Pelvis", "Bip001_Head", "Hips", "Head"], ["L hand", "Bip001_L_Hand", "Bip001_L_Finger2", "LeftHand", "LeftHandMiddle1"], ["R hand", "Bip001_R_Hand", "Bip001_R_Finger2", "RightHand", "RightHandMiddle1"]];
const only = new Set(process.argv.slice(2));
const sources = Sources(), cache = new Map(), report = [];
for (const [id, spec] of Object.entries(XBOT_PREVIZ_CLIPS)) {
  if (!spec.retarget || (only.size && !only.has(id))) continue;
  const src = sources.get(id); if (!src) { report.push({ id, error: "no source" }); continue; }
  const key = src.modelId + src.bones.join();
  if (!cache.has(key)) { const s = SkinRest(path.join(PROJECT, "Model/Character", `Model_${src.modelId}.glb`), src.bones); cache.set(key, { ...s, off: Offsets(s.rest), rt: new XBotRetarget(s.rest, xbot.rest, { targetParentOfRoot: xbot.above }) }); }
  const { rest, above, off, rt } = cache.get(key);
  const srcQ = rest.bones.map(() => new THREE.Quaternion()), pel = new THREE.Vector3(), outQ = xbot.rest.bones.map(() => new THREE.Quaternion()), hips = new THREE.Vector3();
  const sP = rest.bones.map(() => new THREE.Vector3()), xP = xbot.rest.bones.map(() => new THREE.Vector3());
  const worst = Object.fromEntries(LIMBS.map(l => [l[0], { deg: 0, f: 0 }]));
  const per = src.bones.length * src.stride;
  for (let f = 0; f < src.clip.frameCount; f += 2) {
    XBotRetarget.SourceWorld(rest, src.clip.values.slice(f * per, (f + 1) * per), src.stride, srcQ, pel, above);
    rt.Solve(srcQ, pel, outQ, hips);
    FK(rest, off, srcQ, null, sP);
    FK(xbot.rest, xOff, rt.worldQ, null, xP);
    for (const [name, sa, sb, xa, xb] of LIMBS) {
      const a = rest.Find(sa), b = rest.Find(sb), c = xbot.rest.Find(xa), d = xbot.rest.Find(xb);
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      const u = sP[b].clone().sub(sP[a]).normalize(), v = xP[d].clone().sub(xP[c]).normalize();
      const deg = THREE.MathUtils.radToDeg(u.angleTo(v));
      if (deg > worst[name].deg) worst[name] = { deg: +deg.toFixed(1), f };
    }
  }
  report.push({ id, model: src.modelId, worst });
}
report.sort((a, b) => Math.max(...Object.values(b.worst || {}).map(w => w.deg)) - Math.max(...Object.values(a.worst || {}).map(w => w.deg)));
for (const r of report) console.log(r.id.padEnd(26), r.error || Object.entries(r.worst).map(([k, w]) => `${k} ${w.deg}`).join(" | "));
