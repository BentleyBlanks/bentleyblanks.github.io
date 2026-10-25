// Production defaults, not a diagnostic TakeWeapon override. Both arm paths
// must use the same authored gun; a missing GLB must not resurrect a TZM rig.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {BLOCKOUT_PHASES} from './Script_EditorBlockoutLevels.mjs';
import {DEFAULT_PLAYER_WEAPON} from './Data_Weapons.mjs';
assert(BLOCKOUT_PHASES.every(phase=>phase.loadoutOverride.primary===DEFAULT_PLAYER_WEAPON));
const out=path.join(import.meta.dirname,'_shots/HanYang173RDefault');await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(import.meta.dirname,'..'),0),browser=await LaunchBrowser(),rows=[];
try{
 for(const arms of ['rigged','legacy']){
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],requests=[],expectedMissing=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{
   if(m.type()!=='error')return;
   const url=m.location()?.url||'';
   // ServeRoot deliberately has no LocalPreview save endpoint, as covered by
   // EditorBlockoutBrowserTest. Asset errors are never filtered here.
   if(/\/__blockout\/status$/.test(url)&&/404/.test(m.text()))expectedMissing.push(url);
   else errors.push(`${m.text()} @ ${url}`);
  });
  page.on('request',r=>{if(/Model_HanYang\.tzm/.test(r.url()))requests.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&quality=whitebox&manual=1&shot=1&scale=small&audio=0&arms=${arms}`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready&&window.Taierzhuang?.Debug?.Blockout?.State().ready,null,{timeout:360000});
  const row=await page.evaluate(async()=>{
   const g=window.Taierzhuang,vm=g.viewmodel;
   await g.Debug.Blockout.GoTo('03-2',{animate:false});g.StepFrames(90);
   const meshes=[];vm.rig.group.traverse(o=>{if(o.userData.hanYang173RPart)meshes.push(o);});
   const world=g.actorFactory.WeaponGeometry('HanYang');
   const {MeasureHanYangPixels}=await import('./_import/Script_HanYang173RPixelProbe.mjs');
   const surfaces=MeasureHanYangPixels(g);g.StepFrames(1);
   return {primary:g.state.slots.primary,identity:g.state.identity.weapon,weapon:vm.weaponId,version:vm.rig.assetVersion,surfaces,
    riggedArms:!!vm.riggedArms,parts:meshes.length,triangles:meshes.reduce((n,o)=>n+(o.geometry.index?.count||o.geometry.attributes.position.count)/3,0),
    worldTriangles:[...world.geometries.values()].reduce((n,o)=>n+(o.index?.count||o.attributes.position.count)/3,0),
    legacyDocument:g.actorFactory.meshDocs.has('HanYang'),glError:g.renderer.getContext().getError()};
  });rows.push({arms,...row,errors,requests,expectedMissing});
  assert.equal(row.primary,'HanYang');assert.equal(row.identity,'HanYang');assert.equal(row.weapon,'HanYang');
  assert.equal(row.version,'173R-20261025');assert.equal(row.parts,44);assert.equal(row.triangles,59901);assert.equal(row.worldTriangles,59901);
  assert(row.surfaces.metal.pixels>1000&&row.surfaces.wood.pixels>1000,'authored gun is actually visible in the editor, not just loaded');
  assert.equal(row.legacyDocument,false);assert.equal(row.riggedArms,arms==='rigged');assert.equal(row.glError,0);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await page.screenshot({path:path.join(out,`Scene_${arms}.png`)});await page.close();
  console.log(`ok default blockout ${arms}: 59901 triangles, 44 parts, no retired gun request`);
 }
 const page=await browser.newPage(),requests=[];
 page.on('request',r=>{if(/Model_HanYang\.tzm/.test(r.url()))requests.push(r.url());});
 await page.route('**/Model/HanYang173R/Model_HanYang173R.glb*',route=>route.fulfill({status:503,body:'Deliberate asset failure'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=blockout&level=FirstLevel0105&manual=1&shot=1&scale=small&audio=0`,{timeout:120000});
 await page.waitForFunction(()=>/173R.*模型载入失败/.test(document.getElementById('bootStep')?.textContent||''),null,{timeout:120000});
 const failure=await page.evaluate(()=>({message:document.getElementById('bootStep').textContent,ready:!!window.Taierzhuang?.state?.ready,weapon:window.Taierzhuang?.viewmodel?.weaponId??null}));
 assert.equal(failure.ready,false);assert.equal(failure.weapon,null);assert.deepEqual(requests,[]);rows.push({failure,requests});
 console.log('ok missing authored GLB: explicit retry error, no retired/procedural gun');
 await page.close();
}finally{await fs.writeFile(path.join(out,'Data_DefaultAcceptance.json'),JSON.stringify(rows,null,2));await browser.close();await new Promise(r=>server.close(r));}
