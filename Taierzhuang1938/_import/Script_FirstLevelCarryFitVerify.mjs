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
const reportName=Arg('--report-name','Data_IndependentValidation.json');assert.match(reportName,/^Data_[A-Za-z0-9]+\.json$/);
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
    const actual=await page.evaluate(async({model,record,assetRecord,bearerOffsetM,gripHeightM,referenceSpeedMps})=>{
      const {T,loader,LugouCharacterRig}=CarryCheck,V=()=>new T.Vector3();
      const [gltf,library]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+model.id+'.glb'),loader.loadAsync('./'+model.export.file)]);const profiles=[];
      gltf.scene.traverse(mesh=>{if(mesh.isSkinnedMesh){const a=gltf.parser.associations.get(mesh);if(a?.meshes!=null&&a?.primitives!=null)mesh.userData.sourcePrimitive={meshIndex:a.meshes,primitiveIndex:a.primitives};}});
      for(const expected of model.profiles){
        const end=expected.role==='Front'?1:-1,actor={root:new T.Group(),body:new T.Group()};actor.root.scale.setScalar(expected.size);actor.body.position.y=.85;actor.root.add(actor.body);actor.root.position.z=-end*bearerOffsetM;
        const rig=new LugouCharacterRig({record:assetRecord,gltf},{kind:'nra',targetHeight:1.66,seed:'IndependentCarry',variantIndex:0});rig.Attach(actor);rig.mixer.stopAllAction();
        const clip=library.animations.find(c=>c.name===`FirstLevelCarry${expected.role}Walk${Math.round(expected.size*100)}`);if(!clip)throw Error('Missing exported profile');
        const action=rig.mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
        const meshes=[],bones=[];rig.root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);if(n.isBone)bones.push(n)});
        const bind=JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements))),parents=bones.map(b=>b.parent),probes={L:[],R:[]};
        const fingerOffsets=bones.filter(b=>/Finger/.test(b.name)).map(b=>({bone:b,position:b.position.clone()}));
        for(const mesh of meshes){const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
          for(let vertex=0;vertex<indices.count;vertex++)for(const side of ['L','R']){let weight=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[indices.getComponent(vertex,k)].name.replaceAll('_',' ');if(name.includes(' '+side+' ')&&/Foot|Toe/.test(name))weight+=weights.getComponent(vertex,k);}if(weight>.5)probes[side].push({mesh,vertex});}
        }
        const soleMarkers={};
        const handForward={};
        for(const side of ['L','R']){
          const skeleton=meshes.find(m=>m.skeleton.bones.includes(rig.bones['hand'+side])).skeleton;
          const handIndex=skeleton.bones.indexOf(rig.bones['hand'+side]),forward=V();
          for(let i=1;i<=4;i++){
            const fingerIndex=skeleton.bones.findIndex(b=>b.name.replaceAll('_',' ')==='Bip002 '+side+' Finger'+i);
            if(fingerIndex<0)throw Error('Original bind metacarpal missing');
            forward.add(V().setFromMatrixPosition(skeleton.boneInverses[fingerIndex].clone().invert()).applyMatrix4(skeleton.boneInverses[handIndex]));
          }
          handForward[side]=forward.normalize();
        }
        if(record.footCalibration)for(const side of ['L','R']){
          soleMarkers[side]={};
          for(const key of ['heel','toe']){
            const source=record.footCalibration[side].sole[key],mesh=meshes.find(m=>m.userData.sourcePrimitive?.meshIndex===source.meshIndex&&m.userData.sourcePrimitive?.primitiveIndex===source.primitiveIndex);
            if(!mesh||source.vertex>=mesh.geometry.attributes.position.count)throw Error('Missing independently loaded original sole marker '+side+'/'+key);
            soleMarkers[side][key]={mesh,vertex:source.vertex};
          }
        }
        let maxPositionError=0,maxSoleError=0,minSole=Infinity,maxPalmError=0,seam=0,first=null,maxStanceDrift=0,firstLengths=null,maxLengthDelta=0,maxPelvisSpeed=0,lastPelvis=null;
        const contacts={},contactWindows=[],markerMode=record.footCalibration?'original_skin_heel_flat_toe':'legacy_fixed_ankle';
        const wristBends=[],upperArmTilts=[],forwardLeans=[],lastHandQ={};let maxHandRotationStepDeg=0,maxBedPenetrationM=0,bedPenetrationSamples=0,maxFingerTranslationDeltaM=0;
        // Include half-frame interpolation; baking knots alone cannot expose
        // quaternion-interpolation contact failures.
        for(let sample=0;sample<=240;sample++){
          const time=sample/120;action.enabled=true;action.paused=false;rig.mixer.setTime(time);actor.root.updateMatrixWorld(true);for(const mesh of meshes)mesh.skeleton.update();
          const matrices=bones.flatMap(b=>b.matrixWorld.elements);if(sample===0)first=matrices;if(sample===240)seam=Math.max(...matrices.map((v,i)=>Math.abs(v-first[i])));
          const pelvis=rig.bones.pelvis.getWorldPosition(V());if(lastPelvis)maxPelvisSpeed=Math.max(maxPelvisSpeed,pelvis.distanceTo(lastPelvis)*120);lastPelvis=pelvis;
          const torso=rig.bones.upperArmL.getWorldPosition(V()).add(rig.bones.upperArmR.getWorldPosition(V())).multiplyScalar(.5).sub(pelvis);
          forwardLeans.push(-Math.atan2(torso.z,torso.y)*180/Math.PI);
          if(sample%2===0)maxPositionError=Math.max(maxPositionError,pelvis.distanceTo(new T.Vector3(...expected.frames[sample/2].pelvis)));
          const lengths=[];
          for(const {bone,position} of fingerOffsets){
            const reference=bone.parent.localToWorld(position.clone()),actual=bone.getWorldPosition(V());
            maxFingerTranslationDeltaM=Math.max(maxFingerTranslationDeltaM,actual.distanceTo(reference));
          }
          for(const mesh of meshes)for(let vertex=0;vertex<mesh.geometry.attributes.position.count;vertex++){
            const p=mesh.getVertexPosition(vertex,V()).applyMatrix4(mesh.matrixWorld);
            const depth=Math.min(.29-Math.abs(p.x),.925-Math.abs(p.z),.07-Math.abs(p.y-(gripHeightM-.12)));
            if(depth>.001){bedPenetrationSamples++;maxBedPenetrationM=Math.max(maxBedPenetrationM,depth);}
          }
          for(const side of ['L','R']){
            let floor=Infinity;for(const p of probes[side])floor=Math.min(floor,p.mesh.getVertexPosition(p.vertex,V()).applyMatrix4(p.mesh.matrixWorld).y);minSole=Math.min(minSole,floor);
            const wrist=rig.bones['hand'+side].getWorldPosition(V()),ankle=rig.bones['foot'+side].getWorldPosition(V()),cfg=record.palms[expected.role][side];
            const q=rig.bones['hand'+side].getWorldQuaternion(new T.Quaternion()),elbow=rig.bones['forearm'+side].getWorldPosition(V()),shoulder=rig.bones['upperArm'+side].getWorldPosition(V());
            wristBends.push(wrist.clone().sub(elbow).angleTo(handForward[side].clone().applyQuaternion(q))*180/Math.PI);
            upperArmTilts.push(elbow.clone().sub(shoulder).angleTo(new T.Vector3(0,-1,0))*180/Math.PI);
            if(lastHandQ[side])maxHandRotationStepDeg=Math.max(maxHandRotationStepDeg,lastHandQ[side].angleTo(q)*180/Math.PI);lastHandQ[side]=q;
            const palm=rig.bones['hand'+side].localToWorld(new T.Vector3(...cfg.point));maxPalmError=Math.max(maxPalmError,palm.distanceTo(new T.Vector3(cfg.sign*.29,gripHeightM,-end)));
            if(sample%2===0){const f=expected.frames[sample/2];maxPositionError=Math.max(maxPositionError,wrist.distanceTo(new T.Vector3(...f.hands[side].wrist)),ankle.distanceTo(new T.Vector3(...f.feet[side].ankle)));maxSoleError=Math.max(maxSoleError,Math.abs(floor-f.feet[side].minY));}
            const phase=((time-(side==='L'?.3:1.3))%2+2)%2;
            // A rolling foot's ankle should move. Track the same original skin
            // material point throughout each support window instead. The flat
            // window independently checks both the heel and toe vertices.
            const mode=phase<.2-1e-8?'heel':phase<=1+1e-8?'flat':phase<1.2-1e-8?'toe':'swing';
            const keys=mode==='swing'?[]:markerMode==='legacy_fixed_ankle'?['ankle']:mode==='flat'?['heel','toe']:[mode];
            for(const key of ['heel','toe','ankle']){
              const contactKey=side+'/'+key;
              if(!keys.includes(key)){contacts[contactKey]=null;continue;}
              const marker=soleMarkers[side]?.[key],world=marker?marker.mesh.getVertexPosition(marker.vertex,V()).applyMatrix4(marker.mesh.matrixWorld):ankle.clone();world.z-=referenceSpeedMps*time;
              if(!contacts[contactKey]||contacts[contactKey].mode!==mode){
                const window={side,key,mode,start:time,end:time,samples:0,maxDriftM:0,minHeightM:world.y,maxHeightM:world.y};
                // Heel remains planted into flat support; toe remains planted
                // from flat support into toe-off. Do not reset the material
                // anchor at those mode boundaries and hide a one-frame slip.
                const anchor=contacts[contactKey]?.anchor||world.clone();
                contacts[contactKey]={mode,anchor,window};contactWindows.push(window);
              }
              const {anchor,window}=contacts[contactKey],drift=world.distanceTo(anchor);window.end=time;window.samples++;window.maxDriftM=Math.max(window.maxDriftM,drift);window.minHeightM=Math.min(window.minHeightM,world.y);window.maxHeightM=Math.max(window.maxHeightM,world.y);maxStanceDrift=Math.max(maxStanceDrift,drift);
            }
            for(const [a,b] of [['upperArm','forearm'],['forearm','hand'],['thigh','calf'],['calf','foot']])lengths.push(rig.bones[a+side].getWorldPosition(V()).distanceTo(rig.bones[b+side].getWorldPosition(V())));
          }
          firstLengths??=lengths;maxLengthDelta=Math.max(maxLengthDelta,...lengths.map((v,i)=>Math.abs(v-firstLengths[i])));
        }
        profiles.push({size:expected.size,role:expected.role,samples:241,minSole,maxPalmError,maxPositionError,maxSoleError,seam,maxStanceDrift,markerMode,contactWindows,maxLengthDelta,maxPelvisSpeed,
          handPosture:{maxWristBendDeg:Math.max(...wristBends),medianWristBendDeg:wristBends.sort((a,b)=>a-b)[Math.floor(wristBends.length/2)],maxUpperArmTiltDeg:Math.max(...upperArmTilts),maxHandRotationStepDeg,minForwardLeanDeg:Math.min(...forwardLeans),maxForwardLeanDeg:Math.max(...forwardLeans),acceptedForGame:false},
          bedContact:{maxBedPenetrationM,bedPenetrationSamples,method:'all actual skin vertices inside the candidate bed box, excluding the outer 1 mm boundary; no patient is included'},
          fingerStructure:{bones: fingerOffsets.length,maxFingerTranslationDeltaM,method:'all finger joint offsets compared with the independently loaded original model before animation'},
          bindingUnchanged:bind===JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)))&&bones.every((b,i)=>b.parent===parents[i])});
      }
      return {id:model.id,profiles};
    },{model,record,assetRecord,bearerOffsetM:report.bearerOffsetM,gripHeightM:report.gripHeightM??.88,referenceSpeedMps:report.referenceSpeedMps??.55});
    results.push(actual);
    for(const p of actual.profiles)if(!(p.bindingUnchanged&&p.maxPositionError<.00005&&p.maxSoleError<.00005&&p.minSole>=.001&&p.maxPalmError<.001&&p.seam<.001&&p.maxStanceDrift<.001&&p.maxLengthDelta<.0001&&p.maxPelvisSpeed<1.6))failures.push({id:actual.id,...p});
    if(report.wristFit)for(const p of actual.profiles)if(p.handPosture.maxHandRotationStepDeg>=5)failures.push({id:actual.id,role:p.role,size:p.size,reason:'hand orientation discontinuity',handPosture:p.handPosture});
    for(const p of actual.profiles){
      if(p.bedContact.bedPenetrationSamples>0)failures.push({id:actual.id,role:p.role,size:p.size,reason:'body penetrates the candidate bed beyond 1 mm',bedContact:p.bedContact});
      if(p.fingerStructure.bones!==30||p.fingerStructure.maxFingerTranslationDeltaM>=.0001)failures.push({id:actual.id,role:p.role,size:p.size,reason:'original finger structure changed',fingerStructure:p.fingerStructure});
    }
    console.log(JSON.stringify(actual));
  }
  const file=path.join(folder,reportName);assert.equal(await fs.stat(file).then(()=>true,()=>false),false,'Preserve the previous validation');
  await fs.writeFile(file,JSON.stringify({status:failures.length||errors.length?'requires_correction':'export_matches_trial_requires_visual_acceptance',fitReport:fitGroup+'/Data_ProductionFit.json',results,failures,errors},null,2));
  assert.deepEqual(errors,[]);assert.equal(failures.length,0,`${failures.length} profiles require correction; see ${reportName}`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
