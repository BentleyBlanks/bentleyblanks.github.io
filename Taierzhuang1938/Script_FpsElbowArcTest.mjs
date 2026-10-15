// Pure numerical regression for the elbow circle; no Three/DOM/browser/assets.
import assert from 'node:assert/strict';
import {StepElbowArc} from './Script_FpsElbowArc.mjs';
const EPS = 1e-10;
const Wrap = angle => Math.atan2(Math.sin(angle),Math.cos(angle));
const Inside = (angle,center,width) => Math.abs(Wrap(angle-center)) <= width+EPS;
let checks = 0;
const Check = (condition,message) => {assert(condition,message);checks++;};
const basic=StepElbowArc({center:0,halfWidth:.5,target:.3,maxStep:.1});
assert.deepEqual(basic,{angle:.1,feasible:true,overspeed:false,requiredStep:0});checks++;
// The pole is at -0.4 == 5.883 radians. Only the positive long route is legal.
// Taking the shortest circular direction crosses the gap; greedy closeness
// would stay forever at zero instead of progressing around the legal arc.
const longWay=StepElbowArc({center:3,halfWidth:3,target:-.4,maxStep:.1});
Check(longWay.feasible&&Math.abs(longWay.angle-.1)<EPS,'Must progress along the legal long arc without crossing its gap');
const impossible=StepElbowArc({center:.8,halfWidth:.1,target:0,maxStep:.05});
Check(!impossible.feasible&&impossible.overspeed,'Moving hard arc beyond speed cap must be reported as infeasible');
Check(Math.abs(impossible.angle-.7)<EPS&&Math.abs(impossible.requiredStep-.7)<EPS,'Infeasible fallback is nearest legal wrist correction, not the pole');
Check(Inside(impossible.angle,.8,.1),'Infeasible fallback still respects wrist hard bound');
const point=StepElbowArc({center:1,halfWidth:0,target:-2,maxStep:2});
Check(point.feasible&&Math.abs(point.angle-1)<EPS,'Zero-width feasible arc is a valid exact point');
const stopped=StepElbowArc({center:.1,halfWidth:.2,target:-2,maxStep:0});
Check(stopped.feasible&&stopped.angle===0,'Zero timestep retains a currently valid elbow');
const full=StepElbowArc({center:2.9,halfWidth:Math.PI,target:-.3,maxStep:.1});
Check(full.feasible&&Math.abs(full.angle+.1)<EPS,'Full circle follows the short pole direction');

// Continuous 1deg wrist-preferred rotation through the +/-pi cut. The old
// direct projection jumped between opposite arc ends. Each frame here remains
// hard-legal and bounded even when the closest legal pole endpoint switches.
for(const halfWidth of [.65,1.3,Math.PI-.05]){
  let plane=0,maximumStep=0;
  for(let degree=-180;degree<=182;degree++){
    const preferred=(degree+180)*Math.PI/180,center=Wrap(preferred-plane),target=Wrap(-plane),maxStep=.1;
    const step=StepElbowArc({center,halfWidth,target,maxStep});
    Check(step.feasible,'Smooth wrist arc must remain reachable at the selected rate');
    Check(Inside(step.angle,center,halfWidth),'Smooth wrist trajectory violates hard arc');
    Check(Math.abs(step.angle)<=maxStep+EPS,'Smooth wrist trajectory exceeds angular speed');
    if(Inside(0,center,halfWidth))for(let i=0;i<=8;i++)Check(Inside(step.angle*i/8,center,halfWidth),'Step crossed the forbidden arc');
    maximumStep=Math.max(maximumStep,Math.abs(step.angle));plane+=step.angle;
  }
  Check(maximumStep<=.1+EPS,'The +/-pi branch introduced a large jump');
}
// The pole itself crosses +/-pi while a valid elbow follows it continuously.
{
  let plane=0;
  for(let degree=179;degree<=540;degree++){
    const step=StepElbowArc({center:0,halfWidth:Math.PI,target:Wrap(degree*Math.PI/180-plane),maxStep:.1});
    Check(step.feasible&&Math.abs(step.angle)<=.1+EPS,'Pole angle wrap must not bypass rate bound');plane+=step.angle;
  }
}
// Property grid: actual paths, not just legal endpoint tests. requiredStep is
// independently checked against the analytic distance to a circular interval.
for(let ci=-12;ci<=12;ci++)for(let ti=-12;ti<=12;ti++)for(const halfWidth of [0,.05,.5,1.5,Math.PI])for(const maxStep of [0,.01,.2,1,4]){
  const center=ci*Math.PI/12,target=ti*Math.PI/12,input={center,halfWidth,target,maxStep},result=StepElbowArc(input);
  const required=Math.max(0,Math.abs(Wrap(center))-halfWidth);
  Check(Number.isFinite(result.angle)&&Inside(result.angle,center,halfWidth),'Returned endpoint is outside hard arc');
  Check(Math.abs(result.requiredStep-required)<EPS,'Wrong minimum required hard-arc correction');
  Check(result.feasible===!result.overspeed,'Feasibility must explicitly expose overspeed fallback');
  if(result.feasible){
    Check(Math.abs(result.angle)<=maxStep+EPS,'Feasible step exceeds rate bound');
    if(Inside(0,center,halfWidth))for(let i=0;i<=8;i++)Check(Inside(result.angle*i/8,center,halfWidth),'Valid start took a shortcut through forbidden arc');
  }else{
    Check(result.requiredStep>maxStep-EPS,'Feasible speed interval was incorrectly rejected');
    Check(Math.abs(Math.abs(result.angle)-required)<EPS,'Infeasible return was not the nearest hard-legal point');
  }
  assert.deepEqual(StepElbowArc(input),result,'Scalar stepping must be deterministic');checks++;
}
for(const input of [{center:NaN,halfWidth:1,target:0,maxStep:1},{center:0,halfWidth:-.1,target:0,maxStep:1},
  {center:0,halfWidth:Math.PI+.1,target:0,maxStep:1},{center:0,halfWidth:1,target:Infinity,maxStep:1},{center:0,halfWidth:1,target:0,maxStep:-1}]){
  assert.throws(()=>StepElbowArc(input));checks++;
}
console.log(`ok elbow feasible-arc stepping: ${checks} checks; +/-pi continuity, legal paths, speed caps, deterministic goals and explicit infeasible hard corrections`);
