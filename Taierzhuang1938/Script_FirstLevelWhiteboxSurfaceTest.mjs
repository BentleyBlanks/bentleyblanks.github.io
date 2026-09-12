// Explicit visual block tops are the only analytic whitebox walking surfaces.
import assert from "node:assert/strict";
import * as THREE from "three";
import {TerrainDeformationView} from "./Script_TerrainDeformationView.mjs";
import {CompileWhiteboxWalkableSurfaces,SampleWhiteboxSurface,FirstLevelWhiteboxField} from "./Script_FirstLevelWhiteboxField.mjs";
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
const train={...floor,id:"StationCar0Floor",y:2};
const field=new FirstLevelWhiteboxField(null,null,{whiteboxLayout:{blocks:[floor,train],walkableSurfaces:[floor,train],bounds:{}}});
assert.equal(field.GroundHeight(0,0),2.125,"live actors still stand on train floors");
assert.equal(field.StaticGroundHeight(0,0),1.25,"static casualties use the fixed floor below the train");
field.SetTrainOffset(20);
assert.equal(field.StaticGroundHeight(0,0),1.25,"train departure cannot move the baked support surface");
assert.equal(field.GroundHeight(0,20),2.125,"live train floor moves normally");
// A nearby shell rebuilds whole soil tiles, including protected deck footprints.
// The rebuilt mesh/heightfield must stay below the deck, while actors use it.
field.bounds={minX:-40,maxX:40,minZ:-40,maxZ:40};
const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();
const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80).rotateX(-Math.PI/2),material);
ground.userData.deformableTerrain=true;field.meshes.push(ground);scene.add(ground);
const deformation=new TerrainDeformationView(field,scene,{Get:()=>material,Static:m=>m,baked:new Map()});
assert.equal(deformation.model.BaseHeight(0,20),0,"soil sampler excludes moving train deck");
deformation.ApplyBlast({x:4,y:0,z:20},"shell");
assert.ok(deformation.tileMeshes.size>0,"regression exercises actual crater tile reconstruction");
for(const mesh of deformation.tileMeshes.values()) {
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<1&&Math.abs(p.getZ(i)-20)<1)
    assert.ok(p.getY(i)<.1,"crater soil cannot become a coplanar train deck");
}
assert.equal(field.GroundHeight(0,20),2.125,"deformation preserves the live deck support");
field.SetTrainOffset(25);
assert.equal(field.GroundHeight(0,25),2.125,"deck support still follows the train after a blast");
assert.ok(field.GroundHeight(0,20)<.1,"departed train leaves no cached phantom floor");
assert.equal(field.GroundHeight(0,0),1.25,"fixed elevated floor remains supported");
deformation.Dispose();
console.log("PASS explicit whitebox floor, four 0.25m stairs, OBB rotation, roof exclusion and legacy flat ground");
