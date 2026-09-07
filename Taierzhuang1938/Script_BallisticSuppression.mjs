// Suppression uses the travelled bullet path, clipped by the first solid/hit.
import { COMBAT } from "./Data_Battle.mjs";
export function CollectBulletNearMisses(from,dir,length,targets,near) {
  for(const actor of targets){
    if(!actor.alive)continue;
    const body={x:actor.position.x,y:actor.position.y+(actor.stance===2?.25:actor.stance===1?.72:1.05),z:actor.position.z};
    const dx=body.x-from.x,dy=body.y-from.y,dz=body.z-from.z;
    const along=Math.max(0,Math.min(length,dx*dir.x+dy*dir.y+dz*dir.z));
    const point={x:from.x+dir.x*along,y:from.y+dir.y*along,z:from.z+dir.z*along};
    const distance=Math.hypot(body.x-point.x,body.y-point.y,body.z-point.z);
    if(distance<COMBAT.suppressRadius&&distance<(near.get(actor)?.distance??Infinity))near.set(actor,{point,body,distance});
  }
}
export function ApplyBulletNearMisses(near,Blocked,directHit=null) {
  for(const [actor,pass] of near){
    if(actor===directHit||Blocked(pass.point,pass.body))continue;
    actor.suppression=Math.min(1,(actor.suppression||0)+COMBAT.suppressPerNearMiss*(1-pass.distance/COMBAT.suppressRadius));
  }
}
