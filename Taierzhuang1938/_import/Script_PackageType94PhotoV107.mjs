// Losslessly package the verified game bake. Everything written here is external.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CompressEmbeddedTextures, InspectEmbeddedTextures, ReadGlb } from "./Script_CompressEmbeddedTextures.mjs";

const revision = process.env.TYPE94_PHOTO_REVISION || "V107";
if (!["V107", "V108", "V109", "V111"].includes(revision)) throw new Error(`Unknown Type 94 photo revision ${revision}`);
const root = path.resolve(process.env.TYPE94_PHOTO_ROOT ||
  `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/PhotoReconstruction${revision}`);
const acceptance = path.join(root, "Acceptance");
const ReadJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const Hash = bytes => createHash("sha256").update(bytes).digest("hex");

const game = await ReadJson(path.join(acceptance, `Data_Type94Game${revision}.json`));
const bytes = await fs.readFile(game.sourceGlb);
assert.equal(Hash(bytes), game.sha256, "Raw game bake identity");
const before = await InspectEmbeddedTextures(bytes);
const compressed = await CompressEmbeddedTextures(bytes);
const after = await InspectEmbeddedTextures(compressed);
assert.equal(before.geometry, after.geometry);
assert.equal(before.images.length, 12);
assert.equal(after.images.length, 12);
for (const [i, image] of before.images.entries()) {
  assert.deepEqual([image.pixels, image.width, image.height],
    [after.images[i].pixels, after.images[i].width, after.images[i].height]);
  assert.ok(Math.max(image.width, image.height) <= 4096);
}
const orig = ReadGlb(bytes).doc;
const result = ReadGlb(compressed).doc;
for (const key of ["nodes", "meshes", "materials", "accessors", "scenes", "scene", "samplers"]) {
  assert.deepEqual(orig[key], result[key]);
}
assert.ok(compressed.length < 100_000_000, "Packed GLB size exceeds the GitHub file limit");
const output = path.join(root, "Exports", "Model_Type94Tankette.glb");
const pending = output + ".pending";
await fs.writeFile(pending, compressed);
await fs.rename(pending, output);
const report = {
  schema: "Type94ReleasePackagingV1",
  revision: `Photo${revision}`,
  sourceGlb: game.sourceGlb,
  sourceSha256: game.sha256,
  sourceBlend: game.sourceBlend,
  sourceBlendSha256: game.sourceBlendSha256,
  output: { file: "Model/Type94Tankette/Model_Type94Tankette.glb", ...after },
  losslessPixelsAndOriginalResolution: true,
  nonImageBufferViewsExact: true,
  sceneGeometryMaterialAndControlsExact: true,
  triangles: game.triangles,
  meshOwners: game.meshOwners,
};
await fs.writeFile(path.join(acceptance, `Data_Packaging${revision}.json`), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, bytes: after.bytes, sha256: after.sha256, triangles: game.triangles }));
