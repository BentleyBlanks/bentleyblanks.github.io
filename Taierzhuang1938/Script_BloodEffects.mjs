import * as THREE from "three";
import { BLOOD_TEXTURE, BLOOD_QUALITY, BLOOD_MOTION as C, BloodPosition } from "./Data_Tuning_Blood.mjs";
import { SurfaceDecalLayer } from "./Script_SurfaceDecals.mjs";

const position=new THREE.Vector3(),direction=new THREE.Vector3(),velocity=new THREE.Vector3();
const next=new THREE.Vector3(),segment=new THREE.Vector3(),hitPoint=new THREE.Vector3(),hitNormal=new THREE.Vector3();
const quaternion=new THREE.Quaternion();
const fresh=new THREE.Color(0x931f1a).toArray(),dark=new THREE.Color(0x461410).toArray();

export class BloodEffects {
  constructor({root,shared,lights,quality,CreatePool,random,GroundLevel}){
    Object.assign(this,{root,shared,lights,random,GroundLevel});
    this.limits=BLOOD_QUALITY[quality]||BLOOD_QUALITY.high;this.time=0;this.eye=new THREE.Vector3();
    this.sources=new Map();this.nextSource=1;this.layers=new Set();this.activeDrops=[];this.disposed=false;
    this.stats={impacts:0,emitted:0,rays:0};
    shared.uBloodInverseProjection={value:new THREE.Matrix4()};
    shared.uBloodCameraWorld={value:new THREE.Matrix4()};
    shared.uBloodTexture={value:shared.uSpriteMap.value};shared.uBloodTextureReady={value:0};
    this.mist=CreatePool(this.limits.mist,{shape:"bloodmist",orient:"billboard",lit:true,aerial:true,
      softRange:.09,renderOrder:6,blending:THREE.NormalBlending,preserveTargetAlpha:true});
    this.drops=CreatePool(this.limits.drops,{shape:"blooddrop",orient:"stretch",litSurface:false,
      softRange:0,renderOrder:6,blending:THREE.NormalBlending,preserveTargetAlpha:true});
    this.decals=this.CreateLayer(root,this.limits.decals,false);
    this.texture=null;
    new THREE.TextureLoader().load(new URL(BLOOD_TEXTURE,import.meta.url).href,texture=>{
      if(this.disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=8;texture.needsUpdate=true;this.texture=texture;
      shared.uBloodTexture.value=texture;shared.uBloodTextureReady.value=1;
    },undefined,()=>console.warn("[BloodEffects] CC0 texture unavailable; procedural masks active"));
  }
  CreateLayer(parent,capacity,persistent=true){
    const layer=new SurfaceDecalLayer(parent,{capacity,shared:this.shared,lights:this.lights,persistent,
      name:persistent?"BloodSurfaceDressing":"BloodSurfaceImpacts"});this.layers.add(layer);return layer;
  }
  Range(a,b){return a+(b-a)*this.random();}
  Cone(axis,spread,speed,out){
    // Isotropic perturbation retains the authored direction, including an exact zero Y.
    out.set(axis.x+this.Range(-spread,spread),axis.y+this.Range(-spread,spread),axis.z+this.Range(-spread,spread));
    if(out.lengthSq()<1e-8)out.set(0,1,0);return out.normalize().multiplyScalar(speed);
  }
  SpawnData(p,v,life,size,end){return {x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z,
    ax:0,ay:-C.gravity,az:0,life,sizeStart:size,sizeEnd:end,drag:C.drag,opacity:.85,fadeIn:0,
    angle:this.Range(0,Math.PI*2),spin:0,stretch:0,flicker:0,groundY:-9999,frame:0,
    colorA:fresh,colorB:dark,seed:this.random(),nx:0,ny:1,nz:0};}
  Emit(p,axis,amount=1,burst=false){
    if(this.disposed||!Number.isFinite(amount)||amount<=0)return;
    amount=Math.min(2,amount);direction.copy(axis||{x:0,y:1,z:0});
    if(direction.lengthSq()<1e-8)direction.set(0,1,0);direction.normalize();
    const distance=this.eye.distanceTo(p);if(distance>C.maxDistance)return;
    const far=Math.min(C.farScaleMax,Math.max(1,distance/C.farStart));
    const count=Math.round((burst?C.burstMistCount:C.mistCount)*amount);
    for(let i=0;i<count;i++){
      this.Cone(direction,burst?1.05:.62,this.Range(1.8,5.0)*Math.sqrt(amount),velocity);
      const s=this.SpawnData(p,velocity,this.Range(...C.mistLife),C.mistRadius[0]*far,C.mistRadius[1]*far*this.Range(.6,1.2));
      s.ay=-2.8;s.drag=4.5;s.opacity=C.mistOpacity;s.fadeIn=.015;s.spin=this.Range(-1.2,1.2);
      this.mist.Spawn(s,this.time);
    }
    const drops=Math.round((burst?C.burstDropCount:C.dropCount)*amount);
    for(let i=0;i<drops;i++){
      this.Cone(direction,.65,this.Range(1.8,7)*Math.sqrt(amount),velocity);velocity.y+=this.Range(.3,1.3);
      this.Drop(p,velocity,{radius:this.Range(.055,.14),pool:false});
    }
  }
  Drop(p,v,{radius=.08,pool=false,deposit=true}={}){
    const s=this.SpawnData(p,v,C.dropLife,this.Range(.006,.014),.004);
    s.stretch=this.Range(.03,.075);s.opacity=.93;
    const slot=this.drops.Spawn(s,this.time);
    // A pool overwrite must retire the corresponding CPU trajectory as well.
    const previous=this.activeDrops.findIndex(drop=>drop.slot===slot);
    if(previous>=0)this.activeDrops.splice(previous,1);
    this.activeDrops.push({slot,born:this.time,origin:new THREE.Vector3().copy(p),velocity:new THREE.Vector3().copy(v),
      previous:new THREE.Vector3().copy(p),radius,pool,deposit});this.stats.emitted++;
  }
  Spurt(node,offset,axis,options={}){
    if(!node||this.disposed)return 0;
    if(this.sources.size>=this.limits.sources)this.sources.delete(this.sources.keys().next().value);
    const id=this.nextSource++;
    direction.set(axis?.x??0,axis?.y??1,axis?.z??0);if(direction.lengthSq()<1e-8)direction.set(0,1,0);
    this.sources.set(id,{node,offset:new THREE.Vector3(offset?.x??0,offset?.y??0,offset?.z??0),
      direction:direction.clone().normalize(),seconds:Math.max(.05,options.seconds??2.4),
      rate:Math.max(0,options.rate??26),speed:options.speed??[2.2,5.2],spread:options.spread??.45,
      pool:!!options.pool,worldDirection:!!options.worldDirection,
      deposits:options.decals??8,age:0,accumulator:0,root:options.root??null});
    node.updateWorldMatrix(true,false);return id;
  }
  Corpse(actor){
    const node=actor?.characterRig?.bones?.chest||actor?.characterRig?.bones?.pelvis||actor?.chest||actor?.hips||actor?.root;if(!node)return 0;
    return this.Spurt(node,null,{x:0,y:-1,z:0},{seconds:C.corpseSeconds,rate:C.corpseRate,
      speed:C.corpseSpeed,spread:.18,pool:true,worldDirection:true,decals:32,root:actor.root});
  }
  Trace(from,to){
    segment.subVectors(to,from);const distance=segment.length();if(distance<1e-6)return null;
    segment.multiplyScalar(1/distance);this.stats.rays++;
    if(this.raycast)return this.raycast(from,segment,distance);
    const y=this.GroundLevel();
    if(from.y>=y&&to.y<=y&&segment.y<0)return {t:(y-from.y)/segment.y,normal:[0,1,0]};
    return null;
  }
  Update(dt,time,camera){
    this.time=time;if(camera)this.eye.copy(camera.position);
    for(const layer of this.layers)if(layer.disposed)this.layers.delete(layer);
    if(dt<=0)return;
    for(const [id,source] of this.sources){
      source.age+=dt;
      if(source.age>=source.seconds||!source.node.parent||(source.root&&!source.root.parent)){this.sources.delete(id);continue;}
      source.node.updateWorldMatrix(true,false);
      position.copy(source.offset).applyMatrix4(source.node.matrixWorld);
      if(this.eye.distanceTo(position)>C.maxDistance)continue;
      direction.copy(source.direction);
      if(!source.worldDirection){source.node.getWorldQuaternion(quaternion);direction.applyQuaternion(quaternion);}
      const pressure=Math.max(0,1-source.age/source.seconds);
      const pulse=source.pool?1:.55+.45*Math.pow(.5+.5*Math.sin(source.age*12),3);
      source.accumulator+=source.rate*dt*pressure*pulse;
      const count=Math.min(8,Math.floor(source.accumulator));source.accumulator-=count;
      for(let i=0;i<count;i++){
        this.Cone(direction,source.spread,this.Range(...source.speed)*(.25+.75*pressure),velocity);
        this.Drop(position,velocity,{pool:source.pool,radius:source.pool?C.corpseDropRadius:this.Range(.07,.15),deposit:source.deposits-->0});
      }
    }
    for(let i=this.activeDrops.length-1;i>=0;i--){
      const drop=this.activeDrops[i],age=this.time-drop.born;
      if(age<=0)continue;
      BloodPosition(drop.origin,drop.velocity,Math.min(age,C.dropLife),next);
      const hit=this.Trace(drop.previous,next);
      if(hit){
        hitPoint.copy(drop.previous).addScaledVector(segment,hit.t);
        hitNormal.set(...hit.normal);
        if(drop.deposit&&hit.box?.tag!=="water")this.decals.Add(hitPoint,hitNormal,drop.radius,
          {now:this.time,seed:this.random(),pool:drop.pool,aspect:this.Range(.7,1.3),merge:drop.pool});
        this.stats.impacts++;
      }
      if(hit||age>=C.dropLife){
        this.drops.deathTime[drop.slot]=0;this.drops.arrays.iSpawnLife[drop.slot*2+1]=0;
        this.drops.dirtyMin=Math.min(this.drops.dirtyMin,drop.slot);this.drops.dirtyMax=Math.max(this.drops.dirtyMax,drop.slot);
        this.activeDrops.splice(i,1);
      }else drop.previous.copy(next);
    }
  }
  Clear(){this.sources.clear();this.activeDrops.length=0;this.decals.Clear();}
  Dispose(){this.disposed=true;this.Clear();for(const layer of this.layers)layer.Dispose();this.layers.clear();this.texture?.dispose();}
}
