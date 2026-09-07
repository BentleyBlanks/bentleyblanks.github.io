// Record actual four-tread geometry and the existing candidate before contact fitting.
// This writes measurements only; it never rewrites source, raw joints or reviewed GLBs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MISSION_LAYOUT} from '../Data_FirstLevelMissionLayout.mjs';
import {MISSION_TRAIN} from '../Data_FirstLevelMissionTrain.mjs';
import {LoadGlb,PoseScene,BuildSkin,MinSkinnedY} from './Script_LugouGlbPose.mjs';

const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(args.includes('--root')&&root);
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const Read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const Hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const catalog=Read(path.join(root,'Preview/Data_Catalog.json'));
const action=catalog.actions.find(a=>a.id==='TrainStairDisembark');
const variant=action.variants.find(v=>v.id===action.latestByFaction.Nra);
const candidate=path.join(root,variant.path),glb=LoadGlb(candidate),scene=new PoseScene(glb),skin=BuildSkin(glb);
const samples=[];
for(const seconds of [0,1,3,3.5,4,4.5,5,5.5,6,6.5,7,8,9,299/30]){
  scene.Apply(0,seconds);
  const Position=name=>Array.from(scene.world[scene.NodeIndex(name)]).slice(12,15);
  samples.push({sourceSeconds:seconds,pelvis:Position('Bip002 Pelvis'),
    leftAnkle:Position('Bip002 L Foot'),rightAnkle:Position('Bip002 R Foot'),lowestSkinY:MinSkinnedY(scene,skin)});
}
const stairGroups=MISSION_TRAIN.cars.map(car=>{
  const treads=MISSION_LAYOUT.blocks.filter(b=>b.id.startsWith('StationExitStep'+car.carIndex+'_')).sort((a,b)=>a.x-b.x)
    .map(b=>({id:b.id,x:b.x,z:b.z,widthM:b.w,lateralSpanM:b.d,topY:b.y+b.h/2,minX:b.x-b.w/2,maxX:b.x+b.w/2}));
  assert.ok(treads.length);
  const deck=MISSION_LAYOUT.blocks.find(b=>b.id==='StationCar'+car.carIndex+'Floor');
  assert.ok(deck,'Actual train deck must be found before comparing steps');
  const deckY=deck.y+deck.h/2;
  return {carIndex:car.carIndex,deckY,treads,
    dropsFromPreviousSurfaceM:treads.map((s,i)=>(i?treads[i-1].topY:deckY)-s.topY),
    originalPhysicalRoute:car.exit,hasSeparateStairHandrail:MISSION_LAYOUT.blocks.some(b=>/Rail|Handrail/i.test(b.id)&&b.x>treads[0].minX&&b.x<treads.at(-1).maxX&&Math.abs(b.z-car.z)<2.2)};
});
const report={status:'measured_pending_contact_fit',acceptedForGame:false,recordedUtc:new Date().toISOString(),
  candidate:variant.path,candidateSha256:Hash(candidate),sourceVideoSha256:Hash(path.join(root,variant.review.sourceVideo)),
  layoutSha256:Hash(path.join(project,'Data_FirstLevelMissionLayout.mjs')),stairGroups,samples,
  candidateSpaceDescentM:samples[0].lowestSkinY-samples.at(-1).lowestSkinY,
  limitations:['Candidate measurements are in exported review metres before game actor size scaling.',
    'Source shows a top platform and two lower treads, then floor; game has four exit treads after the car deck.',
    'The source handrail and phase timing cannot be copied onto the physical queue without separate fitting.',
    'Do not change original bone lengths, actor movement authority, mission facts or source clock to disguise this mismatch.']};
const group=args.includes('--group')?args[args.indexOf('--group')+1]:'FirstLevelStairFitV2';
assert.match(group,/^FirstLevelStairFitV[1-9]\d*$/);
const out=path.join(root,'Models',group);fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'Data_StairFitInspection.json'),JSON.stringify(report,null,2)+'\n');
// Dense ankle/toe trajectories are kinematic measurements, not inferred sole
// contacts. Keeping both feet separate exposes missing descents and foot drift
// before any attempt to fit this source to the game's four treads.
const duration=variant.review.sourceRangeSeconds[1]-variant.review.sourceRangeSeconds[0];
const trajectory=[];
for(let frame=0;frame<=Math.round(duration*60);frame++){
  const seconds=Math.min(duration,frame/60);scene.Apply(0,seconds);
  const Position=name=>Array.from(scene.world[scene.NodeIndex(name)]).slice(12,15);
  trajectory.push({sourceSeconds:variant.review.sourceRangeSeconds[0]+seconds,
    pelvis:Position('Bip002 Pelvis'),
    leftAnkle:Position('Bip002 L Foot'),leftToe:Position('Bip002 L Toe0'),
    rightAnkle:Position('Bip002 R Foot'),rightToe:Position('Bip002 R Toe0')});
}
assert.ok(trajectory.length>100&&trajectory.every(row=>Object.values(row).flat().every(Number.isFinite)));
fs.writeFileSync(path.join(out,'Data_StairFootTrajectories.json'),JSON.stringify({
  status:'measured_pending_source_contact_annotation',acceptedForGame:false,
  candidate:report.candidate,candidateSha256:report.candidateSha256,sourceVideoSha256:report.sourceVideoSha256,
  sampleFps:60,coordinates:'exported review world metres, Y up, before game actor height scaling',
  warning:'Ankle/toe joint heights are not shoe-sole heights. No support windows, contact state or game step timing have been accepted.',
  samples:trajectory},null,2)+'\n');
console.log(JSON.stringify({status:report.status,candidateSpaceDescentM:report.candidateSpaceDescentM,stairGroups}));
