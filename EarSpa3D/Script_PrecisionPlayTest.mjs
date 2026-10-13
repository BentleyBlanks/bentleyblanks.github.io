import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
assert.ok(url,'pass --url= for this worktree preview');
const width=Number(process.argv.find(a=>a.startsWith('--width='))?.slice(8)||1280),height=width===1280?720:900;
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const page=await browser.newPage({viewport:{width,height}}),report={width,height,checks:[],errors:[],evidence:'Natural seeded wax; only animation time is controlled. All instrument positioning, rotation, softening, gripping, withdrawal and release use real mouse/keyboard events.'};
const out=path.join(here,'_dev');await fs.mkdir(out,{recursive:true});
const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
const Distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
function Check(ok,label){assert.ok(ok,label);report.checks.push(label);}
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
let cursor={x:width*.51,y:height*.49};
async function Rebase(){await page.mouse.move(-10,-10);const p=await Probe();cursor={x:p.stage.x+p.rendering.toolScreen.x,y:p.stage.y+p.rendering.toolScreen.y};await page.mouse.move(cursor.x,cursor.y);}
async function MoveToWorld(target,count=80){
  await Rebase();
  for(let i=0;i<count;i++){
    const command=await page.evaluate(({target,left})=>{
      const p=__EarSpaProbe(),camera=__EarSpaDebug.core.camera,m=camera.matrixWorld.elements,forward=[-m[8],-m[9],-m[10]];
      const Dot=(a,b)=>a.reduce((sum,x,k)=>sum+x*b[k],0),delta=target.map((x,k)=>x-p.rendering.toolPosition[k]);
      const next=camera.position.clone().fromArray(p.rendering.toolPosition.map((x,k)=>x+delta[k]/left)),screen=__EarSpaDebug.view.Project(next);
      return{x:screen.x+p.stage.x-(p.input.offset?.x||0),y:screen.y+p.stage.y-(p.input.offset?.y||0),screen,depth:Dot(delta,forward)/left};
    },{target,left:count-i});
    if(command.x<width*.1||command.x>width*.87||command.y<height*.12||command.y>height*.89){await Rebase();const p=await Probe();command.x=command.screen.x+p.stage.x-(p.input.offset?.x||0);command.y=command.screen.y+p.stage.y-(p.input.offset?.y||0);}
    cursor={x:command.x,y:command.y};await page.mouse.move(cursor.x,cursor.y);
    if(Math.abs(command.depth)>.0005)await page.mouse.wheel(0,command.depth/.004);await Step(1);
  }
  return Probe();
}
async function Select(id){await page.locator(`[data-tool="${id}"]`).click();await Step(1);await page.locator('#ear-canvas').focus();}
async function Practice(){await page.keyboard.up('Space');await page.locator((await Probe()).phase==='ready'?'#welcome-settings':'#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);}
async function Shot(name){await page.screenshot({path:path.join(out,'Shot_Precision'+name+'_'+width+'.png')});}
try{
  await page.addInitScript(()=>{localStorage.setItem('earspa3d.calm.settings',JSON.stringify({toolDrag:false,controlScheme:'click',master:.8,sfx:.85,bgm:.16,haptics:false,muted:true}));});
  await page.goto(url+(url.includes('?')?'&':'?')+'debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await Practice();let p=await Probe();report.version=p.version;
  Check(p.controlScheme==='precision'&&p.settings.toolDrag,'legacy click settings migrate to manual controls');
  const income=p.shop.coins;await Select('tweezers');await Rebase();const parked=(await Probe()).rendering.toolPosition;
  await page.mouse.click(cursor.x,cursor.y);await Step(120);p=await Probe();
  Check(p.active===null&&p.cleanliness===0&&Distance(parked,p.rendering.toolPosition)<.001,'a stationary click never commands an extraction or approach');
  const initialAnchors=p.targets.map(c=>c.physics.anchors),open=p.rendering.jawOpening;
  await page.keyboard.down('Space');await Step(90);p=await Probe();
  Check(p.active===null&&p.rendering.jawOpening.every((v,i)=>v<open[i]*.2),'empty tips close visibly without latching distant wax');
  Check(p.targets.every((c,i)=>c.physics.anchors===initialAnchors[i])&&p.cleanliness===0,'stationary empty closure cannot damage or collect wax');
  await page.keyboard.up('Space');await Step(12);await Rebase();
  await page.mouse.move(cursor.x+30,cursor.y);await Step(1);p=await Probe();
  Check(Distance(parked,p.rendering.toolPosition)>.1&&p.active===null,'hover movement freely moves the actual tool');
  const beforeTurn=p.rendering.toolRotation;await page.mouse.down({button:'right'});await page.mouse.move(cursor.x+45,cursor.y-12);await Step(1);await page.mouse.up({button:'right'});p=await Probe();
  Check(Distance(beforeTurn,p.rendering.toolRotation)>.01,'right drag changes wrist orientation');
  const beforeDepth=p.rendering.toolPosition;await page.mouse.wheel(0,-100);await Step(1);p=await Probe();Check(Distance(beforeDepth,p.rendering.toolPosition)>.05,'wheel changes physical insertion depth');
  Check((await page.evaluate(()=>__EarSpaDebug.view.AuditTool())).fieldMinimum>=-.012,'entire instrument stays outside canal skin');
  console.log('PASS manual input, empty closure and geometry');

  await Practice();await Select('drops');let wet=(await Probe()).targets.find(c=>c.id===2);
  await MoveToWorld(wet.position);const dosePose=(await Probe()).rendering.toolPosition;await page.keyboard.down('Space');await Step(210);await page.keyboard.up('Space');await Step(5);p=await Probe();
  Check(Distance(dosePose,p.rendering.toolPosition)<.001,'liquid input keeps the manually positioned nozzle stationary');
  Check(p.targets.find(c=>c.id===2).softened>.99&&p.events.some(e=>e.type==='soften'&&e.id===2),'actual nozzle contact and held input soften natural wet wax');
  Check(p.cleanliness===0,'softening does not score');
  await Select('tweezers');await page.keyboard.down('KeyE');await Step(34);await page.keyboard.up('KeyE');await MoveToWorld(wet.position);
  Check((await page.evaluate(()=>__EarSpaDebug.view.ForcepsProbe()))?.jawContact,'real input admits the wax between both tips');
  await page.keyboard.down('Space');await Step(18);p=await Probe();Check(p.active===2,'closing both tips acquires the contacted piece');
  const bonded=p.targets.find(c=>c.id===2).physics.anchors;await Step(120);p=await Probe();
  Check(p.active===2&&p.targets.find(c=>c.id===2).physics.anchors===bonded&&!p.targets.find(c=>c.id===2).physics.detached,'holding still does not perform a timed extraction');
  const normal=await page.evaluate(()=>__EarSpaDebug.view.chunks[2].normal.toArray()),start=p.rendering.toolPosition;
  await MoveToWorld(start.map((x,i)=>x+normal[i]*1.1),100);p=await Probe();
  Check(p.active===2&&p.targets.find(c=>c.id===2).physics.detached&&p.fractures===0,'a controlled hand-driven pull releases all attachments');
  Check(p.events.filter(e=>e.type==='bondBreak'&&e.id===2).length>1,'detachment contains successive physical bond failures');
  Check(p.cleanliness===0&&p.transfer===null,'detachment starts no scripted transfer and awards no score');await Shot('ForcepsHeld');
  const ReadGrip=()=>page.evaluate(()=>{const c=__EarSpaDebug.view.chunks.find(c=>c.id===2);return c.mesh.position.clone().fromArray(c.body.grip).applyQuaternion(c.mesh.quaternion).add(c.mesh.position).toArray();});
  const heldGrip=await ReadGrip();await Step(120);p=await Probe();Check(p.active===2&&Distance(heldGrip,await ReadGrip())<.03&&p.cleanliness===0&&p.transfer===null,'actual grip stays in the hand while internal material can relax');
  await page.keyboard.press('KeyT');await Step(5);Check(!(await Probe()).precision.trayView,'tray view rejects a piece still inside the ear');
  for(let i=0;i<14;i++){await page.mouse.wheel(0,-200);await Step(3);}await page.keyboard.press('KeyT');await Step(75);p=await Probe();
  Check(p.precision.trayView&&p.active===2&&p.input.acting,'withdrawal and camera change preserve the held piece');
  const tray=await page.evaluate(()=>__EarSpaDebug.core.scene.getObjectByName('Model_Tray').position.toArray());
  await MoveToWorld([tray[0]+31,tray[1]+5,tray[2]],90);await page.keyboard.up('Space');await Step(90);p=await Probe();
  Check(p.cleanliness===0&&p.targets.find(c=>c.id===2).state==='resting','missing the tray leaves a recoverable piece on the physical mat');await Shot('MatDrop');
  await Rebase();await page.mouse.down({button:'right'});await page.mouse.move(cursor.x,cursor.y-45);await Step(1);await page.mouse.up({button:'right'});
  const fallen=(await Probe()).targets.find(c=>c.id===2).position;await MoveToWorld(fallen,100);await page.keyboard.down('Space');await Step(18);p=await Probe();
  Check(p.active===2&&p.cleanliness===0,'the dropped piece can be manually gripped again');
  await MoveToWorld([tray[0],tray[1]+5,tray[2]],90);p=await Probe();Check(p.cleanliness===0&&p.active===2,'positioning above the real tray is not collection');await Shot('TrayHeld');
  await page.keyboard.up('Space');await Step(90);p=await Probe();
  Check(p.harvest.filter(c=>c.id===2).length===1&&p.tray.count===1,'manual release lands and stores the actual wax exactly once');
  Check(Math.abs(p.cleanliness-wet.mass/9)<1e-8&&Math.abs(p.tray.mass-wet.mass)<1e-8,'tray collection conserves cleaning mass');
  Check(p.shop.coins===income,'practice extraction does not alter business income');await Step(180);Check((await Probe()).harvest.length===1,'continued gravity cannot collect the same piece twice');await Shot('TrayLanded');
  await page.keyboard.press('KeyT');await Step(75);p=await Probe();Check(!p.precision.trayView&&p.rendering.toolVisible&&p.rendering.toolDepth>0&&p.rendering.toolDepth<9,'returning from the tray parks the empty instrument in the playable canal');
  console.log('PASS real softening, paired grip, manual withdrawal and tray landing');

  await Practice();await Select('scoop');const spoon=await page.evaluate(()=>{const c=__EarSpaDebug.view.chunks[3];return{normal:c.normal.toArray(),edge:c.body.surface.points[49].map((x,i)=>x+c.normal.toArray()[i]*.08)};});
  await MoveToWorld(spoon.edge,90);await page.keyboard.down('Space');await Step(12);p=await Probe();Check(p.active===3,'spoon bowl contacts the natural thin-sheet rim');
  const spoonStart=p.rendering.toolPosition;await MoveToWorld(spoonStart.map((x,i)=>x+spoon.normal[i]*.7),140);p=await Probe();
  Check(p.active===3&&p.targets.find(c=>c.id===3).physics.detached&&p.fractures===0,'continuous rim peeling detaches a full dry sheet');
  Check(p.stats.triangles<=180000&&p.stats.drawCalls<=120,'canal rendering with a carried sheet stays within the full scene budget');
  Check(p.cleanliness===0&&p.targets.find(c=>c.id===3).physics.peakBend>.02,'physical bending precedes collection');await Shot('SpoonPeel');
  await page.keyboard.up('Space');await Step(120);p=await Probe();Check(p.active===null&&p.cleanliness===0&&!p.transfer,'letting go inside the ear drops the sheet locally');
  Check(p.targets.find(c=>c.id===3).state==='resting'||p.targets.find(c=>c.id===3).state==='settling','dropped sheet remains a physical, recoverable object');
  const mass=p.targets.filter(c=>!['fractured','exhausted'].includes(c.state)).reduce((sum,c)=>sum+c.mass,0);Check(Math.abs(mass-9)<1e-8,'manual release neither deletes nor duplicates wax');
  console.log('PASS real spoon bending, detachment and local drop');

  await Practice();await Select('brush');const dust=(await Probe()).targets.find(c=>c.id==='dust5');await MoveToWorld(dust.position,70);await page.keyboard.down('Space');await Step(1);const beforeBrush=await Probe(),brushStart=beforeBrush.rendering.toolPosition;
  await MoveToWorld(brushStart.map((x,i)=>x+(i===0?-.8:0)),70);p=await Probe();
  Check(p.targets.some(c=>c.fine&&Distance(c.position,beforeBrush.targets.find(old=>old.id===c.id).position)>.01)&&p.events.some(e=>e.type==='sweep'),'held brushing moves naturally placed microdust');
  Check(p.cleanliness===0,'brushing does not collect grains');await page.keyboard.up('Space');await Select('feather');const gathered=(await Probe()).targets.find(c=>c.id==='dust5');await MoveToWorld(gathered.position,80);await page.keyboard.down('Space');await MoveToWorld(gathered.position.map((x,i)=>x+(i===0?.5:0)),60);p=await Probe();
  Check(p.rendering.featherSweep.held===1&&p.targets.find(c=>c.id==='dust5').state==='held','moving actual feather strands picks up one capacity-limited patch');
  for(let i=0;i<14;i++){await page.mouse.wheel(0,-200);await Step(3);}await page.keyboard.press('KeyT');await Step(75);p=await Probe();
  Check(p.precision.trayView&&p.rendering.featherSweep.held===1&&p.cleanliness===0,'feather grains remain held through manual withdrawal and tray view');
  Check(await page.evaluate(()=>__EarSpaDebug.view.chunks.find(c=>c.id==='dust5').mesh.visible),'held feather grains remain visibly present above the tray');
  const featherTray=await page.evaluate(()=>__EarSpaDebug.core.scene.getObjectByName('Model_Tray').position.toArray());await MoveToWorld([featherTray[0],featherTray[1]+5,featherTray[2]],90);await page.keyboard.up('Space');await Step(90);p=await Probe();
  Check(p.harvest.length===1&&p.harvest[0].id==='dust5'&&Math.abs(p.tray.mass-gathered.mass)<1e-8&&Math.abs(p.cleanliness-gathered.mass/9)<1e-8,'physical feather release collects exactly the brushed patch mass');await Shot('FeatherLanded');
  console.log('PASS real brush-to-feather cleanup and particle mass');
  await page.keyboard.press('KeyT');await Step(75);await Select('tweezers');await page.locator('#depth-toggle').click();await Step(150);p=await Probe();
  Check(p.rendering.inspectionTarget===1&&p.rendering.toolScreen.z>-1&&p.rendering.toolScreen.z<1,'deep inspection parks the empty long tool in front of the camera');
  await page.locator('#depth-toggle').click();await Step(150);

  for(const interruption of ['escape','settings','blur','pointercancel']){
    await Select('tweezers');await Rebase();if(interruption==='settings')await page.keyboard.down('Space');else await page.mouse.down();await Step(8);
    if(interruption==='escape')await page.keyboard.press('Escape');
    if(interruption==='settings'){await page.locator('#settings-open').click();Check(await page.locator('#settings-dialog').evaluate(d=>d.open),'settings interruption opens the real modal');}
    if(interruption==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if(interruption==='pointercancel')await page.locator('#ear-canvas').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',bubbles:true});
    await page.mouse.up();await page.keyboard.up('Space');await Step(1);p=await Probe();Check(!p.input.acting&&!p.input.rotating&&!p.input.captured&&p.active===null,interruption+' clears every held input');
    if(interruption==='settings')await page.locator('#settings-close').click();
  }
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop controls fit the viewport');
  p=await Probe();Check(p.stats.triangles<=180000&&p.stats.drawCalls<=120,'rendering stays within project budget');
  Check(report.errors.length===0,'no script, shader or resource errors');
  console.log('PASS precision controls '+width+': '+report.checks.length+' checks');
}catch(error){report.failure=error.stack;report.probe=await Probe().catch(()=>null);await Shot('Failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'Data_PrecisionReport_'+width+'.json'),JSON.stringify(report,null,2));await browser.close();}
