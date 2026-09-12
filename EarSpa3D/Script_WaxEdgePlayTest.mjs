import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const profiles=process.argv.includes('--desktop')?[[1697,674,false]]:[[1697,674,false],[390,844,true],[320,568,true],[844,390,true]];
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of profiles){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch}),cdp=await page.context().newCDPSession(page),report={width,height,touch,checks:[],errors:[]};reports.push(report);
 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Probe=()=>page.evaluate(()=>__EarSpaProbe());
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 async function Input(type,p={x:0,y:0},right=false){
  if(touch)await cdp.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{x:p.x,y:p.y}]});
  else{if(type!=='up')await page.mouse.move(p.x,p.y);if(type==='down')await page.mouse.down({button:right?'right':'left'});if(type==='up')await page.mouse.up({button:right?'right':'left'});}
 }
 async function Candidates(){return page.evaluate(async()=>{
  const T=await import('three'),{WaxEdgeContact}=await import('./Script_WaxEdgeContact.mjs'),{InstrumentContact}=await import('./Script_InstrumentInteraction.mjs');
  const {view,core}=__EarSpaDebug,q=__EarSpaProbe().rendering.toolRotation,result=[];core.scene.updateMatrixWorld(true);
  for(const c of view.chunks){
   if(c.id!==3||c.type!=='dry'||c.fine||c.state!=='attached'||c.depth>view.Reach('scoop'))continue;
   const s=c.body.surface,edges=new Map();for(const ids of s.triangles)for(let i=0;i<3;i++){const a=ids[i],b=ids[(i+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});}
   for(const e of edges.values()){
    if(e.count!==1)continue;
    const point=new T.Vector3().fromArray(s.points[e.a]).lerp(new T.Vector3().fromArray(s.points[e.b]),.5);
    const edge=WaxEdgeContact(c.body,point.toArray());if(!edge)continue;
    point.addScaledVector(new T.Vector3().fromArray(edge.inward),.03).addScaledVector(c.normal,(s.thickness[e.a]+s.thickness[e.b])*.5);
    const screen=view.Project(point);if(screen.x<60||screen.x>innerWidth-65||screen.y<100||screen.y>innerHeight-(innerWidth<500?105:25))continue;
    const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(Math.floor(screen.x)/innerWidth*2-1,1-Math.floor(screen.y)/innerHeight*2),core.camera);
    const hit=ray.intersectObject(c.mesh)[0];if(!hit||view.Pick(Math.floor(screen.x),Math.floor(screen.y))!==c)continue;
    const actual=WaxEdgeContact(c.body,hit.point.toArray());if(!actual)continue;
    const contact=InstrumentContact('scoop',q,c.normal.toArray(),{edgeContact:actual});
    if(contact.facing<.18&&contact.edgeFacing>.55){
     const end=view.Project(hit.point.clone().addScaledVector(new T.Vector3().fromArray(actual.inward),.5).addScaledVector(c.normal,.35));
     const outside=[];
     for(const distance of [.08,.12,.18,.24,.32]){
      const p=view.Project(hit.point.clone().addScaledVector(new T.Vector3().fromArray(actual.inward),-distance));p.x=Math.floor(p.x);p.y=Math.floor(p.y);
      ray.setFromCamera(new T.Vector2(p.x/innerWidth*2-1,1-p.y/innerHeight*2),core.camera);
      if(!ray.intersectObject(c.mesh).length)outside.push(p);
     }
     result.push({id:c.id,screen:{x:Math.floor(screen.x),y:Math.floor(screen.y)},end,contact,edge:actual,outside});
    }
   }
  }
  return result.sort((a,b)=>b.contact.edgeFacing-a.contact.edgeFacing);
 });}
 try{
  await page.addInitScript(()=>{localStorage.setItem('earspa3d.shop.v1',JSON.stringify({version:2,coins:500,day:2,toolLevels:{}}));});
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);
  const first=(await Probe()).targets.find(c=>c.id===3);
  if(touch)await page.locator('#mode-turn').click();await Input('down',first.screen,true);
  let candidates=[];for(let i=0;i<100&&!candidates.length;i++){await Step(3);candidates=await Candidates();}
  await Input('up',first.screen,true);if(touch)await page.locator('#mode-force').click();
  Check(candidates.length>0,'real rotation reaches a visible side edge rejected by the old wall-normal condition');
  const target=candidates[0];report.target=target;
  let rim=false;report.rimAttempts=[];
  for(const point of target.outside){
   await Input('down',point);await Step(2);const p=await Probe(),c=p.targets.find(c=>c.id===target.id);
   report.rimAttempts.push({point,active:p.active,aligned:c.aligned});rim=p.active===target.id&&c.aligned;
   if(rim)await page.screenshot({path:path.join(here,'_dev/Shot_WaxRimOverlap_'+width+'.png')});
   await Input('up');await Step(90);if(rim)break;
  }
  Check(rim,'spoon rim grips actual wax while the pointer ray misses its outline');
  await Input('down',target.screen);await Step(12);
  let p=await Probe(),c=p.targets.find(c=>c.id===target.id);report.grip={active:p.active,aligned:c.aligned,force:c.physics.force};
  Check(p.active===target.id&&c.aligned,'side edge establishes an aligned grip through real input');
  const anchors=c.physics.anchors;await Step(60);p=await Probe();c=p.targets.find(c=>c.id===target.id);
  Check(c.physics.anchors===anchors&&c.physics.force<1e-5,'stationary edge contact does not auto-extract');
  await page.screenshot({path:path.join(here,'_dev/Shot_WaxEdgeContact_'+width+'.png')});
  let force=0,bend=0;report.motion=[];
  for(let i=1;i<=24;i++){
   await Input('move',{x:target.screen.x+(target.end.x-target.screen.x)*i/24,y:target.screen.y+(target.end.y-target.screen.y)*i/24});await Step(3);
   p=await Probe();c=p.targets.find(c=>c.id===target.id);force=Math.max(force,c.physics.force);bend=Math.max(bend,c.physics.bend);
   report.motion.push({state:c.state,aligned:c.aligned,force:c.physics.force,bend:c.physics.bend,anchors:c.physics.anchors});
   if(['fractured','held'].includes(c.state))break;
  }
  Check(force>.1&&bend>.0001,'real edge scraping transfers force and bends the material');
  Check(p.cleanliness===0,'side scraping does not award collection before landing');
  await page.screenshot({path:path.join(here,'_dev/Shot_WaxEdgeScrape_'+width+'.png')});await Input('up');
  Check(report.errors.length===0,'no console, shader, resource or uncaught errors');
  console.log('PASS wax edge '+width+'×'+height+': '+report.checks.length+' real '+(touch?'touch':'mouse')+' checks');
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev/Shot_WaxEdgeFailure_'+width+'.png')});throw error;}
 finally{await fs.writeFile(path.join(here,'_dev/Data_WaxEdgePlayReport.json'),JSON.stringify(reports,null,2));await page.close();}
}}finally{await browser.close();}
