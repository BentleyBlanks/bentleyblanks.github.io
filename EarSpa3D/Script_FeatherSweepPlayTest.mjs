import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {FeatherCapacity} from './Script_FeatherSweep.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={checks:[],errors:[],runs:[]};
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try {
 Check([1,2,3,4,5].every(level=>FeatherCapacity(level)===[1,3,6,9,12][level-1]),'five upgrade capacities');
 for(const [width,height,touch] of [[1000,900,false],[390,844,true],[320,568,true],[844,390,true]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),cdp=await page.context().newCDPSession(page);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  const Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Probe=()=>page.evaluate(()=>__EarSpaProbe());
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});await page.evaluate(()=>{requestAnimationFrame=()=>0;});
  await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);await page.locator('[data-tool="feather"]').click();
  async function Down(t){if(touch){await page.locator('#mode-turn').click();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.screen.x,y:t.screen.y}]});}else{await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down({button:'right'});}}
  async function Up(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up({button:'right'});}
  async function Fixture(level,dense=false){
   await page.evaluate(({level,dense})=>{
    const {view,shop}=__EarSpaDebug;view.Reset(20260911,'mixed');view.Enter();shop.state.toolLevels.gooseFeather=level;
    view.SetSkins(shop.Snapshot().inventory.equipped,{scoop:1,tweezers:1,drops:1,brush:1,suction:1,feather:level});
    if(dense){const source=view.chunks.find(c=>c.id==='dust1');
     // Twelve separate patches at one known wall contact exercise the cap, not acquisition via debug APIs.
     for(const [i,c] of view.chunks.filter(c=>c.fine&&c!==source).slice(0,11).entries()){
      const offset=source.normal.clone().cross({x:0,y:1,z:0}).multiplyScalar((i-5)*.012);
      c.origin.copy(source.origin).add(offset);c.mesh.position.copy(c.origin);c.rotation.copy(source.rotation);c.mesh.quaternion.copy(c.rotation);c.normal.copy(source.normal);c.depth=source.depth;
      c.body.position=c.origin.toArray();c.body.origin=c.origin.toArray();c.body.rotation=c.rotation.toArray();c.body.restRotation=c.rotation.toArray();c.body.anchors.forEach(a=>{a.rest=c.origin.toArray();});
     }
    }
   },{level,dense});await Step(150);
   await page.evaluate(()=>{const v=__EarSpaDebug.view,c=v.chunks.find(c=>c.id==='dust1');v.SetToolDrag(false);v.ShowTool(c,'feather',0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,'feather',0,v.Project(c.mesh.position));});
   return(await Probe()).targets.find(c=>c.id==='dust1');
  }
  // Natural layout: the real broadened feather must reach multiple independent neighbours.
  let t=await Fixture(5);const cleanBefore=(await Probe()).cleanliness;
  await Down(t);Check((await Probe()).rendering.featherSweep.held===0,width+': pressing alone does not collect');
  await Step(65);let p=await Probe();const held=p.targets.filter(c=>c.state==='held');
  Check(held.length>=2&&held.length<=FeatherCapacity(5),width+': one real rotation picks up multiple natural patches');
  Check(held.every(c=>c.fine)&&p.targets.filter(c=>!c.fine).every(c=>c.state==='attached'),width+': large wax is never swept');
  Check(p.cleanliness===cleanBefore,width+': holding a batch awards no cleaning');
  if(width===1000){const shapeError=await page.evaluate(()=>{const part=__EarSpaDebug.core.scene.getObjectByName('Model_FeatherTuft'),p=part.geometry.attributes.position,rest=part.userData.fiberRest;let error=0;for(const ring of part.geometry.userData.featherRings){const a=ring[0];for(const b of ring.slice(1)){const before=Math.hypot(rest[a*3]-rest[b*3],rest[a*3+1]-rest[b*3+1],rest[a*3+2]-rest[b*3+2]),after=Math.hypot(p.getX(a)-p.getX(b),p.getY(a)-p.getY(b),p.getZ(a)-p.getZ(b));error=Math.max(error,Math.abs(before-after));}}return{error,ringSize:Math.min(...part.geometry.userData.featherRings.map(r=>r.length))};});Check(shapeError.error<1e-5&&shapeError.ringSize===4,'wall bending keeps feather cross sections round instead of crushing them into strips');report.crossSectionError=shapeError;}
  const audit=await page.evaluate(()=>__EarSpaDebug.view.AuditTool());Check(audit.fieldMinimum>=-.03&&audit.meshMinimum>=-.04,width+': upgraded fibers stay inside wall');
  if(width===1000)await page.screenshot({path:path.join(here,'_dev','Shot_FeatherSweep.png')});
  if(width===390)await page.screenshot({path:path.join(here,'_dev','Shot_FeatherSweepMobile.png')});
  await Up();p=await Probe();Check(!p.turning&&p.transfer?.batch.length===held.length-1,width+': release starts one batch extraction');
  await Step(240);p=await Probe();
  Check(held.every(c=>p.harvest.filter(h=>h.id===c.id).length===1),width+': each swept patch is awarded exactly once on landing');
  Check(Math.abs(p.cleanliness-cleanBefore-held.reduce((sum,c)=>sum+c.mass,0)/9)<1e-8,width+': batch mass matches cleaning reward');
  const coins=p.shop.coins,clean=p.cleanliness;await Step(60);Check((await Probe()).shop.coins===coins&&(await Probe()).cleanliness===clean,width+': no repeated batch award');
  report.runs.push({width,naturalBatch:held.map(c=>c.id),audit});
  // Reset only the fixture and stop before transfer to avoid reusing harvested ids in the game state.
  for(const level of width===1000?[1,2,3,4,5]:[1]){
   t=await Fixture(level,true);await Down(t);await Step(100);p=await Probe();
   Check(p.rendering.featherSweep.held===FeatherCapacity(level),width+': level '+level+' caps dense real contact at '+FeatherCapacity(level));
   const count=p.rendering.featherSweep.held;await Step(100);Check((await Probe()).rendering.featherSweep.held===count,width+': holding rotation cannot exceed level '+level+' capacity');
   Check(p.targets.filter(c=>c.state==='held').every(c=>c.fine),width+': capacity excludes large deposits');
   await Up();await page.evaluate(()=>__EarSpaDebug.view.EndService());await Step(1);
  }
  if(width===1000){
   await Fixture(1);await page.locator('#shop-open').click();await page.locator('[data-select-tool="feather"]').click();
   Check((await page.locator('.upgrade-benefit').innerText()).includes('1 → 3 组微屑'),'shop shows concrete upgrade capacity');
   await page.evaluate(()=>{__EarSpaDebug.shop.state.coins=1000;});await page.locator('[data-select-tool="feather"]').click();await page.locator('[data-upgrade="gooseFeather"]').click();
   Check((await Probe()).shop.toolLevels.gooseFeather===2&&(await Probe()).rendering.featherSweep.capacity===3,'real purchase applies feather capacity');
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('earspa3d.shop.v1')).toolLevels.gooseFeather);Check(saved===2,'upgrade persists in the existing save');
   await page.locator('[data-preview-view="tip"]').click();await page.screenshot({path:path.join(here,'_dev','Shot_FeatherFur.png')});
   await page.locator('#shop-close').click();await Fixture(5);await page.locator('#shop-open').click();await page.locator('[data-select-tool="feather"]').click();await page.locator('[data-preview-view="tip"]').click();await page.screenshot({path:path.join(here,'_dev','Shot_FeatherFurMaster.png')});await page.locator('#tool-preview').screenshot({path:path.join(here,'_dev','Shot_FeatherFurDetail.png')});await page.locator('#shop-close').click();
   // Shared deformation and six extra passes, with visible pixel contribution and stable strand coordinates after previews.
   t=(await Probe()).targets.find(c=>c.id==='dust1');await page.mouse.move(t.screen.x,t.screen.y);await Step(1);
   const fur=await page.evaluate(()=>{const {core,view}=__EarSpaDebug,part=core.scene.getObjectByName('Model_FeatherTuft'),beforeUv=part.geometry.attributes.featherUv.array.slice(),beforePose=part.geometry.attributes.position.array.slice();view.ShowTool(view.chunks.find(c=>c.id==='dust11'),'feather');
    const shells=part.children.filter(c=>c.userData.featherShell),gl=core.renderer.getContext();
    function Pixels(){core.Render();const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
    const on=Pixels(),calls=core.renderer.info.render.calls;shells.forEach(c=>c.visible=false);const off=Pixels(),without=core.renderer.info.render.calls;shells.forEach(c=>c.visible=true);let changed=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>9)changed++;
    return{count:shells.length,shared:shells.every(c=>c.geometry===part.geometry),stable:part.geometry.attributes.featherUv.array.every((v,i)=>v===beforeUv[i]),deformed:part.geometry.attributes.position.array.some((v,i)=>Math.abs(v-beforePose[i])>1e-6),drawCalls:calls-without,changed};});
   Check(fur.count===6&&fur.shared&&fur.drawCalls===6,'fur shares collision-deformed geometry across six passes');Check(fur.changed>100,'shell fur changes visible pixels');Check(fur.stable&&fur.deformed,'continuous fiber coordinates stay attached while the contact mesh bends');report.fur=fur;
  }
  await page.close();console.log('PASS feather sweep viewport '+width);
 }
 Check(report.errors.length===0,'clean browser probe: no errors or failed assets');
 console.log('PASS '+report.checks.length+' feather sweep and fur checks');
}finally{await fs.writeFile(path.join(here,'_dev','Report_FeatherSweep.json'),JSON.stringify(report,null,2));await browser.close();}
