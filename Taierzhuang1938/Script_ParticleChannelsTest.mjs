import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots','ParticleChannels');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.route('**/_check_ParticleChannels.html',route=>route.fulfill({contentType:'text/html',body:`
 <style>body{margin:0}</style><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script>
 <script type="module">
 import * as THREE from 'three';import {VfxSystem,ResetVfxSpawn} from './Script_Vfx.mjs';
 const scene=new THREE.Scene();scene.background=new THREE.Color(.12,.14,.16);
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(960,640);document.body.appendChild(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(50,1.5,.1,100);camera.position.set(0,2,8);camera.lookAt(0,1,0);
 const vfx=new VfxSystem(scene,null,{quality:'high'}),api=vfx.particles,gl=renderer.getContext();vfx.SetFog(null);
 for(let i=0;i<300&&(vfx.loadedVefectsMasks.size<5||vfx.loadedExplosionSprites.size<4);i++)await new Promise(resolve=>setTimeout(resolve,20));
 const Read=()=>{renderer.render(scene,camera);const p=new Uint8Array(960*640*4);gl.readPixels(0,0,960,640,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const Diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>9)n++;return n;};
 const empty=Read();vfx.Update(1/60,camera,1/60);
 const routes=[];
 for(const [name,channel]of Object.entries(vfx.pools)){
   const s=ResetVfxSpawn();s.y=1;s.sizeStart=.35;s.sizeEnd=.7;s.life=2;s.opacity=.7;s.colorA=[1,.6,.25];s.colorB=[.2,.2,.2];
   channel.Spawn(s,vfx.time);channel.Flush();Read();
   routes.push({name,id:channel.particleId,owned:api.Get(channel.particleId).system.particles.length>0,backend:channel.material.userData.particleBackend,glError:gl.getError()});
   channel.Clear();
 }
 const shots=[];
 const meshRoutes=[];
 for(const [name,channel]of [['debris',vfx.debris],...Object.entries(vfx.chunks)]){
   channel.Spawn({x:0,y:1,z:0,vx:1,vy:2,vz:0,sx:.25,sy:.15,sz:.2,rx:2,ry:1,rz:3,color:[.7,.45,.2],life:3,drag:.5,groundY:0,bounce:.3,seed:.7},vfx.time);
   channel.Flush();const frame=Read();api.Pause(channel.particleId);api.Update(.1);const frozen=Read();
   meshRoutes.push({name,owned:channel.system.particles.length===1,visible:Diff(empty,frame),pause:Diff(frame,frozen),glError:gl.getError()});
   channel.Clear();api.Play(channel.particleId);
 }
 for(const [name,run]of [
   ['rifle',()=>vfx.MuzzleFlash(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1))],
   ['impact',()=>vfx.Impact(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1),'brick',{hardSparks:true})],
   ['explosion',()=>vfx.Explosion(new THREE.Vector3(0,.1,0),{radius:4,kind:'grenade',groundY:0})],
   ['blood',()=>vfx.Blood(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1))],
 ]){
   vfx.ClearParticles();api.Resume();run();vfx.Update(1/60,camera,vfx.time+1/60);Read();
   shots.push({name,channels:api.Inspect().entries.filter(e=>e.profile&&e.particleCount>0).map(e=>e.profile),glError:gl.getError()});
 }
 vfx.ClearParticles();api.Resume();vfx.bloodEffects.Clear();
 const id=api.Create({profile:'smoke',modules:{main:{randomSeed:55,startSize:.6,startSpeed:.3,maxParticles:64},
   emission:{enabled:true,rateOverTime:0,bursts:[{time:0,count:14}]},shape:{radius:.5},
   sizeOverLifetime:{enabled:true,curve:[[0,.4],[1,1.6]]},colorOverLifetime:{enabled:true,gradient:[[0,[1,.2,.04,.8]],[1,[.3,.1,.03,0]]]}}}).id;
 api.Simulate(id,.3);const a=Read();api.Simulate(id,.3);const b=Read();
 for(const e of api.Inspect().entries)api.Pause(e.id);
 const births=vfx.pools.smoke.system.emitted;vfx.Impact(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1),'brick');vfx.debris.Clear();
 vfx.Update(.1,camera,vfx.time+.1);const paused=Read();
 const result={routes,meshRoutes,shots,visible:Diff(empty,a),replay:Diff(a,b),pause:Diff(b,paused),
   stoppedExternalEmission:vfx.pools.smoke.system.emitted===births,glError:gl.getError(),alpha:Array.from(paused).filter((n,i)=>i%4===3&&n!==255).length};
 api.Configure(id,{colorOverLifetime:{gradient:[[0,[.02,.15,1,.8]],[1,[.02,.05,.3,0]]]}});result.colorChange=Diff(paused,Read());
 const original=api.Export(id),clone=api.Import(original);result.exportProfile=clone.profile;api.Remove(clone.id);
 api.Remove(id);
 vfx.AmbientDust(new THREE.Box3(new THREE.Vector3(-2,-1,-2),new THREE.Vector3(2,3,2)),.2);
 const moteId=vfx.dust.particleId;api.Configure(moteId,{main:{startSize:.045,startColor:[1,.8,.5,.7]},colorOverLifetime:{enabled:false}});api.Simulate(moteId,30);
 vfx.dust.Move([0,1,0]);const samples=api.GetParticles(moteId,{limit:256});const inside=samples.find(p=>Math.abs(p.position[0])<1.7);
 vfx.dust.Move([.03,1,0]);const moved=api.GetParticles(moteId,{limit:256}).find(p=>p.seed===inside.seed);result.moteParallax=Math.abs(inside.position[0]-moved.position[0]);
 vfx.Update(0,camera,vfx.time);const motes=Read();vfx.Update(.1,camera,vfx.time+.1);result.moteFreeze=Diff(motes,Read());result.motesVisible=Diff(empty,motes);
 api.Remove(moteId);vfx.Update(0,camera,vfx.time);result.moteRemoved=vfx.dust===null;
 const smoke=vfx.pools.smoke;api.Play(smoke.particleId);api.Configure(smoke.particleId,{main:{maxParticles:2}});
 for(let i=0;i<10;i++){const s=ResetVfxSpawn();s.life=3;s.y=1;smoke.Spawn(s,vfx.time);}smoke.Flush();
 result.boundedCpu=smoke.system.particles.length;result.boundedGpu=Array.from(smoke.deathTime).filter(t=>t>smoke.Time()).length;
 api.Remove(smoke.particleId);vfx.Impact(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1),'brick');vfx.Update(.1,camera,vfx.time+.1);result.removedChannelSafe=true;
 window.result=result;window.finish=()=>{vfx.Dispose();result.disposed=!scene.getObjectByName('ModularParticleSystems');renderer.dispose();return result;};
 </script>`}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/Taierzhuang1938/_check_ParticleChannels.html');
 await page.waitForFunction(()=>window.result,null,{timeout:90000});await page.screenshot({path:path.join(out,'Channels.png')});
 const result=await page.evaluate(()=>window.finish());await fs.writeFile(path.join(out,'Report.json'),JSON.stringify({result,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(result.routes.length,19);
 for(const route of result.routes){assert.ok(route.owned,route.name);assert.equal(route.backend,'modules');assert.equal(route.glError,0,route.name);}
 for(const route of result.meshRoutes){assert.ok(route.owned&&route.visible>20,route.name);assert.equal(route.pause,0,route.name);assert.equal(route.glError,0,route.name);}
 for(const shot of result.shots){assert.ok(shot.channels.length>0,shot.name);assert.equal(shot.glError,0,shot.name);}
 assert.ok(result.visible>500);assert.equal(result.replay,0);assert.equal(result.pause,0);assert.equal(result.stoppedExternalEmission,true);
 assert.ok(result.colorChange>500);assert.equal(result.exportProfile,'smoke');assert.equal(result.alpha,0);assert.equal(result.disposed,true);assert.equal(result.glError,0);
 assert.ok(result.moteParallax<1e-8);assert.equal(result.moteFreeze,0);assert.ok(result.motesVisible>20);assert.equal(result.moteRemoved,true);
 assert.equal(result.boundedCpu,2);assert.equal(result.boundedGpu,2);assert.equal(result.removedChannelSafe,true);
 console.log('ok unified sprite particle channels',JSON.stringify(result));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
