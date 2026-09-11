// Runtime evidence: hair texture contributes visible pixels, its alpha contains holes,
// and native pinna occlusion survives GLB import. Outputs remain local.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8096/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let result;
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
 result=await page.evaluate(async()=>{
  const T=await import('three');
  const {core}=__EarSpaDebug;__EarSpaDebug.StepFrames(3);
  const cards=core.scene.getObjectByName('Model_ProfileHairStrands'),wisps=core.scene.getObjectByName('Model_ProfileHairWisps'),head=core.scene.getObjectByName('Model_Temple');
  const map=cards.material.map,canvas=document.createElement('canvas');canvas.width=map.image.width;canvas.height=map.image.height;
  const context=canvas.getContext('2d');context.drawImage(map.image,0,0);const tex=context.getImageData(0,0,canvas.width,canvas.height).data;
  let holes=0,opaque=0;for(let i=3;i<tex.length;i+=4){if(tex[i]<32)holes++;if(tex[i]>240)opaque++;}
  function Pixels(){core.Render();const gl=core.renderer.getContext(),out=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
  const on=Pixels(),bump=cards.material.bumpMap;cards.material.map=null;cards.material.bumpMap=null;cards.material.needsUpdate=true;const off=Pixels();
  cards.material.map=map;cards.material.bumpMap=bump;cards.material.needsUpdate=true;core.Render();
  let changed=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>15)changed++;
  const colors=head.geometry.attributes.color;let low=1,high=0;for(let i=0;i<colors.count;i++){low=Math.min(low,colors.getX(i));high=Math.max(high,colors.getX(i));}
  // Stay posterior to the intentionally exposed ear/neck edge; test solid coverage independently of alpha cards.
  const base=core.scene.getObjectByName('Model_ProfileHair'),coverage=[];core.scene.updateMatrixWorld(true);
  for(const angle of [-20,0,20]){
   const direction=new T.Vector3(Math.sin(angle*Math.PI/180),0,Math.cos(angle*Math.PI/180));let sampled=0,covered=0;
   for(let x=28;x<=64;x+=2)for(let y=-18;y<=36;y+=2){
    const ray=new T.Raycaster(new T.Vector3(x,y,0).addScaledVector(direction,-250),direction),skinHit=ray.intersectObject(head)[0];
    if(!skinHit)continue;sampled++;const hairHit=ray.intersectObject(base)[0];if(hairHit&&hairHit.distance<skinHit.distance)covered++;
   }coverage.push({angle,sampled,covered});
  }
  return{holes,opaque,textureSize:[canvas.width,canvas.height],textureChangedPixels:changed,coverage,opaqueHair:!base.material.transparent,occlusionRange:[low,high],pinnaUsesColors:head.material.vertexColors,wispVertices:wisps.geometry.attributes.position.count,stats:__EarSpaProbe().stats};
 });
 assert.ok(result.holes>1000&&result.opaque>100000,'generated hair texture retains transparent gaps and dense strands');
 assert.ok(result.textureChangedPixels>10000,'actual hair texture changes visible rendered pixels');
 assert.ok(result.pinnaUsesColors&&result.occlusionRange[0]<.6&&result.occlusionRange[1]>.95,'pinna cavity occlusion survives export and material binding');
 assert.ok(result.wispVertices>1000&&result.stats.triangles<=180000&&result.stats.drawCalls<=120,'silhouette hair remains present within runtime budget');
 assert.ok(result.opaqueHair&&result.coverage.every(a=>a.sampled>400&&a.covered===a.sampled),'posterior scalp stays covered at three viewing angles');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS 6 outer anatomy and layered hair checks',JSON.stringify(result));
}finally{await fs.mkdir(path.join(here,'_dev'),{recursive:true});await fs.writeFile(path.join(here,'_dev/Data_OuterAnatomyReport.json'),JSON.stringify({result,errors},null,2));await browser.close();}
