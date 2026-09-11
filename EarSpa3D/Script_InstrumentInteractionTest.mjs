import assert from 'node:assert/strict';
import {InstrumentContact,IsFeatherDebris} from './Script_InstrumentInteraction.mjs';
import {CreatePeelBody,GripPeelBody,StepPeelBody} from './Script_PeelPhysics.mjs';
const Roll=angle=>[0,Math.sin(angle/2),0,Math.cos(angle/2)],normal=[0,0,1];
for(const angle of [0,.2,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]){
  const contact=InstrumentContact('scoop',Roll(angle),normal);
  assert.ok(Math.abs(contact.direction[0]-Math.sin(angle))<1e-10);
  assert.ok(Math.abs(contact.direction[2]-Math.cos(angle))<1e-10);
  const body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal,size:.7});GripPeelBody(body,[0,-.4,.06]);
  const target=contact.aligned?contact.direction.map((v,i)=>v*2+[0,-.4,.06][i]):null;
  for(let i=0;i<240;i++)StepPeelBody(body,{target,minAnchors:contact.aligned?0:5},1/120);
  assert.equal(body.detached,contact.aligned,'only the open face can lift wax');
  if(!contact.aligned)assert.equal(body.anchors.filter(a=>a.alive).length,5);
}
assert.equal(InstrumentContact('tweezers',Roll(0),normal).aligned,true);
assert.equal(InstrumentContact('tweezers',Roll(Math.PI),normal).aligned,true,'paired jaws work after a half turn');
assert.equal(InstrumentContact('tweezers',Roll(Math.PI/2),normal).aligned,false,'one jaw toward the wall cannot pinch');
assert.equal(InstrumentContact('tweezers',Roll(0),normal,{jawContact:false}).aligned,false,'orientation alone never creates a grip');
assert.equal(IsFeatherDebris({form:'microdust',mass:.075}),true);
assert.equal(IsFeatherDebris({form:'flake',mass:.9,footprint:[.2,.3]}),false);
assert.equal(IsFeatherDebris({fragment:true,generation:3,mass:.02,footprint:[.15,.8]}),false,'a long third-generation strip is still too large');
assert.equal(IsFeatherDebris({fragment:true,generation:1,mass:.02,footprint:[.15,.2]}),true,'actual small debris does not need three cuts');
assert.equal(IsFeatherDebris({fragment:true,generation:3,mass:.08,footprint:[.15,.2]}),false,'compact heavy chunks are not dust');
console.log('PASS instrument face forces, paired jaws, and size-based feather eligibility');
