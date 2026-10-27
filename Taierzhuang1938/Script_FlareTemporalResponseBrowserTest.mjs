// Preserve genuine fast low-amplitude illumination through default TAA.
// Compare the same real scene at fixed source position to isolate temporal filtering.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareTemporalResponse');
const fps=process.argv.includes('--fps=30')?30:60;
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=Illumination&flareCamera=ground&quality=high&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const report=await page.evaluate(async fps=>{
  const T=await import('three'),g=Tengxian,e=g.ParticleEditor,gl=g.renderer.getContext(),rows=[];let active=false;
  const o=e.studio.orbit;o.target.set(0,0,10);o.dist=100;o.pitch=.5;o.yaw=Math.PI;e.studio.ApplyCamera();
  for(const taa of [false,true])for(const control of [false,true]){
   e.Seek(6);g.post.SetTaaEnabled(taa);g.post.frame=1000;g.post.exposurePass.RequestReset();g.post.NotifyCameraCut();
   const move=e.flarePreview.host.MoveLight,position={x:0,y:90,z:0},emission={direction:{x:0,y:-1,z:0},floor:.7,power:1.2};
   let measuring=false;const flare=e.flarePreview.flares[0];
   e.flarePreview.host.MoveLight=(id,spec)=>move(id,{...spec,position,emission,intensity:control&&measuring?flare.candleCd:spec.intensity});g.StepFrames(120,1/60,true);measuring=true;
   const point=new T.Vector3(10,.005,12).project(g.camera),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,x=Math.round((point.x*.5+.5)*w)-32,y=Math.round((point.y*.5+.5)*h)-32;
   const series=[];
   for(let i=0;i<fps*4;i++){
    e.Advance(1/fps);g.StepFrames(1,1/fps,true);const a=new Uint8Array(64*64*4);gl.readPixels(x,y,64,64,gl.RGBA,gl.UNSIGNED_BYTE,a);
    if(taa&&g.post.taaPass.uniforms.uFlareScreen.value.some(v=>v.w>.1))active=true;
    let sum=0,small=0;for(let p=0;p<a.length;p+=4){const v=.2126*a[p]+.7152*a[p+1]+.0722*a[p+2],xx=(p/4)%64,yy=Math.floor(p/256);sum+=v;if(xx>=24&&xx<40&&yy>=24&&yy<40)small+=v;}
    series.push({t:e.previewTime,power:e.flarePreview.flares[0].brightness,pixel:small/256,surface:sum/4096});
   }e.flarePreview.host.MoveLight=move;rows.push({taa,control,series});
  }
  // A surface inside the footprint but behind a shelter must retain its AA.
  o.target.set(24,.025,-2);o.dist=60;o.pitch=.3;e.studio.ApplyCamera();g.post.NotifyCameraCut();g.post.debugView='taaWeight';
  const shadowWeights=[];
  for(let i=0;i<24;i++){
   e.Advance(1/60);g.StepFrames(1,1/60,true);
   if(i>=8){const rt=g.post.taaPass.debugTarget,p=new Uint16Array(4);g.renderer.readRenderTargetPixels(rt,Math.floor(rt.width/2),Math.floor(rt.height/2),1,1,p);shadowWeights.push(T.DataUtils.fromHalfFloat(p[0]));}
  }
  // A receiver outside the flare footprint still uses ordinary temporal AA.
  o.target.set(480,4,480);o.dist=80;o.pitch=.5;e.studio.ApplyCamera();g.post.NotifyCameraCut();g.post.debugView='taaWeight';
  for(let i=0;i<16;i++){e.Advance(1/60);g.StepFrames(1,1/60,true);}
  const target=g.post.taaPass.debugTarget,pixel=new Uint16Array(4);g.renderer.readRenderTargetPixels(target,Math.floor(target.width/2),Math.floor(target.height/2),1,1,pixel);
  const outsideWeight=T.DataUtils.fromHalfFloat(pixel[0]);g.post.debugView='final';
  e.Stop();g.StepFrames(4,0,true);const cleared=g.post.taaPass.uniforms.uFlareScreen.value.every(v=>v.w===0);
  let samplers=0;for(const program of g.renderer.info.programs){
   const source=gl.getAttachedShaders(program.program).map(s=>gl.getShaderSource(s)).join('\n');if(!source.includes('uFlareWorld'))continue;
   let count=0;for(let i=0;i<gl.getProgramParameter(program.program,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(program.program,i);if([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_3D,gl.SAMPLER_2D_SHADOW].includes(u.type))count+=u.size;}samplers=Math.max(samplers,count);
  }
  return {fps,rows,active,shadowWeights,outsideWeight,cleared,samplers,samplerLimit:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),gl:gl.getError()};
 },fps);
 const Stats=a=>{const m=a.reduce((s,v)=>s+v,0)/a.length;return {mean:m,rms:Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length)};};
 // Paired constant-light replay uses identical TAA jitter and grain. Subtract
 // that control to measure illumination, not unrelated texture sampling noise.
 const modulated=report.rows.filter(r=>!r.control),deltas=modulated.map(r=>{const control=report.rows.find(c=>c.control&&c.taa===r.taa);return r.series.map((s,i)=>({power:s.power,pixel:s.pixel-control.series[i].pixel,surface:s.surface-control.series[i].surface}));});
 const stats=deltas.map(r=>Stats(r.map(s=>s.pixel))),ratio=stats[1].rms/stats[0].rms;
 const surfaceStats=deltas.map(r=>Stats(r.map(s=>s.surface))),surfaceGain=surfaceStats[1].rms/surfaceStats[0].rms;
 const Correlation=(a,b)=>{const ma=Stats(a).mean,mb=Stats(b).mean;let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;ab+=x*y;aa+=x*x;bb+=y*y;}return ab/Math.sqrt(aa*bb);};
 const coherence=deltas.map(r=>Correlation(r.map(s=>s.power),r.map(s=>s.surface)));
 assert.ok(surfaceGain>.7&&surfaceGain<1.15&&coherence[1]>.9,'A real receiving area must follow source flutter, not merely exhibit TAA texture noise: '+JSON.stringify({surfaceGain,coherence}));
 await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify({stats,ratio,...report},null,2));
 assert.ok(ratio>.5&&ratio<1.5,'Default TAA must preserve small fast lighting changes, without amplifying them: '+JSON.stringify({stats,ratio}));
 const displayMean=Stats(modulated[1].series.map(s=>s.pixel)).mean;
 assert.ok(stats[1].rms/displayMean>.004&&stats[1].rms/displayMean<.04,'Mild displayed flutter, not deep scene pumping');
 assert.ok(report.active&&report.cleared);assert.ok(report.outsideWeight<=.21,'Outside the footprint keep regular AA');
 assert.ok(Math.max(...report.shadowWeights)<=.21,'Shadowed surfaces inside the footprint also keep regular AA: '+JSON.stringify(report.shadowWeights));
 assert.ok(report.samplers>0&&report.samplers<=report.samplerLimit,'Responsive TAA stays within the actual GPU sampler budget');
 assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_Report'+fps+'.json'),JSON.stringify({stats,ratio,surfaceStats,surfaceGain,coherence,...report},null,2));console.log('FlareTemporalResponseBrowserTest passed',JSON.stringify({fps,stats,ratio,surfaceGain,coherence,active:report.active,outsideWeight:report.outsideWeight,cleared:report.cleared}));
}finally{await browser.close();server.close();}
