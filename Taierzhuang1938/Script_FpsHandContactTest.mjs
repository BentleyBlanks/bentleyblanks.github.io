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
    const {FPS_PACKET_RELOAD}=await import("./Data_Tuning_FpsReload.mjs");
    const {MeasureZbContactGeometry}=await import("./Script_FpsZbContactGeometry.mjs");
    const {CreateReloadClearanceProbe,CreateReloadClearanceGeometry}=await import("./Script_FpsReloadClearanceGeometry.mjs");
    const magazineClearance=CreateReloadClearanceProbe(THREE);
    const T=window.Taierzhuang,vm=T.viewmodel;let arms=vm.riggedArms;
    T.Debug.OpenEditor("firstPerson");const editor=T.editor.active;
    const probes={ZhongZheng:[.002,-.023,-.0558],HanYang:[.002,-.019,-.0838],Type38:[.003,-.021,-.1288],
      Zb26:[.002,-.045,-.1229],Type11:[.002,-.040,-.124],ServicePistol:[.002,-.007,-.0531]};
    const result={poses:[],actions:[],samples:0,hanYangDirectionDiagnostics:{schema:1,
      frame:"Actual hand bone matrix multiplied by its captured anatomical palm frame; +Z is palm-forward and +Y dorsal. Full matrix inversion removes foreground/FOV scale.",
      method:"Every actual 60fps frame touching a packetClip/packetPress/packetBolt transition: all five posed MCP/PIP/DIP joints and a fixed bind-selected distal skin cap (most distal 10% of >95%-weighted distal vertices). Directions are normalized in the current palm frame.",
      interpretation:"contactProbeDigits lists the distance probes, not measured forces. Other digits are non-bearing candidates for review. Directions/angles have no naturalness thresholds and do not test axial twist, nail orientation or skin self-intersection."},
      hanYangLeftSupportDiagnostics:{distalWeightMinimum:.95,maximumBindDorsalDot:-.3,minimumVolarVertices:20,
        method:"Actual GLB bind NORMAL transformed by NormalMatrix(handInverseBind * mesh.bindMatrix) into hand-rest-local coordinates. Four fingers reject normals with dorsal dot >= -0.3. Thumb uses its own captured distal hinge axis cross bind longitudinal direction as palmar reference.",
        gate:"Only actual posed distal volar skin uses the unchanged 4mm support limit. allSkinGap and markerDistance are diagnostics, never fallback acceptance."}};
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
    const SkinGap=(side,digit,triangles,distalOnly=true)=>{
      let distance=Infinity,vertices=0;
      arms.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;const a=mesh.geometry.attributes;
        const bones=new Set(mesh.skeleton.bones.map((b,i)=>{
          const name=b.name.toLowerCase().replace(/[^a-z0-9]/g,"");
          return (distalOnly?name.endsWith(side+"finger"+digit+"2"):new RegExp(side+"finger"+digit+"[012]?$").test(name))?i:-1;
        }).filter(i=>i>=0));
        if(!bones.size)return;
        for(let i=0;i<a.position.count;i++){
          let weight=0;for(let k=0;k<4;k++)if(bones.has(a.skinIndex.getComponent(i,k)))weight+=a.skinWeight.getComponent(i,k);
          if(weight<.95)continue;vertices++;
          const point=vm.rig.group.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
          distance=Math.min(distance,Nearest(point,triangles));
        }
      });
      if(vertices<20)throw new Error("Missing finger skin: "+side+digit);
      return distance;
    };
    const leftVolarCache=new WeakMap();
    const HanYangLeftVolarGap=(digit,triangles)=>{
      let entries=leftVolarCache.get(arms);
      if(!entries){
        entries=Array.from({length:5},()=>({selected:[],allDistalVertices:0,meshes:[]}));
        const hand=arms.bones.l.hand,dorsal=new THREE.Vector3(0,1,0).applyQuaternion(arms.anatomy.l.frame.quaternion).normalize();
        arms.root.traverse(mesh=>{
          if(!mesh.isSkinnedMesh)return;
          const bones=mesh.skeleton.bones,inverses=mesh.skeleton.boneInverses,handIndex=bones.indexOf(hand);
          if(handIndex<0)return;
          const a=mesh.geometry.attributes,normalMatrix=new THREE.Matrix3().getNormalMatrix(inverses[handIndex].clone().multiply(mesh.bindMatrix));
          for(let d=0;d<5;d++){
            const distal=bones.findIndex(bone=>bone.name.toLowerCase().replace(/[^a-z0-9]/g,"").endsWith("lfinger"+d+"2"));
            if(distal<0)continue;
            if(!a.normal)throw Error("Missing actual bind normals for Hanyang left support");
            let normalReference=dorsal.clone(),reference="captured palm dorsal";
            if(d===0){
              const curl=arms.anatomy.l.curls.find(entry=>entry.bone===bones[distal]);
              if(!curl)throw Error("Missing actual thumb distal hinge frame");
              const boneToHandBind=inverses[handIndex].clone().multiply(inverses[distal].clone().invert()),rotation=new THREE.Quaternion();
              boneToHandBind.decompose(new THREE.Vector3(),rotation,new THREE.Vector3());
              // The thumb pad is rotated relative to the four-finger palm.
              // Positive flexion sweeps its longitudinal direction toward
              // hingeAxis x longitudinal; negate it to retain the dorsal-dot test.
              normalReference=curl.axis.clone().applyQuaternion(rotation).cross(curl.direction).normalize().negate();
              reference="captured thumb02 hingeAxis cross bind longitudinal (negated palmar)";
            }
            let all=0,volar=0;
            for(let i=0;i<a.position.count;i++){
              let weight=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===distal)weight+=a.skinWeight.getComponent(i,k);
              if(weight<.95)continue;all++;
              const bindNormal=new THREE.Vector3().fromBufferAttribute(a.normal,i).applyMatrix3(normalMatrix).normalize();
              if(bindNormal.dot(normalReference)<-.3){entries[d].selected.push({mesh,index:i});volar++;}
            }
            entries[d].allDistalVertices+=all;
            if(all)entries[d].meshes.push({mesh:mesh.name,allDistalVertices:all,volarVertices:volar,
              bindNormalReference:reference,bindDorsalReferenceHandRest:normalReference.toArray()});
          }
        });
        for(let d=0;d<5;d++)if(entries[d].selected.length<20)throw Error("Missing actual distal volar skin: l"+d+" has "+entries[d].selected.length+" vertices");
        leftVolarCache.set(arms,entries);
      }
      const entry=entries[digit];let distance=Infinity;
      for(const {mesh,index} of entry.selected){
        const point=vm.rig.group.worldToLocal(mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        distance=Math.min(distance,Nearest(point,triangles));
      }
      return {distance,allSkinGap:SkinGap("l",digit,triangles,true),volarVertices:entry.selected.length,
        allDistalVertices:entry.allDistalVertices,maximumBindDorsalDot:-.3,method:"actual distal volar skin",meshes:entry.meshes};
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
    const rightTriggerCache=new WeakMap();
    const HanYangTriggerSkin=(target,fixed=null)=>{
      let entries=rightTriggerCache.get(arms);
      if(!entries){
        entries=[];const hand=arms.bones.r.hand,dorsal=new THREE.Vector3(0,1,0).applyQuaternion(arms.anatomy.r.frame.quaternion).normalize();
        arms.root.traverse(mesh=>{
          if(!mesh.isSkinnedMesh)return;const bones=mesh.skeleton.bones,handIndex=bones.indexOf(hand);
          const distal=bones.findIndex(b=>b.name.toLowerCase().replace(/[^a-z0-9]/g,'').endsWith('rfinger12'));
          if(handIndex<0||distal<0)return;
          const a=mesh.geometry.attributes,g=mesh.geometry,bindToHand=mesh.skeleton.boneInverses[handIndex].clone().multiply(mesh.bindMatrix);
          const bind=Array.from({length:a.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a.position,i).applyMatrix4(bindToHand));
          const normals=bind.map(()=>new THREE.Vector3()),index=g.index;
          for(let i=0;i<(index?.count||a.position.count);i+=3){
            const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),[p,q,r]=ids.map(j=>bind[j]);
            const n=q.clone().sub(p).cross(r.clone().sub(p));for(const j of ids)normals[j].add(n);
          }
          const selected=[];
          for(let i=0;i<a.position.count;i++){
            let weight=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===distal)weight+=a.skinWeight.getComponent(i,k);
            if(weight>.95&&normals[i].normalize().dot(dorsal)<-.3)selected.push(i);
          }
          if(selected.length)entries.push({mesh,selected});
        });
        if(entries.reduce((s,e)=>s+e.selected.length,0)<20)throw Error('Missing actual right index distal volar skin');
        rightTriggerCache.set(arms,entries);
      }
      const inverse=vm.rig.group.matrixWorld.clone().invert();let best=null,volarVertices=0;
      for(const entry of entries){
        const {mesh,selected}=entry,g=mesh.geometry,index=g.index;
        const points=Array.from({length:g.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        const normals=points.map(()=>new THREE.Vector3());
        for(let i=0;i<(index?.count||points.length);i+=3){
          const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),[p,q,r]=ids.map(j=>points[j]);
          const n=q.clone().sub(p).cross(r.clone().sub(p));for(const j of ids)normals[j].add(n);
        }
        volarVertices+=selected.length;
        for(const i of selected){
          if(fixed&&(fixed.mesh!==mesh||fixed.index!==i))continue;
          const point=points[i],normal=normals[i].normalize(),distance=point.distanceTo(target);
          const facing=normal.z,toTarget=distance>1e-12?normal.dot(target.clone().sub(point).divideScalar(distance)):1;
          const signedSeparation=target.z-point.z;
          if(!fixed&&(facing<=.45||toTarget<=.25||signedSeparation<-.0002))continue;
          if(!best||distance<best.distance)best={point:point.clone(),normal:normal.toArray(),distance,facing,toTarget,signedSeparation,witness:{mesh,index:i}};
        }
      }
      if(!best)throw Error('No actual volar index surface facing the real trigger');
      return {...best,volarVertices,method:'Fixed bind-selected >95% DIP volar skin; actual posed triangle normals; one hip witness tracked through ADS/fire'};
    };
    const MagazineFingerPenetration=(part,includeHand=false)=>{
      // Only the actual prop subtree is an obstacle here. Per-shell BVH
      // containment inspects all depths and mixed finger skin, with no 12mm
      // early exit and no receiver/contact-region exemption.
      const sample=magazineClearance.Measure({weaponGroup:vm.rig.group,arms,roots:[part],magazine:part,contactClass:"magazineGrip"});
      // MCP skin blended with the palm may be classified as Hand. Include it
      // for Hanyang loading, rather than losing it through a dominant-bone label.
      const Region=region=>/^Finger[0-4]$/.test(region)||(includeHand&&region==="Hand");
      const fingers=sample.rows.filter(row=>Region(row.region));
      return {vertices:Object.entries(sample.coverage).filter(([region])=>Region(region)).reduce((sum,[,count])=>sum+count,0),
        inside:fingers.reduce((sum,row)=>sum+row.interiorVertices,0),maxDepth:Math.max(0,...fingers.map(row=>row.maxDepthMm))/1000,
        closedComponents:sample.obstacles.reduce((sum,row)=>sum+row.closedComponents,0),
        openComponents:sample.obstacles.reduce((sum,row)=>sum+row.openComponents,0),
        crossingTriangles:fingers.reduce((sum,row)=>sum+row.crossingSkinTriangles,0),coverage:sample.coverage,
        measuredRegions:includeHand?["Hand","Finger0","Finger1","Finger2","Finger3","Finger4"]:["Finger0","Finger1","Finger2","Finger3","Finger4"]};
    };
    const directionCache=new WeakMap();
    const HanYangFingerDirections=()=>{
      let entries=directionCache.get(arms);
      if(!entries){
        entries=Array.from({length:5},(_,digit)=>{
          const mcp=arms._FingerRoot("r",digit),pip=mcp.children.find(bone=>bone.isBone),dip=pip?.children.find(bone=>bone.isBone);
          if(!pip||!dip)throw Error("Missing actual Hanyang finger chain: "+digit);
          const entry={digit,mcp,pip,dip,tips:[],distalAxis:null};
          arms.root.traverse(mesh=>{
            if(!mesh.isSkinnedMesh)return;
            const distal=mesh.skeleton.bones.indexOf(dip),middle=mesh.skeleton.bones.indexOf(pip);
            if(distal<0||middle<0)return;
            const inverses=mesh.skeleton.boneInverses,dipBind=inverses[distal].clone().invert(),pipBind=inverses[middle].clone().invert();
            const axis=new THREE.Vector3().setFromMatrixPosition(dipBind)
              .sub(new THREE.Vector3().setFromMatrixPosition(pipBind)).transformDirection(inverses[distal]);
            entry.distalAxis ||= axis;
            const a=mesh.geometry.attributes,candidates=[];
            for(let i=0;i<a.position.count;i++){
              let weight=0;for(let k=0;k<4;k++)if(a.skinIndex.getComponent(i,k)===distal)weight+=a.skinWeight.getComponent(i,k);
              if(weight<.95)continue;
              const bindPoint=new THREE.Vector3().fromBufferAttribute(a.position,i).applyMatrix4(mesh.bindMatrix).applyMatrix4(inverses[distal]);
              candidates.push({mesh,index:i,along:bindPoint.dot(axis)});
            }
            candidates.sort((a,b)=>b.along-a.along);
            entry.tips.push(...candidates.slice(0,Math.max(3,Math.ceil(candidates.length*.10))));
          });
          if(entry.tips.length<3||!entry.distalAxis)throw Error("Missing actual Hanyang distal skin: "+digit);
          return entry;
        });
        directionCache.set(arms,entries);
      }
      const hand=arms.bones.r.hand,frame=arms.anatomy.r.frame;
      const palmInverse=hand.matrixWorld.clone().multiply(new THREE.Matrix4().compose(frame.position,frame.quaternion,new THREE.Vector3(1,1,1))).invert();
      const Point=bone=>bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(palmInverse);
      return entries.map(entry=>{
        const mcp=Point(entry.mcp),pip=Point(entry.pip),dip=Point(entry.dip),tip=new THREE.Vector3();
        for(const {mesh,index} of entry.tips)tip.add(mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(palmInverse));
        tip.divideScalar(entry.tips.length);
        const direction=tip.clone().sub(dip).normalize();
        return {digit:entry.digit,tipSkinVertices:entry.tips.length,
          mcpToPipPalm:pip.clone().sub(mcp).normalize().toArray(),pipToDipPalm:dip.clone().sub(pip).normalize().toArray(),
          distalBoneAxisPalm:entry.dip.localToWorld(entry.distalAxis.clone()).applyMatrix4(palmInverse).sub(dip).normalize().toArray(),
          distalSkinTipPalm:direction.toArray(),distalSagittalDeg:THREE.MathUtils.radToDeg(Math.atan2(-direction.y,direction.z)),
          distalLateralDeg:THREE.MathUtils.radToDeg(Math.atan2(direction.x,Math.hypot(direction.y,direction.z)))};
      });
    };
    const BoltKnobTriangles=part=>{
      const center=vm.rig.group.worldToLocal(vm.rig.boltHandleNode.getWorldPosition(new THREE.Vector3()));
      const surface=CreateReloadClearanceGeometry(THREE).Surface(Triangles(part));
      const sphere=surface.components.find(component=>{
        const size=component.tree.box.getSize(new THREE.Vector3());
        return component.closed&&[size.x,size.y,size.z].every(v=>v>.018&&v<.028)
          &&component.tree.box.getCenter(new THREE.Vector3()).distanceTo(center)<.002;
      });
      if(!sphere)throw Error('Missing real closed Hanyang bolt knob');
      const triangles=[],Read=node=>{if(node.list)triangles.push(...node.list.map(item=>item.triangle));else{Read(node.left);Read(node.right);}};
      Read(sphere.tree);return triangles;
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
      let hipTriggerSkin=null,hipTriggerJoints=null;
      for(const pose of ["hip","ads","fire"]){
        editor.SetPose(pose==="ads"?"ads":"hip");for(let i=0;i<90;i++)editor.Update(1/60);
        if(pose==="fire"){vm.TriggerFire();editor.Update(1/120);}
        Refresh();let point=Pad("r",1);const markerPoint=point.clone(),bone=pads[id+'r1'].bone;
        const normal=new THREE.Vector3(0,1,0).transformDirection(vm.rig.group.matrixWorld.clone().invert().multiply(bone.matrixWorld));
        const indexJoints=arms.fingerBones.r.filter(b=>/finger1[12]?$/i.test(b.name));
        const actualTrigger=id==='HanYang'?HanYangTriggerSkin(target,hipTriggerSkin?.witness):null;
        if(actualTrigger&&pose==='hip'){hipTriggerSkin=actualTrigger;hipTriggerJoints=indexJoints.map(b=>b.quaternion.clone());}
        if(actualTrigger)point=actualTrigger.point;
        const gunSurface=id!=="ServicePistol"&&id!=="Zb26"?Triangles(vm.rig.group,o=>o.name.startsWith(id+"_")):null;
        const markerDistances=gunSurface?[0,1,2,3,4].map(digit=>Nearest(Pad("l",digit),gunSurface)):[];
        const supportSamples=id==="HanYang"?markerDistances.map((markerDistance,digit)=>({digit,markerDistance,...HanYangLeftVolarGap(digit,gunSurface)}))
          :markerDistances.map((distance,digit)=>({digit,distance,markerDistance:distance,method:"legacy pad marker"}));
        const support=supportSamples.map(sample=>sample.distance);
        const zbContact=id==='Zb26'?MeasureZbContactGeometry(THREE,{weaponGroup:vm.rig.group,arms}):null;
        result.poses.push({id,pose,support,supportSamples,supportPoints:gunSurface?[0,1,2,3,4].map(digit=>Pad("l",digit).toArray()):[],point:point.toArray(),trigger:target?.toArray(),distance:target?point.distanceTo(target):Infinity,
          facing:actualTrigger?.facing??normal.z,holdingDrift:pose==="ads"?point.distanceTo(actualTrigger?hipTriggerSkin.point:hip):0,
          triggerTravel:pose==="fire"?point.distanceTo(actualTrigger?hipTriggerSkin.point:hip):0,
          legacyTriggerMarkerDistance:target?markerPoint.distanceTo(target):Infinity,
          actualTriggerSkin:actualTrigger?{method:actualTrigger.method,volarVertices:actualTrigger.volarVertices,mesh:actualTrigger.witness.mesh.name,index:actualTrigger.witness.index,
            normal:actualTrigger.normal,normalDotToTarget:actualTrigger.toTarget,signedSeparation:actualTrigger.signedSeparation,
            sameHipWitness:actualTrigger.witness.mesh===hipTriggerSkin.witness.mesh&&actualTrigger.witness.index===hipTriggerSkin.witness.index,
            jointRotationChangeRad:Math.max(...indexJoints.map((b,i)=>b.quaternion.angleTo(hipTriggerJoints[i])))}:null,
          wrist:{...arms.wristBend},supportSkin:zbContact?.support??null,triggerSkin:zbContact?.trigger??null});
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
        if(id==="HanYang")row.handDirectionSamples=[];
        for(let frame=0;vm.action&&frame<1200;frame++){
          editor.Update(1/60);Refresh();result.samples++;
          const t=vm.action?.t??1,grip=Math.max(arms.gripError.r,arms.gripError.l),wrist=Math.max(arms.wristBend.r,arms.wristBend.l);
          if(grip>row.maxGrip)row.worstGrip={t,grip};
          if(wrist>row.maxWrist)row.worstWrist={t,wrist,bySide:{...arms.wristBend},reach:{...arms.reachRatio}};
          row.maxGrip=Math.max(row.maxGrip,grip);row.maxWrist=Math.max(row.maxWrist,wrist);
          if(!arms.reachable.r||!arms.reachable.l)row.unreachable++;
          arms.fingerBones.r.concat(arms.fingerBones.l).forEach((b,i)=>row.maxFingerTranslation=Math.max(row.maxFingerTranslation,b.position.distanceTo(originalPositions[i])));
          if(id==="HanYang"&&vm.action){
            const operation=arms.operationPose.r,phase={packetClip:"packet",packetPress:"press",packetBolt:"bolt"};
            const dominant=(operation?.shapeMix||0)<.5?operation?.shape:operation?.nextShape;
            let kind=phase[dominant]||phase[operation?.shape]||phase[operation?.nextShape];
            if(kind){
              if(kind==="packet"&&vm.usedPacketProp.visible)kind="oldPacket";
              const contactDigits=kind==="press"?[0]:[0,1];
              row.handDirectionSamples.push({frame,t,kind,side:"r",shape:operation.shape,nextShape:operation.nextShape,
                shapeMix:operation.shapeMix,digitMix:operation.digitMix,contactWeight:arms.contactWeight.r,
                packetVisible:vm.packetProp.visible,oldPacketVisible:vm.usedPacketProp.visible,
                contactProbeDigits:contactDigits,nonContactProbeDigits:[0,1,2,3,4].filter(digit=>!contactDigits.includes(digit)),
                digits:HanYangFingerDirections()});
            }
          }
          if(frame%5||!vm.action)continue;
          let prop=null,side="r",digits=[0,1],kind="";
          if(action==="bolt"&&t>.25&&t<.78){prop=vm.rig.parts.bolt;kind="bolt";}
          if(action.startsWith("reload")){
            if(["ZhongZheng","HanYang","Type38"].includes(id)){
              const packet=id==="HanYang",partial=packet&&action==="reloadPartial",held=packet?vm.packetProp:vm.clipProp;
              const packetHand=FPS_PACKET_RELOAD.tactical.hand;
              const partialClipAt=packetHand.find(point=>point.anchor==="clip").at;
              const partialOldAt=packetHand.find(point=>point.anchor==="oldClip").at;
              if((t>(partial ? partialClipAt+.005 : .33)&&t<(partial ? .52 : .48))||(!packet&&t>.71&&t<.75)){
                // A rigid loaded packet is supported on its rear frame and
                // cartridge cases; the index can bear on a case rather than
                // the metal frame. Query that complete assembly at the same 3mm gate.
                prop=packet?held:held.userData.body;kind=packet?"packet":"clip";
              }else if(t>(partial ? .60 : .56)&&t<(partial ? .68 : .63)){prop=held.userData.rounds;digits=[0];kind="press";}
              else if(partial&&t>partialOldAt+.005&&t<FPS_PACKET_RELOAD.tactical.oldClipVisible[1]){prop=vm.usedPacketProp;kind="oldPacket";}
            }else if(id==="Zb26"&&((t>.17&&t<.30)||(t>.58&&t<.73))){prop=vm.rig.parts.magazine;digits=[0,1,2];kind="magazine";}
            else if(id==="ServicePistol"){
              side="l";
              if((t>.17&&t<.27)||(t>.52&&t<.69)){prop=vm.magazineProp;kind="pistolMagazine";}
              else if(t>.81&&t<.89){prop=vm.rig.parts.bolt;kind="slide";}
            }else if(id==="Type11"&&t>.20&&t<.80&&((t-.20)%.10)<.032){prop=vm.clipProp.userData.body;kind="hopperClip";}
          }
          if(prop){
            const zbMagazine=id==="Zb26"&&kind==="magazine";
            const hanBolt=id==="HanYang"&&kind==="bolt";
            const hanLoading=id==="HanYang"&&["packet","oldPacket","press"].includes(kind);
            const skinContact=(id==="HanYang"&&["packet","oldPacket","press","bolt"].includes(kind))||kind==="hopperClip"||zbMagazine;
            // The opposed knob grip bears on the volar thumb across its IP
            // crease. Measure that actual skin against the isolated knob,
            // rather than a box-derived marker on the other side of the digit.
            const triangles=hanBolt?BoltKnobTriangles(prop):Triangles(prop);
            for(const digit of digits)row.propSamples.push({t,kind,digit,skinContact,
              distance:skinContact?SkinGap(side,digit,triangles,!hanBolt):Nearest(Pad(side,digit),triangles)});
            if(skinContact&&frame%15===0){
              if(hanLoading){
                const whole=kind==="oldPacket"?vm.usedPacketProp:vm.packetProp;
                row.skinSamples.push({t,kind,sourceProp:kind==="oldPacket"?"usedPacketProp":"packetProp",...MagazineFingerPenetration(whole,true)});
              }else if(zbMagazine||hanBolt)row.skinSamples.push({t,kind,...MagazineFingerPenetration(prop)});
              else row.skinSamples.push({t,kind,...FingerPenetration("r",vm.clipProp)});
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
    if(pose.id!=='Zb26')Check(pose.distance<(pose.id==='HanYang'?.004:.006),`${pose.id} ${pose.pose}: index pad misses trigger by ${(pose.distance*1000).toFixed(1)} mm`);
    if(pose.id==='HanYang'){
      const skin=pose.actualTriggerSkin;
      Check(skin?.volarVertices>=20&&skin.sameHipWitness,`${pose.id} ${pose.pose}: actual fixed volar skin witness required`);
      Check(skin?.normalDotToTarget>.25&&skin.signedSeparation>=-.0002,`${pose.id} ${pose.pose}: trigger must lie in front of the actual palm pad`);
      if(pose.pose==='fire')Check(skin?.jointRotationChangeRad>.001,`${pose.id}: firing must rotate the actual index joints`);
    }
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
      if(action.id==="HanYang")for(const sample of loading){
        Check([0,1,2,3,4].every(digit=>sample.coverage?.["Finger"+digit]>0)&&sample.coverage?.Hand>0,
          `HanYang ${sample.kind}: all five fingers and mixed palm/MCP skin must be measured against the actual prop`);
        Check(sample.closedComponents>0,`HanYang ${sample.kind}: actual ammunition must provide closed-component containment evidence`);
      }
      for(const sample of loading)Check(sample.maxDepth<.002,`${action.id} ${sample.kind}: finger skin penetrates ammunition ${(sample.maxDepth*1000).toFixed(2)} mm at ${sample.t.toFixed(3)}`);
    }
    if(action.id==="Zb26"&&action.action.startsWith("reload")){
      const loading=action.skinSamples.filter(sample=>sample.kind==="magazine"),contacts=action.propSamples.filter(sample=>sample.kind==="magazine");
      Check([0,1,2].every(digit=>contacts.some(sample=>sample.digit===digit&&sample.skinContact)),"Zb26: magazine contact must sample actual thumb/index/middle distal skin");
      Check(loading.length>0&&loading.every(sample=>sample.vertices>4000&&[0,1,2,3,4].every(digit=>sample.coverage["Finger"+digit]>0)),"Zb26: magazine grip did not inspect complete finger skin");
      for(const sample of loading){
        Check(sample.closedComponents>0&&sample.openComponents===0,"Zb26: real magazine must provide closed-shell penetration evidence");
        Check(sample.maxDepth<.002,`Zb26 magazine: finger skin penetrates ${(sample.maxDepth*1000).toFixed(2)} mm at ${sample.t.toFixed(3)}`);
      }
    }
    if(action.id==="HanYang"&&action.action==="bolt"){
      Check(action.skinSamples.length>0&&action.skinSamples.every(sample=>sample.vertices>4000),"HanYang: knob grasp must inspect complete finger skin");
      for(const sample of action.skinSamples)Check(sample.maxDepth<.002,`HanYang bolt: finger skin penetrates ${(sample.maxDepth*1000).toFixed(2)} mm`);
    }
    if(action.id==="HanYang"){
      Check(action.handDirectionSamples.length>0,"HanYang: no actual palm-frame finger directions recorded");
      for(const sample of action.handDirectionSamples)Check(sample.digits.length===5&&sample.digits.every(digit=>
        digit.tipSkinVertices>=3&&[...digit.mcpToPipPalm,...digit.pipToDipPalm,...digit.distalBoneAxisPalm,...digit.distalSkinTipPalm,
          digit.distalSagittalDeg,digit.distalLateralDeg].every(Number.isFinite)),
      `HanYang ${sample.kind}: actual finger direction diagnostics are incomplete at ${sample.t.toFixed(3)}`);
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
