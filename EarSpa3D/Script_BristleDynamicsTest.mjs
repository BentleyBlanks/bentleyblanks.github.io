import assert from 'node:assert/strict';
import {StepBristle} from './Script_BristleDynamics.mjs';
function Simulate(hz){const state={};StepBristle(state,[0,0,0],[.12,0,0],1/hz);let peak=0;for(let i=0;i<hz;i++){StepBristle(state,[0,0,0],[0,0,0],1/hz);peak=Math.max(peak,Math.abs(state.offset[0]));}return {state,peak};}
for(const hz of [30,60,120]){const {state,peak}=Simulate(hz);assert(peak>.025&&peak<.42,'visible bounded elastic lag');assert(Math.hypot(...state.offset)<.001,'bristles settle after motion stops');}
const fixed={};for(let i=0;i<120;i++)StepBristle(fixed,[0,0,0],[2,0,0],1/60,0);assert.equal(Math.hypot(...fixed.offset),0,'fiber roots stay fixed');
const pressed={};for(let i=0;i<120;i++)StepBristle(pressed,[.18,0,0],[0,0,0],1/60);assert(Math.abs(pressed.offset[0]-.18)<.001,'sustained contact converges');
StepBristle(pressed,[0,0,0],[100,-100,50],10);assert(Math.hypot(...pressed.offset)<=.420001,'large input is bounded');
console.log('PASS bristle lag, contact, fixed roots, frame rates and bounded impulses');
