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
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.actorFactory,null,{timeout:240000});
 console.log('ProneCrawlTest: production factory ready');
 const report=await page.evaluate(async()=>{
  const T=await import('three'),g=window.Taierzhuang,f=g.actorFactory;f.SetBatcher(null);g.state.running=false;
  const {CHARACTER_MODEL_VARIANTS_BY_KIND}=await import('./Data_CharacterSelection.mjs');
  const surfaces={flat:()=>0,slope:(x,z)=>.16*x-.20*z,uneven:(x,z)=>.12*x-.12*z+.08*Math.exp(-((x+.3)**2+(z+.3)**2)/.1),downhill:(x,z)=>-.16*x+.20*z};
  const rows=[];let preview;
  for(const [name,ground] of Object.entries(surfaces))for(const kind of ['nra','ija'])for(const modelVariant of CHARACTER_MODEL_VARIANTS_BY_KIND[kind]) {
   const actor=f.Create(kind,{seed:1234,modelVariant,weapon:kind==='ija'?'Type38':'HanYang'}),rig=actor.characterRig;
   const meshes=[];rig.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
   f.groundProbe=(x,z)=>({y:ground(x,z),normal:new T.Vector3(-(ground(x+.001,z)-ground(x-.001,z))/.002,1,-(ground(x,z+.001)-ground(x,z-.001))/.002).normalize().toArray()});
   let minimum=Infinity,maximumLengthError=0,maxSupportSlip=0,worst=null;const costs=[];const baseLengths=new Map(),start=new T.Vector3(),p=new T.Vector3();
   const frameBones=[];
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
   rows.push({name,kind,modelVariant,movingId,minimum,worst,maximumLengthError,maxSupportSlip,poseP95Ms:costs.sort((a,b)=>a-b)[Math.floor(costs.length*.95)],travel:Object.fromEntries(['handL','handR','calfL','calfR','footL','footR'].map(n=>[n,range(n)])),stopped});
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
   f.groundProbe=(px,z)=>({y:ground(px-x,z),normal:[0,1,0]});
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
 console.log(JSON.stringify(report,null,2));
 for(const row of report){assert.equal(row.movingId,'ProneCrawl');assert.equal(row.stopped.id,'StandFireCrouch');assert.equal(row.stopped.speed,0);assert.ok(row.maximumLengthError<.0001);assert.ok(row.maxSupportSlip<.025,`support slip ${row.maxSupportSlip}`);assert.ok(row.minimum>-.015,`${row.name}/${row.kind}/${row.modelVariant} penetration ${row.minimum}`);for(const range of Object.values(row.travel))assert.ok(range>.035);}
 assert.deepEqual(errors,[]);console.log('ProneCrawlTest: PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
