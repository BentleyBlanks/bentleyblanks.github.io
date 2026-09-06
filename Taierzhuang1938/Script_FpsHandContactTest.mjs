// Validate skin contact with the real trigger and moving reload props. Palm IK
// residuals alone cannot detect a floating finger or a hand inside the receiver.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {FPS_ARM_LIMITS} from "./Data_FpsArmPoses.mjs";

const project=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(project,"_shots","FpsHandContact");await fs.mkdir(output,{recursive:true});
const server=await ServeRoot(path.resolve(project,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
const only=process.argv.find(a=>a.startsWith("--only="))?.slice(7).split(",");
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=medium&scale=small`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
  const report=await page.evaluate(async({only})=>{
    const THREE=await import("./vendor/three/build/three.module.js");
    const T=window.Taierzhuang,vm=T.viewmodel,arms=vm.riggedArms;
    T.Debug.OpenEditor("firstPerson");const editor=T.editor.active;
    const probes={ZhongZheng:[.002,-.023,-.0558],HanYang:[.002,-.019,-.0838],Type38:[.003,-.021,-.1288],
      Zb26:[.002,-.045,-.1229],Type11:[.002,-.040,-.124],ServicePistol:[.002,-.007,-.0531]};
    const result={poses:[],actions:[],samples:0};
    const pads={};
    const Refresh=()=>{vm.root.updateMatrixWorld(true);arms.mesh.skeleton.update();};
    const Pad=(side,digit)=>{
      const key=side+digit;let entry=pads[key];
      if(!entry){
        const mesh=arms.mesh,g=mesh.geometry,bone=arms.anatomy[side].curls.find(c=>c.bone.name.toLowerCase().endsWith("finger"+digit+"2")).bone;
        const index=mesh.skeleton.bones.indexOf(bone),points=[];
        for(let i=0;i<g.attributes.position.count;i++){
          let weight=0;for(let j=0;j<4;j++)if(g.attributes.skinIndex.getComponent(i,j)===index)weight+=g.attributes.skinWeight.getComponent(i,j);
          if(weight>.95)points.push(bone.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
        }
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
    const TriggerPoint=(id)=>{
      const origin=new THREE.Vector3(...probes[id]);origin.z-=.012;
      const ray=new THREE.Ray(origin,new THREE.Vector3(0,0,1));let best=Infinity,hit=null;const point=new THREE.Vector3();
      for(const triangle of Triangles(vm.rig.group,o=>o.name.startsWith(id+"_")||/^Vm(Bolt|Slide)_/.test(o.name)))if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,point)){
        const distance=point.distanceToSquared(origin);if(distance<best){best=distance;hit=point.clone();}
      }
      return hit;
    };
    for(const id of Object.keys(probes).filter(id=>!only||only.includes(id))){
      editor.SetWeapon(id);editor.SetPose("hip");editor.SetView("player");for(let i=0;i<90;i++)editor.Update(1/60);Refresh();
      const target=TriggerPoint(id),hip=Pad("r",1),originalPositions=arms.fingerBones.r.concat(arms.fingerBones.l).map(b=>b.position.clone());
      for(const pose of ["hip","ads","fire"]){
        editor.SetPose(pose==="ads"?"ads":"hip");for(let i=0;i<90;i++)editor.Update(1/60);
        if(pose==="fire"){vm.TriggerFire();editor.Update(1/120);}
        Refresh();const point=Pad("r",1),bone=pads.r1.bone;
        const normal=new THREE.Vector3(0,1,0).transformDirection(vm.rig.group.matrixWorld.clone().invert().multiply(bone.matrixWorld));
        const gunSurface=id!=="ServicePistol"?Triangles(vm.rig.group,o=>o.name.startsWith(id+"_")):null;
        const support=gunSurface?[0,1,2,3,4].map(digit=>Nearest(Pad("l",digit),gunSurface)):[];
        result.poses.push({id,pose,support,point:point.toArray(),trigger:target?.toArray(),distance:target?point.distanceTo(target):Infinity,
          facing:normal.z,holdingDrift:pose==="ads"?point.distanceTo(hip):0,triggerTravel:pose==="fire"?point.distanceTo(hip):0,wrist:{...arms.wristBend}});
      }
      editor.SetPose("hip");for(let i=0;i<90;i++)editor.Update(1/60);
      for(const action of ["reload",...(["ZhongZheng","HanYang","Type38"].includes(id)?["bolt"]:[])]){
        if(action==="reload")vm.TriggerReload();else vm.TriggerBolt();
        const row={id,action,maxGrip:0,maxWrist:0,maxFingerTranslation:0,unreachable:0,propSamples:[],worstGrip:null,worstWrist:null};
        for(let frame=0;vm.action&&frame<1200;frame++){
          editor.Update(1/60);Refresh();result.samples++;
          const t=vm.action?.t??1,grip=Math.max(arms.gripError.r,arms.gripError.l),wrist=Math.max(arms.wristBend.r,arms.wristBend.l);
          if(grip>row.maxGrip)row.worstGrip={t,grip};
          if(wrist>row.maxWrist)row.worstWrist={t,wrist};
          row.maxGrip=Math.max(row.maxGrip,grip);row.maxWrist=Math.max(row.maxWrist,wrist);
          if(!arms.reachable.r||!arms.reachable.l)row.unreachable++;
          arms.fingerBones.r.concat(arms.fingerBones.l).forEach((b,i)=>row.maxFingerTranslation=Math.max(row.maxFingerTranslation,b.position.distanceTo(originalPositions[i])));
          if(frame%5||!vm.action)continue;
          let prop=null,side="r",digits=[0,1],kind="";
          if(action==="bolt"&&t>.25&&t<.78){prop=vm.rig.parts.bolt;kind="bolt";}
          if(action==="reload"){
            if(["ZhongZheng","HanYang","Type38"].includes(id)){
              if((t>.32&&t<.48)||(t>.72&&t<.79)){prop=vm.clipProp.userData.body;kind="clip";}
              else if(t>.56&&t<.63){prop=vm.clipProp.userData.rounds;digits=[0];kind="press";}
            }else if(id==="Zb26"&&((t>.17&&t<.30)||(t>.58&&t<.73))){prop=vm.rig.parts.magazine;digits=[0,2];kind="magazine";}
            else if(id==="ServicePistol"){
              side="l";
              if((t>.17&&t<.27)||(t>.52&&t<.69)){prop=vm.magazineProp;kind="pistolMagazine";}
              else if(t>.81&&t<.89){prop=vm.rig.parts.bolt;kind="slide";}
            }else if(id==="Type11"&&t>.20&&t<.80&&((t-.20)%.10)<.032){prop=vm.clipProp.userData.body;kind="hopperClip";}
          }
          if(prop){const triangles=Triangles(prop);for(const digit of digits)row.propSamples.push({t,kind,digit,distance:Nearest(Pad(side,digit),triangles)});}
        }
        result.actions.push(row);for(let i=0;i<60;i++)editor.Update(1/60);
      }
    }
    return result;
  },{only});
  await fs.writeFile(path.join(output,"Data_Contacts.json"),JSON.stringify({...report,errors},null,2));
  const failures=[];const Check=(condition,message)=>{if(!condition)failures.push(message);};
  for(const pose of report.poses){
    Check(pose.distance<.006,`${pose.id} ${pose.pose}: index pad misses trigger by ${(pose.distance*1000).toFixed(1)} mm`);
    Check(pose.facing>.45,`${pose.id} ${pose.pose}: index pad does not face the trigger (${pose.facing.toFixed(2)})`);
    Check(pose.holdingDrift<.001,`${pose.id}: ADS changes the finger contact`);
    if(pose.pose==="fire")Check(pose.triggerTravel>.0001,`${pose.id}: firing does not flex the trigger finger`);
    for(const [digit,distance] of pose.support.entries())Check(distance<.004,`${pose.id} ${pose.pose}: support digit ${digit} is ${(distance*1000).toFixed(1)} mm from the fore-end surface`);
  }
  for(const action of report.actions){
    Check(action.maxGrip<FPS_ARM_LIMITS.positionResidualM,`${action.id} ${action.action}: hand leaves target ${JSON.stringify(action.worstGrip)}`);
    Check(action.maxWrist<FPS_ARM_LIMITS.wristBendDeg,`${action.id} ${action.action}: wrist bends beyond its limit ${JSON.stringify(action.worstWrist)}`);
    Check(action.maxFingerTranslation<1e-6,`${action.id}: finger bone lengths change during animation`);
    Check(action.unreachable===0,`${action.id} ${action.action}: ${action.unreachable} unreachable frames`);
    Check(action.propSamples.length>0,`${action.id} ${action.action}: no moving-part contact was sampled`);
    for(const sample of action.propSamples)Check(sample.distance<(sample.kind==="bolt"?.012:.009),`${action.id} ${sample.kind} at ${sample.t.toFixed(3)}: digit ${sample.digit} misses the prop by ${(sample.distance*1000).toFixed(1)} mm`);
  }
  assert.deepEqual(errors,[],"no page errors");
  assert.deepEqual(failures,[],"first-person skin contact regression");
  console.log(`ok FPS hand contact: ${report.poses.length} holding/firing poses, ${report.samples} action frames, real trigger and reload geometry`);
} finally {await browser.close();server.close();}
