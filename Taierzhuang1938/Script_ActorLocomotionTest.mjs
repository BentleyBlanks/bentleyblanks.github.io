// Real production GLBs, world-space contacts and distance integration.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ACTOR_LOCOMOTION_PROFILES } from './Data_ActorLocomotion.mjs';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { ServeRoot } from './Script_DevServer.mjs';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(import.meta.dirname,'_shots/Locomotion');await fs.mkdir(output,{recursive:true});
for(const entries of Object.values(ACTOR_LOCOMOTION_PROFILES))for(const profile of Object.values(entries)) {
  if(!profile.source)continue;
  const bytes=await fs.readFile(path.join(import.meta.dirname,profile.source));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),profile.sha256,'source changed: rebake contact profiles');
}
const server=await ServeRoot(root,0),browser=await LaunchBrowser(),errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?poseTest=1`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.actorFactory,null,{timeout:180000});
  const results=await page.evaluate(async()=>{
    const THREE=await import('three'),factory=window.Taierzhuang.actorFactory;
    const {InstallP012ActorMotion}=await import('./Script_FirstLevelP012CastAppearance.mjs');
    const {InstallSquadMarchActor}=await import('./Script_SquadMarchActor.mjs');
    const {CHARACTER_MODEL_VARIANTS_BY_KIND}=await import('./Data_CharacterSelection.mjs');
    factory.SetBatcher(null);
    const rows=[];
    for(const kind of ['nra','ija'])for(const modelVariant of CHARACTER_MODEL_VARIANTS_BY_KIND[kind])for(const speed of [.15,1.35,3.6,5.4]) {
      const actor=factory.Create(kind,{seed:1234,modelVariant,weapon:'HanYang'}),rig=actor.characterRig;
      actor.Update(1/60,{moveSpeed:0,moveSpeedMps:0,elapsed:0,locomotionTracked:true});
      let maxContactError=0,maxRawError=0,contacts=0,totalPhase=0,expectedPhase=0;
      const keys=new Map(),rawAnchors=new Map();let time=0;
      for(let i=0;i<360;i++) {
        const dt=[1/60,1/30,1/90][i%3];time+=dt;
        const yaw=i<150?0:(i-150)*.003;
        actor.root.rotation.y=yaw;actor.root.position.x-=Math.sin(yaw)*speed*dt;actor.root.position.z-=Math.cos(yaw)*speed*dt;
        const before=rig.currentAction?.time,previousId=rig.currentId;
        actor.Update(dt,{moveSpeed:1,moveSpeedMps:speed,elapsed:time,locomotionTracked:true});
        if(i>5 && previousId===rig.currentId) {
          const duration=rig.currentAction.getClip().duration;
          totalPhase+=(rig.currentAction.time-before+duration)%duration;
          expectedPhase+=speed*dt/(rig.locomotion.profiles.RifleRun.referenceMps*rig.root.getWorldScale(new THREE.Vector3()).y);
        }
        for(const f of rig.locomotion.feet)if(f.weight>.999) {
          const point=f.toe.getWorldPosition(new THREE.Vector3());
          const first=keys.get(f.side);
          if(first?.key===f.key) {
            maxContactError=Math.max(maxContactError,Math.hypot(point.x-first.point.x,point.z-first.point.z));contacts++;
          }else keys.set(f.side,{key:f.key,point});
        }else keys.delete(f.side);
        // Independently sample the uncorrected skeleton at the same clock/position.
        const saved=rig.locomotion.feet.map(f=>({f,rotations:[f.thigh.quaternion.clone(),f.calf.quaternion.clone(),f.foot.quaternion.clone()]}));
        for(const {f} of saved)if(f.applied){f.thigh.quaternion.copy(f.saved[0]);f.calf.quaternion.copy(f.saved[1]);f.foot.quaternion.copy(f.saved[2]);}
        for(const {f,rotations} of saved) {
          const point=f.toe.getWorldPosition(new THREE.Vector3());
          if(f.weight>.999) {
            const previous=rawAnchors.get(f.side);
            if(previous?.key===f.key)maxRawError=Math.max(maxRawError,Math.hypot(point.x-previous.point.x,point.z-previous.point.z));
            else rawAnchors.set(f.side,{key:f.key,point});
          }else rawAnchors.delete(f.side);
          f.thigh.quaternion.copy(rotations[0]);f.calf.quaternion.copy(rotations[1]);f.foot.quaternion.copy(rotations[2]);
        }
      }
      const rate=rig.currentAction.getEffectiveTimeScale();
      actor.root.position.z-=speed/60;time+=1/60;
      actor.Update(1/60,{moveSpeed:1,moveSpeedMps:speed,elapsed:time,locomotionTracked:true,firing:true,aim:1});
      const movingFire=rig.currentId;
      // A blocked character receives the old movement command but makes no world progress.
      actor.Update(1/60,{moveSpeed:1,moveSpeedMps:speed,elapsed:time+1/60,locomotionTracked:true});
      const blocked={speed:rig.locomotion.speedMps,clip:rig.currentId};
      const prior=rig.locomotion.previous.clone();actor.root.position.z-=.1;
      actor.Update(0,{moveSpeed:1,moveSpeedMps:speed,elapsed:time+1/60,locomotionTracked:true});
      const zeroRead=prior.distanceTo(rig.locomotion.previous);
      actor.root.position.x+=100;
      actor.Update(1/60,{moveSpeed:1,moveSpeedMps:speed,elapsed:time+2/60,locomotionTracked:true});
      const teleport=rig.locomotion.speedMps;
      // NRA05 borrows NRA02's crouch library; its clock must use that same mapping.
      actor.Update(.1,{crouch:1,moveSpeed:.2,moveSpeedMps:.4});
      const crouchRate=rig.currentAction.getEffectiveTimeScale();
      const crouchSpeed=crouchRate*(kind==='nra'?.2554529916490837:.23864468053263868)*rig.root.getWorldScale(new THREE.Vector3()).y;
      rows.push({kind,modelVariant,modelId:rig.modelId,speed,rate,maxContactError,maxRawError,contacts,phaseError:Math.abs(totalPhase-expectedPhase),movingFire,blocked,zeroRead,teleport,crouchSpeed});
      actor.Dispose();
    }
    const clocks=[];
    for(const cadence of [1,2,4])for(const scale of [.8,1.2]) {
      const actor=factory.Create('nra',{seed:1543,modelVariant:0,weapon:'HanYang'}),rig=actor.characterRig;
      actor.root.scale.setScalar(scale);
      actor.Update(1/60,{elapsed:0,moveSpeedMps:0,locomotionTracked:true});
      let expected=0,actual=0;
      for(let frame=1;frame<=240;frame++) {
        // Accelerate, brake and restart while updates alternate between LOD and firing cadence.
        const speed=frame<100?.09+frame*.03:frame<150?(150-frame)*.06:2.4;
        actor.root.position.z-=speed/60;
        const worldScale=rig.root.getWorldScale(new THREE.Vector3()).y;
        expected+=speed/60/(rig.locomotion.profiles.RifleRun.referenceMps*worldScale);
        if(frame%cadence && frame%17)continue;
        const previous=rig.currentAction?.time,previousId=rig.currentId;
        actor.Update(cadence/60,{elapsed:frame/60,moveSpeedMps:speed,locomotionTracked:true});
        if(previousId==='RifleRun')actual+=(rig.currentAction.time-previous+rig.currentAction.getClip().duration)%rig.currentAction.getClip().duration;
        else actual+=rig.currentAction.getEffectiveTimeScale()*cadence/60;
      }
      clocks.push({cadence,scale,error:Math.abs(expected-actual)});actor.Dispose();
    }
    const preview=factory.Create('nra',{seed:8,modelVariant:1,weapon:'HanYang'});
    for(let i=0;i<60;i++)preview.Update(1/60,{moveSpeed:1});
    const previewLocked=preview.characterRig.locomotion.feet.some(foot=>foot.applied);
    preview.Dispose();
    const hidden=factory.Create('nra',{seed:34,modelVariant:4,weapon:'HanYang'}),clock=hidden.characterRig.locomotion;
    const startPhase=clock.crowdPhase,profile=clock.profiles.RifleRun;
    const stride=profile.referenceMps*profile.duration*hidden.characterRig.root.getWorldScale(new THREE.Vector3()).y;
    for(let i=0;i<50;i++)clock.AdvanceDistance(stride*.37/50,1/60);
    const farError=Math.abs((clock.crowdPhase-startPhase+1)%1-.37);
    const farStopped=clock.crowdPhase;clock.AdvanceDistance(0,1);clock.AdvanceDistance(100,1/60);
    const farStopError=Math.abs(clock.crowdPhase-farStopped);hidden.Dispose();
    const adapters=[];
    for(const mode of ['mission','march','back']) {
      const actor=factory.Create('nra',{seed:5432,modelVariant:0,weapon:'HanYang'}),rig=actor.characterRig;
      const soldier={id:5432,actor,alive:true,p012BackRifle:mode==='back',squadMarchCommand:{controlled:true}};
      if(mode!=='march'){InstallP012ActorMotion(soldier);await rig.p012BackRifleReady;}else InstallSquadMarchActor(soldier);
      let time=0;const rates=[];
      for(const speed of [1.2,2.4]) {
        for(let i=0;i<90;i++){time+=1/60;actor.root.position.z-=speed/60;actor.Update(1/60,{elapsed:time,moveSpeed:speed/3.6,moveSpeedMps:speed});}
        rates.push(rig.currentAction.getEffectiveTimeScale());
      }
      adapters.push({mode,clip:rig.currentId,rates});actor.Dispose();
    }
    // Render a real model sequence against ground grid lines for visual contact review.
    const scene=new THREE.Scene();scene.background=new THREE.Color('#bac1be');
    scene.add(new THREE.HemisphereLight(0xe8f2ff,0x76624f,2.2));
    const sun=new THREE.DirectionalLight(0xffebcc,2.5);sun.position.set(-3,8,4);scene.add(sun);
    scene.add(new THREE.GridHelper(40,80,0x4c5654,0x88918b));
    const camera=new THREE.PerspectiveCamera(38,1.6,.05,100);camera.position.set(-3.5,2.1,-4);camera.lookAt(0,.85,0);
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1440,900);
    document.body.replaceChildren(renderer.domElement);
    const actors=[factory.Create('nra',{seed:1234,modelVariant:0}),factory.Create('ija',{seed:1234,modelVariant:0})];
    actors.forEach((actor,i)=>{actor.root.position.x=(i-.5)*1.5;scene.add(actor.root);});
    window.LocomotionReview={scene,camera,renderer,actors,time:0};
    renderer.render(scene,camera);
    return {rows,adapters,clocks,previewLocked,farError,farStopError};
  });
  await fs.writeFile(path.join(output,'Data_LocomotionValidation.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({maxContactError:Math.max(...results.rows.map(row=>row.maxContactError)),
    maxRawError:Math.max(...results.rows.map(row=>row.maxRawError)),adapters:results.adapters,clocks:results.clocks}));
  for(const row of results.rows) {
    assert.ok(row.contacts>20,'contact windows exercised');
    assert.ok(row.maxContactError<.015,`planted foot: ${JSON.stringify(row)}`);
    assert.ok(row.phaseError<.0001,'distance integration');
    assert.equal(row.modelId,`Lugou${row.kind==='nra'?'Nra':'Ija'}${String(row.modelVariant+1).padStart(2,'0')}`,'test must exercise the requested approved appearance');
    assert.ok(Math.abs(row.crouchSpeed-.4)<.00001,'borrowed infantry library speed');
    assert.equal(row.movingFire,'RifleRun','moving fire must preserve the lower-body gait');
    assert.equal(row.blocked.speed,0);assert.notEqual(row.blocked.clip,'RifleRun');
    assert.equal(row.zeroRead,0);assert.equal(row.teleport,0);
  }
  for(const row of results.adapters)assert.ok(Math.abs(row.rates[1]/row.rates[0]-2)<1e-6,`competing clock: ${row.mode}`);
  for(const row of results.clocks)assert.ok(row.error<.0001,`LOD distance clock: ${JSON.stringify(row)}`);
  assert.equal(results.previewLocked,false,'in-place editor preview must not pin feet to a stationary world root');
  assert.ok(results.farError<1e-6,'culled skeleton still advances by actual stride distance');
  assert.equal(results.farStopError,0,'far LOD cannot keep stepping while stopped or consume a teleport');
  for(let i=0;i<8;i++) {
    await page.evaluate(()=>{
      const r=window.LocomotionReview;
      for(let f=0;f<8;f++){r.time+=1/60;for(const actor of r.actors){actor.root.position.z-=1.35/60;actor.Update(1/60,{moveSpeed:1.35/3.6,moveSpeedMps:1.35,elapsed:r.time});}}
      const z=r.actors[0].root.position.z;r.camera.position.set(-3.5,2.1,z-4);r.camera.lookAt(0,.8,z);r.renderer.render(r.scene,r.camera);
    });
    await page.screenshot({path:path.join(output,`Preview_Contact_${i}.png`)});
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ActorLocomotionTest: ${results.rows.length} approved-model/speed cases, turning, blocking, teleport, zero-dt, mission/march adapters`,output);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
