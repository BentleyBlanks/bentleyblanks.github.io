import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.join(testDirectory, "Script_World3D.mjs");
const gamePath = path.join(testDirectory, "Script_Game.mjs");
const indexPath = path.join(testDirectory, "index.html");
const stylePath = path.join(testDirectory, "Style_Game.css");
const terrainTexturePath = path.join(testDirectory, "Texture_TerrainPaperHigh.jpg");
const terrainAlbedoPath = path.join(testDirectory, "Texture_TerrainGroundAlbedo.png");
const miniatureDetailPath = path.join(testDirectory, "Texture_MiniatureSurfaceDetail.png");

const [worldSource, gameSource, indexSource, styleSource, terrainTextureBuffer, terrainAlbedoBuffer, miniatureDetailBuffer] = await Promise.all([
  readFile(worldPath, "utf8"),
  readFile(gamePath, "utf8"),
  readFile(indexPath, "utf8"),
  readFile(stylePath, "utf8"),
  readFile(terrainTexturePath),
  readFile(terrainAlbedoPath),
  readFile(miniatureDetailPath),
]);

const worldModule = await import(`${new URL("./Script_World3D.mjs", import.meta.url).href}?smoke=1`);
const terrainTextureStat = await stat(terrainTexturePath);
const terrainAlbedoStat = await stat(terrainAlbedoPath);
const miniatureDetailStat = await stat(miniatureDetailPath);
let assertionCount = 0;

function Check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

function ExtractFunction(source, functionName) {
  const startPattern = new RegExp(`(?:^|\\n)function\\s+${functionName}\\s*\\(`);
  const match = startPattern.exec(source);
  assert.ok(match, `Missing function ${functionName}`);
  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const openingBrace = source.indexOf("{", start);
  assert.notEqual(openingBrace, -1, `${functionName} must have an opening brace`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${functionName} must have a closing brace`);
}

function ReadJpegDimensions(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, "Terrain texture must be a JPEG image");
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = buffer.readUInt16BE(offset);
    if (frameMarkers.has(marker)) {
      return Object.freeze({
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      });
    }
    offset += segmentLength;
  }
  throw new Error("Terrain JPEG does not contain a supported frame marker");
}

function ReadPngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG", "Terrain albedo must be a PNG image");
  return Object.freeze({
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  });
}

Check(
  worldSource.includes('import * as THREE from "../../taihang/vendor/three/build/three.module.mjs"'),
  "World3D must import the repository-local Three.js module.",
);
Check(worldSource.includes("new THREE.WebGLRenderer"), "World3D must create WebGLRenderer.");
Check(worldSource.includes("new THREE.OrthographicCamera"), "World3D must use a fixed orthographic camera.");
Check(worldSource.includes("new THREE.InstancedMesh"), "World3D must batch repeated terrain or scenery with InstancedMesh.");
Check(worldSource.includes("new THREE.TextureLoader"), "World3D must load the generated terrain-paper texture.");
Check(worldSource.includes("material.userData.ownsMap = true"), "World3D must own and dispose the terrain texture.");
Check(worldSource.includes("GLTFLoader.mjs"), "World3D must load the Blender-authored glTF miniature pack.");
Check(worldSource.includes("loadAsync(World3DModelPackUrl)"), "World3D must asynchronously load the local model pack.");
Check(worldSource.includes("CloneModelAsset"), "World3D must clone named low-poly model prototypes.");
Check(worldSource.includes("fallback-procedural"), "World3D must retain procedural models if glTF loading fails.");
Check(worldSource.includes("worldModelPack"), "World3D diagnostics must expose model-pack readiness.");
Check(worldSource.includes('getAttribute("color")'), "World3D must validate the optimized glTF vertex-color palette.");
Check(worldSource.includes("material.vertexColors = true"), "Imported miniature materials must render their baked vertex colors.");
Check(worldSource.includes("assetMeshCount > 8"), "Each imported miniature must enforce its eight-mesh runtime budget.");
Check(worldSource.includes("modelPackMeshCount > 55"), "The complete miniature pack must enforce its 55-mesh runtime budget.");
Check(worldSource.includes("worldModelMeshes"), "World3D diagnostics must expose imported model mesh count.");
Check(
  worldModule.World3DTerrainTextureUrl.endsWith("Texture_TerrainPaperHigh.jpg?v=20260730p"),
  "World3D terrain texture URL must use the release cache identity.",
);
Check(
  worldModule.World3DTerrainAlbedoUrl.endsWith("Texture_TerrainGroundAlbedo.png?v=20260730p"),
  "ImageGen ground albedo URL must use the release cache identity.",
);
Check(
  worldModule.World3DModelPackUrl.endsWith("Model_EnemyRearMiniatures.glb?v=20260730p"),
  "World3D model-pack URL must use the release cache identity.",
);
Check(
  worldModule.World3DMiniatureDetailUrl.endsWith("Texture_MiniatureSurfaceDetail.png?v=20260730p"),
  "ImageGen miniature micro-detail URL must use the release cache identity.",
);
Check(
  worldModule.World3DModelNames.length === 10
    && worldModule.World3DModelNames.includes("Model_WorkTeam")
    && worldModule.World3DModelNames.includes("Model_EnemyBlockhouse")
    && worldModule.World3DModelNames.includes("Model_TrafficStation")
    && worldModule.World3DModelNames.includes("Model_RailwayStation"),
  "World3D must require all ten Blender-authored miniature archetypes.",
);
Check(
  terrainTextureStat.size > 1_000_000 && terrainTextureStat.size < 2_500_000,
  "The 2048px terrain texture must retain detail without an excessive runtime payload.",
);
const terrainTextureDimensions = ReadJpegDimensions(terrainTextureBuffer);
Check(
  terrainTextureDimensions.width === 2048 && terrainTextureDimensions.height === 2048,
  "The checked-in terrain texture must remain exactly 2048x2048.",
);
const terrainAlbedoDimensions = ReadPngDimensions(terrainAlbedoBuffer);
Check(
  terrainAlbedoStat.size > 2_000_000
    && terrainAlbedoStat.size < 5_000_000
    && terrainAlbedoDimensions.width >= 1024
    && terrainAlbedoDimensions.height >= 1024,
  "ImageGen ground albedo must retain production-scale detail without an excessive payload.",
);
const miniatureDetailDimensions = ReadPngDimensions(miniatureDetailBuffer);
Check(
  miniatureDetailStat.size > 1_000_000
    && miniatureDetailStat.size < 5_000_000
    && miniatureDetailDimensions.width >= 1024
    && miniatureDetailDimensions.height >= 1024,
  "ImageGen miniature micro-detail must retain production-scale grayscale surface information.",
);
Check(
  worldSource.includes('"TerrainImageGenAlbedoOverlay"')
    && worldSource.includes("material.roughnessMap = texture")
    && worldSource.includes("material.map = null")
    && worldSource.includes("THREE.MirroredRepeatWrapping")
    && worldSource.includes("vertexColors: false")
    && worldModule.World3DVisualProfile.terrainTextureWorldScale >= 0.22
    && worldModule.World3DVisualProfile.terrainAlbedoOpacity >= 0.12
    && worldModule.World3DVisualProfile.terrainAlbedoOpacity <= 0.22,
  "Generated albedo must enrich terrain without multiplying the live biome colors into mud.",
);
Check(
  worldSource.includes("ApplyMiniatureDetailTexture")
    && worldSource.includes("material.bumpMap = this.miniatureDetailTexture")
    && worldSource.includes('worldModelDetail: this.miniatureDetailStatus'),
  "ImageGen micro-detail must be applied to the live Blender miniature materials and exposed in diagnostics.",
);
Check(
  worldModule.World3DQualityProfile.dprCap === 2
    && worldModule.World3DQualityProfile.targetFps === 60
    && worldModule.World3DQualityProfile.shadowMapSize === 4096
    && worldModule.World3DQualityProfile.paperTextureSize === 2048,
  "World3D must expose one fixed highest-quality render profile.",
);
Check(
  worldModule.World3DVisualProfile.hemisphereIntensity >= 0.8
    && worldModule.World3DVisualProfile.ambientIntensity >= 0.12
    && worldModule.World3DVisualProfile.fillIntensity >= 0.32
    && worldModule.World3DVisualProfile.toneMappingExposure >= 1,
  "Visual profile must preserve readable cool shadows without washing the landscape in a global tint.",
);
Check(
  worldSource.includes("new THREE.AmbientLight")
    && worldSource.includes("World3DVisualProfile.fillIntensity")
    && worldSource.includes("const fill = new THREE.DirectionalLight")
    && !worldSource.includes("material.emissiveIntensity = 0.24"),
  "Cool fill and ambient light must lift near-black silhouettes without fake emissive materials.",
);
Check(
  worldModule.World3DVisualProfile.unitModelScale >= 0.6
    && worldModule.World3DVisualProfile.militiaModelScale >= 0.54
    && worldModule.World3DVisualProfile.blockhouseScale >= 0.68
    && worldModule.World3DVisualProfile.trafficStationScale >= 0.62,
  "Blender-authored units and structures must remain legible while fitting inside their hexes.",
);
Check(
  worldSource.includes("unitLabel.userData.labelLane = labelLane")
    && worldSource.includes("label.userData.labelLane = labelLane")
    && worldModule.World3DVisualProfile.unitLabelLaneSpacing >= 0.24,
  "Unit and structure labels must use separate deterministic lanes instead of stacking at one point.",
);
Check(
  worldSource.includes('"TerrainBoundaryInstanced"')
    && worldModule.World3DVisualProfile.controlBorderWidth <= 0.025
    && worldSource.includes("opacity: 0.045"),
  "Tactical borders must remain subordinate to the continuous landscape.",
);
Check(
  worldSource.includes('"RailSleepersInstanced"')
    && worldModule.World3DVisualProfile.railBedWidth > worldModule.World3DVisualProfile.roadWidth
    && worldModule.World3DVisualProfile.railWidth >= 0.022
    && worldModule.World3DVisualProfile.railWidth <= 0.03
    && worldModule.World3DVisualProfile.railGaugeOffset >= 0.105
    && worldSource.includes("sleeperCount"),
  "Rail sleepers, double rails, gravel bed, and warm roads must be distinguishable at a glance.",
);
Check(worldSource.includes("this.renderer.shadowMap.enabled = true"), "World3D shadows must remain permanently enabled.");
Check(
  worldSource.includes("sun.shadow.mapSize.set(World3DQualityProfile.shadowMapSize")
    && !worldSource.includes("shadowMap.enabled = false"),
  "World3D must use the fixed 4096 shadow map without a disable path.",
);
Check(
  worldSource.includes("texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()")
    && worldSource.includes("texture.minFilter = THREE.LinearMipmapLinearFilter"),
  "The full-resolution terrain texture must use maximum anisotropy and mipmapped filtering.",
);
Check(
  !worldSource.includes("runtimePaperTextureSize")
    && !worldSource.includes("context.drawImage(loadedTexture.image")
    && !worldSource.includes("sourceWidth > World3DQualityProfile"),
  "The 2048x2048 terrain texture must never be downscaled at runtime.",
);
Check(worldSource.includes("PickHex(screenX, screenY)"), "World3D must expose hex ray picking.");
Check(worldSource.includes("intersectObject(this.pickMesh"), "Hex picking must use the Three.js pick mesh.");

const layerState = worldModule.CreateWorld3DLayerState();
Check(
  ["terrain", "fog", "units", "structures", "overlay"].every((layerName) => layerState[layerName] === true),
  "All five render layers must start dirty.",
);
Check(worldSource.includes("RebuildDirtyLayers"), "World3D must rebuild only dirty layers.");
Check(worldSource.includes("if (this.dirty.terrain)"), "Terrain must have an independent dirty gate.");
Check(worldSource.includes("if (this.dirty.overlay)"), "Overlay must have an independent dirty gate.");
Check(!worldSource.includes("signature()"), "World3D must not scan a monolithic state signature every animation frame.");

Check(worldSource.includes("moveDuration"), "Unit movement interpolation must be present.");
Check(worldSource.includes("lerpVectors"), "Unit movement must interpolate transforms.");
Check(worldSource.includes("idlePhase"), "Units must have lightweight idle animation.");
Check(worldSource.includes("warningObjects"), "Sweep warnings must have an animated visual channel.");
Check(
  worldSource.includes("AddSabotageDamage")
    && !worldSource.includes("SabotageSmoke_"),
  "Disabled rail must retain bent track and broken sleepers without months of persistent smoke.",
);
Check(worldSource.includes("signalObjects"), "Flags or stations must expose signal animation.");
Check(worldSource.includes("this.reducedMotion"), "World animation must respect reduced-motion state.");
Check(worldSource.includes("group.remove(child)"), "Dirty-layer rebuilds must detach disposed children cleanly.");
Check(worldSource.includes("if (hex.visible === false) return;"), "Hidden hexes must not leak structure or sabotage visuals.");
Check(worldSource.includes("AddControlOverlays"), "Visible control zones must remain readable in the 3D situation view.");
Check(worldSource.includes("ControlOverlay_"), "Control overlays must be grouped into batched render meshes.");
Check(
  worldSource.includes('"TerrainContinuousCountyLandscape"')
    && worldSource.includes('"TaihangContinuousLimestoneRidges"')
    && worldSource.includes('"CurvedLoessTerraceEmbankments"')
    && worldSource.includes('"TaihangRidgeFootScree"')
    && worldSource.includes("GetLandscapeMacroRelief")
    && worldModule.World3DVisualProfile.terrainReliefScale >= 2.1,
  "The county must render as a continuous, deeply relieved landscape with terrain-specific organization.",
);
Check(
  worldSource.includes("ApplySeasonalTerrainPalette")
    && worldSource.includes('this.weatherMode === "winter-snow"'),
  "Tree crowns, crops, and harvest detail must respond to winter and spring weather.",
);
const winterSnowCoverageSource = ExtractFunction(worldSource, "GetWinterTerrainSnowCoverage");
const windblownSnowStripSource = ExtractFunction(worldSource, "CreateWindblownSnowStripGeometry");
Check(
  winterSnowCoverageSource.includes("leewardCoverage")
    && winterSnowCoverageSource.includes("pocketCoverage")
    && winterSnowCoverageSource.includes("brokenCoverage")
    && winterSnowCoverageSource.includes("mountainWeight * 0.18")
    && winterSnowCoverageSource.includes("0.5,"),
  "Winter terrain snow must use broken wind, pocket, visibility, and mountain coverage instead of a uniform white wash.",
);
Check(
  windblownSnowStripSource.includes("new THREE.Shape()")
    && (windblownSnowStripSource.match(/shape\.lineTo\(/gu) ?? []).length >= 8
    && windblownSnowStripSource.includes("new THREE.ShapeGeometry(shape, 3)")
    && windblownSnowStripSource.includes("geometry.rotateX(-Math.PI / 2)"),
  "Roof and ridge snow must use an irregular windblown strip geometry laid onto the landscape.",
);
Check(
  !worldSource.includes("WinterSnowDustingInstanced")
    && worldSource.includes('capMesh.name = "WinterRoofAndRidgeSnowCaps"')
    && worldSource.includes('catchMesh.name = "WinterBranchSnowCatch"'),
  "Winter must avoid paper-disc ground dusting while retaining roof, ridge, and branch snow catch.",
);
const irregularFieldSource = ExtractFunction(worldSource, "CreateIrregularFieldGeometry");
const curvedFurrowSource = ExtractFunction(worldSource, "CreateCurvedGroundStripGeometry");
Check(
  irregularFieldSource.includes("new THREE.Shape()")
    && (irregularFieldSource.match(/shape\.lineTo\(/gu) ?? []).length >= 7
    && worldSource.includes('"IrregularDryFieldPlots"')
    && curvedFurrowSource.includes("Math.sin")
    && curvedFurrowSource.includes("segmentCount = 8")
    && worldSource.includes('"CurvedFieldFurrows"'),
  "Plain and village cultivation must retain irregular field polygons and genuinely curved furrow geometry.",
);
Check(
  worldSource.includes("hex.q !== neighbor.q && hex.r !== neighbor.r")
    && worldSource.includes("inlineRailPositions"),
  "Rail geometry and the station model must avoid acute shortcut crossings.",
);
const structureModelSource = ExtractFunction(worldSource, "CreateStructureModel");
Check(
  structureModelSource.includes('modelFactory?.("Model_RailwayStation")')
    && structureModelSource.includes("railwayStation.position.z = 0.62"),
  "The imported railway station must keep its 0.62 local-Z topology alignment.",
);
Check(
  (worldSource.match(/addScaledVector\(approach\.normalize\(\), 0\.54\)/gu) ?? []).length === 2,
  "Road approaches must stop 0.54 world units short at either end of a station connection.",
);
Check(
  worldSource.includes("railDamaged: new THREE.MeshStandardMaterial({ color: 0x574842")
    && !worldSource.includes("railDamaged: new THREE.MeshStandardMaterial({ color: 0xff"),
  "Disabled rail must use the locked soot-brown 0x574842 material rather than a bright warning red.",
);
Check(
  worldSource.includes("const enemyCountByHex = new Map()")
    && worldSource.includes("const enemySeenByHex = new Map()")
    && worldSource.includes('enemyCount > 1 ? `敌×${enemyCount}` : "敌"')
    && worldSource.includes("enemyIndex === 0")
    && worldSource.includes(": false;"),
  "Multiple enemies in one hex must collapse into one readable 敌×N label.",
);

assert.equal(worldModule.GetWorld3DDpr(390, 3), 2, "Small viewports must retain the fixed DPR 2 cap.");
assert.equal(worldModule.GetWorld3DDpr(1280, 3), 2, "Large viewports must use the same fixed DPR 2 cap.");
assert.equal(worldModule.GetWorld3DDpr(390, 1.5), 2, "The single highest-quality profile must force DPR 2 even on DPR 1.5 displays.");
assert.ok(worldModule.GetTerrainHeight({ q: 2, r: 3, terrain: "Mountain" })
  > worldModule.GetTerrainHeight({ q: 2, r: 3, terrain: "Plain" }), "Mountain relief must exceed plain relief.");
assertionCount += 4;

Check(!/narrowDpr|narrowWidth|narrowTarget|desktopDpr|desktopTarget|reducedMotionTarget/iu.test(worldSource),
  "World3D must not retain viewport, device, or reduced-motion quality tiers.");
Check(
  worldSource.includes("const targetFramesPerSecond = GetTargetFrameRate();")
    && worldSource.includes("return World3DQualityProfile.targetFps;"),
  "Every active render path must target the same fixed 60 FPS.",
);
Check(
  worldSource.includes("this.reducedMotion ? 0 : World3DQualityProfile.movementDuration")
    && worldSource.includes("const hasAmbientMotion = !this.reducedMotion")
    && !worldSource.includes("GetTargetFrameRate(GetQualityViewportWidth"),
  "Reduced motion may suppress movement only, never rendering quality or frame target.",
);

const novemberWeather = worldModule.GetWorld3DWeather(3);
Check(
  novemberWeather.year === 1941
    && novemberWeather.month === 11
    && novemberWeather.mode === "winter-dry"
    && novemberWeather.particleCount === 0,
  "Turn 3 must resolve to dry-cold November 1941 weather without snow particles.",
);
const decemberWeather = worldModule.GetWorld3DWeather(4);
Check(
  decemberWeather.year === 1941
    && decemberWeather.month === 12
    && decemberWeather.mode === "winter-snow"
    && decemberWeather.particleCount === 44,
  "Turn 4 must resolve to restrained December 1941 winter snow with exactly 44 particles.",
);
Check(
  worldModule.GetWorld3DWeather(1).mode === "clear"
    && worldModule.GetWorld3DWeather(7).mode === "spring-dust",
  "Seasonal atmosphere must use clear September weather and restrained spring dust.",
);
Check(
  (worldSource.match(/new THREE\.Points\(/gu) ?? []).length === 2
    && worldModule.World3DVisualProfile.weatherMaximumPoints <= 128,
  "Weather and transient combat smoke must each stay within one batched Points draw call.",
);
Check(
  worldSource.includes("worldWeather: this.weatherMode")
    && worldSource.includes("this.UpdateWeather();"),
  "Runtime diagnostics and state synchronization must expose the active seasonal weather.",
);
Check(
  worldSource.includes('this.weatherMode === "winter-snow"')
    && worldSource.includes("if (!this.reducedMotion) {")
    && !worldSource.includes("if (this.reducedMotion) this.weatherParticles = null"),
  "Reduced motion must freeze weather drift while retaining its visual layer and fog.",
);

Check(
  worldModule.World3DActionEffectProfile.supportedActionIds.includes("ambush")
    && worldModule.World3DActionEffectProfile.supportedActionIds.includes("sabotage")
    && worldModule.World3DActionEffectProfile.maximumConcurrentEffects <= 4,
  "Transient action effects must support ambush and sabotage with a strict concurrency budget.",
);
Check(
  [
    worldModule.World3DActionEffectProfile.ambushDuration,
    worldModule.World3DActionEffectProfile.sabotageDuration,
  ].every((duration) => duration >= 1.7 && duration <= 2.1),
  "Every action presentation must stay within a responsive 1.7-2.1 second window.",
);
Check(
  worldSource.includes("PlayActionEffects(effects)")
    && worldSource.includes("Array.isArray(effects) ? effects : [effects]")
    && worldSource.includes("effectData?.unitId"),
  "The public World3D action API must accept one effect or an array and consume the game report unit field.",
);
const ambushActionStart = worldSource.indexOf("CreateAmbushActionEffect(effectData");
const sabotageActionStart = worldSource.indexOf("CreateSabotageActionEffect(effectData");
const ambushActionSource = worldSource.slice(ambushActionStart, sabotageActionStart);
Check(
  worldSource.includes('muzzleBatch.name = "AmbushDirectionalMuzzleFlashesInstanced"')
    && worldSource.includes('tracerBatch.name = "AmbushShortTracerBurstsInstanced"')
    && worldSource.includes('"AmbushContactDust"')
    && worldSource.includes('debrisBatch.name = "AmbushImpactEarthFragmentsInstanced"')
    && worldSource.includes("const tracerCount = 3")
    && worldSource.includes("const contactRange = Clamp(measuredRange, 0.95, 1.62)")
    && worldSource.includes('actionId !== "ambush"')
    && worldSource.includes("this.state.enemies ?? []")
    && !worldSource.includes('"AmbushContactPulse"')
    && !worldSource.includes('"AmbushFireball"')
    && !worldSource.includes('"AmbushImpactRing"')
    && ambushActionSource.includes("pulseMarker: null")
    && !ambushActionSource.includes("new THREE.RingGeometry")
    && !ambushActionSource.includes("new THREE.SphereGeometry"),
  "Ambush feedback must use directional muzzle flashes, short tracers, contact dust, and earth fragments without a fireball or impact ring.",
);
Check(
  worldSource.includes("sourceHexId")
    && worldSource.includes("GetActionEffectTargetPosition(actionId, targetHex)")
    && worldSource.includes("visual.userData?.targetPosition?.clone() ?? visual.position.clone()"),
  "Ambush feedback must preserve the acting unit origin and aim at the visible enemy formation rather than an anonymous tile center.",
);
Check(
  worldSource.includes('batch.name = `${actionId === "ambush" ? "AmbushContactDust" : "SabotageActionSmoke"}SoftParticles`')
    && worldSource.includes('sparkBatch.name = "SabotageWarmSparksInstanced"')
    && worldSource.includes('debrisBatch.name = "SabotageRailAndBallastFragmentsInstanced"')
    && worldSource.includes("ambushSmokeCount: 18")
    && worldSource.includes("sabotageSmokeCount: 20")
    && !worldSource.includes('"SabotageTransientPulse"')
    && !worldSource.includes('"SabotageFireball"')
    && !worldSource.includes('"SabotageImpactRing"'),
  "Sabotage feedback must use brief action smoke, warm sparks, and rail fragments without a fireball, impact ring, or durable smoke marker.",
);
const sabotageActionSource = worldSource.slice(
  sabotageActionStart,
  worldSource.indexOf("ApplyStaticActionEffectPose(effect)", sabotageActionStart),
);
Check(
  sabotageActionSource.includes("pulseMarker: null")
    && sabotageActionSource.includes('blastCore.name = "SabotageBriefGroundFlash"')
    && sabotageActionSource.includes("new THREE.CircleGeometry(0.34, 9)")
    && sabotageActionSource.includes("blastDuration: 0.28")
    && !sabotageActionSource.includes("new THREE.RingGeometry")
    && !sabotageActionSource.includes("new THREE.SphereGeometry")
    && !sabotageActionSource.includes("railDisabledTurns")
    && !sabotageActionSource.includes("AddSabotageDamage"),
  "The sabotage action animation must contain no fireball or impact ring and must never create or mutate long-lived disabled-rail smoke.",
);
Check(
  worldSource.includes("startDamageGapInset")
    && worldSource.includes('IsFeature(hex, "RailStation") ? 0.68 : 0.42')
    && worldSource.includes("SabotageScorchedTrackBed_")
    && worldSource.includes("SabotageTwistedRail_")
    && worldSource.includes("SabotageBrokenSleeper_")
    && worldSource.includes("SabotageScatteredBallast_"),
  "Disabled railway must retain a readable physical gap, scorched ballast, twisted rails, and displaced sleepers after transient smoke clears.",
);
Check(
  worldSource.includes("effect.elapsed >= effect.duration")
    && worldSource.includes("this.RemoveActionEffect(effect, false)")
    && worldSource.includes("DisposeObject(effect?.root, this.sharedGeometries, this.sharedMaterials)"),
  "Expired action effects must detach and dispose every transient geometry and material automatically.",
);
Check(
  worldSource.includes("ApplyStaticActionEffectPose(effect)")
    && worldSource.includes("} else if (!this.reducedMotion) {")
    && worldSource.includes("this.UpdateActionEffectMotion(effect);"),
  "Reduced motion must retain the complete static action composition while suppressing transform animation.",
);
Check(
  worldSource.includes("worldActionEffectCount: String(this.activeActionEffects.length)")
    && worldSource.includes("activeCount: world?.activeActionEffects.length ?? 0")
    && worldSource.includes("actionEffects: MeasureObjectGroup(this.actionEffectGroup)"),
  "Canvas and read-only diagnostics must expose transient action active and object counts.",
);
Check(
  worldSource.includes('this.actionEffectGroup.name = "TransientActionEffects"')
    && worldSource.includes("this.scene.add(")
    && worldSource.includes("this.actionEffectGroup,"),
  "Action animations must use an independent scene layer that survives ordinary structure rebuilds.",
);
Check(
  !/(blood|gore|corpse)/iu.test(sabotageActionSource)
    && !/(blood|gore|corpse)/iu.test(worldSource.slice(
      worldSource.indexOf("CreateAmbushActionEffect(effectData"),
      worldSource.indexOf("CreateSabotageActionEffect(effectData"),
    )),
  "Action presentation must remain non-graphic and appropriate to the historical map style.",
);

Check(gameSource.includes("CreateEnemyRearWorld3D"), "Game must import and create the Three.js world.");
Check(gameSource.includes("activeWorld.SetState"), "Game state must be synchronized into the Three.js world.");
Check(gameSource.includes("world3D.PickHex"), "Game selection must delegate to Three.js picking.");
Check(gameSource.includes("GetReachableHexIds"), "Reachable movement overlay must be synchronized.");
Check(gameSource.includes("prefers-reduced-motion: reduce"), "Game must pass reduced-motion preference into the world.");
Check(
  gameSource.includes("* scale * mapCamera.zoom"),
  "Center-on-hex must preserve its target at every zoom level.",
);

const cacheIdentity = worldModule.World3DCacheIdentity;
Check(cacheIdentity === "EnemyRear1941_World3D_20260730_P", "World cache identity must match the release marker.");
Check(gameSource.includes("World3DCacheIdentity"), "Game canvas must expose the same World3D cache identity.");
Check(indexSource.includes("Style_Game.css?v=20260730p"), "Stylesheet cache version must match the World3D release.");
Check(indexSource.includes("Script_Game.mjs?v=20260730p"), "Game cache version must match the World3D release.");
Check(gameSource.includes("Script_World3D.mjs?v=20260730p"), "World module cache version must match the page release.");
Check(indexSource.includes('"three": "../../taihang/vendor/three/build/three.module.mjs"'), "Import map must resolve GLTFLoader's local Three.js dependency.");

Check(indexSource.includes("可操作三维六角格战术地图"), "Canvas accessibility label must describe the 3D map without engine jargon.");
Check(indexSource.includes("worldModeBadge"), "The live renderer-mode badge must exist.");
Check(!indexSource.includes("Three.js 可操作"), "Player-facing map copy must not expose engine terminology.");
Check(styleSource.includes("#mapCanvas[data-renderer=\"three\"]"), "Three.js canvas must have production styling.");
Check(styleSource.includes(".mapAtmosphere"), "The map must have a non-interactive atmosphere layer.");
Check(styleSource.includes("@media (prefers-reduced-motion: reduce)"), "CSS must preserve reduced-motion behavior.");

Check(
  !/Styled_Screenshot|Texture_UiReference|assets\/ui\/reference/i.test(worldSource),
  "World3D must never load audit/reference screenshots at runtime.",
);
Check(worldSource.includes("renderer.info"), "Read-only diagnostics must expose renderer.info.");
Check(worldSource.includes("__EnemyRearWorld3D"), "Read-only World3D diagnostics must be published.");
Check(worldSource.includes("writable: false"), "Published World3D diagnostics must be read-only.");
Check(
  worldSource.includes("const worldDiagnosticsRouter = Object.seal({ current: null })")
    && worldSource.includes("worldDiagnosticsRouter.current = this"),
  "World reconstruction must redirect one stable diagnostics proxy to the newest instance.",
);
Check(
  worldSource.includes("get active() { return Boolean(worldDiagnosticsRouter.current); }")
    && worldSource.includes("get frameCount() { return worldDiagnosticsRouter.current?.frameCount ?? 0; }"),
  "Diagnostics getters must resolve the active world at read time instead of closing over the first instance.",
);
Check(
  worldSource.includes("if (worldDiagnosticsRouter.current === this) worldDiagnosticsRouter.current = null;")
    && !worldSource.includes("const world = this;"),
  "Disposing an old compact-layout world must not clear or retain a newly rebuilt diagnostics target.",
);

console.log(`EnemyRear1941 World3D smoke test passed: ${assertionCount} assertions.`);
