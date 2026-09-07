// Measure frozen carry candidates in the actual production rig/Actor scale.
// This is a local diagnostic; it never enables clips or edits mission facts.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LoadGlb,SerializeGlb,PoseScene,ReadAccessor} from './Script_LugouGlbPose.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {MISSION_TUNING} from '../Data_Tuning_FirstLevel.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),Arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=Arg('--root'),group=Arg('--group','FirstLevelCarryFitV1'),revision=Number(Arg('--revision','10'));
const fit=args.includes('--fit'),hold=args.includes('--hold');
const exportGroup=Arg('--export-group',null);
if(exportGroup){assert.ok(fit);assert.ok(!hold,'Hold is diagnostic only; its own export/review contract is not implemented.');assert.match(exportGroup,/^FirstLevelCarryV[1-9]\d*$/);}
assert.ok(root,'--root required');assert.match(group,/^FirstLevelCarryFitV[1-9]\d*$/);
const sourceGroup='FirstLevelCarryV'+revision,folder=path.join(root,'Models',group),out=path.join(project,'_shots',group);
const reportPath=path.join(folder,'Data_ProductionFit.json');
assert.equal(await fs.stat(reportPath).then(()=>true,()=>false),false,'Use a new version; preserve earlier measurements.');
await fs.mkdir(out,{recursive:true});await fs.mkdir(folder,{recursive:true});
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contact=JSON.parse(await fs.readFile(path.join(root,'Models',sourceGroup,'Data_ContactValidation.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(project,'Model/Character/Data_LugouCharacterManifest.json'),'utf8'));
const core=await fs.readFile(path.join(project,'vendor/three/build/three.core.js'));
const {Matrix4,Vector3,Quaternion}=await import('data:text/javascript;base64,'+core.toString('base64'));
const Pos=m=>new Vector3().setFromMatrixPosition(m);
function BindRest(glb,scene){
  const rest=[];
  for(const i of scene.order){const local=new Matrix4().compose(new Vector3(...scene.baseT[i]),new Quaternion(...scene.baseR[i]),new Vector3(...scene.baseS[i]));rest[i]=scene.parent[i]<0?local:rest[scene.parent[i]].clone().multiply(local);}
  for(const skin of glb.json.skins){const inverse=ReadAccessor(glb,skin.inverseBindMatrices).data;skin.joints.forEach((node,j)=>rest[node]=new Matrix4().fromArray(inverse,j*16).invert());}
  return rest;
}
const records=[];
for(let n=1;n<=4;n++){
  const id='LugouNra0'+n,file='Animation_'+id+'FirstLevelCarry.glb';
  const bytes=await fs.readFile(path.join(root,'Models',sourceGroup,'GameIntegration',file));await fs.writeFile(path.join(out,file),bytes);
  const target=LoadGlb(path.join(project,'Model/Character/Model_'+id+'.glb')),scene=new PoseScene(target),rest=BindRest(target,scene),palms={};
  for(const role of ['Front','Rear']){
    const source=LoadGlb(path.join(root,'Models',sourceGroup,`Animation_Nra_CarryStretcher${role}_V${revision}.glb`)),src=new PoseScene(source),srcRest=BindRest(source,src);
    const offset=Pos(rest[scene.NodeIndex('Bip002 Pelvis')]).sub(Pos(srcRest[src.NodeIndex('Bip002 Pelvis')]));
    palms[role]={};
    for(const side of ['L','R']){
      const name='Bip002 '+side+' Hand',i=scene.NodeIndex(name),j=src.NodeIndex(name);
      const correction=srcRest[j].clone().invert().multiply(rest[i].clone().setPosition(Pos(rest[i]).sub(offset)));
      palms[role][side]={point:new Vector3(...contact.calibration[role][side].palmLocal).applyMatrix4(correction.invert()).toArray(),sign:-contact.calibration[role][side].sign};
    }
  }
  records.push({id,file,animationSha256:Hash(bytes),modelSha256:Hash(target.buffer),assetRecord:manifest.models.find(m=>m.id===id),palms,nodeNames:target.json.nodes.map(n=>n.name),topNodes:target.json.scenes[target.json.scene||0].nodes});
}
function CurvesGlb(original,profiles){
  const json={asset:{version:'2.0',generator:'FirstLevelCarryContactFit'},scene:original.json.scene,scenes:structuredClone(original.json.scenes),nodes:original.json.nodes.map(node=>{const n=structuredClone(node);for(const key of ['mesh','skin','camera','extensions'])delete n[key];return n}),animations:[],accessors:[],bufferViews:[],buffers:[]},chunks=[];let offset=0;
  const Access=(values,type)=>{const data=Float32Array.from(values),bytes=Buffer.from(data.buffer);json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});offset+=bytes.length;chunks.push(bytes);json.accessors.push({bufferView:json.bufferViews.length-1,componentType:5126,count:data.length/({SCALAR:1,VEC3:3,VEC4:4}[type]),type,...(type==='SCALAR'?{min:[values[0]],max:[values.at(-1)]}:{})});return json.accessors.length-1};
  for(const profile of profiles){
    const clip={name:`FirstLevelCarry${profile.role}${hold?'Hold':'Walk'}${Math.round(profile.size*100)}`,channels:[],samplers:[],extras:{source:'V10 plus authored pelvis, gait support and hand contact',referenceSpeedMps:hold?0:.55,acceptedForGame:false}};
    const input=Access(profile.frames.map(f=>f.time),'SCALAR');
    for(const [node,curves] of profile.curves.entries())for(const property of ['translation','rotation','scale']){
      clip.channels.push({sampler:clip.samplers.length,target:{node,path:property}});clip.samplers.push({input,output:Access(curves[property],property==='rotation'?'VEC4':'VEC3'),interpolation:'LINEAR'});
    }
    json.animations.push(clip);
  }
  const bin=Buffer.concat(chunks);json.buffers=[{byteLength:bin.length}];return {json,bin};
}
function FullPackage(original,curves,profile,nominalScale){
  const json=structuredClone(original.json),viewOffset=json.bufferViews.length,accessorOffset=json.accessors.length;
  json.bufferViews.push(...curves.json.bufferViews.map(v=>({...v,byteOffset:v.byteOffset+original.bin.length})));
  json.accessors.push(...curves.json.accessors.map(a=>({...a,bufferView:a.bufferView+viewOffset})));
  const name=`FirstLevelCarry${profile.role}${hold?'Hold':'Walk'}100`;
  json.animations=[structuredClone(curves.json.animations.find(c=>c.name===name))];
  for(const s of json.animations[0].samplers){s.input+=accessorOffset;s.output+=accessorOffset;}
  const scene=json.scenes[json.scene||0];json.nodes.push({name:'Transform_ActualGameScale',children:scene.nodes,scale:[nominalScale,nominalScale,nominalScale],translation:[0,0,(profile.role==='Front'?1:-1)*MISSION_TUNING.litterBearerOffsetM]});scene.nodes=[json.nodes.length-1];
  for(const mat of json.materials){const pbr=mat.pbrMetallicRoughness??={};pbr.metallicFactor=0;pbr.roughnessFactor=Math.max(.58,pbr.roughnessFactor||1);}
  const bin=Buffer.concat([original.bin,curves.bin]);json.buffers=[{byteLength:bin.length}];return SerializeGlb(json,bin);
}
await fs.writeFile(path.join(out,'_check_Fit.html'),`<!doctype html><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script><body style="margin:0"><script type="module">
import * as T from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';import {LugouCharacterRig} from '../../Script_CharacterModel.mjs';import {FirstLevelCarryContactFit} from '../../_import/Script_FirstLevelCarryContactFit.mjs';
window.CarryFit={T,loader:new GLTFLoader(),LugouCharacterRig,FirstLevelCarryContactFit};</script>`);
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser(),results=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/${group}/_check_Fit.html`);await page.waitForFunction(()=>window.CarryFit);
  for(const record of records){
    const result=await page.evaluate(async({record,bearerOffsetM,fit,hold,exportGroup})=>{
      const {T,loader,LugouCharacterRig,FirstLevelCarryContactFit}=CarryFit;
      const [gltf,library]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+record.id+'.glb'),loader.loadAsync('./'+record.file)]);
      const profiles=[];const V=()=>new T.Vector3();
      for(const size of [.96,1,1.04])for(const role of ['Front','Rear']){
        const actor={root:new T.Group(),body:new T.Group()};actor.root.scale.setScalar(size);actor.body.position.y=.85;actor.root.add(actor.body);
        const end=role==='Front'?1:-1;actor.root.position.z=-end*bearerOffsetM;
        const rig=new LugouCharacterRig({record:record.assetRecord,gltf},{kind:'nra',targetHeight:1.66,seed:'CarryFit',variantIndex:0});rig.Attach(actor);
        const neutralFeet={},neutralToes={L:[],R:[]};
        for(const side of ['L','R']){neutralFeet[side]=rig.bones['foot'+side].getWorldQuaternion(new T.Quaternion());rig.root.traverse(n=>{if(n.name.replaceAll('_',' ').includes(' '+side+' Toe'))neutralToes[side].push([n,n.quaternion.clone()]);});}
        rig.mixer.stopAllAction();
        const clip=library.animations.find(c=>c.name==='FirstLevelCarryStretcher'+role);if(!clip)throw Error('Missing '+role);
        const action=rig.mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
        const meshes=[],bones=[];rig.root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);if(n.isBone)bones.push(n)});
        const bind=JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements))),parents=bones.map(b=>b.parent),frames=[];
        const probes={L:[],R:[]};
        for(const mesh of meshes){const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
          for(let vertex=0;vertex<indices.count;vertex++)for(const side of ['L','R']){
            let weight=0;for(let k=0;k<4;k++){const name=(mesh.skeleton.bones[indices.getComponent(vertex,k)]?.name||'').replaceAll('_',' ');if(name.includes(' '+side+' ')&&/Foot|Toe/.test(name))weight+=weights.getComponent(vertex,k);}
            if(weight>.5)probes[side].push({mesh,vertex});
          }
        }
        if(!probes.L.length||!probes.R.length)throw Error('Both actual shoe meshes must be sampled');
        const baseY=rig.root.position.y,baseRigInverse=rig.root.matrixWorld.clone().invert();let anchor=null,firstLengths=null,maxLengthDelta=0,fitter=null,dropM=0;
        const nodes=exportGroup?record.nodeNames.map(name=>{const node=rig.root.getObjectByName(name.replaceAll(' ','_'))||rig.root.getObjectByName(name);if(!node)throw Error('Missing original node '+name);return node}):[];
        const curves=nodes.map(()=>({translation:[],rotation:[],scale:[]}));
        const Sample=time=>{
          fitter?.Restore();action.enabled=true;action.paused=false;rig.mixer.setTime(hold?.5:time);rig.root.position.set(0,baseY,0);actor.root.updateMatrixWorld(true);
          const pelvis=actor.root.worldToLocal(rig.bones.pelvis.getWorldPosition(V()));
          // A single initial anchor retains the recovered sway. It does not
          // cancel each frame's pelvis translation or invent root motion.
          anchor??=new T.Vector3(pelvis.x,0,pelvis.z-end*.06);rig.root.position.x-=anchor.x;rig.root.position.z-=anchor.z;actor.root.updateMatrixWorld(true);
        };
        if(fit){fitter=new FirstLevelCarryContactFit({T,actor,rig,role,palms:record.palms[role],probes,neutralFeet,neutralToes});for(let frame=0;frame<=120;frame++){Sample(frame/60);dropM=Math.max(dropM,fitter.RequiredDrop());}dropM+=.004;}
        for(let frame=0;frame<=120;frame++){
          Sample(frame/60);const correction=fitter?.Apply(frame/60,{dropM,hold})||null;for(const mesh of meshes)mesh.skeleton.update();const feet={},hands={},lengths=[];
          for(const side of ['L','R']){
            let minY=Infinity,lowest=null;
            for(const p of probes[side]){const v=p.mesh.getVertexPosition(p.vertex,V()).applyMatrix4(p.mesh.matrixWorld);if(v.y<minY){minY=v.y;lowest=v;}}
            feet[side]={minY,lowest:lowest?.toArray(),ankle:rig.bones['foot'+side].getWorldPosition(V()).toArray(),vertices:probes[side].length};
            const shoulder=rig.bones['upperArm'+side].getWorldPosition(V()),elbow=rig.bones['forearm'+side].getWorldPosition(V()),wrist=rig.bones['hand'+side].getWorldPosition(V());
            const palm=rig.bones['hand'+side].localToWorld(new T.Vector3(...record.palms[role][side].point)),palmOffset=palm.clone().sub(wrist),sign=record.palms[role][side].sign;
            const lengthsArm=[shoulder.distanceTo(elbow),elbow.distanceTo(wrist)];
            hands[side]={palm:palm.toArray(),wrist:wrist.toArray(),shoulder:shoulder.toArray(),armLengths:lengthsArm,targets:[.88,1.32,.34].map(height=>{
              const grip=new T.Vector3(sign*.29,height,-end),target=grip.clone().sub(palmOffset),horizontal=Math.hypot(target.x-shoulder.x,target.z-shoulder.z),maxReach=lengthsArm[0]+lengthsArm[1];
              return {height,palmError:palm.distanceTo(grip),reachRatio:shoulder.distanceTo(target)/maxReach,minReachableGripHeight:horizontal<maxReach?shoulder.y-Math.sqrt(maxReach**2-horizontal**2)+palmOffset.y:null};
            })};
            lengths.push(...lengthsArm,rig.bones['thigh'+side].getWorldPosition(V()).distanceTo(rig.bones['calf'+side].getWorldPosition(V())),rig.bones['calf'+side].getWorldPosition(V()).distanceTo(rig.bones['foot'+side].getWorldPosition(V())));
          }
          firstLengths??=lengths;maxLengthDelta=Math.max(maxLengthDelta,...lengths.map((v,i)=>Math.abs(v-firstLengths[i])));
          frames.push({frame,time:frame/60,pelvis:rig.bones.pelvis.getWorldPosition(V()).toArray(),feet,hands,correction});
          if(exportGroup)for(let i=0;i<nodes.length;i++){
            const node=nodes[i],p=V(),q=new T.Quaternion(),s=V();
            if(record.topNodes.includes(i))baseRigInverse.clone().multiply(node.matrixWorld).decompose(p,q,s);else {p.copy(node.position);q.copy(node.quaternion);s.copy(node.scale);}
            const prior=curves[i].rotation.slice(-4);if(prior.length&&q.dot(new T.Quaternion(...prior))<0)q.set(-q.x,-q.y,-q.z,-q.w);
            curves[i].translation.push(...p);curves[i].rotation.push(...q);curves[i].scale.push(...s);
          }
        }
        const summary={minSole:Math.min(...frames.flatMap(f=>[f.feet.L.minY,f.feet.R.minY])),maxLowestSole:Math.max(...frames.map(f=>Math.min(f.feet.L.minY,f.feet.R.minY))),maxLengthDelta,
          targets:[.88,1.32,.34].map(height=>{const samples=frames.flatMap(f=>['L','R'].map(s=>f.hands[s].targets.find(t=>t.height===height)));return {height,minPalmError:Math.min(...samples.map(s=>s.palmError)),maxPalmError:Math.max(...samples.map(s=>s.palmError)),maxReachRatio:Math.max(...samples.map(s=>s.reachRatio)),unreachable:samples.filter(s=>s.reachRatio>=1).length,total:samples.length}})};
        profiles.push({size,role,modelScale:rig.modelScale,worldModelScale:rig.modelScale*size,anchor:anchor.toArray(),dropM,bindingUnchanged:bind===JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)))&&bones.every((b,i)=>b.parent===parents[i]),summary,frames,...(exportGroup?{curves}:{})});
        if(size===1){
          Sample(.5);fitter?.Apply(.5,{dropM,hold});const scene=new T.Scene();scene.background=new T.Color(0x26323a);scene.add(actor.root,new T.HemisphereLight(0xffffff,0x63707a,2.5));
          for(const mesh of meshes){for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){m.metalness=0;m.roughness=Math.max(.58,m.roughness);}}
          const light=new T.DirectionalLight(0xffffff,3);light.position.set(3,6,-2);scene.add(light,new T.GridHelper(8,40));
          const material=new T.MeshStandardMaterial({color:0x9b703c,roughness:.85});
          for(const x of [-.29,.29]){const mesh=new T.Mesh(new T.BoxGeometry(.065,.065,2.15),material);mesh.position.set(x,.88,0);scene.add(mesh);}
          const bed=new T.Mesh(new T.BoxGeometry(.58,.14,1.85),material);bed.position.y=.76;scene.add(bed);
          const camera=new T.PerspectiveCamera(36,1.4,.01,100);camera.position.set(role==='Front'?2.6:-2.6,1.9,end*2.5);camera.lookAt(0,.8,-end*.7);
          const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1400,1000);renderer.render(scene,camera);
          CarryFit.images??=[];CarryFit.images.push({role,data:renderer.domElement.toDataURL('image/png')});renderer.dispose();
        }
      }
      return {id:record.id,profiles};
    },{record,bearerOffsetM:MISSION_TUNING.litterBearerOffsetM,fit,hold,exportGroup});
    for(const p of result.profiles){assert.ok(p.bindingUnchanged,'original binding/hierarchy');assert.ok(p.summary.maxLengthDelta<.0001,'fixed original limb lengths');assert.ok(Number.isFinite(p.summary.minSole)&&Number.isFinite(p.summary.maxLowestSole),'finite actual shoe samples');}
    if(fit)for(const p of result.profiles){assert.ok(p.summary.minSole>=.0018,'no boot penetration');assert.ok(p.summary.targets[0].maxPalmError<.0001,'actual rail contact');}
    if(exportGroup){
      const destination=path.join(root,'Models',exportGroup);await fs.mkdir(destination,{recursive:true});
      const original=LoadGlb(path.join(project,'Model/Character/Model_'+record.id+'.glb')),curves=CurvesGlb(original,result.profiles),file='Animation_'+record.id+'FirstLevelCarry.glb';
      assert.equal(await fs.stat(path.join(destination,file)).then(()=>true,()=>false),false,'Do not overwrite an earlier export');
      const bytes=SerializeGlb(curves.json,curves.bin);await fs.writeFile(path.join(destination,file),bytes);result.export={file,sha256:Hash(bytes),group:exportGroup};
      for(const p of result.profiles.filter(p=>p.size===1))await fs.writeFile(path.join(destination,`Model_${record.id}_Carry${p.role}.glb`),FullPackage(original,curves,p,p.modelScale));
      for(const p of result.profiles)delete p.curves;
    }
    const images=await page.evaluate(()=>{const images=CarryFit.images;CarryFit.images=[];return images});
    for(const img of images)await fs.writeFile(path.join(folder,`Texture_${record.id}_${img.role}.png`),Buffer.from(img.data.split(',')[1],'base64'));
    results.push(result);console.log(JSON.stringify({id:result.id,profiles:result.profiles.map(({frames,...p})=>p)}));
  }
  assert.deepEqual(errors,[]);
  const runtimeHashes={};for(const name of ['Script_CharacterModel.mjs','Script_FirstLevelMissionPeople.mjs','Script_FirstLevelMissionView.mjs','Data_Tuning_FirstLevel.mjs'])runtimeHashes[name]=Hash(await fs.readFile(path.join(project,name)));
  await fs.writeFile(reportPath,JSON.stringify({status:fit?'authored_contact_trial_requires_review':'measured_requires_contact_correction',fit,hold,createdUtc:new Date().toISOString(),sourceGroup,sourceContactReportSha256:Hash(await fs.readFile(path.join(root,'Models',sourceGroup,'Data_ContactValidation.json'))),
    scope:fit?'Authored flat-ground .88 m contact trial on 24 production profiles; original V10 and raw untouched. Constant body height/placement correction, reconstructed .55 m/s support gait and authored IK. Not game acceptance.':'24 real production rig profiles; flat terrain, constant first-frame pelvis anchor. No per-frame ground or hand correction. Moving .88, loading 1.32, fallen .34 metre grips use r12 geometry. Reach uses the V10 hand orientation and is a geometric bound, not a naturalness verdict.',
    newVideoGenerations:0,newInferenceRuns:0,bearerOffsetM:MISSION_TUNING.litterBearerOffsetM,records:records.map(({assetRecord,...r})=>r),runtimeHashes,results,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
