// Apply the approved V7 shoe geometry to the user's V6 Tripo skin before rig conversion.
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "../vendor/three/build/three.module.js";
import { LoadGlb, ReadAccessor, ReadAccessorInt, SerializeGlb } from "./Script_LugouGlbPose.mjs";

const Hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function NodeWorlds(doc) {
  const parents = doc.nodes.map(() => -1), world = [];
  doc.nodes.forEach((node, index) => (node.children || []).forEach(child => { parents[child] = index; }));
  const At = index => {
    if (world[index]) return world[index];
    const node = doc.nodes[index];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix)
      : new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation || [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])));
    return world[index] = parents[index] < 0 ? local : At(parents[index]).clone().multiply(local);
  };
  doc.nodes.forEach((_, index) => At(index));
  return { world, parents };
}

function Geometry(glb, matrix) {
  const primitive = glb.json.meshes[0].primitives[0];
  const positions = ReadAccessor(glb, primitive.attributes.POSITION).data;
  const normals = ReadAccessor(glb, primitive.attributes.NORMAL).data;
  const uv = ReadAccessor(glb, primitive.attributes.TEXCOORD_0).data;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const vertices = [];
  for (let index = 0; index < positions.length / 3; index++) {
    vertices.push({ index,
      point: new THREE.Vector3().fromArray(positions, index * 3).applyMatrix4(matrix),
      normal: new THREE.Vector3().fromArray(normals, index * 3).applyMatrix3(normalMatrix).normalize(),
      u: uv[index * 2], v: uv[index * 2 + 1],
      // glTF texture coordinates have the opposite V origin to Blender's atlas UVs.
      foot: uv[index * 2] > .5 && uv[index * 2 + 1] < .5,
    });
  }
  return { primitive, positions, normals, vertices };
}

function Bounds(vertices) {
  return new THREE.Box3().setFromPoints(vertices.map(vertex => vertex.point));
}

function Offset(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  return (glb.json.bufferViews[accessor.bufferView].byteOffset || 0) + (accessor.byteOffset || 0);
}

function WriteVector(glb, accessorIndex, index, vector) {
  const offset = Offset(glb, accessorIndex) + index * 12;
  glb.bin.writeFloatLE(vector.x, offset);
  glb.bin.writeFloatLE(vector.y, offset + 4);
  glb.bin.writeFloatLE(vector.z, offset + 8);
}

function UvKey(vertex) { return `${Math.round(vertex.u * 1e7)},${Math.round(vertex.v * 1e7)}`; }

function FootReflection(before, after) {
  const matches = new Map();
  for (const vertex of after) {
    if (vertex.point.y >= .07) continue;
    matches.set(UvKey(vertex), vertex);
  }
  const covariance = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const targetX = new THREE.Vector3(), targetZ = new THREE.Vector3(), pairs = [];
  for (const vertex of before) {
    const target = matches.get(UvKey(vertex));
    if (!target || vertex.point.y >= .07) continue;
    const basis = [vertex.point.x, vertex.point.z, 1];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) covariance.elements[column * 3 + row] += basis[row] * basis[column];
    }
    targetX.addScaledVector(new THREE.Vector3(...basis), target.point.x);
    targetZ.addScaledVector(new THREE.Vector3(...basis), target.point.z);
    pairs.push([vertex.point, target.point]);
  }
  if (pairs.length < 100) throw new Error("Not enough original sole UV correspondences");
  const inverse = covariance.clone().invert();
  targetX.applyMatrix3(inverse); targetZ.applyMatrix3(inverse);
  const matrix = new THREE.Matrix4().set(
    targetX.x, 0, targetX.y, targetX.z,
    0, 1, 0, 0,
    targetZ.x, 0, targetZ.y, targetZ.z,
    0, 0, 0, 1,
  );
  const worst = Math.max(...pairs.map(([point, target]) => point.clone().applyMatrix4(matrix).distanceTo(target)));
  if (worst > 1e-5 || Math.abs(matrix.determinant() + 1) > .001) throw new Error(`Shoe reflection fit failed (${worst})`);
  return { matrix, samples: pairs.length, maximumError: worst };
}

export function PrepareTianSaoRig({ source, original, corrected, output }) {
  const rig = LoadGlb(source), v6 = LoadGlb(original), v7 = LoadGlb(corrected);
  const sourceHash = Hash(rig.buffer);
  if (rig.json.skins?.length !== 1 || rig.json.meshes?.length !== 1 || rig.json.materials?.length !== 1) throw new Error("Expected one complete Tripo skin");
  const { world, parents } = NodeWorlds(rig.json), skin = rig.json.skins[0];
  const inverseBinds = ReadAccessor(rig, skin.inverseBindMatrices).data;
  const display = world[skin.joints[0]].clone().multiply(new THREE.Matrix4().fromArray(inverseBinds, 0));
  const raw = Geometry(rig, display);
  const Static = glb => Geometry(glb, NodeWorlds(glb.json).world[glb.json.nodes.findIndex(node => node.mesh === 0)]);
  const old = Static(v6), approved = Static(v7);
  const oldBounds = Bounds(old.vertices.filter(vertex => !vertex.foot));
  const rigBounds = Bounds(raw.vertices.filter(vertex => !vertex.foot));
  const scale = oldBounds.getSize(new THREE.Vector3()).y / rigBounds.getSize(new THREE.Vector3()).y;
  const shift = oldBounds.getCenter(new THREE.Vector3()).sub(rigBounds.getCenter(new THREE.Vector3()).multiplyScalar(scale));
  const rawNormal = new THREE.Matrix3().setFromMatrix4(display).invert();
  const inverseDisplay = display.clone().invert();
  const positionOffset = Offset(rig, raw.primitive.attributes.POSITION);
  const originalPositions = Buffer.from(rig.bin.subarray(positionOffset, positionOffset + raw.positions.byteLength));
  const weightIndex = raw.primitive.attributes.WEIGHTS_0, weightOffset = Offset(rig, weightIndex);
  const weightBytes = ReadAccessor(rig, weightIndex).data.byteLength;
  const weightsHash = Hash(rig.bin.subarray(weightOffset, weightOffset + weightBytes));
  const footTransforms = {}, sideReports = [];
  const middle = -.035;
  for (const [side, sign] of [["Left", 1], ["Right", -1]]) {
    const OnSide = vertex => vertex.foot && (vertex.point.x - middle) * sign > 0;
    const before = old.vertices.filter(OnSide), after = approved.vertices.filter(OnSide);
    const reflection = FootReflection(before, after);
    footTransforms[side] = reflection.matrix;
    const expectedNormal = new THREE.Matrix3().getNormalMatrix(reflection.matrix);
    const approvedUv = new Map();
    for (const vertex of after) {
      const key = UvKey(vertex);
      if (!approvedUv.has(key)) approvedUv.set(key, []);
      approvedUv.get(key).push(vertex);
    }
    let changed = 0, maximumInputError = 0, maximumUvError = 0;
    for (const vertex of raw.vertices) {
      const aligned = vertex.point.clone().multiplyScalar(scale).add(shift);
      if (!vertex.foot || (aligned.x - middle) * sign <= 0) continue;
      let match = null, score = Infinity;
      for (const candidate of before) {
        const uvError = (candidate.u - vertex.u) ** 2 + (candidate.v - vertex.v) ** 2;
        const value = aligned.distanceToSquared(candidate.point) + uvError * .01
          + (1 - vertex.normal.dot(candidate.normal)) ** 2 * 1e-10;
        if (value < score) { score = value; match = candidate; }
      }
      const inputError = aligned.distanceTo(match.point);
      if (inputError > .0003) throw new Error(`${side} foot does not match the V6 download (${inputError})`);
      maximumInputError = Math.max(maximumInputError, inputError);
      const predicted = match.point.clone().applyMatrix4(reflection.matrix);
      const predictedNormal = match.normal.clone().applyMatrix3(expectedNormal).normalize();
      const candidates = approvedUv.get(UvKey(match));
      if (!candidates?.length) throw new Error("Approved V7 shoe UV correspondence is missing");
      let target = null, best = Infinity;
      for (const candidate of candidates) {
        const value = predicted.distanceToSquared(candidate.point) + (1 - predictedNormal.dot(candidate.normal)) ** 2 * 1e-10;
        if (value < best) { best = value; target = candidate; }
      }
      maximumUvError = Math.max(maximumUvError, Math.hypot(target.u - vertex.u, target.v - vertex.v));
      const point = target.point.clone().sub(shift).multiplyScalar(1 / scale).applyMatrix4(inverseDisplay);
      const normal = target.normal.clone().applyMatrix3(rawNormal).normalize();
      WriteVector(rig, raw.primitive.attributes.POSITION, vertex.index, point);
      WriteVector(rig, raw.primitive.attributes.NORMAL, vertex.index, normal);
      changed++;
    }
    sideReports.push({ side, vertices: changed, maximumInputError, maximumUvError,
      soleReflection: { samples: reflection.samples, maximumError: reflection.maximumError } });
  }
  const indices = ReadAccessorInt(rig, raw.primitive.indices).data;
  const indexOffset = Offset(rig, raw.primitive.indices);
  if (rig.json.accessors[raw.primitive.indices].componentType !== 5125) throw new Error("Unexpected source index storage");
  let reversedTriangles = 0;
  for (let index = 0; index < indices.length; index += 3) {
    if (![indices[index], indices[index + 1], indices[index + 2]].every(vertex => raw.vertices[vertex].foot)) continue;
    rig.bin.writeUInt32LE(indices[index + 2], indexOffset + (index + 1) * 4);
    rig.bin.writeUInt32LE(indices[index + 1], indexOffset + (index + 2) * 4);
    reversedTriangles++;
  }
  const updatedWorld = world.map(matrix => matrix.clone()), fittedJoints = [];
  rig.json.nodes.forEach((node, index) => {
    const match = /^mixamorig:(Left|Right)(Foot|ToeBase|Toe_End)$/.exec(node.name || "");
    if (!match) return;
    const point = new THREE.Vector3().setFromMatrixPosition(world[index]).multiplyScalar(scale).add(shift)
      .applyMatrix4(footTransforms[match[1]]).sub(shift).multiplyScalar(1 / scale);
    updatedWorld[index].setPosition(point);
    fittedJoints.push(node.name);
  });
  for (const name of fittedJoints) {
    const index = rig.json.nodes.findIndex(node => node.name === name);
    rig.json.nodes[index].matrix = updatedWorld[parents[index]].clone().invert().multiply(updatedWorld[index]).toArray();
  }
  const bindOffset = Offset(rig, skin.inverseBindMatrices);
  skin.joints.forEach((node, index) => {
    const inverse = updatedWorld[node].clone().invert().multiply(display);
    inverse.elements.forEach((value, element) => rig.bin.writeFloatLE(value, bindOffset + (index * 16 + element) * 4));
  });
  let protectedVertices = 0;
  for (const vertex of raw.vertices) {
    if (vertex.foot) continue;
    if (!originalPositions.subarray(vertex.index * 12, vertex.index * 12 + 12)
      .equals(rig.bin.subarray(positionOffset + vertex.index * 12, positionOffset + vertex.index * 12 + 12))) throw new Error("Non-foot geometry changed");
    protectedVertices++;
  }
  if (Hash(rig.bin.subarray(weightOffset, weightOffset + weightBytes)) !== weightsHash) throw new Error("Source skin weights changed");
  const modified = ReadAccessor(rig, raw.primitive.attributes.POSITION).data;
  const bounds = new THREE.Box3();
  for (let index = 0; index < modified.length; index += 3) bounds.expandByPoint(new THREE.Vector3().fromArray(modified, index));
  Object.assign(rig.json.accessors[raw.primitive.attributes.POSITION], { min: bounds.min.toArray(), max: bounds.max.toArray() });
  fs.writeFileSync(output, SerializeGlb(rig.json, rig.bin));
  return { source: { file: source, sha256: sourceHash },
    approvedAssembly: { file: corrected, sha256: Hash(v7.buffer) },
    protectedVertices, skinWeightsUnchanged: true, restoredGeometry: "V7 shoes", reversedTriangles,
    sideReports, fittedJoints, alignment: { scale, shift: shift.toArray() } };
}
