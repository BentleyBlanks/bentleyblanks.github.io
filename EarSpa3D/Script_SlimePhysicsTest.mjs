import assert from 'node:assert/strict';
import {CreatePeelBody} from './Script_PeelPhysics.mjs';
import {SlimeCage,BindSlimeVolume,GripSlimeVolume,UngripSlimeVolume,StepSlimeVolume,WriteSlimeSurface,PoseSlimeVolume} from './Script_SlimePhysics.mjs';
const checks=[],Check=(ok,label)=>{assert.ok(ok,label);checks.push(label);};
function Make(seed=1){const cage=SlimeCage(.8,seed),body=CreatePeelBody({position:[0,0,0],rotation:[0,0,0,1],normal:[0,0,1],size:.8,type:'oily',footprint:[1.08,1.26],anchorCount:13});BindSlimeVolume(body,cage.positions,cage.indices);return body;}
function Safe(body){Check(body.gel.points.flat().every(Number.isFinite),'finite volume nodes');Check(body.gel.minJacobian>0,'positive tetrahedron volumes');Check(Math.abs(body.gel.volumeRatio-1)<.04,'less than four percent volume error');}
const stationary=Make(),rest=stationary.gel.points.map(p=>p.slice());for(let i=0;i<180;i++)StepSlimeVolume(stationary,{});
Check(stationary.anchors.every(a=>a.alive),'gravity alone does not peel attached wax');Check(Math.max(...stationary.gel.points.map((p,i)=>Math.hypot(...p.map((v,k)=>v-rest[i][k]))))<.15,'idle gel does not melt or drift off its attachment');Safe(stationary);
const recoil=Make();GripSlimeVolume(recoil,[0,-.5,.55]);for(let i=0;i<55;i++)StepSlimeVolume(recoil,{target:[0,-.5,.55+2.8*i/100],minAnchors:2});
const stretched=recoil.gel.maxStretch,rendered=recoil.gel.render.positions.slice();WriteSlimeSurface(recoil,rendered);
Check(stretched>2,'gel stretches by more than twice its rest edge length');Check(recoil.anchors.some(a=>a.alive),'unpeeled material stays attached during necking');Safe(recoil);
Check(recoil.anchors.filter(a=>a.alive).every(a=>Math.hypot(...recoil.gel.points[a.node].map((v,k)=>v-a.rest[k]))<.03),'remaining adhesive nodes stay seated within 0.03 mm');
Check(Math.max(...rendered.map((v,i)=>Math.abs(v-recoil.gel.render.rest[i])))>.3,'rendered surface follows the physical deformation');
UngripSlimeVolume(recoil);for(let i=0;i<180;i++)StepSlimeVolume(recoil,{});Check(recoil.gel.maxStretch<stretched*.65,'release recovers elastically with slow viscous relaxation');Safe(recoil);
const before=recoil.gel.points.flat();GripSlimeVolume(recoil,[0,-.5,.55]);Check(recoil.gel.points.flat().every((v,i)=>v===before[i]),'regripping preserves the deformed material state');
for(const seed of [.2,1,3.4,5.8]){const body=Make(seed);GripSlimeVolume(body,[0,-.5,.55]);let steps=0,peak=1,maxError=0,minJ=1;
  for(;steps<480;steps++){StepSlimeVolume(body,{target:[0,-.5,.55+2.8*Math.min(1,steps/100)]});peak=Math.max(peak,body.gel.maxStretch);maxError=Math.max(maxError,Math.abs(body.gel.volumeRatio-1));minJ=Math.min(minJ,body.gel.minJacobian);if(body.detached)break;}
  Check(body.detached&&steps>30&&steps<480,'seed '+seed+' progressively peels and can be removed');Check(peak>1.8&&maxError<.04&&minJ>0,'seed '+seed+' necks without volume collapse or inversion');
  UngripSlimeVolume(body);PoseSlimeVolume(body,[0,1,0],[0,0,0,1]);for(let i=0;i<180;i++)StepSlimeVolume(body,{gravity:[0,-8,0],floor:0});Safe(body);
  Check(body.gel.points.every(p=>p[1]>=-1e-6),'landing nodes remain above the tray');console.log('seed',seed,{steps,peak,maxError,minJ,landedVolume:body.gel.volumeRatio});
}
const paused=Make(),snapshot=JSON.stringify(paused);StepSlimeVolume(paused,{target:[0,0,5]},0);Check(JSON.stringify(paused)===snapshot,'paused time cannot apply force or change geometry');
const Push=Make();GripSlimeVolume(Push,[0,0,.5]);for(let i=0;i<90;i++)StepSlimeVolume(Push,{target:[0,0,-1]});Check(Push.anchors.every(a=>a.alive),'pushing into the wall cannot count as peeling');
console.log('PASS',checks.length,'viscoelastic volume checks');
