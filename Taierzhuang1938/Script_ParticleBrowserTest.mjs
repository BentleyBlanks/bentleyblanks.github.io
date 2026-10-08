import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots','Particles');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try {
 const page=await browser.newPage({viewport:{width:900,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.route('**/_check_Particles.html',route=>route.fulfill({contentType:'text/html',body:`
 <style>body{margin:0}</style><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script>
 <script type="module">
 import * as THREE from 'three';import {VfxSystem} from './Script_Vfx.mjs';
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(900,600);document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color(.16,.18,.2);
 const camera=new THREE.PerspectiveCamera(50,1.5,.1,100);camera.position.set(0,1.8,6);camera.lookAt(0,1,0);
 const vfx=new VfxSystem(scene,null,{quality:'high'});vfx.SetFog(null);
 for(let i=0;i<200&&!vfx.shared.uParticleFireReady.value;i++)await new Promise(resolve=>setTimeout(resolve,20));
 const api=vfx.particles,gl=renderer.getContext();
 function Read(){renderer.render(scene,camera);const pixels=new Uint8Array(900*600*4);gl.readPixels(0,0,900,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
 function Changed(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>9)n++;return n;}
 const empty=Read();
 const source=vfx.SceneEffect({x:0,y:.15,z:0},'BurningWreck');
 for(let i=0;i<60;i++)vfx.Update(1/60,camera,i/60);
 // Ignore legacy smoke for the isolated burning gate; its own GPU gate remains.
 for(const pool of Object.values(vfx.pools))pool.Clear();vfx.Update(0,camera,1);
 const fire=Read(),firstCalls=renderer.info.render.calls;
 const entries=api.Inspect().entries,ids=entries.map(e=>e.id);
 for(const id of ids)api.Simulate(id,2,{restart:true});const replayA=Read();
 for(const id of ids)api.Simulate(id,2,{restart:true});const replayB=Read();
 for(const id of ids)api.Play(id);api.Update(.35);const animated=Read();
 for(const id of ids)api.Pause(id);api.Update(.3);const paused=Read();
 const wall=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x68594a}));wall.position.set(0,0,3);scene.add(wall);
 api.root.visible=false;const wallOnly=Read();api.root.visible=true;const occluded=Read();scene.remove(wall);
 const exported=api.Export(ids[0]);const imported=api.Import(exported);api.Remove(imported.id);
 api.Configure(ids[1],{emission:{rateOverTime:0},main:{loop:false}});
 const result={fireTextureReady:vfx.shared.uParticleFireReady.value,visible:Changed(empty,fire),replay:Changed(replayA,replayB),animated:Changed(replayB,animated),pause:Changed(animated,paused),occlusion:Changed(wallOnly,occluded),firstCalls,entries,renderer:api.Inspect().pools,glError:gl.getError(),alpha:Array.from(paused).filter((v,i)=>i%4===3&&v!==255).length};
 window.capture=()=>{for(const id of ids)api.Simulate(id,1.4);Read();};window.capture();
 window.finish=()=>{
   vfx.RemoveSmokeSource(source);vfx.Update(0,camera,2);Read();result.afterRemove=api.Inspect().entries.length;
   const ids2=['world','local'].map(simulationSpace=>api.Create({preset:'FireEmber',play:false,position:[0,0,0],
     modules:{main:{simulationSpace,startSpeed:0,startLifetime:2,prewarm:false},emission:{rateOverTime:0},shape:{enabled:false},forceOverLifetime:{enabled:false},noise:{enabled:false}}}).id);
   api.Restart();api.Resume();result.manualStaysStopped=ids2.every(id=>api.Inspect(id).state==='stopped');
   for(const id of ids2){api.Emit(id,1);api.Move(id,[3,0,0]);api.Update(.1);}
   result.worldX=api.GetParticles(ids2[0])[0].position[0];result.localX=api.GetParticles(ids2[1])[0].position[0];
   const beforeFork=JSON.stringify(api.Inspect()),fork=api.Fork();fork.Create({preset:'FireSmoke'});fork.Update(.5);fork.Dispose();
   result.forkIsolated=beforeFork===JSON.stringify(api.Inspect());
   for(const id of ids2)api.Remove(id);
   vfx.Dispose();result.afterDispose=scene.getObjectByName('ModularParticleSystems')===undefined;renderer.dispose();return result;
 };
 window.result=result;
 </script>`}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_Particles.html`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.result,null,{timeout:60000});
 await page.screenshot({path:path.join(out,'BurningWreck.png')});
 const r=await page.evaluate(()=>window.finish());
 await fs.writeFile(path.join(out,'Report.json'),JSON.stringify({r,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(r.glError,0);assert.equal(r.fireTextureReady,1);assert.ok(r.visible>1500,'visible layered flames');
 assert.equal(r.replay,0,'fixed seed replay is pixel identical');assert.ok(r.animated>500,'fire changes across time');
 assert.equal(r.pause,0,'pause freezes shader flow as well as births');assert.equal(r.occlusion,0);assert.equal(r.alpha,0,'HDR destination alpha preserved');
 assert.ok(r.firstCalls<=3,'all burning layers share bounded batches');assert.equal(r.afterRemove,0);assert.equal(r.afterDispose,true);
 assert.equal(r.worldX,0,'world particles remain at their birth location');assert.equal(r.localX,3,'local particles follow the emitter');
 assert.equal(r.manualStaysStopped,true,'warmup does not autoplay manually controlled systems');assert.equal(r.forkIsolated,true,'editor preview cannot advance game particles');
 console.log('ok particle GPU',JSON.stringify(r));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
