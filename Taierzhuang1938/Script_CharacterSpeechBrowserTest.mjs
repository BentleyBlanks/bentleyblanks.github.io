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
const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try {
  await page.goto(`http://127.0.0.1:${local||server.address().port}/Taierzhuang1938/?whitebox=p012&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
  await page.locator('#bootStart').click();
  await page.waitForFunction(()=>window.Tengxian.audio.ctx?.state==='running' &&
    window.Tengxian.audio.voiceBank.get('MissionTrainBriefing')?.speechEnvelope,null,{timeout:90000});
  const initial=await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();await r.voiceReady;
    g.StepFrames(12,1/60,true);
    const luo=g.companion.Handle('luo'),rig=luo.actor.characterRig,face=rig.facial;
    if(!face)throw Error('Live Luo lacks the authored facial rig');
    const T=await import('three');
    const control=face.controls.find(c=>c.name==='Face_Jaw');
    const meshes=[];rig.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
    window.SpeechProbe={g,r,luo,rig,face,control,meshes,T,render:g.post.Render};
    const probe=window.SpeechProbe;
    // Diagnostic close-up only. Render through the unchanged production post chain.
    g.post.Render=function(scene,camera,options){
      const center=rig.bones.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.10,0));
      const forward=new T.Vector3(0,0,-1).transformDirection(luo.actor.root.matrixWorld);
      camera.position.copy(center).addScaledVector(forward,.74);camera.position.y+=.025;
      camera.lookAt(center);camera.updateMatrixWorld(true);g.viewmodel.root.visible=false;
      return probe.render.call(this,scene,camera,options);
    };
    g.post.NotifyCameraCut();g.StepFrames(3,1/60,true);
    const ordinary=g.actorFactory.Create('nra',{modelVariant:4,seed:31});
    const ordinaryHasFace=!!ordinary.characterRig.facial;ordinary.Dispose();
    await g.audio.ctx.resume();r.voice.Clock=()=>g.audio.ctx.currentTime;
    r.voice.Replay('TrainBriefing');r.voice.Update(0);
    return {model:rig.modelId,controls:face.controls.length,ordinaryHasFace,
      envelopeSamples:g.audio.voiceBank.get('MissionTrainBriefing')?.speechEnvelope?.levels.length,
      audioState:g.audio.ctx.state,skinCounts:meshes.map(m=>m.skeleton.bones.length)};
  });
  assert.equal(initial.controls,11);assert.equal(initial.ordinaryHasFace,false);
  assert.ok(initial.envelopeSamples>100);assert.equal(initial.audioState,'running');
  const samples=[];let captured=false,pauseReceipt=null;
  for(let i=0;i<45;i++){
    await page.waitForTimeout(60);
    const sample=await page.evaluate(()=>{
      const p=window.SpeechProbe;p.g.StepFrames(3,1/60,true);
      const jaw=p.control.bone;
      return {source:p.r.voice.Speech('luo'),level:p.face.level,angle:jaw.quaternion.angleTo(p.control.quaternion),
        bodyClip:p.rig.currentId,playing:p.r.voice.State(),time:p.g.audio.ctx.currentTime};
    });
    samples.push(sample);
    if(!captured&&sample.angle>.075){
      captured=true;await page.screenshot({path:path.join(output,'Scene_LuoSpeaking.png')});
      pauseReceipt=await page.evaluate(()=>{
        const p=window.SpeechProbe,before=p.face.level,source=p.r.voice.current.sourceTime;
        p.r.voice.Pause();p.g.StepFrames(2,1/60,true);
        return {before,source,level:p.face.level,angle:p.control.bone.quaternion.angleTo(p.control.quaternion)};
      });
      assert.ok(pauseReceipt.before>.3);assert.equal(pauseReceipt.level,0);assert.ok(pauseReceipt.angle<1e-6);
      await page.screenshot({path:path.join(output,'Scene_LuoPaused.png')});
      const resumeSource=await page.evaluate(()=>{const p=window.SpeechProbe;p.r.voice.Resume();return p.r.voice.current.clockSource;});
      assert.equal(resumeSource,pauseReceipt.source,'resume retains the interrupted recording offset');
    }
  }
  assert.ok(captured,'actual voice opens the jaw');
  assert.ok(samples.some(s=>s.source?.level>.5));
  assert.ok(samples.some(s=>s.source?.level<.04),'recording pauses are detected');
  const pause=await page.evaluate(()=>{
    const p=window.SpeechProbe;p.r.voice.Pause();p.g.StepFrames(2,1/60,true);
    return {level:p.face.level,angle:p.control.bone.quaternion.angleTo(p.control.quaternion)};
  });
  assert.equal(pause.level,0);assert.ok(pause.angle<1e-6);
  const resumed=await page.evaluate(()=>{
    const p=window.SpeechProbe;p.r.voice.Replay('TrainBriefing');p.r.voice.Update(0);p.g.StepFrames(1,1/60,true);
    return {phase:p.r.voice.State().playbackPhase,source:p.r.voice.current.clockSource};
  });
  assert.equal(resumed.phase,'playing');assert.equal(resumed.source,0);
  await fs.writeFile(path.join(output,'Data_CharacterSpeech.json'),JSON.stringify({initial,samples,pauseReceipt,pause,resumed,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log('ok live Luo facial skin + real decoded voice clock/envelope, pause/replay, original crowd and production render');
} catch(error){
  await page.screenshot({path:path.join(output,'Scene_Failure.png')}).catch(()=>{});
  console.error(await page.evaluate(()=>({boot:document.querySelector('#bootText')?.textContent,errors:window.Tengxian?.Debug.FirstLevelMissionRuntime()?.voice?.errors})).catch(()=>null));
  throw error;
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
