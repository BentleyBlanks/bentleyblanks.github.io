import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EMBEDDED_TEXTURE_MODELS, InspectEmbeddedTextures, CompressEmbeddedTextures, ReadGlb} from './_import/Script_CompressEmbeddedTextures.mjs';

const report = JSON.parse(await fs.readFile(new URL('./Model/Data_EmbeddedTextureCompression.json', import.meta.url)));
assert.deepEqual(report.models.map(row => row.name), EMBEDDED_TEXTURE_MODELS);
let before = 0, after = 0;
for (const row of report.models) {
  const bytes = await fs.readFile(new URL('./Model/' + row.name, import.meta.url));
  const inspected = await InspectEmbeddedTextures(bytes), {doc} = ReadGlb(bytes);
  assert.ok((await CompressEmbeddedTextures(bytes)).equals(bytes), 'repeat compression is byte-identical');
  assert.deepEqual(inspected, row.after, `${row.name}: deployed bytes and decoded pixels match the bake audit`);
  assert.equal(inspected.geometry, row.before.geometry, 'all non-image buffer views remain byte-identical');
  assert.deepEqual(inspected.images.map(({width, height, pixels}) => ({width, height, pixels})),
    row.before.images.map(({width, height, pixels}) => ({width, height, pixels})), 'original resolution, RGB, alpha and data channels remain identical');
  assert.ok(inspected.bytes < row.before.bytes * .75, 'each asset retains at least 25% lossless size reduction');
  assert.ok(doc.extensionsRequired.includes('EXT_texture_webp'));
  for (const texture of doc.textures) {
    const index = texture.extensions?.EXT_texture_webp?.source;
    if (index !== undefined) assert.equal(doc.images[index].mimeType, 'image/webp');
    else assert.equal(doc.images[texture.source].mimeType, 'image/png');
  }
  before += row.before.bytes; after += inspected.bytes;
}
console.log(`PASS EmbeddedTexture: ${before} -> ${after} bytes; unchanged pixels, resolution, geometry and animation buffers`);
