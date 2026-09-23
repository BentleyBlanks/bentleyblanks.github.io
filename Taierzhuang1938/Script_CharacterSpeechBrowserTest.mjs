// Live speaker faces in the real first level: every face-rigged speaker moves its
// mouth with its own lines and nobody else's; listeners keep their mouths closed;
// facial skins of all four models render at 1-2 m through the production post
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
      const focus=probe.focus,root=focus.actor?.root||focus.root;
      const center=focus.bones.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.10,0));
      // Close-ups face the face itself (Biped head frame: local +Y is forward).
      const forward=probe.faceOn?new T.Vector3(0,1,0).transformDirection(focus.bones.head.matrixWorld).setY(0).normalize()
        :new T.Vector3(0,0,-1).transformDirection(root.matrixWorld);
      camera.position.copy(center).addScaledVector(forward,probe.distance);camera.position.y+=.025;
      camera.lookAt(center);camera.updateMatrixWorld(true);g.viewmodel.root.visible=false;
      return probe.render.call(this,scene,camera,options);
    };
    g.post.NotifyCameraCut();g.StepFrames(3,1/60,true);
    const ordinary=g.actorFactory.Create('nra',{modelVariant:4,seed:31});
    const ordinaryHasFace=!!ordinary.characterRig.facial;ordinary.Dispose();
    // Speaking cast: named roles get their pinned model's facial skin, never a pooled body.
    const cast={};
    for(const [castId,kind,variant] of [['ijaA','ija',1],['ijaB','ija',0],['guard','nra',1],['luo','nra',4]]){
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
  for(const [castId,model] of [['ijaA','LugouIja02'],['ijaB','LugouIja01'],['guard','LugouNra02'],['luo','LugouNra05']]){
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
      assert.ok(pauseReceipt.before>.3);
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

  // Close-ups of every facial skin, rest and mid-word, through the production chain.
  const closeups=[];
  for(const [castId,kind,variant] of [['yaowa','nra',1],['luo','nra',4],['ijaA','ija',1],['ijaB','ija',0]]){
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
  await fs.writeFile(path.join(output,'Data_CharacterSpeech.json'),JSON.stringify({initial,samples,pauseReceipt,pause,resumed,closeups,velocity,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log(`ok live faces: Luo speaks with his own line, Yaowa listens closed-mouthed; ${closeups.length} close-ups of 4 facial skins; `
    +`mouth velocity ${velocity.speaking.mouth.max.toFixed(2)} px talking / ${velocity.silent.mouth.max.toFixed(3)} px still`);
} catch(error){
  await page.screenshot({path:path.join(output,'Scene_Failure.png')}).catch(()=>{});
  console.error(await page.evaluate(()=>({boot:document.querySelector('#bootText')?.textContent,errors:window.Tengxian?.Debug.FirstLevelMissionRuntime()?.voice?.errors})).catch(()=>null));
  throw error;
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
