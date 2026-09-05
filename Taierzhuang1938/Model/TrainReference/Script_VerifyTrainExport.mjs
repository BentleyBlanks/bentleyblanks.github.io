// Uses the project browser kit. Tests the exported GLB, not just source formulas.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../../Script_DevServer.mjs';
const assetDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(assetDir,'../../..');
const reviewDir=path.join(assetDir,'_review');
const server=await ServeRoot(root,0);const browser=await LaunchBrowser();
const shots=path.join(root,'Taierzhuang1938/_shots/TrainReference');await fs.mkdir(shots,{recursive:true});
const localReview=process.argv.includes('--local-review');
// A fresh checkout can validate without any saved acceptance website.
// The minimal harness and every screenshot remain in ignored local directories.
const testPage=`<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js","three/addons/":"/Taierzhuang1938/vendor/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CreateTrainRig} from '/Taierzhuang1938/Model/TrainReference/Script_TrainRig.mjs';
const base='/Taierzhuang1938/Model/TrainReference/';
const manifest=await fetch(base+'Data_TrainRig.json').then(r=>r.json());
const scene=new THREE.Scene();scene.background=new THREE.Color(0x38454c);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,200);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x333333,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(5,9,5);scene.add(light);
const loader=new GLTFLoader(),models={},rigs={};let distance=0;
for(const kind of ['Locomotive','Gondola']){const gltf=await loader.loadAsync(base+'Model_'+kind+'Rig.glb');models[kind]=gltf.scene;models[kind].position.z=kind==='Gondola'?5.3:0;scene.add(gltf.scene);rigs[kind]=CreateTrainRig(gltf.scene,manifest);}
function SetView(view){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);models.Locomotive.visible=view!=='Gondola';models.Gondola.visible=view==='Both'||view==='Gondola';camera.position.set(distance+16,10,25);camera.lookAt(distance,1.5,2);renderer.render(scene,camera);}
function SetDistance(s){distance=s;for(const kind of Object.keys(models)){models[kind].position.x=s;rigs[kind].SetTravelMeters(s);}scene.updateMatrixWorld(true);renderer.render(scene,camera);}
SetView('Both');SetDistance(0);window.TrainReview={ready:true,models,rigs,scene,camera,renderer,manifest,SetDistance,SetView};
</script>`;
if(!localReview)await fs.writeFile(path.join(shots,'Scene_TrainValidation.html'),testPage);
try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const errors=[];page.on('pageerror',error=>{errors.push(String(error));console.error(String(error));});
  page.on('response',response=>{if(response.status()>=400) console.error(response.status(),response.url());});
  const pagePath=localReview?'/Taierzhuang1938/Model/TrainReference/_review/':'/Taierzhuang1938/_shots/TrainReference/Scene_TrainValidation.html';
  await page.goto(`http://127.0.0.1:${server.address().port}${pagePath}`);
  await page.waitForFunction(()=>window.TrainReview?.ready,{timeout:30000});
  const report=await page.evaluate(()=>{
    const review=window.TrainReview;const v=review.camera.position.clone();let maxJointError=0,maxRollingError=0,maxContactTravel=0,maxValveJointError=0;
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
      for(const record of review.manifest.valveGear??[]){
        const Point=(name,x,y,z)=>loco.getObjectByName(name).localToWorld(v.clone().set(x,y,z));
        const e=Point(record.eccentricRod,0,0,0),b=Point(record.eccentricRod,record.eccentricLength,0,0);
        const wheel=Point(`Model_Driver2${record.side===1?'Left':'Right'}`,0,.18,-record.side*.56);
        const rocker=Point(record.rocker,0,-record.rockerLength,0),radiusPin=Point(record.rocker,0,-record.rockerLength*record.fixedSetting,0);
        const radiusStart=Point(record.radiusRod,0,0,0),radiusEnd=Point(record.radiusRod,record.radiusLength,0,0),stem=Point(record.stem,0,0,0);
        maxValveJointError=Math.max(maxValveJointError,e.distanceTo(wheel),b.distanceTo(rocker),radiusStart.distanceTo(radiusPin),radiusEnd.distanceTo(stem));
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
    return {status:'PASS',sampleCount:241,maxJointErrorMeters:maxJointError,maxValveJointErrorMeters:maxValveJointError,maxRollingErrorMeters:maxRollingError,maxContactDisplacementMeters:maxContactTravel,wheels:review.rigs.Locomotive.wheelCount+review.rigs.Gondola.wheelCount,rods:review.rigs.Locomotive.rodCount,valveGears:review.rigs.Locomotive.valveGearCount,glError:review.renderer.getContext().getError(),triangles:review.renderer.info.render.triangles};
  });
  assert.equal(report.wheels,16);assert.equal(report.rods,10);assert.equal(report.glError,0);assert.equal(errors.length,0,errors.join('\n'));
  assert.ok(report.maxJointErrorMeters<.00001,JSON.stringify(report));assert.ok(report.maxRollingErrorMeters<.00001);assert.ok(report.maxContactDisplacementMeters<.00001,JSON.stringify(report));
  assert.equal(report.valveGears,2);assert.ok(report.maxValveJointErrorMeters<.00001,JSON.stringify(report));
  const outputDir=localReview?reviewDir:shots;
  await page.screenshot({path:path.join(outputDir,'Texture_TrainRuntime.png')});
  for(const view of ['Locomotive','Gondola','Mechanism','Cab','WagonDetail']){
    await page.evaluate(view=>window.TrainReview.SetView(view),view);await page.screenshot({path:path.join(outputDir,`Texture_${view}Runtime.png`)});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.TrainReview.SetView('Both'));await page.screenshot({path:path.join(shots,'Texture_Mobile.png')});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{window.TrainReview.SetView('Mechanism');for(const selector of ['header','.panel','#status']){const element=document.querySelector(selector);if(element)element.style.display='none';}});
  if(process.argv.includes('--video'))for(let frame=0;frame<120;frame++){
    // 8 seconds: forward, stop, reverse, stop. No negative-scale mirroring.
    const t=frame/15;const s=t<3?t*.8:t<4?2.4:t<7?2.4-(t-4)*.8:0;
    await page.evaluate(s=>window.TrainReview.SetDistance(s),s);
    await page.screenshot({path:path.join(shots,`Texture_Motion${String(frame).padStart(3,'0')}.png`)});
  }
  report.mobileOverflow=overflow;report.browserErrors=errors;
  await fs.writeFile(path.join(assetDir,'Data_TrainExportValidation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
