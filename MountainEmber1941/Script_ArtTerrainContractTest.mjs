import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GetOperationLayout } from "./Data_Operations.mjs";
import { GetTerrainElevation } from "./Script_Rules.mjs";
import { GetCanonicalTerrainHeight } from "./Script_CanonicalTerrain.mjs";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const modelRoot = join(projectRoot, "Models");
const terrainContract = "Script_CanonicalTerrain.mjs|Data_Operations.mjs|Script_Rules.GetTerrainElevation";

const environmentDefinitions = [
  {
    operationId: "infiltrateSignalStation",
    fileName: "Model_EnvironmentCounty.glb",
    criticalBuildings: [
      { name: "SwitchHouse", x: 37, z: 7, width: 14, depth: 10 },
      { name: "RecordsRoom", x: 51, z: 20, width: 12, depth: 8 },
    ],
  },
  {
    operationId: "nightRendezvous",
    fileName: "Model_EnvironmentNorthVillage.glb",
    criticalBuildings: [
      { name: "ContactHouse", x: -25, z: 22, width: 13, depth: 10 },
      { name: "EastHouse", x: 31, z: 22, width: 14, depth: 9 },
      { name: "SouthHouse", x: -17, z: -22, width: 14, depth: 10 },
      { name: "AncestralHall", x: 10, z: -22, width: 18, depth: 11 },
    ],
  },
  {
    operationId: "quarryInterdiction",
    fileName: "Model_EnvironmentQuarrySlope.glb",
    criticalBuildings: [
      { name: "ForemanOffice", x: 14, z: 12, width: 13, depth: 8 },
      { name: "PowderShed", x: 28, z: -25, width: 13, depth: 9 },
      { name: "UpperBlockhouse", x: 6, z: 35, width: 12, depth: 9 },
    ],
  },
];

function ReadGlb(filePath) {
  const bytes = readFileSync(filePath);
  assert.equal(bytes.toString("ascii", 0, 4), "glTF", `${filePath} must be a parseable GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const binaryHeaderOffset = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeaderOffset);
  const binary = bytes.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength);
  return { json, binary };
}

function ReadWorldPositions(glb) {
  const positions = [];
  for (const node of glb.json.nodes ?? []) {
    if (!Number.isInteger(node.mesh)) continue;
    const translation = node.translation ?? [0, 0, 0];
    for (const primitive of glb.json.meshes[node.mesh]?.primitives ?? []) {
      const accessor = glb.json.accessors[primitive.attributes?.POSITION];
      assert.equal(accessor?.componentType, 5126, "environment POSITION accessors must use float32");
      assert.equal(accessor?.type, "VEC3", "environment POSITION accessors must be VEC3");
      const view = glb.json.bufferViews[accessor.bufferView];
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stride = view.byteStride ?? 12;
      for (let index = 0; index < accessor.count; index += 1) {
        const cursor = offset + index * stride;
        positions.push({
          x: glb.binary.readFloatLE(cursor) + translation[0],
          y: glb.binary.readFloatLE(cursor + 4) + translation[1],
          z: glb.binary.readFloatLE(cursor + 8) + translation[2],
        });
      }
    }
  }
  return positions;
}

function AssertBuildingTouchesCanonicalSurface(positions, building, expectedHeight) {
  const wallEdgeX = building.x - building.width * 0.5;
  const wallVertices = positions.filter(
    (position) =>
      Math.abs(position.x - wallEdgeX) < 0.55 &&
      Math.abs(position.z - building.z) <= building.depth * 0.5 + 0.65,
  );
  assert.ok(wallVertices.length > 100, `${building.name} wall geometry must exist near its authored anchor`);
  const lowestVertex = Math.min(...wallVertices.map((position) => position.y));
  assert.ok(
    Math.abs(lowestVertex - expectedHeight) < 0.002,
    `${building.name} base ${lowestVertex.toFixed(4)} must touch canonical terrain ${expectedHeight.toFixed(4)}`,
  );
}

for (const environment of environmentDefinitions) {
  const operation = GetOperationLayout(environment.operationId);
  assert.ok(operation, `${environment.operationId} operation layout must exist`);
  const glb = ReadGlb(join(modelRoot, environment.fileName));
  assert.equal(glb.json.meshes?.length, 1, `${environment.fileName} must remain one mesh`);
  const environmentNode = (glb.json.nodes ?? []).find((node) => Number.isInteger(node.mesh));
  assert.equal(environmentNode?.extras?.terrainOperationId, environment.operationId);
  assert.equal(environmentNode?.extras?.canonicalTerrainAnchored, 1);
  assert.equal(environmentNode?.extras?.canonicalTerrainContract, terrainContract);
  const exportedAnchors = JSON.parse(environmentNode.extras.canonicalTerrainAnchorSamples);
  assert.equal(
    environmentNode.extras.canonicalTerrainAnchorCount,
    Object.keys(exportedAnchors).length,
    `${environment.fileName} anchor count must match exported samples`,
  );
  assert.ok(Object.keys(exportedAnchors).length >= 10, `${environment.fileName} must export useful anchor evidence`);

  const positions = ReadWorldPositions(glb);
  assert.ok(positions.length > 1000, `${environment.fileName} must contain visible geometry`);
  for (const building of environment.criticalBuildings) {
    const canonicalHeight = GetCanonicalTerrainHeight(environment.operationId, building.x, building.z);
    assert.equal(
      canonicalHeight,
      GetTerrainElevation(building, operation),
      `${building.name} helper height must equal Script_Rules`,
    );
    assert.deepEqual(exportedAnchors[building.name], {
      x: building.x,
      z: building.z,
      height: canonicalHeight,
    });
    AssertBuildingTouchesCanonicalSurface(positions, building, canonicalHeight);
  }
}

const builderText = readFileSync(join(projectRoot, "Tools", "Script_BuildBlenderAssets.py"), "utf8");
assert.match(builderText, /TerrainHelperPath = os\.path\.join\(ProjectRoot, "Script_CanonicalTerrain\.mjs"\)/);
assert.match(builderText, /canonicalTerrainAnchored/);
assert.match(builderText, /WorldLocation\(worldX, worldZ, height=0\.0, terrainAnchor=None\)/);
assert.doesNotMatch(builderText, /bentleyblanks_Codex_/i, "builder must not hardcode a temporary worktree path");

const cssText = readFileSync(join(projectRoot, "Style_Game.css"), "utf8");
assert.match(
  cssText,
  /\.awarenessReadout b,\s*\.concealmentReadout strong\s*\{\s*font-size: max\(10px, calc\(10px \* var\(--uiTextScale\)\)\)/,
  "compact tactical readout text must retain a 10px minimum",
);

assert.ok(
  statSync(join(modelRoot, "Model_SourceMountainEmberArtPass.blend")).size > 1_000_000,
  "full source blend must be regenerated and nontrivial",
);

console.log("MountainEmber1941 canonical terrain art contract passed.");
