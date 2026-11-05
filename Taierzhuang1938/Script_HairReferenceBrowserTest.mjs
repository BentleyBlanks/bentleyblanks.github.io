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
const detail = process.env.HAIR_REF_DETAIL === '1';
const viewport = detail ? {width:1920,height:1080} : {width:1280,height:720};
const server = process.env.HAIR_PREVIEW ? null : await ServeRoot(root,0);
const base = process.env.HAIR_PREVIEW || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser({extraArgs:['--mute-audio']});
const errors = [], result = {viewport:[viewport.width,viewport.height], quality:detail?'ultra':'high', subjects:{}};
function FramedImage(bytes, width, height, crop) {
  const scale = Math.min(616 / crop.width, 648 / crop.height);
  const left = (640 - crop.width * scale) / 2 - crop.x * scale;
  const top = (672 - crop.height * scale) / 2 - crop.y * scale;
  return `<div class="portrait"><img src="data:image/png;base64,${bytes.toString('base64')}" style="width:${width*scale}px;height:${height*scale}px;left:${left}px;top:${top}px"></div>`;
}
try {
  const page = await browser.newPage({viewport});
  page.on('pageerror', error=>errors.push(String(error)));
  page.on('console', message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
    localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
  });
  await page.goto(`${base}/Taierzhuang1938/?hair=1&quality=${result.quality}&manual=1&shot=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{
    const state=window.Taierzhuang?.state.ready && window.Taierzhuang.Debug.HairRange.State();
    if(state?.error)throw new Error(state.error);
    return state?.ready;
  },null,{timeout:400000,polling:500});
  const Step = n=>page.evaluate(n=>Taierzhuang.StepFrames(n,1/60,true),n);
  const Target = ()=>page.evaluate(()=>Taierzhuang.Debug.HairRange.State().camera.target);
  const CameraState=()=>page.evaluate(()=>Taierzhuang.Debug.HairRange.State().camera);
  const Distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  await page.evaluate(()=>Taierzhuang.Debug.HairRange.Camera('overview'));
  await page.locator('#view').click({position:{x:930,y:350}});
  const initial=await Target();
  await page.keyboard.down('w');await Step(30);await page.keyboard.up('w');
  assert.deepEqual(await Target(),initial,'W without right mouse does not enter fly navigation');
  await page.mouse.move(930,350);await page.mouse.down({button:'right'});
  const beforeLook=await CameraState();await page.mouse.move(970,375);await Step(1);
  const looked=await CameraState();
  assert.ok(Distance(beforeLook.position,looked.position)<1e-5,'right drag looks around from a fixed camera position');
  assert.ok(Distance(beforeLook.target,looked.target)>.1,'right drag changes viewing direction');
  const before=await Target();
  await page.keyboard.down('w');await Step(30);await page.keyboard.up('w');
  const moved=await Target(),distance=Distance(moved,before);
  assert.ok(Math.abs(distance-.9)<.015,`right mouse + W camera movement: ${distance}`);
  assert.ok(Math.abs(moved[1]-before[1])>.05,'fly movement follows camera pitch');
  await Step(10);assert.deepEqual(await Target(),moved,'keyup stops camera');
  await page.keyboard.down('w');await page.keyboard.down('d');await Step(30);await page.keyboard.up('w');await page.keyboard.up('d');
  const diagonal=await Target();assert.ok(Math.abs(Distance(diagonal,moved)-.9)<.015,'diagonal movement is normalized');
  await page.keyboard.down('Shift');await page.keyboard.down('a');await Step(10);await page.keyboard.up('a');await page.keyboard.up('Shift');
  const boosted=await Target();assert.ok(Math.abs(Distance(boosted,diagonal)-.9)<.015,'Shift accelerates fly movement');
  await page.keyboard.down('e');await Step(10);await page.keyboard.up('e');
  const lifted=await Target();assert.ok(Math.abs(lifted[1]-boosted[1]-.3)<.015,'E rises vertically');
  await page.keyboard.down('q');await Step(10);await page.keyboard.up('q');
  assert.ok(Distance(await Target(),boosted)<.015,'Q lowers vertically');
  const speedBefore=await CameraState();await page.mouse.wheel(0,-160);
  await page.waitForFunction(speed=>Taierzhuang.Debug.HairRange.State().camera.speed>speed,speedBefore.speed);
  assert.equal((await CameraState()).radius,speedBefore.radius,'right mouse + wheel adjusts speed without dollying');
  await page.keyboard.down('w');await Step(3);await page.mouse.up({button:'right'});
  const released=await Target();await Step(15);await page.keyboard.up('w');assert.deepEqual(await Target(),released,'releasing right mouse stops movement');
  await page.mouse.down({button:'right'});await page.keyboard.down('s');await Step(3);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blurred=await Target();await Step(15);await page.keyboard.up('s');await page.mouse.up({button:'right'});
  assert.deepEqual(await Target(),blurred,'window blur releases the navigation gesture');
  await page.evaluate(()=>Taierzhuang.Debug.HairRange.Focus(8,'front'));await Step(2);
  const focused=await CameraState();await page.mouse.move(900,350);await page.mouse.down({button:'middle'});await page.mouse.move(940,380);await page.mouse.up({button:'middle'});await Step(2);
  const panned=await CameraState();assert.ok(Distance(panned.target,focused.target)>.01,'middle drag pans');assert.equal(panned.azimuth,focused.azimuth);
  await page.keyboard.press('f');await Step(2);assert.ok(Distance(await Target(),focused.target)<1e-5,'F frames the selected specimen');
  await page.keyboard.down('Alt');await page.mouse.down();await page.mouse.move(980,410);await page.mouse.up();await page.keyboard.up('Alt');await Step(2);
  const orbited=await CameraState();assert.ok(Distance(orbited.target,focused.target)<1e-5,'Alt + left orbits around selection');assert.ok(Distance(orbited.position,focused.position)>.02);
  await page.keyboard.down('Alt');await page.mouse.down({button:'right'});await page.mouse.move(1000,420);await page.mouse.up({button:'right'});await page.keyboard.up('Alt');await Step(2);
  const zoomed=await CameraState();assert.ok(zoomed.radius>orbited.radius,'Alt + right dollies');assert.equal(zoomed.azimuth,orbited.azimuth);
  // Ordinary scene clicks select the head under the cursor, without orbiting.
  await page.evaluate(()=>{Taierzhuang.Debug.HairRange.Focus(8,'front');Taierzhuang.Debug.HairRange.Select(7);});await Step(2);
  const click=await page.evaluate(async()=>{const T=await import('three');const t=Taierzhuang,p=new T.Vector3(...t.Debug.HairRange.State().camera.target).project(t.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
  await page.mouse.click(click.x,click.y);assert.equal(await page.evaluate(()=>Taierzhuang.Debug.HairRange.State().selected),8,'left click selects the visible head');
  assert.equal(await page.locator('#hair-range-panel input[type="range"]:visible').count(),0,'fine controls start collapsed');
  assert.equal(await page.locator('#hair-range-map [data-row]').count(),4,'all four rows have a persistent purpose guide');
  await page.locator('#hair-range-map [data-row="beard"]').click();
  assert.equal(await page.locator('[data-sample] option').count(),5,'guide selects the beard row and its samples');
  await page.locator('#hair-range-panel [data-row="cast"]').click();
  assert.equal(await page.locator('[data-sample] option').count(),6,'character category only lists six personal looks');
  await page.locator('[data-fold="appearance"] summary').click();
  const slider=page.locator('[data-param="clump"]'),defaultClump=await slider.inputValue();
  await slider.focus();const guarded=await Target();await page.keyboard.down('w');await Step(15);await page.keyboard.up('w');assert.deepEqual(await Target(),guarded,'form editing never flies');
  await slider.press('End');await page.locator('[data-action="reset"]').click();assert.equal(await slider.inputValue(),defaultClump,'restore returns the selected sample to its baked appearance');
  assert.ok(await page.locator('[data-fold="appearance"]').evaluate(el=>el.open),'editing keeps the fold open');
  await page.locator('[data-fold="appearance"] summary').click();
  await page.evaluate(()=>{Taierzhuang.Debug.HairRange.Camera('overview');Taierzhuang.Debug.HairRange.ShowPanel(true);});await Step(20);
  result.camera={distance,rightLook:true,pitchedFly:true,normalized:true,boost:true,vertical:true,wheelSpeed:true,middlePan:true,altOrbit:true,altDolly:true,frameSelection:true,raySelection:true,inputGuard:true,rightReleaseStops:true,blurStops:true};
  result.theme = await page.evaluate(()=>{
    const p=document.getElementById('hair-range-panel'),b=p.querySelector('.edBtn'),s=getComputedStyle(p);
    return {panelClass:p.className,font:s.fontFamily,radius:s.borderRadius,colour:s.color,buttonRadius:getComputedStyle(b).borderRadius,scheme:getComputedStyle(p.parentElement).colorScheme,background:s.backgroundImage,editorBackground:getComputedStyle(document.getElementById('edRoot')).getPropertyValue('--ed-panel')};
  });
  assert.match(result.theme.panelClass,/edPanel/); assert.equal(result.theme.radius,'0px'); assert.equal(result.theme.buttonRadius,'0px');
  assert.match(result.theme.font,/TzUiSans/); assert.equal(result.theme.scheme,'dark');
  assert.ok(result.theme.background.includes('linear-gradient'),'the standalone lab uses the actual advanced-tools gradient theme');
  if (!detail) {
    await page.screenshot({path:path.join(output,'Scene_ThemedPanel.png')});
    await page.setViewportSize({width:390,height:720});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await Step(30);
    const bounds=await page.locator('#hair-range-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=300,'narrow layout leaves the upper scene visible');
    const narrowShot=await page.screenshot({path:path.join(output,'Scene_NarrowPanel.png')});
    result.narrow=await page.evaluate(async bytes=>{
      const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
      const data=ctx.getImageData(0,0,180,300).data;let visible=0;
      for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>30)visible++;
      return {visible,camera:Taierzhuang.Debug.HairRange.State().camera,far:Taierzhuang.camera.far,size:[Taierzhuang.renderer.domElement.width,Taierzhuang.renderer.domElement.height]};
    },Array.from(narrowShot));
    fs.writeFileSync(path.join(output,'Data_NarrowReview.json'),JSON.stringify(result.narrow,null,2));
    assert.ok(result.narrow.visible>2000,'the narrow viewport actually renders the scene above the drawer');
    await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await Step(30);
  }
  const compare = await browser.newPage({viewport:{width:1280,height:720}});
  for (const [key,index] of Object.entries(subjects)) {
    if(only && !only.includes(key))continue;
    const reference=references[key],source=path.join(referenceRoot,reference.source);
    const bytes=fs.readFileSync(source);assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.sha256);
    const baldBytes = fs.readFileSync(path.join(referenceRoot, reference.baldSource));
    assert.equal(createHash('sha256').update(baldBytes).digest('hex'), reference.baldSha256);
    const loaded = await page.evaluate(index => Taierzhuang.Debug.HairRange.State().stations[index].reference, index);
    assert.equal(loaded.look, key);
    assert.equal(loaded.recipeSha256, createHash('sha256').update(JSON.stringify(reference)).digest('hex'), 'browser loaded the current registered groom');
    await page.evaluate(({index,key})=>{
      const api=Taierzhuang.Debug.HairRange;
      api.ShowPanel(false);api.Focus(index,'front');api.Toggle('labels',false);
      const specimens=Taierzhuang.scene.getObjectByName('HairRangeSpecimens');
      for(const head of specimens.children)head.visible=head.name===`HairHead_cast_${key}_Cast`;
    },{index,key});
    const portraitRadius = await page.evaluate(() => Taierzhuang.Debug.HairRange.State().camera.radius);
    await page.mouse.move(950,350); await page.mouse.wheel(0,-350);
    await page.waitForFunction(radius => Taierzhuang.Debug.HairRange.State().camera.radius < radius, portraitRadius);
    await Step(180);
    const actualCrop = await page.evaluate(({key,marks})=>{
      const head=Taierzhuang.scene.getObjectByName(`HairHead_cast_${key}_Cast`);
      const point=Taierzhuang.camera.position.clone();
      const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
      const minimumY=marks.menton[1]-(key==='SoldierA'?.025:.015);
      head.traverse(mesh=>{
        if(!mesh.isMesh || mesh.geometry.isInstancedBufferGeometry)return;
        const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
          point.fromBufferAttribute(positions,i);
          if(point.y<minimumY)continue;
          point.applyMatrix4(mesh.matrixWorld).project(Taierzhuang.camera);
          const x=(point.x*.5+.5)*window.innerWidth,y=(-point.y*.5+.5)*window.innerHeight;
          min[0]=Math.min(min[0],x);min[1]=Math.min(min[1],y);
          max[0]=Math.max(max[0],x);max[1]=Math.max(max[1],y);
        }
      });
      const x=Math.max(0,min[0]-8),y=Math.max(0,min[1]-8);
      return {x,y,width:Math.min(window.innerWidth,max[0]+8)-x,height:Math.min(window.innerHeight,max[1]+8)-y};
    },{key,marks:reference.landmarks});
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
    const actual=fs.readFileSync(file), landmarks=reference.registration.reference;
    const referenceCrop={x:landmarks.centerX-landmarks.faceHalfWidth*1.5,y:Math.max(0,landmarks.hairTopY-40),width:landmarks.faceHalfWidth*3,height:landmarks.chinY+100-Math.max(0,landmarks.hairTopY-40)};
    await compare.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#101314;color:#eeefec;font:14px system-ui}.head{height:48px;display:flex;align-items:center;border-bottom:1px solid #c4c6bb33}.head span{width:50%;padding:0 20px}.pair{display:grid;grid-template-columns:1fr 1fr;height:672px}.portrait{position:relative;overflow:hidden;background:#e9e9e7}.portrait img{position:absolute;max-width:none}</style><div class="head"><span>${key} · 原始个人头部参考</span><span>实机单人观察 · ${detail?'1080p 极高画质':'720p 高画质'}</span></div><div class="pair">${FramedImage(bytes,2048,2048,referenceCrop)}${FramedImage(actual,viewport.width,viewport.height,actualCrop)}</div>`);
    await compare.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
    await compare.screenshot({path:path.join(output,`Compare_${key}.png`)});
    result.subjects[key]={reference:reference.source,sha256:reference.sha256,actual:file,referenceCrop,actualCrop};
    for(const view of ['side','back']){
      await page.evaluate(({index,view})=>Taierzhuang.Debug.HairRange.Focus(index,view),{index,view});await Step(24);
      await page.screenshot({path:path.join(output,`Scene_${key}_${view}.png`)});
    }
  }
  assert.deepEqual(errors,[],'no gallery or shader errors');
  result.errors=errors;fs.writeFileSync(path.join(output,'Data_ReferenceReview.json'),JSON.stringify(result,null,2));
  console.log('HairReferenceBrowserTest passed',JSON.stringify({camera:result.camera,theme:result.theme,subjects:Object.keys(result.subjects),output}));
} finally {await browser.close();server?.close();}
