import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
 for(const [width,height,level] of [[1000,900,1],[390,844,2],[320,568,5],[844,390,1]]){
  const touch=width<900,page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
  const cdp=await page.context().newCDPSession(page),report={width,height,level,checks:[],errors:[],samples:[]};reports.push(report);
  const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);};
  const Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Probe=()=>page.evaluate(()=>__EarSpaProbe());
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  async function Input(down,target,button='left'){
   if(touch)await cdp.send('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:down?[{x:target.screen.x,y:target.screen.y}]:[]});
   else if(down){await page.mouse.move(target.screen.x,target.screen.y);await page.mouse.down({button});}else await page.mouse.up({button});
  }
  try{
   await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
   await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
   await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);
   // 覆盖现有三档几何；夹持、松手与计分仍全部走真实鼠标 / CDP 触屏。
   const wetTarget=(await Probe()).targets.find(c=>c.id===2);
   await page.locator('[data-tool="drops"]').click();await Input(true,wetTarget);await Input(false,wetTarget);await Step(195);
   await page.locator('[data-tool="tweezers"]').click();
   await page.evaluate(level=>__EarSpaDebug.view.SetSkins({tweezers:'classic'},{tweezers:level}),level);
   Check((await Probe()).rendering.toolLevels.tweezers===level,'requested forceps edition is loaded');
   const target=(await Probe()).targets.find(c=>c.id===2),normal=await page.evaluate(()=>__EarSpaDebug.view.chunks[2].normal.toArray());
   if(touch)await page.locator('#mode-turn').click();await Input(true,target,'right');
   for(let i=0;i<80;i++){
    if(InstrumentContact('tweezers',(await Probe()).rendering.toolRotation,normal).jawTilt<.12)break;
    await Step(3);if(i===79)throw Error('cannot align tweezers');
   }
   await Input(false,target,'right');if(touch)await page.locator('#mode-force').click();
   await Input(true,target);await Step(180);
   const held=(await Probe()).targets.find(c=>c.id===2);
   Check(held.state==='held'&&held.physics.detached,'real input detaches wet wax and holds it between the jaws');
   report.held=await page.evaluate(()=>__EarSpaDebug.view.AuditTool());
   Check(report.held.fieldMinimum>=-.03&&report.held.meshMinimum>=-.05,'held forceps clear the canal field and independent wall mesh');
   await Input(false,target);
   // 每帧检查真实模型端点；仅检查 scale=1 抓不住正对镜头造成的投影退化。
   for(let frame=0;frame<120;frame+=15){
    const samples=await page.evaluate(async()=>{
     const T=await import('three'),{core,view}=__EarSpaDebug;
     const grip=core.scene.getObjectByName('Model_ForcepsGrip'),tool=grip.parent.parent,c=view.chunks[2];
     grip.geometry.computeBoundingBox();const length=grip.geometry.boundingBox.max.y,rows=[];
     for(let i=0;i<15;i++){
      const previous=tool.quaternion.clone();__EarSpaDebug.StepFrames(1);
      const tip=tool.position.clone(),end=new T.Vector3(0,length,0).applyQuaternion(tool.quaternion).add(tip);
      const axis=end.clone().sub(tip).normalize(),sight=core.camera.position.clone().sub(tip).normalize(),a=view.Project(tip),b=view.Project(end);
      const physicalGrip=c.body.grip?new T.Vector3().fromArray(c.body.grip).applyQuaternion(c.mesh.quaternion).add(c.mesh.position):null;
      rows.push({age:view.transfer.age,state:c.state,visible:tool.visible,worldLength:tip.distanceTo(end),toolScale:tool.scale.toArray(),waxScale:c.mesh.scale.toArray(),rotationStep:previous.angleTo(tool.quaternion),sideFraction:Math.sqrt(Math.max(0,1-axis.dot(sight)**2)),screenLength:Math.hypot(a.x-b.x,a.y-b.y),tip:a,end:b,gripError:physicalGrip?.distanceTo(tip)??null,clearance:view.CollisionProbe().clearance});
     }
     return rows;
    });
    report.samples.push(...samples);
    if(frame===60||frame===90)await page.screenshot({path:path.join(here,'_dev/Shot_TweezersExtraction_'+width+'_'+(frame===60?'Carry':'Drop')+'.png')});
   }
   Check(report.samples.every(s=>Math.abs(s.worldLength-20)<.02&&s.toolScale.every(v=>v===1)&&s.waxScale.every(v=>v===1)),'tool stays 20 mm long and carried wax retains its scale');
   Check(report.samples.every(s=>s.rotationStep<.4&&s.clearance>=-.03),'rotation stays continuous and keeps wall clearance');
   Check(report.samples.filter(s=>s.state==='carrying').every(s=>s.gripError<.06),'visible jaws remain on the physical grip until release');
   const outside=report.samples.filter(s=>s.age>=1.2);
   Check(outside.every(s=>s.visible&&s.sideFraction>.7&&s.screenLength>30),'outside forceps show their length instead of collapsing toward the camera');
   Check(outside.every(s=>[s.tip,s.end].every(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height&&p.z>-1&&p.z<1)),'both ends of the extracted forceps stay within the viewport');
   await Step(100);const final=await Probe();
   Check(final.harvest.filter(c=>c.id===2).length===1&&Math.abs(final.cleanliness-target.mass/9)<1e-8,'wax lands once with unchanged mass-based cleanliness');
   Check(final.transfer===null&&final.viewReady,'completion restores canal interaction');
   Check(report.errors.length===0,'no browser, shader, or asset errors');
   console.log('PASS '+width+'x'+height+' level '+level+': '+report.checks.length+' extraction checks');
  }finally{await page.close();}
 }
}finally{await fs.writeFile(path.join(here,'_dev/Data_TweezersExtractionReport.json'),JSON.stringify(reports,null,2));await browser.close();}
