// 03-06 speaker gestures in the real first level (Script_SpeakerGestureLayer on the live speakers): every 03-06 front
// scene is played through the per-line player on sim time with the player looking at whoever talks, and the gesture
// layer is read off the speaking body each frame.
//   * lines with a gesture row gesture (weight > .5 for enough frames) unless the body is busy, and the ones picked for
//     the screenshots always do (a point with a rifle in the other hand, a beckon, the tank, the seated 06 Zhou);
//   * busy (firing etc.) for longer than fadeS means weight 0; a gesture cut by a shot never comes back; a gesture
//     is back to 0 a clip length after its line;
//   * after the whole frame (the actor's aim IK included) a pointing arm points at its target, the rifle keeps the
//     look direction the aim IK gives it, and the gesturing hand stays clear of the rifle;
//   * the gesturing arm (shoulder -> elbow -> wrist -> fingertips, after the whole frame) never reaches the level's
//     walls (static colliders, the same ray the game uses) on a frame the gesture is up;
//   * 07 and later: no body has a gesture layer (the Actor hooks are inert there);
//   * every row the runtime refuses for a reason that does not change from run to run (target out of reach or across
//     the rifle, wounded, no clip ...) is in KNOWN_REFUSALS, so the table and the game agree.
// Usage: node Taierzhuang1938/Script_SpeakerGestureLayerBrowserTest.mjs [--stages=3,4,5,6] [--shots] [--ab] [--port=N]
//   --shots  first-person and close-up stills of the picked lines to _shots/SpeakerGestureLayer/
//   --scenes=TankRoadContact,...  only these scenes (debugging)
//   --ab     04 frame cost, same page, gesture layer on/off alternating. The whole-frame on/off p95 is reported but
//            not gated: headless on a shared machine a frame is 35-200 ms and its p95 moves by tens of ms from run
//            to run (2026-09-25: +2.1, -4.3, +3.0 ms), so it cannot resolve .3 ms. Gated instead: the layer's own
//            time (Apply + AfterHead + AfterActorAim, all bodies; the only work the layer adds to a frame), averaged
//            over the frames with a gesture up: p95 of the per-frame readings <= .3 ms (performance.now is clamped to
//            .1 ms here, a reading is 0, .1, .2 ...), and their mean <= .3 ms (the clamp's jitter averages out over
//            hundreds of frames; 30-frame block means are printed). Frames over 1 ms are listed with the gesture
//            starts in them (a start binds the clip's bones and measures its stroke once per body and clip).
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
// (TankRoadContact.01 is not one either: the tank is on He Youtian's rifle side, see KNOWN_REFUSALS; BundleOrder.03 is
// often cut by a shot; the beckon is FrontWithdraw.01 / BundleRetreat.01.)
const PICKED=['FrontBlockade.02','FrontApproach.02','FrontWithdraw.01','BundleSupply.01','BundleAttack.01','BundleRetreat.01','Volunteer.01',
  'BorrowLight.03','BorrowLight.07','ZhouLift.02'];
const LIMIT={upFrames:20,postAimDeg:15,muzzleDeg:10,rifleClearM:.05,lineTailS:.6,layerMs:.3};
// Refusals that do not depend on the fight (who shoots when): a row refused for one of these reasons and not listed
// here fails the test. TankRoadContact.01: the tank comes out on He Youtian's right, his rifle side, about 33 deg
// past the arm's cone (2026-09-25 layout); the point is kept in the table for a tank in reach.
const STRUCTURAL=new Set(['targetOutOfReach','targetAcrossRifle','wounded','rightHandOnWeapon','noClip','loadFailed','director','forcedClip']);
const KNOWN_REFUSALS={'TankRoadContact.01':['targetAcrossRifle']};
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
    // The body state the layer saw (posture report) and the layer's own time per frame (Apply, AfterHead, AfterActorAim).
    const proto=L.SpeakerGestureLayer.prototype,apply=proto.Apply,after=proto.AfterHead;
    const P=window.GestureProbe={g,T,L,D,SPEAKER_GESTURE,MISSION_DIALOGUE,FrontSceneSpeakers,picked,limit,layerMs:0,close:null};
    proto.Apply=function(dt,s={}){const t=performance.now();this.probePose={firing:!!s.firing,aim:+(s.aim||0).toFixed(2),move:+(s.moveSpeed||0).toFixed(2),
      crouch:+(s.crouch||0).toFixed(2),prone:+(s.prone||0).toFixed(2),sit:+(s.sit||0).toFixed(2),kneel:+(s.kneel||0).toFixed(2),
      lookYaw:s.lookYaw||0,lookPitch:s.lookPitch||0};
      const out=apply.call(this,dt,s);P.layerMs+=performance.now()-t;return out;};
    proto.AfterHead=function(){const t=performance.now();const out=after.call(this);P.layerMs+=performance.now()-t;return out;};
    const start=proto._Start;P.starts=0;
    proto._Start=function(...a){P.starts++;return start.apply(this,a);};
    const afterAim=proto.AfterActorAim;
    proto.AfterActorAim=function(){const t=performance.now();const out=afterAim.call(this);P.layerMs+=performance.now()-t;return out;};
    // Line of sight (walls, trench sides, props, other men; not the speaker himself): true when something is in
    // between. Skinned bodies do not raycast reliably (bind-pose bounds), so every other live soldier also counts as
    // a standing column of radius .3 m from his feet to 1.8 m (a man in front of the player hid Zhou in BorrowLight.07
    // while the ray said the view was clear; 2026-09-25 review).
    const ray=new T.Raycaster();
    P.BodyBlocked=(from,to,ignore)=>{
      const r=g.Debug.FirstLevelMissionRuntime?.();if(!r)return false;
      const dx=to.x-from.x,dz=to.z-from.z,len2=dx*dx+dz*dz;if(len2<1e-6)return false;
      for(const s of r.ai.soldiers){
        const root=s.actor?.root;if(!root||root===ignore||s.dead||root.visible===false)continue;
        const p=s.position||root.position,u=((p.x-from.x)*dx+(p.z-from.z)*dz)/len2;if(!(u>.05&&u<.95))continue;
        const x=from.x+dx*u,z=from.z+dz*u,y=from.y+(to.y-from.y)*u,feet=root.getWorldPosition(new T.Vector3()).y;
        if(Math.hypot(p.x-x,p.z-z)<.3&&y>feet&&y<feet+1.8)return true;
      }
      return false;
    };
    P.Blocked=(from,to,ignore)=>{
      if(P.BodyBlocked(from,to,ignore))return true;
      const d=from.distanceTo(to);ray.set(from,to.clone().sub(from).normalize());ray.far=Math.max(0,d-.2);
      for(const hit of ray.intersectObjects(g.scene.children,true)){
        let o=hit.object,skip=o.isSprite||o.isLine||o.isPoints||o===g.viewmodel.root;
        for(let q=o;q&&!skip;q=q.parent)if(!q.visible||q===ignore||q===g.viewmodel.root)skip=true;
        if(!skip)return true;
      }
      return false;
    };
    // Walls: the posed arm's segments against the level's static colliders (battlefield ray, not the render meshes).
    P.ArmInWall=pts=>{const r=g.Debug.FirstLevelMissionRuntime?.();if(!r)return false;
      for(let i=0;i+1<pts.length;i++){const d=pts[i+1].clone().sub(pts[i]),len=d.length();if(len<1e-4)continue;
        if(r.battlefield.Raycast(pts[i],d.multiplyScalar(1/len),len))return true;}
      return false;};
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
    // directions with a clear line of sight to the chest and to the gesturing hand (from the 05 ammo-house doorway
    // the jamb's corner hid Luo's pointing hand in BundleAttack_01_Close, which read as the arm going into the wall
    // while it was 0.7 m off it; 2026-09-26 relay r2 fix 3).
    P.CloseCamera=(soldier,hand)=>{
      const root=soldier.actor.root,f=new T.Vector3(0,0,-1).transformDirection(root.matrixWorld).setY(0).normalize(),chest=P.Chest(soldier),side=hand==='L'?1:-1;
      const bone=soldier.actor.characterRig.bones[hand==='L'?'handL':'handR'],handAt=bone?bone.getWorldPosition(new T.Vector3()):null;
      const Clear=pos=>!P.Blocked(pos,chest,root)&&!(handAt&&P.Blocked(pos,handAt,root));
      for(const [a,d,up] of [[1.2,2.2,.2],[.6,2.2,.1],[1.8,2.2,.3],[0,2.2,.1],[1.2,2.4,.9],[.6,2.2,.9],[0,3,.9],[-.6,2.2,.6]]){
        const pos=chest.clone().addScaledVector(f.clone().applyAxisAngle(new T.Vector3(0,1,0),a*side),d);pos.y+=up;
        if(Clear(pos))return {pos,look:chest};
      }
      for(const [a,d,up] of [[1.2,2.2,.2],[.6,2.2,.1],[1.8,2.2,.3],[0,2.2,.1],[1.2,2.4,.9],[.6,2.2,.9],[0,3,.9],[-.6,2.2,.6]]){
        const pos=chest.clone().addScaledVector(f.clone().applyAxisAngle(new T.Vector3(0,1,0),a*side),d);pos.y+=up;
        if(!P.Blocked(pos,chest,root))return {pos,look:chest,handHidden:true};
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
              const row=P.lines[lineId]??={who,frames:0,up:0,maxW:0,clip:null,supp:{},lod:null,pose:null,postAim:[],postSolve:[],layerAim:[],clamped:0,along:0,muzzle:null,muzzleDev:0,clear:Infinity,reach:null,phases:{},
                wallFrames:0,wallAt:null,wallTurn:0,wallHits:0,fallback:false,crossLift:0,aimGeo:null};
              if(row.who!==who)continue;
              row.frames++;row.lod=soldier.renderLod;row.maxW=Math.max(row.maxW,st.weight);if(st.weight>.5)row.up++;
              if(st.clip)row.clip=st.clip;if(st.suppressed)row.supp[st.suppressed]=(row.supp[st.suppressed]||0)+1;
              if(st.phase)row.phases[st.phase]=(row.phases[st.phase]||0)+1;
              if(row.frames===8)row.pose=gl.probePose;if(st.reachError!=null&&st.weight>.9)row.reach=st.reachError;
              const a=gl.active,actor=soldier.actor,root=actor.root;
              // Walls, after the whole frame: the gesturing arm on every frame its gesture is up.
              if(a&&st.weight>.5&&st.lineId===lineId){
                const W=b=>b.getWorldPosition(V()),sh=W(a.bones.upper),el=W(a.bones.fore),wr=W(a.bones.hand);
                const tip=wr.clone().addScaledVector(wr.clone().sub(el).normalize(),G.wallHandM);
                if(P.ArmInWall([sh,el,wr,tip])){row.wallFrames++;row.wallAt??={t:st.t,phase:st.phase,clip:st.clip,weight:+st.weight.toFixed(2)};}
                row.wallTurn=Math.max(row.wallTurn,st.wallTurn||0);if(st.wallHit)row.wallHits++;
              }
              if(st.wallFallback&&st.lineId===lineId)row.fallback=true;
              if(a&&a.spec.aim&&st.phase==='hold'&&st.lineId===lineId){
                if(st.crossLift)row.crossLift++;
                if(!row.aimGeo){const f=V().set(0,0,-1).applyQuaternion(root.getWorldQuaternion(new T.Quaternion())),tp=P.L.SpeakerGestureTargetPoint(a.row.target,{root,lookAt:rig.speakerHead?.lookAt},V());
                  row.aimGeo={yaw:st.aimYaw,pitch:st.aimPitch,clamped:st.clamped,along:st.alongLift,cross:st.crossLift,wallTurn:st.wallTurn,
                    at:root.getWorldPosition(V()).toArray().map(v=>+v.toFixed(2)),front:[+f.x.toFixed(2),+f.z.toFixed(2)],target:tp?tp.toArray().map(v=>+v.toFixed(2)):null,
                    shoulder:a.bones.upper.getWorldPosition(V()).toArray().map(v=>+v.toFixed(2))};}
              }
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
                if(target){const sh=a.bones.upper.getWorldPosition(V()),hand=a.bones.hand.getWorldPosition(V()).sub(sh);
                  row.postAim.push(hand.angleTo(target.sub(sh))*180/Math.PI);if(st.aimDir)row.postSolve.push(hand.angleTo(st.aimDir)*180/Math.PI);
                  if(st.clamped)row.clamped++;if(st.alongLift)row.along++;if(st.aimError!=null)row.layerAim.push(st.aimError);}
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
            phase:st.phase,aimError:st.aimError,clamped:st.clamped,arm,camera:P.close.pos.toArray().map(v=>+v.toFixed(1)),handHidden:!!P.close.handHidden};},{id:step.shot.id,hand:step.shot.hand});
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
      for(const [id,row] of Object.entries(P.lines)){const a=[...row.postAim].sort((x,y)=>x-y),b=[...row.postSolve].sort((x,y)=>x-y);
        lines[id]={...row,postAim:a.length?{n:a.length,median:+a[a.length>>1].toFixed(1),max:+a.at(-1).toFixed(1)}:null,
          postSolve:b.length?{n:b.length,median:+b[b.length>>1].toFixed(1),max:+b.at(-1).toFixed(1)}:null,
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
      P.View(luo);
      // Look at whoever is talking (an off-screen body is not animated, so it would not gesture).
      const Face=()=>{let who=null;for(const h of r.voice.scenes.values())for(const l of h.lines)if(l.state==='playing'&&l.line.who!=='shunzi')who=l.line.who;
        P.Face((who&&r.frontScenes.Body(who))||luo);};
      // Off = the head layers run without their gesture layer (and the actor hooks see none); a disabled layer would
      // drop the line it is on, so the on halves would hardly ever see a gesture.
      const Rigs=()=>r.ai.soldiers.map(s=>s.actor?.characterRig).filter(rig=>rig?.speakerHead);
      const Layers=()=>Rigs().map(rig=>rig.speakerGesture).filter(Boolean);
      const SetOn=on=>{for(const rig of Rigs()){const head=rig.speakerHead;head.__gesture??=head.gesture;
        head.gesture=on?head.__gesture:null;rig.speakerGesture=on?head.__gesture:null;}};
      let next=0;const cycle=['TankTerror','BundleOrder','TankRoadContact'];
      const Replay=()=>{if([...r.voice.scenes.values()].some(h=>!h.done))return;const id=cycle[next++%cycle.length],cue=P.MISSION_DIALOGUE.find(c=>c.id===id);
        r.voice.PlayScene(id,{speakers:P.FrontSceneSpeakers(cue,who=>r.frontScenes.Body(who))});};
      const A=[],B=[],LA=[],LU=[],blocks=[],spikes=[],up={on:0,off:0};
      for(let round=0;round<20;round++){
        for(const on of (round%2?[true,false]:[false,true])){
          SetOn(on);Replay();for(let i=0;i<5;i++){Face();g.StepFrames(1,1/60,true);}
          let blockMs=0,blockUp=0;
          for(let i=0;i<30;i++){Face();P.layerMs=0;const starts=P.starts,t=performance.now();g.StepFrames(1,1/60,true);const dt=performance.now()-t;
            (on?A:B).push(dt);const gestureUp=Layers().some(l=>l.state.weight>.5);
            if(on&&P.layerMs>1&&spikes.length<10)spikes.push({ms:+P.layerMs.toFixed(2),frameMs:+dt.toFixed(1),starts:P.starts-starts});
            if(on){LA.push(P.layerMs);if(gestureUp){LU.push(P.layerMs);blockMs+=P.layerMs;blockUp++;}}if(gestureUp)up[on?'on':'off']++;}
          if(on&&blockUp>=10)blocks.push(blockMs/blockUp);
        }
      }
      SetOn(true);
      const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return +s[Math.min(s.length-1,Math.floor(p*s.length))].toFixed(3);};
      const mean=a=>+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(3);
      return {n:A.length,on:{mean:mean(A),p50:q(A,.5),p95:q(A,.95)},off:{mean:mean(B),p50:q(B,.5),p95:q(B,.95)},
        layerMs:{mean:mean(LA),p95:q(LA,.95),max:q(LA,1)},layerMsGestureUp:LU.length?{n:LU.length,mean:mean(LU),p95:q(LU,.95),max:q(LU,1)}:null,
        layerBlockMs:blocks.length?{n:blocks.length,mean:mean(blocks),p95:q(blocks,.95),max:q(blocks,1)}:null,spikes,gestureUpFrames:up};
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
  row.muzzleDev?`muzzle ${row.muzzleDev} deg`:'',JSON.stringify(row.pose||{}),
  row.clip?`walls: in ${row.wallFrames} frames, turn ${row.wallTurn} deg, layer hits ${row.wallHits}${row.fallback?', beat instead of the point':''}${row.crossLift?`, crossLift ${row.crossLift}`:''}`:'',row.aimGeo?JSON.stringify(row.aimGeo):'');
const gestured=rows.filter(([,row])=>row.up>=LIMIT.upFrames);
console.log(`gesture rows seen ${rows.length}, gestured ${gestured.length}; violations ${Object.values(result.stages).reduce((n,s)=>n+(s.violations?.length||0),0)}`);
for(const shot of result.shots)console.log('still',shot.line,shot.before?'before':'hold',JSON.stringify(shot.geo));
for(const stage of Object.values(result.stages))assert.deepEqual(stage.violations||[],[],'busy / cancelled / after-the-line weights');
for(const line of PICKED){
  const stageOf=Object.entries(SCENES).find(([,ids])=>ids.includes(line.split('.')[0]))?.[0];
  if(!stages.includes(+stageOf)||(only&&!only.includes(line.split('.')[0])))continue;
  assert.ok(all[line]?.up>=LIMIT.upFrames,`${line} gestures on screen (${JSON.stringify(all[line])})`);
}
// Rows the runtime never lifted for a reason that does not change from run to run: listed, or the table is wrong.
const never=rows.filter(([,row])=>row.up<LIMIT.upFrames);
for(const [id,row] of never){
  const reasons=Object.keys(row.supp),fixed=reasons.filter(r=>STRUCTURAL.has(r));
  console.log('not gestured',id,row.who,JSON.stringify(row.supp),fixed.length?'(structural)':'(busy in the fight)');
  for(const reason of fixed)assert.ok(KNOWN_REFUSALS[id]?.includes(reason),`${id}: refused ${reason} every time, but the table gives it a gesture (fix the row or list it in KNOWN_REFUSALS)`);
}
for(const [id,reasons] of Object.entries(KNOWN_REFUSALS))if(all[id]&&all[id].up>=LIMIT.upFrames)console.log(`note: ${id} is listed as refused (${reasons}) but gestured this run`);
for(const [id,row] of rows){
  if(row.postAim&&row.clamped===0&&row.along===0)assert.ok(row.postAim.median<=LIMIT.postAimDeg,`${id}: points at its target after the aim IK (${JSON.stringify(row.postAim)})`);
  if(row.postSolve)assert.ok(row.postSolve.median<=LIMIT.postAimDeg,`${id}: points where the layer aimed after the aim IK (${JSON.stringify(row.postSolve)})`);
  if(row.muzzleDev)assert.ok(row.muzzleDev<=LIMIT.muzzleDeg,`${id}: rifle keeps its direction (${row.muzzleDev} deg)`);
  if(row.clear!=null)assert.ok(row.clear>=LIMIT.rifleClearM,`${id}: gesturing hand clear of the rifle (${row.clear} m)`);
  assert.equal(row.wallFrames||0,0,`${id}: gesturing arm in a wall on ${row.wallFrames} frames (${JSON.stringify(row.wallAt)})`);
}
assert.equal(result.after06.gestureLayers,0,`07+: no gesture layer (${JSON.stringify(result.after06)})`);
if(result.ab){
  console.log('A/B 04',JSON.stringify(result.ab));
  assert.ok(result.ab.gestureUpFrames.on>0,'A/B: gestures were up in the on half');
  console.log(`A/B 04 whole frame (reported, not gated): p95 on ${result.ab.on.p95} off ${result.ab.off.p95} ms (${(result.ab.on.p95-result.ab.off.p95).toFixed(3)} ms)`);
  const own=result.ab.layerMsGestureUp;
  console.log(`A/B 04 layer own time on gesture frames: n ${own?.n}, mean ${own?.mean} ms, p95 ${own?.p95} ms, max ${own?.max} ms; 30-frame block means ${JSON.stringify(result.ab.layerBlockMs)}; frames over 1 ms ${JSON.stringify(result.ab.spikes)}`);
  assert.ok(own&&own.n>=150,`A/B: enough frames with a gesture up (${JSON.stringify(own)})`);
  assert.ok(own.p95<=LIMIT.layerMs&&own.mean<=LIMIT.layerMs,
    `A/B: the gesture layer's own time on gesture frames: p95 ${own.p95} ms, mean ${own.mean} ms (limit ${LIMIT.layerMs})`);
}
console.log(`ok speaker gesture layer: stages ${stages.join(',')}, ${gestured.length}/${rows.length} gesture lines up, ${result.shots.length} stills`);
