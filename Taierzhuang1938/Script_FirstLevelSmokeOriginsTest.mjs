import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { FirstLevelSmokeOrigins } from "./Script_FirstLevelSmokeOrigins.mjs";
import { FIRST_LEVEL_SMOKE_ORIGINS } from "./Data_FirstLevelSmokeOrigins.mjs";
import { FIRST_LEVEL_DISTANT_SMOKE } from "./Data_FirstLevelDistantSmoke.mjs";
import { MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { BattleSmokeParticleBudget } from "./Script_BattleSmoke.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { MakeTreePlacements } from "./Data_BreakableTreePlacements.mjs";

const source=JSON.parse(fs.readFileSync(new URL("./Model/Model_Type89Tank.tzm.json",import.meta.url)));
const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>source});
const doc=await LoadDocument("test:SmokeOrigins");globalThis.fetch=fetchBefore;
const root=new THREE.Group(),battlefield={StaticGroundHeight:SampleMissionTerrain,colliders:[]};
const solids=new Set(),physics={AddSolid(c){c._physicsHandle=c;solids.add(c)},RemoveSolid(c){solids.delete(c)}};
const materials=new Map(),library={Get(name){if(!materials.has(name))materials.set(name,new THREE.MeshStandardMaterial());return materials.get(name)}};
const origins=new FirstLevelSmokeOrigins({root,battlefield,physics,library,actorFactory:{ModelInstance(_id,materials){return InstantiateModel(doc,{materials})}}});
// 61 处远烟 / 路边散点 + 2 处引导地标（08 横车上的木料火、07 村北口的柴垛火）。
// Current master terrain leaves 61 deterministic roadside/distant slots plus 2 landmarks.
assert.equal(origins.entries.size,63);assert.equal(solids.size,63);
const counts={};for(const spec of FIRST_LEVEL_SMOKE_ORIGINS)counts[spec.kind]=(counts[spec.kind]||0)+1;
assert.deepEqual(counts,{tank:7,truck:14,timber:25,barrels:17});
// 地标自带 kind：不动原来按帧分配的 tank 奇偶（7 辆战车还是同样那 7 根柱子）。
for(const id of ["StreetBlockFire","VillageMouthFire"])assert.equal(FIRST_LEVEL_SMOKE_ORIGINS.find(spec=>spec.id===id)?.kind,"timber",id);
const emitters=FIRST_LEVEL_DISTANT_SMOKE.map(column=>origins.Emitter(column));
for(let i=0;i<emitters.length;i++) {
  const emitter=emitters[i],column=FIRST_LEVEL_DISTANT_SMOKE[i],fire=emitter.options.firePosition;
  assert.ok(Math.hypot(fire.x-emitter.position.x,fire.z-emitter.position.z)<1e-5,column.id+" actual outlet matches column X/Z");
  assert.ok(Math.hypot(fire.x-column.x,fire.z-column.z)<=5.001,column.id+" remains in its smoke reference region");
  assert.ok(Math.abs(fire.y-SampleMissionTerrain(fire.x,fire.z))<2.3,column.id+" physical outlet sits near ground");
  assert.ok(emitter.position.y>=fire.y,"smoke starts above the burning material");
  assert.deepEqual(emitter.options.backdrop.ignition,fire.toArray());
}
// Rotated wreck footprints preserve at least a person's width around authored routes.
for(const c of solids)for(const [id,route] of Object.entries(MISSION_ROUTES))for(let i=1;i<route.length;i++) {
  const a=route[i-1],b=route[i],distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(distance/.5);
  for(let j=0;j<=steps;j++) {
    const x=a.x+(b.x-a.x)*j/steps-c.c[0],z=a.z+(b.z-a.z)*j/steps-c.c[2];
    const lx=x*Math.cos(c.ry)-z*Math.sin(c.ry),lz=x*Math.sin(c.ry)+z*Math.cos(c.ry);
    assert.ok(Math.abs(lx)>c.h[0]+1.2||Math.abs(lz)>c.h[2]+1.2,"wreck leaves walking route clear: "+id);
  }
}
const sources=emitters.map(e=>({position:e.position,backdrop:e.options.backdrop}));
for(const entry of origins.entries.values()) if(entry.spec.kind==="tank"||entry.spec.kind==="truck")
  for(const tree of MakeTreePlacements())assert.ok(Math.hypot(entry.position.x-tree.x,entry.position.z-tree.z)>3.2,"vehicle body clears authored tree trunks");
assert.equal(BattleSmokeParticleBudget(sources,"low"),1008);   // 16 per source × 63
assert.equal(BattleSmokeParticleBudget(sources,"ultra"),1638); // 26 per source × 63
assert.ok(origins.meshes.length<=origins.materials.size,"wreck geometry is merged into one mesh per material: "+origins.meshes.length);
const triangles=origins.meshes.reduce((n,m)=>n+m.geometry.index.count/3,0);
assert.ok(triangles<110000,"origin triangle budget: "+triangles);
// Image decoding is the browser gate; this fixture exercises actual pool allocation.
const textureLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(){return new THREE.Texture()};
const scene=new THREE.Scene(),vfx=new VfxSystem(scene,null,{quality:"low"});
THREE.TextureLoader.prototype.load=textureLoad;
const handles=emitters.map(e=>vfx.SmokeSource(e.position,e.options));
vfx.Update(.016,null,100);
assert.ok(vfx.particles.renderer.pools.flame.geometry.instanceCount>100,"ambient flames prewarm");
assert.equal(vfx.pools.fire.geometry.instanceCount,0,"ambient flames never consume combat fire slots");
assert.equal(vfx.pools.sourceFire.geometry.instanceCount,0,"other persistent fire slots remain available");
const flamePool=vfx.particles.renderer.pools.flame;
for (const [index,handle] of handles.entries()) {
  const source=vfx.smokeSources.get(handle),fire=emitters[index].options.firePosition;
  for(const id of source.particleHandles.slice(0,2)) {
    const system=vfx.particles.Get(id).system;
    const slot=flamePool.owners.findIndex(owner=>owner===system);
    assert.ok(slot>=0,"every source retains its own flame particles");
    assert.equal(flamePool.arrays.iOrigin[slot*3+1],Math.fround(fire.y),"flame spawns on actual engine outlet height");
  }
}
for(let i=0;i<600;i++)vfx.particles.Update(1/60);
for(const [kind,pool]of Object.entries(vfx.particles.renderer.pools))assert.equal(pool.dropped,0,kind+' pool handles all background sources for ten seconds');
for(const quality of ['medium','high','ultra']) {
  THREE.TextureLoader.prototype.load=function(){return new THREE.Texture()};
  const variant=new VfxSystem(new THREE.Scene(),null,{quality});
  THREE.TextureLoader.prototype.load=textureLoad;
  for(const emitter of emitters)variant.SmokeSource(emitter.position,emitter.options);
  for(let frame=0;frame<600;frame++)variant.particles.Update(1/60);
  for(const [kind,pool]of Object.entries(variant.particles.renderer.pools))assert.equal(pool.dropped,0,quality+' '+kind+' pool handles all background sources');
  variant.Dispose();
}
// Logical light allocation remains bounded while walking through all wrecks.
const fireLights=new Map();let nextLight=1;
vfx.lights={AddFire(position,profile){const id=nextLight++;fireLights.set(id,{position,profile});return id},RemoveFire(id){fireLights.delete(id)}};
const lightHandles=Array.from({length:7},(_,i)=>vfx.SmokeSource(new THREE.Vector3(i,0,0),{fire:1,nearLight:true,light:false}));
vfx.eye.set(0,0,0);vfx.UpdateBurningLights();assert.equal(fireLights.size,4);
vfx.eye.set(100,0,0);vfx.UpdateBurningLights();assert.equal(fireLights.size,0,'distant fire lights release their slots');
vfx.eye.set(0,0,0);vfx.UpdateBurningLights();
for(const handle of lightHandles)vfx.RemoveSmokeSource(handle);
assert.equal(fireLights.size,0,'removing a burning source removes its light');
vfx.ClearParticles();assert.equal(vfx.particles.renderer.pools.flame.geometry.instanceCount,0);
vfx.Update(.016,null,0);assert.ok(vfx.particles.renderer.pools.flame.geometry.instanceCount>100,"clock reset restarts flames immediately");
for(const handle of handles)vfx.RemoveSmokeSource(handle);
vfx.Update(.016,null,.016);assert.equal(vfx.particles.renderer.pools.flame.geometry.instanceCount,0,"last source removal clears flame batch");
vfx.Dispose();origins.Dispose();
assert.equal(solids.size,0);assert.equal(battlefield.colliders.length,0);assert.equal(root.children.length,0);
for(const material of materials.values())material.dispose();
console.log("ok smoke origins: matched outlets, real route clearance, reset/dispose and isolated flames",{counts,triangles,batches:origins.meshes.length});
