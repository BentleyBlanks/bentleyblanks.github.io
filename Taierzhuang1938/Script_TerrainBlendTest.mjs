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
      const data=new Uint8Array(4*4*6*4);for(let i=0;i<data.length;i+=4)data.set(channels,i);
      const tex=new T.DataArrayTexture(data,4,4,6);tex.needsUpdate=true;tex.wrapS=tex.wrapT=T.RepeatWrapping;return tex;
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
    // Root marker must select its own albedo in the actual shared soil shader.
    // The deliberately blue soil makes accidental inheritance unambiguous.
    const rootGeometry=plane.clone(),rootLayers=new Float32Array(rootGeometry.attributes.position.count*4);
    for(let i=0;i<rootLayers.length;i+=4){rootLayers[i+1]=1;rootLayers[i+3]=-3;}
    rootGeometry.setAttribute('terrainLayers',new T.BufferAttribute(rootLayers,4));
    const rootMaterial=new T.MeshStandardMaterial({side:T.DoubleSide});
    ApplyPatches(rootMaterial,[MakeTrenchSurfacePatch(pack,'high',null,contact),MakePatch({key:'fixtureRootChannels',fragment:[
      ['#include <dithering_fragment>','gl_FragColor=vec4(diffuseColor.rgb,1.0);'],
    ]})]);
    const rootMesh=new T.Mesh(rootGeometry,rootMaterial);rootMesh.position.set(0,.7,0);scene.add(rootMesh);Render();
    const rootColor=Pixel(target,rootMesh.position);
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=0;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const unmarkedColor=Pixel(target,rootMesh.position);
    // Upward caps on cut-wall aggregates still belong to the compact matrix.
    // Paint the two real array layers differently to exercise that GPU choice.
    for(let i=3*4*4*4;i<4*4*4*4;i+=4)pack.albedo.image.data.set([230,35,20,128],i);
    pack.albedo.needsUpdate=true;
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-1.25;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const compactCapColor=Pixel(target,rootMesh.position);
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-2;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const looseCapColor=Pixel(target,rootMesh.position);
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-2.125;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const clodTransitionColor=Pixel(target,rootMesh.position);
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-2.25;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const clodCoreColor=Pixel(target,rootMesh.position);
    const roadColors=[];
    for(const lateral of [-1,-.75,-.5,0,.5,1]){
      for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=lateral;
      rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();roadColors.push(Pixel(target,rootMesh.position));
    }
    // A vertical cut stays compact below the crown and continuously acquires
    // loose soil near the top. Distinct array colours expose reversed masks.
    rootMesh.rotation.x=Math.PI/2;
    const crownColors=[];
    for(const height of [0,.70,.86,.94,1]){
      for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=2+height;
      rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();crownColors.push(Pixel(target,rootMesh.position));
    }
    rootMesh.rotation.x=0;
    // A constant tangent +U slope must become world +Y after a quarter turn of
    // the sampled wall texture. Read the active tile on the GPU to select a
    // single-variant region; expected normal direction is independent of GLSL.
    for(let i=0;i<pack.surface.image.data.length;i+=4)pack.surface.image.data.set([204,128,210,255],i);
    pack.surface.needsUpdate=true;
    const directionMaterial=new T.MeshStandardMaterial({side:T.DoubleSide});
    const directionPatch=MakeTrenchSurfacePatch(pack,'high',null,contact),directionMode={value:0};
    directionPatch.trenchPomUniform.value=0;
    directionPatch.trenchVariationUniform.value.x=2;
    ApplyPatches(directionMaterial,[directionPatch,MakePatch({key:'fixtureRotationDirection',
      uniforms:uniforms=>{uniforms.uDirectionMode=directionMode;},fragment:[
        ['#include <common>','uniform float uDirectionMode;'],
        ['#include <dithering_fragment>',`float fixtureVariant=TerrainNoise(vec2(vTerrainWorld.x,-vTerrainWorld.y)*uTrenchVariation.x)*8.0;
          gl_FragColor=uDirectionMode<.5?vec4(fixtureVariant,smoothstep(.42,.58,fract(fixtureVariant)),0,1):vec4(gTerrainNormalW*.5+.5,1);`],
      ]})]);
    rootMesh.material=directionMaterial;rootMesh.rotation.x=Math.PI/2;
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=2;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;
    let activeVariant=null;const directionCandidates=[];
    for(const height of [.7,1,1.3,.4]){
      rootMesh.position.y=height;Render();const v=Pixel(target,rootMesh.position);directionCandidates.push(v);
      if(v[0]>=1&&(v[1]<.001||v[1]>.999)){activeVariant=Math.floor(v[0])+(v[1]>.999?1:0);break;}
    }
    if(activeVariant===null)throw new Error('No single-variant wall region for normal direction fixture: '+JSON.stringify(directionCandidates));
    directionMode.value=1;directionPatch.trenchVariationUniform.value.y=0;Render();
    const rotationBefore=Pixel(target,rootMesh.position).slice(0,3).map(v=>v*2-1);
    directionPatch.trenchVariationUniform.value.y=Math.PI/2/(activeVariant*2.39996323);Render();
    const rotationAfter=Pixel(target,rootMesh.position).slice(0,3).map(v=>v*2-1);
    rootMesh.material=rootMaterial;rootMesh.rotation.x=0;rootMesh.position.y=.7;directionMaterial.dispose();
    // Vertical faces with upward-smoothed normals used to sample almost only
    // world XZ, stretching one texel row down the whole clod. A V-only ramp
    // must retain its vertical variation, including the zero-weight fallback.
    const originalAlbedo=pack.albedo.image.data.slice();
    for(const layer of [3,5])for(let y=0;y<4;y++)for(let x=0;x<4;x++){
      const value=30+y*70;pack.albedo.image.data.set([value,value,value,128],((layer*4+y)*4+x)*4);
    }
    pack.albedo.needsUpdate=true;
    const projectionMaterial=new T.MeshStandardMaterial({side:T.DoubleSide});
    const projectionPatch=MakeTrenchSurfacePatch(pack,'high',null,contact);
    projectionPatch.trenchPomUniform.value=0;projectionPatch.trenchVariationUniform.value.set(0,0);
    ApplyPatches(projectionMaterial,[projectionPatch,MakePatch({key:'fixtureProjectionRamp',fragment:[
      ['#include <dithering_fragment>','gl_FragColor=vec4(gTerrainAlbedo,1.0);'],
    ]})]);
    // Keep the collapsed XZ coordinate inside a texel, away from a repeat seam.
    rootMesh.material=projectionMaterial;rootMesh.rotation.x=Math.PI/2;rootMesh.position.z=.21;
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-1.25;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;
    const projectionSamples=[];
    for(const tangent of [false,true]){
      const wrongNormal=new T.Vector3(0,tangent?0:.2,tangent?-1:-.98).normalize();
      for(let i=0;i<rootGeometry.attributes.normal.count;i++)rootGeometry.attributes.normal.setXYZ(i,...wrongNormal.toArray());
      rootGeometry.attributes.normal.needsUpdate=true;
      const variants=[];
      for(const guard of [0,1]){
        projectionPatch.trenchProjectionGuardUniform.value=guard;Render();
        const samples=[.46,.58,.70,.82,.94].map(y=>Pixel(target,new T.Vector3(0,y,.21))[0]);
        variants.push({guard,samples,range:Math.max(...samples)-Math.min(...samples)});
      }
      projectionSamples.push({tangent,variants});
    }
    for(let i=0;i<rootGeometry.attributes.normal.count;i++)rootGeometry.attributes.normal.setXYZ(i,0,1,0);
    rootGeometry.attributes.normal.needsUpdate=true;rootMesh.material=rootMaterial;rootMesh.rotation.x=0;rootMesh.position.z=0;projectionMaterial.dispose();
    pack.albedo.image.data.set(originalAlbedo);pack.albedo.needsUpdate=true;
    // With calibrated means and constant albedo layers, changing the clod's
    // structure must not introduce a brighter or differently coloured pigment.
    const calibratedMeans=pack.albedoMean.slice();calibratedMeans.set([230/255,35/255,20/255,.5],12);
    const calibratedPack={...pack,albedoMean:calibratedMeans,
      extraAlbedoMean:new Float32Array([.4,.4,.4,.5,20/255,45/255,230/255,.5])};
    const calibratedMaterial=new T.MeshStandardMaterial({side:T.DoubleSide});
    ApplyPatches(calibratedMaterial,[MakeTrenchSurfacePatch(calibratedPack,'high',null,contact),MakePatch({key:'fixtureClodPigment',fragment:[
      ['#include <dithering_fragment>','gl_FragColor=vec4(diffuseColor.rgb,1.0);'],
    ]})]);
    rootMesh.material=calibratedMaterial;
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-2;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const calibratedFoot=Pixel(target,rootMesh.position);
    for(let i=3;i<rootLayers.length;i+=4)rootLayers[i]=-2.25;
    rootGeometry.attributes.terrainLayers.needsUpdate=true;Render();const calibratedCore=Pixel(target,rootMesh.position);
    rootMesh.material=rootMaterial;calibratedMaterial.dispose();
    scene.remove(rootMesh);rootGeometry.dispose();rootMaterial.dispose();
    const gl=renderer.getContext(),glError=gl.getError(),linked=renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS));
    pass.Dispose();const validAfterDispose=TerrainBlendUniforms.uTerrainBlendValid.value;
    prepass.Dispose();target.dispose();contact.Dispose();renderer.dispose();
    return {samples,normalDepth,sourceIdentity,restored,afterMove,validAfterHide,contextCleared,resized,validAfterDispose,rootColor,unmarkedColor,compactCapColor,looseCapColor,clodTransitionColor,clodCoreColor,calibratedFoot,calibratedCore,roadColors,crownColors,rotationBefore,rotationAfter,projectionSamples,glError,linked};
  });
  console.log(JSON.stringify(report,null,2));
  assert.deepEqual(errors,[]);assert.equal(report.glError,0);assert.ok(report.linked&&report.sourceIdentity&&report.restored);
  assert.ok(report.clodCoreColor[0]>.7&&report.clodCoreColor[2]<.4,'exposed clod core uses the compact soil texture');
  assert.ok(report.clodTransitionColor[0]>report.looseCapColor[0]&&report.clodTransitionColor[0]<report.clodCoreColor[0]
    &&report.clodTransitionColor[2]<report.looseCapColor[2]&&report.clodTransitionColor[2]>report.clodCoreColor[2],
    'clod contact weight continuously blends the compact core into loose soil');
  assert.ok(report.calibratedCore.slice(0,3).every((v,i)=>Math.abs(v-report.calibratedFoot[i])<.015),
    'cohesive clod texture keeps the loose soil pigment mean');
  assert.ok(report.crownColors[0][0]>.7&&report.crownColors[0][2]<.1,'lower vertical cut remains compact');
  assert.ok(report.crownColors[4][0]<.1&&report.crownColors[4][2]>.7,'top of vertical cut joins loose spoil');
  for(let i=1;i<report.crownColors.length;i++){
    assert.ok(report.crownColors[i][0]<=report.crownColors[i-1][0]+.002
      &&report.crownColors[i][2]>=report.crownColors[i-1][2]-.002,'crown transition is monotonic');
  }
  assert.ok(report.crownColors[2][0]>.1&&report.crownColors[2][2]>.1,'middle crown band mixes both layers');
  assert.ok(report.rotationBefore[0]>.3&&Math.abs(report.rotationBefore[1])<.02,'unrotated +U normal points along the wall');
  assert.ok(Math.abs(report.rotationAfter[0])<.02&&Math.abs(report.rotationAfter[1]-report.rotationBefore[0])<.02
    &&Math.abs(report.rotationAfter[2]-report.rotationBefore[2])<.02,'quarter-turn UV sampling rotates the normal back to world +Y');
  for(const {variants} of report.projectionSamples){
    assert.ok(variants[0].range<.01,'legacy projection fixture reproduces a collapsed vertical texture');
    assert.ok(variants[1].range>.4,'geometry-aware projection retains texture variation on a vertical face');
  }
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
  assert.ok(report.rootColor[0]>report.rootColor[2]*1.5,'shared-batch root keeps pale brown albedo');
  assert.ok(report.unmarkedColor[2]>report.unmarkedColor[0]*2,'unmarked geometry still uses the blue soil fixture');
  assert.ok(report.compactCapColor[0]>report.compactCapColor[2]*2,'bank aggregate cap keeps the compact red layer');
  assert.ok(report.looseCapColor[2]>report.looseCapColor[0]*2,'crown aggregate cap keeps the loose blue layer');
  for(const color of report.roadColors)assert.ok(color[2]>color[0]*2,'signed road coordinates never select the compact-clod flag');
  console.log('TerrainBlendTest: depth mask, albedo/normal/roughness, prepass, geometry update, resize and invalidation passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
