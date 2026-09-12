import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8110/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of (process.argv.includes('--diagnose')?[[1000,900,false]]:[[1000,900,false],[390,844,true],[320,568,true],[844,390,true]])){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),cdp=await page.context().newCDPSession(page),report={width,height,touch,checks:[],errors:[],samples:[]};reports.push(report);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Shot=name=>page.screenshot({path:path.join(here,`_dev/Shot_Oily${name}_${width}.png`)});
  async function Input(down,t){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:down?[{x:t.screen.x,y:t.screen.y}]:[]});else if(down){await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down();}else await page.mouse.up();}
  async function Align(id){const target=(await Probe()).targets.find(c=>c.id===id),normal=await page.evaluate(id=>__EarSpaDebug.view.chunks.find(c=>c.id===id).normal.toArray(),id);if(touch){await page.locator('#mode-turn').click();await Input(true,target);}else{await page.mouse.move(target.screen.x,target.screen.y);await page.mouse.down({button:'right'});}let aligned=false;for(let i=0;i<100;i++){await Step(3);aligned=InstrumentContact('tweezers',(await Probe()).rendering.toolRotation,normal).aligned;if(aligned)break;}if(touch){await Input(false);await page.locator('#mode-force').click();}else await page.mouse.up({button:'right'});Check(aligned,'actual rotation aligns the forceps for '+id);}
  try{
    await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,{timeout:60000});await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
    if(!process.argv.includes('--diagnose')){await page.locator('#ear-start').click();await Step(130);}
    const business=await Probe(),savedShop=await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'));
    await page.locator(business.phase==='ready'?'#welcome-settings':'#settings-open').click();await Shot('Settings');await page.locator('#practice-start').click();await Step(130);const base=await Probe();
    await Shot('Rest');
    if(process.argv.includes('--look')){for(const [name,color,transmission,roughness,clearcoat] of [['Honey',0xf2ce83,.82,.23,.55],['Cloudy',0xf1c97c,.52,.3,.7],['Cream',0xecc477,.35,.26,.5]]){await page.evaluate(({color,transmission,roughness,clearcoat})=>{for(const c of __EarSpaDebug.view.chunks){c.mesh.material.color.set(color);c.mesh.material.transmission=transmission;c.mesh.material.roughness=roughness;c.mesh.material.clearcoat=clearcoat;}__EarSpaDebug.core.Render();},{color,transmission,roughness,clearcoat});await Shot(name);}continue;}
    Check(base.practice==='oily'&&base.targets.length===3&&base.targets.every(c=>c.type==='oily'&&c.form==='coating'&&!c.fine),'oil ear has three continuous films with raised deposits');
    Check(base.targets.every(c=>c.physics.solver==='xpbd-viscoelastic-volume'&&c.physics.tetrahedra>c.physics.nodes),'every coating uses a volumetric lattice');
    await page.locator('[data-tool="tweezers"]').click();let target=(await Probe()).targets.find(c=>c.id===2);await Input(true,target);
    for(const n of [3,6,9,12,20,35,60]){
      // 厚区短暂拉伸后逐点脱黏；逐帧测量，避免截图间隔跨过仍附着的峰值。
      const attachedStretch=await page.evaluate(n=>{let peak=0;for(let i=0;i<n;i++){__EarSpaDebug.StepFrames(1);const c=__EarSpaDebug.view.chunks.find(c=>c.id===2);if(c.body.anchors.some(a=>a.alive))peak=Math.max(peak,c.body.gel.maxStretch);}return peak;},n);
      report.attachedStretch=Math.max(report.attachedStretch||0,attachedStretch);const probe=await Probe(),c=probe.targets.find(c=>c.id===2);report.samples.push({state:c.state,...c.physics,position:c.position,active:probe.active});await Shot('Pull'+report.samples.length);
    }
    report.stats=(await Probe()).stats;
    if(process.argv.includes('--diagnose'))console.log(JSON.stringify({width,samples:report.samples,errors:report.errors,stats:report.stats}));
    await Input(false);await Step(240);await Shot('Landed');report.final=await Probe();
    if(!process.argv.includes('--diagnose')){
      Check(report.samples.some(s=>s.state==='held'),'real pointer loading detaches the oil deposit');
      Check(report.samples.every(s=>Math.abs(s.volumeRatio-1)<.06&&s.minJacobian>0),'loaded gel preserves volume and positive tetrahedra');
      Check(report.final.harvest.some(c=>c.id===2),'gel lands and receives collection credit once');
      Check(report.final.harvest.filter(c=>c.id===2).length===1,'one deposit never receives duplicate landing credit');
      Check(report.attachedStretch>1.4,'the continuous film stretches while its far wall attachments remain');
      await page.locator('#settings-open').click();await page.locator('#practice-start').click();await Step(130);
      const reset=await Probe();Check(reset.targets.every((c,i)=>JSON.stringify(c.position)===JSON.stringify(base.targets[i].position)),'restarting reproduces the same seeded oil ear');
      await page.locator('[data-tool="tweezers"]').click();await Input(true,reset.targets.find(c=>c.id===2));await Step(35);const extended=(await Probe()).targets.find(c=>c.id===2);await Shot('RecoilBefore');await Input(false);await Step(160);const relaxed=(await Probe()).targets.find(c=>c.id===2);await Shot('RecoilAfter');
      Check(extended.physics.anchors>0&&relaxed.physics.gelStretch<extended.physics.gelStretch*.85,'letting go partway visibly relaxes the same gel body');
      Check((await Probe()).cleanliness===0,'uncollected recoil cannot increase cleanliness');
      await page.locator('#settings-open').click();await page.locator('#practice-start').click();await Step(130);
      for(const id of [2,0,1]){
        let probe=await Probe();if(id===7){await page.locator('#depth-toggle').click();await Step(70);probe=await Probe();}
        target=probe.targets.find(c=>c.id===id);await Input(true,target);await Step(3);probe=await Probe();if(probe.active===id&&!probe.targets.find(c=>c.id===id).aligned){await Input(false);await Align(id);await Input(true,(await Probe()).targets.find(c=>c.id===id));}
        for(let attempt=0;attempt<9;attempt++){await Step(45);probe=await Probe();if(probe.targets.find(c=>c.id===id).state==='held')break;}
        Check(probe.active===id&&probe.targets.find(c=>c.id===id).state==='held','real input can remove oily deposit '+id);
        const gel=probe.targets.find(c=>c.id===id).physics;Check(Math.abs(gel.volumeRatio-1)<.06&&gel.minJacobian>0,'deposit '+id+' retains positive volume');
        await Input(false);await Step(210);if(id===2)await Shot('Tray');
      }
      await Step(200);const complete=await Probe();await Shot('Complete');Check(complete.phase==='complete'&&complete.cleanliness===1&&complete.harvest.length===3,'all continuous coatings complete the practice ear with conserved mass');
      Check(complete.tray.count===3&&Math.abs(complete.tray.mass-9)<1e-6&&complete.rendering.trayCloseup>.99,'all gel coatings persist in the practice tray close-up');
      Check(report.stats.triangles<=180000&&report.stats.drawCalls<=120,'transmissive oil wax remains inside the scene rendering budget');
      Check(await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'))===savedShop,'practice completion never alters the business save');
      await page.locator('#settings-open').click();await page.locator('#practice-return').click();let restored=await Probe();
      Check(restored.practice===null&&restored.phase===business.phase&&restored.elapsed===business.elapsed&&JSON.stringify(restored.targets.map(c=>[c.id,c.state,c.position]))===JSON.stringify(business.targets.map(c=>[c.id,c.state,c.position])),'returning resumes the preserved business ear and clock');
      Check(restored.tray.count===business.tray.count&&restored.tray.mass===business.tray.mass,'practice deposits do not leak into the business collection tray');
      for(const type of ['dry','wet','impacted','mixed']){await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption(type);await page.locator('#practice-start').click();await Step(130);const chosen=await Probe();Check(chosen.practice===type&&Math.abs(chosen.targets.reduce((sum,c)=>sum+c.mass,0)-9)<1e-7,'selecting '+type+' starts a complete deterministic test ear');if(type!=='mixed')Check(chosen.targets.filter(c=>!c.fine).every(c=>c.type===type),type+' selection uses the chosen material');}
      await page.locator('#settings-open').click();const beforePause=(await Probe()).targets.map(c=>c.position);await Step(250);Check(JSON.stringify((await Probe()).targets.map(c=>c.position))===JSON.stringify(beforePause),'opening settings pauses material motion');
      await page.locator('#practice-return').click();restored=await Probe();Check(restored.elapsed===business.elapsed&&JSON.stringify(restored.shop)===JSON.stringify(business.shop),'repeated tests preserve service time and economy');
      Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings and gameplay do not overflow the viewport');
      Check(report.errors.length===0,'no page, shader or asset errors');
      console.log('PASS oily wax',width,report.checks.length,'checks');
    }
  }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await Shot('Failure');throw error;}
  finally{await fs.writeFile(path.join(here,'_dev/Data_OilyPlayReport.json'),JSON.stringify(reports,null,2));await page.close();}
}}finally{await browser.close();}
