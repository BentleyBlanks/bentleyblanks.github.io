// Explicit visual block tops are the only analytic whitebox walking surfaces.
import assert from "node:assert/strict";
import {CompileWhiteboxWalkableSurfaces,SampleWhiteboxSurface} from "./Script_FirstLevelWhiteboxField.mjs";
const floor={id:"Floor",x:0,y:1.125,z:0,w:2,h:.25,d:2,ry:0,solid:false};
const stairs=Array.from({length:4},(_,i)=>({id:`Step${i}`,x:1.275+i*.55,y:(1-i*.25)/2,z:0,w:.55,h:1-i*.25,d:2,ry:0,solid:false}));
const roof={id:"Roof",x:0,y:4,z:0,w:3,h:.3,d:3,ry:0};
const layout={blocks:[floor,...stairs,roof],walkableSurfaces:[floor,...stairs]};
const surfaces=CompileWhiteboxWalkableSurfaces(layout);
assert.equal(SampleWhiteboxSurface(surfaces,0,0),1.25);
assert.deepEqual(stairs.map(p=>SampleWhiteboxSurface(surfaces,p.x,p.z)),[1,.75,.5,.25]);
assert.equal(SampleWhiteboxSurface(surfaces,4,0),0);
assert.equal(SampleWhiteboxSurface(CompileWhiteboxWalkableSurfaces({blocks:[floor,roof]}),0,0),0,"legacy layout remains flat");
assert.throws(()=>CompileWhiteboxWalkableSurfaces({...layout,walkableSurfaces:[{...floor,y:9}]}),/must match/);
assert.throws(()=>CompileWhiteboxWalkableSurfaces({...layout,walkableSurfaces:[{...floor,id:"Missing"}]}),/must match/);
const rotated={...floor,ry:Math.PI/2,w:4,d:1};
assert.equal(SampleWhiteboxSurface([rotated],0,1.5),1.25);
assert.equal(SampleWhiteboxSurface([rotated],1.5,0),0);
console.log("PASS explicit whitebox floor, four 0.25m stairs, OBB rotation, roof exclusion and legacy flat ground");
