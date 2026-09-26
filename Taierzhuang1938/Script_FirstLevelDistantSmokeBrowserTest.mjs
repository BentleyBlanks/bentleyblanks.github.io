// The actual 3D density and production shader: low-quality density,
// animation, foreground occlusion, warm-up reset and teardown on a real GPU.
import assert from "node:assert/strict";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(import.meta.dirname, "..");
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:640,height:480}});
  page.on("pageerror", error=>errors.push(String(error)));
  page.on("console", message=>{if(message.type()==="error") errors.push(message.text());});
  await page.route("**/_check_DistantSmokeGpu.html", route=>route.fulfill({contentType:"text/html",body:`
    <script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script>
    <script type="module">
      import * as THREE from "three";
      import {VfxSystem} from "./Script_Vfx.mjs";
      import {FIRST_LEVEL_DISTANT_SMOKE} from "./Data_FirstLevelDistantSmoke.mjs";
      const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
      renderer.setSize(640,480);document.body.appendChild(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color(0xccc5ba);
      const camera=new THREE.PerspectiveCamera(55,640/480,.1,250);
      camera.position.set(0,20,0);camera.lookAt(0,20,-65);
      const vfx=new VfxSystem(scene,null,{quality:"low",maxParticles:2200});vfx.SetFog(null);
      const gl=renderer.getContext();
      function Read(){renderer.render(scene,camera);const p=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
      function Changed(a,b){let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)n++;return n;}
      vfx.Update(1/60,camera,10);const empty=Read();
      const handles=FIRST_LEVEL_DISTANT_SMOKE.slice(0,4).map((s,i)=>vfx.SmokeSource({x:(i-1.5)*14,y:0,z:-72},s.options));
      vfx.Update(1/60,camera,10);const smoke=Read();
      const firstCalls=renderer.info.render.calls;
      vfx.Update(1/60,camera,24);const later=Read();
      const wall=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x885533}));
      wall.position.set(0,20,-20);scene.add(wall);
      vfx.battleSmoke.mesh.visible=false;const wallOnly=Read();
      vfx.battleSmoke.mesh.visible=true;const occluded=Read();scene.remove(wall);
      vfx.ClearParticles();const cleared=Read();
      vfx.Update(1/60,camera,.1);const reset=Read();
      const result={volume:vfx.battleSmoke.texture.isData3DTexture,instances:vfx.battleSmoke.geometry.instanceCount,
        firstCalls,visible:Changed(empty,smoke),animated:Changed(smoke,later),occlusion:Changed(wallOnly,occluded),
        cleared:Changed(empty,cleared),reset:Changed(empty,reset),
        combatParticles:Object.values(vfx.pools).reduce((n,p)=>n+Array.from(p.deathTime).filter(t=>t>vfx.time).length,0),
        prepassExcluded:vfx.battleSmoke.mesh.userData.skipNormalDepth===true};
      for(const h of handles)vfx.RemoveSmokeSource(h);vfx.Update(1/60,camera,1);Read();
      result.afterRemove=vfx.battleSmoke.geometry.instanceCount;
      const near=FIRST_LEVEL_DISTANT_SMOKE.find(s=>s.tier==="near"&&s.options.backdrop.frame===0);
      const nearHandle=vfx.SmokeSource({x:1,y:17,z:-9},near.options);vfx.Update(1/60,camera,10);
      result.nearVisible=Changed(empty,Read());
      vfx.RemoveSmokeSource(nearHandle);
      camera.position.set(0,4,0);camera.lookAt(0,4,-22);
      vfx.Update(1/60,camera,1);const roadEmpty=Read();
      result.styles=[];
      for(let frame=0;frame<6;frame++) {
        const source=FIRST_LEVEL_DISTANT_SMOKE.find(s=>s.tier!=="far"&&s.options.backdrop.frame===frame);
        const profile=source.options.backdrop;
        const handle=vfx.SmokeSource({x:0,y:0,z:-22},source.options);
        // Sample one second of real shader time, including the coherent active
        // part of dust eruptions. A long 14 s difference alone can hide inertia.
        const phase=(profile.seed%4096)/4096;
        const time=frame===5?(1.18-phase)*profile.life:5;
        vfx.Update(1/60,camera,time);const first=Read();
        vfx.Update(1/60,camera,time+1);const second=Read();
        const style={type:profile.type,visible:Changed(roadEmpty,first),oneSecond:Changed(first,second)};
        if(frame===5) {
          vfx.Update(1/60,camera,(1.8-phase)*profile.life);
          style.quiet=Changed(roadEmpty,Read());
        }
        result.styles.push(style);vfx.RemoveSmokeSource(handle);
      }
      result.glError=gl.getError();
      vfx.Dispose();result.afterDispose=scene.getObjectByName("BattleSmokeBackdrop")===undefined;
      wall.geometry.dispose();wall.material.dispose();renderer.dispose();window.result=result;
    </script>`}));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_DistantSmokeGpu.html`,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.result,null,{timeout:60000});
  const r=await page.evaluate(()=>window.result);
  assert.deepEqual(errors,[]);
  assert.equal(r.volume,true,"real 3D density texture bound");
  assert.equal(r.instances,32,"low quality keeps eight lobes per source");
  assert.equal(r.firstCalls,1,"all backdrop types are one instanced draw");
  assert.ok(r.visible>5000,"smoke visibly fills the GPU fixture");
  assert.ok(r.animated>2000,"clouds genuinely advect and roll over time");
  assert.equal(r.occlusion,0,"opaque foreground fully occludes distant smoke");
  assert.equal(r.cleared,0,"warm-up clear leaves no visible particles");
  assert.ok(r.reset>5000,"established smoke survives resetting the game clock");
  assert.ok(r.nearVisible>1000,"roadside smoke is visible inside the former 20 m dead zone");
  for(const style of r.styles) {
    assert.ok(style.visible>500,style.type+" is visibly rendered on its own");
    assert.ok(style.oneSecond>150,style.type+" visibly changes within one second");
  }
  assert.equal(r.styles.find(s=>s.type==="burstDust").quiet,0,"dust eruptions include a quiet interval instead of a permanent column");
  assert.equal(r.combatParticles,0,"backdrop never consumes combat particle slots");
  assert.equal(r.prepassExcluded,true);
  assert.equal(r.afterRemove,0);
  assert.equal(r.afterDispose,true);
  assert.equal(r.glError,0);
  console.log("ok smoke GPU",JSON.stringify(r));
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
