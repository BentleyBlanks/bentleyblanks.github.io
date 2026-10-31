import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BuildSink,AddHardMountainRoof} from './Script_World.mjs';
import {FlareSurfaceIndex} from './Script_FlareSurfaces.mjs';
import {FlareDirector,MakeFlareHost} from './Script_Flare.mjs';
let checks=0;const Check=(ok,message)=>{assert.ok(ok,message);checks++;};
function Build(options={}){
 const scene=new THREE.Scene(),root=new THREE.Group(),sink=new BuildSink();scene.add(root);
 AddHardMountainRoof(sink,{x:0,z:0,width:10,depth:6,eaveY:3,ridgeY:5,ry:.24,seed:'FlareRoofProbe',rafters:true,...options});
 const library={Get:name=>new THREE.MeshBasicMaterial({name,side:THREE.DoubleSide})};
 sink.Flush(root,library);const index=new FlareSurfaceIndex(scene,library);index.Refresh();
 return {scene,root,index,library,Dispose(){index.Clear();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}
for(const options of [{},{ruined:'partial'},{burnt:true}]){
 const rig=Build(options),ray=new THREE.Raycaster(),roofMeshes=rig.index.meshes;
 // Compare ALL visible roof triangles, including raised tiles and ridges.
 const reference=roofMeshes;
 Check(roofMeshes.length>0,'Authored roof is registered, including burnt roofs');
 for(let x=-6;x<=6;x+=.6)for(let z=-4;z<=4;z+=.4){
  const from={x,y:12,z},to={x,y:-1,z};ray.set(new THREE.Vector3(x,12,z),new THREE.Vector3(0,-1,0));ray.far=13;
  const full=ray.intersectObjects(reference,false)[0],fast=rig.index.TraceSegment(from,to);
  Check(!!full===!!fast,'Indexed query agrees with native full-mesh ray casting');
  if(full)Check(Math.abs(full.point.y-fast.point.y)<1e-4,'Roof point agrees, including existing holes '+JSON.stringify({options,x,z,full:full.point.y,fast:fast.point.y,mesh:full.object.name}));
 }
 const saved=rig.index.data;rig.index.Refresh();Check(saved===rig.index.data,'Unchanged scene reuses the triangle grid');
 const from={x:.4,y:12,z:.4},to={x:.4,y:-1,z:.4},hit=rig.index.TraceSegment(from,to);Check(!!hit,'Fixture hits intact roof region');
 rig.root.visible=false;Check(rig.index.TraceSegment(from,to)===null,'Hidden roofs do not receive a flare');rig.root.visible=true;
 rig.root.position.x=30;rig.index.Refresh();Check(!rig.index.TraceSegment(from,to),'Moved root does not leave stale collision');
 Check(!!rig.index.TraceSegment({...from,x:30.4},{...to,x:30.4}),'Root transform is reflected in collision');rig.Dispose();
}
{
 const rig=Build(),from={x:.2,y:12,z:.2},to={x:.2,y:-1,z:.2},hit=rig.index.TraceSegment(from,to);
 Check(!!hit,'Fixture hits intact roof region');
 const director=new FlareDirector(MakeFlareHost({vfx:{flareSurfaces:rig.index},Battlefield:()=>({GroundHeight:()=>0})}));
 director.LaunchFlare({preset:'Illumination',from:{x:-12,z:0},at:{x:0,z:0},driftMS:0,swayM:0});
 const f=director.flares[0];Check(f.landing.surface==='solid'&&f.landing.position.y>3,'Production host lands on a visible roof even without a gameplay roof collider');
 for(let t=0;t<60;t+=1/60)director.Update(1/60);Check(!director.Active,'Roof arrival still has finite cleanup');rig.Dispose();
}
{
 const scene=new THREE.Scene(),g=new THREE.BufferGeometry();
 // Upper downward-facing triangle is invisible from above with FrontSide;
 // lower upward-facing triangle is the actual visible support surface.
 g.setAttribute('position',new THREE.Float32BufferAttribute([-1,3.4,-1,1,3.4,-1,0,3.4,1,-1,3.3,-1,0,3.3,1,1,3.3,-1],3));
 g.userData.effectSurfaceRanges=[[0,6]];const mat=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(g,mat);scene.add(mesh);
 const index=new FlareSurfaceIndex(scene,null),ray=new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0),0,5);
 for(const scale of [1,-1])for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide]){
  mesh.scale.x=scale;
  mat.side=side;index.Refresh();const native=ray.intersectObject(mesh)[0],hit=index.TraceSegment({x:0,y:5,z:0},{x:0,y:0,z:0});
  Check(Math.abs(native.point.y-hit.point.y)<1e-6,'Material sidedness matches native visible roof selection');
 }
 index.Clear();g.dispose();mat.dispose();
}
console.log('FlareSurfaceTest passed:',checks,'checks');
