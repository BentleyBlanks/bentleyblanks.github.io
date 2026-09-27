import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'tmp/AllyGait/Review');
fs.mkdirSync(output,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1600,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.actorFactory,null,{timeout:300000});
  const report=await page.evaluate(async()=>{
    const T=window.Taierzhuang,THREE=await import('/Taierzhuang1938/vendor/three/build/three.module.js');
    const {InstallAllyGait}=await import('/Taierzhuang1938/Script_AllyGait.mjs');
    T.state.menu=false;T.state.running=false;T.actorFactory.SetBatcher(null);
    for(const id of ['menu','hud','boot'])document.getElementById(id)?.style.setProperty('display','none','important');
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x24282d);
    scene.add(new THREE.HemisphereLight(0xd6e6ff,0x595044,2.4));
    const key=new THREE.DirectionalLight(0xffecd4,3);key.position.set(-3,7,-4);scene.add(key);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x55595c,roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.005;scene.add(ground);
    const specs=[
      {name:'AllyCrouchReady',state:{crouch:1,moveSpeedMps:.85,aim:1},threat:true},
      {name:'AllyCrouchCarry',state:{crouch:1,moveSpeedMps:.85,aim:1}},
      {name:'AllyCarryWalk',state:{moveSpeedMps:1.2,aim:1}},
      {name:'AllyCarryStand',state:{moveSpeedMps:0,aim:1}},
      {name:'AllyCrouchCarryStand',state:{crouch:1,moveSpeedMps:0,aim:1}},
    ];
    const actors=[],rows=[];
    for(const [i,spec] of specs.entries()){
      const actor=T.actorFactory.Create('nra',{seed:8120+i,modelVariant:i%2?4:1,weapon:['ZhongZheng','HanYang','Type38'][i%3]});
      const soldier={actor,targetVisible:spec.threat,targetFromMemory:false,suppression:0};
      await InstallAllyGait(soldier);
      actor.root.position.set((i-2)*1.1,0,0);actor.root.rotation.y=.65;scene.add(actor.root);
      const state={...spec.state,moveSpeed:(spec.state.moveSpeedMps||0)/3.6};
      for(let f=0;f<120;f++)actor.Update(1/60,{...state,elapsed:f/60});
      const rig=actor.characterRig;
      const row={wanted:spec.name,clip:rig.currentId,model:rig.modelId,carryWeight:rig.allyCarryWeight,aimApplied:!!actor.rigAimApplied};
      const travel=new THREE.Vector3(0,0,-1).applyQuaternion(actor.root.quaternion);
      const leans=[],floors=[],grips=[];let contactError=0,contactFrames=0;
      rig.locomotion.ResetContacts();
      for(let f=0;f<65;f++){
        actor.root.position.addScaledVector(travel,(state.moveSpeedMps||0)/60);
        actor.Update(1/60,{...state,elapsed:2+f/60});
        rig.root.updateMatrixWorld(true);
        const hip=rig.bones.pelvis.getWorldPosition(new THREE.Vector3()),neck=rig.bones.neck.getWorldPosition(new THREE.Vector3());
        const delta=neck.sub(hip).applyQuaternion(actor.root.quaternion.clone().invert());
        leans.push(Math.atan2(-delta.z,delta.y)*180/Math.PI);
        let floor=Infinity;
        rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
          const p=new THREE.Vector3();for(let v=0;v<mesh.geometry.attributes.position.count;v++){mesh.getVertexPosition(v,p).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,p.y);}});
        floors.push(floor);
        const grip=rig.Grip('weaponR').getWorldPosition(new THREE.Vector3());
        grips.push(grip.distanceTo(actor.weaponGroup.getWorldPosition(new THREE.Vector3())));
        // Heel landing / toe release intentionally blend the anchor. Measure
        // sliding only while the sole carries full weight, as ActorLocomotionTest does.
        for(const foot of rig.locomotion.feet)if(foot.applied&&foot.weight>.999){
          const toe=foot.toe.getWorldPosition(new THREE.Vector3());
          contactError=Math.max(contactError,Math.hypot(toe.x-foot.anchor.x,toe.z-foot.anchor.z));
          contactFrames++;
        }
      }
      row.lean=[Math.min(...leans),Math.max(...leans)];row.floor=[Math.min(...floors),Math.max(...floors)];
      row.gripMax=Math.max(...grips);
      row.contactError=contactError;
      row.contactFrames=contactFrames;
      // Actual fire must recover a ready action and the aim layer.
      actor.Update(.1,{...state,firing:true,aim:1});
      row.fireClip=rig.currentId;row.fireAim=actor.rigAimApplied;
      for(let f=0;f<120;f++)actor.Update(1/60,{...state,elapsed:5+f/60});
      actor.root.position.set((i-2)*1.1,0,0);rig.locomotion.ResetContacts();
      rows.push(row);actors.push({actor,soldier,state,name:spec.name});
    }
    const camera=new THREE.PerspectiveCamera(34,1600/960,.1,100);
    camera.position.set(0,2.5,-8.2);camera.lookAt(0,.8,0);
    const Draw=(frame)=>{
      for(const entry of actors){
        const rig=entry.actor.characterRig;rig.currentAction.time=rig.currentAction.getClip().duration*frame;
        entry.actor.Update(0,{...entry.state,moveSpeedMps:undefined});
      }
      T.renderer.render(scene,camera);
    };
    window.AllyGaitReview={scene,camera,actors,Draw,T};
    Draw(.20);
    return rows;
  });
  fs.writeFileSync(path.join(output,'Data_AllyGaitBrowser.json'),JSON.stringify({report,errors},null,2));
  await page.screenshot({path:path.join(output,'Gaits_Front.png')});
  for(const phase of [.05,.45,.75]){await page.evaluate(p=>window.AllyGaitReview.Draw(p),phase);await page.screenshot({path:path.join(output,`Gaits_${phase}.png`)});}
  await page.evaluate(()=>{const r=window.AllyGaitReview;r.actors.forEach(e=>e.actor.root.rotation.y=Math.PI/2);r.Draw(.25);});
  await page.screenshot({path:path.join(output,'Gaits_Side.png')});
  console.log(JSON.stringify(report,null,2));
  if(!process.argv.includes('--review-only')){
    assert.deepEqual(errors,[]);
    for(const row of report){
      assert.equal(row.clip,row.wanted);
      assert.ok(row.floor[0]>-.015&&row.floor[1]<.03,row.clip+' ground '+row.floor);
      assert.ok(row.gripMax<.04,row.clip+' right hand contact '+row.gripMax);
      assert.ok(row.contactError<.015,row.clip+' planted-foot drift '+row.contactError);
      if(!row.clip.includes('Stand'))assert.ok(row.contactFrames>20,'full contact exercised');
      if(row.clip.includes('Crouch'))assert.ok(row.lean[0]>12&&row.lean[1]-row.lean[0]<3,row.clip+' stable forward lean');
      if(row.clip.includes('Carry')){assert.ok(row.carryWeight>.99);assert.equal(row.aimApplied,false);assert.ok(!row.fireClip.includes('Carry'));assert.equal(row.fireAim,true);}
    }
  }
  console.log('AllyGaitBrowserTest: passed; '+output);
} finally {await browser.close();await new Promise(r=>server.close(r));}
