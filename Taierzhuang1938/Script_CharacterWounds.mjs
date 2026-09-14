import * as THREE from "three";
import { MakePatch, ApplyPatches, PatchesOf } from "./Script_MaterialPatches.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { LimbForBone } from "./Script_Dismemberment.mjs";
import { BLOOD_WOUND as C } from "./Data_Tuning_Blood.mjs";

const posed = new THREE.Vector3(), rest = new THREE.Vector3();
const origin = new THREE.Vector3(), basis = new THREE.Vector3();
const classification = new WeakMap();
const raycaster=new THREE.Raycaster(), triangle=new THREE.Triangle(), barycentric=new THREE.Vector3();
function Region(name) {
  const limb = LimbForBone(name);
  if (limb) return limb;
  const n = name.toLowerCase();
  if (/head|neck/.test(n)) return "head";
  return "torso";
}
function Matches(region, part, shapeId) {
  if (shapeId && !/Torso/.test(shapeId)) return region === shapeId;
  if (part === "head") return region === "head";
  if (/arm/i.test(part)) return /arm/i.test(region);
  if (/leg/i.test(part)) return /thigh|calf/i.test(region);
  if (part === "limb") return /arm|thigh|calf/i.test(region);
  return region === "torso";
}
function Regions(mesh) {
  const geometry = mesh.geometry;
  let result = classification.get(geometry);
  if (result) return result;
  const {skinIndex, skinWeight, position} = geometry.attributes;
  result = Array(position.count).fill("torso");
  if (skinIndex && skinWeight) for (let i = 0; i < position.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i,k) > skinWeight.getComponent(i,best)) best = k;
    result[i] = Region(mesh.skeleton.bones[skinIndex.getComponent(i,best)]?.name || "");
  }
  classification.set(geometry,result);
  return result;
}
function WoundPatch(uniforms) {
  return MakePatch({key:`cloth-wound-2-${C.slots}`, uniforms:u=>Object.assign(u,uniforms),
    vertex:[["#include <common>","attribute vec3 woundRestPosition; varying vec3 vWoundRest;"],
      ["#include <begin_vertex>","vWoundRest = woundRestPosition;"]],
    fragment:[["#include <common>",`
      varying vec3 vWoundRest;
      uniform vec4 uClothWounds[${C.slots}];
      uniform vec2 uClothWoundAge[${C.slots}];
      uniform vec3 uClothFresh, uClothDry;
      float ClothNoise(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
    `],["#include <color_fragment>",`
      float clothBlood = 0.0, clothWet = 0.0;
      for (int i=0; i<${C.slots}; i++) {
        vec4 wound = uClothWounds[i];
        if (wound.w <= 0.0) continue;
        float age = uClothWoundAge[i].x;
        float spread = mix(${C.initialScale.toFixed(3)},1.0,1.0-exp(-age/${C.spreadSeconds.toFixed(3)}));
        vec3 q = (vWoundRest-wound.xyz)/wound.w;
        // Broad lobes and fine fabric wicking break the outline without another sampler.
        float lobe = sin(q.x*14.0+sin(q.y*9.0))*sin(q.z*13.0+q.y*11.0);
        float grain = ClothNoise(floor(q*110.0));
        float d = length(q*vec3(1.0,0.88,1.0)) + lobe*0.085 + grain*0.035;
        float stain = (1.0-smoothstep(spread*0.50,spread,d))*${C.opacity.toFixed(3)};
        float wet = exp(-age/${C.drySeconds.toFixed(3)});
        clothBlood = max(clothBlood,stain);
        clothWet = max(clothWet,stain*wet);
      }
      vec3 bloodTint = mix(uClothDry,uClothFresh,clothWet);
      diffuseColor.rgb = mix(diffuseColor.rgb, bloodTint*(0.65+diffuseColor.rgb*1.2),clothBlood);
    `],["#include <roughnessmap_fragment>",`
      roughnessFactor = mix(roughnessFactor, mix(${C.dryRoughness.toFixed(3)},${C.wetRoughness.toFixed(3)},clothWet),clothBlood);
    `],["#include <metalnessmap_fragment>","metalnessFactor *= 1.0-clothBlood;"]]});
}

function WoundUniforms() {
  return {uClothWounds:{value:Array.from({length:C.slots},()=>new THREE.Vector4(0,0,0,0))},
    uClothWoundAge:{value:Array.from({length:C.slots},()=>new THREE.Vector2())},
    uClothFresh:{value:new THREE.Color(C.fresh)},uClothDry:{value:new THREE.Color(C.dry)}};
}
function WoundMaterial(source,uniforms) {
  const material=CloneShadedMaterial(source),patch=WoundPatch(uniforms);
  for(const m of Array.isArray(material)?material:[material])ApplyPatches(m,[...(PatchesOf(m)||[]),patch]);
  return material;
}
const warmMaterials=new WeakMap();
// Keep a zero-wound variant alive with the source material so first injury reuses
// a linked program. Restore the original materials after the loading-screen pass.
export function PrepareWoundVariants(root) {
  const swapped=[];
  root?.traverse(mesh=>{
    if(!mesh.isSkinnedMesh && !mesh.name?.startsWith("GoreWarm_Part_"))return;
    mesh.geometry.setAttribute("woundRestPosition",mesh.geometry.attributes.position);
    const source=mesh.material;
    const Warm=original=>{
      let material=warmMaterials.get(original);
      if(!material) {
        material=WoundMaterial(original,WoundUniforms());warmMaterials.set(original,material);
        original.addEventListener("dispose",()=>{material.dispose();warmMaterials.delete(original);});
      }
      return material;
    };
    mesh.material=Array.isArray(source)?source.map(Warm):Warm(source);
    swapped.push([mesh,source]);
  });
  return ()=>{for(const [mesh,source] of swapped)mesh.material=source;};
}

// Bind-space masks deform with the existing skin, preserving lighting, normals and motion vectors.
// Private materials isolate each wearer; no decals, transparent shells or per-frame vertex uploads.
export class CharacterWounds {
  constructor(root) { this.root=root; this.records=new Map(); this.time=0; this.count=0; }
  Add({part="torso",shapeId=null,point=null,direction=null}={}) {
    if (!this.root) return false;
    this.root.updateWorldMatrix(true,true);
    const meshes=[];
    this.root.traverse(m=>{if(m.isSkinnedMesh && m.geometry?.attributes.position)meshes.push(m);});
    // If damage has only a coarse part, pick a real bone segment in that part.
    let target=point ? new THREE.Vector3().copy(point) : null;
    if (!target) {
      const candidates=[];
      for(const mesh of meshes) for(const bone of mesh.skeleton.bones) {
        if(Matches(Region(bone.name),part,shapeId)) candidates.push(bone);
      }
      const bone=candidates.find(b=>/forearm|thigh|spine1|spine2|head/i.test(b.name))||candidates[0];
      if(!bone)return false;
      target=bone.getWorldPosition(new THREE.Vector3());
      const child=bone.children.find(b=>b.isBone);
      if(child)target.lerp(child.getWorldPosition(new THREE.Vector3()),.35);
      if(direction)target.addScaledVector(new THREE.Vector3().copy(direction).normalize(),-C.surfaceBiasM);
    }
    let selected=null, best=Infinity;
    for(const mesh of meshes) {
      mesh.skeleton.update();
      const regions=Regions(mesh), active=mesh.geometry.index;
      // Respect severed geometry: removed vertices must never win nearest-surface selection.
      const ids=[...(active ? new Set(active.array) : regions.keys())].filter(i=>Matches(regions[i],part,shapeId));
      const stride=Math.max(1,Math.ceil(ids.length/C.maxSurfaceSamples));
      for(let sample=0;sample<ids.length;sample+=stride) {
        const i=ids[sample];
        mesh.getVertexPosition(i,posed).applyMatrix4(mesh.matrixWorld);
        const distance=posed.distanceToSquared(target);
        if(distance<best){best=distance;selected={mesh,index:i};}
      }
    }
    // Project the bullet onto the posed outer surface. This also selects a sleeve
    // over skin underneath it; the nearest point to an interior bone cannot do that.
    const rayDirection=new THREE.Vector3().copy(direction || {x:0,y:0,z:1}).normalize();
    raycaster.set(target.clone().addScaledVector(rayDirection,-0.4),rayDirection);
    raycaster.near=0;raycaster.far=0.8;
    let surface=null, surfaceDistance=Infinity;
    for(const candidate of meshes) {
      // The subdivided first-person hand has >76k vertices. Keep injury work bounded;
      // its nearest-surface sample is enough, while the outer cloth remains ray-exact.
      if(candidate.geometry.attributes.position.count>C.maxRayVertices)continue;
      candidate.computeBoundingSphere();
      const regions=Regions(candidate);
      for(const hit of raycaster.intersectObject(candidate,false)) {
        if(!hit.face || ![hit.face.a,hit.face.b,hit.face.c].some(i=>Matches(regions[i],part,shapeId)))continue;
        const distance=point ? hit.point.distanceToSquared(target) : hit.distance;
        if(distance<surfaceDistance) {surface=hit;surfaceDistance=distance;}
      }
    }
    if(surface)selected={mesh:surface.object,index:surface.face.a};
    if(!selected)return false;
    const {mesh,index}=selected;
    let record=this.records.get(mesh);
    if(!record) {
      // An immutable alias is safe for shared geometry and survives gore's source/index clones.
      mesh.geometry.setAttribute("woundRestPosition",mesh.geometry.attributes.position);
      const uniforms=WoundUniforms();
      const original=mesh.material,material=WoundMaterial(original,uniforms);
      mesh.material=material;
      record={mesh,original,material,uniforms,born:[],cursor:0};this.records.set(mesh,record);
    }
    rest.fromBufferAttribute(mesh.geometry.attributes.woundRestPosition,index);
    if(surface) {
      const {a,b,c}=surface.face;
      mesh.getVertexPosition(a,triangle.a);mesh.getVertexPosition(b,triangle.b);mesh.getVertexPosition(c,triangle.c);
      triangle.getBarycoord(mesh.worldToLocal(surface.point.clone()),barycentric);
      const attr=mesh.geometry.attributes.woundRestPosition;
      rest.set(0,0,0).addScaledVector(posed.fromBufferAttribute(attr,a),barycentric.x)
        .addScaledVector(posed.fromBufferAttribute(attr,b),barycentric.y)
        .addScaledVector(posed.fromBufferAttribute(attr,c),barycentric.z);
    }
    // Attached-bind rigs cancel mesh.matrixWorld scale in the skin transform.
    // Measure the complete local-to-posed Jacobian instead of dividing by root scale.
    origin.copy(rest);mesh.applyBoneTransform(index,origin);origin.applyMatrix4(mesh.matrixWorld);
    let stretch=0;
    for(let axis=0;axis<3;axis++) {
      basis.copy(rest);basis.setComponent(axis,basis.getComponent(axis)+1);
      mesh.applyBoneTransform(index,basis);basis.applyMatrix4(mesh.matrixWorld);
      stretch+=basis.distanceTo(origin);
    }
    const radius=C.radiusM/Math.max(.0001,stretch/3);
    const slot=record.cursor++%C.slots;
    record.uniforms.uClothWounds.value[slot].set(rest.x,rest.y,rest.z,radius);
    record.born[slot]=this.time;record.uniforms.uClothWoundAge.value[slot].set(0,0);
    this.count++;return true;
  }
  Update(dt) {
    this.time+=Math.max(0,dt);
    for(const record of this.records.values())for(let i=0;i<record.born.length;i++)
      record.uniforms.uClothWoundAge.value[i].x=this.time-record.born[i];
  }
  Clear() {
    for(const r of this.records.values()) {
      if(r.mesh.material===r.material)r.mesh.material=r.original;
      for(const m of Array.isArray(r.material)?r.material:[r.material])m.dispose();
    }
    this.records.clear();this.count=0;this.time=0;
  }
}
