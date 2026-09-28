// Script_CharacterSurfaceTest.mjs —— 人物表面层（2026-09-28，3A 迭代 B3）的纯 Node 门禁。
// 口径：docs/Data_CharacterStandard.md「人物表面」；数据：Data_Tuning_Materials 的 CHARACTER_SURFACE_PARTS 等。
//
// 守四件事：
//   1. 部件表里每个「模型 id × 材质名」都真的在那只 GLB 里（重建模型改了材质名，这张表会静默失效）；
//      部件的 role / cls 只取已知值，皮肤都写了 uvMeters，钢盔圆盘在 atlas 内；
//   2. 被打成部件的材质如果带 KHR_materials_specular 的 specularTexture，那张图必须**没有 alpha**：
//      three 只读它的 alpha（KHR 规范），人物变体摘掉它才是逐像素无差 —— 这是腾采样器的前提；
//   3. 两张细节包（皮肤 256² / 呢子 512²）在、带 alpha 的 WebP、单张 ≤ 400 KB（lazy 层预算紧）；
//   4. 打标在 ConfigureExternalPbr 之前（人物 / 第一人称双臂 / 第一人称身体三处）、新模块登记进 import map。
// 用法：node Taierzhuang1938/Script_CharacterSurfaceTest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHARACTER_SURFACE_PARTS, CHARACTER_GRIME, CHARACTER_SKIN, IJA_WOOL_DETAIL,
} from "./Data_Tuning_Materials.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const Check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
};

const GLB_BY_MODEL = {
  FpsArms: "Model/Model_FpsArmsNraSkeletal01.glb",
  FpsHanYang: "Model/Model_FpsHanYangHands.glb",
  FirstPersonBody: "Model/Model_FirstPersonBody.glb",
};
const GlbPath = (id) => path.join(here, GLB_BY_MODEL[id] || `Model/Character/Model_${id}.glb`);

function ReadGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = 20 + jsonLength + 8;
  const image = (textureIndex) => {
    const texture = json.textures[textureIndex];
    const source = texture.source ?? texture.extensions?.EXT_texture_webp?.source;
    const entry = json.images[source];
    const view = json.bufferViews[entry.bufferView];
    const start = bin + (view.byteOffset || 0);
    return { name: entry.name, mime: entry.mimeType, bytes: buf.subarray(start, start + view.byteLength) };
  };
  return { json, image };
}

/** 一张嵌入图片有没有 alpha 通道（WebP：VP8X 的 alpha 位 / VP8L 头的 alpha 提示；PNG：颜色类型）。 */
function HasAlpha({ mime, bytes }) {
  if (mime === "image/png") return bytes[25] === 4 || bytes[25] === 6;
  if (mime === "image/jpeg") return false;
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") return false;
  if (chunk === "VP8X") return (bytes[20] & 0x10) !== 0;
  if (chunk === "VP8L") return ((bytes[24] >> 4) & 1) === 1;
  return true;
}

function WebpInfo(file) {
  const bytes = fs.readFileSync(file);
  const chunk = bytes.subarray(12, 16).toString("ascii");
  let width = 0, height = 0;
  if (chunk === "VP8X") {
    width = 1 + bytes.readUIntLE(24, 3);
    height = 1 + bytes.readUIntLE(27, 3);
  } else if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8 ") {
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  }
  return { riff: bytes.subarray(0, 4).toString("ascii") === "RIFF", width, height, bytes: bytes.length,
    alpha: HasAlpha({ mime: "image/webp", bytes }) };
}

// ---- 1 + 2：部件表对得上 GLB -------------------------------------------------------------
const ROLES = new Set(["skin", "nraCloth", "ijaWool", "gear", "garb", null]);
const CLASSES = new Set(["skin", "cloth", "none"]);
let parts = 0, specChecked = 0;
for (const [modelId, table] of Object.entries(CHARACTER_SURFACE_PARTS)) {
  const file = GlbPath(modelId);
  if (!fs.existsSync(file)) { Check(false, `${modelId} 的 GLB 在`, file); continue; }
  const { json, image } = ReadGlb(file);
  const byName = new Map((json.materials || []).map((m) => [m.name, m]));
  for (const [name, part] of Object.entries(table)) {
    parts += 1;
    const material = byName.get(name);
    Check(!!material, `${modelId} 有材质「${name}」`);
    Check(ROLES.has(part.role ?? null) && CLASSES.has(part.cls), `${modelId}/${name} 的 role / cls 是已知值`, `${part.role}/${part.cls}`);
    if (part.role === "skin") Check(part.uvMeters > 0.05 && part.uvMeters < 5, `${modelId}/${name} 皮肤写了 uvMeters`, String(part.uvMeters));
    if (part.helmet) {
      const [u, v, r] = part.helmet;
      Check(u - r >= 0 && u + r <= 1.001 && v - r >= 0 && v + r <= 1 && r > 0.05, `${modelId}/${name} 钢盔圆盘在 atlas 内`, part.helmet.join(","));
    }
    const specular = material?.extensions?.KHR_materials_specular?.specularTexture;
    if (part.role && specular) {
      const picture = image(specular.index);
      specChecked += 1;
      Check(!HasAlpha(picture), `${modelId}/${name} 的 spec 图没有 alpha（摘掉逐像素无差）`, `${picture.name} ${picture.mime}`);
    }
  }
}
Check(parts >= 30, "部件表条目数", String(parts));
Check(specChecked >= 5, "带 spec 图的部件都查过 alpha", String(specChecked));
// NRA05 的脸与眼球：按名字分类会反过来（眼球叫「头部」），部件表必须压住。
Check(CHARACTER_SURFACE_PARTS.TengxianNra05["Material #26"]?.cls === "skin"
  && CHARACTER_SURFACE_PARTS.TengxianNra05["战士1_头部"]?.cls === "none", "NRA05 脸 = 皮肤、眼球不当皮肤");
Check(Object.keys(CHARACTER_SURFACE_PARTS).filter((id) => id.startsWith("TengxianIja"))
  .every((id) => Object.values(CHARACTER_SURFACE_PARTS[id]).some((p) => p.role === "skin")
    && Object.values(CHARACTER_SURFACE_PARTS[id]).some((p) => p.role === "ijaWool")), "每款日军都有皮肤与呢子部件");

// ---- 数值自洽 -------------------------------------------------------------------------
const G = CHARACTER_GRIME;
Check(G.mudTop > 0.1 && G.mudTop + G.mudEdge < G.knee[1] && G.splashTop < 1.3, "泥线在膝下、溅点在腰下",
  `mudTop ${G.mudTop} edge ${G.mudEdge} knee ${G.knee[1]} splash ${G.splashTop}`);
Check(Object.values(G.roles).every((r) => [r.mud, r.knee, r.elbow, r.dust, r.cuff].every((v) => v >= 0 && v <= 1)), "逐部件强度在 0..1");
Check(CHARACTER_SKIN.tileMeters >= 0.02 && CHARACTER_SKIN.tileMeters <= 0.2 && CHARACTER_SKIN.specularIntensity > 0,
  "皮肤细节平铺与高光强度", `${CHARACTER_SKIN.tileMeters} m / ${CHARACTER_SKIN.specularIntensity}`);

// ---- 3：细节包 -----------------------------------------------------------------------
for (const [label, spec, size] of [["皮肤细节包", CHARACTER_SKIN, 256], ["呢子细节包", IJA_WOOL_DETAIL, 512]]) {
  const texture = (spec.detailTexture || spec.texture).split("?")[0];
  const file = path.join(here, texture);
  if (!fs.existsSync(file)) { Check(false, `${label}在`, texture); continue; }
  const info = WebpInfo(file);
  Check(info.riff && info.width === size && info.height === size && info.alpha, `${label}是 ${size}² 带 alpha 的 WebP`,
    `${info.width}×${info.height} alpha=${info.alpha}`);
  Check(info.bytes <= 400 * 1024, `${label} ≤ 400 KB`, `${(info.bytes / 1024).toFixed(0)} KB`);
  Check(/\?v=\d+$/.test(spec.detailTexture || spec.texture), `${label}的 URL 带 ?v= 戳`, spec.detailTexture || spec.texture);
}

// ---- 4：接线 ----------------------------------------------------------------------------
const source = (name) => fs.readFileSync(path.join(here, name), "utf8");
const TagBefore = (text) => {
  const tag = text.indexOf("TagCharacterSurface(this.root");
  const configure = text.indexOf("ConfigureExternalPbr?.(");
  return tag > 0 && configure > tag;
};
Check(TagBefore(source("Script_CharacterModel.mjs")), "人物：打标在 ConfigureExternalPbr 之前");
Check(TagBefore(source("Script_RiggedModel.mjs")), "第一人称双臂：打标在 ConfigureExternalPbr 之前");
Check(TagBefore(source("Script_FirstPersonBody.mjs")), "第一人称身体：打标在 ConfigureExternalPbr 之前");
Check(/source\.userData\.characterSurface\?\.cls/.test(source("Script_Materials.mjs")), "_UpgradeExternal 优先读部件标签");
Check(/"\.\/Script_CharacterSurface\.mjs": "\.\/Script_CharacterSurface\.mjs\?v=\d+"/.test(source("index.html")), "新模块登记进 import map");
const surface = source("Script_CharacterSurface.mjs");
Check(/vCharRest = position;/.test(surface) && !/transformed\s*=/.test(surface), "泥污读蒙皮前的 position、不改顶点（运动矢量不变）");
Check(/#ifndef CHAR_BATCHED\s+uniform sampler2D uCharSkinDetailMap;/.test(surface)
  && /#ifndef NRA_CLOTH_BATCHED\s+uniform sampler2D uNraClothDetailMap;/.test(source("Script_UniformColors.mjs")),
  "远景合批（BatchedMesh）的皮肤与国军布不采细节包（采样器 ≤ 16）");

if (failed) { console.log(`\n人物表面门禁：${failed} 项失败。`); process.exit(1); }
console.log("\n人物表面门禁：全部通过。");
