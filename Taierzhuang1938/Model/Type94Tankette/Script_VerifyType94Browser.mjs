// Real exported GLB movement / aperture checks against the local review page.
// Run with --url=http://127.0.0.1:8114/tmp/Type94Review/ --out=<local JSON>.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}));
const moduleRoot=process.env.TYPE94_NODE_MODULES||'C:/Users/Bentl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
let chromium;try{({chromium}=await import('playwright-core'))}catch{({chromium}=await import(pathToFileURL(path.join(moduleRoot,'playwright-core/index.mjs'))))}
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio','--disable-dev-shm-usage']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(args['--url']||'http://127.0.0.1:8114/tmp/Type94Review/');
  await page.waitForFunction(()=>window.Type94Review?.ready,undefined,{timeout:90000});
  const report=await page.evaluate(async({geometryOnly})=>{
    const THREE=await import('/Taierzhuang1938/vendor/three/build/three.module.js');
    const r=window.Type94Review,m=r.mechanism,p=r.data.path; r.freezeControls=true;
    const glb=await(await fetch(new URL('Model_Type94Tankette.glb',location.href))).arrayBuffer();
    const jsonSize=new DataView(glb).getUint32(12,true);
    const source=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,jsonSize)));
    const sourceNodes=new Map(source.nodes.map(node=>[node.name,node]));
    const checks=[];
    const Check=(condition,label,detail)=>checks.push({check:label,passed:Boolean(condition),detail});
    const flange=r.Find('Geometry_MachineGunFixedMount_Paint');
    if(m.gunYaw){
      const restYaw=m.gunYaw.quaternion.clone(),restGun=m.gun.quaternion.clone();
      r.asset.updateMatrixWorld(true);
      const fixedPose=flange.matrixWorld.clone(),hullPose=r.Find('Hull').matrixWorld.clone();
      const center=m.gun.getWorldPosition(new THREE.Vector3());
      Check(m.gun.parent===m.gunYaw&&m.gunYaw.parent===m.turret,'gun horizontal and elevation pivots are nested under the turret');
      Check(m.gunYaw.getWorldPosition(new THREE.Vector3()).distanceTo(center)<1e-7,'both actual gun axes share one ball centre');
      Check(m.gunYaw.userData.GunTraverseLimitsInferred===true,'independent gun traverse stops remain explicitly inferred');
      const steel=r.Find('Geometry_MachineGunPitch_Steel'),vertices=steel.geometry.getAttribute('position');
      let muzzle=new THREE.Vector3(),forward=Infinity;
      for(let i=0;i<vertices.count;i++){const point=new THREE.Vector3().fromBufferAttribute(vertices,i);if(point.z<forward){forward=point.z;muzzle.copy(point)}}
      const restTip=steel.localToWorld(muzzle.clone()),radius=restTip.distanceTo(center);
      for(const horizontal of[-8,8])for(const elevation of[-10,0,20]){
        m.SetGunTraverse(horizontal*Math.PI/180);m.SetGunElevation(elevation*Math.PI/180);r.asset.updateMatrixWorld(true);
        const tip=steel.localToWorld(muzzle.clone()),actualCenter=m.gun.getWorldPosition(new THREE.Vector3());
        Check(flange.matrixWorld.equals(fixedPose)&&r.Find('Hull').matrixWorld.equals(hullPose),'two-axis aim leaves fixed socket and hull still at '+horizontal+','+elevation);
        Check(actualCenter.distanceTo(center)<1e-7&&Math.abs(tip.distanceTo(center)-radius)<1e-6&&tip.distanceTo(restTip)>.025,'actual barrel tip follows a rigid arc about the ball at '+horizontal+','+elevation);
      }
      m.SetGunTraverse(99);Check(Math.abs(m.gunYaw.rotation.y-8*Math.PI/180)<1e-7,'positive gun stop clamps outside the demonstrated range');
      m.SetGunTraverse(-99);Check(Math.abs(m.gunYaw.rotation.y+8*Math.PI/180)<1e-7,'negative gun stop clamps outside the demonstrated range');
      m.SetGunTraverse(0);m.SetHatch('DriverRoof',.25);m.SetGunTraverse(.1);
      Check(m.gunYaw.rotation.y===0,'open driver roof holds horizontal gun aim in the demonstrated safe pose');
      m.SetHatch('DriverRoof',0);m.gunYaw.quaternion.copy(restYaw);m.gun.quaternion.copy(restGun);r.asset.updateMatrixWorld(true);
    }
    if(flange?.userData.MgFlangeFastenerPatternRequired){
      r.asset.updateMatrixWorld(true);
      const spec=flange.userData,normal=new THREE.Vector3(0,0,-1).transformDirection(flange.matrixWorld);
      Check(spec.MgFlangeFastenerCount===6&&spec.MgFlangeHeadSectionSides===6&&spec.MgFlangeSectionDimensionsInferred===true,'selected six-head flange and inferred sections are declared');
      for(const degrees of [0,60,120,180,240,300,90,270]){
        const angle=degrees*Math.PI/180,front=spec.MgFlangeHeadCenterYLocalM+spec.MgFlangeHeadDepthM/2;
        const target=flange.localToWorld(new THREE.Vector3(spec.MgFlangeBoltCircleRadiusM*Math.cos(angle),spec.MgFlangeBoltCircleRadiusM*Math.sin(angle),-front));
        const hit=new THREE.Raycaster(target.clone().addScaledVector(normal,.02),normal.clone().negate(),0,.06).intersectObject(flange,true)[0];
        Check(Boolean(hit)&&(degrees===90||degrees===270?hit.distance>.023:Math.abs(hit.distance-.02)<2e-5),
          (degrees===90||degrees===270?'old phantom head is absent at ':'actual hex head face is visible at ')+degrees,{distanceM:hit?.distance});
      }
    }
    if(m.gun.userData.MgRoundOpeningRequired){
      r.asset.updateMatrixWorld(true);
      const spec=m.gun.userData,c=spec.MgRoundOpeningCenterLocalM;
      const center=m.gun.localToWorld(new THREE.Vector3(c[0],c[2],-c[1]));
      const outward=new THREE.Vector3(0,0,-1).transformDirection(m.gun.matrixWorld),right=new THREE.Vector3(1,0,0).transformDirection(m.gun.matrixWorld),up=new THREE.Vector3(0,1,0).transformDirection(m.gun.matrixWorld),moving=[];
      m.gun.traverse(node=>{if(node.isMesh)moving.push(node)});
      const Hits=(x,z)=>new THREE.Raycaster(center.clone().addScaledVector(right,x).addScaledVector(up,z).addScaledVector(outward,.12),outward.clone().negate(),0,.25).intersectObjects(moving,false);
      for(const x of[-.004,0,.004])for(const z of[-.004,0,.004])Check(Hits(x,z).length===0,'actual round gun opening has no black-disk substitute at '+x+','+z);
      const radius=spec.MgRoundOpeningRadiusM;
      for(let i=0;i<16;i++){
        const a=i*Math.PI*2/16,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
        Check(Hits(x*.9,z*.9).length===0,'declared round aperture inner rim is open at '+i);
        Check(Hits(x*1.1,z*1.1).length>0,'declared round aperture outer rim retains metal at '+i);
      }
      for(const[x,z]of[[-radius-.005,0],[radius+.005,0],[0,radius+.005],[0,-radius-.005]])Check(Hits(x,z).length>0,'actual ball metal surrounds the round gun opening at '+x+','+z);
      Check(spec.MgRoundOpeningDimensionsInferred===true&&spec.MgRoundOpeningFunctionAccepted===false,'actual round opening retains inferred section and unverified function');
      if(spec.MgFrontRaisedFittingRequired){
        const points=spec.MgFrontRaisedFittingFrontProbePointsLocalM;
        for(let i=0;i<points.length;i+=3){
          const point=m.gun.localToWorld(new THREE.Vector3(points[i],points[i+2],-points[i+1]));
          const hit=new THREE.Raycaster(point.clone().addScaledVector(outward,.02),outward.clone().negate(),0,.08).intersectObjects(moving,false)[0];
          Check(Boolean(hit)&&Math.abs(hit.distance-.02)<2e-5,'actual raised fitting front surface at probe '+i/3,{distanceM:hit?.distance});
        }
        Check(spec.MgFrontRaisedFittingDepthInferred===true&&spec.MgFrontRaisedFittingFunctionAccepted===false&&spec.MgFrontRaisedFittingIndependentMotion===false,'raised fitting depth and unknown function remain qualified');
      }
    }
    if(m.turret.userData.MgSocketOpeningRequired){
      const spec=m.turret.userData,c=spec.MgSocketOpeningCenterLocalM;
      const center=m.turret.localToWorld(new THREE.Vector3(c[0],c[2],-c[1])),outward=new THREE.Vector3(0,0,-1).transformDirection(m.turret.matrixWorld),right=new THREE.Vector3(1,0,0).transformDirection(m.turret.matrixWorld),up=new THREE.Vector3(0,1,0).transformDirection(m.turret.matrixWorld),shell=r.Find('Geometry_TurretYaw_Paint');
      const Hits=(x,z)=>new THREE.Raycaster(center.clone().addScaledVector(right,x).addScaledVector(up,z).addScaledVector(outward,.24),outward.clone().negate(),0,.5).intersectObject(shell,true);
      for(const x of[-.06,0,.06])for(const z of[-.06,0,.06])Check(Hits(x,z).length===0,'actual turret front socket is open at '+x+','+z);
      const radius=spec.MgSocketOpeningRadiusM;
      for(const[x,z]of[[-radius-.025,0],[radius+.025,0],[0,radius+.025],[0,-radius-.025]])Check(Hits(x,z).length>0,'actual turret armor remains around socket at '+x+','+z);
    }
    const Capture=side=>m.sides[side].links.map(node=>[node.position.toArray(),node.quaternion.toArray()]);
    const turretRearFixed=r.asset.getObjectByName('TurretRearHingeFixed');
    if(m.turret.userData.TurretRearRequired){
      Check(Boolean(m.hatches.TurretRear&&turretRearFixed),'reference-required turret rear hatch is available to the controller');
    }
    if(m.hatches.TurretRear&&turretRearFixed){
      for(const name of Object.keys(m.hatches))m.SetHatch(name,0);
      m.SetTurretYaw(0);
      r.asset.updateMatrixWorld(true);
      const door=m.hatches.TurretRear,mesh=r.Find('Geometry_Hatch_TurretRear_Paint');
      const fixedMatrix=turretRearFixed.matrixWorld.clone(),closedMatrix=door.matrixWorld.clone();
      const pin=door.getWorldPosition(new THREE.Vector3()),axis=new THREE.Vector3(0,1,0).transformDirection(door.matrixWorld);
      const center=m.turret.userData.TurretRearOpeningCenterM;
      const localCenter=new THREE.Vector3(center[0],center[2],-center[1]);
      const mouth=m.turret.localToWorld(localCenter.clone());
      const outward=new THREE.Vector3(0,0,1).transformDirection(m.turret.matrixWorld);
      const origin=mouth.clone().addScaledVector(outward,.08),direction=outward.clone().negate();
      const cast=()=>new THREE.Raycaster(origin,direction,0,1.2).intersectObject(r.asset,true)[0];
      const closedHit=cast();
      Check(closedHit?.object===mesh&&closedHit.distance<.10,'closed curved rear panel really covers its aperture',
        {firstHit:closedHit?.object.name,distanceM:closedHit?.distance});
      const positions=mesh.geometry.attributes.position;let local=null,closed=null;
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i),world=mesh.localToWorld(point.clone());
        if(!closed||world.x>closed.x){local=point;closed=world}
      }
      m.SetHatch('TurretRear',.70);r.asset.updateMatrixWorld(true);
      const opened=mesh.localToWorld(local.clone()),hit=cast();
      Check(opened.clone().sub(closed).dot(outward)>.12,'curved turret rear door opens outward at its free edge',
        {closed:closed.toArray(),opened:opened.toArray()});
      Check(Math.abs(opened.clone().sub(pin).dot(axis)-closed.clone().sub(pin).dot(axis))<1e-7,
        'curved turret rear door preserves position along the real inclined pin axis');
      Check(!hit||hit.distance>.30,'open turret rear hatch exposes a real hole through shell and seal',
        {firstHit:hit?.object.name,distanceM:hit?.distance});
      Check(turretRearFixed.matrixWorld.elements.every((v,i)=>Math.abs(v-fixedMatrix.elements[i])<1e-9),
        'curved turret rear hatch fixed pins and feet remain stationary');
      m.SetHatch('TurretRear',0);r.asset.updateMatrixWorld(true);
      Check(door.matrixWorld.elements.every((v,i)=>Math.abs(v-closedMatrix.elements[i])<1e-7),
        'curved turret rear hatch returns to its exact curved closed pose');
      m.SetTurretYaw(Math.PI);m.SetHatch('TurretRear',.75);
      Check(m.turretRearOpen&&Math.abs(m.turret.rotation.y)<1e-9,
        'opening the rear hatch returns the turret to its verified forward clearance pose');
      m.SetTurretYaw(Math.PI*.8);
      Check(Math.abs(m.turret.rotation.y)<1e-9,'rear-hatch clearance guard holds the turret forward while open');
      m.SetHatch('TurretRear',0);m.SetTurretYaw(.3);
      Check(!m.turretRearOpen&&Math.abs(m.turret.rotation.y-.3)<1e-9,
        'closing the rear hatch restores independent turret yaw');
      m.SetTurretYaw(0);r.asset.updateMatrixWorld(true);
    }
    const sight=m.hatches.DriverVisor.userData.SightOuterCenterLocalM;
    if(sight){
      for(const name of Object.keys(m.hatches))m.SetHatch(name,0);
      r.asset.updateMatrixWorld(true);
      const visor=m.hatches.DriverVisor,n=visor.userData.SightNormalLocalM;
      const mouth=visor.localToWorld(new THREE.Vector3(sight[0],sight[2],-sight[1]));
      const normal=new THREE.Vector3(n[0],n[2],-n[1]).transformDirection(visor.matrixWorld);
      const view=mouth.clone().sub(r.camera.position).normalize();
      for(const [label,origin,direction]of[
        ['normal',mouth.clone().addScaledVector(normal,.04),normal.clone().negate()],
        ['horizontal',mouth.clone().add(new THREE.Vector3(0,0,-.04)),new THREE.Vector3(0,0,1)],
        ['reference',mouth.clone().addScaledVector(view,-.04),view]]){
        const hit=new THREE.Raycaster(origin,direction,0,1).intersectObject(r.asset,true)[0];
        Check(!hit||hit.distance>.055,'closed driver sight slit remains open from '+label+' view',
          {firstHitDistanceM:hit?.distance??null,firstHit:hit?.object.name??null});
      }
    }
    const commanderFixed=r.asset.getObjectByName('CommanderHingeFixed');
    if(commanderFixed){
      for(const name of Object.keys(m.hatches))m.SetHatch(name,0);
      r.asset.updateMatrixWorld(true);
      const commander=m.hatches.Commander,mesh=r.asset.getObjectByName('Geometry_Hatch_Commander_Paint');
      const positions=mesh.geometry.attributes.position;
      let local=null,closed=null;
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i),world=mesh.localToWorld(point.clone());
        if(!closed||world.z>closed.z){local=point;closed=world}
      }
      const pin=commander.getWorldPosition(new THREE.Vector3()),axis=new THREE.Vector3(1,0,0).transformDirection(commander.matrixWorld);
      const fixedMatrix=commanderFixed.matrixWorld.clone();
      Check(commanderFixed.parent===m.turret&&mesh.parent===commander,
        'commander fixed bearings and moving lid have distinct rigid owners');
      m.SetHatch('Commander',.65);r.asset.updateMatrixWorld(true);
      const opened=mesh.localToWorld(local.clone());
      Check(opened.y>closed.y+.30&&opened.z<closed.z-.20,
        'commander lid rear edge rises and moves toward the vehicle front',
        {closed:closed.toArray(),opened:opened.toArray()});
      Check(Math.abs(opened.clone().sub(pin).dot(axis)-closed.clone().sub(pin).dot(axis))<1e-7,
        'commander opening preserves position along the actual pin axis');
      Check(commanderFixed.matrixWorld.elements.every((v,i)=>Math.abs(v-fixedMatrix.elements[i])<1e-9),
        'commander fixed pins and bearing eyes remain stationary');
      m.SetHatch('Commander',0);r.asset.updateMatrixWorld(true);
      Check(mesh.localToWorld(local.clone()).distanceTo(closed)<1e-7,'commander lid returns to its exact closed pose');
    }
    if(m.rearLatch){
      for(const name of Object.keys(m.hatches))m.SetHatch(name,0);r.asset.updateMatrixWorld(true);
      const door=m.hatches.RearCargo,latch=m.rearLatch,release=door.userData.LatchReleaseFraction;
      const closedDoor=door.matrixWorld.clone(),closedLatch=latch.matrixWorld.clone();
      const fixed=r.Find('RearDoorHingeFixed'),keeper=r.Find('RearDoorLatchKeeperFixed');
      const fixedMatrix=fixed.matrixWorld.clone(),keeperMatrix=keeper.matrixWorld.clone();
      const hull=r.Find('Hull');
      if(hull.userData.RearArmorInclinedRequired){
        const degrees=hull.userData.RearArmorSlopeDegrees,angle=degrees*Math.PI/180,anchor=hull.userData.RearArmorTopAnchorBeforeGroundM;
        const normalB=hull.userData.RearArmorNormalBeforeGroundM;
        const normal=new THREE.Vector3(normalB[0],normalB[2],-normalB[1]).transformDirection(hull.matrixWorld);
        const axis=new THREE.Vector3(0,1,0).transformDirection(door.matrixWorld),up=new THREE.Vector3(0,1,0).transformDirection(hull.matrixWorld);
        Check(Math.abs(Math.acos(Math.min(1,Math.abs(axis.dot(up))))-angle)<1e-6&&Math.abs(axis.dot(normal))<1e-6,
          'rear cargo door uses the actual inclined side-edge axis of its armor plane');
        const body=r.Find('Geometry_Hull_Paint');
        for(const z of [.50,.90]){
          const y=anchor[1]+Math.tan(angle)*(z-anchor[2]);
          const target=hull.localToWorld(new THREE.Vector3(.48,z,-y));
          const hit=new THREE.Raycaster(target.clone().addScaledVector(normal,.20),normal.clone().negate(),0,.50).intersectObject(body,true)[0];
          const actualNormal=hit?.face?.normal.clone().transformDirection(body.matrixWorld);
          Check(hit&&hit.point.distanceTo(target)<2e-5&&actualNormal.dot(normal)>.999,
            'actual inclined rear armor is seated at the declared plane at height '+z,
            {surfaceErrorM:hit?.point.distanceTo(target),normalDot:actualNormal?.dot(normal)});
        }
        if(hull.userData.RearCornerSealRequired){
          const points=hull.userData.RearCornerSealProbePointsBeforeGroundM;
          for(let i=0;i<points.length;i+=3){
            const target=hull.localToWorld(new THREE.Vector3(points[i],points[i+2],-points[i+1]));
            const hit=new THREE.Raycaster(target.clone().addScaledVector(normal,.20),normal.clone().negate(),0,.50).intersectObject(body,true)[0];
            Check(hit&&hit.point.distanceTo(target)<2e-5,'rear armor and upper side sheet have a real closed corner '+i/3,
              {surfaceErrorM:hit?.point.distanceTo(target)});
          }
        }
      }
      m.SetHatch('RearCargo',release/2);r.asset.updateMatrixWorld(true);
      Check(door.matrixWorld.elements.every((v,i)=>Math.abs(v-closedDoor.elements[i])<1e-9)&&latch.quaternion.angleTo(m.rearLatchRestQuaternion)>.7,
        'rear latch turns while the cargo door remains closed during release');
      m.SetHatch('RearCargo',release);r.asset.updateMatrixWorld(true);
      Check(door.matrixWorld.elements.every((v,i)=>Math.abs(v-closedDoor.elements[i])<1e-9)&&Math.abs(latch.quaternion.angleTo(m.rearLatchRestQuaternion)-Math.PI/2)<1e-7,
        'rear latch completes its quarter turn before the door opens');
      const mesh=r.Find('Geometry_Hatch_RearCargo_Paint'),positions=mesh.geometry.attributes.position;
      let local=null,edge=null;
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i),world=mesh.localToWorld(point.clone());
        if(!edge||world.x<edge.x){local=point;edge=world}
      }
      m.SetHatch('RearCargo',.65);r.asset.updateMatrixWorld(true);const opened=mesh.localToWorld(local.clone());
      Check(opened.z>edge.z+.25&&opened.x>edge.x+.12,'rear cargo door opens outward about its actual hinge',
        {closed:edge.toArray(),opened:opened.toArray()});
      Check(Math.abs(latch.quaternion.angleTo(m.rearLatchRestQuaternion)-Math.PI/2)<1e-7,'rear latch remains released while the door opens');
      Check(fixed.matrixWorld.elements.every((v,i)=>Math.abs(v-fixedMatrix.elements[i])<1e-9)&&keeper.matrixWorld.elements.every((v,i)=>Math.abs(v-keeperMatrix.elements[i])<1e-9),
        'rear hinge frame and latch keeper remain fixed');
      m.SetHatch('RearCargo',0);r.asset.updateMatrixWorld(true);
      Check(door.matrixWorld.elements.every((v,i)=>Math.abs(v-closedDoor.elements[i])<1e-7)&&latch.matrixWorld.elements.every((v,i)=>Math.abs(v-closedLatch.elements[i])<1e-7),
        'rear door and latch return to their exact closed locked poses');
      const center=latch.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(0,0,-1).transformDirection(latch.matrixWorld);
      const boreSpan=door.userData.ConcealedLatchInferred ? .15 : .05;
      const bore=new THREE.Raycaster(center.clone().addScaledVector(direction,-boreSpan),direction,0,boreSpan*2).intersectObject(mesh,true)[0];
      Check(!bore,'rear latch spindle passes through a real door and fixed-bearing bore');
      if(door.userData.RearDoorFaceRequired){
        const hull=r.Find('Hull'),pointB=door.userData.ObservationHoleBeforeGroundM;
        const point=hull.localToWorld(new THREE.Vector3(pointB[0],pointB[2],-pointB[1]));
        const normalB=hull.userData.RearArmorNormalBeforeGroundM;
        const normal=new THREE.Vector3(normalB[0],normalB[2],-normalB[1]).transformDirection(hull.matrixWorld);
        const right=new THREE.Vector3(1,0,0).transformDirection(door.matrixWorld),up=new THREE.Vector3(0,1,0).transformDirection(door.matrixWorld);
        for(const x of [-.006,0,.006])for(const z of [-.006,0,.006]){
          const origin=point.clone().addScaledVector(right,x).addScaledVector(up,z).addScaledVector(normal,.08);
          Check(!new THREE.Raycaster(origin,normal.clone().negate(),0,.16).intersectObject(mesh,true)[0],
            'observed rear hole remains physically open at '+x+','+z);
        }
        const [width,height]=door.userData.ObservationHoleWidthHeightM;
        for(const [label,offset]of [['left',right.clone().multiplyScalar(-width/2-.004)],['right',right.clone().multiplyScalar(width/2+.004)],
                                  ['top',up.clone().multiplyScalar(height/2+.004)],['bottom',up.clone().multiplyScalar(-height/2-.004)]]){
          Check(Boolean(new THREE.Raycaster(point.clone().add(offset).addScaledVector(normal,.08),normal.clone().negate(),0,.16).intersectObject(mesh,true)[0]),
            'actual rear door surrounds the observed hole at '+label);
        }
        Check(door.userData.ExteriorSphericalGripPresent===false&&door.userData.ObservedFittingFunctionsAccepted===false
              &&door.userData.BottomAssemblyIndependentMotion===false&&door.userData.ConcealedLatchInferred===true,
          'unknown exterior fitting functions remain static and the internal lock remains inferred');
      }
    }
    const sidePorts=['DriverPortLeft','TurretPortLeft','TurretPortRight'];
    if(m.hatches.DriverPortRight)sidePorts.push('DriverPortRight');
    for(const name of sidePorts){
      const port=m.hatches[name],fixed=r.asset.getObjectByName(port?.userData.FixedHingeOwner);
      if(!fixed)continue;
      for(const hatch of Object.keys(m.hatches))m.SetHatch(hatch,0);
      r.asset.updateMatrixWorld(true);
      const mesh=r.asset.getObjectByName('Geometry_Hatch_'+name+'_Paint'),positions=mesh.geometry.attributes.position;
      const pin=port.getWorldPosition(new THREE.Vector3()),side=name.endsWith('Left')?-1:1;
      const normal=new THREE.Vector3(side,0,0).transformDirection(port.matrixWorld),axis=new THREE.Vector3(0,0,-1).transformDirection(port.matrixWorld);
      let local=null,closed=null;
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i),world=mesh.localToWorld(point.clone());
        if(!closed||world.y<closed.y){local=point;closed=world}
      }
      const fixedMatrix=fixed.matrixWorld.clone(),initialProjection=closed.clone().sub(pin).dot(axis);
      m.SetHatch(name,.65);r.asset.updateMatrixWorld(true);const opened=mesh.localToWorld(local.clone());
      Check(opened.clone().sub(closed).dot(normal)>.045&&opened.y>closed.y+.025,
        name+' lower edge opens outward and upward about its side pin',
        {closed:closed.toArray(),opened:opened.toArray()});
      Check(Math.abs(opened.clone().sub(pin).dot(axis)-initialProjection)<1e-7,
        name+' opening preserves position along the actual pin axis');
      Check(fixed.matrixWorld.elements.every((v,i)=>Math.abs(v-fixedMatrix.elements[i])<1e-9),name+' fixed pin assembly stays stationary');
      m.SetHatch(name,0);r.asset.updateMatrixWorld(true);
      Check(mesh.localToWorld(local.clone()).distanceTo(closed)<1e-7,name+' returns to its exact closed pose');
      const center=port.userData.CoverCenterInMountM,[width,height,thickness]=port.userData.CoverSizeM;
      const base=port.parent,top=center[2]+height/2;
      const outside=new THREE.Vector3(side,0,0).transformDirection(base.matrixWorld);
      const lowerFractions=port.userData.CoverFastenerCrossFractions??[-.11,.11];
      const lowerDown=port.userData.CoverFastenerDownFraction??.78;
      for(const fraction of lowerFractions){
        const point=base.localToWorld(new THREE.Vector3(center[0]+side*thickness/2,top-lowerDown*height,-fraction*width));
        const hit=new THREE.Raycaster(point.clone().addScaledVector(outside,.025),outside.clone().negate(),0,.04).intersectObject(port,true)[0];
        Check(Boolean(hit&&hit.distance<.021),name+' lower fastener is exposed above the actual outside lid face',
          {crossFraction:fraction,firstDistanceM:hit?.distance??null});
      }
      const rodCross=port.userData.EdgeFittingCrossFraction??-.41;
      const rodEnds=port.userData.EdgeFittingDownFractions??[.27,.49];
      Check(lowerFractions.length===2&&lowerFractions.every(value=>Number.isFinite(value)&&Math.abs(value)<.5)&&
        Number.isFinite(lowerDown)&&lowerDown>0&&lowerDown<1&&rodEnds.length===2&&rodEnds.every(Number.isFinite)&&
        rodEnds[0]>0&&rodEnds[1]>rodEnds[0]&&rodEnds[1]<1&&Number.isFinite(rodCross)&&Math.abs(rodCross)<.5,
        name+' fitting layout retains two lower caps and two ordered edge collars');
      const rodPoint=base.localToWorld(new THREE.Vector3(center[0]+side*thickness/2,top-(rodEnds[0]+rodEnds[1])*.5*height,-rodCross*width));
      const rodHit=new THREE.Raycaster(rodPoint.clone().addScaledVector(outside,.020),outside.clone().negate(),0,.04).intersectObject(port,true)[0];
      Check(Boolean(rodHit&&rodHit.distance<.018),name+' edge fitting projects visibly from the outside cover face',
        {firstDistanceM:rodHit?.distance??null});
    }
    const engineFixed=r.asset.getObjectByName('EngineHingeFixed');
    if(engineFixed){
      for(const name of Object.keys(m.hatches))m.SetHatch(name,0);
      r.asset.updateMatrixWorld(true);
      const engine=m.hatches.Engine,mesh=r.asset.getObjectByName('Geometry_Hatch_Engine_Paint');
      const positions=mesh.geometry.attributes.position;
      let local=null,closed=null;
      for(let i=0;i<positions.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(positions,i),world=mesh.localToWorld(point.clone());
        if(!closed||world.x>closed.x){local=point;closed=world}
      }
      const pin=engine.getWorldPosition(new THREE.Vector3()),fixedMatrix=engineFixed.matrixWorld.clone();
      const axis=new THREE.Vector3(0,0,-1).transformDirection(engine.matrixWorld);
      m.SetHatch('Engine',.5);r.asset.updateMatrixWorld(true);
      const opened=mesh.localToWorld(local.clone());
      Check(engine.userData.HingeAxisLocal==='Y'&&engine.userData.OpenSignLocal===-1,
        'engine lid exports the inclined longitudinal outer-edge hinge');
      Check(closed.x>pin.x+.35&&opened.y>closed.y+.20&&opened.x<closed.x-.10,
        'engine lid inner edge rises and moves outward about its side hinge',
        {closed:closed.toArray(),opened:opened.toArray(),pin:pin.toArray()});
      Check(Math.abs(opened.clone().sub(pin).dot(axis)-closed.clone().sub(pin).dot(axis))<1e-7,
        'engine opening preserves position along the actual inclined hinge axis');
      Check(engineFixed.matrixWorld.elements.every((v,i)=>Math.abs(v-fixedMatrix.elements[i])<1e-9),
        'engine fixed pins and fork eyes remain stationary');
      m.SetHatch('Engine',0);r.asset.updateMatrixWorld(true);
      Check(mesh.localToWorld(local.clone()).distanceTo(closed)<1e-7,'engine lid returns to its exact closed pose');
    }
    for(const side of ['Left','Right']){
      m.SetBeltDistance(side,0);const initial=Capture(side);
      const restErrorM=Math.max(...m.sides[side].links.map(node=>Math.hypot(...node.position.toArray().map((v,k)=>v-(sourceNodes.get(node.name).translation||[0,0,0])[k]))));
      let finite=true,rigid=true,lateral=true;
      for(let sample=0;sample<=32;sample++){
        m.SetBeltDistance(side,p.lengthM*sample/32);
        for(const node of m.sides[side].links){finite&&=node.position.toArray().concat(node.quaternion.toArray()).every(Number.isFinite);rigid&&=Math.max(Math.abs(node.scale.x-1),Math.abs(node.scale.y-1),Math.abs(node.scale.z-1))<1e-7;lateral&&=Math.abs(node.position.x-(sourceNodes.get(node.name).translation||[0,0,0])[0])<1e-6}
      }
      const final=Capture(side);let maxPositionErrorM=0,maxAngleErrorRad=0;
      initial.forEach((pose,i)=>{maxPositionErrorM=Math.max(maxPositionErrorM,Math.hypot(...pose[0].map((v,k)=>v-final[i][0][k])));const dot=Math.abs(pose[1].reduce((sum,v,k)=>sum+v*final[i][1][k],0));maxAngleErrorRad=Math.max(maxAngleErrorRad,2*Math.acos(Math.min(1,dot)))});
      Check(finite&&rigid,side+' full cycle has finite rigid transforms');
      Check(restErrorM<1e-5&&lateral,side+' motion preserves the actual exported rest path and lateral plane',{restErrorM});
      Check(maxPositionErrorM<1e-6&&maxAngleErrorRad<1e-5,side+' belt loop closure',{maxPositionErrorM,maxAngleErrorRad});
      m.SetBeltDistance(side,0);
      const distance=.25;m.SetBeltDistance(side,distance);
      const road=m.sides[side].wheels.find(wheel=>wheel.name.endsWith('Road0'));
      const drive=m.sides[side].wheels.find(wheel=>wheel.name.endsWith('Drive'));
      Check(Math.abs(road.rotation.x*road.userData.WheelRadiusM-distance)<1e-9,side+' road-wheel rolling distance and sign');
      Check(Math.abs((drive.rotation.x-(drive.userData.PitchPhaseRad||0))*p.drivePitchRadiusM-distance)<1e-9,side+' sprocket pitch distance and sign');
      Check(Math.abs(p.sprocketTeeth*p.pitchM-2*Math.PI*p.drivePitchRadiusM)<1e-8,side+' teeth and link pitch correspondence');
      m.SetBeltDistance(side,0);
    }
    m.SetBeltDistance('Left',.4);Check(m.sides.Right.distanceM===0,'left/right independent distance clocks');m.SetBeltDistance('Left',0);
    const root=r.asset.getObjectByName('Type94Tankette'),height=root.position.y;
    const vent=r.asset.getObjectByName('VentHousing');
    Check(Boolean(vent),'projecting vent housing retained as a separate assembly');
    if(vent?.userData.VentSlotFrameRequired){
      const values=vent.userData.VentFaceCornersBeforeGroundM;
      const points=Array.from({length:4},(_,i)=>new THREE.Vector3(values[i*3],values[i*3+2],-values[i*3+1]));
      const n=vent.userData.VentFaceOutwardNormalBeforeGroundM,normal=new THREE.Vector3(n[0],n[2],-n[1]).transformDirection(vent.matrixWorld);
      const Face=h=>points[0].clone().lerp(points[1],.5).lerp(points[3].clone().lerp(points[2],.5),h);
      const samples=Array.from({length:201},(_,i)=>{const h=i/200,point=vent.localToWorld(Face(h)),hit=new THREE.Raycaster(point.addScaledVector(normal,.05),normal.clone().negate(),0,.2).intersectObject(vent,true)[0];return{h,hit}});
      const frontDistance=Math.min(...samples.filter(row=>row.hit).map(row=>row.hit.distance)),openings=[];let interval;
      for(const row of samples){if(row.hit&&row.hit.distance-frontDistance>.025){if(!interval){interval={low:row.h,high:row.h};openings.push(interval)}else interval.high=row.h}else interval=undefined}
      const height=(points[0].distanceTo(points[3])+points[1].distanceTo(points[2]))/2;
      Check(openings.length===3&&openings.every(row=>(row.high-row.low)*height>=.008),'depth scan finds three real vent openings behind the outer rails',{frontDistance,heightM:height,openings});
    }else if(vent){
      const CastVent=z=>{
        const ray=new THREE.Raycaster(new THREE.Vector3(-1.2,height+z,-.08),new THREE.Vector3(1,0,0),0,1);
        return ray.intersectObject(vent,true)[0];
      };
      const samples=Array.from({length:101},(_,i)=>({z:.85+i*.001,hit:CastVent(.85+i*.001)}));
      const frontX=Math.min(...samples.filter(sample=>sample.hit).map(sample=>sample.hit.point.x));
      const openings=[];let interval;
      for(const sample of samples){
        if(sample.hit&&sample.hit.point.x-frontX>.025){
          if(!interval){interval={low:sample.z,high:sample.z};openings.push(interval)}else interval.high=sample.z;
        }else interval=undefined;
      }
      Check(openings.length===3&&openings.every(opening=>opening.high-opening.low>=.008),
        'depth scan finds three real vent openings behind the outer rails',{frontX,openings});
    }
    const turretHeight=m.turret.position.y+height;
    if(m.towShackle){
      r.asset.updateMatrixWorld(true);const pin=m.towShackle.getWorldPosition(new THREE.Vector3());
      m.SetTowShackle(1);r.asset.updateMatrixWorld(true);
      Check(m.towShackle.getWorldPosition(new THREE.Vector3()).distanceTo(pin)<1e-9,'tow shackle turns around a fixed pin');
      Check(Math.abs(m.towShackle.rotation.x-m.towShackleRest-Math.PI*4/9)<1e-9,'tow-shackle demonstration angle reaches 80 degrees');
      m.SetTowShackle(0);r.asset.updateMatrixWorld(true);
      const mark=r.asset.getObjectByName('Marking_Hinomaru'),hull=r.asset.getObjectByName('Geometry_Hull_Paint');
      const normals=mark.geometry.attributes.normal,positions=mark.geometry.attributes.position,normalMatrix=new THREE.Matrix3().getNormalMatrix(mark.matrixWorld);
      const center=new THREE.Vector3(),normal=new THREE.Vector3();let count=0;
      for(let i=0;i<positions.count;i++){
        const n=new THREE.Vector3().fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
        if(n.z<-.8){center.add(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mark.matrixWorld));normal.add(n);count++}
      }
      center.divideScalar(count);normal.normalize();
      const hit=new THREE.Raycaster(center.clone().addScaledVector(normal,.001),normal.clone().negate(),0,.1).intersectObject(hull,true)[0];
      Check(Boolean(hit)&&hit.distance<.004,'front museum placard lies on the actual armour surface',{gapM:hit?hit.distance-.001:null});
    }
    r.asset.updateMatrixWorld(true);
    const rearDoorWorld=r.asset.getObjectByName('Hatch_RearCargo').getWorldPosition(new THREE.Vector3());
    const roofFixed=r.asset.getObjectByName('DriverRoofHingeFixed');
    if(roofFixed){
      for(const name of Object.keys(m.hatches))m.SetHatch(name,0);
      r.asset.updateMatrixWorld(true);
      const roof=m.hatches.DriverRoof,mesh=r.asset.getObjectByName('Geometry_Hatch_DriverRoof_Paint');
      const position=mesh.geometry.attributes.position;let local=null,rear=null;
      for(let i=0;i<position.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(position,i),world=mesh.localToWorld(point.clone());
        if(!rear||world.z>rear.z){local=point;rear=world}
      }
      const pin=roof.getWorldPosition(new THREE.Vector3()),fixedMatrix=roofFixed.matrixWorld.clone();
      m.SetHatch('DriverRoof',.5);r.asset.updateMatrixWorld(true);
      const opened=mesh.localToWorld(local.clone());
      Check(rear.z>pin.z+.20&&opened.y>rear.y+.10&&opened.z<rear.z-.04,
        'driver roof rear edge rises and moves toward the nose about the front hinge',
        {closedRear:rear.toArray(),openedRear:opened.toArray(),pin:pin.toArray()});
      Check(roofFixed.matrixWorld.elements.every((v,i)=>Math.abs(v-fixedMatrix.elements[i])<1e-9),
        'driver roof fixed pins stay fixed during actual runtime opening');
      m.SetHatch('DriverRoof',0);r.asset.updateMatrixWorld(true);
    }
    for(const side of ['Left','Right']){
      const housing=r.asset.getObjectByName('FinalDriveHousing'+side);
      Check(Boolean(housing),side+' fixed final-drive casing is an independent assembly');
      if(housing){
        r.asset.updateMatrixWorld(true);const before=housing.matrixWorld.clone();
        m.SetBeltDistance(side,.25);r.asset.updateMatrixWorld(true);
        Check(housing.matrixWorld.elements.every((value,i)=>Math.abs(value-before.elements[i])<1e-9),
          side+' casing remains fixed while the sprocket turns');
        const bounds=new THREE.Box3().setFromObject(housing,true);
        Check(!bounds.isEmpty()&&bounds.min.y>=.30,side+' casing retains belly clearance',{minimumWorldY:bounds.min.y});
        m.SetBeltDistance(side,0);r.asset.updateMatrixWorld(true);
      }
    }
    const probes=[
      ['Commander',[0,2.4,.58],[0,-1,0],point=>point.y<1.10],
      ['DriverRoof',[.305,2.0,-.0415],[0,-1,0],point=>point.y<.80],
      ['DriverVisor',[.305,height+1.12,-.70],[0,0,1],point=>point.z>-.10],
      ['Engine',[-.32,2.0,-.015],[0,-1,0],point=>point.y<.65],
      ['RearCargo',[0,rearDoorWorld.y,rearDoorWorld.z+1],[0,0,-1],point=>point.z<rearDoorWorld.z-.30],
      ['DriverPortLeft',[-.70,height+1.15,-.01],[1,0,0],point=>point.x>.10],
      ['TurretPortLeft',[-.80,turretHeight+.288,.595],[1,0,0],point=>point.x>.05],
      ['TurretPortRight',[.80,turretHeight+.288,.595],[-1,0,0],point=>point.x<-.05],
    ];
    if(r.Find('Hull').userData.BodyTrialLayout){
      m.SetHatch('DriverRoof',0);r.asset.updateMatrixWorld(true);
      const centre=new THREE.Box3().setFromObject(m.hatches.DriverRoof,true).getCenter(new THREE.Vector3());
      probes.find(row=>row[0]==='DriverRoof')[1]=[centre.x,centre.y+1,centre.z];
    }
    if(m.hatches.DriverPortRight)probes.push(['DriverPortRight',[.95,height+1.15,-.01],[-1,0,0],point=>point.x<.45]);
    const apertures=[];
    for(const [name,origin,direction,inside]of probes){
      for(const hatch of Object.keys(m.hatches))if(m.hatches[hatch])m.SetHatch(hatch,0);
      m.SetTurretYaw(0);m.SetGunElevation(0);m.SetHatch(name,.90);r.asset.updateMatrixWorld(true);
      const port=m.hatches[name],mount=port?.parent;
      if(mount?.userData.SideSectorLayout==='Data_TurretSideSectorV35.json'||name.startsWith('DriverPort')&&r.Find('Hull').userData.BodyTrialLayout){
        const c=port.userData.CoverCenterInMountM,[width,height]=port.userData.OpeningSizeM;
        const point=mount.localToWorld(new THREE.Vector3(c[0],c[2],-c[1]));
        const normal=new THREE.Vector3(name.endsWith('Left')?-1:1,0,0).transformDirection(mount.matrixWorld);
        const tangent=new THREE.Vector3(0,0,-1).transformDirection(mount.matrixWorld),up=new THREE.Vector3(0,1,0).transformDirection(mount.matrixWorld);
        const Cast=(y,z)=>new THREE.Raycaster(point.clone().addScaledVector(tangent,y).addScaledVector(up,z).addScaledVector(normal,.35),normal.clone().negate(),0,2).intersectObject(r.asset,true)[0];
        const movingMeshes=new Set();port.traverse(o=>{if(o.isMesh)movingMeshes.add(o)});const fixedMeshes=[];r.asset.traverse(o=>{if(o.isMesh&&!movingMeshes.has(o))fixedMeshes.push(o)});
        const CastFixed=(y,z)=>new THREE.Raycaster(point.clone().addScaledVector(tangent,y).addScaledVector(up,z).addScaledVector(normal,.35),normal.clone().negate(),0,2).intersectObjects(fixedMeshes,false)[0];
        for(const y of[-width*.25,0,width*.25])for(const z of[-height*.25,0,height*.25]){
          const hit=Cast(y,z);Check(hit&&hit.distance>.40,name+' actual rotated aperture reaches interior at '+y+','+z,{distanceM:hit?.distance,object:hit?.object.name});
        }
        for(const[y,z]of[[-width/2-.01,0],[width/2+.01,0],[0,-height/2-.01],[0,height/2+.01]]){
          const hit=CastFixed(y,z);Check(hit&&Math.abs(hit.distance-.35)<.04,name+' actual fixed metal surrounds its rotated aperture at '+y+','+z,{distanceM:hit?.distance,object:hit?.object.name});
        }
        const first=Cast(0,0);apertures.push({name,frame:'Actual rotated mount',firstHit:first?{point:first.point.toArray(),object:first.object.name,distanceM:first.distance}:null});continue;
      }
      const ray=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,10);
      const hits=ray.intersectObject(r.asset,true),first=hits[0];
      const result={name,firstHit:first?{point:first.point.toArray(),object:first.object.name}:null};
      apertures.push(result);Check(Boolean(first&&inside(first.point)),name+' actual open aperture reaches interior',result);
    }
    for(const hatch of Object.keys(m.hatches))if(m.hatches[hatch])m.SetHatch(hatch,0);
    m.SetHatch('DriverRoof',1);m.SetTurretYaw(.8);m.SetGunElevation(-.1);
    Check(m.turret.rotation.y===0&&m.gun.rotation.x>=0,'front open hatch operating interlock');
    m.SetHatch('DriverRoof',0);m.SetTurretYaw(.8);Check(Math.abs(m.turret.rotation.y-.8)<1e-8,'closed hatch releases turret interlock');m.SetTurretYaw(0);
    let pbrMappedMeshes=0;
    r.asset.traverse(node=>{if(node.isMesh){const mat=r.original.get(node);if(mat?.map){pbrMappedMeshes++;Check(mat.map.colorSpace==='srgb',node.name+' BaseColor sRGB')}if(mat?.normalMap)Check(mat.normalMap.colorSpace==='',node.name+' normal linear');if(mat?.roughnessMap)Check(mat.roughnessMap.colorSpace==='',node.name+' ORM linear')}});
    if(!geometryOnly)Check(pbrMappedMeshes>0,'exported PBR maps are present');
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',glb))).map(value=>value.toString(16).padStart(2,'0')).join('');
    return{checks,apertures,sha256,scope:geometryOnly?'Gray geometry and mechanisms only; PBR not accepted':'Geometry, mechanisms and PBR map encodings',pbrMappedMeshes,passed:checks.every(check=>check.passed),linkCount:p.linkCount,loopLengthM:p.lengthM,pitchM:p.pitchM};
  },{geometryOnly:args['--geometry-only']==='true'});
  report.errors=errors;report.passed&&=errors.length===0;report.timestamp=new Date().toISOString();
  if(args['--out'])fs.writeFileSync(args['--out'],JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failed:report.checks.filter(check=>!check.passed),errors},null,2));
  if(!report.passed)process.exitCode=1;
}finally{await browser.close()}
