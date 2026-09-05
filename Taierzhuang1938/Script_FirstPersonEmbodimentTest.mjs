// Integration acceptance: shipped meshes, live input, look-down body and all guns.
import assert from "node:assert/strict";
import fs from "node:fs";
import { FPS_ARM_LIMITS } from "./Data_FpsArmPoses.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(project, "_shots", "FirstPersonAcceptance");
fs.mkdirSync(output, {recursive:true});
const server = await ServeRoot(path.resolve(project,".."),0);
const browser = await LaunchBrowser();
try {
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:180000});
  await page.addStyleTag({content:"#hud,.hud,.edPanel,.edGear{display:none!important}"});
  const report=await page.evaluate(async()=>{
    const T=window.Taierzhuang;
    const THREE=await import("./vendor/three/build/three.module.js");
    const {WEAPONS}=await import("./Data_Weapons.mjs");
    T.player.health=100;T.player.spawnGrace=999;
    const vm=T.viewmodel; const arms=vm.riggedArms;
    const cases=[],transitions=[];
    for(const weapon of Object.values(WEAPONS).filter(w=>w.ammo&&w.magazine)) {
      vm.Equip(weapon.id);
      const transition={weapon:weapon.id,frames:0,wristMax:0,elbowStepMax:0,gripMax:0};
      const previous={};
      for(const state of ["hip","ads","sprint","return"]){
        for(let frame=0;frame<90;frame++){
          vm.Update(1/60,{ads:state==="ads"?1:0,sprint:state==="sprint"?1:0,grounded:true});
          for(const side of ["r","l"]){
            const elbow=arms._InAnchor(arms.bones[side].forearm,new THREE.Vector3());
            if(state!=="hip"){
              transition.wristMax=Math.max(transition.wristMax,arms.wristBend[side]);
              transition.gripMax=Math.max(transition.gripMax,arms.gripError[side]);
              transition.elbowStepMax=Math.max(transition.elbowStepMax,elbow.distanceTo(previous[side]));
            }
            previous[side]=elbow;
          }
          if(state!=="hip")transition.frames++;
        }
        const values={weapon:weapon.id,state,wristBend:{...arms.wristBend},reach:{...arms.reachRatio},contact:{...arms.gripError},rotation:{...arms.rotationError}};
        values.elbow={};
        for(const side of ["r","l"]){
          const chain=arms.bones[side];
          const shoulder=arms._InAnchor(chain.upperArm,new THREE.Vector3());
          const elbow=arms._InAnchor(chain.forearm,new THREE.Vector3());
          const wrist=arms._InAnchor(chain.hand,new THREE.Vector3());
          values.elbow[side]=THREE.MathUtils.radToDeg(shoulder.sub(elbow).angleTo(wrist.sub(elbow)));
        }
        cases.push(values);
      }
      transitions.push(transition);
    }
    vm.Equip(null);
    T.player.pitch=0; T.player.yaw=0;
    T.Debug.Key("KeyW",true);T.Debug.Key("ShiftLeft",true);
    const samples=[];
    for(let frame=0;frame<75;frame++){
      T.StepFrames(1);
      const hands={};
      for(const side of ["r","l"]){
        const world=arms.gripNodes[side].getWorldPosition(new THREE.Vector3());
        hands[side]={position:world.toArray(),ndc:world.clone().project(T.camera).toArray()};
      }
      samples.push(hands);
    }
    return {cases,transitions,samples,body:!!vm.body,clips:Object.keys(vm.body?.actions||{}),unarmedVisible:arms.root.visible&&!!arms.root.parent};
  });
  await page.screenshot({path:path.join(output,"Scene_UnarmedRun.png")});
  report.armPixels=await page.evaluate(async()=>{
    const T=window.Taierzhuang;
    const THREE=await import("./vendor/three/build/three.module.js");
    const swaps=[];
    const material=new THREE.MeshBasicMaterial({color:0xff0000,toneMapped:false});
    T.viewmodel.riggedArms.root.traverse(node=>{if(node.isMesh){swaps.push([node,node.material]);node.material=material;}});
    T.StepFrames(1);
    const src=document.getElementById("view");
    const canvas=document.createElement("canvas");canvas.width=src.width;canvas.height=src.height;
    const ctx=canvas.getContext("2d");ctx.drawImage(src,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const pixels={r:0,l:0};
    for(let i=0;i<rgba.length;i+=4)if(rgba[i]>70&&rgba[i]-rgba[i+1]>45&&rgba[i]-rgba[i+2]>45){
      pixels[(i/4)%canvas.width<canvas.width/2?"l":"r"]++;
    }
    for(const [node,original]of swaps)node.material=original;
    material.dispose();
    return pixels;
  });
  report.lookDown=[];
  await page.evaluate(()=>{
    const T=window.Taierzhuang;
    T.Debug.Key("KeyW",false);T.Debug.Key("ShiftLeft",false);
    T.player.position.z+=4; // Clear the weapon table for unobstructed look-down evidence.
    T.viewmodel.Equip("HanYang");
  });
  for(const [name,crouch,prone] of [["Stand",0,0],["Crouch",1,0],["Prone",0,1]]){
    const body=await page.evaluate(async({crouch,prone})=>{
      const T=window.Taierzhuang;
      const THREE=await import("./vendor/three/build/three.module.js");
      T.player.pitch=-1.35;
      T.player.stance=prone?"prone":crouch?"crouch":"stand";
      T.StepFrames(45);
      const body=T.viewmodel.body;
      const vertices=[],point=new THREE.Vector3();
      body.root.traverse(node=>{
        if(!node.isSkinnedMesh)return;
        node.skeleton.update();
        for(let i=0;i<node.geometry.attributes.position.count;i++){
          node.getVertexPosition(i,point);point.applyMatrix4(node.matrixWorld);
          vertices.push(point.clone());
        }
      });
      const top=Math.max(...vertices.map(v=>v.y));
      const nearDistance=Math.min(...vertices.map(v=>v.distanceTo(T.camera.position)));
      // The cropped top of the jacket must stay below the screen or behind
      // the eye. Area alone passed while the camera looked into this opening.
      const exposedCollar=prone?0:vertices.filter(v=>v.y>top-0.035).filter(v=>{
        const local=v.clone().applyMatrix4(T.camera.matrixWorldInverse);
        const ndc=v.clone().project(T.camera);
        return local.z < -T.camera.near && Math.abs(ndc.x)<1 && ndc.y>-1 && ndc.y<1;
      }).length;
      return {visible:body.root.visible,pitch:body.root.rotation.x,roll:body.root.rotation.z,position:body.root.position.toArray(),player:T.player.position.toArray(),nearDistance,exposedCollar};
    },{crouch,prone});
    assert.ok(body.visible,"body remains visible");
    assert.equal(body.pitch,0,"looking down never pitches the body");
    assert.equal(body.roll,0,"camera roll never tilts legs");
    assert.equal(body.position[1],body.player[1],"body offset preserves the authored foot height");
    assert.ok(body.nearDistance>0.18,`${name} camera has body clearance (${body.nearDistance} m)`);
    assert.equal(body.exposedCollar,0,`${name} cropped collar stays outside the view`);
    await page.screenshot({path:path.join(output,`Scene_LookDown${name}.png`)});
    const fraction=await page.evaluate(async()=>{
      const T=window.Taierzhuang;
      const THREE=await import("./vendor/three/build/three.module.js");
      const swaps=[],material=new THREE.MeshBasicMaterial({color:0xff0000,toneMapped:false});
      T.viewmodel.body.root.traverse(node=>{if(node.isMesh){swaps.push([node,node.material]);node.material=material;}});
      T.StepFrames(1);
      const src=document.getElementById("view"),canvas=document.createElement("canvas");
      canvas.width=src.width;canvas.height=src.height;
      const ctx=canvas.getContext("2d");ctx.drawImage(src,0,0);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let pixels=0;
      for(let i=0;i<data.length;i+=4)if(data[i]>70&&data[i]-data[i+1]>45&&data[i]-data[i+2]>45)pixels++;
      for(const [node,original]of swaps)node.material=original;
      material.dispose();
      return pixels/(canvas.width*canvas.height);
    });
    report.lookDown.push({name,...body,fraction});
    if(!prone)assert.ok(fraction>0.02,`${name} look-down shows the actual body mesh`);
    assert.ok(fraction<0.4,`${name} body never occludes the entire view`);
  }
  report.bodyTransitions=await page.evaluate(async()=>{
    const T=window.Taierzhuang;
    const THREE=await import("./vendor/three/build/three.module.js");
    const point=new THREE.Vector3(),body=T.viewmodel.body;
    let minClearance=Infinity,maxExtraStep=0,samples=0,worst=null;
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      T.player.yaw=yaw;T.player.stance="stand";T.player.pitch=0;T.StepFrames(45,1/60,false);
      let previous=body.root.position.clone().sub(T.player.position);
      const previousEye=T.camera.position.clone();
      for(const stance of ["crouch","prone","stand"])for(let frame=0;frame<60;frame++){
        T.player.stance=stance;
        T.player.pitch=-1.35*Math.sin(Math.PI*frame/59);
        T.StepFrames(1,1/60,false);
        const offset=body.root.position.clone().sub(T.player.position);
        // The existing prone transition moves both body and eyes quickly.
        // Bound any extra visual jump beyond that continuous camera movement,
        // rather than treating the normal stance transition as a new pop.
        maxExtraStep=Math.max(maxExtraStep,offset.distanceTo(previous)-T.camera.position.distanceTo(previousEye));
        previous=offset;previousEye.copy(T.camera.position);
        if(frame%6)continue;
        // Match the render pass: SkinnedMesh.updateMatrixWorld refreshes its
        // attached bind inverse, which updateWorldMatrix alone does not do.
        body.root.updateMatrixWorld(true);
        body.root.traverse(node=>{
          if(!node.isSkinnedMesh)return;
          node.skeleton.update();
          for(let i=0;i<node.geometry.attributes.position.count;i++){
            node.getVertexPosition(i,point);point.applyMatrix4(node.matrixWorld);
            const distance=point.distanceTo(T.camera.position);
            if(distance<minClearance){
              minClearance=distance;
              worst={stance,frame,yaw,pitch:T.player.pitch,blend:{...T.player.stanceBlend},eye:T.camera.position.toArray(),vertex:point.toArray()};
            }
          }
        });
        samples++;
      }
    }
    return {minClearance,maxExtraStep,samples,worst};
  });
  fs.writeFileSync(path.join(output,"Data_Acceptance.json"),JSON.stringify({...report,errors},null,2));
  assert.ok(report.bodyTransitions.minClearance>0.12,`changing stance and looking down keeps the eye outside the body: ${JSON.stringify(report.bodyTransitions)}`);
  assert.ok(report.bodyTransitions.maxExtraStep<0.02,"looking down adds no abrupt body jump beyond the stance motion");
  assert.ok(await page.evaluate(()=>{
    const T=window.Taierzhuang;
    T.viewmodel.root.visible=false;T.StepFrames(1);
    const visible=T.viewmodel.body.root.visible;
    T.viewmodel.root.visible=true;
    return visible;
  }),"stowing the weapon for occupied hands keeps the owner's body visible");
  assert.deepEqual(errors,[],"no page errors");
  assert.ok(report.body && report.unarmedVisible,"body and empty hands are loaded");
  assert.ok(["Idle","Walk","Run","Crouch","Prone"].every(n=>report.clips.includes(n)),"all Blender body clips imported");
  for(const side of ["r","l"]){
    assert.ok(report.armPixels[side]>700,`${side} empty-hand skin really appears (${report.armPixels[side]} pixels)`);
    const points=report.samples.slice(30).map(s=>s[side].ndc);
    assert.ok(points.some(p=>Math.abs(p[0])<1&&Math.abs(p[1])<1),`${side} hand visible while running`);
    assert.ok(Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))>0.06,`${side} running hand actually swings`);
  }
  for(const entry of report.cases)for(const side of ["r","l"]){
    assert.ok(entry.contact[side]<0.006,`${entry.weapon} ${entry.state} ${side} contact ${entry.contact[side]}`);
    assert.ok(entry.wristBend[side]<FPS_ARM_LIMITS.wristBendDeg,`${entry.weapon} ${entry.state} ${side} wrist bend ${entry.wristBend[side]}`);
    assert.ok(entry.elbow[side]>15&&entry.elbow[side]<175,`${entry.weapon} ${entry.state} ${side} elbow singularity`);
  }
  for(const entry of report.transitions){
    assert.ok(entry.wristMax<FPS_ARM_LIMITS.wristBendDeg,`${entry.weapon} transition wrist ${entry.wristMax}`);
    assert.ok(entry.gripMax<FPS_ARM_LIMITS.positionResidualM,`${entry.weapon} transition keeps the grip`);
    assert.ok(entry.elbowStepMax<0.08,`${entry.weapon} elbow jumps ${entry.elbowStepMax} m in one frame`);
  }
  console.log(`ok First-person embodiment: ${report.cases.length} gun poses, ${report.transitions.reduce((n,t)=>n+t.frames,0)} transition frames, bilateral unarmed sprint, 3 look-down stances`);
  console.log(`Screenshots: ${output}`);
} finally {await browser.close();server.close();}
