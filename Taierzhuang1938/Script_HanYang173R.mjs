import * as THREE from 'three';
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

export function ConfigureHanYang173R(asset, library) {
  if(!asset) return;
  const anisotropy=Math.min(D.textureAnisotropy,library?.anisotropy||1);
  asset.gltf.scene.traverse(mesh => {
    if(!mesh.isMesh) return;
    const material = mesh.material;
    material.name = `HanYang173R_${mesh.name}`;
    material.color.setScalar(D.exposureGain);
    for(const slot of ['map','normalMap','roughnessMap','metalnessMap'])
      if(material[slot]&&material[slot].anisotropy!==anisotropy) {material[slot].anisotropy=anisotropy;material[slot].needsUpdate=true;}
    library.ConfigureExternalPbr(material,{mesh});
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
