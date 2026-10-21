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
      // The fast calm run (Animation/RifleHoldRun): two rifles; the same pace under threat keeps the ready run.
      {name:'RifleHoldRun',state:{moveSpeedMps:3.2,aim:1},weapon:'ZhongZheng',variant:1},
      {name:'RifleHoldRun',state:{moveSpeedMps:3.2,aim:1},weapon:'HanYang',variant:4},
      {name:'RifleRun',state:{moveSpeedMps:3.2,aim:1},threat:true,weapon:'ZhongZheng',variant:1},
      // The shoulder march (Animation/RifleShoulderMarch): a man the shared march layer walks along a route, lane behind him clear.
      // Two rifles; the same pace under threat keeps the ready run; with someone close behind it stays the muzzle-up carry.
      {name:'RifleShoulderMarch',state:{moveSpeedMps:1.3,aim:1},march:true,weapon:'ZhongZheng',variant:1},
      {name:'RifleShoulderMarch',state:{moveSpeedMps:1.3,aim:1},march:true,weapon:'HanYang',variant:4},
      {name:'RifleRun',state:{moveSpeedMps:1.3,aim:1},march:true,threat:true,weapon:'ZhongZheng',variant:1},
      {name:'AllyCarryWalk',state:{moveSpeedMps:1.3,aim:1},march:true,rear:2,weapon:'ZhongZheng',variant:1},
      {name:'AllyCarryWalk',state:{moveSpeedMps:1.3,aim:1},weapon:'ZhongZheng',variant:1},
    ];
    const actors=[],rows=[];
    for(const [i,spec] of specs.entries()){
      const actor=T.actorFactory.Create('nra',{seed:8120+i,modelVariant:spec.variant??(i%2?4:1),weapon:spec.weapon??['ZhongZheng','HanYang','Type38'][i%3]});
      const soldier={actor,targetVisible:spec.threat,targetFromMemory:false,suppression:0};
      await InstallAllyGait(soldier);
      // What the mission and the march layer give a marching man each frame (a fresh command object, the lane behind him).
      const Tick=(dt,st)=>{if(spec.march){soldier.squadMarchCommand={controlled:true,status:'running'};soldier.missionRearGapM=spec.rear??99;}actor.Update(dt,st);};
      const slot=(i-(specs.length-1)/2)*1.1;actor.root.position.set(slot,0,0);actor.root.rotation.y=.65;scene.add(actor.root);
      const state={...spec.state,moveSpeed:(spec.state.moveSpeedMps||0)/3.6};
      for(let f=0;f<120;f++)Tick(1/60,{...state,elapsed:f/60});
      const rig=actor.characterRig;
      const row={wanted:spec.name,clip:rig.currentId,model:rig.modelId,carryWeight:rig.allyCarryWeight,aimApplied:!!actor.rigAimApplied};
      const travel=new THREE.Vector3(0,0,-1).applyQuaternion(actor.root.quaternion);
      const leans=[],floors=[],grips=[];let contactError=0,contactFrames=0;
      const muzzleUp=[],weaponFloors=[],muzzleRise=[],leftOffAxis=[],leftSpan=[],sagittalPitch=[];
      const handTurn=[],muzzleBehind=[],muzzlePitch=[],headInside=[],neckGap=[];let handRest=null;
      const CheckCarry=()=>{
        if(!spec.name.includes('Carry'))return;
        const weapon=actor.weaponGroup;weapon.updateWorldMatrix(true,true);
        muzzleUp.push(new THREE.Vector3(0,0,-1).applyQuaternion(weapon.getWorldQuaternion(new THREE.Quaternion())).y);
        weaponFloors.push(new THREE.Box3().setFromObject(weapon).min.y);
        muzzleRise.push(weapon.localToWorld(actor.weaponMuzzle.clone()).y-rig.Grip('weaponR').getWorldPosition(new THREE.Vector3()).y);
      };
      rig.locomotion.ResetContacts();
      for(let f=0;f<65;f++){
        actor.root.position.addScaledVector(travel,(state.moveSpeedMps||0)/60);
        Tick(1/60,{...state,elapsed:2+f/60});
        rig.root.updateMatrixWorld(true);
        const hip=rig.bones.pelvis.getWorldPosition(new THREE.Vector3()),neck=rig.bones.neck.getWorldPosition(new THREE.Vector3());
        const delta=neck.sub(hip).applyQuaternion(actor.root.quaternion.clone().invert());
        leans.push(Math.atan2(-delta.z,delta.y)*180/Math.PI);
        let floor=Infinity;
        rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
          const p=new THREE.Vector3();for(let v=0;v<mesh.geometry.attributes.position.count;v++){mesh.getVertexPosition(v,p).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,p.y);}});
        floors.push(floor);
        if(spec.name==='RifleHoldRun'){
          // Both hands on the rifle: the left grip lies on the weapon's own axis, the actor's two-hand rule at work.
          const weapon=actor.weaponGroup,right=rig.Grip('weaponR').getWorldPosition(new THREE.Vector3()),left=rig.Grip('weaponL').getWorldPosition(new THREE.Vector3());
          const axis=weapon.localToWorld(actor.weaponGripFront.clone()).sub(weapon.getWorldPosition(new THREE.Vector3())).normalize();
          const arm=left.clone().sub(right);leftOffAxis.push(arm.clone().cross(axis).length());leftSpan.push(arm.length());
          const muzzle=weapon.localToWorld(actor.weaponMuzzle.clone()).sub(weapon.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(actor.root.quaternion.clone().invert());
          sagittalPitch.push(Math.atan2(muzzle.y,-muzzle.z)*180/Math.PI);
        }
        if(spec.name==='RifleShoulderMarch'){
          // The rifle is rigid in the right hand (its turn against the grip stays what it was), its muzzle is behind the man and a
          // little up, and it touches neither the head (inner sphere of the skinned head) nor the neck.
          const weapon=actor.weaponGroup;weapon.updateWorldMatrix(true,true);
          const gripQ=rig.Grip('weaponR').getWorldQuaternion(new THREE.Quaternion()),rel=gripQ.clone().invert().multiply(weapon.getWorldQuaternion(new THREE.Quaternion()));
          handRest??=rel.clone();handTurn.push(rel.angleTo(handRest)*180/Math.PI);
          const muzzle=weapon.localToWorld(actor.weaponMuzzle.clone()).sub(weapon.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(actor.root.quaternion.clone().invert());
          muzzleBehind.push(muzzle.z);muzzlePitch.push(Math.asin(muzzle.y)*180/Math.PI);
          const headBone=rig.bones.head,neckBone=rig.bones.neck,head=[],p=new THREE.Vector3();
          rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;
            const index=mesh.skeleton.bones.indexOf(headBone),att=mesh.geometry.attributes;
            for(let v=0;v<att.position.count;v+=3){let w=0;for(let k=0;k<4;k++)if(att.skinIndex.getComponent(v,k)===index)w+=att.skinWeight.getComponent(v,k);
              if(w>.9){mesh.getVertexPosition(v,p).applyMatrix4(mesh.matrixWorld);head.push(p.clone());}}});
          const centre=head.reduce((a,q)=>a.add(q),new THREE.Vector3()).multiplyScalar(1/head.length);
          const inner=Math.min(...head.map(q=>q.distanceTo(centre)));
          const a=neckBone.getWorldPosition(new THREE.Vector3()),b=headBone.getWorldPosition(new THREE.Vector3()),segment=new THREE.Line3(a,b);
          let inside=0,gap=Infinity;
          weapon.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position,q=new THREE.Vector3(),c=new THREE.Vector3();
            for(let v=0;v<pos.count;v+=4){q.fromBufferAttribute(pos,v).applyMatrix4(mesh.matrixWorld);
              if(q.distanceTo(centre)<inner-.005)inside++;
              segment.closestPointToPoint(q,true,c);gap=Math.min(gap,q.distanceTo(c));}});
          headInside.push(inside);neckGap.push(gap);
        }
        const grip=rig.Grip('weaponR').getWorldPosition(new THREE.Vector3());
        grips.push(grip.distanceTo(actor.weaponGroup.getWorldPosition(new THREE.Vector3())));
        CheckCarry();
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
      // A carry must remain upright through a full turn, not only facing the camera.
      for(let turn=0;turn<24;turn++){
        actor.root.rotation.y=.65+turn*Math.PI/12;rig.locomotion.ResetContacts();
        actor.Update(0,state);CheckCarry();
      }
      actor.root.rotation.y=.65;
      if(leftOffAxis.length){row.leftOffAxisMax=Math.max(...leftOffAxis);row.leftSpan=[Math.min(...leftSpan),Math.max(...leftSpan)];row.sagittalPitch=[Math.min(...sagittalPitch),Math.max(...sagittalPitch)];}
      if(handTurn.length){row.handTurnMax=Math.max(...handTurn);row.muzzleBehindMin=Math.min(...muzzleBehind);row.muzzlePitch=[Math.min(...muzzlePitch),Math.max(...muzzlePitch)];
        row.headInsideMax=Math.max(...headInside);row.neckGapMin=Math.min(...neckGap);row.profile=!!rig.locomotion.profiles.RifleShoulderMarch;}
      if(muzzleUp.length){row.muzzleUpMin=Math.min(...muzzleUp);row.weaponFloor=Math.min(...weaponFloors);row.muzzleRiseMin=Math.min(...muzzleRise);}
      // Actual fire must recover a ready action and the aim layer.
      Tick(.1,{...state,firing:true,aim:1});
      row.fireClip=rig.currentId;row.fireAim=actor.rigAimApplied;
      for(let f=0;f<120;f++)Tick(1/60,{...state,elapsed:5+f/60});
      actor.root.position.set(slot,0,0);rig.locomotion.ResetContacts();
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
  await page.evaluate(()=>{const r=window.AllyGaitReview;r.actors.forEach(e=>e.actor.root.rotation.y=.65);r.camera.position.set(.3,1.7,-2.15);r.camera.lookAt(0,1,0);r.Draw(.25);});
  await page.screenshot({path:path.join(output,'Gaits_Hand.png')});
  console.log(JSON.stringify(report,null,2));
  if(!process.argv.includes('--review-only')){
    assert.deepEqual(errors,[]);
    for(const row of report){
      assert.equal(row.clip,row.wanted);
      if(row.clip==='RifleHoldRun')assert.ok(row.floor[0]>-.015&&row.floor[1]>.03&&row.floor[1]<.3,row.clip+' a run keeps its ground contact and its flight '+row.floor);
      else assert.ok(row.floor[0]>-.015&&row.floor[1]<.03,row.clip+' ground '+row.floor);
      assert.ok(row.gripMax<.04,row.clip+' right hand contact '+row.gripMax);
      assert.ok(row.contactError<.015,row.clip+' planted-foot drift '+row.contactError);
      if(!row.clip.includes('Stand'))assert.ok(row.contactFrames>20,'full contact exercised');
      if(row.clip==='RifleHoldRun'){
        assert.ok(row.lean[0]>15&&row.lean[1]<24&&row.lean[1]-row.lean[0]<4,row.clip+' forward lean '+row.lean);
        assert.ok(row.leftOffAxisMax<.02&&row.leftSpan[0]>.3&&row.leftSpan[1]<.38,row.clip+' left hand on the rifle '+row.leftOffAxisMax+' '+row.leftSpan);
        assert.ok(row.sagittalPitch[0]>38&&row.sagittalPitch[1]<58,row.clip+' muzzle pitch '+row.sagittalPitch);
        assert.equal(row.carryWeight,0,row.clip+' is not a carry (no placed rifle track)');
      }
      if(row.clip==='RifleShoulderMarch'){
        assert.ok(row.profile,'the measured profile is installed');
        // pelvis-to-neck line: the bind posture leans back 3 degrees, so the 6.9 degree trunk lean of the clip reads about 2 here
        assert.ok(row.lean[0]>1&&row.lean[1]<6&&row.lean[1]-row.lean[0]<2,row.clip+' forward lean '+row.lean);
        assert.ok(row.carryWeight>.99,row.clip+' the rifle is placed by the clip ('+row.carryWeight+')');
        assert.equal(row.aimApplied,false,'remembered aim does not lift the shouldered rifle');
        assert.ok(row.handTurnMax<1.5,row.clip+' rifle rigid in the right hand, turn '+row.handTurnMax);
        assert.ok(row.muzzleBehindMin>.3,row.clip+' the muzzle rides behind the man '+row.muzzleBehindMin);
        assert.ok(row.muzzlePitch[0]>0&&row.muzzlePitch[1]<25,row.clip+' muzzle a little up '+row.muzzlePitch);
        assert.equal(row.headInsideMax,0,row.clip+' rifle vertices inside the head');
        assert.ok(row.neckGapMin>.03,row.clip+' rifle clear of the neck '+row.neckGapMin);
        assert.ok(row.fireClip!=='RifleShoulderMarch'&&row.fireAim===true,'fire leaves the march for the ready run: '+row.fireClip);
      }
      if(row.clip.includes('Crouch'))assert.ok(row.lean[0]>12&&row.lean[1]-row.lean[0]<3,row.clip+' stable forward lean');
      if(row.clip.includes('Carry')){
        assert.ok(row.carryWeight>.99);assert.equal(row.aimApplied,false);assert.ok(!row.fireClip.includes('Carry'));assert.equal(row.fireAim,true);
        assert.ok(row.muzzleUpMin>Math.cos(10*Math.PI/180),row.clip+' muzzle remains upward while walking and turning');
        assert.ok(row.weaponFloor>.08,row.clip+' stock clears the ground');
        assert.ok(row.muzzleRiseMin>.5,row.clip+' actual muzzle lies above the hand');
      }
    }
  }
  console.log('AllyGaitBrowserTest: passed; '+output);
} finally {await browser.close();await new Promise(r=>server.close(r));}
