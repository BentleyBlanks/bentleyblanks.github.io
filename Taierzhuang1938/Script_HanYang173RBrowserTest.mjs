// Actual high-quality game: authored FPS/world identity, PBR decoding, a cast
// shadow fixture, night lighting, and capture of the production frame graph.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const out=path.join(import.meta.dirname,'_shots/HanYang173R');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(import.meta.dirname,'..'),0),browser=await LaunchBrowser();
const errors=[],evidence={};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&manual=1&shot=1&quality=high&scale=small`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
 evidence.identity=await page.evaluate(async()=>{
  const g=window.Taierzhuang,vm=g.viewmodel;
  const THREE=await import('three');const {PatchesOf}=await import('./Script_MaterialPatches.mjs');
  g.interact.hooks.TakeWeapon('HanYang',5);g.Debug.WeaponRange.GoTo('firing');
  g.player.health=100;g.player.spawnGrace=999;g.player.pitch=0;g.player.aimPitch=0;g.StepFrames(90);
  const meshes=[];vm.rig.group.traverse(o=>{if(o.userData.hanYang173RPart)meshes.push(o);});
  const world=g.actorFactory.ModelInstance('HanYang');
  const result={version:vm.rig.assetVersion,triangles:meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),
   parts:meshes.length,worldTriangles:world.tris,privateGeometry:world.meshes.every(m=>meshes.every(f=>f.geometry!==m.geometry)),
   materials:meshes.map(m=>({part:m.userData.hanYang173RPart,base:m.material.map?.colorSpace,normal:m.material.normalMap?.colorSpace,
    orm:m.material.roughnessMap?.colorSpace,folded:!m.material.metalnessMap,patches:PatchesOf(m.material).map(p=>p.key),
    color:m.material.color.toArray(),metalness:m.material.metalness,roughness:m.material.roughness}))};
  for(const m of world.meshes)m.geometry.dispose();
  const roof=new THREE.Mesh(new THREE.BoxGeometry(12,.2,12),new THREE.MeshStandardMaterial({color:0x666666,roughness:1}));
  roof.name='HanYangLightingShadowFixture';roof.position.copy(g.player.position);roof.position.y+=4;roof.castShadow=true;roof.visible=false;g.scene.add(roof);window.__hyRoof=roof;
  return result;
 });
 assert.equal(evidence.identity.version,'173R-20261025');assert.equal(evidence.identity.triangles,59901);
 assert.equal(evidence.identity.worldTriangles,59901);assert.equal(evidence.identity.parts,44);assert(evidence.identity.privateGeometry);
 for(const m of evidence.identity.materials){assert.equal(m.base,'srgb');assert.equal(m.normal,'');assert.equal(m.orm,'');assert(m.folded&&m.patches.some(p=>p.includes('orm')),m.part);}
 evidence.lighting=[];
 for(const mode of ['Day','Shadow','Night','Ads']){
  const row=await page.evaluate(async mode=>{
   const g=window.Taierzhuang;
   if(mode==='Night')g.Debug.ApplySky('night');else g.Debug.RestoreSky();
   window.__hyRoof.visible=mode==='Shadow';
   document.dispatchEvent(new MouseEvent(mode==='Ads'?'mousedown':'mouseup',{button:2,bubbles:true}));
   g.StepFrames(90,1/60,false);g.post.hasTaaHistory=false;g.StepFrames(24);
   const ldr=g.post.targets.ldr,pixels=new Uint8Array(ldr.width*ldr.height*4);
   g.renderer.readRenderTargetPixels(ldr,0,0,ldr.width,ldr.height,pixels);
   let sum=0,maximum=0;for(let i=0;i<pixels.length;i+=4){const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];sum+=l;maximum=Math.max(maximum,l);}
   const THREE=await import('three'),ray=new THREE.Raycaster();ray.layers.enableAll();
   const meshes=[];g.viewmodel.rig.group.traverse(m=>{if(m.userData.hanYang173RPart)meshes.push(m);});
   const woodSamples=[];
   for(const xy of [[.45,-.6],[.6,-.8],[.5,-.5]]){
    ray.setFromCamera(new THREE.Vector2(...xy),g.camera);
    const hit=ray.intersectObjects(meshes,false)[0];if(!hit?.object.userData.hanYang173RPart.includes('Wood'))continue;
    const x=Math.floor((xy[0]+1)*ldr.width/2),y=Math.floor((xy[1]+1)*ldr.height/2),rgb=[0,0,0];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)for(let c=0;c<3;c++)rgb[c]+=pixels[((y+dy)*ldr.width+x+dx)*4+c]/25;
    woodSamples.push({part:hit.object.userData.hanYang173RPart,rgb});
   }
   const {MeasureHanYangPixels}=await import('./_import/Script_HanYang173RPixelProbe.mjs');
   const surfaces=MeasureHanYangPixels(g);
   g.post.hasTaaHistory=false;g.StepFrames(1);
   return {mode,sky:g.sky.presetName,sun:g.lights.sun.intensity,ambient:g.lights.ambient.intensity,probe:g.lights.globalProbe.intensity,
    exposure:g.post.uniformsComposite.uExposure.value,meanLuma:sum/(pixels.length/4),maximum,woodSamples,surfaces,glError:g.renderer.getContext().getError(),ads:g.player.ads};
  },mode);
  assert.equal(row.glError,0);assert(row.meanLuma>2&&row.meanLuma<245&&row.maximum>30);
  if(mode==='Day')assert(row.woodSamples.length>=2&&row.woodSamples.every(s=>s.rgb[0]>s.rgb[2]*1.2&&s.rgb[0]>16),'daylight wood must retain a readable warm albedo, not the old purple-black floor');
  if(mode==='Day'||mode==='Shadow'){
   assert(row.surfaces.metal.pixels>5000,'actual visible metal mask');
   assert(row.surfaces.metal.p50>(mode==='Day'?18:10)&&row.surfaces.metal.blackFraction<(mode==='Day'?.45:.50),'metal must retain midtones in light and shade');
   assert(row.surfaces.metal.p95<235,'broad metal highlights must retain headroom');
  }
  evidence.lighting.push(row);await page.screenshot({path:path.join(out,`Scene_${mode}.png`)});
 }
 evidence.openGrip=await page.evaluate(()=>{
  const vm=window.Taierzhuang.viewmodel;vm.autoBolt=false;vm.pendingHoldOpen=true;vm.TriggerBolt();
  const input={ads:0,sprint:0,moveSpeed:0,grounded:true,ammo:0,elapsed:0};
  while(vm.action)vm.Update(1/60,input);vm.Update(1/60,input);vm.root.updateWorldMatrix(true,true);
  return {open:vm.boltOpen,offset:vm.gripContactRight.position.clone().sub(vm.handBase.right).toArray(),wrist:vm.riggedArms.wristBend.r};
 });
 assert(evidence.openGrip.open&&Math.abs(evidence.openGrip.offset[0]-.038)<1e-8&&evidence.openGrip.wrist<65,'open bolt contact survives pose-state reset');
 evidence.frame=await page.evaluate(async()=>{
  const fd=window.Tengxian.FrameDebug;const summary=await fd.Capture({timeoutMs:60000,waitGpu:false});
  const rifle=fd.Events({text:'HanYang173R',draw:true,limit:150});fd.Release();return {summary,rifle};
 });
 assert(evidence.frame.rifle.rows.length>0,'production frame includes authored rifle draws');
 assert.deepEqual(errors,[]);
 console.log('ok HanYang173R actual game: 59901 triangles, 44 PBR parts, private FPS/world geometry, high-quality day/shadow/night/ADS and frame graph');
}finally{
 await fs.writeFile(path.join(out,'Data_Acceptance.json'),JSON.stringify({evidence,errors},null,2));
 await browser.close();await new Promise(r=>server.close(r));
}
