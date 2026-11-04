// 顶替 X Bot 的人物（Data_XBotCharacters.mjs，日兵甲、何有田、罗班长）：转出来的 GLB 骨架与 X Bot 一致、清单数值对得上、动作换人的处理（纯 Node，秒级）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as THREE from "./vendor/three/build/three.module.js";
import { XBOT_CHARACTERS, XBOT_FACTION_CHARACTERS, XBOT_CAST_CHARACTERS } from "./Data_XBotCharacters.mjs";
import { XBOT_CHARACTER_LOOKS } from "./Data_BlockoutXBotClips.mjs";
import { ClipForCharacter, FactionCharacterKeys } from "./Script_XBotCharacters.mjs";
import { MeasureWeaponVisualOrigin } from "./Script_MixamoProps.mjs";
import { XBotSkin } from "./Script_EditorBlockoutXBot.mjs";

const here = import.meta.dirname;
const fitSettings=XBOT_CHARACTERS.ijaYi.weaponVisualOriginFit;
const testMuzzle=new THREE.Vector3(0,.035,-1.006);
const testOffset=MeasureWeaponVisualOrigin([new THREE.Vector3(-.01,.175,-1),new THREE.Vector3(.01,.195,-1),new THREE.Vector3(0,-.4,-.4)],testMuzzle,fitSettings);
assert.ok(testOffset.distanceTo(new THREE.Vector3(0,.15,0))<1e-6,"实体枪口与旧标记的横截面偏移正确，远处枪身不污染取样");
const logical=new THREE.Matrix4().compose(new THREE.Vector3(2,3,4),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.7),new THREE.Vector3(1,1,1));
const visible=logical.clone().multiply(new THREE.Matrix4().makeTranslation(-testOffset.x,-testOffset.y,0));
assert.ok(new THREE.Vector3(0,.185,-1).applyMatrix4(visible).distanceTo(new THREE.Vector3(0,.035,-1).applyMatrix4(logical))<1e-6,"校准实体位置，逻辑握点和动作框架保留");
assert.equal(MeasureWeaponVisualOrigin([new THREE.Vector3(0,10,-1)],testMuzzle,fitSettings).length(),0,"异常模型不应用超限偏移");
const fitGeometry=new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute([-.01,.175,-1,.01,.195,-1,0,-.4,-.4],3));
const fitGroup=new THREE.Group(),fitMesh=new THREE.Mesh(fitGeometry),sharedOtherMesh=new THREE.Mesh(fitGeometry);
fitGroup.add(fitMesh);
const originalGeometry=[...fitGeometry.attributes.position.array],originalMuzzle=testMuzzle.clone();
const fitContext={actor:{weaponGroup:fitGroup,weaponData:{kind:"lmg"},weaponMuzzle:testMuzzle.clone()},kit:{def:{weaponVisualOriginFit:fitSettings}},weaponVisualFit:null,weaponVisualOffset:new THREE.Vector3(),_RestoreWeaponVisualOrigin:XBotSkin.prototype._RestoreWeaponVisualOrigin};
XBotSkin.prototype._WeaponVisualOrigin.call(fitContext);
const fittedPosition=fitMesh.position.clone();
XBotSkin.prototype._WeaponVisualOrigin.call(fitContext);
assert.ok(fitMesh.position.equals(fittedPosition),"重复同步不累加实体偏移");
assert.ok(fitContext.actor.weaponMuzzle.equals(originalMuzzle)&&fitGroup.position.length()===0,"逻辑枪口、根挂点保持不动");
assert.deepEqual([...fitGeometry.attributes.position.array],originalGeometry,"不改共用武器顶点");
assert.equal(sharedOtherMesh.position.length(),0,"其他角色的共用模型实例不受影响");
fitContext._RestoreWeaponVisualOrigin();
assert.equal(fitMesh.position.length(),0,"回收角色时还原该实例的实体位置");
function ReadGlb(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12);
  return { doc: JSON.parse(b.subarray(20, 20 + n)), bin: b.subarray(28 + n) };
}
function Worlds(doc) {
  const local = doc.nodes.map((nd) => nd.matrix ? new THREE.Matrix4().fromArray(nd.matrix)
    : new THREE.Matrix4().compose(new THREE.Vector3(...(nd.translation || [0, 0, 0])), new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(nd.scale || [1, 1, 1]))));
  const parent = doc.nodes.map(() => -1);
  doc.nodes.forEach((nd, i) => (nd.children || []).forEach((c) => (parent[c] = i)));
  const world = [];
  const W = (i) => world[i] || (world[i] = parent[i] < 0 ? local[i].clone() : W(parent[i]).clone().multiply(local[i]));
  doc.nodes.forEach((_, i) => W(i));
  return { parent, world };
}
const Float = (glb, i) => {
  const a = glb.doc.accessors[i], v = glb.doc.bufferViews[a.bufferView], w = { VEC4: 4, MAT4: 16 }[a.type];
  const out = new Float32Array(a.count * w); new Uint8Array(out.buffer).set(glb.bin.subarray(v.byteOffset, v.byteOffset + out.byteLength)); return out;
};

const xbot = ReadGlb(path.join(here, XBOT_CHARACTERS.xbot.file));
const xw = Worlds(xbot.doc);
const xNames = xbot.doc.skins[0].joints.map((i) => xbot.doc.nodes[i].name);
assert.ok(["ijaJia", "ijaA", "ijaYi"].every(key => FactionCharacterKeys("ija").includes(key)), "普通日军保留甲和 A，并接入乙");
assert.equal(XBOT_CAST_CHARACTERS.heyoutian, "heYoutian", "何有田映射保留");
assert.equal(XBOT_CAST_CHARACTERS.luo, "luo", "班长映射保留");
for (const key of new Set(Object.keys(XBOT_FACTION_CHARACTERS).flatMap(FactionCharacterKeys))) assert.ok(XBOT_CHARACTERS[key], `阵营表指向的人物 ${key} 要登记`);
for (const [cast, key] of Object.entries(XBOT_CAST_CHARACTERS)) {
  assert.ok(XBOT_CHARACTER_LOOKS[cast], `角色表的 ${cast} 要是白盒里有名字的人`);
  assert.ok(XBOT_CHARACTERS[key], `角色表指向的人物 ${key} 要登记`);
}

for (const [key, def] of Object.entries(XBOT_CHARACTERS)) {
  if (key === "xbot") continue;
  const glb = ReadGlb(path.join(here, def.file));
  const doc = glb.doc;
  assert.equal(doc.meshes.length, 1, `${key}: 一个网格`);
  assert.equal(doc.materials.length, 1, `${key}: 一个材质`);
  for (const [index, accessor] of doc.accessors.entries()) {
    const view = doc.bufferViews[accessor.bufferView];
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
    assert.ok((accessor.byteOffset || 0) + accessor.count * width * bytes <= view.byteLength,
      `${key}: accessor ${index} 的分量类型、数量与实际二进制长度一致`);
  }
  const names = doc.skins[0].joints.map((i) => doc.nodes[i].name);
  assert.deepEqual(names, xNames, `${key}: 骨名与顺序同 X Bot`);
  const w = Worlds(doc);
  // 骨头层级与 X Bot 一样；初始姿势下每根骨的世界朝向一样（动作的本地转角才能直接用）
  const q = new THREE.Quaternion(), qx = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let worstDeg = 0;
  doc.skins[0].joints.forEach((ji, k) => {
    const xi = xbot.doc.skins[0].joints[k];
    const parentName = w.parent[ji] >= 0 ? doc.nodes[w.parent[ji]].name : null, xParent = xw.parent[xi] >= 0 ? xbot.doc.nodes[xw.parent[xi]].name : null;
    assert.equal(parentName, xParent, `${key}: ${names[k]} 的父骨`);
    w.world[ji].decompose(p, q, s); xw.world[xi].decompose(p, qx, s);
    worstDeg = Math.max(worstDeg, THREE.MathUtils.radToDeg(q.angleTo(qx)));
  });
  assert.ok(worstDeg < 0.1, `${key}: 初始骨朝向同 X Bot（float32 存储误差内）（最大差 ${worstDeg.toFixed(4)}°）`);
  // 初始姿势就是绑定姿势：骨头世界 × 逆绑定 = 网格节点的世界矩阵（同 X Bot 的约定）
  const ibm = Float(glb, doc.skins[0].inverseBindMatrices);
  const meshNode = doc.nodes.findIndex((nd) => nd.mesh === 0), M = w.world[meshNode];
  doc.skins[0].joints.forEach((ji, k) => {
    const e = w.world[ji].clone().multiply(new THREE.Matrix4().fromArray(ibm, k * 16)).elements;
    const d = e.reduce((m, v, i) => Math.max(m, Math.abs(v - M.elements[i])), 0);
    assert.ok(d < 1e-4, `${key}: ${names[k]} 初始姿势 = 绑定姿势（差 ${d}）`);
  });
  // 清单：hipsScale 同转换脚本写的报告；头高与 X Bot 差不出 5 cm（白盒按头高缩放）
  const report = JSON.parse(fs.readFileSync(path.join(here, def.report), "utf8"));
  assert.equal(def.hipsScale, report.hipsScale, `${key}: hipsScale 同 ${def.report}`);
  assert.ok(Math.abs(report.headY - report.xbotHeadY) < 0.05, `${key}: 头高 ${report.headY} 与 X Bot ${report.xbotHeadY}`);
  // 权重：每点和为 1；头顶（头骨关节 9 cm 以上）只跟 Head
  const prim = doc.meshes[0].primitives[0];
  // Declared component types must match the actual view byte spans (Blender can
  // emit Uint16 indices, while the runtime converter writes a Uint32 accessor).
  for (const [label, index] of [...Object.entries(prim.attributes), ["indices", prim.indices]]) {
    const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType] * components;
    const end = (accessor.byteOffset || 0) + (accessor.count - 1) * (view.byteStride || bytes) + bytes;
    assert.ok(end <= view.byteLength, `${key}: ${label} accessor exceeds its buffer view`);
  }
  const W4 = Float(glb, prim.attributes.WEIGHTS_0);
  for (let i = 0; i < W4.length; i += 4) assert.ok(Math.abs(W4[i] + W4[i + 1] + W4[i + 2] + W4[i + 3] - 1) < 0.01, `${key}: 第 ${i / 4} 点权重和`);
  assert.ok(report.rigidHead?.vertices > 0, `${key}: 头顶 / 帽子权重收到 Head`);
  for (const [original, replacement] of Object.entries(def.clipOverrides || {})) {
    assert.ok(fs.existsSync(path.join(here,"Animation/Mixamo",original)), `${key}: 专用动作保留原件`);
    const own=ReadGlb(path.join(here,replacement));
    assert.equal(own.doc.animations.length,1,`${key}: 专用动作能解析`);
    assert.ok(own.doc.animations[0].channels.length>=65,`${key}: 专用动作保留完整身体曲线`);
  }
}

const yiContacts=JSON.parse(fs.readFileSync(path.join(here,"Animation/JapaneseSoldierYi/Data_JapaneseSoldierYiContacts.json"),"utf8"));
for(const item of [yiContacts.model,yiContacts.source,yiContacts.output])assert.equal(
  createHash("sha256").update(fs.readFileSync(path.join(here,item.file))).digest("hex"),item.sha256,"乙的接触烘焙对应实际模型与源动作");

// 动作换人：X Bot 原样；别的人去掉 Hips 以外的位移轨、Hips 位移乘 hipsScale，同一条动作同一个人只换一次
const clip = new THREE.AnimationClip("t", 1, [
  new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 100, 0, 10, 100, 0]),
  new THREE.VectorKeyframeTrack("Spine.position", [0, 1], [0, 10, 0, 0, 10, 0]),
  new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
]);
assert.equal(ClipForCharacter(clip, XBOT_CHARACTERS.xbot), clip);
const jia = XBOT_CHARACTERS.ijaJia, converted = ClipForCharacter(clip, jia);
assert.deepEqual(converted.tracks.map((t) => t.name), ["Hips.position", "Spine.quaternion"]);
assert.ok(Math.abs(converted.tracks[0].values[1] - 100 * jia.hipsScale) < 1e-4);
assert.equal(clip.tracks[0].values[1], 100, "原动作不动");
assert.equal(ClipForCharacter(clip, jia), converted, "缓存");
assert.equal(ClipForCharacter(null, jia), null);
console.log("XBotCharactersTest ok");
