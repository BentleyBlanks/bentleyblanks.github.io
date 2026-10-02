import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ImportDimensions, ImportColorSpace, NormalizeImportSettings } from "./Script_TextureImportRules.mjs";
import { TransformImportPixels, NormalizeImportNormals, BuildImportMipmaps } from "./Script_TextureImportPixels.mjs";
import { read as ReadKtx, write as WriteKtx } from "./vendor/three/examples/jsm/libs/ktx-parse.module.js";
const require = createRequire(import.meta.url), run = promisify(execFile);
const Hash = value => createHash("sha256").update(value).digest("hex");

export async function EncodeTexture(projectDir, item, input, outputDir) {
  const sharp = require("sharp"), settings = NormalizeImportSettings(input, item);
  const source = await fs.readFile(path.join(projectDir, "Texture", item.file)), meta = await sharp(source).metadata();
  const dimensions = ImportDimensions(meta.width, meta.height, settings.maxSize, settings.npot);
  const colorSpace = ImportColorSpace(settings, item);
  const key = Hash(Buffer.concat([source, Buffer.from(JSON.stringify({ settings, colorSpace, pipeline: 2 }))])).slice(0, 24);
  const gpu = settings.format.startsWith("ktx2"), originalExtension = path.extname(item.file).slice(1).toLowerCase();
  const extension = gpu ? "ktx2" : settings.format === "source" ? originalExtension
    : settings.format.startsWith("webp") ? "webp" : settings.format === "jpeg" ? "jpg" : "png";
  const stem = `${path.basename(item.file, path.extname(item.file))}_Import${key}`, filename = `${stem}.${extension}`;
  const destination = path.join(outputDir, filename); await fs.mkdir(outputDir, { recursive: true });
  const result = { ...settings, ...dimensions, key, filename, colorSpace, sourceBytes: source.length,
    mipLevels: settings.mipmaps !== false ? Math.floor(Math.log2(Math.max(dimensions.width, dimensions.height))) + 1 : 1 };
  const decoded = await sharp(source).toColourspace("srgb").ensureAlpha().raw().toBuffer();
  let data = TransformImportPixels(decoded, meta.width, meta.height, settings);
  const resized = meta.width !== dimensions.width || meta.height !== dimensions.height;
  if (resized) {
    const raw = { width: meta.width, height: meta.height, channels: 4 };
    if (colorSpace === "linear") {
      const channels = await Promise.all([0, 1, 2, 3].map(channel => sharp(data, { raw }).extractChannel(channel)
        .resize(dimensions.width, dimensions.height, { fit: "fill", kernel: settings.resizeFilter }).greyscale().raw().toBuffer()));
      data = new Uint8Array(dimensions.width * dimensions.height * 4);
      for (let i = 0; i < channels[0].length; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = channels[c][i];
    } else data = await sharp(data, { raw }).resize(dimensions.width, dimensions.height, { fit: "fill", kernel: settings.resizeFilter }).raw().toBuffer();
  }
  if (settings.textureType === "normal") NormalizeImportNormals(data);
  if (settings.format === "ktx2-bc1" || extension === "jpg" || extension === "jpeg") {
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error("DXT1 / BC1 与 JPEG 不保留连续 Alpha。请选择 DXT5 / BC3、BC7 或显式把 Alpha Source 设为 None。");
  }
  const pixelChanges = resized || settings.swizzle !== "rgba" || settings.alphaSource !== "input" || settings.alphaTransparency
    || settings.flipGreen || ["normal", "single"].includes(settings.textureType);
  const passthrough = settings.format === "source" && !pixelChanges;
  if (!passthrough && colorSpace === "linear" && (extension === "webp" || gpu)) {
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0 && (data[i] || data[i + 1] || data[i + 2])) {
      throw new Error("此数据图的 Alpha=0 像素仍含有效 RGB。请选择 PNG 保留全部数据，避免透明像素优化丢失通道值。");
    }
  }
  const Pixels = level => sharp(level.data, { raw: { width: level.width, height: level.height, channels: 4 } });
  const base = { data, ...dimensions }, customMips = settings.mipmaps !== false && (settings.mipCoverage || settings.mipFade
    || !gpu && (settings.mipmaps === true || settings.mipBorder || settings.mipFilter === "box"));
  const levels = customMips ? BuildImportMipmaps(data, dimensions.width, dimensions.height, settings, colorSpace) : [base];
  if (gpu) {
    const packagePath = require.resolve("@gpu-tex-enc/basis/package.json"), pkg = require(packagePath);
    const bin = pkg.bin[`basisu-${process.platform}-${process.arch}`];
    if (!bin) throw new Error(`Basis encoder unavailable on ${process.platform}/${process.arch}`);
    const executable = path.resolve(path.dirname(packagePath), bin), temp = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianTexture-"));
    try {
      for (const flip of [true, false]) {
        const output = flip ? destination : path.join(outputDir, `${stem}_NoFlip.ktx2`), containers = [];
        for (let level = 0; level < levels.length; level++) {
          const png = path.join(temp, "Input.png"), encoded = path.join(temp, "Level.ktx2");
          await (flip ? Pixels(levels[level]).flip() : Pixels(levels[level])).png().toFile(png);
          const args = ["-file", png, "-output_file", encoded, "-ktx2", "-max_threads", "2"];
          if (settings.format === "ktx2-etc1s") args.push("-q", String(Math.max(1, Math.round(settings.quality * 255 / 100))));
          else args.push("-uastc", "-uastc_level", String(Math.min(4, Math.floor(settings.quality / 21))));
          if (colorSpace === "linear") args.push("-linear");
          if (!customMips && settings.mipmaps !== false) {
            args.push("-mipmap", "-mip_filter", settings.mipFilter);
            if (settings.mipBorder) args.push("-mip_clamp");
            if (settings.textureType === "normal") args.push("-mip_renorm");
          }
          await run(executable, args, { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 });
          const bytes = await fs.readFile(encoded);
          if (customMips) containers.push(ReadKtx(new Uint8Array(bytes)));
          else await fs.writeFile(output, bytes);
        }
        if (customMips) {
          // UASTC/Zstd levels are independent. ETC1S codebooks cannot be combined.
          const container = containers[0]; container.levels = containers.map(value => value.levels[0]); container.levelCount = container.levels.length;
          await fs.writeFile(output, WriteKtx(container));
        }
        if (!flip) result.unflipped = path.basename(output);
      }
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  } else {
    if (passthrough) await fs.writeFile(destination, source);
    else {
      let image = Pixels(base);
      if (extension === "webp") image = image.webp({ quality: Math.max(1, settings.quality), lossless: settings.format === "webp-lossless", effort: 4, alphaQuality: 100 });
      else if (/jpe?g/.test(extension)) image = image.jpeg({ quality: Math.max(1, settings.quality), chromaSubsampling: "4:4:4" });
      else image = image.png({ compressionLevel: 9 });
      await image.toFile(destination);
    }
    if (customMips) {
      result.mipFiles = [];
      for (let level = 1; level < levels.length; level++) {
        const name = `${stem}_Mip${level}.png`; await Pixels(levels[level]).png().toFile(path.join(outputDir, name)); result.mipFiles.push(name);
      }
    }
  }
  if (settings.readWrite) { result.cpuFile = `${stem}_Cpu.bin`; await fs.writeFile(path.join(outputDir, result.cpuFile), data); }
  result.bytes = (await fs.stat(destination)).size;
  result.downloadBytes = result.bytes;
  for (const file of [...(result.mipFiles || []), ...(result.cpuFile ? [result.cpuFile] : [])]) result.downloadBytes += (await fs.stat(path.join(outputDir, file))).size;
  return result;
}
export { Hash as TextureImportHash };
