// Independent GLB reimport: no contact fitter is loaded in this browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
const args=process.argv.slice(2),Arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=Arg('--root'),group=Arg('--group','FirstLevelCarryV11'),fitGroup=Arg('--fit-group','FirstLevelCarryFitV6');assert.ok(root);
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),folder=path.join(root,'Models',group),out=path.join(project,'_shots',group);
const report=JSON.parse(await fs.readFile(path.join(root,'Models',fitGroup,'Data_ProductionFit.json'),'utf8'));
const Hash=b=>createHash('sha256').update(b).digest('hex');await fs.mkdir(out,{recursive:true});
for(const record of report.results){const bytes=await fs.readFile(path.join(folder,record.export.file));assert.equal(Hash(bytes),record.export.sha256);await fs.writeFile(path.join(out,record.export.file),bytes);}
await fs.writeFile(path.join(out,'_check_Verify.html'),`<!doctype html><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script><script type="module">
import * as T from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';import {LugouCharacterRig} from '../../Script_CharacterModel.mjs';window.CarryCheck={T,loader:new GLTFLoader(),LugouCharacterRig};</script>`);
const manifest=JSON.parse(await fs.readFile(path.join(project,'Model/Character/Data_LugouCharacterManifest.json'),'utf8'));
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser(),errors=[],results=[],failures=[];
try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/${group}/_check_Verify.html`);await page.waitForFunction(()=>window.CarryCheck);
  for(const model of report.results){
    const record=report.records.find(r=>r.id===model.id),assetRecord=manifest.models.find(m=>m.id===model.id);
    const actual=await page.evaluate(async({model,record,assetRecord,bearerOffsetM})=>{
      const {T,loader,LugouCharacterRig}=CarryCheck,V=()=>new T.Vector3();
      const [gltf,library]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+model.id+'.glb'),loader.loadAsync('./'+model.export.file)]);const profiles=[];
      for(const expected of model.profiles){
        const end=expected.role==='Front'?1:-1,actor={root:new T.Group(),body:new T.Group()};actor.root.scale.setScalar(expected.size);actor.body.position.y=.85;actor.root.add(actor.body);actor.root.position.z=-end*bearerOffsetM;
        const rig=new LugouCharacterRig({record:assetRecord,gltf},{kind:'nra',targetHeight:1.66,seed:'IndependentCarry',variantIndex:0});rig.Attach(actor);rig.mixer.stopAllAction();
        const clip=library.animations.find(c=>c.name===`FirstLevelCarry${expected.role}Walk${Math.round(expected.size*100)}`);if(!clip)throw Error('Missing exported profile');
        const action=rig.mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
        const meshes=[],bones=[];rig.root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);if(n.isBone)bones.push(n)});
        const bind=JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements))),parents=bones.map(b=>b.parent),probes={L:[],R:[]};
        for(const mesh of meshes){const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
          for(let vertex=0;vertex<indices.count;vertex++)for(const side of ['L','R']){let weight=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[indices.getComponent(vertex,k)].name.replaceAll('_',' ');if(name.includes(' '+side+' ')&&/Foot|Toe/.test(name))weight+=weights.getComponent(vertex,k);}if(weight>.5)probes[side].push({mesh,vertex});}
        }
        let maxPositionError=0,maxSoleError=0,minSole=Infinity,maxPalmError=0,seam=0,first=null,maxStanceDrift=0,firstLengths=null,maxLengthDelta=0,maxPelvisSpeed=0,lastPelvis=null;
        const contacts={};
        // Include half-frame interpolation; baking knots alone cannot expose
        // quaternion-interpolation contact failures.
        for(let sample=0;sample<=240;sample++){
          const time=sample/120;action.enabled=true;action.paused=false;rig.mixer.setTime(time);actor.root.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();
          const matrices=bones.flatMap(b=>b.matrixWorld.elements);if(sample===0)first=matrices;if(sample===240)seam=Math.max(...matrices.map((v,i)=>Math.abs(v-first[i])));
          const pelvis=rig.bones.pelvis.getWorldPosition(V());if(lastPelvis)maxPelvisSpeed=Math.max(maxPelvisSpeed,pelvis.distanceTo(lastPelvis)*120);lastPelvis=pelvis;
          if(sample%2===0)maxPositionError=Math.max(maxPositionError,pelvis.distanceTo(new T.Vector3(...expected.frames[sample/2].pelvis)));
          const lengths=[];
          for(const side of ['L','R']){
            let floor=Infinity;for(const p of probes[side])floor=Math.min(floor,p.mesh.getVertexPosition(p.vertex,V()).applyMatrix4(p.mesh.matrixWorld).y);minSole=Math.min(minSole,floor);
            const wrist=rig.bones['hand'+side].getWorldPosition(V()),ankle=rig.bones['foot'+side].getWorldPosition(V()),cfg=record.palms[expected.role][side];
            const palm=rig.bones['hand'+side].localToWorld(new T.Vector3(...cfg.point));maxPalmError=Math.max(maxPalmError,palm.distanceTo(new T.Vector3(cfg.sign*.29,.88,-end)));
            if(sample%2===0){const f=expected.frames[sample/2];maxPositionError=Math.max(maxPositionError,wrist.distanceTo(new T.Vector3(...f.hands[side].wrist)),ankle.distanceTo(new T.Vector3(...f.feet[side].ankle)));maxSoleError=Math.max(maxSoleError,Math.abs(floor-f.feet[side].minY));}
            const phase=((time-(side==='L'?.3:1.3))%2+2)%2;
            if(phase<1.2-1e-8){const world=ankle.clone();world.z-=.55*time;if(contacts[side])maxStanceDrift=Math.max(maxStanceDrift,world.distanceTo(contacts[side]));else contacts[side]=world;}else contacts[side]=null;
            for(const [a,b] of [['upperArm','forearm'],['forearm','hand'],['thigh','calf'],['calf','foot']])lengths.push(rig.bones[a+side].getWorldPosition(V()).distanceTo(rig.bones[b+side].getWorldPosition(V())));
          }
          firstLengths??=lengths;maxLengthDelta=Math.max(maxLengthDelta,...lengths.map((v,i)=>Math.abs(v-firstLengths[i])));
        }
        profiles.push({size:expected.size,role:expected.role,samples:241,minSole,maxPalmError,maxPositionError,maxSoleError,seam,maxStanceDrift,maxLengthDelta,maxPelvisSpeed,bindingUnchanged:bind===JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)))&&bones.every((b,i)=>b.parent===parents[i])});
      }
      return {id:model.id,profiles};
    },{model,record,assetRecord,bearerOffsetM:report.bearerOffsetM});
    results.push(actual);
    for(const p of actual.profiles)if(!(p.bindingUnchanged&&p.maxPositionError<.00005&&p.maxSoleError<.00005&&p.minSole>=.001&&p.maxPalmError<.001&&p.seam<.001&&p.maxStanceDrift<.001&&p.maxLengthDelta<.0001&&p.maxPelvisSpeed<1.6))failures.push({id:actual.id,...p});
    console.log(JSON.stringify(actual));
  }
  const file=path.join(folder,'Data_IndependentValidation.json');assert.equal(await fs.stat(file).then(()=>true,()=>false),false,'Preserve the previous validation');
  await fs.writeFile(file,JSON.stringify({status:failures.length||errors.length?'requires_correction':'export_matches_trial_requires_visual_acceptance',fitReport:fitGroup+'/Data_ProductionFit.json',results,failures,errors},null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
