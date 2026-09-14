import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const project=path.dirname(fileURLToPath(import.meta.url));
const shots=path.join(project,"_shots","CharacterWounds");fs.mkdirSync(shots,{recursive:true});
const server=await ServeRoot(path.resolve(project,".."),0), browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_BLOCKED_BY_CLIENT/.test(m.text()))errors.push(m.text());});
try {
 await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,r=>r.abort('blockedbyclient'));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?gore=1&shot=1&manual=1&quality=high&scale=small`,{waitUntil:'load',timeout:180000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready&&Taierzhuang.state.running&&Taierzhuang.Debug.GoreRange,null,{timeout:180000});
 console.log('READY');
 await page.evaluate(()=>{Taierzhuang.Debug.GoreRange.Reset();Taierzhuang.StepFrames(20,1/60,true);const s=Taierzhuang.ai.soldiers[0];Taierzhuang.ai.Spawn("nra",s.position.x-4,s.position.z,{dummy:true,unarmed:true});Taierzhuang.StepFrames(10,1/60,true);});
 const inventory=await page.evaluate(()=>Taierzhuang.ai.soldiers.map(s=>({id:s.id,side:s.side,model:s.actor?.modelId})));
 console.log('CAST',JSON.stringify(inventory.slice(0,10)));
 for(const side of ['nra','ija']) {
  const setup=await page.evaluate(side=>{
   const T=Taierzhuang,s=T.ai.soldiers.find(s=>s.side===side&&s.alive&&s.actor?.characterRig);
   if(!s)return null;window.__woundSoldier=s;s.scriptEssential=true;
   const p=T.player;s.yaw=0;s.stance=0;s.crouchBlend=0;
   p.Spawn(s.position.x,s.position.z-2.4,Math.PI);T.StepFrames(12,1/60,true);
   const target=s.actor.GetBoneHitboxes().find(h=>h.id==='upperTorso');
   const point=target.start.clone().lerp(target.end,.5);
   p.pitch=Math.atan2(point.y-p.position.y-p.eyeHeight,2.4);T.StepFrames(5,1/60,true);
   return {id:s.id,model:s.actor.modelId};
  },side);
  assert(setup,`real ${side} actor`);
  await page.screenshot({path:path.join(shots,`Scene_${side}_Clean.png`)});
  const hit=await page.evaluate(()=>{
   const T=Taierzhuang,s=window.__woundSoldier,shapes=s.actor.GetBoneHitboxes();
   window.__otherMaterial=T.ai.soldiers.find(o=>o!==s&&o.side===s.side)?.actor?.characterRig?.root;
   const dir=s.position.clone().set(0,0,1);
   for(const shapeId of ['upperTorso','forearmL','thighR']) {
    const h=shapes.find(h=>h.id===shapeId),point=h.start.clone().lerp(h.end,.5).addScaledVector(dir,-.07);
    s.TakeHit(2,'upperTorso'===shapeId?'torso':'limb',dir,{kind:'bullet',shapeId,point});
   }
   const w=s.actor.woundBlood;T.StepFrames(2,1/60,true);
   const coverage=[...w.records.values()].map(r=>{
    const attr=r.mesh.geometry.attributes.woundRestPosition,vs=r.uniforms.uClothWounds.value;
    let stained=0;
    for(let i=0;i<attr.count;i++)if(vs.some(v=>v.w>0&&Math.hypot(attr.getX(i)-v.x,attr.getY(i)-v.y,attr.getZ(i)-v.z)<v.w))stained++;
    return stained/attr.count;
   });
   return {coverage,count:w.count,materials:w.records.size,private:[...w.records.values()].every(r=>r.material!==r.original)};
  });
  console.log(side,JSON.stringify(hit));assert.equal(hit.count,3);assert(hit.private);assert(hit.coverage.every(f=>f>0&&f<.22),'wounds must stay local instead of repainting the entire wearer');
  await page.screenshot({path:path.join(shots,`Scene_${side}_Fresh.png`)});
  await page.evaluate(()=>{window.__woundSoldier.actor.woundBlood.Update(8);Taierzhuang.StepFrames(2,1/60,true);});
  await page.screenshot({path:path.join(shots,`Scene_${side}_Soaked.png`)});
  const aged=await page.evaluate(()=>{
   const w=window.__woundSoldier.actor.woundBlood;
   const rest=[...w.records.values()].map(r=>r.uniforms.uClothWounds.value.map(v=>v.toArray()));
   w.Update(90);Taierzhuang.StepFrames(3,1/60,true);
   return {rest,after:[...w.records.values()].map(r=>r.uniforms.uClothWounds.value.map(v=>v.toArray())),
    age:[...w.records.values()].flatMap(r=>r.born.map((_,i)=>r.uniforms.uClothWoundAge.value[i].x))};
  });
  assert.deepEqual(aged.after,aged.rest,'animation and time cannot slide the bind-space stain');
  assert(aged.age.every(t=>t>90));
  await page.screenshot({path:path.join(shots,`Scene_${side}_Dry.png`)});
 }
 const player=await page.evaluate(()=>{
  const T=Taierzhuang,p=T.player;p.debug.invincible=false;p.spawnGrace=0;p.health=100;
  p.TakeHit(2,'arm',null,{bullet:true,shapeId:'forearmL'});
  p.TakeHit(2,'leg',null,{bullet:true,shapeId:'thighR'});
  p.TakeHit(2,'torso',null,{bullet:true});
  p.pitch=-1.35;p.stance='stand';T.StepFrames(45,1/60,true);
  const sets=[...T.viewmodel.woundBlood.values()];sets.forEach(w=>w.Update(8));T.StepFrames(2,1/60,true);
  return sets.map(w=>({root:w.root.name,count:w.count,meshes:[...w.records.values()].map(r=>({name:r.mesh.name,material:Array.isArray(r.material)?r.material.map(m=>m.name):r.material.name}))}));
 });
 console.log('PLAYER',JSON.stringify(player));assert(player.every(w=>w.count>0));assert(player.length>=2);
 assert(await page.evaluate(()=>{
  const T=Taierzhuang,w=T.viewmodel.woundBlood.get(T.viewmodel.riggedArms.root);
  return [...w.records.values()].some(r=>(Array.isArray(r.material)?r.material:[r.material])
    .some(m=>m.userData.externalMaterialClass==='cloth' || !!m.userData.nraUniformPalette));
 }),'the active weapon arms must show seepage on the sleeve, not only covered skin');
 await page.screenshot({path:path.join(shots,'Scene_Player_LookDown.png')});
 await page.evaluate(()=>{Taierzhuang.player.pitch=0;Taierzhuang.StepFrames(45,1/60,true);});
 await page.screenshot({path:path.join(shots,'Scene_Player_Arms.png')});

 const death=await page.evaluate(()=>{
  const T=Taierzhuang,s=window.__woundSoldier;s.scriptEssential=false;
  const before=s.actor.woundBlood.count;
  s.TakeHit(300,'torso',null,{kind:'bullet',shapeId:'upperTorso'});
  T.StepFrames(45,1/60,true);
  return {alive:s.alive,count:s.actor.woundBlood.count,before};
 });assert.equal(death.alive,false);assert(death.count>death.before);
 await page.screenshot({path:path.join(shots,'Scene_Corpse_Wounds.png')});
 const lifecycle=await page.evaluate(()=>{
  const T=Taierzhuang,p=T.player;
  const old=[...T.viewmodel.woundBlood.values()].map(w=>w.count);
  // Bandaging changes bleeding, never the clothing history.
  p.bleeding=0;p.wounds=[];T.StepFrames(3,1/60,true);
  const retained=[...T.viewmodel.woundBlood.values()].map(w=>w.count);
  p.Spawn(p.position.x,p.position.z,p.yaw);
  return {old,retained,cleared:T.viewmodel.woundBlood.size};
 });
 assert.deepEqual(lifecycle.old,lifecycle.retained);assert.equal(lifecycle.cleared,0);
 const capacity=await page.evaluate(()=>{
  const s=window.__woundSoldier,w=s.actor.woundBlood;
  for(let i=0;i<30;i++)s.TakeHit(1,'torso',null,{kind:'bullet',shapeId:'upperTorso'});
  return [...w.records.values()].map(r=>r.uniforms.uClothWounds.value.length);
 });assert(capacity.every(n=>n===12));
 assert.deepEqual(errors,[],'real GPU shaders and game must remain error-free');
 console.log('CharacterWoundsTest OK');
}finally{await browser.close();server.close();}
