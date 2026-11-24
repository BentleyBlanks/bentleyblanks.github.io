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
 assert.equal(evidence.identity.version,'511-exterior-profile-14');assert.equal(evidence.identity.parts,45);assert.equal(evidence.identity.triangles,72460);
 assert.equal(evidence.identity.npcTriangles,67852);assert.equal(evidence.identity.nearNpcTriangles,72460);
 assert.equal(evidence.identity.worldTriangles,72460);assert.equal(evidence.identity.worldParts,45);assert.equal(evidence.identity.npcSource,'model');assert(evidence.identity.privateGeometry);
 assert(evidence.identity.materials.filter(m=>m.base==='srgb').length>=40);
 assert(evidence.identity.materials.filter(m=>m.normal==='').length>=20);
 assert(evidence.identity.materials.filter(m=>m.clearcoat).length>=2);
 if(!external){
  evidence.woodCoat=await page.evaluate(()=>{
   const samples=[];
   window.Tengxian.viewmodel.rig.group.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.weaponSurface!=='wood')return;
    const mat=mesh.material,coat=mat.clearcoatMap.image,orm=mat.roughnessMap.image;
    const canvas=document.createElement('canvas');canvas.width=coat.width;canvas.height=coat.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(coat,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;ctx.drawImage(orm,0,0);
    const coverage=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    ctx.drawImage(mat.map.image,0,0);const base=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let visible=0,varnished=0,redSum=0,greenSum=0;
    const steelRoughness=[];
    for(let offset=0;offset<pixels.length;offset+=4*17){
     if(coverage[offset]>=230&&coverage[offset+2]>190)steelRoughness.push(coverage[offset+1]);
     if(coverage[offset]<230||coverage[offset+2]>50)continue;
     visible++;
     redSum+=base[offset];greenSum+=base[offset+1];
     if(mat.clearcoat*pixels[offset]/255>.18&&pixels[offset+1]>32&&pixels[offset+1]<135)varnished++;
    }
    steelRoughness.sort((first,second)=>first-second);
    const colorPatch=(u,v)=>{
     const red=[],green=[];
     for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
      const offset=4*((Math.round(v*canvas.height)+row)*canvas.width+Math.round(u*canvas.width)+col);
      red.push(base[offset]);green.push(base[offset+1]);
     }
     return [red.sort((one,two)=>one-two)[12],green.sort((one,two)=>one-two)[12]];
    };
    const sideValues=mesh.userData.type38Part.includes('WoodGroove')?
     [[.1005,.539,.1307,.5377],[.0938,.5167,.1239,.5154],[.0872,.4944,.1171,.4931]].map(([insideU,insideV,belowU,belowV])=>[colorPatch(insideU,insideV),colorPatch(belowU,belowV)]):[];
    const lacquerReflection=[],filmRoughness=[];
    if(sideValues.length){
     const spec=mat.specularIntensityMap.image;
     ctx.clearRect(0,0,canvas.width,canvas.height);
     ctx.drawImage(spec,0,0,canvas.width,canvas.height);
     for(const [u,v] of [[.1152,.4929],[.126,.5271],[.137,.5614],[.0922,.494],[.1029,.5283],[.1136,.5626]]){
      const patch=ctx.getImageData(Math.round(u*canvas.width)-2,Math.round(v*canvas.height)-2,5,5).data;
      const alpha=[];for(let offset=3;offset<patch.length;offset+=4)alpha.push(patch[offset]);
      lacquerReflection.push(alpha.sort((one,two)=>one-two)[12]);
      const rough=[];
      for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
       const index=4*((Math.round(v*canvas.height)+row)*canvas.width+Math.round(u*canvas.width)+col);
       rough.push(pixels[index+1]);
      }
      filmRoughness.push(rough.sort((one,two)=>one-two)[12]);
     }
    }
    samples.push({part:mesh.userData.type38Part,visible,varnished,meanRed:redSum/visible,meanGreen:greenSum/visible,sideValues,lacquerReflection,filmRoughness,
     steelCount:steelRoughness.length,steelRoughnessMedian:steelRoughness[Math.floor(steelRoughness.length*.5)]});
   });
   return samples;
  });
  assert.equal(evidence.woodCoat.length,2);
  for(const sample of evidence.woodCoat)assert(sample.visible>500&&sample.varnished/sample.visible>.90,`missing visible wood varnish: ${sample.part}`);
  const lower=evidence.woodCoat.find(sample=>sample.part.includes('WoodGroove')),upper=evidence.woodCoat.find(sample=>sample.part==='Wood_UpperFittedCrown05');
  assert(lower.meanGreen>upper.meanGreen*1.35&&lower.meanRed>upper.meanRed*1.12,'the stained crown and warmer lower wood must not collapse to the same brown');
  assert(upper.meanRed>108&&upper.meanGreen>39,'the upper handguard must retain warm wood beneath the lacquer');
  assert(lower.sideValues.length===3&&lower.sideValues.every(([inside,below])=>below[0]-inside[0]>18&&below[1]-inside[1]>7),
   'recessed flank and adjacent amber wood must remain distinct on the authored map, without relying on a baked highlight');
  assert(lower.lacquerReflection.length===6&&lower.lacquerReflection.slice(0,3).every((value,index)=>value>lower.lacquerReflection[index+3]+75),
   'the polished lower curve must have locally stronger dielectric reflection than the unchanged recess');
  assert(lower.filmRoughness[1]+18<lower.filmRoughness[4]&&lower.filmRoughness[1]+9<lower.filmRoughness[2],
   'clearcoat under the center of the groove must be smoother than the recess and taper back at its far end');
  assert(lower.steelCount>70&&lower.steelRoughnessMedian>121&&lower.steelRoughnessMedian<176,
   'the dark inlay should have a worn satin reflection, not a bright polished stripe');
  evidence.gripFinish=await page.evaluate(()=>{
   const rig=window.Tengxian.viewmodel.rig.group;let maps;
   rig.traverse(mesh=>{if(mesh.userData.type38Part==='Exterior_HandleOval08')maps=mesh.material.roughnessMap.image;});
   const canvas=document.createElement('canvas');canvas.width=maps.width;canvas.height=maps.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(maps,0,0);
   const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const Sample=(left,right)=>{
    const roughness=[],metalness=[];
    for(let row=Math.ceil(canvas.height*.08);row<canvas.height*.92;row+=5)
     for(let col=Math.ceil(canvas.width*left);col<canvas.width*right;col+=5){
      const offset=4*(row*canvas.width+col);
      if(data[offset]<230)continue;
      roughness.push(data[offset+1]);metalness.push(data[offset+2]);
     }
    const Median=values=>values.sort((first,second)=>first-second)[Math.floor(values.length/2)];
    return {count:roughness.length,roughness:Median(roughness),metalness:Median(metalness)};
   };
   return {neck:Sample(.13,.40),oval:Sample(.65,.90)};
  });
  const {neck,oval}=evidence.gripFinish;
  assert(neck.count>100&&oval.count>100&&neck.metalness-oval.metalness>25&&oval.roughness-neck.roughness>12,
   'the grip finish must separate polished neck from darker worn oval on the actual runtime maps');
  evidence.foreFinish=await page.evaluate(()=>{
   let mat;
   window.Tengxian.viewmodel.rig.group.traverse(mesh=>{if(mesh.userData.type38Part==='Exterior_LongRound44')mat=mesh.material;});
   const Sample=(image,u,v,channel)=>{
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const data=ctx.getImageData(Math.round(u*canvas.width)-3,Math.round(v*canvas.height)-3,7,7).data,values=[];
    for(let offset=channel;offset<data.length;offset+=4)values.push(data[offset]);
    return values.sort((first,second)=>first-second)[24];
   };
   return [[.1914,.15448],[.19243,.51833],[.19271,.83016]].map(([u,v])=>({
    albedo:Sample(mat.map.image,u,v,0),metal:Sample(mat.roughnessMap.image,u,v,2)}));
  });
  const [bandEnd,midSteel,farSteel]=evidence.foreFinish;
  assert(bandEnd.albedo>midSteel.albedo+45&&midSteel.albedo>farSteel.albedo+5&&bandEnd.metal>farSteel.metal+30,
   'polished steel by the band must not whiten the entire outer length');
  evidence.frameFinish=await page.evaluate(()=>{
   let mat;
   window.Tengxian.viewmodel.rig.group.traverse(mesh=>{if(mesh.userData.type38Part==='Exterior_FoldedFrame12')mat=mesh.material;});
   const Sample=(image,u,v,channel)=>{
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const patch=ctx.getImageData(Math.round(u*image.width)-3,Math.round(v*image.height)-3,7,7).data;
    const values=[];for(let offset=channel;offset<patch.length;offset+=4)values.push(patch[offset]);
    return values.sort((first,second)=>first-second)[24];
   };
   return [[.6641,.0708],[.6338,.9453],[.7301,.3281]].map(([u,v])=>({
    albedo:Sample(mat.map.image,u,v,0),roughness:Sample(mat.roughnessMap.image,u,v,1)
   }));
  });
  const [rearCap,frontCap,scaleRail]=evidence.frameFinish;
  assert([rearCap,frontCap].every(cap=>scaleRail.albedo-cap.albedo>40&&cap.roughness>scaleRail.roughness+5),
   'frame caps must retain darker, less polished steel than the engraved rail');
 }
 assert(evidence.identity.materials.filter(m=>m.base).every(m=>m.colour.every(c=>Math.abs(c-1)<1e-8)));
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
 console.log('ok Type38 511: actual FPS/NPC/world 72460 triangles, 45 parts, PBR maps, ADS, 120mm independent bolt/cover, held-open reload and GI/batched sampler budget');
}finally{await browser.close();server?.close();}
