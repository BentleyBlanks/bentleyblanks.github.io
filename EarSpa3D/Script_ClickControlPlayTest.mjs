import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
assert.ok(url,'pass --url= for this worktree preview');
const debugUrl=new URL(url);debugUrl.searchParams.set('debug','1');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
const Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const JawOpening=probe=>{
 const values=probe.rendering.jawOpening;
 assert.ok(Array.isArray(values)&&values.length>0&&values.every(Number.isFinite),'jawOpening exposes finite rendered tip openings');
 const opening=values.reduce((sum,value)=>sum+value,0);
 assert.ok(opening>0,'rendered tweezer tip gap stays positive without crossing');
 return opening;
};
const Income=probe=>({coins:probe.shop.coins,totalEarned:probe.shop.totalEarned,totalCustomers:probe.shop.totalCustomers});

try{for(const [width,height,touch] of [[1280,720,false],[390,844,true],[320,568,true],[844,390,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch}),report={width,height,touch,checks:[],errors:[],collections:[]};reports.push(report);
 const Check=(ok,label)=>{assert.ok(ok,width+'x'+height+': '+label);report.checks.push(label);};
 const Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Probe=()=>page.evaluate(()=>__EarSpaProbe());
 const Shot=name=>page.screenshot({path:path.join(here,'_dev/Shot_Click'+name+'_'+width+'x'+height+'.png')});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 async function Tap(screen){const p=await Probe(),x=p.stage.x+screen.x,y=p.stage.y+screen.y;if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);}
 async function Select(tool){await page.locator('[data-tool="'+tool+'"]').click();await Step(1);Check((await Probe()).tool===tool,'select '+tool+' through the dock');}
 async function StartPractice(){
  const settings=page.locator('#settings-dialog');
  if(!await settings.evaluate(dialog=>dialog.open))await page.locator((await page.locator('#welcome-settings').isVisible())?'#welcome-settings':'#settings-open').click();
  await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);
  const p=await Probe();Check(p.practice==='mixed'&&p.phase==='playing','mixed practice uses the natural initial layout');
  Check(p.controlScheme==='click'&&!p.rendering.draggingTool,'click controls are the default');
 }
 async function FindTarget(tool,{type=null,fine=false,ids=null}={}){
  const selected=await page.evaluate(({tool,type,fine,ids})=>{
   const p=__EarSpaProbe(),canvas=document.querySelector('#ear-canvas');
   const targets=p.targets.filter(c=>c.state==='attached'&&Boolean(c.fine)===fine&&(!type||c.type===type)&&(!ids||ids.includes(c.id))&&c.depth<8.8&&c.screen.z>-1&&c.screen.z<1).sort((a,b)=>a.depth-b.depth);
   for(const c of targets){
    const points=[c.screen];
    // A swept nine-grain patch has gaps between the visible grains. Read its
    // actual surface projections rather than assuming its centroid is clickable.
    if(fine){const raw=__EarSpaDebug.view.chunks.find(raw=>raw.id===c.id),vertices=raw.mesh.geometry.attributes.position;raw.mesh.updateWorldMatrix(true,false);for(let i=0;i<vertices.count;i+=3)points.push(__EarSpaDebug.view.Project(raw.mesh.position.clone().fromBufferAttribute(vertices,i).applyMatrix4(raw.mesh.matrixWorld)));}
    for(const screen of points){const x=p.stage.x+screen.x,y=p.stage.y+screen.y;if(x>0&&x<innerWidth&&y>0&&y<innerHeight&&document.elementFromPoint(x,y)===canvas&&__EarSpaDebug.view.Pick(screen.x,screen.y,tool)?.id===c.id)return{...c,screen};}
   }
   return null;
  },{tool,type,fine,ids});
  Check(!!selected,'visible reachable '+(fine?'fine debris':type||'wax')+' has a real canvas hit for '+tool);
  return selected;
 }
 async function Idle(label){
  const p=await Probe();Check(p.action===null&&p.active===null&&!p.turning&&!p.rendering.draggingTool,label+' leaves no active input');
  Check(await page.locator('#ear-app').evaluate(app=>app.dataset.dragging!=='true'&&app.dataset.gripping!=='true'),label+' clears input UI');
 }
 async function Collect(target,tool,{duplicate=false}={}){
  const before=await Probe(),income=Income(before),initialGrabs=before.events.filter(e=>e.type==='grab'&&e.id===target.id).length;
  const record={id:target.id,tool,mass:target.mass,beforeCleanliness:before.cleanliness,samples:[]};report.collections.push(record);
  const open=tool==='tweezers'?JawOpening(before):null;
  await Tap(target.screen);let p=await Probe();
  Check(p.action?.id===target.id&&p.action.tool===tool&&p.action.stage==='approach','one '+(touch?'tap':'click')+' starts '+tool+' approach');
  Check(p.cleanliness===before.cleanliness&&p.harvest.length===before.harvest.length,'command does not score before contact');
  if(duplicate){
   await Tap(target.screen);await Tap(target.screen);p=await Probe();
   Check(p.action?.id===target.id&&p.action.tool===tool,'repeated clicks preserve the running command');
   Check(p.harvest.length===before.harvest.length,'repeated clicks cannot collect immediately');
  }
  let sawWorking=false,sawTransfer=false,sawAttachedWork=false,minOpening=open,savedClosedJaw=false;
  for(let frame=0;frame<1800;frame+=6){
   await Step(6);p=await Probe();const c=p.targets.find(c=>c.id===target.id),landed=p.harvest.some(c=>c.id===target.id);
   sawWorking ||= p.action?.stage==='working';sawTransfer ||= Boolean(p.transfer);
   sawAttachedWork ||= p.action?.stage==='working'&&!c?.physics.detached;
   if(tool==='tweezers'&&(p.action?.stage==='working'||p.transfer)){
    minOpening=Math.min(minOpening,JawOpening(p));
    if(!savedClosedJaw&&minOpening<open*.8){await Shot('ForcepsClosed');savedClosedJaw=true;}
   }
   record.samples.push({frame:frame+6,action:p.action,active:p.active,state:c?.state,detached:c?.physics.detached,anchors:c?.physics.anchors,position:c?.position,cleanliness:p.cleanliness,transfer:Boolean(p.transfer),jawOpening:tool==='tweezers'?p.rendering.jawOpening:null});
   Check(Math.abs(p.cleanliness-p.harvest.reduce((sum,c)=>sum+c.mass,0)/9)<1e-8,'score matches only landed mass during '+tool+' frame '+(frame+6));
   Check(p.harvest.filter(c=>c.id===target.id).length<=1,'wax is never harvested twice during '+tool+' frame '+(frame+6));
   if(!landed)Check(p.cleanliness===before.cleanliness,'approach, detachment and transfer award no early score');
   if(!landed&&p.action===null&&!p.transfer){record.stoppedLabel=await page.locator('#pull-label').textContent();throw Error(tool+' action stopped before transfer/landing at frame '+(frame+6)+': '+record.stoppedLabel);}
   if(landed)break;
  }
  Check(sawWorking&&sawAttachedWork,tool+' reaches real attached work before detachment');
  Check(sawTransfer,tool+' carries wax out before landing');
  Check(p.harvest.filter(c=>c.id===target.id).length===1,tool+' lands the clicked wax exactly once');
  Check(p.events.filter(e=>e.type==='grab'&&e.id===target.id).length===initialGrabs+1,tool+' acquires one grip despite repeated input');
  Check(p.events.filter(e=>e.type==='land'&&e.id===target.id).length===1,tool+' awards one landing event');
  Check(p.events.filter(e=>e.type==='landingSound'&&e.id===target.id).length===1,tool+' emits one landing feedback');
  Check(Math.abs(p.cleanliness-before.cleanliness-target.mass/9)<1e-8,tool+' preserves the target mass');
  Check(p.fractures===before.fractures,tool+' controlled extraction does not fracture the initial target');
  Check(p.tray.count===before.tray.count+1,tool+' reaches the actual collection tray');
  Check(JSON.stringify(Income(p))===JSON.stringify(income),tool+' practice collection preserves business income');
  if(tool==='tweezers'){record.openJaw=open;record.minimumJaw=minOpening;Check(open>0&&minOpening<open*.8,'rendered tweezer tips visibly close during grip');}
  const stable={cleanliness:p.cleanliness,harvest:p.harvest.length,income:Income(p),lands:p.events.filter(e=>e.type==='land'&&e.id===target.id).length};
  await Step(180);p=await Probe();Check(p.cleanliness===stable.cleanliness&&p.harvest.length===stable.harvest&&JSON.stringify(Income(p))===JSON.stringify(stable.income)&&p.events.filter(e=>e.type==='land'&&e.id===target.id).length===stable.lands,'completed extraction cannot score or pay again');
  await Idle(tool+' landing');await Shot(tool==='tweezers'?'ForcepsDelivered':'SpoonDelivered');
 }
 try{
  await page.goto(debugUrl.href);await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  report.version=(await Probe()).version;report.previewUrl=debugUrl.href;
  // Only the clock is controlled. Targets, tools, softening, grips and tray placement
  // remain the actual game state and all commands below use real mouse/touch input.
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await StartPractice();await Select('scoop');
  const beforeBlank=await Probe(),blank=await page.evaluate(()=>{
   const p=__EarSpaProbe(),canvas=document.querySelector('#ear-canvas');
   for(const fractionY of [.2,.35,.5,.65,.8])for(const fractionX of [.08,.2,.35,.5,.65,.8,.92]){
    const x=p.stage.width*fractionX,y=p.stage.height*fractionY;
    if(document.elementFromPoint(p.stage.x+x,p.stage.y+y)===canvas&&!__EarSpaDebug.view.Pick(x,y,'scoop'))return{x,y};
   }return null;
  });
  Check(!!blank,'canvas has a real empty point');await Tap(blank);await Step(24);let p=await Probe();
  Check(p.cleanliness===beforeBlank.cleanliness&&p.harvest.length===beforeBlank.harvest.length&&p.active===null&&p.action===null,'empty click awards no score and starts no work');
  Check(Distance(beforeBlank.rendering.toolPosition,p.rendering.toolPosition)<.001,'empty click leaves the instrument parked');
  const dry=await FindTarget('scoop',{type:'dry'});await Collect(dry,'scoop',{duplicate:true});

  await Select('tweezers');const hard=await FindTarget('tweezers',{type:'impacted'}),beforeHard=await Probe();
  await Tap(hard.screen);await Step(150);p=await Probe();
  Check(p.action===null&&p.active===null&&!p.harvest.some(c=>c.id===hard.id)&&p.cleanliness===beforeHard.cleanliness,'unsoftened hard wax cannot be collected by direct clicking');
  Check(p.targets.find(c=>c.id===hard.id).physics.anchors===hard.physics.anchors&&p.fractures===beforeHard.fractures,'hard-wax refusal preserves its attachments');
  Check(/先.*软化|先.*滴|软化.*先|硬结/.test(await page.locator('#pull-label').textContent()||'')||p.feedback.slice(beforeHard.feedback.length).some(f=>/软化|滴液/.test(f.message)),'hard-wax feedback tells the player to soften it first');

  await Select('drops');const wet=await FindTarget('drops',{type:'wet'});let doses=0;
  for(;doses<3;doses++){
   const current=(await Probe()).targets.find(c=>c.id===wet.id);await Tap(current.screen);await Step(240);
   if((await Probe()).targets.find(c=>c.id===wet.id).softened>=.9)break;
  }
  p=await Probe();Check(p.targets.find(c=>c.id===wet.id).softened>=.9,'real drop taps and diffusion soften natural wet wax');
  Check(p.events.some(e=>e.type==='soften'&&e.id===wet.id),'drop input records an actual dose');
  await Select('tweezers');const softened=(await Probe()).targets.find(c=>c.id===wet.id);await Collect(softened,'tweezers',{duplicate:true});

  // Each interruption occurs before extraction so cancellation must not leave
  // a transfer running. No held pointer or drag is used to begin the command.
  for(const mode of ['escape','pointercancel','blur','settings','tool']){
   await StartPractice();await Select('scoop');const target=await FindTarget('scoop',{type:'dry'});await Tap(target.screen);await Step(1);
   Check((await Probe()).action?.stage==='approach',mode+' test begins during approach');
   if(mode==='escape')await page.keyboard.press('Escape');
   if(mode==='pointercancel')await page.locator('#ear-canvas').dispatchEvent('pointercancel',{pointerId:1,pointerType:touch?'touch':'mouse',isPrimary:true,bubbles:true});
   if(mode==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   if(mode==='settings')await page.locator('#settings-open').click();
   if(mode==='tool')await page.locator('[data-tool="tweezers"]').click();
   await Step(24);p=await Probe();await Idle(mode);
   Check(!p.transfer&&p.harvest.length===0&&p.cleanliness===0,mode+' cancels without collection');
   if(mode==='settings')await page.locator('#settings-close').click();
   await Select('scoop');const next=await FindTarget('scoop',{type:'dry'});await Tap(next.screen);
   Check((await Probe()).action?.id===next.id,mode+' cancellation accepts the next real click');await page.keyboard.press('Escape');await Step(24);await Idle(mode+' recovery');
  }

  await StartPractice();await Select('brush');const dust=await FindTarget('brush',{fine:true}),beforeBrush=await Probe();
  await Tap(dust.screen);Check((await Probe()).action?.id===dust.id,'brush tap starts fine-debris sweeping');
  let brushWorked=false;const movedIds=new Set(),sweptIds=new Set();
  for(let frame=0;frame<900;frame+=6){
   await Step(6);p=await Probe();brushWorked ||= p.action?.stage==='sweeping';
   for(const c of p.targets)if(c.fine&&Distance(c.position,beforeBrush.targets.find(old=>old.id===c.id)?.position||c.position)>.02)movedIds.add(c.id);
   for(const id of await page.evaluate(()=>__EarSpaDebug.view.chunks.flatMap(c=>Array.from(c.clickApproach?.swept||[]))))sweptIds.add(id);
   if(p.action===null)break;
  }
  Check(brushWorked&&movedIds.size>0&&sweptIds.size>0,'one brush click physically moves naturally placed fine particles');
  report.brush={target:dust.id,movedIds:[...movedIds],sweptIds:[...sweptIds]};
  Check(p.cleanliness===beforeBrush.cleanliness&&p.harvest.length===beforeBrush.harvest.length,'brush sweeping keeps score tied to actual collection');
  Check(/扫|刷|碎屑/.test(await page.locator('#pull-label').textContent()||'')||p.feedback.slice(beforeBrush.feedback.length).some(f=>/扫|刷|碎屑/.test(f.message)),'brush sweeping gives visible particle-cleaning feedback');
  await Idle('brush sweep');await Shot('BrushSweep');

  await Select('feather');const gathered=await FindTarget('feather',{fine:true,ids:[...movedIds].filter(id=>sweptIds.has(id))}),beforeFeather=await Probe(),featherIncome=Income(beforeFeather);
  Check(gathered.mass===.075,'brush-gathered patch keeps its original .075 mass');
  await Tap(gathered.screen);p=await Probe();Check(p.action?.id===gathered.id&&p.action.tool==='feather','real feather tap selects the brush-gathered patch');
  let sawFeatherSweep=false,sawFeatherTransfer=false;
  for(let frame=0;frame<900;frame+=6){
   await Step(6);p=await Probe();sawFeatherSweep ||= p.action?.stage==='sweeping';sawFeatherTransfer ||= Boolean(p.transfer);
   const landed=p.harvest.some(c=>c.id===gathered.id);
   Check(Math.abs(p.cleanliness-p.harvest.reduce((sum,c)=>sum+c.mass,0)/9)<1e-8,'feather score matches only landed mass');
   if(!landed)Check(p.cleanliness===beforeFeather.cleanliness,'feather sweep and transfer award no early score');
   if(!landed&&p.action===null&&!p.transfer)throw Error('feather action stopped before landing: '+await page.locator('#pull-label').textContent());
   if(landed)break;
  }
  Check(sawFeatherSweep&&sawFeatherTransfer,'feather sweeps and carries the relocated fine patch out');
  Check(p.harvest.length===beforeFeather.harvest.length+1&&p.harvest.filter(c=>c.id===gathered.id).length===1,'brush-gathered patch actually lands exactly once');
  Check(p.events.filter(e=>e.type==='land'&&e.id===gathered.id).length===1&&p.events.filter(e=>e.type==='landingSound'&&e.id===gathered.id).length===1,'feather landing gives one mass award and one sound');
  Check(Math.abs(p.cleanliness-beforeFeather.cleanliness-.075/9)<1e-8&&p.tray.count===beforeFeather.tray.count+1,'feather adds exactly .075/9 cleanliness on physical landing');
  const featherCleanliness=p.cleanliness;await Step(180);p=await Probe();
  Check(p.cleanliness===featherCleanliness&&p.harvest.length===beforeFeather.harvest.length+1&&JSON.stringify(Income(p))===JSON.stringify(featherIncome),'feather settling cannot score or pay twice');
  await Idle('feather landing');await Shot('FeatherDelivered');

  await StartPractice();await Select('scoop');await page.locator('#ear-canvas').focus();
  const beforeKeyboard=await Probe();await page.keyboard.press('ArrowRight');p=await Probe();
  Check(p.action===null&&p.cleanliness===beforeKeyboard.cleanliness&&Distance(p.rendering.toolPosition,beforeKeyboard.rendering.toolPosition)<.001,'arrow key selects a target without working or moving the tool');
  Check(/已选/.test(await page.locator('#pull-label').textContent()||''),'keyboard selection gives visible feedback');
  await page.keyboard.press('Space');p=await Probe();const firstKeyboardId=p.action?.id;
  Check(p.action?.stage==='approach'&&p.action.tool==='scoop','Space starts the selected target through click controls');
  await page.keyboard.press('Escape');await Step(24);await Idle('keyboard Escape');
  Check((await Probe()).harvest.length===0&&(await Probe()).cleanliness===0,'keyboard Escape stops before extraction');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');p=await Probe();
  Check(p.action?.stage==='approach'&&p.action.id!==firstKeyboardId&&p.action.tool==='scoop','next arrow selection and Enter start a different real target');
  await page.keyboard.press('Escape');await Step(24);await Idle('keyboard Enter cancellation');

  await page.evaluate(()=>localStorage.setItem('earspa3d.calm.settings',JSON.stringify({toolDrag:true,master:.37,haptics:false})));
  await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});p=await Probe();
  Check(p.controlScheme==='click'&&p.settings.toolDrag===false&&p.rendering.toolDragMode===false,'legacy drag preference migrates to click controls');
  Check(p.settings.master===.37&&p.settings.haptics===false,'control migration preserves volume and haptic preferences');
  const savedSettings=await page.evaluate(()=>JSON.parse(localStorage.getItem('earspa3d.calm.settings')));
  report.migratedSettings={controlScheme:p.controlScheme,toolDrag:p.settings.toolDrag,toolDragMode:p.rendering.toolDragMode,master:p.settings.master,haptics:p.settings.haptics,saved:savedSettings};
  Check(savedSettings.toolDrag===false&&savedSettings.master===.37&&savedSettings.haptics===false,'migrated preferences persist in storage');
  await Idle('settings migration');
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'controls fit the viewport');
  Check(report.errors.length===0,'no browser, shader or resource errors');
  console.log('PASS click controls '+width+'x'+height+': '+report.checks.length+' checks');
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await Shot('Failure').catch(()=>{});throw error;}finally{await page.close();}
}}finally{await fs.writeFile(path.join(here,'_dev/Data_ClickControlReport.json'),JSON.stringify(reports,null,2));await browser.close();}
