import * as THREE from 'three';
import {ManagedGLTFLoader} from './Script_ModelImports.mjs';
import {HANYANG_173R as D} from './Data_HanYang173R.mjs';
import {ApplyPatches,MakePatch,PatchesOf} from './Script_MaterialPatches.mjs';

let loading;
export function LoadHanYang173R() {
  return loading ||= new ManagedGLTFLoader().loadAsync(D.url).then(gltf => {
    const names = new Set(); gltf.scene.traverse(o => {if(o.isMesh) names.add(o.name);});
    for(const name of [...D.wood,...D.bolt,...D.cocking,D.trigger])
      if(!names.has(name)) throw new Error(`173R missing part: ${name}`);
    return {gltf, materials: new Map()};
  }).catch(error=>{loading=null;throw new Error(`汉阳造 173R 模型载入失败，请刷新重试：${error.message}`,{cause:error});});
}

export function ConfigureHanYang173R(asset, library) {
  if(!asset) return;
  asset.gltf.scene.traverse(mesh => {
    if(!mesh.isMesh) return;
    const material = mesh.material;
    material.name = `HanYang173R_${mesh.name}`;
    material.userData.whiteboxWeaponReflection = true;
    material.userData.hanYangAuthoredColor ||= material.color.toArray();
    material.userData.hanYangAuthoredRoughness ??= material.roughness;
    const wood=D.wood.includes(mesh.name);
    material.color.fromArray(material.userData.hanYangAuthoredColor)
      .multiplyScalar(wood?D.woodReflectanceGain:D.metalReflectanceGains[mesh.name]||1);
    material.roughness=material.userData.hanYangAuthoredRoughness*(wood?1:D.metalRoughnessGain);
    library.ConfigureExternalPbr(material,{mesh});
    // Bound the effective textured reflectance, rather than clipping the
    // authoring multiplier and leaving every dark conductor near black.
    const key='hanYangReflectance1';
    ApplyPatches(mesh.material,[MakePatch({key,fragment:[
      ['#include <color_fragment>',`diffuseColor.rgb = min(diffuseColor.rgb, vec3(${D.maximumReflectance.toFixed(3)}));`],
      ['#include <roughnessmap_fragment>','roughnessFactor = clamp(roughnessFactor, 0.0, 1.0);'],
    ]}),...(PatchesOf(mesh.material)||[]).filter(p=>p.key!==key)]);
    asset.materials.set(material.name,mesh.material);
  });
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
  const source=asset.gltf.scene;
  source.updateMatrixWorld(true);
  let tris=0;
  source.traverse(original=>{
    if(!original.isMesh)return;
    const part=original.name,wood=D.wood.includes(part);
    const role=D.bolt.includes(part)?'boltBody':D.cocking.includes(part)?'cockingPiece':
      D.frontSight.includes(part)?'frontSight':D.rearSight.includes(part)?'rearSight':part===D.trigger?'trigger':'body';
    const geometry=original.geometry.clone().applyMatrix4(original.matrixWorld);
    const mesh=new THREE.Mesh(geometry,asset.materials.get(`HanYang173R_${part}`)||original.material);
    mesh.name=`HanYang_${role}_${wood?'wood':'steel'}`;
    mesh.userData.hanYang173RPart=part;mesh.userData.weaponSurface=wood?'wood':'steel';
    mesh.userData.weaponPart=role;mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.frustumCulled=batch;
    (batch?root:groups[role]).add(mesh);meshes.push(mesh);
    tris+=(geometry.index?.count||geometry.attributes.position.count)/3;
  });
  for(const [name,position] of Object.entries(D.mounts)) {
    const node=new THREE.Object3D();node.name=name;node.position.fromArray(position);root.add(node);nodes.set(name,node);
  }
  root.updateMatrixWorld(true);
  return {root,nodes,meshes,tris,draws:meshes.length,bounds:new THREE.Box3().setFromObject(root),authored:true};
}
