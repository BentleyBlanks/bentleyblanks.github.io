import { ClusterDistantGeometry } from "./Script_DistantGeometry.mjs";
import * as THREE from "three";
import { ACTOR_DETAIL } from "./Data_Tuning_Ai.mjs";
import { BLOOD_DRESSING as BLOOD } from "./Data_Tuning_Blood.mjs";
import { MISSION_PEOPLE_TUNING as C, MISSION_BODY_SUPPORT } from "./Data_Tuning_FirstLevel.mjs";
import { MissionTrainLifePose } from "./Script_FirstLevelMissionTrainLife.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";

import { MISSION_AFTERMATH } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_CIVILIAN_AFTERMATH } from "./Data_FirstLevelMissionCivilianAftermath.mjs";
import { CreateBodyContactShape, MissionBodySupport } from "./Script_FirstLevelMissionBodySupport.mjs";

// Historical casualties: military poses plus four adult civilian bakes, drawn with three
// distance tiers. No AI, tickets, collision walls or animation mixers are added for them.
//
// 2026-09-08 rewrite. The previous version cloned every body's full geometry into
// per-sector static meshes: 141 bodies = 1.2 M triangles and 373 draw calls per frame,
// 5 ms of a 17 ms GPU frame, plus a per-frame name-parsing walk over every sector mesh.
// Tripling the count that way was impossible. Now:
//   · geometry lives once per pose (detail / mid / far), instances carry only a matrix;
//   · every frame does its own frustum + distance test and compacts the instance tables
//     (InstancedMesh cannot cull per instance; the whole-scene table has no sectors);
//   · only the detail tier casts shadows, and only when the camera is near enough;
//   · materials are cloned from the live actor materials so the static instances never
//     share a material object with skinned meshes (see CloneShadedMaterial).
// 距离档表（`MISSION_PEOPLE_TUNING.aftermathTiers`）：`cellM` 是合点格子（0 = 原模），
// `enterM` / `exitM` 是这一档与下一档之间那条界的进入 / 退出距离（迟滞，免得边界上的
// 尸体来回跳档）。最后一档不需要界。
//
// 【2026-09-09 加一档不划算，量过】原来 15 m 以内一律用原模（一具约 13 000 三角），
// 前沿玩家站在尸堆里，这一档同时有 25 具 —— 每帧 100 万三角。试过在 6.5–15 m 之间
// 插一档 2 cm 合点，交替 A/B 四轮：三角形 3.99 M → 3.68 M，**draw call 1010 → 1119**，
// 帧时间在噪音里。原因是**一具尸体有 7 个材质**（7 张各自不同的贴图），8 种姿势 × 7
// = 56 只网格：**每多开一档就多 56 只网格 ≈ 110 个 draw call**，而这一帧的瓶颈是提交
// （20 ms / 1000 draw ≈ 每个 20 µs），不是三角形。所以档表保持三档。
//
// 真要把尸体的提交量压下来，得先把那 7 张贴图合成一张图集、7 个材质并成一个 ——
// 那时候一档只要 8 只网格，加档才重新变得便宜。人群远景层（每档也是 7 个材质桶）
// 是同一笔账，见 docs/Data_ActorCrowdLod.md §4.1。
const TIERS = C.aftermathTiers.length;
const _frustum = new THREE.Frustum();
const _matrix = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _quaternion = new THREE.Quaternion();

export class MissionAftermath {
  constructor({root,battlefield,actorFactory,vfx,bodies=[...MISSION_AFTERMATH,...MISSION_CIVILIAN_AFTERMATH]}) {
    this.root=new THREE.Group();this.root.name="MissionBattlefieldAftermath";root.add(this.root);
    this.materials=new Map();this.clones=[];
    this.bloodLayer=vfx?.CreateBloodDecalLayer(this.root,bodies.length);
    this.prototypes=new Map();
    this.instances=[];
    this.lastFocus=new THREE.Vector3(NaN,NaN,NaN);this.lastQuaternion=new THREE.Quaternion(0,0,0,0);this.frames=0;
    const groundAt=(x,z)=>(battlefield.StaticGroundHeight||battlefield.GroundHeight).call(battlefield,x,z);
    const support=new MissionBodySupport(groundAt);
    const contactShapes=new Map(),settleStart=performance.now();
    // Ground layer first, then authored upper bodies; stable order makes restarts identical.
    for(const spec of [...bodies].sort((a,b)=>(a.pile||0)-(b.pile||0))){
      const key=spec.side+(spec.variant||"")+spec.pose;
      let prototype=this.prototypes.get(key);
      if(!prototype){
        const parts=BakeMissionBody(actorFactory,spec,this.materials).map(part=>{
          const source=this.materials.get(part.key);
          const material=CloneShadedMaterial(source);this.clones.push(material);
          const tiers=C.aftermathTiers.map(t=>t.cellM>0?CreateDistantBodyGeometry(part.geometry,t.cellM):part.geometry);
          return {material,tiers,triangles:tiers.map(Triangles)};
        });
        prototype={key,parts,members:[],meshes:[]};
        this.prototypes.set(key,prototype);
        contactShapes.set(key,CreateBodyContactShape(parts));
      }
      const shape=contactShapes.get(key),settled=support.Settle(shape,spec),matrix=settled.matrix;
      // Authored upper bodies rest on the ground layer; never grow accidental
      // towers by feeding one upper body's height into the next upper body.
      if(!spec.pile)support.Add(shape,matrix);
      const instance={id:spec.id,side:spec.side,houseId:spec.houseId,x:spec.x,y:settled.center.y,z:spec.z,
        center:settled.center,radius:settled.radius,matrix,tier:TIERS-1,prototype};
      this.instances.push(instance);prototype.members.push(instance);
      // Reuse the same projected material as fresh combat blood, aged and restrained.
      const stain=new THREE.Vector3(...BLOOD.offset).applyMatrix4(matrix);
      stain.y=groundAt(stain.x,stain.z);
      const e=BLOOD.normalSampleM,n=new THREE.Vector3(groundAt(stain.x-e,stain.z)-groundAt(stain.x+e,stain.z),2*e,
        groundAt(stain.x,stain.z-e)-groundAt(stain.x,stain.z+e)).normalize();
      this.bloodLayer?.Add(stain,n,Math.max(BLOOD.minRadius,spec.blood*BLOOD.radiusScale),
        {now:vfx.time,age:BLOOD.age+spec.pose*BLOOD.ageStep,pool:true,aspect:BLOOD.aspect,opacity:BLOOD.opacity,
          seed:((spec.x*7.31+spec.z*3.19)%1+1)%1});
    }
    this.settleMs=performance.now()-settleStart;
    // One instance table per part and tier, sized to the pose's member count.
    for(const prototype of this.prototypes.values()){
      for(const part of prototype.parts){
        part.meshes=part.tiers.map((geometry,tier)=>{
          const mesh=new THREE.InstancedMesh(geometry,part.material,Math.max(1,prototype.members.length));
          mesh.name=`MissionAftermath_${prototype.key}_${tier}`;
          mesh.frustumCulled=false;mesh.count=0;
          // 只有最近那一档投阴影（`ACTOR_DETAIL.shadowM` 以外的尸体在阴影图里看不见）。
          mesh.castShadow=tier===0;mesh.receiveShadow=true;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.root.add(mesh);return mesh;
        });
      }
    }
    this.bloodMeshes=this.bloodLayer?[this.bloodLayer.mesh]:[];
    this.count=bodies.length;
    // Budget report: what the whole field would cost at every tier.
    // 名字保持 detail / distant / far（`FirstLevelMissionPresentationTest` 按它断言），
    // 档表要是加到四档以上，多出来的按 tier<n> 记。
    this.triangles={};this.visible={};
    for(let tier=0;tier<TIERS;tier++){this.triangles[TierName(tier)]=0;this.visible[TierName(tier)]=0;}
    for(const prototype of this.prototypes.values())for(const part of prototype.parts)
      for(let tier=0;tier<TIERS;tier++) this.triangles[TierName(tier)]+=part.triangles[tier]*prototype.members.length;
  }
  /**
   * Compact the instance tables for this camera. Runs every frame but only rewrites the
   * tables when the focus moved or the view turned; the tests measure this path.
   * @param {THREE.Vector3} focus  player position (distance tiers)
   * @param {THREE.Camera} [camera] frustum source; without it every body in range is kept
   */
  Update(focus,camera=null){
    if(!focus)return;
    this.frames++;
    let dirty=this.frames<3||this.lastFocus.distanceToSquared(focus)>C.aftermathRefreshM**2;
    if(camera){
      camera.updateMatrixWorld();
      _quaternion.setFromRotationMatrix(camera.matrixWorld);
      if(Math.abs(_quaternion.dot(this.lastQuaternion))<1-C.aftermathRefreshDot)dirty=true;
    }
    if(!dirty)return;
    this.lastFocus.copy(focus);if(camera)this.lastQuaternion.copy(_quaternion);
    if(camera){
      _matrix.copy(camera.matrixWorld).invert().premultiply(camera.projectionMatrix);
      _frustum.setFromProjectionMatrix(_matrix);
    }
    // 档界：bounds[t] 是第 t 档与第 t+1 档之间那一条（最后一档没有界）。
    const bounds=this.bounds||(this.bounds=C.aftermathTiers.slice(0,-1)
      .map(t=>({enter:t.enterM**2,exit:t.exitM**2})));
    const shadow=ACTOR_DETAIL.shadowM**2;
    const visible=this.visible;for(const key in visible)visible[key]=0;
    for(const prototype of this.prototypes.values()){
      for(const part of prototype.parts)for(const mesh of part.meshes)mesh.count=0;
      for(const instance of prototype.members){
        const dx=instance.x-focus.x,dz=instance.z-focus.z,d2=dx*dx+dz*dz;
        // Hysteresis per body so a corpse on the boundary does not flicker between tiers.
        let tier=instance.tier;
        while(tier>0&&d2<=bounds[tier-1].enter)tier--;
        while(tier<TIERS-1&&d2>bounds[tier].exit)tier++;
        instance.tier=tier;
        if(camera){
          _sphere.center.copy(instance.center);_sphere.radius=instance.radius;
          // Bodies just outside the view still throw shadows into it; keep the near ones.
          if(!_frustum.intersectsSphere(_sphere)&&!(tier===0&&d2<=shadow))continue;
        }
        for(const part of prototype.parts){const mesh=part.meshes[tier];mesh.setMatrixAt(mesh.count++,instance.matrix);}
        visible[TierName(tier)]++;
      }
      for(const part of prototype.parts)for(const mesh of part.meshes){mesh.instanceMatrix.needsUpdate=true;mesh.visible=mesh.count>0;}
    }
  }
  Bake(factory,spec){return BakeMissionBody(factory,spec,this.materials);}
  Dispose(){
    this.root.removeFromParent();
    for(const prototype of this.prototypes.values())for(const part of prototype.parts){for(const g of part.tiers)g.dispose();for(const m of part.meshes)m.dispose?.();}
    this.bloodLayer?.Dispose();
    for(const material of this.clones)material.dispose();
  }
}

function Triangles(geometry){return (geometry.index?.count||geometry.attributes.position.count)/3;}
/** 档位名（预算报表与 `FirstLevelMissionPresentationTest` 用的就是这三个名字）。 */
function TierName(tier){return ["detail","distant","far"][tier]??`tier${tier}`;}

export function BakeMissionBody(factory,spec,materials){
    const actor=factory.Create(spec.side,{weapon:null,variant:spec.variant,modelVariant:spec.pose,seed:1938+spec.pose});
    actor.Update(.5,{elapsed:spec.pose*.47});
    if(spec.patient)actor.root.rotation.set(Math.PI/2,0,0);
    else {actor.Ragdoll(new THREE.Vector3(spec.pose%2?.7:-.6,0,spec.pose<2?-1:1));
      actor.Update(1,{dead:true,dying:1,elapsed:2});}
    if(actor.characterRig && !spec.patient){
      // The falling root retains impact yaw/roll. Baking that as rest leaves the
      // helmet as the only floor contact and props up the entire torso and legs.
      actor.body.rotation.set(-actor.ragdollState.forward*Math.PI/2,0,0);
      const skeletons=new Set();
      actor.characterRig.root.traverse(mesh=>{if(mesh.skeleton)skeletons.add(mesh.skeleton);});
      const bones=[...new Set([...skeletons].flatMap(s=>s.bones))].map(b=>({b,p:b.position.clone(),s:b.scale.clone(),q:b.quaternion.clone()}));
      for(const skeleton of skeletons)skeleton.pose();
      // GLB bind matrices include the source centimetre root. Keep the production
      // root and animated translations/scales, taking only joint rest rotations.
      for(const {b,p,s,q} of bones){b.position.copy(p);b.scale.copy(s);if(!b.parent?.isBone)b.quaternion.copy(q);}
    }
    if(spec.side==="civilian" && !actor.characterRig && !spec.patient){
      // These segmented civilian models use the procedural bones. Settle them
      // in the ground plane instead of freezing the generic falling knee/arm curl.
      actor.body.rotation.set(spec.pose%2?Math.PI/2:-Math.PI/2,0,0);
      actor.hips.rotation.set(0,0,0);actor.chest.rotation.set(0,0,0);
      actor.neck.rotation.set(0,spec.pose%2?.35:-.28,0);
      for(const tag of ["L","R"]){
        const side=tag==="L"?-1:1,leg=actor.legs[tag],arm=actor.arms[tag];
        leg.thigh.rotation.set(0,0,side*(tag==="L"?.16:.27));
        leg.knee.rotation.set(0,0,side*(spec.pose%2?.12:.04));
        leg.ankle.rotation.set(0,0,0);
        arm.shoulder.rotation.set(0,0,side*(tag==="L"?.65:.32));
        arm.elbow.rotation.set(0,0,side*(spec.pose%2?.35:.15));
      }
    }
    // Settle the imported skeleton itself. The generic death root alone leaves
    // hands frozen in the source rifle pose and bent knees pointing into the air.
    if(actor.characterRig){
      const pose=new MissionTrainLifePose({actor}),b=actor.characterRig.bones;pose.basis=spec.patient?new THREE.Group():actor.root;
      actor.root.updateWorldMatrix(true,true);
      const pelvis=pose.basis.worldToLocal(pose.World(b.pelvis)),head=pose.basis.worldToLocal(pose.World(b.head));
      const direction=Math.sign(head.z-pelvis.z)||-1, floor=pelvis.y-.03;
      for(const side of ["L","R"]){
        const sign=side==="L"?-1:1,variant=spec.pose;
        pose.Chain(b["upperArm"+side],b["forearm"+side],b["hand"+side],
          pose.Local(sign*(spec.patient?.13:variant===1?.62:.46),floor+(spec.patient?.12:0),pelvis.z+direction*(spec.patient?.22:side==="L"?.6:.12)),
          pose.Local(sign*(spec.patient?.26:.72),floor+.025,pelvis.z+direction*.45));
        pose.Chain(b["thigh"+side],b["calf"+side],b["foot"+side],
          pose.Local(sign*(spec.patient?.105:variant===2?.42:.21),floor,pelvis.z-direction*(spec.patient?.98:side==="L"?.83:.98)),
          pose.Local(sign*(spec.patient?.14:.43),floor+.025,pelvis.z-direction*.48));
      }
      pose.Tilt(b.head,0,0,spec.patient?.06:spec.pose%2?.6:-.5);
    }
    actor.root.updateMatrixWorld(true);
    const parts=[],point=new THREE.Vector3(),bounds=new THREE.Box3();
    // The asset loader keeps a procedural actor when a character download fails.
    // Bake that visible fallback too; a missing optional mesh must not prevent boot.
    (actor.characterRig?.root||actor.body).traverseVisible(mesh=>{
      if(!mesh.isMesh||!mesh.visible)return;
      mesh.skeleton?.update();
      let geometry=mesh.geometry.clone();
      const pos=geometry.attributes.position;
      for(let i=0;i<pos.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);pos.setXYZ(i,point.x,point.y,point.z);}
      geometry.deleteAttribute("skinIndex");geometry.deleteAttribute("skinWeight");
      geometry.computeVertexNormals();geometry.computeBoundingBox();bounds.union(geometry.boundingBox);
      const meshMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if(meshMaterials.length===1){
        const key="Body_"+meshMaterials[0].uuid;materials.set(key,meshMaterials[0]);parts.push({key,geometry});
      }else{
        const flat=geometry.index?geometry.toNonIndexed():geometry;
        for(const group of geometry.groups){
          const g=new THREE.BufferGeometry();
          for(const [name,attr] of Object.entries(flat.attributes)){
            g.setAttribute(name,new THREE.BufferAttribute(attr.array.slice(group.start*attr.itemSize,(group.start+group.count)*attr.itemSize),attr.itemSize,attr.normalized));
          }
          const mat=meshMaterials[group.materialIndex],key="Body_"+mat.uuid;materials.set(key,mat);parts.push({key,geometry:g});
        }
        if(flat!==geometry)flat.dispose();geometry.dispose();
      }
    });
    const center=bounds.getCenter(new THREE.Vector3());
    for(const part of parts)part.geometry.translate(-center.x,-bounds.min.y,-center.z);
    if(!spec.patient){
      const settled=new MissionBodySupport(()=>0).Settle(CreateBodyContactShape(parts),{x:0,z:0,yaw:0,scale:1});
      // Share the settled rest pose across every terrain placement and all LODs.
      settled.matrix.elements[13]-=MISSION_BODY_SUPPORT.clearanceM;
      for(const part of parts)part.geometry.applyMatrix4(settled.matrix);
    }
    actor.Dispose();return parts;
  }

// Vertex clustering for already settled bodies: 5 cm keeps the silhouette past 15 m,
// 14 cm is enough for the far tier where a body is a few pixels long.
// Positions take the cluster centroid; uv and normal come from one representative vertex.
// Averaging them was the "black bodies" bug: a cell straddling two atlas islands samples
// an unused (black) texel, and a cell spanning both sides of a sleeve cancels the normal.
export function CreateDistantBodyGeometry(source,cellM=C.aftermathCellM){
  return ClusterDistantGeometry(source,cellM);
}
