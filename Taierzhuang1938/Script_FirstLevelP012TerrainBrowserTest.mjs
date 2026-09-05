// Isolated terrain/capsule/crater fixture inside the real P012 scene.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {SCENE_RENDER_LIMITS} from './Data_AssetStandards.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(os.tmpdir(),'P012TerrainReview');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high`,{timeout:120000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
 const soil=await page.evaluate(async()=>{
  const t=window.Tengxian,field=t.battlefield,THREE=await import('/Taierzhuang1938/vendor/three/build/three.module.js');
  t.StepFrames(2,1/30,true);
  const down=new THREE.Vector3(0,-1,0),ray=new THREE.Raycaster();
  const Measure=(x,z)=>{
   const h=field.GroundHeight(x,z),origin=new THREE.Vector3(x,h+20,z);
   ray.set(origin,down);t.scene.updateMatrixWorld(true);
   const hits=ray.intersectObjects([...field.deformation.sources,...field.deformation.tileMeshes.values()],false);
   const physical=field.Raycast(origin,down,25,{terrain:true});
   return {x,z,h,render:hits[0]?.point.y,physical:physical?origin.y-physical.t:null};
  };
  const samples=[];
  for(let x=-160;x<=160;x+=20)for(let z=-180;z<=140;z+=20)
   if(field.NearbyColliders(x,z,3).length===0)samples.push(Measure(x+.17,z+.31));
  const start=samples.find(p=>p.h>.8&&field.NearbyColliders(p.x,p.z-7,16).length===0
    &&Math.abs(field.GroundHeight(p.x,p.z-12)-p.h)>.35);
  if(!start)throw new Error('No clear slope fixture');
  // Move the actual player capsule, isolated from the opening train director.
  const body=t.player.body;body.Teleport(start.x,start.h,start.z);body.grounded=true;
  const walk=[];
  for(let i=0;i<240;i++){
   body.Move(0,-.04,-.05);
   const p=body.position;walk.push({y:p.y,ground:field.GroundHeight(p.x,p.z),x:p.x,z:p.z});
  }
  const at=new THREE.Vector3(start.x,start.h,start.z),before=Measure(at.x,at.z);
  for(const e of document.body.children)if(e.tagName!=='CANVAS')e.style.setProperty('display','none','important');
  const Show=()=>{t.camera.position.set(at.x+11,at.y+5,at.z+15);t.camera.lookAt(at.x,at.y-.3,at.z-3);t.scene.updateMatrixWorld(true);t.renderer.render(t.scene,t.camera);};
  window.terrainReview={t,field,THREE,Measure,at,Show};Show();
  return {samples,walk,before,stats:field.stats,render:t.renderer.info.render};
 });
 assert.ok(soil.stats.groundChunks>1&&soil.stats.groundTris===304200);
 assert.ok(soil.samples.length>10&&soil.samples.every(p=>Math.abs(p.h-p.render)<.002&&Math.abs(p.h-p.physical)<.02));
 assert.ok(soil.walk.every(p=>Math.abs(p.y-p.ground)<.04),'actual capsule stays on visible slope');
 assert.ok(Math.abs(soil.walk.at(-1).y-soil.walk[0].y)>.35,'capsule traverses a height change');
 assert.ok(soil.render.calls<SCENE_RENDER_LIMITS.drawCalls&&soil.render.triangles<SCENE_RENDER_LIMITS.triangles);
 await page.screenshot({path:path.join(out,'Terrain_Before.png')});
 const crater=await page.evaluate(()=>{
  const {t,field,at,Measure,Show}=window.terrainReview;
  field.deformation.ApplyBlast(at,'Shell75');field.deformation.Flush();Show();
  return {after:Measure(at.x,at.z),tiles:field.deformation.tileMeshes.size,physicsTiles:field.physics.terrainTiles.size};
 });
 assert.ok(crater.after.h<soil.before.h-.1,'blast excavates sloped soil');
 assert.ok(Math.abs(crater.after.render-crater.after.h)<.003,'no original terrain lid covers the crater');
 assert.ok(Math.abs(crater.after.physical-crater.after.h)<.02,'crater collision shares the rendered height');
 assert.ok(crater.tiles>0&&crater.physicsTiles===crater.tiles);
 await page.screenshot({path:path.join(out,'Terrain_Crater.png')});
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_TerrainReview.json'),JSON.stringify({soil,crater},null,2));
 console.log('PASS P012 actual terrain rendering, capsule slope traversal, crater render/collision and budget',JSON.stringify({samples:soil.samples.length,stats:soil.stats,render:soil.render,crater,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
