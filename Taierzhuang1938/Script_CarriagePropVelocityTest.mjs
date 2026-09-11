// Pixel regression independent of the campaign route: real meal/pack geometry,
// a moving parent and camera, then a camera-only move. Never disable velocity.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(here,'_shots/CarriagePropVelocity');
await fs.mkdir(output,{recursive:true});
const local=process.argv.includes('--local');
const server=local?null:await ServeRoot(path.dirname(here),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)/.test(m.location()?.url||''))errors.push(m.text())});
let result;
try{
  await page.goto(`http://127.0.0.1:${local?19119:server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
  await page.evaluate(()=>window.Tengxian.StepFrames(48,1/60,true));
  await page.screenshot({path:path.join(output,'Scene_MovingMeal.png')});
  await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    for(let i=0;i<750 && (r.voice.current?.sourceTime??0)<1.2;i++)g.StepFrames(1,1/60,false);
    g.post.NotifyCameraCut();g.StepFrames(30,1/60,true);
  });
  await page.screenshot({path:path.join(output,'Scene_ReceivingPork.png')});
  await page.evaluate(()=>{const g=window.Tengxian;g.player.yaw=2.1;g.player.pitch=-.15;g.StepFrames(24,1/60,true)});
  await page.screenshot({path:path.join(output,'Scene_Backpacks.png')});
  result=await page.evaluate(async()=>{
    const T=await import('three'),{PrepassPass}=await import('./Script_PostPrepass.mjs');
    const {MakeFullscreenMaterial,MakeRenderTarget}=await import('./Script_PostCommon.mjs');
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),renderer=g.renderer;
    const live={meal:r.meal.State(),trainOffset:r.battlefield.trainOffsetM,
      taa:g.post.taaEnabled,velocity:!!g.post.VelocityTexture,motionBlur:!!g.post.motionBlurPass.active,
      packs:r.view.rigidParts?.fieldPack?.length??r.view.parts.fieldPack?.count,
      rigidIdentities:[...r.view.rigidProps?.keys?.()||[]]};
    const pipeline={preset:{velocity:true,hzb:false},hdrCapable:true,hdrType:T.HalfFloatType,targets:{}};
    const pass=new PrepassPass(pipeline);pass.Resize(320,240);
    const target=MakeRenderTarget(320,240,{type:T.HalfFloatType});
    const copy=MakeFullscreenMaterial('uniform sampler2D uVelocity; uniform sampler2D uDepth; varying vec2 vUv; void main(){gl_FragColor=vec4(texture2D(uVelocity,vUv).xy,texture2D(uDepth,vUv).w,1.0);}',
      {uVelocity:{value:pass.velocityTexture},uDepth:{value:pass.normalDepthTexture}});
    const readScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),copy);readScene.add(quad);
    const readCamera=new T.Camera(),pixels=new Uint16Array(320*240*4);
    const Read=()=>{
      renderer.setRenderTarget(target);renderer.render(readScene,readCamera);
      renderer.readRenderTargetPixels(target,0,0,320,240,pixels);
      const speeds=[],xs=[];
      for(let y=20;y<220;y++)for(let x=20;x<300;x++){
        const i=(y*320+x)*4;if(T.DataUtils.fromHalfFloat(pixels[i+2])<=0)continue;
        const vx=T.DataUtils.fromHalfFloat(pixels[i])*320,vy=T.DataUtils.fromHalfFloat(pixels[i+1])*240;
        speeds.push(Math.hypot(vx,vy));xs.push(vx);
      }
      speeds.sort((a,b)=>a-b);xs.sort((a,b)=>a-b);
      return {pixels:speeds.length,p50:speeds[Math.floor(speeds.length*.5)],p95:speeds[Math.floor(speeds.length*.95)],x50:xs[Math.floor(xs.length*.5)]};
    };
    const sources=[];
    for(const [name,root] of [['whole',r.meal.whole],['slice',r.meal.slice]]){
      root.traverse(o=>{if(o.isMesh && ![o.material].flat().some(m=>m.allowOverride===false))sources.push({name,source:o})});
    }
    sources.push({name:'fieldPack',source:r.view.rigidParts?.fieldPack?.[0]||r.view.parts.fieldPack});
    const samples=[];
    for(const {name,source} of sources){
      const geometry=source.geometry.clone();geometry.computeBoundingBox();
      const center=geometry.boundingBox.getCenter(new T.Vector3()),size=geometry.boundingBox.getSize(new T.Vector3());
      geometry.translate(-center.x,-center.y,-center.z);geometry.scale(...Array(3).fill(.8/Math.max(size.x,size.y,size.z)));
      if(size.y<=size.x && size.y<size.z)geometry.rotateX(Math.PI/2);
      else if(size.x<size.y && size.x<size.z)geometry.rotateY(Math.PI/2);
      // The whole pork's cut-face primitive faces -Z. Inspect its front face,
      // not an empty backface-culling result from the shared prepass.
      let facing=0;const normals=geometry.attributes.normal;
      for(let i=0;i<normals.count;i++)facing+=normals.getZ(i);
      if(facing<-.01)geometry.rotateY(Math.PI);
      // Exercise multiple draws of one object too: advancing history inside
      // onAfterRender would give later material groups camera-only velocity.
      const material=name==='fieldPack'?geometry.groups.map(()=>source.material):source.material;
      const object=source.isInstancedMesh?new T.InstancedMesh(geometry,material,1):new T.Mesh(geometry,material);
      let before=0,after=0;object.onBeforeRender=()=>before++;object.onAfterRender=()=>after++;
      object.frustumCulled=false;
      const scene=new T.Scene(),parent=new T.Group();scene.add(parent);parent.add(object);
      const camera=new T.PerspectiveCamera(60,320/240,.01,100);camera.position.z=2;
      const prev=new T.Matrix4(),matrix=new T.Matrix4();let frame=0;
      const Draw=(offset,cameraOffset)=>{
        // Packs used to move in instanceMatrix, while pork moved via matrixWorld.
        if(object.isInstancedMesh){object.setMatrixAt(0,matrix.makeTranslation(offset,0,0));object.instanceMatrix.needsUpdate=true;}
        else parent.position.x=offset;
        camera.position.x=cameraOffset;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        pass.Render({renderer,scene,camera,viewProjection:vp,prevViewProjection:prev,hasPrev:frame++>0});
        prev.copy(vp);return Read();
      };
      Draw(0,0);const coMoving=Draw(.12,.12),stopped=Draw(.12,.12),cameraOnly=Draw(.12,.20);
      // New/reappearing objects must not reuse a stale transform from an old draw.
      object.visible=false;Draw(.30,.30);object.visible=true;const reappeared=Draw(.30,.30);
      samples.push({name,instanced:!!source.isInstancedMesh,coMoving,stopped,cameraOnly,reappeared,hooks:{before,after}});
      geometry.dispose();
    }
    pass.Dispose();target.dispose();copy.dispose();quad.geometry.dispose();
    renderer.setRenderTarget(null);
    return {live,samples};
  });
  console.log('PROP_VELOCITY',JSON.stringify(result));
  await fs.writeFile(path.join(output,'Data_Velocity.json'),JSON.stringify({result,errors},null,2));
  assert.ok(result.live.taa&&result.live.velocity&&result.live.motionBlur,'the real opening runs TAA and motion blur');
  assert.ok(result.live.packs>0,'the actual opening creates backpacks');
  for(const s of result.samples){
    assert.ok(s.coMoving.pixels>100,`${s.name}: real mesh pixels are present`);
    assert.ok(s.coMoving.p95<.15,`${s.name}: co-moving camera/prop has zero screen motion: ${JSON.stringify(s)}`);
    assert.ok(s.stopped.p95<.15,`${s.name}: motion ends immediately`);
    assert.ok(s.reappeared.p95<.15,`${s.name}: reappearance rejects stale object history`);
    assert.ok(s.cameraOnly.x50 < -3,`${s.name}: actual camera motion is retained`);
    assert.ok(s.hooks.before>0&&s.hooks.before===s.hooks.after,`${s.name}: original draw callbacks survive`);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS real pork and backpack pixels: co-motion, stop, camera-only motion');
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
