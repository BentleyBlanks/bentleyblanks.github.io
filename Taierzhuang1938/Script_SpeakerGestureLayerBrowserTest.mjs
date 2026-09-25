// 03-06 speaker gestures in the real first level (Script_SpeakerGestureLayer on the live speakers): every 03-06 front
// scene is played through the per-line player on sim time with the player looking at whoever talks, and the gesture
// layer is read off the speaking body each frame.
//   * lines with a gesture row gesture (weight > .5 for enough frames) unless the body is busy, and the ones picked for
//     the screenshots always do (a point with a rifle in the other hand, a beckon, the tank, the seated 06 Zhou);
//   * busy (firing etc.) for longer than fadeS means weight 0; a gesture cut by a shot never comes back; a gesture
//     is back to 0 a clip length after its line;
//   * after the whole frame (the actor's aim IK included) a pointing arm points at its target, the rifle keeps the
//     look direction the aim IK gives it, and the gesturing hand stays clear of the rifle;
//   * 07 and later: no body has a gesture layer (the Actor hooks are inert there).
// Usage: node Taierzhuang1938/Script_SpeakerGestureLayerBrowserTest.mjs [--stages=3,4,5,6] [--shots] [--ab] [--port=N]
//   --shots  first-person and close-up stills of the picked lines to _shots/SpeakerGestureLayer/
//   --scenes=TankRoadContact,...  only these scenes (debugging)
//   --ab     04 frame cost, same page, gesture layer on/off alternating, and the layer's own time per frame (Apply +
//            AfterHead, all bodies); gate: whole-frame p95 increase <= .3 ms or, when the whole frame is too noisy to
//            resolve that (headless on a shared machine: tens of ms), the layer's own p95 on gesture frames <= .3 ms
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),output=path.join(here,'_shots/SpeakerGestureLayer');
await fs.mkdir(output,{recursive:true});
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1];
const stages=(arg('stages')||'3,4,5,6').split(',').map(Number),shots=process.argv.includes('--shots'),ab=process.argv.includes('--ab');
const local=arg('port'),only=arg('scenes')?.split(',');   // --scenes=A,B: play only these (debugging; gates still apply)
// The 03-06 front scenes by step (Script_FirstLevelFrontScenes.FRONT_SCENE_IDS, in the order each step says them).
const SCENES={3:['FrontBlockade','FrontApproach','FrontAttack','FrontWithdraw'],4:['TakeOverGun','TankRoadContact','TankTerror','BundleOrder'],
  5:['BundleGo','BundleProne','BundleSupply','BundleReturnCall','BundleAttack','BundleRetreat','TankStopped','FrontRelief'],
  6:['Volunteer','BorrowLight','ZhouLift']};
// Lines that must gesture on screen (and are photographed with --shots): point with a rifle in the right hand,
// wave on, point at the tank (He Youtian kneeling at the gun), beckon, point south, and the seated Zhou's cigarette,
// offer and wait. (TakeOverGun.01 is not one: Luo is still walking up and shooting through it, so it gestures
// only when the fight allows.)
const PICKED=['FrontBlockade.02','FrontApproach.02','TankRoadContact.01','BundleOrder.03','Volunteer.01','BorrowLight.03','BorrowLight.07','ZhouLift.02'];
const LIMIT={upFrames:20,postAimDeg:15,muzzleDeg:10,rifleClearM:.05,lineTailS:.6,abP95Ms:.3};
const server=local?null:await ServeRoot(path.dirname(here),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const result={stages:{},shots:[]};
try{
  await page.goto(`http://127.0.0.1:${local||server.address().port}/Taierzhuang1938/?whitebox=p012&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
  await page.locator('#bootStart').click();
  await page.waitForFunction(()=>window.Tengxian.audio.ctx?.state==='running'&&window.Tengxian.audio.voiceBank.get('MissionGuideFollow')?.speechEnvelope,null,{timeout:120000});
  await page.evaluate(async({picked,limit})=>{
    const g=window.Tengxian,T=await import('three');
    const L=await import('./Script_SpeakerGestureLayer.mjs'),D=await import('./Data_FirstLevelSpeakerGestures.mjs');
    const {MISSION_DIALOGUE}=await import('./Data_FirstLevelMissionDialogue.mjs'),{FrontSceneSpeakers}=await import('./Script_FirstLevelFrontScenes.mjs');
    const {SPEAKER_GESTURE}=await import('./Data_Tuning_CharacterSpeech.mjs');
    // The body state the layer saw (posture report) and the layer's own time per frame.
    const proto=L.SpeakerGestureLayer.prototype,apply=proto.Apply,after=proto.AfterHead;
    const P=window.GestureProbe={g,T,L,D,SPEAKER_GESTURE,MISSION_DIALOGUE,FrontSceneSpeakers,picked,limit,layerMs:0,close:null};
    proto.Apply=function(dt,s={}){const t=performance.now();this.probePose={firing:!!s.firing,aim:+(s.aim||0).toFixed(2),move:+(s.moveSpeed||0).toFixed(2),
      crouch:+(s.crouch||0).toFixed(2),prone:+(s.prone||0).toFixed(2),sit:+(s.sit||0).toFixed(2),kneel:+(s.kneel||0).toFixed(2),
      lookYaw:s.lookYaw||0,lookPitch:s.lookPitch||0};
      const out=apply.call(this,dt,s);P.layerMs+=performance.now()-t;return out;};
    proto.AfterHead=function(){const t=performance.now();const out=after.call(this);P.layerMs+=performance.now()-t;return out;};
    // Line of sight (walls, trench sides, props; not the speaker himself): true when something is in between.
    const ray=new T.Raycaster();
    P.Blocked=(from,to,ignore)=>{
      const d=from.distanceTo(to);ray.set(from,to.clone().sub(from).normalize());ray.far=Math.max(0,d-.2);
      for(const hit of ray.intersectObjects(g.scene.children,true)){
        let o=hit.object,skip=o.isSprite||o.isLine||o.isPoints||o===g.viewmodel.root;
        for(let q=o;q&&!skip;q=q.parent)if(!q.visible||q===ignore||q===g.viewmodel.root)skip=true;
        if(!skip)return true;
      }
      return false;
    };
    P.Chest=soldier=>soldier.actor.characterRig.bones.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,-.3,0));
    // Player view of a speaker: stand 3.5-7 m off him where the chest is in sight (first try his front).
    P.View=soldier=>{
      const root=soldier.actor.root,f=new T.Vector3(0,0,-1).transformDirection(root.matrixWorld).setY(0).normalize(),chest=P.Chest(soldier);
      const here=g.player.EyePosition.clone();
      if(here.distanceTo(chest)<12&&!P.Blocked(here,chest,root))return 'kept';
      for(const d of [5,3.5,7])for(const a of [0,.5,-.5,1,-1,1.6,-1.6,2.4,-2.4]){
        const v=f.clone().applyAxisAngle(new T.Vector3(0,1,0),a);g.player.Spawn(soldier.position.x+v.x*d,soldier.position.z+v.z*d,0);
        if(!P.Blocked(g.player.EyePosition.clone(),chest,root))return `${d}m ${a}`;
      }
      return 'blocked';
    };
    P.Face=soldier=>{const eye=g.player.EyePosition.clone(),c=P.Chest(soldier).sub(eye);
      g.player.yaw=Math.atan2(-c.x,-c.z);g.player.pitch=Math.atan2(c.y,Math.hypot(c.x,c.z));};
    // Close-up: the production post chain from a camera about 2 m off the chest on the gesturing hand's side (about
    // 70 deg round from his front first, so a point toward his front is seen side-on), the first of a few
    // directions with a clear line of sight.
    P.CloseCamera=(soldier,hand)=>{
      const root=soldier.actor.root,f=new T.Vector3(0,0,-1).transformDirection(root.matrixWorld).setY(0).normalize(),chest=P.Chest(soldier),side=hand==='L'?1:-1;
      for(const [a,d,up] of [[1.2,2.2,.2],[.6,2.2,.1],[1.8,2.2,.3],[0,2.2,.1],[1.2,2.4,.9],[.6,2.2,.9],[0,3,.9],[-.6,2.2,.6]]){
        const pos=chest.clone().addScaledVector(f.clone().applyAxisAngle(new T.Vector3(0,1,0),a*side),d);pos.y+=up;
        if(!P.Blocked(pos,chest,root))return {pos,look:chest};
      }
      return {pos:chest.clone().addScaledVector(f,2.2).setY(chest.y+.1),look:chest};
    };
    P.render=g.post.Render;
    g.post.Render=function(scene,camera,options){
      const c=P.close;if(!c)return P.render.call(this,scene,camera,options);
      camera.position.copy(c.pos);camera.lookAt(c.look);camera.updateMatrixWorld(true);
      g.viewmodel.root.visible=false;const out=P.render.call(this,scene,camera,options);g.viewmodel.root.visible=true;return out;
    };
  },{picked:PICKED,limit:LIMIT});
  for(const n of stages){
    const t0=Date.now();
    result.stages[n]=await page.evaluate(async({n})=>{
      const P=window.GestureProbe,g=P.g;await g.Debug.FirstLevelJump(n);const r=g.Debug.FirstLevelMissionRuntime();g.player.health=1e9;
      g.StepFrames(240,1/60,true);
      // Scenes are played here, one after the other, on sim time: the step's own triggers, events and scene-done
      // callbacks are held so the step does not move on under the test.
      r.voice.dialogue.Clock=()=>NaN;
      P.held={done:r.voice.Done,event:r.voice.dialogue.Event,update:r.frontScenes.Update};
      r.voice.Done=null;r.voice.dialogue.Event=null;r.frontScenes.Update=()=>{};
      P.r=r;P.lines={};P.violations=[];P.tracks=new Map();
      return {stage:r.flow.stage.id};
    },{n});
    for(const id of SCENES[n].filter(id=>!only||only.includes(id))){
      await page.evaluate(async({id})=>{
        const P=window.GestureProbe,g=P.g,r=P.r,cue=P.MISSION_DIALOGUE.find(c=>c.id===id);
        for(let i=0;i<600&&[...r.voice.scenes.values()].some(h=>!h.done);i++)g.StepFrames(1,1/60,true);
        P.scene={id,cue,lastLine:null,frames:0,handle:r.voice.PlayScene(id,{speakers:P.FrontSceneSpeakers(cue,who=>r.frontScenes.Body(who))})};
      },{id});
      for(;;){
        const step=await page.evaluate(async({shots})=>{
          const P=window.GestureProbe,g=P.g,r=P.r,T=P.T,s=P.scene,h=s.handle,G=P.SPEAKER_GESTURE,V=()=>new T.Vector3();
          const D0=id=>P.D.SPEAKER_GESTURE_CLIPS[P.D.SpeakerGestureForLine(id)?.gesture]?.hand||'L';
          while(h&&!h.done&&s.frames<2400){
            const cur=h.lines.find(l=>l.state==='playing'&&l.line.who!=='shunzi'),body=cur&&r.frontScenes.Body(cur.line.who);
            if(body){
              if(cur.line.id!==s.lastLine){s.lastLine=cur.line.id;(P.views||={})[cur.line.id]=P.View(body);}
              P.Face(body);
            }
            g.StepFrames(1,1/60,true);s.frames++;
            // Every live speaker body with a gesture layer, whether it talks this frame or not.
            for(const who of new Set(s.cue.lines.map(l=>l.who))){
              if(who==='shunzi')continue;const soldier=r.frontScenes.Body(who),rig=soldier?.actor?.characterRig,gl=rig?.speakerGesture;
              if(!gl)continue;const st=gl.state,lineId=rig.facial?.lastSpeech?.active?rig.facial.lastSpeech.lineId:null;
              const track=P.tracks.get(gl)??(P.tracks.set(gl,{who,lastLine:null,lineEndAt:null,t:0,cancelled:new Set()}),P.tracks.get(gl));
              track.t+=1/60;
              if(lineId){track.lastLine=lineId;track.lineEndAt=null;}else if(track.lastLine&&track.lineEndAt==null)track.lineEndAt=track.t;
              if(st.phase==='cancelled'&&st.lineId)track.cancelled.add(st.lineId);
              const V2=(m,x)=>P.violations.length<40&&P.violations.push({who,line:st.lineId,m,x,scene:s.id,frame:s.frames});
              if(st.busyFor>=G.fadeS+1/60&&st.weight>0)V2('busy but weight',+st.weight.toFixed(3));
              if(st.lineId&&track.cancelled.has(st.lineId)&&st.weight>0&&st.phase!=='cancelled')V2('back after the shot',st.weight);
              if(!lineId&&track.lineEndAt!=null&&track.t-track.lineEndAt>2.2+P.limit.lineTailS&&st.weight>0)V2('up long after the line',track.t-track.lineEndAt);
              if(!lineId)continue;
              const row=P.lines[lineId]??={who,frames:0,up:0,maxW:0,clip:null,supp:{},lod:null,pose:null,postAim:[],layerAim:[],clamped:0,muzzle:null,muzzleDev:0,clear:Infinity,reach:null,phases:{}};
              if(row.who!==who)continue;
              row.frames++;row.lod=soldier.renderLod;row.maxW=Math.max(row.maxW,st.weight);if(st.weight>.5)row.up++;
              if(st.clip)row.clip=st.clip;if(st.suppressed)row.supp[st.suppressed]=(row.supp[st.suppressed]||0)+1;
              if(st.phase)row.phases[st.phase]=(row.phases[st.phase]||0)+1;
              if(row.frames===8)row.pose=gl.probePose;if(st.reachError!=null&&st.weight>.9)row.reach=st.reachError;
              const a=gl.active,actor=soldier.actor,root=actor.root;
              // Rifle direction: with the rifle up (aim 1) the actor's aim IK lays the barrel on the look direction
              // (Script_Actor._ApplyRiggedAim); a left-hand gesture must not change that.
              if(actor.weaponGroup?.visible&&actor.weaponTwoHanded){
                const pose=gl.probePose;
                if(st.weight>.9&&pose?.aim>=.99){
                  const look=V().set(0,0,-1).applyEuler(new T.Euler(Math.max(-1,Math.min(.9,pose.lookPitch)),Math.max(-1.4,Math.min(1.4,pose.lookYaw)),0,'YXZ'))
                    .applyQuaternion(root.getWorldQuaternion(new T.Quaternion()));
                  row.muzzleDev=Math.max(row.muzzleDev,actor.MuzzleDirection(V()).angleTo(look)*180/Math.PI);
                }
                // Gesturing hand (wrist and finger roots) to the rifle's segment (stock .35 m behind the grip, .9 m ahead)
                // in the hold: the lift starts on the fore-end and the release ends there.
                if(a&&st.weight>.9&&st.phase==='hold'&&a.record.hand==='L'){
                  const o=actor.weaponGroup.getWorldPosition(V()),dir=actor.MuzzleDirection(V()),pts=[a.bones.hand,...a.bones.roots].filter(Boolean);
                  for(const b of pts){const p=b.getWorldPosition(V()).sub(o),u=Math.max(-.35,Math.min(.9,p.dot(dir))),c=p.sub(dir.clone().multiplyScalar(u)).length();
                    if(c<row.clear){row.clear=c;row.clearAt={t:st.t,along:+u.toFixed(2),bone:b.name,prop:+(rig.infantryPropWeight||0).toFixed(2),clip:rig.currentId,lifts:st.rifleLift||0,two:!!a.twoHanded};}}
                }
              }
              // After the whole frame (aim IK included): shoulder -> hand against the target.
              if(a&&a.spec.aim&&st.weight>.95&&(st.phase==='hold')){
                const target=P.L.SpeakerGestureTargetPoint(a.row.target,{root,lookAt:rig.speakerHead?.lookAt},V());
                if(target){const sh=a.bones.upper.getWorldPosition(V()),hand=a.bones.hand.getWorldPosition(V());
                  row.postAim.push(hand.sub(sh).angleTo(target.sub(sh))*180/Math.PI);if(st.clamped)row.clamped++;if(st.aimError!=null)row.layerAim.push(st.aimError);}
              }
              // A picked line in its hold at full weight: stop for the stills (once per line).
              // ... and once before the lift (weight 0), from the same camera: the body as it would be without the gesture.
              if(shots&&P.picked.includes(lineId)&&!row.before&&st.weight===0){
                row.before=true;return {shot:{line:lineId,who,hand:D0(lineId),id:soldier.id,before:true}};
              }
              if(shots&&P.picked.includes(lineId)&&!row.shot&&st.weight>.95&&st.phase==='hold'&&st.lineId===lineId){
                row.shot=true;return {shot:{line:lineId,who,clip:st.clip,hand:st.hand,id:soldier.id}};
              }
            }
          }
          return {done:true,frames:s.frames,finished:!!h?.done};
        },{shots});
        if(step.done){result.stages[n][id]={frames:step.frames,finished:step.finished};break;}
        const name=step.shot.line.replace('.','_'),files=[];
        if(!step.shot.before){await page.screenshot({path:path.join(output,`${name}_Player.png`)});files.push(`${name}_Player.png`);}
        // Close-up, and where things are in the speaker's body frame (x right, y up, z back; metres from the neck).
        const geo=await page.evaluate(({id,hand})=>{const P=window.GestureProbe,r=P.r,T=P.T,soldier=r.ai.soldiers.find(s=>s.id===id),rig=soldier.actor.characterRig;
          P.close=P.CloseCamera(soldier,hand);P.g.post.NotifyCameraCut?.();P.g.StepFrames(1,1/60,true);
          const root=soldier.actor.root,inv=root.getWorldQuaternion(new T.Quaternion()).invert(),neck=rig.bones.neck.getWorldPosition(new T.Vector3());
          const at=b=>b?b.getWorldPosition(new T.Vector3()).sub(neck).applyQuaternion(inv).toArray().map(v=>+v.toFixed(2)):null;
          const muzzle=soldier.actor.weaponGroup?.visible?soldier.actor.MuzzleDirection(new T.Vector3()).applyQuaternion(inv).toArray().map(v=>+v.toFixed(2)):null;
          const st=rig.speakerGesture?.state||{},ga=rig.speakerGesture?.active,W=b=>b.getWorldPosition(new T.Vector3());
          const arm=ga?{reach:+W(ga.bones.upper).distanceTo(W(ga.bones.hand)).toFixed(3),length:+(W(ga.bones.upper).distanceTo(W(ga.bones.fore))+W(ga.bones.fore).distanceTo(W(ga.bones.hand))).toFixed(3),extend:ga.spec.extend??null}:null;
          return {handL:at(rig.bones.handL),handR:at(rig.bones.handR),grip:at(soldier.actor.weaponGroup),muzzle,weight:+(st.weight||0).toFixed(2),
            phase:st.phase,aimError:st.aimError,clamped:st.clamped,arm,camera:P.close.pos.toArray().map(v=>+v.toFixed(1))};},{id:step.shot.id,hand:step.shot.hand});
        const closeName=`${name}_${step.shot.before?'CloseBefore':'Close'}.png`;
        await page.screenshot({path:path.join(output,closeName)});files.push(closeName);
        await page.evaluate(()=>{const P=window.GestureProbe;P.close=null;P.g.post.NotifyCameraCut?.();});
        result.shots.push({...step.shot,files,geo});
      }
    }
    const tail=await page.evaluate(()=>{
      const P=window.GestureProbe,r=P.r;
      r.voice.Done=P.held.done;r.voice.dialogue.Event=P.held.event;r.frontScenes.Update=P.held.update;
      const lines={};
      for(const [id,row] of Object.entries(P.lines)){const a=[...row.postAim].sort((x,y)=>x-y);
        lines[id]={...row,postAim:a.length?{n:a.length,median:+a[a.length>>1].toFixed(1),max:+a.at(-1).toFixed(1)}:null,
          layerAim:row.layerAim.length?+[...row.layerAim].sort((x,y)=>x-y)[row.layerAim.length>>1].toFixed(1):null,muzzle:undefined,muzzleDev:+row.muzzleDev.toFixed(1),clear:Number.isFinite(row.clear)?+row.clear.toFixed(3):null};}
      return {lines,violations:P.violations,views:P.views};
    });
    Object.assign(result.stages[n],tail,{seconds:(Date.now()-t0)/1000});
  }
  if(ab){
    result.ab=await page.evaluate(async()=>{
      const P=window.GestureProbe,g=P.g;await g.Debug.FirstLevelJump(4);const r=g.Debug.FirstLevelMissionRuntime();g.player.health=1e9;
      g.StepFrames(240,1/60,true);r.voice.dialogue.Clock=()=>NaN;
      const luo=r.frontScenes.Body('luo');
      const Face=()=>P.Face(luo);P.View(luo);
      const Layers=()=>r.ai.soldiers.map(s=>s.actor?.characterRig?.speakerGesture).filter(Boolean);
      const SetOn=on=>{for(const l of Layers())l.enabled=on;};
      const Replay=()=>{for(const id of ['TankTerror','TankRoadContact','BundleOrder'])if(![...r.voice.scenes.keys()].includes(id)){const cue=P.MISSION_DIALOGUE.find(c=>c.id===id);
        r.voice.PlayScene(id,{speakers:P.FrontSceneSpeakers(cue,who=>r.frontScenes.Body(who))});break;}};
      const A=[],B=[],LA=[],LU=[],up={on:0,off:0};
      for(let round=0;round<20;round++){
        for(const on of (round%2?[true,false]:[false,true])){
          SetOn(on);Replay();for(let i=0;i<5;i++){Face();g.StepFrames(1,1/60,true);}
          for(let i=0;i<30;i++){Face();P.layerMs=0;const t=performance.now();g.StepFrames(1,1/60,true);const dt=performance.now()-t;
            (on?A:B).push(dt);const gestureUp=Layers().some(l=>l.state.weight>.5);if(on){LA.push(P.layerMs);if(gestureUp)LU.push(P.layerMs);}if(gestureUp)up[on?'on':'off']++;}
        }
      }
      SetOn(true);
      const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return +s[Math.min(s.length-1,Math.floor(p*s.length))].toFixed(3);};
      const mean=a=>+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(3);
      return {n:A.length,on:{mean:mean(A),p50:q(A,.5),p95:q(A,.95)},off:{mean:mean(B),p50:q(B,.5),p95:q(B,.95)},
        layerMs:{mean:mean(LA),p95:q(LA,.95),max:q(LA,1)},layerMsGestureUp:LU.length?{n:LU.length,mean:mean(LU),p95:q(LU,.95)}:null,gestureUpFrames:up};
    });
  }
  // 07 and later: the binder binds no head layer, so no gesture layer, and Script_Actor's two hooks read nothing.
  result.after06=await page.evaluate(async()=>{
    const g=window.Tengxian;await g.Debug.FirstLevelJump(8);const r=g.Debug.FirstLevelMissionRuntime();g.player.health=1e9;
    g.StepFrames(120,1/60,true);
    const rigs=r.ai.soldiers.map(s=>s.actor?.characterRig).filter(Boolean);
    return {stage:r.flow.stage.id,rigs:rigs.length,gestureLayers:rigs.filter(rig=>rig.speakerGesture).length,headLayers:rigs.filter(rig=>rig.speakerHead).length};
  });
}catch(error){result.error=String(error.stack||error);await page.screenshot({path:path.join(output,'Failure.png')}).catch(()=>{});}
finally{result.errors=errors;await fs.writeFile(path.join(output,'Data_SpeakerGestureLayer.json'),JSON.stringify(result,null,1));await browser.close();server?.close();}

// ---- report and gates --------------------------------------------------------------------------------------------
const {FIRST_LEVEL_SPEAKER_GESTURES}=await import('./Data_FirstLevelSpeakerGestures.mjs');
assert.ok(!result.error,result.error);
assert.deepEqual(result.errors,[],'page errors');
const all={};for(const stage of Object.values(result.stages))Object.assign(all,stage.lines||{});
const rows=Object.entries(all).filter(([id])=>FIRST_LEVEL_SPEAKER_GESTURES[id]?.gesture);
for(const [id,row] of Object.entries(all))console.log(id.padEnd(20),row.who.padEnd(9),`frames ${row.frames} up ${row.up} max ${row.maxW.toFixed(2)}`,
  row.clip||'-',JSON.stringify(row.supp),row.postAim?`aim ${row.postAim.median}/${row.postAim.max} deg (layer ${row.layerAim}, clamped ${row.clamped})`:'',row.clear!=null?`clear ${row.clear} m ${JSON.stringify(row.clearAt)}`:'',
  row.muzzleDev?`muzzle ${row.muzzleDev} deg`:'',JSON.stringify(row.pose||{}));
const gestured=rows.filter(([,row])=>row.up>=LIMIT.upFrames);
console.log(`gesture rows seen ${rows.length}, gestured ${gestured.length}; violations ${Object.values(result.stages).reduce((n,s)=>n+(s.violations?.length||0),0)}`);
for(const shot of result.shots)console.log('still',shot.line,shot.before?'before':'hold',JSON.stringify(shot.geo));
for(const stage of Object.values(result.stages))assert.deepEqual(stage.violations||[],[],'busy / cancelled / after-the-line weights');
for(const line of PICKED){
  const stageOf=Object.entries(SCENES).find(([,ids])=>ids.includes(line.split('.')[0]))?.[0];
  if(!stages.includes(+stageOf))continue;
  assert.ok(all[line]?.up>=LIMIT.upFrames,`${line} gestures on screen (${JSON.stringify(all[line])})`);
}
for(const [id,row] of rows){
  if(row.postAim&&row.clamped===0)assert.ok(row.postAim.median<=LIMIT.postAimDeg,`${id}: points at its target after the aim IK (${JSON.stringify(row.postAim)})`);
  if(row.muzzleDev)assert.ok(row.muzzleDev<=LIMIT.muzzleDeg,`${id}: rifle keeps its direction (${row.muzzleDev} deg)`);
  if(row.clear!=null)assert.ok(row.clear>=LIMIT.rifleClearM,`${id}: gesturing hand clear of the rifle (${row.clear} m)`);
}
assert.equal(result.after06.gestureLayers,0,`07+: no gesture layer (${JSON.stringify(result.after06)})`);
if(result.ab){
  console.log('A/B 04',JSON.stringify(result.ab));
  assert.ok(result.ab.gestureUpFrames.on>0,'A/B: gestures were up in the on half');
  assert.ok(result.ab.on.p95-result.ab.off.p95<=LIMIT.abP95Ms||(result.ab.layerMsGestureUp?.p95??result.ab.layerMs.p95)<=LIMIT.abP95Ms,
    `A/B: p95 increase ${(result.ab.on.p95-result.ab.off.p95).toFixed(3)} ms, layer p95 ${result.ab.layerMs.p95} ms`);
}
console.log(`ok speaker gesture layer: stages ${stages.join(',')}, ${gestured.length}/${rows.length} gesture lines up, ${result.shots.length} stills`);
