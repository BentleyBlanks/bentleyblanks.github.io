// 头发 / 胡子的运行时（docs/Data_HairSystem.md §4–§6）：读 Hair/Grooms/Groom_<id>.bin，建三档几何，按屏幕大小切档。
//
//   const asset = await LoadHairGroom('./Hair/Grooms/Groom_Luo_Cast.bin');
//   const atlas = await LoadHairAtlas('./Hair/Textures/Texture_HairCardAtlas.png');
//   const groom = new HairGroom(asset, { atlas, lightRig });
//   headMesh.add(groom.root);                // 头发坐标 = 头部模型坐标（游戏里挂头骨，见 docs §7）
//   每帧：groom.Update(dt, camera, renderer);   // 在出画之前（预通道和主场景用同一个帧号、同一档）
//
// 一套实例自己一份材质与几何外壳（属性共享），同一份资产可以同时摆好几份、各自一档（实验室的三档对比就是这样）。
// 材质都不走预通道覆盖材质：网格挂 userData.ownPrepass = 自己那份预通道材质（Script_PostPrepass 的「自带预通道」路）。
import * as THREE from 'three';
import { MakeHairSharedUniforms, MakeStrandMaterials, MakeCardMaterials, MakeShellMaterials, MakeStubbleMaterial, MakeScalpTintMaterial } from './Script_HairMaterials.mjs';
import { MarkNoPrepass } from './Script_PostPrepass.mjs';
import { HAIR_LOD, HAIR_ASSET_VERSION } from './Data_Tuning_Hair.mjs';

export function HairAssetUrl(url) { return `${url}${url.includes('?') ? '&' : '?'}v=${HAIR_ASSET_VERSION}`; }

export const HAIR_LODS = Object.freeze(['strands', 'cards', 'shell', 'none']);

const ARRAY_TYPES = { Float32Array, Uint16Array, Uint32Array, Uint8Array, Int8Array };
const referenceAtlases = new WeakMap();
const beardLuminanceAtlases = new WeakMap();

// 量化段解回 float（Script_HairGroomBuild 的 MeshSections）
function Dequantize(raw, q) {
  const out = new Float32Array(raw.length);
  if (q.kind === 'range') {
    for (let i = 0; i < raw.length; i++) { const k = i % q.comps; out[i] = q.min[k] + (raw[i] / 65535) * (q.max[k] - q.min[k]); }
  } else if (q.kind === 'snorm') {
    for (let i = 0; i < raw.length; i++) out[i] = Math.max(-1, raw[i] / 127);
  } else {
    const max = raw instanceof Uint16Array ? 65535 : 255;
    for (let i = 0; i < raw.length; i++) out[i] = (raw[i] / max) * (q.scales ? q.scales[i % q.comps] : 1);
  }
  return out;
}

/** 发片图集（所有发型共用一张）。flipY 关：builder 的 v 从图片第一行算起。 */
export async function LoadHairAtlas(url) {
  const loader = new THREE.TextureLoader();
  const referenceUrl = new URL('Texture_HairReferenceMasks.png', new URL(url, document.baseURI)).href;
  const luminanceUrl = new URL('Texture_HairReferenceBeardLuminance.png', new URL(url, document.baseURI)).href;
  const loaded = await Promise.allSettled([loader.loadAsync(HairAssetUrl(url)), loader.loadAsync(HairAssetUrl(referenceUrl)), loader.loadAsync(HairAssetUrl(luminanceUrl))]);
  const failure = loaded.find(result => result.status === 'rejected');
  if (failure) {
    for (const result of loaded) if (result.status === 'fulfilled') result.value.dispose();
    throw failure.reason;
  }
  const [texture, reference, luminance] = loaded.map(result => result.value);
  for (const atlas of [texture, reference, luminance]) {
    atlas.flipY = false;
    atlas.colorSpace = THREE.NoColorSpace;
    atlas.anisotropy = 8;
    atlas.generateMipmaps = true;
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.needsUpdate = true;
  }
  referenceAtlases.set(texture, reference);
  beardLuminanceAtlases.set(texture, luminance);
  const ReleaseReference = () => {
    texture.removeEventListener('dispose', ReleaseReference);
    referenceAtlases.delete(texture);
    beardLuminanceAtlases.delete(texture);
    reference.dispose();
    luminance.dispose();
  };
  texture.addEventListener('dispose', ReleaseReference);
  return texture;
}

function EmptyDensity() {
  const tex = new THREE.Data3DTexture(new Uint8Array(1), 1, 1, 1);
  tex.format = THREE.RedFormat; tex.needsUpdate = true;
  return { texture: tex, min: new THREE.Vector3(), invSize: new THREE.Vector3(1, 1, 1), step: 0.01, extinction: 0 };
}

function MeshGeometry(sec, prefix, withUv = true) {
  const pos = sec(`${prefix}Pos`);
  if (!pos || !pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nrm = sec(`${prefix}Nrm`); if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const tan = sec(`${prefix}Tan`); if (tan) g.setAttribute('aTangent', new THREE.BufferAttribute(tan, 3));
  const uv = withUv && sec(`${prefix}Uv`); if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const data = sec(`${prefix}Data`);
  if (data) g.setAttribute('aData', new THREE.BufferAttribute(data, data.length / (pos.length / 3)));
  const boneIndices = sec(`${prefix}BoneIndices`), boneWeights = sec(`${prefix}BoneWeights`);
  if (boneIndices && boneWeights) {
    g.setAttribute('aBoneIndices', new THREE.BufferAttribute(boneIndices, 4));
    g.setAttribute('aBoneWeights', new THREE.BufferAttribute(boneWeights, 4));
  }
  g.setIndex(new THREE.BufferAttribute(sec(`${prefix}Index`), 1));
  g.computeBoundingSphere();
  return g;
}

/** 读一套头发（.bin）。返回的几何、贴图归资产所有，HairGroom 实例只借用。 */
export async function LoadHairGroom(url) {
  const response = await fetch(HairAssetUrl(url));
  if (!response.ok) throw new Error(`HairGroom: ${url} ${response.status}`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) throw new Error(`HairGroom: truncated ${url}`);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'TXHR') throw new Error(`HairGroom: ${url} 不是头发文件`);
  if (view.getUint32(4, true) !== 1) throw new Error(`HairGroom: unsupported version ${url}`);
  const jsonLength = view.getUint32(8, true);
  if (jsonLength > buffer.byteLength - 12 || (12 + jsonLength) % 4) throw new Error(`HairGroom: invalid header ${url}`);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, jsonLength)));
  const base = 12 + jsonLength;
  const sec = (name) => {
    const m = header.sections[name];
    if (!m) return null;
    const Ctor = ARRAY_TYPES[m.type];
    if (!Ctor || m.offset < 0 || m.count < 0 || base + m.offset + m.count * Ctor.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error(`HairGroom: invalid section ${name}`);
    const raw = new Ctor(buffer, base + m.offset, m.count);
    return m.quant ? Dequantize(raw, m.quant) : raw;
  };
  const asset = { url, header, id: header.id, head: header.head, hair: null, beard: null, bytes: buffer.byteLength };
  if (header.hair) {
    const H = header.hair, K = H.points, G = H.guides, S = H.strands;
    const guideTexture = new THREE.DataTexture(sec('hairGuides'), K, G, THREE.RGBAFormat, THREE.FloatType);
    guideTexture.minFilter = guideTexture.magFilter = THREE.NearestFilter;
    guideTexture.needsUpdate = true;
    // 一根发丝的带子：P 个点 × 两侧
    const curly = H.render.curl[0] > 0 || H.render.frizz > 0.3;
    const P = Math.min(32, curly ? K * 2 : K + 2);
    const vert = new Float32Array(P * 2 * 2), index = [];
    for (let i = 0; i < P; i++) for (let side = 0; side < 2; side++) { vert[(i * 2 + side) * 2] = i / (P - 1); vert[(i * 2 + side) * 2 + 1] = side ? 1 : -1; }
    for (let i = 0; i < P - 1; i++) { const a = 2 * i; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const strandGuides = Float32Array.from(sec('hairStrandGuides'));
    const bary = sec('hairStrandBary'), baryF = new Float32Array(bary.length);
    for (let i = 0; i < bary.length; i++) baryF[i] = (bary[i] / 65535) * 2 - 0.5;
    const seed = sec('hairStrandSeed'), seedF = new Float32Array(seed.length);
    for (let i = 0; i < seed.length; i++) seedF[i] = seed[i] / 255;
    const strandAttributes = {
      aVert: new THREE.BufferAttribute(vert, 2),
      aGuides: new THREE.InstancedBufferAttribute(strandGuides, 3),
      aBary: new THREE.InstancedBufferAttribute(baryF, 2),
      aSeed: new THREE.InstancedBufferAttribute(seedF, 2),
      index: new THREE.BufferAttribute(new Uint16Array(index), 1),
    };
    const min = new THREE.Vector3().fromArray(H.bounds.min), max = new THREE.Vector3().fromArray(H.bounds.max);
    const sphere = new THREE.Sphere(); new THREE.Box3(min, max).getBoundingSphere(sphere);
    sphere.radius += H.render.length * 0.25 + 0.01;
    // 消光体素
    const [nx, ny, nz] = H.density.res;
    const densityTexture = new THREE.Data3DTexture(sec('hairDensity'), nx, ny, nz);
    densityTexture.format = THREE.RedFormat;
    densityTexture.minFilter = densityTexture.magFilter = THREE.LinearFilter;
    densityTexture.wrapS = densityTexture.wrapT = densityTexture.wrapR = THREE.ClampToEdgeWrapping;
    densityTexture.unpackAlignment = 1;
    densityTexture.needsUpdate = true;
    const vox = H.density.voxel;
    const density = {
      texture: densityTexture, min: new THREE.Vector3().fromArray(H.density.min),
      invSize: new THREE.Vector3(1 / (nx * vox), 1 / (ny * vox), 1 / (nz * vox)), step: vox * 1.1, extinction: H.density.extinctionMax,
    };
    asset.hair = {
      header: H, points: K, guides: G, strands: S, renderPoints: P, render: H.render, family: H.family, name: H.name,
      guideTexture, strandAttributes, sphere, density, shellOpacity: H.shell.opacity ?? 1,
      cardGeometry: MeshGeometry(sec, 'hairCard'), shellGeometry: MeshGeometry(sec, 'hairShell', false),
      braidGeometry: MeshGeometry(sec, 'hairBraid', false),
      scalpGeometry: MeshGeometry(sec, 'hairScalp', !!H.referenceScalp), scalpTint: H.scalp?.tint ?? 0.6,
      referenceScalp: H.referenceScalp || null,
    };
  }
  if (header.beard) {
    const B = header.beard;
    asset.beard = {
      header: B, name: B.name, render: B.render, stubble: B.stubble,
      referenceMask: B.referenceMask ? {...B.referenceMask, center: [header.portrait.center[0], header.portrait.center[2]], chinY: header.portrait.center[1] - header.portrait.height * .5} : null,
      density: EmptyDensity(),
      cardGeometry: MeshGeometry(sec, 'beardCard'), stubbleGeometry: MeshGeometry(sec, 'beardStubble', !!B.referenceMask),
    };
  }
  return asset;
}

/** 资产的 GPU 资源统一在这里收（实例不收共享的属性与贴图）。 */
export function DisposeHairGroomAsset(asset) {
  if (!asset || asset.disposed) return;
  asset.disposed = true;
  const h = asset.hair, b = asset.beard;
  h?.guideTexture.dispose(); h?.density.texture.dispose(); h?.cardGeometry?.dispose(); h?.shellGeometry?.dispose(); h?.braidGeometry?.dispose(); h?.scalpGeometry?.dispose();
  b?.cardGeometry?.dispose(); b?.stubbleGeometry?.dispose();
  b?.density.texture.dispose();
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Sphere(), _sun = new THREE.Vector3();
const shadowSyncFrames = new WeakMap();

export class HairGroom {
  /**
   * @param asset   LoadHairGroom 的结果
   * @param opts    { atlas, lightRig, name, lod: 'auto' | 'strands' | 'cards' | 'shell' | 'none', beard: true, boneRoot }
   */
  constructor(asset, { atlas, lightRig = null, name = asset.id, lod = 'auto', beard = true, boneRoot = null } = {}) {
    this.asset = asset; this.lightRig = lightRig; this.force = lod; this.showBeard = beard;
    this.showHair = true; this.disposed = false;
    this.root = new THREE.Group(); this.root.name = `Hair_${name}`;
    // 游戏人物的头发（文件头有 attach）：头发坐标是实验室光头的米制坐标，attach 把它摆到头骨局部（含模型缩放）
    if (asset.header.attach) {
      this.root.matrixAutoUpdate = false;
      this.root.matrix.fromArray(asset.header.attach);
      this.root.matrix.decompose(this.root.position, this.root.quaternion, this.root.scale);
    }
    const MakeSkin = (binding, label) => {
      if (!binding) return null;
      if (!boneRoot) throw new Error(`${asset.id}: ${label} needs the animated skeleton`);
      const bones = binding.bones.map(name => boneRoot.getObjectByName(name));
      if (bones.some(bone => !bone?.isBone) || bones.length > 8) throw new Error(`${asset.id}: ${label} skeleton does not match the baked asset`);
      return { bones, attach: binding.attach.map(matrix => new THREE.Matrix4().fromArray(matrix)), ready: false,
        uniforms: { uBeardBones: { value: Array.from({ length: 8 }, () => new THREE.Matrix4()) },
          uPrevBeardBones: { value: Array.from({ length: 8 }, () => new THREE.Matrix4()) } } };
    };
    this.beardSkin = MakeSkin(asset.beard?.header.skinning, 'beard');
    this.braidSkin = MakeSkin(asset.hair?.header.braid?.skinning, 'braid');
    this.shared = MakeHairSharedUniforms();
    this.materials = []; this.meshes = {}; this.ownGeometries = [];
    this.current = null; this.previous = null; this.fade = 1;
    this.screenPx = 0; this.strandFraction = 1;
    this.stats = { lod: 'none', strandsDrawn: 0, screenPx: 0 };
    const h = asset.hair;
    this.shortGameUnderlay = !!asset.header.model && (h?.family === 'Short' || h?.family === 'Medium');
    if (h) {
      const sg = new THREE.InstancedBufferGeometry();
      for (const [name, attr] of Object.entries(h.strandAttributes)) if (name === 'index') sg.setIndex(attr); else sg.setAttribute(name, attr);
      sg.instanceCount = h.strands;
      sg.boundingSphere = h.sphere.clone();
      this.ownGeometries.push(sg);
      const strand = MakeStrandMaterials(h, this.shared, lightRig, referenceAtlases.get(atlas));
      this.strandUniforms = strand.own;
      this.meshes.strands = this.Mesh(sg, strand, 'Strands');
      if (h.cardGeometry) this.meshes.cards = this.Mesh(h.cardGeometry, MakeCardMaterials(h, atlas, this.shared, lightRig, h.density, referenceAtlases.get(atlas)), 'Cards');
      if (h.shellGeometry) this.meshes.shell = this.Mesh(h.shellGeometry, MakeShellMaterials(h, this.shared, lightRig), 'Shell');
      this.cardBaseAlpha = this.meshes.cards?.userData.hairUniforms.uAlphaScale.value;
      if (h.braidGeometry) {
        const braidLook = { ...h, render: { ...h.render, color: h.header.braid.color, roughness: .55, specular: .25, scatter: .25 } };
        this.meshes.braid = this.Mesh(h.braidGeometry, MakeShellMaterials(braidLook, this.shared, lightRig, this.braidSkin?.uniforms), 'Braid');
      }
      if (h.scalpGeometry) this.meshes.scalp = this.Overlay(h.scalpGeometry, MakeScalpTintMaterial(h, referenceAtlases.get(atlas), lightRig), 'ScalpTint', 1);
    }
    const b = asset.beard;
    if (b) {
      if (b.cardGeometry) this.meshes.beardCards = this.Mesh(b.cardGeometry, MakeCardMaterials(b, atlas, this.shared, lightRig, b.density, null, this.beardSkin?.uniforms), 'BeardCards');
      if (b.stubbleGeometry) this.meshes.stubble = this.Overlay(b.stubbleGeometry, MakeStubbleMaterial(b, this.shared, referenceAtlases.get(atlas), lightRig, beardLuminanceAtlases.get(atlas), this.beardSkin?.uniforms), 'Stubble', 2);
    }
    for (const material of this.materials) if (material.uniforms.uMelanin) material.userData.hairBaseMelanin = material.uniforms.uMelanin.value;
    for (const mesh of Object.values(this.meshes)) mesh.visible = false;
  }
  Mesh(geometry, mats, label) {
    const mesh = new THREE.Mesh(geometry, mats.main);
    mesh.name = `Hair${label}`;
    mesh.userData.ownPrepass = mats.prepass;
    mesh.userData.hairGroom = true;
    mesh.userData.hairUniforms = mats.own;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.onBeforeRender = (renderer, scene, camera, geo, material) => this.BeforeRender(renderer, camera, material);
    this.materials.push(mats.main, mats.prepass);
    this.root.add(mesh);
    return mesh;
  }
  // 贴在皮肤上的半透明层（头皮染色、胡茬）：不进预通道，深度跟着皮肤
  Overlay(geometry, mats, label, order) {
    MarkNoPrepass(mats.main);
    const mesh = new THREE.Mesh(geometry, mats.main);
    mesh.userData.hairGroom = true;
    mesh.name = `Hair${label}`; mesh.userData.skipNormalDepth = true; mesh.userData.hairUniforms = mats.own; mesh.renderOrder = order;
    mesh.onBeforeRender = (renderer, scene, camera) => this.BeforeRender(renderer, camera, mats.main);
    this.materials.push(mats.main); this.root.add(mesh);
    return mesh;
  }
  // 每次画（预通道、主场景各一次）之前：相机在头发局部坐标里的位置、这张靶上一个像素多大
  BeforeRender(renderer, camera, material) {
    const target = renderer.getRenderTarget();
    const height = target ? target.height : renderer.domElement.height;
    const p5 = camera.projectionMatrix.elements[5] || 1;
    this.shared.uPixelScale.value = 2 / (p5 * Math.max(1, height));
    _m.copy(this.root.matrixWorld).invert();
    this.shared.uCameraLocal.value.copy(camera.getWorldPosition(_v)).applyMatrix4(_m);
    // 级联阴影图在这一帧第一次 render（预通道）时才烘，矩阵也是那时才定：在头发真正要画之前同步，每帧一次。
    const drawFrame = renderer.info.render.frame;
    if (this.lightRig && shadowSyncFrames.get(this.lightRig) !== drawFrame) {
      shadowSyncFrames.set(this.lightRig, drawFrame);
      this.lightRig.SyncShadowUniforms?.();
    }
    material.uniformsNeedUpdate = true;
  }
  /** 强制某一档（'auto' 按屏幕大小）。 */
  SetLod(mode) { if (mode !== 'auto' && !HAIR_LODS.includes(mode)) return false; this.force = mode; return true; }
  SetHairVisible(on) { this.showHair = !!on; }
  SetBeardVisible(on) { this.showBeard = !!on; }
  /** 发丝的造型参数现场改（实验室面板）：clump / frizz / curl / width 等，见 Script_HairMaterials 的 own。 */
  SetStrandParam(key, value) {
    const u = this.strandUniforms;
    if (!u) return;
    if (key === 'clump') u.uClump.value = value;
    else if (key === 'frizz') u.uFrizz.value = value;
    else if (key === 'curlRadius') u.uCurl.value.x = value;
    else if (key === 'curlPitch') u.uCurl.value.y = value;
    else if (key === 'roughness') for (const m of this.materials) { if (m.uniforms.uRoughness) m.uniforms.uRoughness.value = value; }
    else if (key === 'melanin') {
      const base = this.asset.hair?.render.color.melanin ?? this.asset.beard?.render.color.melanin ?? value;
      const delta = value-base;
      for (const m of this.materials) if (m.uniforms.uMelanin) m.uniforms.uMelanin.value = THREE.MathUtils.clamp(m.userData.hairBaseMelanin + delta, 0, 1);
    }
  }
  PickLod(px) {
    if (!this.showHair) return 'none';
    if (this.force !== 'auto') return this.force;
    const rank = { strands: 0, cards: 1, shell: 2, none: 3 };
    const allowed = rank[this.maxLod] ?? 0;
    const Limit = (lod, px) => px * (this.current === null ? 1 : rank[this.current] <= rank[lod] ? 1 - HAIR_LOD.hysteresis : 1 + HAIR_LOD.hysteresis);
    if (allowed === 0 && px >= Limit('strands', HAIR_LOD.strandsMinPx) && this.meshes.strands) return 'strands';
    if (allowed <= 1 && px >= Limit('cards', HAIR_LOD.cardsMinPx) && this.meshes.cards) return 'cards';
    if (allowed <= 2 && px >= Limit('shell', HAIR_LOD.shellMinPx) && this.meshes.shell) return 'shell';
    return 'none';
  }
  /**
   * 每帧出画前调：选档、交叉淡入淡出、发丝数量、帧号与光方向。
   * @param dt 秒
   */
  Update(dt, camera, renderer) {
    if (this.disposed) return;
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const sh = this.shared;
    sh.uFrame.value = (sh.uFrame.value + 1) % 4096;
    this.root.updateWorldMatrix(true, false);
    for (const skin of [this.beardSkin, this.braidSkin]) if (skin) {
      const current = skin.uniforms.uBeardBones.value, previous = skin.uniforms.uPrevBeardBones.value;
      _m.copy(this.root.matrixWorld).invert();
      for (let i = 0; i < skin.bones.length; i++) {
        if (skin.ready) previous[i].copy(current[i]);
        skin.bones[i].updateWorldMatrix(true, false);
        current[i].copy(_m).multiply(skin.bones[i].matrixWorld).multiply(skin.attach[i]);
        if (!skin.ready) previous[i].copy(current[i]);
      }
      skin.ready = true;
    }
    const scale = this.root.matrixWorld.getMaxScaleOnAxis();
    sh.uModelScale.value = scale;
    // 太阳方向（世界 → 头发局部），给体素自阴影
    const sunDir = this.lightRig?.sunDirection;
    if (sunDir) {
      _sun.copy(sunDir).normalize();
      _m.copy(this.root.matrixWorld).invert();
      sh.uLightLocal.value.copy(_sun).transformDirection(_m);
    }
    // 屏幕大小：包围球直径占多少像素高
    const sphere = this.asset.hair?.sphere || this.meshes.beardCards?.geometry.boundingSphere || null;
    let px = 0;
    if (sphere) {
      _s.copy(sphere).applyMatrix4(this.root.matrixWorld);
      const dist = Math.max(0.05, _s.center.distanceTo(camera.getWorldPosition(_v)));
      const height = renderer?.domElement?.height || 1080;
      px = (_s.radius * 2 * (camera.projectionMatrix.elements[5] || 1) / dist) * height * 0.5;
    }
    this.screenPx = px;
    const want = this.PickLod(px);
    if (want !== this.current) {
      this.previous = this.current; this.current = want; this.fade = this.previous ? 0 : 1;
    }
    this.fade = Math.min(1, this.fade + (HAIR_LOD.fadeSeconds > 0 ? dt / HAIR_LOD.fadeSeconds : 1));
    if (this.fade >= 1) this.previous = null;
    const cardWeight = (this.current === 'cards' ? this.fade : 0) + (this.previous === 'cards' ? 1 - this.fade : 0);
    const shellWeight = (this.current === 'shell' ? this.fade : 0) + (this.previous === 'shell' ? 1 - this.fade : 0);
    for (const lod of ['strands', 'cards', 'shell']) {
      const mesh = this.meshes[lod];
      if (!mesh) continue;
      const f = lod === 'shell' && this.shortGameUnderlay ? Math.min(1, cardWeight + shellWeight)
        : lod === this.current ? this.fade : lod === this.previous ? 1 - this.fade : 0;
      mesh.visible = f > 0.001;
      if (mesh.userData.hairUniforms.uFade) mesh.userData.hairUniforms.uFade.value = f;
    }
    if (this.meshes.cards) this.meshes.cards.userData.hairUniforms.uAlphaScale.value = this.cardBaseAlpha *
      (this.shortGameUnderlay ? HAIR_LOD.shortCardUnderlayAlpha : 1);
    if (this.meshes.braid) this.meshes.braid.visible = this.showHair && this.current !== 'none';
    // 头皮染色：发丝 / 发片档才要（头发壳自己盖住头皮）；淡入淡出跟着这两档
    if (this.meshes.scalp) {
      const w = (this.current === 'strands' || this.current === 'cards' ? this.fade : 0) + (this.previous === 'strands' || this.previous === 'cards' ? 1 - this.fade : 0);
      this.meshes.scalp.visible = w > 0.001;
      this.meshes.scalp.userData.hairUniforms.uFade.value = Math.min(1, w);
    }
    // 发丝少画：宽度补偿，覆盖率不变
    if (this.meshes.strands) {
      const g = this.meshes.strands.geometry, S = this.asset.hair.strands;
      let fraction = 1;
      if (this.force === 'auto') fraction = THREE.MathUtils.clamp((px - HAIR_LOD.strandsMinPx) / (HAIR_LOD.strandFullPx - HAIR_LOD.strandsMinPx), HAIR_LOD.strandMinFraction, 1);
      if (this.strandFractionOverride != null) fraction = this.strandFractionOverride;
      const count = Math.max(1, Math.round(S * fraction));
      g.instanceCount = count;
      this.strandUniforms.uWidthScale.value = Math.sqrt(S / count);
      this.strandFraction = count / S;
    }
    // 胡子：发片画到 beardCardsMinPx，胡茬画到 stubbleMinPx（强制档时跟头发一起：none 才藏）
    const beardOn = this.showBeard && this.force !== 'none';
    if (this.meshes.beardCards) this.meshes.beardCards.visible = beardOn && (this.force !== 'auto' || px * 0.5 >= HAIR_LOD.beardCardsMinPx);
    if (this.meshes.stubble) this.meshes.stubble.visible = beardOn && (this.force !== 'auto' || px * 0.5 >= HAIR_LOD.stubbleMinPx);
    this.stats = {
      lod: this.current, screenPx: Math.round(px), fade: +this.fade.toFixed(2),
      strandsDrawn: this.meshes.strands?.visible ? Math.round((this.asset.hair?.strands || 0) * this.strandFraction) : 0,
      triangles: this.Triangles(),
    };
  }
  Triangles() {
    let t = 0;
    for (const [lod, mesh] of Object.entries(this.meshes)) {
      if (!mesh.visible) continue;
      if (lod === 'strands') t += mesh.geometry.instanceCount * (this.asset.hair.renderPoints - 1) * 2;
      else t += (mesh.geometry.index?.count || 0) / 3;
    }
    return t;
  }
  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const m of this.materials) { m.userData.hairLightRig?.UnregisterShadowUniforms?.(m.uniforms); m.dispose(); }
    this.materials.length = 0;
    for (const geometry of this.ownGeometries) geometry.dispose();
    this.ownGeometries.length = 0;
    this.root.clear();
  }
}
