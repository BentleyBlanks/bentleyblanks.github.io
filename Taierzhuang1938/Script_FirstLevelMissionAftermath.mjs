import * as THREE from "three";
import { ACTOR_DETAIL } from "./Data_Tuning_Ai.mjs";
import { MISSION_PEOPLE_TUNING as C } from "./Data_Tuning_FirstLevel.mjs";
import { MissionTrainLifePose } from "./Script_FirstLevelMissionTrainLife.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MISSION_AFTERMATH } from "./Data_FirstLevelMissionFront.mjs";

// Skin each pose once, then merge bodies by terrain sector and material.
// No AI, tickets, collision walls or animation mixers are added for historical casualties.
export class MissionAftermath {
  constructor({root,battlefield,actorFactory}) {
    this.root=new THREE.Group();this.root.name="MissionBattlefieldAftermath";root.add(this.root);
    this.materials=new Map();this.prototypes=new Map();
    this.blood=new THREE.MeshStandardMaterial({color:0x4b1110,roughness:.72,metalness:0,side:THREE.DoubleSide});
    this.materials.set("Blood",this.blood);
    const sink=new BuildSink(),distantSink=new BuildSink(),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
    for(const spec of MISSION_AFTERMATH){
      const sector="Aftermath_"+Math.floor(spec.x/28)+"_"+Math.floor(spec.z/28);sink.SetSector(sector);distantSink.SetSector(sector);
      const key=spec.side+spec.pose;
      if(!this.prototypes.has(key)){
        const parts=this.Bake(actorFactory,spec);
        for(const part of parts)part.distant=CreateDistantBodyGeometry(part.geometry);
        this.prototypes.set(key,parts);
      }
      const ground=battlefield.GroundHeight(spec.x,spec.z);
      rotation.setFromEuler(new THREE.Euler(0,spec.yaw,0));scale.setScalar(spec.scale);
      matrix.compose(new THREE.Vector3(spec.x,ground+spec.pile+.025,spec.z),rotation,scale);
      for(const part of this.prototypes.get(key)){
        sink.Add(part.key,part.geometry.clone().applyMatrix4(matrix));
        distantSink.Add(part.key,part.distant.clone().applyMatrix4(matrix));
      }
      // Irregular, terrain-conforming pools and smears; each corpse has its own outline.
      const vertices=[],count=13,angle=spec.yaw;
      const Point=(i)=>{const a=i/count*Math.PI*2,r=spec.blood*(.78+.22*Math.sin(i*2.37+spec.x));
        const x=spec.x+Math.cos(a+angle)*r,z=spec.z+Math.sin(a+angle)*r*.68;
        return [x,battlefield.GroundHeight(x,z)+.013,z];};
      const center=[spec.x,ground+.013,spec.z];
      for(let i=0;i<count;i++)vertices.push(...center,...Point(i),...Point((i+1)%count));
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
      sink.Add("Blood",g);
    }
    this.meshes=sink.Flush(this.root,{Get:key=>this.materials.get(key)});
    const distant=distantSink.Flush(this.root,{Get:key=>this.materials.get(key)});
    this.triangles={detail:this.meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),distant:distant.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0)};
    for(const m of distant){m.userData.missionDistant=true;m.visible=false;}
    this.meshes.push(...distant);
    for(const m of this.meshes){m.castShadow=m.material!==this.blood;m.receiveShadow=true;m.geometry.computeBoundingBox();}
    this.count=MISSION_AFTERMATH.length;
    for(const parts of this.prototypes.values())for(const p of parts){p.geometry.dispose();p.distant.dispose();}
    this.prototypes.clear();
  }
  Update(focus){
    if(!focus)return;
    for(const mesh of this.meshes){
      const [x,z]=mesh.name.split("|")[0].split("_").slice(-2).map(Number);
      const dx=Math.max(x*28-2-focus.x,0,focus.x-((x+1)*28+2)),dz=Math.max(z*28-2-focus.z,0,focus.z-((z+1)*28+2));
      const detail=dx*dx+dz*dz<=ACTOR_DETAIL.corpseExitM**2;
      mesh.visible=mesh.material===this.blood||(mesh.userData.missionDistant?!detail:detail);
      mesh.castShadow=mesh.visible&&mesh.material!==this.blood&&dx*dx+dz*dz<=ACTOR_DETAIL.shadowM**2;
    }
  }
  Bake(factory,spec){return BakeMissionBody(factory,spec,this.materials);}
  Dispose(){this.root.removeFromParent();for(const mesh of this.meshes)mesh.geometry.dispose();this.blood.dispose();}
}

export function BakeMissionBody(factory,spec,materials){
    const actor=factory.Create(spec.side,{weapon:null,modelVariant:spec.pose,seed:1938+spec.pose});
    actor.Update(.5,{elapsed:spec.pose*.47});
    if(spec.patient)actor.root.rotation.set(Math.PI/2,0,0);
    else {actor.Ragdoll(new THREE.Vector3(spec.pose%2?.7:-.6,0,spec.pose<2?-1:1));
      actor.Update(1,{dead:true,dying:1,elapsed:2});}
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
    actor.Dispose();return parts;
  }

// Five-centimetre vertex clustering is used only for distant, already settled bodies.
function CreateDistantBodyGeometry(source){
  const position=source.attributes.position,normal=source.attributes.normal,uv=source.attributes.uv;
  const clusters=new Map(),vertices=[],remap=[];
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i),key=[x,y,z].map(v=>Math.round(v/C.aftermathCellM)).join(",");
    let index=clusters.get(key);
    if(index===undefined){index=vertices.length;clusters.set(key,index);vertices.push({x:0,y:0,z:0,nx:0,ny:0,nz:0,u:0,v:0,count:0});}
    const p=vertices[index];p.x+=x;p.y+=y;p.z+=z;p.count++;
    if(normal){p.nx+=normal.getX(i);p.ny+=normal.getY(i);p.nz+=normal.getZ(i);}
    if(uv){p.u+=uv.getX(i);p.v+=uv.getY(i);}remap.push(index);
  }
  const indices=[],faces=new Set(),count=source.index?.count||position.count;
  for(let i=0;i<count;i+=3){
    const face=[0,1,2].map(k=>remap[source.index?source.index.getX(i+k):i+k]);
    if(new Set(face).size<3)continue;
    const key=face.slice().sort((a,b)=>a-b).join(",");if(faces.has(key))continue;faces.add(key);indices.push(...face);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices.flatMap(p=>[p.x/p.count,p.y/p.count,p.z/p.count]),3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(vertices.flatMap(p=>{const n=Math.hypot(p.nx,p.ny,p.nz)||1;return[p.nx/n,p.ny/n,p.nz/n];}),3));
  if(uv)geometry.setAttribute("uv",new THREE.Float32BufferAttribute(vertices.flatMap(p=>[p.u/p.count,p.v/p.count]),2));
  geometry.setIndex(indices);return geometry;
}
