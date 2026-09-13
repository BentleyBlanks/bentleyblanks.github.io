import * as THREE from "three";
import { TYPE89_DAMAGE as D } from "./Data_Type89Damage.mjs";
import { MISSION_TUNING as R } from "./Data_Tuning_FirstLevel.mjs";

// All fracture geometry and motion are authored/baked in Blender. Ordinary rigid
// Mesh transforms participate in the shared velocity/depth/shadow passes.
export class Type89Damage {
  constructor({ root, model, materials, vfx, groundAt }) {
    Object.assign(this,{root,model,vfx,groundAt});
    this.point=new THREE.Vector3();this.smoke=null;this.side=0;
    this.steel=new THREE.MeshStandardMaterial({color:0x34322c,roughness:.94,metalness:.12});
    this.scorch=new THREE.MeshStandardMaterial({color:0x17140e,roughness:1});
    this.parts=D.parts.map(spec=>{
      const g=new THREE.BufferGeometry(),b=spec.geometry;
      g.setAttribute("position",new THREE.Float32BufferAttribute(b.positions,3));
      g.setAttribute("normal",new THREE.Float32BufferAttribute(b.normals,3));
      g.setAttribute("uv",new THREE.Float32BufferAttribute(b.uv,2));
      g.setAttribute("uv1",new THREE.Float32BufferAttribute(b.uv,2));
      g.computeBoundingSphere();
      const mesh=new THREE.Mesh(g,spec.material==="armor"?materials.type89Armor:spec.material==="scorch"?this.scorch:this.steel);
      mesh.name=`Type89Damage_${spec.name}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.visible=false;
      (spec.attach==="hull"?model.root:root).add(mesh);
      return {spec,mesh};
    });
    const track=model.meshes.find(m=>m.material===materials.type89Track);
    const hull=model.meshes.find(m=>m.material===materials.type89Armor);
    this.track=track;this.hull=hull;
    this.trackIndex=track.geometry.index;this.hullIndex=hull.geometry.index;
    const Cut=(original,triangles)=>{
      const cut=new Set(triangles),indices=[];
      for(let i=0;i<original.count;i+=3)if(!cut.has(i/3))indices.push(original.getX(i),original.getX(i+1),original.getX(i+2));
      return new THREE.Uint16BufferAttribute(indices,1);
    };
    this.cutTrack={[-1]:Cut(this.trackIndex,D.cutTriangles["-1"]),[1]:Cut(this.trackIndex,D.cutTriangles["1"])};
    this.cutHull=Cut(this.hullIndex,D.cutTriangles.deck);
  }
  Pose(object,frames,seconds,mirror=1) {
    const frame=Math.min(frames.length-1,Math.max(0,seconds*D.fps)),a=Math.floor(frame),b=Math.min(a+1,frames.length-1),t=frame-a;
    const V=i=>frames[a][i]+(frames[b][i]-frames[a][i])*t;
    object.position.set(V(0)*mirror,V(1),V(2));
    object.rotation.set(V(3),V(4)*mirror,V(5)*mirror);
  }
  Update(time,tank) {
    const damaged=!!tank.immobilized,visible=damaged&&!!(tank.present||tank.active);
    const side=tank.damageSide===1?1:-1;
    if(damaged && this.side!==side){
      this.track.geometry.setIndex(this.cutTrack[side]);this.hull.geometry.setIndex(this.cutHull);this.side=side;
    }else if(!damaged && this.side){
      this.track.geometry.setIndex(this.trackIndex);this.hull.geometry.setIndex(this.hullIndex);this.side=0;
    }
    const elapsed=damaged?(Number.isFinite(tank.damageAt)?Math.max(0,time-tank.damageAt):D.duration):0;
    if(damaged)this.Pose(this.model.root,D.hullFrames,elapsed,-side);
    else {this.model.root.position.set(0,0,0);this.model.root.rotation.set(0,0,0);}
    this.root.updateMatrixWorld(true);
    for(const {spec,mesh} of this.parts){
      mesh.visible=visible;
      if(!visible)continue;
      const mirror=spec.mirror?-side:1;
      mesh.scale.x=mirror;this.Pose(mesh,spec.frames,elapsed,mirror);
      if(spec.attach==="ground"){
        this.point.copy(mesh.position);this.root.localToWorld(this.point);
        const floor=this.groundAt(this.point.x,this.point.z)+R.tankDamage.debrisClearanceM;
        if(this.point.y<floor){this.point.y=floor;this.root.worldToLocal(this.point);mesh.position.copy(this.point);}
      }
    }
    if(visible && elapsed>=R.tankDamage.smokeDelayS){
      this.point.fromArray(R.tankDamage.engineOutlet);this.model.root.localToWorld(this.point);
      if(this.smoke==null)this.smoke=this.vfx?.SmokeSource(this.point,R.tankDamage.smoke)??null;
      else this.vfx?.MoveSmokeSource(this.smoke,this.point);
    }else this.StopSmoke();
  }
  StopSmoke(){if(this.smoke!=null)this.vfx?.RemoveSmokeSource(this.smoke);this.smoke=null;}
  Dispose(){this.StopSmoke();this.steel.dispose();this.scorch.dispose();}
}
