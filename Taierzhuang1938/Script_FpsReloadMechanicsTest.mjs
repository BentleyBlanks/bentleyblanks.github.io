// Independent mechanical checks: complete moving assemblies, real feed travel,
// retained packets, and released geometry staying in world space.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = import.meta.dirname, output = path.join(project, "_shots", "ReloadRealism");
await fs.mkdir(output, {recursive:true});
const server = await ServeRoot(path.resolve(project, ".."), 0);
const browser = await LaunchBrowser(), errors = [];
try {
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`, {timeout:120000});
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, {timeout:240000});
  const report = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const game = window.Taierzhuang, vm = game.viewmodel;
    game.Debug.OpenEditor("firstPerson"); const editor = game.editor.active;
    const failures = [], cases = [];
    const Check = (condition, message) => { if (!condition) failures.push(message); };
    const Input = ammo => ({ammo,ads:0,sprint:0,moveSpeed:0,grounded:true,crouch:0,
      strafe:0,lookDeltaYaw:0,lookDeltaPitch:0,lowAmmo:ammo<=1});
    const Step = (ammo, frames = 1) => { for (let i=0;i<frames;i++) vm.Update(1/60, Input(ammo)); };
    const Point = (object, point) => {
      vm.root.updateWorldMatrix(true,true);
      return vm.rig.group.worldToLocal(object.localToWorld(point.clone()));
    };
    for (const id of ["HanYang","ZhongZheng","Type38"]) for (const remaining of [0,3]) {
      editor.SetWeapon(id); editor.SetPose("hip"); editor.SetView("player"); Step(remaining, 90);
      const body = vm.rig.group.getObjectByName("boltBody");
      Check(!!body, `${id}: complete authored bolt body is missing`);
      vm.root.updateWorldMatrix(true,true);
      const original = body && vm.rig.group.worldToLocal(body.getWorldPosition(new THREE.Vector3()));
      vm.TriggerReload({remainingRounds:remaining});
      if(id!=="HanYang") {
        const expected=5-(remaining-(remaining>0?1:0));
        const geometry=vm.clipProp.userData.rounds.children[0].geometry;
        const single=vm._ReloadRoundGeometry(vm.clipProp.userData.profile,1).cases;
        Check(geometry.index.count===single.index.count*expected,`${id}/${remaining}: charger contains the wrong number of live cartridges`);
      }
      let seated = null, atBack = null, atLoaded = null, returned = null;
      const previous = new THREE.Quaternion(); let tracking = false, maxTurnMismatch = 0;
      const row = {id,remaining,maxSupportWrist:0,maxReach:0,packetPullbackM:0};
      for(let frame=0;vm.action&&frame<500;frame++) {
        Step(remaining); vm.root.updateWorldMatrix(true,true);
        const t = vm.action?.t ?? 1;
        row.maxSupportWrist = Math.max(row.maxSupportWrist,vm.riggedArms.wristBend.l);
        row.maxReach = Math.max(row.maxReach,...Object.values(vm.riggedArms.reachRatio));
        if (t>=.25 && atBack===null && body) atBack=vm.rig.group.worldToLocal(body.getWorldPosition(new THREE.Vector3())).z-original.z;
        if(t>=.107&&t<=.150) {
          const hand = vm.handRight.group.quaternion;
          const turn = vm.rig.parts.bolt.rotation.z;
          if(tracking) maxTurnMismatch=Math.max(maxTurnMismatch,Math.abs(hand.angleTo(previous)-Math.abs(turn-row.previousTurn)));
          previous.copy(hand); row.previousTurn=turn; tracking=true;
        }
        const prop = id==="HanYang"?vm.packetProp:vm.clipProp;
        const loadedAt = id==="HanYang"&&remaining>0?.700:.650;
        if(t>=loadedAt && !atLoaded) {
          const rounds = prop.userData.rounds;
          const points=[];
          rounds.traverse(mesh=>{
            if(!mesh.isMesh)return;
            const positions=mesh.geometry.attributes.position;
            for(let i=0;i<positions.count;i++) points.push(Point(mesh,new THREE.Vector3().fromBufferAttribute(positions,i)));
          });
          atLoaded={maxY:Math.max(...points.map(p=>p.y)),feedY:vm.rig.clipSeat.y};
          Check(atLoaded.maxY<atLoaded.feedY,`${id}/${remaining}: cartridges disappear before entering the feed opening`);
          if(id==="HanYang") seated=prop.position.clone();
        }
        if(id==="HanYang"&&seated&&t<.80) row.packetPullbackM=Math.max(row.packetPullbackM,prop.position.distanceTo(seated));
        if(t>.95&&vm.action) returned=vm.rig.parts.bolt.position.z;
      }
      Check(Math.abs(atBack-vm.rig.boltTravel)<.001,`${id}: the complete bolt body does not travel through the opening`);
      Check(maxTurnMismatch<.002,`${id}: the working palm does not rotate with the bolt handle`);
      Check(row.packetPullbackM<.001,`${id}: the newly inserted packet is pulled back out`);
      Check(returned<.001,`${id}: bolt is not home after closing`);
      row.boltTravelM=atBack;row.loaded=atLoaded;row.turnMismatchRad=maxTurnMismatch;cases.push(row);
    }
    const boltMotion=[];
    for(const id of ["HanYang","ZhongZheng","Type38"]) {
      editor.SetWeapon(id);Step(5,90);vm.TriggerBolt();
      let previous={position:vm.handRight.group.position.clone(),rotation:vm.handRight.group.quaternion.clone()},maxStep=0,maxTurn=0,worstAt=0;
      while(vm.action) {
        Step(5);const hand=vm.handRight.group;
        if(previous) {
          const distance=previous.position.distanceTo(hand.position);
          if(distance>maxStep)worstAt=vm.action?.t??1;
          maxStep=Math.max(maxStep,distance);maxTurn=Math.max(maxTurn,previous.rotation.angleTo(hand.quaternion)*180/Math.PI);
        }
        previous={position:hand.position.clone(),rotation:hand.quaternion.clone()};
      }
      Check(maxStep<.055,`${id}: normal bolt hand jumps ${(maxStep*1000).toFixed(1)} mm at ${worstAt.toFixed(3)}`);
      Check(maxTurn<20,`${id}: normal bolt hand turns ${maxTurn.toFixed(1)} degrees per frame`);
      boltMotion.push({id,maxStep,maxTurn,worstAt});
    }
    const magazines=[];
    for(const remaining of [0,3]) {
      editor.SetWeapon("Zb26");Step(remaining,90);vm.TriggerReload({remainingRounds:remaining});
      let maxCharge=0,tossed=false,stowed=false;
      while(vm.action) {
        Step(remaining);const t=vm.action?.t??1;
        maxCharge=Math.max(maxCharge,Math.abs(vm.rig.parts.bolt.position.z));
        tossed ||= !!vm.action?.tossed;
        if(t>=.40&&t<.43) {
          const mag=vm.rig.parts.magazine;
          if(remaining>0) {
            Check(mag.position.distanceTo(new THREE.Vector3(.15,-.31,.14))<.001,"Zb26: partially loaded magazine is not stowed at the pouch");
            stowed=true;
          }
        }
      }
      Check(maxCharge<1e-6,"Zb26: an already cocked open bolt is charged again after changing magazines");
      Check(remaining>0?stowed&&!tossed:tossed,"Zb26: retain a partly loaded magazine and discard only the empty one");
      magazines.push({remaining,maxCharge,tossed,stowed});
    }
    Check(vm.TriggerCharge(),"Zb26: removing the reload charging stroke disabled manual cocking");
    let manualChargeTravelM=0;
    while(vm.action) {Step(20);manualChargeTravelM=Math.max(manualChargeTravelM,vm.rig.parts.bolt.position.z);}
    Check(manualChargeTravelM>vm.rig.boltTravel*.98,"Zb26: manual cocking no longer uses the full charging stroke");
    // Type 11 takes complete horizontal chargers. Independent vertex bounds
    // catch the previous six vertical clips with disappearing loose rounds.
    const hopper=[];
    for(const remaining of [0,13]) {
      editor.SetWeapon("Type11");Step(remaining,90);vm.TriggerReload({remainingRounds:remaining});
      Check(!!vm.rig.parts.hopperFollower,"Type11: hopper follower is a static cap");
      for(let layer=1;layer<=6;layer++) {
        const target=.27+(layer-1)*.10;
        while(vm.action&&vm.action.t<target)Step(remaining);
        const props=vm.hopperClips.filter(prop=>prop.visible);
        Check(props.length===layer,`Type11: expected ${layer} retained chargers, got ${props.length}`);
        Check(vm.rig.parts.hopperFollower.rotation.x< -1,"Type11: follower must open up and forward before loading");
        Check(vm.riggedArms.operationPose.l?.shape==="hopperFollower"&&vm.riggedArms.contactWeight.l<.01,
          "Type11: left hand must support the spring follower while the right hand loads");
        for(let i=0;i<props.length;i++) {
          const prop=props[i],rounds=prop.userData.rounds,points=[];
          rounds.traverse(mesh=>{if(mesh.isMesh)for(let j=0;j<mesh.geometry.attributes.position.count;j++)
            points.push(Point(mesh,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,j)));});
          const bounds=new THREE.Box3().setFromPoints(points),size=bounds.getSize(new THREE.Vector3());
          Check(size.x>.050&&size.y<.013,"Type11: five-round charger is standing upright");
          Check(rounds.visible&&rounds.position.lengthSq()===0,"Type11: rounds stripped from charger during loading");
          if(i)Check(Math.abs(prop.position.y-props[i-1].position.y-.0131)<1e-5,"Type11: chargers do not form a vertical stack");
        }
        hopper.push({remaining,t:vm.action.t,chargers:props.length});
      }
      while(vm.action)Step(30);
      Step(30);Step(25);
      Check(vm.hopperClips.filter(prop=>prop.visible).length===5,"Type11: empty bottom charger does not advance the stack");
      Check(vm.debris.some(d=>d.alive>0&&d.mesh.userData.debrisKind==="hopperCharger"),"Type11: empty charger does not drop from the hopper bottom");
    }
    editor.SetWeapon("HanYang"); vm.autoBolt=true; Step(2,90);
    vm.TriggerFire();
    let packet=null;
    for(let i=0;i<100;i++) {
      Step(1);
      packet=vm.debris.find(d=>d.alive>0&&d.mesh.userData.debrisKind==="packet");
      if(packet)break;
    }
    Check(!!packet,"HanYang: empty packet does not drop when the final round is chambered");
    let worldError=null;
    if(packet) {
      Check(packet.mesh.geometry===vm.packetProp.userData.body.geometry,"packet drop uses a scaled cartridge stand-in");
      Check(packet.mesh.parent.isScene&&!packet.mesh.userData.foregroundPrepass,"released packet retains foreground depth or zero camera velocity");
      const position=packet.worldPosition.clone(), rotation=game.camera.quaternion.clone(), cameraPosition=game.camera.position.clone();
      game.camera.rotation.y+=.40;game.camera.position.x+=.10;vm._StepDebris(0);
      const actual=packet.mesh.getWorldPosition(new THREE.Vector3());worldError=actual.distanceTo(position);
      Check(worldError<1e-6,"released packet follows the player's view instead of remaining in world space");
      game.camera.quaternion.copy(rotation);game.camera.position.copy(cameraPosition);vm._StepDebris(0);
    }
    return {cases,boltMotion,magazines,manualChargeTravelM,hopper,worldError,failures};
  });
  await fs.writeFile(path.join(output,"Data_Mechanics.json"),JSON.stringify({...report,errors},null,2));
  assert.deepEqual(errors,[],"no page errors");assert.deepEqual(report.failures,[],"rifle mechanical authenticity");
  console.log(`ok firearm mechanisms: ${report.cases.length} empty/partial rifle cycles, ${report.hopper.length} retained hopper layers, complete bolts and world-space release`);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
