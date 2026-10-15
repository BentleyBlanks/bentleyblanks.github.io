// Real production sword, hand bones and phase clock; no proxy sword animation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {FPS_ARM_LIMITS} from './Data_FpsArmPoses.mjs';
import {FPS_DADAO_SWING} from './Data_FpsDadaoSwing.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(project,'_shots','DadaoPower','Acceptance');fs.mkdirSync(out,{recursive:true});
assert.equal(FPS_DADAO_SWING.frames.length,121);
for(const row of FPS_DADAO_SWING.frames)assert(row.length===19&&row.every(Number.isFinite));
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
 await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort('blockedbyclient'));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`,{waitUntil:'load',timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.running&&Taierzhuang.meleeAnimationsLoaded,null,{timeout:120000});
 const data=await page.evaluate(async(exportSource)=>{
  const THREE=await import('./vendor/three/build/three.module.js');
  const {MELEE_WEAPONS}=await import('./Data_MeleeCombat.mjs');
  const {SampleMeleeVideo}=await import('./Script_MeleeAnimation.mjs');
  const {FPS_DADAO_SWING:stroke}=await import('./Data_FpsDadaoSwing.mjs');
  const {FPS_ARM_POSES:poses}=await import('./Data_FpsArmPoses.mjs');
  const T=Taierzhuang,L=T.Debug.MeleeCombat;L.Select('DadaoOne');L.Pause(true);T.StepFrames(90,1/60,false);
  const v=T.viewmodel,r=v.riggedArms,bones=[];r.root.traverse(o=>{if(o.isBone)bones.push(o);});
  const result={clips:[],boneNames:bones.map(b=>b.name),sourceFrames:[],
   camera:{projectionMatrix:T.camera.projectionMatrix.toArray(),fov:T.camera.fov,aspect:T.camera.aspect,viewport:{width:1280,height:720}},
   strokeControlSignature:stroke.strokeControlSignature||null,runtimeStroke:structuredClone(stroke)};
  const HiltOrder=()=>Object.fromEntries(['r','l'].map(side=>{
   const root=digit=>r.fingerBones[side].find(b=>b.name.toLowerCase().endsWith('finger'+digit));
   const index=v.rig.group.worldToLocal(root(1).getWorldPosition(new THREE.Vector3()));
   const little=v.rig.group.worldToLocal(root(4).getWorldPosition(new THREE.Vector3()));
   return [side,index.z-little.z];
  }));
  result.hiltGripOrder=HiltOrder();
  // A power-grip thumb closes over the index. Requiring every fingertip to
  // contact the weapon instead allowed an extended thumb against the guard.
  const powerGripMeshes=[];
  r.root.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const g=mesh.geometry,names=mesh.skeleton.bones.map(b=>b.name.toLowerCase().replace(/[^a-z0-9]/g,''));
   const thumb=names.findIndex(n=>n.endsWith('rfinger02')),index=names.findIndex(n=>n.endsWith('rfinger1'));
   if(thumb<0||index<0)return;
   const Weight=(i,bone)=>{let w=0;for(let k=0;k<4;k++)if(g.attributes.skinIndex.getComponent(i,k)===bone)w+=g.attributes.skinWeight.getComponent(i,k);return w;};
   const tips=[],weights=[];for(let i=0;i<g.attributes.position.count;i++){if(Weight(i,thumb)>.8)tips.push(i);weights.push(Weight(i,index));}
   const faces=[];for(let i=0;i<(g.index?.count||g.attributes.position.count);i+=3){const f=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);if(f.every(j=>weights[j]>.25)&&f.some(j=>weights[j]>.6))faces.push(f);}
   if(tips.length||faces.length)powerGripMeshes.push({mesh,tips,faces});
  });
  const PowerGrip=()=>{
   const inverse=v.rig.group.matrixWorld.clone().invert(),tips=[],triangles=[];
   for(const {mesh,tips:ids,faces} of powerGripMeshes){
    mesh.skeleton.update();const matrix=inverse.clone().multiply(mesh.matrixWorld),points=new Map();
    const Point=i=>{if(!points.has(i))points.set(i,mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix));return points.get(i);};
    tips.push(...ids.map(Point));for(const face of faces)triangles.push(new THREE.Triangle(...face.map(Point)));
   }
   let gap=Infinity;const closest=new THREE.Vector3();for(const tip of tips)for(const tri of triangles){tri.closestPointToPoint(tip,closest);gap=Math.min(gap,tip.distanceTo(closest));}
   const index=r.fingerBones.r.find(b=>b.name.toLowerCase().endsWith('finger1'));
   return {thumbToIndexM:gap,indexKnuckleZ:v.rig.group.worldToLocal(index.getWorldPosition(new THREE.Vector3())).z};
  };
  if(r!==v.armRigs.Dadao||!r.fixedRestLengths)throw Error('Dadao must use the repaired fixed-length hands');
  const model=v.rig.group.getObjectByName('Model_DadaoEdgeMount');
  if(!model)throw Error('Missing measured Dadao edge mount');
  model.updateWorldMatrix(true,true);
  const bladeSurface=[],surfaceBox=new THREE.Box3(),weaponInverse=v.rig.group.matrixWorld.clone().invert();
  model.traverse(o=>{
   if(!o.isMesh)return;
   const g=o.geometry,p=g.attributes.position,index=g.index,m=weaponInverse.clone().multiply(o.matrixWorld);
   for(let i=0;i<(index?.count||p.count);i+=3){
    const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(m));
    const box=new THREE.Box3().setFromPoints(points);surfaceBox.union(box);
    bladeSurface.push({triangle:new THREE.Triangle(...points),box});
   }
  });
  const sleeveRadii={r:0,l:0},sleeveSamples=17,sleeveRange=[.20,.68],sleeveMargin=.001;
  const anchorInverse=v.armAnchor.matrixWorld.clone().invert();
  for(const side of ['r','l']){
   const elbow=r.bones[side].forearm.getWorldPosition(new THREE.Vector3()).applyMatrix4(anchorInverse);
   const wrist=r.bones[side].hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(anchorInverse);
   const axis=wrist.clone().sub(elbow),length=axis.length();axis.normalize();
   r.root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const g=mesh.geometry,bone=mesh.skeleton.bones.indexOf(r.bones[side].forearm);if(bone<0)return;
    const matrix=anchorInverse.clone().multiply(mesh.matrixWorld);
    for(let i=0;i<g.attributes.position.count;i++){
     let strongest=-1,weight=-1;
     for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k);if(w>weight){weight=w;strongest=g.attributes.skinIndex.getComponent(i,k);}}
     if(strongest!==bone)continue;
     const point=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix).sub(elbow),along=point.dot(axis),fraction=along/length;
     if(fraction<sleeveRange[0]||fraction>sleeveRange[1])continue;
     sleeveRadii[side]=Math.max(sleeveRadii[side],point.addScaledVector(axis,-along).length());
    }
   });
   if(!sleeveRadii[side])throw Error('No measured middle-forearm sleeve surface '+side);
  }
  const sleeveMeshes=[];
  r.root.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const g=mesh.geometry,names=mesh.skeleton.bones.map(b=>b.name.toLowerCase().replace(/[^a-z0-9]/g,'')),owner=[];
   for(let i=0;i<g.attributes.position.count;i++){
    let strongest=-1,weight=-1;for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k);if(w>weight){weight=w;strongest=g.attributes.skinIndex.getComponent(i,k);}}
    owner.push(names[strongest]);
   }
   for(const side of ['r','l']){
    const faces=[];for(let i=0;i<(g.index?.count||g.attributes.position.count);i+=3){const face=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);if(face.some(j=>owner[j]?.endsWith(side+'forearm')))faces.push(face);}
    if(faces.length)sleeveMeshes.push({mesh,side,faces});
   }
  });
  const SurfaceBvh=items=>{
   const box=new THREE.Box3();for(const item of items)box.union(item.box);
   if(items.length<=12)return {box,items};
   const size=box.getSize(new THREE.Vector3()),axis=size.x>size.y&&size.x>size.z?'x':size.y>size.z?'y':'z';
   items.sort((a,b)=>(a.box.min[axis]+a.box.max[axis])-(b.box.min[axis]+b.box.max[axis]));const middle=items.length>>1;
   return {box,left:SurfaceBvh(items.slice(0,middle)),right:SurfaceBvh(items.slice(middle))};
  };
  const swordBvh=SurfaceBvh(bladeSurface.slice());
  const SegmentDistance=(p1,q1,p2,q2)=>{
   const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),v=p1.clone().sub(p2),a=d1.dot(d1),e=d2.dot(d2),f=d2.dot(v);let s,t;
   const clamp=THREE.MathUtils.clamp;
   if(a<=1e-25&&e<=1e-25)return v.length();
   if(a<=1e-25){s=0;t=clamp(f/e,0,1);}else{
    const c=d1.dot(v);if(e<=1e-25){t=0;s=clamp(-c/a,0,1);}else{
     const b=d1.dot(d2),den=a*e-b*b;s=den>1e-25?clamp((b*f-c*e)/den,0,1):0;t=(b*s+f)/e;
     if(t<0){t=0;s=clamp(-c/a,0,1);}else if(t>1){t=1;s=clamp((b-c)/a,0,1);}
    }
   }
   return v.addScaledVector(d1,s).addScaledVector(d2,-t).length();
  };
  const TriangleDistance=(a,b)=>{
   const aa=[a.a,a.b,a.c],bb=[b.a,b.b,b.c],ray=new THREE.Ray(),hit=new THREE.Vector3(),closest=new THREE.Vector3();let distance=Infinity;
   for(const [points,triangle] of [[aa,b],[bb,a]])for(let i=0;i<3;i++){
    const edge=points[(i+1)%3].clone().sub(points[i]),length=edge.length();if(length<1e-15)continue;
    ray.set(points[i],edge.multiplyScalar(1/length));if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit)&&hit.distanceTo(points[i])<=length+1e-10)return 0;
   }
   for(const point of aa){b.closestPointToPoint(point,closest);const gap=point.distanceTo(closest);if(Number.isFinite(gap))distance=Math.min(distance,gap);}
   for(const point of bb){a.closestPointToPoint(point,closest);const gap=point.distanceTo(closest);if(Number.isFinite(gap))distance=Math.min(distance,gap);}
   for(let i=0;i<3;i++)for(let j=0;j<3;j++)distance=Math.min(distance,SegmentDistance(aa[i],aa[(i+1)%3],bb[j],bb[(j+1)%3]));
   if(!Number.isFinite(distance))throw Error('Non-finite sleeve/sword triangle distance');
   return distance;
  };
  result.forearmClearance={radiusMeters:sleeveRadii,envelopeIsDiagnosticOnly:true,fractionRange:sleeveRange,marginMeters:sleeveMargin,
   skinnedSubmeshes:[...new Set(sleeveMeshes.map(entry=>entry.mesh.name))],
   method:'All actual skinned sleeve triangles clipped to the middle20–68% axis interval, including extra garment meshes; actual sword triangle distance. Circular envelopes are diagnostic only.'};
  const SleeveClearance=(elbow,wrist,side,weapon)=>{
   const inverse=weapon.clone().invert(),first=new THREE.Vector3().fromArray(elbow).applyMatrix4(inverse),last=new THREE.Vector3().fromArray(wrist).applyMatrix4(inverse),axis=last.clone().sub(first),length=axis.length();axis.normalize();
   const scale=new THREE.Vector3().setFromMatrixScale(weapon);if(Math.max(scale.x,scale.y,scale.z)-Math.min(scale.x,scale.y,scale.z)>2e-5)throw Error('Remove render affine layer before sleeve clearance');
   const unit=(scale.x+scale.y+scale.z)/3,margin=sleeveMargin/unit,worldInverse=v.rig.group.matrixWorld.clone().invert();let minimum=margin;
   for(const entry of sleeveMeshes){
    if(entry.side!==side)continue;
    const matrix=worldInverse.clone().multiply(entry.mesh.matrixWorld),vertices=new Map();
    const Vertex=i=>{if(!vertices.has(i)){const point=entry.mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix);vertices.set(i,{point,fraction:point.clone().sub(first).dot(axis)/length});}return vertices.get(i);};
    for(const face of entry.faces){
     const points=face.map(Vertex),fractions=points.map(p=>p.fraction);if(Math.min(...fractions)>.68||Math.max(...fractions)<.20)continue;
     const box=new THREE.Box3().setFromPoints(points.map(p=>p.point)).expandByScalar(margin);if(!box.intersectsBox(surfaceBox))continue;
     let polygon=points;
     for(const [bound,sign] of [[.20,1],[.68,-1]]){
      const clipped=[];for(let i=0;i<polygon.length;i++){
       const end=polygon[i],start=polygon[(i+polygon.length-1)%polygon.length],inside=(start.fraction-bound)*sign>=0,next=(end.fraction-bound)*sign>=0;
       if(inside!==next)clipped.push({point:start.point.clone().lerp(end.point,(bound-start.fraction)/(end.fraction-start.fraction)),fraction:bound});
       if(next)clipped.push(end);
      }polygon=clipped;if(!polygon.length)break;
     }
     for(let i=1;i<polygon.length-1;i++){
      const triangle=new THREE.Triangle(polygon[0].point,polygon[i].point,polygon[i+1].point),bounds=new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]).expandByScalar(margin),stack=[swordBvh];
      while(stack.length){
       const node=stack.pop();if(!node.box.intersectsBox(bounds))continue;
       if(node.items){for(const item of node.items)if(item.box.intersectsBox(bounds))minimum=Math.min(minimum,TriangleDistance(triangle,item.triangle));}
       else stack.push(node.left,node.right);
      }
     }
    }
   }
   return minimum*unit;
  };
  const band=[];
  model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
   for(let i=0;i<p.count;i++){const point=model.worldToLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i)));
    if(Math.abs(point.z+.3)<.025)band.push(point);}});
  const low=Math.min(...band.map(p=>p.y)),high=Math.max(...band.map(p=>p.y));
  const Thickness=y=>{const xs=band.filter(p=>Math.abs(p.y-y)<.008).map(p=>p.x);return Math.max(...xs)-Math.min(...xs);};
  if(!(Thickness(high)<Thickness(low)*.5))throw Error('Measured thin edge must be the source model +Y side');
  result.edgeThickness={positiveY:Thickness(high),negativeY:Thickness(low)};
  const guard=new THREE.Quaternion().setFromEuler(new THREE.Euler(...poses.Dadao.hip.weapon.rotation,'YXZ'));
  const normals=stroke.frames
   .map(row=>new THREE.Vector3(1,0,0).applyQuaternion(guard).applyQuaternion(new THREE.Quaternion().fromArray(row,3)));
  result.cutPlaneDriftDeg=Math.max(...normals.map(normal=>THREE.MathUtils.radToDeg(normal.angleTo(normals[0]))));
  const Matrix=(o,relative)=>new THREE.Matrix4().multiplyMatrices(relative.matrixWorld.clone().invert(),o.matrixWorld).toArray();
  for(const action of ['Light','LightAlt','Heavy','Compact','CompactAlt','Charge']){
   const spec=MELEE_WEAPONS.Dadao[action==='Heavy'?'heavy':'light'],duration=spec.windup+spec.active+spec.recovery;
   const frames=[];
   for(let i=0;i<=120;i++){
    L.Preview(action,i/120);T.StepFrames(1,duration/120,false);v.root.updateWorldMatrix(true,true);
    const inverse=v.armAnchor.matrixWorld.clone().invert();
    const P=o=>o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray();
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,v.rig.group.matrixWorld);
    const modelMatrix=new THREE.Matrix4().multiplyMatrices(inverse,model.matrixWorld);
    const tip=new THREE.Vector3(0,-.012074,-.626).applyMatrix4(modelMatrix);
    const edge=new THREE.Vector3(0,1,0).transformDirection(modelMatrix);
    const rightWrist=P(r.bones.r.hand),leftWrist=P(r.bones.l.hand),rightElbow=P(r.bones.r.forearm),leftElbow=P(r.bones.l.forearm);
    frames.push({t:i/120,tip:tip.toArray(),edge:edge.toArray(),normal:new THREE.Vector3(1,0,0).transformDirection(modelMatrix).toArray(),grip:Math.max(r.gripError.r,r.gripError.l),
     wrist:Math.max(r.wristBend.r,r.wristBend.l),wristPair:{...r.wristBend},right:rightWrist,left:leftWrist,
     upper:P(r.bones.r.upperArm),elbow:rightElbow,leftElbow,weapon:matrix.toArray(),hiltGripOrder:HiltOrder(),powerGrip:i%60===0?PowerGrip():null,
     sleeveClearance:{r:SleeveClearance(rightElbow,rightWrist,'r',matrix),l:SleeveClearance(leftElbow,leftWrist,'l',matrix)}});
    if(exportSource&&action==='Light')result.sourceFrames.push({bones:bones.map(b=>Matrix(b,T.camera)),weapon:Matrix(v.rig.group,T.camera)});
   }
   result.clips.push({action,duration,windup:spec.windup,active:spec.active,frames});
  }
  // Seeking into recovery must agree with uninterrupted playback. The old
  // elbow limiter preserved a different bend plane and wrapped over the hilt.
  result.recoverySeekError=0;
  for(const index of [96,66,78,60,84]){
   L.Preview('Light',index/120);T.StepFrames(1,1/60,false);v.root.updateWorldMatrix(true,true);
   const expected=result.clips[0].frames[index];
   for(const [side,key] of [['r','elbow'],['l','leftElbow']]){
    const actual=v.armAnchor.worldToLocal(r.bones[side].forearm.getWorldPosition(new THREE.Vector3()));
    result.recoverySeekError=Math.max(result.recoverySeekError,actual.distanceTo(new THREE.Vector3().fromArray(expected[key])));
   }
  }
  // Interruption must start from the evaluated outgoing pose, without changing
  // its amplitude at mix=0 (the previous implementation shrank the downstroke).
  const from={clip:'DadaoLight',action:'Light',normalized:.4};
  const previous=SampleMeleeVideo(from);
  const transition=SampleMeleeVideo({clip:'DadaoParryLeft',action:'ParryLeft',normalized:0,transition:{from,mix:0}});
  result.interruptionError=Math.max(...previous.values.map((n,i)=>Math.abs(n-transition.values[i])));
  return result;
 // Every acceptance run freezes its actual Light bone/weapon matrices. A
 // default prepush run must never leave a previous sourceBake beside new data.
 },true);
 if(process.argv.includes('--trace'))fs.writeFileSync(path.join(out,'Data_DadaoSwingTrace.json'),JSON.stringify(data));
 assert.equal(data.sourceFrames.length,121,'Acceptance must capture fresh actual Light source matrices');
 assert.deepEqual(data.runtimeStroke,FPS_DADAO_SWING,'Runtime stroke differs from the current authored data, including fitted elbows and action parameters');
 fs.writeFileSync(path.join(out,'Data_DadaoSourceBake.json'),JSON.stringify({boneNames:data.boneNames,frames:data.sourceFrames,camera:data.camera,strokeControlSignature:data.strokeControlSignature,runtimeStroke:data.runtimeStroke,captureRole:'ProductionDadaoSwingTest',capturedAt:new Date().toISOString()}));
 assert.equal(FPS_DADAO_SWING.elbowFitStatus,'fitted','Export the bootstrap trace, fit the current grip elbows in Blender, then rebake before acceptance');
 assert(Object.values(data.hiltGripOrder).every(distance=>distance<-.04),'Both sword hands must have index knuckles toward the blade; a reversed support palm hooks the pommel');
 const Dist=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
 assert(data.cutPlaneDriftDeg<.1,`Blade twists during downstroke/follow-through: ${data.cutPlaneDriftDeg} degrees`);
 const metrics=[];
 for(const clip of data.clips){
  assert(clip.frames[0].edge[2]<-.8,`${clip.action}: real cutting edge must face forward in guard`);
  for(const f of clip.frames){
   assert(Object.values(f.hiltGripOrder).every(distance=>distance<-.04),`${clip.action} ${f.t}: default two-hand power grip reverses on the hilt`);
   const dot=f.normal.reduce((sum,n,i)=>sum+n*clip.frames[0].normal[i],0);
   assert(Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI<.1,`${clip.action} ${f.t}: blade rolls out of its cutting plane`);
   assert(f.grip<=FPS_ARM_LIMITS.positionResidualM,`${clip.action}: grip ${f.grip}`);
   assert(f.wrist<=FPS_ARM_LIMITS.wristBendDeg+.01,`${clip.action} ${f.t}: wrist ${f.wrist} ${JSON.stringify(f.wristPair)}`);
   for(const side of ['r','l'])assert(f.sleeveClearance[side]>=data.forearmClearance.marginMeters-2e-5,
    `${clip.action} ${f.t}: ${side} middle sleeve intersects measured sword surface (${f.sleeveClearance[side]} m clearance)`);
   if(f.powerGrip){
    assert(f.powerGrip.thumbToIndexM<.003,`${clip.action} ${f.t}: thumb must close onto the curled index (${f.powerGrip.thumbToIndexM} m)`);
    assert(f.powerGrip.indexKnuckleZ>.004,`${clip.action} ${f.t}: dominant hand must sit below the guard`);
   }
  }
  const upper=clip.frames.map(f=>Dist(f.upper,f.elbow)),lower=clip.frames.map(f=>Dist(f.elbow,f.right));
  assert(Math.max(...upper)-Math.min(...upper)<.001,'Upper arm must not stretch');
  assert(Math.max(...lower)-Math.min(...lower)<.001,'Forearm must not stretch');
  for(let i=1;i<clip.frames.length;i++)for(const key of ['elbow','leftElbow'])
   assert(Dist(clip.frames[i-1][key],clip.frames[i][key])<.085,`${clip.action} ${clip.frames[i].t}: elbow flips between frames`);
  if(clip.action==='Charge')continue;
  // A narrow-side grasp permits the hand to finish below its elbow. The
  // measured sleeve/sword geometry above replaces the old screen-Y proxy.
  const start=Math.ceil(clip.windup/clip.duration*120),end=Math.floor((clip.windup+clip.active)/clip.duration*120);
  let travel=0,alignment=0,peak=0;
  for(let i=start;i<end;i++){
   const a=clip.frames[i],b=clip.frames[i+1],d=Dist(a.tip,b.tip);travel+=d;peak=Math.max(peak,d/(clip.duration/120));
   alignment+=a.edge.reduce((sum,n,j)=>sum+n*(b.tip[j]-a.tip[j]),0)/d;
  }
  alignment/=end-start;
  const vertical=clip.frames[start].tip[1]-clip.frames[end].tip[1];
  const horizontal=clip.frames[start].tip[0]-clip.frames[end].tip[0];
  assert(horizontal>.45,`${clip.action}: cut must travel from right to left ${horizontal}`);
  assert(travel>1.6,`${clip.action}: insufficient cut travel ${travel}`);
  assert(vertical>.85,`${clip.action}: not a descending cut ${vertical}`);
  assert(alignment>.75,`${clip.action}: cutting with the flat/spine ${alignment}`);
  assert(peak<35,`${clip.action}: excessive blade speed ${peak}`);
  assert(Dist(clip.frames[0].tip,clip.frames[120].tip)<.012,`${clip.action}: recovery does not return to guard`);
  metrics.push({action:clip.action,travel,vertical,horizontal,alignment,peak,wrist:Math.max(...clip.frames.map(f=>f.wrist))});
 }
 assert(data.interruptionError<1e-6,'Interrupted cut changes amplitude');assert.deepEqual(errors,[]);
 assert(data.recoverySeekError<.001,`Recovery elbow changes with playback history: ${data.recoverySeekError} m`);
 const visibility=[];
 for(const viewport of [{width:1280,height:720},{width:1440,height:900}]){
  await page.setViewportSize(viewport);
  await page.waitForFunction(({width,height})=>Math.abs(Taierzhuang.camera.aspect-width/height)<1e-4,viewport,{timeout:10000});
  const checks=await page.evaluate(async()=>{
   const THREE=await import('./vendor/three/build/three.module.js'),T=Taierzhuang,L=T.Debug.MeleeCombat;
   L.Select('DadaoOne');L.Pause(true);T.StepFrames(90,1/60,false);
   return ['Light','Heavy','Charge'].map(action=>{
    let seen=0;
    for(let i=0;i<=30;i++){L.Preview(action,i/30);T.StepFrames(1,1/60,false);const p=T.viewmodel.riggedArms.bones.r.hand.getWorldPosition(new THREE.Vector3()).project(T.camera);if(Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1)seen++;}
    return {action,seen};
   });
  });
  for(const check of checks)assert(check.seen>=16,`${viewport.width}x${viewport.height} ${check.action}: hand absent for most frames (${check.seen}/31)`);
  visibility.push({viewport,checks});
 }
 await page.setViewportSize({width:1280,height:720});
 await page.waitForFunction(()=>Math.abs(Taierzhuang.camera.aspect-1280/720)<1e-4,null,{timeout:10000});
 const powerGrip=data.clips.flatMap(clip=>clip.frames.filter(f=>f.powerGrip).map(f=>({action:clip.action,t:f.t,...f.powerGrip})));
 fs.writeFileSync(path.join(out,'Data_DadaoSwingAcceptance.json'),JSON.stringify({metrics,visibility,powerGrip,hiltGripOrder:data.hiltGripOrder,cutPlaneDriftDeg:data.cutPlaneDriftDeg,interruptionError:data.interruptionError,recoverySeekError:data.recoverySeekError},null,2));
 for(const phase of [0,.24,.34,.4,.55,.85]){
  // ResizeObserver and the temporal render targets must settle before the first
  // capture. A single immediate frame after resizing can be an empty buffer.
  await page.evaluate(phase=>{Taierzhuang.Debug.MeleeCombat.Preview('Light',phase);Taierzhuang.StepFrames(2,0,true);},phase);
  await page.screenshot({path:path.join(out,`Scene_Dadao_${Math.round(phase*100)}.png`)});
 }
 const inspector=await page.evaluate(async()=>{
  const THREE=await import('./vendor/three/build/three.module.js');
  const {MELEE_WEAPONS}=await import('./Data_MeleeCombat.mjs');
  const T=Taierzhuang;T.Debug.OpenEditor('firstPerson');
  const editor=T.editor.active;editor.SetWeapon('Dadao');editor.SetPose('hip');
  for(let i=0;i<90;i++)editor.Update(1/60);
  editor.Trigger('melee');const v=T.viewmodel,r=v.riggedArms;
  const result={duration:v.action.duration,sources:[],grip:0,wrist:0,step:0,support:1};let previous=null;
  for(let i=0;i<120;i++){
   v.action.t=i/120;editor.Update(0);v.root.updateWorldMatrix(true,true);
   result.sources.push(v.meleeVideoFrame?.source||null);
   result.grip=Math.max(result.grip,r.gripError.r,r.gripError.l);result.wrist=Math.max(result.wrist,r.wristBend.r,r.wristBend.l);
   result.support=Math.min(result.support,r.contactWeight.l);
   const elbow=r._InAnchor(r.bones.l.forearm,new THREE.Vector3());
   if(previous)result.step=Math.max(result.step,elbow.distanceTo(previous));previous=elbow;
  }
  const spec=MELEE_WEAPONS.Dadao.light;result.expectedDuration=spec.windup+spec.active+spec.recovery;
  return result;
 });
 assert.equal(inspector.duration,inspector.expectedDuration,'inspector uses the combat stroke clock');
 assert(inspector.sources.every(source=>source==='BlenderDadaoPowerSwing'),'inspector must evaluate the Blender stroke');
 assert(inspector.support>.999&&inspector.grip<=FPS_ARM_LIMITS.positionResidualM,'inspector retains both real hilt contacts');
 assert(inspector.wrist<=FPS_ARM_LIMITS.wristBendDeg+.01&&inspector.step<.085,'inspector has continuous anatomical elbows');
 fs.writeFileSync(path.join(out,'Data_DadaoInspectorAcceptance.json'),JSON.stringify(inspector,null,2));
 console.log(JSON.stringify({metrics,visibility,inspector}));console.log('PASS Dadao descending edge-first stroke, anatomy, recovery, interruption and inspector action');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
