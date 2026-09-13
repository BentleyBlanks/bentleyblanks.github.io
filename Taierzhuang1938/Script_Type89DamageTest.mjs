import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { registerHooks } from "node:module";
import { TYPE89_DAMAGE as D } from "./Data_Type89Damage.mjs";
const vendor=new URL("./vendor/three/",import.meta.url);
const hooks=registerHooks({
  resolve(id,context,next){if(id==="three")return {url:new URL("build/three.module.js",vendor).href,shortCircuit:true};return next(id,context);},
  load(url,context,next){if(url.startsWith(vendor.href)&&url.endsWith(".js"))return {format:"module",source:fs.readFileSync(new URL(url),"utf8"),shortCircuit:true};return next(url,context);},
});
const THREE=await import("three"),{Type89Damage}=await import("./Script_Type89Damage.mjs");
const {LoadDocument,InstantiateModel}=await import("./Script_MeshLoad.mjs");
const source=JSON.parse(fs.readFileSync(new URL("./Model/Model_Type89Tank.tzm.json",import.meta.url)));
assert.equal(D.sourceSha256,crypto.createHash("sha256").update(fs.readFileSync(new URL("./Model/Model_Type89Tank.tzm.json",import.meta.url))).digest("hex"),"re-bake cut masks if the original tank changes");
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>source});
const doc=await LoadDocument("test:Type89Damage");globalThis.fetch=oldFetch;hooks.deregister();
const materials=Object.fromEntries(["type89Armor","type89Barrel","type89Track"].map(id=>[id,new THREE.MeshStandardMaterial()]));
const model=InstantiateModel(doc,{materials}),root=new THREE.Group();root.add(model.root);
const sources=new Map();let serial=0;
const groundAt=(x,z)=>.035*x+.02*z;
const vfx={SmokeSource:(p,opts)=>{sources.set(++serial,{p:p.clone(),opts});return serial;},
  MoveSmokeSource:(id,p)=>sources.get(id).p.copy(p),RemoveSmokeSource:id=>sources.delete(id)};
const damage=new Type89Damage({root,model,materials,vfx,groundAt});
assert.equal(source.triangles,D.sourceTriangles);
assert.equal(D.parts.length,16);assert.equal(D.hullFrames.length,73);
for(const part of D.parts){
  assert.equal(part.frames.length,73);assert.ok(part.frames.flat().every(Number.isFinite));
  assert.equal(part.geometry.positions.length,part.geometry.normals.length);
  assert.ok(part.geometry.positions.flat().every(Number.isFinite));
}
const intact=damage.trackIndex.count;
for(const side of [-1,1]){
  root.position.set(4,0,7);root.rotation.y=side*.7;
  const tank={present:true,active:true,immobilized:true,damageAt:10,damageSide:side};
  damage.Update(10,tank);assert.equal(sources.size,0);
  assert.equal(damage.track.geometry.index.count,intact-3*D.cutTriangles[String(side)].length);
  // The removed triangles really belong to the struck side, not just a label.
  const positions=doc.meshes[1].positions,indices=doc.meshes[1].index;
  for(const tri of D.cutTriangles[String(side)]){
    const x=[0,1,2].reduce((sum,k)=>sum+positions[indices[tri*3+k]*3],0)/3;
    assert.ok(x*side>.65);
  }
  const start=damage.parts[8].mesh.position.clone();
  for(let i=1;i<=240;i++)damage.Update(10+i/60,tank);
  assert.ok(start.distanceTo(damage.parts[8].mesh.position)>.2);
  assert.equal(sources.size,1);const id=damage.smoke;
  damage.Update(40,tank);assert.equal(damage.smoke,id,"persistent source is reused");
  for(const {spec,mesh} of damage.parts)if(spec.attach==="ground"){
    const p=mesh.getWorldPosition(new THREE.Vector3());
    assert.ok(p.y>=groundAt(p.x,p.z)+.039,"debris stays on shared terrain");
    assert.equal(mesh.scale.x,-side);
  }
  const settled=damage.parts.map(p=>p.mesh.position.toArray());
  delete tank.damageAt;damage.Update(50,tank);
  assert.deepEqual(damage.parts.map(p=>p.mesh.position.toArray()),settled,"checkpoint resumes settled damage");
  tank.immobilized=false;damage.Update(60,tank);
  assert.equal(sources.size,0);assert.equal(damage.track.geometry.index,damage.trackIndex);
  assert.equal(damage.hull.geometry.index,damage.hullIndex);assert.ok(damage.parts.every(p=>!p.mesh.visible));
  assert.deepEqual(model.root.position.toArray(),[0,0,0]);
}
damage.Update(100,{present:true,immobilized:true});assert.equal(sources.size,1);
damage.Dispose();assert.equal(sources.size,0);
console.log("PASS Type89 damage: real source cut on both sides, 16 rigid parts, terrain contact, settle, reset, smoke lifecycle");
