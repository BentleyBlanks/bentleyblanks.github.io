import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const project=import.meta.dirname,root=path.resolve(project,'..'),out=path.join(project,'_shots','ParticleVolumes');
await fs.mkdir(out,{recursive:true});
const map=(await fs.readFile(path.join(project,'index.html'),'utf8')).match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
const check=path.join(project,'_check_ParticleVolumes.html');
await fs.writeFile(check,`<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}</style><script type="importmap">${map}</script><script type="module">
import * as THREE from 'three';
import {ParticleEffects} from './Script_ParticleEffects.mjs';
import {CreateParticleEnvironment} from './Script_ParticleEnvironment.mjs';
const W=1280,H=720,renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,W/H,.05,1000),environment=CreateParticleEnvironment();
environment.shared.uSkyColor.value.set(.13,.16,.20);environment.shared.uSunColor.value.set(1.7,1.6,1.45);environment.shared.uSunDirection.value.set(-.6,.8,.4).normalize();environment.shared.uResolution.value.set(W,H);
const api=new ParticleEffects(scene,environment.shared,'high'),target=new THREE.WebGLRenderTarget(W,H),gl=renderer.getContext();
const beautyTarget=new THREE.WebGLRenderTarget(W,H,{type:THREE.HalfFloatType}),displayScene=new THREE.Scene(),displayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const display=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:beautyTarget.texture,depthTest:false,depthWrite:false}));displayScene.add(display);
const background=new THREE.Color('#708c9d');renderer.setClearColor(background,.37);
function Pixels(){renderer.setRenderTarget(target);renderer.render(scene,camera);const data=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,data);renderer.setRenderTarget(null);renderer.render(scene,camera);return data;}
function Difference(a,b){let pixels=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)pixels++;return pixels;}
window.Test={renderer,scene,camera,api,environment,Pixels,Difference,
 async Run(preset){
  for(const id of [...api.systems.keys()])api.Remove(id);
  const height=preset==='VolumeFire'?2.2:8;camera.position.set(height*1.1,height*.75,height*1.6);camera.lookAt(0,height*.5,0);camera.updateMatrixWorld(true);
  const empty=Pixels(),{id}=api.Create({preset});await api.Ready();api.Simulate(id,.8);const on=Pixels();
  api.Simulate(id,1.2);const later=Pixels();api.Simulate(id,.8);const replay=Pixels();api.Pause(id);api.Update(.5);const paused=Pixels();
  api.Configure(id,{renderer:{volumeYaw:1.1}});const rotated=Pixels();api.Configure(id,{renderer:{volumeYaw:0}});
  let alphaErrors=0;for(let i=3;i<on.length;i+=4)if(on[i]!==empty[i])alphaErrors++;
  const depth=new THREE.DataTexture(new Float32Array([0,0,0,1]),1,1,THREE.RGBAFormat,THREE.FloatType);depth.needsUpdate=true;
  const oldDepth=environment.shared.uNormalDepth.value;environment.shared.uNormalDepth.value=depth;environment.shared.uDepthValid.value=1;const occluded=Pixels();environment.shared.uDepthValid.value=0;environment.shared.uNormalDepth.value=oldDepth;depth.dispose();
  api.Configure(id,{renderer:{enabled:false}});const disabled=Pixels();api.Configure(id,{renderer:{enabled:true,density:24,emissionStrength:2}});const tuned=Pixels();
  const state=api.Inspect(id),volumes=api.Inspect().volumes;api.Remove(id);const removed=Pixels();
  return {preset,visible:Difference(on,empty),animated:Difference(on,later),rotated:Difference(on,rotated),replay:Difference(on,replay),paused:Difference(on,paused),alphaErrors,
   occluded:Difference(occluded,empty),disabled:Difference(disabled,empty),tuned:Difference(tuned,on),removed:Difference(removed,empty),state,volumes,glError:gl.getError()};
 },
 async BurstAndCycle(){
  for(const id of [...api.systems.keys()])api.Remove(id);
  camera.position.set(3,3,9);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);const empty=Pixels();
  const burst=api.VolumeBurst([0,0,0],{asset:'DustImpact',size:.7,life:4,speed:1.5,density:9,delay:.2,fadeIn:.1,velocity:[1,0,0]});await api.Ready();
  api.Update(.1);const pending=Pixels();api.Update(.5);const born=Pixels(),position=api.GetParticles(burst.id)[0].position;
  api.Pause(burst.id);const ignored=api.VolumeBurst([0,0,0],{asset:'DustImpact'});api.Remove(burst.id);
  const fire=api.Create({preset:'VolumeFire',modules:{main:{duration:.5,startLifetime:.5}}});await api.Ready();
  api.Simulate(fire.id,28/60);const a=Pixels();api.Simulate(fire.id,29/60);const b=Pixels();api.Simulate(fire.id,30/60);const c=Pixels();
  return {pending:Difference(empty,pending),born:Difference(empty,born),position,pausedRejects:ignored===null,normalStep:Difference(a,b),cycleStep:Difference(b,c)};
 },
 async Show(preset,angle=0,time=1){
  for(const id of [...api.systems.keys()])api.Remove(id);const {id}=api.Create({preset});await api.Ready();api.Simulate(id,time);
  const h=preset==='VolumeFire'?2.2:8;camera.position.set(Math.sin(angle)*h*2,h*.75,Math.cos(angle)*h*2);camera.lookAt(0,h*.5,0);camera.updateMatrixWorld(true);Pixels();
 },
 SetLight(direction){environment.shared.uSunDirection.value.fromArray(direction).normalize();Pixels();},
 Beauty(){renderer.setRenderTarget(beautyTarget);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.render(displayScene,displayCamera);renderer.toneMapping=THREE.NoToneMapping;},
 Dispose(){api.Dispose();target.dispose();beautyTarget.dispose();display.geometry.dispose();display.material.dispose();environment.Dispose();return {children:scene.children.length,error:gl.getError()};}
};window.ready=true;
</script>`);
const server=await ServeRoot(root,0),browser=await LaunchBrowser(),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1400));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/Taierzhuang1938/_check_ParticleVolumes.html');await page.waitForFunction(()=>window.ready,null,{timeout:120000});
 for(const preset of ['VolumeFire','VolumePlume','VolumeDensePlume','VolumeDustImpact','VolumeExplosion']){
  const result=await page.evaluate(p=>Test.Run(p),preset);results.push(result);
  assert.ok(result.visible>800,preset+' visible pixels: '+result.visible);assert.ok(result.animated>300,preset+' real simulation moves');
  assert.ok(result.rotated>200,preset+' is a spatial field, not a camera-facing sheet');
  for(const key of ['replay','paused','alphaErrors','occluded','disabled','removed','glError'])assert.equal(result[key],0,preset+' '+key);
  assert.ok(result.tuned>200,preset+' module controls affect actual pixels');assert.equal(result.state.particleCount,1);assert.ok(result.volumes.every(v=>v.ready&&!v.error));
  await page.evaluate(async p=>{await Test.Show(p,.8,.8);Test.Beauty();},preset);await page.screenshot({path:path.join(out,'Scene_'+preset+'.png')});
 }
 const lifecycle=await page.evaluate(()=>Test.BurstAndCycle());assert.equal(lifecycle.pending,0);assert.ok(lifecycle.born>500);assert.ok(Math.abs(lifecycle.position[0]-.4)<1e-6);assert.equal(lifecycle.pausedRejects,true);assert.ok(lifecycle.cycleStep<lifecycle.normalStep*3+200,'lifetime cycling must not reset the fluid animation');
 await page.evaluate(()=>Test.Show('VolumeDensePlume',0,1));
 for(const [name,direction]of [['Front',[0,.4,1]],['Side',[1,.4,0]],['Back',[0,.4,-1]]]){
  await page.evaluate(d=>{Test.SetLight(d);Test.Beauty();},direction);await page.screenshot({path:path.join(out,'Scene_Lighting'+name+'.png')});
 }
 const disposal=await page.evaluate(()=>Test.Dispose());assert.deepEqual(disposal,{children:0,error:0});assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Report.json'),JSON.stringify({results,lifecycle,disposal,errors},null,2));
 console.log('ok particle volumes: actual shared modules, replay/pause, light/density changes, depth occlusion, target alpha and disposal');
 console.log(JSON.stringify(results.map(({preset,visible,animated,tuned})=>({preset,visible,animated,tuned}))));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(check,{force:true});}
