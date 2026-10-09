import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TerrainContactField } from './Script_TerrainContact.mjs';
import { TRENCH_SURFACE as C } from './Data_TrenchSurface.mjs';
import { TERRAIN_WATER } from './Data_Tuning_Terrain.mjs';
import * as THREE from 'three';
import { BuildTrenchSurface, CreateTrenchDressingHeightSampler } from './Script_TrenchSurface.mjs';
import { BuildTrenchEarth } from './Script_TrenchEarth.mjs';
import { CompileTrenchNetwork } from './Script_TrenchPlan.mjs';
import { BuildTrenchPreview } from './Script_TrenchSpline.mjs';
import { TRENCH_EARTH_PROFILE, TRENCH_APPEARANCE } from './Data_TrenchAppearance.mjs';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';

// Updates must use the physical terrain's actual grid (including non-unit cells),
// and must restore it after a blast reset; no camera-dependent screen depth cache.
const terrain={cols:8,rows:6,minX:-4,minZ:-3,stepX:.75,stepZ:1.25,heights:new Float32Array(9*7)};
for(let z=0;z<=6;z++)for(let x=0;x<=8;x++)terrain.heights[z*9+x]=x*.2+z*.4;
const contact=new TerrainContactField(terrain);
assert.equal(contact.texture.image.width,9);assert.equal(contact.texture.image.height,7);
assert.deepEqual(contact.grid.toArray(),[-4,-3,.75,1.25]);
assert.notEqual(contact.data,terrain.heights);
const before=contact.data.slice(),version=contact.texture.version;
contact.Update([{minX:-2.4,maxX:-1.6,minZ:-.6,maxZ:.6}],(x,z)=>-3+x*.02+z*.04);
assert.ok(contact.texture.version>version);assert.equal(contact.updates,1);
assert.equal(contact.data[0],before[0]);assert.equal(contact.data.at(-1),before.at(-1));
assert.ok(contact.data.some((h,i)=>h!==before[i]));
assert.deepEqual(terrain.heights,before,'render update must not mutate the physics base');
contact.Reset();assert.deepEqual(contact.data,before);contact.Dispose();
// Near a ledge, finite height differences straddle empty space. Placement must
// use the actual supporting triangle, not tilt a chunk toward the lower floor.
const supportPlane=new THREE.PlaneGeometry(1,1);supportPlane.rotateX(-Math.PI/2);supportPlane.translate(.5,1,.5);
supportPlane.userData.trenchCrown=true;
const supportAt=CreateTrenchDressingHeightSampler([supportPlane],()=>0,{includeNormals:true});
assert.equal(supportAt(.99,.5),1);
assert.ok(supportAt.NormalAt(.99,.5).dot(new THREE.Vector3(0,1,0))>.9999,'ledge support follows the real top face');
assert.equal(supportAt.NormalAt(1.1,.5),null,'outside the mesh there is no invented support normal');
supportPlane.dispose();

for(const [kind,url] of Object.entries(C.models)){
  const b=fs.readFileSync(new URL(url,import.meta.url));assert.equal(b.toString('ascii',0,4),'glTF');
  const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const primitives=json.meshes.flatMap(m=>m.primitives);
  const count=primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0);
  assert.ok(count>0&&count<1500,`${kind}: silhouette asset stays below 1500 triangles`);
  assert.equal(json.materials.length,1,'one material per static batch');
  if(kind==='clods'){
    assert.equal(json.meshes.length,12,'all six Blender prototype shapes have large/small variants');
    assert.equal(json.nodes.filter(n=>n.mesh!==undefined&&n.name.endsWith('High')).length,6,'large clods retain detailed silhouettes');
    assert.equal(json.nodes.filter(n=>n.mesh!==undefined&&n.name.endsWith('Low')).length,6,'small clods retain inexpensive silhouettes');
    for(const primitive of primitives){
      const bounds=json.accessors[primitive.attributes.POSITION];
      assert.ok(bounds.min.every(Number.isFinite)&&bounds.max.every(Number.isFinite));
      assert.ok(bounds.max[0]-bounds.min[0]>1.5&&bounds.max[0]-bounds.min[0]<2.5,'clods have measured normalized horizontal radius');
      assert.ok(bounds.min[1]<0&&bounds.max[1]>.3,'buried sole and exposed upper volume');
    }
  }
  if(kind==='cliffs'){
    assert.equal(json.meshes.length,4,'four distinct earthen cliff modules');
    for(const primitive of primitives){
      const bounds=json.accessors[primitive.attributes.POSITION];
      assert.ok(Math.abs(bounds.max[0]-bounds.min[0]-1.5)<1e-5,'cliff kit has a measured 1.5 m along axis');
      assert.ok(bounds.min[1]===0&&bounds.max[1]>2&&bounds.max[1]<2.1,'cliff kit has a 2 m upright face and broken crown');
      assert.ok(bounds.min[2]<-.05&&bounds.max[2]>.15&&bounds.max[2]<.3,'cliff kit has real front relief and a recessed skirt');
    }
  }
  const position=json.accessors[primitives[0].attributes.POSITION];
  if(kind==='grass'){
    assert.ok(position.min[1]<-.3&&position.max[1]>.3,'tuft has hanging and standing geometry');
    assert.ok(-position.min[2]>position.max[2]*1.5,'measured glTF drape faces -Z');
  }
}
const map=fs.readFileSync(new URL(C.mudMap,import.meta.url));
assert.equal(map.readUInt32BE(16),512);assert.equal(map.readUInt32BE(20),512);
// 2026-09-28: wet mud / standing water moved to the shared terrain water model (Data_Tuning_Terrain.TERRAIN_WATER).
assert.ok(TERRAIN_WATER.waterRough<.3&&C.mud.roughDry>.8,'separate wet/dry PBR ranges');
assert.ok(TERRAIN_WATER.site.trenchFloor>0&&TERRAIN_WATER.lowRiseM[1]>TERRAIN_WATER.lowRiseM[0],'trench floors pool water, lips stay dry');
for(const url of [...Object.values(C.stoneLayer),...Object.values(C.mudLayer),...Object.values(C.looseLayer)])
  assert.ok(fs.statSync(new URL(url,import.meta.url)).size>1000);
// A bent bank fixture exercises footprint conformance on both sides, rather than
// checking only the model origin. Root tips must follow the soil without floating.
const Ground=(x,z)=>Math.abs(x)*.8+Math.sin(z*.4)*.15;
const plan={seed:707,Depth:()=>0,segments:[{id:'Bend',path:{length:24},stations:
  Array.from({length:18},(_,i)=>({s:i+3,x:0,z:i,nx:1,nz:0,tx:0,tz:1,halfFloor:1,bank:1,depth:2}))}]};
const grass=new THREE.BufferGeometry();
grass.setAttribute('position',new THREE.Float32BufferAttribute([-.3,0,0,.3,0,0,0,-.5,-.7],3));
const stone=new THREE.IcosahedronGeometry(.4,0),batches=[];
BuildTrenchSurface({SetSector(){},Add(key,geometry){batches.push({key,geometry});}},plan,Ground,{grass,stone});
assert.ok(batches.some(b=>b.key==='TrenchDryGrass'));
for(const {key,geometry} of batches){
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const gap=p.getY(i)-Ground(p.getX(i),p.getZ(i));
    assert.ok(Number.isFinite(gap));
    if(key==='TrenchDryGrass')assert.ok(gap>.017&&gap<.049,'draped mat follows the full bank footprint');
  }
  geometry.dispose();
}
grass.dispose();stone.dispose();
// A crown can stand above physics. Mats must rest on that visible surface,
// including across triangle boundaries, instead of disappearing inside clods.
const crown=new THREE.PlaneGeometry(20,40);crown.rotateX(-Math.PI/2);crown.translate(0,.4,8);
crown.userData.trenchCrown=true;
const crownBatches=[];
const crownAssets={grass:new THREE.IcosahedronGeometry(.1,0),stone:new THREE.IcosahedronGeometry(.1,0)};
BuildTrenchSurface({buckets:new Map([['crown',[crown]]]),SetSector(){},Add(key,geometry){crownBatches.push({key,geometry});}},
  plan,(x)=>Math.abs(x)>1.5?2:0,crownAssets);
for(const {key,geometry} of crownBatches)if(key==='TrenchDryGrass'){
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))>1.5)assert.ok(p.getY(i)>2.017,'a buried crown never lowers grass below physics');
}
// Place the visible crown above the fixture's bank, then verify actual vertices.
crown.translate(0,2,0);
const raised=[];
BuildTrenchSurface({buckets:new Map([['crown',[crown]]]),SetSector(){},Add(key,geometry){raised.push({key,geometry});}},
  plan,(x)=>Math.abs(x)>1.5?2:0,crownAssets);
const mats=raised.filter(b=>b.key==='TrenchDryGrass');assert.ok(mats.length>0);
for(const {geometry} of mats){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(p.getY(i)>2.417&&p.getY(i)<2.449,'mat sits on the rendered crown');}
// A crown-height discontinuity must cut the turf card, not turn its texture
// into a tall opaque strip. Keep visible pieces on both levels of the fixture.
const steppedMats=[];
BuildTrenchSurface({SetSector(){},Add(key,g){if(key==='TrenchDryGrass')steppedMats.push(g);else g.dispose();}},
  plan,(x,z)=>Math.abs(x)>1.5?2+(Math.floor(z/.13)%2)*.8:0,crownAssets);
assert.ok(steppedMats.length>0,'turf remains visible beside crown-height breaks');
let steppedMatTriangles=0;
for(const g of steppedMats){
  const p=g.attributes.position,index=g.index;steppedMatTriangles+=index.count/3;
  for(let i=0;i<index.count;i+=3){
    const y=[0,1,2].map(k=>p.getY(index.getX(i+k)));
    assert.ok(Math.max(...y)-Math.min(...y)<.2,'turf never bridges an 80 cm crown break as a stretched sheet');
  }
  g.dispose();
}
assert.ok(steppedMatTriangles<steppedMats.length*96,'crossing card triangles are actually removed');
for(const {geometry} of [...crownBatches,...raised])geometry.dispose();
for(const geometry of Object.values(crownAssets))geometry.dispose();crown.dispose();
// Photo-style bank sculpture must not enter the original walking floor or mutate
// excavation data. Adjacent strips share their edge even with the new spade flutes.
const cutPlan=CompileTrenchNetwork({seed:'PhotoStyle',segments:[{id:'Straight',preset:'communication',
  points:[{x:0,z:0},{x:0,z:20}],jitterScale:0,cornerRadiusM:0}]});
const cutGround=(x,z)=>cutPlan.Apply(x,z,0,0);
const stationsBefore=JSON.stringify(cutPlan.segments[0].stations),edges=new Map(),cutBatches=[];
BuildTrenchEarth({SetSector(){},Add(key,geometry){cutBatches.push(geometry);}},cutPlan,cutGround,{roots:'ground'});
assert.equal(JSON.stringify(cutPlan.segments[0].stations),stationsBefore,'appearance does not edit the trench plan');
let sharedEdges=0,skinVertices=0,spoilVertices=0,rootVertices=0,compactClods=0;
const spoilEdges=new Map();
for(const geometry of cutBatches){
  if(geometry.attributes.uv?.getX(0)===-6){
    compactClods++;
    const uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)assert.ok(uv.getX(i)===-6&&uv.getY(i)===-9,'whole bank aggregate retains compact material through the merge');
  }
  if(geometry.userData.trenchRoots){
    const uv=geometry.attributes.uv;rootVertices+=uv.count;
    for(let i=0;i<uv.count;i++)assert.equal(uv.getX(i),-16,'root colour flag survives the shared soil batch');
  }
  if(geometry.userData.trenchSpoilSkin){
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),gap=y-cutGround(x,z);spoilVertices++;
      assert.ok(Math.abs(x)>=2.8-1e-5,'loose skin stays outside the original cut');
      assert.ok(gap>=-.005&&gap<.17,'spoil is shallow dressing over shared terrain');
      const key=x.toFixed(5)+':'+z.toFixed(5);
      if(spoilEdges.has(key))assert.ok(Math.abs(spoilEdges.get(key)-y)<1e-4,'no seam along the raised spoil');
      else spoilEdges.set(key,y);
      assert.equal(geometry.attributes.uv.getX(i),-8,'loose material flag survives static merge UVs');
    }
  }
  if(geometry.userData.trenchCrust){
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),gap=y-cutGround(x,z);skinVertices++;
      assert.ok(Math.abs(x)>=1.7+.02*1.1-1e-5,'continuous skin leaves the full original floor clear');
      assert.ok(gap>=-.009&&gap<.21,'cut-earth finish stays within the shallow visual relief envelope');
      const key=x.toFixed(5)+':'+z.toFixed(5);
      if(edges.has(key)){assert.ok(Math.abs(edges.get(key)-y)<1e-4,'no vertical seam between skin strips');sharedEdges++;}
      else edges.set(key,y);
    }
  }
  geometry.dispose();
}
assert.ok(skinVertices>1000&&sharedEdges>100,'measure actual adjacent generated strips');
assert.ok(spoilVertices>1000,'continuous spoil detail is built on both banks');
let joinedCrest=0;
for(const [key,height] of edges)if(spoilEdges.has(key)){
  assert.ok(Math.abs(height-spoilEdges.get(key))<1e-4,'cut face and spoil share the same broken crown without an open seam');joinedCrest++;
}
assert.ok(joinedCrest>100,'verify the actual common crest vertices, not only each skin separately');
assert.ok(rootVertices>0,'roots retain a distinct surface in the soil batch');
assert.ok(compactClods>10,'actual cut-wall aggregates use the compact matrix');
// Raycast the rendered triangles independently of the placement sampler. Long
// fibres must bend with the bank instead of disappearing into the raised skin.
const contactMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const contactMeshes=cutBatches.filter(g=>g.userData.trenchCrust||g.userData.trenchSpoilSkin)
  .map(g=>new THREE.Mesh(g,contactMaterial));
const contactRay=new THREE.Raycaster(),rootGaps=[];
for(const geometry of cutBatches)if(geometry.userData.trenchRoots){
  const p=geometry.attributes.position;
  // Each open triangular cylinder has two rings, each with a repeated UV seam.
  const ends=[0,4].map(start=>{
    const centre=new THREE.Vector3();
    for(let i=0;i<3;i++)centre.add(new THREE.Vector3().fromBufferAttribute(p,start+i));
    return centre.multiplyScalar(1/3);
  });
  for(const t of [0,.25,.5,.75,1]){
    const point=ends[0].clone().lerp(ends[1],t);
    contactRay.set(new THREE.Vector3(point.x,20,point.z),new THREE.Vector3(0,-1,0));
    const hit=contactRay.intersectObjects(contactMeshes,false)[0];
    const host=Math.max(cutGround(point.x,point.z),hit?.point.y??-Infinity);
    rootGaps.push(point.y-host);
  }
}
assert.ok(rootGaps.length>100,'sample actual rendered root fibres across both banks');
assert.ok(Math.min(...rootGaps)>-.02,'root fibres do not cross deeply into visible soil');
assert.ok(Math.max(...rootGaps)<.06,'root fibres do not bridge over the soil as floating sticks');
contactMaterial.dispose();
// The authored cliff kit must actually replace the runtime wall skin, face the
// walking lane on both banks, and preserve the original floor and trench plan.
const cliffBytes=fs.readFileSync(new URL(C.models.cliffs,import.meta.url));
const cliffScene=(await new GLTFLoader().parseAsync(cliffBytes.buffer.slice(cliffBytes.byteOffset,cliffBytes.byteOffset+cliffBytes.byteLength),'')).scene;
const cliffKit=[];cliffScene.updateMatrixWorld(true);cliffScene.traverse(node=>{
  if(node.isMesh)cliffKit.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
});
let panels=0,mirroredPanels=0,frontFaces=0,undercutFaces=0;
const cliffBatches=[];
const cliffStats=BuildTrenchEarth({SetSector(){},Add(key,g){
  cliffBatches.push(g);
  if(g.userData.trenchCliff){
    panels++;if(g.userData.trenchCliffMirrored)mirroredPanels++;
    const p=g.attributes.position,index=g.index;let signedFrontArea=0;
    for(let i=0;i<p.count;i++){
      assert.ok(Math.abs(p.getX(i))>=1.7+.02*1.1-1e-5,'cliff surface never enters the original walking floor');
      assert.ok(Math.abs(p.getX(i))<=2.87,'recessed cliff skirt stays inside the bank and crown margin');
      assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));
    }
    for(let i=0;i<index.count;i+=3){
      const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index.getX(i+k)));
      const faceCross=b.clone().sub(a).cross(c.clone().sub(a)),normal=faceCross.clone().normalize();
      const centre=a.clone().add(b).add(c).multiplyScalar(1/3);
      signedFrontArea+=faceCross.x*Math.sign(centre.x);
      if(normal.x*Math.sign(centre.x)<-.3)frontFaces++;
      if(normal.y<-.15&&centre.y>-.5)undercutFaces++;
    }
    assert.ok(signedFrontArea<-.2,'each original or mirrored module winds toward the trench');
  }
  g.dispose();
}},cutPlan,cutGround,{cliffs:cliffKit,roots:'ground',style:{...TRENCH_APPEARANCE,
  clodChance:0,bankClods:0,crumbs:0,lipClods:0,spoilClods:0}});
assert.ok(panels>10&&frontFaces>panels*80,'authored wall faces are visible from both sides of the trench');
assert.ok(mirroredPanels>0&&mirroredPanels<panels,'exercise original and mirrored wall placement');
assert.ok(undercutFaces>10,'overhanging crown is represented by geometry, not only a normal map');
assert.ok(cliffStats.roots>10,'wall-projected roots reach the deformed cliff mesh, including its updated raycast bounds');
assert.equal(JSON.stringify(cutPlan.segments[0].stations),stationsBefore,'cliff placement keeps the authored route');
const cliffSeams=new Map();let joinedCliffNormals=0;
for(const g of cliffBatches)if(g.userData.trenchCliff){
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)if(uv.getY(i)<1e-6||uv.getY(i)>1-1e-6){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(':');
    const normal=new THREE.Vector3().fromBufferAttribute(n,i),previous=cliffSeams.get(key);
    if(previous&&previous.geometry!==g){
      assert.ok(normal.dot(previous.normal)>.9999,'adjacent cliff borders shade continuously');joinedCliffNormals++;
    }else cliffSeams.set(key,{geometry:g,normal});
  }
}
assert.ok(joinedCliffNormals>100,'inspect actual shared cliff boundaries on both banks');
// A height query cannot measure attachment below an overhang. Check distance
// to the actual wall/crown triangles in 3D, independently of the placement rays.
const cliffTriangles=[];
for(const g of cliffBatches)if(g.userData.trenchCliff||g.userData.trenchSpoilSkin){
  const p=g.attributes.position,index=g.index;
  for(let i=0;i<index.count;i+=3){
    const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index.getX(i+k)));
    const triangle=new THREE.Triangle(...vertices);
    if(triangle.getArea()>1e-10)cliffTriangles.push({triangle,bounds:new THREE.Box3().setFromPoints(vertices)});
  }
}
const closest=new THREE.Vector3();let maxCliffRootGap=0,cliffRootSamples=0;
for(const g of cliffBatches)if(g.userData.trenchRoots){
  const p=g.attributes.position,ends=[0,4].map(start=>{
    const centre=new THREE.Vector3();
    for(let i=0;i<3;i++)centre.add(new THREE.Vector3().fromBufferAttribute(p,start+i));
    return centre.multiplyScalar(1/3);
  });
  for(const t of [0,.25,.5,.75,1]){
    const point=ends[0].clone().lerp(ends[1],t);let distance=Infinity;
    for(const {triangle,bounds} of cliffTriangles){
      if(bounds.distanceToPoint(point)>Math.min(distance,.08))continue;
      triangle.closestPointToPoint(point,closest);distance=Math.min(distance,point.distanceTo(closest));
    }
    maxCliffRootGap=Math.max(maxCliffRootGap,distance);cliffRootSamples++;
  }
}
assert.ok(cliffRootSamples>100,'sample the actual fibres on the authored cliff fixture');
assert.ok(maxCliffRootGap<.06,`cliff roots follow the actual overhanging mesh (max gap ${maxCliffRootGap})`);
const noCrownPlan=CompileTrenchNetwork({seed:'NoCrown',segments:[{id:'Exit',preset:'communication',
  points:[[0,0],[0,20]],jitterScale:0,cornerRadiusM:0,bermH:0}]});
let noCrownPanels=0;
BuildTrenchEarth({SetSector(){},Add(key,g){
  if(g.userData.trenchCliff){
    noCrownPanels++;const p=g.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(p.getY(i)<=.00001,'an explicitly crownless exit has no raised visual lip');
  }
  g.dispose();
}},noCrownPlan,(x,z)=>noCrownPlan.Apply(x,z,0,0),{cliffs:cliffKit,roots:null,style:{...TRENCH_APPEARANCE,
  clodChance:0,bankClods:0,crumbs:0,lipClods:0,spoilClods:0}});
assert.ok(noCrownPanels>10,'exercise crownless modules across both sides of an exit');
// Small crown crumbs must follow the visible front edge, including its inset,
// instead of remaining behind it at the original heightfield crest.
const edgeBatches=[];
BuildTrenchEarth({SetSector(){},Add(key,g){edgeBatches.push(g);}},cutPlan,cutGround,
  {cliffs:cliffKit,roots:null,style:{...TRENCH_APPEARANCE,clodChance:0,bankClods:0,crumbs:0,
    lipClods:4,lipRadiusM:[.06,.06],lipReliefM:[.025,.025],spoilClods:0}});
const edgeSides=new Map([[-1,new Map()],[1,new Map()]]);
for(const g of edgeBatches)if(g.userData.trenchCliff){
  const p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)if(uv.getX(i)>=1-1e-6){
    const x=p.getX(i),z=p.getZ(i),side=edgeSides.get(Math.sign(x)),key=z.toFixed(6),old=side.get(key);
    if(!old||Math.abs(x)<old.x)side.set(key,{x:Math.abs(x),z});
  }
}
const edgeLines=new Map([...edgeSides].map(([side,points])=>[side,[...points.values()].sort((a,b)=>a.z-b.z)]));
let edgeCrumbs=0;
for(const g of edgeBatches)if(g.userData.trenchCrown&&!g.userData.trenchSpoilSkin&&!g.userData.trenchCrust){
  g.computeBoundingBox();const centre=g.boundingBox.getCenter(new THREE.Vector3());
  if(centre.z<=5||centre.z>=15)continue;
  const line=edgeLines.get(Math.sign(centre.x));let j=1;while(j<line.length-1&&line[j].z<centre.z)j++;
  const a=line[j-1],b=line[j],t=(centre.z-a.z)/(b.z-a.z),edge=a.x+(b.x-a.x)*t;
  const offset=Math.abs(centre.x)-edge;
  assert.ok(offset>-.02&&offset<.12,'crown crumbs sit beside the actual modelled edge');edgeCrumbs++;
}
assert.ok(edgeCrumbs>10,'exercise small edge crumbs on both trench sides');
for(const g of edgeBatches)g.dispose();
for(const g of cliffKit)g.dispose();
cliffScene.traverse(node=>{if(node.isMesh){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();}});
// A crown can cross onto a steep neighbouring bank. Large clods must shrink to
// crumbs there, preserve their exposed cap and remain seated across curved terrain.
const steepGround=(x,z)=>Math.abs(x)*5+Math.sin(z*2)*.09;
const steepPlan={...plan,Corridor:()=>({bermWidth:1}),Depth:()=>0};
let steepClods=0;
BuildTrenchEarth({SetSector(){},Add(key,g){
  if(!g.userData.trenchCrust&&!g.userData.trenchSpoilSkin&&!g.userData.trenchRoots){
    const p=g.attributes.position;let diameter=0,minGap=Infinity;
    for(let i=0;i<p.count;i++){
      minGap=Math.min(minGap,p.getY(i)-steepGround(p.getX(i),p.getZ(i)));
      for(let j=0;j<i;j++)diameter=Math.max(diameter,Math.hypot(p.getX(i)-p.getX(j),p.getY(i)-p.getY(j),p.getZ(i)-p.getZ(j)));
    }
    assert.ok(diameter<.20,'steep-bank clods stay small solid crumbs instead of stretched sheets');
    assert.ok(minGap<0,'clod underside remains embedded in the bank');steepClods++;
  }
  g.dispose();
}},steepPlan,steepGround,{roots:null,style:{...TRENCH_APPEARANCE,clodChance:0,bankClods:1,
  clodRadiusM:[.2,.2],clodReliefM:[.08,.08],crumbs:0,lipClods:0,spoilClods:0}});
assert.ok(steepClods>10,'steep conformance fixture exercises both banks');
// Exercise the actual Blender kit on a flat raised bank. Its large variants
// must reach the rendered geometry, and embedded feet must shade continuously
// without flattening the exposed cap normals.
const clodBytes=fs.readFileSync(new URL(C.models.clods,import.meta.url));
const clodScene=await new GLTFLoader().parseAsync(clodBytes.buffer.slice(clodBytes.byteOffset,clodBytes.byteOffset+clodBytes.byteLength),'');
const clodKit=[];clodScene.scene.updateMatrixWorld(true);clodScene.scene.traverse(node=>{
  if(!node.isMesh)return;
  const g=node.geometry.clone().applyMatrix4(node.matrixWorld);
  g.userData.trenchClodHigh=node.name.endsWith('High');g.userData.trenchClodShape=node.name;clodKit.push(g);
});
const raisedBank=(x,z)=>Math.abs(x)>1.5?2:0;
// Leave gaps between fixture stations so no decorative skin is laid over the
// deliberately flat host plane being used to measure contact normals here.
const flatCapPlan={...steepPlan,segments:steepPlan.segments.map(segment=>({...segment,
  stations:segment.stations.map((st,i)=>({...st,junctionClear:i%2===1}))}))};
let largeClods=0,buriedNormals=0,sculptedCaps=0,removedBuriedFaces=0;
BuildTrenchEarth({SetSector(){},Add(key,g){
  if(g.userData.trenchClodHigh){
    largeClods++;
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    const original=clodKit.find(source=>source.userData.trenchClodShape===g.userData.trenchClodShape).index;
    const retained=new Set();
    for(let i=0;i<g.index.count;i+=3)retained.add([0,1,2].map(k=>g.index.getX(i+k)).join(':'));
    for(let i=0;i<original.count;i+=3){
      const ids=[0,1,2].map(k=>original.getX(i+k));
      if(ids.some(v=>p.getY(v)>=2))assert.ok(retained.has(ids.join(':')),'hidden-face culling preserves every triangle touching the visible cap');
      if(!retained.has(ids.join(':'))){
        assert.ok(ids.every(v=>p.getY(v)<2-.018),'removed clod triangles are below the physical ground');removedBuriedFaces++;
      }
    }
    for(let i=0;i<p.count;i++){
      const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
      assert.ok(Math.abs(length-1)<1e-5,'blended clod normals stay finite and unit length');
      if(p.getY(i)<2){
        assert.ok(n.getY(i)>.999,'embedded foot follows the flat host normal');
        assert.ok(Math.abs(uv.getY(i)+9)<1e-5,'embedded foot retains loose-soil colour');buriedNormals++;
      }
      if(p.getY(i)>2.06)assert.ok(uv.getY(i)<-9.24,'exposed aggregate carries the cohesive core blend marker');
      if(p.getY(i)>2.06&&n.getY(i)<.95)sculptedCaps++;
    }
  }
  g.dispose();
}},flatCapPlan,raisedBank,{clods:clodKit,roots:null,style:{...TRENCH_APPEARANCE,
  crustReliefM:0,cutShoulderM:0,spadeReliefM:0,clodChance:0,bankClods:0,crumbs:0,
  lipClods:4,lipRadiusM:[.30,.30],lipReliefM:[.10,.10],spoilClods:0}});
assert.ok(largeClods>10&&buriedNormals>20&&sculptedCaps>10,'large soil caps are detailed while their feet join the host');
assert.ok(removedBuriedFaces>100,'the real kit sheds hidden faces without flattening its visible silhouette');
// A solid chunk resting beside a drop must remain a chunk. Its buried sole
// cannot be pulled down the whole wall to meet the much lower surface below.
const ledgePlan={...cutPlan,Corridor:()=>({bermWidth:1,inCut:false}),Depth:()=>0,
  segments:cutPlan.segments.map(segment=>({...segment,stations:segment.stations.map((st,i)=>({...st,junctionClear:i%2===1}))}))};
let ledgeClods=0,edgeSpanningClods=0;
BuildTrenchEarth({SetSector(){},Add(key,g){
  if(g.userData.trenchClodHigh){
    const p=g.attributes.position;let low=Infinity,high=-Infinity,inner=Infinity,outer=0;
    for(let i=0;i<p.count;i++){
      low=Math.min(low,p.getY(i));high=Math.max(high,p.getY(i));
      inner=Math.min(inner,Math.abs(p.getX(i)));outer=Math.max(outer,Math.abs(p.getX(i)));
    }
    assert.ok(high-low<.65,'a 60 cm soil chunk does not stretch into a two-metre curtain');
    if(inner<2.7&&outer>2.78)edgeSpanningClods++;
    ledgeClods++;
  }
  g.dispose();
}},ledgePlan,(x,z)=>Math.abs(x)>2.7?2:0,{clods:clodKit,roots:null,style:{...TRENCH_APPEARANCE,
  bankStart:1.05,bankEnd:1.05,clodChance:0,bankClods:0,crumbs:0,lipClods:12,
  lipRadiusM:[.30,.30],lipReliefM:[.10,.10],spoilClods:0}});
assert.ok(ledgeClods>10&&edgeSpanningClods>4,'actual high-detail chunks span both sides of the ledge fixture');
for(const g of clodKit)g.dispose();
clodScene.scene.traverse(node=>{if(node.isMesh){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();}});
const previewPlan=CompileTrenchNetwork({seed:'SpoilPreview',earthProfile:TRENCH_EARTH_PROFILE,
  segments:[{id:'Cut',preset:'communication',points:[[0,0],[0,20]],jitterScale:0}]});
let crownVertices=0;
BuildTrenchPreview({Add(key,g){
  if(key==='trench'){
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      assert.ok(Math.abs(p.getY(i)-previewPlan.Apply(p.getX(i),p.getZ(i),0,0))<1e-5,'editor preview uses the shared physical profile');
      if(p.getY(i)>.4)crownVertices++;
    }
  }
  g.dispose();
}},previewPlan,'Cut',{lift:0,natural:()=>0});
assert.ok(crownVertices>20,'editor preview contains raised spoil crowns, not only their flat boundaries');
console.log('TrenchSurfaceTest: physical contact update/reset, measured grass direction, geometry and packed asset contracts passed');
