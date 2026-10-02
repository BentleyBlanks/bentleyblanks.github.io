import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { TextureCatalog, ValidateImportDocument, ImportDimensions, NormalizeImportSettings } from "./Script_TextureImportRules.mjs";
import { EncodeTexture, TextureImportHash } from "./Script_TextureImportBuild.mjs";
import { BuildTextureImports } from "./Script_BuildTextureImports.mjs";
const sharp = createRequire(import.meta.url)("sharp"), catalog = TextureCatalog();
assert.ok(catalog.length > 250);
assert.equal(new Set(catalog.map(item => item.file)).size, catalog.length);
assert.throws(() => ValidateImportDocument({ version: 1, textures: { "../outside.png": {} } }), /Unknown texture/);
assert.throws(() => ValidateImportDocument({ version: 1, textures: { [catalog[0].file]: { quality: 101 } } }), /Quality/);
assert.throws(() => NormalizeImportSettings({ format: "ktx2-uastc" }, catalog.find(item => item.kind === "terrainLayer")), /GPU/);
assert.throws(() => NormalizeImportSettings({ mipmaps: false }, catalog.find(item => item.kind === "hud")), /Mipmap/);
assert.deepEqual(ImportDimensions(1024, 512, 256), { width: 256, height: 128 });
assert.deepEqual(ImportDimensions(32, 16, 64), { width: 32, height: 16 });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "TengxianImportTest-"));
try {
  const sourceDir = path.join(temp, "source"), output = path.join(temp, "publish");
  await fs.mkdir(path.join(sourceDir, "Texture"), { recursive: true });
  await fs.mkdir(output);
  const item = catalog[0], data = Buffer.alloc(128 * 64 * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = i / 4 % 128 * 2; data[i + 1] = Math.floor(i / 4 / 128) * 4; data[i + 2] = 128; data[i + 3] = 255; }
  const source = await sharp(data, { raw: { width: 128, height: 64, channels: 4 } }).webp({ lossless: true }).toBuffer();
  await fs.writeFile(path.join(sourceDir, "Texture", item.file), source);
  for (const [format, mipmaps] of [["png", false], ["webp-lossless", true], ["ktx2-uastc", false], ["ktx2-etc1s", true]]) {
    const report = await EncodeTexture(sourceDir, item, { maxSize: 64, format, quality: 75, mipmaps }, output);
    const bytes = await fs.readFile(path.join(output, report.filename));
    assert.deepEqual([report.width, report.height], [64, 32]);
    if (format.startsWith("ktx2")) {
      assert.equal(bytes.subarray(1, 7).toString(), "KTX 20");
      assert.deepEqual([bytes.readUInt32LE(20), bytes.readUInt32LE(24)], [64, 32]);
      assert.equal(bytes.readUInt32LE(40), mipmaps ? 7 : 1);
      assert.ok((await fs.stat(path.join(output, report.unflipped))).size > 100);
    } else {
      const meta = await sharp(bytes).metadata(); assert.deepEqual([meta.width, meta.height], [64, 32]);
    }
  }
  const preserved = await EncodeTexture(sourceDir, item, {}, output);
  assert.deepEqual(await fs.readFile(path.join(output, preserved.filename)), source, "default is byte-identical passthrough");
  const dataItem = catalog.find(item => item.channel === "Normal" && item.file.endsWith(".png"));
  const rgba = Buffer.from([128, 255, 128, 0, 20, 30, 40, 120]);
  await fs.writeFile(path.join(sourceDir, "Texture", dataItem.file), await sharp(rgba, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer());
  await assert.rejects(EncodeTexture(sourceDir, dataItem, { format: "webp-lossless" }, output), /Alpha=0/);
  const exact = await EncodeTexture(sourceDir, dataItem, { format: "png" }, output);
  assert.deepEqual(await sharp(await fs.readFile(path.join(output, exact.filename))).raw().toBuffer(), rgba);
  const code = `const texture = "./Texture/${item.file}?v=old"; const paperFile = "${item.file}";`;
  await fs.writeFile(path.join(output, "Script_Fixture.mjs"), code);
  await fs.writeFile(path.join(output, "Style_Fixture.css"), `body{background:url("./Texture/${item.file}?v=old")}`);
  await fs.writeFile(path.join(output, "index.html"), '<link rel="stylesheet" href="./Style_Fixture.css?v=old">');
  const reports = await BuildTextureImports(sourceDir, output, { version: 1, textures: { [item.file]: { maxSize: 64, format: "ktx2-uastc", mipmaps: false } } });
  const replaced = await fs.readFile(path.join(output, "Script_Fixture.mjs"), "utf8");
  assert.ok(replaced.includes(reports[0].filename + "?v=old"));
  assert.ok(replaced.includes(`paperFile = "${reports[0].filename}"`), "split directory/basename catalogs are rewritten");
  assert.match(await fs.readFile(path.join(output, "index.html"), "utf8"), /Style_Fixture_Import[a-f0-9]+\.css/, "CSS imports receive a new cache identity");
  const { TEXTURE_IMPORT_RUNTIME: runtime } = await import(new URL(`file:///${path.join(output, "Data_TextureImportRuntime.mjs").replaceAll("\\", "/")}`));
  assert.equal(runtime[item.file].mipmaps, false);
  assert.equal(runtime[item.file].output, reports[0].filename);
  assert.equal(TextureImportHash(await fs.readFile(path.join(sourceDir, "Texture", item.file))), TextureImportHash(source), "publish never overwrites source");
  console.log(`PASS TextureImportTest: ${catalog.length} assets; exact passthrough, alpha data, encoders, mip headers, staging and URL rewrite`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }
