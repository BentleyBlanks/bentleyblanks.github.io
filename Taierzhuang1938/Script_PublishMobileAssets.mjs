// 手机版贴图（Pages 发布专用，docs/Data_TextureImporter.md「手机版贴图」，2026-10-26）。
//
// 用户定的口径：手机上大部分贴图最长边 1024、ASTC 6×6；法线图 1024、ASTC 4×4（6×6 压法线会起颗粒）。电脑端一个字节不变。
// 在 Script_BuildPublishAssets 的桌面产物之后、写内容戳之前调：
//   独立贴图   TextureCatalog 里 GPU 采样的那些（界面 / CPU 读像素 / 纹理数组 / 离线源不碰），各出一张翻转、一张不翻转的 KTX2；
//              桌面那边开了 Read/Write（要 CPU 像素）或手动配了 ios / android 平台版本的，尊重原配置不出手机版。
//   模型       游戏代码里引用到的每个 Model/**.glb：只换嵌入的贴图（KHR_texture_basisu + image/ktx2），
//              几何、骨骼、动作、材质参数逐字节不变（打包后回读核对）；结构特殊（meshopt、共用 buffer view、外链图）的整份或该图跳过并记原因。
// 产出 Data_MobileAssetRuntime.mjs：{ textures: { 源文件: [翻转版, 不翻转版, 色彩空间] }, models: { 源 glb: 手机版 glb } }，
// 运行时由 Script_TextureImports 在「手机 / 平板 + 显卡支持 ASTC」时才查（?mobileAssets=0 / 1 强制关 / 开）。
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { MOBILE_ASSETS } from "./Data_AssetPublish.mjs";
import { TextureCatalog } from "./Script_TextureImportRules.mjs";
import { AstcEncoderInfo, EncodeAstcKtx2, ASTC_PIPELINE } from "./Script_AstcEncoder.mjs";
import { Hash, Within } from "./Script_PublishCache.mjs";
import { read as ReadKtx } from "./vendor/three/examples/jsm/libs/ktx-parse.module.js";

const require = createRequire(import.meta.url);

function ReadGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error("Invalid GLB");
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw Error("Invalid GLB JSON chunk");
  const hasBin = bytes.length > 20 + length;
  if (hasBin && bytes.readUInt32LE(24 + length) !== 0x004e4942) throw Error("Invalid GLB BIN chunk");
  return { doc: JSON.parse(bytes.subarray(20, 20 + length).toString()), bin: hasBin ? bytes.subarray(28 + length) : Buffer.alloc(0) };
}
const View = (glb, i) => {
  const view = glb.doc.bufferViews[i];
  if (view.buffer !== 0 || (view.byteOffset || 0) + view.byteLength > glb.bin.length) throw Error("Invalid GLB buffer view");
  return glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
};
function PackGlb(doc, chunks) {
  let offset = 0;
  const blocks = chunks.map((bytes, i) => {
    doc.bufferViews[i].byteOffset = offset; doc.bufferViews[i].byteLength = bytes.length;
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(padded); offset += padded.length; return padded;
  });
  doc.buffers[0].byteLength = offset;
  const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
  const output = Buffer.alloc(28 + padded.length + offset);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12); output.writeUInt32LE(0x4e4f534a, 16); padded.copy(output, 20);
  output.writeUInt32LE(offset, 20 + padded.length); output.writeUInt32LE(0x004e4942, 24 + padded.length);
  Buffer.concat(blocks).copy(output, 28 + padded.length); return output;
}
const ImageOf = (texture) => texture.extensions?.EXT_texture_webp?.source ?? texture.extensions?.KHR_texture_basisu?.source ?? texture.source;
const COLOR_SLOTS = ["baseColorTexture", "emissiveTexture", "specularColorTexture", "sheenColorTexture", "diffuseTexture"];

/** 每张嵌入图被哪种材质槽用：color（sRGB）/ normal / data（线性）。一张图被几种槽共用 → 多个值，跳过。 */
export function GlbImageUses(doc) {
  const uses = new Map();
  const Visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith("Texture") && Number.isInteger(child?.index)) {
        const texture = doc.textures?.[child.index]; if (!texture) throw Error("Invalid material texture index");
        const index = ImageOf(texture); if (index === undefined) continue;
        const use = COLOR_SLOTS.includes(key) ? "color" : key === "normalTexture" ? "normal" : "data";
        const entry = uses.get(index) || new Set(); entry.add(use); uses.set(index, entry);
      } else Visit(child);
    }
  };
  for (const material of doc.materials || []) Visit(material);
  return uses;
}

/** 游戏代码里引用到、且文件真在的模型（测试、临时目录、vendor 不算）。新模型写进代码就自动带上。 */
export async function ReferencedModels(projectDir) {
  const found = new Set();
  for (const entry of await fs.readdir(projectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.mjs$/.test(entry.name) || /Test\.mjs$|^Script_Build|^Script_Publish/.test(entry.name)) continue;
    const text = await fs.readFile(path.join(projectDir, entry.name), "utf8");
    for (const match of text.matchAll(/Model\/[A-Za-z0-9_/]+\.glb/g)) found.add(match[0]);
  }
  const out = [];
  for (const file of [...found].sort()) { try { await fs.access(Within(projectDir, file)); out.push(file); } catch { /* 引用了但没有文件 */ } }
  return out;
}

const BlockFor = (use) => (use === "normal" ? MOBILE_ASSETS.normalBlock : use === "color" ? MOBILE_ASSETS.colorBlock : MOBILE_ASSETS.dataBlock);

export async function BuildMobileAssets(projectDir, outputDir, { cacheDir = null, desktopRuntime = {}, settings = { textures: {} },
  textureFiles = null, modelFiles = null, log = console.log } = {}) {
  const sharp = require("sharp");
  const encoder = await AstcEncoderInfo(cacheDir);
  const stats = { hits: 0, misses: 0 };
  const report = { version: MOBILE_ASSETS.version, policy: MOBILE_ASSETS, pipeline: ASTC_PIPELINE, encoder: { version: encoder.version, binary: encoder.binary, sha256: encoder.sha256 },
    textures: [], models: [], skipped: [], cache: stats };
  const runtime = { textures: {}, models: {} };
  const cacheRoot = cacheDir ? Within(cacheDir, "mobile-astc") : null;
  if (cacheRoot) await fs.mkdir(cacheRoot, { recursive: true });

  /** 像素源字节 → ASTC KTX2（缓存按源字节 + 参数 + 编码器）。缓存不可信：读回来要能解析、格式对才用。 */
  const Encode = async (sourceBytes, options) => {
    const key = Hash(Buffer.concat([sourceBytes, Buffer.from(JSON.stringify({ options, encoder: encoder.sha256, policy: MOBILE_ASSETS, pipeline: ASTC_PIPELINE }))]));
    const cached = cacheRoot && path.join(cacheRoot, key + ".ktx2");
    if (cached) {
      try {
        const bytes = await fs.readFile(cached), doc = ReadKtx(new Uint8Array(bytes));
        if (doc.levels.length >= 1 && doc.vkFormat) { stats.hits++; return { bytes, width: doc.pixelWidth, height: doc.pixelHeight, levels: doc.levels.length, vkFormat: doc.vkFormat,
          gpuBytes: doc.levels.reduce((n, l) => n + Number(l.uncompressedByteLength || l.levelData.byteLength), 0) }; }
      } catch { /* 重编 */ }
    }
    const { data, info } = await sharp(sourceBytes).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = await EncodeAstcKtx2(data, info.width, info.height, { ...options, encoder,
      maxSize: MOBILE_ASSETS.maxSize, preset: MOBILE_ASSETS.preset, zstdLevel: MOBILE_ASSETS.zstdLevel });
    stats.misses++;
    if (cached) await fs.writeFile(cached, result.bytes);
    return result;
  };

  // ---- 独立贴图 ----
  for (const item of TextureCatalog()) {
    if (textureFiles && !textureFiles.includes(item.file)) continue;
    const file = "Texture/" + item.file;
    if (!item.gpu || item.tier === "offline") continue;   // 界面 / CPU / 纹理数组 / 离线源：桌面报告里已写原因
    const desktop = desktopRuntime[item.file];
    if (desktop?.readWrite || desktop?.cpuFile) { report.skipped.push({ file, reason: "Read/Write texture keeps CPU pixels: desktop asset used" }); continue; }
    if (settings.textures?.[item.file]?.platforms?.ios || settings.textures?.[item.file]?.platforms?.android) {
      report.skipped.push({ file, reason: "manual ios/android import override takes precedence" }); continue;
    }
    const source = await fs.readFile(Within(projectDir, file));
    const use = item.channel === "Normal" ? "normal" : item.colorSpace === "srgb" ? "color" : "data";
    const options = { colorSpace: item.colorSpace, block: BlockFor(use), normal: use === "normal" };
    try {
      const flipped = await Encode(source, { ...options, flipY: true });
      const unflipped = await Encode(source, { ...options, flipY: false });
      const dir = path.posix.dirname(item.file), stem = path.posix.basename(item.file, path.extname(item.file));
      const out = (bytes, suffix) => path.posix.join(dir, `${stem}_Mobile${suffix}${Hash(bytes).slice(0, 12)}.ktx2`);
      const a = out(flipped.bytes, ""), b = out(unflipped.bytes, "NoFlip");
      await fs.mkdir(Within(outputDir, "Texture/" + dir), { recursive: true });
      await fs.writeFile(Within(outputDir, "Texture/" + a), flipped.bytes);
      await fs.writeFile(Within(outputDir, "Texture/" + b), unflipped.bytes);
      runtime.textures[item.file] = [a, b, item.colorSpace === "srgb" ? "s" : "l"];
      report.textures.push({ file, output: "Texture/" + a, unflipped: "Texture/" + b, use, block: options.block, width: flipped.width, height: flipped.height,
        levels: flipped.levels, bytes: flipped.bytes.length + unflipped.bytes.length, gpuBytes: flipped.gpuBytes, sourceBytes: source.length,
        sha256: Hash(flipped.bytes), unflippedSha256: Hash(unflipped.bytes) });
    } catch (error) {
      report.skipped.push({ file, reason: "encode failed: " + String(error.message || error).slice(0, 200) });
    }
  }
  log(`Mobile textures: ${report.textures.length} (cache ${stats.hits} hit / ${stats.misses} encoded)`);

  // ---- 模型 ----
  for (const file of modelFiles || await ReferencedModels(projectDir)) {
    let source, glb;
    try { source = await fs.readFile(Within(projectDir, file)); glb = ReadGlb(source); }
    catch (error) { report.skipped.push({ file, reason: "unreadable GLB: " + error.message }); continue; }
    const doc = structuredClone(glb.doc);
    if (!doc.images?.length) continue;   // 没有贴图的模型（动作包、纯几何）
    if (doc.bufferViews?.some((view) => view.extensions?.EXT_meshopt_compression)) { report.skipped.push({ file, reason: "meshopt buffer views need a dedicated repacker" }); continue; }
    const protectedViews = new Set((doc.accessors || []).flatMap((a) => [a.bufferView, a.sparse?.indices?.bufferView, a.sparse?.values?.bufferView]).filter(Number.isInteger));
    for (const mesh of doc.meshes || []) for (const primitive of mesh.primitives || []) {
      const view = primitive.extensions?.KHR_draco_mesh_compression?.bufferView; if (Number.isInteger(view)) protectedViews.add(view);
    }
    const uses = GlbImageUses(doc);
    const chunks = doc.bufferViews.map((_, i) => View(glb, i));
    const converted = new Set(), images = [];
    for (const [index, image] of doc.images.entries()) {
      const use = uses.get(index);
      if (!use || use.size !== 1 || image.bufferView === undefined || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)) {
        report.skipped.push({ file, image: index, reason: "external, unused, shared-role or unsupported image" }); continue;
      }
      if (doc.images.some((other, i) => i !== index && other.bufferView === image.bufferView) || protectedViews.has(image.bufferView)) {
        report.skipped.push({ file, image: index, reason: "shared image buffer view" }); continue;
      }
      const kind = [...use][0], pixels = View(glb, image.bufferView);
      try {
        const result = await Encode(pixels, { colorSpace: kind === "color" ? "srgb" : "linear", block: BlockFor(kind), normal: kind === "normal", flipY: false });
        chunks[image.bufferView] = result.bytes; image.mimeType = "image/ktx2"; converted.add(index);
        images.push({ index, use: kind, block: BlockFor(kind), width: result.width, height: result.height, levels: result.levels, sourceBytes: pixels.length,
          bytes: result.bytes.length, gpuBytes: result.gpuBytes, sha256: Hash(result.bytes) });
      } catch (error) { report.skipped.push({ file, image: index, reason: "encode failed: " + String(error.message || error).slice(0, 200) }); }
    }
    if (!converted.size) continue;
    for (const texture of doc.textures || []) {
      const index = ImageOf(texture); if (!converted.has(index)) continue;
      texture.extensions = { ...texture.extensions, KHR_texture_basisu: { source: index } };
      delete texture.extensions.EXT_texture_webp; delete texture.source;
    }
    const webpUsed = (doc.textures || []).some((t) => t.extensions?.EXT_texture_webp);
    for (const key of ["extensionsUsed", "extensionsRequired"]) doc[key] = [...new Set([...(doc[key] || []).filter((name) => name !== "EXT_texture_webp" || webpUsed), "KHR_texture_basisu"])];
    const encoded = PackGlb(doc, chunks), readback = ReadGlb(encoded);
    const imageViews = new Set([...converted].map((index) => doc.images[index].bufferView));
    for (let i = 0; i < chunks.length; i++) if (!imageViews.has(i) && !View(glb, i).equals(View(readback, i))) throw Error("Non-image GLB bytes changed: " + file);
    for (const key of ["nodes", "meshes", "skins", "animations", "accessors", "materials", "scenes", "cameras"])
      if (JSON.stringify(glb.doc[key]) !== JSON.stringify(readback.doc[key])) throw Error(`GLB structure changed (${key}): ${file}`);
    const output = file.replace(/\.glb$/, `_Mobile${Hash(encoded).slice(0, 24)}.glb`);
    await fs.writeFile(Within(outputDir, output), encoded);
    runtime.models[file] = output;
    report.models.push({ file, output, sourceBytes: source.length, bytes: encoded.length, sourceSha256: Hash(source), sha256: Hash(encoded), images });
    log(`Mobile model ${file}: ${converted.size} images, ${source.length} -> ${encoded.length} bytes`);
  }
  await fs.writeFile(Within(outputDir, "Data_MobileAssetRuntime.mjs"), `export const MOBILE_ASSET_RUNTIME = ${JSON.stringify(runtime)};\n`);
  const all = [...report.textures, ...report.models.flatMap((m) => m.images)];
  report.summary = { textures: report.textures.length, models: report.models.length, images: all.length,
    gpuBytes: all.reduce((n, r) => n + r.gpuBytes, 0), skipped: report.skipped.length };
  return report;
}
