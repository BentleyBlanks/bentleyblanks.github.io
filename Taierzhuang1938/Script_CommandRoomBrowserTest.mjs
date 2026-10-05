import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { CAMPAIGN_ENTRIES } from "./Data_Menu.mjs";
import { COMMAND_ROOM_CAMPAIGN_IDS, COMMAND_ROOM_MAPS, COMMAND_ROOM_LETTERS, CommandRoomPapers } from "./Data_CommandRoomPapers.mjs";

assert.deepEqual(COMMAND_ROOM_CAMPAIGN_IDS, CAMPAIGN_ENTRIES.map(entry => entry.id));
assert.equal(CommandRoomPapers({furthest: 99, cleared: ["CH0_Chuchuan", "CH1_NanLu", "WeaponRange", "CH6_Zuihou"]}).stage, 0);
assert.equal(CommandRoomPapers({cleared: [COMMAND_ROOM_CAMPAIGN_IDS[0], COMMAND_ROOM_CAMPAIGN_IDS[2]]}).stage, 1);
assert.equal(CommandRoomPapers(null).stage, 0);

const project=path.dirname(fileURLToPath(import.meta.url)),out=path.join(project,"_shots/CommandRoom");
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
window.Project=()=>[[-.142,.92,.629],[1.75585,1.8012,-2.297975]].map(p=>new THREE.Vector3(...p).project(room.camera).toArray());
window.FogEnergy=()=>{const t=room.atmosphere.volumeTarget,b=new Uint16Array(t.width*t.height*4);renderer.readRenderTargetPixels(t,0,0,t.width,t.height,b);let total=0;for(let i=0;i<b.length;i+=4)total+=THREE.DataUtils.fromHalfFloat(b[i]);return total;};
window.ready=true;</script>`;
const result={};
try {
  await page.route("**/CommandRoomFixture",route=>route.fulfill({contentType:"text/html",body:fixture}));
  await page.goto(`http://127.0.0.1:${server.address().port}/CommandRoomFixture`);
  await page.waitForFunction(()=>window.ready,{},{timeout:60000});
  result.initial=await page.evaluate(()=>({state:room.State(),points:Project(),fog:FogEnergy()}));
  assert.ok(result.initial.state.meshes>=10&&result.initial.state.triangles>30000);
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
  assert.ok(distance(position)>.06&&distance(position)<.10,"Camera movement stays subtle and bounded");
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
  result.resized=await page.evaluate(()=>{renderer.setSize(800,600);room.Render();return [room.atmosphere.colorTarget.width,room.atmosphere.colorTarget.height,room.atmosphere.volumeTarget.width,room.atmosphere.volumeTarget.height];});
  assert.deepEqual(result.resized,[800,600,400,300]);
  await page.evaluate(()=>room.Dispose());await page.mouse.move(80,80);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,"Data_CommandRoomInteraction.json"),JSON.stringify({...result,errors},null,2));
  console.log("PASS CommandRoom: real mesh parallax, easing/limits/reset, inactive/touch/reduced-motion, visible dust/beam, camera-depth + light-depth occlusion, renderer restore, resize and dispose");
  console.log(JSON.stringify({fog:result.depth,shadow:result.shadow,performance:result.performance}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
