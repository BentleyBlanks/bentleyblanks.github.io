// Standalone BackRifleRun acceptance. Uses the existing BrowserTestKit/ServeRoot;
// never starts the game or changes production animation selection.
// node Taierzhuang1938/Script_BackRifleRunTest.mjs [--capture]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {LoadGlb,PoseScene} from './_import/Script_LugouGlbPose.mjs';
const projectDir=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(projectDir);
const assetDir=path.join(projectDir,'Animation/BackRifleRun');
const shotDir=path.join(projectDir,'_shots/BackRifleRun');
const config=JSON.parse(fs.readFileSync(path.join(assetDir,'Data_BackRifleRun.json'),'utf8').replace(/^\uFEFF/,''));
const sha=(file)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(sha(path.join(root,config.sourceModel)),config.sourceModelSha256,'Production character remains original');
assert.equal(sha(path.join(root,config.sourceWeapon)),config.sourceWeaponSha256,'Production rifle remains original');
function ReadGlb(file){const data=fs.readFileSync(file);assert.equal(data.readUInt32LE(0),0x46546c67);const length=data.readUInt32LE(12);const json=JSON.parse(data.toString('utf8',20,20+length));return {json,bin:data.subarray(28+length)};}
const {json,bin}=ReadGlb(path.join(assetDir,'Animation_LugouNraBackRifleRun.glb'));
const original=ReadGlb(path.join(root,config.sourceModel)).json;
const sourcePose=new PoseScene(LoadGlb(path.join(root,config.sourceModel)));
sourcePose.animations.push({channels:[]});sourcePose.Apply(sourcePose.animations.length-1,0);
const BindPoint=(name)=>Array.from(sourcePose.world[sourcePose.NodeIndex(name)].slice(12,15));
const Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
assert.equal(json.animations.length,1);assert.equal(json.animations[0].name,config.clip);
assert.equal(json.scenes.length,1);assert.equal(json.skins.length,1);
const originalNames=original.skins[0].joints.map(i=>original.nodes[i].name).sort();
assert.deepEqual(json.skins[0].joints.map(i=>json.nodes[i].name).sort(),originalNames,'Same source bone names');
assert(json.nodes.some(n=>n.name===config.socket));
assert(!json.nodes.some(n=>n.name==='Cube'||n.name==='Camera'||n.name==='Light'||n.name==='Icosphere'),'No other Blender scene leaked');
function Values(id){const a=json.accessors[id],v=json.bufferViews[a.bufferView];assert.equal(a.componentType,5126);const components={SCALAR:1,VEC3:3,VEC4:4}[a.type];const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*4;return Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,j)=>bin.readFloatLE(offset+i*stride+j*4)));}
let maxSeam=0,maxRotationExcursion=0;
for(const channel of json.animations[0].channels){const values=Values(json.animations[0].samplers[channel.sampler].output);const first=values[0],last=values.at(-1);let gap=Math.max(...first.map((x,i)=>Math.abs(x-last[i])));if(channel.target.path==='rotation'){gap=Math.min(gap,Math.max(...first.map((x,i)=>Math.abs(x+last[i]))));maxRotationExcursion=Math.max(maxRotationExcursion,...values.map(v=>Math.min(...[1,-1].map(sign=>Math.hypot(...v.map((x,i)=>x-sign*first[i]))))));}maxSeam=Math.max(maxSeam,gap);}
assert(maxSeam<0.0001,'Matched loop endpoints');assert(maxRotationExcursion>0.35,'Clip contains real limb motion');
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const errors=[];const page=await browser.newPage({viewport:{width:1320,height:1100},deviceScaleFactor:1});
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/Animation/BackRifleRun/`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.BackRifleReview?.ready,null,{timeout:30000});
 const report=await page.evaluate(()=>{
  const r=window.BackRifleReview;r.Pause();const samples=[];let referenceMount=null,maxMountError=0;
  for(let frame=0;frame<=r.config.cycleFrames*2;frame++){
   const time=frame/(r.config.fps*2);r.SetTime(time);const s=r.Sample();
   const body=r.views[0].character;let chest;body.traverse(o=>{if(o.name.replaceAll('_',' ')==='Bip002 Spine2')chest=o;});const socket=body.getObjectByName(r.config.socket);
   const relative=chest.matrixWorld.clone().invert().multiply(socket.matrixWorld).elements;
   if(!referenceMount)referenceMount=[...relative];maxMountError=Math.max(maxMountError,...relative.map((v,i)=>Math.abs(v-referenceMount[i])));
   samples.push({time,phase:time/r.config.durationSeconds,...s});
  }
  return {samples,maxMountError,clipDuration:r.clip.duration};
 });
 assert.equal(errors.length,0,errors.join('\n'));assert(Math.abs(report.clipDuration-config.durationSeconds)<0.00001);assert(report.maxMountError<0.0001,'Rifle mount stays constrained to chest');
 let minSole=Infinity,maxSupportClearance=0,maxSlide=0;const supportAnchors={};
 for(const sample of report.samples){assert.equal(sample.glError,0);for(const [side,offset] of [['L',0],['R',0.5]]){const phase=(sample.phase+offset)%1;const sole=sample.soles[side];assert(Number.isFinite(sole),`Missing evaluated shoe ${side}`);minSole=Math.min(minSole,sole);if(phase<config.stanceFraction-0.005)maxSupportClearance=Math.max(maxSupportClearance,Math.abs(sole));if(phase<config.stanceFraction-0.135){const segment=Math.floor(sample.phase+offset);const key=side+segment;const z=sample.bones[`Bip002 ${side} Foot`][2]+sample.time*config.referenceSpeedMps;supportAnchors[key]??=z;maxSlide=Math.max(maxSlide,Math.abs(z-supportAnchors[key]));}}}
 assert(minSole>-0.015,`Sole penetration ${minSole}`);assert(maxSupportClearance<0.018,`Support foot floating ${maxSupportClearance}`);assert(maxSlide<0.003,`Support foot sliding ${maxSlide}`);
 const first=report.samples[0],last=report.samples.at(-1);let worldSeam=0;for(const [name,pos] of Object.entries(first.bones)){worldSeam=Math.max(worldSeam,...pos.map((v,i)=>Math.abs(v-last.bones[name][i])));}assert(worldSeam<0.0001,'World-space bone seam');
 const pelvisHeights=report.samples.map(s=>s.bones['Bip002 Pelvis'][1]);assert(Math.max(...pelvisHeights)-Math.min(...pelvisHeights)>0.035,'Pelvis bounce survived export');
 // A grounded foot can still hide a stretched shin. Measure the delivered bones
 // against the original bind lengths, including subframes used by the player.
 let maxLimbLengthError=0,minKneeFlex=180,maxKneeFlex=0,maxToeSlide=0,maxRootDrift=0,maxSeamVelocityJump=0,worstSeamJoint='';
 const toeAnchors={};
 for(const sample of report.samples){
  maxRootDrift=Math.max(maxRootDrift,Distance(sample.bones.GroundRoot,first.bones.GroundRoot));
  for(const [side,offset] of [['L',0],['R',0.5]]){
   const names=['Thigh','Calf','Foot','UpperArm','Forearm','Hand'].map(n=>`Bip002 ${side} ${n}`);
   for(const [a,b] of [[0,1],[1,2],[3,4],[4,5]])maxLimbLengthError=Math.max(maxLimbLengthError,Math.abs(Distance(sample.bones[names[a]],sample.bones[names[b]])-Distance(BindPoint(names[a]),BindPoint(names[b]))));
   const [hip,knee,ankle]=names.slice(0,3).map(n=>sample.bones[n]);
   const upper=Distance(hip,knee),lower=Distance(knee,ankle),reach=Distance(hip,ankle);
   const flex=180-Math.acos(Math.max(-1,Math.min(1,(upper*upper+lower*lower-reach*reach)/(2*upper*lower))))*180/Math.PI;
   minKneeFlex=Math.min(minKneeFlex,flex);maxKneeFlex=Math.max(maxKneeFlex,flex);
   const phase=(sample.phase+offset)%1;
   if(phase<config.stanceFraction-0.005){const key=side+Math.floor(sample.phase+offset),z=sample.bones[`Bip002 ${side} Toe0`][2]+sample.time*config.referenceSpeedMps;toeAnchors[key]??=z;maxToeSlide=Math.max(maxToeSlide,Math.abs(z-toeAnchors[key]));}
  }
 }
 const dt=report.samples[1].time;
 for(const name of ['Bip002 Pelvis','Bip002 L Foot','Bip002 R Foot','Bip002 L Hand','Bip002 R Hand']){
  const incoming=last.bones[name].map((v,i)=>(v-report.samples.at(-2).bones[name][i])/dt);
  const outgoing=report.samples[1].bones[name].map((v,i)=>(v-first.bones[name][i])/dt);
  if(Distance(incoming,outgoing)>maxSeamVelocityJump){maxSeamVelocityJump=Distance(incoming,outgoing);worstSeamJoint=name;}
 }
 assert(maxLimbLengthError<0.0015,`Limb stretch ${maxLimbLengthError}`);
 assert(minKneeFlex>5&&maxKneeFlex<145,`Knee flex range ${minKneeFlex} / ${maxKneeFlex}`);
 assert(maxToeSlide<0.003,`Toe pivot slides through push-off ${maxToeSlide}`);
 assert(maxRootDrift<0.0001,`In-place root drifts ${maxRootDrift}`);
 assert(maxSeamVelocityJump<0.85,`Loop velocity jump ${worstSeamJoint}: ${maxSeamVelocityJump}`);
 const summary={clip:config.clip,revision:config.revision,sampleCount:report.samples.length,maxChannelSeam:maxSeam,maxWorldSeamMeters:worldSeam,minSoleHeightMeters:minSole,maxSupportClearanceMeters:maxSupportClearance,maxSupportSlideMeters:maxSlide,maxToeSlideMeters:maxToeSlide,maxLimbLengthErrorMeters:maxLimbLengthError,kneeFlexDegrees:[minKneeFlex,maxKneeFlex],maxRootDriftMeters:maxRootDrift,maxSeamVelocityJumpMps:maxSeamVelocityJump,maxChestMountMatrixError:report.maxMountError,durationSeconds:report.clipDuration,triangles:first.triangles,drawCalls:first.drawCalls,productionHashesUnchanged:true,boneCount:json.skins[0].joints.length};
 fs.mkdirSync(shotDir,{recursive:true});fs.writeFileSync(path.join(shotDir,'Data_BackRifleRunVerification.json'),JSON.stringify(summary,null,2));
 fs.writeFileSync(path.join(shotDir,'Data_BackRifleRunSamples.json'),JSON.stringify(report.samples));
 await page.evaluate(()=>window.BackRifleReview.SetTime(0));await page.screenshot({path:path.join(shotDir,'Scene_BackRifleReviewDesktop.png')});
 if(process.argv.includes('--capture')){for(let frame=0;frame<config.cycleFrames;frame++){await page.evaluate(frame=>window.BackRifleReview.SetTime(frame/window.BackRifleReview.config.fps),frame);for(const side of ['side','back']){const png=await page.locator('#'+side).evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);fs.writeFileSync(path.join(shotDir,`Scene_${side==='side'?'Side':'Back'}${String(frame).padStart(3,'0')}.png`),Buffer.from(png,'base64'));}}}
 // Ground travel is cumulative and must not rewind at the clip boundary.
 const gridDelta=await page.evaluate(()=>{const r=window.BackRifleReview;r.SetTime(r.clip.duration-0.001,10.1);const before=r.views[0].grid.position.z;r.SetTime(0.001,10.1+0.002*r.config.referenceSpeedMps);return r.views[0].grid.position.z-before;});
 assert(Math.abs(gridDelta+0.002*config.referenceSpeedMps)<0.00001,'Ground travel stays continuous across loops');
 assert.equal(Number(await page.locator('#phase').getAttribute('max')),config.cycleFrames,'Scrubber covers the entire exported cycle');
 await page.locator('#angle').click();assert(await page.evaluate(()=>window.BackRifleReview.views[1].camera.position.z>0),'Front angle control');
 if(process.argv.includes('--capture'))for(const phase of [0,0.125,0.25,0.375]){await page.evaluate(phase=>window.BackRifleReview.SetTime(phase*window.BackRifleReview.clip.duration),phase);const png=await page.locator('#back').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);fs.writeFileSync(path.join(shotDir,`Scene_Front${Math.round(phase*1000)}.png`),Buffer.from(png,'base64'));}
 await page.locator('#angle').click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.BackRifleReview.SetTime(0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout overflow');await page.screenshot({path:path.join(shotDir,'Scene_BackRifleReviewMobile.png'),fullPage:true});
 console.log('BackRifleRunTest PASS '+JSON.stringify(summary));
}finally{await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
