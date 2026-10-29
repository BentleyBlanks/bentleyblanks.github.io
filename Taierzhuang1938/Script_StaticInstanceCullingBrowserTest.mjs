import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),html=await fs.readFile(path.join(import.meta.dirname,'index.html'),'utf8'),map=html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const server=await ServeRoot(root,0),browser=await LaunchBrowser(),errors=[];
try{
 const page=await browser.newPage({viewport:{width:640,height:480}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__StaticInstanceCulling',r=>r.fulfill({contentType:'text/html',body:`<!doctype html>${map}<canvas></canvas>`}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/__StaticInstanceCulling`);
 const report=await page.evaluate(async()=>{
  const T=await import('three'),{StaticInstanceCulling,StaticInstanceOpaqueSort}=await import('./Script_StaticInstanceCulling.mjs'),{PrepassPass}=await import('./Script_PostPrepass.mjs'),{AttachShadowDepth}=await import('./Script_ShadowDepth.mjs');
  const r=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:false});r.setSize(320,240);r.shadowMap.enabled=true;r.shadowMap.type=T.BasicShadowMap;
  const scene=new T.Scene();scene.background=new T.Color(.01,.01,.01);scene.add(new T.AmbientLight(0xffffff,.5));
  const light=new T.SpotLight(0xffffff,5000,100,1.05,.1,2);light.position.set(-18,18,0);light.target.position.set(0,0,0);light.castShadow=true;light.shadow.mapSize.set(256,256);light.shadow.camera.near=.25;scene.add(light,light.target);
  const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshStandardMaterial({color:0xaaaaaa}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const geo=new T.BoxGeometry(2,4,2),mat=new T.MeshStandardMaterial({color:0xffffff,side:T.DoubleSide}),source=new T.InstancedMesh(geo,mat,8),matrix=new T.Matrix4();
  source.name='StaticProp';source.userData.staticPropBatch=true;source.castShadow=true;source.receiveShadow=true;source.frustumCulled=false;source.count=5;source.instanceMatrix.setUsage(T.StaticDrawUsage);AttachShadowDepth(source);
  const Place=(i,x,y=2,z=0)=>source.setMatrixAt(i,matrix.makeTranslation(x,y,z));[0,-9,25,35,-35].forEach((x,i)=>{Place(i,x,i===1?7:2);source.setColorAt(i,new T.Color(1,.05,.05));});source.instanceMatrix.needsUpdate=true;source.instanceColor.needsUpdate=true;source.computeBoundingSphere();scene.add(source);
  // Same-material, same-depth overlap with a later source ID and different
  // color/normals catches both main and prepass tie-order regressions.
  const otherGeo=geo.clone(),normal=otherGeo.attributes.normal;for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
  const other=new T.InstancedMesh(otherGeo,mat,1);other.setMatrixAt(0,new T.Matrix4().makeTranslation(0,2,0));other.setColorAt(0,new T.Color(.05,.05,1));other.boundingSphere=source.boundingSphere.clone();other.frustumCulled=false;scene.add(other);
  const camera=new T.PerspectiveCamera(45,4/3,.1,100);camera.position.set(0,5,12);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
  const pipeline={preset:{velocity:true,hzb:false},hdrCapable:true,hdrType:T.HalfFloatType,targets:{}},prepass=new PrepassPass(pipeline);prepass.Resize(320,240);
  const scope=new StaticInstanceCulling(r,{tuning:{enabled:true,minTriangles:0,maxInstances:8,maxObjects:4}});prepass.instanceCulling=scope;
  const target=new T.WebGLRenderTarget(320,240,{type:T.HalfFloatType}),copyTarget=new T.WebGLRenderTarget(320,240,{type:T.HalfFloatType}),depthTarget=new T.WebGLRenderTarget(256,256);
  const copyMat=new T.ShaderMaterial({uniforms:{map:{value:null}},depthWrite:false,depthTest:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=texture2D(map,vUv);}'});
  const copyScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),copyMat),quadCamera=new T.Camera();copyScene.add(quad);
  const depthMat=new T.ShaderMaterial({uniforms:{map:{value:null}},depthWrite:false,depthTest:false,vertexShader:copyMat.vertexShader,fragmentShader:'#include <packing>\nuniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=packDepthToRGBA(texture2D(map,vUv).r);}'});
  const Read=texture=>{copyMat.uniforms.map.value=texture;quad.material=copyMat;r.setRenderTarget(copyTarget);r.render(copyScene,quadCamera);const a=new Uint16Array(320*240*4);r.readRenderTargetPixels(copyTarget,0,0,320,240,a);return a;};
  const Shadow=()=>{depthMat.uniforms.map.value=light.shadow.map.depthTexture;quad.material=depthMat;r.setRenderTarget(depthTarget);r.render(copyScene,quadCamera);const a=new Uint8Array(256*256*4);r.readRenderTargetPixels(depthTarget,0,0,256,256,a);return a;};
  const Snapshot=()=>JSON.stringify({matrix:Array.from(source.instanceMatrix.array),color:Array.from(source.instanceColor.array),count:source.count,matrixVersion:source.instanceMatrix.version,colorVersion:source.instanceColor.version,visible:source.visible});
  let prev=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),shadowSources=0;
  const native=r.shadowMap.render;r.shadowMap.render=function(lights,world,main){if(world===scene&&lights.length){if(!source.visible||source.count!==5)throw Error('Native shadow lost original instances');shadowSources++;}return native.call(this,lights,world,main);};
  const Draw=(bypass,sort=true)=>{
    scope.bypass=bypass;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),before=Snapshot();
    const prior=r.info.autoReset;r.info.autoReset=false;r.info.reset();prepass.Render({renderer:r,scene,camera,viewProjection:vp,prevViewProjection:prev,hasPrev:true});const preTriangles=r.info.render.triangles,preStats={...scope.stats};
    const normal=Read(prepass.normalDepthTexture),velocity=Read(prepass.velocityTexture);
    const restore=scope.Begin(scene,camera);r.setOpaqueSort(sort?StaticInstanceOpaqueSort:null);r.setRenderTarget(target);r.info.reset();try{r.render(scene,camera);}finally{r.setOpaqueSort(null);restore();}const mainTriangles=r.info.render.triangles;
    const hdr=new Uint16Array(320*240*4);r.readRenderTargetPixels(target,0,0,320,240,hdr);const shadow=Shadow();r.info.autoReset=prior;
    return {hdr,normal,velocity,shadow,preTriangles,mainTriangles,stats:preStats,unchanged:Snapshot()===before,restored:source.visible&&!scope.root.visible};
  };
  prepass.hasPrevVelocity=true;Draw(true);
  const Diff=(a,b)=>a.reduce((n,v,i)=>n+(v!==b[i]?1:0),0),cases=[];
  const Case=label=>{const native=Draw(true),compact=Draw(false);cases.push({label,hdrDiff:Diff(native.hdr,compact.hdr),normalDiff:Diff(native.normal,compact.normal),velocityDiff:Diff(native.velocity,compact.velocity),shadowDiff:Diff(native.shadow,compact.shadow),preSaved:native.preTriangles-compact.preTriangles,mainSaved:native.mainTriangles-compact.mainTriangles,stats:compact.stats,unchanged:compact.unchanged,restored:compact.restored,velocityPixels:compact.velocity.reduce((n,v,i)=>n+(i%4<2&&v!==0?1:0),0)});return native;};
  const first=Case('coplanarSort');const naive=Draw(false,false),sortRegressionWitness=Diff(first.hdr,naive.hdr);
  camera.position.x=.2;Case('cameraMotion');prev.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  camera.position.x=25;camera.lookAt(25,2,0);Case('differentSubset');
  camera.position.set(0,5,12);camera.lookAt(0,2,0);Place(2,2);source.instanceMatrix.needsUpdate=true;source.computeBoundingSphere();other.boundingSphere.copy(source.boundingSphere);Case('streamUpdate');
  const alpha=new T.DataTexture(new Uint8Array([255,255,255,255,255,255,255,0,255,255,255,0,255,255,255,255]),2,2);alpha.needsUpdate=true;alpha.magFilter=T.NearestFilter;alpha.minFilter=T.NearestFilter;mat.map=alpha;mat.alphaTest=.5;mat.needsUpdate=true;source.customDepthMaterial.needsUpdate=true;Case('cutout');
  const gl=r.getContext().getError();scope.Dispose();prepass.Dispose();r.dispose();return {cases,sortRegressionWitness,shadowSources,gl};
 });
 await fs.mkdir(path.join(root,'tmp/StaticInstanceCulling'),{recursive:true});await fs.writeFile(path.join(root,'tmp/StaticInstanceCulling/Data_Report.json'),JSON.stringify({report,errors},null,2));
 for(const c of report.cases){for(const field of ['hdrDiff','normalDiff','velocityDiff','shadowDiff'])assert.equal(c[field],0,`${c.label}:${field}`);assert.ok(c.preSaved>0&&c.mainSaved>0);assert.ok(c.unchanged&&c.restored);}
 assert.ok(report.sortRegressionWitness>100,'The coplanar witness must fail without source-id ordering');assert.ok(report.cases.find(c=>c.label==='cameraMotion').velocityPixels>100);assert.ok(report.shadowSources>10);assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 console.log('StaticInstanceCullingBrowserTest passed',JSON.stringify(report));
}finally{await browser.close();server.close();}
