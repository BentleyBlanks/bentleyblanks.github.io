// Uses the project browser kit. Tests the exported GLB, not just source formulas.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../../Script_DevServer.mjs';
const assetDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(assetDir,'../../..');
const server=await ServeRoot(root,0);const browser=await LaunchBrowser();
const shots=path.join(root,'Taierzhuang1938/_shots/TrainReference');await fs.mkdir(shots,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const errors=[];page.on('pageerror',error=>{errors.push(String(error));console.error(String(error));});
  page.on('response',response=>{if(response.status()>=400) console.error(response.status(),response.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/Model/TrainReference/`);
  await page.waitForFunction(()=>window.TrainReview?.ready,{timeout:30000});
  const report=await page.evaluate(()=>{
    const review=window.TrainReview;const v=review.camera.position.clone();let maxJointError=0,maxRollingError=0,maxContactTravel=0;
    for(let i=-120;i<=120;i++){
      const s=i*Math.PI*2*.73/120;review.SetDistance(s);
      const loco=review.models.Locomotive;
      for(const record of review.manifest.rods){
        const rod=loco.getObjectByName(record.name);const start=rod.localToWorld(v.clone().set(0,0,0));const end=rod.localToWorld(v.clone().set(record.length,0,0));
        const angle=s/.73+record.phase;
        const expected=loco.localToWorld(v.clone().set(record.axleX+.32*Math.cos(angle),.73-.32*Math.sin(angle),-record.side*(record.kind==='main'?1.17:1.035)));
        maxJointError=Math.max(maxJointError,start.distanceTo(expected),Math.abs(end.distanceTo(start)-record.length));
        if(record.kind==='main'){
          const head=loco.getObjectByName(`Model_Crosshead${record.side===1?'Left':'Right'}`);
          maxJointError=Math.max(maxJointError,end.distanceTo(head.getWorldPosition(v.clone())));
        }
      }
      for(const record of review.manifest.wheels){
        const model=record.root.includes('Gondola')?review.models.Gondola:loco;const wheel=model.getObjectByName(record.name);
        maxRollingError=Math.max(maxRollingError,Math.abs((-wheel.rotation.z-record.phase)*record.radius-s));
        // Actual world-space movement of the material point touching the rail.
        const localPoint=v.clone().set(0,-record.radius,0).applyQuaternion(wheel.quaternion.clone().invert());
        const before=wheel.localToWorld(localPoint.clone());review.SetDistance(s+.0001);
        const after=wheel.localToWorld(localPoint.clone());maxContactTravel=Math.max(maxContactTravel,before.distanceTo(after));review.SetDistance(s);
      }
    }
    review.SetDistance(0);review.SetView('Both');
    return {status:'PASS',sampleCount:241,maxJointErrorMeters:maxJointError,maxRollingErrorMeters:maxRollingError,maxContactDisplacementMeters:maxContactTravel,wheels:review.rigs.Locomotive.wheelCount+review.rigs.Gondola.wheelCount,rods:review.rigs.Locomotive.rodCount,glError:review.renderer.getContext().getError(),triangles:review.renderer.info.render.triangles};
  });
  assert.equal(report.wheels,16);assert.equal(report.rods,10);assert.equal(report.glError,0);assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(report.maxJointErrorMeters<.00001,JSON.stringify(report));assert.ok(report.maxRollingErrorMeters<.00001);assert.ok(report.maxContactDisplacementMeters<.00001,JSON.stringify(report));
  await page.screenshot({path:path.join(assetDir,'Texture_TrainRuntime.png')});
  await page.evaluate(()=>window.TrainReview.SetView('Locomotive'));await page.screenshot({path:path.join(assetDir,'Texture_LocomotiveRuntime.png')});
  await page.evaluate(()=>window.TrainReview.SetView('Gondola'));await page.screenshot({path:path.join(assetDir,'Texture_GondolaRuntime.png')});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.TrainReview.SetView('Both'));await page.screenshot({path:path.join(shots,'Texture_Mobile.png')});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{window.TrainReview.SetView('Mechanism');document.querySelector('header').style.display='none';document.querySelector('.panel').style.display='none';document.querySelector('#status').style.display='none';});
  if(process.argv.includes('--video'))for(let frame=0;frame<120;frame++){
    // 8 seconds: forward, stop, reverse, stop. No negative-scale mirroring.
    const t=frame/15;const s=t<3?t*.8:t<4?2.4:t<7?2.4-(t-4)*.8:0;
    await page.evaluate(s=>window.TrainReview.SetDistance(s),s);
    await page.screenshot({path:path.join(shots,`Texture_Motion${String(frame).padStart(3,'0')}.png`)});
  }
  report.mobileOverflow=overflow;report.browserErrors=errors;
  await fs.writeFile(path.join(assetDir,'Data_TrainExportValidation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
