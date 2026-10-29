// Source-local hue preservation, with a frozen pre-change GPU bright-pass oracle.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareBloom');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500)+' '+m.location().url);});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=SignalRed&flareCamera=follow&quality=high&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const fixture=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,b=g.post.bloomPass,U=b.uniformsBright,r=g.renderer;
  const width=128,height=64,target=new T.WebGLRenderTarget(width,height,{type:T.HalfFloatType,depthBuffer:false});
  const Texture=()=>{const t=new T.DataTexture(new Float32Array(width*height*4),width,height,T.RGBAFormat,T.FloatType);t.minFilter=t.magFilter=T.NearestFilter;t.needsUpdate=true;return t;};
  const color=Texture(),depth=Texture(),exposure=new T.DataTexture(new Float32Array([1,1,1,1]),1,1,T.RGBAFormat,T.FloatType);exposure.needsUpdate=true;
  const saved=Object.fromEntries(Object.entries(U).map(([k,u])=>[k,Array.isArray(u.value)?u.value.map(v=>v.clone()):u.value?.clone&&!u.value.isTexture?u.value.clone():u.value]));
  // Frozen original FRAG_BRIGHT, independent of the candidate branch and flags.
  const baseline=new T.ShaderMaterial({vertexShader:b.matBright.vertexShader,uniforms:U,depthTest:false,depthWrite:false,fragmentShader:`
   uniform sampler2D uSource;uniform sampler2D uNormalDepth;uniform sampler2D uExposureTex;
   uniform float uThreshold;uniform float uKnee;uniform float uClamp;uniform float uPackSky;varying vec2 vUv;
   void main(){vec3 c=texture2D(uSource,vUv).rgb;float invGain=1./max(texture2D(uExposureTex,vec2(.5)).r,1e-4);
    float threshold=uThreshold*invGain;float knee=uKnee*invGain;c=min(c,vec3(uClamp*invGain));
    float br=max(c.r,max(c.g,c.b));float soft=clamp(br-threshold+knee,0.,2.*knee);soft=soft*soft/(4.*knee+1e-4);
    float contrib=max(soft,br-threshold)/max(br,1e-4);float sky=1.;
    if(uPackSky>.5){float d=texture2D(uNormalDepth,vUv).w;sky=clamp(step(d,.0001)+step(300.,d),0.,1.);}
    gl_FragColor=vec4(c*contrib,sky);}`});
  const oldTarget=r.getRenderTarget();
  const Fill=(texture,rgb,a)=>{for(let i=0;i<texture.image.data.length;i+=4)texture.image.data.set([...rgb,a],i);texture.needsUpdate=true;};
  const Render=material=>{g.post.blitter.Blit(material,target);const a=new Uint16Array(width*height*4);r.readRenderTargetPixels(target,0,0,width,height,a);return a;};
  const At=(data,x=width/2,y=height/2)=>Array.from(data.slice((y*width+x)*4,(y*width+x)*4+3)).map(T.DataUtils.fromHalfFloat);
  const Difference=(a,b,predicate=()=>true)=>{let n=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(predicate(x,y))for(let c=0;c<4;c++){const i=(y*width+x)*4+c;if(a[i]!==b[i])n++;}return n;};
  let red,white,noSourceDifferences,outsideDifferences,occludedDifferences,foregroundDifferences;
  try{
   U.uSource.value=color;U.uNormalDepth.value=depth;U.uExposureTex.value=exposure;U.uThreshold.value=1.18;U.uKnee.value=.55;U.uClamp.value=40;U.uPackSky.value=0;
   U.uFlareClampSource.value.forEach(v=>v.w=0);U.uFlareClampSource.value[0].set(.5,.5,100,.65);
   U.uFlareClampProjScale.value.set(1,1);U.uFlareClampDepthOffset.value.set(0,0);U.uFlareClampPixelFootprint.value.set(2/width,2/height);
   Fill(color,[8000,128,48],1);Fill(depth,[0,0,0],0);
   const oldRed=Render(baseline),newRed=Render(b.matBright);red={input:[8000,128,48],before:At(oldRed),after:At(newRed)};
   const rx=.65/(2*100)+2/width,ry=.65/(2*100)+2/height;
   outsideDifferences=Difference(oldRed,newRed,(x,y)=>(((x+.5)/width-.5)/rx)**2+(((y+.5)/height-.5)/ry)**2>1.);
   U.uFlareClampSource.value[0].w=0;noSourceDifferences=Difference(oldRed,Render(b.matBright));U.uFlareClampSource.value[0].w=.65;
   Fill(depth,[0,0,0],50);occludedDifferences=Difference(Render(baseline),Render(b.matBright));
   Fill(depth,[0,0,0],0);const foregroundX=width/2+1,foregroundY=height/2;
   depth.image.data[(foregroundY*width+foregroundX)*4+3]=50;depth.needsUpdate=true;
   foregroundDifferences=Difference(Render(baseline),Render(b.matBright),(x,y)=>x===foregroundX&&y===foregroundY);
   Fill(depth,[0,0,0],0);Fill(color,[8000,7200,6000],1);white={input:[8000,7200,6000],before:At(Render(baseline)),after:At(Render(b.matBright))};
  }finally{
   for(const [k,value]of Object.entries(saved)){
    if(Array.isArray(value))value.forEach((v,i)=>U[k].value[i].copy(v));else if(value?.isVector2||value?.isVector3||value?.isVector4)U[k].value.copy(value);else U[k].value=value;
   }
   r.setRenderTarget(oldTarget);baseline.dispose();target.dispose();color.dispose();depth.dispose();exposure.dispose();
  }
  return {red,white,noSourceDifferences,outsideDifferences,occludedDifferences,foregroundDifferences,gl:r.getContext().getError()};
 });
 const actual=[];
 for(const effect of ['SignalRed','Illumination']){
  for(const enabled of [false,true]){
   const result=await page.evaluate(async({effect,enabled})=>{
    const T=await import('three'),g=Tengxian,e=g.ParticleEditor,b=g.post.bloomPass;
    if(e.effectId!==effect)e.SelectEffect(effect);e.Seek(effect==='SignalRed'?4.5:8);e.flareCamera='follow';e.FrameEffect();e.paused=true;
    g.graphics.autoQuality=false;g.ApplyGraphics();g.post.SetAutoExposure(false);g.post.exposurePass.transientWeight=0;
    b.flareHuePreserving=enabled;g.post.frame=4000;g.post.NotifyCameraCut();g.StepFrames(48,0,true);
    const f=e.flarePreview.flares[0],point=new T.Vector3(f.pos.x,f.pos.y,f.pos.z).project(g.camera),gl=g.renderer.getContext();
    const cx=(point.x*.5+.5)*gl.drawingBufferWidth,cy=(point.y*.5+.5)*gl.drawingBufferHeight,size=72,x0=Math.floor(cx)-36,y0=Math.floor(cy)-36,bytes=new Uint8Array(size*size*4);
    gl.readPixels(x0,y0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const mean=[0,0,0];let count=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){
     const r2=(x+x0+.5-cx)**2+(y+y0+.5-cy)**2;if(r2<8**2||r2>32**2)continue;
     const i=(y*size+x)*4;for(let c=0;c<3;c++)mean[c]+=bytes[i+c];count++;
    }for(let c=0;c<3;c++)mean[c]/=count;
    const Read=rt=>{const a=new Uint16Array(4);g.renderer.readRenderTargetPixels(rt,Math.floor((point.x*.5+.5)*rt.width),Math.floor((point.y*.5+.5)*rt.height),1,1,a);return Array.from(a).slice(0,3).map(T.DataUtils.fromHalfFloat);};
    return {effect,enabled,mean,redGreen:mean[0]/mean[1],redBlue:mean[0]/mean[2],count,hdr:Read(g.post.targets.hdr),bright:Read(b.bright),sources:b.uniformsBright.uFlareClampSource.value.map(v=>v.toArray()),taa:g.post.context.taaActive,exposure:g.post.uniformsComposite.uExposure.value,gl:gl.getError()};
   },{effect,enabled});actual.push(result);
   const shot=await page.screenshot();await sharp(shot).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:84}).toFile(path.join(out,`${effect}${enabled?'After':'Before'}Preview.jpg`));
  }
 }
 const depthValidity=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,p=g.post,b=p.bloomPass,pre=p.prepassPass;
  b.flareHuePreserving=true;g.StepFrames(2,0,true);
  const realDepth=p.context.normalDepthTexture,originalEnabled=pre.Enabled;
  let skipped,placeholder;
  try{
   pre.Enabled=()=>false;g.StepFrames(1,0,true);
   skipped={retainedDepth:p.context.normalDepthTexture===realDepth,prepassRendered:p.lastRenderedPasses.includes('prepass'),active:b.uniformsBright.uFlareClampSource.value.some(v=>v.w>0)};
   pre.Enabled=originalEnabled;g.StepFrames(1,0,true);
   const currentDepth=p.context.normalDepthTexture,fallback=new T.DataTexture(new Float32Array(4),1,1,T.RGBAFormat,T.FloatType);fallback.needsUpdate=true;
   p.context.normalDepthTexture=fallback;b.UpdateFlareClamp(p.context);
   placeholder={prepassRendered:p.lastRenderedPasses.includes('prepass'),active:b.uniformsBright.uFlareClampSource.value.some(v=>v.w>0)};
   p.context.normalDepthTexture=currentDepth;fallback.dispose();b.UpdateFlareClamp(p.context);
  }finally{pre.Enabled=originalEnabled;}
  return {skipped,placeholder,restored:b.uniformsBright.uFlareClampSource.value.some(v=>v.w>0)};
 });
 const occlusion=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,e=g.ParticleEditor,b=g.post.bloomPass,f=e.flarePreview.flares[0];
  b.flareHuePreserving=true;e.flareCamera='observer';e.FrameEffect();g.StepFrames(4,0,true);
  const point=new T.Vector3(f.pos.x,f.pos.y,f.pos.z),block=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:0x101010}));
  block.position.lerpVectors(g.camera.position,point,.55);block.quaternion.copy(g.camera.quaternion);e.studio.root.add(block);block.updateMatrixWorld();
  const saved=g.post.blitter.Blit.bind(g.post.blitter);let maxDifference=0;
  try{
   for(let i=0;i<8;i++){
    g.StepFrames(1,0,true);const U=b.uniformsBright;
    const a=new Uint16Array(b.bright.width*b.bright.height*4);g.renderer.readRenderTargetPixels(b.bright,0,0,b.bright.width,b.bright.height,a);
    const values=U.uFlareClampSource.value.map(v=>v.clone());U.uFlareClampSource.value.forEach(v=>v.w=0);
    saved(b.matBright,b.bright);const baseline=new Uint16Array(a.length);g.renderer.readRenderTargetPixels(b.bright,0,0,b.bright.width,b.bright.height,baseline);
    values.forEach((v,j)=>U.uFlareClampSource.value[j].copy(v));let different=0;for(let p=0;p<a.length;p++)if(a[p]!==baseline[p])different++;maxDifference=Math.max(maxDifference,different);
   }
  }finally{block.removeFromParent();block.geometry.dispose();block.material.dispose();}
  return {maxDifference,gl:g.renderer.getContext().getError()};
 });
 const report={fixture,actual,depthValidity,occlusion,errors};await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify(report,null,2));
 for(const sample of [fixture.red,fixture.white])for(const c of [1,2])assert.ok(Math.abs(sample.after[c]/sample.after[0]-sample.input[c]/sample.input[0])<.001,'Known HDR input retains its chromaticity: '+JSON.stringify(sample));
 assert.ok(fixture.red.before[1]/fixture.red.before[0]>.99&&fixture.red.after[1]/fixture.red.after[0]<.02,'The test reproduces and fixes high-HDR red washing out to white');
 assert.equal(fixture.noSourceDifferences,0);assert.equal(fixture.outsideDifferences,0);assert.equal(fixture.occludedDifferences,0);assert.equal(fixture.foregroundDifferences,0);
 assert.ok(depthValidity.skipped.retainedDepth&&!depthValidity.skipped.prepassRendered&&!depthValidity.skipped.active,'Retained previous-frame depth cannot enable the source clamp');
 assert.ok(depthValidity.placeholder.prepassRendered&&!depthValidity.placeholder.active&&depthValidity.restored,'An all-sky placeholder cannot masquerade as the real current prepass');
 const [redBefore,redAfter,whiteBefore,whiteAfter]=actual;
 assert.ok(redAfter.redGreen>redBefore.redGreen*1.15&&redAfter.redBlue>redBefore.redBlue*1.15,'The actual final red halo must become more red at fixed source/camera/exposure: '+JSON.stringify([redBefore,redAfter]));
 assert.ok(whiteAfter.redGreen>0.8&&whiteAfter.redGreen<1.4&&whiteAfter.redBlue>0.8&&whiteAfter.redBlue<2,'White illumination stays warm-neutral');
 assert.ok(actual.every(v=>v.taa&&v.gl===0));assert.ok(redBefore.hdr.every((v,i)=>v===redAfter.hdr[i])&&whiteBefore.hdr.every((v,i)=>v===whiteAfter.hdr[i]),'Only the bloom clamp changes, not source HDR');
 assert.equal(occlusion.maxDifference,0);assert.equal(occlusion.gl,0);assert.equal(fixture.gl,0);assert.deepEqual(errors,[]);
 console.log('FlareBloomBrowserTest passed',JSON.stringify(report));
}finally{await browser.close();server.close();}
