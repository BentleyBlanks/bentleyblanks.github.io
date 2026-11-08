import * as THREE from 'three';
import {ManagedGLTFLoader} from './Script_ModelImports.mjs';
import {TYPE38_511 as D} from './Data_Type38_511.mjs';

let loading;
export function LoadType38_511() {
  return loading ||= Promise.all([D.url,D.npcLodUrl].map(url=>new ManagedGLTFLoader().loadAsync(url))).then(([gltf,npc])=>{
    const parts=new Set();let triangles=0;
    gltf.scene.traverse(mesh=>{if(mesh.isMesh){parts.add(mesh.userData.SourceObject);triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;}});
    if(parts.size!==D.parts||triangles!==D.triangles)throw new Error('Type38 511 geometry identity mismatch');
    for(const part of [...D.bolt,...D.dustCover,...D.frontSight,...D.rearSight,D.trigger])
      if(!parts.has(part))throw new Error(`Type38 511 missing part: ${part}`);
    // Imported normals, tangents, winding and PBR images are the accepted source
    // fields. Do not regenerate or weld them: the UV-field transfer is deliberate.
    const npcLod=new Map();npc.scene.updateMatrixWorld(true);
    npc.scene.traverse(mesh=>{if(mesh.isMesh)npcLod.set(mesh.userData.SourceObject,mesh);});
    if(npcLod.size!==1||!npcLod.has(D.npcLodPart))throw new Error('Type38 NPC sight LOD identity mismatch');
    if((npcLod.get(D.npcLodPart).geometry.index?.count||0)/3!==1152)throw new Error('Type38 NPC sight LOD triangle mismatch');
    return {gltf,npcLod,materials:new Map(),definition:D};
  }).catch(error=>{loading=null;throw new Error(`三八式 511 模型载入失败，请刷新重试：${error.message}`,{cause:error});});
}

export function ConfigureType38_511(asset,library) {
  const anisotropy=Math.min(D.textureAnisotropy,library?.anisotropy||1);
  asset.gltf.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const part=mesh.userData.SourceObject;
    mesh.material.name=`Type38_511_${part}`;
    mesh.material.color.setScalar(D.exposureGain);
    for(const value of Object.values(mesh.material))
      if(value?.isTexture&&value.anisotropy!==anisotropy){value.anisotropy=anisotropy;value.needsUpdate=true;}
    library.ConfigureExternalPbr(mesh.material,{mesh,preserveAuthored:true});
    asset.materials.set(mesh.material.name,mesh.material);
  });
}

export function InstantiateType38_511(asset,{batch=false,npcLod=false}={}) {
  if(!asset?.gltf?.scene)throw new Error('三八式 511 尚未预载。');
  const root=new THREE.Group();root.name='Type38_511';root.userData.assetVersion=D.version;
  const nodes=new Map([['root',root]]),meshes=[],groups={};
  for(const name of ['body','boltBody','dustCover','frontSight','rearSight','trigger']) {
    const group=new THREE.Group();group.name=name;root.add(group);nodes.set(name,group);groups[name]=group;
  }
  asset.gltf.scene.updateMatrixWorld(true);
  let tris=0;
  asset.gltf.scene.traverse(original=>{
    if(!original.isMesh)return;
    const part=original.userData.SourceObject,wood=D.wood.includes(part);
    const role=D.bolt.includes(part)?'boltBody':D.dustCover.includes(part)?'dustCover':
      D.frontSight.includes(part)?'frontSight':D.rearSight.includes(part)?'rearSight':part===D.trigger?'trigger':'body';
    const source=(npcLod&&asset.npcLod?.get(part))||original;
    const geometry=source.geometry.clone().applyMatrix4(source.matrixWorld).translate(...D.frameOffset);
    const mesh=new THREE.Mesh(geometry,asset.materials.get(`Type38_511_${part}`)||original.material);
    mesh.name=`Type38_${role}_${wood?'wood':'steel'}`;
    mesh.userData.type38Part=part;mesh.userData.weaponSurface=wood?'wood':'steel';mesh.userData.weaponPart=role;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=batch;
    (batch?root:groups[role]).add(mesh);meshes.push(mesh);
    tris+=(geometry.index?.count||geometry.attributes.position.count)/3;
  });
  for(const [name,position] of Object.entries(D.mounts)) {
    const node=new THREE.Object3D();node.name=name;node.position.fromArray(position);root.add(node);nodes.set(name,node);
  }
  root.updateMatrixWorld(true);
  return {root,nodes,meshes,tris,draws:meshes.length,bounds:new THREE.Box3().setFromObject(root),authored:true};
}
