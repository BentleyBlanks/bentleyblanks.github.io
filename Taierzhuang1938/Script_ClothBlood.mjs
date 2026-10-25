import * as THREE from 'three';
import { MakePatch, ApplyPatches, PatchesOf } from './Script_MaterialPatches.mjs';
import { CloneShadedMaterial } from './Script_Materials.mjs';
import { BLOOD_WOUND } from './Data_Tuning_Blood.mjs';
import { CLOTH_BLOOD_SIM as S } from './Data_Tuning_ClothBlood.mjs';
import { ClothBloodModel } from './Script_ClothBloodModel.mjs';

// Reuses CharacterWounds' linear-space fresh/dry palette, texture-preserving tint and
// wet/dry roughness response; replaces its 12 circular wound slots with a conserved sheet.
// A single packed data atlas adds one sampler. No decal geometry or vertex displacement.
export function ClothBloodPatch(uniforms) {
  return MakePatch({key:'cloth-blood-sheet-3',uniforms:u=>Object.assign(u,uniforms),
    vertex:[['#include <common>','attribute vec3 clothBloodRest; varying vec3 vClothBloodRest;'],
      ['#include <begin_vertex>','vClothBloodRest = clothBloodRest;']],
    fragment:[['#include <common>',`
      varying vec3 vClothBloodRest;
      uniform sampler2D uClothBloodSheet;
      uniform vec2 uClothBloodGrid;
      uniform vec3 uClothBloodFresh, uClothBloodDry;
      uniform float uClothBloodReflect;
      float ClothBloodHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float ClothBloodNoise(vec2 p) {
        vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(ClothBloodHash(cell),ClothBloodHash(cell+vec2(1,0)),f.x),
          mix(ClothBloodHash(cell+vec2(0,1)),ClothBloodHash(cell+vec2(1,1)),f.x),f.y);
      }
    `],['#include <color_fragment>',`
      vec2 clothUv = vClothBloodRest.xy;
      // Fine irregular fibers supplement the coarse conservative field. Distortion is
      // immutable in material coordinates, so folds and dragging never move the pattern.
      vec2 clothFiber = vec2(ClothBloodNoise(clothUv*vec2(130,750)),ClothBloodNoise(clothUv*vec2(700,140)))*2.0-1.0;
      vec2 clothHalfTexel = 0.5/uClothBloodGrid;
      vec2 clothWick = vec2(ClothBloodNoise(clothUv*vec2(60,160)),ClothBloodNoise(clothUv*vec2(170,65)))*2.0-1.0;
      vec2 clothSampleUv = clamp(clothUv+clothWick*0.007+clothFiber*0.0015,clothHalfTexel,vec2(1.0)-clothHalfTexel);
      clothSampleUv.y = (clothSampleUv.y + (vClothBloodRest.z<0.0?1.0:0.0))*0.5;
      vec3 clothField = texture2D(uClothBloodSheet,clothSampleUv).rgb;
      float clothGrain = ClothBloodHash(floor(clothUv*vec2(1100.0,1350.0)));
      float clothSheetBlood = smoothstep(0.035,0.88,clothField.r)*(0.98+0.02*clothGrain)*${S.pigmentOpacity.toFixed(3)};
      float clothSheetWet = clothField.g;
      vec3 clothTint = mix(uClothBloodDry,uClothBloodFresh,clothSheetWet);
      diffuseColor.rgb = mix(diffuseColor.rgb,clothTint*(0.65+diffuseColor.rgb*1.2),clothSheetBlood);
    `],['#include <roughnessmap_fragment>',`
      float clothWetHighlight = clothSheetWet*uClothBloodReflect*smoothstep(0.0,0.32,clothField.b);
      roughnessFactor = mix(roughnessFactor,mix(${BLOOD_WOUND.dryRoughness.toFixed(3)},${BLOOD_WOUND.wetRoughness.toFixed(3)},clothWetHighlight),clothSheetBlood);
    `],['#include <metalnessmap_fragment>','metalnessFactor *= 1.0-clothSheetBlood;']]});
}

export class ClothBlood extends ClothBloodModel {
  constructor(root,options={}) {
    super(options);this.root=root;this.records=[];this.disposed=false;
    this.texture=new THREE.DataTexture(this.TextureData(),this.nx,this.ny*2,THREE.RGBAFormat);
    this.texture.name='ClothBloodSheet';this.texture.colorSpace=THREE.NoColorSpace;
    this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;
    this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={uClothBloodSheet:{value:this.texture},uClothBloodGrid:{value:new THREE.Vector2(this.nx,this.ny)},
      uClothBloodFresh:{value:new THREE.Color(BLOOD_WOUND.fresh)},uClothBloodDry:{value:new THREE.Color(BLOOD_WOUND.dry)},uClothBloodReflect:{value:this.params.wetReflect}};
    const patch=ClothBloodPatch(this.uniforms);
    root.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
      const originalGeometry=mesh.geometry;mesh.geometry=originalGeometry.clone();
      const pos=mesh.geometry.attributes.position,rest=new Float32Array(pos.count*3);
      for(let i=0;i<pos.count;i++) {rest[i*3]=pos.getX(i)/this.width+0.5;rest[i*3+1]=pos.getZ(i)/this.length+0.5;rest[i*3+2]=pos.getY(i)<0?-1:1;}
      const oldRest=mesh.geometry.getAttribute('clothBloodRest');
      mesh.geometry.setAttribute('clothBloodRest',new THREE.BufferAttribute(rest,3));
      const original=mesh.material,materials=(Array.isArray(original)?original:[original]).map(material=>{
        const clone=CloneShadedMaterial(material);
        ApplyPatches(clone,[...(PatchesOf(clone)||[]).filter(p=>p.key!==patch.key),patch]);return clone;
      });
      mesh.material=Array.isArray(original)?materials:materials[0];this.records.push({mesh,original,materials,oldRest,originalGeometry});
    });
    this.uploadedRevision=this.revision;
  }
  Sync() {
    if(!this.texture||this.disposed)return;
    if(this.revision!==this.uploadedRevision) {this.TextureData();this.texture.needsUpdate=true;this.uploadedRevision=this.revision;}
    this.uniforms.uClothBloodReflect.value=this.params.wetReflect;
  }
  Inject(options) {const result=super.Inject(options);this.Sync();return result;}
  StartFeed(options) {const result=super.StartFeed(options);this.Sync();return result;}
  StopFeed() {const result=super.StopFeed();this.Sync();return result;}
  Set(key,value) {const result=super.Set(key,value);this.Sync();return result;}
  Advance(dt) {const result=super.Advance(dt);this.Sync();return result;}
  Seek(timeS) {const result=super.Seek(timeS);this.Sync();return result;}
  Clear() {const result=super.Clear();this.Sync();return result;}
  Hit(hit) {
    const mesh=hit?.object,face=hit?.face,rest=mesh?.geometry?.getAttribute('clothBloodRest');
    if(!rest||!face||!this.records.some(record=>record.mesh===mesh))return null;
    mesh.updateWorldMatrix(true,false);mesh.skeleton?.update();
    const triangle=new THREE.Triangle();mesh.getVertexPosition(face.a,triangle.a);mesh.getVertexPosition(face.b,triangle.b);mesh.getVertexPosition(face.c,triangle.c);
    const bary=triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()),new THREE.Vector3());if(!bary)return null;
    const point=new THREE.Vector3(),sample=new THREE.Vector3();
    point.addScaledVector(sample.fromBufferAttribute(rest,face.a),bary.x).addScaledVector(sample.fromBufferAttribute(rest,face.b),bary.y).addScaledVector(sample.fromBufferAttribute(rest,face.c),bary.z);
    return this.Point({u:point.x,v:point.y,side:point.z<0?-1:1});
  }
  Dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const record of this.records) {
      record.mesh.material=record.original;for(const material of record.materials)material.dispose();
      record.mesh.geometry.dispose();record.mesh.geometry=record.originalGeometry;
    }
    this.texture.dispose();this.records=[];
  }
}
