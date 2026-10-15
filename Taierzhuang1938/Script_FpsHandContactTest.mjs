// Validate skin contact with the real trigger and moving reload props. Palm IK
// residuals alone cannot detect a floating finger or a hand inside the receiver.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {FPS_ARM_LIMITS} from "./Data_FpsArmPoses.mjs";
import {SHELVED_WEAPONS} from "./Data_Weapons.mjs";
import {ZbContactGeometryFailures} from "./Script_FpsZbContactGeometry.mjs";

const project=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(project,"_shots","FpsHandContact");await fs.mkdir(output,{recursive:true});
const server=await ServeRoot(path.resolve(project,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
const only=process.argv.find(a=>a.startsWith("--only="))?.slice(7).split(",");
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
  const report=await page.evaluate(async({only,shelved})=>{
    const THREE=await import("./vendor/three/build/three.module.js");
    const {MeasureZbContactGeometry}=await import("./Script_FpsZbContactGeometry.mjs");
    const T=window.Taierzhuang,vm=T.viewmodel;let arms=vm.riggedArms;
    T.Debug.OpenEditor("firstPerson");const editor=T.editor.active;
    const probes={ZhongZheng:[.002,-.023,-.0558],HanYang:[.002,-.019,-.0838],Type38:[.003,-.021,-.1288],
      Zb26:[.002,-.045,-.1229],Type11:[.002,-.040,-.124],ServicePistol:[.002,-.007,-.0531]};
    const result={poses:[],actions:[],samples:0};
    const pads={};
    const Refresh=()=>{vm.root.updateMatrixWorld(true);arms.root.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.skeleton.update();});};
    const Pad=(side,digit)=>{
      const key=vm.weaponId+side+digit;let entry=pads[key];
      if(!entry){
        const bone=arms.anatomy[side].curls.find(c=>c.bone.name.toLowerCase().endsWith("finger"+digit+"2")).bone,points=[];
        arms.root.traverse(mesh=>{
          if(!mesh.isSkinnedMesh)return;
          const g=mesh.geometry,index=mesh.skeleton.bones.indexOf(bone);
          for(let i=0;i<g.attributes.position.count;i++){
            let weight=0;for(let j=0;j<4;j++)if(g.attributes.skinIndex.getComponent(i,j)===index)weight+=g.attributes.skinWeight.getComponent(i,j);
            if(weight>.95)points.push(bone.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
          }
        });
        if(!points.length)throw new Error('No skinned fingertip vertices: '+key);
        const box=new THREE.Box3().setFromPoints(points);
        entry=pads[key]={bone,point:new THREE.Vector3(box.max.x*.78,box.max.y*(digit?.9:.75),(box.min.z+box.max.z)*.5)};
      }
      return vm.rig.group.worldToLocal(entry.bone.localToWorld(entry.point.clone()));
    };
    const Triangles=(root,filter=null)=>{
      const triangles=[],inverse=vm.rig.group.matrixWorld.clone().invert();
      root.traverse(o=>{
        if(!o.isMesh||o.isSkinnedMesh||(filter&&!filter(o)))return;
        const g=o.geometry,p=g.attributes.position,index=g.index,m=inverse.clone().multiply(o.matrixWorld);
        for(let i=0;i<(index?.count||p.count);i+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(m))));
      });return triangles;
    };
    const Nearest=(point,triangles)=>{let distance=Infinity;const closest=new THREE.Vector3();for(const tri of triangles){tri.closestPointToPoint(point,closest);distance=Math.min(distance,point.distanceTo(closest));}return distance;};
    // A fixed box-derived marker can sit inside a thick thumb, or on its nail
    // side after opposition. Inspect the actual distal skin for these newly
    // fitted grips, and separately reject penetration of the whole finger.
    const DistalGap=(side,digit,triangles)=>{
      let distance=Infinity,vertices=0;
      arms.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;const a=mesh.geometry.attributes;
        const bone=mesh.skeleton.bones.findIndex(b=>b.name.toLowerCase().replace(/[^a-z0-9]/g,"").endsWith(side+"finger"+digit+"2"));
        if(bone<0)return;
        for(let i=0;i<a.position.count;i++){
          let weight=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===bone)weight+=a.skinWeight.getComponent(i,k);
          if(weight<.95)continue;vertices++;
          const point=vm.rig.group.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
          distance=Math.min(distance,Nearest(point,triangles));
        }
      });
      if(vertices<20)throw new Error("Missing distal skin: "+side+digit);
      return distance;
    };
    const FingerPenetration=(side,part)=>{
      const triangles=Triangles(part),direction=new THREE.Vector3(1,.371,.137).normalize(),hit=new THREE.Vector3();
      let vertices=0,inside=0,maxDepth=0;
      arms.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        const a=mesh.geometry.attributes,indices=new Set(mesh.skeleton.bones.map((bone,i)=>{
          const name=bone.name.toLowerCase().replace(/[^a-z0-9]/g,"");return new RegExp(side+"finger[0-4][0-2]?$").test(name)?i:-1;
        }).filter(i=>i>=0));
        for(let i=0;i<a.position.count;i++){
          let owned=0;for(let k=0;k<4;k++)if(indices.has(a.skinIndex.getComponent(i,k)))owned+=a.skinWeight.getComponent(i,k);
          if(owned<.95)continue;vertices++;
          const point=vm.rig.group.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)),depth=Nearest(point,triangles);
          if(depth>.012)continue;
          const ray=new THREE.Ray(point,direction),hits=[];
          for(const triangle of triangles)if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit)){
            const distance=point.distanceTo(hit);if(distance>1e-8&&!hits.some(value=>Math.abs(value-distance)<1e-7))hits.push(distance);
          }
          if(hits.length%2){inside++;maxDepth=Math.max(maxDepth,depth);}
        }
      });return {vertices,inside,maxDepth};
    };
    const TriggerPoint=(id)=>{
      const origin=new THREE.Vector3(...probes[id]);origin.z-=.012;
      const ray=new THREE.Ray(origin,new THREE.Vector3(0,0,1));let best=Infinity,hit=null;const point=new THREE.Vector3();
      for(const triangle of Triangles(vm.rig.group,o=>o.name.startsWith(id+"_")||/^Vm(Bolt|Slide)_/.test(o.name)))if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,point)){
        const distance=point.distanceToSquared(origin);if(distance<best){best=distance;hit=point.clone();}
      }
      return hit;
    };
    // Shelved weapons (the pistol, for now) keep their probes but are not measured.
    for(const id of Object.keys(probes).filter(id=>(!only||only.includes(id))&&!shelved.includes(id))){
      editor.SetWeapon(id);arms=vm.riggedArms;editor.SetPose("hip");editor.SetView("player");for(let i=0;i<90;i++)editor.Update(1/60);Refresh();
      const target=TriggerPoint(id),hip=Pad("r",1),originalPositions=arms.fingerBones.r.concat(arms.fingerBones.l).map(b=>b.position.clone());
      for(const pose of ["hip","ads","fire"]){
        editor.SetPose(pose==="ads"?"ads":"hip");for(let i=0;i<90;i++)editor.Update(1/60);
        if(pose==="fire"){vm.TriggerFire();editor.Update(1/120);}
        Refresh();const point=Pad("r",1),bone=pads[id+'r1'].bone;
        const normal=new THREE.Vector3(0,1,0).transformDirection(vm.rig.group.matrixWorld.clone().invert().multiply(bone.matrixWorld));
        const gunSurface=id!=="ServicePistol"&&id!=="Zb26"?Triangles(vm.rig.group,o=>o.name.startsWith(id+"_")):null;
        const support=gunSurface?[0,1,2,3,4].map(digit=>Nearest(Pad("l",digit),gunSurface)):[];
        const zbContact=id==='Zb26'?MeasureZbContactGeometry(THREE,{weaponGroup:vm.rig.group,arms}):null;
        result.poses.push({id,pose,support,supportPoints:gunSurface?[0,1,2,3,4].map(digit=>Pad("l",digit).toArray()):[],point:point.toArray(),trigger:target?.toArray(),distance:target?point.distanceTo(target):Infinity,
          facing:normal.z,holdingDrift:pose==="ads"?point.distanceTo(hip):0,triggerTravel:pose==="fire"?point.distanceTo(hip):0,wrist:{...arms.wristBend},supportSkin:zbContact?.support??null,triggerSkin:zbContact?.trigger??null});
      }
      editor.SetPose("hip");for(let i=0;i<90;i++)editor.Update(1/60);
      for(const action of ["reload",...(["ZhongZheng","HanYang","Type38","Zb26","Type11"].includes(id)?["reloadPartial"]:[]),
        ...(["ZhongZheng","HanYang","Type38"].includes(id)?["reloadOpen","bolt"]:[])]){
        if(action==="reloadOpen") {
          vm.pendingHoldOpen=true;vm.TriggerBolt();
          while(vm.action)editor.Update(1/60);
          if(!vm.boltOpen)throw new Error(id+": the open-bolt reload contact case did not start open");
        }
        if(action.startsWith("reload"))vm.TriggerReload({remainingRounds:action==="reloadPartial"?3:0});else vm.TriggerBolt();
        const row={id,action,maxGrip:0,maxWrist:0,maxFingerTranslation:0,unreachable:0,propSamples:[],skinSamples:[],worstGrip:null,worstWrist:null};
        for(let frame=0;vm.action&&frame<1200;frame++){
          editor.Update(1/60);Refresh();result.samples++;
          const t=vm.action?.t??1,grip=Math.max(arms.gripError.r,arms.gripError.l),wrist=Math.max(arms.wristBend.r,arms.wristBend.l);
          if(grip>row.maxGrip)row.worstGrip={t,grip};
          if(wrist>row.maxWrist)row.worstWrist={t,wrist,bySide:{...arms.wristBend},reach:{...arms.reachRatio}};
          row.maxGrip=Math.max(row.maxGrip,grip);row.maxWrist=Math.max(row.maxWrist,wrist);
          if(!arms.reachable.r||!arms.reachable.l)row.unreachable++;
          arms.fingerBones.r.concat(arms.fingerBones.l).forEach((b,i)=>row.maxFingerTranslation=Math.max(row.maxFingerTranslation,b.position.distanceTo(originalPositions[i])));
          if(frame%5||!vm.action)continue;
          let prop=null,side="r",digits=[0,1],kind="";
          if(action==="bolt"&&t>.25&&t<.78){prop=vm.rig.parts.bolt;kind="bolt";}
          if(action.startsWith("reload")){
            if(["ZhongZheng","HanYang","Type38"].includes(id)){
              const packet=id==="HanYang",partial=packet&&action==="reloadPartial",held=packet?vm.packetProp:vm.clipProp;
              if((t>(partial ? .40 : .33)&&t<(partial ? .52 : .48))||(!packet&&t>.71&&t<.75)){
                prop=held.userData.body;kind=packet?"packet":"clip";
              }else if(t>(partial ? .60 : .56)&&t<(partial ? .68 : .63)){prop=held.userData.rounds;digits=[0];kind="press";}
              else if(partial&&t>.32&&t<.35){prop=vm.usedPacketProp.userData.body;kind="oldPacket";}
            }else if(id==="Zb26"&&((t>.17&&t<.30)||(t>.58&&t<.73))){prop=vm.rig.parts.magazine;digits=[0,2];kind="magazine";}
            else if(id==="ServicePistol"){
              side="l";
              if((t>.17&&t<.27)||(t>.52&&t<.69)){prop=vm.magazineProp;kind="pistolMagazine";}
              else if(t>.81&&t<.89){prop=vm.rig.parts.bolt;kind="slide";}
            }else if(id==="Type11"&&t>.20&&t<.80&&((t-.20)%.10)<.032){prop=vm.clipProp.userData.body;kind="hopperClip";}
          }
          if(prop){
            const skinContact=(id==="HanYang"&&["packet","oldPacket","press"].includes(kind))||kind==="hopperClip";
            const triangles=Triangles(prop);
            for(const digit of digits)row.propSamples.push({t,kind,digit,skinContact,
              distance:skinContact?DistalGap(side,digit,triangles):Nearest(Pad(side,digit),triangles)});
            if(skinContact&&frame%15===0){
              const whole=kind==="press"?vm.packetProp:kind==="oldPacket"?vm.usedPacketProp:kind==="packet"?vm.packetProp:vm.clipProp;
              row.skinSamples.push({t,kind,...FingerPenetration("r",whole)});
            }
          }
          if(id==="Type11"&&action.startsWith("reload")&&t>.09&&t<(action==="reloadPartial"?.875:.837)) {
            const triangles=Triangles(vm.rig.parts.hopperFollower);
            for(const digit of [0,1,2])row.propSamples.push({t,kind:"follower",digit,distance:Nearest(Pad("l",digit),triangles)});
          }
          if(id==="Type11"&&action==="reload"&&t>.875&&t<.945) {
            const triangles=Triangles(vm.rig.parts.operatingHandle);
            for(const digit of [0,1,2])row.propSamples.push({t,kind:"operatingHandle",digit,distance:Nearest(Pad("l",digit),triangles)});
            if(frame%15===0)row.skinSamples.push({t,kind:"operatingHandle",...FingerPenetration("l",vm.rig.parts.operatingHandle)});
          }
        }
        result.actions.push(row);for(let i=0;i<60;i++)editor.Update(1/60);
      }
    }
    return result;
  },{only,shelved:SHELVED_WEAPONS});
  await fs.writeFile(path.join(output,"Data_Contacts.json"),JSON.stringify({...report,errors},null,2));
  const failures=[];const Check=(condition,message)=>{if(!condition)failures.push(message);};
  for(const pose of report.poses){
    if(pose.id!=='Zb26')Check(pose.distance<.006,`${pose.id} ${pose.pose}: index pad misses trigger by ${(pose.distance*1000).toFixed(1)} mm`);
    Check(pose.facing>.45,`${pose.id} ${pose.pose}: index pad does not face the trigger (${pose.facing.toFixed(2)})`);
    Check(pose.holdingDrift<.001,`${pose.id}: ADS changes the finger contact`);
    if(pose.pose==="fire")Check(pose.triggerTravel>.0001,`${pose.id}: firing does not flex the trigger finger`);
    for(const [digit,distance] of pose.support.entries())Check(distance<.004,`${pose.id} ${pose.pose}: support digit ${digit} is ${(distance*1000).toFixed(1)} mm from the fore-end surface`);
    if(pose.id==='Zb26')failures.push(...ZbContactGeometryFailures({support:pose.supportSkin,trigger:pose.triggerSkin},`Zb26 ${pose.pose}`));
  }
  for(const action of report.actions){
    Check(action.maxGrip<FPS_ARM_LIMITS.positionResidualM,`${action.id} ${action.action}: hand leaves target ${JSON.stringify(action.worstGrip)}`);
    Check(action.maxWrist<FPS_ARM_LIMITS.wristBendDeg,`${action.id} ${action.action}: wrist bends beyond its limit ${JSON.stringify(action.worstWrist)}`);
    Check(action.maxFingerTranslation<1e-6,`${action.id}: finger bone lengths change during animation`);
    Check(action.unreachable===0,`${action.id} ${action.action}: ${action.unreachable} unreachable frames`);
    Check(action.propSamples.length>0,`${action.id} ${action.action}: no moving-part contact was sampled`);
    for(const sample of action.propSamples)Check(sample.distance<(sample.skinContact ? .003 : sample.kind==="bolt" ? .012 : .009),`${action.id} ${sample.kind} at ${sample.t.toFixed(3)}: digit ${sample.digit} misses the prop by ${(sample.distance*1000).toFixed(1)} mm`);
    if(["HanYang","Type11"].includes(action.id)&&action.action.startsWith("reload")){
      const loading=action.skinSamples.filter(sample=>sample.kind!=="operatingHandle");
      Check(loading.length>0&&loading.every(sample=>sample.vertices>4000),`${action.id}: loading grip did not inspect complete finger skin`);
      for(const sample of loading)Check(sample.maxDepth<.002,`${action.id} ${sample.kind}: finger skin penetrates ammunition ${(sample.maxDepth*1000).toFixed(2)} mm at ${sample.t.toFixed(3)}`);
    }
    if(action.id==="Type11"&&action.action==="reload") {
      const handle=action.skinSamples.filter(sample=>sample.kind==="operatingHandle");
      Check(handle.length>0&&handle.every(sample=>sample.vertices>4000),"Type11: operating-handle contact did not inspect the complete finger skin");
      for(const sample of handle)Check(sample.maxDepth<.002,`Type11: finger skin penetrates the operating handle ${(sample.maxDepth*1000).toFixed(2)} mm at ${sample.t.toFixed(3)}`);
    }
  }
  assert.deepEqual(errors,[],"no page errors");
  assert.deepEqual(failures,[],"first-person skin contact regression");
  console.log(`ok FPS hand contact: ${report.poses.length} holding/firing poses, ${report.samples} action frames, real trigger and reload geometry`);
} finally {await browser.close();server.close();}
