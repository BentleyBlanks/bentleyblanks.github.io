import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const requiredAssets = Object.freeze([
  "Model_WorkTeam",
  "Model_Guerrilla",
  "Model_MainForce",
  "Model_Militia",
  "Model_Courier",
  "Model_EnemyPatrol",
  "Model_VillageHouse",
  "Model_EnemyBlockhouse",
  "Model_TrafficStation",
]);

const assetPath = join(dirname(fileURLToPath(import.meta.url)), "Model_EnemyRearMiniatures.glb");
const glbMagic = 0x46546c67;
const jsonChunkType = 0x4e4f534a;
const triangleMode = 4;

function ParseGlb(buffer) {
  assert.ok(buffer.length >= 20, "GLB must include a header and JSON chunk");
  assert.equal(buffer.readUInt32LE(0), glbMagic, "GLB magic header mismatch");
  assert.equal(buffer.readUInt32LE(4), 2, "Model pack must use glTF 2.0");
  assert.equal(buffer.readUInt32LE(8), buffer.length, "GLB header length must match file size");
  let offset = 12;
  let jsonDocument = null;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    assert.ok(chunkEnd <= buffer.length, "GLB chunk exceeds file bounds");
    if (chunkType === jsonChunkType) {
      assert.equal(jsonDocument, null, "GLB must contain one JSON chunk");
      jsonDocument = JSON.parse(buffer.subarray(chunkStart, chunkEnd).toString("utf8").trim());
    }
    offset = chunkEnd;
  }
  assert.ok(jsonDocument, "GLB JSON chunk is required");
  return jsonDocument;
}

function IdentityMatrix() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function NodeMatrix(node) {
  if (node.matrix) return [...node.matrix];
  const [translationX, translationY, translationZ] = node.translation ?? [0, 0, 0];
  const [rotationX, rotationY, rotationZ, rotationW] = node.rotation ?? [0, 0, 0, 1];
  const [scaleX, scaleY, scaleZ] = node.scale ?? [1, 1, 1];
  const doubledX = rotationX + rotationX;
  const doubledY = rotationY + rotationY;
  const doubledZ = rotationZ + rotationZ;
  const xx = rotationX * doubledX;
  const xy = rotationX * doubledY;
  const xz = rotationX * doubledZ;
  const yy = rotationY * doubledY;
  const yz = rotationY * doubledZ;
  const zz = rotationZ * doubledZ;
  const wx = rotationW * doubledX;
  const wy = rotationW * doubledY;
  const wz = rotationW * doubledZ;
  return [
    (1 - yy - zz) * scaleX,
    (xy + wz) * scaleX,
    (xz - wy) * scaleX,
    0,
    (xy - wz) * scaleY,
    (1 - xx - zz) * scaleY,
    (yz + wx) * scaleY,
    0,
    (xz + wy) * scaleZ,
    (yz - wx) * scaleZ,
    (1 - xx - yy) * scaleZ,
    0,
    translationX,
    translationY,
    translationZ,
    1,
  ];
}

function MultiplyMatrices(left, right) {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[column * 4 + row] += left[index * 4 + row] * right[column * 4 + index];
      }
    }
  }
  return result;
}

function TransformPoint(matrix, point) {
  const [pointX, pointY, pointZ] = point;
  return [
    matrix[0] * pointX + matrix[4] * pointY + matrix[8] * pointZ + matrix[12],
    matrix[1] * pointX + matrix[5] * pointY + matrix[9] * pointZ + matrix[13],
    matrix[2] * pointX + matrix[6] * pointY + matrix[10] * pointZ + matrix[14],
  ];
}

function AccessorCorners(accessor) {
  assert.equal(accessor.type, "VEC3", "POSITION accessors must be VEC3");
  assert.equal(accessor.min?.length, 3, "POSITION accessors require minimum bounds");
  assert.equal(accessor.max?.length, 3, "POSITION accessors require maximum bounds");
  const corners = [];
  for (const pointX of [accessor.min[0], accessor.max[0]]) {
    for (const pointY of [accessor.min[1], accessor.max[1]]) {
      for (const pointZ of [accessor.min[2], accessor.max[2]]) {
        corners.push([pointX, pointY, pointZ]);
      }
    }
  }
  return corners;
}

function PrimitiveTriangleCount(document, primitive) {
  assert.equal(primitive.mode ?? triangleMode, triangleMode, "Every primitive must use triangle topology");
  if (primitive.indices !== undefined) {
    return document.accessors[primitive.indices].count / 3;
  }
  const positionAccessor = document.accessors[primitive.attributes.POSITION];
  return positionAccessor.count / 3;
}

function InspectAsset(document, rootNodeIndex) {
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  let meshCount = 0;
  let primitiveCount = 0;
  let triangleCount = 0;
  const materialIndexes = new Set();
  const visitedNodes = new Set();

  function VisitNode(nodeIndex, parentMatrix) {
    assert.ok(!visitedNodes.has(nodeIndex), "Asset hierarchy must not contain cycles or repeated nodes");
    visitedNodes.add(nodeIndex);
    const node = document.nodes[nodeIndex];
    const worldMatrix = MultiplyMatrices(parentMatrix, NodeMatrix(node));
    if (node.mesh !== undefined) {
      meshCount += 1;
      const mesh = document.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        primitiveCount += 1;
        assert.notEqual(primitive.attributes.COLOR_0, undefined, "Optimized meshes must retain flat palette colors in COLOR_0");
        if (primitive.material !== undefined) materialIndexes.add(primitive.material);
        triangleCount += PrimitiveTriangleCount(document, primitive);
        const positionAccessor = document.accessors[primitive.attributes.POSITION];
        for (const corner of AccessorCorners(positionAccessor)) {
          const transformedPoint = TransformPoint(worldMatrix, corner);
          for (let axis = 0; axis < 3; axis += 1) {
            bounds.min[axis] = Math.min(bounds.min[axis], transformedPoint[axis]);
            bounds.max[axis] = Math.max(bounds.max[axis], transformedPoint[axis]);
          }
        }
      }
    }
    for (const childNodeIndex of node.children ?? []) VisitNode(childNodeIndex, worldMatrix);
  }

  VisitNode(rootNodeIndex, IdentityMatrix());
  assert.ok(meshCount > 0, "Every asset root must own visible mesh descendants");
  const size = bounds.max.map((maximum, axis) => maximum - bounds.min[axis]);
  return {
    meshCount,
    primitiveCount,
    triangleCount,
    materialCount: materialIndexes.size,
    bounds,
    size,
    nodeCount: visitedNodes.size,
  };
}

function HasTextureReference(value, key = "") {
  if (value === null || value === undefined) return false;
  if (/texture$/iu.test(key)) return true;
  if (Array.isArray(value)) return value.some((item) => HasTextureReference(item));
  if (typeof value === "object") {
    return Object.entries(value).some(([childKey, childValue]) => HasTextureReference(childValue, childKey));
  }
  return false;
}

const fileBuffer = readFileSync(assetPath);
const document = ParseGlb(fileBuffer);
const fileBytes = statSync(assetPath).size;
assert.ok(fileBytes < 1_000_000, `Model pack must stay below 1 MB, received ${fileBytes} bytes`);
assert.equal(document.asset?.version, "2.0", "Asset metadata must identify glTF 2.0");
assert.ok(!document.images?.length, "Model pack must not embed or reference bitmap images");
assert.ok(!document.textures?.length, "Model pack must not define texture records");
assert.ok(!document.buffers?.some((buffer) => buffer.uri), "GLB buffers must remain self-contained");
assert.ok(!HasTextureReference(document.materials ?? []), "Materials must remain flat-color and texture-free");

const nodesByName = new Map(document.nodes.map((node, index) => [node.name, index]));
const activeScene = document.scenes[document.scene ?? 0];
const sceneRootNodes = new Set(activeScene.nodes ?? []);
const assetReports = {};
let totalTriangles = 0;
let totalMeshes = 0;
let totalPrimitives = 0;

for (const assetName of requiredAssets) {
  const nodeIndex = nodesByName.get(assetName);
  assert.notEqual(nodeIndex, undefined, `Required root node is missing: ${assetName}`);
  assert.ok(sceneRootNodes.has(nodeIndex), `${assetName} must be a direct scene root for independent instancing`);
  const rootNode = document.nodes[nodeIndex];
  assert.ok((rootNode.children ?? []).length > 0, `${assetName} must contain model parts`);
  assert.ok((rootNode.translation ?? [0, 0, 0]).every((value) => Math.abs(value) < 0.0001), `${assetName} root translation must be zero`);
  assert.equal(rootNode.extras?.assetCategory, "Model", `${assetName} must expose Model category metadata`);
  assert.equal(rootNode.extras?.campaign, "EnemyRear1941", `${assetName} campaign metadata mismatch`);
  assert.equal(rootNode.extras?.groundPlaneZ, 0, `${assetName} ground-plane metadata mismatch`);
  assert.equal(rootNode.extras?.bitmapTextureCount, 0, `${assetName} must declare zero bitmap textures`);
  const report = InspectAsset(document, nodeIndex);
  totalTriangles += report.triangleCount;
  totalMeshes += report.meshCount;
  totalPrimitives += report.primitiveCount;
  assert.ok(report.meshCount <= 8, `${assetName} exceeds the eight-mesh descendant budget`);
  assert.ok(report.nodeCount <= 10, `${assetName} exceeds the ten-node hierarchy budget`);
  assert.ok(report.primitiveCount <= 8, `${assetName} exceeds the eight-draw-primitive budget`);
  assert.ok(Math.abs(report.bounds.min[1]) <= 0.035, `${assetName} geometry must meet its local ground plane`);
  assert.ok(report.size[1] >= 0.8 && report.size[1] <= 1.8, `${assetName} height is outside the shared miniature scale`);
  assert.ok(report.size[0] >= 0.5 && report.size[0] <= 2.5, `${assetName} width is outside the shared miniature scale`);
  assert.ok(report.size[2] >= 0.25 && report.size[2] <= 2.0, `${assetName} depth is outside the shared miniature scale`);
  assetReports[assetName] = {
    meshCount: report.meshCount,
    nodeCount: report.nodeCount,
    primitiveCount: report.primitiveCount,
    materialCount: report.materialCount,
    triangles: report.triangleCount,
    size: report.size.map((value) => Number(value.toFixed(4))),
    ground: Number(report.bounds.min[1].toFixed(4)),
  };
}

assert.ok(totalTriangles < 8_000, `Model pack must stay below 8,000 triangles, received ${totalTriangles}`);
assert.ok(totalTriangles >= 3_500, "Model pack is unexpectedly sparse and may have lost recognizable parts");
assert.ok(totalMeshes <= 55, `Model pack must stay at or below 55 mesh descendants, received ${totalMeshes}`);
assert.ok(totalPrimitives <= 55, `Model pack must stay at or below 55 draw primitives, received ${totalPrimitives}`);

console.log(JSON.stringify({
  ok: true,
  fileBytes,
  assetCount: requiredAssets.length,
  totalTriangles,
  totalMeshes,
  totalPrimitives,
  textureCount: document.textures?.length ?? 0,
  imageCount: document.images?.length ?? 0,
  assets: assetReports,
}, null, 2));
