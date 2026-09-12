// Original selected character skins, all authored opening clips, live runtime
// sampling, floor support, wall reach, restore fidelity and local -Z facing.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ServeRoot} from './Script_DevServer.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {OPENING} from './Data_FirstLevelOpening.mjs';
const project=path.dirname(fileURLToPath(import.meta.url)),out=path.join(project,'_shots','CarriageAnimation');
const folder=path.join(project,'Animation','FirstLevelCarriage'),config=JSON.parse(await fs.readFile(path.join(folder,'Data_FirstLevelCarriageAnimation.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(project,'Model','Character','Data_LugouCharacterManifest.json'),'utf8'));
assert.deepEqual(config.actorForward,[0,0,-1]);assert.equal(config.authoringTool,'BlenderMCP');assert.equal(config.models.length,2);
assert.equal(config.clips.LuoStaggerRecover.duration,OPENING.luoRecoverySeconds);
assert.equal(config.clips.LuoHelpUp.duration,OPENING.rescueSeconds);
assert.equal(config.models.reduce((n,m)=>n+m.clipIds.length,0),13);
for(const model of config.models){
 const bytes=await fs.readFile(path.join(folder,model.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
 const original=await fs.readFile(path.join(project,'Model','Character','Model_'+model.id+'.glb'));
 assert.equal(createHash('sha256').update(original).digest('hex'),model.originalModelSha256);
 const data=JSON.parse(bytes);assert.equal(data.modelId,model.id);assert.match(data.authoringTool,/BlenderMCP/);
 for(const id of model.clipIds){const clip=data.clips[id];assert.equal(clip.values.length,clip.frameCount*data.bones.length*7);assert.ok(clip.values.every(Number.isFinite));assert.equal(clip.duration,config.clips[id].duration);}
}
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'_check_CarriageAnimation.html'),`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#202327;color:#eee;font:16px system-ui}#review{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px}.card{background:#30353a}.card img{width:100%;display:block}.card p{margin:7px 10px}</style><div id="review"></div><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script><script type="module">
import * as T from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {LugouCharacterRig} from '../../Script_CharacterModel.mjs';import {FirstLevelCarriageAnimation} from '../../Script_FirstLevelCarriageAnimation.mjs';
window.CarriageCheck={T,loader:new GLTFLoader(),LugouCharacterRig,FirstLevelCarriageAnimation};</script>`);
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser(),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/Taierzhuang1938/_shots/CarriageAnimation/_check_CarriageAnimation.html');await page.waitForFunction(()=>window.CarriageCheck);
 for(const record of config.models){
  const result=await page.evaluate(async({record,config,assetRecord})=>{
   const {T,loader,LugouCharacterRig,FirstLevelCarriageAnimation}=CarriageCheck;
   const [gltf,data]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+record.id+'.glb'),fetch('../../Animation/FirstLevelCarriage/'+record.file).then(r=>r.json())]);
   const actor={root:new T.Group(),body:new T.Group()};actor.body.position.y=.85;actor.root.add(actor.body);
   const rig=new LugouCharacterRig({record:assetRecord,gltf},{kind:'nra',targetHeight:1.66,seed:'CarriageAnimation',variantIndex:record.id.endsWith('05')?4:1});rig.Attach(actor);
   const soldier={actor:{root:actor.root,characterRig:rig},position:new T.Vector3(),missionTrainLife:{deckY:0}};
   const sampler=new FirstLevelCarriageAnimation(soldier,data,config),nodes=sampler.bones;
   const point=node=>node.getWorldPosition(new T.Vector3());
   const restSnapshot=()=>nodes.flatMap(n=>[...n.position,...n.quaternion,...n.scale]);
   const scene=new T.Scene();scene.background=new T.Color(0x30353a);scene.add(actor.root);
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(340,390);renderer.outputColorSpace=T.SRGBColorSpace;
   const camera=new T.PerspectiveCamera(35,340/390,.01,20);camera.position.set(-2.3,1.65,-3.4);camera.lookAt(0,.83,0);
   scene.add(new T.HemisphereLight(0xe6edff,0x554737,2));const key=new T.DirectionalLight(0xffe4c6,3);key.position.set(-3,5,-4);scene.add(key);
   const floor=new T.Mesh(new T.BoxGeometry(3,.04,2),new T.MeshStandardMaterial({color:0x44494a,roughness:1}));floor.position.y=-.02;scene.add(floor);
   const wall=new T.Mesh(new T.BoxGeometry(3,1.35,.08),new T.MeshStandardMaterial({color:0x584533,roughness:1}));wall.position.set(0,.675,.29);scene.add(wall);
   rig.root.traverse(n=>{if(n.isMesh){for(const m of Array.isArray(n.material)?n.material:[n.material]){m.metalness=0;m.roughness=.78;}if(!n.isSkinnedMesh)n.visible=false;}});
   const clips=[];let maxRestoreError=0,maxRootDrift=0,minSole=Infinity,maxSole=-Infinity,maxWallBack=-Infinity;
   const originalRoot=actor.root.matrixWorld.clone();
   const Bounds=()=>{let min=new T.Vector3(Infinity,Infinity,Infinity),max=new T.Vector3(-Infinity,-Infinity,-Infinity);const v=new T.Vector3();rig.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);min.min(v);max.max(v)}});return {min:min.toArray(),max:max.toArray()};};
   for(const id of record.clipIds){
    const clip=data.clips[id],times=[0,.17,clip.duration*.33,clip.duration*.66,clip.duration];
    if(id==='LuoStaggerRecover')times.push(1.45,1.85,4.35);
    if(id==='LuoHelpUp')times.push(1.25,2.1,3.55);
    const samples=[];let firstQ,lastQ,maxMotion=0;
    for(const time of times){
     sampler.Restore();rig.Update(0,{reach:1});actor.root.updateWorldMatrix(true,true);
     const baseline=restSnapshot();sampler.Sample(id,time,{loop:false,deckY:0,transitionSeconds:0});
     const pose=restSnapshot();firstQ ||= pose;lastQ=pose;for(let i=0;i<pose.length;i++)maxMotion=Math.max(maxMotion,Math.abs(pose[i]-firstQ[i]));
     const sole=sampler.FootFloor(),head=point(rig.bones.head).y,pelvis=point(rig.bones.pelvis).y,bounds=Bounds();
     minSole=Math.min(minSole,sole);maxSole=Math.max(maxSole,sole);
     if(/^Wall/.test(id))maxWallBack=Math.max(maxWallBack,bounds.max[2]);
     const toe=nodes.find(n=>/L_Toe0$/.test(n.name)),foot=rig.bones.footL;
     const front=toe?point(toe).sub(point(foot)).normalize().toArray():null;
     samples.push({time,head,pelvis,sole,bounds,front,handR:point(rig.bones.handR).toArray(),handL:point(rig.bones.handL).toArray()});
     const matrix=actor.root.matrixWorld.elements;for(let i=0;i<16;i++)maxRootDrift=Math.max(maxRootDrift,Math.abs(matrix[i]-originalRoot.elements[i]));
     sampler.Restore();const restored=restSnapshot();for(let i=0;i<baseline.length;i++)maxRestoreError=Math.max(maxRestoreError,Math.abs(restored[i]-baseline[i]));
    }
    const proofTimes=id==='LuoStaggerRecover'?[0,1.45,1.85,4.35]:id==='LuoHelpUp'?[1.3,3.1]:[clip.duration*.33];
    for(const time of proofTimes){
     sampler.Restore();sampler.Sample(id,time,{loop:false,deckY:0,transitionSeconds:0});renderer.render(scene,camera);
     const card=document.createElement('div');card.className='card';const img=document.createElement('img');img.src=renderer.domElement.toDataURL('image/png');card.append(img);
     const caption=document.createElement('p');caption.textContent=record.id+' '+id+' '+time.toFixed(2)+'s';card.append(caption);document.querySelector('#review').append(card);
    }
    clips.push({id,duration:clip.duration,loop:clip.loop,maxMotion,samples});
   }
   const release=[];
   for(const weight of [.8,.5,.2,.01]){
    sampler.Restore();rig.Update(0,{reach:1});sampler.Sample('WallCrouchIdle',1.3,{weight,loop:false,deckY:0,transitionSeconds:0});
    release.push({weight,sole:sampler.FootFloor(),bounds:Bounds()});
   }
   sampler.Restore();renderer.dispose();return {modelId:record.id,maxRestoreError,maxRootDrift,minSole,maxSole,maxWallBack,clips,release};
  },{record,config,assetRecord:manifest.models.find(m=>m.id===record.id)});
  results.push(result);
  await fs.writeFile(path.join(out,'Data_CarriageAnimationValidation.json'),JSON.stringify({config:config.version,results,errors},null,2));
  await page.screenshot({path:path.join(out,'Texture_CarriageAnimationReview.png'),fullPage:true});
  console.log(JSON.stringify({id:result.modelId,minSole:result.minSole,maxSole:result.maxSole,maxWallBack:result.maxWallBack,first:result.clips[0].samples[0]}));
  assert.ok(result.maxRestoreError<1e-12,record.id+' Restore drift');assert.equal(result.maxRootDrift,0,record.id+' actor root drift');
  assert.ok(result.minSole>.0029&&result.maxSole<.0031,record.id+' actual skinned floor');
  assert.ok(result.maxWallBack>.19&&result.maxWallBack<.28,record.id+' wall contact band');
  for(const sample of result.release)assert.ok(sample.sole>=.0029&&sample.bounds.min[1]>-.025,record.id+' weighted release support '+sample.weight);
  for(const clip of result.clips){
   assert.ok(clip.maxMotion>.001,record.id+' '+clip.id+' is a moving clip');
   for(const sample of clip.samples){assert.ok(sample.head>.55&&sample.head<1.6,record.id+' '+clip.id+' head bound');assert.ok(sample.bounds.min[1]>-.025,record.id+' '+clip.id+' whole skin floor');assert.ok(sample.bounds.max[0]-sample.bounds.min[0]<1.2&&sample.bounds.max[2]-sample.bounds.min[2]<1.2,record.id+' '+clip.id+' original bone-frame conversion');if(sample.front)assert.ok(sample.front[2]<-.65,record.id+' facing -Z');}
  }
  const stand=result.clips.find(c=>c.id==='WallStandIdle').samples[0],crouch=result.clips.find(c=>c.id==='WallCrouchIdle').samples[0];assert.ok(stand.head-crouch.head>.35,'visible crouch height');
  if(record.id.endsWith('05')){const recovery=result.clips.find(c=>c.id==='LuoStaggerRecover');const at=t=>recovery.samples.find(s=>s.time===t);assert.ok(at(1.45).pelvis-at(1.85).pelvis>.15,'failed first stand');assert.ok(at(4.35).head>1.35,'stable before help');}
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'Texture_CarriageAnimationReview.png'),fullPage:true});
 await fs.writeFile(path.join(out,'Data_CarriageAnimationValidation.json'),JSON.stringify({config:config.version,results,errors},null,2));
 console.log(JSON.stringify({ok:true,models:results.map(r=>({id:r.modelId,clips:r.clips.length,minSole:r.minSole,maxSole:r.maxSole,maxRestoreError:r.maxRestoreError,maxWallBack:r.maxWallBack})),proof:path.join(out,'Texture_CarriageAnimationReview.png')}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
