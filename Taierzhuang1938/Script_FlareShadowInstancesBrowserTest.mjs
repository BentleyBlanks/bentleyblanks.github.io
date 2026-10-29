import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const root=path.resolve(import.meta.dirname,'..'),server=await ServeRoot(root,0),browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:640,height:480}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/_check_FlareShadowInstances.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script><body></body>'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_check_FlareShadowInstances.html`);
  const report=await page.evaluate(async()=>{
    const T=await import('three'),{FlareShadowInstances}=await import('./Script_FlareShadowInstances.mjs'),{AttachShadowDepth}=await import('./Script_ShadowDepth.mjs');
    const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(320,240);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
    document.body.appendChild(renderer.domElement);
    const scene=new T.Scene();scene.background=new T.Color(.04,.04,.04);scene.add(new T.AmbientLight(0xffffff,.2));
    const light=new T.SpotLight(0xffffff,2000,70,.65,.1,2);light.position.set(0,16,0);light.target.position.set(0,0,-8);light.castShadow=true;
    light.shadow.mapSize.set(256,256);light.shadow.camera.near=.25;light.shadow.bias=-.0001;scene.add(light,light.target);
    const ground=new T.Mesh(new T.PlaneGeometry(70,70),new T.MeshStandardMaterial({color:0xbebebe,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.z=-8;ground.receiveShadow=true;scene.add(ground);
    const material=new T.MeshStandardMaterial({color:0x8f6849,roughness:1,side:T.DoubleSide}),geometry=new T.BoxGeometry(2,4,2);
    const source=new T.InstancedMesh(geometry,material,8),matrix=new T.Matrix4();source.count=5;source.castShadow=true;source.frustumCulled=false;source.position.x=.3;source.rotation.y=.04;AttachShadowDepth(source);scene.add(source);
    const SetInstance=(i,x,z=-8)=>source.setMatrixAt(i,matrix.makeTranslation(x,2,z));
    [0,4,-4,40,-40].forEach((x,i)=>{SetInstance(i,x);source.setColorAt(i,new T.Color(.8+i*.02,.7,.6));});
    source.instanceMatrix.needsUpdate=true;source.instanceColor.needsUpdate=true;
    const camera=new T.PerspectiveCamera(48,4/3,.1,100);camera.position.set(15,22,27);camera.lookAt(0,0,-8);
    const culler=new FlareShadowInstances({minTriangles:0,maxInstances:8}),original=renderer.shadowMap.render;
    let shadowTriangles=0,lastStats={};
    renderer.shadowMap.render=function(lights,world,main){
      if(world!==scene)return original.call(this,lights,world,main);
      scene.updateMatrixWorld(true);light.shadow.updateMatrices(light);
      const restore=culler.Begin(world,light.shadow.camera,main),before=renderer.info.render.triangles;
      try{return original.call(this,lights,world,main);}finally{shadowTriangles=renderer.info.render.triangles-before;lastStats={...culler.stats};restore();}
    };
    const output=new T.WebGLRenderTarget(320,240),depthOutput=new T.WebGLRenderTarget(256,256);
    const packScene=new T.Scene(),packCamera=new T.Camera(),packMaterial=new T.ShaderMaterial({
      uniforms:{depthMap:{value:null}},depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'#include <packing>\nuniform sampler2D depthMap;varying vec2 vUv;void main(){gl_FragColor=packDepthToRGBA(texture2D(depthMap,vUv).r);}',
    });packScene.add(new T.Mesh(new T.PlaneGeometry(2,2),packMaterial));
    const Read=()=>{
      renderer.info.reset();renderer.setRenderTarget(output);renderer.render(scene,camera);
      const image=new Uint8Array(320*240*4);renderer.readRenderTargetPixels(output,0,0,320,240,image);
      const triangles=shadowTriangles,stats=lastStats;
      const gl=renderer.getContext(),texture=light.shadow.map.depthTexture,handle=renderer.properties.get(texture).__webglTexture;
      // Native PCF uses a comparison texture; temporarily read the same stored
      // hardware depth through a regular sampler, then restore PCF sampling.
      const Sampling=compare=>{
        const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.bindTexture(gl.TEXTURE_2D,handle);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,compare?gl.COMPARE_REF_TO_TEXTURE:gl.NONE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,compare?gl.LINEAR:gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,compare?gl.LINEAR:gl.NEAREST);gl.bindTexture(gl.TEXTURE_2D,bound);
      };
      Sampling(false);packMaterial.uniforms.depthMap.value=texture;renderer.setRenderTarget(depthOutput);renderer.render(packScene,packCamera);Sampling(true);
      const depth=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(depthOutput,0,0,256,256,depth);
      return {image,depth,triangles,stats};
    };
    const Diff=(a,b)=>a.reduce((n,v,i)=>n+(v!==b[i]?1:0),0),cases=[];
    const Snapshot=()=>JSON.stringify({matrix:Array.from(source.instanceMatrix.array),color:source.instanceColor?Array.from(source.instanceColor.array):null,count:source.count,
      matrixVersion:source.instanceMatrix.version,colorVersion:source.instanceColor?.version,world:source.matrixWorld.elements,visible:source.visible,cast:source.castShadow});
    const Case=label=>{
      scene.updateMatrixWorld(true);const before=Snapshot(),geometryRef=source.geometry,materialRef=source.material,depthRef=source.customDepthMaterial;
      culler.bypass=true;const native=Read();culler.bypass=false;const compact=Read();
      cases.push({label,depthDiff:Diff(native.depth,compact.depth),pcfDiff:Diff(native.image,compact.image),nativeTriangles:native.triangles,compactTriangles:compact.triangles,
        stats:compact.stats,unchanged:before===Snapshot()&&source.geometry===geometryRef&&source.material===materialRef&&source.customDepthMaterial===depthRef,
        restored:source.visible&&!culler.root.visible,depthUnique:new Set(native.depth).size});
      return compact;
    };
    let last=Case('opaque');
    const pixels=new Uint8Array([255,255,255,255,255,255,255,0,255,255,255,0,255,255,255,255]),alpha=new T.DataTexture(pixels,2,2,T.RGBAFormat);
    alpha.needsUpdate=true;alpha.magFilter=T.NearestFilter;alpha.minFilter=T.NearestFilter;material.map=alpha;material.alphaTest=.5;material.needsUpdate=true;
    source.customDepthMaterial.needsUpdate=true;last=Case('cutout');
    SetInstance(0,30);SetInstance(3,1,-6);source.instanceMatrix.needsUpdate=true;last=Case('movingMatrices');
    source.count=4;source.position.x=-1;source.updateMatrixWorld(true);last=Case('countAndWorld');
    light.shadow.camera.setViewOffset(2,2,.15,.2,1.4,1.25);last=Case('croppedCamera');
    source.geometry=new T.BoxGeometry(2.5,4,2);last=Case('geometryReplacement');
    const compactImage=last.image;light.castShadow=false;const unshadowed=Read().image;light.castShadow=true;
    const pcfShadowPixels=Diff(compactImage,unshadowed);
    source.removeFromParent();Read();const staleRecords=culler.records.size;
    const gl=renderer.getContext(),glError=gl.getError();culler.Dispose();
    const sharedAlive=geometry.attributes.position.count===24&&material.map===alpha;
    renderer.dispose();
    return {cases,pcfShadowPixels,staleRecords,sharedAlive,glError};
  });
  await fs.mkdir(path.join(root,'tmp','Flare'),{recursive:true});await fs.writeFile(path.join(root,'tmp','Flare','Data_ShadowInstancesReport.json'),JSON.stringify(report,null,2));
  for(const result of report.cases){
    assert.equal(result.depthDiff,0,`${result.label}: native GPU depth must match exactly`);
    assert.equal(result.pcfDiff,0,`${result.label}: native PCF receiver pixels must match exactly`);
    assert.ok(result.nativeTriangles>result.compactTriangles,`${result.label}: instance compaction must reduce actual shadow triangles`);
    assert.ok(result.stats.visibleInstances>0&&result.stats.culledInstances>0);
    assert.ok(result.unchanged&&result.restored);assert.ok(result.depthUnique>8);
  }
  assert.ok(report.pcfShadowPixels>100,'Native PCF must visibly shadow the receiver');assert.equal(report.staleRecords,0);assert.equal(report.sharedAlive,true);assert.equal(report.glError,0);assert.deepEqual(errors,[]);
  console.log('FlareShadowInstancesBrowserTest passed',JSON.stringify(report));
}finally{await browser.close();server.close();}
