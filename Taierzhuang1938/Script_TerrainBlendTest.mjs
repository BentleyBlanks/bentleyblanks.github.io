// GPU material-channel contract: actual trench receiver shader + terrain pass.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=await fs.readFile(new URL('./index.html',import.meta.url),'utf8');
const imports=html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[0];
const server=await ServeRoot(root,0),browser=await LaunchBrowser(),page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.route('**/TerrainBlendFixture.html',r=>r.fulfill({contentType:'text/html',body:imports}));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/TerrainBlendFixture.html`);
  const report=await page.evaluate(async()=>{
    const T=await import('three');
    const {TerrainBlendPass,TerrainBlendUniforms}=await import('./Script_TerrainBlend.mjs');
    const {MakeTrenchSurfacePatch}=await import('./Script_TrenchSurfaceMaterial.mjs');
    const {ApplyPatches,MakePatch}=await import('./Script_MaterialPatches.mjs');
    const {TerrainContactField}=await import('./Script_TerrainContact.mjs');
    const {MakeRenderTarget}=await import('./Script_PostCommon.mjs');
    const {PrepassPass}=await import('./Script_PostPrepass.mjs');
    const renderer=new T.WebGLRenderer();renderer.setSize(384,192);renderer.setClearColor(0,0);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(40,2,.01,20);
    camera.position.set(0,2.4,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const pipeline={renderer,hdrCapable:true,hdrType:T.HalfFloatType,preset:{terrainBlend:true,velocity:true,hzb:false},targets:{}};
    const pass=new TerrainBlendPass(pipeline);pass.Resize(384,192);
    const contact=new TerrainContactField({cols:2,rows:2,minX:-4,minZ:-4,stepX:4,stepZ:4,heights:new Float32Array(9)});
    const ArrayTexture=channels=>{
      const data=new Uint8Array(4*4*5*4);for(let i=0;i<data.length;i+=4)data.set(channels,i);
      const tex=new T.DataArrayTexture(data,4,4,5);tex.needsUpdate=true;tex.wrapS=tex.wrapT=T.RepeatWrapping;return tex;
    };
    const pack={setName:'MissionPlain',albedo:ArrayTexture([20,45,230,128]),surface:ArrayTexture([128,128,210,255]),
      albedoMean:new Float32Array(16).fill(.4),surfaceMean:new Float32Array(16).fill(.5)};
    const plane=new T.PlaneGeometry(.55,.55);plane.rotateX(-Math.PI/2);
    const AddAttributes=geometry=>{
      const n=geometry.attributes.position.count,data=new Float32Array(n*3);
      for(let i=0;i<n;i++)data[i*3+1]=1;
      geometry.setAttribute('terrainLayers',new T.BufferAttribute(data,3));
    };
    AddAttributes(plane);
    const ground=new T.MeshStandardMaterial({side:T.DoubleSide});ground.userData.terrainBlendSource=true;
    const soilPatch=MakeTrenchSurfacePatch(pack,'high',null,contact);
    ApplyPatches(ground,[soilPatch,MakePatch({key:'fixtureSoil',fragment:[
      ['#include <roughnessmap_fragment>','roughnessFactor=.25;'],
      ['#include <normal_fragment_maps>','normal=normalize(mat3(viewMatrix)*vec3(.6,.8,0));'],
      ['#include <dithering_fragment>','if(uTerrainCapture>.5)gl_FragColor=vec4(.7,.12,.035,roughnessFactor);'],
    ]})]);
    const groundGeometry=new T.PlaneGeometry(5,5);groundGeometry.rotateX(-Math.PI/2);AddAttributes(groundGeometry);
    const soil=new T.Mesh(groundGeometry,ground);scene.add(soil);
    const receiver=new T.MeshStandardMaterial({side:T.DoubleSide});receiver.userData.terrainBlendReceiver=true;
    const stonePatch=MakeTrenchSurfacePatch(pack,'high',null,contact,{stone:true});
    ApplyPatches(receiver,[stonePatch,MakePatch({key:'fixtureChannels',fragment:[
      ['#include <common>','layout(location=1) out vec4 oFixtureNormal;'],
      ['#include <dithering_fragment>','gl_FragColor=vec4(diffuseColor.rgb,roughnessFactor);oFixtureNormal=vec4(normal,gTrenchContact);'],
    ]})]);
    const receivers=[.001,.055,.3].map((height,i)=>{const mesh=new T.Mesh(plane,receiver);mesh.position.set((i-1)*.85,height,0);scene.add(mesh);return mesh;});
    const target=MakeRenderTarget(384,192,{count:2,depthBuffer:true});
    const ctx={renderer,scene,camera,pipeline,width:384,height:192};
    const Render=()=>{scene.updateMatrixWorld(true);pass.Prepare(ctx);if(pass.Enabled())pass.Render(ctx);else pass.Idle(ctx);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);};
    const Pixel=(rt,position,attachment=0)=>{
      const point=position.clone().project(camera),pixels=new Uint16Array(4);
      renderer.readRenderTargetPixels(rt,Math.floor((point.x*.5+.5)*rt.width),Math.floor((point.y*.5+.5)*rt.height),1,1,pixels,0,attachment);
      return Array.from(pixels,T.DataUtils.fromHalfFloat);
    };
    Render();
    const samples=receivers.map(mesh=>({color:Pixel(target,mesh.position),normal:Pixel(target,mesh.position,1),soil:Pixel(pass.target,mesh.position,1)}));
    // Actual normal/depth override uses the same mask while preserving depth.
    const prepass=new PrepassPass(pipeline);prepass.Resize(384,192);
    renderer.setRenderTarget(prepass.target);renderer.clear();scene.overrideMaterial=prepass.material;renderer.render(scene,camera);scene.overrideMaterial=null;
    const normalDepth=receivers.map(mesh=>Pixel(prepass.target,mesh.position));
    const sourceIdentity=soil.material===ground;
    const originalColor=renderer.getClearColor(new T.Color()).getHex(),originalTarget=renderer.getRenderTarget();
    pass.Render(ctx);const restored=renderer.getRenderTarget()===originalTarget&&renderer.getClearColor(new T.Color()).getHex()===originalColor;
    // A physical geometry rebuild must affect the next frame, not an old proxy.
    soil.position.y=-.8;Render();const afterMove=Pixel(target,receivers[0].position,1)[3];
    soil.visible=false;Render();const validAfterHide=TerrainBlendUniforms.uTerrainBlendValid.value,contextCleared=ctx.terrainBlend===null;
    pass.Resize(192,96);soil.visible=true;soil.position.y=0;Render();
    const resized=[pass.target.width,pass.target.height,...TerrainBlendUniforms.uTerrainBlendSize.value.toArray()];
    const gl=renderer.getContext(),glError=gl.getError(),linked=renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS));
    pass.Dispose();const validAfterDispose=TerrainBlendUniforms.uTerrainBlendValid.value;
    prepass.Dispose();target.dispose();contact.Dispose();renderer.dispose();
    return {samples,normalDepth,sourceIdentity,restored,afterMove,validAfterHide,contextCleared,resized,validAfterDispose,glError,linked};
  });
  console.log(JSON.stringify(report,null,2));
  assert.deepEqual(errors,[]);assert.equal(report.glError,0);assert.ok(report.linked&&report.sourceIdentity&&report.restored);
  const [near,middle,far]=report.samples;
  assert.ok(near.normal[3]>.97&&middle.normal[3]>.05&&middle.normal[3]<.95&&far.normal[3]<.01,'continuous contact mask');
  assert.ok(near.color[0]>.65&&near.color[2]<.06,'terrain albedo reaches the stone foot');
  assert.ok(near.color[3]<.28&&far.color[3]>.8,'roughness blends along with colour');
  const Dot=(a,b)=>a.slice(0,3).reduce((sum,n,i)=>sum+n*b[i],0);
  assert.ok(Dot(near.normal,near.soil)>.995,'mapped terrain normal reaches main material');
  assert.ok(Dot(report.normalDepth[0],near.soil)>.995,'prepass uses the same contact normal');
  assert.ok(Math.abs(report.normalDepth[0][3]-near.soil[3])<.015,'prepass preserves geometric depth');
  assert.ok(report.afterMove<.01,'terrain movement/rebuild invalidates previous contact');
  assert.equal(report.validAfterHide,0);assert.ok(report.contextCleared);assert.equal(report.validAfterDispose,0);assert.deepEqual(report.resized,[192,96,192,96]);
  console.log('TerrainBlendTest: depth mask, albedo/normal/roughness, prepass, geometry update, resize and invalidation passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
