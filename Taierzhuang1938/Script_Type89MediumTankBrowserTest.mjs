// Actual runtime GLB and public rigid-motion API; fixtures/screens remain local.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const project=import.meta.dirname,repo=path.dirname(project),shots=path.join(project,'_shots/Type89MediumTank');
const modelUrl=process.argv.find(value=>value.startsWith('--model='))?.slice(8)||'/Taierzhuang1938/Model/Type89MediumTank/Model_Type89MediumTank.glb';
const trackPathUrl=process.argv.find(value=>value.startsWith('--track-path='))?.slice(13)||'/Taierzhuang1938/Model/Type89MediumTank/Data_TrackPath.json';
await fs.mkdir(shots,{recursive:true});
const server=await ServeRoot(repo),port=server.address().port;
const browser=await LaunchBrowser();
try{
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/__Type89Fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><base href="/Taierzhuang1938/"><style>html,body{margin:0;height:100%;background:#777}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js","three/addons/":"/Taierzhuang1938/vendor/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Type89Motion} from '/Taierzhuang1938/Model/Type89MediumTank/Script_Type89Motion.mjs';
import {OPTIONAL_VEHICLE_ASSETS} from '/Taierzhuang1938/Data_VehicleAssets.mjs';
import {InstantiateExternalProp,ExternalPropCatalog,BasePlacements} from '/Taierzhuang1938/Script_ExternalProps.mjs';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(.35,.35,.35);scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2));const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-3,7,-4);scene.add(sun);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.02,80);camera.position.set(-6,3,-7);camera.lookAt(0,1.2,.4);
try{const path=await fetch(${JSON.stringify(trackPathUrl)}).then(r=>r.json());const vehicle=OPTIONAL_VEHICLE_ASSETS.find(asset=>asset.id==='Type89MediumTank');const configured=${JSON.stringify(modelUrl)}==='/Taierzhuang1938/Model/Type89MediumTank/Model_Type89MediumTank.glb';const model=configured?await InstantiateExternalProp(vehicle.catalogId,{}):(await new GLTFLoader().loadAsync(${JSON.stringify(modelUrl)})).scene;scene.add(model);const motion=new Type89Motion(model,path);await renderer.compileAsync(scene,camera);window.runtime={THREE,renderer,scene,camera,model,motion,path,vehicle,catalog:ExternalPropCatalog(),placements:BasePlacements()};window.ready=true;function Frame(){renderer.render(scene,camera);requestAnimationFrame(Frame)}requestAnimationFrame(Frame);}catch(error){window.failure=String(error);throw error;}
</script>`}));
  await page.goto(`http://127.0.0.1:${port}/__Type89Fixture`);
  await page.waitForFunction(()=>window.ready||window.failure,null,{timeout:60000});
  const report=await page.evaluate(()=>{
    if(window.failure)throw Error(window.failure);
    const {THREE,renderer,model,motion,path,vehicle,catalog,placements}=window.runtime;
    const checks=[];const Check=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
    Check('Configured vehicle is selectable and never implicitly placed in a campaign',vehicle.campaignEnabled===false&&catalog.some(entry=>entry.id===vehicle.catalogId)&&!Object.values(placements).flat().some(entry=>entry.asset===vehicle.catalogId));
    const left=motion.nodes.get('Node_TrackLinkLeft000'),right=motion.nodes.get('Node_TrackLinkRight000');
    const rightRest=right.position.clone(),rightQuaternion=right.quaternion.clone(),leftRest=left.position.clone();
    motion.SetTravel(.37,0);
    Check('Left/right distance clocks are independent',left.position.distanceTo(leftRest)>.1&&right.position.distanceTo(rightRest)<1e-7&&1-Math.abs(right.quaternion.dot(rightQuaternion))<1e-7);
    motion.SetTravel(path.length,0);
    let positionError=0,rotationError=0;
    for(const link of motion.tracks.Left){const rest=motion.rest.get(link.name);positionError=Math.max(positionError,link.position.distanceTo(new THREE.Vector3().fromArray(rest.position)));rotationError=Math.max(rotationError,1-Math.abs(link.quaternion.dot(new THREE.Quaternion().fromArray(rest.quaternion))));}
    Check('Full articulated belt loop closes',positionError<2e-6&&rotationError<2e-6,{positionError,rotationError});
    motion.SetTravel(.037,.037);let wheelError=0,wheelCount=0;
    for(const side of ['Left','Right'])for(const wheel of motion.wheels[side]){const rest=new THREE.Quaternion().fromArray(motion.rest.get(wheel.name).quaternion);const angle=2*Math.acos(Math.min(1,Math.abs(rest.dot(wheel.quaternion))));wheelError=Math.max(wheelError,Math.abs(angle*wheel.userData.radiusM-.037));wheelCount++;}
    Check('All wheel surfaces use the same travelled distance',wheelCount===30&&wheelError<2e-7,{wheelCount,wheelError});
    motion.Reset();motion.SetPose({turretYaw:Math.PI/2,mainGunPitch:.18,recoilM:.08,commanderHatchFront:1.1,commanderHatchRear:.8,driverVisionFlap:1.4,leftSideVisionFlap:2.8,bowHatch:.8,engineHatches:.65});
    Check('Turret Y axis and bore recoil work',Math.abs(motion.nodes.get('Node_TurretYaw').quaternion.y-Math.SQRT1_2)<1e-6&&Math.abs(motion.nodes.get('Node_MainGunRecoil').position.z-motion.rest.get('Node_MainGunRecoil').position[2]-.08)<1e-6);
    Check('Fore/aft hatches open independently',motion.nodes.get('Node_CommanderHatchFront').quaternion.x<0&&motion.nodes.get('Node_CommanderHatchRear').quaternion.x>0);
    motion.SetPose({bowRoundPortCover:Math.PI});
    Check('Round bow cover flips fully to reveal its inner badge',Math.abs(motion.nodes.get('Node_BowRoundPortCover').quaternion.x)> .999999);
    motion.SetPose({engineHatchLeft:.6,engineHatchRight:0,bowMachineGunYaw:.12,turretMachineGunPitch:.1});
    Check('Engine lids have separate controls',Math.abs(motion.nodes.get('Node_EngineHatchLeft').quaternion.z)>.25&&Math.abs(motion.nodes.get('Node_EngineHatchRight').quaternion.z)<1e-7);
    Check('Both machine guns retain working local pivots',1-Math.abs(motion.nodes.get('Node_BowMachineGun').quaternion.dot(new THREE.Quaternion().fromArray(motion.rest.get('Node_BowMachineGun').quaternion)))>1e-4&&1-Math.abs(motion.nodes.get('Node_TurretMachineGun').quaternion.dot(new THREE.Quaternion().fromArray(motion.rest.get('Node_TurretMachineGun').quaternion)))>1e-4);
    if(motion.bowDoorLinkage){
      const resolved=motion.SetPose({bowHatch:Math.PI*65/180,bowMachineGunYaw:-.1,bowMachineGunPitch:-.1});
      Check('Opening the door resolves its collision-cleared gun stow pose',Math.abs(resolved.bowMachineGunYaw-Math.PI/18)<1e-6&&Math.abs(resolved.bowMachineGunPitch-Math.PI*8/180)<1e-6);
      motion.SetPose({bowHatch:0,bowMachineGunYaw:-.1,bowMachineGunPitch:-.1});
      Check('Closing the door restores independent gun aiming',Math.abs(motion.nodes.get('Node_BowMachineGun').quaternion.angleTo(new THREE.Quaternion().fromArray(motion.rest.get('Node_BowMachineGun').quaternion)))>.1);
    }
    const fixedMount=motion.nodes.get('Node_TurretMgMount'),fixedRest=fixedMount?.quaternion.clone();
    motion.SetPose({bowMachineGunPitch:.10,turretMachineGunYaw:.12});
    Check('Hull machine gun also elevates independently',1-Math.abs(motion.nodes.get('Node_BowMachineGun').quaternion.dot(new THREE.Quaternion().fromArray(motion.rest.get('Node_BowMachineGun').quaternion)))>1e-4);
    Check('Rear machine gun also traverses independently',1-Math.abs(motion.nodes.get('Node_TurretMachineGun').quaternion.dot(new THREE.Quaternion().fromArray(motion.rest.get('Node_TurretMachineGun').quaternion)))>1e-4);
    Check('Rear gun mounting flange stays fixed while the gun aims',fixedMount&&1-Math.abs(fixedMount.quaternion.dot(fixedRest))<1e-8);
    if(motion.nodes.has('Node_SideVisionLatchLeft')){
      const latch=motion.nodes.get('Node_SideVisionLatchLeft'),rightLatch=motion.nodes.get('Node_SideVisionLatchRight');
      const rest=new THREE.Quaternion().fromArray(motion.rest.get(latch.name).quaternion),rightRest=new THREE.Quaternion().fromArray(motion.rest.get(rightLatch.name).quaternion);
      motion.SetPose({leftSideVisionFlap:Math.PI*165/180});
      Check('Open observation cover deploys its real latch pivot',Math.abs(rest.angleTo(latch.quaternion)-Math.PI/2)<1e-6);
      Check('Other observation latch remains independently folded',rightRest.angleTo(rightLatch.quaternion)<1e-6);
      motion.SetPose({leftSideVisionFlap:Math.PI/3});
      Check('Latch folds clear before the cover reaches the hull',rest.angleTo(latch.quaternion)<1e-6);
      motion.Reset();
      Check('Reset restores the authored folded latch',rest.angleTo(latch.quaternion)<1e-6);
    }
    let finite=true,rigid=true,meshCount=0;const materials=new Set();
    model.traverse(node=>{finite&&=[...node.position.toArray(),...node.quaternion.toArray()].every(Number.isFinite);rigid&&=node.scale.toArray().every(value=>Math.abs(value-1)<1e-5);if(node.isMesh){meshCount++;for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
    Check('Poses preserve rigid finite transforms',finite&&rigid);
    for(const material of materials){
      if(material.name.endsWith('Shadow'))continue;
      Check('Real mapped PBR and correct colour spaces: '+material.name,material.map&&material.normalMap&&material.roughnessMap&&material.metalnessMap&&material.aoMap&&material.map.colorSpace===THREE.SRGBColorSpace&&material.normalMap.colorSpace===THREE.NoColorSpace&&material.roughnessMap.colorSpace===THREE.NoColorSpace);
    }
    const glass=[...materials].find(material=>material.name.endsWith('Glass'));Check('Glass survives loading as transmission PBR',glass?.isMeshPhysicalMaterial&&glass.transmission>.8);
    motion.Reset();renderer.render(window.runtime.scene,window.runtime.camera);
    return {pass:checks.every(row=>row.pass),checks,meshCount,materials:materials.size,rendererTriangles:renderer.info.render.triangles};
  });
  const poses=[['Neutral',{},[-6,3,-7],[0,1.2,.4]],['Maintenance',{turretYaw:Math.PI/2,commanderHatchFront:1.1,commanderHatchRear:.8,driverVisionFlap:1.4,leftSideVisionFlap:2.8,bowHatch:.8,engineHatches:.65},[-6,3,-7],[0,1.2,.4]],['Rear',{},[-6,3,7],[0,1.2,.4]]];
  for(const [label,pose,position,target]of poses){
    await page.evaluate(({pose,position,target})=>{const {motion,camera}=window.runtime;motion.Reset();motion.SetPose(pose);camera.position.set(...position);camera.lookAt(...target);},{pose,position,target});await page.waitForTimeout(80);
    const image=await page.screenshot();await fs.writeFile(path.join(shots,'Scene_Browser'+label+'.png'),image);await sharp(image).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:84}).toFile(path.join(shots,'Scene_Browser'+label+'_640.jpg'));
  }
  report.errors=errors;report.pass&&=errors.length===0;
  report.modelUrl=modelUrl;report.trackPathUrl=trackPathUrl;report.assetSha256=createHash('sha256').update(await fs.readFile(path.join(repo,modelUrl.split('?')[0].replace(/^\//,'')))).digest('hex');
  await fs.writeFile(path.join(shots,'Data_RuntimeBrowserAudit.json'),JSON.stringify(report,null,2));
  assert.ok(report.pass,JSON.stringify(report));
  console.log(JSON.stringify({pass:true,checks:report.checks.length,materials:report.materials,meshCount:report.meshCount,triangles:report.rendererTriangles,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
