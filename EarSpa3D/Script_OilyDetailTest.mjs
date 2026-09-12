import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8142/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={checks:[],errors:[],surfaces:[],pixels:[]};
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1697,height:674}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>requestAnimationFrame=()=>0);
 await page.locator('#welcome-settings').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(140));
 for(const seed of [20260912,83,519]){
  await page.evaluate(seed=>{__EarSpaDebug.view.Reset(seed,'oily');__EarSpaDebug.StepFrames(2);},seed);
  const surfaces=await page.evaluate(async()=>{
   const T=await import('three'),{view,core}=__EarSpaDebug,wall=core.scene.getObjectByName('Model_Canal');core.scene.updateMatrixWorld(true);
   return view.chunks.map(c=>{
    const mesh=c.mesh,p=mesh.geometry.attributes.position,indices=mesh.geometry.index,points=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));
    let minimum=Infinity,count=0,penetrations=0;const worst=[];
    function Sample(world){const projected=view.canal.Project(world);if(projected.depth<0||projected.depth>20)return;const center=view.canal.CenterAt(projected.depth).clone(),delta=world.clone().sub(center),distance=delta.length(),hit=new T.Raycaster(center,delta.normalize(),0,10).intersectObject(wall)[0];if(hit){const gap=hit.distance-distance;count++;if(gap<-.005)penetrations++;if(gap<minimum){minimum=gap;worst.splice(0,worst.length,...world.toArray());}}}
    points.forEach(Sample);const edges=new Set();
    for(let i=0;i<indices.count;i+=3){const ids=[0,1,2].map(k=>indices.getX(i+k));Sample(points[ids[0]].clone().add(points[ids[1]]).add(points[ids[2]]).multiplyScalar(1/3));for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);if(!edges.has(key)){edges.add(key);Sample(points[a].clone().add(points[b]).multiplyScalar(.5));}}}
    const heights=Array.from(c.body.gel.nodeThickness),material=mesh.material;
    return{id:c.id,count,minimum,penetrations,worst,maxThickness:Math.max(...heights),thin:heights.filter(h=>h<.17).length/heights.length,thick:heights.filter(h=>h>.65).length/heights.length,depthWrite:material.depthWrite,metalness:material.metalness,clearcoatRoughness:material.clearcoatRoughness};
   });
  });report.surfaces.push({seed,regions:surfaces});
  Check(surfaces.every(s=>s.count>8000&&s.minimum>-.005&&s.penetrations===0),seed+' all coatings: vertices, face centers and edge midpoints clear the actual wall');
  Check(surfaces.every(s=>s.thin>.4&&s.thick>.2&&s.maxThickness>1.4),seed+' broad thin coating coexists with substantial connected deposits');
 }
 await page.evaluate(()=>{__EarSpaDebug.view.Reset(20260912,'oily');__EarSpaDebug.StepFrames(3);});
 for(const mode of ['Wide','Deep','Mobile']){
  if(mode==='Deep'){await page.locator('#depth-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(90));}
  if(mode==='Mobile'){await page.locator('#depth-toggle').click();await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>__EarSpaDebug.core.size.width===390,null,{polling:50});await page.evaluate(()=>__EarSpaDebug.StepFrames(90));}
  const pixels=await page.evaluate(()=>{
   const {core,view}=__EarSpaDebug;
   function Pixels(){core.Render();const gl=core.renderer.getContext(),out=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
   function Difference(a,b){let sum=0,changed=0,large=0,max=0;for(let i=0;i<a.length;i+=4){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));sum+=d;max=Math.max(max,d);if(d>2)changed++;if(d>20)large++;}return{mean:sum/(a.length/4),changed,large,max,fraction:large/(a.length/4)};}
   const base=Pixels();view.chunks.forEach(c=>c.mesh.material.userData.gelDetail.value=0);const flat=Pixels();view.chunks.forEach(c=>c.mesh.material.userData.gelDetail.value=1);
   const originals=view.chunks.map(c=>c.mesh.geometry.index.array.slice());
   view.chunks.forEach((c,j)=>{const idx=c.mesh.geometry.index,old=originals[j];for(let i=0;i<old.length;i+=3)for(let k=0;k<3;k++)idx.array[i+k]=old[old.length-3-i+k];idx.needsUpdate=true;});const reversed=Pixels();
   view.chunks.forEach((c,j)=>{c.mesh.geometry.index.array.set(originals[j]);c.mesh.geometry.index.needsUpdate=true;c.mesh.material.depthWrite=false;});const noDepth=Pixels();view.chunks.forEach(c=>c.mesh.material.depthWrite=true);Pixels();
   return{detail:Difference(base,flat),order:Difference(base,reversed),oldDepth:Difference(base,noDepth)};
  });report.pixels.push({mode,...pixels});
  Check(pixels.detail.changed>100,'visible fine normals change real pixels at '+mode);
  Check(pixels.order.fraction<.0005&&pixels.order.mean<.08,'far folds cannot paint crossing lines when triangle order is reversed at '+mode);
  await page.screenshot({path:path.join(here,'_dev/Shot_OilyDetail'+mode+'.png')});
 }
 Check(report.pixels[0].oldDepth.large>30,'reference viewpoint reproduces the former missing-depth crossing artifacts');
 Check(report.errors.length===0,'no browser, shader or asset errors');console.log('PASS oily surface detail',report.checks.length,JSON.stringify(report.pixels));
}finally{await fs.writeFile(path.join(here,'_dev/Data_OilyDetailReport.json'),JSON.stringify(report,null,2));await browser.close();}
