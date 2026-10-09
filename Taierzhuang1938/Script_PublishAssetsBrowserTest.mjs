import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {EncodeTexture} from './Script_TextureImportBuild.mjs';
import {Within} from './Script_PublishCache.mjs';
import {BuildPublishAssets} from './Script_BuildPublishAssets.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots/GpuPublish');
await fs.mkdir(path.join(out,'Texture'),{recursive:true});
const w=128,h=128,rgba=Buffer.alloc(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;rgba[i]=x*2;rgba[i+1]=y*2;rgba[i+2]=(x<64)=== (y<64)?220:30;rgba[i+3]=x<64?255:160;}
await fs.writeFile(path.join(out,'Texture/Texture_GpuFixture.png'),await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toBuffer());
await fs.copyFile(path.join(out,'Texture/Texture_GpuFixture.png'),path.join(out,'Texture/Texture_GpuFixtureOriginal.png'));
const item={file:'Texture_GpuFixture.png',colorSpace:'srgb',gpu:true,sampler:true};
const gpu=await EncodeTexture(out,item,{format:'ktx2-uastc',quality:40},path.join(out,'Texture'));
const sourceRuntime={ [item.file]:{...gpu,output:gpu.filename,variants:{}} };
let reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9);
if(!reportPath){
 const fixtureStage=path.join(out,'Stage');await fs.mkdir(path.join(fixtureStage,'Model'),{recursive:true});
 for(const file of ['Script_ModelImports.mjs','Script_TextureImports.mjs','Data_AssetPublishRuntime.mjs','Data_TextureImportRuntime.mjs'])
  await fs.copyFile(path.join(import.meta.dirname,file),path.join(fixtureStage,file));
 await fs.cp(path.join(import.meta.dirname,'vendor'),path.join(fixtureStage,'vendor'),{recursive:true});
 const models=['Model/Model_MitsubishiKi30.glb','Model/Model_BreakableDeadTree.glb','Model/Model_Cigarette.glb'];
 for(const file of models)await fs.copyFile(path.join(import.meta.dirname,file),path.join(fixtureStage,file));
 await BuildPublishAssets(import.meta.dirname,fixtureStage,{cacheDir:path.join(root,'tmp/GpuPublish/Cache'),textureFiles:[],modelFiles:models,log:()=>{}});
 reportPath=path.join(fixtureStage,'Data_AssetPublishReport.json');
}
const report=JSON.parse(await fs.readFile(reportPath,'utf8')),stage=path.dirname(reportPath);
const textureRuntime=JSON.parse((await fs.readFile(path.join(stage,'Data_TextureImportRuntime.mjs'),'utf8')).match(/=\s*([\s\S]*);\s*$/)[1]);
const software=process.argv.includes('--software');
const server=await ServeRoot(root,0),browser=await LaunchBrowser({extraArgs:software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]}),page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
const base=`http://127.0.0.1:${server.address().port}`,sourceProject=base+'/Taierzhuang1938/',project=base+'/__published/';
try{
 await page.route('**/__published/**',async route=>{
  const file=Within(stage,decodeURIComponent(new URL(route.request().url()).pathname.slice('/__published/'.length)));
  const mime=/\.m?js$/.test(file)?'text/javascript':/\.wasm$/.test(file)?'application/wasm':'application/octet-stream';
  try{await route.fulfill({contentType:mime,body:await fs.readFile(file)});}catch{await route.fulfill({status:404,body:'missing staging resource'});}
 });
 await page.route('**/Data_TextureImportRuntime.mjs*',route=>route.fulfill({contentType:'text/javascript',body:'export const TEXTURE_IMPORT_RUNTIME = '+JSON.stringify({...textureRuntime,...sourceRuntime})+';'}));
 await page.route('**/GpuReview.html',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#25282d;color:white;font:18px Arial"><div id="label" style="padding:12px"></div><script type="importmap">{"imports":{"three":"${project}vendor/three/build/three.module.js"}}</script><script type="module">
 import * as T from 'three';import {ManagedGLTFLoader} from '${project}Script_ModelImports.mjs';
 import {GLTFLoader} from '${project}vendor/three/examples/jsm/loaders/GLTFLoader.js';
 import {SetTextureImportRenderer,ManagedTextureLoader,LoadKtxTexture} from '${project}Script_TextureImports.mjs';
 import {KTX2Loader} from '${project}vendor/three/examples/jsm/loaders/KTX2Loader.js';
 const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(1280,640);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;document.body.appendChild(renderer.domElement);SetTextureImportRenderer(renderer);
 const Format=texture=>texture.format===T.RGBA_BPTC_Format?'BC7':texture.format===T.RGBA_ASTC_4x4_Format?'ASTC':texture.format===T.RGBA_S3TC_DXT1_Format?'DXT1':texture.format===T.RGBA_S3TC_DXT5_Format?'DXT5':texture.format===T.RGBAFormat?'RGBA':String(texture.format);
 const Compare=(a,b,background=null)=>{let sum=0,n=0,max=0;const errors=[];for(let i=0;i<a.length;i+=4){if(background&&[0,1,2].every(c=>a[i+c]===background[c]&&b[i+c]===background[c]))continue;for(let c=0;c<4;c++){const d=Math.abs(a[i+c]-b[i+c]);sum+=d;n++;max=Math.max(max,d);errors.push(d);}}errors.sort((a,b)=>a-b);return {mean:sum/n,max,p95:errors[Math.floor(errors.length*.95)],samples:n};};
 function Read(){const bytes=new Uint8Array(640*640*4),gl=renderer.getContext();gl.readPixels(0,0,640,640,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
 window.CheckTexture=async urls=>{
  const loader=new ManagedTextureLoader(),original=await new T.TextureLoader().loadAsync(urls.source);original.colorSpace=T.SRGBColorSpace;
  const imported=await loader.loadAsync(urls.managed);const noFlip=await new ManagedTextureLoader(undefined,{flipY:false}).loadAsync(urls.managed);
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
  const material=new T.ShaderMaterial({uniforms:{map:{value:original}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=texture2D(map,vUv);}',depthTest:false});
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));renderer.setViewport(0,0,640,640);renderer.setScissorTest(false);
  const Render=tex=>{material.uniforms.map.value=tex;renderer.render(scene,camera);return Read();};const a=Render(original),b=Render(imported);original.flipY=false;original.needsUpdate=true;const c=Render(original),d=Render(noFlip);
  const fallbackLoader=new KTX2Loader().setTranscoderPath('${project}vendor/three/examples/jsm/libs/basis/').detectSupport(renderer);fallbackLoader.workerConfig.astcSupported=false;fallbackLoader.workerConfig.bptcSupported=false;
  const fallback=await new Promise((resolve,reject)=>fallbackLoader.load(urls.ktx,resolve,undefined,reject,{gpuFormat:'high-quality'}));
  const explicit=await Promise.all(['bc1','bc3','bc7','astc'].map(async format=>{const value=await LoadKtxTexture(urls.opaqueKtx,'ktx2-'+format);const actual=Format(value);value.dispose();return {requested:format,actual};}));
  const result={format:Format(imported),width:imported.image.width,height:imported.image.height,mips:imported.mipmaps.length,regular:Compare(a,b),noFlip:Compare(c,d),fallback:Format(fallback),explicit};fallback.dispose();fallbackLoader.dispose();return result;
 };
 window.ReviewModel=async urls=>{
  const loader=new ManagedGLTFLoader(),[before,after]=await Promise.all([new GLTFLoader(new T.LoadingManager()).loadAsync(urls.before),loader.loadAsync(urls.after)]);
  const scene=new T.Scene();scene.background=new T.Color('#41464e');scene.add(new T.HemisphereLight(0xffffff,0x7d6e5c,2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(3,5,4);scene.add(light);
  const box=new T.Box3().setFromObject(before.scene),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),radius=Math.max(size.x,size.y,size.z);
  const camera=new T.PerspectiveCamera(38,1,.001,10000);camera.position.copy(center).add(new T.Vector3(.9,.4,1.3).multiplyScalar(radius));camera.lookAt(center);const arrays=[];renderer.setScissorTest(true);
  for(const [i,model] of [before,after].entries()){scene.add(model.scene);renderer.setViewport(i*640,0,640,640);renderer.setScissor(i*640,0,640,640);renderer.render(scene,camera);const pixels=new Uint8Array(640*640*4),gl=renderer.getContext();gl.readPixels(i*640,0,640,640,gl.RGBA,gl.UNSIGNED_BYTE,pixels);arrays.push(pixels);scene.remove(model.scene);}
  const textures=new Set();after.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);});
  const formats=[...textures].map(t=>({format:Format(t),compressed:!!t.isCompressedTexture,published:t.userData.mimeType==='image/ktx2',w:t.image.width,h:t.image.height,mips:t.mipmaps.length,bytes:t.mipmaps.reduce((n,m)=>n+(m.data?.byteLength||0),0)}));
  document.getElementById('label').textContent=urls.name+' — source (left) / published GPU texture (right)';
  return {formats,diff:Compare(arrays[0],arrays[1],[65,70,78]),bounds:box.equals(new T.Box3().setFromObject(after.scene)),glError:renderer.getContext().getError()};
 };window.ready=true;</script>`}));
 await page.goto(project+'GpuReview.html');await page.waitForFunction(()=>window.ready);
 // Opaque fixture keeps explicit BC1 available; alpha fixture must remain intact.
 const opaque=await EncodeTexture(out,item,{format:'ktx2-uastc',quality:40,alphaSource:'none'},path.join(out,'Texture'));
 const textureRoot=sourceProject+'_shots/GpuPublish/Texture/';
 const ordinary=await page.evaluate(urls=>window.CheckTexture(urls),{source:textureRoot+'Texture_GpuFixtureOriginal.png',managed:textureRoot+item.file,ktx:textureRoot+gpu.filename,opaqueKtx:textureRoot+opaque.filename});
 assert.deepEqual([ordinary.width,ordinary.height,ordinary.mips],[128,128,8]);
 assert.ok((software?['BC7','ASTC','RGBA']:['BC7','ASTC']).includes(ordinary.format),'high-quality capability selection');
 assert.equal(ordinary.fallback,'RGBA','missing high-quality formats retain a renderable fallback');
 assert.ok(ordinary.regular.mean<4&&ordinary.noFlip.mean<4,'both UV directions retain color and alpha');
 const models=[];
 for(const name of ['Model_MitsubishiKi30.glb','Model_BreakableDeadTree.glb','Model_Cigarette.glb']){
  const item=report.models.find(row=>row.file.endsWith('/'+name));assert.ok(item,'published model: '+name);
  // Request the original logical URL: the published loader must resolve its hashed GPU variant.
  const result=await page.evaluate(urls=>window.ReviewModel(urls),{name,before:sourceProject+item.file,after:project+item.file});
  assert.ok(result.bounds&&result.glError===0);assert.ok(result.formats.some(t=>t.published));
  if(!software)assert.ok(result.formats.some(t=>t.compressed&&['BC7','ASTC','DXT1','DXT5'].includes(t.format)));
  assert.ok(result.diff.mean<4&&result.diff.p95<15,`foreground material error: ${JSON.stringify(result.diff)}`);
  await page.screenshot({path:path.join(out,'Scene_'+name.replace('.glb','.png'))});models.push({name,...result});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'Data_GpuValidation.json'),JSON.stringify({ordinary,models,errors},null,2));
 console.log('PASS GPU publication',JSON.stringify({ordinary,models}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
