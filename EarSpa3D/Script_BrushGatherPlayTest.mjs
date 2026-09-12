import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8142/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const reports=[],Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of [[1000,900,false],[390,844,true],[320,568,true],[844,390,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
 const cdp=await page.context().newCDPSession(page),report={width,checks:[],errors:[]};reports.push(report);
 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);};
 const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 async function Down(x,y){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await page.mouse.move(x,y);await page.mouse.down();}}
 async function Move(x,y){if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await page.waitForFunction(({x,y})=>Math.abs(window.__BrushPointer?.x-x)<1&&Math.abs(window.__BrushPointer?.y-y)<1,{x,y});}else await page.mouse.move(x,y);}
 async function Up(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
 await page.evaluate(()=>{requestAnimationFrame=()=>0;document.querySelector('#ear-canvas').addEventListener('pointermove',e=>window.__BrushPointer={x:e.clientX,y:e.clientY});});
 await page.locator('#welcome-settings').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);
 await page.locator('[data-tool="brush"]').click();await Step(1);
 const x=width*.55,y=height*.55;
 const empty=(await Probe()).targets;
 await Down(x,y);await Move(x+8,y);await Step(1);await Up();
 Check((await Probe()).targets.every((c,i)=>Distance(c.position,empty[i].position)<1e-8),'air stroke cannot move debris');
 // Only set the initial contact pose. All gathering below is actual held mouse / touch displacement.
 const setup=await page.evaluate(()=>{
  const v=__EarSpaDebug.view,c=v.chunks.find(c=>c.id==='dust1');
  v.SetToolDrag(false);v.ShowTool(c,'brush',0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,'brush',0,v.Project(c.mesh.position));
  const a=v.Project(c.mesh.position),b=v.Project(c.mesh.position.clone().add({x:.65,y:0,z:0}));
  return{dx:b.x-a.x,dy:b.y-a.y};
 });
 const before=await Probe();await page.screenshot({path:path.join(here,'_dev','Shot_BrushBefore_'+width+'.png')});
 await Down(x,y);await Step(45);
 Check((await Probe()).targets.every((c,i)=>Distance(c.position,before.targets[i].position)<1e-8),'stationary brush does not gather or peel');
 for(let i=1;i<=24;i++){await Move(x+setup.dx*i/24,y+setup.dy*i/24);await Step(1);}
 let p=await Probe();report.movement=p.targets.map((c,i)=>({id:c.id,fine:c.fine,distance:Distance(c.position,before.targets[i].position)}));
 const moved=report.movement.filter(c=>c.fine&&c.distance>.03);
 Check(moved.length>0,'real brush motion pushes naturally placed fine debris');
 Check(!p.active&&!p.transfer&&p.cleanliness===before.cleanliness&&p.harvest.length===0,'gathering does not grip, extract or award cleaning');
 Check(p.targets.reduce((n,c)=>n+c.mass,0)===before.targets.reduce((n,c)=>n+c.mass,0),'gathering preserves every unit of mass');
 Check(report.movement.filter(c=>!c.fine).every(c=>c.distance<1e-8),'gathering leaves whole deposits in place');
 await Up();await Step(120);
 Check((await Probe()).targets.filter(c=>moved.some(m=>m.id===c.id)).every(c=>Distance(c.position,p.targets.find(t=>t.id===c.id).position)<1e-8),'released grains stay at the swept position');
 await page.screenshot({path:path.join(here,'_dev','Shot_BrushGather_'+width+'.png')});
 const audit=await page.evaluate(()=>__EarSpaDebug.view.AuditTool());report.audit=audit;
 Check(audit.fieldMinimum>=-.03&&audit.meshMinimum>=-.045,'brush respects the canal wall');
 await page.locator('[data-tool="feather"]').click();await Step(1);
 await page.evaluate(ids=>{const v=__EarSpaDebug.view,c=v.chunks.find(c=>ids.includes(c.id));v.SetToolDrag(false);v.ShowTool(c,'feather',0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,'feather',0,v.Project(c.mesh.position));},moved.map(c=>c.id));
 if(touch){await page.locator('#mode-turn').click();await Down(x,y);}else{await page.mouse.move(x,y);await page.mouse.down({button:'right'});}
 await Step(100);p=await Probe();
 Check(p.targets.some(c=>moved.some(m=>m.id===c.id)&&c.state==='held'),'feather can pick up brush-relocated debris');
 const held=p.targets.filter(c=>c.state==='held');
 Check(p.cleanliness===0,'held debris has no premature reward');
 if(touch)await Up();else await page.mouse.up({button:'right'});
 await Step(240);p=await Probe();
 Check(held.every(c=>p.harvest.filter(h=>h.id===c.id).length===1),'swept debris lands and is awarded exactly once');
 Check(Math.abs(p.cleanliness-held.reduce((n,c)=>n+c.mass,0)/9)<1e-8,'landing reward equals carried mass');
 if(!touch){
  await page.locator('#settings-open').click();await page.locator('#practice-start').click();await Step(150);
  await page.locator('[data-tool="brush"]').click();await Step(1);
  const dense=await page.evaluate(()=>{
   const v=__EarSpaDebug.view,source=v.chunks.find(c=>c.id==='dust1'),items=v.chunks.filter(c=>c.fine).slice(0,5);
   const origin=source.origin.clone(),normal=source.normal.clone(),rotation=source.rotation.clone();
   for(const [i,c] of items.entries()){
    const offset=normal.clone().cross({x:1,y:0,z:0}).normalize().multiplyScalar((i-2)*.14);
    c.origin.copy(origin).add(offset);c.mesh.position.copy(c.origin);c.rotation.copy(rotation);c.mesh.quaternion.copy(rotation);c.normal.copy(normal);c.depth=source.depth;
    c.body.position=c.origin.toArray();c.body.origin=c.origin.toArray();c.body.rotation=rotation.toArray();c.body.restRotation=rotation.toArray();
    c.body.anchors.forEach(a=>{a.rest=c.mesh.position.clone().add(offset.clone().fromArray(a.local).applyQuaternion(rotation)).toArray();});
   }
   v.SetToolDrag(false);v.ShowTool(items[2],'brush');v.SetToolDrag(true);v.ShowTool(items[2],'brush');
   const a=v.Project(origin),b=v.Project(origin.clone().add({x:1,y:0,z:0}));
   return{ids:items.map(c=>c.id),dx:b.x-a.x,dy:b.y-a.y};
  });
  const Spread=async()=>page.evaluate(ids=>{
   const cs=__EarSpaDebug.view.chunks.filter(c=>ids.includes(c.id)),center=cs[0].mesh.position.clone().set(0,0,0);
   cs.forEach(c=>center.add(c.mesh.position));center.divideScalar(cs.length);
   return cs.reduce((sum,c)=>sum+c.mesh.position.distanceToSquared(center),0)/cs.length;
  },dense.ids);
  const spreadBefore=await Spread(),denseBefore=(await Probe()).targets.filter(c=>dense.ids.includes(c.id));await Down(x,y);
  for(let i=1;i<=36;i++){await Move(x+dense.dx*i/36,y+dense.dy*i/36);await Step(1);}
  await Up();await Step(60);const spreadAfter=await Spread();report.gather={spreadBefore,spreadAfter,before:denseBefore,after:(await Probe()).targets.filter(c=>dense.ids.includes(c.id))};
  console.log('Dense spread',spreadBefore,spreadAfter);await page.screenshot({path:path.join(here,'_dev','Shot_BrushPile.png')});
  Check(spreadAfter<spreadBefore*.8,'one brush stroke gathers multiple separate patches into a tighter pile');
  Check((await Probe()).cleanliness===0,'a gathered pile is still uncleared');
  await page.screenshot({path:path.join(here,'_dev','Shot_BrushPile.png')});
  await page.evaluate(()=>{__EarSpaDebug.shop.state.toolLevels.gooseFeather=3;});
  await page.locator('[data-tool="feather"]').click();await Step(1);
  await page.evaluate(ids=>{
   const v=__EarSpaDebug.view,c=v.chunks.find(c=>c.id===ids[2]);
   v.SetToolDrag(false);v.ShowTool(c,'feather');v.SetToolDrag(true);v.ShowTool(c,'feather');
  },dense.ids);
  await page.mouse.move(x,y);await page.mouse.down({button:'right'});await Step(100);p=await Probe();
  const batch=p.targets.filter(c=>c.state==='held');report.gather.batch=batch.map(c=>c.id);
  Check(batch.filter(c=>dense.ids.includes(c.id)).length>=3&&batch.length<=6,'upgraded feather takes several brush-gathered patches in one batch');
  Check(p.cleanliness===0,'upgraded batch waits for landing to award cleaning');
  await page.mouse.up({button:'right'});await Step(240);p=await Probe();
  Check(batch.every(c=>p.harvest.filter(h=>h.id===c.id).length===1)&&Math.abs(p.cleanliness-batch.reduce((n,c)=>n+c.mass,0)/9)<1e-8,'entire gathered batch lands with exact mass and one reward per patch');
 }
 Check(report.errors.length===0,'clean probe: no console errors, exceptions or missing assets');
 await page.close();console.log('PASS brush gather viewport '+width);
}}finally{await fs.writeFile(path.join(here,'_dev','Report_BrushGather.json'),JSON.stringify(reports,null,2));await browser.close();}
