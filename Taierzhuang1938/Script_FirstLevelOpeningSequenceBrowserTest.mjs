// Observe the uninterrupted opening. No stage jumps, mission facts, actor
// positions, health or inventory are changed by this acceptance driver.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {OPENING} from './Data_FirstLevelOpening.mjs';
import {SampleOpeningPerception} from './Script_FirstLevelOpening.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'_shots/CarriageOpeningSequence');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.dirname(here),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],trace=[],shots=new Set();
let renderBackend=null,tracerProof=null,tracerCaptureTried=false;
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')console.log('BROWSER_ERROR',message.text().slice(0,600));});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
  await page.locator('#bootStart').click();
  await page.waitForFunction(()=>window.Tengxian.audio.ctx?.state==='running',null,{timeout:15000});
  assert.ok(await page.evaluate(()=>['TrainMeal','TrainBanter','TrainBriefing','TrainShelling'].every(id=>
    window.Tengxian.audio.voiceBank.get('Mission'+id)?.duration>0)),'the opening uses decoded recordings in the live audio engine');
  console.log('OPENING_READY');
  renderBackend=await page.evaluate(()=>{const gl=window.Tengxian.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(info?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),version:gl.getParameter(gl.VERSION),preset:new URL(location.href).searchParams.get('quality')};});
  console.log('OPENING_RENDERER',JSON.stringify(renderBackend));
  const layout=await page.evaluate(async()=>{
    const {MISSION_LAYOUT}=await import('./Data_FirstLevelMissionLayout.mjs');
    window.ReadOpeningTracer=()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),shot=r.opening.barrage.lastShot;
      if(!shot)return {visible:false,reason:'no shot'};
      const from=g.player.position.clone().copy(shot.from),to=from.clone().copy(shot.to),distance=from.distanceTo(to),age=r.time-shot.time;
      if(age<=0||age>=distance/shot.speed)return {visible:false,reason:'between rounds',age};
      const point=from.lerp(to,age*shot.speed/distance),ndc=point.clone().project(g.camera);
      const ray=point.clone().sub(g.camera.position),range=ray.length();
      const hit=g.battlefield.Raycast(g.camera.position,ray.normalize(),range,{terrain:true});
      return {visible:Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.95&&ndc.z>-1&&ndc.z<1&&(!hit||hit.t>=range-.05),
        age,point:point.toArray(),ndc:ndc.toArray(),occlusion:hit?{distance:hit.t,range}:null,shot};
    };
    return {benches:MISSION_LAYOUT.blocks.filter(block=>/^StationCar\d+Bench/.test(block.id)).map(block=>block.id)};
  });
  assert.deepEqual(layout.benches,[],'all three active carriages have no bench geometry');
  for(let tick=0;tick<130*4;tick++){
    const row=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      g.StepFrames(15,1/60,false);
      const voice=r.voice.current;
      return {time:r.time,stage:r.flow.stage.id,facts:[...r.flow.facts],failed:r.failed,health:g.player.health,
        stance:g.player.stance,position:g.player.position.toArray(),camera:g.camera.position.toArray(),cameraRotation:g.camera.rotation.toArray(),
        listener:{...g.audio.listenerPos},
        voice:r.voice.State(),parallelPlaying:!!voice?.parallel?.some(track=>track.voice&&!track.finished),
        subtitle:g.hud.el.subtitle?.innerText||'',opening:r.opening.State(),
        passengers:r.train.entries.map(entry=>{
          const a=entry.actor,rig=a.actor.characterRig,life=a.missionTrainLife;
          return {id:a.id,cast:a.castId,modelId:rig.modelId,alive:a.alive,stance:a.stance,wall:life.wall,seated:life.seated,
            posture:life.posture,position:a.position.toArray(),animationPending:life.animationPending,
            animation:rig.missionTrainLifeState,action:a.missionCarriageAction,
            head:rig.bones.head.quaternion.toArray(),pelvis:rig.bones.pelvis.position.toArray(),
            foot:rig.bones.footL.getWorldPosition(g.player.position.clone()).toArray()};
        })};
    });
    trace.push(row);
    assert.ok(!row.failed&&row.health>0,'scripted opening remains survivable before control returns');
    const fireAge=row.time-(row.opening.barrage.startedAt??Infinity);
    const recoveryAge=row.time-(row.opening.luoRecoveryAt??Infinity);
    const rescueAge=row.opening.rescueAt==null?-Infinity:row.opening.rescueSampleTime;
    const concurrentSubtitles=row.parallelPlaying&&row.subtitle.includes('罗班长')&&
      (row.subtitle.includes('刘文财')||row.subtitle.includes('何有田'));
    const captures=[['WallIdles',row.time>2],['Overlap',row.voice.current==='TrainBanter'&&concurrentSubtitles],
      ['BarrageCrouch',fireAge>1.4&&!row.facts.includes('trainNearShellImpact')],
      ['CloseImpact',row.opening.derailAt!=null&&row.time-row.opening.derailAt<1.6],
      ['LuoFailedRise',recoveryAge>1.6&&recoveryAge<2.3],['LuoStanding',row.facts.includes('trainLuoStanding')&&rescueAge<0],
      ['LuoReach',rescueAge>1.25&&rescueAge<2.1],['LuoPull',rescueAge>2.5&&rescueAge<3.5],
      ['RescueComplete',row.facts.includes('luoRescueComplete')]];
    for(const [name,ready] of captures)if(ready&&!shots.has(name)){
      // Simulation and actor poses run on every frame. Rasterize consecutive
      // high-quality frames at each witnessed beat; the independent velocity
      // gates cover moving history rather than baking thousands of unused PNGs.
      await page.evaluate(()=>{const g=window.Tengxian;g.post.NotifyCameraCut();g.StepFrames(6,1/60,true);});
      shots.add(name);await page.screenshot({path:path.join(out,`Scene_${name}.png`)});
      console.log('OPENING_CAPTURE',name,row.time.toFixed(2));
    }
    if(fireAge>1.4&&!row.facts.includes('trainNearShellImpact')&&!tracerCaptureTried){
      tracerCaptureTried=true;
      tracerProof=await page.evaluate(()=>{
        const g=window.Tengxian;g.post.NotifyCameraCut();g.StepFrames(6,1/60,true);
        const samples=[];
        for(let i=0;i<60;i++){
          g.StepFrames(1,1/60,true);
          const sample=window.ReadOpeningTracer();samples.push(sample);
          if(sample.visible)return {visible:true,time:g.Debug.FirstLevelMissionRuntime().time,sample};
        }
        return {visible:false,samples};
      });
      await page.screenshot({path:path.join(out,tracerProof.visible?'Scene_BarrageTracer.png':'Scene_BarrageTracerUnseen.png')});
      if(tracerProof.visible){shots.add('BarrageTracer');console.log('OPENING_CAPTURE BarrageTracer',tracerProof.time.toFixed(2));}
    }
    if(row.facts.includes('unloadOrdersHeard')&&row.facts.includes('luoRescueComplete'))break;
  }
  const initial=trace.find(row=>row.time>2),overlap=trace.find(row=>row.parallelPlaying),last=trace.at(-1);
  assert.equal(initial.passengers.length,41,'same forty recruits and leader remain aboard');
  assert.ok(initial.passengers.every(a=>!a.seated&&!a.animationPending&&a.animation?.animation),'every passenger has a loaded original-rig animation');
  assert.ok(initial.passengers.some(a=>a.posture==='crouch')&&initial.passengers.some(a=>a.posture==='stand'),'both standing and crouching idle groups are present');
  const later=trace.find(row=>row.time>initial.time+1.5);
  for(const a of initial.passengers.filter(a=>!a.cast&&a.wall)){
    const b=later.passengers.find(b=>b.id===a.id);
    assert.ok(a.head.some((value,index)=>Math.abs(value-b.head[index])>1e-6),'silent wall passenger has a live idle: '+a.id);
  }
  assert.ok(overlap&&overlap.voice.current==='TrainBanter','briefing actually plays concurrently with the complete banter');
  assert.ok(Math.hypot(overlap.listener.x-overlap.camera[0],overlap.listener.y-overlap.camera[1],overlap.listener.z-overlap.camera[2])<.25,
    'non-raster simulation keeps the actual spatial listener at the moving player');
  assert.ok(trace.some(row=>row.parallelPlaying&&row.subtitle.includes('罗班长')&&(row.subtitle.includes('刘文财')||row.subtitle.includes('何有田'))),'concurrent subtitles retain both speaker names');
  const crouched=trace.find(row=>row.opening.barrage.startedAt!=null&&row.time-row.opening.barrage.startedAt>1.5&&!row.facts.includes('trainNearShellImpact'));
  assert.ok(crouched&&crouched.stance==='crouch'&&crouched.passengers.every(a=>a.posture==='crouch'&&a.stance===1),'player and entire crowd crouch before the near shell');
  assert.ok(crouched.opening.barrage.shots>=6&&trace.some(row=>!row.facts.includes('trainNearShellImpact')&&row.opening.barrage.impacts.length>=2),
    'visible tracer bursts and multiple physical ranging impacts precede the near shell');
  assert.ok(tracerProof?.visible,'a real moving tracer is in the player view and clear of carriage walls in a rendered barrage frame');
  const recovery=trace.find(row=>row.opening.luoRecoveryAt!=null),standing=trace.find(row=>row.facts.includes('trainLuoStanding'));
  const waiting=trace.filter(row=>row.facts.includes('trainDerailed')&&row.opening.luoRecoveryAt==null);
  assert.ok(waiting.length&&waiting.every(row=>{
    const luo=row.passengers.find(actor=>actor.cast==='luo');
    return luo?.action?.clipId==='LuoStaggerRecover'&&luo.action.seconds===0&&row.opening.rescueAt==null;
  }),'Luo remains on the authored ground pose while the blackout conceals his first rise');
  assert.ok(SampleOpeningPerception(recovery.opening.luoRecoveryAt-recovery.opening.derailAt).eyeClosure<=OPENING.luoRecoveryMaxEyeClosure,
    'the actual sensory curve permits the full failed rise to start');
  const failedRise=trace.filter(row=>{
    const action=row.passengers.find(actor=>actor.cast==='luo')?.action;
    return action?.clipId==='LuoStaggerRecover'&&action.seconds>=1.45&&action.seconds<=1.85;
  });
  assert.ok(failedRise.length&&failedRise.every(row=>row.opening.eyeClosure<=OPENING.luoRecoveryMaxEyeClosure&&
    SampleOpeningPerception(row.time-row.opening.derailAt).eyeClosure<=OPENING.luoRecoveryMaxEyeClosure),
    'the rendered failed first attempt is visible through the actual player eyelids');
  assert.ok(standing.time-recovery.opening.luoRecoveryAt>=OPENING.luoRecoverySeconds,'the complete failed-rise performance precedes standing permission');
  assert.ok(last.opening.rescueAt>=standing.opening.luoRecoveryAt+OPENING.luoRecoverySeconds,'Luo cannot help before recovering his own footing');
  const reaches=trace.filter(row=>row.opening.rescueAt!=null&&row.opening.rescueSampleTime<OPENING.rescuePullSeconds);
  assert.ok(reaches.length&&reaches.every(row=>row.camera[1]-row.position[1]<.65),'Shunzi stays down until the reaching hand grips and starts pulling');
  assert.ok(last.facts.includes('luoRescueComplete')&&last.facts.includes('unloadOrdersHeard'),'rescue and the retained exit instructions complete normally');
  assert.ok(['TrainMeal','TrainBanter','TrainBriefing','TrainShelling'].every(id=>last.voice.finished.includes(id)),'all complete opening recordings finish');
  assert.deepEqual(errors,[]);
  assert.ok(['Overlap','BarrageCrouch','LuoFailedRise','LuoReach','LuoPull','RescueComplete'].every(name=>shots.has(name)),'rendered evidence covers the requested action order');
  console.log('PASS complete carriage dialogue, animated crowd, barrage, recovery and rescue sequence');
}catch(error){
  await page.screenshot({path:path.join(out,'Scene_Failure.png'),timeout:10000}).catch(()=>{});
  throw error;
}finally{
  await fs.writeFile(path.join(out,'Data_OpeningSequence.json'),JSON.stringify({renderBackend,trace,errors,shots:[...shots],tracerProof},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
