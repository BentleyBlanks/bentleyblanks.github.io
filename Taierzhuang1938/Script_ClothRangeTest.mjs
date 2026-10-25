// Independent cloth lab: real exported bind geometry, private parameter state,
// aerodynamic response and the unchanged production blanket contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { CLOTH_LAB_ASSETS, CLOTH_LAB_PRESETS, CLOTH_LAB_CONTROLS, CLOTH_LAB_SIM, ClampClothParameter } from './Data_Tuning_ClothRange.mjs';
import { ApplyClothWind, ClothLabContactFriction } from './Script_ClothLabSimulation.mjs';
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
const { CreateClothSampleMaterials } = await import('./Script_ClothSampleMaterials.mjs');
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
const sampleIds = ['quilt', 'curtain', 'banner', 'muslin', 'silk', 'canvas', 'wool', 'singleBlanket', 'towel'];
const materialSampleIds = ['muslin', 'silk', 'canvas', 'wool'];
Check(Object.keys(CLOTH_LAB_PRESETS).sort().join(',') === [...sampleIds, 'thin', 'cotton'].sort().join(','), 'Eleven cloth profiles include all nine independent samples');
Check(CLOTH_LAB_ASSETS.map(spec => spec.id).join(',') === sampleIds.join(','), 'Nine selectable cloth samples have distinct identities');
Check(new Set(CLOTH_LAB_ASSETS.map(spec => spec.file)).size === 3, 'Four material samples reuse the banner shell; only three GLB source assets exist');
for (const [i, id] of materialSampleIds.entries()) {
  const spec = CLOTH_LAB_ASSETS.find(item => item.id === id);
  Check(spec.sample === true && spec.material === id && spec.file === 'Model_SichuanBanner.glb'
    && spec.preset === id && spec.z === 4.2 && spec.x === [-4.5, -1.5, 1.5, 4.5][i]
    && spec.width === 1.45 && spec.length === 1.75 && spec.top === 2.8, `${id}: independent material identity and second-row placement share the supported thin-shell rig`);
}
Check(CLOTH_LAB_CONTROLS.find(control => control.key === 'roughness').min === .2
  && CLOTH_LAB_CONTROLS.find(control => control.key === 'density').min === .08, 'Controls expose silky roughness and light muslin surface density');
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
  const muslin = WindGrid(), doubleMuslin = WindGrid();
  ApplyClothWind(muslin, { wind: 1, density: .08 }, .4, 1 / 60);
  ApplyClothWind(doubleMuslin, { wind: 1, density: .16 }, .4, 1 / 60);
  Check(muslin.v[14] > 0 && Math.abs(muslin.v[14] - doubleMuslin.v[14] * 2) < 1e-7, 'The new 0.08 kg/m² lower bound has no hidden density dead zone');
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

// New swatches author their own maps rather than displaying the historical
// banner's lettering. All objects and backing bytes belong to one factory call.
const materialRecipes = [];
const materialKinds = [...materialSampleIds, 'towel'];
for (const kind of materialKinds) {
  const pack = CreateClothSampleMaterials(kind), duplicate = CreateClothSampleMaterials(kind);
  Check(pack.materials.length === 3 && pack.materials.every(material => material.isMeshPhysicalMaterial
    && material.userData.clothSampleKind === kind), `${kind}: three physical cloth materials carry the sample identity`);
  const textures = new Set(pack.materials.flatMap(material => [material.map, material.normalMap, material.roughnessMap]));
  Check(textures.size === 3 && [...textures].every(texture => texture?.isDataTexture && texture.image.width === 512
    && texture.image.height === 512 && texture.image.data.length === 512 * 512 * 4), `${kind}: dedicated base, normal and roughness maps are real 512² RGBA textures`);
  const base = pack.materials[0].map, normal = pack.materials[0].normalMap, roughness = pack.materials[0].roughnessMap;
  Check(base.colorSpace === THREE.SRGBColorSpace && normal.colorSpace === THREE.NoColorSpace && roughness.colorSpace === THREE.NoColorSpace,
    `${kind}: base color is sRGB and normal/roughness remain linear data`);
  Check(pack.materials.every((material, i) => material !== duplicate.materials[i]
    && material.map !== duplicate.materials[i].map && material.map.image.data !== duplicate.materials[i].map.image.data), `${kind}: repeated factory calls share no material, texture or mutable image buffer`);
  const baseHash = Hash(base.image.data), normalHash = Hash(normal.image.data);
  Check(baseHash === Hash(duplicate.materials[0].map.image.data) && normalHash === Hash(duplicate.materials[0].normalMap.image.data), `${kind}: material generation is deterministic`);
  const originalByte = base.image.data[0]; duplicate.materials[0].map.image.data[0] ^= 255;
  duplicate.materials[0].roughness = .27;
  Check(base.image.data[0] === originalByte && pack.materials[0].roughness !== .27, `${kind}: editing one swatch cannot alter another`);
  if (kind === 'silk') Check(pack.materials[0].roughness < .4 && pack.materials[0].anisotropy > .5, 'Silk exposes a smooth directional fabric highlight');
  if (kind === 'wool') Check(pack.materials[0].roughness > .9 && pack.materials[0].sheen > .7, 'Wool keeps a rough surface and strong soft fibre sheen');
  const disposeCounts = new Map([...pack.materials, ...textures].map(resource => [resource, 0]));
  for (const resource of disposeCounts.keys()) resource.addEventListener('dispose', () => disposeCounts.set(resource, disposeCounts.get(resource) + 1));
  pack.Dispose(); pack.Dispose(); duplicate.Dispose();
  Check([...disposeCounts.values()].every(count => count === 1), `${kind}: repeated disposal releases each private material and texture exactly once`);
  materialRecipes.push({ kind, baseHash, normalHash });
}
Check(new Set(materialRecipes.map(recipe => recipe.baseHash)).size === materialKinds.length
  && new Set(materialRecipes.map(recipe => recipe.normalHash)).size === materialKinds.length, 'Muslin, silk, canvas, wool and towel have distinct authored colour and weave maps');
assert.throws(() => CreateClothSampleMaterials('unknown'), RangeError);

// Contact tests use the same grid and substeps as the live lab. They measure
// travel, support, separation and carry, not just coefficient assignment.
function ContactGrid(mu, { rows = 3, cols = 3, width = .16, length = .16, y = .82, x = .14, ground = -3 } = {}) {
  const rest = new Float32Array(rows * cols * 3);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const o = (r * cols + c) * 3; rest[o] = width * (.5 - c / Math.max(1, cols - 1)); rest[o + 2] = length * (.5 - r / Math.max(1, rows - 1));
  }
  const grid = new ClothGrid(rest, rows, cols, { ...CLOTH_LAB_PRESETS.quilt, groundFriction: mu, groundOffsetM: .052,
    bodyMarginM: .056, airDamping: 0, tether: 0, maxSpeedMps: 4 });
  grid.Reset(new THREE.Matrix4().makeTranslation(x, y, 0)); grid.SampleGround(() => ground, true);
  const friction = new ClothLabContactFriction(grid);
  return { grid, friction };
}
const ContactCenter = grid => {
  const center = [0, 0, 0];
  for (let i = 0; i < grid.n; i++) for (let k = 0; k < 3; k++) center[k] += grid.x[i * 3 + k] / grid.n;
  return center;
};
const ContactCapsule = (x = 0) => [{ id: 'Support', a: new THREE.Vector3(x, .46, -.5), b: new THREE.Vector3(x, .46, .5), r: .28 }];
{
  function Slide(mu) {
    const sample = ContactGrid(mu);
    sample.friction.SetColliders(ContactCapsule());
    for (let f = 0; f < 120; f++) sample.grid.Step(1 / 60);
    return { ...sample, center: ContactCenter(sample.grid) };
  }
  const low = Slide(.02), high = Slide(.9);
  Check(low.center[0] > .5 && low.center[1] < 0 && Math.abs(high.center[0] - .14) < .04 && high.center[1] > .7,
    'Capsule friction is observable: low friction slides off, high friction keeps the patch supported', JSON.stringify({ low: low.center, high: high.center }));
  Check(high.friction.Stats().body > 0 && high.friction.Stats().sticking > 0, 'Body contacts enter static friction without ground contact or pressed/carry flags');
  const before = high.center;
  for (let f = 0; f < 180; f++) high.grid.Step(1 / 60);
  const after = ContactCenter(high.grid);
  Check(Math.hypot(after[0] - before[0], after[2] - before[2]) < .003, 'Static capsule contact prevents slow constraint-projection creep');
  high.friction.SetColliders([]);
  const releaseY = after[1];
  for (let f = 0; f < 15; f++) high.grid.Step(1 / 60);
  Check(ContactCenter(high.grid)[1] < releaseY - .20 && high.friction.Stats().contacts === 0, 'Removing support releases the cloth immediately without a sticky anchor');
  low.friction.Dispose(); high.friction.Dispose();
}
{
  function DrivenGround(mu, acceleration) {
    const sample = ContactGrid(mu, { rows: 5, cols: 5, width: .4, length: .4, x: 0, y: .052, ground: 0 });
    for (let f = 0; f < 120; f++) {
      for (let i = 0; i < sample.grid.n; i++) sample.grid.v[i * 3] += acceleration / 60;
      sample.grid.Step(1 / 60);
    }
    const result = { center: ContactCenter(sample.grid), stats: sample.friction.Stats() };
    sample.friction.Dispose(); return result;
  }
  const low = DrivenGround(.02, 1.2), high = DrivenGround(.9, 1.2), overcome = DrivenGround(.9, 12);
  Check(low.center[0] > 1.5 && Math.abs(high.center[0]) < .002 && high.stats.sticking === 25,
    'Ground static friction resists a sustained subthreshold force while low friction slips', JSON.stringify({ low: low.center[0], high: high.center[0] }));
  Check(overcome.center[0] > .5 && overcome.stats.sliding > 0, 'A force above the Coulomb limit breaks static contact into sliding');
}
{
  const low = ContactGrid(0, { x: 0, y: 2 }), high = ContactGrid(1.5, { x: 0, y: 2 });
  for (const sample of [low, high]) for (let i = 0; i < sample.grid.n; i++) sample.grid.v[i * 3] = .7;
  for (let f = 0; f < 20; f++) { low.grid.Step(1 / 60); high.grid.Step(1 / 60); }
  Check(low.grid.x.every((value, i) => value === high.grid.x[i]) && low.grid.v.every((value, i) => value === high.grid.v[i]),
    'Friction has exactly no effect while airborne and out of contact');
  Check(high.grid.cfg.groundFriction === 1.5, 'The displayed coefficient is restored after temporarily bypassing legacy velocity damping');
  const originalSubstep = high.friction.originalSubstep, originalCollide = high.friction.originalCollide;
  high.friction.Dispose(); low.friction.Dispose();
  Check(high.grid._Substep === originalSubstep && high.grid._Collide === originalCollide, 'Disposal restores only the wrapped instance methods');
}
{
  function Carried(mu) {
    const sample = ContactGrid(mu, { x: 0, y: .796 });
    sample.friction.SetColliders(ContactCapsule(0), 1 / 60);
    for (let f = 1; f <= 120; f++) { sample.friction.SetColliders(ContactCapsule(f / 120 * .3), 1 / 60); sample.grid.Step(1 / 60); }
    const result = ContactCenter(sample.grid); sample.friction.Dispose(); return result;
  }
  const low = Carried(0), high = Carried(.9);
  Check(Math.abs(high[0] - .3) < .035 && high[1] > .7 && Math.abs(low[0] - .3) > .25,
    'A translating capsule carries contacting high-friction cloth in its local tangential motion', JSON.stringify({ low, high }));
}
{
  const sample = ContactGrid(.9, { rows: 18, cols: 12, width: 1.4, length: 1.9, x: -3, y: 1.05, ground: 0 });
  sample.grid.cfg.airDamping = CLOTH_LAB_PRESETS.quilt.airDamping;
  sample.friction.SetColliders([
    { a: new THREE.Vector3(-3, .46, -.185), b: new THREE.Vector3(-3, .46, .285), r: .28 },
    ...[-1, 1].map(side => ({ a: new THREE.Vector3(-3 + side * .14, .27, -.86), b: new THREE.Vector3(-3 + side * .14, .27, -.38), r: .105 })),
    { a: new THREE.Vector3(-3, .47, .84), b: new THREE.Vector3(-3, .47, .84), r: .17 },
  ]);
  for (let f = 0; f < 600; f++) {
    ApplyClothWind(sample.grid, CLOTH_LAB_PRESETS.quilt, f / 60, 1 / 60);
    sample.grid.SampleGround(() => 0); sample.grid.Step(1 / 60);
  }
  const center = ContactCenter(sample.grid), stats = sample.grid.Stats();
  Check(sample.grid.x.every(Number.isFinite) && sample.grid.v.every(Number.isFinite) && center[1] > .45
    && Math.hypot(center[0] + 3, center[2]) < .08 && stats.maxStretch < 1.1,
    'Full 18 × 12 quilt remains draped after ten seconds with wind and high contact friction', JSON.stringify({ center, maxStretch: stats.maxStretch }));
  sample.friction.Dispose();
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
  Check(fs.existsSync(file), `${spec.id}: registered source shell exists`);
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
