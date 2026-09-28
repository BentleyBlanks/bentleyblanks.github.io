// Production rigs, distance clock and real skinned contact on flat/slope/uneven support.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp/ProneCrawl');fs.mkdirSync(out,{recursive:true});
const source=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'Animation/ProneCrawl/Animation_TengxianHumanoidV1ProneCrawl.json')));
for(const track of source.tracks){const n=track.type==='quaternion'?4:3;for(let i=0;i<n;i++)assert.ok(Math.abs(track.values[i]-track.values.at(-n+i))<.00002,`loop seam ${track.name}`);}
const server=await ServeRoot(root,0),browser=await LaunchBrowser(),errors=[];
try {
 const page=await browser.newPage({viewport:{width:1400,height:900}});page.on('pageerror',e=>{errors.push(String(e));console.error('[pageerror]',String(e));});
 page.on('console',message=>{if(message.type()==='error')console.error('[console]',message.text());});
 // The test renders full production skins in its own renderer; the unused
 // city boot can use the small preset. GPU pipeline has a separate full gate.
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1&quality=low&scale=small`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.actorFactory,null,{timeout:240000});
 console.log('ProneCrawlTest: production factory ready');
 const report=await page.evaluate(async()=>{
  const T=await import('three'),g=window.Taierzhuang,f=g.actorFactory;f.SetBatcher(null);g.state.running=false;
  const {CHARACTER_MODEL_VARIANTS_BY_KIND}=await import('./Data_CharacterSelection.mjs');
  function GripSkinProbe(a){
   // Intersect the actual posed skin (vertices AND triangle centres) with
   // cross-sections of the shipped rifle. Socket distances miss fingers
   // that disappear into the wood between otherwise plausible knuckles.
   const triangles=[],skin=[],v=new T.Vector3(),ray=new T.Ray(new T.Vector3(),new T.Vector3(1,0,0));
   a.root.updateMatrixWorld(true);
   a.weaponGroup.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,idx=g.index;
    for(let i=0;i<(idx?.count||g.attributes.position.count);i+=3){
     const points=[0,1,2].map(j=>a.weaponGroup.worldToLocal(new T.Vector3().fromBufferAttribute(g.attributes.position,idx?idx.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld)));
     if(Math.max(...points.map(p=>p.z))<a.weaponGripFront.z-.2||Math.min(...points.map(p=>p.z))>a.weaponGripFront.z+.2)continue;
     triangles.push({points,triangle:new T.Triangle(...points),y0:Math.min(...points.map(p=>p.y)),y1:Math.max(...points.map(p=>p.y)),z0:Math.min(...points.map(p=>p.z)),z1:Math.max(...points.map(p=>p.z))});
    }
   });
   a.characterRig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const g=mesh.geometry,selected=new Set(),centres=[],regions=new Map();
    for(let i=0;i<g.attributes.position.count;i++){let weight=0,best=0,region='palm';for(let j=0;j<4;j++){const name=mesh.skeleton.bones[g.attributes.skinIndex.getComponent(i,j)].name,w=g.attributes.skinWeight.getComponent(i,j);if(/R_(Hand|Finger)/.test(name))weight+=w;if(w>best){best=w;region=/R_Finger0/.test(name)?'thumb':/R_Finger[1-4]/.test(name)?'fingers':'palm';}}if(weight>.5){selected.add(i);regions.set(i,region);}}
    const idx=g.index;for(let i=0;i<(idx?.count||g.attributes.position.count);i+=3){const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);if(ids.every(k=>selected.has(k)))centres.push(ids);}
    if(selected.size)skin.push({mesh,selected,centres,regions});
   });
   return (skinYOffset=0)=>{
    let maximumDepth=0,samples=0,worst=null;const points=[],gaps={thumb:Infinity,fingers:Infinity,palm:Infinity};
    for(const {mesh,selected,centres,regions} of skin){mesh.skeleton.update();const vertices=new Map();for(const i of selected){const p=a.weaponGroup.worldToLocal(mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));vertices.set(i,p);points.push({p,region:regions.get(i)});}for(const ids of centres)points.push({p:ids.reduce((p,i)=>p.add(vertices.get(i)),new T.Vector3()).multiplyScalar(1/3),region:regions.get(ids[0])});}
    for(const {p,region} of points){p.y+=skinYOffset;samples++;ray.origin.set(-2,p.y+1e-7,p.z+1e-7);const xs=[];
     for(const t of triangles)if(p.y>=t.y0&&p.y<=t.y1&&p.z>=t.z0&&p.z<=t.z1&&ray.intersectTriangle(...t.points,false,v))xs.push(v.x);
     xs.sort((a,b)=>a-b);const unique=xs.filter((x,i)=>!i||x-xs[i-1]>1e-6);
     for(let i=0;i+1<unique.length;i+=2){gaps[region]=Math.min(gaps[region],Math.max(unique[i]-p.x,p.x-unique[i+1],0));if(p.x>unique[i]&&p.x<unique[i+1]){
      // Ray parity classifies interior. Penetration is the SHORTEST surface
      // distance, not the horizontal chord (which overstates curved barrels).
      let squared=Infinity;for(const t of triangles){t.triangle.closestPointToPoint(p,v);squared=Math.min(squared,p.distanceToSquared(v));}
      const depth=Math.sqrt(squared);if(depth>maximumDepth){maximumDepth=depth;worst={region,point:p.toArray()};}
     }}
    }
    return {maximumDepth,samples,gaps,worst};
   };
  }
  const surfaces={flat:()=>0,slope:(x,z)=>.16*x-.20*z,uneven:(x,z)=>.12*x-.12*z+.08*Math.exp(-((x+.3)**2+(z+.3)**2)/.1),downhill:(x,z)=>-.16*x+.20*z,ripple:(x,z)=>.10*Math.sin(z*2)+.04*Math.cos(x*3)};
  const rows=[];let preview;
  for(const [name,ground] of Object.entries(surfaces))for(const kind of ['nra','ija'])for(const modelVariant of CHARACTER_MODEL_VARIANTS_BY_KIND[kind]) {
   const actor=f.Create(kind,{seed:1234,modelVariant,weapon:kind==='ija'?'Type38':'HanYang'}),rig=actor.characterRig;
   const meshes=[];rig.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
   const wristSkin=meshes.find(m=>m.skeleton.bones.includes(rig.bones.handR)&&m.skeleton.bones.includes(rig.bones.forearmR));
   const wristSkeleton=wristSkin.skeleton,restWrist=new T.Quaternion();
   wristSkeleton.boneInverses[wristSkeleton.bones.indexOf(rig.bones.forearmR)].clone()
    .multiply(wristSkeleton.boneInverses[wristSkeleton.bones.indexOf(rig.bones.handR)].clone().invert())
    .decompose(new T.Vector3(),restWrist,new T.Vector3());
   const armBinds=['L','R'].map(side=>{
    const a=rig.bones['upperArm'+side],b=rig.bones['forearm'+side],c=rig.bones['hand'+side];
    const skeleton=meshes.find(m=>m.skeleton.bones.includes(a)&&m.skeleton.bones.includes(c)).skeleton;
    const rest=[a,b,c].map(bone=>skeleton.boneInverses[skeleton.bones.indexOf(bone)].clone().invert());
    const [pa,pb,pc]=rest.map(m=>new T.Vector3().setFromMatrixPosition(m)),[qa,qb]=rest.map(m=>{const q=new T.Quaternion();m.decompose(new T.Vector3(),q,new T.Vector3());return q;});
    return {side,a,b,c,hinge:pb.clone().sub(pa).normalize().cross(new T.Vector3(0,0,1)).normalize().applyQuaternion(qa.clone().invert()),
      relative:qa.clone().invert().multiply(qb),axis:pc.sub(pb).normalize().applyQuaternion(qb.invert())};
   });
   function ArmAngles(bind){
    const {a,b,c,hinge,relative,axis}=bind,qa=a.getWorldQuaternion(new T.Quaternion()),qb=b.getWorldQuaternion(new T.Quaternion());
    const u=b.getWorldPosition(new T.Vector3()).sub(a.getWorldPosition(new T.Vector3())).normalize(),v=c.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize();
    const normal=hinge.clone().applyQuaternion(qa),cross=u.clone().cross(v),bend=Math.atan2(normal.dot(cross),u.dot(v));
    const neutral=qa.clone().multiply(relative),neutralAxis=axis.clone().applyQuaternion(neutral);
    neutral.premultiply(new T.Quaternion().setFromUnitVectors(neutralAxis,v));
    const delta=qb.multiply(neutral.invert());let twist=2*Math.atan2(new T.Vector3(delta.x,delta.y,delta.z).dot(v),delta.w);
    twist=T.MathUtils.euclideanModulo(twist+Math.PI,2*Math.PI)-Math.PI;
    return {bend,hingeError:normal.angleTo(cross),twist:Math.abs(twist)};
   }
   f.groundProbe=(x,z)=>({y:ground(x,z),normal:new T.Vector3(-(ground(x+.001,z)-ground(x-.001,z))/.002,1,-(ground(x,z+.001)-ground(x,z-.001))/.002).normalize().toArray()});
   let minimum=Infinity,maximumLengthError=0,maxSupportSlip=0,worst=null;const costs=[];const baseLengths=new Map(),start=new T.Vector3(),p=new T.Vector3();
   const frameBones=[],previousRotations=new Map();let maxJointStep=0,maxGripError=0,maxGripAlongError=0,maxWristBend=0,maxWristRotation=0,maxToeRise=-Infinity,minFootAlignment=1,maxGripSkinDepth=0,maxThumbGap=0,maxFingerGap=0,gripSkinSamples=0,probeGrip,gripWorst,invalidGripDepth=0;const jointSteps={};
   let minElbowFlexion=Infinity,maxElbowFlexion=0,maxElbowHingeError=0,maxForearmTwist=0,invalidElbowFlexion=0;
   for(let frame=0;frame<160;frame++){
    actor.root.position.z=-frame*.3/30;actor.root.position.y=ground(0,actor.root.position.z);
    const before=performance.now();
    actor.Update(1/30,{prone:1,aim:1,moveSpeed:.3/4.2,moveSpeedMps:.3,elapsed:frame/30,locomotionTracked:true});
    if(frame<20)continue;
    costs.push(performance.now()-before);
    for(const l of rig.proneContact.limbs)if(l.supporting&&l.contactPhase>.08&&l.contactPhase<.56){
      l.c.getWorldPosition(p);maxSupportSlip=Math.max(maxSupportSlip,Math.hypot(p.x-l.anchor.x,p.z-l.anchor.z));
    }
    actor.root.updateMatrixWorld(true);
    for(const bind of armBinds){const angles=ArmAngles(bind);minElbowFlexion=Math.min(minElbowFlexion,angles.bend);maxElbowFlexion=Math.max(maxElbowFlexion,angles.bend);maxElbowHingeError=Math.max(maxElbowHingeError,angles.hingeError);maxForearmTwist=Math.max(maxForearmTwist,angles.twist);}
    if(frame===20){
      // Same endpoints and wrist, but a backwards upper-arm hinge, as in V3.
      // The new check must reject it; position/length/wrist tests cannot.
      const bind=armBinds[1],{a,b}=bind,oldA=a.quaternion.clone(),oldB=b.quaternion.clone(),worldB=b.getWorldQuaternion(new T.Quaternion());
      const axis=b.getWorldPosition(new T.Vector3()).sub(a.getWorldPosition(new T.Vector3())).normalize();
      const q=a.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromAxisAngle(axis,Math.PI));
      a.quaternion.copy(a.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldB));
      invalidElbowFlexion=ArmAngles(bind).bend;a.quaternion.copy(oldA);b.quaternion.copy(oldB);actor.root.updateMatrixWorld(true);
    }
    if(frame===20){probeGrip=GripSkinProbe(actor);invalidGripDepth=probeGrip(-.05).maximumDepth;}
    if(frame%4===0){const measurement=probeGrip();if(measurement.maximumDepth>maxGripSkinDepth){maxGripSkinDepth=measurement.maximumDepth;gripWorst={frame,...measurement.worst};}maxThumbGap=Math.max(maxThumbGap,measurement.gaps.thumb);maxFingerGap=Math.max(maxFingerGap,measurement.gaps.fingers);gripSkinSamples+=measurement.samples;}
    for(const key of ['thighL','thighR','calfL','calfR','upperArmL','upperArmR','forearmL','forearmR']){
      const q=rig.bones[key].getWorldQuaternion(new T.Quaternion()),prior=previousRotations.get(key);
      if(prior){const step=prior.angleTo(q);maxJointStep=Math.max(maxJointStep,step);jointSteps[key]=Math.max(jointSteps[key]||0,step);}
      previousRotations.set(key,q);
    }
    for(const side of ['L','R']){
      const foot=rig.bones['foot'+side],toe=foot.children.find(b=>/Toe0$/.test(b.name));
      const ankle=foot.getWorldPosition(new T.Vector3()),tip=toe.getWorldPosition(new T.Vector3()),knee=rig.bones['calf'+side].getWorldPosition(new T.Vector3());
      maxToeRise=Math.max(maxToeRise,tip.y-ankle.y);
      const shin=ankle.clone().sub(knee);shin.y=0;const toes=tip.sub(ankle);toes.y=0;
      minFootAlignment=Math.min(minFootAlignment,shin.normalize().dot(toes.normalize()));
    }
    maxGripError=Math.max(maxGripError,actor.weaponGripFront.clone().applyMatrix4(actor.weaponGroup.matrixWorld).distanceTo(rig.Grip('weaponR').getWorldPosition(new T.Vector3())));
    maxGripAlongError=Math.max(maxGripAlongError,Math.abs(actor.weaponGroup.worldToLocal(rig.Grip('weaponR').getWorldPosition(new T.Vector3())).z-actor.weaponGripFront.z));
    const wrist=rig.bones.handR.getWorldPosition(new T.Vector3());
    const forearm=wrist.clone().sub(rig.bones.forearmR.getWorldPosition(new T.Vector3())).normalize();
    const palm=rig.Grip('weaponR').getWorldPosition(new T.Vector3()).sub(wrist).normalize();
    maxWristBend=Math.max(maxWristBend,forearm.angleTo(palm));
    const wristRelative=rig.bones.forearmR.getWorldQuaternion(new T.Quaternion()).invert().multiply(rig.bones.handR.getWorldQuaternion(new T.Quaternion()));
    maxWristRotation=Math.max(maxWristRotation,restWrist.angleTo(wristRelative));
    for(const [key,bone] of Object.entries(rig.bones))if(bone.isBone&&bone.parent?.isBone&&key!=='pelvis'){
     const length=bone.getWorldPosition(p).distanceTo(bone.parent.getWorldPosition(start));
     if(!baseLengths.has(key))baseLengths.set(key,length);maximumLengthError=Math.max(maximumLengthError,Math.abs(length-baseLengths.get(key)));
    }
    if(frame%4===0){
     for(const mesh of meshes){mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);const gap=p.y-ground(p.x,p.z);
      if(gap<minimum){minimum=gap;const v=rig.proneContact.skin.find(s=>s.mesh===mesh)?.vertices.find(v=>v.index===i);worst={frame,mesh:mesh.name,index:i,selected:!!v,region:v?.region,point:p.toArray(),weights:[0,1,2,3].map(k=>[mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i,k)].name,mesh.geometry.attributes.skinWeight.getComponent(i,k)])};}
     }}
     frameBones.push(Object.fromEntries(['handL','handR','calfL','calfR','footL','footR'].map(n=>[n,rig.bones[n].getWorldPosition(new T.Vector3()).sub(actor.root.position).toArray()])));
    }
   }
   const range=n=>Math.max(...frameBones.map(b=>b[n][2]))-Math.min(...frameBones.map(b=>b[n][2]));
   const movingId=rig.currentId;
   actor.Update(1/30,{prone:1,moveSpeed:1,moveSpeedMps:1,elapsed:160/30,locomotionTracked:true});
   const stopped={id:rig.currentId,speed:rig.locomotion.speedMps};
   rows.push({name,kind,modelVariant,movingId,minimum,worst,maximumLengthError,maxSupportSlip,maxJointStep,jointSteps,maxGripError,maxGripAlongError,maxWristBend,maxWristRotation,minElbowFlexion,maxElbowFlexion,maxElbowHingeError,maxForearmTwist,invalidElbowFlexion,maxGripSkinDepth,maxThumbGap,maxFingerGap,gripSkinSamples,gripWorst,invalidGripDepth,maxToeRise,minFootAlignment,poseP95Ms:costs.sort((a,b)=>a-b)[Math.floor(costs.length*.95)],travel:Object.fromEntries(['handL','handR','calfL','calfR','footL','footR'].map(n=>[n,range(n)])),stopped});
   actor.Dispose();
  }
  const scene=new T.Scene();scene.background=new T.Color('#bac4ce');scene.add(new T.HemisphereLight(0xffffff,0x57514a,2.5));
  const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(-3,5,-3);scene.add(sun);
  const actors=[];
  for(let i=0;i<3;i++){
   const x=(i-1)*1.4,ground=Object.values(surfaces)[i];
   const geometry=new T.PlaneGeometry(1.35,3.2,28,48);geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position;
   for(let j=0;j<pos.count;j++)pos.setY(j,ground(pos.getX(j),pos.getZ(j))-.004);geometry.computeVertexNormals();
   const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:[0x82765f,0x738265,0x807361][i],side:T.DoubleSide}));mesh.position.x=x;scene.add(mesh);
   const a=f.Create(i===1?'ija':'nra',{seed:1234,modelVariant:i===1?0:1,weapon:i===1?'Type38':'HanYang'});a.root.position.x=x;scene.add(a.root);
   f.groundProbe=(px,z)=>({y:ground(px-x,z),normal:new T.Vector3(-(ground(px-x+.001,z)-ground(px-x-.001,z))/.002,1,-(ground(px-x,z+.001)-ground(px-x,z-.001))/.002).normalize().toArray()});
   for(let k=0;k<90+i*20;k++)a.Update(1/30,{prone:1,moveSpeedMps:.3,moveSpeed:.3/4.2,elapsed:k/30});actors.push(a);
  }
  const camera=new T.PerspectiveCamera(35,1400/900,.01,100);camera.position.set(-3.7,3,-4.8);camera.lookAt(0,.2,0);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1400,900);document.body.replaceChildren(renderer.domElement);renderer.render(scene,camera);
  window.ProneReview={scene,camera,renderer,actors};return rows;
 });
 fs.writeFileSync(path.join(out,'Data_ProneReport.json'),JSON.stringify(report,null,2));
 const behavior=await page.evaluate(async()=>{
  const T=await import('three'),f=window.Taierzhuang.actorFactory;
  const {ActorCrowd}=await import('./Script_ActorCrowd.mjs');
  f.groundProbe=()=>({y:0,normal:[0,1,0]});
  const a=f.Create('nra',{seed:1234,modelVariant:1,weapon:'HanYang'}),rig=a.characterRig;
  let elapsed=0;
  for(let i=0;i<90;i++){
   a.root.rotation.y=Math.sin(i/35)*.45;
   a.root.position.x-=Math.sin(a.root.rotation.y)*.3/30;a.root.position.z-=Math.cos(a.root.rotation.y)*.3/30;
   a.Update(1/30,{prone:1,elapsed:elapsed+=1/30,moveSpeedMps:.3,locomotionTracked:true});
  }
  const moving=rig.currentId;
  a.root.position.x+=100;a.Update(1/30,{prone:1,elapsed:elapsed+=1/30,moveSpeedMps:.3,locomotionTracked:true});
  const teleportReleased=rig.proneContact.limbs.every(l=>!l.supporting);
  rig.ForceClip('AdvanceFire');a.Update(1/30,{prone:1,moveSpeedMps:.3});
  const forced={id:rig.currentId,contact:rig.proneContact.active};rig.ForceClip(null);
  rig.authoredPose={Restore(){},Apply(){}};a.Update(1/30,{prone:1});
  const authoredReleased=!rig.proneContact.active;rig.authoredPose=null;
  for(let i=0;i<90;i++)a.Update(1/30,{crouch:1});
  const crouchReleased=!rig.proneContact.active&&rig.proneContact.saved.length===0;
  for(let i=0;i<60;i++)a.Update(1/30,{});
  const standReleased=!rig.proneContact.active&&rig.proneContact.saved.length===0;a.Dispose();
  const crowd=new ActorCrowd(new T.Scene(),f),frames=[];
  for(let i=0;i<6;i++){
   crowd.Begin();const entry=crowd.Push('nra',new T.Vector3(),0,1,1,false,{stance:2,moveSpeedMps:.3,pronePhase:i/6});
   frames.push({pose:entry.pose,clip:entry.clip,foot:entry.hitboxes.find(h=>h.id==='calfL')?.end?.toArray()});crowd.End();
  }
  crowd.Begin();const stopped=crowd.Push('nra',new T.Vector3(),0,1,1,false,{stance:2,moveSpeedMps:0,pronePhase:.5}).pose;crowd.End();crowd.Dispose();
  return {moving,teleportReleased,forced,authoredReleased,crouchReleased,standReleased,frames,stopped};
 });
 fs.writeFileSync(path.join(out,'Data_ProneBehavior.json'),JSON.stringify(behavior,null,2));
 assert.equal(behavior.moving,'ProneCrawl');assert.ok(behavior.teleportReleased&&behavior.authoredReleased&&behavior.crouchReleased&&behavior.standReleased);
 assert.deepEqual(behavior.forced,{id:'AdvanceFire',contact:false});assert.equal(behavior.stopped,'prone');
 assert.equal(new Set(behavior.frames.map(f=>f.pose)).size,6);assert.ok(behavior.frames.every(f=>f.clip==='ProneCrawl'));
 await page.screenshot({path:path.join(out,'Surfaces.png')});
 const hand=await page.evaluate(async()=>{
  const T=await import('three'),{scene,camera,renderer,actors}=window.ProneReview,a=actors[0];
  actors.slice(1).forEach(a=>a.root.visible=false);
  const hand=a.characterRig.Grip('weaponR').getWorldPosition(new T.Vector3());
  camera.position.copy(hand).add(new T.Vector3(.5,.25,-.25));camera.lookAt(hand);renderer.render(scene,camera);
  return Object.fromEntries(a.characterRig.root.getObjectsByProperty('isBone',true).filter(b=>/R_Finger/.test(b.name)).map(b=>[b.name,a.weaponGroup.worldToLocal(b.getWorldPosition(new T.Vector3())).toArray()]));
 });
 fs.writeFileSync(path.join(out,'Data_GripProbe.json'),JSON.stringify(hand,null,2));
 const finger=suffix=>Object.entries(hand).find(([name])=>name.endsWith(suffix))[1];
 // Opposing digits enclose the wood: a coincident socket alone can pass with
 // an open hand or with all fingers on the same side of the rifle.
 assert.ok(finger('R_Finger01')[0]>.015&&finger('R_Finger21')[0]<-.02,'thumb and inward-facing fingers must oppose across rifle');
 assert.ok(finger('R_Finger2')[1]>.045&&finger('R_Finger22')[1]<.035,'middle finger must wrap from above barrel to lower stock');
 await page.screenshot({path:path.join(out,'Grip.png')});
 await page.evaluate(async()=>{
  const T=await import('three'),{scene,camera,renderer,actors}=window.ProneReview,a=actors[0];
  const foot=a.characterRig.bones.footL.getWorldPosition(new T.Vector3());
  camera.position.copy(foot).add(new T.Vector3(-.6,.25,.6));camera.lookAt(foot);renderer.render(scene,camera);
 });
 await page.screenshot({path:path.join(out,'Feet.png')});
 console.log(JSON.stringify(report,null,2));
 for(const row of report){
  assert.ok(row.minElbowFlexion>10*Math.PI/180&&row.maxElbowFlexion<150*Math.PI/180,`signed elbow flexion ${row.minElbowFlexion*180/Math.PI} .. ${row.maxElbowFlexion*180/Math.PI}`);
  assert.ok(row.maxElbowHingeError<5*Math.PI/180,`elbow off hinge ${row.maxElbowHingeError*180/Math.PI} degrees`);
  assert.ok(row.maxForearmTwist<95*Math.PI/180,`excess forearm twist ${row.maxForearmTwist*180/Math.PI} degrees`);
  assert.ok(row.invalidElbowFlexion<0,'signed hinge check must reject a backwards elbow with unchanged endpoints');
  assert.ok(row.maxJointStep<Math.PI/12,`${row.name}/${row.kind}/${row.modelVariant} joint snap ${row.maxJointStep*180/Math.PI} degrees/frame`);
  assert.ok(row.maxToeRise<-.035&&row.minFootAlignment>.9,`ankle must point down/back with calf: ${row.maxToeRise}/${row.minFootAlignment}`);
  assert.ok(row.maxGripAlongError<.005,`rifle centre carry ${row.maxGripAlongError}`);
  // A 70-degree direction-only limit accepted the visibly broken V2 wrist.
  // Check both centreline bending and the full rotation from the bind wrist,
  // which also catches axial twist that a centreline cannot see.
  assert.ok(row.maxWristBend<30*Math.PI/180,`carry wrist folded ${row.maxWristBend*180/Math.PI} degrees`);
  assert.ok(row.maxWristRotation<30*Math.PI/180,`carry wrist twisted ${row.maxWristRotation*180/Math.PI} degrees`);
  assert.ok(row.gripSkinSamples>1000&&row.maxGripSkinDepth<.003,`${row.name}/${row.kind}/${row.modelVariant} hand skin inside rifle ${row.maxGripSkinDepth} m`);
  assert.ok(row.invalidGripDepth>.005,'mesh probe must reject a deliberately intersecting hand');
  assert.ok(row.maxThumbGap<.008&&row.maxFingerGap<.008,`${row.name}/${row.kind}/${row.modelVariant} loose grip ${row.maxThumbGap}/${row.maxFingerGap} m`);
 }
 for(const row of report){assert.equal(row.movingId,'ProneCrawl');assert.equal(row.stopped.id,'StandFireCrouch');assert.equal(row.stopped.speed,0);assert.ok(row.maximumLengthError<.0001);assert.ok(row.maxSupportSlip<.025,`support slip ${row.maxSupportSlip}`);assert.ok(row.minimum>-.015,`${row.name}/${row.kind}/${row.modelVariant} penetration ${row.minimum}`);for(const range of Object.values(row.travel))assert.ok(range>.035);}
 assert.deepEqual(errors,[]);console.log('ProneCrawlTest: PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
