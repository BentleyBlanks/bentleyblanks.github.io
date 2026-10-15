import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FPS_SKELETAL_ANIMATION} from './Data_FpsSkeletalAnimation.mjs';
import {FpsArmPose} from './Data_FpsArmPoses.mjs';
import * as THREE from './vendor/three/build/three.module.js';
import {FpsSkeletalAnimation} from './Script_FpsSkeletalAnimation.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
let count=0;
for(const id of FPS_SKELETAL_ANIMATION.weaponIds){
  const asset=JSON.parse(await fs.readFile(path.join(project,`Animation/FirstPerson/Data_Fps${id}Animations.json`),'utf8'));
  assert.equal(asset.source,'BlenderMCP');assert.equal(asset.bones.length,53);
  assert.deepEqual(Object.keys(asset.clips).sort(),[...FPS_SKELETAL_ANIMATION.clips].sort(),`${id}: only the scoped clips`);
  for(const [name,clip] of Object.entries(asset.clips)){
    count++;assert.ok(clip.duration>0&&clip.count>1);
    for(const values of [...clip.bones,...Object.values(clip.controls)]){
      assert.ok(values.length===7||values.length===clip.count*7,`${id} ${name}: sample count`);
      assert.ok(values.every(Number.isFinite));
      for(let n=0;n<values.length;n+=7)assert.ok(Math.abs(Math.hypot(...values.slice(n+3,n+7))-1)<.00002,`${id} ${name}: normalized rotation`);
    }
    if(name==='Idle')assert.ok(clip.bones.some(values=>values.length>7&&Math.max(...values.map((value,index)=>Math.abs(value-values[index%7])))>.001),'holding loop must contain actual bone motion');
    if(name==='Idle')for(const [index,bone] of asset.bones.entries()){
      const match=bone.match(/_(R|L)_Finger(\d)(\d)?$/i);if(!match||clip.bones[index].length!==7)continue;
      const authored=FpsArmPose(id).contacts[match[1].toLowerCase()==='r'?'right':'left'].fingerRotations?.[match[2]+(match[3]||'')];
      if(!authored)continue;
      const rotation=clip.bones[index].slice(3),dot=rotation.reduce((sum,v,i)=>sum+v*authored[i],0)/(Math.hypot(...rotation)*Math.hypot(...authored));
      assert(Math.abs(dot)>1-1e-6,`${id} ${bone}: holding animation overrides the current authored grip`);
    }
    if(['Idle','Walk','Run'].includes(name))for(const values of [...clip.bones,...Object.values(clip.controls)]){
      if(values.length>7)for(let n=0;n<7;n++)assert.ok(Math.abs(values[n]-values.at(-7+n))<.0001,`${id} ${name}: closed bone loop`);
    }
  }
}
console.log(`PASS ${count} Blender bone clips: finite transforms, normalized rotations, complete loops`);
// Exercise the shipped holding clip against a genuinely open mechanism. The
// body must keep animating without the old closed-rifle bake resetting the bolt.
{
  const asset=JSON.parse(await fs.readFile(path.join(project,'Animation/FirstPerson/Data_FpsHanYangAnimations.json'),'utf8'));
  const index=asset.clips.Idle.bones.findIndex(values=>values.length>7
    &&values.some((value,i)=>Math.abs(value-values[i%7])>.001));
  const bone=new THREE.Bone();bone.name=asset.bones[index];
  const root=new THREE.Group();root.add(bone);
  const arms={root,contactWeight:{r:1,l:1},operationPose:{r:null,l:null},MeasureSkeletalPose(){}};
  const vm={weaponId:'HanYang',riggedArms:arms,root,armAnchor:new THREE.Group(),
    swayPivot:new THREE.Group(),statePivot:new THREE.Group(),flash:{visible:false},
    sprintSpring:{value:0},adsSpring:{value:0},flashTime:99,boltOpen:true};
  const bolt=new THREE.Group(),mount=new THREE.Group();
  bolt.position.z=.078;bolt.rotation.z=Math.PI/2;
  const animation=new FpsSkeletalAnimation(vm,{HanYang:asset});
  animation.Controls=()=>({part_bolt:bolt,weaponMount:mount});
  assert.equal(animation.Update(1/60,{elapsed:.3}),true,'holding clip still plays with the bolt open');
  const before=bone.quaternion.clone(),position=bone.position.clone();
  animation.Update(1/60,{elapsed:.7});
  assert(before.angleTo(bone.quaternion)>1e-5||position.distanceTo(bone.position)>1e-5,'the body retains its breathing motion');
  assert.equal(bolt.position.z,.078,'breathing must retain the open bolt travel');
  assert(Math.abs(bolt.rotation.z-Math.PI/2)<1e-8,'breathing must retain the unlocked handle angle');
  animation.SetPreview('Idle',{time:.3});
  assert(Math.abs(bolt.position.z)<1e-8&&Math.abs(bolt.rotation.z)<1e-8,'explicit clip preview still applies its authored mechanism');
  console.log('PASS holding motion retains live mechanism state and explicit previews retain full controls');
}
if(process.argv.includes('--browser')){
  const {LaunchBrowser}=await import('../PrairieFire1937/Script_BrowserTestKit.mjs');
  const {ServeRoot}=await import('./Script_DevServer.mjs');
  const server=await ServeRoot(path.resolve(project,'..'),0),browser=await LaunchBrowser();
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  const output=path.join(project,'_shots/FirstPersonSkeleton/Playback');await fs.mkdir(output,{recursive:true});
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&editor=firstPerson&fpWeapon=HanYang&fpClip=Idle&manual=1&quality=medium&scale=small`,{timeout:120000});
    await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
    const entry=await page.evaluate(()=>({active:window.Taierzhuang.editor.ActiveId,snapshot:window.Taierzhuang.editor.active?.Snapshot()}));
    assert.equal(entry.active,'firstPerson','deep link opens the actual first-person editor');
    assert.equal(entry.snapshot.weaponId,'HanYang','deep link selects HanYang');
    assert.equal(entry.snapshot.animation.name,'Idle','deep link selects the single holding clip');
    const report=await page.evaluate(()=>{
      const game=window.Taierzhuang,vm=game.viewmodel;
      const first=game.Debug.FirstPersonAnimation({weapon:'HanYang',clip:'Idle',normalized:.55,playing:false,clean:true});
      game.StepFrames(2);
      const Matrix=()=>vm.riggedArms.bindPose.flatMap(e=>[...e.object.position.toArray(),...e.object.quaternion.toArray()]);
      const a=Matrix();game.StepFrames(20);const b=Matrix();
      const step=game.Debug.FirstPersonAnimation({step:1});
      const seek=game.Debug.FirstPersonAnimation({normalized:.55});
      const c=Matrix();
      return {first:first.animation,step:step.animation,seek:seek.animation,
        pausedDrift:Math.max(...a.map((v,i)=>Math.abs(v-b[i]))),seekDrift:Math.max(...a.map((v,i)=>Math.abs(v-c[i]))),
        source:first.rigSource,residual:seek.gripResidual,gripError:{...vm.riggedArms.gripError}};
    });
    await fs.writeFile(path.join(output,'Data_Playback.json'),JSON.stringify(report,null,2));
    assert.equal(report.pausedDrift,0,'paused timeline freezes all bone channels');
    assert.equal(report.seekDrift,0,'seeking the same time is history independent');
    assert.equal(report.step.frame,report.first.frame+1,'step advances exactly one sampled frame');
    assert.equal(report.first.source,'BlenderMCP');
    assert.ok(Math.max(...Object.values(report.gripError))<.0001,'authored hands stay on the gun without runtime IK');
    await page.screenshot({path:path.join(output,'Timeline.png')});
    await page.addStyleTag({content:'.edPanel,.edGear,.edMenuBar,.edFpsLegend,.edFpsMountHud{display:none!important}'});
    for(const clip of FPS_SKELETAL_ANIMATION.clips)for(const normalized of [0,.25,.5,.75,1]){
      const snapshot=await page.evaluate(({clip,normalized})=>{
        const game=window.Taierzhuang;
        const snapshot=game.Debug.FirstPersonAnimation({clip,normalized,playing:false,clean:true});
        game.StepFrames(2);return snapshot;
      },{clip,normalized});
      await page.screenshot({path:path.join(output,`HanYang_${clip}_${normalized}.png`)});
      console.log(JSON.stringify({clip,normalized,residual:snapshot.gripResidual}));
    }
    assert.deepEqual(errors,[]);console.log('PASS deterministic FPS timeline, seek, pause, frame step and screenshots');
  }finally{await browser.close();server.close();}
}
