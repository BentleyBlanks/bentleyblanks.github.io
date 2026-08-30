// Ten imported soldiers: offline GLB contract + runtime wiring (pure Node).
//
// ===========================================================================
// 【2026-08-29：姿态审计从「读清单自报数」改成「直接读 GLB 量骨盆」】
//
// 这里原来只有一条贴地闸：`maxGroundPenetrationMeters ≤ 0.002`。它漏掉了本仓库
// 最贵的一次资产事故 —— v3 重烘把根骨（骨盆）的位移轨道烘丢了，十六条 clip 的人
// 全被钉在站立高度悬在空中；**悬空的人永远不会陷进地里**，所以那条闸不但没红，
// 十条模型 × 十六条 clip 的 penetration 全是 0.000000，看起来还格外健康。
//
// 教训有两条，都写进下面的断言里了：
//   1) 审计不能只问「有没有陷进地里」，必须问「姿势对不对」。加了逐 clip 的骨盆
//      高度：十六条 clip 的骨盆不许挤成一个数（跨 clip 落差 ≥ 0.40 m），而且必须
//      同时存在真躺/坐的低位与真站的高位。姿态一旦被冻住，这条先红。
//   2) 数不能只信烘焙自己写的清单 —— 那是同一次坏烘焙的产物。骨盆那条现在**直接
//      解析 GLB、走一遍 FK 现量**（_import/Script_LugouGlbPose.mjs），清单只用来
//      交叉核对；两边对不上也算红。
//
// 贴地阈值也随实测改了口径：作者摆的躺/坐姿本来就允许身体小幅陷进接触面
// （膝、靴尖、压扁的鞋底），拿「绝对最低顶点 ≥ 0」当铁律，等于必须把躺着的人
// 整个抬离地面。所以站姿参考 clip 仍然守得很紧（≤ 0.08 m），躺/坐这类接触姿
// 放到 ≤ 0.25 m —— 这一条本来就不是姿态闸，姿态闸是上面第 1 条。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LoadGlb, MeasurePose } from "./_import/Script_LugouGlbPose.mjs";

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
// 真站姿那条 clip（名字与内容对不上号的账在 Script_CharacterModel 的 POSE_CLIPS 头注）。
// 它是唯一一条「鞋底就该踩在地面上」的参考，贴地守得最紧。
const STANDING_REFERENCE_CLIP = "AdvanceFire";
// 姿态闸的两条硬线，单位是资产自身的米（未按演员身高缩放）：
// 十六条 clip 的骨盆不许挤成一个数，且必须真有低位（躺/坐）与高位（站）。
const MIN_PELVIS_SPREAD = 0.40;
const MAX_LOW_POSE_PELVIS = 0.35;
const MIN_HIGH_POSE_PELVIS = 0.70;

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
assert.equal(manifest.schema, 2);
assert.equal(manifest.models.length, 10, "ten character records");
assert.deepEqual(manifest.models.map((model) => model.id), [
  "LugouIja01", "LugouIja02", "LugouIja03", "LugouIja04", "LugouIja05",
  "LugouNra01", "LugouNra02", "LugouNra03", "LugouNra04", "LugouNra05",
]);
assert.equal(manifest.models.filter((model) => model.faction === "nra").length, 5);
assert.equal(manifest.models.filter((model) => model.faction === "ija").length, 5);

for (const model of manifest.models) {
  const factionStem = model.faction === "ija" ? "Ija" : "Nra";
  assert.equal(model.animationSource, `Lugou${factionStem}Canonical`,
    `${model.id} uses its own faction's canonical animation rig`);
  assert.equal(model.animationSourceModel, `Lugou${factionStem}01`,
    `${model.id} records its same-faction animation source model`);
  assert.deepEqual(model.animations, expectedActions, `${model.id} manifest actions`);
  assert.equal(Number.isInteger(model.limitedWeightVertices), true,
    `${model.id} records four-weight conversion count`);
  assert.equal(model.limitedWeightVertices >= 0, true,
    `${model.id} four-weight conversion count is non-negative`);
  assert.deepEqual(Object.keys(model.animationAudit), expectedActions,
    `${model.id} has one source-parity audit per action`);
  for (const actionId of expectedActions) {
    const audit = model.animationAudit[actionId];
    assert.equal(audit.sourceFrames >= 2, true, `${model.id}/${actionId} source frames`);
    assert.equal(audit.sourceBones >= 52, true, `${model.id}/${actionId} source bones`);
    assert.equal(audit.maxPoseDeltaError <= 0.001, true,
      `${model.id}/${actionId} matches its Max/BIP pose`);
    // 躺/坐这类接触姿允许身体小幅陷进接触面；站姿参考 clip 仍然守 8 cm。
    const groundLimit = actionId === STANDING_REFERENCE_CLIP ? 0.08 : 0.25;
    assert.equal(audit.maxGroundPenetrationMeters <= groundLimit, true,
      `${model.id}/${actionId} ground contact ${audit.maxGroundPenetrationMeters} <= ${groundLimit}`);
    assert.equal(Array.isArray(audit.pelvisHeightMeters) && audit.pelvisHeightMeters.length === 2, true,
      `${model.id}/${actionId} records the clip's pelvis height band`);
    assert.equal(audit.pelvisHeightMeters[0] <= audit.pelvisHeightMeters[1], true,
      `${model.id}/${actionId} pelvis height band is ordered`);
  }
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
  assert.equal((gltf.nodes || []).some((node) => node.name === "GroundRoot"), true,
    `${model.id} GLB has an offline mesh-grounding root`);
  assert.equal((gltf.nodes || []).some((node) => node.name === "Socket_HeadGear"), true,
    `${model.id} GLB has the head-centre collision anchor`);

  // ── 姿态闸：直接解析 GLB 走 FK 现量，不看清单自报的数 ──────────────────────
  const measured = MeasurePose(LoadGlb(glbPath), {
    pelvisName: model.boneRoles.pelvis,
    headName: model.boneRoles.head,
    samples: 9,
  });
  assert.equal(measured.pelvisSpread >= MIN_PELVIS_SPREAD, true,
    `${model.id} 十六条 clip 的骨盆高度落差只有 ${measured.pelvisSpread.toFixed(3)} m`
    + `（要求 ≥ ${MIN_PELVIS_SPREAD}）—— 姿态被冻住了，多半是根骨位移轨道又丢了`);
  assert.equal(measured.pelvisLow <= MAX_LOW_POSE_PELVIS, true,
    `${model.id} 最低的骨盆也有 ${measured.pelvisLow.toFixed(3)} m：没有任何一条 clip 能把人放到地上`);
  assert.equal(measured.pelvisHigh >= MIN_HIGH_POSE_PELVIS, true,
    `${model.id} 最高的骨盆只有 ${measured.pelvisHigh.toFixed(3)} m：没有一条真站姿`);
  for (const actionId of expectedActions) {
    const recorded = model.animationAudit[actionId].pelvisHeightMeters;
    const seen = measured.byClip[actionId].pelvis;
    // 清单是烘焙时按源帧数密采样记的，这里只取 9 帧，所以清单那条带子必须**包住**
    // 现量的这条（留 2 cm 采样误差）。对不上说明有人只改了一边。
    assert.equal(recorded[0] <= seen[0] + 0.02 && recorded[1] >= seen[1] - 0.02, true,
      `${model.id}/${actionId} 清单记的骨盆高度 ${recorded} 没包住 GLB 实测 `
      + `[${seen[0].toFixed(3)}, ${seen[1].toFixed(3)}]`);
  }
}

const runtime = fs.readFileSync(path.join(here, "Script_CharacterModel.mjs"), "utf8");
const actor = fs.readFileSync(path.join(here, "Script_Actor.mjs"), "utf8");
const cutscene = fs.readFileSync(path.join(here, "Script_Cutscene.mjs"), "utf8");
const main = fs.readFileSync(path.join(here, "Script_Main.mjs"), "utf8");
const editor = fs.readFileSync(path.join(here, "Script_EditorActor.mjs"), "utf8");
const bakePowerShell = fs.readFileSync(path.join(here, "_import", "Script_BakeLugouCharacters.ps1"), "utf8");
assert.match(runtime, /options\.protagonist\s*&&\s*faction\s*===\s*"nra"[\s\S]*?\?\s*0/,
  "protagonist selects Nra01");
assert.match(runtime, /HashString\(`\$\{faction\}:\$\{options\.seed/, "stable faction variant selection");
assert.match(runtime, /Raycast\(origin, direction, maxDistance\)/, "bone hitbox raycast exists");
assert.match(runtime, /CHARACTER_HITBOX_PROFILE/, "model-calibrated character hitbox profile exists");
assert.match(runtime, /id: "head", type: "sphere", role: "headCenter"[\s\S]*?nraWidthScale: 0\.8[\s\S]*?part: "head"/,
  "head profile carries the NRA 20%-narrower cranial width");
assert.match(runtime, /isNraHead[\s\S]*?type: isNraHead \? "ellipsoid"[\s\S]*?definition\.nraWidthScale/,
  "NRA head instantiates an ellipsoid while IJA retains the shared sphere");
assert.match(runtime, /function BuildHeadHitCenter\(head, headGear\)/,
  "runtime builds a head-local cranial centre");
assert.match(runtime, /headGear\.parent === head[\s\S]*?headGear\.position\.length\(\)/,
  "headgear bone-tail distance is used only as the authored scale reference");
assert.match(runtime, /center\.position\.set\(authoredLength \* 0\.52, authoredLength \* 0\.14, 0\)/,
  "cranial centre offsets along the Head-local anatomical axes");
assert.doesNotMatch(runtime, /a: "neck", b: "headGear"/,
  "headgear bone tail is not reused as a head-collision endpoint");
assert.match(runtime, /getWorldScale\(WORLD_SCALE\)/, "hitbox radius uses actual render-root scale");
assert.match(runtime, /RaycastCapsule\(origin, direction/, "capsule uses exact ray intersection");
assert.match(runtime, /RaycastEllipsoid\(origin, direction/, "NRA head uses exact ellipsoid ray intersection");
assert.doesNotMatch(runtime, /distanceSqToSegment\(shape\.start/, "old closest-distance capsule approximation removed");
assert.match(runtime, /SetHeadVisible\(visible\)/, "first-person head visibility control exists");
assert.match(actor, /SOLDIER_MESH_BY_KIND\.civilian/, "old soldier models are not preloaded");
assert.match(actor, /this\.proceduralHitboxes\s*=\s*\[/,
  "procedural civilian and fallback models have segmented hitboxes");
assert.match(actor, /capsule\("head", this\.neck, this\.eyes/,
  "procedural head uses neck-to-eye proxy instead of fallback torso sphere");
assert.match(cutscene, /protagonist:\s*spec\.firstPerson\s*===\s*true[\s\S]*?modelVariant:\s*spec\.firstPerson\s*===\s*true\s*\?\s*0/,
  "first-person protagonist requests Nra01");
assert.match(cutscene, /characterRig\?\.SetHeadVisible\(false\)/,
  "first-person protagonist hides only its skinned head bone");
assert.doesNotMatch(main, /shot\.dist\s*<\s*40[\s\S]{0,100}head/, "head hit is not rolled after impact");
assert.match(runtime, /LUGOU_ANIMATION_PROFILE_BY_KIND/, "runtime owns the character-action compatibility ledger");
assert.match(runtime, /nraOfficer:[\s\S]*?role:\s*"officer"/, "NRA officer profile is explicit");
assert.match(runtime, /ijaOfficer:[\s\S]*?role:\s*"officer"/, "IJA officer profile is explicit");
assert.match(runtime, /GetLugouAnimationEntries\(kind\)/, "runtime exposes role-filtered imported clips");
assert.match(runtime, /IsLugouAnimationAllowed\(kind, clipId\)/, "runtime exposes an applicability guard");
assert.doesNotMatch(runtime, /this\.root\.userData\.skipNormalDepth\s*=\s*true/,
  "rigged characters are not removed wholesale from NormalDepth");
assert.match(runtime, /normalDepthMaxDistance\s*=\s*NORMAL_DEPTH_DETAIL_MAX_DISTANCE/,
  "only small distant skinned parts use a NormalDepth distance LOD");
assert.match(editor, /GetLugouAnimationEntries/, "editor reads role-filtered imported clips");
assert.match(editor, /IsLugouAnimationAllowed\(actor\.kind, this\.clipId\)/,
  "editor rechecks every lineup actor before playing an imported clip");
assert.match(editor, /动作适用对象/, "editor reports the action's intended character type");
assert.match(runtime, /LUGOU_MODEL_VARIANTS_BY_KIND/, "runtime records the four-soldier plus one-officer model contract");
assert.match(runtime, /nraOfficer:\s*OFFICER_MODEL_VARIANTS/, "NRA officer selects only the officer source model");
assert.match(runtime, /ijaOfficer:\s*OFFICER_MODEL_VARIANTS/, "IJA officer selects only the officer source model");
assert.match(editor, /GetLugouCharacterVariantEntries/, "editor exposes selectable source models");
assert.match(editor, /4兵\+1官对比/, "editor offers a full faction lineup instead of a hidden random variant");
assert.doesNotMatch(runtime, /floorY[\s\S]{0,300}foot/i,
  "runtime does not align ankle-height foot bones to the floor");
assert.match(runtime, /this\.root\.position\.set\(0,\s*-actor\.body\.position\.y,\s*0\)/,
  "offline-grounded rig cancels the parent body's hip-height translation");
assert.match(bakePowerShell, /NRA01 and IJA01 separately/,
  "Max batch exports faction-canonical NRA and IJA action sources");

console.log(`CharacterModelTest OK — ${manifest.models.length} models × ${expectedActions.length} source-parity, `
  + "GLB-measured pelvis-pose and ground audits, sockets and bone hitboxes verified");
