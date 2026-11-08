// Production host integration: actual FPS, NPC/world factory, shared original
// PBR images, independent moving cover, and editor/ground weapon consumers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const external=process.argv.find(arg=>arg.startsWith('--base-url='))?.slice(11).replace(/\/$/,'');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots/Type38_511',external?'Online':'Local');
await fs.mkdir(out,{recursive:true});
const server=external?null:await ServeRoot(root,0),browser=await LaunchBrowser({extraArgs:['--mute-audio']});
const base=external||`http://127.0.0.1:${server.address().port}`;
const errors=[],requests=[],evidence={};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('request',request=>requests.push(request.url()));
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));});
 await page.goto(`${base}/Taierzhuang1938/?weapons=1&manual=1&shot=1&quality=high&scale=small&gi=1`,{timeout:120000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
 evidence.identity=await page.evaluate(()=>{
  const g=window.Tengxian;g.interact.hooks.TakeWeapon('Type38',5);g.Debug.WeaponRange.GoTo('firing');
  g.player.health=100;g.player.spawnGrace=999;g.player.pitch=0;g.player.aimPitch=0;g.StepFrames(90);
  const meshes=[];g.viewmodel.rig.group.traverse(mesh=>{if(mesh.userData.type38Part)meshes.push(mesh);});
  const world=g.actorFactory.ModelInstance('Type38_511');
  const row={version:g.viewmodel.rig.assetVersion,parts:meshes.length,triangles:meshes.reduce((sum,m)=>sum+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),
   worldTriangles:world.tris,worldParts:world.meshes.length,npcSource:g.actorFactory.WeaponSource('Type38'),
   npcTriangles:[...g.actorFactory.WeaponGeometry('Type38').geometries.values()].reduce((s,geo)=>s+(geo.index?.count||geo.attributes.position.count)/3,0),
   nearNpcTriangles:[...g.actorFactory.WeaponGeometry('Type38',0,{detail:true}).geometries.values()].reduce((s,geo)=>s+(geo.index?.count||geo.attributes.position.count)/3,0),
   privateGeometry:world.meshes.every(mesh=>meshes.every(fps=>fps.geometry!==mesh.geometry)),
   compressedTextures:meshes.reduce((sum,mesh)=>sum+Object.values(mesh.material).filter(value=>value?.isCompressedTexture).length,0),
   materials:meshes.map(mesh=>({part:mesh.userData.type38Part,base:mesh.material.map?.colorSpace,normal:mesh.material.normalMap?.colorSpace,
    orm:mesh.material.roughnessMap?.colorSpace,clearcoat:!!mesh.material.clearcoatMap,colour:mesh.material.color.toArray()})),glError:g.renderer.getContext().getError()};
  world.meshes.forEach(mesh=>mesh.geometry.dispose());return row;
 });
 assert.equal(evidence.identity.version,'511-20261108');assert.equal(evidence.identity.parts,45);assert.equal(evidence.identity.triangles,69586);
 assert.equal(evidence.identity.npcTriangles,64978);assert.equal(evidence.identity.nearNpcTriangles,69586);
 assert.equal(evidence.identity.worldTriangles,69586);assert.equal(evidence.identity.worldParts,45);assert.equal(evidence.identity.npcSource,'model');assert(evidence.identity.privateGeometry);
 assert(evidence.identity.materials.filter(m=>m.base==='srgb').length>=40);
 assert(evidence.identity.materials.filter(m=>m.normal==='').length>=20);
 assert(evidence.identity.materials.filter(m=>m.clearcoat).length>=2);
 assert(evidence.identity.materials.every(m=>m.colour.every(c=>Math.abs(c-2.5)<1e-8)));
 assert.equal(evidence.identity.glError,0);
 if(external)assert(evidence.identity.compressedTextures>0,'published Type38 uses actual GPU-compressed textures');
 await page.screenshot({path:path.join(out,'Scene_GameHip.png')});
 evidence.ads=await page.evaluate(()=>{
  const g=window.Tengxian;document.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));g.StepFrames(120);
  return {ads:g.player.ads,version:g.viewmodel.rig.assetVersion,eye:g.viewmodel.armPose.ads.weapon.eyeDistance,glError:g.renderer.getContext().getError()};
 });
 assert(evidence.ads.ads>.99);assert.equal(evidence.ads.glError,0);
 await page.screenshot({path:path.join(out,'Scene_GameAds.png')});
 evidence.mechanism=await page.evaluate(()=>{
  const g=window.Tengxian;g.Debug.OpenEditor('firstPerson');const editor=g.editor.active;editor.SetWeapon('Type38');editor.SetPose('hip');editor.SetView('player');editor.SetAnimationClean(true);
  for(let i=0;i<90;i++)editor.Update(1/60);const vm=g.viewmodel;
  vm.pendingHoldOpen=true;vm.TriggerBolt();let maxCover=0,maxBolt=0,frames=0,coverError=0;
  while(vm.action&&frames<400){editor.Update(1/60);frames++;maxCover=Math.max(maxCover,vm.rig.parts.dustCover.position.z);maxBolt=Math.max(maxBolt,vm.rig.parts.bolt.position.z);coverError=Math.max(coverError,Math.abs(vm.rig.parts.dustCover.position.z-vm.rig.parts.bolt.position.z));}
  return {frames,maxCover,maxBolt,coverError,holdOpen:vm.boltOpen,boltParts:vm.rig.group.getObjectByName('boltBody').children.length,
   coverParts:vm.rig.parts.dustCover.children.length};
 });
 assert(evidence.mechanism.frames>20);assert(evidence.mechanism.maxCover>.115&&evidence.mechanism.maxBolt>.115);assert(evidence.mechanism.coverError<1e-8);assert(evidence.mechanism.holdOpen);
 assert.equal(evidence.mechanism.boltParts,4);assert.equal(evidence.mechanism.coverParts,2);
 await page.screenshot({path:path.join(out,'Scene_BoltOpen.png')});
 evidence.reload=await page.evaluate(()=>{
  const g=window.Tengxian,editor=g.editor.active,vm=g.viewmodel;vm.TriggerReload({remainingRounds:0});let frames=0;
  while(vm.action&&frames<500){editor.Update(1/60);frames++;}
  return {frames,closed:!vm.boltOpen,action:vm.action?.kind??null,coverZ:vm.rig.parts.dustCover.position.z,glError:g.renderer.getContext().getError()};
 });
 assert(evidence.reload.frames>60);assert(evidence.reload.closed&&evidence.reload.action===null&&Math.abs(evidence.reload.coverZ)<1e-6);assert.equal(evidence.reload.glError,0);
 // The tight case is a world BatchedMesh with GI, SSR and three CSM cascades,
 // rather than the FPS gun alone. Preserve both original clearcoat R/G slots
 // while proving their shared sampler links within the fragment-stage limit.
 evidence.samplers=await page.evaluate(async()=>{
  const g=window.Tengxian,THREE=await import('three');g.editor.Close();
  const world=g.actorFactory.ModelInstance('Type38_511'),batches=[];
  for(const mesh of world.meshes){if(!mesh.material.clearcoatMap)continue;
   const geometry=mesh.geometry,batch=new THREE.BatchedMesh(1,geometry.attributes.position.count,geometry.index.count,mesh.material);
   batch.addInstance(batch.addGeometry(geometry));batch.position.copy(g.player.position).add(new THREE.Vector3(0,1,-2));
   batch.perObjectFrustumCulled=false;g.scene.add(batch);batches.push(batch);
  }
  g.renderer.compile(g.scene,g.camera);g.StepFrames(8);
  const gl=g.renderer.getContext(),rows=[];
  for(const entry of g.renderer.info.programs){
   const program=entry.program,linked=!!gl.getProgramParameter(program,gl.LINK_STATUS);
   if(!linked)rows.push({name:entry.name,linked,log:gl.getProgramInfoLog(program)});
   else if(entry.name?.startsWith('Type38_511')){
    const fragment=gl.getAttachedShaders(program).find(shader=>gl.getShaderParameter(shader,gl.SHADER_TYPE)===gl.FRAGMENT_SHADER);
    const source=gl.getShaderSource(fragment);let count=0;const names=[];
    for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){
     const info=gl.getActiveUniform(program,i);if(![gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_SHADOW,gl.UNSIGNED_INT_SAMPLER_2D].includes(info.type))continue;
     const base=info.name.replace(/\[0\]$/,''),declaration=new RegExp('\\buniform\\s+(?:(?:lowp|mediump|highp)\\s+)?[iu]?sampler\\w+\\s+'+base+'\\s*(?:\\[|;)');
     if(declaration.test(source)){count+=info.size;names.push(info.name);}
    }
    rows.push({name:entry.name,linked,count,names,shared:entry.cacheKey.includes('sharedClearcoat1'),batched:gl.getUniformLocation(program,'batchingTexture')!==null});
   }
  }
  const toggles=[];for(const soft of [true,false]){g.graphics.firstPersonSelfShadowSoft=soft;g.ApplyGraphics();g.StepFrames(6);toggles.push({soft,error:gl.getError()});}
  for(const batch of batches){g.scene.remove(batch);batch.dispose();}for(const mesh of world.meshes)mesh.geometry.dispose();
  return {batches:batches.length,max:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),rows,toggles,error:gl.getError()};
 });
 assert.equal(evidence.samplers.batches,4);assert(evidence.samplers.rows.every(row=>row.linked&&row.count<=evidence.samplers.max));
 assert(evidence.samplers.rows.some(row=>row.shared&&row.batched));assert(evidence.samplers.toggles.every(row=>row.error===0));assert.equal(evidence.samplers.error,0);
 assert(!requests.some(url=>/Model_Type38\.tzm\.json/.test(url)),'retired runtime Type38 is not requested');
 assert(requests.some(url=>/Model_Type38_511[^/]*\.glb/.test(url)));
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_RuntimeAcceptance.json'),JSON.stringify({...evidence,errors},null,2));
 console.log('ok Type38 511: actual FPS/NPC/world 69586 triangles, 45 parts, PBR maps, ADS, 120mm independent bolt/cover, held-open reload and GI/batched sampler budget');
}finally{await browser.close();server?.close();}
