import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CreatePeelBody,BindPeelSurface,WritePeelSurface,StepPeelBody} from './Script_PeelPhysics.mjs';

// Browser .js modules live in a CommonJS repository. Load the shared RNG as ESM
// for this CPU check without maintaining a second implementation of the RNG.
const ModuleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const utility=ModuleUrl(await fs.readFile(new URL('./Script_Util.js',import.meta.url),'utf8'));
const source=(await fs.readFile(new URL('./Script_WaxMorphology.mjs',import.meta.url),'utf8')).replace("'./Script_Util.js'",JSON.stringify(utility));
const {BuildWaxShape,BuildWaxDebris}=await import(ModuleUrl(source)),{MakeRng}=await import(utility);
let checks=0;const Check=(condition,label)=>{assert.ok(condition,label);checks++;};
function Audit(shape,components){
  const {positions:p,indices:ix}=shape,edges=new Map(),parent=Array.from({length:p.length/3},(_,i)=>i);
  const Root=i=>parent[i]===i?i:parent[i]=Root(parent[i]);
  let volume=0,minArea=Infinity;
  for(let i=0;i<ix.length;i+=3){
    const ids=Array.from(ix.slice(i,i+3)),[a,b,c]=ids.map(v=>Array.from(p.slice(v*3,v*3+3)));
    const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
    minArea=Math.min(minArea,Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]));
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let j=0;j<3;j++){
      const x=ids[j],y=ids[(j+1)%3],key=Math.min(x,y)+':'+Math.max(x,y),edge=edges.get(key)||[0,0];
      edge[0]++;edge[1]+=x<y?1:-1;edges.set(key,edge);parent[Root(x)]=Root(y);
    }
  }
  assert.ok(p.every(Number.isFinite)&&shape.response.every(Number.isFinite)&&shape.uv.every(Number.isFinite));
  assert.ok(minArea>1e-10&&volume>0,'no degenerate faces or reversed volume');
  assert.ok([...edges.values()].every(([count,winding])=>count===2&&winding===0),'closed consistently oriented surface');
  assert.equal(new Set(parent.map((_,i)=>Root(i))).size,components);
  return volume;
}
for(const type of ['dry','wet','impacted']){
  const volumes=[];
  for(let seed=1;seed<=32;seed++){
    const options={seed,type,radii:[.85,1.15]},shape=BuildWaxShape(options);
    volumes.push(Audit(shape,1));
    assert.deepEqual(BuildWaxShape(options),shape,'same seed reproduces every surface attribute');
    const body=BindPeelSurface(CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.8,type,footprint:options.radii}),shape.positions,shape.indices);
    const output=new Float32Array(shape.positions.length);WritePeelSurface(body,output);
    assert.ok(output.every((v,i)=>Math.abs(v-shape.positions[i])<1e-6),'binding preserves curls and thickness');
    for(let frame=0;frame<3;frame++)StepPeelBody(body,{},1/60);
    WritePeelSurface(body,output);
    assert.ok(output.every((v,i)=>Math.abs(v-shape.positions[i])<1e-5),'attached asymmetric shell does not drift');
  }
  Check(new Set(volumes.map(v=>v.toFixed(6))).size===32,type+': 32 distinct deterministic closed shapes bind without drift');
}
for(let seed=1;seed<=64;seed++){
  const rng=MakeRng(seed),reference=MakeRng(seed),shape=BuildWaxDebris(rng,seed);
  Audit(shape,9);
  assert.deepEqual(shape,BuildWaxDebris(MakeRng(seed),seed));
  for(let i=0;i<27;i++)reference();assert.equal(rng(),reference(),'detail does not consume customer placement randomness');
  assert.ok(shape.positions.every((v,i)=>i%3===0?Math.abs(v)<=.38:i%3===1?Math.abs(v)<=.42:true),'all grains fit actual working-end footprint');
  assert.equal(new Set(shape.grains.map(g=>g.variant)).size,3);
  const thickness=Array.from(shape.response).filter((v,i)=>i%3===0);
  assert.ok(Math.max(...thickness)>Math.min(...thickness)*4,'debris has thin edges and distinct thick crumbs');
}
Check(true,'64 debris seeds: 9 closed chips, three forms, bounded contact footprint, varied thickness and stable placement RNG');
console.log('PASS '+checks+' morphology suites (96 shell shapes and 576 individual chips)');
