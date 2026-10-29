import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FlareShadowInstances} from './Script_FlareShadowInstances.mjs';
import {AttachShadowDepth} from './Script_ShadowDepth.mjs';

const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(2,2,2),material=new THREE.MeshStandardMaterial();
const source=new THREE.InstancedMesh(geometry,material,8),matrix=new THREE.Matrix4();
source.name='Source';source.castShadow=true;source.count=4;AttachShadowDepth(source);scene.add(source);
const Set=(i,x,y=0,z=-10)=>source.setMatrixAt(i,matrix.makeTranslation(x,y,z));
Set(0,0);Set(1,80);Set(2,-80);Set(3,2);
for(let i=0;i<4;i++)source.setColorAt(i,new THREE.Color(i/4,.3,.7));
source.instanceMatrix.needsUpdate=true;source.instanceColor.needsUpdate=true;scene.updateMatrixWorld(true);
const camera=new THREE.PerspectiveCamera(60,1,.25,100),main=new THREE.PerspectiveCamera();camera.updateMatrixWorld(true);
const culler=new FlareShadowInstances({minTriangles:0,maxInstances:8,maxObjects:3});
const Snapshot=()=>({matrices:Array.from(source.instanceMatrix.array),colors:source.instanceColor?Array.from(source.instanceColor.array):null,count:source.count,
  matrixVersion:source.instanceMatrix.version,colorVersion:source.instanceColor?.version,world:source.matrixWorld.toArray(),geometry:source.geometry,material:source.material,
  castShadow:source.castShadow,depth:source.customDepthMaterial,before:source.onBeforeShadow,after:source.onAfterShadow});
let snapshot=Snapshot(),restore=culler.Begin(scene,camera,main),record=culler.records.get(source),proxy=record.proxy;
assert.equal(source.visible,false);assert.equal(culler.root.visible,true);assert.equal(proxy.count,2);
assert.deepEqual(Array.from(proxy.instanceMatrix.array.slice(0,32)),[...source.instanceMatrix.array.slice(0,16),...source.instanceMatrix.array.slice(48,64)]);
assert.deepEqual(Array.from(proxy.instanceColor.array.slice(0,6)),[...source.instanceColor.array.slice(0,3),...source.instanceColor.array.slice(9,12)]);
assert.equal(proxy.geometry,geometry);assert.equal(proxy.material,material);assert.equal(proxy.customDepthMaterial,source.customDepthMaterial);
assert.equal(culler.stats.trianglesSaved,24);assert.equal(culler.stats.boundsRebuilt,1);assert.deepEqual(Snapshot(),snapshot);
restore();restore();assert.equal(source.visible,true);assert.equal(culler.root.visible,false);assert.deepEqual(Snapshot(),snapshot);
restore=culler.Begin(scene,camera,main);assert.equal(culler.stats.cacheHits,1);assert.equal(culler.stats.boundsRebuilt,0);restore();

// Alternating maps must not leave a proxy from a previous partial selection enabled.
camera.fov=175;camera.updateProjectionMatrix();restore=culler.Begin(scene,camera);assert.equal(source.visible,true);assert.equal(proxy.visible,false);restore();
camera.fov=60;camera.position.x=1000;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
restore=culler.Begin(scene,camera);assert.equal(source.visible,false);assert.equal(proxy.visible,false);assert.equal(culler.stats.visibleInstances,0);restore();
camera.position.x=0;camera.updateMatrixWorld(true);

// Matrix uploads, active count, world matrices, position-buffer edits and optional colors refresh independently.
Set(1,1);source.instanceMatrix.needsUpdate=true;source.count=3;
restore=culler.Begin(scene,camera);assert.equal(culler.stats.visibleInstances,2);assert.equal(culler.stats.boundsRebuilt,1);restore();
source.position.x=1000;source.updateMatrixWorld(true);restore=culler.Begin(scene,camera);assert.equal(culler.stats.visibleInstances,0);restore();
source.position.x=0;source.updateMatrixWorld(true);source.count=4;
geometry.attributes.position.array[0]+=1;geometry.attributes.position.needsUpdate=true;
restore=culler.Begin(scene,camera);assert.equal(culler.stats.boundsRebuilt,1);restore();
source.instanceColor=null;restore=culler.Begin(scene,camera);assert.equal(record.proxy.instanceColor,null);restore();
let proxyDisposed=0;record.proxy.addEventListener('dispose',()=>proxyDisposed++);
source.geometry=new THREE.BoxGeometry(3,3,3);restore=culler.Begin(scene,camera);assert.notEqual(culler.records.get(source),record);assert.equal(proxyDisposed,1);assert.equal(record.proxy.parent,null);restore();
source.geometry=geometry;restore=culler.Begin(scene,camera);restore();

// Independent clip-space corner oracle: no three Frustum/Box3 operations in this classifier.
let seed=0x19381029,samples=0;const Random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
function Transform(e,p){return [0,1,2,3].map(row=>e[row]*p[0]+e[row+4]*p[1]+e[row+8]*p[2]+e[row+12]);}
function Expected(local,world,clip){
  const corners=[];
  for(let mask=0;mask<8;mask++)corners.push(Transform(world,[(mask&1)?local.max.x:local.min.x,(mask&2)?local.max.y:local.min.y,(mask&4)?local.max.z:local.min.z]));
  const lo=[0,1,2].map(axis=>Math.min(...corners.map(p=>p[axis]))),hi=[0,1,2].map(axis=>Math.max(...corners.map(p=>p[axis]))),projected=[];
  for(let mask=0;mask<8;mask++)projected.push(Transform(clip,[(mask&1)?hi[0]:lo[0],(mask&2)?hi[1]:lo[1],(mask&4)?hi[2]:lo[2]]));
  return ![0,1,2,3,4,5].some(plane=>projected.every(p=>p[plane>>1]*(plane%2?1:-1)>p[3]));
}
for(let trial=0;trial<1200;trial++){
  camera.position.set((Random()-.5)*50,(Random()-.5)*30,(Random()-.5)*20);
  camera.lookAt((Random()-.5)*30,(Random()-.5)*20,-40);camera.fov=20+Random()*80;camera.aspect=.5+Random()*2;
  camera.setViewOffset(2,2,Random(),Random(),.5+Random(),.5+Random());camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  source.position.set((Random()-.5)*40,(Random()-.5)*30,(Random()-.5)*30);source.rotation.set(Random(),Random(),Random());source.updateMatrixWorld(true);
  for(let i=0;i<source.count;i++){
    matrix.compose(new THREE.Vector3((Random()-.5)*180,(Random()-.5)*90,-Random()*100),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Random()*6,Random()*6,Random()*6)),new THREE.Vector3(.3+Random()*4,.3+Random()*4,.3+Random()*4));
    source.setMatrixAt(i,matrix);
  }
  source.instanceMatrix.needsUpdate=true;
  const clip=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).elements;
  const local={min:{x:-1,y:-1,z:-1},max:{x:2,y:1,z:1}},expected=[];
  // One vertex was edited above: actual geometry's x max remains 1, so use independently scanned limits.
  const array=geometry.attributes.position.array;
  for(let axis=0;axis<3;axis++){let lo=Infinity,hi=-Infinity;for(let i=axis;i<array.length;i+=3){lo=Math.min(lo,array[i]);hi=Math.max(hi,array[i]);}local.min[['x','y','z'][axis]]=lo;local.max[['x','y','z'][axis]]=hi;}
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);const world=new THREE.Matrix4().multiplyMatrices(source.matrixWorld,matrix).elements;
    if(Expected(local,world,clip))expected.push(i);samples++;
  }
  const original=Snapshot();restore=culler.Begin(scene,camera);assert.equal(culler.stats.visibleInstances,expected.length);assert.deepEqual(Snapshot(),original);
  if(expected.length&&expected.length<source.count){const compact=culler.records.get(source).proxy;for(let i=0;i<expected.length;i++)assert.deepEqual(Array.from(compact.instanceMatrix.array.slice(i*16,(i+1)*16)),Array.from(source.instanceMatrix.array.slice(expected[i]*16,(expected[i]+1)*16)));}
  restore();
}

// Eligibility fallbacks, ancestor visibility and lifecycle cleanup never dispose shared assets.
let geometryDisposed=0,materialDisposed=0;geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
camera.clearViewOffset();camera.position.set(0,0,0);camera.lookAt(0,0,-1);camera.updateMatrixWorld(true);source.position.set(0,0,0);source.rotation.set(0,0,0);Set(0,0);Set(1,80);source.count=2;source.instanceMatrix.needsUpdate=true;source.updateMatrixWorld(true);
const Excluded=(change,undo)=>{change();restore=culler.Begin(scene,camera,main);assert.equal(culler.stats.objects,0);assert.equal(source.visible,true);restore();undo();};
Excluded(()=>source.add(new THREE.Group()),()=>source.clear());
const before=source.onBeforeShadow;Excluded(()=>source.onBeforeShadow=()=>{},()=>source.onBeforeShadow=before);
const depth=source.customDepthMaterial;Excluded(()=>source.customDepthMaterial=new THREE.MeshDepthMaterial(),()=>source.customDepthMaterial=depth);
Excluded(()=>geometry.setAttribute('custom',new THREE.InstancedBufferAttribute(new Float32Array(8),1)),()=>geometry.deleteAttribute('custom'));
Excluded(()=>geometry.morphAttributes.position=[geometry.attributes.position],()=>geometry.morphAttributes.position=[]);
Excluded(()=>material.displacementMap=new THREE.Texture(),()=>material.displacementMap=null);
Excluded(()=>source.layers.set(2),()=>source.layers.set(0));
Excluded(()=>source.castShadow=false,()=>source.castShadow=true);
scene.visible=false;restore=culler.Begin(scene,camera);assert.equal(culler.stats.objects,0);restore();scene.visible=true;
culler.bypass=true;restore=culler.Begin(scene,camera);assert.equal(source.visible,true);assert.equal(culler.root.visible,false);restore();culler.bypass=false;
restore=culler.Begin(scene,camera);assert.throws(()=>culler.Begin(scene,camera),/cannot overlap/);restore();
source.removeFromParent();restore=culler.Begin(scene,camera);assert.equal(culler.records.size,0);restore();
scene.add(source);restore=culler.Begin(scene,camera);assert.equal(source.visible,false);culler.Dispose();assert.equal(source.visible,true);assert.equal(culler.root.parent,null);
restore=culler.Begin(scene,camera);restore();const otherScene=new THREE.Scene();restore=culler.Begin(otherScene,camera);assert.equal(culler.records.size,0);assert.equal(culler.root.parent,otherScene);restore();culler.Dispose();
assert.equal(geometryDisposed,0);assert.equal(materialDisposed,0);
console.log('FlareShadowInstancesTest passed',JSON.stringify({samples,seed}));
