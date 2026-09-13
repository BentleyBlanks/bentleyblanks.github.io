import assert from 'node:assert/strict';
import {SquadCoverRoute,SquadCoverBounds} from './Script_SquadMarchCover.mjs';
import {MISSION_TRENCH_COVER as C} from './Data_FirstLevelMissionTrenchCover.mjs';
import {OPENING} from './Data_FirstLevelOpening.mjs';
import {MISSION_LAYOUT} from './Data_FirstLevelMissionLayout.mjs';
import {SampleMissionTerrain} from './Data_FirstLevelMissionTerrain.mjs';
for(const [name,route] of [['approach',OPENING.approachRoute],['support',OPENING.supportRoute]]){
 const stations=C[name],bounds=new SquadCoverBounds(stations,route);
 const members=Array.from({length:4},(_,slot)=>{
  const path=SquadCoverRoute(route,stations,slot,C),posts=path.filter(p=>Number.isInteger(p.coverBound));
  assert.ok(posts.length);
  // Every detour, not just endpoints, clears solids with an infantry capsule.
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],length=Math.hypot(a.x-b.x,a.z-b.z);
   for(let d=0;d<=length;d+=.1){
    const t=d/(length||1),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=SampleMissionTerrain(x,z);
    for(const box of MISSION_LAYOUT.blocks){
     if(box.solid===false||MISSION_LAYOUT.walkableSurfaces.some(s=>s.id===box.id))continue;
     const dx=x-box.x,dz=z-box.z,c=Math.cos(box.ry||0),s=Math.sin(box.ry||0);
     assert.ok(!(Math.abs(dx*c-dz*s)<box.w/2+.35&&Math.abs(dx*s+dz*c)<box.d/2+.35&&box.y+box.h/2>y+.3&&box.y-box.h/2<y+1.7),`${name} slot ${slot} detour hits ${box.id} at ${x},${z}`);
    }
   }
  }
  return {alive:true,bounds:posts,position:{...posts[0]},passed:-1};
 });
 bounds.Update(route[0],members);assert.equal(bounds.CanLeave(0),false,'player behind keeps both groups sheltered');
 const follower=members[3],post={...follower.position};follower.position={x:100,z:100};
 bounds.Update(stations[0],members);assert.equal(bounds.CanLeave(0),false,'must observe the covering pair physically arrive');
 follower.position=post;follower.evading=true;bounds.Update(stations[0],members);assert.equal(bounds.CanLeave(0),false,'grenade evasion is not covering');
 follower.evading=false;bounds.Update(stations[0],members);assert.equal(bounds.CanLeave(0),true);assert.equal(bounds.CanLeave(1),false);
 for(let index=1;index<stations.length;index++){
  for(const m of members){const p=m.bounds.find(p=>p.coverBound===index+1);if(p)m.position={...p};}
  bounds.Update(stations[index],members);assert.equal(bounds.CanLeave(index),true,'successive groups release without a final-station deadlock');
  for(const m of members)if(m.bounds.some(p=>p.coverBound===index))m.passed=index+1;
 }
 const dead=new SquadCoverBounds(stations,route);members.forEach(m=>m.alive=false);members[0].alive=true;members[0].position={...members[0].bounds[0]};members[0].passed=-1;
 dead.Update(stations[0],members);assert.ok(dead.CanLeave(0),'dead members never block surviving teammates');
}
assert.equal(MISSION_LAYOUT.blocks.filter(b=>b.id.startsWith('TrenchBound')).length,18,'all nine two-arm shelters survive layout cleanup');
console.log('ok trench cover capsule routes, player gate, staggered pairs, grenade interruption, final release and casualty handling');
