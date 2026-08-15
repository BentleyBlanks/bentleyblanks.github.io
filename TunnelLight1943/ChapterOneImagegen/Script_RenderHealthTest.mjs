import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "./Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(projectDir, "..", "..");
const generatedTexturePath = path.join(projectDir, "Texture", "Texture_BackgroundDawnFields.png");
const generatedSceneOneTextures = Object.freeze({
  houseFacadeDamaged: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_HouseFacadeDamaged.png"),
  doorFrameTimber: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_DoorFrameTimber.png"),
  kangBed: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_KangBed.png"),
  stoolLow: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_StoolLow.png"),
  waterJarCracked: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_WaterJarCracked.png"),
  beddingRagged: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_BeddingRagged.png"),
  stoveColdPaperCut: path.join(projectDir, "Texture", "Generated", "SceneOne", "Texture_StoveColdPaperCut.png"),
});
const generatedSharedSurfaceTextures = Object.freeze({
  elmSparse: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ElmNearBare.png"),
  wellWinchFrame: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_WellWinchFrame.png"),
  wellStoneBase: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_WellStoneBase.png"),
  wellBucket: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_WellBucket.png"),
  shedBurned: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ShedBurned.png"),
  ashDebrisPile: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_AshDebrisPile.png"),
  wellRopeDrum: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_WellRopeDrum.png"),
  wellCrankHandle: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_WellCrankHandle.png"),
  shedLooseTimberTools: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ShedLooseTimberTools.png"),
  shedThatchMat: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ShedThatchMat.png"),
  shedReedMat: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ShedReedMat.png"),
  shedCharredDoorPlank: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ShedCharredDoorPlank.png"),
  shedFeedTrough: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_ShedFeedTrough.png"),
  ashGroundCrackedStrip: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_AshGroundCrackedStrip.png"),
  distantVillageWatchtowers: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_DistantVillageWatchtowers.png"),
  qishuHouse: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_VillageHouseFacadeQishu.png"),
  houseB: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_VillageHouseFacadeB.png"),
  houseC: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_VillageHouseFacadeC.png"),
  houseD: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_VillageHouseFacadeD.png"),
  haystackFull: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_HaystackFull.png"),
  haystackRaided: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_HaystackRaided.png"),
  yardWallIntact: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_YardWallIntact.png"),
  yardWallGate: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_YardWallGate.png"),
  yardWallBroken: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_YardWallBroken.png"),
  oldWoodDoors: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_OldWoodDoors.png"),
  noticeWall: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_NoticeWall.png"),
  pigpenEmpty: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_PigpenEmpty.png"),
  stalkFence: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_StalkFence.png"),
  cropRowsSparse: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_CropRowsSparse.png"),
  stubbleField: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_StubbleField.png"),
  sownField: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_SownField.png"),
  woodpile: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_Woodpile.png"),
  firewoodBundle: path.join(projectDir, "Texture", "Generated", "SharedSurface", "Texture_FirewoodBundle.png"),
});
const generatedCellarTextures = Object.freeze({
  cellarEarthWallTile: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_CellarEarthWallTile.png"),
  cellarTimberPost: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_CellarTimberPost.png"),
  cellarTimberBeam: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_CellarTimberBeam.png"),
  oilLampWeak: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_OilLampWeak.png"),
  clothBundleOld: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_ClothBundleOld.png"),
  freshEarthMound: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_FreshEarthMound.png"),
  cellarLongLadder: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_CellarLongLadder.png"),
  cellarStorageCluster: path.join(projectDir, "Texture", "Generated", "Cellar", "Texture_CellarStorageCluster.png"),
});
const generatedCharacterRigTextures = Object.freeze({
  brother: Object.freeze({
    head: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherHeadSide.png"),
    torso: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherTorsoSide.png"),
    upperArm: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherUpperArmSide.png"),
    forearmHand: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherForearmHandSide.png"),
    thigh: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherThighSide.png"),
    shin: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherShinSide.png"),
    foot: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_BrotherFootSide.png"),
  }),
  sister: Object.freeze({
    head: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterHeadSide.png"),
    torso: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterTorsoSide.png"),
    upperArm: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterUpperArmSide.png"),
    forearmHand: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterForearmHandSide.png"),
    thigh: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterThighSide.png"),
    shin: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterShinSide.png"),
    foot: path.join(projectDir, "Texture", "Generated", "CharacterRig", "Texture_SisterFootSide.png"),
  }),
});
const textureGroups = Object.freeze({
  sceneOne: generatedSceneOneTextures,
  sharedSurface: generatedSharedSurfaceTextures,
  cellar: generatedCellarTextures,
});
const expectedGroupLengths = Object.freeze({
  sceneOne: 7,
  sharedSurface: 33,
  cellar: 8,
  characterRig: 14,
});
const expectedCharacterRigLength = expectedGroupLengths.characterRig;
const generatedModulePath = path.join(projectDir, "Script_GeneratedAssets.mjs");

function AssertPng(texturePath, key, { rgba = true } = {}) {
  assert.equal(fs.existsSync(texturePath), true, `generated ${key} texture must exist`);
  const png = fs.readFileSync(texturePath);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `generated ${key} texture must be a PNG`);
  assert.equal(png.readUInt32BE(16), 1536, `generated ${key} width must be 1536px`);
  assert.equal(png.readUInt32BE(20), 1536, `generated ${key} height must be 1536px`);
  if (rgba) {
    assert.equal(png[24], 8, `generated ${key} bit depth must be 8-bit`);
    assert.equal(png[25], 6, `generated ${key} color type must be RGBA`);
  }
}

AssertPng(generatedTexturePath, "dawnFields", { rgba: false });
for (const [groupName, textures] of Object.entries(textureGroups)) {
  assert.equal(
    Object.keys(textures).length,
    expectedGroupLengths[groupName],
    `${groupName} must contain ${expectedGroupLengths[groupName]} accepted textures`,
  );
  for (const [key, texturePath] of Object.entries(textures)) AssertPng(texturePath, key);
}
let characterRigAssetCount = 0;
for (const [character, bones] of Object.entries(generatedCharacterRigTextures)) {
  assert.equal(Object.keys(bones).length, 7, `character rig ${character} must contain seven bones`);
  for (const [bone, texturePath] of Object.entries(bones)) {
    AssertPng(texturePath, `characterRig/${character}/${bone}`);
    characterRigAssetCount += 1;
  }
}
assert.equal(characterRigAssetCount, expectedCharacterRigLength, "character rig must contain 14 accepted textures");

// The generated-asset loader is an isolated sibling module. Runtime registration
// and actual requests are checked in Chromium below instead of grepping asset names.
const generatedModuleSource = fs.readFileSync(generatedModulePath, "utf8");
assert.equal(
  /(?:from|import\s*\()\s*["']\.\.\//.test(generatedModuleSource),
  false,
  "generated asset module must stay local",
);

const expectedKeys = Object.fromEntries(
  Object.entries(textureGroups).map(([groupName, textures]) => [groupName, Object.keys(textures).sort()]),
);
const expectedFileNames = Object.fromEntries(
  Object.entries(textureGroups).map(([groupName, textures]) => [
    groupName,
    Object.fromEntries(Object.entries(textures).map(([key, texturePath]) => [key, path.basename(texturePath)])),
  ]),
);
const expectedCharacterRigKeys = Object.fromEntries(
  Object.entries(generatedCharacterRigTextures).map(([character, bones]) => [character, Object.keys(bones).sort()]),
);
const expectedCharacterRigFileNames = Object.fromEntries(
  Object.entries(generatedCharacterRigTextures).map(([character, bones]) => [
    character,
    Object.fromEntries(Object.entries(bones).map(([bone, texturePath]) => [bone, path.basename(texturePath)])),
  ]),
);
const worldGroupNames = ["sceneOne", "sharedSurface", "cellar"];
const expectedIdentityCount = worldGroupNames.reduce((total, groupName) => total + expectedGroupLengths[groupName], 0);
const expectedAssetCount = expectedIdentityCount + expectedCharacterRigLength;

function AssertRegisteredGroup(groupName, registry, pageUrl) {
  assert.deepEqual(Object.keys(registry).sort(), expectedKeys[groupName], `${groupName} registry keys`);
  for (const [key, url] of Object.entries(registry)) {
    const resolved = new URL(url, pageUrl);
    assert.equal(
      decodeURIComponent(resolved.pathname).split("/").at(-1),
      expectedFileNames[groupName][key],
      `${groupName}/${key} must register its accepted PNG`,
    );
    assert.ok(resolved.search.length > 1, `${groupName}/${key} texture URL must be cache-busted`);
    assert.doesNotMatch(`${key} ${resolved.href}`, /CellarOpening/i, "retired cellar-opening art must not be registered");
  }
}

function AssertRegisteredCharacterRig(registry, pageUrl) {
  assert.deepEqual(Object.keys(registry).sort(), Object.keys(expectedCharacterRigKeys).sort(), "character rig registry people");
  for (const [character, bones] of Object.entries(registry)) {
    assert.deepEqual(Object.keys(bones).sort(), expectedCharacterRigKeys[character], `character rig/${character} bones`);
    for (const [bone, url] of Object.entries(bones)) {
      const resolved = new URL(url, pageUrl);
      assert.equal(
        decodeURIComponent(resolved.pathname).split("/").at(-1),
        expectedCharacterRigFileNames[character][bone],
        `character rig/${character}/${bone} must register its accepted PNG`,
      );
      assert.ok(resolved.search.length > 1, `character rig/${character}/${bone} texture URL must be cache-busted`);
      assert.doesNotMatch(`${character}/${bone} ${resolved.href}`, /CellarOpening/i, "retired cellar-opening art must not be registered");
    }
  }
}

function AssertAssetContract(groupName, assets, { eligible = true } = {}) {
  assert.deepEqual(Object.keys(assets).sort(), expectedKeys[groupName], `${groupName} runtime asset keys`);
  for (const [key, asset] of Object.entries(assets)) {
    assert.equal(asset.status, "ready", `${groupName}/${key} texture must load`);
    assert.equal(asset.eligible, eligible, `${groupName}/${key} eligibility`);
    assert.deepEqual(asset.sourceDimensions, { width: 1536, height: 1536 }, `${groupName}/${key} source size`);
    assert.ok(
      asset.targetDimensions?.width > 0 && asset.targetDimensions?.height > 0,
      `${groupName}/${key} target dimensions must be positive`,
    );
    assert.equal(asset.anchor?.z, 0, `${groupName}/${key} anchor must remain on the world plane`);
    assert.equal(typeof asset.visible, "boolean", `${groupName}/${key} visibility must be observable`);
    assert.equal(typeof asset.fallbackVisible, "boolean", `${groupName}/${key} fallback visibility must be observable`);
    assert.doesNotMatch(`${key} ${asset.url}`, /CellarOpening/i, "retired cellar-opening art must not reach runtime");
    if (!eligible) assert.equal(asset.visible, false, `${groupName}/${key} must hide outside its eligible scene`);
  }
}

function AssertSnapshotEligibility(snapshot, eligible) {
  assert.equal(snapshot.generatedBackdrop.status, "ready", "generated dawn-fields backdrop must load");
  assert.equal(snapshot.generatedBackdrop.eligible, eligible, "generated backdrop eligibility");
  assert.equal(snapshot.generatedBackdrop.visible, eligible, `generated backdrop visibility when eligible=${eligible}`);
  AssertAssetContract("sceneOne", snapshot.sceneOne, { eligible });
  AssertAssetContract("sharedSurface", snapshot.sharedSurface, { eligible });
  AssertAssetContract("cellar", snapshot.cellar, { eligible });
}

const seenVisible = new Set();
const seenWithFallbackClosed = new Set();
function ObserveEligibleSnapshot(snapshot, label) {
  AssertSnapshotEligibility(snapshot, true);
  for (const [groupName, assets] of Object.entries({
    sceneOne: snapshot.sceneOne,
    sharedSurface: snapshot.sharedSurface,
    cellar: snapshot.cellar,
  })) {
    for (const [key, asset] of Object.entries(assets)) {
      if (!asset.visible) continue;
      const identity = `${groupName}/${key}`;
      seenVisible.add(identity);
      assert.equal(asset.fallbackVisible, false, `${identity} procedural body must be hidden in ${label}`);
      seenWithFallbackClosed.add(identity);
      if (asset.instanceCount !== undefined) {
        assert.ok(asset.instanceCount > 0, `${identity} must expose at least one generated instance`);
        assert.ok(asset.visibleCount > 0, `${identity} must expose at least one visible generated instance`);
      }
      if (asset.fallbackVisibleCount !== undefined) {
        assert.equal(asset.fallbackVisibleCount, 0, `${identity} must expose no visible procedural instances`);
      }
    }
  }
}

const server = await ServeRoot(repoRoot, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

try {
  await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/ChapterOneImagegen/?fast=1`, {
    waitUntil: "load",
    timeout: 60000,
  });
  await page.waitForFunction(() => window.TunnelLight !== undefined, undefined, { timeout: 60000 });
  const titleHealth = await page.evaluate(() => {
    const zOf = (id) => Number.parseInt(getComputedStyle(document.getElementById(id)).zIndex, 10);
    return {
      hidden: document.getElementById("titleScreen").hidden,
      titleZ: zOf("titleScreen"),
      hudZ: zOf("hud"),
    };
  });
  assert.equal(titleHealth.hidden, false, "plain page load must show the title screen");
  assert.ok(
    titleHealth.titleZ > titleHealth.hudZ,
    `title screen z=${titleHealth.titleZ} must sit above the opaque HUD fade layer z=${titleHealth.hudZ}`,
  );
  await page.evaluate(() => {
    window.TunnelLight.StartGame(0);
    window.TunnelLight.StepFrames(60, { advance: true });
    window.TunnelLight.JumpToChapter(0);
    window.TunnelLight.StepFrames(30, { advance: true });
    window.TunnelLight.Settle(2);
  });
  await page.waitForFunction(
    (groupLengths) => {
      const world = window.TunnelLight?.world;
      const groups = [
        ["sceneOne", world?.__generatedAssets],
        ["sharedSurface", world?.__generatedSurfaceAssets],
        ["cellar", world?.__generatedCellarAssets],
      ];
      return world?.__generatedBackdrop?.status !== "loading"
        && groups.every(([groupName, assets]) => assets
          && Object.keys(assets).length === groupLengths[groupName]
          && Object.values(assets).every(({ status }) => status !== "idle" && status !== "loading"));
    },
    expectedGroupLengths,
    { timeout: 60000 },
  );

  const registration = await page.evaluate(async () => {
    const generated = await import("./Script_GeneratedAssets.mjs");
    return {
      pageUrl: location.href,
      sceneOne: generated.SCENE_ONE_GENERATED_ASSETS,
      sharedSurface: generated.SURFACE_GENERATED_ASSETS,
      cellar: generated.CELLAR_GENERATED_ASSETS,
      characterRig: generated.CHARACTER_RIG_GENERATED_ASSETS,
      resources: performance.getEntriesByType("resource").map(({ name }) => name),
    };
  });
  AssertRegisteredGroup("sceneOne", registration.sceneOne, registration.pageUrl);
  AssertRegisteredGroup("sharedSurface", registration.sharedSurface, registration.pageUrl);
  AssertRegisteredGroup("cellar", registration.cellar, registration.pageUrl);
  AssertRegisteredCharacterRig(registration.characterRig, registration.pageUrl);

  const characterRigLoad = await page.evaluate(async () => {
    const generated = await import("./Script_GeneratedAssets.mjs");
    const loaded = await generated.LoadCharacterRigAssets();
    return Object.fromEntries(
      Object.entries(loaded).map(([character, bones]) => [
        character,
        Object.fromEntries(Object.entries(bones).map(([bone, texture]) => [bone, texture !== null])),
      ]),
    );
  });
  assert.deepEqual(Object.keys(characterRigLoad).sort(), Object.keys(expectedCharacterRigKeys).sort(), "character rig load people");
  for (const [character, bones] of Object.entries(characterRigLoad)) {
    assert.deepEqual(Object.keys(bones).sort(), expectedCharacterRigKeys[character], `character rig/${character} loaded bones`);
    for (const [bone, loaded] of Object.entries(bones)) {
      assert.equal(loaded, true, `character rig/${character}/${bone} accepted texture must load`);
    }
  }
  assert.equal(
    registration.resources.some((url) => /CellarOpening/i.test(url)),
    false,
    "retired cellar-opening art must never be requested",
  );
  for (const moduleName of ["Script_GeneratedAssets.mjs", "Script_World.js"]) {
    const loaded = registration.resources.find((url) => new URL(url).pathname.endsWith(`/${moduleName}`));
    assert.ok(loaded, `${moduleName} must load in the browser`);
    assert.ok(new URL(loaded).search.length > 1, `${moduleName} must load through a cache-busted URL`);
  }

  const baseHealth = await page.evaluate(() => {
    const tl = window.TunnelLight;
    const gl = tl.renderer.getContext();
    const glError = gl.getError();
    tl.world.Render();
    const source = tl.renderer.domElement;
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 36;
    const ctx = probe.getContext("2d");
    ctx.drawImage(source, 0, 0, 64, 36);
    const pixels = ctx.getImageData(0, 0, 64, 36).data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return {
      glError,
      spread: max - min,
      chapterIndex: tl.state?.chapterIndex,
      phase: tl.state?.phase,
      beat: tl.state?.beatIndex ?? -1,
      chapterCount: document.querySelectorAll("#chapterList button").length,
      generatedBackdrop: tl.world.__generatedBackdrop,
      sceneOne: tl.world.__generatedAssets,
      sharedSurface: tl.world.__generatedSurfaceAssets,
      cellar: tl.world.__generatedCellarAssets,
    };
  });
  assert.equal(baseHealth.glError, 0, `WebGL returned error ${baseHealth.glError}`);
  assert.ok(baseHealth.spread >= 8, `rendered frame is nearly flat (spread ${baseHealth.spread})`);
  assert.equal(baseHealth.chapterIndex, 0);
  assert.equal(baseHealth.chapterCount, 1, "title must expose only Chapter One");
  ObserveEligibleSnapshot(baseHealth, "base Chapter One village");
  for (const key of expectedKeys.sceneOne) {
    assert.equal(baseHealth.sceneOne[key].visible, true, `sceneOne/${key} must be visible in the base village`);
  }
  for (const key of ["elmSparse", "wellWinchFrame", "wellStoneBase", "shedBurned"]) {
    assert.equal(baseHealth.sharedSurface[key].visible, true, `sharedSurface/${key} must be visible in the base village`);
  }
  for (const key of ["cellarEarthWallTile", "cellarTimberPost", "cellarTimberBeam", "oilLampWeak", "clothBundleOld"]) {
    assert.equal(baseHealth.cellar[key].visible, true, `cellar/${key} must be visible before burial`);
  }
  assert.equal(baseHealth.cellar.freshEarthMound.visible, false, "fresh mound must start hidden");

  // Rendering eligibility is a scene/chapter contract, not a camera-transition
  // contract. Moving underground while climbing/vaulting must not unload any set.
  const transitionSnapshots = await page.evaluate(() => {
    const tl = window.TunnelLight;
    const player = tl.state.player;
    const previous = { level: player.level, climbT: player.climbT, vaultT: player.vaultT };
    const probes = [
      { label: "underground", level: "under", climbT: 0, vaultT: 0 },
      { label: "climbing", level: "surface", climbT: 0.72, vaultT: 0 },
      { label: "vaulting", level: "surface", climbT: 0, vaultT: 0.61 },
    ];
    try {
      return probes.map((probe) => {
        Object.assign(player, probe);
        tl.Settle(2);
        return {
          label: probe.label,
          generatedBackdrop: tl.world.__generatedBackdrop,
          sceneOne: tl.world.__generatedAssets,
          sharedSurface: tl.world.__generatedSurfaceAssets,
          cellar: tl.world.__generatedCellarAssets,
        };
      });
    } finally {
      Object.assign(player, previous);
      tl.Settle(2);
    }
  });
  for (const snapshot of transitionSnapshots) ObserveEligibleSnapshot(snapshot, snapshot.label);

  // chapterIndex===0 and CHAPTERS[0].scene==='village' are both required.
  // Mutating the exported chapter table exercises the scene half through the
  // same module instance used by World, without relying on source-text matching.
  const wrongSceneSnapshot = await page.evaluate(async () => {
    const tl = window.TunnelLight;
    const { CHAPTERS } = await import("./Script_Core.mjs");
    const originalScene = CHAPTERS[0].scene;
    let snapshot;
    try {
      CHAPTERS[0].scene = "fields";
      tl.Settle(2);
      snapshot = {
        generatedBackdrop: tl.world.__generatedBackdrop,
        sceneOne: tl.world.__generatedAssets,
        sharedSurface: tl.world.__generatedSurfaceAssets,
        cellar: tl.world.__generatedCellarAssets,
      };
    } finally {
      CHAPTERS[0].scene = originalScene;
      tl.Settle(2);
    }
    return snapshot;
  });
  AssertSnapshotEligibility(wrongSceneSnapshot, false);

  for (const chapterIndex of [1, 2]) {
    const ineligibleSnapshot = await page.evaluate((index) => {
      const tl = window.TunnelLight;
      tl.JumpToChapter(index);
      tl.Settle(2);
      return {
        generatedBackdrop: tl.world.__generatedBackdrop,
        sceneOne: tl.world.__generatedAssets,
        sharedSurface: tl.world.__generatedSurfaceAssets,
        cellar: tl.world.__generatedCellarAssets,
      };
    }, chapterIndex);
    AssertSnapshotEligibility(ineligibleSnapshot, false);
  }

  await page.evaluate(() => {
    const tl = window.TunnelLight;
    tl.JumpToChapter(0);
    tl.StepFrames(30, { advance: true });
    tl.Settle(2);
  });

  // pitDug is deliberately varied independently: only clothesBuried may swap
  // the old clothes and the fresh-earth mound, and the mound stays at x=27.1.
  const burialMatrix = await page.evaluate(() => {
    const tl = window.TunnelLight;
    const snapshots = [];
    for (const clothesBuried of [false, true]) {
      for (const pitDug of [false, true]) {
        tl.state.flags.clothesBuried = clothesBuried;
        tl.state.flags.pitDug = pitDug;
        tl.Settle(2);
        snapshots.push({
          clothesBuried,
          pitDug,
          generatedBackdrop: tl.world.__generatedBackdrop,
          sceneOne: tl.world.__generatedAssets,
          sharedSurface: tl.world.__generatedSurfaceAssets,
          cellar: tl.world.__generatedCellarAssets,
        });
      }
    }
    return snapshots;
  });
  for (const snapshot of burialMatrix) {
    const label = `clothesBuried=${snapshot.clothesBuried}, pitDug=${snapshot.pitDug}`;
    ObserveEligibleSnapshot(snapshot, label);
    assert.equal(
      snapshot.cellar.freshEarthMound.visible,
      snapshot.clothesBuried,
      `fresh mound must follow only clothesBuried (${label})`,
    );
    assert.equal(
      snapshot.cellar.clothBundleOld.visible,
      !snapshot.clothesBuried,
      `old clothes must be the inverse of clothesBuried (${label})`,
    );
    assert.equal(snapshot.cellar.freshEarthMound.anchor.x, 27.1, "fresh mound must align to graveDirt x=27.1");
  }

  const forageSnapshot = await page.evaluate(() => {
    const tl = window.TunnelLight;
    tl.JumpToBeat(0, 4);
    tl.StepFrames(1, {});
    tl.state.beat.stepIndex = 2;
    tl.state.player.level = "surface";
    tl.state.player.x = 12.26;
    tl.StepFrames(1, {});
    tl.Settle(2);
    return {
      forageActive: !!tl.state.forage,
      generatedBackdrop: tl.world.__generatedBackdrop,
      sceneOne: tl.world.__generatedAssets,
      sharedSurface: tl.world.__generatedSurfaceAssets,
      cellar: tl.world.__generatedCellarAssets,
    };
  });
  assert.equal(forageSnapshot.forageActive, true, "forage beat must publish its live ash state");
  ObserveEligibleSnapshot(forageSnapshot, "active shed foraging");
  assert.equal(forageSnapshot.sharedSurface.ashDebrisPile.visible, true, "generated ash pile must be visible while foraging");
  assert.equal(forageSnapshot.sharedSurface.ashDebrisPile.fallbackVisible, false, "procedural ash body must be hidden while foraging");

  const wellSnapshot = await page.evaluate(() => {
    const tl = window.TunnelLight;
    tl.JumpToBeat(0, 11);
    tl.StepFrames(1, {});
    tl.state.beat.stepIndex = 4;
    tl.state.flags.wellRopeFixed = true;
    tl.state.player.level = "surface";
    tl.state.player.x = 57.24;
    tl.state.player.heading = 1;
    tl.state.player.item = { id: "bucket", label: "bucket", big: true };
    tl.StepFrames(1, { interact: true });
    tl.Settle(2);
    return {
      winchActive: !!tl.state.winchView,
      bucketHooked: !!tl.state.winchView?.hooked,
      generatedBackdrop: tl.world.__generatedBackdrop,
      sceneOne: tl.world.__generatedAssets,
      sharedSurface: tl.world.__generatedSurfaceAssets,
      cellar: tl.world.__generatedCellarAssets,
    };
  });
  assert.equal(wellSnapshot.winchActive, true, "well beat must publish its live winch state");
  assert.equal(wellSnapshot.bucketHooked, true, "well beat must hook the live bucket");
  ObserveEligibleSnapshot(wellSnapshot, "active well bucket");
  assert.equal(wellSnapshot.sharedSurface.wellBucket.visible, true, "generated well bucket must be visible while hooked");
  assert.equal(wellSnapshot.sharedSurface.wellBucket.fallbackVisible, false, "procedural bucket body must be hidden while hooked");

  const allExpectedIdentities = Object.entries(expectedKeys)
    .flatMap(([groupName, keys]) => keys.map((key) => `${groupName}/${key}`))
    .sort();
  assert.deepEqual(
    [...seenVisible].sort(),
    allExpectedIdentities,
    `all ${expectedIdentityCount} world generated assets must become visible at runtime`,
  );
  assert.deepEqual(
    [...seenWithFallbackClosed].sort(),
    allExpectedIdentities,
    `all ${expectedIdentityCount} world generated assets must replace their procedural body while visible`,
  );

  await page.evaluate(() => window.TunnelLight.ToggleDebug(true));
  const debugCount = await page.locator("#debugChapters button").count();
  assert.equal(debugCount, 1, "debug panel must expose only Chapter One");
  assert.deepEqual(errors, [], `browser reported runtime errors: ${errors.join(" | ")}`);
  console.log(
    `ChapterOneImagegen render health passed: spread=${baseHealth.spread}, beat=${baseHealth.beat}, ${expectedAssetCount} generated assets (${expectedIdentityCount} world + ${expectedCharacterRigLength} character rig) and fallbacks verified.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
