// Blender-authored hemp cord; normalized to world-metre rest geometry and independent bone frames.
import * as THREE from 'three';
import {ManagedGLTFLoader} from './Script_ModelImports.mjs';
import {CloneShadedMaterial} from './Script_Materials.mjs';
import {ApplyPatches,IndirectLightingPatches} from './Script_MaterialPatches.mjs';

export const RIFLE_SLING_VISUAL_URL='./Model/HempRifleSlingV2/Model_RifleSlingHempV2.glb?v=20261105HempV2';
let visual=null,loading=null;
const materials=new WeakMap();
export function PrepareRifleSlingVisual(gltf){
  gltf.scene.updateMatrixWorld(true);
  const source=gltf.scene.getObjectByName('RopeHemp_Skinned');
  if(!source?.isSkinnedMesh||source.skeleton.bones.length!==32)throw new Error('Hemp sling requires the authored 32-bone mesh');
  const geometry=source.geometry.clone().applyMatrix4(source.matrixWorld),map=[];
  const inverseBinds=[],bindRotations=[],restZ=[];
  source.skeleton.bones.forEach((bone,oldIndex)=>{
    const match=bone.name.match(/SlingBone_(\d+)$/);if(!match)throw new Error('Unexpected hemp bone '+bone.name);
    const index=Number(match[1]);map[oldIndex]=index;restZ[index]=bone.matrixWorld.elements[14];
    bindRotations[index]=new THREE.Matrix4().extractRotation(bone.matrixWorld);
    inverseBinds[index]=bindRotations[index].clone().invert();
  });
  const indices=geometry.attributes.skinIndex;
  for(let i=0;i<indices.count;i++)for(let j=0;j<4;j++)indices.setComponent(i,j,map[indices.getComponent(i,j)]||0);
  // Remove the weighted axial bind offset, retaining the tiny cross-section offset.
  // Translation is then interpolated along the solver's actual chord. Ordinary rest-Z
  // skinning bulges up to a centimetre outside a tightly bent 7 mm cord at the shoulder.
  const position=geometry.attributes.position,weights=geometry.attributes.skinWeight;
  for(let i=0;i<position.count;i++){
    let z=0;for(let j=0;j<4;j++)z+=restZ[indices.getComponent(i,j)]*weights.getComponent(i,j);
    position.setZ(i,position.getZ(i)-z);
  }
  geometry.computeBoundingSphere();
  const eye=gltf.scene.getObjectByName('RopeHemp_Eye'),whip=gltf.scene.getObjectByName('RopeHemp_Whipping');
  visual={geometry,inverseBinds,bindRotations,material:source.material,
    eye:eye.geometry.clone().applyMatrix4(eye.matrixWorld),whip:whip.geometry.clone().applyMatrix4(whip.matrixWorld)};
  for(const side of ['Front','Rear']){
    const mesh=gltf.scene.getObjectByName('RopeHemp_Lashing'+side);
    visual['lashing'+side]=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  }
  return visual;
}
export function LoadRifleSlingVisual(){
  if(visual)return Promise.resolve(visual);
  return loading ||= new ManagedGLTFLoader().loadAsync(RIFLE_SLING_VISUAL_URL).then(PrepareRifleSlingVisual).catch(error=>{
    console.warn('[RifleSling] hemp visual failed',error);loading=null;throw error;
  });
}
export function RifleSlingVisualReady(){return !!visual;}
export function CreateRifleSlingVisual(bones,library=null){
  if(!visual)return null;
  const key=library||visual.material;
  let pair=materials.get(key);
  if(!pair){
    const plain=visual.material.clone();plain.name='Material_HempRifleSlingV2';plain.metalness=0;plain.roughness=Math.max(.9,plain.roughness);
    if(library)library.ConfigureExternalPbr(plain,{metalness:0,minRoughness:.9});
    else ApplyPatches(plain,IndirectLightingPatches());
    pair={plain,skin:CloneShadedMaterial(plain)};materials.set(key,pair);
  }
  const mesh=new THREE.SkinnedMesh(visual.geometry.clone(),pair.skin);
  mesh.add(...bones);mesh.bind(new THREE.Skeleton(bones,visual.inverseBinds.map(m=>m.clone())),new THREE.Matrix4());
  const bindings=Array.from({length:2},()=>({eye:new THREE.Mesh(visual.eye.clone(),pair.plain),whip:new THREE.Mesh(visual.whip.clone(),pair.plain)}));
  return {mesh,bindings,bindRotations:visual.bindRotations};
}
export function SetRifleSlingBindingGeometry(bindings,mounts){
  bindings?.forEach((binding,i)=>{
    const kind=mounts?.lashing?'lashing'+(i===0?'Front':'Rear'):'eye';
    if(binding.kind===kind)return;
    binding.eye.geometry.dispose();binding.eye.geometry=visual[kind].clone();binding.kind=kind;
  });
}
