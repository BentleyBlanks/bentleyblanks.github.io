import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8136/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
const Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
try{for(const [width,height,touch] of [[1000,900,false],[390,844,true],[320,568,true],[844,390,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch}),cdp=await page.context().newCDPSession(page),report={width,height,checks:[],errors:[]};reports.push(report);
 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 async function Down(x,y){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await page.mouse.move(x,y);await page.mouse.down();}}
 async function Move(x,y){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});else await page.mouse.move(x,y);}
 async function Up(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
 try{
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  Check(!(await Probe()).settings.toolDrag,'fresh settings keep original controls');
  await page.locator('#welcome-settings').click();await page.locator('#tool-drag').check();await page.locator('#practice-type').selectOption('mixed');await page.screenshot({path:path.join(here,'_dev/Shot_ToolDragSettings_'+width+'.png')});
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings fit viewport');
  await page.locator('#practice-start').click();await Step(150);
  for(const id of ['scoop','tweezers','drops','brush','suction','feather']){
   await page.locator('[data-tool="'+id+'"]').click();await Step(1);
   const initial=(await Probe()).rendering;
   Check(initial.toolVisible,'parked '+id+' is visible');
   const box=await page.locator('#ear-canvas').boundingBox(),x=box.x+box.width*.52,y=box.y+box.height*.58;
   if(!touch){await page.mouse.move(x-50,y+30);await Step(4);Check(Distance(initial.toolPosition,(await Probe()).rendering.toolPosition)<1e-8,id+' ignores unpressed mouse movement');}
   await Down(x,y);await Step(2);let p=await Probe();
   Check(Distance(initial.toolPosition,p.rendering.toolPosition)<.001,id+' does not snap to pointer on press');
   const rotation=p.rendering.toolRotation;
   for(let i=1;i<=5;i++){await Move(x+i*5,y);await Step(2);}
   p=await Probe();Check(Distance(initial.toolPosition,p.rendering.toolPosition)>.015,id+' follows held displacement');
   Check(Distance(rotation,p.rendering.toolRotation)<1e-8,id+' preserves orientation during drag');
   await Up();await Step(2);const parked=(await Probe()).rendering;
   if(!touch)await page.mouse.move(x-75,y-20);await Step(8);p=await Probe();
   Check(!p.active&&!p.rendering.draggingTool&&p.rendering.toolVisible&&Distance(parked.toolPosition,p.rendering.toolPosition)<1e-8,id+' parks and releases input');
  }
  if(!touch){
   // Deterministic physical setup only. Selection and movement below use real mouse events at an offset.
   for(const id of ['scoop','tweezers','drops','feather']){
    await page.locator('[data-tool="'+id+'"]').click();await Step(1);
    const placed=await page.evaluate(id=>{const v=__EarSpaDebug.view;for(const c of v.chunks.filter(c=>c.fine===(id==='feather')&&c.depth<8)){
      v.SetToolDrag(false);v.ShowTool(c,id,0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,id,0,v.Project(c.mesh.position));
      const target=v.PickTool(id);if(target)return{id:target.id,position:v.RenderingProbe().toolPosition};
    }return null;},id);
    Check(!!placed,id+' has a real working-end contact');
    const c=(await Probe()).targets.find(c=>c.id===placed.id),box=await page.locator('#ear-canvas').boundingBox();
    const x=box.x+box.width*.8,y=box.y+box.height*.55;
    await Down(x,y);await Step(1);const p=await Probe();
    if(id==='drops')Check(p.events.at(-1).type==='soften'&&p.events.at(-1).id===placed.id,'drop applies to nozzle contact with pointer elsewhere');
    else Check(p.events.some(e=>e.type==='grab'&&e.id===placed.id&&e.tool===id),id+' acquires tool contact with pointer elsewhere');
    Check(Distance(placed.position,p.rendering.toolPosition)<.08,id+' contact does not teleport the tool');
    await Step(30);const held=await Probe();
    if(id==='drops')Check(held.events.filter(e=>e.type==='soften'&&e.id===placed.id).length===1,'stationary drop hold doses target once');
    else Check(!held.targets.find(t=>t.id===c.id).physics.detached,id+' stationary press does not auto-extract');
    await Up();await Step(5);
   }
   await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);
   await page.locator('[data-tool="scoop"]').click();await Step(1);
   // A softened fixture isolates real manual displacement and the existing delivery lifecycle.
   const setup=await page.evaluate(()=>{const v=__EarSpaDebug.view,c=v.chunks[0];c.wetting=c.softened=1;v.SetToolDrag(false);v.ShowTool(c,'scoop',0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,'scoop',0,v.Project(c.mesh.position));const p=v.Targets()[0];return{target:v.PickTool('scoop')?.id,dx:p.pullScreen.x-p.screen.x,dy:p.pullScreen.y-p.screen.y};});
   Check(setup.target===0,'softened spoon fixture has physical contact');
   const dragX=width*.65,dragY=height*.55;
   await page.mouse.move(dragX,dragY);await page.mouse.down({button:'right'});
   const normal=await page.evaluate(()=>__EarSpaDebug.view.chunks[0].normal.toArray());
   for(let i=0;i<90;i++){await Step(3);const facing=InstrumentContact('scoop',(await Probe()).rendering.toolRotation,normal).facing;if(facing>.4&&facing<.6)break;if(i===89)throw Error('manual spoon cannot turn its working face toward wax');}
   await page.mouse.up({button:'right'});
   await page.evaluate(()=>{const v=__EarSpaDebug.view,c=v.chunks[0];v.ShowTool(c,'scoop',0,v.Project(c.mesh.position));});
   await Down(dragX,dragY);await Step(20);
   Check(!(await Probe()).targets[0].physics.detached,'softened material also stays attached without motion');
   for(let i=1;i<=40;i++){await Move(dragX+setup.dx*i/30,dragY+setup.dy*i/30);await Step(6);if((await Probe()).targets[0].physics.detached)break;}
   let extracted=await Probe();Check(extracted.targets[0].physics.detached,'real offset dragging peels the softened wax');
   const contactPosition=extracted.rendering.toolPosition;await Up();await Step(235);extracted=await Probe();
   Check(extracted.harvest.some(c=>c.id===0),'release delivers manually extracted wax to the tray');
   Check(extracted.rendering.toolVisible&&Distance(extracted.rendering.toolPosition,contactPosition)<.08,'tool returns to parked canal position after delivery');
   await page.locator('[data-tool="scoop"]').click();await Step(1);const before=(await Probe()).rendering;
   await page.mouse.move(width*.6,height*.5);await page.mouse.down({button:'right'});await Step(20);let p=await Probe();Check(p.turning&&Distance(before.toolRotation,p.rendering.toolRotation)>.01,'right button still rotates parked tool');
   await page.mouse.up({button:'right'});const rotated=(await Probe()).rendering;await Step(10);Check(Distance(rotated.toolRotation,(await Probe()).rendering.toolRotation)<1e-8,'right release stops rotation');
  }
  await page.screenshot({path:path.join(here,'_dev/Shot_ToolDragGame_'+width+'.png')});
  const box=await page.locator('#ear-canvas').boundingBox();await Down(box.x+box.width*.5,box.y+box.height*.55);await Step(1);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await Up();Check(!(await Probe()).rendering.draggingTool&&!(await Probe()).active,'focus loss cancels drag');
  await page.locator('#settings-open').click();await page.locator('#tool-drag').uncheck();await page.locator('#settings-close').click();Check(!(await Probe()).rendering.toolDragMode,'switch restores default controls');
  await page.locator('#settings-open').click();await page.locator('#tool-drag').check();await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug);Check((await Probe()).settings.toolDrag,'choice survives reload');
  Check(report.errors.length===0,'no browser or resource errors');console.log('PASS tool drag '+width+': '+report.checks.length+' checks');
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev/Shot_ToolDragFailure_'+width+'.png')});throw error;}finally{await page.close();}
}}finally{await fs.writeFile(path.join(here,'_dev/Data_ToolDragPlayReport.json'),JSON.stringify(reports,null,2));await browser.close();}
