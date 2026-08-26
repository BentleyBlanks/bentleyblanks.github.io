// 第一人称手臂 GLB 的二进制契约测试（纯 Node，不需要 WebGL / DOM）。
//
// **这个文件曾经还守着四个人物 GLB**（Ija / Nra / Civilian 男女）的分段名、
// 关节名、头部尺寸。那条显示路径已经拆了：五个 kind 全部走程序化 tzm 模型
// （Model/Soldier*.tzm.json、Civilian*.tzm.json，建模脚本在 _blender/），
// 它们的契约由 _blender/Verify.mjs + Script_ActorPoseTest.mjs 守。
// 那四个 .glb 文件还在 Model/ 下，但没有任何代码路径会读它们 ——
// 继续在这里断言它们的内部结构，只会让人以为它们还在用。

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

function Names(doc) { return new Set((doc.nodes || []).map((node) => node.name).filter(Boolean)); }
function Animations(doc) { return new Set((doc.animations || []).map((clip) => clip.name).filter(Boolean)); }

function AssertTexturedMaterialsHaveNormals(doc, label) {
  for (const material of doc.materials || []) {
    if (material.pbrMetallicRoughness?.baseColorTexture == null) continue;
    assert.ok(material.normalTexture, `${label} material ${material.name} keeps a tangent-space normal texture`);
    const texture = doc.textures?.[material.normalTexture.index];
    const image = doc.images?.[texture?.source];
    assert.ok(image?.bufferView != null, `${label} material ${material.name} embeds its normal image`);
    assert.match(image.mimeType ?? "", /^image\/(?:jpeg|png)$/, `${label} material ${material.name} normal MIME`);
    assert.ok(material.normalTexture.scale > 0 && material.normalTexture.scale <= 1,
      `${label} material ${material.name} uses restrained normal strength`);
  }
}

const arms = ReadGlb("Model_FpsArms.glb");
const armNames = Names(arms);
AssertTexturedMaterialsHaveNormals(arms, "FPS arms");
assert.ok((arms.skins || []).length >= 1, "FPS arms keep a skin");
assert.ok((arms.textures || []).length >= 1, "FPS arms keep an albedo texture");
for (const bone of ["shoulder.r", "bicep.r", "forearm.r", "wrist.r", "finger_index3.r",
  "shoulder.l", "wrist.l", "finger_thumb3.l"]) assert.ok(armNames.has(bone), `FPS arm bone ${bone}`);
assert.ok(Animations(arms).has("GripIdle"), "FPS arms include GripIdle");

console.log(`ok   FPS arms: ${arms.skins.length} skin, ${armNames.size} nodes, ${arms.animations.length} animation`);
