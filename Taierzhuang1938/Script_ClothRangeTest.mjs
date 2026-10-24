// Independent cloth lab: real exported bind geometry, private parameter state,
// aerodynamic response and the unchanged production blanket contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { CLOTH_LAB_ASSETS, CLOTH_LAB_PRESETS, CLOTH_LAB_CONTROLS, CLOTH_LAB_SIM, ClampClothParameter } from './Data_Tuning_ClothRange.mjs';
import { ApplyClothWind } from './Script_ClothLabSimulation.mjs';
import { LoadGlb, SerializeGlb, ReadAccessor } from './_import/Script_LugouGlbPose.mjs';

const vendor = new URL('./vendor/three/', import.meta.url);
const hooks = registerHooks({
  resolve(id, context, next) {
    return id === 'three' ? { url: new URL('build/three.module.js', vendor).href, shortCircuit: true } : next(id, context);
  },
  load(url, context, next) {
    return url.startsWith(vendor.href) && url.endsWith('.js')
      ? { format: 'module', source: fs.readFileSync(new URL(url), 'utf8'), shortCircuit: true } : next(url, context);
  },
});
const THREE = await import('three');
const { GLTFLoader } = await import('./vendor/three/examples/jsm/loaders/GLTFLoader.js');
const { BLANKET_CLOTH, ClothGrid, BlanketClothRig } = await import('./Script_BlanketCloth.mjs');
const { CloneSkinnedRig } = await import('./Script_SkinnedClone.mjs');
hooks.deregister();

let checks = 0;
function Check(ok, label, detail = '') {
  checks++;
  assert.ok(ok, `${label}${detail ? ': ' + detail : ''}`);
  console.log(`ok   ${label}${detail ? ' — ' + detail : ''}`);
}
const Hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// This lab was explicitly requested without changing the campaign cloth. Text
// hashes normalize line endings so a Windows and Linux checkout have the same gate.
const legacy = [
  ['Script_BlanketCloth.mjs', '2a74f46936be2eeca96c82ab87641401ebdd15b5feb1e85a67ea44140c4dfa95'],
  ['Script_EditorBlockoutBlanket.mjs', 'd574e8efa3ef36e8bb3d3f881419375a2af0eeabf5b8ccedf8ffb1034b55c3c3'],
  ['Model/Model_SingleBlanket.glb', '2b83eb41892c71c1a950141f2f2cd156ad60ee17f07149dc1342238e6e37873e'],
];
for (const [file, expected] of legacy) {
  const bytes = fs.readFileSync(new URL(file, import.meta.url));
  const content = file.endsWith('.mjs') ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes;
  Check(Hash(content) === expected, `Production blanket preserved: ${file}`);
}
const defaultBefore = JSON.stringify(BLANKET_CLOTH);
Check(Object.isFrozen(BLANKET_CLOTH), 'Production defaults remain frozen');
Check(!/from\s+['"]three['"]/.test(fs.readFileSync(new URL('./Data_Tuning_ClothRange.mjs', import.meta.url), 'utf8')), 'Lab tuning is pure data');
Check(Object.keys(CLOTH_LAB_PRESETS).join(',') === 'thin,cotton,quilt,curtain,banner', 'Five cloth profiles are available');
Check(new Set(CLOTH_LAB_CONTROLS.map(item => item.key)).size === CLOTH_LAB_CONTROLS.length, 'Every parameter has one control');
for (const [id, preset] of Object.entries(CLOTH_LAB_PRESETS)) {
  Check(Object.isFrozen(preset), `${id}: shared profile is immutable`);
  for (const control of CLOTH_LAB_CONTROLS) {
    const value = preset[control.key];
    Check(Number.isFinite(value) && value >= control.min && value <= control.max, `${id}: ${control.key} starts inside its bounds`);
  }
}
for (const control of CLOTH_LAB_CONTROLS) {
  Check(ClampClothParameter(control.key, control.min - 1) === control.min
    && ClampClothParameter(control.key, control.max + 1) === control.max
    && ClampClothParameter(control.key, NaN) === null
    && ClampClothParameter(control.key, Infinity) === null, `${control.key}: external inputs are clamped or rejected`);
}
Check(ClampClothParameter('unknown', 1) === null, 'Unknown parameters are rejected');
Check(CLOTH_LAB_PRESETS.quilt.thickness > CLOTH_LAB_PRESETS.curtain.thickness
  && CLOTH_LAB_PRESETS.curtain.thickness > CLOTH_LAB_PRESETS.banner.thickness
  && CLOTH_LAB_PRESETS.quilt.bend > CLOTH_LAB_PRESETS.thin.bend
  && CLOTH_LAB_PRESETS.quilt.density > CLOTH_LAB_PRESETS.banner.density, 'Quilt, padded curtain and light banner have distinct physical profiles');

function WindGrid(horizontal = false) {
  const x = new Float32Array(27);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const i = (r * 3 + c) * 3;
    x[i] = 1 - c; x[i + (horizontal ? 2 : 1)] = 1 - r;
  }
  return { x, v: new Float32Array(27), inv: new Float32Array(9).fill(1), rows: 3, cols: 3 };
}
{
  const calm = WindGrid(); ApplyClothWind(calm, { wind: 0, density: .5 }, .4, 1 / 60);
  Check(calm.v.every(value => value === 0), 'Zero wind applies no acceleration');
  const light = WindGrid(), heavy = WindGrid();
  light.inv[0] = heavy.inv[0] = 0;
  ApplyClothWind(light, { wind: 2, density: .5 }, .4, 1 / 60);
  ApplyClothWind(heavy, { wind: 2, density: 1 }, .4, 1 / 60);
  Check(light.v[14] > 0 && Math.abs(light.v[14] - heavy.v[14] * 2) < 1e-7, 'Doubling surface density halves aerodynamic acceleration');
  Check(light.v.slice(0, 3).every(value => value === 0) && light.v.every(Number.isFinite), 'Pinned particles receive no wind and outputs stay finite');
  const flat = WindGrid(true); ApplyClothWind(flat, { wind: 2, density: .5 }, .4, 1 / 60);
  Check(flat.v[13] > 0 && flat.v[14] === 0 && light.v[13] === 0, 'Wind pressure follows the actual surface normal');
  const tailwind = WindGrid(); tailwind.v[14] = 8;
  ApplyClothWind(tailwind, { wind: 2, density: .5 }, .4, 1 / 60);
  Check(tailwind.v[14] < 8, 'Relative airflow brakes cloth travelling faster than the wind');
  const gust = WindGrid(); ApplyClothWind(gust, { wind: 0, density: .5 }, .4, 1 / 60, 3);
  Check(gust.v[14] > light.v[14], 'A gust accelerates otherwise calm cloth');
  const capped = WindGrid(); ApplyClothWind(capped, { wind: 100, density: .1 }, .4, 1 / 60);
  Check(capped.v.every(value => Number.isFinite(value) && Math.abs(value) <= CLOTH_LAB_SIM.windAccelerationMax / 60 + 1e-6), 'Extreme wind stays below the acceleration cap');
  const collapsed = WindGrid(); collapsed.x.fill(0);
  ApplyClothWind(collapsed, { wind: 3, density: .5 }, .4, 1 / 60);
  Check(collapsed.v.every(value => value === 0), 'A degenerate patch does not produce NaN');
}

function WithoutTextures(glb) {
  const json = structuredClone(glb.json);
  delete json.images; delete json.textures; delete json.samplers;
  for (const material of json.materials || []) {
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key];
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    delete material.extensions;
  }
  json.extensionsUsed = (json.extensionsUsed || []).filter(key => !/texture|material/i.test(key));
  json.extensionsRequired = (json.extensionsRequired || []).filter(key => !/texture|material/i.test(key));
  const bytes = SerializeGlb(json, glb.bin);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function ShellTopology(glb) {
  const welded = new Map(), vertices = [], faces = [];
  for (const mesh of glb.json.meshes) for (const primitive of mesh.primitives) {
    const positions = ReadAccessor(glb, primitive.attributes.POSITION).data;
    const indices = ReadAccessor(glb, primitive.indices).data;
    const ids = new Array(positions.length / 3);
    for (let i = 0; i < ids.length; i++) {
      const point = Array.from(positions.slice(i * 3, i * 3 + 3));
      const key = point.map(value => Math.round(value * 1e6)).join(',');
      if (!welded.has(key)) { welded.set(key, vertices.length); vertices.push(point); }
      ids[i] = welded.get(key);
    }
    for (let i = 0; i < indices.length; i += 3) faces.push([ids[indices[i]], ids[indices[i + 1]], ids[indices[i + 2]]]);
  }
  const edges = new Map(); let volume = 0, degenerates = 0;
  for (const [i, j, k] of faces) {
    if (i === j || j === k || k === i) degenerates++;
    const a = vertices[i], b = vertices[j], c = vertices[k];
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (const [u, v] of [[i, j], [j, k], [k, i]]) {
      const key = `${Math.min(u, v)},${Math.max(u, v)}`;
      const edge = edges.get(key) || { count: 0, direction: 0 };
      edge.count++; edge.direction += u < v ? 1 : -1; edges.set(key, edge);
    }
  }
  return { vertices: vertices.length, faces: faces.length, euler: vertices.length - edges.size + faces.length,
    boundary: [...edges.values()].filter(edge => edge.count !== 2).length,
    winding: [...edges.values()].filter(edge => edge.direction !== 0).length, degenerates, volume };
}

const measuredAssets = [];
for (const spec of CLOTH_LAB_ASSETS) {
  const file = new URL(`./Model/ClothLab/${spec.file}`, import.meta.url);
  Check(fs.existsSync(file), `${spec.id}: separate asset exists`);
  const glb = LoadGlb(file), g = glb.json;
  Check((g.images || []).length >= 2 && g.images.every(image => Number.isInteger(image.bufferView)), `${spec.id}: PBR images are embedded`);
  Check(g.materials.length >= 3 && g.materials.every(material => (material.alphaMode || 'OPAQUE') === 'OPAQUE'
    && (material.pbrMetallicRoughness?.metallicFactor ?? 1) < .1
    && (material.pbrMetallicRoughness?.roughnessFactor ?? 1) >= .75), `${spec.id}: front, back and binding use opaque rough cloth`);
  Check(g.materials.every(material => material.normalTexture)
    && g.materials.filter(material => material.pbrMetallicRoughness?.baseColorTexture).length >= 2, `${spec.id}: front and back have actual base maps and all cloth has normal detail`);
  const topology = ShellTopology(glb);
  Check(topology.boundary === 0 && topology.winding === 0 && topology.degenerates === 0 && topology.euler === 2 && topology.volume > 0,
    `${spec.id}: UV and material seams weld to one closed outward shell`, JSON.stringify(topology));
  const parsed = await new Promise((resolve, reject) => new GLTFLoader().parse(WithoutTextures(glb), '', resolve, reject));
  const root = CloneSkinnedRig(parsed.scene), rig = new BlanketClothRig(root, { ...CLOTH_LAB_PRESETS[spec.preset] });
  Check(rig.rows === 18 && rig.cols === 12 && rig.bones.length === 216, `${spec.id}: real inverse-bind matrices form the 18 × 12 grid`);
  Check(rig.bones.every(bone => bone.parent === rig.bones[0].parent), `${spec.id}: all deform bones share one parent`);
  Check(rig.restRotations.every(q => q.angleTo(new THREE.Quaternion()) < 1e-5), `${spec.id}: bind orientations support cloth tangent frames`);
  const rest = rig.cloth.rest;
  const axisRange = axis => Array.from({ length: rig.cloth.n }, (_, i) => rest[i * 3 + axis]);
  const xs = axisRange(0), ys = axisRange(1), zs = axisRange(2);
  Check(Math.abs(Math.max(...xs) - Math.min(...xs) - spec.width) < .001
    && Math.abs(Math.max(...zs) - Math.min(...zs) - spec.length) < .001 && ys.every(y => Math.abs(y) < 1e-5)
    && rest[rig.corners.headL * 3] > 0 && rest[rig.corners.headL * 3 + 2] > 0, `${spec.id}: measured metre scale and +Z head / +X left match the runtime`);

  const cloth = rig.cloth, originalCfg = { ...cloth.cfg };
  cloth.cfg.bend = .123;
  Check(CLOTH_LAB_PRESETS[spec.preset].bend !== .123 && JSON.stringify(BLANKET_CLOTH) === defaultBefore, `${spec.id}: editing an instance cannot mutate a profile or the campaign`);
  Object.assign(cloth.cfg, originalCfg);
  root.position.set(1.7, .8, -.4); root.rotation.set(.2, .6, -.1); root.updateMatrixWorld(true);
  cloth.Reset(rig.AssetToWorld()); rig.Apply(); root.updateMatrixWorld(true);
  let vertices = 0, restError = 0, weightError = 0, bottom = Infinity, top = -Infinity;
  const point = new THREE.Vector3(), expected = new THREE.Vector3();
  const meshes = [];
  root.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  for (const mesh of meshes) {
    mesh.skeleton.update();
    const position = mesh.geometry.getAttribute('position'), weights = mesh.geometry.getAttribute('skinWeight');
    vertices += position.count;
    for (let i = 0; i < position.count; i++) {
      const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
      weightError = Math.max(weightError, Math.abs(sum - 1));
      bottom = Math.min(bottom, position.getY(i)); top = Math.max(top, position.getY(i));
      expected.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      point.fromBufferAttribute(position, i); mesh.applyBoneTransform(i, point).applyMatrix4(mesh.matrixWorld);
      restError = Math.max(restError, point.distanceTo(expected));
    }
  }
  Check(vertices > 5000 && weightError < 2e-5, `${spec.id}: real exported skin weights sum to one`, `${vertices} vertices / ${weightError}`);
  Check(restError < .0001, `${spec.id}: translated / rotated rest pose preserves every skinned vertex`, `${restError} m`);
  const thickness = top - bottom;
  Check(thickness > (spec.id === 'quilt' ? .06 : spec.id === 'curtain' ? .02 : .001)
    && thickness < (spec.id === 'quilt' ? .12 : spec.id === 'curtain' ? .06 : .012), `${spec.id}: real geometry has the intended thickness`, `${(thickness * 1000).toFixed(2)} mm`);
  const triangles = g.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((count, primitive) => count + g.accessors[primitive.indices].count / 3, 0), 0);
  Check(triangles > 6000 && triangles < 25000, `${spec.id}: geometry stays within the lab budget`, `${triangles} triangles`);

  // A second rig must have private bones and mutable cfg, not share the live mesh.
  const other = new BlanketClothRig(CloneSkinnedRig(parsed.scene), { ...CLOTH_LAB_PRESETS[spec.preset] });
  Check(other.bones[0] !== rig.bones[0] && other.cloth.cfg !== cloth.cfg, `${spec.id}: clones do not share bone or solver state`);
  cloth.cfg.tether = 0;
  cloth.cfg.groundOffsetM = Math.max(.012, thickness * .5 + .003);
  const world = new THREE.Matrix4().makeRotationX(-Math.PI / 2); world.setPosition(0, spec.length * .5 + .5, 0);
  cloth.Reset(world); cloth.SampleGround(() => 0, true);
  for (let c = 0; c < cloth.cols; c++) {
    const i = cloth.Index(0, c); cloth.SetPin(i, new THREE.Vector3().fromArray(cloth.x, i * 3));
  }
  const beforeWind = Float32Array.from(cloth.x);
  for (let f = 0; f < 120; f++) {
    ApplyClothWind(cloth, CLOTH_LAB_PRESETS[spec.preset], f / 60, 1 / 60);
    cloth.SampleGround(() => 0); cloth.Step(1 / 60);
  }
  const stats = cloth.Stats();
  const movement = Math.max(...cloth.x.map((value, i) => Math.abs(value - beforeWind[i])));
  Check(cloth.x.every(Number.isFinite) && cloth.v.every(Number.isFinite) && movement > .005, `${spec.id}: hanging simulation reacts to wind without nonfinite values`, `${movement.toFixed(3)} m`);
  Check(stats.lowM >= -1e-5 && stats.maxStretch < 1.35, `${spec.id}: simulated cloth stays above ground with bounded stretch`, JSON.stringify(stats));
  const pinError = Math.max(...[...cloth.pins].map(([i, pin]) => new THREE.Vector3().fromArray(cloth.x, i * 3).distanceTo(pin.target)));
  Check(pinError < 1e-6, `${spec.id}: header pins stay attached during wind`, `${pinError} m`);
  measuredAssets.push({ id: spec.id, triangles, vertices, thickness, restError });
}
Check(JSON.stringify(BLANKET_CLOTH) === defaultBefore, 'All lab exercises leave campaign solver defaults unchanged');
console.log(JSON.stringify({ measuredAssets }, null, 2));
console.log(`ClothRangeTest: ${checks} checks passed`);
