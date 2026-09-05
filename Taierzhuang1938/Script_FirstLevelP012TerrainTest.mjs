import assert from 'node:assert/strict';
import {CreateP012Terrain} from './Data_FirstLevelP012Terrain.mjs';
import {FIRST_LEVEL_P012_LAYOUT as layout,P012_ROUTES} from './Data_FirstLevelP012Layout.mjs';
const terrain=CreateP012Terrain(layout), {SampleHeight}=terrain;
let min=Infinity,max=-Infinity,sloped=0,triangles=0;
for(const height of terrain.heights){min=Math.min(min,height);max=Math.max(max,height);if(Math.abs(height)>.1)sloped++;}
assert.ok(min<-.2&&max>3&&sloped>terrain.heights.length*.4,'the base soil is a varied heightfield, including shallow hollows');
for(const block of [...layout.blocks,...layout.gates]){
 const c=Math.cos(block.ry||0),s=Math.sin(block.ry||0);
 for(const u of [-.5,0,.5])for(const v of [-.5,0,.5]){
  const dx=u*block.w,dz=v*block.d;
  assert.ok(Math.abs(SampleHeight(block.x+dx*c+dz*s,block.z-dx*s+dz*c))<1e-6,`${block.id} foundation remains level`);
 }
}
// Painted authored routes and their clear walking width stay on their soil apron.
for(const key of ['village','north','south','retreat','trainExit','ammoCarry']){
 const route=P012_ROUTES[key];
 for(let i=1;i<route.length;i++)for(let n=0;n<=10;n++){
  const a=route[i-1],b=route[i],t=n/10;
  assert.ok(Math.abs(SampleHeight(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))<1e-6,`${key} route remains on ground`);
 }
}
// Test barycentric samples on both actual mesh triangles, including chunk seams.
for(const chunk of terrain.Chunks()){
 triangles+=chunk.indices.length/3;
 for(let i=0;i<chunk.indices.length;i+=3){
  const ids=chunk.indices.slice(i,i+3),p=ids.map(at=>chunk.positions.slice(at*3,at*3+3));
  for(const weights of [[.2,.3,.5],[.6,.1,.3]]){
   const xyz=[0,1,2].map(axis=>p.reduce((sum,v,j)=>sum+v[axis]*weights[j],0));
   assert.ok(Math.abs(SampleHeight(xyz[0],xyz[2])-xyz[1])<2e-6,'ground query matches rendered triangle');
  }
 }
}
assert.equal(triangles,terrain.cols*terrain.rows*2);
console.log('PASS P012 terrain',JSON.stringify({min,max,sloped,triangles}), 'foundations, routes and every rendered triangle agree');
