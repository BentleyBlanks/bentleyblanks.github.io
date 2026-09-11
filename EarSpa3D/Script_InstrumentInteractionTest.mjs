import assert from 'node:assert/strict';
import {InstrumentContact,IsFeatherDebris} from './Script_InstrumentInteraction.mjs';
import {CreatePeelBody,GripPeelBody,StepPeelBody} from './Script_PeelPhysics.mjs';
const Roll=angle=>[0,Math.sin(angle/2),0,Math.cos(angle/2)],normal=[0,0,1];
for(const angle of [0,.2,1.2,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]){
  const contact=InstrumentContact('scoop',Roll(angle),normal);
  assert.deepEqual(contact.direction,normal,'spoon force stays perpendicular to the wall as the handle turns');
  const body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal,size:.7});GripPeelBody(body,[0,-.4,.06]);
  const target=contact.aligned?contact.direction.map((v,i)=>v*2+[0,-.4,.06][i]):null;
  for(let i=0;i<240;i++)StepPeelBody(body,{target,minAnchors:contact.aligned?0:5},1/120);
  assert.equal(body.detached,contact.aligned,'only the open face can lift wax');
  if(!contact.aligned)assert.equal(body.anchors.filter(a=>a.alive).length,5);
}
for(const wall of [[1,0,0],[0,-1,0],[.6,0,.8],[-.36,.48,-.8]]){
  const contact=InstrumentContact('scoop',Roll(.65),wall);
  assert.ok(Math.abs(Math.hypot(...contact.direction)-1)<1e-10,'scrape speed does not depend on wall orientation');
  assert.ok(contact.direction.reduce((sum,v,i)=>sum+v*wall[i],0)>1-1e-10,'scrape points away from each local wall, never a fixed screen direction');
}
assert.deepEqual(InstrumentContact('scoop',Roll(0),[0,0,3]).direction,normal,'normal magnitude does not amplify force');
const angledForceps=InstrumentContact('tweezers',Roll(.3),normal);
assert.ok(Math.abs(angledForceps.direction[0]-Math.sin(.3))<1e-10,'forceps retain jaw-directed pulling');
assert.equal(InstrumentContact('tweezers',Roll(0),normal).aligned,true);
assert.equal(InstrumentContact('tweezers',Roll(Math.PI),normal).aligned,true,'paired jaws work after a half turn');
assert.equal(InstrumentContact('tweezers',Roll(Math.PI/2),normal).aligned,false,'one jaw toward the wall cannot pinch');
assert.equal(InstrumentContact('tweezers',Roll(0),normal,{jawContact:false}).aligned,false,'orientation alone never creates a grip');
assert.equal(IsFeatherDebris({form:'microdust',mass:.075}),true);
assert.equal(IsFeatherDebris({form:'flake',mass:.9,footprint:[.2,.3]}),false);
assert.equal(IsFeatherDebris({fragment:true,generation:3,mass:.02,footprint:[.15,.8]}),false,'a long third-generation strip is still too large');
assert.equal(IsFeatherDebris({fragment:true,generation:1,mass:.02,footprint:[.15,.2]}),true,'actual small debris does not need three cuts');
assert.equal(IsFeatherDebris({fragment:true,generation:3,mass:.08,footprint:[.15,.2]}),false,'compact heavy chunks are not dust');
console.log('PASS wall-normal spoon scraping, face eligibility, paired jaws, and size-based feather eligibility');
