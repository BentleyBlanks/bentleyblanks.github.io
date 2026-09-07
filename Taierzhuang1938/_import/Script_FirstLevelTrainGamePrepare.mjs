// Preserve the frozen review library and derive a separately versioned game candidate.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadGlb,PoseScene} from './Script_LugouGlbPose.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const root=args[args.indexOf('--root')+1];assert.ok(args.includes('--root')&&root);
const version=args.includes('--version')?args[args.indexOf('--version')+1]:'FirstLevelTrainGameV2';
assert.match(version,/^FirstLevelTrainGameV[1-9]\d*$/);
const source=path.join(root,'Models/FirstLevelTrainSupportV2'),out=path.join(root,'Models',version);
const Read=name=>JSON.parse(fs.readFileSync(path.join(source,name),'utf8'));
const Hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.ok(fs.existsSync(path.join(source,'Data_VisualAssessment.json')),'Use the frozen reviewed source');
assert.ok(!fs.existsSync(path.join(out,'Data_VisualAssessment.json')),'Reviewed game version is immutable');
assert.deepEqual(Read('Data_ProductionSkinValidation.json').failures,[]);
const results=[];
fs.mkdirSync(out,{recursive:true});
for(const record of Read('Data_SupportBakeValidation.json').results){
 const filename=`Animation_${record.id}FirstLevelTrainSupport.glb`,file=path.join(source,filename);
 assert.equal(Hash(file),record.animationSha256);
 assert.equal(Hash(path.join(project,`Model/Character/Model_${record.id}.glb`)),record.originalModelSha256);
 const scene=new PoseScene(LoadGlb(file)),anchors=[];
 for(let profile=0;profile<5;profile++){
  scene.Apply(profile,478/60);
  const a=scene.world[scene.NodeIndex('Bip002 L Foot')],b=scene.world[scene.NodeIndex('Bip002 R Foot')];
  anchors.push([(a[12]+b[12])/2,0,(a[14]+b[14])/2]);
 }
 const anchor=anchors[2],maxAnchorError=Math.max(...anchors.map(p=>Math.hypot(p[0]-anchor[0],p[2]-anchor[2])));
 assert.ok(maxAnchorError<1e-5,'All height profiles share the same horizontal foot anchor');
 fs.copyFileSync(file,path.join(out,filename));
 results.push({id:record.id,file:filename,nominalScale:record.nominalScale,seatForwardOffsetM:record.seatForwardOffsetM,
  sourceAnchor:anchor,maxProfileAnchorErrorM:maxAnchorError*record.nominalScale,
  sourceAnimationSha256:record.animationSha256,originalModelSha256:record.originalModelSha256});
}
const manifest={version,status:'runtime_seated_support_and_rise_subset',
 sourceGroup:'FirstLevelTrainSupportV2',sourceReview:4,profiles:[.96,.98,1,1.02,1.04],
 clipPrefix:'FirstLevelTrainBench',sourceEndSeconds:478/60,riseSourceStartSeconds:4,
 approachSeconds:.4,releaseSeconds:.8,riseStaggerSeconds:.35,floorClearanceM:.002,floorReleaseSeconds:.12,
 notes:'The final source ankle midpoint defines a fixed horizontal actor anchor. No vertical recentering; physical AI retains world movement. Upper-body carriage gestures are authored overlays.',models:results};
fs.writeFileSync(path.join(out,'Data_FirstLevelTrainAnimation.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:out,models:results}));
