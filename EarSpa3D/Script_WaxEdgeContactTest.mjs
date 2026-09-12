import assert from 'node:assert/strict';
import {WaxEdgeContact} from './Script_WaxEdgeContact.mjs';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';
const normal=[0,0,1];
const body={size:1,surface:{points:[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],triangles:[[0,1,2],[0,2,3]],thickness:[.04,.04,.04,.04]}};
const Face=([x,y,z])=>{const q=[-y,x,0,1+z],length=Math.hypot(...q);return q.map(v=>v/length);};
for(const [point,inward] of [[[.97,0,.04],[-1,0,0]],[[-.97,0,.04],[1,0,0]],[[0,.97,.04],[0,-1,0]],[[0,-.97,.04],[0,1,0]]]){
  const edgeContact=WaxEdgeContact(body,point);assert.ok(edgeContact,'every perimeter side has contact');
  assert.deepEqual(edgeContact.inward.map(v=>v||0),inward,'local direction enters this side of the material');
  const rotation=Face(inward),contact=InstrumentContact('scoop',rotation,normal,{edgeContact,motion:inward});
  assert.ok(contact.facing<.28&&contact.aligned&&contact.loading,'a side-facing spoon loads from the edge despite the old wall-normal rejection');
  assert.ok(!InstrumentContact('scoop',Face(inward.map(v=>-v)),normal,{edgeContact}).aligned,'bowl facing away from the edge does not grip');
  assert.ok(!InstrumentContact('scoop',rotation,normal,{edgeContact,motion:inward.map(v=>-v)}).loading,'withdrawing from an edge cannot pull it remotely');
}
assert.equal(WaxEdgeContact(body,[0,0,.04]),null,'an internal diagonal is not an exposed edge');
assert.equal(WaxEdgeContact(body,[.97,0,1]),null,'being above an outline is not contact');
assert.equal(WaxEdgeContact(body,[1.5,0,0]),null,'distant material cannot be reached');
assert.ok(!InstrumentContact('scoop',Face([1,0,0]),normal).aligned,'center contact still rejects the side of the spoon');
// 同一物体弯折后必须读取当前节点；不能缓存静态空间中的法线。
body.surface.points=body.surface.points.map(([x,y,z])=>[x,-z,y]);
const bent=WaxEdgeContact(body,[0,-.04,.97]);
assert.ok(bent&&bent.inward[2]<-.99&&Math.abs(bent.inward[1])<1e-10,'edge direction follows deformation');
const fragment={size:.3,surface:{points:[[-.3,-.3,0],[.3,-.3,0],[.3,.3,0],[-.3,.3,0]],triangles:[[0,1,2],[0,2,3]],thickness:[.02,.02,.02,.02]}};
assert.ok(WaxEdgeContact(fragment,[.28,0,.02]),'a new cut fragment uses its own perimeter');
assert.equal(WaxEdgeContact(fragment,[.97,0,.04]),null,'fragment does not retain the parent boundary');
console.log('PASS all four wax edges, convex rejection, withdrawal, interior exclusion, deformation and fragment boundaries');
