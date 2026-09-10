// Real GPU projection, ballistic collision and source lifecycle, plus local visual evidence.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const project=path.dirname(fileURLToPath(import.meta.url)),shots=path.join(project,"_shots/BloodEffects");
fs.mkdirSync(shots,{recursive:true});
const importMap=fs.readFileSync(path.join(project,"index.html"),"utf8").match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
fs.writeFileSync(path.join(project,"_check_BloodEffects.html"),`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#14191b}canvas{display:block}</style><script type="importmap">${importMap}</script></head><body><script type="module">
import * as THREE from "three";
import {VfxSystem} from "./Script_Vfx.mjs";
import {PostPipeline} from "./Script_Post.mjs";
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(1280,720);document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x89928f);
const camera=new THREE.PerspectiveCamera(48,1280/720,.08,80);camera.position.set(3.6,3.5,5.3);camera.lookAt(0,.35,0);camera.updateMatrixWorld();
scene.add(new THREE.HemisphereLight(0xb9d6e5,0x524936,2));const sun=new THREE.DirectionalLight(0xffedcf,3.5);sun.position.set(-3,6,2);scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(14,14,28,28),new THREE.MeshStandardMaterial({color:0x8a8170,roughness:1}));
ground.rotation.x=-Math.PI/2;scene.add(ground);
const wall=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.6,.16),new THREE.MeshStandardMaterial({color:0x9b998d,roughness:.95}));wall.position.set(0,.8,-1.15);scene.add(wall);
const ramp=new THREE.Mesh(new THREE.BoxGeometry(1.6,.12,2.4),new THREE.MeshStandardMaterial({color:0x777364,roughness:.9}));ramp.rotation.z=.22;ramp.position.set(-2,.5,0);scene.add(ramp);
const platform=new THREE.Mesh(new THREE.BoxGeometry(1.2,.15,1.2),new THREE.MeshStandardMaterial({color:0x867765,roughness:.9}));platform.position.set(2,.8,0);scene.add(platform);
scene.updateMatrixWorld(true);
const vfx=new VfxSystem(scene,null,{quality:"high",maxParticles:800});vfx.SetFog(null);vfx.SetSun(sun.position,0xffedcf,0xb9d6e5,{sunIntensity:1.12,skyIntensity:.25});
const ray=new THREE.Raycaster();vfx.SetBloodSurface((from,dir,distance)=>{ray.set(from,dir);ray.far=distance;const h=ray.intersectObjects([ground,wall,ramp,platform],false)[0];return h?{t:h.distance,normal:h.face.normal.clone().transformDirection(h.object.matrixWorld).toArray()}:null;});
const post=new PostPipeline(renderer,{width:1280,height:720,quality:"medium"});
let time=0;
function Draw(){vfx.SetDepthSource(post.NormalDepthTexture,post.width,post.height);post.Render(scene,camera,{taa:false,motionBlur:0,grain:0,vignette:0,autoExposure:false,exposure:1,fog:{density:0}});}
function Step(frames){for(let i=0;i<frames;i++){time+=1/60;vfx.Update(1/60,camera,time);}Draw();}
function Clear(){vfx.ClearParticles();}
window.B={THREE,scene,camera,vfx,post,renderer,ground,wall,ramp,platform,Draw,Step,Clear};
Draw();await new Promise(resolve=>{const poll=()=>vfx.bloodEffects.texture?resolve():setTimeout(poll,30);poll();});Draw();window.ready=true;
</script></body></html>`);
const server=await ServeRoot(path.resolve(project,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_BloodEffects.html`);
  await page.waitForFunction(()=>window.ready,null,{timeout:90000});
  assert.deepEqual(errors,[],"GPU shaders compile and source texture loads");
  await page.evaluate(()=>{const {vfx,THREE,Step}=B;vfx.BloodBurst(new THREE.Vector3(0,1,0),new THREE.Vector3(.3,.1,-1),1.1);Step(7);});
  await page.screenshot({path:path.join(shots,"BloodMist.png")});
  const impacts=await page.evaluate(()=>{B.Step(110);const b=B.vfx.bloodEffects;return {impacts:b.stats.impacts,decals:b.decals.count,drops:b.activeDrops.length,bulletHoles:B.vfx.pools.decal.cursor};});
  assert(impacts.impacts>8&&impacts.decals>8,"Droplets deposit only after physical contact");
  assert.equal(impacts.drops,0);assert.equal(impacts.bulletHoles,0,"Blood owns a separate decal budget");
  await page.screenshot({path:path.join(shots,"BloodImpacts.png")});
  await page.evaluate(()=>{
    const {vfx,THREE,Clear,Step}=B;Clear();const layer=vfx.bloodEffects.decals;
    layer.Add(new THREE.Vector3(-.5,0,.25),new THREE.Vector3(0,1,0),.65,{now:vfx.time,age:5,pool:true,seed:.34});
    layer.Add(new THREE.Vector3(.6,0,.3),new THREE.Vector3(0,1,0),.6,{now:vfx.time,age:110,pool:true,seed:.63});
    layer.Add(new THREE.Vector3(0,.8,-1.07),new THREE.Vector3(0,0,1),.7,{now:vfx.time,age:8,seed:.12,aspect:1.2});
    const n=new THREE.Vector3(-Math.sin(.22),Math.cos(.22),0);
    layer.Add(new THREE.Vector3(-2,.561,0),n,.65,{now:vfx.time,age:15,pool:true,seed:.71});
    // Overhang: the projection extends outside the wall, where it must draw nothing.
    layer.Add(new THREE.Vector3(1.1,1.35,-1.07),new THREE.Vector3(0,0,1),.55,{now:vfx.time,age:8,seed:.45});
    Step(1);
  });
  await page.screenshot({path:path.join(shots,"BloodSurfaces.png")});
  const projection=await page.evaluate(()=>{
    const {vfx,renderer,scene,camera,post}=B;const layer=vfx.bloodEffects.decals;
    function Read(){B.Draw();const pixels=new Uint8Array(1280*720*4);renderer.getContext().readPixels(0,0,1280,720,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);return pixels;}
    const a=Read();layer.mesh.visible=false;const b=Read();layer.mesh.visible=true;
    let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;
    const arrays=Object.values(layer.attributes).every(attr=>attr.array.every(Number.isFinite));
    // Isolate the actual layer's submission cost from the final fullscreen post pass.
    renderer.info.autoReset=false;renderer.info.reset();B.Draw();const withDecals=renderer.info.render.calls;
    layer.mesh.visible=false;renderer.info.reset();B.Draw();const withoutDecals=renderer.info.render.calls;layer.mesh.visible=true;
    renderer.info.autoReset=true;
    const gl=renderer.getContext(),types=new Set([gl.SAMPLER_2D,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_CUBE,gl.SAMPLER_3D]);
    let maxSamplers=0;
    for(const program of renderer.info.programs){let samplers=0;for(let i=0;i<gl.getProgramParameter(program.program,gl.ACTIVE_UNIFORMS);i++){
      const uniform=gl.getActiveUniform(program.program,i);if(types.has(uniform.type))samplers+=uniform.size;
    }maxSamplers=Math.max(maxSamplers,samplers);}
    return {changed,arrays,addedDraws:withDecals-withoutDecals,maxSamplers,samplerLimit:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),programs:renderer.info.programs.length};
  });
  assert(projection.changed>1500,"Projected pools and splashes must change actual screen pixels");assert(projection.arrays);
  assert.equal(projection.addedDraws,1,"All decals in a layer share one submission");assert(projection.maxSamplers<=projection.samplerLimit);
  const lifecycle=await page.evaluate(()=>{
    const {THREE,vfx,scene,Clear,Step}=B;Clear();
    const node=new THREE.Group();node.position.set(2,1.1,0);scene.add(node);
    const handle=vfx.BloodSpurt(node,null,{x:1,y:0,z:0},{seconds:.4,rate:30,decals:8});
    const zeroY=vfx.bloodEffects.sources.get(handle).direction.y;Step(120);
    const roof=vfx.bloodEffects.decals.records.filter(Boolean).map(r=>r.position.y);
    const persistent=vfx.CreateBloodDecalLayer(scene,4);persistent.Add(new THREE.Vector3(),new THREE.Vector3(0,1,0),.5,{age:90,pool:true});
    vfx.CorpseBlood({root:node,characterRig:{bones:{chest:node}}});Step(90);node.removeFromParent();Step(1);
    const stopped=vfx.bloodSpurtCount===0;Clear();
    const kept=persistent.count;const dynamic=vfx.bloodEffects.decals.count;const drops=vfx.bloodEffects.activeDrops.length;
    persistent.Dispose();return {zeroY,roof,stopped,kept,dynamic,drops};
  });
  assert.equal(lifecycle.zeroY,0,"Horizontal blood source must preserve zero Y direction");
  assert(lifecycle.roof.length>0&&lifecycle.roof.every(y=>y>.8),"Platform catches droplets above the ground floor");
  assert(lifecycle.stopped);assert.equal(lifecycle.kept,1);assert.equal(lifecycle.dynamic,0);assert.equal(lifecycle.drops,0);
  const budget=await page.evaluate(()=>{
    const {THREE,vfx,scene,Step,Clear}=B,node=new THREE.Group();scene.add(node);node.position.y=1;
    for(let i=0;i<100;i++){vfx.BloodBurst(node.position,new THREE.Vector3(0,1,0),2);vfx.BloodSpurt(node,null,{x:0,y:1,z:0});}
    Step(1);const b=vfx.bloodEffects,result={drops:b.activeDrops.length,dropLimit:b.limits.drops,
      sources:b.sources.size,sourceLimit:b.limits.sources,mistInstances:b.mist.geometry.instanceCount,mistLimit:b.limits.mist};
    Clear();node.removeFromParent();return result;
  });
  assert(budget.drops<=budget.dropLimit&&budget.sources<=budget.sourceLimit&&budget.mistInstances<=budget.mistLimit,"Burst overload stays within all fixed pools");
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(shots,"Data_BloodEffectsResults.json"),JSON.stringify({impacts,projection,lifecycle,budget,errors},null,2));
  console.log("PASS BloodEffects: rendered projection, mist, physical impacts, platform, zero-axis source, separate pools, detach and clear",JSON.stringify({impacts,projection}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
