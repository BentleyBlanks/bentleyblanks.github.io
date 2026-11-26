import * as THREE from 'three';
import {mergeGeometries} from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {ManagedGLTFLoader} from './Script_ModelImports.mjs';
import {HANYANG_173R as D} from './Data_HanYang173R.mjs';

let loading;
export function LoadHanYang173R() {
  return loading ||= new ManagedGLTFLoader().loadAsync(D.url).then(gltf => {
    const names = new Set(); gltf.scene.traverse(o => {if(o.isMesh) names.add(o.name);});
    for(const name of [...D.wood,...D.bolt,...D.cocking,D.trigger])
      if(!names.has(name)) throw new Error(`173R missing part: ${name}`);
    gltf.scene.traverse(o => {if(o.isMesh) RepairHanYangWinding(o.geometry);});
    return {gltf, materials: new Map()};
  }).catch(error=>{loading=null;throw new Error(`汉阳造 173R 模型载入失败，请刷新重试：${error.message}`,{cause:error});});
}

// The delivery's materials are double-sided, so three picks the shading side from
// winding. 0.2-7.8% of the triangles in 12 parts (RearOuterCover 21/287, rear
// sight leaf 6/77) wind against their authored normals and shade as back faces.
// Re-wind those to the normals; positions, normals, UVs and tangents are unchanged.
export function RepairHanYangWinding(geometry) {
  const p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index;
  if(!p||!n||!index||geometry.userData.hanYangWinding) return;
  geometry.userData.hanYangWinding=true;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),sum=new THREE.Vector3(),t=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3) {
    const ia=index.getX(i),ib=index.getX(i+1),ic=index.getX(i+2);
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib).sub(a);c.fromBufferAttribute(p,ic).sub(a);
    sum.fromBufferAttribute(n,ia).add(t.fromBufferAttribute(n,ib)).add(t.fromBufferAttribute(n,ic));
    if(b.cross(c).dot(sum)<0) {index.setX(i+1,ic);index.setX(i+2,ib);}
  }
  index.needsUpdate=true;
}

// 2026-11-03 底色校准（Data_HanYang173R.baseCandidate 头注，用户已定）。`?gunBase=authored` 退回旧样（一个 exposureGain），对照用。
export const HANYANG_BASE_MODE = (typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('gunBase') === 'authored') ? 'authored' : 'candidate';

/** Linear colour multiplier for a legacy or calibrated base-colour atlas. */
export function HanYang173RBaseGain(part, mode = HANYANG_BASE_MODE, calibrated = false) {
  const g = D.exposureGain, C = D.baseCandidate, K = D.calibratedGain;
  if(calibrated && mode !== 'authored') {
    if(K) return D.wood.includes(part) ? [...K.wood] : [K.steel, K.steel, K.steel];
    return [1, 1, 1];
  }
  if(!calibrated && mode === 'authored') return [g, g, g];
  let gain = [g, g, g];
  if(C && D.wood.includes(part)) {
    gain = [...C.wood];
  } else if(C?.partBaseY[part] > 0) {
    const y = C.partBaseY[part], S = C.steel;
    const k = Math.min(S.maxGain, Math.max(1, Math.pow(S.target / (g * y), S.exponent)));
    gain = [g * k, g * k, g * k];
  }
  // A calibrated atlas already includes the candidate gain in linear space.
  return calibrated ? gain.map(channel => g / channel) : gain;
}

export function ConfigureHanYang173R(asset, library, rendererAnisotropy = library?.anisotropy || 1) {
  if (!asset) return;
  const anisotropy = Math.min(D.textureAnisotropy, rendererAnisotropy);
  const extras = asset.gltf.asset?.extras;
  const calibrated = extras?.calibratedBaseColor === true;
  const atlased = extras?.hanYangBatching === 1;
  const separateGains = atlased && HANYANG_BASE_MODE === 'authored';
  const prepared = new Map();
  asset.gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const partKey = `HanYang173R_${mesh.name}`;
    const source = mesh.material;
    const shared = atlased && !separateGains;
    if (shared && prepared.has(source)) {
      mesh.material = prepared.get(source);
      asset.materials.set(partKey, mesh.material);
      return;
    }

    // The diagnostic authored mode uses a colour gain of its own for each part.
    const material = separateGains ? asset.materials.get(partKey) || source.clone() : source;
    mesh.material = material;
    if (!shared || !material.name.startsWith('HanYang173R_')) material.name = partKey;
    material.color.fromArray(HanYang173RBaseGain(mesh.name, HANYANG_BASE_MODE, calibrated));
    if (calibrated && HANYANG_BASE_MODE !== 'authored' && D.calibratedGain?.woodSpecular != null
      && D.wood.includes(mesh.name) && 'specularIntensity' in material) {
      material.specularIntensity = D.calibratedGain.woodSpecular;
    }
    for (const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap','clearcoatMap']) {
      const texture = material[slot];
      if (!texture || texture.anisotropy === anisotropy) continue;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
    library?.ConfigureExternalPbr(material,{mesh,preserveAuthored:true});
    if (shared) prepared.set(source, mesh.material);
    asset.materials.set(partKey,mesh.material);
  });
}

export function HanYangPartAt(object, faceIndex) {
  const part = object?.userData.hanYang173RPart;
  const regions = object?.userData.hanYangPartRanges;
  if (!regions || faceIndex == null) return part;
  const index = faceIndex * 3;
  return regions.find(region => index >= region.start && index < region.start + region.count)?.name;
}

// Private geometry for FPS: Equip/Dispose and movable bolt groups may mutate it.
// World geometry is also owned by the factory cache, while PBR textures are shared.
export function InstantiateHanYang173R(asset,{batch=false}={}) {
  if(!asset?.gltf?.scene)throw new Error('汉阳造 173R 尚未载入；请先完成模型预载。');
  const root = new THREE.Group(); root.name='HanYang173R';
  root.userData.assetVersion=D.version;
  const nodes=new Map(), meshes=[], groups={};
  nodes.set('root',root);
  for(const name of ['body','boltBody','cockingPiece','frontSight','rearSight','trigger']) {
    const group=new THREE.Group();group.name=name;root.add(group);nodes.set(name,group);groups[name]=group;
  }
  const source = asset.gltf.scene;
  source.updateMatrixWorld(true);
  const atlased = asset.gltf.asset?.extras?.hanYangBatching === 1;
  const combine = atlased && HANYANG_BASE_MODE !== 'authored';
  const byDraw = new Map();
  let tris = 0;
  source.traverse(original => {
    if (!original.isMesh) return;
    const part = original.name, wood = D.wood.includes(part);
    const role = original.userData.hanYangRole ||
      (D.bolt.includes(part) ? 'boltBody' : D.cocking.includes(part) ? 'cockingPiece' :
        D.frontSight.includes(part) ? 'frontSight' : D.rearSight.includes(part) ? 'rearSight' :
          part === D.trigger ? 'trigger' : 'body');
    const material = asset.materials.get(`HanYang173R_${part}`) || original.material;
    const key = combine ? `${role}/${material.uuid}` : part;
    if (!byDraw.has(key)) byDraw.set(key,{role,wood,material,entries:[]});
    const geometry = original.geometry.clone().applyMatrix4(original.matrixWorld);
    byDraw.get(key).entries.push({name:part,geometry});
  });
  for (const {role,wood,material,entries} of byDraw.values()) {
    const geometries = entries.map(entry => entry.geometry);
    let start = 0, vertexStart = 0;
    const ranges = entries.map(({name,geometry}) => {
      const vertices = geometry.attributes.position.count;
      const count = geometry.index?.count ?? vertices;
      const range = {name,start,count,vertexStart,vertices};
      start += count;
      vertexStart += vertices;
      return range;
    });
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries,false);
    if (geometries.length > 1) for (const input of geometries) input.dispose();
    if (!geometry) throw new Error(`汉阳造共享材质网格合并失败：${material.name}`);
    const mesh = new THREE.Mesh(geometry,material);
    mesh.name = `HanYang_${role}_${wood?'wood':'steel'}`;
    mesh.userData.hanYang173RPart = ranges[0].name;
    if (ranges.length > 1) mesh.userData.hanYangPartRanges = ranges;
    mesh.userData.weaponSurface = wood ? 'wood' : 'steel';
    mesh.userData.weaponPart = role;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = batch;
    (batch ? root : groups[role]).add(mesh);
    meshes.push(mesh);
    tris += start/3;
  }
  for(const [name,position] of Object.entries(D.mounts)) {
    const node=new THREE.Object3D();node.name=name;node.position.fromArray(position);root.add(node);nodes.set(name,node);
  }
  root.updateMatrixWorld(true);
  return {root,nodes,meshes,tris,draws:meshes.length,bounds:new THREE.Box3().setFromObject(root),authored:true};
}
