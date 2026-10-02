import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ImportDimensions, NormalizeImportSettings } from "./Script_TextureImportRules.mjs";
const require = createRequire(import.meta.url), run = promisify(execFile);
const Hash = value => createHash("sha256").update(value).digest("hex");

// Work is always derived from the source file, never from a previous compressed output.
export async function EncodeTexture(projectDir, item, input, outputDir) {
  const sharp = require("sharp"), settings = NormalizeImportSettings(input, item);
  const source = await fs.readFile(path.join(projectDir, "Texture", item.file));
  const meta = await sharp(source).metadata();
  const dimensions = ImportDimensions(meta.width, meta.height, settings.maxSize);
  const key = Hash(Buffer.concat([source, Buffer.from(JSON.stringify({ settings, colorSpace: item.colorSpace, pipeline: 1 }))])).slice(0, 24);
  const gpu = settings.format.startsWith("ktx2");
  const originalExtension = path.extname(item.file).slice(1).toLowerCase();
  const extension = gpu ? "ktx2" : settings.format === "source" ? originalExtension
    : settings.format.startsWith("webp") ? "webp" : settings.format === "jpeg" ? "jpg" : "png";
  if (extension === "jpg" && meta.hasAlpha) throw new Error("JPEG would discard the source alpha channel");
  const filename = `${path.basename(item.file, path.extname(item.file))}_Import${key}.${extension}`;
  const destination = path.join(outputDir, filename);
  await fs.mkdir(outputDir, { recursive: true });
  const result = { ...settings, ...dimensions, key, filename, colorSpace: item.colorSpace,
    sourceBytes: source.length, mipLevels: gpu && settings.mipmaps !== false ? Math.floor(Math.log2(Math.max(dimensions.width, dimensions.height))) + 1 : 1 };
  let inputPixels = source;
  if (item.colorSpace === "linear" && meta.hasAlpha && (meta.width !== dimensions.width || meta.height !== dimensions.height)) {
    // Data alpha is height/masks, not coverage: resizing must not premultiply RGB.
    const channels = await Promise.all([0, 1, 2, 3].map(channel => sharp(source).ensureAlpha().extractChannel(channel)
      .resize(dimensions.width, dimensions.height, { fit: "fill" }).greyscale().raw().toBuffer()));
    const rgba = Buffer.alloc(dimensions.width * dimensions.height * 4);
    for (let i = 0; i < channels[0].length; i++) for (let c = 0; c < 4; c++) rgba[i * 4 + c] = channels[c][i];
    inputPixels = await sharp(rgba, { raw: { width: dimensions.width, height: dimensions.height, channels: 4 } }).png().toBuffer();
  }
  const pixels = () => sharp(inputPixels).resize(dimensions.width, dimensions.height, { fit: "fill", withoutEnlargement: true });
  if (item.colorSpace === "linear" && meta.hasAlpha && (extension === "webp" || gpu)) {
    const data = await pixels().ensureAlpha().raw().toBuffer();
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0 && (data[i] || data[i + 1] || data[i + 2])) {
      throw new Error("此数据图的 Alpha=0 像素仍含有效 RGB。请选择 PNG 保留全部数据，避免透明像素优化丢失通道值。");
    }
  }
  if (gpu) {
    const packagePath = require.resolve("@gpu-tex-enc/basis/package.json");
    const pkg = require(packagePath), bin = pkg.bin[`basisu-${process.platform}-${process.arch}`];
    if (!bin) throw new Error(`Basis encoder unavailable on ${process.platform}/${process.arch}`);
    const executable = path.resolve(path.dirname(packagePath), bin);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianTexture-"));
    try {
      // Compressed GPU blocks cannot use WebGL pixel-store flipY. Keep both UV
      // conventions for MaterialLibrary's authored glTF atlases and ordinary images.
      for (const flip of [true, false]) {
        const png = path.join(temp, "Input.png"), output = flip ? destination : destination.replace(/\.ktx2$/, "_NoFlip.ktx2");
        await (flip ? pixels().flip() : pixels()).png().toFile(png);
        const args = ["-file", png, "-output_file", output, "-ktx2", "-max_threads", "2"];
        if (settings.format === "ktx2-uastc") args.push("-uastc", "-uastc_level", String(Math.min(4, Math.floor(settings.quality / 21))));
        else args.push("-q", String(Math.max(1, Math.round(settings.quality * 255 / 100))));
        if (item.colorSpace === "linear") args.push("-linear");
        if (settings.mipmaps !== false) args.push("-mipmap");
        // Do not use -normal_map: Normal alpha can carry height, not opacity.
        await run(executable, args, { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 });
        if (!flip) result.unflipped = path.basename(output);
      }
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
  } else if (settings.format === "source" && !settings.maxSize) {
    await fs.writeFile(destination, source);
  } else {
    let image = pixels();
    if (extension === "webp") image = image.webp({ quality: settings.quality, lossless: settings.format === "webp-lossless", effort: 4, alphaQuality: 100 });
    else if (/jpe?g/.test(extension)) image = image.jpeg({ quality: settings.quality, chromaSubsampling: "4:4:4" });
    else image = image.png({ compressionLevel: 9 });
    await image.toFile(destination);
  }
  result.bytes = (await fs.stat(destination)).size;
  return result;
}

export { Hash as TextureImportHash };
