// UV-aligned UI paper maps. No tiling, albedo regrading or text-to-height conversion.
// node Taierzhuang1938/_import/Script_BakeBootPaperPbr.mjs --source-dir=<imagegen PNG directory>
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { BOOT_PAPERS } from "../Data_BootPapers.mjs";

const sourceDir = process.argv.find(x => x.startsWith("--source-dir="))?.slice(13);
if (!sourceDir) throw new Error("--source-dir is required; see Prompts/Texture_BootPaperPbr.txt");
const project = path.resolve(import.meta.dirname, "..");
const target = path.join(project, "Texture/Menu/BootPaper");
const Hash = b => crypto.createHash("sha256").update(b).digest("hex");
const records = [];
const files = [];
for (const paper of BOOT_PAPERS) {
  const base = await fs.readFile(path.join(target, paper.file));
  const source = await fs.readFile(path.join(sourceDir, `Texture_BootPaper${paper.id}Normal.png`));
  const meta = await sharp(base).metadata();
  const scale = Math.min(1, 512 / Math.max(meta.width, meta.height));
  const width = Math.round(meta.width * scale), height = Math.round(meta.height * scale);
  const pixels = width * height;
  const rgb = await sharp(base).resize(width, height).removeAlpha().raw().toBuffer();
  const generated = await sharp(source).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  // Exterior flood fill keeps black ink / photographs solid inside the sheet.
  const outside = new Uint8Array(pixels), queue = new Int32Array(pixels);
  let head = 0, tail = 0;
  const Visit = i => {
    if (outside[i] || Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) > 38) return;
    outside[i] = 1; queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { Visit(x); Visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { Visit(y * width); Visit(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = Math.floor(i / width);
    if (x) Visit(i - 1); if (x < width - 1) Visit(i + 1);
    if (y) Visit(i - width); if (y < height - 1) Visit(i + width);
  }
  // Imagegen's flat lavender can have a small color bias; calibrate to its border.
  let red = 0, green = 0, samples = 0;
  for (let i = 0; i < pixels; i++) {
    const x = i % width, y = Math.floor(i / width);
    if (x > 2 && x < width - 3 && y > 2 && y < height - 3) continue;
    red += generated[i * 3]; green += generated[i * 3 + 1]; samples++;
  }
  red /= samples; green /= samples;
  const normal = Buffer.alloc(pixels * 3), roughness = Buffer.alloc(pixels * 4);
  let roughMin = 255, roughMax = 0;
  for (let i = 0; i < pixels; i++) {
    let nx = outside[i] ? 0 : (generated[i * 3] - red) / 127.5 * 0.8;
    let ny = outside[i] ? 0 : (generated[i * 3 + 1] - green) / 127.5 * 0.8;
    const nz = Math.max(0.5, generated[i * 3 + 2] / 127.5 - 1);
    const slopeLimit = Math.min(1, 0.7 * nz / Math.max(0.001, Math.hypot(nx, ny)));
    nx *= slopeLimit; ny *= slopeLimit;
    const length = Math.hypot(nx, ny, nz);
    normal[i * 3] = Math.round((nx / length * 0.5 + 0.5) * 255);
    normal[i * 3 + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    normal[i * 3 + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
    const slope = Math.hypot(nx, ny);
    const value = 2 * Math.round(Math.max(0.76, Math.min(0.94, 0.87 - slope * 0.18 + ny * 0.055)) * 127.5);
    roughness.fill(value, i * 4, i * 4 + 3);
    roughness[i * 4 + 3] = outside[i] ? 0 : 255;
    if (!outside[i]) { roughMin = Math.min(roughMin, value); roughMax = Math.max(roughMax, value); }
  }
  const outputs = [];
  for (const [channel, buffer, channels, manifestChannel] of [
    ["Normal", normal, 3, "Normal"], ["RoughnessMask", roughness, 4, "Mask"],
  ]) {
    const filename = `Texture_BootPaper${paper.id}${channel}.webp`;
    await sharp(buffer, { raw: { width, height, channels } }).webp({ lossless: true, effort: 6 }).toFile(path.join(target, filename));
    const encoded = await fs.readFile(path.join(target, filename));
    outputs.push({ file: filename, width, height, bytes: encoded.length, sha256: Hash(encoded) });
    files.push([`Menu/BootPaper/${filename}`, manifestChannel, width, height]);
  }
  records.push({ id: paper.id, sourceHash: Hash(source), baseHash: Hash(base), roughnessRange: [roughMin / 255, roughMax / 255], outputs });
  console.log(`${paper.id}: ${width}x${height}, ${outputs.reduce((n, x) => n + x.bytes, 0)} bytes`);
}
await fs.writeFile(path.join(project, "_import/TextureBakes/Data_BootPaperPbr.json"), JSON.stringify({
  version: 1, date: "2026-10-06", normalConvention: "OpenGL +Y", colorSpace: "linear",
  packing: "Normal RGB unit vectors; RoughnessMask RGB roughness, A sheet coverage",
  params: { normalConvention: "gl" }, metrics: {},
  outputs: records.flatMap(record => record.outputs), records, files,
}, null, 2) + "\n");
