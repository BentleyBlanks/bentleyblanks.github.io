import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const project=import.meta.dirname,root=path.dirname(project),bundle=path.join(project,'_check_ClothAsyncBundle.mjs');
await build({entryPoints:[path.join(project,'Script_ClothBloodAsync.mjs')],outfile:bundle,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,keepNames:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const html=await fs.readFile(path.join(project,'index.html'),'utf8'),map=html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
 await page.route('**/Taierzhuang1938/__ClothAsync',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'+map}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/__ClothAsync`);
 const rows=await page.evaluate(async()=>{
  const {ClothBloodModel}=await import('./Script_ClothBloodModel.mjs'),rows=[];
  const Create=()=>{const m=new ClothBloodModel({width:.2,length:.25,profile:'towel'});m.Inject({amountMl:30,side:-1});m.Advance(45);m.StartFeed({rateMlS:.1});return m;};
  const Equal=(a,b)=>a.layers.every((layer,i)=>Object.keys(layer).every(key=>{
   const x=new Uint8Array(layer[key].buffer),y=new Uint8Array(b.layers[i][key].buffer);return x.length===y.length&&x.every((v,j)=>v===y[j]);
  }))&&a.pendingS===b.pendingS&&a.timeS===b.timeS&&a.State().hash===b.State().hash;
  for(const url of ['./Script_ClothBloodAsync.mjs','./_check_ClothAsyncBundle.mjs']){
   const {AsyncClothBlood}=await import(url),model=Create(),reference=Create(),cap=30.25;
   const simulation=new AsyncClothBlood(model,cap),ready=await simulation.ready;
   const Step=dt=>{simulation.Advance(dt);if(reference.feed&&reference.injectedMl>=cap)reference.StopFeed();reference.Advance(dt);};
   for(let i=0;i<240;i++)Step([.016,.021,.04,.013][i%4]);
   await simulation.Flush();const exact=Equal(model,reference),stopped=!model.feed;
   for(let i=0;i<4;i++)Step(.017);
   simulation.Fallback(new Error('deliberate runtime failure'));const recovered=Equal(model,reference);
   simulation.Dispose();const time=model.timeS;simulation.Advance(1);
   const disposed=!simulation.worker&&model.timeS===time;
   const early=new AsyncClothBlood(Create(),cap);early.Dispose();await early.ready;await new Promise(r=>setTimeout(r,0));
   rows.push({url,ready,exact,stopped,recovered,disposed,earlyDisposed:!early.worker&&early.urls.length===0});
  }
  return rows;
 });
 for(const row of rows)for(const key of ['ready','exact','stopped','recovered','disposed','earlyDisposed'])assert.equal(row[key],true,`${row.url}: ${key}`);
 assert.deepEqual(errors,[]);console.log(JSON.stringify(rows));
 console.log('PASS async cloth: original Float64 states and texture bytes, cap, ordered catch-up, fallback, disposal; source and minified bundle');
}finally{await browser.close();await new Promise(r=>server.close(r));await fs.unlink(bundle).catch(()=>{});}
