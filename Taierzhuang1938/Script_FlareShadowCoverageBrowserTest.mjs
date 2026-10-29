// Full light-sphere coverage, long-range roof occlusion and projected-depth
// rejection. The camera sees all long-range roof receivers at the same time.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareShadowCoverage');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try {
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,800));});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/Probe.html?quality=high&preset=night&scene=street&gi=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Probe?.state.ready,null,{timeout:300000});
 const report=await page.evaluate(async()=>{
  const p=Probe,T=await import('three'),M=await import('./Script_MaterialPatches.mjs'),Common=await import('./Script_PostCommon.mjs'),C=await import('./Script_ClusteredLights.mjs');
  p.state.ready=false;p.scene.children.forEach(o=>o.visible=false);p.lights.ClearFires();p.post.SetTaaEnabled(false);p.post.SetAutoExposure(false);p.scene.fog=null;
  p.camera.far=900;p.camera.updateProjectionMatrix();
  const mat=new T.MeshStandardMaterial({color:0x808080,roughness:1,fog:false});M.ApplyPatches(mat,[M.MakeClusteredLightsPatch()]);
  const lamp=p.lights.AddFire({x:0,y:100,z:0},{intensity:90000,color:0xffffff,radius:600,flicker:false,flareShadow:true,autoSmoke:false});
  const Read=point=>{
   const target=p.post.targets.hdr,q=point.clone().project(p.camera),a=new Uint16Array(4);
   p.renderer.readRenderTargetPixels(target,Math.floor((q.x*.5+.5)*target.width),Math.floor((q.y*.5+.5)*target.height),1,1,a);
   const rgb=Array.from(a).slice(0,3).map(T.DataUtils.fromHalfFloat);return {rgb,y:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,ndc:q.toArray()};
  };
  const Frame=(enabled,n=3)=>{p.post.preset.flareShadows=enabled;p.StepFrames(n,0);};
  const ClearWithoutInvalidating=()=>{
   const pass=p.post.flareShadowsPass,original=pass.Publish;
   pass.Publish=function(slot,ctx){original.call(this,slot,ctx);for(const info of this.cluster.uniforms.uFlareShadowInfo.value)info.w=0;};
   try{Frame(true,1);}finally{pass.Publish=original;}
  };
  const ground=new T.Mesh(new T.BoxGeometry(340,.2,50),mat);ground.position.set(140,-.1,0);ground.castShadow=true;p.scene.add(ground);
  const roofs=new T.Group();p.scene.add(roofs);
  const positions=[0,90,100,108,110,111,112,113,115,130,180,250];
  for(const x of positions){const roof=new T.Mesh(new T.BoxGeometry(24,.2,8),mat);roof.position.set(x*.98,4,0);roof.castShadow=true;roofs.add(roof);}
  p.camera.position.set(125,80,240);p.camera.lookAt(125,0,0);p.post.NotifyCameraCut();
  const samples=positions.map(x=>({x,point:new T.Vector3(x,.005,0)}));
  Frame(false);for(const sample of samples)sample.clear=Read(sample.point);
  Frame(true);for(const sample of samples)sample.shadow=Read(sample.point);
  const roofImage=p.renderer.domElement.toDataURL('image/png');
  p.lights.UpdateFire(lamp,{intensity:0});Frame(true);for(const sample of samples)sample.dark=Read(sample.point);
  p.lights.UpdateFire(lamp,{intensity:90000});
  for(const sample of samples){sample.visibility=(sample.shadow.y-sample.dark.y)/(sample.clear.y-sample.dark.y);delete sample.point;}
  ground.visible=false;roofs.visible=false;
  const plane=new T.Mesh(new T.PlaneGeometry(24,24),mat),blocker=new T.Mesh(new T.BoxGeometry(10,.2,10),mat);blocker.castShadow=true;p.scene.add(plane,blocker);
  const source=new T.Vector3(0,100,0),zAxis=new T.Vector3(0,0,1),yAxis=new T.Vector3(0,1,0),direction=new T.Vector3();
  const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,1],[-1,-1,-1],[1,-1,0],[1,-.9999,0],[1,-1.0001,0]];
  const spherical=[];
  for(const vector of directions)for(const distance of [100,250,500]){
   blocker.scale.set(vector.filter(x=>x!==0).length>1?.15:1,1,vector.filter(x=>x!==0).length>1?.15:1);
   direction.set(...vector).normalize();plane.position.copy(source).addScaledVector(direction,distance);
   plane.quaternion.setFromUnitVectors(zAxis,direction.clone().negate());blocker.position.copy(source).addScaledVector(direction,distance-10);blocker.quaternion.setFromUnitVectors(yAxis,direction);
   const side=Math.abs(direction.y)<.9?new T.Vector3().crossVectors(direction,yAxis).normalize():new T.Vector3(1,0,0);
   p.camera.up.copy(Math.abs(direction.y)<.9?yAxis:zAxis);p.camera.position.copy(plane.position).addScaledVector(direction,-3).addScaledVector(side,6);p.camera.lookAt(plane.position);p.post.NotifyCameraCut();
   Frame(false);const clear=Read(plane.position);Frame(true);const shadow=Read(plane.position),layout=p.post.flareShadowsPass.slots.find(s=>s.source&&s.valid)?.cone?'adaptive':'cube';
   p.lights.UpdateFire(lamp,{intensity:0});Frame(true);const dark=Read(plane.position);p.lights.UpdateFire(lamp,{intensity:90000});
   spherical.push({vector,distance,clear,shadow,dark,layout,visibility:(shadow.y-dark.y)/(clear.y-dark.y)});
  }
  // Two cached sources must both cover a newly exposed face on its FIRST
  // frame, including camera cuts, FOV and aspect/target-size changes. The
  // blocker is behind this observer, so filtering visible receivers must not
  // remove an off-screen caster from the native shadow render.
  blocker.geometry.dispose();blocker.geometry=new T.BoxGeometry(1.5,.2,1.5);
  const second=p.lights.AddFire({x:0,y:100,z:0},{intensity:90000,color:0xffffff,radius:600,flicker:false,flareShadow:true,autoSmoke:false}),changes=[];
  for(const [vector,fov,width,height,shift=0] of [[[1,0,0],25,960,540],[[-1,0,0],70,700,700],[[0,1,0],115,1200,400],[[1,-1,0],100,960,540],[[1,-1,0],100,960,540,200]]){
   source.set(shift,100,0);for(const handle of [lamp,second])p.lights.UpdateFire(handle,{position:{x:source.x,y:source.y,z:source.z}});
   direction.set(...vector).normalize();plane.position.copy(source).addScaledVector(direction,100);plane.quaternion.setFromUnitVectors(zAxis,direction.clone().negate());
   blocker.scale.set(1,1,1);blocker.position.copy(source).addScaledVector(direction,90);blocker.quaternion.setFromUnitVectors(yAxis,direction);
   const side=Math.abs(direction.y)<.9?new T.Vector3().crossVectors(direction,yAxis).normalize():new T.Vector3(1,0,0);
   p.camera.up.copy(Math.abs(direction.y)<.9?yAxis:zAxis);p.camera.position.copy(plane.position).addScaledVector(direction,-3).addScaledVector(side,.8);p.camera.lookAt(plane.position);
   p.camera.fov=fov;p.camera.aspect=width/height;p.camera.updateProjectionMatrix();p.camera.updateMatrixWorld();p.renderer.setSize(width,height,false);p.post.SetSize(width,height);p.post.NotifyCameraCut();
   const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(p.camera.projectionMatrix,p.camera.matrixWorldInverse));
   Frame(true,1);const shadow=Read(plane.position),updates=p.post.flareShadowsPass.stats.updates,layouts=p.post.flareShadowsPass.slots.filter(s=>s.source).map(s=>s.cone?'adaptive':'cube');ClearWithoutInvalidating();const clear=Read(plane.position);
   changes.push({vector,fov,width,height,shift,shadow,clear,blockerVisible:frustum.intersectsObject(blocker),updates,layouts});Frame(true,1);
  }
  p.lights.RemoveFire(second);
  // Two antipodal receiver patches cannot fit a <90-degree circular cone.
  // Both are in the observer view, while their source-ray blockers miss the
  // observer rays. This must execute the native cube fallback, not hide a side.
  plane.visible=false;blocker.visible=false;source.set(0,100,0);p.lights.UpdateFire(lamp,{position:{x:0,y:100,z:0}});
  const fallbackGroup=new T.Group();p.scene.add(fallbackGroup);const fallbackPoints=[];
  for(const sign of [-1,1]){
   const target=new T.Mesh(new T.PlaneGeometry(24,24),mat);target.position.set(sign*100,100,0);target.quaternion.setFromUnitVectors(zAxis,new T.Vector3(-sign,0,0));fallbackGroup.add(target);fallbackPoints.push(target.position.clone());
   const caster=new T.Mesh(new T.BoxGeometry(1.5,.2,1.5),mat);caster.position.set(sign*90,100,0);caster.quaternion.setFromUnitVectors(yAxis,new T.Vector3(sign,0,0));caster.castShadow=true;fallbackGroup.add(caster);
  }
  p.camera.position.set(0,100,400);p.camera.up.set(0,1,0);p.camera.lookAt(source);p.camera.fov=70;p.camera.aspect=960/540;p.camera.updateProjectionMatrix();p.renderer.setSize(960,540,false);p.post.SetSize(960,540);p.post.NotifyCameraCut();
  Frame(false);const fallbackClear=fallbackPoints.map(Read);Frame(true,1);const fallbackShadow=fallbackPoints.map(Read),fallbackLayout=p.post.flareShadowsPass.slots.find(s=>s.source)?.cone?'adaptive':'cube';
  p.lights.UpdateFire(lamp,{intensity:0});Frame(false);const fallbackDark=fallbackPoints.map(Read);p.lights.UpdateFire(lamp,{intensity:90000});
  const fallback={layout:fallbackLayout,samples:fallbackClear.map((clear,i)=>({clear,shadow:fallbackShadow[i],dark:fallbackDark[i],visibility:(fallbackShadow[i].y-fallbackDark[i].y)/(clear.y-fallbackDark[i].y)}))};
  fallbackGroup.visible=false;
  // The receiver caches must follow actual instance values/count and batch
  // geometry/active IDs, including version-only uploads with identical data.
  const instanceChanges=[],instanceGeometry=new T.PlaneGeometry(24,24),instanceCaster=new T.Mesh(new T.BoxGeometry(1.5,.2,1.5),mat);instanceCaster.castShadow=true;p.scene.add(instanceCaster);
  const instanceRotation=new T.Quaternion().setFromUnitVectors(zAxis,new T.Vector3(-1,0,0)),instanceMatrix=new T.Matrix4(),instanceScale=new T.Vector3(1,1,1);
  const SetInstance=(mesh,id,point)=>{instanceMatrix.compose(point,instanceRotation,instanceScale);mesh.setMatrixAt(id,instanceMatrix);if(mesh.instanceMatrix)mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();};
  const CheckInstance=(mesh,type,change,point)=>{
   const ray=point.clone().sub(source).normalize(),side=new T.Vector3().crossVectors(ray,yAxis).normalize();
   instanceCaster.position.copy(point).addScaledVector(ray,-10);instanceCaster.quaternion.setFromUnitVectors(yAxis,ray);
   p.camera.position.copy(point).addScaledVector(ray,-3).addScaledVector(side,.8);p.camera.lookAt(point);p.post.NotifyCameraCut();
   Frame(true,1);const shadow=Read(point),cache={...p.post.flareShadowsPass.stats.receiverCache};ClearWithoutInvalidating();const clear=Read(point);
   p.lights.UpdateFire(lamp,{intensity:0});Frame(false,1);const dark=Read(point);p.lights.UpdateFire(lamp,{intensity:90000});
   instanceChanges.push({type,change,point:point.toArray(),shadow,clear,dark,cache,visibility:(shadow.y-dark.y)/(clear.y-dark.y)});
  };
  for(const type of ['instanced','batched']){
   const mesh=type==='instanced'?new T.InstancedMesh(instanceGeometry,mat,2):new T.BatchedMesh(2,8,12,mat);if(type==='instanced')mesh.count=1;
   const geometryId=type==='batched'?mesh.addGeometry(instanceGeometry):0,first=type==='batched'?mesh.addInstance(geometryId):0;p.scene.add(mesh);
   const firstPoint=new T.Vector3(100,100,0),movedPoint=new T.Vector3(300,100,0);SetInstance(mesh,first,firstPoint);CheckInstance(mesh,type,'initial',firstPoint);
   SetInstance(mesh,first,firstPoint);CheckInstance(mesh,type,'same-values-upload',firstPoint);
   SetInstance(mesh,first,movedPoint);CheckInstance(mesh,type,'matrix-values',movedPoint);
   SetInstance(mesh,first,firstPoint);const secondId=type==='batched'?mesh.addInstance(geometryId):1;if(type==='instanced')mesh.count=2;SetInstance(mesh,secondId,movedPoint);CheckInstance(mesh,type,'instance-count',movedPoint);
   if(type==='batched'){
    mesh.setVisibleAt(first,false);CheckInstance(mesh,type,'hidden-instance',movedPoint);
    mesh.setVisibleAt(first,true);CheckInstance(mesh,type,'shown-instance',movedPoint);
    mesh.deleteInstance(first);mesh.computeBoundingSphere();CheckInstance(mesh,type,'deleted-instance',movedPoint);
    const shiftedGeometry=new T.PlaneGeometry(24,24);shiftedGeometry.translate(200,0,0);const shiftedId=mesh.addGeometry(shiftedGeometry);mesh.setGeometryIdAt(secondId,shiftedId);mesh.computeBoundingSphere();
    const shiftedPoint=new T.Vector3(200,0,0).applyMatrix4(instanceMatrix);CheckInstance(mesh,type,'geometry-id',shiftedPoint);
   }
   mesh.visible=false;
  }
  const smallGeometry=new T.PlaneGeometry(2,2);
  for(const type of ['instanced','batched']){
   const mesh=type==='instanced'?new T.InstancedMesh(smallGeometry,mat,12):new T.BatchedMesh(12,4,6,mat),id=type==='batched'?mesh.addGeometry(smallGeometry):0,ids=[];p.scene.add(mesh);
   for(let i=0;i<12;i++)ids.push(type==='batched'?mesh.addInstance(id):i);
   for(const distance of [100,500]){
    for(let i=0;i<12;i++)SetInstance(mesh,ids[i],new T.Vector3(distance+i*.1,100,0));
    CheckInstance(mesh,type,`grouped-${distance}`,new T.Vector3(distance,100,0));
   }
   mesh.visible=false;
  }
  instanceCaster.visible=false;
  plane.visible=true;plane.position.set(100,100,0);plane.quaternion.copy(instanceRotation);
  blocker.visible=true;blocker.position.set(90,100,0);blocker.quaternion.setFromUnitVectors(yAxis,new T.Vector3(1,0,0));blocker.scale.set(1,1,1);
  p.camera.position.set(97,100,.8);p.camera.up.set(0,1,0);p.camera.lookAt(plane.position);p.post.NotifyCameraCut();
  p.lights.UpdateFire(lamp,{position:{x:0,y:100,z:0},intensity:90000});
  const movingSecond=p.lights.AddFire({x:0,y:100,z:0},{intensity:90000,color:0xffffff,radius:600,flicker:false,flareShadow:true,autoSmoke:false});
  Frame(true,4);const moving=[];let previousUpdates=p.post.flareShadowsPass.stats.updates;
  for(let i=1;i<=20;i++){
   for(const handle of [lamp,movingSecond])p.lights.UpdateFire(handle,{position:{x:i*.02,y:100-i*.04,z:0}});
   Frame(true,1);const pass=p.post.flareShadowsPass;moving.push({updates:pass.stats.updates-previousUpdates,fitReuse:pass.stats.fitReuse,shadow:Read(plane.position)});previousUpdates=pass.stats.updates;
  }
  ClearWithoutInvalidating();const movingClear=Read(plane.position);for(const handle of [lamp,movingSecond])p.lights.UpdateFire(handle,{intensity:0});Frame(false,1);const movingDark=Read(plane.position);
  p.lights.RemoveFire(movingSecond);p.lights.UpdateFire(lamp,{intensity:90000});
  // Call the actual shared GLSL with a known shadow camera. A fragment behind
  // its near/far interval must not compare against an unrelated packed depth.
  const u={};C.BindClusterUniforms(u,p.lights.clustered);
  u.uTestPosition={value:new T.Vector3()};u.uTestNormal={value:new T.Vector3(0,1,0)};
  const shader=Common.MakeFullscreenMaterial(`${C.CLUSTER_COMMON_GLSL}\nuniform vec3 uTestPosition;uniform vec3 uTestNormal;void main(){gl_FragColor=vec4(vec3(ClusterFlareShadow(0,uTestPosition,uTestNormal)),1.);}`,u);
  const target=new T.WebGLRenderTarget(1,1,{type:T.FloatType,depthBuffer:false}),values=[];
  const map=3,cluster=p.lights.clustered;
  // Freeze an ACTIVE downward map with a known 1m blocking depth. Check an
  // in-range occluded query first, so inactive/empty-map fallback cannot pass.
  const base=cluster.shadowBase+map*512*512/4;
  cluster.dataArray.fill(1,base*4,(base+512*512/4)*4);cluster.dataTexture.clearUpdateRanges();cluster.dataTexture.needsUpdate=true;
  u.uFlareShadowInfo.value[map].set(base,.055,512,1);
  u.uFlareShadowViewRotation.value.identity();u.uFlareShadowPosition.value[0].set(0,100,0,0);
  const projection=new T.Matrix4().makePerspective(-.25,.25,.25,-.25,.25,600),camera=new T.PerspectiveCamera(90,1,.25,600);camera.position.set(0,100,0);camera.up.set(0,0,1);camera.lookAt(0,99,0);camera.updateMatrixWorld();
  u.uFlareShadowMatrix.value[map].multiplyMatrices(projection,camera.matrixWorldInverse);
  const Test=y=>{u.uTestPosition.value.set(0,100-y,0);p.post.blitter.Blit(shader,target);const pixel=new Float32Array(4);p.renderer.readRenderTargetPixels(target,0,0,1,1,pixel);values.push({distance:y,visibility:pixel[0]});};
  Test(2);Test(.1);Test(601);Test(800);const blockingProbe=values.shift();
  shader.dispose();target.dispose();p.lights.RemoveFire(lamp);
  return {samples,spherical,changes,fallback,instanceChanges,moving,movingClear,movingDark,blockingProbe,depthRejected:values,faces:p.post.flareShadowsPass.stats.faces,bytes:p.lights.clustered.dataArray.byteLength,roofImage,gl:p.renderer.getContext().getError()};
 });
 const png=Buffer.from(report.roofImage.split(',')[1],'base64');delete report.roofImage;
 await fs.writeFile(path.join(out,'RoofCoverage.png'),png);
 await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify({report,errors},null,2));
 for(const sample of report.samples){assert.ok(Math.abs(sample.clear.ndc[0])<1&&Math.abs(sample.clear.ndc[1])<1,'Every roof receiver must be visible in the SAME camera');assert.ok(sample.clear.y>sample.dark.y+.01,'Roof receiver must have meaningful unobstructed illumination');assert.ok(sample.visibility<.05,'Roof must block beyond old cone: '+JSON.stringify(sample));}
 for(const sample of report.spherical){assert.equal(sample.layout,'adaptive','Single directional patches must execute adaptive shadows');assert.ok(sample.clear.y>sample.dark.y+.001,'Spherical fixture must receive real light: '+JSON.stringify(sample));assert.ok(sample.visibility<.05,'Every face and seam must block full-range light: '+JSON.stringify(sample));}
  for(const sample of report.changes){assert.ok(sample.shadow.y<sample.clear.y*.2,'Both sources must shadow newly visible receivers immediately: '+JSON.stringify(sample));assert.equal(sample.blockerVisible,false,'Offscreen caster fixture must actually be outside observer frustum');}
  assert.equal(report.blockingProbe.visibility,0,'Known active map must block an in-range receiver before near/far rejection checks');
  assert.equal(report.fallback.layout,'cube','Antipodal visible receivers must execute cube fallback');for(const sample of report.fallback.samples)assert.ok(sample.visibility<.05&&sample.clear.y>sample.dark.y+.01,'Both opposite receivers must be shadowed in cube fallback');
  for(const sample of report.instanceChanges){assert.ok(sample.clear.y>sample.dark.y+.001&&sample.visibility<.05,'Actual instance mutations must update receiver coverage: '+JSON.stringify(sample));if(sample.change==='same-values-upload')assert.ok(sample.cache.instanceUploadsUnchanged>0,'Identical matrix uploads must reuse cached boxes');if(['instance-count','shown-instance'].includes(sample.change))assert.equal(sample.cache.instanceActiveBoxes,2);if(['deleted-instance','hidden-instance'].includes(sample.change))assert.equal(sample.cache.instanceActiveBoxes,1);if(sample.change.startsWith('grouped-')){assert.equal(sample.cache.instanceActiveBoxes,12);assert.equal(sample.cache.instanceAggregateBoxes,1);}}
  for(const frame of report.moving){assert.equal(frame.updates,1,'Ordinary moving sources must retain one complete fresh source per frame');assert.ok((frame.shadow.y-report.movingDark.y)/(report.movingClear.y-report.movingDark.y)<.05,'Moving sources must preserve actual occlusion');}
  assert.ok(report.moving.reduce((sum,frame)=>sum+frame.fitReuse,0)>=20,'Moving sources must benefit from the reserved projection margin');
 for(const sample of report.depthRejected)assert.equal(sample.visibility,1,'Outside near/far depth must be rejected');
 assert.equal(report.faces,6);assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 console.log('FlareShadowCoverageBrowserTest passed',JSON.stringify({roofs:report.samples.map(x=>({x:x.x,visibility:x.visibility})),sphereCases:report.spherical.length,depthRejected:report.depthRejected,bytes:report.bytes,gl:report.gl}));
}finally{await browser.close();server.close();}
