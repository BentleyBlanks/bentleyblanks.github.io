// Independent final-GLB geometry audit and real ManagedGLTFLoader WebGL review.
// node Model/PatchedTimberBed/Script_PatchedTimberBedTest.mjs --comparison
// Review HTML, full-size evidence and <=640px observation copies stay in tmp/.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from '../../Taierzhuang1938/Script_DevServer.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argumentsList = process.argv.slice(2);
function Option(name, fallback) { return argumentsList.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback; }
const outputRoot = path.resolve(repositoryRoot, Option('out', 'tmp/BedBnBs50kAcceptance'));
const finalFile = path.resolve(repositoryRoot, Option('model', 'Model/PatchedTimberBed/Model_PatchedTimberBed.glb'));
const originalFile = path.resolve(repositoryRoot, Option('original', 'tmp/BedBnBs50kAcceptance/Model_OriginalBed.glb'));
const contractFile = path.resolve(repositoryRoot, Option('contract', 'Model/PatchedTimberBed/Data_Asset.json'));
const compare = argumentsList.includes('--comparison');
const originalLabel = Option('original-label', '原版形体·颜色烘焙');
const areaThreshold = 1e-12; // Same world-space cross-product length as Dots structural audit.
const bsNodeExpression = Option('bs-node', 'BS[_ ]|FootCloth|exact material partition 10');
const bsNodePattern = new RegExp(bsNodeExpression, 'i');
function Hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function Near(actual, expected, message, tolerance = 2e-6) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${message}: ${actual} != ${expected}`));
}
function ReadGlb(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB byte length');
  let document, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, 'GLB chunk fits');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) document = JSON.parse(chunk.toString('utf8').trim());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  assert.ok(document && binary, 'GLB JSON and binary chunks');
  assert.equal(document.buffers.length, 1, 'one embedded geometry buffer');
  assert.ok(!document.buffers[0].uri, 'self-contained geometry buffer');
  for (const view of document.bufferViews) assert.ok((view.byteOffset ?? 0) + view.byteLength <= binary.length, 'buffer view fits binary');
  return { document, binary };
}
function Accessor(document, binary, index) {
  const item = document.accessors[index];
  assert.ok(item && !item.sparse && item.bufferView !== undefined, `dense accessor ${index}`);
  const view = document.bufferViews[item.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[item.type];
  const layouts = { 5120: [1, 'readInt8', 127], 5121: [1, 'readUInt8', 255], 5122: [2, 'readInt16LE', 32767], 5123: [2, 'readUInt16LE', 65535], 5125: [4, 'readUInt32LE', 4294967295], 5126: [4, 'readFloatLE', 1] };
  const [width, method, divisor] = layouts[item.componentType] ?? [];
  assert.ok(components && width, `supported accessor ${index}`);
  const stride = view.byteStride ?? width * components;
  const start = (view.byteOffset ?? 0) + (item.byteOffset ?? 0);
  assert.ok((item.byteOffset ?? 0) + Math.max(0, item.count - 1) * stride + width * components <= view.byteLength, `accessor ${index} fits view`);
  const values = new Float64Array(item.count * components);
  for (let row = 0; row < item.count; row++) for (let component = 0; component < components; component++) {
    let value = binary[method](start + row * stride + component * width);
    if (item.normalized) value = Math.max(-1, value / divisor);
    assert.ok(Number.isFinite(value), `accessor ${index} contains finite values`);
    values[row * components + component] = value;
  }
  return { values, count: item.count, components, normalized: !!item.normalized, componentType: item.componentType };
}
function Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function Multiply(a, b) {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  return result;
}
function NodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
function TextureInfo(material, slot) {
  const info = slot === 'baseColor' ? material.pbrMetallicRoughness?.baseColorTexture : material.normalTexture;
  if (!info) return null;
  const transform = info.extensions?.KHR_texture_transform ?? {};
  return { index: info.index, channel: transform.texCoord ?? info.texCoord ?? 0, scale: transform.scale ?? [1, 1], offset: transform.offset ?? [0, 0], rotation: transform.rotation ?? 0, normalScale: slot === 'normal' ? info.scale ?? 1 : undefined };
}
async function Inspect(file, strict) {
  const bytes = await fs.readFile(file);
  const { document, binary } = ReadGlb(bytes);
  const cache = new Map();
  function Get(index) { if (!cache.has(index)) cache.set(index, Accessor(document, binary, index)); return cache.get(index); }
  const primitives = [], materials = new Set();
  const boundsMin = [Infinity, Infinity, Infinity], boundsMax = [-Infinity, -Infinity, -Infinity];
  function Visit(nodeIndex, parentMatrix, ancestry = new Set()) {
    assert.ok(!ancestry.has(nodeIndex), 'node graph has no cycles');
    const nextAncestry = new Set(ancestry).add(nodeIndex);
    const node = document.nodes[nodeIndex], matrix = Multiply(parentMatrix, NodeMatrix(node));
    assert.ok(matrix.every(Number.isFinite), 'node transform finite');
    if (node.mesh !== undefined) for (const [primitiveIndex, primitive] of document.meshes[node.mesh].primitives.entries()) {
      assert.equal(primitive.mode ?? 4, 4, 'triangle primitive');
      const attributes = primitive.attributes, positions = Get(attributes.POSITION), normals = Get(attributes.NORMAL);
      assert.equal(positions.components, 3); assert.equal(normals.components, 3); assert.equal(normals.count, positions.count);
      const indices = primitive.indices === undefined ? { values: Uint32Array.from({ length: positions.count }, (_, i) => i), count: positions.count } : Get(primitive.indices);
      assert.equal(indices.count % 3, 0, 'complete triangles');
      const world = new Float64Array(positions.count * 3), localMin = [Infinity, Infinity, Infinity], localMax = [-Infinity, -Infinity, -Infinity];
      let normalMin = Infinity, normalMax = 0;
      for (let i = 0; i < positions.count; i++) {
        const offset = i * 3, x = positions.values[offset], y = positions.values[offset + 1], z = positions.values[offset + 2];
        for (let axis = 0; axis < 3; axis++) {
          const value = matrix[axis] * x + matrix[axis + 4] * y + matrix[axis + 8] * z + matrix[axis + 12];
          assert.ok(Number.isFinite(value), 'finite world position'); world[offset + axis] = value;
          boundsMin[axis] = Math.min(boundsMin[axis], value); boundsMax[axis] = Math.max(boundsMax[axis], value);
          localMin[axis] = Math.min(localMin[axis], value); localMax[axis] = Math.max(localMax[axis], value);
        }
        const length = Math.hypot(...normals.values.subarray(offset, offset + 3));
        normalMin = Math.min(normalMin, length); normalMax = Math.max(normalMax, length);
      }
      let degenerateTriangles = 0, minimumCrossLength = Infinity;
      const nearZeroCounts = { '1e-12': 0, '1e-10': 0, '1e-8': 0 };
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.values[i], indices.values[i + 1], indices.values[i + 2]];
        assert.ok(ids.every(index => Number.isInteger(index) && index >= 0 && index < positions.count), 'valid triangle indices');
        const [a, b, c] = ids.map(index => index * 3);
        const ux = world[b] - world[a], uy = world[b + 1] - world[a + 1], uz = world[b + 2] - world[a + 2];
        const vx = world[c] - world[a], vy = world[c + 1] - world[a + 1], vz = world[c + 2] - world[a + 2];
        const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        minimumCrossLength = Math.min(minimumCrossLength, cross);
        if (cross < areaThreshold) degenerateTriangles++;
        for (const threshold of Object.keys(nearZeroCounts)) if (cross < Number(threshold)) nearZeroCounts[threshold]++;
      }
      for (const [name, index] of Object.entries(attributes)) assert.equal(Get(index).count, positions.count, `${name} vertex count`);
      const material = document.materials[primitive.material]; assert.ok(material, 'primitive has material'); materials.add(primitive.material);
      const isBs = bsNodePattern.test(`${node.name ?? ''} ${material.name ?? ''}`);
      let colorRange;
      if (attributes.COLOR_0 !== undefined) {
        const color = Get(attributes.COLOR_0), low = [1, 1, 1], high = [0, 0, 0];
        assert.ok([3, 4].includes(color.components), 'glTF colour is VEC3 or VEC4');
        if (strict) assert.ok(color.values.every(value => value >= 0 && value <= 1.000001), 'glTF colour values are normalized to 0..1');
        for (let i = 0; i < color.count; i++) for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis], color.values[i * color.components + axis]); high[axis] = Math.max(high[axis], color.values[i * color.components + axis]); }
        colorRange = { min: low, max: high };
      }
      const base = TextureInfo(material, 'baseColor'), normal = TextureInfo(material, 'normal');
      if (strict) {
        assert.equal(degenerateTriangles, 0, `${node.name} has zero triangles below unchanged 1e-12 threshold`);
        assert.ok(normalMin > .98 && normalMax < 1.02, `${node.name} has unit normals`);
        assert.ok(attributes.TEXCOORD_0 !== undefined, `${node.name} UV0`);
        if (isBs) {
          assert.ok(attributes.COLOR_0 !== undefined && attributes.TEXCOORD_1 !== undefined, 'BS preserves COLOR_0 and TEXCOORD_1');
          const uv0 = Get(attributes.TEXCOORD_0).values, uv1 = Get(attributes.TEXCOORD_1).values;
          assert.equal(uv0.length, uv1.length, 'two complete BS UV sets');
          assert.ok(uv1.some((value, index) => Math.abs(value - uv0[index]) > .001), 'BS UV1 retains independent authored coordinates');
          assert.ok(colorRange && Math.max(...colorRange.max.map((value, index) => value - colorRange.min[index])) > .05, 'BS COLOR_0 carries nonconstant old low-frequency colour');
          assert.ok(base && normal, 'BS base and normal maps exist');
          assert.equal(base.channel, 1, 'BS base texCoord=1'); assert.equal(normal.channel, 1, 'BS normal texCoord=1');
          Near(base.scale, [.5240554213523865, .5240554213523865], 'BS authored base scale');
          Near(base.offset, [0, .4759445786476135], 'BS authored base offset');
          Near(normal.scale, [1, 1], 'BS authored normal sampling scale'); Near(normal.offset, [0, 0], 'BS authored normal sampling offset');
          assert.ok(Math.abs(normal.normalScale - .5) < 2e-6, 'BS authored normal strength');
          for (const info of [base, normal]) assert.ok(document.textures[info.index].extensions?.EXT_texture_webp, 'BS uses embedded EXT_texture_webp');
        }
      }
      primitives.push({ node: node.name, primitive: primitiveIndex, material: material.name, triangles: indices.count / 3, vertices: positions.count, attributes: Object.keys(attributes), boundsMin: localMin, boundsMax: localMax, degenerateTriangles, minimumCrossLength, nearZeroCounts, normalLengthRange: [normalMin, normalMax], isBs, colorRange, base, normal });
    }
    for (const child of node.children ?? []) Visit(child, matrix, nextAncestry);
  }
  for (const nodeIndex of document.scenes[document.scene ?? 0].nodes) Visit(nodeIndex, Identity());
  assert.ok(primitives.length > 0 && boundsMin.every(Number.isFinite) && boundsMax.every(Number.isFinite), 'renderable finite whole model');
  const imageReports = [];
  for (const [index, image] of (document.images ?? []).entries()) {
    assert.ok(image.uri === undefined && image.bufferView !== undefined, 'each PBR image embedded');
    const view = document.bufferViews[image.bufferView], imageBytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    imageReports.push({ index, name: image.name, mimeType: image.mimeType, bytes: imageBytes.length, sha256: Hash(imageBytes) });
  }
  if (strict) { assert.ok(primitives.some(item => item.isBs), `BS identified by /${bsNodeExpression}/`); assert.ok(imageReports.length >= 2, 'embedded PBR images'); }
  return { file: path.relative(repositoryRoot, file).replaceAll('\\', '/'), sha256: Hash(bytes), binarySha256: Hash(binary), bytes: bytes.length, triangles: primitives.reduce((sum, item) => sum + item.triangles, 0), drawPrimitives: primitives.length, materials: materials.size, boundsMin, boundsMax, dimensions: boundsMax.map((value, index) => value - boundsMin[index]), areaThreshold, degenerateTriangles: primitives.reduce((sum, item) => sum + item.degenerateTriangles, 0), images: imageReports, extensionsUsed: document.extensionsUsed ?? [], primitives };
}

// Serialized into the ignored review page; runs with the real Three.js and loader.
async function BrowserMain() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#c5cbd0');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .005, 100);
  scene.add(new THREE.HemisphereLight(0xe2ecf4, 0x847b6a, 2.1));
  const sun = new THREE.DirectionalLight(0xffefda, 3); sun.position.set(4, 7, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .5, far: 14 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = .00012; sun.shadow.normalBias = .003; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd9e9ff, .65); fill.position.set(-3, 2, -4); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: .94 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = BedConfig.boundsMin[1] - .003; floor.receiveShadow = true; scene.add(floor);
  const sharedBox = new THREE.Box3(new THREE.Vector3(...BedConfig.boundsMin), new THREE.Vector3(...BedConfig.boundsMax));
  const center = sharedBox.getCenter(new THREE.Vector3()), size = sharedBox.getSize(new THREE.Vector3());
  const target = center.clone(), cache = new Map(); let model, asset, currentView, dragging, interactionCount = 0;
  function Render() { camera.lookAt(target); renderer.render(scene, camera); }
  function Fit(direction) {
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize(); let distance = 0;
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      const offset = new THREE.Vector3(size.x * x, size.y * y, size.z * z);
      distance = Math.max(distance, offset.dot(direction) + Math.abs(offset.dot(up)) / tangent, offset.dot(direction) + Math.abs(offset.dot(right)) / (tangent * camera.aspect));
    }
    return distance * 1.17;
  }
  function SetView(view) {
    const directions = { Front: [1.2, .9, 1.3], Back: [-1.2, .85, -1.3], Top: [.05, 2.5, .05], Quilt: [.3, 1.2, 1.1], FootCloth: [1.3, .55, .8], Frame: [1.1, .5, -1.3], Support: [.4, .1, 1.2], FrameJoin: [1.15, .85, -1.3], ClothDetail: [.15,1.3,1.0] };
    const direction = new THREE.Vector3(...directions[view]).normalize(); target.copy(center); let distance = Fit(direction);
    if (['Quilt', 'FootCloth', 'Frame', 'Support', 'FrameJoin','ClothDetail'].includes(view)) {
      if (view === 'Quilt') { target.y = sharedBox.min.y + size.y * .75; distance = size.length() * .47; }
      if (view === 'FootCloth') { target.x = sharedBox.max.x - size.x * .12; target.y = sharedBox.min.y + size.y * .54; distance = size.length() * .39; }
      if (view === 'Frame') { target.x = sharedBox.min.x + size.x * .17; target.y = sharedBox.min.y + size.y * .36; distance = size.length() * .44; }
      if (view === 'Support') { target.y = sharedBox.min.y + size.y * .36; distance = size.length() * .47; }
      if (view === 'ClothDetail') { target.x=-.12; target.y=sharedBox.min.y+size.y*.76; target.z=.13; distance=size.length()*.27; }
      if (view === 'FrameJoin') {
        // Shared bounds keep both assets at one camera: exposed foot-post cap,
        // outside corner silhouette and the adjoining long/end rails.
        target.set(sharedBox.max.x - size.x * .085, sharedBox.min.y + size.y * .685, sharedBox.min.z + size.z * .045);
        distance = size.length() * .20;
      }
    }
    camera.position.copy(target).addScaledVector(direction, distance); camera.updateProjectionMatrix(); currentView = view; Render();
  }
  function Snapshot() {
    Render(); const displayed = { ...renderer.info.render };
    const floorWasVisible = floor.visible, shadowsWereEnabled = renderer.shadowMap.enabled;
    floor.visible = false; renderer.shadowMap.enabled = false; Render(); const modelOnly = { ...renderer.info.render };
    const background = scene.background; scene.background = null;
    const renderTarget = new THREE.WebGLRenderTarget(256, 144); renderer.setRenderTarget(renderTarget); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
    const pixels = new Uint8Array(256 * 144 * 4); renderer.readRenderTargetPixels(renderTarget, 0, 0, 256, 144, pixels);
    let occupied = 0, black = 0, low = 255, high = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) if (pixels[offset + 3] > 32) { occupied++; const value = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3; if (value < 4) black++; low = Math.min(low, value); high = Math.max(high, value); }
    renderer.setRenderTarget(null); renderTarget.dispose(); scene.background = background;
    floor.visible = floorWasVisible; renderer.shadowMap.enabled = shadowsWereEnabled; Render();
    return { asset, view: currentView, cameraPosition: camera.position.toArray(), cameraTarget: target.toArray(), cameraDistance: camera.position.distanceTo(target), interactionCount, displayed, modelOnly, pixels: { occupied, black, low, high }, programs: renderer.info.programs.length, webglVersion: renderer.getContext().getParameter(renderer.getContext().VERSION) };
  }
  async function Load(name) {
    BedReview.ready = false; if (model) scene.remove(model); asset = name;
    document.querySelector('#status').textContent = '加载真实 GLB 与内嵌贴图…';
    if (!cache.has(name)) {
      const transfer = { loaded: 0, total: 0 };
      const gltf = await new ManagedGLTFLoader().loadAsync(BedConfig.files[name], event => { transfer.loaded = event.loaded; transfer.total = event.total; });
      const binary = await gltf.parser.getDependency('buffer', 0);
      const digest = await crypto.subtle.digest('SHA-256', binary);
      const binarySha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      cache.set(name, { scene: gltf.scene, integrity: { binarySha256, binaryBytes: binary.byteLength, transfer } });
    }
    model = cache.get(name).scene; scene.add(model); model.updateMatrixWorld(true);
    const materials = new Set(), meshReports = []; let triangles = 0;
    model.traverse(object => {
      if (!object.isMesh) return; object.castShadow = true; object.receiveShadow = true;
      const geometry = object.geometry; triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        materials.add(material);
        const textureReports = {};
        for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
          const texture = material[slot]; if (!texture) continue;
          textureReports[slot] = { width: texture.image?.width, height: texture.image?.height, colorSpace: texture.colorSpace, channel: texture.channel, repeat: texture.repeat.toArray(), offset: texture.offset.toArray(), rotation: texture.rotation };
        }
        meshReports.push({ node: object.name, material: material.name, vertexColors: material.vertexColors, normalScale: material.normalScale?.toArray(), attributes: Object.keys(geometry.attributes), textures: textureReports, isBs: new RegExp(BedConfig.bsNodeExpression, 'i').test(`${object.name} ${material.name}`) });
      }
    });
    const bounds = new THREE.Box3().setFromObject(model);
    BedReview.stats = { asset, integrity: cache.get(name).integrity, triangles, materials: materials.size, meshes: meshReports.length, boundsMin: bounds.min.toArray(), boundsMax: bounds.max.toArray(), dimensions: bounds.getSize(new THREE.Vector3()).toArray(), meshReports };
    SetView('Front'); BedReview.ready = true; document.querySelector('#asset').value = name;
    document.querySelector('#status').textContent = `${name === 'Final' ? '最终完整游戏版' : BedConfig.originalLabel} · ${triangles.toLocaleString()} 三角 · ${meshReports.length} primitive · ${materials.size} 材质`;
    return BedReview.stats;
  }
  function Fail(error) { BedReview.error = error.stack ?? error.message; document.querySelector('#status').textContent = BedReview.error; console.error(error); }
  window.BedReview = { Load, SetView, Snapshot, ready: false };
  document.querySelector('#asset').addEventListener('change', event => Load(event.target.value).catch(Fail));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => SetView(button.dataset.view)));
  renderer.domElement.addEventListener('pointerdown', event => { dragging = [event.clientX, event.clientY]; renderer.domElement.setPointerCapture(event.pointerId); });
  renderer.domElement.addEventListener('pointerup', () => { dragging = null; });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!dragging || !model) return;
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    spherical.theta -= (event.clientX - dragging[0]) * .007; spherical.phi = Math.max(.06, Math.min(Math.PI - .06, spherical.phi + (event.clientY - dragging[1]) * .007));
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical)); dragging = [event.clientX, event.clientY]; interactionCount++; Render();
  });
  renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); camera.position.sub(target).multiplyScalar(Math.exp(event.deltaY * .001)).add(target); interactionCount++; Render(); }, { passive: false });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); Render(); });
  Load('Final').catch(Fail);
}

async function WriteReviewPage(finalReport, originalReport) {
  function Url(file) { const relative = path.relative(repositoryRoot, file); assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'review file inside this worktree'); return `/${relative.replaceAll('\\', '/')}`; }
  const boundsMin = finalReport.boundsMin.map((value, index) => Math.min(value, originalReport?.boundsMin[index] ?? value));
  const boundsMax = finalReport.boundsMax.map((value, index) => Math.max(value, originalReport?.boundsMax[index] ?? value));
  const config = { files: { Final: Url(finalFile), ...(originalReport ? { Original: Url(originalFile) } : {}) }, boundsMin, boundsMax, bsNodeExpression, originalLabel };
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patched timber bed · local acceptance</title>
<style>html,body{margin:0;overflow:hidden;background:#c5cbd0;font:14px system-ui}canvas{display:block;touch-action:none}header{position:absolute;inset:12px 12px auto;display:flex;gap:6px;align-items:center;z-index:2;padding:8px;background:#ffffffdf;border-radius:8px}select,button{font:inherit;padding:5px 9px}#status{margin-left:8px;font-size:12px}</style>
<header><select id="asset"><option value="Final">最终完整游戏版</option>${originalReport ? `<option value="Original">${originalLabel.replaceAll('&','&amp;').replaceAll('<','&lt;')}</option>` : ''}</select>${[['Front','斜前'],['Back','背面'],['Top','俯视'],['Quilt','棉被'],['FootCloth','脚端布料'],['Frame','床架'],['Support','支撑草席'],['FrameJoin','接头端纹'],['ClothDetail','布面近景']].map(([key,label]) => `<button data-view="${key}">${label}</button>`).join('')}<span id="status">加载中…</span></header>
<script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js"}}</script><script type="module">import * as THREE from 'three';import {ManagedGLTFLoader} from '/Taierzhuang1938/Script_ModelImports.mjs';const BedConfig=${JSON.stringify(config)};(${BrowserMain.toString()})();</script></html>`;
  await fs.writeFile(path.join(outputRoot, 'index.html'), html);
}
async function BrowserReview(finalReport, originalReport) {
  await WriteReviewPage(finalReport, originalReport);
  let server, browser;
  const consoleErrors = [], failedRequests = [], frames = [], results = [];
  try {
    const origin = Option('url', '');
    if (!origin) server = await ServeRoot(repositoryRoot, 0);
    const base = origin || `http://127.0.0.1:${server.address().port}`;
    browser = await LaunchBrowser({ extraArgs: ['--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    async function Capture(name) {
      const fullFile = path.join(outputRoot, `Preview_${name}_Original.png`);
      const bytes = await page.screenshot({ path: fullFile });
      // Resize the saved image in a detached canvas, preserving the verified viewport.
      const thumbnail = await page.evaluate(async encoded => {
        const picture = new Image(); picture.src = `data:image/png;base64,${encoded}`; await picture.decode();
        const ratio = Math.min(1, 640 / Math.max(picture.naturalWidth, picture.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(picture.naturalWidth * ratio); canvas.height = Math.round(picture.naturalHeight * ratio);
        canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', .82).split(',')[1];
      }, bytes.toString('base64'));
      await fs.writeFile(path.join(outputRoot, `Preview_${name}.jpg`), Buffer.from(thumbnail, 'base64'));
    }
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType(), timing: request.timing(), failure: request.failure() }));
    page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
    await page.goto(`${base}/${path.relative(repositoryRoot, outputRoot).replaceAll('\\', '/')}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.BedReview?.ready || window.BedReview?.error, undefined, { timeout: 180000 });
    assert.ok(await page.evaluate(() => BedReview.ready), await page.evaluate(() => BedReview.error));
    for (const name of originalReport ? ['Original', 'Final'] : ['Final']) {
      await page.selectOption('#asset', name);
      await page.waitForFunction(asset => BedReview.ready && BedReview.stats.asset === asset, name, { timeout: 180000 });
      const stats = await page.evaluate(() => BedReview.stats), reference = name === 'Final' ? finalReport : originalReport;
      assert.equal(stats.integrity.binarySha256, reference.binarySha256, 'real loader parsed the exact independently audited GLB binary');
      assert.equal(stats.integrity.transfer.loaded, reference.bytes, 'real loader received every GLB byte');
      assert.equal(stats.triangles, reference.triangles, 'GPU-loaded triangle count matches independent decode');
      Near(stats.boundsMin, reference.boundsMin, 'loader boundsMin', 3e-5); Near(stats.boundsMax, reference.boundsMax, 'loader boundsMax', 3e-5);
      for (const mesh of stats.meshReports) {
        for (const [slot, texture] of Object.entries(mesh.textures)) {
          assert.ok(texture.width > 0 && texture.height > 0, `${mesh.node} ${slot}: real decoded texture image`);
          assert.equal(texture.colorSpace, slot === 'map' ? 'srgb' : '', `${slot} color space`);
        }
        if (name === 'Final' && mesh.isBs) {
          assert.ok(mesh.vertexColors && mesh.attributes.includes('color') && mesh.attributes.includes('uv1'), 'BS runtime colour and second UV retained');
          const base = mesh.textures.map, normal = mesh.textures.normalMap;
          assert.equal(base.channel, 1); assert.equal(normal.channel, 1);
          Near(base.repeat, [.5240554213523865, .5240554213523865], 'runtime BS base scale'); Near(base.offset, [0, .4759445786476135], 'runtime BS base offset');
          Near(normal.repeat, [1, 1], 'runtime BS normal scale'); Near(normal.offset, [0, 0], 'runtime BS normal offset');
        }
      }
      for (const view of ['Front', 'Back', 'Top', 'Quilt', 'FootCloth', 'Frame', 'Support', 'FrameJoin', 'ClothDetail']) {
        await page.locator(`[data-view="${view}"]`).click();
        const frame = await page.evaluate(() => BedReview.Snapshot());
        assert.ok(frame.pixels.occupied > 300, `${name} ${view} draws visible model pixels`);
        assert.ok(frame.pixels.high - frame.pixels.low > 8 && frame.pixels.black < frame.pixels.occupied * .8, `${name} ${view} textured lit output`);
        assert.ok(frame.modelOnly.calls > 0 && frame.modelOnly.triangles > 0, 'actual WebGL draw calls and triangles');
        await Capture(`${name}_${view}`);
        frames.push(frame);
      }
      await page.locator('[data-view="Front"]').click();
      const before = await page.evaluate(() => BedReview.Snapshot());
      await page.mouse.move(570, 420); await page.mouse.down(); await page.mouse.move(830, 470, { steps: 12 }); await page.mouse.up();
      const afterOrbit = await page.evaluate(() => BedReview.Snapshot());
      assert.ok(afterOrbit.cameraPosition.some((value, index) => Math.abs(value - before.cameraPosition[index]) > .1), 'pointer drag actually orbits camera');
      await page.mouse.wheel(0, -150);
      await page.waitForFunction(distance => BedReview.Snapshot().cameraDistance < distance * .95, afterOrbit.cameraDistance);
      const afterZoom = await page.evaluate(() => BedReview.Snapshot());
      assert.ok(afterZoom.interactionCount >= 2 && afterZoom.pixels.occupied > 300, 'wheel zoom and orbit retain displayed model');
      await Capture(`${name}_Orbit`);
      results.push({ stats, interaction: { before, afterOrbit, afterZoom } });
    }
    // Chromium can report ERR_ABORTED after FileLoader's ReadableStream has fully
    // completed. Only classify it as transport telemetry when the successful real
    // loader proves all expected bytes and the exact independent binary SHA-256.
    const completedTransferTelemetry = failedRequests.filter(item => item.failure?.errorText === 'net::ERR_ABORTED' && results.some(result => {
      const reference = result.stats.asset === 'Final' ? finalReport : originalReport;
      return new URL(item.url).pathname === `/${reference.file}` && result.stats.integrity.transfer.loaded === reference.bytes && result.stats.integrity.binarySha256 === reference.binarySha256;
    }));
    const unresolvedFailures = failedRequests.filter(item => !completedTransferTelemetry.includes(item));
    const report = { result: consoleErrors.length || unresolvedFailures.length ? 'FAIL' : 'PASS', actualManagedGLTFLoader: true, actualTextureDecodeAndWebGL: true, exactRuntimeBinarySha256Verified: true, viewport: [1280, 720], observationLongEdge: 640, sameLightAndCommonCameraBounds: true, originalRepresentation: originalReport ? originalLabel : null, results, frames, consoleErrors, failedRequests: unresolvedFailures, completedTransferTelemetry, note: 'Automated pixels and geometry checks complement human inspection; they do not prove absence of every surface intersection. A vertex-colour converted baseline approximates original source materials; the same-light original Blender renders remain the source-material fidelity reference.' };
    await fs.writeFile(path.join(outputRoot, 'Data_BrowserReview.json'), `${JSON.stringify(report, null, 2)}\n`);
    assert.deepEqual(consoleErrors, [], 'zero browser/WebGL console errors'); assert.deepEqual(unresolvedFailures, [], 'zero unresolved failed asset requests');
    return report;
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}

async function Main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const finalReport = await Inspect(finalFile, true);
  for (const component of ['Quilt', 'Pillow', 'Sewing', 'Frame', 'Straw']) {
    assert.ok(finalReport.primitives.some(item => new RegExp(component, 'i').test(`${item.node} ${item.material}`)), `complete bed includes ${component}`);
  }
  assert.ok(finalReport.dimensions[0] > 2 && finalReport.dimensions[1] > .7 && finalReport.dimensions[2] > .9, 'complete bed retains metre-scale long X / up Y / width Z dimensions');
  assert.ok(Math.abs(finalReport.boundsMin[1]) < 1e-4, 'whole bed floor pivot Y=0');
  assert.ok(Math.abs(finalReport.boundsMin[0] + finalReport.boundsMax[0]) < 2e-4 && Math.abs(finalReport.boundsMin[2] + finalReport.boundsMax[2]) < 2e-4, 'whole-bed XZ bounds-centre pivot');
  const originalReport = compare ? await Inspect(originalFile, false) : null;
  let contract = null; try { contract = JSON.parse(await fs.readFile(contractFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const record = contract?.models?.find(item => item.file === path.basename(finalFile)) ?? contract?.model ?? contract;
  const triangleLimit = Math.min(60000, Number(Option('max-triangles', record?.triangleLimit ?? record?.triangleBudget ?? contract?.performance?.triangleLimit ?? 60000)));
  const drawLimit = Number(Option('max-draws', record?.drawPrimitiveLimit ?? record?.drawCallBudget ?? contract?.performance?.drawPrimitiveLimit ?? 0));
  if (triangleLimit) assert.ok(finalReport.triangles <= triangleLimit, `triangle budget ${triangleLimit}`);
  if (drawLimit) assert.ok(finalReport.drawPrimitives <= drawLimit, `draw primitive budget ${drawLimit}`);
  if (record?.triangles !== undefined) assert.equal(finalReport.triangles, record.triangles, 'asset contract exact triangles');
  if (record?.boundsMin) Near(finalReport.boundsMin, record.boundsMin, 'asset contract boundsMin', 3e-5);
  if (record?.boundsMax) Near(finalReport.boundsMax, record.boundsMax, 'asset contract boundsMax', 3e-5);
  const structural = { result: 'PASS', final: finalReport, ...(originalReport ? { original: originalReport, triangleReduction: 1 - finalReport.triangles / originalReport.triangles, primitiveReduction: 1 - finalReport.drawPrimitives / originalReport.drawPrimitives } : {}), budget: { triangleLimit: triangleLimit || null, drawPrimitiveLimit: drawLimit || null } };
  await fs.writeFile(path.join(outputRoot, 'Data_StructuralReview.json'), `${JSON.stringify(structural, null, 2)}\n`);
  if (!argumentsList.includes('--structural-only')) await BrowserReview(finalReport, originalReport);
  await fs.rm(path.join(outputRoot, 'Data_TestFailure.json'), { force: true });
  console.log(JSON.stringify({ result: 'PASS', triangles: finalReport.triangles, drawPrimitives: finalReport.drawPrimitives, materials: finalReport.materials, dimensions: finalReport.dimensions, degenerateTriangles: finalReport.degenerateTriangles, browser: !argumentsList.includes('--structural-only'), comparison: compare, outputRoot }, null, 2));
}
Main().catch(async error => { await fs.mkdir(outputRoot, { recursive: true }); await fs.writeFile(path.join(outputRoot, 'Data_TestFailure.json'), JSON.stringify({ result: 'FAIL', error: error.stack }, null, 2)); console.error(error.stack); process.exitCode = 1; });
