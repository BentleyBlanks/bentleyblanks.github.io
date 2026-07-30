import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const worldSource = readFileSync(path.join(currentDirectory, "Script_World.mjs"), "utf8");
const gameSource = readFileSync(path.join(currentDirectory, "Script_Game.mjs"), "utf8");
const rulesSource = readFileSync(path.join(currentDirectory, "Script_Rules.mjs"), "utf8");
const agentGuideSource = readFileSync(path.join(currentDirectory, "AGENTS.md"), "utf8");

function CountMatches(source, expression) {
  return [...source.matchAll(expression)].length;
}

function SliceFunction(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} must remain available for performance verification`);
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}(`, start + 1) : source.length;
  assert.notEqual(end, -1, `${nextFunctionName} must follow ${functionName}`);
  return source.slice(start, end);
}

function TestSimulationAndFramePacingContracts() {
  assert.match(rulesSource, /fixedStep:\s*1\s*\/\s*30/, "simulation must retain its fixed 30 Hz step");
  assert.match(rulesSource, /aiStep:\s*(?:1\s*\/\s*10|0\.1)/, "enemy AI must retain its fixed 10 Hz step");

  const frameSource = SliceFunction(gameSource, "Frame", "Boot");
  assert.match(
    frameSource,
    /renderAccumulator\s*>=\s*1\s*\/\s*12/,
    "a fully static paused view must retain its 12 fps idle ceiling",
  );
  assert.match(frameSource, /const hidden = document\.hidden;/, "frame pacing must observe document visibility");
  assert.match(
    frameSource,
    /if\s*\(!hidden\)\s*\{/,
    "hidden tabs must skip simulation, HUD, and rendering work",
  );
  assert.equal(
    CountMatches(worldSource, /renderer\.render\s*\(\s*scene\s*,\s*camera\s*\)/g),
    1,
    "the world must retain one renderer submission site per rendered frame",
  );
}

function TestRendererQualityContracts() {
  assert.match(
    worldSource,
    /antialias:\s*options\.quality\s*!==\s*"low"/,
    "low quality must disable multisample antialiasing",
  );
  assert.match(
    worldSource,
    /renderer\.shadowMap\.enabled\s*=\s*options\.quality\s*!==\s*"low"/,
    "low quality must disable shadow-map rendering",
  );
  assert.match(
    worldSource,
    /const pixelRatioLimit\s*=\s*options\.quality\s*===\s*"low"\s*\?\s*1\s*:\s*options\.quality\s*===\s*"ultra"\s*\?\s*1\.5\s*:\s*1\.25;/,
    "pixel-ratio caps must remain 1 low, 1.25 normal/high, and 1.5 ultra",
  );
  assert.match(
    worldSource,
    /renderer\.setPixelRatio\s*\(\s*Math\.min\s*\(\s*window\.devicePixelRatio\s*\|\|\s*1\s*,\s*pixelRatioLimit\s*\)\s*\)/,
    "device pixel ratio must remain clamped by the selected quality cap",
  );
}

function TestGeometryAndAssetLifetimeContracts() {
  assert.match(
    worldSource,
    /const bakedObstacles = BakeMeshRoots\(staticObstacleRoots\);/,
    "authored static obstacles must stay baked into merged geometry",
  );
  assert.match(
    worldSource,
    /mergeGeometries\(geometries,\s*false\)/,
    "static mesh baking must retain its geometry merge",
  );
  assert.match(
    worldSource,
    /if \(artLoadPromise\) return artLoadPromise;/,
    "GLTF loading must remain memoized across callers",
  );

  const effectUpdateSource = SliceFunction(worldSource, "UpdateEffects", "Sync");
  assert.match(
    effectUpdateSource,
    /effect\.mesh\.geometry\?\.dispose\?\.\(\)/,
    "expired effects must release their geometry",
  );
  assert.match(
    effectUpdateSource,
    /effect\.mesh\.material\?\.dispose\?\.\(\)/,
    "expired effects must release their material",
  );

  const disposeSource = SliceFunction(worldSource, "Dispose");
  assert.match(disposeSource, /geometries\.forEach\(\(geometry\) => geometry\.dispose\?\.\(\)\)/);
  assert.match(disposeSource, /materials\.forEach\(\(material\) => material\.dispose\?\.\(\)\)/);
  assert.match(disposeSource, /renderer\.dispose\(\)/, "world disposal must release the renderer");
  assert.match(disposeSource, /groundTexture\.dispose\(\)/, "world disposal must release the generated terrain texture");
}

function TestPickingAndInstrumentationContracts() {
  assert.match(
    gameSource,
    /let pendingHoverPointer = null;/,
    "desktop hover picking must retain one coalesced pending sample",
  );
  const pointerMoveSource = SliceFunction(gameSource, "HandlePointerMove", "HandlePointerLeave");
  assert.doesNotMatch(
    pointerMoveSource,
    /world\?\.Pick\(/,
    "pointermove events must not execute desktop hover raycasts directly",
  );
  assert.match(
    pointerMoveSource,
    /pendingHoverPointer\s*=\s*[\s\S]*\{ clientX: event\.clientX, clientY: event\.clientY \}/,
    "pointermove must coalesce the latest desktop hover coordinates",
  );
  assert.match(
    pointerMoveSource,
    /event\.pointerType === "touch" \|\| pointerDown[\s\S]*world\?\.ScreenToGround\(event\.clientX, event\.clientY\)/,
    "touch and active desktop drags must retain event-precise ground coordinates",
  );
  assert.match(
    pointerMoveSource,
    /RequestInteractiveRender\(0\.2\)/,
    "coalesced pointer movement must retain its interactive render burst",
  );

  const flushHoverSource = SliceFunction(gameSource, "FlushPendingHoverPick", "HandlePointerMove");
  assert.match(flushHoverSource, /const sample = pendingHoverPointer;/);
  assert.match(flushHoverSource, /pendingHoverPointer = null;/, "each frame must consume at most one hover sample");
  assert.equal(
    CountMatches(flushHoverSource, /world\?\.Pick\(sample\.clientX,\s*sample\.clientY\)/g),
    1,
    "the hover flush must perform exactly one bounded pick",
  );
  const frameSource = SliceFunction(gameSource, "Frame", "Boot");
  assert.equal(
    CountMatches(frameSource, /FlushPendingHoverPick\(\);/g),
    1,
    "the animation frame must flush hover picking at most once",
  );
  const pointerLeaveSource = SliceFunction(gameSource, "HandlePointerLeave", "HandlePointerUp");
  assert.match(
    pointerLeaveSource,
    /pendingHoverPointer = null;[\s\S]*view\.currentPointerWorld = null;[\s\S]*view\.hoverEnemyId = null;/,
    "pointerleave must cancel stale hover work, ground coordinates, and highlights",
  );
  assert.match(pointerLeaveSource, /RequestInteractiveRender\(\)/, "pointerleave cleanup must request a render burst");

  const pickSource = SliceFunction(worldSource, "Pick", "FocusPosition");
  const screenToGroundSource = SliceFunction(worldSource, "ScreenToGround", "Pick");
  const groundProjectionSource = SliceFunction(worldSource, "ProjectCurrentRayToGround", "ScreenToGround");
  assert.equal(
    CountMatches(pickSource, /SetPointer\(clientX,\s*clientY\)/g),
    1,
    "picking must prepare its camera ray exactly once",
  );
  assert.doesNotMatch(
    pickSource,
    /ScreenToGround\(/,
    "picking must not reset its prepared ray through ScreenToGround",
  );
  assert.equal(
    CountMatches(pickSource, /ProjectCurrentRayToGround\(\)/g),
    1,
    "picking must reuse its prepared ray for ground projection",
  );
  assert.match(screenToGroundSource, /SetPointer\(clientX,\s*clientY\)/);
  assert.match(screenToGroundSource, /return ProjectCurrentRayToGround\(\);/);
  assert.doesNotMatch(
    groundProjectionSource,
    /SetPointer\(/,
    "the current-ray projection helper must not rebuild the ray",
  );
  assert.match(
    pickSource,
    /\.intersectObjects\(pickObjects,\s*false\)/,
    "hover picking must remain a bounded non-recursive query",
  );
  assert.doesNotMatch(
    pickSource,
    /\.intersectObjects\(scene\.children|\.intersectObject\(scene/,
    "picking must not regress to traversing the full scene",
  );

  const statsSource = SliceFunction(worldSource, "GetStats", "HasActiveEffects");
  assert.match(
    worldSource,
    /const drawingBufferSize = new THREE\.Vector2\(\);/,
    "renderer stats must retain a drawing-buffer scratch vector",
  );
  assert.doesNotMatch(statsSource, /new THREE\.Vector2\(\)/, "renderer stats must not allocate a Vector2 per sample");
  assert.match(
    statsSource,
    /renderer\.getDrawingBufferSize\(drawingBufferSize\)\.toArray\(\)/,
    "renderer stats must reuse the drawing-buffer scratch vector",
  );
  for (const field of [
    "calls",
    "triangles",
    "points",
    "lines",
    "geometries",
    "textures",
    "pixelRatio",
    "drawingBuffer",
  ]) {
    assert.match(statsSource, new RegExp(`\\b${field}:`), `renderer debug stats must retain ${field}`);
  }

  const syncSource = SliceFunction(worldSource, "Sync", "UpdateCamera");
  assert.match(
    worldSource,
    /const activeDynamicBlockerIds = new Set\(\);/,
    "dynamic blocker synchronization must retain one scratch Set",
  );
  assert.doesNotMatch(syncSource, /new Set\(\)/, "world synchronization must not allocate a blocker Set per frame");
  assert.match(syncSource, /activeDynamicBlockerIds\.clear\(\);/, "world synchronization must clear and reuse its blocker Set");
}

function TestDocumentedRendererBudgets() {
  assert.match(
    agentGuideSource,
    /below 100 renderer calls on desktop and 90 on the mobile quality profile/,
    "the desktop <100 and mobile <90 renderer-call budgets must remain documented",
  );
}

function CollectNonBlockingAuditWarnings() {
  const warnings = [];
  const transientEffectSource = [
    SliceFunction(worldSource, "SpawnRing", "SpawnTracer"),
    SliceFunction(worldSource, "SpawnTracer", "SpawnImpact"),
    SliceFunction(worldSource, "SpawnImpact", "SpawnExplosion"),
    SliceFunction(worldSource, "SpawnExplosion", "UpdateEffects"),
  ].join("\n");
  if (
    /new THREE\.(?:RingGeometry|BufferGeometry)/.test(transientEffectSource) &&
    /new THREE\.(?:LineBasicMaterial|PointsMaterial)/.test(transientEffectSource)
  ) {
    warnings.push(
      "Combat bursts allocate fresh effect geometry and materials. Pool transient effects after profiling confirms GC spikes.",
    );
  }
  return warnings;
}

TestSimulationAndFramePacingContracts();
TestRendererQualityContracts();
TestGeometryAndAssetLifetimeContracts();
TestPickingAndInstrumentationContracts();
TestDocumentedRendererBudgets();

const warnings = CollectNonBlockingAuditWarnings();
console.log("MountainEmber1941 performance contracts passed.");
for (const warning of warnings) console.warn(`PERFORMANCE AUDIT: ${warning}`);
