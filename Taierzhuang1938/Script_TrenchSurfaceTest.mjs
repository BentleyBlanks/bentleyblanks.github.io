import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TerrainContactField } from './Script_TerrainContact.mjs';
import { TRENCH_SURFACE as C } from './Data_TrenchSurface.mjs';
import * as THREE from 'three';
import { BuildTrenchSurface } from './Script_TrenchSurface.mjs';

// Updates must use the physical terrain's actual grid (including non-unit cells),
// and must restore it after a blast reset; no camera-dependent screen depth cache.
const terrain={cols:8,rows:6,minX:-4,minZ:-3,stepX:.75,stepZ:1.25,heights:new Float32Array(9*7)};
for(let z=0;z<=6;z++)for(let x=0;x<=8;x++)terrain.heights[z*9+x]=x*.2+z*.4;
const contact=new TerrainContactField(terrain);
assert.equal(contact.texture.image.width,9);assert.equal(contact.texture.image.height,7);
assert.deepEqual(contact.grid.toArray(),[-4,-3,.75,1.25]);
assert.notEqual(contact.data,terrain.heights);
const before=contact.data.slice(),version=contact.texture.version;
contact.Update([{minX:-2.4,maxX:-1.6,minZ:-.6,maxZ:.6}],(x,z)=>-3+x*.02+z*.04);
assert.ok(contact.texture.version>version);assert.equal(contact.updates,1);
assert.equal(contact.data[0],before[0]);assert.equal(contact.data.at(-1),before.at(-1));
assert.ok(contact.data.some((h,i)=>h!==before[i]));
assert.deepEqual(terrain.heights,before,'render update must not mutate the physics base');
contact.Reset();assert.deepEqual(contact.data,before);contact.Dispose();

for(const [kind,url] of Object.entries(C.models)){
  const b=fs.readFileSync(new URL(url,import.meta.url));assert.equal(b.toString('ascii',0,4),'glTF');
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const primitives=json.meshes.flatMap(m=>m.primitives);
  const count=primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0);
  assert.ok(count>0&&count<1500,`${kind}: silhouette asset stays below 1500 triangles`);
  assert.equal(json.materials.length,1,'one material per static batch');
  const position=json.accessors[primitives[0].attributes.POSITION];
  if(kind==='grass'){
    assert.ok(position.min[1]<-.3&&position.max[1]>.3,'tuft has hanging and standing geometry');
    assert.ok(-position.min[2]>position.max[2]*1.5,'measured glTF drape faces -Z');
  }
}
const map=fs.readFileSync(new URL(C.mudMap,import.meta.url));
assert.equal(map.readUInt32BE(16),512);assert.equal(map.readUInt32BE(20),512);
assert.ok(C.mud.roughWet<.3&&C.mud.roughDry>.8,'separate wet/dry PBR ranges');
for(const url of [...Object.values(C.stoneLayer),...Object.values(C.mudLayer)])
  assert.ok(fs.statSync(new URL(url,import.meta.url)).size>1000);
// A bent bank fixture exercises footprint conformance on both sides, rather than
// checking only the model origin. Root tips must follow the soil without floating.
const Ground=(x,z)=>Math.abs(x)*.8+Math.sin(z*.4)*.15;
const plan={seed:707,Depth:()=>0,segments:[{id:'Bend',path:{length:24},stations:
  Array.from({length:18},(_,i)=>({s:i+3,x:0,z:i,nx:1,nz:0,tx:0,tz:1,halfFloor:1,bank:1,depth:2}))}]};
const grass=new THREE.BufferGeometry();
grass.setAttribute('position',new THREE.Float32BufferAttribute([-.3,0,0,.3,0,0,0,-.5,-.7],3));
const stone=new THREE.IcosahedronGeometry(.4,0),batches=[];
BuildTrenchSurface({SetSector(){},Add(key,geometry){batches.push({key,geometry});}},plan,Ground,{grass,stone});
assert.ok(batches.some(b=>b.key==='TrenchDryGrass'));
for(const {key,geometry} of batches){
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const gap=p.getY(i)-Ground(p.getX(i),p.getZ(i));
    assert.ok(Number.isFinite(gap));
    if(key==='TrenchDryGrass')assert.ok(gap>.054&&gap<.131,'draped mat follows the full bank footprint');
  }
  geometry.dispose();
}
grass.dispose();stone.dispose();
console.log('TrenchSurfaceTest: physical contact update/reset, measured grass direction, geometry and packed asset contracts passed');
