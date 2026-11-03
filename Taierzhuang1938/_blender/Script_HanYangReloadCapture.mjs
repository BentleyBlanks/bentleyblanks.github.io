// Capture what the HanYang reload clip is authored against, from the running game:
// camera (55 deg, 16:9), arms root and the viewmodel node chain in camera space, the
// idle (Idle clip frame 0) bones and controls, and the calibrated procedural reload
// (empty and partial packet, every 2nd frame at 60 fps) whose hand frames and finger
// shapes Script_HanYangReloadAuthor.py reuses. Writes <--out>/Data_Capture.json.
//   node Taierzhuang1938/_blender/Script_HanYangReloadCapture.mjs --out=<task folder> [--base-url=http://127.0.0.1:8080]
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
const Arg=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const folder=Arg('--out');if(!folder)throw Error('Required: --out=<task folder>');
const root=path.resolve(import.meta.dirname,'../..');
const server=Arg('--base-url')?null:await ServeRoot(root,0);
const base=Arg('--base-url')||`http://127.0.0.1:${server.address().port}`;
const browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto(`${base}/Taierzhuang1938/?weapons=1&manual=1&shot=1&quality=medium`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
 const capture=await page.evaluate(Capture);
 await fs.mkdir(folder,{recursive:true});
 await fs.writeFile(path.join(folder,'Data_Capture.json'),JSON.stringify(capture));
 console.log(`Captured idle + ${Object.keys(capture.runs).length} procedural reloads; fov ${capture.info.fov}`);
 // The knob grasp the clip uses: FPS_HAND_SHAPES.boltFist as the live bolt cycle solves it,
 // once just closed on the knob with the handle down and once with the handle lifted.
 await page.reload();await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
 const frames=await page.evaluate(CaptureBoltFist);
 const down=frames.find(f=>f.shape==='boltFist'&&f.next==='boltFist'&&f.turn<.01&&f.mix<.05),up=frames.find(f=>f.turn>Math.PI/2-1e-3);
 if(!down||!up)throw Error('boltFist grasp frames not found');
 await fs.writeFile(path.join(folder,'Data_BoltFistCapture.json'),JSON.stringify({source:'live HanYang bolt cycle, FPS_HAND_SHAPES.boltFist',down,up}));
 console.log(`boltFist grasp: frames ${down.i} (handle down) and ${up.i} (lifted)`);
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}

async function Capture(){
 const T=window.Taierzhuang,THREE=await import('three');
 T.Debug.OpenEditor('firstPerson');const e=T.editor.active;e.SetWeapon('HanYang');e.SetPose('hip');
 for(let i=0;i<90;i++)e.Update(1/60);
 const vm=T.viewmodel,a=vm.riggedArms,anim=vm.skeletalAnimation,asset=anim.assets.HanYang;
 const cam=T.camera||e.host.camera;
 const A=m=>m.toArray().map(v=>+v.toFixed(7));
 const camInv=()=>cam.matrixWorld.clone().invert();
 const boneObjs=asset.bones.map(n=>anim.boneMap.get(n.toLowerCase().replace(/[^a-z0-9]/g,'')));
 const ctrls=()=>({...anim.Controls(),packetProp:vm.packetProp,usedPacketProp:vm.usedPacketProp,packetRounds:vm.packetProp.userData.rounds,usedPacketRounds:vm.usedPacketProp.userData.rounds,gunRoot:vm.rig.group});
 const snap=(withBones=true)=>{vm.root.updateWorldMatrix(true,true);const ci=camInv(),ri=a.root.matrixWorld.clone().invert();
  const o={camRoot:A(ci.clone().multiply(a.root.matrixWorld)),controls:{}};
  for(const [k,obj] of Object.entries(ctrls())){if(!obj)continue;o.controls[k]={p:obj.position.toArray(),q:obj.quaternion.toArray(),s:obj.scale.toArray(),visible:obj.visible,parent:obj.parent?.name||obj.parent?.type,cam:A(ci.clone().multiply(obj.matrixWorld)),root:A(ri.clone().multiply(obj.matrixWorld))};}
  if(withBones)o.bones=boneObjs.map(b=>({l:[...b.position.toArray(),...b.quaternion.toArray()],root:A(ri.clone().multiply(b.matrixWorld))}));
  return o;};
 anim.SetPreview('Idle',{time:0,playing:false});vm.root.updateWorldMatrix(true,true);
 const chain=[];for(let o=a.root;o;o=o.parent){chain.push({name:o.name||o.type,p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()});if(o===cam)break;}
 const gunChain=[];for(let o=vm.rig.group;o;o=o.parent){gunChain.push({name:o.name||o.type,p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()});if(o===cam)break;}
 const boltChain=[];for(let o=vm.rig.parts.bolt;o&&o!==vm.rig.group;o=o.parent)boltChain.push({name:o.name||o.type,p:o.position.toArray(),q:o.quaternion.toArray()});
 const idle=snap();
 const info={fov:cam.fov,aspect:cam.aspect,near:cam.near,bones:asset.bones,chain,gunChain,boltChain,boltTravel:vm.rig.boltTravel,lift:vm._BoltLiftAngle(),clipSeat:vm.rig.clipSeat?.toArray?.(),
  packetUser:Object.fromEntries(Object.entries(vm.packetProp.userData).filter(([k,v])=>typeof v!=='object')),parts:Object.keys(vm.rig.parts),reloadTimeS:vm.weapon.reloadTimeS};
 // procedural reloads (the shipped Reload clip is switched off for these runs)
 vm.skeletalAnimation.ReloadSpec=()=>null;
 const runs={};
 for(const [name,rounds] of [['empty',0],['tactical',3]]){
  e.SetPose('hip');anim.preview=null;anim.current=null;for(let i=0;i<30;i++)e.Update(1/60);
  e.Trigger('reload',{remainingRounds:rounds});const dur=vm.action.duration;const frames=[];let t=0;
  for(let i=0;i<=Math.round(dur*60)+6;i++){if(i%2===0)frames.push({t:+t.toFixed(4),boltOpen0:vm.action?.startedOpen,...snap(true)});e.Update(1/60);t+=1/60;}
  runs[name]={duration:dur,frames};
 }
 return {info,idle,runs};
}

async function CaptureBoltFist(){
 const T=window.Taierzhuang;T.Debug.OpenEditor('firstPerson');const e=T.editor.active;e.SetWeapon('HanYang');e.SetPose('hip');T.StepFrames(90,1/60,true);
 const vm=T.viewmodel,a=vm.riggedArms,an=vm.skeletalAnimation,asset=an.assets.HanYang;
 const bones=asset.bones.map(n=>an.boneMap.get(n.toLowerCase().replace(/[^a-z0-9]/g,'')));
 const A=m=>m.toArray().map(v=>+v.toFixed(7));
 vm.TriggerFire();const out=[];
 for(let i=0;i<150&&(i<5||vm.action);i++){T.StepFrames(1,1/60,true);vm.root.updateWorldMatrix(true,true);
  const ri=a.root.matrixWorld.clone().invert(),b=vm.rig.parts.bolt,op=a.operationPose.r;
  out.push({i,turn:b.rotation.z,slide:b.position.z,shape:op?.shape,next:op?.nextShape,mix:op?.shapeMix,
   bolt:A(ri.clone().multiply(b.matrixWorld)),bones:bones.map(x=>({root:A(ri.clone().multiply(x.matrixWorld))}))});}
 return out;
}
