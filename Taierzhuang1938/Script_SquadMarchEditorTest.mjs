import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'Taierzhuang1938/_shots/SquadMarch');await fs.mkdir(out,{recursive:true});
const base=process.env.SQUAD_MARCH_PREVIEW;
const server=base?null:await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(`${base||`http://127.0.0.1:${server.address().port}`}/Taierzhuang1938/?phase=1&quality=low&scale=small&editor=squadMarch`,{waitUntil:'load',timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready&&window.Tengxian.editor?.ActiveId==='squadMarch',null,{timeout:240000});
  const initial=await page.evaluate(()=>{const T=window.Tengxian,e=T.editor.active;e.playing=false;return {count:e.actors.length,model:e.actors.every(a=>a.meshSource.startsWith('glb:')),elapsed:T.ai.time};});
  assert.equal(initial.count,6);assert.ok(initial.model,'all six people use the actual game GLBs');
  await page.getByRole('button',{name:'3 人',exact:true}).click();
  assert.equal(await page.getByLabel('小队人数').inputValue(),'3');
  await page.getByLabel('随机种子').fill('173');await page.getByLabel('随机种子').press('Tab');
  const slider=page.getByLabel('速度（米/秒）');await slider.focus();await slider.press('ArrowRight');
  assert.ok(await page.evaluate(()=>window.Tengxian.editor.active.config.tuning.speedMps>3.8));
  const canvas=page.getByLabel('行进路线图：点击增加点，拖动移动点，右键删除点');await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox();const point=await page.evaluate(()=>{const e=window.Tengxian.editor.active;return {p:e.config.route[0],span:e.RouteBounds()};});
  const px=box.x+(point.p.x/point.span+.5)*box.width,pz=box.y+(point.p.z/point.span+.5)*box.height;
  await page.mouse.move(px,pz);await page.mouse.down();await page.mouse.move(px+20,pz-12,{steps:5});await page.mouse.up();
  assert.notEqual(await page.evaluate(()=>window.Tengxian.editor.active.config.route[0].x),point.p.x,'actual pointer drag changes route');
  await page.getByRole('button',{name:'保存此人数的样式',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出配置',exact:true}).click();
  const download=await downloadPromise,exportPath=path.join(out,download.suggestedFilename());await download.saveAs(exportPath);
  const exported=JSON.parse(await fs.readFile(exportPath,'utf8'));assert.equal(exported.count,3);assert.equal(exported.seed,'173');
  await page.locator('[data-squad-march] input[type=file]').setInputFiles({name:'Data_SquadMarch_Import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exported,count:9,leaderIndex:8}))});
  await page.waitForFunction(()=>window.Tengxian.editor.active.config.count===9);assert.equal(await page.getByLabel('小队人数').inputValue(),'9');
  console.log('ok visible count/seed/slider controls, pointer route edit, JSON download and file import');
  const adapter=await page.evaluate(async()=>{
    const {SquadMarchAi}=await import('./Script_SquadMarchAi.mjs');const {Vector3}=await import('three');
    const ai={time:10,ctx:{nav:{Walkable:()=>true},battlefield:{GroundHeight:()=>0}}};
    const s={id:'Lifecycle',alive:true,position:new Vector3(),goal:new Vector3(4,0,4),yaw:0,moveSpeed:0,order:'hold',holdZone:{id:'old'},manualGoalUntil:99};
    const oldGoal=s.goal.clone(),oldZone=s.holdZone;const a=new SquadMarchAi(ai,[s],{route:[{x:0,z:0},{x:0,z:-20}]});a.Update(.1);
    const controlled=s.p012Guided&&s.squadMarchCommand.controlled;s.target={};a.Update(.1);
    const released=!s.squadMarchCommand&&!Object.hasOwn(s,'p012Guided')&&s.order==='hold'&&s.holdZone===oldZone&&s.manualGoalUntil===99&&s.goal.equals(oldGoal);
    s.target=null;a.Update(.1);s.order='retreat';s.manualGoalUntil=101;s.goal.set(20,0,20);a.Dispose();
    return {controlled,released,preserved:s.order==='retreat'&&s.manualGoalUntil===101&&s.goal.x===20};
  });assert.deepEqual(adapter,{controlled:true,released:true,preserved:true});
  for(const count of [3,6,12,24]){
    const result=await page.evaluate(count=>{
      const T=window.Tengxian,e=T.editor.active;e.LoadConfig({...e.config,count,leaderIndex:count-1,seed:'173',route:[{x:0,z:12},{x:0,z:-250}]});e.playing=false;
      for(let i=0;i<900;i++)e.Step(1/60);
      const snapshot=e.Snapshot();e.SaveProfile();return snapshot;
    },count);
    assert.equal(result.actors.length,count);
    assert.ok(result.events.some(e=>e.type==='stop'),'visible real stops occur');
    assert.ok(result.events.every(e=>e.id!==`Member${count}`||e.type!=='brake'),'configured leader is exempt');
    assert.ok(result.actors.every(a=>a.meshSource.startsWith('glb:')));
    console.log(`ok ${count}: real actors, selected leader, seeded stops, saved profile`);
  }
  await page.evaluate(()=>{const e=window.Tengxian.editor.active;e.LoadConfig({...e.config,count:6,leaderIndex:0,route:[{x:-12,z:10},{x:-12,z:-12},{x:12,z:-12},{x:12,z:10}]});e.playing=false;for(let i=0;i<420;i++)e.Step(1/60);e.Frame();});
  await page.screenshot({path:path.join(out,'Scene_SquadMarchSix.png')});
  const rest=await page.evaluate(()=>{const e=window.Tengxian.editor.active;for(let i=0;i<600;i++){e.Step(1/60);const at=e.soldiers.findIndex(s=>s.squadMarchCommand?.status==='resting'&&Math.abs(s.squadMarchCommand.lookYaw)>.15);if(at>=0){e.selected=at;e.follow=true;e.Frame();return {id:e.soldiers[at].memberId,speed:e.soldiers[at].moveSpeed,look:e.soldiers[at].squadMarchCommand.lookYaw};}}return null;});
  assert.ok(rest&&rest.speed===0&&Math.abs(rest.look)>.15,'resting actor is stopped and actually scanning');
  await page.screenshot({path:path.join(out,'Scene_SquadMarchRest.png')});
  const edited=await page.evaluate(()=>{const e=window.Tengxian.editor.active;const route=e.config.route.map(p=>({...p}));route[1].x-=3;e.SetRoute(route);const saved=e.Export();const good=e.LoadConfig(saved);const before=e.config.count;const bad=e.LoadConfig({...saved,count:0});return {good,bad,before,count:e.config.count,x:e.config.route[1].x};});
  assert.ok(edited.good&&!edited.bad);assert.equal(edited.count,edited.before);assert.equal(edited.x,-15);
  const closed=await page.evaluate(()=>{const T=window.Tengxian,e=T.editor.active;const config=e.config;e.SaveProfile();T.editor.Close();const count=T.editor.studio.stand.children.length;T.editor.Open('squadMarch');const again=T.editor.active.config;T.editor.Close();return {count,saved:again.count===config.count&&again.seed===config.seed,elapsed:T.ai.time,active:T.editor.ActiveId,pad:T.editor.studio.pad.scale.x};});
  assert.equal(closed.count,0);assert.ok(closed.saved);assert.equal(closed.active,null);assert.equal(closed.pad,1);assert.equal(closed.elapsed,initial.elapsed,'editor does not advance the live mission');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'Data_SquadMarchEditorReport.json'),JSON.stringify({initial,edited,closed,rest,adapter,errors},null,2));
  console.log(`ok config roundtrip, invalid import rejection, persistent styles, clean exit; screenshot ${out}`);
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
