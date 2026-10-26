// Local-only art review, driven by the production VFX editor. No alternate demo.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
const Arg=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const base=Arg('base','http://127.0.0.1:8116'),label=Arg('label','Current');
const context=Arg('context','0')==='1';
const out=path.join(import.meta.dirname,'_shots','FallingSoilReference',label);await fs.mkdir(out,{recursive:true});
const browser=await LaunchBrowser({extraArgs:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')console.log('ERROR',m.text().slice(0,600));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));});
 await page.goto(base+'/Taierzhuang1938/?editor=tools&tool=vfx&effect=SoilCeilingShake&quality=high&audio=0&manual=1&menu=0',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});console.log('Reference camera ready',label);
 const report=[];
 const effects=Arg('effects','SoilCeilingShake,SoilPlankLeak,SoilBrokenEdge').split(',');
 for(const preset of effects){
  for(const seconds of Arg('times','.35,.75,1.2,1.8,3.2').split(',').map(Number)){
   for(const view of Arg('views','all').split(',')){
   const state=await page.evaluate(({preset,seconds,view,context})=>{
    const g=Tengxian,e=g.ParticleEditor;e.loop=false;e.SelectEffect(preset);e.soil.stage.beam.enabled=false;e.soil.stage.sourceReference=context;
    e.Seek(seconds);const entry=g.Particles.FallingSoil.Get(e.soil.id);
    if(entry.layerIds)for(const [key,id]of Object.entries(entry.layerIds))g.Particles.Configure(id,{renderer:{enabled:view==='all'||view==='grains'&&(key==='grains'||key==='deposits')||view==='dust'&&(key==='dustFall'||key==='dustImpact')||view===key}});
    entry.root.visible=view==='all'||view==='clods';
    if(context)e.FrameEffect();else{const o=e.studio.orbit;o.yaw=Math.PI+.15;o.pitch=.04;o.dist=5;o.target.set(0,1.52,0);e.studio.ApplyCamera();}
    g.post.NotifyCameraCut();g.StepFrames(3,0,true);
    return {preset,seconds,view,soil:e.soil.Inspect(),renderer:g.renderer.info.render};
   },{preset,seconds,view,context});
   const name=preset+'_'+seconds.toFixed(2).replace('.','_')+(view==='all'?'':'_'+view),bytes=await page.screenshot();await fs.writeFile(path.join(out,name+'.png'),bytes);
   let preview=sharp(bytes);if(!context)preview=preview.extract({left:380,top:90,width:680,height:730});
   await preview.resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toFile(path.join(out,name+'Preview.jpg'));
   report.push(state);console.log('frame',preset,seconds,view,JSON.stringify(state.soil.live));
   }
  }
 }
 const recordSeconds=Number(Arg('record','0'));
 if(recordSeconds>0&&recordSeconds<=12){
  const video=await page.evaluate(async({seconds,preset,context})=>{
   const g=Tengxian,e=g.ParticleEditor;e.SelectEffect(preset);e.soil.stage.beam.enabled=false;e.soil.stage.sourceReference=context;e.loop=false;e.Play();e.FrameEffect();
   const stream=document.getElementById('view').captureStream(30),chunks=[];
   const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
   const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000});
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.start();
   let frames=0,last=performance.now(),start=last;
   await new Promise(resolve=>{const timer=setInterval(()=>{const now=performance.now();g.StepFrames(1,Math.min(.1,(now-last)/1000),true);last=now;frames++;
     if(now-start>=seconds*1000){clearInterval(timer);recorder.stop();resolve();}},1000/30);});
   await done;stream.getTracks().forEach(track=>track.stop());
   const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:mime}));});
   return {data,frames,simulationTime:e.previewTime,mime};
  },{seconds:recordSeconds,preset:effects[0],context});
  const bytes=Buffer.from(video.data.slice(video.data.indexOf(',')+1),'base64');await fs.writeFile(path.join(out,'Video_FallingSoil.webm'),bytes);
  report.push({video:{frames:video.frames,simulationTime:video.simulationTime,mime:video.mime,bytes:bytes.length}});console.log('video',video.frames,video.simulationTime,bytes.length);
 }
 const reference=Arg('reference',''),before=Arg('before','');
 if(reference&&!context){
  const seconds=Number(Arg('compare-time','1.2')),name=effects[0]+'_'+seconds.toFixed(2).replace('.','_')+'.png';
  const panels=[{label:'PRACTICAL REFERENCE',file:reference,reference:true},...(before?[{label:'PREVIOUS',file:path.join(before,name)}]:[]),{label:'CURRENT GAME RENDERER',file:path.join(out,name)}];
  const images=[];for(const panel of panels){let input=sharp(panel.file);if(!panel.reference)input=input.extract({left:380,top:90,width:680,height:730});
   images.push(await input.resize({width:600,height:640,fit:'contain',background:'#080a08',withoutEnlargement:true}).png().toBuffer());}
  const width=640*panels.length,height=760,items=images.map((input,i)=>({input,left:i*640+20,top:64}));
  const labels=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#eee}</style>${panels.map((p,i)=>`<text x="${i*640+24}" y="43" font-size="30">${p.label}</text>`).join('')}<text x="24" y="735" font-size="22">FX Elements Falling Debris 008 | Game: fixed 5 m camera, high quality, t=${seconds.toFixed(2)} s | No colour grading of the reference</text></svg>`);
  const board=await sharp({create:{width,height,channels:3,background:'#111510'}}).composite([...items,{input:labels,left:0,top:0}]).png().toBuffer();
  await fs.writeFile(path.join(out,'Comparison_ReferenceBeforeCurrent.png'),board);
  await sharp(board).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:83}).toFile(path.join(out,'Comparison_ReferenceBeforeCurrentPreview.jpg'));
 }
 await fs.writeFile(path.join(out,'Report.json'),JSON.stringify({label,base,errors,frames:report},null,2));
}finally{await browser.close();}
