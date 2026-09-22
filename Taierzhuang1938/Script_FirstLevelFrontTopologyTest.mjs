// Targeted 03–06 topology checks; gameplay evidence uses the continuous browser driver.
import assert from "node:assert/strict";
import {BatchRecovered,AssaultWindow} from "./Script_FirstLevelFrontBattle.mjs";
import {MISSION_STAGES} from "./Data_FirstLevelMission.mjs";
import {MISSION_LAYOUT as L,MISSION_ROUTES as R,MISSION_PLACEMENT as P} from './Data_FirstLevelMissionLayout.mjs';
import {FRONT_SORTIE as S} from './Data_FirstLevelFrontRoute.mjs';
import {SampleMissionTerrain as G} from './Data_FirstLevelMissionTerrain.mjs';
const solids=[...L.blocks,...L.scenario.states.find(s=>s.id==='BunkerCollapsed').blocks].filter(b=>b.solid!==false&&!L.walkableSurfaces.some(s=>s.id===b.id));
const routes={support:R.support,rear:S.rearRoute,ammo:R.bundle,attack:S.attackRoute,left:S.leftRoute,orders:R.orders,...Object.fromEntries(P.guardWithdrawalRoutes.map((r,i)=>['guard'+i,r]))};
for(const [name,route] of Object.entries(routes)){
 const hits=new Set(),slopes=[];let prev=null;
 for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],len=Math.hypot(a.x-b.x,a.z-b.z),steps=Math.ceil(len/.2);
 for(let n=0;n<=steps;n++){const x=a.x+(b.x-a.x)*n/steps,z=a.z+(b.z-a.z)*n/steps,y=G(x,z);
 for(const s of solids){const c=Math.cos(s.ry||0),q=Math.sin(s.ry||0),dx=x-s.x,dz=z-s.z;if(Math.abs(dx*c-dz*q)<s.w/2+.35&&Math.abs(dx*q+dz*c)<s.d/2+.35&&s.y+s.h/2>y+.3&&s.y-s.h/2<y+1.7)hits.add(s.id);}
 if(prev&&Math.abs(y-prev.y)>Math.tan(52*Math.PI/180)*Math.hypot(x-prev.x,z-prev.z)+.035)slopes.push([+x.toFixed(1),+z.toFixed(1),+(y-prev.y).toFixed(2)]);prev={x,y,z};}}
 assert.deepEqual([...hits],[],name+' capsule clearance');assert.deepEqual(slopes,[],name+' climbable terrain');
}
const Eye=(p,h)=>({...p,y:G(p.x,p.z)+h});
function Sight(a,b){const len=Math.hypot(a.x-b.x,a.z-b.z);for(let d=.1;d<len;d+=.1){const t=d/len,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;if(G(x,z)>y)return 'terrain';for(const s of solids){const c=Math.cos(s.ry||0),q=Math.sin(s.ry||0),dx=x-s.x,dz=z-s.z;if(Math.abs(dx*c-dz*q)<s.w/2&&Math.abs(dx*q+dz*c)<s.d/2&&y>s.y-s.h/2&&y<s.y+s.h/2)return s.id;}}return null;}

for(const index of [S.tankBlockIndex,S.tankEndIndex]){
  const muzzle=Eye(S.road[index],2.1);
  assert.equal(Sight(muzzle,Eye(S.gap,1.2)),null,'tank actually controls the same gap throughout 04–05');
  assert.ok(Sight(muzzle,Eye(S.rear,1.7)),'rear junction shields a standing person');
  assert.ok(Sight(muzzle,Eye(S.guardRoute.at(-1),1.2)),'guard safe zone is behind real cover');
}
assert.equal(Sight(Eye(S.seat,1.65),Eye(S.gap,1.2)),null,'captured position can see the rescued men cross the breach');
assert.equal(Sight(Eye(S.nest,1.45),Eye(S.gap,1.2)),null,'the right gun actually controls the breach before capture');
assert.deepEqual(R.bundleReturn,[...R.bundle].reverse(),'return is the same branch');
assert.deepEqual(S.attackRoute[0],S.rear);assert.deepEqual(S.route[0],S.rear);
assert.ok(S.house.x<S.road[S.tankEndIndex].x,'ammo house stays on the friendly side of road');
assert.ok(S.house.z>S.rear.z,'ammo house is southeast');
assert.notDeepEqual(S.throw,S.seat,'throw does not return to MG seat');
const guard=(alive,safe,progress=4)=>({actor:{alive},safe,progress,route:Array(4)});
assert.equal(BatchRecovered([]),false);assert.equal(BatchRecovered([guard(false,true)]),false);
assert.equal(BatchRecovered([guard(true,false)]),false,'running is not recovered');
assert.equal(BatchRecovered([guard(true,true,3)]),false,'a flag cannot replace completed travel');
assert.equal(BatchRecovered([guard(true,true),guard(false,false)]),true,'surviving batch reaches safety');
const assault=[{alive:false},{alive:false},{alive:false},{alive:true},{alive:true}];
assert.equal(AssaultWindow(assault,true,false),true,'finite threshold does not require battlefield wipe');
assert.equal(AssaultWindow(assault,true,true),false,'direct fire still closes the window');
assert.equal(AssaultWindow(assault,false,false),false,'capture is required');
const requirements=id=>MISSION_STAGES.find(s=>s.id===id).requirements;
for(const fact of ['tankImmobilized','tankFireDisabled','attackRetreated','lastGuardsWithdrawn','reliefInPosition','collectionReturned'])assert.ok(requirements('Tank').includes(fact));
assert.ok(requirements('MachineGun').includes('rightRearReached'));assert.ok(requirements('Support').includes('rifleWithdrawalResolved'));
console.log('ok 03–06 routes, tank sightlines, covered junction, finite assault and physical batch gates');
