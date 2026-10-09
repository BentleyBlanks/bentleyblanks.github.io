import {BATTLE_SMOKE_QUALITY,BATTLE_SMOKE_STYLES,BATTLE_SMOKE_ROOT} from './Data_Tuning_BattleSmoke.mjs';

const Mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
// Authored placements remain unchanged. The former wrapped shader animation is
// now an emission/lifetime/velocity/size/color preset, owned by ParticleSystem.
export function BattleSmokeModules(source,quality='high'){
 const p=source.backdrop;if(!p)return [];
 const q=BATTLE_SMOKE_QUALITY[quality]||BATTLE_SMOKE_QUALITY.high,style=BATTLE_SMOKE_STYLES[p.frame]||BATTLE_SMOKE_STYLES[0];
 const cycle=Math.max(1,Math.round(p.life*60)/60),burst=p.frame===5,life=burst?cycle*.62:cycle;
 const width=p.crownWidth*.5,baseRatio=Math.min(1,p.baseWidth/p.crownWidth),exponent=p.plume?.[0]||1.3;
 const velocity=axis=>[0,.08,.25,.5,.75,1].map(t=>[t,(axis==='y'?p.height:axis==='x'?p.driftX:p.driftZ)/life*(axis==='y'?1:exponent*Math.pow(t,exponent-1))]);
 const rootTint=style.tint.map(n=>n*(1-(p.plume?.[2]||0))),endTint=p.plume?Mix(style.tint,[.3,.295,.285],.65):style.tint;
 const modules={
   main:{duration:cycle,loop:true,prewarm:true,startLifetime:life,startSpeed:0,startSize:{mode:'twoConstants',min:width*.78,max:width*1.18},
     startColor:[1,1,1,Math.min(1,p.opacity*q.opacity)],maxParticles:q.lobes+3,randomSeed:p.seed>>>0},
   emission:{rateOverTime:burst?0:q.lobes/life,bursts:burst?[{time:cycle*(1-(p.seed%4096)/4096),count:q.lobes}]:[]},
   shape:{type:'circle',radius:Math.max(.05,p.baseWidth*.24)},
   velocityOverLifetime:{enabled:true,x:velocity('x'),y:velocity('y'),z:velocity('z')},
   sizeOverLifetime:{enabled:true,curve:burst?[[0,baseRatio],[.2,.6],[.6,1],[1,1.12]]:[[0,baseRatio],[.18,.22],[.45,.65],[.75,1],[1,.9]]},
   colorOverLifetime:{enabled:true,gradient:[[0,[...rootTint,0]],[.07,[...rootTint,1]],[.55,[...Mix(rootTint,endTint,.45),1]],[1,[...endTint,0]]]},
   noise:{enabled:true,strength:[[0,Math.min(.1,width*.01)],[.5,width*.08],[1,width*.15]],frequency:Math.abs(style.motion[0])*5+.3,scrollSpeed:.55},
   renderer:{mode:'volume',aspect:p.aspect,softRange:.8,density:style.opticalDepth*5,nearFade:p.nearFade||3},
 };
 const result=[{name:'Plume/'+p.seed,preset:'BattleSmoke',position:[source.position.x,source.position.y,source.position.z],modules,
   phase:0}];
 if(p.ignition){
   const origin=source.firePosition?[source.firePosition.x,source.firePosition.y,source.firePosition.z]:p.ignition;
   const h=Math.max(BATTLE_SMOKE_ROOT.height,source.position.y-origin[1]+BATTLE_SMOKE_ROOT.height),r=BATTLE_SMOKE_ROOT;
   result.push({name:'SootRoot/'+p.seed,preset:'SootRoot',position:[...origin],modules:{
     main:{duration:r.life,prewarm:true,startLifetime:r.life,startSpeed:0,startSize:r.crownWidth*.5,maxParticles:r.lobes+2,randomSeed:(p.seed+7919)>>>0,startColor:[1,1,1,r.opacity]},
     emission:{rateOverTime:r.lobes/r.life},shape:{type:'circle',radius:r.baseWidth*.25},
     velocityOverLifetime:{enabled:true,x:(p.driftX||0)*.025/r.life,y:h/r.life,z:(p.driftZ||0)*.025/r.life},
     sizeOverLifetime:{curve:[[0,r.baseWidth/r.crownWidth],[.4,.6],[1,1]]},
     colorOverLifetime:{gradient:[[0,[.12,.065,.03,0]],[.08,[.08,.068,.05,1]],[.4,[.065,.061,.054,.85]],[1,[.16,.15,.13,0]]]},
     noise:{enabled:true,strength:[[0,.02],[1,.25]],frequency:1.1,scrollSpeed:.7},renderer:{mode:'volume',aspect:1.35,softRange:.35,density:8,nearFade:1.5},
   },phase:0});
 }
 return result;
}
