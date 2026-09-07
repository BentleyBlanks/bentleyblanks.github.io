// Independently sample the exported support profiles on actual production skin.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(project),args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(root);
const group=args.includes('--group')?args[args.indexOf('--group')+1]:'FirstLevelTrainSupportV1';
assert.match(group,/^FirstLevelTrainSupportV[1-9]\d*$/);
const output=path.join(project,'_shots',group);await fs.mkdir(output,{recursive:true});
for(let n=1;n<=4;n++)await fs.copyFile(path.join(root,`Models/${group}/Animation_LugouNra0${n}FirstLevelTrainSupport.glb`),path.join(output,`Animation_LugouNra0${n}FirstLevelTrainSupport.glb`));
await fs.writeFile(path.join(output,'_check_Train.html'),`<!doctype html><html><head><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script></head><body style="margin:0"><script type="module">
import * as THREE from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
window.TrainSupport={THREE,loader:new GLTFLoader()};</script></body></html>`);
const bake=JSON.parse(await fs.readFile(path.join(root,`Models/${group}/Data_SupportBakeValidation.json`),'utf8'));
const server=await ServeRoot(repo,0),browser=await LaunchBrowser(),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/${group}/_check_Train.html`);await page.waitForFunction(()=>window.TrainSupport);
 for(const model of bake.results){
  const exported=await fs.readFile(path.join(output,`Animation_${model.id}FirstLevelTrainSupport.glb`));
  assert.equal(createHash('sha256').update(exported).digest('hex'),model.animationSha256,'Verify exactly the recorded export');
  const data=await page.evaluate(async model=>{
   const {THREE:T,loader}=TrainSupport,V=T.Vector3;
   const [gltf,library]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+model.id+'.glb'),loader.loadAsync('./Animation_'+model.id+'FirstLevelTrainSupport.glb')]);
   const rig=gltf.scene,bones=[],meshes=[];rig.traverse(o=>{if(o.isBone)bones.push(o);if(o.isSkinnedMesh)meshes.push(o)});
   // Same external-character PBR constraints as CharacterModel's material bridge.
   for(const mesh of meshes)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){m.metalness=0;m.roughness=Math.max(.58,m.roughness)}
   const Find=p=>bones.find(b=>b.name.replaceAll('_',' ').endsWith(' '+p)),Pt=p=>Find(p).getWorldPosition(new V());
   const bind=JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements))),parents=bones.map(b=>b.parent);
   const prepared=meshes.map(mesh=>{
    const g=mesh.geometry,flags=[],triangles={L:[],R:[]};
    for(let i=0;i<g.attributes.position.count;i++){
     const weights={};for(let j=0;j<4;j++){const n=mesh.skeleton.bones[g.attributes.skinIndex.getComponent(i,j)]?.name.replaceAll('_',' ')||'';weights[n]=(weights[n]||0)+g.attributes.skinWeight.getComponent(i,j)}
     const Sum=pattern=>Object.entries(weights).reduce((s,[n,w])=>s+(pattern.test(n)?w:0),0);
     flags.push({foot:['L','R'].find(s=>Sum(new RegExp(' '+s+' (Foot|Toe0)$'))>.65),hand:['L','R'].find(s=>Sum(new RegExp(' '+s+' (Hand|Finger)'))>.8),thigh:['L','R'].find(s=>Sum(new RegExp(' '+s+' Thigh$'))>.65)});
    }
    const index=g.index?.array||Array.from({length:flags.length},(_,i)=>i);
    for(let i=0;i<index.length;i+=3){const tri=Array.from(index.slice(i,i+3));for(const s of ['L','R'])if(tri.every(j=>flags[j].thigh===s))triangles[s].push(tri)}
    return {mesh,flags,triangles};
   });
   const mixer=new T.AnimationMixer(rig),profiles=[];let active=[];
   function Sample(size,seconds){
    mixer.stopAllAction();const knots=[.96,.98,1,1.02,1.04],hi=knots.find(k=>k>size)||1.04,lo=knots[knots.indexOf(hi)-1],w=(size-lo)/(hi-lo);
    active=[lo,hi].map((s,i)=>{const a=mixer.clipAction(library.animations.find(c=>c.name==='FirstLevelTrainBench'+Math.round(s*100)));a.reset().setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.setEffectiveWeight(i?w:1-w);a.play();a.time=seconds;a.paused=true;return a});mixer.update(0);rig.updateMatrixWorld(true);
   }
   rig.rotation.y=Math.PI;
   for(const sizeScale of [.96,.97,.98,.99,1,1.01,1.02,1.03,1.04]){
    rig.scale.setScalar(model.nominalScale*sizeScale);let minSole=Infinity,maxSole=-Infinity,penetrating=0,footDrift=0,lengthError=0,minPalmGap=Infinity,maxPalmGap=-Infinity,maxPelvisSpeed=0,previousPelvis=null;
    const feet={},lengths={},samples=[],palmAxes={};
    for(let frame=0;frame<=956;frame++){
     const seconds=frame/120,checkPalms=frame%12===0&&seconds<=5.2;Sample(sizeScale,seconds);const soles={L:Infinity,R:Infinity},hands={L:[],R:[]},triangles={L:[],R:[]};let count=0;
     const pelvis=Pt('Pelvis');if(previousPelvis)maxPelvisSpeed=Math.max(maxPelvisSpeed,pelvis.distanceTo(previousPelvis)*120);previousPelvis=pelvis;
     if(frame===0)for(const side of ['L','R'])palmAxes[side]=new V(0,1,0).applyQuaternion(Find(side+' Thigh').getWorldQuaternion(new T.Quaternion()).invert());
     for(const {mesh,flags,triangles:indices} of prepared){
      const points=[];
      for(let i=0;i<flags.length;i++){
       const p=mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld);points.push(p);
       if(flags[i].foot)soles[flags[i].foot]=Math.min(soles[flags[i].foot],p.y);
       if(Math.abs(p.x)<.6&&p.z>model.seatForwardOffsetM-.34&&p.z<model.seatForwardOffsetM+.34&&p.y>.34&&p.y<.48)count++;
       if(checkPalms&&flags[i].hand)hands[flags[i].hand].push(p);
      }
      if(checkPalms)for(const s of ['L','R'])triangles[s].push(...indices[s].map(t=>new T.Triangle(...t.map(i=>points[i]))));
     }
     minSole=Math.min(minSole,soles.L,soles.R);maxSole=Math.max(maxSole,soles.L,soles.R);penetrating=Math.max(penetrating,count);
     for(const s of ['L','R']){
      const p=Pt(s+' Foot');feet[s]??=p.clone();footDrift=Math.max(footDrift,p.distanceTo(feet[s]));
      for(const [a,b] of [['Thigh','Calf'],['Calf','Foot']]){const key=s+a,length=Pt(s+' '+a).distanceTo(Pt(s+' '+b));lengths[key]??=length;lengthError=Math.max(lengthError,Math.abs(length-lengths[key]))}
     }
     const gaps={};
     if(checkPalms)for(const side of ['L','R']){
      let minimum=Infinity;const hit=new V(),axis=palmAxes[side].clone().applyQuaternion(Find(side+' Thigh').getWorldQuaternion(new T.Quaternion()));
      // Independent ray/triangle implementation checks the upper surface that
      // actually supports the palm, including triangles at garment seams.
      for(const p of hands[side]){let top=-Infinity;const ray=new T.Ray(p.clone().addScaledVector(axis,.3),axis.clone().negate());
       for(const tri of triangles[side])if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,hit))top=Math.max(top,hit.dot(axis));
       if(Number.isFinite(top))minimum=Math.min(minimum,p.dot(axis)-top);
      }
      gaps[side]=minimum;minPalmGap=Math.min(minPalmGap,minimum);maxPalmGap=Math.max(maxPalmGap,minimum);
     }
     if(checkPalms||frame%60===0||frame===956)samples.push({sourceSeconds:seconds,soles,seatPenetratingVertices:count,palmGaps:gaps,pelvis:Pt('Pelvis').toArray()});
    }
    profiles.push({sizeScale,minSole,maxSole,penetrating,footDrift,lengthError,minPalmGap,maxPalmGap,maxPelvisSpeed,frames:957,samples});
   }
   const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1400,1000);renderer.setClearColor(0x263237);document.body.replaceChildren(renderer.domElement);
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1.4,.01,50);scene.add(new T.HemisphereLight(0xffffff,0x555555,2.5));const key=new T.DirectionalLight(0xffffff,3);key.position.set(-3,5,4);scene.add(key);scene.add(new T.GridHelper(12,24));scene.add(rig);
   const seat=new T.Mesh(new T.BoxGeometry(1.2,.14,.68),new T.MeshStandardMaterial({color:0x7e582e}));seat.position.set(0,.41,model.seatForwardOffsetM);scene.add(seat);
   for(const x of [-.5,.5])for(const z of [-.27,.27]){const leg=new T.Mesh(new T.BoxGeometry(.07,.34,.07),seat.material);leg.position.set(x,.17,z+model.seatForwardOffsetM);scene.add(leg)}
   TrainSupport.Capture=(seconds,view='side')=>{rig.scale.setScalar(model.nominalScale);Sample(1,seconds);camera.position.set(view==='side'?3:1.2,view==='hands'?1.25:1.45,view==='side'?0:view==='hands'?-1.1:-3.2);camera.lookAt(0,view==='hands'?.68:.8,view==='hands'?-.12:0);renderer.render(scene,camera)};
   TrainSupport.Dispose=()=>renderer.dispose();TrainSupport.Capture(0);
   return {id:model.id,animationSha256:model.animationSha256,bones:bones.length,bindingPreserved:bind===JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)))&&bones.every((b,i)=>b.parent===parents[i]),profiles};
  },model);
  results.push(data);
  for(const time of [0,5.25,7.966]){await page.evaluate(t=>TrainSupport.Capture(t),time);await page.screenshot({path:path.join(output,`Texture_${model.id}_${Math.round(time*1000)}.png`)})}
  for(const time of [0,4.5,5.2,5.5,5.7]){await page.evaluate(t=>TrainSupport.Capture(t,'hands'),time);await page.screenshot({path:path.join(output,`Texture_${model.id}_Hands_${Math.round(time*1000)}.png`)})}
  await page.evaluate(()=>TrainSupport.Dispose());
 }
 const failures=[];
 for(const result of results){
  if(!result.bindingPreserved)failures.push(`${result.id}: original bind/hierarchy`);
  for(const p of result.profiles){const id=`${result.id}/${p.sizeScale}`;
   if(p.penetrating!==0)failures.push(`${id}: ${p.penetrating} bench-intersecting vertices`);
   if(!(p.minSole>.0015&&p.maxSole<.003))failures.push(`${id}: sole height ${p.minSole}..${p.maxSole}`);
   if(!(p.footDrift<.0005&&p.lengthError<.0005))failures.push(`${id}: foot drift ${p.footDrift}, length error ${p.lengthError}`);
   if(!(p.minPalmGap>.0003&&p.maxPalmGap<.002))failures.push(`${id}: palm support ${p.minPalmGap}..${p.maxPalmGap}`);
  }
 }
 const report={status:failures.length||errors.length?'needs_correction':'numeric_checks_passed_pending_visual_and_runtime_review',runtimeEnabled:false,results,errors,failures};
 await fs.writeFile(path.join(output,'Data_ProductionSkinValidation.json'),JSON.stringify(report,null,2));
 await fs.copyFile(path.join(output,'Data_ProductionSkinValidation.json'),path.join(root,`Models/${group}/Data_ProductionSkinValidation.json`));
 assert.deepEqual(errors,[]);
 assert.deepEqual(failures,[],'Actual production skin at nine heights and 120 fps');
 console.log(JSON.stringify(results.map(r=>({...r,profiles:r.profiles.map(({samples,...p})=>p)}))));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
