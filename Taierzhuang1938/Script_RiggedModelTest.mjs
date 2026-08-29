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

const arms = ReadGlb("Model_FpsArmsNra01.glb");
const armNames = Names(arms);
assert.equal((arms.meshes || []).length, 2, "FPS hands export one authored mesh per side");
assert.equal((arms.skins || []).length, 0, "NRA01 skin is applied offline, not retargeted at runtime");
assert.ok((arms.textures || []).length >= 1, "FPS arms keep an albedo texture");
for (const node of ["HandRight", "HandLeft"]) assert.ok(armNames.has(node), `FPS hand node ${node}`);
assert.equal((arms.animations || []).length, 0, "FPS arms freeze model 01 RifleIdle as bind pose");

console.log(`ok   NRA01 FPS hands: ${arms.meshes.length} meshes, ${armNames.size} nodes, ${arms.animations?.length || 0} animation`);
