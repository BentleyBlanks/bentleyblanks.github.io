import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'Taierzhuang1938/_shots/FacialEditor');
await fs.mkdir(out,{recursive:true});
const port=process.argv.find(arg=>arg.startsWith('--port='))?.split('=')[1];
const server=port?null:await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try {
  await page.goto(`http://127.0.0.1:${port||server.address().port}/Taierzhuang1938/?phase=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
  await page.evaluate(()=>window.Tengxian.Debug.OpenEditor('facial'));
  await page.waitForFunction(()=>window.Tengxian?.editor?.active?.buffer,null,{timeout:180000});
  const initial=await page.evaluate(()=>{const e=window.Tengxian.editor.active;return {id:window.Tengxian.editor.ActiveId,face:e.face.controls.length,model:e.actor.modelId,cue:e.cue.id,duration:e.Duration};});
  assert.equal(initial.id,'facial');assert.equal(initial.face,13);assert.ok(initial.duration>1); // 13 Face_ bones since the 01-06 face rigs (docs/Data_CharacterSpeech.md); the NRA05 original had 11
  await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>{const e=window.Tengxian.editor.active;return e.playing&&e.CurrentTime()>.1&&e.ctx.state==='running';}));
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  const paused=await page.evaluate(()=>window.Tengxian.editor.active.time);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.Tengxian.editor.active.time),paused);
  await page.getByRole('button',{name:'+1 帧',exact:true}).click();
  assert.ok(Math.abs(await page.evaluate(()=>window.Tengxian.editor.active.time)-paused-1/60)<1e-8);
  await page.getByLabel('播放速度').selectOption('0.5');
  await page.getByLabel('播放范围').selectOption('0');
  await page.getByRole('button',{name:'循环选段',exact:true}).click();
  await page.evaluate(()=>{const e=window.Tengxian.editor.active;e.Seek(e.Range[1]-.05);});
  await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>{const e=window.Tengxian.editor.active;return e.playing&&e.CurrentTime()<e.Range[1]-.1;}),'slow loop restarts the selected source interval');
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.getByRole('button',{name:'循环选段',exact:true}).click();await page.getByLabel('播放范围').selectOption('all');await page.getByLabel('播放速度').selectOption('1');
  const speaking=await page.evaluate(()=>{const e=window.Tengxian.editor.active;let at=0;for(let i=0;i<e.samples.levels.length;i++)if(e.samples.levels[i]>.65){at=i/60;break;}e.Seek(at);const jaw=e.face.controls.find(c=>c.name==='Face_Jaw');return {time:e.time,angle:jaw.bone.quaternion.angleTo(jaw.quaternion)};});
  assert.ok(speaking.angle>.04,'recording deforms real jaw bones');
  await page.screenshot({path:path.join(out,'Scene_FacialSpeaking.png')});
  await page.getByRole('button',{name:'嘴部特写',exact:true}).click();await page.screenshot({path:path.join(out,'Scene_FacialMouth.png')});
  await page.getByRole('button',{name:'正面',exact:true}).click();
  await page.getByRole('button',{name:'中性表情对照',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.Tengxian.editor.active.face.level),0);
  await page.screenshot({path:path.join(out,'Scene_FacialNeutral.png')});
  await page.getByRole('button',{name:'中性表情对照',exact:true}).click();
  await page.getByLabel('抬眉',{exact:true}).fill('0.7');await page.getByLabel('抬眉',{exact:true}).dispatchEvent('input');
  await page.getByRole('button',{name:'记录当前关键帧',exact:true}).click();
  await page.getByLabel('检查备注').fill('检查此帧嘴角与眉毛');await page.getByRole('button',{name:'保存本地草稿',exact:true}).click();
  const draft=await page.evaluate(()=>{const e=window.Tengxian.editor.active,d=e.Document();let rejected=false;try{e.Import({...d,sha256:'obsolete'});}catch{rejected=true;}return {document:d,rejected};});
  assert.ok(draft.rejected);assert.equal(draft.document.keys[0].values.brow,.7);
  // Since the 01-06 face rigs most speakers (Yaowa too) have a face (docs/Data_CharacterSpeech.md): pick a speaker whose
  // chosen cue has a recording but whose model has no face rig.
  const speakers=await page.getByLabel('角色',{exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value));
  const unbound=await page.evaluate(speakers=>{const e=window.Tengxian.editor.active,start=e.who;
    for(const who of speakers){e.SelectActor(who,false);if(!e.face&&e.RecordingEntry(e.cueSelect.Value()))return who;}
    e.SelectActor(start,false);return null;},speakers);
  assert.ok(unbound,'a speaker with a recording but no face rig exists');
  await page.getByLabel('角色',{exact:true}).selectOption(unbound);
  await page.waitForFunction(who=>window.Tengxian.editor.active.buffer&&window.Tengxian.editor.active.who===who,unbound);
  assert.match(await page.locator('[data-facial]').innerText(),/无面部骨骼/);
  assert.equal(await page.getByLabel('抬眉',{exact:true}).isDisabled(),true);
  await page.screenshot({path:path.join(out,'Scene_FacialUnbound.png')});
  // Shared conversation must not animate Luo during another actor's line.
  await page.getByLabel('角色',{exact:true}).selectOption('luo');
  await page.evaluate(()=>window.Tengxian.editor.active.LoadCue('BunkerBanter'));
  const isolation=await page.evaluate(()=>{const e=window.Tengxian.editor.active;e.Seek(.2);return {level:e.face.level,who:e.cue.lines[0].who};});
  assert.notEqual(isolation.who,'luo');assert.equal(isolation.level,0);
  await page.evaluate(async()=>{const e=window.Tengxian.editor.active;await Promise.all([e.LoadCue('SupportOrder'),e.LoadCue('GuideFollow')]);});
  assert.equal(await page.evaluate(()=>window.Tengxian.editor.active.cue.id),'GuideFollow','latest asynchronous selection wins');
  await page.route('**/AudioVoice_FirstLevelTankTerror.mp3*',route=>route.fulfill({status:404,body:'missing'}));
  await page.evaluate(()=>window.Tengxian.editor.active.LoadCue('TankTerror'));
  assert.ok(await page.evaluate(()=>{const e=window.Tengxian.editor.active;return !e.buffer&&!e.playing&&e.status.textContent.includes('加载失败');}),'failed fetch cannot retain the previous recording');
  await page.unroute('**/AudioVoice_FirstLevelTankTerror.mp3*');
  await page.evaluate(()=>window.Tengxian.editor.active.LoadCue('GuideFollow'));
  // Inspect Exit before EditorSuite restores the main menu's own camera route.
  const closed=await page.evaluate(()=>{const g=window.Tengxian,e=g.editor.active,s=e.studio.saved;
    const before={position:s.position.toArray(),quaternion:s.quaternion.toArray(),view:e.savedView?.enabled||false,fov:s.fov};
    let after;const exit=e.Exit;e.Exit=function(){exit.call(this);const c=g.camera;after={position:c.position.toArray(),quaternion:c.quaternion.toArray(),view:c.view?.enabled||false,fov:c.fov};};
    document.querySelector('[aria-label="关闭人物面部"]').click();
    return {studio:g.editor.studio.Active,id:g.editor.ActiveId,before,after};
  });assert.equal(closed.studio,false);assert.deepEqual(closed.after,closed.before,'closing restores the saved camera and projection');
  await page.evaluate(()=>window.Tengxian.Debug.OpenEditor('facial'));
  await page.waitForFunction(()=>window.Tengxian.editor.active?.buffer);
  assert.equal(await page.getByLabel('检查备注').inputValue(),'检查此帧嘴角与眉毛');
  assert.equal(await page.evaluate(()=>window.Tengxian.editor.active.keys.length),1);
  await page.setViewportSize({width:1000,height:760});await page.screenshot({path:path.join(out,'Scene_FacialCompact.png')});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'Data_FacialEditor.json'),JSON.stringify({initial,speaking,paused,isolation,closed,draft,errors},null,2));
  console.log('ok facial editor: real audio clock/jaw, pause/step, neutral, keys, save/reopen, speaker isolation and missing rigs');
} catch(error){console.error(errors);await page.screenshot({path:path.join(out,'Scene_Failure.png'),timeout:10000}).catch(()=>{});console.error(await page.locator('[data-facial]').innerText({timeout:2000}).catch(()=>''));throw error;}
finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
