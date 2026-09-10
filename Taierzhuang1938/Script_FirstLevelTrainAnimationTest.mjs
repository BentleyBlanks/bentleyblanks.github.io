// Actual original-rig sampling, shared-deck contacts and real queue handoff.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
await import('./_import/Script_FirstLevelTrainGameVerify.mjs');
const project=path.dirname(fileURLToPath(import.meta.url)),version=JSON.parse(await fs.readFile(path.join(project,'Animation/FirstLevelTrain/Data_FirstLevelTrainAnimation.json'),'utf8')).version;
const args=process.argv.slice(2),outputGroup=args.includes('--output-group')?args[args.indexOf('--output-group')+1]:version;
assert.match(outputGroup,/^FirstLevelTrain[A-Za-z0-9]+$/);
const out=path.join(project,'_shots',outputGroup);
const runtimeFiles=['Script_FirstLevelTrainAnimation.mjs','Script_FirstLevelMissionTrainLife.mjs','Script_FirstLevelMissionTrain.mjs',
 'Script_FirstLevelMissionView.mjs','Script_FirstLevelMissionRuntime.mjs','Script_FirstLevelP012CastAppearance.mjs','Script_Main.mjs','Animation/FirstLevelTrain/Data_FirstLevelTrainAnimation.json',
 'Data_FirstLevelMission.mjs','Data_FirstLevelMissionTrain.mjs','Data_FirstLevelMissionLayout.mjs',
 'Data_FirstLevelMissionCrowd.mjs','Data_FirstLevelMissionFront.mjs','Data_Tuning_FirstLevel.mjs',
 'Data_FirstLevelMissionVoiceTiming.mjs','Data_FirstLevelMissionVoiceAlignment.mjs','Data_FirstLevelMissionDialogue.mjs',
 'Script_FirstLevelMissionColumn.mjs','Script_FirstLevelMissionPeople.mjs','Script_FirstLevelMissionVoice.mjs','index.html'];
const runtimeHashes=Object.fromEntries(await Promise.all(runtimeFiles.map(async p=>[p,createHash('sha256').update(await fs.readFile(path.join(project,p))).digest('hex')])));
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser(),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`);
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
 const initial=await page.evaluate(async()=>{
  const g=window.Tengxian,{ProbeFirstLevelTrainContact}=await import('./_import/Script_FirstLevelTrainContactProbe.mjs');
  const T=await import('three'),{clone}=await import('./vendor/three/examples/jsm/utils/SkeletonUtils.js');
  g.StepFrames(1,1/60,true);
  const passengers=g.ai.soldiers.filter(a=>a.missionTrainPassenger);
  const Snapshot=()=>({time:g.Debug.FirstLevelMission().time,actors:passengers.map(a=>({id:a.id,p:a.position.toArray(),root:a.actor.root.position.toArray(),life:{...a.missionTrainLife},
   bones:Object.values(a.actor.characterRig.bones).map(b=>[b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()])}))});
  for(let i=0;i<180*60&&!g.Debug.FirstLevelMission().train.open;i++){
   if(g.Debug.FirstLevelMission().openingPrompt?.keys==='Z')g.Debug.Key('KeyZ');g.StepFrames(1,1/60,false);
  }
  // The player now finishes rescue facing east. Observe the intact north wagon
  // via the same mouse-delta adapter, so its actual rise is in the full-detail view.
  const yaw=Math.atan2(g.player.position.x+77,g.player.position.z-74);
  g.Debug.Look(-Math.atan2(Math.sin(yaw-g.player.yaw),Math.cos(yaw-g.player.yaw))/.0022,g.player.pitch/.0022);
  g.StepFrames(1,1/60,true);
  const start=g.Debug.FirstLevelMission();
  const rows=passengers.map(a=>({id:a.id,kind:a.missionTrainLife.kind,model:a.actor.characterRig.modelId,seated:a.missionTrainLife.seated,samples:[]}));
  for(const a of passengers){
   const rig=a.actor.characterRig,sampler=rig?.firstLevelTrainAnimation;if(!sampler)continue;
   const update=rig.mixer.update;rig.mixer.update=function(...args){
    const result=update.apply(this,args),b=rig.bones.pelvis;
    rig.trainNativeMixerSample={worldY:b.getWorldPosition(new T.Vector3()).y,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()};return result;
   };
   const sample=sampler.Sample;sampler.Sample=function(...args){
    a.actor.root.updateMatrixWorld(true);const b=rig.bones.pelvis;
    rig.trainNativeSample={worldY:b.getWorldPosition(new T.Vector3()).y,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()};
    return sample.apply(this,args);
   };
  }
  window.TrainTransitionProbe={passengers,rows,Snapshot,ProbeFirstLevelTrainContact,start,T,clone,native:new Map()};
  return {count:passengers.length,open:start.train.open,counts:start.train.counts,log:start.log};
 });
 assert.equal(initial.count,41);assert.deepEqual(initial.counts,[12,16,12]);assert.ok(initial.open);
 for(let chunk=0;chunk<8;chunk++){
  await page.evaluate(chunk=>{
   const g=window.Tengxian,p=TrainTransitionProbe;
   for(let frame=0;frame<120;frame++){
    g.StepFrames(1,1/60,true);
    p.passengers.forEach((a,i)=>{
     if(!a.missionTrainLife.seated)return;
     const rig=a.actor.characterRig,pose=rig.missionTrainLifeState;
     if(!a.actor.root.visible)return;
     const observed=p.rows[i];
     if(!rig.missionTrainLifeActive){
      if(!observed.samples.at(-1)?.walkReleaseTime)return;
      observed.releasedAt??=g.Debug.FirstLevelMission().time;
      if(g.Debug.FirstLevelMission().time-observed.releasedAt>.3)return;
     }
     a.actor.root.updateMatrixWorld(true);
     const local=role=>a.actor.root.worldToLocal(rig.bones[role].getWorldPosition(a.position.clone())).toArray();
     const row={frame:chunk*120+frame,time:g.Debug.FirstLevelMission().time,poseTime:rig.missionTrainLifeActive?pose.time:g.Debug.FirstLevelMission().time,rise:a.missionTrainLife.riseSeconds,
      weight:a.missionTrainLife.weight,poseWeight:rig.missionTrainLifeActive?pose.poseWeight:0,
      walkReleaseTime:rig.missionTrainLifeActive?pose.walkReleaseTime:rig.firstLevelTrainAnimation.config.releaseSeconds,source:pose.sourceSeconds,
      scale:a.actor.root.scale.y,physical:a.position.toArray(),deckY:a.missionTrainLife.deckY,yaw:a.yaw,pelvis:local('pelvis'),feet:['footL','footR'].map(local)};
     if(row.walkReleaseTime>0){
      let native=p.native.get(a.id);
      if(!native){const root=p.clone(rig.asset.gltf.scene);native={root,mixer:new p.T.AnimationMixer(root)};p.native.set(a.id,native)}
      native.mixer.stopAllAction();
      for(const source of rig.mixer._actions)if(source.isScheduled()&&source.getEffectiveWeight()>0){
       const action=native.mixer.clipAction(source.getClip()).reset().setLoop(p.T.LoopOnce,1);
       action.clampWhenFinished=true;action.setEffectiveWeight(source.getEffectiveWeight());action.play();action.time=source.time;action.paused=true;
      }
      native.mixer.update(0);
      // Compare mixer to mixer, before legitimate stand-idle FK is layered on
      // the first fully released frame. Comparing the final pelvis to raw clips
      // would mistake that new shared overlay for a contaminated sampler.
      const bone=rig.bones.pelvis,base=rig.trainNativeMixerSample;
      const source=base?{name:bone.name,position:new p.T.Vector3(...base.p),quaternion:new p.T.Quaternion(...base.q),scale:new p.T.Vector3(...base.s)}:bone;
      const expected=native.root.getObjectByName(source.name);
      row.nativeWorldY=base?base.worldY:bone.getWorldPosition(new p.T.Vector3()).y;
      const q=source.quaternion.toArray(),expectedQ=expected.quaternion.toArray();
      const rotationError=Math.min(Math.hypot(...q.map((v,i)=>v-expectedQ[i])),Math.hypot(...q.map((v,i)=>v+expectedQ[i])));
      row.nativePelvisError=Math.max(source.position.distanceTo(expected.position),rotationError,source.scale.distanceTo(expected.scale));
      row.nativeClip=rig.currentId;
     }
     if(frame%30===0||row.walkReleaseTime>0)row.contact=p.ProbeFirstLevelTrainContact(g,a);
     p.rows[i].samples.push(row);
    });
   }
  },chunk);
  if([0,1,2,4,7].includes(chunk))await page.screenshot({path:path.join(out,'Scene_RealTrainRise'+chunk+'.png')});
  if(chunk===0){
   const paused=await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Pause();const before=JSON.stringify(TrainTransitionProbe.Snapshot());g.StepFrames(300,1/60,false);const same=before===JSON.stringify(TrainTransitionProbe.Snapshot());g.Debug.MenuAct('resume');return same});
   assert.ok(paused,'Pausing during the actual rise freezes curves, physical roots and mission time');
  }
 }
 const result=await page.evaluate(()=>({initial:TrainTransitionProbe.start,rows:TrainTransitionProbe.rows,final:window.Tengxian.Debug.FirstLevelMission()}));
 const failures=[],summary=[];
 for(const row of result.rows.filter(r=>r.seated)){
  let maxStationaryFootDrift=0,maxPelvisSpeed=0,maxNativePelvisSpeed=0,maxNativePelvisError=0,minWaitingPelvis=Infinity,contactCount=0,previous=null,anchor=null,waiting=0;
  for(const s of row.samples){
   if(s.contact){contactCount++;if(s.contact.penetrating||s.contact.deckPenetrating)failures.push({id:row.id,reason:'skin_support',sample:s})}
   const stationary=previous&&Math.hypot(s.physical[0]-previous.physical[0],s.physical[2]-previous.physical[2])<1e-4;
   if(s.weight===0&&s.walkReleaseTime===0){waiting++;minWaitingPelvis=Math.min(minWaitingPelvis,s.pelvis[1]*s.scale+s.physical[1]-s.deckY)}
   if(previous&&s.poseTime>previous.poseTime&&s.poseTime-previous.poseTime<.05){
    const dy=(s.pelvis[1]-previous.pelvis[1])*s.scale+s.physical[1]-previous.physical[1];
    const speed=Math.abs(dy)/(s.poseTime-previous.poseTime);
    if(s.poseWeight>0||previous.poseWeight>0)maxPelvisSpeed=Math.max(maxPelvisSpeed,speed);
    else maxNativePelvisSpeed=Math.max(maxNativePelvisSpeed,speed);
   }
   maxNativePelvisError=Math.max(maxNativePelvisError,s.nativePelvisError||0);
   if(stationary&&s.walkReleaseTime===0&&Math.abs(s.yaw-previous.yaw)<1e-5){
    anchor??=s;
    for(let i=0;i<2;i++){
     const feet=s.feet[i],base=anchor.feet[i];
     const dx=(feet[0]-base[0])*s.scale,dz=(feet[2]-base[2])*s.scale,dy=(feet[1]-base[1])*s.scale+s.physical[1]-anchor.physical[1];
     maxStationaryFootDrift=Math.max(maxStationaryFootDrift,Math.hypot(dx,dy,dz));
    }
   }else anchor=null;
   previous=s;
  }
  const metrics={id:row.id,model:row.model,samples:row.samples.length,waiting,contactCount,maxStationaryFootDrift,maxPelvisSpeed,maxNativePelvisSpeed,maxNativePelvisError,minWaitingPelvis:Number.isFinite(minWaitingPelvis)?minWaitingPelvis:null};summary.push(metrics);
  // The authored transition must be continuous. Once fully released, compare
  // the pelvis to an independent mixer of the existing clips. Their own loop
  // seams are reported separately; retaining one is not accepting a new walk.
  if(maxStationaryFootDrift>.005||maxPelvisSpeed>1.6||maxNativePelvisError>1e-5||(waiting&&minWaitingPelvis<.9))failures.push(metrics);
 }
 await fs.writeFile(path.join(out,'Data_RealTrainTransition.json'),JSON.stringify({runtimeHashes,initial,summary,failures,errors,...result},null,2));
 console.log('TRAIN_TRANSITION',JSON.stringify({summary,failures:failures.slice(0,6),failureCount:failures.length}));
 assert.ok(summary.filter(r=>r.samples>200).length>=4,'Several real seated actors must be observed throughout their rise');
 assert.ok(summary.some(r=>r.waiting>30),'An actual passenger waits upright for the door queue');
 const lowPoses=await page.evaluate(async()=>{
  const g=window.Tengxian,T=await import('three'),{InstallP012OpeningPose}=await import('./Script_FirstLevelP012CastAppearance.mjs');
  const results=[];
  for(let variant=0;variant<4;variant++){
   const actor=g.actorFactory.Create('nra',{weapon:'HanYang',modelVariant:variant,seed:901+variant});
   const soldier={actor,alive:true};InstallP012OpeningPose(soldier);
   const rig=actor.characterRig,at=role=>{actor.root.updateMatrixWorld(true);return rig.bones[role].getWorldPosition(new T.Vector3());};
   const lengths=()=>['L','R'].map(side=>at('thigh'+side).distanceTo(at('calf'+side))+at('calf'+side).distanceTo(at('foot'+side)));
   for(let i=0;i<120;i++)actor.Update(1/60,{});
   const standingLengths=lengths();
   for(let i=0;i<60;i++)actor.Update(1/60,{crouch:1});
   const crouch={head:at('head').y,pelvis:at('pelvis').y,lengths:lengths()};
   for(let i=0;i<60;i++)actor.Update(1/60,{prone:1});
   const prone={head:at('head').y,lengths:lengths(),span:Math.abs(at('head').z-(at('footL').z+at('footR').z)/2),supported:rig.p012ProneSupported};
   for(let i=0;i<120;i++)actor.Update(1/60,{});
   const recovered={head:at('head').y,lengths:lengths()};
   results.push({variant,standingLengths,crouch,prone,recovered});actor.Dispose();
  }
  return results;
 });
 await fs.writeFile(path.join(out,'Data_LowPoseRecovery.json'),JSON.stringify(lowPoses,null,2));
 for(const row of lowPoses){
  assert.ok(row.crouch.head>.75&&row.crouch.head<1.35&&row.crouch.pelvis>.15,'crouch remains a complete kneeling body');
  assert.ok(row.prone.supported&&row.prone.span>1.05&&row.prone.head<.8,'prone extends legs behind torso instead of folding into a ball');
  assert.ok(row.recovered.head>1.3,'standing recovers full height after low pose');
  // The imported crouch clip itself has different translation tracks. The
  // prone correction samples RifleIdle; verify its original standing lengths
  // and recovery, rather than equating two distinct authored clips.
  for(const phase of [row.prone,row.recovered])for(let i=0;i<2;i++)assert.ok(Math.abs(phase.lengths[i]-row.standingLengths[i])<.005,'prone and recovery preserve the original RifleIdle bone lengths');
 }
 console.log('LOW_POSE_RECOVERY',JSON.stringify(lowPoses));
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
