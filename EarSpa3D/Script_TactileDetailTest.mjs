// 实际指针输入 + 独立导出壁面射线审计。存档 fixture 只提供购买资金，不改操作状态。
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[],checks=[],audits=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const Check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
const Step=n=>page.evaluate(n=>window.__EarSpaDebug.StepFrames(n),n),Probe=()=>page.evaluate(()=>window.__EarSpaProbe());
const ids={scoop:'earPickBamboo',tweezers:'earForceps',drops:'earDrops',brush:'softBrush',suction:'microSuction',feather:'gooseFeather'};
async function ScreenMean(){return page.evaluate(()=>{const {core}=window.__EarSpaDebug;core.Render();const gl=core.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);let total=0;for(let i=0;i<data.length;i+=64)total+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;return total/(data.length/64);});}
async function Audit(id,label){const audit=await page.evaluate(()=>__EarSpaDebug.view.AuditTool());audits.push({label,...audit});Check(audit.visible&&audit.id===id,label+' 实体工具可见');Check(audit.fieldMinimum>=-.012,label+' 完整工具顶点留在管腔');Check(audit.meshMinimum>=-.045,label+' 对实际导出网格的独立射线留有间隙');}
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
 await page.evaluate(()=>localStorage.setItem('earspa3d.shop.v1',JSON.stringify({version:2,coins:12000,day:1,toolLevels:{}})));await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug);
 await page.locator('#ear-start').click();await Step(150);Check(!(await Probe()).rendering.lampOn,'检查灯默认关闭');
 const dark=await ScreenMean();await page.screenshot({path:path.join(here,'_dev/Shot_Detail_Dark.png')});
 await page.locator('#lamp-toggle').click();const target=(await Probe()).targets[0];await page.mouse.move(target.screen.x,target.screen.y);await Step(3);const lit=await ScreenMean();Check(lit>dark*1.6,'开启检查灯实际提高画面亮度');
 const firstAim=(await Probe()).rendering.lampAim;await page.mouse.move(450,480);await Step(2);Check((await Probe()).rendering.lampAim.some((v,i)=>Math.abs(v-firstAim[i])>.4),'检查灯随实际鼠标移动');
 await page.locator('#shop-open').click();Check(await page.locator('#shop-dialog').evaluate(d=>d.open)&&!await page.locator('#settings-dialog').evaluate(d=>d.open),'小铺独立于声音设置');
 for(const id of ['brush','suction']){await page.locator('[data-select-tool="'+id+'"]').click();await page.locator('[data-purchase="'+id+'"]').click();}
 await page.locator('[data-select-tool="scoop"]').click();await page.screenshot({path:path.join(here,'_dev/Shot_Detail_Workbench.png')});await page.locator('#shop-close').click();
 for(const id of Object.keys(ids)){
   await page.locator('[data-tool="'+id+'"]').click();
   for(const index of [0,2,3,5]){const t=(await Probe()).targets[index];await page.mouse.move(t.screen.x,t.screen.y,{steps:1});await Step(2);await Audit(id,id+' 基础款位置 '+index);}
 }
 await page.locator('[data-tool="drops"]').click();await page.mouse.click(target.screen.x,target.screen.y);await Step(210);let p=await Probe();Check(p.targets[0].softened>.9,'滴管真实点击后逐步渗透');Check(p.rendering.roughness[0]<.3&&p.rendering.clearcoat[0]>.8,'软化后的粗糙度与湿膜同时变化');
 await page.mouse.move(target.screen.x,target.screen.y);await Step(2);await page.screenshot({path:path.join(here,'_dev/Shot_Detail_Wet.png')});
 Check(await page.locator('#customer-feedback').count()===0&&await page.locator('#customer-bubble').count()===0,'客人文字反馈保持隐藏，女声已停用');await page.screenshot({path:path.join(here,'_dev/Shot_Detail_Feedback.png')});
 await page.locator('#shop-open').click();
 for(const id of Object.keys(ids)){await page.locator('[data-select-tool="'+id+'"]').click();Check((await Probe()).rendering.previewTriangles>500,id+' 预览显示真实模型');for(let i=0;i<4;i++)await page.locator('[data-upgrade="'+ids[id]+'"]').click();Check((await Probe()).rendering.previewTriangles>500,id+' 升级后预览仍可见');}
 p=await Probe();Check(Object.keys(ids).every(id=>p.rendering.toolLevels[id]===5),'六种工具购买升级后同步真实模型等级');
 await page.locator('[data-select-tool="tweezers"]').click();await page.screenshot({path:path.join(here,'_dev/Shot_Detail_MasterForceps.png')});await page.locator('#shop-close').click();
 for(const id of Object.keys(ids)){await page.locator('[data-tool="'+id+'"]').click();for(const index of [0,2,3,5]){const t=(await Probe()).targets[index];await page.mouse.move(t.screen.x,t.screen.y,{steps:1});await Step(2);await Audit(id,id+' 典藏款位置 '+index);}}
 await page.locator('#settings-open').click();Check(await page.locator('#settings-dialog').evaluate(d=>d.open)&&!await page.locator('#shop-dialog').evaluate(d=>d.open),'设置也不会打开小铺');await page.locator('#settings-close').click();
 Check(errors.length===0,'无浏览器异常、资源错误或着色器错误');
 const final=await Probe();Check(final.stats.triangles<=180000&&final.stats.drawCalls<=120,'写实渲染保持几何和绘制预算');
 await fs.writeFile(path.join(here,'_dev/Data_TactileDetailReport.json'),JSON.stringify({checks,errors,audits,brightness:{dark,lit},final},null,2));
 console.log('PASS '+checks.length+' tactile detail checks; 48 full geometry contact audits');
}finally{await browser.close();}
