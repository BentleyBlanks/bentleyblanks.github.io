// Production host integration: actual FPS, NPC/world factory, shared original
// PBR images, independent moving cover, and editor/ground weapon consumers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {TYPE38_511 as specification} from './Data_Type38_511.mjs';
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
  const row={version:g.viewmodel.rig.assetVersion,parts:meshes.flatMap(mesh=>mesh.userData.type38Parts).length,renderMeshes:meshes.length,
   triangles:meshes.reduce((sum,m)=>sum+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),
   worldTriangles:world.tris,worldParts:world.meshes.flatMap(mesh=>mesh.userData.type38Parts).length,worldMeshes:world.meshes.length,npcSource:g.actorFactory.WeaponSource('Type38'),
   npcTriangles:[...g.actorFactory.WeaponGeometry('Type38').geometries.values()].reduce((s,geo)=>s+(geo.index?.count||geo.attributes.position.count)/3,0),
   nearNpcTriangles:[...g.actorFactory.WeaponGeometry('Type38',0,{detail:true}).geometries.values()].reduce((s,geo)=>s+(geo.index?.count||geo.attributes.position.count)/3,0),
   privateGeometry:world.meshes.every(mesh=>meshes.every(fps=>fps.geometry!==mesh.geometry)),
   compressedTextures:meshes.reduce((sum,mesh)=>sum+Object.values(mesh.material).filter(value=>value?.isCompressedTexture).length,0),
   materials:meshes.map(mesh=>({part:mesh.userData.type38Part,sources:mesh.userData.type38Parts.length,base:mesh.material.map?.colorSpace,normal:mesh.material.normalMap?.colorSpace,
    orm:mesh.material.roughnessMap?.colorSpace,ao:!!mesh.material.userData.ormUniforms?.ao&&!mesh.material.aoMap,
    clearcoat:!!mesh.material.clearcoatMap,colour:mesh.material.color.toArray()})),glError:g.renderer.getContext().getError()};
  world.meshes.forEach(mesh=>mesh.geometry.dispose());return row;
 });
 assert.equal(evidence.identity.version,specification.version);
 assert.equal(evidence.identity.parts,specification.parts);assert.equal(evidence.identity.triangles,specification.triangles);
 assert.equal(evidence.identity.renderMeshes,specification.renderMeshes);
 evidence.gripDirection=await page.evaluate(()=>{
  let finish;
  window.Tengxian.viewmodel.rig.group.traverse(mesh=>{
   if(mesh.userData.type38Part!=='Exterior_HandleOval08')return;
   const mat=mesh.material,map=mat.anisotropyMap;
   if(map)finish={physical:mat.isMeshPhysicalMaterial,strength:mat.anisotropy,data:map.colorSpace,scale:map.repeat.toArray()};
  });
  return finish;
 });
 assert(evidence.gripDirection?.physical&&evidence.gripDirection.strength>=.18&&evidence.gripDirection.strength<=.27&&evidence.gripDirection.data==='');
 assert.deepEqual(evidence.gripDirection.scale,[128/1024,24/1024],'directional data must use its own padded atlas tile');
 assert.equal(evidence.identity.npcTriangles,specification.npcTriangles);assert.equal(evidence.identity.nearNpcTriangles,specification.triangles);
 assert.equal(evidence.identity.worldTriangles,specification.triangles);assert.equal(evidence.identity.worldParts,specification.parts);
 assert.equal(evidence.identity.worldMeshes,specification.renderMeshes);assert.equal(evidence.identity.npcSource,'model');assert(evidence.identity.privateGeometry);
 const sourceCount=predicate=>evidence.identity.materials.filter(predicate).reduce((sum,m)=>sum+m.sources,0);
 assert(sourceCount(m=>m.base==='srgb')>=40);
 assert(sourceCount(m=>m.normal==='')>=20);
 assert(sourceCount(m=>m.clearcoat)>=4);
 assert.equal(sourceCount(m=>m.ao&&m.orm===''),specification.parts,'all parts must read linear AO from the existing ORM sampler');
 if(!external){
  await page.evaluate(()=>{
   // Measure the original UV landmarks inside the actual game's atlas tiles.
   window.Type38AcceptanceMaterial=part=>{
    let target;
    window.Tengxian.viewmodel.rig.group.traverse(mesh=>{
     if(mesh.userData.type38Parts?.includes(part))target=mesh;
    });
    const textureTile=target.userData.type38SourceRanges?.find(section=>section.part===part)?.tile;
    if(!textureTile)return target.material;
    const view={...target.material};
    const [left,top,width,height]=textureTile.sourceRect;
    const [x,y]=textureTile.atlasOrigin;
    for(const key of ['map','roughnessMap','normalMap']){
     const texture=target.material[key];
     if(!texture)continue;
     const canvas=document.createElement('canvas');
     [canvas.width,canvas.height]=textureTile.sourceSize;
     canvas.getContext('2d').drawImage(texture.image,x,y,width,height,left,top,width,height);
     view[key]={...texture,image:canvas};
    }
    return view;
   };
  });
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
    let visible=0,varnished=0,redSum=0,greenSum=0,blueSum=0,occluded=0,open=0;
    const steelRoughness=[];
    for(let offset=0;offset<pixels.length;offset+=4*17){
     if(coverage[offset+1]===0)continue;
     if(coverage[offset+2]>190)steelRoughness.push(coverage[offset+1]);
     if(coverage[offset+2]>50)continue;
     visible++;
     if(coverage[offset]<200)occluded++;
     if(coverage[offset]>245)open++;
     redSum+=base[offset];greenSum+=base[offset+1];blueSum+=base[offset+2];
     if(mat.clearcoat*pixels[offset]/255>.18&&pixels[offset+1]>32&&pixels[offset+1]<135)varnished++;
    }
    steelRoughness.sort((first,second)=>first-second);
    const patchMedian=(image,channel,u,v)=>{
     const values=[];
     for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
      const offset=4*((Math.round(v*canvas.height)+row)*canvas.width+Math.round(u*canvas.width)+col);
      values.push(image[offset+channel]);
     }
     return values.sort((one,two)=>one-two)[12];
    };
    const lowerStock=mesh.userData.type38Part.includes('WoodGroove');
    const colorPatch=(u,v)=>[0,1].map(channel=>patchMedian(base,channel,u,v));
    const sideValues=lowerStock?
     [[.1005,.539,.1307,.5377],[.0938,.5167,.1239,.5154],[.0872,.4944,.1171,.4931]].map(([insideU,insideV,belowU,belowV])=>[colorPatch(insideU,insideV),colorPatch(belowU,belowV)]):[];
    const dentAo=lowerStock?[[.06723,.30790],[.05709,.28643],[.05531,.26699]]
      .map(([u,v])=>patchMedian(coverage,0,u,v)):[];
    // Sample the exposed crown directly because its chart includes the shaded underside.
    const crownAo=lowerStock?[]:[[.15918,.87402],[.15723,.67871],[.15723,.48145],[.15723,.28223]]
      .map(([u,v])=>patchMedian(coverage,0,u,v));
    const lacquerReflection=[],filmRoughness=[],seatFinish=[];
    if(sideValues.length){
     for(const [u,v] of [[.922,.8454],[.679,.362]]){
      const strength=[],roughness=[];
      for(let row=-3;row<=3;row++)for(let col=-3;col<=3;col++){
       const i=4*((Math.round(v*canvas.height)+row)*canvas.width+Math.round(u*canvas.width)+col);
       strength.push(pixels[i]);roughness.push(pixels[i+1]);
      }
      seatFinish.push({strength:strength.sort((a,b)=>a-b)[24],roughness:roughness.sort((a,b)=>a-b)[24]});
     }
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
    samples.push({part:mesh.userData.type38Part,visible,varnished,occluded,open,dentAo,crownAo,meanRed:redSum/visible,meanGreen:greenSum/visible,meanBlue:blueSum/visible,sideValues,lacquerReflection,filmRoughness,seatFinish,
     steelCount:steelRoughness.length,steelRoughnessMedian:steelRoughness[Math.floor(steelRoughness.length*.5)]});
   });
   return samples;
  });
  assert.equal(evidence.woodCoat.length,2);
  for(const sample of evidence.woodCoat)assert(sample.visible>500&&sample.varnished/sample.visible>.90,`missing visible wood varnish: ${sample.part}`);
  const lower=evidence.woodCoat.find(sample=>sample.part.includes('WoodGroove')),upper=evidence.woodCoat.find(sample=>sample.part==='Wood_UpperFittedCrown05');
  assert(lower.occluded>20&&lower.open>lower.visible*.45,'the stock needs contact AO and open exposed faces');
  assert(upper.occluded>20&&upper.crownAo.length===4&&upper.crownAo.every(value=>value>245),
    'the upper wood needs contact AO under the sides and a bright exposed crown');
  assert(lower.dentAo.length===3&&lower.dentAo.every(value=>value<170),'exposed wood dents must carry their own cavity AO');
  const [shelteredSeat,exposedWrist]=lower.seatFinish;
  assert(shelteredSeat.strength<exposedWrist.strength*.52&&shelteredSeat.roughness>exposedWrist.roughness+7,
   'the cut wood at the rear seam must show a more satin finish than the exposed wrist');
  assert(lower.meanRed>upper.meanRed*1.17&&lower.meanGreen>upper.meanGreen*1.09,
   'the darker upper lacquer must retain contrast with the amber lower wood');
  assert(upper.meanRed>85&&upper.meanRed<125&&upper.meanGreen>upper.meanRed*.44&&upper.meanGreen<upper.meanRed*.63&&
   upper.meanBlue>upper.meanRed*.22&&upper.meanBlue<upper.meanRed*.40,
   'the upper handguard must remain a muted red-brown below the lacquer');
  assert(lower.sideValues.length===3&&lower.sideValues.every(([inside,below])=>below[0]-inside[0]>18&&below[1]-inside[1]>7),
   'recessed flank and adjacent amber wood must remain distinct on the authored map, without relying on a baked highlight');
  assert(lower.lacquerReflection.length===6&&lower.lacquerReflection.slice(0,3).every((value,index)=>value>lower.lacquerReflection[index+3]+75),
   'the polished lower curve must have locally stronger dielectric reflection than the unchanged recess');
  assert(lower.filmRoughness[1]+18<lower.filmRoughness[4]&&lower.filmRoughness[1]+9<lower.filmRoughness[2],
   'clearcoat under the center of the groove must be smoother than the recess and taper back at its far end');
  assert(lower.steelCount>70&&lower.steelRoughnessMedian>121&&lower.steelRoughnessMedian<176,
   'the dark inlay should have a worn satin reflection, not a bright polished stripe');
  evidence.gripFinish=await page.evaluate(()=>{
   const handle=window.Type38AcceptanceMaterial('Exterior_HandleOval08');
   const cover=window.Type38AcceptanceMaterial('T38_430B_IndependentLeftCoverSkin');
   const canvas=document.createElement('canvas');
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const Read=image=>{
    canvas.width=image.width;canvas.height=image.height;
    ctx.drawImage(image,0,0);
    return ctx.getImageData(0,0,canvas.width,canvas.height).data;
   };
   const Sample=(material,left,right)=>{
    const {width,height}=material.roughnessMap.image;
    const data=Read(material.roughnessMap.image),color=Read(material.map.image);
    const roughness=[],metalness=[],base=[];
    for(let row=Math.ceil(height*.08);row<height*.92;row+=5)
     for(let col=Math.ceil(width*left);col<width*right;col+=5){
      const offset=4*(row*width+col);
      if(data[offset]<230||!data[offset+1])continue;
      roughness.push(data[offset+1]);metalness.push(data[offset+2]);
      base.push(.2126*color[offset]+.7152*color[offset+1]+.0722*color[offset+2]);
     }
    for(const channel of [roughness,metalness,base])channel.sort((first,second)=>first-second);
    const Pick=(values,q)=>values[Math.round((values.length-1)*q)];
    return {count:roughness.length,base:Pick(base,.5),roughness:Pick(roughness,.5),metalness:Pick(metalness,.5),
     roughnessRange:Pick(roughness,.9)-Pick(roughness,.1),baseRange:Pick(base,.9)-Pick(base,.1)};
   };
   const neck=Sample(handle,.13,.40),oval=Sample(handle,.65,.90),coverFinish=Sample(cover,0,1);
   const direction=handle.anisotropyMap;
   canvas.width=direction.image.width;canvas.height=direction.image.height;
   ctx.drawImage(direction.image,0,0);
   const brushSamples=[[.27,.20],[.60,.50],[.91,.74],[.99,.74],[.91,.20]].map(([u,v])=>{
    const x=Math.floor(canvas.width*(direction.offset.x+u*direction.repeat.x));
    const y=Math.floor(canvas.height*(direction.offset.y+v*direction.repeat.y));
    return Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3);
   });
   return {neck,oval,coverFinish,brushSamples};
  });
  const {neck,oval,coverFinish}=evidence.gripFinish;
  assert(coverFinish.count>100,'measure the adjacent cover with the grip');
  for(const [label,finish] of Object.entries({neck,oval})){
   assert(finish.count>100&&Math.abs(finish.base-coverFinish.base)<20,
    `${label} base color must stay in the adjacent steel range`);
   assert(finish.roughness>=coverFinish.roughness-5&&finish.roughness<=coverFinish.roughness+42,
    `${label} must have a satin reflection comparable to the adjacent cover`);
   assert(finish.metalness>210&&Math.abs(finish.metalness-coverFinish.metalness)<26&&finish.roughnessRange>15&&finish.baseRange>10,
    `${label} must retain metallic response and visible wear variation`);
  }
  const [stem,gap,outer,pole,wornFlank]=evidence.gripFinish.brushSamples;
  assert(stem[0]<75&&stem[1]>200&&stem[2]>180&&outer[0]>245&&outer[2]>235&&wornFlank[2]<160&&gap[2]<8&&pole[2]<8,
   'the brush direction must fade through the junction and close smoothly at the tip');
  evidence.rearSteel=await page.evaluate(()=>{
   const collar=window.Type38AcceptanceMaterial('T38_435F2_IndependentTailNeckExterior').roughnessMap.image;
   const face=window.Type38AcceptanceMaterial('T38_440D2_IndependentVisibleRecess');
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
   const Read=image=>{
    canvas.width=image.width;
    canvas.height=image.height;
    ctx.drawImage(image,0,0);
   };
   const Median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length*.5)];
   const Patch=(u,v,channel)=>{
    const x=Math.floor(canvas.width*u),y=Math.floor(canvas.height*v);
    const rgba=ctx.getImageData(x-3,y-3,7,7).data;
    return Median(Array.from({length:49},(_,i)=>rgba[4*i+channel]));
   };
   Read(collar);
   const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   const rough=[];
   for(let i=0;i<rgba.length;i+=28)if(rgba[i+1]>0&&rgba[i+2]>170)rough.push(rgba[i+1]);
   const collarRough={count:rough.length,median:Median(rough)};
   Read(face.map.image);
   const cupColor=Patch(.408,.48,0),dotColor=Patch(.387,.28,0);
   Read(face.roughnessMap.image);
   return {collarRough,cupColor,dotColor,cupRough:Patch(.408,.48,1),dotRough:Patch(.387,.28,1)};
  });
  const {collarRough,cupColor,dotColor,cupRough,dotRough}=evidence.rearSteel;
  assert(collarRough.count>100&&collarRough.median>120&&collarRough.median<165,
   'the collar needs a broad satin highlight');
  assert(dotColor-cupColor>55&&cupRough-dotRough>35,
   'the recessed center and worn dot surface need distinct reflectance');
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
   const patches = [[.1914,.15448],[.19243,.51833],[.19271,.83016]].map(([u,v])=>({
    albedo:Sample(mat.map.image,u,v,0),
    roughness:Sample(mat.roughnessMap.image,u,v,1),
    metal:Sample(mat.roughnessMap.image,u,v,2),
   }));
   const map=mat.normalMap;
   return {patches,normalSpace:map?.colorSpace,normalStrength:mat.normalScale.x};
  });
  const {patches,normalSpace,normalStrength}=evidence.foreFinish;
  const albedos=patches.map(patch=>patch.albedo);
  assert(albedos.every(value=>value>55&&value<115)&&Math.max(...albedos)-Math.min(...albedos)<26,
   'all three sections of the front steel must share one dark finish through the band junction');
  assert(patches.every(patch=>patch.roughness>84&&patch.roughness<150&&patch.metal>215),
   'the front finish must respond as satin steel along the exposed surface');
  assert(normalSpace===''&&normalStrength>.25&&normalStrength<.65,'the front steel needs its fine non-color normal map');
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
 const animation=await page.evaluate(async()=>{
  const THREE=await import('three');
  const g=window.Tengxian;g.Debug.OpenEditor('firstPerson');const editor=g.editor.active;editor.SetWeapon('Type38');editor.SetPose('hip');editor.SetView('player');editor.SetAnimationClean(true);
  for(let i=0;i<90;i++)editor.Update(1/60);const vm=g.viewmodel;
  const {children}=vm.rig.group.getObjectByName('boltBody');
  const handle=children.find(mesh=>mesh.userData.type38Part==='Exterior_HandleOval08');
  const shell=children.find(mesh=>mesh.userData.type38Part==='T38_435F2_VisualBackingRearEnd');
  handle.geometry.computeBoundingBox();
  const {min,max}=handle.geometry.boundingBox,span=max.x-min.x;
  const points=handle.geometry.attributes.position,root=new THREE.Vector3();
  let count=0;
  for(let i=0;i<points.count;i++){
   if(points.getX(i)>min.x+span*.025)continue;
   root.add(new THREE.Vector3().fromBufferAttribute(points,i));count++;
  }
  root.divideScalar(count);root.x=min.x;
  const stem=root.clone();stem.x+=span*.21;
  const ray=new THREE.Raycaster();
  ray.layers.enableAll();
  const origin=new THREE.Vector3(),end=new THREE.Vector3();
  const HasSurfaceJoin=()=>{
   handle.updateWorldMatrix(true,false);
   shell.updateWorldMatrix(true,false);
   origin.copy(stem).applyMatrix4(handle.matrixWorld);
   end.copy(root).applyMatrix4(handle.matrixWorld);
   ray.set(origin,end.clone().sub(origin).normalize());
   ray.far=origin.distanceTo(end);
   return ray.intersectObject(shell,false).length>0;
  };
  vm.pendingHoldOpen=true;vm.TriggerBolt();let maxCover=0,maxBolt=0,frames=0,coverError=0,detachedFrames=0;
  while(vm.action&&frames<400){
   editor.Update(1/60);frames++;
   maxCover=Math.max(maxCover,vm.rig.parts.dustCover.position.z);maxBolt=Math.max(maxBolt,vm.rig.parts.bolt.position.z);
   coverError=Math.max(coverError,Math.abs(vm.rig.parts.dustCover.position.z-vm.rig.parts.bolt.position.z));
   if(!HasSurfaceJoin())detachedFrames++;
  }
  const mechanism={frames,maxCover,maxBolt,coverError,detachedFrames,holdOpen:vm.boltOpen,
   boltParts:children.flatMap(mesh=>mesh.userData.type38Parts).length,
   coverParts:vm.rig.parts.dustCover.children.flatMap(mesh=>mesh.userData.type38Parts).length,
   coverMeshes:vm.rig.parts.dustCover.children.length};
  window.ProbeType38DisplayJoin=HasSurfaceJoin;
  return mechanism;
 });
 evidence.mechanism=animation;
 assert(evidence.mechanism.frames>20);assert(evidence.mechanism.maxCover>.115&&evidence.mechanism.maxBolt>.115);assert(evidence.mechanism.coverError<1e-8);assert(evidence.mechanism.holdOpen);
 assert.equal(evidence.mechanism.boltParts,4);assert.equal(evidence.mechanism.coverParts,2);assert.equal(evidence.mechanism.coverMeshes,1);
 assert.equal(evidence.mechanism.detachedFrames,0,'the visible stem must meet the moving shell during every frame');
 await page.screenshot({path:path.join(out,'Scene_BoltOpen.png')});
 evidence.reload=await page.evaluate(()=>{
  const g=window.Tengxian,editor=g.editor.active,vm=g.viewmodel;vm.TriggerReload({remainingRounds:0});let frames=0,detachedFrames=0;
  while(vm.action&&frames<500){
   editor.Update(1/60);frames++;
   if(!window.ProbeType38DisplayJoin())detachedFrames++;
  }
  return {frames,detachedFrames,closed:!vm.boltOpen,action:vm.action?.kind??null,coverZ:vm.rig.parts.dustCover.position.z,glError:g.renderer.getContext().getError()};
 });
 assert(evidence.reload.frames>60);assert(evidence.reload.closed&&evidence.reload.action===null&&Math.abs(evidence.reload.coverZ)<1e-6);assert.equal(evidence.reload.glError,0);
 assert.equal(evidence.reload.detachedFrames,0,'the visible stem must remain joined through reload');
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
 assert.equal(evidence.samplers.batches,evidence.identity.materials.filter(m=>m.clearcoat).length);
 assert(evidence.samplers.rows.every(row=>row.linked&&row.count<=evidence.samplers.max));
 assert(evidence.samplers.rows.some(row=>row.shared&&row.batched));assert(evidence.samplers.toggles.every(row=>row.error===0));assert.equal(evidence.samplers.error,0);
 assert(!requests.some(url=>/Model_Type38\.tzm\.json/.test(url)),'retired runtime Type38 is not requested');
 assert(requests.some(url=>/Model_Type38_511[^/]*\.glb/.test(url)));
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_RuntimeAcceptance.json'),JSON.stringify({...evidence,errors},null,2));
 console.log(`ok Type38 511: FPS/NPC/world ${specification.triangles} triangles, ADS, connected handle through reload, PBR and batched sampler budget`);
}finally{await browser.close();server?.close();}
