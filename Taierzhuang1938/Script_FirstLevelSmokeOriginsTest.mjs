import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { FirstLevelSmokeOrigins } from "./Script_FirstLevelSmokeOrigins.mjs";
import { FIRST_LEVEL_SMOKE_ORIGINS } from "./Data_FirstLevelSmokeOrigins.mjs";
import { FIRST_LEVEL_DISTANT_SMOKE } from "./Data_FirstLevelDistantSmoke.mjs";
import { MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { BuildBattleSmokeInstances } from "./Script_BattleSmoke.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { MakeTreePlacements } from "./Data_BreakableTreePlacements.mjs";

const source=JSON.parse(fs.readFileSync(new URL("./Model/Model_Type89Tank.tzm.json",import.meta.url)));
const fetchBefore=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>source});
const doc=await LoadDocument("test:SmokeOrigins");globalThis.fetch=fetchBefore;
const root=new THREE.Group(),battlefield={StaticGroundHeight:SampleMissionTerrain,colliders:[]};
const solids=new Set(),physics={AddSolid(c){c._physicsHandle=c;solids.add(c)},RemoveSolid(c){solids.delete(c)}};
const materials=new Map(),library={Get(name){if(!materials.has(name))materials.set(name,new THREE.MeshStandardMaterial());return materials.get(name)}};
const origins=new FirstLevelSmokeOrigins({root,battlefield,physics,library,actorFactory:{ModelInstance(_id,materials){return InstantiateModel(doc,{materials})}}});
// 63 处远烟 / 路边散点 + 2 处引导地标（2026-09-28，Data_FirstLevelDistantSmoke.LANDMARK_COLUMNS：08 横车上的木料火、07 村北口的柴垛火）。
assert.equal(origins.entries.size,65);assert.equal(solids.size,65);
const counts={};for(const spec of FIRST_LEVEL_SMOKE_ORIGINS)counts[spec.kind]=(counts[spec.kind]||0)+1;
assert.deepEqual(counts,{tank:7,truck:14,timber:26,barrels:18});
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
assert.equal(BuildBattleSmokeInstances(sources,"low").length,780);   // 12 per source × 65
assert.equal(BuildBattleSmokeInstances(sources,"ultra").length,1300); // 20 per source × 65
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
assert.ok(vfx.battleFire.geometry.instanceCount>100,"ambient flames prewarm");
assert.equal(vfx.pools.fire.geometry.instanceCount,0,"ambient flames never consume combat fire slots");
assert.equal(vfx.pools.sourceFire.geometry.instanceCount,0,"other persistent fire slots remain available");
const first=vfx.battleFire.arrays.iOrigin.slice(0,3),fire=emitters[0].options.firePosition;
assert.equal(first[1],Math.fround(fire.y),"flame spawns on actual engine outlet height");
vfx.ClearParticles();assert.equal(vfx.battleFire.geometry.instanceCount,0);
vfx.Update(.016,null,0);assert.ok(vfx.battleFire.geometry.instanceCount>100,"clock reset restarts flames immediately");
for(const handle of handles)vfx.RemoveSmokeSource(handle);
vfx.Update(.016,null,.016);assert.equal(vfx.battleFire.geometry.instanceCount,0,"last source removal clears flame batch");
vfx.Dispose();origins.Dispose();
assert.equal(solids.size,0);assert.equal(battlefield.colliders.length,0);assert.equal(root.children.length,0);
for(const material of materials.values())material.dispose();
console.log("ok smoke origins: matched outlets, real route clearance, reset/dispose and isolated flames",{counts,triangles,batches:origins.meshes.length});
