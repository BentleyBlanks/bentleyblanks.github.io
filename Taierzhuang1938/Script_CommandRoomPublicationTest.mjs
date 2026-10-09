// Real source/published room comparison; preserve the 32x HDR atlas without quantization.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {BuildPublishAssets} from './Script_BuildPublishAssets.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),project=path.join(root,'Taierzhuang1938');
const stage=path.join(root,'tmp/CapWallPublish'),out=path.join(project,'_shots/CommandRoom');
await fs.mkdir(stage,{recursive:true});
for(const file of ['Script_ModelImports.mjs','Script_TextureImports.mjs','Data_AssetPublishRuntime.mjs','Data_TextureImportRuntime.mjs'])await fs.copyFile(path.join(project,file),path.join(stage,file));
const textureFiles=(await fs.readdir(path.join(project,'Texture'))).filter(x=>x.startsWith('Texture_CommandRoom'));
const report=await BuildPublishAssets(project,stage,{textureFiles,modelFiles:[],cacheDir:path.join(root,'tmp/CapWallGpuCache')});
const runtime=await fs.readFile(path.join(stage,'Data_TextureImportRuntime.mjs'),'utf8');
const entries=JSON.parse(runtime.match(/=\s*([\s\S]*);\s*$/)[1]);
const lightmap='Texture_CommandRoomLightingImage.webp';
const originalLight=await fs.readFile(path.join(project,'Texture',lightmap));
const publishedLight=entries[lightmap]?.output?await fs.readFile(path.join(stage,'Texture',entries[lightmap].output)):originalLight;
if(!originalLight.equals(publishedLight))throw Error('32x irradiance source must be byte-identical in publication');
const server=await ServeRoot(root,0),browser=await LaunchBrowser(),shots=[];
const fixture=`<!doctype html><base href="/Taierzhuang1938/"><style>body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script><script type="module">
import * as THREE from 'three';import {CommandRoom} from './Script_CommandRoom.mjs';import {SetTextureImportRenderer} from './Script_TextureImports.mjs';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,720);document.body.appendChild(renderer.domElement);SetTextureImportRenderer(renderer);
window.room=new CommandRoom(renderer);await room.Load();room.Update(0);room.Render();window.ready=true;
</script>`;
try{
 for(const published of [false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/CapWallPublishedFixture',r=>r.fulfill({contentType:'text/html',body:fixture}));
  if(published){
   await page.route('**/Data_TextureImportRuntime.mjs*',r=>r.fulfill({contentType:'text/javascript',body:runtime}));
   await page.route('**/Texture/**',async r=>{
    const file=new URL(r.request().url()).pathname.split('/Texture/')[1];
    if(!file.includes('_Import'))return r.continue();
    await r.fulfill({contentType:'application/octet-stream',body:await fs.readFile(path.join(stage,'Texture',file))});
   });
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/CapWallPublishedFixture`);
  await page.waitForFunction(()=>window.ready,{},{timeout:120000});
  if(errors.length)throw Error(errors.join('\n'));
  const name=published?'Published':'Source',file=path.join(out,`Scene_CapWall${name}.png`);
  await page.screenshot({path:file});shots.push(await sharp(file).removeAlpha().raw().toBuffer());
  await page.close();
 }
 const a=shots[0],b=shots[1],differences=[];let total=0;
 for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;differences.push(d);}
 differences.sort((x,y)=>x-y);const validation={meanRgbError:total/a.length,p95:differences[Math.floor(differences.length*.95)],encoded:report.textures.map(x=>x.file),retained:report.skipped};
 await fs.writeFile(path.join(out,'Data_CapWallPublished.json'),JSON.stringify(validation,null,2));
 console.log(JSON.stringify(validation));if(validation.meanRgbError>4||validation.p95>15)throw Error('Published room color error exceeds the publication gate');
}finally{await browser.close();await new Promise(r=>server.close(r));}
