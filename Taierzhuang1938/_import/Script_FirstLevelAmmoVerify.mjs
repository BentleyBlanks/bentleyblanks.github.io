// Independently resample delivered GLB curves, including between authored keys.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LoadGlb,PoseScene} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):3;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const out=path.join(root,'Models','FirstLevelAmmoAuthorV'+revision),bake=JSON.parse(fs.readFileSync(path.join(out,'Data_AuthoredBake.json')));
assert.ok(!fs.existsSync(path.join(out,'Data_VisualAssessment.json')),'Preserve frozen validation; use a new revision');
const Hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),results=[];
for(const item of bake.results){
 const file=path.join(root,item.path);assert.equal(Hash(file),item.sha256);
 const source=LoadGlb(path.join(root,item.sourceModel)),delivered=LoadGlb(file),base=new PoseScene(source),model=new PoseScene(delivered);
 assert.equal(Hash(path.join(root,item.sourceModel)),item.sourceSha256);
 assert.deepEqual(delivered.json.nodes.slice(0,source.json.nodes.length),source.json.nodes);assert.deepEqual(delivered.json.skins,source.json.skins);
 base.Apply(base.AnimationIndex('FirstLevelTrainBench100'),0);
 const boneIds=model.nodes.map((n,i)=>/^Bip002/.test(n.name||'')?i:-1).filter(i=>i>=0);
 const low=boneIds.filter(i=>/ (Pelvis|[LR] (Thigh|Calf|Foot|Toe0))$/.test(model.nodes[i].name));assert.equal(low.length,9);
 const indexTip=model.nodes.findIndex(n=>n.name==='Bip002 R Finger12'),rootMotion=model.nodes.findIndex(n=>n.name==='Transform_ActualGameScale');
 assert.ok(indexTip>=0&&rootMotion>=0);
 let maxLowerDelta=0,maxBoneLengthDelta=0,maxRootDelta=0,maxIndexSampleError=0,endpointDelta=0;const endpoints=[];
 for(let frame=0;frame<=1200;frame++){
  const seconds=frame/120;model.Apply(0,seconds);
  for(const i of low)for(let j=0;j<16;j++)maxLowerDelta=Math.max(maxLowerDelta,Math.abs(model.world[i][j]-base.world[i][j]));
  for(const i of boneIds){const p=model.parent[i];if(p<0)continue;const Length=s=>Math.hypot(...[12,13,14].map(k=>s.world[i][k]-s.world[p][k]));maxBoneLengthDelta=Math.max(maxBoneLengthDelta,Math.abs(Length(model)-Length(base)));}
  for(const k of [12,13,14])maxRootDelta=Math.max(maxRootDelta,Math.abs(model.world[rootMotion][k]-base.world[rootMotion][k]));
  if(frame%2===0){const sample=item.samples[frame/2].rightIndexTip;maxIndexSampleError=Math.max(maxIndexSampleError,Math.hypot(...sample.map((x,k)=>x-model.world[indexTip][12+k])));}
  if(frame===0||frame===1200)endpoints.push(boneIds.flatMap(i=>Array.from(model.world[i])));
 }
 endpointDelta=Math.max(...endpoints[0].map((x,i)=>Math.abs(x-endpoints[1][i])));
 assert.ok(maxLowerDelta<.00001&&maxBoneLengthDelta<.00001&&maxRootDelta<.00001&&maxIndexSampleError<.00001&&endpointDelta<.00001);
 results.push({id:item.id,model:item.path,sha256:item.sha256,samples:1201,maxLowerDelta,maxBoneLengthDelta,maxRootDelta,maxIndexSampleError,endpointDelta});
}
const report={status:'passed',scope:'Original bind/hierarchy, static lower support, bone lengths and authored index trajectory. Contact surface, pouch support and naturalness require separate visual review.',results,errors:[]};
fs.writeFileSync(path.join(out,'Data_ExportValidation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({models:results.length,samples:results.reduce((n,r)=>n+r.samples,0),maxLowerDelta:Math.max(...results.map(r=>r.maxLowerDelta)),errors:[]}));
