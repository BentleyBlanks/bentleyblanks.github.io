import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { CAMPAIGN_ENTRIES } from "./Data_Menu.mjs";
import { COMMAND_ROOM_CAMPAIGN_IDS, COMMAND_ROOM_MAPS, COMMAND_ROOM_LETTERS, CommandRoomPapers } from "./Data_CommandRoomPapers.mjs";
import { CommandRoomPreview } from "./Script_CommandRoomPreview.mjs";

assert.deepEqual(COMMAND_ROOM_CAMPAIGN_IDS, CAMPAIGN_ENTRIES.map(entry => entry.id));
assert.equal(CommandRoomPapers({furthest: 99, cleared: ["CH0_Chuchuan", "CH1_NanLu", "WeaponRange", "CH6_Zuihou"]}).stage, 0);
assert.equal(CommandRoomPapers({cleared: [COMMAND_ROOM_CAMPAIGN_IDS[0], COMMAND_ROOM_CAMPAIGN_IDS[2]]}).stage, 1);
assert.equal(CommandRoomPapers(null).stage, 0);

// The override has no storage writer and rolls back a failed asset transition.
{
  const saved={cleared:COMMAND_ROOM_CAMPAIGN_IDS.slice(0,1)}, before=JSON.stringify(saved);
  let displayed=null, failStage=null;
  const preview=new CommandRoomPreview({
    async Load(progress){const papers=CommandRoomPapers(progress);if(papers.stage===failStage)throw new Error("fixture load failure");displayed=papers;},
    State(){return {papers:displayed};},
  },()=>saved);
  await preview.Load(); await preview.SetStage(2); failStage=5;
  await assert.rejects(preview.SetStage(5),/fixture load failure/);
  assert.equal(preview.State().stage,2); assert.equal(displayed.stage,2);
  failStage=null; await preview.SetStage(null);
  assert.equal(displayed.stage,1); assert.equal(JSON.stringify(saved),before);
}

const project=path.dirname(fileURLToPath(import.meta.url)),out=path.join(project,"_shots/CommandRoom");
const physicalSpec=JSON.parse(fs.readFileSync(path.join(project,"_blender/Data_CommandRoomPhysicalProps.json"),"utf8"));
fs.mkdirSync(out,{recursive:true});
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],paperRequests=[];
page.on("request", request => { if (request.url().includes("/Menu/CommandRoom/")) paperRequests.push(request.url()); });
page.on("pageerror",error=>errors.push(String(error)));
page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
const fixture=`<!doctype html><base href="/Taierzhuang1938/"><style>body{margin:0}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';import {CommandRoom} from './Script_CommandRoom.mjs';
window.THREE=THREE;window.active=true;
window.renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
window.room=new CommandRoom(renderer,{isActive:()=>window.active});await room.Load();room.Update(0);room.Render();
window.Advance=(seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)room.Update(1/60);room.Render();return room.State();};
window.Project=()=>[[-.142,.92,.629],[1.75585,1.8012,-2.297975]].map(p=>{const c=room.State().calibration;return new THREE.Vector3(...p).multiplyScalar(c.environmentScale).add(new THREE.Vector3(0,c.zLift,0)).project(room.camera).toArray();});
window.FogEnergy=()=>{const t=room.atmosphere.volumeTarget,b=new Uint16Array(t.width*t.height*4);renderer.readRenderTargetPixels(t,0,0,t.width,t.height,b);let total=0;for(let i=0;i<b.length;i+=4)total+=THREE.DataUtils.fromHalfFloat(b[i]);return total;};
window.ready=true;</script>`;
const result={};
try {
  await page.route("**/CommandRoomFixture",route=>route.fulfill({contentType:"text/html",body:fixture}));
  await page.goto(`http://127.0.0.1:${server.address().port}/CommandRoomFixture`);
  await page.waitForFunction(()=>window.ready,{},{timeout:60000});
  result.initial=await page.evaluate(()=>({state:room.State(),points:Project(),fog:FogEnergy()}));
  assert.ok(result.initial.state.meshes>=10&&result.initial.state.triangles>30000);
  result.composition=await page.evaluate(()=>{
    const c=room.State().calibration,up=p=>new THREE.Vector3(p[0],p[2],-p[1]);
    const original=room.camera.clone();original.position.copy(up(c.referenceCamera.position));
    original.lookAt(up(c.referenceCamera.target));original.updateMatrixWorld(true);
    const errors=Object.values(c.anchors).flatMap(anchor=>anchor.reference.map((p,i)=>{
      const a=up(p).project(original),b=up(anchor.calibrated[i]).project(room.camera);
      return Math.hypot(a.x-b.x,a.y-b.y);
    }));
    return {maxProjectionError:Math.max(...errors),rotationError:original.quaternion.angleTo(room.camera.quaternion),
      referenceCamera:c.referenceCamera,lensMm:c.camera.lensMm,desk:c.desk,chairSeatHeightM:c.chairSeatHeightM,
      apertureError:room.atmosphere.volumeMaterial.uniforms.origin.value.distanceTo(up(c.window.center))};
  });
  assert.deepEqual(result.composition.referenceCamera,{position:[-.85,-2.5,1.9],target:[-.4,.5,1.2],lensMm:29},
    "The approved reference camera is a fixed baseline, not regenerated from a new composition");
  assert.ok(result.composition.maxProjectionError<.00001,"Reference window, maps, tabletop, cabinet and coat keep their screen positions");
  assert.ok(result.composition.rotationError<.00001&&result.composition.lensMm===29,"Preserve the reference camera angle and lens");
  assert.ok(Math.abs(result.composition.desk.widthM-1.55)<.001&&Math.abs(result.composition.desk.heightM-.75)<.001,
    "Furniture must share a coherent metre scale with the adult props");
  assert.ok(Math.abs(result.composition.chairSeatHeightM-.46)<.001);
  assert.ok(result.composition.apertureError<.00001,"Runtime window light follows the calibrated physical aperture");
  result.exterior=await page.evaluate(()=>{
    let vista=null;
    room.scene.traverse(ob=>{
      if(ob.material?.name!=="CommandRoomFarmland")return;
      const bounds=new THREE.Box3().setFromObject(ob);
      vista={url:ob.material.emissiveMap?.image.currentSrc,lightMap:!!ob.material.lightMap,
        distance:bounds.getCenter(new THREE.Vector3()).distanceTo(room.camera.position),
        intensity:ob.material.emissiveIntensity};
    });return vista;
  });
  assert.ok(result.exterior?.url.includes("CommandRoomFarmlandImage.webp"),"Approved field vista is actually bound to the exterior material");
  assert.ok(!result.exterior.lightMap&&result.exterior.distance>20*result.initial.state.calibration.environmentScale&&result.exterior.intensity>0,
    "Far vista remains behind the physical aperture with independent radiance, avoiding washed-out room lighting");
  result.appearance=await page.evaluate(()=>{
    const sums=[0,0,0];let vertices=0,capSize=null;
    room.scene.traverse(ob=>{
      if(ob.material?.name==="CommandRoomWallSurface"){
        const color=ob.geometry.getAttribute("color");if(!color)return;
        for(let i=0;i<color.count;i++){sums[0]+=color.getX(i);sums[1]+=color.getY(i);sums[2]+=color.getZ(i);}
        vertices+=color.count;
      }
      if(ob.material?.name==="CommandRoomCapCloth")capSize=new THREE.Box3().setFromObject(ob).getSize(new THREE.Vector3()).toArray();
    });return {wallVertices:vertices,wallDye:sums.map(v=>v/Math.max(1,vertices)),capSize};
  });
  assert.ok(result.appearance.wallVertices>1000&&result.appearance.wallDye[0]>result.appearance.wallDye[1]+.02
    &&result.appearance.wallDye[1]>result.appearance.wallDye[2]+.03,
    "Exported wall skin must retain its warm, uneven aged-lime vertex dye");
  assert.ok(result.appearance.capSize[1]>.10&&result.appearance.capSize[1]<.125,
    "Adult cap keeps its physical crown height without a framing enlargement");
  result.physical=await page.evaluate(angle=>{
    const paper=[[],[]],bottle=new THREE.Box3();
    room.scene.traverse(ob=>{
      if(!ob.isMesh)return;
      if(ob.material?.name?.startsWith("CommandRoomInk"))bottle.union(new THREE.Box3().setFromObject(ob));
      if(ob.material?.name!=="CommandRoomLetter")return;
      const position=ob.geometry.getAttribute("position"),p=new THREE.Vector3();
      for(let i=0;i<position.count;i++){
        p.fromBufferAttribute(position,i).applyMatrix4(ob.matrixWorld);
        paper[0].push(p.x*Math.cos(angle)-p.z*Math.sin(angle));
        paper[1].push(-p.x*Math.sin(angle)-p.z*Math.cos(angle));
      }
    });
    return {authored:room.State().physical,letter:paper.map(values=>Math.max(...values)-Math.min(...values)),
      bottle:bottle.getSize(new THREE.Vector3()).toArray()};
  },physicalSpec.letter.angleRad);
  const Near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.0005,`${label}: ${actual} / ${expected} m`);
  assert.equal(result.physical.authored.units,"metres");
  Near(result.physical.letter[0],physicalSpec.letter.widthM,"Exported A5 width");
  Near(result.physical.letter[1],physicalSpec.letter.heightM,"Exported A5 height");
  Near(result.physical.bottle[0],physicalSpec.inkBottle.widthM,"Exported bottle width");
  Near(result.physical.bottle[1],physicalSpec.inkBottle.heightM,"Exported bottle height");
  Near(result.physical.bottle[2],physicalSpec.inkBottle.depthM,"Exported bottle depth");
  Near(result.physical.authored.cap.headCircumferenceM,physicalSpec.cap.headCircumferenceM,"Measured inner hatband");
  Near(result.physical.authored.dipPen.lengthM,physicalSpec.dipPen.lengthM,"Measured complete dip pen");
  for(const pencil of result.physical.authored.pencils)Near(pencil.lengthM,physicalSpec.pencil.lengthM,"Measured pencil length");
  assert.ok(Object.values(result.physical.authored.propIntersections).every(value=>value===0));
  result.timberColor=await page.evaluate(()=>{
    let minimum=Infinity,vertices=0;
    room.scene.traverse(ob=>{
      if(ob.material?.name!=="CommandRoomWood")return;
      const color=ob.geometry.getAttribute("color");
      if(!color){minimum=0;return;}
      for(let i=0;i<color.count;i++)minimum=Math.min(minimum,color.getX(i)+color.getY(i)+color.getZ(i));
      vertices+=color.count;
    });
    return {minimum,vertices};
  });
  assert.ok(result.timberColor.vertices>0&&result.timberColor.minimum>.3,
    "Joining worn table boards must preserve neutral vertex colors on the cabinet, chair and window timber");
  assert.ok(result.initial.fog>100,"Light volume must be visibly nonzero");
  assert.equal(paperRequests.length,2,"Initial menu requests only its current map and letter");
  result.papers=[];
  for(let stage=0;stage<=COMMAND_ROOM_CAMPAIGN_IDS.length;stage++){
    const progress={cleared:COMMAND_ROOM_CAMPAIGN_IDS.slice(0,stage)};
    const papers=await page.evaluate(async progress=>{
      await room.SetProgress(progress);room.Render();
      return { ...room.State().papers, urls:[...room.paperMaterials.values()].map(material=>material.map.image.currentSrc) };
    },progress);
    assert.equal(papers.map,COMMAND_ROOM_MAPS[stage]);
    assert.equal(papers.letter,COMMAND_ROOM_LETTERS[stage<2?0:stage<5?1:2]);
    assert.ok(papers.urls.some(url=>url.includes(papers.map+"Image.webp")));
    assert.ok(papers.urls.some(url=>url.includes(papers.letter+"Image.webp")));
    result.papers.push(papers);
    await page.screenshot({path:path.join(out,`Scene_CommandRoomProgress${stage}.png`)});
  }
  assert.equal(paperRequests.length,10,"All seven stages share exactly three letters");
  result.paperRace=await page.evaluate(async ids=>{
    await Promise.all([room.SetProgress({cleared:ids.slice(0,5)}),room.SetProgress({cleared:ids.slice(0,1)})]);
    return room.State().papers;
  },COMMAND_ROOM_CAMPAIGN_IDS);
  assert.equal(result.paperRace.stage,1,"An older asynchronous pair cannot overwrite a newer selection");
  await page.evaluate(async()=>{await room.SetProgress({cleared:[]});room.Render();});
  assert.equal(paperRequests.length,10,"Returning to a visited stage reuses decoded textures");
  await page.screenshot({path:path.join(out,"Scene_CommandRoomAtmosphere.png")});
  await page.mouse.move(1260,24);
  result.first=await page.evaluate(()=>Advance(1/60));
  result.settled=await page.evaluate(()=>({state:Advance(1.6),points:Project()}));
  const base=result.initial.state.camera.position,position=result.settled.state.camera.position;
  const distance=p=>Math.hypot(...p.map((v,i)=>v-base[i]));
  assert.ok(distance(result.first.camera.position)>0&&distance(result.first.camera.position)<distance(position)*.3,"Camera must ease, not snap");
  assert.ok(distance(position)/result.initial.state.calibration.environmentScale>.06&&distance(position)/result.initial.state.calibration.environmentScale<.10,
    "Camera movement preserves the reference parallax after metre calibration");
  const movements=result.settled.points.map((p,i)=>p[0]-result.initial.points[i][0]);
  assert.ok(Math.abs(movements[0]-movements[1])>.008,"Near letter and distant map must show different real 3D parallax");
  await page.screenshot({path:path.join(out,"Scene_CommandRoomParallaxRight.png")});
  await page.mouse.move(20,696);await page.evaluate(()=>Advance(1.6));
  await page.screenshot({path:path.join(out,"Scene_CommandRoomParallaxLeft.png")});
  result.reset=await page.evaluate(()=>{document.dispatchEvent(new PointerEvent("pointerleave"));return Advance(2);});
  assert.ok(distance(result.reset.camera.position)<.0001,"Pointer leave returns to authored framing");
  await page.evaluate(()=>{window.active=false;});await page.mouse.move(1200,30);
  assert.deepEqual((await page.evaluate(()=>Advance(1))).parallax.target,[0,0],"Gameplay mode does not receive menu pointer input");
  await page.evaluate(()=>{window.active=true;document.dispatchEvent(new PointerEvent("pointermove",{pointerType:"touch",clientX:1200,clientY:30}));});
  assert.deepEqual((await page.evaluate(()=>room.State())).parallax.target,[0,0],"Touch does not induce hover camera motion");
  await page.emulateMedia({reducedMotion:"reduce"});await page.mouse.move(1000,50);
  result.reduced=await page.evaluate(()=>Advance(1));
  assert.ok(distance(result.reduced.camera.position)<.0001&&result.reduced.parallax.reducedMotion);
  await page.emulateMedia({reducedMotion:"no-preference"});
  result.depth=await page.evaluate(()=>{
    Advance(2);const open=FogEnergy();
    const block=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({color:0}));
    block.position.copy(room.camera.position).add(new THREE.Vector3(0,0,-.3).applyQuaternion(room.camera.quaternion));
    block.quaternion.copy(room.camera.quaternion);room.scene.add(block);room.Render();const occluded=FogEnergy();
    room.scene.remove(block);block.geometry.dispose();block.material.dispose();room.Render();return {open,occluded};
  });
  assert.ok(result.depth.occluded<result.depth.open*.001,"Opaque geometry in front of a beam must stop the ray integral");
  result.shadow=await page.evaluate(()=>{
    const slab=new THREE.Mesh(new THREE.BoxGeometry(2.5,3,.05),new THREE.MeshBasicMaterial({color:0}));
    slab.position.copy(room.atmosphere.volumeMaterial.uniforms.origin.value);slab.position.z+=.06;
    room.scene.add(slab);room.Render();const stale=FogEnergy();room.atmosphere.shadowDirty=true;room.Render();const blocked=FogEnergy();
    room.scene.remove(slab);slab.geometry.dispose();slab.material.dispose();room.atmosphere.shadowDirty=true;room.Render();
    return {stale,blocked};
  });
  assert.ok(result.shadow.stale>100&&result.shadow.blocked<result.shadow.stale*.05,"Window occluder must shadow the volume in light space");
  result.dust=await page.evaluate(()=>{
    const target=room.atmosphere.colorTarget;
    const Read=()=>{const pixels=new Uint16Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);return pixels;};
    room.time=0;room.Render();const first=Read();room.time=10;room.Render();const later=Read();
    room.dust.visible=false;room.Render();const hidden=Read();room.dust.visible=true;
    let movingPixels=0,visiblePixels=0;
    for(let i=0;i<first.length;i+=4){if(Math.abs(THREE.DataUtils.fromHalfFloat(first[i])-THREE.DataUtils.fromHalfFloat(later[i]))>.002)movingPixels++;
      if(Math.abs(THREE.DataUtils.fromHalfFloat(later[i])-THREE.DataUtils.fromHalfFloat(hidden[i]))>.002)visiblePixels++;}
    room.Render();return {movingPixels,visiblePixels};
  });
  assert.ok(result.dust.movingPixels>30&&result.dust.visiblePixels>15,"World-space motes must produce visible moving pixels, not just advance a clock");
  result.optics=await page.evaluate(()=>{
    const Read=()=>{room.Render();const gl=renderer.getContext(),p=new Uint8Array(1280*720*4);gl.readPixels(0,0,1280,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const dof=room.atmosphere.compositeMaterial.uniforms.dof.value,aperture=dof.z;
    const soft=Read();dof.z=0;const sharp=Read();dof.z=aperture;room.Render();
    let changed=0;for(let i=0;i<soft.length;i+=4)if(Math.abs(soft[i]-sharp[i])>2)changed++;
    let glass=null;room.scene.traverse(o=>{if(o.material?.name==='CommandRoomInkGlass')glass={transmission:o.material.transmission,thickness:o.material.thickness,reflection:!!o.material.envMap};});
    return {changed,glass};
  });
  assert.ok(result.optics.changed>200,"Depth of field must affect actual scene pixels");
  assert.ok(result.optics.glass.transmission>.9&&result.optics.glass.thickness>0&&result.optics.glass.reflection,"Bottle uses thick transmitting glass with room reflections");
  result.panelFocus=await page.evaluate(()=>{
    // Freeze animated fog noise so the return comparison measures focus alone.
    const Read=()=>{room.time=10;room.Render();const gl=renderer.getContext(),p=new Uint8Array(1280*720*4);gl.readPixels(0,0,1280,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const EdgeEnergy=p=>{let e=0;for(let y=80;y<640;y++)for(let x=700;x<1150;x++){
      const i=(y*1280+x)*4;e+=Math.abs(p[i]-p[i+4])+Math.abs(p[i]-p[i+1280*4]);}return e;};
    room.dust.visible=false;const title=Read();room.SetMenuMode("levels");
    const entering=Advance(1/60).presentation.panelFocus,half=Advance(.1).presentation.panelFocus;
    room.SetMenuMode("title");const reversing=Advance(1/60).presentation.panelFocus;
    room.SetMenuMode("levels");const reversedAgain=Advance(1/60).presentation.panelFocus;
    Advance(2);const blurred=Read(),settled=room.State().presentation.panelFocus;
    room.SetMenuMode("title");Advance(2);const returned=Read();room.dust.visible=true;
    let changed=0,returnedDifference=0;
    for(let i=0;i<title.length;i+=4){if(Math.abs(title[i]-blurred[i])>2)changed++;returnedDifference+=Math.abs(title[i]-returned[i]);}
    return {entering,half,reversing,reversedAgain,settled,changed,titleEdges:EdgeEnergy(title),panelEdges:EdgeEnergy(blurred),returnedDifference:returnedDifference/(1280*720)};
  });
  const focus=result.panelFocus;
  assert.ok(focus.entering>0&&focus.entering<.15&&focus.half>focus.entering&&focus.half<.8,"Opening a panel eases through intermediate focus values");
  assert.ok(focus.reversing<focus.half&&focus.reversing>0&&focus.reversedAgain>focus.reversing&&focus.reversedAgain<.8,"Rapid reversals continue from the current focus, without a snap");
  assert.ok(focus.changed>50000&&focus.panelEdges<focus.titleEdges*.45,"Secondary background must be visibly softer in the rendered pixels");
  assert.ok(focus.settled>.999&&focus.returnedDifference<.1,"Returning to title restores its original depth of field");
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.equal(await page.evaluate(()=>{room.SetMenuMode("levels");return Advance(1/60).presentation.panelFocus;}),1);
  assert.equal(await page.evaluate(()=>{room.SetMenuMode("title");return Advance(1/60).presentation.panelFocus;}),0);
  await page.emulateMedia({reducedMotion:"no-preference"});
  result.restore=await page.evaluate(()=>{
    const target=new THREE.WebGLRenderTarget(20,16);renderer.setRenderTarget(target);renderer.setViewport(2,3,8,9);
    renderer.setScissor(1,2,3,4);renderer.setScissorTest(true);renderer.autoClear=false;
    renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=.73;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=true;
    room.Render();const v=new THREE.Vector4(),s=new THREE.Vector4();renderer.getViewport(v);renderer.getScissor(s);
    const saved={target:renderer.getRenderTarget()===target,viewport:v.toArray(),scissor:s.toArray(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,exposure:renderer.toneMappingExposure,tone:renderer.toneMapping,shadow:renderer.shadowMap.enabled};
    renderer.setRenderTarget(null);target.dispose();renderer.setScissorTest(false);renderer.autoClear=true;room.Render();return saved;
  });
  assert.deepEqual(result.restore,{target:true,viewport:[2,3,8,9],scissor:[1,2,3,4],scissorTest:true,autoClear:false,exposure:.73,tone:0,shadow:true});
  result.performance=await page.evaluate(()=>{const samples=[];for(let i=0;i<12;i++){const start=performance.now();room.Update(1/60);room.Render();renderer.getContext().finish();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {medianMs:samples[6],p95Ms:samples[11]};});
  result.resized=await page.evaluate(()=>{renderer.setSize(800,600);room.SetMenuMode("levels");Advance(1);return [room.atmosphere.colorTarget.width,room.atmosphere.colorTarget.height,room.atmosphere.volumeTarget.width,room.atmosphere.volumeTarget.height,...room.atmosphere.blurTargets.map(t=>[t.width,t.height]).flat()];});
  assert.deepEqual(result.resized,[800,600,400,300,400,300,400,300]);
  await page.evaluate(()=>room.Dispose());await page.mouse.move(80,80);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,"Data_CommandRoomInteraction.json"),JSON.stringify({...result,errors},null,2));
  console.log("PASS CommandRoom: real mesh parallax, easing/limits/reset, inactive/touch/reduced-motion, visible dust/beam, camera-depth + light-depth occlusion, renderer restore, resize and dispose");
  console.log(JSON.stringify({fog:result.depth,shadow:result.shadow,panelFocus:result.panelFocus,performance:result.performance}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
