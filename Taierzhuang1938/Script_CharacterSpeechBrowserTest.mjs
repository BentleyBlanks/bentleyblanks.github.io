// Live speaker faces in the real first level: every face-rigged speaker moves its
// mouth with its own lines and nobody else's; listeners keep their mouths closed;
// acting expressions and face blood show at 1 m and a shouted line still articulates;
// facial skins of all six models render at 1-2 m through the production post
// chain; the mouth writes real motion vectors while talking and none when still.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)), output=path.join(here,'_shots/CharacterSpeech');
await fs.mkdir(output,{recursive:true});
const local=process.argv.find(arg=>arg.startsWith('--port='))?.split('=')[1];
const server=local?null:await ServeRoot(path.dirname(here),0), browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}), errors=[];
page.on('pageerror',error=>errors.push(String(error)));
// A material patched twice (face blood over a cloth wound, 2026-09-25 review) fails to link: three logs it.
const shaderErrors=[];page.on('console',message=>{if(/Shader Error|WebGLProgram|VALIDATE_STATUS/i.test(message.text()))shaderErrors.push(message.text().slice(0,300));});
// Silent faces breathe: the jaw may drift by the breathing weight only (Data_Tuning_CharacterSpeech.breathJaw).
const SILENT_JAW_RADIANS=.02;
try {
  await page.goto(`http://127.0.0.1:${local||server.address().port}/Taierzhuang1938/?whitebox=p012&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
  await page.locator('#bootStart').click();
  await page.waitForFunction(()=>window.Tengxian.audio.ctx?.state==='running' &&
    window.Tengxian.audio.voiceBank.get('MissionGuideFollow')?.speechEnvelope,null,{timeout:90000});
  const initial=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();await r.voiceReady;
    g.StepFrames(12,1/60,true);
    const luo=g.companion.Handle('luo'),rig=luo.actor.characterRig,face=rig.facial;
    const yaowa=g.companion.Handle('yaowa'),listener=yaowa?.actor?.characterRig?.facial;
    if(!face)throw Error('Live Luo lacks the facial rig');
    const T=await import('three');
    const control=face.controls.find(c=>c.name==='Face_Jaw');
    const listenerJaw=listener?.controls.find(c=>c.name==='Face_Jaw');
    window.SpeechProbe={g,r,luo,rig,face,control,listener,listenerJaw,T,render:g.post.Render,focus:rig,distance:.74};
    const probe=window.SpeechProbe;
    // Diagnostic close-up only. Render through the unchanged production post chain.
    g.post.Render=function(scene,camera,options){
      const focus=probe.focus,root=focus.actor?.root||focus.root,eyes=probe.eyeLevel?focus.facial?.eyes:null;
      // eyeLevel: aim between the eyes along the head's own forward, tilt included (acting close-ups).
      const center=eyes?.length?eyes.reduce((sum,eye)=>sum.add(eye.bone.getWorldPosition(new T.Vector3())),new T.Vector3()).multiplyScalar(1/eyes.length)
        :focus.bones.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.10,0));
      // Close-ups face the face itself (Biped head frame: local +Y is forward).
      const forward=eyes?.length?new T.Vector3(0,1,0).transformDirection(focus.bones.head.matrixWorld).normalize()
        :probe.faceOn?new T.Vector3(0,1,0).transformDirection(focus.bones.head.matrixWorld).setY(0).normalize()
        :new T.Vector3(0,0,-1).transformDirection(root.matrixWorld);
      camera.position.copy(center).addScaledVector(forward,probe.distance);if(!eyes?.length)camera.position.y+=.025;
      camera.lookAt(center);camera.updateMatrixWorld(true);g.viewmodel.root.visible=false;probe.lastCamera=camera;
      return probe.render.call(this,scene,camera,options);
    };
    g.post.NotifyCameraCut();g.StepFrames(3,1/60,true);
    const ordinary=g.actorFactory.Create('nra',{modelVariant:4,seed:31});
    const ordinaryHasFace=!!ordinary.characterRig.facial;ordinary.Dispose();
    // Speaking cast: named roles get their pinned model's facial skin, never a pooled body.
    const cast={};
    for(const [castId,kind,variant] of [['ijaA','ija',5],['ijaB','ija',0],['ijaD','ija',1],['guard','nra',1],['luo','nra',4],['interpreter','nra',5]]){
      const actor=g.actorFactory.Create(kind,{castId,modelVariant:variant,seed:41});
      cast[castId]={model:actor.characterRig?.modelId,face:actor.characterRig?.facial?.controls.length||0,
        eyes:actor.characterRig?.facial?.eyes.length||0,pooled:!!actor.pooled,
        oral:(()=>{let n=0;actor.characterRig?.root.traverse(o=>{if(o.isMesh&&o.material?.name==='Material_FacialOral')n++;});return n;})(),
        sharedMaterial:(()=>{let shared=0;actor.characterRig?.root.traverse(o=>{if(o.isMesh&&o.material?.map)shared++;});return shared;})()};
      actor.Dispose();
    }
    // Facial and plain skins of one model share the very same (ConfigureExternalPbr'd) materials.
    const Materials=actor=>{const set=new Set();actor.characterRig.root.traverse(o=>{if(o.isMesh&&o.material?.name!=='Material_FacialOral')set.add(o.material);});return set;};
    const plainSkin=g.actorFactory.Create('nra',{modelVariant:1,seed:52,noPool:true}),facialSkin=g.actorFactory.Create('nra',{modelVariant:1,seed:52,castId:'yaowa'});
    const plainSet=Materials(plainSkin),facialSet=Materials(facialSkin);
    const sharedMaterials={plain:plainSet.size,facial:facialSet.size,shared:[...facialSet].filter(m=>plainSet.has(m)).length,
      configured:[...facialSet].filter(m=>m.userData?.externalPbrConfigured).length};
    plainSkin.Dispose();facialSkin.Dispose();
    await g.audio.ctx.resume();r.voice.Clock=()=>g.audio.ctx.currentTime;
    r.voice.Replay('GuideFollow');r.voice.Update(0);
    return {model:rig.modelId,controls:face.controls.length,ordinaryHasFace,cast,listener:!!listener,sharedMaterials,
      bound:r.speakers?.State().bound,
      envelopeSamples:g.audio.voiceBank.get('MissionGuideFollow')?.speechEnvelope?.levels.length,
      audioState:g.audio.ctx.state};
  });
  assert.equal(initial.controls,13);assert.equal(initial.ordinaryHasFace,false,'anonymous soldiers keep the plain skin');
  assert.ok(initial.listener,'Yaowa (NRA02 speaker) has a face rig');
  assert.ok(initial.bound?.luo&&initial.bound?.yaowa,'speaker binder bound Luo and Yaowa');
  for(const [castId,model] of [['ijaA','TengxianIja06'],['ijaB','TengxianIja01'],['ijaD','TengxianIja02'],['guard','TengxianNra02'],['luo','TengxianNra05'],['interpreter','TengxianNra06']]){
    const entry=initial.cast[castId];
    assert.equal(entry.model,model,`${castId} wears ${model}`);assert.equal(entry.face,13);assert.equal(entry.eyes,2);
    assert.equal(entry.pooled,false,`${castId} is never a pooled body`);assert.equal(entry.oral,1);
    assert.ok(entry.sharedMaterial>0,`${castId} facial surfaces show the base GLB textures`);
  }
  assert.ok(initial.sharedMaterials.facial>0&&initial.sharedMaterials.shared===initial.sharedMaterials.facial,
    `facial skin reuses the plain skin's materials (${JSON.stringify(initial.sharedMaterials)})`);
  assert.ok(initial.sharedMaterials.configured>0,'ConfigureExternalPbr owns the rebound materials (same objects as the plain skin)');
  assert.ok(initial.envelopeSamples>100);assert.equal(initial.audioState,'running');
  const samples=[];let captured=false,pauseReceipt=null;
  for(let i=0;i<45;i++){
    await page.waitForTimeout(60);
    const sample=await page.evaluate(()=>{
      const p=window.SpeechProbe;p.g.StepFrames(3,1/60,true);
      return {source:p.r.voice.Speech('luo'),level:p.face.level,angle:p.control.bone.quaternion.angleTo(p.control.quaternion),
        listenerSource:p.r.voice.Speech('yaowa'),
        listenerAngle:p.listenerJaw?p.listenerJaw.bone.quaternion.angleTo(p.listenerJaw.quaternion):0,
        listenerGaze:!!p.listener?.gaze,time:p.g.audio.ctx.currentTime};
    });
    samples.push(sample);
    if(!captured&&sample.angle>.075){
      captured=true;await page.screenshot({path:path.join(output,'Scene_LuoSpeaking.png')});
      pauseReceipt=await page.evaluate(()=>{
        const p=window.SpeechProbe,before=p.face.level,source=p.r.voice.current.sourceTime;
        p.r.voice.Pause();p.g.StepFrames(8,1/60,true);
        return {before,source,level:p.face.level,angle:p.control.bone.quaternion.angleTo(p.control.quaternion),
          debug:{time:p.face.time,jaw:p.face.jaw,wide:p.face.wide,round:p.face.round,close:p.face.close,speaking:p.face.speaking,weights:p.face.weights,src:!!p.face.source}};
      });
      // The mouth was open when captured. (Face tracks open per syllable, so by the time
      // the screenshot is written the jaw may already be between syllables; the old
      // envelope held it open through whole phrases, which is what the tracks remove.)
      pauseReceipt.captureLevel=sample.level;
      assert.ok(sample.angle>.075&&sample.level>.1,`captured mid-syllable (jaw ${sample.angle} rad, weight ${sample.level})`);
      assert.ok(pauseReceipt.angle<SILENT_JAW_RADIANS,`pause closes the mouth (${pauseReceipt.angle})`);
      await page.screenshot({path:path.join(output,'Scene_LuoPaused.png')});
      const resumeSource=await page.evaluate(()=>{const p=window.SpeechProbe;p.r.voice.Resume();return p.r.voice.current.clockSource;});
      assert.equal(resumeSource,pauseReceipt.source,'resume retains the interrupted recording offset');
    }
  }
  assert.ok(captured,'actual voice opens the jaw');
  assert.ok(samples.some(s=>s.source?.level>.5));
  assert.ok(samples.some(s=>s.source?.level<.04),'recording pauses are detected');
  // Every face that is not speaking keeps its mouth closed while Luo talks.
  const listenerOpen=samples.filter(s=>!s.listenerSource&&s.listenerAngle>SILENT_JAW_RADIANS);
  assert.equal(listenerOpen.length,0,`listener mouth stayed closed (${listenerOpen.length} open samples)`);
  assert.ok(samples.some(s=>s.listenerGaze),'listener looks at the speaker');
  const pause=await page.evaluate(()=>{
    const p=window.SpeechProbe;p.r.voice.Pause();p.g.StepFrames(8,1/60,true);
    return {level:p.face.level,angle:p.control.bone.quaternion.angleTo(p.control.quaternion)};
  });
  assert.ok(pause.angle<SILENT_JAW_RADIANS);
  const resumed=await page.evaluate(()=>{
    const p=window.SpeechProbe;p.r.voice.Replay('GuideFollow');p.r.voice.Update(0);p.g.StepFrames(1,1/60,true);
    return {phase:p.r.voice.State().playbackPhase,source:p.r.voice.current.clockSource};
  });
  assert.equal(resumed.phase,'playing');assert.equal(resumed.source,0);
  await page.evaluate(()=>{const p=window.SpeechProbe;p.r.voice.Pause();});

  // Offline face track on a 03-06 take where Luo and Zhou alternate (TakeOverGun):
  // each face opens per syllable on its own lines, shuts between lines, the other face
  // stays closed. Same take again on the old envelope for comparison. The take runs on
  // simulation time (audio context suspended, voice clock off) so every 1/60 s frame
  // is sampled no matter how slow the machine is.
  const trackRun=await page.evaluate(async()=>{
    const p=window.SpeechProbe,g=p.g,r=p.r,T=p.T;
    const ft=await import('./Script_FaceTrack.mjs'),{SpeakingCastOptions}=await import('./Data_FirstLevelSpeakingCast.mjs');
    await ft.LoadFaceTracks();
    // 03-06 lines are per-line takes cut from one scene take (Voice package): the tracks are keyed by the line
    // sha256s; a legacy whole-cue take (manifest.cues) keeps its own key.
    const cueId='TakeOverGun',take=r.voice.manifest.cues[cueId]??r.voice.manifest.scenes?.[cueId],key=take?.sha256;
    const lineKeys=Object.values(r.voice.manifest.lines||{}).filter(line=>line.scene===cueId).map(line=>line.sha256);
    const HasTrack=()=>ft.HasFaceTrack(key)||(lineKeys.length>0&&lineKeys.every(k=>ft.HasFaceTrack(k)));
    const zhou=g.actorFactory.Create('nra',{...SpeakingCastOptions('zhou'),seed:61,weapon:null});
    const luoRoot=p.luo.actor.root,side=new T.Vector3(1,0,0).transformDirection(luoRoot.matrixWorld);
    zhou.root.position.copy(luoRoot.getWorldPosition(new T.Vector3())).addScaledVector(side,-1.1);
    zhou.root.rotation.y=luoRoot.rotation.y;g.scene.add(zhou.root);
    const zface=zhou.characterRig.facial;zface.source=()=>r.speakers.Speech('zhou');
    const Jaw=face=>{const c=face.controls.find(c=>c.name==='Face_Jaw');return c.bone.quaternion.angleTo(c.quaternion);};
    const Moving=face=>face.weights.Open>=.1||face.weights.Wide>=.25||face.weights.Round>=.25||face.weights.Close>=.5;
    p.zhou=zhou;
    const Run=async(useTrack,shots)=>{
      if(!useTrack)ft.ClearFaceTracks();else await ft.LoadFaceTracks();
      const clock=r.voice.Clock;r.voice.Clock=()=>NaN;await g.audio.ctx.suspend();
      const Restore=async()=>{r.voice.Clock=clock;await g.audio.ctx.resume();};
      // Start from closed mouths (a previous pass may have stopped mid-word).
      r.voice.Pause();for(let i=0;i<20;i++){g.StepFrames(1,1/60,false);zhou.Update(1/60,{});}
      r.voice.Replay(cueId);r.voice.Update(0);
      const rows=[];const seconds=take?.seconds??0;
      while(r.voice.current?.cue.id===cueId&&r.voice.State().playbackPhase==='playing'&&rows.length<2400){
        g.StepFrames(1,1/60,false);zhou.Update(1/60,{});
        const luo=r.speakers.Speech('luo'),zs=r.speakers.Speech('zhou');
        const row={t:r.voice.current?.sourceTime??seconds,luo:!!luo?.active,zhou:!!zs?.active,
          luoTarget:luo?.jaw??null,zhouTarget:zs?.jaw??null,luoJaw:Jaw(p.face),zhouJaw:Jaw(zface),
          luoMoving:Moving(p.face),zhouMoving:Moving(zface)};
        rows.push(row);
        for(const who of ['luo','zhou'])if(shots&&!shots[who]&&row[who]&&row[`${who}Jaw`]>.1){
          // Hold this mouth (the track sample of this frame) while the post chain
          // settles over a few rendered frames; released after the screenshot.
          const face=who==='luo'?p.face:zface,held={...(who==='luo'?luo:zs)},source=face.source;
          face.source=()=>held;window.TrackUnfreeze=()=>{face.source=source;};
          shots[who]=row.t;p.focus=who==='luo'?p.rig:zhou.characterRig;p.distance=1.2;p.faceOn=true;
          g.post.NotifyCameraCut();for(let i=0;i<10;i++){g.StepFrames(1,1/60,true);zhou.Update(1/60,{});}
          shots[`${who}Jaw`]=Jaw(face);await Restore();return {rows,shot:who};
        }
      }
      await Restore();
      return {rows,shot:null,hasTrack:HasTrack()};
    };
    window.TrackRun=Run;
    return {key,lineKeys:lineKeys.length,hasTrack:HasTrack(),zhouModel:zhou.characterRig.modelId,zhouFace:!!zface};
  });
  assert.ok(trackRun.hasTrack,`TakeOverGun has a baked face track (${trackRun.key})`);
  assert.equal(trackRun.zhouModel,'TengxianNra02');assert.ok(trackRun.zhouFace);
  // Pass 1: close-ups of Luo and Zhou mid-word (1.2 m), then the full measured pass.
  const shots={};
  for(let i=0;i<2;i++){
    const part=await page.evaluate(async shots=>{const out=await window.TrackRun(true,shots);return {shot:out.shot,shots};},shots);
    if(!part.shot)break;Object.assign(shots,part.shots);
    await page.screenshot({path:path.join(output,`Track_${part.shot}_MidWord.png`)});
    await page.evaluate(()=>window.TrackUnfreeze?.());
    if(shots.luo!=null&&shots.zhou!=null)break;
    // Continue from where the voice is: the next call replays, so skip what was shot.
  }
  await page.evaluate(()=>{const p=window.SpeechProbe;p.focus=p.rig;p.distance=.74;p.faceOn=false;p.r.voice.Pause();});
  const Measure=rows=>{
    const stats={};
    // A face gets SETTLE_S after its own line to close (the pause test allows 8 frames).
    const SETTLE_S=.15;
    for(const [who,other] of [['luo','zhou'],['zhou','luo']]){
      let spoke=-1e9;for(const r of rows){if(r[who])spoke=r.t;r[`${who}Settled`]=r.t-spoke>SETTLE_S;}
      const talk=rows.filter(r=>r[who]),silent=rows.filter(r=>!r.luo&&!r.zhou&&r[`${who}Settled`]);
      const articulating=talk.filter(r=>r[`${who}Target`]==null||r[`${who}Target`]>=.1);
      let opens=0,low=1;for(let i=1;i<talk.length-1;i++){const a=talk[i][`${who}Jaw`];low=Math.min(low,a);
        if(a>=talk[i-1][`${who}Jaw`]&&a>talk[i+1][`${who}Jaw`]&&a>=.06&&a-low>=.04){opens++;low=a;}}
      const talkSeconds=talk.length?talk.reduce((s,r,i)=>s+(i?Math.max(0,Math.min(.1,r.t-talk[i-1].t)):0),0):0;
      stats[who]={frames:talk.length,moving:talk.length?talk.filter(r=>r[`${who}Moving`]).length/talk.length:0,
        following:articulating.length?articulating.filter(r=>r[`${who}Moving`]).length/articulating.length:0,
        gapFrames:silent.length,gapOpen:silent.length?silent.filter(r=>r[`${who}Jaw`]>SILENT_JAW_RADIANS).length/silent.length:0,
        listeningOpen:rows.filter(r=>r[other]&&!r[who]&&r[`${who}Settled`]&&r[`${who}Jaw`]>SILENT_JAW_RADIANS).length,
        opensPerS:talkSeconds>0?opens/talkSeconds:0};
    }
    return stats;
  };
  const trackPass=await page.evaluate(()=>window.TrackRun(true,null));
  const envelopePass=await page.evaluate(()=>window.TrackRun(false,null));
  await page.evaluate(async()=>{const p=window.SpeechProbe;p.r.voice.Pause();p.zhou.root.removeFromParent();p.zhou.Dispose();
    const ft=await import('./Script_FaceTrack.mjs');await ft.LoadFaceTracks();});
  const trackStats=Measure(trackPass.rows),envelopeStats=Measure(envelopePass.rows);
  // Both passes step the same 1/60 s frames, so row i is the same moment of the take. Where
  // the track rests inside a speaker's own line (a pause or the lead-in before the voice)
  // the mouth should be shut; the old envelope keeps it open on the baked-in ambience.
  for(const [stats,rows] of [[trackStats,trackPass.rows],[envelopeStats,envelopePass.rows]])for(const who of ['luo','zhou']){
    const silent=rows.filter((r,i)=>trackPass.rows[i]?.[who]&&trackPass.rows[i][`${who}Target`]<.05);
    stats[who].lineSilenceFrames=silent.length;
    stats[who].lineSilenceOpen=silent.length?silent.filter(r=>r[`${who}Jaw`]>.03).length/silent.length:0;
  }
  await fs.writeFile(path.join(output,'Data_FaceTrackRun.json'),JSON.stringify({key:trackRun.key,shots,track:trackStats,envelope:envelopeStats,
    trackRows:trackPass.rows,envelopeRows:envelopePass.rows},null,1));
  assert.ok(trackPass.rows.length>100,`sampled ${trackPass.rows.length} frames`);
  for(const who of ['luo','zhou']){
    const s=trackStats[who];
    assert.ok(s.frames>20,`${who} spoke in the sample (${s.frames} frames)`);
    assert.ok(s.following>=.8,`${who}: face follows the track on >=80% of articulating frames (${s.following.toFixed(2)})`);
    assert.ok(s.gapOpen<=.1,`${who}: open on <=10% of frames between lines (${s.gapOpen.toFixed(2)})`);
    assert.equal(s.listeningOpen,0,`${who}: mouth shut while the other one talks`);
    assert.ok(s.opensPerS>=2,`${who}: opens per syllable, not per phrase (${s.opensPerS.toFixed(2)}/s)`);
    if(s.lineSilenceFrames>=30)assert.ok(s.lineSilenceOpen<=.15,`${who}: shut in the pauses of its own lines (${s.lineSilenceOpen.toFixed(2)})`);
  }
  assert.ok(shots.luo!=null&&shots.zhou!=null,'close-ups of both speakers mid-word');

  // Close-ups of every facial skin, rest and mid-word, through the production chain.
  const closeups=[];
  for(const [castId,kind,variant] of [['yaowa','nra',1],['luo','nra',4],['ijaA','ija',5],['ijaB','ija',0],['ijaD','ija',1],['interpreter','nra',5]]){
    for(const [label,speech,distance] of [['Rest',null,1.2],['Open',{active:true,jaw:.85,wide:.2,round:.1,close:0,stress:0},1.2],
      ['Round',{active:true,jaw:.45,wide:0,round:.9,close:0,stress:0},1.2],['Blink',{blink:true},1.2],['Near',{active:true,jaw:.7,wide:.6,round:0,close:0,stress:0},.75]]){
      const info=await page.evaluate(({castId,kind,variant,label,speech,distance})=>{
        const p=window.SpeechProbe,g=p.g,T=p.T;
        p.closeup ||= {};
        let actor=p.closeup[castId];
        if(!actor){
          actor=p.closeup[castId]=g.actorFactory.Create(kind,{castId,modelVariant:variant,seed:77,weapon:null});
          const luo=p.luo.actor.root,forward=new T.Vector3(0,0,-1).transformDirection(luo.matrixWorld);
          actor.root.position.copy(luo.position||luo.getWorldPosition(new T.Vector3())).addScaledVector(forward,3);
          actor.root.position.x+=4+3*Object.keys(p.closeup).length;actor.root.rotation.y=luo.rotation?.y||0;g.scene.add(actor.root);
        }
        const rig=actor.characterRig,face=rig.facial;
        for(const other of Object.values(p.closeup))other.root.visible=other===actor;
        p.focus=rig;p.distance=distance;p.faceOn=true;face.source=speech&&speech.active?()=>speech:null;face.gaze=null;
        for(let i=0;i<12;i++){actor.Update(1/60,{elapsed:i/60});if(speech?.blink&&i===6)face.Blink();}
        if(speech?.blink){face.blinkAge=0;for(let i=0;i<5;i++)actor.Update(1/60,{});}
        g.post.NotifyCameraCut();g.StepFrames(2,1/60,true);
        const jaw=face.controls.find(c=>c.name==='Face_Jaw');
        return {model:rig.modelId,jaw:jaw.bone.quaternion.angleTo(jaw.quaternion),blink:face.weights.Blink};
      },{castId,kind,variant,label,speech,distance});
      const file=`Face_${info.model}_${label}.png`;
      await page.screenshot({path:path.join(output,file)});
      closeups.push({castId,label,file,...info});
    }
  }
  for(const shot of closeups.filter(s=>['Open','Near'].includes(s.label)))assert.ok(shot.jaw>.12,`${shot.model} opens (${shot.jaw})`);
  for(const shot of closeups.filter(s=>s.label==='Rest'))assert.ok(shot.jaw<SILENT_JAW_RADIANS,`${shot.model} rests closed`);

  // Acting expressions and face blood (01-03 storyboard contract section 4.2), 1 m through the production
  // chain: 日兵甲 (IJA06) snarls and gapes, the captive comrade (NRA02) bleeds, and a shouted line still
  // opens and shuts. Pixels are read from the frame itself (a flag that is set but never drawn is not seen).
  await page.evaluate(async()=>{
    const p=window.SpeechProbe,g=p.g,T=p.T;
    p.facialApi=(await import('./Script_CharacterFacialAnimation.mjs')).CharacterFacial;
    const {SpeakingCastOptions}=await import('./Data_FirstLevelSpeakingCast.mjs');
    const actor=p.closeup.comrade=g.actorFactory.Create('nra',{...SpeakingCastOptions('comrade'),seed:83,weapon:null});
    const luo=p.luo.actor.root,forward=new T.Vector3(0,0,-1).transformDirection(luo.matrixWorld);
    actor.root.position.copy(luo.getWorldPosition(new T.Vector3())).addScaledVector(forward,3);
    actor.root.position.x+=4+3*Object.keys(p.closeup).length;actor.root.rotation.y=luo.rotation?.y||0;g.scene.add(actor.root);
    // Grab the frame just rendered (same task, before the drawing buffer is cleared): the face itself,
    // a box around the projected eyes (1.6 eye distances each side, brows to chin), fixed per actor so
    // every shot of one face compares the same pixels. The whole middle of the screen is mostly sky and
    // bystanders, whose film grain (about 3 mean |dRGB| per pixel) drowns a changed mouth.
    // The mouth box sits on the projected mouth corners (Face_CornerL/R at rest), from above the upper lip
    // to below a dropped jaw. Both boxes are fixed per actor on its first (rest) shot.
    p.faceBox={};p.mouthBox={};
    const Clip=(x0,y0,x1,y1,w,h)=>{const x=Math.max(0,Math.round(x0)),y=Math.max(0,Math.round(y0));
      return {x,y,w:Math.max(4,Math.min(w,Math.round(x1))-x),h:Math.max(4,Math.min(h,Math.round(y1))-y)};};
    p.Grab=castId=>{
      const canvas=g.renderer.domElement,w=canvas.width,h=canvas.height;
      if(!p.faceBox[castId]){
        const Screen=bone=>{const v=bone.getWorldPosition(new T.Vector3()).project(p.lastCamera);return new T.Vector2((v.x+1)/2*w,(1-v.y)/2*h);};
        const eyes=p.focus.facial.eyes.map(eye=>Screen(eye.bone)),bone=name=>p.focus.facial.controls.find(c=>c.name===name).bone;
        const cx=(eyes[0].x+eyes[1].x)/2,cy=(eyes[0].y+eyes[1].y)/2,d=eyes[0].distanceTo(eyes[1]);
        p.faceBox[castId]={...Clip(cx-1.6*d,cy-1.3*d,cx+1.6*d,cy+2.7*d,w,h),eyePx:d};
        const cl=Screen(bone('Face_CornerL')),cr=Screen(bone('Face_CornerR')),mx=(cl.x+cr.x)/2,my=(cl.y+cr.y)/2,half=Math.abs(cl.x-cr.x)/2+.3*d;
        p.mouthBox[castId]=Clip(mx-half,my-.45*d,mx+half,my+.8*d,w,h);
      }
      const Read=box=>{const c=document.createElement('canvas');c.width=box.w;c.height=box.h;
        const x2=c.getContext('2d',{willReadFrequently:true});
        x2.drawImage(canvas,box.x,box.y,box.w,box.h,0,0,box.w,box.h);return x2.getImageData(0,0,box.w,box.h).data;};
      return {face:Read(p.faceBox[castId]),mouth:Read(p.mouthBox[castId])};
    };
    // Share of 4x4 blocks whose average colour moved by more than 6 (mean |dRGB|): film grain and the
    // anti-aliasing jitter at silhouettes average out inside a block (about 1 % of the blocks of an
    // unchanged face), bared teeth, a dropped jaw or a pulled corner do not.
    p.ChangedBlocks=(a,b,width,height,k=4,limit=6)=>{
      let changed=0,blocks=0;
      for(let by=0;by+k<=height;by+=k)for(let bx=0;bx+k<=width;bx+=k){
        let sum=0;
        for(let c=0;c<3;c++){let da=0,db=0;
          for(let y=by;y<by+k;y++)for(let x=bx;x<bx+k;x++){const i=(y*width+x)*4+c;da+=a[i];db+=b[i];}
          sum+=Math.abs(da-db)/(k*k);}
        blocks++;if(sum/3>limit)changed++;
      }
      return blocks?changed/blocks:0;
    };
  });
  const acting={};
  for(const [key,castId,setup] of [
    ['ijaA_Rest','ijaA',{expression:{}}],['ijaA_Still','ijaA',{expression:{},ref:'ijaA_Rest'}],['ijaA_Snarl','ijaA',{expression:{snarl:1},ref:'ijaA_Rest'}],['ijaA_Shock','ijaA',{expression:{shock:1},ref:'ijaA_Rest'}],
    ['ijaA_Shout','ijaA',{expression:{shout:1},ref:'ijaA_Rest'}],['luo_Rest','luo',{expression:{}}],['luo_Grit','luo',{expression:{grit:1},ref:'luo_Rest'}],['luo_Concern','luo',{expression:{pain:.6,shock:.25},ref:'luo_Rest'}],
    ['comrade_Rest','comrade',{expression:{},blood:0}],['comrade_Pain','comrade',{expression:{pain:1},blood:0,ref:'comrade_Rest'}],
    ['comrade_PainStill','comrade',{expression:{pain:1},blood:0,ref:'comrade_Pain'}],
    ['comrade_Blood','comrade',{expression:{pain:1},blood:1,ref:'comrade_Pain'}]]){
    acting[key]=await page.evaluate(({key,castId,setup})=>{
      const p=window.SpeechProbe,g=p.g,actor=p.closeup[castId],rig=actor.characterRig,face=rig.facial,api=p.facialApi;
      for(const other of Object.values(p.closeup))other.root.visible=other===actor;
      p.focus=rig;p.distance=.6;p.faceOn=true;p.eyeLevel=true;face.source=null;face.gaze=null;
      api.SetExpression(rig,{snarl:0,shock:0,pain:0,shout:0,grit:0,...setup.expression},0);
      const took=setup.blood==null?null:api.SetFaceBlood(rig,setup.blood);
      face.nextBlinkS=99;face.blinkAge=-1;
      // The body settles once per actor, then holds: later shots of the same actor differ by the face alone.
      p.actingPosed ||= new Set();
      if(!p.actingPosed.has(castId)){p.actingPosed.add(castId);for(let i=0;i<12;i++)actor.Update(1/60,{elapsed:i/60});}
      for(let i=0;i<12;i++)face.Update(1/60,{});
      g.post.NotifyCameraCut();g.StepFrames(3,1/60,true);
      const grab=p.Grab(castId),pixels=grab.face;p.acting ||= {};p.acting[key]=grab;const refGrab=setup.ref?p.acting[setup.ref]:null,ref=refGrab?.face;
      const box=p.faceBox[castId],mouthBox=p.mouthBox[castId];
      // mouth / diff: share of changed 4x4 blocks in the mouth box / the face box against the reference
      // shot; bloodied: share of face-box pixels that changed (sum |dRGB| > 20) into a red-dominant colour
      // (blood is dark: it lowers red too, so "redder than before" misses it).
      let bloodied=0;const n=pixels.length/4,diff=ref?p.ChangedBlocks(pixels,ref,box.w,box.h):null;
      const mouth=ref?p.ChangedBlocks(grab.mouth,refGrab.mouth,mouthBox.w,mouthBox.h):null;
      if(ref)for(let i=0;i<pixels.length;i+=4){
        const r=pixels[i],gg=pixels[i+1],b=pixels[i+2];
        if(Math.abs(r-ref[i])+Math.abs(gg-ref[i+1])+Math.abs(b-ref[i+2])>20&&r>=1.6*gg&&r>=1.3*b)bloodied++;
      }
      const jaw=face.controls.find(c=>c.name==='Face_Jaw');
      let patched=0;const patchedMaterials=[];
      rig.root.traverse(o=>{if(o.isMesh&&(o.material?.userData?.materialPatchKeys||[]).includes('face-blood-1')){patched++;patchedMaterials.push(o.material.name);}});
      return {model:rig.modelId,weights:{...face.expressionWeights},jaw:jaw.bone.quaternion.angleTo(jaw.quaternion),
        took,blood:face.State().faceBlood,patched,patchedMaterials,bloodied:bloodied/n,diff,mouth,box:{...box},mouthBox:{...mouthBox}};
    },{key,castId,setup});
    await page.screenshot({path:path.join(output,`Acting_${acting[key].model}_${key}.png`)});
  }
  // Shouting speech: the jaw keeps opening and shutting on syllables around the shout's half-open base.
  const shoutTalk=await page.evaluate(()=>{
    const p=window.SpeechProbe,actor=p.closeup.ijaA,face=actor.characterRig.facial;let open=false;
    p.facialApi.SetExpression(actor.characterRig,{shout:1,snarl:0,shock:0,pain:0,grit:0},0);
    face.source=()=>({active:true,jaw:open?.9:0,wide:open?.3:0,round:0,close:open?0:.6,stress:0});
    const jaw=face.controls.find(c=>c.name==='Face_Jaw'),angles=[];
    for(let i=0;i<150;i++){open=Math.floor(i/9)%2===0;actor.Update(1/60,{});if(i>=30)angles.push(jaw.bone.quaternion.angleTo(jaw.quaternion));}
    face.source=null;p.facialApi.SetExpression(actor.characterRig,{shout:0},0);actor.Update(1/60,{});
    return {low:Math.min(...angles),high:Math.max(...angles),talk:face.talk};
  });
  await page.evaluate(()=>{const p=window.SpeechProbe;p.eyeLevel=false;p.acting=null;p.facialApi.SetFaceBlood(p.closeup.comrade.characterRig,0);});
  const Pct=v=>`${(v*100).toFixed(1)}%`;
  console.log('acting',JSON.stringify(Object.fromEntries(Object.entries(acting).map(([k,v])=>[k,{mouth:v.mouth,diff:v.diff,bloodied:v.bloodied,
    jawDeg:v.jaw*180/Math.PI,eyePx:v.box.eyePx,mouthBox:v.mouthBox}]))),'shoutTalk',JSON.stringify(shoutTalk));
  const DEG=Math.PI/180;
  assert.equal(acting.ijaA_Snarl.weights.snarl,1,'日兵甲 Snarl reaches 1');assert.equal(acting.ijaA_Shock.weights.shock,1);
  // Controls (same face and body, nothing changed) give the noise floor: breathing, film grain, AA jitter.
  const still=Math.max(acting.ijaA_Still.mouth,acting.comrade_PainStill.mouth),stillFace=Math.max(acting.ijaA_Still.diff,acting.comrade_PainStill.diff);
  const bloodFloor=acting.comrade_PainStill.bloodied;
  assert.ok(still<.05&&stillFace<.05,`control shots are steady (mouth ${Pct(still)}, face ${Pct(stillFace)} of blocks changed)`);
  const Shows=(shot,what,share=.06)=>assert.ok(shot.mouth>share&&shot.mouth>3*still,
    `${what} changes the mouth on screen (${Pct(shot.mouth)} of mouth blocks, control ${Pct(still)})`);
  Shows(acting.ijaA_Snarl,'日兵甲 Snarl');Shows(acting.ijaA_Shock,'日兵甲 Shock');Shows(acting.ijaA_Shout,'日兵甲 Shout');
  assert.ok(acting.ijaA_Shock.jaw>5*DEG,`日兵甲 Shock gapes (${(acting.ijaA_Shock.jaw/DEG).toFixed(1)} deg)`);
  assert.ok(acting.ijaA_Shout.jaw>12*DEG,`Shout drops the jaw (${(acting.ijaA_Shout.jaw/DEG).toFixed(1)} deg)`);
  Shows(acting.comrade_Pain,'comrade Pain',.04);Shows(acting.luo_Grit,'罗班长 Grit',.04);Shows(acting.luo_Concern,'罗班长 concern (pain .6 + shock .25)',.04);
  assert.equal(acting.comrade_Blood.took,true,'SetFaceBlood found the comrade head surface');
  assert.ok(acting.comrade_Blood.patched>0&&acting.comrade_Blood.blood===1);
  assert.ok(acting.comrade_Blood.bloodied>bloodFloor+.015,`blood is drawn: ${Pct(acting.comrade_Blood.bloodied)} of the face box turned blood red (control ${Pct(bloodFloor)})`);
  assert.ok(acting.comrade_Blood.diff>.08&&acting.comrade_Blood.diff>3*stillFace,`blood changes the face (${Pct(acting.comrade_Blood.diff)} of face blocks)`);
  assert.ok(shoutTalk.high-shoutTalk.low>6*DEG,`under Shout the mouth still opens and shuts (${(shoutTalk.low/DEG).toFixed(1)}-${(shoutTalk.high/DEG).toFixed(1)} deg)`);

  // Talking lip shapes at 0.6 m (2026-09-25 review: the Open/Round/Near close-ups only proved the jaw).
  // Held track samples as the speaker binder delivers them (the runtime track gains apply): the mouth
  // corners and both lips move off rest in world space, the mouth box changes on screen, and a wide
  // syllable and a rounded one are different mouths from the front (corner distance and pixels).
  const talkShapes={};
  for(const castId of ['ijaA','comrade','interpreter']){
    const shapes={};
    for(const [label,speech] of [['Rest',null],['RestAgain',null],['Wide',{active:true,jaw:.5,wide:.5,round:0,close:0,stress:0}],
      ['Round',{active:true,jaw:.45,wide:0,round:.5,close:0,stress:0}],['Close',{active:true,jaw:0,wide:0,round:0,close:1,stress:0}]]){
      shapes[label]=await page.evaluate(({castId,label,speech})=>{
        const p=window.SpeechProbe,g=p.g,T=p.T,actor=p.closeup[castId],rig=actor.characterRig,face=rig.facial;
        for(const other of Object.values(p.closeup))other.root.visible=other===actor;
        p.focus=rig;p.distance=.6;p.faceOn=true;p.eyeLevel=true;face.gaze=null;face.nextBlinkS=99;face.blinkAge=-1;
        p.facialApi.SetExpression(rig,{snarl:0,shock:0,pain:0,shout:0,grit:0},0);p.facialApi.SetFaceBlood(rig,0);
        face.source=speech?()=>speech:null;for(let i=0;i<20;i++)face.Update(1/60,{});
        g.post.NotifyCameraCut();g.StepFrames(3,1/60,true);
        const grab=p.Grab(castId);(p.talkGrab ||= {})[castId+label]=grab.mouth;
        const W=name=>face.controls.find(c=>c.name===name).bone.getWorldPosition(new T.Vector3());
        const head=rig.bones.head.getWorldPosition(new T.Vector3());
        const bones=Object.fromEntries(['Face_CornerL','Face_CornerR','Face_LipUpper','Face_LipLower'].map(n=>[n,W(n).sub(head).toArray()]));
        const Blocks=(a,b)=>p.ChangedBlocks(a,b,p.mouthBox[castId].w,p.mouthBox[castId].h);
        const ref=p.talkGrab[castId+'Rest'];
        return {bones,width:W('Face_CornerL').distanceTo(W('Face_CornerR')),weights:{wide:face.wide,round:face.round,close:face.close},
          mouth:ref&&label!=='Rest'?Blocks(grab.mouth,ref):0,vsWide:label==='Round'?Blocks(grab.mouth,p.talkGrab[castId+'Wide']):null};
      },{castId,label,speech});
      if(label!=='RestAgain')await page.screenshot({path:path.join(output,`Talk_${castId}_${label}.png`)});
    }
    await page.evaluate(()=>{window.SpeechProbe.closeup.ijaA.characterRig.facial.source=null;});
    const Move=(label,bone)=>1000*Math.hypot(...shapes[label].bones[bone].map((x,k)=>x-shapes.Rest.bones[bone][k]));
    talkShapes[castId]={still:shapes.RestAgain.mouth,
      move:Object.fromEntries(['Wide','Round','Close'].map(l=>[l,Object.fromEntries(['Face_CornerL','Face_CornerR','Face_LipUpper','Face_LipLower'].map(b=>[b,+Move(l,b).toFixed(1)]))])),
      widthMm:Object.fromEntries(['Rest','Wide','Round'].map(l=>[l,+(shapes[l].width*1000).toFixed(1)])),
      mouth:{wide:shapes.Wide.mouth,round:shapes.Round.mouth,close:shapes.Close.mouth,wideVsRound:shapes.Round.vsWide},
      weights:{wide:shapes.Wide.weights.wide,round:shapes.Round.weights.round}};
  }
  await page.evaluate(()=>{window.SpeechProbe.eyeLevel=false;});
  console.log('talkShapes',JSON.stringify(talkShapes));
  for(const [castId,t] of Object.entries(talkShapes)){
    // Track .5 (a typical baked value) reaches the rig as .8 with the 1.6 gain.
    assert.ok(t.weights.wide>.75&&t.weights.round>.75,`${castId}: track lip shapes are boosted (${JSON.stringify(t.weights)})`);
    for(const label of ['Wide','Round'])for(const bone of ['Face_CornerL','Face_CornerR'])
      assert.ok(t.move[label][bone]>=3,`${castId} ${label}: ${bone} moves >= 3 mm while talking (${t.move[label][bone]} mm)`);
    for(const label of ['Wide','Round'])assert.ok(t.move[label].Face_LipUpper>=2&&t.move[label].Face_LipLower>=2,
      `${castId} ${label}: both lips move >= 2 mm (${t.move[label].Face_LipUpper}/${t.move[label].Face_LipLower} mm)`);
    assert.ok(t.widthMm.Wide-t.widthMm.Round>=12,`${castId}: a wide syllable is >= 12 mm wider than a round one (${JSON.stringify(t.widthMm)})`);
    assert.ok(t.still<.05,`${castId}: talk-shape control is steady (${Pct(t.still)})`);
    // Close presses lips that are already shut at rest: it moves the lips, not many pixels.
    assert.ok(t.move.Close.Face_LipLower>=2,castId+': Close presses the lower lip up >= 2 mm ('+t.move.Close.Face_LipLower+' mm)');
    for(const [k,v] of Object.entries({wide:t.mouth.wide,round:t.mouth.round,'wide vs round':t.mouth.wideVsRound}))
      assert.ok(v>.06&&v>3*t.still,`${castId}: ${k} changes the mouth on screen (${Pct(v)} of mouth blocks, control ${Pct(t.still)})`);
  }
  // Blood goes on the face skin only (not the NRA cap brim: 2026-09-25 review), and survives the
  // cloth-wound stacking cycle with one copy of each patch and no program that fails to link.
  assert.equal(acting.comrade_Blood.patched,1,`one face surface takes the blood (${acting.comrade_Blood.patchedMaterials})`);
  const bloodCycle=await page.evaluate(async()=>{
    const p=window.SpeechProbe,g=p.g,T=p.T,actor=p.closeup.comrade,rig=actor.characterRig,face=rig.facial;
    const {PatchKeysOf}=await import('./Script_MaterialPatches.mjs');
    const {FaceBloodFrame,FaceBloodLipDistance}=await import('./Script_CharacterFaceBlood.mjs');
    const {FACE_BLOOD}=await import('./Data_Tuning_CharacterSpeech.mjs');
    for(const other of Object.values(p.closeup))other.root.visible=other===actor;
    face.Reset(); // back to the shared materials (the acting shots left the blood clone on)
    const before=new Map();rig.root.traverse(o=>{if(o.isMesh)before.set(o,o.material);});
    p.facialApi.SetFaceBlood(rig,1);
    const changed=[];rig.root.traverse(o=>{if(o.isMesh&&before.get(o)!==o.material)changed.push(o);});
    const lip=changed.map(o=>FaceBloodLipDistance(o,FaceBloodFrame(o)));
    const Keys=()=>{const out=[];rig.root.traverse(o=>{if(o.isMesh)for(const k of PatchKeysOf(o.material))if(/face-blood|cloth-wound/.test(k))out.push(k);});return out;};
    const steps={};
    actor.AddBulletWound('head',new T.Vector3(0,0,1));steps.wound=Keys();
    face.Reset();p.facialApi.SetFaceBlood(rig,1);steps.bloodAgain=Keys();
    g.post.NotifyCameraCut();g.StepFrames(3,1/60,true);
    actor.woundBlood?.Clear();actor.AddBulletWound('head',new T.Vector3(0,0,1));steps.woundAgain=Keys();
    g.StepFrames(3,1/60,true);
    actor.woundBlood?.Clear();p.facialApi.SetFaceBlood(rig,0);g.StepFrames(1,1/60,true);
    return {changed:changed.map(o=>o.material.name),lip,reach:FACE_BLOOD.skinLipReach,steps};
  });
  console.log('bloodCycle',JSON.stringify(bloodCycle));
  assert.equal(bloodCycle.changed.length,1,`blood clones one material, the face skin (${bloodCycle.changed})`);
  assert.ok(bloodCycle.lip[0]<=bloodCycle.reach,`the bloodied surface holds the lips (${bloodCycle.lip[0]?.toFixed(3)} eye distances)`);
  for(const [step,keys] of Object.entries(bloodCycle.steps)){
    assert.equal(new Set(keys).size,keys.length,`${step}: no patch twice on one material (${keys})`);
    assert.ok(keys.includes('face-blood-1'),`${step}: face blood still on`);
  }
  assert.ok(bloodCycle.steps.wound.some(k=>/cloth-wound/.test(k))&&bloodCycle.steps.woundAgain.some(k=>/cloth-wound/.test(k)),'the head wound stacks on the blood');
  assert.deepEqual(shaderErrors,[],'no shader fails to compile or link');

  // Motion vectors: the mouth writes velocity while the jaw moves, none when still.
  const velocity=await page.evaluate(async()=>{
    const p=window.SpeechProbe,g=p.g,T=p.T,renderer=g.renderer;
    const {PrepassPass}=await import('./Script_PostPrepass.mjs');
    const {MakeFullscreenMaterial,MakeRenderTarget}=await import('./Script_PostCommon.mjs');
    const actor=p.closeup.yaowa,rig=actor.characterRig,face=rig.facial;
    const scene=new T.Scene();const parent=actor.root.parent;scene.add(actor.root);actor.root.visible=true;
    const pipeline={preset:{velocity:true,hzb:false},hdrCapable:true,hdrType:T.HalfFloatType,targets:{}};
    const pass=new PrepassPass(pipeline);pass.Resize(320,240);
    const target=MakeRenderTarget(320,240,{type:T.HalfFloatType});
    const copy=MakeFullscreenMaterial('uniform sampler2D uVelocity; uniform sampler2D uDepth; varying vec2 vUv; void main(){gl_FragColor=vec4(texture2D(uVelocity,vUv).xy,texture2D(uDepth,vUv).w,1.0);}',
      {uVelocity:{value:pass.velocityTexture},uDepth:{value:pass.normalDepthTexture}});
    const readScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),copy);readScene.add(quad);
    const readCamera=new T.Camera(),pixels=new Uint16Array(320*240*4);
    const camera=new T.PerspectiveCamera(30,320/240,.02,20);
    actor.root.updateMatrixWorld(true);
    const lip=face.controls.find(c=>c.name==='Face_LipLower').bone.getWorldPosition(new T.Vector3());
    const brow=face.controls.find(c=>c.name==='Face_BrowL').bone.getWorldPosition(new T.Vector3());
    const forward=new T.Vector3(0,0,-1).transformDirection(actor.root.matrixWorld);
    camera.position.copy(lip).addScaledVector(forward,.6);camera.position.y+=.05;camera.lookAt(lip);camera.updateMatrixWorld(true);
    const Box=point=>{const v=point.clone().project(camera);return {x:Math.round((v.x*.5+.5)*320),y:Math.round((v.y*.5+.5)*240)};};
    const mouth=Box(lip),forehead=Box(brow.clone().add(new T.Vector3(0,.04,0)));
    const prev=new T.Matrix4();let frame=0;
    const Region=(center,half)=>{
      let max=0,count=0;
      for(let y=center.y-half;y<=center.y+half;y++)for(let x=center.x-half;x<=center.x+half;x++){
        if(x<0||y<0||x>=320||y>=240)continue;const i=(y*320+x)*4;
        if(T.DataUtils.fromHalfFloat(pixels[i+2])<=0)continue;count++;
        max=Math.max(max,Math.hypot(T.DataUtils.fromHalfFloat(pixels[i])*320,T.DataUtils.fromHalfFloat(pixels[i+1])*240));
      }
      return {max,count};
    };
    const Draw=()=>{
      scene.updateMatrixWorld(true);
      const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      pass.Render({renderer,scene,camera,viewProjection:vp,prevViewProjection:prev,hasPrev:frame++>0});
      renderer.setRenderTarget(target);renderer.render(readScene,readCamera);
      renderer.readRenderTargetPixels(target,0,0,320,240,pixels);pass._SnapshotSkeletons();prev.copy(vp);
      return {mouth:Region(mouth,6),forehead:Region(forehead,6)};
    };
    const Face=state=>{face.source=null;face.Update(1/60,state);};
    const talk={active:true,jaw:0,wide:0,round:0,close:0,stress:0};
    Face({speech:{...talk}});for(let i=0;i<30;i++)Face({speech:{...talk}});
    Draw();Draw();
    const silent=Draw();
    face.jaw=0;Face({speech:{...talk,jaw:.9}});face.jaw=.9;Face({speech:{...talk,jaw:.9}});
    const speaking=Draw();
    const held=Draw();
    pass.Dispose();target.dispose();copy.dispose();quad.geometry.dispose();renderer.setRenderTarget(null);
    parent?.add(actor.root);
    return {mouthPixel:mouth,silent,speaking,held};
  });
  assert.ok(velocity.speaking.mouth.count>10,'mouth is on screen for the velocity probe');
  assert.ok(velocity.speaking.mouth.max>.5,`talking mouth writes motion vectors (${velocity.speaking.mouth.max.toFixed(2)} px)`);
  assert.ok(velocity.silent.mouth.max<.05,`still mouth writes none (${velocity.silent.mouth.max.toFixed(3)} px)`);
  assert.ok(velocity.held.mouth.max<.05,'history settles once the jaw stops');
  assert.ok(velocity.speaking.forehead.max<.05,'only the jaw region moves');

  // 06: Zhou waits for the stretcher sitting against the earth wall as a live NRA02 body with a face
  // (Script_FirstLevelCollection.SeatZhou; the baked litter patient has no skeleton). BorrowLight on
  // simulation time: his jaw follows his own five lines and stays shut while Shunzi talks.
  const seat06=await page.evaluate(async()=>{
    const p=window.SpeechProbe,g=p.g;p.r.voice.Pause();
    await g.Debug.FirstLevelJump(6);
    const r=g.Debug.FirstLevelMissionRuntime();await r.voiceReady;
    for(let i=0;i<20&&!r.frontShow.collection.seated;i++)g.StepFrames(3,1/60,false);
    const zhou=r.frontShow.collection.seated,rig=zhou?.actor?.characterRig,face=rig?.facial;
    if(!face)return {error:'no seated live Zhou with a face',state:r.frontShow.collection.State(),stage:r.flow.stage.id};
    // Stand where the player borrows the light (Place.collection.borrowStand), facing him, so he is a
    // full-rate near actor (AI animation cadence and culling go by the camera, as in play).
    const {MISSION_PLACEMENT}=await import('./Data_FirstLevelMissionLayout.mjs'),stand=MISSION_PLACEMENT.collection.borrowStand;
    const y=g.battlefield.GroundHeight(stand.x,stand.z);g.player.position.set(stand.x,y,stand.z);g.player.body?.Teleport(stand.x,y,stand.z);
    g.player.yaw=Math.atan2(stand.x-zhou.position.x,stand.z-zhou.position.z);g.player.pitch=-.12;
    p.focus=rig;p.distance=2.6;p.faceOn=true;g.post.NotifyCameraCut();g.StepFrames(6,1/60,true);
    const Jaw=()=>{const c=face.controls.find(c=>c.name==='Face_Jaw');return c.bone.quaternion.angleTo(c.quaternion);};
    const Moving=()=>face.weights.Open>=.1||face.weights.Wide>=.25||face.weights.Round>=.25||face.weights.Close>=.5;
    const hip=rig.bones.pelvis||rig.bones.hips||rig.bones.hip,T=p.T;
    const pose={bound:r.speakers.ActorForWho('zhou')===zhou,model:rig.modelId,sit:zhou.actor.lifePose?.sit??null,
      hipY:hip?+(hip.getWorldPosition(new T.Vector3()).y-g.battlefield.GroundHeight(zhou.position.x,zhou.position.z)).toFixed(3):null,
      headY:+(rig.bones.head.getWorldPosition(new T.Vector3()).y-g.battlefield.GroundHeight(zhou.position.x,zhou.position.z)).toFixed(3),
      weaponShown:!!zhou.actor.weaponGroup?.visible,baked:r.column.zhou.liveSeated===true};
    const clock=r.voice.Clock;r.voice.Clock=()=>NaN;await g.audio.ctx.suspend();
    r.voice.Pause();for(let i=0;i<20;i++)g.StepFrames(1,1/60,false);
    r.voice.Replay('BorrowLight');r.voice.Update(0);
    const rows=[];let shot=null;
    while(r.voice.current?.cue.id==='BorrowLight'&&r.voice.State().playbackPhase==='playing'&&rows.length<3000){
      g.StepFrames(1,1/60,rows.length%3===0);
      const zs=r.speakers.Speech('zhou');
      const row={t:r.voice.current?.sourceTime??0,zhou:!!zs?.active,other:!zs?.active&&!!r.voice.Speech?.('shunzi')?.active,
        target:zs?.jaw??null,jaw:Jaw(),moving:Moving(),visible:!!zhou.actor.root.visible,lod:zhou.renderLod??null};
      rows.push(row);
      if(!shot&&row.zhou&&row.jaw>.1){shot=row.t;window.Seat06Shot={rig,held:{...zs},source:face.source};}
    }
    r.voice.Clock=clock;await g.audio.ctx.resume();
    return {pose,rows,shot};
  });
  assert.ok(!seat06.error,`06: ${seat06.error} ${JSON.stringify(seat06.state)} ${seat06.stage}`);
  assert.ok(seat06.pose.bound,'06: the speaker binder plays zhou on the seated live body');
  assert.equal(seat06.pose.model,'TengxianNra02','06: seated Zhou keeps his NRA02 face');
  assert.equal(seat06.pose.sit,1,'06: Zhou sits (lifePose.sit)');
  // Actor.sit is a bench pose (Zhou sits on an ammo box against the wall): standing heads are ~1.6 m.
  assert.ok(seat06.pose.headY<1.42,`06: his head is at sitting height (${seat06.pose.headY} m above the ground)`);
  assert.equal(seat06.pose.weaponShown,false,'06: no rifle on the seated Zhou');
  {
    const SETTLE_S=.15;let spoke=-1e9;
    for(const row of seat06.rows){if(row.zhou)spoke=row.t;row.settled=row.t-spoke>SETTLE_S;}
    const talk=seat06.rows.filter(row=>row.zhou),articulating=talk.filter(row=>row.target==null||row.target>=.1);
    const following=articulating.length?articulating.filter(row=>row.moving).length/articulating.length:0;
    const listeningOpen=seat06.rows.filter(row=>row.other&&row.settled&&row.jaw>SILENT_JAW_RADIANS).length;
    const listening=seat06.rows.filter(row=>row.other&&row.settled).length;
    seat06.stats={frames:seat06.rows.length,talk:talk.length,following,listening,listeningOpen};
    assert.ok(talk.length>60,`06: Zhou's BorrowLight lines drive his face (${talk.length} frames)`);
    assert.ok(following>=.8,`06: face follows his track on >=80% of articulating frames (${following.toFixed(2)})`);
    assert.ok(listening>30,`06: Shunzi's lines were sampled (${listening} frames)`);
    assert.equal(listeningOpen,0,'06: Zhou keeps his mouth shut while Shunzi talks');
  }
  // Close-up (mid-word) and a wider look at the seated pose, through the production chain.
  if(seat06.shot!=null){
    await page.evaluate(()=>{const p=window.SpeechProbe,s=window.Seat06Shot;s.rig.facial.source=()=>s.held;
      p.focus=s.rig;p.distance=1.2;p.faceOn=true;p.g.post.NotifyCameraCut();p.g.StepFrames(10,1/60,true);});
    await page.screenshot({path:path.join(output,'Scene_ZhouSeated06_MidWord.png')});
    await page.evaluate(()=>{const p=window.SpeechProbe;p.distance=2.6;p.g.post.NotifyCameraCut();p.g.StepFrames(6,1/60,true);});
    await page.screenshot({path:path.join(output,'Scene_ZhouSeated06_Pose.png')});
    await page.evaluate(()=>{const s=window.Seat06Shot;s.rig.facial.source=s.source;});
  }
  seat06.rows=seat06.rows.filter((_,i)=>i%4===0);
  await fs.writeFile(path.join(output,'Data_CharacterSpeech.json'),JSON.stringify({initial,samples,pauseReceipt,pause,resumed,closeups,acting,shoutTalk,talkShapes,bloodCycle,velocity,seat06,
    faceTrack:{key:trackRun.key,shots,track:trackStats,envelope:envelopeStats,trackRows:trackPass.rows,envelopeRows:envelopePass.rows},errors},null,2));
  assert.deepEqual(errors,[]);
  console.log(`ok live faces: Luo speaks with his own line, Yaowa listens closed-mouthed; ${closeups.length} close-ups of 6 facial skins; acting ${Object.keys(acting).length} shots (snarl/shock/shout/grit/pain/blood); `
    +`mouth velocity ${velocity.speaking.mouth.max.toFixed(2)} px talking / ${velocity.silent.mouth.max.toFixed(3)} px still; `
    +`TakeOverGun track ${JSON.stringify(trackStats)} vs envelope ${JSON.stringify(envelopeStats)}; 06 seated Zhou ${JSON.stringify(seat06.stats)}`);
} catch(error){
  await page.screenshot({path:path.join(output,'Scene_Failure.png')}).catch(()=>{});
  console.error(await page.evaluate(()=>({boot:document.querySelector('#bootText')?.textContent,errors:window.Tengxian?.Debug.FirstLevelMissionRuntime()?.voice?.errors})).catch(()=>null));
  throw error;
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
