// Actual gallery controls and unmodified reference/render comparisons. Runner owns GPU slot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const root = path.resolve(import.meta.dirname, '..'), here = import.meta.dirname;
const output = path.join(here, 'tmp/HairLab/ReferenceReview'); fs.mkdirSync(output, {recursive:true});
const references = JSON.parse(fs.readFileSync(path.join(here, 'Hair/Data_HairReferences.json'))).looks;
const referenceRoot = path.join(process.env.USERPROFILE, 'OneDrive/Sync/饮河/FPS/角色/Tripo');
const subjects = {Shunzi:7, Luo:8, HeYoutian:9, SoldierA:10, Jia:11, Yi:12};
const only = process.env.HAIR_REF_SUBJECTS?.split(',');
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(root,0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({extraArgs:['--mute-audio']});
const errors = [], result = {viewport:[1280,720], subjects:{}};
try {
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror', error=>errors.push(String(error)));
  page.on('console', message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
    localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
  });
  await page.goto(`${base}/Taierzhuang1938/?hair=1&quality=high&manual=1&shot=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{
    const state=window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.HairRange.State();
    if(state?.error)throw new Error(state.error);
    return state?.ready;
  },null,{timeout:400000,polling:500});
  const Step = n=>page.evaluate(n=>Taierzhuang.StepFrames(n,1/60,true),n);
  const Target = ()=>page.evaluate(()=>Taierzhuang.Debug.HairRange.State().camera.target);
  await page.evaluate(()=>Taierzhuang.Debug.HairRange.Camera('overview'));
  await page.locator('#view').click({position:{x:950,y:350}});
  const before = await Target();
  await page.keyboard.down('w'); await Step(30); await page.keyboard.up('w');
  const moved = await Target();
  const distance = Math.hypot(...moved.map((x,i)=>x-before[i]));
  assert.ok(Math.abs(distance-.9)<.015,`W camera movement: ${distance}`);
  await Step(10); assert.deepEqual(await Target(),moved,'keyup stops camera');
  await page.keyboard.down('w'); await page.keyboard.down('d'); await Step(30); await page.keyboard.up('w'); await page.keyboard.up('d');
  const diagonal = await Target();
  assert.ok(Math.abs(Math.hypot(...diagonal.map((x,i)=>x-moved[i]))-.9)<.015,'diagonal movement is normalized');
  await page.keyboard.down('Shift'); await page.keyboard.down('a'); await Step(10); await page.keyboard.up('a'); await page.keyboard.up('Shift');
  const boosted = await Target();
  assert.ok(Math.abs(Math.hypot(...boosted.map((x,i)=>x-diagonal[i]))-.9)<.015,'Shift accelerates movement');
  const slider = page.locator('[data-param="clump"]'); await slider.focus();
  await page.keyboard.down('w'); await Step(15); await page.keyboard.up('w');
  assert.deepEqual(await Target(),boosted,'editing a range control does not move the camera');
  await page.locator('#view').click({position:{x:950,y:350}});
  await page.keyboard.down('s'); await Step(3);
  const resumed = await Target();
  assert.ok(Math.abs(Math.hypot(...resumed.map((x,i)=>x-boosted[i]))-.09)<.005,'canvas click resumes movement after editing a control');
  await page.mouse.down(); await page.mouse.up(); await Step(3);
  const afterPointer = await Target();
  assert.ok(Math.abs(Math.hypot(...afterPointer.map((x,i)=>x-resumed[i]))-.09)<.005,'mouse release does not release a held movement key');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const blurred = await Target(); await Step(15); await page.keyboard.up('s');
  assert.deepEqual(await Target(),blurred,'window blur releases movement keys');
  result.camera = {distance, normalized:true, boost:true, inputGuard:true, resumesAfterEditing:true, pointerReleaseKeepsMovement:true, blurStops:true};
  await page.evaluate(()=>{Taierzhuang.Debug.HairRange.Camera('overview'); Taierzhuang.Debug.HairRange.ShowPanel(true);});
  await Step(20);
  result.theme = await page.evaluate(()=>{
    const p=document.getElementById('hair-range-panel'),b=p.querySelector('.edBtn'),s=getComputedStyle(p);
    return {panelClass:p.className,font:s.fontFamily,radius:s.borderRadius,colour:s.color,buttonRadius:getComputedStyle(b).borderRadius,scheme:getComputedStyle(p.parentElement).colorScheme};
  });
  assert.match(result.theme.panelClass,/edPanel/); assert.equal(result.theme.radius,'0px'); assert.equal(result.theme.buttonRadius,'0px');
  assert.match(result.theme.font,/TzUiSans/); assert.equal(result.theme.scheme,'dark');
  await page.screenshot({path:path.join(output,'Scene_ThemedPanel.png')});
  const compare = await browser.newPage({viewport:{width:1280,height:720}});
  for (const [key,index] of Object.entries(subjects)) {
    if(only && !only.includes(key))continue;
    const reference=references[key],source=path.join(referenceRoot,reference.source);
    const bytes=fs.readFileSync(source);assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.sha256);
    await page.evaluate(index=>{const a=Taierzhuang.Debug.HairRange;a.ShowPanel(false);a.Focus(index,'front');a.Toggle('labels',false);},index);
    await page.mouse.move(950,350); await page.mouse.wheel(0,-350); await Step(36);
    const file=path.join(output,`Scene_${key}_Front.png`);await page.screenshot({path:file});
    if (process.env.HAIR_REF_MARKS) {
      const marks=JSON.parse(fs.readFileSync(path.join(here,'Hair/Heads/Data_HairHeads.json'))).heads[key];
      await page.evaluate(({key,marks})=>{
        const host=Taierzhuang,head=host.scene.getObjectByName(`HairHead_cast_${key}_Cast`);
        let mesh;head.traverse(o=>{if(!mesh&&o.isMesh&&!o.userData.hairGroom)mesh=o;});
        const pos=mesh.geometry.attributes.position;
        for(const [name,mark] of Object.entries(marks)){
          if(!['glabella','subnasale','stomion','menton'].includes(name))continue;
          let best=1e9,id=0;for(let i=0;i<pos.count;i++){const cost=Math.abs(pos.getX(i))*2+Math.abs(pos.getY(i)-mark[1])+(pos.getZ(i)>0?1:0);if(cost<best){best=cost;id=i;}}
          const v=host.camera.position.clone().fromBufferAttribute(pos,id).applyMatrix4(mesh.matrixWorld).project(host.camera);
          const tag=document.createElement('div');tag.className='hairReviewMark';tag.textContent=name;tag.style.cssText=`position:fixed;z-index:9999;left:${(v.x*.5+.5)*1280}px;top:${(-v.y*.5+.5)*720}px;background:#ffae00;color:#000;font:12px sans-serif`;document.body.appendChild(tag);
        }
      },{key,marks});
      await page.screenshot({path:path.join(output,`Scene_${key}_Landmarks.png`)});
      await page.locator('.hairReviewMark').evaluateAll(tags=>tags.forEach(t=>t.remove()));
    }
    const actual=fs.readFileSync(file).toString('base64');
    await compare.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#101314;color:#eeefec;font:14px system-ui}.head{height:48px;display:flex;align-items:center;border-bottom:1px solid #c4c6bb33}.head span{width:50%;padding:0 20px}.pair{display:grid;grid-template-columns:1fr 1fr;height:672px}.pair img{width:100%;height:100%;min-width:0;object-fit:contain;background:#e9e9e7}.pair img.actual{object-fit:cover;background:#101314}</style><div class="head"><span>${key} · 原始个人头部参考</span><span>当前浏览器实际渲染 · 发丝 / 发片胡子</span></div><div class="pair"><img src="data:image/png;base64,${bytes.toString('base64')}"><img class="actual" src="data:image/png;base64,${actual}"></div>`);
    await compare.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
    await compare.screenshot({path:path.join(output,`Compare_${key}.png`)});
    result.subjects[key]={reference:reference.source,sha256:reference.sha256,actual:file};
    for(const view of ['side','back']){
      await page.evaluate(({index,view})=>Taierzhuang.Debug.HairRange.Focus(index,view),{index,view});await Step(24);
      await page.screenshot({path:path.join(output,`Scene_${key}_${view}.png`)});
    }
  }
  assert.deepEqual(errors,[],'no gallery or shader errors');
  result.errors=errors;fs.writeFileSync(path.join(output,'Data_ReferenceReview.json'),JSON.stringify(result,null,2));
  console.log('HairReferenceBrowserTest passed',JSON.stringify({camera:result.camera,theme:result.theme,subjects:Object.keys(result.subjects),output}));
} finally {await browser.close();server?.close();}
