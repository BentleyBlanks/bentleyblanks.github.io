// 真实输入验收碎裂、工具差异、声音输出和经营持久化；存档夹具只用于模拟已有玩家。
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json'));
const {chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const touch=process.argv.includes('--touch'),width=touch?390:1000,height=touch?844:900;
const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
const cdp=await page.context().newCDPSession(page),report={touch,checks:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
const Check=(ok,name)=>{assert.ok(ok,name);report.checks.push(name);};
const Probe=()=>page.evaluate(()=>window.__EarSpaProbe());
const Step=n=>page.evaluate(n=>window.__EarSpaDebug.StepFrames(n),n);
let fingerDown=false;
async function Input(type,x=0,y=0){
 if(touch&&type==='up'&&!fingerDown)return;
 if(type==='down')fingerDown=true;if(type==='up')fingerDown=false;
 if(touch)await cdp.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{x,y}]});
 else {if(type==='down'){await page.mouse.move(x,y);await page.mouse.down();}if(type==='move')await page.mouse.move(x,y,{steps:6});if(type==='up')await page.mouse.up();}
 await page.waitForTimeout(50);
}
async function Select(id){await Input('up');await page.locator('[data-tool="'+id+'"]').click();}
async function Grab(id){
 const t=(await Probe()).targets.find(t=>t.id===id);
 await Input('down',t.screen.x,t.screen.y);await Step(5);
 Check((await Probe()).active===id||(await Probe()).transfer?.id===id,'接触可拾取 '+id);return t;
}
async function Pull(id,kind='pullScreen',steps=100){
 const t=await Grab(id);await Input('move',t[kind].x,t[kind].y);await Step(steps);
 return(await Probe()).targets.find(t=>t.id===id);
}
async function Land(id,tool='scoop',kind='pullScreen'){
 await Select(tool);const t=await Pull(id,kind);
 Check(t.state==='held','工具托住 '+id);
 await Input('up');await Step(230);
 Check((await Probe()).harvest.filter(t=>t.id===id).length===1,'只收一次 '+id);
}
async function Soften(id){
 await Select('drops');const t=(await Probe()).targets.find(t=>t.id===id);
 await Input('down',t.screen.x,t.screen.y);await Input('up');await Step(195);
 Check((await Probe()).targets.find(t=>t.id===id).softened>.85,'渗透到位 '+id);
}
async function Sample(seconds){
 return page.evaluate(seconds=>new Promise(resolve=>{
  const a=__EarSpaDebug.audio.analyser(),buf=new Float32Array(a.fftSize);let peak=0,sum=0,n=0;
  const timer=setInterval(()=>{a.getFloatTimeDomainData(buf);for(const v of buf){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}},15);
  setTimeout(()=>{clearInterval(timer);resolve({peak,rms:Math.sqrt(sum/n)});},seconds*1000);
 }),seconds);
}
try{
 const url=process.argv.find(x=>x.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
 await page.evaluate(()=>localStorage.setItem('earspa3d.shop.v1',JSON.stringify({version:1,coins:500,day:3,toolLevels:{earPickBamboo:2}})));
 await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug);
 Check((await Probe()).shop.day===3&&(await Probe()).shop.inventory.tools.length===4,'旧存档保留余额和等级并补齐库存');
 await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);
 await page.locator('#shop-open').click();
 await page.locator('[data-select-tool="brush"]').click();await page.locator('[data-purchase="brush"]').click();await page.locator('[data-select-tool="suction"]').click();await page.locator('[data-purchase="suction"]').click();
 await page.locator('[data-shop-tab="skins"]').click();await page.locator('[data-select-tool="scoop"]').click();
 await page.locator('[data-skin="walnut"]').click();
 const saved=(await Probe()).shop;
 Check(saved.coins===339&&saved.inventory.equipped.scoop==='walnut'&&saved.inventory.tools.length===6,'购买两件工具及耳勺皮肤扣款正确');
 await page.locator('[data-skin="walnut"]').click();Check((await Probe()).shop.coins===339,'重复装备皮肤不扣款');
 await page.screenshot({path:path.join(here,'_dev','Shot_Shop_'+width+'.png')});
 await page.locator('#shop-close').click();
 await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug);
 Check((await Probe()).shop.inventory.equipped.scoop==='walnut'&&(await Probe()).shop.inventory.tools.includes('suction'),'新工具与单工具皮肤刷新后保留');
 await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);
 await page.evaluate(()=>__EarSpaDebug.audio.setBgmVolume(0));await page.waitForTimeout(2200);
 const idle=await Sample(.4);
 // 收音开始于真实接触，涵盖摩擦与粘附断裂，未直接调用播放函数。
 const signal=Sample(1.8);signal.catch(()=>{});
 await Select('scoop');await Pull(0);
 const digging=await signal;
 Check(digging.peak>.005&&digging.rms>.0003&&digging.peak<.99,'真实挖取有清楚输出且不削波');
 report.audio={idle,digging};
 await Input('up');await Step(230);
 // 耳勺对湿块只能松边，镊子才夹出。
 const wet=(await Probe()).targets.find(t=>t.type==='wet'&&t.state==='attached');
 await Select('scoop');let w=await Pull(wet.id);
 Check(w.physics.anchors===2&&!w.physics.detached,'耳勺松边保留两处粘附，不能代替镊子');
 await Input('up');await Step(200);await Land(wet.id,'tweezers');
 // 干薄片硬夹会裂，清洁度不凭裂片增加。
 const dry=(await Probe()).targets.find(t=>t.type==='dry'&&!t.fine&&t.state==='attached');
 const cleanBefore=(await Probe()).cleanliness;
 await Select('tweezers');await Pull(dry.id);await Input('up');await Step(90);
 let pieces=(await Probe()).targets.filter(t=>t.fragment);
 Check(pieces.length>=3&&pieces.length<=5&&Math.abs(pieces.reduce((s,t)=>s+t.mass,0)-dry.mass)<1e-8,'方向切割得到真实碎片且质量守恒');
 Check((await Probe()).cleanliness===cleanBefore,'碎裂没有清洁收益');
 Check(pieces.every(t=>t.triangles>10&&t.state==='attached'),'碎片具有独立可拾取几何');
 await page.screenshot({path:path.join(here,'_dev','Shot_Fragment_'+width+'.png')});
 await Land(pieces[0].id);
 await Land(pieces[1].id,'brush','sweepScreen');
 await Select('suction');
 await Pull(pieces[2].id);await Input('up');await Step(160);
 Check(!(await Probe()).harvest.some(t=>t.id===pieces[2].id),'吸引管不吸干燥碎片');
 await Soften(pieces[2].id);await Select('suction');
 await Grab(pieces[2].id);
 for(let i=0;i<35&&!(await Probe()).transfer;i++)await Step(3);
 const sucking=await Probe();
 Check(sucking.transfer?.mode==='suction','吸引接触直接进入吸入过程');
 await page.screenshot({path:path.join(here,'_dev','Shot_Suction_'+width+'.png')});
 await Input('up');await Step(180);
 Check((await Probe()).harvest.some(t=>t.id===pieces[2].id),'湿碎屑吸入后计入清洁量');
 // 硬结：强拉先痛再碎，继续清掉所有残留，完整经营回合仍可完成。
 const hard=(await Probe()).targets.find(t=>t.type==='impacted'&&!t.fragment);
 await Select('tweezers');await Pull(hard.id);await Input('up');await Step(100);
 Check((await Probe()).painCount>=1&&(await Probe()).satisfaction<90,'强拉硬结让客人疼痛并降低满意度');
 Check((await Probe()).rendering.irritation.some(v=>v>.1),'未软化强拉留下局部红肿状态');
 await page.screenshot({path:path.join(here,'_dev','Shot_Irritation_'+width+'.png')});
 Check((await Probe()).audio.recentPlayback.some(t=>t.cue==='customerPain'&&!t.truncated&&t.seconds===t.naturalSeconds),'客人抱怨整句播放不截断');
 pieces=(await Probe()).targets.filter(t=>t.fragment&&t.state==='attached');
 for(const t of pieces)await Land(t.id);
 for(const target of (await Probe()).targets.filter(t=>t.state==='attached')){if((await Probe()).targets.find(t=>t.id===target.id).state==='collected')continue;await Land(target.id,target.fine?'feather':target.type==='dry'?'scoop':'tweezers');}
 await Step(180);
 const final=await Probe();report.final=final;
 Check(final.phase==='complete'&&Math.abs(final.cleanliness-1)<1e-8&&final.fractures>=2&&final.harvest.length>21,'发生两次碎裂仍能清完全部质量并结算');
 Check(final.shop.totalCustomers===1&&final.shop.log[0].comfort<1,'经营结算读取实际满意度');
 await page.screenshot({path:path.join(here,'_dev','Shot_TactileComplete_'+width+'.png')});
 await page.locator('#sound-toggle').click();await page.waitForTimeout(400);
 const muted=await Sample(.4);report.audio.muted=muted;Check(muted.peak<.00001,'总静音输出归零');
 Check(report.errors.length===0,'无异常与资产请求失败');
 report.clean=true;console.log('PASS tactile '+width+': '+report.checks.length+' checks');
}catch(e){report.clean=false;report.failure=e.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev','Shot_TactileFailure_'+width+'.png')});throw e;}
finally{await fs.writeFile(path.join(here,'_dev','Data_TactileAudit_'+width+'.json'),JSON.stringify(report,null,2));await browser.close();}
