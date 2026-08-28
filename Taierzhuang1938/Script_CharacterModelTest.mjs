// Ten imported soldiers: offline GLB contract + runtime wiring (pure Node).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const characterDir = path.join(here, "Model", "Character");
const expectedActions = [
  "LeanWallSitPeek", "RifleIdle", "RifleIdleAlt", "RifleRun",
  "CrouchFire", "CrouchFireAlt", "CrouchIdle", "MachineGunFire",
  "EmplacementIdle", "AttackCommand", "ProneFire", "StandFireCrouch",
  "StandFireCrouchAlt", "AdvanceKneelFire", "AdvanceFire", "PistolFire",
];
const expectedRoles = [
  "head", "neck", "chest", "pelvis", "handR", "handL", "footR", "footL",
  "upperArmR", "upperArmL", "forearmR", "forearmL",
  "thighR", "thighL", "calfR", "calfL",
];

function ReadGlbJson(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(20);
    assert.equal(fs.readSync(fd, header, 0, header.length, 0), header.length);
    assert.equal(header.readUInt32LE(0), 0x46546c67, `${path.basename(filePath)} GLB magic`);
    assert.equal(header.readUInt32LE(4), 2, `${path.basename(filePath)} glTF version`);
    assert.equal(header.readUInt32LE(8), fs.statSync(filePath).size, `${path.basename(filePath)} byte length`);
    const jsonLength = header.readUInt32LE(12);
    assert.equal(header.readUInt32LE(16), 0x4e4f534a, `${path.basename(filePath)} JSON first chunk`);
    const bytes = Buffer.alloc(jsonLength);
    assert.equal(fs.readSync(fd, bytes, 0, jsonLength, 20), jsonLength);
    return JSON.parse(bytes.toString("utf8").replace(/\u0000+$/g, "").trimEnd());
  } finally {
    fs.closeSync(fd);
  }
}

const manifestPath = path.join(characterDir, "Data_LugouCharacterManifest.json");
assert.ok(fs.existsSync(manifestPath), "character bake manifest exists");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.schema, 1);
assert.equal(manifest.models.length, 10, "ten character records");
assert.deepEqual(manifest.models.map((model) => model.id), [
  "LugouIja01", "LugouIja02", "LugouIja03", "LugouIja04", "LugouIja05",
  "LugouNra01", "LugouNra02", "LugouNra03", "LugouNra04", "LugouNra05",
]);
assert.equal(manifest.models.filter((model) => model.faction === "nra").length, 5);
assert.equal(manifest.models.filter((model) => model.faction === "ija").length, 5);

for (const model of manifest.models) {
  assert.deepEqual(model.animations, expectedActions, `${model.id} manifest actions`);
  assert.deepEqual(Object.keys(model.boneRoles).sort(), [...expectedRoles].sort(), `${model.id} semantic bones`);
  assert.deepEqual([...model.sockets].sort(),
    ["Socket_BackBlade", "Socket_HeadGear", "Socket_WeaponL", "Socket_WeaponR"].sort());
  assert.equal(model.validation.skinnedMeshes >= 1, true, `${model.id} has skinned mesh`);
  assert.equal(model.validation.animations.length, expectedActions.length, `${model.id} validated animations`);
  assert.equal(Math.abs(model.bounds.min[2]) < 0.002, true, `${model.id} soles normalized to Z=0`);
  assert.equal(model.bounds.size[2] > 1.4 && model.bounds.size[2] < 2.2, true,
    `${model.id} plausible human height`);

  const glbPath = path.join(here, model.url.replace(/^\.\//, ""));
  assert.ok(fs.statSync(glbPath).size > 100_000, `${model.id} GLB has payload`);
  const gltf = ReadGlbJson(glbPath);
  assert.equal((gltf.skins || []).length >= 1, true, `${model.id} GLB skin`);
  assert.equal((gltf.meshes || []).length >= 1, true, `${model.id} GLB mesh`);
  assert.equal((gltf.animations || []).length, expectedActions.length, `${model.id} GLB animations`);
}

const runtime = fs.readFileSync(path.join(here, "Script_CharacterModel.mjs"), "utf8");
const actor = fs.readFileSync(path.join(here, "Script_Actor.mjs"), "utf8");
const cutscene = fs.readFileSync(path.join(here, "Script_Cutscene.mjs"), "utf8");
const main = fs.readFileSync(path.join(here, "Script_Main.mjs"), "utf8");
const editor = fs.readFileSync(path.join(here, "Script_EditorActor.mjs"), "utf8");
assert.match(runtime, /options\.protagonist\s*&&\s*faction\s*===\s*"nra"[\s\S]*?\?\s*0/,
  "protagonist selects Nra01");
assert.match(runtime, /HashString\(`\$\{faction\}:\$\{options\.seed/, "stable faction variant selection");
assert.match(runtime, /Raycast\(origin, direction, maxDistance\)/, "bone hitbox raycast exists");
assert.match(runtime, /SetHeadVisible\(visible\)/, "first-person head visibility control exists");
assert.match(actor, /SOLDIER_MESH_BY_KIND\.civilian/, "old soldier models are not preloaded");
assert.match(cutscene, /protagonist:\s*spec\.firstPerson\s*===\s*true[\s\S]*?modelVariant:\s*spec\.firstPerson\s*===\s*true\s*\?\s*0/,
  "first-person protagonist requests Nra01");
assert.match(cutscene, /characterRig\?\.SetHeadVisible\(false\)/,
  "first-person protagonist hides only its skinned head bone");
assert.doesNotMatch(main, /shot\.dist\s*<\s*40[\s\S]{0,100}head/, "head hit is not rolled after impact");
assert.match(editor, /IMPORTED_CLIPS/, "editor exposes imported clips");
assert.match(editor, /length:\s*5[\s\S]*modelVariant/, "editor exposes all five variants per faction");

console.log(`CharacterModelTest OK — ${manifest.models.length} models × ${expectedActions.length} actions, sockets and bone hitboxes verified`);
