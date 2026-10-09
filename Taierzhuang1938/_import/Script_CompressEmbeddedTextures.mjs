// Lossless, same-resolution PNG -> WebP packaging. Run after the source GLB baker.
// All non-image buffer views and all scene/mesh/animation descriptions are preserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const project = path.resolve(import.meta.dirname, '..');
export const EMBEDDED_TEXTURE_MODELS = ['Model_MitsubishiKi30.glb', 'Model_BreakableDeadTree.glb', 'Model_Cigarette.glb'];
const Hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function ReadGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB');
  const length = bytes.readUInt32LE(12), binStart = 28 + length;
  return {doc: JSON.parse(bytes.subarray(20, 20 + length).toString()), bin: bytes.subarray(binStart)};
}
function ViewBytes(glb, index) {
  const view = glb.doc.bufferViews[index];
  if (view.buffer !== 0) throw Error('Only embedded single-buffer GLBs are supported');
  return glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}
export function GeometryHash(glb) {
  const imageViews = new Set((glb.doc.images || []).map(image => image.bufferView));
  return Hash(Buffer.concat(glb.doc.bufferViews.flatMap((_, i) => imageViews.has(i) ? [] : [ViewBytes(glb, i)])));
}
function Pack(doc, bin) {
  const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const bytes = Buffer.alloc(28 + padded.length + bin.length);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  bytes.writeUInt32LE(bin.length, 20 + padded.length); bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
  bin.copy(bytes, 28 + padded.length); return bytes;
}
export async function InspectEmbeddedTextures(bytes) {
  const glb = ReadGlb(bytes), images = [];
  for (const [index, image] of (glb.doc.images || []).entries()) {
    const encoded = ViewBytes(glb, image.bufferView);
    const {data, info} = await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    images.push({index, mime: image.mimeType, width: info.width, height: info.height, bytes: encoded.length, pixels: Hash(data)});
  }
  return {bytes: bytes.length, sha256: Hash(bytes), geometry: GeometryHash(glb), images};
}
export async function CompressEmbeddedTextures(bytes) {
  const original = ReadGlb(bytes), doc = structuredClone(original.doc), replacements = new Map(), converted = new Set();
  for (const [index, image] of (doc.images || []).entries()) {
    if (image.mimeType !== 'image/png') continue;
    const source = ViewBytes(original, image.bufferView);
    const output = await sharp(source).webp({lossless: true, effort: 6}).toBuffer();
    const pixels = await sharp(source).ensureAlpha().raw().toBuffer();
    const decoded = await sharp(output).ensureAlpha().raw().toBuffer();
    // Some encoders discard RGB beneath transparent pixels. Keep the original in that case.
    if (!pixels.equals(decoded) || output.length >= source.length) continue;
    replacements.set(image.bufferView, output); image.mimeType = 'image/webp'; converted.add(index);
  }
  if (!converted.size) return bytes;
  for (const texture of doc.textures || []) {
    if (!converted.has(texture.source)) continue;
    texture.extensions = {...texture.extensions, EXT_texture_webp: {source: texture.source}};
    delete texture.source;
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) doc[key] = [...new Set([...(doc[key] || []), 'EXT_texture_webp'])];
  const parts = []; let offset = 0;
  for (const [index, view] of doc.bufferViews.entries()) {
    const data = replacements.get(index) || ViewBytes(original, index);
    view.byteOffset = offset; view.byteLength = data.length;
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4); data.copy(padded); parts.push(padded); offset += padded.length;
  }
  doc.buffers[0].byteLength = offset;
  const output = Pack(doc, Buffer.concat(parts));
  if (GeometryHash(ReadGlb(output)) !== GeometryHash(original)) throw Error('Geometry changed');
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reportPath = path.join(project, 'Model/Data_EmbeddedTextureCompression.json');
  const previous = await fs.readFile(reportPath, 'utf8').then(JSON.parse).catch(() => ({models: []}));
  const rows = []; let changed = false;
  for (const name of EMBEDDED_TEXTURE_MODELS) {
    const filename = path.join(project, 'Model', name), bytes = await fs.readFile(filename);
    const output = await CompressEmbeddedTextures(bytes);
    const before = await InspectEmbeddedTextures(bytes), after = await InspectEmbeddedTextures(output);
    if (output.length !== bytes.length) await fs.writeFile(filename, output);
    const prior = previous.models.find(row => row.name === name);
    rows.push(before.sha256 === after.sha256 && prior?.after.sha256 === after.sha256 ? prior : {name, before, after});
    changed ||= before.sha256 !== after.sha256;
    console.log(`${name}: ${bytes.length} -> ${output.length} bytes, lossless pixels and identical geometry`);
  }
  // Do not replace the original audit with an uninformative before==after on a repeat run.
  if (changed) await fs.writeFile(reportPath, JSON.stringify({version: 1, method: 'lossless WebP, original resolution and RGBA', models: rows}, null, 2) + '\n');
}
